#!/usr/bin/env python3
"""Crop each 12-frame bite strip to the shark's HEAD and lay it out as one
contact sheet per row, labelled with the jaw angle and cycle phase.

At the game's own camera distance the shark is a few dozen pixels wide in a
900x520 frame, so an uncropped strip is technically a picture of the jaw and
practically unreadable. jaw_strip.mjs reports the shark's projected screen box
per frame; this crops a head-sized window off the leading end of it.
"""
import json, os, sys
from PIL import Image, ImageDraw

d = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
strips = json.load(open(os.path.join(d, 'strips.json')))
CELL = 220          # output cell size
COLS = 6

for shark, frames in strips.items():
    sd = os.path.join(d, 'strip_%s' % shark)
    if not os.path.isdir(sd):
        continue
    cells = []
    for i, fr in enumerate(frames):
        p = os.path.join(sd, 'f%02d.png' % i)
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGB')
        sx = im.width / 900.0          # screenshots are deviceScaleFactor'd
        sy = im.height / 520.0
        box = fr.get('box')
        if box:
            x0, x1 = box['x0'] * sx, box['x1'] * sx
            y0, y1 = box['y0'] * sy, box['y1'] * sy
            cx = x1 if box.get('faceRight') else x0     # the HEAD end
            cy = (y0 + y1) / 2
            half = max(60.0, (x1 - x0) * 0.34)          # head window
        else:
            cx, cy, half = im.width / 2, im.height / 2, 140
        L = int(max(0, min(im.width - 2 * half, cx - half)))
        T = int(max(0, min(im.height - 2 * half, cy - half)))
        crop = im.crop((L, T, int(L + 2 * half), int(T + 2 * half))).resize((CELL, CELL), Image.LANCZOS)
        dr = ImageDraw.Draw(crop)
        label = '%d  %s  %sdeg' % (i, (fr.get('phase') or 'idle'), fr.get('deg'))
        dr.rectangle([0, CELL - 18, CELL, CELL], fill=(0, 0, 0))
        dr.text((4, CELL - 15), label, fill=(255, 255, 255))
        cells.append(crop)
    if not cells:
        continue
    rows = (len(cells) + COLS - 1) // COLS
    sheet = Image.new('RGB', (COLS * CELL, rows * CELL), (16, 16, 20))
    for i, c in enumerate(cells):
        sheet.paste(c, ((i % COLS) * CELL, (i // COLS) * CELL))
    out = os.path.join(d, 'strip_%s.png' % shark)
    sheet.save(out)
    print('wrote', out, len(cells), 'frames')
