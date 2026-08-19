# Lane C build log (meta.js)

## Lane C pass 1: save schema, economy, Shop/Results scenes, DevMode

Delivered: `play/razorfin/meta.js` only. Namespaces `RF.Meta` and `RF.DevMode`.
No other lane's file touched. No `window`/`document` listeners registered, no
`setTimeout`/`setInterval`. Phaser is never booted here; the two scene classes
are handed to game.js on `RF.Meta.scenes` and are built only when
`typeof Phaser !== 'undefined'` (headless, `RF.Meta.scenes === null`).

### Save schema (SAVE_VERSION = 1)

Exactly the SPEC shape:

```
{ v:1, coins, xp, level, selected,
  sharks:{ [id]: { owned:bool, up:{bite,speed,boost,power} } },
  best:{ score, biggestTier }, runs, tutorialDone, lastBonusDay }
```

`defaultProfile()` owns and selects `reef` with a zeroed up block, everything
else empty.

`validateSave()` is strict and rejects the WHOLE record on any violation, so a
corrupt store always falls back to a fresh profile rather than a half-repaired
one. Checked: object-ness (arrays rejected), `v === 1`, `coins`/`xp` finite
safe integers in `0..1e12`, `level` integer `1..RFD.ECONOMY.levelCap` (60),
`runs` `0..1e9`, `best.score` `0..1e12`, `best.biggestTier` `0..12`, `selected`
a string present in `RFD.SHARK_BY_ID`, every `sharks` key present in
`SHARK_BY_ID`, every `up` key one of the four tracks, every up level an integer
`0..RFD.ECONOMY.upgradeCosts.levels` (5), `lastBonusDay` null or a short string.

Two rules beyond the brief, both because the state is not representable by any
legal play sequence and would otherwise let a hand-edited store buy value:
- `selected` must be owned by the PERSISTED record (a dev pick never lands here,
  by construction, see below).
- a shark with `owned:false` may not carry upgrade levels above zero.

`tutorialDone` and `owned` are the only coerced fields, and only from `0`/`1`;
any other type rejects. Coercion happens in `normalize()` after validation.

### Migration chain

`migrate()` follows the horde-meridian forward pattern: one step per version,
falling through. A record with `v == null` is a pre-release write, so it is
rebuilt from `defaultProfile()` carrying only `coins`/`xp`/`runs`/`tutorialDone`
when each is individually plausible, and `level` is RECOMPUTED from the carried
xp rather than trusted. Anything with an unrecognised `v` returns null and the
caller takes the default. The next step slots in at the marked comment:
`if (p.v === 1) { ...; p.v = 2; }`.

`load(kit)` is `kit.save.get(null)` -> `migrate` -> `validateSave` -> `normalize`,
with every stage wrapped so a throwing store cannot block boot. `commit()`
re-validates a deep clone before writing, so an in-memory profile that some
other lane corrupted at runtime fails the write instead of poisoning storage.

### Economy

- `xpStep(n) = round(base * growth^(n-1))` with base 100, growth 1.13.
- `xpForLevel(n)` is the CUMULATIVE total to have reached level n, so
  `xpForLevel(1) = 0`. Measured: L2 100, L10 1,541, L30 25,856, L60 1,040,790.
- `levelForXp(xp)` inverts it and also returns `{into, need}` for the xp bar.
- `addXp` clamps at the cap and returns the level-up count.
- `tierUnlocked(profile, tier)` is `profile.level >= ECONOMY.tierUnlockLevel[tier]`
  (T1@L1 through T12@L60), and is forced true under `forceUnlockAll`.
- `upgradeCost(tier, lvl) = round(base * growth^lvl * (1 + tier*tierMult))` with
  base 400, growth 1.7, tierMult 0.6. Tier 1 track: 640, 1088, 1850, 3144, 5345.
  Tier 12 track: 3280, 5576, 9479, 16115, 27395.
- `canBuy`/`buy` take `{shark:id}` or `{upgrade:{id,track}}` and return
  `{ok, reason}` (reasons: `bad-request`, `unknown-shark`, `unknown-track`,
  `owned`, `dev-unlocked`, `not-owned`, `locked` (+`needLevel`), `coins`
  (+`cost`), `maxed`). `buy` mutates the profile only on success.

