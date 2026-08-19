# Razorfin re-check review 2

Read-only verification of the REVIEW-1 fix loop against the revised runtime
code, lane notes, and supplied gameplay/menu/art evidence. Existing combined
lane selftests pass, but the checks below also cover seams those selftests do
not exercise.

## Blocking ids

### RF-RETINA-01 — CLEARED-WITH-NOTE

`game.js:32-42` owns a clamped 1..3 DPR, sizes the title at `844 * DPR` by
`390 * DPR`, and routes layout/font geometry through `S()`. The Phaser config
uses device-pixel dimensions and `scale.zoom = 1 / DPR` at `game.js:1820-1849`;
`sharkart.js:190-204` and `world.js:133-140` bake from `RF.Game.dpr` instead
of the kill-switched kit DPR.

The two-camera reconciliation is internally consistent: the world camera is
zoomed by DPR and the HUD camera is unzoomed at `game.js:857-875`; pointer
conversion divides by the world camera zoom at `game.js:1037-1043`. World
queries remain in design/world units, and FX emit raw world coordinates through
`game.js:103-105`, `juice.js:188-217`, and `world.js:1366-1382`, so no DPR is
double-applied. Headless DPR/selftest proof exists. Real-device retina
verification remains the accepted owner ship gate and is not re-raised here.

### RF-PROFILE-01 — NOT-CLEARED

The ordinary stat tracks now read the correct per-shark row through
`game.js:306-319` and apply bite/speed/boost in `game.js:1724-1740`. The power
track still does not reach the runtime. `abilities.js:362-373` reads
`player.up.power`, then falls back to obsolete global `save.upgrades` /
`save.upgrade`; `game.js:1743-1755` constructs the player without `p.up` or a
per-shark power row. Consequently `chargeMultiplier()` at
`abilities.js:376-381` sees zero for a purchased `sharks[id].up.power`, while
Shop still writes that field at `meta.js:367-372`. The existing game selftest
only proves the bite track (`game.js:2090-2093`), not power.

### RF-RESULT-01 — CLEARED

`game.js:1526-1556` passes the settlement as `{ results: payload, ctx }`, and
`meta.js:1047-1050` reads `data.results`. The defensive zero record is now only
the no-payload fallback, not the normal end-run path.

### RF-HITS-01 — CLEARED

`game.js:1092-1105` runs `World.update`, then `Abilities.update`, then consumes
`RF.World.playerHits` in the same fixed step. `world.js:63-79,101-102` owns a
pooled, reset-per-frame hit buffer; predator/mine/jelly/puffer producers write
the records, and `game.js:1365-1389` sums and applies them once without a
second spatial re-query. The new camera split does not affect these world
queries because the simulation stays in design/world coordinates.

### RF-PHASE-01 — CLEARED

`abilities.js:346-360` ticks `phaseT` and derives `phase` from its remaining
time. `finishActive()` clears both at `abilities.js:710-733`, and `reset()`
clears active timers and status at `abilities.js:735-778`. Game teardown calls
that reset before changing scenes at `game.js:1519-1525` and on shutdown at
`game.js:905-912`.

### RF-PASSIVE-01 — CLEARED

`abilities.js:790-822` writes live speed/bite/boost/hp/metabolism multipliers,
including zone and combo effects, to `player.st.statMults`. `game.js:217-225`
prefers those live values; movement/eat/hunger consume them at
`game.js:1160-1168`, `game.js:1270-1274`, and `game.js:1407-1414`. Hunger uses
the numeric metabolism multiplier rather than the old boolean passive flag.

### RF-STATUS-01 — CLEARED

Ability application records authored payloads in `st.burnDmg` and
`st.poisonDmg` and rejects immune targets at `abilities.js:486-502`.
`world.js:1264-1324` applies those payload rates, clears payloads when timers
expire, and clears both timers/payloads for fire/toxin immunity. Player passive
immunity is synchronized through `world.js:1288-1300` and the ability reset
path clears the player status fields.

### RF-COINS-01 — CLEARED

`game.js:1280-1322` is the direct payout authority for prey swallowed by the
player and sets `e.coins = 0` before `World.kill(e, 'eaten')`. The world drop
guard at `world.js:1251-1261` therefore cannot create a second pickup for that
entity. Separately caused deaths retain the world pickup path, whose only
collection payout is `world.js:1227-1247`; `game.js:1340-1342` is deliberately
a no-op.

### RF-INPUT-01 — NOT-CLEARED

The roster drag fix is real: `game.js:608-638` has one kit gesture owner and
uses the same moved threshold to suppress a launch after a swipe. Menu Shop and
Settings targets use the guarded `tapTarget()` path at `game.js:489-499`.

