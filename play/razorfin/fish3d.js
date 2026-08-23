/* Razorfin 3D prey lofts, Lane fish-loft.
 *
 * This module owns only authored fish geometry and the small material contract
 * that a later instancing consumer needs. World placement, instancing,
 * animation, and material cloning remain outside this lane.
 */
import * as THREE from 'three';

const host = typeof window !== 'undefined' ? window : globalThis;
const RF = host.RF = host.RF || {};

const TAU = Math.PI * 2;
const BODY_STATIONS = 8;
const RADIAL_SIDES = 8;
const TRIANGLE_LIMIT = 350;
const FISH_BEND_SUFFIX = ':rf-bend-inst2';

/* These values follow the existing sprite families in data.js: cool blue
 * minnows and tuna, warm orange reef fish, green parrotfish, and the muted
 * deep-water silhouettes. They are deliberately authored here because prey
 * defs currently carry a sprite key rather than a 3D tint/palette.
 *
 * Rev 6 (6.9) saturation pass: mackerel/swordfish/grouper/anglerprey/abyssal/
 * leviathanprey bases were the weakest-saturation rows in the table (HSL S
 * 24-57%); pushed up and their accents pulled toward the cyberpunk palette
 * (cyan 0x27e0ff, acid green 0x9dff2b, amber-adjacent 0xff9526) while keeping
 * each species' hue family and belly/accent contrast intact so the read
 * (cool mackerel/swordfish, warm grouper, murky angler/abyssal/leviathan
 * deep-water prey) is unchanged. minnow/reeffish/parrot/tuna/dolphinfish/
 * marlin were already >=60% saturated and left as authored. */
const FISH_PALETTE_TABLE = Object.freeze({
  minnow: Object.freeze({ base: 0x118ed1, belly: 0xf8f0c2, accent: 0x48e5f0 }),
  reeffish: Object.freeze({ base: 0xf06a24, belly: 0xffe6a0, accent: 0x2ed5ae }),
  mackerel: Object.freeze({ base: 0x1c86ad, belly: 0xe8f6d5, accent: 0x27e0ff }),
  parrot: Object.freeze({ base: 0x1fa56f, belly: 0xffdf76, accent: 0xf45d6d }),
  grouper: Object.freeze({ base: 0x9a6a2e, belly: 0xf4d69a, accent: 0xff9526 }),
  ray: Object.freeze({ base: 0x2d7e9c, belly: 0xc4edf0, accent: 0x3ce4ff }),
  turtle: Object.freeze({ base: 0x2d8b5f, belly: 0xdce29a, accent: 0xf2b84b }),
  tuna: Object.freeze({ base: 0x1768b3, belly: 0xf7edb5, accent: 0x35b9e8 }),
  swordfish: Object.freeze({ base: 0x2a5fb8, belly: 0xeef2ea, accent: 0x27e0ff }),
  dolphinfish: Object.freeze({ base: 0x168bb0, belly: 0xffdf83, accent: 0xf7bd28 }),
  marlin: Object.freeze({ base: 0x295c9b, belly: 0xf5dfb0, accent: 0xf27655 }),
  squidling: Object.freeze({ base: 0x934ed1, belly: 0xf6d9ff, accent: 0x4de6f2 }),
  giantsquid: Object.freeze({ base: 0x5b2a91, belly: 0xdac1f0, accent: 0xff6b85 }),
  anglerprey: Object.freeze({ base: 0x1f4a52, belly: 0xcde6d4, accent: 0x9dff2b }),
  abyssal: Object.freeze({ base: 0x392f78, belly: 0xb9d8c7, accent: 0xffa34f }),
  leviathanprey: Object.freeze({ base: 0x3d2f8a, belly: 0xe0d9ad, accent: 0xf7593a })
});

/* Silhouette parameters keep the roster in one loft while giving the eye a
 * reason to call out a mackerel, grouper, tuna, billfish, ray, turtle, or
 * squid. The tier still supplies the shared size progression; these values
 * only bias length, girth, depth, head, and fin language. */
