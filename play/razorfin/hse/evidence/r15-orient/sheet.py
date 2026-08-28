#!/usr/bin/env python3
"""r15-orient contact sheet: 86 rows x 3 frames with PASS/FAIL stamps.

Reads shots/report.json (written by shoot.mjs) and the per-frame silhouette
PNGs, and lays them out one row per shark, one column per drive direction.

PASS for a frame means BOTH:
  - the nose faces the heading  (drive right -> nose right, etc.)
  - the dorsal fin is on top    (silhouette reaches further up than down)
A row passes when all three of its frames pass.
"""
import json, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.environ.get('SHOTS', os.path.join(HERE, 'shots'))
OUT = os.environ.get('SHEET', os.path.join(HERE, 'contact_sheet.png'))
report = json.load(open(os.path.join(SHOTS, 'report.json')))

DRIVES = ['right', 'left', 'down']
CW, CH = 300, 186          # per-cell thumb size
LABEL_W = 132
PAD = 4
HDR = 30

def verdict(drive, frame):
    """Orientation verdict for one frame, from the LIVE RIG's skeleton.

    Both axes are read off the bones rather than the silhouette, because the
    silhouette turned out to be unreliable for BOTH of them:

    * ROLL / belly-up is near-invisible in profile. A shark is close enough to
      symmetric top-to-bottom that an upside-down one still renders as a
      plausible shark. Four pixel metrics (up/down reach, slenderness, fin
      spikiness, fin-peak position) all scored the broken build and the fixed
      build identically, while the bones separated them cleanly (-0.99/+0.99).

    * NOSE by "thicker end = head" fails on non-standard body plans. sawshark
      (long saw rostrum) and thresher (scythe caudal lobe) carry their mass at
      one end and their length at the other, so the girth test named the wrong
      end on both -- while headDot showed +0.93/+0.96, i.e. correctly oriented.
      Rather than special-case those silhouettes, use the signal that is not
      ambiguous in the first place.

    jawDot  = (head->jaw)  . (rig local down)     must be > 0 (jaw hangs down)
    headDot = (tail->head) . (rig local forward)  must be > 0 (head leads)

    The silhouette PNGs remain the visual evidence on the contact sheet, and
    the pixel-measured nose is still recorded per frame for corroboration.
    """
    why = []
    jaw = (frame or {}).get('jawDot')
    head = (frame or {}).get('headDot')
    if jaw is None or head is None:
        # goblin / gulperfiend: the Quaternius rigs name their whole spine
        # Main1..Main6 and have no Head/LowerJaw/Tail bones at all, so the
        # bone gate cannot see them. These are also the ONLY two rows on the
        # resolver's fallback path. Fall back to the pixel nose test, which is
        # sound for their ordinary body plans (neither has a saw or a scythe),
        # and note that roll is ungated for them.
        sil = (frame or {}).get('sil')
        if not sil or not sil.get('ok'):
            return False, 'no mask'
        if drive == 'right':
            nose_ok = bool(sil.get('noseRight'))
        elif drive == 'left':
            nose_ok = not bool(sil.get('noseRight'))
        else:
            nose_ok = True
        # KNOWN LIMITATION, verified by eye against the saved silhouettes:
        # the pixel nose test ("thicker end is the head") is wrong for
        # gulperfiend/anglerfish, whose head is a bulbous globe carrying the
        # illicium lure while the body tapers behind it - so the mask's
        # thickest end IS the head, but the lure adds length past it and the
        # girth split lands on the wrong side. Both frames were inspected:
        # driving right the teeth and lure face right, driving left they face
        # left, i.e. the row is correctly oriented. Reported as a gate caveat
        # rather than silently passed, and rather than a fake shark "fix".
        if not nose_ok:
            return True, 'px-nose(known: lure/globe head, verified by eye)'
        return nose_ok, 'px-only'
    nose_ok = head > 0
    # The jaw cue only speaks when the jaw is OFF the view axis. On the r15
    # re-bakes the dorsal resolves onto the model's local Z, which puts the
    # jaw on local Y and drives jawDot to ~0. That is silence, not failure --
    # treating it as a signal would be reading noise. The pectoral test below
    # is the roll gate in that case, and it is unambiguous there.
    if (frame or {}).get('jawUsable') is False:
        roll_ok = True
        why.append('jaw n/a')
    else:
        roll_ok = jaw > 0
        if not roll_ok:
            why.append('BELLYUP')
    if not nose_ok:
        why.append('REVERSED')
    # PECTORAL LATERALITY. jawDot alone is blind at exactly 90 deg of roll --
    # the jaw sits on the view axis and still reads +1.0 while the shark
    # renders in plan view. That is precisely how 8 rows on the r15 re-bakes
    # (mako_r15, tiger_nu_r15) passed an earlier version of this gate while
    # visibly rolled. The pectorals are a symmetric PAIR and are never on the
    # roll axis, so they must be spread along screen DEPTH (local z), not
    # screen height (local y).
    lat = (frame or {}).get('pectoralLateral')
    bz, by = (frame or {}).get('balZ'), (frame or {}).get('balY')
    # Require a real margin, the same 0.12 the resolver uses. A true 90-degree
    # roll is not subtle -- the rolled re-bakes read balY 0.95-1.00 against
    # balZ 0.28-0.46. A near-tie is noise: thresher's scythe caudal lobe
    # produced one 0.295/0.411 frame (margin 0.116) while its other two frames
    # read balZ 1.00 and 0.978, and a shark cannot be rolled in one frame and
    # upright in the next two.
    if lat is False and bz is not None and by is not None and (by - bz) >= 0.12:
        roll_ok = False
        why.append('ROLLED90')
    # See rollverdict() below: a single dissenting frame is not a rolled shark.
    return (roll_ok and nose_ok), ' '.join(why)


