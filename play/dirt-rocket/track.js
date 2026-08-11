/* Dirt Rocket track content. Deterministic, authored family rhythms. */
export const DX = 6;

const PI2 = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smooth(t) { return t * t * (3 - 2 * t); }
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FAMILIES = {
  stadium: {
    id: 'stadium', name: 'Neon Stadium', subtitle: 'whoops, rhythm and grandstand heat',
    sky: ['#18263f', '#42637a', '#e28c5a'], ground: '#5c422b', dirt: '#a77b49', edge: '#efae5c', accent: '#57d9d2', time: 1,
  },
  dunes: {
    id: 'dunes', name: 'Red Dune Traverse', subtitle: 'wind-cut gaps and soft landings',
    sky: ['#321d25', '#c36e4b', '#f2bf75'], ground: '#7b4b32', dirt: '#c18a50', edge: '#f1c35c', accent: '#8de5cf', time: 2,
  },
  forest: {
    id: 'forest', name: 'Rootline Run', subtitle: 'roots, creek cuts and a hidden high line',
    sky: ['#0e2730', '#2e625e', '#b2b574'], ground: '#443a2d', dirt: '#796449', edge: '#a9d27c', accent: '#69d8b5', time: 0,
  },
  quarry: {
    id: 'quarry', name: 'Quarry Apex', subtitle: 'cliff faces and the long drop',
    sky: ['#1a1d2d', '#4c4f63', '#d4926a'], ground: '#3c414a', dirt: '#77736c', edge: '#f0a24c', accent: '#ff665b', time: 3,
  },
};

export const EVENTS = [
  { id: 'e1', name: 'Rookie Rumble', family: 'stadium', championship: 0, difficulty: 1, desc: 'Find the rhythm. Keep both wheels honest.' },
  { id: 'e2', name: 'Dune Pressure', family: 'dunes', championship: 0, difficulty: 2, desc: 'The soft line is slower. The high line is yours.' },
  { id: 'e3', name: 'Rootline Run', family: 'forest', championship: 1, difficulty: 3, desc: 'Read the roots, then commit to the creek.' },
  { id: 'e4', name: 'Quarry Apex', family: 'quarry', championship: 1, difficulty: 4, desc: 'The cliff gap is the whole race in miniature.' },
  { id: 'e5', name: 'Stadium Afterglow', family: 'stadium', championship: 2, difficulty: 4, desc: 'Same stadium. Faster pulse. Tighter landings.' },
  { id: 'e6', name: 'Dust Meridian', family: 'dunes', championship: 2, difficulty: 5, desc: 'Three dune faces, one clean exit.' },
  { id: 'e7', name: 'Forest Night Shift', family: 'forest', championship: 3, difficulty: 5, desc: 'The shortcut only appears if you look up.' },
  { id: 'e8', name: 'Crown of Stone', family: 'quarry', championship: 3, difficulty: 6, desc: 'The flagship run. Make the drop look easy.' },
];

export const CHAMPIONSHIPS = [
  { id: 'c1', name: 'Starter Cup', events: [0, 1], unlock: 0, color: '#efae5c' },
  { id: 'c2', name: 'Frontier Cup', events: [2, 3], unlock: 1, color: '#69d8b5' },
  { id: 'c3', name: 'Afterglow Cup', events: [4, 5], unlock: 2, color: '#8de5cf' },
  { id: 'c4', name: 'Apex Cup', events: [6, 7], unlock: 3, color: '#ff665b' },
];

function addSamples(h, target, start, end, fn) {
  const n = Math.max(1, Math.round((end - start) / DX));
  for (let i = 1; i <= n; i++) h.push(start + fn(i / n));
}

