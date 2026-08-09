// stage.js — Rally Dust stage data, seeded generation and 3D geometry.
//
// The archived 2D prototype is the design document. Its mulberry32 seed, its
// event roll (jump / rocks / chicane / hairpin / turn), its heading integration
// and its tree and rock scatter are carried across unchanged, so a seed still
// produces the same stage shape. What is new for the 3D build:
//   * an elevation channel (the prototype only had a cosmetic crest bounce)
//   * a per-node surface channel (the drift-weighted grip model)
//   * merged vertex-coloured geometry for road, verge, terrain and props
//
// Foundation note: the merged-geometry, sky-dome and star-field patterns are
// adapted from the sibling Three.js title Redline GT. Nothing is imported from
// it; the two titles stay independent.
import * as THREE from 'three';

export const WORLD_SCALE = 0.055;   // prototype unit -> world metre
export const STAGE_LIMIT = 90;      // prototype constant, seconds
export const CAR_LENGTH = 4.35;     // world metres

// ---------------------------------------------------------------- surfaces
// `stick` scales the prototype's lateral-retention exponent: a higher stick
// kills sideways speed faster, so the car grips. `turn` scales the prototype's
// turn authority and `drive` scales acceleration and braking. The prototype's
// tuned pair (retention .79 rolling, .53 on the handbrake) is the baseline at
// stick 1.0, so gravel behaves exactly as the design document did.
export const SURFACES = [
  { id: 'gravel',   name: 'GRAVEL',   stick: 1.00, turn: 1.00, drive: 1.00, road: 0x8a7150, edge: 0xa88a63, dust: 0xd8bd8a, grit: 1.00 },
  { id: 'hardpack', name: 'HARDPACK', stick: 1.34, turn: 1.05, drive: 1.08, road: 0x6f5b41, edge: 0x88704f, dust: 0xc0a97e, grit: 0.62 },
  { id: 'sand',     name: 'SAND',     stick: 0.74, turn: 0.92, drive: 0.88, road: 0xc09a5e, edge: 0xd8b478, dust: 0xf0d69c, grit: 1.35 },
  { id: 'mud',      name: 'MUD',      stick: 0.66, turn: 0.86, drive: 0.82, road: 0x4c3d2c, edge: 0x5e4c36, dust: 0x7a6544, grit: 1.20 },
  { id: 'snow',     name: 'SNOW',     stick: 0.58, turn: 0.80, drive: 0.78, road: 0xdae6ef, edge: 0xf2f8fc, dust: 0xffffff, grit: 1.45 },
  { id: 'tarmac',   name: 'TARMAC',   stick: 1.85, turn: 1.14, drive: 1.16, road: 0x3b3f46, edge: 0x555b64, dust: 0x9aa0a8, grit: 0.22 },
];
export const SURFACE_INDEX = {};
SURFACES.forEach((s, i) => { SURFACE_INDEX[s.id] = i; });

// ------------------------------------------------------------------ biomes
// Time of day across the biome list is the cheapest variety multiplier in this
// lane (art bible): dawn forest, dusk canyon, noon alpine, night coast.
export const BIOMES = {
  pine: {
    id: 'pine', name: 'Pine Coast', timeOfDay: 'dawn',
    sky: { top: 0x1f4f86, mid: 0x8aa6b6, bot: 0xf3c184 },
    sun: { color: 0xffd6a0, intensity: 0.82, dir: [-0.42, 0.46, 0.78] },
    hemi: { sky: 0xffd0a2, ground: 0x3a4630, intensity: 0.48 },
    fog: 0xc9a37c, fogDensity: 0.00195,
    ground: 0x51612f, groundAlt: 0x63713c,
    accent: 0xffc768,
    props: 'pine', propColors: [0x2e5330, 0x3f6d3a, 0x5b432c],
    surfaces: ['gravel', 'gravel', 'hardpack', 'mud'],
  },
  canyon: {
    id: 'canyon', name: 'Ember Basin', timeOfDay: 'dusk',
    sky: { top: 0x4c1f5e, mid: 0x9c3548, bot: 0xf5854a },
    sun: { color: 0xffb887, intensity: 0.88, dir: [0.66, 0.36, 0.64] },
    hemi: { sky: 0xff9a63, ground: 0x4a2a20, intensity: 0.52 },
    fog: 0xc2664a, fogDensity: 0.00205,
    ground: 0x9a5c34, groundAlt: 0xb5703c,
    accent: 0xff9d4f,
    props: 'mesa', propColors: [0x8a4e30, 0xa76338, 0x5e3524],
    surfaces: ['sand', 'hardpack', 'gravel', 'sand'],
  },
  alpine: {
    id: 'alpine', name: 'Frost Ridge', timeOfDay: 'noon',
    sky: { top: 0x2f7fc4, mid: 0x7cb2d0, bot: 0xdcf0f6 },
    sun: { color: 0xffffff, intensity: 0.90, dir: [0.28, 0.84, 0.44] },
    hemi: { sky: 0xc9e6f5, ground: 0x76808d, intensity: 0.54 },
    fog: 0xaecddd, fogDensity: 0.00215,
    ground: 0xdae6ee, groundAlt: 0xbed2e0,
    accent: 0x6fd2ff,
    props: 'fir', propColors: [0x28503f, 0x37654c, 0xe8f2f8],
    surfaces: ['snow', 'snow', 'gravel', 'hardpack'],
  },
  coast: {
    id: 'coast', name: 'Nightfall Run', timeOfDay: 'night',
    sky: { top: 0x0e1740, mid: 0x1e2858, bot: 0x54417e },
    sun: { color: 0x9fbcff, intensity: 0.50, dir: [0.52, 0.58, -0.60] },
    hemi: { sky: 0x7186c8, ground: 0x141a2c, intensity: 0.36 },
    fog: 0x1d2650, fogDensity: 0.00250,
    ground: 0x2b3550, groundAlt: 0x333e5d,
    accent: 0x7de4eb,
    props: 'pylon', propColors: [0x2b3854, 0x7de4eb, 0x1b2338],
    surfaces: ['tarmac', 'gravel', 'mud', 'gravel'],
    stars: true,
  },
};

// ----------------------------------------------------------------- stages
// Four rallies of four stages. The five prototype stage names and seeds open
// the ladder (DUSTLINE, PINE NEEDLE, RAVINE KICK, EMBER PASS, NIGHTFALL RUN)
// so the design document's content graph survives the rebuild.
const RALLY_DEFS = [
  {
    name: 'Pine Coast', biome: 'pine',
    blurb: 'Damp forest gravel under a low sun. The grip is honest here.',
    stages: [
      { name: 'DUSTLINE', seed: 0x41d72a },
      { name: 'PINE NEEDLE', seed: 0x9b27e1 },
      { name: 'HOLLOW MILE', seed: 0x2c6f93 },
      { name: 'CEDAR SPLIT', seed: 0x77b1c4 },
    ],
  },
  {
    name: 'Ember Basin', biome: 'canyon',
    blurb: 'Loose sand over baked hardpack. Everything runs wide.',
    stages: [
      { name: 'RAVINE KICK', seed: 0x6d84bf },
      { name: 'EMBER PASS', seed: 0xc3a519 },
      { name: 'COPPER WASH', seed: 0x18e35d },
      { name: 'KILN SWITCHBACK', seed: 0xa42f76 },
    ],
  },
  {
    name: 'Frost Ridge', biome: 'alpine',
    blurb: 'Packed snow with gravel showing through. Commit early.',
    stages: [
      { name: 'GLACIER GATE', seed: 0x5b90d2 },
      { name: 'WHITEOUT SPUR', seed: 0xe1746a },
      { name: 'CORNICE DROP', seed: 0x3908ab },
      { name: 'SUMMIT LADDER', seed: 0xbe5c31 },
    ],
  },
  {
    name: 'Nightfall Run', biome: 'coast',
    blurb: 'Wet tarmac into black gravel. Read the notes or read the trees.',
    stages: [
      { name: 'NIGHTFALL RUN', seed: 0xf01d33 },
      { name: 'HARBOUR LIGHTS', seed: 0x8237ce },
      { name: 'BLACK TIDE', seed: 0x4ad619 },
      { name: 'LAST LANTERN', seed: 0xd75e82 },
    ],
  },
];

