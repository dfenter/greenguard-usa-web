# Reef-surface lane notes

- The reef is deliberately three merged normal-blend batches: one static
  head/brain batch and two rooted fan/anemone batches. Two pivot groups give
  coral motion without paying one draw per coral column.
- Environment colours are baked before merge. `depthTint` handles parallax
  depth and `lightAtDepth` handles the sim's y-down vertical falloff. The
  optional `quadPush` top colour is what keeps floor-rooted art from reading
  as a flat dark card.
- The surface maps are persistent `texCache` assets. Browsers receive
  CanvasTextures; the headless runner receives equivalent DataTextures because
  Node has no canvas or DOM. Both paths use the same 256px source dimensions,
  wrapping, map slots, and fixed-step offset contract.
- The Snell disc owns a private material because its opacity is written from
  the atmosphere report each step. The ripple wash material is cached and its
  texture offset is the only animated texture state.
- Selftest uses BufferAttribute version changes instead of reading
  `needsUpdate` back, because three's setter records the upload by incrementing
  version and does not expose a stable boolean getter.
