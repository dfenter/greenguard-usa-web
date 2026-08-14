Controls: left stick/WASD move; right stick/arrows aim and release/fire; SUPER/Space triggers a charged super.
Loop: win GEM HOARD by holding 10 gems for 15 seconds, or crack the enemy safe in HEIST before 2:30.
Every win adds trophies; trophy-road unlocks are permanent and all power is flat.

## AAA rebuild

Implemented: fixed-step pooled 3v3 arena loop with eight free brawler kits, distinct attacks and supers, aim-release range and arc previews, gem carry and safe readouts, persistent trophies, medals, gem streaks, safe-speed records, and Gauntlet progression. Added procedural silhouettes for idle, move, aim, hurt, and super states; pooled gem, projectile, mine, turret, impact, and pickup effects; arena hazards; reduced-motion gating; GGKit audio buses; safe-area HUD anchoring; PWA files; and a guarded `window.__ss` probe with boot and live mode/arena switches.

| Mode | Rules | Authored lineup or variant |
| --- | --- | --- |
| GEM HOARD | Hold 10 gems for 15 seconds, or lead at the clock | 3v3 teams |
| HEIST | Crack the enemy safe before 2:30 | 3v3 teams |
| BRAWL GAUNTLET | Four hand-authored 3v3 bouts with medal chain | Scrap Start, Vault Run, Glow Break, Championship |
| SHOWDOWN | Free-for-all, last scrapper standing | 8-way arena |

| Arena | Identity | Hazard |
| --- | --- | --- |
| GEM PIT | Gem Hoard pit with crossing cover | Geyser |
| VAULT ROW | Heist lanes with safe sightlines | Laser lane |
| OPEN FIELD | Showdown field with broad rotations | Closing storm ring |
| CHAMPIONSHIP | Finale arena with central choke | Crusher core |

Deferred: live browser screenshot and interaction smoke test could not run because this environment exposed no browser and denied local HTTP port binding. Static boot fallback, JavaScript syntax, manifest, asset, service-worker, and payload checks passed.
