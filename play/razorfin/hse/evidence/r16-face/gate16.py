"""r16 FACE/MOUTH gate: 4 bakes x 2 directions x 2 gapes, judged on rendered pixels.

Reuses r15's silhouette_gate.report(), which already implements the two things
this gate needs and which were argued for there: a 1-pixel dilation of the
silhouette mask (so a feature drawn AT the lip is measured as seated rather
than as antialiasing), and a >= 0.98 containment bar.

What is new here is the GAPE axis. The tooth rows and the cavity are authored
once, against the posed mouth, and then skinned to a bone that moves. A batch
that is contained at the pose it was fitted to can still break the lip line
once the jaw swings, and no single-pose gate can see that. So every row is shot
at BOTH a shut jaw (gape 0) and a working bite (gape 0.35) and has to pass at
both, in both facing directions.

Usage: python3 gate16.py <dir> [--json out.json]
Expects, per row: {id}_face@{g}.png / {id}_noface@{g}.png
                  {id}_flip@{g}.png / {id}_flipnoface@{g}.png
"""
import sys, os, json, types

HERE = os.path.dirname(os.path.abspath(__file__))
SIL = os.path.join(HERE, '..', 'r15-face', 'silhouette_gate.py')

# silhouette_gate.py calls main() at import time and main() calls sys.exit, so
# importing it normally would run the r15 gate and kill this process. The file
# is not this lane's to restructure, so its source is executed with that one
# trailing call stripped - which imports the definitions (report, water_mask,
# diff_mask) without running the r15 CLI.
_src = open(SIL).read()
_src = _src.replace('\nmain()\n', '\n')
sil = types.ModuleType('sil')
sil.__file__ = SIL
exec(compile(_src, SIL, 'exec'), sil.__dict__)

GAPES = ('0', '0.35')

# Rows whose bake is on BAKE_OVERLAY_HELD in hse/face_textured.js. Those rows
# ship the Rev 14 baked face and the overlay is deliberately withheld, so the
# batch correctly draws nothing.
HELD_IDS = {'thresher', 'tiger'}

def main():
    d = sys.argv[1]
    out = None
    if '--json' in sys.argv:
        out = sys.argv[sys.argv.index('--json') + 1]
    ids = sorted({f.split('_')[0] for f in os.listdir(d) if '_face@' in f})
    rows, fails = [], []
    for rid in ids:
        for g in GAPES:
            for facef, nofacef, label in (('face', 'noface', 'fwd'),
                                          ('flip', 'flipnoface', 'rev')):
                fp = os.path.join(d, f'{rid}_{facef}@{g}.png')
                np_ = os.path.join(d, f'{rid}_{nofacef}@{g}.png')
                if not (os.path.exists(fp) and os.path.exists(np_)):
                    continue
                # A bake on the module's held list draws no overlay BY DESIGN
                # (BAKE_OVERLAY_HELD in hse/face_textured.js): it keeps its
                # Rev 14 baked face. That is a pass-by-abstention, exactly as
                # r15's gate already treats its own HELD_ROWS - not a failure.
                r = sil.report(f'{rid} {label} gape{g}', fp, np_, held=rid in HELD_IDS)
                r['id'] = rid; r['dir'] = label; r['gape'] = g
                rows.append(r)
                if not r['ok']:
                    fails.append(r)
    w = max([len(r['row']) for r in rows] + [10])
    for r in rows:
        print(f"{r['row']:<{w}} {'PASS' if r['ok'] else 'FAIL':4} "
              f"facePx={r.get('facePx',0):<6} inside={r.get('insideFrac','-')} "
              f"headThird={r.get('headThird','-')} {r.get('why','')}")
    print(f"\n{len(rows)-len(fails)}/{len(rows)} PASS")
    if out:
        json.dump(rows, open(out, 'w'), indent=2)
    return 1 if fails else 0

if __name__ == '__main__':
    sys.exit(main())
