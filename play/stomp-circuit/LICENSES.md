# Stomp Circuit asset licenses

Rev 1, 2026-08-08. The title's gameplay code, vector truck silhouettes, arena
dressing, props, crowd, HUD, effects, and UI copy are original GreenGuard USA
work. No bitmap art or font file ships in this title.

## Runtime libraries

Phaser 3 is loaded from `/play/_shared/phaser.min.js` under the Phaser MIT
license. GGKit is loaded from `/play/_shared/ggkit.js` as original GreenGuard
USA studio code. Their notices are recorded in `/play/_shared/LICENSES.md`.

## Audio

All audio is MP3 and is registered with GGKit's music and SFX buses. The
service worker precaches these same-origin files so there is no CDN or runtime
network dependency after the first load.

| Runtime file | Use | Provenance | License |
|---|---|---|---|
| `assets/engine.mp3` | engine loop | Kenney sci-fi-sounds, recorded in Cloudhopper's license file | CC0 1.0 |
| `assets/sfx_crowd.mp3` | crowd swell | original GreenGuard USA synthesis, recorded in Shout It's license file | GreenGuard USA |
| `assets/impact.mp3` | impact | Kenney impact-sounds, recorded in Rally Dust's license file | CC0 1.0 |
| `assets/land.mp3` | landing and crush body | Kenney impact-sounds, recorded in Rally Dust's license file | CC0 1.0 |
| `assets/launch.mp3` | ramp launch | Kenney digital-audio, recorded in Rally Dust's license file | CC0 1.0 |
| `assets/boost.mp3` | boost ignition | Kenney sci-fi-sounds, recorded in Redline GT's license file | CC0 1.0 |
| `assets/cargo_pickup.mp3` | pickup | Kenney digital-audio, recorded in Cloudhopper's license file | CC0 1.0 |
| `assets/fanfare.mp3` | medal and showcase beat | Kenney music-jingles, recorded in Rally Dust's license file | CC0 1.0 |
| `assets/uiselect.mp3` | menu confirm | Kenney interface-sounds, recorded in Rally Dust's license file | CC0 1.0 |
| `assets/uitick.mp3` | menu navigation | Kenney interface-sounds, recorded in Rally Dust's license file | CC0 1.0 |

Rev 2 (dispatcher): the files above were originally hot-linked from sibling
titles' asset directories, which breaks per-title packaging. They are now
COPIED into this title's `assets/` directory; provenance is unchanged (same
CC0 pack rows in the studio ledger; `sfx_crowd.mp3` is original GreenGuard
USA synthesis first shipped with Shout It). Icons (`icon.png`, `icon512.png`)
are original GreenGuard USA vector work generated for this title.

## Rev 3 (Round 2 polish, 2026-08-16) — ledger citations

Every audio file above is traceable to a row of the studio asset ledger at
`play/_assets/LEDGER.md`; the rows are named here so the citation is explicit
rather than implied:

| Runtime file | LEDGER.md row | Ledger path | License |
|---|---|---|---|
| `assets/engine.mp3` | Kenney sci-fi-sounds | `web2d/sci-fi-sounds` | CC0 1.0 |
| `assets/boost.mp3` | Kenney sci-fi-sounds | `web2d/sci-fi-sounds` | CC0 1.0 |
| `assets/impact.mp3` | Kenney impact-sounds | `web2d/impact-sounds` | CC0 1.0 |
| `assets/land.mp3` | Kenney impact-sounds | `web2d/impact-sounds` | CC0 1.0 |
| `assets/launch.mp3` | Kenney digital-audio | `web2d/digital-audio` | CC0 1.0 |
| `assets/cargo_pickup.mp3` | Kenney digital-audio | `web2d/digital-audio` | CC0 1.0 |
| `assets/fanfare.mp3` | Kenney music-jingles | `web2d/music-jingles` | CC0 1.0 |
| `assets/uiselect.mp3` | Kenney interface-sounds | `web2d/interface-sounds` | CC0 1.0 |
| `assets/uitick.mp3` | Kenney interface-sounds | `web2d/interface-sounds` | CC0 1.0 |
| `assets/sfx_crowd.mp3` | not a ledger pack | original GreenGuard USA synthesis (first shipped with Shout It) | GreenGuard USA |

`stomp-circuit` is listed as a consumer on the impact-sounds,
interface-sounds, digital-audio, music-jingles and sci-fi-sounds rows of
`play/_assets/LEDGER.md`. No new binary asset was added in this round.

### Original work generated in code

Everything drawn on screen is generated procedurally at runtime and is
original GreenGuard USA work: the sky gradients, skyline and stand
silhouettes, and the crowd, grain and vignette tiles are baked into canvas
textures at load time by `game.js`; the truck chassis, wheels, suspension,
props, wrecks, debris, decals, ramps, rails, signature structures, particles,
HUD and menu art are drawn as vectors. No third-party image, font, or shader
ships in this directory.
