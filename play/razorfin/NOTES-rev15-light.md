# NOTES rev15 — lane LIGHT (engine3d.js)

Owner: `engine3d.js` only. Evidence: `hse/evidence/r15-light/`.
Gate probe (new, mine): `hse/probe_lum.mjs` — renders the live game headless,
diffs a frame with and without the player rig to classify shark pixels exactly,
and reports median sRGB luminance of shark vs water plus the specular hotspot.

`node tools/selftest.mjs` → **pass=true ok=386 fail=0**.

---

## Measured result (rendered pixels, not geometry)

| scene | metric | BEFORE | AFTER | target |
|---|---|---|---|---|
| level 1, near surface | shark/water median L | **0.397** | **0.953** | >= 1.6 |
| abyss | shark/water median L | **0.446** | **1.933** | >= 1.6 |
| level 1, near surface | hotspot / shark median | 2.74 | 1.45 | present |
| abyss | hotspot / shark median | 2.85 | 1.63 | present |
| level 1, near surface | shark mean RGB | `[45, 97, 88]` | `[95, 167, 169]` | — |
| abyss | shark mean RGB | `[22, 68, 65]` | `[79, 154, 158]` | — |

**Abyss PASSES (1.93 vs 1.6 target). Surface does NOT (0.95).** The surface
miss has a single cause that is not in my file — see the handoff at the bottom.

The BEFORE numbers are the quantitative form of the owner's verdict: the shark
rendered **2.5x darker than the water it was swimming in**. A subject darker
than its own background cannot read at any exposure. Both zones now more than
doubled, and the abyss frame
(`hse/evidence/r15-light/after-abyss.png`) is the HSE look: lit dorsal, bright
belly, clean separation from deep blue.

---

## What was actually wrong (three causes, all fixed here)

**1. The hemisphere light WAS the water.** `world3d.js` (the atmosphere owner)
writes the hemisphere sky colour to the zone TINT every frame. So the single
largest contributor to the shark's diffuse was saturated cyan water colour.
That is the mechanical cause of "everything is dragged to cyan". Fixed by
inverting the rig's balance: ambient dropped 1.15 → 0.30 and the key raised
1.25 → 3.10, so FORM now comes from a neutral key that world3d does not own.

**2. There was no environment map at all.** `scene.environment` was null while
every shark body is `MeshStandardMaterial` at roughness 0.30–0.50 with a
wet-specular shader injection. A PBR material with nothing to reflect renders
as flat paint — the "no specular" half of the verdict. Fixed with a PMREM of a
procedural neutral sky/water gradient, built once at boot.

**3. The authored rig never reached the screen.** This one only showed up
because the probe measures pixels. `applyZoneAtmo` rewrites hemi and sun
intensity *every fixed step*, so authoring values at boot did nothing — a live
readback showed sun at `1.00` and hemi at `1.15` (world3d's `SUN_I0`/`HEMI_I0`),
not my `3.10`/`0.30`. `enforceLightRig()` now re-asserts colour **and**
intensity immediately before `renderer.render`.

**world3d's depth cue is preserved, not discarded.** world3d expresses depth as
a falloff from its own baselines, so the ratio it just wrote (`live / baseline`)
is its intended dimming for that depth. I multiply the authored intensity by
that ratio, with a `KEY_DEPTH_FLOOR` of 0.72 on the key so the subject never
falls back into the water. Deep zones get their darkness from fog and ambient,
not from switching the subject's key off.

## Owner override ("Avatar hybrid nonsense — just make them look like sharks")

Folded in. Everything this lane emits is natural daylight:

- key `0xfff6ec` warm-neutral daylight, **never cyan** (was being lerped toward
  `0xdff2ff` by world3d at depth; now re-stamped every frame)
- rim `0xffffff` **pure white**, no gel
- fill `0xdfe9f5` pale skylight (the real colour of open sky filling a shadow
  side outdoors, not a teal gel)
- PMREM gradient deliberately desaturated — whatever chroma goes in comes back
  out on every wet highlight in the game
- no purple / green / bioluminescent term anywhere in the rig

Four new selftest gates machine-check this by channel spread, so a future edit
cannot quietly reintroduce a coloured key or rim.

## Perf

Unchanged, as required. `castShadow = false` on all three directionals, no
shadow maps, no extra render passes, no new draw calls — two extra directional
lobes in the same forward pass. The PMREM is one 256x128 canvas fill and one
convolve, **once at boot**, rebuilt only on WebGL context restore.

---

## HANDOFF — the one thing an orchestrator must merge

**The surface water sheet is too bright, and it is in `world3d.js` (not mine).**

Proven, not assumed. I swept tone-mapping exposure across its whole usable
range and measured both subject and background at each stop:

| exposure | shark L | water L | ratio |
|---|---|---|---|
| 0.60 | 111.0 | 130.1 | 0.853 |
| 0.75 | 127.8 | 146.4 | 0.873 |
| 0.92 | 143.5 | 162.6 | 0.882 |
| 1.10 | 156.5 | 175.6 | 0.891 |
| 1.30 | 167.9 | 186.5 | 0.900 |

Exposure is a global multiplier — it moves shark and water together, so the
ratio is pinned near 0.88 no matter what I choose. **No value of any constant
in `engine3d.js` can fix the surface case.** The shark at the surface is
already at median 157 with a hotspot at 227, i.e. against the ACES shoulder;
pushing the key harder only clips the highlight and loses the specular.

The background is the half that has to move. The HSE reference
(`hse/evidence/r15-light/ref-hse-01.jpg`) makes this explicit: HSE's creature
reads bright because its water is **deep saturated teal**, whereas our shallow
zone paints a near-white sheet at luminance 165.

Requested patch, `world3d.js`, shallow zone only:

- `ATMO_ZONE_SCRIPT[0]` is `{ tint: 0x0b5364, fog: 0x3a8d9b }`, but the sheet
  the water is actually painted from is `gradientZoneTop()` →
  `saturateColor(lerpColor(script.tint, script.fog, GRADIENT_HAZE_LIFT), ...)`.
  Lower `GRADIENT_HAZE_LIFT` for the top band, and/or darken the zone-0 pair
  toward roughly `{ tint: 0x073a49, fog: 0x246375 }`.
- Target: **shallow submerged water median luminance ~95–105** (currently 165).
  At the shark's present 157 that lands the ratio at ~1.55–1.65, clearing the
  gate without touching the shark at all.
- Re-run `TAG=after node hse/probe_lum.mjs` from `play/razorfin/` to verify;
  it prints both scenes and writes the PNGs.

Nothing else needs hooking — the lighting rig is self-contained in
`engine3d.js` and needs no changes in any other lane.

**PARTIAL** — abyss passes at 1.93x with specular; surface at 0.95x is blocked
on darkening the shallow water sheet in `world3d.js` (exact patch above).
