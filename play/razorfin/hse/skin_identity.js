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

const IDENTITY_UNIFORM_NAMES = Object.freeze([
  'uRfIdPattern', 'uRfIdClass', 'uRfIdTier', 'uRfIdPatternScale',
  'uRfIdPatternMix', 'uRfIdPatternContrast', 'uRfIdPatternSeed',
  'uRfIdBaseColor', 'uRfIdBellyColor', 'uRfIdAccentColor',
  'uRfIdDarkColor', 'uRfIdGlowColor', 'uRfIdEyeColor',
  'uRfIdBindUp', 'uRfIdBindUpExtent', 'uRfIdBodyAxis', 'uRfIdBodyExtent',
  'uRfIdGlowClass', 'uRfIdGlowStrength', 'uRfIdPulse'
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
  /* Local detail: how far this texel sits from the hide's mid value. Kept as
   * a signed term so pores and scars still read after the recolor. */
  float detail = lum - 0.5;

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

  /* Region color: belly hue below the terminator, base hue above it. */
  vec3 region = mix(uRfIdBellyColor, uRfIdBaseColor, shade);
  vec3 regionHsv = rfIdRgbToHsv(region);

  /* Target VALUE: dark back, bright belly, hard enough to clear the 0.06
   * countershade gate through the cyan fog, and centred so the flank lands
   * inside the 0.35..0.60 window the row gate reads. */
  /* Target VALUE. The span is deliberately wide: measured through the fog a
   * 0.30/0.78 split arrived as a 0.00-0.23 delta at the camera, so the
   * authored ramp has to over-drive to survive the water and land the row
   * inside the 0.35-0.60 flank window with a >= 0.06 belly-minus-back delta. */
  float backValue = 0.30, bellyValue = 0.78;
  float value = mix(bellyValue, backValue, shade);
  /* Fold the photo's own detail back into that value. Reduced from 0.62: the
   * bakes paint their OWN countershade, which on several rigs runs opposite to
   * the row's authored one, and at full strength it cancelled the ramp. */
  value = clamp(value + detail * 0.62, 0.04, 1.0);

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
  float extreme = smoothstep(0.22, 0.42, abs(detail));
  vec3 preserved = rfIdHsvToRgb(vec3(regionHsv.x, sat * 0.55, clamp(lum, 0.0, 1.0)));
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
    uRfIdPulse: { value: atomic ? 0.86 : 1.0 }
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
  const uniforms = identityUniforms(def, palette, {
    bindUp,
    bindUpExtent,
    bodyAxis: userData.rfIdentityBodyAxis,
    bodyExtent: userData.rfIdentityBodyExtent
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
  material.needsUpdate = true;
  return material;
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
      updated++;
    }
    if (textured?.uRfBindUp?.value?.copy) {
      textured.uRfBindUp.value.copy(measured);
      if (extent && textured.uRfBindUpExtent) textured.uRfBindUpExtent.value = extent;
    }
    userData.rfIdentityMeasuredBindUp = measured.toArray();
    if (extent) userData.rfIdentityMeasuredBindUpExtent = extent;
  }
  return { bindUp: measured.toArray(), bindUpExtent: extent, materials: updated };
}

export {
  IDENTITY_FRAGMENT_GLSL,
  IDENTITY_UNIFORM_NAMES,
  IDENTITY_VERTEX_GLSL,
  applyIdentity,
  identityUniforms,
  patternCode,
  retargetIdentityAxes,
  setIdentityPulse
};
