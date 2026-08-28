# Rev 15 — lane FISH — prey animation smoothness

Owner verdict (binding): **"fish animations are gyrating weird and not smooth."**

Owned files touched: `world3d.js` **only**, and only inside the fish/prey
instance-update region (`animateInstancedEntity`, `faceAngle`, `schoolSteer`'s
target combine, and the `st` reset block in `acquire()`).
`fish3d.js` was read but needed no change. The reef garden, water, spawner and
the EAT hunks (`pickEatablePrey` / `playerEatCeiling`) are untouched — verified
by diff.

Evidence: `hse/evidence/r15-fish/` (12-frame strips before/after, per-step
frame dumps, metric tables).
Tooling added (not owned game code): `hse/probe_fish_frames.mjs`,
`hse/analyze_fish_frames.mjs`, `hse/rf_inspect.mjs`.

---

## The probe, and a correction worth recording

The first version of the probe polled the page from Node (`page.evaluate` on
an rAF tick) and "reproduced" the complaint immediately: heading deltas of
40-106 deg/frame, amplitude snapping, 2 of 5 gates failing.

**That reproduction was an artifact of the probe, not the game.** Measured
sample interval was a median of **133-202 ms with excursions to 4.5 s** — 8 to
12 sim steps per sample, drifting under load. Every "per frame" number was
really "per ~10 frames", so the gates were measuring the probe's own jitter.

The probe now wraps `World.update` and records exactly one sample per **sim
step**. Measured interval: a flat **16.67 ms**, zero variance. Every number
below is on that clock. Re-running the *unmodified* build on the corrected
probe showed it already passing all five gates — so the gates as specified do
not, on their own, catch what the owner is looking at.

Two other things the probe needs, both worth keeping:
- headless tabs read as hidden, so ggkit pauses the sim (`kit.paused`); the
  probe pins `RF.Game.kit.paused` false or every sample is identical.
- ggkit's rotate gate reads `screen.orientation.type`, which headless mobile
  emulation reports as portrait even for a landscape viewport — without the
  override every screenshot is the "Rotate your device" card.

## Root cause (measured, not inferred)

**The tail wave was very nearly static, and identical on every fish.**

`animateInstancedEntity` drove the bend phase as `entPhase(e) + t` — the shared
wall clock — so the wave advanced at exactly **1 rad/s = 0.159 Hz**, one tail
stroke every 6.3 seconds, *the same for every fish regardless of how fast it
was swimming*. Measured across all live instances: min 0.16, median 0.16, max
0.16 Hz. The bodies were translating and yawing normally while the tails
essentially did not move.

That is the "gyrating weird and not smooth" read: prey slide and rotate
through the water with no swimming motion driving them, and because the phase
came off the frame clock, any hitch in `t` (hit-stop consuming frame time, the
fixed-step accumulator dropping a backlog) stepped the wave by a varying
amount on top of that.

## Fixes (all in the fish/prey instance-update region of world3d.js)

1. **Tail phase now integrates `dt * freq`.** `st.bendPhase` is seeded once
   from `entPhase(e)` (keeping the golden-ratio spread that stops a
   burst-spawned school beating in unison), then advanced continuously, with
   `freq` driven by the speed fraction (`BEND_FREQ_MIN` 1.6 Hz idle ->
   `BEND_FREQ_MAX` 5.2 Hz at full speed, x1.35 while panicking). Continuous by
   construction: it cannot jump when the frame clock hitches.
   Result: tail rate goes from a uniform 0.16 Hz to **3.15-5.20 Hz, varying
   per fish with its actual speed**.
2. **Bend amplitude is EASED, not assigned.** It was set straight from the
   instantaneous speed fraction, so boids jitter in the velocity showed up as
   the tail amplitude snapping (measured 0.12 -> 0.0506 -> 0.0639 on three
   consecutive frames). Now eased toward the target at `BEND_AMP_EASE`.
   `BEND_AMP_IDLE` is the idle-swim floor, so nothing is ever frozen-stiff; a
   hard `frozenT` override still wins outright.
3. **Display yaw is rate-limited.** `faceAngle()` smoothed toward `e.angle`
   with no cap, and a ~0.15 blend per frame against a velocity that reverses
   under separation still passes 40+ deg through in one frame. Capped at
   `TURN_MAX_RATE` (~360 deg/s).
4. **Banking.** Roll is derived from the rate-limited yaw rate and eased on
   top (`BANK_PER_YAW`, `BANK_MAX` ~26 deg, `BANK_EASE`), so a turn leans
   instead of twitching. Sign flips with the `left` Y half-turn, which mirrors
   the body's roll axis with it.
5. **Boids target smoothing.** Separation is recomputed from scratch each
   frame off raw neighbour positions, so two fish oscillating about their
   separation radius produce a force that reverses on alternating frames.
   `schoolSteer` now eases the combined steer target as an **offset** from the
   entity (easing it as a world point would lag a moving fish and pull it
   backwards). Steady-state target is unchanged, so spacing, alignment and the
   formation read exactly as before.
