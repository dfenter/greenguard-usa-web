# L3 props and kaiju features

Lane: HSE-IFICATION Razorfin Rev 14.

## Milestones

- [x] Read the Rev 14 textured-rig notes, loader path, and generated-data source.
- [x] Add `props_textured.js` with measured bind-frame/body-band fitting, one skinned feature draw, and shared baked-map material flags.
- [x] Add the single textured-only `buildLoadedRig` hook; legacy Sharky props remain on the non-textured path and hammer foil remains suppressed on textured rows.
- [x] `node --check` passes for both the new module and `shark3d.js`; direct numeric feature gate passes for Sharkjira, Leviathan Rex, horns, crowns, saws, contact, map flags, jaw-bone weighting, and the two-draw body-plus-feature budget.
- [ ] Run real-GL evidence after the lane's model/data map contains the requested feature rows. The supplied CDP renderer cannot bind a localhost port in this sandbox, and the browser connector is unavailable in this session.

## Contract

`props_textured.js` measures the longest bind-pose mesh axis, the dorsal axis from the live world-up frame, body bands at each station, and the actual Head-to-Tail3 chain. Crest plates, scutes, crowns, saws, horns, cheeks, and tusks are skinned to those measured stations. One material/draw carries all features and reuses the textured body's diffuse and normal maps while palette colors and class-gated glow are applied in the feature shader.