There is still a live first-launch bypass in the meta-owned Shop. Menu starts
Shop without passing context at `game.js:493`; before any Ocean run,
`RF.ctx` is still null, so `meta.js:658-660` gives Shop no kit. Its
`bindInput()` then takes the direct Phaser fallback at `meta.js:709-725`
instead of `kit.input`. This violates the architecture contract that all input
uses kit subscriptions and leaves the original Shop seam unfixed on a fresh
boot. Results normally receives `ctx`, so its corresponding fallback is not
the primary failure here.

### RF-UI-01 — NOT-CLEARED

The structural fix holds: gameplay now has one top-left HUD cluster containing
health, boost, power, and coins at `game.js:938-968`; there is no persistent
bottom HUD control, and hit rectangles are padded. Menu chrome is top-edge and
the drawn Settings control is 14px.

The text-size law is still violated. Menu shark names are `txt(12)` and lock
lines are `txt(11)` at `game.js:574-583`; the in-play name, coin, and power
labels are also `txt(11)` at `game.js:955-967`. `txt()` scales device pixels,
but the effective CSS sizes remain 12px/11px. UI_LAW requires approximately
14px effective text for anything the player must read (`play/_assets/UI_LAW.md:38-40`).
The fix reduced the old 9/10px problem but did not clear this requirement.

### RF-ART-01 — CLEARED

Hammer, whale, and skull silhouettes are now integrated into the single
`bodyPath()` contour at `sharkart.js:296-354`; the feature functions explicitly
provide internal lines/features rather than pasted closed head plates
(`sharkart.js:487-493,523-535,606-623`). The ordinary dorsal is deliberately
prominent in `drawFins()` at `sharkart.js:455-479`, and the bake path is DPR
aware at `sharkart.js:190-204`. The lane flood-fill/sweep selftest passed for
the special heads.

### RF-WORLD-DEPTH-01 — CLEARED

World construction now provides per-zone band textures, seams, fog, side
vignettes, anchored midwater silhouettes, a surface wash, god rays, and a
scrolling surface ribbon at `world.js:427-506` and `world.js:551-680`. The
silhouettes are capped and low-alpha rather than large floating obstructions;
the supplied gameplay frame shows the tuned surface-light treatment. All
coordinates remain world/design coordinates under the zoomed main camera.

## Camera split audit

No new pointer/coordinate regression was found in the DPR split. `toDesign()`
maps the client point into the dense canvas space (`game.js:1879-1883`), and
Ocean divides by `cameras.main.zoom` before writing the steering target
(`game.js:1037-1043`). `hudAdd()` excludes HUD objects from the world camera and
`hudCamSeal()` excludes world objects from the HUD camera (`game.js:717-744`).
World queries and FX emission receive simulation coordinates, not `S()`-scaled
coordinates, which is correct for the zoomed world display list.

## Minor spot-checks

- RF-CHRONO-01 — **CLEARED**: death uses `slowmo(0.32, 1200)` and consumes the
  grant at `game.js:1499-1511`; ability reset restores time scale.
- RF-DEV-01 — **CLEARED-WITH-NOTE**: the runtime chip is now a compact `DEV`
  badge at `game.js:821-834`, but see the new debug-menu overlap below.
- RF-BEST-01 — **CLEARED**: `comboPeak` is raised beside the combo increment at
  `game.js:1324-1329`, and `meta.js:424-502` reports it with strict new-best
  comparison.
- RF-SAVE-VAL-01 — **CLEARED**: Meta validates and repairs the daily date
  before settlement; its selftest covers malformed save data.
- RF-PERF-01 — **CLEARED**: world hit records use the reusable pool at
  `world.js:63-79`.
- RF-PACK-01 — **CLEARED**: the pack ring is capped at 48 records at
  `world.js:82-97`.
- RF-MENU-01 — **CLEARED-WITH-NOTE**: `paintCards()` now has a filled selected
  plate, accent border, and ON marker at `game.js:654-671`. After selecting a
  shark in Shop, however, Shop updates Meta/profile state without updating the
  game closure `selectedSharkId`; returning to Menu can paint the old shark as
  selected until another menu selection is made (`meta.js:945-959`,
  `game.js:661-680`).
- RF-TEST-01 — **CLEARED**: runtime kit access is through `root.GGKit` via
  `ggkit()` (`game.js:196-205`), and the isolated/combined selftests pass
  without a free `GGKit` binding.

## New findings, ranked

1. **MINOR — RF-NEW-DEV-MENU-OVERLAP:** when DevMode is active, the Menu Shop
   button occupies the top-right region at `game.js:489-494`, while `devChip()`
   places DEV at `W - S(10), S(6)` at `game.js:825-834`. Their padded bounds
   overlap. This is debug-only, but it conflicts with the no-overlap UI intent
   and can obscure Shop in the supplied DEV-style review state.
2. **MINOR — RF-MENU-01 cross-scene selection:** the Shop-to-Menu stale
   `selectedSharkId` state described above is a regression in the repaired
   selected-state flow. It does not affect a direct card tap, but it can make
   the visible loadout and keyboard launch choice stale after Shop.

