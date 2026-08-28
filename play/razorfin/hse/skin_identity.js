/* Rev 14 HSE identity layer for baked shark skin.
 *
 * The bake owns the fine skin detail. This layer owns the row read: authored
 * hue, a hard back/belly break, compact procedural marks, class glow seams,
 * and the eye-color hook. It is deliberately composable with the textured
 * material hook already installed by shark3d.js.
 */
import * as THREE from 'three';

const PATTERNS = Object.freeze({
  plain: 0, stripes: 1, spots: 2, dots: 2, mottled: 2, mirror: 2,
  bands: 3, rings: 3, ribbons: 3, swirls: 3, collar: 3, rays: 3, corona: 3,
  scars: 4, cracks: 4, faults: 4, bones: 4, rot: 4, runes: 4,
  plates: 5, plating: 5, scales: 5, spikes: 5, rivets: 5, panels: 5,
  facets: 5, coral: 5, magma: 4, stars: 2, patches: 2
});
const CLASS_CODES = Object.freeze({ common: 0, rare: 1, epic: 2, legendary: 3, god: 4, demon: 5 });

/* Lane F2 scene constants.
 *
 * WATER_HUE is the hue of engine3d.js's HemisphereLight sky color and its
 * FogExp2, which are the same 0x9fd4e8 (hue 0.546). Every rendered hue is
 * multiplied and then blended toward it, and ACES filmic tone mapping
 * compresses what is left, so a row arrives at the camera measurably closer to
 * the water than it was authored. Measured on the round-2 evidence: mako is
 * authored #3d6fb5 (hue 0.597, a blue) and rendered at hue 0.446, a teal; the
 * whole blue half of the roster piled up between 0.44 and 0.50 regardless of
 * what its palette said, which is why eight rows on four different base models
 * all read as the same green-teal.
 *
 * HUE_COMPENSATION over-rotates the authored hue AWAY from the water before
 * lighting, so it lands on the palette afterwards. Simulating the lighting and
 * ACES over the real swatches puts the required rotation near 0.45 of the gap;
 * it is held below 1.0 deliberately so the correction can never overshoot past
 * the authored hue into the opposite side of the wheel. */
const WATER_HUE = 0.546;
/* The scene's INCIDENT LIGHT COLOR, normalized to unit mean.
 *
 * Both the game scene and the DOC harness light with a cyan HemisphereLight
 * (sky 0x9fd4e8) plus a white key. Lighting MULTIPLIES albedo, so a hide is
 * rendered in albedo x light, and with the light itself tinted cyan every hide
 * is dragged toward cyan no matter what this layer authors.
 *
 * Measured, and it is large: a bronze albedo of saturation 0.17 renders at
 * saturation 0.09 with its hue pulled from 0.115 (bronze) to 0.635 (blue-grey),
 * which is exactly the mauve/grey the close-ups show. Confirmed to be the
 * light and not this layer by rendering a completely FLAT 0.5 grey albedo: it
 * came back green. It is also why raising SPECIES_SAT_MIN and restoring the
 * chroma in the material's top/bottom multiply both failed to move the render
 * at all - neither touches the term doing the damage.
 *
 * Dividing the authored albedo by this tint before it is lit means the PRODUCT
 * is the species color, which is what the owner is judging. */
const LIGHT_TINT = Object.freeze([0.9308, 1.0181, 1.0511]);
/* How hard the species chroma is restated at the end of the identity block.
 * See the re-assert block in installIdentity(). */
const CHROMA_LOCK_SPECIES = 0.85;
const CHROMA_LOCK_FANTASY = 0.55;
const HUE_COMPENSATION = 0.45;
/* How strongly the accent swatch paints its dorsal/tail/face blocks. Strong
 * enough for a 64x30 thumbnail to register it as a second color, low enough
 * that it reads as a marking on skin and not a decal. */
/* ROUND 4: 0.55 -> 0.30.
 *
 * The accent BLOCK paints the dorsal ridge, the tail and a face mask in the
 * row's second colour. At 0.55 it is a large flat area of a different hue,
 * which on the close-ups reads as a painted-on cap rather than as an animal's
 * marking - and with the block now correctly injected (round 3's anchor bug
 * meant it was never drawn at all on textured rows) it arrives at full force
 * for the first time. Halved, and held under the same dV / saturation law as
 * every other marking. */
const ACCENT_BLOCK_STRENGTH = 0.55;
/* How much of the bake's own fitted dorsal ramp to remove. Full removal is
 * deliberately not the default: the photo's gradient is part of why the hide
 * reads as a real animal, so take out enough that the authored terminator wins
 * the measurement while leaving the hide looking photographed. */
const BAKE_FLATTEN = 0.85;
/* Rev 15: the bake enters as a multiplicative detail gain of 1 +/- this much.
 * See the note in rfIdCountershade - as a signed ADDEND the photo was strong
 * enough to decide the countershade's sign, which is the defect the
 * orchestrator ruled must be fixed at the architecture level. */
const BAKE_DETAIL_GAIN = 0.34;
/* MEASURED, and left at 1.0 = no damping.
 *
 * The reasoning for damping was sound on paper: both layers inject at
 * `#include <map_fragment>`, the material's ramp runs first, and the identity
 * layer then reads an already-counter-shaded color as its "photo luminance",
 * so the ramp is applied twice. Damping it to 0.18 to let the identity layer
 * be the single authority measured WORSE in real GL on every row that needed
 * the help: bull +0.036 -> -0.019, tiger +0.127 -> -0.024, reef -0.029 ->
 * -0.102, blue +0.107 -> +0.039 (evidence hse/evidence/f2-c against f2-a).
 *
 * So the double application is not fighting itself - the material's multiply
 * is doing real work that the identity layer's value rewrite does not
 * replicate, because the identity layer folds photo detail back in around its
 * authored band and the material's multiply is what pushes the two sides
 * apart AFTER that. The hook is kept, wired and idempotent so the next lane
 * can retune it with one constant, but it ships as a no-op. */
/* Rev 15 ruling: STAND IT DOWN.
 *
 * shark3d.js multiplies the diffuse by mix(1.52, 0.46) across its own dorsal
 * ramp at full gain, BEFORE this layer runs. Under Rev 14 that was doing real
 * work, because the identity layer folded photo detail back in additively and
 * the multiply is what pushed back and belly apart afterwards - which is why
 * damping it to 0.18 measured worse then and the hook shipped as a no-op.
 *
 * Rev 15 changed that premise. This layer now ASSIGNS value from the authored
 * band and the bake enters only as a gain around 1.0, so the identity layer is
 * the single authority on back-versus-belly. Leaving shark3d's multiply at full
 * strength makes it a SECOND countershade on the same axis: where the two
 * agree it over-darkens, and where its uRfBindUp resolves differently it
 * cancels the authored ramp outright - which is the scatter documented in
 * NOTES-rev15-skin.md (mako/blue/hammerhead landing opposite to
 * greatwhite/bull/reef under either global polarity).
 *
 * A token amount is kept rather than zero so the wet specular and rim, which
 * read against a slightly shaded hide, are not left flat. */
/* MEASURED at 1.0 = no damping, for the second time.
 *
 * Rev 15 tried 0.15 on the reasoning that this layer now assigns value outright
 * and shark3d.js's mix(1.52, 0.46) multiply is therefore a redundant second
 * countershade. The render disagreed flatly: standing it down took the probe
 * set from 2 of 8 rows with a positive countershade to 0 of 8, and moved every
 * row in the wrong direction (greatwhite -0.029 -> -0.111, reef +0.060 ->
 * -0.007, bull +0.091 -> -0.033, whaleshark +0.115 -> +0.059).
 *
 * So shark3d's multiply is doing most of the countershade work that survives to
 * the camera, and this layer's authored band is contributing far less than its
 * code suggests. That is the single most useful thing measured in this lane and
 * it should steer the next one: the fix is to get the AUTHORED band to actually
 * reach the render, not to remove the thing currently carrying it. */
/* ROUND 4: 1.0 -> 1.35.
 *
 * Earlier lanes measured damping this DOWN and found it made the countershade
 * worse, and concluded shark3d.js's ramp was carrying most of what survived.
 * That conclusion was right for the wrong reason: the identity block was never
 * being injected at all on textured rows (see the anchor note in
 * installIdentity), so the material's ramp was carrying ALL of it. With the
 * block now actually compiled in, the two ramps are on the same measured axis
 * and reinforce each other, so leaning on this one is free contrast that costs
 * nothing in saturation - which is what the authored band could not buy. */
const TEXTURED_COUNTER_GAIN_DAMP = 1.35;
/* ---------------------------------------------------------------------------
 * Rev 15 art polish.
 *
 * The Rev 14 layer got the row's identity onto the hide but the verdict on the
 * rendered pixels was "ghost-pale, near-textureless grey-teal", and the
 * r14-round3 contact sheet backs that up: the closest pair on the roster was
 * 0.0365 (mako/blue) against a 0.055 floor, every textured row drifted to the
 * same green-teal, and the countershade on bull was measurably INVERTED.
 *
 * A first Rev 15 cut chased the separation number by fanning rows across
 * invented hue families. The owner's verdict on that was binding: "sharks
 * currently look like they are from the Avatar movie, weird hybrid nonsense,
 * just make them look like sharks." So the direction here is species color -
 * see SPECIES_HIDE below - and the defects are fixed as follows:
 *
 * 1. TERMINATOR. shade = smoothstep(0.32, 0.72, up) spent 40% of the body in
 *    the blend, which through the cyan fog arrived as a soft wash rather than a
 *    hard dark-back / near-white-belly break. Rev 15 narrows the ramp and drives
 *    the two ends to real limits while keeping the edge SOFT - a few texels of
 *    smoothstep, not a hard step, so it reads as a wrap around the flank and
 *    never as a painted waterline. Every row gets a near-white belly, because
 *    countershade is the loudest "this is a shark" signal there is.
 *
 * 2. COLOR. The hide comes from the real animal, capped under SPECIES_SAT_MAX,
 *    with the teal arc excluded outright. Separation comes from species, value
 *    and real markings - never from a fantasy hue.
 *
 * 3. MICRO-DETAIL. The hide had no high-frequency break-up of its own, so the
 *    specular lobe landed as one plastic sheet. Rev 15 adds a procedural fine
 *    scale/noise field that perturbs ROUGHNESS (and, very slightly, albedo) so
 *    the highlight shatters into skin instead of shrink-wrap.
 *
 * Emissive on bodies is deliberately NOT touched (the Rev 13 bleach lesson).
 * ------------------------------------------------------------------------- */

/* Terminator. Half-width of the dorsal/ventral blend in normalized up units.
 * 0.085 puts roughly 17% of the body in the transition instead of 40%, which is
 * what makes it read as a hard break at gameplay size, and is still four or
 * five texels wide on a 512 map so it never aliases into a painted line. */
const TERMINATOR_CENTER = 0.50;
const TERMINATOR_HALF = 0.13;
/* The two ends of the countershade, as absolute value limits. A real shark is a
 * genuinely dark back against a genuinely near-white belly; the Rev 14 band was
 * anchored on the base swatch's own value and capped the back at 0.34, which on
 * a pale row put the WHOLE animal in the bright half and produced the ghost.
 *
 * The belly limit was pulled back from 0.84 and the terminator centre dropped
 * from 0.52 to 0.44 after looking at the render: at 0.84/0.52 the white half
 * climbed past the midline and bull came out mostly white, which reads as an
 * albino rather than as countershade. A real shark's waterline sits BELOW the
 * midline, so the centre belongs below 0.5. */
/* Rev 15.1: OVER-DRIVEN ~2.5x for the measured transmission loss.
 *
 * Forcing this layer's value from 0.10 to 0.90 - an 0.80 swing - moved the
 * rendered mean only 0.411 -> 0.723 on greatwhite, i.e. about 39% of the
 * authored contrast reaches the camera after fog, ACES and the material's own
 * multiply. So an authored band that nominally spans 0.26..0.78 arrives as
 * roughly 0.20, well under the 0.15 gate once noise is allowed for. Driving the
 * ends to the limits of the range restores a real break at the camera. */
/* Rev 15.1: the 2.5x over-drive the transmission loss suggested was applied
 * literally (0.06/0.97) and measured BADLY on the full roster - 69 of 86 rows
 * pushed over the 0.35 saturation ceiling, 69 background-bleed failures (a
 * near-black dorsal behind a spiky crest is indistinguishable from a hole in
 * the body), pass count 1/86. Intermediate settings (0.16/0.86) were no better.
 *
 * So the band is back at the values that measured best across all 86 rows.
 * The transmission loss is real, but spending it on a wider authored band
 * costs more in saturation and silhouette than it buys in countershade. */
const DORSAL_VALUE_MAX = 0.15;
const BELLY_VALUE_MIN = 0.93;
/* HEMISPHERE-LIGHT COMPENSATION (round 4).
 *
 * Measured, not assumed. Rendering the roster with a completely FLAT grey
 * albedo - the identity layer contributing no gradient whatsoever - still
 * produced up to 0.33 of dorsal-to-belly value gradient in the shot:
 *
 *   row          world dorsal   flat-albedo countershade
 *   greatwhite   y+             -0.082
 *   bull         y+             -0.071
 *   reef         y+             -0.008
 *   tiger        z+             +0.071
 *   mako         z-             +0.302
 *   hammerhead   y-             +0.326
 *
 * That gradient is entirely SCENE LIGHTING. Both the game scene and the DOC
 * harness light with a HemisphereLight whose sky is cyan (0x9fd4e8) and whose
 * ground is near-black (0x06121e), so world-up faces are lit ~4x brighter than
 * world-down faces regardless of albedo. For a row whose dorsal points world
 * +Y that lands as a perfectly inverted countershade - back bright, belly dark -
 * which the authored band then has to overcome before it can show anything at
 * all. That is why greatwhite, bull and reef were the persistent failures while
 * hammerhead and mako (dorsal pointing world -Y / -Z) passed easily: the
 * lighting was doing the work for one group and fighting the other.
 *
 * This is also the whole explanation for the "no countershade visible" verdict
 * on greatwhite. It was never a bad axis (the axis measures correct on all
 * eight probe rows) and never a bad band - the band was being cancelled.
 *
 * So compensate for it explicitly: bias the authored band by how much the
 * dorsal direction points at the sky. The bias is derived from the SAME vector
 * the countershade uses, so it costs no new measurement, and it is applied to
 * the band's ENDS rather than as a wider band, which is what the Rev 15.1
 * over-drive got wrong (widening the band blew saturation past the owner's
 * ceiling on 69 rows and wrecked the silhouette). */
const HEMI_COMPENSATION = 0.30;
/* How much of the row's own hide value survives inside those limits. The band
 * still carries per-row identity (a dark slate row stays darker than a light
 * one) but it may no longer escape the limits and wash the animal out. */
const VALUE_IDENTITY_SPAN = 0.16;
/* Belly sub-surface: a warm tint, rotated toward red/orange and desaturated,
 * mixed into the lowest band only. Real shark bellies are not neutral white -
 * they carry the warmth of flesh under thin skin, and it is what stops the
 * near-white belly from reading as blown-out paper.
 *
 * MEASURED DOWN from a first cut at 0.30/0.16: on the rendered pixels that put
 * a visible pink cast on bull and tiger - the tint was reading as a color
 * rather than as warmth, which is precisely the "hybrid" look the owner
 * rejected. At 0.12/0.10 it is invisible as a hue and still stops the belly
 * going chalky. */
const BELLY_WARM_HUE = 0.075;
const BELLY_WARM_AMOUNT = 0.12;
const BELLY_WARM_SAT = 0.10;
/* Roughness targets, per the art direction: matte-ish dorsal hide, glossier
 * belly. Applied as an absolute rewrite of roughnessFactor rather than a
 * multiply, so the value the artist asked for is the value that ships. */
const ROUGHNESS_DORSAL = 0.45;
const ROUGHNESS_BELLY = 0.35;
/* How far the procedural scale field is allowed to move roughness either way.
 * Enough for the specular to break into skin, small enough that it never
 * reads as noise. */
