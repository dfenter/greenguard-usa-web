# Pantheon FIX round 2 — measured audit

Date: 2026-08-23  
Scope: `play/razorfin/shark3d.js` only, plus this note. No git commit.

## Round 2 implementation

The 8 verdict rows were changed with narrow, row-specific identity geometry. The 16 SHIP feature branches were not edited in this round. New ribbon/arc/spiral helpers are additive and are used only by the rework rows; existing callers retain their previous behavior.

| Row | Change | Final measured identity footprint | Root/feature audit |
|---|---|---:|---|
| `hadesmaw` | High-contrast three-prong crown contour above the head, with an anchored root bar. | 64.7×13.5 CSS px; area .054; hero .292 headH / .430L; overlap .20; 2 features | Crown/root reads as one attached contour. |
| `artemisstrike` | Open C-shaped crescent ribbon with visible cutout, plus rooted arrow tip. | 52.9×16.1 CSS px; area .026; hero .294 / .207; overlap .18; 2 features | Crescent opening remains visible at gameplay scale. |
| `hydrafang` | Three staggered head lobes, each with a visible body-rooted neck; common camera-facing proud depth prevents projection separation. | 94.2×17.9 CSS px; area .047; hero .255 / .257; overlap .30; 6 features; eye separation .12L | All three lobes overlap the hull; no projected air gaps. |
| `cerberusjaw` | Three vertically separated jaw lobes with indented/notched inner edges and a rooted bridge. | 81.9×41.6 CSS px; area .155; hero .246 / .549; overlap .24; 4 features; eye separation .11L | Three jaw masses and inter-lobe notches read independently. |
| `chimerashark` | Opposing upper lion-mane mass and lower serpent profile ribbon. | 88.5×27.8 CSS px; area .084; hero .285 / .476; overlap .26; 2 features; eye separation .10L | Mane and serpent remain opposing contour masses. |
| `minotaurram` | Two separated open horn arcs with separated tips/roots, plus rooted muzzle. | 78.1×26.9 CSS px; area .031; hero .275 / .408; overlap .24; 3 features; eye separation .12L | Both horn arcs remain visibly open and separated. |
| `lamiacoil` | Three open partial annular loops with negative space, plus an open-loop tail root. | 119.1×11.9 CSS px; area .022; hero .216 / .150; overlap .28; 4 features; eye separation .16L | Open loops and negative spaces survive the gameplay crop. |
| `kampechrono` | Enlarged skull silhouette with an anchored, skull-centred chrono spiral and anchor bar. | 72.4×16.3 CSS px; area .108; hero .296 / .503; overlap .62; 3 features; eye separation .10L | Skull reads enlarged; spiral is visibly anchored rather than floating. |

## Measured loop

Each iteration re-shot the exact eight IDs with:

```sh
cd /Users/lucille/.claude/tmp/claude-501/-Users-lucille/4ca09d6e-d0a7-4531-8418-931f0fa05b68/scratchpad/razorfin
OUT=shotsG IDS='hadesmaw,artemisstrike,hydrafang,cerberusjaw,chimerashark,minotaurram,lamiacoil,kampechrono' node sharkline.js
```

Iterations were captured in `shotsG`, `shotsH`, `shotsI`, and final `shotsJ`; the Hydra pass was tightened after thumbnail review to stagger the lobes and bring all three into the camera-facing projection.

Final `shotsJ` audit:

- 8 full screenshots generated.
- `thumb-audit.mjs`: 8 thumbnails, 64×30.
- `silhouette-thumb-audit.mjs`: 8 thumbnails, crop `960×260@360,280`, output 64×30.
- Gameplay-scale air-gap probe: final 1688×780 screenshots downsampled to 844×390 CSS pixels; 18 feature-to-hull root transects across the eight rows; maximum contiguous water-background run was 0 pixels for every row. In particular, Hydra used three lobe-root transects plus a hull strip, and Lamia used a loop/hull strip. No secondary silhouette had a background-color gap at the sampled gameplay scale.

## Ship non-regression controls

At the end, the required control rows were re-shot without changing their feature paths:

```sh
OUT=shotsShip IDS='zeusfin,medusagaze,scyllarender,heracrown' node sharkline.js
SOURCE=shotsShip THUMBS=shotsShip-thumbs node thumb-audit.mjs
SOURCE=shotsShip node silhouette-thumb-audit.mjs
```

Result: 4 screenshots, 4 64×30 thumbnails, and 4 64×30 silhouette thumbnails. The exact-order contact review preserved the Zeus bolt, Medusa tendrils/eye, Scylla tentacle skirt, and Hera crown reads.

## Gates

Final direct Art3D gate:

```text
art3d: pass=true ok=7 fail=0
```

Full CLI suite:

```text
world: pass=true ok=195 fail=0
game: pass=true ok=278 fail=0
art3d: pass=true ok=7 fail=0
fish: pass=true ok=7 fail=0
fx: pass=true ok=0 fail=0
ui: pass=true ok=238 fail=0
meta: pass=true ok=170 fail=0
abilities: pass=true ok=0 fail=0
```

`node gates3d.js` returned `errs:[]` for both the shelf and kaiju captures (`calls=86/96`, `tris=54864/53628`). `node --check play/razorfin/shark3d.js` and `git diff --check -- play/razorfin/shark3d.js` also pass.
