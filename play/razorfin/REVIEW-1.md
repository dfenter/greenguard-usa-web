# Razorfin final adversarial review

Read-only review of the six lane files, `SPEC.md`, shared laws, lane notes,
the supplied art sheet, gameplay frame, and menu frame. The review found real
ship blockers despite the reported boot and sweep passes.

## CRITICAL

### RF-RETINA-01: the title is currently forced to 1x

Evidence: `play/_shared/ggkit.js:622-650` sets `HIDPI_MAX = 1` and clamps
`hiDpi.dpr()`. `play/razorfin/game.js:1416-1422` consumes that helper for the
Phaser configuration, while `play/razorfin/sharkart.js:188-199` and
`play/razorfin/world.js:131-133` use the same helper for canvas bakes.
`play/_shared/ggkit.js:682-690` also warns that its Phaser helper is unsafe
with a fixed design-size `Scale.FIT` path unless the layout is adjusted.

Failure scenario: a DPR3 iPhone receives a 1x backing store and 1x baked
silhouettes, so every edge, gradient, and HUD label is upscaled and soft; just
raising the cap risks changing the FIT geometry.

Owner: A engine

## MAJOR

### RF-PROFILE-01: save schema and runtime consumers disagree

Evidence: the persisted shape is `sharks[id].up` and `selected` at
`play/razorfin/meta.js:8-11`. Runtime selection still reads the obsolete
`profile.owned` and `profile.lastShark` at `play/razorfin/game.js:213-227` and
`play/razorfin/game.js:1398-1402`; upgrades read obsolete `profile.upgrades`
at `play/razorfin/game.js:224-227`; abilities read obsolete
`save.upgrades` / `save.upgrade` at `play/razorfin/abilities.js:319-330`.
`play/razorfin/meta.js:255-279` proves the correct row-based accessors exist.

Failure scenario: a purchased shark is saved but the next boot silently
selects Reef, and purchased bite, speed, boost, and power upgrades have no
effect; dev session coins also diverge from the menu display at
`play/razorfin/game.js:511-513` and `play/razorfin/meta.js:278-280`.

Owner: A engine

### RF-RESULT-01: settlement payload is passed under the wrong shape

Evidence: `play/razorfin/game.js:1143-1159` passes the direct result of
`RF.Meta.endRun(ctx)` to `scene.start('Results', ...)`. Results only reads
`data.results` at `play/razorfin/meta.js:993-995`, then falls back to a zeroed
record at `play/razorfin/meta.js:1009-1014`.

Failure scenario: a completed run banks correctly but the Results screen can
show zero score, coins, XP, unlocks, and best data.

Owner: A engine

### RF-HITS-01: world collision records are discarded and damage is recomputed

Evidence: `play/razorfin/world.js:63-64` exports `playerHits`; predator,
mine, jelly, and puffer collisions populate it at
`play/razorfin/world.js:704-706`, `742-747`, `761-764`, and `784-785`.
`play/razorfin/world.js:978-984` clears it at the start of every update, and
`play/razorfin/NOTES-laneB.md:138-140` explicitly assigns same-frame
consumption to game.js. Instead, `play/razorfin/game.js:997-1027` performs a
separate spatial query and never reads `RF.World.playerHits`.

Failure scenario: a mine detonates and is removed before the independent game
query, making that collision harmless; jelly sting data and world-owned hit
timing are also lost.

Owner: A engine

### RF-PHASE-01: Phase Shift never clears its invulnerability state

Evidence: `play/razorfin/abilities.js:603-610` sets `st.phase = true` and
`phaseT`; `play/razorfin/abilities.js:667-678` clears active power state but
never clears `phaseT` or `phase`. `play/razorfin/game.js:1000-1002` treats any
positive `phaseT` as permanent predator immunity, and the player is not a
world entity whose status tick decrements that timer.

Failure scenario: after Goblin, Vex, or another Phase shark fires once, the
player can remain immune to predator bites for the rest of the run.