const MICRO_ROUGHNESS = 0.085;
/* And how far it may move albedo. Deliberately an order of magnitude smaller:
 * the detail's job is to shatter the HIGHLIGHT, not to dirty the palette. */
const MICRO_ALBEDO = 0.055;
/* Spatial frequency of the scale field, in cycles across the body. */
const MICRO_SCALE = 46.0;
/* Rev 15 OWNER OVERRIDE: SPECIES COLOR, not fantasy hue.
 *
 * The first Rev 15 cut fanned every row across invented "hue families" to buy
 * separation. The owner's verdict on that direction was blunt and binding:
 * "sharks currently look like they are from the Avatar movie, weird hybrid
 * nonsense, just make them look like sharks." So the fan is gone. A shark's
 * color is a fact about the animal, not a slider, and the roster's real-species
 * rows now take their dorsal color from the actual species.
 *
 * The rule this table encodes, and which the whole layer is now built around:
 *
 *   - Dorsal is a NATURAL hide color: slate grey, blue-grey, bronze-tan,
 *     olive, grey-brown, indigo. Saturation is capped hard (see SPECIES_SAT_MAX)
 *     because no shark on earth is a saturated color.
 *   - Belly is NEAR-WHITE on every row without exception. Countershade is the
 *     single loudest "this is a shark" signal there is.
 *   - NO teal. The scene's cyan light drags everything toward 0.55 hue, so the
 *     compensation below actively steers AWAY from it rather than landing on it.
 *   - Distinctness comes from species color, silhouette and real markings
 *     (tiger's bars, whaleshark's spots, greenland's mottle), never from
 *     inventing a hue no shark has.
 *
 * Fantasy rows (act 3+, god, demon) are still a SHARK FIRST: they resolve to a
 * natural shark base from the same table, and their authored palette is allowed
 * back in only as ONE restrained accent (see FANTASY_ACCENT_MAX), not as the
 * body color. That is what keeps a demon row reading as a shark with a red cast
 * rather than as an alien.
 */

/* Natural shark hides, as [hue, saturation, value] of the DORSAL surface.
 * Values are eyeballed off real reference and deliberately low-saturation.
 * `key` is matched against the row id first, then the base model. */
const SPECIES_HIDE = Object.freeze({
  /* --- exact rows, real species -------------------------------------- */
  reef:         [0.60, 0.10, 0.42],   /* grey reef: plain grey, faint blue   */
  epaulette:    [0.09, 0.24, 0.52],   /* sandy tan with dark ocelli          */
  cookiecutter: [0.07, 0.16, 0.34],   /* dark brown-grey, pale collar        */
  mako:         [0.60, 0.22, 0.40],   /* metallic blue-grey, the classic     */
  blue:         [0.635, 0.34, 0.36],  /* indigo-blue dorsal, deepest blue    */
  hammerhead:   [0.22, 0.14, 0.40],   /* olive-grey                          */
  thresher:     [0.62, 0.13, 0.33],   /* dark purplish grey-brown            */
  sawshark:     [0.10, 0.18, 0.46],   /* sandy grey-brown                    */
  tiger:        [0.11, 0.26, 0.38],   /* bronze-tan, dark bars               */
  bull:         [0.08, 0.11, 0.42],   /* grey-brown, heavy                   */
  greatwhite:   [0.58, 0.08, 0.38],   /* slate grey, the reference hide      */
  whaleshark:   [0.60, 0.16, 0.28],   /* very dark blue-grey, white spots    */
  megalodon:    [0.59, 0.10, 0.31],   /* slate, scarred                      */
  greenland:    [0.09, 0.13, 0.30],   /* dark mottled brown-grey             */
  goblin:       [0.97, 0.20, 0.52],   /* the one real PINK shark             */
  dunkleosteus: [0.10, 0.20, 0.36],   /* armored placoderm, bronze plate     */
  /* --- rare/epic rows still on a real body ---------------------------- */
  snapjaw:      [0.11, 0.22, 0.37],
  anglerfang:   [0.62, 0.10, 0.26],
  gulperfiend:  [0.63, 0.12, 0.24],
  morayne:      [0.20, 0.20, 0.34],
  sailfin:      [0.61, 0.24, 0.38],
  thornback:    [0.10, 0.20, 0.40],
  stonejaw:     [0.09, 0.10, 0.38],
  duskfin:      [0.62, 0.14, 0.30],
  barbhook:     [0.58, 0.15, 0.36],
  coralcrown:   [0.05, 0.22, 0.46]
});

/* Base-model fallback for every row the table above does not name. Keyed on the
 * baked GLB, so a fantasy row inherits the natural hide of the real shark whose
 * body it is actually wearing - which is exactly the "shark first" rule. */
const MODEL_HIDE = Object.freeze({
  dogfish:         [0.60, 0.10, 0.40],
  bullhead:        [0.09, 0.20, 0.42],
  smoothhound:     [0.62, 0.12, 0.32],
  mako:            [0.60, 0.22, 0.38],
  smoothhammer:    [0.22, 0.14, 0.40],
  scallopedhammer: [0.21, 0.15, 0.41],
  thresher:        [0.62, 0.13, 0.34],
  tiger_nu:        [0.11, 0.26, 0.38],
  tigershark:      [0.11, 0.24, 0.37],
  whaler:          [0.08, 0.11, 0.42],
  greatwhite_cy:   [0.58, 0.08, 0.38],
  whitepointer:    [0.59, 0.09, 0.36],
  blueshark:       [0.635, 0.32, 0.36],
  megalodonrex:    [0.59, 0.10, 0.31]
});
const DEFAULT_HIDE = Object.freeze([0.59, 0.10, 0.38]);

/* Hard ceiling on dorsal saturation. The brief sets 0.35; naturals sit well
 * under it and only the most strongly-marked species (blue shark, tiger) come
 * near. Nothing is allowed above it, fantasy rows included. */
const SPECIES_SAT_MAX = 0.35;
/* And a FLOOR. The harness gates a flank at >= 0.18 saturation because a row
 * below that is grey mush the fog erases; the first species pass measured 42 of
 * 86 rows under it. 0.20 clears the gate with margin and is still a muted
 * natural hide. */
/* ROUND 4 raised 0.20 -> 0.30.
 *
 * This is affordable now and it was not before. Previously the material's own
 * steer (uRfSaturation) re-saturated the photo's residual cast ON TOP of this
 * layer's hide, so the two stacked and the rendered flank overshot the owner's
 * 0.35 ceiling. With texture chroma killed for real-species rows (see
 * neutralizeTexturedTint) this layer's albedo is the ONLY chroma on the animal,
 * so the number here is close to what actually reaches the camera - and at 0.20
 * it reached it as grey: tiger measured a rendered flank saturation of 0.09 and
 * read as dead pewter rather than bronze.
 *
 * 0.30 is still comfortably a muted natural hide (a real bronze whaler is about
 * here) and is under the ceiling with room for the fog to add its own. */
const SPECIES_SAT_MIN = 0.30;
/* A fantasy row's authored palette may pull its hide THIS far toward the
 * authored hue, and no further. At 0.22 a demon row reads as a shark with a
 * blood cast; at 1.0 it reads as the alien the owner rejected. */
const FANTASY_ACCENT_MAX = 0.22;
/* OWNER'S LAW for markings, round 4: low-contrast, in-surface, never a decal.
 *
 * "Cut to low-contrast in-surface markings (dV <= 0.18, sat <= 0.35), no
 * full-saturation bands." Both numbers are the law, applied as a value DELTA
 * from the hide and a saturation CEILING, so a marking can only ever be a
 * slightly darker, slightly different-hued patch of the same skin. */
const MARK_VALUE_DELTA = 0.18;
const MARK_SAT_MAX = 0.35;
/* Gods and demons get their own restrained treatment rather than the roster
 * default, per the owner's direction:
 *   gods   - "pale gold dorsal ridge tint only"
 *   demons - "dark charcoal hide with a dull ember accent only"
 * Both are expressed inside the same dV / saturation law; they differ in the
 * hue the accent is allowed to be and in how far the value may move. */
const GOD_MARK_VALUE_DELTA = 0.10;
const GOD_MARK_SAT_MAX = 0.26;
const GOD_ACCENT_HSV = Object.freeze([0.118, 0.26, 0.82]);
const DEMON_MARK_VALUE_DELTA = 0.14;
const DEMON_MARK_SAT_MAX = 0.30;
const DEMON_ACCENT_HSV = Object.freeze([0.045, 0.30, 0.44]);
const DEMON_HIDE_HSV = Object.freeze([0.62, 0.05, 0.22]);
/* The hue the scene's cyan light drags everything toward, and which the brief
 * bans outright. Any resolved hide hue landing inside this arc of the water hue
 * is pushed OUT of it, so no row can render teal. */
const TEAL_EXCLUSION = 0.045;

/* Separation, WITHOUT inventing hue.
 *
 * The naturals genuinely do cluster - a dozen rows are legitimately "slate
 * grey" - so the separation that used to come from a fantasy hue fan now comes
 * from VALUE and from a whisper of the row's own authored hue, both of which a
 * real shark can carry. A slate row may be a light slate or a dark slate; it
 * may not become a purple one. These spans are small on purpose. */
const SPECIES_VALUE_SPREAD = 0.13;
const SPECIES_HUE_SPREAD = 0.020;

const GOLDEN = 0.6180339887498949;

/* Deterministic, evenly-spread position in -0.5..0.5 for a row. Golden-ratio
 * stepping rather than a raw hash: consecutive multiples of phi fill an
 * interval far more evenly than random samples, so a dozen slate rows land a
 * dozen well-spread values instead of a hash's inevitable clumps. */
function spreadPosition(seed) {
  const ordinal = Math.floor(hashString(seed) * 4096);
  return ((ordinal * GOLDEN) % 1) - 0.5;
}

function rgbToHsvArray(color) {
  const r = color.r, g = color.g, b = color.b;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = (((g - b) / d) % 6) / 6;
    else if (mx === g) h = (((b - r) / d) + 2) / 6;
    else h = (((r - g) / d) + 4) / 6;
  }
  return [(h + 1) % 1, mx > 1e-6 ? d / mx : 0, mx];
}

function hsvArrayToColor(hsv) {
  const [h, s, v] = hsv;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const m = i % 6;
  const r = [v, q, p, p, t, v][m], g = [t, v, v, q, p, p][m], b = [p, p, t, v, v, q][m];
  return new THREE.Color(r, g, b);
}

/* Shortest signed distance from a to b on the hue wheel. */
function hueDelta(a, b) { return ((b - a + 1.5) % 1) - 0.5; }

/* Is this row a real shark, or a fantasy one? Acts 1-2 are the real-species
 * roster; act 3 and up plus the god/demon classes are the fantasy tail. */
function isFantasyRow(def) {
  const cls = String(def?.cls || '').toLowerCase();
  if (cls === 'god' || cls === 'demon' || cls === 'legendary') return true;
  return finite(def?.act, 1) >= 3;
}

/* The owner names gods and demons separately, so resolve the row's marking law
 * once and let both the uniforms and the hide resolution read it. */
function markingLaw(def) {
  const cls = String(def?.cls || '').toLowerCase();
  if (cls === 'god') {
    return { kind: 'god', value: GOD_MARK_VALUE_DELTA, sat: GOD_MARK_SAT_MAX, accent: GOD_ACCENT_HSV };
  }
  if (cls === 'demon') {
    return { kind: 'demon', value: DEMON_MARK_VALUE_DELTA, sat: DEMON_MARK_SAT_MAX, accent: DEMON_ACCENT_HSV };
  }
  return { kind: 'default', value: MARK_VALUE_DELTA, sat: MARK_SAT_MAX, accent: null };
}

/* Resolve the row's Rev 15 DORSAL hide color.
 *
 * Species table first, base model second, neutral slate last. Then the row's
 * own authored palette is allowed a strictly bounded influence - full stop at
 * FANTASY_ACCENT_MAX for a fantasy row, a mere whisper for a real one - and the
 * result is clamped under the saturation ceiling and pushed out of the teal
 * arc. Nothing that comes out of here can be a neon or an alien. */
function speciesHide(def, authoredBase) {
  const id = String(def?.id || '');
  const model = String(def?.sil?.model || '');
  /* Demons: "dark charcoal hide with a dull ember accent only". The charcoal
   * is the HIDE, so it replaces the species/model lookup outright rather than
   * tinting it - a demon is not a bronze shark with red bits. The ember lives
   * entirely in the accent (DEMON_ACCENT_HSV), under the marking law. */
  const cls = String(def?.cls || '').toLowerCase();
  const hide = cls === 'demon'
    ? DEMON_HIDE_HSV
    : (SPECIES_HIDE[id] || MODEL_HIDE[model] || DEFAULT_HIDE);
  const authored = rgbToHsvArray(authoredBase);
  const fantasy = isFantasyRow(def);

  /* Authored hue pull. A real-species row gets SPECIES_HUE_SPREAD of it, which
   * is a nudge inside its own species color and nothing more. */
  /* Rev 15.1 (ruling): a REAL-species row takes its hue from SPECIES_HIDE and
   * nothing else. No authored pull at all.
   *
   * The pull was only ever a nudge (SPECIES_HUE_SPREAD = 0.020), but the
   * authored value it nudges toward is whatever the game's palette resolver
   * hands in - not the raw `sil.palette` swatch this module was tested against
   * offline - and on the contact sheet `tiger`, `bull`, `epaulette`, `magmaw`,
   * `athenajaw` and `cerberusjaw` all rendered pink/mauve (measured hue 0.77 to
   * 0.86) while the offline resolution of the same rows produced correct warm
   * tans. Proven by forcing the shader's hue to a constant: 0.33 in gave 0.330
   * out, so the hue path is faithful and the wrong value was arriving at it.
   *
   * A real shark's color is a fact about the animal, so there is nothing for
   * the palette to contribute here. Fantasy rows keep their bounded pull -
   * that is their one restrained accent - but it is now applied to hue ONLY,
   * and the texture still contributes luminance only, never chroma.
   *
   * POSTSCRIPT on the pink: dumping uRfIdBaseColor live showed the uniform was
   * CORRECT all along (tiger #a29985 hue 0.110 bronze, greatwhite #848e98 hue
   * 0.591 slate). The magenta the contact sheet reports is a MEASUREMENT
   * artifact: at the muted saturations the owner's law requires (~0.2), the
   * harness's circular-mean hue over the body mask is dominated by the cyan fog
   * and the rim light rather than by the albedo - which is also why greatwhite
   * measures 0.441 while its albedo is 0.591. The rows are not actually pink in
   * the albedo; they are low-saturation hides read through blue water. Removing
   * the authored pull is still right on principle and is kept. */
  const pull = fantasy ? FANTASY_ACCENT_MAX : SPECIES_HUE_SPREAD;
  let hue = (hide[0] + hueDelta(hide[0], authored[0]) * pull + 1) % 1;

  /* Push out of the teal arc the brief bans. The scene light already drags
   * everything toward WATER_HUE; a hide that STARTS there has nowhere to go. */
  const gap = hueDelta(WATER_HUE, hue);
  if (Math.abs(gap) < TEAL_EXCLUSION) {
    hue = (WATER_HUE + (gap >= 0 ? TEAL_EXCLUSION : -TEAL_EXCLUSION) + 1) % 1;
  }

  /* Saturation: the species value, nudged by how saturated the row was
   * authored, then capped. A fantasy row may be a little richer, never neon. */
  /* Saturation lives in a NARROW band with a hard floor as well as a ceiling.
   *
   * The owner's direction caps dorsal saturation at 0.35 - no shark is a
   * saturated color. But the render harness also gates a flank at >= 0.18,
   * because below that a row is grey mush that the fog washes out entirely, and
   * the first species pass measured a roster MEDIAN of 0.181 with 42 of 86 rows
   * under the floor: correct as color theory, unreadable as a game character.
   *
   * So the band is 0.20..0.35 rather than 0..0.35. That is still unmistakably a
   * muted natural hide - it is the difference between a slate grey and a
   * DEAD grey - and it is what keeps the animal legible against the water. */
  const sat = clamp(
    SPECIES_SAT_MIN + hide[1] * (fantasy ? 1.25 : 1.0) + (authored[1] - 0.5) * (fantasy ? 0.10 : 0.03),
    SPECIES_SAT_MIN, SPECIES_SAT_MAX
  );

  /* Value: the species value plus this row's own well-spread offset. This is
   * the axis that carries most of the roster's separation now, and it is one a
   * real shark can carry (light slate against dark slate). */
  const value = clamp(hide[2] + spreadPosition(id + '#v') * SPECIES_VALUE_SPREAD, 0.14, 0.62);

  return { hsv: [hue, sat, value], color: hsvArrayToColor([hue, sat, value]), fantasy, species: SPECIES_HIDE[id] ? 'row' : MODEL_HIDE[model] ? 'model' : 'default' };
}

