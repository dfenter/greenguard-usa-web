# r16-bright — in-game shark body luminance

Player = `reef` on the `thresher` bake, 844x390 @2x landscape, `?unlockall=1`.
Numbers from `scratchpad/shark_blob.py` (largest connected achromatic blob =
the animal; the plain achromatic mask also admits pale water).

## Before / after

| level | state | median L | dorsal | belly | countershade |
|---|---|---|---|---|---|
| hawaii | before | 0.769 | 0.868 | 0.687 | **-0.181** |
| hawaii | after  | **0.486** | 0.318 | 0.741 | **+0.423** |
| lagoon | before | 0.772 | 0.868 | 0.703 | **-0.166** |
| lagoon | after  | **0.506** | 0.328 | 0.741 | **+0.413** |

Gates: median L 0.40..0.55, countershade >= +0.15. Both PASS on both levels.
The BEFORE countershade is NEGATIVE - the shark was shaded upside down.

Shots: `before-ingame-hawaii.png`, `after-ingame-hawaii.png`,
`before-ingame-lagoon.png`, `after-ingame-lagoon.png`.

## Bisect: every suspect term, toggled live in-game (broken axis)

| toggle | median L |
|---|---|
| baseline | 0.756 |
| uRfIdBellyMin 0.93 -> 0.50 | 0.756 |
| uRfIdDorsalMax -> 0.15 | 0.759 |
| uRfIdValueSpan -> 0 | 0.758 |
| uRfIdHemiBias -> 0 | 0.792 |
| uRfIdChromaLock -> 0 | 0.716 |
| uRfIdBellyWarm -> 0 | 0.756 |
| uRfIdMicroAlbedo -> 0 | 0.756 |
| uRfIdGlowStrength -> 0 | 0.756 |
| uRfRimStrength -> 0 | 0.772 |
| uRfWetness -> 0 | 0.756 |
| uRfCounterGain -> 0 | 0.745 |
| uRfSaturation -> 0 | 0.752 |
| scene environmentIntensity -> 0 | 0.720 |
| renderer exposure -> 0.50 | 0.718 |

Nothing moves it: `backValue` was clamped at its 0.42 ceiling, so the albedo
band had no authority. Flipping the dorsal axis alone: 0.756 -> 0.640,
countershade -0.19 -> +0.47.

## Exposure landing (axis fixed)

| exposure | median L | countershade |
|---|---|---|
| 0.80 | 0.595 | +0.440 |
| **0.76 (shipped)** | **0.512** | **+0.412** |
| 0.72 | 0.454 | +0.424 |
| 0.68 | 0.434 | +0.423 |
| 0.64 | 0.415 | dorsal crushing |

## Dorsal axis, measured off the shipped GLBs

| bake | spike axis | maxPos | maxNeg | measureBindUp returns | correct |
|---|---|---|---|---|---|
| thresher | 1 | 0.687 | 0.313 | (0,-1,0) | (0,+1,0) |
| whaler | 1 | 0.647 | 0.353 | (0,-1,0) | (0,+1,0) |
| greatwhite_cy | 1 | 0.839 | 0.161 | (0,-1,0) | (0,+1,0) |
| tigershark | 1 | 0.588 | 0.412 | (0,-1,0) | (0,+1,0) |
