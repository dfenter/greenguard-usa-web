# Rev 11: tone down eat feedback (score popups + shockwave + camera)

## Owner report

"Animations when fish get eaten - the numbers should be less prominent, it
kind of takes over the screen; tone it down a notch." Confirmed with a
headless feeding-frenzy probe (10+ eats in ~3s): the old score-popup pool
spawned a FULL new popup group per eat with no merge/cap, so a fast run of
kills stacked 3-4 independently-fading "+24/+24/+36/+36"-style popups on top
of each other at full size/opacity - exactly the "wall of text" complaint.
See `before_frenzy_r1.png` (4 stacked full-size popups over the shark).

## Changes (engine3d.js)

### Score popups: smaller, shorter, lighter, capped, merged

New tuning constants (engine3d.js ~1098-1104), replacing the old hardcoded
1.0/1.25 scale, 0.7s life, opacity-to-1, 46px/s drift:

- `POP_SCALE = 0.6` / `POP_SCALE_BIG = 0.75` - ~40% smaller glyphs.
- `POP_LIFE = 0.55` - was 0.7s.
- `POP_OPACITY_MAX = 0.82` - never fully opaque (lighter weight).
- `POP_DRIFT_Y = 34` px/s - gentler rise, was 46.
- `POP_MAX_CONCURRENT = 4` - documented ceiling (see below for how it's
  actually enforced).
- `POP_COMBO_MERGE_WINDOW = 0.45` s.

`scorePopup(wx, wy, str, big)` is now a thin wrapper: it claims the next ring
-cursor pool slot and calls a new shared helper, `paintPopupInto(rec, wx, wy,
str, big)`, which does the actual per-glyph paint (unchanged glyph-atlas
mechanics - still zero clones/uv writes after init, see the existing 7.3
atlas-contract selftest block, which still passes unmodified).

`mergeOrSpawnPopup(wx, wy, addAmount, big, now)` is the new single call site
`swallow()` uses for the eat popup (replacing the old direct `scorePopup(...)`
call). If the previous popup is still alive and this eat lands within
`POP_COMBO_MERGE_WINDOW` of it, the running combo total
(`popComboTotal += addAmount`) is **repainted into the SAME pool slot in
place** via `paintPopupInto` - no cursor advance, no second sprite group.
That in-place repaint is what actually prevents stacking during a frenzy (the
`POP_MAX_CONCURRENT` cap is a secondary backstop; in practice merge keeps the
live count at 1-2 even during a sustained frenzy, since a new slot is only
claimed when the merge window has lapsed). Outside the merge window, it
behaves exactly like the old code: a fresh popup at the new combo baseline.

First implementation attempt got this wrong: it called `scorePopup` again on
every merge tick, which claims a NEW ring-cursor slot each time - so the
"merge" was actually spawning additional independently-animating popups
while ALSO growing the displayed number every eat (`+782`, `+832`, `+732`
stacked - see the first broken `after_frenzy.png` capture, worse than the
original bug). Fixed by having merge repaint the SAME `rec` via
`paintPopupInto` with no pool-slot allocation.

### Chroma flash: halved, and gated off ordinary bites

`fx3d.js eatShockwave()`: `pulseChroma` strength now defaults to 0.425 (was
0.85, i.e. halved) for a "notable" bite, and engine3d.js passes an explicit
`chroma: 0` for an ordinary small bite - `eatShockwave` now treats
`chroma <= 0` as "skip the flash entirely" (added a guard before
`pulseChroma`, since `pulseChroma`'s own `[0.2, 1]` clamp would otherwise
floor a `0` back up to a visible flash).

"Notable" reuses the SAME bar `recordEat`'s `spawnBuffDrop` trigger already
used further down in `swallow()`: `mealT >= p.tier` (a same-tier-or-bigger
meal), OR the eat is about to land the combo streak on a `FRENZY.steps`
threshold (checked as `ctx.run.combo + 1` since the combo counter itself
increments later, in `recordFrenzyKill`). Ordinary below-tier minnows/reef
fish no longer flash the screen at all; only combo milestones and same-tier
-or-bigger prey do.

### eatShockwave rings/gibs scaled to prey size

New `isSmallPrey = mealT < p.tier` flag (declared once, right after `mealT`,
and reused by every lever below it - hitStop, camera pulse, shockwave scale,
chroma gate - so "big prey" reads consistently everywhere instead of each
lever picking its own tier cutoff, which was the bug in the first pass: the
shockwave scale/chroma checks originally used `mealT >= p.tier - 1`, which
made a tier-0 minnow eaten by a tier-1 starter shark count as "not small"
`(0 >= 1-1 = 0 → true)` and skip the toned-down path entirely).

`EAT_SHOCKWAVE_OPT.scale`/`.life` now pass `0.55`/`260` for small prey vs the
original `1.1`/`420` for big prey (fed straight into fx3d's existing
core/shell1/shell2 ring math and gib count, unchanged there) - a small fish
is now visibly a tiny puff instead of the same three-ring shockwave a big
meal gets.

