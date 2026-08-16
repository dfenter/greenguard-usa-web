# Siegebreak
LOOP: hold the rampart for 10 seeded nights - ladder rushes, grapple ropes, a ram at the gate, siege towers, shielded elites. Between nights spend valor on repairs/upgrades. Gate destroyed or all 3 wall segments breached = loss (nights survived = score, best saved locally).
TOUCH: tap the wall to leap there and strike (overhead); swipe DOWN while tapping = kick (knocks ladders off, breaks elite shields); swipe LEFT/RIGHT = sweep. Tap a SPEAR/ARCHER/OIL chip then tap a wall to rally that squad there. Mash the gate when the ram arrives to pour oil. RALLY button fires the banner burst at 100%.
KEYS: arrows/A-D move, SPACE overhead, UP/W sweep, DOWN/S kick, 1/2/3 pick a squad then Q/E/R send it to wall 1/2/3, ENTER banner burst / continue, R restart on the end screen.
BUILD: no build step - open index.html (Phaser 3 from /play/_shared/ plus GGKit, portrait 390x700, procedural M4A cues, no network).

## AAA rebuild

### implemented

- Rebuilt the archived canvas prototype as a Phaser 3 portrait scene using `/play/_shared/phaser.min.js` and GGKit for lifecycle, fixed-step input, per-pointer identity, save data, audio, settings, reduced motion, PWA registration, shake, and hit-stop.
- Added precise wall-leap targeting with a landing reticle, flight path, wind-up, distinct overhead, kick, and sweep impact windows, authored defender and attacker sprite sheets, elite shield telegraph with kick-to-break, ladder and rope impacts, pooled sparks, splinters, debris, command trails, oil FX, and reward floaters.
- Added three squad chips with selected-chip and route states, wall assignment, visible movement, spear, archer, and oil behavior, gate mash oil defense, generous valor, mid-night supply drops, reinforcement units, banner rally burst, fixed pools, and a stepped simulation that never advances clocks outside stepped time.
- Added Siege Run, Night Trials with a medal-gated unlock chain, between-night valor upgrades, per-night bronze/silver/gold medals for survival, no breach, and valor efficiency, plus the post-night-10 Vault Assault finale.
- Added procedural authored rampart board art, PWA manifest, procedural icons, M4A audio cues routed through GGKit, full service-worker precache, and the live `window.__sb.state` probe with `forceNight` and `forceThreat` switches.

### night table

| Night | Authored pacing and threat mix |
|---|---|
| 1 | Ladder primer, then grapple rope on the center wall |
| 2 | Alternating ladders and ropes across all three segments |
| 3 | First ram, staggered rope pressure, cross-wall ladders |
| 4 | Shielded elites establish the kick counter, then ram |
| 5 | Elite and rope pressure around a second gate hit |
| 6 | Siege tower arrival, ram, elite unload, rope follow-up |
| 7 | Fast ropes, tower, two elite lanes, oil squad test |
| 8 | Twin rams, tower flank, elite chain, staggered rope lanes |
| 9 | Two towers, two rams, elite crossfire and rope pressure |
| 10 | Dense final approach of towers, rams, elites, and ropes |

### rampart table

| Rampart | Identity and landmark | Discoverable defense |
|---|---|---|
| Outer Gatehouse | Nights 1-2, Banner Tower | Ironbound Gate: gate integrity and oil reserve |
| Twin-Tower Flank | Nights 3-5, Siege Engine Wreck | Cross-Fire Walk: archer damage |
| Collapsing Curtain | Nights 6-9, Fallen Banner Tower | Braced Curtain: larger wall repairs |
| The Vault Approach | Night 10 and finale, Vault Lantern | Warden Sigil: clean elite shield breaks |

### deferred

- In-app browser visual smoke test and 4x-throttle frame-time capture could not run because this session had no connected browser surface. `node --check` and real-parser checks passed for every changed JavaScript file; manifest parsing, M4A codec checks, service-worker precache existence, payload, and forbidden-reference checks also passed.

## Fix round 1

### Fixed

