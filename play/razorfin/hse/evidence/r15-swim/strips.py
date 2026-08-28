#!/usr/bin/env python3
"""Rev 15 lane SWIM: contact strips, 12 frames per row.

One row per (shark, drive). Reads hse/evidence/r15-swim/shots/<id>_<drive>/.
"""
import os, sys, glob
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')
ROWS = ['reef', 'greatwhite', 'mako', 'tiger', 'hammerhead', 'leviathanrex']
DRIVES = ['straight', 'turn']
TW = 220            # thumb width
LABEL = 132

def strip(paths, w=TW):
    ims = []
    for p in paths:
        im = Image.open(p).convert('RGB')
        h = int(im.height * w / im.width)
        ims.append(im.resize((w, h), Image.LANCZOS))
    if not ims:
        return None
    h = ims[0].height
    out = Image.new('RGB', (w * len(ims), h), (14, 18, 24))
    for i, im in enumerate(ims):
        out.paste(im, (i * w, 0))
    return out

rows = []
for rid in ROWS:
    for d in DRIVES:
        dirp = os.path.join(SHOTS, f'{rid}_{d}')
        ps = sorted(glob.glob(os.path.join(dirp, 'f*.png')))[:12]
        if not ps:
            continue
        s = strip(ps)
        if s:
            rows.append((f'{rid}  ({d})', s))

if not rows:
    sys.exit('no frames found under ' + SHOTS)

W = LABEL + max(s.width for _, s in rows)
H = sum(s.height for _, s in rows) + 8 * len(rows)
sheet = Image.new('RGB', (W, H), (10, 13, 18))
dr = ImageDraw.Draw(sheet)
y = 0
for label, s in rows:
    sheet.paste(s, (LABEL, y))
    dr.text((8, y + s.height // 2 - 6), label, fill=(226, 236, 245))
    y += s.height + 8

out = os.path.join(HERE, 'contact_sheet.png')
sheet.save(out)
print('wrote', out, sheet.size, f'({len(rows)} rows)')