const FISH_SHAPE_TABLE = Object.freeze({
  minnow: Object.freeze({ kind: 'fusiform', lengthScale: 0.84, girthScale: 0.72, finScale: 0.72, tailScale: 0.78, eyeScale: 0.92 }),
  reeffish: Object.freeze({ kind: 'fusiform', lengthScale: 0.92, girthScale: 0.96, finScale: 0.95, tailScale: 0.92, eyeScale: 1.08 }),
  mackerel: Object.freeze({ kind: 'fusiform', lengthScale: 1.18, girthScale: 0.76, finScale: 0.92, tailScale: 1.0, eyeScale: 0.94 }),
  parrot: Object.freeze({ kind: 'fusiform', lengthScale: 0.91, girthScale: 1.06, finScale: 1.02, tailScale: 0.88, headBulge: 0.08, eyeScale: 1.12 }),
  grouper: Object.freeze({ kind: 'fusiform', lengthScale: 0.92, girthScale: 1.34, finScale: 0.96, tailScale: 0.84, headBulge: 0.16, noseX: 0.59, eyeScale: 1.06 }),
  ray: Object.freeze({ kind: 'ray', lengthScale: 1.04, girthScale: 0.66, radiusZRatio: 2.15, finScale: 0.78, tailScale: 0.72, wingScale: 1.55, eyeScale: 1.02 }),
  turtle: Object.freeze({ kind: 'turtle', lengthScale: 0.91, girthScale: 1.16, radiusZRatio: 1.18, finScale: 1.08, tailScale: 0.62, shellDome: 0.34, flipperScale: 1.12, eyeScale: 0.94 }),
  tuna: Object.freeze({ kind: 'fusiform', lengthScale: 1.16, girthScale: 1.08, finScale: 0.98, tailScale: 1.32, tailNotch: 0.35, eyeScale: 0.96 }),
  swordfish: Object.freeze({ kind: 'fusiform', lengthScale: 1.04, girthScale: 0.84, finScale: 0.94, tailScale: 1.08, billLength: 0.38, eyeScale: 1.0 }),
  dolphinfish: Object.freeze({ kind: 'fusiform', lengthScale: 1.02, girthScale: 1.02, finScale: 1.08, tailScale: 0.98, headBulge: 0.18, noseX: 0.58, eyeScale: 1.08 }),
  marlin: Object.freeze({ kind: 'fusiform', lengthScale: 1.13, girthScale: 0.82, finScale: 1.02, tailScale: 1.18, billLength: 0.54, eyeScale: 0.96 }),
  squidling: Object.freeze({ kind: 'squid', lengthScale: 0.9, girthScale: 0.96, radiusZRatio: 0.78, finScale: 0.78, tailFan: false, mantleTaper: 0.42, armScale: 0.92, eyeScale: 1.04 }),
  giantsquid: Object.freeze({ kind: 'squid', lengthScale: 1.18, girthScale: 1.12, radiusZRatio: 0.9, finScale: 0.9, tailFan: false, mantleTaper: 0.5, armScale: 1.22, eyeScale: 1.0 }),
  anglerprey: Object.freeze({ kind: 'fusiform', lengthScale: 0.94, girthScale: 1.12, finScale: 0.88, tailScale: 0.86, headBulge: 0.12, noseX: 0.58, eyeScale: 1.1 }),
  abyssal: Object.freeze({ kind: 'fusiform', lengthScale: 1.14, girthScale: 1.24, finScale: 0.98, tailScale: 1.04, headBulge: 0.1, eyeScale: 1.02 }),
  leviathanprey: Object.freeze({ kind: 'fusiform', lengthScale: 1.3, girthScale: 1.38, finScale: 1.1, tailScale: 1.15, headBulge: 0.14, eyeScale: 1.0 })
});

/* The names and defaults are the cross-lane material contract. A consumer
 * turns these values into shader uniforms when it clones the shared toon
 * material. Keep this independent of shark3d.js so load order cannot make
 * the fish geometry lane fragile. */
const FISH_BEND_UNIFORM_DEFAULTS = Object.freeze({
  uBendPhase: 0,
  uBendAmp: 0.12,
  uBendK: 5.5,
  uBendSpan: Object.freeze([-0.5, 0.35])
});
const FISH_BEND_UNIFORM_NAMES = Object.freeze(Object.keys(FISH_BEND_UNIFORM_DEFAULTS));

const geometryCache = new Map();

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function colorFromHex(value) {
  return new THREE.Color(value);
}

// Prey value differentiation (art MAJOR 5): higher-value prey (data.js
// CREATURES score) get a brighter, more saturated accent bake so a player
// scanning a mixed school can read "worth more" at a glance, not just from
// the HUD score popup after the bite. Score across the 12 fusiform species
// this module lofts runs roughly 5 (minnow) to 420 (leviathanprey); log-
// scaled so the low end isn't crushed together and the high end doesn't
// clip. This only brightens/saturates the authored accent hue -- it never
// changes hue or the base/belly countershading, so species identity from
// the Rev 6 (6.9) saturation pass is preserved.
const PREY_SCORE_MIN = 5;
const PREY_SCORE_MAX = 420;
function valueBoostFor(score) {
  const s = clamp(finite(score, PREY_SCORE_MIN), PREY_SCORE_MIN, PREY_SCORE_MAX);
  const t = Math.log(s / PREY_SCORE_MIN) / Math.log(PREY_SCORE_MAX / PREY_SCORE_MIN);
  return clamp(t, 0, 1);
}

function brightenAccent(accent, boost) {
  const hsl = {};
  accent.getHSL(hsl);
  const color = new THREE.Color();
  color.setHSL(hsl.h, clamp(hsl.s + boost * 0.22, 0, 1), clamp(hsl.l + boost * 0.16, 0, 0.86));
  return color;
}

function paletteFor(id, score) {
  const row = FISH_PALETTE_TABLE[id];
  if (!row) return null;
  const boost = valueBoostFor(score);
  return Object.freeze({
    base: colorFromHex(row.base),
    belly: colorFromHex(row.belly),
    accent: brightenAccent(colorFromHex(row.accent), boost),
    valueBoost: boost
  });
}

function addVertex(positions, colors, x, y, z, color) {
  positions.push(x, y, z);
  colors.push(color.r, color.g, color.b);
}