// Length is a pure function of the tier so par times can be shown in the menu
// without generating the stage. Prototype formulae, with the tier (position
// inside a rally) standing in for the prototype's stage index so no stage ever
// grows past the 90 second limit.
// The prototype's length curve, shifted by six nodes so the sixteen-stage
// season clears the twenty minute content bar on a clean run. Every other
// generation constant (event rolls, spacing, magnitudes, step) is untouched.
function stageCount(tier) { return 606 + tier * 12; }
function stageStep(tier) { return 28 + tier * 1.2; }

export const STAGES = [];
export const RALLIES = [];
RALLY_DEFS.forEach((def, r) => {
  const ids = [];
  def.stages.forEach((s, tier) => {
    const units = stageCount(tier) * stageStep(tier);
    // 258 prototype units per second is the design document's clean-run pace.
    const par = Math.round(units / 258) + r * 2;
    const id = 'R' + (r + 1) + 'S' + (tier + 1);
    const stage = {
      id, name: s.name, seed: s.seed, tier, rally: r,
      biome: def.biome, rallyName: def.name,
      count: stageCount(tier), step: stageStep(tier),
      par,
      gold: Math.round(par * 1.04),
      silver: Math.round(par * 1.16),
      bronze: Math.min(88, Math.round(par * 1.30)),
      maxSpeed: 325 - r * 5,       // prototype constant, per rally
      index: STAGES.length,
    };
    STAGES.push(stage);
    ids.push(id);
  });
  RALLIES.push({
    index: r, name: def.name, biome: def.biome, blurb: def.blurb, stageIds: ids,
    par: ids.reduce((sum, id) => sum + STAGES.find((x) => x.id === id).par, 0),
  });
});

export function stageById(id) { return STAGES.find((s) => s.id === id) || null; }

// Prototype mulberry32, bit for bit.
export function mulberry(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function ease(t) { return t * t * (3 - 2 * t); }

// --------------------------------------------------------------- generation
// Prototype buildStage(), verbatim in its maths, plus the elevation and
// surface channels the 3D build needs.
export function buildLayout(stage) {
  const rng = mulberry(stage.seed);
  const count = stage.count;
  const step = stage.step;
  const idx = stage.tier;             // prototype's per-stage growth term
  const events = [];
  let at = 45;
  let sign = rng() > .5 ? 1 : -1;
  while (at < count - 40) {
    const roll = rng();
    const kind = roll < .13 ? 'jump' : roll < .25 ? 'rocks' : roll < .41 ? 'chicane' : roll < .59 ? 'hairpin' : 'turn';
    if (kind === 'jump' || kind === 'rocks') {
      events.push({ index: Math.round(at), kind, delta: 0, duration: 26, label: kind });
    } else if (kind === 'chicane') {
      sign *= -1;
      const magnitude = .72 + rng() * .2;
      events.push({ index: Math.round(at), kind, delta: sign * magnitude, duration: 23, label: 'chicane' });
      events.push({ index: Math.round(at + 17), kind: 'turn', delta: sign * -1.12, duration: 23, visualOnly: true, label: 'chicane' });
    } else {
      sign *= -1;
      const magnitude = kind === 'hairpin' ? 1.58 + rng() * .24 : .52 + rng() * .46;
      events.push({ index: Math.round(at), kind, delta: sign * magnitude, duration: kind === 'hairpin' ? 39 : 25, tightens: kind === 'turn' && rng() > .54 });
    }
    at += 45 + Math.floor(rng() * 38);
  }

  // Surface runs. A stage reads its biome's mix in blocks of 40-110 nodes, so
  // a pace note can honestly warn about a surface change ahead.
  const biome = BIOMES[stage.biome];
  const mix = biome.surfaces;
  const surface = new Uint8Array(count);
  {
    let i = 0;
    let pick = SURFACE_INDEX[mix[0]];
    while (i < count) {
      const run = 40 + Math.floor(rng() * 70);
      for (let k = 0; k < run && i < count; k++, i++) surface[i] = pick;
      let next = SURFACE_INDEX[mix[Math.floor(rng() * mix.length)]];
      if (next === pick && mix.length > 1) next = SURFACE_INDEX[mix[(mix.indexOf(SURFACES[pick].id) + 1) % mix.length]];
      pick = next;
    }
  }

  // Elevation channel, prototype units. Long rolling terrain plus a local
  // crest at every jump event so the ramps are real geometry, not a decal.
  const phase = (stage.seed % 997) * 0.01;
  const elev = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    elev[i] = Math.sin(i * 0.0068 + phase) * 210
      + Math.sin(i * 0.0029 + phase * 1.7) * 320
      + Math.sin(i * 0.019 + phase * 0.4) * 22;
  }
  for (const ev of events) {
    if (ev.kind !== 'jump') continue;
    for (let k = -13; k <= 13; k++) {
      const i = ev.index + k;
      if (i < 0 || i >= count) continue;
      const t = 1 - Math.abs(k) / 13;
      elev[i] += ease(t) * 62;
    }
  }
  // Flatten the launch and the finish so the start gantry and finish arch sit
  // level and the countdown never begins on a slope.
  for (let i = 0; i < 16; i++) {
    elev[i] = elev[16];
    elev[count - 1 - i] = elev[count - 17];
  }

  const path = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < count; i++) {
    let angle = Math.sin(i * .017 + idx * 1.7) * .08;
    for (const event of events) {
      const start = event.index - event.duration * .55;
      const t = clamp((i - start) / event.duration, 0, 1);
      if (t > 0) angle += event.delta * ease(t);
    }
    const crest = Math.sin(i * .042 + idx * 2.1) * .12 + Math.sin(i * .013) * .09;
    path.push({
      x, y, heading: angle, altitude: crest,
      roadHalf: 177 + Math.sin(i * .025) * 5,
      elev: elev[i], surface: surface[i],
    });
    x += Math.cos(angle) * step;
    y += Math.sin(angle) * step;
  }

  const trees = [];
  for (let i = 6; i < path.length - 5; i += 4) {
    if (rng() > .23) {
      const p = path[i];
      const normalX = -Math.sin(p.heading);
      const normalY = Math.cos(p.heading);
      for (const side of [-1, 1]) {
        if (rng() < .84) {
          const distance = p.roadHalf + 80 + rng() * 220;
          trees.push({
            x: p.x + normalX * side * distance, y: p.y + normalY * side * distance,
            size: 17 + rng() * 22, hue: rng(), node: i,
          });
        }
      }
    }
  }

  const rocks = [];
  for (const event of events) {
    if (event.kind !== 'rocks' || !path[event.index]) continue;
    const p = path[event.index];
    const normalX = -Math.sin(p.heading);
    const normalY = Math.cos(p.heading);
    const side = rng() > .5 ? 1 : -1;
    const distance = p.roadHalf * (.72 + rng() * .2);
    rocks.push({ x: p.x + normalX * side * distance, y: p.y + normalY * side * distance, size: 12 + rng() * 12, node: event.index });
    rocks.push({ x: p.x + normalX * -side * (distance + 20), y: p.y + normalY * -side * (distance + 20), size: 7 + rng() * 8, node: event.index });
  }

  const features = events.filter((event) => !event.visualOnly).sort((a, b) => a.index - b.index);

  // Surface-change callouts folded into the pace-note stream.
  const surfaceNotes = [];
  for (let i = 1; i < count; i++) {
    if (surface[i] !== surface[i - 1]) {
      surfaceNotes.push({ index: i, kind: 'surface', surface: surface[i] });
    }
  }

  return { stage, path, trees, rocks, features, surfaceNotes, rng, step, count };
}

// Pace-note text. Prototype featureText(), plus the surface line.
export function featureText(feature) {
  if (!feature) return '';
  if (feature.kind === 'surface') return 'INTO ' + SURFACES[feature.surface].name;
  if (feature.kind === 'jump') return 'JUMP';
  if (feature.kind === 'rocks') return 'CAUTION ROCKS';
  if (feature.kind === 'chicane') return 'CAUTION CHICANE';
  const direction = feature.delta < 0 ? 'LEFT' : 'RIGHT';
  if (feature.kind === 'hairpin') return direction + ' HAIRPIN';
  const grade = Math.abs(feature.delta) > .85 ? '2' : Math.abs(feature.delta) > .65 ? '3' : '5';
  return direction + ' ' + grade + (feature.tightens ? ' TIGHTENS' : '');
}

