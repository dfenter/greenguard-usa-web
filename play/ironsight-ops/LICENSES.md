# Ironsight Ops asset and code licenses

Rev 1, 2026-08-13. Ironsight Ops is an original GreenGuard USA production for
Fleet F13. It ships procedural art baked at boot and original synthesised MP3
cues; no harvested pack file is copied into this directory.

## Asset provenance

The provenance rules and the available CC0 packs were checked in
`/play/_assets/LEDGER.md`, and the visual rules in `/play/_assets/ART_arcade2d.md`
and `/play/_assets/UI_LAW.md`. No ledger pack is consumed by this title: every
sprite, tile, icon, panel, particle and HUD element is drawn from code at boot
by `io_art.js`, and the launcher marks in `icon.png` / `icon512.png` /
`favicon.png` / `favicon.ico` are an original procedural mark.

The MP3 files in `assets/` are original short synthesised cues rendered offline
for this title from a deterministic oscillator and filtered noise script. They
contain no samples, they are local only, and they are loaded through the GGKit
audio buses. MP3 is used for browser compatibility; no OGG file exists in this
directory and no remote audio or network URL is referenced anywhere.

| File | Source | License |
|---|---|---|
| `assets/m_menu.mp3` | Original synthesised menu loop | CC0 |
| `assets/m_ops.mp3` | Original synthesised mission loop | CC0 |
| `assets/m_contact.mp3` | Original synthesised contact intensity loop | CC0 |
| `assets/shot_ar.mp3`, `assets/shot_smg.mp3`, `assets/shot_dmr.mp3`, `assets/shot_sg.mp3`, `assets/shot_pistol.mp3` | Original synthesised weapon reports | CC0 |
| `assets/hit_body.mp3`, `assets/hit_wall.mp3`, `assets/kill.mp3` | Original synthesised impact cues | CC0 |
| `assets/reload.mp3`, `assets/swap.mp3`, `assets/empty.mp3`, `assets/vault.mp3` | Original synthesised handling cues | CC0 |
| `assets/explode.mp3`, `assets/breach.mp3`, `assets/flash.mp3`, `assets/ping.mp3` | Original synthesised ordnance cues | CC0 |
| `assets/objective.mp3`, `assets/medal.mp3`, `assets/alarm.mp3`, `assets/ui.mp3` | Original synthesised interface cues | CC0 |
| `assets/hurt.mp3`, `assets/down.mp3` | Original synthesised damage cues | CC0 |
| `icon.png`, `icon512.png`, `favicon.png`, `favicon.ico` | Original procedural app mark | GreenGuard USA |

## Code

| File | Source | License |
|---|---|---|
| `game.js`, `io_art.js`, `io_content.js`, `io_sim.js`, `io_rules.js` | Original Ironsight Ops implementation | GreenGuard USA, all rights reserved |
| `index.html`, `manifest.json`, `sw.js` | Original title shell; `sw.js` derived from `/play/_shared/sw-template.js` | GreenGuard USA |
| `/play/_shared/phaser.min.js` | Phaser 3, Photon Storm Ltd / Richard Davey | MIT, see `/play/_shared/LICENSES.md` |
| `/play/_shared/ggkit.js` | GreenGuard studio kit | GreenGuard USA |
| `/play/_assets/ART_arcade2d.md`, `/play/_assets/UI_LAW.md`, `/play/_assets/LEDGER.md` | Shared studio references consulted by this title | GreenGuard USA |

## Original IP note

Ironsight Ops, the nine Operations missions, the four theatres (Harbour
Warehouse, Night Embassy, Desert Compound, Meridian Subway), the weapon names
(Vector 7, Rasp 9, Longshot, Breacher, Sidearm 45, Stub 20) and the hostile
classes are original title content. Nothing is drawn from, named after, or
copied out of another title directory.
