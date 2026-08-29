"""Report the player shark's median luminance over its own screen-space bbox.

The bbox comes from projecting the rig's geometry through the live camera
(scratchpad/shark_lum.mjs), so no frozen world and no colour heuristic is
needed. Inside the bbox, background pixels are excluded by comparing each
pixel against the bbox's own border ring (which is water by construction):
a pixel within a small distance of the local water colour is not shark.

Usage: python3 scratchpad/shark_measure.py /tmp/rf_a.png /tmp/rf_box.json [label]
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

# The page reports CSS px; the screenshot is deviceScaleFactor times that.
sc = W / box['w']
x0 = max(0, int(box['x0'] * sc)); x1 = min(W - 1, int(box['x1'] * sc))
y0 = max(0, int(box['y0'] * sc)); y1 = min(H - 1, int(box['y1'] * sc))
if x1 <= x0 or y1 <= y0:
    print(f'{label} BBOX OFFSCREEN {x0},{y0},{x1},{y1}'); sys.exit(2)

def lum(c):
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255.0

# Local water reference: the ring just OUTSIDE the bbox.
ring = []
for x in range(x0, x1 + 1, 3):
    for y in (max(0, y0 - 6), min(H - 1, y1 + 6)):
        ring.append(px[x, y])
for y in range(y0, y1 + 1, 3):
    for x in (max(0, x0 - 6), min(W - 1, x1 + 6)):
        ring.append(px[x, y])
if not ring:
    print(f'{label} NO RING'); sys.exit(2)
wr = sum(c[0] for c in ring) / len(ring)
wg = sum(c[1] for c in ring) / len(ring)
wb = sum(c[2] for c in ring) / len(ring)

shark = []
for y in range(y0, y1 + 1):
    for x in range(x0, x1 + 1):
        c = px[x, y]
        # Not shark if it matches the surrounding water closely.
        if abs(c[0]-wr) + abs(c[1]-wg) + abs(c[2]-wb) < 42:
            continue
        shark.append((lum(c), c))

if len(shark) < 200:
    print(f'{label} TOO FEW SHARK PX ({len(shark)})'); sys.exit(2)

shark.sort(key=lambda t: t[0])
sl = [t[0] for t in shark]
med = sl[len(sl)//2]
p10, p90 = sl[len(sl)//10], sl[len(sl)*9//10]
mid = shark[len(shark)//2][1]
hot = sum(1 for v in sl if v > 0.8) / len(sl)
wl = lum((wr, wg, wb))
print(f'{label} n={len(shark)} medianL={med:.3f} p10={p10:.3f} p90={p90:.3f} '
      f'midRGB={mid} >0.8={hot*100:.1f}%  waterL={wl:.3f} '
      f'ratio={med/wl if wl else 0:.2f}')
v = 'PASS' if 0.35 <= med <= 0.6 else ('TOO BRIGHT' if med > 0.6 else 'TOO DARK')
print(f'{label} GATE 0.35..0.60 -> {v}')
