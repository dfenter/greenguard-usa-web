# Razorfin Rev 12 — Sharkjira material fix

Date: 2026-08-24  
Owner: Razorfin / Luna xhigh  
Scope: `play/razorfin/shark3d.js` and scratchpad probes

## Diagnosis

The washed-out Sharkjira body was not a transparency or depth-buffer defect.
The node probe reported the same solid state on both artist body meshes:

```text
MeshStandardMaterial
opacity=1 transparent=false depthWrite=true depthTest=true blending=Normal
```

The authored palette also arrived intact (`base=0x1b1f22`, `belly=0x2a3138`,
`accent/glow=0x3fd6ff`). The body normals were finite and had a positive
outward bias (mean radial dot `0.2663` on `Shark`, `0.0546` on `Shark001`),
so no normal inversion or backface-shell repair was needed.

The rendered flank sample isolated the failure: before the fix it was opaque
but blue-washed, `[35,119,142,255]`, HSV V≈`0.56`. The ordinary skin material
was applying the atomic-blue palette glow to the entire Sharkjira body at
emissive intensity `0.16`; the material flags made it solid, but the emissive
field bleached the charcoal albedo into a cyan veil.

## Fix

`skinMaterial()` now treats non-face Sharkjira skin as a non-emissive body.
The dedicated atomic feature batch still owns the restrained blue glow for
the plates, gills, throat, and eyes. A selftest regression gate requires the
Sharkjira body material to remain opaque, depth-writing, and non-emissive.

## Verification

After the fix, the body materials report `emissive=000000` and
`emissiveIntensity=0`; the atomic feature material remains `3fd6ff` at `0.55`.
The after-render flank samples were opaque and within the requested dark
range:

```text
[54,51,44,255]  V=0.212
[48,69,72,255]  V=0.282
[41,63,66,255]  V=0.259
```

Measured capture:

```text
OUT=shotsJ2 IDS='leviathanrex,reef,megalodon' node sharkline.js
```

Focused gates after the fix:

```text
node --check shark3d.js
node --import ./tools/reg.mjs tools/selftest.mjs art3d fish
art3d: pass=true ok=5 fail=0
fish:   pass=true ok=8 fail=0
```

No commit or deploy was made.
