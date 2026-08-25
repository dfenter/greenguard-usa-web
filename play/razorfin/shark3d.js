/* Razorfin Rev 9 shark art.
 *
 * The body is deliberately not generated here. It is the artist-made
 * skinned GLB from assets/models; this lane owns loading, safe per-instance
 * cloning, palette/pattern identity, one small head prop, and the engine
 * contract around it.
 */
import * as THREE from 'three';
import { GLTFLoader } from '../_shared/three/GLTFLoader.js';
import { mergeGeometries } from '../_shared/utils/BufferGeometryUtils.js';

const host = typeof window !== 'undefined' ? window : globalThis;
const RF = host.RF = host.RF || {};
const MODEL_FILES = Object.freeze({
  sharky: 'sharky.glb', goblinshark: 'goblinshark.glb', anglerfish: 'anglerfish.glb', piranha: 'piranha.glb',
  whale: 'whale.glb', shark: 'shark.glb', shark_c: 'shark_c.glb', hammer_chibi: 'hammer_chibi.glb',
  manta: 'manta.glb', dolphin: 'dolphin.glb', fish_tuna: 'fish_tuna.glb', fish_blue: 'fish_blue.glb',
  fish_clown: 'fish_clown.glb', shark_b: 'shark_b.glb'
});
const MODEL_KEYS = Object.freeze(Object.keys(MODEL_FILES));
const TAU = Math.PI * 2;
const BASE_LENGTH = 96;
const PATTERN_SUFFIX = ':rf-skin3';
const JAW_REST_GAPE = 0.28;
const JAW_MAX_ROTATION = 0.72;
const PATTERN_IDS = Object.freeze({
  plain: 0, stripes: 1, spots: 2, dots: 2, mottled: 2, mirror: 2, boils: 2,
  bands: 3, rings: 3, ribbons: 3, swirls: 3, collar: 3, rays: 3, corona: 3,
  scars: 4, cracks: 4, faults: 4, bones: 4, rot: 4,
  plates: 5, plating: 5, scales: 5, spikes: 5, faults: 4, bones: 4, rivets: 5,
  panels: 5, facets: 5, patches: 2, coral: 5, magma: 4, runes: 4, stars: 2
});

/* Rev 10 variant-art law: props are exceptions, never the identity system.
 * The allowlist is intentionally keyed by definition id, not by a loose
 * head/fx value, so a future row cannot accidentally grow a random horn or
 * lure just because it shares an authored tag. */
const PROP_ALLOWLIST = Object.freeze({
  hammer: new Set(['hammerhead', 'athenajaw']),
  saw: new Set(['sawshark', 'barbhook', 'chimerashark']),
  horns: new Set(['minotaurram']),
  crown: new Set(['coralcrown', 'zeusfin', 'heracrown'])
});
const PROP_ALLOWLIST_IDS = new Set(Object.values(PROP_ALLOWLIST).flatMap((ids) => Array.from(ids)));

/* Rev 7 palette ranges. These are the art resolver's authority; data.js
 * remains the authored source and is never mutated. */
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
const UNDERWORLD_IDS = new Set([
  'typhonmaw', 'hydrafang', 'cerberusjaw', 'chimerashark', 'medusagaze', 'scyllarender',
  'charybdisvoid', 'minotaurram', 'cyclopseye', 'harpyshade', 'lamiacoil', 'kampechrono'
]);
/* The 9.6 showcase rows are judged against the HSE palette reads, not the
 * low-contrast roster swatches. These are linear-space HSV targets consumed
 * by the same atlas colorizer as every other definition. */
const STYLE_PALETTE_OVERRIDES = Object.freeze({
  reef:       { base: [0.58, 0.52, 0.55], belly: [0.57, 0.12, 0.92], accent: [0.57, 0.82, 0.80] },
  tiger:      { base: [0.095, 0.52, 0.62], belly: [0.10, 0.16, 0.91], accent: [0.075, 0.78, 0.78] },
  hammerhead: { base: [0.59, 0.42, 0.60], belly: [0.58, 0.10, 0.94], accent: [0.57, 0.78, 0.82] },
  greatwhite: { base: [0.59, 0.22, 0.60], belly: [0.58, 0.08, 0.98], accent: [0.57, 0.62, 0.80] },
  whaleshark: { base: [0.58, 0.32, 0.54], belly: [0.57, 0.10, 0.92], accent: [0.56, 0.70, 0.76] }
});

const modelCache = new Map();
const baseSelection = new Map();
let preloadPromise = null;
let preloadError = null;
let sharedPlaneGeometry = null;
const billboardMaterials = new Map();
const billboardIds = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
let nextBillboardId = 1;

