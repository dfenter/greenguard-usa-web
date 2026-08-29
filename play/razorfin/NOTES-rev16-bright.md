# NOTES rev16 — lane BRIGHT (engine3d.js / shark3d.js)

Owner: `engine3d.js`, `shark3d.js`. Read-only: `hse/skin_identity.js` (DISTINCT lane).
Evidence: `hse/evidence/r16-bright/`.

**Result: the in-game shark was not "too bright". It was rendering its
countershade UPSIDE DOWN.** Measured dorsal-minus-belly was **negative** —
bright back, dark belly — which is the exact inverse of a shark, and is what
made the body read as a bleached white tube with no form.

Final in-game (hawaii, player = reef on the `thresher` bake):

| | median L | dorsal | belly | countershade |
|---|---|---|---|---|
| before | **0.769** | 0.868 | 0.687 | **−0.181** (inverted) |
| after  | **0.486** | 0.318 | 0.741 | **+0.423** |
| gate   | 0.40–0.55 | — | — | ≥ +0.15 |

Second level (lagoon): 0.772 → **0.506**, countershade −0.166 → **+0.413**.
Both gates PASS on both levels.

---

## Root cause: `measureBindUp` returns the dorsal axis INVERTED

`hse/skin_identity.js:1226`:

```js
      spikeSign: maxPos >= maxNeg ? -1 : 1,
```

The metric finds the dorsal fin as a one-sided **spike** off the midbody
median. When `maxPos > maxNeg` the spike — and therefore the dorsal — is on
the **+axis** side, so the sign must be `+1`. It returns `-1`.

Measured off the shipped GLBs (`scratchpad/r16_axis_offline.mjs`), all four
Rev 16 approved bakes select axis 1 with the spike on +Y and all four come back
`(0,-1,0)`:

| bake | long axis | spike axis | maxPos | maxNeg | returned bindUp |
|---|---|---|---|---|---|
| thresher | 2 | 1 | 0.687 | 0.313 | `(0,-1,0)` |
| whaler | 2 | 1 | 0.647 | 0.353 | `(0,-1,0)` |
| greatwhite_cy | 2 | 1 | 0.839 | 0.161 | `(0,-1,0)` |
| tigershark | 2 | 1 | 0.588 | 0.412 | `(0,-1,0)` |

Independently confirmed (`scratchpad/r16_fin.mjs`) that +Y really is the fin:
the +Y side reaches further AND holds far fewer vertices in its outer band,
i.e. a thin spike, while −Y is the broad belly bulge.

```
thresher       reach +0.687 / -0.313   verts in outer 15%:  +Y=39   -Y=52
whaler         reach +0.647 / -0.353   verts in outer 15%:  +Y=182  -Y=308
greatwhite_cy  reach +0.839 / -0.161   verts in outer 15%:  +Y=96   -Y=120
tigershark     reach +0.588 / -0.412   verts in outer 15%:  +Y=89   -Y=306
```

Live in-game the player shark carried `bindUp = worldUp = (0,-1,0)` with no
rotation anywhere in its parent chain — dorsal pointing at the sea floor.

### Why that bleaches the shark rather than just flipping it

Two compounding effects, both in `rfIdCountershade`:

1. **The band is applied upside down.** `BELLY_VALUE_MIN = 0.93` (near-white)
   lands on the **back**, `DORSAL_VALUE_MAX = 0.15` on the belly.

2. **The hemi compensation runs backwards and then saturates.**
   `hemiBias = worldUp.y * 0.30` = **−0.30**, so

   ```
   backValue  = clamp(0.15 + ident + 0.30, 0.04, 0.42)  -> pinned at the 0.42 CEILING
   bellyValue = clamp(0.93 + 0.35*ident - 0.30, 0.62, 0.99) -> ~0.63, at the FLOOR
   ```

   Both ends clamp, the band collapses to a narrow bright 0.42–0.63, and the
   dorsal is stuck at its maximum for **every row regardless of its hide**.

That is why the whole brief's suspect list came back inert. With `backValue`
saturated against a clamp, the albedo controls have no authority left:

| toggle (live uniform, in-game) | median L |
|---|---|
| baseline | 0.756 |
| `uRfIdBellyMin` 0.93 → 0.50 | 0.756 |
| `uRfIdDorsalMax` → 0.15 | 0.759 |
| `uRfIdValueSpan` → 0 | 0.758 |
| `uRfIdChromaLock` → 0 | 0.716 |
| `uRfRimStrength` → 0 | 0.772 |
| `uRfWetness` → 0 | 0.756 |
| `uRfCounterGain` → 0 | 0.745 |
| `uRfSaturation` → 0 | 0.752 |
| `uRfIdGlowStrength` → 0 | 0.756 |
| `uRfIdMicroAlbedo` → 0 | 0.756 |
| scene `environmentIntensity` → 0 | 0.720 |
| renderer exposure 0.92 → 0.50 | 0.718 |

No additive/emissive/unlit term, no over-driven albedo, no PMREM blowout — the
band itself was clamped. Flipping the axis alone moved it 0.756 → 0.640 and
countershade −0.19 → **+0.47**.

---

## THE PATCH FOR THE READ-ONLY FILE (DISTINCT lane must apply)

`hse/skin_identity.js`, line 1226, one character of intent:

```diff
-      spikeSign: maxPos >= maxNeg ? -1 : 1,
+      /* Rev 16: the dorsal fin IS the spike, so the side with the greater
+       * peak reach is the DORSAL side. This returned -1 there, which handed
+       * every one of the four approved bakes a dorsal axis pointing at the
+       * sea floor: the near-white belly band (0.93) was painted on the back
+       * and hemiBias flipped to -0.30, pinning backValue against its 0.42
+       * clamp. Measured in-game that is a NEGATIVE countershade (-0.18) and
+       * a body median of 0.77 - the bleached shark. See NOTES-rev16-bright.md. */
+      spikeSign: maxPos >= maxNeg ? 1 : -1,
```

Please re-check `skewSign` (line 1228) against the same convention while you
are in there — it was written to match the old spike polarity, and the two
must agree or the short-finned bakes that fall through to skew will invert
instead. I did not measure the skew fallback because none of the four approved
bakes reach it (all four score well above `SPIKE_DEGENERATE`).

`BAKE_SIGN_FLIP` is deliberately NOT the right fix here: it is a per-bake
escape hatch and this is wrong on every bake, which is the signature of the
rule itself being inverted.

---

## What I changed in my own file

`engine3d.js`, `LIGHT_RIG` only — two numbers, both justified by measurement.

**`sunIntensity: 1.60 -> 2.60`** (restored). The 1.60 was a previous pass
chasing this symptom. The bisect shows it bought nothing: on the inverted axis
sun 3.10 → 1.60 moved the body median 0.756 → 0.756. It only cost the specular
hotspot, so it goes back up now that the cause is fixed.

**`exposure: 0.92 -> 0.76`.** This is the second half and it is only meaningful
once the axis is right — on the broken axis, exposure was nearly inert on the
body (0.92 → 0.50 moved the median just 0.762 → 0.718).

Why exposure and not the light rig: with the axis fixed, the rendered belly
sits at ~0.80 almost regardless of what the ALBEDO says (belly floor 0.93 →
0.62 moved the rendered belly only 0.802 → 0.792) and regardless of fill/rim/
env (`fill 0.85→0.30, rim 1.55→0.45, env 0.85→0.25` moved the belly 0.801 →
0.791 while only the dorsal darkened). The belly is past the ACES shoulder
where the curve is flat, so a global multiply **ahead** of the curve is the
only lever with authority left.

Measured, axis fixed, blob-masked:

| exposure | median L | countershade |
|---|---|---|
| 0.80 | 0.595 | +0.440 |
| **0.76** | **0.512** | **+0.412** |
| 0.72 | 0.454 | +0.424 |
| 0.68 | 0.434 | +0.423 |
| 0.64 | 0.415 | (dorsal starting to crush) |

Nothing in `shark3d.js` needed to change.

### DOC standalone is unaffected, by construction

`assets/bakeview/index.html` sets no tone mapping and no exposure at all
(three plain lights, no env map); `hse/headview.html` hardcodes its own
`toneMappingExposure = 1.06`. Neither reads `LIGHT_RIG`. So the DOC render
tone cannot move with this change. (This also explains the 0.39-vs-0.75 gap in
the brief: DOC has no ACES shoulder, no exposure and no PMREM on top of a rig
roughly 3x dimmer overall.)

---

## Measurement rig fixes (mine, in scratchpad/)

Two rig bugs had to be fixed before any of the above could be trusted.

**`scratchpad/shark_lum.mjs` served every asset as `text/html`.** The dev
server set `content-type: text/javascript` for `.js` and `text/html` for
everything else, so `.glb`, `.png` and `.ktx2` all arrived as HTML. GLTFLoader
and the texture decode failed silently and the probe was measuring an
untextured 3-material / 566-triangle placeholder rig, not the game's shark.
Now serves real MIME types. Symptom to recognise: `sceneTexMats: 0`,
`sceneSkinned: 0`, console `Texture marked for update but no image data found`.

**`scratchpad/shark_body.py`'s achromatic mask also admits pale water.** The
projected rig bbox is far taller than the animal when it pitches, so the median
drifted with however much empty water the box happened to cover (same frame
scored 0.685 loose vs 0.581 tight). Added **`scratchpad/shark_blob.py`**, which
keeps only the largest 4-connected achromatic blob — the animal — and also
reports dorsal/belly/countershade. All headline numbers here are blob-masked.

`scratchpad/shark_body.py` is left untouched for continuity with earlier lanes.

### Probes added
- `scratchpad/shark_blob.py` — blob-masked body median + countershade (the gate)
- `scratchpad/shark_shade.py` — dorsal/belly split on the loose mask
- `scratchpad/r16_bisect.mjs` — live one-uniform-at-a-time toggle table
- `scratchpad/r16_axis_offline.mjs` — replays `measureBindUp` against the GLBs
- `scratchpad/r16_fin.mjs` — independent fin-polarity check (reach vs vertex count)
- `scratchpad/r16_evidence.mjs` — pose-frozen before/after shot
- `scratchpad/r16_prog.mjs`, `r16_dump.mjs` — compiled-program / live-uniform introspection

A note for whoever probes this next: a runtime `onBeforeCompile` override plus
`needsUpdate` does **not** force a recompile on a material three has already
cached — I verified the injected marker was absent from the compiled source.
Term-isolation experiments done that way silently measure the unmodified
shader. Prefer live uniforms, which do take effect.

---

## Selftests

`node --import ./tools/reg.mjs tools/selftest.mjs art3d game world`

- `game: pass=true ok=394 fail=0`
- `world: pass=true ok=380 fail=0`
- `art3d: fail=1` — `reef: textured face eye seat median 0.1678 off the head
  surface`. **Pre-existing**: reproduced with my two LIGHT_RIG numbers reverted
  to 1.60/0.92. Face-mount geometry, not this lane.

(`green` is not a selftest target — it reports `unknown target green`.)
