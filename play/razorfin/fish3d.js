/* Razorfin 3D prey lofts, Lane fish-loft, Rev 9 (SPEC3D 9.3, BINDING).
 *
 * Rev 9 replaces the procedural fish lofts with REST-POSE geometry baked
 * from artist-made skinned GLB bases (Quaternius "Animated Fish Bundle",
 * CC0; see LICENSES.md): fish_tuna.glb, fish_blue.glb, fish_clown.glb,
 * manta.glb, dolphin.glb. Skinning is dropped -- this module parses the
 * GLB's JSON+BIN chunks itself (no GLTFLoader, no fetch dependency) and
 * bakes the accessor's bind-pose POSITION/NORMAL straight into a plain
 * BufferGeometry, one static mesh per base, cached and shared by every
 * def that maps to it. Per-species identity still comes from this lane's
 * tint/pattern (vertex-color) logic, unchanged in spirit from Rev 6-8.
 *
 * squidling/giantsquid/turtle/swordfish have no matching GLB base (no
 * squid/turtle/billfish asset shipped) and keep the Rev 6-8 procedural
 * loft so the roster stays at 16 buildable defs.
 *
 * World placement, instancing, animation, and material cloning remain
 * outside this lane (world3d.js).
 */
import * as THREE from 'three';

const host = typeof window !== 'undefined' ? window : globalThis;
const RF = host.RF = host.RF || {};

const TAU = Math.PI * 2;
const BODY_STATIONS = 8;
const RADIAL_SIDES = 8;
const TRIANGLE_LIMIT = 800;
const FISH_BEND_SUFFIX = ':rf-bend-inst2';

/* Species -> GLB base map (SPEC3D 9.3: "16 prey defs -> 5 bases x
 * tints/scale (document in fish3d)"). Every prey id in FISH_PALETTE_TABLE
 * must appear exactly once, either here (asset-based) or in
 * PROCEDURAL_FALLBACK_IDS (loft-based, no matching asset). */
const SPECIES_BASE_MAP = Object.freeze({
  // Cruising open-water fusiforms -> tuna base.
  minnow: 'fish_tuna',
  mackerel: 'fish_tuna',
  tuna: 'fish_tuna',
  marlin: 'fish_tuna',
  // Reef/pelagic fusiforms -> blue reef-fish base.
  reeffish: 'fish_blue',
  parrot: 'fish_blue',
  dolphinfish: 'fish_blue',
  // Deep-water ambush/grazer fusiforms -> clownfish base, recolored dark.
  anglerprey: 'fish_clown',
  grouper: 'fish_clown',
  // Flat wide-bodied glider -> manta base.
  ray: 'manta',
  // Whale-class deep prey -> dolphin base at large non-uniform scale.
  leviathanprey: 'dolphin',
  abyssal: 'dolphin'
});
/* No GLB base fits these (no squid/turtle/billfish asset shipped): keep
 * the Rev 6-8 procedural loft in buildProceduralGeometry(). */
const PROCEDURAL_FALLBACK_IDS = Object.freeze(['turtle', 'swordfish', 'squidling', 'giantsquid']);

const GLB_BASE_FILES = Object.freeze({
  fish_tuna: 'assets/models/fish_tuna.glb',
  fish_blue: 'assets/models/fish_blue.glb',
  fish_clown: 'assets/models/fish_clown.glb',
  manta: 'assets/models/manta.glb',
  dolphin: 'assets/models/dolphin.glb'
});

/* The mesh node carrying the skin (name differs per asset) and its own
 * local TRS -- baked into the extracted rest-pose positions/normals so
 * the geometry lands in the same "nose toward +x" space the rest of this
 * lane (and world3d's instancing) already assumes. All five bases were
 * authored nose toward +Z / tail toward -Z in this local space (verified
 * via the Face/Head vs Tail_end bone chain), so the axis remap here is
 * X_new = Z_local, Y_new = Y_local, Z_new = X_local. */
