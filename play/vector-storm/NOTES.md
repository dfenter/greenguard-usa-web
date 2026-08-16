# Vector Storm

Twin-stick arena shooter. Boots straight into play; no build step, no deps.
Controls: drag anywhere on the LEFT half to move, RIGHT half to aim + auto-fire; BOMB button clears the screen. Keyboard: WASD move, arrow keys aim/fire, Space/B bomb, any key restarts.
Loop: seeded spawn grammar escalates waves of drifters, dodging weavers, segmented snakes, mini-emitting spawners, and gravity wells. Kills drop crystals; every 8 collected raises the score multiplier, which resets on death.
Fail: 3 lives, then a score screen with best persisted to localStorage.

## AAA rebuild

Implemented:

- Phaser 3 fixed-step rebuild with GGKit as the only lifecycle, input, save,
  audio and PWA layer. Left drag moves, right drag aims and auto-fires, and
  the top bomb control clears the active field with shake, flash, rings and
  impact particles.
- Independent GGKit pointer claims with keyboard fallback, bounded enemy,
  bullet, crystal, pickup, popup and ring pools, baked canvas arena chrome,
  hand-tessellated rings, reduced-motion settings and a live `window.__vs`
  debug state with boot and scene force switches.
- Instant crystal pickup magnet, multiplier readout and crystal counter. A
  death clears crystals and returns the multiplier to x1. Bomb pickups are
  generous and scale with wave intensity, with elite encounters dropping
  supplies reliably.
- Thin first-run coach strip for move, aim and bomb. Survival medals at waves
  3, 6, 9 and 12 unlock Aegis ship, Prism weapon, Wraith ship and Nova weapon
  in that order, with persistent validation and a milestone banner chain.
- Original procedural ship skins, enemy silhouettes, muzzle flashes, nine
  pooled Phaser particle emitters, score popups, elite health bars, wave
  banners, wave-clear beats, game-over banner and danger music crossfade.
- Local original MP3 cues for music, intensity, fire, explosion, bomb, crystal,
  wave clear, milestone, boss, damage, pickup and game over. No CDN, OGG,
  hotlink or harvested title asset is used.

Wave and set table:

| Waves | Arena identity | Spawn grammar and mix | Authored elite |
|---|---|---|---|
| 1 to 3 | Open Void | Edge lanes, split rings, drifters and weavers | Prism Warden |
| 4 to 6 | Debris Field | Asteroid clusters, cross traffic, snakes and spawners | Debris Breaker |
| 7 to 9 | Gravity Cluster | Well pairs, spiral entries, weavers and snakes | Singularity Heart |
| 10 to 12 | Boss-Swarm Finale | Swarm lanes, spawner pressure, snakes and elite core | Crown Swarm |

Deferred:

- Live browser visual and throttled-device capture could not run because the
  browser connector was unavailable in this environment. Node syntax checks,
  manifest and service-worker file checks, and a headless Phaser/GGKit scene
  smoke test did run successfully.

## UI declutter

- Cut live wave-start banners, watermark/title text, arena control flavor text,
  labeled HUD repeats, boss-name text, and floating score/graze popups.
- Shrunk the HUD to compact score/wave/multiplier/crystal meters, life icons,
  power meters, and an icon-only bomb control; the coach is now one thin,
  timed top strip.
- Moved live boss, hull, bomb, and pickup feedback into one queued top-edge
  chip channel capped at 1.0s; kept only wave-clear and medal unlock moments
  as boundary banners, with reduced-motion fades/scaling preserved.

## Retina pass 2026-08-16

- Measured before ratio: unavailable for this title in this environment. Fleet baseline was 1.00x for 62 titles, with the remainder from 1.10x to 2.46x.
- Measured after ratio: unavailable because no browser backend was exposed. The helper path targets 3.00x at DPR 3, but that is not a captured measurement.
- Recipe: Phaser `Scale.RESIZE`; initial sizing, resize, orientation change, and visibility change all call `GGKit.hiDpi.resize`.
- Factor cap: none; the GGKit DPR cap of 3 applies. No title-specific cap was justified.
- Could not do: DPR 3 backing-store read or gameplay screenshot. Browser discovery returned no browser, and local HTTP port binding was denied.
