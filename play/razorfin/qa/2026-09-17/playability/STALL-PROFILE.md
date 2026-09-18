# 4x-throttle frame stall profile (QA-REPORT finding 2, ranked fix 5)

## Method

Extended the harness with `qa/2026-09-17/harness/traceprobe.mjs`, run beside
the existing `perfprobe.mjs`. It reuses the same boot sequence (goto
`/play/razorfin/?unlockall=1` served from the worktree root, trailing slash,
re-send the CDP `landscapePrimary` override after every screenshot/metrics
call per the harness README gotcha), then does a real `Tracing.start` /
`Tracing.end` CDP capture over the same 8s rAF-sampling window perfprobe.mjs
uses, with categories `devtools.timeline`, `v8`,
`disabled-by-default-v8.gc`, `disabled-by-default-devtools.timeline`,
`blink.user_timing`, `disabled-by-default-v8.compile`. Long tasks (`dur` >
15ms, `ph: 'X'`) were pulled out and grouped by event name, then the
highest-duration ones were inspected directly rather than guessed from
source.

CPU throttle 4x, same as the gate's own measurement. Ran on this Mac's
headless Chrome via `--use-gl=angle --enable-unsafe-swiftshader`, same as the
rest of the QA harness.

## What the trace showed

The 232 events with `dur > 15ms` collapse into one dominant shape:

    RunTask                 79
    FireIdleCallback         35   <- every one straddles a stall frame
    v8.callFunction          37
    FunctionCall             37
    GPUTask                  28
    ...

All 35 `FireIdleCallback` events had `dur` in the 157-305ms range (median
176ms), and printing their timestamps relative to trace start shows them
firing back-to-back roughly every 200-230ms across the ENTIRE 8-second
sampled run, not just at the start:

    0.05s 212ms   1.19s 176ms   2.39s 186ms   ...   7.84s 170ms   8.31s 175ms

That is a periodic, continuously-recurring cost, which is exactly the
bimodality the gate flagged: 68% of frames land on budget (the gaps between
idle-callback bursts), the rest cluster at 8-12 missed vsyncs (a ~170-300ms
idle callback blocking the main thread mid-run). There were zero `GC`/`Major
concurrent marking`-adjacent events correlated with the stall frames (V8 GC
trace events exist in the capture in large numbers, ~1250 incremental-marking
slices, but none over 15ms and none aligned with a stall window), and zero
shader-compile-shaped front-loading (the long tasks are spread evenly across
the whole window, not tapering off). So GC and shader compile are both ruled
out by the trace itself, not by assumption.

## Root cause: an un-cancelled requestIdleCallback thumbnail-bake queue

`ui3d.js` bakes a 112x90 PNG thumbnail per shark for the roster-grid menu
cards (`bakeThumb`, called from `drainBakeQueue`, scheduled one-per-idle-tick
via `idleSchedule` -> `requestIdleCallback(fn, {timeout:200})`). Each bake is
synchronous: build a full rig (`RF.Art3D.buildShark`), `renderer.render()`
into the live WebGL context at thumb resolution, `toDataURL('image/png')`
(a synchronous PNG encode), then dispose geometries/materials. Under 4x
throttle that whole sequence costs 150-300ms.

`buildCard` (called once per visible roster card when the menu builds) calls
`queueBake(def.id)` unconditionally for every card painted. With
`?unlockall=1` (the harness's own convention, matches what perfprobe.mjs and
the gate's own runs already used) the full ~61-shark roster is visible, so up
to 61 bakes get queued when the menu first renders, each gated behind its own
`requestIdleCallback`.

The bug: nothing cancels or drains that queue when the player leaves the menu
and a run starts. `runStarted()` (`ui3d.js`, the engine's own "entered a run"
hook) calls `clearTransients()` and `showHud()` but never touched
`S.bakeQueue`/`S.bakeTimer`. `requestIdleCallback` fires whenever the main
thread is idle, gameplay or not, so the harness's 2-second wait after
`startRun()` was nowhere near enough for 40-60 queued bakes to drain (at
~200ms apiece that is 8-12 seconds of backlog), and the queue was still
actively draining, one long idle-callback stall at a time, for the entire 8s
perf-sample window. The only two places `S.bakeQueue` was ever cleared were
selftest-isolation cleanup paths, not the real menu-to-run transition.

This is a real defect, not a throttle/SwiftShader artifact: the mechanism
(a synchronous per-item idle-callback task queue that outlives the screen
that queued it) is throttle-amplified but not throttle-created, and it
transfers directly to a real phone: any device slow enough that a 150-300ms
main-thread task is possible will show the same stutter mid-run, worse on
low-end hardware where the un-throttled per-bake cost is already non-trivial.
It also is not gated purely behind `?unlockall=1`: any player with multiple
shark tiers unlocked (not just a QA dev-flag run) queues a comparable batch
the moment they open the roster grid, and the queue only ever gets bigger as
more tiers unlock.

## Fix (surgical, applied)

`runStarted()` in `play/razorfin/ui3d.js` now cancels the pending idle
callback and empties the bake queue on the menu -> run transition:

    if (S.bakeTimer) {
      if (typeof window.cancelIdleCallback === 'function') { try { window.cancelIdleCallback(S.bakeTimer); } catch (eBI) {} }
      else if (typeof window.clearTimeout === 'function') { try { window.clearTimeout(S.bakeTimer); } catch (eBT) {} }
      S.bakeTimer = null;
    }
    S.bakeQueue.length = 0;
    S.bakeQueued = {};

Already-baked thumbnails in `S.thumbs` are untouched (no visual regression:
cards keep whatever thumb they already have, uncached ones keep the
monogram fallback they already show while queued). The queue naturally
re-arms next time `buildMenu`/`buildCard` runs, since `queueBake` re-queues
any id not already in `S.thumbs`. No renderer, spawner, or pooling code was
touched.

## Verification

Selftests, full 8-module command, all green and matching the exact expected
counts:

    world 380, game 398, art3d 31, fish 8, fx 26, ui 239, meta 192,
    abilities 0, fail=0

Throttled perf probe, same 4x CPU throttle, same harness, before vs after:

    before: p50 16.70ms, p95 166.70ms, max 216.60ms   (matches gate's own number)
    after:  p50 16.70ms, p95  16.80ms, max  16.80ms

Re-ran the trace probe after the fix as a second independent check (not just
the frame-delta sampler): 554 sampled frames, zero frames over 33ms, zero
`FireIdleCallback` events over 15ms. The stall is gone by the same
instrument that found it, not just by the summary statistic.

## Bimodality, explained

The two clusters map directly onto the two states of the idle-callback
timeline: frames that landed inside a gap between bakes hit vsync exactly
(the ~85-frame cluster at 1x 16.7ms), and frames whose vsync deadline fell
inside an in-flight ~170-300ms bake missed 8-12 vsyncs in a row before the
callback released the main thread (the 8-12x cluster). A periodic,
queue-drain-shaped cause (this) fits the bimodal histogram far better than a
front-loaded shader-compile cost would have, consistent with the gate's own
read of the evidence.
