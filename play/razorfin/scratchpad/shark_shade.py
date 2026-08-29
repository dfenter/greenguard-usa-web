"""Dorsal vs belly median L for the shark body, plus overall median.

Splits the achromatic body mask by vertical position WITHIN the mask (top
third = dorsal, bottom third = belly) so the countershade can be measured
without knowing the rig axis.
Usage: python3 scratchpad/shark_shade.py /tmp/rf_a.png /tmp/rf_box.json [label]
"""
import sys, json
from PIL import Image
img = Image.open(sys.argv[1]).convert('RGB')
box = json.load(open(sys.argv[2]))
label = sys.argv[3] if len(sys.argv) > 3 else ''
W, H = img.size; px = img.load()
sc = W / box['w']
x0 = max(0, int(box['x0']*sc)); x1 = min(W-1, int(box['x1']*sc))
y0 = max(0, int(box['y0']*sc)); y1 = min(H-1, int(box['y1']*sc))
def lum(c): return (0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255.0
pts = []
for y in range(y0, y1+1):
    for x in range(x0, x1+1):
        c = px[x, y]; mx, mn = max(c), min(c)
        if mx and (mx-mn)/mx <= 0.12 and mx > 30: pts.append((y, lum(c)))
if len(pts) < 200:
    print(f'{label} TOO FEW ({len(pts)})'); sys.exit(2)
ys = sorted(p[0] for p in pts)
lo, hi = ys[len(ys)//3], ys[len(ys)*2//3]
dors = sorted(l for y,l in pts if y <= lo)
bell = sorted(l for y,l in pts if y >= hi)
alll = sorted(l for _,l in pts)
med = lambda a: a[len(a)//2]
d, b, m = med(dors), med(bell), med(alll)
print(f'{label} N={len(pts)} medianL={m:.3f} dorsal={d:.3f} belly={b:.3f} '
      f'countershade={b-d:+.3f}')
ok_l = 0.40 <= m <= 0.55
ok_c = (b-d) >= 0.15
print(f'{label} GATE L 0.40..0.55 -> {"PASS" if ok_l else "FAIL"} | '
      f'countershade >=0.15 -> {"PASS" if ok_c else "FAIL"}')
