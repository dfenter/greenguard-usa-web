# Razorfin Rev 12 — Sharkjira showpiece

Date: 2026-08-24  
Owner: Razorfin / Luna xhigh  
Scope: `play/razorfin/shark3d.js` and scratchpad render probes

## Result

`leviathanrex` now reads as Sharkjira: a charcoal-black, heavy-chested kaiju
shark with a reinforced underbite, oversized teeth, heavy brow, small atomic
blue eyes, thick tail, gill/throat glow, and a seven-plate maple-leaf crest.
The existing Rev 11 personality system remains intact except for the one
`leviathanrex` row override.

The authored palette is preserved exactly for this row:

```text
base  0x1b1f22   belly 0x2a3138   accent/glow 0x3fd6ff
```

The surface uses the existing baked personality morph and skin shader relief
path. Sharkjira's relief/pattern mix is deliberately restrained so the hide
stays charcoal instead of washing out into the generic kaiju palette.

## Feature batch and rigging

- Seven jagged dorsal plates run neck-to-tail, largest at mid-back.
- Plate vertices are weighted across `Neck`, `Abdomen`, and `Tail1`–`Tail4`,
  so the crest follows the existing tail bend.
- Eyes, gill slashes, throat glow, and upper/lower teeth share one cached,
  skeleton-bound feature mesh. `rfKind` keeps teeth pale while the atomic
  features use the pulsing `uRfAtomicPulse` uniform driven by `animate(t)`.
- Sharky retains its two artist skinned meshes; the feature batch is the third
  visible mesh. Sharkjira therefore stays at exactly three draws.
- Feature budget is 268 atomic triangles plus 40 tooth triangles: 308 total.

## Measurements and verification

The camera contract remains exact: Sharkjira measures `96 * 2.4 = 230.4`
world units on X, while the `megalodon` comparison row targets `96 * 1.75 =
168.0`, making Sharkjira 1.371x longer before consumer framing.

Focused gates:

```text
node --check shark3d.js
node --import ./tools/reg.mjs tools/selftest.mjs art3d fish
art3d: pass=true ok=5 fail=0
fish:   pass=true ok=8 fail=0
```

Full suite:

```text
node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fish fx ui meta abilities
world:     pass=true ok=210 fail=0
game:      pass=true ok=296 fail=0
art3d:     pass=true ok=5 fail=0
fish:      pass=true ok=8 fail=0
fx:        pass=true ok=0 fail=0
ui:        pass=true ok=239 fail=0
meta:      pass=true ok=192 fail=0
abilities: pass=true ok=0 fail=0
```

The full run still prints the known injected lane-D3/C3/B3/F3 diagnostic
logs from the shared `engine3d.js` harness; the reported suite statuses are
green and no other lane files were changed.

Focused side-by-side capture:

```text
OUT=shotsJIRA4 IDS='leviathanrex,megalodon' node sharkline.js
```

The capture shows Sharkjira's larger kaiju silhouette, charcoal hide, blue
crest, and jaw read against the smaller megalodon. No git commit or deploy was
made.
