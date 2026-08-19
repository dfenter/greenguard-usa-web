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
const BODY_RAMP_BANDS = [0.40, 0.65, 0.84, 1.0];
const BODY_DORSAL_START = 0.75;
const BODY_FLANK_START = 0.45;
const BODY_BELLY_END = 0.25;
const KAIJU_PLATE_GLOW = 0xa3fff3;

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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

function capColorLuminance(color, maximum) {
  const source = colorValue(color).clone();
  const current = colorLuminance(source);
  return current > maximum && current > 1e-6 ? source.multiplyScalar(maximum / current) : source;
}

function paletteOf(def) {
  const source = def?.sil?.palette || {};
  return {
    base: boostedColor(source.base, 1.24),
    belly: boostedColor(source.belly, 1.12),
    accent: boostedColor(source.accent, 1.34),
    glow: source.glow ? boostedColor(source.glow, 1.18) : null
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
  materialCache.set(key, material);
  return material;
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

function bodyRampColors(palette) {
  const baseLuminance = colorLuminance(palette.base);
  const flankTarget = clamp(Math.max(baseLuminance * 1.38, 0.36), 0.36, 0.52);
  const flankSeed = lerpColor(palette.base, palette.accent, 0.58);
  return {
    // Keep the authored base hue on the ridge, but prevent the few lightest
    // source palettes from defeating the dark-back/readable-flank contract.
    dark: capColorLuminance(palette.base, 0.22),
    flank: liftColorToLuminance(flankSeed, flankTarget),
    accent: liftColorToLuminance(palette.accent, clamp(flankTarget * 1.08, 0.38, 0.58)),
    belly: liftColorToLuminance(palette.belly, 0.78)
  };
}

function bodyVertexColor(ramp, theta, u, station, radial, pattern) {
  const topness = (Math.cos(theta) + 1) * 0.5;
  const dark = ramp.dark;
  const flank = ramp.flank;
  const belly = ramp.belly;
  let color;
  if (topness >= BODY_DORSAL_START) {
    // The boundary is already in the dark-back block. This keeps the full
    // upper quarter visibly dorsal instead of leaving a bright shoulder ring.
    const dorsalMix = 0.62 + 0.38 * ((topness - BODY_DORSAL_START) / (1 - BODY_DORSAL_START));
    color = lerpColor(flank, dark, dorsalMix);
  } else if (topness <= BODY_BELLY_END) {
    color = belly.clone();
  } else if (topness < BODY_FLANK_START) {
    color = lerpColor(belly, flank, (topness - BODY_BELLY_END) / (BODY_FLANK_START - BODY_BELLY_END));
  } else {
    color = flank.clone();
  }

  const stripe = pattern === 'stripes' || pattern === 'bands' || pattern === 'ribbons';
  const spotted = pattern === 'spots' || pattern === 'dots' || pattern === 'mottled' || pattern === 'boils' || pattern === 'stars' || pattern === 'mirror';
  const marked = pattern === 'cracks' || pattern === 'runes' || pattern === 'faults' || pattern === 'rot' || pattern === 'facets' || pattern === 'scales';
  const structured = pattern === 'plates' || pattern === 'plating' || pattern === 'panels' || pattern === 'rivets' || pattern === 'bones' || pattern === 'coral' || pattern === 'swirls' || pattern === 'rings' || pattern === 'collar';
  // Pattern marks stay on the flank transition. Keeping them off the dorsal
  // and belly plateaus preserves the large value blocks at gameplay scale.
  const patternBand = topness > BODY_BELLY_END && topness < BODY_DORSAL_START;
  if (patternBand && stripe && ((Math.floor(u * 11) + Math.floor(radial / 3)) % 3 === 0)) color.lerp(ramp.accent, 0.42);
  if (patternBand && spotted && hash01(station, radial, pattern.length) > 0.73) color.lerp(ramp.accent, 0.5);
  if (patternBand && marked && hash01(station * 2, radial * 3, pattern.length) > 0.8) color.lerp(ramp.accent, 0.32);
  if (patternBand && structured && ((station + radial * 2 + pattern.length) % 5 === 0)) color.lerp(ramp.accent, pattern === 'collar' ? 0.56 : 0.26);
  if (patternBand && pattern === 'collar' && u > 0.22 && u < 0.38) color.lerp(ramp.accent, 0.58);
  return color;
}

function profileAt(u, head, girth) {
  const barrel = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, u))), 0.47);
  let profile = 0.08 + barrel * (0.88 + u * 0.16);
  if (head === 'point') profile *= 1 - 0.75 * Math.pow(u, 3.1);
  if (head === 'blunt') profile *= 0.9 + u * 0.14;
  if (head === 'hammer') profile *= 0.94 + u * 0.12;
  if (head === 'saw') profile *= u > 0.72 ? 1 - (u - 0.72) * 1.25 : 1;
  if (head === 'whale' || head === 'kaiju') profile *= 1.03 + u * 0.24;
  if (head === 'croc') profile *= u > 0.58 ? 1 - ((u - 0.58) / 0.42) * 0.5 : 1;
  if (head === 'angler') profile *= u > 0.72 ? 0.84 : 1.02;
  if (head === 'eel') profile *= 0.64;
  if (head === 'rock') profile *= 0.98 + 0.08 * Math.sin(u * 17);
  if (head === 'skull') profile *= 0.96 + u * 0.1;
  if (head === 'void') profile *= 0.92 + 0.08 * Math.sin(u * Math.PI * 0.8);
  return profile * (1 + Math.min(0.22, girth * 0.12));
}

