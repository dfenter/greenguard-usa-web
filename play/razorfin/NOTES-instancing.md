# Razorfin instancing lane notes

- `RF.Art3D.buildFish` is optional because this branch does not yet include the
  fish-loft module. The adapter accepts a build record or a mesh-like wrapper,
  and every failure is deliberately routed to the existing billboard path.
- Interactive fish use dense slots. A release copies the last matrix and
  attributes before decrementing `InstancedMesh.count`; this avoids holes and
  keeps the draw cost at one mesh per converted definition.
- Interactive and background batches clone the source geometry separately.
  Instanced attributes live on the geometry, so sharing one geometry between
  the interactive mesh and a school would make their attribute lengths alias.
- The instanced bend shader is installed only on cloned materials. Its cache
  key ends in `:rf-bend-inst`; the source fish material and the shark bend
  variants remain independent.
- Background schools are render-only registries. They never enter the entity
  pool, spatial hash, query results, or gameplay update branches.
- `instanceColor` carries status and future golden tint per entity. The legacy
  material-tint helper intentionally does nothing to a shared instanced mesh;
  `animateInstancedEntity` writes the per-instance color instead.
- The world selftest injects a small fish-builder stub to exercise the
  instanced path even when `fish3d.js` is not loaded, then explicitly runs the
  absent-builder billboard fallback before its normal 2D-art checks.
