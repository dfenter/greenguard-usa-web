// track.js — Redline GT circuit data + simulation track sampler.
// Layout generation carries the prototype's seeded LCG and per-track
// constants verbatim (game.js of the pseudo-3D prototype is the design doc);
// the centreline is then lifted into real world space for the 3D build.
//
// Fix round 1 art pass: every circuit now owns a surface treatment, a prop
// kit, a horizon landmark, a lighting event and a weather state, and the
// static world is emitted as frustum-cullable chunks on cheap Lambert
// materials so the added dressing costs less than the flat build it replaces.

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
      nx: dz, nz: -dx,          // prototype lateral normal in XZ
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


// Gameplay-only feature records. GGRacer owns all track presentation; these
// records remain title simulation state for shortcuts, boosts, and caches.
export function buildRaceFeatures(cfg, center) {
  const shortcuts = [], boostPads = [], secrets = [];
  const step = SEG_LEN * WORLD_SCALE;
  const cycle = 132 * step;
  const shortcutSpan = 20 + cfg.difficulty * 1.4;
  const cycles = Math.ceil(center.totalLength / cycle);
  for (let c = 0; c < cycles; c += 1) {
    const entry = c * cycle + cfg.route.shortcut.phase * step;
    if (entry > 20 && entry < center.totalLength - 30) {
      shortcuts.push({ entry, exit: entry + shortcutSpan, side: cfg.route.shortcut.side,
        style: cfg.route.shortcut.style, entryLane: cfg.route.shortcut.side * 0.8,
        lastLap: -1, lastAiLap: -1, lastAiRival: -1 });
    }
    for (const boost of cfg.route.boosts) {
      const dist = c * cycle + boost.phase * step;
      if (dist > 20 && dist < center.totalLength - 20) boostPads.push({ dist, lane: boost.lane, lastLap: -1, pulse: 0 });
    }
    const secretDist = c * cycle + cfg.route.secret.phase * step;
    if (secretDist > 20 && secretDist < center.totalLength - 20) {
      secrets.push({ dist: secretDist, lane: cfg.route.secret.side * 0.78,
        rewardId: cfg.route.secret.reward, lastLap: -1, pulse: 0, revealed: false, rewardScale: 0 });
    }
  }
  return { shortcuts, boostPads, secrets };
}
