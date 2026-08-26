# Lane O3 status: verification harness and gates

Owned files: `hse/verify.mjs`, `hse/verify_gates.cjs`, `hse/verify_report.md`,
`hse/evidence/`, plus ONE delimited block in `shark3d.js` `__selftest()`
(marked `HSE lane O3 verification gates begin/end`). Nothing else is touched.

## What exists

- **`hse/verify.mjs`** - the harness. Boots the real game in headless Chrome at
  844x390 CSS / DPR 2 landscape, runs each row through `startRun`, screenshots
  via CDP, and scores the pixels. Run from `play/razorfin/`:
      node hse/verify.mjs                              # full 86-row roster
      IDS=reef,greatwhite node hse/verify.mjs          # subset
      BASELINE=hse/evidence/o3-baseline node hse/verify.mjs  # diff mode
      REPORT_FROM=hse/evidence/o3-baseline node hse/verify.mjs  # rebuild report only
      OUT=<dir> node hse/verify.mjs                    # evidence dir
- **`hse/verify_gates.cjs`** - synchronous gate surface for the art3d selftest.
  It PARSES the `GATES` table out of `verify.mjs` rather than copying it, so the
  selftest can never assert numbers the harness no longer uses.
- **`hse/verify_report.md`** - the single file the orchestrator reads.

## Gates

Pixel: flank saturation floor, back/belly countershade delta, pattern contrast
(patterned rows only, read off `sil.pattern`), pairwise distinctness across the
roster with the 10 closest pairs listed, eye highlight present, no background
bleeding through the body. Budget per row: draws, triangles, texture bytes.
Plus 0 console errors and a hard identity check.

## Six harness bugs found and fixed while building it

Recorded because each produced a confident, entirely wrong report:

1. **Body mask caught the whole scene.** Measuring "everything that is not the
   corner colour" scored HUD plates, kelp and rocks. Every row came back at the
   same hue 0.53 and an INVERTED countershade. Fixed by modelling the water per
   image row (it is a fog gradient, not one flat colour), masking the HUD, and
   clipping to the rig's projected bounding box, which the engine supplies.
2. **Flood fill escaped along scenery.** Even clipped, the blob leaked through
   the rocks and a kelp stalk touching the silhouette. The projected bbox from
   the live camera is what bounds it; pixel heuristics alone could not.
3. **Head crop showed the tail.** "The head is the leading third" is false:
   these rigs render facing left. Every eye gate read 0. Now the crop centres on
   the projected `Head` bone, so facing is measured, never assumed.
4. **Bleed counted concavities as holes.** A row-span test scored a perfectly
   solid great white at 47% see-through, because the notch between head and
   pectoral fin is not a hole. Now only genuinely enclosed pixels count.

5. **Countershade measured against the screen, not the body.** The sharks pitch
   as they swim, so a nose-down bank puts tail-belly and head-back in the same
   screen band and the same row read +0.248 in one run and -0.074 in the next.
   The metric now finds the body's long axis from the pixel covariance and
   measures across the perpendicular, so it tracks the shark's own dorsal-
   ventral axis. The SIGN is kept: taking min/max of the two sides would make
   the gate unsigned and a shark shaded upside down would trivially pass.

Also: the identity check immediately caught `asked tiger, scene has reef` - a
stale rig lingering in the scene after `endRun`. My bug, fixed by matching the
rig by id rather than taking the first one found, and it is exactly the class of
silent fallback the check exists to catch.

**Determinism**: the procedural swim wave scales with `speedFrac`, so captures
pin the player at rest and hold the pose for 40 frames before the shot.

6. **Double-closing the browser hung the run.** Adding a `finally` reaper while
   `captureChunk` still called `browser.close()` itself raced badly enough to
   wedge the run on a chunk boundary: 24 rows captured, process alive, no
   progress, 22 orphan Chrome processes. One owner for the lifetime now, the
   reaper, and the inner close is gone.

**Crash resilience**: a single page accumulating 86 WebGL scenes exhausts GPU
memory and Chrome dies around row 82, which lost a complete two-hour run in its
last 5%. The browser is now recycled every `CHUNK` rows (default 12), a failed
chunk is retried once, and rows lost to a crash are reported as named failures
rather than aborting the run.

## BASELINE: 12/86 rows pass, 0 console errors

Full roster, 86/86 captured and measured, no crashes. Evidence in
`hse/evidence/o3-baseline/` (86 full frames, 86 3x head crops, 86 thumbnails,
contact sheet, results.json). The report is `hse/verify_report.md`.

Passing: `cookiecutter mako blue thresher sawshark bull whaleshark megalodon
seismos leviathan_rex aphroditelure cyclopseye`.

Failure counts by class (a row can fail several):

| count | gate |
| --- | --- |
| 37 | texture bytes 10.67 MB > 8 MB |
| 28 | no eye highlight in head crop (0 bright px) |
| 24 | background bleeds through body |
| 34 | countershade below 0.06, 20 of them NEGATIVE (back brighter than belly) |
| 6 | pattern contrast below 0.10 on a row that claims a pattern |
| 1 | distinctness: `greatwhite`/`wreckfang` at 0.0493 |

Closest pair is `greatwhite`/`wreckfang` 0.0493 (under the 0.055 floor); the
next nine are 0.075 to 0.085, so the roster is broadly separated and this is a
single collision rather than a systemic sameness.

Confirmed by eye against the crops, so these are findings and not harness noise:

- `reef` (tier 1, the row every player starts on) renders as a FLAT brown
  dogfish: uniform top to bottom, no dark back, no pale belly.
- `hammerhead` is uniformly green, countershade about -0.01, `hueConc` 1.00
  (a single hue across the whole body), and no eye highlight at all.
- `reef` and `hammerhead` both carry floating black speck artifacts along the
  back and flank, visible in the full-frame shots.
- Texture budget: 37 rows report ~10.7 MB of maps against the 8 MB gate, which
  is the 1K-diffuse-plus-1K-normal estimate at RGBA8 with mips. Either the maps
  ship compressed or the gate moves deliberately. Flagged, not silently widened.

`mako` and eleven others pass every gate, which is the proof the pipeline can
produce a green row and that the failures above are about those rows rather
than about the harness.

**Threshold noise to be aware of**: rows sitting within a hair of a gate can
flip between runs. A diff probe showed `mako` bleed at 2.16% against a 2.00%
gate and `greatwhite` crossing back to passing. Treat a single-row flip near a
threshold as noise; treat a move of more than about 0.08 in a stat, which is
what the diff mode flags, as real.

## Milestones

- [x] Renderer, CDP capture, HUD-safe body isolation, contact sheet, thumbnails
- [x] Pixel gates, budget gates, distinctness matrix, diff mode
- [x] art3d selftest hook (delimited block, one require)
- [x] Baseline established against the current tree (12/86, 0 console errors)
- [x] Diff mode exercised against the saved baseline
- [ ] Re-run whenever another lane updates its STATUS file

## Notes for other lanes

Failures are REPORTED here, never fixed by this lane. Each failing row in
`verify_report.md` carries its row id and a 3x head-crop path so the owning lane
can look at the same pixels this harness scored.
