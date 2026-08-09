// track.js — Redline GT circuit data + 3D geometry builder.
// Layout generation carries the prototype's seeded LCG and per-track
// constants verbatim (game.js of the pseudo-3D prototype is the design doc);
// the centreline is then lifted into real world space for the 3D build.
//
// Fix round 1 art pass: every circuit now owns a surface treatment, a prop
// kit, a horizon landmark, a lighting event and a weather state, and the
// static world is emitted as frustum-cullable chunks on cheap Lambert
// materials so the added dressing costs less than the flat build it replaces.
import * as THREE from 'three';

export const SEG_LEN = 90;          // prototype units per segment
export const ROAD_HALF = 7.4;       // world metres, half road width
export const WORLD_SCALE = 0.10;    // prototype unit -> world metre

// --- Track table. Prototype seeds/difficulty/medal times preserved exactly.
// Palette + timeOfDay added for the 3D art pass (art bible: dawn/noon/dusk/night).
export const TRACKS = [
  {
    name: 'Copper Halo', code: '01', seed: 17, difficulty: 1,
    gold: 108, silver: 141, bronze: 190,
    desc: 'A forgiving loop under a warm sky.',
    timeOfDay: 'dawn',
    sky: { top: 0x2f6ab4, mid: 0xe2794a, bot: 0xf6b877 },
    sun: { color: 0xffd9a8, intensity: 0.72, dir: [-0.45, 0.42, 0.78] },
    hemi: { sky: 0xffc98a, ground: 0x4a3524, intensity: 0.40 },
    fog: 0xd08a63, fogDensity: 0.00105,
    ground: 0x6d7a44, groundAlt: 0x8a9450,
    road: 0x39414c, rumbleA: 0xf2f0e6, rumbleB: 0xd8543f,
    accent: 0xffcf67, prop: 'trees',
    propColors: [0x3f6b34, 0x4e7c3a, 0x7d5a32],
    // --- circuit identity (fix round 1)
    surface: 'asphalt',
    surfacePatch: [0x4a5360, 0x2f3742],
    propKit: 'pine',
    scatter: 'grass',
    scatterColor: 0x8d9a54,
    landmark: 'ridge',
    landmarkColor: 0x53506a,
    landmarkColor2: 0x6b6480,
    clouds: { band: 0.30, density: 0.55, color: 0xffd9b0, soft: 0xd8825e },
    sunDisc: { size: 78, color: 0xfff0c8, glow: 0xffb46a },
    lightEvent: 'godrays',
    decal: 'skid',
    route: {
      shortcut: { phase: 48, side: 1, style: 'dirt-cut' },
      boosts: [{ phase: 24, lane: -0.45 }, { phase: 82, lane: 0.42 }, { phase: 113, lane: 0 }],
      secret: { phase: 96, side: -1, reward: 'nitro' },
    },
  },
  {
    name: 'Moonlit Weave', code: '02', seed: 31, difficulty: 2,
    gold: 120, silver: 156, bronze: 210,
    desc: 'Linked bends reward a clean rhythm.',
    timeOfDay: 'night',
    sky: { top: 0x141d5e, mid: 0x1d2456, bot: 0x4a3f78 },
    sun: { color: 0xa8c4ff, intensity: 0.42, dir: [0.55, 0.55, -0.62] },
    hemi: { sky: 0x6a7fc4, ground: 0x161b30, intensity: 0.30 },
    fog: 0x232a58, fogDensity: 0.00130,
    ground: 0x27314a, groundAlt: 0x2f3a56,
    road: 0x2b3140, rumbleA: 0xe8f6ff, rumbleB: 0x2f7f92,
    accent: 0x7de4eb, prop: 'pylons',
    propColors: [0x39506e, 0x7de4eb, 0x24304a],
    stars: true,
    surface: 'seal',
    surfacePatch: [0x323a4c, 0x232936],
    propKit: 'mast',
    scatter: 'lamp',
    scatterColor: 0x7de4eb,
    landmark: 'skyline',
    landmarkColor: 0x1b2340,
    landmarkColor2: 0x2b3a63,
    clouds: { band: 0.42, density: 0.30, color: 0x59619c, soft: 0x2a3060 },
    sunDisc: { size: 54, color: 0xe8f2ff, glow: 0x8fa8e0 },
    lightEvent: 'moonwash',
    decal: 'manhole',
    route: {
      shortcut: { phase: 70, side: -1, style: 'narrow-gap' },
      boosts: [{ phase: 20, lane: 0.4 }, { phase: 60, lane: -0.35 }, { phase: 108, lane: 0.2 }],
      secret: { phase: 36, side: 1, reward: 'shield' },
    },
  },
  {
    name: 'Ember Switchback', code: '03', seed: 53, difficulty: 3,
    gold: 132, silver: 171, bronze: 230,
    desc: 'Short straights. Long commitment.',
    timeOfDay: 'dusk',
    sky: { top: 0x5a1f63, mid: 0x8d2f45, bot: 0xef7a4d },
    sun: { color: 0xffc089, intensity: 0.78, dir: [0.62, 0.34, 0.7] },
    hemi: { sky: 0xff9d6a, ground: 0x4d2a26, intensity: 0.46 },
    fog: 0xb85347, fogDensity: 0.00125,
    ground: 0x8a5738, groundAlt: 0xa66b40,
    road: 0x30272e, rumbleA: 0xffe9cf, rumbleB: 0xc4402f,
    accent: 0xff9d57, prop: 'rocks',
    propColors: [0x7a4a38, 0x93583c, 0x5c3628],
    surface: 'gravelled',
    surfacePatch: [0x453640, 0x241e24],
    propKit: 'boulder',
    scatter: 'shrub',
    scatterColor: 0x6b4a2c,
    landmark: 'mesa',
    landmarkColor: 0x6b3630,
    landmarkColor2: 0x8a4436,
    clouds: { band: 0.24, density: 0.70, color: 0xffb27a, soft: 0x8e3a48 },
    sunDisc: { size: 96, color: 0xffd6a0, glow: 0xff7a44 },
    lightEvent: 'emberdrift',
    decal: 'crack',
    route: {
      shortcut: { phase: 46, side: 1, style: 'dirt-cut' },
      boosts: [{ phase: 25, lane: -0.5 }, { phase: 80, lane: 0.45 }, { phase: 114, lane: -0.2 }],
      secret: { phase: 102, side: -1, reward: 'nitro' },
    },
  },
  {
    name: 'Glassbreak Ridge', code: '04', seed: 79, difficulty: 4,
    gold: 144, silver: 186, bronze: 252,
    desc: 'Blind crests hide the quickest line.',
    timeOfDay: 'noon',
    sky: { top: 0x3f9fd8, mid: 0x63a7b0, bot: 0xc8ecec },
    sun: { color: 0xffffff, intensity: 0.80, dir: [0.3, 0.82, 0.48] },
    hemi: { sky: 0xbfe4f2, ground: 0x63705c, intensity: 0.44 },
    fog: 0x9dc2cc, fogDensity: 0.00092,
    ground: 0x8fa08c, groundAlt: 0xa6b39c,
    road: 0x3a464d, rumbleA: 0xffffff, rumbleB: 0x3f8f7a,
    accent: 0xb8f2d1, prop: 'trees',
    propColors: [0x2f6350, 0x3d7a5e, 0x8fa08c],
    surface: 'concrete',
    surfacePatch: [0x4b565e, 0x30393f],
    propKit: 'broadleaf',
    scatter: 'boulderlet',
    scatterColor: 0x9aa694,
    landmark: 'crags',
    landmarkColor: 0x7c8f9a,
    landmarkColor2: 0xa8bcc4,
    clouds: { band: 0.46, density: 0.85, color: 0xffffff, soft: 0xbfd6de },
    sunDisc: { size: 46, color: 0xffffff, glow: 0xdff3ff },
    lightEvent: 'highnoon',
    decal: 'patch',
    route: {
      shortcut: { phase: 112, side: -1, style: 'crest-ramp' },
      boosts: [{ phase: 30, lane: 0.4 }, { phase: 63, lane: -0.4 }, { phase: 101, lane: 0.35 }],
      secret: { phase: 24, side: 1, reward: 'repair' },
    },
  },
  {
    name: 'Stormneedle Run', code: '05', seed: 101, difficulty: 5,
    gold: 156, silver: 201, bronze: 274,
    desc: 'A fast, narrow dance through weather.',
    timeOfDay: 'dusk',
    sky: { top: 0x1b2f52, mid: 0x28406e, bot: 0x5b76a8 },
    sun: { color: 0xc3d8ff, intensity: 0.55, dir: [-0.6, 0.5, -0.62] },
    hemi: { sky: 0x7f97c8, ground: 0x1c2534, intensity: 0.33 },
    fog: 0x33456b, fogDensity: 0.00150,
    ground: 0x3b4759, groundAlt: 0x455266,
    road: 0x262f3a, rumbleA: 0xe4efff, rumbleB: 0x3f6bb0,
    accent: 0x8bb8ff, prop: 'pylons',
    propColors: [0x2b384c, 0x8bb8ff, 0x1e2836],
    stars: true, rain: true,
    surface: 'wet',
    surfacePatch: [0x33404f, 0x1c232c],
    propKit: 'spire',
    scatter: 'reed',
    scatterColor: 0x4a5a6e,
    landmark: 'needles',
    landmarkColor: 0x1e2b40,
    landmarkColor2: 0x33456b,
    clouds: { band: 0.18, density: 0.95, color: 0x6d81a8, soft: 0x22304c },
    sunDisc: { size: 0, color: 0x9fb8e0, glow: 0x4a6088 },
    lightEvent: 'lightning',
    decal: 'puddle',
    route: {
      shortcut: { phase: 58, side: 1, style: 'narrow-gap' },
      boosts: [{ phase: 18, lane: -0.45 }, { phase: 76, lane: 0.4 }, { phase: 115, lane: 0 }],
      secret: { phase: 90, side: -1, reward: 'shield' },
    },
  },
  {
    name: 'Obsidian Crown', code: '06', seed: 149, difficulty: 6,
    gold: 170, silver: 219, bronze: 298,
    desc: 'The crown circuit. No wasted motion.',
    timeOfDay: 'night',
    sky: { top: 0x2a1245, mid: 0x2c1038, bot: 0x6d295a },
    sun: { color: 0xffa8d8, intensity: 0.46, dir: [0.5, 0.6, 0.62] },
    hemi: { sky: 0xb15b91, ground: 0x140f22, intensity: 0.28 },
    fog: 0x3a1442, fogDensity: 0.00140,
    ground: 0x241d33, groundAlt: 0x2c243d,
    road: 0x221d2b, rumbleA: 0xffd9ee, rumbleB: 0xc23c86,
    accent: 0xff79bb, prop: 'pylons',
    propColors: [0x3a2a4c, 0xff79bb, 0x241a30],
    stars: true,
    surface: 'polished',
    surfacePatch: [0x2e2739, 0x191424],
    propKit: 'crystal',
    scatter: 'glowstone',
    scatterColor: 0xff79bb,
    landmark: 'arches',
    landmarkColor: 0x1d1230,
    landmarkColor2: 0x3d1c50,
    clouds: { band: 0.34, density: 0.45, color: 0x7a3468, soft: 0x2a1038 },
    sunDisc: { size: 66, color: 0xffd0ea, glow: 0xff79bb },
    lightEvent: 'crownglow',
    decal: 'inlay',
    route: {
      shortcut: { phase: 42, side: -1, style: 'crest-ramp' },
      boosts: [{ phase: 22, lane: 0.45 }, { phase: 77, lane: -0.45 }, { phase: 108, lane: 0.3 }],
      secret: { phase: 96, side: 1, reward: 'nitro' },
    },
  },
];