### Dev overlay law

`RF.DevMode.state` is never persisted, and three separate mechanisms enforce it:

1. `ownedFor()` may report true for a dev-unlocked shark, but `reallyOwned()`
   reads the persisted record only, and every write path uses `reallyOwned`.
2. `buy({shark})` refuses with `dev-unlocked` while `forceUnlockAll` is on, so
   there is no path that writes `owned:true` from the overlay.
3. `select()` writes `profile.selected` only for a genuinely owned shark.
   A dev-only pick goes to `RF.Meta.sessionSelected` instead, and
   `RF.Meta.activeShark(profile)` is what the run should read.

**sessionCoins** (`?coins`) is the same idea for currency: it is an additive
DISPLAY overlay (`displayCoins()` = persisted + overlay) that `spend()` drains
FIRST. A dev purchase therefore consumes overlay before it can touch persisted
coins, and once the overlay is exhausted further spending is real and honest.
Default grant is 50,000; `?coins=N` grants N. The selftest asserts the persisted
coin count is unchanged across two overlay-funded purchases.

`RF.DevMode.init()` parses `URLSearchParams` exactly once (idempotent guard),
inside try/catch, so a malformed query string cannot block boot. Switches:
`unlockall`, `invincible`, `coins`, `notut`, plus `zone`. It installs
`window.__rf = {version:1, state, switches, unlockAll(), resetSave(),
giveCoins(n), forceGoldRush(), forcePower(id), forceZone(n)}`. The `force*`
setters only write flags on `RF.DevMode.state`; the consuming lanes read them
under their own guards. `resetSave()` calls `kit.save.clear()`, rebuilds the
default into `RF.ctx.save`, and reloads.

### endRun

`endRun(ctx)` reads `ctx.run`, applies `coinRunMult`/`xpRunMult`, applies the
daily bonus when `profile.lastBonusDay !== localDayString()` (multiplier
`ECONOMY.dailyBonusMult` = 1.5, stamped once per local date), credits coins and
xp, computes level-ups, updates `best.score`/`best.biggestTier`, increments
`runs`, gathers unlock callouts for every tier whose required level was crossed
by this run, commits, and returns the results payload including `baseCoins`,
`bonusCoins`, `dailyBonus`, `xpInto`/`xpNeed` for the bar, `bestCombo` and
`newBest`.

### Scenes

Both are out-of-run, dark-water (`#02101c` with four depth bands), high
contrast, and every tap target is at least 44px.

**Shop**: a second Phaser camera scrolls the list while the header and footer
stay fixed (the main camera ignores the list container and the list camera
ignores the chrome). Three act sections, "Real Sharks" / "Monsters" /
"Legends", each sorted by tier then cost. Each row carries a palette-tinted
tier badge, name, three normalized stat bars (speed/bite/hp, denominators
derived from the roster maxima so a data.js regeneration stays correct),
passive and active chips as text, and a 96x46 button reading BUY / SELECT /
IN USE, or `LVL N` on a locked tier with the row state reading LOCKED. The
footer is the upgrade panel for the currently active shark: four tracks, five
pips each, live cost or MAX under each, whole column tappable. Failures speak
through a small self-fading toast, not a center banner.

Input uses `kit.input.onDown/onMove/onUp` when a kit is present (fleet law and
the `_shared/NOTES.md` release-side defect), falling back to the scene's own
Phaser input otherwise, and both feed the same handlers. Drags over 6px suppress
the tap so scrolling never fires a button. All subscriptions are unsubscribed on
scene `shutdown`.

**Results**: score with best or NEW BEST, biggest prey tier, best combo, coins
earned with a separate daily bonus line when it applied, an xp bar with the
level and a LEVEL UP flourish that eases off in `update()` (off the scene clock,
no timers), up to three unlock callouts, and AGAIN / SHOP / MENU buttons at 48px.
It renders a safe placeholder rather than throwing if started with no payload.

