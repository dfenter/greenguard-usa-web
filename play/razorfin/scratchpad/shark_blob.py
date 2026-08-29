"""Median luminance of the shark BODY, masked to the largest connected
achromatic blob inside the rig bbox.

The plain achromatic test (shark_body.py) also admits pale desaturated WATER,
and the projected rig bbox is much taller than the animal when it pitches, so
that test's median drifts with how much empty water the box happens to cover.
Requiring 4-connectivity to the largest blob keeps only the animal.

Usage: python3 scratchpad/shark_blob.py IMG BOX [label]
"""
import sys, json
from collections import deque
from PIL import Image

img = Image.open(sys.argv[1]).convert('RGB')
box = json.load(open(sys.argv[2]))
label = sys.argv[3] if len(sys.argv) > 3 else ''
W, H = img.size; px = img.load(); sc = W / box['w']
x0 = max(0, int(box['x0']*sc)); x1 = min(W-1, int(box['x1']*sc))
y0 = max(0, int(box['y0']*sc)); y1 = min(H-1, int(box['y1']*sc))

def ach(c):
    mx, mn = max(c), min(c)
    return mx > 30 and (mx-mn)/mx <= 0.12

mask = set()
for y in range(y0, y1+1):
    for x in range(x0, x1+1):
        if ach(px[x, y]): mask.add((x, y))
best, seen = [], set()
for s in mask:
    if s in seen: continue
    comp, q = [], deque([s]); seen.add(s)
    while q:
        c = q.popleft(); comp.append(c)
        for d in ((1,0),(-1,0),(0,1),(0,-1)):
            n = (c[0]+d[0], c[1]+d[1])
            if n in mask and n not in seen: seen.add(n); q.append(n)
    if len(comp) > len(best): best = comp
if len(best) < 200:
    print(f'{label} TOO FEW ({len(best)})'); sys.exit(2)
lum = lambda c: (0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255.0
pts = [(y, lum(px[x, y])) for x, y in best]
ys = sorted(p[0] for p in pts); lo, hi = ys[len(ys)//3], ys[len(ys)*2//3]
med = lambda v: sorted(v)[len(v)//2]
d = med([l for y, l in pts if y <= lo]); b = med([l for y, l in pts if y >= hi])
a = sorted(l for _, l in pts); m = a[len(a)//2]
print(f'{label} N={len(pts)} medianL={m:.3f} p10={a[len(a)//10]:.3f} '
      f'p90={a[len(a)*9//10]:.3f} dorsal={d:.3f} belly={b:.3f} countershade={b-d:+.3f}')
print(f'{label} GATE L 0.40..0.55 -> {"PASS" if 0.40<=m<=0.55 else "FAIL"} | '
      f'countershade >=0.15 -> {"PASS" if (b-d)>=0.15 else "FAIL"}')
