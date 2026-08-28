"""Crop the head out of each rendered frame and assemble heads_after.png.

Split out of headcrops.mjs so the sheet can be rebuilt from existing frames
without re-rendering (a render pass is ~30 min; this is seconds).

The crop box is centred on the face/noface DIFFERENCE - the pixels the face
batch actually drew - so it frames the thing being judged. A HELD row draws no
such pixels and falls back to the forward end of its own silhouette, so it
still shows a head (its Rev 14 baked face) rather than an empty frame.
"""
import os, sys, json
from PIL import Image, ImageChops, ImageDraw

RAW = sys.argv[1]; OUT = sys.argv[2]; HERE = sys.argv[3]
IDS = sys.argv[4].split(','); SIDE = int(sys.argv[5])
WATER = (127, 179, 196); TOL = 10
# Rows texturedFaceGeometry declines to seat (seatConfidence < 0.10); they keep
# the Rev 14 baked face and draw no overlay.
HELD_IDS = {'megalodon', 'typhonmaw'}
os.makedirs(OUT, exist_ok=True)

def silhouette_extent(img):
    px = img.load(); xs = []; ys = []
    for y in range(0, img.height, 4):
        for x in range(0, img.width, 4):
            r, g, b = px[x, y]
            if abs(r-WATER[0]) > TOL or abs(g-WATER[1]) > TOL or abs(b-WATER[2]) > TOL:
                xs.append(x); ys.append(y)
    return (min(xs), max(xs), min(ys), max(ys)) if xs else None

meta = {}
for rid in IDS:
    for fv, nv, tag in (('face','noface','fwd'), ('flip','flipnoface','rev')):
        fp = os.path.join(RAW, f'{rid}_{fv}.png'); np_ = os.path.join(RAW, f'{rid}_{nv}.png')
        if not (os.path.exists(fp) and os.path.exists(np_)):
            continue
        f = Image.open(fp).convert('RGB'); n = Image.open(np_).convert('RGB')
        bb = ImageChops.difference(f, n).getbbox()
        held = bb is None
        # A diff far larger than a head means the pair is contaminated (the
        # template LRU bleeding between rows moves the BODY between the two
        # renders), not a face batch. A real face diff is ~60 px wide on a
        # 2200 px frame; megalodon came back 781 px while being a HELD row
        # that draws no overlay at all. 12% of frame width is a generous
        # ceiling for a head feature and well under any body-scale diff.
        if held or (bb[2]-bb[0]) > f.width * 0.12:
            ext = silhouette_extent(n)
            if not ext:
                continue
            x0, x1, y0, y1 = ext
            cx = x1 - (x1-x0)*0.12 if tag == 'fwd' else x0 + (x1-x0)*0.12
            cy = (y0 + y1) / 2
            # Either branch means "no trustworthy face diff", so the row is
            # labelled from the module's own decision rather than from the
            # pixels: HELD_IDS is what texturedFaceGeometry refused to seat.
            held = rid in HELD_IDS
        else:
            cx = (bb[0]+bb[2]) / 2; cy = (bb[1]+bb[3]) / 2
        h = SIDE // 2
        L = int(max(0, min(f.width - SIDE, cx - h)))
        T = int(max(0, min(f.height - SIDE, cy - h)))
        f.crop((L, T, L+SIDE, T+SIDE)).save(os.path.join(OUT, f'{rid}_{tag}.png'))
        meta[f'{rid}:{tag}'] = {'held': held, 'box': [L, T, SIDE, SIDE]}
json.dump(meta, open(os.path.join(OUT, 'crops.json'), 'w'), indent=1)

TW = SIDE
refp = os.path.join(HERE, 'ref', 'hse_roster_ref.jpg')
if os.path.exists(refp):
    ref = Image.open(refp).convert('RGB'); rw, rh = ref.size
    ref = ref.crop((int(rw*0.30), 0, int(rw*0.30)+rh, rh)).resize((TW, TW))
else:
    ref = Image.new('RGB', (TW, TW), (28, 30, 34))

rows = [i for i in IDS if os.path.exists(os.path.join(OUT, f'{i}_fwd.png'))]
img = Image.new('RGB', (TW*3, TW*len(rows) + 34), (16, 18, 22))
d = ImageDraw.Draw(img)
d.text((8, 10), 'Razorfin r15 FACE - head crops @ %d px   |   left: forward   '
                'middle: reversed   right: HSE reference' % TW, fill=(238, 238, 238))
for i, rid in enumerate(rows):
    y = 34 + i*TW
    for j, tag in enumerate(['fwd', 'rev']):
        p = os.path.join(OUT, f'{rid}_{tag}.png')
        if os.path.exists(p):
            img.paste(Image.open(p).convert('RGB'), (j*TW, y))
    img.paste(ref, (2*TW, y))
    d.text((10, y+8), rid, fill=(255, 238, 120))
    if meta.get(f'{rid}:fwd', {}).get('held'):
        d.text((10, y+26), 'HELD - Rev 14 baked face', fill=(255, 190, 120))
out = os.path.join(HERE, 'heads_after.png')
img.save(out)
print('wrote', out, img.size, 'rows:', len(rows))