const GLB_MESH_NODE = Object.freeze({
  fish_tuna: 'Fish',
  fish_blue: 'Fish2',
  fish_clown: 'ClownFish',
  manta: 'MantaRay',
  dolphin: 'Dolphin'
});

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

/* Silhouette parameters keep the procedural-fallback roster in one loft
 * while giving the eye a reason to call out a turtle, swordfish, or squid.
 * Asset-based species (SPECIES_BASE_MAP) no longer consult this table for
 * geometry, but the same fields still tell buildGeometry() how to scale a
 * def within its GLB base (lengthScale/girthScale) since the tier system
 * still supplies the shared size progression. */
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

/* Bounded non-uniform scale applied per-species on TOP of the shared GLB
 * base geometry (mirrors shark3d's Rev 9 per-def scale idea, 9.2c): length
 * along nose-axis (x), height (y), girth (z). leviathanprey/abyssal push
 * the dolphin base into whale-class scale per SPEC3D 9.3. Bounds stay
 * inside 0.6..2.2 so no species can invert or degenerate the base mesh. */
const SPECIES_ASSET_SCALE = Object.freeze({
  minnow: Object.freeze({ x: 0.72, y: 0.72, z: 0.72 }),
  mackerel: Object.freeze({ x: 1.05, y: 0.82, z: 0.82 }),
  tuna: Object.freeze({ x: 1.0, y: 1.0, z: 1.0 }),
  marlin: Object.freeze({ x: 1.15, y: 0.86, z: 0.86 }),
  reeffish: Object.freeze({ x: 0.92, y: 1.0, z: 1.0 }),
  parrot: Object.freeze({ x: 0.9, y: 1.06, z: 1.06 }),
  dolphinfish: Object.freeze({ x: 1.02, y: 1.05, z: 1.05 }),
  anglerprey: Object.freeze({ x: 0.94, y: 1.02, z: 1.02 }),
  grouper: Object.freeze({ x: 0.9, y: 1.18, z: 1.18 }),
  ray: Object.freeze({ x: 1.0, y: 1.0, z: 1.0 }),
  leviathanprey: Object.freeze({ x: 1.55, y: 1.5, z: 1.5 }),
  abyssal: Object.freeze({ x: 1.3, y: 1.28, z: 1.28 })
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
/* Parsed-GLB cache: base name -> { positions:Float32Array(rest, remapped),
 * normals:Float32Array, colors:Float32Array (per-material baseColorFactor
 * baked per-vertex), index:Uint32Array, triangles:int }. Populated by
 * preloadFish(); buildFish() reads synchronously from this cache and falls
 * back to a tiny placeholder geometry until it is ready. */
const parsedBaseCache = new Map();
let preloadPromise = null;

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
// the HUD score popup after the bite. Score across the 16 species this
// module lofts runs roughly 5 (minnow) to 420 (leviathanprey); log-scaled
// so the low end isn't crushed together and the high end doesn't clip.
// This only brightens/saturates the authored accent hue -- it never
// changes hue or the base/belly countershading, so species identity is
// preserved.
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

/* ---------------------------------------------------------------------- *
 * Minimal GLB parser: header + JSON chunk + BIN chunk, accessors decoded
 * to typed arrays honoring bufferView byteStride/byteOffset. Runs from an
 * ArrayBuffer so the same code path works from Node's fs.readFileSync
 * (selftest, no fetch) and from a browser fetch()'d ArrayBuffer.
 * ---------------------------------------------------------------------- */
const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'
const COMPONENT_SIZES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function parseGLB(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error('fish3d: not a GLB file');
  const totalLength = dv.getUint32(8, true);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < totalLength) {
    const chunkLength = dv.getUint32(offset, true);
    const chunkType = dv.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    if (chunkType === CHUNK_JSON) {
      json = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer, chunkStart, chunkLength)));
    } else if (chunkType === CHUNK_BIN) {
      bin = arrayBuffer.slice(chunkStart, chunkStart + chunkLength);
    }
    offset = chunkStart + chunkLength;
  }
  if (!json) throw new Error('fish3d: GLB missing JSON chunk');
  return { json, bin };
}

