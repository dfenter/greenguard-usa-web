# Fix1 implementation notes

- Geometry-only fish sources are accepted by `world3d.js`; the world owns one shared white toon material for the persistent loft cache and clones only per instanced batch. Fish source geometry/materials are excluded from per-run teardown ownership.
- NPC shark rigs apply `RF.Game.LEN_SCALE` once from `group.userData.baseScale`, with `__baseScale` and `__rfLenScale` stamps guarding repeated setup.
- Golden School completion now queues a one-frame `golden` frenzy cue; the next fixed step publishes `goldRush`. Engine code no longer emits the golden FX directly, leaving FX emission in the central authority.
- God rays use four feathered-alpha shafts per band with the reduced opacity/height/width envelope. Surface wash, ribbon, foam, Snell, and caustic alpha values follow the shallow-stack contract.
- Generated zone fog/tint data, gradient placement, terrain facets/waves/palettes, and the beige-card replacement were updated through `tools/gen_data.py` where applicable.
- HUD snapshots use two preallocated buffers swapped by reference. The resource gate is exposed as `RF.Game.__resourceGate` for browser runs and checks scene children plus renderer program/geometry/texture counts across repeated samples.
- Fish lofts include small dark eye accents (eight triangles total), remain under the triangle budget, and preserve the bend/material cache contract.
