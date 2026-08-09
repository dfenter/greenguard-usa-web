# Ace Vector - asset licences

Every file shipped under `/play/ace-vector/` is listed below with its origin
and licence. Pack-level provenance for anything harvested lives in
`/play/_assets/LEDGER.md`; this file is the per-file trace that ledger
requires.

Two origins appear in this game and nothing else does:

- **Original work.** Authored for Ace Vector by GreenGuard USA and released
  under CC0 1.0 (public domain dedication). Sprite atlases, particle
  textures, backdrops, icons, every sound effect and both music stems.
- **Kenney ui-pack.** CC0 1.0. Ledger row "Kenney ui-pack" (archive
  `web2d/ui-pack`, evidence `kenney.nl/assets/ui-pack`). Only the two type
  faces are used; no Kenney artwork or audio ships in this game.

No third-party code, art, audio or font other than the two Kenney faces is
present. There are no CC-BY items, so no attribution beyond this file and the
in-game credits screen is required.

## Type

| File | Origin | Licence | Notes |
|---|---|---|---|
| `assets/font_display.woff2` | Kenney ui-pack, `Font/Kenney Future.ttf` | CC0 1.0 | Subset to printable ASCII and converted to WOFF2. Family renamed to `AV Display` in CSS only; the internal name table still reads "Kenney Future". |
| `assets/font_body.woff2` | Kenney ui-pack, `Font/Kenney Future Narrow.ttf` | CC0 1.0 | Subset to printable ASCII and converted to WOFF2. Family renamed to `AV Body` in CSS only; the internal name table still reads "Kenney Future Narrow". |

## Sprite atlases

| File | Origin | Licence | Notes |
|---|---|---|---|
| `assets/air.png` | Original work | CC0 1.0 | Aircraft atlas: four player airframes, six bandit archetypes and four aces, each with five bank frames. |
| `assets/air.json` | Original work | CC0 1.0 | Phaser atlas frame data for `air.png`. |
| `assets/ui.png` | Original work | CC0 1.0 | HUD and interface atlas: panels, buttons, virtual stick, reticle, lock bracket, chevron, tracers, flak, missile, ejection pod and chute, impact rings, propeller frames. |
| `assets/ui.json` | Original work | CC0 1.0 | Phaser atlas frame data for `ui.png`. |

## Backdrops and particles

| File | Origin | Licence | Notes |
|---|---|---|---|
| `assets/clouds.png` | Original work | CC0 1.0 | Four cloud silhouettes on one sheet, sliced at boot. |
| `assets/ridge_far.png` | Original work | CC0 1.0 | Far parallax ridge line, tiled. |
| `assets/ridge_near.png` | Original work | CC0 1.0 | Near parallax ridge line, tiled. |
| `assets/disc.png` | Original work | CC0 1.0 | Soft radial disc used for additive glows and rim light. |
| `assets/p_spark.png` | Original work | CC0 1.0 | Impact spark particle. |
| `assets/p_smoke.png` | Original work | CC0 1.0 | Damage smoke particle. |
| `assets/p_fire.png` | Original work | CC0 1.0 | Fire and explosion particle. |
| `assets/p_flare.png` | Original work | CC0 1.0 | Countermeasure flare and engine trail particle. |
| `assets/p_wisp.png` | Original work | CC0 1.0 | Thin vapour wisp particle. |

The mid ridge (`ridge_mid`), the three parallax cloud sheets (`cloud_far`,
`cloud_mid`, `cloud_near`) and all five sky gradients (`sky_dawn`, `sky_noon`,
`sky_dusk`, `sky_storm`, `sky_night`) are not files. They are baked into
canvas textures at boot by `game.js`, so they are original work by
construction and ship as code.

## Audio

All audio is original work by GreenGuard USA, CC0 1.0, synthesised for this
game. MP3 only; there are no `.ogg` files and no audio is fetched at runtime.

| File | Origin | Licence | Notes |
|---|---|---|---|
| `assets/music_cruise.mp3` | Original work | CC0 1.0 | Looping cruise theme, menus and pre-contact flight. |
| `assets/music_combat.mp3` | Original work | CC0 1.0 | Looping combat theme, crossfaded in on first contact and on an ace arrival. |
| `assets/sfx_gun.mp3` | Original work | CC0 1.0 | Player cannon. |
| `assets/sfx_gun_wing.mp3` | Original work | CC0 1.0 | Wingman cannon. |
| `assets/sfx_foe_gun.mp3` | Original work | CC0 1.0 | Bandit cannon. |
| `assets/sfx_hit.mp3` | Original work | CC0 1.0 | Round on airframe. |
| `assets/sfx_kill.mp3` | Original work | CC0 1.0 | Bandit destroyed. |
| `assets/sfx_ace_kill.mp3` | Original work | CC0 1.0 | Ace destroyed. |
| `assets/sfx_hurt.mp3` | Original work | CC0 1.0 | Player hull damage. |
| `assets/sfx_missile.mp3` | Original work | CC0 1.0 | Missile launch. |
| `assets/sfx_lock.mp3` | Original work | CC0 1.0 | Missile lock warning. |
| `assets/sfx_flare.mp3` | Original work | CC0 1.0 | Countermeasure release. |
| `assets/sfx_sortie.mp3` | Original work | CC0 1.0 | Sortie start sting. |
| `assets/sfx_clear.mp3` | Original work | CC0 1.0 | Sky cleared sting. |
| `assets/sfx_fail.mp3` | Original work | CC0 1.0 | Sortie lost sting. |
| `assets/sfx_rank.mp3` | Original work | CC0 1.0 | Promotion sting. |
| `assets/sfx_eject.mp3` | Original work | CC0 1.0 | Ejection seat. |
| `assets/sfx_click.mp3` | Original work | CC0 1.0 | Button press. |
| `assets/sfx_select.mp3` | Original work | CC0 1.0 | Airframe and sortie select. |

## Shell, icons and code

| File | Origin | Licence | Notes |
|---|---|---|---|
| `icon.png` | Original work | CC0 1.0 | 192 px PWA and home-screen icon. |
| `icon512.png` | Original work | CC0 1.0 | 512 px PWA icon. |
| `index.html` | Original work | CC0 1.0 | Page shell, bundled font faces, branded boot composition. |
| `manifest.json` | Original work | CC0 1.0 | PWA manifest. |
| `sw.js` | Original work | CC0 1.0 | Service worker, from the studio `sw-template.js`. |
| `game.js` | Original work | CC0 1.0 | All game code. |
| `NOTES.md`, `LICENSES.md` | Original work | CC0 1.0 | Documentation. |

Shared runtime files are not part of this game's payload trace and carry their
own licences: Phaser 3 (`/play/_shared/phaser.min.js`, MIT) and GGKit
(`/play/_shared/ggkit.js`), both covered by `/play/_shared/LICENSES.md`.
