# Frosthold

Controls: select SPIRE, LENS, or GATE, tap a pad, then BUILD. Drag badges to HUNT/CHOP/MEND/GUARD. Keys 1/2/3 select towers, Space builds, U upgrades, F changes target policy, B changes upgrade branch, H/C/M/G assign, P pauses, and R restarts. Gamepad A builds, B changes policy, X upgrades, Y pauses, and D-pad left/right selects towers.
Loop: place and upgrade frost towers during calm, spend cold on attacks, freeze enemies before they touch the core, and use survivor roles to shape wood, cold, repair, and shield income.

## AAA rebuild

Implemented:

- Rebuilt the prototype as a portrait Phaser 3 scene using `/play/_shared/phaser.min.js`; GGKit owns lifecycle pauses, per-pointer identity, guarded save data, audio buses, settings, reduced motion, and PWA registration.
- Added instant tap-slot-then-BUILD placement with visible six-slot footprints, ghost edges, costs, and no construction timers.
- Added draggable survivor badges with HUNT, CHOP, MEND, and GUARD role icons, live headcounts, role locks, defense power, survivor idle/work/guard/hurt silhouettes, and a warm scout presentation.
- Added a real-time furnace coal dial, warmth meter, coal-per-second readout, frost-risk state, whiteout snowfall, breath fog, furnace glow, pooled contact bursts, raid alarm VFX, directional threat arrows, and guard payoff.
- Added MAIN SURVIVAL, SCENARIO MODE, and ENDLESS EXPANSE. Calm windows grant generous wood, coal, and food drops. Resource caches are discoverable on every site.
- Added medal tracking for cycle survival, no-loss, and coal efficiency with a persisted scenario unlock chain.
- Added `window.__fh = { state, forceCycle, forceScenario }` before Phaser boot and kept the same switches live after scene creation.
- Added `manifest.json`, `icon.png`, `icon512.png`, `favicon.png`, `sw.js`, procedural MP3 cues, and `LICENSES.md` with the `/play/_assets/LEDGER.md` citation.

Cycle table:

| Run | Calm | Whiteout | Completion |
|---|---:|---:|---|
| Main Survival | 16s | 13s | Hold cycle 10 with at least one survivor |
| Scenario Mode | 16s | 13s | First Ember 6, Thin Coal 7, Wreck Run 8, Last Expanse 10 |
| Endless Expanse | 16s | 13s | Continues past cycle 10 until the camp falls |

Site table:

| Site | Terrain and hazard mix | Landmark | Cache |
|---|---|---|---|
| Sheltered Valley | layered snow pines, low wind, no hazard bonus | Old Watchtower | valley cache beside the lower ridge |
| Exposed Ridge | crosswind bands, +9 probe hazard, early east approach | Signal Watchtower | ridge cache on the west shelf |
| Frozen Lakebed | cracked blue ice, +12 probe hazard, southeast route | Frozen Wreck | wreck cache on the north ice |
| Endless Finale Expanse | open star ice, +18 probe hazard, southwest route | Halo Relay | relay cache on the lower shelf |

Deferred:

- Live browser boot and screenshot probe could not run in this environment because the browser connector was unavailable and the sandbox rejected a local HTTP listener. Node syntax checks, manifest parsing, boot-fallback probe, payload sizing, and service-worker file existence checks passed.
- Harvested CC0 audio files were not present under `/play/_assets/`; the shipped wind, furnace, build, horn, and medal MP3 cues are short procedural originals routed through GGKit.

## Fix round 1

Fixed:

- CRITICAL: replaced the settlement-only loop with frost tower placement pads, range ghosts, facing markers, target policies, cooldowns, cold costs, level upgrades, and glacier/shard upgrade branches.
- CRITICAL: added pooled crawler, brute, wraith, and elite enemies with route movement, spawn plans, HP, attacks, kills, projectiles, wave clear, escalation, and endless pacing.
- CRITICAL: added explicit enemy freeze status with duration, resistance, stack cap, slowed movement, frozen visuals, and cold reserve economy.
- CRITICAL: rebuilt the battlefield with layered snow routes, snow banks, pines, settlement core, and four authored landmark silhouettes for every site pattern.
- CRITICAL: added four persistent pooled particle systems named freeze, tower, wave, and defense with distinct event ownership and motion.
- CRITICAL: added scout idle, command, and resolve states, enemy anticipation/contact/recovery states, and active/damaged/destroyed tower states.
- MAJOR: routed keyboard and gamepad actions through `kit.input`, including tower selection, build, upgrade, targeting, branches, roles, pause, and restart.
- MAJOR: keyed every drag by pointer ID and only resolved the matching pointer-up or cancel.
- MAJOR: tutorial steps now advance on tower selection, role assignment, placement, first wave, freeze, and wave clear actions.
- MAJOR: opening resources start with no tower, so placement and cold timing are required before the first wave.
- MAJOR: roles now feed cold and food, wood, core repair, and incoming damage reduction that directly affect the defense loop.
- MAJOR: calm and wave economy now use wood/cold placement and upgrade costs, wave-clear income, tower cooldowns, and cold spending.
- MAJOR: wave tables add new enemy families, faster spacing, resistances, elites, and higher pressure across cycles.
- MAJOR: endless is gated by the saved main-run unlock and best endless score is persisted on loss or win.
- MAJOR: registered eight-plus GGKit audio cue names plus calm, battle, danger, and victory layers, with attack, hit, freeze, kill, wave-clear, build, upgrade, and loss routing.
- MAJOR: added GGKit shake and hit-stop at placement, elite kills, core contact, wave clear, and upgrades.
- MAJOR: every tower has a distinct silhouette, facing marker, range read, cooldown state, HP state, and target policy.
- MAJOR: added a visible PAUSE/RESUME control and active-mode restart through GGKit.
- MINOR: save validation now requires version 1, boolean endless unlock, bounded score, and a strict medal schema.
- MINOR: menu transitions clear the active run and make the debug probe report the current screen.
- MINOR: invalid numeric scenario forcing falls back safely instead of dereferencing an invalid scenario.
- MINOR: build pads and the cache marker are separated, and all resource rewards are clamped.
- MINOR: pause target is 51px high, command typography is 10px or larger, and footer controls are explicit.
- MINOR: menu and result transitions stop the active music and use distinct victory or loss layers.

Rejected:

- None. The reviewer findings were code-derived and all listed critical, major, and cheap minor findings were addressed.

## UI declutter

- Cut the always-on brand/mode, threat, footer, tower flavor, role labels/copy, and center-screen in-play action banners.
- Shrunk active HUD to wave/phase, icon-backed resource meters, core meter, pause, readable action labels, and role/tower icon states.
- Moved action, cache, damage, assignment, and error feedback to one queued corner chip with a 1.0s hold; kept center banners only for run start, wave start, and wave clear.
- Reduced tutorial guidance to one top-edge line that fades after roughly 3 seconds; survivor badges now use single-letter identifiers and role cards use icons/count meters.
- Validation: `node --check game.js` and `node --check sw.js` pass; the browser screenshot probe was unavailable because no browser backend is connected.
