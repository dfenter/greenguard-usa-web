# Transit Dash
Controls: swipe left/right = change track, swipe up (or tap) = vault, swipe down = slide. Keyboard: arrows/WASD, Space = vault, P/Esc = pause, R = restart, M = mute.
Loop: 3-lane endless run through a seeded daily transit route: vault rail cars, slide under barriers, dodge signal blocks, hit green ramps for the high-value rooftop coin arc.
Pickups: magnet, grind board (absorbs one hit), double fare. Stumble once and the inspector tails you for 13s; stumble again while he's there and you're caught.
Missions: 3 daily mission chains run in the background; clearing one banks tokens AND rotates the live route theme (rail yard -> rooftop line -> deep tunnel), which regenerates the track ahead.
Persistence: best distance, banked tokens, mission tiers and current route theme are stored in localStorage.

## AAA rebuild

Implemented: Phaser 3 from `/play/_shared/` with GGKit as the lifecycle, input,
save, audio and juice owner. The runner now uses fixed-step physics, buffered
lane and vertical inputs, a 0.12s lane commit window, forgiving hit regions,
near-miss flash, shielded damage, hit-stop, shake, instant restart, rail grind,
trains, barriers, gaps, crates, ramps, tokens and magnet, jetpack, shield and
boost power-ups. The UI follows UI_LAW with one corner toast, a fading coach
strip, compact icon HUD, thumb-safe controls and boundary-only center results.

Content tables: 42 authored chunks through four line identities: dawn yards,
neon underground, elevated river and harbour terminus. The tables include
animated birds, crowds, signs, ferries and trains, four music stems, 16 SFX,
20 rerolling missions, 8 token-unlocked characters, 6 token-unlocked boards,
daily seeded personal-best rows and Time Attack. Persistence is GGKit-validated
and includes scores, tokens, missions, unlocks, loadout and daily results.

Deferred: a real browser first-frame render and hook-driven browser probe could
not run because no browser target or private local server was available in this
environment. Isolated runner verification did confirm the authored content
counts plus mid-air lane buffering and buffered landing roll execution.

## Boot repair

The title was dead at boot. Four defects, all repaired and verified in headless
Chrome against a private local server (boot sweep plus a hook-driven play probe).

1. **`runtime.state` was never assigned (fatal at boot).** `Runner.syncHook()`
   reads `this.runtime.state`, but `js/main.js` attached the state object only to
   the window hook (`root.__td.state`). Every `syncHook()` threw on `undefined`,
   so `PlayScene.create` died and the page rendered nothing. Fix: `js/main.js`
   assigns `runtime.state = state` before `TD.runtime = runtime`, so the hook and
   the runtime share one object.

2. **`PlayScene.toast` never existed (fatal at boot, `TypeError: ... reading 'life'`).**
   The toast banner is a single record shared by sim and view: `Runner` creates
   `this.toast` in its constructor and ages it in `step()`, while
   `PlayScene.setToast()` and `PlayScene.syncHud()` both read and write
   `this.toast.life`. The scene field was never created, so the first `syncHud`
   of the very first frame threw and the canvas stayed black. Fix: `PlayScene.create`
   binds `this.toast = this.runner.toast` right after the runner is constructed,
   which also restores the toast fade (the scene copy would otherwise never age).

3. **Vault, roll and grind were never recorded.** `resetRunData` allocates
   `vaults`, `rolls` and `grindDistance`; the score formula multiplies
   `vaults * 65 + rolls * 65 + grindDistance * 5`; missions m05 (vault rail cars),
   m06 (roll under barriers) and m08 (grind rail) key off `vault`/`roll`/`grind`.
   Nothing in the sim ever incremented the first two or called `bumpMission` for
   any of the three, so those three missions could never progress (they would sit
   on the board forever, blocking mission rotation) and clean vaults/rolls scored
   nothing. Fix in `Runner.collide`: a safe pass on a `train` increments `vaults`
   and bumps `vault`, a safe pass on a `barrier` increments `rolls` and bumps
   `roll`, and the rail branch bumps `grind` with the accumulated grind distance.
   No tuning values were touched.

4. **Service worker would have served the broken build.** `sw.js` is cache-first
   over `/play/transit-dash/`, so any client that had already installed the
   pre-repair worker would keep the broken `game.js` forever. `VERSION` bumped
   `aaa-rebuild-1` -> `aaa-rebuild-2` to invalidate the old cache.

Verified after the repair: zero uncaught page errors, zero console errors and
zero failed requests on boot; a lit first frame (768 distinct colours, 100% of
pixels non-black, 1476 colours mid-run, 1953 on the river line). Headline
mechanic driven end to end through `window.__td`: `forceMode('run')` starts a
daily run and distance/score advance; a real pointer swipe moves the runner
between all three lanes (and the keyboard path does the same); an obstacle
collision resolves through `collide()` -> `takeHit()` (health 2 -> 1, stumble
recorded, "MISS READ 1 HEART" toast), repeated hits reach 0 health and open the
results panel; a timed roll clears a barrier as a safe pass and now increments
the roll counter. Menu, garage, missions, pause/resume/restart, RUN AGAIN,
DEPOT, Time Attack, `forceStage(2)` (river line) and `reset()` were all
exercised with no errors.