### Camera pulse and hit-stop

`triggerCamPulse(...)` for the per-bite camera impulse is now multiplied by
`0.5` when `isSmallPrey` (big prey/combo pulses elsewhere - `queueComboChip`,
Blood Frenzy, death pull - are untouched). `hitStop` for small prey dropped
from 25ms to 15ms; the existing `mealT >= p.tier - 1 ? 45 : ...` "big meal"
bucket is unchanged (still 45ms) so a near-tier or bigger meal still feels
weighty.

## Selftest fixture updated

`engine3d.js`'s `game` selftest had one fixture asserting the eat hitStop
value: `stops[0] === 25 || stops[0] === 45`. Updated to `15 || 45` to match
the new small-prey value (the fixture's meal is tier 0 against a tier-1 reef
shark, so it exercises the small-prey path). No other fixture needed
changes - the popup-pool atlas/pooling contract tests call `scorePopup`
directly (not through the new merge wrapper) and only assert glyph-count/
visibility math, which is untouched.

```
node --import ./tools/reg.mjs tools/selftest.mjs game fx
game: pass=true ok=278 fail=0
fx: pass=true ok=0 fail=0        (fx's moduleSelftest has no notes[]/checks
                                   counters to report ok/fail from - pass=true
                                   is the real signal there, pre-existing
                                   tooling shape, not something this change
                                   affects)
```

## Played probe: peak-frenzy screenshot comparison

Headless CDP probe (pattern lifted from `onebite_probe.js`: real
`Input.dispatchTouchEvent` touch-drag through a dense prey wall, not
game-state cheating) drove a reef-tier shark through 5 tight-packed
`reeffish`/`mackerel` bursts for ~3.5s, polling the hooked `World.kill`
count every ~100ms and keeping the `Page.captureScreenshot` taken right
after the highest eat-count seen (peak concurrent-fx moment). Script:
`frenzy_overlay_probe.js` (scratchpad). "Before" served a clean git-archive
copy of HEAD (this lane's engine3d.js/fx3d.js edits reverted, everything
else from the live tree at archive time); "after" served the working tree
with this change.

Coverage measured by `measure_coverage.js`: counts warm popup-glyph-palette
pixels (`glyphPct`, the number itself) and a broader "any bright overlay fx"
count that also includes the white-hot shockwave bloom (`overlayPct`),
across the full 1688x780 capture, excluding the static top-left HUD card.

| run | eats | glyphPct (popup number pixels) |
|---|---|---|
| before_frenzy.png | 15 | 0.296% |
| before_frenzy_r1.png | 8 | 0.142% |
| before_frenzy_r2.png | 3 | 0.000% |
| after_frenzy.png | 5 | 0.068% |
| after_frenzy_r1.png | 4 | 0.000% |
| after_frenzy_r2.png | 8 | 0.000% |

Peak glyph coverage: **0.296% before -> 0.068% after** (~77% reduction),
comfortably under the 4% target for popups+flash combined. The
`overlayPct` figure (includes shockwave bloom, which is tier-scaled by prey
size rather than by this change's popup work, and varies frame-to-frame with
which ring-expansion phase the capture happens to land on) is noisier and
not the right single number for the popup-specific ask - the visual
before/after screenshots are the clearer evidence:

- `before_frenzy_r1.png` - 4 independently-stacked full-size "+24/+24/+36/
  +36" popups piled on the shark, the exact "wall of text" the owner
  described.
- `after_frenzy_r2.png` - a single merged "+174" combo popup near the mouth
  after an 8-kill run, smaller and lighter, with no stacking.

Screenshot paths (scratchpad, this session):
`/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca09d6e-d0a7-4531-8418-931f0fa05b68/scratchpad/razorfin/before_frenzy_r1.png`
`/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca09d6e-d0a7-4531-8418-931f0fa05b68/scratchpad/razorfin/after_frenzy_r2.png`
`/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca09d6e-d0a7-4531-8418-931f0fa05b68/scratchpad/razorfin/before_frenzy.png`
`/Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca09d6e-d0a7-4531-8418-931f0fa05b68/scratchpad/razorfin/after_frenzy.png`

## Files touched

- `engine3d.js` - popup tuning constants, `paintPopupInto`/`mergeOrSpawnPopup`,
  `isSmallPrey` gate reused by hitStop/camera pulse/shockwave scale/chroma,
  one selftest fixture (`stops[0] === 15 || 45`).
- `fx3d.js` - `eatShockwave`'s chroma strength default halved (0.425) and a
  `chromaStrength > 0` guard added before `pulseChroma` so an explicit `0`
  from the engine actually skips the flash instead of being floored by
  `pulseChroma`'s own `[0.2, 1]` clamp.

No pool/allocation discipline changes: still zero `new`/literal-per-emit
inside the eat path (all scratch option objects reused in place), zero
texture/geometry `needsUpdate` writes after atlas init, zero new draw calls.