// ------------------------------------------------------------------ lookup
// World-space helpers. The sim runs in prototype units on the flat (x, y)
// plane exactly as the design document did; only rendering leaves that space.
export function worldX(px) { return px * WORLD_SCALE; }
export function worldZ(py) { return py * WORLD_SCALE; }

// Height of the road surface, in world metres, at a path index (fractional).
export function roadHeight(layout, fi) {
  const path = layout.path;
  const n = path.length;
  const i = clamp(Math.floor(fi), 0, n - 1);
  const j = Math.min(n - 1, i + 1);
  const t = clamp(fi - i, 0, 1);
  return (path[i].elev + (path[j].elev - path[i].elev) * t) * WORLD_SCALE;
}

// Downhill/uphill gradient at a node, in prototype units per unit travelled.
export function roadSlope(layout, i) {
  const path = layout.path;
  const a = path[clamp(i - 2, 0, path.length - 1)];
  const b = path[clamp(i + 2, 0, path.length - 1)];
  return (b.elev - a.elev) / (layout.step * 4);
}

// A yaw for Three from a prototype heading (direction (cos h, sin h) in XZ).
export function worldYaw(h) { return Math.atan2(Math.cos(h), Math.sin(h)); }

// ---------------------------------------------------------------- geometry
function pushQuad(pos, col, a, b, c, d, color) {
  const tri = [a, b, c, a, c, d];
  for (const v of tri) { pos.push(v[0], v[1], v[2]); col.push(color.r, color.g, color.b); }
}

// `flip` reverses the winding of every triangle. The box and cone emitters
// below list their faces in an order that leaves the surface normals pointing
// INTO the solid; without the flip, MeshStandardMaterial culls the near wall
// and the prop reads as a flat ambient-lit silhouette instead of a lit solid.
function makeVertexGeom(pos, col, forceUp, flip) {
  if (flip) {
    for (let i = 0; i + 8 < pos.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        const a = pos[i + 3 + k];
        pos[i + 3 + k] = pos[i + 6 + k];
        pos[i + 6 + k] = a;
        const c = col[i + 3 + k];
        col[i + 3 + k] = col[i + 6 + k];
        col[i + 6 + k] = c;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Horizontal ribbons are not wound consistently counter-clockwise from
  // above; without this the key light hits their undersides and the surface
  // renders ambient-only. These faces are only ever seen from above.
  if (forceUp) {
    const nAttr = g.attributes.normal;
    for (let i = 0; i < nAttr.count; i++) {
      if (nAttr.getY(i) < 0) nAttr.setXYZ(i, -nAttr.getX(i), -nAttr.getY(i), -nAttr.getZ(i));
    }
    nAttr.needsUpdate = true;
  }
  g.computeBoundingSphere();
  return g;
}

function flatMat(rough) {
  return new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: rough == null ? 0.94 : rough,
    metalness: 0.0, flatShading: true,
  });
}