6. **Phase wrap is TAU-exact.** The precision guard on `bendPhase` first
   subtracted a flat `1e6`, which is not a whole number of cycles
   (`1e6 % TAU = 5.93`), so the wrap itself would have snapped the tail wave —
   the exact discontinuity this change exists to remove, hidden ~6 hours into
   a continuous session. It now subtracts `TAU * 1e5`.
7. **Recycled-pool hygiene.** Every new field is a smoothed value whose whole
   point is continuity, so `acquire()` resets `bendPhase`/`bendAmp`/`bankA`/
   `faceRate`/`boidX`/`boidY`. Inheriting a previous fish's tail phase or bank
   angle is exactly the one-frame discontinuity this pass exists to remove.

## Metrics (per sim step, 90 steps, 33 live instances, same seed/scene)

| metric | before | after | gate |
|---|---|---|---|
| heading change/frame, median | 0.36 deg | 0.73 deg | <= 12 ✅ |
| heading change/frame, **max** | **19.26 deg** | **6.53 deg** | — |
| lateral vel flip-flop instances | 0% | 0% | <= 5% ✅ |
| tail phase step, max | 0.0167 rad | 0.7351 rad | < 1.0, continuous ✅ |
| **tail beat rate, min/med/max** | **0.16 / 0.16 / 0.16 Hz** | **2.90 / 4.49 / 6.49 Hz** | — |
| **realized tail excursion (median)** | **0.1110** | **0.2393** | — |
| bend amp max step | 0.021 | 0.014 | — |
| position jerk, median | 0.0002 BL | 0.0005 BL | < 0.08 ✅ |
| frozen instances | 0 | 0 | 0 ✅ |
| draws | 81 | **81** | unchanged ✅ |
| triangles (scene-dependent) | 103464 | 109362 | prey unchanged ✅ |

The two bolded rows are the fix. **Before, every fish in the world beat its
tail at 0.16 Hz — min, median and max identical to two decimals**, which is
the signature of a wave driven by a shared clock rather than by each fish's
own swimming. After, the rate spans 2.90-6.49 Hz and varies per fish with its
speed. Realized tail excursion (the actual `amp * sin(phase)` peak-to-peak
each instance traverses over the window) **more than doubles**, 0.111 ->
0.239: the tails are genuinely moving now rather than holding a near-fixed
pose.

Peak yaw is cut **3x** (19.3 -> 6.5 deg) — the "gyrating" half of the verdict.
Draws are byte-identical at 81. Triangle count differs only because the two
captures had different live prey counts (33 vs 45 instances, the spawner and
the player's eating are not deterministic between runs); per-instance geometry
is untouched, and no draw call was added.

Read the phase row as the fix, not a regression: the gate asks for a
*continuous* wave, and the after value stays well under the 1.0 rad bound.
The before value of 0.0167 rad is precisely `dt`, which is the fingerprint of
the `+t` bug.

## On the screenshot strips

`hse/evidence/r15-fish/strip-{before,after}-00..11.png` are 12-frame landscape
gameplay strips. They are **weak evidence and should not be the thing anyone
judges this on**: the probe-spawned school sits near the player, and the
player eats it within a second or two (visible as the score climbing to 30 x4
in `strip-after-02.png`), so most frames show the shark and reef rather than a
school. Tail motion at gameplay scale is also only a few pixels.

The per-sim-step frame dumps (`frames-*.json`) and the metric tables
(`metrics-*.json`) are the real evidence, and they measure the instance data
that is actually fed to the GPU. A proper visual A/B would need a fixed camera
on a school with the player held off it — worth building, but it is the
`hse/school_harness.html` lane's rig, not this one's.

## Selftests

`node --import ./tools/reg.mjs tools/selftest.mjs world game fish`
-> **world 379/0, game 394/0, fish 8/0**, all green.
(The bare `node tools/selftest.mjs` form cannot resolve the `three` bare
specifier; `--import ./tools/reg.mjs` is required.)
`ENTITY_BUDGET.total` left at **120** — the world formation probe is sensitive
to it.

## Hook for the orchestrator

**Nothing to hook.** All changes are self-contained in world3d.js's prey
instance-update region and take effect through attribute data that was already
being written every frame. No new attributes, no new uniforms, no shader
change, no material change, no fish3d.js change.

## Caveat

The five gates as specified pass on the *unmodified* build once measured on a
correct per-sim-step clock. They constrain frame-to-frame discontinuity, and
the real defect was a *steady-state* one — a tail beating 30x too slowly,
uniformly, which is smooth by every one of those measures. The tail-beat-rate
row is the number that actually tracks the owner's verdict, and is the one to
watch in future revs.
