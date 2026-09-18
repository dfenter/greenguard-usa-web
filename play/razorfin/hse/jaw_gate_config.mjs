/* Rev 18, router decision 1: ONE place that says how far the jaw actually
 * opens, shared by the runtime authority and by every offline gate.
 *
 * The bug this file exists to kill: `probe_jaw.mjs` and `dump_stretch.mjs`
 * both defaulted OPEN_RAD to 0.72 rad (41.3 deg). Nothing in the pipeline
 * ever opens a jaw that far. The runtime's full-open travel is
 * `rfJawAuthority.openRadians`, which `rig_morph.commitRestGape` sets from
 * `applyRestGape`'s target angle, and that target is
 *
 *     GAPE_MIN_RAD + (GAPE_MAX_RAD - GAPE_MIN_RAD) * t,  t = (gape+0.60)/1.20
 *
 * i.e. it is confined to the 22..30 degree band by rig_morph's own constants.
 * The same angle is authored into the mesh at bake time: every recipe carries
 * `mouth.gape_degrees` (all five pilots: 25) and `shark_variant._cut_mouth`
 * cuts the mouth planes to it. So 25 deg = 0.4363 rad is the real full-open
 * travel, and measuring tearing at 0.72 rad was measuring a pose the game
 * cannot produce -- 65% more rotation than the rig is ever asked for.
 *
 * Measuring at 0.72 does not merely overstate the number, it changes which
 * defect you see: stretch grows superlinearly on the near-coincident edges a
 * collapse decimate leaves behind, so an honest 3x edge reads as 40x+ and the
 * whole gate table becomes noise.
 *
 * RULE: no gate in this pipeline may hardcode an open angle. Import
 * `fullOpenRadians()` and pass the recipe, or accept the 25 deg default that
 * matches every current recipe.
 */

/* Mirrors of rig_morph.js GAPE_MIN_RAD / GAPE_MAX_RAD. These are re-exported
 * from rig_morph itself (see jawGateBand below) rather than duplicated as
 * literals, so this file cannot drift from the runtime. */
export { GAPE_MIN_RAD, GAPE_MAX_RAD } from './rig_morph.js';

/* The gape every current recipe authors, and shark_variant's own fallback
 * (`mouth_cfg.pop("gape_deg", mouth_cfg.pop("gape_degrees", 25.0))`). */
export const DEFAULT_GAPE_DEGREES = 25;

/* Full-open travel in radians for a given recipe.
 *
 * `recipe` may be a parsed recipe object, a bare number of degrees, or
 * undefined (falls back to the pipeline default). Returns the angle the
 * runtime would reach at gape01 = 1. */
export function fullOpenRadians(recipe) {
  let deg = DEFAULT_GAPE_DEGREES;
  if (typeof recipe === 'number' && Number.isFinite(recipe)) {
    deg = recipe;
  } else if (recipe && typeof recipe === 'object') {
    const m = recipe.mouth || {};
    const v = m.gape_deg ?? m.gape_degrees;
    if (Number.isFinite(Number(v))) deg = Number(v);
  }
  return deg * Math.PI / 180;
}

/* Resolve the open angle for a gate run, honouring an explicit OPEN_RAD
 * override but making the override visible rather than silent.
 *
 * Returns { radians, degrees, source }. `source` is 'env' when OPEN_RAD was
 * set, otherwise 'recipe'. Gates print this so a reader can never again
 * mistake an off-brief angle for the real travel. */
export function resolveOpenRadians(env, recipe) {
  const raw = env?.OPEN_RAD;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return { radians: n, degrees: n * 180 / Math.PI, source: 'env' };
    }
  }
  const radians = fullOpenRadians(recipe);
  return { radians, degrees: radians * 180 / Math.PI, source: 'recipe' };
}

/* Load a recipe JSON by family name, if present. Gates take a GLB path, and
 * the family name is the GLB basename, so this closes the loop from
 * assets/models/fam/<family>.glb back to tools/recipes/<family>.json. */
export async function loadRecipeForFamily(family, { fs, path, rootDir }) {
  /* leviathanrex is baked from sharkjira.json (handoff gotcha). */
  const alias = { leviathanrex: 'sharkjira' };
  const name = alias[family] || family;
  const file = path.join(rootDir, 'tools', 'recipes', name + '.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
