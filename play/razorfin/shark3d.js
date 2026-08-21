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

const TAU = Math.PI * 2;
const WHITE = 0xffffff;
const FEATURE_EMISSIVE_INTENSITY = 0.82;
const EYE_EMISSIVE_INTENSITY = 0.9;
const BODY_EMISSIVE_MAX = 0.05;
const BODY_RAMP_BANDS = [0.30, 0.65, 0.84, 1.0];
const BODY_DORSAL_START = 0.75;
const BODY_FLANK_START = 0.50;
const BODY_BELLY_END = BODY_FLANK_START;
const BODY_RIM_END = 0.58;
const BODY_FLANK_SATURATION_FLOOR = 0.45;
const BODY_FLANK_SATURATION_TARGET = 0.70;
const BODY_FLANK_VALUE_MIN = 0.45;
const BODY_FLANK_VALUE_MAX = 0.75;
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
const TAIL_MIN_RATIO = 0.18;
const TAIL_MAX_RATIO = 0.34;
const FUSIFORM_BODY_ASPECT_MIN = 3.1;
const FUSIFORM_ASPECT_MIN = 2.8;
const FUSIFORM_SECTION_Z_RATIO = 0.92;
const FUSIFORM_SECTION_Z_RATIO_MIN = 0.72;
const BODY_BELLY_BAKE_LUMINANCE = 0.74;
const SHARK_POSE_YAW = 0.42;
const PECTORAL_SPLAY = 0.35;
const OUTLINE_SHELL_SCALE = 1.022;
const OUTLINE_SHELL_COLOR = 0x0a1a24;
const BEND_Y_SCALE = 0.35;
const FUSIFORM_EXCEPTIONS = new Set(['eel', 'kaiju', 'whale']);
// These heads either own an intentionally full front profile or add a large
// front feature batch. Keep them on the same axis/overlap audit even when
// their data row is still subject to the ordinary fusiform girth clamp.
const BULKY_HEADS = new Set(['blunt', 'angler', 'whale', 'kaiju']);

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

function paletteOf(def) {
  const source = def?.sil?.palette || {};
  return {
    // Keep the authored swatches intact for feature materials. The body uses
    // committedColor() only where a very dark source swatch would disappear
    // at gameplay scale; hue/value remain owned by the same data number.
    base: colorValue(source.base, 0x204050),
    belly: colorValue(source.belly, 0xddeee7),
    accent: colorValue(source.accent, 0x164557),
    glow: source.glow ? colorValue(source.glow) : null,
    raw: {
      base: hex(source.base, 0x204050),
      belly: hex(source.belly, 0xddeee7),
      accent: hex(source.accent, 0x164557),
      glow: source.glow ? hex(source.glow) : 0
    }
  };
}