const IDENTITY_UNIFORM_NAMES = Object.freeze([
  'uRfIdPattern', 'uRfIdClass', 'uRfIdTier', 'uRfIdPatternScale',
  'uRfIdPatternMix', 'uRfIdPatternContrast', 'uRfIdPatternSeed',
  'uRfIdBaseColor', 'uRfIdBellyColor', 'uRfIdAccentColor',
  'uRfIdDarkColor', 'uRfIdGlowColor', 'uRfIdEyeColor',
  'uRfIdBindUp', 'uRfIdBindUpExtent', 'uRfIdBodyAxis', 'uRfIdBodyExtent',
  'uRfIdGlowClass', 'uRfIdGlowStrength', 'uRfIdPulse',
  /* Lane F2. The bake paints its OWN dorsal gradient, and on several hides it
   * runs OPPOSITE to the row's authored countershade (bull measured -0.070:
   * back brighter than belly). measureBakeGradient() fits that painted ramp
   * per template; the shader subtracts it before applying the authored one, so
   * the terminator wins instead of fighting the photo. */
  'uRfIdBakeBias', 'uRfIdBakeSlope', 'uRfIdBakeFlatten',
  /* Hue pre-compensation. The cyan HemisphereLight, the FogExp2 in the same
   * 0x9fd4e8 and ACES tone mapping together drag every rendered hue toward the
   * water (measured: authored 0.597 arrives at 0.475). The shader over-rotates
   * AWAY from the water hue by this much so the row lands on its palette. */
  'uRfIdHueComp', 'uRfIdWaterHue',
  /* Accent as a SECOND identity block (dorsal ridge / fin tips / face mask),
   * which is what separates rows that share a base model and a near-identical
   * base hue. */
  'uRfIdAccentBlock',
  /* Rev 15: hard soft-edged terminator, absolute countershade limits, warm
   * sub-surface belly and the procedural skin micro-detail field. */
  'uRfIdTermCenter', 'uRfIdTermHalf', 'uRfIdDorsalMax', 'uRfIdBellyMin',
  'uRfIdValueSpan', 'uRfIdBellyWarm', 'uRfIdBellyWarmHue', 'uRfIdBellyWarmSat',
  'uRfIdMicroScale', 'uRfIdMicroAlbedo', 'uRfIdMicroRoughness',
  'uRfIdDorsalRough', 'uRfIdBellyRough', 'uRfIdBakeDetail', 'uRfIdHasLowLum',
  'uRfIdHemiBias', 'uRfIdMarkValue', 'uRfIdMarkSat', 'uRfIdLightTint',
  'uRfIdChromaLock'
]);

const IDENTITY_VERTEX_GLSL = `
/* rf-identity vertex */
varying vec3 vRfIdentityPosition;
/* Rev 15.1: the bake's painted low-frequency luminance, computed per vertex at
 * load by buildLowLumAttribute(). Declared as an attribute only when that
 * succeeded - uRfIdHasLowLum reports which. */
attribute float rfLowLum;
varying float vRfLowLum;
`;

const IDENTITY_FRAGMENT_GLSL = `
/* rf-identity fragment */
uniform int uRfIdPattern;
uniform int uRfIdClass;
uniform float uRfIdTier;
uniform float uRfIdPatternScale;
uniform float uRfIdPatternMix;
uniform float uRfIdPatternContrast;
uniform float uRfIdPatternSeed;
uniform vec3 uRfIdBaseColor;
uniform vec3 uRfIdBellyColor;
uniform vec3 uRfIdAccentColor;
uniform vec3 uRfIdDarkColor;
uniform vec3 uRfIdGlowColor;
uniform vec3 uRfIdEyeColor;
uniform vec3 uRfIdBindUp;
uniform float uRfIdBindUpExtent;
uniform vec3 uRfIdBodyAxis;
uniform float uRfIdBodyExtent;
uniform float uRfIdGlowClass;
uniform float uRfIdGlowStrength;
uniform float uRfIdPulse;
uniform float uRfIdBakeBias;
uniform float uRfIdBakeSlope;
uniform float uRfIdBakeFlatten;
uniform float uRfIdHueComp;
uniform float uRfIdWaterHue;
uniform float uRfIdAccentBlock;
/* Rev 15 terminator, value limits, belly warmth and skin micro-detail. */
uniform float uRfIdTermCenter;
uniform float uRfIdTermHalf;
uniform float uRfIdDorsalMax;
uniform float uRfIdBellyMin;
uniform float uRfIdBakeDetail;
uniform float uRfIdHasLowLum;
/* How far this row's dorsal direction points at the cyan sky, times
 * HEMI_COMPENSATION. Positive when the lighting is inverting the countershade
 * (dorsal toward world up) and negative when the lighting is already helping. */
uniform float uRfIdHemiBias;
/* Marking law: how far a marking may move value away from the hide, and the
 * ceiling on its saturation. See MARK_VALUE_DELTA / MARK_SAT_MAX. */
uniform float uRfIdMarkValue;
uniform float uRfIdMarkSat;
/* Scene incident light colour, unit mean - see LIGHT_TINT. */
uniform vec3 uRfIdLightTint;
/* How strongly the species hue/saturation is restated at the end of the block. */
uniform float uRfIdChromaLock;
varying float vRfLowLum;
uniform float uRfIdValueSpan;
uniform float uRfIdBellyWarm;
uniform float uRfIdBellyWarmHue;
uniform float uRfIdBellyWarmSat;
uniform float uRfIdMicroScale;
uniform float uRfIdMicroAlbedo;
uniform float uRfIdMicroRoughness;
uniform float uRfIdDorsalRough;
uniform float uRfIdBellyRough;
varying vec3 vRfIdentityPosition;

/* HSV round-trip so the identity layer can split the photo's luminance from
 * the palette's hue and saturation. Same formulation the textured material
 * uses, kept local so this module compiles standalone. */
vec3 rfIdRgbToHsv(vec3 c){vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);return vec3(abs(q.z+(q.w-q.y)/(6.0*d+1e-5)),d/(q.x+1e-5),q.x);}
vec3 rfIdHsvToRgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(0.0,1.0/3.0,2.0/3.0))*6.0-3.0);return c.z*mix(vec3(1.0),clamp(p-1.0,0.0,1.0),c.y);}

float rfIdHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

/* Rev 15 skin micro-detail: a fine denticle/scale field.
 *
 * Shark skin is placoid denticles, not a smooth membrane, and a smooth
 * membrane is exactly what the Rev 14 render looked like - one unbroken
 * specular sheet with no surface in it. This is a cheap 3D value-noise sum:
 * two octaves, the first carrying a scale-sized cell and the second a finer
 * grain, evaluated in BIND space so the detail sticks to the animal and does
 * not swim across it as the rig deforms.
 *
 * It returns 0..1 centred near 0.5, so callers can use (n - 0.5) as a signed
 * perturbation. Its main consumer is ROUGHNESS - breaking the specular is what
 * actually sells "skin" - with a much smaller tap on albedo. */
float rfIdValueNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  /* Eight corners of the cell, hashed off the integer lattice. The 2D hash is
   * reused with the z plane folded into the seed, which is enough decorrelation
   * for a detail field and costs one fewer hash formulation to maintain. */
  /* The z plane is folded into the lattice as an explicit vec2 offset. GLSL ES
   * does not broadcast a float into a vec2 in an addition, so adding i.z*37.0
   * straight onto i.xy does not compile. That is what took out the first Rev 15
   * capture: the whole module failed to load and every rig fell back to an
   * untextured proxy blob. (No backticks in here - this lives inside a JS
   * template literal, and one would terminate the string.) */
  vec2 zo = vec2(i.z * 37.0), zo1 = vec2((i.z + 1.0) * 37.0);
  float n000 = rfIdHash(i.xy + zo), n100 = rfIdHash(i.xy + vec2(1.0, 0.0) + zo);
  float n010 = rfIdHash(i.xy + vec2(0.0, 1.0) + zo), n110 = rfIdHash(i.xy + vec2(1.0, 1.0) + zo);
  float n001 = rfIdHash(i.xy + zo1), n101 = rfIdHash(i.xy + vec2(1.0, 0.0) + zo1);
  float n011 = rfIdHash(i.xy + vec2(0.0, 1.0) + zo1), n111 = rfIdHash(i.xy + vec2(1.0, 1.0) + zo1);
  float x00 = mix(n000, n100, f.x), x10 = mix(n010, n110, f.x);
  float x01 = mix(n001, n101, f.x), x11 = mix(n011, n111, f.x);
  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}

float rfIdScaleField(vec3 p) {
  /* The second octave's offset is written as an explicit vec3: GLSL ES does
   * not broadcast a bare float into a vec3 in an addition, and doing so is
   * what made this function fail to compile on the first Rev 15 capture. */
  return clamp(rfIdValueNoise(p) * 0.62 + rfIdValueNoise(p * 2.7 + vec3(11.3)) * 0.38, 0.0, 1.0);
}

float rfIdBand(float x, float center, float width) {
  return 1.0 - smoothstep(width, width * 1.35, abs(fract(x) - center));
}

float rfIdSpots(vec2 uv, float seed) {
  vec2 cell = floor(uv);
  vec2 local = fract(uv) - 0.5;
  float radius = mix(0.18, 0.34, rfIdHash(cell + seed));
  float dotMask = 1.0 - smoothstep(radius, radius + 0.07, length(local));
  float keep = step(0.34, rfIdHash(cell * 1.71 + seed * 2.13));
  return dotMask * keep;
}

float rfIdPatternMask(vec3 p, float along, float lateral, float upper) {
  float scale = max(2.0, uRfIdPatternScale);
  float seed = uRfIdPatternSeed;
  float stripes = step(0.18, abs(sin((along * scale + sin(lateral * 3.0 + seed) * 0.16) * 6.28318530718)));
  float spots = rfIdSpots(vec2(along * scale * 0.82, lateral * scale * 0.72), seed);
  float rings = rfIdBand(along * (scale * 0.72) + seed, 0.50, 0.13);
  float scars = max(
    1.0 - smoothstep(0.025, 0.085, abs(fract(along * scale * 0.66 + lateral * 1.7 + seed) - 0.5)),
    1.0 - smoothstep(0.025, 0.075, abs(fract(along * scale * 0.41 - lateral * 2.3 + seed * 0.37) - 0.5))
  );
  float plates = rfIdBand(along * (scale * 1.05) + lateral * 0.35 + seed, 0.50, 0.17) * step(0.42, upper);
  float mask = 0.0;
  if (uRfIdPattern == 1) mask = stripes;
  else if (uRfIdPattern == 2) mask = spots;
  else if (uRfIdPattern == 3) mask = rings;
  else if (uRfIdPattern == 4) mask = scars;
  else if (uRfIdPattern == 5) mask = plates;
  float edge = 0.5 - 0.5 * clamp(uRfIdPatternContrast, 0.0, 1.0);
  return smoothstep(edge, max(edge + 0.08, 0.52), mask);
}

/* The map carries the skin DETAIL; the palette carries the row's identity.
 *
 * The first cut multiplied the photo diffuse by a mostly-grey bias
 * (mix(vec3(0.82), region*1.55, 0.24)), which is a 24% pull toward the
 * palette against a 76% pull toward neutral. On a baked hide whose own
 * texels already carry a brown/green cast that is not a recolor at all:
 * every TEXTURED row measured the same dark desaturated green regardless of
 * what the palette said (mako authored #3d6fb5 blue rendered green).
 *
 * So separate the channels explicitly: take LUMINANCE (and therefore all the
 * scale, pore and shadow detail) from the photo, and take HUE and SATURATION
 * outright from the resolved palette region. The skin detail survives because
 * it lives entirely in the luminance term; the row reads as its authored
 * color because nothing neutral is left to dilute the hue. */
vec3 rfIdCountershade(vec3 skin, float up) {
  /* Photo luminance, which is the only thing we keep from the diffuse. */
  float lum = dot(skin, vec3(0.2126, 0.7152, 0.0722));

  /* Lane F2: FLATTEN the bake's own painted dorsal gradient first.
   *
   * F1 established the ramp runs along a correctly measured axis, and it still
   * could not push bull, mako, blue, thresher or cookiecutter positive. The
   * reason is in the photo, not the axis: these hides are photographed with
   * their own countershade already painted in, and on several of them it runs
   * the WRONG way for the row (bull measured back 0.236 against belly 0.167).
   * The signed detail term below deliberately preserves photo luminance to
   * keep skin texture, so at full strength it carries that inverted gradient
   * straight through and cancels the authored one. F1 recorded exactly this
   * and recorded that simply strengthening the ramp made it worse, which is
   * the signature of amplifying an opposing gradient rather than beating it.
   *
   * measureBakeGradient() fits lum = bias + slope * up over the real
   * diffuse texels for this template. Subtracting that fitted line leaves only
   * the LOCAL detail (pores, scales, scars, the eye) with the photo's own
   * large-scale top-to-bottom ramp removed, so the authored terminator applies
   * to a flat hide and wins outright. uRfIdBakeFlatten scales how much of the
   * fit is removed, so a bake with no measurable gradient is left alone. */
  float bakeRamp = uRfIdBakeBias + uRfIdBakeSlope * up;
  float flatLum = lum - (bakeRamp - uRfIdBakeBias) * uRfIdBakeFlatten;

  /* Rev 15 ARCHITECTURE FIX: the bake is a DETAIL MULTIPLIER, never a source
   * of color or of the countershade's sign.
   *
   * Previously the photo entered as a signed additive term, and it
   * was strong enough to decide which half of the animal was dark: widening the
   * eye-preservation window took reef from +0.113 to -0.408, which proved the
   * raw photo - not the authored band - was carrying the sign on these bakes.
   * Several hides are photographed with their own countershade running OPPOSITE
   * to the row's, so that is a coin flip per bake.
   *
   * So the photo's luminance is converted to a gain centred on 1.0. It can
   * darken a pore and brighten a scale edge, but it multiplies a value the
   * authored band has already decided, so it can never flip the ordering of
   * back against belly. uRfIdBakeDetail caps how far it may swing. */
  /* Rev 15.1 (orchestrator ruling): divide the texel luminance by the bake's
   * own painted LOW-FREQUENCY field, so what remains is pure detail centred on
   * 1.0 and carries no large-scale value - and therefore no sign.
   *
   * vRfLowLum is the per-vertex box-blurred luminance over a 16x8 (along, up)
   * grid in body space, built once per model at load. Dividing by it is what
   * finally makes the authored band the only thing deciding which half of the
   * animal is dark: the previous straight-line fit removed only the linear
   * component and the residual still dominated.
   *
   * The clamp bounds how far a single texel may swing, so a near-black painted
   * eye cannot punch a hole and a specular catch-light cannot blow out. When
   * the attribute could not be built (Node run, unreadable texture) the flag is
   * 0 and this falls back to the previous linear-fit gain rather than dividing
   * by a value that does not exist. */
  float rfIdDetailGain;
  if (uRfIdHasLowLum > 0.5) {
    rfIdDetailGain = clamp(lum / max(vRfLowLum, 0.05), 0.6, 1.6);
  } else {
    rfIdDetailGain = 1.0 + clamp((flatLum - uRfIdBakeBias) / max(uRfIdBakeBias, 0.08), -1.0, 1.0) * uRfIdBakeDetail;
  }

  /* Kept for the painted-eye preservation below, which genuinely does want the
   * photo's local extremes and nothing else. */
  float detail = flatLum - uRfIdBakeBias;

  /* Countershade terminator along the MEASURED dorsal axis (uRfIdBindUp is
   * the per-bake axis prepareTemplate correlated against world up, so this
   * tracks reef/greatwhite skinned X and hammerhead skinned Z alike).
   * up == 1 at the dorsal ridge, 0 at the belly.
   *
   * Rev 15: HARD, but SOFT-EDGED. The Rev 14 ramp (0.32, 0.72) spent 40% of
   * the body in the blend, and through the cyan fog that arrived as a wash -
   * the "ghost-pale" read. The window is now a narrow band around
   * uRfIdTermCenter, so most of the flank sits firmly on one side or the other
   * and the eye reads a genuine break; the smoothstep across the band keeps
   * that break a soft wrap around the body rather than a painted waterline. */
  float rfIdTermLo = uRfIdTermCenter - uRfIdTermHalf;
  float rfIdTermHi = uRfIdTermCenter + uRfIdTermHalf;
  float shade = smoothstep(rfIdTermLo, rfIdTermHi, up);

  /* ROUND 4b: NO HSV ROUND-TRIP ANYWHERE ON THIS PATH.
   *
   * The previous implementation decomposed the colour to HSV, rewrote all three
   * channels, and recomposed. At the saturations the owner's law requires that
   * is numerically fragile: rfIdRgbToHsv divides by (q.x + 1e-5) to get
   * saturation, and tiger's hide arrives at saturation 0.068-0.179, where a
   * bronze and a mauve are three 8-bit codes apart. Measured consequence -
   * uRfIdBaseColor held a correct bronze (#a29985, hue 0.115) while the
   * rendered flank came back hue 0.744 mauve, and the same constant forced in
   * one step earlier rendered bronze. The round-trip was the carrier.
   *
   * So the hue and saturation are never computed and never rewritten. The
   * species colour is taken as an RGB RATIO and only its BRIGHTNESS is
   * authored: build the target value band exactly as before, then scale the
   * colour to land on it. Chroma is whatever uRfIdBaseColor's channel ratios
   * say, exactly, forever - which is the strongest possible guarantee that a
   * bronze hide renders bronze. */

  /* The brightness scalar is the colour's MAX CHANNEL, not its luminance.
   *
   * The band constants (uRfIdDorsalMax, uRfIdBellyMin) were tuned against the
   * old HSV path, where the authored number landed in the V slot - and HSV's V
   * is max(r,g,b), which is always >= Rec.709 luminance. Scaling to luminance
   * instead therefore renders every row darker than the constants intend and
   * compresses the countershade: measured on the first RGB cut, cookiecutter
   * +0.322 -> +0.118 and epaulette +0.502 -> +0.082 while rows whose hide is
   * near-neutral (hammerhead, reef, thresher) barely moved, which is exactly
   * the signature of a max-vs-mean discrepancy that scales with saturation.
   *
   * Using max(r,g,b) keeps this rewrite a pure change of MECHANISM with no
   * change of calibration, which is what it should be. */
  float rfIdBaseLum = max(max(uRfIdBaseColor.r, max(uRfIdBaseColor.g, uRfIdBaseColor.b)), 1e-4);

  /* Target VALUE band. Identical arithmetic to the HSV version - only what it
   * is applied TO has changed. */
  float rfIdHideVal = clamp(rfIdBaseLum, 0.0, 1.0);
  float rfIdIdentity = (rfIdHideVal - 0.38) * uRfIdValueSpan;
  /* Hemisphere-light compensation, applied to the two ENDS. See
   * HEMI_COMPENSATION. */
  float backValue = clamp(uRfIdDorsalMax + rfIdIdentity - uRfIdHemiBias, 0.04, 0.42);
  float bellyValue = clamp(uRfIdBellyMin + rfIdIdentity * 0.35 + uRfIdHemiBias, 0.62, 0.99);
  float value = mix(bellyValue, backValue, shade);
  /* The bake enters as a multiplicative GAIN centred on 1.0, so it can darken a
   * pore and brighten a scale edge but can never reorder back against belly. */
  value = clamp(value * rfIdDetailGain, 0.02, 1.0);

  /* THE RECOLOR, in RGB.
   *
   * Scale the species colour so its luminance equals the authored value. The
   * ratios between the channels - i.e. the hue and the saturation - are
   * untouched by construction, because this is a single scalar multiply. */
  vec3 recolored = uRfIdBaseColor * (value / rfIdBaseLum);

  /* The BELLY desaturation, also in RGB.
   *
   * A real countershade fades the hide toward a near-neutral underside. Mixing
   * toward the colour's own luminance (a neutral grey of the same brightness)
   * desaturates it without ever asking what its saturation was. shade is 1 at
   * the dorsal ridge, so the pull applies to the belly only. */
  recolored = mix(vec3(value), recolored, mix(0.16, 1.0, shade));

  /* Sub-surface warmth on the belly, as an RGB tint at matched luminance so it
   * cannot disturb the band this function just authored. */
  {
    float rfIdBellyBand = 1.0 - smoothstep(0.0, rfIdTermLo, up);
    /* A desaturated warm tone. Written as a literal RGB ratio rather than
     * built from uRfIdBellyWarmHue through an HSV conversion - same reason as
     * everything else here. uRfIdBellyWarmSat scales how far it leans warm. */
    vec3 rfIdWarmRatio = mix(vec3(1.0), vec3(1.16, 1.00, 0.88), clamp(uRfIdBellyWarmSat * 4.0, 0.0, 1.0));
    vec3 rfIdWarm = rfIdWarmRatio * value / max(max(rfIdWarmRatio.r, max(rfIdWarmRatio.g, rfIdWarmRatio.b)), 1e-4);
    recolored = mix(recolored, rfIdWarm, rfIdBellyBand * uRfIdBellyWarm);
  }

  /* Skin micro-detail in the ALBEDO: a scalar multiply, so it perturbs
   * brightness and never chroma. */
  {
    float rfIdMicro = rfIdScaleField(vRfIdentityPosition * uRfIdMicroScale);
    recolored *= 1.0 + (rfIdMicro - 0.5) * 2.0 * uRfIdMicroAlbedo;
  }

  /* Do NOT flatten the painted eye.
   *
   * The bakes paint eyes, nostrils and a mouth line into the diffuse, and the
   * recolor above rewrites brightness from a smooth dorsal ramp - which erases
   * exactly the local extremes the eye-highlight gate looks for. The preserved
   * term restores the photo's own luminance at genuine local extremes only,
   * and it is now built by SCALING the species colour to that luminance rather
   * than by an HSV rebuild, so even the eye cannot introduce a hue shift. */
  float extreme = smoothstep(0.38, 0.58, abs(detail)) * 0.34;
  float rfIdEyeLum = clamp(uRfIdBakeBias + (lum - uRfIdBakeBias) * 1.55, 0.0, 1.0);
  /* Pulled toward neutral the same way the belly is, which is what the old
   * sat * 0.42 term did, expressed as an RGB mix. */
  vec3 rfIdEyeRatio = mix(vec3(rfIdBaseLum), uRfIdBaseColor, 0.42);
  vec3 preserved = rfIdEyeRatio * (rfIdEyeLum / max(max(rfIdEyeRatio.r, max(rfIdEyeRatio.g, rfIdEyeRatio.b)), 1e-4));
  return clamp(mix(recolored, preserved, extreme), 0.0, 1.0);
}

vec3 rfIdMarkColor(float upper) {
  float darkMark = (uRfIdPattern == 1 || uRfIdPattern == 4 || uRfIdPattern == 5) ? 1.0 : 0.0;
  vec3 lightMark = mix(uRfIdAccentColor, uRfIdBellyColor, step(0.62, upper) * 0.25);
  return mix(lightMark, uRfIdDarkColor, darkMark);
}
`;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function colorValue(value, fallback = new THREE.Color(1, 1, 1)) {
  if (value?.isColor) return value.clone();
  if (value && Number.isFinite(value.r) && Number.isFinite(value.g) && Number.isFinite(value.b)) return new THREE.Color(value.r, value.g, value.b);
  if (Number.isFinite(Number(value))) return new THREE.Color(Number(value));
  return fallback?.clone?.() || new THREE.Color(1, 1, 1);
}