function makeSpineGeometry(def, palette, dimensions) {
  const sil = def.sil || {};
  const head = sil.head || 'point';
  const len = clamp(finite(sil.len, 1), 0.5, 3);
  const girth = clamp(finite(sil.girth, 0.36), 0.18, 0.8);
  const bodyLen = dimensions.bodyLen;
  const radiusY = dimensions.radiusY;
  const radiusZ = dimensions.radiusZ;
  const stations = head === 'eel' || head === 'kaiju' ? 20 : def.tier >= 5 ? 18 : 16;
  const radial = 12;
  const ramp = bodyRampColors(palette);
  const positions = [];
  const colors = [];
  const indices = [];

  for (let i = 0; i <= stations; i++) {
    const u = i / stations;
    const x = -bodyLen * 0.52 + bodyLen * u;
    const profile = profileAt(u, head, girth);
    const stationY = radiusY * profile;
    const stationZ = radiusZ * profile * (head === 'eel' ? 0.92 : 1);
    for (let j = 0; j < radial; j++) {
      const theta = (j / radial) * TAU;
      const jitter = head === 'rock' ? 1 + (hash01(i, j, 5) - 0.5) * 0.12 : 1;
      const c = bodyVertexColor(ramp, theta, u, i, j, sil.pattern || 'plain');
      addVertex(positions, colors, x, Math.cos(theta) * stationY * jitter, Math.sin(theta) * stationZ * jitter, c);
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
  addVertex(positions, colors, -bodyLen * 0.52, 0, 0, palette.base);
  const nose = positions.length / 3;
  addVertex(positions, colors, bodyLen * 0.48, 0, 0, palette.belly);
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
      face.end = L * 0.57; face.mouthStart = L * 0.0; face.mouthWidth = L * 0.58; face.mouthHeight = r * 0.72;
      face.jawWidth = L * 0.66; face.jawHeight = r * 0.5; face.jawDepth = r * 1.42;
      face.contour = [[start, -r * 0.76, 0], [face.end, -r * 0.62, 0], [face.end, r * 0.64, 0], [L * 0.24, r * 1.06, 0], [start, r * 0.94, 0]];
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
      bucket = { material: feature.material, positions: [], indices: [], names: [], count: 0 };
      buckets.set(key, bucket);
    }
    const position = feature.geometry.getAttribute('position');
    if (!position) continue;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...feature.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...feature.rotation)),
      new THREE.Vector3(...feature.scale)
    );
    const offset = bucket.positions.length / 3;
    for (let i = 0; i < position.count; i++) {
      const vertex = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(matrix);
      bucket.positions.push(vertex.x, vertex.y, vertex.z);
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
    const geometry = bufferGeometry(bucket.positions, bucket.indices);
    geometry.userData.rfMerged = true;
    geometry.userData.rfFeatureCount = bucket.count;
    geometry.userData.rfFeatureNames = bucket.names;
    return { geometry, material: bucket.material, name: `batched ${bucket.names.slice(0, 4).join(' / ')}` };
  });
}

