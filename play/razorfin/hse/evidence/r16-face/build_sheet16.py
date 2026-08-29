"""r16 heads sheet: 4 bakes x 2 directions x 2 gapes, cropped to the head.

Same crop rule as r15's build_sheet.py - the box is centred on the face/noface
DIFFERENCE, i.e. the pixels the batch actually drew, so the frame shows the
thing being judged rather than a guess at where the head is. What is new is the
gape axis: each row of the sheet is one bake, and the four columns are
forward/reversed at gape 0 and at gape 0.35, so the mouth can be judged shut
and open side by side.

Usage: python3 build_sheet16.py <raw-dir> <out.png> [side]
"""
import os, sys, json
from PIL import Image, ImageChops, ImageDraw

RAW = sys.argv[1]
OUT = sys.argv[2]
SIDE = int(sys.argv[3]) if len(sys.argv) > 3 else 380
WATER = (127, 179, 196); TOL = 10

# One representative row per bake, and which bake it exercises.
ROWS = [('greatwhite', 'greatwhite_cy'), ('thresher', 'thresher'),
        ('tiger', 'tigershark'), ('hammerhead', 'whaler')]
COLS = [('face', 'noface', '0', 'fwd gape0'), ('flip', 'flipnoface', '0', 'rev gape0'),
        ('face', 'noface', '0.35', 'fwd gape0.35'), ('flip', 'flipnoface', '0.35', 'rev gape0.35')]

def silhouette_extent(img):
    px = img.load(); xs = []; ys = []
    for y in range(0, img.height, 4):
        for x in range(0, img.width, 4):
            r, g, b = px[x, y]
            if abs(r-WATER[0]) > TOL or abs(g-WATER[1]) > TOL or abs(b-WATER[2]) > TOL:
                xs.append(x); ys.append(y)
    return (min(xs), max(xs), min(ys), max(ys)) if xs else None

def crop(rid, fv, nv, g, fwd):
    fp = os.path.join(RAW, f'{rid}_{fv}@{g}.png')
    np_ = os.path.join(RAW, f'{rid}_{nv}@{g}.png')
    if not (os.path.exists(fp) and os.path.exists(np_)):
        return None, 'missing'
    f = Image.open(fp).convert('RGB'); n = Image.open(np_).convert('RGB')
    bb = ImageChops.difference(f, n).getbbox()
    note = ''
    # A diff far wider than a head means the pair is contaminated rather than
    # a face batch; fall back to framing the snout end of the silhouette.
    if bb is None or (bb[2]-bb[0]) > f.width * 0.12:
        ext = silhouette_extent(n)
        if not ext:
            return None, 'empty'
        x0, x1, y0, y1 = ext
        cx = x1 - (x1-x0)*0.12 if fwd else x0 + (x1-x0)*0.12
        cy = (y0 + y1) / 2
        note = 'no diff' if bb is None else 'wide diff'
    else:
        cx = (bb[0]+bb[2]) / 2; cy = (bb[1]+bb[3]) / 2
    h = SIDE // 2
    L = int(max(0, min(f.width - SIDE, cx - h)))
    T = int(max(0, min(f.height - SIDE, cy - h)))
    return f.crop((L, T, L+SIDE, T+SIDE)), note

HDR, LBL = 40, 20
img = Image.new('RGB', (SIDE*len(COLS), HDR + (SIDE+LBL)*len(ROWS)), (16, 18, 22))
d = ImageDraw.Draw(img)
d.text((8, 12), 'Razorfin r16 FACE - 4 bakes x 2 directions x 2 gapes, head crops @ %d px' % SIDE,
       fill=(238, 238, 238))
for r, (rid, bake) in enumerate(ROWS):
    y = HDR + r*(SIDE+LBL)
    d.text((8, y + 4), f'{rid}  ({bake})', fill=(150, 210, 255))
    for c, (fv, nv, g, label) in enumerate(COLS):
        im, note = crop(rid, fv, nv, g, fv == 'face')
        x = c*SIDE
        if im is None:
            d.text((x + 12, y + LBL + 20), f'{label}: {note}', fill=(220, 120, 120))
            continue
        img.paste(im, (x, y + LBL))
        d.text((x + 6, y + 4), label + (f'  [{note}]' if note else ''), fill=(210, 210, 210))
img.save(OUT)
print('wrote', OUT, img.size)