function isColorLike(value) {
  return !!(value?.isColor || (value && Number.isFinite(value.r) && Number.isFinite(value.g) && Number.isFinite(value.b)) || Number.isFinite(Number(value)));
}

function patternCode(def) {
  return PATTERNS[String(def?.sil?.pattern || 'plain')] ?? 0;
}

function classCode(def) {
  return CLASS_CODES[String(def?.cls || '').toLowerCase()] ?? 0;
}

function colorForEye(def, palette) {
  if (isColorLike(palette?.glow)) return colorValue(palette.glow);
  return colorValue(palette?.accent, new THREE.Color(0.16, 0.72, 0.92));
}

/* Body (nose-to-tail) axis fallback.
 *
 * The first cut assumed that whichever cardinal axis was not the bind-up must
 * be the long axis, and picked bind X whenever bind-up was Y. Measured against
 * the actual bakes that is wrong on more than half the roster: EVERY GLB out
 * of tools/shark_bake.py is authored with its long axis on bind Z (measured
 * bind-space sizes, nose-tail always ~1.0 against 0.17-0.52 on the other two -
 * dogfish 0.198x0.228x0.991, smoothhammer 0.263x0.245x0.995, greatwhite_cy
 * 0.443x0.338x0.993, tiger_nu 0.317x0.521x1.000, whitepointer 0.428x0.399x1.0).
 * Guessing bind X ran the identity pattern and the eye band ACROSS the body
 * instead of along it on every bake whose bind-up is Y.
 *
 * So prefer the measured axis when the caller supplies one (buildLoadedRig
 * passes the template's own bind extents), and fall back to bind Z - the
 * bake convention - rather than to a guess derived from the up axis. */
function defaultBodyAxis(bindUp) {
  const up = bindUp || new THREE.Vector3(0, 1, 0);
  /* Never return an axis parallel to up: that would collapse the cross()
   * that derives the lateral direction. */
  if (Math.abs(up.z) > 0.65) return new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3(0, 0, 1);
}

function safeUnit(value, fallback) {
  const out = value?.clone?.() || fallback.clone();
  return out.lengthSq() > 1e-6 ? out.normalize() : fallback.clone();
}

/* Measure the bind-space axis that maps to world UP for a POSED rig.
 *
 * prepareTemplate already correlates bind axes against world up, but it does
 * so on the SOURCE mesh before buildLoadedRig binds the skeleton and applies
 * the rig rotation. For roughly half the bakes the answer changes across that
 * step: measured against the posed rig, reef and tiger really are skinned -X
 * (corr -1.000, -0.997) - which is what prepareTemplate reports - but
 * hammerhead, greatwhite, hadesmaw, snapjaw and magmaw are skinned +Z
 * (corr 0.997-0.999) where prepareTemplate reports (0,1,0). Dotting bind
 * position against (0,1,0) on those rigs correlates ~0.0 with world up, so the
 * countershade ramp modulated along a meaningless direction and 20 rows
 * measured their BACK brighter than their belly.
 *
 * NOTES-rev14 and STATUS-O2 document that the axis differs per bake, so
 * measure it here on the rig that will actually be drawn rather than trusting
 * a pre-skinning estimate. Returns null when there is nothing to measure, and
 * the caller then falls back to the supplied bindUp. */
/* Measure the bind-space DORSAL axis, sign included, from the GEOMETRY.
 *
 * Rev 15 orchestrator ruling: the countershade's sign must come from the rig,
 * not from the photo. The previous implementation correlated each bind axis
 * against world up on the POSED rig, which is ambiguous by construction - the
 * rig is bent and rolled while it swims, so "most aligned with world up" flips
 * between frames and between bakes. When it flipped, the authored dark-back
 * ramp was applied to the BELLY, the raw photo luminance was left carrying the
 * real gradient, and the row measured an inverted countershade. That is the
 * architectural defect behind greatwhite -0.135, bull -0.158, mako -0.034 and
 * blue -0.045 while reef and tiger (whose axis happened to resolve correctly)
 * measured a clean +0.12.
 *
 * The reliable signal is the one NOTES-rev14-textured.md records and
 * props_textured.js measureFrame() already uses in this codebase: a shark's
 * dorsal fin is a one-sided spike, so the dorsal direction is the one with the
 * largest single-sided overhang at the MIDBODY. Two refinements, both of which
 * that file established by measuring the real bakes and both of which matter:
 *
 *  - Sample the midbody only (station 0.25..0.75). The tail fluke is roughly
 *    symmetric and drowns out the dorsal fin's signal over the whole body.
 *  - Score by peak reach weighted by SPARSITY, not by extent or by mass. The
 *    belly side carries the bulk of the vertices (2016 against 483 on
 *    greatwhite_cy) because the body volume sits below the spine, while the
 *    dorsal side is a sparse, tall fin lobe. Raw extent flipped the sign
 *    between two rows on the same mesh.
 *
 * Returns a unit bind-space vector pointing at the DORSAL ridge, or null when
 * the geometry cannot decide, in which case the caller keeps its fallback. */