// Deterministic value hash. Every piece of surface breakup, clast scatter and
// dressing jitter below is driven from this rather than Math.random, so a seed
// still rebuilds the same stage down to the last stone.
function hash2(i, j) {
  let h = Math.imul((i | 0) * 374761393 + (j | 0) * 668265263, 1274126177);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Curvature at a node, signed. Positive turns one way, negative the other; the
// magnitude drives berm height, spectator placement and barrier placement.
function curvature(path, i) {
  const a = path[clamp(i - 4, 0, path.length - 1)];
  const b = path[clamp(i + 4, 0, path.length - 1)];
  let d = b.heading - a.heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Baked key-light term for a face whose up-facing normal is tilted by (sx, sz).
// No shadow maps ship in this lane, so plane separation has to be authored into
// the vertex colours: this is the same lambert the sun would have given.
function bakedLight(biome, nx, ny, nz) {
  const d = biome.sun.dir;
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  const dot = (nx * d[0] + ny * d[1] + nz * d[2]) / l;
  return 0.68 + 0.42 * Math.max(0, dot);
}

// Road ribbon, verge banks and edge markers. Every second path node is used
// as a render node: at ~1.5 m per node the halved density is invisible and it
// halves the triangle budget for the largest mesh in the scene.
// Lateral bands across the half-width. This is the authored dirt surface: a
// loose crown in the middle, two permanent tyre grooves cut into it, the
// shoulder the grooves push their material onto, and a scrubbed outer strip
// carrying a baked contact shadow from the verge bank.
//   [innerFrac, outerFrac, shade, lift]
const ROAD_BANDS = [
  [0.00, 0.15, 1.06, 0.006],
  [0.15, 0.29, 0.78, -0.014],
  [0.29, 0.41, 1.12, 0.012],
  [0.41, 0.56, 0.85, -0.011],
  [0.56, 0.79, 0.98, 0.003],
  [0.79, 1.00, 0.76, -0.002],
];

export function buildRoad(layout, biome) {
  const path = layout.path;
  const S = WORLD_SCALE;
  const STRIDE = 2;
  const n = path.length;
  const roadPos = [], roadCol = [];
  const edgePos = [], edgeCol = [];
  const vergePos = [], vergeCol = [];

  const tmp = new THREE.Color();
  const cVerge = new THREE.Color(biome.ground).multiplyScalar(0.88);
  const cMarkA = new THREE.Color(0xf4efe0);
  const cMarkB = new THREE.Color(0xcf4a34);

  // Surface colour blended across a window, so gravel does not snap into mud at
  // a single node. The pace note calls the change; the road shows it arriving.
  const sr = new Float32Array(n), sg = new Float32Array(n), sb = new Float32Array(n);
  const er = new Float32Array(n), eg = new Float32Array(n), eb = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = SURFACES[path[i].surface];
    tmp.setHex(s.road); sr[i] = tmp.r; sg[i] = tmp.g; sb[i] = tmp.b;
    tmp.setHex(s.edge); er[i] = tmp.r; eg[i] = tmp.g; eb[i] = tmp.b;
  }
  const BLENDN = 7;
  function blur(arr) {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      let sum = 0, cnt = 0;
      for (let k = -BLENDN; k <= BLENDN; k++) {
        const j = i + k;
        if (j < 0 || j >= arr.length) continue;
        sum += arr[j]; cnt++;
      }
      out[i] = sum / cnt;
    }
    return out;
  }
  const brr = blur(sr), bgg = blur(sg), bbb = blur(sb);
  const err = blur(er), egg = blur(eg), ebb = blur(eb);

  const node = (i) => {
    const p = path[Math.min(i, n - 1)];
    return {
      x: p.x * S, y: p.elev * S, z: p.y * S,
      nx: -Math.sin(p.heading), nz: Math.cos(p.heading),
      half: p.roadHalf * S, surface: p.surface, i: Math.min(i, n - 1),
    };
  };

  const on = (nd, off, lift) => [nd.x + nd.nx * off, nd.y + lift, nd.z + nd.nz * off];

  for (let i = 0; i + STRIDE < n; i += STRIDE) {
    const a = node(i), b = node(i + STRIDE);
    const step = i / STRIDE;
    const curv = curvature(path, i);

    // --- the loose surface itself, band by band, both sides of the crown
    for (let bi = 0; bi < ROAD_BANDS.length; bi++) {
      const band = ROAD_BANDS[bi];
      for (const side of [-1, 1]) {
        const i0 = band[0] * side, o0 = band[1] * side;
        // Macro breakup: patchy tonal variation with a wavelength of several
        // metres, so the surface never reads as one flat painted ribbon.
        const macro = 0.90 + hash2(step >> 1, bi * 7 + (side > 0 ? 1 : 0)) * 0.17
          + Math.sin(step * 0.21 + bi * 1.7) * 0.035;
        const sh = band[2] * macro;
        tmp.setRGB(brr[a.i] * sh, bgg[a.i] * sh, bbb[a.i] * sh);
        pushQuad(roadPos, roadCol,
          on(a, a.half * i0, band[3]), on(a, a.half * o0, band[3]),
          on(b, b.half * o0, band[3]), on(b, b.half * i0, band[3]), tmp);
      }
    }

    // --- clasts: loose stones sitting proud of the surface, thickest at the
    // scrubbed edges where the cars throw them.
    if ((step & 1) === 0) {
      for (let k = 0; k < 3; k++) {
        const r1 = hash2(step, k * 31 + 5), r2 = hash2(step + 991, k * 17);
        const side = r2 > 0.5 ? 1 : -1;
        const frac = 0.42 + r1 * 0.62;
        const sz = 0.16 + r2 * 0.34;
        const cx = a.x + a.nx * a.half * frac * side;
        const cz = a.z + a.nz * a.half * frac * side;
        const sh = 1.28 + r1 * 0.3;
        tmp.setRGB(Math.min(1, brr[a.i] * sh), Math.min(1, bgg[a.i] * sh), Math.min(1, bbb[a.i] * sh));
        pushQuad(roadPos, roadCol,
          [cx - sz, a.y + 0.05, cz - sz], [cx + sz, a.y + 0.05, cz - sz],
          [cx + sz * 0.6, a.y + 0.05, cz + sz], [cx - sz * 0.8, a.y + 0.05, cz + sz], tmp);
      }
    }

    // Alternating edge markers, the rally equivalent of a rumble strip.
    const mc = (step % 2) ? cMarkA : cMarkB;
    const MARK = 0.9;
    for (const side of [-1, 1]) {
      const inner = a.half * side;
      const outer = (a.half + MARK) * side;
      const innerB = b.half * side;
      const outerB = (b.half + MARK) * side;
      pushQuad(edgePos, edgeCol,
        on(a, inner, 0.06), on(a, outer, 0.06),
        [b.x + b.nx * outerB, b.y + 0.06, b.z + b.nz * outerB],
        [b.x + b.nx * innerB, b.y + 0.06, b.z + b.nz * innerB], mc);
    }

    // --- verge. On the outside of a corner the cars push a berm up; on the
    // inside the bank is cut away. Both carry a baked occlusion ramp so the
    // road plane separates from the terrain without a shadow map.
    const VERGE = 8.5;
    for (const side of [-1, 1]) {
      const outer = curv * side < 0;
      const berm = outer ? Math.min(2.6, Math.abs(curv) * 26) : 0;
      const dropA = -1.1 + berm;
      const shade = (outer ? 1.06 : 0.82) * (0.9 + hash2(step, side + 9) * 0.16);
      const i0 = (a.half + MARK) * side, o0 = (a.half + MARK + VERGE) * side;
      const i1 = (b.half + MARK) * side, o1 = (b.half + MARK + VERGE) * side;
      // Contact band: a narrow dark strip hugging the road edge, the occlusion
      // the verge bank would cast onto the surface.
      tmp.copy(cVerge).multiplyScalar(0.52);
      pushQuad(vergePos, vergeCol,
        [a.x + a.nx * i0, a.y + 0.03, a.z + a.nz * i0],
        [b.x + b.nx * i1, b.y + 0.03, b.z + b.nz * i1],
        [b.x + b.nx * (i1 + 1.5 * side), b.y + 0.02, b.z + b.nz * (i1 + 1.5 * side)],
        [a.x + a.nx * (i0 + 1.5 * side), a.y + 0.02, a.z + a.nz * (i0 + 1.5 * side)], tmp);
      // Bank proper, lit as a tilted face rather than flat ground.
      const tilt = bakedLight(biome, a.nx * side * 0.5, 0.86, a.nz * side * 0.5);
      tmp.copy(cVerge).multiplyScalar(shade * tilt);
      pushQuad(vergePos, vergeCol,
        [a.x + a.nx * (i0 + 1.5 * side), a.y + 0.02, a.z + a.nz * (i0 + 1.5 * side)],
        [b.x + b.nx * (i1 + 1.5 * side), b.y + 0.02, b.z + b.nz * (i1 + 1.5 * side)],
        [b.x + b.nx * o1, b.y + dropA, b.z + b.nz * o1],
        [a.x + a.nx * o0, a.y + dropA, a.z + a.nz * o0], tmp);
      // Loose debris thrown off the edge onto the verge.
      if ((step % 3) === 0) {
        const r = hash2(step + 77, side);
        const off = (a.half + MARK + 0.6 + r * 4.2) * side;
        const sz = 0.2 + r * 0.4;
        const cx = a.x + a.nx * off, cz = a.z + a.nz * off;
        tmp.setRGB(Math.min(1, err[a.i] * 1.15), Math.min(1, egg[a.i] * 1.15), Math.min(1, ebb[a.i] * 1.15));
        pushQuad(vergePos, vergeCol,
          [cx - sz, a.y + 0.06, cz - sz], [cx + sz, a.y + 0.06, cz - sz],
          [cx + sz, a.y + 0.06, cz + sz * 0.7], [cx - sz * 0.7, a.y + 0.06, cz + sz], tmp);
      }
    }
  }

  const group = new THREE.Group();
  const mats = [];
  const road = new THREE.Mesh(makeVertexGeom(roadPos, roadCol, true), flatMat(0.99));
  road.renderOrder = 1;
  group.add(road); mats.push(road.material);
  const edge = new THREE.Mesh(makeVertexGeom(edgePos, edgeCol, true), flatMat(0.85));
  edge.renderOrder = 1;
  group.add(edge); mats.push(edge.material);
  const verge = new THREE.Mesh(makeVertexGeom(vergePos, vergeCol, true), flatMat(1.0));
  group.add(verge); mats.push(verge.material);
  return { group, materials: mats };
}

// Terrain grid across the stage corridor, pulled down to road height near the
// road so nothing erupts through the surface.
// Per-biome relief. Palette alone made the four biomes read as recolours of one
// landscape, so the ground shape itself is authored per biome: rolling forest
// swells, layered canyon benches, alpine drifts and a flat wet coastal plain.
function reliefFor(biome) {
  const id = biome.id;
  if (id === 'canyon') {
    // Stepped mesa benches: the terracing is the canyon's silhouette read.
    return (u, v) => {
      const base = Math.sin(u * 0.0031 + v * 0.0021) * 30 + Math.cos(v * 0.0047) * 20;
      const bench = Math.round(base / 11) * 11;          // strata steps
      return bench + Math.sin(u * 0.021 + v * 0.017) * 1.8;
    };
  }
  if (id === 'alpine') {
    // Wind-packed drifts: long smooth banks with sharp cornice crests.
    return (u, v) => {
      const d = Math.sin(u * 0.0036 + v * 0.0024) * 34 + Math.cos(v * 0.0062) * 22;
      return d + Math.abs(Math.sin(u * 0.008 + v * 0.004)) * 16 + Math.sin(u * 0.03) * 1.2;
    };
  }
  if (id === 'coast') {
    // Tidal flat: nearly level, cut by shallow channels that catch the lights.
    return (u, v) => Math.sin(u * 0.0026 + v * 0.0019) * 9
      + Math.sin(v * 0.011) * 2.4 + Math.sin(u * 0.052 + v * 0.031) * 0.8;
  }
  // Pine: soft swells with a fine hummock layer under the trees.
  return (u, v) => Math.sin(u * 0.0042 + v * 0.0029) * 16
    + Math.cos(v * 0.0058) * 11 + Math.sin(u * 0.019 + v * 0.015) * 3.2;
}