Cross-namespace calls are guarded: `RF.Art.paletteOf` is tried inside try/catch
and falls back to `sharkDef.sil.palette` from data.js, so the Shop renders
correctly even when Lane D has not loaded.

### Self-test proof

`RF.Meta.__selftest()` is headless. It stubs the kit as
`{save:{get,set,clear,_raw}}` and restores any mutated `RF.DevMode.state` and
`sessionSelected` on the way out, so running it never alters a live session.

Coverage: default validity and round-trip; eleven corrupted records each
rejected to default (NaN coins, unknown shark id, up level 9, selected unowned,
`v:99`, negative xp, level above cap, upgrades on an unowned shark, unknown up
track, coins over cap, `sharks` as an array); the buy path (earn, refused while
tier-gated, level to the cap, buy succeeds, upgrade five steps with each cost
asserted equal to the formula and the sequence strictly increasing, past-cap and
unowned refusals); the dev law (profile JSON byte-identical after `ownedFor` +
`select` + attempted rebuy of a legend, and the committed record contains
neither the legend id nor a changed `selected`); the sessionCoins overlay spent
first across two purchases with persisted coins untouched; endRun math (bonus
applied once, base-only on the second run of the same date, re-armed by a new
date, best not lowered by a worse run, runs incremented, level-ups from xp,
persisted record still valid); versionless migration carrying plausible values
and dropping implausible ones with the level recomputed; and the xp curve
(cumulative, strictly increasing to the cap, `levelForXp` inverts `xpForLevel`,
clamps at the cap).

```
$ node --check meta.js
PARSE OK

$ node -e "<data.js + meta.js in a window stub>; RF.Meta.__selftest()"
scenes (no Phaser) = null
__rf keys = version,state,switches,unlockAll,resetSave,giveCoins,forceGoldRush,forcePower,forceZone
---
PASS=true  checks=69  fails=0
```

Scene construction verified separately against a minimal `Phaser.Class` /
`Phaser.Scene` stub: both classes build, carry keys `Shop` and `Results`, and
`init()` runs clean.

```
scenes: [ 'Shop', 'Results' ]
Shop key: Shop has create: function
Results key: Results has create: function
selftest under Phaser: true
```

Dev switch parse verified live, including a malformed query string
(`?coins=abc&zone=99&unlockall=nope`) which parses without throwing and leaves
the boolean switches off.

No em dashes in the file (grep clean).

### For the orchestrator

- `RF.Meta.activeShark(profile)` is the call game.js should use to pick the run
  shark, NOT `profile.selected`, or a dev-selected shark will not take effect.
- `RF.Meta.displayCoins(profile)` is the number the HUD should show, not
  `profile.coins`, or the `?coins` overlay will be invisible.
- Shop and Results start sibling scenes by key (`Ocean`, `Shop`, `Menu`) and
  pass `{ctx}` through. If Lane A names those scenes differently the two `go`
  and `leave` calls are the only lines that need to change.
- `RF.DevMode.init()` must be called by game.js before the first
  `RF.Meta.load()` so `forceUnlockAll` is live when the Menu first queries
  ownership. It is idempotent, so a second call is harmless.
- `RF.Meta.scenes` is null when Phaser is absent. game.js should guard the add.

---

## Fix pass 1 (post REVIEW-1)

Scope: `meta.js` only. Two REVIEW-1 findings assigned to "C meta" were fixed.
RF-TEST-01 is assigned to **A engine** (`game.js:1303`, free global `GGKit`), not
to C, so it was not touched here.

### RF-BEST-01: Results reported the final combo, not the peak combo

Two defects were in one payload.

**Peak combo.** `endRun` read `run.bestCombo` and fell back to `run.combo`, the
live counter that `game.js:1039`/`1064` resets to 0 on a hit or on combo-window
expiry. Dying after a late hit therefore reported `Best combo x0`.

Fixed with a new `comboPeakOf(run)` helper read by `endRun`. It takes the
**max** of whichever of `run.comboPeak`, `run.bestCombo`, and `run.combo` are
present, flooring to a non-negative integer and ignoring `NaN`/non-numbers.