function hash01(a, b = 0, c = 0) {
  let n = (a * 374761393 + b * 668265263 + c * 362437) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
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
  const key = [kind, colorHex, glowHex, resolvedEmissiveIntensity, vertexColors ? 1 : 0, transparent ? 1 : 0, opacity, side, depthWrite ? 1 : 0].join(':');
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
  if (!uniforms || !uniforms.uBendPhase || !uniforms.uBendAmp || !uniforms.uBendK || !uniforms.uBendSpan) {
    throw new Error('RF.Art3D.bendableMaterial requires the complete bend uniform bundle');
  }
  const material = baseMat.clone();
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
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nuniform float uBendPhase;\nuniform float uBendAmp;\nuniform float uBendK;\nuniform vec2 uBendSpan;'
    ).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\nfloat bendT=smoothstep(uBendSpan.x,uBendSpan.y,-transformed.x);\nfloat bendZ=${ampScale === 1 ? 'uBendAmp' : `uBendAmp*${ampScale.toFixed(6)}`}*bendT*sin(uBendPhase+transformed.x*uBendK);\ntransformed.z += bendZ;\ntransformed.y += ${BEND_Y_SCALE.toFixed(2)}*bendZ;`
    );
  };
  material.customProgramCacheKey = () => `${baseKey}:rf-bend`;
  material.needsUpdate = true;
  return material;
}

function bendOffset(x, phase, amp, k, spanX, spanY) {
  const t = clamp(((-finite(x, 0)) - finite(spanX, 0)) / Math.max(1e-6, finite(spanY, 1) - finite(spanX, 0)), 0, 1);
  const bendT = t * t * (3 - 2 * t);
  return finite(amp, 0) * bendT * Math.sin(finite(phase, 0) + finite(x, 0) * finite(k, 0));
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

function bodyRampColors(palette, act = 1) {
  // These are authored as hard blocks, not a grey lightness ramp. The source
  // rows sometimes use very dark values for base/accent, so committedColor
  // raises visibility while preserving the authored hue and palette family.
  const dorsal = committedColor(palette.base, 0.50, 0.12, 0.22);
  const flank = committedColor(palette.base, BODY_FLANK_SATURATION_TARGET, 0.50, BODY_FLANK_VALUE_MAX);
  const accentMark = committedColor(palette.accent, 0.58, 0.52, 0.72);
  // Keep the belly from arriving pre-lit. A lower bake floor leaves the
  // directional key responsible for the top-lit gradient and underside falloff.
  const belly = liftColorToLuminance(palette.belly, BODY_BELLY_BAKE_LUMINANCE);
  const highlight = committedColor(palette.belly, 0.12, 0.58, 0.72);
  const glow = committedColor(palette.glow || palette.accent, 0.68, 0.52, 0.72);
  const shadow = committedColor(palette.base, 0.58, 0.08, 0.16);
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
      for (let i = 0; i < 7; i++) if (nearBand(u, 0.19 + i * 0.105, 0.034)) return accent;
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

function profileAt(u, head, girth, id = '') {
  const barrel = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, u))), 0.47);
  let profile = 0.08 + barrel * (0.88 + u * 0.16);
  if (head === 'point') profile *= 1 - 0.75 * Math.pow(u, 3.1);
  if (head === 'blunt') profile *= 0.9 + u * 0.14;
  if (head === 'hammer') profile *= 0.94 + u * 0.12;
  if (head === 'saw') profile *= u > 0.72 ? 1 - (u - 0.72) * 1.25 : 1;
  if (head === 'whale') {
    // Whale bulk belongs to the loft itself. A smooth shoulder grows toward
    // the +x head while the first quarter remains a narrow peduncle; this
    // avoids a round body plus a detached front fish silhouette.
    const peduncle = 0.48 + 0.52 * smoothStep01((u - 0.02) / 0.24);
    const shoulder = 0.62 + 0.86 * smoothStep01((u - 0.18) / 0.58);
    profile = 0.08 + barrel * peduncle * shoulder;
  }
  if (head === 'kaiju') profile *= 1.16 + u * 0.34;
  if (head === 'croc') profile *= u > 0.58 ? 1 - ((u - 0.58) / 0.42) * 0.5 : 1;
  if (head === 'angler') profile *= 1.02 + 0.20 * Math.exp(-Math.pow((u - 0.72) / 0.24, 2));
  if (head === 'eel') profile *= 0.62 + 0.14 * (1 - u);
  if (head === 'rock') profile *= 0.98 + 0.11 * Math.sin(u * 17);
  if (head === 'mech') profile *= 0.96 + 0.08 * ((Math.floor(u * 8) % 2) ? 1 : -0.35);
  if (head === 'void') profile *= 0.89 + 0.12 * Math.sin(u * Math.PI * 0.8);
  if (id === 'mako') profile *= 0.82;
  if (id === 'thresher') profile *= 0.78;
  if (head === 'skull') profile *= 0.96 + u * 0.1;
  if (head === 'void') profile *= 0.92 + 0.08 * Math.sin(u * Math.PI * 0.8);
  // The front 22% resolves into a small rounded ring before the explicit
  // nose cap. Face masses still own the archetype silhouette, but the spine
  // no longer carries an egg-shaped blunt front into profile cameras.
  if (head !== 'whale' && head !== 'kaiju') {
    const snoutT = clamp((u - 0.78) / 0.22, 0, 1);
    const snoutEase = snoutT * snoutT * (3 - 2 * snoutT);
    profile *= 1 - 0.84 * snoutEase;
  }
  return profile * (1 + Math.min(0.22, girth * 0.12));
}

function spineLineScale(u, theta, head) {
  const barrel = Math.max(0, Math.sin(Math.PI * Math.min(1, u)));
  // A restrained, monotonic dorsal line reads as a back; the belly is allowed
  // to carry the fuller mid-body curve. This is deliberately separate from
  // profileAt so the radial section remains a cheap, cacheable scalar.
  let scale = Math.cos(theta) >= 0
    ? 0.90 + 0.10 * u
    : 0.72 + 0.28 * Math.pow(barrel, 1.15);
  if (head === 'eel') scale *= 0.92 + 0.08 * Math.sin(Math.PI * u);
  if (head === 'whale' || head === 'kaiju') scale *= 1.05;
  if (head === 'rock') scale *= 1 + 0.045 * Math.sin(u * 23 + theta * 3);
  if (head === 'mech') scale *= 1 + 0.035 * (((Math.floor(u * 10) + Math.floor(theta * 2)) % 2) ? 1 : -1);
  return scale;
}

function makeSpineGeometry(def, palette, dimensions) {
  const sil = def.sil || {};
  const head = sil.head || 'point';
  const len = clamp(finite(sil.len, 1), 0.5, 3);
  const girth = clamp(finite(sil.girth, 0.36), 0.18, 0.8);
  const bodyLen = dimensions.bodyLen;
  const radiusY = dimensions.radiusY;
  const radiusZ = dimensions.radiusZ;
  const stations = head === 'eel' ? 24 : head === 'kaiju' ? 22 : def.tier >= 5 ? 18 : 16;
  const radial = 12;
  const ramp = bodyRampColors(palette, finite(def.act, def.tier >= 5 ? 2 : 1));
  const positions = [];
  const colors = [];
  const indices = [];

  for (let i = 0; i <= stations; i++) {
    const u = i / stations;
    const x = -bodyLen * 0.52 + bodyLen * u;
    const profile = profileAt(u, head, girth, String(def.id || ''));
    const stationY = radiusY * profile;
    const stationZ = radiusZ * profile * (head === 'eel' ? 0.92 : 1);
    for (let j = 0; j < radial; j++) {
      const theta = (j / radial) * TAU;
      const jitter = head === 'rock'
        ? 1 + (hash01(i, j, 5) - 0.5) * 0.2
        : head === 'mech' ? 1 + (((i + j) % 3) - 1) * 0.025
          : 1;
      const c = bodyVertexColor(ramp, theta, u, i, j, sil.pattern || 'plain');
      const lineScale = spineLineScale(u, theta, head);
      addVertex(positions, colors, x, Math.cos(theta) * stationY * lineScale * jitter, Math.sin(theta) * stationZ * jitter, c);
    }
  }

  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < radial; j++) {
      const next = (j + 1) % radial;
      const a = i * radial + j;
      const b = (i + 1) * radial + j;
      const c = (i + 1) * radial + next;
      const d = i * radial + next;
      indices.push(a, d, b, b, d, c);
    }
  }

  const root = positions.length / 3;
  addVertex(positions, colors, -bodyLen * 0.52, 0, 0, ramp.dorsal);
  const nose = positions.length / 3;
  addVertex(positions, colors, bodyLen * 0.48, 0, 0, ramp.belly);
  for (let j = 0; j < radial; j++) {
    const next = (j + 1) % radial;
    indices.push(root, next, j);
    const a = stations * radial + j;
    const b = stations * radial + next;
    indices.push(nose, a, b);
  }
  const geometry = bufferGeometry(positions, indices, colors);
  geometry.userData.rfStations = stations + 1;
  geometry.userData.rfRadial = radial;
  geometry.userData.rfProfile = head;
  geometry.userData.rfLen = len;
  geometry.userData.rfNoseIndex = nose;
  geometry.userData.rfTailRootIndex = root;
  geometry.userData.rfForwardAxis = '+x';
  geometry.userData.rfPattern = sil.pattern || 'plain';
  geometry.userData.rfPalette = palette.raw;
  geometry.userData.rfSectionZRatio = radiusZ / Math.max(radiusY, 0.001);
  const midU = 0.5;
  const midProfile = profileAt(midU, head, girth, String(def.id || ''));
  const midYRadius = radiusY * midProfile * spineLineScale(midU, 0, head);
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
      face.end = L * 0.53; face.mouthWidth = L * 0.36;
      face.contour = [[start, -r * 0.5, 0], [face.end, -r * 0.16, 0], [face.end, r * 0.12, 0], [L * 0.32, r * 0.72, 0], [start, r * 0.66, 0]];
      break;
    case 'blunt':
      face.end = L * 0.51; face.mouthStart = L * 0.12; face.mouthWidth = L * 0.4; face.mouthHeight = r * 0.5;
      face.contour = [[start, -r * 0.62, 0], [face.end, -r * 0.54, 0], [face.end, r * 0.56, 0], [L * 0.28, r * 0.78, 0], [start, r * 0.72, 0]];
      break;
    case 'hammer':
      face.end = L * 0.55; face.mouthStart = L * 0.1; face.mouthWidth = L * 0.38;
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
      face.start = L * 0.04; face.end = L * 0.50; face.mouthStart = L * 0.0; face.mouthWidth = L * 0.54; face.mouthHeight = r * 0.72;
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
      face.end = L * 0.59; face.mouthStart = L * 0.02; face.mouthWidth = L * 0.58; face.mouthHeight = r * 0.84;
      face.jawWidth = L * 0.8; face.jawHeight = r * 0.66; face.jawDepth = r * 1.78;
      face.contour = [[start, -r * 0.92, 0], [face.end, -r * 0.78, 0], [L * 0.64, -r * 0.34, 0], [L * 0.62, r * 0.48, 0], [L * 0.45, r * 1.24, 0], [start, r * 1.02, 0]];
      break;
  }
  face.share = (face.end - face.start) / L;
  return face;
}

function mergeFeatureDescriptors(features) {
  const buckets = new Map();
  for (const feature of features) {
    if (!feature?.geometry || !feature.material) continue;
    const key = feature.material.uuid;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: feature.material, positions: [], colors: [], indices: [], names: [], count: 0, hasColors: false };
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
        bucket.colors.push(
          sourceColors ? sourceColors.getX(i) : 1,
          sourceColors ? sourceColors.getY(i) : 1,
          sourceColors ? sourceColors.getZ(i) : 1
        );
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

function makeTailGeometry(bodyLen, tailScale, tier, palette, pattern, head = 'point', id = '') {
  // Tail scale is already capped to 2.0 by buildTemplate. Keeping the
  // requested formula literal here makes the silhouette gate auditable.
  const length = bodyLen * (0.20 + tailScale * 0.07);
  const upper = bodyLen * (0.16 + tailScale * 0.05);
  const lower = upper * 0.62;
  const root = bodyLen * 0.045;
  const depth = bodyLen * 0.045;
  // The authored length/lobe formulas stay intact. The outline below uses the
  // same scale more decisively: mako/thresher tails cut a deeper crescent,
  // whale/kaiju tails carry a broad root, and eel tails stay needle-thin.
  const notch = length * clamp(0.46 + tailScale * 0.06 + (id === 'mako' ? 0.08 : 0), 0.46, 0.70);
  const rootBias = head === 'eel' ? 0.72 : head === 'whale' || head === 'kaiju' ? 1.24 : 1;
  const lobeSweep = id === 'mako' || id === 'thresher' ? 1.16 : head === 'hammer' ? 0.9 : 1;
  const points = [
    [0, root * 0.55 * rootBias, 0],
    [-bodyLen * 0.018, root * 0.82 * rootBias, 0],
    [-length * 0.18, upper * 0.34 * lobeSweep, 0],
    [-length * 0.78, upper * 0.80 * lobeSweep, 0],
    [-length, upper, 0],
    [-length * 0.80, upper * 0.10 * lobeSweep, 0],
    [-notch, 0, 0],
    [-length * 0.79, -lower * 0.10 * lobeSweep, 0],
    [-length * 0.93, -lower, 0],
    [-length * 0.18, -lower * 0.34 * lobeSweep, 0],
    [-bodyLen * 0.018, -root * 0.82 * rootBias, 0],
    [0, -root * 0.55 * rootBias, 0]
  ];
  const positions = [];
  const colors = [];
  const ramp = bodyRampColors(palette);
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const tip = i === 3 || i === 4 || i === 8 || i === 9;
      const c = side ? ramp.belly : tip ? ramp.accent : ramp.flank;
      addVertex(positions, colors, p[0], p[1], side ? -depth * 0.5 : depth * 0.5, c);
    }
  }
  const indices = [];
  const fan = (offset, reverse) => {
    for (let i = 1; i < points.length - 1; i++) {
      if (reverse) indices.push(offset, offset + i + 1, offset + i);
      else indices.push(offset, offset + i, offset + i + 1);
    }
  };
  fan(0, false);
  fan(points.length, true);
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length;
    indices.push(i, next, points.length + i, next, points.length + next, points.length + i);
  }
  const geometry = bufferGeometry(positions, indices, colors);
  geometry.userData.rfPattern = pattern || 'plain';
  geometry.userData.rfTailLength = length;
  geometry.userData.rfTailLengthRatio = length / Math.max(bodyLen, 0.001);
  geometry.userData.rfTailUpperLobeHeight = upper;
  geometry.userData.rfTailLowerLobeHeight = lower;
  geometry.userData.rfTailRootWidth = root;
  geometry.userData.rfTailNotchX = -notch;
  geometry.userData.rfTailOutline = 'crescent-concave-peduncle-notch';
  geometry.userData.rfTailHead = head;
  geometry.userData.rfTailId = id;
  return geometry;
}

function makePectoralGeometry(bodyLen, radiusY, span, head = 'point', finScale = 1) {
  const root = [bodyLen * (head === 'hammer' ? 0.06 : 0.02), -radiusY * 0.05, 0];
  const shoulder = [-bodyLen * (head === 'whale' ? 0.08 : head === 'angler' ? 0.12 : 0.20), -radiusY * 0.14, span * 0.38];
  const tipFactor = head === 'hammer' ? 0.58 : head === 'whale' ? 0.54 : head === 'angler' ? 0.58 : 0.56 + clamp(finScale, 0.5, 2.1) * 0.055;
  const tip = [-bodyLen * tipFactor, -radiusY * (head === 'hammer' ? 0.3 : 0.42), span];
  const rear = [-bodyLen * (tipFactor - 0.10), -radiusY * 0.2, span * 0.56];
  const geometry = makeExtrudedPolygon([root, shoulder, tip, rear], Math.max(0.012, radiusY * 0.035));
  geometry.userData.rfPectoralTipX = tip[0];
  geometry.userData.rfPectoralLength = root[0] - tip[0];
  geometry.userData.rfPectoralDepth = Math.max(0.012, radiusY * 0.035);
  geometry.userData.rfPectoralHead = head;
  geometry.userData.rfPectoralSpan = span;
  return geometry;
}

function makeJawGeometry(width, height, depth) {
  const hinge = -width * 0.14;
  const contour = [
    [hinge, height * 0.04, 0],
    [width * 0.78, height * 0.02, 0],
    [width, -height * 0.18, 0],
    [width * 0.94, -height * 0.72, 0],
    [width * 0.72, -height, 0],
    [hinge * 0.4, -height * 0.88, 0]
  ];
  const geometry = makeExtrudedPolygon(contour, depth);
  const jawSize = geometry.boundingBox.getSize(new THREE.Vector3());
  geometry.userData.rfJawVolume = jawSize.x * jawSize.y * jawSize.z;
  geometry.userData.rfJawHingeX = hinge;
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

function addFaceMass(template, def, palette, dimensions) {
  const head = def.sil?.head || 'point';
  const spec = faceIdentity(head, dimensions.bodyLen, dimensions.radiusY);
  const faceMaterial = toonMaterial({
    color: head === 'kaiju' || head === 'rock' ? lerpColor(palette.base, palette.accent, 0.2) : palette.base,
    kind: `${head} face mass`
  });
  const depth = dimensions.radiusZ * (head === 'kaiju' ? 1.55 : head === 'whale' || head === 'angler' ? 1.35 : 1.18);
  const faceGeometry = makeExtrudedPolygon(spec.contour, depth);
  faceGeometry.userData.rfFaceShare = spec.share;
  faceGeometry.userData.rfFaceHead = head;
  // The committed head contour is a continuation of the loft, not a
  // camera-facing offset mesh. Surface-facing mouth/eye features still own
  // their deliberate +/-Z offsets below.
  template.bodyFeatures.push(descriptor(faceGeometry, faceMaterial, [0, 0, 0], [0, 0, 0], [1, 1, 1], `${head} committed front head`));
  template.metrics.faceCenterZ = 0;
  template.face = { spec, geometry: faceGeometry };
}

function addEyeFeatures(template, def, palette, dimensions) {
  const head = def.sil?.head || 'point';
  const act = finite(def.act, def.tier >= 5 ? 2 : 1);
  const eyeRadius = dimensions.radiusY * (head === 'skull' ? 0.095 : 0.08);
  const eyeX = dimensions.bodyLen * (head === 'hammer' ? 0.38 : head === 'whale' ? 0.28 : 0.36);
  const eyeY = dimensions.radiusY * (head === 'eel' ? 0.28 : 0.56);
  const eyeZ = dimensions.radiusZ * 0.91;
  template.metrics.eyeRadius = eyeRadius;
  template.metrics.eyeX = eyeX;
  template.metrics.eyeY = eyeY;
  const eyeBaseSeed = head === 'skull' ? palette.accent : lerpColor(palette.belly, WHITE, 0.58);
  const eyeBase = liftColorToLuminance(eyeBaseSeed, 0.78);
  const eyeIris = act >= 2 ? (palette.glow || palette.accent) : lerpColor(palette.base, 0x06111c, 0.8);
  const eyeGlow = act >= 2 ? (palette.glow || palette.accent) : 0;
  const eyeBaseMaterial = toonMaterial({ color: eyeBase, glow: eyeGlow, emissiveIntensity: EYE_EMISSIVE_INTENSITY, kind: 'eye' });
  const irisMaterial = toonMaterial({ color: eyeIris, glow: eyeGlow, emissiveIntensity: EYE_EMISSIVE_INTENSITY, kind: 'iris' });
  const socketMaterial = toonMaterial({ color: 0x05080d, kind: 'socket' });
  const catchlightMaterial = toonMaterial({ color: WHITE, kind: 'catchlight' });
  const eyeRingMaterial = act >= 3
    ? toonMaterial({ color: palette.glow || palette.accent, glow: palette.glow || palette.accent, emissiveIntensity: 1.0, side: THREE.DoubleSide, kind: 'eye ring' })
    : null;
  const browMaterial = toonMaterial({
    color: act >= 3 ? (palette.glow || palette.accent) : lerpColor(palette.base, 0x07131d, 0.4),
    glow: act >= 3 ? (palette.glow || palette.accent) : 0,
    emissiveIntensity: FEATURE_EMISSIVE_INTENSITY,
    kind: 'brow'
  });

  for (const side of [1, -1]) {
    template.bodyFeatures.push(descriptor(sharedEyeGeometry, eyeBaseMaterial, [eyeX, eyeY, side * eyeZ], [0, 0, 0], [eyeRadius, eyeRadius, eyeRadius], `${side > 0 ? 'eyeL' : 'eyeR'} base`));
    template.bodyFeatures.push(descriptor(sharedIrisGeometry, head === 'skull' ? socketMaterial : irisMaterial, [eyeX + eyeRadius * 0.18, eyeY, side * (eyeZ + eyeRadius * 0.72)], [0, 0, 0], [eyeRadius * 0.58, eyeRadius * 0.58, eyeRadius * 0.28], `${side > 0 ? 'eyeL' : 'eyeR'} iris`));
    template.bodyFeatures.push(descriptor(sharedCatchlightGeometry, catchlightMaterial, [eyeX + eyeRadius * 0.34, eyeY + eyeRadius * 0.22, side * (eyeZ + eyeRadius * 1.02)], [0, 0, 0], [eyeRadius * 0.23, eyeRadius * 0.23, eyeRadius * 0.12], `${side > 0 ? 'eyeL' : 'eyeR'} catchlight`));
    if (eyeRingMaterial) {
      const ring = new THREE.TorusGeometry(eyeRadius * 0.88, eyeRadius * 0.09, 5, 10);
      template.bodyFeatures.push(descriptor(ring, eyeRingMaterial, [eyeX + eyeRadius * 0.16, eyeY, side * (eyeZ + eyeRadius * 0.86)], [0, 0, 0], [1, 1, 1], `${side > 0 ? 'eyeL' : 'eyeR'} act3 glow ring`));
    }
    const browScale = head === 'kaiju' ? 1.62 : act >= 3 ? 1.18 : 1;
    const brow = makeBeveledPanel(eyeRadius * 2.7 * browScale, eyeRadius * (0.38 + (head === 'kaiju' ? 0.16 : 0)), eyeRadius * (0.42 + (head === 'kaiju' ? 0.2 : 0)), eyeRadius * 0.08);
    template.bodyFeatures.push(descriptor(brow, browMaterial, [eyeX - eyeRadius * 0.08, eyeY + eyeRadius * (1.42 + (head === 'kaiju' ? 0.16 : 0)), side * (eyeZ + eyeRadius * 0.12)], [0, side * (0.14 + (head === 'kaiju' ? 0.1 : 0)), side * -0.16], [1, 1, 1], `${side > 0 ? 'browL' : 'browR'} attitude shelf`));
  }
}

function addMouthAndTeeth(template, def, palette, dimensions) {
  const tier = finite(def.tier, 1);
  const head = def.sil?.head || 'point';
  const spec = template.face.spec;
  const mouthWidth = spec.mouthWidth;
  const mouthHeight = spec.mouthHeight;
  const mouthStart = spec.mouthStart;
  const mouthY = -dimensions.radiusY * (head === 'angler' || head === 'kaiju' ? 0.27 : 0.22);
  const mouthLineMaterial = toonMaterial({ color: WHITE, vertexColors: true, kind: 'mouth line vertex color' });
  const mouthLine = makeVertexColorExtrudedPolygon([
    [mouthStart, mouthY - dimensions.radiusY * 0.05, 0],
    [mouthStart + mouthWidth * 0.92, mouthY + dimensions.radiusY * 0.01, 0],
    [mouthStart + mouthWidth * 0.90, mouthY - dimensions.radiusY * 0.08, 0],
    [mouthStart + mouthWidth * 0.04, mouthY - dimensions.radiusY * 0.16, 0]
  ], dimensions.radiusZ * 0.025, 0x071017);
  template.bodyFeatures.push(descriptor(
    mouthLine,
    mouthLineMaterial,
    [0, 0, dimensions.radiusZ * 1.005],
    [0, 0, 0],
    [1, 1, 1],
    'underslung mouth line vertex color'
  ));
  template.metrics.mouthLineVertexColors = true;
  if (tier < 2) return;
  const mouthMaterial = toonMaterial({ color: 0x09050d, kind: 'mouth' });
  const toothMaterial = toonMaterial({ color: 0xfff4d4, kind: 'teeth' });
  for (const side of [1, -1]) {
    const mouth = descriptor(makeMouthGeometry(mouthWidth, mouthHeight, dimensions.radiusZ * 0.1), mouthMaterial, [mouthStart, mouthY, side * dimensions.radiusZ * 0.98], [0, 0, 0], [1, 1, 1], `${side > 0 ? 'near' : 'far'} connected mouth cavity`);
    template.bodyFeatures.push(mouth);
    const count = head === 'kaiju' ? 10 : head === 'whale' ? 8 : Math.min(9, 5 + Math.floor(tier / 3));
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count;
      const x = mouthStart + mouthWidth * u;
      const toothScale = dimensions.radiusY * (0.1 + tier * 0.007) * (head === 'croc' ? 0.88 : head === 'kaiju' ? 1.18 : 1);
      const toothHeight = toothScale * (head === 'kaiju' ? 3.0 : 2.6);
      const upperRoot = mouthY + mouthHeight * 0.42;
      template.bodyFeatures.push(descriptor(sharedToothGeometry, toothMaterial, [x, upperRoot - toothHeight * 0.5, side * dimensions.radiusZ * 1.03], [0, 0, Math.PI], [toothScale, toothHeight, toothScale], `${side > 0 ? 'near' : 'far'} rooted upper tooth`));
      if (i % 2 === 0 || tier >= 6) {
        const lowerHeight = toothHeight * 0.78;
        const lowerRoot = mouthY - mouthHeight * 0.42;
        template.bodyFeatures.push(descriptor(sharedToothGeometry, toothMaterial, [x + mouthWidth * 0.02, lowerRoot + lowerHeight * 0.5, side * dimensions.radiusZ * 1.03], [0, 0, 0], [toothScale * 0.88, lowerHeight, toothScale * 0.88], `${side > 0 ? 'near' : 'far'} rooted lower tooth`));
      }
    }
  }

  if (tier >= 5) {
    const jawWidth = spec.jawWidth;
    const jawHeight = spec.jawHeight;
    const jawDepth = dimensions.radiusZ * (spec.jawDepth / dimensions.radiusY);
    template.jaw = {
      geometry: makeJawGeometry(jawWidth, jawHeight, jawDepth),
      material: toonMaterial({ color: lerpColor(palette.base, palette.belly, head === 'kaiju' ? 0.22 : 0.34), kind: 'jaw' }),
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

function makeDorsalFinGeometry(head, L, r, height, finScale) {
  const rootX = L * 0.05;
  const low = r * 0.68;
  const sweep = clamp(finScale, 0.5, 2.1);
  if (head === 'eel') {
    return makeExtrudedPolygon([
      [L * 0.23, low, 0], [L * 0.05, low + height, 0],
      [-L * 0.23, low + height * 0.22, 0], [-L * 0.08, low, 0]
    ], Math.max(0.018, r * 0.1));
  }
  if (head === 'whale') {
    return makeExtrudedPolygon([
      [L * 0.2, low, 0], [L * 0.07, low + height * 0.72, 0],
      [-L * 0.18, low + height * 0.45, 0], [-L * 0.08, low, 0]
    ], Math.max(0.018, r * 0.16));
  }
  if (head === 'angler') {
    return makeExtrudedPolygon([
      [L * 0.17, low, 0], [L * 0.01, low + height, 0],
      [-L * 0.12, low + height * 0.42, 0], [-L * 0.08, low, 0]
    ], Math.max(0.018, r * 0.12));
  }
  if (head === 'rock') {
    return makeExtrudedPolygon([
      [L * 0.17, low, 0], [L * 0.09, low + height * 0.68, 0],
      [L * 0.01, low + height, 0], [-L * 0.08, low + height * 0.54, 0],
      [-L * 0.15, low, 0]
    ], Math.max(0.018, r * 0.14));
  }
  if (head === 'mech') {
    return makeExtrudedPolygon([
      [L * 0.18, low, 0], [L * 0.08, low + height * 0.42, 0],
      [-L * 0.03, low + height, 0], [-L * 0.17, low + height * 0.2, 0],
      [-L * 0.12, low, 0]
    ], Math.max(0.018, r * 0.13));
  }
  if (head === 'void') {
    return makeExtrudedPolygon([
      [L * 0.19, low, 0], [L * 0.04, low + height * 0.84, 0],
      [-L * 0.15, low + height * 0.3, 0], [-L * 0.1, low, 0]
    ], Math.max(0.018, r * 0.12));
  }
  if (head === 'hammer') {
    return makeExtrudedPolygon([
      [L * 0.2, low, 0], [L * 0.06, low + height * 0.76, 0],
      [-L * 0.16, low + height * 0.52, 0], [-L * 0.11, low, 0]
    ], Math.max(0.018, r * 0.13));
  }
  if (head === 'saw' || head === 'croc') {
    return makeExtrudedPolygon([
      [L * 0.18, low, 0], [L * 0.02, low + height, 0],
      [-L * 0.13, low + height * 0.22, 0], [-L * 0.09, low, 0]
    ], Math.max(0.018, r * 0.1));
  }
  // Point/blunt/skull/frill share the swept predator fin, but the scale still
  // changes both its height and the amount of rear rake.
  const rake = L * (0.06 + sweep * 0.025);
  return makeExtrudedPolygon([
    [L * 0.16, low, 0], [rootX - rake * 0.32, low + height, 0],
    [-L * (0.08 + sweep * 0.025), low + height * 0.24, 0], [-L * 0.1, low, 0]
  ], Math.max(0.018, r * 0.12));
}

function addHeadFeatures(template, def, palette, dimensions) {
  const sil = def.sil || {};
  const head = sil.head || 'point';
  const L = dimensions.bodyLen;
  const r = dimensions.radiusY;
  const rz = dimensions.radiusZ;
  const solid = (color, kind = 'head') => toonMaterial({ color, kind });
  const accent = solid(palette.accent, 'accent');
  const glowColor = palette.glow || palette.accent;
  const glow = toonMaterial({ color: glowColor, glow: glowColor, emissiveIntensity: 0.86, kind: 'glow' });

  if (head === 'hammer') {
    const foil = new THREE.BoxGeometry(L * 0.12, r * 0.18, r * 3.25);
    template.bodyFeatures.push(descriptor(foil, solid(palette.base, 'hammer'), [L * 0.45, 0, 0], [0, 0, 0], [1, 1, 1], 'hammer T-bar')); 
    const bridge = new THREE.BoxGeometry(L * 0.22, r * 0.22, r * 0.72);
    template.bodyFeatures.push(descriptor(bridge, accent, [L * 0.35, 0, 0], [0, 0, 0], [1, 1, 1], 'hammer bridge'));
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
    const baleenHeight = r * 0.28;
    const baleenDepth = Math.max(0.012, rz * 0.08);
    for (let i = 0; i < baleenCount; i++) {
      const u = (i + 0.5) / baleenCount;
      const x = mouth.mouthStart + mouth.mouthWidth * u;
      template.bodyFeatures.push(descriptor(
        new THREE.BoxGeometry(Math.max(L * 0.009, r * 0.018), baleenHeight, baleenDepth),
        baleen,
        [x, -r * 0.18, rz * 0.78],
        [0, 0, 0],
        [1, 1, 1],
        'whale baleen'
      ));
    }
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
    const panelMaterial = solid(lerpColor(palette.base, palette.accent, 0.38), 'mech panels');
    for (let i = 0; i < 3; i++) {
      template.bodyFeatures.push(descriptor(makeBeveledPanel(L * 0.2, r * 0.55, rz * 0.16, r * 0.08), panelMaterial, [L * (0.12 + i * 0.17), r * 0.12, rz * 0.78], [0, 0.1 * i, 0], [1, 1, 1], 'mech beveled panel'));
    }
    const thruster = new THREE.CylinderGeometry(r * 0.09, r * 0.13, r * 0.36, 6);
    for (const side of [1, -1]) {
      template.bodyFeatures.push(descriptor(thruster, glow, [-L * 0.13, r * 0.15, side * rz * 0.85], [0, 0, Math.PI * 0.5], [1, 1, 1], 'mech fin thruster'));
    }
  } else if (head === 'skull') {
    const crestMaterial = solid(lerpColor(palette.belly, WHITE, 0.22), 'bone crest');
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.ConeGeometry(r * 0.14, r * (0.42 + (i % 2) * 0.15), 5);
      template.bodyFeatures.push(descriptor(spike, crestMaterial, [L * (0.15 + i * 0.1), r * 0.82, 0], [0, 0, 0], [1, 1, 1], 'skull bone crest'));
    }
    const socket = toonMaterial({ color: 0x020308, glow: palette.glow, emissiveIntensity: FEATURE_EMISSIVE_INTENSITY, kind: 'skull socket' });
    template.bodyFeatures.push(descriptor(new THREE.SphereGeometry(r * 0.2, 6, 4), socket, [L * 0.34, r * 0.36, rz * 0.9], [0, 0, 0], [1.2, 0.8, 0.4], 'skull socket shadow'));
  } else if (head === 'void') {
    const ring = new THREE.TorusGeometry(r * 0.52, Math.max(0.018, r * 0.045), 5, 10);
    template.bodyFeatures.push(descriptor(ring, glow, [L * 0.33, 0, rz * 0.72], [0, Math.PI * 0.5, 0], [1.05, 1, 1], 'void sweep ring'));
    template.bodyFeatures.push(descriptor(new THREE.SphereGeometry(r * 0.12, 6, 4), glow, [L * 0.43, 0, rz * 0.85], [0, 0, 0], [1, 1, 0.35], 'void eye'));
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
  if (head !== 'kaiju') {
    const finScale = dimensions.finScale;
    const dorsalHeight = head === 'eel'
      ? L * (0.27 + finScale * 0.08)
      : head === 'whale' ? L * (0.12 + finScale * 0.035)
        : L * (0.17 + finScale * 0.045);
    const dorsalRootX = L * 0.05;
    const dorsal = makeDorsalFinGeometry(head, L, r, dorsalHeight, finScale);
    dorsal.userData.rfDorsalSwept = true;
    dorsal.userData.rfDorsalRootX = dorsalRootX;
    dorsal.userData.rfDorsalHeight = dorsalHeight;
    template.metrics.dorsalFin = { rootX: dorsalRootX, height: dorsalHeight, swept: true };
    template.bodyFeatures.push(descriptor(dorsal, dorsalMaterial, [0, 0, 0], [0, 0, 0], [1, 1, 1], 'swept dorsal fin'));
  }
  const gillMaterial = toonMaterial({ color: WHITE, vertexColors: true, kind: 'gill bands vertex color' });
  const gillColor = 0x071017;
  const gillWidth = L * 0.010;
  const gillHeight = r * 0.72;
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
      ], Math.max(0.012, rz * 0.035), gillColor);
      template.bodyFeatures.push(descriptor(
        band,
        gillMaterial,
        [0, 0, side * rz * 0.91],
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
  if (finite(def.tier, 1) >= 9 && head !== 'eel' && head !== 'skull' && head !== 'kaiju') {
    for (let i = 0; i < 4; i++) {
      const plate = new THREE.ConeGeometry(r * 0.09, r * (0.22 + (i % 2) * 0.1), 5);
      template.bodyFeatures.push(descriptor(plate, glow, [L * (-0.08 + i * 0.13), r * 0.62, rz * 0.1], [0, 0, 0], [1, 1, 1], 'act three dorsal plate'));
    }
  }
}

function addEmissiveDetails(template, def, palette, dimensions) {
  if (!palette.glow) return;
  const sil = def.sil || {};
  const pattern = sil.pattern || 'plain';
  const fx = String(sil.fx || '').trim();
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
  // Fusiform profiles use a narrower scale law and a hard effective-girth
  // ceiling. Whale/eel/kaiju are the documented bulk exceptions.
  const girth = isFusiformHead(head) ? clamp(authoredGirth, 0.18, 0.44) : authoredGirth;
  // The roster contains one thresher tailScale=2.2. Cap the effective value
  // before applying makeTailGeometry's literal formula so every ordinary
  // head remains inside the 0.18..0.34 tail-length contract.
  const tailScale = clamp(finite(sil.tailScale, 1), 0.55, 2.0);
  const finScale = clamp(finite(sil.finScale, 1), 0.5, 2.1);
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
    whale: 1.22,
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
  const radiusY = bodyLen * (isFusiformHead(head) ? 0.10 + girth * 0.085 : 0.14 + girth * 0.21)
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
  const pectoralSpan = radiusZ * finProfile * pectoralHeadFactor;
  const dimensions = { bodyLen, radiusY, radiusZ, len, girth, authoredGirth, tailScale, finScale, pectoralSpan, id };
  const palette = paletteOf(def);
  const template = {
    id,
    dimensions,
    palette,
    bodyGeometry: makeSpineGeometry(def, palette, dimensions),
    bodyMaterial: toonMaterial({ color: WHITE, glow: 0x000000, vertexColors: true, kind: 'body' }),
    tailGeometry: makeTailGeometry(bodyLen, tailScale, finite(def.tier, 1), palette, sil.pattern, head, id),
    tailMaterial: toonMaterial({ color: WHITE, glow: 0x000000, vertexColors: true, kind: 'tail' }),
    pectGeometry: makePectoralGeometry(bodyLen, radiusY, pectoralSpan, head, finScale),
    pectMaterial: toonMaterial({ color: palette.accent, glow: 0x000000, kind: 'pectoral' }),
    bodyFeatures: [],
    jaw: null,
    teeth: 0,
    plateFeatures: [],
    featureBatches: [],
    metrics: {}
  };
  addFaceMass(template, def, palette, dimensions);
  addHeadFeatures(template, def, palette, dimensions);
  addEmissiveDetails(template, def, palette, dimensions);
  addEyeFeatures(template, def, palette, dimensions);
  addMouthAndTeeth(template, def, palette, dimensions);
  template.teeth = template.bodyFeatures.filter((feature) => feature.name.includes('tooth')).length;
  template.featureBatches = mergeFeatureDescriptors(template.bodyFeatures);
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
  template.metrics.tailShare = (template.tailGeometry.boundingBox.max.x - template.tailGeometry.boundingBox.min.x) / Math.max(0.001, bodySize.x);
  template.metrics.tailLength = template.tailGeometry.userData.rfTailLength;
  template.metrics.tailLengthRatio = template.tailGeometry.userData.rfTailLengthRatio;
  template.metrics.tailUpperLobeHeight = template.tailGeometry.userData.rfTailUpperLobeHeight;
  template.metrics.tailLowerLobeHeight = template.tailGeometry.userData.rfTailLowerLobeHeight;
  template.metrics.tailRootWidth = template.tailGeometry.userData.rfTailRootWidth;
  template.metrics.tailOutline = template.tailGeometry.userData.rfTailOutline;
  template.metrics.pattern = sil.pattern || 'plain';
  template.metrics.head = head;
  template.metrics.finScale = finScale;
  template.metrics.tailScale = tailScale;
  template.metrics.pectoralSpan = template.pectGeometry.userData.rfPectoralSpan;
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
    visit(template.tailGeometry);
    visit(template.pectGeometry);
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
  group.userData.rfBodyAspect = template.metrics.bodyAspect;
  group.userData.rfAspect = template.metrics.bodyAspect;
  group.userData.rfTailLength = template.metrics.tailLength;
  group.userData.rfTailLengthRatio = template.metrics.tailLengthRatio;
  group.userData.rfTailUpperLobeHeight = template.metrics.tailUpperLobeHeight;
  group.userData.rfTailLowerLobeHeight = template.metrics.tailLowerLobeHeight;
  group.userData.rfTailRootWidth = template.metrics.tailRootWidth;
  group.userData.rfTailOutline = template.metrics.tailOutline;
  group.userData.rfPattern = template.metrics.pattern;
  group.userData.rfFinScale = template.metrics.finScale;
  group.userData.rfTailScale = template.metrics.tailScale;
  group.userData.rfPectoralSpan = template.metrics.pectoralSpan;
  group.userData.rfPectoralSpanRatio = template.metrics.pectoralSpan / Math.max(template.dimensions.bodyLen, 0.001);
  group.userData.rfDorsalFinRatio = template.metrics.dorsalFinRatio;
  group.userData.rfPaletteRaw = template.palette.raw;
  group.userData.rfGillBandCount = template.metrics.gillBandCount || 0;
  group.userData.rfGillBandVertexColors = !!template.metrics.gillBandVertexColors;
  group.userData.rfGillXRange = template.metrics.gillXRange || null;
  group.userData.rfMouthLineVertexColors = !!template.metrics.mouthLineVertexColors;
  group.userData.rfEyeRadius = template.metrics.eyeRadius || 0;
  group.userData.rfEyeX = template.metrics.eyeX || 0;
  group.userData.rfEyeY = template.metrics.eyeY || 0;
  group.userData.rfDorsalFin = template.metrics.dorsalFin || null;
  group.userData.rfPlateMaxZ = template.metrics.plateMaxZ;
  group.userData.rfBodyMaxZ = template.metrics.bodyMaxZ;
  group.userData.rfFeatureSourceCount = template.bodyFeatures.length;
  group.userData.rfFeatureBatchCount = template.featureBatches.length;
  group.userData.rfBatchesTeethPlatesEyes = template.featureBatches.some((batch) => batch.geometry.userData.rfFeatureNames.some((name) => name.includes('tooth'))) &&
    template.featureBatches.some((batch) => batch.geometry.userData.rfFeatureNames.some((name) => name.includes('plate'))) &&
    template.featureBatches.some((batch) => batch.geometry.userData.rfFeatureNames.some((name) => name.includes('eye')));

  const shellScale = OUTLINE_SHELL_SCALE;
  const bendK = 4.6 / Math.max(template.dimensions.bodyLen, 0.001);
  const bendSpanX = template.dimensions.bodyLen * 0.05;
  const bendSpanY = template.dimensions.bodyLen * 0.52;
  const uniforms = {
    uBendPhase: { value: 0 },
    uBendAmp: { value: 0 },
    uBendK: { value: bendK },
    uBendSpan: { value: new THREE.Vector2(bendSpanX, bendSpanY) }
  };
  group.userData.rfBendUniforms = uniforms;
  group.userData.rfBendK = bendK;
  group.userData.rfBendSpan = [bendSpanX, bendSpanY];
  group.userData.rfBendYScale = BEND_Y_SCALE;
  group.userData.rfTailRootX = -template.dimensions.bodyLen * 0.50;
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

  const tail = new THREE.Mesh(template.tailGeometry, template.tailMaterial);
  tail.name = 'RF tail';
  tail.position.x = -template.dimensions.bodyLen * 0.52;
  pose.add(tail);

  const pectL = new THREE.Mesh(template.pectGeometry, template.pectMaterial);
  pectL.name = 'RF pectoral L';
  pectL.position.set(-template.dimensions.bodyLen * 0.05, -template.dimensions.radiusY * 0.05, template.dimensions.radiusZ * 0.26);
  pectL.rotation.x = PECTORAL_SPLAY;
  pose.add(pectL);
  const pectR = new THREE.Mesh(template.pectGeometry, template.pectMaterial);
  pectR.name = 'RF pectoral R';
  pectR.position.set(-template.dimensions.bodyLen * 0.05, -template.dimensions.radiusY * 0.05, -template.dimensions.radiusZ * 0.26);
  pectR.scale.z = -1;
  pectR.rotation.x = -PECTORAL_SPLAY;
  pose.add(pectR);

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
    body.add(jaw);
  }

  const parts = { body, tail, pectL, pectR, jaw };
  const animation = { baseCaptured: false, baseY: 0, lastT: null, phase: 0, pitch: 0, jaw: 0 };
  function animate(t = 0, state = {}) {
    const time = finite(t, 0);
    const speedFrac = clamp(finite(state.speedFrac, 0), 0, 1);
    const turn = clamp(finite(state.turn, 0), -1, 1);
    const dt = animation.lastT === null ? 0 : clamp(time - animation.lastT, 0, 0.25);
    animation.lastT = time;
    const rate = 2.2 + (8.5 - 2.2) * Math.pow(speedFrac, 0.8);
    const amplitude = 0.06 + 0.30 * Math.pow(speedFrac, 1.2);
    animation.phase += rate * TAU * dt;
    if (animation.phase >= TAU || animation.phase <= -TAU) animation.phase %= TAU;
    uniforms.uBendPhase.value = animation.phase;
    uniforms.uBendAmp.value = amplitude;

    const tailRootX = group.userData.rfTailRootX;
    const tailSweep = 0.38 + 0.30 * speedFrac;
    const tailPhase = animation.phase + tailRootX * bendK;
    group.userData.rfTailSweepAmplitude = tailSweep;
    group.userData.rfTailPhase = tailPhase;
    tail.rotation.y = Math.sin(tailPhase) * tailSweep + turn * 0.12;
    tail.rotation.z = Math.sin(tailPhase + Math.PI * 0.5) * (0.045 + speedFrac * 0.04);
    const flutter = Math.sin(animation.phase * 0.5 + Math.PI * 0.25) * (0.045 + speedFrac * 0.09);
    pectL.rotation.x = PECTORAL_SPLAY + flutter;
    pectR.rotation.x = -PECTORAL_SPLAY - flutter;
    pectL.rotation.z = -turn * 0.12;
    pectR.rotation.z = -turn * 0.12;

    const bank = clamp(finite(state.bank, turn * (0.18 + 0.17 * speedFrac)), -0.35, 0.35);
    const roll = Math.sin(animation.phase) * 0.04;
    group.userData.rfBodyRoll = roll;
    pose.rotation.x = clamp(bank + roll, -0.35, 0.35);
    pose.rotation.y = Math.cos(group.rotation.y) < 0 ? -SHARK_POSE_YAW : SHARK_POSE_YAW;
    // The body owns the merged head/features batch, so this counter-yaw keeps
    // the snout alive in profile without disturbing the consumer-owned pose
    // yaw contract or the shared bend program.
    body.rotation.y = Math.sin(animation.phase + Math.PI * 0.5) * 0.05;
    group.userData.rfHeadCounterYaw = body.rotation.y;
    const pitchTarget = clamp(finite(state.vy, 0) * 0.0008, -0.22, 0.22);
    animation.pitch += (pitchTarget - animation.pitch) * clamp(dt * 8, 0, 1);
    pose.rotation.z = animation.pitch;
    pose.scale.x = 1 + 0.07 * speedFrac;
    pose.scale.y = 1 - 0.03 * speedFrac;
    pose.scale.z = 1 - 0.03 * speedFrac;
    if (jaw) {
      const bitePhase = clamp(Math.max(finite(state.bitePhase, 0), finite(state.jawSnapT, 0)), 0, 1);
      const snap = bitePhase * bitePhase * (3 - 2 * bitePhase);
      const gape = 0.3 + clamp(finite(def.tier, 5), 5, 12) * 0.012;
      const anticipation = state.preyNear ? 0.35 * gape : 0;
      const jawTarget = Math.max(snap * gape, anticipation);
      animation.jaw += (jawTarget - animation.jaw) * clamp(dt * 14, 0, 1);
      jaw.rotation.z = -animation.jaw;
    }
    if (!animation.baseCaptured) {
      animation.baseY = group.position.y;
      animation.baseCaptured = true;
    }
    group.position.y = animation.baseY + Math.sin(time * TAU * 1.15) * (0.008 + speedFrac * 0.014) * worldScale;
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
  if (!sharedEyeGeometry) sharedEyeGeometry = new THREE.SphereGeometry(1, 8, 5);
  if (!sharedIrisGeometry) sharedIrisGeometry = new THREE.SphereGeometry(1, 6, 4);
  if (!sharedCatchlightGeometry) sharedCatchlightGeometry = new THREE.SphereGeometry(1, 4, 3);
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
  const tail = rig.parts.tail.geometry;
  return {
    id: String(def.id),
    tier: finite(def.tier, 1),
    act: finite(def.act, 1),
    head: String(def.sil?.head || 'point'),
    pattern: String(def.sil?.pattern || 'plain'),
    fx: String(def.sil?.fx || 'none'),
    dominantColors: dominantVertexColors([body, tail]),
    paletteColors: metrics.rfPaletteRaw,
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
  const color = dominantColorDistance(a, b) * 0.65 + rawPaletteDistance(a, b) * 0.35;
  const proportions =
    Math.abs(a.bodyAspect - b.bodyAspect) / 4.5 * 0.35 +
    Math.abs(a.tailRatio - b.tailRatio) / 0.34 * 0.18 +
    Math.abs(a.finRatio - b.finRatio) / 1.2 * 0.18 +
    Math.abs(a.dorsalRatio - b.dorsalRatio) / 0.45 * 0.12 +
    Math.abs(a.girth - b.girth) / 0.8 * 0.03 +
    Math.abs(a.bodyLength - b.bodyLength) / 3 * 0.14;
  const pattern = a.pattern === b.pattern ? 0 : 1;
  const head = a.head === b.head ? 0 : 1;
  const fx = a.fx === b.fx ? 0 : 1;
  return clamp(color * 0.31 + proportions * 0.50 + pattern * 0.06 + head * 0.06 + fx * 0.07, 0, 1);
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

function materialEmissive(material) {
  return {
    hex: material?.emissive?.getHex?.() ?? 0,
    intensity: finite(material?.emissiveIntensity, 0)
  };
}

function auditMaterialOwnership(def, rig) {
  const structural = [
    ['body', rig.parts.body],
    ['tail', rig.parts.tail],
    ['pectoral L', rig.parts.pectL],
    ['pectoral R', rig.parts.pectR],
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

function auditSharkShapeContracts(def, rig) {
  const { group, parts } = rig;
  const head = def.sil?.head || 'point';
  const fusiform = isFusiformHead(head);
  const bodyLen = group.userData.rfBodyLen;
  const tailRatio = group.userData.rfTailLengthRatio;
  if (fusiform && (tailRatio < TAIL_MIN_RATIO - 1e-9 || tailRatio > TAIL_MAX_RATIO + 1e-9)) {
    throw new Error(`${def.id}: tail length/body length ${tailRatio.toFixed(3)} outside ${TAIL_MIN_RATIO.toFixed(2)}..${TAIL_MAX_RATIO.toFixed(2)}`);
  }
  if (Math.abs(group.userData.rfTailLowerLobeHeight / group.userData.rfTailUpperLobeHeight - 0.62) > 1e-9) {
    throw new Error(`${def.id}: lower tail lobe is not 0.62 of upper`);
  }
  if (Math.abs(group.userData.rfTailRootWidth / bodyLen - 0.045) > 1e-9) {
    throw new Error(`${def.id}: tail peduncle root is not 0.045 body lengths`);
  }
  if (group.userData.rfTailOutline !== 'crescent-concave-peduncle-notch') {
    throw new Error(`${def.id}: tail outline lost crescent/concave peduncle contract`);
  }
  if (fusiform && group.userData.rfBodyAspect < FUSIFORM_BODY_ASPECT_MIN - 1e-9) {
    throw new Error(`${def.id}: body aspect ${group.userData.rfBodyAspect.toFixed(3)} < ${FUSIFORM_BODY_ASPECT_MIN.toFixed(2)}`);
  }
  if (fusiform && group.userData.rfAspect < FUSIFORM_ASPECT_MIN - 1e-9) {
    throw new Error(`${def.id}: fusiform aspect ${group.userData.rfAspect.toFixed(3)} < ${FUSIFORM_ASPECT_MIN.toFixed(2)}`);
  }
  const sectionRatio = finite(parts.body.geometry.userData.rfSectionZRatio, 0);
  const midSectionRoundness = finite(parts.body.geometry.userData.rfMidSectionRoundness, 0);
  if (fusiform && (sectionRatio < FUSIFORM_SECTION_Z_RATIO_MIN - 1e-9 || midSectionRoundness < FUSIFORM_SECTION_Z_RATIO_MIN - 1e-9)) {
    throw new Error(`${def.id}: mid-body section roundness ${sectionRatio.toFixed(3)} / ${midSectionRoundness.toFixed(3)} < ${FUSIFORM_SECTION_Z_RATIO_MIN.toFixed(2)}`);
  }

  const dorsal = group.userData.rfDorsalFin;
  if (fusiform && (!dorsal || !dorsal.swept || Math.abs(dorsal.rootX / bodyLen - 0.05) > 0.06 || dorsal.height / bodyLen < 0.18 || dorsal.height / bodyLen > 0.27)) {
    throw new Error(`${def.id}: dorsal fin is not swept, centered near +0.05L, or height ~0.22L`);
  }
  const pectDepth = parts.pectL.geometry.userData.rfPectoralDepth;
  const pectTipX = parts.pectL.geometry.userData.rfPectoralTipX;
  if (fusiform && (pectTipX > -bodyLen * 0.55 || pectDepth > bodyLen * 0.025)) {
    throw new Error(`${def.id}: pectoral is not long/thin/swept back`);
  }
  if (fusiform && (Math.abs(parts.pectL.rotation.x) < PECTORAL_SPLAY - 0.06 || Math.abs(parts.pectR.rotation.x) < PECTORAL_SPLAY - 0.06)) {
    throw new Error(`${def.id}: pectorals are edge-on; splay is ${parts.pectL.rotation.x.toFixed(3)} / ${parts.pectR.rotation.x.toFixed(3)}`);
  }
  if (fusiform && (group.userData.rfEyeRadius / group.userData.rfBodyLen > group.userData.rfEffectiveGirth * 0.085 + 1e-9 || group.userData.rfEyeY / bodyLen < 0.045)) {
    throw new Error(`${def.id}: eye was not reduced and lifted toward the snout top`);
  }

  if (isBulkyHead(head)) {
    const committedHead = namedFeature(parts.body, `${head} committed front head`);
    const bodyBox = parts.body.geometry.boundingBox;
    const headBox = committedHead?.geometry?.boundingBox;
    if (!committedHead || !headBox) throw new Error(`${def.id}: bulky ${head} head batch is missing`);
    const overlap = Math.min(bodyBox.max.x, headBox.max.x) - Math.max(bodyBox.min.x, headBox.min.x);
    const headCenterZ = (headBox.min.z + headBox.max.z) * 0.5;
    if (Math.abs(group.userData.rfFaceCenterZ) > 1e-9 || Math.abs(headCenterZ) > 1e-6) {
      throw new Error(`${def.id}: bulky ${head} head is offset from the spine axis`);
    }
    if (headBox.max.x <= 0 || overlap < bodyLen * 0.12) {
      throw new Error(`${def.id}: bulky ${head} head does not overlap the +x spine silhouette`);
    }
    if (head === 'whale') {
      if (namedFeature(parts.body, 'whale bulk')) throw new Error(`${def.id}: whale bulk was reintroduced as a detached feature`);
      if (!(group.userData.rfBulkFrontProfile > group.userData.rfBulkRearProfile * 1.35)) {
        throw new Error(`${def.id}: whale body is not front-heavy over its peduncle`);
      }
      if (!(group.userData.rfBulkNoseProfile < group.userData.rfBulkFrontProfile * 0.82)) {
        throw new Error(`${def.id}: whale body does not taper toward the +x head join`);
      }
    }
  }

  const gill = namedFeature(parts.body, 'gill slit');
  const gillNames = gill?.userData?.rfFeatureNames?.filter((name) => name.includes('gill slit')) || [];
  const gillColors = maxVertexColorChannel(gill?.geometry);
  const gillRange = group.userData.rfGillXRange || [];
  if (fusiform && (group.userData.rfGillBandCount !== 5 || new Set(gillNames.map((name) => name.match(/gill slit \d+/)?.[0])).size < 5 || !gillColors || gillColors.max > 0.18 || Math.abs(gillRange[0] / bodyLen - 0.28) > 1e-9 || Math.abs(gillRange[1] / bodyLen - 0.38) > 1e-9)) {
    throw new Error(`${def.id}: five dark vertex-color gill bands are missing or misplaced`);
  }
  const mouth = namedFeature(parts.body, 'underslung mouth line');
  const mouthColors = maxVertexColorChannel(mouth?.geometry);
  if (fusiform && (!group.userData.rfMouthLineVertexColors || !mouthColors || mouthColors.max > 0.18)) {
    throw new Error(`${def.id}: underslung mouth line is not a dark vertex-color feature`);
  }

  // The tail tip's lateral travel is evaluated in body-local units. At a
  // quarter-cycle, rotation around the peduncle must remain visibly larger
  // than a tenth of the body, independent of world normalization.
  const fullTailSweep = 0.38 + 0.30;
  const tailTipTravel = group.userData.rfTailLength * Math.sin(fullTailSweep);
  group.userData.rfTailTipTravelAtFullAmp = tailTipTravel;
  if (tailTipTravel < bodyLen * 0.10) throw new Error(`${def.id}: tail-tip travel ${tailTipTravel.toFixed(3)} < 0.10 body lengths`);
  rig.animate(0, { speedFrac: 1, turn: 0 });
  if (Math.abs(group.userData.rfTailSweepAmplitude - fullTailSweep) > 1e-9 || !group.userData.rfTailSlavedToBend) {
    throw new Error(`${def.id}: tail sweep amplitude/slaving contract is not active`);
  }
  const expectedTailRotation = Math.sin(group.userData.rfTailPhase) * group.userData.rfTailSweepAmplitude;
  if (Math.abs(parts.tail.rotation.y - expectedTailRotation) > 1e-9) throw new Error(`${def.id}: tail rotation is not slaved to bend phase`);

  const bodyBox = parts.body.geometry.boundingBox;
  let maxBendY = 0;
  for (let phaseIndex = 0; phaseIndex <= 96; phaseIndex++) {
    const phase = TAU * phaseIndex / 96;
    for (let xIndex = 0; xIndex <= 24; xIndex++) {
      const x = bodyBox.min.x + (bodyBox.max.x - bodyBox.min.x) * xIndex / 24;
      maxBendY = Math.max(maxBendY, Math.abs(BEND_Y_SCALE * bendOffset(x, phase, 0.36, group.userData.rfBendK, group.userData.rfBendSpan[0], group.userData.rfBendSpan[1])));
    }
  }
  group.userData.rfMaxBendYAtFullAmp = maxBendY;
  if (maxBendY < bodyLen * 0.02) throw new Error(`${def.id}: bend y-displacement ${maxBendY.toFixed(3)} < 0.02 body lengths`);
}

function __selftest() {
  ensureSharedGeometry();
  const rows = host.RFD?.SHARKS || RF.RFD?.SHARKS || RF.SHARKS;
  if (!rows || rows.length !== 61) throw new Error(`RF.Art3D expected 61 sharks, received ${rows ? rows.length : 0}`);
  const samples = representativeRows();
  const result = { pass: false, headProfiles: {}, triangles: {}, materialAudit: {}, bodyCalibration: {}, colorBlocks: {}, patterns: {}, distinctness: null, bendProgramVariants: [], notes: [], errors: [] };
  try {
    const ratios = [];
    const bendProgramKeys = new Set();
    const ramp = ensureGradientMap();
    const rampTexels = distinctGradientTexels(ramp);
    if (rampTexels < 3) throw new Error(`gradientMap has only ${rampTexels} distinct texels`);
    // Three r160 exposes needsUpdate as a write-only setter; version is the
    // renderer-visible proof that the setter was triggered in headless mode.
    if (!(ramp.version > 0)) throw new Error('gradientMap was not marked needsUpdate');
    const usedPatterns = Array.from(new Set(rows.map((def) => String(def.sil?.pattern || 'plain')))).sort();
    const unsupportedPatterns = usedPatterns.filter((pattern) => !SUPPORTED_PATTERN_IDS.has(pattern));
    if (unsupportedPatterns.length) throw new Error(`unsupported sil.pattern IDs: ${unsupportedPatterns.join(', ')}`);
    result.patterns = { used: usedPatterns, supported: Array.from(SUPPORTED_PATTERN_IDS).sort(), missing: [] };
    for (const def of samples) {
      const rig = buildShark(def);
      const { group, parts } = rig;
      if (!(group instanceof THREE.Group) || !parts.body?.isMesh || !parts.tail?.isMesh || !parts.pectL?.isMesh || !parts.pectR?.isMesh || (def.tier >= 5 && !parts.jaw?.isMesh) || typeof rig.animate !== 'function') throw new Error(`${def.id}: incomplete rig contract`);
      const pose = group.userData.rfPose;
      const uniforms = group.userData.rfBendUniforms;
      if (!(pose instanceof THREE.Group) || pose.parent !== group || group.children[0] !== pose) throw new Error(`${def.id}: pose group is not between group and parts`);
      if (Math.abs(Math.abs(pose.rotation.y) - SHARK_POSE_YAW) > 1e-9) throw new Error(`${def.id}: pose yaw ${pose.rotation.y.toFixed(3)} is not ±${SHARK_POSE_YAW.toFixed(2)}`);
      if (!uniforms || !uniforms.uBendPhase || !uniforms.uBendAmp || !uniforms.uBendK || !uniforms.uBendSpan) throw new Error(`${def.id}: incomplete bend uniform bundle`);
      const materials = bendMaterials(group);
      if (materials.length < 3) throw new Error(`${def.id}: body/shell/features did not receive bend materials`);
      for (const material of materials) {
        if (typeof material.onBeforeCompile !== 'function') throw new Error(`${def.id}: bend hook missing`);
        if (typeof material.customProgramCacheKey !== 'function' || !material.customProgramCacheKey().endsWith(':rf-bend') || material.customProgramCacheKey() !== material.customProgramCacheKey()) throw new Error(`${def.id}: unstable bend cache key`);
        if (material.userData.rfBendUniforms !== uniforms) throw new Error(`${def.id}: bend uniforms are not shared by identity`);
        bendProgramKeys.add(material.customProgramCacheKey());
      }
      const shell = parts.body.children.find((object) => object.name === 'RF dark silhouette edge shell');
      if (!shell || shell.scale.x > 1.025 + 1e-9 || Math.abs(shell.scale.x - OUTLINE_SHELL_SCALE) > 1e-9 || shell.material.color.getHex() !== OUTLINE_SHELL_COLOR || Math.abs(shell.material.userData.rfBendAmpScale - 1 / OUTLINE_SHELL_SCALE) > 1e-9) {
        throw new Error(`${def.id}: outline shell is not ${OUTLINE_SHELL_SCALE.toFixed(3)}x with lifted ink color`);
      }
      const shaderProbe = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>' };
      parts.body.material.onBeforeCompile(shaderProbe);
      if (shaderProbe.uniforms.uBendPhase !== uniforms.uBendPhase || shaderProbe.uniforms.uBendAmp !== uniforms.uBendAmp || shaderProbe.uniforms.uBendK !== uniforms.uBendK || shaderProbe.uniforms.uBendSpan !== uniforms.uBendSpan || !shaderProbe.vertexShader.includes('bendT=smoothstep') || !shaderProbe.vertexShader.includes('uBendPhase+transformed.x*uBendK')) {
        throw new Error(`${def.id}: bend shader injection contract is incomplete`);
      }
      auditSharkShapeContracts(def, rig);
      const noseBend = bendOffset(parts.body.geometry.boundingBox.max.x, 0.37, 0.3, uniforms.uBendK.value, uniforms.uBendSpan.value.x, uniforms.uBendSpan.value.y);
      const tailBend = bendOffset(group.userData.rfTailRootX, 0.37, 0.3, uniforms.uBendK.value, uniforms.uBendSpan.value.x, uniforms.uBendSpan.value.y);
      if (Math.abs(noseBend) > 1e-9 || Math.abs(tailBend) < 0.01) throw new Error(`${def.id}: CPU bend reference does not separate nose and tail`);
      group.updateMatrixWorld(true);
      result.materialAudit[def.id] = auditMaterialOwnership(def, rig);
      const colorStats = bodyColorStats(parts.body.geometry);
      if (colorStats.meanLuminance <= 0) throw new Error(`${def.id}: body mean luminance is not positive`);
      if (def.id === 'reef' && colorStats.meanLuminance <= 0.25) throw new Error(`${def.id}: body mean luminance ${colorStats.meanLuminance.toFixed(3)} <= 0.25`);
      if (!noseIsForward(parts.body.geometry)) throw new Error(`${def.id}: nose is not the +x-forward vertex`);
      result.bodyLuminance = result.bodyLuminance || {};
      result.bodyLuminance[def.id] = Number(colorStats.meanLuminance.toFixed(3));
      const eyeNames = [];
      group.traverse((object) => eyeNames.push(object.name, ...(object.userData?.rfFeatureNames || [])));
      if (!eyeNames.some((name) => name.includes('eye') && name.includes('base'))) throw new Error(`${def.id}: eye base is missing`);
      if (def.act >= 3 && !eyeNames.some((name) => name.includes('glow ring'))) throw new Error(`${def.id}: Act 3 eye glow ring is missing`);
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3());
      const ratio = size.x / Math.max(size.y, size.z, 0.0001);
      ratios.push(ratio.toFixed(2));
      const metrics = group.userData;
      result.headProfiles[def.id] = {
        head: def.sil.head,
        ratio: Number(ratio.toFixed(3)),
        bodyAspect: Number(metrics.rfBodyAspect.toFixed(3)),
        sectionZRatio: Number(finite(parts.body.geometry.userData.rfSectionZRatio, 0).toFixed(3)),
        midSectionRoundness: Number(finite(parts.body.geometry.userData.rfMidSectionRoundness, 0).toFixed(3)),
        faceShare: Number(metrics.rfFaceShare.toFixed(3)),
        jawVolumeRatio: Number(metrics.rfJawVolumeRatio.toFixed(3)),
        tailShare: Number(metrics.rfTailShare.toFixed(3)),
        plateExposure: def.sil.head === 'kaiju' ? metrics.rfPlateMaxZ > metrics.rfBodyMaxZ : true,
        size: [Number(size.x.toFixed(3)), Number(size.y.toFixed(3)), Number(size.z.toFixed(3))]
      };
      if (def.tier >= 5 && metrics.rfFaceShare < 0.28) throw new Error(`${def.id}: face share ${metrics.rfFaceShare.toFixed(3)} < 0.28`);
      if (def.tier >= 5 && metrics.rfJawVolumeRatio < (def.sil.head === 'kaiju' ? 0.09 : 0.045)) throw new Error(`${def.id}: jaw volume ratio ${metrics.rfJawVolumeRatio.toFixed(3)} is too thin`);
      if (def.sil.head === 'kaiju' && !(metrics.rfPlateMaxZ > metrics.rfBodyMaxZ)) throw new Error(`${def.id}: dorsal plate row is buried at z=${metrics.rfPlateMaxZ.toFixed(3)} body=${metrics.rfBodyMaxZ.toFixed(3)}`);
      if (def.sil.head === 'kaiju' && !(group.userData.rfFeatureBatchCount < group.userData.rfFeatureSourceCount) ) throw new Error(`${def.id}: feature batching did not reduce feature meshes`);
      if (def.sil.head === 'kaiju' && !group.userData.rfBatchesTeethPlatesEyes) throw new Error(`${def.id}: teeth/plates/eyes are not batched`);
      const tris = countTriangles(group);
      result.triangles[def.id] = tris;
      if (tris > 3500) throw new Error(`${def.id}: ${tris} triangles`);
      const teeth = [];
      let mouthCavity = false;
      group.traverse((object) => {
        if (object.name.includes('tooth') || object.userData?.rfFeatureNames?.some((name) => name.includes('tooth'))) teeth.push(object);
        if (object.userData?.rfFeatureNames?.some((name) => name.includes('mouth cavity'))) mouthCavity = true;
      });
      if (def.tier >= 2 && teeth.length === 0) throw new Error(`${def.id}: no visible teeth`);
      if (def.tier >= 2 && !mouthCavity) throw new Error(`${def.id}: no connected mouth cavity`);
      const samplesTail = [];
      for (let i = 0; i < 120; i++) {
        rig.animate(i / 60, { speedFrac: (i % 60) / 59, turn: Math.sin(i * 0.13), bitePhase: i % 31 === 0 ? 1 : 0, jawSnapT: i % 47 === 0 ? 1 : 0 });
        samplesTail.push(parts.tail.rotation.y);
      }
      const tailRange = Math.max(...samplesTail) - Math.min(...samplesTail);
      if (tailRange < 0.01) throw new Error(`${def.id}: tail did not oscillate`);
      rig.animate(2, { speedFrac: 1, turn: 1, bank: 0.35, vy: 180, preyNear: true });
      if (Math.abs(pose.rotation.y) < SHARK_POSE_YAW - 1e-9 || Math.abs(pose.rotation.y) > SHARK_POSE_YAW + 1e-9 || Math.abs(pose.rotation.x) > 0.35 + 1e-9 || Math.abs(pose.rotation.z) > 0.22 + 1e-9 || pose.scale.x <= 1 || pose.scale.y >= 1) {
        throw new Error(`${def.id}: pose yaw/bank/pitch/stretch is outside contract`);
      }
      if (parts.jaw && Math.abs(parts.jaw.rotation.z) < 1e-6) throw new Error(`${def.id}: preyNear jaw anticipation did not open the jaw`);
      group.rotation.y = Math.PI;
      rig.animate(2 + 1 / 60, { speedFrac: 0, turn: 0, bank: 0 });
      if (Math.abs(pose.rotation.y + SHARK_POSE_YAW) > 1e-9) throw new Error(`${def.id}: left-facing pose yaw did not mirror`);
      group.rotation.y = 0;
      const rampRig = buildShark(def);
      const rampUniforms = rampRig.group.userData.rfBendUniforms;
      let expectedPhase = 0;
      for (let i = 0; i < 96; i++) {
        const speed = i / 95;
        rampRig.animate(i / 60, { speedFrac: speed });
        if (i > 0) expectedPhase += (2.2 + (8.5 - 2.2) * Math.pow(speed, 0.8)) * TAU / 60;
        const expectedWrapped = expectedPhase % TAU;
        const phaseError = Math.abs(rampUniforms.uBendPhase.value - expectedWrapped);
        const amplitude = 0.06 + 0.30 * Math.pow(speed, 1.2);
        if (phaseError > amplitude * 0.2 + 1e-9) throw new Error(`${def.id}: phase discontinuity ${phaseError} exceeds amp*0.2`);
      }
    }
    const calibrationRows = [];
    for (const act of [1, 2, 3]) {
      const row = rows.find((candidate) => candidate.act === act);
      if (row) calibrationRows.push(row);
    }
    const leviathan = rows.find((candidate) => candidate.id === 'leviathanrex');
    if (leviathan && !calibrationRows.includes(leviathan)) calibrationRows.push(leviathan);
    for (const def of calibrationRows) {
      const bands = bodyBandStats(buildShark(def).parts.body.geometry);
      const colorBlocks = bodyColorBlockStats(buildShark(def).parts.body.geometry);
      result.bodyCalibration[def.id] = {
        ridge: Number(bands.ridge.mean.toFixed(3)),
        flank: Number(bands.flank.mean.toFixed(3)),
        belly: Number(bands.belly.mean.toFixed(3)),
        flankSaturation: Number(colorBlocks.flank.saturation.toFixed(3)),
        flankValue: Number(colorBlocks.flank.value.toFixed(3))
      };
      if (bands.ridge.mean > 0.30) throw new Error(`${def.id}: dorsal ridge luminance ${bands.ridge.mean.toFixed(3)} > 0.30`);
      if (colorBlocks.flank.saturation < BODY_FLANK_SATURATION_FLOOR) throw new Error(`${def.id}: flank saturation ${colorBlocks.flank.saturation.toFixed(3)} < ${BODY_FLANK_SATURATION_FLOOR.toFixed(2)}`);
      if (colorBlocks.flank.value < BODY_FLANK_VALUE_MIN || colorBlocks.flank.value > BODY_FLANK_VALUE_MAX) throw new Error(`${def.id}: flank value ${colorBlocks.flank.value.toFixed(3)} outside ${BODY_FLANK_VALUE_MIN.toFixed(2)}..${BODY_FLANK_VALUE_MAX.toFixed(2)}`);
      if (bands.belly.mean < 0.70) throw new Error(`${def.id}: belly luminance ${bands.belly.mean.toFixed(3)} < 0.70`);
    }
    if (new Set(ratios).size < 4) throw new Error(`head proportions collapsed: ${ratios.join(', ')}`);
    result.gradientMap = { distinctTexels: rampTexels, updateVersion: ramp.version, bands: BODY_RAMP_BANDS };
    let sweep = 0;
    let worstCaseTriangles = 0;
    let worstCaseId = null;
    const signatures = [];
    for (const def of rows) {
      const rig = buildShark(def);
      signatures.push(distinctnessSignature(def, rig));
      auditSharkShapeContracts(def, rig);
      for (const material of bendMaterials(rig.group)) bendProgramKeys.add(material.customProgramCacheKey());
      const materials = auditMaterialOwnership(def, rig);
      result.materialAudit[def.id] = materials;
      const colorStats = bodyColorStats(rig.parts.body.geometry);
      if (colorStats.meanLuminance <= 0 || !noseIsForward(rig.parts.body.geometry)) throw new Error(`${def.id}: invalid body colors or +x nose invariant in sweep`);
      const colorBlocks = bodyColorBlockStats(rig.parts.body.geometry);
      result.colorBlocks[def.id] = {
        act: def.act,
        dorsalSaturation: Number(colorBlocks.dorsal.saturation.toFixed(3)),
        flankSaturation: Number(colorBlocks.flank.saturation.toFixed(3)),
        flankValue: Number(colorBlocks.flank.value.toFixed(3)),
        bellyValue: Number(colorBlocks.belly.value.toFixed(3)),
        rimHue: Number(rgbToHsv(colorBlocks.rim).h.toFixed(3)),
        dorsalFlankDistance: Number(colorBlocks.dorsalFlankDistance.toFixed(1)),
        flankBellyDistance: Number(colorBlocks.flankBellyDistance.toFixed(1))
      };
      if (colorBlocks.flank.saturation < BODY_FLANK_SATURATION_FLOOR) {
        throw new Error(`${def.id}: flank saturation ${colorBlocks.flank.saturation.toFixed(3)} < ${BODY_FLANK_SATURATION_FLOOR.toFixed(2)}`);
      }
      if (colorBlocks.flank.value < BODY_FLANK_VALUE_MIN || colorBlocks.flank.value > BODY_FLANK_VALUE_MAX) {
        throw new Error(`${def.id}: flank value ${colorBlocks.flank.value.toFixed(3)} outside ${BODY_FLANK_VALUE_MIN.toFixed(2)}..${BODY_FLANK_VALUE_MAX.toFixed(2)}`);
      }
      if (def.act >= 3) {
        const palette = paletteOf(def);
        const glowHsv = rgbToHsv(palette.glow || palette.accent);
        const rimHsv = rgbToHsv(colorBlocks.rim);
        const hueGap = Math.abs(glowHsv.h - rimHsv.h);
        if (Math.min(hueGap, 1 - hueGap) > 0.12) throw new Error(`${def.id}: Act 3 flank rim hue ${rimHsv.h.toFixed(3)} does not carry glow hue ${glowHsv.h.toFixed(3)}`);
      }
      if (colorBlocks.dorsalFlankDistance < BODY_BLOCK_DISTANCE_MIN || colorBlocks.flankBellyDistance < BODY_BLOCK_DISTANCE_MIN) {
        throw new Error(`${def.id}: adjacent body blocks are too close (dorsal/flank ${colorBlocks.dorsalFlankDistance.toFixed(1)}, flank/belly ${colorBlocks.flankBellyDistance.toFixed(1)}, minimum ${BODY_BLOCK_DISTANCE_MIN})`);
      }
      const tris = countTriangles(rig.group);
      if (tris > 3500) throw new Error(`${def.id}: ${tris} triangles in sweep`);
      if (tris > worstCaseTriangles) {
        worstCaseTriangles = tris;
        worstCaseId = def.id;
      }
      sweep++;
    }
    assertRosterDistinctness(signatures, result);
    result.sweep = sweep;
    result.bodyMaterialAudit = {
      checked: sweep,
      bodyEmissiveBlack: sweep,
      fxFeatureMeshes: rows.filter((def) => def.sil?.fx && def.sil.fx !== 'none').length
    };
    result.worstCaseTriangles = worstCaseTriangles;
    result.worstCaseId = worstCaseId;
    result.bendProgramVariants = Array.from(bendProgramKeys).sort();
    if (result.bendProgramVariants.length > 8) throw new Error(`bend program variants ${result.bendProgramVariants.length} > 8`);
    result.cacheBytes = cacheBytes();
    result.gpuEstimateMB = Number((result.cacheBytes / (1024 * 1024)).toFixed(3));
    if (result.cacheBytes > 120 * 1024 * 1024) throw new Error(`geometry cache exceeds 120MB: ${result.gpuEstimateMB}MB`);
    result.notes.push('headless BufferGeometry path; no renderer or GL context required');
    result.notes.push(`shared ${rampTexels}-texel NEAREST linear luminance gradientMap; needsUpdate=true`);
    result.notes.push(`body vertex colors finite; dorsal luminance <= 0.30, flank HSV floor/value gate, belly bake floor ${BODY_BELLY_BAKE_LUMINANCE.toFixed(2)} with luminance >= 0.70 on ${calibrationRows.length} calibration rows`);
    result.notes.push(`hard body blocks: dorsal topness >= ${BODY_DORSAL_START.toFixed(2)}, vivid flank >= ${BODY_FLANK_START.toFixed(2)}, pale belly < ${BODY_FLANK_START.toFixed(2)}; no cross-block lerp`);
    result.notes.push(`flank HSV saturation >= ${BODY_FLANK_SATURATION_FLOOR.toFixed(2)}, value ${BODY_FLANK_VALUE_MIN.toFixed(2)}..${BODY_FLANK_VALUE_MAX.toFixed(2)}; adjacent RGB distance >= ${BODY_BLOCK_DISTANCE_MIN}`);
    result.notes.push(`Act 3 glow hue is carried by the ${BODY_FLANK_START.toFixed(2)}..${BODY_RIM_END.toFixed(2)} flank-edge row above the belly line; rim hue is self-tested against palette.glow`);
    result.notes.push(`structural body/tail/pectoral/jaw emissive is black across ${sweep}/${sweep}; feature glow is 0.6..1.0`);
    result.notes.push('every non-none Act 2/3 sil.fx key has a named emissive feature mesh; pattern veins/plates and FX families are feature-owned');
    result.notes.push('14 archetype face identities checked; tier 5+ face share, jaw volume, and tier-scaled tail gates checked');
    result.notes.push('kaiju plate row is camera-offset above body max z; mouth cavities and tooth rows are merged per shark');
    result.notes.push('bulky heads blunt/angler/whale/kaiju are axis-aligned and overlap the +x loft; whale bulk is loft-owned with a tapered peduncle and mouth-span baleen');
    result.notes.push(`fusiform tail length ${TAIL_MIN_RATIO.toFixed(2)}..${TAIL_MAX_RATIO.toFixed(2)} body lengths; upper/lower ratio 1:0.62; crescent notch and 0.045L peduncle gate checked across ${sweep}/${sweep}`);
    result.notes.push(`fusiform body core aspect >= ${FUSIFORM_BODY_ASPECT_MIN.toFixed(1)} and visual aspect >= ${FUSIFORM_ASPECT_MIN.toFixed(1)}; eel/whale/kaiju are documented bulk exceptions`);
    result.notes.push('swept dorsal fin, long thin swept-back pectorals, five dark vertex-color gill bands at +0.28..+0.38L, half-size top-snouted eyes, and vertex-color mouth line are shape-gated');
    result.notes.push(`bend hook injects phase/amp/k/span with stable :rf-bend cache keys; ${result.bendProgramVariants.length} program variants <= 8`);
    result.notes.push(`one per-rig bend uniform bundle is identity-shared by body, ${OUTLINE_SHELL_SCALE.toFixed(3)}x shell compensation, and every feature batch; CPU bendOffset nose/tail reference checked`);
    result.notes.push(`pose child owns yaw ±${SHARK_POSE_YAW.toFixed(2)}, pectoral splay ${PECTORAL_SPLAY.toFixed(2)} rad, bank clamp ±0.35, vy pitch blend, and speed stretch; outer group scale remains the world/eat-pop authority`);
    result.notes.push(`phase accumulator integrates continuous rate 2.2..8.5 Hz; tail yaw sweep is 0.38..0.68 rad, tip travel >= 0.10L, bend y term is ${BEND_Y_SCALE.toFixed(2)}*z and max y travel >= 0.02L; body roll/head counter-yaw are ±0.04/±0.05`);
    result.notes.push(`all ${result.patterns.used.length} live sil.pattern IDs are explicit vertex-colour painters; tiger stripes use seven ${'hard-edged'} axial bands`);
    result.notes.push(`roster distinctness signature: ${result.distinctness.checked} defs, ${result.distinctness.adjacentComparisons} adjacent-tier pairs, threshold ${result.distinctness.threshold.toFixed(2)}, minimum ${result.distinctness.minimumDistance.toFixed(3)} (${result.distinctness.closestPair.join('/')})`);
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