export function buildTerrain(layout, biome, rng) {
  const path = layout.path;
  const S = WORLD_SCALE;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of path) {
    const x = p.x * S, z = p.y * S;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const pad = 210;
  minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
  const cols = 58, rows = 58;
  const dx = (maxX - minX) / cols, dz = (maxZ - minZ) / rows;
  const pos = [], col = [];
  const cA = new THREE.Color(biome.ground), cB = new THREE.Color(biome.groundAlt);
  const tmp = new THREE.Color();

  const FLAT = 26, BLEND = 120;
  const STRIDE = 5;
  // Uniform grid over the path samples. The brute-force nearest search was the
  // single largest blocking task in the whole load and showed up in the feel
  // trace as a multi-hundred-millisecond stall; this makes it near constant.
  const CELL = 90;
  const grid = new Map();
  const gkey = (gx, gz) => gx * 73856093 ^ gz * 19349663;
  for (let k = 0; k < path.length; k += STRIDE) {
    const p = path[k];
    const gx = Math.floor(p.x * S / CELL), gz = Math.floor(p.y * S / CELL);
    const key = gkey(gx, gz);
    let list = grid.get(key);
    if (!list) { list = []; grid.set(key, list); }
    list.push(k);
  }
  const _near = { dist: 0, y: 0 };
  function nearRoad(x, z) {
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
    let best = Infinity, bestY = 0;
    for (let ring = 1; ring <= 4; ring++) {
      for (let a = -ring; a <= ring; a++) {
        for (let b = -ring; b <= ring; b++) {
          if (Math.max(Math.abs(a), Math.abs(b)) !== ring && ring > 1) continue;
          const list = grid.get(gkey(gx + a, gz + b));
          if (!list) continue;
          for (let n = 0; n < list.length; n++) {
            const p = path[list[n]];
            const ddx = p.x * S - x, ddz = p.y * S - z;
            const d = ddx * ddx + ddz * ddz;
            if (d < best) { best = d; bestY = p.elev * S; }
          }
        }
      }
      // One extra ring past the first hit guarantees the true nearest.
      if (best < (ring * CELL) * (ring * CELL)) break;
    }
    if (best === Infinity) { best = 1e9; bestY = path[0].elev * S; }
    _near.dist = Math.sqrt(best); _near.y = bestY;
    return _near;
  }
  const relief = reliefFor(biome);
  function height(u, v) {
    const r = relief(u, v);
    const near = nearRoad(u, v);
    const t = clamp((near.dist - FLAT) / (BLEND - FLAT), 0, 1);
    const s = t * t * (3 - 2 * t);
    return (near.y - 1.6) * (1 - s) + (near.y + r - 1.6) * s;
  }

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x0 = minX + i * dx, z0 = minZ + j * dz;
      const x1 = x0 + dx, z1 = z0 + dz;
      const h00 = height(x0, z0), h01 = height(x0, z1);
      const h11 = height(x1, z1), h10 = height(x1, z0);
      // Bake the key light into the vertex colour from the quad's own slope.
      // Without this every ground face returns the same lambert term and the
      // landscape reads as one muddy silhouette.
      const nx = (h00 + h01 - h10 - h11) * 0.5 / dx;
      const nz = (h00 + h10 - h01 - h11) * 0.5 / dz;
      const inv = 1 / Math.hypot(nx, 1, nz);
      const lit = bakedLight(biome, nx * inv, inv, nz * inv);
      // Ambient occlusion: the ground darkens into the ditch beside the road
      // and in the hollows, so planes separate without a shadow map.
      const d = nearRoad((x0 + x1) * 0.5, (z0 + z1) * 0.5).dist;
      const ao = clamp(0.62 + d / 90, 0.62, 1);
      const r = hash2(i, j);
      tmp.copy(r > 0.5 ? cA : cB).multiplyScalar((0.86 + hash2(j, i) * 0.26) * lit * ao);
      // Wound counter-clockwise seen from +Y so the normals face up.
      pushQuad(pos, col,
        [x0, h00, z0], [x0, h01, z1], [x1, h11, z1], [x1, h10, z0], tmp);
    }
  }
  const mesh = new THREE.Mesh(makeVertexGeom(pos, col, true), flatMat(1.0));
  mesh.renderOrder = 0;
  return { mesh, mat: mesh.material, bounds: { minX, maxX, minZ, maxZ } };
}

// Horizon silhouette: a ring of far geometry that gives each biome its own
// skyline. Pine gets a serrated conifer wall, canyon a stepped mesa profile,
// alpine a jagged summit range, coast a low headland with a lighthouse stack.
export function buildHorizon(layout, biome, rng) {
  const path = layout.path;
  const S = WORLD_SCALE;
  let cx = 0, cz = 0;
  for (const p of path) { cx += p.x * S; cz += p.y * S; }
  cx /= path.length; cz /= path.length;
  const R = 1250;
  const pos = [], col = [];
  const base = new THREE.Color(biome.fog);
  const far = new THREE.Color(biome.sky.mid);
  const tmp = new THREE.Color();
  const SEG = 108;
  const profile = (t) => {
    if (biome.id === 'canyon') return Math.round((0.45 + Math.sin(t * 7.1) * 0.32) * 5) / 5;
    if (biome.id === 'alpine') return 0.42 + Math.abs(Math.sin(t * 5.3)) * 0.62 + Math.sin(t * 21) * 0.06;
    if (biome.id === 'coast') return 0.16 + Math.abs(Math.sin(t * 3.1)) * 0.2;
    return 0.34 + Math.abs(Math.sin(t * 11.7)) * 0.3 + Math.sin(t * 37) * 0.05;
  };
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
    const h0 = profile(a0) * 190, h1 = profile(a1) * 190;
    const x0 = cx + Math.cos(a0) * R, z0 = cz + Math.sin(a0) * R;
    const x1 = cx + Math.cos(a1) * R, z1 = cz + Math.sin(a1) * R;
    // Two tonal ranges so the skyline has depth rather than one flat cutout.
    const dep = hash2(i, 3);
    tmp.copy(base).lerp(far, 0.28 + dep * 0.3).multiplyScalar(0.72 + dep * 0.2);
    pushQuad(pos, col, [x0, -40, z0], [x1, -40, z1], [x1, h1, z1], [x0, h0, z0], tmp);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 7;
  return { mesh, mat, geo };
}

