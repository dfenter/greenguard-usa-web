// stage.js — Rally Dust stage data, seeded generation and simulation helpers.
//
// The archived 2D prototype is the design document. Its mulberry32 seed, its
// event roll (jump / rocks / chicane / hairpin / turn), its heading integration
// and its tree and rock scatter are carried across unchanged, so a seed still
// produces the same stage shape. What is new for the 3D build:
//   * an elevation channel (the prototype only had a cosmetic crest bounce)
//   * a per-node surface channel (the drift-weighted grip model)
//
// Rendering is supplied by the shared GGRacer adapter in game.js. This module
// stays independent of the engine and exposes only title simulation data.
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

// Rendering is supplied by /play/_shared/racer/. This module intentionally
// stops at the deterministic title simulation and track-query helpers.