- Major 1: draw wall and gate integrity fills after their backing bars so the values remain visible.
- Major 2: expose oil current/max, squad combat cooldowns, rally cooldowns, moving state, and readiness in the rail.
- Major 3: add a first-run five-step tutorial covering overheads, ladder kicks, squad rally, gate oil, and banner rally.
- Major 4: add 1.05 second wave previews with route markers, countdown labels, and two-pulse threat decals.
- Major 5: make Rope Line winnable by matching its target to the three Night 2 grapple events.
- Major 6: make Shield Law winnable by matching its target to the two Night 4 elites.
- Major 7: First Rung now counts only non-rope ladders still attached to an enemy in climb state.
- Major 8: isolate breach and valor-spend medal counters per night.
- Major 9: replace first-match squad targeting with threat, imminence, role, and distance scoring.
- Major 10: add a visible 1.6 second rally cooldown and reject orders during that commitment window.
- Major 11: give spear, archer, and oil squads distinct world and rail glyph silhouettes.
- Major 12: add persisted levelled rampart fortification, a selectable intermission fortify action, costs, and visible structural changes.
- Major 13: add 15 GGKit audio registrations backed by distinct M4A assets, including music, danger, and victory layers.
- Major 14: replace the generic particle pool with bounded named spark, debris, oil, and command pools with distinct render behavior.
- Major 15: add dead-zone gamepad polling and mappings for movement, attacks, squad selection, routes, rally, advance, and restart, with a controller HUD prompt.
- Major 16: validate save schema, medal ranges, booleans, progression bounds, fortification levels, and tutorial state.
- Major 17: add an active objective strip with trial progress or current wall and gate values.
- Minor idle and ambience: add restrained hero and enemy bob, smoke, fire, and dynamic battlefield ambience.
- Minor Enter conflict: reserve Enter for one global advance or active banner rally path.
- Minor settings access: make the gear hit-test run before menu, trial, intermission, and end-state branches.
- Minor event shadowing: rename the wave schedule field to `waveEvents`.

### Rejected

- None. All listed findings were actionable and fixed.

### Verification

- `node --check` passed for every changed JavaScript file.
- Payload is 165127 bytes, every file is below 400 KB, all 15 registered audio assets are M4A, and all 21 service-worker precache paths exist.
- Static forbidden-reference and no-em-dash checks passed. No deploy or commit performed.

## UI declutter

- Cut live center banners, reward floaters, always-on title/rampart/threat/objective/hint copy, and word-heavy squad/status labels; kept boundary cards, world health bars, wave decals, valor, and trial progress meters.
- Shrunk active events into one queued edge chip at 14px with a 1.0s hold and fast fade; collapsed the tutorial to one 24px top strip that fades after about 3s.
- Replaced squad words with glyphs, unit/oil meters, route/cooldown state icons, and a banner-charge meter; boundary banners remain only for run, level, clear, and end states.
- Validation: `node --check` passed for `game.js` and `sw.js`; the in-app browser screenshot smoke test was unavailable in this session.

## Live repair 2026-08-16

Found live-broken on the public site by the fleet interaction probe
(`live_probe.mjs`). Unlike the other two titles repaired the same day this one
did run (rAF advanced, the frame changed), but it threw on the first press of
the menu's play button, and the throw was corrupting live game state.

### Defect

```
TypeError: Cannot read properties of undefined (reading 'name')
    at startRun    (game.js:453)
    at handlePress (game.js:399)
```

`RAMPARTS[this.state.rampart]` was `undefined`, so `.name` threw.

### Root cause

State aliasing in the test probe mirror. `refreshProbe()` opened with

```js
probe.state = this.state;                       // ALIAS, not a copy
...
probe.state.rampart = RAMPARTS[this.state.rampart] ? RAMPARTS[...].name : 'UNKNOWN';
```

Because `probe.state` and `this.state` were the same object, writing the rampart
**display name** onto `probe.state.rampart` overwrote the live **numeric rampart
index** that `startNight()` had just set. `state.rampart` therefore went
`0` -> `'OUTER GATEHOUSE'` on the very first `refreshProbe()`, and on the next
frame `RAMPARTS['OUTER GATEHOUSE']` was `undefined` so it degraded to
`'UNKNOWN'` and stayed there.