Owner: E abilities

### RF-PASSIVE-01: resolved passive multipliers never reach player stats

Evidence: abilities writes `statMults` at `play/razorfin/abilities.js:259-264`
and updates runtime multipliers at `play/razorfin/abilities.js:690-721`.
Game only consumes `p.mult` at `play/razorfin/game.js:146-153` and
`play/razorfin/game.js:1321-1334`; it does not consume `statMults`. Hunger
also multiplies by `num(p.pas.slowMetab, 1)` at
`play/razorfin/game.js:1045`, but the normal resolver supplies the boolean
`slowMetab`, not its numeric multiplier.

Failure scenario: Greenland's 0.5 metabolism, Cookiecutter's bite increase,
surface/depth powers, combo speed, and similar progression effects do not
change the live shark.

Owner: A engine

### RF-STATUS-01: DoT payloads and immunity flags are not honored by world

Evidence: abilities records per-effect damage in `st.burnDmg` and
`st.poisonDmg` at `play/razorfin/abilities.js:443-459`, but
`play/razorfin/world.js:896-910` applies fixed `3 * dt` burn and `1.6 * dt`
poison. The data contract sets Toxin Cloud `dot:0.8` at
`play/razorfin/data.js:92`. The ability-side immunity checks read
`st.fireImmune` / `st.toxinImmune`, but the resolved player passives are not
copied into those status fields.

Failure scenario: Toxin Cloud deals twice its authored damage, fire-wake damage
is overwritten by the fixed burn value, and immunity behavior is inconsistent.

Owner: B world

### RF-COINS-01: prey awards coins twice, with inconsistent Gold Rush rules

Evidence: `play/razorfin/game.js:950-976` immediately awards prey coins and
then kills the entity. `play/razorfin/world.js:881-893` drops a coin pickup
for that kill, and `play/razorfin/world.js:823-840` awards the pickup again.
The direct path applies combo and Gold Rush multipliers; the pickup path does
not.

Failure scenario: ordinary prey inflates the economy by paying once on swallow
and again on pickup, while Gold Rush values depend on which payout path wins.

Owner: A engine

### RF-INPUT-01: horizontal roster dragging can launch an unintended shark

Evidence: roster cards bind Phaser `pointerup` directly at
`play/razorfin/game.js:452-454`. The kit drag path tracks movement at
`play/razorfin/game.js:469-488`, including a `moved` variable, but the card
handler never consults it. The same menu also bypasses kit subscriptions for
Shop and Settings at `play/razorfin/game.js:373-381`.

Failure scenario: a thumb swipe intended to browse the fleet releases over a
card and starts a run for that card, or a scene transition loses the direct
Phaser release that the shared kit would have normalized.

Owner: A engine

### RF-UI-01: mobile HUD and menu controls violate the phone UI law

Evidence: live play splits the HUD between the top-left cluster and a
separate top-right coin label at `play/razorfin/game.js:620-648`, then adds a
bottom-right persistent chip at `play/razorfin/game.js:533-540`. The menu uses
9px and 10px card text at `play/razorfin/game.js:440-448`, 12px Settings text
with no padded hit area at `play/razorfin/game.js:379-381`, and bottom buttons
that are roughly 30 to 33px tall at `play/razorfin/game.js:367-375`.
This conflicts with `play/_assets/UI_LAW.md:18-25`, `31-45`.

Failure scenario: on a real 844x390 phone, the player must read tiny roster
labels and reach controls under the lower thumb zone while scanning three HUD
corners.

Owner: A engine

### RF-ART-01: special head silhouettes are constructed as pasted overlays

Evidence: all special heads are added after the generic body and fins through
`play/razorfin/sharkart.js:565-579` and `842-858`. Hammerhead, whale, and skull
are independent closed shapes at `play/razorfin/sharkart.js:346-362`,
`392-407`, and `466-476`; dorsals still use the same small generic fin path at
`play/razorfin/sharkart.js:317-338`.