// Scenery: trees, rocks and biome furniture merged into one draw call. The
// prototype's tree and rock scatter positions are used verbatim.
export function buildProps(layout, biome, rng) {
  const S = WORLD_SCALE;
  const pos = [], col = [];
  // Ground decals: every prop drops a contact patch so nothing floats. These
  // are the world's shadows in a lane that ships no shadow map.
  const flatPos = [], flatCol = [];
  const c0 = new THREE.Color(biome.propColors[0]);
  const c1 = new THREE.Color(biome.propColors[1]);
  const c2 = new THREE.Color(biome.propColors[2]);
  const tmp = new THREE.Color();
  const path = layout.path;

  function box(cx, cy, cz, hx, hy, hz, color, yaw) {
    const cs = Math.cos(yaw || 0), sn = Math.sin(yaw || 0);
    const P = (x, y, z) => [cx + x * cs - z * sn, cy + y, cz + x * sn + z * cs];
    const v = [
      P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz),
      P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz),
    ];
    const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
    for (const f of faces) pushQuad(pos, col, v[f[0]], v[f[1]], v[f[2]], v[f[3]], color);
  }
  function cone(cx, cy, cz, r, h, color, seg) {
    const s = seg || 6;
    for (let i = 0; i < s; i++) {
      const a0 = i / s * Math.PI * 2, a1 = (i + 1) / s * Math.PI * 2;
      pos.push(cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r);
      pos.push(cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r);
      pos.push(cx, cy + h, cz);
      for (let k = 0; k < 3; k++) col.push(color.r, color.g, color.b);
    }
  }

  const dark = new THREE.Color();
  function patch(px, py, pz, r, shade) {
    dark.setRGB(shade, shade, shade);
    pushQuad(flatPos, flatCol,
      [px - r, py, pz - r], [px - r, py, pz + r], [px + r, py, pz + r], [px + r, py, pz - r], dark);
  }

  const collide = [];
  for (const tree of layout.trees) {
    const x = tree.x * S, z = tree.y * S;
    const y = path[Math.min(tree.node, path.length - 1)].elev * S - 0.6;
    const h = tree.size * S * 5.6;
    collide.push({ x: tree.x, y: tree.y, r: tree.size * 0.9, node: tree.node, kind: 'tree' });
    patch(x, y + 0.08, z, tree.size * S * 2.1, 0.22);
    if (biome.props === 'mesa') {
      // Desert: layered mesa blocks and dry scrub rather than conifers.
      const s = tree.size * S * 1.5;
      tmp.copy(tree.hue > 0.5 ? c0 : c1).multiplyScalar(0.82 + tree.hue * 0.4);
      box(x, y + s * 0.5, z, s, s * 0.5, s * 0.85, tmp, tree.hue * 3);
      tmp.copy(c2).multiplyScalar(0.9);
      box(x, y + s * 1.05, z, s * 0.62, s * 0.32, s * 0.55, tmp, tree.hue * 3);
    } else if (biome.props === 'pylon') {
      const hh = h * 0.8;
      tmp.copy(c0).multiplyScalar(0.9 + tree.hue * 0.2);
      box(x, y + hh * 0.5, z, 0.4, hh * 0.5, 0.4, tmp);
      tmp.copy(c1);
      box(x, y + hh + 0.4, z, 0.85, 0.35, 0.85, tmp);
    } else {
      // Conifer: trunk plus a two-stage crown.
      tmp.copy(c2).multiplyScalar(0.75 + tree.hue * 0.3);
      box(x, y + h * 0.18, z, 0.42, h * 0.18, 0.42, tmp);
      tmp.copy(tree.hue > 0.4 ? c0 : c1).multiplyScalar(0.84 + tree.hue * 0.3);
      cone(x, y + h * 0.3, z, tree.size * S * 1.9, h * 0.75, tmp, 6);
      if (biome.props === 'fir') {
        tmp.copy(c2).multiplyScalar(0.95);
        cone(x, y + h * 0.78, z, tree.size * S * 1.0, h * 0.34, tmp, 6);
      }
    }
  }

  for (const rock of layout.rocks) {
    const x = rock.x * S, z = rock.y * S;
    const y = path[Math.min(rock.node, path.length - 1)].elev * S - 0.4;
    const s = rock.size * S * 2.4;
    tmp.copy(rng() > 0.5 ? c0 : c2).multiplyScalar(0.9 + rng() * 0.4);
    box(x, y + s * 0.45, z, s, s * 0.5, s * 0.8, tmp, rng() * 3);
    patch(x, y + 0.07, z, s * 1.35, 0.28);
    collide.push({ x: rock.x, y: rock.y, r: rock.size * 1.3, node: rock.node, kind: 'rock' });
  }

  // Marshal posts every so often: an original studio brand on the boards.
  const cPost = new THREE.Color(biome.accent).multiplyScalar(0.85);
  const cBoard = new THREE.Color(0x16202c);
  for (let i = 40; i < path.length - 40; i += 96) {
    const p = path[i];
    const nx = -Math.sin(p.heading), nz = Math.cos(p.heading);
    const side = (i / 96) % 2 ? 1 : -1;
    const off = (p.roadHalf + 130) * S * side;
    const x = p.x * S + nx * off, z = p.y * S + nz * off, y = p.elev * S - 0.4;
    const yaw = worldYaw(p.heading);
    box(x, y + 1.5, z, 0.24, 1.5, 0.24, cPost, yaw);
    box(x, y + 3.4, z, 0.16, 1.0, 2.6, cBoard, yaw);
    box(x - nx * 0.2, y + 3.4, z - nz * 0.2, 0.08, 0.78, 2.2, cPost, yaw);
  }

  const dress = buildDressing(layout, biome, { box, cone, pos, col, flatPos, flatCol });

  const mesh = new THREE.Mesh(makeVertexGeom(pos, col, false, true), flatMat(0.9));
  const decals = new THREE.Mesh(makeVertexGeom(flatPos, flatCol, true), flatMat(1.0));
  decals.renderOrder = 1;
  decals.material.transparent = true;
  decals.material.opacity = 0.62;
  decals.material.depthWrite = false;
  const group = new THREE.Group();
  group.add(mesh, decals);
  dress.banners.forEach((b) => group.add(b.group));
  return { mesh: group, solid: mesh, mat: mesh.material, collide, banners: dress.banners };
}

