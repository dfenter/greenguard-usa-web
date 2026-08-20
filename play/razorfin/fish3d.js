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
const RADIAL_SIDES = 6;
const TRIANGLE_LIMIT = 220;
const FISH_BEND_SUFFIX = ':rf-bend';

/* These values follow the existing sprite families in data.js: cool blue
 * minnows and tuna, warm orange reef fish, green parrotfish, and the muted
 * deep-water silhouettes. They are deliberately authored here because prey
 * defs currently carry a sprite key rather than a 3D tint/palette. */
const FISH_PALETTE_TABLE = Object.freeze({
  minnow: Object.freeze({ base: 0x118ed1, belly: 0xf8f0c2, accent: 0x48e5f0 }),
  reeffish: Object.freeze({ base: 0xf06a24, belly: 0xffe6a0, accent: 0x2ed5ae }),
  mackerel: Object.freeze({ base: 0x2e8fa8, belly: 0xe8f6d5, accent: 0x77e4df }),
  parrot: Object.freeze({ base: 0x1fa56f, belly: 0xffdf76, accent: 0xf45d6d }),
  grouper: Object.freeze({ base: 0x8b7049, belly: 0xf4d69a, accent: 0xe89a30 }),
  tuna: Object.freeze({ base: 0x1768b3, belly: 0xf7edb5, accent: 0x35b9e8 }),
  swordfish: Object.freeze({ base: 0x3d6fb0, belly: 0xf4f0df, accent: 0x8bd9e8 }),
  dolphinfish: Object.freeze({ base: 0x168bb0, belly: 0xffdf83, accent: 0xf7bd28 }),
  marlin: Object.freeze({ base: 0x295c9b, belly: 0xf5dfb0, accent: 0xf27655 }),
  anglerprey: Object.freeze({ base: 0x2f4d58, belly: 0xcde6d4, accent: 0xc4f46c }),
  abyssal: Object.freeze({ base: 0x413b68, belly: 0xb9d8c7, accent: 0xffa34f }),
  leviathanprey: Object.freeze({ base: 0x4a4b78, belly: 0xe0d9ad, accent: 0xf27b4f })
});

/* The names and defaults are the cross-lane material contract. A consumer
 * turns these values into shader uniforms when it clones the shared toon
 * material. Keep this independent of shark3d.js so load order cannot make
 * the fish geometry lane fragile. */