function clamp(value, lo, hi) { return value < lo ? lo : value > hi ? hi : value; }
function finite(value, fallback) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function hex(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(n) ? (n >>> 0) & 0xffffff : fallback;
}
function colorValue(value, fallback = 0xffffff) {
  return value instanceof THREE.Color ? value.clone() : new THREE.Color(hex(value, fallback));
}
function rgbToHsv(color) {
  const c = color instanceof THREE.Color ? color : colorValue(color);
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b), delta = max - min;
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
  const hue = ((h % 1) + 1) % 1, sat = clamp(s, 0, 1), val = clamp(v, 0, 1);
  const sector = hue * 6, i = Math.floor(sector), f = sector - i;
  const p = val * (1 - sat), q = val * (1 - sat * f), t = val * (1 - sat * (1 - f));
  switch (i % 6) {
    case 0: return new THREE.Color(val, t, p);
    case 1: return new THREE.Color(q, val, p);
    case 2: return new THREE.Color(p, val, t);
    case 3: return new THREE.Color(p, q, val);
    case 4: return new THREE.Color(t, p, val);
    default: return new THREE.Color(val, p, q);
  }
}
function resolvePaletteSwatch(value, saturationMin, saturationMax, valueMin, valueMax, fallbackHue = 0) {
  const source = colorValue(value), hsv = rgbToHsv(source);
  const hue = hsv.s > 0.04 ? hsv.h : fallbackHue;
  return hsvToColor(hue, clamp(Math.max(hsv.s, saturationMin), saturationMin, saturationMax), clamp(Math.max(hsv.v, valueMin), valueMin, valueMax));
}
function paletteStats(color) { const hsv = rgbToHsv(color); return { h: hsv.h, s: hsv.s, v: hsv.v }; }
function hsvTarget([h, s, v]) { return hsvToColor(h, s, v); }
function paletteOf(def) {
  const source = def?.sil?.palette || {}, id = String(def?.id || ''), family = PANTHEON_PALETTE_FAMILIES[id];
  if (family) {
    const underworld = UNDERWORLD_IDS.has(id);
    const base = hsvToColor(family.baseHue, underworld ? 0.76 : 0.78, family.baseV);
    const accent = hsvToColor(family.accentHue, 0.96, family.accentV);
    const belly = hsvToColor(family.baseHue, underworld ? 0.20 : 0.18, underworld ? 0.84 : 0.91);
    const glow = hsvToColor(family.accentHue, 0.98, 0.95);
    return {
      base, belly, accent, glow,
      raw: { base: hex(source.base, base.getHex()), belly: hex(source.belly, belly.getHex()), accent: hex(source.accent, accent.getHex()), glow: source.glow ? hex(source.glow) : glow.getHex() },
      resolved: { base: paletteStats(base), belly: paletteStats(belly), accent: paletteStats(accent), glow: paletteStats(glow) }, family: id, underworld
    };
  }
  const style = STYLE_PALETTE_OVERRIDES[id];
  if (style) {
    const base = hsvTarget(style.base), belly = hsvTarget(style.belly), accent = hsvTarget(style.accent);
    const glow = source.glow ? colorValue(source.glow) : null;
    return {
      base, belly, accent, glow,
      raw: { base: hex(source.base, base.getHex()), belly: hex(source.belly, belly.getHex()), accent: hex(source.accent, accent.getHex()), glow: source.glow ? hex(source.glow) : 0 },
      resolved: { base: paletteStats(base), belly: paletteStats(belly), accent: paletteStats(accent), glow: glow ? paletteStats(glow) : null }, style: id
    };
  }
  const authoredBase = colorValue(source.base, 0x204050), authoredAccent = colorValue(source.accent, 0x164557);
  const authoredGlow = source.glow ? colorValue(source.glow) : null, accentHue = rgbToHsv(authoredAccent).h;
  const screenTail = new Set(['reef', 'tiger', 'hammerhead', 'greatwhite']);
  const accentTarget = screenTail.has(id) ? ACCENT_SATURATION_TARGET : ACCENT_SATURATION_MIN;
  const base = resolvePaletteSwatch(authoredBase, BODY_FLANK_SATURATION_TARGET, BODY_FLANK_SATURATION_MAX, BODY_FLANK_VALUE_MIN, BODY_FLANK_VALUE_MAX);
  const accent = resolvePaletteSwatch(authoredAccent, accentTarget, ACCENT_SATURATION_MAX, Math.max(ACCENT_VALUE_MIN, 0.86), ACCENT_VALUE_MAX, accentHue);
  const belly = resolvePaletteSwatch(source.belly, BELLY_SATURATION_MIN, BELLY_SATURATION_MAX, BELLY_VALUE_MIN, BELLY_VALUE_MAX, rgbToHsv(authoredBase).h);
  const glow = authoredGlow
    ? resolvePaletteSwatch(authoredGlow, ACCENT_SATURATION_MIN, ACCENT_SATURATION_MAX, Math.max(ACCENT_VALUE_MIN, 0.88), ACCENT_VALUE_MAX, accentHue)
    : finite(def?.act, 1) >= 2 ? hsvToColor(accentHue, 0.96, 0.94) : null;
  return {
    base, belly, accent, glow,
    raw: { base: hex(source.base, 0x204050), belly: hex(source.belly, 0xddeee7), accent: hex(source.accent, 0x164557), glow: source.glow ? hex(source.glow) : 0 },
    resolved: { base: paletteStats(base), belly: paletteStats(belly), accent: paletteStats(accent), glow: glow ? paletteStats(glow) : null }
  };
}
function hashString(value) {
  let h = 2166136261, str = String(value || '');
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}
function eyeColorOf(def) {
  const id = String(def?.id || ''), head = String(def?.sil?.head || '');
  const named = {
    reef: 0x101b1d, epaulette: 0xd7a83b, cookiecutter: 0xf2a83b, mako: 0x63d8ff,
    blue: 0x8cecff, hammerhead: 0xd9f25b, thresher: 0xffc74d, sawshark: 0xff8b45,
    tiger: 0x79e85b, bull: 0xffbf49, goblin: 0xff6f48, greatwhite: 0x8bdcff,
    whaleshark: 0x72f0d4, megalodon: 0xffcf72, greenland: 0x80b6ff,
    leviathanrex: 0x8df6ff, zeusfin: 0xfff074, hadesmaw: 0xff5f9a,
    typhonmaw: 0xff6d3f, minotaurram: 0xffbd4e, medusagaze: 0x9dff6b,
    cyclopseye: 0xffe064
  }[id];
  if (named) return colorValue(named);
  const hue = (hashString(`${id}:${head}`) * 0.84 + (finite(def?.act, 1) - 1) * 0.035) % 1;
  return hsvToColor(hue, 0.82, 0.92);
}
function variantProfile(def) {
  const id = String(def?.id || ''), sil = def?.sil || {}, head = String(sil.head || ''), act = finite(def?.act, 1);
  const tailScale = clamp(finite(sil.tailScale, 1), 0.72, 2.4), finScale = clamp(finite(sil.finScale, 1), 0.65, 1.8);
  const lane = Math.floor(hashString(`${id}:body`) * 5);
  const laneScales = [
    { head: 0.96, abdomen: 1.04, tail: 1.04, fin: 0.96 },
    { head: 1.06, abdomen: 0.96, tail: 0.94, fin: 1.06 },
    { head: 1.00, abdomen: 1.10, tail: 1.02, fin: 1.02 },
    { head: 1.08, abdomen: 1.02, tail: 0.96, fin: 0.92 },
    { head: 0.94, abdomen: 0.94, tail: 1.10, fin: 1.10 }
  ][lane];
  const profile = {
    lane,
    head: [laneScales.head, 1, laneScales.head],
    neck: [1, 1, 1],
    abdomen: [laneScales.abdomen, 1, laneScales.abdomen],
    tail: [1, clamp(laneScales.tail * (0.94 + (tailScale - 1) * 0.26), 0.82, 1.32), 1],
    tailUpper: [1, 1, 1],
    fin: [1, clamp(0.96 + (finScale - 1) * 0.18, 0.90, 1.16), clamp(laneScales.fin * (0.96 + (finScale - 1) * 0.24), 0.78, 1.34)],
    jaw: [1, 1, 1],
    patternScale: patternId(def) ? 54 + hashString(`${id}:pattern`) * 20 : 108 + finite(sil.len, 1) * 8,
    eyeColor: eyeColorOf(def)
  };
  const setBody = (headScale, abdomenScale, tailLength, finHeight) => {
    profile.head = [headScale, profile.head[1], headScale];
    profile.neck = [Math.min(headScale, 1.16), 1, Math.min(headScale, 1.16)];
    profile.abdomen = [abdomenScale, 1, abdomenScale];
    profile.tail[1] = tailLength;
    profile.fin[2] = finHeight;
  };

  /* Silhouette families. These are bone scales, so they stay welded to the
   * Sharky rig and cannot produce the floating-object failure mode. */
  if (id === 'mako' || id === 'blue') setBody(0.88, 0.82, 1.18, 0.94);
  if (id === 'thresher') { setBody(0.92, 0.80, 1.12, 0.98); profile.tailUpper = [1, 1.78, 1.05]; }
  if (id === 'bull') setBody(1.10, 1.20, 0.86, 1.06);
  if (id === 'hammerhead' || id === 'athenajaw') setBody(1.18, 1.06, 0.98, 1.10);
  if (id === 'whaleshark' || id === 'greenland' || id === 'megalodon') setBody(1.18, 1.18, 0.88, 1.02);
  if (head === 'whale' || head === 'kaiju' || id === 'leviathanrex' || id === 'typhonmaw') setBody(1.28, 1.26, 0.86, 1.18);
  if (head === 'eel' || id === 'morayne' || id === 'gloomtide') setBody(0.88, 0.78, 1.20, 0.82);
  if (head === 'croc' || id === 'snapjaw' || id === 'aresrender' || id === 'cerberusjaw') {
    setBody(1.12, 1.12, 0.92, 1.08); profile.jaw = [1.10, 1.06, 1.18];
  }
  if (head === 'rock' || head === 'skull' || head === 'void' || head === 'mech') {
    profile.head[0] *= 1.08; profile.head[2] *= 1.10; profile.abdomen[0] *= 1.08; profile.abdomen[2] *= 1.08;
  }
  if (act >= 4) {
    profile.head[0] *= 1.05; profile.head[2] *= 1.05; profile.abdomen[0] *= 1.05; profile.abdomen[2] *= 1.05;
    profile.patternScale = patternId(def) ? 48 + hashString(`${id}:late-pattern`) * 18 : profile.patternScale;
  }
  if (act >= 5) {
    profile.jaw[0] *= 1.08; profile.jaw[2] *= 1.12; profile.head[1] *= 1.06;
  }
  if (id === 'sailfin' || id === 'harpyshade' || id === 'aurora') profile.fin[2] *= 1.18;
  /* Reef is the approved Sharky reference row. Keep its silhouette at the
   * authored bind-pose scale; all other rows earn their own variant shape. */
  if (id === 'reef') {
    profile.lane = 0;
    profile.head = [1, 1, 1]; profile.neck = [1, 1, 1]; profile.abdomen = [1, 1, 1];
    profile.tail = [1, 1, 1]; profile.tailUpper = [1, 1, 1]; profile.fin = [1, 1, 1]; profile.jaw = [1, 1, 1];
    profile.patternScale = 108 + finite(sil.len, 1) * 8;
  }
  profile.shapeTag = `${head || 'point'}-lane${profile.lane}`;
  return profile;
}
function applyVariantBoneProfile(root, template, profile) {
  if (template.key !== 'sharky') return [];
  const applied = [];
  const targets = [
    ['Head', profile.head], ['Neck', profile.neck], ['Abdomen', profile.abdomen],
    ['Tail1', profile.tail], ['Tail2', profile.tail], ['Tail3', profile.tailUpper], ['Tail4', profile.tailUpper],
    ['LowerJaw', profile.jaw], ['Fin1.L', profile.fin], ['Fin1.R', profile.fin], ['Fin2.L', profile.fin], ['Fin2.R', profile.fin]
  ];
  for (const [name, factors] of targets) {
    const bone = root.getObjectByName(name); if (!bone) continue;
    bone.scale.multiply(new THREE.Vector3(...factors)); applied.push({ name, scale: factors.slice() });
  }
  return applied;
}
function rows() { return host.RFD?.SHARKS || RF.RFD?.SHARKS || RF.SHARKS || []; }
function baseForDef(def) {
  const head = String(def?.sil?.head || '');
  if (head === 'goblin' || String(def?.id || '') === 'goblin') return 'goblinshark';
  if (head === 'angler') return 'anglerfish';
  if (head === 'piranha') return 'piranha';
  // whale.glb is a clean silhouette but has no readable cartoon mouth. Keep
  // the new face and make whale/kaiju rows bulky in buildLoadedRig().
  return 'sharky';
}
function patternId(def) { return PATTERN_IDS[String(def?.sil?.pattern || 'plain')] ?? 0; }
function assetUrl(file) { return new URL(`./assets/models/${file}`, import.meta.url).href; }
function findSkinned(root) { let found = null; root.traverse((o) => { if (!found && o.isSkinnedMesh) found = o; }); return found; }
function findMeshes(root) { const out = []; root.traverse((o) => { if (o.isMesh) out.push(o); }); return out; }
function copyTransform(from, to) {
  to.position.copy(from.position); to.quaternion.copy(from.quaternion); to.scale.copy(from.scale);
  to.matrix.copy(from.matrix); to.matrixAutoUpdate = from.matrixAutoUpdate;
}