// Prototype LCG — bit-for-bit identical so layouts match the design doc.
export function makeRandom(seed) {
  let n = seed >>> 0;
  return function () {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

// Deterministic authored segment generator. The first round retained the
// prototype's low-amplitude noise stream, which made a full-throttle lap read
// like a straight with decorative bends. This pass gives every circuit a real
// race program: a launch straight, a sweeper, a hairpin, an S transition, a
// second sweeper and a crest. The seed still changes the roadside hazards and
// the exact timing of the program, so layouts remain stable per circuit.
export function buildLayout(cfg) {
  const rng = makeRandom(cfg.seed);
  const count = 320 + cfg.difficulty * 28;
  const segments = [];
  let curve = 0, hill = 0, worldX = 0;
  let targetCurve = 0, targetHill = 0;
  let block = 0;
  let section = 0;
  const severity = 0.78 + cfg.difficulty * 0.075;
  for (let i = 0; i < count; i++) {
    const phase = i % 132;
    const cycle = Math.floor(i / 132);
    const sign = (cycle + Math.floor(cfg.seed / 17)) % 2 ? -1 : 1;
    let feature = '';
    let programCurve = 0;
    let programHill = 0;
    if (phase < 18) {
      programCurve = 0;
      programHill = 0;
    } else if (phase < 42) {
      // Long loaded sweeper, with a visible outside-to-inside racing line.
      programCurve = sign * 0.62 * severity;
      programHill = Math.sin((phase - 18) * 0.12) * (8 + cfg.difficulty * 2);
      feature = 'sweeper';
    } else if (phase < 58) {
      // Hairpin: sustained curvature is intentionally stronger than the old
      // noise stream so gas-only driving reaches the outside wall.
      programCurve = -sign * 1.16 * severity;
      programHill = -12 - cfg.difficulty * 2;
      feature = 'hairpin';
    } else if (phase < 78) {
      // Immediate reversal creates the S turn and rewards a late release.
      programCurve = sign * 0.94 * severity;
      programHill = 12 + cfg.difficulty * 2;
      feature = 's-turn';
    } else if (phase < 104) {
      programCurve = -sign * 0.48 * severity;
      programHill = Math.sin((phase - 78) * 0.16) * (10 + cfg.difficulty * 2);
      feature = 'sweeper';
    } else if (phase < 116) {
      // A short straight lets the player reset before the next technical set.
      programCurve = 0;
      programHill = 0;
    } else {
      // The rise is a crest at low difficulty and a jump ramp at high speed.
      programCurve = sign * 0.24 * severity;
      programHill = 34 + cfg.difficulty * 8;
      feature = 'crest';
    }

    // Ease into and out of the authored target so the road remains driveable,
    // while retaining enough sustained curvature to punish a held accelerator.
    if (block-- <= 0) {
      block = 5 + Math.floor(rng() * (8 - Math.min(3, cfg.difficulty)));
      targetCurve = programCurve + (rng() - 0.5) * 0.08;
      targetHill = programHill + (rng() - 0.5) * (5 + cfg.difficulty * 2);
      section++;
    }
    curve += (targetCurve - curve) * (0.15 + cfg.difficulty * 0.006);
    hill += (targetHill - hill) * 0.11;
    if (i % 47 === 12) hill += (rng() > 0.5 ? 1 : -1) * (24 + cfg.difficulty * 3);
    worldX += curve * 0.028;
    let obstacle = null;
    // Hazards are placed on the outside of technical sections and on selected
    // straights. They are visible track furniture, not invisible blockers.
    const outside = programCurve >= 0 ? -1 : 1;
    if (i > 20 && i < count - 15 &&
      (rng() < 0.018 + cfg.difficulty * 0.004 ||
       ((feature === 'hairpin' || feature === 's-turn') && i % 7 === 0))) {
      obstacle = {
        x: (rng() * 0.22 + 0.73) * (rng() > 0.35 ? outside : -outside),
        kind: feature === 'hairpin' ? 'barrier' : (rng() > 0.5 ? 'post' : 'rock'),
      };
    }
    segments.push({
      curve, hill, worldX, obstacle, stripe: i % 2,
      feature,
      bank: feature === 'hairpin' || feature === 'sweeper'
        ? (programCurve >= 0 ? -1 : 1) * (0.035 + cfg.difficulty * 0.004)
        : 0,
    });
  }
  return { config: cfg, segments, count, length: count * SEG_LEN, rng };
}

// Lift the prototype's (curve, hill) stream into a closed world-space
// centreline. Heading integrates curve; the loop is force-closed by
// distributing the residual yaw + position error smoothly across the lap so
// start/finish joins seamlessly without altering the corner rhythm.
export function buildCenterline(layout) {
  const segs = layout.segments;
  const n = segs.length;
  const step = SEG_LEN * WORLD_SCALE;

  // Pass 1: raw heading integration to measure the closure error.
  const rawCurve = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) { rawCurve[i] = segs[i].curve * 0.052; sum += rawCurve[i]; }
  // Force total yaw to exactly one full turn (a closed circuit).
  const targetTotal = Math.PI * 2 * (sum >= 0 ? 1 : -1);
  const yawFix = (targetTotal - sum) / n;

  const pts = [];
  let heading = 0, x = 0, z = 0;
  for (let i = 0; i < n; i++) {
    heading += rawCurve[i] + yawFix;
    x += Math.sin(heading) * step;
    z += Math.cos(heading) * step;
    pts.push({ x, z, heading });
  }
  // Distribute residual translation error so the ring closes exactly.
  const ex = pts[n - 1].x, ez = pts[n - 1].z;
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / n;
    pts[i].x -= ex * t;
    pts[i].z -= ez * t;
  }

  // Elevation from the prototype hill channel, smoothed and wrapped so the
  // first and last segment meet at the same height.
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = segs[i].hill * WORLD_SCALE * 0.55;
  const y0 = y[0];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    y[i] = y[i] - (y[n - 1] - y0) * t - y0;
  }
  // Two smoothing passes kill the wrap seam and any single-segment spikes.
  for (let pass = 0; pass < 2; pass++) {
    const src = Float32Array.from(y);
    for (let i = 0; i < n; i++) {
      const a = src[(i - 1 + n) % n], b = src[i], c = src[(i + 1) % n];
      y[i] = a * 0.25 + b * 0.5 + c * 0.25;
    }
  }

  // Final nodes with tangent/normal + cumulative arc length.
  const nodes = [];
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    let dx = q.x - p.x, dz = q.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    nodes.push({
      x: p.x, y: y[i], z: p.z,
      tx: dx, tz: dz,
      nx: dz, nz: -dx,          // left-hand normal in XZ
      heading: Math.atan2(dx, dz),
      dist, len,
      curve: segs[i].curve,
      obstacle: segs[i].obstacle,
      stripe: segs[i].stripe,
      feature: segs[i].feature,
      bank: segs[i].bank || 0,
    });
    dist += len;
  }
  return { nodes, totalLength: dist };
}