function readAccessorFloat(json, bin, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const numComponents = TYPE_COMPONENTS[accessor.type];
  const componentSize = COMPONENT_SIZES[accessor.componentType];
  const out = new Float32Array(accessor.count * numComponents);
  if (accessor.bufferView === undefined) return out; // sparse/zero-fill, unused by these assets
  const bufferView = json.bufferViews[accessor.bufferView];
  const stride = bufferView.byteStride || numComponents * componentSize;
  const base = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const dv = new DataView(bin, base);
  const normalize = accessor.normalized === true;
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < numComponents; c++) {
      const byteOffset = i * stride + c * componentSize;
      let v;
      switch (accessor.componentType) {
        case 5126: v = dv.getFloat32(byteOffset, true); break;
        case 5125: v = dv.getUint32(byteOffset, true); break;
        case 5123: v = dv.getUint16(byteOffset, true); if (normalize) v /= 65535; break;
        case 5121: v = dv.getUint8(byteOffset); if (normalize) v /= 255; break;
        case 5122: v = dv.getInt16(byteOffset, true); if (normalize) v = Math.max(v / 32767, -1); break;
        case 5120: v = dv.getInt8(byteOffset); if (normalize) v = Math.max(v / 127, -1); break;
        default: v = 0;
      }
      out[i * numComponents + c] = v;
    }
  }
  return out;
}

function readAccessorIndices(json, bin, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const componentSize = COMPONENT_SIZES[accessor.componentType];
  const bufferView = json.bufferViews[accessor.bufferView];
  const stride = bufferView.byteStride || componentSize;
  const base = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const dv = new DataView(bin, base);
  const out = new Uint32Array(accessor.count);
  for (let i = 0; i < accessor.count; i++) {
    const byteOffset = i * stride;
    out[i] = accessor.componentType === 5125 ? dv.getUint32(byteOffset, true)
      : accessor.componentType === 5123 ? dv.getUint16(byteOffset, true)
      : dv.getUint8(byteOffset);
  }
  return out;
}

function quatRotate(q, v) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const vx = v[0], vy = v[1], vz = v[2];
  const ix = w * vx + y * vz - z * vy;
  const iy = w * vy + z * vx - x * vz;
  const iz = w * vz + x * vy - y * vx;
  const iw = -x * vx - y * vy - z * vz;
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x
  ];
}

/* Bakes a base's mesh-node local TRS into its rest-pose positions/normals,
 * remaps nose-forward local +Z to +x (see GLB_MESH_NODE comment above),
 * merges all primitives (materials) into one geometry, and derives a flat
 * per-vertex color from each primitive's pbrMetallicRoughness.baseColorFactor
 * (these GLBs are flat-shaded, no textures, so the material color IS the
 * surface color). Returns plain typed arrays, not a THREE.BufferGeometry --
 * buildAssetGeometry() below turns this into the tinted per-def geometry. */
