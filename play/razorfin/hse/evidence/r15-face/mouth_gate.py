"""r15 GRIN mouth gate, judged on RENDERED PIXELS in the head crop.

The containment gate (silhouette_gate.py) asks "is the face batch ON the
shark". That question is trivially satisfied by geometry that is correctly
seated and INVISIBLE - which is exactly the state the r15 evidence was in:
every containment number passed while the crops showed closed mouths, no
teeth, and an eye that was a featureless white dot.

This gate asks the complementary question: "can you SEE it". It runs on the
forward head crop, at the size the owner judges from, and it counts two
things the HSE reference always shows:

  GATE C (mouth cavity):  dark, desaturated-red cavity pixels must be
                          >= 3.0% of the head-crop pixels.
  GATE D (tooth white):   bright, near-neutral tooth pixels must be
                          >= 0.8% of the head-crop pixels.

Both are expressed against the head crop rather than against the silhouette,
because the crop is the framing the art is judged in and a percentage of it
is stable across rows of very different body shapes.

COLOUR ALONE IS NOT ENOUGH, AND THAT MATTERS. A first cut of this gate
classified rendered colour over the whole head crop. It reported tiger at
40.09% "cavity" and greatwhite at 13.54% "tooth" - both nonsense: tiger's
skin is dark purple and greatwhite has a pale belly, so the classifier was
measuring SKIN. greatwhite "passed" both bars with a visibly closed mouth,
which is the exact false green this gate exists to prevent.

So the gate is scoped to the pixels the FACE BATCH actually drew, via the
face/noface difference the seating harness already produces, and only then
classified by colour. A pixel must be both (a) changed by mounting the batch
and (b) the right colour to count. Skin cannot satisfy (a); a correctly
coloured but invisible feature cannot satisfy it either, because a feature
hidden behind a closed jaw changes no pixels.

Where no noface counterpart exists the row is reported as UNSCOPED rather
than silently scored against the whole crop.

Usage: python3 mouth_gate.py <dir-with-{id}_fwd.png> [id,id,...]
  Looks for {id}_fwd_noface.png, else ../heads_raw/{id}_noface.png, to scope
  the measurement to the batch's own pixels.
"""
import sys, os, json
from PIL import Image

WATER = (127, 179, 196)
TOL = 10

# Cavity: dark, and warmer than it is blue (the maroon uRfFaceCavity 0x2a1014
# lit by the scene). The blue channel bound is what separates it from shadowed
# skin and from the water, both of which are blue-dominant on these frames.
CAVITY_MAX_V = 88          # max of r,g,b
CAVITY_MAX_BLUE_LEAD = 6   # b may exceed r by at most this much

# Tooth: bright and near-neutral. The brightest thing on a shaded head that is
# not the eye catch-light; the catch-light is a handful of pixels and cannot
# reach the 0.8% bar on its own.
TOOTH_MIN_V = 150
TOOTH_MAX_SPREAD = 46      # max(r,g,b) - min(r,g,b)

BAR_CAVITY = 0.030
BAR_TOOTH = 0.008

# Read the module hold straight out of face_textured.js rather than taking it
# as a flag. When the mouth is deliberately withheld, "0% cavity, 0% tooth" is
# the CORRECT result and reporting it as FAIL would train the reader to ignore
# this gate - the precise habit that let the original defect ship.
def _mouth_held():
    src = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       '..', '..', 'face_textured.js')
    try:
        with open(src) as fh:
            for line in fh:
                if line.startswith('const RF_GRIN_MOUTH_HOLD'):
                    return 'true' in line
    except OSError:
        pass
    return False

MOUTH_HELD = _mouth_held()


DIFF_THRESH = 18   # same bar the seating gate uses for "the batch drew here"


