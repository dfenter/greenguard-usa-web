# Duelsteel AAA evidence, after

Static evidence for fix round 1. The browser-only capture remains intentionally
unrun because this fix round forbids deployment and no browser session is
available.

- `game.js` now queues button action edges, resolves both fighters' hit events
  after the fixed-step update, explicitly handles double KOs, resets complete
  fighter transforms, and shares `octagonVertices()` between lake rendering and
  collision.
- AI uses explicit approach, guard, evade, attack, and recovery states. Arcade
  contains ten authored encounter variants with a ladder ramp.
- Survival renders three selectable pooled regen choices between duels.
- The scene uses beveled authored weapon profiles, animation clips, generated
  stage textures, cast shadows, spring camera follow, shake offsets, and a
  second textured pooled ember system.
- `manifest.json` contains valid 192px and 512px PNG icons. `sw.js` precaches
  both files under version `2026-08-11-aa02`.
- `LICENSES.md` records the original-IP and shared-runtime attribution scope.
