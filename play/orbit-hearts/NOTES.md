# Orbit Hearts

Controls: tap anywhere to advance the line, tap again to finish it instantly, tap a choice to answer. Tap the glimmer in the scene to keep a memory fragment. Buttons under the text box open the log, auto play, skip read and saves. Keyboard: space or enter advances, arrows move between choices, number keys pick a choice or a puzzle target, L log, S saves, A auto, R skip read, M take the fragment, Esc settings.

Goal: play the shared prologue, pick one of three people on Vireo Station, and carry a route through five chapters. Choices and interactive scenes move an affinity meter, memory fragments hide in the scenery, and both together decide which of three endings you land.

Replay: nine endings, eighteen memory fragments, fourteen gallery scenes. Saves are three slots plus an autosave that restores the exact line, affinity, flags and fragments.

Free by design: every route, chapter, ending and fragment is open from the first minute. No currencies, energy, timers or purchases.

## AAA rebuild

Implemented: Phaser 3 from `/play/_shared/` with GGKit as the only lifecycle, pointer identity, guarded save, audio bus, loading screen, settings and juice implementation. Fixed step simulation at 60 Hz with a four step cap. Every frame of art is composed procedurally in code and baked into canvas textures during the loading screen, so no Graphics command list is replayed at runtime and no `Graphics.arc` is used anywhere.

Presentation and pacing: typewriter text at three speeds with instant complete on tap, portrait expression swaps on the beat with idle bob, talk sway, react overshoot and blink states, choice timers that pause with the game and can be switched off in settings, a backlog of 140 lines with jump back that rewinds affinity and flags with you, auto play at three paces, skip read that only fast forwards lines already seen and drops out on a new line, and save slots that restore mid scene exactly.

World: six authored station locales composed from gradients, structures and light bands, each with three parallax layers and a time of day light shift (day, dusk, night). Observation deck, hydroponics Greenloop, spin ring C, docking ring bay four, archive core, and the orbit finale.

Content tables:

| Route | Character | Chapters | Scenes played | Alternate scenes | Branch |
|---|---|---|---|---|---|
| Prologue | Nel Obarro | 0 | 5 | 0 | none |
| rell | Rell Ossandro, ring engineer | 5 | 20 | 4 | cover or report the off manifest part |
| ivane | Ivane Quill, Greenloop botanist | 5 | 20 | 4 | splice or wild stock |
| cass | Cass Amaru, courier pilot | 5 | 20 | 4 | take the circuit or fly the loop |

77 authored scenes, 372 dialogue lines, 35 choice points, 19 interactive scenes, 14 gallery scenes, 20 memory fragments (2 prologue, 6 per route).

| Interactive scene | Type | Appears | Reward |
|---|---|---|---|
| Beat sync (torque, pollen, docking, ring pulse, grow cycle, approach trim, first bloom, long spin, launch count) | sync | 9 | up to +3 affinity |
| Glyph decrypt (archive index, central cipher, seed index, courier cipher) | decrypt | 4 | up to +3 affinity |
| Constellation trace (spore map, lane plot) | trace | 2 | up to +3 affinity |
| Zero g drift (hull walk, seam nine, vault drift, bay four drift) | drift | 4 | up to +3 affinity |

| Ending tier | Requirement | Per route |
|---|---|---|
| Drifting | affinity below 20 | 1 |
| Steady | affinity 20 or more | 1 |
| True | affinity 26 or more and five of six fragments | 1 |

Affinity ceiling per route is 33. The tier thresholds preserve the prototype ratios from `TIERS [14, 11]` of 18 (0.778 and 0.611).

Preserved prototype behaviors (regression checked): the three beat rhythm date with `TRAVEL 1.15`, target `TR 46`, `WIN 26` and `PERF 10` windows and the 0.42 and 0.8 second gaps, now at difficulty two with 1.35 and 1.0 second travel at difficulties one and three; three love interests with the original names, roles, colors and blurbs; the mid route branch that rewrites chapter three; nine endings with the original ids and titles; the constellation map on the title screen that lights a star per ending found; best affinity per route persisted; every route open from the start with no currency; tap to advance with instant complete.

Audio inventory (all original, mono mp3, no ogg): three music beds, `music-drift` for the title, `music-station` for story scenes, `music-orbit` for the orbit locale and endings, each a seamless loop that lazy loads after the first interaction. Fifteen sound effects on the GGKit sfx bus: tap, type, choose, heart, memory, perfect, good, miss, lock, thrust, page, chapter, ending, ui, deny.

Particle systems (all pooled, all reduced motion aware): heart burst on affinity gains, star sparkle on fragments and puzzle beats, expanding ring shockwave on rewards, and ambient locale motes tinted per locale.

UI law: one transient at a time, corner chips for in play events, center banners only at chapter boundaries and endings, a thin fading coach strip at the top edge, icons and meters instead of labels in the HUD, 44 pixel touch targets, and no reading text under 14 pixels.

Verification hook: `window.__oh.state` reports mode, phase, stage, route, chapter, progress, score, health, affinity ceiling, fragments, endings, current interactive scene and ending id, refreshed every few frames. `window.__oh.forceMode` accepts title, routes, story, gallery, saves, log or ending, and `window.__oh.forceStage` accepts a scene id, a route id or an ending id. Both are read at boot and live.