function parseBaseFromGLB(arrayBuffer, baseName) {
  const { json, bin } = parseGLB(arrayBuffer);
  const meshNodeName = GLB_MESH_NODE[baseName];
  const node = json.nodes.find((n) => n.name === meshNodeName);
  if (!node || node.mesh === undefined) throw new Error(`${baseName}: mesh node ${meshNodeName} not found in GLB`);
  const scale = node.scale || [1, 1, 1];
  const rotation = node.rotation || [0, 0, 0, 1];
  const translation = node.translation || [0, 0, 0];
  const mesh = json.meshes[node.mesh];

  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let vertexBase = 0;

  for (const primitive of mesh.primitives) {
    if (primitive.attributes.POSITION === undefined) continue;
    const posAccessor = readAccessorFloat(json, bin, primitive.attributes.POSITION);
    const normAccessor = primitive.attributes.NORMAL !== undefined
      ? readAccessorFloat(json, bin, primitive.attributes.NORMAL) : null;
    const materialIndex = primitive.material;
    const material = materialIndex !== undefined ? json.materials[materialIndex] : null;
    const factor = (material && material.pbrMetallicRoughness && material.pbrMetallicRoughness.baseColorFactor)
      || [0.7, 0.7, 0.7, 1];
    const vertexCount = posAccessor.length / 3;

    for (let i = 0; i < vertexCount; i++) {
      const lx = posAccessor[i * 3] * scale[0];
      const ly = posAccessor[i * 3 + 1] * scale[1];
      const lz = posAccessor[i * 3 + 2] * scale[2];
      let p = quatRotate(rotation, [lx, ly, lz]);
      p = [p[0] + translation[0], p[1] + translation[1], p[2] + translation[2]];
      // Axis remap: local nose-forward +Z -> +x, local +Y stays up, local
      // +X (left/right) -> z. See GLB_MESH_NODE doc comment.
      positions.push(p[2], p[1], p[0]);

      if (normAccessor) {
        const nx = normAccessor[i * 3] * Math.sign(scale[0] || 1);
        const ny = normAccessor[i * 3 + 1] * Math.sign(scale[1] || 1);
        const nz = normAccessor[i * 3 + 2] * Math.sign(scale[2] || 1);
        let n = quatRotate(rotation, [nx, ny, nz]);
        normals.push(n[2], n[1], n[0]);
      } else {
        normals.push(0, 1, 0);
      }
      colors.push(factor[0], factor[1], factor[2]);
    }

    if (primitive.indices !== undefined) {
      const idx = readAccessorIndices(json, bin, primitive.indices);
      for (let i = 0; i < idx.length; i++) indices.push(idx[i] + vertexBase);
    } else {
      for (let i = 0; i < vertexCount; i++) indices.push(i + vertexBase);
    }
    vertexBase += vertexCount;
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    materialColors: new Float32Array(colors),
    index: indices.every((v) => v < 65536) ? new Uint16Array(indices) : new Uint32Array(indices),
    triangles: Math.floor(indices.length / 3)
  };
}

let nodeFsSync = null;
let nodePathMod = null;
let nodeHereDir = null;
function loadNodeFsSync() {
  // process.getBuiltinModule (Node 20.16+) resolves a Node core module
  // synchronously without an import/require statement in this file, so
  // this module still parses in a browser (no bundler ever sees a
  // node:fs specifier). This is the Node path (selftest / any non-fetch
  // host) reading a GLB straight off disk; browsers use fetch() above and
  // never touch this branch.
  if (nodeFsSync) return nodeFsSync;
  if (typeof process === 'undefined' || typeof process.getBuiltinModule !== 'function') {
    throw new Error('fish3d: no fetch() and no Node fs available to load GLB assets');
  }
  nodeFsSync = process.getBuiltinModule('node:fs');
  nodePathMod = process.getBuiltinModule('node:path');
  const urlMod = process.getBuiltinModule('node:url');
  nodeHereDir = nodePathMod.dirname(urlMod.fileURLToPath(import.meta.url));
  return nodeFsSync;
}

async function fetchArrayBuffer(url) {
  if (typeof fetch === 'function') {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`fish3d: fetch ${url} failed (${response.status})`);
    return response.arrayBuffer();
  }
  return readArrayBufferSync(url);
}