function makeTailGeometry(bodyLen, tailScale, tier, palette, pattern) {
  const tierMass = 1 + Math.max(0, tier - 4) * 0.045;
  const length = bodyLen * (0.55 + tailScale * 0.2) * tierMass;
  const upper = bodyLen * (0.3 + tailScale * 0.12) * tierMass;
  const lower = bodyLen * (0.2 + tailScale * 0.08) * tierMass;
  const root = bodyLen * (0.08 + Math.max(0, tier - 8) * 0.006);
  const depth = bodyLen * (0.08 + Math.max(0, tier - 8) * 0.006);
  const points = [
    [root * 0.8, root, 0],
    [-length * 0.18, upper * 0.42, 0],
    [-length, upper, 0],
    [-length * 0.72, 0, 0],
    [-length * 0.92, -lower, 0],
    [-length * 0.18, -lower * 0.4, 0],
    [root * 0.8, -root, 0]
  ];
  const positions = [];
  const colors = [];
  const ramp = bodyRampColors(palette);
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const c = side ? ramp.belly : ramp.flank;
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
  return geometry;
}

function makePectoralGeometry(bodyLen, radiusY, span) {
  const root = [-bodyLen * 0.06, -radiusY * 0.08, 0];
  const shoulder = [-bodyLen * 0.23, -radiusY * 0.26, span * 0.62];
  const tip = [-bodyLen * 0.48, -radiusY * 0.62, span];
  return makeExtrudedTriangle([root, shoulder, tip], Math.max(0.018, radiusY * 0.06));
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
  template.bodyFeatures.push(descriptor(faceGeometry, faceMaterial, [0, 0, dimensions.radiusZ * 0.18], [0, 0, 0], [1, 1, 1], `${head} committed front head`));
  template.face = { spec, geometry: faceGeometry };
}