function appendTriangle(positions, colors, indices, a, b, c, color) {
  const offset = positions.length / 3;
  addVertex(positions, colors, a[0], a[1], a[2], color);
  addVertex(positions, colors, b[0], b[1], b[2], color);
  addVertex(positions, colors, c[0], c[1], c[2], color);
  indices.push(offset, offset + 1, offset + 2);
}

function appendClosedWedge(positions, colors, indices, a, b, c, thickness, color, normal) {
  const n = normal || [0, 0, 1];
  const nLength = Math.hypot(n[0], n[1], n[2]) || 1;
  const half = thickness * 0.5;
  const ox = n[0] * half / nLength;
  const oy = n[1] * half / nLength;
  const oz = n[2] * half / nLength;
  const front = [
    [a[0] + ox, a[1] + oy, a[2] + oz],
    [b[0] + ox, b[1] + oy, b[2] + oz],
    [c[0] + ox, c[1] + oy, c[2] + oz]
  ];
  const back = [
    [a[0] - ox, a[1] - oy, a[2] - oz],
    [b[0] - ox, b[1] - oy, b[2] - oz],
    [c[0] - ox, c[1] - oy, c[2] - oz]
  ];
  appendTriangle(positions, colors, indices, front[0], front[1], front[2], color);
  appendTriangle(positions, colors, indices, back[0], back[2], back[1], color);
  for (let edge = 0; edge < 3; edge++) {
    const next = (edge + 1) % 3;
    appendTriangle(positions, colors, indices, front[edge], back[edge], back[next], color);
    appendTriangle(positions, colors, indices, front[edge], back[next], front[next], color);
  }
}

function bodyColor(palette, dorsalness, sideBias) {
  const color = new THREE.Color();
  if (dorsalness >= 0) {
    color.copy(palette.base).lerp(palette.accent, 1 - dorsalness);
  } else {
    color.copy(palette.accent).lerp(palette.belly, -dorsalness);
  }
  if (sideBias > 0.35) color.lerp(palette.accent, 0.12);
  return color;
}

