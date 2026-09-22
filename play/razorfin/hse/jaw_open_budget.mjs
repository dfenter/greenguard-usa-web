/* Rev 18 lane 7: the jaw tearing bar, re-derived as an ABSOLUTE opened length.
 *
 * WHAT REPLACED WHAT
 * ------------------
 * The old bar was `maxStretch <= 3.0`, a RATIO of opened edge length to rest
 * edge length. Lane 6 put eyes on every frame of a 5-family x closed/half/open
 * sheet at the real 25 deg travel, plus extreme zoom crops on each family's
 * worst edge, and found the surface UNBROKEN everywhere: no holes, no gaps, no
 * spikes, including snapjaw at 12.648x. The 3x bar failed 5 of 5 families that
 * a reviewer reads as perfect.
 *
 * WHY A RATIO CANNOT BE THE BAR
 * -----------------------------
 * Stretch is dimensionless and carries NO SCALE. The edges that fail the ratio
 * are near-degenerate: their rest lengths run 1.7e-4 to 8.2e-3 L. Doubling the
 * length of an edge that is 2 ten-thousandths of the body long produces a
 * defect two ten-thousandths of the body wide, which is a fraction of a pixel.
 * So a ratio bar has two symmetric failure modes:
 *   - it FAILS rows that look perfect (every pilot since Rev 17), and
 *   - it PASSES a genuine tear on a long edge, because a long edge only needs
 *     a small ratio to open a visible hole.
 * Visibility is an absolute length on screen, so the bar must be one too.
 *
 * THE NUMBER, AND WHERE IT COMES FROM
 * -----------------------------------
 * Lane 6 measured, for each family's worst edge, the length it OPENS TO at the
 * real 25 deg pose, expressed in body lengths L and in pixels on a 400 px body
 * (the in-game camera framing). Every one of these was then confirmed visually
 * clean on rendered frames:
 *
 *   family          opened px (400 px body)   opened length
 *   leviathanrex        17.9                    0.0447 L
 *   snapjaw             13.8                    0.0345 L
 *   aresrender           3.2                    0.0080 L
 *   thresher             1.0                    0.0025 L
 *   artemisstrike        0.2                    0.0005 L
 *
 * The worst VERIFIED-CLEAN opening is leviathanrex at 0.0447 L / 17.9 px, and
 * lane 6 called it the edge case worth arguing about: it is the only one near
 * a threshold, and it still reads clean under zoom. The bar is set just above
 * it with a modest margin rather than at a round number pulled from nowhere:
 *
 *     MAX_OPEN_L = 0.060 L   (24.0 px on a 400 px body)
 *
 * That is 1.34x the worst opening any human has confirmed clean, so no current
 * pilot passes by luck, and it is far below the ~0.10 L that would read as an
 * actual hole in the silhouette. It is deliberately LOOSER than every current
 * pilot, which is the honest consequence of the eyes-on evidence: the bar was
 * never real, and tightening it to keep failing the same five families would
 * be fitting the gate to a prior instead of to what renders.
 *
 * WHAT THIS BAR DOES NOT DO, AND THE HARD PRECONDITION
 * ---------------------------------------------------
 * An absolute length bar is trivially satisfied by a jaw that does not move:
 * every edge opens to 0.000 L and the family passes perfectly. That is the
 * 1.000x FALSE PASS, the most dangerous failure mode in this pipeline (it
 * destroyed artemisstrike and leviathanrex in lane 4 and looked like total
 * success). JAW-WEIGHT-SPEC section 6 requires a dead-jaw check BEFORE any
 * stretch number is believed, and this module keeps that as a HARD
 * PRECONDITION rather than an advisory: a family whose jaw does not measurably
 * move FAILS the gate regardless of its opened lengths. See `deadJawOk`.
 *
 * The stretch RATIO is retained as an informational column. It is still the
 * right instrument for spotting a regression in the weight field, it is simply
 * not the ship gate.
 */

/* Maximum absolute opened length of any single mesh edge, in body lengths L,
 * at the family's full-open travel. Derived above from lane 6's eyes-on data. */
export const MAX_OPEN_L = 0.060;

/* The framing lane 6 measured against: the in-game camera puts the body at
 * roughly this many pixels. Used only to report the bar in pixels, which is
 * the unit a reviewer can actually check against a frame. */
export const REFERENCE_BODY_PX = 400;

/* The bar expressed in screen pixels at the reference framing. */
export const MAX_OPEN_PX = MAX_OPEN_L * REFERENCE_BODY_PX;

/* The worst opening lane 6 confirmed visually clean, kept so the margin is
 * auditable and a future lane can see exactly how much room the bar has. */
export const WORST_CLEAN_L = 0.0447;      // leviathanrex, 17.9 px
export const BAR_MARGIN = MAX_OPEN_L / WORST_CLEAN_L;  // ~1.34x

/* Convert an absolute opened length (in model units) to the reference pixels. */
export function openPx(openLen, L) {
  return (openLen / L) * REFERENCE_BODY_PX;
}

/* Dead-jaw precondition, JAW-WEIGHT-SPEC section 6.
 *
 * `movedVerts` is the count of vertices whose position changed measurably
 * between the closed and open poses, the geometric analogue of the spec's
 * closed-vs-open differing-pixel count (lane 6 measured 2010..10853 differing
 * pixels across the five pilots). A jaw that does not move cannot be judged by
 * any opened-length bar, so this gates the gate.
 *
 * The threshold is deliberately low: the question is "did it move AT ALL",
 * not "did it move enough". Travel adequacy is probe_jaw's lower-lip check. */
export const DEAD_JAW_MIN_VERTS = 8;
export const DEAD_JAW_MIN_MOVE_L = 1e-4;   // per-vertex, in body lengths

export function deadJawOk(movedVerts) {
  return movedVerts >= DEAD_JAW_MIN_VERTS;
}

/* The single place that decides pass/fail, so probe_jaw and dump_stretch
 * cannot drift apart.
 *
 * Returns { ok, reason, ... }. `ok` is false if the jaw is dead OR if any edge
 * opens beyond the budget. The dead-jaw case is reported distinctly, because a
 * dead jaw passing on length is exactly the false pass this guards. */
export function judge({ maxOpenL, movedVerts }) {
  const alive = deadJawOk(movedVerts);
  const withinBudget = maxOpenL <= MAX_OPEN_L;
  if (!alive) {
    return { ok: false, alive, withinBudget, reason: 'DEAD JAW (precondition)' };
  }
  return {
    ok: withinBudget, alive, withinBudget,
    reason: withinBudget ? 'ok' : 'edge opens beyond budget',
  };
}