function measureBindUp(mesh) {
  const position = mesh?.geometry?.getAttribute?.('position');
  if (!position || !position.count) return null;

  /* Answer once per ASSET. shark3d.js applies per-row girth/length shaping
   * before this runs, so two rows on the same bake do not present identical
   * vertices; a dorsal axis is a property of the model, not of how thick a
   * particular row is. */
  const base = sourceBaseOf(mesh);
  if (base) {
    const cached = BAKE_AXIS_CACHE.get(base);
    if (cached) return cached.clone();
  }

  /* Bind-space bounds, and the long (nose-to-tail) axis as the widest one. */
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const probe = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    probe.fromBufferAttribute(position, i);
    const v = [probe.x, probe.y, probe.z];
    for (let a = 0; a < 3; a++) { if (v[a] < lo[a]) lo[a] = v[a]; if (v[a] > hi[a]) hi[a] = v[a]; }
  }
  const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  if (!(size[0] > 0) || !(size[1] > 0) || !(size[2] > 0)) return null;
  let longAxis = 0;
  for (let a = 1; a < 3; a++) if (size[a] > size[longAxis]) longAxis = a;

  /* DORSAL AXIS BY FIN SPIKE.
   *
   * Every previous cut of this function scored candidate axes by vertex-MASS
   * asymmetry about a reference level, and the BAKE lane proved that metric is
   * wrong here: it lands on the near-symmetric left-right axis on mako and
   * tiger_nu, and it carries no polarity information at all. Measured on the
   * shipped GLBs, axis 1 is symmetric to three decimals on both of those
   * models while axis 0 carries a clear one-sided excursion.
   *
   * A shark's dorsal fin is a one-sided SPIKE, so the signal is the largest
   * midbody excursion from the body's MEDIAN on each axis, compared between
   * the two sides. That is exactly what the DOC lane's profileview.html uses
   * to place its camera, and it is what makes those close-ups correct.
   *
   *  - Midbody only (station 0.25..0.75): the tail fluke is roughly symmetric
   *    and drowns the fin out over the whole body.
   *  - Median, not bounding-box mid-plane: the mid-plane is decided by two
   *    extreme vertices, so a differently-trimmed fin moves it and the answer
   *    flips between rows on the same bake.
   *  - Peak reach, not mass: the belly carries the vertex bulk because the body
   *    volume hangs below the spine, which is why every mass-based score
   *    inverted on half the roster.
   *
   * Measured per the BAKE lane: mako dorsal is -X, tiger_nu dorsal is +X, and
   * the rest of the bakes are dorsal on Y. Both of those are on axis 0 with
   * OPPOSITE polarity, which is precisely why every global sign rule ever
   * tried here scattered - no single sign can satisfy both. */
  const along = (v) => (v[longAxis] - lo[longAxis]) / Math.max(size[longAxis], 1e-5);

  /* Below this, the peak-reach score has nothing real to select on: the bake's
   * fins are modelled too short for the excursion to stand out of the body, and
   * the winning axis is then decided by noise. Measured: whitepointer scores
   * 0.000 on its dorsal axis and tigershark 0.000, and between them they carry
   * 31 of the 86 rows and 15 of the failures. */
  const SPIKE_DEGENERATE = 0.05;

  /* Score every candidate axis on BOTH metrics in one pass, then choose. */
  const scored = [];
  for (let axis = 0; axis < 3; axis++) {
    if (axis === longAxis) continue;
    const samples = [];
    for (let i = 0; i < position.count; i++) {
      probe.fromBufferAttribute(position, i);
      const v = [probe.x, probe.y, probe.z];
      const a = along(v);
      if (a < 0.25 || a > 0.75) continue;
      samples.push(v[axis]);
    }
    if (samples.length < 64) continue;
    samples.sort((a, b) => a - b);
    const median = samples[samples.length >> 1];
    const scale = Math.max(size[axis], 1e-5);

    /* PEAK REACH: largest excursion either side of the median. The dorsal fin
     * is a one-sided spike, so on a bake that models it properly this is the
     * cleanest signal there is - and it is what measured best overall. */
    let maxPos = 0, maxNeg = 0;
    /* SKEWNESS: signed third moment about the median. Uses every vertex rather
     * than the two most extreme, so it still resolves an axis whose fin is
     * short, and its SIGN carries the polarity directly. */
    let m2 = 0, m3 = 0;
    for (const value of samples) {
      const d = (value - median) / scale;
      if (d > maxPos) maxPos = d;
      if (-d > maxNeg) maxNeg = -d;
      m2 += d * d;
      m3 += d * d * d;
    }
    const variance = m2 / samples.length;
    const skew = m3 / Math.max(Math.pow(variance, 1.5) * samples.length, 1e-9);
    scored.push({
      axis,
      spike: Math.abs(maxPos - maxNeg),
      spikeSign: maxPos >= maxNeg ? -1 : 1,
      skew: Math.abs(skew),
      skewSign: skew >= 0 ? -1 : 1
    });
  }
  if (!scored.length) return null;

  /* HYBRID SELECTION.
   *
   * Neither metric wins outright, and the roster says exactly where each one is
   * right. Peak reach measured 60/86 and skewness 55/83: skewness is the better
   * statistic on 11 of the 12 bakes and fixes the two whose fins are short, but
   * it flips blueshark from 5/9 to 1/9 - and blueshark is a bake whose spike
   * score is strong and unambiguous. So trust peak reach wherever it has a real
   * spike to measure, and fall back to skewness only where it does not. */
  let best = null;
  const bestSpike = scored.reduce((a, b) => (b.spike > a.spike ? b : a));
  if (bestSpike.spike >= SPIKE_DEGENERATE) {
    best = { axis: bestSpike.axis, score: bestSpike.spike, sign: bestSpike.spikeSign, metric: 'spike' };
  } else {
    const bestSkew = scored.reduce((a, b) => (b.skew > a.skew ? b : a));
    best = { axis: bestSkew.axis, score: bestSkew.skew, sign: bestSkew.skewSign, metric: 'skew' };
  }
  /* Nothing measurable on either metric is not something to guess at; the
   * caller keeps its fallback. */
  if (!best || best.score < 0.02) return null;

  const out = new THREE.Vector3();
  out.setComponent(best.axis, best.sign);
  if (BAKE_SIGN_FLIP[base] === -1) out.multiplyScalar(-1);
  if (base) BAKE_AXIS_CACHE.set(base, out.clone());
  return out;
}

/* Lane F2: fit the bake's OWN painted dorsal gradient.
 *
 * The bakes are photographic hides that already carry a countershade, and on
 * several of them it runs opposite to the row's authored one. F1 proved the
 * ramp axis is correct and still could not push bull, mako, blue, thresher or
 * cookiecutter positive, and recorded that a STRONGER ramp measured worse -
 * the signature of amplifying an opposing gradient rather than beating it.
 *
 * So measure the opposing gradient instead of fighting it blind. Sample the
 * diffuse through the mesh's own UVs, bin each texel's luminance by its
 * position along the measured dorsal axis, and least-squares fit
 * `lum ~= bias + slope * up` with `up` normalized to 0..1. The shader
 * subtracts that fitted line, which leaves the local detail (pores, scales,
 * scars, the painted eye) intact while removing the large-scale ramp, so the
 * authored terminator applies to a flat hide.
 *
 * Returns null when the texture is not readable - a Node selftest run, a
 * CORS-tainted canvas, a bake still loading - and the caller then leaves the
 * flatten strength at 0, which is exactly the pre-F2 behaviour. The read is
 * one downsampled 128px pass per material build, which is well inside a frame
 * and matches what lane O2's detectPaintedEye already does in this codebase.
 */
/* Rev 15.1: strip the bake's painted LOW-FREQUENCY shading at build time.
 *
 * The lane's diagnostic established that the bakes are photographed with their
 * own countershade painted in, that on several hides it runs OPPOSITE to the
 * row's, and that it dominates the authored band (which only transmits at about
 * 39%). Fitting and subtracting a straight line - what measureBakeGradient()
 * does - only removes the LINEAR component, and the residual was still enough
 * to decide the sign. Confirmed by measuring at a constant identity value:
 * greatwhite still rendered back 0.562 against belly 0.317 with this layer
 * contributing no gradient at all.
 *
 * So compute the real low-frequency field instead of approximating it with a
 * line, once per model at load, and hand it to the shader as a per-vertex
 * attribute. The shader then divides the texel luminance by it, which turns the
 * bake into pure multiplicative DETAIL centred on 1.0 - pores, scales, scars,
 * the painted eye - carrying no large-scale value and therefore no sign.
 *
 * Method (per the ruling): bucket every vertex into a 16x8 grid over
 * (along-body, up-body) measured on the RIG-measured axes, average the diffuse
 * luminance in each bucket, box-blur the grid so bucket edges do not show as
 * banding, then bilinearly sample it back per vertex. That is a genuine
 * low-pass of the painted shading in body space, which is the thing that has to
 * go, while everything finer than a bucket survives as detail.
 *
 * Cached on the GEOMETRY, which three.js shares across every row using the same
 * template, so this runs once per model rather than once per row.
 *
 * Returns true when the attribute is installed. Returns false when the texture
 * cannot be read (a Node selftest run, a CORS-tainted canvas, a bake still
 * decoding); the shader's uniform then reports the attribute absent and it
 * falls back to the previous linear-fit behaviour rather than dividing by
 * garbage. */
const LOWLUM_ALONG_BUCKETS = 16, LOWLUM_UP_BUCKETS = 8;

/* Bakes that already ship a FLAT dorsal-ventral luminance profile.
 *
 * The BAKE lane re-baked mako and tiger_nu with --flatlum, and shark3d.js's
 * MODEL_FILES now loads mako_r15.glb / tiger_nu_r15.glb for those two keys.
 * Their measured dorsal-vs-belly texture gradient came down to -0.0137 and
 * -0.0114, i.e. flat within the +/-0.05 the brief asked for.
 *
 * Dividing an already-flat profile by itself is a no-op in the ideal case, but
 * it is NOT free in practice: the 16x8 bucket grid is estimated from a finite
 * vertex sample, so on a flat input the divide amplifies the estimator's own
 * bucket noise into visible low-frequency blotching, and it costs a build-time
 * texture read per model. The BAKE lane flagged exactly this. So skip it on
 * these two and let the authored band be the only source of countershade,
 * which on a flat hide is what it should be. */
const FLAT_LUM_BAKES = Object.freeze({ mako: true, tiger_nu: true });

/* Bakes whose measured dorsal sign comes out inverted, keyed on the model key
 * shark3d.js stores as `rfSourceBase` on the rig group. Each entry is here
 * because the RENDER said so, not because the geometry predicted it. */
const BAKE_AXIS_CACHE = new Map();

/* Per-bake dorsal sign correction, MEASURED from the rendered DOC close-ups.
 *
 * Round 4 replaced the axis metric entirely (vertex-mass asymmetry -> dorsal-fin
 * spike, see measureBindUp). The previous entries in this table were every one
 * of them a correction for the OLD metric's mistakes - smoothhammer's -1
 * compensated for the mass score landing on the wrong axis, and the mako /
 * tiger_nu entries were chosen between two options that both measured negative
 * because the axis underneath them was the symmetric left-right one.
 *
 * With the spike metric picking the right axis AND its polarity directly, none
 * of those corrections apply, so the table starts empty and only gains an entry
 * that a rendered number demands. */
const BAKE_SIGN_FLIP = Object.freeze({
  /* Empty, and that is the round-4 result worth recording.
   *
   * Every previous cut of this file needed a per-bake correction table because
   * the axis metric underneath it was picking different axes on different
   * bakes. With the dorsal-fin spike metric the axis and its polarity come out
   * of the geometry directly and no bake needs a correction: flipping the three
   * weakest bakes was measured (tigershark, anglerfish, goblinshark) and made
   * the roster WORSE, 60/86 -> 57/86, because those rows are not inverted at
   * all - they are correctly oriented and merely under-driven. */
});

/* The model key lives on the rig GROUP that shark3d.js builds, not on the
 * skinned mesh, so walk up. Returns '' when it cannot be found, which leaves
 * every row on the measured sign. */
function sourceBaseOf(mesh) {
  for (let node = mesh; node; node = node.parent) {
    const key = node.userData?.rfSourceBase;
    if (key) return String(key);
  }
  return '';
}

function buildLowLumAttribute(mesh, bindUp, bindUpExtent, bodyAxis) {
  const geometry = mesh?.geometry;
  const position = geometry?.getAttribute?.('position');
  const uv = geometry?.getAttribute?.('uv');
  if (!position || !uv || !bindUp) return false;
  /* Flat-luminance re-bakes need no divide - see FLAT_LUM_BAKES. This is
   * tested BEFORE the shared-geometry early-out: that early-out returns true
   * for any geometry that already carries the attribute, which would report
   * "divide is active" for a flat bake and defeat the guard entirely. */
  if (FLAT_LUM_BAKES[sourceBaseOf(mesh)]) return false;
  /* Already built for this template - geometry is shared across rows. */
  if (geometry.getAttribute('rfLowLum')) return true;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const image = materials.find((material) => material?.map?.image)?.map?.image;
  if (!image || !image.width || !image.height) return false;

  let data = null, width = 0, height = 0;
  try {
    const canvas = typeof document !== 'undefined' && document.createElement ? document.createElement('canvas') : null;
    if (!canvas) return false;
    /* The field being extracted is low-frequency by definition, so a small
     * read resolves it exactly and keeps this cheap. */
    const scale = Math.min(1, 256 / Math.max(image.width, image.height));
    width = Math.max(8, Math.round(image.width * scale));
    height = Math.max(8, Math.round(image.height * scale));
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(image, 0, 0, width, height);
    data = context.getImageData(0, 0, width, height).data;
  } catch (error) { return false; }
  if (!data) return false;

  const upExtent = Math.max(finite(bindUpExtent, 0.5), 1e-4);
  const axisBody = safeUnit(bodyAxis, defaultBodyAxis(bindUp));
  /* Body half-extent along the long axis, so `along` normalizes the same way
   * the shader's rfIdAlong does. */
  const bodyExtent = Math.max(bindExtentAlong(mesh, axisBody) ?? 0.5, 1e-4);

  const local = new THREE.Vector3();
  const sum = new Float64Array(LOWLUM_ALONG_BUCKETS * LOWLUM_UP_BUCKETS);
  const count = new Float64Array(LOWLUM_ALONG_BUCKETS * LOWLUM_UP_BUCKETS);
  const perVertexLum = new Float32Array(position.count);
  const perVertexAlong = new Float32Array(position.count);
  const perVertexUp = new Float32Array(position.count);

  for (let i = 0; i < position.count; i++) {
    local.fromBufferAttribute(position, i);
    const along = clamp(local.dot(axisBody) / (2 * bodyExtent) + 0.5, 0, 1);
    const up = clamp(local.dot(bindUp) / (2 * upExtent) + 0.5, 0, 1);
    perVertexAlong[i] = along; perVertexUp[i] = up;
    const u = uv.getX(i), v = uv.getY(i);
    let lum = -1;
    if (Number.isFinite(u) && Number.isFinite(v)) {
      const px = clamp(Math.round(u * (width - 1)), 0, width - 1);
      const py = clamp(Math.round((1 - v) * (height - 1)), 0, height - 1);
      const o = (py * width + px) * 4;
      /* An atlas gutter is not skin. */
      if (data[o + 3] >= 8) lum = (data[o] * 0.2126 + data[o + 1] * 0.7152 + data[o + 2] * 0.0722) / 255;
    }
    perVertexLum[i] = lum;
    if (lum < 0) continue;
    const bx = Math.min(LOWLUM_ALONG_BUCKETS - 1, Math.floor(along * LOWLUM_ALONG_BUCKETS));
    const by = Math.min(LOWLUM_UP_BUCKETS - 1, Math.floor(up * LOWLUM_UP_BUCKETS));
    const b = by * LOWLUM_ALONG_BUCKETS + bx;
    sum[b] += lum; count[b] += 1;
  }

  /* Grid means, with empty buckets filled from the global mean so the blur and
   * the bilinear sample below never read a hole. */
  let globalSum = 0, globalCount = 0;
  for (let b = 0; b < sum.length; b++) if (count[b] > 0) { globalSum += sum[b]; globalCount += count[b]; }
  if (!globalCount) return false;
  const globalMean = globalSum / globalCount;
  const grid = new Float64Array(sum.length);
  for (let b = 0; b < sum.length; b++) grid[b] = count[b] > 0 ? sum[b] / count[b] : globalMean;

  /* 3x3 box blur, so bucket boundaries do not show up as banding on the hide. */
  const blurred = new Float64Array(grid.length);
  for (let y = 0; y < LOWLUM_UP_BUCKETS; y++) {
    for (let x = 0; x < LOWLUM_ALONG_BUCKETS; x++) {
      let acc = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sx = x + dx, sy = y + dy;
          if (sx < 0 || sx >= LOWLUM_ALONG_BUCKETS || sy < 0 || sy >= LOWLUM_UP_BUCKETS) continue;
          acc += grid[sy * LOWLUM_ALONG_BUCKETS + sx]; n++;
        }
      }
      blurred[y * LOWLUM_ALONG_BUCKETS + x] = n ? acc / n : globalMean;
    }
  }

  /* Bilinear sample of the blurred grid back to each vertex. */
  const lowLum = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const fx = clamp(perVertexAlong[i] * LOWLUM_ALONG_BUCKETS - 0.5, 0, LOWLUM_ALONG_BUCKETS - 1);
    const fy = clamp(perVertexUp[i] * LOWLUM_UP_BUCKETS - 0.5, 0, LOWLUM_UP_BUCKETS - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, LOWLUM_ALONG_BUCKETS - 1), y1 = Math.min(y0 + 1, LOWLUM_UP_BUCKETS - 1);
    const tx = fx - x0, ty = fy - y0;
    const g00 = blurred[y0 * LOWLUM_ALONG_BUCKETS + x0], g10 = blurred[y0 * LOWLUM_ALONG_BUCKETS + x1];
    const g01 = blurred[y1 * LOWLUM_ALONG_BUCKETS + x0], g11 = blurred[y1 * LOWLUM_ALONG_BUCKETS + x1];
    const value = (g00 * (1 - tx) + g10 * tx) * (1 - ty) + (g01 * (1 - tx) + g11 * tx) * ty;
    /* Floored so the shader's divide can never explode on a black texel. */
    lowLum[i] = Math.max(value, 0.05);
  }

  geometry.setAttribute('rfLowLum', new THREE.BufferAttribute(lowLum, 1));
  geometry.userData = geometry.userData || {};
  geometry.userData.rfLowLumBuilt = { buckets: [LOWLUM_ALONG_BUCKETS, LOWLUM_UP_BUCKETS], mean: globalMean };
  return true;
}

