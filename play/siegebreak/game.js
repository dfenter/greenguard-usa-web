/* Siegebreak - fleet F8 fantasy siege defense. Phaser 3 + GGKit only. */
(function () {
  'use strict';

  const W = 390;
  const H = 700;
  const HEADER = 74;
  const RAIL = 574;
  const WALL_Y = 320;
  const WALL_BOTTOM = 438;
  const GROUND_Y = 506;
  const GATE_X = 155;
  const GATE_W = 80;
  const STEP = 1 / 60;
  const MAX_ENEMIES = 48;
  const MAX_LADDERS = 18;
  const MAX_PARTICLES = 96;
  const MAX_PROJECTILES = 28;
  const MAX_FLOATS = 18;
  const PARTICLE_KINDS = ['spark', 'debris', 'oil', 'command'];
  const PARTICLES_PER_KIND = Math.floor(MAX_PARTICLES / PARTICLE_KINDS.length);
  const WAVE_PREVIEW_LEAD = 1.05;
  const RALLY_COOLDOWN = 1.6;
  const SEGMENTS = [{ lo: 12, hi: 134 }, { lo: 134, hi: 256 }, { lo: 256, hi: 378 }];
  const SEG_CENTERS = [73, 195, 317];

  const COLORS = {
    ink: 0x07111b, panel: 0x0d1b29, panel2: 0x12283a,
    bone: 0xe3d3a2, muted: 0x8194a5, white: 0xf4f4e7,
    player: 0x43c7f4, playerDark: 0x3864e8, playerLight: 0xb7efff,
    enemy: 0xff665c, enemyDark: 0xb72e4d, amber: 0xe0a34a,
    gold: 0xffd166, danger: 0xff5c6a, good: 0x72e0af,
    slate: 0x718092, wall: 0x516474, wallLight: 0x7890a0,
    gate: 0xb8864a, oil: 0xffa94d, violet: 0xd9a7ff
  };
  const CSS = {
    player: '#43c7f4', playerDark: '#3864e8', enemy: '#ff665c',
    amber: '#e0a34a', gold: '#ffd166', white: '#f4f4e7', muted: '#8194a5',
    danger: '#ff5c6a', good: '#72e0af', violet: '#d9a7ff', bone: '#e3d3a2'
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function setTextIfChanged(obj, value) {
    const text = String(value);
    if (obj.text !== text) obj.setText(text);
  }
  function setColorIfChanged(obj, color) {
    if (obj._sbColor !== color) { obj.setColor(color); obj._sbColor = color; }
  }
  function rectHit(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function roundRectCanvas(c, x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  const RAMPARTS = [
    { name: 'OUTER GATEHOUSE', landmark: 'BANNER TOWER', color: '#4c6b79', nights: '01-02', upgrade: 'IRONBOUND GATE', desc: '+30 gate integrity and +20 oil reserve' },
    { name: 'TWIN-TOWER FLANK', landmark: 'SIEGE ENGINE WRECK', color: '#586476', nights: '03-05', upgrade: 'CROSS-FIRE WALK', desc: 'archer shots deal +35% damage' },
    { name: 'COLLAPSING CURTAIN', landmark: 'FALLEN BANNER TOWER', color: '#6b5c69', nights: '06-09', upgrade: 'BRACED CURTAIN', desc: 'wall repairs restore +20 more integrity' },
    { name: 'THE VAULT APPROACH', landmark: 'VAULT LANTERN', color: '#4b627d', nights: '10', upgrade: 'WARDEN SIGIL', desc: 'kick breaks elite shields in one clean window' }
  ];

  const NIGHT_BLURBS = [
    'ladders in the dark', 'ropes over the parapet', 'the first ram', 'shielded vanguard',
    'pressure on every wall', 'a tower rolls in', 'fast climbers', 'two rams at dusk',
    'towers and elites', 'the last approach'
  ];

  const WAVE_TABLE = [
    [{ t: 1.0, k: 'grunt', s: 0 }, { t: 2.8, k: 'grunt', s: 1 }, { t: 5.0, k: 'grunt', s: 2 }, { t: 7.3, k: 'grapple', s: 1 }, { t: 10.0, k: 'grunt', s: 0 }, { t: 12.6, k: 'grunt', s: 2 }, { t: 16.4, k: 'grapple', s: 0 }],
    [{ t: 0.9, k: 'grunt', s: 0 }, { t: 2.0, k: 'grunt', s: 2 }, { t: 3.5, k: 'grapple', s: 1 }, { t: 6.4, k: 'grunt', s: 0 }, { t: 8.5, k: 'grunt', s: 1 }, { t: 10.2, k: 'grapple', s: 2 }, { t: 13.0, k: 'grunt', s: 1 }, { t: 15.2, k: 'grapple', s: 0 }],
    [{ t: 0.8, k: 'grunt', s: 1 }, { t: 2.2, k: 'ram', s: 1 }, { t: 4.0, k: 'grunt', s: 0 }, { t: 5.3, k: 'grapple', s: 2 }, { t: 7.4, k: 'grunt', s: 1 }, { t: 9.2, k: 'grunt', s: 0 }, { t: 12.0, k: 'grapple', s: 1 }, { t: 15.0, k: 'grunt', s: 2 }, { t: 18.0, k: 'grunt', s: 0 }],
    [{ t: 0.7, k: 'elite', s: 1 }, { t: 2.4, k: 'grunt', s: 0 }, { t: 3.5, k: 'grunt', s: 2 }, { t: 5.2, k: 'ram', s: 1 }, { t: 7.3, k: 'grapple', s: 0 }, { t: 8.8, k: 'elite', s: 2 }, { t: 11.5, k: 'grunt', s: 1 }, { t: 14.0, k: 'grapple', s: 2 }, { t: 17.2, k: 'grunt', s: 0 }],
    [{ t: 0.6, k: 'grunt', s: 0 }, { t: 1.8, k: 'grunt', s: 1 }, { t: 2.6, k: 'elite', s: 2 }, { t: 4.0, k: 'grapple', s: 1 }, { t: 5.8, k: 'ram', s: 1 }, { t: 7.6, k: 'grunt', s: 0 }, { t: 9.0, k: 'elite', s: 0 }, { t: 11.0, k: 'grapple', s: 2 }, { t: 13.4, k: 'grunt', s: 1 }, { t: 16.0, k: 'grunt', s: 2 }, { t: 18.6, k: 'grapple', s: 0 }],
    [{ t: 0.6, k: 'tower', s: 0 }, { t: 2.0, k: 'grunt', s: 2 }, { t: 3.4, k: 'grapple', s: 1 }, { t: 5.4, k: 'elite', s: 0 }, { t: 7.8, k: 'ram', s: 1 }, { t: 9.5, k: 'grunt', s: 2 }, { t: 11.0, k: 'grapple', s: 0 }, { t: 13.4, k: 'elite', s: 2 }, { t: 16.2, k: 'grunt', s: 1 }, { t: 18.4, k: 'grapple', s: 1 }, { t: 21.0, k: 'grunt', s: 0 }],
    [{ t: 0.5, k: 'grapple', s: 0 }, { t: 1.4, k: 'elite', s: 1 }, { t: 2.5, k: 'grunt', s: 2 }, { t: 4.0, k: 'tower', s: 2 }, { t: 5.8, k: 'ram', s: 1 }, { t: 7.0, k: 'grapple', s: 1 }, { t: 8.8, k: 'elite', s: 0 }, { t: 10.4, k: 'grunt', s: 2 }, { t: 12.8, k: 'grapple', s: 2 }, { t: 15.0, k: 'tower', s: 0 }, { t: 18.0, k: 'elite', s: 1 }, { t: 21.0, k: 'grunt', s: 0 }],
    [{ t: 0.5, k: 'ram', s: 1 }, { t: 1.4, k: 'ram', s: 1 }, { t: 2.6, k: 'elite', s: 0 }, { t: 3.7, k: 'grapple', s: 2 }, { t: 5.2, k: 'tower', s: 1 }, { t: 7.0, k: 'grunt', s: 0 }, { t: 8.4, k: 'elite', s: 2 }, { t: 10.2, k: 'grapple', s: 1 }, { t: 12.0, k: 'tower', s: 2 }, { t: 14.4, k: 'grunt', s: 0 }, { t: 16.6, k: 'elite', s: 1 }, { t: 19.0, k: 'grapple', s: 2 }, { t: 21.8, k: 'grunt', s: 1 }],
    [{ t: 0.5, k: 'tower', s: 0 }, { t: 1.5, k: 'tower', s: 2 }, { t: 2.1, k: 'elite', s: 1 }, { t: 3.2, k: 'ram', s: 1 }, { t: 4.4, k: 'grapple', s: 0 }, { t: 5.8, k: 'elite', s: 2 }, { t: 7.2, k: 'grunt', s: 1 }, { t: 9.0, k: 'ram', s: 1 }, { t: 10.8, k: 'grapple', s: 2 }, { t: 12.2, k: 'tower', s: 1 }, { t: 14.8, k: 'elite', s: 0 }, { t: 17.0, k: 'grunt', s: 2 }, { t: 19.4, k: 'grapple', s: 1 }, { t: 22.0, k: 'elite', s: 2 }],
    [{ t: 0.4, k: 'tower', s: 0 }, { t: 0.9, k: 'ram', s: 1 }, { t: 1.6, k: 'elite', s: 2 }, { t: 2.8, k: 'grapple', s: 0 }, { t: 4.0, k: 'tower', s: 2 }, { t: 5.3, k: 'ram', s: 1 }, { t: 6.5, k: 'elite', s: 1 }, { t: 8.2, k: 'grapple', s: 2 }, { t: 9.8, k: 'tower', s: 1 }, { t: 12.0, k: 'elite', s: 0 }, { t: 14.0, k: 'ram', s: 1 }, { t: 15.6, k: 'grapple', s: 1 }, { t: 17.4, k: 'tower', s: 0 }, { t: 19.2, k: 'elite', s: 2 }, { t: 22.0, k: 'grunt', s: 1 }]
  ];
  const VAULT_WAVE = [
    { t: 0.5, k: 'tower', s: 0 }, { t: 1.1, k: 'ram', s: 1 }, { t: 1.7, k: 'tower', s: 2 },
    { t: 3.0, k: 'elite', s: 1 }, { t: 4.4, k: 'grapple', s: 0 }, { t: 5.8, k: 'ram', s: 1 },
    { t: 7.0, k: 'elite', s: 2 }, { t: 8.5, k: 'tower', s: 1 }, { t: 10.0, k: 'grapple', s: 2 },
    { t: 12.0, k: 'elite', s: 0 }, { t: 14.0, k: 'ram', s: 1 }, { t: 15.4, k: 'tower', s: 0 },
    { t: 17.0, k: 'tower', s: 2 }, { t: 19.0, k: 'elite', s: 1 }, { t: 21.4, k: 'ram', s: 1 },
    { t: 24.0, k: 'elite', s: 2 }, { t: 26.0, k: 'grapple', s: 0 }, { t: 28.0, k: 'tower', s: 1 },
    { t: 31.0, k: 'elite', s: 0 }
  ];

  const TRIALS = [
    { id: 'first-rung', title: 'FIRST RUNG', desc: 'Kick 3 ladders off before they reach the top.', night: 1, goal: '3 KICKED LADDERS', target: 3 },
    { id: 'rope-line', title: 'ROPE LINE', desc: 'Break 3 grapple ropes with overhead strikes.', night: 2, goal: '3 ROPES CUT', target: 3 },
    { id: 'shield-law', title: 'SHIELD LAW', desc: 'Break 2 elite shields with clean kicks.', night: 4, goal: '2 SHIELDS BROKEN', target: 2 },
    { id: 'oil-rain', title: 'OIL RAIN', desc: 'Pour oil 8 times while the gate is under pressure.', night: 6, goal: '8 OIL POURS', target: 8 },
    { id: 'three-walls', title: 'THREE WALLS', desc: 'Finish a night with all three wall segments above 70%.', night: 8, goal: 'WALLS ABOVE 70%', target: 1 }
  ];

  const ENEMY = {
    grunt: { hp: 34, speed: 34, climb: 45, dps: 7, reward: 5, scale: 0.62 },
    grapple: { hp: 24, speed: 42, climb: 64, dps: 5, reward: 7, scale: 0.58 },
    elite: { hp: 86, speed: 25, climb: 30, dps: 12, reward: 13, scale: 0.82 },
    ram: { hp: 250, speed: 18, climb: 0, dps: 15, reward: 30, scale: 1 },
    tower: { hp: 330, speed: 11, climb: 0, dps: 0, reward: 34, scale: 1 }
  };
  const HERO_KEYS = [
    { code: 'Space', type: 'over' }, { code: 'ArrowDown', type: 'kick' }, { code: 'KeyS', type: 'kick' },
    { code: 'ArrowUp', type: 'sweep' }, { code: 'KeyW', type: 'sweep' }
  ];
  const ROUTE_KEYS = [{ code: 'KeyQ', seg: 0 }, { code: 'KeyE', seg: 1 }, { code: 'KeyR', seg: 2 }];
  const SPRITE_STATES = { defender: { idle: 0, leap: 2, strike: 3, kick: 4, sweep: 5, hurt: 6 }, attacker: { idle: 0, leap: 2, strike: 3, kick: 4, sweep: 5, hurt: 6 } };

  const bootState = { mode: 'boot', night: 1, wallHP: [100, 100, 100], valor: 0, threat: 'idle', pendingNight: 0, pendingThreat: '' };
  const probe = window.__sb = window.__sb || {};
  probe.state = bootState;
  let liveScene = null;
  probe.forceNight = function (n) {
    const night = clamp(parseInt(n, 10) || 1, 1, 10);
    bootState.pendingNight = night;
    if (liveScene) liveScene.forceNight(night);
  };
  probe.forceThreat = function (kind) {
    bootState.pendingThreat = String(kind || 'grunt');
    if (liveScene) liveScene.forceThreat(bootState.pendingThreat);
  };

  function validSave(obj) {
    const intIn = (value, lo, hi) => Number.isInteger(value) && value >= lo && value <= hi;
    const bools = (value, length) => Array.isArray(value) && value.length === length && value.every((item) => typeof item === 'boolean');
    const medals = Array.isArray(obj && obj.medals) && obj.medals.length === 10 && obj.medals.every((item) => intIn(item, 0, 3));
    const trials = bools(obj && obj.trials, TRIALS.length);
    const unlocked = bools(obj && obj.unlocked, 4);
    const forts = obj && obj.fortLevels == null ? true : Array.isArray(obj.fortLevels) && obj.fortLevels.length === 4 && obj.fortLevels.every((item) => intIn(item, 0, 3));
    const schema = obj && obj.schema == null ? true : intIn(obj && obj.schema, 1, 2);
    return !!obj && schema && medals && trials && unlocked && forts && intIn(obj.bestNight, 0, 10) &&
      (obj.tutorialSeen == null || typeof obj.tutorialSeen === 'boolean');
  }

  const kit = GGKit.create({
    slug: 'siegebreak',
    orientation: 'portrait',
    validateSave: validSave,
    onPause: function () { if (liveScene) liveScene.pausedByKit = true; },
    onResume: function () { if (liveScene) liveScene.pausedByKit = false; },
    onRestart: function () { if (liveScene) liveScene.startRun(1); }
  });
  kit.audio.register({
    steel: 'assets/steel.m4a', clash: 'assets/impact.m4a', kick: 'assets/kick.m4a', sweep: 'assets/sweep.m4a',
    ladder: 'assets/ladder.m4a', rope: 'assets/rope.m4a', ram: 'assets/ram.m4a', tower: 'assets/tower.m4a',
    horn: 'assets/horn.m4a', rally: 'assets/rally.m4a', oil: 'assets/oil.m4a', drum: 'assets/drum.m4a',
    music: 'assets/march.m4a', danger: 'assets/danger.m4a', victory: 'assets/victory.m4a'
  });

  function defaultSave() { return { schema: 2, medals: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], trials: [false, false, false, false, false], bestNight: 0, unlocked: [false, false, false, false], fortLevels: [0, 0, 0, 0], tutorialSeen: false }; }

  class SiegebreakScene extends Phaser.Scene {
    constructor() { super({ key: 'Siegebreak' }); }

    create() {
      liveScene = this;
      this.pausedByKit = false;
      this.saveData = kit.save.get(defaultSave());
      if (!validSave(this.saveData)) this.saveData = defaultSave();
      this.saveData.schema = 2;
      if (!Array.isArray(this.saveData.fortLevels)) this.saveData.fortLevels = [0, 0, 0, 0];
      if (typeof this.saveData.tutorialSeen !== 'boolean') this.saveData.tutorialSeen = false;
      this.state = {
        mode: 'menu', gameMode: 'run', night: 1, wallHP: [100, 100, 100], gateHP: 260,
        valor: 0, threat: 'idle', rampart: 0, trialIndex: -1, trialGoal: 0, clock: 0, banner: null, bannerQueue: [], gateMax: 260,
        nightMedal: 0, breaches: 0, nightBreaches: 0, valorSpent: 0, nightValorSpent: 0, nightValor: 0, ramActive: false,
        oil: 100, oilMax: 130, oilPours: 0, supplies: 0, selectedChip: -1, pendingVault: false,
        fortificationLevel: 0, rampartNotice: '', tutorial: null, wavePreview: null, gamepadConnected: false
      };
      this.refreshProbe();
      this.makeTextures();
      this.makeSpriteSheets();
      this.makePools();
      this.makeDisplayList();
      this.bindInput();
      this.resetSimulation();
      this.refreshProbe();
      kit.loader.progress(1);
      kit.loader.hide();
      kit.registerPWA();
      if (bootState.pendingNight) this.forceNight(bootState.pendingNight);
      if (bootState.pendingThreat) this.forceThreat(bootState.pendingThreat);
    }

    makeTextures() {
      const shell = document.createElement('canvas');
      shell.width = W; shell.height = H;
      const s = shell.getContext('2d');
      s.fillStyle = '#07111b'; s.fillRect(0, 0, W, H);
      s.fillStyle = '#091622'; s.fillRect(0, 0, W, HEADER);
      s.fillStyle = '#0a1522'; s.fillRect(0, RAIL, W, H - RAIL);
      s.fillStyle = 'rgba(255,255,255,.10)'; s.fillRect(0, HEADER - 1, W, 1); s.fillRect(0, RAIL, W, 1);
      s.fillStyle = 'rgba(67,199,244,.28)'; s.fillRect(16, 64, W - 32, 2);
      s.fillStyle = 'rgba(255,255,255,.05)'; s.fillRect(12, RAIL + 9, W - 24, 1);
      this.textures.addCanvas('sb-shell', shell);
      this.battleCanvas = document.createElement('canvas');
      this.battleCanvas.width = W; this.battleCanvas.height = H - HEADER;
      this.textures.addCanvas('sb-battle', this.battleCanvas);
      this.refreshBattleTexture(0);
    }

    refreshBattleTexture(rampartIndex) {
      const c = this.battleCanvas.getContext('2d');
      const oy = HEADER;
      const r = seeded(8191 + rampartIndex * 31);
      c.clearRect(0, 0, W, H - HEADER);
      const sky = c.createLinearGradient(0, 0, 0, GROUND_Y - oy);
      sky.addColorStop(0, '#081321'); sky.addColorStop(0.56, '#162b3a'); sky.addColorStop(1, '#302332');
      c.fillStyle = sky; c.fillRect(0, 0, W, H - HEADER);
      for (let i = 0; i < 34; i++) {
        c.fillStyle = 'rgba(210,235,238,' + (0.15 + r() * 0.35).toFixed(2) + ')';
        c.fillRect(r() * W, 18 + r() * 150, 1 + r() * 1.4, 1 + r() * 1.4);
      }
      c.fillStyle = '#213544';
      c.beginPath(); c.moveTo(0, 225); c.lineTo(58, 176); c.lineTo(104, 219); c.lineTo(153, 164); c.lineTo(219, 224); c.lineTo(270, 180); c.lineTo(338, 226); c.lineTo(W, 169); c.lineTo(W, 290); c.lineTo(0, 290); c.closePath(); c.fill();
      c.fillStyle = 'rgba(7,17,27,.48)'; c.fillRect(0, 276, W, 230 - 0);
      c.fillStyle = '#263240'; c.fillRect(0, GROUND_Y - oy, W, H - GROUND_Y);
      c.strokeStyle = 'rgba(214,198,162,.06)'; c.lineWidth = 1;
      for (let y = GROUND_Y + 14; y < H; y += 22) { c.beginPath(); c.moveTo(0, y - oy); c.lineTo(W, y - oy); c.stroke(); }
      c.fillStyle = '#384a59'; c.fillRect(0, WALL_Y - oy, W, WALL_BOTTOM - WALL_Y);
      c.fillStyle = '#6b7d88'; c.fillRect(0, WALL_Y - oy, W, 8);
      c.fillStyle = '#8798a1';
      for (let x = 8; x < W; x += 30) c.fillRect(x, WALL_Y - oy + 7, 19, 12);
      c.strokeStyle = 'rgba(5,12,18,.34)'; c.lineWidth = 1;
      for (let y = WALL_Y + 22; y < WALL_BOTTOM; y += 18) {
        c.beginPath(); c.moveTo(0, y - oy); c.lineTo(W, y - oy); c.stroke();
        for (let x = ((y / 18) % 2) * 21; x < W; x += 42) { c.beginPath(); c.moveTo(x, y - oy); c.lineTo(x, y - 18 - oy); c.stroke(); }
      }
      c.fillStyle = '#2c211b'; c.fillRect(GATE_X - 7, 364 - oy, GATE_W + 14, 78);
      c.fillStyle = '#8d653d'; roundRectCanvas(c, GATE_X, 350 - oy, GATE_W, 92, 22); c.fill();
      c.strokeStyle = '#3d2a1e'; c.lineWidth = 3;
      for (let x = GATE_X + 12; x < GATE_X + GATE_W; x += 14) { c.beginPath(); c.moveTo(x, 365 - oy); c.lineTo(x, 438 - oy); c.stroke(); }
      c.fillStyle = 'rgba(255,169,77,.12)'; c.fillRect(GATE_X, 350 - oy, GATE_W, 12);
      this.drawLandmark(c, rampartIndex, oy);
      this.textures.get('sb-battle').refresh();
    }

    drawLandmark(c, index, oy) {
      c.save();
      if (index === 0) {
        c.fillStyle = '#314b59'; c.fillRect(28, 168 - oy, 34, 152 - 0); c.fillRect(18, 170 - oy, 54, 10);
        c.fillStyle = '#d6ba72'; c.fillRect(44, 145 - oy, 3, 24); c.fillStyle = '#d55458';
        c.beginPath(); c.moveTo(47, 148 - oy); c.lineTo(72, 156 - oy); c.lineTo(47, 164 - oy); c.closePath(); c.fill();
      } else if (index === 1) {
        for (const x of [56, 334]) { c.fillStyle = '#40505d'; c.fillRect(x - 16, 225 - oy, 32, 95); c.fillStyle = '#70828a'; c.fillRect(x - 23, 218 - oy, 46, 11); c.fillStyle = '#bf8a49'; c.beginPath(); c.moveTo(x - 18, 218 - oy); c.lineTo(x, 198 - oy); c.lineTo(x + 18, 218 - oy); c.closePath(); c.fill(); }
        c.strokeStyle = '#a86944'; c.lineWidth = 5; c.beginPath(); c.moveTo(290, 274 - oy); c.lineTo(355, 246 - oy); c.stroke();
        c.strokeStyle = '#d4ba7f'; c.lineWidth = 2; c.beginPath(); c.moveTo(292, 272 - oy); c.lineTo(356, 251 - oy); c.stroke();
      } else if (index === 2) {
        c.fillStyle = '#3b4652'; c.fillRect(10, 260 - oy, 46, 60); c.fillRect(334, 244 - oy, 46, 76);
        c.strokeStyle = '#c38b55'; c.lineWidth = 3; c.beginPath(); c.moveTo(70, 244 - oy); c.lineTo(116, 314 - oy); c.moveTo(92, 242 - oy); c.lineTo(50, 312 - oy); c.stroke();
        c.strokeStyle = '#e0a34a'; c.lineWidth = 2; c.beginPath(); c.moveTo(12, 278 - oy); c.lineTo(40, 254 - oy); c.moveTo(348, 267 - oy); c.lineTo(375, 248 - oy); c.stroke();
      } else {
        c.fillStyle = '#455e75'; c.fillRect(328, 146 - oy, 38, 174 - 0); c.fillStyle = '#b9d7e0'; c.fillRect(333, 164 - oy, 28, 50);
        c.strokeStyle = '#43c7f4'; c.lineWidth = 2; c.strokeRect(333, 164 - oy, 28, 50);
        c.fillStyle = '#e0a34a'; c.beginPath(); c.arc(347, 155 - oy, 7, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }

    makeSpriteSheets() {
      const make = (key, draw) => {
        const can = document.createElement('canvas'); can.width = 48 * 8; can.height = 64;
        const c = can.getContext('2d'); for (let i = 0; i < 8; i++) draw(c, i * 48, i);
        this.textures.addSpriteSheet(key, can, { frameWidth: 48, frameHeight: 64 });
      };
      make('sb-defender', drawDefenderFrame);
      make('sb-attacker', drawAttackerFrame);
    }

    makePools() {
      this.enemies = [];
      this.ladders = [];
      this.particlePools = { spark: [], debris: [], oil: [], command: [] };
      this.projectiles = [];
      this.floats = [];
      for (let i = 0; i < MAX_ENEMIES; i++) this.enemies.push({ active: false, renderState: 0 });
      for (let i = 0; i < MAX_LADDERS; i++) this.ladders.push({ active: false });
      for (const kind of PARTICLE_KINDS) for (let i = 0; i < PARTICLES_PER_KIND; i++) this.particlePools[kind].push({ active: false, kind: kind });
      for (let i = 0; i < MAX_PROJECTILES; i++) this.projectiles.push({ active: false });
      for (let i = 0; i < MAX_FLOATS; i++) this.floats.push({ active: false });
      this.squads = [
        { type: 'SPEAR', seg: 0, target: 0, route: 0, cd: 0, rallyCd: 0, units: 3 },
        { type: 'ARCHER', seg: 1, target: 1, route: 0, cd: 0, rallyCd: 0, units: 3 },
        { type: 'OIL', seg: 2, target: 2, route: 0, cd: 0, rallyCd: 0, units: 3 }
      ];
      this.hero = { x: 195, y: WALL_Y, face: 1, action: 'idle', actionT: 0, targetX: 195, fromX: 195, attack: 'over', combo: 0, comboT: 0, renderState: 0 };
    }

    makeDisplayList() {
      this.add.image(0, 0, 'sb-shell').setOrigin(0).setDepth(1);
      this.battleLayer = this.add.container(0, 0).setDepth(3);
      this.battleLayer.add(this.add.image(0, HEADER, 'sb-battle').setOrigin(0));
      this.worldG = this.add.graphics(); this.battleLayer.add(this.worldG);
      this.enemySprites = [];
      for (let i = 0; i < MAX_ENEMIES; i++) {
        const sprite = this.add.sprite(-40, -40, 'sb-attacker', 0).setOrigin(0.5, 1).setVisible(false);
        this.enemySprites.push(sprite); this.battleLayer.add(sprite);
      }
      this.heroSprite = this.add.sprite(195, WALL_Y, 'sb-defender', 0).setOrigin(0.5, 1);
      this.battleLayer.add(this.heroSprite);
      this.fxG = this.add.graphics(); this.battleLayer.add(this.fxG);
      this.uiG = this.add.graphics().setDepth(10);
      this.texts = {};
      const normal = { fontFamily: 'Arial, sans-serif', fontSize: '14px', color: CSS.white, stroke: '#07111b', strokeThickness: 3 };
      const small = { fontFamily: 'Arial, sans-serif', fontSize: '10px', color: CSS.muted, stroke: '#07111b', strokeThickness: 2 };
      const title = { fontFamily: 'Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: CSS.white, stroke: '#07111b', strokeThickness: 3 };
      this.texts.logo = this.add.text(15, 13, 'SIEGEBREAK', title).setDepth(11);
      this.texts.night = this.add.text(15, 39, '', normal).setDepth(11);
      this.texts.rampart = this.add.text(98, 39, '', small).setDepth(11);
      this.texts.threat = this.add.text(374, 14, '', small).setOrigin(1, 0).setDepth(11);
      this.texts.valor = this.add.text(374, 39, '', title).setOrigin(1, 0).setDepth(11);
      this.texts.gear = this.add.text(371, 61, '⚙', small).setOrigin(0.5).setDepth(11);
      this.texts.hint = this.add.text(195, 548, '', small).setOrigin(0.5).setDepth(11);
      this.texts.objective = this.add.text(195, 104, '', small).setOrigin(0.5).setDepth(11);
      this.texts.tutorial = this.add.text(195, 88, '', { fontFamily: 'Arial, sans-serif', fontSize: '14px', color: CSS.white, align: 'center', stroke: '#07111b', strokeThickness: 3, wordWrap: { width: 342 } }).setOrigin(0.5).setDepth(13);
      this.texts.banner = this.add.text(195, 230, '', { fontFamily: 'Arial, sans-serif', fontSize: '22px', fontStyle: 'bold', color: CSS.gold, align: 'center', stroke: '#07111b', strokeThickness: 5 }).setOrigin(0.5).setDepth(13);
      this.texts.bannerSub = this.add.text(195, 260, '', { fontFamily: 'Arial, sans-serif', fontSize: '14px', color: CSS.white, align: 'center', stroke: '#07111b', strokeThickness: 3 }).setOrigin(0.5).setDepth(13);
      this.texts.banner.setVisible(false); this.texts.bannerSub.setVisible(false);
      this.buttonTextPool = [];
      for (let i = 0; i < 40; i++) this.buttonTextPool.push(this.add.text(0, 0, '', small).setOrigin(0.5).setDepth(12).setVisible(false));
      this.makeOverlayText('menuTitle', 195, 170, 'SIEGEBREAK', 32, CSS.white);
      this.makeOverlayText('menuSub', 195, 208, 'TEN NIGHTS. ONE RAMPART. BREAK THE SIEGE.', 10, CSS.muted);
      this.makeOverlayText('menuLore', 195, 264, 'CHAIN wall-leaps into overheads, kicks, and sweeps.', 12, CSS.bone);
      this.makeOverlayText('menuInfo', 195, 294, 'RALLY squads. MASH the gate. FIND the vault.', 12, CSS.bone);
      this.makeOverlayText('trialTitle', 195, 98, 'NIGHT TRIALS', 24, CSS.white);
      this.makeOverlayText('trialSub', 195, 126, 'Earn medals to unlock the next challenge.', 11, CSS.muted);
      this.makeOverlayText('shopTitle', 195, 106, '', 25, CSS.gold);
      this.makeOverlayText('shopSub', 195, 137, '', 11, CSS.muted);
      this.makeOverlayText('shopResult', 195, 178, '', 13, CSS.bone);
      this.makeOverlayText('endTitle', 195, 180, '', 25, CSS.white);
      this.makeOverlayText('endSub', 195, 218, '', 12, CSS.muted);
      this.makeOverlayText('endStats', 195, 283, '', 13, CSS.bone);
      this.makeOverlayText('endHint', 195, 515, '', 12, CSS.gold);
      this.overlayKeys = ['menuTitle', 'menuSub', 'menuLore', 'menuInfo', 'trialTitle', 'trialSub', 'shopTitle', 'shopSub', 'shopResult', 'endTitle', 'endSub', 'endStats', 'endHint'];
      this.shopButtons = []; this.menuButtons = []; this.trialButtons = [];
      this.menuButtons.push({ x: 48, y: 350, w: 294, h: 58, action: 'run' }, { x: 48, y: 420, w: 294, h: 58, action: 'trials' });
      for (let i = 0; i < 5; i++) this.trialButtons.push({ x: 24, y: 156 + i * 58, w: 342, h: 48, index: i });
      for (let i = 0; i < 4; i++) this.shopButtons.push({ x: 24, y: 218 + i * 55, w: 342, h: 44, index: i });
      this.fortButton = { x: 24, y: 456, w: 342, h: 38, index: 100 };
      this.shopButtons.push({ x: 24, y: 502, w: 342, h: 52, index: 99 });
      this.endButton = { x: 66, y: 450, w: 258, h: 56 };
      this.railRects = [{ x: 10, y: 590, w: 86, h: 68 }, { x: 101, y: 590, w: 86, h: 68 }, { x: 192, y: 590, w: 86, h: 68 }, { x: 286, y: 590, w: 94, h: 68 }];
      this.prevKeys = Object.create(null);
      this.globalKeys = Object.create(null);
      this.pointerStarts = Object.create(null);
      this.gamepadPrev = [];
    }

    makeOverlayText(key, x, y, text, size, color) {
      this.texts[key] = this.add.text(x, y, text, { fontFamily: 'Arial, sans-serif', fontSize: size + 'px', fontStyle: size >= 22 ? 'bold' : 'normal', color: color, align: 'center', stroke: '#07111b', strokeThickness: 4 }).setOrigin(0.5).setDepth(12);
    }

    bindInput() {
      this.input.on('pointerdown', (pointer) => {
        if (kit.paused) return;
        const id = pointer.event && pointer.event.pointerId != null ? pointer.event.pointerId : pointer.id;
        const clientX = pointer.event && pointer.event.clientX != null ? pointer.event.clientX : pointer.x;
        const clientY = pointer.event && pointer.event.clientY != null ? pointer.event.clientY : pointer.y;
        if (!kit.input.pointers.has(id)) kit.input.pointers.set(id, { x: clientX, y: clientY, startX: clientX, startY: clientY, downAt: performance.now(), zone: 'claimed' });
        this.pointerStarts[id] = { x: pointer.x, y: pointer.y };
        if (this.handlePress(pointer.x, pointer.y)) this.pointerStarts[id].claimed = true;
      });
      this.input.on('pointerup', (pointer) => {
        const id = pointer.event && pointer.event.pointerId != null ? pointer.event.pointerId : pointer.id;
        const start = this.pointerStarts[id]; delete this.pointerStarts[id];
        if (!start || start.claimed || kit.paused) return;
        const dx = pointer.x - start.x, dy = pointer.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const dir = distance > 24 ? (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')) : 'tap';
        this.handleRelease(start.x, start.y, dir);
      });
      this.input.on('pointermove', (pointer) => {
        const id = pointer.event && pointer.event.pointerId != null ? pointer.event.pointerId : pointer.id;
        const p = kit.input.pointers.get(id); if (p) { p.x = pointer.event && pointer.event.clientX != null ? pointer.event.clientX : pointer.x; p.y = pointer.event && pointer.event.clientY != null ? pointer.event.clientY : pointer.y; }
      });
    }

    handlePress(x, y) {
      if (x > 344 && y < 72) { this.openSettings(); return true; }
      if (this.state.mode === 'menu') {
        if (rectHit(x, y, this.menuButtons[0])) { this.startRun(1); return true; }
        if (rectHit(x, y, this.menuButtons[1])) { this.state.mode = 'trialSelect'; return true; }
        return false;
      }
      if (this.state.mode === 'trialSelect') {
        for (const b of this.trialButtons) if (rectHit(x, y, b)) { this.startTrial(b.index); return true; }
        if (y < 70) { this.state.mode = 'menu'; return true; }
        return false;
      }
      if (this.state.mode === 'intermission') {
        for (const b of this.shopButtons) if (rectHit(x, y, b)) { this.shopTap(b.index); return true; }
        if (rectHit(x, y, this.fortButton)) { this.fortifyRampart(); return true; }
        return false;
      }
      if (this.state.mode === 'victory' || this.state.mode === 'defeat' || this.state.mode === 'trialComplete') {
        if (rectHit(x, y, this.endButton)) { this.state.mode = 'menu'; return true; }
        return false;
      }
      if (y >= 574) {
        for (let i = 0; i < 3; i++) if (rectHit(x, y, this.railRects[i])) { this.state.selectedChip = this.state.selectedChip === i ? -1 : i; this.audio('steel'); return true; }
        if (rectHit(x, y, this.railRects[3])) { if (this.state.bannerCharge >= 100) this.bannerBurst(); return true; }
        return true;
      }
      if ((this.state.mode === 'play' || this.state.mode === 'vault') && this.state.ramActive && x > GATE_X - 22 && x < GATE_X + GATE_W + 22 && y > 340 && y < 446) { this.pourGate(); return true; }
      return false;
    }

    openSettings() {
      kit.openSettings([function (box, row) { row('Reduced motion', function () { return !kit.juice.enabled; }, function (v) { kit.juice.enabled = !v; }); }]);
    }

    handleRelease(x, y, dir) {
      if (this.state.mode !== 'play' && this.state.mode !== 'vault') return;
      if (y < HEADER || y > RAIL) return;
      if (this.state.selectedChip >= 0) { this.orderSquad(this.state.selectedChip, clamp(Math.floor(x / 130), 0, 2)); this.state.selectedChip = -1; return; }
      if (this.state.ramActive && x > GATE_X - 22 && x < GATE_X + GATE_W + 22 && y > 340 && y < 446) return;
      this.commandHero(clamp(x, 18, W - 18), dir === 'down' ? 'kick' : (dir === 'left' || dir === 'right' ? 'sweep' : 'over'));
    }

    startRun(night) {
      this.state.mode = 'play'; this.state.gameMode = 'run'; this.state.trialIndex = -1; this.state.pendingVault = false;
      this.state.valor = 0; this.state.wallHP[0] = 100; this.state.wallHP[1] = 100; this.state.wallHP[2] = 100; this.state.gateMax = 260; this.state.gateHP = 260;
      this.state.night = clamp(night || 1, 1, 10); this.state.breaches = 0; this.state.nightBreaches = 0; this.state.valorSpent = 0; this.state.nightValorSpent = 0; this.state.bannerCharge = 18; this.state.oil = 100; this.state.supplies = 0;
      this.saveData = kit.save.get(defaultSave());
      if (!validSave(this.saveData)) this.saveData = defaultSave();
      if (!Array.isArray(this.saveData.fortLevels)) this.saveData.fortLevels = [0, 0, 0, 0];
      if (typeof this.saveData.tutorialSeen !== 'boolean') this.saveData.tutorialSeen = false;
      this.saveData.schema = 2; kit.save.set(this.saveData);
      this.resetUpgradeState();
      for (let i = 0; i < 4; i++) for (let level = 0; level < (this.saveData.fortLevels[i] || (this.saveData.unlocked[i] ? 1 : 0)); level++) this.applyRampartUpgrade(i);
      for (const sq of this.squads) { sq.seg = sq.target = this.squads.indexOf(sq); sq.route = 0; sq.units = 3; sq.cd = 0; sq.rallyCd = 0; }
      this.state.tutorial = this.saveData.tutorialSeen ? null : { step: 0, age: 0 };
      kit.audio.music('music', 600);
      this.startNight(this.state.night);
      const rampartNotice = this.state.rampartNotice ? RAMPARTS[this.state.rampart].name + ' · ' + this.state.rampartNotice : RAMPARTS[this.state.rampart].name;
      this.state.rampartNotice = '';
      this.showBanner('NIGHT ' + this.state.night, rampartNotice, 'night');
    }

    startTrial(index) {
      const trial = TRIALS[index];
      if (!trial || !this.trialUnlocked(index)) return;
      this.state.mode = 'play'; this.state.gameMode = 'trial'; this.state.trialIndex = index; this.state.pendingVault = false; this.state.tutorial = null;
      this.state.valor = 80; this.state.wallHP[0] = 100; this.state.wallHP[1] = 100; this.state.wallHP[2] = 100; this.state.gateMax = 260; this.state.gateHP = 260;
      this.state.night = trial.night; this.state.breaches = 0; this.state.nightBreaches = 0; this.state.valorSpent = 0; this.state.nightValorSpent = 0; this.state.bannerCharge = 30; this.state.oil = 100; this.state.supplies = 0;
      if (!Array.isArray(this.saveData.fortLevels)) this.saveData.fortLevels = [0, 0, 0, 0];
      this.resetUpgradeState();
      for (let i = 0; i < 4; i++) for (let level = 0; level < (this.saveData.fortLevels[i] || (this.saveData.unlocked[i] ? 1 : 0)); level++) this.applyRampartUpgrade(i);
      for (let i = 0; i < this.squads.length; i++) { this.squads[i].seg = this.squads[i].target = i; this.squads[i].route = 0; this.squads[i].units = 3; this.squads[i].cd = 0; this.squads[i].rallyCd = 0; }
      this.startNight(trial.night);
      this.state.trialGoal = 0; this.state.rampartNotice = ''; this.showBanner('TRIAL ' + (index + 1), trial.title, 'trial');
    }

    trialUnlocked(index) { return index === 0 || !!this.saveData.trials[index - 1] || this.saveData.medals[TRIALS[index - 1].night - 1] >= 2; }

    previewLabel(event) {
      return event.k === 'ram' ? 'RAM' : event.k === 'tower' ? 'TOWER' : event.k === 'elite' ? 'ELITE' : event.k === 'grapple' ? 'ROPE' : 'LADDER';
    }

    advanceTutorial(action) {
      const tutorial = this.state.tutorial;
      if (!tutorial) return;
      const expected = ['over', 'kick', 'rallySquad', 'pour', 'rally'][tutorial.step];
      if (action !== expected) return;
      tutorial.step++;
      tutorial.age = 0;
      if (tutorial.step >= 5) {
        this.saveData.tutorialSeen = true;
        kit.save.set(this.saveData);
        this.state.tutorial = null;
        this.showBanner('TUTORIAL COMPLETE', '', 'supply');
      }
    }

    startNight(night) {
      this.state.night = clamp(night, 1, 10);
      this.state.rampart = this.state.night >= 10 ? 3 : this.state.night >= 6 ? 2 : this.state.night >= 3 ? 1 : 0;
      this.refreshBattleTexture(this.state.rampart);
      const upgrade = this.state.rampart;
      this.state.rampartNotice = '';
      if (!this.saveData.unlocked[upgrade]) { this.saveData.unlocked[upgrade] = true; this.saveData.fortLevels[upgrade] = Math.max(1, this.saveData.fortLevels[upgrade] || 0); this.applyRampartUpgrade(upgrade); this.state.rampartNotice = RAMPARTS[upgrade].upgrade; kit.save.set(this.saveData); }
      if (!this.saveData.fortLevels[upgrade]) this.saveData.fortLevels[upgrade] = 1;
      this.state.fortificationLevel = this.saveData.fortLevels[upgrade];
      this.waveEvents = this.state.gameMode === 'vault' ? VAULT_WAVE : WAVE_TABLE[this.state.night - 1];
      this.waveIndex = 0; this.waveClock = 0; this.wavePreview = null; this.waveDuration = (this.waveEvents[this.waveEvents.length - 1] ? this.waveEvents[this.waveEvents.length - 1].t : 20) + 5;
      this.state.threat = 'WATCH THE APPROACHES'; this.state.ramActive = false; this.state.oil = Math.max(this.state.oil, 68); this.state.oilPours = 0; this.state.nightValor = 0; this.state.nightBreaches = 0; this.state.breaches = 0; this.state.nightValorSpent = 0; this.state.valorSpent = 0;
      this.clearPools(); this.resetHero();
      this.refreshProbe(); kit.loader.progress(1);
    }

    forceNight(night) { this.startRun(night); }

    forceThreat(kind) {
      if (this.state.mode === 'menu' || this.state.mode === 'trialSelect') this.startRun(this.state.night || 1);
      const k = String(kind || 'grunt').toLowerCase();
      const safe = ENEMY[k] ? k : 'grunt';
      this.spawnEnemy(safe, 1); this.state.threat = safe.toUpperCase() + ' INBOUND'; this.refreshProbe();
    }

    resetUpgradeState() { this.gateMax = 260; this.archerPower = 1; this.kickPower = 1; this.heroPower = 1; this.wallRepair = 45; if (this.state) this.state.oilMax = 130; }

    applyRampartUpgrade(index) {
      if (index === 0) { this.gateMax = 340; this.state.gateMax = 340; this.state.gateHP = Math.min(this.gateMax, this.state.gateHP + 80); this.state.oilMax = 150; this.state.oil = Math.min(this.state.oilMax, 120); }
      if (index === 1) this.archerPower = (this.archerPower || 1) + 0.35;
      if (index === 2) this.wallRepair = (this.wallRepair || 45) + 20;
      if (index === 3) this.kickPower = (this.kickPower || 1) + 0.25;
    }

    clearPools() {
      for (const e of this.enemies) e.active = false;
      for (const l of this.ladders) l.active = false;
      for (const kind of PARTICLE_KINDS) for (const p of this.particlePools[kind]) p.active = false;
      for (const p of this.projectiles) p.active = false;
      for (const f of this.floats) f.active = false;
      this.state.ramActive = false;
    }

    resetSimulation() {
      this.state.bannerCharge = 0; this.resetUpgradeState();
      this.resetHero(); this.clearPools();
    }

    resetHero() { this.hero.x = 195; this.hero.y = WALL_Y; this.hero.face = 1; this.hero.action = 'idle'; this.hero.actionT = 0; this.hero.targetX = 195; this.hero.fromX = 195; this.hero.combo = 0; this.hero.comboT = 0; }

    spawnEnemy(kind, seg) {
      let e = null; for (const candidate of this.enemies) if (!candidate.active) { e = candidate; break; }
      if (!e) return null;
      const d = ENEMY[kind]; const scale = 1 + (this.state.night - 1) * 0.1 + (this.state.gameMode === 'vault' ? 0.35 : 0);
      e.active = true; e.kind = kind; e.seg = clamp(seg | 0, 0, 2); e.x = clamp(SEG_CENTERS[e.seg] + (e.seg - 1) * 9, 20, 370); e.y = GROUND_Y + (kind === 'ram' || kind === 'tower' ? 70 : 26); e.hp = d.hp * scale; e.max = e.hp; e.state = 'ground'; e.shield = kind === 'elite'; e.ladder = -1; e.build = 0; e.attackT = 0.8; e.tele = 0; e.hurt = 0; e.wob = 0; e.tx = e.x; e.arrived = false; e.unloadT = 3.2; e.renderState = 0;
      if (kind === 'ram') { e.x = 195; e.tx = 195; }
      if (kind === 'tower') e.tx = SEG_CENTERS[e.seg];
      this.state.threat = kind === 'ram' ? 'RAM AT THE GATE' : kind === 'tower' ? 'SIEGE TOWER' : kind === 'elite' ? 'SHIELDED ELITE' : kind === 'grapple' ? 'GRAPPLE ROPE' : 'LADDER RUSH';
      this.audio(kind === 'ram' ? 'ram' : kind === 'tower' ? 'tower' : kind === 'grapple' ? 'rope' : 'ladder');
      return e;
    }

    spawnLadder(x, seg, rope) {
      for (const l of this.ladders) if (!l.active) { l.active = true; l.x = x; l.seg = seg; l.rope = !!rope; l.hp = rope ? 1 : 3; return this.ladders.indexOf(l); }
      return -1;
    }

    damageEnemy(e, amount, source) {
      if (!e.active) return;
      let damage = amount;
      if (e.shield && source !== 'kick' && source !== 'banner') damage *= 0.18;
      e.hp -= damage; e.hurt = 0.13; e.renderState = 5;
      this.burst(e.x, e.y - 24, source === 'kick' ? COLORS.amber : COLORS.white, source === 'banner' ? 8 : 4, 'spark');
      if (e.hp <= 0) this.killEnemy(e);
    }

    killEnemy(e) {
      if (!e.active) return;
      const reward = ENEMY[e.kind].reward;
      this.state.valor += reward; this.state.nightValor += reward;
      this.state.bannerCharge = clamp(this.state.bannerCharge + (e.kind === 'ram' || e.kind === 'tower' ? 13 : 5), 0, 100);
      this.burst(e.x, e.y - 18, e.kind === 'elite' ? COLORS.violet : COLORS.enemy, e.kind === 'tower' || e.kind === 'ram' ? 16 : 8, 'debris');
      if (e.kind === 'ram' || e.kind === 'tower') this.shake(e.kind === 'tower' ? 6 : 8);
      if (this.state.trialIndex >= 0) {
        const trial = TRIALS[this.state.trialIndex];
        if (trial.id === 'first-rung' && e.kind === 'grunt') this.state.trialGoal += 0;
      }
      e.active = false;
    }

    commandHero(x, attack) {
      if (this.hero.action !== 'idle' && this.hero.action !== 'recover') return;
      this.hero.fromX = this.hero.x; this.hero.targetX = x; this.hero.face = sign(x - this.hero.x) || this.hero.face; this.hero.attack = attack; this.hero.action = 'leap'; this.hero.actionT = 0; this.hero.actionDur = clamp(Math.abs(x - this.hero.x) / 620, 0.14, 0.36); this.audio('steel'); this.advanceTutorial(attack);
      this.burst(x, WALL_Y - 2, COLORS.player, 4, 'command');
    }

    resolveHeroAttack() {
      const h = this.hero; const type = h.attack; let hits = 0; let range = type === 'sweep' ? 74 : type === 'kick' ? 58 : 48;
      const base = (type === 'over' ? 45 : type === 'sweep' ? 27 : 20) * (this.heroPower || 1);
      for (const e of this.enemies) {
        if (!e.active || e.kind === 'ram') continue;
        const reachY = e.state === 'top' || (e.state === 'climb' && e.y < WALL_Y + (type === 'kick' ? 72 : 44));
        if (!reachY || Math.abs(e.x - h.x) > range) continue;
        if (type === 'over' && e.kind === 'grapple' && e.state === 'climb' && this.state.trialIndex >= 0 && TRIALS[this.state.trialIndex].id === 'rope-line') this.state.trialGoal++;
        if (type === 'kick' && e.shield) { e.shield = false; this.state.trialGoal += this.state.trialIndex >= 0 && TRIALS[this.state.trialIndex].id === 'shield-law' ? 1 : 0; this.float(e.x, e.y - 54, 'SHIELD BROKEN', CSS.violet); this.burst(e.x, e.y - 28, COLORS.violet, 12, 'spark'); }
        this.damageEnemy(e, base * (type === 'kick' ? this.kickPower : 1), type); hits++;
        if (type === 'kick' && e.active && e.state === 'climb') { e.state = 'fall'; e.ladder = -1; e.vy = -80; }
        if (type === 'sweep' && e.active) { e.x += sign(e.x - h.x) * 18; }
      }
      if (type === 'kick') {
        for (const l of this.ladders) if (l.active && Math.abs(l.x - h.x) < range) {
          const ladderIndex = this.ladders.indexOf(l);
          const attached = this.enemies.some((e) => e.active && e.ladder === ladderIndex && e.state === 'climb');
          l.active = false; hits++; this.state.trialGoal += attached && !l.rope && this.state.trialIndex >= 0 && TRIALS[this.state.trialIndex].id === 'first-rung' ? 1 : 0;
          this.float(l.x, WALL_Y - 34, l.rope ? 'ROPE CUT' : 'LADDER DOWN', CSS.amber); this.burst(l.x, WALL_Y + 24, COLORS.amber, 10, 'debris');
          for (const e of this.enemies) if (e.active && e.ladder === this.ladders.indexOf(l)) { e.state = 'fall'; e.ladder = -1; e.vy = -80; }
        }
      }
      if (hits) { h.combo = clamp(h.combo + 1, 1, 9); h.comboT = 1.4; this.state.bannerCharge = clamp(this.state.bannerCharge + 4 + h.combo, 0, 100); this.shake(type === 'over' ? 3 : 2); kit.juice.hitStop(type === 'over' ? 54 : 42); this.audio(type === 'kick' ? 'kick' : type === 'sweep' ? 'sweep' : 'clash'); }
    }

    bannerBurst() {
      if (this.state.bannerCharge < 100) return;
      this.state.bannerCharge = 0; this.audio('rally'); this.shake(8); this.advanceTutorial('rally');
      for (const e of this.enemies) if (e.active) { if (e.state === 'climb') { e.state = 'fall'; e.ladder = -1; e.vy = -100; } this.damageEnemy(e, e.kind === 'ram' || e.kind === 'tower' ? 70 : 50, 'banner'); }
      for (const l of this.ladders) if (l.active && l.rope) l.active = false;
      this.showBanner('RALLY BURST', 'All walls', 'rally'); this.burst(195, WALL_Y, COLORS.gold, 26, 'burst');
    }

    pourGate() {
      if (this.state.oil < 12 || !this.state.ramActive) return;
      this.state.oil -= 12; this.state.oilPours++; this.audio('oil'); this.burst(GATE_X + GATE_W * 0.5, 372, COLORS.oil, 10, 'oil'); this.shake(2);
      for (const e of this.enemies) if (e.active && e.kind === 'ram') { this.damageEnemy(e, 32, 'oil'); }
      this.state.bannerCharge = clamp(this.state.bannerCharge + 3, 0, 100);
      this.advanceTutorial('pour');
      if (this.state.trialIndex >= 0 && TRIALS[this.state.trialIndex].id === 'oil-rain') this.state.trialGoal++;
    }

    orderSquad(index, seg) {
      const sq = this.squads[index]; if (!sq || sq.units <= 0 || sq.rallyCd > 0) { if (sq && sq.rallyCd > 0) this.float(SEG_CENTERS[seg], WALL_Y - 55, 'RALLY COOLDOWN', CSS.muted); return false; }
      sq.target = seg; sq.route = 1; this.state.selectedChip = -1; this.float(SEG_CENTERS[seg], WALL_Y - 55, sq.type + ' RALLIED', CSS.player);
      sq.rallyCd = RALLY_COOLDOWN; this.burst(SEG_CENTERS[seg], WALL_Y - 8, COLORS.player, 5, 'command'); this.audio('horn'); this.advanceTutorial('rallySquad'); return true;
    }

    step(dt) {
      this.state.clock += dt;
      if (this.state.banner) {
        this.state.banner.life -= dt;
        if (this.state.banner.life <= 0) this.state.banner = this.state.bannerQueue.shift() || null;
      }
      if (this.state.mode !== 'play' && this.state.mode !== 'vault') return;
      if (this.state.tutorial) this.state.tutorial.age += dt;
      this.waveClock += dt;
      const nextEvent = this.waveEvents[this.waveIndex];
      if (nextEvent && !this.wavePreview && nextEvent.t > this.waveClock && nextEvent.t - this.waveClock <= WAVE_PREVIEW_LEAD) {
        this.wavePreview = { event: nextEvent, pulse: 0 };
        this.state.threat = this.previewLabel(nextEvent) + ' IN ' + (nextEvent.t - this.waveClock).toFixed(1) + 's';
        this.audio('danger');
      }
      while (this.waveIndex < this.waveEvents.length && this.waveEvents[this.waveIndex].t <= this.waveClock) { const ev = this.waveEvents[this.waveIndex++]; this.wavePreview = null; this.spawnEnemy(ev.k, ev.s); }
      if (this.wavePreview) { this.wavePreview.pulse += dt; this.state.threat = this.previewLabel(this.wavePreview.event) + ' IN ' + Math.max(0, this.wavePreview.event.t - this.waveClock).toFixed(1) + 's'; }
      this.stepHero(dt); this.stepEnemies(dt); this.stepLadders(); this.stepSquads(dt); this.stepProjectiles(dt); this.stepParticles(dt); this.stepFloats(dt);
      if (this.waveClock > 5 && Math.floor(this.waveClock / 12) > this.state.supplies) this.supplyDrop();
      this.checkClear(); this.refreshProbe();
    }

    stepHero(dt) {
      const h = this.hero;
      if (h.comboT > 0) { h.comboT -= dt; if (h.comboT <= 0) h.combo = 0; }
      if (h.action === 'leap') { h.actionT += dt; const k = clamp(h.actionT / h.actionDur, 0, 1); h.x = lerp(h.fromX, h.targetX, k); h.y = WALL_Y - Math.sin(k * Math.PI) * Math.min(48, Math.abs(h.targetX - h.fromX) * 0.34 + 12); if (k >= 1) { h.action = 'windup'; h.actionT = 0.17; h.y = WALL_Y; } }
      else if (h.action === 'windup') { h.actionT -= dt; if (h.actionT <= 0) { h.action = 'strike'; h.actionT = 0.16; this.resolveHeroAttack(); } }
      else if (h.action === 'strike') { h.actionT -= dt; if (h.actionT <= 0) { h.action = 'recover'; h.actionT = 0.12; } }
      else if (h.action === 'recover') { h.actionT -= dt; if (h.actionT <= 0) h.action = 'idle'; }
      if ((kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) && h.action === 'idle') { h.x = clamp(h.x - 170 * dt, 18, W - 18); h.face = -1; }
      if ((kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) && h.action === 'idle') { h.x = clamp(h.x + 170 * dt, 18, W - 18); h.face = 1; }
      for (const item of HERO_KEYS) if (kit.input.keyDown(item.code) && !this.prevKeys[item.code]) this.commandHero(h.x + h.face * (item.type === 'sweep' ? 34 : 0), item.type);
      for (const item of HERO_KEYS) this.prevKeys[item.code] = kit.input.keyDown(item.code);
      if (kit.input.keyDown('Digit1') && !this.prevKeys.Digit1) this.state.selectedChip = 0;
      if (kit.input.keyDown('Digit2') && !this.prevKeys.Digit2) this.state.selectedChip = 1;
      if (kit.input.keyDown('Digit3') && !this.prevKeys.Digit3) this.state.selectedChip = 2;
      this.prevKeys.Digit1 = kit.input.keyDown('Digit1'); this.prevKeys.Digit2 = kit.input.keyDown('Digit2'); this.prevKeys.Digit3 = kit.input.keyDown('Digit3');
      for (const route of ROUTE_KEYS) if (kit.input.keyDown(route.code) && !this.prevKeys[route.code] && this.state.selectedChip >= 0) this.orderSquad(this.state.selectedChip, route.seg);
      for (const route of ROUTE_KEYS) this.prevKeys[route.code] = kit.input.keyDown(route.code);
    }

    stepEnemies(dt) {
      this.state.ramActive = false;
      for (const e of this.enemies) {
        if (!e.active) continue;
        const d = ENEMY[e.kind]; e.wob += dt * 4; if (e.hurt > 0) e.hurt -= dt;
        if (e.kind === 'ram') {
          if (e.y > GROUND_Y + 4) e.y -= d.speed * dt * 2.3;
          else { e.y = GROUND_Y + 4; this.state.ramActive = true; e.attackT -= dt; if (e.attackT <= 0) { e.attackT = 0.86; this.state.gateHP -= d.dps * (1 + this.state.night * 0.06); this.burst(GATE_X + GATE_W * 0.5, 380, COLORS.enemy, 4, 'debris'); this.audio('drum'); } if (this.state.gateHP <= 0) { this.state.gateHP = 0; this.lose(); return; } }
          continue;
        }
        if (e.kind === 'tower') {
          if (!e.arrived) { e.y -= d.speed * dt * 1.9; e.x = lerp(e.x, e.tx, dt * 0.55); if (e.y <= GROUND_Y + 8) { e.y = GROUND_Y + 8; e.arrived = true; this.burst(e.x, e.y, COLORS.slate, 12, 'debris'); } }
          else { e.unloadT -= dt; if (e.unloadT <= 0) { e.unloadT = 3.3; const child = this.spawnEnemy(this.state.night >= 7 || this.state.mode === 'vault' ? 'elite' : 'grunt', e.seg); if (child) { child.state = 'top'; child.x = e.x + 1; child.y = WALL_Y; } } }
          continue;
        }
        if (e.state === 'ground') {
          if (e.y > GROUND_Y) { e.y -= d.speed * dt * 1.6; e.x = lerp(e.x, e.tx, dt * 0.8); }
          else { e.y = GROUND_Y; e.build += dt; if (e.kind === 'grapple' || e.build > 0.62) { e.ladder = this.spawnLadder(e.x, e.seg, e.kind === 'grapple'); e.state = e.ladder >= 0 ? 'climb' : 'ground'; e.build = 0; } }
        } else if (e.state === 'climb') {
          const l = e.ladder >= 0 ? this.ladders[e.ladder] : null;
          if (!l || !l.active) { e.state = 'fall'; e.vy = -70; e.ladder = -1; }
          else { e.x = l.x; e.y -= d.climb * dt; if (e.y <= WALL_Y) { e.y = WALL_Y; e.state = 'top'; e.ladder = -1; } }
        } else if (e.state === 'fall') {
          e.vy += 500 * dt; e.y += e.vy * dt; if (e.y >= GROUND_Y) { e.y = GROUND_Y; e.state = 'ground'; e.vy = 0; this.damageEnemy(e, 18, 'fall'); }
        } else if (e.state === 'top') {
          const seg = clamp(Math.floor(e.x / 130), 0, 2);
          if (this.state.wallHP[seg] <= 0) { e.x += sign(SEG_CENTERS[seg === 1 ? 0 : 1] - e.x) * dt * 18; continue; }
          e.attackT -= dt; if (e.attackT <= 0) { e.attackT = e.kind === 'elite' ? 1.05 : 0.82; e.tele = 0.42; }
          if (e.tele > 0) { e.tele -= dt; if (e.tele <= 0) { this.state.wallHP[seg] = Math.max(0, this.state.wallHP[seg] - d.dps * (1 + this.state.night * 0.05)); this.state.nightBreaches += this.state.wallHP[seg] === 0 ? 1 : 0; this.state.breaches = this.state.nightBreaches; this.burst(e.x, WALL_Y + 8, COLORS.wallLight, 4, 'debris'); if (this.state.wallHP[seg] <= 0 && this.state.wallHP.filter(v => v > 0).length === 0) { this.lose(); return; } } }
        }
        e.renderState = e.hurt > 0 ? SPRITE_STATES.attacker.hurt : e.state === 'climb' ? SPRITE_STATES.attacker.leap : e.state === 'top' ? SPRITE_STATES.attacker.strike : SPRITE_STATES.attacker.idle;
      }
    }

    stepLadders() { for (const l of this.ladders) if (l.active && l.hp <= 0) l.active = false; }

    stepSquads(dt) {
      for (let i = 0; i < this.squads.length; i++) {
        const sq = this.squads[i]; sq.rallyCd = Math.max(0, sq.rallyCd - dt); if (sq.route > 0) { sq.route -= dt / 0.9; if (sq.route <= 0) { sq.route = 0; sq.seg = sq.target; } continue; }
        if (sq.units <= 0) continue; sq.cd -= dt; if (sq.cd > 0) continue;
        const target = this.pickSquadTarget(sq);
        if (!target) { sq.cd = 0.4; continue; }
        if (sq.type === 'SPEAR') { sq.cd = 0.52; this.damageEnemy(target, 11 + sq.units * 2, 'spear'); this.projectile(SEG_CENTERS[sq.seg], WALL_Y - 12, target.x, target.y - 20, COLORS.player); }
        else if (sq.type === 'ARCHER') { sq.cd = 0.72; this.damageEnemy(target, (9 + sq.units * 2) * (this.archerPower || 1), 'arrow'); this.projectile(SEG_CENTERS[sq.seg], WALL_Y - 16, target.x, target.y - 20, COLORS.playerLight); }
        else { sq.cd = 3.6; this.damageEnemy(target, 28 + sq.units * 5, 'oil'); this.burst(target.x, target.y - 12, COLORS.oil, 8, 'oil'); if (target.active && target.state === 'climb') { target.state = 'fall'; target.ladder = -1; target.vy = -55; } this.audio('oil'); }
      }
    }

    pickSquadTarget(sq) {
      const lo = SEGMENTS[sq.seg].lo - 18, hi = SEGMENTS[sq.seg].hi + 18;
      let target = null, best = -Infinity;
      for (const e of this.enemies) {
        if (!e.active || e.x < lo || e.x > hi) continue;
        const score = this.squadTargetScore(sq, e);
        if (score > best) { best = score; target = e; }
      }
      return target;
    }

    squadTargetScore(sq, e) {
      const distance = Math.abs(e.x - SEG_CENTERS[sq.seg]);
      let score = -Infinity;
      if (sq.type === 'SPEAR' && (e.state === 'climb' || e.state === 'top')) {
        score = e.state === 'climb' ? 140 : 96;
        if (e.kind === 'elite') score += 34;
        if (e.kind === 'grapple') score += 22;
      } else if (sq.type === 'ARCHER' && (e.state === 'ground' || e.kind === 'ram' || e.kind === 'tower')) {
        score = e.kind === 'ram' ? 220 : e.kind === 'tower' ? 185 : 70;
        if (e.kind === 'elite') score += 18;
      } else if (sq.type === 'OIL' && (e.state === 'climb' || e.state === 'ground' || e.kind === 'ram')) {
        score = e.kind === 'ram' ? 210 : e.state === 'climb' ? 170 : 52;
        if (e.kind === 'grapple') score += 28;
      }
      return score - distance * 0.18 - Math.max(0, e.y - WALL_Y) * 0.04;
    }

    stepProjectiles(dt) { for (const p of this.projectiles) if (p.active) { p.t += dt * p.speed; if (p.t >= 1) p.active = false; } }
    stepParticles(dt) { for (const kind of PARTICLE_KINDS) for (const p of this.particlePools[kind]) if (p.active) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.kind === 'oil' ? 120 : 240) * dt; if (p.life <= 0) p.active = false; } }
    stepFloats(dt) { for (const f of this.floats) if (f.active) { f.life -= dt; f.y -= 18 * dt; if (f.life <= 0) f.active = false; } }

    supplyDrop() {
      this.state.supplies++; this.state.valor += 14; this.state.nightValor += 14; this.state.oil = clamp(this.state.oil + 30, 0, this.state.oilMax);
      const sq = this.squads[this.state.supplies % 3]; sq.units = clamp(sq.units + 1, 1, 5); this.showBanner('SUPPLY +14 VALOR +OIL', sq.type + ' +1', 'supply'); this.audio('horn');
    }

    checkClear() {
      let active = 0; for (const e of this.enemies) if (e.active) active++;
      if (this.waveIndex < this.waveEvents.length || this.wavePreview || active > 0 || this.waveClock < this.waveDuration) return;
      if (this.state.gameMode === 'trial') { this.finishTrial(); return; }
      if (this.state.gameMode === 'vault') { this.vaultComplete(); return; }
      const noBreach = this.state.nightBreaches === 0;
      const efficient = this.state.nightValorSpent <= Math.max(20, this.state.nightValor * 0.6);
      this.state.nightMedal = noBreach && efficient ? 3 : noBreach ? 2 : 1;
      this.saveData.medals[this.state.night - 1] = Math.max(this.saveData.medals[this.state.night - 1] || 0, this.state.nightMedal);
      this.saveData.bestNight = Math.max(this.saveData.bestNight, this.state.night); kit.save.set(this.saveData);
      const reward = 24 + this.state.night * 9; this.state.valor += reward; this.state.nightValor += reward;
      if (this.state.night >= 10) { this.state.pendingVault = true; this.state.mode = 'intermission'; this.showBanner('NIGHT 10 CLEAR', 'The vault doors are awake.', 'clear'); }
      else { this.state.mode = 'intermission'; this.showBanner('NIGHT ' + this.state.night + ' CLEAR', 'Valor +' + reward + '  |  medal ' + ['-', 'BRONZE', 'SILVER', 'GOLD'][this.state.nightMedal], 'clear'); }
      this.audio('horn');
    }

    finishTrial() {
      const trial = TRIALS[this.state.trialIndex]; let passed = false;
      if (trial.id === 'three-walls') passed = this.state.wallHP[0] >= 70 && this.state.wallHP[1] >= 70 && this.state.wallHP[2] >= 70;
      else passed = this.state.trialGoal >= trial.target;
      this.saveData.trials[this.state.trialIndex] = passed; kit.save.set(this.saveData); this.state.mode = 'trialComplete';
      this.state.nightMedal = passed ? 3 : 1; this.showBanner(passed ? 'TRIAL CLEAR' : 'TRIAL FAILED', passed ? trial.goal + ' complete.' : 'Try the route again.', 'trial'); this.audio(passed ? 'horn' : 'drum');
    }

    startVault() {
      this.state.mode = 'vault'; this.state.gameMode = 'vault'; this.state.pendingVault = false; this.state.rampart = 3; this.state.gateHP = Math.max(this.state.gateHP, 180); for (let i = 0; i < 3; i++) this.state.wallHP[i] = Math.max(this.state.wallHP[i], 55); this.state.night = 10; this.refreshBattleTexture(3); this.waveEvents = VAULT_WAVE; this.waveIndex = 0; this.waveClock = 0; this.wavePreview = null; this.waveDuration = 37; this.clearPools(); this.state.threat = 'THE VAULT OPENS'; kit.audio.music('danger', 400); this.showBanner('VAULT ASSAULT', 'Hold the Warden approach.', 'vault'); }
    vaultComplete() { this.state.mode = 'victory'; this.state.threat = 'DAWN'; this.state.valor += 100; this.saveData.bestNight = Math.max(this.saveData.bestNight, 10); kit.save.set(this.saveData); kit.audio.music('victory', 400); this.showBanner('VAULT ASSAULT COMPLETE', 'The rampart holds until dawn.', 'victory'); this.audio('horn'); }
    lose() { if (this.state.mode === 'defeat') return; this.state.mode = 'defeat'; this.state.threat = 'BREACH'; this.saveData.bestNight = Math.max(this.saveData.bestNight, this.state.night - 1); kit.save.set(this.saveData); this.showBanner('THE WALL HAS FALLEN', 'Hold ' + Math.max(0, this.state.night - 1) + ' nights.', 'defeat'); this.shake(8); this.audio('drum'); }

    shopTap(index) {
      if (index === 99) {
        if (this.state.pendingVault) this.startVault();
        else {
          this.state.night++; this.state.mode = 'play'; this.startNight(this.state.night);
          const rampartNotice = this.state.rampartNotice ? RAMPARTS[this.state.rampart].name + ' · ' + this.state.rampartNotice : RAMPARTS[this.state.rampart].name;
          this.state.rampartNotice = '';
          this.showBanner('NIGHT ' + this.state.night, rampartNotice, 'night');
        }
        return;
      }
      const defs = [{ name: 'REPAIR ALL WALLS', cost: 28, desc: '+' + (this.wallRepair || 45) + ' wall integrity' }, { name: 'REBUILD THE GATE', cost: 34, desc: '+70 gate integrity' }, { name: 'DRILL THE SQUADS', cost: 42, desc: '+1 unit to every squad' }, { name: 'SHARPEN THE CAPTAIN', cost: 46, desc: '+18% hero strike power' }];
      const d = defs[index]; if (!d || this.state.valor < d.cost) return; this.state.valor -= d.cost; this.state.valorSpent += d.cost;
      this.state.nightValorSpent += d.cost;
      if (index === 0) for (let i = 0; i < 3; i++) this.state.wallHP[i] = clamp(this.state.wallHP[i] + (this.wallRepair || 45), 0, 100);
      if (index === 1) this.state.gateHP = clamp(this.state.gateHP + 70, 0, this.state.gateMax || 340);
      if (index === 2) for (const sq of this.squads) sq.units = clamp(sq.units + 1, 1, 5);
      if (index === 3) this.heroPower = (this.heroPower || 1) + 0.18;
      this.audio('steel'); this.float(195, 300, d.name + ' READY', CSS.good);
    }

    fortifyRampart() {
      const index = this.state.rampart;
      const current = this.saveData.fortLevels[index] || 0;
      const cost = 28 + current * 20;
      if (current >= 3) { this.float(195, 300, 'FORTIFICATION MAXED', CSS.muted); return; }
      if (this.state.valor < cost) { this.float(195, 300, 'NEED ' + cost + ' VALOR', CSS.muted); return; }
      this.state.valor -= cost; this.state.valorSpent += cost; this.state.nightValorSpent += cost;
      this.saveData.fortLevels[index] = current + 1;
      this.saveData.unlocked[index] = true;
      this.state.fortificationLevel = current + 1;
      this.applyRampartUpgrade(index);
      kit.save.set(this.saveData);
      this.audio('steel'); this.float(195, 300, RAMPARTS[index].upgrade + ' LEVEL ' + (current + 1), CSS.good);
    }

    burst(x, y, color, count, kind) {
      const r = seeded((x * 31 + y * 17 + Math.floor(this.state.clock * 60) + count) | 0);
      const n = Math.min(count, 20);
      const poolName = kind === 'burst' ? 'command' : PARTICLE_KINDS.indexOf(kind) >= 0 ? kind : 'spark';
      for (const p of this.particlePools[poolName]) if (!p.active && count-- > 0) { const a = r() * Math.PI * 2; const speed = poolName === 'command' ? (kind === 'burst' ? 110 : 42) : poolName === 'oil' ? 34 : poolName === 'debris' ? 62 : 70; p.active = true; p.x = x; p.y = y; p.vx = Math.cos(a) * (speed * (0.45 + r() * 0.6)); p.vy = Math.sin(a) * (speed * (0.45 + r() * 0.6)) - (poolName === 'oil' ? 8 : 24); p.life = p.max = poolName === 'debris' ? 0.5 : poolName === 'oil' ? 0.65 : 0.32 + r() * 0.25; p.color = color; p.size = poolName === 'debris' ? 3 : poolName === 'oil' ? 4 : 2; }
      if (n > 0 && kind === 'command') this.state.bannerCharge = clamp(this.state.bannerCharge + 0.5, 0, 100);
    }

    projectile(x0, y0, x1, y1, color) { for (const p of this.projectiles) if (!p.active) { p.active = true; p.x0 = x0; p.y0 = y0; p.x1 = x1; p.y1 = y1; p.t = 0; p.speed = 3.3; p.color = color; return; } }
    enqueueTransient(item) {
      const current = this.state.banner;
      const last = this.state.bannerQueue[this.state.bannerQueue.length - 1];
      if ((current && current.text === item.text) || (last && last.text === item.text)) return;
      if (!current) { this.state.banner = item; return; }
      if (this.state.bannerQueue.length >= 5) this.state.bannerQueue.shift();
      this.state.bannerQueue.push(item);
    }
    float(x, y, text, color) {
      this.enqueueTransient({ text: text, sub: '', kind: 'chip', color: color, x: x, y: y, life: 1.0, max: 1.0, boundary: false });
    }
    showBanner(text, sub, kind) {
      const boundary = kind === 'night' || kind === 'trial' || kind === 'clear' || kind === 'vault' || kind === 'victory' || kind === 'defeat';
      const item = { text: text, sub: sub || '', kind: kind, life: boundary ? 1.35 : 1.0, max: boundary ? 1.35 : 1.0, boundary: boundary };
      if (boundary) { this.state.banner = item; this.state.bannerQueue.length = 0; }
      else this.enqueueTransient(item);
    }
    shake(amount) { if (kit.juice.enabled) kit.juice.shake(amount, 180); }
    audio(name) { kit.audio.sfx(name, { volume: name === 'drum' ? 0.8 : 1 }); }

    advanceInput() {
      if (this.state.mode === 'menu') this.startRun(1);
      else if (this.state.mode === 'intermission') this.shopTap(99);
      else if (this.state.mode === 'victory' || this.state.mode === 'defeat') this.startRun(1);
      else if (this.state.mode === 'trialComplete') this.state.mode = 'trialSelect';
      else if (this.state.mode === 'play' || this.state.mode === 'vault') this.bannerBurst();
    }

    pollGamepad() {
      if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
      const pads = navigator.getGamepads();
      let pad = null;
      for (let i = 0; i < pads.length; i++) if (pads[i]) { pad = pads[i]; break; }
      this.state.gamepadConnected = !!pad;
      if (!pad) { this.gamepadPrev.length = 0; return; }
      const pressed = (index) => !!(pad.buttons[index] && pad.buttons[index].pressed);
      const justPressed = (index) => pressed(index) && !this.gamepadPrev[index];
      const axis = pad.axes && Math.abs(pad.axes[0] || 0) > 0.18 ? pad.axes[0] : 0;
      if ((this.state.mode === 'play' || this.state.mode === 'vault') && this.hero.action === 'idle' && axis) { this.hero.x = clamp(this.hero.x + axis * 170 * STEP, 18, W - 18); this.hero.face = sign(axis); }
      if (this.state.mode === 'play' || this.state.mode === 'vault') {
        if (justPressed(0)) this.commandHero(this.hero.x, 'over');
        if (justPressed(1)) this.commandHero(this.hero.x, 'kick');
        if (justPressed(2)) this.commandHero(this.hero.x + this.hero.face * 34, 'sweep');
        if (justPressed(3) || justPressed(7)) this.bannerBurst();
        if (justPressed(4)) this.state.selectedChip = 0;
        if (justPressed(5)) this.state.selectedChip = 1;
        if (justPressed(6)) this.state.selectedChip = 2;
        if (this.state.selectedChip >= 0) {
          if (justPressed(14)) this.orderSquad(this.state.selectedChip, 0);
          if (justPressed(12)) this.orderSquad(this.state.selectedChip, 1);
          if (justPressed(15)) this.orderSquad(this.state.selectedChip, 2);
        }
      }
      if (justPressed(9)) this.advanceInput();
      this.gamepadPrev.length = pad.buttons.length;
      for (let i = 0; i < pad.buttons.length; i++) this.gamepadPrev[i] = pressed(i);
    }

    update(time, delta) {
      this.pollGamepad();
      const enter = kit.input.keyDown('Enter');
      if (enter && !this.globalKeys.Enter) this.advanceInput();
      this.globalKeys.Enter = enter;
      const restart = kit.input.keyDown('KeyR');
      if (restart && !this.globalKeys.KeyR && (this.state.mode === 'victory' || this.state.mode === 'defeat')) this.startRun(1);
      this.globalKeys.KeyR = restart;
      const juice = kit.juice.frame();
      let frameDelta = Math.min(0.05, Math.max(0, delta / 1000));
      if (juice.frozen || kit.paused) frameDelta = 0;
      this.accumulator = (this.accumulator || 0) + frameDelta;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 4) { this.accumulator -= STEP; this.step(STEP); steps++; }
      this.render(juice);
    }

    refreshProbe() {
      this.state.wallHP[0] = clamp(this.state.wallHP[0], 0, 100); this.state.wallHP[1] = clamp(this.state.wallHP[1], 0, 100); this.state.wallHP[2] = clamp(this.state.wallHP[2], 0, 100);
      // probe.state must be a MIRROR, never an alias of this.state. When it was an
      // alias, writing the rampart NAME onto probe.state.rampart overwrote the live
      // numeric rampart index, so the next RAMPARTS[this.state.rampart] lookup was
      // undefined and startRun threw on .name.
      if (!this.probeMirror) this.probeMirror = {};
      probe.state = Object.assign(this.probeMirror, this.state, {
        valor: Math.floor(this.state.valor),
        rampartIndex: this.state.rampart,
        rampart: RAMPARTS[this.state.rampart] ? RAMPARTS[this.state.rampart].name : 'UNKNOWN'
      });
    }

    render(juice) {
      const dx = juice.dx || 0, dy = juice.dy || 0; this.battleLayer.x = dx; this.battleLayer.y = dy;
      this.renderWorld(); this.renderUi();
    }

    drawSquadGlyph(g, x, y, index, scale) {
      const color = index === 2 ? COLORS.oil : COLORS.player;
      g.fillStyle(color, 1);
      if (index === 0) {
        g.fillTriangle(x - 5 * scale, y + 5 * scale, x + 5 * scale, y + 5 * scale, x, y - 7 * scale);
        g.lineStyle(Math.max(1, 2 * scale), COLORS.white, 0.95); g.lineBetween(x, y - 7 * scale, x + 8 * scale, y - 14 * scale);
      } else if (index === 1) {
        g.fillCircle(x, y, 5 * scale); g.lineStyle(Math.max(1, 2 * scale), COLORS.white, 0.95); g.strokeCircle(x, y, 8 * scale); g.lineBetween(x + 2 * scale, y - 2 * scale, x + 10 * scale, y - 9 * scale);
      } else {
        g.fillRoundedRect(x - 5 * scale, y - 5 * scale, 10 * scale, 10 * scale, 2 * scale); g.fillStyle(COLORS.white, 0.95); g.fillCircle(x, y - 8 * scale, 2.5 * scale); g.lineStyle(Math.max(1, 2 * scale), COLORS.white, 0.9); g.lineBetween(x + 6 * scale, y - 3 * scale, x + 10 * scale, y - 8 * scale);
      }
    }

    drawRallyGlyph(g, x, y, ready) {
      const color = ready ? COLORS.gold : COLORS.amber;
      g.lineStyle(2, color, 1); g.lineBetween(x - 9, y - 11, x - 9, y + 10); g.fillStyle(color, 1); g.fillTriangle(x - 7, y - 10, x + 10, y - 5, x - 7, y + 1); g.fillStyle(ready ? COLORS.white : COLORS.muted, 1); g.fillCircle(x - 9, y + 11, 2.5);
    }

    drawTutorialStrip(g) {
      const tutorial = this.state.tutorial;
      if (!tutorial) return;
      const steps = ['1/5 · TAP WALL → STRIKE', '2/5 · KICK CLIMBING LADDER', '3/5 · PICK CHIP → RALLY WALL', '4/5 · POUR OIL AT GATE', '5/5 · FILL BANNER → RALLY'];
      const alpha = kit.juice.enabled ? clamp(1 - Math.max(0, tutorial.age - 1.2) * 0.48, 0.14, 1) : 0.28;
      setTextIfChanged(this.texts.tutorial, steps[tutorial.step] || ''); this.texts.tutorial.setPosition(195, 88).setFontSize(14).setAlpha(alpha).setVisible(true);
      g.fillStyle(0x0d2434, 0.72 * alpha); g.fillRect(18, 76, W - 36, 24); g.lineStyle(1, COLORS.player, 0.65 * alpha); g.strokeRect(18, 76, W - 36, 24);
    }

    drawTransientChip(g) {
      const b = this.state.banner;
      if (!b || b.boundary) return;
      const label = b.sub ? b.text + ' · ' + b.sub : b.text;
      const width = clamp(label.length * 7.1 + 28, 112, W - 24);
      const x = typeof b.x === 'number' && b.x > W * 0.5 ? W - width - 12 : 12;
      const y = 78;
      const alpha = kit.juice.enabled ? clamp(b.life / 0.16, 0, 1) : 1;
      const accent = b.kind === 'defeat' ? COLORS.danger : b.kind === 'rally' ? COLORS.gold : b.kind === 'supply' ? COLORS.good : b.kind === 'chip' ? COLORS.player : COLORS.amber;
      const color = b.color || (b.kind === 'defeat' ? CSS.danger : b.kind === 'rally' ? CSS.gold : b.kind === 'supply' ? CSS.good : CSS.white);
      g.fillStyle(0x0d2434, 0.9 * alpha); g.fillRoundedRect(x, y, width, 24, 6); g.lineStyle(1, accent, 0.85 * alpha); g.strokeRoundedRect(x, y, width, 24, 6);
      this.texts.banner.setPosition(x + width * 0.5, y + 12).setOrigin(0.5).setFontSize(14).setAlpha(alpha); setTextIfChanged(this.texts.banner, label); setColorIfChanged(this.texts.banner, color); this.texts.banner.setVisible(true);
    }

    drawWavePreview(g) {
      const preview = this.wavePreview, event = preview.event, x = event.k === 'ram' ? GATE_X + GATE_W * 0.5 : SEG_CENTERS[event.s];
      const pulse = 0.5 + Math.sin(preview.pulse * 10) * 0.25;
      g.lineStyle(2, event.k === 'ram' ? COLORS.danger : COLORS.amber, pulse);
      g.strokeCircle(x, event.k === 'ram' ? 390 : WALL_Y + 4, 17 + (Math.sin(preview.pulse * 12) > 0 ? 8 : 0));
      g.lineStyle(1, event.k === 'ram' ? COLORS.danger : COLORS.amber, 0.7);
      g.lineBetween(x - 13, WALL_Y - 18, x + 13, WALL_Y - 18);
      g.fillStyle(event.k === 'ram' ? COLORS.danger : COLORS.amber, 0.95);
      g.fillTriangle(x, WALL_Y - 11, x - 5, WALL_Y - 21, x + 5, WALL_Y - 21);
    }

    renderWorld() {
      this.worldG.clear(); this.fxG.clear();
      const g = this.worldG;
      for (let i = 0; i < 3; i++) {
        const lo = SEGMENTS[i].lo, hi = SEGMENTS[i].hi, hp = this.state.wallHP[i] / 100;
        if (hp < 1) { g.fillStyle(0x8b3340, 0.22 + (1 - hp) * 0.25); g.fillRect(lo, WALL_Y, hi - lo, WALL_BOTTOM - WALL_Y); }
        g.lineStyle(1, 0x0b141d, 0.4); g.strokeRect(lo + 3, WALL_Y + 3, hi - lo - 6, WALL_BOTTOM - WALL_Y - 6);
        g.fillStyle(0x07111b, 0.7); g.fillRect(lo + 10, WALL_BOTTOM - 13, hi - lo - 20, 4); g.fillStyle(hp <= 0 ? COLORS.danger : hp > 0.5 ? COLORS.good : COLORS.amber, 0.95); g.fillRect(lo + 10, WALL_BOTTOM - 13, (hi - lo - 20) * hp, 4);
        if (this.state.fortificationLevel >= 1) { g.lineStyle(2, COLORS.gate, 0.55); g.lineBetween(lo + 8, WALL_Y + 10, lo + 8, WALL_BOTTOM - 18); g.lineBetween(hi - 8, WALL_Y + 10, hi - 8, WALL_BOTTOM - 18); }
        if (this.state.fortificationLevel >= 2) { g.lineStyle(2, COLORS.gate, 0.75); g.lineBetween(lo + 18, WALL_Y + 14, hi - 18, WALL_BOTTOM - 24); g.lineBetween(hi - 18, WALL_Y + 14, lo + 18, WALL_BOTTOM - 24); }
      }
      const gate = clamp(this.state.gateHP / (this.state.gateMax || this.gateMax || 260), 0, 1); g.fillStyle(0x0a0d12, 0.5); g.fillRect(GATE_X - 4, 348, GATE_W + 8, 96); g.fillStyle(COLORS.gate, 0.24 + gate * 0.55); g.fillRect(GATE_X, 350 + (1 - gate) * 18, GATE_W, 92 - (1 - gate) * 18); g.fillStyle(0x07111b, 0.65); g.fillRect(GATE_X + 8, 450, GATE_W - 16, 4); g.fillStyle(gate > 0.4 ? COLORS.amber : COLORS.danger, 1); g.fillRect(GATE_X + 8, 450, (GATE_W - 16) * gate, 4);
      if (this.state.fortificationLevel >= 2) { g.lineStyle(3, COLORS.bone, 0.7); g.lineBetween(GATE_X + 10, 354, GATE_X + 10, 438); g.lineBetween(GATE_X + GATE_W - 10, 354, GATE_X + GATE_W - 10, 438); }
      for (const l of this.ladders) if (l.active) { g.lineStyle(l.rope ? 2 : 3, l.rope ? COLORS.bone : COLORS.amber, 0.95); if (l.rope) g.lineBetween(l.x, GROUND_Y, l.x + 2, WALL_Y + 4); else { g.lineBetween(l.x - 7, GROUND_Y, l.x - 7, WALL_Y + 4); g.lineBetween(l.x + 7, GROUND_Y, l.x + 7, WALL_Y + 4); for (let y = WALL_Y + 14; y < GROUND_Y; y += 17) g.lineBetween(l.x - 7, y, l.x + 7, y); } }
      for (let i = 0; i < this.squads.length; i++) { const sq = this.squads[i]; const x = sq.route > 0 ? lerp(SEG_CENTERS[sq.seg], SEG_CENTERS[sq.target], 1 - sq.route) : SEG_CENTERS[sq.seg]; if (sq.route > 0) { g.lineStyle(2, COLORS.player, 0.7); g.lineBetween(SEG_CENTERS[sq.seg], WALL_Y - 30, SEG_CENTERS[sq.target], WALL_Y - 30); g.fillStyle(COLORS.player, 0.9); g.fillTriangle(SEG_CENTERS[sq.target] - 5, WALL_Y - 35, SEG_CENTERS[sq.target] + 5, WALL_Y - 35, SEG_CENTERS[sq.target], WALL_Y - 24); } for (let u = 0; u < sq.units; u++) { const ox = (u - (sq.units - 1) / 2) * 7; this.drawSquadGlyph(g, x + ox, WALL_Y - 17, i, 0.72); } }
      if (this.wavePreview) this.drawWavePreview(g);
      if (this.state.ramActive) { const pulse = 0.55 + Math.sin(this.state.clock * 8) * 0.2; g.lineStyle(3, COLORS.oil, pulse); g.strokeRoundedRect(GATE_X - 14, 338, GATE_W + 28, 112, 10); g.fillStyle(COLORS.oil, 1); g.fillTriangle(195, 332, 188, 343, 202, 343); }
      let spriteIndex = 0;
      for (const e of this.enemies) {
        if (!e.active || e.kind === 'ram' || e.kind === 'tower') continue;
        const s = this.enemySprites[spriteIndex++]; s.setVisible(true); s.setPosition(e.x, e.y + (e.state === 'ground' || e.state === 'top' ? Math.sin(e.wob) * 1.4 : 0)); s.setScale(ENEMY[e.kind].scale); s.setFrame(e.renderState); s.setFlipX(e.x > 195); if (e.hurt > 0) s.setTint(0xffffff); else s.clearTint(); e.renderSlot = spriteIndex - 1;
        if (e.shield && e.kind === 'elite' && e.state !== 'ground') { this.fxG.lineStyle(2, COLORS.violet, 0.9); this.fxG.strokeCircle(e.x, e.y - 28, 19 + Math.sin(this.state.clock * 7) * 2); this.fxG.fillStyle(COLORS.violet, 1); this.fxG.fillTriangle(e.x, e.y - 57, e.x - 5, e.y - 48, e.x + 5, e.y - 48); }
        if (e.tele > 0) { this.fxG.lineStyle(2, COLORS.amber, 0.85); this.fxG.strokeCircle(e.x, WALL_Y + 3, 18 + e.tele * 18); this.fxG.lineStyle(1, COLORS.danger, 0.75); this.fxG.strokeCircle(e.x, WALL_Y + 3, 9 + (0.42 - e.tele) * 30); }
        if (e.hp < e.max) { this.fxG.fillStyle(0x07111b, 0.75); this.fxG.fillRect(e.x - 15, e.y - 69, 30, 4); this.fxG.fillStyle(e.shield ? COLORS.violet : COLORS.enemy, 1); this.fxG.fillRect(e.x - 15, e.y - 69, 30 * clamp(e.hp / e.max, 0, 1), 4); }
      }
      while (spriteIndex < this.enemySprites.length) this.enemySprites[spriteIndex++].setVisible(false);
      for (const e of this.enemies) if (e.active && (e.kind === 'ram' || e.kind === 'tower')) this.drawSiegeEngine(e);
      const h = this.hero; this.heroSprite.setVisible(this.state.mode === 'play' || this.state.mode === 'vault'); this.heroSprite.setPosition(h.x, h.y + (h.action === 'idle' ? Math.sin(this.state.clock * 2.4) * 1.3 : 0)); this.heroSprite.setFlipX(h.face < 0); this.heroSprite.setFrame(h.action === 'leap' ? SPRITE_STATES.defender.leap : h.action === 'windup' || h.action === 'strike' ? (h.attack === 'over' ? SPRITE_STATES.defender.strike : h.attack === 'kick' ? SPRITE_STATES.defender.kick : SPRITE_STATES.defender.sweep) : h.action === 'recover' ? SPRITE_STATES.defender.hurt : SPRITE_STATES.defender.idle); this.heroSprite.setScale(h.action === 'leap' ? 1.04 : 1);
      if ((h.action === 'leap' || h.action === 'windup') && (this.state.mode === 'play' || this.state.mode === 'vault')) { this.fxG.lineStyle(2, COLORS.player, 0.9); this.fxG.strokeCircle(h.targetX, WALL_Y - 2, 16 + Math.sin(this.state.clock * 9) * 2); this.fxG.lineStyle(1, COLORS.player, 0.5); this.fxG.lineBetween(h.x, h.y - 44, h.targetX, WALL_Y - 20); this.fxG.fillStyle(COLORS.player, 1); this.fxG.fillTriangle(h.targetX - 5, WALL_Y - 32, h.targetX + 5, WALL_Y - 32, h.targetX, WALL_Y - 21); }
      if (h.action === 'windup') { this.fxG.lineStyle(3, h.attack === 'kick' ? COLORS.amber : h.attack === 'sweep' ? COLORS.playerLight : COLORS.gold, 0.95); this.fxG.strokeCircle(h.x, WALL_Y - 28, h.attack === 'sweep' ? 46 : 34); }
      for (const p of this.projectiles) if (p.active) { const t = clamp(p.t, 0, 1), x = lerp(p.x0, p.x1, t), y = lerp(p.y0, p.y1, t) - Math.sin(t * Math.PI) * 22; this.fxG.lineStyle(2, p.color, 0.85); this.fxG.lineBetween(lerp(p.x0, p.x1, Math.max(0, t - 0.15)), lerp(p.y0, p.y1, Math.max(0, t - 0.15)), x, y); }
      for (const kind of PARTICLE_KINDS) for (const p of this.particlePools[kind]) if (p.active) {
        const alpha = clamp(p.life / p.max, 0, 1); this.fxG.fillStyle(p.color, alpha); this.fxG.lineStyle(1, p.color, alpha);
        if (p.kind === 'spark') { this.fxG.lineBetween(p.x - p.size * 2, p.y, p.x + p.size * 2, p.y); this.fxG.lineBetween(p.x, p.y - p.size * 2, p.x, p.y + p.size * 2); }
        else if (p.kind === 'oil') { this.fxG.fillCircle(p.x, p.y, p.size * 0.75); this.fxG.fillTriangle(p.x, p.y - p.size * 2, p.x - p.size, p.y - p.size * 0.4, p.x + p.size, p.y - p.size * 0.4); }
        else if (p.kind === 'command') this.fxG.fillTriangle(p.x, p.y - p.size * 2, p.x - p.size * 1.5, p.y + p.size, p.x + p.size * 1.5, p.y + p.size);
        else this.fxG.fillRect(p.x, p.y, p.size, p.size);
      }
      this.drawAmbientFx();
    }

    drawAmbientFx() {
      const g = this.fxG, pulse = 0.16 + Math.sin(this.state.clock * 2.1) * 0.05;
      g.fillStyle(COLORS.amber, pulse); g.fillCircle(39, GROUND_Y + 3, 5 + Math.sin(this.state.clock * 3) * 1.5); g.fillCircle(350, GROUND_Y + 7, 4 + Math.sin(this.state.clock * 2.4 + 1) * 1.2);
      g.fillStyle(COLORS.slate, 0.15); g.fillCircle(82 + Math.sin(this.state.clock * 0.7) * 7, 290, 9); g.fillCircle(304 + Math.sin(this.state.clock * 0.6 + 2) * 8, 278, 7);
    }

    drawSiegeEngine(e) {
      const g = this.worldG;
      if (e.kind === 'ram') { g.fillStyle(0x5b3d2c, 1); g.fillRoundedRect(e.x - 34, e.y - 28, 68, 28, 7); g.fillStyle(e.hurt > 0 ? COLORS.white : 0x97683e, 1); g.fillRoundedRect(e.x - 27, e.y - 40, 54, 13, 6); g.fillStyle(0x34251c, 1); g.fillCircle(e.x - 22, e.y + 2, 6); g.fillCircle(e.x + 22, e.y + 2, 6); }
      else { g.fillStyle(e.hurt > 0 ? COLORS.white : 0x5c6879, 1); g.fillRoundedRect(e.x - 23, e.y - 76, 46, 76, 5); g.fillStyle(0x8794a4, 1); g.fillRect(e.x - 27, e.y - 82, 54, 8); g.fillStyle(COLORS.enemyDark, 0.9); g.fillTriangle(e.x, e.y - 96, e.x - 10, e.y - 82, e.x + 10, e.y - 82); }
      g.fillStyle(0x07111b, 0.8); g.fillRect(e.x - 28, e.y - (e.kind === 'ram' ? 52 : 104), 56, 4); g.fillStyle(COLORS.enemy, 1); g.fillRect(e.x - 28, e.y - (e.kind === 'ram' ? 52 : 104), 56 * clamp(e.hp / e.max, 0, 1), 4);
    }

    trialMeterProgress() {
      const trial = this.state.trialIndex >= 0 ? TRIALS[this.state.trialIndex] : null;
      if (!trial) return 0;
      if (trial.id === 'three-walls') return this.state.wallHP.filter((value) => value >= 70).length;
      return Math.min(this.state.trialGoal, trial.target);
    }

    renderUi() {
      const g = this.uiG; g.clear();
      this.buttonTextIndex = 0;
      const active = this.state.mode === 'play' || this.state.mode === 'vault';
      const transient = this.state.banner;
      const boundary = !!(transient && transient.boundary);
      const showCoach = active && !!this.state.tutorial && !transient;
      this.texts.logo.setVisible(!active);
      this.texts.night.setVisible(active); this.texts.rampart.setVisible(false); this.texts.threat.setVisible(false); this.texts.valor.setVisible(active); this.texts.hint.setVisible(false);
      this.texts.objective.setVisible(false); this.texts.tutorial.setVisible(false); this.texts.banner.setVisible(false); this.texts.bannerSub.setVisible(false); this.texts.banner.setAlpha(1); this.texts.bannerSub.setAlpha(1);
      if (active) {
        this.texts.night.setPosition(15, 13); setTextIfChanged(this.texts.night, 'N' + this.state.night);
        this.texts.valor.setPosition(374, 13); setTextIfChanged(this.texts.valor, '◆ ' + Math.floor(this.state.valor));
        const trial = this.state.trialIndex >= 0 ? TRIALS[this.state.trialIndex] : null;
        if (trial) {
          const progress = this.trialMeterProgress();
          g.fillStyle(0x07111b, 0.85); g.fillRect(238, 56, 74, 4); g.fillStyle(COLORS.violet, 0.95); g.fillRect(238, 56, 74 * clamp(progress / trial.target, 0, 1), 4);
          g.fillStyle(COLORS.violet, 1); g.fillCircle(230, 58, 3); this.texts.objective.setPosition(350, 51).setOrigin(1, 0); setTextIfChanged(this.texts.objective, progress + '/' + trial.target); this.texts.objective.setVisible(true);
        }
        if (showCoach) this.drawTutorialStrip(g);
        for (let i = 0; i < 3; i++) {
          const b = this.railRects[i], sq = this.squads[i], selected = this.state.selectedChip === i;
          g.fillStyle(selected ? 0x153b4d : 0x102130, 1); g.fillRoundedRect(b.x, b.y, b.w, b.h, 8); g.lineStyle(selected ? 2 : 1, selected ? COLORS.player : 0x294257, 1); g.strokeRoundedRect(b.x, b.y, b.w, b.h, 8);
          this.drawSquadGlyph(g, b.x + b.w * 0.5, b.y + 22, i, sq.rallyCd > 0 ? 0.92 : 1.08);
          g.fillStyle(COLORS.muted, 1); g.fillRect(b.x + 13, b.y + 45, b.w - 26, 3); g.fillStyle(i === 2 ? COLORS.oil : COLORS.player, 1); g.fillRect(b.x + 13, b.y + 45, (b.w - 26) * clamp(sq.units / 5, 0, 1), 3);
          if (i === 2) { g.fillStyle(COLORS.muted, 1); g.fillRect(b.x + 13, b.y + 53, b.w - 26, 2); g.fillStyle(COLORS.oil, 1); g.fillRect(b.x + 13, b.y + 53, (b.w - 26) * clamp(this.state.oil / this.state.oilMax, 0, 1), 2); }
          if (sq.route > 0) { g.fillStyle(COLORS.playerLight, 1); g.fillTriangle(b.x + b.w - 13, b.y + 11, b.x + b.w - 5, b.y + 15, b.x + b.w - 13, b.y + 19); }
          if (sq.rallyCd > 0) { g.lineStyle(2, COLORS.amber, 0.9); g.strokeCircle(b.x + b.w - 13, b.y + 15, 7); }
        }
        const rb = this.railRects[3], full = this.state.bannerCharge >= 100; g.fillStyle(full ? 0x5b4620 : 0x182638, 1); g.fillRoundedRect(rb.x, rb.y, rb.w, rb.h, 8); g.lineStyle(full ? 2 : 1, full ? COLORS.gold : COLORS.amber, 1); g.strokeRoundedRect(rb.x, rb.y, rb.w, rb.h, 8); this.drawRallyGlyph(g, rb.x + rb.w * 0.5, rb.y + 22, full); g.fillStyle(full ? COLORS.gold : COLORS.muted, 1); g.fillRect(rb.x + 13, rb.y + 45, (rb.w - 26) * clamp(this.state.bannerCharge / 100, 0, 1), 3);
      }
      for (const key of this.overlayKeys) this.texts[key].setVisible(false);
      if (this.state.mode === 'menu') this.drawMenu(g);
      if (this.state.mode === 'trialSelect') this.drawTrials(g);
      if (this.state.mode === 'intermission') this.drawIntermission(g);
      if (this.state.mode === 'victory' || this.state.mode === 'defeat' || this.state.mode === 'trialComplete') this.drawEnd(g);
      if (boundary) this.drawBigBanner(g);
      else if (transient && !showCoach) this.drawTransientChip(g);
      if (!transient) { this.texts.banner.setVisible(false); this.texts.bannerSub.setVisible(false); }
      for (let i = this.buttonTextIndex; i < this.buttonTextPool.length; i++) this.buttonTextPool[i].setVisible(false);
    }

    drawMenu(g) {
      this.texts.menuTitle.setVisible(true); this.texts.menuSub.setVisible(true); this.texts.menuLore.setVisible(true); this.texts.menuInfo.setVisible(true);
      g.fillStyle(0x07111b, 0.86); g.fillRect(0, 74, W, 500); g.fillStyle(0x10263a, 0.95); g.fillRoundedRect(48, 350, 294, 58, 10); g.lineStyle(2, COLORS.player, 1); g.strokeRoundedRect(48, 350, 294, 58, 10); g.fillStyle(0x132131, 0.95); g.fillRoundedRect(48, 420, 294, 58, 10); g.lineStyle(1, COLORS.amber, 1); g.strokeRoundedRect(48, 420, 294, 58, 10); this.drawButtonText(195, 379, 'START SIEGE RUN', 15, CSS.playerLight); this.drawButtonText(195, 449, 'NIGHT TRIALS', 15, CSS.amber); this.drawButtonText(195, 532, 'tap to command  |  keyboard: arrows, space, S, W', 10, CSS.muted);
    }

    drawTrials(g) {
      this.texts.trialTitle.setVisible(true); this.texts.trialSub.setVisible(true); for (let i = 0; i < TRIALS.length; i++) { const b = this.trialButtons[i], t = TRIALS[i], unlocked = this.trialUnlocked(i), complete = !!this.saveData.trials[i]; g.fillStyle(unlocked ? 0x122a3d : 0x101923, 1); g.fillRoundedRect(b.x, b.y, b.w, b.h, 8); g.lineStyle(1, complete ? COLORS.good : unlocked ? COLORS.player : 0x33404b, 1); g.strokeRoundedRect(b.x, b.y, b.w, b.h, 8); this.drawButtonText(b.x + 14, b.y + 16, (i + 1) + '  ' + t.title, 12, complete ? CSS.good : unlocked ? CSS.white : '#4b5864', 0); this.drawButtonText(b.x + 14, b.y + 34, unlocked ? t.desc : 'LOCKED  |  clear the chain with silver', 9, unlocked ? CSS.muted : '#4b5864', 0); this.drawButtonText(b.x + b.w - 12, b.y + 25, complete ? 'CLEAR' : unlocked ? t.goal : 'LOCK', 9, complete ? CSS.good : unlocked ? CSS.amber : '#4b5864', 1); }
      this.drawButtonText(195, 530, 'top-left: back to command table', 10, CSS.muted);
    }

    drawIntermission(g) {
      g.fillStyle(0x07111b, 0.94); g.fillRect(0, 74, W, 500); setTextIfChanged(this.texts.shopTitle, this.state.pendingVault ? 'NIGHT 10 HELD' : 'NIGHT ' + this.state.night + ' HELD'); setTextIfChanged(this.texts.shopSub, this.state.pendingVault ? 'The Vault Assault waits beyond the gate.' : 'Spend generous valor before the next horns.'); setTextIfChanged(this.texts.shopResult, 'MEDAL  ' + ['-', 'BRONZE', 'SILVER', 'GOLD'][this.state.nightMedal] + '     VALOR  ' + Math.floor(this.state.valor)); this.texts.shopTitle.setVisible(true); this.texts.shopSub.setVisible(true); this.texts.shopResult.setVisible(true);
      const defs = [{ name: 'REPAIR ALL WALLS', cost: 28, desc: '+' + (this.wallRepair || 45) + ' integrity' }, { name: 'REBUILD THE GATE', cost: 34, desc: '+70 gate integrity' }, { name: 'DRILL THE SQUADS', cost: 42, desc: '+1 unit to every squad' }, { name: 'SHARPEN THE CAPTAIN', cost: 46, desc: '+18% strike power' }];
      for (let i = 0; i < 4; i++) { const b = this.shopButtons[i], d = defs[i], can = this.state.valor >= d.cost; g.fillStyle(can ? 0x122a3d : 0x101923, 1); g.fillRoundedRect(b.x, b.y, b.w, b.h, 8); g.lineStyle(1, can ? COLORS.player : 0x33404b, 1); g.strokeRoundedRect(b.x, b.y, b.w, b.h, 8); this.drawButtonText(b.x + 14, b.y + 15, d.name, 11, can ? CSS.white : '#4b5864', 0); this.drawButtonText(b.x + 14, b.y + 32, d.desc, 9, can ? CSS.muted : '#4b5864', 0); this.drawButtonText(b.x + b.w - 12, b.y + 23, d.cost + 'V', 12, can ? CSS.gold : '#4b5864', 1); }
      const fort = this.fortButton, fortLevel = this.saveData.fortLevels[this.state.rampart] || 0, fortCost = 28 + fortLevel * 20, fortReady = fortLevel < 3 && this.state.valor >= fortCost; g.fillStyle(fortReady ? 0x182f31 : 0x101923, 1); g.fillRoundedRect(fort.x, fort.y, fort.w, fort.h, 8); g.lineStyle(1, fortReady ? COLORS.good : 0x33404b, 1); g.strokeRoundedRect(fort.x, fort.y, fort.w, fort.h, 8); this.drawButtonText(fort.x + 12, fort.y + 13, 'FORTIFY  ' + RAMPARTS[this.state.rampart].upgrade + '  ' + fortLevel + '/3', 10, fortReady ? CSS.white : '#4b5864', 0); this.drawButtonText(fort.x + fort.w - 12, fort.y + 13, fortLevel >= 3 ? 'MAX' : fortCost + 'V', 10, fortReady ? CSS.gold : '#4b5864', 1);
      const b = this.shopButtons[4]; g.fillStyle(this.state.pendingVault ? 0x5b4620 : 0x153b4d, 1); g.fillRoundedRect(b.x, b.y, b.w, b.h, 8); g.lineStyle(2, this.state.pendingVault ? COLORS.gold : COLORS.player, 1); g.strokeRoundedRect(b.x, b.y, b.w, b.h, 8); this.drawButtonText(195, b.y + 19, this.state.pendingVault ? 'ENTER VAULT ASSAULT' : 'BEGIN NIGHT ' + (this.state.night + 1), 14, this.state.pendingVault ? CSS.gold : CSS.playerLight); this.drawButtonText(195, b.y + 38, this.state.pendingVault ? 'one final defense, then dawn' : NIGHT_BLURBS[this.state.night], 9, CSS.muted);
    }

    drawEnd(g) {
      const won = this.state.mode === 'victory', trial = this.state.mode === 'trialComplete'; g.fillStyle(won ? 0x092118 : 0x1a0d16, 0.95); g.fillRect(0, 74, W, 500); setTextIfChanged(this.texts.endTitle, won ? 'VAULT ASSAULT COMPLETE' : trial ? (this.state.nightMedal === 3 ? 'TRIAL CLEAR' : 'TRIAL FAILED') : 'THE WALL HAS FALLEN'); setColorIfChanged(this.texts.endTitle, won || this.state.nightMedal === 3 ? CSS.good : CSS.danger); setTextIfChanged(this.texts.endSub, won ? 'The Warden approach breaks at dawn.' : trial ? TRIALS[this.state.trialIndex].desc : 'The siege found the weak segment. Rally and try again.'); setTextIfChanged(this.texts.endStats, won ? '10 NIGHTS  |  VAULT HELD  |  VALOR ' + Math.floor(this.state.valor) : trial ? TRIALS[this.state.trialIndex].goal + '  |  ' + (this.state.nightMedal === 3 ? 'CHAIN UNLOCKED' : 'RETRY FOR THE CHAIN') : 'NIGHTS SURVIVED  ' + Math.max(0, this.state.night - 1) + '  |  BEST  ' + this.saveData.bestNight); setTextIfChanged(this.texts.endHint, trial ? 'tap to return to the trial table' : 'tap to return  |  R / ENTER to run again'); this.texts.endTitle.setVisible(true); this.texts.endSub.setVisible(true); this.texts.endStats.setVisible(true); this.texts.endHint.setVisible(true); g.fillStyle(0x122a3d, 1); g.fillRoundedRect(this.endButton.x, this.endButton.y, this.endButton.w, this.endButton.h, 9); g.lineStyle(2, won ? COLORS.good : COLORS.player, 1); g.strokeRoundedRect(this.endButton.x, this.endButton.y, this.endButton.w, this.endButton.h, 9); this.drawButtonText(195, 478, trial ? 'TRIAL TABLE' : 'HOLD AGAIN', 15, won ? CSS.good : CSS.playerLight);
    }

    drawBigBanner(g) {
      const b = this.state.banner; if (!b || !b.boundary) { this.texts.banner.setVisible(false); this.texts.bannerSub.setVisible(false); return; }
      const progress = 1 - clamp(b.life / b.max, 0, 1); const overshoot = kit.juice.enabled && progress < 0.35 ? Math.sin(progress / 0.35 * Math.PI) * 10 : 0; const width = 220 + overshoot; const x = (W - width) * 0.5; const alpha = 0.96; const accent = b.kind === 'defeat' ? COLORS.danger : b.kind === 'clear' || b.kind === 'victory' ? COLORS.gold : COLORS.player;
      g.fillStyle(b.kind === 'defeat' ? 0x421b2b : b.kind === 'vault' || b.kind === 'victory' ? 0x25424d : 0x153148, alpha); g.fillRoundedRect(x, 208, width, 78, 10); g.lineStyle(2, accent, 1); g.strokeRoundedRect(x, 208, width, 78, 10);
      setTextIfChanged(this.texts.banner, b.text); setTextIfChanged(this.texts.bannerSub, b.sub); setColorIfChanged(this.texts.banner, b.kind === 'defeat' ? CSS.danger : CSS.gold); this.texts.banner.setPosition(195, 231).setFontSize(20).setAlpha(1).setVisible(true); this.texts.bannerSub.setPosition(195, 263).setFontSize(14).setAlpha(1).setVisible(true);
    }

    drawButtonText(x, y, text, size, color, align) {
      const obj = this.buttonTextPool[this.buttonTextIndex++];
      if (!obj) return;
      obj.setVisible(true); obj.setPosition(x, y); setTextIfChanged(obj, text); setColorIfChanged(obj, color); obj.setFontSize(size); obj.setFontStyle(size >= 13 ? 'bold' : 'normal'); obj.setOrigin(align === 0 ? 0 : align === 1 ? 1 : 0.5);
    }
  }

  function drawDefenderFrame(c, ox, frame) {
    const bob = frame === 1 ? -2 : 0, lean = frame === 2 ? -5 : frame === 5 ? 3 : 0;
    c.save(); c.translate(ox + 24, 57 + bob); c.strokeStyle = '#07111b'; c.lineWidth = 2; c.lineCap = 'round';
    c.fillStyle = '#3864e8'; c.beginPath(); c.arc(0, -16, 16, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#43c7f4'; c.beginPath(); c.moveTo(-8, -31); c.lineTo(6, -36); c.lineTo(12, -15); c.lineTo(5, 0); c.lineTo(-9, 0); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#e3d3a2'; c.fillRect(-7, -27, 14, 5); c.fillStyle = '#07111b'; c.fillRect(2, -27, 5, 3);
    c.fillStyle = '#b72e4d'; c.beginPath(); c.moveTo(-8, -15); c.lineTo(-19, 3 + lean); c.lineTo(-2, -2); c.closePath(); c.fill();
    c.strokeStyle = '#f4f4e7'; c.lineWidth = 3;
    if (frame === 2) { c.beginPath(); c.moveTo(3, -13); c.lineTo(19, -32); c.stroke(); }
    else if (frame === 3) { c.beginPath(); c.moveTo(4, -14); c.lineTo(20, -1); c.stroke(); }
    else if (frame === 4) { c.beginPath(); c.moveTo(2, -10); c.lineTo(21, 2); c.stroke(); }
    else if (frame === 5) { c.beginPath(); c.moveTo(4, -13); c.lineTo(22 + lean, -9); c.stroke(); }
    else if (frame === 6) { c.strokeStyle = '#ff665c'; c.beginPath(); c.moveTo(3, -16); c.lineTo(17, -20); c.stroke(); }
    else { c.beginPath(); c.moveTo(4, -14); c.lineTo(16, -27); c.stroke(); }
    if (frame === 7) { c.globalAlpha = 0.45; c.fillStyle = '#43c7f4'; c.fillRect(-16, 0, 32, 4); }
    c.restore();
  }

  function drawAttackerFrame(c, ox, frame) {
    const leap = frame === SPRITE_STATES.attacker.leap, hurt = frame === SPRITE_STATES.attacker.hurt, defeated = frame === 7;
    const lean = frame === SPRITE_STATES.attacker.sweep ? 5 : frame === SPRITE_STATES.attacker.strike ? -3 : 0;
    c.save(); c.translate(ox + 24, 57 + (leap ? -4 : 0)); c.strokeStyle = '#07111b'; c.lineWidth = 2;
    c.fillStyle = hurt ? '#f4f4e7' : defeated ? '#d9a7ff' : '#ff665c'; c.beginPath(); c.arc(0, -18, defeated ? 11 : 8, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = hurt ? '#f4f4e7' : '#b72e4d'; c.beginPath(); c.moveTo(-9, -12); c.lineTo(10 + lean, -11); c.lineTo(8, 2); c.lineTo(-8, 2); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#e3d3a2'; c.fillRect(-8, -23, 16, 4); c.fillStyle = '#07111b'; c.fillRect(-1, -23, 5, 3);
    c.strokeStyle = '#d8c38c'; c.lineWidth = 2;
    if (leap) { c.beginPath(); c.moveTo(-4, 0); c.lineTo(-11, 14); c.moveTo(4, 0); c.lineTo(11, 14); c.stroke(); }
    else if (frame === 3) { c.beginPath(); c.moveTo(5, -8); c.lineTo(19, -20); c.stroke(); }
    else if (frame === SPRITE_STATES.attacker.kick) { c.beginPath(); c.moveTo(4, -8); c.lineTo(21, -1); c.stroke(); }
    else if (frame === SPRITE_STATES.attacker.sweep) { c.strokeStyle = '#d9a7ff'; c.lineWidth = 3; c.beginPath(); c.arc(0, -13, 16, 1.2, 4.9); c.stroke(); }
    else if (defeated) { c.globalAlpha = 0.45; c.fillStyle = '#d9a7ff'; c.fillRect(-16, 0, 32, 4); }
    else { c.beginPath(); c.moveTo(5, -8); c.lineTo(16, 1); c.stroke(); }
    c.restore();
  }

  kit.loader.show('SIEGEBREAK'); kit.loader.progress(0.18);
  const config = { type: Phaser.CANVAS, width: W, height: H, parent: 'game', backgroundColor: '#07111b', render: { antialias: true, roundPixels: true, clearBeforeRender: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: SiegebreakScene };
  new Phaser.Game(config);
})();