Every later `RAMPARTS[this.state.rampart]` lookup was then undefined. `startRun`
(line 453) was simply the first one that dereferenced it without a guard; the
same corrupted index also feeds `startNight`, `fortifyRampart` and the intermission
FORTIFY button label, so battlefield texture selection and fortification were
reading a broken index for the whole session. `create()` also seeded the alias
directly with `probe.state = this.state`.

### Fix

`probe.state` is now a persistent **mirror** object rather than an alias:
`Object.assign(this.probeMirror, this.state, { valor, rampartIndex, rampart })`.
The probe keeps its full previous read surface, gains `rampartIndex` alongside
the human-readable `rampart` name, and can no longer write back into simulation
state. The `probe.state = this.state` line in `create()` was replaced with a
`this.refreshProbe()` call so the alias is never published at all.

### Verification

- `node --check play/siegebreak/game.js` passed.
- `boot_sweep.mjs`: 0 console errors, 0 uncaught, 0 failed requests.
- `live_probe.mjs`: PASS, raf=1052 and still advancing after input, 5/5 distinct frames.
- Zero uncaught errors across a full driven night, where the old build threw on
  the first play-button press.
- Core mechanic resolves under real pointer input: menu -> play, night 1 running,
  wave clock advancing to 20.7s, threat progressing `idle` -> `GRAPPLE ROPE`,
  squads ordered from the rail, hero commands and oil pours accepted, valor earned
  (0 -> 46), gate reinforced to 340, walls held at 100/100/100.
- `state.rampart` stays the numeric index 0 and the mirror reports
  `rampart: "OUTER GATEHOUSE"`, `rampartIndex: 0` for the whole run.
- Gameplay frame is lit and drawing: 1280 distinct colours at 5-bit quantisation
  (7174 at full 8-bit), 100% non-black, most common colour 17.7% of the frame.

## Retina completion

- **Measured, not expected.** Release gate at deviceScaleFactor 3, run serially at concurrency 1 from `ue-port-studio/aaa/harness` against a private local server: `node release_gate.mjs http://localhost:8791 1 siegebreak`.
- Gate verdict: **READY**. Measured `canvas.width / getBoundingClientRect().width` = **3.00x** (gate floor 2.85), sampled late by the gate, well after the point where a RESIZE parent poll would have reverted it. Backing store 1170x2100 in a 390x700 CSS box.
- Real gameplay frame: **3720 distinct colours** (8-bit), flattest colour 18.5% of the frame. The frame was compared side by side against the same interaction at deviceScaleFactor 1: layout, spacing and art are pixel-proportional, only the sampling is denser.
- **Renderer changed first.** Was `type: Phaser.CANVAS`; now `Phaser.AUTO`, for the same reason as hearth-halls: native density multiplies the fill by up to nine and Canvas2D fill is CPU work.
- Recipe: `Scale.FIT` with a fixed 390x700 design box, so `hiDpi.phaser()` was NOT used. `scale.width/height` are raised by `GGKit.hiDpi.factor(390, 700)` and `create()` does `setZoom(f)` AND `centerOn(W/2, H/2)`. Every constant in the file stays in design units.
- **The baked canvases were raised too**, which is the difference between passing the density check and actually looking sharper. `sb-shell` (full-screen chrome) and `sb-battle` (the rampart backdrop) are now baked at RETINA with a pre-scaled 2D context and given an explicit `setDisplaySize()`; the battle texture resets its transform on every refresh so repeated redraws cannot compound the scale. The defender and attacker sprite sheets are baked at RETINA frame size and every sprite that uses them is scaled by 1/RETINA, so the hero's 1.04 leap pop and the per-kind enemy scales are preserved exactly.
- `source.resolution` was deliberately not used to compensate: it only affects the CANVAS renderer, and under WebGL it makes the quad RETINA times too large.
- Pointer coordinates are divided by RETINA in `pointerdown`/`pointerup` before the button rect tests, since Phaser reports them in game space (device pixels).
- All HUD, banner and overlay text carries `resolution: RETINA`.
