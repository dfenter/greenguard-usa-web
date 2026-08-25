# Razorfin Rev 12 — Sharkjira geometry redo

Date: 2026-08-24  
Owner: Razorfin / Luna xhigh  
Scope: `play/razorfin/shark3d.js` and the Sharkjira scratchpad probe

## Diagnosis

The previous Rev 12 row passed its broad selftest but failed the geometry
contract visible in the render. The node probe found:

- The Sharky hull was still a 2,668-vertex body, but all seven dorsal plates
  lived in a separate 192-vertex / 268-triangle skinned feature mesh. They had
  no hull vertex or hull edge in common, so the plate-to-body shared-edge count
  was necessarily zero.
- Sharkjira's nested bone scales compounded down the rig branches. Before the
  redo the measured body box was approximately `220.386 × 194.357 × 177.688`
  world units, against the `230.4` target length. The profile was being made
  wider and taller by repeated `Neck → Head`, `Abdomen → Tail`, and child-fin
  scales, which produced the crumpled black mass in the supplied capture.
- The previous bake only reported one loose `maxOffsetRatio` and never checked
  crest connectivity, per-region caps, or normal winding. A seven-plate count
  therefore did not prove that the plates were attached or safe to deform.

The displacement histogram also separated the causes: the old baked hull
delta versus neutral Sharky peaked at `0.003397` local units (`p99 0.003213`,
ratio `0.0603` of longitudinal span), so the visible failure was not a single
wild vertex alone. It was the combination of nested bone scale and detached
feature geometry.

## Rebuild

- Sharkjira keeps the approved Sharky skinned body and receives a restrained
  personality profile: broad head, thick neck/chest, heavy jaw, underbite,
  low brow, charcoal surface relief, and a seven-station maple-leaf crest.
- The crest is now a hull morph. Existing dorsal-midline vertices are raised
  in place into seven tapering jagged plates plus a low connecting ridge; no
  plate prism is generated as a separate mesh.
- The separate atomic batch now contains only gill slits, throat, eyes, and
  teeth. Its vertices remain skeleton-bound to the nearest named spine/head/jaw
  bones. Crest edge emission uses the shared atomic-blue pulse through the
  hull material, so the body remains opaque and non-emissive except for the
  marked crest edge field.
- Generic personality offsets are bounded to `<= 0.18 L` outside the crest;
  crest displacement is bounded to `<= 0.35` of local body depth. The authored
  crest settles below that ceiling to preserve face winding.

## Measured gate

Probe: `scratchpad/sharkjira_probe.mjs`.

Final Sharkjira measurements:

```text
group bbox:             230.400 × 147.489 × 130.250
expected X:             96 × 2.4 = 230.400
base-Sharky delta:      p50 0.000411, p90 0.001274, p99 0.003969, max 0.004684
outside-crest ratio:    0.0236 L  (<= 0.18 L)
crest plates:           7
crest vertices:         578
crest boundary edges:   280
crest depth ratio:      0.1850 (<= 0.35)
minimum face normal dot: 0.0798 vs neutral Sharky
normal lengths:         finite, approximately 1.0 throughout
atomic feature batch:   94 vertices, 100 triangles
```

The selftest now gates all of the above structural conditions: 7–9 active
plates, every station populated, hull boundary connectivity, face-normal
preservation, displacement caps, exactly three visible meshes, and the
existing opaque/depth-writing charcoal-body material contract.

## Verification

```text
node --check shark3d.js
node --import ./tools/reg.mjs tools/selftest.mjs art3d fish
art3d: pass=true ok=5 fail=0
fish:   pass=true ok=8 fail=0
```

Measured capture:

```text
OUT=shotsJ3 IDS='leviathanrex,megalodon,greatwhite' node sharkline.js
```

The side-on capture shows Sharkjira as the larger solid charcoal shark, with
the smaller megalodon and great white unchanged. No git commit or deploy was
made.
