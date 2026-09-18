# Razorfin QA Gate 2026-09-17 - Playability and Performance

Scope: read-only probe lane. Live build at index.html (three.js). index2d.html confirmed DEAD (not tested, not linked from live flow).

## Verdict: PASS (with one WEAK note on throttled-CPU frame spikes)

## Selftests (node --import ./tools/reg.mjs tools/selftest.mjs <module>)

| module | result |
|---|---|
| world | pass=true ok=380 fail=0 |
| game | pass=true ok=394 fail=0 |
| art3d | pass=true ok=31 fail=0 |
| fish | pass=true ok=8 fail=0 |
| fx | pass=true, 26 real checks, runner under-reports as ok=0 |
| ui | pass=true ok=239 fail=0 |
| meta | pass=true ok=192 fail=0 |
| abilities | pass=true, real checks, inverted convention reports ok=0 |

Evidence: direct stdout of the 8 selftest invocations, this session, all pass=true, zero failures. CORRECTION by the orchestrator: the claim that fx and abilities
"register 0 assertions" is wrong, and both do have coverage.

- fx3d.js __selftest returns a nested {pass, fx, juice, sound, music} shape that
  tools/selftest.mjs does not unwrap (it handles only `notes` and `sections`).
  26 real checks are hidden and counted as zero: fx 17, juice 4, sound 3,
  music 2, all passing. The runner's own header comment warns about exactly
  this class of silent under-reporting. This is a genuine tooling bug.
- abilities.js uses an INVERTED convention: notes collects only failures and it
  returns {pass: notes.length===0}. Empty notes means every assertion passed.
  It really does test phase expiry, chrono reset, passive immunity copy and
  charge math. No action needed beyond knowing the convention.

See ../orchestrator/SELFTESTS.md for the verification.

## Frame time (this Mac's headless Chrome, system GPU via ANGLE/SwiftShader)

- No throttle: p50 16.70ms, p95 16.70ms, min 16.60ms, max 16.80ms, n=411 samples over 8s in a live run (reef level). PASS - rock solid 60fps, effectively zero variance.
- CDP 4x CPU throttle (mobile-class proxy): p50 16.70ms (unchanged), p95 166.6ms, max 233.4ms, n=134 samples over 8s. WEAK - median frame pacing holds but the tail is bad: p95 is about 10x the frame budget, meaning periodic stutter/hitches would be visible on lower-end mobile hardware. Evidence: play/razorfin/scratchpad/perfprobe.mjs run with throttle=4, raw JSON output this session.

## Console errors

Zero PAGEERROR / console-error events across plain-load probe, perf probe (both throttle levels), and the 10-minute stability run. Evidence: errors: [] in plainload.mjs and perfprobe.mjs JSON output; stability10.mjs error array recorded below once the run lands.

## Menu flow - plain load, real buttons only

Per the 2026-08-20 boot-menu regression lesson (programmatic scene.start probes miss a dead plain-load path), ran play/razorfin/scratchpad/plainload.mjs: loads index.html cold with NO RF.Game.selectLevel/startRun calls, waits 4s, re-sends the CDP landscapePrimary orientation override (required after every screenshot per the known puppeteer gotcha), then reads DOM state.

Result: menu renders correctly on cold load - body text shows "RAZORFIN / CREDITS / Level 1 / 0 COINS / 0 GEMS / Tier 1 / Real Sharks / Reef Shark COMMON / Selected / ..." i.e. the shark roster grid and HUD populate with no boot-menu regression. hasRF=true, 2 canvases present (world + HUD per the two-camera DPR split noted in memory), zero console errors. PASS.

A tap at canvas center landed on the roster grid rather than a Play button (menu button coordinates weren't precisely mapped by this probe), so it did not confirm advancing past the menu via a single real tap - this is a probe precision gap, not a confirmed product bug. The plain-load-renders-correctly path (the actual regression class from 2026-08-20) is confirmed clean. Screenshots saved: qa/2026-09-17/playability/plainload_menu.png, plainload_after_tap.png.

## 10-minute unattended stability run

COMPLETE - PASS. play/razorfin/scratchpad/stability10.mjs ran a live reef run unattended for 10 minutes, sampling JS heap every 30s. Heap started at 51.7MB right after run-start (includes level/asset load spike), settled to ~25MB by the 90s mark, then stayed flat in a 24.9-26.0MB band for the remaining 8.5 minutes (final sample 24.94MB, actually the lowest of the run) - no leak drift, no monotonic growth. Zero console errors and zero page errors over the full 10 minutes. Screenshot at end of run: qa/2026-09-17/playability/stability_10min_final.png.

Harness note: the frame-count field in each sample read null throughout (RF.Game.frameCount is not the correct accessor name in this build) - a probe gap, not a game bug; heap and error tracking, the signals that actually matter for a leak/stability check, both worked and both came back clean.

## Live-parity check

CONFIRMED MATCH - credited to the orchestrator's check (not independently re-run by this lane per its instruction to skip and move on). https://new.greenguard-usa.com/play/razorfin/index.html and the no-slash form both 308-redirect to https://new.greenguard-usa.com/play/razorfin (no trailing slash); a naive curl of .../index.html returns a 15-byte "Redirecting..." stub. Following the redirect: 200, 35156 bytes, byte-identical to worktree index.html. engine3d.js, world3d.js, shark3d.js, fish3d.js, fx3d.js, ui3d.js, data.js all shasum-match HEAD directly.

Hazard flagged by orchestrator, checked by this lane: the 308 trailing-slash redirect means any probe/bookmark hitting .../index.html directly (not following redirects) sees only the 15-byte stub and would falsely report a blank/broken page. Confirmed real - worth noting for future harnesses (always request the trailing-slash form or follow redirects).

Service-worker scope check (requested by orchestrator): searched play/razorfin/*.js, *.html, and hse/*.mjs for serviceWorker.register(. No explicit registration call exists inside this worktree slice - sw.js (play/razorfin/sw.js) is a self-unregistering cleanup worker (installs, clears cache, calls self.registration.unregister(), deliberately has no client.navigate() to avoid a register/navigate loop per its own comments) that must be registered by a shared ggkit script outside this repo slice, not found for direct inspection in this worktree. Several test probes (hse/probe_fish_frames.mjs, probe_lum.mjs, probe_nnd.mjs, probe_maze_map.mjs, probe_school_ab.mjs) explicitly stub out navigator.serviceWorker.register to disable it during testing, confirming registration is normally live but external to this file set. Because service worker scope is derived from the resolved (post-redirect) URL of the registering document, not the pre-redirect request URL, the slashless canonical /play/razorfin 308-redirecting to the same origin/path prefix as the slashed form does not change effective scope - both resolve to the same directory. No scope hazard identified, but this is inferred from spec behavior plus the self-unregistering no-op nature of sw.js, not from a live registration trace (the registering script was not locatable in this worktree to trace directly) - flag as an assumption, not a hard verification.

## Top-line risks

1. WEAK: p95 frame time balloons to 166.6ms (max 233ms) under 4x CPU throttle vs a rock-solid 16.7ms unthrottled - real stutter risk on lower-end mobile.
2. Live-parity confirmed MATCH (orchestrator check), with a genuine minor hazard: .../index.html direct-hit returns a 15-byte redirect stub that could false-fail non-redirect-following harnesses.
3. Selftests and plain-load menu flow are clean; no confirmed regressions.
