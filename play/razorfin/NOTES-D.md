# Lane D art pass

Built `sharkart.js` with:

- Retina-aware cached shark baking through `GGKit.hiDpi.canvas`, with play and 2x menu variants.
- Smooth countershaded bodies, scaled fins and tails, eye highlights, gills, and deterministic vector detailing.
- Distinct profiles for all 14 contract heads, including the currently unused `frill` profile.
- Ten reusable pattern painters covering every pattern name found in `data.js`. No pattern names are unmapped.
- Eight reusable glow families covering every FX name found in `data.js`. `dorsalCharge` has a dedicated bright dorsal plate pass.
- Procedural ray, turtle, swordfish/marlin, squid, large squid, grazer, calf, mine, jelly, and puffer textures. Non-procedural sprite keys pass through unchanged.
- `RF.Art.paletteOf()` and `RF.Art.__selftest()` per `SPEC.md`.

Decisions:

- Drawing remains in CSS units after the kit has scaled the backing canvas. The headless fallback is only used when no DOM or kit exists and uses DPR 2 for the self-test.
- Glow work uses a lighter composite pass, shadow blur, and a crisp second stroke. This keeps Act 2 and Act 3 silhouettes readable even when their glow value is zero by falling back to accent colour.
- Procedural geometry uses fixed loops and fixed coordinates. No `Math.random`, timers, listeners, or per-frame state are used.
- A small in-file memory canvas is included only to make the module self-testable in Node without adding a dependency.

Self-test command:

```text
node -e "global.window={RF:{}}; require('./play/razorfin/data.js'); require('./play/razorfin/sharkart.js'); const r=window.RF.Art.__selftest(); console.log(JSON.stringify(r)); if(!r.pass) process.exit(1)"
```

Output:

```text
{"pass":true,"notes":["leviathanrex sampled colours: 1093","procedural creature textures: 11","DPR: 2"]}
```

Additional sweep: all 61 shark rows baked in both variants, all 14 head profiles exercised, and all procedural data rows baked. Result: 146 textures, zero errors.

## Pass 2 (silhouette fix)

Reworked only the shark silhouette geometry in `sharkart.js` after the first
art review. The primary body is now a fusiform bezier profile with a narrow
caudal peduncle, a max-girth station at 32% body length back from the nose,
and a girth-driven 3.2:1 to 2.4:1 body aspect. The upper caudal lobe is longer
and swept, the lower lobe is shorter, and the dorsal, pectoral, pelvic, and
anal fins are explicit triangular forms scaled by `finScale`. Kaiju uses its
jagged dorsal plate row in place of the ordinary dorsal fin.

The existing head painters, palettes, patterns, and FX remain in the render
order. Generic eye, gill, and mouth placement was tightened to the shark
profile: the eye is smaller and high, five angled gill strokes sit behind the
head, and tier 5+ mouths gain visible teeth. Croc, hammer, saw, whale, eel,
and kaiju front archetypes retain their specialized feature passes.

The menu bake uses the same geometry at 2x dimensions. The self-test now
checks five representative primary-body bboxes, measuring peduncle-to-nose
width against the widest opaque body row and requiring >= 2.0; fins and tail
are excluded from that body-only metric as documented in the source. It also
checks the menu geometry and supersampling relationship.

Pass 2 proof:

```text
node --check play/razorfin/sharkart.js                         PASS
RF.Art.__selftest()                                            PASS
body aspects: reef 2.98, hammerhead 2.93, snapjaw 2.67,
              ironfin 2.76, leviathanrex 2.40                  PASS
61 shark rows x play/menu variants: 122 textures, zero errors PASS
```

## Pass 3 (RF-ART-01 fix)

Reworked the three review-blocking special silhouettes in `sharkart.js`:

- Hammerhead now uses one continuous body contour that flares into the upper
  and lower cephalofoil lobes. The eye sits on the upper lobe and the feature
  painter adds only internal lighting lines.
- Whaleshark now widens through the front third of the primary body path into
  a broad flat head. Its wide feeding slit and baleen marks are internal lines,
  not a closed head overlay.
- Gravewater, Bonecrown, and Banshee now carry five bone crest ridges in the
  body outline. Skull feature work is limited to multiply-blended socket
  shading and bone seams, with no generic white eye highlight.
- The ordinary dorsal is now a prominent rear-swept triangular fin with height
  driven by `finScale`. Mechanical panels use a countershaded gradient and
  softened edge lighting so their seams sit in the body profile.