function measureBox(root) {
  root.updateMatrixWorld(true);
  const out = new THREE.Box3().makeEmpty();
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (object.isSkinnedMesh) {
      object.computeBoundingBox();
      if (object.boundingBox) out.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));
    } else if (object.geometry?.boundingBox) out.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    else out.expandByObject(object);
  });
  return out;
}
function prepareTemplate(scene, animations = [], key = '') {
  const meshes = findMeshes(scene), skinnedMeshes = meshes.filter((object) => object.isSkinnedMesh);
  const source = skinnedMeshes[0] || meshes[0];
  if (!source) throw new Error(`${key}: no mesh`);
  const isSkinned = skinnedMeshes.length > 0;
  scene.updateMatrixWorld(true);
  const clip = animations?.find((a) => /swim(?![_a-z])/i.test(a.name || '') || /swimming_normal/i.test(a.name || '')) || animations?.find((a) => /swim|swimming/i.test(a.name || '')) || animations?.[0] || null;
  if (isSkinned && clip) { const mixer = new THREE.AnimationMixer(scene); mixer.clipAction(clip).play(); mixer.update(0); scene.updateMatrixWorld(true); }
  const initialBox = measureBox(scene), initialSize = initialBox.getSize(new THREE.Vector3());
  const axis = initialSize.y >= initialSize.x && initialSize.y >= initialSize.z ? 'y' : initialSize.z > initialSize.x ? 'z' : 'x';
  const unitScale = 1 / Math.max(initialSize.x, initialSize.y, initialSize.z, 1e-5);
  scene.scale.setScalar(unitScale); scene.position.sub(initialBox.getCenter(new THREE.Vector3()).multiplyScalar(unitScale));
  if (axis === 'y') scene.rotation.z = -Math.PI / 2; else if (axis === 'z') scene.rotation.y = Math.PI / 2;
  scene.updateMatrixWorld(true);
  const normalizedBox = measureBox(scene);
  const materials = [];
  for (const mesh of meshes) for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) if (material && !materials.includes(material)) materials.push(material);
  const sourceMaterials = (Array.isArray(source.material) ? source.material : [source.material]).map((material) => String(material?.name || 'Body'));
  return {
    key, scene, body: source, meshes, skinnedMeshes, materials, animations: animations || [], clip,
    clips: {
      swim: animations?.find((a) => /(?:^|\|)Swim(?:$|\||_)/i.test(a.name || '') && !/Fast|Bite/i.test(a.name || '')) || clip,
      fast: animations?.find((a) => /Swim_Fast|Swimming_Fast/i.test(a.name || '')) || null,
      bite: animations?.find((a) => /Swim_Bite|Attack/i.test(a.name || '')) || null,
      death: animations?.find((a) => /Death/i.test(a.name || '')) || null
    },
    isSkinned, axis, unitScale, normalizedSize: normalizedBox.getSize(new THREE.Vector3()),
    normalizedLength: normalizedBox.max.x - normalizedBox.min.x, slotNames: sourceMaterials,
    hasAtlas: materials.some((material) => String(material?.name || '') === 'AtlasMaterial' || !!material?.map)
  };
}
function cloneRigScene(template) {
  const sourceScene = template.scene, clone = sourceScene.clone(true), sourceSkins = [], cloneSkins = [];
  sourceScene.traverse((o) => { if (o.isSkinnedMesh) sourceSkins.push(o); });
  clone.traverse((o) => { if (o.isSkinnedMesh) cloneSkins.push(o); });
  for (let i = 0; i < sourceSkins.length; i++) {
    const source = sourceSkins[i], target = cloneSkins[i]; if (!target || !source.skeleton) continue;
    const bones = source.skeleton.bones.map((bone) => clone.getObjectByName(bone.name));
    if (bones.some((bone) => !bone)) throw new Error('skeleton clone lost a bone');
    target.bind(new THREE.Skeleton(bones, source.skeleton.boneInverses.map((m) => m.clone())), source.bindMatrix.clone(), source.bindMatrixInverse.clone());
  }
  return clone;
}

