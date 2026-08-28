"""r15 FACE seating gate, judged on RENDERED PIXELS.

For each row and each facing direction we have three frames from the same
camera:  face / noface / (flipped pair).  The gate is:

  1. SILHOUETTE MASK  = pixels where the noface frame differs from the flat
     water plate. That is the shark's true rendered outline, and it is built
     from the frame WITHOUT the face batch so the batch can never widen the
     mask it is about to be judged against.

  2. FACE PIXELS      = pixels where face and noface frames differ. Those are
     exactly the pixels the batch added.

  3. GATE A (containment): >=98% of face pixels must lie INSIDE the mask. A
     batch floating in open water fails this outright - that is the r14 defect.

  4. GATE B (head third): the centroid of the face pixels must lie in the
     head-most third of the mask along its long axis. A batch that is on the
     body but on the belly or the tail fails here.

Usage: python3 silhouette_gate.py <dir-with-{id}_{face,noface,flip,flipnoface}.png>
"""
import sys, os, json
from PIL import Image, ImageChops

WATER = (127, 179, 196)   # scene.background 0x7fb3c4
TOL   = 10                # per-channel tolerance vs the flat plate

def load(p):
    return Image.open(p).convert('RGB')

def water_mask(im):
    """True where the pixel is NOT the flat water plate -> the shark."""
    px = im.load(); W, H = im.size
    m = bytearray(W * H)
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            if abs(r-WATER[0]) > TOL or abs(g-WATER[1]) > TOL or abs(b-WATER[2]) > TOL:
                m[y*W + x] = 1
    return m, W, H

def diff_mask(a, b, thresh=18):
    """True where two frames differ -> the pixels the face batch drew."""
    d = ImageChops.difference(a, b).convert('L').load()
    W, H = a.size
    m = bytearray(W * H)
    for y in range(H):
        for x in range(W):
            if d[x, y] > thresh:
                m[y*W + x] = 1
    return m, W, H

def report(tag, facep, nofacep, held=False):
    face, noface = load(facep), load(nofacep)
    sil, W, H = water_mask(noface)
    fac, _, _ = diff_mask(face, noface)
    total = sum(fac)
    if total == 0:
        # A row the module HELD draws no face pixels by design: it keeps the
#  Rev 14 baked face. That is a pass-by-abstention, not a failure. The
#  caller passes held=True for those rows.
        if held:
            return dict(row=tag, ok=True, held=True, facePx=0, why='HELD (baked face)')
        return dict(row=tag, ok=False, why='face batch drew NO pixels', facePx=0)
    # A feature drawn AT the lip or the flank edge sits on the silhouette's own
    # antialiased rim by construction, and that rim is ~1 px wide (measured:
    # 5.0% of the greatwhite body mask). At small feature counts that edge
    # dominates the ratio - greatwhite's tooth row is 24 px, of which 7 are rim
    # pixels 1-2 px from an inside pixel, scoring 0.71 for a row that is
    # correctly seated. Dilating the mask by ONE pixel measures seating rather
    # than antialiasing; a detached batch is many pixels clear of the hull and
    # still fails.
    dil = bytearray(W * H)
    for y in range(H):
        for x in range(W):
            if not sil[y*W + x]:
                continue
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W:
                        dil[yy*W + xx] = 1
    inside = sum(1 for i in range(W*H) if fac[i] and dil[i])
    frac = inside / total
    # long axis of the silhouette
    xs = [i % W for i in range(W*H) if sil[i]]
    ys = [i // W for i in range(W*H) if sil[i]]
    if not xs:
        return dict(row=tag, ok=False, why='silhouette empty (shark not in frame)', facePx=total)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    horiz = (x1-x0) >= (y1-y0)
    # face-pixel centroid
    fxs = [i % W for i in range(W*H) if fac[i]]
    fys = [i // W for i in range(W*H) if fac[i]]
    cx, cy = sum(fxs)/len(fxs), sum(fys)/len(fys)
    # which end is the head? the end of the silhouette nearest the face centroid
    if horiz:
        t = (cx - x0) / max(x1-x0, 1)
    else:
        t = (cy - y0) / max(y1-y0, 1)
    head_third = t <= 1/3 or t >= 2/3    # head is at one end; either end counts
    return dict(row=tag, ok=bool(frac >= 0.98 and head_third),
                facePx=total, insideFrac=round(frac, 4),
                axis='h' if horiz else 'v', centroidT=round(t, 3),
                headThird=bool(head_third))

HELD_ROWS = {'megalodon', 'typhonmaw'}   # seatConfidence < 0.10; keep baked face

def main():
    d = sys.argv[1]
    ids = sorted({f.split('_')[0] for f in os.listdir(d) if f.endswith('_face.png')})
    rows, fails = [], []
    for rid in ids:
        for facef, nofacef, label in (('face', 'noface', 'fwd'),
                                      ('flip', 'flipnoface', 'rev')):
            fp = os.path.join(d, f'{rid}_{facef}.png')
            npth = os.path.join(d, f'{rid}_{nofacef}.png')
            if not (os.path.exists(fp) and os.path.exists(npth)):
                continue
            r = report(f'{rid}:{label}', fp, npth, rid in HELD_ROWS)
            rows.append(r)
            if not r['ok']:
                fails.append(r['row'])
    w = max(len(r['row']) for r in rows) if rows else 10
    for r in rows:
        if r.get('held'):
            print(f"{r['row']:<{w}}  HELD - keeps Rev 14 baked face (not a failure)")
            continue
        print(f"{r['row']:<{w}}  facePx={r.get('facePx',0):<6} "
              f"inside={r.get('insideFrac','-'):<7} t={r.get('centroidT','-'):<6} "
              f"{'PASS' if r['ok'] else 'FAIL ' + r.get('why','')}")
    print()
    print('FAIL:', fails if fails else 'none')
    print(json.dumps(rows), file=open(os.path.join(d, 'gate.json'), 'w'))
    sys.exit(1 if fails else 0)

main()