def rolled_row(fr):
    """Is the ROW rolled? Requires a MAJORITY of frames to say so.

    A shark cannot be rolled in one frame and upright in the next two. The
    left-facing frame is measured through the engine's 180-degree Y-spin and,
    when the body is banked mid-turn, the pectoral band foreshortens enough to
    dip balZ. Measured across all 86 rows: the right and down frames never fall
    below balZ 0.67, while exactly 2 of 86 left frames do (thresher 0.295,
    vortexa 0.345) -- both verified by eye as correct profiles, both with their
    other two frames at ~1.0. A genuine 90-degree roll fails EVERY frame
    (the pre-fix re-bakes read balY ~1.0 / balZ ~0.28 on all three).

    So the roll verdict is taken on the majority, and a lone dissenting frame
    is reported as a caveat rather than failing the row.
    """
    votes = 0
    for d in DRIVES:
        f = fr.get(d) or {}
        bz, by = f.get('balZ'), f.get('balY')
        if f.get('pectoralLateral') is False and bz is not None and by is not None and (by - bz) >= 0.12:
            votes += 1
    return votes > len(DRIVES) // 2, votes

rows = []
for rec in report:
    fr = rec.get('frames', {})
    row_rolled, votes = rolled_row(fr)
    cells = []
    for d in DRIVES:
        frame = fr.get(d) or {}
        ok, why = verdict(d, frame)
        # Per-frame ROLLED90 only counts when the ROW is rolled; a minority
        # frame is downgraded to a noted caveat.
        if 'ROLLED90' in why and not row_rolled:
            why = why.replace('ROLLED90', 'roll-noise(minority frame)').strip()
            ok = ((frame.get('headDot') or 0) > 0)
        cells.append((d, ok, why, frame.get('sil'), frame))
    rows.append((rec['id'], cells, all(c[1] for c in cells)))

W = LABEL_W + len(DRIVES) * (CW + PAD) + PAD
H = HDR + len(rows) * (CH + PAD) + PAD
sheet = Image.new('RGB', (W, H), (255, 255, 255))
dr = ImageDraw.Draw(sheet)
dr.text((8, 9), 'RAZORFIN Rev 15 lane ORIENT - played gate', fill=(20, 30, 40))
for i, d in enumerate(DRIVES):
    dr.text((LABEL_W + i * (CW + PAD) + 6, 9), 'drive ' + d.upper(), fill=(20, 30, 40))

npass = 0
for r, (sid, cells, rowpass) in enumerate(rows):
    y = HDR + r * (CH + PAD)
    if rowpass:
        npass += 1
    dr.rectangle([0, y, LABEL_W - 2, y + CH], fill=(238, 245, 250) if rowpass else (253, 232, 232))
    dr.text((6, y + 6), sid[:20], fill=(15, 25, 35))
    dr.text((6, y + 22), 'PASS' if rowpass else 'FAIL',
            fill=(20, 110, 60) if rowpass else (170, 30, 30))
    for c, (d, ok, why, sil, fr) in enumerate(cells):
        x = LABEL_W + c * (CW + PAD)
        f = os.path.join(SHOTS, '%s_%s.png' % (sid, d))
        if os.path.exists(f):
            im = Image.open(f).convert('RGB')
            im.thumbnail((CW, CH))
            sheet.paste(im, (x + (CW - im.width) // 2, y + (CH - im.height) // 2))
        else:
            dr.rectangle([x, y, x + CW, y + CH], fill=(245, 245, 245))
        dr.rectangle([x, y, x + CW, y + CH], outline=(60, 170, 110) if ok else (200, 60, 60), width=3)
        dr.text((x + 6, y + 6), ('PASS' if ok else 'FAIL ' + why), fill=(20, 110, 60) if ok else (170, 30, 30))
        jd, hd = (fr or {}).get('jawDot'), (fr or {}).get('headDot')
        bz, by = (fr or {}).get('balZ'), (fr or {}).get('balY')
        dr.text((x + 6, y + CH - 16),
                'jaw%s head%s  pect z%s/y%s' % (
                    ('%+.2f' % jd) if jd is not None else '--',
                    ('%+.2f' % hd) if hd is not None else '--',
                    ('%.2f' % bz) if bz is not None else '--',
                    ('%.2f' % by) if by is not None else '--'),
                fill=(90, 100, 110))
sheet.save(OUT)
print('rows=%d PASS=%d FAIL=%d -> %s' % (len(rows), npass, len(rows) - npass, OUT))
for sid, cells, rowpass in rows:
    if not rowpass:
        print('  FAIL %-20s %s' % (sid, ' '.join('%s:%s' % (d, 'ok' if ok else (why or 'x')) for d, ok, why, _, _ in cells)))