// Sample the centreline at an arc-length position (metres), wrapping.
// `out` is an optional scratch record. This runs four to six times a frame and
// used to allocate a fresh object every call, which was a steady drip of
// garbage straight into the collector pauses the feel gate counts as spikes.
export function sampleCenterline(center, s, out) {
  const nodes = center.nodes;
  const total = center.totalLength;
  let d = s % total;
  if (d < 0) d += total;
  // Nodes are near-uniform in length so an indexed guess converges instantly.
  let i = Math.floor(d / total * nodes.length) % nodes.length;
  let guard = 0;
  while (guard++ < nodes.length) {
    const nd = nodes[i];
    if (d < nd.dist) { i = (i - 1 + nodes.length) % nodes.length; continue; }
    if (d >= nd.dist + nd.len) { i = (i + 1) % nodes.length; continue; }
    break;
  }
  const a = nodes[i], b = nodes[(i + 1) % nodes.length];
  const t = a.len > 0 ? (d - a.dist) / a.len : 0;
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = out || {};
  r.index = i; r.t = tt;
  r.x = a.x + (b.x - a.x) * tt;
  r.y = a.y + (b.y - a.y) * tt;
  r.z = a.z + (b.z - a.z) * tt;
  r.tx = a.tx; r.tz = a.tz; r.nx = a.nx; r.nz = a.nz;
  r.heading = a.heading;
  r.curve = a.curve + (b.curve - a.curve) * tt;
  r.feature = tt < 0.5 ? a.feature : b.feature;
  r.bank = a.bank + (b.bank - a.bank) * tt;
  return r;
}

// Supply-cell rows are part of the authored circuit rhythm, not a random
// roadside scatter. Each row lands just after a loaded corner, an S exit, or
// the crest reset in the 132-segment race program. The three lane offsets make
// a clean line a choice rather than a mandatory centre-lane pickup.
export function buildItemRows(center) {
  const step = SEG_LEN * WORLD_SCALE;
  const cycle = 132 * step;
  const phases = [62, 82, 4];
  const laneSets = [
    [-0.62, 0, 0.62],
    [0.62, 0, -0.62],
    [-0.5, 0.5, 0],
  ];
  const rows = [];
  const cycles = Math.ceil(center.totalLength / cycle);
  for (let c = 0; c < cycles; c++) {
    for (let r = 0; r < phases.length; r++) {
      const dist = c * cycle + phases[r] * step + step * 0.5;
      if (dist > 28 && dist < center.totalLength - 24) {
        rows.push({ dist, lanes: laneSets[r] });
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------- geometry
// The static circuit is emitted as a small number of merged, frustum-cullable
// chunks. One merged mesh per layer was cheaper in draw calls but paid the
// full vertex cost of the whole lap on every frame; chunking cut the vertex
// work by roughly an order of magnitude at the same handful of draw calls,
// which is what bought the room for the extra dressing in this pass.
function pushQuad(pos, col, a, b, c, d, color) {
  const tri = [a, b, c, a, c, d];
  for (const v of tri) { pos.push(v[0], v[1], v[2]); col.push(color.r, color.g, color.b); }
}

function makeVertexGeom(pos, col, forceUp) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Ground-like surfaces are authored as horizontal ribbons whose winding is
  // not consistently counter-clockwise from above; without this the key light
  // hits their undersides and the surface renders ambient-only (flat colour).
  if (forceUp) {
    const nAttr = g.attributes.normal;
    for (let i = 0; i < nAttr.count; i++) {
      if (nAttr.getY(i) < 0) {
        nAttr.setXYZ(i, -nAttr.getX(i), -nAttr.getY(i), -nAttr.getZ(i));
      }
    }
    nAttr.needsUpdate = true;
  }
  g.computeBoundingSphere();
  return g;
}

// Stylized flat-shaded art does not read PBR, and MeshStandardMaterial's
// fragment cost was the single largest term in the throttled frame budget.
// Lambert renders these vertex-coloured surfaces identically at a fraction of
// the cost, which is what pays for the denser dressing in this pass.
function worldMat(opts) {
  return new THREE.MeshLambertMaterial(Object.assign({
    vertexColors: true, flatShading: true,
  }, opts || {}));
}

// Emit one mesh per non-empty bucket, all sharing a single material.
function chunkGroup(buckets, mat, forceUp) {
  const group = new THREE.Group();
  for (const b of buckets) {
    if (!b.pos.length) continue;
    group.add(new THREE.Mesh(makeVertexGeom(b.pos, b.col, forceUp), mat));
  }
  return group;
}
function makeBuckets(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ pos: [], col: [] });
  return out;
}

const ROAD_CHUNK = 24;   // centreline nodes per road/prop chunk

// ------------------------------------------------------------------ surface
// Per-circuit surface treatment. Each kind lays a different base weave, so the
// six circuits never read as the same asphalt with a different tint.
function surfaceColors(cfg) {
  const base = new THREE.Color(cfg.road);
  const patchA = new THREE.Color(cfg.surfacePatch ? cfg.surfacePatch[0] : cfg.road);
  const patchB = new THREE.Color(cfg.surfacePatch ? cfg.surfacePatch[1] : cfg.road);
  return { base, patchA, patchB };
}

export function buildTrackMeshes(cfg, center) {
  const nodes = center.nodes;
  const n = nodes.length;
  const group = new THREE.Group();
  const nChunks = Math.ceil(n / ROAD_CHUNK);

  const road = makeBuckets(nChunks);
  const rumble = makeBuckets(nChunks);
  const shoulder = makeBuckets(nChunks);

  const S = surfaceColors(cfg);
  const cRumA = new THREE.Color(cfg.rumbleA);
  const cRumB = new THREE.Color(cfg.rumbleB);
  const cLine = new THREE.Color(0xf6f1de);
  const cShoulderA = new THREE.Color(cfg.ground).multiplyScalar(0.86);
  const cShoulderB = new THREE.Color(cfg.groundAlt).multiplyScalar(0.72);
  const cKerbEdge = new THREE.Color(cfg.accent).multiplyScalar(0.35);
  const tmp = new THREE.Color();

  const RUMBLE = 1.25;
  const SHOULDER = 9.0;
  const LINE_W = 0.22;
  const wet = cfg.surface === 'wet';
  const polished = cfg.surface === 'polished';
  const rng = makeRandom(cfg.seed * 7 + 11);

  for (let i = 0; i < n; i++) {
    const a = nodes[i], b = nodes[(i + 1) % n];
    const k = Math.floor(i / ROAD_CHUNK);
    const rp = road[k].pos, rc = road[k].col;
    const edge = (nd, off) => [nd.x + nd.nx * off, nd.y + nd.bank * off + 0.02, nd.z + nd.nz * off];

    // Road surface. Instead of one tone per segment the lane is split into
    // three longitudinal strips with a per-strip weave, so the tarmac has
    // wheel-path wear and a visible crown rather than reading as a flat slab.
    const wear = 0.86 + 0.28 * ((i * 0.37) % 1);
    for (let strip = 0; strip < 3; strip++) {
      const o0 = -ROAD_HALF + (strip / 3) * ROAD_HALF * 2;
      const o1 = -ROAD_HALF + ((strip + 1) / 3) * ROAD_HALF * 2;
      // wheel paths (outer strips) are polished darker, centre keeps grip tone
      const isPath = strip !== 1;
      tmp.copy(isPath ? S.patchB : S.base).lerp(S.patchA, (i % 5) * 0.06);
      tmp.multiplyScalar(isPath ? wear * 0.94 : wear);
      if (wet) tmp.multiplyScalar(0.82).lerp(new THREE.Color(cfg.accent), 0.06);
      if (polished) tmp.lerp(new THREE.Color(cfg.accent), 0.03 + (i % 3) * 0.01);
      pushQuad(rp, rc, edge(a, o0), edge(a, o1), edge(b, o1), edge(b, o0), tmp);
    }

    // Surface decals: sparse per-circuit marks that break the repeat.
    if (i % 17 === 3) {
      const dOff = (rng() * 2 - 1) * (ROAD_HALF - 1.6);
      const w = 0.5 + rng() * 1.4;
      const lift = (nd, off) => [nd.x + nd.nx * off, nd.y + nd.bank * off + 0.045, nd.z + nd.nz * off];
      tmp.copy(S.patchA).multiplyScalar(cfg.decal === 'puddle' ? 0.55 : 0.78);
      if (cfg.decal === 'puddle') tmp.lerp(new THREE.Color(cfg.sky.mid), 0.5);
      if (cfg.decal === 'inlay') tmp.copy(new THREE.Color(cfg.accent)).multiplyScalar(0.35);
      pushQuad(rp, rc, lift(a, dOff - w), lift(a, dOff + w), lift(b, dOff + w), lift(b, dOff - w), tmp);
    }

    // centre dashes (every other segment)
    if (a.stripe === 0) {
      const lift = (nd, off) => [nd.x + nd.nx * off, nd.y + nd.bank * off + 0.05, nd.z + nd.nz * off];
      pushQuad(rp, rc, lift(a, -LINE_W), lift(a, LINE_W), lift(b, LINE_W), lift(b, -LINE_W), cLine);
    }
    // solid edge lines, inboard of the rumble strip: they read the track width
    // at speed far better than the dashes alone.
    for (const side of [-1, 1]) {
      const o = (ROAD_HALF - 0.45) * side;
      const lift = (nd, off) => [nd.x + nd.nx * off, nd.y + nd.bank * off + 0.05, nd.z + nd.nz * off];
      pushQuad(rp, rc, lift(a, o - 0.14), lift(a, o + 0.14), lift(b, o + 0.14), lift(b, o - 0.14), cLine);
    }

    // rumble strips both sides, alternating colour per segment, with a chamfer
    // face so the kerb has a lit edge instead of reading as painted ground.
    const rcol = a.stripe ? cRumA : cRumB;
    const bp = rumble[k].pos, bc = rumble[k].col;
    for (const side of [-1, 1]) {
      const inner = ROAD_HALF * side;
      const outer = (ROAD_HALF + RUMBLE) * side;
      const lift = (nd, off, h) => [nd.x + nd.nx * off, nd.y + nd.bank * off + h, nd.z + nd.nz * off];
      pushQuad(bp, bc, lift(a, inner, 0.04), lift(a, outer, 0.13), lift(b, outer, 0.13), lift(b, inner, 0.04), rcol);
      // outer chamfer down to the shoulder
      pushQuad(bp, bc, lift(a, outer, 0.13), lift(a, outer + 0.35, -0.02),
        lift(b, outer + 0.35, -0.02), lift(b, outer, 0.13), cKerbEdge);
    }

    // graded shoulder falling away from the rumble strip, two-tone so the
    // verge has material separation from the terrain behind it.
    const sp = shoulder[k].pos, sc = shoulder[k].col;
    for (const side of [-1, 1]) {
      const inner = (ROAD_HALF + RUMBLE) * side;
      const mid = (ROAD_HALF + RUMBLE + 2.6) * side;
      const outer = (ROAD_HALF + SHOULDER) * side;
      const hi = (nd, off, d) => [nd.x + nd.nx * off, nd.y + nd.bank * off - d, nd.z + nd.nz * off];
      tmp.copy(cShoulderA).multiplyScalar(0.94 + (i % 4) * 0.03);
      pushQuad(sp, sc, hi(a, inner, 0), hi(b, inner, 0), hi(b, mid, 0.3), hi(a, mid, 0.3), tmp);
      tmp.copy(cShoulderB).multiplyScalar(0.9 + (i % 3) * 0.05);
      pushQuad(sp, sc, hi(a, mid, 0.3), hi(b, mid, 0.3), hi(b, outer, 0.85), hi(a, outer, 0.85), tmp);
    }
  }

  const roadMat = worldMat({ reflectivity: 0 });
  const rumbleMat = worldMat();
  const shoulderMat = worldMat();

  const roadGroup = chunkGroup(road, roadMat, true);
  roadGroup.renderOrder = 1;
  group.add(roadGroup);
  group.add(chunkGroup(rumble, rumbleMat, true));
  group.add(chunkGroup(shoulder, shoulderMat, true));

  return { group, materials: [roadMat, rumbleMat, shoulderMat] };
}

// Ground built as a chunked, vertex-coloured relief grid. Colour is a blend of
// several bands (base, alt, patch, scatter tint) rather than a two-tone
// dither, so the terrain reads as graded material instead of a flat slab.
export function buildGround(cfg, center, rng) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const nd of center.nodes) {
    if (nd.x < minX) minX = nd.x; if (nd.x > maxX) maxX = nd.x;
    if (nd.z < minZ) minZ = nd.z; if (nd.z > maxZ) maxZ = nd.z;
  }
  const pad = 300;
  minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
  const cols = 72, rows = 72;
  const CH = 9;                   // 8x8 chunk grid over the terrain
  const buckets = makeBuckets((cols / CH) * (rows / CH) + 1);
  const dx = (maxX - minX) / cols, dz = (maxZ - minZ) / rows;
  const cA = new THREE.Color(cfg.ground), cB = new THREE.Color(cfg.groundAlt);
  const cPatch = new THREE.Color(cfg.scatterColor || cfg.groundAlt);
  const cRock = new THREE.Color(cfg.landmarkColor || cfg.ground);
  const tmp = new THREE.Color();

  const nodes = center.nodes;
  const FLAT = 34;    // fully flat inside this radius
  const BLEND = 130;  // full relief beyond this radius
  function nearTrack(x, z) {
    let best = Infinity, bestY = 0;
    for (let k = 0; k < nodes.length; k += 4) {
      const nd = nodes[k];
      const d = (nd.x - x) * (nd.x - x) + (nd.z - z) * (nd.z - z);
      if (d < best) { best = d; bestY = nd.y; }
    }
    return { dist: Math.sqrt(best), y: bestY };
  }

  // Four-octave relief. The two extra high-frequency terms are what turn the
  // old low-frequency slab into readable ground at chase-camera distance.
  function height(u, v) {
    const relief =
      Math.sin(u * 0.0045 + v * 0.0031) * 12 +
      Math.cos(v * 0.0062) * 8 +
      Math.sin(u * 0.0131 - v * 0.0094) * 4.2 +
      Math.sin(u * 0.021 + v * 0.017) * 2.2 +
      Math.cos(u * 0.048 - v * 0.037) * 0.9;
    const near = nearTrack(u, v);
    const t = Math.min(1, Math.max(0, (near.dist - FLAT) / (BLEND - FLAT)));
    const s = t * t * (3 - 2 * t);
    return (near.y - 1.4) * (1 - s) + (relief - 1.4) * s;
  }

  // Material bands: a smooth field selects between the ground tones, a patch
  // tone and an exposed-rock tone, then a fine grain modulates brightness.
  function shade(u, v, y, out) {
    const band = Math.sin(u * 0.0032 + v * 0.0021) * 0.5 + 0.5;
    const patch = Math.sin(u * 0.0091 - v * 0.0117) * 0.5 + 0.5;
    out.copy(cA).lerp(cB, band);
    if (patch > 0.72) out.lerp(cPatch, (patch - 0.72) * 2.4);
    if (y > 9) out.lerp(cRock, Math.min(0.55, (y - 9) * 0.05));
    const grain = 0.84 + ((Math.sin(u * 0.31 + v * 0.19) * 0.5 + 0.5) * 0.32);
    out.multiplyScalar(grain * (0.92 + rng() * 0.16));
    return out;
  }

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x0 = minX + i * dx, z0 = minZ + j * dz;
      const x1 = x0 + dx, z1 = z0 + dz;
      const h00 = height(x0, z0), h01 = height(x0, z1);
      const h11 = height(x1, z1), h10 = height(x1, z0);
      shade((x0 + x1) * 0.5, (z0 + z1) * 0.5, (h00 + h11) * 0.5, tmp);
      const b = buckets[Math.floor(i / CH) * Math.floor(rows / CH) + Math.floor(j / CH)];
      // Wound counter-clockwise seen from +Y so computeVertexNormals yields an
      // UP normal.
      pushQuad(b.pos, b.col,
        [x0, h00, z0], [x0, h01, z1], [x1, h11, z1], [x1, h10, z0], tmp);
    }
  }
  const mat = worldMat();
  const group = chunkGroup(buckets, mat, true);
  group.renderOrder = 0;
  return { mesh: group, mat, bounds: { minX, maxX, minZ, maxZ }, height };
}