- Shark bakes allocate their own backing canvas at
  `cssSize * (RF.Game.dpr || 1)`, clamp the factor to 1..3, and scale the
  drawing context once. They no longer use the kill-switched GGKit density
  helper.
- The memory-canvas gate now exposes alpha silhouettes to an 8-connected
  flood fill at threshold 16. It checks Hammerhead, Whaleshark, Gravewater,
  Bonecrown, and Banshee, then bakes all 61 shark rows in both variants.

Pass 3 proof:

```text
node --check sharkart.js                                      PASS
RF.Art.__selftest()                                           PASS
hammerhead opaque silhouette components: 1                    PASS
whaleshark opaque silhouette components: 1                     PASS
gravewater opaque silhouette components: 1                    PASS
bonecrown opaque silhouette components: 1                     PASS
banshee opaque silhouette components: 1                       PASS
shark sweep: 61 rows x 2 variants = 122 textures              PASS
procedural creature textures: 11                              PASS
DPR: 2                                                        PASS
```

## Rev 4 (living art + shark rig)

Implemented the binding Rev 4 art contract in `sharkart.js`:

- Added `RF.Art.bakeSharkRig(scene, def)`, cached by `def.id`, returning
  separate body, caudal tail, mirrored-ready pectoral, and tier-5+ lower-jaw
  texture keys plus body-local pivots and CSS size. The body bake excludes the
  caudal fin and pectorals; tail and pectoral roots are at the required canvas
  edges.
- Kept `bakeShark(..., 'thumb'|'menu')` as single-texture legacy variants with
  their existing dimensions. Play and rig art use title-owned DPR backing
  stores with tight part boxes for the iOS memory law.
- Modernized shark and fin shading: five-stop countershade, dorsal rim light,
  screen gloss band, multiply ambient occlusion, deterministic two-tone
  speckles, tier-scaled iris/pupil/catchlight eyes, and shadow-blurred FX
  halos. Patterns remain multiply-clipped over the base gradient.
- Modernized procedural ray/turtle/sword/squid/grazer/calf, translucent jelly,
  rusted mine, and shaded puffer passes. Kenney sprite keys remain untouched.

Rev 4 proof:

```text
node --check play/razorfin/sharkart.js                         PASS
RF.Art.__selftest()                                           PASS
5 rigs: reef, hammerhead, snapjaw, ironfin, leviathanrex      PASS
rig cache at DPR 3: 5.70 MB                                   PASS (<80 MB)
single-silhouette gates: hammerhead/whaleshark/gravewater/
  bonecrown/banshee                                           PASS (1 each)
legacy shark sweep: 61 rows x play/menu = 122 textures        PASS
full rig sweep: 61 sharks, 233 part textures                  PASS
full rig cache at DPR 3: 68.84 MB                              PASS (<80 MB)
thumb sweep: 61 textures; 21.11 MB at DPR 3                   PASS
procedural creature textures: 11                              PASS
```

## Rev 5 (caricatured predator roster)

Reworked only `sharkart.js` for the Lane D art review targets while keeping
the Rev 4 rig contract unchanged:

- Rebalanced ordinary bodies toward a 2.04:1 to 2.5:1 muscular barrel, moved
  max girth forward, and kept eels plus mako/thresher rows sleek.
- Rebuilt the shared face read around a 36% head mass: large filled mouth
  cavities, deep underbite/overbite lips, readable upper and lower triangular
  teeth from tier 2, denser gills, and a brow ridge over a larger iris/pupil
  eye. Act 2 and 3 eyes use colored glow/iris treatments; Act 1 eyes stay
  dark and determined.
- Enlarged and raked dorsal/caudal silhouettes. Tier 9+ rows gain connected
  dorsal plates, tier 11+ rows gain underside fin-rakes, and all remain
  rooted under the body fill so the silhouette stays connected.
- Raised palette chroma centrally, deepened the dark-back to bright-belly
  contrast, added three curved muscle bands, and increased deterministic
  speckle/scar/plate/spike seam detail while retaining clipped vector passes.
- Preserved `bakeSharkRig` body-canvas-absolute pivots, the pectoral root,
  the tail attachment at the LEFT edge of the tail canvas, and single-texture
  thumb/menu variants.

Rev 5 proof:

```text
node --check play/razorfin/sharkart.js                         PASS
RF.Art.__selftest()                                           PASS
legacy shark sweep: 61 rows x play/menu = 122 textures        PASS
full rig sweep: 61 sharks, 233 part textures                  PASS
full rig cache at DPR 3: 77.76 MiB                            PASS (<80 MiB)
thumb sweep: 61 textures; 21.11 MiB at DPR 3                 PASS
leviathanrex sampled colours: 5620                           PASS (>64)
special silhouette gates: 5 heads, 1 component each           PASS
```