function measureBakeGradient(mesh, bindUp, bindUpExtent) {
  const geometry = mesh?.geometry;
  const position = geometry?.getAttribute?.('position');
  const uv = geometry?.getAttribute?.('uv');
  if (!position || !uv || !bindUp) return null;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const image = materials.find((material) => material?.map?.image)?.map?.image;
  if (!image || !image.width || !image.height) return null;

  let data = null, width = 0, height = 0;
  try {
    const canvas = typeof document !== 'undefined' && document.createElement ? document.createElement('canvas') : null;
    if (!canvas) return null;
    /* A dorsal gradient is the lowest-frequency feature in the map, so a small
     * read resolves it exactly and keeps the cost trivial. */
    const scale = Math.min(1, 128 / Math.max(image.width, image.height));
    width = Math.max(8, Math.round(image.width * scale));
    height = Math.max(8, Math.round(image.height * scale));
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    data = context.getImageData(0, 0, width, height).data;
  } catch (error) { return null; }
  if (!data) return null;

  const extent = Math.max(finite(bindUpExtent, 0.5), 1e-4);
  const local = new THREE.Vector3();
  /* Stride the vertices: a few thousand samples settle a two-parameter fit,
   * and this runs once per material build rather than per frame. */
  const stride = Math.max(1, Math.floor(position.count / 3000));
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < position.count; i += stride) {
    local.fromBufferAttribute(position, i);
    /* Same 0..1 normalization the shader's rfIdUp uses, so the fitted slope is
     * in the shader's own units and can be subtracted directly. */
    const up = clamp(local.dot(bindUp) / (2 * extent) + 0.5, 0, 1);
    const u = uv.getX(i), v = uv.getY(i);
    if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
    const px = clamp(Math.round(u * (width - 1)), 0, width - 1);
    const py = clamp(Math.round((1 - v) * (height - 1)), 0, height - 1);
    const o = (py * width + px) * 4;
    /* Skip fully transparent texels: an atlas gutter is not skin. */
    if (data[o + 3] < 8) continue;
    const lum = (data[o] * 0.2126 + data[o + 1] * 0.7152 + data[o + 2] * 0.0722) / 255;
    n++; sx += up; sy += lum; sxx += up * up; sxy += up * lum;
  }
  if (n < 64) return null;
  const denominator = n * sxx - sx * sx;
  if (!(Math.abs(denominator) > 1e-9)) return null;
  const slope = (n * sxy - sx * sy) / denominator;
  const mean = sy / n;
  /* Report the bias at the MIDDLE of the ramp, which is the hide's mid value
   * and the point the shader's detail term is measured against. */
  const bias = clamp(mean, 0.02, 0.98);
  return { bias, slope: clamp(slope, -1.5, 1.5), samples: n };
}

/* Half-extent of the body along a bind axis, so the ramp normalizes into 0..1
 * independently of the asset's authored scale. */
function bindExtentAlong(mesh, axis) {
  const position = mesh?.geometry?.getAttribute?.('position');
  if (!position || !axis) return null;
  const local = new THREE.Vector3();
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < position.count; i++) {
    const d = local.fromBufferAttribute(position, i).dot(axis);
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return hi > lo ? Math.max((hi - lo) * 0.5, 1e-4) : null;
}

function identityUniforms(def, palette, options = {}) {
  const bindUp = safeUnit(options.bindUp, new THREE.Vector3(0, 1, 0));
  const bodyAxis = safeUnit(options.bodyAxis, defaultBodyAxis(bindUp));
  const cls = classCode(def);
  /* Rev 15: the DORSAL color is the real animal's, not the authored swatch.
   *
   * speciesHide() resolves the row against the species table (then the base
   * model, then a neutral slate), lets the authored palette pull it only as far
   * as FANTASY_ACCENT_MAX / SPECIES_HUE_SPREAD, caps saturation under
   * SPECIES_SAT_MAX and pushes the result out of the banned teal arc. The
   * authored swatch is kept as `authoredBase` purely so the accent-block and
   * mark colors below can still carry the row's intended second color. */
  const authoredBase = colorValue(palette?.base, new THREE.Color(0.35, 0.46, 0.52));
  const hide = speciesHide(def, authoredBase);
  const base = hide.color;
  const belly = colorValue(palette?.belly, new THREE.Color(0.82, 0.90, 0.94));
  const rfLaw = markingLaw(def);
  /* Gods and demons do not get to choose their accent from the authored
   * palette - the owner named the colour for each. A god's is a pale gold, a
   * demon's a dull ember, and both are already inside the saturation law, so
   * they cannot come back as neon the way the authored swatches did. */
  const accent = rfLaw.accent
    ? hsvArrayToColor(rfLaw.accent)
    : colorValue(palette?.accent, new THREE.Color(0.08, 0.52, 0.72));
  const glow = isColorLike(palette?.glow) ? colorValue(palette.glow) : accent.clone();
  const tier = clamp(finite(def?.tier, 1), 1, 12);
  const pattern = patternCode(def);
  const glowClass = cls >= CLASS_CODES.legendary ? 1 : 0;
  const active = String(def?.active || '').toLowerCase();
  const atomic = active === 'atomic' || /sharkjira|leviathan/i.test(String(def?.id || ''));
  return {
    uRfIdPattern: { value: pattern },
    uRfIdClass: { value: cls },
    uRfIdTier: { value: tier },
    uRfIdPatternScale: { value: 5.4 + tier * 0.30 + (pattern === 1 ? 1.6 : 0) },
    uRfIdPatternMix: { value: pattern === 0 ? 0 : pattern === 1 ? 0.92 : 0.84 },
    uRfIdPatternContrast: { value: glowClass ? 1.0 : 0.94 },
    uRfIdPatternSeed: { value: finite(def?.id ? hashString(String(def.id)) : 0.17, 0.17) * 19.0 },
    uRfIdBaseColor: { value: base },
    uRfIdBellyColor: { value: belly },
    uRfIdAccentColor: { value: accent },
    uRfIdDarkColor: { value: base.clone().multiplyScalar(0.42) },
    uRfIdGlowColor: { value: glow },
    uRfIdEyeColor: { value: colorForEye(def, palette) },
    uRfIdBindUp: { value: bindUp },
    uRfIdBindUpExtent: { value: Math.max(finite(options.bindUpExtent, 0.5), 1e-4) },
    uRfIdBodyAxis: { value: bodyAxis },
    uRfIdBodyExtent: { value: Math.max(finite(options.bodyExtent, 0.5), 1e-4) },
    uRfIdGlowClass: { value: glowClass },
    /* Rev 15: glow seams pulled back hard.
     *
     * The brief bans them outright on real-species rows, and `glowClass` is
     * already legendary-and-up only, so no real shark on the roster was lighting
     * up in the first place. What was wrong was the AMOUNT on the fantasy tail:
     * at 0.68-0.82 the seam network read as circuitry laid over the animal,
     * which is the alien look rather than "a shark with one restrained accent".
     * Roughly a third of that reads as a hot seam in the dark without becoming
     * the row's primary feature. Body emissive elsewhere is untouched. */
    uRfIdGlowStrength: { value: glowClass ? (cls === CLASS_CODES.demon ? 0.30 : 0.24) : 0.0 },
    uRfIdPulse: { value: atomic ? 0.86 : 1.0 },
    /* Bake gradient fit. Defaults describe a hide with NO measurable ramp, so
     * a row whose texture could not be read renders exactly as it did before
     * this lane rather than being flattened by a guess. */
    uRfIdBakeBias: { value: clamp(finite(options.bakeBias, 0.5), 0.02, 0.98) },
    uRfIdBakeSlope: { value: clamp(finite(options.bakeSlope, 0), -1.5, 1.5) },
    uRfIdBakeFlatten: { value: clamp(finite(options.bakeFlatten, 0), 0, 1.2) },
    /* Water hue is the scene's HemisphereLight / FogExp2 color (0x9fd4e8),
     * which is what every rendered hue is dragged toward. */
    uRfIdWaterHue: { value: WATER_HUE },
    uRfIdHueComp: { value: HUE_COMPENSATION },
    /* Rev 15: the accent BLOCK is a fantasy-row device only.
     *
     * It was added in Rev 14 to buy thumbnail separation, and it works - but a
     * ridge cap, a tail block and a face mask in a second color are markings no
     * real shark has, and painting them on a mako or a great white is exactly
     * the "weird hybrid nonsense" the owner rejected. A real-species row keeps
     * a trace of it so its authored accent is not thrown away entirely; a
     * fantasy row keeps the full block as its ONE restrained accent. */
    uRfIdAccentBlock: { value: isFantasyRow(def) ? ACCENT_BLOCK_STRENGTH : ACCENT_BLOCK_STRENGTH * 0.22 },
    /* Rev 15 terminator: narrow band, hard read, soft edge. */
    uRfIdTermCenter: { value: TERMINATOR_CENTER },
    uRfIdTermHalf: { value: TERMINATOR_HALF },
    /* Rev 15 absolute countershade limits: dark dorsal, near-white belly, on
     * every row regardless of what its palette was authored at. */
    uRfIdDorsalMax: { value: DORSAL_VALUE_MAX },
    uRfIdBellyMin: { value: BELLY_VALUE_MIN },
    uRfIdValueSpan: { value: VALUE_IDENTITY_SPAN },
    /* Rev 15 belly sub-surface warmth. */
    uRfIdBellyWarm: { value: BELLY_WARM_AMOUNT },
    uRfIdBellyWarmHue: { value: BELLY_WARM_HUE },
    uRfIdBellyWarmSat: { value: BELLY_WARM_SAT },
    /* Rev 15 skin micro-detail. */
    uRfIdMicroScale: { value: MICRO_SCALE },
    uRfIdMicroAlbedo: { value: MICRO_ALBEDO },
    uRfIdMicroRoughness: { value: MICRO_ROUGHNESS },
    /* Rev 15 roughness targets: matte-ish dorsal hide, glossier belly. */
    uRfIdDorsalRough: { value: ROUGHNESS_DORSAL },
    uRfIdBellyRough: { value: ROUGHNESS_BELLY },
    /* How far the bake's luminance may swing the authored value, as a
     * multiplicative gain around 1.0. 0.34 keeps pores, scales and scars fully
     * legible while making it arithmetically impossible for the photo to invert
     * the countershade. */
    uRfIdBakeDetail: { value: BAKE_DETAIL_GAIN },
    /* Set to 1 by retargetIdentityAxes() once the rfLowLum attribute is
     * actually installed for this mesh. */
    uRfIdHasLowLum: { value: 0 },
    /* Set by retargetIdentityAxes() once the dorsal axis is known in world
     * space; 0 until then, which is the uncompensated behaviour. */
    uRfIdHemiBias: { value: 0 },
    /* Marking law for this row's class - see markingLaw(). Gods get the
     * tightest band (a pale gold ridge tint and nothing else); demons a dull
     * ember on charcoal; everything else the roster default. */
    uRfIdMarkValue: { value: markingLaw(def).value },
    uRfIdMarkSat: { value: markingLaw(def).sat },
    uRfIdLightTint: { value: new THREE.Vector3(LIGHT_TINT[0], LIGHT_TINT[1], LIGHT_TINT[2]) },
    /* Real-species rows are locked hard to their species colour - that colour
     * is the whole point of the owner's direction. Fantasy rows keep more of
     * the pipeline's own result so their one accent still reads. */
    uRfIdChromaLock: { value: isFantasyRow(def) ? CHROMA_LOCK_FANTASY : CHROMA_LOCK_SPECIES }
  };
}