const SHADER_UNIFORMS = Object.freeze([
  'uRfTopColor', 'uRfBottomColor', 'uRfAccentColor', 'uRfPatternColor', 'uRfPatternId',
  'uRfPatternScale', 'uRfPatternContrast', 'uRfPatternSeed', 'uRfPatternMix',
  'uRfHueShift', 'uRfSaturation', 'uRfTintMask', 'uRfHeightScale', 'uRfEyeColor'
]);
function materialIsFace(name) { return /eye|teeth|tooth|mouth/i.test(String(name || '')); }
function sourceMap(sourceMaterial) { return sourceMaterial?.map || null; }
function skinMaterial(palette, def, sourceMaterial = null, sourceName = '', atlas = false, featureMode = '') {
  const profile = variantProfile(def), faceSlot = materialIsFace(sourceName), map = sourceMap(sourceMaterial), sourceColor = sourceMaterial?.color?.clone?.() || new THREE.Color(1, 1, 1);
  const uniforms = {
    uRfTopColor: { value: palette.base.clone() }, uRfBottomColor: { value: palette.belly.clone() }, uRfAccentColor: { value: palette.accent.clone() }, uRfPatternColor: { value: palette.accent.clone() },
    uRfPatternId: { value: patternId(def) }, uRfPatternScale: { value: profile.patternScale }, uRfPatternContrast: { value: 0.95 }, uRfPatternSeed: { value: hashString(def?.id || '') * 17 }, uRfPatternMix: { value: patternId(def) ? 0.78 : 0 }
    , uRfHueShift: { value: 0 }, uRfSaturation: { value: 1 }, uRfTintMask: { value: faceSlot ? 0 : 1 }, uRfHeightScale: { value: 44 }, uRfEyeColor: { value: profile.eyeColor.clone() }
  };
  const act = finite(def?.act, 1), glow = palette.glow || new THREE.Color(0, 0, 0);
  const material = new THREE.MeshStandardMaterial({
    /* Atlas materials use white as the detail carrier. Multiplying the dark
     * palette here was the Rev 9b tint bug; the shader below owns the palette
     * mix and only uses the atlas for luminance/detail and face masks. */
    color: faceSlot || !atlas ? (faceSlot ? sourceColor : palette.base.clone()) : new THREE.Color(1, 1, 1), map,
    roughness: faceSlot ? 0.58 : 0.50, metalness: faceSlot ? 0 : 0.03, flatShading: false,
    emissive: faceSlot ? new THREE.Color(0, 0, 0) : featureMode === 'hammer' ? palette.base.clone() : glow,
    emissiveIntensity: faceSlot ? 0 : featureMode === 'hammer' ? 0.10 : clamp(0.05 + Math.max(0, act - 1) * 0.055, 0, 0.32)
  });
  material.name = `RF Rev 9c shark skin ${def?.id || 'unknown'} ${sourceName || 'Body'}`;
  material.userData.rfSkinUniforms = uniforms; material.userData.rfSkinPattern = String(def?.sil?.pattern || 'plain');
  material.userData.rfAtlas = !!(atlas && map); material.userData.rfFaceMask = faceSlot ? 'material-slot' : atlas ? 'atlas-white-luminance' : 'none';
  material.userData.rfShading = 'MeshStandardMaterial; smooth normals; roughness 0.50; specular lighting';
  const hammerRamp = featureMode === 'hammer' ? [
    'float rfFoilBelly = smoothstep(0.040, -0.040, vRfBindPosition.z);',
    'vec3 rfFoilRegion = mix(uRfTopColor, uRfBottomColor, rfFoilBelly);',
    'diffuseColor.rgb = rfFoilRegion;'
  ].join('\n') : [
    'vec3 rfHsv = rfRgbToHsv(diffuseColor.rgb); rfHsv.x = fract(rfHsv.x + uRfHueShift); rfHsv.y = clamp(rfHsv.y * uRfSaturation, 0.0, 1.0); rfHsv.z = clamp(rfHsv.z * 1.35 + 0.04, 0.0, 1.0);',
    'vec3 rfVivid = rfHsvToRgb(rfHsv);',
    'diffuseColor.rgb = mix(rfVivid, diffuseColor.rgb, clamp(rfFaceMask, 0.0, 1.0));'
  ].join('\n');
  const patternCode = [
    'float rfAlong = vRfBindPosition.y * uRfPatternScale + uRfPatternSeed;',
    'float rfAcross = vRfBindPosition.x * uRfPatternScale * 1.7 + uRfPatternSeed * 0.37;',
    'float rfPattern = 0.0;',
    'if (uRfPatternId == 1) rfPattern = smoothstep(0.40, 0.60, 0.5 + 0.5 * sin(rfAlong * 3.14159));',
    'else if (uRfPatternId == 2) rfPattern = step(0.68, rfHash(vec2(floor(rfAlong * 2.0), floor(rfAcross * 3.0))));',
    'else if (uRfPatternId == 3) rfPattern = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(rfAlong * 6.28318));',
    'else if (uRfPatternId == 4) rfPattern = step(0.73, rfHash(vec2(floor(rfAlong * 3.0), floor(rfAcross * 2.0))));',
    'else if (uRfPatternId == 5) rfPattern = step(0.56, rfHash(vec2(floor(rfAlong * 5.0), floor(rfAcross * 4.0))));',
    'float rfFaceMask = 1.0 - uRfTintMask;',
    atlas && map ? [
      'vec3 rfAtlasTexel = texture2D(map, vMapUv).rgb;',
      'float rfAtlasLuma = dot(rfAtlasTexel, vec3(0.299, 0.587, 0.114));',
      /* The Sharky atlas is white-backed and uses tiny colored islands. Do
       * not use RGB hue as the shark identity: retain only its light/dark
       * detail, then paint the authored top/belly palette over it. */
      'float rfDetail = mix(0.56, 1.30, smoothstep(0.12, 0.86, rfAtlasLuma));',
      'float rfHeight = 1.0 - clamp(vRfBindPosition.z * uRfHeightScale + 0.5, 0.0, 1.0);',
      'float rfBelly = smoothstep(0.43, 0.72, rfHeight);',
      'vec3 rfRegion = mix(uRfTopColor, uRfBottomColor, rfBelly);',
      'float rfFinTip = smoothstep(0.80, 0.99, abs(rfHeight * 2.0 - 1.0)) * 0.26;',
      'rfRegion = mix(rfRegion, uRfAccentColor, rfFinTip);',
      'vec3 rfRegionHsv = rfRgbToHsv(rfRegion); rfRegionHsv.x = fract(rfRegionHsv.x + uRfHueShift); rfRegionHsv.y = clamp(rfRegionHsv.y * uRfSaturation, 0.0, 1.0);',
      'vec3 rfColorized = rfHsvToRgb(rfRegionHsv) * rfDetail;',
      /* Black also appears on the source underside. Limit the black escape
       * hatch to the forward face and the two eye/cavity bands so it cannot
       * turn the countershaded belly into an ink silhouette. */
      'float rfHead = smoothstep(0.84, 0.99, vRfBindPosition.y * 17.5 + 0.5);',
      'float rfFaceBand = max(1.0 - smoothstep(0.20, 0.44, rfHeight), smoothstep(0.56, 0.80, rfHeight));',
      /* The atlas has a large white backing island. Scope white preservation
       * to the forward eye/mouth bands so that backing white cannot exempt
       * the whole body from palette colorization. */
      'float rfWhite = smoothstep(0.84, 0.985, min(min(rfAtlasTexel.r, rfAtlasTexel.g), rfAtlasTexel.b)) * rfHead * rfFaceBand;',
      'float rfBlack = (1.0 - smoothstep(0.035, 0.085, max(max(rfAtlasTexel.r, rfAtlasTexel.g), rfAtlasTexel.b))) * rfHead * rfFaceBand;',
      'float rfMouth = smoothstep(0.10, 0.28, rfAtlasTexel.r - max(rfAtlasTexel.g, rfAtlasTexel.b)) * rfHead;',
      'rfFaceMask = max(rfFaceMask, max(rfWhite, max(rfBlack, rfMouth)));',
      /* Keep the approved dark mouth/cavity, but give the atlas eye a small
       * species read. The top face band excludes teeth and gills. */
      'float rfEye = rfBlack * (1.0 - smoothstep(0.06, 0.42, rfHeight)) * rfHead;',
      'vec3 rfAtlasFace = mix(rfAtlasTexel, uRfEyeColor, clamp(rfEye * 0.92, 0.0, 0.92));',
      'diffuseColor.rgb = mix(rfColorized, rfAtlasFace, clamp(rfFaceMask, 0.0, 1.0));'
    ].join('\n') : featureMode === 'hammer' ? hammerRamp : [
      'vec3 rfHsv = rfRgbToHsv(diffuseColor.rgb); rfHsv.x = fract(rfHsv.x + uRfHueShift); rfHsv.y = clamp(rfHsv.y * uRfSaturation, 0.0, 1.0); rfHsv.z = clamp(rfHsv.z * 1.35 + 0.04, 0.0, 1.0);',
      'vec3 rfVivid = rfHsvToRgb(rfHsv);',
      'diffuseColor.rgb = mix(rfVivid, diffuseColor.rgb, clamp(rfFaceMask, 0.0, 1.0));'
    ].join('\n'),
    'diffuseColor.rgb = mix(diffuseColor.rgb, uRfPatternColor, rfPattern * uRfPatternMix * uRfPatternContrast * (1.0 - rfFaceMask));',
    featureMode === 'hammer' ? 'if (vRfFeature > 0.5) diffuseColor.rgb = vec3(0.008, 0.014, 0.016);' : ''
  ].join('\n');
  material.onBeforeCompile = (shader) => {
    for (const name of SHADER_UNIFORMS) shader.uniforms[name] = uniforms[name];
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nattribute float rfSlot;\nvarying float vRfSlot;\nvarying vec3 vRfBindPosition;${featureMode === 'hammer' ? '\nattribute float rfFeature;\nvarying float vRfFeature;' : ''}`).replace('#include <begin_vertex>', `#include <begin_vertex>\nvRfSlot = rfSlot;\nvRfBindPosition = position;${featureMode === 'hammer' ? '\nvRfFeature = rfFeature;' : ''}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nuniform vec3 uRfTopColor;\nuniform vec3 uRfBottomColor;\nuniform vec3 uRfAccentColor;\nuniform vec3 uRfPatternColor;\nuniform int uRfPatternId;\nuniform float uRfPatternScale;\nuniform float uRfPatternContrast;\nuniform float uRfPatternSeed;\nuniform float uRfPatternMix;\nuniform float uRfHueShift;\nuniform float uRfSaturation;\nuniform float uRfTintMask;\nuniform float uRfHeightScale;\nvarying float vRfSlot;\nvarying vec3 vRfBindPosition;${featureMode === 'hammer' ? '\nvarying float vRfFeature;' : ''}\nfloat rfHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nvec3 rfRgbToHsv(vec3 c){vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);return vec3(abs(q.z+(q.w-q.y)/(6.0*d+1e-5)),d/(q.x+1e-5),q.x);}\nvec3 rfHsvToRgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(0.0,1.0/3.0,2.0/3.0))*6.0-3.0);return c.z*mix(vec3(1.0),clamp(p-1.0,0.0,1.0),c.y);}`)
    shader.fragmentShader = shader.fragmentShader.replace('uniform float uRfHeightScale;', 'uniform float uRfHeightScale;\nuniform vec3 uRfEyeColor;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${patternCode}`);
    if (atlas && map) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n/* Soft ambient countershading keeps the authored belly readable under the deep-teal hemi ground. */\ntotalEmissiveRadiance += uRfBottomColor * rfBelly * 0.16;');
      shader.fragmentShader = shader.fragmentShader.replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;', 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;\noutgoingLight += uRfBottomColor * rfBelly * 0.34;');
    }
  };
  material.customProgramCacheKey = () => `${material.userData.rfSkinPattern}${PATTERN_SUFFIX}${featureMode ? `:${featureMode}` : ''}`;
  material.needsUpdate = true; return material;
}
function findHeadBone(root, base) {
  const names = base === 'sharky' ? ['Head', 'Center', 'Neck'] : base === 'anglerfish' || base === 'goblinshark' || base === 'piranha' ? ['Main1', 'Main2', 'Main6'] : ['Face', 'Head', 'Spine1', 'Main1'];
  for (const name of names) { const found = root.getObjectByName(name); if (found) return found; }
  let result = null; root.traverse((o) => { if (!result && o.isBone && /head|face/i.test(o.name || '')) result = o; }); return result || root;
}
function findPropBone(root, base, kind) {
  if (base === 'sharky') {
    const name = kind === 'hammer' ? 'Head' : kind === 'horns' || kind === 'spike' ? 'Center' : 'Head';
    return root.getObjectByName(name) || findHeadBone(root, base);
  }
  return findHeadBone(root, base);
}
function propKind(def) {
  const id = String(def?.id || '');
  for (const [kind, ids] of Object.entries(PROP_ALLOWLIST)) if (ids.has(id)) return kind;
  return null;
}
function propGeometry(kind) {
  if (kind === 'hammer') return hammerFoilGeometry();
  if (kind === 'saw') {
    const rostrum = new THREE.ConeGeometry(0.055, 0.30, 6, 1, false);
    rostrum.translate(0, 0.13, 0); return propAttributes(rostrum);
  }
  if (kind === 'crown') return crownGeometry();
  if (kind === 'horns') return hornsGeometry();
  return null;
}
function propAttributes(geometry, feature = 0) {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('rfSlot', new THREE.Float32BufferAttribute(new Float32Array(count).fill(1), 1));
  geometry.setAttribute('rfFeature', new THREE.Float32BufferAttribute(new Float32Array(count).fill(feature), 1));
  return geometry;
}
function hammerFoilGeometry() {
  /* Sharky's bind axes are y=length, z=up, x=depth. The old ShapeGeometry
   * lived in x/y and was therefore edge-on at the gameplay camera. This
   * rounded, slightly swept double-lobe is made in y/z and lofted through x. */
  const shape = new THREE.Shape();
  shape.moveTo(-0.205, 0.000);
  shape.quadraticCurveTo(-0.225, 0.028, -0.190, 0.078);
  shape.lineTo(-0.055, 0.046);
  shape.quadraticCurveTo(0.000, 0.038, 0.055, 0.046);
  shape.lineTo(0.190, 0.078);
  shape.quadraticCurveTo(0.225, 0.028, 0.205, 0.000);
  shape.quadraticCurveTo(0.225, -0.028, 0.190, -0.078);
  shape.lineTo(0.055, -0.046);
  shape.quadraticCurveTo(0.000, -0.038, -0.055, -0.046);
  shape.lineTo(-0.190, -0.078);
  shape.quadraticCurveTo(-0.225, -0.028, -0.205, 0.000);
  shape.closePath();
  const remap = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  const foil = new THREE.ExtrudeGeometry(shape, { depth: 0.10, steps: 1, curveSegments: 6, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.012, bevelThickness: 0.010 });
  foil.translate(0, 0, -0.05); foil.applyMatrix4(remap); propAttributes(foil, 0);
  const eyes = [];
  for (const y of [-0.168, 0.168]) {
    const eye = new THREE.SphereGeometry(0.022, 8, 5).toNonIndexed();
    eye.applyMatrix4(remap); eye.translate(0.058, y, 0.010); propAttributes(eye, 1); eyes.push(eye);
  }
  const geometry = mergeGeometries([foil, ...eyes]); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}