function addEyeFeatures(template, def, palette, dimensions) {
  const head = def.sil?.head || 'point';
  const act = finite(def.act, def.tier >= 5 ? 2 : 1);
  const eyeRadius = dimensions.radiusY * (head === 'skull' ? 0.19 : 0.16);
  const eyeX = dimensions.bodyLen * (head === 'hammer' ? 0.36 : head === 'whale' ? 0.28 : 0.33);
  const eyeY = dimensions.radiusY * (head === 'eel' ? 0.22 : 0.34);
  const eyeZ = dimensions.radiusZ * 0.91;
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
  if (tier < 2) return;
  const head = def.sil?.head || 'point';
  const spec = template.face.spec;
  const mouthWidth = spec.mouthWidth;
  const mouthHeight = spec.mouthHeight;
  const mouthStart = spec.mouthStart;
  const mouthY = -dimensions.radiusY * (head === 'angler' || head === 'kaiju' ? 0.27 : 0.22);
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
    template.bodyFeatures.push(descriptor(new THREE.BoxGeometry(L * 0.44, r * 1.75, rz * 1.06), solid(palette.base, 'whale bulk'), [L * 0.27, 0, 0], [0, 0, 0], [1, 1, 1], 'whale bulk'));
    const baleen = toonMaterial({ color: palette.belly, kind: 'baleen' });
    for (let i = 0; i < 6; i++) {
      template.bodyFeatures.push(descriptor(new THREE.BoxGeometry(L * 0.012, r * 0.3, rz * 0.08), baleen, [L * (0.12 + i * 0.07), -r * 0.05, rz * 0.94], [0, 0, 0], [1, 1, 1], 'whale baleen'));
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
    const plateEdge = toonMaterial({ color: KAIJU_PLATE_GLOW, glow: KAIJU_PLATE_GLOW, emissiveIntensity: 1.0, side: THREE.FrontSide, kind: 'kaiju plate emissive rim' });
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
    const dorsalHeight = r * (1.7 + finite(def.sil?.finScale, 1) * 0.42 + Math.max(0, finite(def.tier, 1) - 4) * 0.025);
    template.bodyFeatures.push(descriptor(makeExtrudedTriangle([[-L * 0.12, r * 0.55, 0], [-L * 0.27, dorsalHeight, 0], [L * 0.2, r * 0.5, 0]], rz * 0.16), dorsalMaterial, [0, 0, 0], [0, 0, 0], [1, 1, 1], 'assertive dorsal fin'));
  }
  template.bodyFeatures.push(descriptor(makeExtrudedTriangle([[L * 0.03, -r * 0.55, 0], [-L * 0.03, -r * (0.98 + finite(def.sil?.finScale, 1) * 0.18), 0], [L * 0.2, -r * 0.48, 0]], rz * 0.1), dorsalMaterial, [0, 0, 0], [0, 0, 0], [1, 1, 1], 'pelvic fin'));
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
  const girth = clamp(finite(sil.girth, 0.36), 0.18, 0.8);
  const tailScale = clamp(finite(sil.tailScale, 1), 0.55, 2.5);
  const finScale = clamp(finite(sil.finScale, 1), 0.5, 2.1);
  const bodyLen = len * (head === 'eel' ? 1.48 : 1.3);
  const radiusY = bodyLen * (0.14 + girth * 0.21) * (head === 'eel' ? 0.72 : 1);
  const radiusZ = radiusY * (head === 'eel' ? 0.9 : 0.82);
  const dimensions = { bodyLen, radiusY, radiusZ, len, girth, tailScale, finScale };
  const palette = paletteOf(def);
  const template = {
    id,
    dimensions,
    palette,
    bodyGeometry: makeSpineGeometry(def, palette, dimensions),
    bodyMaterial: toonMaterial({ color: WHITE, glow: 0x000000, vertexColors: true, kind: 'body' }),
    tailGeometry: makeTailGeometry(bodyLen, tailScale, finite(def.tier, 1), palette, sil.pattern),
    tailMaterial: toonMaterial({ color: WHITE, glow: 0x000000, vertexColors: true, kind: 'tail' }),
    pectGeometry: makePectoralGeometry(bodyLen, radiusY, radiusZ * (1.35 + finScale * 0.2)),
    pectMaterial: toonMaterial({ color: lerpColor(palette.base, palette.belly, 0.22), glow: 0x000000, kind: 'pectoral' }),
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
  template.metrics.bodyMaxZ = template.bodyGeometry.boundingBox.max.z;
  template.metrics.tailShare = (template.tailGeometry.boundingBox.max.x - template.tailGeometry.boundingBox.min.x) / Math.max(0.001, template.bodyGeometry.boundingBox.max.x - template.bodyGeometry.boundingBox.min.x);
  template.metrics.plateMaxZ = template.plateFeatures.length
    ? Math.max(...template.plateFeatures.map((feature) => feature.geometry.boundingBox.max.z + feature.position[2]))
    : 0;
  template.metrics.jawVolumeRatio = template.jaw
    ? (template.jaw.geometry.userData.rfJawVolume || 0) / Math.max(0.001, dimensions.bodyLen * (dimensions.radiusY * 2) * (dimensions.radiusZ * 2))
    : 0;
  geometryCache.set(id, template);
  return template;
}

function instantiateFeature(parent, feature) {
  const mesh = new THREE.Mesh(feature.geometry, feature.material);
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
  group.userData.rfJawVolumeRatio = template.metrics.jawVolumeRatio;
  group.userData.rfTailShare = template.metrics.tailShare;
  group.userData.rfPlateMaxZ = template.metrics.plateMaxZ;
  group.userData.rfBodyMaxZ = template.metrics.bodyMaxZ;
  group.userData.rfFeatureSourceCount = template.bodyFeatures.length;
  group.userData.rfFeatureBatchCount = template.featureBatches.length;
  group.userData.rfBatchesTeethPlatesEyes = template.featureBatches.some((batch) => batch.geometry.userData.rfFeatureNames.some((name) => name.includes('tooth'))) &&
    template.featureBatches.some((batch) => batch.geometry.userData.rfFeatureNames.some((name) => name.includes('plate'))) &&
    template.featureBatches.some((batch) => batch.geometry.userData.rfFeatureNames.some((name) => name.includes('eye')));

  const body = new THREE.Mesh(template.bodyGeometry, template.bodyMaterial);
  body.name = 'RF body';
  const shellMaterial = toonMaterial({ color: 0x06111c, side: THREE.BackSide, kind: 'silhouette shell' });
  const shell = new THREE.Mesh(template.bodyGeometry, shellMaterial);
  shell.name = 'RF dark silhouette edge shell';
  shell.scale.setScalar(1.045);
  shell.position.z = -template.dimensions.radiusZ * 0.035;
  body.add(shell);
  for (const feature of template.featureBatches) instantiateFeature(body, feature);
  group.add(body);

  const tail = new THREE.Mesh(template.tailGeometry, template.tailMaterial);
  tail.name = 'RF tail';
  tail.position.x = -template.dimensions.bodyLen * 0.52;
  group.add(tail);

  const pectL = new THREE.Mesh(template.pectGeometry, template.pectMaterial);
  pectL.name = 'RF pectoral L';
  pectL.position.set(-template.dimensions.bodyLen * 0.05, -template.dimensions.radiusY * 0.05, template.dimensions.radiusZ * 0.26);
  group.add(pectL);
  const pectR = new THREE.Mesh(template.pectGeometry, template.pectMaterial);
  pectR.name = 'RF pectoral R';
  pectR.position.set(-template.dimensions.bodyLen * 0.05, -template.dimensions.radiusY * 0.05, -template.dimensions.radiusZ * 0.26);
  pectR.scale.z = -1;
  group.add(pectR);

  let jaw = null;
  if (template.jaw) {
    jaw = new THREE.Mesh(template.jaw.geometry, template.jaw.material);
    jaw.name = 'RF lower jaw';
    jaw.position.set(...template.jaw.position);
    if (template.jaw.teethGeometry && template.jaw.teethMaterial) {
      const mesh = new THREE.Mesh(template.jaw.teethGeometry, template.jaw.teethMaterial);
      mesh.name = 'RF jaw tooth';
      jaw.add(mesh);
    }
    body.add(jaw);
  }

  const parts = { body, tail, pectL, pectR, jaw };
  const animation = { baseCaptured: false, baseY: 0 };
  function animate(t = 0, state = {}) {
    const time = finite(t, 0);
    const speedFrac = clamp(finite(state.speedFrac, 0), 0, 1);
    const turn = clamp(finite(state.turn, 0), -1, 1);
    const rate = speedFrac < 0.33 ? 2.5 : speedFrac < 0.72 ? 5 : 8;
    const amplitude = 0.10 + speedFrac * 0.24;
    const wave = Math.sin(time * TAU * rate);
    tail.rotation.y = wave * amplitude + turn * 0.12;
    tail.rotation.z = Math.sin(time * TAU * rate + Math.PI * 0.5) * amplitude * 0.12;
    body.rotation.x = clamp(turn * 0.18, -0.18, 0.18);
    body.rotation.y = turn * 0.045;
    const flutter = Math.sin(time * TAU * rate * 0.5 + Math.PI * 0.25) * (0.045 + speedFrac * 0.09);
    pectL.rotation.x = 0.08 + flutter;
    pectR.rotation.x = -0.08 - flutter;
    pectL.rotation.z = -turn * 0.12;
    pectR.rotation.z = -turn * 0.12;
    if (jaw) {
      const phase = clamp(Math.max(finite(state.bitePhase, 0), finite(state.jawSnapT, 0)), 0, 1);
      const snap = phase * phase * (3 - 2 * phase);
      jaw.rotation.z = -snap * (0.3 + clamp(finite(def.tier, 5), 5, 12) * 0.012);
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

function __selftest() {
  ensureSharedGeometry();
  const rows = host.RFD?.SHARKS || RF.RFD?.SHARKS || RF.SHARKS;
  if (!rows || rows.length !== 61) throw new Error(`RF.Art3D expected 61 sharks, received ${rows ? rows.length : 0}`);
  const samples = representativeRows();
  const result = { pass: false, headProfiles: {}, triangles: {}, materialAudit: {}, bodyCalibration: {}, notes: [], errors: [] };
  try {
    const ratios = [];
    const ramp = ensureGradientMap();
    const rampTexels = distinctGradientTexels(ramp);
    if (rampTexels < 3) throw new Error(`gradientMap has only ${rampTexels} distinct texels`);
    // Three r160 exposes needsUpdate as a write-only setter; version is the
    // renderer-visible proof that the setter was triggered in headless mode.
    if (!(ramp.version > 0)) throw new Error('gradientMap was not marked needsUpdate');
    for (const def of samples) {
      const rig = buildShark(def);
      const { group, parts } = rig;
      if (!(group instanceof THREE.Group) || !parts.body?.isMesh || !parts.tail?.isMesh || !parts.pectL?.isMesh || !parts.pectR?.isMesh || (def.tier >= 5 && !parts.jaw?.isMesh) || typeof rig.animate !== 'function') throw new Error(`${def.id}: incomplete rig contract`);
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
        faceShare: Number(metrics.rfFaceShare.toFixed(3)),
        jawVolumeRatio: Number(metrics.rfJawVolumeRatio.toFixed(3)),
        tailShare: Number(metrics.rfTailShare.toFixed(3)),
        plateExposure: def.sil.head === 'kaiju' ? metrics.rfPlateMaxZ > metrics.rfBodyMaxZ : true,
        size: [Number(size.x.toFixed(3)), Number(size.y.toFixed(3)), Number(size.z.toFixed(3))]
      };
      if (def.tier >= 5 && metrics.rfFaceShare < 0.28) throw new Error(`${def.id}: face share ${metrics.rfFaceShare.toFixed(3)} < 0.28`);
      if (def.tier >= 5 && metrics.rfJawVolumeRatio < (def.sil.head === 'kaiju' ? 0.09 : 0.045)) throw new Error(`${def.id}: jaw volume ratio ${metrics.rfJawVolumeRatio.toFixed(3)} is too thin`);
      if (def.tier >= 10 && metrics.rfTailShare < (def.sil.head === 'kaiju' ? 0.72 : 0.58)) throw new Error(`${def.id}: tail bbox share ${metrics.rfTailShare.toFixed(3)} is too small`);
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
      result.bodyCalibration[def.id] = {
        ridge: Number(bands.ridge.mean.toFixed(3)),
        flank: Number(bands.flank.mean.toFixed(3)),
        belly: Number(bands.belly.mean.toFixed(3))
      };
      if (bands.ridge.mean > 0.30) throw new Error(`${def.id}: dorsal ridge luminance ${bands.ridge.mean.toFixed(3)} > 0.30`);
      if (bands.flank.mean < 0.30 || bands.flank.mean > 0.65) throw new Error(`${def.id}: flank luminance ${bands.flank.mean.toFixed(3)} outside 0.30..0.65`);
      if (bands.belly.mean < 0.70) throw new Error(`${def.id}: belly luminance ${bands.belly.mean.toFixed(3)} < 0.70`);
    }
    if (new Set(ratios).size < 4) throw new Error(`head proportions collapsed: ${ratios.join(', ')}`);
    result.gradientMap = { distinctTexels: rampTexels, updateVersion: ramp.version, bands: BODY_RAMP_BANDS };
    let sweep = 0;
    let worstCaseTriangles = 0;
    let worstCaseId = null;
    for (const def of rows) {
      const rig = buildShark(def);
      const materials = auditMaterialOwnership(def, rig);
      result.materialAudit[def.id] = materials;
      const colorStats = bodyColorStats(rig.parts.body.geometry);
      if (colorStats.meanLuminance <= 0 || !noseIsForward(rig.parts.body.geometry)) throw new Error(`${def.id}: invalid body colors or +x nose invariant in sweep`);
      const tris = countTriangles(rig.group);
      if (tris > 3500) throw new Error(`${def.id}: ${tris} triangles in sweep`);
      if (tris > worstCaseTriangles) {
        worstCaseTriangles = tris;
        worstCaseId = def.id;
      }
      sweep++;
    }
    result.sweep = sweep;
    result.bodyMaterialAudit = {
      checked: sweep,
      bodyEmissiveBlack: sweep,
      fxFeatureMeshes: rows.filter((def) => def.sil?.fx && def.sil.fx !== 'none').length
    };
    result.worstCaseTriangles = worstCaseTriangles;
    result.worstCaseId = worstCaseId;
    result.cacheBytes = cacheBytes();
    result.gpuEstimateMB = Number((result.cacheBytes / (1024 * 1024)).toFixed(3));
    if (result.cacheBytes > 120 * 1024 * 1024) throw new Error(`geometry cache exceeds 120MB: ${result.gpuEstimateMB}MB`);
    result.notes.push('headless BufferGeometry path; no renderer or GL context required');
    result.notes.push(`shared ${rampTexels}-texel NEAREST linear luminance gradientMap; needsUpdate=true`);
    result.notes.push(`body vertex colors finite; ridge <= 0.30, flank 0.30..0.65, belly >= 0.70 on ${calibrationRows.length} calibration rows`);
    result.notes.push(`shared ramp bands ${BODY_RAMP_BANDS.map((value) => value.toFixed(2)).join(' / ')}; dark dorsal block starts at topness ${BODY_DORSAL_START.toFixed(2)}`);
    result.notes.push(`structural body/tail/pectoral/jaw emissive is black across ${sweep}/${sweep}; feature glow is 0.6..1.0`);
    result.notes.push('every non-none Act 2/3 sil.fx key has a named emissive feature mesh; pattern veins/plates and FX families are feature-owned');
    result.notes.push('14 archetype face identities checked; tier 5+ face share, jaw volume, and tier-scaled tail gates checked');
    result.notes.push('kaiju plate row is camera-offset above body max z; mouth cavities and tooth rows are merged per shark');
    result.pass = true;
  } catch (error) {
    result.errors.push(error.message || String(error));
  }
  return result;
}

const Art3D = {
  buildShark,
  billboard,
  __selftest,
  paletteOf,
  stats() {
    return { sharkTemplates: geometryCache.size, materials: materialCache.size, billboardMaterials: billboardMaterials.size, geometryBytes: cacheBytes() };
  }
};

RF.Art3D = Art3D;
ensureSharedGeometry();

export { Art3D, buildShark, billboard, __selftest };
export default Art3D;
