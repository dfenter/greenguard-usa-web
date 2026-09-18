# Controls, 2026-09-17

Verdict: WEAK

Harness note: none of the named probes (verify.js, playprobe.js, diveprobe.js,
orientprobe.js) exist at HEAD. Only scratchpad/r16_verify.mjs is present and it
is unrelated to controls. This is pure source analysis. Headless probes, even if
present, prove little about a real thumb on a 390px iPhone.

## Ring geometry: PASS
engine3d.js:200-202 (radius 62, recenter 1.35x) matches
play/horde-meridian/game.js:2764-2777 (max=62, recenter 1.35x).
DOM ring is 124px, engine3d.js:1565.

## Drive law: does NOT match the fleet standard
Horde Meridian applies dx/max, dy/max as velocity immediately.
Razorfin (engine3d.js:2075-2089, 203) converts stick deflection into a virtual
target 400px away (CTL_STICK_TARGET_CSS=400), always outside the 60px arrive
zone (CTL_PURSUIT_FULL_CSS=60), so every input runs through a turn-rate cap
(18 rad/s, CTL_PURSUIT_TURN_RATE) and an 8x-speedCap/s accel ramp. That is an
indirect pursuit law, not direct velocity. It is a deliberate documented
tradeoff (comment engine3d.js:192-198, responding to a prior dive complaint)
but it contradicts the direct-velocity fleet criterion and is materially slower.

## Safe area: gap
No safe-area or home-indicator exclusion gates where the swim-control touch
listener anchors. env(safe-area-inset-bottom) only styles HUD panels
(index.html:32-35), despite code comments blaming iOS edge gestures for the
original dive complaint.

## Solid
Breach: real ballistic arc, gravity 900px/s2, apex ~800px, launch kick 1.3x
(engine3d.js:2419-2434).
Boost: drain 0.42/s, regen 0.17/s (engine3d.js:2156, 2159).
Bite: ~230ms cycle (60/90/80ms phases, engine3d.js:239-241), arcade-appropriate.

## Top 3
1. Stick feeds a capped pursuit law, not direct velocity. Slower than standard.
2. No safe-area exclusion for the touch anchor on iOS.
3. No runtime confirmation possible at HEAD, harness absent.

---
# GATE CORRECTION (Opus adversarial gate, verified by the orchestrator)

The "Top 3" item 1 above is WRONG. DO NOT ACT ON IT AS WRITTEN.

The claim was that the stick feeds a capped pursuit law rather than
horde-meridian's direct velocity. engine3d.js:2147 reads:

    if (stickMode && !haveKey) mag = ctl.stickMag;

That is a DIRECT override of throttle from ring deflection, the same shape as
horde-meridian's dx/max. The 400px virtual target drives HEADING only, not
throttle. The orchestrator confirmed this by reading engine3d.js:2140-2150.

What actually differs from horde-meridian is narrower: heading slew rate
(18 rad/s, contract-gated at a documented 14 rad/s floor) and the acceleration
ramp. Whether that is perceptibly "materially slower" was never measured by
anyone, headless or otherwise.

The other two control items stand: no safe-area exclusion for the touch anchor,
and no runtime confirmation was possible. Ring geometry still PASSES.
