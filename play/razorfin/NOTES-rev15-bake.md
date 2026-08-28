# Rev 15 — lane BAKE

Owned: `assets/models/mako_r15.glb`, `assets/models/tiger_nu_r15.glb`,
`tools/shark_bake.py` (new opt-in flags only), `hse/evidence/r15-bake/`, this file.
Originals `mako.glb` / `tiger_nu.glb` are **untouched**. Nothing was wired into
`data.js` or `shark3d.js`. Selftests `world` and `game` both green
(379/0 and 386/0).

## The problem, restated and confirmed

The SKIN lane's finding was correct and I reproduced it independently: the
`mako` and `tiger_nu` bakes carry a painted luminance gradient that is
**negative under every candidate axis**, so no rotation of a runtime
countershade can cancel it. Measured on the shipped GLBs, sampling the diffuse
per vertex through its own UV (linear luminance, dorsal band minus belly band):

| bake | axis 0 | axis 1 |
|---|---|---|
| `mako.glb` | +0.0248 | +0.0591 |
| `tiger_nu.glb` | −0.0702 | −0.0091 |

A gradient with a consistent sign across both candidate axes is not
misaligned — it is not axis-aligned at all. It can only be removed where it
lives, in the texels.

## The axis finding that changed the measurement

Both earlier lanes (and my own first probe) selected the dorsal axis by
**vertex-mass asymmetry**, and that metric is unreliable here: it picked axis 1
for mako and axis 0 for tiger, and it says nothing about *polarity*.

Selecting instead by **dorsal-fin spike** — the largest midbody excursion from
the median, per axis — is unambiguous on both models:

| bake | long | axis 1 (max+ / max−) | axis 0 (max+ / max−) | verdict |
|---|---|---|---|---|
| `mako` | Z | 0.236 / 0.236 | 0.106 / **0.184** | dorsal = axis 0, **−X** |
| `tiger_nu` | Z | 0.260 / 0.262 | **0.205** / 0.112 | dorsal = axis 0, **+X** |

Axis 1 is symmetric to three decimals on both — it is the left-right axis, and
a mass metric that lands on it is reading noise. **Both models are dorsal on
axis 0, but with OPPOSITE polarity.** That is the missing piece behind the
"every global sign choice scattered" symptom: mako's dorsal points −X while
tiger's points +X, so any single global sign is guaranteed wrong on one of them.

`hse/probe_axis.mjs`'s table (mako "up X", tiger_nu "up X") had the axis right;
what was missing was that the two disagree on direction.

## What I changed in `tools/shark_bake.py`

Three new **opt-in** flags. Default behaviour of the script is byte-unchanged,
so no existing bake is affected:

- `--flatlum` — equalise the baked diffuse so luminance is flat along the
  dorsal-ventral axis.
- `--flatlum-mean` (default 0.5) — target mean luminance.
- `--desat F` — pull the diffuse F of the way toward neutral, for a
  photographic colour cast.

`flatten_dorsal_luminance()` runs after the EMIT diffuse bake and before the
normal bake:

1. Pick the dorsal axis and polarity as above.
2. Project every vertex onto it, normalise to 0..1, and **rasterise that
   coordinate into UV space** over the loop triangles, so each texel knows
   where on the dorsal-ventral axis it sits.
3. Fit a 24-bin low-frequency luminance profile against that coordinate,
   smoothed, and **divide it out** — iteratively, 4 rounds, re-fitting each
   time. One clamped pass under-corrects the dark end while fully correcting
   the bright end, which leaves exactly the kind of residual inverted gradient
   that started this.
4. Renormalise the body mean to the target. RGB is scaled together, so chroma
   and all high-frequency detail (pores, denticles, stripes, gill slits, eye)
   ride through untouched. Only the broad top-to-bottom ramp is removed.

Bin weighting is by **vertex density**, not atlas area: UV charts are not
area-preserving (a fin can own a quarter of the map), and an atlas-uniform fit
flattens the *texture* while leaving the *surface* gradient — which is what the
renderer and the verifier both actually see — partly intact.