The preferred seam is `ctx.run.comboPeak`, per the dispatch instruction and
REVIEW-1's evidence lines. **game.js does not currently maintain it** (grep of
`game.js` finds only `run.combo`, `run.comboT`; `comboPeak` appears nowhere).
So meta.js reads it defensively today and works either way:

- **If A engine adds it** (one line next to `ctx.run.combo++` at `game.js:978`,
  e.g. `if (ctx.run.combo > ctx.run.comboPeak) ctx.run.comboPeak = ctx.run.combo;`
  plus `comboPeak: 0` in the run-context init), the true peak is reported and
  the finding is fully closed.
- **If A engine does not**, the max-of-fields fallback still reports the live
  counter, which is no worse than the previous behavior and correctly reports a
  combo that was still running at death.

Meta cannot close this alone: nothing in meta.js observes the run frame by
frame, so the peak has to be recorded where the counter is incremented.
**Action for A engine: set `ctx.run.comboPeak`.**

**Tied score announced as a new best.** `newBest` was computed as
`score >= profile.best.score` *after* `profile.best.score` had already been
raised to the new score, so every scoring run, tie included, reported
`newBest`. Now `prevBestScore` is captured before the record is mutated and
the test is strict: `score > prevBestScore && score > 0`.

### RF-SAVE-VAL-01: malformed daily-bonus dates passed validation

`validateSave` only required `lastBonusDay` to be a string of at most 32 chars.
Settlement compares it for **inequality** against `localDayString()`, so any
junk string is permanently unequal and pays the daily bonus on *every* run.

Two changes, deliberately split so `validateSave` gets stricter while profiles
get *repaired* instead of destroyed:

1. New `isDayString(v)`: exactly 10 chars, `^\d{4}-\d{2}-\d{2}$`, year
   1970-9999, and a real calendar day (round-tripped through `Date` so
   `2026-02-30` and `2026-04-31` are rejected; `2024-02-29` is accepted).
   `validateSave` now requires `lastBonusDay` to be `null` or `isDayString`.
2. New `repairDayField(p)` called from `migrate()` *before* validation nulls a
   malformed marker. Losing the marker at worst grants one extra daily bonus;
   keeping the junk grants one every run. Coins, owned sharks, upgrades, and
   level are untouched by the repair.

`validateSave` strictness is otherwise **unchanged** - no other field was
loosened, and `commit()` still refuses to persist a record with a malformed day
because it validates the outgoing clone.

Both helpers are exported on `RF.Meta` (`isDayString`, `comboPeakOf`) so the
review and any harness can exercise them directly.

### Self-test proof

Extended `__selftest` with sections 5b (RF-BEST-01) and 5c (RF-SAVE-VAL-01):
peak-over-reset-counter, bare-counter fallback, max-of-fields, negative and
fractional peaks, missing/NaN combo data; endRun reporting the peak after a
reset, first-run new best, an exact tie NOT reported as a new best, a one-point
improvement reported, a zero score never a new best; twelve `isDayString`
shapes including leap day, impossible February and April days, unpadded month,
a full timestamp, junk and non-string inputs, and `localDayString()`'s own
output; `validateSave` accept/reject for junk, real, and null days; and the
repair path proving a junk day survives `load()` with coins, owned sharks, and
upgrades intact, is nulled, revalidates, then takes the daily bonus exactly
once with the marker rewritten to today, while a legal day is left untouched.

```
$ node --check meta.js
PARSE OK

$ node -e "<data.js + meta.js in a window stub>; RF.Meta.__selftest()"
scenes (no Phaser) = null
---
PASS=true  checks=104  fails=0
```

Check count 69 -> 104, zero failures; every pre-existing check still passes.
No em dashes in the file (grep clean).

---

# Lane C3 (Rev-3D): ui3d.js + index3d.html

Scope delivered: `ui3d.js` (classic script, `window.RF.UI`) and the 3D entry
page. `meta.js` is UNTOUCHED and is the only backend: `load/commit/endRun/buy/
select/ownedFor/tierUnlocked/activeShark/displayCoins/upLevel/upgradeCost/
levelForXp/tierUnlockLevel` plus `RF.DevMode.state`. No other lane's file was
edited.