// ------------------------------------------------------------------- props
// Beveled procedural forms. Every solid is built from a tapered prism helper
// with a chamfer, so nothing in the world is an un-beveled box or a bare cone.
function prism(pos, col, cx, cy, cz, r0, r1, h, sides, color, yaw, tilt) {
  const a0 = yaw || 0;
  const t = tilt || 0;
  for (let i = 0; i < sides; i++) {
    const p0 = a0 + (i / sides) * Math.PI * 2;
    const p1 = a0 + ((i + 1) / sides) * Math.PI * 2;
    const bx0 = cx + Math.cos(p0) * r0, bz0 = cz + Math.sin(p0) * r0;
    const bx1 = cx + Math.cos(p1) * r0, bz1 = cz + Math.sin(p1) * r0;
    const tx0 = cx + Math.cos(p0) * r1 + t, tz0 = cz + Math.sin(p0) * r1;
    const tx1 = cx + Math.cos(p1) * r1 + t, tz1 = cz + Math.sin(p1) * r1;
    pushQuad(pos, col, [bx0, cy, bz0], [bx1, cy, bz1], [tx1, cy + h, tz1], [tx0, cy + h, tz0], color);
  }
  // cap
  if (r1 > 0.001) {
    for (let i = 1; i < sides - 1; i++) {
      const p0 = a0, p1 = a0 + (i / sides) * Math.PI * 2, p2 = a0 + ((i + 1) / sides) * Math.PI * 2;
      const v = [
        [cx + Math.cos(p0) * r1 + t, cy + h, cz + Math.sin(p0) * r1],
        [cx + Math.cos(p1) * r1 + t, cy + h, cz + Math.sin(p1) * r1],
        [cx + Math.cos(p2) * r1 + t, cy + h, cz + Math.sin(p2) * r1],
      ];
      for (const q of v) { pos.push(q[0], q[1], q[2]); col.push(color.r, color.g, color.b); }
    }
  }
}

function bevelBox(pos, col, cx, cy, cz, hx, hy, hz, color, yaw, bevel) {
  // A box with its top face inset: reads as a chamfered solid, not a cube.
  const bv = bevel == null ? 0.22 : bevel;
  const cs = Math.cos(yaw || 0), sn = Math.sin(yaw || 0);
  const P = (x, y, z) => [cx + x * cs - z * sn, cy + y, cz + x * sn + z * cs];
  const ix = hx * (1 - bv), iz = hz * (1 - bv);
  const v = [
    P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy * 0.72, -hz), P(-hx, hy * 0.72, -hz),
    P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy * 0.72, hz), P(-hx, hy * 0.72, hz),
    P(-ix, hy, -iz), P(ix, hy, -iz), P(ix, hy, iz), P(-ix, hy, iz),
  ];
  const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2],
    [3, 2, 9, 8], [6, 7, 11, 10], [7, 3, 8, 11], [2, 6, 10, 9], [8, 9, 10, 11], [4, 5, 1, 0]];
  for (const f of faces) pushQuad(pos, col, v[f[0]], v[f[1]], v[f[2]], v[f[3]], color);
}