// ---------------------------------------------------------------- dressing
// Rally furniture. Without this the stage reads as a test road with cones: the
// crowd, the boards, the barriers and the service park are what say "rally".
function buildDressing(layout, biome, ctx) {
  const S = WORLD_SCALE;
  const path = layout.path;
  const { box, cone, pos, col, flatPos, flatCol } = ctx;
  const tmp = new THREE.Color();
  const cAccent = new THREE.Color(biome.accent);
  const cSteel = new THREE.Color(0xb8bec6);
  const cDark = new THREE.Color(0x1b222c);
  const cStraw = new THREE.Color(0xc8a962);
  const banners = [];

  const CROWD = [0xd8402c, 0x2f7f5c, 0x2557c4, 0xe2892c, 0xf2f0e6, 0x8f5fd6, 0x1d2530];

  function at(i) {
    const p = path[clamp(i, 0, path.length - 1)];
    return {
      x: p.x * S, y: p.elev * S, z: p.y * S,
      nx: -Math.sin(p.heading), nz: Math.cos(p.heading),
      half: p.roadHalf * S, yaw: worldYaw(p.heading), heading: p.heading,
    };
  }
  // Flat ground decal, used for every contact shadow in the scene.
  function patch(x, y, z, r, shade) {
    tmp.setRGB(shade, shade, shade);
    pushQuad(flatPos, flatCol,
      [x - r, y, z - r], [x - r, y, z + r], [x + r, y, z + r], [x + r, y, z - r], tmp);
  }

  // --- spectator: a shoulders-and-head silhouette, two boxes and a cap.
  function spectator(x, y, z, yaw, seed) {
    const c = CROWD[Math.floor(hash2(seed, 3) * CROWD.length) % CROWD.length];
    const h = 1.5 + hash2(seed, 11) * 0.32;
    tmp.setHex(c).multiplyScalar(0.7 + hash2(seed, 5) * 0.4);
    box(x, y + h * 0.42, z, 0.24, h * 0.42, 0.16, tmp, yaw);
    tmp.setHex(0xd8b08a).multiplyScalar(0.7 + hash2(seed, 7) * 0.4);
    box(x, y + h * 0.94, z, 0.13, 0.15, 0.13, tmp, yaw);
    patch(x, y + 0.05, z, 0.42, 0.24);
  }

  function crowdCluster(i, side, n, seed) {
    const a = at(i);
    for (let k = 0; k < n; k++) {
      const r1 = hash2(seed + k, 21), r2 = hash2(seed + k, 33);
      const off = (a.half + 2.4 + r1 * 7) * side;
      const along = (r2 - 0.5) * 16;
      const x = a.x + a.nx * off + Math.cos(a.heading) * along;
      const z = a.z + a.nz * off + Math.sin(a.heading) * along;
      spectator(x, a.y - 0.3, z, a.yaw + (r1 - 0.5), seed + k * 13);
    }
  }

  // --- banner on two poles, animated in the wind by the render loop.
  function banner(i, side, tint) {
    const a = at(i);
    const off = (a.half + 3.2) * side;
    const x = a.x + a.nx * off, y = a.y - 0.3, z = a.z + a.nz * off;
    const g = new THREE.Group();
    const p2 = [], c2 = [];
    const localBox = (cx, cy, cz, hx, hy, hz, color) => {
      const v = [
        [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz],
        [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz],
      ];
      const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
      for (const f of faces) pushQuad(p2, c2, v[f[0]], v[f[1]], v[f[2]], v[f[3]], color);
    };
    tmp.copy(cSteel).multiplyScalar(0.55);
    localBox(0, 1.9, -1.6, 0.08, 1.9, 0.08, tmp);
    localBox(0, 1.9, 1.6, 0.08, 1.9, 0.08, tmp);
    // Cloth in three panels so the sway reads as fabric, not a signboard.
    for (let k = 0; k < 3; k++) {
      tmp.copy(tint).multiplyScalar(k % 2 ? 1 : 0.72);
      localBox(0, 3.0, -1.6 + (k + 0.5) * 1.066, 0.03, 0.62, 0.52, tmp);
    }
    const geo = makeVertexGeom(p2, c2, false, true);
    const mesh = new THREE.Mesh(geo, flatMat(0.9));
    g.add(mesh);
    g.position.set(x, y, z);
    g.rotation.y = a.yaw;
    patch(x, y + 0.05, z, 1.9, 0.3);
    banners.push({ group: g, mesh, geo, mat: mesh.material, phase: hash2(i, 9) * 6.28 });
  }

  // --- distance board: the numbered corner board a co-driver calls off. Three
  // bars is 300 m out, two is 200, one is 100.
  function distanceBoard(i, side, bars) {
    const a = at(i);
    const off = (a.half + 2.2) * side;
    const x = a.x + a.nx * off, y = a.y - 0.3, z = a.z + a.nz * off;
    tmp.copy(cSteel).multiplyScalar(0.5);
    box(x, y + 1.1, z, 0.09, 1.1, 0.09, tmp, a.yaw);
    tmp.setHex(0xf2f0e6);
    box(x, y + 2.15, z, 0.07, 0.62, 0.5, tmp, a.yaw);
    for (let k = 0; k < bars; k++) {
      tmp.setHex(0x14181f);
      box(x - a.nx * 0.09 * side, y + 2.15 + (k - (bars - 1) / 2) * 0.3, z - a.nz * 0.09 * side,
        0.03, 0.09, 0.36, tmp, a.yaw);
    }
    patch(x, y + 0.05, z, 0.5, 0.28);
  }

  // --- armco barrier run, used on the outside of the quick stuff.
  function barrier(i, side, len) {
    for (let k = 0; k < len; k++) {
      const a = at(i + k * 3);
      const off = (a.half + 1.9) * side;
      const x = a.x + a.nx * off, y = a.y - 0.3, z = a.z + a.nz * off;
      tmp.copy(cSteel).multiplyScalar(0.42);
      box(x, y + 0.5, z, 0.07, 0.5, 0.06, tmp, a.yaw);
      tmp.copy(cSteel).multiplyScalar(0.86 + hash2(i + k, 4) * 0.2);
      box(x, y + 0.86, z, 0.09, 0.24, 2.4, tmp, a.yaw);
      patch(x, y + 0.05, z, 0.6, 0.3);
    }
  }

  // --- hay bales on the apex kerbs of the slow stuff.
  function bales(i, side, n) {
    for (let k = 0; k < n; k++) {
      const a = at(i + k * 4);
      const off = (a.half + 1.6) * side;
      const x = a.x + a.nx * off, y = a.y - 0.3, z = a.z + a.nz * off;
      tmp.copy(cStraw).multiplyScalar(0.82 + hash2(i + k, 6) * 0.3);
      box(x, y + 0.42, z, 0.6, 0.42, 0.85, tmp, a.yaw + hash2(i + k, 8) * 0.4);
      patch(x, y + 0.05, z, 1.0, 0.26);
    }
  }

  // --- service park: awnings, a van, tool chests and tyre stacks at the start.
  function servicePark() {
    const a = at(14);
    for (const side of [-1, 1]) {
      const off = (a.half + 9 + hash2(side, 2) * 5) * side;
      const bx = a.x + a.nx * off, bz = a.z + a.nz * off, by = a.y - 0.4;
      tmp.copy(cAccent).multiplyScalar(0.8);
      box(bx, by + 2.7, bz, 2.6, 0.12, 2.6, tmp, a.yaw);          // awning
      tmp.copy(cSteel).multiplyScalar(0.5);
      for (const cx of [-2.4, 2.4]) {
        for (const cz of [-2.4, 2.4]) {
          box(bx + cx * Math.cos(a.yaw) - cz * Math.sin(a.yaw), by + 1.35,
            bz + cx * Math.sin(a.yaw) + cz * Math.cos(a.yaw), 0.08, 1.35, 0.08, tmp, a.yaw);
        }
      }
      tmp.setHex(0xf2f0e6).multiplyScalar(0.9);
      box(bx - a.nx * 5.5 * side, by + 1.2, bz - a.nz * 5.5 * side, 1.1, 1.2, 2.4, tmp, a.yaw);  // van
      tmp.copy(cDark);
      box(bx + 1.6, by + 0.4, bz + 1.4, 0.5, 0.4, 0.7, tmp, a.yaw);   // tool chest
      for (let k = 0; k < 4; k++) {
        tmp.setHex(0x14181f).multiplyScalar(0.8 + k * 0.06);
        box(bx - 1.9, by + 0.18 + k * 0.34, bz - 1.6, 0.42, 0.17, 0.42, tmp, a.yaw + k * 0.3);
      }
      patch(bx, by + 0.05, bz, 3.4, 0.3);
      crowdCluster(14, side, 5, 5000 + side * 90);
    }
  }

  // --- biome landmark: one silhouette per biome that no other stage has.
  function landmark() {
    const i = Math.floor(path.length * 0.62);
    const a = at(i);
    const side = hash2(i, 1) > 0.5 ? 1 : -1;
    const off = (a.half + 60) * side;
    const x = a.x + a.nx * off, z = a.z + a.nz * off, y = a.y - 1;
    if (biome.id === 'pine') {
      // Fire lookout tower over the treeline.
      tmp.setHex(0x4a3624);
      for (const dx of [-1.4, 1.4]) for (const dz of [-1.4, 1.4]) box(x + dx, y + 7, z + dz, 0.22, 7, 0.22, tmp, 0);
      tmp.setHex(0x6b4f31); box(x, y + 14.4, z, 2.3, 0.6, 2.3, tmp, 0);
      tmp.setHex(0x2b3a44); cone(x, y + 15, z, 3.1, 2.6, tmp, 5);
    } else if (biome.id === 'canyon') {
      // A natural arch cut through a mesa wall.
      tmp.setHex(0x9a5c34);
      box(x - 7, y + 9, z, 3, 9, 5, tmp, 0);
      box(x + 7, y + 9, z, 3, 9, 5, tmp, 0);
      box(x, y + 20, z, 10, 2.4, 5, tmp, 0);
      tmp.setHex(0xb5703c); box(x, y + 24, z, 11, 1.8, 6, tmp, 0);
    } else if (biome.id === 'alpine') {
      // A cornice crag with an ice face.
      tmp.setHex(0x76808d); cone(x, y, z, 13, 26, tmp, 5);
      tmp.setHex(0xeaf4fa); cone(x, y + 16, z, 5.2, 12, tmp, 5);
      tmp.setHex(0xa8d8ee); box(x + 6, y + 5, z - 3, 2.4, 5, 1.2, tmp, 0.6);
    } else {
      // Lighthouse over the harbour, lamp lit against the night.
      tmp.setHex(0xe8e2d4); box(x, y + 9, z, 1.9, 9, 1.9, tmp, 0.4);
      tmp.setHex(0xcf4a34); box(x, y + 12, z, 2.0, 1.2, 2.0, tmp, 0.4);
      tmp.copy(cAccent).multiplyScalar(1.6); box(x, y + 19, z, 1.4, 1.1, 1.4, tmp, 0.4);
      tmp.setHex(0x2b3854); cone(x, y + 20.2, z, 2.0, 2.4, tmp, 5);
    }
  }

  // --- place the furniture against the generated stage.
  servicePark();
  landmark();

  const feats = layout.features;
  let bannerBudget = 10;
  for (let f = 0; f < feats.length; f++) {
    const ev = feats[f];
    const i = ev.index;
    if (i < 24 || i > path.length - 24) continue;
    const side = (ev.delta || 0) < 0 ? 1 : -1;             // outside of the turn
    if (ev.kind === 'hairpin') {
      crowdCluster(i, side, 7, i * 3 + 1);
      crowdCluster(i - 10, -side, 4, i * 3 + 41);
      bales(i - 6, side, 4);
      distanceBoard(i - 34, side, 1);
      distanceBoard(i - 68, side, 2);
      if (bannerBudget > 0) { bannerBudget--; banner(i - 18, -side, cAccent); }
    } else if (ev.kind === 'jump') {
      crowdCluster(i + 12, 1, 5, i * 5 + 7);
      crowdCluster(i + 12, -1, 5, i * 5 + 77);
      if (bannerBudget > 0) { bannerBudget--; banner(i - 4, 1, new THREE.Color(0xf2f0e6)); }
      distanceBoard(i - 30, -1, 1);
    } else if (ev.kind === 'chicane') {
      barrier(i - 4, side, 6);
      bales(i + 6, -side, 3);
      crowdCluster(i, side, 3, i * 7 + 3);
    } else if (ev.kind === 'rocks') {
      distanceBoard(i - 26, 1, 1);
      crowdCluster(i - 4, -1, 3, i * 11 + 5);
    } else {
      // Plain corner: boards and a thin crowd on the outside.
      if ((f & 1) === 0) distanceBoard(i - 30, side, 2);
      if ((f % 3) === 0) crowdCluster(i, side, 4, i * 13 + 9);
      if ((f % 4) === 0) barrier(i - 3, side, 4);
    }
  }
  return { banners };
}