## Entry page is index3d.html, NOT index.html

Per the orchestrator's sequencing correction: the 2D `index.html` stays live and
git-clean while the 3D modules are still landing, so all 3D entry work targets
`index3d.html`. The orchestrator owns the cutover. I overwrote `index.html`
once before that instruction arrived and restored it with
`git checkout -- play/razorfin/index.html`; it is confirmed clean.

Page structure: `phaser.min.js` REMOVED, **ggkit.js stays** (the engine needs
it). Load order is data.js -> meta.js -> abilities.js (classic) -> ui3d.js
(classic) -> importmap {three} -> fx3d/shark3d/world3d/engine3d (modules).
`base href`, viewport, theme-color, manifest and favicon are unchanged. The
page carries the DOM containers and all CSS for the four overlays. All CSS is
authored in plain CSS px (three owns density via `setPixelRatio`;
`RF.Game.S` does not exist and is not referenced).

The 40 element ids in `NODE_IDS` are the hard contract between the two files;
a check that every id exists in `index3d.html` is part of the proof below.

## RF.UI surface (reconciled with engine3d.js)

```
init(opts)          opts = {profile, start(id), firePower, quit, ctx?, document?}
showMenu(state)     showShop(state)    showResults(payload)
showHud()           hideAll()
runStarted(ctx)     runEnded(ctx)
hudState(obj)       tutorial(text|null)     setThumb(id, dataURL)
onDive/onPower/onShopNav      chip(text)  toast(msg)  screen (getter)
__selftest()
```

`init` takes the engine's HANDLE BAG. DIVE and AGAIN reach `start(id)`, the
power button reaches `firePower()`. Callbacks work BOTH ways: registered
(`RF.UI.onDive(fn)`) or assigned (`RF.UI.onDive = fn`, which is what the engine
does). `cb()` distinguishes them by tagging the registrars `__rfReg`, and an
explicit registration wins over the handle. Every callback and handle is
invoked inside try/catch so a throwing consumer cannot escape into the frame.

**The engine's `HUD_STATE` is a REUSED object.** `hudState` reads it
synchronously and retains only primitives in the diff cache; a selftest check
mutates the pushed object afterwards and asserts nothing changed. Fields
consumed: `name, hp, maxHp, hpFrac, boost, power, powerId, powerReady, coins,
dev, combo, comboMult, chips`. `hpFrac` is trusted when present. `powerId` is
resolved to a label through `RFD.ABILITIES` (`powerName` still accepted).
The bounded `chips` QUEUE is drained ONE entry per push, never stacked, which
is how UI_LAW rule 1/3 is honoured against an engine that can queue four.

`runStarted` deliberately KEEPS the tutorial strip: engine3d.js calls
`tutorial(...)` on the line immediately before `runStarted(ctx)`, so clearing
every transient there would wipe the coach line before it could be read. It
drops the chip and toast only. `runEnded` clears everything and nulls the diff
baseline so the next run's first push is never swallowed as unchanged.
`tutorial()` does NOT re-check `tutorialDone`/`forceSkipTutorial`: the engine
already gates the call and commits the flag in the same breath, so re-testing
it would swallow the single call the engine makes.

## Screens

**Menu**: RAZORFIN title, level + xp meter + coins, roster ladder grouped by
tier ascending. Locked tiers read `Reach level N` and dim. Owned cards show
Owned/Selected, unowned show the cost and route to the Shop on tap. Selecting
goes through `RF.Meta.select` and commits only when the pick is genuinely
persisted, so the dev overlay never writes to the save.

**Thumbnails**: 2D `sharkart.js` is NOT loaded, so nothing is baked at boot.
`setThumb(id, dataURL)` accepts pushes from engine/shark3d and live-patches any
card already on screen. Until one arrives each card renders a styled MONOGRAM
tinted from `def.sil.palette`, so the menu is fully usable with zero
thumbnails. Verified live: 61 monograms at boot, one swaps to an image on a
single `setThumb` with no rebuild.

