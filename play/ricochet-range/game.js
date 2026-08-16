/* Ricochet Range
 * Phaser 3 landscape physics minigolf. GGKit owns lifecycle, input identity,
 * saves, settings and audio buses. The simulation is fixed step and every
 * visual effect is procedural, pooled, and renderer-independent.
 */
(() => {
  'use strict';

  const GAME_W = 1280;
  const GAME_H = 720;
  const STEP = 1 / 60;
  const MAX_STEPS = 5;
  const STROKE_CAP = 12;
  const TAU = Math.PI * 2;
  const BOARD = { left: 44, top: 108, right: 1236, bottom: 664 };
  const PLAY = { left: 70, top: 132, right: 1210, bottom: 642 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hypot = (x, y) => Math.sqrt(x * x + y * y);
  const distance = (a, b) => hypot(a.x - b.x, a.y - b.y);
  const unit = (x, y) => {
    const len = hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmtDelta = (n) => n === 0 ? 'E' : (n > 0 ? `+${n}` : `${n}`);
  const safeText = (value, fallback) => typeof value === 'string' && value ? value : fallback;

  const PAL = {
    ink: 0xeafff7, muted: 0x8eaea9, board: 0x0b252b, deep: 0x071116,
    mint: 0x8cf4d1, cyan: 0x64ddea, yellow: 0xffd978, coral: 0xff897c,
    violet: 0xc1a1ff, sand: 0xd89b61, ice: 0x8ce8f5, water: 0x3fb7dc,
    grass: 0x6ad3a5, clock: 0xf0aa65
  };
  // Authored per-area identity. sky/far/mid/near drive the baked parallax
  // scenery bands; dust is the surface particle tint for roll and landings.
  const STYLES = {
    garden: {
      base: 0x123e35, floor: 0x164d3e, line: 0x9af5c0, accent: 0xffd978, surface: 0x6fdc9b, water: 0x47c4d4,
      sky: ['#071a18', '#0f3b34', '#1b5c48'], far: '#0d3a33', mid: '#14513f', near: '#1d6b4c',
      dust: 0x9be6b4, scenery: 'trees', glow: '#7ef0bd'
    },
    ice: {
      base: 0x102f43, floor: 0x174a60, line: 0x98efff, accent: 0xc9f7ff, surface: 0x95eaff, water: 0x4dbce7,
      sky: ['#050f1c', '#0d2c44', '#17506d'], far: '#123c56', mid: '#17506d', near: '#1f6c86',
      dust: 0xc7f2ff, scenery: 'peaks', glow: '#9fe8ff'
    },
    desert: {
      base: 0x4b2b29, floor: 0x704333, line: 0xffc279, accent: 0xffedaa, surface: 0xe0a064, water: 0x68c2cf,
      sky: ['#1b0f14', '#4a2422', '#8a4a30'], far: '#5a2f28', mid: '#7a4231', near: '#9c5a3a',
      dust: 0xf3c78e, scenery: 'dunes', glow: '#ffc98a'
    },
    clockwork: {
      base: 0x302435, floor: 0x493048, line: 0xffc676, accent: 0xffe0a1, surface: 0xffa96c, water: 0x61cad2,
      sky: ['#120c18', '#2c2036', '#4a3350'], far: '#2a1f36', mid: '#3d2b46', near: '#553a58',
      dust: 0xffcf9a, scenery: 'gears', glow: '#ffbe7a'
    },
    championship: {
      base: 0x172b37, floor: 0x234355, line: 0xf9d47d, accent: 0x9ff7de, surface: 0xc5a4ff, water: 0x55d4dd,
      sky: ['#050d14', '#132734', '#254556'], far: '#16303e', mid: '#204355', near: '#2c5a6d',
      dust: 0xd8c9ff, scenery: 'banners', glow: '#a8f2dd'
    }
  };

  class RNG {
    constructor(seed) { this.s = (seed >>> 0) || 1; }
    next() {
      this.s = (this.s + 0x6D2B79F5) | 0;
      let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return Math.floor(this.range(a, b + 1)); }
    pick(list, fallback) { return list.length ? list[Math.floor(this.next() * list.length)] : fallback; }
  }

  const PARS = [3, 4, 3, 4, 5, 4, 3, 4, 5, 4, 3, 4, 5, 4, 3, 5, 4, 6];
  const familyRows = [
    {
      id: 'garden-green', name: 'GARDEN GREEN', short: 'ARBOR CIRCUIT', style: 'garden', seed: 0x4A17C,
      signature: 8,
      names: ['Seedling Bend', 'Mossy Split', 'Pondside Rail', 'Rose Trellis', 'Lantern Lawn', 'Hedge Echo', 'Dewdrop Drop', 'Orchard Switch', 'Arbor Spiral', 'Fern Fork', 'Willow Bank', 'Bee Line', 'Glasshouse Gate', 'Ivy Clock', 'Pollen Pocket', 'Canopy Run', 'Rootbound', 'The Old Oak'],
      routes: ['zig', 'split', 'funnel', 'cross', 'pinball', 'zig'],
      gimmicks: ['dew_gate', 'water_reset', 'petal_boost', 'whirlpool', 'sand_drift', 'echo_gate', 'water_reset', 'petal_boost', 'arboretum', 'whirlpool', 'dew_gate', 'water_reset', 'echo_gate', 'petal_boost', 'whirlpool', 'dew_gate', 'water_reset', 'old_oak']
    },
    {
      id: 'frostline-cavern', name: 'FROSTLINE CAVERN', short: 'BLUE ECHO', style: 'ice', seed: 0x7C2E1,
      signature: 8,
      names: ['Cold Open', 'Glacier Fold', 'Drift Gate', 'Blue Shelf', 'Hollow Slide', 'Icicle Alley', 'Frost Fan', 'Mirror Mouth', 'Blue Echo', 'Rime Ladder', 'Crystal Pocket', 'Snowblind', 'Frozen Relay', 'Chime Bank', 'Avalanche Cut', 'Whiteout Loop', 'Permafrost', 'The Deep Freeze'],
      routes: ['funnel', 'zig', 'split', 'pinball', 'cross', 'orbit'],
      gimmicks: ['ice_slide', 'echo_gate', 'frost_fan', 'crystal_bank', 'ice_slide', 'water_reset', 'frost_fan', 'echo_gate', 'blue_echo', 'ice_slide', 'crystal_bank', 'frost_fan', 'echo_gate', 'ice_slide', 'water_reset', 'blue_echo', 'crystal_bank', 'deep_freeze']
    },
    {
      id: 'duneveil-desert', name: 'DUNEVEIL DESERT', short: 'SANDGLASS RUN', style: 'desert', seed: 0xD19E4,
      signature: 8,
      names: ['Warm Start', 'Dust Split', 'Canyon Rail', 'Sunken Marker', 'Mirage Mouth', 'Dune Switch', 'Oasis Tap', 'Sirocco Gate', 'Sandglass', 'Red Ridge', 'Heat Haze', 'Dry Creek', 'Copper Dunes', 'Long Shadow', 'Quicksand Key', 'Mesa Pinball', 'Dust Devil', 'The Last Dune'],
      routes: ['zig', 'cross', 'funnel', 'split', 'orbit', 'pinball'],
      gimmicks: ['sand_drift', 'dune_boost', 'mirage_gate', 'quicksand', 'water_reset', 'sand_drift', 'dune_boost', 'mirage_gate', 'sandglass', 'quicksand', 'dune_boost', 'sand_drift', 'mirage_gate', 'quicksand', 'sandglass', 'dune_boost', 'mirage_gate', 'last_dune']
    },
    {
      id: 'clockwork-yard', name: 'CLOCKWORK YARD', short: 'RATCHET WORKS', style: 'clockwork', seed: 0xC10C7,
      signature: 8,
      names: ['Windup', 'Pinion Pair', 'Pendulum', 'Cog Split', 'Springboard', 'Minute Hand', 'Ratchet Alley', 'Gearshift', 'Clockwork Heart', 'Second Hand', 'Escapement', 'Copper Loop', 'Bellows', 'Gear Maze', 'Late Tick', 'Winding Road', 'Overcrank', 'The Final Tick'],
      routes: ['pinball', 'split', 'orbit', 'cross', 'zig', 'funnel'],
      gimmicks: ['gear_gate', 'ratchet', 'clockhand', 'conveyor', 'gear_gate', 'spring_boost', 'ratchet', 'clockhand', 'minute_hand', 'conveyor', 'gear_gate', 'ratchet', 'clockhand', 'conveyor', 'gear_gate', 'spring_boost', 'minute_hand', 'final_tick']
    },
    {
      id: 'championship-crown', name: 'CHAMPIONSHIP CROWN', short: 'THE CROWN', style: 'championship', seed: 0xF1A1,
      signature: 8,
      names: ['Crown Gate', 'Tidal Gear', 'Ice and Ember', 'Crossed Wires', 'Dune Orchard', 'Triple Timing', 'Magnet Mile', 'The Lock', 'Crownfall', 'Four Corners', 'Frosted Clock', 'Waterwheel', 'The Needle', 'Hedge of Glass', 'Long Bank', 'Final Combo', 'Last Pocket', 'The Champion'],
      routes: ['cross', 'orbit', 'split', 'zig', 'pinball', 'funnel'],
      gimmicks: ['champ_gate', 'champ_combo', 'champ_combo', 'champ_gate', 'champ_combo', 'champ_timing', 'champ_combo', 'champ_gate', 'crownfall', 'champ_combo', 'champ_timing', 'champ_combo', 'champ_gate', 'champ_combo', 'champ_timing', 'champ_combo', 'champ_gate', 'champion']
    }
  ];
  const COURSE_FAMILIES = familyRows.map((row, index) => ({ ...row, index, holes: row.names.map((name, i) => ({
    name, par: PARS[i], route: row.routes[i % row.routes.length], gimmick: row.gimmicks[i] || 'gate', cluster: Math.floor(i / 3), signature: i === row.signature
  })) }));
  const FAMILY_BY_ID = Object.create(null);
  COURSE_FAMILIES.forEach((family) => { FAMILY_BY_ID[family.id] = family; });
  const FALLBACK_FAMILY = COURSE_FAMILIES[0];
  const MODE_NAMES = { tour: 'TOUR', seeded: 'SEEDED', trick: 'TRICK SHOT', championship: 'CHAMPIONSHIP' };
  const SAVE_MODES = ['tour', 'seeded', 'trick', 'championship'];
  const GIMMICK_NAMES = {
    dew_gate: 'DEW GATE', water_reset: 'WATER RESET', petal_boost: 'PETAL BOOST', whirlpool: 'WHIRLPOOL',
    sand_drift: 'SAND DRIFT', echo_gate: 'ECHO GATE', arboretum: 'ARBORETUM', old_oak: 'OLD OAK',
    ice_slide: 'ICE SLIDE', frost_fan: 'FROST FAN', crystal_bank: 'CRYSTAL BANK', blue_echo: 'BLUE ECHO', deep_freeze: 'DEEP FREEZE',
    dune_boost: 'DUNE BOOST', mirage_gate: 'MIRAGE GATE', quicksand: 'QUICKSAND', sandglass: 'SANDGLASS', last_dune: 'LAST DUNE',
    gear_gate: 'GEAR GATE', ratchet: 'RATCHET', clockhand: 'CLOCK HAND', conveyor: 'CONVEYOR', spring_boost: 'SPRING BOOST', minute_hand: 'MINUTE HAND', final_tick: 'FINAL TICK',
    champ_gate: 'CROWN GATE', champ_combo: 'TRIPLE COMBO', champ_timing: 'TIMING STACK', crownfall: 'CROWNFALL', champion: 'THE CHAMPION'
  };
  const GIMMICK_REGISTRY = Object.freeze({
    dew_gate: { effect: 'gate', visual: 'gate', preview: 'gate' },
    water_reset: { effect: 'water', visual: 'water', preview: 'water' },
    petal_boost: { effect: 'boost', visual: 'boost', preview: 'boost' },
    whirlpool: { effect: 'pull', visual: 'vortex', preview: 'pull' },
    sand_drift: { effect: 'drift', visual: 'sand', preview: 'drift' },
    echo_gate: { effect: 'echo', visual: 'echo', preview: 'echo' },
    arboretum: { effect: 'pull', visual: 'oak', preview: 'pull' },
    old_oak: { effect: 'oak', visual: 'oak', preview: 'oak' },
    ice_slide: { effect: 'ice', visual: 'ice', preview: 'ice' },
    frost_fan: { effect: 'wind', visual: 'wind', preview: 'wind' },
    crystal_bank: { effect: 'bank', visual: 'crystal', preview: 'bank' },
    blue_echo: { effect: 'echo', visual: 'echo', preview: 'echo' },
    deep_freeze: { effect: 'freeze', visual: 'freeze', preview: 'freeze' },
    dune_boost: { effect: 'boost', visual: 'boost', preview: 'boost' },
    mirage_gate: { effect: 'mirage', visual: 'mirage', preview: 'mirage' },
    quicksand: { effect: 'quicksand', visual: 'quicksand', preview: 'quicksand' },
    sandglass: { effect: 'wind', visual: 'sandglass', preview: 'wind' },
    last_dune: { effect: 'drift', visual: 'sandglass', preview: 'drift' },
    gear_gate: { effect: 'gate', visual: 'gear', preview: 'gate' },
    ratchet: { effect: 'ratchet', visual: 'ratchet', preview: 'ratchet' },
    clockhand: { effect: 'swirl', visual: 'clock', preview: 'swirl' },
    conveyor: { effect: 'swirl', visual: 'conveyor', preview: 'swirl' },
    spring_boost: { effect: 'boost', visual: 'spring', preview: 'boost' },
    minute_hand: { effect: 'swirl', visual: 'clock', preview: 'swirl' },
    final_tick: { effect: 'swirl', visual: 'clock', preview: 'swirl' },
    champ_gate: { effect: 'gate', visual: 'crown', preview: 'gate' },
    champ_combo: { effect: 'combo', visual: 'combo', preview: 'combo' },
    champ_timing: { effect: 'wind', visual: 'timing', preview: 'wind' },
    crownfall: { effect: 'pull', visual: 'crown', preview: 'pull' },
    champion: { effect: 'champion', visual: 'champion', preview: 'champion' }
  });
  const validateGimmickRegistry = () => {
    const used = new Set();
    COURSE_FAMILIES.forEach((family) => family.holes.forEach((hole) => used.add(hole.gimmick)));
    for (const key of used) {
      const entry = GIMMICK_REGISTRY[key];
      if (!entry || !entry.effect || !entry.visual || !entry.preview) throw new Error(`Missing gimmick coverage: ${key}`);
    }
    return true;
  };
  validateGimmickRegistry();
  const getGimmickName = (key) => safeText(GIMMICK_NAMES[key], 'BANK GATE');
  const getFamily = (value) => {
    if (value === 'championship' || value === 'crown') return COURSE_FAMILIES[4] || FALLBACK_FAMILY;
    if (typeof value === 'string' && FAMILY_BY_ID[value]) return FAMILY_BY_ID[value];
    const index = Number.isFinite(Number(value)) ? clamp(Math.floor(Number(value)), 0, COURSE_FAMILIES.length - 1) : 0;
    return COURSE_FAMILIES[index] || FALLBACK_FAMILY;
  };

  const RR_STATE = {
    mode: 'tour', course: FALLBACK_FAMILY.id, courseIndex: 0, hole: 1, strokes: 0, par: PARS[0],
    courseTotal: 0, coursePar: PARS.reduce((sum, par) => sum + par, 0), signature: false,
    pickups: { power: 2, gimme: 1, forgive: 1 }, tutorial: 0
  };
  let requestedCourse = null;
  let requestedHole = null;
  let activeScene = null;
  const rrApi = { state: RR_STATE };
  Object.defineProperty(rrApi, 'forceCourse', {
    configurable: true,
    get: () => requestedCourse,
    set: (value) => { requestedCourse = value; if (activeScene) activeScene.applyForceSwitches(); }
  });
  Object.defineProperty(rrApi, 'forceHole', {
    configurable: true,
    get: () => requestedHole,
    set: (value) => { requestedHole = value; if (activeScene) activeScene.applyForceSwitches(); }
  });
  if (typeof window !== 'undefined') window.__rr = rrApi;

  const SAVE_VERSION = 2;
  const defaultCareer = () => ({
    holesPlayed: 0, aces: 0, eagles: 0, birdies: 0, pars: 0, waterHits: 0,
    chipSinks: 0, spinSinks: 0, portalsUsed: 0, rivalWins: 0, rivalLosses: 0, bestBank: 0
  });
  const defaultSave = () => ({
    version: SAVE_VERSION, tutorialSeen: false, unlocked: 1,
    medals: { 'garden-green': 0, 'frostline-cavern': 0, 'duneveil-desert': 0, 'clockwork-yard': 0, 'championship-crown': 0 },
    best: { tour: {}, seeded: {}, trick: {}, championship: {} },
    career: defaultCareer(), challenges: {}
  });
  const MAX_SAVED_STROKES = 18 * (Math.max(...PARS) + 6);
  const isCount = (n) => Number.isInteger(n) && n >= 0 && n <= 999999;
  function validSave(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (value.version !== SAVE_VERSION || typeof value.tutorialSeen !== 'boolean') return false;
    if (!Number.isInteger(value.unlocked) || value.unlocked < 1 || value.unlocked > 5) return false;
    if (!value.medals || typeof value.medals !== 'object' || Array.isArray(value.medals)) return false;
    const keys = Object.keys(value.medals);
    if (keys.length !== COURSE_FAMILIES.length || keys.some((key) => !FAMILY_BY_ID[key] || !Number.isInteger(value.medals[key]) || value.medals[key] < 0 || value.medals[key] > 3)) return false;
    if (!value.best || typeof value.best !== 'object' || Array.isArray(value.best)) return false;
    for (const mode of SAVE_MODES) {
      if (!value.best[mode] || typeof value.best[mode] !== 'object' || Array.isArray(value.best[mode])) return false;
      if (Object.keys(value.best[mode]).some((key) => !FAMILY_BY_ID[key] || !Number.isInteger(value.best[mode][key]) || value.best[mode][key] < 0 || value.best[mode][key] > MAX_SAVED_STROKES)) return false;
    }
    if (!value.career || typeof value.career !== 'object' || Array.isArray(value.career)) return false;
    const template = defaultCareer();
    if (Object.keys(template).some((key) => !isCount(value.career[key]))) return false;
    if (!value.challenges || typeof value.challenges !== 'object' || Array.isArray(value.challenges)) return false;
    if (Object.keys(value.challenges).some((key) => CHALLENGE_IDS.indexOf(key) < 0 || !Number.isInteger(value.challenges[key]) || value.challenges[key] < 0 || value.challenges[key] > 99)) return false;
    return true;
  }
  // Version 1 shape (shipped) -> version 2. Every new field defaults; a save
  // that still fails validation after migration degrades to a fresh profile
  // rather than throwing.
  function migrateSave(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultSave();
    if (raw.version === SAVE_VERSION) return validSave(raw) ? raw : defaultSave();
    const next = defaultSave();
    try {
      if (raw.version === 1) {
        next.tutorialSeen = raw.tutorialSeen === true;
        if (Number.isInteger(raw.unlocked)) next.unlocked = clamp(raw.unlocked, 1, 5);
        if (raw.medals && typeof raw.medals === 'object') {
          Object.keys(next.medals).forEach((key) => {
            const value = raw.medals[key];
            if (Number.isInteger(value)) next.medals[key] = clamp(value, 0, 3);
          });
        }
        if (raw.best && typeof raw.best === 'object') {
          ['tour', 'trick', 'championship'].forEach((mode) => {
            const table = raw.best[mode];
            if (!table || typeof table !== 'object') return;
            Object.keys(table).forEach((key) => {
              const value = table[key];
              if (FAMILY_BY_ID[key] && Number.isInteger(value) && value >= 0 && value <= MAX_SAVED_STROKES) next.best[mode][key] = value;
            });
          });
        }
      }
    } catch (e) { return defaultSave(); }
    return validSave(next) ? next : defaultSave();
  }

  let kit;
  // Original micro-tone, encoded as MP4/AAC so the title has a real GGKit
  // audio bus even when no external asset pack is installed.
  const RR_TONE = 'data:audio/mp4;base64,AAAAHGZ0eXBNNEEgAAACAE00QSBpc29taXNvMgAAAAhmcmVlAAACo21kYXTeAgBMYXZjNjIuMjguMTAxAAIwZ1rgrJRjCZrPmVN/P3l1d7iRIrJGIJ5Df3Fujt+7e3DiWOcpZdtrKPW3SPr3ivjXhuYtw8S37zVt1icLE0tphdThcz9d0FfTlhzhiUaxlPNJUrjqyZGyTN2Yd7dSyFeudx/7uVxeQ5a1DDptq/S7r8NV0Z2x8+5xu9qu81Rr5M6Jg7zVGvkzomDvNXOfhnVm9wavZbNLfpavZbNLfpavZbNLfpavZbNLfpavZdNLZpavZdRLZKlc91EtmkK+q6iWzSFfVdRLZpC3quols0gWR/WHScOf1h0g8+AMDz4B0nDnwDpOHPgHScOfAOk4c+AdIPPgDA8+AMDz4AwPPgDA8+IYHnwBgefAGB58QwPPiGB58QwPPiGB58QwPPiGB58QxGfEMRnxDEZ8QwPPiGB58QwPPiDA/KLM8xjLKLM8xjLKLM8xjLKLM8xjLKLM8xjLKLM8xjLKLM8xjLKFzzHgAQgzrIwqQyCi2n9qmZvrVSZESckIQgDVv+n/x6puL+969rZv8w/UebWjjL893k/+Mf+P7XJPiWdgYEBHwwFscWLDAl0ybFO2LUy6kp5U7kcTYWHFf93/11rarFrw9lxMaBZsqjg5GdUgMmyoNi1UgMmyoPu8nauPmxSvCQacZkrwkGnGZHwkFsZkfCQWxmR8JBbGZHwkFsZkfDAWxmR8JByN54cjeeHI3nhyN54cjeeHI3nhyN54cjeeHI3n0ZM2fRkbzw5G88ORvPDkbzw5G8+jJmz6MmbPoyZs+jJmz6MmbPDkbzw5G88OTNn0ZM2fRkzZ9GTNn0ZM2fRkzZ9GTNn0ZM2fRkzZ9GTNn0ZM2fRkzZ9GTNn0ZM2fRkzZ9GTNn0ZM2fRkzZ+AAAADA21vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAABQAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAItdHJhawAAAFx0a2hkAAAAAwAAAAAAAAAAAAAAAQAAAAAAAABQAAAAAAAAAAAAAAABAQAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAJGVkdHMAAAAcZWxzdAAAAAAAAAABAAAAUAAABAAAAQAAAAABpW1kaWEAAAAgbWRoZAAAAAAAAAAAAAAAAAAAH0AAAAaAVcQAAAAAAC1oZGxyAAAAAAAAAABzb3VuAAAAAAAAAAAAAAAAU291bmRIYW5kbGVyAAAAAVBtaW5mAAAAEHNtaGQAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAARRzdGJsAAAAanN0c2QAAAAAAAAAAQAAAFptcDRhAAAAAAAAAAEAAAAAAAAAAAABABAAAAAAH0AAAAAAADZlc2RzAAAAAAOAgIAlAAEABICAgBdAFQAAAAAAZDUAAGQ1BYCAgAUViFblAAaAgIABAgAAACBzdHRzAAAAAAAAAAIAAAABAAAEAAAAAAEAAAKAAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAACAAAAAQAAABxzdHNzAAAAAAAAAAAAAAACAAABcgAAASkAAAAUc3RjbwAAAAAAAAABAAAALAAAABpzZ3BkAQAAAHJvbGwAAAACAAAAAf//AAAAHHNiZ3AAAAAAcm9sbAAAAAEAAAACAAAAAQAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjIuMTIuMTAx';
  const RR_TONE_FIXED = RR_TONE.replace('ABxzdHNz', 'ABxzdHN6');
  const AUDIO = Object.freeze({
    'ambient-course': RR_TONE_FIXED,
    putt: RR_TONE_FIXED,
    impact: RR_TONE_FIXED,
    'gate-impact': RR_TONE_FIXED,
    boost: RR_TONE_FIXED,
    pickup: RR_TONE_FIXED,
    water: RR_TONE_FIXED,
    'course-clear': RR_TONE_FIXED
  });
  kit = GGKit.create({
    slug: 'ricochet-range',
    orientation: 'landscape',
    // The kit hands back the fallback when validation fails, so the gate has
    // to admit the legacy v1 shape too or migration would never see it.
    validateSave: (value) => validSave(value) || !!(value && typeof value === 'object' && !Array.isArray(value) && value.version === 1),
    onPause: () => { if (activeScene) activeScene.onKitPause(); },
    onResume: () => { if (activeScene) activeScene.onKitResume(); },
    onRestart: () => { if (activeScene) activeScene.restartFromKit(); }
  });
  kit.audio.register(AUDIO);
  kit.registerPWA();
  kit.loader.show('Ricochet Range');
  let progress = migrateSave(kit.save.get(defaultSave()));
  if (!validSave(progress)) progress = defaultSave();
  kit.save.set(progress);
  const bumpCareer = (key, amount) => {
    if (!progress.career || !isCount(progress.career[key])) return;
    progress.career[key] = clamp(progress.career[key] + (amount || 1), 0, 999999);
  };
  const cue = (name) => { if (kit && kit.audio) kit.audio.sfx(name); };
  const startAmbient = () => { if (kit && kit.audio) kit.audio.music('ambient-course', 500); };
  const motionEnabled = () => kit.juice.enabled !== false && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const juiceShake = (magnitude, milliseconds) => { if (motionEnabled()) kit.juice.shake(magnitude, milliseconds); };
  const juiceStop = (milliseconds) => { if (motionEnabled()) kit.juice.hitStop(milliseconds); };

  function addLine(list, x1, y1, x2, y2, kind = 'wall') { list.push({ x1, y1, x2, y2, kind }); }
  function addRect(list, x, y, w, h, kind = 'surface') { list.push({ x, y, w, h, kind, taken: false }); }
  function makeStart(index) {
    const starts = [
      { x: 132, y: 590 }, { x: 1125, y: 590 }, { x: 150, y: 190 },
      { x: 1120, y: 186 }, { x: 622, y: 602 }, { x: 650, y: 178 }
    ];
    return { ...(starts[index % starts.length] || starts[0]) };
  }
  function makeCup(index) {
    const cups = [
      { x: 1110, y: 178 }, { x: 165, y: 178 }, { x: 1110, y: 600 },
      { x: 170, y: 600 }, { x: 1080, y: 360 }, { x: 205, y: 360 }
    ];
    return { ...(cups[index % cups.length] || cups[0]), r: 21 };
  }
  function buildHole(family, spec, index, seed, mode) {
    const rng = new RNG((seed ^ ((index + 1) * 0x9E3779B9)) >>> 0);
    const difficulty = clamp(0.18 + index * 0.055 + family.index * 0.095 + (mode === 'championship' ? 0.3 : 0), 0.1, 1.65);
    const start = makeStart(index);
    const cup = makeCup(index);
    start.x = clamp(start.x + rng.range(-34, 34) + (index % 3) * 12, PLAY.left + 34, PLAY.right - 34);
    start.y = clamp(start.y + rng.range(-24, 24), PLAY.top + 34, PLAY.bottom - 34);
    cup.x = clamp(cup.x + rng.range(-42, 42) - (index % 4) * 9, PLAY.left + 34, PLAY.right - 34);
    cup.y = clamp(cup.y + rng.range(-28, 28) + (index % 2) * 11, PLAY.top + 34, PLAY.bottom - 34);
    const gimmickPoint = { x: 420 + rng.range(0, 440), y: 245 + rng.range(0, 230), r: 82 + difficulty * 12 };
    if (distance(start, gimmickPoint) < 150) gimmickPoint.x = 920;
    if (distance(cup, gimmickPoint) < 150) gimmickPoint.y = 235;
    const hole = {
      index, name: spec.name, par: mode === 'trick' ? Math.max(2, spec.par - 1) : (mode === 'championship' ? Math.min(7, spec.par + (index > 8 ? 1 : 0)) : spec.par),
      start, cup, route: spec.route, cluster: spec.cluster, signature: spec.signature,
      gimmick: spec.gimmick, gimmickPoint, shotCount: 0, difficulty, walls: [], gates: [], bumpers: [], sand: [], ice: [], water: [], boosts: [], pickups: [], altWaypoints: [], stars: [],
      movers: [], portals: [], authored: false, layout: spec.route,
      seed: (seed + index * 9176) >>> 0
    };
    addLine(hole.walls, PLAY.left, PLAY.top, PLAY.right, PLAY.top, 'rail');
    addLine(hole.walls, PLAY.right, PLAY.top, PLAY.right, PLAY.bottom, 'rail');
    addLine(hole.walls, PLAY.right, PLAY.bottom, PLAY.left, PLAY.bottom, 'rail');
    addLine(hole.walls, PLAY.left, PLAY.bottom, PLAY.left, PLAY.top, 'rail');

    const sway = rng.range(-28, 28);
    const row = (index % 4);
    if (spec.route === 'zig') {
      const y1 = 262 + row * 32, y2 = 430 - row * 22;
      addLine(hole.walls, 130, y1, 470 + sway, y1 + 18, 'wall');
      addLine(hole.walls, 790 - sway, y1 + 18, 1150, y1, 'wall');
      addLine(hole.walls, 130, y2, 420 + sway, y2 - 16, 'wall');
      addLine(hole.walls, 810 - sway, y2 - 16, 1150, y2, 'wall');
    } else if (spec.route === 'split') {
      addLine(hole.walls, 220, 250, 510 + sway, 330, 'wall');
      addLine(hole.walls, 770 - sway, 330, 1060, 250, 'wall');
      addLine(hole.walls, 220, 470, 510 + sway, 390, 'wall');
      addLine(hole.walls, 770 - sway, 390, 1060, 470, 'wall');
    } else if (spec.route === 'funnel') {
      addLine(hole.walls, 150, 218, 560 + sway, 338, 'wall');
      addLine(hole.walls, 1130, 218, 720 - sway, 338, 'wall');
      addLine(hole.walls, 150, 502, 560 + sway, 382, 'wall');
      addLine(hole.walls, 1130, 502, 720 - sway, 382, 'wall');
    } else if (spec.route === 'cross') {
      addLine(hole.walls, 270, 226, 510, 354, 'wall');
      addLine(hole.walls, 770, 354, 1010, 226, 'wall');
      addLine(hole.walls, 270, 494, 510, 366, 'wall');
      addLine(hole.walls, 770, 366, 1010, 494, 'wall');
      addLine(hole.walls, 640, 205, 640, 292, 'wall');
      addLine(hole.walls, 640, 428, 640, 515, 'wall');
    } else if (spec.route === 'orbit') {
      addLine(hole.walls, 300, 214, 520, 280, 'wall');
      addLine(hole.walls, 760, 280, 980, 214, 'wall');
      addLine(hole.walls, 300, 506, 520, 440, 'wall');
      addLine(hole.walls, 760, 440, 980, 506, 'wall');
      addLine(hole.walls, 500, 280, 560, 230, 'wall');
      addLine(hole.walls, 720, 230, 780, 280, 'wall');
    } else {
      addLine(hole.walls, 250, 250, 490, 250, 'wall');
      addLine(hole.walls, 790, 250, 1030, 250, 'wall');
      addLine(hole.walls, 250, 470, 490, 470, 'wall');
      addLine(hole.walls, 790, 470, 1030, 470, 'wall');
    }

    const gateCount = 1 + (difficulty > 0.72 ? 1 : 0) + (family.index === 4 && index > 5 ? 1 : 0);
    for (let g = 0; g < gateCount; g++) {
      const vertical = (index + g) % 2 === 0;
      hole.gates.push(clampGate({
        x: vertical ? 520 + g * 160 : 255 + g * 250,
        y: vertical ? 256 : 332 + (g % 2) * 72,
        length: vertical ? 116 + difficulty * 18 : 176 + difficulty * 24,
        amp: vertical ? 18 + difficulty * 22 : 22 + difficulty * 30,
        speed: 1.05 + difficulty * 0.44 + g * 0.19,
        phase: rng.range(0, TAU), axis: vertical ? 'y' : 'x'
      }));
    }

    const surfaceShift = rng.range(-24, 24);
    if (family.style === 'desert' || index % 3 !== 1) {
      addRect(hole.sand, 300 + surfaceShift, 510 - (index % 2) * 28, 164 + difficulty * 18, 72, 'sand');
    }
    if (family.style === 'ice' || index % 4 === 1 || family.index === 4 && index % 2 === 0) {
      addRect(hole.ice, 540 + surfaceShift, 170 + (index % 3) * 24, 210, 68 + difficulty * 10, 'ice');
    }
    if (index % 4 === 2 || spec.gimmick === 'water_reset' || spec.gimmick === 'waterwheel' || family.index === 4 && index % 3 === 0) {
      addRect(hole.water, 524 + surfaceShift, 350, 194 + difficulty * 18, 62, 'water');
    }

    const boostX = 340 + rng.range(-35, 180);
    const boostY = index % 2 ? 560 : 196;
    hole.boosts.push({ x: boostX, y: boostY, w: 100, h: 34, dir: index % 2 ? { x: 1, y: 0 } : { x: 0, y: -1 }, cooldown: 0 });
    if (difficulty > 0.9 || family.index === 4) hole.boosts.push({ x: 820 + rng.range(-30, 55), y: index % 2 ? 190 : 552, w: 88, h: 34, dir: index % 2 ? { x: -1, y: 0 } : { x: 0, y: 1 }, cooldown: 0 });

    const bumperCount = 1 + Math.floor(difficulty * 2) + (spec.route === 'pinball' ? 2 : 0);
    for (let b = 0; b < bumperCount; b++) hole.bumpers.push({
      x: 350 + rng.range(0, 580), y: 285 + rng.range(0, 155), r: 18 + rng.range(0, 8), phase: rng.range(0, TAU)
    });

    const gimme = { x: lerp(hole.start.x, hole.cup.x, 0.55), y: lerp(hole.start.y, hole.cup.y, 0.55) };
    hole.pickups.push({ type: 'power', x: gimme.x + rng.range(-42, 42), y: gimme.y + rng.range(-42, 42), taken: false });
    hole.pickups.push({ type: index % 2 ? 'gimme' : 'forgive', x: lerp(hole.start.x, hole.cup.x, 0.74) + rng.range(-32, 32), y: lerp(hole.start.y, hole.cup.y, 0.74) + rng.range(-32, 32), taken: false });
    const altX = 640 + rng.range(-70, 70);
    hole.altWaypoints = [
      { x: hole.start.x, y: hole.start.y }, { x: altX, y: hole.start.y + (hole.cup.y > hole.start.y ? -146 : 146) },
      { x: altX + rng.range(-80, 80), y: hole.cup.y + (hole.start.y > hole.cup.y ? 104 : -104) }, { x: hole.cup.x, y: hole.cup.y }
    ];
    for (let s = 0; s < 20; s++) hole.stars.push({ x: rng.range(90, 1190), y: rng.range(145, 630), a: rng.range(0.12, 0.38), r: rng.range(1, 2.8) });
    return validateHoleLayout(hole);
  }
  function validateHoleLayout(hole) {
    if (!GIMMICK_REGISTRY[hole.gimmick]) throw new Error(`Unknown gimmick: ${hole.gimmick}`);
    if (distance(hole.start, hole.cup) < 260) throw new Error(`Unplayable hole spacing: ${hole.name}`);
    if (hole.walls.length < 4 || hole.gates.length < 1 || hole.bumpers.length < 1) throw new Error(`Incomplete hole layout: ${hole.name}`);
    const regions = hole.sand.concat(hole.ice, hole.water, hole.boosts);
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      if (region.x < PLAY.left || region.y < PLAY.top || region.x + region.w > PLAY.right || region.y + region.h > PLAY.bottom) throw new Error(`Out of bounds surface: ${hole.name}`);
    }
    for (let i = 0; i < hole.pickups.length; i++) {
      if (distance(hole.pickups[i], hole.start) < 42 || distance(hole.pickups[i], hole.cup) < 28) throw new Error(`Pickup overlap: ${hole.name}`);
    }
    return hole;
  }
  // A gate plus its travel used to be able to poke out through a rail.
  function clampGate(gate) {
    const reach = gate.amp + 6;
    if (gate.axis === 'x') {
      gate.length = clamp(gate.length, 60, (PLAY.right - PLAY.left) - reach * 2 - 24);
      gate.x = clamp(gate.x, PLAY.left + reach + 8, PLAY.right - gate.length - reach - 8);
      gate.y = clamp(gate.y, PLAY.top + 14, PLAY.bottom - 14);
    } else {
      gate.length = clamp(gate.length, 60, (PLAY.bottom - PLAY.top) - reach * 2 - 24);
      gate.y = clamp(gate.y, PLAY.top + reach + 8, PLAY.bottom - gate.length - reach - 8);
      gate.x = clamp(gate.x, PLAY.left + 14, PLAY.right - 14);
    }
    return gate;
  }

  function buildCourse(family, mode) {
    const seed = (family.seed ^ (mode === 'trick' ? 0x5157 : mode === 'championship' ? 0xC0A1 : 0x7007)) >>> 0;
    const holes = family.holes.map((spec, index) => buildHole(family, spec, index, seed, mode));
    return { family, mode, seed, holes, parTotal: holes.reduce((sum, hole) => sum + hole.par, 0), scores: Array(18).fill(null), authored: false };
  }

  /* ------------------------------------------------------------------ *
   * HAND-AUTHORED COURSES
   * Twelve authored layout templates. Each template fixes the tee, the
   * cup, the wall skeleton, bumper placement, hazard slots, boost pads,
   * portal anchors and mover rails. Every hole of every theme then picks
   * a template, a mirror, a hazard fill per slot and a feature flag set
   * by hand, so no two holes in a course share a composition.
   * ------------------------------------------------------------------ */
  const LAYOUTS = [
    { id: 'longrail', start: [150, 560], cup: [1120, 215],
      walls: [[320, 300, 700, 300], [560, 470, 940, 470], [1002, 220, 1002, 356]],
      bumpers: [[840, 380, 22], [252, 386, 19]],
      zones: [[380, 486, 180, 78], [706, 178, 196, 68]],
      pads: [[196, 190, 100, 32, 1, 0]], portals: [[300, 596, 1160, 470]],
      movers: [[700, 168, 980, 168, 19, 1.1]] },
    { id: 'dogleg', start: [160, 566], cup: [1112, 200],
      walls: [[520, 140, 520, 420], [520, 420, 900, 420], [900, 420, 900, 186]],
      bumpers: [[302, 300, 20], [1048, 474, 24]],
      zones: [[562, 468, 216, 78], [606, 162, 178, 66]],
      pads: [[300, 588, 96, 30, 1, 0]], portals: [[212, 200, 1130, 566]],
      movers: [[560, 470, 860, 470, 18, 1.35]] },
    { id: 'hourglass', start: [150, 560], cup: [1120, 215],
      walls: [[70, 200, 520, 340], [1210, 200, 760, 340], [70, 574, 520, 434], [1210, 574, 760, 434]],
      bumpers: [[640, 387, 27]],
      zones: [[544, 484, 192, 74], [544, 176, 192, 66]],
      pads: [[560, 356, 92, 30, 1, 0]], portals: [[176, 388, 1104, 388]],
      movers: [[640, 250, 640, 524, 18, 0.9]] },
    { id: 'pinfield', start: [150, 387], cup: [1120, 387],
      walls: [[300, 220, 300, 302], [980, 220, 980, 302], [300, 472, 300, 554], [980, 472, 980, 554]],
      bumpers: [[480, 300, 24], [640, 242, 22], [800, 300, 24], [480, 474, 24], [640, 532, 22], [800, 474, 24], [640, 387, 30]],
      zones: [[356, 176, 190, 64], [734, 542, 190, 64]],
      pads: [[196, 546, 96, 30, 0, -1]], portals: [[214, 190, 1136, 584]],
      movers: [[420, 190, 880, 190, 18, 1.5]] },
    { id: 'spiral', start: [150, 590], cup: [640, 420],
      walls: [[240, 200, 1000, 200], [1000, 200, 1000, 540], [1000, 540, 320, 540], [320, 540, 320, 300], [320, 300, 820, 300], [820, 300, 820, 430]],
      bumpers: [[1104, 372, 24], [180, 300, 19]],
      zones: [[360, 336, 176, 62], [860, 452, 122, 62]],
      pads: [[1042, 574, 96, 30, -1, 0]], portals: [[152, 190, 900, 480]],
      movers: [[360, 240, 940, 240, 18, 1.2]] },
    { id: 'island', start: [150, 560], cup: [640, 387],
      walls: [[300, 150, 300, 244], [980, 150, 980, 244], [300, 530, 300, 624], [980, 530, 980, 624]],
      bumpers: [[352, 470, 22], [930, 300, 22]],
      zones: [[430, 238, 420, 88], [430, 448, 420, 88]],
      pads: [[196, 372, 92, 30, 1, 0]], portals: [[150, 190, 1116, 190]],
      movers: [[1080, 240, 1080, 540, 18, 1.05]] },
    { id: 'switchback', start: [150, 590], cup: [1120, 190],
      walls: [[70, 262, 860, 262], [420, 390, 1210, 390], [70, 520, 860, 520]],
      bumpers: [[938, 456, 22], [242, 326, 22]],
      zones: [[884, 546, 216, 68], [122, 300, 176, 62]],
      pads: [[930, 580, 96, 30, 0, -1]], portals: [[176, 588, 1132, 456]],
      movers: [[470, 456, 1140, 456, 18, 1.4]] },
    { id: 'crossyard', start: [150, 560], cup: [1120, 215],
      walls: [[640, 132, 640, 302], [640, 472, 640, 642], [300, 387, 540, 387], [740, 387, 980, 387]],
      bumpers: [[430, 250, 22], [850, 522, 22]],
      zones: [[302, 470, 178, 68], [800, 178, 178, 68]],
      pads: [[196, 190, 96, 30, 1, 0]], portals: [[300, 588, 1030, 190]],
      movers: [[712, 200, 712, 330, 17, 1.6]] },
    { id: 'gauntlet', start: [150, 387], cup: [1120, 387],
      walls: [[300, 290, 1010, 290], [300, 484, 1010, 484]],
      bumpers: [[212, 240, 20], [1096, 520, 20]],
      zones: [[520, 302, 168, 68], [800, 402, 150, 68]],
      pads: [[330, 372, 92, 30, 1, 0]], portals: [[190, 560, 1090, 200]],
      movers: [[382, 322, 382, 452, 20, 1.2], [640, 452, 640, 322, 20, 1.55], [898, 322, 898, 452, 20, 1.0]] },
    { id: 'twinrooms', start: [200, 300], cup: [1080, 300],
      walls: [[640, 132, 640, 470]],
      bumpers: [[420, 200, 22], [880, 470, 22]],
      zones: [[540, 500, 200, 92], [230, 470, 176, 66]],
      pads: [[880, 566, 92, 30, 0, -1]], portals: [[298, 566, 986, 180]],
      movers: [[760, 200, 1120, 200, 18, 1.25]] },
    { id: 'bankwall', start: [200, 560], cup: [1080, 220],
      walls: [[420, 132, 420, 470], [820, 300, 820, 642]],
      bumpers: [[640, 182, 26], [640, 560, 22]],
      zones: [[440, 500, 216, 78], [880, 176, 176, 66]],
      pads: [[196, 300, 92, 30, 0, 1]], portals: [[210, 190, 1130, 566]],
      movers: [[900, 250, 1160, 250, 18, 1.3]] },
    { id: 'chipover', start: [200, 387], cup: [1060, 387],
      walls: [[560, 178, 560, 600]],
      bumpers: [[382, 242, 22], [880, 522, 22]],
      zones: [[300, 470, 178, 78], [900, 200, 178, 66]],
      pads: [[300, 176, 92, 30, 1, 0]], portals: [[212, 570, 1132, 200]],
      movers: [[700, 200, 700, 560, 18, 1.45]] }
  ];
  const LAYOUT_BY_ID = Object.create(null);
  LAYOUTS.forEach((entry, i) => { LAYOUT_BY_ID[entry.id] = i; });

  // [templateIndex, mirror(0..3), hazard fill per slot, featureFlags]
  // hazard chars: - none, s sand, i ice, w water. flags: 1 portals, 2 movers.
  const AUTHORED = {
    'garden-green': [
      [0, 0, 's-', 0], [1, 0, 'sw', 0], [2, 0, '-w', 0], [7, 1, 's-', 0], [3, 0, 'ss', 0], [6, 0, 'sw', 0],
      [5, 0, 'ww', 0], [10, 0, 's-', 0], [4, 0, 'si', 1], [11, 0, 'sw', 0], [8, 0, '-i', 2], [0, 1, 'ws', 0],
      [9, 0, 'ws', 1], [6, 2, 'si', 2], [2, 3, 'ww', 0], [7, 3, 'sw', 2], [1, 1, 'wi', 1], [5, 1, 'ww', 3]
    ],
    'frostline-cavern': [
      [2, 0, 'i-', 0], [7, 0, 'ii', 0], [8, 0, 'is', 0], [10, 1, 'i-', 0], [0, 2, 'iw', 0], [3, 0, 'ii', 0],
      [6, 1, 'iw', 2], [11, 0, 'is', 0], [4, 0, 'ii', 1], [1, 2, 'iw', 0], [5, 0, 'ww', 2], [9, 0, 'ii', 1],
      [8, 2, 'iw', 2], [0, 3, 'is', 1], [3, 1, 'ww', 2], [2, 2, 'ii', 3], [7, 2, 'iw', 1], [4, 2, 'ii', 3]
    ],
    'duneveil-desert': [
      [0, 0, 's-', 0], [3, 1, 'ss', 0], [6, 1, 'sw', 0], [10, 0, 'ss', 0], [1, 3, 'sw', 0], [11, 1, 'ss', 0],
      [5, 2, 'sw', 1], [2, 1, 'ss', 0], [4, 1, 'si', 2], [8, 1, 'sw', 2], [7, 1, 'ss', 0], [9, 1, 'ws', 1],
      [0, 3, 'sw', 2], [6, 3, 'ss', 1], [3, 2, 'si', 2], [1, 2, 'sw', 3], [10, 2, 'ss', 1], [4, 3, 'sw', 3]
    ],
    'clockwork-yard': [
      [3, 0, '-i', 0], [8, 0, 'is', 0], [7, 2, 'si', 0], [9, 1, 'sw', 0], [0, 1, 'is', 0], [11, 2, 'si', 0],
      [6, 0, 'iw', 2], [4, 2, 'is', 1], [2, 1, 'iw', 2], [10, 3, 'si', 0], [5, 3, 'ww', 1], [1, 3, 'is', 2],
      [8, 3, 'iw', 3], [7, 0, 'si', 1], [3, 3, 'is', 2], [9, 2, 'ww', 3], [0, 2, 'si', 1], [4, 1, 'iw', 3]
    ],
    'championship-crown': [
      [4, 0, 'iw', 1], [9, 0, 'ws', 1], [8, 2, 'is', 2], [5, 3, 'ww', 1], [11, 3, 'sw', 2], [2, 1, 'wi', 3],
      [6, 2, 'ws', 3], [10, 1, 'iw', 1], [3, 3, 'ww', 2], [0, 3, 'si', 3], [7, 1, 'iw', 3], [1, 2, 'ws', 2],
      [9, 3, 'ww', 3], [4, 1, 'iw', 3], [5, 1, 'ws', 3], [8, 1, 'ii', 3], [11, 1, 'ww', 3], [6, 3, 'iw', 3]
    ]
  };

  const MIRROR_X = (x) => PLAY.left + PLAY.right - x;
  const MIRROR_Y = (y) => PLAY.top + PLAY.bottom - y;

  function buildAuthoredHole(family, spec, index, mode, rowOverride) {
    const table = AUTHORED[family.id] || AUTHORED['garden-green'];
    const row = rowOverride || table[index] || table[0];
    const template = LAYOUTS[clamp(row[0] | 0, 0, LAYOUTS.length - 1)];
    const mirror = row[1] | 0, fill = safeText(row[2], '--'), flags = row[3] | 0;
    const fx = (mirror & 1) ? MIRROR_X : (v) => v;
    const fy = (mirror & 2) ? MIRROR_Y : (v) => v;
    const rng = new RNG((family.seed ^ ((index + 1) * 0x85EBCA6B)) >>> 0);
    const difficulty = clamp(0.2 + index * 0.05 + family.index * 0.1 + (mode === 'championship' ? 0.28 : 0), 0.1, 1.65);
    const par = mode === 'trick' ? Math.max(2, PARS[index] - 1)
      : mode === 'championship' ? Math.min(7, PARS[index] + (index > 8 ? 1 : 0)) : PARS[index];
    const start = { x: fx(template.start[0]), y: fy(template.start[1]) };
    const cup = { x: fx(template.cup[0]), y: fy(template.cup[1]), r: 21 };
    const gimmickPoint = { x: lerp(start.x, cup.x, 0.5), y: lerp(start.y, cup.y, 0.44), r: 78 + difficulty * 14 };
    const hole = {
      index, name: spec.name, par, start, cup, route: template.id, cluster: spec.cluster, signature: spec.signature,
      gimmick: spec.gimmick, gimmickPoint, shotCount: 0, difficulty, authored: true, layout: template.id, mirror,
      walls: [], gates: [], bumpers: [], sand: [], ice: [], water: [], boosts: [], pickups: [], altWaypoints: [],
      stars: [], movers: [], portals: [], seed: (family.seed + index * 7717) >>> 0
    };
    addLine(hole.walls, PLAY.left, PLAY.top, PLAY.right, PLAY.top, 'rail');
    addLine(hole.walls, PLAY.right, PLAY.top, PLAY.right, PLAY.bottom, 'rail');
    addLine(hole.walls, PLAY.right, PLAY.bottom, PLAY.left, PLAY.bottom, 'rail');
    addLine(hole.walls, PLAY.left, PLAY.bottom, PLAY.left, PLAY.top, 'rail');
    template.walls.forEach((w) => addLine(hole.walls, fx(w[0]), fy(w[1]), fx(w[2]), fy(w[3]), 'wall'));
    template.bumpers.forEach((b) => hole.bumpers.push({ x: fx(b[0]), y: fy(b[1]), r: b[2], phase: rng.range(0, TAU) }));
    template.zones.forEach((z, slot) => {
      const kind = fill.charAt(slot);
      if (kind !== 's' && kind !== 'i' && kind !== 'w') return;
      const x = (mirror & 1) ? MIRROR_X(z[0] + z[2]) : z[0];
      const y = (mirror & 2) ? MIRROR_Y(z[1] + z[3]) : z[1];
      const list = kind === 's' ? hole.sand : kind === 'i' ? hole.ice : hole.water;
      addRect(list, clamp(x, PLAY.left + 2, PLAY.right - z[2] - 2), clamp(y, PLAY.top + 2, PLAY.bottom - z[3] - 2), z[2], z[3], kind === 's' ? 'sand' : kind === 'i' ? 'ice' : 'water');
    });
    template.pads.forEach((p) => {
      const x = (mirror & 1) ? MIRROR_X(p[0] + p[2]) : p[0];
      const y = (mirror & 2) ? MIRROR_Y(p[1] + p[3]) : p[1];
      const dir = { x: (mirror & 1) ? -p[4] : p[4], y: (mirror & 2) ? -p[5] : p[5] };
      hole.boosts.push({ x: clamp(x, PLAY.left + 2, PLAY.right - p[2] - 2), y: clamp(y, PLAY.top + 2, PLAY.bottom - p[3] - 2), w: p[2], h: p[3], dir, cooldown: 0 });
    });
    const gateCount = 1 + (difficulty > 0.75 ? 1 : 0) + (family.index === 4 && index > 8 ? 1 : 0);
    for (let g = 0; g < gateCount; g++) {
      const vertical = (index + g) % 2 === 0;
      hole.gates.push(clampGate({
        x: fx(vertical ? 520 + g * 168 : 258 + g * 246), y: fy(vertical ? 250 : 332 + (g % 2) * 74),
        length: vertical ? 112 + difficulty * 20 : 172 + difficulty * 26,
        amp: vertical ? 20 + difficulty * 22 : 24 + difficulty * 30,
        speed: 1.02 + difficulty * 0.46 + g * 0.18, phase: rng.range(0, TAU), axis: vertical ? 'y' : 'x'
      }));
    }
    if (flags & 1) {
      const p = template.portals[0];
      hole.portals.push({
        ax: fx(p[0]), ay: fy(p[1]), bx: fx(p[2]), by: fy(p[3]), r: 26, phase: rng.range(0, TAU), cooldown: 0
      });
    }
    if (flags & 2) {
      template.movers.forEach((m) => hole.movers.push({
        x1: fx(m[0]), y1: fy(m[1]), x2: fx(m[2]), y2: fy(m[3]), r: m[4],
        speed: m[5] * (0.85 + difficulty * 0.25), phase: rng.range(0, TAU), x: fx(m[0]), y: fy(m[1]), vx: 0, vy: 0
      }));
    }
    const mid = { x: lerp(start.x, cup.x, 0.52), y: lerp(start.y, cup.y, 0.52) };
    hole.pickups.push({ type: 'power', x: clamp(mid.x + rng.range(-40, 40), PLAY.left + 30, PLAY.right - 30), y: clamp(mid.y + rng.range(-40, 40), PLAY.top + 30, PLAY.bottom - 30), taken: false });
    hole.pickups.push({ type: index % 2 ? 'gimme' : 'forgive', x: clamp(lerp(start.x, cup.x, 0.76) + rng.range(-30, 30), PLAY.left + 30, PLAY.right - 30), y: clamp(lerp(start.y, cup.y, 0.76) + rng.range(-30, 30), PLAY.top + 30, PLAY.bottom - 30), taken: false });
    hole.pickups = hole.pickups.filter((p) => distance(p, start) >= 46 && distance(p, cup) >= 34);
    const altX = lerp(start.x, cup.x, 0.5);
    hole.altWaypoints = [
      { x: start.x, y: start.y }, { x: altX, y: start.y + (cup.y > start.y ? -140 : 140) },
      { x: altX, y: cup.y + (start.y > cup.y ? 100 : -100) }, { x: cup.x, y: cup.y }
    ];
    for (let s = 0; s < 18; s++) hole.stars.push({ x: rng.range(90, 1190), y: rng.range(145, 630), a: rng.range(0.1, 0.34), r: rng.range(1, 2.6) });
    if (distance(start, cup) < 260) throw new Error(`Authored hole too short: ${family.id} ${index}`);
    if (!GIMMICK_REGISTRY[hole.gimmick]) throw new Error(`Unknown gimmick: ${hole.gimmick}`);
    return hole;
  }
  function buildAuthoredCourse(family, mode) {
    const holes = family.holes.map((spec, index) => buildAuthoredHole(family, spec, index, mode));
    return { family, mode, seed: family.seed, holes, parTotal: holes.reduce((sum, hole) => sum + hole.par, 0), scores: Array(18).fill(null), authored: true };
  }
  const validateAuthoredContent = () => {
    COURSE_FAMILIES.forEach((family) => {
      const table = AUTHORED[family.id];
      if (!table || table.length !== 18) throw new Error(`Authored table missing: ${family.id}`);
    });
    return true;
  };
  validateAuthoredContent();

  /* ------------------------------------------------------------------ *
   * SHOT TYPES
   * putt rolls, chip flies over walls and hazards for a short hop, spin
   * curves in flight and loses its bite on every bank.
   * ------------------------------------------------------------------ */
  const SHOTS = [
    { id: 'putt', name: 'PUTT', glyph: '●', power: 1.0, curve: 0, air: 0, hint: 'Ground roll. Banks and gates apply.' },
    { id: 'chip', name: 'CHIP', glyph: '▲', power: 0.86, curve: 0, air: 0.72, hint: 'Flies over walls, water and sand.' },
    { id: 'spin', name: 'SPIN', glyph: '◐', power: 0.94, curve: 1.75, air: 0, hint: 'Curves in flight. Each bank kills half the spin.' }
  ];
  const SHOT_BY_ID = Object.create(null);
  SHOTS.forEach((shot, i) => { SHOT_BY_ID[shot.id] = i; });

  /* ------------------------------------------------------------------ *
   * TRICK SHOT CHALLENGE SET
   * Twelve authored challenges with explicit objectives, validated at
   * sink time. Completion is persisted per challenge id.
   * ------------------------------------------------------------------ */
  const CHALLENGES = [
    { id: 'ts-bank2', name: 'DOUBLE BANK', copy: 'Sink after two or more banks.', layout: 'bankwall', mirror: 0, fill: 's-', flags: 0, shots: 2, test: (r) => r.bounces >= 2 },
    { id: 'ts-bank4', name: 'FOUR WALLS', copy: 'Sink after four or more banks.', layout: 'crossyard', mirror: 0, fill: '--', flags: 0, shots: 3, test: (r) => r.bounces >= 4 },
    { id: 'ts-chip', name: 'OVER THE WALL', copy: 'Sink with a chip shot.', layout: 'chipover', mirror: 0, fill: 'ww', flags: 0, shots: 2, test: (r) => r.shot === 'chip' },
    { id: 'ts-spin', name: 'CURVE IT IN', copy: 'Sink with a spin shot that banked once.', layout: 'dogleg', mirror: 0, fill: '-w', flags: 0, shots: 3, test: (r) => r.shot === 'spin' && r.bounces >= 1 },
    { id: 'ts-portal', name: 'THROUGH THE GATE', copy: 'Sink after using a portal.', layout: 'twinrooms', mirror: 0, fill: 'w-', flags: 1, shots: 2, test: (r) => r.portals >= 1 },
    { id: 'ts-ace', name: 'ONE AND DONE', copy: 'Ace the hole in a single stroke.', layout: 'longrail', mirror: 0, fill: 's-', flags: 0, shots: 1, test: (r) => r.strokes === 1 },
    { id: 'ts-mover', name: 'THREAD THE GAUNTLET', copy: 'Sink without touching a moving hazard.', layout: 'gauntlet', mirror: 0, fill: 'i-', flags: 2, shots: 3, test: (r) => r.moverHits === 0 },
    { id: 'ts-boost', name: 'RIDE THE PAD', copy: 'Sink after taking a boost pad.', layout: 'hourglass', mirror: 0, fill: '-w', flags: 0, shots: 3, test: (r) => r.boosts >= 1 },
    { id: 'ts-dry', name: 'DRY LINE', copy: 'Sink without entering sand or water.', layout: 'island', mirror: 0, fill: 'ww', flags: 0, shots: 3, test: (r) => r.wet === 0 && r.sandy === 0 },
    { id: 'ts-spiral', name: 'INTO THE SPIRAL', copy: 'Reach the spiral cup in three strokes.', layout: 'spiral', mirror: 0, fill: 'si', flags: 0, shots: 3, test: (r) => r.strokes <= 3 },
    { id: 'ts-combo', name: 'CHIP AND CURVE', copy: 'Use a chip and a spin shot, then sink.', layout: 'switchback', mirror: 0, fill: 'sw', flags: 1, shots: 4, test: (r) => r.usedChip && r.usedSpin },
    { id: 'ts-crown', name: 'THE CROWN TRICK', copy: 'Sink in two with three or more banks.', layout: 'pinfield', mirror: 0, fill: 'i-', flags: 2, shots: 2, test: (r) => r.strokes <= 2 && r.bounces >= 3 }
  ];
  const CHALLENGE_IDS = CHALLENGES.map((c) => c.id);
  function buildChallengeHole(challenge, index) {
    const template = LAYOUTS[LAYOUT_BY_ID[challenge.layout] != null ? LAYOUT_BY_ID[challenge.layout] : 0];
    const family = FALLBACK_FAMILY;
    const fakeFamily = { id: family.id, seed: (0x51C0 + index * 977) >>> 0, index: 2, holes: family.holes };
    const spec = { name: challenge.name, cluster: Math.floor(index / 3), signature: false, gimmick: 'petal_boost' };
    const row = [LAYOUT_BY_ID[challenge.layout] || 0, challenge.mirror | 0, challenge.fill, challenge.flags | 0];
    const hole = buildAuthoredHole(fakeFamily, spec, index % 18, 'trick', row);
    hole.name = challenge.name;
    hole.par = challenge.shots;
    hole.challenge = challenge;
    hole.layout = template.id;
    return hole;
  }
  function buildChallengeCourse() {
    const holes = CHALLENGES.map((challenge, index) => buildChallengeHole(challenge, index));
    return {
      family: FALLBACK_FAMILY, mode: 'trick', seed: 0x51C0, holes, challenge: true,
      parTotal: holes.reduce((sum, hole) => sum + hole.par, 0), scores: Array(holes.length).fill(null), authored: true
    };
  }

  /* ------------------------------------------------------------------ *
   * RIVAL PRO (the AI that plays the course beside you)
   * A pure rollout planner. It samples aim angles and powers, runs each
   * candidate through a reduced copy of the live physics, and keeps the
   * best line. Budgeted per frame so it never spikes a frame.
   * ------------------------------------------------------------------ */
  function rolloutShot(hole, from, dir, speed, record) {
    const b = { x: from.x, y: from.y, vx: dir.x * speed, vy: dir.y * speed, r: 14 };
    const walls = hole.walls;
    const path = record ? [] : null;
    let sunk = false, best = distance(b, hole.cup), wet = false;
    for (let step = 0; step < 420; step++) {
      b.x += b.vx * STEP; b.y += b.vy * STEP;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < walls.length; i++) {
          const seg = walls[i];
          const closest = segmentPoint(seg, b.x, b.y);
          const dx = b.x - closest.x, dy = b.y - closest.y;
          const d = hypot(dx, dy);
          const radius = b.r + (seg.kind === 'rail' ? 4 : 6);
          if (d >= radius) continue;
          const nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : 1;
          b.x = closest.x + nx * radius; b.y = closest.y + ny * radius;
          const dot = b.vx * nx + b.vy * ny;
          if (dot < 0) { b.vx = (b.vx - 2 * dot * nx) * 1.015; b.vy = (b.vy - 2 * dot * ny) * 1.015; }
        }
        for (let i = 0; i < hole.bumpers.length; i++) {
          const bump = hole.bumpers[i];
          const dx = b.x - bump.x, dy = b.y - bump.y;
          const d = hypot(dx, dy) || 1, radius = b.r + bump.r;
          if (d >= radius) continue;
          const nx = dx / d, ny = dy / d;
          b.x = bump.x + nx * radius; b.y = bump.y + ny * radius;
          const dot = b.vx * nx + b.vy * ny;
          if (dot < 0) { b.vx = (b.vx - 2 * dot * nx) * 1.09; b.vy = (b.vy - 2 * dot * ny) * 1.09; }
        }
      }
      let drag = 0.78;
      for (let i = 0; i < hole.ice.length; i++) if (pointInRect(hole.ice[i], b.x, b.y)) drag = 0.992;
      for (let i = 0; i < hole.sand.length; i++) if (pointInRect(hole.sand[i], b.x, b.y)) drag = 0.37;
      b.vx *= Math.pow(drag, STEP); b.vy *= Math.pow(drag, STEP);
      for (let i = 0; i < hole.water.length; i++) if (pointInRect(hole.water[i], b.x, b.y)) { wet = true; break; }
      if (wet) break;
      const d = distance(b, hole.cup);
      if (d < best) best = d;
      if (path && (step & 3) === 0 && path.length < 130) path.push(b.x, b.y);
      const sp = hypot(b.vx, b.vy);
      if (d < hole.cup.r + b.r + 5 && sp < 600) { sunk = true; if (path) path.push(hole.cup.x, hole.cup.y); break; }
      if (sp < 16 && step > 12) break;
    }
    return { sunk, wet, best, x: b.x, y: b.y, path };
  }
  function makeRivalPlanner(hole, from, skill) {
    const angles = 26 + Math.round(skill * 12);
    const powers = [0.42, 0.58, 0.72, 0.86, 1.0];
    const jobs = [];
    for (let a = 0; a < angles; a++) {
      const base = (a / angles) * TAU;
      for (let p = 0; p < powers.length; p++) jobs.push({ angle: base, power: powers[p] });
    }
    // Bias the first jobs toward the cup so an early cut-off still plays well.
    const toCup = Math.atan2(hole.cup.y - from.y, hole.cup.x - from.x);
    jobs.sort((j1, j2) => {
      const d1 = Math.abs(Math.atan2(Math.sin(j1.angle - toCup), Math.cos(j1.angle - toCup)));
      const d2 = Math.abs(Math.atan2(Math.sin(j2.angle - toCup), Math.cos(j2.angle - toCup)));
      return d1 - d2;
    });
    let cursor = 0, bestScore = Infinity, bestResult = null;
    return {
      done: false, result: null,
      tick(budget) {
        let count = 0;
        while (cursor < jobs.length && count < budget) {
          const job = jobs[cursor++];
          count += 1;
          const dir = { x: Math.cos(job.angle), y: Math.sin(job.angle) };
          const speed = clamp(job.power * 1180 * (0.72 + skill * 0.3), 120, 1240);
          const out = rolloutShot(hole, from, dir, speed, false);
          const noise = (1 - skill) * 130;
          const score = (out.sunk ? -4000 : out.best) + (out.wet ? 900 : 0) + noise * ((cursor * 0.37) % 1);
          if (score < bestScore) { bestScore = score; bestResult = { dir, speed, out }; }
          if (out.sunk && skill > 0.55) { cursor = jobs.length; break; }
        }
        if (cursor >= jobs.length) {
          this.done = true;
          if (bestResult) {
            const replay = rolloutShot(hole, from, bestResult.dir, bestResult.speed, true);
            this.result = { dir: bestResult.dir, speed: bestResult.speed, out: replay, path: replay.path };
          }
        }
        return this.done;
      }
    };
  }

  function pointInRect(rect, x, y) { return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h; }
  function segmentPoint(seg, x, y) {
    const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
    const len2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - seg.x1) * dx + (y - seg.y1) * dy) / len2, 0, 1);
    return { x: seg.x1 + dx * t, y: seg.y1 + dy * t, t };
  }
  function raySegment(origin, dir, seg) {
    const rx = dir.x, ry = dir.y, sx = seg.x2 - seg.x1, sy = seg.y2 - seg.y1;
    const qx = seg.x1 - origin.x, qy = seg.y1 - origin.y;
    const cross = rx * sy - ry * sx;
    if (Math.abs(cross) < 0.0001) return null;
    const t = (qx * sy - qy * sx) / cross;
    const u = (qx * ry - qy * rx) / cross;
    if (t < 0 || u < 0 || u > 1) return null;
    return { t, x: origin.x + rx * t, y: origin.y + ry * t, seg };
  }
  function rayCircle(origin, dir, circle, radius) {
    const ox = origin.x - circle.x, oy = origin.y - circle.y;
    const projection = -(ox * dir.x + oy * dir.y);
    if (projection < 0) return null;
    const closestX = ox + dir.x * projection, closestY = oy + dir.y * projection;
    const offset = radius * radius - closestX * closestX - closestY * closestY;
    if (offset < 0) return null;
    const t = projection - Math.sqrt(offset);
    if (t < 0) return null;
    return { t, x: origin.x + dir.x * t, y: origin.y + dir.y * t, bumper: circle };
  }

  /* ------------------------------------------------------------------ *
   * RESOLUTION
   * The game world stays 1280x720 logical units. The Phaser canvas is
   * sized in DEVICE pixels (logical * DPR) and the main camera is zoomed
   * by the same factor, so the backing store is dense on a retina phone
   * while every gameplay coordinate in this file stays logical. Every
   * baked texture is rasterised at the same factor, never upscaled.
   * ------------------------------------------------------------------ */
  const DPR = (() => {
    const ratio = Math.max(1, Number(window.devicePixelRatio) || 1);
    const vw = Math.max(320, Number(window.innerWidth) || GAME_W);
    const vh = Math.max(240, Number(window.innerHeight) || GAME_H);
    const fitted = Math.min(vw, vh * (GAME_W / GAME_H));
    const wanted = (fitted * ratio) / GAME_W;
    const safe = Number.isFinite(wanted) && wanted > 0 ? wanted : ratio;
    return clamp(Math.round(safe * 4) / 4, 1, 3);
  })();

  const hexOf = (n) => '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0');
  const rgbaOf = (n, a) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  const mixHex = (a, b, t) => {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return ((Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t)) >>> 0;
  };

  function newCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    return canvas;
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  // A tileable luminance-noise patch. Overlaid at low alpha it breaks the
  // banding on every large gradient and lifts a flat fill into hundreds of
  // neighbouring shades, which is what kills the flat look on a phone.
  const NOISE_TILE = (() => {
    const size = 128;
    const canvas = newCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(size, size);
    let seed = 0x2F6E2B15 >>> 0;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < image.data.length; i += 4) {
      const value = 104 + Math.floor(rnd() * 48);
      image.data[i] = value; image.data[i + 1] = value; image.data[i + 2] = value; image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  })();
  function noisePass(ctx, x, y, w, h, alpha, mode) {
    const pattern = ctx.createPattern(NOISE_TILE, 'repeat');
    if (!pattern) return;
    ctx.save();
    ctx.globalCompositeOperation = mode || 'overlay';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pattern;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * TEXTURE BAKERY
   * Every repeated shape is rasterised once, at device scale, into a
   * canvas texture. Nothing here is built against a texture that has not
   * finished baking: bake() runs to completion before any game object is
   * constructed.
   * ------------------------------------------------------------------ */
  const TEX = {
    baked: Object.create(null),
    add(scene, key, w, h, paint) {
      if (scene.textures.exists(key)) return key;
      const canvas = newCanvas(w * DPR, h * DPR);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      paint(ctx, w, h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      scene.textures.addCanvas(key, canvas);
      this.baked[key] = { w, h };
      return key;
    },
    size(key) { return this.baked[key] || { w: 64, h: 64 }; },

    core(scene) {
      this.add(scene, 'rr-glow', 128, 128, (ctx, w) => {
        const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.28, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.62, 'rgba(255,255,255,0.16)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
      });
      this.add(scene, 'rr-ring', 160, 160, (ctx, w) => {
        const c = w / 2;
        const g = ctx.createRadialGradient(c, c, w * 0.3, c, c, c);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.62, 'rgba(255,255,255,0.25)');
        g.addColorStop(0.84, 'rgba(255,255,255,1)');
        g.addColorStop(0.95, 'rgba(255,255,255,0.35)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
      });
      this.add(scene, 'rr-flare', 128, 128, (ctx, w) => {
        const c = w / 2;
        const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.42);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, c * 0.42, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        for (let i = 0; i < 4; i++) {
          ctx.save(); ctx.translate(c, c); ctx.rotate(i * Math.PI / 4);
          const len = i % 2 ? c * 0.62 : c;
          ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(0, -3.4); ctx.lineTo(len, 0); ctx.lineTo(0, 3.4); ctx.closePath();
          ctx.globalAlpha = i % 2 ? 0.4 : 0.85; ctx.fill(); ctx.restore();
        }
      });
      this.add(scene, 'rr-puff', 64, 64, (ctx, w) => {
        const c = w / 2;
        const g = ctx.createRadialGradient(c, c, 0, c, c, c);
        g.addColorStop(0, 'rgba(255,255,255,0.85)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.32)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
        noisePass(ctx, 0, 0, w, w, 0.28, 'overlay');
      });
      this.add(scene, 'rr-shadow', 96, 64, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(0,0,0,0.72)');
        g.addColorStop(0.55, 'rgba(0,0,0,0.34)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(1, h / w); ctx.translate(-w / 2, -w / 2);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, w); ctx.restore();
      });
      this.add(scene, 'rr-bumper', 96, 96, (ctx, w) => {
        const c = w / 2;
        ctx.fillStyle = 'rgba(4,12,16,0.6)';
        ctx.beginPath(); ctx.ellipse(c, c + 6, c - 6, c - 10, 0, 0, TAU); ctx.fill();
        const g = ctx.createRadialGradient(c - 12, c - 14, 2, c, c, c - 6);
        g.addColorStop(0, '#f0e6ff'); g.addColorStop(0.34, '#c9a6ff');
        g.addColorStop(0.74, '#7c56c8'); g.addColorStop(1, '#331f52');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, c - 8, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(234,255,247,0.78)'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(c, c, c - 9, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(c, c, c - 17, Math.PI * 1.05, Math.PI * 1.85); ctx.stroke();
        noisePass(ctx, 0, 0, w, w, 0.16, 'overlay');
      });
      this.add(scene, 'rr-mover', 96, 96, (ctx, w) => {
        const c = w / 2;
        ctx.fillStyle = 'rgba(4,12,16,0.6)';
        ctx.beginPath(); ctx.arc(c, c + 5, c - 8, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff897c';
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU, r = i % 2 ? c - 22 : c - 6;
          const px = c + Math.cos(a) * r, py = c + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        const g = ctx.createRadialGradient(c - 10, c - 12, 2, c, c, c);
        g.addColorStop(0, '#ffe0d4'); g.addColorStop(0.45, '#ff9a80'); g.addColorStop(1, '#8f2f30');
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(255,236,224,0.8)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = 'rgba(10,6,10,0.75)'; ctx.beginPath(); ctx.arc(c, c, 9, 0, TAU); ctx.fill();
      });
      this.add(scene, 'rr-portal', 128, 128, (ctx, w) => {
        const c = w / 2;
        for (let i = 0; i < 4; i++) {
          const r = c - 6 - i * 11;
          const g = ctx.createLinearGradient(c - r, c - r, c + r, c + r);
          g.addColorStop(0, `rgba(150,240,255,${0.85 - i * 0.14})`);
          g.addColorStop(0.5, `rgba(196,164,255,${0.7 - i * 0.12})`);
          g.addColorStop(1, `rgba(110,255,214,${0.8 - i * 0.14})`);
          ctx.strokeStyle = g; ctx.lineWidth = 4.5 - i * 0.6;
          ctx.beginPath(); ctx.arc(c, c, r, i * 0.5, i * 0.5 + Math.PI * 1.55); ctx.stroke();
        }
        const core = ctx.createRadialGradient(c, c, 0, c, c, c * 0.4);
        core.addColorStop(0, 'rgba(240,255,255,0.9)');
        core.addColorStop(0.6, 'rgba(120,200,255,0.28)');
        core.addColorStop(1, 'rgba(80,140,255,0)');
        ctx.fillStyle = core; ctx.fillRect(0, 0, w, w);
      });
      this.add(scene, 'rr-cupring', 128, 128, (ctx, w) => {
        const c = w / 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(c, c, c - 8, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(c, c, c - 18, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3.2;
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(c + Math.cos(a) * (c - 26), c + Math.sin(a) * (c - 26));
          ctx.lineTo(c + Math.cos(a) * (c - 12), c + Math.sin(a) * (c - 12));
          ctx.stroke();
        }
      });
      const pickup = (key, tint, glyph) => this.add(scene, key, 72, 72, (ctx, w) => {
        const c = w / 2;
        const g = ctx.createRadialGradient(c, c, 2, c, c, c - 4);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.42, rgbaOf(tint, 0.66));
        g.addColorStop(1, rgbaOf(tint, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
        ctx.strokeStyle = rgbaOf(tint, 0.95); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(c, c, c - 14, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px Trebuchet MS, Verdana, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(glyph, c, c + 1);
      });
      pickup('rr-pk-power', PAL.yellow, '⚡');
      pickup('rr-pk-gimme', PAL.cyan, '○');
      pickup('rr-pk-forgive', PAL.violet, '◇');
      this.add(scene, 'rr-plate', 256, 72, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(255,255,255,0.16)');
        g.addColorStop(0.42, 'rgba(255,255,255,0.05)');
        g.addColorStop(1, 'rgba(0,0,0,0.28)');
        roundRectPath(ctx, 2, 2, w - 4, h - 4, 14);
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.34)'; ctx.lineWidth = 1.6; ctx.stroke();
        noisePass(ctx, 0, 0, w, h, 0.1, 'overlay');
      });
      this.add(scene, 'rr-bar', 512, 96, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(16,34,40,0.96)');
        g.addColorStop(0.5, 'rgba(9,22,28,0.94)');
        g.addColorStop(1, 'rgba(4,12,16,0.97)');
        roundRectPath(ctx, 1, 1, w - 2, h - 2, 20);
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(150,230,210,0.26)'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.save(); roundRectPath(ctx, 1, 1, w - 2, h - 2, 20); ctx.clip();
        const sheen = ctx.createLinearGradient(0, 0, w, h);
        sheen.addColorStop(0, 'rgba(140,244,209,0.10)');
        sheen.addColorStop(0.5, 'rgba(100,221,234,0.03)');
        sheen.addColorStop(1, 'rgba(193,161,255,0.09)');
        ctx.fillStyle = sheen; ctx.fillRect(0, 0, w, h);
        noisePass(ctx, 0, 0, w, h, 0.11, 'overlay');
        ctx.restore();
      });
      this.add(scene, 'rr-card', 512, 384, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
        g.addColorStop(0, 'rgba(22,48,56,0.985)');
        g.addColorStop(0.45, 'rgba(11,28,35,0.985)');
        g.addColorStop(1, 'rgba(5,14,19,0.99)');
        roundRectPath(ctx, 3, 3, w - 6, h - 6, 26);
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(160,240,215,0.55)'; ctx.lineWidth = 2.4; ctx.stroke();
        ctx.save(); roundRectPath(ctx, 3, 3, w - 6, h - 6, 26); ctx.clip();
        const beam = ctx.createLinearGradient(0, 0, w, 0);
        beam.addColorStop(0, 'rgba(140,244,209,0.14)');
        beam.addColorStop(0.35, 'rgba(100,221,234,0.05)');
        beam.addColorStop(0.7, 'rgba(255,217,120,0.06)');
        beam.addColorStop(1, 'rgba(193,161,255,0.13)');
        ctx.fillStyle = beam; ctx.fillRect(0, 0, w, h);
        noisePass(ctx, 0, 0, w, h, 0.12, 'overlay');
        ctx.restore();
      });
      this.add(scene, 'rr-spark', 48, 48, (ctx, w) => {
        const c = w / 2;
        const g = ctx.createRadialGradient(c, c, 0, c, c, c);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.34, 'rgba(255,255,255,0.6)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
      });
    },

    // Three tiling ground layers per authored area, baked at device scale.
    style(scene, styleId) {
      const style = STYLES[styleId] || STYLES.garden;
      const far = `rr-far-${styleId}`, mid = `rr-mid-${styleId}`, near = `rr-near-${styleId}`;
      if (scene.textures.exists(near)) return { far, mid, near };
      let seed = 0x9E3779B9 ^ styleId.length * 2654435761;
      const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      this.add(scene, far, 256, 256, (ctx, w) => {
        const g = ctx.createLinearGradient(0, 0, w, w);
        g.addColorStop(0, style.far); g.addColorStop(0.5, style.mid); g.addColorStop(1, style.far);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < 46; i++) {
          const x = rnd() * w, y = rnd() * w, r = 10 + rnd() * 34;
          const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
          blob.addColorStop(0, rgbaOf(mixHex(style.base, 0xffffff, 0.18), 0.4));
          blob.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = blob; ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
        noisePass(ctx, 0, 0, w, w, 0.24, 'overlay');
      });
      this.add(scene, mid, 512, 512, (ctx, w) => {
        ctx.clearRect(0, 0, w, w);
        const paintMotif = (x, y, scale) => {
          ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
          if (style.scenery === 'trees') {
            const g = ctx.createRadialGradient(-12, -14, 4, 0, 0, 52);
            g.addColorStop(0, rgbaOf(mixHex(0x6ad3a5, 0xffffff, 0.35), 0.5));
            g.addColorStop(0.6, rgbaOf(0x2c7a5c, 0.34));
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(0, 0, 50, 0, TAU); ctx.fill();
            ctx.strokeStyle = 'rgba(180,255,220,0.18)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, 34, 0.4, 4.2); ctx.stroke();
          } else if (style.scenery === 'peaks') {
            const g = ctx.createLinearGradient(-50, 40, 30, -46);
            g.addColorStop(0, 'rgba(20,70,100,0.05)');
            g.addColorStop(0.6, 'rgba(150,232,255,0.24)');
            g.addColorStop(1, 'rgba(230,252,255,0.42)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(-52, 40); ctx.lineTo(-6, -46); ctx.lineTo(50, 40); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = 'rgba(210,246,255,0.3)'; ctx.lineWidth = 1.6; ctx.stroke();
          } else if (style.scenery === 'dunes') {
            const g = ctx.createLinearGradient(0, -40, 0, 40);
            g.addColorStop(0, 'rgba(255,214,150,0.34)');
            g.addColorStop(0.55, 'rgba(206,132,74,0.22)');
            g.addColorStop(1, 'rgba(96,44,32,0.06)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.ellipse(0, 0, 62, 26, -0.3, 0, TAU); ctx.fill();
            ctx.strokeStyle = 'rgba(255,226,178,0.24)'; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.ellipse(0, 6, 44, 15, -0.3, 0, Math.PI); ctx.stroke();
          } else if (style.scenery === 'gears') {
            ctx.strokeStyle = 'rgba(255,198,118,0.3)'; ctx.lineWidth = 3.2;
            ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.stroke();
            ctx.lineWidth = 2;
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * TAU;
              ctx.beginPath();
              ctx.moveTo(Math.cos(a) * 40, Math.sin(a) * 40);
              ctx.lineTo(Math.cos(a) * 50, Math.sin(a) * 50);
              ctx.stroke();
            }
            const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 42);
            g.addColorStop(0, 'rgba(255,220,160,0.24)');
            g.addColorStop(1, 'rgba(255,170,90,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 42, 0, TAU); ctx.fill();
          } else {
            const g = ctx.createLinearGradient(-30, -46, 30, 46);
            g.addColorStop(0, 'rgba(249,212,125,0.34)');
            g.addColorStop(0.5, 'rgba(159,247,222,0.2)');
            g.addColorStop(1, 'rgba(197,164,255,0.3)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(26, 12); ctx.lineTo(0, 44); ctx.lineTo(-26, 12); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5; ctx.stroke();
          }
          ctx.restore();
        };
        for (let i = 0; i < 9; i++) {
          const x = rnd() * w, y = rnd() * w, s = 0.62 + rnd() * 0.8;
          paintMotif(x, y, s);
          if (x < 90) paintMotif(x + w, y, s);
          if (y < 90) paintMotif(x, y + w, s);
          if (x < 90 && y < 90) paintMotif(x + w, y + w, s);
        }
        noisePass(ctx, 0, 0, w, w, 0.14, 'overlay');
      });
      this.add(scene, near, 384, 384, (ctx, w) => {
        ctx.clearRect(0, 0, w, w);
        for (let i = 0; i < 60; i++) {
          const x = rnd() * w, y = rnd() * w, r = 1 + rnd() * 3.4;
          ctx.fillStyle = rgbaOf(mixHex(style.base, 0xffffff, 0.72), 0.1 + rnd() * 0.2);
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        }
        for (let i = 0; i < 7; i++) {
          const x = rnd() * w, y = rnd() * w, r = 40 + rnd() * 70;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, rgbaOf(0xffffff, 0.05));
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
      });
      return { far, mid, near };
    }
  };
  const TOPBAR = { x: 26, y: 14, w: 1228, h: 64 };
  const FOOTBAR = { x: 26, y: 664, w: 1228, h: 48 };
  const TOP_BUTTONS = [
    { id: 'tour', x: 300, w: 96, label: 'TOUR' },
    { id: 'seeded', x: 402, w: 96, label: 'SEED' },
    { id: 'trick', x: 504, w: 104, label: 'TRICK' },
    { id: 'championship', x: 614, w: 110, label: 'CROWN' },
    { id: 'course', x: 1010, w: 104, label: 'NEXT' },
    { id: 'card', x: 1120, w: 104, label: 'CARD' }
  ];
  const FOOT_BUTTONS = [
    { id: 'settings', x: 32, w: 70, label: '⚙' },
    { id: 'restart', x: 110, w: 66, label: '↻' },
    { id: 'pause', x: 186, w: 70, label: 'Ⅱ' },
    { id: 'putt', x: 300, w: 100, label: 'PUTT' },
    { id: 'chip', x: 410, w: 100, label: 'CHIP' },
    { id: 'spin', x: 520, w: 100, label: 'SPIN' }
  ];
  const CARD_RECT = { x: 348, y: 150, w: 584, h: 360 };
  const CAREER_RECT = { x: 150, y: 96, w: 980, h: 564 };
  const ACTION_RECT = { x: 486, y: 406, w: 308, h: 64 };

  class RicochetScene extends Phaser.Scene {
    constructor() { super({ key: 'RicochetScene' }); }

    preload() {
      const px = (n) => Math.round(n * DPR);
      this.load.svg('rr-ball', 'assets/ball.svg', { width: px(96), height: px(96) });
      this.load.svg('rr-particle', 'assets/particle.svg', { width: px(32), height: px(32) });
    }

    create() {
      activeScene = this;
      this.cameras.main.setZoom(DPR);
      this.cameras.main.centerOn(GAME_W / 2, GAME_H / 2);
      this.cameras.main.setBackgroundColor('#071116');

      this.accumulator = 0;
      this.simTime = 0;
      this.mode = 'tour';
      this.courseIndex = 0;
      this.course = null;
      this.holeIndex = 0;
      this.hole = null;
      this.phase = 'play';
      this.ball = null;
      this.ballVisualState = 'idle';
      this.ballRoll = 0;
      this.settleTimer = 0;
      this.aim = { active: false, dir: { x: 0, y: -1 }, power: 0, pull: 0, point: { x: 0, y: 0 } };
      this.shotOrigin = { x: 0, y: 0 };
      this.bouncedThisShot = false;
      this.panLast = null;
      this.panOffset = { x: 0, y: 0 };
      this.pointerClaims = new Map();
      this.gestures = new Map();
      this.previousKeys = new Set();
      this.segmentScratch = [];
      this.gateRuntime = [];
      this.transient = { text: '', timer: 0, max: 0 };
      this.transientQueue = [];
      this.result = { title: '', copy: '', stats: '', action: 'NEXT HOLE' };
      this.cameraKick = { x: 0, y: 0 };
      this.inventory = { power: 2, gimme: 1, forgive: 1 };
      this.tutorialStep = progress.tutorialSeen ? 4 : 0;
      this.tutorialTimer = 0;
      this.uiCache = Object.create(null);
      this.particles = [];
      this.trail = [];
      this.gamepadButtons = new Set();
      this.userPaused = false;
      this.careerOpen = false;
      this.lastGamepadAim = { x: 0, y: -1 };
      this.shotIndex = 0;
      this.spinSign = 1;
      this.dustTimer = 0;
      this.rollCueTimer = 0;
      this.settleTimer = 0;
      this.celebrate = { tier: 0, timer: 0 };
      this.briefText = '';
      this.briefTimer = 0;
      this.transition = { timer: 0, duration: 0, action: null, fired: false };
      this.holeStats = this.freshHoleStats();
      this.rival = null;
      this.styleTiles = null;
      this.fxIndex = 0;

      for (let i = 0; i < 240; i++) this.particles.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, size: 0, color: PAL.mint, kind: 0, drag: 0.91 });
      for (let i = 0; i < 48; i++) this.trail.push({ alive: false, x: 0, y: 0, age: 0, life: 0.3, color: PAL.mint, size: 4 });

      // BAKE FIRST. Nothing below is constructed against a texture that has
      // not finished rasterising.
      TEX.core(this);
      this.courseCanvas = newCanvas(GAME_W * DPR, GAME_H * DPR);
      this.courseCtx = this.courseCanvas.getContext('2d');
      this.paintCourseCanvas(STYLES.garden, null);
      this.courseTex = this.textures.addCanvas('rr-course', this.courseCanvas);
      this.styleTiles = TEX.style(this, 'garden');

      kit.loader.progress(0.6);
      this.buildDisplay();
      this.prewarmFx();
      kit.loader.progress(0.9);
      this.installWindowGestures();
      this.startCourse(0, 'tour', 0);
      this.applyForceSwitches();
      this.syncState();
      startAmbient();
      kit.loader.progress(1);
      kit.loader.hide();
    }

    // Every pooled effect is touched once, offscreen, before play starts so
    // the first bank shot never pays a first-use allocation.
    prewarmFx() {
      Object.keys(this.emitters).forEach((name) => { this.emitParticles(name, -600, -600, 2); });
      Object.values(this.emitters).forEach((emitter) => emitter.stop());
      for (let i = 0; i < this.particles.length; i++) this.spawnParticle(-600, -600, PAL.mint, i % 4, 10, 0.01, 2);
      for (let i = 0; i < this.trail.length; i++) this.addTrail(-600, -600, 0, 0);
      this.fxSprites.forEach((sprite, i) => this.spawnRing(-600, -600, PAL.mint, 10, 4, 0.01, 0));
      this.fxFlares.forEach((sprite, i) => this.spawnFlare(-600, -600, PAL.mint, 10, 0.01));
      this.updateParticles(0.02);
      this.updateFxSprites(0.02);
      this.clearFx();
    }

    freshHoleStats() {
      return { bounces: 0, portals: 0, boosts: 0, wet: 0, sandy: 0, moverHits: 0, usedChip: false, usedSpin: false, shot: 'putt', strokes: 0, maxBank: 0 };
    }

    /* ---------------------------------------------------------- display */
    buildDisplay() {
      const px = (v) => v;
      this.root = this.add.container(0, 0).setDepth(1);
      this.bgG = this.add.graphics();

      const play = { x: PLAY.left, y: PLAY.top, w: PLAY.right - PLAY.left, h: PLAY.bottom - PLAY.top };
      const tile = (key, alpha) => {
        const sprite = this.add.tileSprite(play.x, play.y, play.w, play.h, key).setOrigin(0, 0).setAlpha(alpha);
        sprite.tileScaleX = 1 / DPR;
        sprite.tileScaleY = 1 / DPR;
        return sprite;
      };
      this.tileFar = tile(this.styleTiles.far, 0.72);
      this.tileMid = tile(this.styleTiles.mid, 0.62);
      this.tileNear = tile(this.styleTiles.near, 0.52);

      this.courseImage = this.add.image(0, 0, 'rr-course').setOrigin(0, 0).setDisplaySize(GAME_W, GAME_H);

      this.gimGlow = this.add.image(0, 0, 'rr-glow').setDisplaySize(220, 220).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      this.gimRingA = this.add.image(0, 0, 'rr-ring').setDisplaySize(190, 190).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      this.gimRingB = this.add.image(0, 0, 'rr-ring').setDisplaySize(126, 126).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);

      const pool = (key, count, size, blend) => {
        const list = [];
        for (let i = 0; i < count; i++) {
          const image = this.add.image(0, 0, key).setDisplaySize(size, size).setVisible(false);
          if (blend) image.setBlendMode(blend);
          list.push(image);
        }
        return list;
      };
      this.portalSprites = pool('rr-portal', 2, 74, Phaser.BlendModes.ADD);
      this.moverSprites = pool('rr-mover', 4, 56);
      this.bumperSprites = pool('rr-bumper', 12, 56);
      this.pickupSprites = pool('rr-pk-power', 4, 44, Phaser.BlendModes.ADD);
      this.cupRing = this.add.image(0, 0, 'rr-cupring').setDisplaySize(84, 84).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);

      this.gateG = this.add.graphics();
      this.previewG = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      this.ghost = this.add.image(0, 0, 'rr-ball').setDisplaySize(40, 40).setAlpha(0).setTint(0x9fd8ff);
      this.ballShadow = this.add.image(0, 0, 'rr-shadow').setDisplaySize(48, 32).setAlpha(0.6);
      this.ballSprite = this.add.image(0, 0, 'rr-ball').setDisplaySize(38, 38);
      this.ballGlow = this.add.image(0, 0, 'rr-glow').setDisplaySize(88, 88).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD);
      this.fxSprites = pool('rr-ring', 18, 60, Phaser.BlendModes.ADD);
      this.fxFlares = pool('rr-flare', 10, 70, Phaser.BlendModes.ADD);
      this.fxSprites.forEach((s) => { s._life = 0; s._max = 1; s._grow = 0; s._base = 40; });
      this.fxFlares.forEach((s) => { s._life = 0; s._max = 1; s._grow = 0; s._base = 40; });

      const emitterOpts = (extra) => Object.assign({
        blendMode: Phaser.BlendModes.ADD, emitting: false
      }, extra);
      this.emitters = {
        trail: this.add.particles(0, 0, 'rr-spark', emitterOpts({ lifespan: 280, speed: 0, scale: { start: 0.55 / DPR, end: 0 }, alpha: { start: 0.4, end: 0 } })),
        sparks: this.add.particles(0, 0, 'rr-spark', emitterOpts({ lifespan: { min: 180, max: 380 }, speed: { min: 55, max: 210 }, scale: { start: 0.5 / DPR, end: 0 }, alpha: { start: 0.8, end: 0 } })),
        pickups: this.add.particles(0, 0, 'rr-particle', emitterOpts({ lifespan: { min: 340, max: 640 }, speed: { min: 30, max: 120 }, scale: { start: 0.9 / DPR, end: 0 }, alpha: { start: 0.85, end: 0 } })),
        dust: this.add.particles(0, 0, 'rr-puff', emitterOpts({ blendMode: Phaser.BlendModes.NORMAL, emitting: false, lifespan: { min: 260, max: 520 }, speed: { min: 8, max: 46 }, scale: { start: 0.35 / DPR, end: 0.9 / DPR }, alpha: { start: 0.4, end: 0 } })),
        finish: this.add.particles(0, 0, 'rr-spark', emitterOpts({ lifespan: { min: 520, max: 980 }, speed: { min: 90, max: 300 }, scale: { start: 0.95 / DPR, end: 0 }, alpha: { start: 0.95, end: 0 } }))
      };
      this.fxG = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);

      this.root.add([this.bgG, this.tileFar, this.tileMid, this.tileNear, this.courseImage,
        this.gimGlow, this.gimRingA, this.gimRingB]);
      this.root.add(this.portalSprites);
      this.root.add(this.moverSprites);
      this.root.add(this.bumperSprites);
      this.root.add(this.pickupSprites);
      this.root.add([this.cupRing, this.gateG, this.previewG, this.ghost, this.ballShadow, this.ballSprite, this.ballGlow]);
      this.root.add(this.fxSprites);
      this.root.add(this.fxFlares);
      this.root.add(Object.values(this.emitters));
      this.root.add(this.fxG);

      this.buildUi(px);
    }

    buildUi() {
      // Plates first, then the highlight layer, then every label. Depth is
      // stamped on all three so pooled UI can never render out of order.
      this.topPlate = this.add.image(TOPBAR.x, TOPBAR.y, 'rr-bar').setOrigin(0, 0).setDisplaySize(TOPBAR.w, TOPBAR.h).setDepth(18);
      this.footPlate = this.add.image(FOOTBAR.x, FOOTBAR.y, 'rr-bar').setOrigin(0, 0).setDisplaySize(FOOTBAR.w, FOOTBAR.h).setDepth(18);
      this.resultPlate = this.add.image(CARD_RECT.x, CARD_RECT.y, 'rr-card').setOrigin(0, 0).setDisplaySize(CARD_RECT.w, CARD_RECT.h).setDepth(18).setVisible(false);
      this.careerPlate = this.add.image(CAREER_RECT.x, CAREER_RECT.y, 'rr-card').setOrigin(0, 0).setDisplaySize(CAREER_RECT.w, CAREER_RECT.h).setDepth(18).setVisible(false);
      this.uiG = this.add.graphics().setDepth(20);
      this.wipeG = this.add.graphics().setDepth(30);

      const base = { fontFamily: 'Trebuchet MS, Verdana, sans-serif', color: '#eafff7', fontSize: '26px', fontStyle: 'bold', resolution: DPR };
      const dim = { ...base, color: '#a8ccc5', fontStyle: 'normal' };
      const label = (x, y, value, style) => {
        const text = this.add.text(x, y, value, style || base).setDepth(22);
        text._rrKey = `${x}:${y}:${(style || base).fontSize}`;
        return text;
      };
      this.labels = {
        hole: label(68, 46, '01/18', { ...base, fontSize: '30px' }).setOrigin(0.5, 0.5),
        score: label(786, 46, '0', { ...base, fontSize: '34px', color: '#ffffff' }).setOrigin(0.5, 0.5),
        par: label(846, 47, 'P3', { ...base, fontSize: '26px', color: '#ffd978' }).setOrigin(0.5, 0.5),
        pickups: label(944, 46, '⚡2 ○1 ◇1', { ...base, fontSize: '25px', color: '#ffe9a8' }).setOrigin(0.5, 0.5),
        rival: label(1236, 96, '', { ...base, fontSize: '22px', color: '#9fd8ff' }).setOrigin(1, 0),
        tutorial: label(640, 97, '', { ...dim, fontSize: '25px', color: '#c6f0e2', align: 'center' }).setOrigin(0.5, 0),
        toast: label(1096, 100, '', { ...base, fontSize: '25px', color: '#ffd978', align: 'center' }).setOrigin(0.5, 0),
        resultTitle: label(640, 214, '', { ...base, fontSize: '36px' }).setOrigin(0.5, 0.5),
        resultCopy: label(640, 268, '', { ...dim, fontSize: '25px', color: '#bfe3da', align: 'center' }).setOrigin(0.5, 0.5),
        resultStats: label(640, 330, '', { ...base, fontSize: '28px', color: '#ffd978', align: 'center' }).setOrigin(0.5, 0.5),
        resultExtra: label(640, 372, '', { ...dim, fontSize: '24px', color: '#9fd8ff', align: 'center' }).setOrigin(0.5, 0.5),
        resultAction: label(640, 438, '', { ...base, fontSize: '26px', color: '#062018', align: 'center' }).setOrigin(0.5, 0.5),
        careerHint: label(640, 619, '', { fontFamily: 'Trebuchet MS, Verdana, sans-serif', color: '#a8ccc5', fontSize: '24px', resolution: DPR }).setOrigin(0.5, 0.5),
        careerTitle: label(640, 132, 'CAREER CARD', { ...base, fontSize: '34px', color: '#8cf4d1', align: 'center' }).setOrigin(0.5, 0.5)
      };
      TOP_BUTTONS.forEach((button) => {
        this.labels[`btn-${button.id}`] = label(button.x + button.w / 2, 46, button.label, { ...base, fontSize: '26px', align: 'center' }).setOrigin(0.5, 0.5);
      });
      FOOT_BUTTONS.forEach((button) => {
        const glyph = button.id === 'settings' || button.id === 'restart' || button.id === 'pause';
        this.labels[`btn-${button.id}`] = label(button.x + button.w / 2, 688, button.label, { ...base, fontSize: glyph ? '30px' : '25px', align: 'center', color: '#d3f2e9' }).setOrigin(0.5, 0.5);
      });
      this.careerLines = [];
      for (let i = 0; i < 16; i++) {
        const column = i < 8 ? 0 : 1;
        const row = i % 8;
        this.careerLines.push(label(196 + column * 480, 190 + row * 52, '', { ...dim, fontFamily: 'Menlo, Consolas, "Courier New", monospace', fontSize: '24px', color: '#cfeee6' }).setOrigin(0, 0.5).setVisible(false));
      }
      this.labels.careerTitle.setVisible(false);
      this.labels.careerHint.setVisible(false);
      ['resultTitle', 'resultCopy', 'resultStats', 'resultExtra', 'resultAction'].forEach((key) => this.labels[key].setVisible(false));
    }

    /* ------------------------------------------------- baked course art */
    paintCourseCanvas(style, hole) {
      const ctx = this.courseCtx;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, GAME_W, GAME_H);
      const boardW = BOARD.right - BOARD.left, boardH = BOARD.bottom - BOARD.top;
      const playW = PLAY.right - PLAY.left, playH = PLAY.bottom - PLAY.top;

      // Board frame: layered gradient, rim light, machined edge.
      const frame = ctx.createLinearGradient(BOARD.left, BOARD.top, BOARD.right, BOARD.bottom);
      frame.addColorStop(0, rgbaOf(mixHex(style.base, 0xffffff, 0.16), 0.99));
      frame.addColorStop(0.42, rgbaOf(style.base, 0.99));
      frame.addColorStop(1, rgbaOf(mixHex(style.base, 0x000000, 0.42), 0.99));
      roundRectPath(ctx, BOARD.left, BOARD.top, boardW, boardH, 30);
      ctx.fillStyle = frame; ctx.fill();
      ctx.strokeStyle = rgbaOf(style.surface, 0.34); ctx.lineWidth = 2.4; ctx.stroke();
      noisePass(ctx, BOARD.left, BOARD.top, boardW, boardH, 0.1, 'overlay');

      // Playfield: translucent so the parallax ground layers read through.
      ctx.save();
      roundRectPath(ctx, PLAY.left, PLAY.top, playW, playH, 24);
      ctx.clip();
      const floor = ctx.createLinearGradient(PLAY.left, PLAY.top, PLAY.right, PLAY.bottom);
      floor.addColorStop(0, rgbaOf(mixHex(style.floor, 0xffffff, 0.2), 0.78));
      floor.addColorStop(0.46, rgbaOf(style.floor, 0.68));
      floor.addColorStop(1, rgbaOf(mixHex(style.floor, 0x000000, 0.4), 0.8));
      ctx.fillStyle = floor; ctx.fillRect(PLAY.left, PLAY.top, playW, playH);
      const key = ctx.createRadialGradient(PLAY.left + playW * 0.36, PLAY.top + playH * 0.3, 20, PLAY.left + playW * 0.4, PLAY.top + playH * 0.36, playW * 0.72);
      key.addColorStop(0, rgbaOf(mixHex(style.surface, 0xffffff, 0.5), 0.2));
      key.addColorStop(0.55, rgbaOf(style.surface, 0.05));
      key.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = key; ctx.fillRect(PLAY.left, PLAY.top, playW, playH);
      // Mown stripes: two frequencies, alternating luminance.
      for (let x = PLAY.left; x < PLAY.right; x += 84) {
        ctx.fillStyle = rgbaOf(mixHex(style.floor, 0xffffff, 0.5), 0.055);
        ctx.fillRect(x, PLAY.top, 42, playH);
      }
      ctx.strokeStyle = rgbaOf(style.line, 0.06); ctx.lineWidth = 1;
      for (let x = PLAY.left + 21; x < PLAY.right; x += 42) { ctx.beginPath(); ctx.moveTo(x, PLAY.top); ctx.lineTo(x, PLAY.bottom); ctx.stroke(); }
      for (let y = PLAY.top + 21; y < PLAY.bottom; y += 42) { ctx.beginPath(); ctx.moveTo(PLAY.left, y); ctx.lineTo(PLAY.right, y); ctx.stroke(); }
      if (hole) this.paintHoleContent(ctx, style, hole);
      noisePass(ctx, PLAY.left, PLAY.top, playW, playH, 0.13, 'overlay');
      // Inner vignette keeps the eye on the lane.
      const vignette = ctx.createRadialGradient(640, 400, playH * 0.32, 640, 400, playW * 0.66);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(2,7,10,0.5)');
      ctx.fillStyle = vignette; ctx.fillRect(PLAY.left, PLAY.top, playW, playH);
      ctx.restore();

      ctx.strokeStyle = rgbaOf(style.line, 0.3); ctx.lineWidth = 2;
      roundRectPath(ctx, PLAY.left, PLAY.top, playW, playH, 24); ctx.stroke();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    paintHoleContent(ctx, style, hole) {
      // Ground flecks
      for (let i = 0; i < hole.stars.length; i++) {
        const star = hole.stars[i];
        ctx.fillStyle = rgbaOf(mixHex(style.line, 0xffffff, 0.3), star.a * 0.8);
        ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, TAU); ctx.fill();
      }
      // Suggested route
      ctx.strokeStyle = rgbaOf(style.accent, 0.2);
      ctx.lineWidth = 2.4; ctx.setLineDash([10, 10]);
      ctx.beginPath();
      hole.altWaypoints.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke(); ctx.setLineDash([]);

      const zone = (rect, top, bottom, rim, detail) => {
        roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 14);
        const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w * 0.3, rect.y + rect.h);
        g.addColorStop(0, top); g.addColorStop(0.55, bottom); g.addColorStop(1, rim);
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = rim; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.save(); roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 14); ctx.clip();
        detail(rect);
        noisePass(ctx, rect.x, rect.y, rect.w, rect.h, 0.2, 'overlay');
        ctx.restore();
      };
      hole.sand.forEach((rect) => zone(rect,
        rgbaOf(mixHex(PAL.sand, 0xffffff, 0.5), 0.62), rgbaOf(PAL.sand, 0.44), rgbaOf(mixHex(PAL.sand, 0x000000, 0.3), 0.72),
        (r) => {
          ctx.strokeStyle = rgbaOf(mixHex(PAL.sand, 0xffffff, 0.6), 0.24); ctx.lineWidth = 2;
          for (let y = r.y + 8; y < r.y + r.h; y += 13) {
            ctx.beginPath();
            for (let x = r.x; x < r.x + r.w; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.09 + y * 0.2) * 3);
            ctx.stroke();
          }
        }));
      hole.ice.forEach((rect) => zone(rect,
        rgbaOf(0xffffff, 0.5), rgbaOf(PAL.ice, 0.34), rgbaOf(mixHex(PAL.ice, 0x1b4f66, 0.5), 0.8),
        (r) => {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.6;
          for (let i = 0; i < 7; i++) {
            const x = r.x + (i * 41) % r.w;
            ctx.beginPath(); ctx.moveTo(x, r.y); ctx.lineTo(x + 26, r.y + r.h * 0.5); ctx.lineTo(x - 6, r.y + r.h); ctx.stroke();
          }
        }));
      hole.water.forEach((rect) => zone(rect,
        rgbaOf(mixHex(PAL.water, 0xffffff, 0.42), 0.6), rgbaOf(PAL.water, 0.5), rgbaOf(mixHex(PAL.water, 0x04202c, 0.55), 0.86),
        (r) => {
          for (let i = 0; i < 5; i++) {
            const y = r.y + 12 + i * (r.h - 20) / 4;
            const g = ctx.createLinearGradient(r.x, y, r.x + r.w, y);
            g.addColorStop(0, 'rgba(255,255,255,0)');
            g.addColorStop(0.5, 'rgba(230,255,255,0.34)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.strokeStyle = g; ctx.lineWidth = 2.4;
            ctx.beginPath();
            for (let x = r.x; x < r.x + r.w; x += 10) ctx.lineTo(x, y + Math.sin(x * 0.07 + i) * 2.6);
            ctx.stroke();
          }
        }));

      hole.boosts.forEach((pad) => {
        roundRectPath(ctx, pad.x, pad.y, pad.w, pad.h, 9);
        const g = ctx.createLinearGradient(pad.x, pad.y, pad.x + pad.w, pad.y + pad.h);
        g.addColorStop(0, 'rgba(255,240,190,0.5)');
        g.addColorStop(0.5, rgbaOf(PAL.yellow, 0.3));
        g.addColorStop(1, 'rgba(190,120,40,0.5)');
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = rgbaOf(PAL.yellow, 0.9); ctx.lineWidth = 2.2; ctx.stroke();
        const cx = pad.x + pad.w / 2, cy = pad.y + pad.h / 2;
        ctx.fillStyle = 'rgba(255,252,232,0.95)';
        ctx.beginPath();
        ctx.moveTo(cx - pad.dir.x * 20 - pad.dir.y * 10, cy - pad.dir.y * 20 + pad.dir.x * 10);
        ctx.lineTo(cx + pad.dir.x * 21, cy + pad.dir.y * 21);
        ctx.lineTo(cx - pad.dir.x * 20 + pad.dir.y * 10, cy - pad.dir.y * 20 - pad.dir.x * 10);
        ctx.closePath(); ctx.fill();
      });

      // Walls with a cast shadow, a lit body and a specular top edge.
      const walls = hole.walls;
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < walls.length; i++) {
          const seg = walls[i];
          const rail = seg.kind === 'rail';
          ctx.lineCap = 'round';
          if (pass === 0) {
            ctx.strokeStyle = 'rgba(2,8,11,0.55)'; ctx.lineWidth = rail ? 13 : 15;
            ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1 + 6); ctx.lineTo(seg.x2, seg.y2 + 6); ctx.stroke();
          } else if (pass === 1) {
            const g = ctx.createLinearGradient(seg.x1, seg.y1 - 8, seg.x2 + 1, seg.y2 + 8);
            const body = rail ? style.line : style.accent;
            g.addColorStop(0, rgbaOf(mixHex(body, 0xffffff, 0.55), 0.98));
            g.addColorStop(0.5, rgbaOf(body, 0.96));
            g.addColorStop(1, rgbaOf(mixHex(body, 0x000000, 0.45), 0.96));
            ctx.strokeStyle = g; ctx.lineWidth = rail ? 7 : 9;
            ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
          } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.34)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1 - 2.5); ctx.lineTo(seg.x2, seg.y2 - 2.5); ctx.stroke();
          }
        }
      }
      ctx.lineCap = 'butt';

      // Cup: deep well, rim light, flag with a gradient cloth.
      const cup = hole.cup;
      const well = ctx.createRadialGradient(cup.x - 4, cup.y - 5, 1, cup.x, cup.y, cup.r + 6);
      well.addColorStop(0, '#000000');
      well.addColorStop(0.62, 'rgba(4,12,16,0.96)');
      well.addColorStop(1, rgbaOf(mixHex(style.floor, 0x000000, 0.25), 0.9));
      ctx.fillStyle = well; ctx.beginPath(); ctx.arc(cup.x, cup.y, cup.r + 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgbaOf(PAL.yellow, 0.95); ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.arc(cup.x, cup.y, cup.r + 3, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cup.x, cup.y, cup.r + 7, Math.PI * 1.05, Math.PI * 1.9); ctx.stroke();
      const pole = ctx.createLinearGradient(cup.x, cup.y - 62, cup.x + 4, cup.y);
      pole.addColorStop(0, '#ffffff'); pole.addColorStop(1, rgbaOf(PAL.yellow, 0.7));
      ctx.strokeStyle = pole; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(cup.x + 2, cup.y - 2); ctx.lineTo(cup.x + 2, cup.y - 62); ctx.stroke();
      const cloth = ctx.createLinearGradient(cup.x + 4, cup.y - 60, cup.x + 40, cup.y - 40);
      cloth.addColorStop(0, rgbaOf(mixHex(style.accent, 0xffffff, 0.4), 0.98));
      cloth.addColorStop(1, rgbaOf(mixHex(style.accent, 0x000000, 0.35), 0.94));
      ctx.fillStyle = cloth;
      ctx.beginPath(); ctx.moveTo(cup.x + 4, cup.y - 60); ctx.lineTo(cup.x + 40, cup.y - 49); ctx.lineTo(cup.x + 4, cup.y - 38); ctx.closePath(); ctx.fill();
    }

    rebakeCourse() {
      const style = STYLES[this.course && this.course.family.style] || STYLES.garden;
      this.paintCourseCanvas(style, this.hole);
      if (this.courseTex && typeof this.courseTex.refresh === 'function') this.courseTex.refresh();
    }

    applyStyleTiles() {
      const styleId = (this.course && this.course.family.style) || 'garden';
      const keys = TEX.style(this, styleId);
      this.styleTiles = keys;
      this.tileFar.setTexture(keys.far); this.tileFar.tileScaleX = 1 / DPR; this.tileFar.tileScaleY = 1 / DPR;
      this.tileMid.setTexture(keys.mid); this.tileMid.tileScaleX = 1 / DPR; this.tileMid.tileScaleY = 1 / DPR;
      this.tileNear.setTexture(keys.near); this.tileNear.tileScaleX = 1 / DPR; this.tileNear.tileScaleY = 1 / DPR;
    }

    /* ------------------------------------------------------ course flow */
    startCourse(index, mode, holeIndex) {
      this.mode = MODE_NAMES[mode] ? mode : 'tour';
      let familyIndex = clamp(Math.floor(Number(index) || 0), 0, COURSE_FAMILIES.length - 1);
      if (this.mode === 'championship') familyIndex = 4;
      const family = getFamily(familyIndex);
      this.courseIndex = family.index;
      if (this.mode === 'trick') this.course = buildChallengeCourse();
      else if (this.mode === 'seeded') this.course = buildCourse(family, 'seeded');
      else this.course = buildAuthoredCourse(family, this.mode);
      this.inventory = { power: 2, gimme: 1, forgive: 1 };
      this.userPaused = false;
      this.careerOpen = false;
      this.phase = 'play';
      this.hideResult();
      this.applyStyleTiles();
      this.holeIndex = clamp(Math.floor(Number(holeIndex) || 0), 0, this.course.holes.length - 1);
      this.startHole(this.holeIndex);
    }

    resetHoleMutableState(hole) {
      hole.shotCount = 0;
      for (let i = 0; i < hole.pickups.length; i++) hole.pickups[i].taken = false;
      for (let i = 0; i < hole.boosts.length; i++) hole.boosts[i].cooldown = 0;
      for (let i = 0; i < hole.portals.length; i++) hole.portals[i].cooldown = 0;
    }

    startHole(index) {
      if (!this.course || !this.course.holes[index]) return;
      this.holeIndex = clamp(index, 0, this.course.holes.length - 1);
      this.course.scores[this.holeIndex] = null;
      this.hole = this.course.holes[this.holeIndex];
      this.resetHoleMutableState(this.hole);
      this.panOffset.x = 0;
      this.panOffset.y = 0;
      this.gateRuntime = this.hole.gates.map(() => ({ x1: 0, y1: 0, x2: 0, y2: 0, kind: 'gate' }));
      this.ball = {
        x: this.hole.start.x, y: this.hole.start.y, vx: 0, vy: 0, r: 14, moving: false, shotTime: 0,
        boostCooldown: 0, gimmickCooldown: 0, portalCooldown: 0, spin: 0, air: 0, airMax: 0, height: 0
      };
      this.ballVisualState = 'idle';
      this.ballRoll = 0;
      this.settleTimer = 0;
      this.aim.dir = unit(this.hole.cup.x - this.ball.x, this.hole.cup.y - this.ball.y);
      this.aim.power = 0;
      this.aim.pull = 0;
      this.aim.active = false;
      this.shotOrigin.x = this.ball.x;
      this.shotOrigin.y = this.ball.y;
      this.bouncedThisShot = false;
      this.lastTrickReject = -1;
      this.phase = 'play';
      this.holeStats = this.freshHoleStats();
      this.celebrate.timer = 0;
      this.clearFx();
      this.layoutHoleSprites();
      this.rebakeCourse();
      this.startRival();
      this.tutorialStep = progress.tutorialSeen ? 4 : this.tutorialStep;
      this.transient.timer = 0;
      this.transientQueue.length = 0;
      this.tutorialTimer = this.tutorialStep < 4 ? 3.2 : 0;
      this.briefText = this.hole.challenge ? `${this.hole.challenge.name} — ${this.hole.challenge.copy}`.replace('—', '//') : '';
      this.briefTimer = this.briefText ? 4.2 : 0;
      this.syncState();
    }

    layoutHoleSprites() {
      const style = STYLES[this.course.family.style] || STYLES.garden;
      this.bumperSprites.forEach((sprite, i) => {
        const bumper = this.hole.bumpers[i];
        if (!bumper) { sprite.setVisible(false); return; }
        sprite.setVisible(true).setPosition(bumper.x, bumper.y).setDisplaySize(bumper.r * 2.6, bumper.r * 2.6);
        sprite.setTint(mixHex(PAL.violet, style.accent, 0.25));
      });
      this.moverSprites.forEach((sprite, i) => {
        const mover = this.hole.movers[i];
        if (!mover) { sprite.setVisible(false); return; }
        sprite.setVisible(true).setDisplaySize(mover.r * 2.9, mover.r * 2.9).setPosition(mover.x, mover.y);
      });
      this.portalSprites.forEach((sprite, i) => {
        const portal = this.hole.portals[0];
        if (!portal) { sprite.setVisible(false); return; }
        sprite.setVisible(true).setDisplaySize(portal.r * 3, portal.r * 3);
        sprite.setPosition(i === 0 ? portal.ax : portal.bx, i === 0 ? portal.ay : portal.by);
        sprite.setTint(i === 0 ? 0x8cf4d1 : 0xc1a1ff);
      });
      this.pickupSprites.forEach((sprite, i) => {
        const pickup = this.hole.pickups[i];
        if (!pickup) { sprite.setVisible(false); return; }
        sprite.setTexture(pickup.type === 'power' ? 'rr-pk-power' : pickup.type === 'gimme' ? 'rr-pk-gimme' : 'rr-pk-forgive');
        sprite.setDisplaySize(44, 44).setPosition(pickup.x, pickup.y).setVisible(true);
      });
      this.cupRing.setPosition(this.hole.cup.x, this.hole.cup.y);
      const gim = this.hole.gimmickPoint;
      const behavior = GIMMICK_REGISTRY[this.hole.gimmick];
      const tint = !behavior ? style.accent
        : behavior.visual === 'ice' || behavior.visual === 'crystal' || behavior.visual === 'freeze' ? PAL.ice
          : behavior.visual === 'sand' || behavior.visual === 'sandglass' ? PAL.sand
            : behavior.visual === 'water' ? PAL.water
              : behavior.visual === 'crown' || behavior.visual === 'combo' || behavior.visual === 'champion' ? PAL.coral : style.accent;
      [this.gimGlow, this.gimRingA, this.gimRingB].forEach((sprite) => { sprite.setPosition(gim.x, gim.y).setTint(tint); });
      this.gimGlow.setDisplaySize(gim.r * 2.4, gim.r * 2.4).setAlpha(0.18);
      this.gimRingA.setDisplaySize(gim.r * 2.05, gim.r * 2.05).setAlpha(0.5);
      this.gimRingB.setDisplaySize(gim.r * 1.2, gim.r * 1.2).setAlpha(0.38);
    }

    /* --------------------------------------------------------- rival AI */
    startRival() {
      const skill = clamp(0.34 + this.courseIndex * 0.13 + (this.mode === 'championship' ? 0.24 : 0) + (this.hole.index > 11 ? 0.06 : 0), 0.3, 0.95);
      this.rival = {
        skill, strokes: 0, finished: false, planner: null, from: { x: this.hole.start.x, y: this.hole.start.y },
        ghost: { path: null, t: 0, wait: 0.6 }
      };
    }

    tickRival(dt) {
      const rival = this.rival;
      if (!rival || rival.finished || this.phase !== 'play') return;
      if (!rival.planner) rival.planner = makeRivalPlanner(this.hole, rival.from, rival.skill);
      if (!rival.planner.done) {
        rival.planner.tick(3);
        return;
      }
      const result = rival.planner.result;
      rival.planner = null;
      rival.strokes += 1;
      if (!result) { rival.finished = true; return; }
      if (result.path && result.path.length >= 4) { rival.ghost.path = result.path; rival.ghost.t = 0; rival.ghost.wait = 0.35; }
      if (result.out.sunk) { rival.finished = true; rival.from = { x: this.hole.cup.x, y: this.hole.cup.y }; return; }
      rival.from = result.out.wet ? { x: this.hole.start.x, y: this.hole.start.y } : { x: result.out.x, y: result.out.y };
      if (result.out.wet) rival.strokes += 1;
      if (rival.strokes >= this.hole.par + 4) rival.finished = true;
    }

    updateGhost(dt) {
      const rival = this.rival;
      if (!rival || !rival.ghost.path || !motionEnabled()) { this.ghost.setAlpha(0); return; }
      const path = rival.ghost.path;
      const points = path.length / 2;
      if (rival.ghost.wait > 0) { rival.ghost.wait -= dt; this.ghost.setAlpha(0); return; }
      rival.ghost.t += dt * 26;
      if (rival.ghost.t >= points - 1) { rival.ghost.t = 0; rival.ghost.wait = 1.4; }
      const i = Math.floor(rival.ghost.t), f = rival.ghost.t - i;
      const ax = path[i * 2], ay = path[i * 2 + 1];
      const bx = path[Math.min(points - 1, i + 1) * 2], by = path[Math.min(points - 1, i + 1) * 2 + 1];
      this.ghost.setPosition(lerp(ax, bx, f), lerp(ay, by, f));
      this.ghost.setAlpha(0.3);
    }

    /* ----------------------------------------------------- kit lifecycle */
    restartFromKit() {
      this.pointerClaims.clear();
      this.gestures.clear();
      this.panLast = null;
      this.previousKeys.clear();
      this.userPaused = false;
      this.careerOpen = false;
      kit.audio.resume();
      if (this.course) this.startHole(this.holeIndex);
    }

    onKitPause() {
      this.accumulator = 0;
      this.pointerClaims.clear();
      this.gestures.clear();
      this.panLast = null;
      this.aim.active = false;
      this.previousKeys.clear();
    }

    onKitResume() { this.accumulator = 0; }

    applyForceSwitches() {
      if (!this.course) return;
      if (requestedCourse != null && requestedCourse !== this.lastForcedCourse) {
        const family = getFamily(requestedCourse);
        this.lastForcedCourse = requestedCourse;
        this.startCourse(family.index, family.index === 4 ? 'championship' : (this.mode === 'trick' ? 'tour' : this.mode), 0);
      }
      if (requestedHole != null && requestedHole !== this.lastForcedHole) {
        const raw = Number(requestedHole);
        const max = this.course.holes.length - 1;
        const index = raw >= 1 ? clamp(Math.floor(raw) - 1, 0, max) : clamp(Math.floor(raw), 0, max);
        this.lastForcedHole = requestedHole;
        this.startHole(index);
      }
    }

    /* ------------------------------------------------------------- loop */
    update(_time, delta) {
      this.applyForceSwitches();
      this.pollInput();
      const frozenByUi = this.userPaused || this.careerOpen;
      if (!kit.paused && !frozenByUi) {
        const frameDelta = clamp(Number(delta) / 1000 || 0, 0, 0.12);
        this.accumulator += frameDelta;
        const juice = kit.juice.frame();
        let steps = 0;
        if (juice.frozen) {
          this.accumulator = 0;
        } else {
          while (this.accumulator >= STEP && steps < MAX_STEPS) {
            this.stepSim(STEP);
            this.accumulator -= STEP;
            steps += 1;
          }
          if (steps >= MAX_STEPS && this.accumulator >= STEP) this.accumulator = 0;
        }
        this.cameraKick.x = juice.dx;
        this.cameraKick.y = juice.dy;
      } else {
        this.accumulator = 0;
        this.cameraKick.x = 0;
        this.cameraKick.y = 0;
      }
      this.render();
    }

    stepSim(dt) {
      this.simTime += dt;
      this.tickTransition(dt);
      if (this.transient.timer > 0) {
        this.transient.timer = Math.max(0, this.transient.timer - dt);
        if (this.transient.timer === 0) this.startNextTransient();
      } else {
        this.startNextTransient();
      }
      if (this.tutorialTimer > 0) this.tutorialTimer = Math.max(0, this.tutorialTimer - dt);
      if (this.briefTimer > 0) this.briefTimer = Math.max(0, this.briefTimer - dt);
      if (this.celebrate.timer > 0) this.celebrate.timer = Math.max(0, this.celebrate.timer - dt);
      this.updateParticles(dt);
      this.updateFxSprites(dt);
      this.updateGhost(dt);
      if (this.phase !== 'play') { this.syncState(); return; }
      this.tickRival(dt);
      this.hole.gates.forEach((gate, i) => {
        const out = this.gateRuntime[i];
        const travel = Math.sin(this.simTime * gate.speed + gate.phase) * gate.amp;
        if (gate.axis === 'x') { out.x1 = gate.x + travel; out.y1 = gate.y; out.x2 = gate.x + gate.length + travel; out.y2 = gate.y; }
        else { out.x1 = gate.x; out.y1 = gate.y + travel; out.x2 = gate.x; out.y2 = gate.y + gate.length + travel; }
      });
      for (let i = 0; i < this.hole.movers.length; i++) {
        const mover = this.hole.movers[i];
        const t = 0.5 + 0.5 * Math.sin(this.simTime * mover.speed + mover.phase);
        const nx = lerp(mover.x1, mover.x2, t), ny = lerp(mover.y1, mover.y2, t);
        mover.vx = (nx - mover.x) / dt; mover.vy = (ny - mover.y) / dt;
        mover.x = nx; mover.y = ny;
      }
      if (!this.ball.moving) { this.syncState(); return; }
      this.ball.shotTime += dt;
      this.ball.boostCooldown = Math.max(0, this.ball.boostCooldown - dt);
      this.ball.gimmickCooldown = Math.max(0, this.ball.gimmickCooldown - dt);
      this.ball.portalCooldown = Math.max(0, this.ball.portalCooldown - dt);
      for (let i = 0; i < this.hole.boosts.length; i++) this.hole.boosts[i].cooldown = Math.max(0, this.hole.boosts[i].cooldown - dt);
      const airborne = this.ball.air > 0;
      if (!airborne) this.applyGimmick(dt);
      if (this.ball.spin !== 0 && !airborne) {
        const angle = this.ball.spin * dt;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const vx = this.ball.vx * cos - this.ball.vy * sin;
        const vy = this.ball.vx * sin + this.ball.vy * cos;
        this.ball.vx = vx; this.ball.vy = vy;
        this.ball.spin *= Math.pow(0.42, dt);
        if (Math.abs(this.ball.spin) < 0.05) this.ball.spin = 0;
      }
      const beforeX = this.ball.x, beforeY = this.ball.y;
      this.ball.x += this.ball.vx * dt;
      this.ball.y += this.ball.vy * dt;
      const travelled = hypot(this.ball.x - beforeX, this.ball.y - beforeY);
      this.ballRoll += travelled / this.ball.r * (this.ball.vx >= 0 ? 1 : -1) * 0.55;
      this.addTrail(beforeX, beforeY, this.ball.vx, this.ball.vy);
      if (airborne) {
        this.ball.air = Math.max(0, this.ball.air - dt);
        const progress = 1 - this.ball.air / Math.max(0.0001, this.ball.airMax);
        this.ball.height = Math.sin(Math.PI * clamp(progress, 0, 1)) * 54;
        this.ball.vx *= Math.pow(0.94, dt);
        this.ball.vy *= Math.pow(0.94, dt);
        this.collideBall();
        if (this.ball.air === 0) this.landChip();
        this.syncState();
        return;
      }
      this.ball.height = 0;
      const impact = this.collideBall();
      if (impact) {
        this.bouncedThisShot = true;
        this.holeStats.bounces += 1;
        this.ball.spin *= 0.5;
        const color = impact === 'gate' ? PAL.yellow : impact === 'mover' ? PAL.coral : impact === 'bumper' ? PAL.violet : PAL.mint;
        this.spawnImpact(this.ball.x, this.ball.y, color, impact === 'bumper' ? 12 : 8);
        cue(impact === 'gate' ? 'gate-impact' : 'impact');
        juiceShake(impact === 'bumper' ? 4 : 2.4, impact === 'bumper' ? 100 : 70);
        juiceStop(impact === 'bumper' ? 24 : 12);
        if (impact === 'mover') this.holeStats.moverHits += 1;
        if (this.tutorialStep === 2) this.advanceTutorial();
      }
      this.checkPortals();
      this.applySurfaceDrag(dt);
      this.emitRollFeedback(dt);
      this.checkBoosts();
      this.checkPickups();
      if (this.checkWater()) return;
      if (this.hole.shotCount >= STROKE_CAP) {
        this.ball.moving = false;
        this.finishHole(true);
        return;
      }
      const speed = hypot(this.ball.vx, this.ball.vy);
      const nearCup = distance(this.ball, this.hole.cup) < this.hole.cup.r + this.ball.r + 5;
      const gimmeAssist = nearCup && speed >= 600 && this.inventory.gimme > 0;
      if (nearCup && speed < 600) {
        if (this.mode === 'trick' && !this.bouncedThisShot && this.requiresBounce()) { this.rejectTrickSink(); return; }
        this.sinkBall();
        return;
      }
      if (gimmeAssist) {
        if (this.mode === 'trick' && !this.bouncedThisShot && this.requiresBounce()) { this.rejectTrickSink(); return; }
        this.inventory.gimme -= 1;
        this.showToast('GIMME', 0.7);
        this.sinkBall();
        return;
      }
      // Settle guard. A ball nudged forever by a moving gate, or trapped in
      // a corner where the >1 restitution kept topping it back up, used to
      // hold the shot open indefinitely and soft-lock the hole.
      if (speed > 1400) {
        const scale = 1400 / speed;
        this.ball.vx *= scale; this.ball.vy *= scale;
      }
      this.settleTimer = speed < 34 ? this.settleTimer + dt : 0;
      if (speed < 16 && this.ball.shotTime > 0.18) this.stopBall();
      else if (this.settleTimer > 0.8 || this.ball.shotTime > 15) this.stopBall();
      this.syncState();
    }

    requiresBounce() {
      const challenge = this.hole && this.hole.challenge;
      if (!challenge) return true;
      return challenge.id === 'ts-bank2' || challenge.id === 'ts-bank4' || challenge.id === 'ts-crown';
    }

    landChip() {
      this.ball.height = 0;
      this.spawnDust(this.ball.x, this.ball.y, this.surfaceAt(this.ball.x, this.ball.y), 10);
      cue('impact');
      juiceShake(3, 90);
      this.showToast('LANDED', 0.5);
    }

    surfaceAt(x, y) {
      for (let i = 0; i < this.hole.water.length; i++) if (pointInRect(this.hole.water[i], x, y)) return 'water';
      for (let i = 0; i < this.hole.sand.length; i++) if (pointInRect(this.hole.sand[i], x, y)) return 'sand';
      for (let i = 0; i < this.hole.ice.length; i++) if (pointInRect(this.hole.ice[i], x, y)) return 'ice';
      return 'grass';
    }

    emitRollFeedback(dt) {
      const speed = hypot(this.ball.vx, this.ball.vy);
      if (speed < 40) return;
      const surface = this.surfaceAt(this.ball.x, this.ball.y);
      this.dustTimer -= dt;
      if (this.dustTimer <= 0 && motionEnabled()) {
        this.dustTimer = surface === 'sand' ? 0.035 : 0.075;
        this.spawnDust(this.ball.x, this.ball.y, surface, surface === 'sand' ? 3 : 1);
      }
      this.rollCueTimer -= dt;
      if (this.rollCueTimer <= 0) {
        this.rollCueTimer = surface === 'ice' ? 0.5 : 0.34;
        if (kit && kit.audio) kit.audio.sfx('impact', { volume: clamp(speed / 2600, 0.04, 0.16), rate: surface === 'ice' ? 1.6 : surface === 'sand' ? 0.62 : 1.05 });
      }
    }

    spawnDust(x, y, surface, count) {
      const color = surface === 'sand' ? PAL.sand : surface === 'ice' ? PAL.ice : surface === 'water' ? PAL.water : (STYLES[this.course.family.style] || STYLES.garden).dust;
      const amount = motionEnabled() ? count : Math.max(1, Math.floor(count * 0.3));
      this.emitters.dust.setParticleTint(color);
      this.emitParticles('dust', x, y, amount);
      for (let i = 0; i < amount; i++) this.spawnParticle(x, y, color, 3, 22 + (i % 4) * 12, 0.34 + (i % 3) * 0.06, 2 + (i % 2), 0.86);
    }

    checkPortals() {
      if (this.ball.portalCooldown > 0) return;
      for (let i = 0; i < this.hole.portals.length; i++) {
        const portal = this.hole.portals[i];
        const nearA = hypot(this.ball.x - portal.ax, this.ball.y - portal.ay) < portal.r;
        const nearB = hypot(this.ball.x - portal.bx, this.ball.y - portal.by) < portal.r;
        if (!nearA && !nearB) continue;
        const from = nearA ? { x: portal.ax, y: portal.ay } : { x: portal.bx, y: portal.by };
        const to = nearA ? { x: portal.bx, y: portal.by } : { x: portal.ax, y: portal.ay };
        const dir = unit(this.ball.vx, this.ball.vy);
        this.spawnImpact(from.x, from.y, PAL.cyan, 14);
        this.ball.x = to.x + dir.x * (portal.r + this.ball.r + 4);
        this.ball.y = to.y + dir.y * (portal.r + this.ball.r + 4);
        this.ball.portalCooldown = 0.4;
        this.holeStats.portals += 1;
        bumpCareer('portalsUsed');
        this.spawnImpact(to.x, to.y, PAL.violet, 18);
        this.showToast('PORTAL', 0.6);
        cue('boost');
        juiceShake(4, 110);
        return;
      }
    }

    collideBall() {
      let impact = null;
      this.collectSegments();
      const airborne = this.ball.air > 0;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < this.segmentScratch.length; i++) {
          const seg = this.segmentScratch[i];
          if (airborne && seg.kind !== 'rail') continue;
          const closest = segmentPoint(seg, this.ball.x, this.ball.y);
          const dx = this.ball.x - closest.x, dy = this.ball.y - closest.y;
          const d = hypot(dx, dy);
          const radius = this.ball.r + (seg.kind === 'rail' ? 4 : 6);
          if (d >= radius) continue;
          const normal = d > 0.001 ? { x: dx / d, y: dy / d } : unit(-(seg.y2 - seg.y1), seg.x2 - seg.x1);
          this.ball.x = closest.x + normal.x * radius;
          this.ball.y = closest.y + normal.y * radius;
          const dot = this.ball.vx * normal.x + this.ball.vy * normal.y;
          if (dot < 0) {
            const bounce = seg.kind === 'gate' ? 0.98 : 1.015;
            this.reflectVelocity(normal, bounce);
            impact = seg.kind;
          }
        }
        if (airborne) continue;
        for (let i = 0; i < this.hole.bumpers.length; i++) {
          const bumper = this.hole.bumpers[i];
          const dx = this.ball.x - bumper.x, dy = this.ball.y - bumper.y;
          const d = hypot(dx, dy) || 1, radius = this.ball.r + bumper.r;
          if (d >= radius) continue;
          const nx = dx / d, ny = dy / d;
          this.ball.x = bumper.x + nx * radius;
          this.ball.y = bumper.y + ny * radius;
          const dot = this.ball.vx * nx + this.ball.vy * ny;
          if (dot < 0) { this.reflectVelocity({ x: nx, y: ny }, 1.09); impact = 'bumper'; }
        }
        for (let i = 0; i < this.hole.movers.length; i++) {
          const mover = this.hole.movers[i];
          const dx = this.ball.x - mover.x, dy = this.ball.y - mover.y;
          const d = hypot(dx, dy) || 1, radius = this.ball.r + mover.r;
          if (d >= radius) continue;
          const nx = dx / d, ny = dy / d;
          this.ball.x = mover.x + nx * radius;
          this.ball.y = mover.y + ny * radius;
          const dot = this.ball.vx * nx + this.ball.vy * ny;
          if (dot < 0) {
            this.reflectVelocity({ x: nx, y: ny }, 1.02);
            this.ball.vx += mover.vx * 0.35;
            this.ball.vy += mover.vy * 0.35;
            impact = 'mover';
          }
        }
      }
      return impact;
    }

    reflectVelocity(normal, restitution) {
      const dot = this.ball.vx * normal.x + this.ball.vy * normal.y;
      if (dot >= 0) return false;
      this.ball.vx = (this.ball.vx - 2 * dot * normal.x) * restitution;
      this.ball.vy = (this.ball.vy - 2 * dot * normal.y) * restitution;
      return true;
    }

    collectSegments() {
      this.segmentScratch.length = 0;
      for (let i = 0; i < this.hole.walls.length; i++) this.segmentScratch.push(this.hole.walls[i]);
      for (let i = 0; i < this.gateRuntime.length; i++) this.segmentScratch.push(this.gateRuntime[i]);
    }

    trajectoryHit(origin, dir, remaining) {
      let nearest = null;
      for (let i = 0; i < this.segmentScratch.length; i++) {
        const hit = raySegment(origin, dir, this.segmentScratch[i]);
        if (hit && hit.t > 8 && hit.t < remaining && (!nearest || hit.t < nearest.t)) nearest = hit;
      }
      for (let i = 0; i < this.hole.bumpers.length; i++) {
        const hit = rayCircle(origin, dir, this.hole.bumpers[i], this.hole.bumpers[i].r + this.ball.r);
        if (hit && hit.t > 8 && hit.t < remaining && (!nearest || hit.t < nearest.t)) nearest = hit;
      }
      return nearest;
    }

    previewInfluence(point, dir) {
      const behavior = GIMMICK_REGISTRY[this.hole.gimmick];
      const center = this.hole.gimmickPoint;
      if (!behavior || !center || distance(point, center) > center.r + 50) return dir;
      let next = { x: dir.x, y: dir.y };
      if (behavior.preview === 'pull') {
        const pull = unit(center.x - point.x, center.y - point.y);
        next = unit(dir.x * 0.82 + pull.x * 0.18, dir.y * 0.82 + pull.y * 0.18);
      } else if (behavior.preview === 'wind' || behavior.preview === 'drift') {
        next = unit(dir.x + (behavior.preview === 'wind' ? 0.1 : -0.08), dir.y + 0.12);
      } else if (behavior.preview === 'swirl') {
        next = unit(dir.x - dir.y * 0.16, dir.y + dir.x * 0.16);
      } else if (behavior.preview === 'bank' || behavior.preview === 'echo') {
        next = unit(-dir.y, dir.x);
      }
      return next;
    }

    applySurfaceDrag(dt) {
      let drag = 0.78;
      for (let i = 0; i < this.hole.ice.length; i++) if (pointInRect(this.hole.ice[i], this.ball.x, this.ball.y)) drag = 0.992;
      for (let i = 0; i < this.hole.sand.length; i++) if (pointInRect(this.hole.sand[i], this.ball.x, this.ball.y)) { drag = 0.37; this.holeStats.sandy += 1; }
      this.ball.vx *= Math.pow(drag, dt);
      this.ball.vy *= Math.pow(drag, dt);
    }

    applyGimmick(dt) {
      const type = this.hole.gimmick;
      const behavior = GIMMICK_REGISTRY[type];
      const center = this.hole.gimmickPoint;
      if (!behavior || !center) return;
      const dx = center.x - this.ball.x, dy = center.y - this.ball.y;
      const d = hypot(dx, dy);
      if (d > center.r) return;
      const falloff = clamp(1 - d / center.r, 0, 1);
      if (behavior.effect === 'pull') {
        const force = type === 'crownfall' ? 250 : type === 'arboretum' ? 86 : 138;
        this.ball.vx += dx / Math.max(1, d) * force * falloff * dt;
        this.ball.vy += dy / Math.max(1, d) * force * falloff * dt;
      } else if (behavior.effect === 'wind' || behavior.effect === 'drift') {
        const wind = behavior.effect === 'drift' ? { x: 86, y: -48 } : { x: 42, y: -72 };
        const phase = Math.sin(this.simTime * (type === 'sandglass' ? 2.1 : 1.2));
        this.ball.vx += (wind.x + phase * 34) * falloff * dt;
        this.ball.vy += (wind.y - phase * 22) * falloff * dt;
      } else if (behavior.effect === 'swirl') {
        this.ball.vx += -dy * 0.46 * falloff * dt;
        this.ball.vy += dx * 0.46 * falloff * dt;
      } else if (behavior.effect === 'ratchet' || behavior.effect === 'freeze' || behavior.effect === 'quicksand') {
        const drag = behavior.effect === 'freeze' ? 0.985 : behavior.effect === 'quicksand' ? 0.82 : 0.967;
        this.ball.vx *= Math.pow(drag, dt * 60 * falloff);
        this.ball.vy *= Math.pow(drag, dt * 60 * falloff);
      } else if (behavior.effect === 'bank' || behavior.effect === 'echo') {
        if (this.ball.gimmickCooldown <= 0) {
          const normal = behavior.effect === 'bank' ? unit(this.ball.x - center.x, this.ball.y - center.y) : unit(-dy, dx);
          const dot = this.ball.vx * normal.x + this.ball.vy * normal.y;
          this.ball.vx = (this.ball.vx - 2 * dot * normal.x) * (behavior.effect === 'bank' ? 1.06 : 0.94);
          this.ball.vy = (this.ball.vy - 2 * dot * normal.y) * (behavior.effect === 'bank' ? 1.06 : 0.94);
          this.ball.gimmickCooldown = 0.32;
          this.spawnImpact(this.ball.x, this.ball.y, behavior.effect === 'bank' ? PAL.ice : PAL.cyan, 8);
          cue('gate-impact');
        }
      } else if (behavior.effect === 'boost') {
        if (this.ball.gimmickCooldown <= 0) {
          const launch = unit(dx * 0.45 + this.ball.vx * 0.01, dy * 0.45 + this.ball.vy * 0.01);
          this.ball.vx += launch.x * (180 + falloff * 120);
          this.ball.vy += launch.y * (180 + falloff * 120);
          this.ball.gimmickCooldown = 0.42;
          this.spawnImpact(this.ball.x, this.ball.y, PAL.yellow, 10);
          cue('boost');
        }
      } else if (behavior.effect === 'oak') {
        this.ball.vx += Math.sin(this.simTime * 3.2) * 44 * falloff * dt;
        this.ball.vy += Math.cos(this.simTime * 2.7) * 38 * falloff * dt;
      } else if (behavior.effect === 'mirage') {
        this.ball.vx += Math.sin(this.simTime * 4.5) * 92 * falloff * dt;
        this.ball.vy += Math.cos(this.simTime * 3.8) * 36 * falloff * dt;
      } else if (behavior.effect === 'combo' || behavior.effect === 'champion') {
        this.ball.vx += (-dy * 0.3 + Math.sin(this.simTime * 3) * 24) * falloff * dt;
        this.ball.vy += (dx * 0.3 + Math.cos(this.simTime * 3.4) * 24) * falloff * dt;
        this.ball.vx *= Math.pow(0.94, dt * 60 * falloff);
        this.ball.vy *= Math.pow(0.94, dt * 60 * falloff);
      }
    }

    checkBoosts() {
      if (this.ball.boostCooldown > 0) return;
      for (let i = 0; i < this.hole.boosts.length; i++) {
        const pad = this.hole.boosts[i];
        if (pad.cooldown > 0 || !pointInRect(pad, this.ball.x, this.ball.y)) continue;
        const speed = Math.max(260, hypot(this.ball.vx, this.ball.vy) + 260);
        this.ball.vx = pad.dir.x * speed;
        this.ball.vy = pad.dir.y * speed;
        pad.cooldown = 0.48;
        this.ball.boostCooldown = 0.48;
        this.holeStats.boosts += 1;
        this.spawnImpact(this.ball.x, this.ball.y, PAL.yellow, 18);
        this.showToast('BOOST', 0.55);
        cue('boost');
        juiceShake(5, 130);
        juiceStop(18);
      }
    }

    checkPickups() {
      for (let i = 0; i < this.hole.pickups.length; i++) {
        const pickup = this.hole.pickups[i];
        if (pickup.taken || hypot(this.ball.x - pickup.x, this.ball.y - pickup.y) > 28) continue;
        pickup.taken = true;
        if (this.pickupSprites[i]) this.pickupSprites[i].setVisible(false);
        if (pickup.type === 'power') this.inventory.power = clamp(this.inventory.power + 1, 0, 4);
        if (pickup.type === 'gimme') this.inventory.gimme = clamp(this.inventory.gimme + 1, 0, 3);
        if (pickup.type === 'forgive') this.inventory.forgive = clamp(this.inventory.forgive + 1, 0, 3);
        this.emitParticles('pickups', pickup.x, pickup.y, 12);
        this.spawnImpact(pickup.x, pickup.y, pickup.type === 'power' ? PAL.yellow : pickup.type === 'gimme' ? PAL.cyan : PAL.violet, 20);
        this.showToast(pickup.type === 'power' ? '⚡ +1' : pickup.type === 'gimme' ? '○ +1' : '◇ +1', 0.8);
        cue('pickup');
        this.advanceTutorial();
      }
    }

    checkWater() {
      for (let i = 0; i < this.hole.water.length; i++) {
        if (!pointInRect(this.hole.water[i], this.ball.x, this.ball.y)) continue;
        const saved = this.inventory.forgive > 0;
        if (saved) this.inventory.forgive -= 1;
        else this.ball.shotTime = 99;
        this.spawnSplash(this.ball.x, this.ball.y);
        this.holeStats.wet += 1;
        bumpCareer('waterHits');
        this.ball.x = this.shotOrigin.x;
        this.ball.y = this.shotOrigin.y;
        this.ball.vx = 0;
        this.ball.vy = 0;
        this.ball.spin = 0;
        this.ball.moving = false;
        this.ballVisualState = 'idle';
        this.showToast(saved ? 'WATER // SAVED' : 'WATER +1', 0.8);
        cue('water');
        juiceShake(5, 150);
        if (!saved) this.hole.shotCount += 1;
        if (this.hole.shotCount >= STROKE_CAP) this.finishHole(true);
        return true;
      }
      return false;
    }

    stopBall() {
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.spin = 0;
      this.ball.moving = false;
      this.ballVisualState = 'idle';
      if (this.hole.shotCount >= STROKE_CAP) this.finishHole(true);
      this.syncState();
    }

    rejectTrickSink() {
      if (this.lastTrickReject !== this.hole.shotCount) {
        this.lastTrickReject = this.hole.shotCount;
        this.showToast('BOUNCE REQUIRED', 0.8);
        cue('gate-impact');
        this.spawnImpact(this.hole.cup.x, this.hole.cup.y, PAL.coral, 10);
      }
      const rawAway = { x: this.ball.x - this.hole.cup.x, y: this.ball.y - this.hole.cup.y };
      const away = hypot(rawAway.x, rawAway.y) > 0.001 ? unit(rawAway.x, rawAway.y) : unit(-this.aim.dir.x, -this.aim.dir.y);
      this.ball.x = this.hole.cup.x + away.x * (this.hole.cup.r + this.ball.r + 12);
      this.ball.y = this.hole.cup.y + away.y * (this.hole.cup.r + this.ball.r + 12);
      this.ball.vx = away.x * 220;
      this.ball.vy = away.y * 220;
      this.ball.moving = true;
    }

    sinkBall() {
      if (!this.ball.moving) return;
      this.ball.x = this.hole.cup.x;
      this.ball.y = this.hole.cup.y;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.spin = 0;
      this.ball.moving = false;
      this.ballVisualState = 'sink';
      const delta = this.hole.shotCount - this.hole.par;
      const tier = this.hole.shotCount === 1 ? 3 : delta <= -2 ? 2 : delta <= 0 ? 1 : 0;
      this.spawnSink(this.ball.x, this.ball.y, tier);
      cue('putt');
      juiceShake(5 + tier * 3, 160 + tier * 60);
      juiceStop(28 + tier * 12);
      this.finishHole(false);
    }

    /* ---------------------------------------------------------- scoring */
    finishHole(forced) {
      if (this.phase !== 'play') return;
      if (forced) this.ball.moving = false;
      this.phase = 'holeComplete';
      const score = forced ? this.hole.par + 6 : this.hole.shotCount;
      this.course.scores[this.holeIndex] = score;
      this.courseTotal = this.course.scores.reduce((sum, value) => sum + (value || 0), 0);
      const delta = score - this.hole.par;
      this.holeStats.strokes = this.hole.shotCount;
      bumpCareer('holesPlayed');
      if (!forced) {
        if (this.hole.shotCount === 1) bumpCareer('aces');
        else if (delta <= -2) bumpCareer('eagles');
        else if (delta === -1) bumpCareer('birdies');
        else if (delta === 0) bumpCareer('pars');
        if (this.holeStats.shot === 'chip') bumpCareer('chipSinks');
        if (this.holeStats.shot === 'spin') bumpCareer('spinSinks');
        if (progress.career && this.holeStats.bounces > progress.career.bestBank) progress.career.bestBank = clamp(this.holeStats.bounces, 0, 999999);
      }
      let extra = '';
      const challenge = this.hole.challenge;
      if (challenge && !forced) {
        const passed = challenge.test(this.holeStats) && this.hole.shotCount <= challenge.shots;
        if (passed) {
          const current = Number.isInteger(progress.challenges[challenge.id]) ? progress.challenges[challenge.id] : 0;
          progress.challenges[challenge.id] = clamp(Math.max(current, 4 - clamp(this.hole.shotCount, 1, 3)), 0, 99);
          extra = `CHALLENGE CLEARED // ${challenge.name}`;
        } else {
          extra = `CHALLENGE MISSED // ${challenge.copy}`;
        }
      } else if (this.rival) {
        const rivalScore = this.rival.finished ? this.rival.strokes : this.rival.strokes + 1;
        if (!forced && this.hole.shotCount < rivalScore) { bumpCareer('rivalWins'); extra = `YOU ${this.hole.shotCount} // RIVAL PRO ${rivalScore}`; }
        else if (this.hole.shotCount > rivalScore) { bumpCareer('rivalLosses'); extra = `RIVAL PRO ${rivalScore} // YOU ${score}`; }
        else extra = `HALVED WITH THE RIVAL PRO AT ${rivalScore}`;
      }
      this.result.title = this.hole.shotCount === 1 ? 'HOLE IN ONE' : forced ? 'THE RANGE MOVES ON' : (delta <= -2 ? 'EAGLE' : delta === -1 ? 'BIRDIE' : delta === 0 ? 'PAR' : 'LINE CLEARED');
      this.result.copy = forced ? 'Stroke cap reached. The +6 finish is logged.' : `${getGimmickName(this.hole.gimmick)} gave you a lane.`;
      this.result.stats = `${score} STROKES    ${fmtDelta(delta)} VS PAR    ${this.courseTotal} RUNNING`;
      this.result.extra = extra;
      this.result.action = this.holeIndex === this.course.holes.length - 1 ? 'SEE FINAL CARD' : 'NEXT HOLE';
      kit.save.set(progress);
      this.updateSaveIfNeeded();
      this.syncState();
    }

    finishCourse() {
      this.phase = 'courseComplete';
      const delta = this.courseTotal - this.course.parTotal;
      const medal = delta <= 0 ? 3 : delta <= 8 ? 2 : 1;
      const familyId = this.course.family.id;
      if (this.mode === 'tour') {
        progress.medals[familyId] = Math.max(progress.medals[familyId] || 0, medal);
        progress.unlocked = Math.max(progress.unlocked, Math.min(5, this.courseIndex + 2));
      }
      const best = progress.best[this.mode] || (progress.best[this.mode] = {});
      if (best[familyId] == null || this.courseTotal < best[familyId]) best[familyId] = this.courseTotal;
      kit.save.set(progress);
      const label = medal === 3 ? 'GOLD MEDAL' : medal === 2 ? 'SILVER MEDAL' : 'BRONZE MEDAL';
      this.result.title = this.mode === 'trick' ? 'TRICK SET COMPLETE' : `${label} // ${this.course.family.short}`;
      this.result.copy = this.mode === 'tour' ? 'The next range is open. Keep the bank alive.' : 'A fresh card is ready when you are.';
      this.result.stats = `${this.courseTotal} STROKES    ${fmtDelta(delta)} VS PAR    PAR ${this.course.parTotal}`;
      this.result.extra = this.mode === 'trick'
        ? `${CHALLENGE_IDS.filter((id) => progress.challenges[id] > 0).length}/${CHALLENGE_IDS.length} CHALLENGES CLEARED`
        : `RIVAL RECORD ${progress.career.rivalWins}-${progress.career.rivalLosses}`;
      this.result.action = this.mode === 'championship' ? 'REPLAY CHAMPIONSHIP' : 'NEXT COURSE';
      this.spawnSink(640, 400, 3);
      cue('course-clear');
      juiceShake(7, 240);
      this.syncState();
    }

    advance() {
      const last = this.course ? this.course.holes.length - 1 : 17;
      if (this.phase === 'holeComplete') {
        if (this.holeIndex === last) this.beginTransition(() => this.finishCourse());
        else this.beginTransition(() => this.startHole(this.holeIndex + 1));
      } else if (this.phase === 'courseComplete') {
        this.beginTransition(() => {
          if (this.mode === 'tour') this.startCourse(clamp(this.courseIndex + 1, 0, 3), 'tour', 0);
          else if (this.mode === 'championship') this.startCourse(4, 'championship', 0);
          else if (this.mode === 'trick') this.startCourse(this.courseIndex, 'trick', 0);
          else this.startCourse(this.courseIndex, 'seeded', 0);
        });
      }
    }

    beginTransition(action) {
      if (this.transition.timer > 0) return;
      if (!motionEnabled()) { action(); return; }
      this.transition.timer = 0.62;
      this.transition.duration = 0.62;
      this.transition.action = action;
      this.transition.fired = false;
    }

    tickTransition(dt) {
      if (this.transition.timer <= 0) return;
      this.transition.timer = Math.max(0, this.transition.timer - dt);
      const progressed = 1 - this.transition.timer / this.transition.duration;
      if (!this.transition.fired && progressed >= 0.5) {
        this.transition.fired = true;
        const action = this.transition.action;
        this.transition.action = null;
        if (action) action();
      }
    }

    startMode(mode, index = this.courseIndex) {
      if (!MODE_NAMES[mode]) return;
      if (mode === 'championship' && progress.unlocked < 5 && requestedCourse == null) {
        this.showToast('LOCKED // CLEAR TOUR', 1.0);
        return;
      }
      const safeIndex = mode === 'championship' ? 4 : clamp(index, 0, 3);
      if (mode === 'tour' && safeIndex + 1 > progress.unlocked && requestedCourse == null) {
        this.showToast('LOCKED // EARN MEDAL', 1.0);
        return;
      }
      this.beginTransition(() => this.startCourse(safeIndex, mode, 0));
    }

    cycleCourse() {
      if (this.mode !== 'tour' && this.mode !== 'seeded') { this.showToast('TOUR OR SEED ONLY', 0.8); return; }
      const next = (this.courseIndex + 1) % 4;
      if (this.mode === 'tour' && next + 1 > progress.unlocked) { this.showToast('LOCKED // EARN MEDAL', 0.9); return; }
      this.beginTransition(() => this.startCourse(next, this.mode, 0));
    }

    setShot(id) {
      const index = SHOT_BY_ID[id];
      if (index == null) return;
      if (this.shotIndex === index && id === 'spin') { this.spinSign *= -1; this.showToast(this.spinSign > 0 ? 'SPIN RIGHT' : 'SPIN LEFT', 0.7); return; }
      this.shotIndex = index;
      this.showToast(SHOTS[index].name, 0.7);
      if (this.tutorialStep === 3) this.advanceTutorial();
    }

    toggleCareer() {
      this.careerOpen = !this.careerOpen;
      if (this.careerOpen) { this.pointerClaims.clear(); this.aim.active = false; }
    }

    updateSaveIfNeeded() {
      if (!progress.tutorialSeen && this.tutorialStep >= 4) { progress.tutorialSeen = true; kit.save.set(progress); }
    }

    advanceTutorial() {
      if (progress.tutorialSeen || this.tutorialStep >= 4) return;
      this.tutorialStep += 1;
      this.tutorialTimer = this.tutorialStep < 4 ? 3.2 : 0;
      if (this.tutorialStep >= 4) { progress.tutorialSeen = true; kit.save.set(progress); }
      this.syncState();
    }

    startNextTransient() {
      if (this.transient.timer > 0 || !this.transientQueue.length) return;
      const next = this.transientQueue.shift();
      this.transient.text = next.text;
      this.transient.timer = next.seconds;
      this.transient.max = next.seconds;
    }

    showToast(text, seconds) {
      if (this.phase !== 'play' || !text) return;
      const item = { text, seconds: clamp(Number(seconds) || 0.7, 0.18, 1.0) };
      if (this.transient.timer <= 0 && this.transientQueue.length === 0) {
        this.transient.text = item.text;
        this.transient.timer = item.seconds;
        this.transient.max = item.seconds;
        return;
      }
      if (this.transientQueue.length < 4) this.transientQueue.push(item);
    }

    hideResult() {
      this.result.title = '';
      this.resultPlate.setVisible(false);
      ['resultTitle', 'resultCopy', 'resultStats', 'resultExtra', 'resultAction'].forEach((key) => this.labels[key].setVisible(false));
    }

    clearFx() {
      for (let i = 0; i < this.particles.length; i++) this.particles[i].alive = false;
      for (let i = 0; i < this.trail.length; i++) this.trail[i].alive = false;
      this.fxSprites.concat(this.fxFlares).forEach((sprite) => { sprite._life = 0; sprite.setVisible(false); });
      Object.values(this.emitters || {}).forEach((emitter) => emitter.stop());
    }

    emitParticles(name, x, y, count) {
      const emitter = this.emitters && this.emitters[name];
      if (emitter && typeof emitter.emitParticleAt === 'function') emitter.emitParticleAt(x, y, count);
    }

    spawnParticle(x, y, color, kind, speed, life, size, drag) {
      let slot = null;
      for (let i = 0; i < this.particles.length; i++) if (!this.particles[i].alive) { slot = this.particles[i]; break; }
      if (!slot) slot = this.particles.reduce((oldest, particle) => particle.life < oldest.life ? particle : oldest, this.particles[0]);
      const index = this.particles.indexOf(slot);
      const angle = (index * 2.399963 + this.simTime * 0.5) % TAU;
      slot.alive = true; slot.x = x; slot.y = y; slot.vx = Math.cos(angle) * speed; slot.vy = Math.sin(angle) * speed;
      slot.life = life; slot.max = life; slot.size = size; slot.color = color; slot.kind = kind; slot.drag = drag || 0.91;
      return slot;
    }

    takeFxSprite(list) {
      for (let i = 0; i < list.length; i++) if (list[i]._life <= 0) return list[i];
      this.fxIndex = (this.fxIndex + 1) % list.length;
      return list[this.fxIndex];
    }

    spawnRing(x, y, color, size, grow, life, alpha) {
      const sprite = this.takeFxSprite(this.fxSprites);
      sprite._life = life; sprite._max = life; sprite._grow = grow; sprite._base = size; sprite._alpha = alpha == null ? 1 : alpha;
      sprite.setPosition(x, y).setTint(color).setDisplaySize(size, size).setAlpha(sprite._alpha).setVisible(true);
      return sprite;
    }

    spawnFlare(x, y, color, size, life) {
      const sprite = this.takeFxSprite(this.fxFlares);
      sprite._life = life; sprite._max = life; sprite._grow = size * 0.6; sprite._base = size; sprite._alpha = 1;
      sprite.setPosition(x, y).setTint(color).setDisplaySize(size, size).setAlpha(1).setVisible(true).setRotation(Math.random() * TAU);
      return sprite;
    }

    updateFxSprites(dt) {
      const step = (sprite) => {
        if (sprite._life <= 0) return;
        sprite._life = Math.max(0, sprite._life - dt);
        const k = 1 - sprite._life / sprite._max;
        const size = sprite._base + sprite._grow * k;
        sprite.setDisplaySize(size, size);
        sprite.setAlpha(sprite._alpha * (1 - k));
        if (sprite._life <= 0) sprite.setVisible(false);
      };
      for (let i = 0; i < this.fxSprites.length; i++) step(this.fxSprites[i]);
      for (let i = 0; i < this.fxFlares.length; i++) step(this.fxFlares[i]);
    }

    spawnImpact(x, y, color, count) {
      const amount = motionEnabled() ? count : Math.max(3, Math.floor(count * 0.35));
      this.emitters.sparks.setParticleTint(color);
      this.emitParticles('sparks', x, y, Math.min(18, amount));
      for (let i = 0; i < amount; i++) this.spawnParticle(x, y, color, i % 3 === 0 ? 1 : 0, 55 + (i % 5) * 24, 0.28 + (i % 4) * 0.04, 2 + (i % 3));
      this.spawnRing(x, y, color, 22, 66, 0.38, 0.85);
    }

    spawnSplash(x, y) {
      this.spawnRing(x, y, PAL.water, 26, 96, 0.55, 0.9);
      this.spawnRing(x, y, 0xffffff, 16, 58, 0.34, 0.7);
      const amount = motionEnabled() ? 26 : 8;
      this.emitters.dust.setParticleTint(PAL.water);
      this.emitParticles('dust', x, y, motionEnabled() ? 12 : 4);
      for (let i = 0; i < amount; i++) {
        const p = this.spawnParticle(x, y, i % 3 ? PAL.water : 0xffffff, 0, 60 + (i % 6) * 26, 0.4 + (i % 4) * 0.08, 2 + (i % 3), 0.95);
        p.vy -= 90 + (i % 5) * 22;
      }
    }

    spawnSink(x, y, tier) {
      const reduced = !motionEnabled();
      const amount = reduced ? 10 : 34 + tier * 14;
      this.emitters.finish.setParticleTint(tier >= 2 ? PAL.yellow : PAL.mint);
      this.emitParticles('finish', x, y, reduced ? 8 : 22 + tier * 8);
      for (let i = 0; i < amount; i++) this.spawnParticle(x, y, i % 3 === 0 ? PAL.yellow : i % 3 === 1 ? PAL.mint : PAL.cyan, 2, 80 + (i % 7) * 24, 0.6 + (i % 5) * 0.06, 2 + (i % 3));
      this.spawnRing(x, y, PAL.yellow, 26, 120, 0.66, 0.95);
      if (tier >= 1) this.spawnRing(x, y, PAL.mint, 18, 190, 0.85, 0.7);
      if (tier >= 2 && !reduced) {
        this.spawnFlare(x, y, PAL.yellow, 120, 0.5);
        this.spawnRing(x, y, PAL.cyan, 12, 260, 1.05, 0.55);
      }
      if (tier >= 3 && !reduced) {
        for (let i = 0; i < 6; i++) this.spawnFlare(x + Math.cos(i) * 60, y + Math.sin(i * 1.7) * 44, i % 2 ? PAL.mint : PAL.violet, 80, 0.66);
      }
      this.celebrate.tier = tier;
      this.celebrate.timer = 0.9;
    }

    addTrail(x, y, vx, vy) {
      let slot = null;
      for (let i = 0; i < this.trail.length; i++) if (!this.trail[i].alive) { slot = this.trail[i]; break; }
      if (!slot) slot = this.trail[Math.floor(this.simTime * 90) % this.trail.length];
      const speed = hypot(vx, vy);
      slot.alive = true; slot.x = x; slot.y = y; slot.age = 0; slot.life = 0.3;
      slot.color = speed > 380 ? PAL.yellow : speed > 200 ? PAL.cyan : PAL.mint;
      slot.size = clamp(speed / 220, 1.4, 5);
      if (speed > 250 && motionEnabled()) { this.emitters.trail.setParticleTint(slot.color); this.emitParticles('trail', x, y, 1); }
    }

    updateParticles(dt) {
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (!p.alive) continue;
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= p.drag; p.vy *= p.drag; p.life -= dt;
        if (p.kind === 3) p.vy -= 12 * dt;
        if (p.life <= 0) p.alive = false;
      }
      for (let i = 0; i < this.trail.length; i++) { const t = this.trail[i]; if (t.alive) { t.age += dt; if (t.age >= t.life) t.alive = false; } }
    }

    /* ------------------------------------------------------------ input */
    worldPoint(clientX, clientY) {
      const rect = this.game.canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) * GAME_W / Math.max(1, rect.width) - this.panOffset.x,
        y: (clientY - rect.top) * GAME_H / Math.max(1, rect.height) - this.panOffset.y
      };
    }

    screenPoint(clientX, clientY) {
      const rect = this.game.canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) * GAME_W / Math.max(1, rect.width),
        y: (clientY - rect.top) * GAME_H / Math.max(1, rect.height)
      };
    }

    // Pointer claims live on a WINDOW listener registered AFTER kit init, and
    // this map is the authority for UI releases: the kit deletes the pointer
    // id before a canvas-level handler would ever see the release.
    installWindowGestures() {
      const down = (event) => {
        if (kit.paused) return;
        const target = event.target;
        if (!target || (target !== this.game.canvas && target.tagName !== 'CANVAS' && target.id !== 'game')) return;
        const point = this.screenPoint(event.clientX, event.clientY);
        const button = this.buttonAt(point);
        const aimable = !this.userPaused && !this.careerOpen && this.phase === 'play' && this.ball && !this.ball.moving
          && distance(this.worldPoint(event.clientX, event.clientY), this.ball) < 78;
        if (!button && !this.uiPoint(point)) return;
        if (button && aimable && point.y > 600) return;
        this.gestures.set(event.pointerId, { button, start: point, last: point });
        this.pointerClaims.set(event.pointerId, { type: 'ui', button, start: point, last: point });
      };
      const move = (event) => {
        const gesture = this.gestures.get(event.pointerId);
        if (!gesture) return;
        gesture.last = this.screenPoint(event.clientX, event.clientY);
        const claim = this.pointerClaims.get(event.pointerId);
        if (claim) claim.last = gesture.last;
      };
      const up = (event) => {
        const gesture = this.gestures.get(event.pointerId);
        if (!gesture) return;
        this.gestures.delete(event.pointerId);
        this.pointerClaims.delete(event.pointerId);
        if (kit.paused) return;
        if (!gesture.button || this.buttonAt(gesture.last) === gesture.button) this.handleTap(gesture.button, gesture.last);
      };
      // Keys are EDGE triggered through the kit's own subscriber, not polled
      // per frame: a tap shorter than one frame used to be dropped entirely.
      const KEYS = new Set(['Space', 'Enter', 'KeyR', 'KeyO', 'KeyC', 'KeyZ', 'KeyX', 'KeyV',
        'Digit1', 'Digit2', 'Digit3', 'Digit4', 'BracketRight', 'BracketLeft',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
      const offKey = kit.input.onKeyDown((code) => {
        if (kit.paused || !KEYS.has(code)) return;
        this.handleKey(code);
      });
      window.addEventListener('pointerdown', down, { passive: true });
      window.addEventListener('pointermove', move, { passive: true });
      window.addEventListener('pointerup', up, { passive: true });
      window.addEventListener('pointercancel', up, { passive: true });
      this.events.once('shutdown', () => {
        if (typeof offKey === 'function') offKey();
        window.removeEventListener('pointerdown', down);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      });
    }

    uiPoint(point) {
      if (point.y < 88 || point.y > 646) return true;
      if ((this.userPaused || this.phase !== 'play') && !this.careerOpen
        && point.x > ACTION_RECT.x - 30 && point.x < ACTION_RECT.x + ACTION_RECT.w + 30
        && point.y > ACTION_RECT.y - 20 && point.y < ACTION_RECT.y + ACTION_RECT.h + 20) return true;
      if (this.careerOpen) return true;
      return false;
    }

    buttonAt(point) {
      if (this.careerOpen) return 'card';
      if (point.y >= 8 && point.y <= 88) {
        for (let i = 0; i < TOP_BUTTONS.length; i++) {
          const button = TOP_BUTTONS[i];
          if (point.x >= button.x - 2 && point.x < button.x + button.w + 2) return button.id;
        }
      }
      if (point.y >= 646 && point.y <= 720) {
        for (let i = 0; i < FOOT_BUTTONS.length; i++) {
          const button = FOOT_BUTTONS[i];
          if (point.x >= button.x - 2 && point.x < button.x + button.w + 2) return button.id;
        }
      }
      const inAction = point.x >= ACTION_RECT.x && point.x <= ACTION_RECT.x + ACTION_RECT.w
        && point.y >= ACTION_RECT.y && point.y <= ACTION_RECT.y + ACTION_RECT.h;
      if (this.userPaused && inAction) return 'resume';
      if (this.phase !== 'play' && inAction) return 'advance';
      return '';
    }

    pollInput() {
      if (kit.paused) return;
      const pointers = kit.input.pointers;
      const seen = new Set();
      const values = [...pointers.entries()];
      const blocked = this.userPaused || this.careerOpen;
      if (values.length >= 2 && !blocked) {
        if (!this.panLast) this.panLast = { x: (values[0][1].x + values[1][1].x) / 2, y: (values[0][1].y + values[1][1].y) / 2 };
        const midpoint = { x: (values[0][1].x + values[1][1].x) / 2, y: (values[0][1].y + values[1][1].y) / 2 };
        const rect = this.game.canvas.getBoundingClientRect();
        const deltaX = midpoint.x - this.panLast.x;
        const deltaY = midpoint.y - this.panLast.y;
        this.panLast.x = midpoint.x; this.panLast.y = midpoint.y;
        for (const [id, pointer] of values) {
          seen.add(id);
          if (this.gestures.has(id)) continue;
          const claim = this.pointerClaims.get(id);
          if (!claim) { pointer.zone = 'pan'; this.pointerClaims.set(id, { type: 'pan' }); }
          else if (claim.type !== 'ui') claim.type = 'pan';
        }
        if (rect.width > 0) {
          this.panOffset.x = clamp(this.panOffset.x + deltaX * GAME_W / rect.width, -60, 60);
          this.panOffset.y = clamp(this.panOffset.y + deltaY * GAME_H / Math.max(1, rect.height), -44, 44);
        }
        this.aim.active = false;
      } else {
        this.panLast = null;
        for (const [id, pointer] of values) {
          seen.add(id);
          if (this.gestures.has(id)) continue;
          let claim = this.pointerClaims.get(id);
          const point = this.worldPoint(pointer.x, pointer.y);
          if (!claim) {
            const start = this.screenPoint(pointer.startX, pointer.startY);
            if (!blocked && this.phase === 'play' && this.ball && !this.ball.moving && distance(this.worldPoint(pointer.startX, pointer.startY), this.ball) < 78) {
              pointer.zone = 'aim'; claim = { type: 'aim', start }; this.aim.active = true;
            } else { pointer.zone = 'play'; claim = { type: 'play', start }; }
            this.pointerClaims.set(id, claim);
          }
          if (claim.type === 'aim' && !blocked && this.phase === 'play' && !this.ball.moving) { this.aim.active = true; this.updateAim(point); }
        }
      }
      for (const [id, claim] of [...this.pointerClaims.entries()]) {
        if (seen.has(id) || this.gestures.has(id)) continue;
        this.pointerClaims.delete(id);
        if (claim.type === 'aim' && this.phase === 'play' && this.aim.active) {
          if (this.aim.power > 12) this.shoot(this.aim.dir, this.aim.power);
          this.aim.active = false;
        }
      }
      this.pollGamepad();
    }

    pollGamepad() {
      if (!window.navigator || typeof window.navigator.getGamepads !== 'function') return;
      const pads = window.navigator.getGamepads();
      const pad = pads && [...pads].find((candidate) => candidate && candidate.connected);
      if (!pad) { this.gamepadButtons.clear(); return; }
      const axis = (index) => Number(pad.axes[index]) || 0;
      const dead = (value) => Math.abs(value) < 0.18 ? 0 : value;
      const ax = dead(axis(0)), ay = dead(axis(1));
      const mag = clamp(Math.sqrt(ax * ax + ay * ay), 0, 1);
      if (mag > 0 && !this.userPaused && !this.careerOpen && this.phase === 'play' && !this.ball.moving) {
        this.aim.dir = unit(ax, ay);
        this.aim.power = clamp(220 + mag * 290, 0, 510);
        this.lastGamepadAim = { ...this.aim.dir };
        if (this.tutorialStep === 0) this.advanceTutorial();
      }
      const current = new Set();
      for (let i = 0; i < Math.max(10, pad.buttons.length); i++) {
        if (pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5)) current.add(i);
      }
      const pressed = (index) => current.has(index) && !this.gamepadButtons.has(index);
      if (pressed(0)) this.handleKey(this.phase === 'play' ? 'Space' : 'Enter');
      if (pressed(1)) this.setShot(SHOTS[(this.shotIndex + 1) % SHOTS.length].id);
      if (pressed(2)) kit.restart();
      if (pressed(3)) kit.openSettings();
      if (pressed(8)) this.toggleCareer();
      if (pressed(9)) this.toggleUserPause();
      if (pressed(4)) this.setShot('chip');
      if (pressed(5)) this.setShot('spin');
      this.gamepadButtons = current;
    }

    handleTap(button, point) {
      if (!button) button = this.buttonAt(point);
      if (this.careerOpen && button !== 'card') { this.toggleCareer(); return; }
      if (button === 'tour') return this.startMode('tour', this.courseIndex);
      if (button === 'seeded') return this.startMode('seeded', this.courseIndex);
      if (button === 'trick') return this.startMode('trick', this.courseIndex);
      if (button === 'championship') return this.startMode('championship', 4);
      if (button === 'course') return this.cycleCourse();
      if (button === 'card') return this.toggleCareer();
      if (button === 'settings') return kit.openSettings();
      if (button === 'restart') return kit.restart();
      if (button === 'pause' || button === 'resume') return this.toggleUserPause();
      if (button === 'putt' || button === 'chip' || button === 'spin') return this.setShot(button);
      if (button === 'advance') return this.advance();
    }

    toggleUserPause() {
      if (this.userPaused) {
        this.userPaused = false;
        kit.audio.resume();
      } else if (this.phase === 'play') {
        this.userPaused = true;
        this.pointerClaims.clear();
        this.aim.active = false;
        kit.audio.suspend();
      }
    }

    handleKey(code) {
      if (code === 'KeyR') return kit.restart();
      if (code === 'KeyO') return kit.openSettings();
      if (code === 'KeyC') return this.toggleCareer();
      if (this.careerOpen) { if (code === 'Space' || code === 'Enter') this.toggleCareer(); return; }
      if (this.userPaused) { if (code === 'Space' || code === 'Enter') this.toggleUserPause(); return; }
      if (code === 'KeyZ') return this.setShot('putt');
      if (code === 'KeyX') return this.setShot('chip');
      if (code === 'KeyV') return this.setShot('spin');
      if (code === 'Digit1') return this.startMode('tour', this.courseIndex);
      if (code === 'Digit2') return this.startMode('seeded', this.courseIndex);
      if (code === 'Digit3') return this.startMode('trick', this.courseIndex);
      if (code === 'Digit4') return this.startMode('championship', 4);
      if (code === 'BracketRight') return this.cycleCourse();
      if (code === 'BracketLeft' && (this.mode === 'tour' || this.mode === 'seeded')) return this.beginTransition(() => this.startCourse(Math.max(0, this.courseIndex - 1), this.mode, 0));
      if (code === 'Space' || code === 'Enter') {
        if (this.phase !== 'play') return this.advance();
        if (!this.ball.moving) this.shoot(this.aim.dir, this.aim.power || 270);
        return;
      }
      if (this.phase !== 'play' || this.ball.moving) return;
      const dirs = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
      if (dirs[code]) {
        this.aim.dir = unit(dirs[code][0], dirs[code][1]);
        this.aim.power = 270;
        if (this.tutorialStep === 0) this.advanceTutorial();
      }
    }

    updateAim(point) {
      const dx = this.ball.x - point.x, dy = this.ball.y - point.y;
      const pull = hypot(dx, dy);
      if (pull < 3) return;
      this.aim.point = point;
      this.aim.pull = clamp(pull / 190, 0, 1);
      this.aim.power = clamp(pull * 2.6, 0, 510);
      this.aim.dir = unit(dx, dy);
      this.ballVisualState = 'aim';
      if (this.tutorialStep === 0) this.advanceTutorial();
    }

    shoot(dir, power) {
      if (this.phase !== 'play' || this.ball.moving || power < 14) return;
      const shot = SHOTS[this.shotIndex] || SHOTS[0];
      this.shotOrigin.x = this.ball.x; this.shotOrigin.y = this.ball.y;
      const powerBall = this.inventory.power > 0;
      if (powerBall) this.inventory.power -= 1;
      const speed = clamp(power * shot.power * (powerBall ? 2.55 : 2.18), 80, 1240);
      this.ball.vx = dir.x * speed; this.ball.vy = dir.y * speed; this.ball.moving = true; this.ball.shotTime = 0;
      this.settleTimer = 0;
      this.ball.spin = shot.curve ? shot.curve * this.spinSign * clamp(power / 510, 0.25, 1) : 0;
      this.ball.airMax = shot.air ? shot.air * clamp(0.65 + power / 700, 0.6, 1.25) : 0;
      this.ball.air = this.ball.airMax;
      this.ball.height = 0;
      this.ballVisualState = 'shot';
      this.bouncedThisShot = false;
      this.hole.shotCount += 1;
      this.holeStats.shot = shot.id;
      if (shot.id === 'chip') this.holeStats.usedChip = true;
      if (shot.id === 'spin') this.holeStats.usedSpin = true;
      this.aim.active = false;
      this.spawnImpact(this.ball.x, this.ball.y, powerBall ? PAL.yellow : PAL.mint, 8);
      if (shot.id === 'chip') this.spawnDust(this.ball.x, this.ball.y, this.surfaceAt(this.ball.x, this.ball.y), 6);
      cue('putt');
      if (this.tutorialStep === 1) this.advanceTutorial();
      this.syncState();
    }

    previewPath() {
      const shot = SHOTS[this.shotIndex] || SHOTS[0];
      const result = [];
      let origin = { x: this.ball.x, y: this.ball.y };
      let dir = this.aim.dir;
      let remaining = Math.max(420, this.aim.power * 1.62 * shot.power);
      this.collectSegments();
      if (shot.air > 0) {
        // Chip: one clean arc that ignores everything but the rails.
        const reach = Math.min(remaining, 560);
        result.push({ x1: origin.x, y1: origin.y, x2: origin.x + dir.x * reach, y2: origin.y + dir.y * reach, bounce: false, air: true });
        result.push({ landing: true, x2: origin.x + dir.x * reach, y2: origin.y + dir.y * reach });
        return result;
      }
      const curve = shot.curve ? shot.curve * this.spinSign * clamp(this.aim.power / 510, 0.25, 1) : 0;
      for (let bounce = 0; bounce < 4 && remaining > 20; bounce++) {
        if (curve !== 0) {
          const chordCount = 10;
          let hit = null;
          for (let c = 0; c < chordCount && remaining > 12; c++) {
            const chord = Math.min(remaining, 46);
            const nearest = this.trajectoryHit(origin, dir, chord);
            if (nearest) { hit = nearest; break; }
            const next = { x: origin.x + dir.x * chord, y: origin.y + dir.y * chord };
            result.push({ x1: origin.x, y1: origin.y, x2: next.x, y2: next.y, bounce: false });
            origin = next;
            remaining -= chord;
            const angle = curve * (chord / 620);
            dir = unit(dir.x * Math.cos(angle) - dir.y * Math.sin(angle), dir.x * Math.sin(angle) + dir.y * Math.cos(angle));
          }
          if (!hit) break;
          result.push({ x1: origin.x, y1: origin.y, x2: hit.x, y2: hit.y, bounce: true });
          dir = this.reflectPreview(dir, hit);
          remaining -= hit.t;
          origin = { x: hit.x + dir.x * 5, y: hit.y + dir.y * 5 };
          dir = this.previewInfluence(origin, dir);
          continue;
        }
        const nearest = this.trajectoryHit(origin, dir, remaining);
        if (!nearest) { result.push({ x1: origin.x, y1: origin.y, x2: origin.x + dir.x * remaining, y2: origin.y + dir.y * remaining, bounce: false }); break; }
        result.push({ x1: origin.x, y1: origin.y, x2: nearest.x, y2: nearest.y, bounce: true });
        dir = this.reflectPreview(dir, nearest);
        remaining -= nearest.t;
        origin = { x: nearest.x + dir.x * 5, y: nearest.y + dir.y * 5 };
        dir = this.previewInfluence(origin, dir);
      }
      return result;
    }

    reflectPreview(dir, nearest) {
      let normal;
      if (nearest.bumper) normal = unit(nearest.x - nearest.bumper.x, nearest.y - nearest.bumper.y);
      else {
        const sx = nearest.seg.x2 - nearest.seg.x1, sy = nearest.seg.y2 - nearest.seg.y1;
        normal = unit(-sy, sx);
      }
      if (dir.x * normal.x + dir.y * normal.y > 0) normal = { x: -normal.x, y: -normal.y };
      const dot = dir.x * normal.x + dir.y * normal.y;
      return unit(dir.x - 2 * dot * normal.x, dir.y - 2 * dot * normal.y);
    }

    syncState() {
      if (!this.hole || !this.course) return;
      RR_STATE.mode = this.mode;
      RR_STATE.course = this.course.family.id;
      RR_STATE.courseIndex = this.courseIndex;
      RR_STATE.hole = this.holeIndex + 1;
      RR_STATE.strokes = this.hole.shotCount;
      RR_STATE.par = this.hole.par;
      RR_STATE.courseTotal = this.course.scores.reduce((sum, value) => sum + (value || 0), 0);
      RR_STATE.coursePar = this.course.parTotal;
      RR_STATE.signature = !!this.hole.signature;
      RR_STATE.pickups = { ...this.inventory };
      RR_STATE.tutorial = this.tutorialStep;
      RR_STATE.shot = (SHOTS[this.shotIndex] || SHOTS[0]).id;
      RR_STATE.authored = !!this.course.authored;
      RR_STATE.rival = this.rival ? this.rival.strokes : 0;
      RR_STATE.phase = this.phase;
      RR_STATE.ball = { x: Math.round(this.ball.x), y: Math.round(this.ball.y), v: Math.round(hypot(this.ball.vx, this.ball.vy)), moving: this.ball.moving, air: +this.ball.air.toFixed(2) };
      RR_STATE.paused = this.userPaused;
      RR_STATE.career = this.careerOpen;
      RR_STATE.layout = this.hole.layout;
      RR_STATE.features = { movers: this.hole.movers.length, portals: this.hole.portals.length, challenge: this.hole.challenge ? this.hole.challenge.id : '' };
    }

    /* ----------------------------------------------------------- render */
    render() {
      if (!this.hole || !this.ball) return;
      this.syncState();
      this.root.x = this.panOffset.x + this.cameraKick.x;
      this.root.y = this.panOffset.y + this.cameraKick.y;
      const style = STYLES[this.course.family.style] || STYLES.garden;
      this.drawBackdrop(style);
      this.drawParallax();
      this.drawDynamic(style);
      this.drawAim(style);
      this.drawActors(style);
      this.drawFx();
      this.drawUi(style);
    }

    drawBackdrop(style) {
      // Three commands, replayed each frame, no per-pixel work: the heavy
      // chrome is in the baked course texture instead.
      this.bgG.clear();
      this.bgG.fillGradientStyle(
        Phaser.Display.Color.HexStringToColor(style.sky[0]).color,
        Phaser.Display.Color.HexStringToColor(style.sky[1]).color,
        Phaser.Display.Color.HexStringToColor(style.sky[2]).color,
        Phaser.Display.Color.HexStringToColor(style.sky[1]).color, 1);
      this.bgG.fillRect(0, 0, GAME_W, GAME_H);
    }

    drawParallax() {
      const moving = motionEnabled();
      const bx = this.ball ? (this.ball.x - 640) : 0;
      const by = this.ball ? (this.ball.y - 400) : 0;
      const drift = moving ? this.simTime * 4 : 0;
      this.tileFar.tilePositionX = (this.panOffset.x * -0.18 + bx * 0.02 + drift * 0.25) * DPR;
      this.tileFar.tilePositionY = (this.panOffset.y * -0.18 + by * 0.02) * DPR;
      this.tileMid.tilePositionX = (this.panOffset.x * -0.4 + bx * 0.05 + drift * 0.6) * DPR;
      this.tileMid.tilePositionY = (this.panOffset.y * -0.4 + by * 0.05) * DPR;
      this.tileNear.tilePositionX = (this.panOffset.x * -0.72 + bx * 0.09 + drift) * DPR;
      this.tileNear.tilePositionY = (this.panOffset.y * -0.72 + by * 0.09) * DPR;
    }

    drawDynamic(style) {
      const t = this.simTime;
      this.gimRingA.setRotation(t * 0.5);
      this.gimRingB.setRotation(-t * 0.8);
      this.gimGlow.setAlpha(0.14 + Math.sin(t * 2.2) * 0.05);
      for (let i = 0; i < this.bumperSprites.length; i++) {
        const sprite = this.bumperSprites[i], bumper = this.hole.bumpers[i];
        if (!bumper) break;
        sprite.setRotation(t * 1.1 + bumper.phase);
        const pulse = 1 + Math.sin(t * 3 + bumper.phase) * 0.05;
        sprite.setDisplaySize(bumper.r * 2.6 * pulse, bumper.r * 2.6 * pulse);
      }
      for (let i = 0; i < this.moverSprites.length; i++) {
        const sprite = this.moverSprites[i], mover = this.hole.movers[i];
        if (!mover) break;
        sprite.setPosition(mover.x, mover.y).setRotation(t * 2.4);
      }
      for (let i = 0; i < this.portalSprites.length; i++) {
        const sprite = this.portalSprites[i], portal = this.hole.portals[0];
        if (!portal) break;
        sprite.setRotation(i === 0 ? t * 1.4 : -t * 1.4);
        sprite.setAlpha(0.62 + Math.sin(t * 3 + i) * 0.16);
      }
      for (let i = 0; i < this.pickupSprites.length; i++) {
        const sprite = this.pickupSprites[i], pickup = this.hole.pickups[i];
        if (!pickup) break;
        if (pickup.taken) { sprite.setVisible(false); continue; }
        sprite.setVisible(true).setPosition(pickup.x, pickup.y + Math.sin(t * 2.6 + i) * 3);
        const pulse = 44 * (1 + Math.sin(t * 3.4 + i) * 0.08);
        sprite.setDisplaySize(pulse, pulse);
      }
      const cupPulse = 76 + Math.sin(t * 2.4) * 8;
      this.cupRing.setDisplaySize(cupPulse, cupPulse).setRotation(t * 0.4).setAlpha(this.phase === 'play' ? 0.42 + Math.sin(t * 2.4) * 0.12 : 0.7);

      this.gateG.clear();
      for (let i = 0; i < this.gateRuntime.length; i++) {
        const seg = this.gateRuntime[i];
        this.gateG.lineStyle(15, PAL.deep, 0.55);
        this.gateG.beginPath(); this.gateG.moveTo(seg.x1, seg.y1 + 6); this.gateG.lineTo(seg.x2, seg.y2 + 6); this.gateG.strokePath();
        this.gateG.lineStyle(9, PAL.yellow, 0.97);
        this.gateG.beginPath(); this.gateG.moveTo(seg.x1, seg.y1); this.gateG.lineTo(seg.x2, seg.y2); this.gateG.strokePath();
        this.gateG.lineStyle(3, 0xfff4d0, 0.55);
        this.gateG.beginPath(); this.gateG.moveTo(seg.x1, seg.y1 - 2.5); this.gateG.lineTo(seg.x2, seg.y2 - 2.5); this.gateG.strokePath();
        this.gateG.lineStyle(2, style.accent, 0.5);
        this.gateG.beginPath(); this.gateG.moveTo(seg.x1, seg.y1 + 3); this.gateG.lineTo(seg.x2, seg.y2 + 3); this.gateG.strokePath();
      }
    }

    drawAim(style) {
      this.previewG.clear();
      if (this.phase !== 'play' || this.ball.moving || this.userPaused || this.careerOpen) return;
      const shot = SHOTS[this.shotIndex] || SHOTS[0];
      if (this.aim.active) {
        this.previewG.lineStyle(3, PAL.mint, 0.4);
        this.dashedLine(this.previewG, this.ball, this.aim.point, 10, 12);
      }
      const path = this.previewPath();
      for (let i = 0; i < path.length; i++) {
        const line = path[i];
        if (line.landing) {
          this.previewG.lineStyle(3, PAL.cyan, 0.85);
          this.previewG.strokeRect(line.x2 - 12, line.y2 - 12, 24, 24);
          continue;
        }
        const color = line.air ? PAL.cyan : line.bounce ? PAL.yellow : shot.id === 'spin' ? PAL.violet : PAL.cyan;
        this.previewG.lineStyle(line.bounce ? 4 : 3, color, line.bounce ? 0.85 : 0.58);
        this.dashedLine(this.previewG, { x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }, line.bounce ? 7 : 6, line.bounce ? 9 : 10);
        if (line.bounce) {
          this.previewG.fillStyle(PAL.yellow, 0.95); this.previewG.fillCircle(line.x2, line.y2, 5);
        }
      }
      const gauge = this.aim.pull;
      if (gauge > 0.01) {
        this.arcRing(this.previewG, this.ball.x, this.ball.y, 30, gauge, 4, PAL.yellow, 0.92);
        this.arcRing(this.previewG, this.ball.x, this.ball.y, 37, gauge, 2, style.accent, 0.7);
      }
    }

    // Hand-tessellated sweep: Graphics.arc walks 0.01 rad at a time, this
    // walks the segments the sweep actually needs.
    arcRing(graphics, x, y, radius, fraction, width, color, alpha) {
      const steps = Math.max(3, Math.round(28 * clamp(fraction, 0, 1)));
      graphics.lineStyle(width, color, alpha);
      graphics.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = -Math.PI / 2 + TAU * fraction * (i / steps);
        const px = x + Math.cos(a) * radius, py = y + Math.sin(a) * radius;
        if (i === 0) graphics.moveTo(px, py); else graphics.lineTo(px, py);
      }
      graphics.strokePath();
    }

    dashedLine(graphics, a, b, dash, gap) {
      const len = distance(a, b), ux = (b.x - a.x) / Math.max(1, len), uy = (b.y - a.y) / Math.max(1, len);
      for (let d = 0; d < len; d += dash + gap) {
        const e = Math.min(len, d + dash);
        graphics.beginPath();
        graphics.moveTo(a.x + ux * d, a.y + uy * d);
        graphics.lineTo(a.x + ux * e, a.y + uy * e);
        graphics.strokePath();
      }
    }

    drawActors(style) {
      const state = this.ballVisualState;
      const height = this.ball.height || 0;
      const shadowScale = clamp(1 - height / 150, 0.55, 1);
      this.ballShadow.setPosition(this.ball.x + 5 + height * 0.14, this.ball.y + 9 + height * 0.1);
      this.ballShadow.setDisplaySize(46 * shadowScale, 30 * shadowScale).setAlpha(0.55 * shadowScale);
      const pulse = state === 'aim' ? 1 + Math.sin(this.simTime * 8) * 0.07 : state === 'shot' ? 1.06 : state === 'sink' ? 1.16 : 1;
      const size = 38 * pulse * (1 + height / 320);
      this.ballSprite.setPosition(this.ball.x, this.ball.y - height);
      this.ballSprite.setDisplaySize(size, size);
      this.ballSprite.setRotation(this.ballRoll);
      this.ballSprite.setAlpha(state === 'sink' ? 0.9 : 1);
      if (state === 'sink') this.ballSprite.setTint(PAL.yellow);
      else if (state === 'shot' && this.ball.spin !== 0) this.ballSprite.setTint(0xd9c8ff);
      else this.ballSprite.clearTint();
      const glow = state === 'sink' ? 120 : state === 'aim' ? 74 + Math.sin(this.simTime * 6) * 8 : 62;
      this.ballGlow.setPosition(this.ball.x, this.ball.y - height).setDisplaySize(glow, glow);
      this.ballGlow.setTint(state === 'sink' ? PAL.yellow : state === 'shot' ? PAL.cyan : PAL.mint);
      this.ballGlow.setAlpha(state === 'idle' ? 0.16 : 0.26);
    }

    drawFx() {
      this.fxG.clear();
      for (let i = 0; i < this.trail.length; i++) {
        const t = this.trail[i];
        if (!t.alive) continue;
        const k = clamp(1 - t.age / t.life, 0, 1);
        this.fxG.fillStyle(t.color, k * 0.3);
        const s = t.size * (0.6 + k);
        this.fxG.fillRect(t.x - s, t.y - s, s * 2, s * 2);
      }
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (!p.alive) continue;
        const alpha = clamp(p.life / p.max, 0, 1);
        if (p.kind === 1) {
          this.fxG.lineStyle(2, p.color, alpha);
          this.fxG.beginPath(); this.fxG.moveTo(p.x, p.y); this.fxG.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); this.fxG.strokePath();
        } else {
          const s = p.size * (0.55 + alpha);
          this.fxG.fillStyle(p.color, alpha * (p.kind === 3 ? 0.6 : 1));
          this.fxG.fillRect(p.x - s, p.y - s, s * 2, s * 2);
        }
      }
    }

    /* --------------------------------------------------------------- UI */
    drawUi(style) {
      this.uiG.clear();
      const active = (rect, color, alpha) => {
        this.uiG.fillStyle(color, alpha);
        this.uiG.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 12);
      };
      TOP_BUTTONS.forEach((button) => {
        const isActive = button.id === this.mode || (button.id === 'card' && this.careerOpen);
        const locked = button.id === 'championship' && progress.unlocked < 5;
        active({ x: button.x, y: 21, w: button.w, h: 50 }, isActive ? style.accent : PAL.deep, isActive ? 0.26 : locked ? 0.55 : 0.3);
        this.uiG.lineStyle(1.4, isActive ? style.accent : style.line, isActive ? 0.85 : 0.24);
        this.uiG.strokeRoundedRect(button.x, 21, button.w, 50, 12);
        const label = this.labels[`btn-${button.id}`];
        label.setAlpha(locked ? 0.45 : 1);
        label.setColor(isActive ? '#eafff7' : '#bfe0d8');
      });
      FOOT_BUTTONS.forEach((button) => {
        const shot = SHOTS[this.shotIndex] || SHOTS[0];
        const isActive = (button.id === 'pause' && this.userPaused) || button.id === shot.id;
        active({ x: button.x, y: 668, w: button.w, h: 40 }, isActive ? style.accent : PAL.deep, isActive ? 0.3 : 0.3);
        this.uiG.lineStyle(1.4, isActive ? style.accent : style.line, isActive ? 0.85 : 0.24);
        this.uiG.strokeRoundedRect(button.x, 668, button.w, 40, 10);
        const label = this.labels[`btn-${button.id}`];
        label.setColor(isActive ? '#eafff7' : '#c3e3da');
      });
      this.setTextIfChanged(this.labels['btn-pause'], this.userPaused ? '▶' : 'Ⅱ');
      this.setTextIfChanged(this.labels['btn-spin'], this.spinSign > 0 ? 'SPIN R' : 'SPIN L');

      // Stroke meter: filled pips, capped by the stroke cap.
      const pipX = 106, pipY = 40, pipW = 6, pipGap = 3;
      for (let i = 0; i < STROKE_CAP; i++) {
        const filled = i < this.hole.shotCount;
        this.uiG.fillStyle(filled ? (i >= this.hole.par ? PAL.coral : style.accent) : style.line, filled ? 0.95 : 0.18);
        this.uiG.fillRoundedRect(pipX + i * (pipW + pipGap), pipY, pipW, 14, 2);
      }

      const tutorialLines = ['DRAG BACK FROM THE BALL TO AIM', 'RELEASE TO SHOOT', 'BANK OFF THE RAILS', 'PUTT, CHIP OR SPIN: PICK YOUR SHOT'];
      const tutorialActive = this.phase === 'play' && !this.userPaused && !this.careerOpen && this.tutorialStep < 4 && this.tutorialTimer > 0 && this.transient.timer <= 0 && this.transientQueue.length === 0;
      const tutorialAlpha = tutorialActive ? (motionEnabled() ? clamp(this.tutorialTimer / 0.5, 0, 0.8) : 0.8) : 0;
      if (tutorialAlpha > 0) {
        this.uiG.fillStyle(PAL.deep, tutorialAlpha * 0.7);
        this.uiG.fillRoundedRect(320, 90, 640, 38, 10);
        this.uiG.lineStyle(1, style.line, tutorialAlpha * 0.3);
        this.uiG.strokeRoundedRect(320, 90, 640, 38, 10);
      }
      const briefActive = !tutorialActive && this.phase === 'play' && !this.userPaused && !this.careerOpen
        && this.briefTimer > 0 && this.transient.timer <= 0 && this.transientQueue.length === 0;
      const briefAlpha = briefActive ? (motionEnabled() ? clamp(this.briefTimer / 0.5, 0, 0.9) : 0.9) : 0;
      if (briefAlpha > 0) {
        this.uiG.fillStyle(PAL.deep, briefAlpha * 0.72);
        this.uiG.fillRoundedRect(240, 90, 800, 38, 10);
        this.uiG.lineStyle(1, style.accent, briefAlpha * 0.4);
        this.uiG.strokeRoundedRect(240, 90, 800, 38, 10);
      }
      this.setTextIfChanged(this.labels.tutorial, tutorialActive ? tutorialLines[this.tutorialStep] : (briefActive ? this.briefText : ''));
      this.labels.tutorial.setAlpha(tutorialActive ? tutorialAlpha : briefAlpha);
      this.labels.tutorial.setColor(briefActive && !tutorialActive ? '#ffe9a8' : '#c6f0e2');

      const chipActive = this.phase === 'play' && !this.userPaused && !this.careerOpen && this.transient.timer > 0;
      if (chipActive) {
        const chipAlpha = motionEnabled()
          ? Math.min(clamp((this.transient.max - this.transient.timer) / 0.08, 0, 1), clamp(this.transient.timer / 0.18, 0, 1)) * 0.95
          : 0.95;
        this.uiG.fillStyle(PAL.deep, chipAlpha * 0.9);
        this.uiG.fillRoundedRect(960, 94, 272, 40, 12);
        this.uiG.lineStyle(1.4, style.accent, chipAlpha * 0.7);
        this.uiG.strokeRoundedRect(960, 94, 272, 40, 12);
        this.setTextIfChanged(this.labels.toast, this.transient.text);
        this.labels.toast.setAlpha(chipAlpha);
      } else {
        this.labels.toast.setAlpha(0);
      }

      const rivalText = this.mode === 'trick'
        ? `TRICK ${this.holeIndex + 1}/${this.course.holes.length}`
        : this.rival ? `RIVAL ${this.rival.strokes}${this.rival.finished ? '' : '…'}` : '';
      this.setTextIfChanged(this.labels.rival, this.phase === 'play' && !this.careerOpen ? rivalText : '');

      this.drawCards(style);

      this.setTextIfChanged(this.labels.hole, `${String(this.holeIndex + 1).padStart(2, '0')}/${this.course.holes.length}`);
      this.setTextIfChanged(this.labels.score, String(this.hole.shotCount));
      this.setTextIfChanged(this.labels.par, `P${this.hole.par}`);
      this.setTextIfChanged(this.labels.pickups, `⚡${this.inventory.power} ○${this.inventory.gimme} ◇${this.inventory.forgive}`);
      this.drawWipe();
    }

    drawCards(style) {
      const showResult = (this.phase !== 'play' || this.userPaused) && !this.careerOpen;
      this.resultPlate.setVisible(showResult);
      ['resultTitle', 'resultCopy', 'resultStats', 'resultExtra', 'resultAction'].forEach((key) => this.labels[key].setVisible(showResult));
      if (showResult) {
        const title = this.userPaused ? 'RANGE PAUSED' : this.result.title;
        const copy = this.userPaused ? 'The line is held. Resume when you are ready.' : this.result.copy;
        const stats = this.userPaused ? 'BALL, GATES AND CLOCK ARE FROZEN' : this.result.stats;
        const extra = this.userPaused ? `SHOT TYPE ${(SHOTS[this.shotIndex] || SHOTS[0]).name}` : (this.result.extra || '');
        const action = this.userPaused ? 'RESUME' : this.result.action;
        this.setTextIfChanged(this.labels.resultTitle, title);
        this.setTextIfChanged(this.labels.resultCopy, copy);
        this.setTextIfChanged(this.labels.resultStats, stats);
        this.setTextIfChanged(this.labels.resultExtra, extra);
        this.setTextIfChanged(this.labels.resultAction, action);
        this.uiG.fillStyle(style.accent, 0.95);
        this.uiG.fillRoundedRect(ACTION_RECT.x, ACTION_RECT.y, ACTION_RECT.w, ACTION_RECT.h, 14);
        this.uiG.lineStyle(2, 0xffffff, 0.4);
        this.uiG.strokeRoundedRect(ACTION_RECT.x, ACTION_RECT.y, ACTION_RECT.w, ACTION_RECT.h, 14);
      }
      this.careerPlate.setVisible(this.careerOpen);
      this.labels.careerTitle.setVisible(this.careerOpen);
      this.labels.careerHint.setVisible(this.careerOpen);
      if (!this.careerOpen) { this.careerLines.forEach((line) => line.setVisible(false)); return; }
      const career = progress.career;
      const medal = (id) => ['—', 'BRONZE', 'SILVER', 'GOLD'][clamp(progress.medals[id] || 0, 0, 3)];
      const best = (mode, id) => (progress.best[mode] && Number.isInteger(progress.best[mode][id])) ? String(progress.best[mode][id]) : '—';
      const cleared = CHALLENGE_IDS.filter((id) => progress.challenges[id] > 0).length;
      const lines = [
        'COURSE MEDALS',
        `GARDEN GREEN   ${medal('garden-green')}   BEST ${best('tour', 'garden-green')}`,
        `FROSTLINE      ${medal('frostline-cavern')}   BEST ${best('tour', 'frostline-cavern')}`,
        `DUNEVEIL       ${medal('duneveil-desert')}   BEST ${best('tour', 'duneveil-desert')}`,
        `CLOCKWORK      ${medal('clockwork-yard')}   BEST ${best('tour', 'clockwork-yard')}`,
        `CROWN          ${medal('championship-crown')}   BEST ${best('championship', 'championship-crown')}`,
        `SEEDED BEST    ${best('seeded', this.course.family.id)}`,
        `TRICK SET      ${cleared}/${CHALLENGE_IDS.length} CLEARED`,
        'CAREER',
        `HOLES PLAYED   ${career.holesPlayed}`,
        `ACES           ${career.aces}`,
        `EAGLES         ${career.eagles}`,
        `BIRDIES        ${career.birdies}`,
        `PARS           ${career.pars}`,
        `RIVAL RECORD   ${career.rivalWins} - ${career.rivalLosses}`,
        `BEST BANK RUN  ${career.bestBank}   PORTALS ${career.portalsUsed}`
      ];
      this.careerLines.forEach((line, i) => {
        line.setVisible(true);
        const value = lines[i] || '';
        this.setTextIfChanged(line, value);
        line.setColor(value === 'COURSE MEDALS' || value === 'CAREER' ? '#8cf4d1' : '#cfeee6');
      });
      this.uiG.fillStyle(PAL.deep, 0.4);
      this.uiG.fillRoundedRect(CAREER_RECT.x + 24, 596, CAREER_RECT.w - 48, 46, 12);
      this.uiG.lineStyle(1.4, style.line, 0.3);
      this.uiG.strokeRoundedRect(CAREER_RECT.x + 24, 596, CAREER_RECT.w - 48, 46, 12);
      this.setTextIfChanged(this.labels.careerHint, 'TAP CARD OR PRESS C TO RETURN TO THE RANGE');
    }

    drawWipe() {
      this.wipeG.clear();
      if (this.transition.timer <= 0) return;
      const k = 1 - this.transition.timer / this.transition.duration;
      const cover = k < 0.5 ? k * 2 : (1 - k) * 2;
      const eased = cover * cover * (3 - 2 * cover);
      const bands = 5;
      for (let i = 0; i < bands; i++) {
        const h = GAME_H / bands;
        const w = GAME_W * eased * (1 + (i % 2 ? 0.06 : -0.04));
        const x = i % 2 ? GAME_W - w : 0;
        this.wipeG.fillStyle(i % 2 ? 0x0b252b : 0x071116, 0.97);
        this.wipeG.fillRect(x, i * h, w, h + 1);
        this.wipeG.fillStyle(PAL.mint, 0.16 * eased);
        this.wipeG.fillRect(i % 2 ? x : x + w - 6, i * h, 6, h + 1);
      }
    }

    setTextIfChanged(text, value) {
      const key = text._rrKey || `${text.x}:${text.y}`;
      if (this.uiCache[key] !== value) { text.setText(value); this.uiCache[key] = value; }
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: Math.round(GAME_W * DPR),
    height: Math.round(GAME_H * DPR),
    backgroundColor: '#071116',
    render: { antialias: true, antialiasGL: false, powerPreference: 'high-performance', roundPixels: false },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: Math.round(GAME_W * DPR),
      height: Math.round(GAME_H * DPR)
    },
    scene: [RicochetScene]
  });
  void game;
})();
