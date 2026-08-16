# Corridor Crawl licenses

Corridor Crawl's visible tile, creature, item, particle, HUD, and title art is
procedurally drawn original IP, generated at load time into canvas textures by
`art.js`. No sprite sheet, tile pack, or third-party image file ships with this
game, and nothing is hotlinked from another title's directory.

The game uses the vendored Phaser 3 runtime and GGKit from `play/_shared/`.
Their license notices are in [`play/_shared/LICENSES.md`](../_shared/LICENSES.md).

The art and audio bible is [`play/_assets/ART_topdown2d.md`](../_assets/ART_topdown2d.md)
(top-down 2D lane plus its RPG addendum). The UI rules are
[`play/_assets/UI_LAW.md`](../_assets/UI_LAW.md). The shared asset provenance
ledger is [`play/_assets/LEDGER.md`](../_assets/LEDGER.md); Corridor Crawl draws
no rows from it because every shipped asset is generated for this title.

## Audio

Every file under `assets/audio/` is an original GreenGuard title asset,
synthesised for this game from first principles (additive tones, filtered noise,
and envelopes) and encoded with libmp3lame at mono 88-96 kbps. No sample pack,
loop library, or harvested recording is used.

| File | Role |
| --- | --- |
| `step, hit, hurt, pickup, item-use, stairs, telegraph` | core interaction SFX |
| `crown, death, escape` | run-boundary stingers |
| `boss, shrine, identify, torch-low, shard` | round 2 SFX: boss arrival, purchase, identification, guttering torch, shard award |
| `theme` | title screen bed (12 s loop) |
| `ambience-warrens, ambience-flooded, ambience-forge, ambience-deeps, ambience-vault` | one authored 8 s bed per floor band |
| `ambience-boss` | boss floor bed (6 s loop) |

All audio routes through GGKit's registered music and SFX buses. Music beds are
registered at boot but only fetched and started after the player's first
interaction, per the fleet lazy-load rule. Format law: mp3 only, never ogg.