function hornsGeometry() {
  const horns = [];
  for (const x of [-0.075, 0.075]) {
    const horn = new THREE.ConeGeometry(0.065, 0.24, 6, 1, false);
    horn.rotateX(Math.PI * 0.5); horn.rotateY(x < 0 ? -0.24 : 0.24); horn.translate(x, 0.015, 0.11); horns.push(horn);
  }
  const geometry = mergeGeometries(horns); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return propAttributes(geometry);
}
function crownGeometry() {
  const pieces = [new THREE.BoxGeometry(0.12, 0.26, 0.045)];
  pieces[0].translate(0, 0.01, 0.065);
  for (const y of [-0.09, 0, 0.09]) {
    const point = new THREE.ConeGeometry(0.055, 0.18, 5, 1, false);
    point.rotateX(Math.PI * 0.5); point.translate(0, y + 0.01, 0.17); pieces.push(point);
  }
  const geometry = mergeGeometries(pieces); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return propAttributes(geometry);
}
function grinGeometry() {
  const width = 0.18, height = 0.075, positions = [
    -width * 0.5, -height * 0.5, 0, width * 0.5, -height * 0.5, 0, width * 0.5, height * 0.5, 0, -width * 0.5, height * 0.5, 0
  ], indices = [0, 1, 2, 0, 2, 3], teeth = 5;
  const toothWidth = width * 0.12, toothHeight = height * 0.40;
  for (let i = 0; i < teeth; i++) { const x = -width * 0.39 + i * width * 0.195; const base = positions.length / 3; positions.push(x - toothWidth, height * 0.42, 0.002, x + toothWidth, height * 0.42, 0.002, x, height * 0.42 - toothHeight, 0.002); indices.push(base, base + 1, base + 2); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.addGroup(0, 6, 0); geometry.addGroup(6, teeth * 3, 1); return geometry;
}
function makeProp(def, base, headBone, palette) {
  const kind = propKind(def, base), geometry = kind === 'grin' ? grinGeometry() : propGeometry(kind); if (!kind || !geometry || !headBone) return null;
  const material = kind === 'hammer' ? skinMaterial(palette, def, null, 'Hammer Cephalofoil', false, 'hammer') : skinMaterial(palette, def, null, `${kind} anatomical feature`, false);
  const prop = new THREE.Mesh(geometry, material); prop.name = `RF head prop ${kind}`; prop.userData.rfPropKind = kind; prop.userData.rfPropBase = base;
  /* GLB bone matrices carry the armature's authored scale/shear. A non-zero
   * child translation is magnified into a floating prop; the geometry itself
   * owns its small anatomical offset and stays at the bone origin. */
  prop.position.set(0, 0, 0);
  // Prop geometry is authored in the rig's pre-normalized local space. The
  // armature scene carries a large normalization scale, so keep the optional
  // head accent subordinate to the artist mesh (especially the broad hammer
  // foil, which otherwise becomes a camera-filling slab).
  if (kind === 'horns') prop.scale.set(0.9, 0.9, 0.9);
  headBone.add(prop); return prop;
}
function fitProp(prop, body, kind) {
  if (!prop || !body) return;
  prop.updateMatrixWorld(true); body.updateMatrixWorld(true);
  const bodyBox = new THREE.Box3().setFromObject(body), propBox = new THREE.Box3().setFromObject(prop);
  const bodySize = bodyBox.getSize(new THREE.Vector3()), propSize = propBox.getSize(new THREE.Vector3()), current = Math.max(propSize.x, propSize.y, propSize.z, 1e-5);
  if (kind === 'hammer') {
    const bodySpan = Math.max(bodySize.x, 1e-5), projected = Math.max(propSize.x, 1e-5);
    prop.scale.multiplyScalar(clamp((bodySpan * 0.50) / projected, 0.012, 0.55));
    prop.userData.rfFitScale = prop.scale.x;
    return;
  }
  const bodyThickness = Math.max(bodySize.y, bodySize.z, bodySize.x * 0.16), ratio = kind === 'saw' ? 0.46 : kind === 'horns' ? 0.54 : kind === 'crown' ? 0.68 : 0.86;
  prop.scale.multiplyScalar(clamp((bodyThickness * ratio) / current, 0.012, 0.55));
  prop.userData.rfFitScale = prop.scale.x;
}
function propContactGap(body, prop) {
  if (!body || !prop) return Infinity;
  body.updateMatrixWorld(true); prop.updateMatrixWorld(true);
  const bodyBox = new THREE.Box3().setFromObject(body), point = prop.getWorldPosition(new THREE.Vector3());
  const closest = new THREE.Vector3(
    clamp(point.x, bodyBox.min.x, bodyBox.max.x), clamp(point.y, bodyBox.min.y, bodyBox.max.y), clamp(point.z, bodyBox.min.z, bodyBox.max.z)
  );
  const gap = point.distanceTo(closest); prop.userData.rfContactGap = gap; return gap;
}
function propIsMounted(body, prop) {
  if (!body || !prop) return false;
  const bodyBox = new THREE.Box3().setFromObject(body), propBox = new THREE.Box3().setFromObject(prop), size = bodyBox.getSize(new THREE.Vector3());
  const expanded = bodyBox.clone().expandByScalar(Math.max(size.x, size.y, size.z) * 0.025);
  prop.userData.rfBoxContact = expanded.intersectsBox(propBox);
  return prop.userData.rfBoxContact && propContactGap(body, prop) <= Math.max(size.x, size.y, size.z) * 0.08;
}
function mountGrin(prop, pose, body, propBone) {
  if (!prop || prop.userData.rfPropKind !== 'grin' || !pose || !body) return;
  if (propBone?.remove) propBone.remove(prop);
  pose.add(prop);
  body.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(body), size = box.getSize(new THREE.Vector3());
  prop.position.set(box.max.x - size.x * 0.14, box.min.y + size.y * 0.38, box.max.z + Math.max(size.z * 0.012, 0.002));
  prop.rotation.set(0, 0, 0);
  prop.scale.setScalar(Math.max(size.y * 0.52 / 0.18, 0.08));
  prop.userData.rfMountedBone = propBone?.name || 'Head';
}
function scaleOnAxis(root, template, lengthScale, heightScale, depthScale) {
  const scale = new THREE.Vector3(heightScale, heightScale, depthScale);
  if (template.axis === 'x') scale.x = lengthScale; else if (template.axis === 'y') scale.y = lengthScale; else scale.z = lengthScale;
  root.scale.multiply(scale); return scale;
}
function drawCount(root) { let count = 0; root.traverse((o) => { if (o.isMesh && o.visible) count++; }); return count; }
function makePlaceholder(def, group) {
  const material = new THREE.MeshStandardMaterial({ color: paletteOf(def).base, roughness: 0.5, metalness: 0.03 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.36, 0.24), material); mesh.name = 'RF Rev 9 loading placeholder'; group.add(mesh); return mesh;
}

function buildLoadedRig(def, template, group) {
  const palette = paletteOf(def), model = cloneRigScene(template), meshes = findMeshes(model), skinnedMeshes = meshes.filter((mesh) => mesh.isSkinnedMesh), body = skinnedMeshes[0] || meshes[0];
  if (!body) throw new Error(`${def.id}: cloned model has no body`);
  const pose = new THREE.Group(); pose.name = 'RF Rev 9b pose root'; group.add(pose); pose.add(model);
  const headBone = findHeadBone(model, template.key), propBone = findPropBone(model, template.key, propKind(def));
  const head = String(def?.sil?.head || ''), bulky = head === 'whale' || head === 'kaiju';
  const lengthScale = clamp((0.88 + finite(def?.sil?.len, 1) * 0.035 + finite(def?.sil?.girth, 0.34) * 0.24) * (bulky ? 1.06 : 1), 0.85, 1.35);
  const heightScale = clamp(0.91 + finite(def?.sil?.girth, 0.34) * (bulky ? 0.76 : 0.55) + (bulky ? 0.10 : 0), 0.90, 1.30);
  const depthScale = clamp(0.94 + finite(def?.sil?.finScale, 1) * 0.035, 0.90, 1.20);
  scaleOnAxis(model, template, lengthScale, heightScale, depthScale);
  const profile = variantProfile(def), boneProfile = applyVariantBoneProfile(model, template, profile);
  for (const mesh of skinnedMeshes) {
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const atlas = template.key === 'sharky' || sourceMaterials.some((material) => String(material?.name || '') === 'AtlasMaterial');
    const materials = sourceMaterials.map((sourceMaterial) => skinMaterial(palette, def, sourceMaterial, sourceMaterial?.name || '', atlas));
    mesh.material = materials.length === 1 ? materials[0] : materials;
    mesh.userData.rfMaterialSlots = sourceMaterials.map((material) => String(material?.name || 'Body')); mesh.renderOrder = 1;
    if (!mesh.geometry.getAttribute('rfSlot')) mesh.geometry.setAttribute('rfSlot', new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.getAttribute('position').count).fill(1), 1));
  }
  /* 9.6: no BackSide ink shell. Smooth Standard shading supplies the edge
   * separation without the doubled silhouette draw. */
  const shell = null;
  let prop = makeProp(def, template.key, propBone, palette);
  mountGrin(prop, pose, body, propBone);
  fitProp(prop, body, prop?.userData?.rfPropKind);
  if (prop && !propIsMounted(body, prop)) { prop.parent?.remove(prop); prop = null; }
  const mixer = template.isSkinned && template.clips.swim ? new THREE.AnimationMixer(model) : null;
  const actions = {};
  if (mixer) {
    for (const [name, clip] of Object.entries(template.clips)) if (clip) actions[name] = mixer.clipAction(clip);
    if (actions.swim) { actions.swim.setLoop(THREE.LoopRepeat, Infinity).play(); mixer.update(0); }
  }
  model.updateMatrixWorld(true);
  const rawBox = measureBox(group), rawLength = Math.max(rawBox.max.x - rawBox.min.x, 1e-5), targetLength = BASE_LENGTH * clamp(finite(def?.sil?.len, 1), 0.5, 3);
  const worldScale = targetLength / rawLength; group.scale.setScalar(worldScale);
  if (prop?.userData?.rfPropKind === 'grin') {
    group.updateMatrixWorld(true);
    const bodyBox = new THREE.Box3().setFromObject(body), grinBox = new THREE.Box3().setFromObject(prop);
    prop.position.z += (bodyBox.max.z - grinBox.min.z + 0.06) / Math.max(group.scale.x, 1e-5);
  }
  group.userData.baseScale = worldScale; group.userData.rfBodyLen = targetLength; group.userData.rfWorldLength = targetLength;
  group.userData.rfMeasuredLength = measureBox(group).max.x - measureBox(group).min.x; group.userData.rfRawLength = rawLength;
  group.userData.rfArmatureScale = { length: lengthScale, height: heightScale, depth: depthScale };
  group.userData.rfScaleBounds = { length: [0.85, 1.35], height: [0.90, 1.30], depth: [0.90, 1.20] };
  group.userData.rfVariantProfile = { shapeTag: profile.shapeTag, lane: profile.lane, patternScale: profile.patternScale, boneProfile };
  group.userData.rfSourceBase = template.key; group.userData.rfPattern = String(def?.sil?.pattern || 'plain'); group.userData.rfPatternId = patternId(def);
  group.userData.rfMixerClipName = template.clips.swim?.name || template.clip?.name || null; group.userData.rfFastClipName = template.clips.fast?.name || null; group.userData.rfBiteClipName = template.clips.bite?.name || null;
  group.userData.rfHeadBone = headBone?.name || null; group.userData.rfPropBone = propBone?.name || null; group.userData.rfPropKind = prop?.userData?.rfPropKind || null;
  group.userData.rfPropAllowlisted = !prop || PROP_ALLOWLIST_IDS.has(String(def?.id || ''));
  group.userData.rfPropContactGap = prop ? finite(prop.userData.rfContactGap, Infinity) : 0;
  group.userData.rfVisibleDrawCalls = drawCount(group); group.userData.rfPaletteRaw = palette.raw; group.userData.rfPaletteResolved = palette.resolved; group.userData.rfIsSkinned = !!body.isSkinnedMesh;
  group.userData.rfSlotNames = template.slotNames.slice(); group.userData.rfAtlasMask = template.key === 'sharky' ? 'white atlas luminance; Eyes/Teeth slots stay source-colored' : 'Eyes/Teeth material slots'; group.userData.rfLoading = false;
  const animation = { lastT: null, bite: 0, turn: 0, death: 0, active: 'swim', biteActive: false, biteLatched: false };
  const baseHeadQuaternion = headBone?.quaternion.clone(), neckBone = model.getObjectByName('Neck') || model.getObjectByName('Main5'), baseNeckQuaternion = neckBone?.quaternion.clone();
  const jawBone = model.getObjectByName('LowerJaw'), baseJawQuaternion = jawBone?.quaternion.clone();
  group.userData.rfJawRestGape = jawBone ? JAW_REST_GAPE : 0;
  group.userData.rfJawMaxRotation = jawBone ? JAW_MAX_ROTATION : 0;
  group.userData.rfJawGape = jawBone ? JAW_REST_GAPE : 0;
  function crossfadeTo(name) {
    const next = actions[name], current = actions[animation.active]; if (!next || next === current) return;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.16); if (current) current.fadeOut(0.16); next.play(); animation.active = name;
  }
  function startBite() {
    if (!actions.bite || animation.biteActive) return;
    const current = actions[animation.active]; actions.bite.reset().setLoop(THREE.LoopOnce, 1); actions.bite.clampWhenFinished = true; actions.bite.fadeIn(0.06); if (current) current.fadeOut(0.06); actions.bite.play(); animation.biteActive = true;
  }
  function animate(t = 0, input = {}) {
    const time = finite(t, 0), speedFrac = clamp(finite(input.speedFrac, 0), 0, 1), turn = clamp(finite(input.turn, 0), -1, 1);
    const dt = animation.lastT === null ? 0 : clamp(time - animation.lastT, 0, 0.25); animation.lastT = time;
    const dead = !!(input.dead || input.death || input.dying), biteWant = !!(input.biting || finite(input.lungeT, 0) > 0 || finite(input.bitePhase, 0) > 0.65 || finite(input.jawSnapT, 0) > 0);
    if (biteWant && !animation.biteLatched) startBite(); animation.biteLatched = biteWant;
    if (mixer) {
      mixer.timeScale = dead ? 0 : 0.55 + 1.65 * speedFrac;
      if (!animation.biteActive) crossfadeTo(speedFrac > 0.65 ? 'fast' : 'swim');
      if (dt > 0) mixer.update(dt);
      if (animation.biteActive && actions.bite && actions.bite.time >= Math.max(0.01, actions.bite.getClip().duration - 0.025)) { actions.bite.stop(); animation.biteActive = false; animation.active = 'swim'; crossfadeTo(speedFrac > 0.65 ? 'fast' : 'swim'); }
    }
    const ease = 1 - Math.exp(-Math.max(dt, 1 / 120) * 8), biteEase = 1 - Math.exp(-Math.max(dt, 1 / 120) * 16);
    animation.turn += (turn - animation.turn) * ease; animation.bite += ((biteWant ? 1 : clamp(finite(input.jawOpen, 0), 0, 1)) - animation.bite) * biteEase;
    animation.death += ((dead ? 1 : 0) - animation.death) * (1 - Math.exp(-Math.max(dt, 1 / 120) * 7));
    pose.rotation.y = animation.turn * 0.14; pose.rotation.x = -animation.turn * 0.11 + animation.death * Math.sin(Math.min(time * 5, Math.PI) * 0.5) * 1.1; pose.rotation.z = animation.death * Math.PI * 0.5;
    const pulse = 1 + animation.bite * 0.055; pose.scale.set(pulse * (1 + 0.025 * speedFrac), pulse, pulse);
    if (headBone && baseHeadQuaternion) { headBone.quaternion.copy(baseHeadQuaternion); headBone.rotateZ(-animation.turn * 0.16); headBone.rotateX(-animation.bite * 0.10); }
    if (neckBone && baseNeckQuaternion) { neckBone.quaternion.copy(baseNeckQuaternion); neckBone.rotateZ(-animation.turn * 0.09); }
    const jawGape = jawBone ? JAW_REST_GAPE + animation.bite * (1 - JAW_REST_GAPE) : 0;
    group.userData.rfJawGape = jawGape;
    if (jawBone && baseJawQuaternion) { jawBone.quaternion.copy(baseJawQuaternion); jawBone.rotateX(-jawGape * JAW_MAX_ROTATION); }
  }
  if (jawBone && baseJawQuaternion) { jawBone.quaternion.copy(baseJawQuaternion); jawBone.rotateX(-JAW_REST_GAPE * JAW_MAX_ROTATION); }
  if (prop?.userData?.rfPropKind === 'hammer') {
    group.updateMatrixWorld(true);
    const bodyBox = new THREE.Box3().setFromObject(body), propBox = new THREE.Box3().setFromObject(prop);
    group.userData.rfHammerProjectedSpan = (propBox.max.x - propBox.min.x) / Math.max(bodyBox.max.x - bodyBox.min.x, 1e-5);
  }
  return { body, shell, prop, pose, model, mixer, animate };
}

