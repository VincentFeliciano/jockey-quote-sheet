import sys
from PIL import Image

path = sys.argv[1]
w = int(sys.argv[2]) if len(sys.argv) > 2 else 110
thr = int(sys.argv[3]) if len(sys.argv) > 3 else 24
im = Image.open(path).convert("L")
if len(sys.argv) > 7:
    im = im.crop(tuple(int(v) for v in sys.argv[4:8]))
mask = im.point(lambda p: 255 if p > thr else 0)
b = mask.getbbox()
if b:
    im = im.crop(b)
print("size", im.size)
ratio = im.size[1] / im.size[0]
h = max(1, int(w * ratio * 0.5))
sm = im.resize((w, h), Image.LANCZOS)
px = sm.load()
ramp = " .:-=+*#%@"
for y in range(h):
    print("".join(ramp[min(len(ramp) - 1, px[x, y] * len(ramp) // 256)] for x in range(w)).rstrip())