Verified locally against a static server at 390x844, dpr 2: first frame renders, zero console errors and zero failed requests on every pass. A scripted playthrough walked the prologue and the whole Rell route, 25 scenes, to the Torque And Trust ending with no errors. Choice timer expiry, save slot round trip, backlog jump back, auto advance, skip read, settings pause, fragment collection and persistence, and all four interactive scene types were each driven and probed. Rendered frames measure 125 to 332 distinct colors at four bits per channel and are fully non black.

Bugs found and fixed during verification: keyboard edges shorter than one frame were dropped by per frame polling, so a window level keydown queue now feeds the action layer; a fragment could become unreachable when conditional lines shortened a scene, so the glimmer line index is clamped into the filtered line list; the fragment hit zone lost the reverse hit scan to the advance zone, so it is now registered last; and interactive scenes awarded affinity past their own three point cap.

Deferred: the 4x CPU throttle frame trace is not trustworthy from this box. The median frame time measured a clean 16.7 ms in story, beat sync, zero g drift and title, but the machine carried a load average above 250 during the capture and produced multi hundred millisecond stalls in every scene including the static title, so the frames over 33 ms figure is environmental. That trace and the deployed URL gate belong to the orchestrator harness on an uncontended box.

## Retina pass 2026-08-16

- Audit profile: CSS viewport 390x844 at DPR 3. Measured pre-pass backing-store ratio: 1.00x. FIT scale math after the pass measures 1170x2532 against the 390x844 CSS canvas, a 3.00x ratio.
- Recipe: `GGKit.hiDpi.factor(390, 844)`, dense FIT scale dimensions, `GGKit.renderDefaults`, and `this.cameras.main.setZoom(f)` in PlayScene. Phaser text resolution now follows the same factor.
- Factor cap: none. The factor is the GGKit native value, capped only by GGKit's normal maximum of 3.
- Could not complete live headless canvas readback or a gameplay screenshot because no browser backend was available in this environment. `node --check` passed.


## Blank frame repair

Symptom: at CSS 390x844 / deviceScaleFactor 3 the title booted clean, the render loop
advanced, the backing store measured 3x, and the frame was blank.

### Root cause

The retina conversion raised the backing store to design x factor and applied
`cameras.main.setZoom(factor)`, but a zoomed Phaser camera transforms about its
ORIGIN, which defaults to the centre of the viewport. With scroll 0 a design-space
point x therefore lands at `zoom*x - (width/2)*(zoom-1)`, i.e. the whole design box
sits one and a bit screens to the left of and above the viewport. The loop runs, the
scene draws, nothing is on screen, and there is no error anywhere.

This title is repaired with `cameras.main.setOrigin(0, 0)` alongside the zoom rather
than the fleet's `centerOn(DESIGN_W/2, DESIGN_H/2)`. Both put the design box back on
screen, but origin (0,0) additionally leaves scroll 0 meaning "design origin", so any
absolute `setScroll()` the title already performs (screen shake, world scrolling) and
any `setScrollFactor(0)` HUD stay correct in design pixels with no compensation. See
the per-title cause below for why that mattered here.

- The factor is named `HIDPI_FACTOR`, so the scripted pairing did not match. One
  `setZoom` site.
- Repair: `setOrigin(0, 0)` next to the zoom.
- Separate, unrelated release-gate failure also fixed here: PWA. `manifest.json` listed
  its icons with absolute `/play/orbit-hearts/...` srcs (every other title in the fleet
  uses a relative `icon.png`), and declared `icon.png` as 180x180, so there was no
  192x192 icon at all. `icon.png` was resampled 180 -> 192 and the two srcs made
  relative; the apple-touch-icon size in index.html was updated to match. NOTE FOR THE
  PWA LANE: this overlaps fleet-wide icon work, flag if it collides.

### Measured, by me, on a real gameplay frame

Release gate run serially (concurrency 1) against a local static server:
`node release_gate.mjs http://localhost:<port> 1 orbit-hearts`, headless Chrome,
390x844 at deviceScaleFactor 3, best of four post-interaction frames.

| | distinct colours (8-bit) | flattest colour share | backing/CSS ratio | gate |
|---|---|---|---|---|
| before | 1 | 100% | 3x | HOLD (art, pwa) |
| after | 19761 | 18.3% | 3x | READY (all checks pass) |

`node --check` clean on every file touched. No gameplay, balance, content or art
direction was changed.

## Release gate repair

2026-08-16, mobile release gate lane.

### PWA installability

The manifest declared `icon.png` as 192x192 when the file is actually 180x180,
and had no genuine 192. Added `icon192.png`, downscaled with LANCZOS from the
existing `icon512.png` master, declared it at 192x192, and re-declared
`icon.png` at its true 180x180.

Verified with `node release_gate.mjs http://localhost:8347 1 <slug>` from
/Users/lucille/ue-port-studio/aaa/harness, serially at concurrency 1, against
`python3 -m http.server 8347 --directory /Users/lucille/greenguard-usa-web`.

Gate verdict: **READY** (all checks pass).
