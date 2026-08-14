/* STOMP CIRCUIT
 * Phaser 3 arena driving. GGKit owns lifecycle, pointer identity, saves,
 * audio, accessibility juice, loading, settings, and PWA registration.
 * The field is authored from vector primitives so the truck, arenas, props,
 * crowd, and impact language remain original IP with a small payload.
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  var MAX_FX = 180;
  var COMBO_WINDOW = 3.6;
  var GRAVITY = 1120;
  var TRUCK_HALF = 54;
  var WHEEL_R = 17;

  var C = {
    ink: 0x0b0e15, paper: 0xf7f2e8, fog: 0xa9b1bf, line: 0x263040,
    cyan: 0x58e4df, aqua: 0x85fff1, amber: 0xffca68, orange: 0xff8c4f,
    red: 0xff5e61, violet: 0xd994ff, green: 0x80edab, steel: 0x40516a
  };

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

  var ARENAS = [
    {
      id: 'stadium-bowl', name: 'STADIUM BOWL', location: 'CROWNPOINT STADIUM',
      tagline: 'Concrete thunder and a wall-to-wall crowd.', accent: C.cyan, hot: C.amber,
      width: 5200, base: 500, signature: { x: 2860, kind: 'bowl', name: 'THE BOWL DROP' },
      profile: [[0,500],[430,500],[600,450],[760,330],[930,500],[1190,500],[1350,430],[1530,430],[1700,500],[1930,500],[2080,370],[2260,500],[2520,500],[2700,450],[2940,450],[3140,500],[3500,500],[3660,370],[3840,500],[4180,500],[4380,440],[4630,500],[5200,500]],
      gaps: [{x:1835,w:90},{x:3330,w:120}],
      ramps: [{x:560,w:370,kind:'kicker'},{x:1250,w:350,kind:'table'},{x:1980,w:330,kind:'kicker'},{x:3520,w:340,kind:'wall'}],
      rows: [{x:1030,count:5,spacing:72,tier:1},{x:2320,count:7,spacing:66,tier:1},{x:4000,count:6,spacing:72,tier:2}],
      checkpoints: [650,1450,2080,2940,3660,4440],
      secret: {x:3000,w:230,label:'UPPER DECK CUT'}, crowd: 1
    },
    {
      id: 'junkyard-sprawl', name: 'JUNKYARD SPRAWL', location: 'RUSTBELT SALVAGE',
      tagline: 'Loose steel, stacked wrecks, and a shortcut through the press.', accent: C.orange, hot: C.amber,
      width: 5400, base: 510, signature: { x: 3050, kind: 'crusher', name: 'THE MAGNET DROP' },
      profile: [[0,510],[480,510],[650,470],[810,510],[1060,510],[1190,405],[1400,510],[1650,510],[1800,455],[1980,510],[2240,510],[2450,390],[2640,510],[2900,510],[3140,440],[3380,510],[3650,510],[3840,420],[4020,510],[4280,510],[4480,455],[4680,510],[5400,510]],
      gaps: [{x:1510,w:125},{x:2770,w:150},{x:4120,w:110}],
      ramps: [{x:1120,w:270,kind:'scrap'},{x:2320,w:330,kind:'scrap'},{x:3700,w:330,kind:'scrap'},{x:4400,w:260,kind:'kicker'}],
      rows: [{x:700,count:6,spacing:62,tier:1},{x:1670,count:9,spacing:60,tier:1},{x:3180,count:8,spacing:62,tier:2},{x:4780,count:7,spacing:60,tier:2}],
      checkpoints: [680,1330,2050,2600,3850,4540],
      secret: {x:2160,w:300,label:'MAGNET TUNNEL'}, crowd: 0.55
    },
    {
      id: 'canyon-rim', name: 'CANYON RIM', location: 'REDLINE RESERVE',
      tagline: 'Big gaps, thin air, and the long way around.', accent: C.orange, hot: C.red,
      width: 5700, base: 505, signature: { x: 3330, kind: 'canyon', name: 'THE RIM BREAK' },
      profile: [[0,505],[420,505],[610,430],[820,505],[1120,505],[1310,350],[1500,505],[1780,505],[1930,405],[2110,505],[2400,505],[2630,315],[2830,505],[3090,505],[3310,405],[3520,505],[3800,505],[3970,335],[4180,505],[4470,505],[4680,390],[4880,505],[5200,505],[5700,505]],
      gaps: [{x:950,w:190},{x:2180,w:210},{x:3570,w:180},{x:4920,w:220}],
      ramps: [{x:540,w:330,kind:'rim'},{x:1240,w:380,kind:'rim'},{x:2470,w:430,kind:'rim'},{x:3840,w:380,kind:'rim'},{x:4540,w:340,kind:'rim'}],
      rows: [{x:1030,count:5,spacing:70,tier:1},{x:1740,count:6,spacing:70,tier:1},{x:3040,count:5,spacing:74,tier:2},{x:4250,count:8,spacing:68,tier:2}],
      checkpoints: [700,1450,2670,3440,4020,4760],
      secret: {x:2860,w:300,label:'RAVINE LOW LINE'}, crowd: 0.35
    },
    {
      id: 'night-show-ring', name: 'NIGHT SHOW RING', location: 'LUMEN FAIRGROUNDS',
      tagline: 'A neon ring built for one impossible encore.', accent: C.violet, hot: C.amber,
      width: 5500, base: 510, signature: { x: 2730, kind: 'ring', name: 'THE LIGHT LOOP' },
      profile: [[0,510],[430,510],[600,450],[790,510],[1040,510],[1220,420],[1430,510],[1710,510],[1880,445],[2070,510],[2320,510],[2500,380],[2690,510],[2920,510],[3110,405],[3320,510],[3600,510],[3780,430],[3990,510],[4260,510],[4440,365],[4630,510],[4900,510],[5100,430],[5500,510]],
      gaps: [{x:1480,w:110},{x:2140,w:130},{x:3440,w:120},{x:4720,w:145}],
      ramps: [{x:1120,w:330,kind:'light'},{x:1780,w:300,kind:'light'},{x:2410,w:370,kind:'light'},{x:3660,w:350,kind:'light'},{x:4320,w:390,kind:'light'}],
      rows: [{x:850,count:6,spacing:64,tier:1},{x:1540,count:7,spacing:64,tier:1},{x:3010,count:8,spacing:62,tier:2},{x:4100,count:7,spacing:64,tier:2}],
      checkpoints: [720,1300,1920,2590,3760,4490],
      secret: {x:3190,w:260,label:'BLACKLIGHT LINE'}, crowd: 1.2
    }
  ];

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

  function validSave(v) {
    if (!v || v.version !== 1) return false;
    if (!Number.isInteger(v.unlockedArena) || v.unlockedArena < 1 || v.unlockedArena > 4) return false;
    if (!Number.isInteger(v.unlockedEvent) || v.unlockedEvent < 1 || v.unlockedEvent > 4) return false;
    return !!v.medals && typeof v.medals === 'object';
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

  var DEFAULT_PROFILE = { version: 1, unlockedArena: 1, unlockedEvent: 1, medals: {}, best: 0, runs: 0 };
  var profile = kit.save.get(DEFAULT_PROFILE);
  if (!profile.medals) profile.medals = {};
  function saveProfile() { kit.save.set(profile); }
  function eventIndex(id) { for (var i = 0; i < EVENTS.length; i++) if (EVENTS[i].id === id) return i; return 0; }
  function arenaIndex(id) { for (var i = 0; i < ARENAS.length; i++) if (ARENAS[i].id === id) return i; return 0; }
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

  function makeRuntimeArena(def) {
    var a = { def: def, props: [], pickups: [], gates: [], width: def.width, groundAt: null };
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
      a.props.push({ x: x, y: g.y, w: type === 'bus' ? 108 : 58, h: type === 'bus' ? 58 : 35 + tier * 12,
        type: type || 'car', tier: tier || 0, deform: 0, wobble: 0, live: true,
        render: { x: x, y: g.y, sx: 1, sy: 1, rot: 0 } });
    }
    for (var ri = 0; ri < def.rows.length; ri++) {
      var row = def.rows[ri];
      for (var ci = 0; ci < row.count; ci++) prop(row.x + ci * row.spacing, row.tier + (ci % 3 === 0 ? 1 : 0), ci === row.count - 1 ? 'bus' : 'car');
    }
    var types = ['flare', 'boost', 'time', 'flare', 'boost', 'flare'];
    for (var pi = 0; pi < def.width - 500; pi += 330) {
      var px = 310 + pi + (rng() - 0.5) * 90;
      a.pickups.push({ x: px, y: groundAt(px).y - 82 - (rng() * 36), type: types[(pi / 330 | 0) % types.length], live: true, phase: rng() * TAU, render: { x: px, y: 0, s: 1 } });
    }
    for (var gi2 = 0; gi2 < def.checkpoints.length; gi2++) a.gates.push({ x: def.checkpoints[gi2], live: true, render: { pulse: 0 } });
    return a;
  }

  function newTruck(x, y) {
    return {
      x: x, y: y, vx: 0, vy: 0, angle: 0, av: 0, grounded: true, wasGrounded: true,
      surfaceAngle: 0, charge: 0, launchCharge: 0, airTime: 0, spinAccum: 0, flipCount: 0,
      wheelie: 0, boost: 32, engine: 0, wheels: [
        { x: 0, y: 0, compression: 0 }, { x: 0, y: 0, compression: 0 }
      ], render: { x: x, y: y, angle: 0, wheelSpin: 0, squash: 0 }
    };
  }

  function makeFx() {
    return { active: false, type: 'spark', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1,
      size: 3, color: C.paper, render: { x: 0, y: 0, alpha: 1, size: 3 } };
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
      this.selectedArena = forcedArena() == null ? 0 : forcedArena();
      this.selectedEvent = forcedEvent() || 'freestyle';
      this.runtime = null;
      this.truck = null;
      this.run = null;
      this.clock = 0;
      this.acc = 0;
      this.paused = false;
      this.motion = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.motionBase = this.motion;
      this.prev = { enter: false, left: false, right: false, esc: false, up: false, down: false };
      this.fx = [];
      for (var fi = 0; fi < MAX_FX; fi++) this.fx.push(makeFx());
      this.layers = {
        bg: this.add.graphics(), world: this.add.graphics(), fx: this.add.graphics(), hud: this.add.graphics(), toast: this.add.graphics()
      };
      this.layers.bg.setDepth(-10); this.layers.world.setDepth(0); this.layers.fx.setDepth(3); this.layers.hud.setDepth(20); this.layers.toast.setDepth(30);
      this.ui = this.makeUi();
      this.toast = { active: false, life: 0, text: '', color: C.amber, queue: [] };
      this.scale.on('resize', this.layout, this);
      this.layout({ width: this.scale.width, height: this.scale.height });
      this.applyForceSwitch(true);
      kit.loader.progress(1);
      kit.loader.hide();
      kit.registerPWA();
    },

    makeUi: function () {
      var t = function (scene, text, size, color, bold) {
        return scene.add.text(0, 0, text || '', { fontFamily: 'ui-sans-serif,system-ui,sans-serif', fontSize: size + 'px', fontStyle: bold ? '900' : '600', color: color || '#f7f2e8', stroke: '#0b0e15', strokeThickness: bold ? 4 : 3 }).setScrollFactor(0).setDepth(20);
      };
      var u = {
        event: t(this, '', 12, '#a9b1bf', true),
        score: t(this, '✦ 000000', 19, '#f7f2e8', true),
        time: t(this, '◷ 90.0', 19, '#f7f2e8', true),
        combo: t(this, '', 22, '#ffca68', true),
        objective: t(this, '', 13, '#f7f2e8', true),
        controlLeft: t(this, '◀', 22, '#f7f2e8', true),
        controlRight: t(this, '▶', 22, '#f7f2e8', true),
        controlCharge: t(this, '⇧', 20, '#f7f2e8', true),
        controlBoost: t(this, '⚡', 20, '#f7f2e8', true),
        menuTitle: t(this, 'STOMP CIRCUIT', 40, '#f7f2e8', true),
        menuSub: t(this, 'MONSTER-TRUCK ARENA / TRICKS / CRUSH / GLORY', 13, '#ffca68', true),
        menuArena: t(this, '', 24, '#f7f2e8', true),
        menuLocation: t(this, '', 13, '#a9b1bf', true),
        menuTagline: t(this, '', 14, '#d4cbbd', false),
        menuHint: t(this, '', 14, '#a9b1bf', false),
        resultTitle: t(this, '', 32, '#ffca68', true),
        resultBody: t(this, '', 15, '#f7f2e8', false),
        resultHint: t(this, '', 14, '#a9b1bf', false),
        toast: t(this, '', 15, '#f7f2e8', true).setDepth(31)
      };
      u.eventCards = [];
      for (var i = 0; i < EVENTS.length; i++) u.eventCards.push(t(this, '', 16, '#f7f2e8', true));
      u.all = [u.event,u.score,u.time,u.combo,u.objective,u.controlLeft,u.controlRight,u.controlCharge,u.controlBoost,u.menuTitle,u.menuSub,u.menuArena,u.menuLocation,u.menuTagline,u.menuHint,u.resultTitle,u.resultBody,u.resultHint,u.toast].concat(u.eventCards);
      for (var j = 0; j < u.all.length; j++) u.all[j].setVisible(false);
      return u;
    },

    layout: function (size) {
      var w = size.width || window.innerWidth, h = size.height || window.innerHeight;
      this.W = w; this.H = h;
      this.layers.bg.setScrollFactor(0); this.layers.hud.setScrollFactor(0); this.layers.toast.setScrollFactor(0);
      var u = this.ui;
      u.event.setPosition(18, 14); u.score.setPosition(18, 34); u.objective.setPosition(18, 58);
      u.time.setPosition(w - 18, 14).setOrigin(1, 0); u.combo.setPosition(w * 0.5, 14).setOrigin(0.5, 0);
      u.controlLeft.setPosition(50, h - 43).setOrigin(0.5, 0.5); u.controlRight.setPosition(131, h - 43).setOrigin(0.5, 0.5);
      u.controlCharge.setPosition(w - 217, h - 43).setOrigin(0.5, 0.5); u.controlBoost.setPosition(w - 49, h - 43).setOrigin(0.5, 0.5);
      u.menuTitle.setPosition(w * 0.5, h * 0.18).setOrigin(0.5, 0.5); u.menuSub.setPosition(w * 0.5, h * 0.18 + 47).setOrigin(0.5, 0.5);
      u.menuArena.setPosition(w * 0.5, h * 0.34).setOrigin(0.5, 0.5); u.menuLocation.setPosition(w * 0.5, h * 0.34 + 30).setOrigin(0.5, 0.5); u.menuTagline.setPosition(w * 0.5, h * 0.34 + 55).setOrigin(0.5, 0.5);
      u.menuHint.setPosition(w * 0.5, h - 54).setOrigin(0.5, 0.5);
      for (var i = 0; i < u.eventCards.length; i++) u.eventCards[i].setPosition(w * 0.5, h * 0.49 + i * 34).setOrigin(0.5, 0.5);
      u.resultTitle.setPosition(w * 0.5, h * 0.27).setOrigin(0.5, 0.5); u.resultBody.setPosition(w * 0.5, h * 0.39).setOrigin(0.5, 0.5); u.resultHint.setPosition(w * 0.5, h * 0.71).setOrigin(0.5, 0.5);
      u.toast.setOrigin(1, 0.5);
    },

    onKitPause: function () { this.paused = true; this.clearInputEdges(); },
    onKitResume: function () { this.paused = false; this.clearInputEdges(); },
    onKitRestart: function () { if (this.mode === 'play') this.startRun(this.selectedArena, this.selectedEvent); else this.mode = 'title'; },
    clearInputEdges: function () { this.prev.enter = this.prev.left = this.prev.right = this.prev.esc = this.prev.up = this.prev.down = false; },

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
      return { left: left, right: right, up: up, down: down, charge: charge, boost: boost, tap: q.pointers.size > 0, spin: clamp(spin, -1.5, 1.5), menu: menu,
        keyR: q.keyDown('KeyR'), enter: q.keyDown('Enter') || q.keyDown('NumpadEnter') };
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

    startRun: function (ai, eventId) {
      ai = clamp(ai | 0, 0, ARENAS.length - 1);
      var def = ARENAS[ai], ev = EVENT_BY_ID[eventId] || EVENTS[0];
      this.selectedArena = ai; this.selectedEvent = ev.id; this.runtime = makeRuntimeArena(def);
      var g = this.runtime.groundAt(210);
      this.truck = newTruck(210, g.y - 35);
      this.run = { event: ev, arena: def, time: ev.time, score: 0, combo: 0, comboT: 0, maxCombo: 1,
        crushed: 0, gates: 0, secret: false, landings: 0, cleanLandings: 0, drops: 0, boostsUsed: 0,
        crushTarget: this.runtime.props.length, crushMedals: [Math.ceil(this.runtime.props.length * 0.35), Math.ceil(this.runtime.props.length * 0.65), this.runtime.props.length],
        lastAction: '', ended: false, countdown: 1.0, showcase: ev.id === 'showcase' };
      this.mode = 'play'; this.acc = 0;
      this.cameras.main.setBounds(0, 0, def.width, 600);
      this.cameras.main.setScroll(0, 0);
      kit.audio.music('engine', 260);
      this.clearToast();
      this.cue('launch');
      this.syncDebug();
    },

    scoreAction: function (points, label, color) {
      if (!this.run) return;
      var mult = Math.min(8, 1 + Math.floor(this.run.combo / 3));
      var value = Math.round(points * mult);
      this.run.score += value; this.run.combo++; this.run.comboT = COMBO_WINDOW; this.run.maxCombo = Math.max(this.run.maxCombo, mult);
      this.run.lastAction = label;
      if (this.run.combo === 3 || this.run.combo === 6 || this.run.combo % 8 === 0) {
        this.cue('crowd', { volume: 0.65, rate: 0.92 + Math.min(0.18, this.run.combo * 0.01) });
      }
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

    emit: function (type, x, y, color, count, speed, size) {
      var n = count || 8, sp = speed || 150;
      for (var i = 0; i < n; i++) {
        var f = null;
        for (var j = 0; j < this.fx.length; j++) if (!this.fx[j].active) { f = this.fx[j]; break; }
        if (!f) break;
        var a = Math.random() * TAU, s = sp * (0.3 + Math.random() * 0.85);
        f.active = true; f.type = type || 'spark'; f.x = x; f.y = y; f.vx = Math.cos(a) * s; f.vy = Math.sin(a) * s - sp * 0.35;
        f.life = f.max = 0.35 + Math.random() * 0.42; f.size = (size || 3) * (0.6 + Math.random() * 0.8); f.color = color || C.paper;
      }
    },

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
      this.emit('flare', b.x - 28, b.y + 28, this.run.arena.accent, 8, 120, 3);
      this.cue('launch', { volume: 0.55, rate: 1.14 });
    },

    land: function (surfaceAngle) {
      var b = this.truck, r = this.run;
      var err = Math.abs(shortAngle(b.angle - surfaceAngle));
      var flips = Math.floor(Math.abs(b.spinAccum) / TAU);
      var quality = err < 0.105 ? 'PERFECT' : (err < 0.30 ? 'CLEAN' : 'HARD');
      r.landings++;
      if (flips > 0) this.scoreAction(420 * flips, flips + 'X FLIP', C.violet);
      if (Math.abs(b.spinAccum) > Math.PI * 1.45 && flips === 0) this.scoreAction(260, 'FULL SPIN', C.cyan);
      if (quality === 'PERFECT') {
        r.cleanLandings++; b.boost = clamp(b.boost + 28, 0, 100); this.scoreAction(680, 'PERFECT LANDING', C.green);
        this.pop(b.x, b.y - 46, 'PERFECT LANDING', C.green); this.cue('crush', { volume: 0.7, rate: 1.2 });
      } else if (quality === 'CLEAN') {
        r.cleanLandings++; b.boost = clamp(b.boost + 16, 0, 100); this.scoreAction(320, 'CLEAN LANDING', C.aqua); this.cue('crush', { volume: 0.55, rate: 1.05 });
      } else {
        this.pop(b.x, b.y - 46, 'HARD LANDING', C.orange); this.cue('impact', { volume: 0.7, rate: 0.82 });
        b.vx *= 0.72; kit.juice.shake(5, 120);
      }
      b.angle = surfaceAngle + clamp(shortAngle(b.angle - surfaceAngle), -0.16, 0.16); b.av *= 0.25; b.spinAccum = 0;
      this.emit('ring', b.x, b.y + 28, quality === 'PERFECT' ? C.green : C.amber, quality === 'PERFECT' ? 12 : 7, 0, 9);
    },

    crushProps: function () {
      var b = this.truck, a = this.runtime, impact = Math.abs(b.vx) + Math.abs(b.vy) * 0.42;
      if (impact < 92) return;
      for (var i = 0; i < a.props.length; i++) {
        var p = a.props[i];
        if (!p.live || Math.abs(b.x - p.x) > p.w * 0.5 + TRUCK_HALF) continue;
        if (b.y + 26 < p.y - p.h * (1 - p.deform) - 10 || b.y > p.y + 30) continue;
        var add = clamp((impact - 70) / 360, 0.08, 0.36);
        if (p.type === 'bus') add *= 0.76;
        p.deform = clamp(p.deform + add, 0, 1); p.wobble = clamp(p.wobble + 0.5, 0, 1);
        b.vx *= p.deform > 0.78 ? 0.76 : -0.1; if (b.vy > 0) b.vy = -Math.min(260, b.vy * 0.28 + 100);
        this.emit('spark', p.x, p.y - p.h * (1 - p.deform), p.type === 'bus' ? C.amber : C.orange, 12, 210, 4);
        this.cue('impact', { volume: p.type === 'bus' ? 0.95 : 0.72, rate: 0.8 + p.deform * 0.25 });
        kit.juice.shake(p.type === 'bus' ? 9 : 5, 130);
        if (p.deform > 0.82 && p.live) {
          p.live = false; this.run.crushed++; this.scoreAction(p.type === 'bus' ? 1100 : 520 + p.tier * 100, p.type === 'bus' ? 'BUS CRUSH' : 'CRUSH', p.type === 'bus' ? C.red : C.orange);
          this.emit('ring', p.x, p.y - 8, C.amber, 14, 0, 13); this.cue('crush', { volume: 0.85, rate: 0.8 + Math.random() * 0.2 });
        }
      }
    },

    pickupPass: function () {
      var b = this.truck, a = this.runtime;
      for (var i = 0; i < a.pickups.length; i++) {
        var p = a.pickups[i];
        if (!p.live || Math.abs(b.x - p.x) > 42 || Math.abs(b.y - p.y) > 72) continue;
        p.live = false; this.run.drops++; this.cue('pickup', { volume: 0.75, rate: 1 + this.run.drops * 0.012 });
        if (p.type === 'flare') { this.scoreAction(850, 'SCORE FLARE', C.amber); this.pop(p.x, p.y, 'SCORE FLARE', C.amber); }
        else if (p.type === 'boost') { b.boost = clamp(b.boost + 42, 0, 100); this.pop(p.x, p.y, 'BOOST CAN', C.cyan); }
        else { this.run.time = Math.min(this.run.event.time + 25, this.run.time + 8); this.pop(p.x, p.y, '+8 SEC', C.green); }
        this.emit('ring', p.x, p.y, p.type === 'time' ? C.green : (p.type === 'boost' ? C.cyan : C.amber), 9, 0, 7);
      }
    },

    gatePass: function () {
      if (!this.run || this.run.event.id !== 'ramp-gauntlet') return;
      var b = this.truck, gates = this.runtime.gates;
      for (var i = 0; i < gates.length; i++) if (gates[i].live && b.x > gates[i].x) {
        gates[i].live = false; this.run.gates++; this.scoreAction(900, 'LINE GATE ' + this.run.gates, C.cyan); this.pop(b.x, b.y - 46, 'GATE ' + this.run.gates, C.cyan); this.emit('ring', gates[i].x, 400, C.cyan, 12, 0, 9); this.cue('pickup', { volume: 0.65, rate: 1.1 });
      }
    },

    secretPass: function () {
      var s = this.run.arena.secret, b = this.truck;
      if (!this.run.secret && b.x > s.x && b.x < s.x + s.w && !b.grounded && b.y < 390) {
        this.run.secret = true; this.scoreAction(1600, 'SECRET LINE', C.violet); this.pop(b.x, b.y - 46, 'SECRET LINE', C.violet); this.cue('fanfare', { volume: 0.5, rate: 1.2 });
      }
    },

    simStep: function (dt, inp) {
      if (this.mode !== 'play' || this.paused || !this.run || this.run.ended) return;
      var b = this.truck, r = this.run, support = this.groundSupport();
      r.countdown = Math.max(0, r.countdown - dt); if (r.countdown > 0) return;
      r.time -= dt;
      b.wasGrounded = b.grounded;
      var drive = inp.right && !inp.left ? 1 : (inp.left && !inp.right ? -1 : 0);
      var air = !b.grounded;
      if (b.grounded && inp.charge) b.charge = clamp(b.charge + dt / 1.25, 0, 1);
      if (b.grounded && !inp.charge && b.charge > 0.08) b.charge = Math.max(0, b.charge - dt * 0.35);
      if (inp.boost && b.boost > 0 && Math.abs(b.vx) > 30) {
        b.vx += (b.vx >= 0 ? 1 : -1) * 560 * dt; b.boost = Math.max(0, b.boost - 25 * dt); r.boostsUsed += dt;
        if (Math.random() < 0.3) this.emit('flare', b.x - 49, b.y + 28, C.cyan, 2, 80, 3);
      }
      if (!air) {
        var target = drive * (inp.boost ? 700 : 460);
        b.vx = damp(b.vx, target, drive ? 3.6 : 1.3, dt);
        if (!drive) b.vx *= Math.pow(0.992, dt * 60);
        b.av += shortAngle(support.slope * -0.25 - b.angle) * 4.2 * dt;
        b.angle += b.av * dt;
      } else {
        b.av += inp.spin * 8.6 * dt;
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
        b.y = Math.min(b.y, targetY - 2); b.vy -= 190 + b.launchCharge * 310 + Math.abs(next.slope) * Math.abs(b.vx) * 0.54; this.beginAir();
      } else if (!b.grounded && canLand) {
        b.grounded = true; b.y = targetY; b.vy = 0; b.surfaceAngle = Math.atan(next.slope); this.land(b.surfaceAngle);
      } else if (b.grounded && next.valid) {
        b.y = damp(b.y, targetY, 16, dt); b.surfaceAngle = Math.atan(next.slope); b.wheelie = clamp(Math.abs(b.angle - b.surfaceAngle) * 2.5, 0, 1);
      } else if (b.grounded && !next.valid) {
        this.beginAir();
      }
      if (b.grounded) {
        b.wheels[0].compression = clamp((b.y + 35 - next.l.y) / 22, 0, 1);
        b.wheels[1].compression = clamp((b.y + 35 - next.r.y) / 22, 0, 1);
      } else { b.wheels[0].compression = b.wheels[1].compression = 0; }
      if (b.y > 740) { b.y = targetY - 80; b.vy = -420; b.vx *= 0.55; b.angle = 0; this.pop(b.x, b.y, 'RECOVERED', C.orange); }
      this.crushProps(); this.pickupPass(); this.gatePass(); this.secretPass();
      if (r.comboT > 0) r.comboT -= dt;
      else if (r.combo > 0) { r.combo = 0; r.lastAction = ''; this.pop(b.x, b.y - 46, 'CHAIN LOST', C.fog); }
      if (r.event.id === 'crush-rally' && r.crushed >= r.crushTarget) r.time = Math.min(r.time, 0.1);
      if (r.event.id === 'ramp-gauntlet' && r.gates >= 6) r.time = Math.min(r.time, 0.1);
      if (r.time <= 0) this.endRun();
    },

    medal: function () {
      var r = this.run, ev = r.event, value = r.score;
      if (ev.id === 'crush-rally') { value = r.crushed; ev = { medals: r.crushMedals }; }
      if (ev.id === 'ramp-gauntlet') value = r.gates;
      if (value >= ev.medals[2]) return 3; if (value >= ev.medals[1]) return 2; if (value >= ev.medals[0]) return 1; return 0;
    },

    endRun: function () {
      if (!this.run || this.run.ended) return;
      this.run.ended = true; this.run.time = Math.max(0, this.run.time); var m = this.medal(), r = this.run;
      var key = r.arena.id + ':' + r.event.id;
      profile.medals[key] = Math.max(profile.medals[key] || 0, m); profile.best = Math.max(profile.best || 0, r.score); profile.runs++;
      if (m > 0) profile.unlockedArena = Math.min(4, Math.max(profile.unlockedArena, this.selectedArena + 2));
      if (m > 0) profile.unlockedEvent = Math.min(4, Math.max(profile.unlockedEvent, eventIndex(r.event.id) + 2));
      saveProfile(); this.clearToast(); this.mode = 'result'; this.cue(m > 0 ? 'fanfare' : 'impact', { volume: 0.9, rate: m > 0 ? 1 : 0.72 });
      this.syncDebug();
    },

    update: function (time, delta) {
      this.clock += Math.min(0.05, delta / 1000);
      this.applyForceSwitch(false);
      var inp = this.inputFrame();
      if (this.mode === 'title') {
        if (inp.enter || inp.menu || inp.tap) { this.mode = 'select'; this.cue('select'); }
      } else if (this.mode === 'select') {
        this.menuInput(inp);
      } else if (this.mode === 'result') {
        if (inp.keyR) this.startRun(this.selectedArena, this.selectedEvent);
        else if (inp.enter || inp.menu || inp.tap) { this.mode = 'select'; this.cue('select'); }
      } else if (this.mode === 'play') {
        if (inp.menu && !this.prev.esc) kit.openSettings();
        this.acc += Math.min(0.08, delta / 1000);
        var steps = 0;
        while (this.acc >= STEP && steps < MAX_STEPS) { this.simStep(STEP, inp); this.acc -= STEP; steps++; }
        if (this.run && this.run.ended && this.mode === 'play') this.mode = 'result';
      }
      this.prev.enter = inp.enter; this.prev.esc = inp.menu;
      this.motion = this.motionBase && kit.juice.enabled;
      this.updateFx(Math.min(0.05, delta / 1000)); this.render(); this.syncDebug();
    },

    menuInput: function (inp) {
      if (inp.left && !this.prev.left) { this.selectedArena = (this.selectedArena + ARENAS.length - 1) % ARENAS.length; this.cue('tick'); }
      if (inp.right && !this.prev.right) { this.selectedArena = (this.selectedArena + 1) % ARENAS.length; this.cue('tick'); }
      if (inp.up && !this.prev.up) { this.selectedEvent = EVENTS[Math.max(0, eventIndex(this.selectedEvent) - 1)].id; this.cue('tick'); }
      if (inp.down && !this.prev.down) { this.selectedEvent = EVENTS[Math.min(EVENTS.length - 1, eventIndex(this.selectedEvent) + 1)].id; this.cue('tick'); }
      if (inp.enter || inp.boost || inp.tap) {
        var allowed = eventIndex(this.selectedEvent) < profile.unlockedEvent && this.selectedArena < profile.unlockedArena;
        if (allowed || forcedEvent() || forcedArena() != null) { this.startRun(this.selectedArena, this.selectedEvent); this.cue('select'); }
        else { this.pop(ARENAS[this.selectedArena].width * 0.5, 410, 'EARN A MEDAL TO UNLOCK', C.orange); this.cue('impact', { volume: 0.35, rate: 0.65 }); }
      }
      this.prev.left = inp.left; this.prev.right = inp.right; this.prev.up = inp.up; this.prev.down = inp.down;
    },

    updateFx: function (dt) {
      for (var i = 0; i < this.fx.length; i++) {
        var f = this.fx[i]; if (!f.active) continue;
        f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 420 * dt; f.vx *= Math.pow(0.97, dt * 60);
        if (f.life <= 0) f.active = false;
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

    render: function () {
      this.renderBg();
      if (this.mode === 'play' && this.runtime) this.renderWorld();
      else { this.cameras.main.setScroll(0, 0); this.renderMenuBackdrop(); }
      this.renderHud();
      this.renderToast();
    },

    renderBg: function () {
      var g = this.layers.bg, w = this.W, h = this.H; g.clear();
      g.fillStyle(C.ink, 1); g.fillRect(0, 0, w, h);
      for (var i = 0; i < 7; i++) { g.fillStyle(i % 2 ? 0x101623 : 0x0d121d, 1); g.fillRect(0, i * h / 7, w, h / 7 + 2); }
      g.fillStyle(0x172438, 0.42); g.fillCircle(w * 0.72, h * 0.18, Math.min(w, h) * 0.34);
      g.fillStyle(0x241d32, 0.32); g.fillCircle(w * 0.18, h * 0.78, Math.min(w, h) * 0.28);
    },

    renderMenuBackdrop: function () {
      var g = this.layers.world; g.clear();
      var w = this.W, h = this.H, a = ARENAS[this.selectedArena];
      g.fillStyle(a.accent, 0.07); g.fillCircle(w * 0.5, h * 0.52, Math.min(w, h) * 0.36);
      g.lineStyle(3, a.accent, 0.48); g.strokeCircle(w * 0.5, h * 0.52, Math.min(w, h) * 0.28);
      g.lineStyle(1, a.hot, 0.28); g.strokeCircle(w * 0.5, h * 0.52, Math.min(w, h) * 0.33);
      for (var i = 0; i < 16; i++) { var x = (i + 0.5) * w / 16, bob = this.motion ? Math.sin(this.clock * 2.5 + i) * 4 : 0; g.fillStyle(i % 3 === 0 ? a.hot : a.accent, 0.65); g.fillCircle(x, h * 0.83 + bob, 3 + (i % 2)); }
    },

    renderWorld: function () {
      var g = this.layers.world, a = this.runtime, d = a.def, def = d, b = this.truck; g.clear();
      g.fillStyle(def.accent, 0.07); g.fillRect(0, 80, def.width, 300);
      for (var i = 0; i < 24; i++) {
        var bx = 120 + i * 240, bh = 55 + ((i * 37) % 100);
        g.fillStyle(0x121a27, 0.9); g.fillRect(bx, 500 - bh, 130 + (i % 3) * 22, bh);
        g.fillStyle(def.accent, 0.22); for (var wi = 0; wi < 3; wi++) g.fillRect(bx + 20 + wi * 30, 520 - bh + 18 + (i % 2) * 12, 9, 4);
      }
      this.renderCrowd(g, def);
      g.beginPath(); g.moveTo(0, 610);
      for (var pi = 0; pi < def.profile.length; pi++) g.lineTo(def.profile[pi][0], def.profile[pi][1]);
      g.lineTo(def.width, 610); g.closePath(); g.fillStyle(0x202733, 1); g.fillPath();
      g.lineStyle(6, def.accent, 0.86); g.beginPath();
      for (var li = 0; li < def.profile.length; li++) { if (li === 0) g.moveTo(def.profile[li][0], def.profile[li][1]); else g.lineTo(def.profile[li][0], def.profile[li][1]); } g.strokePath();
      g.lineStyle(2, C.paper, 0.2); g.beginPath();
      for (var li2 = 0; li2 < def.profile.length; li2++) { if (li2 === 0) g.moveTo(def.profile[li2][0], def.profile[li2][1] + 10); else g.lineTo(def.profile[li2][0], def.profile[li2][1] + 10); } g.strokePath();
      for (var gi = 0; gi < def.gaps.length; gi++) { var gap = def.gaps[gi]; g.fillStyle(0x05070d, 1); g.fillRect(gap.x, 500, gap.w, 115); g.lineStyle(3, def.hot, 0.65); g.lineBetween(gap.x, 501, gap.x + gap.w, 501); }
      this.renderRamps(g, def); this.renderSignature(g, def); this.renderProps(g, a.props); this.renderPickups(g, a.pickups); this.renderGates(g, a.gates); this.renderSecret(g, def.secret); this.renderTruck(g, b); this.renderFx(g);
      var targetX = clamp(b.x - this.W * 0.32, 0, def.width - this.W); var cam = this.cameras.main; var shake = kit.juice.frame(); cam.setScroll(targetX + shake.dx, shake.dy);
    },

    renderCrowd: function (g, def) {
      var energy = this.run ? clamp(this.run.combo / 12, 0, 1) : 0.25, rows = [132, 166, 201];
      for (var ri = 0; ri < rows.length; ri++) {
        for (var i = 0; i < 43; i++) {
          var x = 70 + i * 132 + (ri * 37), bob = this.motion ? Math.sin(this.clock * (2.1 + energy * 3) + i * 0.7 + ri) * (2 + energy * 5) : 0;
          var col = i % 5 === 0 ? def.hot : (i % 3 === 0 ? def.accent : C.paper);
          g.fillStyle(0x090c13, 0.72); g.fillRect(x - 12, rows[ri] + 9, 24, 26);
          g.fillStyle(col, 0.48 + energy * 0.38); g.fillCircle(x, rows[ri] + bob, 7); g.fillRect(x - 9, rows[ri] + 8 + bob, 18, 15);
        }
      }
      g.fillStyle(def.accent, 0.18); g.fillRect(0, 225, def.width, 7);
    },

    renderRamps: function (g, def) {
      for (var i = 0; i < def.ramps.length; i++) {
        var r = def.ramps[i], y = def.profile[Math.min(def.profile.length - 1, i * 5 + 1)][1];
        g.fillStyle(def.hot, 0.16); g.fillTriangle(r.x, 500, r.x + r.w, 500, r.x + r.w * 0.78, y - 3);
        g.lineStyle(3, def.hot, 0.58); g.lineBetween(r.x, 500, r.x + r.w * 0.78, y - 3); g.lineBetween(r.x + 20, 500, r.x + r.w * 0.78 + 20, y + 8);
        for (var z = 0; z < 4; z++) g.lineStyle(1, def.accent, 0.36).lineBetween(r.x + 20 + z * 42, 500, r.x + 28 + z * 42, y + 38);
      }
    },

    renderSignature: function (g, def) {
      var x = def.signature.x, y = 470, k = def.signature.kind;
      g.lineStyle(8, def.hot, 0.54);
      if (k === 'bowl') { g.strokeEllipse(x, y - 55, 350, 170); g.lineStyle(3, C.paper, 0.3); g.strokeEllipse(x, y - 55, 290, 125); }
      else if (k === 'crusher') { g.lineBetween(x - 105, 245, x - 105, 480); g.lineBetween(x + 105, 245, x + 105, 480); g.fillStyle(def.hot, 0.2); g.fillRect(x - 84, 300, 168, 50); g.lineStyle(3, def.hot, 0.8); g.strokeRect(x - 84, 300, 168, 50); }
      else if (k === 'canyon') { g.lineBetween(x - 165, 420, x - 40, 295); g.lineBetween(x + 165, 420, x + 40, 295); g.lineBetween(x - 40, 295, x + 40, 295); g.fillStyle(def.hot, 0.14); g.fillTriangle(x - 170, 480, x, 305, x + 170, 480); }
      else { g.strokeCircle(x, 375, 105); g.lineStyle(3, def.accent, 0.8); g.strokeCircle(x, 375, 78); g.fillStyle(def.hot, 0.16); g.fillCircle(x, 375, 42); }
      g.fillStyle(def.hot, 0.9); g.fillRect(x - 112, 222, 224, 4); g.fillStyle(C.paper, 0.48); g.fillRect(x - 76, 216, 152, 3);
    },

    renderProps: function (g, props) {
      for (var i = 0; i < props.length; i++) {
        var p = props[i]; if (!p.live) continue; var d = p.deform, w = p.w * (1 + d * 0.16), h = p.h * (1 - d * 0.76), y = p.y - h, wob = this.motion ? Math.sin(this.clock * 18 + i) * p.wobble * 2 : 0;
        p.render.x = p.x + wob; p.render.y = y; p.render.sx = w / p.w; p.render.sy = h / p.h; p.render.rot = wob * 0.015;
        g.fillStyle(0x090c12, 0.64); g.fillEllipse(p.x, p.y + 7, w + 12, 10);
        if (p.type === 'bus') { g.fillStyle(0x9e4c43, 1); g.fillRoundedRect(p.render.x - w / 2, y, w, h, 8); g.fillStyle(C.amber, 0.76); g.fillRect(p.render.x - w * 0.36, y + h * 0.22, w * 0.72, 7); g.fillStyle(0x17202a, 1); for (var wi = 0; wi < 4; wi++) g.fillRect(p.render.x - w * 0.36 + wi * w * 0.22, y + h * 0.4, w * 0.13, h * 0.21); }
        else { g.fillStyle(i % 2 ? 0x567088 : 0x6c7d8e, 1); g.fillRoundedRect(p.render.x - w / 2, y, w, h, 7); g.fillStyle(i % 3 ? 0x1b2732 : 0xffca68, 0.8); g.fillRect(p.render.x - w * 0.32, y + h * 0.2, w * 0.64, Math.max(3, h * 0.18)); g.fillStyle(0x0d121a, 1); g.fillCircle(p.render.x - w * 0.29, p.y - 5, 8); g.fillCircle(p.render.x + w * 0.29, p.y - 5, 8); }
        if (d > 0.22) { g.lineStyle(3, C.orange, 0.72); g.lineBetween(p.x - w * 0.35, y + h * 0.4, p.x + w * 0.25, y + h * 0.62); }
      }
    },

    renderPickups: function (g, pickups) {
      for (var i = 0; i < pickups.length; i++) {
        var p = pickups[i]; if (!p.live) continue; var bob = this.motion ? Math.sin(this.clock * 3 + p.phase) * 6 : 0, col = p.type === 'time' ? C.green : (p.type === 'boost' ? C.cyan : C.amber);
        p.render.y = p.y + bob; p.render.s = 1 + Math.sin(this.clock * 4 + p.phase) * 0.08;
        g.lineStyle(2, col, 0.3); g.strokeCircle(p.x, p.render.y, 20 * p.render.s); g.fillStyle(col, 0.16); g.fillCircle(p.x, p.render.y, 16 * p.render.s); g.fillStyle(col, 0.95); g.fillRoundedRect(p.x - 10, p.render.y - 10, 20, 20, 5);
        g.fillStyle(C.ink, 1); if (p.type === 'flare') g.fillTriangle(p.x, p.render.y - 6, p.x + 6, p.render.y + 5, p.x - 6, p.render.y + 5); else if (p.type === 'boost') g.fillTriangle(p.x - 2, p.render.y - 7, p.x + 6, p.render.y, p.x - 2, p.render.y + 7); else { g.fillRect(p.x - 6, p.render.y - 2, 12, 4); g.fillRect(p.x - 2, p.render.y - 6, 4, 12); }
      }
    },

    renderGates: function (g, gates) {
      for (var i = 0; i < gates.length; i++) { var q = gates[i]; if (!q.live) continue; var pulse = this.motion ? Math.sin(this.clock * 5 + i) * 5 : 0; g.lineStyle(4, C.cyan, 0.72); g.strokeCircle(q.x, 390, 35 + pulse); g.lineStyle(2, C.paper, 0.38); g.lineBetween(q.x - 35, 390, q.x - 35, 500); g.lineBetween(q.x + 35, 390, q.x + 35, 500); }
    },

    renderSecret: function (s) {
      var g = this.layers.world; g.lineStyle(3, C.violet, 0.35); g.lineBetween(s.x, 465, s.x + s.w, 465); g.lineStyle(1, C.paper, 0.28); for (var i = 0; i < 5; i++) g.lineBetween(s.x + 20 + i * 52, 465, s.x + 36 + i * 52, 445); 
    },

    poly: function (g, b, pts, color, alpha) {
      var ca = Math.cos(b.angle), sa = Math.sin(b.angle); g.beginPath();
      for (var i = 0; i < pts.length; i++) { var x = b.x + pts[i][0] * ca - pts[i][1] * sa, y = b.y + pts[i][0] * sa + pts[i][1] * ca; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.closePath(); g.fillStyle(color, alpha == null ? 1 : alpha); g.fillPath();
    },

    renderTruck: function (g, b) {
      var ca = Math.cos(b.angle), sa = Math.sin(b.angle); b.render.x = b.x; b.render.y = b.y; b.render.angle = b.angle; b.render.squash = b.grounded ? (b.wheels[0].compression + b.wheels[1].compression) * 0.08 : 0;
      g.fillStyle(0x05070a, 0.58); g.fillEllipse(b.x, b.y + 38, 128, 16);
      var wheelY = b.y + 28;
      for (var wi = 0; wi < 2; wi++) { var wx = b.x + (wi ? 42 : -42) * ca - 5 * sa, wy = wheelY + (wi ? 42 : -42) * sa + 5 * ca; g.fillStyle(0x06080d, 1); g.fillCircle(wx, wy, WHEEL_R + 3); g.fillStyle(0x2c3847, 1); g.fillCircle(wx, wy, WHEEL_R - 3); g.lineStyle(3, C.amber, 0.8); g.strokeCircle(wx, wy, WHEEL_R - 6); g.lineStyle(2, C.paper, 0.45); g.lineBetween(wx - 7, wy, wx + 7, wy); g.lineBetween(wx, wy - 7, wx, wy + 7); }
      this.poly(g, b, [[-61,-18],[-42,-30],[15,-32],[48,-20],[61,0],[53,18],[-58,18]], 0x121923, 1);
      this.poly(g, b, [[-55,-14],[-37,-26],[10,-28],[43,-17],[52,4],[-51,5]], 0xd35147, 1);
      this.poly(g, b, [[-22,-24],[-7,-43],[28,-40],[43,-17],[-11,-18]], 0x1a2632, 1);
      this.poly(g, b, [[-16,-27],[-5,-38],[10,-36],[10,-20]], 0x88e7e2, 0.86);
      this.poly(g, b, [[13,-36],[26,-34],[38,-19],[15,-20]], 0x42637a, 0.95);
      this.poly(g, b, [[-56,2],[56,1],[50,9],[-49,11]], C.amber, 0.96);
      this.poly(g, b, [[-45,12],[-18,12],[-22,18],[-51,17]], C.orange, 1);
      this.poly(g, b, [[23,-32],[41,-28],[51,-16],[39,-17]], C.paper, 0.8);
      g.lineStyle(3, C.paper, 0.46); g.lineBetween(b.x - 33 * ca - 14 * sa, b.y + 24, b.x - 33 * ca - 14 * sa, b.y + 45); g.lineBetween(b.x + 33 * ca - 14 * sa, b.y + 24, b.x + 33 * ca - 14 * sa, b.y + 45);
      if (b.boost > 0 && (this.inputFrame().boost || b.boost > 90)) { g.fillStyle(C.cyan, 0.82); g.fillTriangle(b.x - 61, b.y + 6, b.x - 92, b.y - 2, b.x - 86, b.y + 15); }
      if (b.charge > 0.1 && b.grounded) { g.lineStyle(3, C.violet, 0.8); g.strokeCircle(b.x, b.y - 43, 20 + b.charge * 12); }
    },

    renderFx: function (g) {
      for (var i = 0; i < this.fx.length; i++) { var f = this.fx[i]; if (!f.active) continue; var a = clamp(f.life / f.max, 0, 1); f.render.x = f.x; f.render.y = f.y; f.render.alpha = a; f.render.size = f.size * (1 + (1 - a) * 0.8); g.fillStyle(f.color, a); if (f.type === 'ring') { g.lineStyle(3, f.color, a); g.strokeCircle(f.x, f.y, f.size * (2.5 - a)); } else if (f.type === 'flare') g.fillTriangle(f.x, f.y - f.render.size * 2, f.x + f.render.size, f.y + f.render.size, f.x - f.render.size, f.y + f.render.size); else g.fillRect(f.x - f.render.size * 0.5, f.y - f.render.size * 0.5, f.render.size, f.render.size); }
    },

    renderHud: function () {
      var u = this.ui, g = this.layers.hud, w = this.W, h = this.H; g.clear();
      var play = this.mode === 'play' && this.run;
      for (var i = 0; i < u.all.length; i++) u.all[i].setVisible(false);
      if (play) {
        var r = this.run, b = this.truck, mult = Math.min(8, 1 + Math.floor(r.combo / 3));
        u.event.setVisible(true); u.score.setVisible(true); u.time.setVisible(true); u.combo.setVisible(true); u.controlLeft.setVisible(true); u.controlRight.setVisible(true); u.controlCharge.setVisible(true); u.controlBoost.setVisible(true);
        setTextIfChanged(u.event, r.event.name); setTextIfChanged(u.score, '✦ ' + ('000000' + Math.floor(r.score)).slice(-6)); setTextIfChanged(u.time, '◷ ' + Math.max(0, r.time).toFixed(1));
        setTextIfChanged(u.combo, '×' + mult);
        var goal = r.event.id === 'crush-rally' ? '▣ ' + r.crushed + '/' + r.crushTarget : (r.event.id === 'ramp-gauntlet' ? '◇ ' + r.gates + '/6' : '');
        setTextIfChanged(u.objective, goal); u.objective.setVisible(!!goal);
        var boostW = Math.min(174, Math.max(100, w * 0.28)), comboW = Math.min(360, Math.max(80, w - boostW - 46)); g.fillStyle(0x06080d, 0.74); g.fillRoundedRect(14, h - 96, comboW, 10, 5); g.fillStyle(C.amber, 0.9); g.fillRoundedRect(14, h - 96, comboW * clamp(r.comboT / COMBO_WINDOW, 0, 1), 10, 5);
        g.fillStyle(0x06080d, 0.74); g.fillRoundedRect(w - boostW - 16, h - 96, boostW, 10, 5); g.fillStyle(C.cyan, 0.92); g.fillRoundedRect(w - boostW - 16, h - 96, boostW * b.boost / 100, 10, 5);
        var buttonY = h - 62, buttonW = 58, buttonH = 40; g.fillStyle(0xf7f2e8, 0.12); g.fillRoundedRect(20, buttonY, buttonW, buttonH, 12); g.fillRoundedRect(102, buttonY, buttonW, buttonH, 12); g.fillRoundedRect(w - 246, buttonY, buttonW, buttonH, 12); g.fillRoundedRect(w - 78, buttonY, buttonW, buttonH, 12);
        g.lineStyle(2, C.fog, 0.36); g.strokeRoundedRect(20, buttonY, buttonW, buttonH, 12); g.strokeRoundedRect(102, buttonY, buttonW, buttonH, 12); g.strokeRoundedRect(w - 246, buttonY, buttonW, buttonH, 12); g.strokeRoundedRect(w - 78, buttonY, buttonW, buttonH, 12);
      } else if (this.mode === 'select') {
        var a = ARENAS[this.selectedArena], selected = eventIndex(this.selectedEvent);
        u.menuTitle.setVisible(true); u.menuSub.setVisible(true); u.menuArena.setVisible(true); u.menuLocation.setVisible(true); u.menuTagline.setVisible(true); u.menuHint.setVisible(true);
        setTextIfChanged(u.menuArena, '◀  ' + a.name + '  ▶'); setTextIfChanged(u.menuLocation, a.location + ' / ARENA ' + (this.selectedArena + 1) + ' OF 4'); setTextIfChanged(u.menuTagline, a.tagline);
        for (var i2 = 0; i2 < EVENTS.length; i2++) { var ev = EVENTS[i2], locked = i2 >= profile.unlockedEvent || this.selectedArena >= profile.unlockedArena; u.eventCards[i2].setVisible(true); setTextIfChanged(u.eventCards[i2], (i2 === selected ? '▸ ' : '  ') + ev.name + (locked ? '  / LOCKED' : '  / ' + ev.tag)); u.eventCards[i2].setColor(i2 === selected ? hex(a.hot) : (locked ? '#596273' : '#f7f2e8')); }
        setTextIfChanged(u.menuHint, 'ARROWS SELECT   ENTER DRIVE   A / D ARENA   SHIFT / SPACE START   SETTINGS VIA ESC');
      } else if (this.mode === 'title') {
        u.menuTitle.setVisible(true); u.menuSub.setVisible(true); u.menuHint.setVisible(true); setTextIfChanged(u.menuHint, 'PRESS ENTER OR TAP TO ENTER THE CIRCUIT');
      } else if (this.mode === 'result') {
        var rr = this.run, mm = this.medal(); u.resultTitle.setVisible(true); u.resultBody.setVisible(true); u.resultHint.setVisible(true);
        setTextIfChanged(u.resultTitle, mm ? ['RUN COMPLETE','BRONZE MEDAL','SILVER MEDAL','GOLD MEDAL'][mm] : 'RUN COMPLETE'); setTextIfChanged(u.resultBody, rr.arena.name + '\n' + rr.event.name + '\n\nSCORE  ' + rr.score + '\nMAX CHAIN  x' + rr.maxCombo + '\nCRUSHED  ' + rr.crushed + '    CLEAN LANDINGS  ' + rr.cleanLandings + '\n' + (rr.secret ? 'SECRET LINE FOUND' : 'SECRET LINE MISSED')); setTextIfChanged(u.resultHint, 'ENTER / TAP: EVENT SELECT    R: RETRY');
      }
    },

    renderToast: function () {
      var g = this.layers.toast, u = this.ui, w = this.W, h = this.H; g.clear(); u.toast.setVisible(false);
      if (!this.toast.active || (this.mode !== 'play' && this.mode !== 'select')) return;
      var bw = Math.min(280, w - 24), bh = 30, x = w - 12 - bw, y = this.mode === 'play' ? 74 : h - 86;
      g.fillStyle(0x080a10, 0.84); g.fillRoundedRect(x, y - bh * 0.5, bw, bh, 8); g.fillStyle(this.toast.color, 0.9); g.fillRect(x, y - bh * 0.5, 4, bh);
      u.toast.setVisible(true).setPosition(w - 22, y).setAlpha(this.motion ? (this.toast.life < 0.18 ? clamp(this.toast.life / 0.18, 0, 1) : 1) : 1);
    },

    syncDebug: function () {
      var s = ST.state; s.mode = this.mode; s.score = this.run ? Math.floor(this.run.score) : 0; s.combo = this.run ? this.run.combo : 0; s.airborne = !!(this.truck && !this.truck.grounded); s.event = this.run ? this.run.event.id : this.selectedEvent; s.arena = this.run ? this.run.arena.id : ARENAS[this.selectedArena].id; s.forceEvent = ST.forceEvent || null; s.forceArena = ST.forceArena; s.time = this.run ? this.run.time : 0; s.boost = this.truck ? this.truck.boost : 0; s.crushed = this.run ? this.run.crushed : 0; s.gates = this.run ? this.run.gates : 0;
    }
  };

  kit.loader.show('STOMP CIRCUIT'); kit.loader.progress(0.2);
  Game.phaser = new Phaser.Game({
    type: Phaser.AUTO, parent: document.body, backgroundColor: '#0b0e15',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    render: { antialias: true, antialiasGL: false, roundPixels: true, powerPreference: 'high-performance' },
    fps: { target: 60, min: 30 }, scene: [toScene(CircuitScene)]
  });
}());
