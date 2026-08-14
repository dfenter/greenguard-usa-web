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
  const STYLES = {
    garden: { base: 0x123e35, floor: 0x164d3e, line: 0x9af5c0, accent: 0xffd978, surface: 0x6fdc9b, water: 0x47c4d4 },
    ice: { base: 0x102f43, floor: 0x174a60, line: 0x98efff, accent: 0xc9f7ff, surface: 0x95eaff, water: 0x4dbce7 },
    desert: { base: 0x4b2b29, floor: 0x704333, line: 0xffc279, accent: 0xffedaa, surface: 0xe0a064, water: 0x68c2cf },
    clockwork: { base: 0x302435, floor: 0x493048, line: 0xffc676, accent: 0xffe0a1, surface: 0xffa96c, water: 0x61cad2 },
    championship: { base: 0x172b37, floor: 0x234355, line: 0xf9d47d, accent: 0x9ff7de, surface: 0xc5a4ff, water: 0x55d4dd }
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
  const MODE_NAMES = { tour: 'TOUR', trick: 'TRICK SHOT', championship: 'CHAMPIONSHIP' };
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

  const defaultSave = () => ({
    version: 1, tutorialSeen: false, unlocked: 1,
    medals: { 'garden-green': 0, 'frostline-cavern': 0, 'duneveil-desert': 0, 'clockwork-yard': 0, 'championship-crown': 0 },
    best: { tour: {}, trick: {}, championship: {} }
  });
  const MAX_SAVED_STROKES = 18 * (Math.max(...PARS) + 6);
  function validSave(value) {
    if (!value || value.version !== 1 || typeof value.tutorialSeen !== 'boolean') return false;
    if (!Number.isInteger(value.unlocked) || value.unlocked < 1 || value.unlocked > 5) return false;
    if (!value.medals || typeof value.medals !== 'object' || Array.isArray(value.medals)) return false;
    const keys = Object.keys(value.medals);
    if (keys.length !== COURSE_FAMILIES.length || keys.some((key) => !FAMILY_BY_ID[key] || !Number.isInteger(value.medals[key]) || value.medals[key] < 0 || value.medals[key] > 3)) return false;
    if (!value.best || typeof value.best !== 'object' || Array.isArray(value.best)) return false;
    for (const mode of ['tour', 'trick', 'championship']) {
      if (!value.best[mode] || typeof value.best[mode] !== 'object' || Array.isArray(value.best[mode])) return false;
      if (Object.keys(value.best[mode]).some((key) => !FAMILY_BY_ID[key] || !Number.isInteger(value.best[mode][key]) || value.best[mode][key] < 0 || value.best[mode][key] > MAX_SAVED_STROKES)) return false;
    }
    return true;
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
    validateSave: validSave,
    onPause: () => { if (activeScene) activeScene.onKitPause(); },
    onResume: () => { if (activeScene) activeScene.onKitResume(); },
    onRestart: () => { if (activeScene) activeScene.restartFromKit(); }
  });
  kit.audio.register(AUDIO);
  kit.registerPWA();
  let progress = kit.save.get(defaultSave());
  if (!validSave(progress)) progress = defaultSave();
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
      hole.gates.push({
        x: vertical ? 520 + g * 160 : 255 + g * 250,
        y: vertical ? 256 : 332 + (g % 2) * 72,
        length: vertical ? 116 + difficulty * 18 : 176 + difficulty * 24,
        amp: vertical ? 18 + difficulty * 22 : 22 + difficulty * 30,
        speed: 1.05 + difficulty * 0.44 + g * 0.19,
        phase: rng.range(0, TAU), axis: vertical ? 'y' : 'x'
      });
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
  function buildCourse(family, mode) {
    const seed = (family.seed ^ (mode === 'trick' ? 0x5157 : mode === 'championship' ? 0xC0A1 : 0x7007)) >>> 0;
    const holes = family.holes.map((spec, index) => buildHole(family, spec, index, seed, mode));
    return { family, mode, seed, holes, parTotal: holes.reduce((sum, hole) => sum + hole.par, 0), scores: Array(18).fill(null) };
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

  class RicochetScene extends Phaser.Scene {
    constructor() { super({ key: 'RicochetScene' }); }

    preload() {
      this.load.svg('rr-ball', 'assets/ball.svg', { width: 96, height: 96 });
      this.load.svg('rr-particle', 'assets/particle.svg', { width: 32, height: 32 });
      this.load.svg('rr-seal', 'assets/range-seal.svg', { width: 160, height: 160 });
    }

    create() {
      activeScene = this;
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
      this.aim = { active: false, dir: { x: 0, y: -1 }, power: 0, pull: 0, point: { x: 0, y: 0 } };
      this.shotOrigin = { x: 0, y: 0 };
      this.bouncedThisShot = false;
      this.panLast = null;
      this.panOffset = { x: 0, y: 0 };
      this.pointerClaims = new Map();
      this.previousKeys = new Set();
      this.segmentScratch = [];
      this.gateRuntime = [];
      this.transient = { text: '', timer: 0, max: 0 };
      this.transientQueue = [];
      this.result = { title: '', copy: '', stats: '', action: 'NEXT HOLE' };
      this.cameraKick = { x: 0, y: 0 };
      this.inventory = { power: 2, gimme: 1, forgive: 1 };
      this.tutorialStep = progress.tutorialSeen ? 3 : 0;
      this.tutorialTimer = 0;
      this.uiCache = Object.create(null);
      this.particles = [];
      this.rings = [];
      this.trail = [];
      this.gamepadButtons = new Set();
      this.userPaused = false;
      this.lastGamepadAim = { x: 0, y: -1 };
      for (let i = 0; i < 220; i++) this.particles.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, size: 0, color: PAL.mint, kind: 0 });
      for (let i = 0; i < 28; i++) this.rings.push({ alive: false, x: 0, y: 0, age: 0, life: 0.5, color: PAL.mint, size: 0 });
      for (let i = 0; i < 42; i++) this.trail.push({ alive: false, x: 0, y: 0, age: 0, life: 0.28, color: PAL.mint });
      this.emitters = {
        trail: this.add.particles(0, 0, 'rr-particle', { lifespan: 260, speed: 0, scale: { start: 0.34, end: 0 }, alpha: { start: 0.42, end: 0 }, blendMode: Phaser.BlendModes.ADD, emitting: false }),
        sparks: this.add.particles(0, 0, 'rr-particle', { lifespan: { min: 180, max: 360 }, speed: { min: 55, max: 190 }, scale: { start: 0.3, end: 0 }, alpha: { start: 0.75, end: 0 }, blendMode: Phaser.BlendModes.ADD, emitting: false }),
        pickups: this.add.particles(0, 0, 'rr-particle', { lifespan: { min: 340, max: 620 }, speed: { min: 30, max: 110 }, scale: { start: 0.42, end: 0 }, alpha: { start: 0.8, end: 0 }, blendMode: Phaser.BlendModes.ADD, emitting: false }),
        finish: this.add.particles(0, 0, 'rr-particle', { lifespan: { min: 520, max: 900 }, speed: { min: 90, max: 260 }, scale: { start: 0.58, end: 0 }, alpha: { start: 0.95, end: 0 }, blendMode: Phaser.BlendModes.ADD, emitting: false })
      };
      this.buildDisplay();
      this.root.add(Object.values(this.emitters));
      this.startCourse(0, 'tour', 0);
      this.applyForceSwitches();
      this.syncState();
      startAmbient();
    }

    buildDisplay() {
      this.root = this.add.container(0, 0).setDepth(1);
      this.bgG = this.add.graphics();
      this.sealA = this.add.image(120, 186, 'rr-seal').setAlpha(0.17).setBlendMode(Phaser.BlendModes.ADD);
      this.sealB = this.add.image(1158, 594, 'rr-seal').setAlpha(0.12).setScale(0.78).setBlendMode(Phaser.BlendModes.ADD);
      this.courseG = this.add.graphics();
      this.previewG = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      this.actorG = this.add.graphics();
      this.fxG = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      this.ballSprite = this.add.image(0, 0, 'rr-ball').setDisplaySize(58, 58).setBlendMode(Phaser.BlendModes.NORMAL);
      this.root.add([this.bgG, this.sealA, this.sealB, this.courseG, this.previewG, this.actorG, this.ballSprite, this.fxG]);
      this.uiG = this.add.graphics().setDepth(20);
      const textStyle = { fontFamily: 'Trebuchet MS, Verdana, sans-serif', color: '#eafff7', fontSize: '20px', fontStyle: 'bold', resolution: 2 };
      const smallStyle = { ...textStyle, fontSize: '16px', color: '#8eaea9', letterSpacing: 1 };
      const label = (x, y, value, style = textStyle) => {
        const text = this.add.text(x, y, value, style).setDepth(22);
        text._rrKey = `${x}:${y}`;
        return text;
      };
      this.labels = {
        brand: label(48, 25, 'RICOCHET RANGE', { ...textStyle, fontSize: '19px', color: '#8cf4d1' }),
        sub: label(49, 49, 'FLEET F4 // BANK SHOT LAB', { ...smallStyle, fontSize: '13px' }),
        mode: label(270, 27, 'TOUR', { ...textStyle, fontSize: '16px', color: '#ffd978' }),
        course: label(270, 48, 'GARDEN GREEN', smallStyle),
        tourButton: label(407, 38, 'TOUR', { ...textStyle, fontSize: '14px', align: 'center' }).setOrigin(0.5),
        trickButton: label(543, 38, 'TRICK', { ...textStyle, fontSize: '14px', align: 'center' }).setOrigin(0.5),
        championshipButton: label(702, 38, 'CROWN', { ...textStyle, fontSize: '14px', align: 'center' }).setOrigin(0.5),
        courseButton: label(1110, 38, 'NEXT', { ...textStyle, fontSize: '14px', align: 'center' }).setOrigin(0.5),
        hole: label(64, 27, '01/18', { ...textStyle, fontSize: '22px', align: 'center' }).setOrigin(0.5, 0),
        holeName: label(642, 52, 'SEEDLING BEND', smallStyle).setOrigin(0.5, 0),
        score: label(814, 25, '0', { ...textStyle, fontSize: '22px', align: 'center' }).setOrigin(0.5, 0),
        scoreLabel: label(804, 52, 'STROKES', smallStyle).setOrigin(0.5, 0),
        par: label(880, 25, 'P3', { ...textStyle, fontSize: '18px', align: 'center', color: '#ffd978' }).setOrigin(0.5, 0),
        parLabel: label(890, 52, 'PAR', smallStyle).setOrigin(0.5, 0),
        pickups: label(962, 27, '⚡2  ○1  ◇1', { ...textStyle, fontSize: '15px', color: '#ffd978' }).setOrigin(0.5, 0),
        pickupLabel: label(998, 52, 'P AUTO // GIMME // SAVE', { ...smallStyle, fontSize: '12px' }).setOrigin(0.5, 0),
        tutorial: label(640, 91, '', { ...smallStyle, color: '#b8e9dc', align: 'center' }).setOrigin(0.5, 0),
        toast: label(1098, 122, '', { ...textStyle, fontSize: '15px', color: '#ffd978', align: 'center' }).setOrigin(0.5, 0),
        resultTitle: label(640, 246, '', { ...textStyle, fontSize: '28px', color: '#eafff7', align: 'center' }).setOrigin(0.5),
        resultCopy: label(640, 292, '', { ...smallStyle, fontSize: '13px', color: '#b8d8d0', align: 'center' }).setOrigin(0.5),
        resultStats: label(640, 347, '', { ...textStyle, fontSize: '19px', color: '#ffd978', align: 'center' }).setOrigin(0.5),
        resultAction: label(640, 425, '', { ...textStyle, fontSize: '13px', color: '#071116', align: 'center' }).setOrigin(0.5)
      };
      this.labels.controlSettings = label(66, 677, '⚙', { ...textStyle, fontSize: '18px', align: 'center', color: '#c8e8df' }).setOrigin(0.5);
      this.labels.controlRestart = label(142, 677, '↻', { ...textStyle, fontSize: '20px', align: 'center', color: '#c8e8df' }).setOrigin(0.5);
      this.labels.controlPause = label(218, 677, 'Ⅱ', { ...textStyle, fontSize: '17px', align: 'center', color: '#c8e8df' }).setOrigin(0.5);
      this.labels.brand.setVisible(false);
      this.labels.sub.setVisible(false);
      this.labels.mode.setVisible(false);
      this.labels.course.setVisible(false);
      this.labels.holeName.setVisible(false);
      this.labels.scoreLabel.setVisible(false);
      this.labels.parLabel.setVisible(false);
      this.labels.pickupLabel.setVisible(false);
      this.labels.resultTitle.setVisible(false);
      this.labels.resultCopy.setVisible(false);
      this.labels.resultStats.setVisible(false);
      this.labels.resultAction.setVisible(false);
    }

    startCourse(index, mode, holeIndex) {
      this.mode = MODE_NAMES[mode] ? mode : 'tour';
      let familyIndex = clamp(Math.floor(Number(index) || 0), 0, COURSE_FAMILIES.length - 1);
      if (this.mode === 'championship') familyIndex = 4;
      const family = getFamily(familyIndex);
      this.courseIndex = family.index;
      this.course = buildCourse(family, this.mode);
      this.inventory = { power: 2, gimme: 1, forgive: 1 };
      this.userPaused = false;
      this.phase = 'play';
      this.hideResult();
      this.holeIndex = clamp(Math.floor(Number(holeIndex) || 0), 0, 17);
      this.startHole(this.holeIndex);
    }

    resetHoleMutableState(hole) {
      hole.shotCount = 0;
      for (let i = 0; i < hole.pickups.length; i++) hole.pickups[i].taken = false;
      for (let i = 0; i < hole.boosts.length; i++) hole.boosts[i].cooldown = 0;
    }

    startHole(index) {
      if (!this.course || !this.course.holes[index]) return;
      this.holeIndex = clamp(index, 0, 17);
      this.course.scores[this.holeIndex] = null;
      this.hole = this.course.holes[this.holeIndex];
      this.resetHoleMutableState(this.hole);
      this.panOffset.x = 0;
      this.panOffset.y = 0;
      this.gateRuntime = this.hole.gates.map(() => ({ x1: 0, y1: 0, x2: 0, y2: 0, kind: 'gate' }));
      this.ball = { x: this.hole.start.x, y: this.hole.start.y, vx: 0, vy: 0, r: 14, moving: false, shotTime: 0, boostCooldown: 0, gimmickCooldown: 0 };
      this.ballVisualState = 'idle';
      this.aim.dir = unit(this.hole.cup.x - this.ball.x, this.hole.cup.y - this.ball.y);
      this.aim.power = 0;
      this.aim.pull = 0;
      this.aim.active = false;
      this.shotOrigin.x = this.ball.x;
      this.shotOrigin.y = this.ball.y;
      this.bouncedThisShot = false;
      this.lastTrickReject = -1;
      this.phase = 'play';
      this.clearFx();
      this.tutorialStep = progress.tutorialSeen ? 3 : this.tutorialStep;
      this.transient.timer = 0;
      this.transientQueue.length = 0;
      this.tutorialTimer = this.tutorialStep < 3 ? 3 : 0;
      this.syncState();
    }

    restartFromKit() {
      this.pointerClaims.clear();
      this.panLast = null;
      this.previousKeys.clear();
      this.userPaused = false;
      kit.audio.resume();
      if (this.course) this.startHole(this.holeIndex);
    }

    onKitPause() {
      this.accumulator = 0;
      this.pointerClaims.clear();
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
        this.startCourse(family.index, family.index === 4 ? 'championship' : this.mode, 0);
      }
      if (requestedHole != null && requestedHole !== this.lastForcedHole) {
        const raw = Number(requestedHole);
        const index = raw >= 1 ? clamp(Math.floor(raw) - 1, 0, 17) : clamp(Math.floor(raw), 0, 17);
        this.lastForcedHole = requestedHole;
        this.startHole(index);
      }
    }

    update(_time, delta) {
      this.applyForceSwitches();
      this.pollInput();
      if (!kit.paused && !this.userPaused) {
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
      if (this.transient.timer > 0) {
        this.transient.timer = Math.max(0, this.transient.timer - dt);
        if (this.transient.timer === 0) this.startNextTransient();
      } else {
        this.startNextTransient();
      }
      if (this.tutorialTimer > 0) this.tutorialTimer = Math.max(0, this.tutorialTimer - dt);
      this.updateParticles(dt);
      if (this.phase !== 'play') { this.syncState(); return; }
      this.hole.gates.forEach((gate, i) => {
        const out = this.gateRuntime[i];
        const travel = Math.sin(this.simTime * gate.speed + gate.phase) * gate.amp;
        if (gate.axis === 'x') { out.x1 = gate.x + travel; out.y1 = gate.y; out.x2 = gate.x + gate.length + travel; out.y2 = gate.y; }
        else { out.x1 = gate.x; out.y1 = gate.y + travel; out.x2 = gate.x; out.y2 = gate.y + gate.length + travel; }
      });
      if (!this.ball.moving) { this.syncState(); return; }
      this.ball.shotTime += dt;
      this.ball.boostCooldown = Math.max(0, this.ball.boostCooldown - dt);
      this.ball.gimmickCooldown = Math.max(0, this.ball.gimmickCooldown - dt);
      for (let i = 0; i < this.hole.boosts.length; i++) this.hole.boosts[i].cooldown = Math.max(0, this.hole.boosts[i].cooldown - dt);
      this.applyGimmick(dt);
      const beforeX = this.ball.x, beforeY = this.ball.y;
      this.ball.x += this.ball.vx * dt;
      this.ball.y += this.ball.vy * dt;
      this.addTrail(beforeX, beforeY, this.ball.vx, this.ball.vy);
      const impact = this.collideBall();
      if (impact) {
        this.bouncedThisShot = true;
        this.spawnImpact(this.ball.x, this.ball.y, impact === 'gate' ? PAL.yellow : PAL.mint, impact === 'bumper' ? 12 : 8);
        cue(impact === 'gate' ? 'gate-impact' : 'impact');
        juiceShake(impact === 'bumper' ? 4 : 2.4, impact === 'bumper' ? 100 : 70);
        juiceStop(impact === 'bumper' ? 24 : 12);
        if (this.tutorialStep === 2) this.advanceTutorial();
      }
      this.applySurfaceDrag(dt);
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
        if (this.mode === 'trick' && !this.bouncedThisShot) { this.rejectTrickSink(); return; }
        this.sinkBall();
        return;
      }
      if (gimmeAssist) {
        if (this.mode === 'trick' && !this.bouncedThisShot) { this.rejectTrickSink(); return; }
        this.inventory.gimme -= 1;
        this.showToast('GIMME', 0.7);
        this.sinkBall();
        return;
      }
      if (speed < 16 && this.ball.shotTime > 0.18) this.stopBall();
      this.syncState();
    }

    collideBall() {
      let impact = null;
      this.collectSegments();
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < this.segmentScratch.length; i++) {
          const seg = this.segmentScratch[i];
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
      for (let i = 0; i < this.hole.sand.length; i++) if (pointInRect(this.hole.sand[i], this.ball.x, this.ball.y)) drag = 0.37;
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
        this.ball.x = this.shotOrigin.x;
        this.ball.y = this.shotOrigin.y;
        this.ball.vx = 0;
        this.ball.vy = 0;
        this.ball.moving = false;
        this.spawnImpact(this.ball.x, this.ball.y, PAL.water, 22);
        this.showToast(saved ? 'WATER // SAVED' : 'WATER +1', 0.8);
        cue('water');
        if (!saved) this.hole.shotCount += 1;
        if (this.hole.shotCount >= STROKE_CAP) this.finishHole(true);
        return true;
      }
      return false;
    }

    stopBall() {
      this.ball.vx = 0;
      this.ball.vy = 0;
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
      this.ball.moving = false;
      this.ballVisualState = 'sink';
      this.spawnSink(this.ball.x, this.ball.y);
      cue('putt');
      juiceShake(6, 170);
      juiceStop(34);
      this.finishHole(false);
    }

    finishHole(forced) {
      if (this.phase !== 'play') return;
      if (forced) this.ball.moving = false;
      this.phase = 'holeComplete';
      const score = forced ? this.hole.par + 6 : this.hole.shotCount;
      this.course.scores[this.holeIndex] = score;
      this.courseTotal = this.course.scores.reduce((sum, value) => sum + (value || 0), 0);
      const delta = score - this.hole.par;
      this.result.title = this.hole.shotCount === 1 ? 'HOLE IN ONE' : forced ? 'THE RANGE MOVES ON' : (delta <= 0 ? 'SWEET POCKET' : 'LINE CLEARED');
      this.result.copy = forced ? 'Stroke cap reached. The +6 finish is logged.' : `${getGimmickName(this.hole.gimmick)} gave you a lane.`;
      this.result.stats = `${score} STROKES    ${fmtDelta(delta)} VS PAR    ${this.courseTotal} RUNNING`;
      this.result.action = this.holeIndex === 17 ? 'SEE FINAL CARD' : 'NEXT HOLE';
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
      this.result.title = `${label} // ${this.course.family.short}`;
      this.result.copy = this.mode === 'tour' ? 'The next range is open. Keep the bank alive.' : 'A fresh seeded card is ready when you are.';
      this.result.stats = `${this.courseTotal} STROKES    ${fmtDelta(delta)} VS PAR    PAR ${this.course.parTotal}`;
      this.result.action = this.mode === 'championship' ? 'REPLAY CHAMPIONSHIP' : 'NEXT COURSE';
      cue('course-clear');
      juiceShake(7, 240);
      this.syncState();
    }

    advance() {
      if (this.phase === 'holeComplete') {
        if (this.holeIndex === 17) this.finishCourse();
        else this.startHole(this.holeIndex + 1);
      } else if (this.phase === 'courseComplete') {
        if (this.mode === 'tour') {
          const next = clamp(this.courseIndex + 1, 0, 3);
          this.startCourse(next, 'tour', 0);
        } else if (this.mode === 'championship') this.startCourse(4, 'championship', 0);
        else this.startCourse(this.courseIndex, 'trick', 0);
      }
    }

    startMode(mode, index = this.courseIndex) {
      if (!MODE_NAMES[mode]) return;
      if (mode === 'championship' && progress.unlocked < 5 && requestedCourse == null) {
        this.showToast('LOCKED // CLEAR TOUR', 1.0);
        return;
      }
      const safeIndex = mode === 'championship' ? 4 : clamp(index, 0, mode === 'tour' ? 3 : 3);
      if (mode === 'tour' && safeIndex + 1 > progress.unlocked && requestedCourse == null) {
        this.showToast('LOCKED // EARN MEDAL', 1.0);
        return;
      }
      this.startCourse(safeIndex, mode, 0);
    }

    cycleCourse() {
      if (this.mode !== 'tour') return;
      const next = (this.courseIndex + 1) % 4;
      if (next + 1 > progress.unlocked) { this.showToast('LOCKED // EARN MEDAL', 0.9); return; }
      this.startCourse(next, 'tour', 0);
    }

    updateSaveIfNeeded() {
      if (!progress.tutorialSeen && this.tutorialStep >= 3) { progress.tutorialSeen = true; kit.save.set(progress); }
    }

    advanceTutorial() {
      if (progress.tutorialSeen || this.tutorialStep >= 3) return;
      this.tutorialStep += 1;
      this.tutorialTimer = this.tutorialStep < 3 ? 3 : 0;
      if (this.tutorialStep >= 3) { progress.tutorialSeen = true; kit.save.set(progress); }
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
    hideResult() { this.result.title = ''; this.labels.resultTitle.setVisible(false); this.labels.resultCopy.setVisible(false); this.labels.resultStats.setVisible(false); this.labels.resultAction.setVisible(false); }
    clearFx() {
      for (let i = 0; i < this.particles.length; i++) this.particles[i].alive = false;
      for (let i = 0; i < this.rings.length; i++) this.rings[i].alive = false;
      for (let i = 0; i < this.trail.length; i++) this.trail[i].alive = false;
      Object.values(this.emitters || {}).forEach((emitter) => emitter.stop());
    }

    emitParticles(name, x, y, count) {
      const emitter = this.emitters && this.emitters[name];
      if (emitter && typeof emitter.emitParticleAt === 'function') emitter.emitParticleAt(x, y, count);
    }

    spawnParticle(x, y, color, kind, speed, life, size) {
      let slot = this.particles.find((particle) => !particle.alive);
      if (!slot) slot = this.particles.reduce((oldest, particle) => particle.life < oldest.life ? particle : oldest, this.particles[0]);
      const index = this.particles.indexOf(slot);
      const angle = (index * 2.399963 + this.simTime * 0.5) % TAU;
      slot.alive = true; slot.x = x; slot.y = y; slot.vx = Math.cos(angle) * speed; slot.vy = Math.sin(angle) * speed;
      slot.life = life; slot.max = life; slot.size = size; slot.color = color; slot.kind = kind;
      return slot;
    }

    spawnImpact(x, y, color, count) {
      const amount = motionEnabled() ? count : Math.max(3, Math.floor(count * 0.35));
      this.emitParticles('sparks', x, y, Math.min(18, amount));
      for (let i = 0; i < amount; i++) this.spawnParticle(x, y, color, i % 3 === 0 ? 1 : 0, 55 + (i % 5) * 24, 0.28 + (i % 4) * 0.04, 2 + (i % 3));
      const ring = this.rings.find((candidate) => !candidate.alive) || this.rings.reduce((oldest, candidate) => candidate.age > oldest.age ? candidate : oldest, this.rings[0]);
      Object.assign(ring, { alive: true, x, y, age: 0, life: 0.38, color, size: 8 });
    }

    spawnSink(x, y) {
      const amount = motionEnabled() ? 42 : 10;
      this.emitParticles('finish', x, y, motionEnabled() ? 26 : 8);
      for (let i = 0; i < amount; i++) this.spawnParticle(x, y, i % 2 ? PAL.yellow : PAL.mint, 2, 75 + (i % 7) * 18, 0.56 + (i % 5) * 0.05, 2 + (i % 3));
      const ring = this.rings.find((candidate) => !candidate.alive) || this.rings.reduce((oldest, candidate) => candidate.age > oldest.age ? candidate : oldest, this.rings[0]);
      Object.assign(ring, { alive: true, x, y, age: 0, life: 0.8, color: PAL.yellow, size: 12 });
    }

    addTrail(x, y, vx, vy) {
      let slot = null;
      for (let i = 0; i < this.trail.length; i++) if (!this.trail[i].alive) { slot = this.trail[i]; break; }
      if (!slot) slot = this.trail[Math.floor(this.simTime * 90) % this.trail.length];
      slot.alive = true; slot.x = x; slot.y = y; slot.age = 0; slot.life = 0.28; slot.color = hypot(vx, vy) > 380 ? PAL.yellow : PAL.mint;
      if (hypot(vx, vy) > 250) this.emitParticles('trail', x, y, 1);
    }

    updateParticles(dt) {
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (!p.alive) continue;
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.91; p.vy *= 0.91; p.life -= dt;
        if (p.life <= 0) p.alive = false;
      }
      for (let i = 0; i < this.rings.length; i++) { const r = this.rings[i]; if (r.alive) { r.age += dt; if (r.age >= r.life) r.alive = false; } }
      for (let i = 0; i < this.trail.length; i++) { const t = this.trail[i]; if (t.alive) { t.age += dt; if (t.age >= t.life) t.alive = false; } }
    }

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

    uiPoint(point) { return point.y < 82 || (point.y > 660 && point.y < 720) || (this.userPaused || this.phase !== 'play') && point.x > 420 && point.x < 860 && point.y > 378 && point.y < 470; }
    buttonAt(point) {
      if (point.y >= 14 && point.y <= 72) {
        if (point.x >= 356 && point.x < 472) return 'tour';
        if (point.x >= 478 && point.x < 612) return 'trick';
        if (point.x >= 618 && point.x < 780) return 'championship';
        if (point.x >= 1036 && point.x < 1190) return 'course';
      }
      if (point.y >= 664 && point.y <= 710) {
        if (point.x >= 28 && point.x < 104) return 'settings';
        if (point.x >= 106 && point.x < 180) return 'restart';
        if (point.x >= 182 && point.x < 258) return 'pause';
      }
      if (this.userPaused && point.x >= 430 && point.x <= 850 && point.y >= 382 && point.y <= 466) return 'resume';
      if (this.phase !== 'play' && point.x >= 430 && point.x <= 850 && point.y >= 382 && point.y <= 466) return 'advance';
      return '';
    }

    pollInput() {
      if (kit.paused) return;
      const pointers = kit.input.pointers;
      const seen = new Set();
      const values = [...pointers.entries()];
      if (values.length >= 2) {
        if (!this.panLast) this.panLast = { x: (values[0][1].x + values[1][1].x) / 2, y: (values[0][1].y + values[1][1].y) / 2 };
        const midpoint = { x: (values[0][1].x + values[1][1].x) / 2, y: (values[0][1].y + values[1][1].y) / 2 };
        const rect = this.game.canvas.getBoundingClientRect();
        const deltaX = midpoint.x - this.panLast.x;
        const deltaY = midpoint.y - this.panLast.y;
        this.panLast.x = midpoint.x; this.panLast.y = midpoint.y;
        for (const [id, pointer] of values) { seen.add(id); if (!this.pointerClaims.has(id)) { pointer.zone = 'pan'; this.pointerClaims.set(id, { type: 'pan', start: this.worldPoint(pointer.startX, pointer.startY) }); } else this.pointerClaims.get(id).type = 'pan'; }
        if (rect.width > 0) {
          this.panOffset.x = clamp(this.panOffset.x + deltaX * GAME_W / rect.width, -60, 60);
          this.panOffset.y = clamp(this.panOffset.y + deltaY * GAME_H / Math.max(1, rect.height), -44, 44);
        }
        this.aim.active = false;
      } else {
        this.panLast = null;
        for (const [id, pointer] of values) {
          seen.add(id);
          let claim = this.pointerClaims.get(id);
          const point = this.worldPoint(pointer.x, pointer.y);
          if (!claim) {
            const start = this.screenPoint(pointer.startX, pointer.startY);
            const button = this.buttonAt(start);
            if (button || this.uiPoint(start)) { pointer.zone = 'ui'; claim = { type: 'ui', button, start, last: start }; }
            else if (!this.userPaused && this.phase === 'play' && !this.ball.moving && distance(point, this.ball) < 74) { pointer.zone = 'aim'; claim = { type: 'aim', start }; this.aim.active = true; }
            else { pointer.zone = 'play'; claim = { type: 'play', start }; }
            this.pointerClaims.set(id, claim);
          }
          if (claim.type === 'ui') claim.last = this.screenPoint(pointer.x, pointer.y);
          if (claim.type === 'aim' && this.phase === 'play' && !this.ball.moving) { this.aim.active = true; this.updateAim(point); }
        }
      }
      for (const [id, claim] of [...this.pointerClaims.entries()]) {
        if (seen.has(id)) continue;
        this.pointerClaims.delete(id);
        if (claim.type === 'aim' && this.phase === 'play' && this.aim.active) {
          if (this.aim.power > 12) this.shoot(this.aim.dir, this.aim.power);
          this.aim.active = false;
        } else if (claim.type === 'ui' && (!claim.button || this.buttonAt(claim.last) === claim.button)) this.handleTap(claim.button, claim.last);
      }
      const keys = ['Space', 'Enter', 'KeyR', 'KeyO', 'Digit1', 'Digit2', 'Digit3', 'BracketRight', 'BracketLeft', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];
      for (let i = 0; i < keys.length; i++) {
        const code = keys[i], down = kit.input.keyDown(code), was = this.previousKeys.has(code);
        if (down && !was) this.handleKey(code);
        if (down) this.previousKeys.add(code); else this.previousKeys.delete(code);
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
      if (mag > 0 && !this.userPaused && this.phase === 'play' && !this.ball.moving) {
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
      if (pressed(2)) kit.restart();
      if (pressed(3)) kit.openSettings();
      if (pressed(9)) this.toggleUserPause();
      this.gamepadButtons = current;
    }

    handleTap(button, point) {
      if (!button) button = this.buttonAt(point);
      if (button === 'tour') return this.startMode('tour', this.courseIndex);
      if (button === 'trick') return this.startMode('trick', this.courseIndex);
      if (button === 'championship') return this.startMode('championship', 4);
      if (button === 'course') return this.cycleCourse();
      if (button === 'settings') return kit.openSettings();
      if (button === 'restart') return kit.restart();
      if (button === 'pause' || button === 'resume') return this.toggleUserPause();
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
      if (this.userPaused) { if (code === 'Space' || code === 'Enter') this.toggleUserPause(); return; }
      if (code === 'Digit1') return this.startMode('tour', this.courseIndex);
      if (code === 'Digit2') return this.startMode('trick', this.courseIndex);
      if (code === 'Digit3') return this.startMode('championship', 4);
      if (code === 'BracketRight') return this.cycleCourse();
      if (code === 'BracketLeft' && this.mode === 'tour') return this.startCourse(Math.max(0, this.courseIndex - 1), 'tour', 0);
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
      this.shotOrigin.x = this.ball.x; this.shotOrigin.y = this.ball.y;
      const powerBall = this.inventory.power > 0;
      if (powerBall) this.inventory.power -= 1;
      const speed = clamp(power * (powerBall ? 2.55 : 2.18), 80, 1240);
      this.ball.vx = dir.x * speed; this.ball.vy = dir.y * speed; this.ball.moving = true; this.ball.shotTime = 0;
      this.ballVisualState = 'shot';
      this.bouncedThisShot = false;
      this.hole.shotCount += 1;
      this.aim.active = false;
      this.clearFx();
      this.spawnImpact(this.ball.x, this.ball.y, powerBall ? PAL.yellow : PAL.mint, 8);
      cue('putt');
      if (this.tutorialStep === 1) this.advanceTutorial();
      this.syncState();
    }

    previewPath() {
      const result = [];
      let origin = { x: this.ball.x, y: this.ball.y };
      let dir = this.aim.dir;
      let remaining = Math.max(420, this.aim.power * 1.62);
      this.collectSegments();
      for (let bounce = 0; bounce < 4 && remaining > 20; bounce++) {
        const nearest = this.trajectoryHit(origin, dir, remaining);
        if (!nearest) { result.push({ x1: origin.x, y1: origin.y, x2: origin.x + dir.x * remaining, y2: origin.y + dir.y * remaining, bounce: false }); break; }
        result.push({ x1: origin.x, y1: origin.y, x2: nearest.x, y2: nearest.y, bounce: true });
        let normal;
        if (nearest.bumper) normal = unit(nearest.x - nearest.bumper.x, nearest.y - nearest.bumper.y);
        else {
          const sx = nearest.seg.x2 - nearest.seg.x1, sy = nearest.seg.y2 - nearest.seg.y1;
          normal = unit(-sy, sx);
        }
        if (dir.x * normal.x + dir.y * normal.y > 0) normal = { x: -normal.x, y: -normal.y };
        const dot = dir.x * normal.x + dir.y * normal.y;
        dir = unit(dir.x - 2 * dot * normal.x, dir.y - 2 * dot * normal.y);
        remaining -= nearest.t;
        origin = { x: nearest.x + dir.x * 5, y: nearest.y + dir.y * 5 };
        dir = this.previewInfluence(origin, dir);
      }
      return result;
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
    }

    render() {
      if (!this.hole || !this.ball) return;
      this.root.x = this.panOffset.x + this.cameraKick.x;
      this.root.y = this.panOffset.y + this.cameraKick.y;
      const style = STYLES[this.course.family.style] || STYLES.garden;
      this.bgG.clear();
      this.bgG.fillGradientStyle(PAL.deep, PAL.deep, style.base, style.base, 1);
      this.bgG.fillRect(0, 0, GAME_W, GAME_H);
      this.bgG.fillStyle(style.base, 0.42); this.bgG.fillCircle(180, 340, 300); this.bgG.fillCircle(1110, 410, 280);
      this.courseG.clear();
      this.courseG.fillStyle(PAL.board, 0.98); this.courseG.fillRoundedRect(BOARD.left, BOARD.top, BOARD.right - BOARD.left, BOARD.bottom - BOARD.top, 30);
      this.courseG.lineStyle(2, style.line, 0.22); this.courseG.strokeRoundedRect(BOARD.left, BOARD.top, BOARD.right - BOARD.left, BOARD.bottom - BOARD.top, 30);
      this.courseG.fillStyle(style.floor, 0.95); this.courseG.fillRoundedRect(PLAY.left, PLAY.top, PLAY.right - PLAY.left, PLAY.bottom - PLAY.top, 24);
      this.drawGrid(style);
      this.drawSurfaces(style);
      this.drawAltRoute(style);
      this.drawGimmick(style);
      this.drawWalls(style);
      this.drawBoosts(style);
      this.drawBumpers(style);
      this.drawPickups(style);
      this.drawCup(style);
      this.drawAim(style);
      this.drawActors(style);
      this.drawFx();
      this.drawUi(style);
    }

    drawGrid(style) {
      this.courseG.lineStyle(1, style.line, 0.07);
      for (let x = PLAY.left + 18; x < PLAY.right; x += 42) { this.courseG.beginPath(); this.courseG.moveTo(x, PLAY.top); this.courseG.lineTo(x, PLAY.bottom); this.courseG.strokePath(); }
      for (let y = PLAY.top + 18; y < PLAY.bottom; y += 42) { this.courseG.beginPath(); this.courseG.moveTo(PLAY.left, y); this.courseG.lineTo(PLAY.right, y); this.courseG.strokePath(); }
      for (let i = 0; i < this.hole.stars.length; i++) { const star = this.hole.stars[i]; this.courseG.fillStyle(style.line, star.a); this.courseG.fillCircle(star.x, star.y, star.r); }
    }

    drawSurfaces(style) {
      const drawList = (list, color) => {
        for (let i = 0; i < list.length; i++) {
          const r = list[i];
          this.courseG.fillStyle(color, 0.16); this.courseG.fillRoundedRect(r.x, r.y, r.w, r.h, 12);
          this.courseG.lineStyle(2, color, 0.65); this.courseG.strokeRoundedRect(r.x, r.y, r.w, r.h, 12);
          this.courseG.lineStyle(2, color, 0.22);
          for (let x = r.x - r.h; x < r.x + r.w; x += 16) { this.courseG.beginPath(); this.courseG.moveTo(x, r.y + r.h); this.courseG.lineTo(x + r.h, r.y); this.courseG.strokePath(); }
        }
      };
      drawList(this.hole.sand, PAL.sand);
      drawList(this.hole.ice, PAL.ice);
      drawList(this.hole.water, PAL.water);
      for (let i = 0; i < this.hole.water.length; i++) {
        const r = this.hole.water[i];
        this.courseG.lineStyle(2, PAL.ice, 0.32);
        for (let x = r.x + 14; x < r.x + r.w - 8; x += 38) { this.courseG.beginPath(); this.courseG.arc(x, r.y + r.h * 0.5, 12, Math.PI, TAU); this.courseG.strokePath(); }
      }
    }

    drawAltRoute(style) {
      this.courseG.lineStyle(2, style.accent, 0.22);
      const points = this.hole.altWaypoints;
      for (let i = 0; i < points.length - 1; i++) this.dashedLine(this.courseG, points[i], points[i + 1], 10, 9);
      const mid = points[1];
      this.courseG.fillStyle(style.accent, 0.58); this.courseG.fillCircle(mid.x, mid.y, 3);
    }

    dashedLine(graphics, a, b, dash, gap) {
      const len = distance(a, b), ux = (b.x - a.x) / Math.max(1, len), uy = (b.y - a.y) / Math.max(1, len);
      for (let d = 0; d < len; d += dash + gap) { const e = Math.min(len, d + dash); graphics.beginPath(); graphics.moveTo(a.x + ux * d, a.y + uy * d); graphics.lineTo(a.x + ux * e, a.y + uy * e); graphics.strokePath(); }
    }

    drawWalls(style) {
      this.collectSegments();
      for (let i = 0; i < this.segmentScratch.length; i++) {
        const seg = this.segmentScratch[i];
        const color = seg.kind === 'gate' ? PAL.yellow : seg.kind === 'rail' ? style.line : style.accent;
        this.courseG.lineStyle(seg.kind === 'rail' ? 12 : 14, PAL.deep, 0.6); this.courseG.beginPath(); this.courseG.moveTo(seg.x1, seg.y1 + 5); this.courseG.lineTo(seg.x2, seg.y2 + 5); this.courseG.strokePath();
        this.courseG.lineStyle(seg.kind === 'rail' ? 6 : 8, color, 0.96); this.courseG.beginPath(); this.courseG.moveTo(seg.x1, seg.y1); this.courseG.lineTo(seg.x2, seg.y2); this.courseG.strokePath();
        this.courseG.lineStyle(2, PAL.ink, 0.26); this.courseG.beginPath(); this.courseG.moveTo(seg.x1, seg.y1 - 2); this.courseG.lineTo(seg.x2, seg.y2 - 2); this.courseG.strokePath();
      }
    }

    drawBoosts(style) {
      for (let i = 0; i < this.hole.boosts.length; i++) {
        const pad = this.hole.boosts[i];
        this.courseG.fillStyle(PAL.yellow, 0.15); this.courseG.fillRoundedRect(pad.x, pad.y, pad.w, pad.h, 8);
        this.courseG.lineStyle(2, PAL.yellow, 0.9); this.courseG.strokeRoundedRect(pad.x, pad.y, pad.w, pad.h, 8);
        const cx = pad.x + pad.w / 2, cy = pad.y + pad.h / 2;
        this.courseG.fillStyle(style.accent, 0.95); this.courseG.fillTriangle(cx - pad.dir.x * 22 - pad.dir.y * 11, cy - pad.dir.y * 22 + pad.dir.x * 11, cx + pad.dir.x * 23, cy + pad.dir.y * 23, cx - pad.dir.x * 22 + pad.dir.y * 11, cy - pad.dir.y * 22 - pad.dir.x * 11);
      }
    }

    drawBumpers(style) {
      for (let i = 0; i < this.hole.bumpers.length; i++) {
        const b = this.hole.bumpers[i];
        this.courseG.fillStyle(PAL.deep, 0.62); this.courseG.fillCircle(b.x, b.y + 5, b.r + 5);
        this.courseG.fillStyle(PAL.violet, 0.9); this.courseG.fillCircle(b.x, b.y, b.r);
        this.courseG.lineStyle(2, PAL.ink, 0.7); this.courseG.strokeCircle(b.x, b.y, b.r);
        this.courseG.lineStyle(2, style.accent, 0.72); this.courseG.beginPath(); this.courseG.arc(b.x, b.y, b.r - 6, this.simTime * 1.4 + b.phase, this.simTime * 1.4 + b.phase + Math.PI * 1.2); this.courseG.strokePath();
      }
    }

    drawGimmick(style) {
      const type = this.hole.gimmick, behavior = GIMMICK_REGISTRY[type], point = this.hole.gimmickPoint;
      if (!behavior || !point) return;
      const x = point.x, y = point.y, r = point.r;
      const color = behavior.visual === 'ice' || behavior.visual === 'crystal' ? PAL.ice : behavior.visual === 'sand' || behavior.visual === 'sandglass' ? PAL.sand : behavior.visual === 'crown' || behavior.visual === 'combo' || behavior.visual === 'champion' ? PAL.coral : behavior.visual === 'water' ? PAL.water : style.accent;
      this.courseG.fillStyle(color, 0.1); this.courseG.fillCircle(x, y, r);
      this.courseG.lineStyle(2, color, 0.7); this.courseG.beginPath(); this.courseG.arc(x, y, r, 0, TAU); this.courseG.strokePath();
      this.courseG.lineStyle(3, color, 0.74);
      if (['vortex', 'oak', 'crown', 'combo'].includes(behavior.visual)) {
        for (let ring = 20; ring < r - 4; ring += 25) { this.courseG.beginPath(); this.courseG.arc(x, y, ring, this.simTime * (ring % 50 ? 0.72 : -0.58), this.simTime * (ring % 50 ? 0.72 : -0.58) + Math.PI * 1.42); this.courseG.strokePath(); }
      } else if (behavior.visual === 'wind' || behavior.visual === 'timing' || behavior.visual === 'sandglass') {
        for (let i = -1; i <= 1; i++) { const yy = y + i * 22 + Math.sin(this.simTime * 2 + i) * 7; this.courseG.beginPath(); this.courseG.moveTo(x - 58, yy); this.courseG.lineTo(x + 42, yy - 8); this.courseG.lineTo(x + 26, yy - 17); this.courseG.moveTo(x + 42, yy - 8); this.courseG.lineTo(x + 29, yy + 6); this.courseG.strokePath(); }
      } else if (behavior.visual === 'gate' || behavior.visual === 'gear' || behavior.visual === 'ratchet') {
        for (let i = 0; i < 8; i++) { const a = this.simTime * 0.7 + i * TAU / 8; this.courseG.beginPath(); this.courseG.moveTo(x + Math.cos(a) * (r - 18), y + Math.sin(a) * (r - 18)); this.courseG.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); this.courseG.strokePath(); }
        this.courseG.strokeCircle(x, y, r * 0.38);
      } else if (behavior.visual === 'ice' || behavior.visual === 'crystal' || behavior.visual === 'freeze') {
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; this.courseG.beginPath(); this.courseG.moveTo(x, y); this.courseG.lineTo(x + Math.cos(a) * (r - 10), y + Math.sin(a) * (r - 10)); this.courseG.strokePath(); }
        this.courseG.strokeCircle(x, y, r * 0.28);
      } else if (behavior.visual === 'boost' || behavior.visual === 'spring' || behavior.visual === 'conveyor') {
        for (let i = -1; i <= 1; i++) { this.courseG.beginPath(); this.courseG.moveTo(x - 48, y + i * 22); this.courseG.lineTo(x + 48, y + i * 22); this.courseG.strokePath(); }
      } else if (behavior.visual === 'echo' || behavior.visual === 'mirage' || behavior.visual === 'quicksand') {
        for (let i = 0; i < 4; i++) this.dashedLine(this.courseG, { x: x - 54 + i * 24, y: y - 42 }, { x: x + 54 - i * 18, y: y + 42 }, 7, 8);
      } else {
        this.courseG.strokeCircle(x, y, r * 0.4);
      }
    }

    drawPickups(style) {
      for (let i = 0; i < this.hole.pickups.length; i++) {
        const p = this.hole.pickups[i]; if (p.taken) continue;
        const color = p.type === 'power' ? PAL.yellow : p.type === 'gimme' ? PAL.cyan : PAL.violet;
        this.courseG.fillStyle(color, 0.12); this.courseG.fillCircle(p.x, p.y, 19);
        this.courseG.lineStyle(2, color, 0.86); this.courseG.strokeCircle(p.x, p.y, 14);
        this.courseG.lineStyle(2, color, 0.5); this.courseG.beginPath(); this.courseG.moveTo(p.x - 7, p.y); this.courseG.lineTo(p.x + 7, p.y); this.courseG.moveTo(p.x, p.y - 7); this.courseG.lineTo(p.x, p.y + 7); this.courseG.strokePath();
      }
    }

    drawCup(style) {
      const c = this.hole.cup;
      this.courseG.fillStyle(PAL.deep, 0.78); this.courseG.fillCircle(c.x, c.y, c.r + 5);
      this.courseG.fillStyle(0x02090b, 1); this.courseG.fillCircle(c.x, c.y, c.r - 5);
      this.courseG.lineStyle(3, PAL.yellow, 0.95); this.courseG.strokeCircle(c.x, c.y, c.r + 3);
      this.courseG.lineStyle(3, PAL.yellow, 0.9); this.courseG.beginPath(); this.courseG.moveTo(c.x + 2, c.y - 1); this.courseG.lineTo(c.x + 2, c.y - 55); this.courseG.strokePath();
      this.courseG.fillStyle(style.accent, 0.9); this.courseG.fillTriangle(c.x + 4, c.y - 53, c.x + 36, c.y - 44, c.x + 4, c.y - 35);
    }

    drawAim(style) {
      this.previewG.clear();
      if (this.phase !== 'play' || this.ball.moving) return;
      if (this.aim.active) {
        this.previewG.lineStyle(3, PAL.mint, 0.45); this.dashedLine(this.previewG, this.ball, this.aim.point, 10, 12);
      }
      const path = this.previewPath();
      for (let i = 0; i < path.length; i++) {
        const line = path[i];
        this.previewG.lineStyle(line.bounce ? 4 : 3, line.bounce ? PAL.yellow : PAL.cyan, line.bounce ? 0.84 : 0.55);
        this.dashedLine(this.previewG, { x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }, line.bounce ? 7 : 5, line.bounce ? 9 : 12);
        if (line.bounce) { this.previewG.fillStyle(PAL.yellow, 0.95); this.previewG.fillCircle(line.x2, line.y2, 6); this.previewG.lineStyle(2, PAL.ink, 0.8); this.previewG.strokeCircle(line.x2, line.y2, 9); }
      }
      const gauge = this.aim.pull;
      this.previewG.lineStyle(4, PAL.yellow, 0.9); this.previewG.beginPath(); this.previewG.arc(this.ball.x, this.ball.y, 28, -Math.PI / 2, -Math.PI / 2 + TAU * gauge); this.previewG.strokePath();
      this.previewG.lineStyle(2, style.accent, 0.7); this.previewG.beginPath(); this.previewG.arc(this.ball.x, this.ball.y, 34, -Math.PI / 2, -Math.PI / 2 + TAU * gauge); this.previewG.strokePath();
    }

    drawActors(style) {
      this.actorG.clear();
      this.actorG.fillStyle(PAL.deep, 0.56); this.actorG.fillEllipse(this.ball.x + 5, this.ball.y + 8, 32, 13);
      const state = this.ballVisualState;
      const pulse = state === 'aim' ? 1 + Math.sin(this.simTime * 8) * 0.08 : state === 'shot' ? 1.08 : state === 'sink' ? 1.18 : 1;
      this.actorG.fillStyle(state === 'sink' ? PAL.yellow : state === 'shot' ? PAL.cyan : PAL.mint, state === 'idle' ? 0.1 : 0.18);
      this.actorG.fillCircle(this.ball.x, this.ball.y, 29 * pulse);
      this.ballSprite.setPosition(this.ball.x, this.ball.y - (state === 'shot' ? 2 : 0));
      this.ballSprite.setDisplaySize(58 * pulse, 58 * pulse);
      this.ballSprite.setRotation(state === 'shot' ? this.simTime * 8 : state === 'aim' ? Math.sin(this.simTime * 3) * 0.08 : 0);
      this.ballSprite.setAlpha(state === 'sink' ? 0.86 : 1);
      if (state === 'sink') this.ballSprite.setTint(PAL.yellow); else if (state === 'shot') this.ballSprite.setTint(PAL.cyan); else this.ballSprite.clearTint();
      if (this.ball.moving) { this.actorG.lineStyle(2, style.accent, 0.42); this.actorG.beginPath(); this.actorG.moveTo(this.ball.x, this.ball.y); this.actorG.lineTo(this.ball.x - this.ball.vx * 0.045, this.ball.y - this.ball.vy * 0.045); this.actorG.strokePath(); }
    }

    drawFx() {
      this.fxG.clear();
      for (let i = 0; i < this.trail.length; i++) { const t = this.trail[i]; if (!t.alive) continue; this.fxG.fillStyle(t.color, clamp(1 - t.age / t.life, 0, 1) * 0.32); this.fxG.fillCircle(t.x, t.y, 3 + (1 - t.age / t.life) * 4); }
      for (let i = 0; i < this.rings.length; i++) { const r = this.rings[i]; if (!r.alive) continue; const k = r.age / r.life; this.fxG.lineStyle(3, r.color, 1 - k); this.fxG.strokeCircle(r.x, r.y, r.size + k * 42); }
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i]; if (!p.alive) continue; const alpha = clamp(p.life / p.max, 0, 1);
        this.fxG.fillStyle(p.color, alpha); if (p.kind === 1) { this.fxG.lineStyle(2, p.color, alpha); this.fxG.beginPath(); this.fxG.moveTo(p.x, p.y); this.fxG.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); this.fxG.strokePath(); } else if (p.kind === 2) this.fxG.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2); else this.fxG.fillCircle(p.x, p.y, p.size * (0.55 + alpha));
      }
    }

    drawUi(style) {
      this.uiG.clear();
      this.uiG.fillStyle(PAL.deep, 0.88); this.uiG.fillRoundedRect(26, 14, 1228, 64, 18);
      this.uiG.lineStyle(1, style.line, 0.28); this.uiG.strokeRoundedRect(26, 14, 1228, 64, 18);
      const button = (x, w, active, locked) => { this.uiG.fillStyle(active ? style.accent : locked ? PAL.deep : style.floor, active ? 0.2 : 0.9); this.uiG.fillRoundedRect(x, 21, w, 48, 12); this.uiG.lineStyle(1, active ? style.accent : style.line, active ? 0.8 : 0.28); this.uiG.strokeRoundedRect(x, 21, w, 48, 12); };
      button(348, 118, this.mode === 'tour', false); button(474, 138, this.mode === 'trick', false); button(620, 164, this.mode === 'championship', progress.unlocked < 5); button(1028, 164, false, false);
      this.uiG.fillStyle(PAL.deep, 0.9); this.uiG.fillRoundedRect(26, 666, 1228, 36, 12);
      this.uiG.lineStyle(1, style.line, 0.2); this.uiG.strokeRoundedRect(26, 666, 1228, 36, 12);
      const footerButton = (x, w, active) => { this.uiG.fillStyle(active ? style.accent : style.floor, active ? 0.24 : 0.94); this.uiG.fillRoundedRect(x, 670, w, 28, 8); this.uiG.lineStyle(1, active ? style.accent : style.line, active ? 0.8 : 0.3); this.uiG.strokeRoundedRect(x, 670, w, 28, 8); };
      footerButton(32, 70, false); footerButton(110, 66, false); footerButton(186, 70, this.userPaused);
      this.setTextIfChanged(this.labels.controlPause, this.userPaused ? '▶' : 'Ⅱ');

      const tutorialLines = ['DRAG BACK TO AIM', 'RELEASE TO SHOOT', 'SAND SLOWS • ICE SLIDES • WATER RESETS'];
      const tutorialActive = this.phase === 'play' && !this.userPaused && this.tutorialStep < 3 && this.tutorialTimer > 0 && this.transient.timer <= 0 && this.transientQueue.length === 0;
      const tutorialAlpha = tutorialActive ? (motionEnabled() ? clamp(this.tutorialTimer / 0.45, 0, 0.72) : 0.72) : 0;
      if (tutorialAlpha > 0) {
        this.uiG.fillStyle(style.accent, tutorialAlpha * 0.16); this.uiG.fillRoundedRect(34, 87, 1212, 24, 8);
        this.uiG.lineStyle(1, style.line, tutorialAlpha * 0.24); this.uiG.strokeRoundedRect(34, 87, 1212, 24, 8);
      }
      this.setTextIfChanged(this.labels.tutorial, tutorialActive ? tutorialLines[this.tutorialStep] : '');
      this.labels.tutorial.setAlpha(tutorialAlpha);

      const chipActive = this.phase === 'play' && !this.userPaused && this.transient.timer > 0;
      if (chipActive) {
        const chipAlpha = motionEnabled()
          ? Math.min(clamp((this.transient.max - this.transient.timer) / 0.08, 0, 1), clamp(this.transient.timer / 0.18, 0, 1)) * 0.92
          : 0.92;
        this.uiG.fillStyle(PAL.deep, chipAlpha * 0.92); this.uiG.fillRoundedRect(972, 116, 250, 32, 10);
        this.uiG.lineStyle(1, style.accent, chipAlpha * 0.72); this.uiG.strokeRoundedRect(972, 116, 250, 32, 10);
        this.setTextIfChanged(this.labels.toast, this.transient.text);
        this.labels.toast.setAlpha(chipAlpha);
      } else {
        this.labels.toast.setAlpha(0);
      }
      if (this.phase !== 'play' || this.userPaused) {
        this.uiG.fillStyle(PAL.deep, 0.94); this.uiG.fillRoundedRect(408, 176, 464, 302, 24); this.uiG.lineStyle(2, style.accent, 0.62); this.uiG.strokeRoundedRect(408, 176, 464, 302, 24);
        const title = this.userPaused ? 'RANGE PAUSED' : this.result.title;
        const copy = this.userPaused ? 'The line is held. Resume when you are ready.' : this.result.copy;
        const stats = this.userPaused ? 'BALL, GATES, AND CLOCK ARE FROZEN' : this.result.stats;
        const action = this.userPaused ? 'RESUME' : this.result.action;
        this.setTextIfChanged(this.labels.resultTitle, title); this.labels.resultTitle.setVisible(true);
        this.setTextIfChanged(this.labels.resultCopy, copy); this.labels.resultCopy.setVisible(true);
        this.setTextIfChanged(this.labels.resultStats, stats); this.labels.resultStats.setVisible(true);
        this.setTextIfChanged(this.labels.resultAction, action); this.labels.resultAction.setVisible(true);
        this.uiG.fillStyle(style.accent, 0.95); this.uiG.fillRoundedRect(486, 389, 308, 56, 14);
      } else {
        this.labels.resultTitle.setVisible(false); this.labels.resultCopy.setVisible(false); this.labels.resultStats.setVisible(false); this.labels.resultAction.setVisible(false);
      }
      this.setTextIfChanged(this.labels.hole, `${String(this.holeIndex + 1).padStart(2, '0')}/18`);
      this.setTextIfChanged(this.labels.score, String(this.hole.shotCount));
      this.setTextIfChanged(this.labels.par, `P${this.hole.par}`);
      this.setTextIfChanged(this.labels.pickups, `⚡${this.inventory.power}  ○${this.inventory.gimme}  ◇${this.inventory.forgive}`);
      this.uiG.fillStyle(PAL.deep, 0.72); this.uiG.fillRoundedRect(790, 57, 48, 5, 3);
      for (let i = 0; i < STROKE_CAP; i++) {
        this.uiG.fillStyle(i < this.hole.shotCount ? style.accent : style.line, i < this.hole.shotCount ? 0.9 : 0.2);
        this.uiG.fillRect(791 + i * 4, 58, 3, 3);
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
    width: GAME_W,
    height: GAME_H,
    backgroundColor: '#071116',
    render: { antialias: true, powerPreference: 'high-performance' },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: GAME_W, height: GAME_H },
    scene: [RicochetScene]
  });
  void game;
})();