// Roadside props: per-circuit kits, clustered rather than evenly spread, and
// chunked so only the props near the camera pay vertex cost.
export function buildProps(cfg, center, rng) {
  const nodes = center.nodes;
  const nChunks = Math.ceil(nodes.length / ROAD_CHUNK);
  const buckets = makeBuckets(nChunks);
  const crowdPos = [], crowdCol = [], crowdPhase = [];
  const c0 = new THREE.Color(cfg.propColors[0]);
  const c1 = new THREE.Color(cfg.propColors[1]);
  const c2 = new THREE.Color(cfg.propColors[2]);
  const cAccent = new THREE.Color(cfg.accent);
  const tmp = new THREE.Color();
  const kit = cfg.propKit || 'pine';

  function place(k, x, y, z, scale, r) {
    const pos = buckets[k].pos, col = buckets[k].col;
    switch (kit) {
      case 'pine': {
        const h = (5.5 + r() * 6) * scale;
        tmp.copy(c2).multiplyScalar(0.72 + r() * 0.3);
        prism(pos, col, x, y, z, 0.42 * scale, 0.3 * scale, h * 0.3, 5, tmp, r() * 6);
        // three tapered foliage tiers, each inset: a silhouette, not a cone
        for (let t = 0; t < 3; t++) {
          const base = y + h * (0.24 + t * 0.22);
          const rr = (2.3 - t * 0.62) * scale * (0.85 + r() * 0.3);
          tmp.copy(t === 0 ? c0 : c1).multiplyScalar(0.74 + r() * 0.34 - t * 0.05);
          prism(pos, col, x, base, z, rr, rr * 0.42, h * 0.3, 6, tmp, r() * 6);
        }
        break;
      }
      case 'broadleaf': {
        const h = (4.6 + r() * 5) * scale;
        tmp.copy(c2).multiplyScalar(0.7 + r() * 0.3);
        prism(pos, col, x, y, z, 0.5 * scale, 0.34 * scale, h * 0.45, 5, tmp, r() * 6);
        tmp.copy(r() > 0.45 ? c0 : c1).multiplyScalar(0.78 + r() * 0.34);
        // canopy: wide low dome from two stacked frusta
        prism(pos, col, x, y + h * 0.42, z, 1.5 * scale, 3.0 * scale, h * 0.24, 7, tmp, r() * 6);
        tmp.multiplyScalar(1.12);
        prism(pos, col, x, y + h * 0.66, z, 3.0 * scale, 1.1 * scale, h * 0.34, 7, tmp, r() * 6);
        break;
      }
      case 'boulder': {
        const s = (1.7 + r() * 3.2) * scale;
        tmp.copy(r() > 0.5 ? c0 : c2).multiplyScalar(0.78 + r() * 0.4);
        prism(pos, col, x, y, z, s, s * 0.62, s * 1.05, 6, tmp, r() * 6, (r() - 0.5) * s * 0.4);
        tmp.copy(c1).multiplyScalar(0.82 + r() * 0.3);
        prism(pos, col, x, y + s * 1.0, z, s * 0.62, s * 0.18, s * 0.5, 5, tmp, r() * 6);
        if (r() > 0.5) {
          tmp.copy(c2).multiplyScalar(0.9);
          prism(pos, col, x + s * 1.2, y, z - s * 0.6, s * 0.5, s * 0.28, s * 0.55, 5, tmp, r() * 6);
        }
        break;
      }
      case 'mast': {
        const h = (8 + r() * 7) * scale;
        tmp.copy(c0).multiplyScalar(0.86 + r() * 0.24);
        prism(pos, col, x, y, z, 0.5 * scale, 0.26 * scale, h, 5, tmp, r() * 6);
        tmp.copy(c2).multiplyScalar(0.9);
        bevelBox(pos, col, x, y + h * 0.62, z, 1.7 * scale, 0.16 * scale, 0.26 * scale, tmp, r() * 6, 0.3);
        tmp.copy(c1);
        prism(pos, col, x, y + h, z, 0.7 * scale, 0.18 * scale, 1.1 * scale, 6, tmp, 0);
        break;
      }
      case 'spire': {
        const h = (9 + r() * 9) * scale;
        tmp.copy(c0).multiplyScalar(0.82 + r() * 0.28);
        prism(pos, col, x, y, z, 0.95 * scale, 0.42 * scale, h * 0.72, 5, tmp, r() * 6);
        tmp.copy(c2).multiplyScalar(0.95);
        prism(pos, col, x, y + h * 0.72, z, 0.42 * scale, 0.05 * scale, h * 0.34, 5, tmp, r() * 6);
        tmp.copy(c1);
        bevelBox(pos, col, x, y + h * 0.52, z, 0.9 * scale, 0.12 * scale, 0.2 * scale, tmp, r() * 6, 0.35);
        break;
      }
      default: { // crystal
        const h = (5 + r() * 8) * scale;
        tmp.copy(c0).multiplyScalar(0.8 + r() * 0.3);
        prism(pos, col, x, y, z, 1.2 * scale, 0.75 * scale, h * 0.55, 5, tmp, r() * 6, (r() - 0.5) * 1.2);
        tmp.copy(c1).multiplyScalar(0.85 + r() * 0.3);
        prism(pos, col, x, y + h * 0.55, z, 0.75 * scale, 0.02 * scale, h * 0.6, 5, tmp, r() * 6, (r() - 0.5) * 1.4);
        if (r() > 0.4) {
          tmp.copy(cAccent).multiplyScalar(0.5);
          prism(pos, col, x + scale * 1.3, y, z + scale * 0.6, 0.6 * scale, 0.02 * scale, h * 0.5, 5, tmp, r() * 6);
        }
        break;
      }
    }
  }

  // Clustered composition: props arrive in groves of two to five with a
  // clearing between, instead of one prop every third node.
  let i = 4;
  while (i < nodes.length - 2) {
    const gap = 5 + Math.floor(rng() * 9);
    i += gap;
    if (i >= nodes.length - 2) break;
    if (rng() > 0.82) continue;
    const side = rng() > 0.5 ? 1 : -1;
    const clusterN = 2 + Math.floor(rng() * 4);
    const baseOff = ROAD_HALF + 12 + rng() * 30;
    for (let c = 0; c < clusterN; c++) {
      const nd = nodes[(i + Math.floor(rng() * 4)) % nodes.length];
      const k = Math.min(buckets.length - 1, Math.floor(i / ROAD_CHUNK));
      const off = (baseOff + rng() * 26) * side;
      const jitter = (rng() - 0.5) * 14;
      const x = nd.x + nd.nx * off + nd.tx * jitter;
      const z = nd.z + nd.nz * off + nd.tz * jitter;
      place(k, x, nd.y - 0.6, z, 0.7 + rng() * 0.7, rng);
    }
  }

  // Low scatter dressing between the groves: cheap two-face tufts, rocks or
  // markers depending on the circuit, laid close to the verge.
  const cScatter = new THREE.Color(cfg.scatterColor || cfg.groundAlt);
  for (let s = 6; s < nodes.length; s += 2) {
    if (rng() > 0.55) continue;
    const nd = nodes[s];
    const k = Math.min(buckets.length - 1, Math.floor(s / ROAD_CHUNK));
    const side = rng() > 0.5 ? 1 : -1;
    const off = (ROAD_HALF + 8 + rng() * 9) * side;
    const x = nd.x + nd.nx * off, z = nd.z + nd.nz * off, y = nd.y - 0.85;
    tmp.copy(cScatter).multiplyScalar(0.68 + rng() * 0.5);
    const h = 0.6 + rng() * 1.5;
    if (cfg.scatter === 'lamp' || cfg.scatter === 'glowstone') {
      prism(buckets[k].pos, buckets[k].col, x, y, z, 0.22, 0.1, h * 2.4, 4, tmp, rng() * 6);
    } else {
      prism(buckets[k].pos, buckets[k].col, x, y, z, 0.55 + rng() * 0.4, 0.12, h, 4, tmp, rng() * 6);
    }
  }

  // Grandstands + original-brand billboards on the longest straights.
  const cStand = new THREE.Color(0x3a4455);
  const cStandTop = new THREE.Color(cfg.accent).multiplyScalar(0.65);
  const cSeat = new THREE.Color(0xd8dee8);
  const cBoard = new THREE.Color(cfg.accent);
  const cBoardBack = new THREE.Color(0x1b2330);
  let placed = 0;
  for (let j = 8; j < nodes.length - 8 && placed < 6; j += 11) {
    let straight = 0;
    for (let k = 0; k < 9; k++) straight += Math.abs(nodes[(j + k) % nodes.length].curve);
    if (straight > 0.7) continue;
    const nd = nodes[j];
    const bk = buckets[Math.min(buckets.length - 1, Math.floor(j / ROAD_CHUNK))];
    const side = placed % 2 ? 1 : -1;
    const off = (ROAD_HALF + 20) * side;
    const x = nd.x + nd.nx * off, z = nd.z + nd.nz * off, y = nd.y - 0.6;
    const yaw = nd.heading;
    if (placed % 2 === 0) {
      bevelBox(bk.pos, bk.col, x, y + 2.4, z, 3.6, 2.4, 13, cStand, yaw, 0.12);
      bevelBox(bk.pos, bk.col, x, y + 5.1, z, 3.9, 0.4, 13.4, cStandTop, yaw, 0.2);
      for (let r = 0; r < 3; r++) {
        bevelBox(bk.pos, bk.col, x - side * (1.6 - r * 1.1), y + 3.2 + r * 0.85, z, 0.9, 0.22, 12.2, cSeat, yaw, 0.25);
      }
      // Small spectator points give the authored grandstand a living read.
      // They share one points draw and bob in the vertex shader.
      for (let crowd = 0; crowd < 18; crowd++) {
        crowdPos.push(
          x + (rng() - 0.5) * 6.4,
          y + 3.55 + (crowd % 3) * 0.86,
          z + (rng() - 0.5) * 20
        );
        const cc = crowd % 3 === 0 ? cBoard : crowd % 3 === 1 ? cSeat : cStandTop;
        crowdCol.push(cc.r, cc.g, cc.b);
        crowdPhase.push(rng() * Math.PI * 2);
      }
    } else {
      bevelBox(bk.pos, bk.col, x, y + 1.6, z, 0.35, 1.6, 0.35, cBoardBack, yaw, 0.3);
      bevelBox(bk.pos, bk.col, x, y + 5.2, z, 0.28, 2.3, 8.2, cBoardBack, yaw, 0.1);
      bevelBox(bk.pos, bk.col, x - side * 0.35, y + 5.2, z, 0.14, 2.0, 7.8, cBoard, yaw, 0.08);
    }
    placed++;
  }

  const mat = worldMat();
  // Secondary motion, one per prop class: a height-weighted wind sway injected
  // in the vertex stage. It costs nothing on the CPU and never touches the sim.
  mat.userData.wind = { value: 0 };
  mat.userData.windAmp = { value: kit === 'boulder' || kit === 'crystal' ? 0.05 : 0.35 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = mat.userData.wind;
    shader.uniforms.uWindAmp = mat.userData.windAmp;
    shader.vertexShader = 'uniform float uWind;\nuniform float uWindAmp;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n' +
      'float swayH = max(transformed.y, 0.0);\n' +
      'transformed.x += sin(uWind + position.x * 0.07 + position.z * 0.05) * swayH * 0.006 * uWindAmp;\n' +
      'transformed.z += cos(uWind * 0.83 + position.z * 0.06) * swayH * 0.005 * uWindAmp;'
    );
  };
  const propGroup = chunkGroup(buckets, mat);
  let crowd = null;
  if (crowdPos.length) {
    const crowdGeo = new THREE.BufferGeometry();
    crowdGeo.setAttribute('position', new THREE.Float32BufferAttribute(crowdPos, 3));
    const crowdColors = new Float32Array(crowdCol);
    const crowdColorAttr = new THREE.BufferAttribute(crowdColors, 3);
    crowdGeo.setAttribute('color', crowdColorAttr);
    const crowdMat = new THREE.PointsMaterial({
      size: 1.6, sizeAttenuation: true, vertexColors: true, transparent: true,
      opacity: 0.88, depthWrite: false, fog: true,
    });
    // One Points draw, with no custom vertex program. game.js modulates this
    // color buffer at a low cadence so the stand stays alive without paying a
    // sin() per crowd vertex on every render frame.
    crowd = {
      mesh: new THREE.Points(crowdGeo, crowdMat), mat: crowdMat,
      colors: crowdColorAttr, baseColors: crowdColors.slice(),
      phases: new Float32Array(crowdPhase), lastAnimated: false,
    };
    crowd.mesh.frustumCulled = false;
    propGroup.add(crowd.mesh);
  }
  return { mesh: propGroup, mat, crowd };
}

