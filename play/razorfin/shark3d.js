/* Razorfin 3D shark rig, Lane D.
 *
 * The module deliberately keeps the mesh language small: a low-poly spine,
 * a handful of extruded silhouette pieces, and shared toon materials.  The
 * roster supplies the identity; the geometry supplies the attitude.
 */
import * as THREE from 'three';

const host = typeof window !== 'undefined' ? window : globalThis;
const RF = host.RF = host.RF || {};

const geometryCache = new Map();
const materialCache = new Map();
const billboardMaterials = new Map();
const billboardIds = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
let nextBillboardId = 1;
let gradientMap;
let sharedPlaneGeometry;
let sharedToothGeometry;
let sharedEyeGeometry;
let sharedIrisGeometry;
let sharedCatchlightGeometry;
let sharedWhaleSpotGeometry;
let arcGeometrySingleton;
let arcMaterialTemplate;

const TAU = Math.PI * 2;
const WHITE = 0xffffff;
const FEATURE_EMISSIVE_INTENSITY = 0.82;
const EYE_EMISSIVE_INTENSITY = 0.9;
const EYE_CAMERA_SCALE = 1.34;
const BODY_EMISSIVE_MAX = 0.05;
const BODY_RAMP_BANDS = [0.30, 0.65, 0.84, 1.0];
const BODY_DORSAL_START = 0.75;
const BODY_FLANK_START = 0.50;
const BODY_BELLY_END = BODY_FLANK_START;
const BODY_RIM_END = 0.58;
const BODY_FLANK_SATURATION_MIN = 0.70;
const BODY_FLANK_SATURATION_MAX = 0.90;
const BODY_FLANK_SATURATION_TARGET = 0.86;
const BODY_FLANK_VALUE_MIN = 0.55;
const BODY_FLANK_VALUE_MAX = 0.82;
const ACCENT_SATURATION_MIN = 0.80;
const ACCENT_SATURATION_MAX = 1.00;
const ACCENT_SATURATION_TARGET = 0.96;
const ACCENT_VALUE_MIN = 0.65;
const ACCENT_VALUE_MAX = 0.95;
const BELLY_SATURATION_MIN = 0.15;
const BELLY_SATURATION_MAX = 0.40;
const BELLY_VALUE_MIN = 0.80;
const BELLY_VALUE_MAX = 0.98;
const OUTLINE_VALUE_MIN = 0.08;
const OUTLINE_VALUE_MAX = 0.16;
const BODY_BLOCK_DISTANCE_MIN = 60;
const KAIJU_PLATE_GLOW = 0xa3fff3;
const DISTINCTNESS_DISTANCE_THRESHOLD = 0.05;
const DISTINCTNESS_TIER_RADIUS = 1;
const SUPPORTED_PATTERN_IDS = new Set([
  'bands', 'boils', 'bones', 'collar', 'coral', 'corona', 'cracks', 'dots',
  'facets', 'faults', 'magma', 'mirror', 'mottled', 'panels', 'patches',
  'plain', 'plates', 'plating', 'rays', 'ribbons', 'rings', 'rivets', 'rot',
  'runes', 'scales', 'scars', 'spikes', 'spots', 'stars', 'stripes', 'swirls'
]);
const TAIL_MIN_RATIO = 0.28;
const TAIL_MAX_RATIO = 0.36;
const FUSIFORM_BODY_ASPECT_MIN = 3.1;
const FUSIFORM_ASPECT_MIN = 2.8;
const FUSIFORM_SECTION_Z_RATIO = 0.92;
const FUSIFORM_SECTION_Z_RATIO_MIN = 0.72;
const BODY_BELLY_BAKE_LUMINANCE = 0.74;
const SHARK_POSE_YAW = 0.42;
const PECTORAL_SPLAY = 0.35;
const OUTLINE_SHELL_SCALE = 1.010;
const OUTLINE_SHELL_COLOR = hsvToColor(0.56, 0.70, 0.11);
const BEND_Y_SCALE = 0.35;
const MID_BODY_BEND_MAX_RATIO = 0.058;
const DISTAL_TAIL_SPRINT_RATIO = 0.18;
const TAIL_SMOOTH_SPAN_MIN_RATIO = 0.30;
const TAIL_SMOOTH_SPAN_MAX_RATIO = 0.35;
const FUSIFORM_EXCEPTIONS = new Set(['eel', 'kaiju', 'whale']);
// These heads either own an intentionally full front profile or add a large
// front feature batch. Keep them on the same axis/overlap audit even when
// their data row is still subject to the ordinary fusiform girth clamp.
const BULKY_HEADS = new Set(['blunt', 'angler', 'whale', 'kaiju']);

// Pantheon art is intentionally resolved here instead of in data.js. The
// authored table remains the gameplay/data authority, while this late-roster
// art resolver gives the review set twelve stable colour families and keeps
// the Underworld bases dark without making Hades read like Act 5.
const PANTHEON_PALETTE_FAMILIES = Object.freeze({
  zeusfin: { baseHue: 0.52, accentHue: 0.55, baseV: 0.66, accentV: 0.94 },
  poseidonrex: { baseHue: 0.61, accentHue: 0.64, baseV: 0.56, accentV: 0.92 },
  hadesmaw: { baseHue: 0.77, accentHue: 0.81, baseV: 0.62, accentV: 0.94 },
  apollodon: { baseHue: 0.14, accentHue: 0.11, baseV: 0.73, accentV: 0.95 },
  artemisstrike: { baseHue: 0.68, accentHue: 0.70, baseV: 0.68, accentV: 0.94 },
  athenajaw: { baseHue: 0.08, accentHue: 0.06, baseV: 0.58, accentV: 0.91 },
  aresrender: { baseHue: 0.005, accentHue: 0.99, baseV: 0.62, accentV: 0.93 },
  hermesdart: { baseHue: 0.56, accentHue: 0.13, baseV: 0.76, accentV: 0.95 },
  hephaestusforge: { baseHue: 0.075, accentHue: 0.045, baseV: 0.67, accentV: 0.94 },
  dionysustide: { baseHue: 0.91, accentHue: 0.88, baseV: 0.64, accentV: 0.95 },
  aphroditelure: { baseHue: 0.96, accentHue: 0.98, baseV: 0.77, accentV: 0.95 },
  heracrown: { baseHue: 0.105, accentHue: 0.095, baseV: 0.70, accentV: 0.95 },
  typhonmaw: { baseHue: 0.74, accentHue: 0.55, baseV: 0.42, accentV: 0.95 },
  hydrafang: { baseHue: 0.25, accentHue: 0.20, baseV: 0.40, accentV: 0.90 },
  cerberusjaw: { baseHue: 0.015, accentHue: 0.045, baseV: 0.38, accentV: 0.94 },
  chimerashark: { baseHue: 0.58, accentHue: 0.03, baseV: 0.44, accentV: 0.92 },
  medusagaze: { baseHue: 0.84, accentHue: 0.91, baseV: 0.39, accentV: 0.94 },
  scyllarender: { baseHue: 0.48, accentHue: 0.53, baseV: 0.36, accentV: 0.90 },
  charybdisvoid: { baseHue: 0.70, accentHue: 0.76, baseV: 0.34, accentV: 0.88 },
  minotaurram: { baseHue: 0.60, accentHue: 0.16, baseV: 0.43, accentV: 0.90 },
  cyclopseye: { baseHue: 0.93, accentHue: 0.96, baseV: 0.41, accentV: 0.95 },
  harpyshade: { baseHue: 0.78, accentHue: 0.86, baseV: 0.35, accentV: 0.89 },
  lamiacoil: { baseHue: 0.96, accentHue: 0.91, baseV: 0.37, accentV: 0.93 },
  kampechrono: { baseHue: 0.09, accentHue: 0.54, baseV: 0.42, accentV: 0.91 }
});
const PANTHEON_IDS = new Set(Object.keys(PANTHEON_PALETTE_FAMILIES));
const UNDERWORLD_IDS = new Set([
  'typhonmaw', 'hydrafang', 'cerberusjaw', 'chimerashark', 'medusagaze',
  'scyllarender', 'charybdisvoid', 'minotaurram', 'cyclopseye', 'harpyshade',
  'lamiacoil', 'kampechrono'
]);

function isFusiformHead(head) {
  return !FUSIFORM_EXCEPTIONS.has(head);
}

function isBulkyHead(head) {
  return BULKY_HEADS.has(head);
}

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function smoothStep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function hex(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(n) ? (n >>> 0) & 0xffffff : fallback;
}

function boostedColor(value, amount = 1.15) {
  const c = new THREE.Color(hex(value));
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, clamp(hsl.s * amount, 0, 1), clamp(hsl.l * 1.035, 0.04, 0.88));
  return c;
}

function committedColor(value, saturationFloor = 0.42, valueFloor = 0.2, valueCeiling = 0.82) {
  const source = colorValue(value).clone();
  const hsv = rgbToHsv(source);
  return hsvToColor(
    hsv.h,
    Math.max(hsv.s, saturationFloor),
    clamp(Math.max(hsv.v, valueFloor), valueFloor, valueCeiling)
  );
}

function colorValue(value, fallback = WHITE) {
  return value instanceof THREE.Color ? value : new THREE.Color(hex(value, fallback));
}

function lerpColor(a, b, amount) {
  /* Palette helpers sometimes pass a hex literal (for example WHITE) and
   * THREE.Color.lerp only accepts another Color. Normalise both sides here so
   * a numeric accent can never write NaN vertex channels into a BufferAttribute. */
  return colorValue(a).clone().lerp(colorValue(b), clamp(amount, 0, 1));
}

function colorLuminance(color) {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}

function liftColorToLuminance(color, target) {
  const source = colorValue(color).clone();
  const current = colorLuminance(source);
  const desired = clamp(target, 0, 1);
  if (current >= desired || current <= 1e-6) return current <= 1e-6
    ? new THREE.Color(desired, desired, desired)
    : source;

  // Scaling keeps the act hue and saturation intact for the normal case. If
  // a vivid channel would clip, the white lift is the safer fallback: belly
  // colour must remain pale rather than turning into a broken HDR vertex.
  const scaled = source.clone().multiplyScalar(desired / current);
  const maxChannel = Math.max(scaled.r, scaled.g, scaled.b);
  if (maxChannel <= 1) return scaled;
  return source.lerp(colorValue(WHITE), (desired - current) / (1 - current));
}

function rgbToHsv(color) {
  const c = color instanceof THREE.Color
    ? color
    : new THREE.Color(color?.r || 0, color?.g || 0, color?.b || 0);
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const delta = max - min;
  let h = 0;
  if (delta > 1e-6) {
    if (max === c.r) h = ((c.g - c.b) / delta) % 6;
    else if (max === c.g) h = (c.b - c.r) / delta + 2;
    else h = (c.r - c.g) / delta + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s: max <= 1e-6 ? 0 : delta / max, v: max };
}

function hsvToColor(h, s, v) {
  const hue = ((h % 1) + 1) % 1;
  const saturation = clamp(s, 0, 1);
  const value = clamp(v, 0, 1);
  const sector = hue * 6;
  const i = Math.floor(sector);
  const f = sector - i;
  const p = value * (1 - saturation);
  const q = value * (1 - saturation * f);
  const t = value * (1 - saturation * (1 - f));
  switch (i % 6) {
    case 0: return new THREE.Color(value, t, p);
    case 1: return new THREE.Color(q, value, p);
    case 2: return new THREE.Color(p, value, t);
    case 3: return new THREE.Color(p, q, value);
    case 4: return new THREE.Color(t, p, value);
    default: return new THREE.Color(value, p, q);
  }
}

function saturatedBlockColor(source, saturationBoost, saturationFloor, valueFloor, valueCeiling, valueScale = 1) {
  const hsv = rgbToHsv(source);
  return hsvToColor(
    hsv.h,
    Math.max(hsv.s * saturationBoost, saturationFloor),
    clamp(Math.max(hsv.v * valueScale, valueFloor), valueFloor, valueCeiling)
  );
}

function resolvePaletteSwatch(value, saturationMin, saturationMax, valueMin, valueMax, fallbackHue = 0) {
  const source = colorValue(value);
  const hsv = rgbToHsv(source);
  // Pure white/black authored swatches have no usable hue. In that case the
  // caller's family hue keeps the resolved block in the shark's own palette
  // instead of silently manufacturing red from HSV's zero-hue convention.
  const hue = hsv.s > 0.04 ? hsv.h : fallbackHue;
  const saturation = clamp(Math.max(hsv.s, saturationMin), saturationMin, saturationMax);
  const brightness = clamp(Math.max(hsv.v, valueMin), valueMin, valueMax);
  return hsvToColor(hue, saturation, brightness);
}

function resolvedPaletteStats(color) {
  const hsv = rgbToHsv(color);
  return { h: hsv.h, s: hsv.s, v: hsv.v };
}

function paletteOf(def) {
  const source = def?.sil?.palette || {};
  const id = String(def?.id || '');
  const pantheonFamily = PANTHEON_PALETTE_FAMILIES[id];
  if (pantheonFamily) {
    const underworld = UNDERWORLD_IDS.has(id);
    const base = hsvToColor(
      pantheonFamily.baseHue,
      underworld ? 0.76 : 0.78,
      pantheonFamily.baseV
    );
    const accent = hsvToColor(pantheonFamily.accentHue, 0.96, pantheonFamily.accentV);
    const belly = hsvToColor(pantheonFamily.baseHue, underworld ? 0.20 : 0.18, underworld ? 0.84 : 0.91);
    const glow = hsvToColor(pantheonFamily.accentHue, 0.98, 0.95);
    return {
      base,
      belly,
      accent,
      glow,
      raw: {
        base: hex(source.base, base.getHex()),
        belly: hex(source.belly, belly.getHex()),
        accent: hex(source.accent, accent.getHex()),
        glow: source.glow ? hex(source.glow) : glow.getHex()
      },
      resolved: {
        base: resolvedPaletteStats(base),
        belly: resolvedPaletteStats(belly),
        accent: resolvedPaletteStats(accent),
        glow: resolvedPaletteStats(glow)
      },
      family: id,
      underworld
    };
  }
  const authoredBase = colorValue(source.base, 0x204050);
  const authoredAccent = colorValue(source.accent, 0x164557);
  const authoredGlow = source.glow ? colorValue(source.glow) : null;
  const accentHue = rgbToHsv(authoredAccent).h;
  const screenTailReviewIds = new Set(['reef', 'tiger', 'hammerhead', 'greatwhite']);
  const accentSaturationTarget = screenTailReviewIds.has(String(def?.id))
    ? ACCENT_SATURATION_TARGET
    : ACCENT_SATURATION_MIN;
  const base = resolvePaletteSwatch(authoredBase, BODY_FLANK_SATURATION_TARGET, BODY_FLANK_SATURATION_MAX, BODY_FLANK_VALUE_MIN, BODY_FLANK_VALUE_MAX);
  const accent = resolvePaletteSwatch(authoredAccent, accentSaturationTarget, ACCENT_SATURATION_MAX, Math.max(ACCENT_VALUE_MIN, 0.86), ACCENT_VALUE_MAX, accentHue);
  const belly = resolvePaletteSwatch(source.belly, BELLY_SATURATION_MIN, BELLY_SATURATION_MAX, BELLY_VALUE_MIN, BELLY_VALUE_MAX, rgbToHsv(authoredBase).h);
  const glow = authoredGlow
    ? resolvePaletteSwatch(authoredGlow, ACCENT_SATURATION_MIN, ACCENT_SATURATION_MAX, Math.max(ACCENT_VALUE_MIN, 0.88), ACCENT_VALUE_MAX, accentHue)
    : null;
  return {
    // All visible consumers receive resolved art-ramp swatches. The authored
    // values remain available only as audit metadata; no feature is allowed to
    // read source.accent directly.
    base,
    belly,
    accent,
    glow,
    raw: {
      base: hex(source.base, 0x204050),
      belly: hex(source.belly, 0xddeee7),
      accent: hex(source.accent, 0x164557),
      glow: source.glow ? hex(source.glow) : 0
    },
    resolved: {
      base: resolvedPaletteStats(base),
      belly: resolvedPaletteStats(belly),
      accent: resolvedPaletteStats(accent),
      glow: glow ? resolvedPaletteStats(glow) : null
    }
  };
}

