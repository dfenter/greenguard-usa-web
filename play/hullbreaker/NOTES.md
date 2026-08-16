Controls: drag anywhere on the left half to steer and thrust; hold the
right half to fire; tap DASH for a burst with brief invulnerability.
Keyboard: WASD or arrows, Space to fire, Shift to dash, 1-4 or Q/E for
weapons, Esc to pause.
Loop: clear eight seeded waves to take a sector, picking one upgrade
between waves. Wave 4 is an authored set piece, wave 8 is a hive boss.
Collect ore: clear time and ore decide the sector medal, and clearing a
sector unlocks the next one and a new weapon.
Shield cells end a run when they hit zero; the last cell is telegraphed.
Progress, best score and medals are saved locally on this device.

## AAA rebuild

Rebuilt in place 2026-08-10 against the fleet1 brief. Phaser 3.87 from
/play/_shared/, GGKit as the sole lifecycle, input, save and audio layer,
landscape only, PWA shell with a full precache. Files: `hb_data.js`
(content tables), `game.js` (kit wiring, verification hook, tap layer,
boot scene), `hb_menu.js` (title, sector select, button layer),
`hb_play.js` (simulation), `hb_hud.js` (VFX, HUD, overlays, boot).

### Implemented

**Mechanics.** Inertial thrust with a readable drift model: the ship keeps
momentum, a prograde arrow shows the drift vector, and pushing the stick
against travel brakes along the velocity vector (not the nose) while
lighting retro jets, so counter-thrust is a distinct readable act rather
than a spin. Fracture chain is large to medium to small with per-class
danger: a large rock costs 2 shield cells and throws the hull 340 px/s, a
medium costs 1 at 210, a shard costs 1 at 120 but runs much faster. Ice
fragments three ways and brittle; wreck rock is tough and slow and pays
more ore. Dash has charges (2 base, more from upgrades and drops), a
0.28 s i-frame window, a cooldown ring on the hull plus a charge ring and
pips on the button. Four weapons (pulse, five-pellet scatter, piercing
beam, seeking pods) share one heat gauge drawn as an arc on the fire
button with a percentage readout; overheating forces a 1.5 s vent, and an
overcharge pickup zeroes heat and adds fire rate for 6 s. The final hit is
telegraphed: dropping to one cell triggers a HULL CRITICAL banner, a
klaxon, a pulsing red rim, a red hull tint and an extended 2.2 s grace
window, so a run never ends on an unread hit.

**Loop.** Five sectors, eight seeded waves each, escalating density and
rock speed. Wave 4 is an authored set piece and wave 8 is a multi-phase
asteroid-hive boss. Between waves the run pauses on a banner beat and then
a three-card upgrade rack (15 upgrades, seeded offers). Medals per sector
from clear time plus ore, an unlock chain (clearing a sector opens the
next and its weapon), best score and best medal saved per sector, and an
interactive six-step first-run tutorial covering thrust, drift, fire,
dash, ore and the upgrade pick. Drops are deliberately generous: every
rock drops ore, and large rocks roll a 34% ore cache, 14% shield cell,
13% overcharge, 13% dash charge and 7% weapon on top; pods, hulks, mines
and the boss all geyser caches.

**Field design.** Five families with their own art, split behaviour, drift
feel and hazard mix.

| # | Sector | Family | Hazards | Set piece (wave 4) | Boss (wave 8) |
|---|---|---|---|---|---|
| 1 | KESSLER BELT | belt: dense, even split | mines w3+, hulks w5+ | KESSLER CASCADE, a wall of six large rocks crossing the belt | BROODROCK ALPHA, 340 hp, 3 arms |
| 2 | HALCYON ICE | ice: brittle, 3-way split, fast shards, slick drift | wells w2+, mines w4+ | COMET RUN, three fast comets on crossing lines | GLACIER HIVE, 430 hp, 3 arms, 4 pods |
| 3 | OSSUARY DRIFT | wreck: tough, slow, ore rich | mines w1+, hulks w2+, drones w3+ | HULK CONVOY, three derelicts with mine escorts | OSSUARY QUEEN, 520 hp, 4 arms |
| 4 | PRISM HOLLOW | crystal: rich ore, faceted | wells w1+, mines w5+ | PRISM BLOOM, a geode pulsing shard rings, cut four nodes | PRISM MATRIARCH, 600 hp, 4 arms, 5 pods |
| 5 | BREAKER'S MAW | maw: molten, fast, every hazard | mines, wells, hulks, drones | THE GRINDER, twin singularities, survive 34 s | THE BREAKER, 760 hp, 4 arms, 6 pods |

