# Backstreet Reckoning

Controls (landscape): drag anywhere on the left half for a floating 8-way stick that walks across 3 depth lanes; PUNCH and JUMP buttons bottom-right. Keyboard: WASD/arrows to move, J punch, K/Space jump, Enter restart.
Punch a downed foe to grab it, then swipe (or tap PUNCH) to throw; walk onto a pipe or crate and tap PUNCH to pick it up. Punch in mid-air for a knockdown kick, and smash bins/barrels for health.
Loop: each seeded stage is 3 procedural street blocks plus a boss alley. The camera locks while a gang wave is on screen; clear it and "GO →" opens the next stretch. Attacks are lane-honest, so line up your depth lane before swinging.
Fail/win: a KO costs one of 3 lives; beating the alley boss seeds the next, harder stage. Score and best score (localStorage key `br_best`) persist.
Tech: plain canvas + vanilla JS, no build step, no network, no external assets; WebAudio synth only.

## AAA rebuild

Implemented:

- Phaser 3 from `/play/_shared/phaser.min.js` with `GGKit` as the only lifecycle, input, save, audio, pause, PWA, and reduced-motion owner.
- Fixed-step 60 Hz simulation with a capped accumulator, lane-honest attacks, three-hit punch chain into a knockdown kick, grab windup, throw release timing, airborne knockdown kick, distinct pipe and crate swings, generous health drops, weapon caches, score bonuses, hit sparks, dust, shake, hit-stop, and pooled particle emitters.
- Procedural authored fighter and gang sprite sheets with idle, walk, punch, grab, throw, hurt, KO, and weapon frames. Static street boards, landmarks, icons, HUD chrome, and particle source textures are baked once, not replayed as large display-list Graphics.
- Street Run, Gauntlet, and Boss Rush. Boss Rush unlocks after the first clear. Stage medals use time, no-death, and max-chain thresholds. Bronze medals across stages 1 to 3 unlock the final Reckoning boss.
- `window.__br = { state, forceBlock, forceBoss, game }` is available during boot and live play. `state.block` is zero-based and `forceBlock` accepts a one-based block number or boolean. `forceBoss` jumps to the boss alley.
- Offline PWA shell with manifest, icon sizes, favicon, full existing-file precache, and local MP3 cues routed through GGKit buses.

Stage table:

| Stage | Seed | Street Run | Boss alley |
| --- | --- | --- | --- |
| 1 | `7331 + run * 101` | Alley Opener, Market Block, Rooftop Approach | Marlo Steel |
| 2 | Stage seed plus `3571` tuning | Same authored route, denser compositions and faster gangs | Crow Vance |
| 3 | Stage seed plus `7142` tuning | Same authored route, armored heavies and extra flankers | Dutch Ramone |
| 4+ | Gauntlet continuation | Route repeats with guarded stage scaling | Sable Kurtz, then The Reckoning when unlocked |

Block table:

| Block | Identity | Signature landmark | Hazard and cache |
| --- | --- | --- | --- |
| 0 | Alley Opener | Neon Laundromat | Puddle read, pipe cache behind the opener wave |
| 1 | Market Block | Night Market | Oil slick read, crate cache and stall cover |
| 2 | Rooftop Approach | Water Tower 07 | Steam vent pulses, pipe cache before the final stretch |
| 3 | Reckoning Alley | The Red Gate | Boss gate telegraph, crate cache, locked camera |

Deferred:

- Live browser boot, touch feel capture, and frame-time capture could not run because no in-app browser or local browser session was available in this environment. Node syntax checks, load smoke, manifest parse, precache existence, asset type, and payload checks passed.
- The source prototype's `br_best` localStorage value is not migrated. GGKit's guarded save is the sole persistence owner for the rebuilt title.

## Fix round 1

### Critical

- Fixed obstacle and dodge gameplay. Each block now has telegraphed hazard volumes, active steam pulses, jump protection, dodge i-frames, damage, and prop collision resolution.
- Fixed the greybox-art finding. Fighter sheets now use layered original procedural silhouettes with gradients, outlines, gear details, variant signatures, and richer street landmarks and foreground dressing.
- Fixed the missing upgrade state. Cache pickups open a three-choice upgrade panel for Impact, Lining, or Footwork. Tiers are validated and persisted through the GGKit save schema.

