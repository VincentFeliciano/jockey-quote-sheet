import sys
from PIL import Image

png = sys.argv[1]
dsf = 2.0
im = Image.open(png).convert("RGB")
print("image", im.size)

boxes = {
    "plymr": (14, 16, 83, 40),
    "for":   (92, 23, 108, 34),
    "cg":    (117, 14, 174, 42),
    "bar":   (0, 0, 390, 57),
}

def near_yellow(p):
    r, g, b = p
    return r > 180 and g > 140 and b < 110

def near_white(p):
    r, g, b = p
    return r > 170 and g > 170 and b > 170

for name, (x0, y0, x1, y1) in boxes.items():
    reg = im.crop((int(x0 * dsf), int(y0 * dsf), int(x1 * dsf), int(y1 * dsf)))
    px = list(reg.getdata())
    yel = sum(1 for p in px if near_yellow(p))
    wht = sum(1 for p in px if near_white(p))
    lit = sum(1 for p in px if max(p) > 60)
    print("%-6s px=%5d lit=%5d yellow=%5d white=%5d" % (name, len(px), lit, yel, wht))

# brightest yellow sample inside the PLYMR box, to confirm the exact dye
reg = im.crop((int(14 * dsf), int(16 * dsf), int(83 * dsf), int(40 * dsf)))
best = max(reg.getdata(), key=lambda p: p[0] + p[1] - 2 * p[2])
print("plymr brightest yellow-ish:", best)
reg = im.crop((int(117 * dsf), int(14 * dsf), int(174 * dsf), int(42 * dsf)))
best = max(reg.getdata(), key=lambda p: sum(p))
print("cg brightest:", best)
