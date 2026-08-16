# Mythweave licenses

Mythweave is original work by GreenGuard USA. Every spirit, foe, realm,
chapter, card name and line of story text was written for this title. No
licensed character, setting or trademark is referenced.

## Code

- `content.js`, `game.js`, `sw.js`, `index.html`, `manifest.json` are original
  GreenGuard USA code.
- Phaser 3.87 is vendored at `/play/_shared/phaser.min.js` under the MIT
  License. See `/play/_shared/LICENSES.md`.
- `ggkit.js` at `/play/_shared/ggkit.js` is the GreenGuard studio kit and is
  original work. See `/play/_shared/LICENSES.md`.

## Art

- No third-party image file is shipped in this title. `/play/_assets/LEDGER.md`
  was checked: it lists Kenney CC0 packs held in the harvest archive at
  `/Users/lucille/worker-archive/studio-assets/`, and that archive is not
  present in this workspace, so no pack cut was made and no other title's
  directory is hotlinked.
- Every backdrop, spirit portrait, command card face, foe silhouette, icon,
  particle sprite and the player spritesheet is drawn procedurally into canvas
  textures at load time by `game.js` (see `bakeRealmBg`, `bakePortrait`,
  `bakeCard`, `bakeFoeTexture`, `bakeWeaverSheet`, `bakeIcon`,
  `bakeParticleTextures`, `bakeLogo`).
- `icon.png`, `icon512.png` and `favicon.png` are original marks generated from
  an original loom-spool drawing.

## Audio

All sixteen sound effects and four music loops in `assets/` were synthesised
from scratch for this title (additive and subtractive synthesis, original
chord progressions and motifs). No sample library, no third-party recording
and no third-party composition is used. Source generator: an original Python
script using numpy and scipy, rendered to mono 44.1 kHz WAV and transcoded
with ffmpeg to mono MP3 at 96 kbps per the fleet audio format law
(`libmp3lame`, never Ogg).

| File | Role |
|---|---|
| `lantern.mp3` | Menu and Lantern Quarter loop |
| `shrine.mp3` | Drowned Shrine and Glass March loop |
| `steppe.mp3` | Ash Steppe battle loop |
| `loom.mp3` | Boss and Loom finale loop |
| `ui.mp3` | Menu confirm |
| `pick.mp3` / `unpick.mp3` | Card added to / removed from the chain |
| `strike.mp3` | Strike card impact |
| `guard.mp3` | Guard card, block gained, blocked hit |
| `arcana.mp3` | Arcana card |
| `weave.mp3` | Weave Art |
| `heal.mp3` | Healing |
| `hurt.mp3` | The Weaver takes damage |
| `break.mp3` | Break bar shattered, foe staggered |
| `unravel.mp3` | Foe defeated |
| `bind.mp3` | Spirit bound, ascension |
| `victory.mp3` / `defeat.mp3` | Battle result |
| `star.mp3` | Banner beat, reward chip |
| `intent.mp3` | Foe enrage, wave change |

No CC-BY attribution is required because nothing under CC-BY is shipped.
