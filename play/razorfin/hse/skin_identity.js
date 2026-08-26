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
const HUE_COMPENSATION = 0.45;
/* How strongly the accent swatch paints its dorsal/tail/face blocks. Strong
 * enough for a 64x30 thumbnail to register it as a second color, low enough
 * that it reads as a marking on skin and not a decal. */
const ACCENT_BLOCK_STRENGTH = 0.55;
/* How much of the bake's own fitted dorsal ramp to remove. Full removal is
 * deliberately not the default: the photo's gradient is part of why the hide
 * reads as a real animal, so take out enough that the authored terminator wins
 * the measurement while leaving the hide looking photographed. */
const BAKE_FLATTEN = 0.85;
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
const TEXTURED_COUNTER_GAIN_DAMP = 1.0;

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
  'uRfIdAccentBlock'
]);

const IDENTITY_VERTEX_GLSL = `
/* rf-identity vertex */
varying vec3 vRfIdentityPosition;
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
varying vec3 vRfIdentityPosition;

/* HSV round-trip so the identity layer can split the photo's luminance from
 * the palette's hue and saturation. Same formulation the textured material
 * uses, kept local so this module compiles standalone. */
vec3 rfIdRgbToHsv(vec3 c){vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);return vec3(abs(q.z+(q.w-q.y)/(6.0*d+1e-5)),d/(q.x+1e-5),q.x);}
vec3 rfIdHsvToRgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(0.0,1.0/3.0,2.0/3.0))*6.0-3.0);return c.z*mix(vec3(1.0),clamp(p-1.0,0.0,1.0),c.y);}

float rfIdHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
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

  /* Local detail: how far this texel sits from the hide's mid value, measured
   * against the FLATTENED luminance so it no longer carries the photo's own
   * dorsal ramp. Kept as a signed term so pores and scars still read after the
   * recolor. */
  float detail = flatLum - uRfIdBakeBias;

  /* Countershade terminator along the MEASURED dorsal axis (uRfIdBindUp is
   * the per-bake axis prepareTemplate correlated against world up, so this
   * tracks reef/greatwhite skinned X and hammerhead skinned Z alike).
   * up == 1 at the dorsal ridge, 0 at the belly. A smoothstep keeps it a
   * wrap rather than a painted waterline. */
  /* Terminator. Widened from (0.32, 0.72) after measuring: on the right axis
   * that ramp still arrived as only +0.00 to +0.23 of countershade because the
   * cyan HemisphereLight and the FogExp2 sit on top of it and compress the
   * range hard (the same effect the Rev 13 notes recorded for the toon path).
   * A narrower window puts more of the flank firmly on one side or the other
   * instead of spending it all in the blend. */
  float shade = smoothstep(0.32, 0.72, up);

  /* Region color: belly hue below the terminator, base hue above it.
   *
   * Lane F2: take hue and saturation from the BASE swatch across the whole
   * body rather than from an RGB lerp toward the belly. The belly swatches are
   * authored near-white (measured v 0.93-1.00, s 0.04-0.14), so lerping toward
   * them in RGB collapsed both saturation AND hue on the lower half - and
   * because every row's belly is the same near-white, it collapsed every row
   * toward the SAME washed cyan. That is the mechanism behind mako/blue at
   * thumb distance 0.031 and frostjaw/stormfin/gloomtide/wreckfang/ironfin/
   * glacier/tempest/maelstrom all reading alike: the identity that separates
   * them lives in the base swatch and was being diluted away exactly where the
   * body is largest and brightest.
   *
   * The belly still reads as a belly, but through VALUE (below) and a modest
   * desaturation, not through a hue slide toward white. */
  vec3 baseHsv = rfIdRgbToHsv(uRfIdBaseColor);
  vec3 bellyHsv = rfIdRgbToHsv(uRfIdBellyColor);
  vec3 regionHsv = baseHsv;
  /* Belly keeps the row hue; only its saturation eases off, and never below a
   * floor that would let it wash out into the water. */
  regionHsv.y = mix(max(baseHsv.y * 0.62, 0.34), baseHsv.y, shade);
  /* A whisper of the authored belly hue survives, so a row whose belly swatch
   * is a deliberate second color (rather than plain white) still shows it. */
  regionHsv.x = mix(mix(bellyHsv.x, baseHsv.x, 0.78), baseHsv.x, shade);

  /* Lane F2 hue pre-compensation.
   *
   * The scene multiplies albedo by a cyan HemisphereLight (0x9fd4e8, hue
   * 0.546), blends the same cyan in as FogExp2, and then runs ACES filmic tone
   * mapping. All three pull hue toward the water: simulated over the real rig,
   * an authored 0.597 blue arrives at the camera as 0.557 after ACES alone,
   * and the round-2 report measured mako (authored #3d6fb5, hue 0.597) landing
   * at 0.446 - a teal, which is the exact complaint. Rotating the authored hue
   * AWAY from the water hue before lighting cancels that, so the row renders
   * as the blue it was authored to be. Interpolated the short way around the
   * wheel so a hue near 0 and a water hue near 0.55 do not sweep the spectrum. */
  float rfIdWaterGap = fract(regionHsv.x - uRfIdWaterHue + 1.5) - 0.5;
  regionHsv.x = fract(regionHsv.x + rfIdWaterGap * uRfIdHueComp);

  /* Target VALUE: dark back, bright belly, hard enough to clear the 0.06
   * countershade gate through the cyan fog, and centred so the flank lands
   * inside the 0.35..0.60 window the row gate reads. */
  /* Target VALUE. The span is deliberately wide: measured through the fog a
   * 0.30/0.78 split arrived as a 0.00-0.23 delta at the camera, so the
   * authored ramp has to over-drive to survive the water and land the row
   * inside the 0.35-0.60 flank window with a >= 0.06 belly-minus-back delta. */
  /* Lane F2: the VALUE BAND is part of the row's identity, not a constant.
   *
   * Two rows on the same base model with near-identical authored hues (mako
   * 0.597 against blue 0.577, glacier 0.565 against voltaicrex 0.614) cannot
   * separate on hue alone - 0.02 of hue is below what the thumbnail metric can
   * see through the fog. The authored palette already distinguishes them by
   * VALUE (mako base v 0.70 against blue 0.78; voltaicrex v 0.29 against
   * glacier v 0.77), so carry that through: anchor the band on the base
   * swatch's own value instead of flattening every row onto one 0.30/0.78
   * ramp. That is what turns a pair that reads alike into a dark row and a
   * bright row on the contact sheet. */
  float rfIdBandCenter = clamp(baseHsv.z, 0.16, 0.84);
  /* Half-span stays wide enough to clear the countershade gate through the
   * fog, and is squeezed only where the center would push a limit past 0..1. */
  float rfIdBandHalf = min(0.30, min(rfIdBandCenter - 0.03, 0.97 - rfIdBandCenter));
  /* The BACK is capped dark regardless of how bright the row's base swatch is.
   *
   * Letting a bright base carry the whole band upward gave rows like magmaw
   * and ironfin a genuinely bright BACK, and those hides carry a spiky dorsal
   * crest whose gaps are real openings inside the silhouette. Dark skin behind
   * those gaps masked them; bright skin does not, so the harness started
   * scoring them as background bleeding through the body (magmaw 0.010 ->
   * 0.245, ironfin 0.012 -> 0.227). The crest geometry is identical in round 2
   * - only the colour behind it changed - so this is the value band's doing.
   * Capping the back keeps a shark's back dark, which is also what the target
   * look wants, while the per-row separation continues to live in the BELLY
   * half of the band and in hue. */
  float backValue = min(rfIdBandCenter - rfIdBandHalf, 0.34);
  float bellyValue = rfIdBandCenter + rfIdBandHalf;
  float value = mix(bellyValue, backValue, shade);
  /* Fold the photo's detail back into that value. This is now the FLATTENED
   * detail (the bake's own dorsal ramp has been removed above), so it adds
   * pores, scales and scars without re-importing the gradient that used to
   * cancel the authored terminator. */
  value = clamp(value + detail * 0.62, 0.03, 1.0);

  /* Saturation floor so the row survives the fog wash. */
  float sat = clamp(max(regionHsv.y, 0.42), 0.0, 0.95);
  vec3 recolored = rfIdHsvToRgb(vec3(regionHsv.x, sat, value));

  /* Do NOT flatten the painted eye.
   *
   * The bakes paint eyes, nostrils and a mouth line into the diffuse, and the
   * recolor above rewrites value from a smooth dorsal ramp - which erases
   * exactly the local extremes O3's eye-highlight gate looks for (it counts
   * bright pixels inside the head crop). A shark whose eye has been averaged
   * into the flank has no highlight to find.
   *
   * So detect texels that sit far from the hide's mid value (a painted eye is
   * near-black with a specular catch-light, a lit flank is not) and let the
   * ORIGINAL photo value dominate there. The hue still comes from the palette,
   * so the row identity is unaffected; only the luminance extremes survive. */
  /* Lane F2: measure "extreme" against the FLATTENED detail so the test is a
   * genuine local feature and not just "this texel is on the dark half of the
   * bake's own gradient" - which is what let whole flanks qualify and blunted
   * the recolor. The preserved value is still the ORIGINAL photo luminance,
   * because that is where the painted eye's near-black core and its specular
   * catch-light actually live. Pushed to the true extremes and stretched
   * around the hide's mid so the catch-light survives the fog as a genuinely
   * bright pixel, which is what O3's gate counts. */
  float extreme = smoothstep(0.20, 0.40, abs(detail));
  float rfIdEyeLum = clamp(uRfIdBakeBias + (lum - uRfIdBakeBias) * 1.55, 0.0, 1.0);
  vec3 preserved = rfIdHsvToRgb(vec3(regionHsv.x, sat * 0.42, rfIdEyeLum));
  return mix(recolored, preserved, extreme);
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
function measureBindUp(mesh) {
  const position = mesh?.geometry?.getAttribute?.('position');
  if (!position || typeof mesh.applyBoneTransform !== 'function') return null;
  mesh.updateMatrixWorld?.(true);
  mesh.skeleton?.update?.();
  const local = new THREE.Vector3(), posed = new THREE.Vector3();
  /* Stride the mesh: a few hundred samples settle the correlation and this
   * runs once per rig build, not per frame. */
  const stride = Math.max(1, Math.floor(position.count / 400));
  const axes = [['x', new THREE.Vector3(1, 0, 0)], ['y', new THREE.Vector3(0, 1, 0)], ['z', new THREE.Vector3(0, 0, 1)]];
  let best = null;
  for (const [, axis] of axes) {
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < position.count; i += stride) {
      local.fromBufferAttribute(position, i);
      const a = local.dot(axis);
      posed.copy(local);
      mesh.applyBoneTransform(i, posed);
      posed.applyMatrix4(mesh.matrixWorld);
      const b = posed.y;
      n++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b;
    }
    const denominator = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    const correlation = denominator > 1e-9 ? (n * sxy - sx * sy) / denominator : 0;
    if (!best || Math.abs(correlation) > Math.abs(best.correlation)) best = { axis, correlation };
  }
  /* A weak best is not an answer: leave it to the caller's fallback. */
  if (!best || Math.abs(best.correlation) < 0.35) return null;
  return best.axis.clone().multiplyScalar(best.correlation > 0 ? 1 : -1);
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
  const base = colorValue(palette?.base, new THREE.Color(0.35, 0.46, 0.52));
  const belly = colorValue(palette?.belly, new THREE.Color(0.82, 0.90, 0.94));
  const accent = colorValue(palette?.accent, new THREE.Color(0.08, 0.52, 0.72));
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
    uRfIdGlowStrength: { value: glowClass ? (cls === CLASS_CODES.demon ? 0.82 : 0.68) : 0.0 },
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
    uRfIdAccentBlock: { value: ACCENT_BLOCK_STRENGTH }
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
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRfIdentityPosition = position;');
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
  vec3 rfIdAccentHsv = rfIdRgbToHsv(uRfIdAccentColor);
  vec3 rfIdBodyHsv = rfIdRgbToHsv(diffuseColor.rgb);
  /* Same water pre-compensation the base hue gets, or the accent lands teal
   * for exactly the reason the base did. */
  float rfIdAccGap = fract(rfIdAccentHsv.x - uRfIdWaterHue + 1.5) - 0.5;
  float rfIdAccHue = fract(rfIdAccentHsv.x + rfIdAccGap * uRfIdHueComp);
  /* Track the body's rendered VALUE so the accent does not punch a flat hole
   * in the countershade or erase the skin detail underneath it - but DARKEN
   * it, and hold a saturation floor.
   *
   * The first cut used the body value unchanged, and that regressed the
   * background-bleed gate hard (stormfin 0.005 -> 0.055, tempest 0.026 ->
   * 0.068, ironfin 0.002 -> 0.043 against a 0.02 gate). The bleed metric counts
   * body-interior pixels that match the water plate, and on a blue row the
   * accent was landing at the belly's own bright value in a hue the water
   * compensation had just steered toward cyan - a pale cyan block sitting
   * inside the silhouette, which is indistinguishable from a hole in the shark.
   * A marking that is DARKER and more saturated than the hide reads as a
   * marking and can never be mistaken for water. */
  float rfIdAccVal = clamp(rfIdBodyHsv.z * 0.62, 0.05, 0.72);
  vec3 rfIdAccentRgb = rfIdHsvToRgb(vec3(rfIdAccHue, clamp(max(rfIdAccentHsv.y, 0.58), 0.0, 0.95), rfIdAccVal));
  diffuseColor.rgb = mix(diffuseColor.rgb, rfIdAccentRgb, rfIdAccentMask);
}
vec3 rfIdMark = rfIdMarkColor(rfIdUp);
float rfIdMarkAmount = rfIdMask * clamp(uRfIdPatternMix, 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb * 0.34, rfIdMark * 1.22, 0.68), rfIdMarkAmount);
/* A restrained eye tint hook preserves the painted eye's value while letting
 * each row carry its authored eye color on baked face textures. */
float rfIdHead = 1.0 - smoothstep(0.03, 0.24, rfIdAlong);
float rfIdEyeBand = rfIdHead * smoothstep(0.035, 0.11, abs(rfIdLateral)) * (1.0 - smoothstep(0.72, 0.98, rfIdUp));
diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, uRfIdEyeColor * 1.35, 0.58), rfIdEyeBand * 0.12);
float rfIdSeamLine = 1.0 - smoothstep(0.018, 0.052, abs(fract(rfIdAlong * (7.0 + uRfIdTier * 0.18) + uRfIdPatternSeed * 0.07) - 0.5));
float rfIdClassGlow = uRfIdClass >= 3 ? 1.0 : 0.0;
float rfIdGlowMask = rfIdClassGlow * uRfIdGlowClass * (0.58 * rfIdSeamLine + 0.42 * rfIdMask) * step(0.22, rfIdUp);
totalEmissiveRadiance += uRfIdGlowColor * rfIdGlowMask * uRfIdGlowStrength * uRfIdPulse;
`;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${IDENTITY_FRAGMENT_GLSL}`)
    .replace('#include <map_fragment>', `#include <map_fragment>\n${identityCode}`);
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
      textured.uRfBindUp.value.copy(measured);
      if (extent && textured.uRfBindUpExtent) textured.uRfBindUpExtent.value = extent;
    }
    userData.rfIdentityMeasuredBindUp = measured.toArray();
    if (extent) userData.rfIdentityMeasuredBindUpExtent = extent;
    if (gradient) userData.rfIdentityBakeGradient = gradient;
    /* Idempotent, so running here as well as in applyIdentity() cannot damp
     * twice; this is the path a textured row actually takes. */
    dampTexturedCounterGain(userData);
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