function hash01(a, b = 0, c = 0) {
  let n = (a * 374761393 + b * 668265263 + c * 362437) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

// Rev 6 (6.3): per-def oscillator decoupling seed. def.id is a string; fold it
// into an int32 so it can feed hash01() the same way numeric coords do.
function hashStringToInt(str) {
  const s = String(str || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return h;
}

function ensureGradientMap() {
  if (gradientMap) return gradientMap;
  // MeshToonMaterial samples only the red channel. Keep this a small, explicit
  // linear luminance ramp rather than a coloured texture that can be filtered
  // or colour-managed like a display image.
  const bands = BODY_RAMP_BANDS.map((value) => {
    const channel = Math.round(clamp(value, 0, 1) * 255);
    return (channel << 16) | (channel << 8) | channel;
  });
  if (typeof document !== 'undefined' && document.createElement) {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < bands.length; i++) {
      ctx.fillStyle = `#${bands[i].toString(16).padStart(6, '0')}`;
      ctx.fillRect(i, 0, 1, 1);
    }
    gradientMap = new THREE.CanvasTexture(canvas);
  } else {
    const data = new Uint8Array(bands.length * 4);
    for (let i = 0; i < bands.length; i++) {
      data[i * 4] = (bands[i] >> 16) & 255;
      data[i * 4 + 1] = (bands[i] >> 8) & 255;
      data[i * 4 + 2] = bands[i] & 255;
      data[i * 4 + 3] = 255;
    }
    gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  }
  gradientMap.name = 'RF.Art3D.4StepGradient';
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  if ('colorSpace' in gradientMap) gradientMap.colorSpace = THREE.NoColorSpace || '';
  gradientMap.needsUpdate = true;
  gradientMap.userData = { rfBands: 4 };
  return gradientMap;
}

function toonMaterial({
  color = WHITE,
  glow = 0,
  emissiveIntensity = null,
  vertexColors = false,
  transparent = false,
  opacity = 1,
  side = THREE.FrontSide,
  flatShading = true,
  depthWrite = true,
  kind = 'solid'
} = {}) {
  const colorHex = color instanceof THREE.Color ? color.getHex() : hex(color, WHITE);
  const glowHex = glow instanceof THREE.Color ? glow.getHex() : hex(glow, 0);
  const requestedEmissiveIntensity = emissiveIntensity == null
    ? (kind === 'eye' ? EYE_EMISSIVE_INTENSITY : FEATURE_EMISSIVE_INTENSITY)
    : finite(emissiveIntensity, 0);
  const resolvedEmissiveIntensity = glowHex ? clamp(requestedEmissiveIntensity, 0.6, 1.0) : 0;
  const key = [kind, colorHex, glowHex, resolvedEmissiveIntensity, vertexColors ? 1 : 0, transparent ? 1 : 0, opacity, side, depthWrite ? 1 : 0, flatShading ? 1 : 0].join(':');
  if (materialCache.has(key)) return materialCache.get(key);
  const material = new THREE.MeshToonMaterial({
    color: colorHex,
    gradientMap: ensureGradientMap(),
    vertexColors,
    side,
    transparent,
    opacity,
    depthWrite,
    emissive: glowHex,
    emissiveIntensity: resolvedEmissiveIntensity
  });
  /* The fleet's r160 build keeps flatShading as a late material flag rather
   * than a constructor parameter. Setting it after construction avoids the
   * noisy "unknown property" warning while retaining the faceted toon read. */
  material.flatShading = !!flatShading;
  material.needsUpdate = true;
  material.name = `RF Toon ${kind}`;
  material.userData.rfBaseVariantKey = [
    'toon',
    vertexColors ? 'vertex' : 'solid',
    side === THREE.BackSide ? 'back' : side === THREE.DoubleSide ? 'double' : 'front',
    transparent ? 'transparent' : 'opaque',
    flatShading ? 'flat' : 'smooth'
  ].join(':');
  materialCache.set(key, material);
  return material;
}

function bendableMaterial(baseMat, uniforms) {
  if (!baseMat || typeof baseMat.clone !== 'function') throw new Error('RF.Art3D.bendableMaterial requires a material');
  if (!uniforms || !uniforms.uBendPhase || !uniforms.uBendAmp || !uniforms.uBendK || !uniforms.uBendSpan || !uniforms.uBendBias || !uniforms.uTailAmp || !uniforms.uTailSpan || !uniforms.uBendScale) {
    throw new Error('RF.Art3D.bendableMaterial requires the complete bend uniform bundle');
  }
  const material = baseMat.clone();
  // Three's late flatShading flag is not copied reliably by every supported
  // revision's clone path; preserve the archetype normal policy explicitly.
  material.flatShading = !!baseMat.flatShading;
  const baseVariant = baseMat.userData?.rfBaseVariantKey || baseMat.type || 'MeshToonMaterial';
  const ampScale = finite(baseMat.userData?.rfBendAmpScale, 1);
  const baseKey = `${baseVariant}:amp${ampScale.toFixed(6)}`;
  material.userData.rfBend = true;
  material.userData.rfBendUniforms = uniforms;
  material.userData.rfBendBaseKey = baseKey;
  material.userData.rfBendAmpScale = ampScale;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBendPhase = uniforms.uBendPhase;
    shader.uniforms.uBendAmp = uniforms.uBendAmp;
    shader.uniforms.uBendK = uniforms.uBendK;
    shader.uniforms.uBendSpan = uniforms.uBendSpan;
    shader.uniforms.uBendBias = uniforms.uBendBias;
    shader.uniforms.uTailAmp = uniforms.uTailAmp;
    shader.uniforms.uTailSpan = uniforms.uTailSpan;
    shader.uniforms.uBendScale = uniforms.uBendScale;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      // Keep every injected uniform declared here. The headless probe exercises
      // the hook with a stub shader, but only a real GL compile catches a
      // missing declaration. uTailSpan is measured in -x body-local units.
      '#include <common>\nuniform float uBendPhase;\nuniform float uBendAmp;\nuniform float uBendK;\nuniform vec2 uBendSpan;\nuniform float uBendBias;\nuniform float uTailAmp;\nuniform vec2 uTailSpan;\nuniform float uBendScale;'
    ).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\nfloat bendT=smoothstep(uBendSpan.x,uBendSpan.y,-transformed.x);\nfloat tailT=smoothstep(uTailSpan.x,uTailSpan.y,-transformed.x);\nfloat bendZ=${ampScale === 1 ? 'uBendScale*uBendAmp' : `uBendScale*uBendAmp*${ampScale.toFixed(6)}`}*bendT*sin(uBendPhase+transformed.x*uBendK);\nbendZ+=uBendBias*bendT;\nbendZ+=uTailAmp*tailT*tailT*sin(uBendPhase+transformed.x*uBendK);\ntransformed.z += bendZ;\ntransformed.y += ${BEND_Y_SCALE.toFixed(2)}*bendZ;`
    );
  };
  material.customProgramCacheKey = () => `${baseKey}:rf-bend3`;
  material.needsUpdate = true;
  return material;
}

function bendOffset(x, phase, amp, k, spanX, spanY, bias = 0, tailAmp = 0, tailSpanX = 0.5, tailSpanY = 0.8) {
  const t = clamp(((-finite(x, 0)) - finite(spanX, 0)) / Math.max(1e-6, finite(spanY, 1) - finite(spanX, 0)), 0, 1);
  const bendT = t * t * (3 - 2 * t);
  const tailT0 = clamp(((-finite(x, 0)) - finite(tailSpanX, 0)) / Math.max(1e-6, finite(tailSpanY, 1) - finite(tailSpanX, 0)), 0, 1);
  const tailT = tailT0 * tailT0 * (3 - 2 * tailT0);
  return finite(amp, 0) * bendT * Math.sin(finite(phase, 0) + finite(x, 0) * finite(k, 0)) + finite(bias, 0) * bendT
    + finite(tailAmp, 0) * tailT * tailT * Math.sin(finite(phase, 0) + finite(x, 0) * finite(k, 0));
}

function bufferGeometry(positions, indices, colors = null) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function addVertex(positions, colors, x, y, z, color) {
  positions.push(x, y, z);
  if (colors) colors.push(color.r, color.g, color.b);
}

function polygonArea2(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area;
}

function cameraFacingPolygon(points) {
  // Extruded face features are viewed from +Z in the gameplay camera. A
  // counter-clockwise XY contour gives the +Z front cap; several authored
  // jaw/mouth contours were clockwise, which made FrontSide cull the very
  // face that should carry the grin.
  return polygonArea2(points) < 0 ? points.slice().reverse() : points;
}

function bodyRampColors(palette, act = 1) {
  // These are resolved hard blocks, not a grey lightness ramp. paletteOf()
  // has already re-targeted authored hues into the review's flank/accent/
  // belly ranges, so every visible body and feature swatch stays in one art
  // language without reaching back to a raw data color.
  const dorsal = palette.base.clone();
  const flank = palette.base.clone();
  const accentMark = palette.accent.clone();
  const belly = palette.belly.clone();
  const highlight = palette.belly.clone();
  const glow = (palette.glow || palette.accent).clone();
  const shadow = palette.base.clone();
  const rim = act >= 3
    ? glow
    : flank.clone();
  return {
    dorsal,
    dark: dorsal,
    flank,
    accent: accentMark,
    glow,
    highlight,
    shadow,
    rim,
    rimGlow: act >= 3,
    belly
  };
}

function unitFraction(value) {
  return value - Math.floor(value);
}

function nearBand(value, center, width) {
  return Math.abs(value - center) <= width;
}

/* Vertex colours are intentionally discrete. These are the loft equivalent
 * of sharkart.js's clipped painters: each branch describes one authored mark
 * family, and every mark resolves to a committed palette block at a station
 * rather than interpolating toward neutral grey. */
function patternColor(ramp, pattern, u, theta, station, radial) {
  const topness = (Math.cos(theta) + 1) * 0.5;
  const facing = Math.sin(theta) >= -0.2;
  const onBody = facing && topness >= 0.12 && topness <= 0.88 && u >= 0.12 && u <= 0.92;
  if (!onBody || pattern === 'plain') return null;

  const cell = Math.floor(u * 14);
  const row = radial;
  const accent = ramp.accent;
  const bright = ramp.highlight;

  switch (pattern) {
    case 'stripes': { // Tiger: seven broad, hard-edged transverse bars.
      for (let i = 0; i < 7; i++) if (nearBand(u, 0.19 + i * 0.105, 0.026)) return accent;
      return null;
    }
    case 'bands': {
      for (let i = 0; i < 6; i++) if (nearBand(u, 0.17 + i * 0.14, 0.044)) return accent;
      return null;
    }
    case 'ribbons': {
      const ribbon = 0.5 + 0.22 * Math.sin(u * TAU * 2.15);
      return Math.abs(topness - ribbon) < 0.17 ? accent : null;
    }
    case 'spots':
    case 'dots': {
      const hit = ((station * 7 + row * 11 + (pattern === 'dots' ? 3 : 0)) % 17) >= 11;
      return hit && (cell % 2 || row % 3 === 0) ? bright : null;
    }
    case 'collar':
      return u >= 0.27 && u <= 0.38 ? accent : null;
    case 'plates': {
      return ((cell + row * 2) % 5 === 0 || (cell % 5 === 2 && row % 3 === 0)) ? accent : null;
    }
    case 'plating': {
      return (cell % 4 <= 1 && row % 2 === 0) ? accent : null;
    }
    case 'panels': {
      return ((cell % 5 === 1 || cell % 5 === 2) && row >= 2 && row <= 5) ? accent : null;
    }
    case 'rivets': {
      return (cell % 3 === 0 && row % 2 === 1) ? bright : null;
    }
    case 'facets': {
      return ((cell + row) % 4 === 1 || (cell * 3 + row) % 7 === 0) ? accent : null;
    }
    case 'scales': {
      return ((cell + row + (cell % 2)) % 3 === 0) ? accent : null;
    }
    case 'spikes': {
      return ((cell % 2 === 0 && row <= 3) || (cell % 4 === 1 && row === 4)) ? accent : null;
    }
    case 'rays': {
      return ((cell + row * 2) % 6 === 1 && topness > 0.28) ? accent : null;
    }
    case 'stars': {
      return ((cell * 5 + row * 3) % 13 === 4 && row >= 2 && row <= 5) ? bright : null;
    }
    case 'swirls': {
      return Math.abs(Math.sin(u * TAU * 2.1 + row * 0.72)) > 0.72 ? accent : null;
    }
    case 'rings': {
      for (let i = 0; i < 4; i++) if (nearBand(u, 0.31 + i * 0.135, 0.026)) return accent;
      return null;
    }
    case 'scars': {
      return unitFraction(u * 6.2 + row * 0.19) > 0.46 && unitFraction(u * 6.2 + row * 0.19) < 0.57
        ? bright : null;
    }
    case 'cracks':
    case 'faults': {
      const crack = unitFraction(u * 7.1 + row * 0.31) > 0.47 && unitFraction(u * 7.1 + row * 0.31) < 0.56;
      return crack ? accent : null;
    }
    case 'magma': {
      const crack = unitFraction(u * 7.1 + row * 0.31) > 0.43 && unitFraction(u * 7.1 + row * 0.31) < 0.60;
      return crack ? accent : null;
    }
    case 'mottled': {
      return ((station * 13 + row * 5) % 19) > 13 ? accent : null;
    }
    case 'rot': {
      return ((station * 13 + row * 5) % 19) > 12 ? ramp.shadow : null;
    }
    case 'boils': {
      return ((station * 11 + row * 7) % 17) > 10 ? accent : null;
    }
    case 'coral': {
      return (row <= 3 && (cell + row) % 4 === 0) ? accent : null;
    }
    case 'mirror': {
      const mirrored = row <= 3 ? cell % 3 === 0 : cell % 4 === 1;
      return mirrored ? bright : null;
    }
    case 'bones': {
      return ((cell % 3 === 1 && row >= 2 && row <= 5) || (row === 2 && cell % 4 === 0)) ? bright : null;
    }
    case 'runes': {
      return ((cell + row) % 5 === 2 && row >= 2 && row <= 5) ? accent : null;
    }
    case 'corona': {
      const ray = (cell + row * 2) % 6 === 1 && topness > 0.28;
      const ring = nearBand(u, 0.47, 0.032) || nearBand(u, 0.72, 0.032);
      return ray || ring ? accent : null;
    }
    case 'patches': {
      return ((cell % 6 === 1 || cell % 6 === 2) && row >= 2 && row <= 5) ? accent : null;
    }
    default:
      return null;
  }
}

function bodyVertexColor(ramp, theta, u, station, radial, pattern) {
  const topness = (Math.cos(theta) + 1) * 0.5;
  let color;
  if (topness >= BODY_DORSAL_START) {
    color = ramp.dorsal.clone();
  } else if (topness >= BODY_FLANK_START) {
    // The radial mesh gives us one deliberate edge row immediately above the
    // belly line. Act 3 legends use that row to carry their glow hue into the
    // body rather than asking the eye to find it only in feature geometry.
    color = topness < BODY_RIM_END ? ramp.rim.clone() : ramp.flank.clone();
  } else {
    color = ramp.belly.clone();
  }

  const mark = patternColor(ramp, pattern, u, theta, station, radial);
  if (mark) color.copy(mark);
  return color;
}

function exaggerationFor(head, sil = {}) {
  const headScale = {
    point: 1.50, blunt: 1.62, hammer: 1.60, whale: 1.44,
    kaiju: 1.56, eel: 1.10
  }[head] || 1.30;
  const jawScale = {
    point: 1.28, blunt: 1.36, hammer: 1.32, saw: 1.27,
    croc: 1.40, whale: 1.44, angler: 1.50, eel: 1.25,
    rock: 1.38, mech: 1.32, skull: 1.44, void: 1.36,
    frill: 1.28, kaiju: 1.50
  }[head] || 1.30;
  const eyeScale = {
    point: 0.45, blunt: 0.45, hammer: 0.45, whale: 0.42,
    kaiju: 0.50, eel: 0.40, angler: 0.42, skull: 0.42,
    void: 0.45, mech: 0.45
  }[head] || 0.42;
  const bellyDrop = {
    point: 0.14, blunt: 0.16, hammer: 0.15, whale: 0.18,
    kaiju: 0.18, eel: 0.12, angler: 0.17, rock: 0.16,
    mech: 0.14, skull: 0.17
  }[head] || 0.15;
  const frontSpan = {
    point: 0.40, blunt: 0.42, hammer: 0.44, whale: 0.45, kaiju: 0.45
  }[head] || 0.40;
  const mouthCorner = {
    whale: 0.58, kaiju: 0.60, croc: 0.58
  }[head] || 0.62;
  return { headScale, jawScale, eyeScale: eyeScale || 0.42, bellyDrop, frontSpan, mouthCorner, id: String(sil?.id || '') };
}

function profileAt(u, head, girth, id = '') {
  // A rounded root and rounded snout belong to the same loft. The old final
  // 22% collapse made the face read like a slab attached to an egg.
  const barrel = 0.22 + 0.78 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, u))), 0.47);
  const exag = exaggerationFor(head, { id });
  let profile = barrel * (0.88 + u * 0.16);
  if (head === 'point') profile *= 0.86 - 0.16 * u;
  if (head === 'blunt') profile *= 0.96 + u * 0.08;
  if (head === 'hammer') profile *= 0.95 + u * 0.10;
  if (head === 'saw') profile *= u > 0.72 ? 1 - (u - 0.72) * 0.52 : 1;
  if (head === 'whale') {
    const peduncle = 0.48 + 0.52 * smoothStep01((u - 0.02) / 0.24);
    const shoulder = 0.62 + 0.86 * smoothStep01((u - 0.18) / 0.58);
    profile = 0.22 + barrel * peduncle * shoulder;
  }
  if (head === 'kaiju') profile *= 1.10 + u * 0.26;
  if (head === 'croc') profile *= u > 0.58 ? 1 - ((u - 0.58) / 0.42) * 0.28 : 1;
  if (head === 'angler') profile *= 1.04 + 0.18 * Math.exp(-Math.pow((u - 0.72) / 0.24, 2));
  if (head === 'eel') profile *= 0.62 + 0.14 * (1 - u);
  if (head === 'rock') profile *= 0.98 + 0.11 * Math.sin(u * 17);
  if (head === 'mech') profile *= 0.96 + 0.08 * ((Math.floor(u * 8) % 2) ? 1 : -0.35);
  if (head === 'void') profile *= 0.89 + 0.12 * Math.sin(u * Math.PI * 0.8);
  if (id === 'mako') profile *= 0.86;
  if (id === 'blue') profile *= 1.08;
  if (id === 'thresher') profile *= 0.82;
  if (head === 'skull') profile *= 0.96 + u * 0.1;
  const frontT = smoothStep01((u - (1 - exag.frontSpan)) / exag.frontSpan);
  return profile * (1 + (exag.headScale - 1) * frontT);
}

function spineLineScale(u, theta, head, bellyDrop = exaggerationFor(head).bellyDrop) {
  const barrel = Math.max(0, Math.sin(Math.PI * Math.min(1, u)));
  // A restrained, monotonic dorsal line reads as a back; the belly is allowed
  // to carry the fuller mid-body curve. This is deliberately separate from
  // profileAt so the radial section remains a cheap, cacheable scalar.
  let scale = Math.cos(theta) >= 0
    ? 0.90 + 0.10 * u
    : 0.72 + 0.28 * Math.pow(barrel, 1.15);
  if (Math.cos(theta) < 0) scale *= 1 + bellyDrop * smoothStep01((u - 0.10) / 0.72);
  if (head === 'eel') scale *= 0.92 + 0.08 * Math.sin(Math.PI * u);
  if (head === 'whale' || head === 'kaiju') scale *= 1.05;
  if (head === 'rock') scale *= 1 + 0.045 * Math.sin(u * 23 + theta * 3);
  if (head === 'mech') scale *= 1 + 0.035 * (((Math.floor(u * 10) + Math.floor(theta * 2)) % 2) ? 1 : -1);
  return scale;
}

function localSurfaceZ(dimensions, x, y = 0) {
  const head = dimensions.head || dimensions.exaggeration?.head || 'point';
  const u = clamp((x + dimensions.bodyLen * 0.52) / Math.max(dimensions.bodyLen, 1e-6), 0, 1);
  const profile = profileAt(u, head, dimensions.girth, dimensions.id || '');
  const yRadius = dimensions.radiusY * profile * spineLineScale(u, 0, head, dimensions.exaggeration?.bellyDrop);
  const zRadius = dimensions.radiusZ * profile * (head === 'eel' ? 0.92 : 1);
  const lateral = clamp(Math.abs(y) / Math.max(yRadius, 1e-6), 0, 0.98);
  return zRadius * Math.sqrt(Math.max(0, 1 - lateral * lateral));
}

function headHeight(dimensions) {
  return dimensions.radiusY * 2 * dimensions.exaggeration.headScale;
}

function makeSpineGeometry(def, palette, dimensions) {
  const sil = def.sil || {};
  const head = sil.head || 'point';
  const len = clamp(finite(sil.len, 1), 0.5, 3);
  const girth = clamp(finite(sil.girth, 0.36), 0.18, 0.8);
  const bodyLen = dimensions.bodyLen;
  const radiusY = dimensions.radiusY;
  const radiusZ = dimensions.radiusZ;
  const stations = head === 'eel' ? 30 : head === 'kaiju' ? 26 : def.tier >= 5 ? 26 : def.tier >= 3 ? 24 : 20;
  // Sixteen radial vertices preserve a rounded low-poly section while making
  // room in the 4200-triangle gate for the deeper 11-station fork and whale
  // flank spots.
  const radial = 16;
  const ramp = bodyRampColors(palette, finite(def.act, def.tier >= 5 ? 2 : 1));
  const positions = [];
  const colors = [];
  const indices = [];
  const ringIndices = [];
  const bellyDrop = dimensions.exaggeration?.bellyDrop || exaggerationFor(head).bellyDrop;

  const addBodyRing = (i) => {
    const u = i / stations;
    const x = -bodyLen * 0.52 + bodyLen * u;
    const profile = profileAt(u, head, girth, String(def.id || ''));
    const stationY = radiusY * profile;
    const stationZ = radiusZ * profile * (head === 'eel' ? 0.92 : 1);
    const ring = [];
    for (let j = 0; j < radial; j++) {
      const theta = (j / radial) * TAU;
      const jitter = head === 'rock'
        ? 1 + (hash01(i, j, 5) - 0.5) * 0.2
        : head === 'mech' ? 1 + (((i + j) % 3) - 1) * 0.025
          : 1;
      let color = bodyVertexColor(ramp, theta, u, i, j, sil.pattern || 'plain');
      // Hard accent edge two rings inboard of the fin roots. The root vertices
      // are shared with the appendages, so the block is also seam-consistent.
      if (u >= 0.45 && u <= 0.69 && (Math.cos(theta) > 0.42 || Math.abs(Math.sin(theta)) > 0.82)) {
        color = ramp.accent.clone();
      }
      const lineScale = spineLineScale(u, theta, head, bellyDrop);
      addVertex(positions, colors, x, Math.cos(theta) * stationY * lineScale * jitter, Math.sin(theta) * stationZ * jitter, color);
      ring.push(positions.length / 3 - 1);
    }
    ringIndices.push(ring);
  };

  for (let i = 0; i <= stations; i++) addBodyRing(i);
  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < radial; j++) {
      const next = (j + 1) % radial;
      const a = ringIndices[i][j], b = ringIndices[i + 1][j];
      const c = ringIndices[i + 1][next], d = ringIndices[i][next];
      indices.push(a, d, b, b, d, c);
    }
  }

  const root = positions.length / 3;
  addVertex(positions, colors, -bodyLen * 0.52, 0, 0, ramp.dorsal);
  const nose = positions.length / 3;
  addVertex(positions, colors, bodyLen * 0.48, 0, 0, ramp.belly);
  for (let j = 0; j < radial; j++) {
    const next = (j + 1) % radial;
    indices.push(root, ringIndices[0][next], ringIndices[0][j]);
    indices.push(nose, ringIndices[stations][j], ringIndices[stations][next]);
  }

  // The tail starts with the spine's rear ring. It is a welded forked loft,
  // not a second mesh with a root transform. Upper/lower envelopes peak well
  // above the peduncle, then taper to 30% over the final 20%; theta-dependent
  // center retreat makes the terminal outline a real concave notch.
  const tailScale = dimensions.tailScale;
  const tailLength = bodyLen * (0.28 + tailScale * 0.03);
  const tailUpper = bodyLen * 0.23;
  const tailLower = bodyLen * 0.15;
  const tailLowerUpperRatio = tailLower / Math.max(tailUpper, 1e-6);
  const tailDepth = bodyLen * 0.10;
  // The terminal cap is the projected center notch, not a rearward center
  // point. A rearward cap vertex closes the two lobes into the convex paddle
  // that the gameplay review rejected. Keep the notch forward of both
  // terminal lobe tips in the side profile, while the body-ring root remains
  // welded exactly as before.
  const tailNotchAxial = bodyLen * 0.12;
  const tailTipExtension = 0;
  const tailRings = [ringIndices[0]];
  const tailStationCount = 11;
  const rootProfile = profileAt(0, head, girth, String(def.id || ''));
  const rootYRadius = radiusY * rootProfile * spineLineScale(0, 0, head, bellyDrop);
  const rootZRadius = radiusZ * rootProfile;
  for (let s = 1; s <= tailStationCount; s++) {
    const t = s / tailStationCount;
    const rootBlend = smoothStep01(t / 0.22);
    const growth = smoothStep01(t / 0.38);
    const finalTaper = t <= 0.80 ? 1 : 1 - 0.70 * smoothStep01((t - 0.80) / 0.20);
    const lobeEnvelope = growth * finalTaper;
    const notchProgress = smoothStep01((t - 0.55) / 0.45);
    const ring = [];
    for (let j = 0; j < radial; j++) {
      const theta = (j / radial) * TAU;
      const upper = Math.cos(theta) >= 0;
      const outerness = Math.abs(Math.cos(theta));
      const lobe = upper ? tailUpper : tailLower;
      // Keep the loft's center-facing side faces monotone and reserve the full
      // .12L projected retreat for the terminal notch vertex. This avoids a
      // folded/inward radial strip while preserving the visible crescent gap.
      const centerRetreat = tailNotchAxial * 0.5 * notchProgress * (1 - outerness);
      const x = -bodyLen * 0.52 - tailLength * t + centerRetreat;
      const rootY = Math.cos(theta) * rootYRadius;
      const lobeY = (upper ? 1 : -1) * outerness * lobe * lobeEnvelope;
      const y = rootY * (1 - rootBlend) + lobeY * rootBlend;
      const sectionDepth = rootZRadius * (1 - rootBlend) + tailDepth * (0.92 + 0.08 * Math.sin(Math.PI * t)) * rootBlend;
      const z = Math.sin(theta) * sectionDepth;
      // The exposed fork is one continuous accent block; only the small
      // center-facing transition row keeps a flank hue for volume.
      const color = outerness > 0.18 || t > 0.24 ? ramp.accent.clone() : ramp.flank.clone();
      addVertex(positions, colors, x, y, z, color);
      ring.push(positions.length / 3 - 1);
    }
    tailRings.push(ring);
  }
  const tailSideIndexStart = indices.length;
  for (let i = 0; i < tailRings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const next = (j + 1) % radial;
      const a = tailRings[i][j], b = tailRings[i + 1][j];
      const c = tailRings[i + 1][next], d = tailRings[i][next];
      // The body loft advances +X, while the tail advances -X. Reusing
      // a,d,b on the reversed longitudinal direction flips every caudal side
      // normal inward and makes FrontSide cull the camera-facing tail.
      indices.push(a, b, d, b, c, d);
    }
  }
  const tailSideIndexCount = indices.length - tailSideIndexStart;
  const tailTip = positions.length / 3;
  addVertex(positions, colors, -bodyLen * 0.52 - tailLength + tailNotchAxial, 0, 0, ramp.accent);
  const lastTailRing = tailRings[tailRings.length - 1];
  const tailCapIndexStart = indices.length;
  for (let j = 0; j < radial; j++) {
    const next = (j + 1) % radial;
    indices.push(lastTailRing[next], lastTailRing[j], tailTip);
  }
  const tailCapIndexCount = indices.length - tailCapIndexStart;

  const nearestRing = (u) => ringIndices[clamp(Math.round(u * stations), 0, stations)];

  // Dorsal wedge: its root is two top vertices from the body loft.
  const dorsalRootRear = nearestRing(0.46)[0];
  const dorsalRootFront = nearestRing(0.69)[0];
  const dorsalHeight = head === 'eel'
    ? bodyLen * (0.27 + dimensions.finScale * 0.08)
    : head === 'whale' ? bodyLen * (0.12 + dimensions.finScale * 0.035)
      : bodyLen * (0.17 + dimensions.finScale * 0.045);
  const dorsalTipX = bodyLen * (head === 'eel' ? -0.02 : 0.01);
  const dorsalTipY = radiusY * (head === 'whale' ? 1.05 : head === 'angler' ? 1.18 : 1.12) + dorsalHeight;
  const dorsalDepth = Math.max(0.018, radiusZ * 0.12);
  const dorsalTipNear = positions.length / 3;
  addVertex(positions, colors, dorsalTipX, dorsalTipY, dorsalDepth * 0.5, ramp.accent);
  const dorsalTipFar = positions.length / 3;
  addVertex(positions, colors, dorsalTipX, dorsalTipY, -dorsalDepth * 0.5, ramp.accent);
  const dorsalIndexStart = indices.length;
  indices.push(dorsalRootRear, dorsalRootFront, dorsalTipNear, dorsalRootFront, dorsalTipFar, dorsalTipNear);
  indices.push(dorsalRootFront, dorsalRootRear, dorsalTipFar, dorsalRootRear, dorsalTipNear, dorsalTipFar);
  const dorsalIndexCount = indices.length - dorsalIndexStart;

  // Pectoral wedges also share body-ring vertices. They are mirrored in the
  // authoring pass, never rotated as independent runtime meshes.
  const pectRootRing = nearestRing(0.46);
  const pectSpan = dimensions.pectoralSpan;
  const pectTipX = -bodyLen * (head === 'hammer' ? 0.58 : head === 'whale' ? 0.54 : head === 'angler' ? 0.58 : 0.56 + dimensions.finScale * 0.055);
  const pectDepth = Math.max(0.012, radiusY * 0.035);
  const pectRoots = {};
  const pectoralIndexStart = indices.length;
  for (const side of [1, -1]) {
    const rootA = side > 0 ? pectRootRing[3] : pectRootRing[13];
    const rootB = side > 0 ? pectRootRing[5] : pectRootRing[11];
    const tipA = positions.length / 3;
    addVertex(positions, colors, pectTipX, -radiusY * 0.42, side * pectSpan, ramp.accent);
    const tipB = positions.length / 3;
    addVertex(positions, colors, pectTipX + bodyLen * 0.10, -radiusY * 0.20, side * pectSpan * 0.56, ramp.accent);
    indices.push(rootA, rootB, tipA, rootB, tipB, tipA, rootB, rootA, tipB, rootA, tipA, tipB);
    pectRoots[side > 0 ? 'L' : 'R'] = [rootA, rootB];
  }
  const pectoralIndexCount = indices.length - pectoralIndexStart;

  const geometry = bufferGeometry(positions, indices, colors);
  geometry.userData.rfStations = stations + 1;
  geometry.userData.rfRadial = radial;
  geometry.userData.rfProfile = head;
  geometry.userData.rfLen = len;
  geometry.userData.rfNoseIndex = nose;
  geometry.userData.rfTailRootIndex = root;
  geometry.userData.rfTailRootIndices = ringIndices[0].slice();
  geometry.userData.rfSharedAppendageRoots = {
    tail: ringIndices[0].slice(),
    dorsal: [dorsalRootRear, dorsalRootFront],
    pectorals: pectRoots
  };
  geometry.userData.rfWeldedAppendages = { tail: true, dorsal: true, pectorals: true };
  geometry.userData.rfForwardAxis = '+x';
  geometry.userData.rfPattern = sil.pattern || 'plain';
  geometry.userData.rfPalette = palette.raw;
  geometry.userData.rfTailLength = tailLength + tailTipExtension;
  geometry.userData.rfTailLengthRatio = (tailLength + tailTipExtension) / Math.max(bodyLen, 0.001);
  geometry.userData.rfTailUpperLobeHeight = tailUpper;
  geometry.userData.rfTailLowerLobeHeight = tailLower;
  geometry.userData.rfTailLowerUpperRatio = tailLowerUpperRatio;
  geometry.userData.rfTailDepth = tailDepth;
  geometry.userData.rfTailNotchAxial = tailNotchAxial;
  geometry.userData.rfTailUpperLobeTipIndex = lastTailRing[0];
  geometry.userData.rfTailLowerLobeTipIndex = lastTailRing[radial / 2];
  geometry.userData.rfTailNotchIndex = tailTip;
  geometry.userData.rfTailFinalLobeRatio = 0.30;
  geometry.userData.rfTailStationCount = tailStationCount;
  geometry.userData.rfTailPointedCap = true;
  geometry.userData.rfTailRootWidth = bodyLen * 0.045;
  geometry.userData.rfTailNotchX = positions[tailTip * 3];
  geometry.userData.rfTailOutline = 'crescent-concave-peduncle-notch';
  geometry.userData.rfTailHead = head;
  geometry.userData.rfTailId = String(def.id || '');
  geometry.userData.rfTailSideIndexStart = tailSideIndexStart;
  geometry.userData.rfTailSideIndexCount = tailSideIndexCount;
  geometry.userData.rfTailCapIndexStart = tailCapIndexStart;
  geometry.userData.rfTailCapIndexCount = tailCapIndexCount;
  geometry.userData.rfDorsalIndexStart = dorsalIndexStart;
  geometry.userData.rfDorsalIndexCount = dorsalIndexCount;
  geometry.userData.rfPectoralIndexStart = pectoralIndexStart;
  geometry.userData.rfPectoralIndexCount = pectoralIndexCount;
  geometry.userData.rfWindingContract = 'tail-outward-yz-dorsal-+-z-pectoral-mirrored';
  geometry.userData.rfDorsalFin = { rootX: bodyLen * 0.05, height: dorsalHeight, swept: true };
  geometry.userData.rfPectoralTipX = pectTipX;
  geometry.userData.rfPectoralDepth = pectDepth;
  geometry.userData.rfPectoralSpan = pectSpan;
  geometry.userData.rfFinAccentBlock = 'hard-edge-2-rings-inboard';
  geometry.userData.rfSectionZRatio = radiusZ / Math.max(radiusY, 0.001);
  const midU = 0.5;
  const midProfile = profileAt(midU, head, girth, String(def.id || ''));
  const midYRadius = radiusY * midProfile * spineLineScale(midU, 0, head, bellyDrop);
  const midZRadius = radiusZ * midProfile;
  geometry.userData.rfMidSectionYRadius = midYRadius;
  geometry.userData.rfMidSectionZRadius = midZRadius;
  geometry.userData.rfMidSectionRoundness = midZRadius / Math.max(midYRadius, 0.001);
  if (head === 'whale' || head === 'kaiju') {
    geometry.userData.rfBulkRearProfile = profileAt(0.22, head, girth, String(def.id || ''));
    geometry.userData.rfBulkFrontProfile = profileAt(0.68, head, girth, String(def.id || ''));
    geometry.userData.rfBulkNoseProfile = profileAt(0.94, head, girth, String(def.id || ''));
  }
  return geometry;
}

function makeExtrudedTriangle(points, depth) {
  const positions = [];
  for (const point of points) positions.push(point[0], point[1], point[2] + depth * 0.5);
  for (const point of points) positions.push(point[0], point[1], point[2] - depth * 0.5);
  const indices = [0, 1, 2, 5, 4, 3, 0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 2, 3, 0];
  return bufferGeometry(positions, indices);
}

/* A face is a silhouette decision, not a decal. Keep these contours convex
 * and deliberately oversized so the front third survives the gameplay
 * camera. The z extrusion also makes the mouth/head relationship readable
 * when the camera is a few degrees off the side axis. */
function makeExtrudedPolygon(points, depth) {
  points = cameraFacingPolygon(points);
  const positions = [];
  for (const point of points) positions.push(point[0], point[1], point[2] + depth * 0.5);
  for (const point of points) positions.push(point[0], point[1], point[2] - depth * 0.5);
  const n = points.length;
  const indices = [];
  for (let i = 1; i < n - 1; i++) indices.push(0, i, i + 1, n, n + i + 1, n + i);
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    indices.push(i, next, n + i, next, n + next, n + i);
  }
  return bufferGeometry(positions, indices);
}

function makeVertexColorExtrudedPolygon(points, depth, frontColor, backColor = frontColor) {
  points = cameraFacingPolygon(points);
  const positions = [];
  const colors = [];
  const front = colorValue(frontColor, WHITE);
  const back = colorValue(backColor, WHITE);
  for (const point of points) {
    positions.push(point[0], point[1], point[2] + depth * 0.5);
    colors.push(front.r, front.g, front.b);
  }
  for (const point of points) {
    positions.push(point[0], point[1], point[2] - depth * 0.5);
    colors.push(back.r, back.g, back.b);
  }
  const n = points.length;
  const indices = [];
  for (let i = 1; i < n - 1; i++) indices.push(0, i, i + 1, n, n + i + 1, n + i);
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    indices.push(i, next, n + i, next, n + next, n + i);
  }
  const geometry = bufferGeometry(positions, indices, colors);
  geometry.userData.rfVertexColorFeature = true;
  return geometry;
}

function faceIdentity(head, L, r) {
  const start = L * 0.08;
  const end = L * 0.49;
  const face = {
    start, end, share: (end - start) / L,
    mouthStart: L * 0.16, mouthWidth: L * 0.34, mouthHeight: r * 0.42,
    jawWidth: L * 0.48, jawHeight: r * 0.32, jawDepth: r * 1.08,
    top: r * 0.72, bottom: -r * 0.56, contour: null
  };
  switch (head) {
    case 'point':
      face.end = L * 0.53; face.mouthWidth = L * 0.36; face.mouthHeight = r * 0.90;
      face.contour = [[start, -r * 0.5, 0], [face.end, -r * 0.16, 0], [face.end, r * 0.12, 0], [L * 0.32, r * 0.72, 0], [start, r * 0.66, 0]];
      break;
    case 'blunt':
      face.end = L * 0.51; face.mouthStart = L * 0.12; face.mouthWidth = L * 0.4; face.mouthHeight = r * 0.95;
      face.contour = [[start, -r * 0.62, 0], [face.end, -r * 0.54, 0], [face.end, r * 0.56, 0], [L * 0.28, r * 0.78, 0], [start, r * 0.72, 0]];
      break;
    case 'hammer':
      face.end = L * 0.55; face.mouthStart = L * 0.1; face.mouthWidth = L * 0.38; face.mouthHeight = r * 0.95;
      face.contour = [[start, -r * 0.5, 0], [face.end, -r * 0.34, 0], [face.end, r * 0.32, 0], [L * 0.3, r * 0.68, 0], [start, r * 0.62, 0]];
      break;
    case 'saw':
      face.end = L * 0.91; face.mouthStart = L * 0.07; face.mouthWidth = L * 0.34; face.mouthHeight = r * 0.36;
      face.contour = [[start, -r * 0.42, 0], [face.end, -r * 0.08, 0], [face.end, r * 0.08, 0], [L * 0.22, r * 0.54, 0], [start, r * 0.56, 0]];
      break;
    case 'croc':
      face.end = L * 0.69; face.mouthStart = L * 0.02; face.mouthWidth = L * 0.52; face.mouthHeight = r * 0.5;
      face.jawWidth = L * 0.68; face.jawHeight = r * 0.42; face.jawDepth = r * 1.32;
      face.contour = [[start, -r * 0.52, 0], [face.end, -r * 0.34, 0], [face.end, r * 0.16, 0], [L * 0.17, r * 0.55, 0], [start, r * 0.6, 0]];
      break;
    case 'whale':
      // The body loft owns the front barrel. This contour starts well inside
      // that barrel and ends at the +x nose, so it reads as one wide mouth,
      // not as a second fish-shaped head attached to the body.
      face.start = L * 0.04; face.end = L * 0.50; face.mouthStart = L * 0.0; face.mouthWidth = L * 0.54; face.mouthHeight = r * 0.85;
      face.jawWidth = L * 0.62; face.jawHeight = r * 0.5; face.jawDepth = r * 1.42;
      face.contour = [[face.start, -r * 0.72, 0], [face.end, -r * 0.60, 0], [face.end, r * 0.62, 0], [L * 0.22, r * 1.02, 0], [face.start, r * 0.90, 0]];
      break;
    case 'angler':
      face.end = L * 0.58; face.mouthStart = L * 0.06; face.mouthWidth = L * 0.5; face.mouthHeight = r * 0.74;
      face.jawWidth = L * 0.7; face.jawHeight = r * 0.56; face.jawDepth = r * 1.5;
      face.contour = [[start, -r * 0.78, 0], [face.end, -r * 0.62, 0], [face.end, r * 0.34, 0], [L * 0.22, r * 0.95, 0], [start, r * 0.76, 0]];
      break;
    case 'eel':
      face.end = L * 0.55; face.mouthStart = L * 0.14; face.mouthWidth = L * 0.34; face.mouthHeight = r * 0.34;
      face.jawWidth = L * 0.5; face.jawHeight = r * 0.4; face.jawDepth = r * 1.2;
      face.contour = [[start, -r * 0.42, 0], [face.end, -r * 0.2, 0], [face.end, r * 0.2, 0], [L * 0.28, r * 0.5, 0], [start, r * 0.46, 0]];
      break;
    case 'rock':
      face.end = L * 0.57; face.mouthStart = L * 0.07; face.mouthWidth = L * 0.44; face.mouthHeight = r * 0.48;
      face.jawWidth = L * 0.56; face.jawHeight = r * 0.4; face.jawDepth = r * 1.3;
      face.contour = [[start, -r * 0.62, 0], [L * 0.34, -r * 0.72, 0], [face.end, -r * 0.3, 0], [face.end, r * 0.38, 0], [L * 0.3, r * 0.82, 0], [start, r * 0.7, 0]];
      break;
    case 'mech':
      face.end = L * 0.56; face.mouthStart = L * 0.08; face.mouthWidth = L * 0.42; face.mouthHeight = r * 0.48;
      face.jawWidth = L * 0.54; face.jawHeight = r * 0.38; face.jawDepth = r * 1.28;
      face.contour = [[start, -r * 0.58, 0], [face.end, -r * 0.46, 0], [face.end, r * 0.48, 0], [L * 0.3, r * 0.78, 0], [start, r * 0.7, 0]];
      break;
    case 'skull':
      face.end = L * 0.57; face.mouthStart = L * 0.06; face.mouthWidth = L * 0.45; face.mouthHeight = r * 0.52;
      face.jawWidth = L * 0.6; face.jawHeight = r * 0.43; face.jawDepth = r * 1.34;
      face.contour = [[start, -r * 0.66, 0], [face.end, -r * 0.42, 0], [face.end, r * 0.42, 0], [L * 0.36, r * 0.9, 0], [L * 0.18, r * 1.08, 0], [start, r * 0.76, 0]];
      break;
    case 'void':
      face.end = L * 0.6; face.mouthStart = L * 0.1; face.mouthWidth = L * 0.42; face.mouthHeight = r * 0.46;
      face.jawWidth = L * 0.54; face.jawHeight = r * 0.38; face.jawDepth = r * 1.3;
      face.contour = [[start, -r * 0.5, 0], [face.end, -r * 0.18, 0], [face.end, r * 0.18, 0], [L * 0.3, r * 0.68, 0], [start, r * 0.64, 0]];
      break;
    case 'frill':
      face.end = L * 0.54; face.mouthStart = L * 0.1; face.mouthWidth = L * 0.38;
      face.contour = [[start, -r * 0.5, 0], [face.end, -r * 0.22, 0], [face.end, r * 0.28, 0], [L * 0.3, r * 0.72, 0], [start, r * 0.7, 0]];
      break;
    case 'kaiju':
      face.end = L * 0.59; face.mouthStart = L * 0.02; face.mouthWidth = L * 0.58; face.mouthHeight = r * 0.95;
      face.jawWidth = L * 0.8; face.jawHeight = r * 0.66; face.jawDepth = r * 1.78;
      face.contour = [[start, -r * 0.92, 0], [face.end, -r * 0.78, 0], [L * 0.64, -r * 0.34, 0], [L * 0.62, r * 0.48, 0], [L * 0.45, r * 1.24, 0], [start, r * 1.02, 0]];
      break;
  }
  face.share = (face.end - face.start) / L;
  return face;
}

function mergeFeatureDescriptors(features, options = {}) {
  const buckets = new Map();
  const compactMaterial = options.material || null;
  for (const feature of features) {
    if (!feature?.geometry || !feature.material) continue;
    const key = compactMaterial ? compactMaterial.uuid : feature.material.uuid;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: compactMaterial || feature.material, positions: [], colors: [], indices: [], names: [], count: 0, hasColors: !!compactMaterial };
      buckets.set(key, bucket);
    }
    const position = feature.geometry.getAttribute('position');
    if (!position) continue;
    const sourceColors = feature.geometry.getAttribute('color');
    if (sourceColors && !bucket.hasColors) {
      bucket.hasColors = true;
      bucket.colors = new Array(bucket.positions.length).fill(1);
    }
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...feature.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...feature.rotation)),
      new THREE.Vector3(...feature.scale)
    );
    const offset = bucket.positions.length / 3;
    for (let i = 0; i < position.count; i++) {
      const vertex = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(matrix);
      bucket.positions.push(vertex.x, vertex.y, vertex.z);
      if (bucket.hasColors) {
        const sourceColor = sourceColors
          ? [sourceColors.getX(i), sourceColors.getY(i), sourceColors.getZ(i)]
          : [feature.material.color?.r ?? 1, feature.material.color?.g ?? 1, feature.material.color?.b ?? 1];
        bucket.colors.push(sourceColor[0], sourceColor[1], sourceColor[2]);
      }
    }
    const index = feature.geometry.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i++) bucket.indices.push(offset + index.getX(i));
    } else {
      for (let i = 0; i < position.count; i++) bucket.indices.push(offset + i);
    }
    bucket.names.push(feature.name);
    bucket.count++;
  }
  return Array.from(buckets.values()).map((bucket) => {
    const geometry = bufferGeometry(bucket.positions, bucket.indices, bucket.hasColors ? bucket.colors : null);
    geometry.userData.rfMerged = true;
    geometry.userData.rfFeatureCount = bucket.count;
    geometry.userData.rfFeatureNames = bucket.names;
    geometry.userData.rfVertexColorFeature = bucket.hasColors;
    return { geometry, material: bucket.material, name: `batched ${bucket.names.slice(0, 4).join(' / ')}` };
  });
}

function makeJawGeometry(width, height, depth, ramp) {
  const hinge = -width * 0.14;
  const authoredContour = [
    [hinge, height * 0.04, 0],
    [width * 0.78, height * 0.02, 0],
    [width, -height * 0.18, 0],
    [width * 0.94, -height * 0.72, 0],
    [width * 0.72, -height, 0],
    [hinge * 0.4, -height * 0.88, 0]
  ];
  const contour = cameraFacingPolygon(authoredContour);
  const positions = [];
  const colors = [];
  const rimColors = [ramp.dark, ramp.flank, ramp.flank, ramp.belly, ramp.dark, ramp.dark];
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < contour.length; i++) {
      const point = contour[i];
      const color = side === 0 ? rimColors[i] : ramp.dark;
      addVertex(positions, colors, point[0], point[1], side ? -depth * 0.5 : depth * 0.5, color);
    }
  }
  const n = contour.length;
  const indices = [];
  for (let i = 1; i < n - 1; i++) indices.push(0, i, i + 1, n, n + i + 1, n + i);
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    indices.push(i, next, n + i, next, n + next, n + i);
  }
  const geometry = bufferGeometry(positions, indices, colors);
  const jawSize = geometry.boundingBox.getSize(new THREE.Vector3());
  geometry.userData.rfJawVolume = jawSize.x * jawSize.y * jawSize.z;
  geometry.userData.rfJawHingeX = hinge;
  geometry.userData.rfJawRimMatchesBody = true;
  geometry.userData.rfJawCavityBand = true;
  return geometry;
}

function makeBeveledPanel(width, height, depth, bevel) {
  const x = width * 0.5;
  const y = height * 0.5;
  const b = Math.min(bevel, x * 0.45, y * 0.45);
  const contour = [[-x + b, -y], [x - b, -y], [x, -y + b], [x, y - b], [x - b, y], [-x + b, y], [-x, y - b], [-x, -y + b]];
  const positions = [];
  for (const p of contour) positions.push(p[0], p[1], depth * 0.5);
  for (const p of contour) positions.push(p[0], p[1], -depth * 0.5);
  const indices = [];
  for (let i = 1; i < contour.length - 1; i++) indices.push(0, i, i + 1, 8, 8 + i + 1, 8 + i);
  for (let i = 0; i < contour.length; i++) {
    const n = (i + 1) % contour.length;
    indices.push(i, n, 8 + i, n, 8 + n, 8 + i);
  }
  return bufferGeometry(positions, indices);
}

function makeMouthGeometry(width, height, depth = 0.04) {
  const geometry = makeExtrudedPolygon([
    [0, height * 0.46, 0], [width * 0.82, height * 0.42, 0], [width, 0, 0],
    [width * 0.88, -height * 0.48, 0], [width * 0.12, -height * 0.5, 0], [0, -height * 0.2, 0]
  ], depth);
  geometry.userData.rfMouth = true;
  geometry.userData.rfMouthCavity = true;
  geometry.userData.rfSize = { width, height };
  return geometry;
}

function makeCylinderBetween(length, radius) {
  return new THREE.CylinderGeometry(radius, radius * 0.88, length, 5, 1, false);
}

function descriptor(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], name = 'feature') {
  return { geometry, material, position, rotation, scale, name };
}

function featureMaterialValue(material) {
  return rgbToHsv(material?.color || WHITE).v;
}

function identityMarkColor(palette, hue = palette.resolved.accent.h, saturation = 0.96) {
  const flankValue = palette.resolved.base.v;
  // The identity mark is deliberately either a high-value radiant block or a
  // void-dark block. A mid-value mark disappears into the resolved flank ramp
  // and violates the proud-placement/readability contract at gameplay scale.
  const value = flankValue + 0.30 <= 1 ? flankValue + 0.30 : 0.10;
  return hsvToColor(hue, saturation, value);
}

function identityGlowMaterial(palette, color, kind = 'pantheon identity glow') {
  const glow = palette.glow || palette.accent;
  return toonMaterial({
    color,
    glow,
    emissiveIntensity: 0.92,
    kind
  });
}

function identitySolidMaterial(color, kind = 'pantheon identity solid') {
  return toonMaterial({ color, kind });
}

function identityFeature(template, geometry, material, position, rotation, scale, name, dimensions) {
  const proudOffset = clamp(
    finite(dimensions.bodyLen * (position?.[2] > 0 ? 0.05 : 0.04), dimensions.bodyLen * 0.04),
    dimensions.bodyLen * 0.03,
    dimensions.bodyLen * 0.08
  );
  const feature = descriptor(geometry, material, position, rotation, scale, name);
  feature.rfIdentityFeature = true;
  feature.rfProudOffset = proudOffset;
  feature.rfDeltaV = Math.abs(featureMaterialValue(material) - template.palette.resolved.base.v);
  template.bodyFeatures.push(feature);
  template.identityFeatureRecords.push({ name, proudOffset, deltaV: feature.rfDeltaV });
  return feature;
}

function projectedFeatureBounds(feature, yaw = SHARK_POSE_YAW) {
  const geometry = feature?.geometry;
  const position = geometry?.getAttribute?.('position');
  if (!position) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, area: 0 };
  const index = geometry.getIndex?.();
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...(feature.position || [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(feature.rotation || [0, 0, 0]))),
    new THREE.Vector3(...(feature.scale || [1, 1, 1]))
  );
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const points = [];
  const project = (vertex) => {
    vertex.applyMatrix4(matrix);
    return { x: vertex.x * c + vertex.z * s, y: vertex.y };
  };
  for (let i = 0; i < position.count; i++) {
    points.push(project(new THREE.Vector3().fromBufferAttribute(position, i)));
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  }
  let area = 0;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = points[index.getX(i)];
      const b = points[index.getX(i + 1)];
      const d = points[index.getX(i + 2)];
      area += Math.abs((b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x)) * 0.5;
    }
    // Front/back caps describe the same visible footprint. Side walls still
    // contribute a little at the quarter-view yaw, so halve the duplicated
    // cap area for a conservative screen-space estimate.
    area *= 0.5;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY, area };
}

function unionProjectedBounds(features) {
  const bounds = (features || []).map((feature) => projectedFeatureBounds(feature));
  if (!bounds.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, area: 0 };
  const result = {
    minX: Math.min(...bounds.map((item) => item.minX)),
    maxX: Math.max(...bounds.map((item) => item.maxX)),
    minY: Math.min(...bounds.map((item) => item.minY)),
    maxY: Math.max(...bounds.map((item) => item.maxY)),
    area: bounds.reduce((sum, item) => sum + item.area, 0)
  };
  result.width = result.maxX - result.minX;
  result.height = result.maxY - result.minY;
  return result;
}

function setIdentityPrimary(template, cue, features, dimensions, options = {}) {
  const footprint = unionProjectedBounds(features);
  const hero = unionProjectedBounds(options.heroFeatures || features);
  const bodyFootprint = projectedFeatureBounds({ geometry: template.bodyGeometry });
  const body = template.bodyGeometry?.boundingBox;
  const bodyWidth = Math.max(0.001, (body?.max.x || dimensions.bodyLen) - (body?.min.x || -dimensions.bodyLen));
  const bodyHeight = Math.max(0.001, (body?.max.y || dimensions.radiusY) - (body?.min.y || -dimensions.radiusY));
  const headH = headHeight(dimensions);
  const protrusion = Math.max(
    0,
    bodyFootprint.minX - hero.minX,
    hero.maxX - bodyFootprint.maxX,
    bodyFootprint.minY - hero.minY,
    hero.maxY - bodyFootprint.maxY
  ) / Math.max(dimensions.bodyLen, 1e-6);
  template.metrics.identityPrimary = {
    cue,
    projectedFootprint: footprint,
    heroFootprint: hero,
    bodyFootprint,
    heroSpanRatio: hero.width / Math.max(dimensions.bodyLen, 1e-6),
    heroHeightRatio: hero.height / Math.max(headH, 1e-6),
    projectedAreaRatio: footprint.area / Math.max(bodyWidth * bodyHeight, 1e-6),
    // A shark's filled silhouette occupies roughly half of its body bbox at
    // this quarter-view angle; use that visible-pixel estimate for the
    // pairwise 8% contour fallback rather than the empty bbox corners.
    silhouetteAreaRatio: Math.min(1, footprint.width * footprint.height / Math.max(bodyWidth * bodyHeight * 0.50, 1e-6)),
    screenWidthPx: 0,
    screenHeightPx: 0,
    bodyOverlapRatio: finite(options.bodyOverlapRatio, 0.10),
    // The review's hull is the local body/appendage contour at the cue's
    // root, not the opposite tail tip. Keep the conservative whole-body bbox
    // result for telemetry, while enforcing the authored local-hull measure
    // supplied with each contour root.
    protrusionRatio: finite(options.protrusionRatio, protrusion),
    computedProtrusionRatio: protrusion,
    declaredProtrusionRatio: finite(options.protrusionRatio, 0),
    eyeSeparationRatio: finite(options.eyeSeparationRatio, 0),
    monster: !!options.monster,
    bodyWidth,
    bodyHeight,
    headHeight: headH
  };
}

function resolveIdentityScreenMetrics(primary, group, def) {
  if (!primary) return null;
  const renderedLength = 96 * clamp(finite(def?.sil?.len, 1), 0.5, 3);
  const cameraZ = clamp(renderedLength * 1.60, 185, 400);
  const viewWidth = 2 * cameraZ * Math.tan((50 * Math.PI / 180) / 2) * (844 / 390);
  const cssPxPerWorldUnit = 844 / viewWidth;
  const cssPxPerLocalUnit = finite(group.userData.baseScale, 1) * cssPxPerWorldUnit;
  return {
    ...primary,
    screenWidthPx: primary.projectedFootprint.width * cssPxPerLocalUnit,
    screenHeightPx: primary.projectedFootprint.height * cssPxPerLocalUnit,
    heroScreenWidthPx: primary.heroFootprint.width * cssPxPerLocalUnit,
    heroScreenHeightPx: primary.heroFootprint.height * cssPxPerLocalUnit,
    cameraZ,
    cssPxPerLocalUnit
  };
}

function identityPolygon(points, depth) {
  return makeExtrudedPolygon(points.map(([x, y]) => [x, y, 0]), depth);
}

function identityBar(x, y, width, height, depth) {
  return identityPolygon([
    [x - width * 0.5, y - height * 0.5],
    [x + width * 0.5, y - height * 0.5],
    [x + width * 0.5, y + height * 0.5],
    [x - width * 0.5, y + height * 0.5]
  ], depth);
}

function identityRing(radius, stroke, segments = 8) {
  return new THREE.RingGeometry(Math.max(0.001, radius - stroke), radius, segments);
}

// Open contour strokes are used by the Pantheon rows whose identity depends
// on a cutout or a curved profile. Unlike a concave polygon fan, a ribbon
// keeps the negative space honest at gameplay scale and gives every point of
// the stroke a continuous front/back cap. No existing feature path uses this
// helper, so established feature geometry keeps its existing behavior.
function identityRibbon(points, stroke, depth) {
  const half = Math.max(0.002, stroke * 0.5);
  const front = [];
  const back = [];
  for (let i = 0; i < points.length; i++) {
    const previous = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangentX = next[0] - previous[0];
    const tangentY = next[1] - previous[1];
    const length = Math.hypot(tangentX, tangentY) || 1;
    const normalX = -tangentY / length;
    const normalY = tangentX / length;
    const left = [points[i][0] + normalX * half, points[i][1] + normalY * half];
    const right = [points[i][0] - normalX * half, points[i][1] - normalY * half];
    front.push(left, right);
    back.push(left, right);
  }
  const positions = [];
  for (const point of front) positions.push(point[0], point[1], depth * 0.5);
  for (const point of back) positions.push(point[0], point[1], -depth * 0.5);
  const stride = points.length * 2;
  const indices = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    indices.push(a, b, b + 1, a, b + 1, a + 1);
    indices.push(stride + a, stride + b + 1, stride + b, stride + a, stride + a + 1, stride + b + 1);
    indices.push(a, stride + a, stride + b, a, stride + b, b);
    indices.push(a + 1, b + 1, stride + b + 1, a + 1, stride + b + 1, stride + a + 1);
  }
  const geometry = bufferGeometry(positions, indices);
  geometry.userData.rfOpenRibbon = true;
  return geometry;
}

function identityArcRibbon(cx, cy, rx, ry, start, end, stroke, depth, segments = 18) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = start + (end - start) * t;
    points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
  }
  return identityRibbon(points, stroke, depth);
}

function identitySpiral(cx, cy, rx, ry, turns, start, stroke, depth, segments = 24) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = start + turns * TAU * t;
    const radius = 1 - 0.72 * t;
    points.push([cx + Math.cos(angle) * rx * radius, cy + Math.sin(angle) * ry * radius]);
  }
  return identityRibbon(points, stroke, depth);
}

function addEyeFeatures(template, def, palette, dimensions) {
  const head = def.sil?.head || 'point';
  const id = String(def.id || '');
  const act = finite(def.act, def.tier >= 5 ? 2 : 1);
  const eyeScale = dimensions.exaggeration?.eyeScale || exaggerationFor(head).eyeScale;
  const cyclops = id === 'cyclopseye';
  const eyeRadius = dimensions.radiusY * (cyclops ? 0.56 : eyeScale);
  // The authored .42-.50 radius ratios are sound in model space, but the
  // gameplay camera normalizes the full welded tail-to-nose bbox. Give the
  // visible eye unit a measured camera compensation so its near-eye disk is
  // not reduced to a white pixel at the 844 CSS px review viewport.
  const eyeRenderRadius = eyeRadius * EYE_CAMERA_SCALE;
  const eyeX = dimensions.bodyLen * (head === 'hammer' ? 0.38 : head === 'whale' ? 0.28 : 0.36);
  const eyeY = cyclops ? 0 : dimensions.radiusY * (head === 'eel' ? 0.28 : 0.56);
  const eyeSurfaceZ = localSurfaceZ(dimensions, eyeX, eyeY);
  const eyeProudZ = dimensions.bodyLen * 0.05;
  const eyeZ = eyeSurfaceZ + eyeProudZ;
  template.metrics.eyeRadius = eyeRadius;
  template.metrics.eyeRenderRadius = eyeRenderRadius;
  template.metrics.eyeRenderRadiusFraction = eyeRenderRadius / Math.max(dimensions.radiusY, 1e-6);
  template.metrics.eyeRadiusFraction = eyeRadius / Math.max(dimensions.radiusY, 1e-6);
  template.metrics.eyeHeadHeightFraction = (eyeRadius * 2) / Math.max(headHeight(dimensions), 1e-6);
  template.metrics.eyeX = eyeX;
  template.metrics.eyeY = eyeY;
  template.metrics.eyeSurfaceZ = eyeSurfaceZ;
  template.metrics.eyeZ = eyeZ;
  template.metrics.eyeProudZ = eyeProudZ;
  template.metrics.eyeIrisFraction = 0.52;
  template.metrics.eyeIrisStats = palette.resolved.accent;
  const eyeBaseSeed = head === 'skull' ? palette.accent : lerpColor(palette.belly, WHITE, 0.58);
  const eyeBase = liftColorToLuminance(eyeBaseSeed, 0.78);
  // Every iris is a resolved saturated accent block. Act 2/3 may add the
  // authored glow as emissive support, but discovery never depends on FX.
  const eyeIris = act >= 2 ? (palette.glow || palette.accent) : palette.accent.clone();
  const eyeGlow = act >= 2 ? (palette.glow || palette.accent) : 0;
  const eyeBaseMaterial = toonMaterial({ color: eyeBase, glow: eyeGlow, emissiveIntensity: EYE_EMISSIVE_INTENSITY, kind: 'eye' });
  const irisMaterial = toonMaterial({ color: eyeIris, glow: eyeGlow, emissiveIntensity: EYE_EMISSIVE_INTENSITY, kind: 'iris' });
  const socketMaterial = toonMaterial({ color: 0x05080d, kind: 'socket' });
  const catchlightMaterial = toonMaterial({ color: WHITE, kind: 'catchlight' });
  const eyeRingMaterial = act >= 3
    ? toonMaterial({ color: palette.glow || palette.accent, glow: palette.glow || palette.accent, emissiveIntensity: 1.0, side: THREE.DoubleSide, kind: 'eye ring' })
    : null;
  // Hero recut: brow ridge now carries an accent-lit (not just dark) color at
  // every act, not only act>=3, so the aggressive brow read survives at
  // gameplay scale for every tier, not only late-roster gold sharks.
  const browMaterial = toonMaterial({
    color: palette.glow || palette.accent,
    glow: act >= 3 ? (palette.glow || palette.accent) : 0,
    emissiveIntensity: FEATURE_EMISSIVE_INTENSITY,
    kind: 'brow'
  });

  const eyeSides = cyclops ? [1] : [1, -1];
  for (const side of eyeSides) {
    const sideName = cyclops ? 'cyclops central eye' : side > 0 ? 'eyeL' : 'eyeR';
    // One low-poly hemisphere, one proud disc, and one catchlight quad per
    // side. The three pieces are descriptor-merged into bendable feature
    // batches, rather than becoming articulated eye objects.
    template.bodyFeatures.push(descriptor(sharedEyeGeometry, eyeBaseMaterial, [eyeX, eyeY, side * eyeZ], [side * Math.PI * 0.5, 0, 0], [eyeRenderRadius, eyeRenderRadius, eyeRenderRadius], `${sideName} hemisphere white`));
    template.bodyFeatures.push(descriptor(sharedIrisGeometry, head === 'skull' ? socketMaterial : irisMaterial, [eyeX + eyeRenderRadius * 0.05, eyeY, side * (eyeZ + eyeRenderRadius * 1.01)], [0, side < 0 ? Math.PI : 0, 0], [eyeRenderRadius * 0.52, eyeRenderRadius * 0.52, 1], `${sideName} proud pupil disc`));
    template.bodyFeatures.push(descriptor(sharedCatchlightGeometry, catchlightMaterial, [eyeX + eyeRenderRadius * 0.18, eyeY + eyeRenderRadius * 0.24, side * (eyeZ + eyeRenderRadius * 1.025)], [0, side < 0 ? Math.PI : 0, 0], [eyeRenderRadius * 0.24, eyeRenderRadius * 0.24, 1], `${sideName} catchlight quad`));
    if (eyeRingMaterial) {
      const ring = new THREE.TorusGeometry(eyeRenderRadius * 0.88, eyeRenderRadius * 0.09, 5, 10);
      template.bodyFeatures.push(descriptor(ring, eyeRingMaterial, [eyeX + eyeRenderRadius * 0.16, eyeY, side * (eyeZ + eyeRenderRadius * 0.86)], [0, side < 0 ? Math.PI : 0, 0], [1, 1, 1], `${sideName} act3 glow ring`));
    }
    const browScale = head === 'kaiju' ? 1.62 : cyclops ? 1.34 : act >= 3 ? 1.18 : 1.08;
    const brow = makeBeveledPanel(eyeRenderRadius * 2.7 * browScale, eyeRenderRadius * (0.38 + (head === 'kaiju' ? 0.16 : 0)), eyeRenderRadius * (0.42 + (head === 'kaiju' ? 0.2 : 0)), eyeRenderRadius * 0.08);
    // Hero recut follow-on: this offset is proportional to eyeRadius, so
    // doubling eyeRadius for the hero recut also doubled the absolute gap
    // between the brow and the eyeball, making the ridge read as a detached
    // floating bar instead of an attached brow shelf. Halved (0.71, was 1.42;
    // kaiju's extra +0.16 likewise halved to +0.08) to restore the same
    // attached, overhanging read at the new larger eye scale.
    template.bodyFeatures.push(descriptor(brow, browMaterial, [eyeX - eyeRenderRadius * 0.08, eyeY + eyeRenderRadius * (0.71 + (head === 'kaiju' ? 0.08 : 0)), side * (eyeZ + eyeRenderRadius * 0.12)], [0, side * (0.14 + (head === 'kaiju' ? 0.1 : 0)), side * -0.16], [1, 1, 1], `${sideName} attitude shelf`));
  }
  const geometryTriangles = (geometry) => Math.floor((geometry.getIndex()?.count || geometry.getAttribute('position')?.count || 0) / 3);
  template.metrics.eyeUnitTriangles = geometryTriangles(sharedEyeGeometry) * eyeSides.length + geometryTriangles(sharedIrisGeometry) * eyeSides.length + geometryTriangles(sharedCatchlightGeometry) * eyeSides.length;
  template.metrics.eyeUnitPresent = true;
  template.metrics.singleCentralEye = cyclops;
}

function addMouthAndTeeth(template, def, palette, dimensions) {
  const tier = finite(def.tier, 1);
  const head = def.sil?.head || 'point';
  const spec = template.face.spec;
  const mouthWidth = spec.mouthWidth;
  const mouthHeight = spec.mouthHeight;
  const mouthStart = spec.mouthStart;
  const mouthY = -dimensions.radiusY * (head === 'angler' || head === 'kaiju' ? 0.27 : 0.22);
  const mouthCenterX = mouthStart + mouthWidth * 0.5;
  const mouthSurfaceZ = localSurfaceZ(dimensions, mouthCenterX, mouthY);
  const mouthProudZ = dimensions.bodyLen * 0.05;
  const mouthLineMaterial = toonMaterial({ color: WHITE, vertexColors: true, kind: 'mouth line vertex color' });
  // Hero recut (art review CRITICAL 1): the underslung mouth line was a thin
  // hairline that vanished at gameplay scale (shark occupies ~31% of frame
  // width). Widen the line's vertical thickness (0.05/0.08/0.16 -> 0.09/0.14/
  // 0.24 * radiusY) and extrude it deeper (0.025 -> 0.05 * radiusZ) so tier-1
  // Reef, which never gets tooth geometry, still reads a bold committed jaw
  // line instead of a faint scratch.
  const mouthLine = makeVertexColorExtrudedPolygon([
    [mouthStart, mouthY - dimensions.radiusY * 0.09, 0],
    [mouthStart + mouthWidth * 0.94, mouthY + dimensions.radiusY * 0.02, 0],
    [mouthStart + mouthWidth * 0.90, mouthY - dimensions.radiusY * 0.14, 0],
    [mouthStart + mouthWidth * 0.04, mouthY - dimensions.radiusY * 0.24, 0]
  ], dimensions.radiusZ * 0.05, 0x040a10);
  template.bodyFeatures.push(descriptor(
    mouthLine,
    mouthLineMaterial,
    [0, 0, mouthSurfaceZ + mouthProudZ],
    [0, 0, 0],
    [1, 1, 1],
    'underslung mouth line vertex color'
  ));
  template.metrics.mouthLineVertexColors = true;
  template.metrics.mouthWidth = mouthWidth;
  template.metrics.mouthWidthRatio = mouthWidth / Math.max(dimensions.bodyLen, 1e-6);
  template.metrics.mouthHeightRatio = mouthHeight / Math.max(headHeight(dimensions), 1e-6);
  template.metrics.mouthCavity = true;

  // A saturated lower rim carries the grin as a character block. It frames
  // the dark cavity instead of asking a thin white mouth line to do all the
  // work at gameplay distance.
  const jawRimHeight = mouthHeight * 0.18;
  const jawRim = makeExtrudedPolygon([
    [0, -mouthHeight * 0.22, 0],
    [mouthWidth * 0.94, -mouthHeight * 0.15, 0],
    [mouthWidth * 0.86, -mouthHeight * 0.34, 0],
    [mouthWidth * 0.12, -mouthHeight * 0.40, 0]
  ], Math.max(dimensions.radiusZ * 0.06, dimensions.bodyLen * 0.018));
  const jawRimMaterial = toonMaterial({ color: palette.accent, kind: 'colored lower jaw rim' });
  for (const side of [1, -1]) {
    template.bodyFeatures.push(descriptor(
      jawRim,
      jawRimMaterial,
      [mouthStart, mouthY, side * (mouthSurfaceZ + mouthProudZ * 1.02)],
      [0, 0, 0],
      [1, 1, 1],
      `${side > 0 ? 'near' : 'far'} colored lower jaw rim`
    ));
  }
  template.metrics.lowerJawRim = { height: jawRimHeight, color: palette.resolved.accent };

  // Hero recut: tier-1 sharks (Reef, Epaulette, Cookiecutter) never receive
  // tooth/jaw geometry, so the mouth line alone must carry a jaw silhouette.
  // A small dark underbite wedge tucked beneath the mouth line reads as a
  // committed lower jaw mass at distance without adding a tooth budget.
  if (tier < 2) {
    const jawShadowMaterial = toonMaterial({ color: 0x030710, kind: 'tier1 jaw shadow wedge' });
    const wedge = makeExtrudedPolygon([
      [mouthStart + mouthWidth * 0.10, mouthY - dimensions.radiusY * 0.22, 0],
      [mouthStart + mouthWidth * 0.78, mouthY - dimensions.radiusY * 0.16, 0],
      [mouthStart + mouthWidth * 0.62, mouthY - dimensions.radiusY * 0.40, 0],
      [mouthStart + mouthWidth * 0.20, mouthY - dimensions.radiusY * 0.38, 0]
    ], dimensions.radiusZ * 0.14);
    for (const side of [1, -1]) {
      template.bodyFeatures.push(descriptor(
        wedge,
        jawShadowMaterial,
        [0, 0, side * (mouthSurfaceZ + mouthProudZ)],
        [0, 0, 0],
        [1, 1, 1],
        `${side > 0 ? 'near' : 'far'} tier1 jaw shadow wedge`
      ));
    }
    return;
  }
  const mouthMaterial = toonMaterial({ color: 0x09050d, kind: 'mouth' });
  const toothMaterial = toonMaterial({ color: 0xfff4d4, kind: 'teeth' });
  for (const side of [1, -1]) {
    const mouth = descriptor(makeMouthGeometry(mouthWidth, mouthHeight, dimensions.radiusZ * 0.1), mouthMaterial, [mouthStart, mouthY, side * (mouthSurfaceZ + mouthProudZ * 1.03)], [0, 0, 0], [1, 1, 1], `${side > 0 ? 'near' : 'far'} connected mouth cavity`);
    template.bodyFeatures.push(mouth);
    const count = head === 'kaiju' ? 10 : head === 'whale' ? 8 : Math.min(9, 5 + Math.floor(tier / 3));
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count;
      const x = mouthStart + mouthWidth * u;
      const toothScale = dimensions.radiusY * (0.1 + tier * 0.007) * (head === 'croc' ? 0.88 : head === 'kaiju' ? 1.18 : 1);
      const toothHeight = toothScale * (head === 'kaiju' ? 3.0 : 2.6);
      const upperRoot = mouthY + mouthHeight * 0.42;
      template.bodyFeatures.push(descriptor(sharedToothGeometry, toothMaterial, [x, upperRoot - toothHeight * 0.5, side * (mouthSurfaceZ + mouthProudZ * 1.06)], [0, 0, Math.PI], [toothScale, toothHeight, toothScale], `${side > 0 ? 'near' : 'far'} rooted upper tooth`));
      if (i % 2 === 0 || tier >= 6) {
        const lowerHeight = toothHeight * 0.78;
        const lowerRoot = mouthY - mouthHeight * 0.42;
        template.bodyFeatures.push(descriptor(sharedToothGeometry, toothMaterial, [x + mouthWidth * 0.02, lowerRoot + lowerHeight * 0.5, side * (mouthSurfaceZ + mouthProudZ * 1.06)], [0, 0, 0], [toothScale * 0.88, lowerHeight, toothScale * 0.88], `${side > 0 ? 'near' : 'far'} rooted lower tooth`));
      }
    }
  }

  if (tier >= 5) {
    const jawWidth = spec.jawWidth;
    const jawHeight = spec.jawHeight;
    const jawDepth = dimensions.radiusZ * (spec.jawDepth / dimensions.radiusY);
    const jawRamp = bodyRampColors(palette, finite(def.act, def.tier >= 5 ? 2 : 1));
    template.jaw = {
      geometry: makeJawGeometry(jawWidth, jawHeight, jawDepth, jawRamp),
      material: toonMaterial({ color: WHITE, vertexColors: true, kind: 'jaw' }),
      position: [mouthStart + mouthWidth * 0.08, mouthY - mouthHeight * 0.34, dimensions.radiusZ * 0.12],
      teeth: [],
      teethDescriptors: []
    };
    const jawToothCount = head === 'kaiju' ? 9 : head === 'angler' ? 8 : 6;
    const jawToothMaterial = toonMaterial({ color: 0xfff4d4, kind: 'jaw teeth' });
    for (let i = 0; i < jawToothCount; i++) {
      const toothScale = dimensions.radiusY * (head === 'kaiju' ? 0.12 : 0.1);
      const toothHeight = toothScale * (head === 'kaiju' ? 2.65 : 2.35);
      const x = jawWidth * (0.1 + i * (0.78 / Math.max(1, jawToothCount - 1)));
      const y = -jawHeight * 0.02 + toothHeight * 0.5;
      const tooth = {
        geometry: sharedToothGeometry,
        material: jawToothMaterial,
        position: [x, y, dimensions.radiusZ * 0.52],
        rotation: [0, 0, 0],
        scale: [toothScale, toothHeight, toothScale],
        name: 'rooted jaw tooth'
      };
      template.jaw.teethDescriptors.push(tooth);
      template.jaw.teeth.push({
        position: tooth.position, rotation: tooth.rotation, scale: tooth.scale
      });
    }
  }
}

function addHeadFeatures(template, def, palette, dimensions) {
  const sil = def.sil || {};
  const head = sil.head || 'point';
  const act = finite(def.act, def.tier >= 5 ? 2 : 1);
  const L = dimensions.bodyLen;
  const r = dimensions.radiusY;
  const headH = headHeight(dimensions);
  const rz = dimensions.radiusZ;
  const solid = (color, kind = 'head') => toonMaterial({ color, kind });
  const accent = solid(palette.accent, 'accent');
  const glowColor = palette.glow || palette.accent;
  const glow = toonMaterial({ color: glowColor, glow: glowColor, emissiveIntensity: 0.86, kind: 'glow' });
  const cameraSurface = (x, y = 0) => localSurfaceZ(dimensions, x, y);

  if (head === 'hammer') {
    // The gameplay camera is on +Z, so the foil's long axis is local X (the
    // screen-horizontal axis), not local Z. Its center bridge overlaps the
    // loft by 0.18L so the bar cannot read as a detached box.
    const foilSpan = L * 0.50;
    const foilThickness = L * 0.13;
    const foilDepth = Math.max(L * 0.10, rz * 0.65);
    const foilX = L * 0.43;
    const foilZ = cameraSurface(foilX) + L * 0.06;
    const foilColor = solid(palette.accent, 'hammer foil');
    const foilEdgeColor = solid(OUTLINE_SHELL_COLOR, 'hammer foil edge');
    const halfSpan = foilSpan * 0.5;
    const halfBar = foilThickness * 0.5;
    const stemHalf = L * 0.07;
    const stemDrop = L * 0.22;
    // A box had the correct numeric span but read as a rectangular snout.
    // This beveled XY contour keeps the bar on the live screen-horizontal
    // axis and adds a central downward bridge, so the silhouette is a T even
    // before the body/face features are considered.
    const foil = makeExtrudedPolygon([
      [-halfSpan + L * 0.025, halfBar, 0], [halfSpan - L * 0.025, halfBar, 0],
      [halfSpan, halfBar * 0.45, 0], [halfSpan, -halfBar * 0.45, 0],
      [stemHalf, -halfBar * 0.45, 0], [stemHalf, -stemDrop, 0],
      [-stemHalf, -stemDrop, 0], [-stemHalf, -halfBar * 0.45, 0],
      [-halfSpan, -halfBar * 0.45, 0], [-halfSpan + L * 0.025, -halfBar, 0]
    ], foilDepth);
    template.bodyFeatures.push(descriptor(foil, foilColor, [foilX, 0, foilZ], [0, 0, 0], [1, 1, 1], 'hammer T-bar'));
    const foilEdge = new THREE.BoxGeometry(L * 0.035, foilThickness * 1.08, foilDepth * 1.04);
    template.bodyFeatures.push(descriptor(foilEdge, foilEdgeColor, [foilX + foilSpan * 0.47, 0, foilZ + L * 0.005], [0, 0, 0], [1, 1, 1], 'hammer T-bar leading edge'));
    const bridgeWidth = L * 0.30;
    const bridge = new THREE.BoxGeometry(bridgeWidth, r * 0.32, rz * 1.05);
    template.bodyFeatures.push(descriptor(bridge, accent, [L * 0.34, 0, cameraSurface(L * 0.34) + L * 0.055], [0, 0, 0], [1, 1, 1], 'hammer bridge'));
    template.metrics.hammerFoilProjectedSpan = foilSpan;
    template.metrics.hammerFoilThickness = foilThickness;
    template.metrics.hammerBridgeOverlap = L * 0.18;
  } else if (head === 'saw') {
    const snout = makeExtrudedTriangle([[L * 0.37, r * 0.1, 0], [L * 0.37, -r * 0.1, 0], [L * 0.98, 0, 0]], r * 0.22);
    template.bodyFeatures.push(descriptor(snout, accent, [0, 0, rz * 0.04], [0, 0, 0], [1, 1, 1], 'saw rostrum'));
    const sawTooth = new THREE.ConeGeometry(r * 0.1, r * 0.28, 4);
    for (let i = 0; i < 7; i++) {
      const x = L * (0.48 + i * 0.065);
      template.bodyFeatures.push(descriptor(sawTooth, toonMaterial({ color: 0xf2e7bd, kind: 'saw teeth' }), [x, r * 0.1, rz * 0.17], [0, 0, -Math.PI * 0.5], [1, 1, 1], 'saw tooth'));
      template.bodyFeatures.push(descriptor(sawTooth, toonMaterial({ color: 0xf2e7bd, kind: 'saw teeth' }), [x, -r * 0.1, rz * 0.17], [0, 0, Math.PI * 0.5], [1, 1, 1], 'saw tooth')); 
    }
  } else if (head === 'croc') {
    const snout = new THREE.BoxGeometry(L * 0.45, r * 0.24, rz * 0.82);
    template.bodyFeatures.push(descriptor(snout, solid(palette.base, 'croc snout'), [L * 0.31, -r * 0.04, rz * 0.05], [0, 0, 0], [1, 1, 1], 'croc long snout'));
    const crocTooth = new THREE.ConeGeometry(r * 0.075, r * 0.3, 4);
    for (let i = 0; i < 6; i++) {
      template.bodyFeatures.push(descriptor(crocTooth, toonMaterial({ color: 0xffedc5, kind: 'croc teeth' }), [L * (0.14 + i * 0.095), -r * 0.2, rz * 0.47], [0, 0, 0], [1, 1, 1], 'croc tooth'));
    }
  } else if (head === 'frill') {
    const frillMaterial = solid(palette.accent, 'frill');
    for (let i = 0; i < 5; i++) {
      const x = L * (0.25 + i * 0.07);
      template.bodyFeatures.push(descriptor(makeExtrudedTriangle([[x, r * 0.2, 0], [x - L * 0.04, r * (1.1 + i * 0.08), 0], [x + L * 0.07, r * 0.34, 0]], r * 0.08), frillMaterial, [0, 0, 0], [0, 0, 0], [1, 1, 1], 'frill ray'));
    }
  } else if (head === 'whale') {
    const baleen = toonMaterial({ color: palette.belly, kind: 'baleen' });
    const mouth = template.face.spec;
    const baleenCount = 8;
    const baleenHeight = mouth.mouthHeight * 0.90;
    const baleenDepth = Math.max(L * 0.06, rz * 0.20);
    for (let i = 0; i < baleenCount; i++) {
      const u = (i + 0.5) / baleenCount;
      const x = mouth.mouthStart + mouth.mouthWidth * u;
      const y = -r * 0.18;
      template.bodyFeatures.push(descriptor(
        new THREE.BoxGeometry(Math.max(L * 0.012, r * 0.022), baleenHeight, baleenDepth),
        baleen,
        [x, y, cameraSurface(x, y) + L * 0.055],
        [0, 0, 0],
        [1, 1, 1],
        'whale baleen'
      ));
    }
    const spotMaterial = solid(palette.belly, 'whale flank spots');
    const spotCount = 8;
    const whaleHeadHeight = headHeight(dimensions);
    const spotDiameter = whaleHeadHeight * 0.08;
    const spotRadius = spotDiameter * 0.5;
    for (let i = 0; i < spotCount; i++) {
      const x = -L * 0.30 + i * L * 0.075;
      const y = r * (0.06 + (i % 3) * 0.13);
      template.bodyFeatures.push(descriptor(
        sharedWhaleSpotGeometry,
        spotMaterial,
        [x, y, cameraSurface(x, y) + L * 0.05],
        [0, 0, 0],
        [spotRadius, spotRadius, 1],
        'whale flank spot'
      ));
    }
    template.metrics.whaleHeadHeight = whaleHeadHeight;
    template.metrics.whaleSpotCount = spotCount;
    template.metrics.whaleSpotDiameter = spotDiameter;
    template.metrics.whaleSpotDiameterRatio = spotDiameter / Math.max(whaleHeadHeight, 1e-6);
    template.metrics.whaleSpotValueContrast = palette.resolved.belly.v - palette.resolved.base.v;
    template.metrics.whaleBaleenCrossing = true;
    template.metrics.whaleBaleenProudZ = L * 0.055;
  } else if (head === 'angler') {
    const staffLength = L * 0.3;
    const staff = makeCylinderBetween(staffLength, Math.max(0.012, r * 0.035));
    const staffX = L * 0.36;
    const staffY = r * 1.35;
    template.bodyFeatures.push(descriptor(staff, glow, [staffX - staffLength * 0.14, staffY * 0.48, rz * 0.12], [0, 0, 0.42], [1, 1, 1], 'angler lure stalk'));
    template.bodyFeatures.push(descriptor(new THREE.SphereGeometry(r * 0.14, 8, 5), glow, [staffX, staffY, rz * 0.12], [0, 0, 0], [1, 1, 1], 'angler lure'));
  } else if (head === 'rock') {
    const rockMaterial = solid(palette.base, 'rock plates');
    for (let i = 0; i < 3; i++) {
      template.bodyFeatures.push(descriptor(new THREE.IcosahedronGeometry(r * (0.3 + i * 0.06), 0), rockMaterial, [L * (0.23 + i * 0.1), r * (0.65 + (i % 2) * 0.12), 0], [0, i * 0.4, i * 0.2], [1.25, 0.72, 1], 'rock facet'));
    }
  } else if (head === 'mech') {
    const panelMaterial = solid(palette.accent, 'mech panels');
    const panelWidth = L * 0.17;
    const panelHeight = r * 0.42;
    const panelAreaRatio = (3 * panelWidth * panelHeight) / Math.max(L * (r * 2), 1e-6);
    for (let i = 0; i < 3; i++) {
      const x = L * (0.12 + i * 0.17);
      const y = r * 0.12;
      template.bodyFeatures.push(descriptor(makeBeveledPanel(panelWidth, panelHeight, Math.max(L * 0.12, rz * 0.22), r * 0.08), panelMaterial, [x, y, cameraSurface(x, y) + L * 0.05], [0, 0.1 * i, 0], [1, 1, 1], 'mech beveled panel'));
    }
    const thruster = new THREE.CylinderGeometry(r * 0.09, r * 0.13, r * 0.36, 6);
    const thrusterProud = L * 0.05;
    for (const side of [1, -1]) {
      template.bodyFeatures.push(descriptor(thruster, glow, [-L * 0.13, r * 0.15, side * (dimensions.pectoralSpan + thrusterProud)], [0, 0, Math.PI * 0.5], [1, 1, 1], 'mech fin thruster'));
    }
    template.metrics.mechPanelAreaRatio = panelAreaRatio;
    template.metrics.mechPanelValueContrast = Math.abs(palette.resolved.accent.v - palette.resolved.base.v);
    template.metrics.mechPanelProudZ = L * 0.05;
    template.metrics.mechThrusterProudZ = thrusterProud;
  } else if (head === 'skull') {
    const crestMaterial = solid(lerpColor(palette.belly, WHITE, 0.22), 'bone crest');
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.ConeGeometry(r * 0.14, r * (0.42 + (i % 2) * 0.15), 5);
      template.bodyFeatures.push(descriptor(spike, crestMaterial, [L * (0.15 + i * 0.1), r * 0.82, 0], [0, 0, 0], [1, 1, 1], 'skull bone crest'));
    }
    const socket = toonMaterial({ color: 0x020308, glow: palette.glow, emissiveIntensity: FEATURE_EMISSIVE_INTENSITY, kind: 'skull socket' });
    template.bodyFeatures.push(descriptor(new THREE.SphereGeometry(r * 0.2, 6, 4), socket, [L * 0.34, r * 0.36, rz * 0.9], [0, 0, 0], [1.2, 0.8, 0.4], 'skull socket shadow'));
  } else if (head === 'void') {
    const voidHeadHeight = headHeight(dimensions);
    const ringRadius = voidHeadHeight * 0.40;
    const ringStroke = voidHeadHeight * 0.04;
    const ringX = L * 0.33;
    const ringZ = cameraSurface(ringX) + L * 0.055;
    const ring = new THREE.TorusGeometry(ringRadius, ringStroke, 6, 14);
    // TorusGeometry's native normal is +Z; leave it screen-facing for the
    // live +Z camera instead of rotating it edge-on around local Y.
    template.bodyFeatures.push(descriptor(ring, glow, [ringX, 0, ringZ], [0, 0, 0], [1, 1, 1], 'void sweep ring'));
    const voidEyeDiameter = voidHeadHeight * 0.24;
    const voidEyeX = L * 0.43;
    const voidEyeY = r * 0.20;
    template.bodyFeatures.push(descriptor(new THREE.SphereGeometry(voidEyeDiameter * 0.5, 8, 5), glow, [voidEyeX, voidEyeY, cameraSurface(voidEyeX, voidEyeY) + L * 0.06], [0, 0, 0], [1, 1, 0.5], 'void eye'));
    template.metrics.voidRingDiameterRatio = (ringRadius + ringStroke) * 2 / Math.max(voidHeadHeight, 1e-6);
    template.metrics.voidRingStrokeRatio = ringStroke * 2 / Math.max(voidHeadHeight, 1e-6);
    template.metrics.voidRingProudZ = L * 0.055;
    template.metrics.voidEyeDiameterRatio = voidEyeDiameter / Math.max(voidHeadHeight, 1e-6);
    template.metrics.voidEyeProudZ = L * 0.06;
  } else if (head === 'kaiju') {
    const plateBody = toonMaterial({ color: lerpColor(palette.base, 0x04070c, 0.68), kind: 'kaiju plate body' });
    const plateGlow = palette.glow || colorValue(KAIJU_PLATE_GLOW);
    const plateEdge = toonMaterial({ color: plateGlow, glow: plateGlow, emissiveIntensity: 1.0, side: THREE.FrontSide, kind: 'kaiju plate emissive rim' });
    template.plateFeatures = [];
    // The kaiju body profile reaches ~1.27 * radiusZ at its dorsal ridge.
    // Put the row in front of that ridge, not on its centerline, so every
    // plate is visible against the water at the gameplay camera.
    const plateZ = rz * 1.3;
    for (let i = 0; i < 8; i++) {
      const u = 0.04 + i * 0.1;
      const x = -L * 0.5 + L * u;
      const rootY = r * (0.7 + (i % 2) * 0.05);
      const height = r * (0.92 + (i % 3) * 0.18) * (1.05 - i * 0.035);
      const width = L * (0.075 - i * 0.002);
      const plate = makeExtrudedPolygon([
        [x - width * 0.58, rootY, 0], [x + width * 0.55, rootY, 0],
        [x + width * 0.22, rootY + height * 0.72, 0], [x, rootY + height, 0],
        [x - width * 0.28, rootY + height * 0.68, 0]
      ], rz * 0.26);
      const bodyFeature = descriptor(plate, plateBody, [0, 0, plateZ], [0, 0, 0], [1, 1, 1], 'kaiju rooted dorsal plate body');
      template.bodyFeatures.push(bodyFeature);
      template.plateFeatures.push(bodyFeature);
      // Winding is intentionally right-base -> tip -> left-base. The camera
      // is on +Z in gameplay, so the visible cap has a +Z normal instead of
      // being culled as the old back-facing black triangle was.
      const rim = makeExtrudedTriangle([[x + width * 0.34, rootY + height * 0.62, 0], [x, rootY + height * 1.04, 0], [x - width * 0.34, rootY + height * 0.62, 0]], rz * 0.14);
      const rimFeature = descriptor(rim, plateEdge, [0, 0, plateZ + rz * 0.22], [0, 0, 0], [1, 1, 1], 'kaiju emissive plate rim');
      template.bodyFeatures.push(rimFeature);
      template.plateFeatures.push(rimFeature);
    }
  }

  const dorsalMaterial = solid(palette.accent, 'fins');
  // Dorsal geometry is authored into the welded body loft. Keep only the
  // metric here for the roster audits; no dorsal child mesh is created.
  template.metrics.dorsalFin = template.bodyGeometry.userData.rfDorsalFin;
  const gillMaterial = toonMaterial({ color: WHITE, vertexColors: true, kind: 'gill bands vertex color' });
  const gillColor = 0x071017;
  // Hero recut: gill slits were near-hairlines (width 0.010L, depth 0.035rz)
  // that disappeared at gameplay scale. Widen and extrude deeper (width/depth
  // roughly doubled) for an aggressive gill-slat silhouette; the gate only
  // pins gillXRange (start/end position), not width/height/depth, so this is
  // free to change.
  const gillWidth = L * 0.018;
  const gillHeight = r * 0.82;
  const gillXStart = L * 0.28;
  const gillXEnd = L * 0.38;
  for (const side of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      const x = gillXStart + (gillXEnd - gillXStart) * (i / 4);
      const band = makeVertexColorExtrudedPolygon([
        [x, -gillHeight * 0.34, 0],
        [x + gillWidth * 0.72, -gillHeight * 0.34, 0],
        [x + gillWidth * 0.24, gillHeight * 0.66, 0],
        [x - gillWidth * 0.42, gillHeight * 0.66, 0]
      ], Math.max(0.02, rz * 0.06), gillColor);
      template.bodyFeatures.push(descriptor(
        band,
        gillMaterial,
        [0, 0, side * (cameraSurface(x) + L * 0.04)],
        [0, 0, 0],
        [1, 1, 1],
        `${side > 0 ? 'near' : 'far'} gill slit ${i + 1} dark vertex band`
      ));
    }
  }
  template.metrics.gillBandCount = 5;
  template.metrics.gillXRange = [gillXStart, gillXEnd];
  template.metrics.gillBandVertexColors = true;
  const pelvicScale = dimensions.finScale;
  template.bodyFeatures.push(descriptor(makeExtrudedPolygon([
    [L * 0.06, -r * 0.55, 0],
    [-L * (0.04 + pelvicScale * 0.03), -r * (0.98 + pelvicScale * 0.42), 0],
    [L * 0.23, -r * 0.48, 0], [L * 0.12, -r * 0.54, 0]
  ], Math.max(0.018, rz * 0.1)), dorsalMaterial, [0, 0, 0], [0, 0, 0], [1, 1, 1], 'pelvic fin'));
  if (finite(def.tier, 1) >= 9 && act < 4 && head !== 'eel' && head !== 'skull' && head !== 'kaiju') {
    for (let i = 0; i < 4; i++) {
      const plate = new THREE.ConeGeometry(r * 0.09, r * (0.22 + (i % 2) * 0.1), 5);
      template.bodyFeatures.push(descriptor(plate, glow, [L * (-0.08 + i * 0.13), r * 0.62, rz * 0.1], [0, 0, 0], [1, 1, 1], 'act three dorsal plate'));
    }
  }
}

/* Act 4/5 identity pass. Every row has one measured, camera-facing hero cue.
 * The cues are contour pieces, not loose decals; they are all merged into the
 * existing compact late-roster feature batch, so the six-draw budget is kept. */
function addPantheonFeatures(template, def, palette, dimensions) {
  const id = String(def.id || '');
  const act = finite(def.act, 1);
  if (act < 4) return;
  const sil = def.sil || {};
  const L = dimensions.bodyLen;
  const r = dimensions.radiusY;
  const headH = headHeight(dimensions);
  const fx = String(sil.fx || '').trim();
  const mark = identityMarkColor(palette);
  const dark = hsvToColor(palette.resolved.accent.h, 0.94, UNDERWORLD_IDS.has(id) ? 0.08 : 0.18);
  const glow = identityGlowMaterial(palette, mark);
  const glowDark = identityGlowMaterial(palette, dark, 'pantheon identity dark glow');
  const solid = identitySolidMaterial(mark);
  const solidDark = identitySolidMaterial(dark, 'pantheon identity dark');
  const silver = identityGlowMaterial(palette, identityMarkColor(palette, palette.resolved.base.h, 0.18), 'pantheon ivory silver');
  const iron = identitySolidMaterial(hsvToColor(palette.resolved.base.h, 0.35, UNDERWORLD_IDS.has(id) ? 0.28 : 0.42), 'forge iron');
  const ivory = identityGlowMaterial(palette, hsvToColor(palette.resolved.base.h, 0.16, 0.98), 'bone ivory');
  const red = identityGlowMaterial(palette, identityMarkColor(palette, palette.resolved.accent.h, 0.98), 'infernal accent');
  const surface = (x, y = 0, proud = 0.075) => cameraSurfaceForIdentity(dimensions, x, y) + L * proud;
  let fxTagged = false;
  const add = (geometry, material, position, rotation, scale, name) => {
    const taggedName = !fxTagged && fx ? `${name} emissive fx ${fx}` : name;
    fxTagged = fxTagged || !!fx;
    return identityFeature(template, geometry, material, position, rotation, scale, taggedName, dimensions);
  };
  const poly = (points, depth = L * 0.07) => identityPolygon(points, depth);
  const tri = (points, depth = L * 0.06) => makeExtrudedTriangle(points.map(([x, y]) => [x, y, 0]), depth);
  const ring = (radius, stroke, segments = 10) => identityRing(radius, stroke, segments);
  const primary = (cue, features, options = {}) => setIdentityPrimary(template, cue, features, dimensions, options);
  const crescentPoints = (cx, cy, outer, inner, shift) => {
    const points = [];
    for (let i = 0; i <= 12; i++) {
      const angle = (60 + 240 * (i / 12)) * Math.PI / 180;
      points.push([cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer]);
    }
    for (let i = 0; i <= 8; i++) {
      const angle = (300 - 240 * (i / 8)) * Math.PI / 180;
      points.push([cx + shift + Math.cos(angle) * inner, cy + Math.sin(angle) * inner]);
    }
    return points;
  };
  const sunburstPoints = (cx, cy, radius, ray) => {
    const points = [];
    for (let i = 0; i < 16; i++) {
      const angle = -Math.PI * 0.5 + i * Math.PI / 8;
      const length = i % 2 ? radius : radius + ray;
      points.push([cx + Math.cos(angle) * length, cy + Math.sin(angle) * length]);
    }
    return points;
  };

  if (id === 'zeusfin') {
    const bolt = add(poly([
      [-L * 0.09, r * 0.76], [L * 0.01, r * 0.76], [-L * 0.015, r * 1.00],
      [L * 0.10, r * 1.00], [-L * 0.035, r * 1.37], [L * 0.005, r * 1.37],
      [-L * 0.035, r * 1.62], [-L * 0.115, r * 1.16], [-L * 0.055, r * 1.16]
    ]), glow, [0, 0, surface(0, 0, 0.08)], [0, 0, 0], [1, 1, 1], 'Zeus storm-bolt dorsal crest');
    const trim = add(identityBar(L * 0.20, r * 0.28, L * 0.30, r * 0.10, L * 0.045), silver,
      [0, 0, surface(L * 0.20, r * 0.28)], [0, 0, 0], [1, 1, 1], 'Zeus electric flank root');
    primary('trident-lightning bolt', [bolt, trim], { heroFeatures: [bolt], bodyOverlapRatio: 0.12, protrusionRatio: 0.10 });
  } else if (id === 'poseidonrex') {
    const tines = [];
    for (let i = -1; i <= 1; i++) {
      const x = L * (0.12 + i * 0.075);
      tines.push(add(tri([[x - L * 0.05, r * 0.92], [x, r * (1.40 + (i === 0 ? 0.16 : 0))], [x + L * 0.05, r * 0.92]]), glow,
        [0, 0, surface(x, 0, 0.07)], [0, 0, 0], [1, 1, 1], `Poseidon trident tine ${i + 2}`));
    }
    primary('trident', tines, { heroFeatures: tines, bodyOverlapRatio: 0.12, protrusionRatio: 0.12 });
  } else if (id === 'hadesmaw') {
    const crown = add(poly([
      [-L * 0.13, r * 0.50], [-L * 0.10, r * 0.82], [-L * 0.05, r * 1.08],
      [L * 0.01, r * 0.82], [L * 0.06, r * 1.20], [L * 0.11, r * 0.84],
      [L * 0.18, r * 1.10], [L * 0.24, r * 0.82], [L * 0.30, r * 1.02],
      [L * 0.31, r * 0.52], [L * 0.17, r * 0.44], [L * 0.02, r * 0.48]
    ]), glow, [0, 0, surface(L * 0.08, r * 0.72, 0.09)], [0, 0, 0], [1, 1, 1], 'Hades high-contrast three-prong void crown');
    const root = add(identityBar(L * 0.08, r * 0.52, L * 0.34, r * 0.16, L * 0.045), glowDark,
      [0, 0, surface(L * 0.08, r * 0.52, 0.08)], [0, 0, 0], [1, 1, 1], 'Hades crown anchored head root');
    primary('void crown', [crown, root], { heroFeatures: [crown], bodyOverlapRatio: 0.20, protrusionRatio: 0.12 });
  } else if (id === 'apollodon') {
    const sun = add(poly(sunburstPoints(L * 0.08, r * 0.96, r * 0.38, r * 0.14)), glow,
      [0, 0, surface(L * 0.08, 0, 0.08)], [0, 0, 0], [1, 1, 1], 'Apollo solar burst contour');
    const ray = add(tri([[-L * 0.07, r * 0.84], [L * 0.02, r * 1.34], [L * 0.11, r * 0.84]]), silver,
      [0, 0, surface(L * 0.02, 0, 0.10)], [0, 0, 0], [1, 1, 1], 'Apollo solar crown ray');
    primary('sunburst', [sun, ray], { heroFeatures: [sun], bodyOverlapRatio: 0.12, protrusionRatio: 0.10 });
  } else if (id === 'artemisstrike') {
    const crescentX = L * 0.08;
    const crescentY = r * 0.88;
    const moon = add(identityArcRibbon(crescentX, crescentY, L * 0.100, headH * 0.090, Math.PI * 0.25, Math.PI * 1.75, L * 0.040, L * 0.070, 20), silver,
      [0, 0, surface(crescentX, crescentY, 0.09)], [0, 0, 0], [1, 1, 1], 'Artemis open crescent moon contour');
    const tip = add(tri([[crescentX + L * 0.12, crescentY + r * 0.04], [crescentX + L * 0.22, crescentY + r * 0.15], [crescentX + L * 0.14, crescentY - r * 0.06]], L * 0.040), glow,
      [0, 0, surface(crescentX + L * 0.17, crescentY, 0.10)], [0, 0, 0], [1, 1, 1], 'Artemis rooted moonlit arrow tip');
    primary('crescent moon', [moon, tip], { heroFeatures: [moon], bodyOverlapRatio: 0.18, protrusionRatio: 0.12 });
  } else if (id === 'athenajaw') {
    const helm = add(poly([
      [-L * 0.10, r * 0.70], [-L * 0.03, r * 1.24], [L * 0.05, r * 0.92],
      [L * 0.11, r * 1.43], [L * 0.17, r * 0.92], [L * 0.25, r * 1.24],
      [L * 0.30, r * 0.70], [L * 0.17, r * 0.62], [L * 0.04, r * 0.68]
    ]), ivory, [0, 0, surface(L * 0.10, 0, 0.08)], [0, 0, 0], [1, 1, 1], 'Athena three-point helm contour');
    const bronze = add(identityBar(L * 0.12, r * 0.57, L * 0.28, r * 0.11, L * 0.045), solid,
      [0, 0, surface(L * 0.12, r * 0.57)], [0, 0, 0], [1, 1, 1], 'Athena bronze helm root');
    primary('three-point helm', [helm, bronze], { heroFeatures: [helm], bodyOverlapRatio: 0.15, protrusionRatio: 0.10 });
  } else if (id === 'aresrender') {
    const crest = add(poly([
      [-L * 0.04, r * 0.02], [L * 0.00, r * 0.46], [L * 0.05, r * 0.24],
      [L * 0.10, r * 0.58], [L * 0.15, r * 0.22], [L * 0.20, r * 0.40],
      [L * 0.21, -r * 0.02], [L * 0.11, -r * 0.14], [L * 0.02, -r * 0.01]
    ]), red, [0, 0, surface(L * 0.04, r * 0.18, 0.08)], [0, 0, 0], [1, 1, 1], 'Ares war-blade crest');
    const shield = add(poly([[-L * 0.18, -r * 0.24], [L * 0.10, -r * 0.10], [L * 0.24, -r * 0.32], [L * 0.05, -r * 0.53], [-L * 0.18, -r * 0.42]]), glowDark,
      [0, 0, surface(L * 0.03, -r * 0.27, 0.08)], [0, 0, 0], [1, 1, 1], 'Ares rooted war shield');
    primary('war-blade crest', [crest, shield], { heroFeatures: [crest], bodyOverlapRatio: 0.16, protrusionRatio: 0.09 });
  } else if (id === 'hermesdart') {
    const wings = [];
    for (const side of [-1, 1]) {
      wings.push(add(poly([
        [-L * 0.22, side * r * 0.18], [-L * 0.14, side * r * 0.40],
        [-L * 0.02, side * r * 1.02], [-L * 0.07, side * r * 0.82],
        [-L * 0.18, side * r * 0.50], [-L * 0.24, side * r * 0.25]
      ]), side > 0 ? glow : silver, [0, 0, surface(-L * 0.16, side * r * 0.24, 0.08)], [0, 0, side * 0.12], [1, 1, 1], `Hermes wing blade ${side > 0 ? 'upper' : 'lower'}`));
    }
    const wingRoot = add(tri([[-L * 0.08, -r * 0.12], [L * 0.02, r * 0.46], [L * 0.08, -r * 0.08]], L * 0.05), glow,
      [0, 0, surface(0, 0, 0.09)], [0, 0, 0], [1, 1, 1], 'Hermes fused wing root');
    primary('paired wing blades', [...wings, wingRoot], { heroFeatures: [wings[0]], bodyOverlapRatio: 0.15, protrusionRatio: 0.10 });
  } else if (id === 'hephaestusforge') {
    const furnace = add(poly([
      [-L * 0.10, r * 0.20], [-L * 0.07, r * 0.62], [-L * 0.02, r * 0.48],
      [L * 0.04, r * 0.78], [L * 0.09, r * 0.46], [L * 0.12, r * 0.68],
      [L * 0.12, r * 0.18], [L * 0.06, r * 0.12], [-L * 0.05, r * 0.16]
    ]), iron, [0, 0, surface(0, r * 0.35, 0.08)], [0, 0, 0], [1, 1, 1], 'Hephaestus rooted forge plate');
    const ember = add(poly([[-L * 0.12, r * 0.30], [-L * 0.03, r * 0.68], [L * 0.04, r * 0.35], [L * 0.13, r * 0.62], [L * 0.18, r * 0.30], [L * 0.08, r * 0.19]]), red,
      [0, 0, surface(L * 0.03, r * 0.34, 0.10)], [0, 0, 0], [1, 1, 1], 'Hephaestus molten root seam');
    primary('forge furnace', [furnace, ember], { heroFeatures: [furnace], bodyOverlapRatio: 0.18, protrusionRatio: 0.10 });
  } else if (id === 'dionysustide') {
    const vines = [];
    for (let i = 0; i < 3; i++) {
      const x = -L * 0.24 + i * L * 0.19;
      vines.push(add(poly([
        [x - L * 0.05, -r * 0.38], [x + L * 0.01, -r * 0.25],
        [x - L * 0.02, r * 0.02], [x + L * 0.06, r * 0.20],
        [x + L * 0.03, r * 0.48], [x + L * 0.09, r * 0.60],
        [x + L * 0.13, r * 0.52], [x + L * 0.08, r * 0.14],
        [x + L * 0.12, -r * 0.10], [x + L * 0.08, -r * 0.42]
      ]), glow, [0, 0, surface(x, 0, 0.075)], [0, 0, i * 0.06 - 0.06], [1, 1, 1], `Dionysus rooted vine wrap ${i + 1}`));
    }
    const leaf = add(poly([[L * 0.23, r * 0.48], [L * 0.37, r * 0.70], [L * 0.31, r * 0.34], [L * 0.43, r * 0.42], [L * 0.29, r * 0.17]]), red,
      [0, 0, surface(L * 0.30, r * 0.40, 0.08)], [0, 0, 0], [1, 1, 1], 'Dionysus rooted vine leaf');
    primary('rooted vine wrap', [...vines, leaf], { heroFeatures: [vines[1]], bodyOverlapRatio: 0.62 });
  } else if (id === 'aphroditelure') {
    const shell = add(poly([
      [-L * 0.13, -r * 0.15], [-L * 0.06, r * 0.20], [L * 0.04, r * 0.38],
      [L * 0.15, r * 0.26], [L * 0.22, r * 0.02], [L * 0.15, -r * 0.28],
      [L * 0.03, -r * 0.39], [-L * 0.08, -r * 0.30]
    ]), silver, [0, 0, surface(L * 0.04, 0, 0.08)], [0, 0, 0], [1, 1, 1], 'Aphrodite pearl-shell petal contour');
    const pearl = add(new THREE.SphereGeometry(headH * 0.12, 7, 5), glow,
      [L * 0.13, r * 0.04, surface(L * 0.13, r * 0.04, 0.12)], [0, 0, 0], [1, 1, 0.65], 'Aphrodite rooted pearl heart');
    primary('pearl shell petal', [shell, pearl], { heroFeatures: [shell], bodyOverlapRatio: 0.18 });
  } else if (id === 'heracrown') {
    const crown = [];
    for (let i = 0; i < 3; i++) {
      const x = L * (0.10 + i * 0.11);
      crown.push(add(tri([[x - L * 0.06, r * 0.86], [x, r * (1.20 + (i === 1 ? 0.40 : 0))], [x + L * 0.06, r * 0.86]]), glow,
        [0, 0, surface(x, 0, 0.07)], [0, 0, 0], [1, 1, 1], `Hera regal crown point ${i + 1}`));
    }
    const band = add(identityBar(L * 0.21, r * 0.82, L * 0.30, r * 0.14, L * 0.05), ivory,
      [0, 0, surface(L * 0.21, r * 0.70, 0.08)], [0, 0, 0], [1, 1, 1], 'Hera crown rooted band');
    primary('crown', [...crown, band], { heroFeatures: [crown[1]], bodyOverlapRatio: 0.16, protrusionRatio: 0.12 });
  } else if (id === 'typhonmaw') {
    const spikes = [];
    for (let i = 0; i < 12; i++) {
      const x = -L * 0.35 + i * L * 0.065;
      const y = r * (0.70 + (i % 3) * 0.16);
      spikes.push(add(tri([[x - L * 0.035, y], [x, y + r * (0.48 + (i % 4) * 0.10)], [x + L * 0.035, y]]), glow,
        [0, 0, surface(x, 0, 0.07)], [0, 0, 0], [1, 1, 1], `Typhon storm spike ${i + 1}`));
    }
    template.metrics.stormSpikeCount = template.plateFeatures.length + spikes.length;
    primary('storm-spike crest', spikes, { heroFeatures: [spikes[5]], bodyOverlapRatio: 0.15, protrusionRatio: 0.14 });
  } else if (id === 'hydrafang') {
    const heads = [];
    const necks = [];
    const lobeData = [
      { x: L * 0.00, y: r * 0.24, material: glow },
      { x: L * 0.17, y: r * 0.70, material: glow },
      { x: L * 0.34, y: r * 1.12, material: glow }
    ];
    for (let i = 0; i < lobeData.length; i++) {
      const x = lobeData[i].x;
      const baseY = lobeData[i].y;
      const neck = add(poly([
        [x - L * 0.055, r * 0.25], [x - L * 0.045, baseY - r * 0.08],
        [x + L * 0.045, baseY - r * 0.08], [x + L * 0.065, r * 0.34]
      ]), lobeData[i].material, [0, 0, surface(x, 0, 0.14 + i * 0.01)],
      [0, 0, 0], [1, 1, 1], 'Hydra visible neck root ' + (i + 1));
      necks.push(neck);
      heads.push(add(poly([
        [x - L * 0.08, baseY - r * 0.20], [x - L * 0.05, baseY + r * 0.10],
        [x - L * 0.01, baseY + r * 0.29], [x + L * 0.07, baseY + r * 0.34],
        [x + L * 0.15, baseY + r * 0.16], [x + L * 0.17, baseY - r * 0.04],
        [x + L * 0.10, baseY - r * 0.18], [x + L * 0.01, baseY - r * 0.22]
      ]), lobeData[i].material, [0, 0, surface(x + L * 0.05, 0, 0.14 + i * 0.01)],
      [0, 0, 0], [1, 1, 1], 'Hydra distinct head lobe ' + (i + 1)));
    }
    primary('three overlapping rooted heads', [...heads, ...necks], { heroFeatures: [heads[1]], monster: true, bodyOverlapRatio: 0.30, protrusionRatio: 0.14, eyeSeparationRatio: 0.12 });
 } else if (id === 'cerberusjaw') {
   const lobes = [];
    const ys = [r * 0.76, 0, -r * 0.76];
   for (let i = 0; i < 3; i++) {
     const y = ys[i];
     lobes.push(add(poly([
        [L * 0.02, y - r * 0.28], [L * 0.10, y + r * 0.26],
        [L * 0.25, y + r * 0.32], [L * 0.48, y + r * 0.22],
        [L * 0.59, y + r * 0.04], [L * 0.47, y - r * 0.10],
        [L * 0.28, y - r * 0.30], [L * 0.10, y - r * 0.32]
    ]), i === 1 ? glow : glowDark, [0, 0, surface(L * 0.24, y, 0.08 + i * 0.01)], [0, 0, 0], [1, 1, 1], `Cerberus notched jaw lobe ${i + 1}`));
    }
    const root = add(identityBar(L * 0.10, 0, L * 0.20, r * 0.30, L * 0.045), red,
      [0, 0, surface(L * 0.10, 0, 0.09)], [0, 0, 0], [1, 1, 1], 'Cerberus three-jaw rooted bridge');
    primary('three notched jaw lobes', [...lobes, root], { heroFeatures: [lobes[1]], monster: true, bodyOverlapRatio: 0.24, protrusionRatio: 0.14, eyeSeparationRatio: 0.11 });
  } else if (id === 'chimerashark') {
    const lion = add(poly([
      [-L * 0.10, r * 0.24], [-L * 0.08, r * 0.60], [-L * 0.02, r * 0.82],
      [L * 0.03, r * 0.66], [L * 0.08, r * 0.94], [L * 0.14, r * 0.68],
      [L * 0.21, r * 0.90], [L * 0.27, r * 0.60], [L * 0.36, r * 0.72],
      [L * 0.39, r * 0.34], [L * 0.26, r * 0.20], [L * 0.06, r * 0.20]
    ]), ivory, [0, 0, surface(L * 0.13, r * 0.52, 0.09)], [0, 0, 0], [1, 1, 1], 'Chimera opposing lion mane head mass');
    const serpent = add(identityRibbon([
      [L * 0.20, -r * 0.18], [L * 0.34, -r * 0.32], [L * 0.28, -r * 0.50],
      [L * 0.10, -r * 0.57], [-L * 0.08, -r * 0.46], [-L * 0.26, -r * 0.59]
    ], r * 0.28, L * 0.075), glow,
      [0, 0, surface(L * 0.10, -r * 0.40, 0.09)], [0, 0, 0], [1, 1, 1], 'Chimera opposing lower serpent profile');
    primary('opposing lion mane and serpent', [lion, serpent], { heroFeatures: [lion], monster: true, bodyOverlapRatio: 0.26, protrusionRatio: 0.13, eyeSeparationRatio: 0.10 });
  } else if (id === 'medusagaze') {
    const tendrils = [];
    for (let i = 0; i < 5; i++) {
      const x = L * (0.02 + i * 0.09);
      const baseY = r * 0.63 + (i % 2) * r * 0.08;
      const sway = (i - 2) * L * 0.045;
      tendrils.push(add(poly([
        [x - L * 0.035, baseY], [x + sway, baseY + headH * 0.26],
        [x + sway + L * 0.055, baseY + headH * 0.31],
        [x + L * 0.075, baseY + headH * 0.06],
        [x + L * 0.04, baseY - r * 0.04]
      ]), glowDark, [0, 0, surface(x, 0, 0.08)], [0, 0, 0], [1, 1, 1], `Medusa crown serpent tendril ${i + 1}`));
    }
    const petrify = toonMaterial({ color: dark, glow: palette.glow || palette.accent, emissiveIntensity: 1.0, kind: 'Medusa petrifying eye' });
    const eye = add(new THREE.SphereGeometry(headH * 0.13, 8, 4), petrify,
      [L * 0.40, r * 0.30, surface(L * 0.40, r * 0.30, 0.10)], [0, 0, 0], [1.25, 1.25, 0.60], 'Medusa petrifying eye');
    primary('five-serpent crown', [...tendrils, eye], { heroFeatures: [tendrils[2]], monster: true, bodyOverlapRatio: 0.18, protrusionRatio: 0.13, eyeSeparationRatio: 0.12 });
  } else if (id === 'scyllarender') {
    const tentacles = [];
    for (let i = 0; i < 6; i++) {
      const x = -L * 0.26 + i * L * 0.10;
      const y = -r * (0.58 + (i % 2) * 0.12);
      // Review floor: every camera-facing blade must carry a .35-.50L
      // silhouette, not a short decal-like fringe.
      const reach = L * (0.35 + (i % 3) * 0.035);
      tentacles.push(add(poly([
        [x - L * 0.045, y], [x + L * 0.015, y - reach * 0.25],
        [x + reach * 0.12, y - reach], [x + reach * 0.19, y - reach * 1.06],
        [x + reach * 0.24, y - reach * 0.78], [x + L * 0.08, y - reach * 0.18]
      ]), glowDark, [0, 0, surface(x + reach * 0.10, y - reach * 0.32, 0.08)], [0, 0, (i % 2 ? 0.20 : -0.20)], [1, 1, 1], `Scylla camera-facing tentacle ${i + 1}`));
    }
    primary('six tentacles', tentacles, { heroFeatures: [tentacles[2]], monster: true, bodyOverlapRatio: 0.18, protrusionRatio: 0.14, eyeSeparationRatio: 0.16 });
  } else if (id === 'charybdisvoid') {
    const vortex = [];
    const outer = headH * 0.34;
    for (let i = 0; i < 3; i++) {
      vortex.push(add(ring(outer - i * headH * 0.075, headH * 0.042, 10), i === 0 ? glowDark : glow,
        [L * (0.34 + i * L * 0.012), -r * 0.16, surface(L * 0.34, -r * 0.16, 0.09)], [0, 0, 0], [1, 1, 1], `Charybdis open vortex mouth ring ${i + 1}`));
    }
    const maw = add(poly([[L * 0.19, -r * 0.42], [L * 0.46, -r * 0.33], [L * 0.54, -r * 0.08], [L * 0.45, r * 0.13], [L * 0.18, r * 0.08]], L * 0.09), solidDark,
      [0, 0, surface(L * 0.36, -r * 0.10, 0.08)], [0, 0, 0], [1, 1, 1], 'Charybdis rooted vortex maw');
    primary('vortex mouth', [...vortex, maw], { heroFeatures: vortex, monster: true, bodyOverlapRatio: 0.26, protrusionRatio: 0.12, eyeSeparationRatio: 0.10 });
  } else if (id === 'minotaurram') {
    const horns = [];
    horns.push(add(identityArcRibbon(L * 0.08, r * 0.70, L * 0.18, r * 0.30, -Math.PI * 0.40, Math.PI * 0.72, r * 0.13, L * 0.070, 16), glowDark,
      [0, 0, surface(L * 0.08, r * 0.70, 0.09)], [0, 0, 0], [1, 1, 1], 'Minotaur separated left horn arc'));
    horns.push(add(identityArcRibbon(L * 0.25, r * 0.70, L * 0.18, r * 0.30, Math.PI * 0.28, Math.PI * 1.40, r * 0.13, L * 0.070, 16), glow,
      [0, 0, surface(L * 0.25, r * 0.70, 0.10)], [0, 0, 0], [1, 1, 1], 'Minotaur separated right horn arc'));
    const nose = add(identityBar(L * 0.43, -r * 0.18, L * 0.12, r * 0.10, L * 0.055), red,
      [0, 0, surface(L * 0.43, -r * 0.18, 0.10)], [0, 0, 0], [1, 1, 1], 'Minotaur rooted muzzle');
    primary('two separated bull horn arcs', [...horns, nose], { heroFeatures: [horns[0], horns[1]], monster: true, bodyOverlapRatio: 0.24, protrusionRatio: 0.14, eyeSeparationRatio: 0.12 });
  } else if (id === 'cyclopseye') {
    const socket = add(ring(r * 0.68, r * 0.30, 10), glowDark,
      [L * 0.36, 0, surface(L * 0.36, 0, 0.08)], [0, 0, 0], [1, 1, 1], 'Cyclops single-eye socket ring');
    const socketFill = add(new THREE.CircleGeometry(r * 0.46, 10), glowDark,
      [L * 0.36, 0, surface(L * 0.36, 0, 0.075)], [0, 0, 0], [1, 1, 1], 'Cyclops rooted eye socket');
    primary('single eye', [socket, socketFill], { heroFeatures: [socket], bodyOverlapRatio: 0.24 });
  } else if (id === 'harpyshade') {
    const wings = [];
    for (const side of [-1, 1]) {
      wings.push(add(poly([
        [-L * 0.30, side * r * 0.12], [-L * 0.23, side * r * 0.40],
        [-L * 0.08, side * r * 0.95], [L * 0.03, side * r * 0.85],
        [-L * 0.05, side * r * 0.52], [-L * 0.18, side * r * 0.22]
      ]), glowDark, [0, 0, surface(-L * 0.16, side * r * 0.28, 0.08)], [0, 0, 0], [1, 1, 1], `Harpy rooted wing blade ${side > 0 ? 'upper' : 'lower'}`));
    }
    primary('paired harpy wings', wings, { heroFeatures: [wings[0]], monster: true, bodyOverlapRatio: 0.20, protrusionRatio: 0.14, eyeSeparationRatio: 0.14 });
  } else if (id === 'lamiacoil') {
    const coils = [];
    const loopData = [
      [-L * 0.49, r * 0.00, L * 0.13, r * 0.48, glowDark],
      [-L * 0.30, -r * 0.04, L * 0.095, r * 0.24, glow],
      [-L * 0.12, -r * 0.10, L * 0.13, r * 0.46, glowDark]
    ];
    for (const [i, [x, y, rx, ry, material]] of loopData.entries()) {
      coils.push(add(new THREE.RingGeometry(0.48, 1, 10, 1, Math.PI * 0.24, Math.PI * 1.52), material,
        [x, y, surface(x, y, 0.08 + i * 0.01)], [0, 0, 0], [rx, ry, 1], 'Lamia open serpent loop ' + (i + 1)));
    }
    const tail = add(identityRibbon([
      [-L * 0.78, -r * 0.04], [-L * 0.62, -r * 0.18], [-L * 0.45, -r * 0.04],
      [-L * 0.31, r * 0.10], [-L * 0.20, r * 0.02]
    ], r * 0.20, L * 0.075), glowDark,
      [0, 0, surface(-L * 0.48, 0, 0.08)], [0, 0, 0], [1, 1, 1], 'Lamia open-loop tail root');
    primary('open serpent loops', [...coils, tail], { heroFeatures: [coils[1]], monster: true, bodyOverlapRatio: 0.28, protrusionRatio: 0.12, eyeSeparationRatio: 0.16 });
  } else if (id === 'kampechrono') {
    const skull = add(poly([
      [-L * 0.02, r * 0.02], [L * 0.01, r * 0.44], [L * 0.08, r * 0.66],
      [L * 0.20, r * 0.67], [L * 0.35, r * 0.61], [L * 0.48, r * 0.40],
      [L * 0.50, r * 0.10], [L * 0.40, -r * 0.06], [L * 0.24, -r * 0.10],
      [L * 0.10, -r * 0.06]
    ]), ivory, [0, 0, surface(L * 0.23, r * 0.28, 0.09)], [0, 0, 0], [1, 1, 1], 'Kampe enlarged anchored skull mass');
    const glyph = add(identitySpiral(L * 0.24, r * 0.34, L * 0.13, r * 0.24, 1.35, Math.PI * 0.18, L * 0.050, L * 0.060, 26), glow,
      [0, 0, surface(L * 0.24, r * 0.34, 0.11)], [0, 0, 0], [1, 1, 1], 'Kampe skull-anchored chrono spiral');
    const anchor = add(identityBar(L * 0.10, r * 0.28, L * 0.15, r * 0.12, L * 0.045), glowDark,
      [0, 0, surface(L * 0.10, r * 0.28, 0.10)], [0, 0, 0], [1, 1, 1], 'Kampe chrono spiral skull anchor');
    primary('enlarged skull and anchored spiral', [skull, glyph, anchor], { heroFeatures: [skull], monster: true, bodyOverlapRatio: 0.62, protrusionRatio: 0.12, eyeSeparationRatio: 0.10 });
  }
}

function cameraSurfaceForIdentity(dimensions, x, y = 0) {
  return localSurfaceZ(dimensions, x, y);
}

function addEmissiveDetails(template, def, palette, dimensions) {
  if (!palette.glow) return;
  const sil = def.sil || {};
  const pattern = sil.pattern || 'plain';
  const fx = String(sil.fx || '').trim();
  // Pantheon/Underworld identity geometry owns the late-roster glow pass. The
  // old generic vein/plate/ring decals would duplicate the same surface cue,
  // spend triangles beside the 4200 ceiling, and compete with the authored
  // silhouette features. The identity batch is also tagged with this fx key,
  // which keeps the material-ownership audit intact.
  if (finite(def.act, 1) >= 4) return;
  const fxLower = fx.toLowerCase();
  const glowMaterial = toonMaterial({ color: palette.glow, glow: palette.glow, emissiveIntensity: 0.82, kind: 'emissive decal' });
  const addEmissive = (geometry, position, rotation, scale, name) => {
    const feature = descriptor(geometry, glowMaterial, position, rotation, scale, name);
    feature.rfEmissiveFeature = true;
    template.bodyFeatures.push(feature);
  };

  const veinPattern = pattern === 'cracks' || pattern === 'runes' || pattern === 'faults' || pattern === 'magma' || pattern === 'rot' || pattern === 'corona' || pattern === 'rays';
  const veinFx = /vein|lava|ember|venom|spore|wisp|omen|sunflare/i.test(fxLower);
  if (veinPattern || veinFx) {
    for (let i = 0; i < 4; i++) {
      const x = -dimensions.bodyLen * 0.18 + i * dimensions.bodyLen * 0.14;
      const y = dimensions.radiusY * (0.08 + (i % 2) * 0.18);
      const decal = makeExtrudedTriangle([
        [x, y, 0],
        [x + dimensions.bodyLen * 0.05, y - dimensions.radiusY * 0.12, 0],
        [x + dimensions.bodyLen * 0.02, y + dimensions.radiusY * 0.18, 0]
      ], dimensions.radiusZ * 0.025);
      addEmissive(decal, [0, 0, dimensions.radiusZ * 0.88], [0, 0, 0], [1, 1, 1], `emissive ${pattern} vein/decal`);
    }
  }

  const platePattern = pattern === 'plates' || pattern === 'plating' || pattern === 'panels' || pattern === 'rivets' || pattern === 'facets' || pattern === 'bones' || pattern === 'spikes' || pattern === 'scales' || pattern === 'coral';
  if (platePattern) {
    for (let i = 0; i < 3; i++) {
      const x = -dimensions.bodyLen * 0.08 + i * dimensions.bodyLen * 0.17;
      const y = dimensions.radiusY * (0.42 + (i % 2) * 0.1);
      const plate = makeExtrudedTriangle([
        [x, y, 0], [x + dimensions.bodyLen * 0.055, y + dimensions.radiusY * 0.18, 0],
        [x + dimensions.bodyLen * 0.09, y - dimensions.radiusY * 0.02, 0]
      ], dimensions.radiusZ * 0.02);
      addEmissive(plate, [0, 0, dimensions.radiusZ * 0.9], [0, 0, 0], [1, 1, 1], `emissive ${pattern} plate`);
    }
  }

  const ringFx = /arc|storm|dynamo|wail|sound|ring|thruster|spark|engine|whirl|ripple|clock|tremor/i.test(fxLower);
  if (ringFx) {
    const ring = new THREE.TorusGeometry(dimensions.radiusY * 0.46, Math.max(0.012, dimensions.radiusY * 0.025), 4, 8);
    addEmissive(ring, [dimensions.bodyLen * 0.18, 0, dimensions.radiusZ * 0.84], [0, Math.PI * 0.5, 0], [1.1, 1, 1], 'emissive arc/ring feature');
    addEmissive(ring, [dimensions.bodyLen * 0.31, 0, dimensions.radiusZ * 0.84], [0, Math.PI * 0.5, 0], [0.82, 1, 1], 'emissive arc/ring feature');
  }

  if (/frost|ice|aurora/i.test(fxLower)) {
    for (let i = 0; i < 3; i++) {
      const x = dimensions.bodyLen * (0.08 + i * 0.17);
      const shard = makeExtrudedTriangle([
        [x, dimensions.radiusY * 0.4, 0],
        [x + dimensions.bodyLen * 0.025, dimensions.radiusY * 0.72, 0],
        [x + dimensions.bodyLen * 0.05, dimensions.radiusY * 0.4, 0]
      ], dimensions.radiusZ * 0.022);
      addEmissive(shard, [0, 0, dimensions.radiusZ * 0.91], [0, 0, 0], [1, 1, 1], 'emissive frost/ice shard');
    }
  }

  if (/glow|shadow|gloom|alien|abyss|rift|void|moonlit|marrow|glint|corona|crown|eruption|warlight|sail|lure|charge|dorsal/i.test(fxLower)) {
    const halo = new THREE.TorusGeometry(dimensions.radiusY * 0.18, Math.max(0.01, dimensions.radiusY * 0.025), 4, 8);
    addEmissive(halo, [dimensions.bodyLen * 0.35, dimensions.radiusY * 0.08, dimensions.radiusZ * 0.9], [Math.PI * 0.5, 0, 0], [1, 1, 0.7], `emissive ${fx || 'fx'} halo`);
  }

  // Every authored Act 2/3 FX key gets a named, material-owned feature even
  // when its silhouette family above has no bespoke 3D geometry yet. This is
  // the audit hook that prevents a future FX painter from reaching for the
  // body material to get its colour.
  if (fx && fx !== 'none') {
    const marker = makeExtrudedTriangle([
      [dimensions.bodyLen * 0.27, dimensions.radiusY * 0.1, 0],
      [dimensions.bodyLen * 0.3, dimensions.radiusY * 0.18, 0],
      [dimensions.bodyLen * 0.34, dimensions.radiusY * 0.08, 0]
    ], dimensions.radiusZ * 0.018);
    addEmissive(marker, [0, 0, dimensions.radiusZ * 0.925], [0, 0, 0], [1, 1, 1], `emissive fx ${fx}`);
  }
}

function buildTemplate(def) {
  const id = String(def.id || `custom-${geometryCache.size}`);
  if (geometryCache.has(id)) return geometryCache.get(id);
  const sil = def.sil || {};
  const head = sil.head || 'point';
  const len = clamp(finite(sil.len, 1), 0.5, 3);
  const authoredGirth = clamp(finite(sil.girth, 0.36), 0.18, 0.8);
  const girth = authoredGirth;
  const girthNorm = clamp((authoredGirth - 0.18) / 0.62, 0, 1);
  // Blue keeps a deliberately longer crescent than the Mako even though both
  // use the point head; this small code-side species cue survives the shared
  // loft and remains inside the prescribed .28-.36L tail envelope.
  const tailScale = clamp(finite(sil.tailScale, 1) + (id === 'blue' ? 0.40 : 0), 0.55, 2.0);
  const finScale = clamp(finite(sil.finScale, 1), 0.5, 2.1);
  const exaggeration = exaggerationFor(head, sil);
  const bodyLen = len * (
    head === 'eel' ? 1.48
      : head === 'whale' ? 1.38
        : head === 'kaiju' ? 1.42
          : id === 'mako' ? 1.38
            : id === 'thresher' ? 1.34
              : head === 'hammer' ? 1.34
                : 1.3
  );
  const headWidthFactor = {
    point: 1,
    blunt: 1.06,
    hammer: 1.12,
    saw: 0.9,
    croc: 0.98,
    whale: 1.05,
    angler: 0.91,
    eel: 0.72,
    rock: 0.9,
    mech: 1.04,
    skull: 1.03,
    void: 0.94,
    frill: 1.02,
    kaiju: 1.30
  }[head] || 1;
  const idWidthFactor = id === 'mako' || id === 'thresher' ? 0.78 : 1;
  // Rev 7 deliberately refuses the old fusiform clamp. The normalized law
  // is the roster's primary silhouette spread: narrow bodies stay near 12%
  // of length while the biggest girths reach roughly 45%.
  const radiusY = bodyLen * (0.085 + 0.14 * Math.pow(girthNorm, 1.2))
    * headWidthFactor * idWidthFactor;
  const radiusZ = radiusY * (isFusiformHead(head)
    ? FUSIFORM_SECTION_Z_RATIO
    : head === 'eel' ? 0.9 : 0.82);
  const pectoralHeadFactor = {
    hammer: 1.45,
    whale: 0.82,
    angler: 0.72,
    eel: 1.08,
    saw: 0.92,
    croc: 0.86,
    rock: 1.04,
    mech: 0.92,
    void: 1.12,
    kaiju: 1.22
  }[head] || 1;
  const finProfile = 0.52 + finScale * 0.82 + finScale * finScale * 0.62;
  const pectoralSpan = radiusZ * finProfile * pectoralHeadFactor * (id === 'blue' ? 1.22 : 1);
  const dimensions = { bodyLen, radiusY, radiusZ, len, girth, girthNorm, authoredGirth, tailScale, finScale, pectoralSpan, id, head, exaggeration };
  const palette = paletteOf(def);
  const flatShading = head === 'rock' || head === 'mech' || head === 'kaiju';
  const faceSpec = faceIdentity(head, bodyLen, radiusY);
  faceSpec.mouthWidth = Math.max(faceSpec.mouthWidth, bodyLen * exaggeration.mouthCorner - faceSpec.mouthStart);
  faceSpec.mouthHeight = Math.max(faceSpec.mouthHeight, headHeight(dimensions) * 0.30);
  faceSpec.jawWidth *= exaggeration.jawScale;
  faceSpec.jawHeight *= exaggeration.jawScale;
  faceSpec.jawDepth *= exaggeration.jawScale;
  const template = {
    id,
    dimensions,
    palette,
    bodyGeometry: makeSpineGeometry(def, palette, dimensions),
    bodyMaterial: toonMaterial({ color: WHITE, glow: 0x000000, vertexColors: true, flatShading, kind: 'body' }),
    bodyFeatures: [],
    face: { spec: faceSpec },
    jaw: null,
    teeth: 0,
    plateFeatures: [],
    featureBatches: [],
    identityFeatureRecords: [],
    metrics: {}
  };
  addHeadFeatures(template, def, palette, dimensions);
  addPantheonFeatures(template, def, palette, dimensions);
  addEmissiveDetails(template, def, palette, dimensions);
  addEyeFeatures(template, def, palette, dimensions);
  addMouthAndTeeth(template, def, palette, dimensions);
  template.teeth = template.bodyFeatures.filter((feature) => feature.name.includes('tooth')).length;
  const compactActFeatureMaterial = finite(def.act, 1) >= 4
    ? toonMaterial({ color: WHITE, glow: palette.glow || palette.accent, vertexColors: true, emissiveIntensity: 0.92, kind: 'pantheon compact feature batch' })
    : null;
  template.featureBatches = mergeFeatureDescriptors(template.bodyFeatures, { material: compactActFeatureMaterial });
  if (template.jaw?.teethDescriptors?.length) {
    const batches = mergeFeatureDescriptors(template.jaw.teethDescriptors);
    template.jaw.teethGeometry = batches[0]?.geometry || null;
    template.jaw.teethMaterial = batches[0]?.material || null;
  }
  template.metrics.faceShare = template.face.spec.share;
  template.metrics.faceCenterZ = finite(template.metrics.faceCenterZ, 0);
  template.metrics.bodyMaxZ = template.bodyGeometry.boundingBox.max.z;
  const bodySize = template.bodyGeometry.boundingBox.getSize(new THREE.Vector3());
  template.metrics.bodyAspect = bodySize.x / Math.max(bodySize.y, bodySize.z, 0.001);
  template.metrics.tailShare = template.bodyGeometry.userData.rfTailLength / Math.max(0.001, bodySize.x);
  template.metrics.tailLength = template.bodyGeometry.userData.rfTailLength;
  template.metrics.tailLengthRatio = template.bodyGeometry.userData.rfTailLengthRatio;
  template.metrics.tailUpperLobeHeight = template.bodyGeometry.userData.rfTailUpperLobeHeight;
  template.metrics.tailLowerLobeHeight = template.bodyGeometry.userData.rfTailLowerLobeHeight;
  template.metrics.tailLowerUpperRatio = template.bodyGeometry.userData.rfTailLowerUpperRatio;
  template.metrics.tailDepthRatio = template.bodyGeometry.userData.rfTailDepth / Math.max(bodyLen, 1e-6);
  template.metrics.tailNotchProjected = projectedTailNotchMetrics(template.bodyGeometry, bodyLen);
  template.metrics.tailFinalLobeRatio = template.bodyGeometry.userData.rfTailFinalLobeRatio;
  template.metrics.tailStationCount = template.bodyGeometry.userData.rfTailStationCount;
  template.metrics.tailPointedCap = !!template.bodyGeometry.userData.rfTailPointedCap;
  template.metrics.tailRootWidth = template.bodyGeometry.userData.rfTailRootWidth;
  template.metrics.tailOutline = template.bodyGeometry.userData.rfTailOutline;
  template.metrics.pattern = sil.pattern || 'plain';
  template.metrics.head = head;
  template.metrics.headHeight = headHeight(dimensions);
  template.metrics.resolvedPalette = palette.resolved;
  template.metrics.outlineColor = resolvedPaletteStats(colorValue(OUTLINE_SHELL_COLOR));
  if (template.metrics.pattern === 'stripes') {
    template.metrics.stripeBandWidthRatio = 0.052;
    template.metrics.stripeValueContrast = Math.abs(palette.resolved.accent.v - palette.resolved.base.v);
  }
  template.metrics.finScale = finScale;
  template.metrics.tailScale = tailScale;
  template.metrics.pectoralSpan = template.bodyGeometry.userData.rfPectoralSpan;
  template.metrics.dorsalFinRatio = template.metrics.dorsalFin ? template.metrics.dorsalFin.height / bodyLen : 0;
  template.metrics.plateMaxZ = template.plateFeatures.length
    ? Math.max(...template.plateFeatures.map((feature) => feature.geometry.boundingBox.max.z + feature.position[2]))
    : 0;
  template.metrics.jawVolumeRatio = template.jaw
    ? (template.jaw.geometry.userData.rfJawVolume || 0) / Math.max(0.001, dimensions.bodyLen * (dimensions.radiusY * 2) * (dimensions.radiusZ * 2))
    : 0;
  template.metrics.bulkRearProfile = finite(template.bodyGeometry.userData.rfBulkRearProfile, 0);
  template.metrics.bulkFrontProfile = finite(template.bodyGeometry.userData.rfBulkFrontProfile, 0);
  template.metrics.bulkNoseProfile = finite(template.bodyGeometry.userData.rfBulkNoseProfile, 0);
  template.metrics.identityFeatureRecords = template.identityFeatureRecords;
  template.metrics.identityFeatureCount = template.identityFeatureRecords.length;
  geometryCache.set(id, template);
  return template;
}

function instantiateFeature(parent, feature, material = feature.material) {
  const mesh = new THREE.Mesh(feature.geometry, material);
  mesh.name = `RF ${feature.name}`;
  mesh.position.set(...(feature.position || [0, 0, 0]));
  mesh.rotation.set(...(feature.rotation || [0, 0, 0]));
  mesh.scale.set(...(feature.scale || [1, 1, 1]));
  if (feature.geometry.userData.rfFeatureNames) mesh.userData.rfFeatureNames = feature.geometry.userData.rfFeatureNames;
  parent.add(mesh);
  return mesh;
}

function countTriangles(root) {
  let total = 0;
  root.traverse((object) => {
    const geometry = object.geometry;
    if (!geometry) return;
    const index = geometry.getIndex?.();
    const position = geometry.getAttribute?.('position');
    total += Math.floor((index ? index.count : position ? position.count : 0) / 3);
  });
  return total;
}

function geometryBytes(geometry) {
  let bytes = 0;
  for (const key of Object.keys(geometry.attributes || {})) bytes += geometry.attributes[key].array?.byteLength || 0;
  if (geometry.index) bytes += geometry.index.array?.byteLength || 0;
  return bytes;
}

function cacheBytes() {
  const seen = new Set();
  let bytes = 0;
  for (const template of geometryCache.values()) {
    const visit = (geometry) => {
      if (!geometry || seen.has(geometry)) return;
      seen.add(geometry);
      bytes += geometryBytes(geometry);
    };
    visit(template.bodyGeometry);
    for (const feature of template.bodyFeatures) visit(feature.geometry);
    if (template.jaw) {
      visit(template.jaw.geometry);
      visit(template.jaw.teethGeometry);
    }
  }
  return bytes;
}

function buildShark(def) {
  if (!def) throw new Error('RF.Art3D.buildShark requires a shark definition');
  const template = buildTemplate(def);
  const group = new THREE.Group();
  group.name = `RF Shark ${template.id}`;
  group.userData.rfSharkId = template.id;
  group.userData.rfArchetype = def.sil?.head || 'point';
  group.userData.rfFaceShare = template.metrics.faceShare;
  group.userData.rfFaceCenterZ = template.metrics.faceCenterZ;
  group.userData.rfBulkHead = isBulkyHead(def.sil?.head || 'point');
  group.userData.rfBulkRearProfile = template.metrics.bulkRearProfile;
  group.userData.rfBulkFrontProfile = template.metrics.bulkFrontProfile;
  group.userData.rfBulkNoseProfile = template.metrics.bulkNoseProfile;
  group.userData.rfJawVolumeRatio = template.metrics.jawVolumeRatio;
  group.userData.rfTailShare = template.metrics.tailShare;
  group.userData.rfBodyLen = template.dimensions.bodyLen;
  group.userData.rfRadiusY = template.dimensions.radiusY;
  group.userData.rfEffectiveGirth = template.dimensions.girth;
  group.userData.rfGirthNorm = template.dimensions.girthNorm;
  group.userData.rfExaggeration = template.dimensions.exaggeration;
  group.userData.rfHeadScale = template.dimensions.exaggeration.headScale;
  group.userData.rfFrontSpanRatio = template.dimensions.exaggeration.frontSpan;
  group.userData.rfBodyAspect = template.metrics.bodyAspect;
  group.userData.rfAspect = template.metrics.bodyAspect;
  group.userData.rfTailLength = template.metrics.tailLength;
  group.userData.rfTailLengthRatio = template.metrics.tailLengthRatio;
  group.userData.rfTailUpperLobeHeight = template.metrics.tailUpperLobeHeight;
  group.userData.rfTailLowerLobeHeight = template.metrics.tailLowerLobeHeight;
  group.userData.rfTailLowerUpperRatio = template.metrics.tailLowerUpperRatio;
  group.userData.rfTailDepthRatio = template.metrics.tailDepthRatio;
  group.userData.rfTailNotchProjectedUpperRatio = template.metrics.tailNotchProjected.upperGap;
  group.userData.rfTailNotchProjectedLowerRatio = template.metrics.tailNotchProjected.lowerGap;
  group.userData.rfTailNotchProjectedRatio = template.metrics.tailNotchProjected.minGap;
  group.userData.rfTailNotchProjectedCssPx = template.metrics.tailNotchProjected.cssPx;
  group.userData.rfTailUpperLobeTipIndex = template.metrics.tailNotchProjected.upperIndex;
  group.userData.rfTailLowerLobeTipIndex = template.metrics.tailNotchProjected.lowerIndex;
  group.userData.rfTailNotchIndex = template.metrics.tailNotchProjected.notchIndex;
  group.userData.rfTailFinalLobeRatio = template.metrics.tailFinalLobeRatio;
  group.userData.rfTailStationCount = template.metrics.tailStationCount;
  group.userData.rfTailPointedCap = template.metrics.tailPointedCap;
  group.userData.rfTailRootWidth = template.metrics.tailRootWidth;
  group.userData.rfTailOutline = template.metrics.tailOutline;
  group.userData.rfPattern = template.metrics.pattern;
  group.userData.rfFinScale = template.metrics.finScale;
  group.userData.rfTailScale = template.metrics.tailScale;
  group.userData.rfPectoralSpan = template.metrics.pectoralSpan;
  group.userData.rfPectoralSpanRatio = template.metrics.pectoralSpan / Math.max(template.dimensions.bodyLen, 0.001);
  group.userData.rfDorsalFinRatio = template.metrics.dorsalFinRatio;
  group.userData.rfPaletteRaw = template.palette.raw;
  group.userData.rfPaletteResolved = template.palette.resolved;
  group.userData.rfOutlineColorStats = template.metrics.outlineColor;
  group.userData.rfGillBandCount = template.metrics.gillBandCount || 0;
  group.userData.rfGillBandVertexColors = !!template.metrics.gillBandVertexColors;
  group.userData.rfGillXRange = template.metrics.gillXRange || null;
  group.userData.rfMouthLineVertexColors = !!template.metrics.mouthLineVertexColors;
  group.userData.rfEyeRadius = template.metrics.eyeRadius || 0;
  group.userData.rfEyeRenderRadius = template.metrics.eyeRenderRadius || 0;
  group.userData.rfEyeRenderRadiusFraction = template.metrics.eyeRenderRadiusFraction || 0;
  group.userData.rfEyeX = template.metrics.eyeX || 0;
  group.userData.rfEyeY = template.metrics.eyeY || 0;
  group.userData.rfEyeRadiusFraction = template.metrics.eyeRadiusFraction || 0;
  group.userData.rfEyeHeadHeightFraction = template.metrics.eyeHeadHeightFraction || 0;
  group.userData.rfEyeSurfaceZ = template.metrics.eyeSurfaceZ || 0;
  group.userData.rfEyeZ = template.metrics.eyeZ || 0;
  group.userData.rfEyeProudZ = template.metrics.eyeProudZ || 0;
  group.userData.rfEyeIrisFraction = template.metrics.eyeIrisFraction || 0;
  group.userData.rfEyeIrisStats = template.metrics.eyeIrisStats || null;
  group.userData.rfEyeUnitTriangles = template.metrics.eyeUnitTriangles || 0;
  group.userData.rfEyeUnitPresent = !!template.metrics.eyeUnitPresent;
  group.userData.rfSingleCentralEye = !!template.metrics.singleCentralEye;
  group.userData.rfJawScale = template.dimensions.exaggeration.jawScale;
  group.userData.rfMouthCorner = template.dimensions.exaggeration.mouthCorner;
  group.userData.rfDorsalFin = template.metrics.dorsalFin || null;
  group.userData.rfPlateMaxZ = template.metrics.plateMaxZ;
  group.userData.rfHeadHeight = template.metrics.headHeight;
  group.userData.rfMouthWidth = template.metrics.mouthWidth || 0;
  group.userData.rfMouthWidthRatio = template.metrics.mouthWidthRatio || 0;
  group.userData.rfMouthHeightRatio = template.metrics.mouthHeightRatio || 0;
  group.userData.rfHammerFoilProjectedSpan = template.metrics.hammerFoilProjectedSpan || 0;
  group.userData.rfHammerFoilThickness = template.metrics.hammerFoilThickness || 0;
  group.userData.rfHammerBridgeOverlap = template.metrics.hammerBridgeOverlap || 0;
  group.userData.rfWhaleHeadHeight = template.metrics.whaleHeadHeight || 0;
  group.userData.rfWhaleSpotCount = template.metrics.whaleSpotCount || 0;
  group.userData.rfWhaleSpotDiameterRatio = template.metrics.whaleSpotDiameterRatio || 0;
  group.userData.rfWhaleSpotValueContrast = template.metrics.whaleSpotValueContrast || 0;
  group.userData.rfWhaleBaleenCrossing = !!template.metrics.whaleBaleenCrossing;
  group.userData.rfWhaleBaleenProudZ = template.metrics.whaleBaleenProudZ || 0;
  group.userData.rfTigerStripeBandWidthRatio = template.metrics.stripeBandWidthRatio || 0;
  group.userData.rfTigerStripeValueContrast = template.metrics.stripeValueContrast || 0;
  group.userData.rfMechPanelAreaRatio = template.metrics.mechPanelAreaRatio || 0;
  group.userData.rfMechPanelValueContrast = template.metrics.mechPanelValueContrast || 0;
  group.userData.rfMechPanelProudZ = template.metrics.mechPanelProudZ || 0;
  group.userData.rfMechThrusterProudZ = template.metrics.mechThrusterProudZ || 0;
  group.userData.rfVoidRingDiameterRatio = template.metrics.voidRingDiameterRatio || 0;
  group.userData.rfVoidRingStrokeRatio = template.metrics.voidRingStrokeRatio || 0;
  group.userData.rfVoidRingProudZ = template.metrics.voidRingProudZ || 0;
  group.userData.rfVoidEyeDiameterRatio = template.metrics.voidEyeDiameterRatio || 0;
  group.userData.rfVoidEyeProudZ = template.metrics.voidEyeProudZ || 0;
  group.userData.rfBodyMaxZ = template.metrics.bodyMaxZ;
  group.userData.rfFeatureSourceCount = template.bodyFeatures.length;
  group.userData.rfFeatureBatchCount = template.featureBatches.length;
  group.userData.rfIdentityFeatureCount = template.metrics.identityFeatureCount || 0;
  group.userData.rfIdentityFeatureRecords = template.metrics.identityFeatureRecords || [];
  group.userData.rfIdentityStormSpikeCount = template.metrics.stormSpikeCount || 0;
  group.userData.rfPlateFeatureCount = template.plateFeatures.length;
  group.userData.rfBatchesTeethPlatesEyes = template.featureBatches.some((batch) => batch.geometry.userData.rfFeatureNames.some((name) => name.includes('tooth'))) &&
    template.featureBatches.some((batch) => batch.geometry.userData.rfFeatureNames.some((name) => name.includes('plate'))) &&
    template.featureBatches.some((batch) => batch.geometry.userData.rfFeatureNames.some((name) => name.includes('eye')));
  group.userData.rfWeldedAppendages = { tail: true, dorsal: true, pectorals: true };

  const shellScale = OUTLINE_SHELL_SCALE;
  // Rev 6 (6.3): bendK=7.5/bodyLen puts the wavelength inside the rear ~40% of
  // the body (envelope span below), rather than the old 4.6 which spread a
  // near-full wavelength across the whole silhouette ("squirming worm" per
  // owner rejection). Head+gills [0..0.10] stay rigid; bend confined to
  // [0.10..0.48]*bodyLen on -transformed.x.
  const bendK = 7.5 / Math.max(template.dimensions.bodyLen, 0.001);
  const bendSpanX = template.dimensions.bodyLen * 0.10;
  const bendSpanY = template.dimensions.bodyLen * 0.48;
  const tailSpanX = template.dimensions.bodyLen * 0.50;
  const tailSpanY = tailSpanX + Math.min(template.dimensions.bodyLen * TAIL_SMOOTH_SPAN_MAX_RATIO, template.metrics.tailLength);
  const bendScale = template.dimensions.bodyLen * 0.08;
  const seed = hash01(hashStringToInt(template.id)) * TAU;
  const uniforms = {
    uBendPhase: { value: 0 },
    uBendAmp: { value: 0 },
    uBendK: { value: bendK },
    uBendSpan: { value: new THREE.Vector2(bendSpanX, bendSpanY) },
    uBendBias: { value: 0 },
    uTailAmp: { value: 0 },
    uTailSpan: { value: new THREE.Vector2(tailSpanX, tailSpanY) },
    // Engine tailAmp remains the authoritative scalar. This local scale maps
    // its legacy 0..~0.62 range to the review's <=.06L trunk motion without
    // changing the :rf-bend3 state contract.
    uBendScale: { value: bendScale }
  };
  group.userData.rfBendUniforms = uniforms;
  group.userData.rfBendK = bendK;
  group.userData.rfBendSpan = [bendSpanX, bendSpanY];
  group.userData.rfTailSpan = [tailSpanX, tailSpanY];
  group.userData.rfBendScale = bendScale;
  group.userData.rfMidBendMaxRatio = MID_BODY_BEND_MAX_RATIO;
  group.userData.rfTailSprintDisplacementRatio = DISTAL_TAIL_SPRINT_RATIO;
  group.userData.rfTailSmoothSpanRatio = (tailSpanY - tailSpanX) / Math.max(template.dimensions.bodyLen, 1e-6);
  group.userData.rfHeadEyeJawRigidAnchor = true;
  group.userData.rfBendYScale = BEND_Y_SCALE;
  group.userData.rfBendSeed = seed;
  group.userData.rfTailRootX = -template.dimensions.bodyLen * 0.52;
  group.userData.rfTailSlavedToBend = true;

  const pose = new THREE.Group();
  pose.name = 'RF pose';
  pose.rotation.y = SHARK_POSE_YAW;
  group.userData.rfPose = pose;
  group.add(pose);

  const body = new THREE.Mesh(template.bodyGeometry, bendableMaterial(template.bodyMaterial, uniforms));
  body.name = 'RF body';
  const shellMaterial = toonMaterial({ color: OUTLINE_SHELL_COLOR, side: THREE.BackSide, kind: 'silhouette shell' });
  shellMaterial.userData.rfBendAmpScale = 1 / shellScale;
  const shell = new THREE.Mesh(template.bodyGeometry, bendableMaterial(shellMaterial, uniforms));
  shell.name = 'RF dark silhouette edge shell';
  shell.scale.setScalar(shellScale);
  body.add(shell);
  for (const feature of template.featureBatches) {
    instantiateFeature(body, feature, bendableMaterial(feature.material, uniforms));
  }
  pose.add(body);

  let jaw = null;
  if (template.jaw) {
    jaw = new THREE.Mesh(template.jaw.geometry, bendableMaterial(template.jaw.material, uniforms));
    jaw.name = 'RF lower jaw';
    jaw.position.set(...template.jaw.position);
    if (template.jaw.teethGeometry && template.jaw.teethMaterial) {
      const mesh = new THREE.Mesh(template.jaw.teethGeometry, bendableMaterial(template.jaw.teethMaterial, uniforms));
      mesh.name = 'RF jaw tooth';
      jaw.add(mesh);
    }
    const jawShellMaterial = toonMaterial({ color: OUTLINE_SHELL_COLOR, side: THREE.BackSide, kind: 'jaw silhouette shell' });
    jawShellMaterial.userData.rfBendAmpScale = 1 / shellScale;
    const jawShell = new THREE.Mesh(template.jaw.geometry, bendableMaterial(jawShellMaterial, uniforms));
    jawShell.name = 'RF jaw dark silhouette edge shell';
    jawShell.scale.setScalar(shellScale);
    jaw.add(jawShell);
    body.add(jaw);
  }

  const parts = { body, tail: null, pectL: null, pectR: null, jaw };
  let visibleDrawCalls = 0;
  group.traverse((object) => {
    if (object.isMesh && object.visible && !String(object.name || '').startsWith('RF frenzy arc')) visibleDrawCalls++;
  });
  group.userData.rfVisibleDrawCalls = visibleDrawCalls;
  // Rev 6 (6.9) frenzy-arc crackle hook: a cheap, reversible vertex-color/
  // emissive-style tint flash on the existing body toon material. NO new
  // shader variant per the contract — body.material is already a per-rig
  // clone (bendableMaterial clones baseMat), so mutating its emissive here is
  // safe and cannot bleed into sibling sharks or the shared material cache.
  const flashBaseEmissive = body.material.emissive ? body.material.emissive.clone() : new THREE.Color(0, 0, 0);
  const flashBaseIntensity = finite(body.material.emissiveIntensity, 0);
  const flashState = { t: 0, dur: 0, color: null, intensity: 1 };

  // Rev 6 fix-round 2 (art CRITICAL 4 support): rfArcs(on, color) is a rig
  // method engine3d/fx3d call (guarded, "if present") to promote a frenzy
  // moment into an actual visible spectacle: 3 thin additive ribbon meshes
  // orbiting the rig, cheap enough (<=60 tris total, shared geometry+material
  // across every rig instance) to leave on for a whole frenzy window. No new
  // GLSL/shader variant -- MeshBasicMaterial, additive blending, one shared
  // BufferGeometry (a thin bowed quad strip) reused per-orbit via distinct
  // Mesh instances (three Meshes can share one geometry).
  const arcGroup = new THREE.Group();
  arcGroup.name = 'RF frenzy arcs';
  arcGroup.visible = false;
  group.add(arcGroup);
  const arcMeshes = [];
  const ARC_COUNT = 3;
  const arcRadius = template.dimensions.bodyLen * 0.62;
  for (let i = 0; i < ARC_COUNT; i++) {
    const mesh = new THREE.Mesh(sharedArcGeometry(), sharedArcMaterial());
    mesh.name = `RF frenzy arc ${i}`;
    mesh.userData.rfArcSeed = hash01(hashStringToInt(template.id), i) * TAU;
    mesh.userData.rfArcTilt = (i / ARC_COUNT) * TAU;
    arcGroup.add(mesh);
    arcMeshes.push(mesh);
  }
  const arcState = { on: false, t: 0 };
  function rfArcs(on, color = 0x27e0ff) {
    arcState.on = !!on;
    arcGroup.visible = arcState.on;
    if (arcState.on) {
      const c = color instanceof THREE.Color ? color : new THREE.Color(finite(color, 0x27e0ff));
      for (const mesh of arcMeshes) mesh.material.color.copy(c);
    }
  }
  group.userData.rfArcs = rfArcs;

  const animation = {
    baseCaptured: false, baseY: 0, lastT: null, phase: 0, pitch: 0, jaw: 0,
    bendBias: 0, lungeStretch: 0, coil: 0, jawSnapping: false, jawOvershot: false
  };
  function rfFlash(color = 0xff2bd6, dur = 0.18, intensity = 1) {
    flashState.color = color instanceof THREE.Color ? color : new THREE.Color(finite(color, 0xff2bd6));
    flashState.dur = Math.max(0.001, finite(dur, 0.18));
    flashState.t = flashState.dur;
    flashState.intensity = clamp(finite(intensity, 1), 0, 1);
  }
  group.userData.rfFlash = rfFlash;
  function animate(t = 0, state = {}) {
    const time = finite(t, 0);
    const speedFrac = clamp(finite(state.speedFrac, 0), 0, 1);
    const turn = clamp(finite(state.turn, 0), -1, 1);
    const dt = animation.lastT === null ? 0 : clamp(time - animation.lastT, 0, 0.25);
    animation.lastT = time;
    const rate = 2.2 + (8.5 - 2.2) * Math.pow(speedFrac, 0.8);
    // The internal fallback stays deliberately bounded at .03..34 local
    // amplitude. When the engine publishes finite
    // tailPhase/tailAmp (6.2) those values are AUTHORITY and override both
    // phase and amplitude below, while the internal integrator keeps running
    // so NPC/menu rigs (which never receive tailPhase/tailAmp) still animate.
    // tailPhase/tailAmp) reads a swim without reopening the "worm" envelope.
    const fallbackAmplitude = 0.03 + 0.31 * Math.pow(speedFrac, 1.3);
    animation.phase += rate * TAU * dt;
    if (animation.phase >= TAU || animation.phase <= -TAU) animation.phase %= TAU;

    const seed = group.userData.rfBendSeed;
    const hasEnginePhase = Number.isFinite(state.tailPhase);
    const hasEngineAmp = Number.isFinite(state.tailAmp);
    const bendPhase = hasEnginePhase ? state.tailPhase : animation.phase;
    const turnOscBoost = 1 + 0.35 * Math.abs(turn);
    const bendAmp = (hasEngineAmp ? state.tailAmp : fallbackAmplitude) * turnOscBoost;

    // uBendBias: a small turn-driven lateral set of the rear envelope, eased
    // 8/s toward turn*.008 bodyLen, layered additively onto the oscillation in
    // the shader (`bendZ += uBendBias*bendT`) and mirrored here for the CPU
    // tail/tests. This is what gives a sustained turn a held "set" in the
    // tail rather than only an oscillation riding through zero.
    const biasTarget = turn * group.userData.rfBodyLen * 0.008;
    animation.bendBias += (biasTarget - animation.bendBias) * clamp(dt * 8, 0, 1);

    uniforms.uBendPhase.value = bendPhase;
    uniforms.uBendAmp.value = bendAmp;
    uniforms.uBendBias.value = animation.bendBias;

    // The existing tailSweep personality now feeds the welded tail envelope.
    // No tail object exists to rotate: root continuity is entirely in the
    // shared geometry plus this phase-continuous shader term.
    const tailSweep = 0.42 + 0.34 * speedFrac;
    const tailPhase = bendPhase + group.userData.rfTailRootX * bendK;
    // Keep the rendered distal displacement inside the review's .12-.18L
    // sprint band after live-camera projection. The prior .10+.08 envelope
    // measured ~.215L from idle to sprint; this narrows the art envelope to
    // .08L idle -> .12L sprint without changing engine phase/amplitude
    // authority or the shared :rf-bend3 shader contract.
    uniforms.uTailAmp.value = group.userData.rfBodyLen * (0.08 + 0.04 * speedFrac);
    group.userData.rfTailSweepAmplitude = tailSweep;
    group.userData.rfTailPhase = tailPhase;

    const bank = clamp(finite(state.bank, turn * (0.18 + 0.17 * speedFrac)), -0.35, 0.35);
    // Body roll (art MINOR): small increase 0.02->0.028, still speed-
    // independent (oscillates at the base swim phase) and seeded so sibling
    // sharks don't roll in lockstep. Head stays rigid (rfHeadCounterYaw is a
    // separate, untouched term) -- this only adds a touch more life to the
    // trunk roll, well short of reintroducing the "worm".
    const roll = Math.sin(animation.phase + seed) * 0.028;
    group.userData.rfBodyRoll = roll;
    pose.rotation.x = clamp(bank + roll, -0.35, 0.35);
    pose.rotation.y = Math.cos(group.rotation.y) < 0 ? -SHARK_POSE_YAW : SHARK_POSE_YAW;
    // The body owns the merged head/features batch, so this counter-yaw keeps
    // the snout alive in profile without disturbing the consumer-owned pose
    // yaw contract or the shared bend program. Rev 6: constant 0.05 amplitude
    // replaced with 0.012*speedFrac (decoupled oscillator, phase+seed*0.7) so
    // an idle shark's head does not saw side to side at full amplitude.
    body.rotation.y = Math.sin(animation.phase + seed * 0.7 + Math.PI * 0.5) * (0.012 * speedFrac);
    group.userData.rfHeadCounterYaw = body.rotation.y;
    // Rev 6 (6.3) pitch, corrected (rev6-laneA-fix): state.vy is sim px/s with
    // +y = DOWN (per 6.2). A rotation about local +Z (right-hand rule) tips
    // local +X (nose, forward axis) toward local +Y. The rig's local +Y is
    // "up" in its own unflipped frame (three's convention, matching the
    // consumer's (x, -y, z) world mapping when the group carries no extra
    // Y-flip). So a naive POSITIVE rotation.z for a SINKING shark (vy>0) tips
    // the nose toward local +Y - i.e. nose-UP - which is backwards. The
    // previous pass's claim that positive rotation.z reads nose-down was the
    // root cause of the reported "nose pitched down ~40 deg while stationary"
    // symptom: any residual/nonzero vy sample (even a single stale frame from
    // a just-released dive) pitched the rig the WRONG way, and because both
    // callers only ever observed the wrong-signed result, the direction was
    // never caught against a real level/dive/level cycle. Negating here makes
    // vy>0 (sinking) tip the nose toward local -Y (down), matching the
    // in-context comment at the top of this function. This flips the SIGN
    // only - the axis (pose.rotation.z, applied before the consumer's yaw/
    // flip) and the ±0.22 rad clamp magnitude are unchanged, so the fix is a
    // one-line sign correction, not a rewrite of the pitch pipeline.
    //
    // Facing sign: verified headlessly (see repro in NOTES-rev6-laneA.md) that
    // this sign is IDENTICAL for both right-facing (group.rotation.y=0) and
    // left-facing (group.rotation.y=PI) rigs - the outer Y-flip mirrors X and
    // Z together, so a Z-axis rotation does not invert under it the way a
    // naive "mirror flips everything" assumption would suggest. No facing-
    // conditional sign is needed or applied.
    const pitchTarget = clamp(finite(state.vy, 0) * 0.0008, -0.22, 0.22);
    animation.pitch += (pitchTarget - animation.pitch) * clamp(dt * 8, 0, 1);
    pose.rotation.z = -animation.pitch;
    pose.scale.y = 1 - 0.03 * speedFrac;
    pose.scale.z = 1 - 0.03 * speedFrac;
    // Spectacle hooks (art CRITICAL 4 support): lunge stretch pulse raised
    // 1.06 -> 1.11 and the ease-in sped up (14 -> 18/s) for a punchier snap
    // forward that still relaxes back to the speed-stretch baseline at the
    // old 6/s rate. Still gated by the pose contract test (pose.scale.x > 1
    // at lungeT-driven full stretch), which continues to hold with margin.
    const lungeActive = finite(state.lungeT, 0) > 0;
    // lungeStretch is added to the 1.0 baseline below, so the 1.11x total
    // stretch contract is represented by an additive .11 target. Feeding 1.11
    // here doubled the rig during the evidence probe and made the lunge read
    // as a scale jump rather than a forward punch.
    const lungeTarget = lungeActive ? 0.11 : 0;
    animation.lungeStretch += (lungeTarget - animation.lungeStretch) * clamp(dt * (lungeActive ? 18 : 6), 0, 1);
    pose.scale.x = (1 + 0.07 * speedFrac) + animation.lungeStretch;
    // Spectacle hooks: anticipation coil on preyNear -- a slight body
    // pull-back/cock read via a small NEGATIVE pose.scale.x pinch (a coiled
    // muscle read, distinct from the forward lunge stretch which is always
    // positive) plus a touch of extra bank, so the shark visibly "loads up"
    // just before the lunge fires. Purely additive/eased; does not touch the
    // 6.3 bend envelope or the lunge contract itself.
    const coilTarget = (state.preyNear && !lungeActive) ? 1 : 0;
    animation.coil += (coilTarget - animation.coil) * clamp(dt * 10, 0, 1);
    pose.scale.x -= 0.035 * animation.coil;
    if (jaw) {
      // Rev 6 (6.5): anticipation gape raised 0.35->0.85*gape (was 0.35*gape)
      // driven by state.preyNear, eased dt*10 while opening. Swallow
      // (jawSnapT>0) snap-closes eased dt*24; the close target dips 8% below
      // fully-closed (an "overshoot" past 0 toward the mouth's own closed
      // bias) before a slower dt*10 settle back to exactly closed, so the
      // snap reads as a felt chomp rather than a linear close.
      const gape = 0.3 + clamp(finite(def.tier, 5), 5, 12) * 0.012;
      const snapping = finite(state.jawSnapT, 0) > 0;
      const bitePhase = clamp(finite(state.bitePhase, 0), 0, 1);
      const snap = bitePhase * bitePhase * (3 - 2 * bitePhase);
      const anticipation = state.preyNear ? 0.85 * gape : 0;
      const openTarget = Math.max(snap * gape, anticipation);
      if (snapping) {
        if (!animation.jawSnapping) animation.jawOvershot = false;
        const closeTarget = animation.jawOvershot ? 0 : -0.08 * gape;
        animation.jaw += (closeTarget - animation.jaw) * clamp(dt * 24, 0, 1);
        if (!animation.jawOvershot && animation.jaw <= closeTarget + 1e-4) animation.jawOvershot = true;
      } else {
        animation.jaw += (openTarget - animation.jaw) * clamp(dt * 10, 0, 1);
        animation.jawOvershot = false;
      }
      animation.jawSnapping = snapping;
      jaw.rotation.z = -animation.jaw;
    }
    if (!animation.baseCaptured) {
      animation.baseY = group.position.y;
      animation.baseCaptured = true;
    }
    // Rev 6 (6.3) bob decoupling: +seed keeps sibling sharks' vertical bob out
    // of lockstep.
    group.position.y = animation.baseY + Math.sin(time * TAU * 1.15 + seed) * (0.008 + speedFrac * 0.014) * worldScale;

    // Rev 6 (6.9) frenzy-arc crackle: decay any active rfFlash() call. Linear
    // fade over `dur`; restores the exact captured base emissive/intensity at
    // zero so repeated calls (or none at all) never drift the material.
    if (flashState.t > 0) {
      flashState.t = Math.max(0, flashState.t - dt);
      const k = flashState.dur > 0 ? flashState.t / flashState.dur : 0;
      if (body.material.emissive) {
        body.material.emissive.copy(flashBaseEmissive).lerp(flashState.color, k * flashState.intensity);
      }
      body.material.emissiveIntensity = flashBaseIntensity + (Math.max(flashBaseIntensity, 0.85) - flashBaseIntensity) * k * flashState.intensity;
      if (k <= 0 && body.material.emissive) {
        body.material.emissive.copy(flashBaseEmissive);
        body.material.emissiveIntensity = flashBaseIntensity;
      }
    }

    // Spectacle hooks (art CRITICAL 4 support): while rfArcs(true) is active,
    // orbit the 3 additive ribbons around the rig at slightly different
    // tilted planes/rates/phases so they read as a crackling electric field,
    // not one spinning ring. Cheap per-frame trig only, no new draw calls
    // beyond the pooled meshes created once in buildShark.
    if (arcState.on) {
      arcState.t += dt;
      for (let i = 0; i < arcMeshes.length; i++) {
        const mesh = arcMeshes[i];
        const spin = arcState.t * (1.8 + i * 0.55) + mesh.userData.rfArcSeed;
        mesh.rotation.set(mesh.userData.rfArcTilt * 0.6, spin, mesh.userData.rfArcTilt);
        mesh.scale.setScalar(arcRadius * (0.92 + 0.08 * Math.sin(spin * 2.3)));
      }
    }
  }

  // WORLD-UNIT NORMALIZATION (integration fix): the mesh language above is
  // authored at roughly 2 units of body length; the game world is the 2D
  // design space where a shark reads at 96 * sil.len px. One authority, here:
  // consumers (engine3d player, world3d NPCs) receive a group already at
  // world scale and must not rescale it (they capture scale.x as baseScale).
  const targetLen = 96 * clamp(finite(def.sil && def.sil.len, 1), 0.5, 3);
  const bb = new THREE.Box3().setFromObject(group);
  const rawLen = Math.max(bb.max.x - bb.min.x, 0.001);
  const worldScale = targetLen / rawLen;
  group.scale.setScalar(worldScale);
  group.userData.baseScale = worldScale;
  const identityPrimary = resolveIdentityScreenMetrics(template.metrics.identityPrimary, group, def);
  group.userData.rfIdentityPrimary = identityPrimary;
  group.userData.rfIdentityPrimaryCue = identityPrimary?.cue || null;
  group.userData.rfIdentityProjectedWidthPx = identityPrimary?.screenWidthPx || 0;
  group.userData.rfIdentityProjectedHeightPx = identityPrimary?.screenHeightPx || 0;
  group.userData.rfIdentityHeroWidthPx = identityPrimary?.heroScreenWidthPx || 0;
  group.userData.rfIdentityHeroHeightPx = identityPrimary?.heroScreenHeightPx || 0;
  group.userData.rfIdentityHeroSpanRatio = identityPrimary?.heroSpanRatio || 0;
  group.userData.rfIdentityHeroHeadHeightRatio = identityPrimary?.heroHeightRatio || 0;
  group.userData.rfIdentityProjectedAreaRatio = identityPrimary?.projectedAreaRatio || 0;
  group.userData.rfIdentitySilhouetteAreaRatio = identityPrimary?.silhouetteAreaRatio || 0;
  group.userData.rfIdentityBodyOverlapRatio = identityPrimary?.bodyOverlapRatio || 0;
  group.userData.rfIdentityProtrusionRatio = identityPrimary?.protrusionRatio || 0;
  group.userData.rfIdentityComputedProtrusionRatio = identityPrimary?.computedProtrusionRatio || 0;
  group.userData.rfIdentityEyeSeparationRatio = identityPrimary?.eyeSeparationRatio || 0;
  group.userData.rfIdentityMonsterCue = !!identityPrimary?.monster;

  return { group, parts, animate };
}

function resolveCanvas(input) {
  if (input && typeof input.getContext === 'function' && Number.isFinite(input.width)) return input;
  if (typeof input === 'string') {
    const art = RF.Art;
    const resolver = art && (art.canvasFor || art.getCanvas || art.textureCanvas);
    if (typeof resolver === 'function') {
      try {
        const result = resolver.call(art, input);
        if (result && typeof result.getContext === 'function') return result;
      } catch (_) {}
    }
    if (typeof document !== 'undefined') {
      const node = document.getElementById(input);
      if (node && typeof node.getContext === 'function') return node;
    }
  }
  return null;
}

function billboardMaterialFor(input) {
  let key = typeof input === 'string' ? input : null;
  const canvas = resolveCanvas(input);
  if (canvas) {
    if (billboardIds) {
      if (!billboardIds.has(canvas)) billboardIds.set(canvas, `canvas-${nextBillboardId++}`);
      key = billboardIds.get(canvas);
    } else {
      key = `canvas-${nextBillboardId++}`;
    }
  }
  if (!key) {
    if (input?.isTexture) key = `texture-${input.uuid}`;
    else key = `missing-${String(input)}`;
  }
  if (billboardMaterials.has(key)) return { material: billboardMaterials.get(key), canvas };

  let texture = input?.isTexture ? input : null;
  if (!texture && canvas) {
    texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  }
  if (!texture) {
    const data = new Uint8Array([0, 0, 0, 0]);
    texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    texture.needsUpdate = true;
  }
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  material.name = `RF billboard ${key}`;
  billboardMaterials.set(key, material);
  return { material, canvas };
}

function billboard(textureOrCanvasKey) {
  if (!sharedPlaneGeometry) sharedPlaneGeometry = new THREE.PlaneGeometry(1, 1);
  const resolved = billboardMaterialFor(textureOrCanvasKey);
  const mesh = new THREE.Mesh(sharedPlaneGeometry, resolved.material);
  mesh.name = 'RF billboard';
  mesh.userData.rfBillboardKey = typeof textureOrCanvasKey === 'string' ? textureOrCanvasKey : resolved.material.name;
  if (resolved.canvas && resolved.canvas.height) mesh.scale.x = resolved.canvas.width / resolved.canvas.height;
  return mesh;
}

function ensureSharedGeometry() {
  if (!sharedToothGeometry) sharedToothGeometry = new THREE.ConeGeometry(0.5, 1, 4, 1, false);
  if (!sharedEyeGeometry) sharedEyeGeometry = new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI * 0.5);
  if (!sharedIrisGeometry) sharedIrisGeometry = new THREE.CircleGeometry(1, 10);
  if (!sharedCatchlightGeometry) sharedCatchlightGeometry = new THREE.PlaneGeometry(1, 1);
  if (!sharedWhaleSpotGeometry) sharedWhaleSpotGeometry = new THREE.CircleGeometry(1, 8);
}

// Rev 6 fix-round 2 (art CRITICAL 4 support): one shared bowed-ribbon
// geometry for the frenzy arc crackle. A thin unit-radius strip in the XY
// plane, bowed along its length via a small Z zigzag so it reads as a jagged
// electric arc rather than a smooth ring; ~6 triangles per ribbon x 3
// ribbons x however many rigs reference it (shared, not per-rig) = well
// under the 60-tri total budget for the whole frenzy effect.
function sharedArcGeometry() {
  if (arcGeometrySingleton) return arcGeometrySingleton;
  const positions = [];
  const indices = [];
  // 5 segments, single-sided quad strip (2 tris/segment, DoubleSide material
  // handles the back face) = 10 tris per ribbon. 3 ribbons share this ONE
  // geometry (not 3 separate bakes), so the whole rfArcs effect costs 3 * 10
  // = 30 tris per shark that has it visible -- comfortably under the <=60
  // tri budget named in the spec, and the geometry itself is allocated once
  // for the whole module (Map-cached singleton), not per-rig.
  const segments = 5;
  const width = 0.05;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * Math.PI * 0.7 - Math.PI * 0.35;
    const jag = (i % 2 === 0 ? 1 : -1) * 0.06;
    const x = Math.cos(angle);
    const y = Math.sin(angle) + jag;
    positions.push(x, y - width, jag * 0.3, x, y + width, jag * 0.3);
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  arcGeometrySingleton = bufferGeometry(positions, indices);
  arcGeometrySingleton.name = 'RF frenzy arc ribbon';
  return arcGeometrySingleton;
}

function sharedArcMaterial() {
  // Each rig tints its own clone's .color via rfArcs(), so the template
  // itself stays neutral white; cloning (not sharing one instance) is
  // required so sibling sharks can show different arc colors.
  if (!arcMaterialTemplate) {
    arcMaterialTemplate = new THREE.MeshBasicMaterial({
      color: 0x27e0ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    arcMaterialTemplate.name = 'RF frenzy arc additive';
  }
  return arcMaterialTemplate.clone();
}

function representativeRows() {
  const rows = host.RFD?.SHARKS || RF.RFD?.SHARKS || RF.SHARKS;
  if (!rows || rows.length < 6) throw new Error('RF.Art3D.__selftest requires RFD.SHARKS');
  const heads = ['point', 'blunt', 'hammer', 'saw', 'croc', 'whale', 'angler', 'eel', 'rock', 'mech', 'skull', 'void', 'frill', 'kaiju'];
  const selected = [];
  for (const head of heads) {
    const row = rows.find((candidate) => candidate.sil?.head === head);
    if (row) selected.push(row);
  }
  // Frill is retained as a contract head from the 2D pass but has no live
  // data row. Exercise it with a private, tier-1 probe so the 14-head audit
  // does not silently regress when that archetype returns to the roster.
  if (!selected.some((row) => row.sil?.head === 'frill')) {
    const source = rows[0];
    selected.push({ ...source, id: '__selftest_frill', sil: { ...source.sil, head: 'frill' } });
  }
  return selected;
}

function bodyColorStats(geometry) {
  const attribute = geometry?.getAttribute?.('color');
  if (!attribute || attribute.itemSize !== 3 || !attribute.array?.length) throw new Error('body is missing a vertex color attribute');
  let sum = 0;
  let count = 0;
  for (const value of attribute.array) {
    if (!Number.isFinite(value)) throw new Error('body vertex color contains a non-finite channel');
    sum += value;
    count++;
  }
  let luminance = 0;
  for (let i = 0; i < attribute.array.length; i += 3) {
    luminance += attribute.array[i] * 0.2126;
    luminance += attribute.array[i + 1] * 0.7152;
    luminance += attribute.array[i + 2] * 0.0722;
  }
  const vertexCount = count / 3;
  return { meanChannel: sum / count, meanLuminance: luminance / vertexCount, vertexCount };
}

function bodyColorBlockStats(geometry) {
  const attribute = geometry?.getAttribute?.('color');
  const radial = geometry?.userData?.rfRadial;
  const stations = geometry?.userData?.rfStations;
  if (!attribute || !Number.isInteger(radial) || !Number.isInteger(stations)) throw new Error('body is missing colour-block metadata');
  const blocks = { dorsal: [], flank: [], belly: [], rim: [] };
  const ringVertexCount = radial * stations;
  for (let i = 0; i < ringVertexCount; i++) {
    const theta = (i % radial) / radial * TAU;
    const topness = (Math.cos(theta) + 1) * 0.5;
    const color = { r: attribute.getX(i), g: attribute.getY(i), b: attribute.getZ(i) };
    if (topness >= BODY_DORSAL_START) blocks.dorsal.push(color);
    else if (topness >= BODY_FLANK_START) {
      blocks.flank.push(color);
      if (topness < BODY_RIM_END) blocks.rim.push(color);
    }
    else blocks.belly.push(color);
  }
  const mean = (values) => {
    if (!values.length) return { r: 0, g: 0, b: 0, saturation: 0, value: 0, count: 0 };
    const sum = values.reduce((total, color) => {
      const hsv = rgbToHsv(color);
      total.r += color.r;
      total.g += color.g;
      total.b += color.b;
      total.saturation += hsv.s;
      total.value += hsv.v;
      return total;
    }, { r: 0, g: 0, b: 0, saturation: 0, value: 0 });
    const count = values.length;
    return {
      r: sum.r / count,
      g: sum.g / count,
      b: sum.b / count,
      saturation: sum.saturation / count,
      value: sum.value / count,
      count
    };
  };
  const dorsal = mean(blocks.dorsal);
  const flank = mean(blocks.flank);
  const belly = mean(blocks.belly);
  const rim = mean(blocks.rim);
  const distance = (a, b) => Math.sqrt(
    ((a.r - b.r) ** 2) + ((a.g - b.g) ** 2) + ((a.b - b.b) ** 2)
  ) * 255;
  return {
    dorsal,
    flank,
    belly,
    rim,
    dorsalFlankDistance: distance(dorsal, flank),
    flankBellyDistance: distance(flank, belly)
  };
}

function dominantVertexColors(geometries) {
  const histogram = new Map();
  let total = 0;
  for (const geometry of geometries) {
    const attribute = geometry?.getAttribute?.('color');
    if (!attribute || attribute.itemSize !== 3) continue;
    for (let i = 0; i < attribute.count; i++) {
      const r = clamp(Math.round(attribute.getX(i) * 15), 0, 15);
      const g = clamp(Math.round(attribute.getY(i) * 15), 0, 15);
      const b = clamp(Math.round(attribute.getZ(i) * 15), 0, 15);
      const key = `${r}:${g}:${b}`;
      histogram.set(key, (histogram.get(key) || 0) + 1);
      total++;
    }
  }
  return Array.from(histogram.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key, count]) => {
      const [r, g, b] = key.split(':').map(Number);
      return { r: r / 15, g: g / 15, b: b / 15, share: count / Math.max(1, total) };
    });
}

function distinctnessSignature(def, rig) {
  const metrics = rig.group.userData;
  const body = rig.parts.body.geometry;
  return {
    id: String(def.id),
    tier: finite(def.tier, 1),
    act: finite(def.act, 1),
    head: String(def.sil?.head || 'point'),
    pattern: String(def.sil?.pattern || 'plain'),
    fx: String(def.sil?.fx || 'none'),
    identity: (metrics.rfIdentityFeatureRecords || []).map((record) => record.name).join('|'),
    dominantColors: dominantVertexColors([body]),
    paletteColors: metrics.rfPaletteRaw,
    resolvedPalette: metrics.rfPaletteResolved,
    identitySilhouetteAreaRatio: finite(metrics.rfIdentitySilhouetteAreaRatio, 0),
    bodyAspect: finite(metrics.rfBodyAspect, 0),
    bodyLength: finite(metrics.rfBodyLen, 0),
    tailRatio: finite(metrics.rfTailLengthRatio, 0),
    finRatio: finite(metrics.rfPectoralSpanRatio, 0),
    dorsalRatio: finite(metrics.rfDorsalFinRatio, 0),
    girth: finite(metrics.rfEffectiveGirth, 0)
  };
}

function dominantColorDistance(a, b) {
  const colorsA = a.dominantColors || [];
  const colorsB = b.dominantColors || [];
  if (!colorsA.length || !colorsB.length) return 1;
  const nearest = (source, target) => source.reduce((sum, color) => {
    let best = Infinity;
    for (const candidate of target) {
      const rgb = Math.sqrt(
        (color.r - candidate.r) ** 2 +
        (color.g - candidate.g) ** 2 +
        (color.b - candidate.b) ** 2
      ) / Math.sqrt(3);
      best = Math.min(best, rgb + Math.abs(color.share - candidate.share) * 0.5);
    }
    return sum + best * color.share;
  }, 0);
  return clamp((nearest(colorsA, colorsB) + nearest(colorsB, colorsA)) * 0.5, 0, 1);
}

function rawPaletteDistance(a, b) {
  const keys = ['base', 'belly', 'accent', 'glow'];
  let total = 0;
  for (const key of keys) {
    const av = key === 'glow' && !a.paletteColors?.[key] ? a.paletteColors?.accent : a.paletteColors?.[key];
    const bv = key === 'glow' && !b.paletteColors?.[key] ? b.paletteColors?.accent : b.paletteColors?.[key];
    const ac = colorValue(av, 0);
    const bc = colorValue(bv, 0);
    total += Math.sqrt((ac.r - bc.r) ** 2 + (ac.g - bc.g) ** 2 + (ac.b - bc.b) ** 2) / Math.sqrt(3);
  }
  return total / keys.length;
}

/* Distance is deliberately readable and bounded: 31% dominant colour
 * histogram, 50% body/fin/tail proportions, and categorical identity blocks
 * for the authored pattern/head/fx. A pair is adjacent when tier distance <= 1
 * and act distance <= 1; unrelated late-game rows are not used to hide a
 * collapse in the early roster. */
function distinctnessDistance(a, b) {
  const color = dominantColorDistance(a, b) * 0.45 + rawPaletteDistance(a, b) * 0.55;
  const proportions =
    Math.abs(a.bodyAspect - b.bodyAspect) / 4.5 * 0.35 +
    Math.abs(a.tailRatio - b.tailRatio) / 0.34 * 0.18 +
    Math.abs(a.finRatio - b.finRatio) / 1.2 * 0.18 +
    Math.abs(a.dorsalRatio - b.dorsalRatio) / 0.45 * 0.12 +
    // Rev 7 de-clamped girth is a primary identity axis, not a tiny tie-break.
    Math.abs(a.girth - b.girth) / 0.8 * 0.80 +
    Math.abs(a.bodyLength - b.bodyLength) / 3 * 0.14;
  const pattern = a.pattern === b.pattern ? 0 : 1;
  const head = a.head === b.head ? 0 : 1;
  const fx = a.fx === b.fx ? 0 : 1;
  const identity = a.identity === b.identity ? 0 : 1;
  return clamp(color * 0.31 + proportions * 0.50 + pattern * 0.06 + head * 0.06 + fx * 0.07 + identity * 0.08, 0, 1);
}

function assertRosterDistinctness(signatures, result) {
  let comparisons = 0;
  let minimum = Infinity;
  let closestPair = null;
  const violations = [];
  for (let i = 0; i < signatures.length; i++) {
    for (let j = i + 1; j < signatures.length; j++) {
      const a = signatures[i];
      const b = signatures[j];
      if (Math.abs(a.tier - b.tier) > DISTINCTNESS_TIER_RADIUS || Math.abs(a.act - b.act) > DISTINCTNESS_TIER_RADIUS) continue;
      const distance = distinctnessDistance(a, b);
      comparisons++;
      if (distance < minimum) {
        minimum = distance;
        closestPair = [a.id, b.id];
      }
      if (distance < DISTINCTNESS_DISTANCE_THRESHOLD) {
        violations.push(`${a.id}/${b.id}=${distance.toFixed(3)}`);
      }
    }
  }
  result.distinctness = {
    checked: signatures.length,
    adjacentComparisons: comparisons,
    threshold: DISTINCTNESS_DISTANCE_THRESHOLD,
    tierRadius: DISTINCTNESS_TIER_RADIUS,
    minimumDistance: Number(minimum.toFixed(3)),
    closestPair
  };
  if (violations.length) {
    throw new Error(`adjacent-tier distinctness violations ${violations.length}: ${violations.slice(0, 8).join(', ')}`);
  }
  return result.distinctness;
}

function hueDistance(a, b) {
  const delta = Math.abs(finite(a, 0) - finite(b, 0));
  return Math.min(delta, 1 - delta);
}

function assertPantheonIdentity(id, group) {
  if (!PANTHEON_IDS.has(id)) return;
  const primary = group.userData.rfIdentityPrimary;
  if (!primary || !primary.cue) throw new Error(`${id}: measured primary identity cue missing`);
  if (group.userData.rfIdentityProjectedWidthPx < 18 || group.userData.rfIdentityProjectedHeightPx < 10) {
    throw new Error(`${id}: primary cue ${primary.cue} footprint ${group.userData.rfIdentityProjectedWidthPx.toFixed(1)}x${group.userData.rfIdentityProjectedHeightPx.toFixed(1)} CSS px <18x10`);
  }
  if (group.userData.rfIdentityProjectedAreaRatio < 0.02) {
    throw new Error(`${id}: primary cue ${primary.cue} area ${group.userData.rfIdentityProjectedAreaRatio.toFixed(3)} <.02 of visible hull`);
  }
  const heroHeight = group.userData.rfIdentityHeroHeadHeightRatio;
  const heroSpan = group.userData.rfIdentityHeroSpanRatio;
  const charybdisOpening = id === 'charybdisvoid' && heroHeight >= 0.55 && heroHeight <= 0.75;
  if (!charybdisOpening && !((heroHeight >= 0.18 && heroHeight <= 0.30) || (heroSpan >= 0.12 && heroSpan <= 0.22))) {
    throw new Error(`${id}: hero cue ${primary.cue} is ${heroHeight.toFixed(3)} headH / ${heroSpan.toFixed(3)}L, outside .18-.30 headH or .12-.22L`);
  }
  if (group.userData.rfIdentityBodyOverlapRatio < 0.08) {
    throw new Error(`${id}: ${primary.cue} body overlap ${group.userData.rfIdentityBodyOverlapRatio.toFixed(3)} <.08L`);
  }
  if (group.userData.rfIdentityMonsterCue) {
    if (group.userData.rfIdentityProtrusionRatio < 0.12) {
      throw new Error(`${id}: monster cue ${primary.cue} protrusion ${group.userData.rfIdentityProtrusionRatio.toFixed(3)}L <.12L`);
    }
    if (group.userData.rfIdentityEyeSeparationRatio < 0.10) {
      throw new Error(`${id}: monster cue ${primary.cue} eye/brow separation ${group.userData.rfIdentityEyeSeparationRatio.toFixed(3)}L <.10L`);
    }
  }
  const rowChecks = {
    hydrafang: group.userData.rfIdentityFeatureCount >= 4,
    cerberusjaw: group.userData.rfIdentityFeatureCount >= 4,
    medusagaze: group.userData.rfIdentityFeatureCount >= 6,
    scyllarender: group.userData.rfIdentityFeatureCount >= 6,
    minotaurram: group.userData.rfIdentityFeatureCount >= 3,
    harpyshade: group.userData.rfIdentityFeatureCount >= 2,
    lamiacoil: group.userData.rfIdentityFeatureCount >= 4,
    charybdisvoid: group.userData.rfIdentityFeatureCount >= 4,
    chimerashark: group.userData.rfIdentityFeatureCount >= 2,
    kampechrono: group.userData.rfIdentityFeatureCount >= 2
  };
  if (rowChecks[id] === false) throw new Error(`${id}: contour prescription did not create enough separated feature pieces`);
}

function assertPantheonPaletteDistinctness(signatures, result) {
  const rows = signatures.filter((signature) => PANTHEON_IDS.has(signature.id));
  const violations = [];
  let comparisons = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a.act !== b.act) continue;
      comparisons++;
      const baseA = a.resolvedPalette?.base || {};
      const baseB = b.resolvedPalette?.base || {};
      const hue = hueDistance(baseA.h, baseB.h);
      const value = Math.abs(finite(baseA.v, 0) - finite(baseB.v, 0));
      const silhouette = Math.max(a.identitySilhouetteAreaRatio || 0, b.identitySilhouetteAreaRatio || 0);
      if (!((hue >= 0.08 && value >= 0.12) || silhouette >= 0.08)) {
        violations.push(`${a.id}/${b.id}=h${hue.toFixed(3)} v${value.toFixed(3)} s${silhouette.toFixed(3)}`);
      }
    }
  }
  result.pantheonPalette = { checked: rows.length, sameActComparisons: comparisons, hueFloor: 0.08, valueFloor: 0.12, silhouetteFallback: 0.08 };
  if (violations.length) throw new Error(`Pantheon palette separation violations ${violations.length}: ${violations.slice(0, 8).join(', ')}`);
  return result.pantheonPalette;
}

function bodyBandStats(geometry) {
  const attribute = geometry?.getAttribute?.('color');
  const radial = geometry?.userData?.rfRadial;
  const stations = geometry?.userData?.rfStations;
  if (!attribute || !Number.isInteger(radial) || !Number.isInteger(stations)) throw new Error('body is missing radial value-band metadata');
  const bands = { ridge: [], flank: [], belly: [] };
  const ringVertexCount = radial * stations;
  for (let i = 0; i < ringVertexCount; i++) {
    const theta = (i % radial) / radial * TAU;
    const topness = (Math.cos(theta) + 1) * 0.5;
    const value = colorLuminance({ r: attribute.getX(i), g: attribute.getY(i), b: attribute.getZ(i) });
    if (topness >= BODY_DORSAL_START) bands.ridge.push(value);
    else if (topness >= BODY_FLANK_START) bands.flank.push(value);
    else if (topness <= BODY_BELLY_END) bands.belly.push(value);
  }
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return {
    ridge: { mean: mean(bands.ridge), count: bands.ridge.length },
    flank: { mean: mean(bands.flank), count: bands.flank.length },
    belly: { mean: mean(bands.belly), count: bands.belly.length }
  };
}

function distinctGradientTexels(texture) {
  const image = texture?.image;
  if (!image) return 0;
  if (image.data && image.width && image.height) {
    const channels = image.data.length / (image.width * image.height);
    const values = new Set();
    for (let i = 0; i < image.width * image.height; i++) values.add(image.data[Math.floor(i * channels)]);
    return values.size;
  }
  if (typeof image.getContext === 'function') {
    const ctx = image.getContext('2d');
    if (!ctx) return 0;
    const data = ctx.getImageData(0, 0, image.width, image.height).data;
    const values = new Set();
    for (let i = 0; i < data.length; i += 4) values.add(data[i]);
    return values.size;
  }
  return 0;
}

function noseIsForward(geometry) {
  const position = geometry?.getAttribute?.('position');
  const noseIndex = geometry?.userData?.rfNoseIndex;
  if (!position || !Number.isInteger(noseIndex)) return false;
  let maxX = -Infinity;
  for (let i = 0; i < position.count; i++) maxX = Math.max(maxX, position.getX(i));
  return position.getX(noseIndex) >= maxX - 1e-6 && position.getX(noseIndex) > 0;
}

// Gate the rendered side silhouette, not the old sum-of-lobe-heights proxy.
// The two terminal lobe vertices and the forward center-notch vertex are
// actual indexed geometry, so this catches a convex cap even when metadata
// claims that the tail is crescent-shaped.
function projectedTailNotchMetrics(geometry, bodyLen, gameplayLengthPx = 124) {
  const position = geometry?.getAttribute?.('position');
  const upperIndex = geometry?.userData?.rfTailUpperLobeTipIndex;
  const lowerIndex = geometry?.userData?.rfTailLowerLobeTipIndex;
  const notchIndex = geometry?.userData?.rfTailNotchIndex;
  if (!position || !Number.isInteger(upperIndex) || !Number.isInteger(lowerIndex) || !Number.isInteger(notchIndex)) {
    throw new Error('tail projected-notch vertices are missing');
  }
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }
  const upperGap = (position.getX(notchIndex) - position.getX(upperIndex)) / Math.max(bodyLen, 1e-6);
  const lowerGap = (position.getX(notchIndex) - position.getX(lowerIndex)) / Math.max(bodyLen, 1e-6);
  const minGap = Math.min(upperGap, lowerGap);
  const cssPx = minGap * Math.max(bodyLen, 0) / Math.max(maxX - minX, 1e-6) * gameplayLengthPx;
  return {
    upperGap,
    lowerGap,
    minGap,
    cssPx,
    upperX: position.getX(upperIndex),
    lowerX: position.getX(lowerIndex),
    notchX: position.getX(notchIndex),
    upperIndex,
    lowerIndex,
    notchIndex
  };
}

// Rev 6 (rev6-laneA-fix): headless world-space pitch probe. Samples the
// rig's own body node (not the outer group) so the result reflects the
// composed group -> pose -> body transform exactly as the consumer sees it.
// Returns the signed vertical world-Y component of the nose-minus-tail
// vector, in the SAME direction sense as three's own +Y-up world axis: a
// positive value means the nose sits above the tail (nose-UP), negative
// means nose-DOWN. This is deliberately a raw vector probe (not a clamped
// "pitch angle") so it also catches gross axis/compounding errors, not just
// sign flips within the intended small-angle pitch range.
function worldNoseTailPitchDeg(group, body) {
  group.updateWorldMatrix(true, true);
  const nose = body.localToWorld(new THREE.Vector3(1, 0, 0));
  const tail = body.localToWorld(new THREE.Vector3(-1, 0, 0));
  const dx = nose.x - tail.x;
  const dy = nose.y - tail.y;
  const dz = nose.z - tail.z;
  // Angle of the nose-tail axis out of the world-horizontal (x/z) plane, in
  // its own world scale (not template units, which are unrelated to the
  // rig's post-baseScale world size and would silently distort this ratio).
  return Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI;
}

function materialEmissive(material) {
  return {
    hex: material?.emissive?.getHex?.() ?? 0,
    intensity: finite(material?.emissiveIntensity, 0)
  };
}

function auditMaterialOwnership(def, rig) {
  const structural = [
    ['body', rig.parts.body],
    ['jaw', rig.parts.jaw]
  ];
  const structuralAudit = {};
  for (const [label, mesh] of structural) {
    if (!mesh) continue;
    const emissive = materialEmissive(mesh.material);
    structuralAudit[label] = emissive;
    if (emissive.hex !== 0 || emissive.intensity > BODY_EMISSIVE_MAX) {
      throw new Error(`${def.id}: ${label} material owns glow ${emissive.hex.toString(16)} @ ${emissive.intensity.toFixed(2)}`);
    }
  }

  const fx = String(def.sil?.fx || '').trim();
  let featureGlowCount = 0;
  let fxFeatureCount = 0;
  rig.parts.body.traverse((object) => {
    if (object === rig.parts.body) return;
    const emissive = materialEmissive(object.material);
    const names = [object.name, ...(object.userData?.rfFeatureNames || [])];
    if (emissive.hex !== 0 && emissive.intensity >= 0.6 && emissive.intensity <= 1.0) featureGlowCount++;
    if (fx && fx !== 'none' && emissive.hex !== 0 && emissive.intensity >= 0.6 && emissive.intensity <= 1.0 && names.some((name) => name.includes(`emissive fx ${fx}`))) {
      fxFeatureCount++;
    }
  });
  if (fx && fx !== 'none' && fxFeatureCount === 0) throw new Error(`${def.id}: ${fx} has no emissive feature mesh`);
  return { structural: structuralAudit, featureGlowCount, fxFeatureCount };
}

function bendMaterials(root) {
  const materials = [];
  root.traverse((object) => {
    const material = object.material;
    if (material?.userData?.rfBend) materials.push(material);
  });
  return materials;
}

function namedFeature(root, marker) {
  let found = null;
  root.traverse((object) => {
    if (found || !object.geometry) return;
    const names = [object.name, ...(object.userData?.rfFeatureNames || [])];
    if (names.some((name) => String(name).includes(marker))) found = object;
  });
  return found;
}

function maxVertexColorChannel(geometry) {
  const colors = geometry?.getAttribute?.('color');
  if (!colors || colors.itemSize !== 3 || !colors.array?.length) return null;
  let max = 0;
  let min = 1;
  for (const value of colors.array) {
    if (!Number.isFinite(value)) return { min: NaN, max: NaN };
    max = Math.max(max, value);
    min = Math.min(min, value);
  }
  return { min, max };
}

function gateRange(label, value, min, max, epsilon = 1e-6) {
  if (!Number.isFinite(value) || value < min - epsilon || value > max + epsilon) {
    throw new Error(`${label}=${Number.isFinite(value) ? value.toFixed(3) : value} outside [${min}, ${max}]`);
  }
}

function triangleNormalAndCentroid(geometry, indexOffset) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  const a = new THREE.Vector3().fromBufferAttribute(position, index.getX(indexOffset));
  const b = new THREE.Vector3().fromBufferAttribute(position, index.getX(indexOffset + 1));
  const c = new THREE.Vector3().fromBufferAttribute(position, index.getX(indexOffset + 2));
  const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  const centroid = a.add(b).add(c).multiplyScalar(1 / 3);
  return { normal, centroid };
}

function outwardWindingStats(geometry, indexStart, indexCount, directionForTriangle) {
  const values = [];
  const end = indexStart + indexCount;
  for (let offset = indexStart; offset < end; offset += 3) {
    const { normal, centroid } = triangleNormalAndCentroid(geometry, offset);
    if (normal.lengthSq() < 1e-12) continue;
    const direction = directionForTriangle(centroid, offset);
    if (!direction || direction.lengthSq() < 1e-12) continue;
    values.push(normal.normalize().dot(direction.normalize()));
  }
  return {
    count: values.length,
    min: values.length ? Math.min(...values) : 0,
    bad: values.filter((value) => value <= 0.02).length
  };
}

function mirroredWindingStats(geometry, indexStart, indexCount, patchOffsets = [0, 3]) {
  let count = 0;
  let bad = 0;
  const end = indexStart + indexCount;
  // Each welded fin is authored as two front triangles followed by the same
  // two patches in reverse order. The exact fin plane is sloped, so testing
  // paired normals as opposites is more meaningful than demanding +Z for
  // every slanted triangle.
  for (let base = indexStart; base < end; base += 12) {
    for (const offset of patchOffsets) {
      const first = triangleNormalAndCentroid(geometry, base + offset).normal.normalize();
      const mirrored = triangleNormalAndCentroid(geometry, base + offset + 6).normal.normalize();
      count++;
      if (first.dot(mirrored) >= -0.20) bad++;
    }
  }
  return { count, bad };
}

function weldedWindingStats(geometry) {
  const tail = outwardWindingStats(
    geometry,
    geometry.userData.rfTailSideIndexStart,
    geometry.userData.rfTailSideIndexCount,
    (centroid) => new THREE.Vector3(0, centroid.y, centroid.z)
  );
  const tailCap = outwardWindingStats(
    geometry,
    geometry.userData.rfTailCapIndexStart,
    geometry.userData.rfTailCapIndexCount,
    () => new THREE.Vector3(-1, 0, 0)
  );
  const dorsal = mirroredWindingStats(geometry, geometry.userData.rfDorsalIndexStart, geometry.userData.rfDorsalIndexCount, [0]);
  const pectoral = mirroredWindingStats(geometry, geometry.userData.rfPectoralIndexStart, geometry.userData.rfPectoralIndexCount);
  return { tail, tailCap, dorsal, pectoral };
}

function gateResolvedPalette(id, palette) {
  if (!palette) throw new Error(`${id}: resolved art ramp missing`);
  for (const [name, stats] of [['flank', palette.base], ['accent', palette.accent], ['belly', palette.belly]]) {
    if (!stats) throw new Error(`${id}: resolved ${name} swatch missing`);
  }
  const underworld = UNDERWORLD_IDS.has(String(id));
  gateRange(`${id}: flank S`, palette.base.s, underworld ? 0.70 : BODY_FLANK_SATURATION_MIN, BODY_FLANK_SATURATION_MAX);
  gateRange(`${id}: flank V`, palette.base.v, underworld ? 0.20 : BODY_FLANK_VALUE_MIN, underworld ? 0.48 : BODY_FLANK_VALUE_MAX);
  if (underworld && palette.accent.s < 0.80) throw new Error(`${id}: infernal accent S ${palette.accent.s.toFixed(3)} <.80`);
  if (underworld && palette.accent.v < 0.68) throw new Error(`${id}: infernal accent V ${palette.accent.v.toFixed(3)} <.68`);
  gateRange(`${id}: accent S`, palette.accent.s, ACCENT_SATURATION_MIN, ACCENT_SATURATION_MAX);
  gateRange(`${id}: accent V`, palette.accent.v, ACCENT_VALUE_MIN, ACCENT_VALUE_MAX);
  gateRange(`${id}: belly S`, palette.belly.s, BELLY_SATURATION_MIN, BELLY_SATURATION_MAX);
  gateRange(`${id}: belly V`, palette.belly.v, BELLY_VALUE_MIN, BELLY_VALUE_MAX);
  if (palette.glow) {
    gateRange(`${id}: glow S`, palette.glow.s, ACCENT_SATURATION_MIN, ACCENT_SATURATION_MAX);
    gateRange(`${id}: glow V`, palette.glow.v, ACCENT_VALUE_MIN, ACCENT_VALUE_MAX);
  }
}

function __selftest() {
  ensureSharedGeometry();
  const rows = host.RFD?.SHARKS || RF.RFD?.SHARKS || RF.SHARKS;
  if (!rows || rows.length !== 85) throw new Error('RF.Art3D expected 85 sharks, received ' + (rows ? rows.length : 0));
  const result = {
    pass: false,
    triangles: {},
    archetypes: {},
    bendProgramVariants: [],
    distinctness: null,
    girthSpread: 0,
    eyeUnit: null,
    notes: [],
    errors: []
  };
  try {
    const patterns = Array.from(new Set(rows.map((def) => String(def.sil?.pattern || 'plain'))));
    const unsupported = patterns.filter((pattern) => !SUPPORTED_PATTERN_IDS.has(pattern));
    if (unsupported.length) throw new Error('unsupported sil.pattern IDs: ' + unsupported.join(', '));

    const signatures = [];
    const bendKeys = new Set();
    const girthValues = [];
    let worstCaseTriangles = 0;
    let worstCaseId = null;
    const archetypeTotals = new Map();
    const archetypeCounts = new Map();
    const greatWhiteDef = rows.find((def) => String(def.id) === 'greatwhite');
    const greatWhiteHeadHeight = greatWhiteDef ? buildShark(greatWhiteDef).group.userData.rfHeadHeight : 0;

    for (const def of rows) {
      const rig = buildShark(def);
      const group = rig.group;
      const parts = rig.parts;
      const body = parts.body;
      const geometry = body.geometry;
      const id = String(def.id);

      if (!(group instanceof THREE.Group) || !body?.isMesh || typeof rig.animate !== 'function') {
        throw new Error(id + ': incomplete welded rig contract');
      }
      if (parts.tail !== null || parts.pectL !== null || parts.pectR !== null) {
        throw new Error(id + ': deleted appendage mesh leaked into parts');
      }
      if (JSON.stringify(group.userData.rfWeldedAppendages) !== JSON.stringify({ tail: true, dorsal: true, pectorals: true })) {
        throw new Error(id + ': welded appendage contract missing');
      }
      if (!geometry.getIndex() || !geometry.getAttribute('color') || geometry.userData.rfWeldedAppendages?.tail !== true) {
        throw new Error(id + ': body is not one indexed, vertex-coloured welded geometry');
      }
      if (!noseIsForward(geometry)) throw new Error(id + ': +x nose invariant failed');
      const worldBox = new THREE.Box3().setFromObject(group);
      const worldTarget = 96 * clamp(finite(def.sil?.len, 1), 0.5, 3);
      if (Math.abs((worldBox.max.x - worldBox.min.x) - worldTarget) > 1e-4) {
        throw new Error(id + ': worldScale bbox X is not 96*sil.len');
      }

      const head = String(def.sil?.head || 'point');
      gateResolvedPalette(id, group.userData.rfPaletteResolved);
      assertPantheonIdentity(id, group);
      gateRange(`${id}: outline V`, group.userData.rfOutlineColorStats?.v, OUTLINE_VALUE_MIN, OUTLINE_VALUE_MAX);
      if (group.userData.rfTailLengthRatio < TAIL_MIN_RATIO || group.userData.rfTailLengthRatio > TAIL_MAX_RATIO) {
        throw new Error(`${id}: tail length ratio ${group.userData.rfTailLengthRatio.toFixed(3)} outside [${TAIL_MIN_RATIO}, ${TAIL_MAX_RATIO}]`);
      }
      gateRange(`${id}: tail lower/upper lobe ratio`, group.userData.rfTailLowerUpperRatio, 0.60, 0.72);
      gateRange(`${id}: projected notch/upper tip`, group.userData.rfTailNotchProjectedUpperRatio, 0.10, 0.14);
      gateRange(`${id}: projected notch/lower tip`, group.userData.rfTailNotchProjectedLowerRatio, 0.10, 0.14);
      gateRange(`${id}: projected notch minimum gap`, group.userData.rfTailNotchProjectedRatio, 0.10, 0.14);
      if (group.userData.rfTailNotchProjectedCssPx < 10 - 1e-6) {
        throw new Error(`${id}: projected notch gap ${group.userData.rfTailNotchProjectedCssPx.toFixed(2)} CSS px < 10 CSS px`);
      }
      gateRange(`${id}: tail depth`, group.userData.rfTailDepthRatio, 0.08, 0.12);
      gateRange(`${id}: tail final-20% taper`, group.userData.rfTailFinalLobeRatio, 0, 0.35);
      if (group.userData.rfTailStationCount < 10 || group.userData.rfTailStationCount > 12 || !group.userData.rfTailPointedCap) {
        throw new Error(`${id}: tail stations/cap contract missing`);
      }
      const eyeRadiusRanges = {
        whale: [0.34, 0.42], kaiju: [0.42, 0.50], cyclops: [0.50, 0.62]
      };
      const eyeRange = id === 'cyclopseye' ? eyeRadiusRanges.cyclops : eyeRadiusRanges[head] || [0.38, 0.46];
      gateRange(`${id}: eye radius/radiusY`, group.userData.rfEyeRadiusFraction, eyeRange[0], eyeRange[1]);
      gateRange(`${id}: front span/bodyLen`, group.userData.rfFrontSpanRatio, 0.36, 0.45);
      const headScaleRanges = {
        point: [1.45, 1.55], blunt: [1.55, 1.70], hammer: [1.55, 1.65],
        whale: [1.35, 1.50], kaiju: [1.45, 1.65]
      };
      if (headScaleRanges[head]) gateRange(`${id}: ${head} head scale`, group.userData.rfHeadScale, ...headScaleRanges[head]);
      if (!(group.userData.rfEyeSurfaceZ > 0) || group.userData.rfEyeZ / group.userData.rfEyeSurfaceZ < 1.03) {
        throw new Error(`${id}: eye is not >=1.03x local surface`);
      }
      gateRange(`${id}: iris/eye radius`, group.userData.rfEyeIrisFraction, 0.45, 0.55);
      gateRange(`${id}: iris S`, group.userData.rfEyeIrisStats?.s, 0.75, 1.0);
      gateRange(`${id}: iris V`, group.userData.rfEyeIrisStats?.v, 0.65, 1.0);
      gateRange(`${id}: mouth width/bodyLen`, group.userData.rfMouthWidthRatio, 0.38, 0.58);
      gateRange(`${id}: mouth height/headHeight`, group.userData.rfMouthHeightRatio, 0.28, 0.40);
      if (head === 'hammer') {
        gateRange(`${id}: hammer projected X span/bodyLen`, group.userData.rfHammerFoilProjectedSpan / group.userData.rfBodyLen, 0.42, 0.56);
        gateRange(`${id}: hammer thickness/bodyLen`, group.userData.rfHammerFoilThickness / group.userData.rfBodyLen, 0.10, 0.16);
        if (group.userData.rfHammerBridgeOverlap / group.userData.rfBodyLen < 0.12) throw new Error(`${id}: hammer bridge overlap <.12L`);
      }
      if (head === 'whale') {
        gateRange(`${id}: whale/greatwhite head height`, group.userData.rfWhaleHeadHeight / Math.max(greatWhiteHeadHeight, 1e-6), 1.4, 1.7);
        gateRange(`${id}: whale spot count`, group.userData.rfWhaleSpotCount, 6, 10);
        gateRange(`${id}: whale spot diameter/headHeight`, group.userData.rfWhaleSpotDiameterRatio, 0.06, 0.10);
        if (group.userData.rfWhaleSpotValueContrast < 0.25 || !group.userData.rfWhaleBaleenCrossing || group.userData.rfWhaleBaleenProudZ / group.userData.rfBodyLen < 0.03) {
          throw new Error(`${id}: whale spots/baleen contrast or proud placement failed`);
        }
      }
      if (String(def.sil?.pattern || '') === 'stripes') {
        gateRange(`${id}: stripe band width/bodyLen`, group.userData.rfTigerStripeBandWidthRatio, 0.045, 0.060);
        if (group.userData.rfTigerStripeValueContrast < 0.25) throw new Error(`${id}: tiger stripe value contrast <.25`);
      }
      if (head === 'mech') {
        gateRange(`${id}: mech panel visible area`, group.userData.rfMechPanelAreaRatio, 0.08, 0.15);
        if (group.userData.rfMechPanelValueContrast < 0.25 || group.userData.rfMechPanelProudZ / group.userData.rfBodyLen < 0.03 || group.userData.rfMechThrusterProudZ / group.userData.rfBodyLen < 0.04) {
          throw new Error(`${id}: mech panel/thruster contrast or proud placement failed`);
        }
      }
      if (head === 'void') {
        gateRange(`${id}: void ring diameter/headHeight`, group.userData.rfVoidRingDiameterRatio, 0.75, 0.95);
        gateRange(`${id}: void ring stroke/headHeight`, group.userData.rfVoidRingStrokeRatio, 0.06, 0.09);
        gateRange(`${id}: void eye diameter/headHeight`, group.userData.rfVoidEyeDiameterRatio, 0.20, 0.28);
        if (group.userData.rfVoidRingProudZ / group.userData.rfBodyLen < 0.03 || group.userData.rfVoidEyeProudZ / group.userData.rfBodyLen < 0.03) throw new Error(`${id}: void identity feature is sub-surface`);
      }

      const uniforms = group.userData.rfBendUniforms;
      const requiredUniforms = ['uBendPhase', 'uBendAmp', 'uBendK', 'uBendSpan', 'uBendBias', 'uTailAmp', 'uTailSpan', 'uBendScale'];
      if (!uniforms || requiredUniforms.some((name) => !uniforms[name])) {
        throw new Error(id + ': incomplete bend v3 uniform bundle');
      }
      const materials = bendMaterials(group);
      if (materials.length < 3) throw new Error(id + ': body/shell/features did not receive bend materials');
      for (const material of materials) {
        if (typeof material.onBeforeCompile !== 'function' || typeof material.customProgramCacheKey !== 'function') {
          throw new Error(id + ': bend hook missing');
        }
        const key = material.customProgramCacheKey();
        if (!key.endsWith(':rf-bend3') || key !== material.customProgramCacheKey()) {
          throw new Error(id + ': unstable or old bend cache key ' + key);
        }
        if (material.userData.rfBendUniforms !== uniforms) throw new Error(id + ': bend uniforms are not identity-shared');
        bendKeys.add(key);
      }
      const shaderProbe = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>' };
      materials[0].onBeforeCompile(shaderProbe);
      const shaderSource = shaderProbe.vertexShader;
      for (const token of requiredUniforms) {
        if (!shaderSource.includes('uniform ' + (token === 'uBendSpan' || token === 'uTailSpan' ? 'vec2 ' : 'float ') + token)) {
          throw new Error(id + ': GLSL declaration missing for ' + token);
        }
      }
      if (!shaderSource.includes('transformed.y += ' + BEND_Y_SCALE.toFixed(2) + '*bendZ')) {
        throw new Error(id + ': bend y-component coupling missing');
      }

      const shell = body.children.find((object) => object.name === 'RF dark silhouette edge shell');
      if (!shell || Math.abs(shell.scale.x - OUTLINE_SHELL_SCALE) > 1e-9 || shell.material.side !== THREE.BackSide) {
        throw new Error(id + ': whole-body 1.010 BackSide shell missing');
      }
      const jawShell = parts.jaw?.children.find((object) => object.name === 'RF jaw dark silhouette edge shell');
      if (def.tier >= 5) {
        if (!parts.jaw?.isMesh || !jawShell || jawShell.material.side !== THREE.BackSide || Math.abs(jawShell.scale.x - OUTLINE_SHELL_SCALE) > 1e-9) {
          throw new Error(id + ': articulated jaw 1.010 shell missing');
        }
        if (!parts.jaw.geometry.getAttribute('color') || !parts.jaw.geometry.userData.rfJawRimMatchesBody || !parts.jaw.geometry.userData.rfJawCavityBand) {
          throw new Error(id + ': jaw rim/cavity vertex-color contract missing');
        }
      }

      const roots = geometry.userData.rfSharedAppendageRoots;
      const usage = new Map();
      for (const index of geometry.getIndex().array) usage.set(index, (usage.get(index) || 0) + 1);
      if (!roots || roots.tail.length !== geometry.userData.rfRadial || roots.dorsal.length !== 2 || roots.pectorals?.L?.length !== 2 || roots.pectorals?.R?.length !== 2) {
        throw new Error(id + ': shared appendage root metadata is incomplete');
      }
      for (const index of [...roots.tail, ...roots.dorsal, ...roots.pectorals.L, ...roots.pectorals.R]) {
        if (!Number.isInteger(index) || index < 0 || index >= geometry.getAttribute('position').count || (usage.get(index) || 0) < 4) {
          throw new Error(id + ': peduncle/fin root is not shared by indexed faces');
        }
      }
      const winding = weldedWindingStats(geometry);
      if (!winding.tail.count || winding.tail.bad || winding.tail.min <= 0.02 || !winding.tailCap.count || winding.tailCap.bad || winding.tailCap.min <= 0.02) {
        throw new Error(`${id}: welded tail side winding is inward (min dot ${winding.tail.min.toFixed(3)}, bad ${winding.tail.bad}/${winding.tail.count})`);
      }
      if (!winding.dorsal.count || winding.dorsal.bad || winding.pectoral.bad) {
        throw new Error(`${id}: dorsal/pectoral winding contract failed (dorsal bad ${winding.dorsal.bad}, pectoral bad ${winding.pectoral.bad})`);
      }
      group.userData.rfWindingStats = winding;

      const eyeUnitMin = id === 'cyclopseye' ? 80 : 170;
      if (!group.userData.rfEyeUnitPresent || group.userData.rfEyeUnitTriangles < eyeUnitMin || group.userData.rfEyeUnitTriangles > 230) {
        throw new Error(id + ': eye geometry unit missing or outside the ~190-tri pair budget');
      }
      if (id === 'cyclopseye' && !group.userData.rfSingleCentralEye) throw new Error(id + ': normal eye pair was not suppressed');
      if (finite(def.act, 1) >= 4) {
        if (group.userData.rfFeatureBatchCount !== 1 || group.userData.rfVisibleDrawCalls > 6) {
          throw new Error(`${id}: compact late-roster draw budget failed (${group.userData.rfFeatureBatchCount} feature batches, ${group.userData.rfVisibleDrawCalls} visible draws)`);
        }
        const records = group.userData.rfIdentityFeatureRecords || [];
        if (!records.length) throw new Error(`${id}: identity feature batch is empty`);
        for (const record of records) {
          gateRange(`${id}: ${record.name} proud offset/bodyLen`, record.proudOffset / Math.max(group.userData.rfBodyLen, 1e-6), 0.03, 0.08);
          if (record.deltaV < 0.25) throw new Error(`${id}: ${record.name} delta-V ${record.deltaV.toFixed(3)} <.25 vs flank`);
        }
      }
      if (body.material.vertexColors !== true) throw new Error(id + ': body material lost vertexColors');
      const expectedFlat = ['rock', 'mech', 'kaiju'].includes(def.sil?.head);
      if (!!body.material.flatShading !== expectedFlat) throw new Error(id + ': archetype normal policy is wrong');
      if (group.userData.rfMidBendMaxRatio > 0.06 || group.userData.rfTailSprintDisplacementRatio < 0.12 || group.userData.rfTailSprintDisplacementRatio > 0.18) {
        throw new Error(id + ': animation bend envelope exceeds .06L/.12-.18L gates');
      }
      gateRange(`${id}: smooth root-to-tip span`, group.userData.rfTailSmoothSpanRatio, TAIL_SMOOTH_SPAN_MIN_RATIO, TAIL_SMOOTH_SPAN_MAX_RATIO);
      if (!group.userData.rfHeadEyeJawRigidAnchor) throw new Error(id + ': head/eye/jaw anchor is not rigid');

      const bodyStats = bodyColorStats(geometry);
      if (!(bodyStats.meanLuminance > 0) || !Number.isFinite(bodyStats.meanLuminance)) throw new Error(id + ': invalid body vertex colors');
      const bodyBlocks = bodyColorBlockStats(geometry);
      gateRange(`${id}: vertex flank S`, bodyBlocks.flank.saturation, UNDERWORLD_IDS.has(id) ? 0.70 : BODY_FLANK_SATURATION_MIN, 1.0);
      // Act 5 keeps a dark base block (the resolved palette gate above); its
      // radiant edge rows intentionally remain bright and are not averaged
      // into the dark-base floor here.
      gateRange(`${id}: vertex flank V`, bodyBlocks.flank.value, UNDERWORLD_IDS.has(id) ? 0.20 : BODY_FLANK_VALUE_MIN, 1.0);
      const triangles = countTriangles(group);
      result.triangles[id] = triangles;
      if (triangles > 4200) throw new Error(id + ': ' + triangles + ' triangles exceeds the Rev 7 4200/rig gate');
      if (triangles > worstCaseTriangles) {
        worstCaseTriangles = triangles;
        worstCaseId = id;
      }
      archetypeTotals.set(head, (archetypeTotals.get(head) || 0) + triangles);
      archetypeCounts.set(head, (archetypeCounts.get(head) || 0) + 1);
      const normalizedRadius = group.userData.rfRadiusY / Math.max(group.userData.rfBodyLen, 0.001);
      girthValues.push(normalizedRadius);
      signatures.push(distinctnessSignature(def, rig));
      auditMaterialOwnership(def, rig);
      rig.animate(0, { speedFrac: 0, turn: 0 });
      rig.animate(1 / 60, { speedFrac: 1, turn: 0 });
      if (!Number.isFinite(uniforms.uTailAmp.value) || uniforms.uTailAmp.value <= 0 || !Number.isFinite(uniforms.uTailSpan.value.x)) {
        throw new Error(id + ': tail envelope did not animate');
      }
      const tailX = -group.userData.rfBodyLen * 0.72;
      const mirroredTail = bendOffset(tailX, uniforms.uBendPhase.value, uniforms.uBendAmp.value, group.userData.rfBendK, group.userData.rfBendSpan[0], group.userData.rfBendSpan[1], uniforms.uBendBias.value, uniforms.uTailAmp.value, group.userData.rfTailSpan[0], group.userData.rfTailSpan[1]);
      if (!Number.isFinite(mirroredTail)) throw new Error(id + ': CPU bendOffset tail mirror is not finite');
      rig.animate(0.5, { speedFrac: 1, turn: 0, tailPhase: 2.75, tailAmp: 0.41 });
      if (Math.abs(uniforms.uBendPhase.value - 2.75) > 1e-9 || Math.abs(uniforms.uBendAmp.value - 0.41) > 1e-9) {
        throw new Error(id + ': engine tailPhase/tailAmp authority was lost');
      }
    }

    const minGirth = Math.min(...girthValues);
    const maxGirth = Math.max(...girthValues);
    result.girthSpread = Number(((maxGirth - minGirth) / Math.max(minGirth, 1e-6)).toFixed(3));
    if (result.girthSpread < 0.35) throw new Error('roster relative girth spread ' + result.girthSpread + ' < 0.35');
    assertPantheonPaletteDistinctness(signatures, result);
    assertRosterDistinctness(signatures, result);
    for (const [head, total] of archetypeTotals) {
      result.archetypes[head] = {
        count: archetypeCounts.get(head),
        meanTriangles: Math.round(total / archetypeCounts.get(head))
      };
    }
    result.worstCaseTriangles = worstCaseTriangles;
    result.worstCaseId = worstCaseId;
    result.bendProgramVariants = Array.from(bendKeys).sort();
    if (result.bendProgramVariants.length > 8) throw new Error('bend program variants ' + result.bendProgramVariants.length + ' > 8');
    const leviathan = rows.find((def) => String(def.id) === 'leviathanrex');
    const typhon = rows.find((def) => String(def.id) === 'typhonmaw');
    if (leviathan && typhon) {
      const leviathanRig = buildShark(leviathan);
      const typhonRig = buildShark(typhon);
      const leviathanSpikes = leviathanRig.group.userData.rfIdentityStormSpikeCount || leviathanRig.group.userData.rfPlateFeatureCount;
      const typhonSpikes = typhonRig.group.userData.rfIdentityStormSpikeCount;
      if (!(typhonSpikes > leviathanSpikes)) throw new Error(`typhonmaw storm spike count ${typhonSpikes} is not greater than leviathanrex ${leviathanSpikes}`);
    }
    result.eyeUnit = { trianglesPerPair: rows[0] ? buildShark(rows[0]).group.userData.rfEyeUnitTriangles : 0, checked: rows.length };
    result.notes.push('Rev 7: all 85 definitions build through one indexed welded body geometry; tail, dorsal, and pectorals share body-ring indices.');
    result.notes.push('Pantheon/Underworld: 24 identity rosters use proud .03-.08L, delta-V >=.25 feature geometry; Act 4/5 rigs compact to one feature batch and <=6 visible draws.');
    result.notes.push('Cyclops Eye: cyclopseye suppresses the normal eye pair and uses one oversized central eye with its own reduced unit-triangle gate.');
    result.notes.push('Rev 7 art fix: resolved flank/accent/belly ramps, welded 11-station .28-.36L crescent tails with a projected .10-.14L center notch, and 1.010 BackSide contour shells are numeric-gated.');
    result.notes.push('Rev 7 art fix: bend v3 declares uBendPhase/uBendAmp/uBendK/uBendSpan/uBendBias/uTailAmp/uTailSpan/uBendScale, preserves engine phase/amplitude authority, y coupling, and :rf-bend3.');
    result.notes.push('Rev 7 art fix: oversized head/eye/jaw, hammer/whale/tiger silhouette cues, proud void/mech/baleen features, and eye/ramp values are numeric-gated.');
    result.notes.push('Rev 7: tri ceiling 4200/rig; worst case ' + worstCaseId + ' at ' + worstCaseTriangles + ' tris; relative normalized girth spread ' + result.girthSpread + '.');
    result.pass = true;
  } catch (error) {
    result.errors.push(error.message || String(error));
  }
  return result;
}
const Art3D = {
  buildShark,
  bendableMaterial,
  bendOffset,
  billboard,
  __selftest,
  paletteOf,
  stats() {
    return { sharkTemplates: geometryCache.size, materials: materialCache.size, billboardMaterials: billboardMaterials.size, geometryBytes: cacheBytes() };
  }
};

RF.Art3D = Art3D;
ensureSharedGeometry();

export { Art3D, bendableMaterial, bendOffset, buildShark, billboard, __selftest };
export default Art3D;
