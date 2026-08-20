# Razorfin environment terrain lane

Implemented Plan 3B environment work in `world3d.js`:

- Replaced the animated full-water shimmer with one static, opaque RGBA
  gradient sheet at `z=-500`, covering the world with a frustum overshoot.
- Extended the existing quad merge to carry distinct top and bottom corner
  colours, and added `mergeRidge()` for build-time triangle-strip terrain
  geometry with RGBA vertex colours.
- Added far, mid, near, and positive-z foreground terrain batches. The ridge
  scratch accepts NaN breaks so per-zone shelf ledges stay in their own local
  depth while retaining four draws total.
- Reconciled clear colour to the sheet sample plus a restrained authored-tint
  bias. The bias is important in the abyss, where the sheet's dark blend can
  otherwise lose too much HSV saturation even though the water remains dark.

Gotchas:

- `mergeRidge()` stores positions in three-space. Terrain callers therefore
  pass `-simY` for both ridge tops and local bases, just as `setPos()` maps the
  simulation's y-down coordinates.
- The four terrain materials deliberately use `fog=false` and opaque depth
  writes. Terrain alpha remains in the RGBA vertex contract at `0.94..1.0`,
  but depth colour and parallax, not transparency, carry the terrain read.
- `animateWater()` has no gradient or terrain work. Those objects are static
  after init, preserving the zero-allocation fixed-step contract.

Verification:

```text
node --check world3d.js
node --import ./tools/reg.mjs tools/selftest.mjs world
world: pass=true ok=135 fail=0
```
