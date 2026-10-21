import os, re
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONT = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Windows\Fonts\The Soul Of Vodka.ttf")
f = TTFont(FONT)
upem = f["head"].unitsPerEm
cmap = f.getBestCmap()
gs = f.getGlyphSet()
hmtx = f["hmtx"]

NUM = re.compile(r"-?\d+\.\d+")

def rnd(d, dp=2):
    return NUM.sub(lambda m: ("%.*f" % (dp, float(m.group(0)))).rstrip("0").rstrip("."), d)

def text_path(text, x, y, size=140.0, ls=0.0):
    s = size / upem
    out, cx = [], x
    for ch in text:
        gname = cmap.get(ord(ch))
        if gname is None:
            cx += size * 0.3 + ls
            continue
        spen = SVGPathPen(gs)
        gs[gname].draw(TransformPen(spen, (s, 0, 0, -s, cx, y)))
        d = spen.getCommands()
        if d:
            out.append(rnd(d))
        cx += hmtx[gname][0] * s + ls
    return out

d1 = text_path("CRAFTERS", 0.0, 106.299, 140.0, 2.8)
d2 = text_path("GALLERY", 4.705, 222.022, 140.0, 0.0)

src = open("CGLOGO.svg", encoding="utf-8").read()
mark = re.findall(r'<path d="[^"]+"[^>]*/>', src)

lines = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<svg xmlns="http://www.w3.org/2000/svg" viewBox="3.7 0 453.7 223.7" role="img" aria-label="Crafter\'s Gallery">',
         '<g fill="#ffffff">']
lines += ['  <path d="%s"/>' % d for d in d1 + d2]
lines += ["  " + p for p in mark]
lines += ['</g>', '</svg>', '']

out = "\n".join(lines)
open("icons/cg.svg", "w", encoding="utf-8").write(out)
print("wrote icons/cg.svg %d bytes, %d glyph paths + %d mark paths" % (len(out), len(d1 + d2), len(mark)))