// Start gantry and finish arch. A stage is point to point, so the two ends are
// different objects and both need to read from a long way out.
export function buildGates(layout, biome) {
  const S = WORLD_SCALE;
  const path = layout.path;
  // Posts and beams are solids and need a flipped winding; the checker band is
  // a flat ribbon on the road and needs its normals forced up instead. They
  // cannot share one geometry, so they are built as two.
  const pos = [], col = [];
  const flatPos = [], flatCol = [];
  const cA = new THREE.Color(0xf4f2ea), cB = new THREE.Color(0x1a1f27);
  const cPost = new THREE.Color(biome.accent);
  const cFinish = new THREE.Color(0x39d353);

  function box(cx, cy, cz, hx, hy, hz, color, yaw) {
    const cs = Math.cos(yaw || 0), sn = Math.sin(yaw || 0);
    const P = (x, y, z) => [cx + x * cs - z * sn, cy + y, cz + x * sn + z * cs];
    const v = [
      P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz),
      P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz),
    ];
    const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
    for (const f of faces) pushQuad(pos, col, v[f[0]], v[f[1]], v[f[2]], v[f[3]], color);
  }

  function gate(i, accent) {
    const p = path[Math.min(Math.max(i, 0), path.length - 1)];
    const nx = -Math.sin(p.heading), nz = Math.cos(p.heading);
    const x = p.x * S, y = p.elev * S, z = p.y * S;
    const half = p.roadHalf * S;
    const yaw = worldYaw(p.heading);
    for (const side of [-1, 1]) {
      const o = (half + 1.4) * side;
      box(x + nx * o, y + 3.6, z + nz * o, 0.4, 3.6, 0.4, accent, yaw);
    }
    // The beam has to run along the road NORMAL, post to post. `box()` takes a
    // yaw in its own convention, which does not agree with worldYaw(), and the
    // arch beam came out rotated ninety degrees: a plank floating lengthways
    // down the middle of the stage. It is built straight from the normal now,
    // so it can only ever span the gate.
    const fx = Math.cos(p.heading), fz = Math.sin(p.heading);
    const L = half + 1.8, T = 0.42, HY = 0.6;
    const by = y + 7.4;
    const V = (u, v, w) => [
      x + nx * u + fx * v,
      by + w,
      z + nz * u + fz * v,
    ];
    const bv = [
      V(-L, -T, -HY), V(L, -T, -HY), V(L, -T, HY), V(-L, -T, HY),
      V(-L, T, -HY), V(L, T, -HY), V(L, T, HY), V(-L, T, HY),
    ];
    const bfaces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
    for (const f of bfaces) pushQuad(pos, col, bv[f[0]], bv[f[1]], bv[f[2]], bv[f[3]], accent);
    // checker band on the road
    for (let c = 0; c < 12; c++) {
      const o0 = -half + (c / 12) * half * 2;
      const o1 = -half + ((c + 1) / 12) * half * 2;
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const an = { x: a.x * S, y: a.elev * S, z: a.y * S, nx: -Math.sin(a.heading), nz: Math.cos(a.heading) };
      const bn = { x: b.x * S, y: b.elev * S, z: b.y * S, nx: -Math.sin(b.heading), nz: Math.cos(b.heading) };
      pushQuad(flatPos, flatCol,
        [an.x + an.nx * o0, an.y + 0.08, an.z + an.nz * o0],
        [an.x + an.nx * o1, an.y + 0.08, an.z + an.nz * o1],
        [bn.x + bn.nx * o1, bn.y + 0.08, bn.z + bn.nz * o1],
        [bn.x + bn.nx * o0, bn.y + 0.08, bn.z + bn.nz * o0],
        c % 2 ? cA : cB);
    }
  }

  // The car launches from node 8, so the start arch sits far enough ahead to
  // be driven under rather than looming over the camera on the grid.
  gate(26, cPost);
  gate(path.length - 9, cFinish);

  const group = new THREE.Group();
  const solid = new THREE.Mesh(makeVertexGeom(pos, col, false, true), flatMat(0.82));
  group.add(solid);
  const band = new THREE.Mesh(makeVertexGeom(flatPos, flatCol, true), flatMat(0.86));
  band.renderOrder = 2;
  group.add(band);
  return { mesh: group, mats: [solid.material, band.material] };
}

// Ghost line: the best run's recorded lateral track drawn as a glowing ribbon
// on the road. Built once from the saved samples, then never touched.
export function buildGhostLine(layout, samples, color) {
  const S = WORLD_SCALE;
  const path = layout.path;
  const n = path.length;
  const pos = [];
  const half = 0.55;
  let prev = null;
  let prevSeg = samples[0].length === 3 ? samples[0][2] : 0;
  let prevFrac = samples[0][0];
  for (let k = 0; k < samples.length; k++) {
    const [frac, lat] = samples[k];
    const seg = samples[k].length === 3 ? samples[k][2] : 0;
    // An off-road reset teleports the recorded run eighteen nodes back. Joining
    // across it drew a straight bar through the scenery, so the ribbon breaks.
    if (seg !== prevSeg || frac < prevFrac - 0.004) prev = null;
    prevSeg = seg; prevFrac = frac;
    const fi = clamp(frac, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(fi));
    const t = fi - i;
    const a = path[i], b = path[i + 1];
    const px = (a.x + (b.x - a.x) * t);
    const py = (a.y + (b.y - a.y) * t);
    const h = a.heading;
    const nx = -Math.sin(h), nz = Math.cos(h);
    const off = lat;   // prototype lateral units
    const cx = (px + nx * off) * S;
    const cz = (py + nz * off) * S;
    const cy = (a.elev + (b.elev - a.elev) * t) * S + 0.12;
    const lx = cx + nx * half, lz = cz + nz * half;
    const rx = cx - nx * half, rz = cz - nz * half;
    const cur = { lx, ly: cy, lz, rx, ry: cy, rz };
    if (prev) {
      pos.push(prev.lx, prev.ly, prev.lz, prev.rx, prev.ry, prev.rz, cur.rx, cur.ry, cur.rz);
      pos.push(prev.lx, prev.ly, prev.lz, cur.rx, cur.ry, cur.rz, cur.lx, cur.ly, cur.lz);
    }
    prev = cur;
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.34, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 3;
  return { mesh, mat, geo };
}

// Gradient sky dome, vertex colours only, drawn on the inside of a sphere.
export function buildSky(biome) {
  const geo = new THREE.SphereGeometry(1800, 20, 14);
  const colors = [];
  const top = new THREE.Color(biome.sky.top);
  const mid = new THREE.Color(biome.sky.mid);
  const bot = new THREE.Color(biome.sky.bot);
  const p = geo.attributes.position;
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const h = p.getY(i) / 1800;
    if (h <= 0) tmp.copy(bot);
    else if (h < 0.34) tmp.copy(bot).lerp(mid, Math.pow(h / 0.34, 0.75));
    else tmp.copy(mid).lerp(top, Math.pow((h - 0.34) / 0.66, 1.35));
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // Drawn AFTER the opaque world so the depth test rejects every sky pixel the
  // terrain already covers. Drawing it first costs a second full-screen fill.
  mesh.renderOrder = 8;
  return { mesh, mat, geo };
}

export function buildStars(biome, rng) {
  const count = 300;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color(biome.accent);
  for (let i = 0; i < count; i++) {
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(rng() * 0.85 + 0.1);
    const r = 1580;
    pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
    pos[i * 3 + 1] = Math.cos(ph) * r;
    pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
    const b = 0.55 + rng() * 0.45;
    const mix = rng() > 0.75 ? c : { r: 1, g: 1, b: 1 };
    col[i * 3] = mix.r * b; col[i * 3 + 1] = mix.g * b; col[i * 3 + 2] = mix.b * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 8, sizeAttenuation: true, vertexColors: true, fog: false,
    transparent: true, opacity: 0.9, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = 9;
  return { mesh: pts, mat, geo };
}
