"""Eyes on the exported sheet without a vision model.

Renders a page of test/export-sample.png as coarse ASCII so the layout can be
read directly, and reports where the ink sits: section bands, colour swatches,
the yellow accent.  Run:  python test/ascii-export.py [page]
"""
import sys
from PIL import Image

SRC = 'test/export-sample.png'
W, H = 1240, 1754
COLS = 108

RAMP = ' .:-=+*#%@'


def lum(px):
    return (px[0] * 299 + px[1] * 587 + px[2] * 114) // 1000


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    page = int(args[0]) if args else 1
    cols = 108
    for a in sys.argv[1:]:
        if a.startswith('--cols='):
            cols = int(a.split('=')[1])
    im = Image.open(SRC).convert('RGB')
    total = max(1, im.height // H)
    if page < 1 or page > total:
        print('page must be 1..%d (this file has %d)' % (total, total))
        return 1

    box = (0, (page - 1) * H, W, page * H)
    pg = im.crop(box)
    pg.save('test/export-page%d.png' % page)

    print('page %d of %d   %dx%d' % (page, total, pg.width, pg.height))

    # coarse ascii: each cell is a block of pixels, darkest pixel wins so thin
    # text is not averaged away
    small = pg.resize((cols, int(cols * 0.54)), Image.LANCZOS)
    px = small.load()
    for y in range(small.height):
        line = ''
        for x in range(cols):
            d = 255 - lum(px[x, y])
            line += RAMP[min(len(RAMP) - 1, d * len(RAMP) // 190)]
        print(line.rstrip())

    # ink profile: how much of each 20px band carries content
    src = pg.load()
    print('\nband  ink%  first-x  last-x  notes')
    for top in range(0, H, 20):
        ink = 0
        first = last = None
        yellow = 0
        for y in range(top, min(top + 20, H), 4):
            for x in range(0, W, 4):
                p = src[x, y]
                if lum(p) < 225:
                    ink += 1
                    if first is None:
                        first = x
                    last = x
                    if p[0] > 225 and p[1] > 185 and p[2] < 100:
                        yellow += 1
        pct = 100 * ink / (W // 4 * 5)
        if ink:
            note = 'yellow' if yellow > 6 else ''
            print('%4d  %4.1f  %6s  %6s  %s' % (top, pct, first, last, note))
    return 0


if __name__ == '__main__':
    sys.exit(main())