Static law sweep found no new `Math.random`, game-logic timer, window/document
listener, or user-facing em-dash violation. The three NOT-CLEARED blocking
seams above are not discharged by the passing existing selftests.

## Verdict

FIX-THEN-SHIP (RF-PROFILE-01, RF-INPUT-01, RF-UI-01)

## Re-check 2

### RF-PROFILE-01 — CLEARED

`game.js:1728-1730` continues to apply the bite/speed/boost rows, and the
player construction at `game.js:1754-1761` now snapshots all four per-shark
tracks, including `up.power`, through `upgradeLevel(def.id, track)`.
`abilities.js:362-376` reads only `player.up.power`; a runtime search of the
JavaScript sources found no remaining `save.upgrades` or `save.upgrade`
consumer. The existing selftests pass, and the focused purchase/charge probe
reached reef power levels 1, 2, 3 after three Shop buys and produced the
expected level-3 charge multiplier.

### RF-INPUT-01 — CLEARED

Both meta scenes use the requested live-kit resolution. Shop does so at
`meta.js:711-726`, and Results does so at `meta.js:1175-1184`; Results keeps
its release-only subscription and its Phaser `pointerup` fallback. The boot
assignment and getter at `game.js:1794-1805,2135-2145`, plus Menu's unadorned
`scene.start('Shop')` at `game.js:489-494`, mean a fresh-boot Shop can obtain
the boot-time kit even while `RF.ctx` is null. The kit contract supplies all
three Shop callbacks at `play/_shared/ggkit.js:367-369`. No input regression
was found.

### RF-UI-01 — NOT-CLEARED

The requested 14px changes are present at `game.js:574-583` and
`game.js:955-966`. The bump creates two concrete overflow cases. Menu cards
have `cw = 86` CSS px at `game.js:540-552`, but `Hammerhead` is only ten
characters and therefore is not truncated at `game.js:575-577`; at the 14px
card weight it measures about 89px and overruns the card. In play, the name
starts at x18 while the right-aligned coin label ends at x146
(`game.js:955-960`), leaving 128px. `Cookiecutter Shark` and
`Longnose Sawshark` exceed that span at the 14px name weight, so the name can
collide with the coin label. Lock-line strings fit, but these definite menu
and HUD collisions leave the id open.

## Re-check 2 verdict

FIX-THEN-SHIP (RF-UI-01)

## Re-check 3

### RF-UI-01 — NOT-CLEARED

The requested `fitText()` helper at `game.js:803-811` terminates: each loop
removes one character from the source string, so even a tiny `maxW` cannot
spin forever. A short name returns untouched, and the measured-width truncation
is applied at both required call sites: menu names at `game.js:575-577` with
`cw - S(8)`, and the HUD name at `game.js:967-968` with `S(82)`. The tutorial
seam is also fixed: `meta.js:531` maps `notut` to
`DevMode.state.forceSkipTutorial`, and `game.js:995` consumes that flag while
retaining the legacy `state.notut` check.

The remaining 14px fixed-slot risk is the live HUD coin label. It is created at
`game.js:972` and updated from unbounded `ctx.run.coins` at `game.js:1646-1648`
without `fitText()` or a width cap. The fitted name may occupy x18 through x100
CSS px, leaving only 46 CSS px before the right-aligned coin anchor at x146;
six-digit coin strings can exceed that slot and collide with the name. The
other 14px consumers are bounded or auto-sized: menu lock strings are limited
to the data's cost/level forms, the power label is capped to four characters,
Shop button labels fit their 96px boxes, and Results text is not inside a fixed
text box.

## Re-check 3 verdict

FIX-THEN-SHIP

## Re-check 4

### RF-UI-01 — NOT-CLEARED

The HUD update site now uses `compactNum(ctx.run.coins)` at
`game.js:1658-1659`, and the helper is located above `fitText()` at
`game.js:804-811`. The documented format boundaries pass: `9999` is four
glyphs, `10000` renders as `10.0k` (five), `99999` as `99.9k` (five), and the
million forms remain at five glyphs or fewer.

The helper is not bounded for every possible count, however. Its final branch
returns `Math.floor(n / 1000000) + 'M'` without limiting the mantissa; for
example, `1e12` renders as `1000000M` (eight glyphs). No other unbounded string
was found feeding a fixed 14px slot in `game.js`: menu names use `fitText()`,
the power label is sliced to four characters, and the remaining dynamic text
is either bounded by its data form or not in a fixed-width slot.

## Re-check 4 verdict

FIX-THEN-SHIP

## Re-check 5

### RF-UI-01 — CLEARED

`game.js:804-811` now saturates the final `compactNum()` branch to the
literal `99M+`. The branch-boundary checks and a 100,000-case fuzz over
`[0, Number.MAX_SAFE_INTEGER]` passed; negative, `NaN`, and infinite inputs
also normalize to bounded output. Every result is at most five glyphs, with
`10.0k` the worst-case output.

## Re-check 5 verdict

SHIP
