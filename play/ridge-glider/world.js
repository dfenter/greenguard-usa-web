/* Ridge Glider / authored ridgelines and deterministic flight field. */

const TAU = Math.PI * 2;

function hash01(index, seed) {
  let h = Math.imul((index | 0) ^ (seed | 0), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothNoise(x, seed, octave) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash01(i + octave * 101, seed + octave * 7919);
  const b = hash01(i + 1 + octave * 101, seed + octave * 7919);
  return a + (b - a) * u;
}

export const RIDGES = [
  {
    id: 'coastal-cliff', name: 'COASTAL CLIFF LINE', short: 'Saltwind / Arch',
    flow: 'Long faces and clean sea thermals', length: 7600, wind: 7.8, gust: 0.18,
    sky: ['#5a9fbd', '#d6e9dc', '#f4c99c'], terrain: ['#456c62', '#152b2e'],
    thermalColor: 0xffd681, landmark: { kind: 'arch', x: 2180, label: 'SEA ARCH' },
    thermals: [
      { x: 480, width: 110, top: 700, strength: 3.8 }, { x: 920, width: 130, top: 820, strength: 4.8 },
      { x: 1510, width: 120, top: 960, strength: 5.3 }, { x: 2050, width: 145, top: 1020, strength: 5.6 },
      { x: 2730, width: 125, top: 900, strength: 4.7 }, { x: 3480, width: 150, top: 1100, strength: 5.6 },
      { x: 4320, width: 130, top: 1000, strength: 5.2 }, { x: 5300, width: 155, top: 1180, strength: 5.8 },
      { x: 6440, width: 125, top: 950, strength: 4.9 }
    ],
    lzs: [1560, 3280, 4920, 6860], flags: [620, 1180, 1940, 2520, 3150, 3920, 4680, 5480, 6200, 7040],
    shortcut: { start: 2350, end: 2980, floor: 410, label: 'ARCH AIR CORRIDOR', bonus: 480 }
  },
  {
    id: 'alpine-spine', name: 'ALPINE SPINE', short: 'Icefall / Glacier',
    flow: 'High shelves, hard faces, generous cores', length: 8200, wind: 6.6, gust: 0.24,
    sky: ['#315a88', '#9bc7e2', '#f2eee3'], terrain: ['#607f91', '#1d2c3c'],
    thermalColor: 0x8fe5ff, landmark: { kind: 'glacier', x: 3660, label: 'BLUE GLACIER' },
    thermals: [
      { x: 520, width: 125, top: 900, strength: 4.5 }, { x: 1120, width: 150, top: 1040, strength: 5.4 },
      { x: 1740, width: 140, top: 1120, strength: 5.1 }, { x: 2440, width: 155, top: 1300, strength: 6.0 },
      { x: 3140, width: 125, top: 1180, strength: 5.0 }, { x: 3970, width: 170, top: 1420, strength: 6.2 },
      { x: 4810, width: 145, top: 1260, strength: 5.7 }, { x: 5760, width: 165, top: 1450, strength: 6.0 },
      { x: 6860, width: 150, top: 1320, strength: 5.4 }, { x: 7580, width: 140, top: 1190, strength: 4.9 }
    ],
    lzs: [1840, 3600, 5440, 7440], flags: [680, 1340, 2080, 2820, 3470, 4280, 5060, 5880, 6720, 7600],
    shortcut: { start: 4080, end: 4790, floor: 570, label: 'GLACIER HIGH LINE', bonus: 620 }
  },
  {
    id: 'desert-mesa', name: 'DESERT MESA CHAIN', short: 'Redrock / Switchback',
    flow: 'Step-up ridges and punchy afternoon lift', length: 7900, wind: 8.5, gust: 0.34,
    sky: ['#bd6e4d', '#f2b56d', '#ffe5ac'], terrain: ['#946041', '#321e25'],
    thermalColor: 0xffa75d, landmark: { kind: 'mesa', x: 2920, label: 'TWIN MESA GATE' },
    thermals: [
      { x: 430, width: 140, top: 820, strength: 4.0 }, { x: 980, width: 125, top: 980, strength: 4.6 },
      { x: 1620, width: 155, top: 1100, strength: 5.5 }, { x: 2260, width: 135, top: 1000, strength: 4.9 },
      { x: 3040, width: 180, top: 1240, strength: 6.0 }, { x: 3890, width: 145, top: 1150, strength: 5.3 },
      { x: 4720, width: 165, top: 1300, strength: 5.9 }, { x: 5740, width: 145, top: 1180, strength: 5.2 },
      { x: 6680, width: 170, top: 1360, strength: 6.0 }, { x: 7380, width: 150, top: 1100, strength: 4.9 }
    ],
    lzs: [1460, 3320, 5080, 7040], flags: [540, 1210, 1880, 2580, 3220, 4060, 4880, 5660, 6500, 7290],
    shortcut: { start: 3140, end: 3820, floor: 430, label: 'MESA SLOT', bonus: 540 }
  },
  {
    id: 'sunset-valley', name: 'SUNSET VALLEY RUN', short: 'Goldwater / Falls',
    flow: 'Valley crossings with a waterfall reveal', length: 8500, wind: 6.9, gust: 0.42,
    sky: ['#563b73', '#d66d6c', '#ffd183'], terrain: ['#735052', '#211b2d'],
    thermalColor: 0xffe08c, landmark: { kind: 'waterfall', x: 4440, label: 'SUNSET FALLS' },
    thermals: [
      { x: 560, width: 135, top: 760, strength: 4.1 }, { x: 1260, width: 150, top: 930, strength: 4.9 },
      { x: 1980, width: 150, top: 1050, strength: 5.1 }, { x: 2720, width: 170, top: 1120, strength: 5.7 },
      { x: 3540, width: 140, top: 980, strength: 4.8 }, { x: 4320, width: 180, top: 1260, strength: 6.1 },
      { x: 5160, width: 150, top: 1140, strength: 5.4 }, { x: 6060, width: 175, top: 1340, strength: 5.9 },
      { x: 7120, width: 155, top: 1190, strength: 5.5 }, { x: 7960, width: 140, top: 1020, strength: 5.0 }
    ],
    lzs: [1700, 3500, 5400, 7900], flags: [650, 1400, 2180, 2920, 3650, 4460, 5220, 6120, 7000, 8150],
    shortcut: { start: 4580, end: 5350, floor: 470, label: 'FALLS VALLEY CUT', bonus: 700 }
  }
];

export class RidgeWorld {
  constructor(ridgeIndex, seed) {
    const safeIndex = Number.isInteger(ridgeIndex) && RIDGES[ridgeIndex] ? ridgeIndex : 0;
    this.ridgeIndex = safeIndex;
    this.ridge = RIDGES[safeIndex] || RIDGES[0];
    this.seed = (seed >>> 0) || 1;
    this.thermals = this.ridge.thermals.map((source, index) => ({
      ...source,
      x: source.x + (hash01(index + 17, this.seed) - 0.5) * 54,
      phase: hash01(index + 91, this.seed) * TAU,
      base: 0,
      top: source.top
    }));
    for (const thermal of this.thermals) thermal.base = this.terrain(thermal.x) + 18;
    this.flags = this.ridge.flags.map((x, index) => ({ x: x + (hash01(index + 51, this.seed) - 0.5) * 34, collected: false }));
    this.traffic = Array.from({ length: 6 }, (_, index) => ({
      x: 1120 + index * 1160 + (hash01(index + 131, this.seed) - 0.5) * 180,
      height: 175 + hash01(index + 151, this.seed) * 135,
      amplitude: 150 + hash01(index + 171, this.seed) * 90,
      speed: .55 + hash01(index + 191, this.seed) * .4,
      phase: hash01(index + 211, this.seed) * TAU,
      hit: false
    })).filter((hazard) => hazard.x < this.ridge.length - 240);
    this.introLift = true;
    this.forceRidge = false;
    this.forceThermal = false;
    this.liftScratch = { total: 0, thermal: 0, ridge: 0, inThermal: false, thermalIndex: -1 };
  }

  noise(x, octave) { return smoothNoise(x, this.seed, octave); }

  terrain(x) {
    const key = this.ridge.id;
    const broad = this.noise(x / 520, 1);
    const detail = this.noise(x / 155, 2);
    if (key === 'coastal-cliff') {
      const shelf = 72 + 54 * Math.sin(x / 640) + 92 * Math.max(0, Math.sin(x / 310 + 0.8));
      return Math.max(22, shelf + 92 * broad + 22 * detail);
    }
    if (key === 'alpine-spine') {
      const spine = 210 + 210 * Math.pow(Math.abs(Math.sin(x / 780 + 0.35)), 1.7);
      return Math.max(30, spine + 110 * broad + 32 * detail);
    }
    if (key === 'desert-mesa') {
      const mesa = Math.pow(Math.max(0, Math.sin(x / 410 + 0.4)), 14) * 240;
      const shelf = 80 + 80 * Math.max(0, Math.sin(x / 880 - 0.5));
      return Math.max(24, shelf + mesa + 100 * broad + 18 * detail);
    }
    const valley = 110 + 105 * Math.sin(x / 590 + 1.15) + 62 * Math.sin(x / 270 + 0.7);
    return Math.max(24, valley + 118 * broad + 28 * detail);
  }

  lateralTerrain(x, z) {
    const half = 510;
    const side = Math.min(1, Math.abs(z) / half);
    return Math.max(0, this.terrain(x) - side * (92 + 45 * this.noise(x / 300, 4)) - side * side * 110);
  }

  slope(x) { return (this.terrain(x + 4) - this.terrain(x - 4)) / 8; }

  windAt(x) {
    const band = Math.floor(Math.max(0, x) / 1000);
    const variance = this.ridge.gust * (1 + band * 0.20);
    return this.ridge.wind + (this.noise(x / 230, 8) - 0.5) * variance * 2;
  }

  nextLz(x) {
    for (let i = 0; i < this.ridge.lzs.length; i++) if (this.ridge.lzs[i] > x + 24) return this.ridge.lzs[i];
    return this.ridge.length;
  }

  lzAt(x) {
    let nearest = null;
    let distance = Infinity;
    for (const lzX of this.ridge.lzs) {
      const d = Math.abs(x - lzX);
      if (d < distance) { distance = d; nearest = lzX; }
    }
    if (nearest == null || distance > 125) return null;
    return { x: nearest, dx: x - nearest, half: 125, y: this.terrain(nearest) };
  }

  thermalLift(x, y) {
    let total = 0;
    let active = -1;
    for (let i = 0; i < this.thermals.length; i++) {
      const thermal = this.thermals[i];
      const dx = Math.abs(x - thermal.x);
      if (dx > thermal.width * 1.75 || y < thermal.base || y > thermal.top) continue;
      const agl = y - thermal.base;
      const vertical = Math.min(1, agl / 70) * Math.min(1, (thermal.top - y) / 170);
      const radial = Math.max(0, 1 - (dx / thermal.width) ** 2);
      total += thermal.strength * radial * vertical;
      if (radial > 0.18 && vertical > 0.08) active = i;
    }
    if (this.forceThermal) {
      const floor = this.terrain(x) + 20;
      const agl = y - floor;
      if (agl > 18 && agl < 620) { total += 5.4 * Math.min(1, agl / 55) * Math.min(1, (620 - agl) / 180); active = 0; }
    }
    if (this.introLift && x < 760) {
      const dx = Math.abs(x - 420);
      const floor = this.terrain(x) + 24;
      const agl = y - floor;
      if (dx < 260 && agl > 20 && agl < 480) {
        total += 2.4 * Math.max(0, 1 - (dx / 260) ** 2) * Math.min(1, agl / 70) * Math.min(1, (480 - agl) / 150);
        if (active < 0 && agl > 45) active = 0;
      }
    }
    return { total, active };
  }

  ridgeLift(x, y) {
    const agl = y - this.terrain(x);
    const slope = this.slope(x);
    if (agl < 0 || agl > 310) return 0;
    if (this.forceRidge) return 3.8 * Math.max(0, 1 - agl / 310);
    if (slope < 0.08) return 0;
    const envelope = Math.max(0, 1 - agl / (72 + Math.min(1, slope) * 220));
    return this.ridge.wind * Math.min(0.62, (slope - 0.08) * 1.45) * envelope * envelope * 1.4;
  }

  lift(x, y) {
    const thermal = this.thermalLift(x, y);
    const ridge = this.ridgeLift(x, y);
    const total = -0.72 + thermal.total + ridge;
    this.liftScratch.total = total;
    this.liftScratch.thermal = thermal.total;
    this.liftScratch.ridge = ridge;
    this.liftScratch.inThermal = thermal.active >= 0;
    this.liftScratch.thermalIndex = thermal.active;
    return this.liftScratch;
  }

  inShortcut(x, y) {
    const corridor = this.ridge.shortcut;
    return x >= corridor.start && x <= corridor.end && y - this.terrain(x) >= corridor.floor;
  }
}

export { hash01 };
