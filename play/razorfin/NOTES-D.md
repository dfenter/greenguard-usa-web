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