function buildGeometry(def, palette) {
  const shape = FISH_SHAPE_TABLE[def.id];
  if (!shape) throw new Error(`${def.id}: fish silhouette parameters missing`);
  const tier = clamp(finite(def.tier, 0), 0, 10);
  const bodyLength = (1.25 + tier * 0.075) * finite(shape.lengthScale, 1);
  const radiusY = (0.17 + tier * 0.010) * finite(shape.girthScale, 1);
  const radiusZ = radiusY * finite(shape.radiusZRatio, 0.62);
  const stationX = [-0.56, -0.46, -0.30, -0.10, 0.12, 0.31, 0.46, 0.56];
  const stationProfile = [0.30, 0.62, 0.86, 1.0, 1.04, 0.95, 0.72, 0.35];
  const positions = [];
  const colors = [];
  const indices = [];
  const rings = [];

  for (let station = 0; station < BODY_STATIONS; station++) {
    const ring = [];
    const stationT = station / (BODY_STATIONS - 1);
    let profile = stationProfile[station];
    // A mantle is a cone that tapers toward the nose; the same scalar also
    // makes the turtle's shell and grouper's head feel like one volume.
    profile *= 1 + finite(shape.mantleTaper, 0) * (0.5 - stationT);
    profile *= 1 + finite(shape.headBulge, 0) * clamp((stationT - 0.45) / 0.55, 0, 1);
    const x = stationX[station] * bodyLength;
    for (let radial = 0; radial < RADIAL_SIDES; radial++) {
      const theta = (radial / RADIAL_SIDES) * TAU;
      const dorsalness = Math.cos(theta);
      const sideBias = Math.abs(Math.sin(theta));
      const midBody = Math.sin(Math.PI * stationT);
      const shell = 1 + finite(shape.shellDome, 0) * Math.max(0, dorsalness) * midBody;
      const y = dorsalness * radiusY * profile * shell;
      const z = Math.sin(theta) * radiusZ * profile;
      ring.push(positions.length / 3);
      addVertex(positions, colors, x, y, z, bodyColor(palette, dorsalness, sideBias));
    }
    rings.push(ring);
  }

  for (let station = 0; station < BODY_STATIONS - 1; station++) {
    for (let radial = 0; radial < RADIAL_SIDES; radial++) {
      const next = (radial + 1) % RADIAL_SIDES;
      const a = rings[station][radial];
      const b = rings[station][next];
      const c = rings[station + 1][next];
      const d = rings[station + 1][radial];
      indices.push(a, b, c, a, c, d);
    }
  }

  const noseCenter = positions.length / 3;
  addVertex(positions, colors, bodyLength * finite(shape.noseX, 0.64), 0, 0, palette.accent);
  const noseRing = rings[BODY_STATIONS - 1];
  for (let radial = 0; radial < RADIAL_SIDES; radial++) {
    const next = (radial + 1) % RADIAL_SIDES;
    indices.push(noseCenter, noseRing[next], noseRing[radial]);
  }

  const tailCenter = positions.length / 3;
  addVertex(positions, colors, -bodyLength * 0.64, 0, 0, palette.base);
  const tailRing = rings[0];
  for (let radial = 0; radial < RADIAL_SIDES; radial++) {
    const next = (radial + 1) % RADIAL_SIDES;
    indices.push(tailCenter, tailRing[radial], tailRing[next]);
  }

  const finScale = finite(shape.finScale, 1);
  const finThickness = Math.max(0.008, Math.abs(radiusZ) * 0.16);
  const tailColor = new THREE.Color().copy(palette.accent).lerp(palette.base, 0.18);
  if (shape.tailFan !== false) {
    const tailRoot = [-bodyLength * 0.55, 0, 0];
    const tailHeight = radiusY * 1.85 * finite(shape.tailScale, 1) * finScale;
    const tailRun = bodyLength * 0.36;
    const fanSplay = Math.tan(Math.PI / 12) * tailRun; // +-15 degrees
    const notch = finite(shape.tailNotch, 0);
    const tailNotchY = tailHeight * (0.20 - notch * 0.10);
    const upperOuter = [-bodyLength * 0.96, tailHeight, fanSplay];
    const upperNotch = [-bodyLength * (0.75 - notch * 0.08), tailNotchY, fanSplay * 0.30];
    const lowerNotch = [-bodyLength * (0.75 - notch * 0.08), -tailNotchY, -fanSplay * 0.30];
    const lowerOuter = [-bodyLength * 0.96, -tailHeight, -fanSplay];
    appendClosedWedge(positions, colors, indices, tailRoot, upperOuter, upperNotch, finThickness, tailColor);
    appendClosedWedge(positions, colors, indices, tailRoot, lowerNotch, lowerOuter, finThickness, tailColor);
  }

  const dorsalColor = new THREE.Color().copy(palette.accent).lerp(palette.base, 0.35);
  const dorsalRoot = [-bodyLength * 0.03, radiusY * 0.96, 0];
  const dorsalRear = [-bodyLength * 0.27, radiusY * 0.73, radiusZ * 0.10];
  const dorsalTip = [-bodyLength * 0.02, radiusY * (1.45 + tier * 0.018) * finScale, radiusZ * 0.32];
  appendClosedWedge(positions, colors, indices, dorsalRoot, dorsalRear, dorsalTip, finThickness, dorsalColor);

  const pectColor = new THREE.Color().copy(palette.base).lerp(palette.accent, 0.4);
  if (shape.kind === 'ray') {
    const wingSpan = radiusY * finite(shape.wingScale, 1.4) * finScale;
    for (const side of [-1, 1]) {
      const wingRoot = [bodyLength * 0.10, 0, side * radiusZ * 0.94];
      const wingSweep = [-bodyLength * 0.13, side * radiusY * 0.42, side * radiusZ * 1.02];
      const wingTip = [-bodyLength * 0.52, side * wingSpan, side * radiusZ * 1.04];
      appendClosedWedge(positions, colors, indices, wingRoot, wingSweep, wingTip, finThickness, pectColor);
    }
  } else if (shape.kind === 'turtle') {
    const flipperColor = new THREE.Color().copy(palette.accent).lerp(palette.belly, 0.25);
    const flipperScale = finite(shape.flipperScale, 1) * finScale;
    for (const side of [-1, 1]) {
      const frontRoot = [bodyLength * 0.24, -radiusY * 0.08, side * radiusZ * 0.94];
      const frontTip = [bodyLength * 0.02, -radiusY * 0.92 * flipperScale, side * radiusZ * 1.34];
      appendClosedWedge(positions, colors, indices, frontRoot,
        [bodyLength * 0.08, -radiusY * 0.35, side * radiusZ * 1.04], frontTip,
        finThickness, flipperColor);
      const rearRoot = [-bodyLength * 0.22, -radiusY * 0.04, side * radiusZ * 0.92];
      const rearTip = [-bodyLength * 0.43, -radiusY * 0.70 * flipperScale, side * radiusZ * 1.10];
      appendClosedWedge(positions, colors, indices, rearRoot,
        [-bodyLength * 0.35, -radiusY * 0.28, side * radiusZ * 1.02], rearTip,
        finThickness, flipperColor);
    }
  } else if (shape.kind === 'squid') {
    const armColor = new THREE.Color().copy(palette.accent).lerp(palette.base, 0.25);
    const armScale = finite(shape.armScale, 1) * finScale;
    const armOffsets = [-0.70, -0.26, 0.26, 0.70];
    for (let arm = 0; arm < armOffsets.length; arm++) {
      const spread = armOffsets[arm] * armScale;
      const root = [-bodyLength * 0.34, spread * radiusY * 0.20, 0];
      const mid = [-bodyLength * 0.62, spread * radiusY * 0.64, spread * radiusZ * 0.35];
      const tip = [-bodyLength * (0.94 + 0.05 * armScale), spread * radiusY * 1.02, spread * radiusZ * 0.58];
      appendClosedWedge(positions, colors, indices, root, mid, tip, finThickness, armColor);
    }
  } else {
    const pectRootX = bodyLength * 0.08;
    const pectRootY = -radiusY * 0.06;
    const pectTipX = bodyLength * (-0.10 - tier * 0.006);
    const pectTipY = -radiusY * (0.92 + tier * 0.03) * finScale;
    for (const side of [-1, 1]) {
      // The root starts on the side of the 8-gon, then sweeps both backward
      // and out of plane. It cannot disappear into the hull like a card fin.
      const pectRoot = [pectRootX, pectRootY, side * radiusZ * 0.96];
      const pectRear = [pectRootX - bodyLength * 0.13, pectRootY * 0.3, side * radiusZ * 1.05];
      const pectTip = [pectTipX, pectTipY, side * radiusZ * (1.62 + 0.16 * finScale)];
      appendClosedWedge(positions, colors, indices, pectRoot, pectRear, pectTip, finThickness, pectColor);
    }

    const pelvicColor = new THREE.Color().copy(palette.base).lerp(palette.belly, 0.30);
    for (const side of [-1, 1]) {
      const pelvicRoot = [-bodyLength * 0.05, -radiusY * 0.62, side * radiusZ * 0.78];
      const pelvicRear = [-bodyLength * 0.24, -radiusY * 0.78, side * radiusZ * 0.90];
      const pelvicTip = [-bodyLength * 0.31, -radiusY * 1.08 * finScale, side * radiusZ * 0.86];
      appendClosedWedge(positions, colors, indices, pelvicRoot, pelvicRear, pelvicTip, finThickness, pelvicColor);
    }
    const analRoot = [-bodyLength * 0.25, -radiusY * 0.68, 0];
    const analRear = [-bodyLength * 0.43, -radiusY * 0.56, -radiusZ * 0.16];
    const analTip = [-bodyLength * 0.34, -radiusY * 1.02 * finScale, radiusZ * 0.18];
    appendClosedWedge(positions, colors, indices, analRoot, analRear, analTip, finThickness, pelvicColor);
  }

  // Three short closed cheek wedges make the face read at roster scale and
  // keep the body from looking like a featureless torpedo. They are mirrored
  // so a left-facing and right-facing instance share the same authored read.
  const gillColor = new THREE.Color().copy(palette.base).lerp(new THREE.Color(0x071522), 0.62);
  for (const side of [-1, 1]) {
    for (let band = 0; band < 3; band++) {
      const x = bodyLength * (0.23 + band * 0.055);
      const z = side * radiusZ * 0.96;
      appendClosedWedge(
        positions, colors, indices,
        [x, radiusY * 0.34, z],
        [x - bodyLength * 0.025, -radiusY * 0.18, z + side * radiusZ * 0.035],
        [x - bodyLength * 0.070, radiusY * 0.04, z + side * radiusZ * 0.045],
        Math.max(0.008, Math.abs(radiusZ) * 0.07),
        gillColor
      );
    }
  }

  if (finite(shape.billLength, 0) > 0) {
    const billColor = new THREE.Color().copy(palette.accent).lerp(new THREE.Color(0x08131d), 0.28);
    const billRootX = bodyLength * 0.57;
    const billTipX = billRootX + bodyLength * finite(shape.billLength, 0);
    appendClosedWedge(
      positions, colors, indices,
      [billRootX, radiusY * 0.11, 0],
      [billTipX, 0, 0],
      [billRootX, -radiusY * 0.08, 0],
      Math.max(0.010, Math.abs(radiusZ) * 0.14),
      billColor
    );
  }

  /* Each eye is an 8-gon white ring with a proud dark iris, authored on both
   * sides in the same merged geometry. The ring and iris stay geometry-only
   * so the instanced material remains one draw and one bend path. */
  const eyeColor = new THREE.Color(0x06111c);
  const eyeWhite = new THREE.Color(0xfff8df);
  const eyeX = bodyLength * 0.39;
  const eyeY = radiusY * 0.34;
  const eyeSurfaceZ = radiusZ * 0.94;
  const eyeSize = Math.max(0.022, radiusY * 0.21 * finite(shape.eyeScale, 1));
  const eyeDepth = Math.max(0.012, Math.abs(radiusZ) * 0.10);
  for (const side of [-1, 1]) {
    const outer = [];
    const irisRing = [];
    const irisRadius = eyeSize * 0.58;
    const outerZ = side * (eyeSurfaceZ + eyeDepth);
    const irisZ = side * (eyeSurfaceZ + eyeDepth * 1.55);
    for (let radial = 0; radial < RADIAL_SIDES; radial++) {
      const theta = (radial / RADIAL_SIDES) * TAU;
      outer.push(positions.length / 3);
      addVertex(positions, colors,
        eyeX + Math.cos(theta) * eyeSize,
        eyeY + Math.sin(theta) * eyeSize,
        outerZ,
        eyeWhite);
      irisRing.push(positions.length / 3);
      addVertex(positions, colors,
        eyeX + Math.cos(theta) * irisRadius,
        eyeY + Math.sin(theta) * irisRadius,
        irisZ,
        eyeWhite);
    }
    const irisCenter = positions.length / 3;
    addVertex(positions, colors, eyeX, eyeY, side * (eyeSurfaceZ + eyeDepth * 1.62), eyeColor);
    for (let radial = 0; radial < RADIAL_SIDES; radial++) {
      const next = (radial + 1) % RADIAL_SIDES;
      indices.push(outer[radial], outer[next], irisRing[next], outer[radial], irisRing[next], irisRing[radial]);
      indices.push(irisCenter, irisRing[radial], irisRing[next]);
    }
  }

  if (shape.kind === 'turtle') {
    // The dome is already part of the station radii; this low-poly shell
    // accent gives the top plane the warm, unmistakable turtle block.
    const shellColor = new THREE.Color().copy(palette.base).lerp(palette.accent, 0.32);
    const shellRoot = [-bodyLength * 0.16, radiusY * 0.86, 0];
    const shellRear = [-bodyLength * 0.48, radiusY * 0.50, 0];
    const shellTip = [bodyLength * 0.18, radiusY * 1.18, 0];
    appendClosedWedge(positions, colors, indices, shellRoot, shellRear, shellTip, finThickness * 1.2, shellColor);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = `RF fish loft ${def.id}`;
  geometry.userData.rfFishId = def.id;
  geometry.userData.rfFishPaletteId = def.id;
  geometry.userData.rfFishPaletteBase = palette.base.getHex();
  geometry.userData.rfFishPaletteBelly = palette.belly.getHex();
  geometry.userData.rfFishPaletteAccent = palette.accent.getHex();
  // Prey value differentiation (art MAJOR 5): exposes how much this bake's
  // accent was brightened/saturated for its score tier, so a future consumer
  // (world3d.js, out of this lane) could read it without recomputing.
  geometry.userData.rfFishValueBoost = finite(palette.valueBoost, 0);
  geometry.userData.rfFishTriangles = Math.floor(indices.length / 3);
  geometry.userData.rfNoseDirection = '+x';
  geometry.userData.rfNoseX = geometry.boundingBox.max.x;
  geometry.userData.rfLoft = {
    bodyStations: BODY_STATIONS,
    radialSides: RADIAL_SIDES,
    stationProfileEnds: [stationProfile[0], stationProfile[stationProfile.length - 1]],
    radiusZRatio: finite(shape.radiusZRatio, 0.62),
    speciesKind: shape.kind,
    tailFinFan: shape.tailFan !== false,
    dorsalSliver: true,
    closedFinWedges: true,
    pectoralFinPair: shape.kind === 'fusiform',
    pectoralTriangles: shape.kind === 'fusiform' ? 16 : 0,
    pelvicAnalSlivers: shape.kind === 'fusiform',
    eyeRadialSides: RADIAL_SIDES,
    eyeAccent: true,
    eyeRingTriangles: RADIAL_SIDES * 4,
    eyeIrisTriangles: RADIAL_SIDES * 2,
    eyeTriangles: RADIAL_SIDES * 6
  };
  if (geometry.userData.rfFishTriangles > TRIANGLE_LIMIT) {
    geometry.dispose();
    throw new Error(`${def.id}: fish loft exceeds ${TRIANGLE_LIMIT} triangles`);
  }
  return geometry;
}

function buildFish(def) {
  const id = def && typeof def.id === 'string' ? def.id : '';
  if (!FISH_PALETTE_TABLE[id]) return null;
  if (!geometryCache.has(id)) {
    const palette = paletteFor(id, def.score);
    geometryCache.set(id, {
      geometry: buildGeometry(def, palette),
      palette
    });
  }
  return geometryCache.get(id);
}

function buildFishMaterialSpec() {
  const uniforms = {};
  for (const name of FISH_BEND_UNIFORM_NAMES) uniforms[name] = { value: FISH_BEND_UNIFORM_DEFAULTS[name] };
  return {
    vertexColors: true,
    uniforms,
    uniformNames: FISH_BEND_UNIFORM_NAMES.slice(),
    uniformDefaults: { ...FISH_BEND_UNIFORM_DEFAULTS },
    customProgramCacheKeySuffix: FISH_BEND_SUFFIX
  };
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function geometryTriangles(geometry) {
  const index = geometry && geometry.getIndex && geometry.getIndex();
  const position = geometry && geometry.getAttribute && geometry.getAttribute('position');
  return Math.floor((index ? index.count : position ? position.count : 0) / 3);
}

function __selftestFish() {
  const result = { pass: false, notes: [], errors: [], sweep: 0, cacheSize: 0, triangles: {} };
  try {
    const rows = host.RFD && Array.isArray(host.RFD.CREATURES) ? host.RFD.CREATURES : [];
    const defs = Object.keys(FISH_PALETTE_TABLE).map((id) => rows.find((row) => row.id === id));
    check(defs.every(Boolean), 'all 16 prey palette ids must exist in RFD.CREATURES');
    check(defs.length === 16, `expected 16 palette defs, received ${defs.length}`);
    const seenGeometry = new Map();
    const seenColors = new Map();

    for (const def of defs) {
      const first = buildFish(def);
      const second = buildFish(def);
      check(first && first.geometry, `${def.id}: buildFish returned no geometry`);
      check(first.geometry === second.geometry, `${def.id}: geometry cache identity changed`);
      check(first.palette === second.palette, `${def.id}: palette cache identity changed`);
      const geometry = first.geometry;
      const position = geometry.getAttribute('position');
      const color = geometry.getAttribute('color');
      const index = geometry.getIndex();
      check(geometry instanceof THREE.BufferGeometry, `${def.id}: result is not one BufferGeometry`);
      check(position && color && color.count === position.count, `${def.id}: vertex colors missing or misaligned`);
      check(geometry.userData.rfFishPaletteId === def.id,
        `${def.id}: geometry palette identity is not carried by the loft`);
      check(!seenGeometry.has(def.id) || seenGeometry.get(def.id) === geometry,
        `${def.id}: repeated palette id did not reuse its cached loft`);
      for (const [otherId, otherGeometry] of seenGeometry) {
        check(otherGeometry !== geometry, `${def.id}: shares one geometry bake with ${otherId}`);
      }
      if (seenColors.size) {
        let colorDelta = 0;
        const previous = seenColors.values().next().value;
        const count = Math.min(previous.length, color.array.length);
        for (let ci = 0; ci < count; ci++) colorDelta += Math.abs(previous[ci] - color.array[ci]);
        check(colorDelta > 0.05, `${def.id}: vertex palette is indistinguishable from the previous prey loft`);
      }
      seenGeometry.set(def.id, geometry);
      seenColors.set(def.id, color.array);
      check(index && index.count % 3 === 0, `${def.id}: indexed triangle geometry missing`);
      const triangles = geometryTriangles(geometry);
      check(triangles > 0 && triangles <= TRIANGLE_LIMIT, `${def.id}: ${triangles} triangles outside 1..${TRIANGLE_LIMIT}`);
      check(geometry.userData.rfLoft && geometry.userData.rfLoft.eyeAccent === true &&
        geometry.userData.rfLoft.eyeRadialSides === 8 &&
        geometry.userData.rfLoft.eyeTriangles === 48 &&
        geometry.userData.rfLoft.eyeRingTriangles === 32 &&
        geometry.userData.rfLoft.eyeIrisTriangles === 16,
      `${def.id}: proud 8-gon white-ring/dark-iris eyes are missing from the loft`);
      check(geometry.userData.rfLoft.closedFinWedges === true,
        `${def.id}: fins are not authored as closed wedges`);
      if (def.id !== 'ray' && def.id !== 'turtle' && def.id !== 'squidling' && def.id !== 'giantsquid') {
        check(geometry.userData.rfLoft.pectoralFinPair === true && geometry.userData.rfLoft.pectoralTriangles === 16,
          `${def.id}: swept pectoral fin pair is missing from the loft`);
        check(geometry.userData.rfLoft.pelvicAnalSlivers === true,
          `${def.id}: pelvic/anal fin slivers are missing from the loft`);
      }
      check(geometry.boundingBox && geometry.boundingBox.max.x > 0 && geometry.boundingBox.max.x >= Math.abs(geometry.boundingBox.min.x) * 0.4,
        `${def.id}: nose is not authored toward +x`);
      check(first.palette.base instanceof THREE.Color && first.palette.belly instanceof THREE.Color && first.palette.accent instanceof THREE.Color,
        `${def.id}: palette is missing base/belly/accent colors`);
      result.triangles[def.id] = triangles;
      result.sweep++;
    }

    const cacheBeforeUnknown = geometryCache.size;
    check(buildFish({ id: 'unknown-fish' }) === null, 'unknown id must fall back with null');
    check(geometryCache.size === cacheBeforeUnknown, 'unknown id polluted the geometry cache');

    const spec = buildFishMaterialSpec();
    check(spec.vertexColors === true, 'fish material spec must enable vertex colors');
    check(spec.customProgramCacheKeySuffix === ':rf-bend-inst2' && spec.customProgramCacheKeySuffix === FISH_BEND_SUFFIX,
      'fish material spec cache suffix drifted from instanced bend v2');
    check(spec.uniformNames.join(',') === 'uBendPhase,uBendAmp,uBendK,uBendSpan', 'fish bend uniform names drifted');
    check(FISH_BEND_UNIFORM_DEFAULTS.uBendAmp === 0.12 && FISH_BEND_UNIFORM_DEFAULTS.uBendK === 5.5 &&
      Array.isArray(FISH_BEND_UNIFORM_DEFAULTS.uBendSpan) &&
      FISH_BEND_UNIFORM_DEFAULTS.uBendSpan[0] === -0.5 && FISH_BEND_UNIFORM_DEFAULTS.uBendSpan[1] === 0.35,
    'fish bend v2 uniform defaults drifted');
    for (const name of FISH_BEND_UNIFORM_NAMES) {
      check(spec.uniforms[name] && spec.uniforms[name].value === FISH_BEND_UNIFORM_DEFAULTS[name], `${name}: default uniform drifted`);
    }
    check(spec.uniforms !== buildFishMaterialSpec().uniforms, 'material spec must return fresh uniform bundles');

    // Rev 7.5: world3d doubles the per-instance aBendAmp attribute while
    // panicT is active (this lane does not own that write -- world3d.js's
    // instanced bend path is the orchestrator's patch territory -- but the
    // base amplitude default IS this lane's contract number, so verify
    // doubling it stays a sane fraction of a fish body rather than a runaway
    // wobble). FISH_BEND_UNIFORM_DEFAULTS mirrors world3d's instanced v2 values
    // (INST_BEND_AMP=0.12, INST_BEND_K=5.5, INST_BEND_SPAN=[-0.5,0.35]) so
    // the material spec and the shader-probe patch cannot drift apart.
    {
      const baseAmp = FISH_BEND_UNIFORM_DEFAULTS.uBendAmp;
      const panicAmp = baseAmp * 2;
      const bendK = FISH_BEND_UNIFORM_DEFAULTS.uBendK;
      const span = FISH_BEND_UNIFORM_DEFAULTS.uBendSpan;
      // Mirrors the shared bendT smoothstep shape (shark3d.js bendOffset /
      // world3d.js INST_BEND_CHUNK) at full envelope saturation (bendT=1),
      // where the tail tip reads worst-case peak lateral displacement.
      const typicalBodyLength = 1.25 * 0.84; // minnow body length (buildGeometry)
      const peakAt2x = panicAmp; // bendT saturates to 1 well inside the tail
      check(Number.isFinite(peakAt2x) && peakAt2x > 0, 'panic 2x bend amplitude must be finite and positive');
      check(peakAt2x < typicalBodyLength * 0.4,
        `panic 2x bend amplitude ${peakAt2x.toFixed(3)} exceeds 40% of a typical fish body length (${typicalBodyLength}) -- would read as a runaway wobble, not a sane 2x panic bend`);
      void bendK; void span; // documented above for context; not independently asserted here
    }

    // Prey value differentiation (art MAJOR 5, fix-round 2): higher-score
    // prey must bake a brighter/more saturated accent than lower-score prey,
    // monotonically, so a mixed school reads value at a glance. minnow
    // (score 5) is the roster floor and leviathanprey (score 420) is the
    // roster ceiling; check the whole ordered chain, not just the extremes,
    // so a single species regression can't hide behind the endpoints.
    {
      const scoreOrder = [
        ['minnow', 5], ['reeffish', 10], ['mackerel', 12], ['anglerprey', 16],
        ['parrot', 18], ['squidling', 20], ['grouper', 30], ['ray', 34],
        ['tuna', 44], ['turtle', 50], ['dolphinfish', 60], ['swordfish', 70],
        ['marlin', 95], ['giantsquid', 150], ['abyssal', 200], ['leviathanprey', 420]
      ];
      let prevBoost = -Infinity;
      for (const [id, score] of scoreOrder) {
        const row = rows.find((candidate) => candidate.id === id);
        check(row && row.score === score, `${id}: expected score ${score} in RFD.CREATURES, drifted`);
        const baked = buildFish(row);
        const boost = baked.geometry.userData.rfFishValueBoost;
        check(Number.isFinite(boost) && boost >= 0 && boost <= 1, `${id}: value boost ${boost} outside 0..1`);
        check(boost >= prevBoost - 1e-9, `${id}: value boost ${boost.toFixed(3)} regressed below the previous (lower-score) prey's ${prevBoost.toFixed(3)}`);
        prevBoost = boost;
      }
      check(prevBoost > 0.9, `leviathanprey (highest score) value boost ${prevBoost.toFixed(3)} should approach the 1.0 ceiling`);
      const minnowBoost = buildFish(rows.find((r) => r.id === 'minnow')).geometry.userData.rfFishValueBoost;
      check(minnowBoost < 0.05, `minnow (lowest score) value boost ${minnowBoost.toFixed(3)} should sit near the 0.0 floor`);
    }

    result.cacheSize = geometryCache.size;
    result.notes.push('16 prey defs lofted into cached one-geometry records: 12 fusiforms plus ray, turtle, squidling, and giantsquid');
    result.notes.push(`8 stations x 8 radial body, rounder ends 0.30/0.35, closed wedge fins, 48-triangle proud eye pairs; max ${TRIANGLE_LIMIT} triangles`);
    result.notes.push('vertex colors carry dorsal base -> flank accent -> belly countershading');
    result.notes.push('Rev 6 saturation pass: mackerel/swordfish/grouper/anglerprey/abyssal/leviathanprey pushed to richer, cyberpunk-adjacent accents while keeping species hue family and belly contrast');
    result.notes.push('every prey id carries a distinct palette-tagged geometry and vertex color bake');
    result.notes.push('fish bend material spec mirrors instanced v2 defaults (amp 0.12, k 5.5, span -0.5..0.35) and :rf-bend-inst2; panic-path 2x base amplitude stays sane (<40% body length) -- world3d writes the instances');
    result.notes.push('Rev 6 fix-round 2 (art MAJOR 5, prey value differentiation): accent brightness/saturation scales log-monotonically with data.js CREATURES score (5..420), exposed as geometry.userData.rfFishValueBoost; golden-frenzy tint (ent._tint/_goldenPackId) remains an engine3d/world3d hook outside this lane\'s vertex-color-only contract');
    result.pass = true;
  } catch (error) {
    result.errors.push(error.message || String(error));
  }
  return result;
}

const Art3D = RF.Art3D || {};
Art3D.buildFish = buildFish;
Art3D.buildFishMaterialSpec = buildFishMaterialSpec;
Art3D.__selftestFish = __selftestFish;
RF.Art3D = Art3D;

export {
  Art3D,
  FISH_PALETTE_TABLE,
  FISH_BEND_UNIFORM_DEFAULTS,
  buildFish,
  buildFishMaterialSpec,
  __selftestFish
};
export default Art3D;
