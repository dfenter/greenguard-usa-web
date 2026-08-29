"""Median luminance of the shark BODY only.

The bbox is mostly background (a shark is a thin diagonal in a wide box), and
the reef behind it is not a single water colour, so a "differs from the border
ring" test leaks scenery. The shark is the one thing in frame that is
essentially ACHROMATIC (grey/white skin) while every background layer here --
water, coral, rock -- carries strong chroma. So: inside the bbox, take pixels
whose max-min channel spread is small, i.e. actually grey.

Usage: python3 scratchpad/shark_body.py /tmp/rf_a.png /tmp/rf_box.json [label]
"""
import sys, json
from PIL import Image

img = Image.open(sys.argv[1]).convert('RGB')
box = json.load(open(sys.argv[2]))
label = sys.argv[3] if len(sys.argv) > 3 else ''
W, H = img.size
px = img.load()
if not box or 'x0' not in box:
    print(f'{label} NO BBOX'); sys.exit(2)

sc = W / box['w']
x0 = max(0, int(box['x0'] * sc)); x1 = min(W - 1, int(box['x1'] * sc))
y0 = max(0, int(box['y0'] * sc)); y1 = min(H - 1, int(box['y1'] * sc))

def lum(c):
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255.0

body = []
for y in range(y0, y1 + 1):
    for x in range(x0, x1 + 1):
        c = px[x, y]
        mx, mn = max(c), min(c)
        sat = (mx - mn) / mx if mx else 0
        if sat <= 0.12 and mx > 30:      # achromatic == shark skin
            body.append((lum(c), c))

if len(body) < 200:
    print(f'{label} TOO FEW BODY PX ({len(body)})'); sys.exit(2)

body.sort(key=lambda t: t[0])
bl = [t[0] for t in body]
med = bl[len(bl)//2]
p10, p90 = bl[len(bl)//10], bl[len(bl)*9//10]
mid = body[len(body)//2][1]
hot = sum(1 for v in bl if v > 0.8) / len(bl)
print(f'{label} bodyN={len(body)} medianL={med:.3f} p10={p10:.3f} p90={p90:.3f} '
      f'midRGB={mid} >0.8={hot*100:.1f}%')
v = 'PASS' if 0.35 <= med <= 0.6 else ('TOO BRIGHT' if med > 0.6 else 'TOO DARK')
print(f'{label} GATE 0.35..0.60 -> {v}')
