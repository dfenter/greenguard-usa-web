# Orchestrator re-check of the playability lane's perf numbers

The playability lane reported p50 16.70ms / p95 16.70ms, "rock solid 60fps".
Frame-time percentiles alone cannot distinguish 60fps from a game that renders
a handful of well-spaced frames, so I re-measured independently.

## False alarm I raised and then resolved
My first counter installed its own self-rescheduling requestAnimationFrame loop
and read 88 ticks in 8s (~11fps), which looked like it contradicted the lane.
It did not. A second rAF loop competing with the engine's own loop starves
itself and measures the probe, not the game. My probe was wrong.

## Honest re-measure, run in a live run on hawaii/reef
  samples = 459 over 8,012ms wallclock  =>  57.3 fps sustained
  rAF delta p50 = 16.70ms, p95 = 16.80ms, max = 149.90ms

57.3fps against a 60fps ceiling. The lane's headline is UPHELD.

## The methodology point that still stands
p50 and p95 of frame DELTAS are not sufficient on their own. A probe that fires
30 frames in 8 seconds, each 16.7ms apart, reports an identical p50 to one
running at a true 60fps. The trustworthy number is samples divided by wallclock,
which the lane's perfprobe.mjs did not compute. It recorded count, p50, p95, min
and max, and count over an 8s window happens to make the fps derivable, which is
why its conclusion survives, but by luck rather than design.

Recommendation for the rebuilt harness: have perfprobe.mjs emit
`fps = samples / (wallclock/1000)` explicitly alongside the percentiles, so a
future reader cannot mistake well-spaced frames for a healthy frame rate.

The max of 149.90ms in an UNTHROTTLED run is also worth noting. The lane
reported max 16.80ms unthrottled. I saw a 150ms spike, so occasional hitches
exist even without CPU throttling. Small sample, not alarming, but it slightly
softens the "effectively zero variance" claim.

The 4x-throttle p95 of 166.6ms was not re-measured here and remains the lane's
number, carrying its SwiftShader caveat.