## Rev 3D (Lane D, Razorfin 3D rebuild)

Implemented `shark3d.js` as an ES module importing the fleet Three.js build
through the `three` import map and attaching `window.RF.Art3D`.

Mesh approach:

- Each shark uses a cached 14 to 20 station elliptical spine with 12-sided
  low-poly sections. Radii are forward-heavy for chunky caricature mass, with
  vertex-color dorsal darkening, saturated flank color, pale belly color, and
  deterministic pattern bands/spots/marks.
- Tail, pectorals, and tier-5+ lower jaw are independent meshes. Tier-2+
  mouths have dark cut geometry and white cone teeth at rest. Jaw rotation is
  CPU-driven by bite state. Eyes use sphere, iris, catchlight, brow geometry,
  and Act 2/3 emissive channels.
- All geometry is cached by shark id. Toon materials share one procedural
  four-band gradient map. Glow palettes drive plates, lure spheres, arc rings,
  and crack/rune decals. `billboard()` accepts a canvas, texture, or baked-art
  key and caches transparent double-sided plane materials.

Archetype geometry:

- `point` and `blunt`: tapered or broad front station profiles with fins and
  attitude brows.
- `hammer`: low-poly T-bar cephalofoil and bridge.
- `saw` and `croc`: forward rostrum meshes with repeated teeth.
- `whale`: front-third bulk, wide feeding mouth, and baleen bars.
- `angler`: oversized underbite jaw, stalk, and glowing lure sphere.
- `eel`: elongated, reduced-radius station profile.
- `rock`: faceted body and jagged plates.
- `mech`: beveled panel insets and glowing fin thrusters.
- `skull`: bone crest cones and dark sockets.
- `void`: smooth sweep ring and alien eye.
- `kaiju`: dorsal cone-plate row from nose toward tail.

Budget and proof:

```text
node --check shark3d.js                                      PASS
node module import with `three` mapped to vendored r160 build              PASS
RF.Art3D.__selftest()                                        PASS
representative heads: reef, hammerhead, snapjaw, anglerfang,
                      ironfin, leviathanrex                    PASS
61/61 shark build sweep                                      PASS
representative triangle counts: 748, 968, 1292, 1316, 1392, 1345 PASS
max triangle budget                                          <= 3500 PASS
tail oscillation: 120 animation steps                        PASS
geometry cache estimate: 0.955 MB                           PASS (<120 MB)
```

## Rev 3D fix pass (D3 body visibility)

Root cause: `bodyVertexColor()` called `lerpColor(palette.belly, WHITE, ...)`
with `WHITE` as a numeric hex value, while the helper passed it directly to
`THREE.Color.lerp()`. Three accepted the invalid component reads as `NaN`, so
357 body color channels were non-finite and the vertex-color multiply made the
flank render as a near-black silhouette. The same helper is now numeric-hex
safe, which also fixes the numeric eye/brow/crest blends.

The shared toon ramp is now an explicit four-texel grayscale luminance
`DataTexture`/`CanvasTexture`: `NearestFilter` for both filters, no mipmaps,
explicit `NoColorSpace`, and `needsUpdate = true`. No per-rig fill light was
added: after the invalid vertex colors were removed, the specified hemisphere
(`sky #9fd4e8`, `ground #06121e`, intensity `0.95`) plus above/front
directional (`0xffffff`, intensity `0.85`) lights fully illuminate the fixed
side-view flank without multiplying the scene's light count for every rig.

Facing verification: the body spine's nose cap is at the maximum positive X
vertex and the caudal tail is attached at negative X. `rfForwardAxis = '+x'`
and a render-free self-test assertion now protect that convention; the engine
continues to apply its existing left-travel flip while preserving
`group.userData.baseScale`.

Fix-pass proof:

```text
node --check play/razorfin/shark3d.js                         PASS
module import with `three` mapped to vendored r160 build                  PASS
RF.Art3D.__selftest()                                        PASS
body vertex channels: finite across 61/61 shark bodies       PASS
reef mean linear body luminance: 0.404 (> 0.25)              PASS
gradient ramp: 4 distinct texels, NEAREST, updateVersion 1  PASS
nose convention: +x across 61/61 shark bodies                PASS
triangle budget / tail animation / cache budget               PASS
```