// Horizon landmarks: a distant silhouette ring, unique per circuit. One draw
// call, no fog, placed far enough out that it parallaxes but never intersects
// the playable world.
export function buildLandmarks(cfg, center, rng) {
  const pos = [], col = [];
  // Distant silhouettes are authored UNLIT with the atmospheric perspective
  // already baked into the vertex colour: a lit distant ridge just renders as a
  // black triangle, which is exactly the placeholder read this pass is fixing.
  // Near ridges keep some of their own rock colour, far ones dissolve into the
  // horizon band.
  const cNear = new THREE.Color(cfg.landmarkColor || cfg.fog)
    .lerp(new THREE.Color(cfg.sky.mid), 0.42);
  const cFar = new THREE.Color(cfg.landmarkColor2 || cfg.sky.mid)
    .lerp(new THREE.Color(cfg.sky.bot), 0.62);
  const cAccent = new THREE.Color(cfg.accent);
  const tmp = new THREE.Color();
  let cx = 0, cz = 0;
  for (const nd of center.nodes) { cx += nd.x; cz += nd.z; }
  cx /= center.nodes.length; cz /= center.nodes.length;

  const kind = cfg.landmark || 'ridge';
  const RING = 1250;
  const count = kind === 'skyline' ? 54 : 34;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.06;
    const r = RING * (0.82 + rng() * 0.34);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const far = (r - RING * 0.82) / (RING * 0.34);
    tmp.copy(cNear).lerp(cFar, far * 0.85);
    // A touch of vertical banding so a ridge is not one flat silhouette tone.
    tmp.multiplyScalar(0.92 + (i % 4) * 0.045);
    switch (kind) {
      case 'skyline': {
        const h = 60 + rng() * 190;
        const w = 22 + rng() * 40;
        bevelBox(pos, col, x, -20 + h / 2, z, w, h / 2, w * 0.8, tmp, rng() * 3, 0.1);
        if (rng() > 0.6) {
          tmp.copy(cAccent).multiplyScalar(0.55);
          bevelBox(pos, col, x, -20 + h + 8, z, 3, 8, 3, tmp, 0, 0.3);
        }
        break;
      }
      case 'mesa': {
        const h = 70 + rng() * 150;
        prism(pos, col, x, -30, z, 90 + rng() * 90, 62 + rng() * 60, h, 6, tmp, rng() * 6);
        break;
      }
      case 'needles': {
        const h = 130 + rng() * 260;
        prism(pos, col, x, -30, z, 26 + rng() * 26, 2, h, 5, tmp, rng() * 6, (rng() - 0.5) * 30);
        break;
      }
      case 'crags': {
        const h = 90 + rng() * 200;
        prism(pos, col, x, -30, z, 70 + rng() * 70, 12 + rng() * 26, h, 5, tmp, rng() * 6, (rng() - 0.5) * 40);
        break;
      }
      case 'arches': {
        const h = 80 + rng() * 120;
        const w = 40 + rng() * 30;
        prism(pos, col, x - w, -30, z, 18, 14, h, 5, tmp, rng() * 6);
        prism(pos, col, x + w, -30, z, 18, 14, h, 5, tmp, rng() * 6);
        bevelBox(pos, col, x, -30 + h + 14, z, w + 16, 14, 16, tmp, 0, 0.2);
        break;
      }
      default: { // ridge
        const h = 60 + rng() * 130;
        prism(pos, col, x, -30, z, 150 + rng() * 140, 34 + rng() * 60, h, 5, tmp, rng() * 6, (rng() - 0.5) * 60);
      }
    }
  }
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const mesh = new THREE.Mesh(makeVertexGeom(pos, col), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return { mesh, mat };
}

// Collidable obstacles kept as beveled solids so a barrier reads as a barrier.
export function buildObstacles(cfg, center) {
  const list = [];
  const nodes = center.nodes;
  const nChunks = Math.ceil(nodes.length / ROAD_CHUNK);
  const buckets = makeBuckets(nChunks);
  const cPostA = new THREE.Color(0xd94a4a), cPostB = new THREE.Color(0xf7e6a8);
  const cRock = new THREE.Color(cfg.propColors[0]).multiplyScalar(1.15);
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i];
    if (!nd.obstacle) continue;
    const b = buckets[Math.floor(i / ROAD_CHUNK)];
    const lateral = nd.obstacle.x * ROAD_HALF;
    const x = nd.x + nd.nx * lateral, z = nd.z + nd.nz * lateral, y = nd.y;
    if (nd.obstacle.kind === 'post') {
      prism(b.pos, b.col, x, y, z, 0.4, 0.3, 2.2, 6, cPostA, nd.heading);
      prism(b.pos, b.col, x, y + 2.2, z, 0.46, 0.3, 0.4, 6, cPostB, nd.heading);
    } else if (nd.obstacle.kind === 'barrier') {
      // Hairpin safety blocks are wider and brighter than a single rock, so
      // the outside wall reads before the player reaches the apex.
      bevelBox(b.pos, b.col, x, y + 0.55, z, 1.15, 0.55, 0.55, cPostA, nd.heading, 0.18);
      bevelBox(b.pos, b.col, x, y + 1.2, z, 1.0, 0.12, 0.35, cPostB, nd.heading, 0.1);
    } else {
      prism(b.pos, b.col, x, y, z, 1.15, 0.6, 1.5, 6, cRock, nd.heading * 1.3, 0.25);
    }
    list.push({ index: i, lateral, x, z, radius: 1.3, dist: nd.dist });
  }
  const mat = worldMat();
  return { mesh: chunkGroup(buckets, mat), mat, list };
}