export function makeTrack(familyId, seed, eventIndex = 0, trackIndex = 0) {
  const family = FAMILIES[familyId] || FAMILIES.stadium;
  const r = rng(seed);
  const range = (a, b) => a + r() * (b - a);
  const h = [0];
  const marks = [];
  const pickups = [];
  const shortcut = { start: 0, end: 0, label: 'HIGH LINE', found: false };
  let x = 0;
  let base = 0;
  const seg = (length, fn) => {
    const from = base;
    addSamples(h, x, base, base + length, fn);
    base = h[h.length - 1];
    x += Math.round(length / DX) * DX;
    return from;
  };
  const flat = (length) => seg(length, () => 0);
  const rollers = (length, amp, cycles) => {
    const phase = range(0, PI2);
    return seg(length, t => amp * (Math.sin(phase + t * PI2 * cycles) - Math.sin(phase)));
  };
  const whoops = (length, amp) => seg(length, t => amp * (1 - Math.cos(t * PI2 * 6)) * 0.5 + amp * 0.24 * Math.sin(t * PI2 * 2));
  const roots = (length, amp) => seg(length, t => amp * Math.sin(t * PI2 * 12) + amp * 0.36 * Math.sin(t * PI2 * 3));
  const mound = (length, height) => seg(length, t => height * Math.sin(Math.PI * t));
  const gap = (label, height, gapLen, signature = false) => {
    const at = x + 32;
    marks.push({ x: at, kind: 'gap', label, signature });
    seg(92, t => height * smooth(t));
    seg(34, t => height * (1 - smooth(t)) * 0.10);
    seg(gapLen, t => -2.0 - 0.25 * Math.sin(t * PI2));
    seg(112, t => -2.0 + (height * 0.74 + 2.0) * smooth(t));
    seg(110, t => height * 0.74 * (1 - smooth(t)));
    pickups.push({ x: at + gapLen * 0.33 + 90, type: 'boost', taken: false });
    pickups.push({ x: at + gapLen + 124, type: 'repair', taken: false });
    if (signature) {
      marks[marks.length - 1].kind = 'signature';
      marks[marks.length - 1].label = 'SIGNATURE GAP';
    }
    return at;
  };
  const settle = () => seg(92, t => -base * 0.12 * smooth(t));

  flat(160);
  if (familyId === 'stadium') {
    marks.push({ x: x + 20, kind: 'rhythm', label: 'WHOOPS' });
    whoops(310 + eventIndex * 8, 0.24 + eventIndex * 0.018);
    rollers(270, 0.36, 2);
    flat(110);
    gap('TRIPLE STEP', 1.3 + eventIndex * 0.04, 116 + trackIndex * 12, true);
    whoops(230, 0.18);
    shortcut.start = x + 40; shortcut.end = shortcut.start + 190;
    marks.push({ x: shortcut.start, kind: 'shortcut', label: shortcut.label });
    mound(190, 0.62);
    pickups.push({ x: shortcut.start + 84, type: 'time', taken: false, yOffset: 0.9 });
    rollers(260, 0.28, 3);
    flat(70);
    gap('WALL JUMP', 1.08, 96, false);
    settle();
  } else if (familyId === 'dunes') {
    rollers(300, 0.66, 2);
    mound(180, 0.95);
    gap('DUNE CREST', 1.45 + eventIndex * 0.06, 150 + trackIndex * 18, true);
    rollers(230, 0.82, 1);
    shortcut.start = x + 35; shortcut.end = shortcut.start + 220;
    marks.push({ x: shortcut.start, kind: 'shortcut', label: shortcut.label });
    mound(220, 1.18);
    pickups.push({ x: shortcut.start + 100, type: 'boost', taken: false, yOffset: 1.1 });
    gap('SAND CUT', 1.22, 120, false);
    rollers(290, 0.72, 2);
    settle();
  } else if (familyId === 'forest') {
    roots(280, 0.15 + eventIndex * 0.012);
    whoops(220, 0.25);
    flat(80);
    gap('CREEK DROP', 1.08 + eventIndex * 0.04, 112 + trackIndex * 14, true);
    roots(300, 0.18);
    shortcut.start = x + 25; shortcut.end = shortcut.start + 208;
    marks.push({ x: shortcut.start, kind: 'shortcut', label: shortcut.label });
    mound(208, 0.72);
    pickups.push({ x: shortcut.start + 104, type: 'time', taken: false, yOffset: 1.0 });
    whoops(240, 0.34);
    gap('ROOT BRIDGE', 0.88, 84, false);
    roots(260, 0.13);
    settle();
  } else {
    flat(120);
    mound(130, 0.78);
    marks.push({ x, kind: 'ledge', label: 'LEDGE RUN' });
    seg(230, t => 0.78 - 0.55 * smooth(t));
    gap('LONG DROP', 1.85 + eventIndex * 0.07, 176 + trackIndex * 22, true);
    seg(120, t => -0.18 * smooth(t));
    shortcut.start = x + 18; shortcut.end = shortcut.start + 216;
    marks.push({ x: shortcut.start, kind: 'shortcut', label: shortcut.label });
    seg(216, t => 0.72 * Math.sin(Math.PI * t));
    pickups.push({ x: shortcut.start + 104, type: 'boost', taken: false, yOffset: 1.15 });
    rollers(240, 0.42, 2);
    gap('STONE LIP', 1.25, 124, false);
    settle();
  }

  flat(130);
  const finishX = x + 140;
  flat(220);
  const len = x;
  const heights = h;
  const heightAt = wx => {
    const f = clamp(wx / DX, 0, heights.length - 1);
    const i = Math.floor(f), u = f - i;
    return heights[i] + (heights[Math.min(i + 1, heights.length - 1)] - heights[i]) * u;
  };
  const slopeAt = wx => Math.atan2(heightAt(wx + 8) - heightAt(wx - 8), 16);
  for (const p of pickups) {
    if (p.yOffset == null) p.yOffset = p.type === 'time' ? 0.76 : 0.58;
  }
  // Generous route-neutral drops. A player who misses the shortcut still sees
  // a boost, a time flag and a repair pad before the finish.
  pickups.push({ x: Math.round(len * 0.28), type: 'time', taken: false, yOffset: 0.72 });
  pickups.push({ x: Math.round(len * 0.52), type: 'boost', taken: false, yOffset: 0.62 });
  pickups.push({ x: Math.round(len * 0.75), type: 'repair', taken: false, yOffset: 0.52 });
  pickups.sort((a, b) => a.x - b.x);
  const signature = marks.find(m => m.signature) || marks.find(m => m.kind === 'gap') || { x: len * 0.55, label: 'GAP' };
  return {
    familyId, family, seed, eventIndex, trackIndex, DX, heights, len, finishX,
    marks, pickups, shortcut, signature,
    // Par is calibrated to the measured 18 to 19 m/s bike pace, with a small
    // late-cup pressure increase. It is a reachable target, not a showroom
    // speed assumption.
    par: (len - 42) / (18.2 + eventIndex * 0.25) + 14,
    heightAt, slopeAt,
    pickupY(p) { return heightAt(p.x) + (p.yOffset || 0.65); },
  };
}

export function makeBigAir(seed = 0xB16A) {
  const tr = makeTrack('quarry', seed, 7, 2);
  tr.signature = { x: tr.signature.x, label: 'BIG AIR LIP' };
  tr.marks = tr.marks.map(m => m.signature ? { ...m, label: 'BIG AIR LIP' } : m);
  tr.bigAir = true;
  return tr;
}

export function familyForEvent(eventIndex, trackIndex) {
  const event = EVENTS[eventIndex] || EVENTS[0];
  const order = ['stadium', 'dunes', 'forest', 'quarry'];
  // The first track is the event identity. Tracks two and three widen the
  // rhythm without losing the family read.
  return order[(order.indexOf(event.family) + trackIndex) % order.length] || event.family;
}
