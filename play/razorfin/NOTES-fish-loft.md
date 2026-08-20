# Fish-loft lane notes

- The generated prey definitions expose sprite keys but no tint/palette
  fields, so `fish3d.js` owns a small 12-entry palette table keyed by the
  exact `RFD.CREATURES` IDs. `dolphinfish` is the data ID for Dorado and
  `leviathanprey` is the data ID for the calf.
- The body, caps, tail fan, and dorsal sliver are appended into one indexed
  `BufferGeometry`; the fin faces are duplicated front/back so a later toon
  material can choose its side without requiring a second geometry.
- The fish bend uniforms are intentionally a data-returning material spec,
  not a shader hook. The shader clone and instancing consumer belong to the
  later world/shark-bend integration lanes; keeping this module standalone
  lets the headless fish selftest run with only the vendored three module.