Failure scenario: at gameplay size Hammerhead, Whaleshark, and Gravewater read
as a normal body with a hard-edged sticker attached, while the understated
dorsal silhouette disappears and species identity weakens.

Owner: D art

### RF-WORLD-DEPTH-01: zone identity exists in code but is not visible in the
normal gameplay composition

Evidence: `play/razorfin/world.js:213-249` builds only broad gradient and fog
bands; static decor is concentrated in the seafloor and kelp regions at
`play/razorfin/world.js:273-290`. The surface ribbon is only a 40px strip at
world y=0 at `play/razorfin/world.js:293-313`, and ambient emission is a low
contrast event every 0.35 seconds at `play/razorfin/world.js:995-1007`.
The supplied gameplay frame shows one largely uniform teal field, with no
readable surface ribbon or strong ambient/depth cue.

Failure scenario: a player crosses zones without getting a strong visual
change in depth, making the four-act progression feel like the same flat
water volume.

Owner: B world

## MINOR

### RF-CHRONO-01: death calls the Juice API with the wrong signature

Evidence: `play/razorfin/juice.js:413-425` expects numeric `(scale, ms)` and
requires `consumeSlowmo()`. Death calls `RF.Juice.slowmo(ctx)` at
`play/razorfin/game.js:1131-1135`, never consumes the result, and an inactive
player exits `game.js:765-766` before Abilities can run
`play/razorfin/abilities.js:667-678` to restore Chrono state.

Failure scenario: dying during Chrono queues a malformed 1ms slow-motion
request and skips the ability cleanup path, leaving the death presentation
dependent on unrelated manual time-scale resets.

Owner: F juice

### RF-PERF-01: collision-heavy frames allocate hit records in the hot loop

Evidence: `play/razorfin/world.js:50-64` promises reusable scratch state, but
each predator, mine, jelly, and puffer contact creates a new object literal at
`play/razorfin/world.js:704`, `742`, `761`, and `784`.

Failure scenario: a hazard cluster or predator pack creates garbage every
contact, producing avoidable collection spikes on a mid-range phone.

Owner: B world

### RF-PACK-01: pack motion records grow for the entire run

Evidence: `play/razorfin/world.js:45-50` stores packs in a Map;
`play/razorfin/world.js:507-510` inserts a new record for every burst, and
`play/razorfin/world.js:608-619` updates records without deleting expired or
empty packs.

Failure scenario: a long run accumulates stale pack records and slowly grows
memory despite the entity pool being bounded.

Owner: B world

### RF-DEV-01: the developer chip is a persistent, overly verbose watermark

Evidence: `play/razorfin/game.js:533-540` concatenates every active dev flag
into a 10px bottom-right string. The supplied gameplay frame shows
`DEV active forceUnlockAll forceSkipTutorial`, contrary to the UI law's ban on
always-on mode descriptions at `play/_assets/UI_LAW.md:24-25`.

Failure scenario: a player sees internal test state in the lower thumb zone,
and the verbose string competes with the playfield instead of exposing a
compact debug indicator.

Owner: A engine

### RF-BEST-01: Results reports the final combo, not the peak combo

Evidence: `play/razorfin/game.js:978-981` increments and resets only
`run.combo`; no peak is recorded. `play/razorfin/meta.js:405-406` falls back to
that final combo when `run.bestCombo` is absent, and
`play/razorfin/meta.js:446-447` labels a tied score as `newBest`.

Failure scenario: taking a hit late in a strong run reports `Best combo x0`,
and a score tie is incorrectly announced as a new best.

Owner: C meta

### RF-SAVE-VAL-01: malformed daily-bonus dates pass validation

Evidence: `play/razorfin/meta.js:77-85` validates only that `lastBonusDay` is a
string of at most 32 characters, not a date-shaped value. Settlement compares
the raw value to today's date at `play/razorfin/meta.js:411-414`.

Failure scenario: a partially corrupted profile containing an arbitrary
non-date string remains unequal to today's date and can receive the daily
bonus on every run without being rejected or repaired.