const FISH_BEND_UNIFORM_DEFAULTS = Object.freeze({
  uBendPhase: 0,
  uBendAmp: 0.08,
  uBendK: 2.5,
  uBendSpan: 1.8
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

function paletteFor(id) {
  const row = FISH_PALETTE_TABLE[id];
  if (!row) return null;
  return Object.freeze({
    base: colorFromHex(row.base),
    belly: colorFromHex(row.belly),
    accent: colorFromHex(row.accent)
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

function appendDoubleSidedTriangle(positions, colors, indices, a, b, c, thickness, color) {
  const front = [a.slice(), b.slice(), c.slice()];
  const back = [a.slice(), c.slice(), b.slice()];
  for (const point of front) point[2] += thickness;
  for (const point of back) point[2] -= thickness;
  appendTriangle(positions, colors, indices, front[0], front[1], front[2], color);
  appendTriangle(positions, colors, indices, back[0], back[1], back[2], color);
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
  const tier = clamp(finite(def.tier, 0), 0, 10);
  const bodyLength = 1.25 + tier * 0.075;
  const radiusY = 0.17 + tier * 0.010;
  const radiusZ = radiusY * 0.78;
  const stationX = [-0.56, -0.46, -0.30, -0.10, 0.12, 0.31, 0.46, 0.56];
  const stationProfile = [0.18, 0.52, 0.80, 0.98, 1.0, 0.91, 0.68, 0.28];
  const positions = [];
  const colors = [];
  const indices = [];
  const rings = [];

  for (let station = 0; station < BODY_STATIONS; station++) {
    const ring = [];
    const profile = stationProfile[station];
    const x = stationX[station] * bodyLength;
    for (let radial = 0; radial < RADIAL_SIDES; radial++) {
      const theta = (radial / RADIAL_SIDES) * TAU;
      const y = Math.cos(theta) * radiusY * profile;
      const z = Math.sin(theta) * radiusZ * profile;
      const dorsalness = profile <= 0.001 ? 0 : clamp(y / (radiusY * profile), -1, 1);
      const sideBias = Math.abs(z) / Math.max(radiusZ * profile, 0.001);
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
  addVertex(positions, colors, bodyLength * 0.64, 0, 0, palette.accent);
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

  /* The fan is deliberately a pair of forked triangles rather than a second
   * mesh. Duplicate front/back faces keep it visible to either material side
   * while preserving one merged geometry for the eventual InstancedMesh. */
  const tailRoot = [-bodyLength * 0.55, 0, 0];
  const tailPoints = [
    [-bodyLength * 0.92, radiusY * 1.85, 0],
    [-bodyLength * 0.76, 0, 0],
    [-bodyLength * 0.92, -radiusY * 1.85, 0]
  ];
  for (let i = 0; i < tailPoints.length - 1; i++) {
    appendDoubleSidedTriangle(
      positions,
      colors,
      indices,
      tailRoot,
      tailPoints[i],
      tailPoints[i + 1],
      Math.max(0.006, radiusZ * 0.18),
      palette.accent
    );
  }

  const dorsalColor = new THREE.Color().copy(palette.accent).lerp(palette.base, 0.35);
  const dorsalRoot = [-bodyLength * 0.03, radiusY * 0.82, 0];
  const dorsalRear = [-bodyLength * 0.27, radiusY * 0.73, 0];
  const dorsalTip = [-bodyLength * 0.02, radiusY * (1.55 + tier * 0.018), 0];
  appendDoubleSidedTriangle(
    positions,
    colors,
    indices,
    dorsalRoot,
    dorsalRear,
    dorsalTip,
    Math.max(0.006, radiusZ * 0.16),
    dorsalColor
  );

  /* A tiny dark eye keeps the nearest fish readable once the loft is
   * instanced. It is authored as two-sided triangles on both visible sides,
   * rather than as a second Object3D, so the loft remains one bounded mesh. */
  const eyeColor = new THREE.Color(0x06111c);
  const eyeX = bodyLength * 0.39;
  const eyeY = radiusY * 0.30;
  const eyeZ = radiusZ * 0.88;
  const eyeSize = Math.max(0.018, radiusY * 0.16);
  for (const side of [-1, 1]) {
    const eye = [
      [eyeX - eyeSize, eyeY - eyeSize * 0.55, side * eyeZ],
      [eyeX + eyeSize, eyeY, side * eyeZ],
      [eyeX - eyeSize, eyeY + eyeSize * 0.75, side * eyeZ]
    ];
    appendDoubleSidedTriangle(
      positions,
      colors,
      indices,
      eye[0],
      eye[1],
      eye[2],
      Math.max(0.003, radiusZ * 0.025),
      eyeColor
    );
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
  geometry.userData.rfFishTriangles = Math.floor(indices.length / 3);
  geometry.userData.rfNoseDirection = '+x';
  geometry.userData.rfNoseX = geometry.boundingBox.max.x;
  geometry.userData.rfLoft = {
    bodyStations: BODY_STATIONS,
    radialSides: RADIAL_SIDES,
    tailFinFan: true,
    dorsalSliver: true,
    eyeAccent: true,
    eyeTriangles: 8
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
    const palette = paletteFor(id);
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
    check(defs.every(Boolean), 'all 12 fusiform prey palette ids must exist in RFD.CREATURES');
    check(defs.length === 12, `expected 12 palette defs, received ${defs.length}`);
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
        geometry.userData.rfLoft.eyeTriangles === 8,
      `${def.id}: dark eye accent is missing from the loft`);
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
    check(spec.customProgramCacheKeySuffix === FISH_BEND_SUFFIX, 'fish material spec cache suffix drifted');
    check(spec.uniformNames.join(',') === 'uBendPhase,uBendAmp,uBendK,uBendSpan', 'fish bend uniform names drifted');
    for (const name of FISH_BEND_UNIFORM_NAMES) {
      check(spec.uniforms[name] && spec.uniforms[name].value === FISH_BEND_UNIFORM_DEFAULTS[name], `${name}: default uniform drifted`);
    }
    check(spec.uniforms !== buildFishMaterialSpec().uniforms, 'material spec must return fresh uniform bundles');

    result.cacheSize = geometryCache.size;
    result.notes.push('12 fusiform prey defs lofted into cached one-geometry records');
    result.notes.push(`8 stations x 6 radial body, forked tail fan, dorsal sliver, 8-triangle eye accents; max ${TRIANGLE_LIMIT} triangles`);
    result.notes.push('vertex colors carry dorsal base -> flank accent -> belly countershading');
    result.notes.push('every prey id carries a distinct palette-tagged geometry and vertex color bake');
    result.notes.push('fish bend contract exposes uBendPhase/uBendAmp/uBendK/uBendSpan with fresh uniform bundles');
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