function installEffects(record, body) {
  const group = record.group, materials = body ? (Array.isArray(body.material) ? body.material : [body.material]) : [], emissiveMaterial = materials.find((material) => material?.emissive) || null;
  const baseEmissive = emissiveMaterial?.emissive ? emissiveMaterial.emissive.clone() : new THREE.Color(0, 0, 0), baseIntensity = finite(emissiveMaterial?.emissiveIntensity, 0);
  group.userData.rfArcs = (on, color = 0x27e0ff) => { for (const material of materials) if (material?.emissive) { if (on) material.emissive.copy(colorValue(color)).multiplyScalar(0.5); else material.emissive.copy(baseEmissive); } };
  let flashTime = 0, flashDur = 0, flashColor = new THREE.Color(0, 0, 0), flashIntensity = 0, lastT = null;
  group.userData.rfFlash = (color = 0xff2bd6, dur = 0.18, intensity = 1) => { flashColor.copy(colorValue(color)); flashDur = Math.max(0.001, finite(dur, 0.18)); flashTime = flashDur; flashIntensity = clamp(finite(intensity, 1), 0, 1); };
  const originalAnimate = record.animate;
  record.animate = (t, input = {}) => {
    originalAnimate(t, input);
    const time = finite(t, 0), dt = lastT === null ? 0 : clamp(time - lastT, 0, 0.25); lastT = time;
    if (flashTime > 0) {
      flashTime = Math.max(0, flashTime - dt);
      for (const material of materials) if (material?.emissive) { material.emissive.copy(baseEmissive).lerp(flashColor, (flashTime / flashDur) * flashIntensity); material.emissiveIntensity = baseIntensity + (0.9 - baseIntensity) * (flashTime / flashDur) * flashIntensity; }
    } else for (const material of materials) if (material?.emissive) { material.emissive.copy(baseEmissive); material.emissiveIntensity = baseIntensity; }
  };
}
function placeholderRig(def, base) {
  const group = new THREE.Group(); group.name = `RF Shark ${def?.id || 'unknown'}`; group.userData.rfSharkId = String(def?.id || 'unknown');
  group.userData.rfSourceBase = base; group.userData.rfLoading = true; group.userData.rfPattern = String(def?.sil?.pattern || 'plain'); group.userData.rfPaletteResolved = paletteOf(def).resolved;
  const placeholder = makePlaceholder(def, group), target = BASE_LENGTH * clamp(finite(def?.sil?.len, 1), 0.5, 3); group.scale.setScalar(target); group.userData.baseScale = target;
  let live = null, lastT = null;
  const record = { group, parts: { body: placeholder, jaw: null, shell: null, prop: null }, animate(t, input) { if (live) live.animate(t, input); } };
  group.userData.rfArcs = () => {}; group.userData.rfFlash = () => {};
  (preloadPromise || preload()).then(() => {
    if (live || !modelCache.has(base)) return;
    live = buildLoadedRig(def, modelCache.get(base), group); record.parts = { body: live.body, jaw: null, shell: live.shell, prop: live.prop }; group.userData.rfLoading = false;
    if (placeholder.parent) placeholder.parent.remove(placeholder); installEffects(record, live.body); void lastT;
  }).catch(() => {});
  return record;
}
function buildShark(def) {
  if (!def) throw new Error('RF.Art3D.buildShark requires a shark definition');
  const base = baseForDef(def); baseSelection.set(String(def.id || ''), base); const template = modelCache.get(base);
  if (!template) return placeholderRig(def, base);
  const group = new THREE.Group(); group.name = `RF Shark ${def.id || 'unknown'}`; group.userData.rfSharkId = String(def.id || 'unknown');
  const live = buildLoadedRig(def, template, group), record = { group, parts: { body: live.body, jaw: null, shell: live.shell, prop: live.prop }, animate: live.animate };
  group.userData.rfArchetype = String(def?.sil?.head || 'point'); installEffects(record, live.body); return record;
}