Wave curve per sector: rocks = density + step x (wave - 1), speed = base +
step x (wave - 1); set-piece waves scale field rock to 60% and boss waves
to 45%. Boss phases: 1 armoured (core immune, strip the arm pods, hive
spits rock), 2 exposed (telegraphed shotgun volleys, faster sweeps),
3 collapse under 35% hp (arms detach and orbit, telegraphed core ram, ore
geysers).

**Presentation.** Authored ship silhouette with four thrust-trail states
(idle pilot flame, cruise plume, gold dash flare with a shock ring, retro
nose jets), six pooled particle systems, family-tinted fracture VFX with
shard scatter and dust, ore sparkle trails on magnetised pickups,
60%-width banner beats that slide in with Back.easeOut overshoot on wave
clear, set piece, boss phase, hull critical and sector clear, and GGKit
audio buses driving 20 effects plus a field and a boss music loop with a
retriggered engine hum tied to throttle. Reduced motion (system preference
or the settings row) disables shake, cuts particle counts to a third,
freezes parallax and swaps banner overshoot for a fade.

**Assets.** All original and generated from code: two sprite atlases, a
tiling starfield and nebula, wordmark, icons, and every sound synthesised
to mono MP3. Nothing is taken from `/play/_assets/`, nothing is hotlinked
from another title, and no OGG is produced. See `LICENSES.md`.

**Verification hook.** `window.__hb.state` is one object mutated in place,
published before Phaser exists and never replaced, carrying mode, sector,
sectorId, sectorName, family, wave, waveKind, waveName, score, ore,
shield/shieldMax, weapon and weapons, heat and vent, overcharge,
dash charges, rock and hazard counts, a freshly built `livePickups` view,
boss phase and hp, run time, medal, unlocked and medals, tutorial step and
reduced-motion state. Switches: `forceSector`, `forceWave`,
`forceUnlockAll`, `forceGenerousDrops`, `forceWeapon`, `forceSkipTutorial`,
`forceClearWave`, `forceInvincible`; all readable and writable live, and
all also accepted as query parameters (`?sector=5&wave=8&unlock=1&notut=1`)
which the boot fallback folds into the same object and the title scene
honours by dropping straight into the run. `window.__hb.scene()` returns
the live scene and `window.__hb.debug()` returns a one-line summary.

### Bug classes explicitly handled

Debug views are rebuilt as fresh arrays and never alias a pool; every
entity owns its own sprite so no render state is shared through a
renderer; the pointer layer seeds `kit.input.pointers` at claim time and
latches press and release so a tap that opens and closes inside one frame
is still seen; no camera split is used; scene literals are promoted to
real `Phaser.Scene` subclasses so their methods survive; test switches are
honoured from the boot fallback and re-polled live. From the appended
list: the accumulator drops its residual once `MAX_STEPS` is hit and the
cosmetic clock is `steps * STEP`, so a degraded device runs slow rather
than skipping time; every keyed lookup (family, rock size, weapon, pickup,
upgrade, sector, atlas frame) goes through a guarded getter that returns a
real record; the coach strip is a thin fading band under the top HUD that
never enters the play centre or the bottom half; `sw.js` precaches only
files verified to exist on disk.

### Verified

