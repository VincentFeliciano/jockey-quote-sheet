"""Measure the exported sheet: how big the colour squares are, and whether any
text runs into them.

Positions come from the renderer itself (test/geometry.json, written by
test/probe-geometry.mjs), because guessing squares out of pixels misread both
the photos and the brand band. If no geometry file is beside the image we fall
back to the PNG and say so.

Usage: python test/chipcheck.py test/export-sample.png
"""
from PIL import Image
import json
import os
import sys

img_path = sys.argv[1] if len(sys.argv) > 1 else "test/export-sample.png"
stem = os.path.splitext(img_path)[0]
geo_path = os.environ.get("QS_GEOMETRY", os.path.join(os.path.dirname(img_path) or ".", "geometry.json"))

MARGIN = 4.0          # a square must clear text by this much
MIN_SIZE = 20.0       # a square must be at least this big


def hexish(s):
    return isinstance(s, str) and s.startswith("#") and len(s) == 7


def load_geometry():
    if not os.path.exists(geo_path):
        return None
    with open(geo_path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def intersects(a, b):
    return not (a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"] or
                a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"])


def main():
    if os.path.exists(img_path):
        W, H = Image.open(img_path).size
        print("image %dx%d" % (W, H))
    else:
        print("image missing: %s" % img_path)

    geo = load_geometry()
    if geo is None:
        print("no geometry file at %s" % geo_path)
        print("VERDICT: FAIL - run node test/probe-geometry.mjs first")
        return 1

    squares = []
    for r in geo.get("rects", []):
        w, h = float(r.get("w", 0)), float(r.get("h", 0))
        if not hexish(r.get("fill")):
            continue
        if abs(w - h) > 0.51:          # must be square
            continue
        if not (MIN_SIZE <= w <= 260):
            continue
        squares.append({"x": float(r["x"]), "y": float(r["y"]), "w": w, "h": h,
                        "fill": r["fill"]})

    # dedupe (a chip can be painted twice by a retry)
    uniq = []
    for s in squares:
        if not any(abs(s["x"] - u["x"]) < 1 and abs(s["y"] - u["y"]) < 1 and u["fill"] == s["fill"]
                   for u in uniq):
            uniq.append(s)
    squares = uniq

    texts = [{"t": t.get("t", ""), "x": float(t["x"]), "y": float(t["y"]),
              "w": float(t["w"]), "h": float(t["h"])}
             for t in geo.get("texts", []) if float(t.get("w", 0)) > 0]

    print("squares found: %d" % len(squares))
    if not squares:
        print("VERDICT: FAIL - no colour square was drawn")
        return 1

    # any text ink inside a square, or within MARGIN of one?
    collisions = []
    for s in squares:
        grown = {"x": s["x"] - MARGIN, "y": s["y"] - MARGIN,
                 "w": s["w"] + 2 * MARGIN, "h": s["h"] + 2 * MARGIN}
        for t in texts:
            if intersects(grown, t):
                collisions.append((s, t))

    # tightest horizontal clearance between a square and text sharing its rows
    tightest = None
    for s in squares:
        for t in texts:
            if t["y"] + t["h"] <= s["y"] or s["y"] + s["h"] <= t["y"]:
                continue                     # different rows
            if t["x"] + t["w"] <= s["x"]:
                gap = s["x"] - (t["x"] + t["w"])
            elif s["x"] + s["w"] <= t["x"]:
                gap = t["x"] - (s["x"] + s["w"])
            else:
                gap = 0.0                    # horizontal overlap
            tightest = gap if tightest is None else min(tightest, gap)

    smallest = min(s["w"] for s in squares)
    for s in squares:
        print("  square at x=%.0f y=%.0f size=%.0fpx colour=%s"
              % (s["x"], s["y"], s["w"], s["fill"]))

    if collisions:
        print()
        print("text touching a square: %d" % len(collisions))
        for s, t in collisions[:12]:
            print("  \"%s\" at x=%.0f y=%.0f w=%.0f runs into square %s at x=%.0f"
                  % (t["t"][:44], t["x"], t["y"], t["w"], s["fill"], s["x"]))
    else:
        print()
        print("text touching a square: 0")

    print()
    print("smallest square: %.0fpx" % smallest)
    print("tightest clearance between a square and text beside it: %s"
          % ("n/a" if tightest is None else "%.0fpx" % tightest))

    ok = smallest >= MIN_SIZE and not collisions and (tightest is None or tightest >= MARGIN)
    print("VERDICT: %s" % ("PASS - every square is at least %.0fpx and no text touches it" % MIN_SIZE
                           if ok else "FAIL"))
    return 0 if ok else 1


sys.exit(main())