/* Small billboard helper remains because world3d uses it for guarded fallback
 * prey paths. The old bend API is a harmless compatibility shim. */
function billboardMaterialFor(input) {
  let key = '', canvas = null;
  if (input && typeof input.getContext === 'function') { canvas = input; if (billboardIds) { if (!billboardIds.has(canvas)) billboardIds.set(canvas, `canvas-${nextBillboardId++}`); key = billboardIds.get(canvas); } else key = `canvas-${nextBillboardId++}`; }
  else if (input?.isTexture) key = `texture-${input.uuid}`; else key = String(input || 'missing');
  if (billboardMaterials.has(key)) return billboardMaterials.get(key);
  let texture = input?.isTexture ? input : null;
  if (!texture && canvas) { texture = new THREE.CanvasTexture(canvas); texture.needsUpdate = true; }
  if (!texture) { texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat); texture.needsUpdate = true; }
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.02, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }); billboardMaterials.set(key, material); return material;
}
function billboard(input) { if (!sharedPlaneGeometry) sharedPlaneGeometry = new THREE.PlaneGeometry(1, 1); return new THREE.Mesh(sharedPlaneGeometry, billboardMaterialFor(input)); }
function bendableMaterial(baseMaterial) { return baseMaterial || null; }
function bendOffset() { return 0; }

/* Headless GLB path. It reads only the JSON and BIN chunks, which keeps the
 * art selftest synchronous and avoids fetch/FileReader in Node. */
