# Ionwake - asset licensing

Every file shipped under `/play/ionwake/` is listed here. This title is unusual
in the fleet: **it ships no third-party asset files at all.** There are no
model, texture, music or sound-effect files in the directory. Everything the
player sees and hears is generated at runtime by the title's own code, so there
is no asset pack to attribute and no CC0/CC-BY ledger row to point at.

## Summary

| Class | Files | License |
|---|---|---|
| Code + data (HTML, JS, JSON, 9 track files) | 15 | Original GreenGuard Studio work |
| Icon / favicon art (SVG) | 2 | Original GreenGuard Studio work |
| Icon art (PNG, rasterised from the SVG) | 2 | Original GreenGuard Studio work |
| Audio (inline base64 WAV in `audio.js`) | 0 separate files | Original, synthesized |
| Bundled third-party asset files | **0** | n/a |

## Complete file inventory

| Shipped file | Kind | Provenance |
|---|---|---|
| index.html | code | Original studio work |
| game.js | code | Original studio work |
| machines.js | code | Original studio work |
| audio.js | code + inline audio | Original studio work (see Audio below) |
| manifest.json | metadata | Original studio work |
| sw.js | code | Original studio work, filled from `/play/_shared/sw-template.js` |
| tracks/blackline-crest.json | data | Original studio work |
| tracks/cinder-highroad.json | data | Original studio work |
| tracks/halo-dive.json | data | Original studio work |
| tracks/ion-reef.json | data | Original studio work |
| tracks/last-light-ring.json | data | Original studio work |
| tracks/mirror-orbit.json | data | Original studio work |
| tracks/neon-artery.json | data | Original studio work |
| tracks/suncut-switchbacks.json | data | Original studio work |
| tracks/voltspire.json | data | Original studio work |
| icon.svg | art | Original studio work (hand-authored SVG: rect, 2 paths, 2 circles, 1 gradient) |
| favicon.svg | art | Original studio work (hand-authored SVG) |
| icon192.png | art | Rasterised from `icon.svg` at 192x192 |
| icon512.png | art | Rasterised from `icon.svg` at 512x512 |
| NOTES.md, LICENSES.md | docs | Original studio work |

## Engine

The engine is not shipped in this directory. Ionwake loads three.js through an
import map pointing at `/play/_shared/three/three.module.min.js`, and loads
`/play/_shared/ggkit.js`. Both are covered by `/play/_shared/LICENSES.md`:

- three.js r160.1 - MIT License, (c) 2010-2023 Three.js Authors.
- GGKit - original GreenGuard studio work, no third-party code.

## Graphics

No image or model files ship with this title. Track ribbons, machines, sky and
particle effects are built procedurally in `game.js` and `machines.js` from
three.js primitives and code-generated geometry. The only raster art in the
directory is the two app icons, which are rasterisations of the hand-authored
`icon.svg`.

## Audio

There are no audio files. `audio.js` carries a single ~150 byte WAV as an inline
`data:` URI and reuses it under twelve GGKit stem/SFX names (`stemA`, `stemB`,
`ui`, `boost`, `scrape`, `contact`, `pickup`, `dash`, `landing`, `lap`,
`countdown`, `podium`). Its own header comment describes it as an in-repo
synthesized motif, and NOTES.md line 56 records the same intent ("Audio is
intentionally compact synthesized WAV data for the offline payload"). It is a
short synthesized tone, not a recording, and not sampled from any pack.

## Fonts

No font file ships with this title. `game.js` sets the canvas font stack to
`Inter, system-ui, sans-serif`. Inter is *named* but not bundled and not fetched
from any CDN (the only external URLs anywhere in the directory are the SVG
namespace declarations), so on a device without Inter installed the text falls
back to the platform UI font. Nothing is downloaded, so no font license applies
to what is shipped.

## Unresolved

- **The inline WAV in `audio.js`.** The file's own comment and NOTES.md both
  describe it as synthesized in-repo, and its size (~150 bytes of PCM) is
  consistent with a generated single-cycle tone rather than a recording. I have
  not, however, found the generator script or a commit that produced it, so the
  claim rests on the two in-repo statements rather than on a reproducible
  source. If a stricter provenance record is needed, regenerate the tone from a
  checked-in script and replace this entry.