## ART-01 round fix (Lane D3, 2026-08-19)

Reworked only `shark3d.js` for the blocking Razorfin 3D art verdict. The
caricature now lives in geometry rather than palette claims:

- `ART-01` Leviathan Rex has a dedicated kaiju head contour, a 51% measured
  front-head share, heavy act-3 brow shelves, emissive menace eyes, an
  extruded connected mouth cavity, a deep lower jaw, and rooted upper/lower
  tooth rows. Its jaw bbox volume ratio is 0.279 and its tail bbox share is
  1.158. The eight dorsal plates are dark-bodied, emissive-edged, and offset
  toward camera at z=1.3 radiusZ, above the body dorsal maximum.
- The other 13 live head archetypes plus the retained `frill` contract probe
  use explicit nose-to-jaw contours. Tier 5+ rows are gated at face share
  >=0.28 and jaw volume ratio >=0.045. Tier 10+ tails are gated for a
  tier-scaled caudal bbox, with the kaiju threshold at >=0.72.
- Every non-kaiju species receives an assertive tier-scaled dorsal fin. Act 3
  brow geometry is present for every head, and Act 2/3 eye channels remain
  emissive. A dark, slightly expanded backface shell supplies silhouette
  edge contrast while the body retains saturated vertex color blocks.
- `PERF-03` teeth, plates, eyes, brows, mouth cavities, and static head
  features merge into per-material BufferGeometry batches per shark. Jaw
  teeth are one merged animated child rather than individual draw calls.
- `TEST-01` now checks face share, jaw volume, kaiju plate exposure, tail bbox
  share, connected mouth cavities, 14 head identities, and feature batching.
  The actual art gate remains the orchestrator screenshot at the gameplay
  camera, not this headless geometry proof.

Proof command:

```text
node --check shark3d.js                                      PASS
node module import via vendored Three r160 loader             PASS
RF.Art3D.__selftest()                                        PASS
61/61 shark build sweep                                      PASS
14 head identities, color finiteness, +x nose                PASS
kaiju face/jaw/tail/plate exposure and batching gates         PASS
worst case: leviathanrex, 2,204 triangles                    PASS (<=3,500)
geometry cache estimate: 1.211 MB                            PASS (<120 MB)
tail oscillation: 120 animation steps                        PASS
```

## Rev 3D D3 fix pass (body emissive ownership, 2026-08-19)

Controlled in-page comparison isolated the mint wash to the shared kaiju body
`MeshToonMaterial`: its `palette.glow` emissive was applied to every body
pixel. `shark3d.js` now gives the body, tail, pectorals, and lower jaw black
emissive with zero intensity. Structural head masses, snouts, plates, fins,
mouths, teeth, and panels are also non-emissive, so the authored dark body
palette remains saturated and the silhouette shell stays dark.

Glow ownership is explicit and feature-only:

- Act 2/3 eye, iris, brow, plate rim, lure, thruster, skull socket, and void
  details use separate emissive materials at `0.78` to `0.90` intensity.
- Pattern veins/decals (`cracks`, `runes`, `faults`, `magma`, `rot`, `corona`,
  `rays`) and plate/panel identities have feature meshes instead of glow mixed
  into body vertex colour.
- Every non-`none` `sil.fx` key receives a named emissive feature anchor, with
  dedicated feature families for veins, arcs/rings, frost/ice shards, halos,
  and dorsal/charge details. No archetype uses a full-body rim mood, so there
  are no per-archetype body-emissive exceptions to justify.

The self-test now audits all 61 roster rows: structural body materials must
have black emissive and intensity `<= 0.05`, feature emissive intensity must
stay in `0.6..1.0`, and every species with a non-`none` `sil.fx` must expose a
glowing feature mesh.

Proof:

```text
node --check play/razorfin/shark3d.js                         PASS
vendored Three r160 module import                             PASS
RF.Art3D.__selftest()                                        PASS
61/61 species structural emissive audit                      PASS
41/41 non-none sil.fx rows have named glow features           PASS
body emissive black: body/tail/pectoral/jaw                  61/61 PASS
worst case: leviathanrex, 2,300 triangles                    PASS (<=3,500)
geometry cache estimate: 1.276 MB                            PASS (<120 MB)
```

## Value calibration round (Lane D3, 2026-08-19)

The previous emissive ownership fix exposed a second problem: the authored
Act 3 base/accent values were valid colours but too dark to survive the toon
multiply at gameplay distance. The shared body ramp now keeps the authored hue
while lifting the flank and belly into explicit value bands:

- Toon gradient texels are `0.40 / 0.65 / 0.84 / 1.00` (NEAREST, linear,
  `NoColorSpace`). The top lit step is `1.00`.
- The dorsal block begins at topness `0.75`, which is the upper 25% of the
  body. Its authored base hue is capped at luminance `0.22` so the ridge stays
  the darkest region without the former `base * 0.42` black crush.
- Flank colour is a saturated base/accent blend lifted to luminance
  `0.36..0.52` (base lift target `1.38x`, clamped), and the belly is lifted to
  luminance `0.78` when the source palette needs it. Tail vertex colours use
  the same calibrated flank/belly pair.
- Act 3 eyes are larger and more camera-exposed, with bright sclera and a
  double-sided emissive glow ring. Leviathan's dorsal rims use front-facing
  geometry with corrected winding, `#a3fff3`, and emissive intensity `1.00`;
  the dark plate bodies remain non-emissive.
- The self-test measures radial body bands directly and spot-checks Reef (Act
  1), Snapjaw (Act 2), Ironfin (Act 3), plus Leviathan Rex. Required means are
  ridge `<=0.30`, flank `0.30..0.65`, and belly `>=0.70`.

Proof:

```text
node --check play/razorfin/shark3d.js                         PASS
vendored Three r160 module import                             PASS
RF.Art3D.__selftest()                                        PASS
body bands Reef:       ridge 0.250 / flank 0.375 / belly 0.824 PASS
body bands Snapjaw:    ridge 0.196 / flank 0.363 / belly 0.780 PASS
body bands Ironfin:    ridge 0.202 / flank 0.362 / belly 0.780 PASS
body bands Leviathan:  ridge 0.107 / flank 0.361 / belly 0.780 PASS
gradient ramp: 0.40 / 0.65 / 0.84 / 1.00; top step 1.00       PASS
61/61 shark build sweep                                      PASS
worst case: leviathanrex, 2,500 triangles                    PASS (<=3,500)
geometry cache estimate: 1.405 MB                            PASS (<120 MB)
tail oscillation: 120 animation steps                        PASS
```

## Final color-commitment round (Lane D3, 2026-08-19)

Recut only the vertex-color scheme in `shark3d.js`; geometry, budgets, caches,
normalization, and feature/material ownership remain unchanged:

- The body is now three hard radial blocks: saturated/deep `palette.base` on
  the dorsal third, a bright high-chroma `palette.accent` family flank, and a
  pale belly. Block boundaries select whole vertex rows; there is no
  cross-block colour lerp. Pattern marks remain discrete accent hits inside a
  block.
- Act 3 bodies add a saturated glow-hue rim on the flank row immediately above
  the belly line. Leviathan Rex therefore carries its teal-green identity in
  the body vertex colors, independently of teeth, plates, eyes, or brows.
- `RF.Art3D.__selftest()` now computes per-vertex HSV and mean-block RGB
  distance for every roster row. It asserts flank saturation `>= 0.45`, flank
  value `0.45..0.75`, and both adjacent block distances `>= 60` RGB units.

Block scheme summary by act:

- Act 1: deep saturated base dorsal / vivid accent flank / pale belly.
- Act 2: the same three blocks, with the existing feature-owned glow accents.
- Act 3: deep saturated base dorsal / glow-hue rim plus vivid accent flank /
  pale belly.

Spot-render sanity for the requested trio (headless vertex-color spot proof;
the in-app browser surface was unavailable for a new screenshot in this run):

```text
Leviathan Rex: flank HSV S 0.855 / V 0.720; glow-rim H 0.473;
                dorsal-flank RGB 186.2 / flank-belly RGB 155.8 PASS
Great White:    flank HSV S 0.773 / V 0.560; dorsal-flank RGB 88.7;
                flank-belly RGB 247.9                         PASS
Vex:            flank HSV S 1.000 / V 0.560; dorsal-flank RGB 98.7;
                flank-belly RGB 291.2                         PASS
```

Final proof:

```text
node --check shark3d.js                                      PASS
vendored Three r160 module import                             PASS
RF.Art3D.__selftest()                                        PASS
61/61 shark build sweep                                      PASS
all 61 flank HSV/chroma/value and hard-edge gates             PASS
all Act 3 glow-rim hue gates                                  PASS
worst adjacent block distance: 63.2 RGB units                PASS (>= 60)
worst case: leviathanrex, 2,500 triangles                    PASS (<= 3,500)
geometry cache estimate: 1.405 MB                           PASS (<120 MB)
```