// Start/finish gantry, placed over node 0.
export function buildStartLine(cfg, center) {
  const pos = [], col = [];
  const cA = new THREE.Color(0xf2f2ee), cB = new THREE.Color(0x1b1f26);
  const cPost = new THREE.Color(cfg.accent).multiplyScalar(0.8);
  const cBeam = new THREE.Color(cfg.accent).multiplyScalar(0.42);
  function quadAt(a, b, o0, o1, yLift, color) {
    pushQuad(pos, col,
      [a.x + a.nx * o0, a.y + yLift, a.z + a.nz * o0],
      [a.x + a.nx * o1, a.y + yLift, a.z + a.nz * o1],
      [b.x + b.nx * o1, b.y + yLift, b.z + b.nz * o1],
      [b.x + b.nx * o0, b.y + yLift, b.z + b.nz * o0], color);
  }
  const nodes = center.nodes;
  for (let r = 0; r < 2; r++) {
    const a = nodes[r % nodes.length], b = nodes[(r + 1) % nodes.length];
    for (let c = 0; c < 10; c++) {
      const o0 = -ROAD_HALF + (c / 10) * ROAD_HALF * 2;
      const o1 = -ROAD_HALF + ((c + 1) / 10) * ROAD_HALF * 2;
      quadAt(a, b, o0, o1, 0.06, (c + r) % 2 ? cA : cB);
    }
  }
  const nd = nodes[0];
  for (const side of [-1, 1]) {
    const o = (ROAD_HALF + 1.6) * side;
    prism(pos, col, nd.x + nd.nx * o, nd.y, nd.z + nd.nz * o, 0.55, 0.4, 6.8, 6, cPost, nd.heading);
  }
  bevelBox(pos, col, nd.x, nd.y + 7.1, nd.z, 0.5, 0.55, ROAD_HALF + 2, cBeam, nd.heading, 0.2);
  const mat = worldMat();
  return { mesh: new THREE.Mesh(makeVertexGeom(pos, col, true), mat), mat };
}

// ----------------------------------------------------------------- sky
// Gradient sky dome with a baked sun disc, horizon haze band and a cloud
// layer, all in vertex colour on one BackSide sphere: no extra draw call, no
// texture, and every circuit gets a distinct read at its own time of day.
export function buildSky(cfg) {
  const geo = new THREE.SphereGeometry(2000, 40, 26);
  const colors = [];
  const top = new THREE.Color(cfg.sky.top);
  const mid = new THREE.Color(cfg.sky.mid);
  const bot = new THREE.Color(cfg.sky.bot);
  const disc = cfg.sunDisc || { size: 0, color: 0xffffff, glow: 0xffffff };
  const cDisc = new THREE.Color(disc.color);
  const cGlow = new THREE.Color(disc.glow);
  const clouds = cfg.clouds || { band: 0.3, density: 0, color: 0xffffff, soft: 0xffffff };
  const cCloud = new THREE.Color(clouds.color);
  const cCloudSoft = new THREE.Color(clouds.soft);
  const p = geo.attributes.position;
  const tmp = new THREE.Color();

  // Sun direction in dome space, normalised.
  const sd = cfg.sun.dir;
  const sl = Math.hypot(sd[0], sd[1], sd[2]) || 1;
  const sx = sd[0] / sl, sy = sd[1] / sl, sz = sd[2] / sl;
  const discCos = Math.cos((disc.size || 0) / 2000 * 4);       // angular radius
  const glowCos = Math.cos(Math.min(1.2, (disc.size || 0) / 2000 * 26));

  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i) / 2000, vy = p.getY(i) / 2000, vz = p.getZ(i) / 2000;
    const h = vy;
    // Gradient retuned for the CAMERA BAND. A 62 degree chase camera aimed at
    // the horizon only ever sees roughly h = 0 to 0.45, so the old ramp spent
    // the whole visible band easing bot -> mid and put the zenith colour
    // entirely off screen: the sky read as one flat warm field. The horizon
    // glow is now compressed into the bottom fifth and the zenith colour is
    // reached by h = 0.5, so the visible band actually carries the full ramp.
    if (h <= 0) {
      tmp.copy(bot);
    } else if (h < 0.16) {
      tmp.copy(bot).lerp(mid, Math.pow(h / 0.16, 0.8));
    } else if (h < 0.5) {
      tmp.copy(mid).lerp(top, Math.pow((h - 0.16) / 0.34, 1.05));
    } else {
      tmp.copy(top);
    }

    // Cloud layer: banded, wrapped in azimuth, densest at the circuit's band
    // height and thinning toward the zenith.
    if (clouds.density > 0.01) {
      const az = Math.atan2(vz, vx);
      const bandT = 1 - Math.min(1, Math.abs(h - clouds.band * 0.55) / 0.2);
      if (bandT > 0) {
        const f = Math.sin(az * 3.1 + h * 11) * 0.5 + Math.sin(az * 7.7 - h * 19) * 0.32
          + Math.sin(az * 13.3 + h * 5) * 0.18;
        const cov = (f * 0.5 + 0.5) - (1 - clouds.density) * 0.7;
        if (cov > 0) {
          const amt = Math.min(1, cov * 1.8) * bandT * bandT;
          tmp.lerp(cCloudSoft, amt * 0.55);
          tmp.lerp(cCloud, amt * amt * 0.5);
        }
      }
    }

    // Horizon haze: a thin bright band right at the skyline so the ground
    // silhouette separates from the sky instead of muddying into it.
    const haze = Math.max(0, 1 - Math.abs(h) / 0.075);
    if (haze > 0) tmp.lerp(bot, haze * 0.55);

    // Sun disc + glow.
    if (disc.size > 0) {
      const d = vx * sx + vy * sy + vz * sz;
      if (d > glowCos) {
        const g = (d - glowCos) / (1 - glowCos);
        tmp.lerp(cGlow, Math.pow(g, 2.2) * 0.85);
        if (d > discCos) tmp.copy(cDisc);
      }
    }
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  return { mesh, mat, geo };
}

