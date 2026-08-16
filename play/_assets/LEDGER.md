# /play asset ledger (Rev 2, 2026-08-16)

Every asset file shipped under /play/_assets/ or /play/<slug>/assets/ must
trace to a row here (pack level) plus the per-game LICENSES.md (file
level). Harvest archive (Mac canonical): /Users/lucille/worker-archive/
studio-assets/ — per-pack LICENSE.txt files carry source + evidence URLs;
full inventory in ue-port-studio/ASSET_CATALOG.md ("web2d harvest
2026-08-06" section).

| Pack | Archive path | License | Evidence | Used by |
|---|---|---|---|---|
| Kenney ui-pack | web2d/ui-pack | CC0 | kenney.nl/assets/ui-pack | ace-vector, horde-meridian, slingfang |
| Kenney ui-pack-adventure | web2d/ui-pack-adventure | CC0 | kenney.nl/assets/ui-pack-adventure | (none yet) |
| Kenney particle-pack | web2d/particle-pack | CC0 | kenney.nl/assets/particle-pack | wanderlight |
| Kenney racing-pack | web2d/racing-pack | CC0 | kenney.nl/assets/racing-pack | (none yet) |
| Kenney pixel-shmup | web2d/pixel-shmup | CC0 | kenney.nl/assets/pixel-shmup | (none yet) |
| Kenney tiny-dungeon | web2d/tiny-dungeon | CC0 | kenney.nl/assets/tiny-dungeon | driftlands, wanderlight |
| Kenney tiny-town | web2d/tiny-town | CC0 | kenney.nl/assets/tiny-town | blockborough, driftlands, wanderlight |
| Kenney top-down-tanks-redux | web2d/top-down-tanks-redux | CC0 | kenney.nl/assets/top-down-tanks-redux | (none yet) |
| Kenney fish-pack | web2d/fish-pack | CC0 | kenney.nl/assets/fish-pack | lunker-lake |
| Kenney input-prompts | web2d/input-prompts | CC0 | kenney.nl/assets/input-prompts | (none yet) |
| Kenney impact-sounds | web2d/impact-sounds | CC0 | kenney.nl/assets/impact-sounds | driftlands, lunker-lake, rally-dust, redline-gt, stomp-circuit, torque-trail, wanderlight |
| Kenney interface-sounds | web2d/interface-sounds | CC0 | kenney.nl/assets/interface-sounds | aegis-line, blockborough, cloudhopper, lunker-lake, rally-dust, redline-gt, shout-it, stomp-circuit, torque-trail, wanderlight |
| Kenney digital-audio | web2d/digital-audio | CC0 | kenney.nl/assets/digital-audio | aegis-line, cloudhopper, rally-dust, shout-it, stomp-circuit |
| Kenney music-jingles | web2d/music-jingles | CC0 | kenney.nl/assets/music-jingles | aegis-line, rally-dust, redline-gt, shout-it, stomp-circuit |
| Kenney sci-fi-sounds | web2d/sci-fi-sounds | CC0 | kenney.nl/assets/sci-fi-sounds | aegis-line, cloudhopper, redline-gt, stomp-circuit |
| Kenney casino-audio | web2d/casino-audio | CC0 | kenney.nl/assets/casino-audio | shout-it |
| Quaternius Cars Pack | quaternius-cars | CC0 | quaternius.com/packs/cars.html | rally-dust, redline-gt (files retained, no longer loaded at runtime) |
| music (mixed harvest) | web2d/music | CC0 / CC-BY per track | web2d/music/LICENSE.txt | aegis-line, blockborough, cloudhopper, driftlands, lunker-lake, rally-dust, redline-gt, shout-it, torque-trail, wanderlight |

"Used by" refreshed 2026-08-16 against every play/<slug>/LICENSES.md in the
repo. A title that explicitly records "row deliberately not used" is NOT
listed. Rows reading "(none yet)" are harvested and available but consumed by
no shipped title.

Rules: never ship a whole pack; curate per-game cuts into
/play/<slug>/assets/; CC-BY items require attribution in the game's
LICENSES.md AND in-game credits. Update the "Used by" column when a game
ships with a pack's files.

Engines/loaders in /play/_shared/ are covered by _shared/LICENSES.md.