function isNodeRuntime() { return typeof process !== 'undefined' && !!process.versions?.node && typeof process.getBuiltinModule === 'function'; }
function decodeGlb(filePath) {
  const fs = process.getBuiltinModule('fs'), bytes = fs.readFileSync(filePath); if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${filePath}: bad GLB magic`);
  let offset = 12, json = null, bin = null;
  while (offset < bytes.length) { const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4), chunk = bytes.subarray(offset + 8, offset + 8 + length); if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)); else if (type === 0x004e4942) bin = chunk; offset += 8 + length; }
  if (!json || !bin) throw new Error(`${filePath}: missing GLB chunk`); return { json, bin };
}
const COMPONENTS = Object.freeze({ 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] });
const TYPE_WIDTH = Object.freeze({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 });
function readAccessor(doc, index) {
  const accessor = doc.json.accessors[index], view = doc.json.bufferViews[accessor.bufferView], [Ctor, bytes] = COMPONENTS[accessor.componentType], width = TYPE_WIDTH[accessor.type], stride = view.byteStride || bytes * width, base = (view.byteOffset || 0) + (accessor.byteOffset || 0), data = new DataView(doc.bin.buffer, doc.bin.byteOffset, doc.bin.byteLength), values = new Array(accessor.count * width);
  const getter = Ctor === Float32Array ? 'getFloat32' : Ctor === Uint32Array ? 'getUint32' : Ctor === Uint16Array ? 'getUint16' : Ctor === Uint8Array ? 'getUint8' : Ctor === Int16Array ? 'getInt16' : 'getInt8';
  for (let i = 0; i < accessor.count; i++) for (let c = 0; c < width; c++) { let value = data[getter](base + i * stride + c * bytes, getter !== 'getUint8' && getter !== 'getInt8'); if (accessor.normalized) value /= Ctor === Uint8Array ? 255 : Ctor === Uint16Array ? 65535 : Ctor === Int8Array ? 127 : 32767; values[i * width + c] = value; }
  return { values, count: accessor.count, width };
}
function parsedGeometry(doc, mesh) {
  const pos = [], normal = [], uv = [], joints = [], weights = [], slots = [], indices = [], groups = [];
  for (const primitive of mesh.primitives) {
    const position = readAccessor(doc, primitive.attributes.POSITION).values, normals = primitive.attributes.NORMAL == null ? null : readAccessor(doc, primitive.attributes.NORMAL).values, texcoord = primitive.attributes.TEXCOORD_0 == null ? null : readAccessor(doc, primitive.attributes.TEXCOORD_0).values, skinIndex = primitive.attributes.JOINTS_0 == null ? null : readAccessor(doc, primitive.attributes.JOINTS_0).values, skinWeight = primitive.attributes.WEIGHTS_0 == null ? null : readAccessor(doc, primitive.attributes.WEIGHTS_0).values;
    const vertexCount = position.length / 3, baseVertex = pos.length / 3;
    for (let i = 0; i < vertexCount; i++) { pos.push(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]); normal.push(normals ? normals[i * 3] : 0, normals ? normals[i * 3 + 1] : 1, normals ? normals[i * 3 + 2] : 0); uv.push(texcoord ? texcoord[i * 2] : 0, texcoord ? texcoord[i * 2 + 1] : 0); for (let c = 0; c < 4; c++) joints.push(skinIndex ? skinIndex[i * 4 + c] : 0); for (let c = 0; c < 4; c++) weights.push(skinWeight ? skinWeight[i * 4 + c] : c === 0 ? 1 : 0); slots.push(primitive.material || 0); }
    const indexValues = primitive.indices == null ? Array.from({ length: vertexCount }, (_, i) => i) : readAccessor(doc, primitive.indices).values, start = indices.length; for (const value of indexValues) indices.push(baseVertex + value); groups.push({ start, count: indexValues.length, materialIndex: primitive.material || 0 });
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4)); geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4)); geometry.setAttribute('rfSlot', new THREE.Float32BufferAttribute(slots, 1)); geometry.setIndex(indices); for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.userData.rfSlotNames = (doc.json.materials || []).map((m) => String(m.name || 'Body')); return geometry;
}
function directTemplate(key, filePath) {
  const doc = decodeGlb(filePath), json = doc.json, jointSet = new Set((json.skins?.[0]?.joints || []).map(Number));
  const objects = json.nodes.map((node, index) => { const object = jointSet.has(index) ? new THREE.Bone() : new THREE.Object3D(); object.name = node.name || `node${index}`; if (node.matrix) object.matrix.fromArray(node.matrix).decompose(object.position, object.quaternion, object.scale); else { if (node.translation) object.position.fromArray(node.translation); if (node.rotation) object.quaternion.fromArray(node.rotation); if (node.scale) object.scale.fromArray(node.scale); } object.userData.rfNodeIndex = index; return object; });
  for (const [index, node] of json.nodes.entries()) for (const child of node.children || []) objects[index].add(objects[child]);
  const scene = new THREE.Group(); scene.name = json.scenes?.[0]?.name || 'RootNode'; for (const root of json.scenes?.[0]?.nodes || []) scene.add(objects[root]);
  const sourceMaterials = (json.materials || []).map((material) => { const out = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.03, flatShading: false }); out.name = String(material.name || 'Body'); out.userData.rfAtlas = out.name === 'AtlasMaterial'; return out; });
  for (const [index, node] of json.nodes.entries()) if (node.mesh != null) { const geometry = parsedGeometry(doc, json.meshes[node.mesh]), material = sourceMaterials.length ? sourceMaterials : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.03 }); let body; if (node.skin == null) body = new THREE.Mesh(geometry, material); else { body = new THREE.SkinnedMesh(geometry, material); const skin = json.skins[node.skin], inverse = readAccessor(doc, skin.inverseBindMatrices).values; const matrices = []; for (let i = 0; i < skin.joints.length; i++) matrices.push(new THREE.Matrix4().fromArray(inverse, i * 16)); body.bind(new THREE.Skeleton(skin.joints.map((joint) => objects[joint]), matrices)); } body.name = node.name || `${key} body`; objects[index].add(body); }
  const animations = [];
  for (const animation of json.animations || []) { const tracks = []; for (const channel of animation.channels || []) { const sampler = animation.samplers[channel.sampler], input = readAccessor(doc, sampler.input).values, output = readAccessor(doc, sampler.output).values, name = json.nodes[channel.target.node].name || `node${channel.target.node}`; if (channel.target.path === 'rotation') tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, input, output)); else if (channel.target.path === 'translation') tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, input, output)); else if (channel.target.path === 'scale') tracks.push(new THREE.VectorKeyframeTrack(`${name}.scale`, input, output)); } animations.push(new THREE.AnimationClip(animation.name || `${key} animation`, -1, tracks)); }
  return prepareTemplate(scene, animations, key);
}
function nodeAssetPath(file) { const path = process.getBuiltinModule('path'); return path.resolve(path.dirname(new URL(import.meta.url).pathname), 'assets/models', file); }
function loadBrowserTemplate(key) { return new Promise((resolve, reject) => { new GLTFLoader().load(assetUrl(MODEL_FILES[key]), (gltf) => { try { resolve(prepareTemplate(gltf.scene, gltf.animations, key)); } catch (error) { reject(error); } }, undefined, reject); }); }
function preload() {
  if (preloadPromise) return preloadPromise;
  if (isNodeRuntime()) { try { for (const key of MODEL_KEYS) modelCache.set(key, directTemplate(key, nodeAssetPath(MODEL_FILES[key]))); preloadPromise = Promise.resolve(modelCache); } catch (error) { preloadError = error; preloadPromise = Promise.reject(error); } }
  else if (typeof document !== 'undefined' && typeof fetch === 'function') preloadPromise = Promise.all(MODEL_KEYS.map((key) => loadBrowserTemplate(key).then((template) => { modelCache.set(key, template); return template; }))).then(() => modelCache);
  else preloadPromise = Promise.resolve(modelCache);
  return preloadPromise;
}

function renderedTintSignature(def) {
  const palette = paletteOf(def);
  const sample = (color, detail) => {
    const c = color.clone().multiplyScalar(detail), hsv = rgbToHsv(c);
    return [hsv.h, hsv.s, hsv.v].map((value) => value.toFixed(4)).join(',');
  };
  return [sample(palette.base, 0.82), sample(palette.belly, 0.94), sample(palette.accent, 0.98)].join('|');
}
function renderedVariantSignature(def) {
  const profile = variantProfile(def), shape = [profile.shapeTag, ...profile.head, ...profile.abdomen, ...profile.tail, ...profile.tailUpper, ...profile.fin].map((value) => typeof value === 'number' ? value.toFixed(3) : value).join(',');
  return `${renderedTintSignature(def)}|${shape}|p${patternId(def)}|e${profile.eyeColor.getHexString()}`;
}

function __selftest() {
  const result = { pass: false, notes: [], errors: [], checked: 0, cache: [], baseMap: {}, drawCounts: {}, lengths: {}, tintSignatures: {}, variantSignatures: {}, props: {}, jawGape: {}, hammerSpan: {}, actDistinctness: {} };
  try {
    const allRows = rows(); if (allRows.length !== 85) throw new Error(`expected 85 sharks, received ${allRows.length}`); if (preloadError) throw preloadError; if (modelCache.size < MODEL_KEYS.length) throw new Error(`model cache has ${modelCache.size}/${MODEL_KEYS.length} GLBs`);
    result.cache = Array.from(modelCache.keys()).sort();
    for (const def of allRows) {
      const base = baseForDef(def), rig = buildShark(def), group = rig.group, body = rig.parts.body;
      if (!(group instanceof THREE.Group) || !body?.isSkinnedMesh || typeof rig.animate !== 'function') throw new Error(`${def.id}: incomplete GLB rig contract`);
      if (rig.parts.jaw !== null) throw new Error(`${def.id}: jaw must remain null`); if (group.userData.rfSourceBase !== base) throw new Error(`${def.id}: base mapping is ${group.userData.rfSourceBase}, expected ${base}`); if (group.userData.rfLoading) throw new Error(`${def.id}: placeholder remained after node preload`);
      if (group.userData.rfPropKind && !PROP_ALLOWLIST_IDS.has(def.id)) throw new Error(`${def.id}: prop ${group.userData.rfPropKind} is not in the Rev 10 allowlist`);
      if (!group.userData.rfPropAllowlisted) throw new Error(`${def.id}: prop allowlist gate failed`);
      if (group.userData.rfPropKind && group.userData.rfPropContactGap > 0.08) throw new Error(`${def.id}: ${group.userData.rfPropKind} mount gap ${group.userData.rfPropContactGap.toFixed(4)} is not fitted to the head`);
      if (!group.userData.rfMixerClipName || !/swim|swimming/i.test(group.userData.rfMixerClipName)) throw new Error(`${def.id}: Swim clip missing`);
      if (!group.userData.rfFastClipName || !group.userData.rfBiteClipName) throw new Error(`${def.id}: fast/bite clip mapping missing`);
      const scales = group.userData.rfArmatureScale; if (scales.length < 0.85 || scales.length > 1.35 || scales.height < 0.90 || scales.height > 1.30 || scales.depth < 0.90 || scales.depth > 1.20) throw new Error(`${def.id}: bounded scale failed`);
      const draws = drawCount(group); if (draws > 3) throw new Error(`${def.id}: ${draws} draws exceeds Rev 9 budget`);
      if (rig.parts.shell !== null || group.getObjectByName('RF Rev 9b contour shell')) throw new Error(`${def.id}: contour shell survived 9.6 style gate`);
      const allMaterials = [];
      group.traverse((object) => { if (object.isMesh) for (const material of (Array.isArray(object.material) ? object.material : [object.material])) if (material) allMaterials.push(material); });
      if (allMaterials.some((material) => material.type === 'MeshToonMaterial' || material.gradientMap)) throw new Error(`${def.id}: toon material/gradient survived 9.6 style gate`);
      const bodyMaterials = Array.isArray(body.material) ? body.material : [body.material];
      if (bodyMaterials.some((material) => material.type !== 'MeshStandardMaterial' || material.flatShading || material.roughness < 0.42 || material.roughness > 0.62)) throw new Error(`${def.id}: smooth Standard specular material gate failed`);
      const target = BASE_LENGTH * clamp(finite(def.sil?.len, 1), 0.5, 3), worldBox = measureBox(group), measured = worldBox.max.x - worldBox.min.x; if (Math.abs(measured - target) > 1e-4) throw new Error(`${def.id}: bbox X ${measured} != ${target}`);
      const material = (Array.isArray(body.material) ? body.material : [body.material]).find((entry) => typeof entry?.onBeforeCompile === 'function'); if (!material || typeof material.customProgramCacheKey !== 'function' || !material.customProgramCacheKey().endsWith(PATTERN_SUFFIX)) throw new Error(`${def.id}: pattern shader hook missing`);
      const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' }; material.onBeforeCompile(shader); for (const uniform of SHADER_UNIFORMS) if (!shader.uniforms[uniform]) throw new Error(`${def.id}: shader uniform ${uniform} missing`);
      rig.animate(0, { speedFrac: 0, turn: 0 });
      const cruiseGape = finite(group.userData.rfJawGape, 0);
      if (group.userData.rfJawMaxRotation > 0 && (cruiseGape < 0.20 || cruiseGape > 0.35)) throw new Error(`${def.id}: cruise jaw gape ${cruiseGape.toFixed(3)} outside 20-35%`);
      rig.animate(0.25, { speedFrac: 1, turn: 0, biting: true, jawOpen: 1, lungeT: 0.2 });
      const biteGape = finite(group.userData.rfJawGape, 0);
      if (group.userData.rfJawMaxRotation > 0 && biteGape < 0.85) throw new Error(`${def.id}: bite jaw snap only reached ${biteGape.toFixed(3)}`);
      if (group.userData.rfPropKind === 'hammer' && finite(group.userData.rfHammerProjectedSpan, 0) < 0.42) throw new Error(`${def.id}: hammer foil span ${group.userData.rfHammerProjectedSpan.toFixed(3)} < 0.42 body length`);
      result.jawGape[def.id] = { cruise: Number(cruiseGape.toFixed(3)), bite: Number(biteGape.toFixed(3)) };
      if (group.userData.rfPropKind === 'hammer') result.hammerSpan[def.id] = Number(group.userData.rfHammerProjectedSpan.toFixed(3));
      if (group.userData.rfPatternId !== patternId(def)) throw new Error(`${def.id}: pattern mapping missing`);
      result.tintSignatures[def.id] = renderedTintSignature(def);
      result.variantSignatures[def.id] = renderedVariantSignature(def);
      result.props[def.id] = group.userData.rfPropKind || null;
      result.checked++; result.baseMap[def.id] = base; result.drawCounts[def.id] = draws; result.lengths[def.id] = Number(measured.toFixed(4));
    }
    if (result.baseMap.goblin !== 'goblinshark' || result.baseMap.gulperfiend !== 'anglerfish' || result.baseMap.reef !== 'sharky') throw new Error('base table did not select sharky/goblinshark/anglerfish as required');
    const uniqueTints = new Set(Object.values(result.tintSignatures));
    if (uniqueTints.size !== allRows.length) throw new Error(`rendered tint distinctness ${uniqueTints.size}/${allRows.length}`);
    for (const act of new Set(allRows.map((def) => def.act))) {
      const actRows = allRows.filter((def) => def.act === act), unique = new Set(actRows.map((def) => result.variantSignatures[def.id]));
      result.actDistinctness[act] = { rows: actRows.length, unique: unique.size };
      if (unique.size !== actRows.length) throw new Error(`act ${act} variant signatures ${unique.size}/${actRows.length}`);
    }
    const showcase = ['reef', 'tiger', 'hammerhead', 'greatwhite', 'whaleshark', 'leviathanrex', 'zeusfin', 'typhonmaw'];
    if (new Set(showcase.map((id) => result.tintSignatures[id])).size !== showcase.length) throw new Error('showcase rendered tint signatures are not pairwise distinct');
    result.notes.push('Rev 10: all 85 definitions retain the approved Rev 9b/9c base, shading, jaw, and tint path. Identity is now welded per-bone shape + readable pattern/eye/glow family; props are allowlisted anatomical exceptions only.');
    result.notes.push('Skin3 samples the atlas as luminance/detail, paints explicit top/belly/accent palette regions, and preserves atlas-owned teeth, pupil/cavity, and mouth pixels. Named showcase overrides enforce blue-gray reef, tan striped tiger, slate great-white, and distinct pantheon families.');
    result.notes.push('9.6 gates: MeshStandardMaterial only, smooth normals, roughness 0.50 body specular lighting, no BackSide contour shell, 28% cruise jaw gape with full bite snap, and hammer foil >=0.42 body span.');
    result.notes.push('Rev 10 gates: no non-allowlisted prop, every retained prop is head-contact fitted, and every act has pairwise-unique variant signatures. Browser render audit additionally measures pairwise pixel distance from the 85-row contact sheet.');
    result.notes.push('Node selftest parses GLB JSON+BIN directly and intentionally skips image decoding; preload is idempotent and bbox X is measured after the initial posed clip at 96*sil.len.'); result.pass = true;
  } catch (error) { result.errors.push(error?.message || String(error)); result.notes.push(`FAIL ${error?.message || String(error)}`); }
  return result;
}

const Art3D = RF.Art3D || {};
Art3D.buildShark = buildShark; Art3D.preload = preload; Art3D.bendableMaterial = bendableMaterial; Art3D.bendOffset = bendOffset; Art3D.billboard = billboard; Art3D.paletteOf = paletteOf; Art3D.__selftest = __selftest;
Art3D.stats = () => ({ models: modelCache.size, modelKeys: Array.from(modelCache.keys()), billboardMaterials: billboardMaterials.size, preloadError: preloadError?.message || null });
Art3D.releaseShark = () => {};
RF.Art3D = Art3D;
preload();

export { Art3D, bendableMaterial, bendOffset, billboard, buildShark, paletteOf, preload, __selftest };
export default Art3D;