// Star field for the night/dusk circuits (Points, one draw call).
export function buildStars(cfg, rng) {
  const count = 320;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color(cfg.accent);
  for (let i = 0; i < count; i++) {
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(rng() * 0.85 + 0.1);
    const r = 1750;
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
    size: 9, sizeAttenuation: true, vertexColors: true, fog: false,
    transparent: true, opacity: 0.9, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -1;
  return { mesh: pts, mat, geo };
}

// ---------------------------------------------------------------- route layer
// The route layer is intentionally separate from the centreline. The main road
// remains the fixed handling contract, while these authored side lines add a
// visible risk/reward read without changing the proven steering normal.
export function buildRaceFeatures(cfg, center) {
  const group = new THREE.Group();
  const route = cfg.route || {};
  const step = SEG_LEN * WORLD_SCALE;
  const cycle = 132 * step;
  const cycles = Math.ceil(center.totalLength / cycle);
  const shortcuts = [];
  const boostPads = [];
  const secrets = [];
  const branchPos = [], branchCol = [];
  const branchNear = new THREE.Color(cfg.groundAlt).lerp(new THREE.Color(cfg.accent), 0.18);
  const branchFar = new THREE.Color(cfg.surfacePatch ? cfg.surfacePatch[1] : cfg.road)
    .lerp(new THREE.Color(cfg.accent), 0.09);
  const branchEdge = new THREE.Color(cfg.accent).multiplyScalar(0.72);
  const sampleA = {}, sampleB = {};

  function pointAt(s, lane, out) {
    const p = sampleCenterline(center, s, out);
    return [p.x + p.nx * lane * ROAD_HALF, p.y + p.bank * lane * ROAD_HALF + 0.09,
      p.z + p.nz * lane * ROAD_HALF];
  }

  function branchPoint(feature, s, lane, t, out) {
    const q = pointAt(s, lane, out);
    if (feature.style === 'crest-ramp') q[1] += Math.sin(t * Math.PI) * 0.62;
    return q;
  }

  // One branch per authored rhythm. Its lane bends away from the main ribbon,
  // then rejoins at the exit, so the shortcut is visible before it is useful.
  if (route.shortcut) {
    for (let c = 0; c < cycles; c++) {
      const entry = c * cycle + route.shortcut.phase * step;
      if (entry < 30 || entry > center.totalLength - 34) continue;
      const exit = Math.min(entry + 23 * step, (c + 1) * cycle - 24);
      const feature = {
        entry, exit, side: route.shortcut.side || 1, entryLane: (route.shortcut.side || 1) * 0.64,
        style: route.shortcut.style || 'dirt-cut', lastLap: -1,
      };
      shortcuts.push(feature);
      const branchHalf = feature.style === 'narrow-gap' ? 1.65 / ROAD_HALF : 2.45 / ROAD_HALF;
      for (let j = 0; j < 9; j++) {
        const t0 = j / 9, t1 = (j + 1) / 9;
        const lane0 = feature.side * (0.64 + Math.sin(t0 * Math.PI) * 0.42);
        const lane1 = feature.side * (0.64 + Math.sin(t1 * Math.PI) * 0.42);
        const a0 = branchPoint(feature, entry + (exit - entry) * t0, lane0, t0, sampleA);
        const a1 = branchPoint(feature, entry + (exit - entry) * t1, lane1, t1, sampleB);
        const p0 = branchPoint(feature, entry + (exit - entry) * t0, lane0 - branchHalf, t0, sampleA);
        const p1 = branchPoint(feature, entry + (exit - entry) * t1, lane1 - branchHalf, t1, sampleB);
        const q0 = branchPoint(feature, entry + (exit - entry) * t0, lane0 + branchHalf, t0, sampleA);
        const q1 = branchPoint(feature, entry + (exit - entry) * t1, lane1 + branchHalf, t1, sampleB);
        const c = feature.style === 'crest-ramp' ? (j % 2 ? branchEdge : branchNear)
          : j % 3 === 1 ? branchFar : branchNear;
        pushQuad(branchPos, branchCol, p0, q0, q1, p1, c);
        // A narrow accent lip makes the branch edge legible in fog and at night.
        pushQuad(branchPos, branchCol, p0, a0, a1, p1, branchEdge);
        pushQuad(branchPos, branchCol, a0, q0, q1, a1, branchEdge);
      }
      const ep = sampleCenterline(center, entry + (exit - entry) * 0.48, sampleA);
      const lane = feature.side * 1.06;
      const bx = ep.x + ep.nx * lane * ROAD_HALF;
      const bz = ep.z + ep.nz * lane * ROAD_HALF;
      const warning = new THREE.Color(cfg.accent).multiplyScalar(0.6);
      bevelBox(branchPos, branchCol, bx, ep.y + 0.48, bz, 0.16, 0.48, 2.5, warning, ep.heading, 0.12);
    }
  }

  const branchMat = worldMat({ fog: true });
  if (branchPos.length) {
    const branchMesh = new THREE.Mesh(makeVertexGeom(branchPos, branchCol, true), branchMat);
    branchMesh.renderOrder = 1;
    group.add(branchMesh);
  }

  const padGeo = new THREE.BoxGeometry(0.34, 0.065, 1.75);
  const glowGeo = new THREE.PlaneGeometry(3.6, 4.2);
  const padMat = new THREE.MeshBasicMaterial({ color: cfg.accent, transparent: true, opacity: 0.96, fog: true });
  const glowMat = new THREE.MeshBasicMaterial({
    color: cfg.accent, transparent: true, opacity: 0.18, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
  });
  const secretMat = new THREE.MeshBasicMaterial({ color: 0xfff0a4, transparent: true, opacity: 0.9, fog: true });
  const secretGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffd86b, transparent: true, opacity: 0.14, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
  });

  function addChevronSet(root, material, size) {
    for (let k = -1; k <= 1; k++) {
      const chevron = new THREE.Mesh(padGeo, material);
      chevron.position.x = k * size;
      chevron.rotation.y = k === -1 ? -0.56 : k === 1 ? 0.56 : 0;
      root.add(chevron);
    }
  }

  if (route.boosts) {
    for (let c = 0; c < cycles; c++) {
      for (let b = 0; b < route.boosts.length; b++) {
        const spec = route.boosts[b];
        const dist = c * cycle + spec.phase * step;
        if (dist < 28 || dist > center.totalLength - 24) continue;
        const p = sampleCenterline(center, dist, sampleA);
        const root = new THREE.Group();
        root.position.set(p.x + p.nx * spec.lane * ROAD_HALF, p.y + p.bank * spec.lane * ROAD_HALF + 0.08,
          p.z + p.nz * spec.lane * ROAD_HALF);
        root.rotation.y = p.heading;
        addChevronSet(root, padMat, 0.58);
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = -0.015;
        root.add(glow);
        group.add(root);
        boostPads.push({ dist, lane: spec.lane, root, glow, lastLap: -1, pulse: 0, baseScale: 1 });
      }
    }
  }

  // The secret reward is deliberately placed behind a board at the side of a
  // straight. The tiny beacon is the tell; the reward line stays hidden until
  // an explorer closes on the side lane.
  if (route.secret) {
    for (let c = 0; c < cycles; c++) {
      const markerDist = c * cycle + route.secret.phase * step;
      const rewardDist = markerDist + 2.4 * step;
      if (rewardDist < 34 || rewardDist > center.totalLength - 28) continue;
      const p = sampleCenterline(center, rewardDist, sampleA);
      const side = route.secret.side || 1;
      const root = new THREE.Group();
      root.position.set(p.x + p.nx * side * ROAD_HALF * 1.08, p.y + p.bank * side * ROAD_HALF * 1.08, p.z + p.nz * side * ROAD_HALF * 1.08);
      root.rotation.y = p.heading;
      const boardMat = new THREE.MeshBasicMaterial({ color: cfg.propColors[2], fog: true });
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.8, 4.4), boardMat);
      board.position.set(0, 1.45, -2.6);
      root.add(board);
      const tell = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), secretMat);
      tell.position.set(0, 2.05, -0.85);
      root.add(tell);
      const reward = new THREE.Group();
      addChevronSet(reward, secretMat, 0.58);
      const rewardGlow = new THREE.Mesh(glowGeo, secretGlowMat);
      rewardGlow.rotation.x = -Math.PI / 2;
      rewardGlow.position.y = -0.03;
      reward.add(rewardGlow);
      reward.visible = false;
      root.add(reward);
      group.add(root);
      secrets.push({ dist: rewardDist, lane: side * 1.08, root, tell, reward, rewardGlow, lastLap: -1, pulse: 0, revealed: false, rewardScale: 0, rewardId: route.secret.reward || 'nitro' });
    }
  }

  return { group, shortcuts, boostPads, secrets, materials: [branchMat, padMat, glowMat, secretMat, secretGlowMat] };
}

// A second, hazier silhouette ring gives the horizon three depth bands even
// when the authored landmark is low. The mesh is procedural and one draw call.
export function buildHorizonLayers(cfg, center, rng) {
  const pos = [], col = [];
  let cx = 0, cz = 0;
  for (const nd of center.nodes) { cx += nd.x; cz += nd.z; }
  cx /= center.nodes.length; cz /= center.nodes.length;
  const layers = [
    { radius: 720, count: 28, color: new THREE.Color(cfg.landmarkColor || cfg.fog).lerp(new THREE.Color(cfg.sky.mid), 0.28) },
    { radius: 980, count: 24, color: new THREE.Color(cfg.landmarkColor2 || cfg.sky.mid).lerp(new THREE.Color(cfg.sky.bot), 0.48) },
    { radius: 1320, count: 20, color: new THREE.Color(cfg.sky.mid).lerp(new THREE.Color(cfg.sky.bot), 0.7) },
  ];
  for (let layer = 0; layer < layers.length; layer++) {
    const band = layers[layer];
    for (let i = 0; i < band.count; i++) {
      const a = i / band.count * Math.PI * 2 + rng() * 0.08;
      const r = band.radius * (0.9 + rng() * 0.18);
      const h = (38 + rng() * 110) * (1 - layer * 0.16);
      const color = band.color.clone().multiplyScalar(0.9 + (i % 4) * 0.04);
      prism(pos, col, cx + Math.cos(a) * r, -24, cz + Math.sin(a) * r,
        50 + rng() * 70, 5 + rng() * 14, h, 5, color, a + rng() * 0.7, (rng() - 0.5) * 35);
    }
  }
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(makeVertexGeom(pos, col), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return { mesh, mat };
}

// Clouds are deliberately low-poly and sparse. A four-instance pool keeps the
// background's cloud read to one draw call; its transforms are updated from
// precomputed drift records at a low cadence by the render loop.
export function buildClouds(cfg, center, rng) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 8, 4);
  const mat = new THREE.MeshBasicMaterial({
    color: cfg.clouds ? cfg.clouds.color : 0xffffff, transparent: true,
    opacity: 0.12 + (cfg.clouds ? cfg.clouds.density : 0.3) * 0.08,
    depthWrite: false, fog: false,
  });
  const clouds = [];
  let cx = 0, cz = 0;
  for (const nd of center.nodes) { cx += nd.x; cz += nd.z; }
  cx /= center.nodes.length; cz /= center.nodes.length;
  const pool = 4;
  const mesh = new THREE.InstancedMesh(geo, mat, pool);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < pool; i++) {
    const cloud = {
      originX: cx - 420 + rng() * 840,
      centerX: cx,
      z: cz - 520 + rng() * 1040,
      scaleX: 34 + rng() * 52,
      scaleY: 5 + rng() * 8,
      scaleZ: 15 + rng() * 26,
      yaw: rng() * Math.PI,
      speed: 0.8 + rng() * 1.4,
      phase: rng() * Math.PI * 2,
      baseY: 72 + rng() * 46,
    };
    clouds.push(cloud);
    dummy.position.set(cloud.originX, cloud.baseY, cloud.z);
    dummy.scale.set(cloud.scaleX, cloud.scaleY, cloud.scaleZ);
    dummy.rotation.set(0, cloud.yaw, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  // The pool spans the distant sky, so a local instance bounding sphere would
  // cull it incorrectly as the camera follows the circuit.
  mesh.frustumCulled = false;
  group.add(mesh);
  group.renderOrder = -1;
  return { group, clouds, mesh, dummy, mat, lastAnimated: null };
}

// Cheap translucent shafts are only used on the brighter palettes. They are
// fixed planes, which reads as atmosphere at dusk without a post-process pass
// or a per-frame material update.
export function buildLightShafts(cfg, center) {
  const group = new THREE.Group();
  const count = cfg.lightEvent === 'moonwash' || cfg.lightEvent === 'lightning' ? 1 : 3;
  const geo = new THREE.PlaneGeometry(20, 150);
  const mat = new THREE.MeshBasicMaterial({
    color: cfg.sunDisc ? cfg.sunDisc.glow : cfg.accent, transparent: true,
    opacity: cfg.lightEvent === 'highnoon' ? 0.035 : 0.055,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  let cx = 0, cz = 0;
  for (const nd of center.nodes) { cx += nd.x; cz += nd.z; }
  cx /= center.nodes.length; cz /= center.nodes.length;
  const shafts = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(cx + (i - (count - 1) * 0.5) * 48, 70, cz - 90 - i * 18);
    dummy.rotation.y = (cfg.sun.dir[0] || 0) * 0.6 + i * 0.18;
    dummy.rotation.z = -0.16 + i * 0.06;
    dummy.updateMatrix();
    shafts.setMatrixAt(i, dummy.matrix);
  }
  shafts.instanceMatrix.needsUpdate = true;
  shafts.frustumCulled = false;
  group.add(shafts);
  group.renderOrder = 2;
  return { group, shafts, mat, baseOpacity: mat.opacity };
}
