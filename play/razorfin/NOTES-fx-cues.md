# Razorfin fx-cues lane notes

- Kept the existing nine GPU `THREE.Points` pools and aliased blood mist to
  the motes/deathBurst pool. The four goldpulse edge bars are also reused for
  the blood edge pulse, so cue work adds no draw calls.
- `ctx.run.frenzyCue` is treated as an edge-triggered state for school and
  golden/goldRush, and as a sustained state for blood. An absent or malformed
  cue clears the FX state and is safe in headless standalone use.
- The engine already sends three trail particles during an active boost. FX
  therefore applies the 2.5x target only to direct/base emissions and the
  300 ms release taper, avoiding double multiplication while still scaling
  particles by 1.4x.
- The fx selftest installs a tiny document stub so it can verify creation,
  red-class assignment, and synchronous removal of the four DOM bars without
  jsdom. UI cue styles are injected once per document by `ui3d.js`; they are
  color-only variants of the existing chip/toast surfaces.
