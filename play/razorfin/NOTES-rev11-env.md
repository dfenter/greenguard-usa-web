# Rev 11 environment dressing pass

Scope: `play/razorfin/world3d.js` décor and atmosphere only. No spawner,
schooling, AI, SDF/entity, or instanced-bend changes were made in this lane.

## Visual QA

Reference bar: the attached Hungry Shark Evolution screens — layered painted
reef silhouettes, warm/cool coral families, wreck/ruin anchors, kelp, haze,
god rays, caustic shimmer, and particulate depth while the shark remains the
highest-contrast subject.

Before pass:

- `scratchpad/razorfin/shots10/` — flat teal bands, sparse kelp, thin gray
  pillars, and a hard pale surface trapezoid.
- Baseline `memprobe3d.js`: 64 draws / 37,431.3 tris.

After pass:

- `scratchpad/razorfin/shotsE-final2/shark_reef.png` — clean `sharkline.js`
  capture with `OUT=shotsE-final2 IDS=reef`; the harness places the player at
  x=3600/y=1200.
- `scratchpad/razorfin/shots11-final4/zone_*.png` — `zoneshots.js` probes at
  y=120 (sunlit), 500 (sunlit mid), 1400 (reef), 2600 (twilight), and 3700
  (abyss). The final probe uses y=3700 because the abyss starts at 3500; the
  older y=3300 probe was still twilight.

Implemented visual layers:

- one merged painted rock/outcrop batch with vertex-color top/bottom shading;
  regular kelp beds across all bands with sway and soft tip motes;
- rounded coral heads, brain clusters, tube sponges, and two swaying fan beds
  per zone, with warm shelf, purple/orange reef, cyan twilight, and
  violet/green abyss families;
- one low-contrast wreck silhouette per zone (hull, broken deck, mast, torn
  sail, chains, and restrained portholes), plus parallax outcrops and ruins;
- continuous zone gradient/fog script, soft feathered god rays, near-surface
  caustics, thermocline haze, distant silhouettes, and a single particulate
  batch;
- coral/fan and kelp-tip batches use feathered maps so background accents do
  not become opaque-looking rectangular cards.

## Budget / gates

Current `memprobe3d.js` run result:

```text
run-kaiju: 69 draw calls / 39,921.3 triangles
caps:      120 draw calls / 60,000 triangles
```

`node --import ./tools/reg.mjs tools/selftest.mjs world game`:

```text
world: pass=true ok=210 fail=0
game:  pass=true ok=296 fail=0
```

The browser probes still report the known Service Worker scope warning for
`/play/razorfin` versus `/play/razorfin/`; captures complete successfully.