`node --check` passes on all five scripts plus `sw.js`. Driven in headless
Chrome at 844x390 landscape with touch emulation: boot, title, sector
select, deploy, all five set pieces, the sector 5 boss through phases 1 to
3 and its kill, the upgrade rack (tap and keys), sector clear with medal
and unlock, hull breach, the six tutorial steps, reduced-motion toggle,
and wrap ghosting. No console or page errors in any run. Payload 1.36 MB
total, largest file `assets/atlas.png` at 336 KB.

Frame time at 4x CPU throttle, 600 frames: median 16.7 ms in every run
(budget 17.5), p75 16.7, p90 16.8 to 33.3. Scene cost measured inside the
page is 0.5 to 0.7 ms of step and 0.7 to 0.8 ms of paint per frame at 4x.
Optimisation passes that got it there: the backdrop is two full-screen
quads with the base colour on the camera; the HUD and control plates are
signature-gated so only two arcs and the stick redraw per frame; HUD ring
arcs are hand-tessellated (Phaser's `Graphics.arc` walks 0.01 rad steps,
which alone cost 2.4 ms a frame); `setColor` is change-guarded like
`setText`; the pickup pop uses a pooled record instead of allocating a
tween per piece of ore; sprites come from two atlases instead of 45
separate textures.

**Not certified: the "6 or fewer frames over 33 ms per 600" line.** The
box was contended for the whole session (1-minute load average between 4
and 44, other fleet lanes running). Best readings were 8/600 on the sector
5 boss and 10/600 on a sector 1 field wave; typical readings under load
were 15 to 30. Run side by side in the same windows, the shipped reference
flagship `skyfall-command` measured anywhere from 0/600 to 92/600 on the
same machine, and in the final quiet window it measured 76/600 while
hullbreaker measured 21 and 15. The metric is dominated by host
contention here; it needs a re-measure on an uncontended box before it can
be signed off either way.

### Deferred

- Frame-time re-measure on an uncontended box (above) is the one open gate.
- Medal thresholds were tuned by hand against harness runs, not against
  human playtests, so gold on sectors 4 and 5 may be soft.
- The sector select map is a linear chain; there is no branching route or
  per-sector modifier draft.
- No leaderboard or run history beyond best score and best medal per
  sector.

## Fix round 1

- Fixed CRITICAL: save validation and reduced-motion preference now use
  GGKit's save object; direct localStorage and raw pointer listeners are gone.
  Tap state is derived only from `kit.input`, and gamepad polling is exposed
  through that input surface.
- Fixed MAJOR: overlay buttons are destroyed on clear, hit-stop now freezes
  simulation and overlay clocks, wrapped-distance math covers targeting,
  wells, hazards, pickups, rocks, and shots, and pooled shots, rocks, and
  pickups have reserved capacity, eviction or stacking, and telemetry.
- Fixed MAJOR: geode node sprites are cleaned on every restart, phase-3 arms
  orbit independently with pod contact damage, the tutorial and upgrade rack
  wrap or page at narrow sizes, and the danger music layer crossfades through
  GGKit audio.
- Fixed MAJOR: kill presentation is centralized across rock and hazard
  classes with score pops, burst FX, scaled shake, and hit-stop; hulks now
  fracture into salvage debris.
- Fixed MINOR: save records are deeply validated, reduced-motion Off restores
  the prior juice setting, and hulk destruction now has secondary debris.
- Rejected as non-code validation gates: the uncontended <=6 frames over 33 ms
  capture still needs a quiet browser run, and medal thresholds still need
  human playtesting. Existing 4x-throttle median remains recorded at 16.7 ms.
- Verification: `node --check` passes for `game.js`, `hb_data.js`,
  `hb_menu.js`, `hb_play.js`, `hb_hud.js`, and `sw.js`; the new MP3 is
  precached and the service-worker version is `2026-08-10-aaa-fix1`.

## UI declutter

- Cut active-play center banners and world-space score pops; kept the center
  banner for sector-clear/medal presentation only.
- Shrunk wave, shield, score, ore, and timer HUD into compact icon/number
  clusters; heat stays in the fire meter and objectives use tiny state readouts.
- Moved weapon selection to 44px-safe top-edge tiles and removed the live
  weapon/heat text rows from the thumb zone.