### Major

- Fixed full-left-half touch movement and retained pointer ownership through GGKit pointer records.
- Fixed gamepad support with deadzones, edge-triggered buttons, movement, pause, punch, jump, dodge, and restart behavior.
- Fixed keyboard and controller pause/restart paths, including Escape, Start, R, and result-screen continuation.
- Fixed enemy role differentiation. Flickers feint between lanes, acrobats vault, heavies charge, scrappers pressure, and bosses shift lanes and use a distinct slam pattern.
- Fixed visible enemy locomotion, attack states, windups, telegraphs, and attack-frame rendering.
- Fixed width-aware actor and prop collision, lane-aware body separation, and grounded vertical checks.
- Fixed distinct jab, cross, finisher, kick, pipe, and crate attack timing and weapon selection.
- Fixed cache loss at block completion. The block now waits for the exit, and uncollected items are carried into the next block.
- Fixed the particle floor with dedicated dodge, loot, and death emitters in addition to sparks, dust, and rings.
- Fixed player red damage pulse, invulnerability blink, death burst, boss break banner, hit-stop, and boss shake staging.
- Fixed the audio cue surface with GGKit-routed hit, hurt, dodge, pickup, break, boss, clear, UI, crowd, and danger names plus crossfaded intensity music.
- Fixed first-minute onboarding with touch, movement, combat, lane, hazard, jump, and dodge prompts.
- Fixed save validation and migration. Final boss unlock is derived from the first three medals, and upgrade and best-score fields are bounded in the GGKit schema.
- Fixed airborne attack gravity by continuing the bounded jump arc while an air attack is active.
- Fixed responsive HUD handling with compact typography and safe-area-aware root offsets based on the live viewport.

### Minor

- Fixed the animated multiplier chip on combo changes.
- Fixed projectile cleanup and carried-foe detachment on life loss.
- Fixed title return camera, banner, tween, and popup reset.
- Fixed result-banner expiry using wall-clock time and result-screen timer rendering.
- Rejected legacy `br_best` migration. The rebuilt title must keep GGKit as the sole persistence owner, so direct legacy `localStorage` access would violate the original brief; GGKit-backed best-score persistence is now included for new runs.

### Verification

- `node --check game.js` and `node --check sw.js` pass.
- Payload is 162724 bytes, with no file above 400 KB. All cached paths exist and all local audio is MP3.
- Live browser smoke and frame-time capture remained unavailable because no browser session was exposed in this environment.

## Boot repair

- Fixed the boot/render regression caused by registering audio assets on `kit.register(...)`; the GGKit contract exposes that API as `kit.audio.register(...)`.
- This call now completes before `new Phaser.Game(...)`, allowing the scene to create its procedural textures, street boards, HUD, and title panel; the title frame then transitions into a playable Street Run through the existing menu/input path.
- Bumped the service-worker cache version to `aaa-f7-20260810-3` so the repaired `game.js` is fetched on the next load.
- Browser capture was unavailable in this session; `node --check game.js` and `node --check sw.js` pass after the repair.

## UI declutter

- Cut always-on landmark/flavor copy and block descriptions from active play; compacted the HUD to stage/block, score, combo, health bar/number, weapon count, lives, and pause glyphs.
- Replaced in-play center banners and floating text with one queued edge chip, capped to a one-second hold; kept the single-line coach strip for essential onboarding only.
- Removed duplicate upgrade/result banners, moved block exit guidance into `B#/4 → EXIT`, and reserved the reduced center banner for run boundaries.

## Retina pass 2026-08-16

- Ratio record at landscape CSS 844x390 and DPR 3: before 1.85x from the 1280px design FIT backing store; after 3.00x expected from a 2080x1170 backing store. Live canvas measurement was unavailable.
- Recipe: `GGKit.hiDpi.factor(1280, 720)`, dense FIT scale dimensions, `GGKit.renderDefaults`, and `setZoom(RETINA_FACTOR)` in the main scene. The existing centered bounded camera was retained.
- Factor cap: none. The factor is GGKit-clamped to the device maximum of 3.
- Could not capture the required DPR 3 gameplay screenshot or `canvas.width / getBoundingClientRect().width` measurement because no browser instance was available and the private port could not be opened in this environment.
