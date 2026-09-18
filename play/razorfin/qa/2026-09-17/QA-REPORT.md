# Razorfin QA Report, 2026-09-17

Verdict: NOT SIGNED OFF. One FAIL, five WEAK, zero PASS. All evidence is headless Chrome on a Mac; no device was touched. Rulings below follow the adversarial gate (GATE.md) where it overrode a lane.

## Scorecard

| Area | Grade | Why |
|---|---|---|
| Controls | WEAK | Ring, breach, boost, bite constants verified in source. Lane's #1 claim (stick is not direct velocity) was wrong: throttle is a direct override (engine3d.js:2147). Real gap: no safe-area exclusion on the touch anchor. No playfeel measured. |
| Levels | WEAK | Maze, reachability, sky and gating are sound in source and the world selftest passes (380 ok). Draw-call "PASS" in the lane was unearned; per-level memory never measured. |
| Upgrades | WEAK | 86-shark roster and tier prices reproduce. Every runs-to-unlock figure rests on an unmeasured coins-per-run estimate (420 to 1,008). |
| Fish | WEAK | ENTITY_BUDGET is 32/120 in data.js; SPEC3D.md says 48/120 and memory says 110/220. Density never observed live. |
| Playability | WEAK | 8/8 selftests pass, zero failures, cold plain-load menu clean, 57 fps unthrottled. But 4x-throttle p95 is 166.7 ms and reproduces. |
| Fun | FAIL | 54 of 86 roster cards render two-letter monograms instead of shark art. Plus 11 near-white glow values that break the real-sharks art law. |

## Top findings

1. 63 percent of the roster is letters, not sharks. 54 of 86 cards show a monogram ("GW", "ES"), including every tier-11 and tier-12 flagship and Great White, Megalodon, Tiger, Bull, Hammerhead. Steady state, does not recover with time or scrolling. Counted identically by two independent methods (32 buildable / 54 withheld). It is intended iOS texture-budget behaviour (shark3d.js:3762 sets rfWithheld, :3958 returns null for textured bases at the menu), not a code defect. The gate graded it FAIL on product judgement: the store is where a 150,000-coin reward is shown, and it shows "GW". Evidence: GATE.md section 8, orchestrator/MENU-THUMB-BUG.md, playability/plainload_menu.png.
2. Throttled frame stalls are real and bimodal. Under 4x CPU throttle, 85 frames hit 16.7 ms exactly and the rest cluster at 8 to 12 missed vsyncs. That is discrete main-thread blocking (GC, sync allocation, shader compile), not fill cost, and that mechanism transfers to phones. Evidence: GATE.md section 3, playability/FINDINGS.md, orchestrator/PERF-RECHECK.md.
3. 11 sharks have near-white glows (mirrorscale is pure #FFFFFF; teslafang, voltaicrex, absolutezero, banshee, cyclopseye, glacier, bonecrown, hermesdart, aphroditelure, artemisstrike). Count is stable across lightness thresholds 0.75 to 0.85. Evidence: GATE.md section 2, fun/FINDINGS.md.
4. Selftest runner hides fx coverage. fx3d.js returns a nested shape the runner does not unwrap, so 26 passing checks print as ok=0. abilities ok=0 is a convention, not a gap. Evidence: orchestrator/SELFTESTS.md.
5. Economy: one wallet, three sinks. Levels total 643,000 coins, sharks 6,693,350, grand total 7,336,350, plus stat upgrades (about 30,000 per base-tier shark). Arithmetic verified exactly. Whether competing sinks are intended is a design question for Dan; the evidence does not establish that they cause the tier 7 to 9 wall the economy lane reported. Evidence: orchestrator/ECONOMY-SINK.md, upgrades/FINDINGS.md.
6. No safe-area exclusion for the swim-control touch anchor; env(safe-area-inset-*) only feeds HUD CSS (index.html:32-35). Evidence: controls/FINDINGS.md.
7. Two tier-12 sharks (leviathanrex, leviathan_rex) cost 150,000 each with identical stats, passives and active; only art differs. Design question, not a bug. Evidence: orchestrator/SELFTESTS.md.

## Ranked fixes (impact for effort)

1. Bake withheld roster cards from untextured low-poly geometry. The low-poly base set is already resident at boot, so it costs no texture budget. Confirm each untextured rig still reads as the right shark first. Effort low-medium.
2. Adopt the fixed harness as canonical (harness/README.md). Serve the worktree root and request /play/razorfin/ with the trailing slash; rooting at /play gives a black frame with 14 to 16 404s because of the base href. Effort low, unblocks everything below.
3. Fix tools/selftest.mjs to unwrap the fx nested result so 26 checks stop reporting as ok=0. Effort very low.
4. Clamp the 11 near-white glows in the gen_data.py palette pass, mirrorscale first. Effort low.
5. Profile the 4x-throttle stalls with CDP tracing to find the blocking task. Findable headlessly; do before device testing. Effort medium.
6. Add safe-area exclusion to the touch anchor. Effort low.
7. Roll 32/120 into SPEC3D.md. Effort trivial.
8. Measure coins per run, then revisit the economy and the tier-12 duplicate question.

Do not act on the controls lane's "capped pursuit law" item. Throttle is already direct; only heading slew (18 rad/s, contract floor 14) and the accel ramp differ, both deliberate.

## What we could NOT verify

No real-device testing happened. Every number here comes from headless Chrome (SwiftShader/ANGLE) on a Mac, and 4x CDP throttle is a proxy, not an iPhone. Five of six lanes were source-reading only until the harness was rebuilt at the end of the pass. The gate lists eight unverified claims at the end of GATE.md:

- Per-level texture memory against the iOS budget (no memprobe exists).
- Rendered draw-call counts per level; only the source gate is confirmed to exist and pass.
- The 117/120 shelf draw-call baseline, quoted from memory, never re-derived.
- Onscreen fish density and the "empty stretches" claim.
- Coins per run, and therefore every runs-to-unlock figure.
- 10-minute stability. The playability lane later appended a clean run (heap flat at 25 MB, zero errors, playability/stability_10min_final.png) but the gate did not re-run it.
- Surface and floor behaviour; source constants only.
- All qualitative fun judgements, which rest on stale pre-current-art imagery.

Plus: real-device behaviour of any kind, and playfeel of the heading slew.