def noface_crop(d, rid, size):
    """The same crop box, taken from the frame rendered WITHOUT the face batch.

    Returns None when no counterpart frame exists, so the caller can report
    the row as unscoped instead of quietly measuring skin.
    """
    side = os.path.join(d, rid + '_fwd_noface.png')
    if os.path.exists(side):
        return Image.open(side).convert('RGB').resize(size)
    meta_p = os.path.join(d, 'crops.json')
    raw = os.path.join(os.path.dirname(os.path.abspath(d)), 'heads_raw', rid + '_noface.png')
    if not (os.path.exists(meta_p) and os.path.exists(raw)):
        return None
    box = json.load(open(meta_p)).get(rid + ':fwd', {}).get('box')
    if not box:
        return None
    x, y, w, h = box
    return Image.open(raw).convert('RGB').crop((x, y, x + w, y + h)).resize(size)


def classify(d, rid):
    path = os.path.join(d, rid + '_fwd.png')
    im = Image.open(path).convert('RGB')
    px = im.load()
    W, H = im.size
    nf = noface_crop(d, rid, im.size)
    npx = nf.load() if nf is not None else None
    shark = cavity = tooth = batch = 0
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            if abs(r-WATER[0]) <= TOL and abs(g-WATER[1]) <= TOL and abs(b-WATER[2]) <= TOL:
                continue
            shark += 1
            if npx is not None:
                nr, ng, nb = npx[x, y]
                # Only pixels the face batch actually changed can count. Skin
                # is identical in both frames and is excluded by construction.
                if max(abs(r-nr), abs(g-ng), abs(b-nb)) <= DIFF_THRESH:
                    continue
            batch += 1
            v = max(r, g, b)
            spread = v - min(r, g, b)
            if v <= CAVITY_MAX_V and (b - r) <= CAVITY_MAX_BLUE_LEAD:
                cavity += 1
            elif v >= TOOTH_MIN_V and spread <= TOOTH_MAX_SPREAD:
                tooth += 1
    total = W * H
    return {
        'crop_px': total, 'shark_px': shark, 'batch_px': batch,
        'scoped': npx is not None,
        'cavity_px': cavity, 'tooth_px': tooth,
        'cavity_frac': cavity / total if total else 0.0,
        'tooth_frac': tooth / total if total else 0.0,
    }


def main():
    d = sys.argv[1]
    ids = sys.argv[2].split(',') if len(sys.argv) > 2 else sorted(
        f[:-8] for f in os.listdir(d) if f.endswith('_fwd.png'))
    out = {}
    print(f'{"row":<13}{"cavity%":>9}{"":>3}{"tooth%":>8}{"":>3}  verdict')
    npass = nfail = nheld = 0
    for rid in ids:
        p = os.path.join(d, rid + '_fwd.png')
        if not os.path.exists(p):
            continue
        m = classify(d, rid)
        okc = m['cavity_frac'] >= BAR_CAVITY
        okt = m['tooth_frac'] >= BAR_TOOTH
        m['cavity_pass'] = okc
        m['tooth_pass'] = okt
        m['pass'] = okc and okt
        out[rid] = m
        if MOUTH_HELD:
            nheld += 1
            verdict = 'HELD (RF_GRIN_MOUTH_HOLD: mouth not emitted by design)'
        elif not m['scoped']:
            verdict = 'UNSCOPED (no noface frame; not counted)'
        elif m['batch_px'] == 0:
            nheld += 1
            verdict = 'HELD (batch drew nothing)'
        elif m['pass']:
            npass += 1
            verdict = 'PASS'
        else:
            nfail += 1
            verdict = 'FAIL ' + ' '.join(
                t for t, ok in (('cavity', okc), ('tooth', okt)) if not ok)
        print(f'{rid:<13}{m["cavity_frac"]*100:>8.2f}%{"" :>3}{m["tooth_frac"]*100:>7.2f}%{"":>3}  {verdict}')
    if MOUTH_HELD:
        print('\nRF_GRIN_MOUTH_HOLD is ON: tooth rows and cavity are not emitted.')
        print('The bars below are what must be met once the hold is lifted.')
    print(f'\nbars: cavity >= {BAR_CAVITY*100:.1f}%  tooth >= {BAR_TOOTH*100:.1f}% of head-crop pixels')
    print(f'{npass} PASS / {nfail} FAIL / {nheld} HELD')
    with open(os.path.join(d, 'mouth_gate.json'), 'w') as fh:
        json.dump(out, fh, indent=2)


if __name__ == '__main__':
    main()
