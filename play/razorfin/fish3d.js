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
  tuna: Object.freeze({ base: 0x1768b3, belly: 0xf7edb5, accent: 0x35b9e8 }),
  swordfish: Object.freeze({ base: 0x2a5fb8, belly: 0xeef2ea, accent: 0x27e0ff }),
  dolphinfish: Object.freeze({ base: 0x168bb0, belly: 0xffdf83, accent: 0xf7bd28 }),
  marlin: Object.freeze({ base: 0x295c9b, belly: 0xf5dfb0, accent: 0xf27655 }),
  anglerprey: Object.freeze({ base: 0x1f4a52, belly: 0xcde6d4, accent: 0x9dff2b }),
  abyssal: Object.freeze({ base: 0x392f78, belly: 0xb9d8c7, accent: 0xffa34f }),
  leviathanprey: Object.freeze({ base: 0x3d2f8a, belly: 0xe0d9ad, accent: 0xf7593a })
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

  /* Rev 6 (6.9 fish upgrades): a small pectoral fin pair, one double-sided
   * triangle per side (+~8 tris for the pair with TRIANGLE_LIMIT 220 held —
   * see the throw below). Authored as a shallow downward-swept sliver near
   * mid-body, mirrored in z like the tail/dorsal accents, so the silhouette
   * reads as a live fish rather than a bare torpedo body even before any
   * animation bend is applied. */
  const pectColor = new THREE.Color().copy(palette.base).lerp(palette.accent, 0.4);
  const pectRootX = bodyLength * 0.08;
  const pectRootY = -radiusY * 0.12;
  const pectTipX = bodyLength * (-0.06 - tier * 0.006);
  const pectTipY = -radiusY * (0.95 + tier * 0.03);
  for (const side of [-1, 1]) {
    const pectRoot = [pectRootX, pectRootY, side * radiusZ * 0.35];
    const pectRear = [pectRootX - bodyLength * 0.12, pectRootY * 0.6, side * radiusZ * 0.55];
    const pectTip = [pectTipX, pectTipY, side * radiusZ * 0.72];
    appendDoubleSidedTriangle(
      positions,
      colors,
      indices,
      pectRoot,
      pectRear,
      pectTip,
      Math.max(0.005, radiusZ * 0.10),
      pectColor
    );
  }

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
    tailFinFan: true,
    dorsalSliver: true,
    pectoralFinPair: true,
    pectoralTriangles: 8,
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
      // Rev 6 (6.9 fish upgrades): pectoral fin pair, +8 tris, TRIANGLE_LIMIT
      // 220 must still hold (checked generically above, this pins the
      // specific new feature so a future edit cannot silently drop it).
      check(geometry.userData.rfLoft.pectoralFinPair === true && geometry.userData.rfLoft.pectoralTriangles === 8,
        `${def.id}: pectoral fin pair is missing from the loft`);
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

    // Rev 6 (6.5 prey panic): world3d doubles the per-instance aBendAmp
    // attribute while panicT is active (this lane does not own that write —
    // world3d.js's instanced bend path is Lane W territory — but the base
    // amplitude default IS this lane's contract number, so verify doubling
    // it stays a sane fraction of a fish body rather than a runaway wobble).
    // uBendSpan default 1.8 and uBendK default 2.5 come from this module's
    // FISH_BEND_UNIFORM_DEFAULTS; world3d's actual instanced uBendK/uBendSpan
    // (INST_BEND_K=5.5, INST_BEND_SPAN=[-0.5,0.35]) are its own tuned values,
    // so this check uses this module's own defaults as the sane baseline it
    // is actually responsible for.
    {
      const baseAmp = FISH_BEND_UNIFORM_DEFAULTS.uBendAmp;
      const panicAmp = baseAmp * 2;
      const bendK = FISH_BEND_UNIFORM_DEFAULTS.uBendK;
      const span = FISH_BEND_UNIFORM_DEFAULTS.uBendSpan;
      // Mirrors the shared bendT smoothstep shape (shark3d.js bendOffset /
      // world3d.js INST_BEND_CHUNK) at full envelope saturation (bendT=1),
      // where the tail tip reads worst-case peak lateral displacement.
      const typicalBodyLength = 1.25; // tier-0 fish body length (buildGeometry)
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
        ['minnow', 5], ['reeffish', 10], ['mackerel', 12], ['parrot', 18],
        ['grouper', 30], ['tuna', 44], ['dolphinfish', 60], ['swordfish', 70],
        ['marlin', 95], ['abyssal', 200], ['leviathanprey', 420]
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
    result.notes.push('12 fusiform prey defs lofted into cached one-geometry records');
    result.notes.push(`8 stations x 6 radial body, forked tail fan, dorsal sliver, pectoral fin pair, 8-triangle eye accents; max ${TRIANGLE_LIMIT} triangles`);
    result.notes.push('vertex colors carry dorsal base -> flank accent -> belly countershading');
    result.notes.push('Rev 6 saturation pass: mackerel/swordfish/grouper/anglerprey/abyssal/leviathanprey pushed to richer, cyberpunk-adjacent accents while keeping species hue family and belly contrast');
    result.notes.push('every prey id carries a distinct palette-tagged geometry and vertex color bake');
    result.notes.push('fish bend contract exposes uBendPhase/uBendAmp/uBendK/uBendSpan with fresh uniform bundles; panic-path 2x base amplitude verified sane (<40% body length) -- the doubling write itself is world3d.js/Lane W territory');
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
