/* Silkwind, fleet F16 AAA rebuild.
 * Side-view wuxia duelling: a three stance counter triangle, frame-honest
 * attacks with visible tells, parry and guard-break reads, qi spent on
 * wire-work and finishers. Phaser 3 draws authored procedural sheets and
 * baked stage layers; GGKit owns lifecycle, pointer identity, save
 * validation, audio buses, loading, settings and the juice budget.
 * The simulation advances only in fixed 1/60 steps, so a slow device runs
 * in slow motion rather than skipping frames of a duel.
 */
(function () {
  'use strict';

  var Phaser = window.Phaser;
  var GGKit = window.GGKit;

  var VW = 1280, VH = 720;
  var RETINA_FACTOR = GGKit.hiDpi.factor(VW, VH);
  var STEP_MS = 1000 / 60;
  var MAX_STEPS = 4;
  var GROUND_Y = 512;
  var FW = 150, FH = 176;          /* fighter frame */
  var POSE_COUNT = 14;
  var FIGHTER_SCALE = 2.0;
  var SAVE_VERSION = 3;
  var FONT = '"Avenir Next", "Segoe UI", Roboto, system-ui, sans-serif';
  var SERIF = 'Georgia, "Times New Roman", serif';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hex(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
  function rgba(n, a) {
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function seeded(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function setTextIfChanged(o, v) {
    var s = String(v);
    if (o && o.text !== s) o.setText(s);
  }
  function setColorIfChanged(o, c) {
    if (o && o.__swColor !== c) { o.setColor(c); o.__swColor = c; }
  }
  function setAlphaIfChanged(o, a) {
    if (!o) return;
    if (Math.abs((o.__swAlpha == null ? -1 : o.__swAlpha) - a) > 0.004) { o.setAlpha(a); o.__swAlpha = a; }
    /* a fully transparent quad still costs a blended draw, so cull it */
    var want = a > 0.004;
    if (o.visible !== want && o.__swCull !== false) o.setVisible(want);
  }
  function setVisibleIfChanged(o, v) {
    if (!o) return;
    if (!v) o.__swCull = false; else o.__swCull = true;
    if (o.visible !== v) o.setVisible(v);
  }

  /* ------------------------------------------------------------- stances */
  /* crane beats tiger, tiger beats serpent, serpent beats crane. */
  var STANCES = [
    { id: 'crane', name: 'CRANE', weapon: 'sword', color: 0x7fd4ff, css: '#7fd4ff', beats: 'TIGER' },
    { id: 'tiger', name: 'TIGER', weapon: 'palm', color: 0xff8a6a, css: '#ff8a6a', beats: 'SERPENT' },
    { id: 'serpent', name: 'SERPENT', weapon: 'spear', color: 0x9fe08a, css: '#9fe08a', beats: 'CRANE' }
  ];
  function beatsStance(a, b) { return (a + 1) % 3 === b; }
  function stanceFactor(a, b) { return beatsStance(a, b) ? 1.5 : (beatsStance(b, a) ? 0.65 : 1); }

  /* ---------------------------------------------------------- duellists */
  /* Sequence tokens: H high strike, L low strike, T thrust, G grab,
     P parry stance, B burst art, R retreat, S stance shift. */
  var DUELLISTS = [
    {
      id: 'reed', name: 'REED WARDEN', title: 'Keeper of the First Gate', hp: 78,
      tell: 980, gap: 760, loose: 0.00, stanceMode: 'fix', stance: 1, guardMode: 'alt',
      hue: 0x8fb7a6, robe: 0x2f5347, robeDark: 0x1c3730, trim: 0x8fb7a6, sash: 0xc9d9a8, hair: 0x1b2422,
      weight: [0.15, 0.70, 0.15], finisher: 'GATE CLOSES',
      seq: ['H', 'L', 'H', 'L', 'G'],
      tip: 'A plain high and low rhythm. Learn the parry beat.'
    },
    {
      id: 'bell', name: 'IRON BELL', title: 'Warden of the Still Court', hp: 96,
      tell: 900, gap: 700, loose: 0.05, stanceMode: 'fix', stance: 2, guardMode: 'fix',
      hue: 0xb9a06a, robe: 0x4a3c22, robeDark: 0x2b2413, trim: 0xb9a06a, sash: 0xe0c98a, hair: 0x231b12,
      weight: [0.15, 0.15, 0.70], finisher: 'THE BELL TOLLS',
      seq: ['H', 'H', 'G', 'L', 'G', 'H'],
      tip: 'Guards high forever and grabs turtles. Strike low.'
    },
    {
      id: 'willow', name: 'TWIN WILLOW', title: 'Two Blades, One Breath', hp: 90,
      tell: 700, gap: 470, loose: 0.10, stanceMode: 'cycle', stance: 0, guardMode: 'alt',
      hue: 0x9ad1e0, robe: 0x264a5c, robeDark: 0x152d3a, trim: 0x9ad1e0, sash: 0xd8f0f6, hair: 0x14212b,
      weight: [0.5, 0.25, 0.25], finisher: 'WILLOW SPLITS',
      seq: ['H', 'H', 'L', 'T', 'L', 'L', 'S'],
      tip: 'Doubles every strike. Never parry only once.'
    },
    {
      id: 'sparrow', name: 'ASH SPARROW', title: 'Rider of the Long Step', hp: 88,
      tell: 690, gap: 500, loose: 0.12, stanceMode: 'cycle', stance: 2, guardMode: 'rand',
      hue: 0xcf9fd6, robe: 0x44305c, robeDark: 0x281a38, trim: 0xcf9fd6, sash: 0xf0d6f6, hair: 0x1d1526,
      weight: [0.25, 0.25, 0.5], finisher: 'LONG STEP HOME',
      seq: ['R', 'H', 'R', 'L', 'S', 'T', 'R', 'G'],
      tip: 'Flees the measure. Spend breath to dash back in.'
    },
    {
      id: 'lantern', name: 'QUIET LANTERN', title: 'She Who Waits', hp: 90,
      tell: 780, gap: 540, loose: 0.14, stanceMode: 'counter', stance: 1, guardMode: 'alt',
      hue: 0xe0d29a, robe: 0x5a4b2a, robeDark: 0x332914, trim: 0xe0d29a, sash: 0xfff0bd, hair: 0x271f11,
      weight: [0.3, 0.45, 0.25], finisher: 'THE LAMP GUTTERS',
      seq: ['P', 'H', 'P', 'G', 'L', 'P', 'T'],
      tip: 'Eats greedy strikes. Bait the parry, then grab.'
    },
    {
      id: 'coil', name: 'NINE COIL', title: 'Master of the Turning Form', hp: 94,
      tell: 640, gap: 500, loose: 0.16, stanceMode: 'counter', stance: 2, guardMode: 'alt',
      hue: 0x7fe0b0, robe: 0x1f5347, robeDark: 0x113029, trim: 0x7fe0b0, sash: 0xbdf7dd, hair: 0x0f2620,
      weight: [0.33, 0.33, 0.34], finisher: 'NINTH COIL',
      seq: ['H', 'S', 'L', 'S', 'T', 'G', 'S', 'H'],
      tip: 'Shifts to counter your stance. Swap late.'
    },
    {
      id: 'heron', name: 'STORM HERON', title: 'Bearer of the Ninth Art', hp: 100,
      tell: 620, gap: 460, loose: 0.18, stanceMode: 'cycle', stance: 1, guardMode: 'rand',
      hue: 0x7f9dff, robe: 0x2b3670, robeDark: 0x171e43, trim: 0x7f9dff, sash: 0xc9d4ff, hair: 0x11162e,
      weight: [0.3, 0.4, 0.3], finisher: 'STORM DESCENDS',
      seq: ['H', 'B', 'L', 'R', 'T', 'B', 'G', 'H'],
      tip: 'Burst arts cannot be parried. Evade them.'
    },
    {
      id: 'silkwind', name: 'THE SILKWIND', title: 'Nameless Grandmaster', hp: 116,
      tell: 545, gap: 400, loose: 0.22, stanceMode: 'counter', stance: 0, guardMode: 'alt',
      hue: 0xff9fb0, robe: 0x6d2338, robeDark: 0x3d1220, trim: 0xff9fb0, sash: 0xffd9e2, hair: 0x24101a,
      weight: [0.34, 0.33, 0.33], finisher: 'SILK CUTS STONE',
      seq: ['H', 'L', 'P', 'G', 'T', 'B', 'R', 'H', 'S', 'L', 'G', 'B'],
      tip: 'Every form at once. Read, do not guess.'
    }
  ];
  var DUELLIST_BY_ID = {};
  for (var di = 0; di < DUELLISTS.length; di++) DUELLIST_BY_ID[DUELLISTS[di].id] = di;

  /* -------------------------------------------------------------- stages */
  var STAGES = [
    {
      id: 'bamboo-grove', name: 'BAMBOO GROVE', weather: 'leaves', music: 'music-grove',
      signature: 0x7fe0b0, sky: ['#0b2430', '#0a1622', '#070c14'],
      far: 0x123340, mid: 0x0e2a30, ground: 0x14201f, rim: 0x7fe0b0,
      haze: 0x1b4a4a, moon: 0xdff3e6, lightIntensity: 0.55,
      line: 'Green stems, thin light, a floor of old leaves.'
    },
    {
      id: 'rain-temple', name: 'RAIN TEMPLE ROOF', weather: 'rain', music: 'music-temple',
      signature: 0x9fb6ff, sky: ['#161a3c', '#111230', '#08091a'],
      far: 0x1d2350, mid: 0x191a3a, ground: 0x241a2c, rim: 0x9fb6ff,
      haze: 0x2b3170, moon: 0xc9d4ff, lightIntensity: 0.45,
      line: 'Wet tile, low thunder, lanterns fighting the rain.'
    },
    {
      id: 'frozen-lake', name: 'FROZEN LAKE', weather: 'snow', music: 'music-lake',
      signature: 0xcfe9ff, sky: ['#2a3a54', '#4a5570', '#8f9db4'],
      far: 0x5b6b88, mid: 0x38455e, ground: 0x9fc4de, rim: 0xffffff,
      haze: 0x7d92ad, moon: 0xfff0d6, lightIntensity: 0.75,
      line: 'Grey dawn on black ice. Every step is a warning.'
    },
    {
      id: 'silkwind-peak', name: 'SILKWIND PEAK', weather: 'silk', music: 'music-peak',
      signature: 0xff9fb0, sky: ['#3a1c34', '#6b2b3c', '#c96b4e'],
      far: 0x53243c, mid: 0x35182a, ground: 0x2a1520, rim: 0xffc9a0,
      haze: 0x8a3a4a, moon: 0xffe0b0, lightIntensity: 0.85,
      line: 'Above the cloud sea, where the ribbons never settle.'
    }
  ];
  var STAGE_BY_ID = {};
  for (var si = 0; si < STAGES.length; si++) STAGE_BY_ID[STAGES[si].id] = si;

  /* --------------------------------------------------------- the ascent */
  /* 18 rungs. mods scale the tell, the gap between forms, the improvisation
     rate and the health pool, so the same eight duellists escalate. */
  function rung(d, s, label, tell, gap, loose, hp) {
    return { duel: d, stage: s, label: label, tell: tell || 1, gap: gap || 1, loose: loose || 0, hp: hp || 1 };
  }
  var LADDER = [
    rung('reed', 0, 'First Gate'),
    rung('bell', 0, 'Still Court'),
    rung('willow', 0, 'Two Blades'),
    rung('reed', 0, 'Gate Reforged', 0.88, 0.92, 0.04, 1.08),
    rung('sparrow', 1, 'Long Step'),
    rung('lantern', 1, 'She Who Waits'),
    rung('bell', 1, 'Tempered Bell', 0.90, 0.94, 0.03, 1.12),
    rung('coil', 1, 'Turning Form'),
    rung('willow', 1, 'Willow Relentless', 0.92, 0.85, 0.05, 1.10),
    rung('heron', 2, 'Ninth Art'),
    rung('sparrow', 2, 'Windborne', 0.85, 0.88, 0.06, 1.12),
    rung('lantern', 2, 'Patient Lamp', 0.92, 0.90, 0.07, 1.14),
    rung('coil', 2, 'Coil Unwound', 0.85, 0.85, 0.08, 1.14),
    rung('heron', 2, 'Storm Gathers', 0.88, 0.86, 0.06, 1.16),
    rung('willow', 3, 'Willow at the Peak', 0.82, 0.82, 0.08, 1.18),
    rung('coil', 3, 'Coil at the Peak', 0.82, 0.82, 0.09, 1.20),
    rung('heron', 3, 'Storm at the Peak', 0.80, 0.80, 0.09, 1.22),
    rung('silkwind', 3, 'The Silkwind', 1.00, 1.00, 0.00, 1.00)
  ];

  /* ----------------------------------------------------- trial of forms */
  /* Graded drills. A drill runs the duel sim against a scripted partner and
     grades on a single tracked metric inside the time limit. */
  var TRIALS = [
    { id: 'breath', name: 'FIRST BREATH', metric: 'clean', time: 50, tiers: [4, 7, 10],
      goal: 'Land clean strikes on the training partner.',
      partner: { duel: 'reed', tell: 1.25, gap: 1.35, loose: 0, hp: 4 } },
    { id: 'parry', name: 'PARRY FORM', metric: 'parry', time: 55, tiers: [4, 7, 10],
      goal: 'Turn their strikes aside with clean parries.',
      partner: { duel: 'willow', tell: 1.15, gap: 1.05, loose: 0, hp: 6 } },
    { id: 'reading', name: 'GUARD READING', metric: 'break', time: 55, tiers: [4, 6, 9],
      goal: 'Strike where the guard is not. Break it open.',
      partner: { duel: 'bell', tell: 1.10, gap: 1.10, loose: 0, hp: 6 } },
    { id: 'evasion', name: 'EVASION', metric: 'evade', time: 55, tiers: [4, 6, 9],
      goal: 'Slip every grab and every burst art.',
      partner: { duel: 'lantern', tell: 1.05, gap: 0.95, loose: 0.05, hp: 6 } },
    { id: 'measure', name: 'THE MEASURE', metric: 'dashhit', time: 55, tiers: [3, 5, 8],
      goal: 'Close the measure with a dash, then punish.',
      partner: { duel: 'sparrow', tell: 1.05, gap: 1.00, loose: 0.05, hp: 6 } },
    { id: 'triangle', name: 'STANCE TRIANGLE', metric: 'stancehit', time: 55, tiers: [4, 7, 10],
      goal: 'Land hits from the stance that beats theirs.',
      partner: { duel: 'coil', tell: 1.05, gap: 1.00, loose: 0.05, hp: 6 } },
    { id: 'qi', name: 'QI DISCIPLINE', metric: 'burst', time: 60, tiers: [2, 3, 5],
      goal: 'Feed the breath and land burst arts.',
      partner: { duel: 'heron', tell: 1.00, gap: 1.05, loose: 0.05, hp: 8 } },
    { id: 'ironwill', name: 'IRON WILL', metric: 'survive', time: 60, tiers: [30, 45, 60],
      goal: 'Stay standing. They never stop.',
      partner: { duel: 'silkwind', tell: 0.95, gap: 0.80, loose: 0.14, hp: 12 } }
  ];
  var TRIAL_BY_ID = {};
  for (var ti = 0; ti < TRIALS.length; ti++) TRIAL_BY_ID[TRIALS[ti].id] = ti;

  /* ------------------------------------------------------ technique track */
  var TECHNIQUES = [
    { id: 'deepbreath', name: 'DEEP BREATH', cost: 4, note: 'Breath ceiling rises to 120.' },
    { id: 'swifthands', name: 'SWIFT HANDS', cost: 5, note: 'Strike recovery cut by 15 percent.' },
    { id: 'ironpalm', name: 'IRON PALM', cost: 6, note: 'All of your damage rises 12 percent.' },
    { id: 'longstep', name: 'LONG STEP', cost: 7, note: 'A dash costs 12 breath instead of 20.' },
    { id: 'windbody', name: 'WIND BODY', cost: 8, note: 'The evade window grows by 70 ms.' },
    { id: 'silkguard', name: 'SILK GUARD', cost: 9, note: 'The parry window grows by 50 ms.' },
    { id: 'ninthart', name: 'NINTH ART', cost: 10, note: 'A burst art costs 40 breath instead of 50.' },
    { id: 'secondwind', name: 'SECOND WIND', cost: 12, note: 'Enter a third exchange with 14 health restored.' }
  ];
  var TECH_BY_ID = {};
  for (var xi = 0; xi < TECHNIQUES.length; xi++) TECH_BY_ID[TECHNIQUES[xi].id] = xi;

  /* ---------------------------------------------------------------- save */
  var DASH_COST = 20, BURST_COST = 50, BREATH_MAX = 100;
  var ROUND_SECONDS = 60;

  function freshSave() {
    var t = {};
    for (var i = 0; i < TECHNIQUES.length; i++) t[TECHNIQUES[i].id] = 0;
    return {
      v: SAVE_VERSION, rungs: 0, wins: 0, losses: 0, insight: 0, spent: 0,
      tech: t, trials: [0, 0, 0, 0, 0, 0, 0, 0], survivalBest: 0, survivalKills: 0,
      tutorial: 0, seen: 0
    };
  }
  function intIn(v, lo, hi) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi;
  }
  function validSave(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if (o.v !== SAVE_VERSION) return false;
    if (!intIn(o.rungs, 0, LADDER.length)) return false;
    if (!intIn(o.wins, 0, 999999) || !intIn(o.losses, 0, 999999)) return false;
    if (!intIn(o.insight, 0, 999999) || !intIn(o.spent, 0, 999999)) return false;
    if (!intIn(o.survivalBest, 0, 9999) || !intIn(o.survivalKills, 0, 999999)) return false;
    if (!intIn(o.tutorial, 0, 1) || !intIn(o.seen, 0, 1)) return false;
    if (!Array.isArray(o.trials) || o.trials.length !== TRIALS.length) return false;
    for (var i = 0; i < o.trials.length; i++) if (!intIn(o.trials[i], 0, 3)) return false;
    if (!o.tech || typeof o.tech !== 'object') return false;
    /* every persisted technique id must resolve against the registry */
    for (var k in o.tech) if (!Object.prototype.hasOwnProperty.call(TECH_BY_ID, k)) return false;
    for (var j = 0; j < TECHNIQUES.length; j++) if (!intIn(o.tech[TECHNIQUES[j].id], 0, 1)) return false;
    if (o.spent > o.insight) return false;
    return true;
  }
  function normalizeSave(o) {
    var next = freshSave();
    if (!o || typeof o !== 'object') return next;
    next.rungs = clamp(Math.floor(Number(o.rungs) || 0), 0, LADDER.length);
    next.wins = clamp(Math.floor(Number(o.wins) || 0), 0, 999999);
    next.losses = clamp(Math.floor(Number(o.losses) || 0), 0, 999999);
    next.insight = clamp(Math.floor(Number(o.insight) || 0), 0, 999999);
    next.survivalBest = clamp(Math.floor(Number(o.survivalBest) || 0), 0, 9999);
    next.survivalKills = clamp(Math.floor(Number(o.survivalKills) || 0), 0, 999999);
    next.tutorial = Number(o.tutorial) ? 1 : 0;
    next.seen = Number(o.seen) ? 1 : 0;
    if (Array.isArray(o.trials)) {
      for (var i = 0; i < TRIALS.length; i++) next.trials[i] = clamp(Math.floor(Number(o.trials[i]) || 0), 0, 3);
    }
    var spent = 0;
    if (o.tech && typeof o.tech === 'object') {
      for (var j = 0; j < TECHNIQUES.length; j++) {
        var tdef = TECHNIQUES[j];
        if (Number(o.tech[tdef.id]) === 1) { next.tech[tdef.id] = 1; spent += tdef.cost; }
      }
    }
    next.spent = spent;
    if (next.spent > next.insight) next.insight = next.spent;
    return next;
  }

  /* ------------------------------------------------------- kit + bridge */
  var bridge = window.__sw || {};
  if (!bridge.state) bridge.state = {};
  var state = bridge.state;
  state.ready = false;
  state.mode = 'menu';
  state.screen = 'boot';
  if (!Object.prototype.hasOwnProperty.call(bridge, 'forceMode')) bridge.forceMode = null;
  if (!Object.prototype.hasOwnProperty.call(bridge, 'forceStage')) bridge.forceStage = null;
  if (!Object.prototype.hasOwnProperty.call(bridge, 'forceWin')) bridge.forceWin = false;
  window.__sw = bridge;

  var reduceMotion = false;
  try {
    reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { reduceMotion = false; }

  var sceneRef = null;
  var profile = freshSave();

  var kit = GGKit.create({
    slug: 'silkwind',
    orientation: 'landscape',
    validateSave: validSave,
    onPause: function () { if (sceneRef) sceneRef.onKitPause(); },
    onResume: function () { if (sceneRef) sceneRef.onKitResume(); },
    onRestart: function () { if (sceneRef) sceneRef.returnToTitle(); }
  });

  var SFX = ['sfx-whoosh', 'sfx-hit', 'sfx-heavy', 'sfx-clash', 'sfx-parry', 'sfx-block',
    'sfx-break', 'sfx-grab', 'sfx-dash', 'sfx-burst', 'sfx-stance', 'sfx-ui',
    'sfx-ko', 'sfx-win', 'sfx-lose', 'sfx-gong'];
  var MUSIC = ['music-menu', 'music-grove', 'music-temple', 'music-lake', 'music-peak'];
  (function registerAudio() {
    var map = {};
    for (var i = 0; i < SFX.length; i++) map[SFX[i]] = 'assets/audio/' + SFX[i] + '.mp3';
    for (var j = 0; j < MUSIC.length; j++) map[MUSIC[j]] = 'assets/audio/' + MUSIC[j] + '.mp3';
    kit.audio.register(map);
  })();
  kit.registerPWA();
  kit.loader.show('SILKWIND');
  profile = normalizeSave(kit.save.get(null));
  kit.save.set(profile);
  if (reduceMotion) kit.juice.enabled = false;

  function saveNow() { kit.save.set(profile); }
  function techOn(id) { return profile.tech[id] === 1; }
  function insightFree() { return profile.insight - profile.spent; }
  function sfx(name, vol, rate) { kit.audio.sfx(name, { volume: vol == null ? 1 : vol, rate: rate || 1 }); }
  function motionOn() { return kit.juice.enabled !== false; }

  /* Derived player numbers, recomputed whenever the technique track changes. */
  var tuning = {
    breathMax: BREATH_MAX, dashCost: DASH_COST, burstCost: BURST_COST,
    damage: 1, strikeRec: 1, evadeBonus: 0, parryBonus: 0, secondWind: 0
  };
  function retune() {
    tuning.breathMax = techOn('deepbreath') ? 120 : BREATH_MAX;
    tuning.dashCost = techOn('longstep') ? 12 : DASH_COST;
    tuning.burstCost = techOn('ninthart') ? 40 : BURST_COST;
    tuning.damage = techOn('ironpalm') ? 1.12 : 1;
    tuning.strikeRec = techOn('swifthands') ? 0.85 : 1;
    tuning.evadeBonus = techOn('windbody') ? 70 : 0;
    tuning.parryBonus = techOn('silkguard') ? 50 : 0;
    tuning.secondWind = techOn('secondwind') ? 14 : 0;
  }
  retune();

  /* ------------------------------------------------------------ run state */
  var run = {
    mode: 'ladder',        /* ladder | trial | survival | tutorial */
    rung: 0, trial: 0, stageIndex: 0, duelIndex: 0,
    round: 1, roundsWon: 0, roundsLost: 0,
    over: 0, overKind: '', freeze: 0, timeLeft: ROUND_SECONDS,
    range: 0, rangeV: 0, simTime: 0,
    survivalWave: 0, survivalScore: 0, survivalKills: 0,
    metric: 0, drillTime: 0, tutorialStep: 0, tutorialTimer: 0,
    scoreThisDuel: 0, cleanHits: 0, parries: 0, breaks: 0, evades: 0, bursts: 0,
    dashHits: 0, stanceHits: 0, lastAction: '', perfect: true
  };

  function mkFighter(hp, stance) {
    return {
      hp: hp, max: hp, stance: stance, breath: 40, act: null, flash: 0, hurtT: 0,
      guard: 'high', si: 0, wait: 900, bob: 0, poseHold: 0, pose: 0, facing: 1,
      kx: 0, kvx: 0, lean: 0, ribbon: null, downT: 0
    };
  }
  var P = mkFighter(100, 0);
  var E = mkFighter(100, 0);
  var opponent = DUELLISTS[0];
  var opponentMod = { tell: 1, gap: 1, loose: 0, hp: 1, damage: 1 };

  /* Kept inside the thumb clusters at both ends of the measure. */
  function posP() { return VW * (0.355 - 0.060 * run.rangeV) + P.kx; }
  function posE() { return VW * (0.645 + 0.060 * run.rangeV) + E.kx; }

  /* -------------------------------------------------------- pose library */
  /* Joints are given in figure units: x to the right, y upward from the sole
     line. The baker mirrors them into frame pixels. */
  function pose(o) { return o; }
  var POSES = [
    /* 0 idle a */ pose({ hip: [0, 58], neck: [1, 96], head: [3, 110], sh: [1, 92],
      elbF: [12, 78], handF: [21, 66], elbB: [-9, 78], handB: [-16, 68],
      kneeF: [14, 30], footF: [18, 2], kneeB: [-13, 30], footB: [-18, 2],
      wpn: [24, 62, -0.35], flare: 1.0 }),
    /* 1 idle b */ pose({ hip: [0, 60], neck: [1, 98], head: [3, 112], sh: [1, 94],
      elbF: [12, 81], handF: [21, 69], elbB: [-9, 80], handB: [-16, 71],
      kneeF: [14, 31], footF: [18, 2], kneeB: [-13, 31], footB: [-18, 2],
      wpn: [24, 65, -0.30], flare: 1.05 }),
    /* 2 guard high */ pose({ hip: [-2, 58], neck: [-1, 96], head: [1, 110], sh: [-1, 92],
      elbF: [9, 86], handF: [17, 97], elbB: [-10, 80], handB: [-18, 74],
      kneeF: [12, 30], footF: [16, 2], kneeB: [-15, 30], footB: [-20, 2],
      wpn: [23, 101, -1.05], flare: 1.0 }),
    /* 3 guard low */ pose({ hip: [-2, 58], neck: [-1, 96], head: [1, 110], sh: [-1, 92],
      elbF: [11, 72], handF: [19, 53], elbB: [-10, 80], handB: [-18, 74],
      kneeF: [12, 30], footF: [16, 2], kneeB: [-15, 30], footB: [-20, 2],
      wpn: [25, 45, 0.42], flare: 1.0 }),
    /* 4 wind up */ pose({ hip: [-6, 56], neck: [-6, 94], head: [-4, 108], sh: [-6, 90],
      elbF: [-14, 84], handF: [-25, 92], elbB: [-16, 74], handB: [-24, 64],
      kneeF: [16, 30], footF: [22, 2], kneeB: [-18, 28], footB: [-24, 2],
      wpn: [-31, 100, 1.05], flare: 1.25 }),
    /* 5 strike high */ pose({ hip: [6, 56], neck: [8, 94], head: [10, 106], sh: [8, 90],
      elbF: [24, 92], handF: [43, 98], elbB: [-6, 80], handB: [-16, 86],
      kneeF: [26, 28], footF: [34, 2], kneeB: [-16, 26], footB: [-24, 2],
      wpn: [50, 102, -0.14], flare: 1.4 }),
    /* 6 strike low */ pose({ hip: [6, 54], neck: [8, 92], head: [10, 104], sh: [8, 88],
      elbF: [24, 72], handF: [43, 54], elbB: [-6, 78], handB: [-16, 84],
      kneeF: [26, 26], footF: [36, 2], kneeB: [-16, 24], footB: [-26, 2],
      wpn: [50, 45, 0.48], flare: 1.4 }),
    /* 7 thrust */ pose({ hip: [4, 56], neck: [6, 94], head: [8, 106], sh: [6, 90],
      elbF: [22, 86], handF: [45, 84], elbB: [-4, 82], handB: [-14, 80],
      kneeF: [24, 28], footF: [32, 2], kneeB: [-16, 26], footB: [-24, 2],
      wpn: [50, 84, 0.0], flare: 1.2 }),
    /* 8 grab */ pose({ hip: [4, 56], neck: [5, 94], head: [7, 106], sh: [5, 90],
      elbF: [20, 88], handF: [39, 86], elbB: [16, 80], handB: [35, 78],
      kneeF: [22, 28], footF: [30, 2], kneeB: [-14, 26], footB: [-22, 2],
      wpn: [41, 70, -0.70], flare: 1.1 }),
    /* 9 parry */ pose({ hip: [0, 58], neck: [1, 96], head: [3, 110], sh: [1, 92],
      elbF: [14, 84], handF: [23, 88], elbB: [7, 80], handB: [17, 80],
      kneeF: [13, 30], footF: [17, 2], kneeB: [-13, 30], footB: [-17, 2],
      wpn: [27, 91, -1.53], flare: 1.0 }),
    /* 10 hurt */ pose({ hip: [-8, 56], neck: [-12, 92], head: [-16, 104], sh: [-11, 88],
      elbF: [-2, 80], handF: [7, 70], elbB: [-22, 78], handB: [-31, 70],
      kneeF: [6, 28], footF: [10, 2], kneeB: [-22, 28], footB: [-30, 2],
      wpn: [11, 62, -0.88], flare: 1.3 }),
    /* 11 dash */ pose({ hip: [10, 54], neck: [14, 90], head: [18, 102], sh: [13, 86],
      elbF: [26, 80], handF: [39, 72], elbB: [2, 74], handB: [-9, 66],
      kneeF: [24, 26], footF: [34, 7], kneeB: [-9, 22], footB: [-25, 9],
      wpn: [47, 68, -0.44], flare: 1.6 }),
    /* 12 burst */ pose({ hip: [0, 60], neck: [0, 100], head: [2, 114], sh: [0, 96],
      elbF: [18, 102], handF: [31, 117], elbB: [-18, 100], handB: [-31, 113],
      kneeF: [16, 30], footF: [22, 2], kneeB: [-16, 30], footB: [-22, 2],
      wpn: [37, 125, -0.79], flare: 1.7 }),
    /* 13 down */ pose({ hip: [-6, 18], neck: [-22, 22], head: [-35, 25], sh: [-20, 22],
      elbF: [-8, 16], handF: [3, 8], elbB: [-26, 14], handB: [-35, 6],
      kneeF: [10, 14], footF: [23, 4], kneeB: [6, 10], footB: [19, 2],
      wpn: [27, 6, -1.60], flare: 0.6 })
  ];

  /* -------------------------------------------------- fighter sheet baker */
  var ORIGIN_X = FW * 0.36, ORIGIN_Y = FH - 8;
  function jx(p) { return ORIGIN_X + p[0]; }
  function jy(p) { return ORIGIN_Y - p[1]; }

  function limb(ctx, a, b, c, w, color, outline) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (outline) {
      ctx.strokeStyle = outline; ctx.lineWidth = w + 3.4;
      ctx.beginPath(); ctx.moveTo(jx(a), jy(a)); ctx.lineTo(jx(b), jy(b)); ctx.lineTo(jx(c), jy(c)); ctx.stroke();
    }
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(jx(a), jy(a)); ctx.lineTo(jx(b), jy(b)); ctx.lineTo(jx(c), jy(c)); ctx.stroke();
  }
  function dot(ctx, p, r, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(jx(p), jy(p), r, 0, 6.2832); ctx.fill();
  }

  function drawWeapon(ctx, ps, kind, col, ink) {
    var x = jx(ps.wpn), y = jy(ps.wpn), rot = ps.wpn[2];
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (kind === 'sword') {
      ctx.strokeStyle = ink; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(40, 0); ctx.stroke();
      ctx.strokeStyle = '#dff2ff'; ctx.lineWidth = 4.2;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(39, 0); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-4, -0.6); ctx.lineTo(37, -0.6); ctx.stroke();
      ctx.strokeStyle = '#c8963c'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(-8, 5); ctx.stroke();
      ctx.strokeStyle = '#7a4f22'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-19, 0); ctx.stroke();
      ctx.strokeStyle = rgba(0xc23a55, 0.9); ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-19, 0); ctx.lineTo(-25, 7); ctx.lineTo(-22, 13); ctx.stroke();
    } else if (kind === 'spear') {
      ctx.strokeStyle = ink; ctx.lineWidth = 8.5;
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(34, 0); ctx.stroke();
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 5.4;
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(28, 0); ctx.stroke();
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.moveTo(24, -7); ctx.lineTo(44, 0); ctx.lineTo(24, 7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e6f2ff';
      ctx.beginPath(); ctx.moveTo(25, -5); ctx.lineTo(41, 0); ctx.lineTo(25, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(26, -2); ctx.lineTo(38, 0); ctx.lineTo(26, 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(0xc23a55, 0.95); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(14, 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(16, 13); ctx.stroke();
    } else {
      /* open palm: a bracer plus a qi corona at the hand */
      ctx.strokeStyle = ink; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(2, 0); ctx.stroke();
      ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(2, 0); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-12, -3); ctx.lineTo(0, -3); ctx.stroke();
      var g = ctx.createRadialGradient(12, 0, 1, 12, 0, 17);
      g.addColorStop(0, rgba(0xffffff, 0.85));
      g.addColorStop(0.45, rgba(0xff8a6a, 0.42));
      g.addColorStop(1, rgba(0xff8a6a, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(12, 0, 17, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = rgba(0xffd6c0, 0.8); ctx.lineWidth = 1.8;
      for (var i = 0; i < 3; i++) {
        var a0 = -0.7 + i * 0.7;
        ctx.beginPath(); ctx.arc(6, 0, 12 + i * 3, a0 - 0.5, a0 + 0.5); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawPoseFrame(ctx, ps, look, stanceIdx) {
    var ink = '#080b12';
    var robe = hex(look.robe), dark = hex(look.robeDark), trim = hex(look.trim);
    var sash = hex(look.sash), hair = hex(look.hair), skin = look.skin || '#e8c9a8';
    var sCol = hex(STANCES[stanceIdx].color);

    /* back leg + back arm read as the shadow side */
    limb(ctx, ps.hip, ps.kneeB, ps.footB, 10, dark, ink);
    limb(ctx, ps.sh, ps.elbB, ps.handB, 8, dark, ink);
    dot(ctx, ps.handB, 4.2, skin);

    /* robe skirt */
    var f = ps.flare;
    ctx.beginPath();
    ctx.moveTo(jx(ps.hip) - 11, jy(ps.hip) - 2);
    ctx.quadraticCurveTo(ORIGIN_X - 26 * f, ORIGIN_Y - 34, ORIGIN_X - 21 * f + ps.hip[0] * 0.5, ORIGIN_Y - 4);
    ctx.lineTo(ORIGIN_X + 25 * f + ps.hip[0] * 0.7, ORIGIN_Y - 6);
    ctx.quadraticCurveTo(ORIGIN_X + 24 * f, ORIGIN_Y - 36, jx(ps.hip) + 11, jy(ps.hip) - 2);
    ctx.closePath();
    ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.stroke();
    var gr = ctx.createLinearGradient(0, ORIGIN_Y - 56, 0, ORIGIN_Y);
    gr.addColorStop(0, robe); gr.addColorStop(1, dark);
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = trim; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ORIGIN_X - 20 * f + ps.hip[0] * 0.5, ORIGIN_Y - 7);
    ctx.lineTo(ORIGIN_X + 24 * f + ps.hip[0] * 0.7, ORIGIN_Y - 9);
    ctx.stroke();

    /* front leg */
    limb(ctx, ps.hip, ps.kneeF, ps.footF, 11, robe, ink);

    /* torso */
    limb(ctx, ps.hip, [(ps.hip[0] + ps.neck[0]) / 2, (ps.hip[1] + ps.neck[1]) / 2], ps.neck, 20, robe, ink);
    /* sash across the chest, in the stance colour so a swap reads instantly */
    ctx.strokeStyle = ink; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(jx(ps.sh) - 9, jy(ps.sh) + 3); ctx.lineTo(jx(ps.hip) + 9, jy(ps.hip) - 5); ctx.stroke();
    ctx.strokeStyle = sash; ctx.lineWidth = 5.5;
    ctx.beginPath(); ctx.moveTo(jx(ps.sh) - 9, jy(ps.sh) + 3); ctx.lineTo(jx(ps.hip) + 9, jy(ps.hip) - 5); ctx.stroke();
    ctx.strokeStyle = sCol; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(jx(ps.sh) - 8, jy(ps.sh) + 5); ctx.lineTo(jx(ps.hip) + 8, jy(ps.hip) - 3); ctx.stroke();
    /* waist knot */
    ctx.fillStyle = sash;
    ctx.beginPath(); ctx.arc(jx(ps.hip) + 6, jy(ps.hip) - 4, 4.4, 0, 6.2832); ctx.fill();

    /* head */
    var hx = jx(ps.head), hy = jy(ps.head);
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(hx, hy, 11.4, 0, 6.2832); ctx.fill();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy, 9.6, 0, 6.2832); ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.arc(hx, hy - 1.5, 9.8, Math.PI * 1.02, Math.PI * 2.12); ctx.fill();
    ctx.beginPath(); ctx.arc(hx - 5, hy - 10, 5.2, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = hair; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hx - 8, hy - 4); ctx.lineTo(hx - 17, hy + 12); ctx.stroke();
    ctx.strokeStyle = trim; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(hx - 9.5, hy - 4.5); ctx.lineTo(hx + 8.5, hy - 6.5); ctx.stroke();
    ctx.fillStyle = ink;
    ctx.fillRect(hx + 3.4, hy - 2.6, 3.6, 1.9);

    /* front arm and the weapon of the current stance */
    limb(ctx, ps.sh, ps.elbF, ps.handF, 8.6, robe, ink);
    dot(ctx, ps.handF, 4.4, skin);
    drawWeapon(ctx, ps, STANCES[stanceIdx].weapon, sCol, ink);
  }

  /* Bakes one 21 x 2 sheet: 3 stances x 14 poses. */
  function bakeFighterSheet(scene, key, look) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var cols = 21, rows = 2;
    var cv = document.createElement('canvas');
    cv.width = cols * FW; cv.height = rows * FH;
    var ctx = cv.getContext('2d');
    for (var s = 0; s < 3; s++) {
      for (var p = 0; p < POSE_COUNT; p++) {
        var idx = s * POSE_COUNT + p;
        var cx = (idx % cols) * FW, cy = Math.floor(idx / cols) * FH;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.beginPath(); ctx.rect(0, 0, FW, FH); ctx.clip();
        drawPoseFrame(ctx, POSES[p], look, s);
        ctx.restore();
      }
    }
    scene.textures.addSpriteSheet(key, cv, { frameWidth: FW, frameHeight: FH, endFrame: cols * rows - 1 });
    return key;
  }

  function lookOf(d) {
    return { robe: d.robe, robeDark: d.robeDark, trim: d.trim, sash: d.sash, hair: d.hair, skin: '#e6c6a4' };
  }
  var PLAYER_LOOK = {
    robe: 0x2b3550, robeDark: 0x161d31, trim: 0xdfe8ff, sash: 0xf2f6ff,
    hair: 0x11141f, skin: '#efd0ad'
  };

  /* ------------------------------------------------------- texture helper */
  function bake(scene, key, w, h, draw) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h));
    draw(cv.getContext('2d'), cv.width, cv.height);
    scene.textures.addCanvas(key, cv);
    return key;
  }

  /* ----------------------------------------------------------- stage art */
  function ridge(ctx, w, baseY, amp, step, color, seed, alpha) {
    var r = seeded(seed);
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.beginPath();
    ctx.moveTo(-10, baseY + amp);
    var y = baseY;
    for (var x = -10; x <= w + 10; x += step) {
      y = baseY + Math.sin(x * 0.004 + seed) * amp * 0.6 - r() * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w + 10, baseY + amp * 3);
    ctx.lineTo(-10, baseY + amp * 3);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function peaks(ctx, w, baseY, n, minH, maxH, color, seed, alpha) {
    var r = seeded(seed);
    ctx.fillStyle = color; ctx.globalAlpha = alpha == null ? 1 : alpha;
    for (var i = 0; i < n; i++) {
      var cx = (i + 0.5) / n * w + (r() - 0.5) * (w / n) * 0.7;
      var hh = minH + r() * (maxH - minH);
      var hw = hh * (0.75 + r() * 0.6);
      ctx.beginPath();
      ctx.moveTo(cx - hw, baseY);
      ctx.lineTo(cx - hw * 0.22, baseY - hh * 0.86);
      ctx.lineTo(cx, baseY - hh);
      ctx.lineTo(cx + hw * 0.3, baseY - hh * 0.78);
      ctx.lineTo(cx + hw, baseY);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function pagoda(ctx, x, baseY, h, w, color, tiers) {
    ctx.fillStyle = color;
    ctx.fillRect(x - w * 0.16, baseY - h, w * 0.32, h);
    for (var t = 0; t < tiers; t++) {
      var ty = baseY - h * (0.32 + t * (0.62 / tiers));
      var tw = w * (1 - t * 0.13);
      ctx.beginPath();
      ctx.moveTo(x - tw * 0.5, ty);
      ctx.quadraticCurveTo(x - tw * 0.34, ty - 11, x, ty - 15);
      ctx.quadraticCurveTo(x + tw * 0.34, ty - 11, x + tw * 0.5, ty);
      ctx.quadraticCurveTo(x + tw * 0.2, ty + 5, x, ty + 5);
      ctx.quadraticCurveTo(x - tw * 0.2, ty + 5, x - tw * 0.5, ty);
      ctx.closePath(); ctx.fill();
    }
  }
  function bambooCulm(ctx, x, baseY, h, w, color, node, seed) {
    var r = seeded(seed);
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'butt';
    ctx.beginPath();
    var lean = (r() - 0.5) * 24;
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + lean * 0.4, baseY - h * 0.55, x + lean, baseY - h);
    ctx.stroke();
    ctx.strokeStyle = node; ctx.lineWidth = Math.max(1.4, w * 0.22);
    for (var k = 1; k < 8; k++) {
      var t = k / 8, yy = baseY - h * t, xx = x + lean * t * t;
      ctx.beginPath(); ctx.moveTo(xx - w * 0.46, yy); ctx.lineTo(xx + w * 0.46, yy); ctx.stroke();
    }
    ctx.strokeStyle = color; ctx.lineWidth = 2.4;
    for (var l = 0; l < 5; l++) {
      var t2 = 0.42 + r() * 0.55, yy2 = baseY - h * t2, xx2 = x + lean * t2 * t2;
      var dir = r() < 0.5 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(xx2, yy2);
      ctx.quadraticCurveTo(xx2 + dir * 20, yy2 - 12, xx2 + dir * 40, yy2 - 4);
      ctx.stroke();
    }
  }
  function pine(ctx, x, baseY, h, color, seed) {
    var r = seeded(seed);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(3, h * 0.045); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x + (r() - 0.5) * 8, baseY - h); ctx.stroke();
    ctx.fillStyle = color;
    for (var i = 0; i < 5; i++) {
      var t = 0.30 + i * 0.16;
      var yy = baseY - h * t, ww = h * (0.34 - i * 0.052);
      ctx.beginPath();
      ctx.moveTo(x - ww, yy);
      ctx.lineTo(x, yy - h * 0.20);
      ctx.lineTo(x + ww, yy);
      ctx.closePath(); ctx.fill();
    }
  }

  function bakeStage(scene, idx) {
    var S = STAGES[idx];
    var pre = 'st';
    /* One baked backdrop instead of four stacked full screen layers. Sky,
       silhouettes, haze, stage glow and vignette are composited once per
       stage, which cuts the per frame overdraw roughly in half. */
    bake(scene, pre + '-back', 1280, 720, function (ctx, w, h) {
      var horizon = 470;
      var g = ctx.createLinearGradient(0, 0, 0, horizon + 60);
      g.addColorStop(0, S.sky[0]); g.addColorStop(0.58, S.sky[1]); g.addColorStop(1, S.sky[2]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, horizon + 60);
      ctx.fillStyle = '#05070c'; ctx.fillRect(0, horizon + 58, w, h - horizon - 58);

      var r = seeded(idx * 977 + 5);
      if (idx === 0 || idx === 1) {
        for (var i = 0; i < 120; i++) {
          ctx.fillStyle = rgba(0xdfe9ff, 0.15 + r() * 0.55);
          ctx.fillRect(r() * w, r() * horizon * 0.6, 2, 2);
        }
      }
      var mx = w * (idx === 3 ? 0.74 : 0.22), my = horizon * (idx === 2 ? 0.42 : 0.22);
      var mr = idx === 3 ? 74 : 54;
      var cg = ctx.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 4.2);
      cg.addColorStop(0, rgba(S.moon, 0.5));
      cg.addColorStop(0.3, rgba(S.moon, 0.15));
      cg.addColorStop(1, rgba(S.moon, 0));
      ctx.fillStyle = cg; ctx.fillRect(0, 0, w, horizon);
      ctx.fillStyle = rgba(S.moon, 0.92);
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.2832); ctx.fill();
      if (idx === 1) {
        for (var c = 0; c < 8; c++) {
          ctx.fillStyle = rgba(0x0b0d22, 0.28 + r() * 0.2);
          ctx.beginPath();
          ctx.ellipse(r() * w, horizon * (0.08 + r() * 0.4), 120 + r() * 180, 20 + r() * 26, 0, 0, 6.2832);
          ctx.fill();
        }
      }
      if (idx === 3) {
        for (var q = 0; q < 10; q++) {
          ctx.fillStyle = rgba(0xffd6c0, 0.10 + r() * 0.14);
          ctx.beginPath();
          ctx.ellipse(r() * w, horizon * (0.62 + r() * 0.34), 150 + r() * 190, 20 + r() * 22, 0, 0, 6.2832);
          ctx.fill();
        }
      }

      /* far silhouettes, drawn straight into screen space */
      if (idx === 0) {
        ridge(ctx, w, horizon - 150, 64, 26, hex(S.far), 3, 0.85);
        ridge(ctx, w, horizon - 70, 44, 22, hex(S.mid), 9, 0.9);
        var r0 = seeded(21);
        for (var b0 = 0; b0 < 24; b0++) {
          bambooCulm(ctx, r0() * w, horizon + 14, 220 + r0() * 190, 6, rgba(S.mid, 0.75), rgba(S.far, 0.8), b0 * 13 + 3);
        }
      } else if (idx === 1) {
        peaks(ctx, w, horizon, 5, 140, 240, rgba(S.far, 0.75), 31);
        var r1 = seeded(41);
        for (var pg = 0; pg < 7; pg++) {
          pagoda(ctx, (pg + 0.5) / 7 * w + (r1() - 0.5) * 70, horizon + 6, 140 + r1() * 150, 80 + r1() * 46, rgba(S.mid, 0.92), 3);
        }
      } else if (idx === 2) {
        peaks(ctx, w, horizon - 24, 6, 170, 300, rgba(S.far, 0.9), 57);
        peaks(ctx, w, horizon + 6, 9, 70, 150, rgba(S.mid, 0.85), 59);
        ctx.fillStyle = rgba(0xffffff, 0.5);
        for (var k = 0; k < 6; k++) {
          var kx = (k + 0.5) / 6 * w;
          ctx.beginPath(); ctx.moveTo(kx - 28, horizon - 214); ctx.lineTo(kx, horizon - 280); ctx.lineTo(kx + 28, horizon - 214); ctx.closePath(); ctx.fill();
        }
      } else {
        peaks(ctx, w, horizon - 44, 7, 150, 270, rgba(S.far, 0.8), 71);
        var r3 = seeded(73);
        for (var c2 = 0; c2 < 12; c2++) {
          ctx.fillStyle = rgba(0xffc9a0, 0.10 + r3() * 0.13);
          ctx.beginPath();
          ctx.ellipse(r3() * w, horizon - 40 + r3() * 60, 150 + r3() * 170, 16 + r3() * 18, 0, 0, 6.2832);
          ctx.fill();
        }
      }

      var hz = ctx.createLinearGradient(0, horizon - 280, 0, horizon + 40);
      hz.addColorStop(0, rgba(S.haze, 0)); hz.addColorStop(1, rgba(S.haze, 0.34));
      ctx.fillStyle = hz; ctx.fillRect(0, horizon - 280, w, 320);

      /* stage signature glow, folded in rather than an extra additive quad */
      var sg = ctx.createRadialGradient(w * 0.5, GROUND_Y - 110, 20, w * 0.5, GROUND_Y - 110, 620);
      sg.addColorStop(0, rgba(S.signature, 0.13 + S.lightIntensity * 0.08));
      sg.addColorStop(1, rgba(S.signature, 0));
      ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h);

      var vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.32, w / 2, h / 2, h * 0.92);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    });

    /* mid detail */
    bake(scene, pre + '-mid', 1400, 400, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var base = h - 10;
      var r = seeded(idx * 313 + 11);
      if (idx === 0) {
        for (var i = 0; i < 13; i++) bambooCulm(ctx, r() * w, base, 260 + r() * 130, 11 + r() * 6, hex(S.mid), rgba(S.signature, 0.55), i * 29 + 7);
        ctx.fillStyle = rgba(S.signature, 0.14);
        for (var g2 = 0; g2 < 16; g2++) {
          ctx.beginPath(); ctx.ellipse(r() * w, base - r() * 260, 26 + r() * 40, 9 + r() * 12, r(), 0, 6.2832); ctx.fill();
        }
      } else if (idx === 1) {
        /* the hall roof above, drawn as a curved silhouette so its upper edge
           is never a straight line across the frame, plus a lantern row */
        ctx.fillStyle = hex(S.mid);
        ctx.beginPath();
        ctx.moveTo(-20, 214);
        ctx.quadraticCurveTo(w * 0.17, 104, w * 0.5, 78);
        ctx.quadraticCurveTo(w * 0.83, 104, w + 20, 214);
        ctx.lineTo(w + 20, 400); ctx.lineTo(-20, 400); ctx.closePath(); ctx.fill();
        /* the hall wall under the eave, so the roof is not a floating band */
        for (var pl = 0; pl < 9; pl++) {
          var plx = (pl + 0.5) / 9 * w;
          ctx.fillStyle = rgba(0x241a2c, 0.85);
          ctx.fillRect(plx - 17, 250, 34, 150);
          ctx.fillStyle = rgba(S.signature, 0.06);
          ctx.fillRect(plx - 17, 250, 7, 150);
        }
        ctx.strokeStyle = rgba(S.signature, 0.45); ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-20, 220); ctx.quadraticCurveTo(w * 0.17, 110, w * 0.5, 84);
        ctx.quadraticCurveTo(w * 0.83, 110, w + 20, 220); ctx.stroke();
        for (var l = 0; l < 8; l++) {
          var lx = (l + 0.5) / 8 * w, ly = 300 + Math.sin(l * 1.1) * 14;
          ctx.strokeStyle = rgba(0x2a2030, 0.9); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(lx, 240); ctx.lineTo(lx, ly - 16); ctx.stroke();
          var lg = ctx.createRadialGradient(lx, ly, 2, lx, ly, 40);
          lg.addColorStop(0, rgba(0xffd08a, 0.75)); lg.addColorStop(1, rgba(0xffd08a, 0));
          ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx, ly, 40, 0, 6.2832); ctx.fill();
          ctx.fillStyle = '#e8623c';
          ctx.beginPath(); ctx.ellipse(lx, ly, 12, 16, 0, 0, 6.2832); ctx.fill();
          ctx.fillStyle = '#ffd08a';
          ctx.beginPath(); ctx.ellipse(lx, ly, 6, 10, 0, 0, 6.2832); ctx.fill();
        }
      } else if (idx === 2) {
        for (var t = 0; t < 11; t++) pine(ctx, r() * w, base, 150 + r() * 120, hex(S.mid), t * 37 + 5);
        /* ice shards jutting from the surface */
        for (var s2 = 0; s2 < 9; s2++) {
          var sx = r() * w, sh = 50 + r() * 90;
          ctx.fillStyle = rgba(0xcfe9ff, 0.5);
          ctx.beginPath(); ctx.moveTo(sx - 16, base); ctx.lineTo(sx + (r() - 0.5) * 20, base - sh); ctx.lineTo(sx + 18, base); ctx.closePath(); ctx.fill();
          ctx.fillStyle = rgba(0xffffff, 0.35);
          ctx.beginPath(); ctx.moveTo(sx - 5, base); ctx.lineTo(sx + (r() - 0.5) * 10, base - sh * 0.8); ctx.lineTo(sx + 4, base); ctx.closePath(); ctx.fill();
        }
      } else {
        for (var p2 = 0; p2 < 7; p2++) pine(ctx, r() * w, base, 120 + r() * 110, hex(S.mid), p2 * 53 + 9);
        /* prayer ribbons strung between poles */
        for (var pr = 0; pr < 5; pr++) {
          var x0 = pr * (w / 5), x1 = x0 + w / 5;
          ctx.strokeStyle = rgba(0x2a1520, 0.9); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x0, 40); ctx.quadraticCurveTo((x0 + x1) / 2, 92, x1, 40); ctx.stroke();
          for (var f2 = 1; f2 < 8; f2++) {
            var tt = f2 / 8;
            var fx = lerp(x0, x1, tt);
            var fy = 40 + 52 * (4 * tt * (1 - tt)) * 0.85;
            ctx.fillStyle = [rgba(0xff9fb0, 0.85), rgba(0xffd08a, 0.85), rgba(0x9fe08a, 0.8), rgba(0x9fb6ff, 0.8)][f2 % 4];
            ctx.fillRect(fx - 4, fy, 8, 26);
          }
        }
      }
    });

    /* the duelling floor, composited into the backdrop */
    bakeInto(scene, pre + '-back', 0, GROUND_Y, 1280, 260, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hex(S.ground));
      g.addColorStop(1, '#05070c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = rgba(S.rim, 0.55); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(w, 2); ctx.stroke();
      var r = seeded(idx * 191 + 17);
      if (idx === 0) {
        for (var i = 0; i < 120; i++) {
          ctx.fillStyle = rgba([0x2c4a34, 0x3a5a3c, 0x1e3428][(i % 3)], 0.45 + r() * 0.3);
          var lx = r() * w, ly = r() * h * 0.7;
          ctx.save(); ctx.translate(lx, ly); ctx.rotate(r() * 3);
          ctx.beginPath(); ctx.ellipse(0, 0, 7 + r() * 6, 3 + r() * 2, 0, 0, 6.2832); ctx.fill();
          ctx.restore();
        }
        for (var s3 = 0; s3 < 18; s3++) {
          ctx.strokeStyle = rgba(0x0b1410, 0.5); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(r() * w, 0); ctx.lineTo(r() * w, h * 0.5); ctx.stroke();
        }
      } else if (idx === 1) {
        /* roof tiles in rows, wet highlights */
        for (var row = 0; row < 7; row++) {
          var ry = row * 26 + 6, tw = 46 + row * 5;
          for (var c = -1; c * tw < w + tw; c++) {
            var tx = c * tw + (row % 2 ? tw * 0.5 : 0);
            ctx.fillStyle = rgba(row % 2 ? 0x33223a : 0x2a1c30, 0.95);
            ctx.beginPath();
            ctx.moveTo(tx, ry + 22); ctx.lineTo(tx, ry + 4);
            ctx.quadraticCurveTo(tx + tw * 0.5, ry - 10, tx + tw, ry + 4);
            ctx.lineTo(tx + tw, ry + 22); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = rgba(0x9fb6ff, 0.16); ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(tx + 2, ry + 4); ctx.quadraticCurveTo(tx + tw * 0.5, ry - 8, tx + tw - 2, ry + 4); ctx.stroke();
          }
        }
      } else if (idx === 2) {
        ctx.fillStyle = rgba(0x9fc4de, 0.5); ctx.fillRect(0, 0, w, h * 0.5);
        for (var cr = 0; cr < 26; cr++) {
          ctx.strokeStyle = rgba(0xffffff, 0.16 + r() * 0.24); ctx.lineWidth = 1 + r() * 2;
          var x0 = r() * w, y0 = r() * h * 0.62;
          ctx.beginPath(); ctx.moveTo(x0, y0);
          for (var seg = 0; seg < 4; seg++) ctx.lineTo(x0 += (r() - 0.5) * 130, y0 += (r() - 0.4) * 30);
          ctx.stroke();
        }
        var ig = ctx.createLinearGradient(0, 0, 0, h * 0.62);
        ig.addColorStop(0, rgba(0xffffff, 0.22)); ig.addColorStop(1, rgba(0xffffff, 0));
        ctx.fillStyle = ig; ctx.fillRect(0, 0, w, h * 0.62);
      } else {
        for (var b = 0; b < 9; b++) {
          ctx.fillStyle = rgba(b % 2 ? 0x3a2030 : 0x30192a, 0.95);
          ctx.fillRect(b * (w / 9), 4, w / 9 - 3, 46);
          ctx.strokeStyle = rgba(0xffc9a0, 0.16); ctx.lineWidth = 1.6;
          ctx.strokeRect(b * (w / 9) + 1, 5, w / 9 - 5, 44);
        }
        ctx.strokeStyle = rgba(0xffc9a0, 0.22); ctx.lineWidth = 2;
        for (var ln = 0; ln < 5; ln++) {
          ctx.beginPath(); ctx.moveTo(0, 56 + ln * 20); ctx.lineTo(w, 56 + ln * 20); ctx.stroke();
        }
      }
      var vg = ctx.createLinearGradient(0, 0, 0, h);
      vg.addColorStop(0, rgba(0x000000, 0)); vg.addColorStop(1, rgba(0x000000, 0.5));
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    });
  }

  /* Draws extra art into an already baked canvas texture and re-uploads it. */
  function bakeInto(scene, key, x, y, w, h, draw) {
    var src = scene.textures.get(key).getSourceImage();
    var ctx = src.getContext('2d');
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    draw(ctx, w, h);
    ctx.restore();
    scene.textures.get(key).refresh();
  }

  /* -------------------------------------------------- small texture set */
  function bakeCommon(scene) {
    bake(scene, 'px', 8, 8, function (ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 8, 8); });
    bake(scene, 'p-spark', 16, 16, function (ctx) {
      var g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 16);
    });
    bake(scene, 'p-shard', 24, 6, function (ctx) {
      var g = ctx.createLinearGradient(0, 0, 24, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.4, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(12, 0); ctx.lineTo(24, 3); ctx.lineTo(12, 6); ctx.closePath(); ctx.fill();
    });
    bake(scene, 'p-ring', 128, 128, function (ctx) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(64, 64, 54, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 0.4; ctx.lineWidth = 16;
      ctx.beginPath(); ctx.arc(64, 64, 54, 0, 6.2832); ctx.stroke();
    });
    bake(scene, 'p-leaf', 20, 12, function (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(10, 6, 9, 4, 0.3, 0, 6.2832); ctx.fill();
    });
    bake(scene, 'p-drop', 4, 26, function (ctx) {
      var g = ctx.createLinearGradient(0, 0, 0, 26);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.95)');
      ctx.fillStyle = g; ctx.fillRect(1, 0, 2, 26);
    });
    bake(scene, 'p-flake', 14, 14, function (ctx) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
      for (var i = 0; i < 3; i++) {
        var a = i * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(7 - Math.cos(a) * 6, 7 - Math.sin(a) * 6);
        ctx.lineTo(7 + Math.cos(a) * 6, 7 + Math.sin(a) * 6);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(7, 7, 1.8, 0, 6.2832); ctx.fill();
    });
    bake(scene, 'p-silk', 34, 8, function (ctx) {
      var g = ctx.createLinearGradient(0, 0, 34, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.quadraticCurveTo(17, -4, 34, 4);
      ctx.quadraticCurveTo(17, 12, 0, 4);
      ctx.closePath(); ctx.fill();
    });
    bake(scene, 'p-glow', 128, 128, function (ctx) {
      var g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.28)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    });
    bake(scene, 'shadow', 140, 34, function (ctx) {
      var g = ctx.createRadialGradient(70, 17, 2, 70, 17, 68);
      g.addColorStop(0, 'rgba(0,0,0,0.62)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(70, 17, 68, 15, 0, 0, 6.2832); ctx.fill();
    });
    /* HUD chrome, baked once so nothing rebuilds a command list per frame */
    bake(scene, 'ui-bar', 460, 26, function (ctx, w, h) {
      ctx.fillStyle = 'rgba(6,9,16,0.72)';
      ctx.strokeStyle = 'rgba(206,222,246,0.30)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(w, 0); ctx.lineTo(w - 10, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fill(); ctx.stroke();
    });
    bake(scene, 'ui-pip', 30, 30, function (ctx) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(15, 3); ctx.lineTo(27, 15); ctx.lineTo(15, 27); ctx.lineTo(3, 15); ctx.closePath(); ctx.stroke();
    });
    bake(scene, 'ui-pipfill', 30, 30, function (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(15, 4); ctx.lineTo(26, 15); ctx.lineTo(15, 26); ctx.lineTo(4, 15); ctx.closePath(); ctx.fill();
    });
    bake(scene, 'ui-btn', 104, 104, function (ctx) {
      ctx.fillStyle = 'rgba(9,13,22,0.60)';
      ctx.beginPath(); ctx.arc(52, 52, 46, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(214,228,250,0.55)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(52, 52, 46, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = 'rgba(214,228,250,0.16)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(52, 52, 39, 0, 6.2832); ctx.stroke();
    });
    bake(scene, 'ui-chip', 208, 168, function (ctx, w, h) {
      ctx.fillStyle = 'rgba(9,13,22,0.62)';
      ctx.strokeStyle = 'rgba(214,228,250,0.42)'; ctx.lineWidth = 3;
      var r = 16;
      ctx.beginPath();
      ctx.moveTo(r, 2); ctx.lineTo(w - r, 2); ctx.quadraticCurveTo(w - 2, 2, w - 2, r);
      ctx.lineTo(w - 2, h - r); ctx.quadraticCurveTo(w - 2, h - 2, w - r, h - 2);
      ctx.lineTo(r, h - 2); ctx.quadraticCurveTo(2, h - 2, 2, h - r);
      ctx.lineTo(2, r); ctx.quadraticCurveTo(2, 2, r, 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    bake(scene, 'ui-panel', 320, 200, function (ctx, w, h) {
      ctx.fillStyle = 'rgba(8,11,19,0.90)';
      ctx.strokeStyle = 'rgba(198,216,244,0.34)'; ctx.lineWidth = 3;
      ctx.fillRect(0, 0, w, h); ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
      ctx.strokeStyle = 'rgba(198,216,244,0.14)'; ctx.lineWidth = 1.4;
      ctx.strokeRect(9.5, 9.5, w - 19, h - 19);
    });
    bake(scene, 'ui-row', 540, 72, function (ctx, w, h) {
      ctx.fillStyle = 'rgba(18,25,40,0.94)';
      ctx.strokeStyle = 'rgba(198,216,244,0.34)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12, 0); ctx.lineTo(w, 0); ctx.lineTo(w - 12, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fill(); ctx.stroke();
    });
    bake(scene, 'ui-wide', 300, 84, function (ctx, w, h) {
      ctx.fillStyle = 'rgba(18,25,40,0.92)';
      ctx.strokeStyle = 'rgba(222,236,255,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(16, 0); ctx.lineTo(w, 0); ctx.lineTo(w - 16, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fill(); ctx.stroke();
    });
    /* Menus own the screen outright, so they get an authored ink wash
       backdrop rather than a scrim over a world nobody can see. */
    bake(scene, 'ui-scrim', 1280, 720, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0d1524'); g.addColorStop(0.55, '#070b14'); g.addColorStop(1, '#04060b');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      var r = seeded(4242);
      for (var i = 0; i < 150; i++) {
        ctx.fillStyle = rgba(0xcfe0ff, 0.06 + r() * 0.22);
        ctx.fillRect(r() * w, r() * h, 2, 2);
      }
      /* brush circle */
      ctx.save();
      ctx.translate(w * 0.78, h * 0.42);
      ctx.strokeStyle = rgba(0xd8b06a, 0.16);
      ctx.lineCap = 'round';
      for (var k = 0; k < 3; k++) {
        ctx.lineWidth = 26 - k * 8;
        ctx.beginPath();
        ctx.arc(0, 0, 210 + k * 5, -0.5 + k * 0.05, 5.3 + k * 0.05);
        ctx.stroke();
      }
      ctx.restore();
      /* silk ribbons */
      var cols = [0xff9fb0, 0x7fe0b0, 0x9fb6ff];
      for (var c = 0; c < 3; c++) {
        ctx.strokeStyle = rgba(cols[c], 0.13);
        ctx.lineWidth = 30 - c * 8;
        ctx.beginPath();
        ctx.moveTo(-60, h * (0.30 + c * 0.20));
        ctx.bezierCurveTo(w * 0.30, h * (0.05 + c * 0.26), w * 0.66, h * (0.72 - c * 0.16), w + 60, h * (0.24 + c * 0.22));
        ctx.stroke();
      }
      var vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.72)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    });
    bake(scene, 'ui-banner', 768, 132, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(8,11,19,0)');
      g.addColorStop(0.16, 'rgba(8,11,19,0.88)');
      g.addColorStop(0.84, 'rgba(8,11,19,0.88)');
      g.addColorStop(1, 'rgba(8,11,19,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(226,240,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w * 0.10, 3); ctx.lineTo(w * 0.90, 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.10, h - 3); ctx.lineTo(w * 0.90, h - 3); ctx.stroke();
    });
    bake(scene, 'ui-strip', 640, 52, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(10,14,24,0)');
      g.addColorStop(0.2, 'rgba(10,14,24,0.80)');
      g.addColorStop(0.8, 'rgba(10,14,24,0.80)');
      g.addColorStop(1, 'rgba(10,14,24,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    bake(scene, 'ui-toast', 260, 52, function (ctx, w, h) {
      ctx.fillStyle = 'rgba(10,14,24,0.82)';
      ctx.strokeStyle = 'rgba(226,240,255,0.42)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(w, 0); ctx.lineTo(w - 10, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fill(); ctx.stroke();
    });
    bake(scene, 'vignette', 256, 144, function (ctx, w, h) {
      var g = ctx.createRadialGradient(w / 2, h / 2, h * 0.30, w / 2, h / 2, h * 0.82);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
  }

  /* ---------------------------------------------------------- scene glue */
  function makeSceneClass(cfg) {
    function S() { Phaser.Scene.call(this, { key: cfg.key }); }
    S.prototype = Object.create(Phaser.Scene.prototype);
    S.prototype.constructor = S;
    Object.keys(cfg).forEach(function (k) { if (k !== 'key') S.prototype[k] = cfg[k]; });
    return S;
  }

  /* Player-facing input intent. Everything the sim reads lives here, so a
     restart clears one object rather than hunting handler state. */
  var intent = {
    buffer: '', bufferAt: -9999, stanceQueued: -1, pauseQueued: false,
    key: Object.create(null), tapQueue: null
  };
  function clearIntent() {
    intent.buffer = ''; intent.bufferAt = -9999; intent.stanceQueued = -1;
    intent.pauseQueued = false; intent.tapQueue = null;
    for (var k in intent.key) delete intent.key[k];
  }
  var BUFFER_MS = 220;
  function queueAction(name) {
    intent.buffer = name;
    intent.bufferAt = run.simTime;
  }

  /* Touch zones in virtual pixels. Circles are {x,y,r}; every hit area is at
     least 88 virtual px across, which is over 44 CSS px at the 390 px frame. */
  var ZONES = {
    stance0: { x: 20, y: 620, w: 108, h: 88 },
    stance1: { x: 136, y: 620, w: 108, h: 88 },
    stance2: { x: 252, y: 620, w: 108, h: 88 },
    evade: { cx: 74, cy: 524, r: 50 },
    dash: { cx: 190, cy: 524, r: 50 },
    high: { cx: 1150, cy: 470, r: 46 },
    grab: { cx: 1064, cy: 566, r: 46 },
    low: { cx: 1150, cy: 662, r: 46 },
    parry: { cx: 1236, cy: 566, r: 46 },
    burst: { cx: 1236, cy: 452, r: 42 },
    pause: { cx: 640, cy: 676, r: 42 }
  };
  function inCircle(z, x, y) {
    var dx = x - z.cx, dy = y - z.cy;
    return dx * dx + dy * dy <= z.r * z.r;
  }
  function inRect(z, x, y) {
    return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  }

  var PARTICLE_MAX = 190;
  var WEATHER_MAX = 46;

  var MainScene = makeSceneClass({
    key: 'main',

    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR);
      sceneRef = this;
      var self = this;
      this.accum = 0;
      this.stageBaked = -1;
      this.opponentSheet = '';
      this.flash = 0; this.flashColor = 0xffffff;
      this.bannerT = 0; this.bannerHold = 0;
      this.toastT = 0; this.toastQueue = [];
      this.coachT = 0; this.coachText = '';
      this.screen = 'title';
      this.menuPage = 0;
      this.menuKind = '';
      this.resetConfirm = 0;
      this.rng = seeded(20260813);

      bakeCommon(this);
      kit.loader.progress(0.2);
      bakeFighterSheet(this, 'sheet-p', PLAYER_LOOK);
      bakeFighterSheet(this, 'sheet-e', lookOf(DUELLISTS[0]));
      bakeStage(this, 0);
      kit.loader.progress(0.45);

      this.world = this.add.container(0, 0);
      this.hud = this.add.container(0, 0);
      this.menu = this.add.container(0, 0);

      this.buildWorld();
      kit.loader.progress(0.5);
      this.buildHud();
      kit.loader.progress(0.65);
      this.buildMenu();
      kit.loader.progress(0.75);

      this.stageBaked = -1;
      this.applyStage(0);
      kit.loader.progress(0.9);

      this.bindInput();

      /* Pre-decode every sound effect before the first frame of play so no
         decode happens mid-duel. Music is fetched lazily on first interaction. */
      kit.audio.preload(SFX).then(function () {
        kit.loader.progress(1);
        kit.loader.hide();
        state.ready = true;
      });

      this.showTitle();
      this.applyBridgeForces(true);
    },

    /* --------------------------------------------------------- world art */
    buildWorld: function () {
      var self = this;
      this.back = this.add.image(VW / 2, VH / 2, 'st-back').setDisplaySize(1340, 754);
      this.mid = this.add.image(VW / 2, GROUND_Y + 6, 'st-mid').setOrigin(0.5, 1).setDisplaySize(1400, 400);
      this.world.add([this.back, this.mid]);

      /* weather pool sits behind the fighters, impacts sit in front */
      this.weather = [];
      for (var w = 0; w < WEATHER_MAX; w++) {
        var wi = this.add.image(-999, -999, 'p-leaf').setVisible(false);
        this.weather.push({ o: wi, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, life: 0, max: 1, alive: false });
        this.world.add(wi);
      }

      this.shadowP = this.add.image(0, GROUND_Y + 4, 'shadow').setDisplaySize(150, 32).setAlpha(0.7);
      this.shadowE = this.add.image(0, GROUND_Y + 4, 'shadow').setDisplaySize(150, 32).setAlpha(0.7);
      this.auraP = this.add.image(0, 0, 'p-glow').setDisplaySize(260, 260).setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.auraE = this.add.image(0, 0, 'p-glow').setDisplaySize(260, 260).setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.spriteP = this.add.image(0, GROUND_Y, 'sheet-p', 0).setOrigin(ORIGIN_X / FW, ORIGIN_Y / FH)
        .setScale(FIGHTER_SCALE);
      this.spriteE = this.add.image(0, GROUND_Y, 'sheet-p', 0).setOrigin(ORIGIN_X / FW, ORIGIN_Y / FH)
        .setScale(FIGHTER_SCALE).setFlipX(true);
      this.gfx = this.add.graphics();
      this.world.add([this.shadowP, this.shadowE, this.auraP, this.auraE, this.gfx, this.spriteP, this.spriteE]);

      /* impact particle pool */
      this.parts = [];
      for (var i = 0; i < PARTICLE_MAX; i++) {
        var im = this.add.image(-999, -999, 'p-spark').setVisible(false);
        this.parts.push({
          o: im, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1,
          s0: 1, s1: 1, rot: 0, vr: 0, alive: false, kind: 'spark', add: true
        });
        this.world.add(im);
      }
      this.partHead = 0;

      this.flashRect = this.add.image(VW / 2, VH / 2, 'px').setDisplaySize(VW, VH).setAlpha(0);
      this.world.add(this.flashRect);

      /* sash ribbons, eight points each, integrated in the stepped sim */
      P.ribbon = this.makeRibbon();
      E.ribbon = this.makeRibbon();
    },

    makeRibbon: function () {
      var pts = [];
      for (var i = 0; i < 8; i++) pts.push({ x: 0, y: 0, px: 0, py: 0 });
      return pts;
    },

    setOpponentLook: function (d) {
      var keep = (this.spriteE && this.spriteE.frame) ? this.spriteE.frame.name : 0;
      this.opponentSheet = 'sheet-e';
      bakeFighterSheet(this, 'sheet-e', lookOf(d));
      if (this.spriteE) this.spriteE.setTexture('sheet-e', keep);
    },

    applyStage: function (idx) {
      idx = clamp(idx | 0, 0, STAGES.length - 1);
      if (this.stageBaked === idx) return;
      bakeStage(this, idx);
      this.stageBaked = idx;
      var S = STAGES[idx];
      this.back.setTexture('st-back');
      this.mid.setTexture('st-mid');
      run.stageIndex = idx;
      state.stage = S.id;
      state.stageIndex = idx;
      for (var i = 0; i < this.weather.length; i++) this.killWeather(this.weather[i]);
      this.seedWeather();
    },

    /* --------------------------------------------------------- particles */
    spawn: function (kind, x, y, vx, vy, life, tint, s0, s1, grav, add) {
      var pool = this.parts;
      var p = null;
      for (var n = 0; n < PARTICLE_MAX; n++) {
        var idx = (this.partHead + n) % PARTICLE_MAX;
        if (!pool[idx].alive) { p = pool[idx]; this.partHead = (idx + 1) % PARTICLE_MAX; break; }
      }
      if (!p) { p = pool[this.partHead]; this.partHead = (this.partHead + 1) % PARTICLE_MAX; }
      var tex = kind === 'ring' ? 'p-ring' : kind === 'shard' ? 'p-shard' : kind === 'glow' ? 'p-glow' : 'p-spark';
      if (p.kind !== kind) { p.o.setTexture(tex); p.kind = kind; }
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.g = grav == null ? 900 : grav;
      p.life = life; p.max = life; p.s0 = s0; p.s1 = s1 == null ? s0 : s1;
      p.rot = kind === 'shard' ? Math.atan2(vy, vx) : 0;
      p.vr = kind === 'shard' ? 0 : (Math.random() - 0.5) * 6;
      p.alive = true;
      var wantAdd = add !== false;
      if (p.add !== wantAdd) { p.o.setBlendMode(wantAdd ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL); p.add = wantAdd; }
      p.o.setTint(tint).setVisible(true).setPosition(x, y).setAlpha(1);
      p.o.setDisplaySize(s0, s0);
      return p;
    },
    burstFx: function (x, y, n, tint, speed) {
      if (!motionOn()) n = Math.max(3, (n * 0.4) | 0);
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 6.2832, s = speed * (0.35 + Math.random());
        this.spawn('spark', x, y, Math.cos(a) * s, Math.sin(a) * s - 60,
          260 + Math.random() * 300, tint, 10 + Math.random() * 16, 2, 900);
      }
    },
    shardFx: function (x, y, n, tint, speed) {
      if (!motionOn()) n = Math.max(2, (n * 0.4) | 0);
      for (var i = 0; i < n; i++) {
        var a = (Math.random() - 0.5) * 2.4, s = speed * (0.5 + Math.random());
        this.spawn('shard', x, y, Math.cos(a) * s, Math.sin(a) * s - 40,
          220 + Math.random() * 220, tint, 26 + Math.random() * 24, 6, 500);
      }
    },
    ringFx: function (x, y, tint, size, life) {
      var p = this.spawn('ring', x, y, 0, 0, life || 340, tint, size || 40, (size || 40) * 3.0, 0);
      p.vr = 0;
      return p;
    },
    dustFx: function (x, y, n, tint) {
      for (var i = 0; i < n; i++) {
        this.spawn('spark', x + (Math.random() - 0.5) * 30, y - Math.random() * 14,
          (Math.random() - 0.5) * 90, -30 - Math.random() * 60,
          320 + Math.random() * 260, tint, 14 + Math.random() * 18, 3, 240, false);
      }
    },

    /* ------------------------------------------------------------ weather */
    killWeather: function (w) { w.alive = false; w.o.setVisible(false); },
    seedWeather: function () {
      var kind = STAGES[this.stageBaked].weather;
      var tex = kind === 'rain' ? 'p-drop' : kind === 'snow' ? 'p-flake' : kind === 'silk' ? 'p-silk' : 'p-leaf';
      var cap = motionOn() ? WEATHER_MAX : (WEATHER_MAX * 0.45) | 0;
      for (var i = 0; i < cap; i++) {
        var w = this.weather[i];
        w.o.setTexture(tex);
        this.respawnWeather(w, true);
      }
    },
    respawnWeather: function (w, anywhere) {
      var kind = STAGES[this.stageBaked].weather;
      var S = STAGES[this.stageBaked];
      w.x = Math.random() * (VW + 240) - 120;
      w.y = anywhere ? Math.random() * (GROUND_Y + 60) : -40 - Math.random() * 120;
      w.alive = true;
      w.o.setVisible(true);
      if (kind === 'rain') {
        w.vx = -170; w.vy = 900 + Math.random() * 320; w.rot = -0.19; w.vr = 0;
        w.o.setTint(0xa8c0ff).setAlpha(0.30 + Math.random() * 0.3).setScale(0.6 + Math.random() * 0.8);
      } else if (kind === 'snow') {
        w.vx = -20 + Math.random() * 40; w.vy = 42 + Math.random() * 46; w.vr = (Math.random() - 0.5) * 1.4;
        w.o.setTint(0xffffff).setAlpha(0.35 + Math.random() * 0.45).setScale(0.4 + Math.random() * 0.8);
      } else if (kind === 'silk') {
        w.vx = 60 + Math.random() * 110; w.vy = -12 + Math.random() * 46; w.vr = (Math.random() - 0.5) * 1.1;
        w.o.setTint(Math.random() < 0.5 ? 0xff9fb0 : 0xffd8a8).setAlpha(0.3 + Math.random() * 0.4)
          .setScale(0.5 + Math.random() * 0.9);
      } else {
        w.vx = -26 + Math.random() * 62; w.vy = 34 + Math.random() * 44; w.vr = (Math.random() - 0.5) * 2.2;
        w.o.setTint(Math.random() < 0.4 ? S.signature : 0x9ec98a).setAlpha(0.32 + Math.random() * 0.4)
          .setScale(0.5 + Math.random() * 0.8);
      }
      w.o.setPosition(w.x, w.y).setRotation(w.rot || 0);
    },
    stepWeather: function (dt) {
      var kind = STAGES[this.stageBaked].weather;
      for (var i = 0; i < this.weather.length; i++) {
        var w = this.weather[i];
        if (!w.alive) continue;
        w.x += w.vx * dt;
        w.y += w.vy * dt;
        if (kind === 'leaves' || kind === 'silk') w.x += Math.sin((w.y + i * 40) * 0.012) * 22 * dt;
        w.rot += w.vr * dt;
        if (w.y > GROUND_Y + 70 || w.x < -160 || w.x > VW + 160) { this.respawnWeather(w, false); continue; }
        w.o.setPosition(w.x, w.y);
        if (w.vr) w.o.setRotation(w.rot);
      }
    },

    /* -------------------------------------------------------------- input */
    bindInput: function () {
      var self = this;
      var canvas = this.game.canvas;
      var meta = Object.create(null);

      function toVirtual(e) {
        var r = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - r.left) * VW / Math.max(1, r.width),
          y: (e.clientY - r.top) * VH / Math.max(1, r.height)
        };
      }
      function zoneAt(x, y) {
        if (self.screen !== 'play') return 'menu';
        if (inCircle(ZONES.pause, x, y)) return 'pause';
        if (inCircle(ZONES.high, x, y)) return 'high';
        if (inCircle(ZONES.low, x, y)) return 'low';
        if (inCircle(ZONES.parry, x, y)) return 'parry';
        if (inCircle(ZONES.grab, x, y)) return 'grab';
        if (inCircle(ZONES.burst, x, y)) return 'burst';
        if (inCircle(ZONES.evade, x, y)) return 'evade';
        if (inCircle(ZONES.dash, x, y)) return 'dash';
        if (inRect(ZONES.stance0, x, y)) return 'stance0';
        if (inRect(ZONES.stance1, x, y)) return 'stance1';
        if (inRect(ZONES.stance2, x, y)) return 'stance2';
        return 'arena';
      }

      /* The claim runs on WINDOW and is registered after GGKit created its own
         window listener, so GGKit has already written the pointer record and
         cannot overwrite the zone we stamp here. */
      window.addEventListener('pointerdown', function (e) {
        var v = toVirtual(e);
        var zone = zoneAt(v.x, v.y);
        var p = kit.input.pointers.get(e.pointerId);
        if (!p) {
          /* paused or overlaid: GGKit skips the record, so seed it at claim time */
          p = {
            x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
            downAt: performance.now(), zone: null
          };
          kit.input.pointers.set(e.pointerId, p);
        }
        p.zone = zone;
        meta[e.pointerId] = { zone: zone, vx: v.x, vy: v.y, t: run.simTime, fired: false };
        self.onZoneDown(zone, v.x, v.y);
      }, { passive: true });

      window.addEventListener('pointermove', function (e) {
        var m = meta[e.pointerId];
        if (!m || m.fired || m.zone !== 'arena') return;
        var v = toVirtual(e);
        var dx = v.x - m.vx, dy = v.y - m.vy;
        if (dx * dx + dy * dy > 64 * 64) {
          m.fired = true;
          if (Math.abs(dx) > Math.abs(dy)) { if (dx > 0) queueAction('dash'); else queueAction('evade'); }
          else { queueAction(dy < 0 ? 'high' : 'low'); }
        }
      }, { passive: true });

      function release(e, wasUp) {
        var m = meta[e.pointerId];
        delete meta[e.pointerId];
        if (!m) return;
        if (wasUp && m.zone === 'arena' && !m.fired && run.simTime - m.t < 320) queueAction('parry');
        if (wasUp && m.zone === 'menu') {
          var v = toVirtual(e);
          self.onMenuTap(v.x, v.y);
        }
      }
      window.addEventListener('pointerup', function (e) { release(e, true); }, { passive: true });
      window.addEventListener('pointercancel', function (e) { release(e, false); }, { passive: true });
      this.pointerMeta = meta;

      window.addEventListener('keydown', function (e) {
        var k = e.key;
        if (k === ' ' || k.indexOf('Arrow') === 0) e.preventDefault();
        if (intent.key[k]) return;
        intent.key[k] = 1;
        self.onKey(k);
      });
      window.addEventListener('keyup', function (e) { delete intent.key[e.key]; });
      function firstGesture() {
        if (self.audioStarted) return;
        self.audioStarted = true;
        if (self.pendingMusic) kit.audio.music(self.pendingMusic, 900);
      }
      window.addEventListener('pointerdown', firstGesture, { once: true, passive: true });
      window.addEventListener('keydown', firstGesture, { once: true });
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    },

    onZoneDown: function (zone, x, y) {
      if (zone === 'menu' || zone === 'arena') return;
      if (zone === 'pause') { this.togglePause(); return; }
      if (zone === 'stance0') { intent.stanceQueued = 0; return; }
      if (zone === 'stance1') { intent.stanceQueued = 1; return; }
      if (zone === 'stance2') { intent.stanceQueued = 2; return; }
      queueAction(zone);
    },

    onKey: function (k) {
      var self = this;
      if (this.screen === 'pause' && (k === 'Escape' || k === 'p' || k === 'P')) { this.togglePause(); return; }
      if (this.screen !== 'play') {
        if (k === 'Enter' || k === ' ') this.menuPrimary();
        else if (k === 'Escape' || k === 'Backspace') this.menuBack();
        else if (k === 'ArrowRight' || k === 'ArrowDown') this.menuMove(1);
        else if (k === 'ArrowLeft' || k === 'ArrowUp') this.menuMove(-1);
        return;
      }
      if (k === 'Escape' || k === 'p' || k === 'P') { this.togglePause(); return; }
      if (k === 'ArrowUp' || k === 'w' || k === 'W') queueAction('high');
      else if (k === 'ArrowDown' || k === 's' || k === 'S') queueAction('low');
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') queueAction('dash');
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') queueAction('evade');
      else if (k === 'j' || k === 'J') queueAction('parry');
      else if (k === 'k' || k === 'K') queueAction('grab');
      else if (k === ' ') queueAction('burst');
      else if (k === '1') intent.stanceQueued = 0;
      else if (k === '2') intent.stanceQueued = 1;
      else if (k === '3') intent.stanceQueued = 2;
      else if (k === 'r' || k === 'R') this.restartDuel();
    }
  });

  var proto = MainScene.prototype;

  /* --------------------------------------------------------- act helpers */
  function setAct(f, kind, win, act, rec, d) {
    f.act = {
      kind: kind, t: 0, win: win, act: act, rec: rec,
      total: win + act + rec, resolved: false, d: d || null
    };
  }
  function phaseOf(f) {
    if (!f.act) return 'idle';
    var a = f.act;
    if (a.t < a.win) return 'wind';
    if (a.t < a.win + a.act) return 'active';
    return 'rec';
  }
  var ATTACK_TOKENS = { H: 1, L: 1, T: 1, G: 1, B: 1 };

  proto.canAct = function () {
    if (this.screen !== 'play' || kit.paused) return false;
    if (run.freeze > 0 || run.over > 0) return false;
    if (!P.act) return true;
    if (P.act.kind === 'hurt' || P.act.kind === 'stagger') return false;
    /* the tail of a recovery is cancellable, which is what lets combos chain */
    return P.act.t > P.act.win + P.act.act + P.act.rec * 0.55;
  };

  /* --------------------------------------------------------------- juice */
  proto.shake = function (mag, ms) { kit.juice.shake(mag, ms); };
  proto.hitStop = function (ms) { kit.juice.hitStop(ms); };
  proto.doFlash = function (color, amount) {
    if (!motionOn()) amount *= 0.35;
    if (amount > this.flash) { this.flash = amount; this.flashColor = color; }
  };
  proto.knock = function (f, v) { f.kvx += v; };

  /* Corner chips, never banners: one at a time, short hold, near the HUD. */
  proto.toast = function (text, color, side) {
    var t = { text: text, color: color, side: side == null ? 0 : side };
    if (this.toastT <= 0) { this.showToast(t); }
    else if (this.toastQueue.length < 2) this.toastQueue.push(t);
    else this.toastQueue[this.toastQueue.length - 1] = t;
  };
  proto.showToast = function (t) {
    this.toastT = 900;
    this.toastCur = t;
    setTextIfChanged(this.toastLabel, t.text);
    setColorIfChanged(this.toastLabel, t.color);
    var x = t.side ? VW - 300 : 300;
    this.toastPlate.setPosition(x, 172);
    this.toastLabel.setPosition(x, 172);
  };
  proto.banner = function (title, sub, ms) {
    this.bannerT = ms || 1400;
    this.bannerHold = this.bannerT;
    setTextIfChanged(this.bannerTitle, title);
    setTextIfChanged(this.bannerSub, sub || '');
  };
  proto.coach = function (line) {
    if (this.coachText === line && this.coachT > 900) return;
    this.coachText = line;
    this.coachT = 3200;
    setTextIfChanged(this.coachLabel, line);
  };

  /* ------------------------------------------------------------- damage */
  proto.dealToPlayer = function (base, kind, mult) {
    var d = base * stanceFactor(E.stance, P.stance) * (mult || 1) * opponentMod.damage;
    d = Math.max(1, Math.round(d));
    P.hp = Math.max(0, P.hp - d);
    P.flash = 1; P.hurtT = 280;
    setAct(P, 'hurt', 0, 0, kind === 'B' ? 520 : (kind === 'G' ? 420 : 300));
    run.range = 1;
    run.perfect = false;
    this.knock(P, -150 - d * 5);
    this.shake(Math.min(22, d * 0.7), 220);
    this.doFlash(0xff5a5a, 0.30);
    if (d > 12) this.hitStop(70);
    this.burstFx(posP(), GROUND_Y - 96, 14, 0xff7a6a, 190);
    this.shardFx(posP() - 20, GROUND_Y - 96, 4, 0xffc8b0, 220);
    sfx(d > 13 ? 'sfx-heavy' : 'sfx-hit');
    return d;
  };
  proto.dealToEnemy = function (base, mult, label) {
    var d = base * stanceFactor(P.stance, E.stance) * (mult || 1) * tuning.damage;
    d = Math.max(1, Math.round(d));
    E.hp = Math.max(0, E.hp - d);
    E.flash = 1; E.hurtT = 260;
    setAct(E, 'hurt', 0, 0, 280 + Math.min(220, d * 8));
    E.wait = 260;
    run.range = 1;
    this.knock(E, 150 + d * 5);
    this.shake(Math.min(20, d * 0.62), 200);
    this.doFlash(0xffffff, 0.20);
    if (d > 12) this.hitStop(70);
    var tint = STANCES[P.stance].color;
    this.burstFx(posE(), GROUND_Y - 96, 14, tint, 200);
    this.shardFx(posE() + 20, GROUND_Y - 96, 5, 0xffffff, 240);
    sfx(d > 13 ? 'sfx-heavy' : 'sfx-hit');
    run.cleanHits++;
    run.scoreThisDuel += d * 10;
    if (beatsStance(P.stance, E.stance)) run.stanceHits++;
    if (run.simTime - run.lastDashAt < 900) run.dashHits++;
    if (label) this.toast(label, '#ffe9a0', 1);
    return d;
  };
  proto.grazeEnemy = function (base, mult, label) {
    var d = Math.max(1, Math.round(base * stanceFactor(P.stance, E.stance) * (mult || 1) * tuning.damage));
    E.hp = Math.max(0, E.hp - d);
    E.flash = 0.7;
    this.shake(4, 120);
    this.burstFx(posE(), GROUND_Y - 96, 5, STANCES[P.stance].color, 120);
    sfx('sfx-block');
    if (label) this.toast(label, '#9fb6ff', 1);
    return d;
  };
  proto.overextend = function (ms) {
    if (!P.act) return;
    P.act.rec += ms; P.act.total += ms;
  };

  /* ------------------------------------------------- resolution: enemy */
  proto.enemyResolve = function (a) {
    var k = a.kind;
    var pa = P.act, pp = phaseOf(P);
    var base = (k === 'H' || k === 'L') ? 10 : k === 'T' ? 8 : k === 'G' ? 13 : 18;

    if (pa && pa.kind === 'evade' && pp !== 'rec') {
      P.breath = Math.min(tuning.breathMax, P.breath + 8);
      run.evades++;
      this.toast('EVADE', '#9fb6ff', 0);
      sfx('sfx-whoosh', 0.8, 1.15);
      this.ringFx(posE(), GROUND_Y - 96, 0x9fb6ff, 34, 300);
      this.dustFx(posP(), GROUND_Y, 5, 0x93a6c4);
      return;
    }
    if (pa && pa.kind === 'parry' && pp === 'active') {
      if (k === 'H' || k === 'L' || k === 'T') {
        P.breath = Math.min(tuning.breathMax, P.breath + 25);
        setAct(E, 'stagger', 0, 0, 900); E.wait = 200;
        run.parries++;
        run.scoreThisDuel += 120;
        this.toast('PERFECT PARRY', '#ffe9a0', 0);
        sfx('sfx-parry');
        this.doFlash(0xffe9a0, 0.42);
        this.shake(8, 200);
        this.hitStop(90);
        var mx = (posP() + posE()) / 2;
        this.ringFx(mx, GROUND_Y - 98, 0xffe9a0, 30, 380);
        this.burstFx(mx, GROUND_Y - 98, 18, 0xffe9a0, 210);
        this.shardFx(mx, GROUND_Y - 98, 7, 0xfff6d0, 300);
        return;
      }
      this.dealToPlayer(base, k, 1.25);
      this.toast(k === 'G' ? 'PARRY BROKEN' : 'ART BREAKS GUARD', '#ff8a6a', 1);
      return;
    }
    if (pa && pa.kind === 'burst' && pp !== 'rec' && k !== 'B') {
      var dd = Math.max(1, Math.round(base * 0.45));
      P.hp = Math.max(0, P.hp - dd); P.flash = 1;
      this.shake(6, 160); sfx('sfx-block');
      this.toast('ART HOLDS', '#ffd76a', 0);
      return;
    }
    if (pa && pa.kind === 'strike' && pp !== 'rec') {
      if (k === 'G') { this.toast('STRIKE BEATS GRAB', '#9fe08a', 0); E.act.resolved = true; this.dealToEnemy(11, 1.1, ''); return; }
      if (k === 'B') { this.dealToPlayer(base, k, 1); this.toast('ART OVERWHELMS', '#ff8a6a', 1); return; }
      if (beatsStance(P.stance, E.stance)) {
        E.act.resolved = true; setAct(E, 'hurt', 0, 0, 340);
        this.toast('STANCE WINS', '#9fe08a', 0);
        this.dealToEnemy(11, 1.15, '');
        return;
      }
      if (beatsStance(E.stance, P.stance)) { this.dealToPlayer(base, k, 1.1); this.toast('STANCE LOST', '#ff8a6a', 1); return; }
      P.hp = Math.max(0, P.hp - 3); E.hp = Math.max(0, E.hp - 3);
      P.breath = Math.min(tuning.breathMax, P.breath + 12);
      setAct(P, 'hurt', 0, 0, 220); setAct(E, 'hurt', 0, 0, 220);
      this.knock(P, -110); this.knock(E, 110);
      this.toast('CLASH', '#dff0ff', 0);
      sfx('sfx-clash'); this.shake(7, 200); this.hitStop(60);
      this.doFlash(0xcfe6ff, 0.24);
      var cx = (posP() + posE()) / 2;
      this.burstFx(cx, GROUND_Y - 100, 16, 0xdff0ff, 230);
      this.shardFx(cx, GROUND_Y - 100, 6, 0xffffff, 280);
      return;
    }
    if (!pa) {
      if (k === 'H' || k === 'L' || k === 'T') {
        var d2 = Math.max(1, Math.round(base * 0.38 * stanceFactor(E.stance, P.stance) * opponentMod.damage));
        P.hp = Math.max(0, P.hp - d2); P.flash = 0.7;
        this.shake(4, 140); sfx('sfx-block');
        this.toast('GUARDED', '#9fb6ff', 0);
        this.ringFx(posP() + 22, GROUND_Y - 100, 0x9fb6ff, 22, 260);
        return;
      }
      this.dealToPlayer(base, k, 1);
      return;
    }
    this.dealToPlayer(base, k, 1.4);
    this.toast('PUNISHED', '#ff8a6a', 1);
  };

  /* ------------------------------------------------ resolution: player */
  proto.playerResolve = function (a) {
    var k = a.kind, dir = a.d;
    if (run.range === 1 && k !== 'burst') {
      this.toast('TOO FAR', '#8fa2c4', 0);
      sfx('sfx-whoosh', 0.6, 0.85);
      this.overextend(180);
      return;
    }
    if (k === 'burst') run.range = 0;
    var ep = phaseOf(E), ek = E.act ? E.act.kind : null;

    if (k === 'burst') {
      if (E.act) E.act.resolved = true;
      sfx('sfx-burst');
      this.doFlash(0xffd76a, 0.5);
      this.shake(15, 320);
      this.hitStop(110);
      run.bursts++;
      this.burstFx(posE(), GROUND_Y - 100, 26, 0xffd76a, 300);
      this.ringFx(posE(), GROUND_Y - 100, 0xffd76a, 56, 460);
      this.ringFx(posE(), GROUND_Y - 100, 0xffffff, 30, 320);
      this.shardFx(posE(), GROUND_Y - 100, 10, 0xfff0c0, 340);
      this.dealToEnemy(24, 1, 'BURST ART');
      return;
    }
    var atk = !!ATTACK_TOKENS[ek];
    if (k === 'grab') {
      sfx('sfx-grab');
      if (ek === 'P' && ep === 'active') { this.dealToEnemy(15, 1, 'GRABBED'); return; }
      if (ep === 'wind' && atk) { this.toast('WHIFF', '#8fa2c4', 0); this.overextend(200); return; }
      if (ep === 'rec' || ek === 'stagger' || ek === 'hurt') { this.dealToEnemy(11, 1.3, 'GRABBED'); return; }
      this.dealToEnemy(8, 1, 'GRABBED');
      return;
    }
    if (ek === 'P' && ep === 'active') {
      setAct(P, 'stagger', 0, 0, 760);
      this.toast('PARRIED', '#ff8a6a', 1);
      sfx('sfx-parry', 0.8, 0.9);
      this.doFlash(0xffe9a0, 0.28);
      this.shake(6, 160);
      run.perfect = false;
      return;
    }
    if (ep === 'wind' && atk) {
      this.grazeEnemy(dir === 'T' ? 8 : 10, 0.25, 'ARMOURED');
      this.overextend(300);
      return;
    }
    if (ep === 'rec' || ek === 'stagger' || ek === 'hurt') {
      this.dealToEnemy(dir === 'T' ? 8 : 10, 1.6, 'PUNISH');
      return;
    }
    if (dir === 'T') { this.dealToEnemy(7, 1, 'THRUST'); return; }
    var gd = (dir === 'H') ? 'high' : 'low';
    if (E.guard === gd) {
      this.grazeEnemy(2, 1, 'BLOCKED');
      this.ringFx(posE() - 20, GROUND_Y - (gd === 'high' ? 128 : 62), 0x9fb6ff, 20, 240);
      this.overextend(200);
      return;
    }
    run.breaks++;
    sfx('sfx-break');
    this.doFlash(0xffd76a, 0.26);
    this.ringFx(posE(), GROUND_Y - 100, 0xffd76a, 34, 340);
    this.dealToEnemy(10, 1.55, 'GUARD BREAK');
  };

  /* ------------------------------------------------------ player actions */
  proto.doStrike = function (dir) {
    var rec = Math.round(300 * tuning.strikeRec);
    setAct(P, 'strike', 150, 90, rec, dir);
    sfx('sfx-whoosh', 0.85, dir === 'H' ? 1.05 : 0.95);
  };
  proto.doParry = function () {
    setAct(P, 'parry', 0, 210 + tuning.parryBonus, 250);
    this.ringFx(posP() + 26, GROUND_Y - 100, 0xdff0ff, 18, 230);
    sfx('sfx-ui', 0.6);
  };
  proto.doGrab = function () {
    setAct(P, 'grab', 230, 110, 470);
    sfx('sfx-whoosh', 0.7, 0.8);
  };
  proto.doEvade = function () {
    setAct(P, 'evade', 0, 240 + tuning.evadeBonus, 150);
    run.range = 1;
    P.breath = Math.min(tuning.breathMax, P.breath + 4);
    this.knock(P, -120);
    this.dustFx(posP(), GROUND_Y, 6, 0x8fa2c4);
    sfx('sfx-whoosh', 0.7, 1.2);
  };
  proto.doDash = function () {
    if (run.range === 0) { this.doStrike('T'); return; }
    if (P.breath < tuning.dashCost) { this.toast('NO BREATH', '#8fa2c4', 0); sfx('sfx-block', 0.5); return; }
    P.breath -= tuning.dashCost;
    run.range = 0;
    run.lastDashAt = run.simTime;
    setAct(P, 'dash', 0, 200, 70);
    this.knock(P, 190);
    this.dustFx(posP() - 30, GROUND_Y, 8, 0x9fd6ff);
    for (var i = 0; i < 6; i++) {
      this.spawn('shard', posP() - i * 12, GROUND_Y - 60 - Math.random() * 70,
        -260 - Math.random() * 120, -10, 260, 0x9fd6ff, 30, 6, 0);
    }
    sfx('sfx-dash');
  };
  proto.doBurst = function () {
    if (P.breath < tuning.burstCost) {
      this.toast('NEED ' + tuning.burstCost + ' BREATH', '#8fa2c4', 0);
      sfx('sfx-block', 0.5);
      return;
    }
    P.breath -= tuning.burstCost;
    setAct(P, 'burst', 260, 120, 360);
    this.ringFx(posP(), GROUND_Y - 100, STANCES[P.stance].color, 26, 420);
    this.burstFx(posP(), GROUND_Y - 100, 14, STANCES[P.stance].color, 150);
    sfx('sfx-gong', 0.8);
  };
  proto.setStance = function (i) {
    if (P.stance === i) return;
    P.stance = i;
    state.stance = STANCES[i].id;
    this.ringFx(posP(), GROUND_Y - 100, STANCES[i].color, 20, 260);
    sfx('sfx-stance', 0.85, 0.9 + i * 0.14);
  };

  proto.consumeIntent = function () {
    if (intent.stanceQueued >= 0) {
      /* a stance swap is always instant, even mid recovery */
      if (this.screen === 'play' && run.freeze <= 0 && run.over <= 0 && !kit.paused) {
        this.setStance(intent.stanceQueued);
      }
      intent.stanceQueued = -1;
    }
    if (!intent.buffer) return;
    if (run.simTime - intent.bufferAt > BUFFER_MS) { intent.buffer = ''; return; }
    if (!this.canAct()) return;
    var a = intent.buffer;
    intent.buffer = '';
    run.lastAction = a;
    if (a === 'high') this.doStrike('H');
    else if (a === 'low') this.doStrike('L');
    else if (a === 'parry') this.doParry();
    else if (a === 'grab') this.doGrab();
    else if (a === 'evade') this.doEvade();
    else if (a === 'dash') this.doDash();
    else if (a === 'burst') this.doBurst();
  };

  /* --------------------------------------------------------- enemy brain */
  var TUTORIAL_STEPS = [
    { need: 'strike', line: 'Swipe up or press the high strike to attack.', token: null, guard: 'low' },
    { need: 'break', line: 'They guard high now. Strike low to break it open.', token: null, guard: 'high' },
    { need: 'parry', line: 'A strike is coming. Tap the arena or press parry.', token: 'H', guard: 'high' },
    { need: 'evade', line: 'Grabs beat parries. Swipe left or press evade.', token: 'G', guard: 'high' },
    { need: 'stance', line: 'Take the stance that beats theirs, then strike.', token: null, guard: 'low' },
    { need: 'burst', line: 'Breath is full. Spend it on a burst art.', token: null, guard: 'high' }
  ];

  proto.nextToken = function () {
    if (run.mode === 'tutorial') {
      var st = TUTORIAL_STEPS[run.tutorialStep];
      return st && st.token ? st.token : 'W';
    }
    var seq = opponent.seq;
    var tk = seq[E.si % seq.length];
    E.si++;
    var loose = clamp(opponent.loose + opponentMod.loose, 0, 0.6);
    if (Math.random() < loose) tk = seq[(Math.random() * seq.length) | 0];
    if (tk === 'R' && run.range === 1) tk = 'H';
    return tk;
  };
  proto.enemyStanceLogic = function (tk) {
    if (run.mode === 'tutorial') return;
    if (opponent.stanceMode === 'cycle') {
      if (tk === 'S' || Math.random() < 0.22) E.stance = (E.stance + 1) % 3;
    } else if (opponent.stanceMode === 'counter') {
      if (tk === 'S' || Math.random() < 0.30) E.stance = (P.stance + 2) % 3;
    }
  };
  proto.enemyStart = function () {
    var tk = this.nextToken();
    if (tk === 'W') { E.wait = 420; return; }
    this.enemyStanceLogic(tk);
    var tell = Math.max(180, opponent.tell * opponentMod.tell);
    if (tk === 'S') {
      setAct(E, 'S', 0, 200, 80);
      this.ringFx(posE(), GROUND_Y - 100, STANCES[E.stance].color, 20, 260);
      sfx('sfx-stance', 0.7, 0.9 + E.stance * 0.14);
      return;
    }
    if (tk === 'R') { setAct(E, 'R', 0, 240, 140); run.range = 1; this.knock(E, 150); sfx('sfx-whoosh', 0.6, 1.1); return; }
    if (tk === 'P') { setAct(E, 'P', 70, 620, 240); return; }
    if (tk === 'G') { setAct(E, 'G', tell * 1.12, 100, 340); }
    else if (tk === 'B') { setAct(E, 'B', tell * 1.5, 120, 430); sfx('sfx-gong', 0.7); }
    else {
      if (opponent.guardMode === 'alt') E.guard = (E.guard === 'high') ? 'low' : 'high';
      else if (opponent.guardMode === 'rand') E.guard = Math.random() < 0.5 ? 'high' : 'low';
      setAct(E, tk, tell, 90, 280);
    }
    if (run.range === 1) run.range = 0;
    sfx('sfx-whoosh', 0.7, 0.95);
  };

  /* ---------------------------------------------------------- sim step */
  proto.stepFighter = function (f, dt, isPlayer) {
    f.flash = Math.max(0, f.flash - dt * 0.005);
    f.hurtT = Math.max(0, f.hurtT - dt);
    f.bob += dt * 0.004;
    f.kvx *= 0.86;
    f.kx += f.kvx * dt * 0.001;
    f.kx *= 0.90;
    if (Math.abs(f.kx) < 0.05) f.kx = 0;
    var a = f.act;
    if (!a) return;
    a.t += dt;
    if (!a.resolved && a.t >= a.win) {
      a.resolved = true;
      if (isPlayer) {
        if (a.kind === 'strike' || a.kind === 'grab' || a.kind === 'burst') this.playerResolve(a);
      } else if (ATTACK_TOKENS[a.kind]) {
        this.enemyResolve(a);
      }
    }
    if (a.t >= a.total) f.act = null;
  };

  var RIBBON_REST = 15;
  proto.stepRibbon = function (f, x, dt) {
    var pts = f.ribbon;
    if (!pts) return;
    var back = f.facing < 0 ? 1 : -1;
    var ax = x + back * 22, ay = GROUND_Y - 176 - Math.sin(f.bob) * 4;
    pts[0].x = ax; pts[0].y = ay;
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i], prev = pts[i - 1];
      var vx = (p.x - p.px) * 0.90, vy = (p.y - p.py) * 0.90;
      p.px = p.x; p.py = p.y;
      p.x += vx + (back * 26 - f.kvx * 0.35) * dt * 0.001;
      p.y += vy + 210 * dt * 0.001;
      var dx = p.x - prev.x, dy = p.y - prev.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      p.x = prev.x + dx / d * RIBBON_REST;
      p.y = prev.y + dy / d * RIBBON_REST;
      if (p.y > GROUND_Y - 4) p.y = GROUND_Y - 4;
    }
  };
  proto.resetRibbon = function (f, x) {
    var pts = f.ribbon;
    if (!pts) return;
    var back = f.facing < 0 ? 1 : -1;
    for (var i = 0; i < pts.length; i++) {
      pts[i].x = pts[i].px = x + back * (22 + i * 7);
      pts[i].y = pts[i].py = GROUND_Y - 176 + i * RIBBON_REST * 0.8;
    }
  };

  proto.simStep = function (dt) {
    run.simTime += dt;

    for (var i = 0; i < PARTICLE_MAX; i++) {
      var p = this.parts[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; p.o.setVisible(false); continue; }
      p.x += p.vx * dt * 0.001;
      p.y += p.vy * dt * 0.001;
      if (p.kind !== 'ring') p.vy += p.g * dt * 0.001;
      p.rot += p.vr * dt * 0.001;
    }
    this.stepWeather(dt * 0.001);

    if (this.screen !== 'play') return;

    this.consumeIntent();
    run.rangeV += (run.range - run.rangeV) * Math.min(1, dt * 0.009);

    if (run.over > 0) {
      run.over -= dt;
      P.downT += dt; E.downT += dt;
      this.stepRibbon(P, posP(), dt);
      this.stepRibbon(E, posE(), dt);
      if (run.over <= 0) { run.over = 0; this.afterRound(); }
      return;
    }
    if (run.freeze > 0) {
      run.freeze -= dt;
      this.stepRibbon(P, posP(), dt);
      this.stepRibbon(E, posE(), dt);
      return;
    }

    run.timeLeft = Math.max(0, run.timeLeft - dt * 0.001);
    run.drillTime += dt * 0.001;
    P.breath = Math.min(tuning.breathMax, P.breath + dt * 0.006);

    this.stepFighter(P, dt, true);
    this.stepFighter(E, dt, false);
    this.stepRibbon(P, posP(), dt);
    this.stepRibbon(E, posE(), dt);

    if (!E.act) {
      E.wait -= dt;
      if (E.wait <= 0) {
        this.enemyStart();
        var gap = Math.max(140, opponent.gap * opponentMod.gap);
        E.wait = gap * (0.85 + Math.random() * 0.3);
      }
    }

    if (run.mode === 'tutorial') this.stepTutorial(dt);
    this.updateCoach();

    if (run.mode === 'trial') { this.checkTrial(); return; }
    if (P.hp <= 0) this.endRound('e');
    else if (E.hp <= 0) this.endRound('p');
    else if (run.timeLeft <= 0) this.endRound('t');
  };

  /* --------------------------------------------------------- duel setup */
  function resolveDuellist(id) {
    var i = DUELLIST_BY_ID[id];
    return DUELLISTS[i == null ? 0 : i];
  }

  proto.prepareDuel = function (mode, opts) {
    run.mode = mode;
    run.round = 1; run.roundsWon = 0; run.roundsLost = 0;
    run.over = 0; run.overKind = '';
    run.cleanHits = 0; run.parries = 0; run.breaks = 0; run.evades = 0;
    run.bursts = 0; run.dashHits = 0; run.stanceHits = 0;
    run.scoreThisDuel = 0; run.metric = 0; run.drillTime = 0;
    run.lastDashAt = -9999; run.perfect = true;
    run.tutorialStep = 0; run.tutorialTimer = 0;

    var stageIdx = 0, mod = { tell: 1, gap: 1, loose: 0, hp: 1, damage: 1 };
    var d = DUELLISTS[0];

    if (mode === 'ladder') {
      run.rung = clamp(opts.rung | 0, 0, LADDER.length - 1);
      var L = LADDER[run.rung];
      d = resolveDuellist(L.duel);
      stageIdx = L.stage;
      mod.tell = L.tell; mod.gap = L.gap; mod.loose = L.loose; mod.hp = L.hp;
      mod.damage = 1 + run.rung * 0.018;
      run.timeLeft = ROUND_SECONDS;
    } else if (mode === 'trial') {
      run.trial = clamp(opts.trial | 0, 0, TRIALS.length - 1);
      var T = TRIALS[run.trial];
      d = resolveDuellist(T.partner.duel);
      stageIdx = 0;
      mod.tell = T.partner.tell; mod.gap = T.partner.gap;
      mod.loose = T.partner.loose; mod.hp = T.partner.hp;
      mod.damage = T.metric === 'survive' ? 0.75 : 0.45;
      run.timeLeft = T.time;
    } else if (mode === 'survival') {
      run.survivalWave = opts.wave | 0;
      var pick = run.survivalWave % DUELLISTS.length;
      d = DUELLISTS[pick];
      stageIdx = Math.min(STAGES.length - 1, Math.floor(run.survivalWave / 3));
      var esc = run.survivalWave * 0.06;
      mod.tell = Math.max(0.62, 1 - esc * 0.7);
      mod.gap = Math.max(0.6, 1 - esc * 0.7);
      mod.loose = Math.min(0.3, esc * 0.5);
      mod.hp = 1 + esc * 0.55;
      mod.damage = 1 + esc * 0.7;
      run.timeLeft = ROUND_SECONDS;
    } else {
      d = DUELLISTS[0];
      stageIdx = 0;
      mod.tell = 1.6; mod.gap = 1.6; mod.hp = 8; mod.damage = 0.35;
      run.timeLeft = 999;
    }

    opponent = d;
    opponentMod = mod;
    run.duelIndex = DUELLIST_BY_ID[d.id] || 0;
    this.setOpponentLook(d);
    this.applyStage(stageIdx);
    state.duellist = d.name;
    this.startRound(true);
    this.playMusic(STAGES[this.stageBaked].music);
  };

  proto.startRound = function (first) {
    var keepStance = first ? 0 : P.stance;
    P = mkFighter(100, keepStance);
    P.ribbon = this.makeRibbon();
    if (!first && tuning.secondWind && run.round >= 3) {
      P.max = 100 + tuning.secondWind;
      P.hp = P.max;
      this.toast('SECOND WIND', '#9fe08a', 0);
    }
    var ehp = Math.round(opponent.hp * opponentMod.hp);
    E = mkFighter(ehp, opponent.stance);
    E.facing = -1;
    E.ribbon = this.makeRibbon();
    E.guard = 'high';
    E.wait = 900;
    run.range = 0; run.rangeV = 0;
    run.over = 0; run.overKind = '';
    run.freeze = 1200;
    run.timeLeft = run.mode === 'trial' ? TRIALS[run.trial].time : (run.mode === 'tutorial' ? 999 : ROUND_SECONDS);
    if (run.mode === 'trial' || run.mode === 'tutorial') run.freeze = 900;
    this.flash = 0;
    for (var i = 0; i < PARTICLE_MAX; i++) { this.parts[i].alive = false; this.parts[i].o.setVisible(false); }
    this.resetRibbon(P, posP());
    this.resetRibbon(E, posE());
    clearIntent();
    state.stance = STANCES[P.stance].id;

    if (run.mode === 'ladder') this.banner('EXCHANGE ' + run.round, opponent.name, 1500);
    else if (run.mode === 'survival') this.banner('WAVE ' + (run.survivalWave + 1), opponent.name, 1400);
    else if (run.mode === 'trial') this.banner(TRIALS[run.trial].name, TRIALS[run.trial].goal, 1600);
    else this.banner('THE FIRST LESSON', 'Learn the forms', 1500);
    if (run.mode === 'tutorial') this.coach(TUTORIAL_STEPS[0].line);
  };

  proto.endRound = function (who) {
    if (run.over) return;
    run.over = 1750;
    run.overKind = who;
    P.downT = 0; E.downT = 0;
    if (who === 'p') {
      run.roundsWon++;
      sfx('sfx-win');
      this.banner('EXCHANGE WON', run.perfect ? 'Untouched' : '', 1500);
      setAct(E, 'down', 0, 0, 4000);
      this.burstFx(posE(), GROUND_Y - 90, 24, 0xffffff, 300);
      this.ringFx(posE(), GROUND_Y - 90, 0xffffff, 60, 520);
    } else if (who === 'e') {
      run.roundsLost++;
      sfx('sfx-ko');
      this.banner('EXCHANGE LOST', opponent.finisher, 1500);
      setAct(P, 'down', 0, 0, 4000);
      this.burstFx(posP(), GROUND_Y - 90, 24, 0xff7a6a, 300);
      this.ringFx(posP(), GROUND_Y - 90, 0xff7a6a, 60, 520);
    } else {
      if (P.hp >= E.hp) { run.roundsWon++; sfx('sfx-win'); this.banner('TIME', 'Exchange won on health', 1500); }
      else { run.roundsLost++; sfx('sfx-ko'); this.banner('TIME', 'Exchange lost on health', 1500); }
    }
    this.shake(18, 340);
    this.doFlash(0xffffff, 0.4);
    this.hitStop(120);
  };

  proto.afterRound = function () {
    if (run.mode === 'survival') {
      if (run.roundsWon >= 2) return this.survivalAdvance();
      if (run.roundsLost >= 2) return this.duelEnd(false);
    } else {
      if (run.roundsWon >= 2) return this.duelEnd(true);
      if (run.roundsLost >= 2) return this.duelEnd(false);
    }
    run.round++;
    run.perfect = true;
    this.startRound(false);
  };

  proto.survivalAdvance = function () {
    run.survivalKills++;
    run.survivalScore += 500 + run.scoreThisDuel;
    run.survivalWave++;
    profile.survivalKills++;
    if (run.survivalWave > profile.survivalBest) {
      profile.survivalBest = run.survivalWave;
      if (run.survivalWave === 3 || run.survivalWave === 6 || run.survivalWave === 10) {
        profile.insight += 4;
        this.toast('INSIGHT +4', '#ffd76a', 0);
      }
    }
    saveNow();
    this.prepareDuel('survival', { wave: run.survivalWave });
  };

  proto.duelEnd = function (won) {
    var self = this;
    this.screen = 'result';
    state.screen = 'result';
    clearIntent();
    var lines = [];
    var title, sub;

    if (run.mode === 'ladder') {
      if (won) {
        profile.wins++;
        if (run.rung + 1 > profile.rungs) {
          profile.rungs = run.rung + 1;
          profile.insight += 3;
          lines.push('Insight gained 3');
        }
        title = run.rung === LADDER.length - 1 ? 'GRANDMASTER' : 'RIVAL YIELDS';
        sub = run.rung === LADDER.length - 1
          ? 'The Silkwind bows. The ascent is complete.'
          : opponent.name + ' yields ' + run.roundsWon + ' to ' + run.roundsLost + '.';
        sfx(run.rung === LADDER.length - 1 ? 'sfx-gong' : 'sfx-win');
      } else {
        profile.losses++;
        title = 'DEFEATED';
        sub = opponent.name + ' wins ' + run.roundsLost + ' to ' + run.roundsWon + '.';
        lines.push(opponent.tip);
        sfx('sfx-lose');
      }
      lines.push('Clean hits ' + run.cleanHits + '   Parries ' + run.parries + '   Guard breaks ' + run.breaks);
    } else if (run.mode === 'survival') {
      profile.losses++;
      title = 'THE WIND TAKES YOU';
      sub = 'Waves cleared ' + run.survivalWave + '.   Best ' + profile.survivalBest + '.';
      lines.push('Score ' + (run.survivalScore | 0));
      sfx('sfx-lose');
    } else if (run.mode === 'tutorial') {
      title = 'FORMS LEARNED';
      sub = 'The Ascent is open to you.';
      if (!profile.tutorial) { profile.tutorial = 1; profile.insight += 3; lines.push('Insight gained 3'); }
      sfx('sfx-gong');
    } else {
      title = 'TRIAL COMPLETE';
      sub = '';
    }
    saveNow();
    retune();
    this.resultTitleText = title;
    this.resultSubText = sub;
    this.resultLines = lines;
    this.resultWon = won;
    this.showResult();
  };

  /* ------------------------------------------------------------ tutorial */
  proto.stepTutorial = function (dt) {
    var st = TUTORIAL_STEPS[run.tutorialStep];
    if (!st) return;
    if (st.guard) E.guard = st.guard;
    if (run.tutorialStep === 4) E.stance = 0;
    if (run.tutorialStep === 5) P.breath = Math.max(P.breath, tuning.burstCost);
    E.hp = Math.max(E.hp, 40);
    P.hp = Math.max(P.hp, 40);

    var done = false;
    if (st.need === 'strike') done = run.cleanHits >= 1;
    else if (st.need === 'break') done = run.breaks >= 1;
    else if (st.need === 'parry') done = run.parries >= 1;
    else if (st.need === 'evade') done = run.evades >= 1;
    else if (st.need === 'stance') done = run.stanceHits >= 1;
    else if (st.need === 'burst') done = run.bursts >= 1;
    if (!done) return;

    run.tutorialStep++;
    run.cleanHits = 0; run.breaks = 0; run.parries = 0;
    run.evades = 0; run.stanceHits = 0; run.bursts = 0;
    sfx('sfx-ui');
    if (run.tutorialStep >= TUTORIAL_STEPS.length) {
      this.duelEnd(true);
      return;
    }
    this.coach(TUTORIAL_STEPS[run.tutorialStep].line);
    this.toast('FORM LEARNED', '#9fe08a', 0);
  };

  /* ------------------------------------------------------- trial grading */
  proto.trialValue = function () {
    var T = TRIALS[run.trial];
    switch (T.metric) {
      case 'clean': return run.cleanHits;
      case 'parry': return run.parries;
      case 'break': return run.breaks;
      case 'evade': return run.evades;
      case 'dashhit': return run.dashHits;
      case 'stancehit': return run.stanceHits;
      case 'burst': return run.bursts;
      case 'survive': return Math.floor(run.drillTime);
      default: return 0;
    }
  };
  proto.checkTrial = function () {
    var T = TRIALS[run.trial];
    run.metric = this.trialValue();
    var out = false;
    if (run.timeLeft <= 0) out = true;
    if (P.hp <= 0) out = true;
    if (E.hp <= 0) { E.hp = Math.max(1, Math.round(opponent.hp * opponentMod.hp * 0.5)); }
    if (!out) return;

    var grade = 0;
    for (var i = 0; i < T.tiers.length; i++) if (run.metric >= T.tiers[i]) grade = i + 1;
    var was = profile.trials[run.trial];
    var gained = 0;
    if (grade > was) { gained = grade - was; profile.trials[run.trial] = grade; profile.insight += gained; }
    saveNow(); retune();

    var names = ['NO GRADE', 'BRONZE', 'SILVER', 'GOLD'];
    this.screen = 'result';
    state.screen = 'result';
    clearIntent();
    this.resultTitleText = names[grade];
    this.resultSubText = T.name + '   score ' + run.metric + ' of ' + T.tiers[2] + ' for gold';
    this.resultLines = gained ? ['Insight gained ' + gained] : ['Best grade held at ' + names[was]];
    this.resultWon = grade > 0;
    sfx(grade > 0 ? 'sfx-win' : 'sfx-lose');
    this.showResult();
  };

  /* ------------------------------------------------------------- coaching */
  proto.updateCoach = function () {
    if (run.mode === 'tutorial') return;
    if (!this.coachOn) return;
    /* Only the first three rungs of the ascent get live coaching, and only on
       the beats that teach a read. It is one thin line that fades on its own.
       Trials and survival are for players who already know the forms. */
    if (run.mode !== 'ladder' || run.rung > 2) return;
    var ek = E.act ? E.act.kind : null, ep = phaseOf(E);
    if (ek === 'B' && ep === 'wind') this.coach('Burst art incoming. Evade, it cannot be parried.');
    else if (ek === 'G' && ep === 'wind') this.coach('Grab incoming. Evade or strike first.');
    else if ((ek === 'H' || ek === 'L' || ek === 'T') && ep === 'wind') this.coach('Strike incoming. Parry on the flash.');
    else if (ek === 'P') this.coach('They are waiting to parry. Grab them.');
    else if (run.range === 1) this.coach('Out of measure. Dash in for ' + tuning.dashCost + ' breath.');
    else if (beatsStance(E.stance, P.stance)) this.coach('Their stance beats yours. Swap to ' + STANCES[(E.stance + 2) % 3].name + '.');
  };

  /* ------------------------------------------------------------- icons */
  function bakeIcon(scene, key, draw) {
    return bake(scene, key, 72, 72, function (ctx) {
      ctx.strokeStyle = '#eaf2ff'; ctx.fillStyle = '#eaf2ff';
      ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      draw(ctx);
    });
  }
  function bakeIcons(scene) {
    bakeIcon(scene, 'ic-high', function (ctx) {
      ctx.beginPath(); ctx.moveTo(18, 40); ctx.lineTo(36, 20); ctx.lineTo(54, 40); ctx.stroke();
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(20, 56); ctx.lineTo(52, 50); ctx.stroke();
    });
    bakeIcon(scene, 'ic-low', function (ctx) {
      ctx.beginPath(); ctx.moveTo(18, 32); ctx.lineTo(36, 52); ctx.lineTo(54, 32); ctx.stroke();
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(20, 18); ctx.lineTo(52, 24); ctx.stroke();
    });
    bakeIcon(scene, 'ic-parry', function (ctx) {
      ctx.beginPath(); ctx.moveTo(36, 14); ctx.lineTo(56, 24); ctx.lineTo(52, 46);
      ctx.lineTo(36, 58); ctx.lineTo(20, 46); ctx.lineTo(16, 24); ctx.closePath(); ctx.stroke();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(28, 34); ctx.lineTo(34, 42); ctx.lineTo(46, 26); ctx.stroke();
    });
    bakeIcon(scene, 'ic-grab', function (ctx) {
      ctx.lineWidth = 5;
      for (var i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(22 + i * 10, 18); ctx.lineTo(22 + i * 10, 38); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(18, 34); ctx.lineTo(18, 48);
      ctx.quadraticCurveTo(18, 60, 34, 60); ctx.quadraticCurveTo(50, 60, 50, 46); ctx.lineTo(50, 26); ctx.stroke();
    });
    bakeIcon(scene, 'ic-dash', function (ctx) {
      ctx.beginPath(); ctx.moveTo(14, 22); ctx.lineTo(32, 36); ctx.lineTo(14, 50); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(34, 22); ctx.lineTo(52, 36); ctx.lineTo(34, 50); ctx.stroke();
    });
    bakeIcon(scene, 'ic-evade', function (ctx) {
      ctx.beginPath(); ctx.moveTo(58, 22); ctx.lineTo(40, 36); ctx.lineTo(58, 50); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(38, 22); ctx.lineTo(20, 36); ctx.lineTo(38, 50); ctx.stroke();
    });
    bakeIcon(scene, 'ic-burst', function (ctx) {
      ctx.lineWidth = 5;
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(36 + Math.cos(a) * 12, 36 + Math.sin(a) * 12);
        ctx.lineTo(36 + Math.cos(a) * 27, 36 + Math.sin(a) * 27);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(36, 36, 8, 0, 6.2832); ctx.fill();
    });
    bakeIcon(scene, 'ic-pause', function (ctx) {
      ctx.fillRect(24, 20, 8, 32); ctx.fillRect(42, 20, 8, 32);
    });
    bakeIcon(scene, 'ic-sword', function (ctx) {
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(20, 52); ctx.lineTo(52, 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, 40); ctx.lineTo(30, 54); ctx.stroke();
    });
    bakeIcon(scene, 'ic-palm', function (ctx) {
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(36, 40, 14, Math.PI, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(22, 40); ctx.lineTo(22, 54); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(50, 40); ctx.lineTo(50, 54); ctx.stroke();
      ctx.beginPath(); ctx.arc(36, 40, 24, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    });
    bakeIcon(scene, 'ic-spear', function (ctx) {
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(16, 56); ctx.lineTo(50, 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(44, 14); ctx.lineTo(58, 16); ctx.lineTo(50, 28); ctx.closePath(); ctx.fill();
    });
  }
  var STANCE_ICONS = ['ic-sword', 'ic-palm', 'ic-spear'];

  /* --------------------------------------------------------------- HUD */
  proto.buildHud = function () {
    var self = this;
    bakeIcons(this);
    var h = this.hud;
    function txt(x, y, size, color, origin, family) {
      var t = self.add.text(x, y, '', {
        fontFamily: family || FONT, fontSize: size + 'px', color: color,
        stroke: '#05070c', strokeThickness: size > 40 ? 6 : 4, resolution: RETINA_FACTOR
      }).setOrigin(origin == null ? 0 : origin, 0.5);
      h.add(t);
      return t;
    }
    function img(x, y, key, w, hh, alpha) {
      var o = self.add.image(x, y, key);
      if (w) o.setDisplaySize(w, hh);
      if (alpha != null) o.setAlpha(alpha);
      h.add(o);
      return o;
    }

    this.hpFrameP = img(24, 44, 'ui-bar', 460, 26).setOrigin(0, 0);
    this.hpFillP = img(28, 57, 'px', 452, 18).setOrigin(0, 0.5).setTint(0x9fe08a);
    this.hpTrailP = img(28, 57, 'px', 452, 18).setOrigin(0, 0.5).setTint(0xff6a6a).setAlpha(0.55);
    this.hud.bringToTop(this.hpFillP);
    this.brFrame = img(24, 82, 'px', 320, 10).setOrigin(0, 0.5).setTint(0x1a2438).setAlpha(0.9);
    this.brFill = img(24, 82, 'px', 320, 10).setOrigin(0, 0.5).setTint(0x7fd4ff);
    this.brMark = img(24 + 320 * 0.5, 82, 'px', 3, 18).setOrigin(0.5, 0.5).setTint(0xffd76a);
    this.nameP = txt(26, 20, 26, '#dfe8ff');
    setTextIfChanged(this.nameP, 'WANDERER');

    this.hpFrameE = img(1256, 44, 'ui-bar', 460, 26).setOrigin(1, 0).setFlipX(true);
    this.hpFillE = img(1252, 57, 'px', 452, 18).setOrigin(1, 0.5).setTint(0xff8a6a);
    this.nameE = txt(1254, 20, 26, '#ffd6c8', 1);

    this.timer = txt(640, 34, 36, '#f2f6ff', 0.5);
    this.pips = [];
    for (var i = 0; i < 4; i++) {
      var px = i < 2 ? 546 + i * 32 : 702 + (i - 2) * 32;
      var p = img(px, 34, 'ui-pip', 26, 26, 0.8);
      var f = img(px, 34, 'ui-pipfill', 26, 26, 0).setTint(i < 2 ? 0x9fe08a : 0xff8a6a);
      this.pips.push({ ring: p, fill: f });
    }

    /* thin coach strip, one line, self fading */
    this.coachPlate = img(640, 130, 'ui-strip', 780, 48, 0).setOrigin(0.5, 0.5);
    this.coachLabel = txt(640, 130, 26, '#cfe0ff', 0.5);
    this.coachLabel.setAlpha(0);

    /* one corner chip at a time */
    this.toastPlate = img(300, 172, 'ui-toast', 340, 50, 0).setOrigin(0.5, 0.5);
    this.toastLabel = txt(300, 172, 26, '#ffe9a0', 0.5);
    this.toastLabel.setAlpha(0);
    this.toastCur = null;

    /* run boundary banner, 60 percent width, centre stage only */
    this.bannerPlate = img(640, 300, 'ui-banner', 768, 132, 0).setOrigin(0.5, 0.5);
    this.bannerTitle = txt(640, 282, 54, '#ffffff', 0.5, SERIF);
    this.bannerSub = txt(640, 330, 26, '#c9d8f2', 0.5);
    this.bannerTitle.setAlpha(0); this.bannerSub.setAlpha(0);

    /* controls */
    this.ctrl = [];
    function button(zone, icon, tint) {
      var plate = img(zone.cx, zone.cy, 'ui-btn', zone.r * 2.16, zone.r * 2.16, 0.62);
      var ic = img(zone.cx, zone.cy, icon, zone.r * 1.24, zone.r * 1.24, 0.94);
      if (tint) { plate.setTint(tint); ic.setTint(tint); }
      var rec = { plate: plate, icon: ic, zone: zone };
      self.ctrl.push(rec);
      return rec;
    }
    this.btnHigh = button(ZONES.high, 'ic-high');
    this.btnLow = button(ZONES.low, 'ic-low');
    this.btnParry = button(ZONES.parry, 'ic-parry');
    this.btnGrab = button(ZONES.grab, 'ic-grab');
    this.btnBurst = button(ZONES.burst, 'ic-burst', 0xffd76a);
    this.btnEvade = button(ZONES.evade, 'ic-evade');
    this.btnDash = button(ZONES.dash, 'ic-dash');
    this.btnPause = button(ZONES.pause, 'ic-pause');

    this.chips = [];
    for (var s = 0; s < 3; s++) {
      var z = ZONES['stance' + s];
      var plate = img(z.x + z.w / 2, z.y + z.h / 2, 'ui-chip', z.w, z.h, 0.7);
      var ic = img(z.x + z.w / 2, z.y + 30, STANCE_ICONS[s], 40, 40, 0.95);
      var lb = txt(z.x + z.w / 2, z.y + 64, 22, STANCES[s].css, 0.5);
      setTextIfChanged(lb, STANCES[s].name);
      plate.setTint(STANCES[s].color);
      ic.setTint(STANCES[s].color);
      this.chips.push({ plate: plate, icon: ic, label: lb });
    }

    /* enemy tell arc and stance mark are drawn into one graphics pass */
    this.tellGfx = this.add.graphics();
    this.hud.add(this.tellGfx);

    this.coachOn = !profile.seen;
  };

  proto.paintHud = function (playing) {
    var i;
    var show = playing;
    setVisibleIfChanged(this.hpFrameP, show);
    setVisibleIfChanged(this.hpFillP, show);
    setVisibleIfChanged(this.hpTrailP, show);
    setVisibleIfChanged(this.hpFrameE, show);
    setVisibleIfChanged(this.hpFillE, show);
    setVisibleIfChanged(this.nameP, show);
    setVisibleIfChanged(this.nameE, show);
    setVisibleIfChanged(this.brFrame, show);
    setVisibleIfChanged(this.brFill, show);
    setVisibleIfChanged(this.brMark, show);
    setVisibleIfChanged(this.timer, show && run.mode !== 'tutorial');
    for (i = 0; i < this.pips.length; i++) {
      setVisibleIfChanged(this.pips[i].ring, show && run.mode !== 'tutorial' && run.mode !== 'trial');
      setVisibleIfChanged(this.pips[i].fill, show && run.mode !== 'tutorial' && run.mode !== 'trial');
    }
    for (i = 0; i < this.ctrl.length; i++) {
      setVisibleIfChanged(this.ctrl[i].plate, show);
      setVisibleIfChanged(this.ctrl[i].icon, show);
    }
    for (i = 0; i < this.chips.length; i++) {
      setVisibleIfChanged(this.chips[i].plate, show);
      setVisibleIfChanged(this.chips[i].icon, show);
      setVisibleIfChanged(this.chips[i].label, show);
    }
    setVisibleIfChanged(this.tellGfx, show);
    if (!show) {
      setAlphaIfChanged(this.coachLabel, 0);
      setAlphaIfChanged(this.coachPlate, 0);
      setAlphaIfChanged(this.toastLabel, 0);
      setAlphaIfChanged(this.toastPlate, 0);
      return;
    }

    var hpFrac = clamp(P.hp / P.max, 0, 1);
    this.hpFillP.setDisplaySize(Math.max(1, 452 * hpFrac), 18);
    setColorIfChanged(this.nameP, hpFrac < 0.3 ? '#ff9a9a' : '#dfe8ff');
    this.hpFillP.setTint(hpFrac < 0.3 ? 0xff6a6a : (hpFrac < 0.6 ? 0xffd76a : 0x9fe08a));
    var trail = this.hpTrailP;
    var target = 452 * hpFrac;
    trail.__w = trail.__w == null ? target : trail.__w + (target - (trail.__w || target)) * 0.12;
    trail.setDisplaySize(Math.max(1, trail.__w), 18);

    var ehpFrac = clamp(E.hp / E.max, 0, 1);
    this.hpFillE.setDisplaySize(Math.max(1, 452 * ehpFrac), 18);
    setTextIfChanged(this.nameE, opponent.name);

    var brFrac = clamp(P.breath / tuning.breathMax, 0, 1);
    this.brFill.setDisplaySize(Math.max(1, 320 * brFrac), 10);
    this.brFill.setTint(P.breath >= tuning.burstCost ? 0xffd76a : 0x7fd4ff);
    this.brMark.setPosition(24 + 320 * (tuning.burstCost / tuning.breathMax), 82);

    setTextIfChanged(this.timer, Math.ceil(run.timeLeft));
    setColorIfChanged(this.timer, run.timeLeft <= 10 ? '#ff8a6a' : '#f2f6ff');
    for (i = 0; i < 2; i++) {
      setAlphaIfChanged(this.pips[i].fill, run.roundsWon > i ? 1 : 0);
      setAlphaIfChanged(this.pips[2 + i].fill, run.roundsLost > i ? 1 : 0);
    }

    /* control affordance: dim what cannot fire right now */
    var can = this.canAct();
    var dim = can ? 0.62 : 0.34;
    for (i = 0; i < this.ctrl.length; i++) {
      if (this.ctrl[i] === this.btnPause) continue;
      setAlphaIfChanged(this.ctrl[i].plate, dim);
      setAlphaIfChanged(this.ctrl[i].icon, can ? 0.94 : 0.5);
    }
    var burstReady = P.breath >= tuning.burstCost;
    setAlphaIfChanged(this.btnBurst.plate, burstReady && can ? 0.9 : 0.28);
    setAlphaIfChanged(this.btnBurst.icon, burstReady && can ? 1 : 0.35);
    var dashReady = run.range === 1 ? P.breath >= tuning.dashCost : true;
    setAlphaIfChanged(this.btnDash.icon, can && dashReady ? 0.94 : 0.4);

    for (i = 0; i < 3; i++) {
      var on = P.stance === i;
      setAlphaIfChanged(this.chips[i].plate, on ? 0.95 : 0.5);
      setAlphaIfChanged(this.chips[i].icon, on ? 1 : 0.55);
      setAlphaIfChanged(this.chips[i].label, on ? 1 : 0.6);
    }

    /* the enemy tell: a filling arc above their head, hand tessellated */
    var g = this.tellGfx;
    g.clear();
    var a = E.act;
    if (a && a.win > 0 && a.t < a.win && ATTACK_TOKENS[a.kind]) {
      var frac = clamp(a.t / a.win, 0, 1);
      var col = a.kind === 'B' ? 0xffd76a : a.kind === 'G' ? 0xff8a6a : 0xdff0ff;
      var ex = posE(), ey = GROUND_Y - 232;
      g.lineStyle(6, col, 0.30);
      this.arcPath(g, ex, ey, 34, -2.36, 0.79);
      g.lineStyle(6, col, 0.95);
      this.arcPath(g, ex, ey, 34, -2.36, -2.36 + 3.15 * frac);
      if (frac > 0.82) {
        g.lineStyle(3, 0xffffff, (frac - 0.82) / 0.18);
        this.arcPath(g, ex, ey, 44, -2.36, 0.79);
      }
    }
    if (a && a.kind === 'P') {
      g.lineStyle(5, 0x9fb6ff, 0.7);
      this.arcPath(g, posE(), GROUND_Y - 232, 30, 0, 6.2832);
    }
  };

  proto.arcPath = function (g, cx, cy, r, a0, a1) {
    var segs = 18;
    g.beginPath();
    for (var i = 0; i <= segs; i++) {
      var a = a0 + (a1 - a0) * (i / segs);
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
  };

  /* ------------------------------------------------------------- render */
  function poseFor(f, isPlayer) {
    var a = f.act;
    if (!a) {
      if (isPlayer) return (Math.sin(f.bob) > 0 ? 0 : 1);
      return f.guard === 'low' ? 3 : 2;
    }
    var ph = phaseOf(f);
    switch (a.kind) {
      case 'strike': return ph === 'wind' ? 4 : (a.d === 'H' ? 5 : a.d === 'L' ? 6 : 7);
      case 'grab': return ph === 'wind' ? 4 : 8;
      case 'burst': return ph === 'wind' ? 4 : 12;
      case 'parry': return 9;
      case 'evade': return 11;
      case 'dash': return 11;
      case 'hurt': return 10;
      case 'stagger': return 10;
      case 'down': return 13;
      case 'H': return ph === 'wind' ? 4 : 5;
      case 'L': return ph === 'wind' ? 4 : 6;
      case 'T': return ph === 'wind' ? 4 : 7;
      case 'G': return ph === 'wind' ? 4 : 8;
      case 'B': return ph === 'wind' ? 4 : 12;
      case 'P': return 9;
      case 'R': return 11;
      case 'S': return 1;
      default: return 0;
    }
  }

  proto.renderFighter = function (sprite, shadow, aura, f, x, isPlayer) {
    var frame = f.stance * POSE_COUNT + poseFor(f, isPlayer);
    if (sprite.frame.name !== frame) sprite.setFrame(frame);
    var lift = (f.act && (f.act.kind === 'dash' || f.act.kind === 'evade' || f.act.kind === 'R')) ? 14 : 0;
    var bobY = f.act ? 0 : Math.sin(f.bob) * 2.4;
    sprite.setPosition(x, GROUND_Y + bobY - lift);
    if (f.flash > 0.02) {
      sprite.setTintFill(0xffffff);
      sprite.__tinted = true;
    } else if (sprite.__tinted) {
      sprite.clearTint();
      sprite.__tinted = false;
    }
    setAlphaIfChanged(sprite, f.hurtT > 0 && Math.floor(f.hurtT / 60) % 2 === 0 ? 0.72 : 1);
    var sc = 1 - 0.10 * run.rangeV;
    shadow.setPosition(x, GROUND_Y + 6 - lift * 0.25);
    shadow.setDisplaySize(150 * sc, 30 * sc);
    setAlphaIfChanged(shadow, 0.62 - lift * 0.012);

    var glow = 0;
    if (f.act && f.act.kind === 'burst') glow = 0.85;
    else if (f.act && f.act.kind === 'B') glow = 0.8;
    else if (f.act && f.act.kind === 'parry' && phaseOf(f) === 'active') glow = 0.55;
    else if (f.breath >= tuning.burstCost && isPlayer) glow = 0.20;
    aura.setPosition(x, GROUND_Y - 100);
    aura.setTint(f.act && (f.act.kind === 'burst' || f.act.kind === 'B') ? 0xffd76a : STANCES[f.stance].color);
    setAlphaIfChanged(aura, glow * (motionOn() ? 1 : 0.6));
  };

  proto.renderRibbon = function (g, f, color) {
    var pts = f.ribbon;
    if (!pts) return;
    g.lineStyle(11, color, 0.14);
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.strokePath();
    g.lineStyle(5, color, 0.62);
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (var j = 1; j < pts.length; j++) g.lineTo(pts[j].x, pts[j].y);
    g.strokePath();
  };

  proto.renderWorld = function (jf) {
    var menuUp = this.menu.visible;
    if (this.world.visible === menuUp) this.world.setVisible(!menuUp);
    if (menuUp) return;
    var playing = this.screen === 'play';
    var dx = jf.dx, dy = jf.dy;
    var depth = run.rangeV;
    this.back.setPosition(VW / 2 + dx * 0.22 - depth * 8, VH / 2 + dy * 0.22);
    this.mid.setPosition(VW / 2 + dx * 0.6 - depth * 30, GROUND_Y + 6 + dy * 0.6);

    var px = posP() + dx, ex = posE() + dx;
    setVisibleIfChanged(this.spriteP, playing);
    setVisibleIfChanged(this.spriteE, playing);
    setVisibleIfChanged(this.shadowP, playing);
    setVisibleIfChanged(this.shadowE, playing);
    setVisibleIfChanged(this.auraP, playing);
    setVisibleIfChanged(this.auraE, playing);
    setVisibleIfChanged(this.gfx, playing);
    if (playing) {
      this.renderFighter(this.spriteP, this.shadowP, this.auraP, P, px, true);
      this.renderFighter(this.spriteE, this.shadowE, this.auraE, E, ex, false);
      this.gfx.clear();
      this.renderRibbon(this.gfx, P, 0xf2f6ff);
      this.renderRibbon(this.gfx, E, opponent.trim);
    }

    for (var i = 0; i < PARTICLE_MAX; i++) {
      var p = this.parts[i];
      if (!p.alive) continue;
      var k = 1 - p.life / p.max;
      var s = lerp(p.s0, p.s1, p.kind === 'ring' ? Math.sqrt(k) : k);
      if (p.kind === 'ring' && s > 190) s = 190;
      p.o.setPosition(p.x + dx, p.y + dy);
      p.o.setDisplaySize(s, p.kind === 'shard' ? Math.max(3, s * 0.25) : s);
      p.o.setAlpha(p.kind === 'ring' ? (1 - k) * 0.85 : clamp(p.life / p.max * 1.4, 0, 1));
      if (p.vr) p.o.setRotation(p.rot);
    }

    if (this.flash > 0.004) {
      this.flashRect.setTint(this.flashColor);
      this.flashRect.setAlpha(Math.min(0.7, this.flash));
      setVisibleIfChanged(this.flashRect, true);
    } else {
      setVisibleIfChanged(this.flashRect, false);
    }
  };

  /* ------------------------------------------------------ transient paint */
  proto.paintTransients = function (dt) {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 0.004);

    if (this.coachT > 0) {
      this.coachT -= dt;
      var ca = this.coachT > 2400 ? (3200 - this.coachT) / 800 : Math.min(1, this.coachT / 900);
      ca = clamp(ca, 0, 1);
      setAlphaIfChanged(this.coachLabel, ca);
      setAlphaIfChanged(this.coachPlate, ca * 0.9);
    } else {
      setAlphaIfChanged(this.coachLabel, 0);
      setAlphaIfChanged(this.coachPlate, 0);
    }

    if (this.toastT > 0) {
      this.toastT -= dt;
      var ta = this.toastT > 700 ? (900 - this.toastT) / 200 : Math.min(1, this.toastT / 260);
      ta = clamp(ta, 0, 1);
      setAlphaIfChanged(this.toastLabel, ta);
      setAlphaIfChanged(this.toastPlate, ta * 0.9);
      if (this.toastT <= 0 && this.toastQueue.length) this.showToast(this.toastQueue.shift());
    } else {
      setAlphaIfChanged(this.toastLabel, 0);
      setAlphaIfChanged(this.toastPlate, 0);
      if (this.toastQueue.length) this.showToast(this.toastQueue.shift());
    }

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      var age = this.bannerHold - this.bannerT;
      var inT = clamp(age / 260, 0, 1);
      /* ease out back on entry, straight fade on exit */
      var eb = motionOn() ? (1 + 2.2 * Math.pow(inT - 1, 3) + 1.2 * Math.pow(inT - 1, 2)) : inT;
      var ba = Math.min(1, Math.min(inT * 2, this.bannerT / 320));
      setAlphaIfChanged(this.bannerPlate, ba * 0.95);
      setAlphaIfChanged(this.bannerTitle, ba);
      setAlphaIfChanged(this.bannerSub, ba);
      this.bannerPlate.setDisplaySize(768 * (0.90 + eb * 0.10), 132);
      this.bannerTitle.setScale(0.92 + eb * 0.08);
    } else {
      setAlphaIfChanged(this.bannerPlate, 0);
      setAlphaIfChanged(this.bannerTitle, 0);
      setAlphaIfChanged(this.bannerSub, 0);
    }
  };

  /* --------------------------------------------------------------- menus */
  var MENU_ROWS = 10, MENU_BTNS = 4;
  var ROW_W = 540, ROW_H = 72;

  proto.buildMenu = function () {
    var self = this;
    var m = this.menu;
    this.menuScrim = this.add.image(VW / 2, VH / 2, 'ui-scrim').setDisplaySize(VW, VH);
    m.add(this.menuScrim);
    this.menuGlow = this.add.image(VW / 2, 300, 'p-glow').setDisplaySize(1100, 700)
      .setAlpha(0.12).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff9fb0);
    m.add(this.menuGlow);

    function txt(x, y, size, color, origin, family) {
      var t = self.add.text(x, y, '', {
        fontFamily: family || FONT, fontSize: size + 'px', color: color,
        stroke: '#05070c', strokeThickness: size > 40 ? 6 : 3, resolution: RETINA_FACTOR
      }).setOrigin(origin == null ? 0 : origin, 0.5);
      m.add(t);
      return t;
    }
    this.menuTitle = txt(640, 92, 62, '#ffffff', 0.5, SERIF);
    this.menuSub = txt(640, 146, 26, '#b9c9e4', 0.5);
    this.menuFoot = txt(640, 178, 21, '#7f8ea8', 0.5);

    this.rows = [];
    for (var i = 0; i < MENU_ROWS; i++) {
      var col = i < 5 ? 0 : 1;
      var x = col === 0 ? 60 : 680;
      var y = 200 + (i % 5) * 80;
      var plate = this.add.image(x, y, 'ui-row').setOrigin(0, 0).setDisplaySize(ROW_W, ROW_H);
      m.add(plate);
      var label = txt(x + 22, y + 26, 28, '#eaf2ff');
      var note = txt(x + 22, y + 52, 21, '#93a6c4');
      var badge = txt(x + ROW_W - 26, y + 36, 24, '#ffd76a', 1);
      this.rows.push({ plate: plate, label: label, note: note, badge: badge, x: x, y: y });
    }

    this.btns = [];
    for (var b = 0; b < MENU_BTNS; b++) {
      var bx = 64 + b * 304;
      var plate2 = this.add.image(bx, 628, 'ui-wide').setOrigin(0, 0).setDisplaySize(280, 80);
      m.add(plate2);
      var lab2 = txt(bx + 140, 668, 28, '#eaf2ff', 0.5);
      this.btns.push({ plate: plate2, label: lab2, x: bx, y: 628, w: 280, h: 80 });
    }

    this.menuItems = [];
    this.menuButtons = [];
    this.menuIndex = 0;
    this.menu.setVisible(false);
  };

  proto.showMenu = function (kind, title, sub, items, buttons, foot) {
    this.menuKind = kind;
    this.menuItems = items || [];
    this.menuButtons = buttons || [];
    this.menuIndex = 0;
    for (var i = 0; i < this.menuItems.length; i++) {
      if (this.menuItems[i].enabled !== false) { this.menuIndex = i; break; }
    }
    setTextIfChanged(this.menuTitle, title);
    setTextIfChanged(this.menuSub, sub || '');
    setTextIfChanged(this.menuFoot, foot || '');
    this.menu.setVisible(true);
    this.paintMenu();
  };

  proto.paintMenu = function () {
    var i;
    var single = this.menuItems.length <= 5;
    for (i = 0; i < MENU_ROWS; i++) {
      var r = this.rows[i];
      var it = this.menuItems[i];
      var on = !!it;
      setVisibleIfChanged(r.plate, on);
      setVisibleIfChanged(r.label, on);
      setVisibleIfChanged(r.note, on);
      setVisibleIfChanged(r.badge, on);
      var x = single ? 370 : (i < 5 ? 60 : 680);
      if (r.x !== x) {
        r.x = x;
        r.plate.setPosition(x, r.y);
        r.label.setPosition(x + 22, r.y + 26);
        r.note.setPosition(x + 22, r.y + 52);
        r.badge.setPosition(x + ROW_W - 26, r.y + 36);
      }
      if (!on) continue;
      setTextIfChanged(r.label, it.label);
      setTextIfChanged(r.note, it.note || '');
      setTextIfChanged(r.badge, it.badge || '');
      var enabled = it.enabled !== false;
      var sel = i === this.menuIndex && enabled;
      setAlphaIfChanged(r.plate, enabled ? (sel ? 1 : 0.78) : 0.34);
      setAlphaIfChanged(r.label, enabled ? 1 : 0.4);
      setAlphaIfChanged(r.note, enabled ? 0.9 : 0.3);
      setAlphaIfChanged(r.badge, enabled ? 1 : 0.3);
      r.plate.setTint(sel ? 0xbcd6ff : 0xffffff);
      setColorIfChanged(r.badge, it.badgeColor || '#ffd76a');
    }
    for (i = 0; i < MENU_BTNS; i++) {
      var b = this.btns[i];
      var bt = this.menuButtons[i];
      setVisibleIfChanged(b.plate, !!bt);
      setVisibleIfChanged(b.label, !!bt);
      if (!bt) continue;
      setTextIfChanged(b.label, bt.label);
      setAlphaIfChanged(b.plate, 0.92);
      setAlphaIfChanged(b.label, 1);
    }
    var n = this.menuButtons.length;
    if (n) {
      var total = n * 280 + (n - 1) * 24;
      var startX = (VW - total) / 2;
      for (i = 0; i < n; i++) {
        var bb = this.btns[i];
        bb.x = startX + i * 304;
        bb.plate.setPosition(bb.x, bb.y);
        bb.label.setPosition(bb.x + 140, bb.y + 40);
      }
    }
  };

  proto.hideMenu = function () { this.menu.setVisible(false); };

  proto.onMenuTap = function (x, y) {
    if (!this.menu.visible) return;
    var i;
    for (i = 0; i < this.menuItems.length && i < MENU_ROWS; i++) {
      var r = this.rows[i], it = this.menuItems[i];
      if (it.enabled === false) continue;
      if (x >= r.x && x <= r.x + ROW_W && y >= r.y && y <= r.y + ROW_H) {
        this.menuIndex = i; sfx('sfx-ui'); this.paintMenu();
        if (it.action) it.action();
        return;
      }
    }
    for (i = 0; i < this.menuButtons.length && i < MENU_BTNS; i++) {
      var b = this.btns[i], bt = this.menuButtons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        sfx('sfx-ui');
        if (bt.action) bt.action();
        return;
      }
    }
  };
  proto.menuMove = function (dir) {
    if (!this.menu.visible || !this.menuItems.length) return;
    var n = this.menuItems.length;
    for (var k = 0; k < n; k++) {
      this.menuIndex = (this.menuIndex + dir + n) % n;
      if (this.menuItems[this.menuIndex].enabled !== false) break;
    }
    sfx('sfx-ui', 0.5);
    this.paintMenu();
  };
  proto.menuPrimary = function () {
    if (!this.menu.visible) return;
    var it = this.menuItems[this.menuIndex];
    if (it && it.enabled !== false && it.action) { sfx('sfx-ui'); it.action(); return; }
    if (this.menuButtons.length && this.menuButtons[0].action) { sfx('sfx-ui'); this.menuButtons[0].action(); }
  };
  proto.menuBack = function () {
    if (!this.menu.visible) return;
    var last = this.menuButtons[this.menuButtons.length - 1];
    if (last && last.action) { sfx('sfx-ui'); last.action(); }
  };

  /* --------------------------------------------------------- the screens */
  proto.showTitle = function () {
    var self = this;
    this.screen = 'title';
    state.screen = 'title';
    state.mode = 'menu';
    clearIntent();
    this.playMusic('music-menu');
    this.menuGlow.setTint(0xff9fb0);
    var pct = Math.round(profile.rungs / LADDER.length * 100);
    var items = [
      { label: 'THE ASCENT', note: 'Eighteen duels, eight rivals, four peaks.', badge: pct + '%', action: function () { self.showLadder(); } },
      { label: 'TRIAL OF FORMS', note: 'Graded drills. Earn insight.', badge: self.trialScore() + '/24', action: function () { self.showTrials(); } },
      { label: 'SURVIVAL', note: 'One breath against an endless line.', badge: 'BEST ' + profile.survivalBest, action: function () { self.startSurvival(); } },
      { label: 'TECHNIQUES', note: 'Spend insight on lasting forms.', badge: insightFree() + ' FREE', action: function () { self.showTech(); } }
    ];
    var buttons = [
      { label: 'SETTINGS', action: function () { self.openSettings(); } },
      { label: profile.tutorial ? 'THE FIRST LESSON' : 'START HERE', action: function () { self.startTutorial(); } }
    ];
    this.showMenu('title', 'SILKWIND', 'Three stances. One breath. Read the tell.', items, buttons,
      'Keys: arrows strike and step, J parry, K grab, space burst, 1 to 3 stance, P pause.');
  };

  proto.playMusic = function (name) {
    this.pendingMusic = name;
    if (this.audioStarted) kit.audio.music(name, 900);
  };

  proto.trialScore = function () {
    var s = 0;
    for (var i = 0; i < profile.trials.length; i++) s += profile.trials[i];
    return s;
  };

  proto.showLadder = function () {
    var self = this;
    this.screen = 'ladder';
    state.screen = 'ladder';
    var page = this.menuPage || 0;
    var start = page * MENU_ROWS;
    var items = [];
    for (var i = start; i < Math.min(LADDER.length, start + MENU_ROWS); i++) {
      (function (idx) {
        var L = LADDER[idx];
        var d = resolveDuellist(L.duel);
        var unlocked = idx <= profile.rungs;
        var cleared = idx < profile.rungs;
        items.push({
          label: (idx + 1) + '. ' + d.name,
          note: L.label + '  ' + STAGES[L.stage].name,
          badge: cleared ? 'CLEARED' : (idx === profile.rungs ? 'NEXT' : 'LOCKED'),
          badgeColor: cleared ? '#9fe08a' : (idx === profile.rungs ? '#ffd76a' : '#7f8ea8'),
          enabled: unlocked,
          action: function () { self.startLadder(idx); }
        });
      })(i);
    }
    var buttons = [];
    if (LADDER.length > MENU_ROWS) {
      buttons.push({
        label: page ? 'RUNGS 1 TO 10' : 'RUNGS 11 TO 18',
        action: function () { self.menuPage = page ? 0 : 1; self.showLadder(); }
      });
    }
    buttons.push({ label: 'BACK', action: function () { self.menuPage = 0; self.showTitle(); } });
    this.showMenu('ladder', 'THE ASCENT', 'Cleared ' + profile.rungs + ' of ' + LADDER.length +
      '.   Duels won ' + profile.wins + ', lost ' + profile.losses + '.', items, buttons);
  };

  proto.showTrials = function () {
    var self = this;
    this.screen = 'trials';
    state.screen = 'trials';
    var names = ['NONE', 'BRONZE', 'SILVER', 'GOLD'];
    var colors = ['#7f8ea8', '#d09a6a', '#c9d4e4', '#ffd76a'];
    var items = [{
      label: 'THE FIRST LESSON',
      note: 'Interactive tutorial. Six forms, one partner.',
      badge: profile.tutorial ? 'LEARNED' : 'NEW',
      badgeColor: profile.tutorial ? '#9fe08a' : '#ffd76a',
      action: function () { self.startTutorial(); }
    }];
    for (var i = 0; i < TRIALS.length; i++) {
      (function (idx) {
        var T = TRIALS[idx];
        items.push({
          label: T.name,
          note: T.goal,
          badge: names[profile.trials[idx]],
          badgeColor: colors[profile.trials[idx]],
          action: function () { self.startTrial(idx); }
        });
      })(i);
    }
    this.showMenu('trials', 'TRIAL OF FORMS', 'Graded drills. Every new grade pays insight.',
      items, [{ label: 'BACK', action: function () { self.showTitle(); } }],
      'Bronze, silver and gold each pay one insight the first time you reach them.');
  };

  proto.showTech = function () {
    var self = this;
    this.screen = 'tech';
    state.screen = 'tech';
    var items = [];
    for (var i = 0; i < TECHNIQUES.length; i++) {
      (function (idx) {
        var T = TECHNIQUES[idx];
        var owned = techOn(T.id);
        var afford = insightFree() >= T.cost;
        items.push({
          label: T.name,
          note: T.note,
          badge: owned ? 'LEARNED' : T.cost + ' INSIGHT',
          badgeColor: owned ? '#9fe08a' : (afford ? '#ffd76a' : '#7f8ea8'),
          enabled: !owned && afford,
          action: function () {
            if (techOn(T.id) || insightFree() < T.cost) return;
            profile.tech[T.id] = 1;
            profile.spent += T.cost;
            saveNow(); retune();
            sfx('sfx-gong', 0.8);
            self.showTech();
          }
        });
      })(i);
    }
    this.showMenu('tech', 'TECHNIQUES', 'Insight free ' + insightFree() + ' of ' + profile.insight + ' earned.',
      items, [{ label: 'BACK', action: function () { self.showTitle(); } }]);
  };

  proto.showResult = function () {
    var self = this;
    var items = [];
    for (var i = 0; i < this.resultLines.length && i < 4; i++) {
      items.push({ label: this.resultLines[i], note: '', enabled: false });
    }
    var buttons = [];
    if (run.mode === 'ladder') {
      if (this.resultWon && run.rung + 1 < LADDER.length) {
        buttons.push({ label: 'NEXT RIVAL', action: function () { self.startLadder(run.rung + 1); } });
      }
      buttons.push({ label: 'REMATCH', action: function () { self.startLadder(run.rung); } });
      buttons.push({ label: 'THE ASCENT', action: function () { self.showLadder(); } });
    } else if (run.mode === 'trial') {
      buttons.push({ label: 'RETRY', action: function () { self.startTrial(run.trial); } });
      buttons.push({ label: 'TRIALS', action: function () { self.showTrials(); } });
    } else if (run.mode === 'survival') {
      buttons.push({ label: 'AGAIN', action: function () { self.startSurvival(); } });
      buttons.push({ label: 'TITLE', action: function () { self.showTitle(); } });
    } else {
      buttons.push({ label: 'THE ASCENT', action: function () { self.showLadder(); } });
      buttons.push({ label: 'TITLE', action: function () { self.showTitle(); } });
    }
    this.menuGlow.setTint(this.resultWon ? 0x9fe08a : 0xff6a6a);
    this.showMenu('result', this.resultTitleText, this.resultSubText, items, buttons);
  };

  /* --------------------------------------------------------- mode starts */
  proto.enterPlay = function () {
    this.screen = 'play';
    state.screen = 'play';
    this.hideMenu();
    this.coachOn = !profile.seen;
  };
  proto.startLadder = function (idx) {
    state.mode = 'ladder';
    this.enterPlay();
    this.prepareDuel('ladder', { rung: idx });
  };
  proto.startTrial = function (idx) {
    state.mode = 'trial';
    this.enterPlay();
    this.prepareDuel('trial', { trial: idx });
  };
  proto.startSurvival = function () {
    state.mode = 'survival';
    run.survivalScore = 0; run.survivalKills = 0;
    this.enterPlay();
    this.prepareDuel('survival', { wave: 0 });
  };
  proto.startTutorial = function () {
    state.mode = 'tutorial';
    this.enterPlay();
    this.prepareDuel('tutorial', {});
  };
  proto.restartDuel = function () {
    if (run.mode === 'ladder') this.startLadder(run.rung);
    else if (run.mode === 'trial') this.startTrial(run.trial);
    else if (run.mode === 'survival') this.startSurvival();
    else this.startTutorial();
  };
  proto.returnToTitle = function () {
    if (kit.paused) kit.resume('menu');
    this.showTitle();
  };

  /* ---------------------------------------------------------- pause flow */
  proto.togglePause = function () {
    if (this.screen === 'play') kit.pause('menu');
    else if (this.screen === 'pause') kit.resume('menu');
  };
  proto.onKitPause = function () {
    if (this.screen !== 'play') return;
    this.screen = 'pause';
    state.screen = 'pause';
    clearIntent();
    this.showPause();
  };
  proto.onKitResume = function () {
    if (this.screen !== 'pause') return;
    this.screen = 'play';
    state.screen = 'play';
    clearIntent();
    this.hideMenu();
  };
  proto.showPause = function () {
    var self = this;
    this.menuGlow.setTint(0x9fb6ff);
    var items = [
      { label: 'RESUME', note: 'Back to the duel.', action: function () { kit.resume('menu'); } },
      { label: 'RESTART DUEL', note: 'Start this fight again from the first exchange.', action: function () { kit.resume('menu'); self.restartDuel(); } },
      { label: 'SETTINGS', note: 'Sound, screen shake, coaching.', action: function () { self.openSettings(); } },
      { label: 'LEAVE THE DUEL', note: 'Return to the title. Progress is kept.', action: function () { kit.resume('menu'); self.showTitle(); } }
    ];
    var sub = run.mode === 'ladder'
      ? LADDER[run.rung].label + '   ' + STAGES[run.stageIndex].name
      : STAGES[run.stageIndex].name;
    this.showMenu('pause', 'PAUSED', sub, items, []);
  };
  proto.openSettings = function () {
    var self = this;
    kit.openSettings([function (box, row) {
      row('Coach hints', function () { return self.coachOn; }, function (v) {
        self.coachOn = v; profile.seen = v ? 0 : 1; saveNow();
      });
      row('Reset all progress', function () { return self.resetConfirm > 0; }, function (v) {
        if (!v) { self.resetConfirm = 0; return; }
        self.resetConfirm++;
        if (self.resetConfirm >= 2) {
          profile = freshSave();
          saveNow(); retune();
          self.resetConfirm = 0;
          self.coachOn = true;
        }
      });
    }]);
  };

  /* ------------------------------------------------------- headless hooks */
  proto.applyBridgeForces = function (initial) {
    if (bridge.forceStage != null) {
      var s = bridge.forceStage;
      var idx = typeof s === 'number' ? s : STAGE_BY_ID[s];
      if (idx != null) this.applyStage(idx);
      bridge.forceStage = null;
    }
    if (bridge.forceMode != null) {
      var m = String(bridge.forceMode);
      bridge.forceMode = null;
      if (m === 'ladder') this.startLadder(Math.min(profile.rungs, LADDER.length - 1));
      else if (m === 'trial') this.startTrial(0);
      else if (m === 'survival') this.startSurvival();
      else if (m === 'tutorial') this.startTutorial();
      else if (m === 'title') this.showTitle();
      else if (m === 'ladder-last') this.startLadder(LADDER.length - 1);
    }
    if (bridge.forceWin) {
      bridge.forceWin = false;
      if (this.screen === 'play') { E.hp = 0; run.roundsWon = 1; this.endRound('p'); }
    }
    if (initial) return;
  };

  proto.syncState = function () {
    state.mode = run.mode;
    state.stage = STAGES[run.stageIndex] ? STAGES[run.stageIndex].id : '';
    state.stageIndex = run.stageIndex;
    state.rung = run.rung;
    state.rungsCleared = profile.rungs;
    state.duellist = opponent.name;
    state.round = run.round;
    state.roundsWon = run.roundsWon;
    state.roundsLost = run.roundsLost;
    state.hp = Math.round(P.hp);
    state.hpMax = P.max;
    state.enemyHp = Math.round(E.hp);
    state.enemyHpMax = E.max;
    state.breath = Math.round(P.breath);
    state.stance = STANCES[P.stance].id;
    state.score = Math.round(run.mode === 'survival' ? run.survivalScore : run.scoreThisDuel);
    state.insight = profile.insight;
    state.timer = Math.ceil(run.timeLeft);
    state.techniques = TECHNIQUES.reduce(function (a, t) { return a + (profile.tech[t.id] ? 1 : 0); }, 0);
  };

  /* --------------------------------------------------------------- loop */
  proto.update = function (time, delta) {
    var dt = delta;
    if (!(dt > 0)) dt = STEP_MS;
    if (dt > 100) dt = 100;

    var jf = kit.juice.frame();
    if (!kit.paused && !jf.frozen) {
      this.accum += dt;
      var steps = 0;
      while (this.accum >= STEP_MS && steps < MAX_STEPS) {
        this.simStep(STEP_MS);
        this.accum -= STEP_MS;
        steps++;
      }
      if (this.accum > STEP_MS * MAX_STEPS) this.accum = 0;
    }

    this.paintTransients(dt);
    this.renderWorld(jf);
    this.paintHud(this.screen === 'play');
    this.syncState();
    this.applyBridgeForces(false);
  };

  /* ------------------------------------------------------------- launch */
  var config = {
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#070910',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: VW, height: VH },
    /* antialias keeps LINEAR texture filtering for the scaled procedural
       sheets; antialiasGL false skips the multisampled context, which is
       ruinous on software rasterisers. */
    render: { antialias: true, antialiasGL: false, powerPreference: 'high-performance' },
    scene: [MainScene]
  };
  config.scale.width = Math.round(VW * RETINA_FACTOR);
  config.scale.height = Math.round(VH * RETINA_FACTOR);
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
  var game = new Phaser.Game(config);
  bridge.game = game;
})();
