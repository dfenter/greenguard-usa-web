Tap kits to build, tap structures to upgrade, drag to move; B/L/D switch base, ladder, log.
Tap an open ladder rival, then tap the raid rim to deploy; 1–5 select troops, arrows move, Space deploys.
Everything builds instantly from earned ✦ gold and ◆ mist; clear all 12 rivals to earn the ladder crown.
Raid outcomes, base layout, loot, trophies, and the between-session defense log persist on this device.

## AAA rebuild

Implemented:

- Rebuilt the prototype around Phaser 3 from `/play/_shared/` with GGKit as the lifecycle, input, save, pause, audio, orientation, settings, and PWA layer.
- Added instant build, upgrade, and validated drag placement with cyan/coral footprint ghosts, four pooled particle systems, authored procedural structure and troop states, damage numbers, collapse VFX, and generated MP3 cues.
- Added the 12-rival Ladder, three hand-authored Scenarios with medal unlocks, Endless Siege with escalating strength, generous cache and raid rewards, persistent loot/trophies/layouts/troops/logs, crown progression, and the `window.__bw` probe hook.
- Reworked live UI to one transient at a time, a thin coach strip, compact resource chips, bottom thumb-zone command cards, boundary-only center banners, reduced-motion gating, safe-area CSS, manifest/icons, and a versioned service worker.

Mode table:

| Mode | Entry | Core read |
| --- | --- | --- |
| Base | B | Build kits, upgrade taps, drag-to-move, cache hunt |
| Ladder | L | 12 chained rivals, raid rim deployment, crown |
| Log | D | Persisted defense outcomes and losses |
| Scenario | Ladder → S | Thin resources, hardened rival, small camp, medals |
| Endless | Ladder → E | Wave strength and loot rise after every clear |

Site table:

| Site | Terrain identity | Landmark | Cache |
| --- | --- | --- | --- |
| Starter Bastion | Sunbaked brick | Watchtower | Northeast cache |
| Fortified Ridge Camp | Wind-cut ridge | Sunken gate | Southwest cache |
| Sprawling Log-Yard | Cedar workyard | Log crane | Southeast cache |
| Endless Siege Expanse | Ashland shelf | Ashen beacon | Northwest cache |

Deferred:

- Real browser boot, touch smoke, screenshot sampling, and 4x-throttle frame capture could not run because no browser surface or local HTTP listener was available in this environment. Node syntax, manifest, asset, service-worker, size, and forbidden-reference checks passed.

## Fix round 1

Fixed:

- CRITICAL core defense loop: raids now clone the persisted player bastion, spawn escalating enemy waves, path attackers through occupied cells, damage home structures, and resolve on enemy-core victory or home-core loss.
- CRITICAL bastion abilities: every structure has an ability registry, cooldown, effect, touch button, keyboard activation, gamepad activation, cooldown feedback, and combat telegraph.
- CRITICAL art gate: added layered authored structure silhouettes, material details, terrain tilework, landmark silhouettes, readable levels, collapse states, attack ranges, and defeat marks.
- CRITICAL audio gate: added distinct command, combat, ability, wave, defeat, danger, and victory cues plus GGKit music-layer crossfades using MP3 assets only.
- MAJOR economy and progression: mine and vat production feed the resource loop, build and upgrade actions use construction cooldowns, and base time recruits missing troops with recovery costs.
- MAJOR scenario inventory: scenario stock is transient and is no longer written to the persistent troop inventory during deployment, ability use, or raid completion.
- MAJOR AI and telegraphs: enemy waves use grid pathing, enemy and home defenses queue delayed telegraphed shots, and threat rings plus range readouts are rendered in combat.
- MAJOR destruction and upgrade states: collapse state is read by rendering, destroyed units receive a dedicated defeat state, and upgrade pulses are per-structure rather than tied to startup time.
- MAJOR save safety: logs are field-validated, layouts enforce footprints, bounds, overlap rules, counts, and required core/storehouse structures, and scenario plans with overlaps were corrected.
- MAJOR raid abandonment: combat tabs and navigation keys no longer discard an active raid.
- MAJOR timing and accessibility: the scene uses an accumulator fixed-step loop, hit-stop no longer pauses simulation steps, and reduced motion gates particles, bobbing, flashes, shake, hit-stop, and animated collapse.
- MAJOR first-minute guidance and controls: guided build, upgrade, ability, deployment, wave, and defense prompts were added; keyboard placement, upgrade, move mode, and ability controls now work; pointer sessions are stored per pointer; gamepad polling is supported.
- MAJOR settings and loading: a touch-visible gear opens GGKit settings with persistent music and SFX sliders plus fullscreen, and audio preload now completes before the loader hides.
- MAJOR mobile combat readability: both core health states, selected-unit ranges, home defense ranges, shot lines, red threat telegraphs, ability state, wave state, and defeat states are visible at the 390px layout.
- MINOR screen shake, result copy, reset site, and game shell: camera shake offsets are applied, result actions route by mode, reset returns to Starter Bastion, and Phaser mounts into `#gameShell`.
- Bumped the service-worker cache version to `aaa-20260811-02`.

Rejected:

- None. All listed findings were treated as valid code-derived issues.

Checks:

- `node --check game.js`
- `node --check sw.js`
- JSON manifest parse, mocked bootstrap and raid simulation checks, payload size, file-size, asset-path, and em-dash scans passed.