**Shop**: three act sections (Real Sharks / Monsters / Legends), each sorted by
tier then cost. Rows carry a palette-tinted tier badge, name, three normalized
stat bars (denominators from the roster maxima so a data.js regeneration stays
correct), ability and passive chips, and a BUY / SELECT / IN USE / `LVL N`
button. Footer is the upgrade panel for the focused shark: 4 tracks x 5 pips
with the live cost from `RF.Meta.upgradeCost`. Failures speak through a small
self-fading toast, never a center banner.

**Results**: score, NEW BEST (strict, honours the RF-BEST-01 fix), coins with a
separate gold daily-bonus line, biggest prey tier, peak combo, xp gained, an xp
bar, LEVEL UP with the level-up count, and up to three unlock callouts.
The panel is a flex column: header + SCROLLING detail + PINNED action row, so
AGAIN/SHOP/MENU stay on screen at 390px tall even with three callouts. That was
a real defect the browser probe caught (actions sat at y=454, below the fold).

**HUD**: one top-left cluster (name, hp, boost, coins compact as `1.2k`),
measured at 3.37% of a 844x390 screen. Power button is bottom-right, 84px,
`pointerdown` (allowed in-run, it is not a game gesture), with a `click`
suppressor so a tap cannot fire it twice. Combo chip is exactly 24px and 0.38%
of screen, one at a time. DEV chip and the one-line tutorial strip complete it.
`#rfHud` is `pointer-events:none` except the power button, so every other tap
falls through to the game surface: kit.input keeps GAME input.

## Proof

```
$ node --check ui3d.js
PARSE OK

$ node -e "<data.js + meta.js + ui3d.js in a window stub>; RF.UI.__selftest()"
PASS=true  checks=120  fails=0
```

`__selftest` runs against a minimal `document` stub (no jsdom), covers pure
logic only, and restores every mutated global in a `finally`: formatters and
clamps, buy-failure copy, screen transitions and the exactly-one-screen-at-a-
time invariant, `hudState` diffing (identical push is a no-op, partial pushes
carry fields forward, hpFrac precedence, powerId resolution), the combo chip
token so a chip is replaced and never stacked, the chips-queue drain, the
no-retain assertion on the reused state object, the thumb cache and the
monogram fallback, engine handles vs registered vs assigned callbacks, throwing
callbacks contained, and the runStarted/runEnded/tutorial lifecycle.

Then verified in REAL Chrome (headless, CDP) against `index3d.html` pinned to
**844x390 at DPR 3**, which is the gate frame (`--window-size` alone does not
pin it; `Emulation.setDeviceMetricsOverride` does):

- `__selftest` re-run under a real DOM: 120/120.
- All 14 API methods present; engine call pattern drives start=1, firePower=1,
  `runStarted`->hud, `runEnded` clears the chip, `showResults`->results.
- Real `RF.Meta.endRun` payload renders; 12 consecutive reused-object pushes
  paint hp/coins/power correctly and drain the chip queue.
- **Console clean, zero errors or warnings.**
- Law audit on all four screens: 0 targets under 44px, 0 text under 14px,
  no horizontal overflow.
- Results actions in view for both the maximal (3 unlocks) and minimal payload.
- No em dashes in either file (grep clean).

Screenshots captured at the gate frame for menu/shop/results/hud.

## For the orchestrator

- Entry page is `index3d.html`; `index.html` is untouched 2D and git-clean.
- The four module files 404 until the other lanes land. That is expected and
  does not affect this layer: `ui3d.js` is a classic script with no imports and
  boots independently, which is how the probe drove it.
- `RF.Meta.activeShark(profile)` (not `profile.selected`) and
  `RF.Meta.displayCoins(profile)` (not `profile.coins`) are used throughout, so
  the dev overlay behaves.
- Nothing here calls `RF.Meta.load`; the engine owns the profile and passes it
  in via `init({profile})` or `ctx.save`. `commit` is called only on a
  successful buy/select.
- The 61/61 `?unlockall=1` sweep, the memory gate, real-device retina signoff
  and the owner's iPhone verdict remain open and are not this lane's to close.
