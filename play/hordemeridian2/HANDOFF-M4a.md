# HANDOFF M4a: Campaign Rev 2, 15 new missions

Status: GATE PASS, 55/55 probe assertions. Committed, not pushed, not deployed.

## What changed

Dan said the HM2 campaign was the HM1 campaign. All 13 old missions were
replaced with 15 new ones. New names, taglines, briefings, wave tables, events
and star conditions throughout, and the region order now runs outward from the
Aurelion Graveyard rather than opening on the Verge, which is the inverse of
HM1's ordering.

| # | Name | Region | Dur | Structure | Music |
|---|------|--------|-----|-----------|-------|
| 1 | SALVAGE RUN | Graveyard | 150 | survive + gem rush | base |
| 2 | GRAVE SHIFT | Graveyard | 185 | survive + kills | base |
| 3 | RIMLIGHT | Ember Drift | 210 | survive + 1 base siege | base |
| 4 | ASH HARVEST | Ember Drift | 240 | gem rush + kills, 2 bases | base |
| 5 | CINDER CROWN | Ember Drift | 225 | boss hunt | heat |
| 6 | GLASS TIDE | Crystal Shoals | 265 | gauntlet | base |
| 7 | PRISM SIEGE | Crystal Shoals | 290 | 3 base siege | base |
| 8 | SHARD REQUIEM | Crystal Shoals | 270 | boss hunt + bases | heat |
| 9 | BLINK PROTOCOL | Void Rift | 300 | gauntlet, apex intro | base |
| 10 | NULL HARVEST | Void Rift | 330 | endurance + kills | heat |
| 11 | TWO LORDS | Void Rift | 310 | double boss hunt | heat |
| 12 | IRON VIGIL | Graveyard | 380 | endurance + bases + boss | heat |
| 13 | LONG DARK | Void Rift | 440 | endurance, max apex | heat |
| 14 | THE VERGE BURNS | Verge | 480 | siege + 3 bosses | heat |
| 15 | MERIDIAN FALLS | Verge | 560 | Core finale + 2 escorts | heat |

`CAMPAIGN_MAX_LEVELS` needed to go 13 to 15 or the last two missions would be
silently dropped. By the time I staged, another lane had already committed that
same one-line change, so this commit does not touch game.js. index.html gets two
level script tags and nothing else.

Also added: a stacked-strip fade at the bottom of the mission list scroll area
in hm_campaign_ui.js, so the last visible card no longer clips mid-text against
the geometry mask above LAUNCH at 390x844.

## Two findings that matter for anyone tuning levels

**1. The authored row-0 wave pool does not control the hot-start seed.**
`seedHotStart` in game.js takes `waves[0].pool`, then unconditionally appends
every region variant that is not ranged, not lancer/sapper-based and not apex.
A Graveyard mission therefore gets `derelict-guard-hulk` (58 hp, 24 dmg) and
`grave-egg` seeded at 0:00 no matter what the level file says; Ember Drift gets
`cinder-kamikaze` at speed 126. The old "row-0 pools are melee only" rule is
necessary but nowhere near sufficient. Seed count is
`round(80 * max(0.65, spawnRate))`, so a mission's opening pressure is set by
its `mods.spawnRate`, not by its row-0 pool. Missions 1 to 5 were retuned on
that basis; my first attempt at fixing mission 5 by editing its row-0 pool was
a no-op, which is how this got found.

**2. The gate bot was measuring itself, not the levels.**
The sector-steering bot inherited from `hm_hotstart_gate.mjs` set
`scene.input.vx/vy` and assigned `p.vx/p.vy` directly. Neither is a real input
path: game.js reads `this.stick` (`active`, `dx`, `dy`) in the movement
integrator and overwrites velocity from it every frame. The bot was barely
steering and died around 20s on every mission regardless of difficulty. The
tell was that making mission 1 strictly easier made its measured median
strictly worse, and that an unmodified mission 1 scored 66s then 28s on
consecutive runs. Driving `stick` took mission 1 from ~20s to a full 150s clear
on every trial.

**`hm_hotstart_gate.mjs` still has this bug.** Any historical survival number
produced by it, including the 78-93s medians quoted in the HM1 memory, was
measured with a bot that could not really steer. Worth re-running before those
numbers are trusted again.

## Gate

`/Users/lucille/ue-port-studio/aaa/harness/hm2_campaign_probe.mjs`. Serve the
repo (`python3 -m http.server 8791` from the repo root) and:

    node hm2_campaign_probe.mjs http://127.0.0.1:8791/play/hordemeridian2/ /tmp/shots 3

Asserts all 15 levels validate with none dropped, no rejection warnings, unique
names within the 18-char cap, durations spanning the range, then boots each
mission and fast-forwards its arc, then runs the bot on 1, 5, 10 and 15.

Final: **55/55 assertions passed.** Medians over 3 trials:

    mission 1  150s  (full clear, hull intact, 3/3)
    mission 5   90s  (was 10s before the mods retune)
    mission 10  54s  (objectives complete, hp 100)
    mission 15 125s

Probe notes: trials are capped at 200s wall clock, because a boss-hunt mission
whose survive objective never completes will otherwise run to the cap and stall
the gate. A `t=0` trial means the page never loaded and is retried rather than
recorded, since a zero would poison the median. Page loads retry 3 times.
Trial-to-trial variance is still wide even with the input fix, so treat single
trials as noise and medians as the signal.

## Residuals

- The last gate run executed against a game.js that already contained the M1
  weapons rework in progress. The campaign assertions are independent of
  weapons, but the bot survival medians are not: they will move when M1 lands.
  Re-run the probe after M1's gate.
- Mission 10's bot trials end at ~54s with full hull. That is objective
  completion, not a death, so the "survival median" reads low for a mission
  that is not actually short. The probe reports run length, not survival per
  se; a future version should separate the two.
- `hm_hotstart_gate.mjs` is still unfixed (see finding 2). I left it alone
  because it is HM1's gate and outside this lane.
- Mission 14's first apex wave row sits at exactly 40% of duration, right on
  the boundary the bible set. It passes, but it is the one to watch if 14 needs
  softening.
- Not deployed and not pushed, per the lane brief.