## Result

Measured on the exported GLBs with the spike-derived dorsal axis and per-model
polarity, excluding the outer 15% at each end (nose tip, tail and fin edges are
UV-sparse and are neither dorsal nor belly):

| bake | before | after | |
|---|---|---|---|
| `mako` | −0.0332 | **−0.0137** | within 0.05 |
| `tiger_nu` | −0.0766 | **−0.0114** | within 0.05 |

Both land comfortably inside the ±0.05 the brief asked for. Mean luminance rose
to ~0.22 linear on both (they were 0.196 and 0.162), i.e. the hides are no
longer sitting dark, and `--desat 0.35` removed the tiger's pink and the mako's
olive photo cast without going grey.

`hse/evidence/r15-bake/diffuse_before_after.png` is the four atlases side by
side (mako before/after, tiger before/after). The skin detail, gill slits, eye
and jaw are all intact; the charts are simply flatter in value.

## Drop-in contract verified

`node hse/inspect_glb.mjs` plus a direct buffer comparison:

| | mako | mako_r15 | tiger_nu | tiger_nu_r15 |
|---|---|---|---|---|
| tris | 6790 | **6790** | 6790 | **6790** |
| verts | 5981 | **5981** | 6685 | **6685** |
| bones | 8 | **8** | 8 | **8** |
| bind bbox | 0.2896x0.4721x0.9979 | **identical** | 0.317x0.5214x0.9997 | **identical** |
| disk | 0.518MB | 0.531MB | 0.611MB | 0.635MB |

POSITION and TEXCOORD_0 are **bitwise identical** (max diff 0.00e+00) and the
bone list is the same 8 names in the same order
(`Tail3, Tail2, Tail1, Spine2, Spine1, Neck, Head, LowerJaw`). Only the diffuse
JPEG differs. These are true drop-in replacements — a row can be switched onto
them with no other change.

## Reproduce

    cd play/razorfin
    B=/Applications/Blender.app/Contents/MacOS/Blender
    CL=scratchpad/cline_sharks/src
    $B -b --python tools/shark_bake.py -- --in $CL/mako/unpacked/scene.gltf \
        --out assets/models/mako_r15.glb --tris 7000 --tex 1024 --name mako \
        --flatlum --desat 0.35
    $B -b --python tools/shark_bake.py -- --in $CL/tiger/unpacked/scene.gltf \
        --out assets/models/tiger_nu_r15.glb --tris 7000 --tex 1024 --name tiger_nu \
        --flatlum --desat 0.35

~4 min each; they run fine in parallel. The `FLATLUM` line in the log reports
the post-correction dorsal/belly numbers.

## Hooks an orchestrator must apply (NOT applied here)

In `shark3d.js`, add to `MODEL_FILES` (after the `mako:` line):

```js
  mako_r15: 'mako_r15.glb',
  tiger_nu_r15: 'tiger_nu_r15.glb',
```

and add both keys to `TEXTURED_KEYS` so they take the lit PBR path:

```js
  'mako_r15', 'tiger_nu_r15',
```

Rows currently on `mako` / `tiger_nu` then move over by changing `sil.model` in
`data.js` (lane O1's generator).

## Note for the SKIN lane

With the painted gradient gone, these two bakes no longer fight the authored
countershade — but they also no longer *supply* any. Given the ~39%
transmission the SKIN lane measured, the authored band is now the only source
of countershade on these two rows, and `BAKE_FLATTEN` / the low-frequency
divide in `skin_identity.js` are **redundant on them** (dividing an already-flat
profile is a no-op, but it costs a build-time pass and can amplify noise).
The `BAKE_SIGN_FLIP` entries for `mako` and `tiger_nu`, if any, should be
dropped when the rows switch over.

Also worth recording for whoever re-derives axes: the runtime's
`measureBindUp()` should use the **dorsal-fin spike**, not vertex-mass
asymmetry. The mass metric picks the symmetric left-right axis on these two
models and carries no polarity information at all.
