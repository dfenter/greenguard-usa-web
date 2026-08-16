/* STOMP CIRCUIT — Round 2 polish build.
 * Phaser 3 arena driving. GGKit owns lifecycle, pointer identity, saves,
 * audio, accessibility juice, loading, settings, and PWA registration.
 * All art is authored procedurally: static chrome (sky, skyline, stands,
 * crowd band) is BAKED into canvas textures at load and drawn as tiling
 * sprites; only the dynamic field is issued through Phaser Graphics.
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  /* Device-pixel rendering. The game is sized in DEVICE pixels and the main
   * camera is zoomed by DPR with origin (0,0), so every scene coordinate
   * below is still authored in CSS pixels while the backing store stays
   * dense on a 2x/3x phone. Text is rasterised at fontSize*DPR and scaled
   * back by 1/DPR; baked canvases are baked at DPR, never upscaled. */
  var DPR = Math.max(1, Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
  var TXS = 1 / DPR;
  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  var MAX_FX = 220;
  var MAX_DECALS = 260;
  var COMBO_WINDOW = 3.6;
  var GRAVITY = 1120;
  var TRUCK_HALF = 54;
  var WHEEL_R = 17;
  var WORLD_H = 660;

  var C = {
    ink: 0x0b0e15, paper: 0xf7f2e8, fog: 0xa9b1bf, line: 0x263040,
    cyan: 0x58e4df, aqua: 0x85fff1, amber: 0xffca68, orange: 0xff8c4f,
    red: 0xff5e61, violet: 0xd994ff, green: 0x80edab, steel: 0x40516a
  };

  /* ------------------------------------------------------------ trucks */
  /* IRONJAW is the shipped, owner-accepted handling model: every stat is
   * 1.0 so its feel is bit-for-bit the accepted build. The rest trade. */
  var TRUCKS = [
    { id: 'ironjaw', name: 'IRONJAW', gate: 0, blurb: 'The accepted workhorse. No weakness, no edge.',
      torque: 1.0, grip: 1.0, air: 1.0, susp: 1.0, mass: 1.0, crush: 1.0, boostMax: 100, boostUse: 1.0,
      body: 0xd35147, trim: 0xffca68, glass: 0x88e7e2 },
    { id: 'dustdevil', name: 'DUST DEVIL', gate: 3, blurb: 'Light and loose. Huge air control, poor bite.',
      torque: 1.16, grip: 0.86, air: 1.28, susp: 1.18, mass: 0.84, crush: 0.82, boostMax: 125, boostUse: 0.88,
      body: 0xe8a33c, trim: 0x58e4df, glass: 0xa9f2ff },
    { id: 'anvil', name: 'ANVIL', gate: 8, blurb: 'Heavy press. Flattens rows, hates rotating.',
      torque: 0.9, grip: 1.22, air: 0.76, susp: 0.78, mass: 1.32, crush: 1.42, boostMax: 88, boostUse: 1.15,
      body: 0x6f7f92, trim: 0xff8c4f, glass: 0xbfd6e6 },
    { id: 'nightingale', name: 'NIGHTINGALE', gate: 15, blurb: 'Show truck. Fast, precise, thin margins.',
      torque: 1.12, grip: 1.06, air: 1.14, susp: 1.05, mass: 0.94, crush: 1.05, boostMax: 112, boostUse: 0.92,
      body: 0x8f5bd6, trim: 0x85fff1, glass: 0xe4c8ff },
    { id: 'sovereign', name: 'SOVEREIGN', gate: 24, blurb: 'Circuit champion chassis. Everything, tuned.',
      torque: 1.2, grip: 1.16, air: 1.22, susp: 1.12, mass: 1.05, crush: 1.24, boostMax: 130, boostUse: 0.8,
      body: 0xf0e5cf, trim: 0xffca68, glass: 0x9ff0ea }
  ];
  var TRUCK_BY_ID = {};
  for (var ti = 0; ti < TRUCKS.length; ti++) TRUCK_BY_ID[TRUCKS[ti].id] = TRUCKS[ti];

  var EVENTS = [
    { id: 'freestyle', name: 'FREESTYLE', tag: '90 SEC / SCORE ATTACK', time: 90,
      goal: 'Stack tricks, clean landings, and keep the chain alive.', medals: [9000, 22000, 42000] },
    { id: 'crush-rally', name: 'CRUSH RALLY', tag: 'TARGET ROW / 75 SEC', time: 75,
      goal: 'Flatten the marked rows before the clock runs dry.', medals: [10, 18, 28] },
    { id: 'ramp-gauntlet', name: 'RAMP GAUNTLET', tag: '6 GATES / 75 SEC', time: 75,
      goal: 'Hit every line gate. Air control is your shortcut.', medals: [2, 4, 6] },
    { id: 'showcase', name: 'FINAL SHOWCASE', tag: '120 SEC / EVERYTHING', time: 120,
      goal: 'The spotlight is yours. Chase the signature stunt and a huge chain.', medals: [30000, 70000, 125000] }
  ];
  var EVENT_BY_ID = {};
  for (var ei = 0; ei < EVENTS.length; ei++) EVENT_BY_ID[EVENTS[ei].id] = EVENTS[ei];

  /* ----------------------------------------------------------- arenas */
  /* Freestyle Circuit: 8 authored arenas. Arenas 1-4 are the shipped set
   * (profiles untouched) with rails, sky/backdrop identity, and a trick
   * objective added. Arenas 5-8 are new. */
  var ARENAS = [
    {
      id: 'stadium-bowl', name: 'STADIUM BOWL', location: 'CROWNPOINT STADIUM',
      tagline: 'Concrete thunder and a wall-to-wall crowd.', accent: C.cyan, hot: C.amber,
      sky: [0x101a2e, 0x1b2c4a, 0x3a4f74], far: 'city', stands: 'bowl',
      width: 5200, base: 500, signature: { x: 2860, kind: 'bowl', name: 'THE BOWL DROP' },
      profile: [[0,500],[430,500],[600,450],[760,330],[930,500],[1190,500],[1350,430],[1530,430],[1700,500],[1930,500],[2080,370],[2260,500],[2520,500],[2700,450],[2940,450],[3140,500],[3500,500],[3660,370],[3840,500],[4180,500],[4380,440],[4630,500],[5200,500]],
      gaps: [{x:1835,w:90},{x:3330,w:120}],
      ramps: [{x:560,w:370,kind:'kicker'},{x:1250,w:350,kind:'table'},{x:1980,w:330,kind:'kicker'},{x:3520,w:340,kind:'wall'}],
      rows: [{x:1030,count:5,spacing:72,tier:1},{x:2320,count:7,spacing:66,tier:1},{x:4000,count:6,spacing:72,tier:2}],
      checkpoints: [650,1450,2080,2940,3660,4440],
      rails: [{x:1560,y:405,w:465},{x:3140,y:392,w:496},{x:4360,y:400,w:434}],
      secret: {x:3000,w:230,label:'UPPER DECK CUT'}, crowd: 1,
      objective: { id: 'flips', target: 3, label: 'LAND 3 FLIPS' }
    },
    {
      id: 'junkyard-sprawl', name: 'JUNKYARD SPRAWL', location: 'RUSTBELT SALVAGE',
      tagline: 'Loose steel, stacked wrecks, and a shortcut through the press.', accent: C.orange, hot: C.amber,
      sky: [0x1d1410, 0x33231a, 0x5b3a24], far: 'rig', stands: 'scaffold',
      width: 5400, base: 510, signature: { x: 3050, kind: 'crusher', name: 'THE MAGNET DROP' },
      profile: [[0,510],[480,510],[650,470],[810,510],[1060,510],[1190,405],[1400,510],[1650,510],[1800,455],[1980,510],[2240,510],[2450,390],[2640,510],[2900,510],[3140,440],[3380,510],[3650,510],[3840,420],[4020,510],[4280,510],[4480,455],[4680,510],[5400,510]],
      gaps: [{x:1510,w:125},{x:2770,w:150},{x:4120,w:110}],
      ramps: [{x:1120,w:270,kind:'scrap'},{x:2320,w:330,kind:'scrap'},{x:3700,w:330,kind:'scrap'},{x:4400,w:260,kind:'kicker'}],
      rows: [{x:700,count:6,spacing:62,tier:1},{x:1670,count:9,spacing:60,tier:1},{x:3180,count:8,spacing:62,tier:2},{x:4780,count:7,spacing:60,tier:2}],
      checkpoints: [680,1330,2050,2600,3850,4540],
      rails: [{x:1240,y:398,w:465},{x:2860,y:386,w:496},{x:4200,y:402,w:434}],
      secret: {x:2160,w:300,label:'MAGNET TUNNEL'}, crowd: 0.55,
      objective: { id: 'crush', target: 14, label: 'CRUSH 14 WRECKS' }
    },
    {
      id: 'canyon-rim', name: 'CANYON RIM', location: 'REDLINE RESERVE',
      tagline: 'Big gaps, thin air, and the long way around.', accent: C.orange, hot: C.red,
      sky: [0x171122, 0x40213a, 0x8a3f47], far: 'mesa', stands: 'cliff',
      width: 5700, base: 505, signature: { x: 3330, kind: 'canyon', name: 'THE RIM BREAK' },
      profile: [[0,505],[420,505],[610,430],[820,505],[1120,505],[1310,350],[1500,505],[1780,505],[1930,405],[2110,505],[2400,505],[2630,315],[2830,505],[3090,505],[3310,405],[3520,505],[3800,505],[3970,335],[4180,505],[4470,505],[4680,390],[4880,505],[5200,505],[5700,505]],
      gaps: [{x:950,w:190},{x:2180,w:210},{x:3570,w:180},{x:4920,w:220}],
      ramps: [{x:540,w:330,kind:'rim'},{x:1240,w:380,kind:'rim'},{x:2470,w:430,kind:'rim'},{x:3840,w:380,kind:'rim'},{x:4540,w:340,kind:'rim'}],
      rows: [{x:1030,count:5,spacing:70,tier:1},{x:1740,count:6,spacing:70,tier:1},{x:3040,count:5,spacing:74,tier:2},{x:4250,count:8,spacing:68,tier:2}],
      checkpoints: [700,1450,2670,3440,4020,4760],
      rails: [{x:1660,y:392,w:496},{x:3120,y:380,w:465},{x:4380,y:388,w:527}],
      secret: {x:2860,w:300,label:'RAVINE LOW LINE'}, crowd: 0.35,
      objective: { id: 'air', target: 7, label: 'BANK 7s OF AIR' }
    },
    {
      id: 'night-show-ring', name: 'NIGHT SHOW RING', location: 'LUMEN FAIRGROUNDS',
      tagline: 'A neon ring built for one impossible encore.', accent: C.violet, hot: C.amber,
      sky: [0x0a0c1c, 0x1b1440, 0x3b2170], far: 'fair', stands: 'bowl',
      width: 5500, base: 510, signature: { x: 2730, kind: 'ring', name: 'THE LIGHT LOOP' },
      profile: [[0,510],[430,510],[600,450],[790,510],[1040,510],[1220,420],[1430,510],[1710,510],[1880,445],[2070,510],[2320,510],[2500,380],[2690,510],[2920,510],[3110,405],[3320,510],[3600,510],[3780,430],[3990,510],[4260,510],[4440,365],[4630,510],[4900,510],[5100,430],[5500,510]],
      gaps: [{x:1480,w:110},{x:2140,w:130},{x:3440,w:120},{x:4720,w:145}],
      ramps: [{x:1120,w:330,kind:'light'},{x:1780,w:300,kind:'light'},{x:2410,w:370,kind:'light'},{x:3660,w:350,kind:'light'},{x:4320,w:390,kind:'light'}],
      rows: [{x:850,count:6,spacing:64,tier:1},{x:1540,count:7,spacing:64,tier:1},{x:3010,count:8,spacing:62,tier:2},{x:4100,count:7,spacing:64,tier:2}],
      checkpoints: [720,1300,1920,2590,3760,4490],
      rails: [{x:1600,y:396,w:465},{x:3160,y:384,w:496},{x:4700,y:392,w:465}],
      secret: {x:3190,w:260,label:'BLACKLIGHT LINE'}, crowd: 1.2,
      objective: { id: 'chain', target: 9, label: 'HIT A 9 CHAIN' }
    },
    {
      id: 'iron-harbor', name: 'IRON HARBOR', location: 'SALT PIER DRYDOCK',
      tagline: 'Wet steel, gantry shadows, and containers stacked for air.', accent: C.aqua, hot: C.cyan,
      sky: [0x081420, 0x0f2c3c, 0x1d5566], far: 'rig', stands: 'scaffold',
      width: 5600, base: 505, signature: { x: 3140, kind: 'crane', name: 'THE GANTRY DROP' },
      profile: [[0,505],[400,505],[560,455],[740,505],[980,505],[1160,400],[1360,505],[1620,505],[1790,460],[1970,505],[2210,505],[2400,370],[2600,505],[2860,505],[3050,430],[3260,505],[3520,505],[3700,395],[3900,505],[4160,505],[4350,445],[4560,505],[4820,505],[5000,415],[5200,505],[5600,505]],
      gaps: [{x:1450,w:130},{x:2720,w:140},{x:4020,w:120}],
      ramps: [{x:1080,w:300,kind:'dock'},{x:2320,w:340,kind:'dock'},{x:3620,w:320,kind:'dock'},{x:4920,w:300,kind:'kicker'}],
      rows: [{x:760,count:6,spacing:64,tier:1},{x:2000,count:8,spacing:62,tier:1},{x:3300,count:7,spacing:64,tier:2},{x:4600,count:8,spacing:62,tier:2}],
      checkpoints: [640,1300,2150,2900,3820,4700],
      rails: [{x:1500,y:405,w:527},{x:3000,y:392,w:496},{x:4260,y:400,w:465}],
      secret: {x:2620,w:280,label:'CONTAINER GAP'}, crowd: 0.7,
      objective: { id: 'grind', target: 3, label: 'GRIND 3s OF RAIL' }
    },
    {
      id: 'salt-mirage', name: 'SALT MIRAGE', location: 'WHITEPAN FLATS',
      tagline: 'Nothing but glare, distance, and the biggest kickers on tour.', accent: C.amber, hot: C.orange,
      sky: [0x24344a, 0x5a6a7c, 0xc9b48c], far: 'mesa', stands: 'cliff',
      width: 6000, base: 500, signature: { x: 3560, kind: 'canyon', name: 'THE SALT ARC' },
      profile: [[0,500],[520,500],[700,450],[900,500],[1250,500],[1460,360],[1680,500],[2000,500],[2200,430],[2420,500],[2760,500],[3000,330],[3230,500],[3560,500],[3760,420],[3980,500],[4320,500],[4520,345],[4760,500],[5100,500],[5300,430],[5520,500],[6000,500]],
      gaps: [{x:1120,w:200},{x:2560,w:220},{x:4080,w:210},{x:5620,w:190}],
      ramps: [{x:620,w:360,kind:'dune'},{x:1380,w:420,kind:'dune'},{x:2920,w:440,kind:'dune'},{x:4440,w:400,kind:'dune'},{x:5220,w:360,kind:'dune'}],
      rows: [{x:900,count:5,spacing:74,tier:1},{x:2260,count:6,spacing:72,tier:1},{x:3620,count:7,spacing:70,tier:2},{x:5340,count:6,spacing:72,tier:2}],
      checkpoints: [800,1560,2400,3120,4200,5300],
      rails: [{x:2100,y:405,w:558},{x:4700,y:390,w:589}],
      secret: {x:3300,w:300,label:'MIRAGE RUN'}, crowd: 0.3,
      objective: { id: 'gap', target: 5, label: 'CLEAR 5 GAPS' }
    },
    {
      id: 'foundry-floor', name: 'FOUNDRY FLOOR', location: 'CINDERWORKS NO. 4',
      tagline: 'Heat haze, ladle light, and scrap packed shoulder to shoulder.', accent: C.orange, hot: C.red,
      sky: [0x1a0d0c, 0x3d1512, 0x7d2a18], far: 'rig', stands: 'scaffold',
      width: 5300, base: 512, signature: { x: 2760, kind: 'crusher', name: 'THE POUR' },
      profile: [[0,512],[380,512],[540,462],[700,512],[940,512],[1100,412],[1300,512],[1540,512],[1700,455],[1880,512],[2120,512],[2300,390],[2500,512],[2740,512],[2920,440],[3120,512],[3360,512],[3540,400],[3740,512],[3980,512],[4160,450],[4360,512],[4600,512],[4780,420],[4980,512],[5300,512]],
      gaps: [{x:1400,w:120},{x:2600,w:135},{x:3840,w:125},{x:4680,w:110}],
      ramps: [{x:1020,w:280,kind:'scrap'},{x:2220,w:300,kind:'scrap'},{x:3460,w:300,kind:'scrap'},{x:4700,w:280,kind:'scrap'}],
      rows: [{x:620,count:7,spacing:60,tier:1},{x:1620,count:9,spacing:58,tier:2},{x:2880,count:8,spacing:60,tier:2},{x:4180,count:9,spacing:58,tier:2}],
      checkpoints: [600,1220,1980,2820,3620,4520],
      rails: [{x:1160,y:400,w:496},{x:2660,y:386,w:527},{x:4020,y:398,w:496}],
      secret: {x:2960,w:260,label:'LADLE LINE'}, crowd: 0.85,
      objective: { id: 'crush', target: 18, label: 'CRUSH 18 WRECKS' }
    },
    {
      id: 'summit-coliseum', name: 'SUMMIT COLISEUM', location: 'CROWN TIER',
      tagline: 'The final ring. Every trick you own, in front of everyone.', accent: C.violet, hot: C.aqua,
      sky: [0x090a1e, 0x201850, 0x6a2f8e], far: 'city', stands: 'bowl',
      width: 6000, base: 505, signature: { x: 2840, kind: 'ring', name: 'THE CROWN LOOP' },
      profile: [[0,505],[420,505],[600,440],[800,505],[1060,505],[1250,395],[1460,505],[1740,505],[1920,435],[2120,505],[2400,505],[2620,340],[2840,505],[3120,505],[3320,410],[3540,505],[3820,505],[4020,360],[4240,505],[4520,505],[4720,425],[4940,505],[5220,505],[5420,380],[5640,505],[6000,505]],
      gaps: [{x:1560,w:150},{x:2960,w:160},{x:4340,w:160},{x:5740,w:140}],
      ramps: [{x:700,w:320,kind:'kicker'},{x:1160,w:340,kind:'light'},{x:2540,w:400,kind:'light'},{x:3940,w:380,kind:'light'},{x:5340,w:360,kind:'light'}],
      rows: [{x:880,count:6,spacing:66,tier:2},{x:2180,count:8,spacing:64,tier:2},{x:3600,count:8,spacing:64,tier:2},{x:5000,count:9,spacing:62,tier:3}],
      checkpoints: [760,1500,2300,3260,4200,5180],
      rails: [{x:1700,y:395,w:558},{x:3140,y:380,w:558},{x:4560,y:390,w:558},{x:5560,y:400,w:465}],
      secret: {x:3380,w:300,label:'CROWN LINE'}, crowd: 1.3,
      objective: { id: 'variety', target: 6, label: '6 TRICK TYPES IN ONE CHAIN' }
    }
  ];

  /* Freestyle Circuit gates: total medals needed to open each arena. */
  var ARENA_GATE = [0, 1, 3, 5, 8, 11, 15, 20];

  /* Career ladder: ordered rounds, each behind a medal gate. */
  var CAREER = [
    { id: 'c1', arena: 0, event: 'freestyle', gate: 0, name: 'ROOKIE NIGHT' },
    { id: 'c2', arena: 0, event: 'crush-rally', gate: 1, name: 'OPENING CRUSH' },
    { id: 'c3', arena: 1, event: 'crush-rally', gate: 2, name: 'SALVAGE SHIFT' },
    { id: 'c4', arena: 1, event: 'ramp-gauntlet', gate: 4, name: 'SCRAP LINES' },
    { id: 'c5', arena: 2, event: 'ramp-gauntlet', gate: 6, name: 'RIM RUNNER' },
    { id: 'c6', arena: 2, event: 'freestyle', gate: 8, name: 'CANYON EXHIBITION' },
    { id: 'c7', arena: 3, event: 'freestyle', gate: 10, name: 'NEON ENCORE' },
    { id: 'c8', arena: 4, event: 'crush-rally', gate: 13, name: 'HARBOR TEARDOWN' },
    { id: 'c9', arena: 5, event: 'ramp-gauntlet', gate: 16, name: 'FLATS SPRINT' },
    { id: 'c10', arena: 6, event: 'crush-rally', gate: 19, name: 'FOUNDRY PRESS' },
    { id: 'c11', arena: 7, event: 'freestyle', gate: 22, name: 'CROWN QUALIFIER' },
    { id: 'c12', arena: 7, event: 'showcase', gate: 26, name: 'THE FINAL SHOWCASE' }
  ];

  var TABS = ['CAREER', 'CIRCUIT', 'GARAGE'];

  var ST = {
    state: { mode: 'boot', score: 0, combo: 0, airborne: false, event: 'freestyle', arena: 'stadium-bowl', forceEvent: null },
    forceEvent: null,
    forceArena: null
  };
  if (typeof window !== 'undefined') window.__st = ST;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function damp(a, b, k, dt) { return lerp(a, b, 1 - Math.exp(-k * dt)); }
  function shortAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }
  function hex(v) { return '#' + ('000000' + v.toString(16)).slice(-6); }
  function setTextIfChanged(obj, value) {
    var s = String(value);
    if (obj && obj.text !== s) obj.setText(s);
    return obj;
  }
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function profileY(def, x) {
    var p = def.profile;
    if (x <= p[0][0]) return p[0][1];
    for (var i = 1; i < p.length; i++) {
      if (x <= p[i][0]) {
        var d = p[i][0] - p[i - 1][0];
        var t = d ? (x - p[i - 1][0]) / d : 0;
        return lerp(p[i - 1][1], p[i][1], t);
      }
    }
    return def.base;
  }

  /* ------------------------------------------------------ save (v2) */
  var SAVE_VERSION = 2;
  var DEFAULT_PROFILE = {
    version: SAVE_VERSION, unlockedArena: 1, unlockedEvent: 1, medals: {}, best: 0, runs: 0,
    truck: 'ironjaw', trucks: ['ironjaw'], career: {}, objectives: {}, careerStage: 0
  };

  /* Accepts the shipped v1 shape and the current v2 shape. Anything else
   * (corrupt, future, wrong types) fails and the caller degrades to a
   * fresh profile instead of throwing. */
  function validSave(v) {
    if (!v || typeof v !== 'object') return false;
    if (v.version !== 1 && v.version !== SAVE_VERSION) return false;
    if (!Number.isInteger(v.unlockedArena) || v.unlockedArena < 1 || v.unlockedArena > ARENAS.length) return false;
    if (!Number.isInteger(v.unlockedEvent) || v.unlockedEvent < 1 || v.unlockedEvent > EVENTS.length) return false;
    return !!v.medals && typeof v.medals === 'object';
  }

  /* v1 -> v2: keep every earned medal, best and run count; default all the
   * new round-2 fields (roster, career ladder, arena objectives). */
  function migrateProfile(raw) {
    var p = {};
    var k;
    for (k in DEFAULT_PROFILE) p[k] = DEFAULT_PROFILE[k];
    if (!raw || typeof raw !== 'object') { p.medals = {}; p.trucks = ['ironjaw']; p.career = {}; p.objectives = {}; return p; }
    p.medals = {};
    if (raw.medals && typeof raw.medals === 'object') {
      for (k in raw.medals) {
        var m = raw.medals[k];
        if (typeof m === 'number' && m >= 0 && m <= 3) p.medals[k] = m | 0;
      }
    }
    p.best = typeof raw.best === 'number' && raw.best >= 0 ? raw.best : 0;
    p.runs = typeof raw.runs === 'number' && raw.runs >= 0 ? raw.runs : 0;
    p.unlockedArena = Number.isInteger(raw.unlockedArena) ? clamp(raw.unlockedArena, 1, ARENAS.length) : 1;
    p.unlockedEvent = Number.isInteger(raw.unlockedEvent) ? clamp(raw.unlockedEvent, 1, EVENTS.length) : 1;
    p.objectives = {};
    if (raw.objectives && typeof raw.objectives === 'object') {
      for (k in raw.objectives) if (raw.objectives[k]) p.objectives[k] = 1;
    }
    p.career = {};
    if (raw.career && typeof raw.career === 'object') {
      for (k in raw.career) {
        var cm = raw.career[k];
        if (typeof cm === 'number' && cm >= 0 && cm <= 3) p.career[k] = cm | 0;
      }
    }
    p.trucks = ['ironjaw'];
    if (Array.isArray(raw.trucks)) {
      for (var i = 0; i < raw.trucks.length; i++) {
        if (TRUCK_BY_ID[raw.trucks[i]] && p.trucks.indexOf(raw.trucks[i]) < 0) p.trucks.push(raw.trucks[i]);
      }
    }
    p.truck = TRUCK_BY_ID[raw.truck] ? raw.truck : 'ironjaw';
    p.careerStage = Number.isInteger(raw.careerStage) ? clamp(raw.careerStage, 0, CAREER.length - 1) : 0;
    p.version = SAVE_VERSION;
    return p;
  }

  var kit = GGKit.create({
    slug: 'stomp-circuit',
    orientation: 'landscape',
    validateSave: validSave,
    // Game is declared below this kit creation; GGKit can fire pause
    // synchronously during create (orientation check), while Game is still
    // the hoisted undefined. Guard the object, not just the field.
    onPause: function () { if (typeof Game !== 'undefined' && Game && Game.scene) Game.scene.onKitPause(); },
    onResume: function () { if (typeof Game !== 'undefined' && Game && Game.scene) Game.scene.onKitResume(); },
    onRestart: function () { if (typeof Game !== 'undefined' && Game && Game.scene) Game.scene.onKitRestart(); }
  });

  /* The sounds are MP3-only CC0 files already tracked by the studio ledger.
   * GGKit owns the buses and lazy decoding. No direct browser audio graph is used here.
   */
  kit.audio.register({
    engine: 'assets/engine.mp3',
    crowd: 'assets/sfx_crowd.mp3',
    impact: 'assets/impact.mp3',
    crush: 'assets/land.mp3',
    launch: 'assets/launch.mp3',
    boost: 'assets/boost.mp3',
    pickup: 'assets/cargo_pickup.mp3',
    fanfare: 'assets/fanfare.mp3',
    select: 'assets/uiselect.mp3',
    tick: 'assets/uitick.mp3'
  });

  var rawSave = kit.save.get(null);
  var profile = migrateProfile(rawSave);
  function saveProfile() { kit.save.set(profile); }
  // Write the migrated shape back once, so a v1 player is on v2 from boot
  // even if they close the tab before finishing a run.
  if (!rawSave || rawSave.version !== SAVE_VERSION) saveProfile();
  function totalMedals() {
    var n = 0;
    for (var k in profile.medals) n += profile.medals[k] | 0;
    return n;
  }
  function refreshRoster() {
    var tm = totalMedals(), added = null;
    for (var i = 0; i < TRUCKS.length; i++) {
      if (tm >= TRUCKS[i].gate && profile.trucks.indexOf(TRUCKS[i].id) < 0) { profile.trucks.push(TRUCKS[i].id); added = TRUCKS[i]; }
    }
    return added;
  }
  function truckOf() { return TRUCK_BY_ID[profile.truck] || TRUCKS[0]; }
  function eventIndex(id) { for (var i = 0; i < EVENTS.length; i++) if (EVENTS[i].id === id) return i; return 0; }
  function arenaIndex(id) { for (var i = 0; i < ARENAS.length; i++) if (ARENAS[i].id === id) return i; return 0; }
  function arenaUnlocked(i) { return totalMedals() >= ARENA_GATE[i] || i < profile.unlockedArena; }
  function careerUnlocked(i) { return totalMedals() >= CAREER[i].gate; }
  function forcedEvent() {
    var f = ST.forceEvent || ST.state.forceEvent;
    return EVENT_BY_ID[f] ? f : null;
  }
  function forcedArena() {
    var f = ST.forceArena;
    if (typeof f === 'number' && f >= 0 && f < ARENAS.length) return f | 0;
    if (typeof ST.state.forceArena === 'number' && ST.state.forceArena >= 0 && ST.state.forceArena < ARENAS.length) return ST.state.forceArena | 0;
    return null;
  }

  var Game = { scene: null, phaser: null };

  /* --------------------------------------------------- baked textures */
  /* Static chrome is drawn ONCE into canvas textures during the loading
   * screen; the field then draws it as four tiling sprites instead of
   * replaying thousands of Graphics commands per frame. Every bake below
   * completes (and refresh()es) before any sprite that references it is
   * constructed. */
  /* Bakes at DPR: the canvas is DPR times the design size and the context
   * is pre-scaled, so the draw code stays in design units and the texture
   * is native-resolution on a retina display. */
  function bakeCanvas(scene, key, w, h, draw) {
    if (scene.textures.exists(key)) return;
    var tex = scene.textures.createCanvas(key, Math.ceil(w * DPR), Math.ceil(h * DPR));
    if (!tex) return;
    var ctx = tex.getContext();
    ctx.clearRect(0, 0, w * DPR, h * DPR);
    ctx.save();
    ctx.scale(DPR, DPR);
    draw(ctx, w, h);
    ctx.restore();
    tex.refresh();
  }
  function css(v, a) {
    return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + (a == null ? 1 : a) + ')';
  }
  function bakeSky(cols) {
    return function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, css(cols[0]));
      g.addColorStop(0.52, css(cols[1]));
      g.addColorStop(1, css(cols[2]));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // horizon haze bands keep the gradient off-flat and add color count
      for (var i = 0; i < 7; i++) {
        ctx.fillStyle = css(cols[2], 0.05 + i * 0.012);
        ctx.fillRect(0, h - 120 + i * 15, w, 9);
      }
      for (var s = 0; s < 26; s++) {
        var sx = (s * 37) % w, sy = (s * 53) % (h * 0.55);
        ctx.fillStyle = css(0xffffff, 0.05 + (s % 4) * 0.04);
        ctx.fillRect(sx, sy, 2, 2);
      }
      // ordered dither over the whole gradient: kills banding and lifts the
      // distinct-colour count out of the flat-fill range
      var rng = makeRng(0xD173 + cols[0]);
      for (var dy = 0; dy < h; dy += 1) {
        for (var dx = 0; dx < w; dx += 2) {
          var n = rng();
          if (n < 0.42) continue;
          ctx.fillStyle = css(n > 0.72 ? 0xffffff : 0x000000, 0.012 + n * 0.022);
          ctx.fillRect(dx + (dy % 2), dy, 1, 1);
        }
      }
    };
  }
  /* Screen-space grain: one small tile laid over the whole frame at low
   * alpha. Every flat region picks up per-pixel variation. */
  function bakeGrit(ctx, w, h) {
    var rng = makeRng(0x6817);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var n = rng();
        if (n < 0.55) continue;
        ctx.fillStyle = css(n > 0.8 ? 0xffffff : 0x1a2230, 0.05 + n * 0.07);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  function bakeVignette(ctx, w, h) {
    var g = ctx.createRadialGradient(w * 0.5, h * 0.46, w * 0.16, w * 0.5, h * 0.5, w * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.62, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(4,6,11,0.62)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  /* Skyline families are baked white with alpha so a per-arena tint gives
   * each area its own identity from one texture. */
  function bakeFar(kind) {
    return function (ctx, w, h) {
      var rng = makeRng(kind.length * 7919 + 13);
      ctx.fillStyle = css(0xffffff, 0.30);
      if (kind === 'city') {
        for (var x = 4; x < w - 4; ) {
          var bw = 22 + Math.floor(rng() * 34), bh = 50 + Math.floor(rng() * (h - 70));
          ctx.fillRect(x, h - bh, bw, bh);
          ctx.fillStyle = css(0xffffff, 0.5);
          for (var wy = h - bh + 10; wy < h - 12; wy += 14) {
            for (var wx = x + 5; wx < x + bw - 6; wx += 11) if (rng() > 0.45) ctx.fillRect(wx, wy, 4, 5);
          }
          ctx.fillStyle = css(0xffffff, 0.30);
          x += bw + 5 + Math.floor(rng() * 9);
        }
      } else if (kind === 'rig') {
        for (var i = 0; i < 7; i++) {
          var bx = 12 + i * 52, bh2 = 60 + Math.floor(rng() * 90);
          ctx.fillRect(bx, h - bh2, 8, bh2);
          ctx.fillRect(bx + 26, h - bh2 * 0.7, 6, bh2 * 0.7);
          ctx.fillRect(bx, h - bh2, 34, 6);
          ctx.fillStyle = css(0xffffff, 0.22);
          ctx.fillRect(bx - 6, h - 34, 46, 34);
          ctx.fillStyle = css(0xffffff, 0.30);
          if (i % 2 === 0) { ctx.fillRect(bx + 4, h - bh2 - 18, 3, 18); ctx.fillRect(bx - 2, h - bh2 - 22, 14, 5); }
        }
      } else if (kind === 'mesa') {
        ctx.beginPath(); ctx.moveTo(0, h);
        var y = h - 40;
        for (var mx = 0; mx <= w; mx += 24) {
          y = clamp(y + (rng() - 0.5) * 46, h - (h - 26), h - 22);
          ctx.lineTo(mx, y);
        }
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = css(0xffffff, 0.18);
        for (var b = 0; b < 5; b++) ctx.fillRect(b * 76 + 10, h - 26 - b * 3, 58, 26);
      } else { // fair
        for (var t = 0; t < 6; t++) {
          var tx = 24 + t * 60, th = 46 + Math.floor(rng() * 40);
          ctx.beginPath(); ctx.moveTo(tx, h); ctx.lineTo(tx + 26, h - th); ctx.lineTo(tx + 52, h); ctx.closePath(); ctx.fill();
          ctx.fillStyle = css(0xffffff, 0.5);
          ctx.fillRect(tx + 24, h - th - 12, 3, 12);
          ctx.fillStyle = css(0xffffff, 0.30);
        }
        ctx.strokeStyle = css(0xffffff, 0.45); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(w * 0.72, h - 62, 46, 0, TAU); ctx.stroke();
        for (var sp = 0; sp < 8; sp++) {
          var a2 = sp / 8 * TAU;
          ctx.beginPath(); ctx.moveTo(w * 0.72, h - 62);
          ctx.lineTo(w * 0.72 + Math.cos(a2) * 46, h - 62 + Math.sin(a2) * 46); ctx.stroke();
        }
      }
    };
  }
  function bakeStands(kind) {
    return function (ctx, w, h) {
      if (kind === 'bowl') {
        for (var r = 0; r < 6; r++) {
          var y = h - 26 - r * 22;
          ctx.fillStyle = css(0xffffff, 0.16 + r * 0.015);
          ctx.fillRect(0, y, w, 16);
          ctx.fillStyle = css(0xffffff, 0.30);
          for (var x = 6; x < w; x += 26) ctx.fillRect(x, y + 12, 14, 4);
        }
        ctx.fillStyle = css(0xffffff, 0.42);
        for (var p = 0; p < 5; p++) { ctx.fillRect(p * 82 + 20, 6, 6, h - 30); ctx.fillRect(p * 82 + 8, 0, 30, 8); }
      } else if (kind === 'scaffold') {
        ctx.strokeStyle = css(0xffffff, 0.34); ctx.lineWidth = 3;
        for (var c = 0; c < 8; c++) {
          var cx = 12 + c * 48;
          ctx.beginPath(); ctx.moveTo(cx, h); ctx.lineTo(cx, 18); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx, h - 20); ctx.lineTo(cx + 48, h - 62); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx, h - 62); ctx.lineTo(cx + 48, h - 20); ctx.stroke();
        }
        ctx.fillStyle = css(0xffffff, 0.20);
        for (var d = 0; d < 4; d++) ctx.fillRect(0, 22 + d * 40, w, 8);
      } else { // cliff ledges
        for (var l = 0; l < 4; l++) {
          ctx.fillStyle = css(0xffffff, 0.14 + l * 0.03);
          ctx.beginPath();
          ctx.moveTo(0, h - l * 34);
          for (var lx = 0; lx <= w; lx += 32) ctx.lineTo(lx, h - l * 34 - 12 - ((lx / 32 + l) % 3) * 7);
          ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = css(0xffffff, 0.5);
        for (var f = 0; f < 6; f++) ctx.fillRect(18 + f * 62, h - 118, 4, 26);
      }
    };
  }
  function bakeCrowdTile(ctx, w, h) {
    var rng = makeRng(0x51D3);
    for (var row = 0; row < 3; row++) {
      var y = 16 + row * 26;
      for (var x = 8 + (row * 7); x < w; x += 19) {
        var a = 0.32 + rng() * 0.5;
        ctx.fillStyle = css(0xffffff, a * 0.5);
        ctx.fillRect(x - 7, y + 6, 14, 17);
        ctx.fillStyle = css(0xffffff, a);
        ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
      }
    }
    ctx.fillStyle = css(0xffffff, 0.24);
    ctx.fillRect(0, h - 7, w, 5);
  }

  /* -------------------------------------------------------- runtime */
  function makeRuntimeArena(def) {
    var a = { def: def, props: [], pickups: [], gates: [], rails: [], width: def.width, groundAt: null };
    var rng = makeRng(0x5A17 + arenaIndex(def.id) * 911);
    function groundAt(x) {
      var gaps = def.gaps;
      for (var gi = 0; gi < gaps.length; gi++) if (x > gaps[gi].x && x < gaps[gi].x + gaps[gi].w) return { solid: false, y: 610, slope: 0 };
      x = clamp(x, 0, def.width);
      var p = def.profile;
      for (var i = 1; i < p.length; i++) {
        if (x <= p[i][0]) {
          var d = p[i][0] - p[i - 1][0];
          var t = d ? (x - p[i - 1][0]) / d : 0;
          return { solid: true, y: lerp(p[i - 1][1], p[i][1], t), slope: (p[i][1] - p[i - 1][1]) / Math.max(1, d) };
        }
      }
      return { solid: true, y: def.base, slope: 0 };
    }
    a.groundAt = groundAt;
    function prop(x, tier, type) {
      var g = groundAt(x);
      if (!g.solid) return; // never park a wreck in mid-air over a chasm
      a.props.push({ x: x, y: g.y, w: type === 'bus' ? 108 : 58, h: type === 'bus' ? 58 : 35 + tier * 12,
        type: type || 'car', tier: tier || 0, deform: 0, wobble: 0, live: true, hitFlash: 0, seed: (x * 7 | 0) % 5,
        render: { x: x, y: g.y, sx: 1, sy: 1, rot: 0 } });
    }
    for (var ri = 0; ri < def.rows.length; ri++) {
      var row = def.rows[ri];
      for (var ci = 0; ci < row.count; ci++) prop(row.x + ci * row.spacing, row.tier + (ci % 3 === 0 ? 1 : 0), ci === row.count - 1 ? 'bus' : 'car');
    }
    var types = ['flare', 'boost', 'time', 'flare', 'boost', 'flare'];
    for (var pi = 0; pi < def.width - 500; pi += 330) {
      var px = 310 + pi + (rng() - 0.5) * 90;
      var pg = groundAt(px);
      // over a chasm the drop hangs at jump height, not inside the pit
      a.pickups.push({ x: px, y: (pg.solid ? pg.y - 82 : 420) - (rng() * 36), type: types[(pi / 330 | 0) % types.length], live: true, phase: rng() * TAU, render: { x: px, y: 0, s: 1 } });
    }
    for (var gi2 = 0; gi2 < def.checkpoints.length; gi2++) a.gates.push({ x: def.checkpoints[gi2], live: true, render: { pulse: 0 } });
    for (var rl = 0; rl < (def.rails || []).length; rl++) {
      var rr = def.rails[rl];
      a.rails.push({ x: rr.x, y: rr.y, w: rr.w, glow: 0 });
    }
    return a;
  }

  function newTruck(x, y, spec) {
    return {
      x: x, y: y, vx: 0, vy: 0, angle: 0, av: 0, grounded: true, wasGrounded: true,
      surfaceAngle: 0, charge: 0, launchCharge: 0, airTime: 0, spinAccum: 0, flipCount: 0,
      wheelie: 0, boost: 32, engine: 0, spec: spec, grinding: false, grindRail: null, grindTime: 0,
      anim: 'idle', animT: 0, landRecover: 0, wreckT: 0, dirtT: 0, decalT: 0, tilt: 0,
      wheels: [
        { x: 0, y: 0, compression: 0, cv: 0, spin: 0, squash: 0 },
        { x: 0, y: 0, compression: 0, cv: 0, spin: 0, squash: 0 }
      ],
      render: { x: x, y: y, angle: 0, wheelSpin: 0, squash: 0, body: 0 }
    };
  }

  function makeFx() {
    return { active: false, type: 'spark', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1,
      size: 3, color: C.paper, rot: 0, rotv: 0, grav: 420,
      render: { x: 0, y: 0, alpha: 1, size: 3 } };
  }

  function toScene(cfg) {
    var Klass = function () { Phaser.Scene.call(this, { key: cfg.key }); };
    Klass.prototype = Object.create(Phaser.Scene.prototype);
    Klass.prototype.constructor = Klass;
    for (var k in cfg) if (k !== 'key') Klass.prototype[k] = cfg[k];
    return Klass;
  }

  var CircuitScene = {
    key: 'CircuitScene',

    create: function () {
      Game.scene = this;
      this.mode = 'title';
      this.tab = 0;
      this.selCareer = 0;
      this.selArena = 0;
      this.selTruck = 0;
      this.selectedArena = forcedArena() == null ? 0 : forcedArena();
      this.selectedEvent = forcedEvent() || 'freestyle';
      this.runtime = null;
      this.truck = null;
      this.run = null;
      this.clock = 0;
      this.acc = 0;
      this.paused = false;
      this.slow = 0;
      this.timeScale = 1;
      this.camY = 0;
      this.motion = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.motionBase = this.motion;
      this.prev = { enter: false, left: false, right: false, esc: false, up: false, down: false };
      this.seenPointers = {};
      this.taps = [];
      this.menuHit = { tabs: [], rows: [], start: null };
      this.lastInput = { boost: false, charge: false, left: false, right: false, spin: 0 };
      this.trans = { t: 0, dur: 0.42, pending: null, active: false };

      kit.loader.progress(0.35);

      /* BAKE FIRST. Every texture below is finished and refreshed before a
       * single sprite that references it is constructed. */
      var i;
      for (i = 0; i < ARENAS.length; i++) bakeCanvas(this, 'sc-sky-' + i, 24, 384, bakeSky(ARENAS[i].sky));
      var farKinds = ['city', 'rig', 'mesa', 'fair'];
      for (i = 0; i < farKinds.length; i++) bakeCanvas(this, 'sc-far-' + farKinds[i], 384, 200, bakeFar(farKinds[i]));
      var standKinds = ['bowl', 'scaffold', 'cliff'];
      for (i = 0; i < standKinds.length; i++) bakeCanvas(this, 'sc-stands-' + standKinds[i], 384, 180, bakeStands(standKinds[i]));
      bakeCanvas(this, 'sc-crowd', 384, 96, bakeCrowdTile);
      bakeCanvas(this, 'sc-grit', 96, 96, bakeGrit);
      bakeCanvas(this, 'sc-vig', 320, 320, bakeVignette);
      kit.loader.progress(0.7);

      /* Camera works in CSS-pixel world units on a device-pixel canvas:
       * origin (0,0) so a scrollFactor-0 object at (x,y) lands exactly at
       * CSS (x,y), zoom DPR so the backing store is fully used. */
      var cam = this.cameras.main;
      cam.setOrigin(0, 0);
      cam.setZoom(DPR);
      var W = (this.scale.width || window.innerWidth) / DPR;
      var H = (this.scale.height || window.innerHeight) / DPR;

      /* Now build. Every size is explicit; tile scale maps the DPR-baked
       * textures back to 1 texel per CSS pixel. */
      this.sky = this.add.tileSprite(0, 0, W, H, 'sc-sky-0').setOrigin(0, 0).setScrollFactor(0).setDepth(-40);
      this.far = this.add.tileSprite(0, 0, W, 200, 'sc-far-city').setOrigin(0, 0).setScrollFactor(0).setDepth(-38);
      this.stands = this.add.tileSprite(0, 0, W, 180, 'sc-stands-bowl').setOrigin(0, 0).setScrollFactor(0).setDepth(-36);
      this.crowdBand = this.add.tileSprite(0, 0, W, 96, 'sc-crowd').setOrigin(0, 0).setScrollFactor(0).setDepth(-34);
      this.backdrops = [this.sky, this.far, this.stands, this.crowdBand];
      for (i = 0; i < this.backdrops.length; i++) {
        this.backdrops[i].setTileScale(TXS, TXS);
        this.backdrops[i].setVisible(false);
      }
      this.vignette = this.add.tileSprite(0, 0, W, H, 'sc-vig').setOrigin(0, 0).setScrollFactor(0).setDepth(15).setAlpha(0.85);
      this.vignette.setTileScale(W / 320 * TXS, H / 320 * TXS);
      this.grit = this.add.tileSprite(0, 0, W, H, 'sc-grit').setOrigin(0, 0).setScrollFactor(0).setDepth(16).setAlpha(0.5);
      this.grit.setTileScale(TXS, TXS);

      this.layers = {
        bg: this.add.graphics(), crowdFx: this.add.graphics(), decal: this.add.graphics(),
        world: this.add.graphics(), fx: this.add.graphics(), hud: this.add.graphics(),
        toast: this.add.graphics(), trans: this.add.graphics()
      };
      this.layers.bg.setDepth(-45); this.layers.crowdFx.setDepth(-32); this.layers.decal.setDepth(-2);
      this.layers.world.setDepth(0); this.layers.fx.setDepth(3); this.layers.hud.setDepth(20);
      this.layers.toast.setDepth(30); this.layers.trans.setDepth(60);
      this.layers.bg.setScrollFactor(0); this.layers.hud.setScrollFactor(0);
      this.layers.toast.setScrollFactor(0); this.layers.trans.setScrollFactor(0);

      /* Pools are allocated (pre-warmed) here, on the loading screen. */
      this.fx = [];
      for (i = 0; i < MAX_FX; i++) this.fx.push(makeFx());
      this.fxCursor = 0;
      this.decals = [];
      this.decalHead = 0;
      for (i = 0; i < MAX_DECALS; i++) this.decals.push({ active: false, x: 0, y: 0, a: 0, w: 12, alpha: 0.5 });
      this.pops = [];
      for (i = 0; i < 26; i++) this.pops.push({ active: false, x: 0, y: 0, life: 0, max: 0.5, size: 6, color: C.paper });

      this.ui = this.makeUi();
      this.toast = { active: false, life: 0, text: '', color: C.amber, queue: [] };
      this.scale.on('resize', this.layout, this);
      /* Scale.NONE does not track the parent, so the window drives resizes
       * and the game is always re-sized in DEVICE pixels. */
      this._onWinResize = (function (scene) {
        return function () {
          scene.scale.resize(Math.round(window.innerWidth * DPR), Math.round(window.innerHeight * DPR));
          scene.cameras.main.setOrigin(0, 0);
          scene.cameras.main.setZoom(DPR);
          scene.layout();
        };
      })(this);
      window.addEventListener('resize', this._onWinResize);
      window.addEventListener('orientationchange', this._onWinResize);
      this.layout();
      refreshRoster();
      this.selTruck = Math.max(0, this.trucksUnlocked().indexOf(truckOf()));
      this.applyForceSwitch(true);
      kit.loader.progress(1);
      kit.loader.hide();
      kit.registerPWA();
    },

    trucksUnlocked: function () {
      var out = [];
      for (var i = 0; i < TRUCKS.length; i++) if (profile.trucks.indexOf(TRUCKS[i].id) >= 0) out.push(TRUCKS[i]);
      return out.length ? out : [TRUCKS[0]];
    },

    makeUi: function () {
      /* Rasterise glyphs at DPR and scale the object back down, so text is
       * sharp on a retina panel instead of an upscaled 1x bitmap. */
      var t = function (scene, text, size, color, bold, depth) {
        var o = scene.add.text(0, 0, text || '', {
          fontFamily: 'ui-sans-serif,system-ui,sans-serif',
          fontSize: Math.round(size * DPR) + 'px',
          fontStyle: bold ? '900' : '600',
          color: color || '#f7f2e8',
          stroke: '#0b0e15',
          strokeThickness: (bold ? 4 : 3) * DPR
        }).setScrollFactor(0).setDepth(depth || 22);
        o.baseScale = TXS;
        o.setScale(TXS);
        return o;
      };
      var u = {
        event: t(this, '', 12, '#a9b1bf', true),
        score: t(this, '✦ 000000', 19, '#f7f2e8', true),
        time: t(this, '◷ 90.0', 19, '#f7f2e8', true),
        combo: t(this, '', 22, '#ffca68', true),
        objective: t(this, '', 13, '#f7f2e8', true),
        trick: t(this, '', 14, '#85fff1', true),
        controlLeft: t(this, '◀', 22, '#f7f2e8', true),
        controlRight: t(this, '▶', 22, '#f7f2e8', true),
        controlCharge: t(this, '⇧', 20, '#f7f2e8', true),
        controlBoost: t(this, '⚡', 20, '#f7f2e8', true),
        menuTitle: t(this, 'STOMP CIRCUIT', 40, '#f7f2e8', true),
        menuSub: t(this, 'MONSTER-TRUCK ARENA / TRICKS / CRUSH / GLORY', 13, '#ffca68', true),
        menuArena: t(this, '', 22, '#f7f2e8', true),
        menuLocation: t(this, '', 12, '#a9b1bf', true),
        menuTagline: t(this, '', 13, '#d4cbbd', false),
        menuHint: t(this, '', 13, '#a9b1bf', false),
        resultTitle: t(this, '', 30, '#ffca68', true),
        resultBody: t(this, '', 14, '#f7f2e8', false),
        resultHint: t(this, '', 13, '#a9b1bf', false),
        toast: t(this, '', 15, '#f7f2e8', true, 31)
      };
      u.tabs = [];
      var i;
      for (i = 0; i < TABS.length; i++) u.tabs.push(t(this, TABS[i], 13, '#f7f2e8', true));
      u.rows = [];
      for (i = 0; i < 6; i++) u.rows.push(t(this, '', 15, '#f7f2e8', true));
      u.rowSubs = [];
      for (i = 0; i < 6; i++) u.rowSubs.push(t(this, '', 11, '#a9b1bf', false));
      u.all = [u.event, u.score, u.time, u.combo, u.objective, u.trick, u.controlLeft, u.controlRight,
        u.controlCharge, u.controlBoost, u.menuTitle, u.menuSub, u.menuArena, u.menuLocation,
        u.menuTagline, u.menuHint, u.resultTitle, u.resultBody, u.resultHint, u.toast]
        .concat(u.tabs).concat(u.rows).concat(u.rowSubs);
      for (var j = 0; j < u.all.length; j++) u.all[j].setVisible(false);
      return u;
    },

    layout: function () {
      /* scale.width/height are DEVICE pixels; everything below is CSS px. */
      var w = (this.scale.width || window.innerWidth * DPR) / DPR;
      var h = (this.scale.height || window.innerHeight * DPR) / DPR;
      this.W = w; this.H = h;
      if (this.sky) {
        this.sky.setSize(w, h); this.sky.setTileScale(TXS, h / 384 * TXS);
        this.far.setSize(w, 200); this.stands.setSize(w, 180); this.crowdBand.setSize(w, 96);
        this.vignette.setSize(w, h); this.vignette.setTileScale(w / 320 * TXS, h / 320 * TXS);
        this.grit.setSize(w, h);
      }
      var u = this.ui;
      if (!u) return;
      u.event.setPosition(18, 12); u.score.setPosition(18, 30); u.objective.setPosition(18, 54);
      u.trick.setPosition(18, 74);
      u.time.setPosition(w - 18, 12).setOrigin(1, 0); u.combo.setPosition(w * 0.5, 12).setOrigin(0.5, 0);
      u.controlLeft.setPosition(50, h - 43).setOrigin(0.5, 0.5); u.controlRight.setPosition(131, h - 43).setOrigin(0.5, 0.5);
      u.controlCharge.setPosition(w - 217, h - 43).setOrigin(0.5, 0.5); u.controlBoost.setPosition(w - 49, h - 43).setOrigin(0.5, 0.5);
      /* Circuit menu: compact header, then as many >=44px rows as the
       * viewport actually fits. Nothing is allowed to run off the bottom. */
      u.menuTitle.setOrigin(0.5, 0.5); u.menuSub.setOrigin(0.5, 0.5); u.menuHint.setOrigin(0.5, 0.5);
      this.menuTitleY = Math.max(20, h * 0.07);
      this.menuSubY = this.menuTitleY + 24;
      var tabY = this.menuSubY + 30;
      this.menuHit.tabs.length = 0;
      for (var i = 0; i < u.tabs.length; i++) {
        var tw = Math.min(132, (w - 56) / 3), tx = w * 0.5 + (i - 1) * (tw + 10);
        u.tabs[i].setPosition(tx, tabY).setOrigin(0.5, 0.5);
        this.menuHit.tabs.push({ x: tx - tw / 2, y: tabY - 22, w: tw, h: 44, i: i });
      }
      var rowY0 = tabY + 30;
      var avail = Math.max(88, (h - 26) - rowY0);
      var visible = clamp(Math.floor(avail / 47), 2, u.rows.length);
      var rowH = avail / visible;
      this.menuHit.rows.length = 0;
      for (var r = 0; r < u.rows.length; r++) {
        var ry = rowY0 + r * rowH + rowH * 0.5;
        u.rows[r].setPosition(38, ry - 8).setOrigin(0, 0.5);
        u.rowSubs[r].setPosition(38, ry + 10).setOrigin(0, 0.5);
        this.menuHit.rows.push({ x: 16, y: ry - rowH * 0.5 + 2, w: w - 32, h: rowH - 5, i: r, live: r < visible });
      }
      this.menuRowH = rowH; this.menuRowY0 = rowY0; this.menuVisible = visible;
      u.menuArena.setPosition(w * 0.5, h * 0.34).setOrigin(0.5, 0.5);
      u.menuLocation.setPosition(w * 0.5, h * 0.34 + 26).setOrigin(0.5, 0.5);
      u.menuTagline.setPosition(w * 0.5, h * 0.34 + 48).setOrigin(0.5, 0.5);
      u.menuHint.setPosition(w * 0.5, h - 26).setOrigin(0.5, 0.5);
      u.resultTitle.setPosition(w * 0.5, h * 0.22).setOrigin(0.5, 0.5);
      u.resultBody.setPosition(w * 0.5, h * 0.38).setOrigin(0.5, 0.5);
      u.resultHint.setPosition(w * 0.5, h - 34).setOrigin(0.5, 0.5);
      u.toast.setOrigin(1, 0.5);
    },

    onKitPause: function () { this.paused = true; this.clearInputEdges(); },
    onKitResume: function () { this.paused = false; this.clearInputEdges(); },
    onKitRestart: function () { if (this.mode === 'play') this.startRun(this.selectedArena, this.selectedEvent); else this.setMode('select'); },
    clearInputEdges: function () {
      this.prev.enter = this.prev.left = this.prev.right = this.prev.esc = this.prev.up = this.prev.down = false;
      this.seenPointers = {}; this.taps.length = 0;
    },

    /* Fresh-press detection over the GGKit pointer map. GGKit owns pointer
     * identity; we only diff its live map, never register a canvas-level
     * pointerdown of our own. */
    collectTaps: function () {
      var q = kit.input, seen = this.seenPointers, live = {};
      this.taps.length = 0;
      for (var p of q.pointers.entries()) {
        var id = p[0], v = p[1];
        live[id] = 1;
        if (!seen[id]) { seen[id] = 1; this.taps.push({ x: v.x, y: v.y }); }
      }
      for (var k in seen) if (!live[k]) delete seen[k];
    },

    inputFrame: function () {
      var q = kit.input;
      var left = q.keyDown('ArrowLeft') || q.keyDown('KeyA');
      var right = q.keyDown('ArrowRight') || q.keyDown('KeyD');
      var charge = q.keyDown('ArrowUp') || q.keyDown('KeyW') || q.keyDown('ShiftLeft') || q.keyDown('ShiftRight');
      var boost = q.keyDown('Space');
      var up = q.keyDown('ArrowUp') || q.keyDown('KeyW');
      var down = q.keyDown('ArrowDown') || q.keyDown('KeyS');
      var spin = 0;
      if (q.keyDown('KeyQ')) spin -= 1;
      if (q.keyDown('KeyE')) spin += 1;
      var menu = q.keyDown('Escape');
      for (var p of q.pointers.values()) {
        if (p.zone == null) {
          if (p.y < 78 && p.x > this.W - 110) p.zone = 'menu';
          else if (p.y > this.H - 142) p.zone = p.x < this.W * 0.22 ? 'left' : (p.x < this.W * 0.44 ? 'right' : (p.x < this.W * 0.72 ? 'charge' : 'boost'));
          else p.zone = 'drag';
        }
        if (p.zone === 'left') left = true;
        if (p.zone === 'right') right = true;
        if (p.zone === 'charge') charge = true;
        if (p.zone === 'boost') boost = true;
        if (p.zone === 'menu') menu = true;
        if (p.zone === 'drag') spin += clamp((p.x - p.startX) / 90, -1, 1);
      }
      var f = { left: left, right: right, up: up, down: down, charge: charge, boost: boost, tap: q.pointers.size > 0,
        spin: clamp(spin, -1.5, 1.5), menu: menu,
        keyR: q.keyDown('KeyR'), enter: q.keyDown('Enter') || q.keyDown('NumpadEnter') };
      this.lastInput = f;
      return f;
    },

    applyForceSwitch: function (boot) {
      var f = forcedEvent();
      var fa = forcedArena();
      if (fa != null) this.selectedArena = fa;
      if (f && (boot || this.mode !== 'play' || !this.run || this.run.event.id !== f)) {
        this.selectedEvent = f;
        if (boot) this.startRun(this.selectedArena, f);
        else if (this.mode !== 'play') this.startRun(this.selectedArena, f);
      }
    },

    /* ---------------------------------------------------- transitions */
    setMode: function (m, instant) {
      // A repeat request for the mode already in flight must NOT restart the
      // wipe, or a per-frame caller (run-ended check) pins it at t=0 forever
      // and the mode never actually changes.
      if (this.trans.active && this.trans.pending === m) return;
      if (this.trans.active && this.trans.pending == null && m === this.mode) return;
      if (m === this.mode && !this.trans.active) return;
      if (instant || !this.motion) { this.applyMode(m); return; }
      this.trans.active = true; this.trans.t = 0; this.trans.pending = m;
    },
    applyMode: function (m) {
      this.mode = m;
      if (m !== 'play') { this.clearToast(); this.camY = 0; }
      this.syncDebug();
    },
    updateTransition: function (dt) {
      var tr = this.trans;
      if (!tr.active) return;
      tr.t += dt;
      if (tr.pending && tr.t >= tr.dur * 0.5) { this.applyMode(tr.pending); tr.pending = null; }
      if (tr.t >= tr.dur) { tr.active = false; tr.t = 0; }
    },

    startRun: function (ai, eventId, careerId) {
      ai = clamp(ai | 0, 0, ARENAS.length - 1);
      var def = ARENAS[ai], ev = EVENT_BY_ID[eventId] || EVENTS[0];
      this.selectedArena = ai; this.selectedEvent = ev.id; this.runtime = makeRuntimeArena(def);
      var spec = truckOf();
      var g = this.runtime.groundAt(210);
      this.truck = newTruck(210, g.y - 35, spec);
      this.truck.boost = Math.min(32, spec.boostMax);
      this.run = { event: ev, arena: def, spec: spec, time: ev.time, score: 0, combo: 0, comboT: 0, maxCombo: 1,
        chainTypes: {}, chainDistinct: 0, bestDistinct: 0, bestChain: 0,
        crushed: 0, gates: 0, secret: false, landings: 0, cleanLandings: 0, drops: 0, boostsUsed: 0,
        flips: 0, airBank: 0, grindBank: 0, gapsCleared: 0, objDone: false, careerId: careerId || null,
        crushTarget: this.runtime.props.length,
        crushMedals: [Math.ceil(this.runtime.props.length * 0.35), Math.ceil(this.runtime.props.length * 0.65), this.runtime.props.length],
        lastAction: '', lastTrick: '', trickT: 0, ended: false, countdown: 1.0, showcase: ev.id === 'showcase' };
      this.acc = 0; this.slow = 0; this.timeScale = 1;
      this.camY = clamp(this.truck.y - this.H * 0.58, 0, Math.max(0, WORLD_H - this.H));
      for (var i = 0; i < this.fx.length; i++) this.fx[i].active = false;
      for (var d = 0; d < this.decals.length; d++) this.decals[d].active = false;
      for (var p = 0; p < this.pops.length; p++) this.pops[p].active = false;
      this.decalHead = 0;
      this.sky.setTexture('sc-sky-' + ai);
      this.far.setTexture('sc-far-' + def.far).setTint(def.accent).setAlpha(0.34);
      this.stands.setTexture('sc-stands-' + def.stands).setTint(def.accent).setAlpha(0.46);
      this.crowdBand.setTint(def.hot).setAlpha(clamp(0.34 + def.crowd * 0.3, 0.28, 0.8));
      this.applyMode('play');
      /* No camera bounds: Camera.clampX/clampY assume a CENTRED zoom, while
       * an origin-(0,0) camera renders top-left based, so the built-in clamp
       * pins the view above the arena floor. The scroll is clamped by hand
       * in renderWorld instead. */
      this.cameras.main.removeBounds();
      this.cameras.main.setScroll(0, this.camY);
      kit.audio.music('engine', 260);
      this.clearToast();
      this.cue('launch');
      this.pop(0, 0, def.objective.label, def.hot);
      this.syncDebug();
    },

    /* -------------------------------------------- combo grammar (round 2) */
    /* Air, flip, spin, crush, grind, gap, pickup and secret are distinct
     * trick TYPES. Length builds the base multiplier; variety inside one
     * chain adds on top, so a mixed line outscores a repeated one. */
    trickMult: function () {
      var r = this.run;
      if (!r) return 1;
      return Math.min(12, 1 + Math.floor(r.combo / 3) + Math.max(0, r.chainDistinct - 1));
    },
    scoreAction: function (points, label, color, type) {
      if (!this.run) return;
      var r = this.run;
      var mult = this.trickMult();
      var value = Math.round(points * mult);
      r.score += value; r.combo++;
      if (type && !r.chainTypes[type]) { r.chainTypes[type] = 1; r.chainDistinct++; }
      r.comboT = COMBO_WINDOW + Math.min(1.8, r.chainDistinct * 0.4);
      r.maxCombo = Math.max(r.maxCombo, mult);
      r.bestChain = Math.max(r.bestChain, r.combo);
      r.bestDistinct = Math.max(r.bestDistinct, r.chainDistinct);
      r.lastAction = label; r.lastTrick = label + '  +' + value; r.trickT = 1.1;
      if (r.combo === 3 || r.combo === 6 || r.combo % 8 === 0) {
        this.cue('crowd', { volume: 0.65, rate: 0.92 + Math.min(0.18, r.combo * 0.01) });
        this.crowdPop(10 + r.combo);
      }
      this.checkObjective();
    },
    breakChain: function () {
      var r = this.run;
      if (!r || r.combo <= 0) return;
      r.combo = 0; r.chainTypes = {}; r.chainDistinct = 0; r.lastAction = '';
      this.pop(0, 0, 'CHAIN LOST', C.fog);
    },

    checkObjective: function () {
      var r = this.run;
      if (!r || r.objDone) return;
      var o = r.arena.objective, hit = false;
      if (o.id === 'flips') hit = r.flips >= o.target;
      else if (o.id === 'crush') hit = r.crushed >= o.target;
      else if (o.id === 'air') hit = r.airBank >= o.target;
      else if (o.id === 'grind') hit = r.grindBank >= o.target;
      else if (o.id === 'gap') hit = r.gapsCleared >= o.target;
      else if (o.id === 'chain') hit = r.bestChain >= o.target;
      else if (o.id === 'variety') hit = r.bestDistinct >= o.target;
      if (!hit) return;
      r.objDone = true;
      r.score += 2500;
      profile.objectives[r.arena.id] = 1;
      saveProfile();
      this.pop(0, 0, 'ARENA OBJECTIVE CLEAR', C.green);
      this.cue('fanfare', { volume: 0.55, rate: 1.05 });
      this.crowdPop(22);
      this.emit('ring', this.truck.x, this.truck.y - 20, C.green, 14, 0, 14);
    },

    cue: function (name, opts) {
      var now = performance.now(), gap = name === 'impact' || name === 'crush' ? 55 : 120;
      if (this._lastCue == null) this._lastCue = {};
      if (now - (this._lastCue[name] || -1e9) < gap) return;
      this._lastCue[name] = now; kit.audio.sfx(name, opts);
    },

    pop: function (x, y, text, color) {
      var s = String(text || '').replace(/\s+/g, ' ').trim();
      if (!s) return;
      if (s.length > 32) s = s.slice(0, 29) + '…';
      if (this.toast.active && this.toast.text === s) return;
      var item = { text: s, color: color || C.amber };
      if (this.toast.queue.length >= 2) this.toast.queue[1] = item;
      else this.toast.queue.push(item);
      this.startToast();
    },

    startToast: function () {
      if (this.toast.active || !this.toast.queue.length) return;
      var next = this.toast.queue.shift();
      this.toast.active = true; this.toast.life = 1.0; this.toast.text = next.text; this.toast.color = next.color;
      setTextIfChanged(this.ui.toast, next.text).setColor(hex(next.color)).setVisible(true).setAlpha(1);
    },

    clearToast: function () {
      this.toast.active = false; this.toast.life = 0; this.toast.text = ''; this.toast.queue.length = 0;
      if (this.ui && this.ui.toast) this.ui.toast.setVisible(false);
    },

    /* ------------------------------------------------------------- FX */
    takeFx: function () {
      var n = this.fx.length;
      for (var i = 0; i < n; i++) {
        var idx = (this.fxCursor + i) % n;
        if (!this.fx[idx].active) { this.fxCursor = (idx + 1) % n; return this.fx[idx]; }
      }
      return null;
    },
    emit: function (type, x, y, color, count, speed, size) {
      var n = count || 8, sp = speed || 150;
      if (!this.motion) n = Math.max(2, Math.round(n * 0.45));
      for (var i = 0; i < n; i++) {
        var f = this.takeFx();
        if (!f) break;
        var a = Math.random() * TAU, s = sp * (0.3 + Math.random() * 0.85);
        f.active = true; f.type = type || 'spark'; f.x = x; f.y = y;
        f.vx = Math.cos(a) * s; f.vy = Math.sin(a) * s - sp * 0.35;
        f.life = f.max = 0.35 + Math.random() * 0.42;
        f.size = (size || 3) * (0.6 + Math.random() * 0.8);
        f.color = color || C.paper; f.rot = Math.random() * TAU; f.rotv = (Math.random() - 0.5) * 9;
        f.grav = type === 'smoke' ? -40 : (type === 'shard' ? 620 : (type === 'dirt' ? 520 : 420));
        if (type === 'smoke') { f.life = f.max = 0.5 + Math.random() * 0.5; f.vx *= 0.35; f.vy = -30 - Math.random() * 40; }
        if (type === 'ring') { f.vx = 0; f.vy = 0; }
      }
    },
    crowdPop: function (n) {
      if (!this.motion || !this.run) return;
      var count = Math.min(10, Math.max(3, n / 3 | 0));
      for (var i = 0; i < count; i++) {
        for (var j = 0; j < this.pops.length; j++) {
          var p = this.pops[j];
          if (p.active) continue;
          p.active = true;
          p.x = this.truck.x + (Math.random() - 0.5) * this.W * 1.4;
          p.y = 344 + Math.random() * 80;
          p.life = p.max = 0.34 + Math.random() * 0.3;
          p.size = 4 + Math.random() * 5;
          p.color = Math.random() < 0.5 ? C.paper : this.run.arena.hot;
          break;
        }
      }
    },
    layDecal: function (x, y, a, alpha) {
      var d = this.decals[this.decalHead];
      this.decalHead = (this.decalHead + 1) % this.decals.length;
      d.active = true; d.x = x; d.y = y; d.a = a; d.w = 14; d.alpha = alpha;
    },

    /* ------------------------------------------------------- simulation */
    groundSupport: function () {
      var b = this.truck, a = this.runtime;
      var l = a.groundAt(b.x - 43), r = a.groundAt(b.x + 43);
      var valid = l.solid || r.solid;
      var gy = Math.min(l.solid ? l.y : 9999, r.solid ? r.y : 9999);
      var slope = 0;
      if (l.solid && r.solid) slope = (r.y - l.y) / 86;
      else if (l.solid) slope = l.slope;
      else if (r.solid) slope = r.slope;
      return { valid: valid, y: gy, slope: slope, l: l, r: r };
    },

    beginAir: function () {
      var b = this.truck;
      b.grounded = false; b.airTime = 0; b.spinAccum = 0; b.flipCount = 0; b.launchCharge = b.charge; b.charge = 0;
      b.anim = 'air'; b.animT = 0; b.gapStartX = b.x;
      this.emit('flare', b.x - 28, b.y + 28, this.run.arena.accent, 8, 120, 3);
      this.emit('dirt', b.x, b.y + 34, 0x6b5a44, 7, 150, 3);
      this.cue('launch', { volume: 0.55, rate: 1.14 });
    },

    land: function (surfaceAngle) {
      var b = this.truck, r = this.run;
      var err = Math.abs(shortAngle(b.angle - surfaceAngle));
      var flips = Math.floor(Math.abs(b.spinAccum) / TAU);
      var bigAir = b.airTime;
      var tol = 1 / Math.max(0.6, b.spec.susp);
      var quality = err < 0.105 * tol ? 'PERFECT' : (err < 0.30 * tol ? 'CLEAN' : 'HARD');
      r.landings++;
      if (b.airTime > 0.35) { r.airBank += b.airTime; this.scoreAction(Math.round(120 * b.airTime), 'AIR TIME', C.aqua, 'air'); }
      if (flips > 0) { r.flips += flips; this.scoreAction(420 * flips, flips + 'X FLIP', C.violet, 'flip'); }
      if (Math.abs(b.spinAccum) > Math.PI * 1.45 && flips === 0) this.scoreAction(260, 'FULL SPIN', C.cyan, 'spin');
      // suspension slam: drive the springs from the impact velocity
      var slam = clamp(Math.abs(b.vy) / 520, 0.15, 1) / Math.max(0.6, b.spec.susp);
      b.wheels[0].cv += 9 * slam; b.wheels[1].cv += 9 * slam;
      b.landRecover = 0.34; b.anim = 'land'; b.animT = 0;
      if (quality === 'PERFECT') {
        r.cleanLandings++; b.boost = clamp(b.boost + 28, 0, b.spec.boostMax); this.scoreAction(680, 'PERFECT LANDING', C.green, 'land');
        this.pop(0, 0, 'PERFECT LANDING', C.green); this.cue('crush', { volume: 0.7, rate: 1.2 });
        this.crowdPop(16);
      } else if (quality === 'CLEAN') {
        r.cleanLandings++; b.boost = clamp(b.boost + 16, 0, b.spec.boostMax); this.scoreAction(320, 'CLEAN LANDING', C.aqua, 'land'); this.cue('crush', { volume: 0.55, rate: 1.05 });
      } else {
        this.pop(0, 0, 'HARD LANDING', C.orange); this.cue('impact', { volume: 0.7, rate: 0.82 });
        b.vx *= 0.72; kit.juice.shake(5, 120);
      }
      b.angle = surfaceAngle + clamp(shortAngle(b.angle - surfaceAngle), -0.16, 0.16); b.av *= 0.25; b.spinAccum = 0;
      this.emit('ring', b.x, b.y + 28, quality === 'PERFECT' ? C.green : C.amber, quality === 'PERFECT' ? 12 : 7, 0, 9);
      this.emit('dirt', b.x, b.y + 34, 0x6b5a44, Math.round(6 + slam * 10), 190, 3.4);
      this.emit('smoke', b.x, b.y + 26, 0x8b8272, 3, 60, 8);
      // slow-motion flourish: only for a genuinely big, rotated landing
      if (this.motion && bigAir > 1.0 && flips >= 1 && quality !== 'HARD') {
        this.slow = 0.55;
        this.cue('fanfare', { volume: 0.42, rate: 0.9 });
        this.crowdPop(26);
        this.emit('ring', b.x, b.y, r.arena.hot, 3, 0, 22);
      }
      this.checkObjective();
    },

    crushProps: function (dt) {
      var b = this.truck, a = this.runtime, impact = Math.abs(b.vx) + Math.abs(b.vy) * 0.42;
      if (impact < 92) return;
      for (var i = 0; i < a.props.length; i++) {
        var p = a.props[i];
        if (!p.live || Math.abs(b.x - p.x) > p.w * 0.5 + TRUCK_HALF) continue;
        if (b.y + 26 < p.y - p.h * (1 - p.deform) - 10 || b.y > p.y + 30) continue;
        var add = clamp((impact - 70) / 360, 0.08, 0.36) * b.spec.crush;
        if (p.type === 'bus') add *= 0.76;
        p.deform = clamp(p.deform + add, 0, 1); p.wobble = clamp(p.wobble + 0.5, 0, 1); p.hitFlash = 0.22;
        b.vx *= p.deform > 0.78 ? 0.76 : -0.1; if (b.vy > 0) b.vy = -Math.min(260, b.vy * 0.28 + 100);
        b.wheels[0].cv += 5; b.wheels[1].cv += 5;
        this.emit('spark', p.x, p.y - p.h * (1 - p.deform), p.type === 'bus' ? C.amber : C.orange, 12, 210, 4);
        this.emit('shard', p.x, p.y - p.h * 0.5, p.type === 'bus' ? 0x9e4c43 : 0x6c7d8e, 6, 240, 5);
        this.cue('impact', { volume: p.type === 'bus' ? 0.95 : 0.72, rate: 0.8 + p.deform * 0.25 });
        kit.juice.shake(p.type === 'bus' ? 9 : 5, 130);
        if (p.deform > 0.82 && p.live) {
          p.live = false; this.run.crushed++;
          this.scoreAction(p.type === 'bus' ? 1100 : 520 + p.tier * 100, p.type === 'bus' ? 'BUS CRUSH' : 'CRUSH', p.type === 'bus' ? C.red : C.orange, 'crush');
          this.emit('ring', p.x, p.y - 8, p.type === 'bus' ? C.red : C.amber, 5, 0, 8);
          this.emit('shard', p.x, p.y - p.h * 0.4, p.type === 'bus' ? 0x9e4c43 : 0x567088, 12, 300, 6);
          this.emit('smoke', p.x, p.y - 12, 0x7d7566, 4, 70, 9);
          this.cue('crush', { volume: 0.85, rate: 0.8 + Math.random() * 0.2 });
          this.crowdPop(12);
        }
      }
    },

    pickupPass: function () {
      var b = this.truck, a = this.runtime;
      for (var i = 0; i < a.pickups.length; i++) {
        var p = a.pickups[i];
        if (!p.live || Math.abs(b.x - p.x) > 42 || Math.abs(b.y - p.y) > 72) continue;
        p.live = false; this.run.drops++; this.cue('pickup', { volume: 0.75, rate: 1 + this.run.drops * 0.012 });
        if (p.type === 'flare') { this.scoreAction(850, 'SCORE FLARE', C.amber, 'pickup'); this.pop(0, 0, 'SCORE FLARE', C.amber); }
        else if (p.type === 'boost') { b.boost = clamp(b.boost + 42, 0, b.spec.boostMax); this.pop(0, 0, 'BOOST CAN', C.cyan); }
        else { this.run.time = Math.min(this.run.event.time + 25, this.run.time + 8); this.pop(0, 0, '+8 SEC', C.green); }
        this.emit('ring', p.x, p.y, p.type === 'time' ? C.green : (p.type === 'boost' ? C.cyan : C.amber), 9, 0, 7);
      }
    },

    gatePass: function () {
      if (!this.run || this.run.event.id !== 'ramp-gauntlet') return;
      var b = this.truck, gates = this.runtime.gates;
      for (var i = 0; i < gates.length; i++) if (gates[i].live && b.x > gates[i].x) {
        gates[i].live = false; this.run.gates++;
        this.scoreAction(900, 'LINE GATE ' + this.run.gates, C.cyan, 'gate');
        this.pop(0, 0, 'GATE ' + this.run.gates, C.cyan);
        this.emit('ring', gates[i].x, 400, C.cyan, 12, 0, 9); this.cue('pickup', { volume: 0.65, rate: 1.1 });
      }
    },

    secretPass: function () {
      var s = this.run.arena.secret, b = this.truck;
      if (!this.run.secret && b.x > s.x && b.x < s.x + s.w && !b.grounded && b.y < 390) {
        this.run.secret = true; this.scoreAction(1600, 'SECRET LINE', C.violet, 'secret');
        this.pop(0, 0, 'SECRET LINE', C.violet); this.cue('fanfare', { volume: 0.5, rate: 1.2 });
        this.crowdPop(20);
      }
    },

    /* Rail grind: a real new mechanic. Contact needs an airborne approach
     * from above with the chassis roughly level, then the truck rides the
     * rail, banking score and the 'grind' chain type. */
    grindPass: function (dt, inp) {
      var b = this.truck, rails = this.runtime.rails, r = this.run;
      if (b.grinding) {
        var rail = b.grindRail;
        b.grindTime += dt; r.grindBank += dt;
        b.y = rail.y - 28;
        b.vy = 0;
        b.angle = damp(b.angle, 0, 12, dt);
        b.av *= 0.5;
        b.vx = damp(b.vx, (b.vx >= 0 ? 1 : -1) * Math.max(190, Math.abs(b.vx)), 1.2, dt);
        rail.glow = 1;
        if (Math.random() < 0.7) this.emit('spark', b.x - 20 + Math.random() * 40, rail.y, C.aqua, 1, 130, 2.6);
        if (b.grindTime > 0.4) { b.grindTime = 0; this.scoreAction(240, 'RAIL GRIND', C.aqua, 'grind'); }
        var off = b.x < rail.x - 20 || b.x > rail.x + rail.w + 20;
        if (off || inp.charge || Math.abs(b.vx) < 60) {
          b.grinding = false; b.grindRail = null; b.grounded = false; b.anim = 'air';
          if (inp.charge) { b.vy = -430; this.cue('launch', { volume: 0.45, rate: 1.25 }); }
          this.emit('spark', b.x, rail.y, C.aqua, 8, 190, 3);
        }
        this.checkObjective();
        return true;
      }
      if (b.grounded || b.vy < -90) return false;
      for (var i = 0; i < rails.length; i++) {
        var q = rails[i];
        if (b.x < q.x - 10 || b.x > q.x + q.w + 10) continue;
        var wheelY = b.y + 28;
        if (wheelY < q.y - 36 || wheelY > q.y + 22) continue;
        if (Math.abs(shortAngle(b.angle)) > 0.7) continue;
        b.grinding = true; b.grindRail = q; b.grindTime = 0; b.grounded = false; b.anim = 'grind';
        b.y = q.y - 28; b.vy = 0; b.spinAccum = 0;
        q.glow = 1;
        this.cue('crush', { volume: 0.4, rate: 1.35 });
        this.emit('spark', b.x, q.y, C.aqua, 10, 180, 3);
        this.scoreAction(180, 'RAIL LOCK', C.aqua, 'grind');
        return true;
      }
      return false;
    },

    simStep: function (dt, inp) {
      if (this.mode !== 'play' || this.paused || !this.run || this.run.ended) return;
      var b = this.truck, r = this.run, spec = b.spec;
      r.countdown = Math.max(0, r.countdown - dt); if (r.countdown > 0) return;
      r.time -= dt;
      if (r.trickT > 0) r.trickT -= dt;
      b.wasGrounded = b.grounded;
      var drive = inp.right && !inp.left ? 1 : (inp.left && !inp.right ? -1 : 0);

      if (this.grindPass(dt, inp)) {
        b.x += b.vx * dt;
        b.x = clamp(b.x, 70, r.arena.width - 70);
        this.crushProps(dt); this.pickupPass(); this.gatePass(); this.secretPass();
        this.tickChain(dt);
        if (r.time <= 0) this.endRun();
        return;
      }

      var air = !b.grounded;
      if (b.grounded && inp.charge) b.charge = clamp(b.charge + dt / 1.25, 0, 1);
      if (b.grounded && !inp.charge && b.charge > 0.08) b.charge = Math.max(0, b.charge - dt * 0.35);
      if (inp.boost && b.boost > 0 && Math.abs(b.vx) > 30) {
        b.vx += (b.vx >= 0 ? 1 : -1) * 560 * spec.torque * dt;
        b.boost = Math.max(0, b.boost - 25 * spec.boostUse * dt); r.boostsUsed += dt;
        if (Math.random() < 0.3) this.emit('flare', b.x - 49, b.y + 28, C.cyan, 2, 80, 3);
      }
      if (!air) {
        var target = drive * (inp.boost ? 700 : 460) * spec.torque;
        b.vx = damp(b.vx, target, (drive ? 3.6 : 1.3) * spec.grip, dt);
        if (!drive) b.vx *= Math.pow(0.992, dt * 60);
        b.av += shortAngle(this.groundSupport().slope * -0.25 - b.angle) * 4.2 * dt;
        b.angle += b.av * dt;
      } else {
        b.av += inp.spin * 8.6 * spec.air * dt;
        b.av *= Math.pow(0.995, dt * 60);
        b.angle += b.av * dt; b.spinAccum += b.av * dt; b.airTime += dt;
      }
      if (!b.grounded) b.vy += GRAVITY * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.x = clamp(b.x, 70, r.arena.width - 70);
      var next = this.groundSupport();
      var targetY = next.y - 35;
      var canLand = next.valid && b.vy >= -80 && b.y >= targetY - 22;
      if (b.grounded && next.valid && next.slope < -0.16 && b.vx > 180) {
        b.y = Math.min(b.y, targetY - 2);
        b.vy -= 190 + b.launchCharge * 310 + Math.abs(next.slope) * Math.abs(b.vx) * 0.54;
        this.beginAir();
      } else if (!b.grounded && canLand) {
        b.grounded = true; b.y = targetY; b.vy = 0; b.surfaceAngle = Math.atan(next.slope);
        if (b.gapStartX != null && b.x - b.gapStartX > 210) { r.gapsCleared++; b.gapStartX = null; }
        this.land(b.surfaceAngle);
      } else if (b.grounded && next.valid) {
        b.y = damp(b.y, targetY, 16, dt); b.surfaceAngle = Math.atan(next.slope);
        b.wheelie = clamp(Math.abs(b.angle - b.surfaceAngle) * 2.5, 0, 1);
      } else if (b.grounded && !next.valid) {
        this.beginAir();
      }
      this.updateSuspension(dt, next);
      if (b.y > 740) {
        b.y = targetY - 80; b.vy = -420; b.vx *= 0.55; b.angle = 0;
        this.pop(0, 0, 'RECOVERED', C.orange);
        this.emit('smoke', b.x, b.y + 20, 0x7d7566, 5, 80, 10);
      }
      this.groundEffects(dt, drive);
      this.crushProps(dt); this.pickupPass(); this.gatePass(); this.secretPass();
      this.tickChain(dt);
      if (r.event.id === 'crush-rally' && r.crushed >= r.crushTarget) r.time = Math.min(r.time, 0.1);
      if (r.event.id === 'ramp-gauntlet' && r.gates >= 6) r.time = Math.min(r.time, 0.1);
      if (r.time <= 0) this.endRun();
    },

    tickChain: function (dt) {
      var r = this.run;
      if (r.comboT > 0) r.comboT -= dt;
      else if (r.combo > 0) this.breakChain();
    },

    /* Springs: each wheel carries compression + velocity so the chassis
     * visibly squats on load, slams on landing, and rebounds past rest. */
    updateSuspension: function (dt, support) {
      var b = this.truck, stiff = 150 * b.spec.susp, dampK = 15 / Math.max(0.6, b.spec.susp);
      for (var i = 0; i < 2; i++) {
        var wl = b.wheels[i];
        var targetC = 0;
        if (b.grounded) {
          var gy = i === 0 ? (support.l.solid ? support.l.y : support.y) : (support.r.solid ? support.r.y : support.y);
          targetC = clamp((b.y + 35 - gy) / 22, 0, 1) * 0.35 + 0.16;
          if (b.charge > 0.08) targetC += b.charge * 0.5; // anticipation crouch
        }
        wl.cv += (targetC - wl.compression) * stiff * dt;
        wl.cv -= wl.cv * dampK * dt;
        wl.cv = clamp(wl.cv, -18, 18);
        wl.compression = clamp(wl.compression + wl.cv * dt, -0.25, 1.15);
        wl.squash = damp(wl.squash, clamp(wl.compression, 0, 1), 14, dt);
        wl.spin += b.vx * dt / (WHEEL_R * 1.2);
      }
      if (b.landRecover > 0) b.landRecover -= dt;
      b.tilt = damp(b.tilt, (b.wheels[1].compression - b.wheels[0].compression) * 0.22, 12, dt);
      // animation state machine with anticipation and recovery windows
      b.animT += dt;
      var next = b.anim;
      if (b.grinding) next = 'grind';
      else if (!b.grounded) next = 'air';
      else if (b.landRecover > 0) next = 'land';
      else if (b.charge > 0.08) next = 'charge';
      else if (this.lastInput.boost && b.boost > 0) next = 'boost';
      else if (Math.abs(b.vx) > 45) next = 'drive';
      else next = 'idle';
      if (next !== b.anim) { b.anim = next; b.animT = 0; }
    },

    groundEffects: function (dt, drive) {
      var b = this.truck;
      if (!b.grounded) return;
      var speed = Math.abs(b.vx);
      b.decalT += speed * dt;
      if (b.decalT > 16 && speed > 55) {
        b.decalT = 0;
        this.layDecal(b.x - 6, b.y + 34, b.surfaceAngle, clamp(0.18 + speed / 900, 0.15, 0.5));
      }
      b.dirtT += dt;
      if (b.dirtT > 0.07 && speed > 180 && (drive !== 0 || this.lastInput.boost)) {
        b.dirtT = 0;
        this.emit('dirt', b.x - (b.vx > 0 ? 42 : -42), b.y + 32, 0x6b5a44, 2, 130, 2.6);
      }
    },

    medal: function () {
      var r = this.run, ev = r.event, value = r.score, tiers = ev.medals;
      if (ev.id === 'crush-rally') { value = r.crushed; tiers = r.crushMedals; }
      else if (ev.id === 'ramp-gauntlet') value = r.gates;
      if (value >= tiers[2]) return 3;
      if (value >= tiers[1]) return 2;
      if (value >= tiers[0]) return 1;
      return 0;
    },

    endRun: function () {
      if (!this.run || this.run.ended) return;
      this.run.ended = true; this.run.time = Math.max(0, this.run.time);
      var m = this.medal(), r = this.run;
      var key = r.arena.id + ':' + r.event.id;
      profile.medals[key] = Math.max(profile.medals[key] || 0, m);
      profile.best = Math.max(profile.best || 0, r.score); profile.runs++;
      if (r.careerId && m > 0) profile.career[r.careerId] = Math.max(profile.career[r.careerId] || 0, m);
      // legacy v1 unlock fields stay live so old saves keep meaning
      if (m > 0) profile.unlockedArena = Math.min(ARENAS.length, Math.max(profile.unlockedArena, this.selectedArena + 2));
      if (m > 0) profile.unlockedEvent = Math.min(EVENTS.length, Math.max(profile.unlockedEvent, eventIndex(r.event.id) + 2));
      var newTruck = refreshRoster();
      this.newTruckUnlocked = newTruck;
      saveProfile();
      this.clearToast(); this.setMode('result');
      this.cue(m > 0 ? 'fanfare' : 'impact', { volume: 0.9, rate: m > 0 ? 1 : 0.72 });
      if (m > 0) this.crowdPop(30);
      this.syncDebug();
    },

    /* ------------------------------------------------------------ loop */
    update: function (time, delta) {
      var raw = Math.min(0.05, delta / 1000);
      this.motion = this.motionBase && kit.juice.enabled;
      if (this.slow > 0) { this.slow -= raw; this.timeScale = damp(this.timeScale, 0.34, 14, raw); }
      else this.timeScale = damp(this.timeScale, 1, 8, raw);
      var dt = raw * (this.mode === 'play' ? this.timeScale : 1);
      this.clock += dt;
      this.collectTaps();
      this.applyForceSwitch(false);
      var inp = this.inputFrame();
      this.updateTransition(raw);
      if (this.mode === 'title') {
        if (inp.enter || inp.menu || this.taps.length) { this.setMode('select'); this.cue('select'); }
      } else if (this.mode === 'select') {
        this.menuInput(inp);
      } else if (this.mode === 'result') {
        if (inp.keyR) this.startRun(this.selectedArena, this.selectedEvent, this.run ? this.run.careerId : null);
        else if (inp.enter || inp.menu || this.taps.length) { this.setMode('select'); this.cue('select'); }
      } else if (this.mode === 'play') {
        if (inp.menu && !this.prev.esc) kit.openSettings();
        this.acc += Math.min(0.08, dt);
        var steps = 0;
        while (this.acc >= STEP && steps < MAX_STEPS) { this.simStep(STEP, inp); this.acc -= STEP; steps++; }
        if (this.run && this.run.ended && this.mode === 'play') this.setMode('result');
      }
      this.prev.enter = inp.enter; this.prev.esc = inp.menu;
      this.updateFx(dt);
      this.render();
      this.syncDebug();
    },

    menuInput: function (inp) {
      var i;
      if (inp.left && !this.prev.left) { this.tab = (this.tab + TABS.length - 1) % TABS.length; this.cue('tick'); }
      if (inp.right && !this.prev.right) { this.tab = (this.tab + 1) % TABS.length; this.cue('tick'); }
      var len = this.rowCount();
      if (inp.up && !this.prev.up) { this.setSel((this.sel() + len - 1) % len); this.cue('tick'); }
      if (inp.down && !this.prev.down) { this.setSel((this.sel() + 1) % len); this.cue('tick'); }
      var activate = inp.enter || inp.boost;
      for (i = 0; i < this.taps.length; i++) {
        var tp = this.taps[i], j;
        var handled = false;
        for (j = 0; j < this.menuHit.tabs.length; j++) {
          var hb = this.menuHit.tabs[j];
          if (tp.x >= hb.x && tp.x <= hb.x + hb.w && tp.y >= hb.y && tp.y <= hb.y + hb.h) {
            this.tab = hb.i; this.cue('tick'); handled = true;
          }
        }
        if (handled) continue;
        for (j = 0; j < this.menuHit.rows.length; j++) {
          var rb = this.menuHit.rows[j];
          if (!rb.live) continue;
          if (tp.x >= rb.x && tp.x <= rb.x + rb.w && tp.y >= rb.y && tp.y <= rb.y + rb.h) {
            var idx = this.rowScroll() + rb.i;
            if (idx < len) {
              if (idx === this.sel()) activate = true;
              else { this.setSel(idx); this.cue('tick'); }
            }
            handled = true;
          }
        }
      }
      if (activate) this.activateRow();
      this.prev.left = inp.left; this.prev.right = inp.right; this.prev.up = inp.up; this.prev.down = inp.down;
    },

    rowCount: function () { return this.tab === 0 ? CAREER.length : (this.tab === 1 ? ARENAS.length : TRUCKS.length); },
    sel: function () { return this.tab === 0 ? this.selCareer : (this.tab === 1 ? this.selArena : this.selTruck); },
    setSel: function (v) {
      if (this.tab === 0) this.selCareer = v; else if (this.tab === 1) this.selArena = v; else this.selTruck = v;
    },
    rowScroll: function () {
      var len = this.rowCount(), visible = this.menuVisible || 4;
      if (len <= visible) return 0;
      return clamp(this.sel() - 2, 0, len - visible);
    },

    activateRow: function () {
      var i = this.sel();
      if (this.tab === 0) {
        if (!careerUnlocked(i) && !forcedEvent()) {
          this.pop(0, 0, 'NEEDS ' + CAREER[i].gate + ' MEDALS', C.orange);
          this.cue('impact', { volume: 0.35, rate: 0.65 });
          return;
        }
        this.cue('select');
        this.startRun(CAREER[i].arena, CAREER[i].event, CAREER[i].id);
      } else if (this.tab === 1) {
        if (!arenaUnlocked(i) && !forcedEvent() && forcedArena() == null) {
          this.pop(0, 0, 'NEEDS ' + ARENA_GATE[i] + ' MEDALS', C.orange);
          this.cue('impact', { volume: 0.35, rate: 0.65 });
          return;
        }
        this.cue('select');
        this.startRun(i, 'freestyle');
      } else {
        var spec = TRUCKS[i];
        if (profile.trucks.indexOf(spec.id) < 0) {
          this.pop(0, 0, 'NEEDS ' + spec.gate + ' MEDALS', C.orange);
          this.cue('impact', { volume: 0.35, rate: 0.65 });
          return;
        }
        profile.truck = spec.id; saveProfile();
        this.cue('select');
        this.pop(0, 0, spec.name + ' READY', C.green);
      }
    },

    updateFx: function (dt) {
      var i;
      for (i = 0; i < this.fx.length; i++) {
        var f = this.fx[i]; if (!f.active) continue;
        f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += f.grav * dt;
        f.vx *= Math.pow(0.97, dt * 60); f.rot += f.rotv * dt;
        if (f.life <= 0) f.active = false;
      }
      for (i = 0; i < this.pops.length; i++) {
        var p = this.pops[i]; if (!p.active) continue;
        p.life -= dt; if (p.life <= 0) p.active = false;
      }
      if (this.runtime) {
        for (i = 0; i < this.runtime.rails.length; i++) {
          var q = this.runtime.rails[i];
          if (q.glow > 0) q.glow = Math.max(0, q.glow - dt * 2.2);
        }
        for (i = 0; i < this.runtime.props.length; i++) {
          var pr = this.runtime.props[i];
          if (pr.hitFlash > 0) pr.hitFlash = Math.max(0, pr.hitFlash - dt);
          if (pr.wobble > 0) pr.wobble = Math.max(0, pr.wobble - dt * 1.6);
        }
      }
      if (this.toast.active) {
        this.toast.life -= dt;
        this.ui.toast.setAlpha(this.motion ? (this.toast.life < 0.18 ? clamp(this.toast.life / 0.18, 0, 1) : 1) : 1);
        if (this.toast.life <= 0) {
          this.toast.active = false; this.ui.toast.setVisible(false); this.startToast();
        }
      } else {
        this.startToast();
      }
    },

    /* ---------------------------------------------------------- render */
    render: function () {
      var playing = this.mode === 'play' && this.runtime;
      this.renderBg(playing);
      if (playing) this.renderWorld();
      else {
        this.cameras.main.setScroll(0, 0);
        this.layers.world.clear(); this.layers.decal.clear(); this.layers.crowdFx.clear(); this.layers.fx.clear();
        this.renderMenuBackdrop();
      }
      this.renderHud();
      this.renderToast();
      this.renderTransition();
    },

    renderBg: function (playing) {
      var g = this.layers.bg, w = this.W, h = this.H;
      g.clear();
      var i;
      if (playing) {
        var def = this.run.arena, scroll = this.cameras.main.scrollX, cy = this.camY;
        for (i = 0; i < this.backdrops.length; i++) if (!this.backdrops[i].visible) this.backdrops[i].setVisible(true);
        // tilePosition is in TEXTURE pixels, so a world offset D maps to D*DPR
        this.sky.setTilePosition(scroll * 0.02 * DPR, 0);
        this.sky.y = 0;
        this.far.setTilePosition(scroll * 0.22 * DPR, 0);
        this.far.y = 196 - cy * 0.55;
        this.stands.setTilePosition(scroll * 0.55 * DPR, 0);
        this.stands.y = 262 - cy * 0.82;
        this.crowdBand.setTilePosition(scroll * DPR, 0);
        this.crowdBand.y = 336 - cy * 0.95;
        // arena wash: a vertical gradient, never a flat single-colour fill
        g.fillGradientStyle(def.accent, def.accent, def.hot, def.hot, 0.10, 0.10, 0.03, 0.03);
        g.fillRect(0, 0, w, h);
      } else {
        for (i = 0; i < this.backdrops.length; i++) if (this.backdrops[i].visible) this.backdrops[i].setVisible(false);
        var a = ARENAS[this.tab === 1 ? this.selArena : this.selectedArena] || ARENAS[0];
        g.fillGradientStyle(a.sky[0], a.sky[0], a.sky[1], a.sky[2], 1, 1, 1, 1);
        g.fillRect(0, 0, w, h);
        g.fillStyle(0x172438, 0.42); g.fillCircle(w * 0.72, h * 0.18, Math.min(w, h) * 0.34);
        g.fillStyle(a.accent, 0.10); g.fillCircle(w * 0.2, h * 0.8, Math.min(w, h) * 0.3);
        for (i = 0; i < 6; i++) { g.fillStyle(i % 2 ? 0x101623 : 0x0d121d, 0.5); g.fillRect(0, i * h / 6, w, 2); }
      }
    },

    /* Garage preview: the chosen chassis, idling with a slow suspension
     * breath, so the roster screen is never a static list of words. */
    renderTruckPreview: function (g, spec, x, y, sc) {
      var t = this.motion ? Math.sin(this.clock * 1.6) : 0;
      var b = { render: { x: x, y: y + t * 2, angle: t * 0.03, squashY: 1 - Math.abs(t) * 0.02, scale: sc } };
      var ca = Math.cos(b.render.angle), saN = Math.sin(b.render.angle);
      g.fillStyle(0x05070a, 0.5); g.fillEllipse(x, y + 40 * sc, 150 * sc, 16 * sc);
      for (var wi = 0; wi < 2; wi++) {
        var ox = (wi ? 44 : -44) * sc;
        var wx = x + ox * ca + 12 * sc * saN, wy = b.render.y + ox * saN + 12 * sc * ca;
        var vr = 23 * sc;
        g.fillStyle(0x05070b, 1); g.fillCircle(wx, wy, vr);
        g.fillStyle(0x121924, 1); g.fillCircle(wx, wy, vr * 0.71);
        g.fillStyle(0x33415a, 1); g.fillCircle(wx, wy, vr * 0.45);
        g.fillStyle(spec.trim, 1); g.fillCircle(wx, wy, vr * 0.17);
      }
      this.poly(g, b, [[-61,-18],[-42,-30],[15,-32],[48,-20],[61,0],[53,18],[-58,18]], 0x121923, 1);
      this.poly(g, b, [[-55,-14],[-37,-26],[10,-28],[43,-17],[52,4],[-51,5]], spec.body, 1);
      this.poly(g, b, [[-22,-24],[-7,-43],[28,-40],[43,-17],[-11,-18]], 0x1a2632, 1);
      this.poly(g, b, [[-16,-27],[-5,-38],[10,-36],[10,-20]], spec.glass, 0.86);
      this.poly(g, b, [[-56,2],[56,1],[50,9],[-49,11]], spec.trim, 0.96);
      this.poly(g, b, [[-53,-13],[-36,-24],[9,-26],[41,-16],[38,-11],[-49,-6]], C.paper, 0.13);
    },

    renderMenuBackdrop: function () {
      var g = this.layers.world; g.clear();
      var w = this.W, h = this.H, a = ARENAS[this.tab === 1 ? this.selArena : this.selectedArena] || ARENAS[0];
      g.fillStyle(a.accent, 0.04); g.fillCircle(w * 0.5, h * 0.52, Math.min(w, h) * 0.36);
      g.lineStyle(3, a.accent, 0.14); g.strokeCircle(w * 0.5, h * 0.52, Math.min(w, h) * 0.3);
      g.lineStyle(1, a.hot, 0.1); g.strokeCircle(w * 0.5, h * 0.52, Math.min(w, h) * 0.35);
      for (var i = 0; i < 14; i++) {
        var x = (i + 0.5) * w / 14, bob = this.motion ? Math.sin(this.clock * 2.5 + i) * 4 : 0;
        g.fillStyle(i % 3 === 0 ? a.hot : a.accent, 0.5);
        g.fillCircle(x, h - 12 + bob, 3 + (i % 2));
      }
      if (this.mode === 'select' && this.tab === 2) {
        var spec = TRUCKS[clamp(this.selTruck, 0, TRUCKS.length - 1)];
        var owned = profile.trucks.indexOf(spec.id) >= 0;
        this.renderTruckPreview(g, owned ? spec : { body: 0x2a3140, trim: 0x3d4658, glass: 0x39424f },
          w * 0.74, h * 0.62, Math.min(1.15, w / 760));
      }
    },

    renderWorld: function () {
      var g = this.layers.world, a = this.runtime, def = a.def, b = this.truck;
      var cam = this.cameras.main;
      var targetX = clamp(b.x - this.W * 0.32, 0, def.width - this.W);
      var wantY = clamp(b.y - this.H * 0.44, 0, Math.max(0, WORLD_H - this.H));
      this.camY = damp(this.camY, wantY, 8, 1 / 60);
      var shake = kit.juice.frame();
      cam.setScroll(targetX + shake.dx, this.camY + shake.dy);
      var x0 = cam.scrollX - 80, x1 = cam.scrollX + this.W + 80;

      g.clear();
      this.renderGround(g, def, x0, x1);
      this.renderRamps(g, def, x0, x1);
      this.renderSignature(g, def, x0, x1);
      this.renderRails(g, a.rails, x0, x1);
      this.renderSecret(g, def.secret, x0, x1);
      this.renderGates(g, a.gates, x0, x1);
      this.renderProps(g, a.props, x0, x1);
      this.renderPickups(g, a.pickups, x0, x1);
      this.renderDecals(x0, x1);
      this.renderCrowdFx(x0, x1);
      this.renderTruck(g, b);
      this.renderFx(this.layers.fx, x0, x1);
    },

    renderGround: function (g, def, x0, x1) {
      var p = def.profile, i;
      // haze scrim: pushes the backdrop back and seats the playfield
      g.fillGradientStyle(def.sky[2], def.sky[2], 0x05070d, 0x05070d, 0, 0, 0.72, 0.72);
      g.fillRect(x0, 250, x1 - x0, 300);
      // fill only the visible slice of the terrain polygon
      g.beginPath();
      g.moveTo(x0, WORLD_H);
      g.lineTo(x0, profileY(def, x0));
      for (i = 0; i < p.length; i++) if (p[i][0] > x0 && p[i][0] < x1) g.lineTo(p[i][0], p[i][1]);
      g.lineTo(x1, profileY(def, x1));
      g.lineTo(x1, WORLD_H);
      g.closePath();
      // graded rock: light at the surface, deep at the pit floor
      g.fillGradientStyle(0x39445a, 0x39445a, 0x11151f, 0x161b27, 1, 1, 1, 1);
      g.fillPath();
      // strata bands + surface lighting keep the mass off one flat colour
      for (i = 0; i < 5; i++) {
        var by = 520 + i * 26;
        g.fillStyle(i % 2 ? 0x2a3346 : 0x232b3b, 0.55 - i * 0.07);
        g.fillRect(x0, by, x1 - x0, 13);
      }
      for (i = 0; i < 3; i++) {
        g.fillStyle(def.accent, 0.05 - i * 0.012);
        g.fillRect(x0, 514 + i * 30, x1 - x0, 8);
      }
      // scattered aggregate so the floor is never a clean plane
      var seed = Math.floor(x0 / 64);
      for (i = 0; i < 26; i++) {
        var gx = (seed + i) * 64 % (x1 - x0 + 64) + x0;
        var gy = 524 + ((seed + i * 7) % 5) * 22;
        g.fillStyle(i % 3 ? 0x323b4d : 0x151b26, 0.5);
        g.fillRect(gx, gy, 5 + (i % 3) * 4, 3);
      }
      g.lineStyle(6, def.accent, 0.86);
      g.beginPath(); g.moveTo(x0, profileY(def, x0));
      for (i = 0; i < p.length; i++) if (p[i][0] > x0 && p[i][0] < x1) g.lineTo(p[i][0], p[i][1]);
      g.lineTo(x1, profileY(def, x1)); g.strokePath();
      g.lineStyle(2, C.paper, 0.18);
      g.beginPath(); g.moveTo(x0, profileY(def, x0) + 11);
      for (i = 0; i < p.length; i++) if (p[i][0] > x0 && p[i][0] < x1) g.lineTo(p[i][0], p[i][1] + 11);
      g.lineTo(x1, profileY(def, x1) + 11); g.strokePath();
      for (i = 0; i < def.gaps.length; i++) {
        var gap = def.gaps[i];
        if (gap.x + gap.w < x0 || gap.x > x1) continue;
        // chasm: graded depth, lit lip, broken edges
        g.fillGradientStyle(0x131a26, 0x131a26, 0x03050a, 0x03050a, 1, 1, 1, 1);
        g.fillRect(gap.x, 498, gap.w, WORLD_H - 498);
        g.lineStyle(3, def.hot, 0.7); g.lineBetween(gap.x - 6, 500, gap.x + gap.w + 6, 500);
        g.fillStyle(def.hot, 0.1); g.fillRect(gap.x, 500, gap.w, 22);
        g.fillStyle(0x0a0e16, 1);
        g.fillTriangle(gap.x, 498, gap.x + 22, 498, gap.x + 6, 534);
        g.fillTriangle(gap.x + gap.w, 498, gap.x + gap.w - 24, 498, gap.x + gap.w - 8, 542);
        g.lineStyle(2, C.paper, 0.1);
        for (var s = 0; s < 3; s++) g.lineBetween(gap.x + 6, 520 + s * 26, gap.x + gap.w - 6, 528 + s * 26);
      }
    },

    renderRamps: function (g, def, x0, x1) {
      for (var i = 0; i < def.ramps.length; i++) {
        var r = def.ramps[i];
        if (r.x + r.w < x0 || r.x > x1) continue;
        var baseY = profileY(def, r.x) + 2;
        var topY = profileY(def, r.x + r.w * 0.78) - 4;
        g.fillStyle(def.hot, 0.18); g.fillTriangle(r.x, baseY, r.x + r.w, baseY, r.x + r.w * 0.78, topY);
        g.lineStyle(3, def.hot, 0.6); g.lineBetween(r.x, baseY, r.x + r.w * 0.78, topY);
        if (r.kind === 'light') {
          for (var z = 0; z < 5; z++) {
            var t = z / 4;
            g.fillStyle(def.accent, 0.5 + 0.3 * Math.sin(this.clock * 4 + z));
            g.fillCircle(lerp(r.x, r.x + r.w * 0.78, t), lerp(baseY, topY, t), 3);
          }
        } else if (r.kind === 'scrap' || r.kind === 'dock') {
          for (var s = 0; s < 4; s++) {
            g.lineStyle(2, def.accent, 0.3);
            g.lineBetween(r.x + 16 + s * (r.w / 5), baseY, r.x + 26 + s * (r.w / 5), topY + 24);
          }
        } else {
          for (var q = 0; q < 4; q++) {
            g.lineStyle(1, def.accent, 0.32);
            g.lineBetween(r.x + 18 + q * 40, baseY, r.x + 26 + q * 40, topY + 34);
          }
        }
      }
    },

    renderSignature: function (g, def, x0, x1) {
      var x = def.signature.x, y = 470, k = def.signature.kind;
      if (x + 400 < x0 || x - 400 > x1) return;
      g.lineStyle(8, def.hot, 0.54);
      if (k === 'bowl') {
        g.strokeEllipse(x, y - 55, 350, 170);
        g.lineStyle(3, C.paper, 0.3); g.strokeEllipse(x, y - 55, 290, 125);
      } else if (k === 'crusher') {
        g.lineBetween(x - 105, 245, x - 105, 480); g.lineBetween(x + 105, 245, x + 105, 480);
        g.fillStyle(def.hot, 0.2); g.fillRect(x - 84, 300, 168, 50);
        g.lineStyle(3, def.hot, 0.8); g.strokeRect(x - 84, 300, 168, 50);
      } else if (k === 'canyon') {
        g.lineBetween(x - 165, 420, x - 40, 295); g.lineBetween(x + 165, 420, x + 40, 295);
        g.lineBetween(x - 40, 295, x + 40, 295);
        g.fillStyle(def.hot, 0.14); g.fillTriangle(x - 170, 480, x, 305, x + 170, 480);
      } else if (k === 'crane') {
        g.lineBetween(x - 90, 470, x - 90, 240); g.lineBetween(x + 90, 470, x + 90, 240);
        g.lineBetween(x - 130, 240, x + 130, 240);
        g.lineStyle(3, def.accent, 0.7); g.lineBetween(x, 240, x, 320);
        g.fillStyle(def.hot, 0.24); g.fillRect(x - 40, 320, 80, 44);
        g.lineStyle(3, def.hot, 0.8); g.strokeRect(x - 40, 320, 80, 44);
      } else {
        g.strokeCircle(x, 375, 105);
        g.lineStyle(3, def.accent, 0.8); g.strokeCircle(x, 375, 78);
        g.fillStyle(def.hot, 0.16); g.fillCircle(x, 375, 42);
      }
      g.fillStyle(def.hot, 0.9); g.fillRect(x - 112, 222, 224, 4);
      g.fillStyle(C.paper, 0.48); g.fillRect(x - 76, 216, 152, 3);
    },

    renderRails: function (g, rails, x0, x1) {
      for (var i = 0; i < rails.length; i++) {
        var q = rails[i];
        if (q.x + q.w < x0 || q.x > x1) continue;
        g.fillStyle(0x0a0e16, 0.9); g.fillRect(q.x, q.y - 2, q.w, 7);
        g.lineStyle(3, C.aqua, 0.55 + q.glow * 0.45); g.lineBetween(q.x, q.y, q.x + q.w, q.y);
        g.fillStyle(C.steel, 1);
        for (var p = 0; p <= 2; p++) {
          var px = q.x + (q.w / 2) * p;
          g.fillRect(px - 3, q.y + 4, 6, 40);
        }
        if (q.glow > 0) { g.lineStyle(6, C.aqua, q.glow * 0.4); g.lineBetween(q.x, q.y, q.x + q.w, q.y); }
      }
    },

    renderSecret: function (g, s, x0, x1) {
      if (s.x + s.w < x0 || s.x > x1) return;
      g.lineStyle(3, C.violet, 0.4); g.lineBetween(s.x, 465, s.x + s.w, 465);
      g.lineStyle(1, C.paper, 0.3);
      for (var i = 0; i < 5; i++) g.lineBetween(s.x + 20 + i * 52, 465, s.x + 36 + i * 52, 445);
    },

    renderProps: function (g, props, x0, x1) {
      for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (p.x + 90 < x0 || p.x - 90 > x1) continue;
        if (!p.live) { // wreck husk stays on the field
          g.fillStyle(0x090c12, 0.6); g.fillEllipse(p.x, p.y + 6, p.w + 16, 10);
          g.fillStyle(0x39404d, 1); g.fillRoundedRect(p.x - p.w * 0.58, p.y - 11, p.w * 1.16, 11, 4);
          g.fillStyle(0x1d232d, 1); g.fillRect(p.x - p.w * 0.34, p.y - 15, p.w * 0.68, 5);
          g.lineStyle(2, C.orange, 0.28); g.lineBetween(p.x - p.w * 0.4, p.y - 7, p.x + p.w * 0.3, p.y - 2);
          continue;
        }
        var d = p.deform, w = p.w * (1 + d * 0.16), h = p.h * (1 - d * 0.76), y = p.y - h;
        var wob = this.motion ? Math.sin(this.clock * 18 + i) * p.wobble * 2 : 0;
        p.render.x = p.x + wob; p.render.y = y; p.render.sx = w / p.w; p.render.sy = h / p.h; p.render.rot = wob * 0.015;
        g.fillStyle(0x090c12, 0.64); g.fillEllipse(p.x, p.y + 7, w + 12, 10);
        if (p.type === 'bus') {
          g.fillStyle(0x9e4c43, 1); g.fillRoundedRect(p.render.x - w / 2, y, w, h, 8);
          g.fillStyle(C.amber, 0.76); g.fillRect(p.render.x - w * 0.36, y + h * 0.22, w * 0.72, 7);
          g.fillStyle(0x17202a, 1);
          for (var wi = 0; wi < 4; wi++) g.fillRect(p.render.x - w * 0.36 + wi * w * 0.22, y + h * 0.4, w * 0.13, h * 0.21);
        } else {
          g.fillStyle(p.seed % 2 ? 0x567088 : 0x6c7d8e, 1); g.fillRoundedRect(p.render.x - w / 2, y, w, h, 7);
          g.fillStyle(p.seed % 3 ? 0x1b2732 : 0xffca68, 0.8); g.fillRect(p.render.x - w * 0.32, y + h * 0.2, w * 0.64, Math.max(3, h * 0.18));
          g.fillStyle(0x0d121a, 1);
          g.fillCircle(p.render.x - w * 0.29, p.y - 5, 8); g.fillCircle(p.render.x + w * 0.29, p.y - 5, 8);
        }
        // panel shading: highlight along the roof, shadow into the sills
        g.fillStyle(C.paper, 0.14); g.fillRect(p.render.x - w * 0.44, y + 2, w * 0.88, Math.max(2, h * 0.12));
        g.fillStyle(0x05070c, 0.3); g.fillRect(p.render.x - w * 0.46, p.y - Math.max(3, h * 0.16), w * 0.92, Math.max(3, h * 0.16));
        if (d > 0.22) { g.lineStyle(3, C.orange, 0.72); g.lineBetween(p.x - w * 0.35, y + h * 0.4, p.x + w * 0.25, y + h * 0.62); }
        if (d > 0.5) { g.lineStyle(2, C.amber, 0.5); g.lineBetween(p.x - w * 0.2, y + h * 0.25, p.x + w * 0.36, y + h * 0.5); }
        if (p.hitFlash > 0) { g.fillStyle(C.paper, p.hitFlash * 2.6); g.fillRoundedRect(p.render.x - w / 2, y, w, h, 7); }
      }
    },

    renderPickups: function (g, pickups, x0, x1) {
      for (var i = 0; i < pickups.length; i++) {
        var p = pickups[i];
        if (!p.live || p.x + 40 < x0 || p.x - 40 > x1) continue;
        var bob = this.motion ? Math.sin(this.clock * 3 + p.phase) * 6 : 0;
        var col = p.type === 'time' ? C.green : (p.type === 'boost' ? C.cyan : C.amber);
        p.render.y = p.y + bob; p.render.s = 1 + (this.motion ? Math.sin(this.clock * 4 + p.phase) * 0.08 : 0);
        g.lineStyle(2, col, 0.3); g.strokeCircle(p.x, p.render.y, 20 * p.render.s);
        g.fillStyle(col, 0.16); g.fillCircle(p.x, p.render.y, 16 * p.render.s);
        g.fillStyle(col, 0.95); g.fillRoundedRect(p.x - 10, p.render.y - 10, 20, 20, 5);
        g.fillStyle(C.ink, 1);
        if (p.type === 'flare') g.fillTriangle(p.x, p.render.y - 6, p.x + 6, p.render.y + 5, p.x - 6, p.render.y + 5);
        else if (p.type === 'boost') g.fillTriangle(p.x - 2, p.render.y - 7, p.x + 6, p.render.y, p.x - 2, p.render.y + 7);
        else { g.fillRect(p.x - 6, p.render.y - 2, 12, 4); g.fillRect(p.x - 2, p.render.y - 6, 4, 12); }
      }
    },

    renderGates: function (g, gates, x0, x1) {
      // line gates are a Ramp Gauntlet fixture; they do not clutter other events
      if (!this.run || this.run.event.id !== 'ramp-gauntlet') return;
      for (var i = 0; i < gates.length; i++) {
        var q = gates[i];
        if (!q.live || q.x + 60 < x0 || q.x - 60 > x1) continue;
        var pulse = this.motion ? Math.sin(this.clock * 5 + i) * 5 : 0;
        g.lineStyle(4, C.cyan, 0.72); g.strokeCircle(q.x, 390, 35 + pulse);
        g.lineStyle(2, C.paper, 0.38);
        g.lineBetween(q.x - 35, 390, q.x - 35, 500); g.lineBetween(q.x + 35, 390, q.x + 35, 500);
      }
    },

    renderDecals: function (x0, x1) {
      var g = this.layers.decal; g.clear();
      for (var i = 0; i < this.decals.length; i++) {
        var d = this.decals[i];
        if (!d.active || d.x < x0 || d.x > x1) continue;
        g.lineStyle(5, 0x1a1a1f, d.alpha);
        var dx = Math.cos(d.a) * d.w, dy = Math.sin(d.a) * d.w;
        g.lineBetween(d.x - dx * 0.5, d.y - dy * 0.5, d.x + dx * 0.5, d.y + dy * 0.5);
      }
    },

    renderCrowdFx: function (x0, x1) {
      var g = this.layers.crowdFx; g.clear();
      for (var i = 0; i < this.pops.length; i++) {
        var p = this.pops[i];
        if (!p.active || p.x < x0 || p.x > x1) continue;
        var a = clamp(p.life / p.max, 0, 1);
        g.fillStyle(p.color, a * 0.9); g.fillCircle(p.x, p.y, p.size * (1.6 - a));
        g.fillStyle(C.paper, a * 0.5); g.fillCircle(p.x, p.y, p.size * 0.45);
      }
    },

    poly: function (g, b, pts, color, alpha, ox, oy) {
      var ca = Math.cos(b.render.angle), sa = Math.sin(b.render.angle);
      var bx = b.render.x, by = b.render.y + (oy || 0);
      var sc = b.render.scale || 1;
      g.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var px = pts[i][0] * sc, py = pts[i][1] * (b.render.squashY || 1) * sc;
        var x = bx + px * ca - py * sa, y = by + px * sa + py * ca;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath(); g.fillStyle(color, alpha == null ? 1 : alpha); g.fillPath();
    },

    renderTruck: function (g, b) {
      var spec = b.spec;
      var cL = b.wheels[0].compression, cR = b.wheels[1].compression;
      var avg = (cL + cR) * 0.5;
      b.render.x = b.x;
      b.render.y = b.y + avg * 9;                 // chassis squats on compression
      b.render.angle = b.angle + b.tilt;          // and pitches under uneven load
      b.render.squash = avg;
      b.render.squashY = 1 - clamp(avg, 0, 1) * 0.1 + (b.landRecover > 0 ? 0 : 0);
      var ca = Math.cos(b.render.angle), sa = Math.sin(b.render.angle);

      g.fillStyle(0x05070a, 0.58); g.fillEllipse(b.x, b.y + 38, 128, 16);

      // wheels: monster-truck scale, deform on load, spokes spin, contact
      // patch flattens as the spring compresses
      var VR = 23;
      for (var wi = 0; wi < 2; wi++) {
        var wl = b.wheels[wi];
        var offX = wi ? 44 : -44;
        var lift = clamp(wl.compression, -0.25, 1) * 11;
        var wx = b.x + offX * ca - (-12 - lift) * sa;
        var wy = b.y + 12 + offX * sa + (-12 - lift) * ca;
        var sq = clamp(wl.squash, 0, 1);
        var rx = VR * (1 + sq * 0.2), ry = VR * (1 - sq * 0.24);
        var sp = wl.spin;
        g.fillStyle(0x05070b, 1); g.fillEllipse(wx, wy, rx * 2, ry * 2);
        // tread lugs cut into the shoulder, so the tyre reads as rubber
        for (var tb = 0; tb < 9; tb++) {
          var ta = sp + tb / 9 * TAU;
          g.fillStyle(0x1b232f, 1);
          g.fillCircle(wx + Math.cos(ta) * rx * 0.84, wy + Math.sin(ta) * ry * 0.84, 3.6);
        }
        g.fillStyle(0x121924, 1); g.fillEllipse(wx, wy, rx * 1.42, ry * 1.42);
        g.fillStyle(0x33415a, 1); g.fillEllipse(wx, wy, rx * 0.9, ry * 0.9);
        g.lineStyle(2, C.paper, 0.35);
        for (var sk = 0; sk < 3; sk++) {
          var sa2 = sp + sk / 3 * Math.PI;
          g.lineBetween(wx - Math.cos(sa2) * rx * 0.42, wy - Math.sin(sa2) * ry * 0.42,
            wx + Math.cos(sa2) * rx * 0.42, wy + Math.sin(sa2) * ry * 0.42);
        }
        g.fillStyle(spec.trim, 1); g.fillCircle(wx, wy, Math.max(2.5, VR * 0.17));
        g.fillStyle(C.paper, 0.10);
        g.fillEllipse(wx - rx * 0.3, wy - ry * 0.36, rx * 0.7, ry * 0.46);
      }

      // suspension arms visibly travel between chassis and wheels
      for (var ai = 0; ai < 2; ai++) {
        var ox = ai ? 44 : -44;
        var liftA = clamp(b.wheels[ai].compression, -0.25, 1) * 11;
        var ax = b.x + ox * ca - (-12 - liftA) * sa, ay = b.y + 12 + ox * sa + (-12 - liftA) * ca;
        var hx = b.render.x + ox * 0.5 * ca - 8 * sa, hy = b.render.y + ox * 0.5 * sa + 8 * ca;
        g.lineStyle(6, 0x0d131c, 1); g.lineBetween(hx, hy, ax, ay);
        g.lineStyle(3, C.steel, 0.95); g.lineBetween(hx, hy, ax, ay);
        // coil-over: the visible spring travel
        var coils = 5;
        for (var cc = 0; cc <= coils; cc++) {
          var tt = cc / coils;
          g.fillStyle(cc % 2 ? C.paper : C.steel, 0.55);
          g.fillCircle(lerp(hx, ax, tt), lerp(hy, ay, tt), 2.4);
        }
      }

      this.poly(g, b, [[-61,-18],[-42,-30],[15,-32],[48,-20],[61,0],[53,18],[-58,18]], 0x121923, 1);
      this.poly(g, b, [[-55,-14],[-37,-26],[10,-28],[43,-17],[52,4],[-51,5]], spec.body, 1);
      this.poly(g, b, [[-22,-24],[-7,-43],[28,-40],[43,-17],[-11,-18]], 0x1a2632, 1);
      this.poly(g, b, [[-16,-27],[-5,-38],[10,-36],[10,-20]], spec.glass, 0.86);
      this.poly(g, b, [[13,-36],[26,-34],[38,-19],[15,-20]], 0x42637a, 0.95);
      this.poly(g, b, [[-56,2],[56,1],[50,9],[-49,11]], spec.trim, 0.96);
      this.poly(g, b, [[-45,12],[-18,12],[-22,18],[-51,17]], C.orange, 1);
      this.poly(g, b, [[23,-32],[41,-28],[51,-16],[39,-17]], C.paper, 0.8);
      // body shading pass: sun-side rim light, ground-side shadow, so the
      // chassis is never a flat block of one colour
      this.poly(g, b, [[-53,-13],[-36,-24],[9,-26],[41,-16],[38,-11],[-49,-6]], C.paper, 0.13);
      this.poly(g, b, [[-51,0],[52,0],[50,5],[-50,6]], 0x05070c, 0.28);
      g.lineStyle(2, C.paper, 0.4);
      g.lineBetween(b.render.x - 55 * ca + 14 * sa, b.render.y - 55 * sa - 14 * ca,
        b.render.x + 43 * ca + 26 * sa, b.render.y + 43 * sa - 26 * ca);

      if (b.boost > 0 && (this.lastInput.boost || b.boost > 90)) {
        var flick = 1 + (this.motion ? Math.sin(this.clock * 40) * 0.18 : 0);
        g.fillStyle(C.cyan, 0.82);
        g.fillTriangle(b.x - 61, b.render.y + 6, b.x - 92 * flick, b.render.y - 2, b.x - 86 * flick, b.render.y + 15);
        g.fillStyle(C.paper, 0.55);
        g.fillTriangle(b.x - 61, b.render.y + 7, b.x - 76 * flick, b.render.y + 2, b.x - 74 * flick, b.render.y + 12);
      }
      if (b.charge > 0.1 && b.grounded) {
        g.lineStyle(3, C.violet, 0.8); g.strokeCircle(b.x, b.render.y - 43, 20 + b.charge * 12);
        g.lineStyle(2, C.paper, 0.35 + b.charge * 0.4); g.strokeCircle(b.x, b.render.y - 43, 12 + b.charge * 20);
      }
      if (b.anim === 'land' && b.landRecover > 0.2) {
        g.lineStyle(3, C.amber, (b.landRecover - 0.2) * 5);
        g.strokeEllipse(b.x, b.y + 34, 150, 26);
      }
    },

    renderFx: function (g, x0, x1) {
      g.clear();
      for (var i = 0; i < this.fx.length; i++) {
        var f = this.fx[i];
        if (!f.active || f.x < x0 - 40 || f.x > x1 + 40) continue;
        var a = clamp(f.life / f.max, 0, 1);
        f.render.x = f.x; f.render.y = f.y; f.render.alpha = a; f.render.size = f.size * (1 + (1 - a) * 0.8);
        if (f.type === 'ring') {
          g.lineStyle(3, f.color, a); g.strokeCircle(f.x, f.y, f.size * (2.5 - a));
        } else if (f.type === 'flare') {
          g.fillStyle(f.color, a);
          g.fillTriangle(f.x, f.y - f.render.size * 2, f.x + f.render.size, f.y + f.render.size, f.x - f.render.size, f.y + f.render.size);
        } else if (f.type === 'smoke') {
          g.fillStyle(f.color, a * 0.34); g.fillCircle(f.x, f.y, f.render.size * 1.5);
        } else if (f.type === 'shard') {
          var c = Math.cos(f.rot) * f.render.size, s = Math.sin(f.rot) * f.render.size;
          g.fillStyle(f.color, a);
          g.fillTriangle(f.x + c, f.y + s, f.x - s, f.y + c, f.x - c * 0.6, f.y - s * 0.6);
        } else if (f.type === 'dirt') {
          g.fillStyle(f.color, a * 0.85);
          g.fillCircle(f.x, f.y, f.render.size * 0.8);
        } else {
          g.fillStyle(f.color, a);
          g.fillRect(f.x - f.render.size * 0.5, f.y - f.render.size * 0.5, f.render.size, f.render.size);
        }
      }
    },

    /* ------------------------------------------------------------- HUD */
    renderHud: function () {
      var u = this.ui, g = this.layers.hud, w = this.W, h = this.H;
      g.clear();
      var play = this.mode === 'play' && this.run;
      var i;
      for (i = 0; i < u.all.length; i++) u.all[i].setVisible(false);
      if (play) {
        var r = this.run, b = this.truck, mult = this.trickMult();
        u.event.setVisible(true); u.score.setVisible(true); u.time.setVisible(true); u.combo.setVisible(true);
        u.controlLeft.setVisible(true); u.controlRight.setVisible(true); u.controlCharge.setVisible(true); u.controlBoost.setVisible(true);
        setTextIfChanged(u.event, r.event.name);
        setTextIfChanged(u.score, '✦ ' + ('000000' + Math.floor(r.score)).slice(-6));
        setTextIfChanged(u.time, '◷ ' + Math.max(0, r.time).toFixed(1));
        setTextIfChanged(u.combo, '×' + mult);
        u.combo.setScale(TXS * (1 + (r.comboT > COMBO_WINDOW * 0.9 && this.motion ? 0.18 : 0)));
        var o = r.arena.objective;
        var goal = r.event.id === 'crush-rally' ? '▣ ' + r.crushed + '/' + r.crushTarget
          : (r.event.id === 'ramp-gauntlet' ? '◇ ' + r.gates + '/6' : this.objectiveChip(o, r));
        setTextIfChanged(u.objective, goal); u.objective.setVisible(!!goal);
        if (r.trickT > 0 && r.lastTrick) {
          setTextIfChanged(u.trick, r.lastTrick);
          u.trick.setVisible(true).setAlpha(clamp(r.trickT, 0, 1));
        }
        var boostW = Math.min(174, Math.max(100, w * 0.28));
        var comboW = Math.min(360, Math.max(80, w - boostW - 46));
        g.fillStyle(0x06080d, 0.74); g.fillRoundedRect(14, h - 96, comboW, 10, 5);
        g.fillStyle(C.amber, 0.9); g.fillRoundedRect(14, h - 96, comboW * clamp(r.comboT / COMBO_WINDOW, 0, 1), 10, 5);
        for (var dv = 1; dv < r.chainDistinct && dv < 8; dv++) {
          g.fillStyle(C.paper, 0.7); g.fillRect(14 + comboW * (dv / 8), h - 98, 2, 14);
        }
        g.fillStyle(0x06080d, 0.74); g.fillRoundedRect(w - boostW - 16, h - 96, boostW, 10, 5);
        g.fillStyle(C.cyan, 0.92); g.fillRoundedRect(w - boostW - 16, h - 96, boostW * clamp(b.boost / b.spec.boostMax, 0, 1), 10, 5);
        var buttonY = h - 64, buttonW = 58, buttonH = 44;
        g.fillStyle(0xf7f2e8, 0.12);
        g.fillRoundedRect(20, buttonY, buttonW, buttonH, 12); g.fillRoundedRect(102, buttonY, buttonW, buttonH, 12);
        g.fillRoundedRect(w - 246, buttonY, buttonW, buttonH, 12); g.fillRoundedRect(w - 78, buttonY, buttonW, buttonH, 12);
        g.lineStyle(2, C.fog, 0.36);
        g.strokeRoundedRect(20, buttonY, buttonW, buttonH, 12); g.strokeRoundedRect(102, buttonY, buttonW, buttonH, 12);
        g.strokeRoundedRect(w - 246, buttonY, buttonW, buttonH, 12); g.strokeRoundedRect(w - 78, buttonY, buttonW, buttonH, 12);
        if (r.countdown > 0) {
          g.fillStyle(0x06080d, 0.5); g.fillRect(0, h * 0.4, w, 52);
          setTextIfChanged(u.resultTitle, r.arena.name);
          u.resultTitle.setVisible(true).setPosition(w * 0.5, h * 0.44).setColor(hex(r.arena.hot));
        } else {
          u.resultTitle.setPosition(w * 0.5, h * 0.22).setColor('#ffca68');
        }
      } else if (this.mode === 'select') {
        this.renderMenu(g, u, w, h);
      } else if (this.mode === 'title') {
        u.menuTitle.setVisible(true); u.menuSub.setVisible(true); u.menuHint.setVisible(true);
        u.menuTitle.setScale(TXS);
        u.menuTitle.setPosition(w * 0.5, h * 0.38); u.menuSub.setPosition(w * 0.5, h * 0.38 + 42);
        g.fillStyle(C.amber, 0.9); g.fillRect(w * 0.5 - 90, h * 0.38 + 62, 180, 3);
        setTextIfChanged(u.menuSub, 'MONSTER-TRUCK ARENA / TRICKS / CRUSH / GLORY');
        setTextIfChanged(u.menuHint, 'PRESS ENTER OR TAP TO ENTER THE CIRCUIT');
      } else if (this.mode === 'result') {
        this.renderResult(g, u, w, h);
      }
    },

    objectiveChip: function (o, r) {
      if (r.objDone) return '★ ' + o.label;
      if (o.id === 'flips') return '⟳ ' + r.flips + '/' + o.target;
      if (o.id === 'crush') return '▣ ' + r.crushed + '/' + o.target;
      if (o.id === 'air') return '↑ ' + r.airBank.toFixed(1) + '/' + o.target;
      if (o.id === 'grind') return '≡ ' + r.grindBank.toFixed(1) + '/' + o.target;
      if (o.id === 'gap') return '⤒ ' + r.gapsCleared + '/' + o.target;
      if (o.id === 'chain') return '⛓ ' + r.bestChain + '/' + o.target;
      if (o.id === 'variety') return '✧ ' + r.bestDistinct + '/' + o.target;
      return '';
    },

    renderMenu: function (g, u, w, h) {
      var i, tm = totalMedals();
      u.menuTitle.setVisible(true); u.menuSub.setVisible(true); u.menuHint.setVisible(true);
      u.menuTitle.setPosition(w * 0.5, this.menuTitleY).setScale(TXS * 0.56);
      u.menuSub.setPosition(w * 0.5, this.menuSubY);
      u.menuHint.setPosition(w * 0.5, h - 12);
      setTextIfChanged(u.menuSub, tm + ' MEDALS   ·   ' + truckOf().name + '   ·   ' + profile.runs + ' RUNS');
      for (i = 0; i < this.menuHit.tabs.length; i++) {
        var t = this.menuHit.tabs[i];
        var on = i === this.tab;
        g.fillStyle(on ? C.amber : 0xf7f2e8, on ? 0.92 : 0.08);
        g.fillRoundedRect(t.x, t.y + 8, t.w, t.h - 16, 8);
        if (!on) { g.lineStyle(1, C.fog, 0.35); g.strokeRoundedRect(t.x, t.y + 8, t.w, t.h - 16, 8); }
        u.tabs[i].setVisible(true).setColor(on ? '#2a1c05' : '#c3cad6');
        u.tabs[i].setStroke(on ? '#ffca68' : '#0b0e15', (on ? 3 : 4) * DPR);
      }
      var scroll = this.rowScroll(), len = this.rowCount(), sel = this.sel();
      for (i = 0; i < this.menuVisible; i++) {
        var idx = scroll + i;
        if (idx >= len) break;
        var box = this.menuHit.rows[i];
        var on2 = idx === sel;
        var label = '', sub = '', locked = false, accent = C.paper;
        if (this.tab === 0) {
          var cs = CAREER[idx], ar = ARENAS[cs.arena], evd = EVENT_BY_ID[cs.event];
          locked = !careerUnlocked(idx);
          var got = profile.career[cs.id] || 0;
          label = (idx + 1) + '. ' + cs.name;
          if (got) accent = C.amber;
          sub = locked ? ('LOCKED / ' + cs.gate + ' MEDALS') : (ar.name + '  ·  ' + evd.name);
          accent = ar.hot;
        } else if (this.tab === 1) {
          var a2 = ARENAS[idx];
          locked = !arenaUnlocked(idx);
          label = a2.name + (profile.objectives[a2.id] ? '  ★' : '');
          sub = locked ? ('LOCKED / ' + ARENA_GATE[idx] + ' MEDALS') : (a2.location + '  ·  ' + a2.objective.label);
          accent = a2.accent;
        } else {
          var tk = TRUCKS[idx];
          locked = profile.trucks.indexOf(tk.id) < 0;
          label = tk.name + (profile.truck === tk.id ? '  ✓' : '');
          sub = locked ? ('LOCKED / ' + tk.gate + ' MEDALS') : tk.blurb;
          accent = tk.trim;
        }
        // the garage keeps its right side clear for the chassis preview
        var plateW = this.tab === 2 ? Math.min(box.w, w * 0.56) : box.w;
        g.fillStyle(0x080b12, on2 ? 0.72 : 0.6); g.fillRoundedRect(box.x, box.y, plateW, box.h, 10);
        g.fillGradientStyle(accent, accent, 0x080b12, 0x080b12, on2 ? 0.26 : 0.08, on2 ? 0.1 : 0.03, 0, 0);
        g.fillRoundedRect(box.x, box.y, plateW, box.h, 10);
        if (on2) { g.lineStyle(2, accent, 0.85); g.strokeRoundedRect(box.x, box.y, plateW, box.h, 10); }
        g.fillStyle(accent, locked ? 0.25 : 0.95); g.fillRect(box.x + 6, box.y + 7, 5, box.h - 14);
        if (!locked && this.tab === 0) {
          var med = profile.career[CAREER[idx].id] || 0;
          for (var mi = 0; mi < 3; mi++) {
            g.fillStyle(mi < med ? C.amber : C.fog, mi < med ? 0.95 : 0.2);
            g.fillCircle(box.x + plateW - 22 - mi * 15, box.y + box.h * 0.5, 4.5);
          }
        }
        setTextIfChanged(u.rows[i], label);
        u.rows[i].setVisible(true).setColor(locked ? '#5b6474' : (on2 ? hex(accent) : '#f7f2e8'));
        setTextIfChanged(u.rowSubs[i], sub);
        u.rowSubs[i].setVisible(true).setColor(locked ? '#4a5262' : '#a9b1bf');
      }
      setTextIfChanged(u.menuHint, 'A / D TAB   W / S PICK   ENTER GO   ESC SETTINGS');
    },

    renderResult: function (g, u, w, h) {
      var rr = this.run, mm = this.medal();
      var mc = mm ? [C.fog, 0xc98a52, 0xc9cdd6, C.amber][mm] : C.fog;
      g.fillGradientStyle(0x0b0f18, 0x0b0f18, 0x05070c, 0x05070c, 0.8, 0.8, 0.92, 0.92);
      g.fillRect(0, h * 0.08, w, h * 0.84);
      // medallion: rays, disc, ring, star. The celebration beat gets art.
      var mx = w * 0.5, my = h * 0.165, mr = Math.min(27, h * 0.072);
      if (this.motion) {
        for (var ry = 0; ry < 10; ry++) {
          var ra = this.clock * 0.5 + ry / 10 * TAU;
          g.fillStyle(mc, 0.09);
          g.fillTriangle(mx, my, mx + Math.cos(ra) * mr * 4, my + Math.sin(ra) * mr * 4,
            mx + Math.cos(ra + 0.16) * mr * 4, my + Math.sin(ra + 0.16) * mr * 4);
        }
      }
      g.fillStyle(mc, 0.22); g.fillCircle(mx, my, mr * 1.5);
      g.fillGradientStyle(mc, mc, 0x1a1d26, 0x1a1d26, 1, 1, 1, 1); g.fillCircle(mx, my, mr);
      g.lineStyle(3, C.paper, 0.5); g.strokeCircle(mx, my, mr * 0.72);
      g.beginPath();
      for (var st = 0; st < 10; st++) {
        var sa = -Math.PI / 2 + st / 10 * TAU;
        var sr = mr * (st % 2 ? 0.24 : 0.56);
        var sxp = mx + Math.cos(sa) * sr, syp = my + Math.sin(sa) * sr;
        if (st === 0) g.moveTo(sxp, syp); else g.lineTo(sxp, syp);
      }
      g.closePath(); g.fillStyle(C.paper, 0.92); g.fillPath();
      g.fillStyle(mc, 0.9); g.fillRect(w * 0.5 - 110, h * 0.34, 220, 3);
      u.resultTitle.setVisible(true).setPosition(w * 0.5, h * 0.29).setColor(hex(mc));
      u.resultBody.setVisible(true).setPosition(w * 0.5, h * 0.62).setAlign('center');
      u.resultHint.setVisible(true);
      setTextIfChanged(u.resultTitle, mm ? ['RUN COMPLETE', 'BRONZE MEDAL', 'SILVER MEDAL', 'GOLD MEDAL'][mm] : 'RUN COMPLETE');
      var lines = rr.arena.name + '  ·  ' + rr.event.name + '  ·  ' + rr.spec.name + '\n'
        + 'SCORE  ' + Math.floor(rr.score) + '     BEST CHAIN  x' + rr.maxCombo + '\n'
        + 'CRUSHED  ' + rr.crushed + '     CLEAN  ' + rr.cleanLandings + '     GRIND  ' + rr.grindBank.toFixed(1) + 's\n'
        + (rr.objDone ? '★ ' + rr.arena.objective.label : '· ' + rr.arena.objective.label + ' missed')
        + (rr.secret ? '\n★ SECRET LINE FOUND' : '');
      if (this.newTruckUnlocked) lines += '\n\nNEW TRUCK: ' + this.newTruckUnlocked.name;
      setTextIfChanged(u.resultBody, lines);
      setTextIfChanged(u.resultHint, 'ENTER / TAP: CIRCUIT MENU    R: RETRY');
    },

    renderToast: function () {
      var g = this.layers.toast, u = this.ui, w = this.W, h = this.H;
      g.clear(); u.toast.setVisible(false);
      if (!this.toast.active || (this.mode !== 'play' && this.mode !== 'select')) return;
      var bw = Math.min(280, w - 24), bh = 30, x = w - 12 - bw, y = this.mode === 'play' ? 74 : h - 60;
      var alpha = this.motion ? (this.toast.life < 0.18 ? clamp(this.toast.life / 0.18, 0, 1) : 1) : 1;
      g.fillStyle(0x080a10, 0.84 * alpha); g.fillRoundedRect(x, y - bh * 0.5, bw, bh, 8);
      g.fillStyle(this.toast.color, 0.9 * alpha); g.fillRect(x, y - bh * 0.5, 4, bh);
      u.toast.setVisible(true).setPosition(w - 22, y).setAlpha(alpha);
    },

    renderTransition: function () {
      var g = this.layers.trans; g.clear();
      var tr = this.trans;
      if (!tr.active) return;
      var t = clamp(tr.t / tr.dur, 0, 1);
      var w = this.W, h = this.H, bars = 7, bh = h / bars;
      for (var i = 0; i < bars; i++) {
        var phase = clamp(t * 2 - (i % 2 ? 0.12 : 0), 0, 2);
        var cover = phase <= 1 ? phase : (2 - phase);
        var bw = w * clamp(cover, 0, 1);
        g.fillStyle(i % 2 ? 0x0b0e15 : 0x121a27, 1);
        if (i % 2) g.fillRect(0, i * bh, bw, bh + 1);
        else g.fillRect(w - bw, i * bh, bw, bh + 1);
      }
    },

    syncDebug: function () {
      var s = ST.state;
      s.mode = this.mode;
      s.score = this.run ? Math.floor(this.run.score) : 0;
      s.combo = this.run ? this.run.combo : 0;
      s.airborne = !!(this.truck && !this.truck.grounded);
      s.event = this.run ? this.run.event.id : this.selectedEvent;
      s.arena = this.run ? this.run.arena.id : ARENAS[this.selectedArena].id;
      s.forceEvent = ST.forceEvent || null;
      s.forceArena = ST.forceArena;
      s.time = this.run ? this.run.time : 0;
      s.boost = this.truck ? this.truck.boost : 0;
      s.crushed = this.run ? this.run.crushed : 0;
      s.gates = this.run ? this.run.gates : 0;
      s.grinding = !!(this.truck && this.truck.grinding);
      s.grindBank = this.run ? +this.run.grindBank.toFixed(2) : 0;
      s.airBank = this.run ? +this.run.airBank.toFixed(2) : 0;
      s.flips = this.run ? this.run.flips : 0;
      s.chainDistinct = this.run ? this.run.chainDistinct : 0;
      s.mult = this.run ? this.trickMult() : 1;
      s.objective = this.run ? this.run.arena.objective.id : null;
      s.objDone = this.run ? !!this.run.objDone : false;
      s.truck = profile.truck;
      s.medals = totalMedals();
      s.tab = this.tab;
      s.slowmo = this.slow > 0;
      s.arenaCount = ARENAS.length;
      s.careerCount = CAREER.length;
      s.saveVersion = profile.version;
      s.dpr = DPR;
      s.view = { w: this.W, h: this.H, camX: this.cameras.main.scrollX, camY: this.cameras.main.scrollY,
        zoom: this.cameras.main.zoom, tx: this.truck ? Math.round(this.truck.x) : 0, ty: this.truck ? Math.round(this.truck.y) : 0 };
    }
  };

  kit.loader.show('STOMP CIRCUIT'); kit.loader.progress(0.2);
  /* Scale.NONE with a DEVICE-pixel game size and zoom 1/DPR: the canvas
   * backing store is cssW*DPR wide while the element still occupies cssW
   * CSS pixels. The removed-in-3.17 `resolution` key is deliberately not
   * used; it is a no-op and leaves the canvas at 1x. */
  Game.phaser = new Phaser.Game({
    type: Phaser.AUTO, parent: document.body, backgroundColor: '#0b0e15',
    scale: {
      mode: Phaser.Scale.NONE,
      width: Math.round(window.innerWidth * DPR),
      height: Math.round(window.innerHeight * DPR),
      zoom: TXS,
      autoRound: true
    },
    render: { antialias: true, antialiasGL: false, roundPixels: false, powerPreference: 'high-performance' },
    fps: { target: 60, min: 30 }, scene: [toScene(CircuitScene)]
  });
}());
