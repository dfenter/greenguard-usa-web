#!/usr/bin/env python3
"""Lane S3 (rev17): owner review sheet builder.

Composes assets/review/<family>_turntable.png files (one per family, emitted
by tools/shark_variant.py's finish step per PLAN-rev17-families.md) plus any
S1/L1/L2 lane review PNGs found under hse/ into one labelled sheet for owner
approval before a family is wired into the game.

Nothing under assets/review/ or a lane review PNG exists yet as of this run
(rev17 pipeline has not produced a family turntable; S1/L1/L2 lanes have not
dropped review PNGs). This script is written to run against whatever it
finds -- zero, one, or many -- and reports exactly what it found rather than
failing on an empty input set, so it is ready the moment tools/shark_variant.py
starts emitting turntables.

Usage:
  python3 hse/review_sheet.py                       # default paths, default out
  python3 hse/review_sheet.py --out /tmp/sheet.png
  python3 hse/review_sheet.py --review-dir assets/review --extra hse/foo.png
"""
import argparse
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

CELL_W, CELL_H = 420, 300
LABEL_H = 28
PAD = 6
COLS = 3


def find_font(size):
    for candidate in (
        '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
    ):
        if os.path.exists(candidate):
            try:
                return ImageFont.truetype(candidate, size)
            except Exception:
                pass
    return ImageFont.load_default()


def collect_images(review_dir, extra):
    """Returns a list of (label, path) tuples: family turntables first
    (sorted by family name), then any lane review PNGs (S1/L1/L2), then any
    --extra paths given explicitly."""
    items = []

    turntables = sorted(glob.glob(os.path.join(review_dir, '*_turntable.png')))
    for p in turntables:
        base = os.path.basename(p)
        family = base[:-len('_turntable.png')] if base.endswith('_turntable.png') else base
        items.append(('family: ' + family, p))

    # S1/L1/L2 lane review PNGs: look for the conventional names under hse/
    # and hse/evidence*/ without assuming any exist yet.
    lane_globs = [
        os.path.join(HERE, '*S1*review*.png'),
        os.path.join(HERE, '*L1*review*.png'),
        os.path.join(HERE, '*L2*review*.png'),
        os.path.join(HERE, 'evidence*', '*S1*.png'),
        os.path.join(HERE, 'evidence*', '*L1*.png'),
        os.path.join(HERE, 'evidence*', '*L2*.png'),
    ]
    seen = set(p for _, p in items)
    for g in lane_globs:
        for p in sorted(glob.glob(g)):
            if p in seen:
                continue
            seen.add(p)
            items.append(('lane: ' + os.path.basename(p), p))

    for p in extra or []:
        if not os.path.exists(p):
            print('WARN: --extra path does not exist, skipping: %s' % p, file=sys.stderr)
            continue
        if p in seen:
            continue
        seen.add(p)
        items.append(('extra: ' + os.path.basename(p), p))

    return items


def build_sheet(items, out_path):
    font = find_font(16)
    title_font = find_font(22)

    if not items:
        # Still emit a sheet so the harness output is inspectable and the
        # "ran but found nothing yet" state is visible, not silently absent.
        img = Image.new('RGB', (900, 200), (24, 24, 28))
        dr = ImageDraw.Draw(img)
        dr.text((20, 20), 'rev17 review sheet', fill=(255, 255, 255), font=title_font)
        dr.text((20, 60), 'No assets/review/*_turntable.png and no S1/L1/L2', fill=(220, 220, 220), font=font)
        dr.text((20, 84), 'lane review PNGs found yet. Nothing to compose.', fill=(220, 220, 220), font=font)
        dr.text((20, 108), 'Re-run once tools/shark_variant.py emits turntables.', fill=(180, 180, 190), font=font)
        img.save(out_path)
        return 0

    n = len(items)
    rows = (n + COLS - 1) // COLS
    sheet_w = COLS * (CELL_W + PAD) + PAD
    sheet_h = 60 + rows * (CELL_H + LABEL_H + PAD) + PAD
    sheet = Image.new('RGB', (sheet_w, sheet_h), (24, 24, 28))
    dr = ImageDraw.Draw(sheet)
    dr.text((PAD, 14), 'rev17 family review sheet (%d image%s)' % (n, '' if n == 1 else 's'),
             fill=(255, 255, 255), font=title_font)

    for i, (label, path) in enumerate(items):
        col, row = i % COLS, i // COLS
        x0 = PAD + col * (CELL_W + PAD)
        y0 = 60 + row * (CELL_H + LABEL_H + PAD)
        try:
            im = Image.open(path).convert('RGB')
            im.thumbnail((CELL_W, CELL_H), Image.LANCZOS)
        except Exception as e:
            im = Image.new('RGB', (CELL_W, CELL_H), (60, 20, 20))
            ed = ImageDraw.Draw(im)
            ed.text((10, 10), 'FAILED TO LOAD:\n%s' % e, fill=(255, 200, 200), font=font)
        ox = x0 + (CELL_W - im.width) // 2
        oy = y0 + (CELL_H - im.height) // 2
        sheet.paste(im, (ox, oy))
        dr.rectangle([x0, y0 + CELL_H, x0 + CELL_W, y0 + CELL_H + LABEL_H], fill=(10, 10, 12))
        dr.text((x0 + 4, y0 + CELL_H + 5), label, fill=(255, 255, 255), font=font)

    sheet.save(out_path)
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--review-dir', default=os.path.join(ROOT, 'assets', 'review'))
    ap.add_argument('--out', default=os.path.join(HERE, 'evidence', 'r17', 'review_sheet.png'))
    ap.add_argument('--extra', action='append', default=[])
    args = ap.parse_args()

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    os.makedirs(args.review_dir, exist_ok=True)

    items = collect_images(args.review_dir, args.extra)
    rc = build_sheet(items, args.out)
    print('review_sheet.py: %d image(s) composed -> %s' % (len(items), args.out))
    for label, path in items:
        print('  - %s (%s)' % (label, path))
    if not items:
        print('  (none found -- ran clean against an empty input set)')
    return rc


if __name__ == '__main__':
    sys.exit(main())
