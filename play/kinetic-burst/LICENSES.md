# Kinetic Burst licenses

## Third-party runtime

| Item | Path | License |
|---|---|---|
| Phaser 3 | `/play/_shared/phaser.min.js` | MIT, see `play/_shared/LICENSES.md` |
| GGKit | `/play/_shared/ggkit.js` | in-house, see `play/_shared/LICENSES.md` |

## Art

No third-party art files are shipped. Every visual in this title is drawn
procedurally at runtime into canvas textures by `js/art.js`: the four ki orb
families and their linked variants, the four selector states, the nine fighter
badges, five arc board frames and cell fields, five sky gradients, fifteen
parallax band strips, five boss silhouettes, every card, chip, bar, ring and
icon, and all five particle sprites. `icon.png`, `icon512.png` and
`favicon.png` are original offline renders of the same three orb motif.

No pack files were taken from `/play/_assets/`; that directory currently holds
only the art bibles, the UI noise law and the asset ledger. The pack level
provenance rules this title was built against are recorded in
`play/_assets/LEDGER.md`, and the lane art direction in
`play/_assets/ART_puzzlepop.md` (Kinetic Burst entry: dark indigo board,
luminous orbit lines, original geometric fighter badges, ki types coded by
shape plus symbol plus value rather than by hue). Nothing is hotlinked from
another title's directory.

## Audio

All twenty MP3 files in `assets/` are original procedural audio, synthesised
offline for this title (FM bells, filtered noise, saw pads and triangle
plucks) and encoded to mono MP3 with libmp3lame. No sampled, licensed or
third-party recordings are used. No OGG files are shipped. Playback runs
entirely through the GGKit audio buses.

| File | Cue |
|---|---|
| `ui_click.mp3` | UI confirm |
| `link.mp3` | orb linked into the trace, pitched by chain position |
| `trace_open.mp3` | trace begins |
| `invalid.mp3` | trace with no scoring run, illegal action |
| `pop.mp3` | orb pops, pitched up across the batch |
| `cascade.mp3` | refill orbs landing |
| `strike.mp3` | ordinary ki hit |
| `crit.mp3` | ki advantage hit |
| `heal.mp3` | heart run mends the team |
| `charge_full.mp3` | a fighter's burst arms |
| `super.mp3` | super cut-in swell |
| `clash_hit.mp3` | perfect clash tap |
| `hurt.mp3` | the team takes a hit |
| `down.mp3` | an opponent falls |
| `wave.mp3` | a new enemy wave arrives |
| `victory.mp3` | stage or trial clear |
| `defeat.mp3` | team down |
| `unlock.mp3` | a fighter joins the roster |
| `theme_road.mp3` | campaign loop |
| `theme_core.mp3` | boss, foundry and finale loop |

## IP

Original IP only. All fighter names, enemy names, arc names, badges, symbols
and copy are original to this title. No licensed characters, logos, costumes,
trade dress, aura language or competitor lookalike naming.