- Replaced pickup, critical, wave, boss-phase, and upgrade callouts with one
  queued corner toast capped at 1.0s; condensed the tutorial to one fading
  top strip line.

## Round 2 polish

### Visual, animation and FX

- Added a pooled inertial drift ribbon that follows the ship's actual velocity,
  separate from the nozzle plume, plus a readable damage silhouette: animated
  hull cracks and a pulsing hot core at one shield cell.
- Fracture impulses now inherit parent momentum and distribute a symmetric
  mass-aware kick, so large rocks break into chunks that feel physically
  connected instead of spawning as unrelated pebbles.
- Added authored ice-field and magnetic-storm visuals with pooled sparkle,
  ring and arc FX; storms rotate the field and ice fields visibly change the
  ship's drift. Pirate wings have idle, strafe and firing states with lead-shot
  muzzle feedback. Hulks now animate three orbiting armor weak points that
  flash, break and expose the core.
- Heavy additions remain pooled and count-gated through the existing FX layer;
  reduced motion cuts particle counts, disables parallax and keeps the simpler
  motion language. Existing ship plume, dash flare, retro jets, shield ripple,
  fracture burst, boss telegraph, boundary banner and layered field/boss audio
  remain in the GGKit path.

### Gameplay depth

- Added three real hazard families to the authored sector graph: ice fields
  that reduce steering authority and preserve drift, magnetic storms that
  apply lateral force and heat pressure, and pirate wings that strafe, pursue
  lead targets and fire hostile projectiles. Their interactions are seeded
  with each field and use the existing pooled shot budget.
- Hulks are now armored encounters with three destructible weak points. Shots
  against the plates are rewarded; the hulk takes reduced core damage until
  all plates are gone, then enters an exposed animated state with a reward
  beat. Boss hive pods remain the multi-phase weak-point gate.
- Added a persistent salvage/refit economy. Completed runs bank salvage, the
  sector screen exposes four touch-safe refit purchases (HULL, COIL, DRIVE,
  MAGNET), and purchased levels modify the starting ship build. Existing
  between-wave tactical upgrade cards stay free and unchanged.
- Added the Daily Survival Ladder. It uses a deterministic UTC daily seed,
  cycles through the five sector identities, repeats set-piece and boss beats
  on an eight-stage cadence, escalates rock mass/speed/hazard pressure, and
  opens the existing tactical draft after every cleared stage. Best ladder
  stage is persisted.

### Save and ship notes

- Save version bumped from v4 to v5. Valid v4 profiles migrate in place with
  their existing unlocks, scores, medals, tutorial and settings preserved;
  new profiles and migrated profiles receive `salvage: 80`, zeroed `refits`,
  and `ladderBest: 0`. v5 validates all new fields, and any malformed or
  failed validation still degrades to a fresh profile through GGKit.
- `sw.js` version is `2026-08-16-round2-polish1`; its 41 title-specific
  precache paths were checked against the files on disk. Payload is 1.38 MB
  including assets, with no file over 400 KB and no new external asset.
- `node --check` passes for `game.js`, `hb_data.js`, `hb_menu.js`,
  `hb_play.js`, `hb_hud.js`, and `sw.js`; data and method-load smoke checks
  pass. Rendering boot proof was deferred because the connected in-app
  browser was unavailable and the sandbox's local Chromium failed before
  creating a page; no deploy or commit was performed.

## Retina pass 2026-08-16

- Target 390x844 CSS at DPR 3. Before ratio: 1.00x CSS-sized RESIZE baseline. After target: 3.00x, 1170/390, via `GGKit.hiDpi.resize`. Live canvas read was unavailable because no browser surface or private local listener was available.
- Recipe: `Phaser.Scale.RESIZE`, `GGKit.renderDefaults`, and DPR-matched Phaser text. No factor cap; atlas art remains source-backed and uses existing display sizes.
- Gameplay screenshot and runtime backing-store measurement remain deferred. No palette change was made because the retina law identifies density, not colour depth, as the defect.