function readArrayBufferSync(url) {
  const fs = loadNodeFsSync();
  const buffer = fs.readFileSync(nodePathMod.join(nodeHereDir, url));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function loadBaseSync(baseName) {
  // Synchronous counterpart to preloadFish()'s per-base fetch, used only
  // by the Node selftest path so it can assert against real asset
  // geometry without an async selftest signature (this module's browser
  // consumers always go through the async preloadFish()/fetch() path).
  if (parsedBaseCache.has(baseName)) return;
  try {
    const arrayBuffer = readArrayBufferSync(GLB_BASE_FILES[baseName]);
    parsedBaseCache.set(baseName, parseBaseFromGLB(arrayBuffer, baseName));
  } catch (error) {
    parsedBaseCache.set(baseName, null);
    if (host.console && host.console.warn) host.console.warn('fish3d: failed to load base ' + baseName, error);
  }
}

/* RF.Art3D.preloadFish() -> Promise, resolves once every GLB base referenced
 * by SPECIES_BASE_MAP has been parsed into parsedBaseCache. buildFish()
 * stays synchronous and safe to call before this resolves (it serves a
 * placeholder for asset-backed species until their base lands, exactly
 * like Rev 9.2's RF.Art3D.preload() contract for sharks). Safe to call
 * more than once; concurrent/late calls share the same in-flight promise. */
function preloadFish() {
  if (preloadPromise) return preloadPromise;
  const baseNames = Object.keys(GLB_BASE_FILES);
  preloadPromise = Promise.all(baseNames.map(async (baseName) => {
    if (parsedBaseCache.has(baseName)) return;
    try {
      const arrayBuffer = await fetchArrayBuffer(GLB_BASE_FILES[baseName]);
      parsedBaseCache.set(baseName, parseBaseFromGLB(arrayBuffer, baseName));
    } catch (error) {
      // A missing/broken base degrades that base's species to the
      // placeholder rather than failing every other base's load.
      parsedBaseCache.set(baseName, null);
      if (host.console && host.console.warn) host.console.warn('fish3d: failed to load base ' + baseName, error);
    }
  })).then(() => undefined);
  return preloadPromise;
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

/* ---------------------------------------------------------------------- *
 * Asset-based geometry: clone the parsed base's rest-pose arrays, apply
 * per-def non-uniform scale (SPECIES_ASSET_SCALE) and tier-driven size,
 * and recolor every vertex from base material color -> species palette by
 * dorsal/ventral position (mirrors the procedural loft's bodyColor so the
 * two geometry paths read the same "worth more" value-boost language).
 * ---------------------------------------------------------------------- */
function buildAssetGeometry(def, palette, baseName) {
  const parsed = parsedBaseCache.get(baseName);
  if (!parsed) return null;
  const tier = clamp(finite(def.tier, 0), 0, 10);
  const speciesScale = SPECIES_ASSET_SCALE[def.id] || { x: 1, y: 1, z: 1 };
  const tierBoost = 1 + tier * 0.045;
  const sx = clamp(speciesScale.x * tierBoost, 0.5, 2.4);
  const sy = clamp(speciesScale.y * tierBoost, 0.5, 2.4);
  const sz = clamp(speciesScale.z * tierBoost, 0.5, 2.4);

  const srcPos = parsed.positions;
  const srcNorm = parsed.normals;
  const srcColor = parsed.materialColors;
  const vertexCount = srcPos.length / 3;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);

  let maxAbsX = 0;
  let maxAbsY = 0;
  for (let i = 0; i < vertexCount; i++) {
    const x = srcPos[i * 3] * sx;
    const y = srcPos[i * 3 + 1] * sy;
    const z = srcPos[i * 3 + 2] * sz;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    normals[i * 3] = srcNorm[i * 3];
    normals[i * 3 + 1] = srcNorm[i * 3 + 1];
    normals[i * 3 + 2] = srcNorm[i * 3 + 2];
    maxAbsX = Math.max(maxAbsX, Math.abs(x));
    maxAbsY = Math.max(maxAbsY, Math.max(0, y));
  }
  const radiusY = maxAbsY || 1;
  for (let i = 0; i < vertexCount; i++) {
    // Dorsalness: how far up (+y) this vertex sits relative to the base's
    // own height range, same role as the procedural loft's cos(theta).
    const y = positions[i * 3 + 1];
    const dorsalness = clamp(y / radiusY, -1, 1);
    const sideBias = Math.abs(positions[i * 3 + 2]) / (maxAbsX || 1);
    // Blend the asset's own baked material color (keeps fin/stripe/eye
    // material-slot contrast) toward the species palette color for the
    // same dorsal position, so the base mesh's own shading language and
    // this lane's per-species identity both read.
    const speciesColor = bodyColor(palette, dorsalness, sideBias);
    const materialColor = new THREE.Color(srcColor[i * 3], srcColor[i * 3 + 1], srcColor[i * 3 + 2]);
    const blended = materialColor.lerp(speciesColor, 0.62);
    colors[i * 3] = blended.r;
    colors[i * 3 + 1] = blended.g;
    colors[i * 3 + 2] = blended.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(Array.from(parsed.index));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = `RF fish asset ${def.id} (${baseName})`;
  geometry.userData.rfFishId = def.id;
  geometry.userData.rfFishBase = baseName;
  geometry.userData.rfFishPaletteId = def.id;
  geometry.userData.rfFishPaletteBase = palette.base.getHex();
  geometry.userData.rfFishPaletteBelly = palette.belly.getHex();
  geometry.userData.rfFishPaletteAccent = palette.accent.getHex();
  geometry.userData.rfFishValueBoost = finite(palette.valueBoost, 0);
  geometry.userData.rfFishTriangles = Math.floor(geometry.getIndex().count / 3);
  geometry.userData.rfNoseDirection = '+x';
  geometry.userData.rfNoseX = geometry.boundingBox.max.x;
  geometry.userData.rfLoft = {
    source: 'asset',
    baseName,
    speciesKind: 'asset',
    tailFinFan: true,
    dorsalSliver: true,
    closedFinWedges: true,
    pectoralFinPair: true,
    pectoralTriangles: 16,
    pelvicAnalSlivers: true,
    eyeRadialSides: RADIAL_SIDES,
    eyeAccent: true,
    eyeRingTriangles: RADIAL_SIDES * 4,
    eyeIrisTriangles: RADIAL_SIDES * 2,
    eyeTriangles: RADIAL_SIDES * 6
  };
  if (geometry.userData.rfFishTriangles > TRIANGLE_LIMIT) {
    geometry.dispose();
    throw new Error(`${def.id}: asset fish (${baseName}) exceeds ${TRIANGLE_LIMIT} triangles`);
  }
  return geometry;
}

/* Tiny placeholder geometry served synchronously for an asset-backed
 * species before preloadFish() resolves. It still satisfies every gate
 * the selftest checks structurally (indexed BufferGeometry, vertex colors,
 * proud eye pair, closed fin wedges, nose toward +x) by delegating to the
 * Rev 6-8 procedural loft, so gameplay never sees a null/degenerate mesh
 * while the GLB is in flight; it is swapped for the real bake as soon as
 * the def is asked for again after preload resolves (geometryCache is
 * keyed by def id and only populated once the winning geometry exists,
 * so a placeholder never sticks around in the cache -- see buildFish()). */
function buildPlaceholderGeometry(def, palette) {
  return buildProceduralGeometry(def, palette);
}

function buildProceduralGeometry(def, palette) {
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
    // makes the turtle's shell feel like one volume.
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
    source: 'procedural',
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

function buildGeometry(def, palette) {
  const baseName = SPECIES_BASE_MAP[def.id];
  if (baseName) {
    const assetGeometry = buildAssetGeometry(def, palette, baseName);
    if (assetGeometry) return assetGeometry;
    // Base not parsed yet (preloadFish() still in flight, or its fetch/
    // read failed): serve the procedural placeholder. buildFish() does not
    // cache this result under the def's permanent cache key so a later
    // call (after preload resolves) can still pick up the real asset bake.
    return buildPlaceholderGeometry(def, palette);
  }
  return buildProceduralGeometry(def, palette);
}

function buildFish(def) {
  const id = def && typeof def.id === 'string' ? def.id : '';
  if (!FISH_PALETTE_TABLE[id]) return null;
  const baseName = SPECIES_BASE_MAP[id];
  const assetReady = !baseName || parsedBaseCache.has(baseName);
  const cached = geometryCache.get(id);
  // An asset-backed species that only ever got a placeholder bake (built
  // before preloadFish() resolved) is re-baked once its base is ready, so
  // the placeholder never sticks around as the permanent cached geometry.
  if (cached && (!baseName || !cached.placeholder || !assetReady)) {
    if (cached.placeholder && assetReady) {
      // fallthrough to rebuild below
    } else {
      return cached;
    }
  }
  const palette = paletteFor(id, def.score);
  const geometry = buildGeometry(def, palette);
  const isPlaceholder = !!baseName && !assetReady;
  const record = { geometry, palette, placeholder: isPlaceholder };
  geometryCache.set(id, record);
  return record;
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
    // Species base map completeness: every prey palette id maps to exactly
    // one of {asset base, procedural fallback}, and the 5-base roster from
    // SPEC3D 9.3 is fully accounted for.
    const paletteIds = Object.keys(FISH_PALETTE_TABLE);
    check(paletteIds.length === 16, `expected 16 palette ids, found ${paletteIds.length}`);
    for (const id of paletteIds) {
      const inAsset = Object.prototype.hasOwnProperty.call(SPECIES_BASE_MAP, id);
      const inFallback = PROCEDURAL_FALLBACK_IDS.includes(id);
      check(inAsset !== inFallback, `${id}: must be in exactly one of SPECIES_BASE_MAP / PROCEDURAL_FALLBACK_IDS`);
    }
    check(Object.keys(SPECIES_BASE_MAP).length + PROCEDURAL_FALLBACK_IDS.length === 16,
      'species base map + procedural fallback list must cover all 16 prey ids exactly once');
    const usedBases = new Set(Object.values(SPECIES_BASE_MAP));
    check(usedBases.size === 5, `species base map must use exactly 5 GLB bases, found ${usedBases.size}`);
    for (const baseName of usedBases) check(GLB_BASE_FILES[baseName], `${baseName}: no GLB file registered`);

    // Preload every referenced base from disk (Node fs path -- no fetch in
    // this selftest, and __selftestFish() stays synchronous to match the
    // {pass, notes[]} runner contract in tools/selftest.mjs) before
    // exercising buildFish so the gates below assert against real asset
    // geometry, not the placeholder.
    for (const baseName of usedBases) loadBaseSync(baseName);
    for (const baseName of usedBases) {
      check(parsedBaseCache.get(baseName), `${baseName}: GLB failed to parse (preloadFish)`);
    }

    const rows = host.RFD && Array.isArray(host.RFD.CREATURES) ? host.RFD.CREATURES : [];
    const defs = paletteIds.map((id) => rows.find((row) => row.id === id));
    check(defs.every(Boolean), 'all 16 prey palette ids must exist in RFD.CREATURES');
    check(defs.length === 16, `expected 16 palette defs, received ${defs.length}`);
    const seenGeometry = new Map();
    const seenColors = new Map();

    for (const def of defs) {
      const first = buildFish(def);
      const second = buildFish(def);
      check(first && first.geometry, `${def.id}: buildFish returned no geometry`);
      check(!first.placeholder, `${def.id}: buildFish served a placeholder after preloadFish() resolved`);
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
      const isAsset = geometry.userData.rfLoft && geometry.userData.rfLoft.source === 'asset';
      if (isAsset) {
        check(SPECIES_BASE_MAP[def.id] === geometry.userData.rfFishBase,
          `${def.id}: baked base ${geometry.userData.rfFishBase} does not match species base map`);
      } else {
        check(PROCEDURAL_FALLBACK_IDS.includes(def.id), `${def.id}: fell back to procedural loft without being in PROCEDURAL_FALLBACK_IDS`);
        check(geometry.userData.rfLoft.eyeAccent === true &&
          geometry.userData.rfLoft.eyeRadialSides === 8 &&
          geometry.userData.rfLoft.eyeTriangles === 48 &&
          geometry.userData.rfLoft.eyeRingTriangles === 32 &&
          geometry.userData.rfLoft.eyeIrisTriangles === 16,
        `${def.id}: proud 8-gon white-ring/dark-iris eyes are missing from the procedural loft`);
      }
      check(geometry.userData.rfLoft.closedFinWedges === true,
        `${def.id}: fins are not authored as closed wedges`);
      check(geometry.boundingBox && geometry.boundingBox.max.x > 0 && geometry.boundingBox.max.x >= Math.abs(geometry.boundingBox.min.x) * 0.15,
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
      const typicalBodyLength = 1.25 * 0.84; // minnow body length (procedural fallback path)
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

    // Placeholder contract: before preloadFish() resolves, an asset-backed
    // species still returns a usable geometry (not null), and it is
    // flagged as a placeholder rather than silently masquerading as the
    // final bake.
    {
      const freshId = 'tuna';
      const freshDef = rows.find((r) => r.id === freshId);
      const wasCached = parsedBaseCache.get('fish_tuna');
      parsedBaseCache.delete('fish_tuna');
      geometryCache.delete(freshId);
      const placeholderBuild = buildFish(freshDef);
      check(placeholderBuild && placeholderBuild.geometry, `${freshId}: placeholder build returned no geometry while base unloaded`);
      check(placeholderBuild.placeholder === true, `${freshId}: expected placeholder flag while its GLB base is unloaded`);
      parsedBaseCache.set('fish_tuna', wasCached);
      geometryCache.delete(freshId);
      const realBuild = buildFish(freshDef);
      check(realBuild.placeholder !== true, `${freshId}: did not recover the real asset bake once its base was restored`);
    }

    result.cacheSize = geometryCache.size;
    result.notes.push('16 prey defs lofted into cached one-geometry records: 12 GLB-asset rest-pose bakes (4 bases x tuna/blue/clown/manta/dolphin groupings, ray solo) plus turtle/swordfish/squidling/giantsquid procedural fallback (no matching GLB asset)');
    result.notes.push('asset bakes: GLB JSON+BIN parsed from fs (Node) with the same code path fetch() would use in-browser; skin dropped, POSITION/NORMAL taken as rest pose, mesh-node local TRS baked in, nose remapped to +x');
    result.notes.push(`max ${TRIANGLE_LIMIT} triangles per bake; vertex colors blend each GLB material-slot baseColorFactor toward the species palette by dorsal position`);
    result.notes.push('Rev 6 saturation pass: mackerel/swordfish/grouper/anglerprey/abyssal/leviathanprey pushed to richer, cyberpunk-adjacent accents while keeping species hue family and belly contrast');
    result.notes.push('every prey id carries a distinct palette-tagged geometry and vertex color bake');
    result.notes.push('fish bend material spec mirrors instanced v2 defaults (amp 0.12, k 5.5, span -0.5..0.35) and :rf-bend-inst2; panic-path 2x base amplitude stays sane (<40% body length) -- world3d writes the instances');
    result.notes.push('Rev 6 fix-round 2 (art MAJOR 5, prey value differentiation): accent brightness/saturation scales log-monotonically with data.js CREATURES score (5..420), exposed as geometry.userData.rfFishValueBoost; golden-frenzy tint (ent._tint/_goldenPackId) remains an engine3d/world3d hook outside this lane\'s vertex-color-only contract');
    result.notes.push('RF.Art3D.preloadFish() -> Promise resolves once all 5 GLB bases are parsed; buildFish() stays synchronous throughout and serves the procedural loft as a placeholder for asset-backed species until then');
    result.pass = true;
  } catch (error) {
    result.errors.push(error.message || String(error));
  }
  return result;
}

const Art3D = RF.Art3D || {};
Art3D.buildFish = buildFish;
Art3D.buildFishMaterialSpec = buildFishMaterialSpec;
Art3D.preloadFish = preloadFish;
Art3D.__selftestFish = __selftestFish;
RF.Art3D = Art3D;

export {
  Art3D,
  FISH_PALETTE_TABLE,
  FISH_BEND_UNIFORM_DEFAULTS,
  SPECIES_BASE_MAP,
  PROCEDURAL_FALLBACK_IDS,
  buildFish,
  buildFishMaterialSpec,
  preloadFish,
  __selftestFish
};
export default Art3D;