Owner: C meta

### RF-MENU-01: the roster has no explicit selected-state treatment

Evidence: card styling at `play/razorfin/game.js:417-430` is based on `owned`,
while selection is only mutated in the pointer handler at
`play/razorfin/game.js:452-456`; `selectedSharkId` is not used to style the
card. The supplied menu frame therefore reads as an ownership list rather than
a clearly selected loadout.

Failure scenario: after browsing or returning from a run, the player cannot
reliably tell which owned shark will be launched.

Owner: A engine

## NIT

### RF-TEST-01: isolated Node self-test loading is not environment-safe

Evidence: `play/razorfin/game.js:1303` reads the free global `GGKit`, and the
headless self-test path begins at `play/razorfin/game.js:1465`. In a clean Node
load with `window.RF` stubbed but no global `GGKit`, `RF.Game.__selftest()`
throws `GGKit is not defined` before completing.

Failure scenario: a CI harness that loads the title without browser global
aliasing reports a false green module set or aborts the game lane's own
regression checks.

Owner: A engine

## Balance sanity

- The authored tier unlock levels are coherent and visible in
  `play/razorfin/data.js:93`: 1, 3, 6, 10, 15, 21, 27, 33, 40, 47, 54, 60.
- Reef starts at 60 HP and 1.6 metabolism in `play/razorfin/data.js:5`.
  Zone 1 supplies tier 0 and tier 1 prey, so starter survival is viable when
  feeding. Zone 2 raises pressure to tier 3, tripling Reef's drain while only
  tier 1 prey remains reliably edible, so the first depth transition is already
  a deliberate feed-frequency check.
- Gold Rush is internally legible: `0.06` meter per eat means about 17 eats,
  then 8 seconds at 1.4 speed and 2x direct coins in `data.js:94`. The duplicate
  coin path in RF-COINS-01 makes its economy value wrong in practice.
- Upgrade costs use a 400 base, 1.7 growth, and `1 + 0.6 * tier` multiplier
  at `data.js:93` and `meta.js:247-253`. The curve is plausible on paper, but
  RF-PROFILE-01 means those upgrades currently do not affect runs, so pacing
  cannot be accepted as balanced yet.

## Verified controls and non-findings

- No `Math.random`, title `window` listeners, or game-logic timers were found.
- The fixed-step loop clamps long frames and drops backlog at
  `play/razorfin/game.js:728-743`, avoiding a tab-return spiral.
- World edge clamping and the 70 on-screen / 140 total entity budget are
  conservative and plausible at `play/razorfin/world.js:117-133` and
  `play/razorfin/data.js:102`; no spatial-hash edge miss was found in static
  review.
- Gameplay steering uses `kit.input.onDown`, `onMove`, and `onUp` at
  `play/razorfin/game.js:681-704`, so the shared release-swallow defect is not
  present in the live ocean gesture path.
- Juice has five pooled particle families at `play/razorfin/juice.js:30-44`,
  hit-stop and shake, a synthesized fallback for every SFX key at
  `play/razorfin/juice.js:516-548` and `705-738`, and a Gold Rush music layer.
- Tutorial and combo transient behavior is correctly top-strip / queued-chip
  shaped at `play/razorfin/game.js:664-670` and `1200-1278`; there is no live
  center banner.
- The art sheet demonstrates broad species distinctness across the 61-shark
  fleet. The failure is specifically gameplay-size construction quality for
  the special head overlays and dorsal silhouettes, not a missing-art or
  placeholder-art problem.
- No user-facing em dash was found in the Razorfin runtime strings.

## Verdict

FIX-THEN-SHIP (blocking ids: RF-RETINA-01, RF-PROFILE-01, RF-RESULT-01, RF-HITS-01, RF-PHASE-01, RF-PASSIVE-01, RF-STATUS-01, RF-COINS-01, RF-INPUT-01, RF-UI-01, RF-ART-01, RF-WORLD-DEPTH-01)