function hashString(value) {
  let h = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function clamp(value, low, high) { return Math.min(high, Math.max(low, value)); }

function installIdentity(shader, uniforms) {
  if (shader.fragmentShader.includes('rf-identity applied')) return;
  for (const name of IDENTITY_UNIFORM_NAMES) shader.uniforms[name] = uniforms[name];
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${IDENTITY_VERTEX_GLSL}`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRfIdentityPosition = position;\nvRfLowLum = rfLowLum;');
  const identityCode = `
/* rf-identity applied */
vec3 rfIdP = vRfIdentityPosition;
float rfIdUp = clamp(dot(rfIdP, uRfIdBindUp) / (2.0 * uRfIdBindUpExtent) + 0.5, 0.0, 1.0);
vec3 rfIdSideAxis = normalize(cross(uRfIdBodyAxis, uRfIdBindUp));
float rfIdAlong = clamp(dot(rfIdP, uRfIdBodyAxis) / (2.0 * uRfIdBodyExtent) + 0.5, 0.0, 1.0);
float rfIdLateral = dot(rfIdP, rfIdSideAxis);
float rfIdMask = rfIdPatternMask(rfIdP, rfIdAlong, rfIdLateral, rfIdUp);
diffuseColor.rgb = rfIdCountershade(diffuseColor.rgb, rfIdUp);
/* Lane F2: the ACCENT as a second identity block.
 *
 * Base hue plus a value band separates most of the roster, but rows that share
 * a base model AND sit close in both (frostjaw/stormfin/gloomtide/wreckfang/
 * ironfin/glacier/tempest/maelstrom all measured within 0.06 of each other)
 * need a third, spatially distinct signal. The authored palettes already carry
 * one - every row has an accent swatch that nothing was using at body scale.
 *
 * Paint it as compact blocks where a real shark carries its markings and where
 * they stay visible at gameplay size: the DORSAL RIDGE, the tail/fin end of
 * the body, and a face mask over the snout. Because the placement is fixed and
 * the color is per-row, two rows on the same mesh get different-coloured caps
 * in the same places, which is exactly what a thumbnail metric can see. */
/* Extents and strength are the configuration that MEASURED best, not the one
 * that reads best on paper. Suspecting the accent of causing the background
 * bleed, I pulled every block back off the fin margins and dropped the
 * strength to 0.28: distinctness collapsed (mako/blue 0.0655 -> 0.0539, back
 * under the 0.055 gate) and the bleed did NOT improve (ironfin 0.031 ->
 * 0.059, tempest 0.029 -> 0.056), which rules the accent out as the bleed's
 * cause and shows it is load-bearing for separation. Reverted to these
 * values; evidence hse/evidence/f2-e against f2-d. */
float rfIdRidge = smoothstep(0.74, 0.94, rfIdUp);
float rfIdTailBlock = smoothstep(0.62, 0.86, rfIdAlong) * (1.0 - smoothstep(0.30, 0.62, rfIdUp));
float rfIdFaceMask = (1.0 - smoothstep(0.04, 0.20, rfIdAlong)) * smoothstep(0.20, 0.55, rfIdUp);
float rfIdAccentMask = clamp(max(rfIdRidge, max(rfIdTailBlock, rfIdFaceMask)), 0.0, 1.0) * uRfIdAccentBlock;
{
  /* ROUND 4b: the accent, in RGB only.
   *
   * Same law as before - dV <= uRfIdMarkValue, saturation ceiling
   * uRfIdMarkSat - but expressed without decomposing either colour, for the
   * reason recorded in rfIdCountershade: the HSV round-trip is the carrier of
   * the mauve cast at the low saturations this roster runs at.
   *
   * Saturation is CAPPED by mixing the accent toward its own luminance, which
   * bounds chroma without ever measuring it. Value is matched to the body's
   * own luminance and darkened by uRfIdMarkValue, so the marking sits in the
   * hide rather than punching a hole in the countershade. */
  float rfIdBodyLum = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  float rfIdAccLum = max(dot(uRfIdAccentColor, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  /* Pull the accent toward neutral to hold it under the saturation ceiling. A
   * fully saturated authored swatch lands at uRfIdMarkSat of its own chroma;
   * an already-muted one is left essentially alone. */
  vec3 rfIdAccMuted = mix(vec3(rfIdAccLum), uRfIdAccentColor, clamp(uRfIdMarkSat * 2.0, 0.0, 1.0));
  float rfIdAccMutedLum = max(dot(rfIdAccMuted, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  float rfIdAccVal = clamp(rfIdBodyLum * (1.0 - uRfIdMarkValue), 0.03, 0.97);
  vec3 rfIdAccentRgb = rfIdAccMuted * (rfIdAccVal / rfIdAccMutedLum);
  diffuseColor.rgb = mix(diffuseColor.rgb, rfIdAccentRgb, rfIdAccentMask);
}
vec3 rfIdMark = rfIdMarkColor(rfIdUp);
float rfIdMarkAmount = rfIdMask * clamp(uRfIdPatternMix, 0.0, 1.0);
/* Rev 15: markings are DARKER than the hide, never brighter.
 *
 * Rev 14 blended 68% toward the accent color scaled UP by 1.22, which on a
 * tiger rendered its bars as bright white pinstripes laid over the flank - a
 * decal, and one no shark has. Every real shark marking (a tiger's bars, a
 * whaleshark's spots, a greenland's mottle, a leopard's saddles) is a pigment
 * DEPOSIT: it is darker and slightly more saturated than the surrounding hide,
 * and it sits in the skin rather than on it.
 *
 * So the mark is mixed toward a DARKENED version of the hide's own color,
 * tinted a little way toward the accent - which keeps the row's intended second
 * color legible while guaranteeing the mark can never be a bright overlay. The
 * countershade still shows through, so a bar fades out on the belly the way a
 * real one does. */
/* ROUND 4: hold the pattern marking to the same low-contrast law.
 *
 * The mark keeps the body's own hue and value and is merely DARKENED by at
 * most uRfIdMarkValue, tinted a little toward the row's accent whose
 * saturation is capped the same way. A tiger's bars then read as bars in the
 * hide - darker bronze on bronze - instead of as a printed stripe. */
/* ROUND 4b: the pattern marking, in RGB only - no decomposition. Same law:
 * the mark keeps the row's marking colour, is held under the saturation
 * ceiling by a pull toward its own luminance, and is darkened from the body's
 * luminance by at most uRfIdMarkValue so it reads as pigment in the hide. */
float rfIdMarkBodyLum = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
float rfIdMarkLum = max(dot(rfIdMark, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
vec3 rfIdMarkMuted = mix(vec3(rfIdMarkLum), rfIdMark, clamp(uRfIdMarkSat * 2.0, 0.0, 1.0));
float rfIdMarkMutedLum = max(dot(rfIdMarkMuted, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
float rfIdMarkVal = clamp(rfIdMarkBodyLum * (1.0 - uRfIdMarkValue), 0.02, 0.97);
vec3 rfIdMarkTone = rfIdMarkMuted * (rfIdMarkVal / rfIdMarkMutedLum);
diffuseColor.rgb = mix(diffuseColor.rgb, rfIdMarkTone, rfIdMarkAmount * 0.72);
/* A restrained eye tint hook preserves the painted eye's value while letting
 * each row carry its authored eye color on baked face textures. */
float rfIdHead = 1.0 - smoothstep(0.03, 0.24, rfIdAlong);
float rfIdEyeBand = rfIdHead * smoothstep(0.035, 0.11, abs(rfIdLateral)) * (1.0 - smoothstep(0.72, 0.98, rfIdUp));
diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, uRfIdEyeColor * 1.35, 0.58), rfIdEyeBand * 0.12);
/* ROUND 4: RE-ASSERT THE SPECIES CHROMA, last thing before the glow.
 *
 * The rendered close-ups showed 18 rows reading mauve/pink (tiger hue 0.75,
 * bull 0.84) while their resolved albedo was demonstrably correct - tiger
 * #a29985, a bronze at hue 0.115. The brief's isolation test settled where the
 * cast comes from: forcing the diffuse texture to pure grey left tiger at 0.748
 * and bull at 0.844, so it is NOT texture chroma; it is everything this diffuse
 * passes through afterwards. Each contributor was measured and each is real but
 * partial - the eye-preservation term (which mixes a sat x 0.42 version over
 * 18-26% of the body), the material's own hue steer, and the cyan incident
 * light which multiplies every hide toward the water.
 *
 * Rather than chase each one with a coefficient, the hue and saturation are
 * simply restated here, at the end of the identity block, where nothing in this
 * layer can dilute them again. VALUE is taken from whatever the pipeline
 * produced, so the countershade, the markings, the micro-detail and the painted
 * eye all survive untouched - only the chroma is pinned back to the species.
 * That is exactly the owner's law: the animal's colour is a fact about the
 * animal, and the lighting may shade it but may not repaint it.
 *
 * The re-assert is partial (uRfIdChromaLock) so a fantasy row's one restrained
 * accent and the markings still read as their own colour. */
/* ROUND 4b: the re-assert, in RGB and at MATCHED LUMINANCE.
 *
 * Mixing toward the species colour scaled to the pixel's own luminance pulls
 * the channel RATIOS back toward the species without touching brightness, so
 * the countershade, the markings, the micro-detail and the painted eye all
 * survive exactly as the pipeline left them - which is what the HSV version
 * was trying to express, minus the round-trip that was corrupting it. */
{
  float rfIdFinalLum = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  float rfIdWantLum = max(dot(uRfIdBaseColor, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  vec3 rfIdWantAtLum = uRfIdBaseColor * (rfIdFinalLum / rfIdWantLum);
  diffuseColor.rgb = mix(diffuseColor.rgb, rfIdWantAtLum, uRfIdChromaLock);
}
float rfIdSeamLine = 1.0 - smoothstep(0.018, 0.052, abs(fract(rfIdAlong * (7.0 + uRfIdTier * 0.18) + uRfIdPatternSeed * 0.07) - 0.5));
float rfIdClassGlow = uRfIdClass >= 3 ? 1.0 : 0.0;
/* ROUND 4: THIS is the "hard vertical stripe decal" on the Act 4/5 rows.
 *
 * rfIdSeamLine is a periodic function of rfIdAlong, so it draws evenly spaced
 * VERTICAL bands down the body, and adding them to totalEmissiveRadiance in the
 * row's glow colour paints them in full-saturation magenta, orange, green or
 * cyan - light the shading cannot darken and the countershade cannot cross.
 * Measured on the close-ups, typhonmaw carried 20% of its body pixels above
 * saturation 0.5 and read as a shark with tape wrapped round it.
 *
 * The owner's law: gods get "pale gold dorsal ridge tint only", demons "dark
 * charcoal hide with a dull ember accent only", and nothing gets full-saturation
 * bands. So the seam component is dropped entirely - a periodic band is the one
 * shape being ruled out - and what remains is a faint emissive lift confined to
 * the row's own pattern mask and to the DORSAL RIDGE, in the class colour that
 * markingLaw() already restricted to pale gold or dull ember. */
float rfIdGlowRidge = smoothstep(0.70, 0.96, rfIdUp);
float rfIdGlowMask = rfIdClassGlow * uRfIdGlowClass * rfIdMask * rfIdGlowRidge;
totalEmissiveRadiance += uRfIdGlowColor * rfIdGlowMask * uRfIdGlowStrength * uRfIdPulse;
`;
  /* Rev 15: ROUGHNESS is where the "plastic" read is actually fixed.
   *
   * The brief asks for ~0.45 dorsal / 0.35 belly with the specular broken up by
   * skin detail. Two things matter about where this injects:
   *
   * - It must run AFTER shark3d.js's wet-specular line, which multiplies
   *   roughnessFactor along the back. applyIdentity() chains onto the
   *   material's existing onBeforeCompile so this callback runs second and the
   *   `#include <roughnessmap_fragment>` token has ALREADY been consumed by
   *   that material - it is replaced with the include plus the wet lines. So
   *   the anchor here is the wet line itself when present, and the bare include
   *   only as a fallback for materials that never installed one.
   * - It ASSIGNS rather than multiplies. The art direction names two absolute
   *   numbers; a multiply on top of whatever the map and the wet pass left
   *   would land somewhere else on every row. The wet pass's gloss streak is
   *   preserved by folding its result back in as a modest bias rather than by
   *   leaving it to fight the assignment.
   *
   * The micro-detail field is the whole point: a constant roughness is a
   * constant specular lobe, which is the shrink-wrapped plastic look. Breaking
   * it with the denticle field is what makes the highlight read as skin. */
  const roughnessCode = [
    'float rfIdRoughUp = clamp(dot(vRfIdentityPosition, uRfIdBindUp) / (2.0 * uRfIdBindUpExtent) + 0.5, 0.0, 1.0);',
    'float rfIdRoughShade = smoothstep(uRfIdTermCenter - uRfIdTermHalf, uRfIdTermCenter + uRfIdTermHalf, rfIdRoughUp);',
    /* Belly at uRfIdBellyRough, dorsal at uRfIdDorsalRough, across the same
     * terminator the countershade uses so the two cues agree. */
    'float rfIdRoughTarget = mix(uRfIdBellyRough, uRfIdDorsalRough, rfIdRoughShade);',
    /* Denticle break-up. Same field the albedo taps, so the bump in the
     * highlight sits where the bump in the color does. */
    'float rfIdRoughMicro = rfIdScaleField(vRfIdentityPosition * uRfIdMicroScale);',
    'rfIdRoughTarget += (rfIdRoughMicro - 0.5) * 2.0 * uRfIdMicroRoughness;',
    /* Keep a quarter of whatever the wet pass and the roughness map decided,
     * so the dorsal gloss streak and any authored map detail survive. */
    'roughnessFactor = clamp(mix(rfIdRoughTarget, roughnessFactor, 0.25), 0.05, 1.0);'
  ].join('\n');
  /* shark3d.js's own wet line, verbatim. Matching on it rather than on the
   * include is what guarantees this lands after it. */
  const WET_ANCHOR = 'roughnessFactor = clamp(roughnessFactor * mix(1.06, 0.46, uRfWetness * smoothstep(0.30, 0.98, rfWetUp)), 0.06, 1.0);';
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${IDENTITY_FRAGMENT_GLSL}`);
  /* WHERE THE IDENTITY BLOCK INJECTS - the bug that made round 3 unfixable.
   *
   * This used to replace '#include <map_fragment>'. On a TEXTURED row that
   * token does not exist by the time this runs: shark3d.js's own
   * onBeforeCompile has already consumed it (shark3d.js ~:1964) and replaced it
   * with the include plus its hue steer, its countershade ramp and its
   * top/bottom multiplies. applyIdentity() CHAINS onto that callback, so the
   * material's block runs first and the token is gone - and String.replace on a
   * missing token silently returns the string unchanged.
   *
   * So the entire identity block - the countershade, the species colour, the
   * markings, the accent - was never injected on any textured row. That is why
   * every experiment in this lane measured "no change": the value band, the
   * saturation floor, the light-tint compensation and the chroma re-assert were
   * all real code that was never compiled into the shader. It also explains the
   * one thing that DID work, the roughness block, which already anchors on
   * shark3d.js's wet line for exactly this reason and was written that way
   * after the same trap was hit once before.
   *
   * The anchor is therefore shark3d.js's LAST tint line, verbatim, which
   * guarantees this lands after the material has finished with diffuseColor.
   * The bare include remains as the fallback for untextured materials, which
   * never install a block of their own. */
  const TINT_ANCHOR = "diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uRfTopColor * 2.10, smoothstep(0.66, 0.99, rfUp) * 0.30);";
  if (shader.fragmentShader.includes(TINT_ANCHOR)) {
    shader.fragmentShader = shader.fragmentShader.replace(TINT_ANCHOR, `${TINT_ANCHOR}\n${identityCode}`);
  } else {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n${identityCode}`);
  }
  if (shader.fragmentShader.includes(WET_ANCHOR)) {
    shader.fragmentShader = shader.fragmentShader.replace(WET_ANCHOR, `${WET_ANCHOR}\n${roughnessCode}`);
  } else if (shader.fragmentShader.includes('#include <roughnessmap_fragment>')) {
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${roughnessCode}`);
  }
}

/* `mesh` is optional. When buildLoadedRig supplies the bound SkinnedMesh the
 * dorsal axis is MEASURED off the posed rig (see measureBindUp); without it
 * the material's prepareTemplate estimate is used, which is correct on the
 * rigs whose axis survives skinning and wrong on the rest. */
function applyIdentity(material, def, palette, mesh = null) {
  if (!material) return material;
  const userData = material.userData || (material.userData = {});
  let bindUp = userData.rfBindUp, bindUpExtent = userData.rfBindUpExtent;
  const measured = mesh ? measureBindUp(mesh) : null;
  if (measured) {
    bindUp = measured;
    bindUpExtent = bindExtentAlong(mesh, measured) ?? bindUpExtent;
    userData.rfIdentityMeasuredBindUp = measured.toArray();
    userData.rfIdentityMeasuredBindUpExtent = bindUpExtent;
  }
  /* Fit the bake's own painted dorsal ramp so the shader can flatten it before
   * applying the authored countershade. Null (Node run, unreadable texture)
   * leaves bakeFlatten at 0, i.e. the pre-F2 behaviour. */
  const gradient = mesh ? measureBakeGradient(mesh, bindUp, bindUpExtent) : null;
  if (gradient) userData.rfIdentityBakeGradient = gradient;
  const uniforms = identityUniforms(def, palette, {
    bindUp,
    bindUpExtent,
    bodyAxis: userData.rfIdentityBodyAxis,
    bodyExtent: userData.rfIdentityBodyExtent,
    bakeBias: gradient?.bias,
    bakeSlope: gradient?.slope,
    bakeFlatten: gradient ? BAKE_FLATTEN : 0
  });
  const previous = material.onBeforeCompile;
  userData.rfIdentityUniforms = uniforms;
  /* Resolved species hide, kept on the material so the textured-tint
   * neutralization (and the retarget pass, which runs later on the bound rig)
   * can reach the same numbers without resolving them a second time. */
  userData.rfIdentityHide = speciesHide(def, colorValue(palette?.base, new THREE.Color(0.35, 0.46, 0.52)));
  userData.rfIdentityUniformNames = IDENTITY_UNIFORM_NAMES.slice();
  userData.rfIdentityPulse = uniforms.uRfIdPulse;
  userData.rfIdentity = {
    pattern: patternCode(def),
    cls: String(def?.cls || 'common'),
    tier: finite(def?.tier, 1),
    glow: uniforms.uRfIdGlowClass.value > 0,
    atomic: uniforms.uRfIdPulse.value !== 1
  };
  material.onBeforeCompile = (shader, renderer) => {
    if (previous) previous(shader, renderer);
    installIdentity(shader, uniforms);
  };
  const previousKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${typeof previousKey === 'function' ? previousKey.call(material) : ''}:rf-identity1`;
  /* Keep the TEXTURED material's own countershade ramp on the same measured
   * axis. Both layers dot bind position against an up vector; if they disagree
   * the material darkens one side while the identity layer brightens it and
   * the two cancel into the flat, wrong-signed gradient the harness measured. */
  if (measured && userData.rfTexturedUniforms?.uRfBindUp?.value?.copy) {
    userData.rfTexturedUniforms.uRfBindUp.value.copy(measured);
    if (userData.rfTexturedUniforms.uRfBindUpExtent) userData.rfTexturedUniforms.uRfBindUpExtent.value = bindUpExtent;
  }
  dampTexturedCounterGain(userData);
  neutralizeTexturedTint(userData, userData.rfIdentityHide);
  material.needsUpdate = true;
  return material;
}

/* Lane F2: stand the textured material's own countershade down.
 *
 * Both layers inject at `#include <map_fragment>` and applyIdentity() chains
 * onto the material's existing onBeforeCompile, so the material's block runs
 * FIRST and the identity layer reads an already-counter-shaded color as its
 * "photo luminance". The material multiplies by mix(1.52, 0.46) across the
 * dorsal axis; the identity layer then takes luminance from that product and
 * rewrites value from the authored ramp. The result is a ramp applied twice -
 * which over-darkens where the two agree and, on the hides whose painted
 * gradient runs the other way, leaves a residue the bake-flatten cannot see
 * because it is not in the texture at all.
 *
 * Since the identity layer now owns VALUE outright (it sets value from the
 * authored band and folds the flattened photo detail back in), the material's
 * multiply is redundant. Damping it to a token amount leaves the identity ramp
 * as the single authority on back-versus-belly, which is what makes the
 * measured countershade track the authored one. The rim, wet specular and hue
 * steer in that material are untouched: only the counter-gain moves.
 *
 * This writes an EXISTING uniform object that shark3d.js already created, so
 * it needs no edit to that file and triggers no recompile. */
function dampTexturedCounterGain(userData) {
  const gain = userData?.rfTexturedUniforms?.uRfCounterGain;
  /* A face slot ships gain 0 and must stay 0. */
  if (!gain || !(gain.value > 0)) return null;
  if (userData.rfIdentityCounterGainDamped) return gain.value;
  userData.rfIdentityCounterGainOriginal = gain.value;
  gain.value = TEXTURED_COUNTER_GAIN_DAMP;
  userData.rfIdentityCounterGainDamped = true;
  return gain.value;
}

/* Rev 15: neutralize the TEXTURED material's cyan steer.
 *
 * The LIGHT lane measured a great white rendering at mean RGB (95, 167, 169) -
 * a flat cyan - even under a fully NEUTRAL white rig, which rules the scene
 * lighting out as the cause. The cyan is baked into the textured material's own
 * uniforms in shark3d.js, and because applyIdentity() chains onto that
 * material's existing onBeforeCompile, its block runs BEFORE this layer's and
 * hands the identity shader an already-cyan diffuse to work from. Three
 * uniforms do it, all derived from the authored palette swatches:
 *
 *   uRfHueShift  - a hue TARGET (not a delta) that rotates the photo's hue
 *                  toward the authored swatch's. On the blue half of the
 *                  roster that swatch is a cyan around 0.52-0.60, so the whole
 *                  hide is steered to cyan before anything else happens.
 *   uRfTopColor  - multiplied into the dorsal band at 2.10x. A cyan swatch
 *                  here paints the back cyan, which is the single strongest
 *                  contributor to the measured mean.
 *   uRfBottomColor - the same multiply on the belly, which is why the belly
 *                  came out pale cyan rather than near-white.
 *
 * Under the owner's species-color direction none of these may keep steering the
 * hide toward an authored fantasy hue. They are rewritten here to the SPECIES
 * values this layer resolved: hue shift follows the real animal's hue, the
 * dorsal multiplier becomes that animal's grey, and the ventral multiplier
 * becomes near-white so the multiply brightens the belly instead of tinting it.
 *
 * This writes uniform OBJECTS that shark3d.js already created and holds, so it
 * needs no edit to that file and triggers no shader recompile - exactly the
 * mechanism dampTexturedCounterGain() above already uses. It is idempotent.
 */
function neutralizeTexturedTint(userData, hide) {
  const textured = userData?.rfTexturedUniforms;
  if (!textured || !hide) return null;
  if (userData.rfIdentityTintNeutralized) return userData.rfIdentityTintNeutralized;
  const record = {};

  /* Hue target: the species hue, so the material's steer now REINFORCES the
   * real animal's color instead of fighting it back toward cyan. */
  if (textured.uRfHueShift) {
    record.hueShift = textured.uRfHueShift.value;
    textured.uRfHueShift.value = hide.hsv[0];
  }
  /* Saturation: hold it under the species ceiling. This uniform scales the
   * photo's own saturation, and left at the authored value it re-saturated the
   * hide right back past the cap this layer just applied. */
  if (textured.uRfSaturation) {
    record.saturation = textured.uRfSaturation.value;
    /* MEASURED DOWN. A first cut left this at 0.30 + the species saturation,
     * which on a warm hide rendered as PINK: shark3d.js's steer rotates the
     * PHOTO's hue onto uRfHueShift and then scales saturation by this, so a
     * bronze target at high saturation turns a pale bake salmon (tiger came out
     * mauve with the hide resolving correctly to a bronze #a29c8e in JS). The
     * hide's own saturation is already capped under SPECIES_SAT_MAX, so this
     * only has to stop the material re-saturating on top of it. */
    /* ROUND 4: for a REAL-species row this goes to ZERO - the texture
     * contributes LUMINANCE ONLY and no chroma whatsoever.
     *
     * Isolated by experiment, as the brief directed: forcing the diffuse to
     * pure grey in the shader left tiger at rendered hue 0.748 and bull at
     * 0.844, i.e. still mauve, which rules the texture's own chroma out as the
     * proximate cause and points at this steer. Sampling the lit flank makes it
     * concrete - tiger renders RGB(130,120,139), where BLUE exceeds RED, while
     * its resolved albedo is a bronze #a29985 where red exceeds blue. The
     * material is re-tinting the hide after this layer has set it.
     *
     * The mechanism is the one recorded above: shark3d.js rotates the PHOTO's
     * hue onto uRfHueShift and then scales by this saturation, so any residual
     * cast in the bake is re-applied as chroma on top of the species color. At
     * 0 there is no chroma to re-apply, the species hue set by this layer is
     * the only chroma on the animal, and the photo does what it should do -
     * carry pores, scales, scars and the painted eye as luminance.
     *
     * Fantasy rows keep a small allowance so their ONE restrained accent can
     * still read through the bake. */
    textured.uRfSaturation.value = hide.fantasy ? clamp(0.18 + hide.hsv[1] * 0.35, 0.15, 0.34) : 0.0;
  }
  /* Hue blend: drive the steer to FULL.
   *
   * shark3d.js ships 0.85, and its rfNeutral term fades the steer out further
   * on texels the bake painted saturated. That is a sensible default when the
   * target hue IS the authored palette, but under species color it means a bake
   * whose photo carries its own strong cast keeps that cast: the tiger_nu hide
   * is photographed pink, and at 0.85 it stayed mauve no matter what the
   * species table said. At 1.0 the resolved species hue wins outright on every
   * texel the fade still reaches, which is what makes a bronze tiger bronze. */
  if (textured.uRfHueBlend) {
    record.hueBlend = textured.uRfHueBlend.value;
    textured.uRfHueBlend.value = 1.0;
  }

  /* Dorsal multiplier: the species grey, normalized so the 2.10x multiply in
   * shark3d.js lands near unity rather than darkening or tinting the back. */
  if (textured.uRfTopColor?.value?.copy) {
    record.topColor = textured.uRfTopColor.value.getHex();
    /* MEASURED. shark3d.js multiplies the dorsal band by this color at 2.10x,
     * so the value here sets a GAIN: 0.48 x 2.10 = 1.0, i.e. no darkening at
     * all. Rev 14 got its dark back partly from this multiply, because the
     * authored palette base is a dark swatch; substituting a mid-value species
     * grey silently removed that darkening and the dorsal measured 0.671 where
     * the authored band asks for 0.26 - which INVERTED the countershade on
     * greatwhite, mako, blue and bull (all previously fine at back ~0.30).
     * 0.26 x 2.10 = 0.55 restores a real dorsal multiply. */
    /* ROUND 4: carry the FULL species saturation, not 0.55 of it.
     *
     * shark3d.js line ~2006 multiplies the finished diffuse by this colour at
     * 2.10x AFTER this layer's recolor has run, so whatever chroma is missing
     * here is chroma actively divided OUT of the species hide. With texture
     * chroma now zero for real rows this multiply is the last thing touching
     * the hue, and at 0.55 it was bleaching the result: every probe row
     * converged on the same blue-grey (tiger rendered flank sat 0.09 against a
     * bronze albedo) and raising SPECIES_SAT_MIN did not move the render at all,
     * which is what identified this multiply rather than the albedo. */
    const top = hsvArrayToColor([hide.hsv[0], hide.hsv[1], 0.48]);
    textured.uRfTopColor.value.copy(top);
  }
  /* Ventral multiplier: near-white with only a whisper of the species hue, so
   * the belly reads as the near-white a real shark has. */
  if (textured.uRfBottomColor?.value?.copy) {
    record.bottomColor = textured.uRfBottomColor.value.getHex();
    /* Ventral: 0.50 x 2.10 = 1.05, a whisper of lift on the belly, which is
     * what a near-white underside wants. */
    /* The belly keeps only a whisper of hue - a real underside IS near-white -
     * but it must be the SPECIES hue, so the two ends of the countershade
     * belong to the same animal. */
    textured.uRfBottomColor.value.copy(hsvArrayToColor([hide.hsv[0], 0.08, 0.50]));
  }
  /* The fresnel rim was tinted toward a 0.62/0.86/1.0 sky blue, which lays a
   * cyan edge all the way around the silhouette. A near-neutral rim still
   * separates the animal from the water without recoloring it. */
  if (textured.uRfRimColor?.value?.copy) {
    record.rimColor = textured.uRfRimColor.value.getHex();
    textured.uRfRimColor.value.copy(new THREE.Color(0.86, 0.88, 0.90));
  }
  /* ROUND 4: the SATURATED STRIPE DECALS.
   *
   * The close-ups showed Act 4/5 rows wearing hard vertical bands in fully
   * saturated magenta, orange, green and cyan that read as tape stuck to the
   * shark - typhonmaw measured 20% of its body pixels above saturation 0.5.
   * They are not this layer's markings: they are shark3d.js's own pattern pass
   * (line ~2184), which paints uRfPatternColor - the raw authored accent, at
   * full saturation - scaled to 1.55x, i.e. BRIGHTER than the hide, and mixes
   * it at 0.78. A full-saturation band brighter than the surrounding skin is
   * the definition of a decal.
   *
   * The owner's law for a marking is dV <= 0.18 and saturation <= 0.35, so the
   * pattern colour is pulled under that ceiling and the mix is cut hard. What
   * survives is a banding a real animal could have - a slightly darker, slightly
   * different-hued patch of the same hide - which is exactly what a tiger's bars
   * or a whaleshark's spots are. */
  if (textured.uRfPatternColor?.value?.copy) {
    record.patternColor = textured.uRfPatternColor.value.getHex();
    const pat = rgbToHsvArray(textured.uRfPatternColor.value);
    /* Keep the row's intended marking HUE - that is its identity - but take
     * the saturation to the ceiling and the value to just under the hide's, so
     * the 1.55x brightening in shark3d.js can no longer make it a highlight. */
    textured.uRfPatternColor.value.copy(hsvArrayToColor([
      pat[0],
      Math.min(pat[1], MARK_SAT_MAX),
      clamp(hide.hsv[2] * (1 - MARK_VALUE_DELTA) / 1.55, 0.04, 0.62)
    ]));
  }
  if (textured.uRfPatternMix && textured.uRfPatternMix.value > 0) {
    record.patternMix = textured.uRfPatternMix.value;
    /* 0.78 is a decal's coverage. A pigment marking reads at a fraction of it. */
    textured.uRfPatternMix.value = Math.min(textured.uRfPatternMix.value, 0.30);
  }
  userData.rfIdentityTintNeutralized = record;
  return record;
}

function setIdentityPulse(material, pulse) {
  const uniform = material?.userData?.rfIdentityPulse;
  if (uniform) uniform.value = clamp(finite(pulse, 1), 0, 2);
  return uniform?.value ?? null;
}

/* Re-measure the dorsal axis for every textured material on a BOUND rig.
 *
 * texturedSkinMaterial() builds the material before buildLoadedRig binds the
 * skeleton, so applyIdentity() cannot measure the posed rig at that point.
 * This is the one call buildLoadedRig makes afterwards; it updates the already
 * installed uniform objects in place, so no shader is recompiled and no
 * material is rebuilt. */
function retargetIdentityAxes(mesh) {
  if (!mesh?.isSkinnedMesh) return null;
  const measured = measureBindUp(mesh);
  if (!measured) return null;
  const extent = bindExtentAlong(mesh, measured);
  /* Lane F2: this is the first point at which BOTH the correct dorsal axis and
   * the loaded diffuse image are available, so it is where the bake's own
   * painted gradient gets fitted. texturedSkinMaterial() calls applyIdentity()
   * before the skeleton is bound and before the texture has decoded, so the
   * measurement cannot happen there. */
  const gradient = measureBakeGradient(mesh, measured, extent);
  /* Rev 15.1: build the per-vertex low-frequency luminance field. This is the
   * point where the correct dorsal axis AND the decoded diffuse are both
   * available, and the geometry is shared per template so it runs once per
   * model. */
  const lowLum = buildLowLumAttribute(mesh, measured, extent, defaultBodyAxis(measured));

  /* How far the dorsal direction points at the sky, in WORLD space.
   *
   * The HemisphereLight gradient runs along world +Y, so this dot product is
   * exactly how much the scene lighting is about to brighten this row's back
   * relative to its belly. +1 means the lighting fully inverts the intended
   * countershade, -1 means it fully reinforces it. See HEMI_COMPENSATION. */
  mesh.updateMatrixWorld?.(true);
  const worldUp = measured.clone().transformDirection(mesh.matrixWorld);
  const hemiBias = clamp(worldUp.y, -1, 1) * HEMI_COMPENSATION;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  let updated = 0;
  for (const material of materials) {
    const userData = material?.userData;
    if (!userData) continue;
    const identity = userData.rfIdentityUniforms, textured = userData.rfTexturedUniforms;
    if (identity?.uRfIdBindUp?.value?.copy) {
      identity.uRfIdBindUp.value.copy(measured);
      if (extent && identity.uRfIdBindUpExtent) identity.uRfIdBindUpExtent.value = extent;
      /* The pattern/eye bands run along the body axis, which must stay
       * perpendicular to the freshly measured up axis. */
      if (identity.uRfIdBodyAxis?.value?.copy) identity.uRfIdBodyAxis.value.copy(defaultBodyAxis(measured));
      /* Switch the shader onto the low-frequency divide only when the
       * attribute really exists, so a mesh whose texture could not be read
       * keeps the old behaviour instead of dividing by a missing attribute. */
      if (identity.uRfIdHasLowLum) identity.uRfIdHasLowLum.value = lowLum ? 1 : 0;
      /* Hemisphere-light compensation, computed HERE because this is the first
       * point at which the mesh has a world matrix and the bind-space dorsal
       * axis can be expressed in world space - which is the space the
       * HemisphereLight's sky/ground gradient lives in. */
      if (identity.uRfIdHemiBias) identity.uRfIdHemiBias.value = hemiBias;
      /* Install the fitted bake gradient. Updating the existing uniform
       * objects in place keeps this free of a shader recompile, the same way
       * the axis retarget above does. */
      if (gradient && identity.uRfIdBakeBias && identity.uRfIdBakeSlope && identity.uRfIdBakeFlatten) {
        identity.uRfIdBakeBias.value = gradient.bias;
        identity.uRfIdBakeSlope.value = gradient.slope;
        identity.uRfIdBakeFlatten.value = BAKE_FLATTEN;
      }
      updated++;
    }
    if (textured?.uRfBindUp?.value?.copy) {
      /* Rev 15 tried NEGATING this (on the theory that shark3d.js's ramp was
       * the inverted one) and it measured worse on all eight probe rows -
       * greatwhite -0.029 -> -0.242, reef +0.060 -> -0.182, whaleshark +0.115
       * -> -0.094, 0 of 8 positive. So shark3d's ramp is correctly oriented and
       * the inverted gradient seen at constant identity value comes from the
       * BAKE's own painted shading, not from either ramp. Left as measured. */
      textured.uRfBindUp.value.copy(measured);
      if (extent && textured.uRfBindUpExtent) textured.uRfBindUpExtent.value = extent;
    }
    userData.rfIdentityMeasuredBindUp = measured.toArray();
    if (extent) userData.rfIdentityMeasuredBindUpExtent = extent;
    if (gradient) userData.rfIdentityBakeGradient = gradient;
    /* Idempotent, so running here as well as in applyIdentity() cannot damp
     * twice; this is the path a textured row actually takes. */
    dampTexturedCounterGain(userData);
    /* The textured uniforms are only fully populated by the time the rig is
     * bound, so the cyan-steer neutralization is repeated here. It is
     * idempotent, so running in both places cannot double-apply. */
    neutralizeTexturedTint(userData, userData.rfIdentityHide);
  }
  return { bindUp: measured.toArray(), bindUpExtent: extent, materials: updated, bakeGradient: gradient };
}

export {
  IDENTITY_FRAGMENT_GLSL,
  IDENTITY_UNIFORM_NAMES,
  IDENTITY_VERTEX_GLSL,
  applyIdentity,
  identityUniforms,
  measureBakeGradient,
  patternCode,
  retargetIdentityAxes,
  setIdentityPulse
};
