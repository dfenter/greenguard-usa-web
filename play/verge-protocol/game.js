/* Verge Protocol - Phaser 3 AAA rebuild.
 * GGKit owns lifecycle, pointer identity, saves, audio buses and juice.
 * content.js owns every authored number; this file owns sim and render. */
'use strict';

(function () {
  var C = window.VergeContent;
  var GAME_W = 1280, GAME_H = 720;
  var RETINA_FACTOR = GGKit.hiDpi.factor(GAME_W, GAME_H);
  var STEP = 1 / 60, MAX_STEPS = 6;
  var TAU = Math.PI * 2;
  var FONT = 'Verdana, "DejaVu Sans", system-ui, sans-serif';

  var BOARD = C.BOARD;                       /* 28,76 872x524 */
  var RAIL = { x: 28, y: 610, w: 872, h: 102 };
  var PANEL = { x: 912, y: 76, w: 352, h: 636 };

  var MAX_ENEMIES = 120, MAX_SHOTS = 128, MAX_TOWERS = 24;
  var MAX_DROPS = 56, MAX_FX = 48, PARTICLES_PER_SYSTEM = 16;
  var PARTICLE_SYSTEMS = ['contact', 'debris', 'trail', 'burst', 'ember', 'build'];

  var PAL = {
    ink: 0x090f18, panel: 0x0e1a28, panel2: 0x132437, line: 0x2b4257,
    text: 0xe8f2fb, muted: 0x8ba2b8, cyan: 0x43c7f4, blue: 0x3864e8,
    teal: 0x6de0c1, coral: 0xff665c, wine: 0xb72e4d, amber: 0xe0a34a,
    bone: 0xd8c38c, moss: 0x788b5a, slate: 0x718092, white: 0xffffff,
    violet: 0xcda1ff, body: 0xcfcbb4
  };
  var CSS = {
    text: '#e8f2fb', muted: '#8ba2b8', cyan: '#43c7f4', teal: '#6de0c1',
    coral: '#ff665c', amber: '#e0a34a', violet: '#cda1ff', bone: '#d8c38c',
    dim: '#5c7086', white: '#ffffff'
  };

  var AUDIO = {
    select: 'assets/audio/select.mp3', place: 'assets/audio/place.mp3',
    upgrade: 'assets/audio/upgrade.mp3', cancel: 'assets/audio/cancel.mp3',
    fire: 'assets/audio/fire.mp3', hit: 'assets/audio/hit.mp3',
    kill: 'assets/audio/kill.mp3', breach: 'assets/audio/breach.mp3',
    ability: 'assets/audio/ability.mp3', warning: 'assets/audio/warning.mp3',
    clear: 'assets/audio/wave-clear.mp3', victory: 'assets/audio/victory.mp3',
    defeat: 'assets/audio/defeat.mp3', bed: 'assets/audio/music-bed.mp3',
    danger: 'assets/audio/music-danger.mp3', base: 'assets/audio/music-base.mp3'
  };
  var SFX_NAMES = ['select', 'place', 'upgrade', 'cancel', 'fire', 'hit', 'kill',
    'breach', 'ability', 'warning', 'clear', 'victory', 'defeat'];

  /* Boot fallback hook: probes read this before the scene exists, and the
   * live scene keeps writing into the same object. */
  var hook = window.__vp || {};
  hook.state = hook.state || {
    mode: 'boot', stage: 0, stageName: '', wave: 0, waves: 0, progress: 0,
    score: 0, best: 0, health: 1, coreHp: 100, coreMax: 100, scrap: 0,
    medals: 0, salvage: 0, phase: 'boot', ready: false
  };
  if (hook.forceMode === undefined) hook.forceMode = null;
  if (hook.forceStage === undefined) hook.forceStage = null;
  window.__vp = hook;

  var Game = { phaser: null, scene: null };

  var kit = GGKit.create({
    slug: 'verge-protocol', orientation: 'landscape',
    validateSave: C.validProfile,
    onPause: function () { if (Game.scene && Game.scene.scene.isActive()) Game.scene.scene.pause(); },
    onResume: function () { if (Game.scene && Game.scene.scene.isPaused()) Game.scene.scene.resume(); },
    onRestart: function () { if (Game.scene) Game.scene.restartRun(); }
  });
  kit.audio.register(AUDIO);

  var profile = kit.save.get(C.newProfile());
  if (!C.validProfile(profile)) profile = C.newProfile();
  function saveProfile() { kit.save.set(profile); }

  /* ------------------------------------------------------------ helpers */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function setTextIfChanged(o, v) { v = String(v); if (o.text !== v) o.setText(v); }
  function setColorIfChanged(o, v) { if (o.__vpColor !== v) { o.setColor(v); o.__vpColor = v; } }
  function setVis(o, v) { if (o.visible !== v) o.setVisible(v); }
  function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

  /* Hand-tessellated ring: Graphics.arc walks the sweep in 0.01 rad steps and
   * is far too expensive to run per frame. */
  function ring(g, x, y, r, color, alpha, width, sides) {
    var n = sides || 22, i, a, px, py;
    g.lineStyle(width || 2, color, alpha == null ? 1 : alpha);
    g.beginPath();
    for (i = 0; i <= n; i++) {
      a = i / n * TAU; px = x + Math.cos(a) * r; py = y + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokePath();
  }
  function disc(g, x, y, r, color, alpha, sides) {
    var n = sides || 12, i, a;
    g.fillStyle(color, alpha == null ? 1 : alpha);
    g.beginPath();
    for (i = 0; i < n; i++) {
      a = i / n * TAU;
      if (i === 0) g.moveTo(x + r, y); else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath(); g.fillPath();
  }
  function dashRing(g, x, y, r, color, alpha, width, phase) {
    var seg = 12, i, a0, a1;
    g.lineStyle(width || 2, color, alpha == null ? 1 : alpha);
    for (i = 0; i < seg; i++) {
      a0 = (i / seg) * TAU + phase; a1 = a0 + TAU / seg * 0.55;
      g.beginPath();
      g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
      g.lineTo(x + Math.cos((a0 + a1) * 0.5) * r, y + Math.sin((a0 + a1) * 0.5) * r);
      g.lineTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r);
      g.strokePath();
    }
  }
  function tri(g, x, y, r, rot, color, alpha) {
    g.fillStyle(color, alpha == null ? 1 : alpha);
    g.beginPath();
    g.moveTo(x + Math.cos(rot) * r, y + Math.sin(rot) * r);
    g.lineTo(x + Math.cos(rot + 2.4) * r, y + Math.sin(rot + 2.4) * r);
    g.lineTo(x + Math.cos(rot - 2.4) * r, y + Math.sin(rot - 2.4) * r);
    g.closePath(); g.fillPath();
  }
  function box(g, x, y, w, h, fill, alpha, stroke, sw) {
    if (fill !== undefined) { g.fillStyle(fill, alpha == null ? 1 : alpha); g.fillRect(x, y, w, h); }
    if (stroke !== undefined) { g.lineStyle(sw || 2, stroke, 1); g.strokeRect(x, y, w, h); }
  }
  function pointSegDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    var t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function VergeScene() { Phaser.Scene.call(this, { key: 'Verge' }); }
  VergeScene.prototype = Object.create(Phaser.Scene.prototype);
  VergeScene.prototype.constructor = VergeScene;

  /* =================================================== scene lifecycle */
  VergeScene.prototype.create = function () {
    this.cameras.main.setZoom(RETINA_FACTOR);
    Game.scene = this;
    this.accumulator = 0;
    this.simTime = 0;      /* stepped sim clock, never advanced elsewhere */
    this.animTime = 0;     /* cosmetic clock, frozen during hit-stop only */
    this.mode = 'menu';
    this.pauseOpen = false;
    this.mapIndex = 0;
    this.run = null;
    this.hits = [];
    this.keyEdges = {};
    this.pointerClaims = {};
    this.stickId = null;
    this.stick = { x: 0, y: 0, ox: 0, oy: 0, active: false };
    this.toast = null;
    this.toastQueue = [];
    this.banner = null;
    this.coachIndex = 0;
    this.coachTimer = 0;
    this.lastForceMode = null;
    this.lastForceStage = null;
    this.selectedPad = -1;
    this.pendingAbility = null;
    this.towerType = 'rifle';
    this.canvasRect = null;
    this.musicTrack = '';

    this.allocPools();
    this.buildTextures();

    this.bgImage = this.add.image(0, 0, 'vp-chrome').setOrigin(0).setDepth(0);
    this.world = this.add.container(0, 0).setDepth(1);
    this.terrainImage = this.add.image(0, 0, 'vp-terrain').setOrigin(0);
    this.decalGfx = this.add.graphics();
    this.unitGfx = this.add.graphics();
    this.fxGfx = this.add.graphics();
    this.world.add(this.terrainImage);
    this.world.add(this.decalGfx);
    this.world.add(this.unitGfx);
    this.world.add(this.fxGfx);

    this.hudGfx = this.add.graphics().setDepth(20);
    this.buildHudText();
    this.buildScreens();
    this.wireInput();

    this.setMap(0);
    this.showScreen('menu');
    this.syncHook();

    kit.loader.progress(1);
    kit.loader.hide();
    kit.registerPWA();
    /* Music and sfx decode after the loading screen so the first wave never
     * hitches on a decodeAudioData call. */
    kit.audio.preload(SFX_NAMES);
    this.audioWarm = false;
  };

  VergeScene.prototype.allocPools = function () {
    var i, n;
    this.enemies = [];
    for (i = 0; i < MAX_ENEMIES; i++) {
      this.enemies.push({
        active: false, id: 0, def: null, boss: false, x: 0, y: 0, lane: 0, branch: 0,
        path: null, wp: 1, hp: 1, maxHp: 1, speed: 0, radius: 8, slow: 1, hit: 0,
        burnDps: 0, burnT: 0, stun: 0, phase: 0, phaseT: 0, broodT: 0, step: 0,
        facing: 0, damage: 0, reward: 0, armor: 0, regen: 0, dead: false, inv: false
      });
    }
    this.shots = [];
    for (i = 0; i < MAX_SHOTS; i++) {
      this.shots.push({ active: false, x: 0, y: 0, tx: 0, ty: 0, target: -1, stamp: 0, damage: 0, speed: 0, color: 0, aoe: 0, radius: 0, life: 0, spin: 0 });
    }
    this.towers = [];
    for (i = 0; i < MAX_TOWERS; i++) {
      this.towers.push({ active: false, pad: -1, x: 0, y: 0, type: 'rifle', level: 0, cooldown: 0, angle: -Math.PI / 2, flash: 0, buildT: 0, buff: 1, recoil: 0 });
    }
    this.drops = [];
    for (i = 0; i < MAX_DROPS; i++) this.drops.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, spin: 0 });
    this.fx = [];
    for (i = 0; i < MAX_FX; i++) this.fx.push({ active: false, kind: 0, x: 0, y: 0, x2: 0, y2: 0, r: 0, life: 0, max: 0, color: 0 });
    this.particles = {};
    for (n = 0; n < PARTICLE_SYSTEMS.length; n++) {
      var arr = [];
      for (i = 0; i < PARTICLES_PER_SYSTEM; i++) {
        arr.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, size: 0, color: 0, drag: 0, grav: 0, spin: 0, rot: 0 });
      }
      this.particles[PARTICLE_SYSTEMS[n]] = arr;
    }
    this.activeEnemies = [];
    this.laneCounts = [0, 0, 0, 0];
    this.laneDamage = [0, 0, 0, 0];
  };

  VergeScene.prototype.spawnParticle = function (sys, x, y, vx, vy, life, size, color, opts) {
    var arr = this.particles[sys];
    if (!arr) return null;
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      if (p.active) continue;
      p.active = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.max = life; p.size = size; p.color = color;
      p.drag = opts && opts.drag != null ? opts.drag : 2.2;
      p.grav = opts && opts.grav != null ? opts.grav : 0;
      p.spin = opts && opts.spin != null ? opts.spin : 0;
      p.rot = opts && opts.rot != null ? opts.rot : 0;
      return p;
    }
    return null;
  };

  VergeScene.prototype.burst = function (sys, x, y, count, color, spread, opts) {
    if (!kit.juice.enabled) count = Math.ceil(count * 0.5);
    for (var i = 0; i < count; i++) {
      var a = Math.random() * TAU, s = spread * (0.4 + Math.random() * 0.8);
      this.spawnParticle(sys, x, y, Math.cos(a) * s, Math.sin(a) * s,
        0.28 + Math.random() * 0.34, 2 + Math.random() * 2.4, color, opts);
    }
  };

  VergeScene.prototype.addFx = function (kind, x, y, r, life, color, x2, y2) {
    for (var i = 0; i < this.fx.length; i++) {
      var f = this.fx[i];
      if (f.active) continue;
      f.active = true; f.kind = kind; f.x = x; f.y = y; f.r = r;
      f.life = life; f.max = life; f.color = color;
      f.x2 = x2 || 0; f.y2 = y2 || 0;
      return f;
    }
    return null;
  };

  /* ================================================== baked chrome / map */
  /* Phaser Graphics replays its whole command list every frame, so every
   * static pixel of the shell and the battlefield is baked into a canvas
   * texture once instead of being re-issued as draw commands. */
  VergeScene.prototype.buildTextures = function () {
    if (!this.textures.exists('vp-chrome')) {
      var baked = GGKit.hiDpi.canvas(GAME_W, GAME_H);
      var tex = this.textures.addCanvas('vp-chrome', baked.canvas);
      if (tex && tex.get()) tex.get().source.resolution = baked.dpr;
      this.paintChrome(baked.ctx);
      tex.refresh();
    }
    if (!this.textures.exists('vp-terrain')) {
      var terrain = GGKit.hiDpi.canvas(GAME_W, GAME_H);
      var terrainTex = this.textures.addCanvas('vp-terrain', terrain.canvas);
      if (terrainTex && terrainTex.get()) terrainTex.get().source.resolution = terrain.dpr;
      terrainTex.refresh();
    }
  };

  VergeScene.prototype.paintChrome = function (c) {
    var g = c.createLinearGradient(0, 0, 0, GAME_H);
    g.addColorStop(0, '#0d1a27'); g.addColorStop(0.55, '#0a1420'); g.addColorStop(1, '#070d16');
    c.fillStyle = g; c.fillRect(0, 0, GAME_W, GAME_H);

    /* faint floodlit haze behind the board */
    var haze = c.createRadialGradient(470, 330, 40, 470, 330, 620);
    haze.addColorStop(0, 'rgba(67,199,244,0.09)'); haze.addColorStop(1, 'rgba(67,199,244,0)');
    c.fillStyle = haze; c.fillRect(0, 0, GAME_W, GAME_H);

    /* top HUD strip */
    c.fillStyle = '#0e1a28'; c.fillRect(0, 0, GAME_W, 68);
    c.fillStyle = '#132437'; c.fillRect(0, 64, GAME_W, 4);
    c.fillStyle = '#43c7f4'; c.fillRect(0, 66, 260, 2);
    c.fillStyle = '#e0a34a'; c.fillRect(260, 66, 90, 2);
    c.fillStyle = '#ff665c'; c.fillRect(350, 66, 60, 2);

    /* board recess */
    this.plate(c, BOARD.x - 6, BOARD.y - 6, BOARD.w + 12, BOARD.h + 12, '#0a1622', '#2b4257', 2);

    /* command rail */
    this.plate(c, RAIL.x, RAIL.y, RAIL.w, RAIL.h, '#0c1725', '#2b4257', 2);
    c.fillStyle = '#43c7f4'; c.fillRect(RAIL.x + 10, RAIL.y + 3, 120, 2);

    /* right command panel */
    this.plate(c, PANEL.x, PANEL.y, PANEL.w, PANEL.h, '#0c1725', '#2b4257', 2);
    c.fillStyle = '#132437';
    c.fillRect(PANEL.x + 12, PANEL.y + 44, PANEL.w - 24, 2);
    c.fillRect(PANEL.x + 12, PANEL.y + 218, PANEL.w - 24, 2);
    c.fillRect(PANEL.x + 12, PANEL.y + 380, PANEL.w - 24, 2);
    c.fillRect(PANEL.x + 12, PANEL.y + 496, PANEL.w - 24, 2);

    /* screen edge vignette so the battlefield reads as the bright zone */
    var vg = c.createLinearGradient(0, 0, 40, 0);
    vg.addColorStop(0, 'rgba(4,8,14,0.75)'); vg.addColorStop(1, 'rgba(4,8,14,0)');
    c.fillStyle = vg; c.fillRect(0, 0, 40, GAME_H);
    var vg2 = c.createLinearGradient(GAME_W, 0, GAME_W - 40, 0);
    vg2.addColorStop(0, 'rgba(4,8,14,0.75)'); vg2.addColorStop(1, 'rgba(4,8,14,0)');
    c.fillStyle = vg2; c.fillRect(GAME_W - 40, 0, 40, GAME_H);
  };

  VergeScene.prototype.plate = function (c, x, y, w, h, fill, stroke, sw) {
    c.fillStyle = fill; c.fillRect(x, y, w, h);
    c.strokeStyle = stroke; c.lineWidth = sw || 2;
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  };

  /* ---------------------------------------------------------- terrain */
  VergeScene.prototype.setMap = function (index) {
    this.mapIndex = C.mapIndex(index);
    this.map = C.mapDef(this.mapIndex);
    this.paths = [];
    for (var i = 0; i < this.map.lanes.length; i++) {
      this.paths.push([C.lanePath(this.map.lanes[i], 0), C.lanePath(this.map.lanes[i], 1)]);
    }
    this.splitIdx = [];
    for (i = 0; i < this.map.lanes.length; i++) this.splitIdx.push(this.map.lanes[i].pts.length - 1);
    this.paintTerrain();
  };

  VergeScene.prototype.paintTerrain = function () {
    var tex = this.textures.get('vp-terrain'), c = tex.getContext();
    var def = this.map, pal = def.palette, i;
    c.clearRect(0, 0, GAME_W, GAME_H);
    c.save();
    c.beginPath(); c.rect(BOARD.x, BOARD.y, BOARD.w, BOARD.h); c.clip();

    var g = c.createLinearGradient(0, BOARD.y, 0, BOARD.y + BOARD.h);
    g.addColorStop(0, hex(pal.sky)); g.addColorStop(0.5, hex(pal.floorB)); g.addColorStop(1, hex(pal.floorA));
    c.fillStyle = g; c.fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);

    /* 24px material grid with per-biome seams */
    var cell = 24, x, y, n;
    for (y = BOARD.y; y < BOARD.y + BOARD.h; y += cell) {
      for (x = BOARD.x; x < BOARD.x + BOARD.w; x += cell) {
        n = ((x * 7 + y * 13) >> 3) % 11;
        c.fillStyle = ((x / cell + y / cell) | 0) % 2 ? hex(pal.floorA) : hex(pal.floorB);
        c.globalAlpha = 0.85; c.fillRect(x, y, cell - 1, cell - 1); c.globalAlpha = 1;
        this.paintBiomeCell(c, def.biome, x, y, cell, n);
      }
    }

    for (i = 0; i < def.hazards.length; i++) this.paintHazard(c, def.hazards[i]);
    this.paintRoutes(c, def);
    for (i = 0; i < def.landmarks.length; i++) this.paintLandmark(c, def.landmarks[i], pal);
    for (i = 0; i < def.pads.length; i++) this.paintSocket(c, def.pads[i][0], def.pads[i][1]);
    for (i = 0; i < def.lanes.length; i++) this.paintSpawnRim(c, def.lanes[i]);
    this.paintCorePlate(c, def);

    c.restore();
    c.strokeStyle = 'rgba(232,242,251,0.20)'; c.lineWidth = 2;
    c.strokeRect(BOARD.x + 1, BOARD.y + 1, BOARD.w - 2, BOARD.h - 2);
    tex.refresh();
  };

  VergeScene.prototype.paintBiomeCell = function (c, biome, x, y, cell, n) {
    if (biome === 'asphalt') {
      if (n === 3) { c.fillStyle = 'rgba(232,242,251,0.05)'; c.fillRect(x + 5, y + 9, 12, 2); }
      if (n === 7) { c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(x + 3, y + 4, 2, 14); }
    } else if (biome === 'water') {
      if (n < 3) { c.fillStyle = 'rgba(67,199,244,0.06)'; c.fillRect(x + 2, y + 6, cell - 6, 3); }
      if (n === 9) { c.fillStyle = 'rgba(120,139,90,0.10)'; c.fillRect(x + 8, y + 3, 4, 8); }
    } else if (biome === 'interior') {
      c.strokeStyle = 'rgba(232,242,251,0.045)'; c.lineWidth = 1;
      c.strokeRect(x + 2.5, y + 2.5, cell - 6, cell - 6);
      if (n === 5) { c.fillStyle = 'rgba(109,224,193,0.07)'; c.fillRect(x + 7, y + 7, 5, 5); }
    } else {
      if (n === 2) { c.fillStyle = 'rgba(205,161,255,0.07)'; c.fillRect(x + 6, y + 5, 3, 11); }
      if (n === 8) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + 4, y + 12, 13, 3); }
    }
  };

  VergeScene.prototype.paintRoutes = function (c, def) {
    var i, b, pts, j;
    for (i = 0; i < def.lanes.length; i++) {
      for (b = 0; b < 2; b++) {
        pts = C.lanePath(def.lanes[i], b);
        /* route bed */
        c.lineJoin = 'round'; c.lineCap = 'round';
        c.strokeStyle = hex(def.palette.route); c.lineWidth = 44;
        c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
        for (j = 1; j < pts.length; j++) c.lineTo(pts[j].x, pts[j].y);
        c.stroke();
        /* worn centre */
        c.strokeStyle = 'rgba(232,242,251,0.05)'; c.lineWidth = 26;
        c.stroke();
        /* kerb */
        c.strokeStyle = 'rgba(9,15,24,0.55)'; c.lineWidth = 2;
        c.stroke();
      }
    }
    /* directional chevrons so the approach direction reads at a glance */
    for (i = 0; i < def.lanes.length; i++) {
      pts = C.lanePath(def.lanes[i], 0);
      for (j = 0; j < pts.length - 1; j++) {
        var mx = (pts[j].x + pts[j + 1].x) / 2, my = (pts[j].y + pts[j + 1].y) / 2;
        var a = Math.atan2(pts[j + 1].y - pts[j].y, pts[j + 1].x - pts[j].x);
        c.save(); c.translate(mx, my); c.rotate(a);
        c.strokeStyle = 'rgba(255,102,92,0.28)'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-7, -7); c.lineTo(4, 0); c.lineTo(-7, 7); c.stroke();
        c.restore();
      }
    }
  };

  VergeScene.prototype.paintHazard = function (c, h) {
    var d = C.hazardDef(h.type);
    c.save();
    c.beginPath(); c.arc(h.x, h.y, h.r, 0, TAU); c.clip();
    c.fillStyle = hex(d.color); c.globalAlpha = 0.55;
    c.fillRect(h.x - h.r, h.y - h.r, h.r * 2, h.r * 2);
    c.globalAlpha = 1;
    /* directional hatch keeps the interior readable but never hides units */
    c.strokeStyle = hex(d.edge); c.globalAlpha = 0.18; c.lineWidth = 2;
    for (var i = -h.r; i < h.r; i += 11) {
      c.beginPath(); c.moveTo(h.x - h.r + i, h.y - h.r); c.lineTo(h.x + h.r + i, h.y + h.r); c.stroke();
    }
    c.restore();
    c.strokeStyle = hex(d.edge); c.globalAlpha = 0.7; c.lineWidth = 2;
    c.beginPath(); c.arc(h.x, h.y, h.r - 1, 0, TAU); c.stroke();
    c.globalAlpha = 1;
  };

  VergeScene.prototype.paintSocket = function (c, x, y) {
    c.fillStyle = 'rgba(9,15,24,0.62)';
    c.beginPath(); c.arc(x, y, 25, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(224,163,74,0.55)'; c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, 22, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(224,163,74,0.30)'; c.lineWidth = 3;
    for (var i = 0; i < 4; i++) {
      var a = i * TAU / 4 + Math.PI / 4;
      c.beginPath();
      c.moveTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
      c.lineTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20);
      c.stroke();
    }
    c.fillStyle = 'rgba(224,163,74,0.22)';
    c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill();
  };

  VergeScene.prototype.paintSpawnRim = function (c, lane) {
    var p = lane.pts[0], a = Math.atan2(lane.pts[1][1] - p[1], lane.pts[1][0] - p[0]);
    c.save(); c.translate(p[0], p[1]); c.rotate(a);
    c.fillStyle = 'rgba(255,102,92,0.16)'; c.fillRect(-16, -26, 34, 52);
    c.strokeStyle = '#ff665c'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-14, -26); c.lineTo(-14, 26); c.stroke();
    c.fillStyle = 'rgba(255,102,92,0.7)';
    for (var i = -1; i <= 1; i++) {
      c.beginPath(); c.moveTo(2, i * 15 - 6); c.lineTo(12, i * 15); c.lineTo(2, i * 15 + 6); c.fill();
    }
    c.restore();
  };

  VergeScene.prototype.paintCorePlate = function (c, def) {
    var x = def.core[0], y = def.core[1];
    c.fillStyle = 'rgba(9,15,24,0.75)';
    c.beginPath(); c.arc(x, y, 52, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(67,199,244,0.55)'; c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, 46, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(67,199,244,0.20)'; c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, 60, 0, TAU); c.stroke();
    /* anchored footprint so the core never reads as a floating icon */
    c.fillStyle = 'rgba(19,36,55,0.95)';
    for (var i = 0; i < 6; i++) {
      var a = i * TAU / 6;
      c.save(); c.translate(x + Math.cos(a) * 46, y + Math.sin(a) * 46); c.rotate(a);
      c.fillRect(-6, -9, 14, 18); c.restore();
    }
  };

  /* Landmarks: three to five per arena so each sector reads as a place. */
  VergeScene.prototype.paintLandmark = function (c, lm, pal) {
    var x = lm.x, y = lm.y, i;
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(6,10,17,0.45)';
    if (lm.t === 'overpass') {
      c.fillRect(-38, -262, 76, 524);
      c.fillStyle = '#1b2732'; c.fillRect(-30, -262, 60, 524);
      c.fillStyle = '#243342';
      for (i = -5; i <= 5; i++) c.fillRect(-30, i * 52, 60, 8);
      c.fillStyle = '#0f1822'; c.fillRect(-30, -262, 8, 524); c.fillRect(22, -262, 8, 524);
      c.fillStyle = 'rgba(224,163,74,0.35)'; c.fillRect(-30, -6, 60, 3);
    } else if (lm.t === 'hauler') {
      c.rotate(-0.35);
      c.fillRect(-52, -20, 104, 42);
      c.fillStyle = '#3d4a55'; c.fillRect(-48, -18, 74, 36);
      c.fillStyle = '#586675'; c.fillRect(26, -14, 24, 28);
      c.fillStyle = '#111a23'; c.fillRect(-44, -14, 62, 8);
      c.fillStyle = 'rgba(224,163,74,0.55)'; c.fillRect(44, -10, 6, 6);
      c.fillStyle = '#2a3742';
      for (i = 0; i < 3; i++) { c.fillRect(-40 + i * 26, 16, 14, 8); }
    } else if (lm.t === 'booth') {
      c.fillRect(-34, -30, 68, 60);
      c.fillStyle = '#2c3b47'; c.fillRect(-30, -26, 60, 52);
      c.fillStyle = '#0f1a24'; c.fillRect(-22, -18, 44, 24);
      c.fillStyle = 'rgba(109,224,193,0.35)'; c.fillRect(-22, -18, 44, 6);
      c.fillStyle = '#e0a34a'; c.fillRect(-32, 26, 64, 5);
    } else if (lm.t === 'mast') {
      c.fillStyle = '#1d2833'; c.fillRect(-4, -10, 8, 46);
      c.fillStyle = '#2f3f4d'; c.fillRect(-16, -22, 32, 14);
      var lg = c.createRadialGradient(0, -14, 4, 0, -14, 96);
      lg.addColorStop(0, 'rgba(255,247,214,0.22)'); lg.addColorStop(1, 'rgba(255,247,214,0)');
      c.fillStyle = lg; c.beginPath(); c.arc(0, -14, 96, 0, TAU); c.fill();
      c.fillStyle = '#fff4cf'; c.fillRect(-12, -20, 24, 8);
    } else if (lm.t === 'crane') {
      c.fillStyle = '#22303c'; c.fillRect(-10, -20, 20, 92);
      c.fillRect(-90, -30, 180, 12);
      c.fillStyle = '#33475a';
      for (i = -4; i <= 4; i++) c.fillRect(i * 20 - 2, -30, 4, 12);
      c.fillStyle = '#e0a34a'; c.fillRect(-92, -32, 14, 16); c.fillRect(78, -32, 14, 16);
      c.strokeStyle = 'rgba(232,242,251,0.25)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(62, -18); c.lineTo(62, 34); c.stroke();
      c.fillStyle = '#4b5b6b'; c.fillRect(54, 34, 18, 14);
    } else if (lm.t === 'containers') {
      var cols = ['#3c5d63', '#5d4340', '#3f4d63', '#4d5a3c'];
      for (i = 0; i < 5; i++) {
        var cx = (i % 3) * 46 - 60, cy = ((i / 3) | 0) * 30 - 18;
        c.fillStyle = 'rgba(6,10,17,0.4)'; c.fillRect(cx + 3, cy + 4, 42, 26);
        c.fillStyle = cols[i % cols.length]; c.fillRect(cx, cy, 42, 26);
        c.fillStyle = 'rgba(0,0,0,0.22)';
        for (var k = 0; k < 5; k++) c.fillRect(cx + 4 + k * 8, cy + 3, 3, 20);
      }
    } else if (lm.t === 'trawler') {
      c.fillStyle = 'rgba(6,10,17,0.4)'; c.beginPath();
      c.moveTo(-70, 0); c.lineTo(-46, 26); c.lineTo(52, 22); c.lineTo(72, -6); c.closePath(); c.fill();
      c.fillStyle = '#41525e'; c.beginPath();
      c.moveTo(-66, -4); c.lineTo(-44, 20); c.lineTo(50, 16); c.lineTo(68, -10); c.closePath(); c.fill();
      c.fillStyle = '#5d7180'; c.fillRect(-14, -30, 40, 28);
      c.fillStyle = '#101a24'; c.fillRect(-8, -24, 26, 12);
      c.fillStyle = '#e0a34a'; c.fillRect(28, -44, 4, 36);
    } else if (lm.t === 'ambulance') {
      c.fillStyle = 'rgba(6,10,17,0.4)'; c.fillRect(-40, -22, 82, 46);
      c.fillStyle = '#cfd8de'; c.fillRect(-36, -20, 76, 42);
      c.fillStyle = '#8ea3b2'; c.fillRect(-36, -6, 76, 8);
      c.fillStyle = '#ff665c'; c.fillRect(-30, -32, 22, 10);
      c.fillStyle = '#43c7f4'; c.fillRect(-4, -32, 22, 10);
      c.fillStyle = '#243342'; c.fillRect(24, -14, 16, 28);
    } else if (lm.t === 'tents') {
      for (i = 0; i < 3; i++) {
        var tx = i * 44 - 44;
        c.fillStyle = 'rgba(6,10,17,0.35)'; c.beginPath();
        c.moveTo(tx - 20, 22); c.lineTo(tx, -20); c.lineTo(tx + 20, 22); c.closePath(); c.fill();
        c.fillStyle = i % 2 ? '#5c6f52' : '#6b7d5c'; c.beginPath();
        c.moveTo(tx - 18, 20); c.lineTo(tx, -18); c.lineTo(tx + 18, 20); c.closePath(); c.fill();
        c.fillStyle = 'rgba(109,224,193,0.45)'; c.fillRect(tx - 4, 6, 8, 14);
      }
    } else if (lm.t === 'gurney') {
      c.fillStyle = 'rgba(6,10,17,0.35)'; c.fillRect(-26, -10, 54, 22);
      c.fillStyle = '#9fb0bd'; c.fillRect(-24, -8, 50, 16);
      c.fillStyle = '#5b6c79'; c.fillRect(-24, 8, 6, 8); c.fillRect(20, 8, 6, 8);
      c.fillStyle = 'rgba(255,102,92,0.35)'; c.fillRect(-16, -4, 30, 8);
    } else if (lm.t === 'spire') {
      var rg = c.createRadialGradient(0, 0, 8, 0, 0, 150);
      rg.addColorStop(0, 'rgba(205,161,255,0.30)'); rg.addColorStop(1, 'rgba(205,161,255,0)');
      c.fillStyle = rg; c.beginPath(); c.arc(0, 0, 150, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(205,161,255,0.45)'; c.lineWidth = 3;
      for (i = 0; i < 5; i++) {
        c.beginPath();
        c.moveTo(Math.cos(i * 1.26) * 66, Math.sin(i * 1.26) * 66);
        c.lineTo(Math.cos(i * 1.26 + 0.5) * 108, Math.sin(i * 1.26 + 0.5) * 108);
        c.stroke();
      }
    } else if (lm.t === 'bridge') {
      c.fillStyle = 'rgba(6,10,17,0.4)'; c.fillRect(-96, -18, 192, 40);
      c.fillStyle = '#2e3844'; c.fillRect(-92, -14, 88, 32);
      c.fillRect(26, -14, 66, 32);
      c.fillStyle = '#1a2230';
      for (i = 0; i < 6; i++) c.fillRect(-92 + i * 30, -14, 5, 32);
      c.fillStyle = '#46525f';
      c.beginPath(); c.moveTo(-4, -14); c.lineTo(14, 6); c.lineTo(-10, 18); c.closePath(); c.fill();
    } else if (lm.t === 'beacon') {
      c.fillStyle = 'rgba(6,10,17,0.4)'; c.beginPath(); c.arc(0, 0, 26, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(224,163,74,0.55)'; c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, 22, 0, TAU); c.stroke();
      c.fillStyle = '#3a4552'; c.fillRect(-5, -34, 10, 34);
      c.fillStyle = '#e0a34a'; c.beginPath(); c.arc(0, -36, 7, 0, TAU); c.fill();
    }
    c.restore();
  };

  /* ======================================================== HUD text UI */
  VergeScene.prototype.txt = function (x, y, size, color, align, bold, depth) {
    var t = this.add.text(x, y, '', {
      fontFamily: FONT, fontSize: size + 'px', color: color, resolution: RETINA_FACTOR,
      fontStyle: bold ? '700' : '400', align: align || 'left'
    });
    t.setOrigin(align === 'center' ? 0.5 : (align === 'right' ? 1 : 0), 0.5);
    t.setDepth(depth == null ? 21 : depth);
    t.__vpColor = color;
    return t;
  };

  VergeScene.prototype.buildHudText = function () {
    var u = this.ui = {};
    /* top strip: icons and meters carry the read, labels are minimal */
    u.core = this.txt(262, 33, 24, CSS.text, 'left', true);
    u.scrap = this.txt(360, 33, 24, CSS.amber, 'left', true);
    u.wave = this.txt(500, 33, 24, CSS.text, 'left', true);
    u.medal = this.txt(640, 33, 24, CSS.teal, 'left', true);
    u.mod = this.txt(772, 33, 22, CSS.violet, 'left', true);
    u.speed = this.txt(1128, 33, 22, CSS.muted, 'left', true);
    u.score = this.txt(1256, 33, 24, CSS.text, 'right', true);

    /* coach strip: one thin line at the board's top edge, fades on its own */
    u.coach = this.txt(BOARD.x + 16, BOARD.y + 22, 22, CSS.cyan, 'left', false);
    u.coach.setAlpha(0);
    /* single corner toast, opposite corner from the coach strip */
    u.toast = this.txt(BOARD.x + BOARD.w - 16, BOARD.y + 22, 22, CSS.amber, 'right', true);
    u.toast.setAlpha(0);

    /* run boundary banner only */
    u.bannerTitle = this.txt(BOARD.x + BOARD.w / 2, BOARD.y + 236, 46, CSS.text, 'center', true, 24);
    u.bannerSub = this.txt(BOARD.x + BOARD.w / 2, BOARD.y + 284, 24, CSS.muted, 'center', false, 24);
    u.bannerTitle.setAlpha(0); u.bannerSub.setAlpha(0);

    /* right command panel */
    u.pTitle = this.txt(PANEL.x + 16, 98, 24, CSS.text, 'left', true);
    u.pSector = this.txt(PANEL.x + PANEL.w - 16, 98, 22, CSS.muted, 'right', true);
    u.pWaveHead = this.txt(PANEL.x + 16, 138, 22, CSS.muted, 'left', true);
    u.pWaveClock = this.txt(PANEL.x + PANEL.w - 16, 138, 22, CSS.cyan, 'right', true);
    u.pRows = [];
    for (var i = 0; i < 4; i++) u.pRows.push(this.txt(PANEL.x + 52, 172 + i * 28, 22, CSS.text, 'left', false));
    u.pRowCounts = [];
    for (i = 0; i < 4; i++) u.pRowCounts.push(this.txt(PANEL.x + PANEL.w - 16, 172 + i * 28, 22, CSS.muted, 'right', true));
    u.pSelHead = this.txt(PANEL.x + 16, 312, 22, CSS.muted, 'left', true);
    u.pSelName = this.txt(PANEL.x + 16, 342, 26, CSS.cyan, 'left', true);
    u.pSelStat = this.txt(PANEL.x + 16, 372, 22, CSS.text, 'left', false);
    u.pSelRole = this.txt(PANEL.x + 16, 398, 22, CSS.muted, 'left', false);
    u.pSelRole.setWordWrapWidth(PANEL.w - 32);
    u.pAction = this.txt(PANEL.x + 16, 430, 22, CSS.teal, 'left', true);
    u.pSell = this.txt(PANEL.x + PANEL.w - 16, 430, 22, CSS.coral, 'right', true);
    u.pLaneHead = this.txt(PANEL.x + 16, 474, 22, CSS.muted, 'left', true);
    u.pLanes = [];
    for (i = 0; i < 4; i++) u.pLanes.push(this.txt(PANEL.x + 16, 498 + i * 22, 22, CSS.text, 'left', false));
    u.pHint = this.txt(PANEL.x + 16, 600, 22, CSS.dim, 'left', false);
    u.pHint.setWordWrapWidth(PANEL.w - 32);
    u.pPause = this.txt(PANEL.x + 94, 664, 24, CSS.text, 'center', true);
    u.pMenu = this.txt(PANEL.x + 262, 664, 24, CSS.text, 'center', true);

    /* command rail chips */
    u.chipName = []; u.chipCost = [];
    for (i = 0; i < C.TOWER_KEYS.length; i++) {
      u.chipName.push(this.txt(RAIL.x + 6 + 42 + i * 88, RAIL.y + 62, 22, CSS.text, 'center', true));
      u.chipCost.push(this.txt(RAIL.x + 6 + 42 + i * 88, RAIL.y + 84, 20, CSS.muted, 'center', false));
    }
    u.abilName = []; u.abilCd = [];
    for (i = 0; i < C.ABILITIES.length; i++) {
      u.abilName.push(this.txt(RAIL.x + 458 + 42 + i * 88, RAIL.y + 62, 22, CSS.text, 'center', true));
      u.abilCd.push(this.txt(RAIL.x + 458 + 42 + i * 88, RAIL.y + 84, 20, CSS.muted, 'center', false));
    }
    u.callText = this.txt(RAIL.x + 760, RAIL.y + 52, 22, CSS.teal, 'center', true);
    u.speedText = this.txt(RAIL.x + 836, RAIL.y + 52, 22, CSS.cyan, 'center', true);
    u.callSub = this.txt(RAIL.x + 760, RAIL.y + 76, 20, CSS.muted, 'center', false);
    u.speedSub = this.txt(RAIL.x + 836, RAIL.y + 76, 20, CSS.muted, 'center', false);

    this.hudGroup = [u.core, u.scrap, u.wave, u.medal, u.mod, u.speed, u.score,
      u.pTitle, u.pSector, u.pWaveHead, u.pWaveClock, u.pSelHead, u.pSelName, u.pSelStat,
      u.pSelRole, u.pAction, u.pSell, u.pLaneHead, u.pHint, u.pPause, u.pMenu,
      u.callText, u.speedText, u.callSub, u.speedSub]
      .concat(u.pRows, u.pRowCounts, u.pLanes, u.chipName, u.chipCost, u.abilName, u.abilCd);
  };

  VergeScene.prototype.showHud = function (on) {
    for (var i = 0; i < this.hudGroup.length; i++) setVis(this.hudGroup[i], on);
    if (!on) {
      this.ui.coach.setAlpha(0); this.ui.toast.setAlpha(0);
      this.ui.bannerTitle.setAlpha(0); this.ui.bannerSub.setAlpha(0);
    }
    setVis(this.world, on);
    setVis(this.hudGfx, on);
  };

  /* ======================================================== menu screens */
  VergeScene.prototype.buildScreens = function () {
    this.screenGfx = this.add.graphics().setDepth(30);
    this.screenHits = { menu: [], campaign: [], base: [], results: [], pause: [], mission: [] };
    var s = this.screens = {};
    var i, col, row, x, y;

    /* ---- title ---- */
    s.menu = [];
    s.menuTitle = this.txt(640, 196, 68, CSS.text, 'center', true, 31);
    s.menuSub = this.txt(640, 250, 24, CSS.cyan, 'center', false, 31);
    s.menuBtn = [];
    var menuLabels = ['CAMPAIGN', 'ENDLESS SIEGE', 'BASE', 'SETTINGS'];
    for (i = 0; i < menuLabels.length; i++) {
      s.menuBtn.push(this.txt(640, 358 + i * 68, 26, CSS.text, 'center', true, 31));
      this.screenHits.menu.push({ x: 450, y: 330 + i * 68, w: 380, h: 56, act: 'menu' + i });
    }
    s.menuFoot = this.txt(640, 648, 22, CSS.dim, 'center', false, 31);
    s.menuHint = this.txt(640, 616, 22, CSS.muted, 'center', false, 31);
    s.menu = [s.menuTitle, s.menuSub, s.menuFoot, s.menuHint].concat(s.menuBtn);

    /* ---- campaign select ---- */
    s.campHead = this.txt(640, 60, 34, CSS.text, 'center', true, 31);
    s.campSub = this.txt(640, 100, 22, CSS.muted, 'center', false, 31);
    s.campBack = this.txt(130, 60, 24, CSS.cyan, 'center', true, 31);
    s.campName = []; s.campMedal = []; s.campNum = [];
    for (i = 0; i < C.MISSIONS.length; i++) {
      col = i % 6; row = (i / 6) | 0;
      x = 130 + col * 174; y = 176 + row * 126;
      s.campNum.push(this.txt(x + 12, y + 20, 20, CSS.dim, 'left', true, 31));
      s.campName.push(this.txt(x + 75, y + 48, 22, CSS.text, 'center', true, 31));
      s.campMedal.push(this.txt(x + 75, y + 76, 22, CSS.amber, 'center', true, 31));
      this.screenHits.campaign.push({ x: x, y: y, w: 150, h: 96, act: 'mission' + i });
    }
    this.screenHits.campaign.push({ x: 60, y: 36, w: 140, h: 48, act: 'back' });
    s.campFoot = this.txt(640, 688, 22, CSS.dim, 'center', false, 31);
    s.campaign = [s.campHead, s.campSub, s.campBack, s.campFoot].concat(s.campNum, s.campName, s.campMedal);

    /* ---- base ---- */
    s.baseHead = this.txt(640, 60, 34, CSS.text, 'center', true, 31);
    s.baseBack = this.txt(130, 60, 24, CSS.cyan, 'center', true, 31);
    s.baseSalvage = this.txt(1220, 60, 26, CSS.amber, 'right', true, 31);
    s.baseName = []; s.baseEffect = []; s.baseLevel = []; s.baseCost = [];
    for (i = 0; i < C.FACILITIES.length; i++) {
      col = (i / 5) | 0; row = i % 5;
      x = 70 + col * 570; y = 170 + row * 100;
      s.baseName.push(this.txt(x + 16, y + 26, 24, CSS.text, 'left', true, 31));
      s.baseEffect.push(this.txt(x + 16, y + 58, 20, CSS.muted, 'left', false, 31));
      s.baseEffect[i].setWordWrapWidth(360);
      s.baseLevel.push(this.txt(x + 396, y + 26, 22, CSS.teal, 'left', true, 31));
      s.baseCost.push(this.txt(x + 452, y + 48, 22, CSS.amber, 'center', true, 31));
      this.screenHits.base.push({ x: x + 396, y: y + 24, w: 112, h: 52, act: 'fac' + i });
    }
    this.screenHits.base.push({ x: 60, y: 36, w: 140, h: 48, act: 'back' });
    s.baseFoot = this.txt(640, 690, 22, CSS.dim, 'center', false, 31);
    s.base = [s.baseHead, s.baseBack, s.baseSalvage, s.baseFoot]
      .concat(s.baseName, s.baseEffect, s.baseLevel, s.baseCost);

    /* ---- results ---- */
    s.resTitle = this.txt(640, 218, 52, CSS.text, 'center', true, 33);
    s.resSub = this.txt(640, 268, 24, CSS.muted, 'center', false, 33);
    s.resDetail = this.txt(640, 340, 24, CSS.text, 'center', false, 33);
    s.resDetail.setAlign('center');
    s.resMedal = this.txt(640, 424, 30, CSS.amber, 'center', true, 33);
    s.resBtn = [];
    for (i = 0; i < 3; i++) {
      s.resBtn.push(this.txt(400 + i * 240, 512, 24, CSS.text, 'center', true, 33));
      this.screenHits.results.push({ x: 316 + i * 240, y: 486, w: 168, h: 52, act: 'res' + i });
    }
    s.results = [s.resTitle, s.resSub, s.resDetail, s.resMedal].concat(s.resBtn);

    /* ---- pause ---- */
    s.pauseTitle = this.txt(640, 200, 40, CSS.text, 'center', true, 33);
    s.pauseBtn = [];
    var pauseLabels = ['RESUME', 'RESTART MISSION', 'SETTINGS', 'ABANDON'];
    for (i = 0; i < pauseLabels.length; i++) {
      s.pauseBtn.push(this.txt(640, 288 + i * 72, 26, CSS.text, 'center', true, 33));
      this.screenHits.pause.push({ x: 460, y: 262 + i * 72, w: 360, h: 52, act: 'pause' + i });
    }
    s.pauseFoot = this.txt(640, 600, 22, CSS.dim, 'center', false, 33);
    s.pause = [s.pauseTitle, s.pauseFoot].concat(s.pauseBtn);

    /* ---- live mission hit map (rail + panel) ---- */
    for (i = 0; i < C.TOWER_KEYS.length; i++) {
      this.screenHits.mission.push({ x: RAIL.x + 6 + i * 88, y: RAIL.y + 6, w: 84, h: 90, act: 'tower' + i });
    }
    for (i = 0; i < C.ABILITIES.length; i++) {
      this.screenHits.mission.push({ x: RAIL.x + 458 + i * 88, y: RAIL.y + 6, w: 84, h: 90, act: 'abil' + i });
    }
    this.screenHits.mission.push({ x: RAIL.x + 726, y: RAIL.y + 6, w: 68, h: 90, act: 'call' });
    this.screenHits.mission.push({ x: RAIL.x + 802, y: RAIL.y + 6, w: 68, h: 90, act: 'speed' });
    this.screenHits.mission.push({ x: PANEL.x + 12, y: 640, w: 164, h: 48, act: 'pauseBtn' });
    this.screenHits.mission.push({ x: PANEL.x + 180, y: 640, w: 160, h: 48, act: 'menuBtn' });
    this.screenHits.mission.push({ x: PANEL.x + 12, y: 412, w: 200, h: 40, act: 'buildBtn' });
    this.screenHits.mission.push({ x: PANEL.x + 220, y: 412, w: 120, h: 40, act: 'sellBtn' });

    var all = s.menu.concat(s.campaign, s.base, s.results, s.pause);
    for (i = 0; i < all.length; i++) all[i].setVisible(false);
  };

  VergeScene.prototype.setScreenVisible = function (name, on) {
    var arr = this.screens[name];
    for (var i = 0; i < arr.length; i++) setVis(arr[i], on);
  };

  VergeScene.prototype.showScreen = function (name) {
    var prev = this.mode;
    if (prev === 'menu' || prev === 'campaign' || prev === 'base' || prev === 'results') this.setScreenVisible(prev, false);
    this.mode = name;
    this.selectedPad = -1;
    this.pendingAbility = null;
    if (name === 'menu' || name === 'campaign' || name === 'base' || name === 'results') this.setScreenVisible(name, true);
    this.showHud(name === 'mission' || name === 'results');
    if (name !== 'mission' && name !== 'results') { this.run = null; }
    this.paintScreen();
    this.updateMusic();
    this.syncHook();
  };

  VergeScene.prototype.paintScreen = function () {
    var g = this.screenGfx, s = this.screens, i, col, row, x, y, medals, def, lvl, cost;
    g.clear();
    medals = C.totalMedals(profile);

    if (this.mode === 'menu') {
      box(g, 0, 0, GAME_W, GAME_H, PAL.ink, 0.94);
      /* skyline silhouette so the title screen is never a flat plate */
      g.fillStyle(0x0f1c2a, 1);
      for (i = 0; i < 26; i++) {
        var bw = 30 + (i * 37) % 46, bh = 70 + (i * 53) % 150;
        g.fillRect(i * 50 - 10, GAME_H - bh, bw, bh);
      }
      g.fillStyle(PAL.amber, 0.5);
      for (i = 0; i < 40; i++) g.fillRect(20 + (i * 131) % 1240, GAME_H - 40 - (i * 71) % 130, 4, 5);
      box(g, 380, 150, 520, 4, PAL.cyan, 0.85);
      box(g, 380, 272, 520, 2, PAL.line, 1);
      for (i = 0; i < 4; i++) {
        box(g, 450, 330 + i * 68, 380, 56, i === 0 ? PAL.blue : PAL.panel2, i === 0 ? 0.85 : 0.92, PAL.line, 2);
        box(g, 450, 330 + i * 68, 5, 56, i === 0 ? PAL.cyan : PAL.slate, 1);
      }
      setTextIfChanged(s.menuTitle, 'VERGE PROTOCOL');
      setTextIfChanged(s.menuSub, 'Hold the line. Rebuild the base. Close the Verge.');
      var labels = ['CAMPAIGN', 'ENDLESS SIEGE', 'BASE', 'SETTINGS'];
      for (i = 0; i < 4; i++) setTextIfChanged(s.menuBtn[i], labels[i]);
      var nxt = C.nextUnlock(medals);
      setTextIfChanged(s.menuHint, nxt ? ('Next unlock: ' + nxt.name + ' at ' + nxt.at + ' medals') : 'Every tower and ability unlocked.');
      setTextIfChanged(s.menuFoot, 'Medals ' + medals + '/' + C.MEDAL_TOTAL + '   Salvage ' + profile.salvage +
        '   Best siege ' + profile.best + '   Deepest wave ' + profile.bestWave);
      return;
    }

    if (this.mode === 'campaign') {
      box(g, 0, 0, GAME_W, GAME_H, PAL.ink, 0.96);
      box(g, 60, 36, 140, 48, PAL.panel2, 0.95, PAL.line, 2);
      var sectorTint = [PAL.amber, PAL.cyan, PAL.teal, PAL.violet];
      for (i = 0; i < C.MISSIONS.length; i++) {
        def = C.MISSIONS[i];
        col = i % 6; row = (i / 6) | 0;
        x = 130 + col * 174; y = 176 + row * 126;
        var open = C.missionUnlocked(profile, i), got = profile.medals[i];
        box(g, x, y, 150, 96, open ? PAL.panel2 : PAL.panel, open ? 0.95 : 0.6, open ? PAL.line : 0x1b2836, 2);
        box(g, x, y, 150, 5, sectorTint[def.sector - 1], open ? 1 : 0.35);
        if (got > 0) box(g, x, y + 91, 150, 5, PAL.teal, 0.85);
        if (!open) {
          g.lineStyle(3, PAL.slate, 0.6);
          g.strokeRect(x + 62, y + 44, 26, 22);
          g.beginPath(); g.moveTo(x + 68, y + 44); g.lineTo(x + 68, y + 36);
          g.lineTo(x + 82, y + 36); g.lineTo(x + 82, y + 44); g.strokePath();
        }
        setTextIfChanged(s.campNum[i], 'M' + def.n);
        setTextIfChanged(s.campName[i], open ? def.name : 'LOCKED');
        setColorIfChanged(s.campName[i], open ? CSS.text : CSS.dim);
        if (open) {
          var mstr = '';
          for (var k = 0; k < 3; k++) mstr += k < got ? '◆' : '◇';
          var mod = C.modifierDef(def.modifier);
          setTextIfChanged(s.campMedal[i], mstr + (def.boss ? '  BOSS' : (mod.short ? '  ' + mod.short : '')));
          setColorIfChanged(s.campMedal[i], def.boss ? CSS.coral : CSS.amber);
        } else {
          setTextIfChanged(s.campMedal[i], '');
        }
        setVis(s.campMedal[i], open);
        setVis(s.campNum[i], true);
      }
      setTextIfChanged(s.campHead, 'CAMPAIGN');
      setTextIfChanged(s.campSub, C.SECTORS[0].name + '  //  ' + C.SECTORS[1].name + '  //  ' +
        C.SECTORS[2].name + '  //  ' + C.SECTORS[3].name);
      setTextIfChanged(s.campBack, 'BACK');
      setTextIfChanged(s.campFoot, 'Medals ' + medals + '/' + C.MEDAL_TOTAL +
        '   Three medals means the core finished untouched.');
      return;
    }

    if (this.mode === 'base') {
      box(g, 0, 0, GAME_W, GAME_H, PAL.ink, 0.96);
      box(g, 60, 36, 140, 48, PAL.panel2, 0.95, PAL.line, 2);
      box(g, 60, 120, 1160, 2, PAL.line, 1);
      var fac = profile.facilities;
      for (i = 0; i < C.FACILITIES.length; i++) {
        col = (i / 5) | 0; row = i % 5;
        x = 70 + col * 570; y = 170 + row * 100;
        lvl = fac[i]; cost = C.facilityCost(lvl);
        var can = lvl < C.FACILITY_MAX && profile.salvage >= cost;
        box(g, x, y, 540, 88, PAL.panel2, 0.92, PAL.line, 2);
        box(g, x, y, 5, 88, [PAL.cyan, PAL.amber, PAL.coral, PAL.cyan, PAL.violet,
          PAL.teal, PAL.slate, PAL.cyan, PAL.amber, PAL.teal][i], 0.95);
        for (var p = 0; p < C.FACILITY_MAX; p++) {
          box(g, x + 396 + p * 20, y + 18, 14, 14, p < lvl ? PAL.teal : PAL.line, 1);
        }
        box(g, x + 396, y + 40, 112, 36, lvl >= C.FACILITY_MAX ? PAL.panel : (can ? PAL.blue : PAL.panel),
          0.95, can ? PAL.cyan : PAL.line, 2);
        setTextIfChanged(s.baseName[i], C.FACILITIES[i].name);
        setTextIfChanged(s.baseEffect[i], C.FACILITIES[i].effect);
        setTextIfChanged(s.baseLevel[i], 'LV ' + lvl);
        setTextIfChanged(s.baseCost[i], lvl >= C.FACILITY_MAX ? 'MAX' : (cost + ' SLV'));
        setColorIfChanged(s.baseCost[i], lvl >= C.FACILITY_MAX ? CSS.dim : (can ? CSS.text : CSS.muted));
      }
      setTextIfChanged(s.baseHead, 'FORWARD BASE');
      setTextIfChanged(s.baseBack, 'BACK');
      setTextIfChanged(s.baseSalvage, 'SALVAGE  ' + profile.salvage);
      setTextIfChanged(s.baseFoot, 'Salvage comes only from missions. Nothing here runs on a timer.');
      return;
    }

    if (this.mode === 'results') {
      box(g, 0, 0, GAME_W, GAME_H, PAL.ink, 0.82);
      box(g, 280, 160, 720, 400, PAL.panel, 0.97, PAL.line, 2);
      box(g, 280, 160, 720, 6, this.resWin ? PAL.teal : PAL.coral, 1);
      for (i = 0; i < 3; i++) {
        box(g, 316 + i * 240, 486, 168, 52, i === 1 ? PAL.blue : PAL.panel2, 0.95, PAL.line, 2);
      }
      return;
    }
  };

  VergeScene.prototype.paintPauseOverlay = function () {
    var g = this.pauseGfx;
    if (!g) g = this.pauseGfx = this.add.graphics().setDepth(32);
    g.clear();
    if (!this.pauseOpen) return;
    box(g, 0, 0, GAME_W, GAME_H, PAL.ink, 0.86);
    box(g, 430, 140, 420, 480, PAL.panel, 0.97, PAL.line, 2);
    box(g, 430, 140, 420, 6, PAL.cyan, 1);
    for (var i = 0; i < 4; i++) box(g, 460, 262 + i * 72, 360, 52, i === 0 ? PAL.blue : PAL.panel2, 0.95, PAL.line, 2);
  };

  VergeScene.prototype.setPaused = function (on) {
    if (this.pauseOpen === on) return;
    this.pauseOpen = on;
    var labels = ['RESUME', 'RESTART MISSION', 'SETTINGS', 'ABANDON'];
    setTextIfChanged(this.screens.pauseTitle, 'PAUSED');
    setTextIfChanged(this.screens.pauseFoot, 'Esc or P resumes. Keyboard and touch both work.');
    for (var i = 0; i < 4; i++) setTextIfChanged(this.screens.pauseBtn[i], labels[i]);
    this.setScreenVisible('pause', on);
    this.paintPauseOverlay();
    if (on) kit.pause('user'); else kit.resume('user');
  };

  /* ==================================================== mission lifecycle */
  VergeScene.prototype.clearPools = function () {
    var i, n, arr;
    for (i = 0; i < this.enemies.length; i++) this.enemies[i].active = false;
    for (i = 0; i < this.shots.length; i++) this.shots[i].active = false;
    for (i = 0; i < this.towers.length; i++) this.towers[i].active = false;
    for (i = 0; i < this.drops.length; i++) this.drops[i].active = false;
    for (i = 0; i < this.fx.length; i++) this.fx[i].active = false;
    for (n = 0; n < PARTICLE_SYSTEMS.length; n++) {
      arr = this.particles[PARTICLE_SYSTEMS[n]];
      for (i = 0; i < arr.length; i++) arr[i].active = false;
    }
    this.activeEnemies.length = 0;
    for (i = 0; i < 4; i++) { this.laneCounts[i] = 0; this.laneDamage[i] = 0; }
  };

  VergeScene.prototype.startMission = function (index, endless) {
    var def = endless ? C.endlessDef(C.mapIndex(index)) : C.missionDef(index);
    var mod = C.modifierDef(def.modifier);
    var fac = C.facilityMap(profile.facilities);
    this.setMap(def.map);
    this.clearPools();
    var coreMax = 100 + 20 * fac.wallWorks;
    this.run = {
      endless: !!endless, def: def, mod: mod, fac: fac,
      missionIndex: endless ? -1 : C.missionIndex(index),
      wave: 0, waveDef: null, queue: [], cursor: 0, spawnTimer: 0,
      phase: 'prep', prep: 12, prepMax: 12,
      coreMax: coreMax, coreHp: coreMax,
      scrap: Math.max(4, Math.round((16 + 4 * fac.commandPost) * mod.scrap)),
      score: 0, kills: 0, leaks: 0, elapsed: 0, wavesDone: 0,
      speed: 1, breachLane: -1, lastBreach: -1,
      abilityCd: { airstrike: 0, barricade: 0, emp: 0 },
      barricade: { lane: -1, t: 0 },
      boss: null, flash: 0, bossWarned: false
    };
    this.op = {
      x: this.map.core[0] - 120, y: this.map.core[1], facing: -Math.PI / 2,
      fire: 0.25, state: 'idle', stateT: 0, step: 0, bob: 0, moving: 0, commandT: 0
    };
    this.selectedPad = -1;
    this.pendingAbility = null;
    this.towerType = C.unlockedTowers(C.totalMedals(profile))[0] || 'rifle';
    this.toast = null; this.toastQueue.length = 0;
    this.coachIndex = (!profile.tutorialDone && !endless && this.run.missionIndex === 0) ? 0 : -1;
    this.coachTimer = this.coachIndex >= 0 ? 4.2 : 0;
    this.showScreen('mission');
    this.setBanner(def.name, endless ? this.map.name + '  //  survive as long as you can' :
      ('SECTOR ' + def.sector + '  //  ' + this.map.name), 2.6);
    this.warmAudio();
    this.syncHook();
  };

  VergeScene.prototype.warmAudio = function () {
    if (this.audioWarm) return;
    this.audioWarm = true;
    kit.audio.preload(['bed', 'danger', 'base']);
  };

  VergeScene.prototype.restartRun = function () {
    if (!this.run) { this.showScreen('menu'); return; }
    if (this.run.endless) this.startMission(this.mapIndex, true);
    else this.startMission(this.run.missionIndex, false);
  };

  VergeScene.prototype.startWave = function () {
    var r = this.run;
    r.wave += 1;
    var isFinal = !r.endless && r.wave >= r.def.waves;
    r.waveDef = C.buildWave(r.def, r.wave, this.map.lanes.length, isFinal);
    r.queue = r.waveDef.queue;
    r.cursor = 0;
    r.spawnTimer = 0.35;
    r.phase = 'active';
    r.bossWarned = false;
    this.toastNow('WAVE ' + r.wave, CSS.cyan);
    kit.audio.sfx('warning', { volume: 0.5 });
    this.updateMusic();
  };

  VergeScene.prototype.nextWaveDef = function () {
    var r = this.run;
    if (!r) return null;
    var isFinal = !r.endless && (r.wave + 1) >= r.def.waves;
    if (!r.previewCache || r.previewWave !== r.wave + 1) {
      r.previewCache = C.buildWave(r.def, r.wave + 1, this.map.lanes.length, isFinal);
      r.previewWave = r.wave + 1;
    }
    return r.previewCache;
  };

  VergeScene.prototype.finishWave = function () {
    var r = this.run;
    r.wavesDone += 1;
    var bonus = 3 + Math.floor(r.wave / 5);
    bonus = Math.round(bonus * (1 + 0.05 * r.fac.radarMast));
    r.scrap = Math.min(999, r.scrap + bonus);
    r.score += r.wave * 40;
    /* relief beat: the field is swept clean of loose scrap */
    var collected = 0, i;
    for (i = 0; i < this.drops.length; i++) {
      if (!this.drops[i].active) continue;
      this.drops[i].active = false; collected++;
    }
    if (collected) r.scrap = Math.min(999, r.scrap + collected);
    this.burst('burst', this.map.core[0], this.map.core[1], 18, PAL.teal, 150, { drag: 1.6 });
    this.addFx(1, this.map.core[0], this.map.core[1], 40, 0.7, PAL.teal);
    kit.audio.sfx('clear');
    this.toastNow('WAVE CLEAR  +' + (bonus + collected), CSS.teal);
    if (!r.endless && r.wave >= r.def.waves) { this.finishMission(true); return; }
    r.phase = 'prep';
    r.prepMax = Math.max(4, 8 * r.mod.spawn);
    r.prep = r.prepMax;
    this.updateMusic();
  };

  VergeScene.prototype.finishMission = function (won) {
    var r = this.run, i;
    if (r.phase === 'won' || r.phase === 'lost') return;
    r.phase = won ? 'won' : 'lost';
    this.resWin = won;
    var medal = 0, salvage = 0, improved = false;
    if (r.endless) {
      salvage = C.endlessSalvage(r.wavesDone);
      if (r.score > profile.best) { profile.best = r.score; improved = true; }
      if (r.wavesDone > profile.bestWave) profile.bestWave = r.wavesDone;
    } else if (won) {
      medal = C.medalFor(r.coreHp, r.coreMax);
      salvage = C.salvageFor(r.def, medal, profile.facilities[9]);
      if (medal > profile.medals[r.missionIndex]) { profile.medals[r.missionIndex] = medal; improved = true; }
      profile.lastMission = Math.min(C.MISSIONS.length - 1, r.missionIndex + 1);
    } else {
      salvage = Math.floor(C.salvageFor(r.def, 0, profile.facilities[9]) * 0.35);
    }
    profile.salvage = Math.min(9999999, profile.salvage + salvage);
    if (!profile.tutorialDone && !r.endless && r.missionIndex === 0 && won) profile.tutorialDone = true;
    profile.seen = Math.min(9999, profile.seen + 1);
    saveProfile();
    this.lastResult = { won: won, medal: medal, salvage: salvage, improved: improved };
    if (won) { kit.audio.sfx('victory'); this.burst('burst', this.map.core[0], this.map.core[1], 24, PAL.teal, 200, { drag: 1.4 }); }
    else { kit.audio.sfx('defeat'); kit.juice.shake(10, 420); this.burst('debris', this.map.core[0], this.map.core[1], 20, PAL.coral, 220, { grav: 120 }); }
    for (i = 0; i < this.enemies.length; i++) if (this.enemies[i].active && !won) this.enemies[i].stun = 6;
    this.showResults();
  };

  VergeScene.prototype.showResults = function () {
    var r = this.run, res = this.lastResult, s = this.screens;
    var lane = r.lastBreach >= 0 ? r.lastBreach : this.worstLane();
    var laneName = lane >= 0 && this.map.lanes[lane] ? this.map.lanes[lane].label : 'NONE';
    setTextIfChanged(s.resTitle, res.won ? (r.endless ? 'SIEGE ENDED' : 'SECTOR HELD') : 'CORE BREACHED');
    setColorIfChanged(s.resTitle, res.won ? CSS.teal : CSS.coral);
    setTextIfChanged(s.resSub, r.endless ? (this.map.name + '  //  endless siege') : (r.def.name + '  //  ' + this.map.name));
    var detail = 'WAVES ' + r.wavesDone + (r.endless ? '' : ' / ' + r.def.waves) +
      '     KILLS ' + r.kills + '     SCORE ' + r.score + '\n' +
      'CORE ' + Math.max(0, Math.round(r.coreHp)) + ' / ' + r.coreMax +
      '     SALVAGE EARNED ' + res.salvage;
    if (!res.won) detail += '\nThe lane that broke: ' + laneName + '   (' + Math.round(this.laneDamage[lane >= 0 ? lane : 0]) + ' core damage)';
    else if (!r.endless) detail += '\nMedal threshold: keep the core untouched for three medals.';
    setTextIfChanged(s.resDetail, detail);
    var mstr = '';
    if (!r.endless && res.won) { for (var k = 0; k < 3; k++) mstr += k < res.medal ? '◆' : '◇'; }
    setTextIfChanged(s.resMedal, r.endless ? ('BEST ' + profile.best + (res.improved ? '   NEW BEST' : '')) :
      (res.won ? mstr + '   MEDALS ' + C.totalMedals(profile) + '/' + C.MEDAL_TOTAL : 'NO MEDAL'));
    setColorIfChanged(s.resMedal, res.won ? CSS.amber : CSS.muted);
    var next = (!r.endless && res.won && r.missionIndex + 1 < C.MISSIONS.length) ? 'NEXT MISSION' : 'BASE';
    setTextIfChanged(s.resBtn[0], 'RETRY');
    setTextIfChanged(s.resBtn[1], next);
    setTextIfChanged(s.resBtn[2], 'CAMPAIGN');
    this.mode = 'results';
    this.setScreenVisible('results', true);
    this.paintScreen();
    this.syncHook();
  };

  VergeScene.prototype.worstLane = function () {
    var best = -1, v = -1;
    for (var i = 0; i < this.map.lanes.length; i++) {
      if (this.laneDamage[i] > v) { v = this.laneDamage[i]; best = i; }
    }
    return v > 0 ? best : -1;
  };

  VergeScene.prototype.updateMusic = function () {
    var want = 'base';
    if (this.mode === 'mission' && this.run) {
      var r = this.run;
      var pressure = this.activeEnemies.length;
      want = (r.phase === 'active' && (pressure >= 10 || r.boss)) ? 'danger' : 'bed';
    }
    if (want !== this.musicTrack) {
      this.musicTrack = want;
      kit.audio.music(want, 900);
    }
  };

  /* ================================================== transient UI (law) */
  /* One transient at a time. Corner chips during play, centre banners only
   * at run boundaries, coach text as a thin fading strip. */
  VergeScene.prototype.toastNow = function (text, color) {
    if (this.coachIndex >= 0 && this.coachTimer > 0) {
      if (this.toastQueue.length < 3) this.toastQueue.push({ text: text, color: color });
      return;
    }
    if (this.toast && this.toast.t > 0.55) {
      if (this.toastQueue.length < 3) this.toastQueue.push({ text: text, color: color });
      return;
    }
    this.toast = { text: text, color: color || CSS.amber, t: 1.0 };
  };

  VergeScene.prototype.setBanner = function (title, sub, hold) {
    this.banner = { title: title, sub: sub || '', t: hold || 2.2, max: hold || 2.2 };
  };

  VergeScene.prototype.stepTransients = function (dt) {
    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) {
        this.toast = null;
        if (this.toastQueue.length) {
          var q = this.toastQueue.shift();
          this.toast = { text: q.text, color: q.color, t: 1.0 };
        }
      }
    }
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.coachIndex >= 0) {
      this.coachTimer -= dt;
      if (this.coachTimer <= 0) {
        this.coachIndex += 1;
        if (this.coachIndex >= C.TUTORIAL.length) { this.coachIndex = -1; this.coachTimer = 0; }
        else this.coachTimer = 4.2;
      }
    }
  };

  VergeScene.prototype.advanceCoach = function (step) {
    if (this.coachIndex === step) { this.coachTimer = Math.min(this.coachTimer, 0.5); }
  };

  /* ======================================================= build economy */
  VergeScene.prototype.towerAtPad = function (pad) {
    for (var i = 0; i < this.towers.length; i++) {
      if (this.towers[i].active && this.towers[i].pad === pad) return this.towers[i];
    }
    return null;
  };

  VergeScene.prototype.buildCost = function (pad) {
    var t = this.towerAtPad(pad);
    if (!t) return C.towerDef(this.towerType).cost;
    if (t.level >= C.MAX_TOWER_LEVEL) return -1;
    return C.upgradeCost(t.level);
  };

  VergeScene.prototype.confirmBuild = function (pad) {
    var r = this.run;
    if (!r || pad < 0) return;
    var existing = this.towerAtPad(pad);
    var pos = this.map.pads[pad];
    if (existing) {
      if (existing.level >= C.MAX_TOWER_LEVEL) { this.toastNow('MAX LEVEL', CSS.muted); kit.audio.sfx('cancel'); return; }
      var uc = C.upgradeCost(existing.level);
      if (r.scrap < uc) { this.toastNow('NEED ' + uc + ' SCRAP', CSS.coral); kit.audio.sfx('cancel'); return; }
      r.scrap -= uc;
      existing.level += 1;
      existing.buildT = 0.5;
      kit.audio.sfx('upgrade');
      this.burst('build', pos[0], pos[1], 10, C.towerDef(existing.type).color, 90, { grav: 60 });
      this.addFx(1, pos[0], pos[1], 30, 0.4, C.towerDef(existing.type).color);
      this.toastNow(C.towerDef(existing.type).short + ' LV' + (existing.level + 1), CSS.teal);
      this.recomputeBuffs();
      this.markCommand();
      return;
    }
    var def = C.towerDef(this.towerType);
    if (C.unlockedTowers(C.totalMedals(profile)).indexOf(def.id) < 0) {
      this.toastNow('LOCKED', CSS.muted); kit.audio.sfx('cancel'); return;
    }
    if (r.scrap < def.cost) { this.toastNow('NEED ' + def.cost + ' SCRAP', CSS.coral); kit.audio.sfx('cancel'); return; }
    var slot = null;
    for (var i = 0; i < this.towers.length; i++) if (!this.towers[i].active) { slot = this.towers[i]; break; }
    if (!slot) { this.toastNow('NO CAPACITY', CSS.coral); return; }
    r.scrap -= def.cost;
    slot.active = true; slot.pad = pad; slot.x = pos[0]; slot.y = pos[1];
    slot.type = def.id; slot.level = 0; slot.cooldown = 0.3; slot.flash = 0;
    slot.angle = Math.atan2(this.map.core[1] - pos[1], this.map.core[0] - pos[0]) + Math.PI;
    slot.buildT = 0.6; slot.recoil = 0; slot.buff = 1;
    kit.audio.sfx('place');
    this.burst('build', pos[0], pos[1], 12, def.color, 110, { grav: 70 });
    this.addFx(1, pos[0], pos[1], 34, 0.45, def.color);
    kit.juice.shake(2, 90);
    this.toastNow(def.short + ' BUILT', CSS.teal);
    this.recomputeBuffs();
    this.markCommand();
    this.advanceCoach(0);
  };

  VergeScene.prototype.sellTower = function (pad) {
    var t = this.towerAtPad(pad), r = this.run;
    if (!t || !r) return;
    var spent = C.towerDef(t.type).cost;
    for (var l = 0; l < t.level; l++) spent += C.upgradeCost(l);
    r.scrap = Math.min(999, r.scrap + Math.floor(spent * 0.6));
    t.active = false;
    kit.audio.sfx('cancel');
    this.burst('debris', t.x, t.y, 9, PAL.slate, 90, { grav: 120 });
    this.toastNow('RECOVERED ' + Math.floor(spent * 0.6), CSS.amber);
    this.recomputeBuffs();
  };

  /* Med stations speed neighbours; recomputed on every roster change only. */
  VergeScene.prototype.recomputeBuffs = function () {
    var i, j, t, m;
    for (i = 0; i < this.towers.length; i++) {
      t = this.towers[i];
      if (!t.active) continue;
      t.buff = 1;
      for (j = 0; j < this.towers.length; j++) {
        m = this.towers[j];
        if (!m.active || m === t || m.type !== 'med') continue;
        if (Math.hypot(m.x - t.x, m.y - t.y) <= this.towerRange(m)) t.buff = 0.88;
      }
    }
  };

  VergeScene.prototype.towerRange = function (t) {
    var r = this.run;
    var stats = C.towerStats(t.type, t.level, r ? r.fac : {});
    var range = stats.range * (r ? r.mod.range : 1);
    var hz = this.hazardAt(t.x, t.y);
    if (hz) range *= C.hazardDef(hz.type).range;
    return range;
  };

  VergeScene.prototype.hazardAt = function (x, y) {
    var hs = this.map.hazards, i;
    for (i = 0; i < hs.length; i++) {
      if (Math.hypot(x - hs[i].x, y - hs[i].y) <= hs[i].r) return hs[i];
    }
    return null;
  };

  VergeScene.prototype.markCommand = function () {
    if (this.op) { this.op.state = 'command'; this.op.stateT = 0.45; this.op.commandT = 0.45; }
  };

  /* ========================================================== abilities */
  VergeScene.prototype.abilityReady = function (id) {
    var r = this.run;
    if (!r) return false;
    if (C.unlockedAbilities(C.totalMedals(profile)).indexOf(id) < 0) return false;
    return r.abilityCd[id] <= 0;
  };

  VergeScene.prototype.abilityCooldown = function (id) {
    var d = C.abilityDef(id), r = this.run;
    var cd = d.cooldown;
    if (id === 'airstrike' && r) cd *= (1 - 0.1 * r.fac.dronePad);
    return cd;
  };

  VergeScene.prototype.selectAbility = function (id) {
    if (!this.abilityReady(id)) {
      this.toastNow(C.unlockedAbilities(C.totalMedals(profile)).indexOf(id) < 0 ? 'LOCKED' : 'ON COOLDOWN', CSS.muted);
      kit.audio.sfx('cancel');
      return;
    }
    var d = C.abilityDef(id);
    if (!d.targeted) { this.fireAbility(id, 0, 0); return; }
    this.pendingAbility = (this.pendingAbility === id) ? null : id;
    this.selectedPad = -1;
    kit.audio.sfx('select');
    if (this.pendingAbility) this.toastNow(d.hint.toUpperCase(), CSS.cyan);
  };

  VergeScene.prototype.fireAbility = function (id, x, y) {
    var r = this.run, i, e, d = C.abilityDef(id);
    if (!r || !this.abilityReady(id)) return;
    if (id === 'airstrike') {
      var dmg = d.damage * (1 + 0.2 * r.fac.dronePad);
      this.addFx(2, x, y, d.radius, 0.55, PAL.amber);
      this.burst('burst', x, y, 16, PAL.amber, 220, { grav: 40 });
      this.burst('debris', x, y, 10, PAL.coral, 170, { grav: 180 });
      kit.juice.shake(9, 260); kit.juice.hitStop(70);
      for (i = 0; i < this.activeEnemies.length; i++) {
        e = this.activeEnemies[i];
        if (Math.hypot(e.x - x, e.y - y) <= d.radius) this.damageEnemy(e, dmg, 'ability');
      }
    } else if (id === 'barricade') {
      var lane = this.nearestSplitLane(x, y);
      if (lane < 0) { this.toastNow('TAP A FORK MARKER', CSS.muted); kit.audio.sfx('cancel'); return; }
      r.barricade.lane = lane; r.barricade.t = d.duration;
      var sp = C.splitPoint(this.map.lanes[lane]);
      this.addFx(1, sp.x, sp.y, 44, 0.5, PAL.amber);
      this.burst('build', sp.x, sp.y, 12, PAL.amber, 120, { grav: 90 });
      this.toastNow(this.map.lanes[lane].label + ' REROUTED', CSS.amber);
    } else if (id === 'emp') {
      this.addFx(3, this.map.core[0], this.map.core[1], 520, 0.7, PAL.cyan);
      kit.juice.shake(7, 220);
      r.flash = Math.max(r.flash, 0.35);
      for (i = 0; i < this.activeEnemies.length; i++) {
        e = this.activeEnemies[i];
        e.stun = Math.max(e.stun, d.stun);
        this.damageEnemy(e, d.damage, 'ability');
      }
      this.toastNow('EMP DISCHARGE', CSS.cyan);
    }
    r.abilityCd[id] = this.abilityCooldown(id);
    this.pendingAbility = null;
    this.markCommand();
    kit.audio.sfx('ability');
    this.advanceCoach(3);
  };

  VergeScene.prototype.nearestSplitLane = function (x, y) {
    var best = -1, bd = 90, i, sp, d;
    for (i = 0; i < this.map.lanes.length; i++) {
      sp = C.splitPoint(this.map.lanes[i]);
      d = Math.hypot(sp.x - x, sp.y - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  /* ============================================================ the sim */
  VergeScene.prototype.spawnEnemy = function (typeId, lane, isBoss, x, y, wp, branch) {
    var r = this.run, i, e = null;
    for (i = 0; i < this.enemies.length; i++) if (!this.enemies[i].active) { e = this.enemies[i]; break; }
    if (!e) return null;
    var def = isBoss ? C.bossDef(typeId) : C.enemyDef(typeId);
    var wd = r.waveDef || { hpScale: 1, speedScale: 1 };
    lane = clamp(lane | 0, 0, this.map.lanes.length - 1);
    if (branch == null) branch = (r.spawnCount = (r.spawnCount || 0) + 1) % 2;
    if (r.barricade.lane === lane && r.barricade.t > 0) branch = 1;
    e.active = true; e.def = def; e.boss = !!isBoss; e.lane = lane; e.branch = branch;
    e.path = this.paths[lane][branch];
    e.wp = wp == null ? 1 : wp;
    e.x = x == null ? e.path[0].x : x;
    e.y = y == null ? e.path[0].y : y;
    var hp = def.hp * (isBoss ? r.mod.hp : wd.hpScale);
    e.hp = hp; e.maxHp = hp;
    e.speed = def.speed * wd.speedScale;
    e.radius = def.radius; e.slow = 1; e.hit = 0; e.burnDps = 0; e.burnT = 0;
    e.stun = 0; e.phase = 0; e.phaseT = def.phaseEvery || 0; e.broodT = def.broodEvery || 0;
    e.step = Math.random() * TAU; e.facing = 0; e.dead = false; e.inv = false;
    e.damage = def.damage; e.reward = def.reward; e.armor = def.armor || 0; e.regen = def.regen || 0;
    if (isBoss) {
      r.boss = e;
      this.setBanner(def.name, def.line, 3.0);
      kit.audio.sfx('warning');
      kit.juice.shake(6, 300);
    }
    return e;
  };

  VergeScene.prototype.damageEnemy = function (e, amount, source) {
    if (!e.active || e.dead || e.inv) return;
    var dmg = Math.max(1, amount - (e.armor || 0));
    e.hp -= dmg;
    e.hit = 0.11;
    if (e.hp <= 0) this.killEnemy(e, source);
  };

  VergeScene.prototype.killEnemy = function (e, source) {
    if (e.dead) return;
    var r = this.run, i, def = e.def;
    e.dead = true; e.active = false;
    r.kills += 1;
    r.score += (e.boss ? 400 : 8) + (source === 'operator' ? 2 : 0);
    var drops = Math.min(4, def.reward);
    for (i = 0; i < drops; i++) this.spawnDrop(e.x, e.y);
    this.burst('debris', e.x, e.y, e.boss ? 20 : (def.tier === 'elite' ? 12 : 7), def.accent, e.boss ? 220 : 140, { grav: 150 });
    this.burst('contact', e.x, e.y, 4, PAL.white, 90);
    if (e.boss) {
      r.boss = null;
      this.addFx(2, e.x, e.y, 96, 0.7, def.accent);
      kit.juice.shake(11, 380); kit.juice.hitStop(120);
      this.toastNow(def.name + ' DOWN', CSS.teal);
    } else if (def.tier === 'elite') {
      kit.juice.hitStop(60);
    }
    kit.audio.sfx('kill', { volume: e.boss ? 1 : 0.5, rate: e.boss ? 0.7 : 1 });
    if (def.splits && !e.boss) {
      for (i = 0; i < 2; i++) this.spawnEnemy(def.splits, e.lane, false, e.x + (i ? 8 : -8), e.y, e.wp, e.branch);
    }
  };

  VergeScene.prototype.spawnDrop = function (x, y) {
    for (var i = 0; i < this.drops.length; i++) {
      var d = this.drops[i];
      if (d.active) continue;
      var a = Math.random() * TAU;
      d.active = true; d.x = x; d.y = y;
      d.vx = Math.cos(a) * 46; d.vy = Math.sin(a) * 46;
      d.life = 20; d.spin = Math.random() * TAU;
      return d;
    }
    return null;
  };

  VergeScene.prototype.breachCore = function (e) {
    var r = this.run;
    r.coreHp = Math.max(0, r.coreHp - e.damage);
    r.leaks += 1;
    r.lastBreach = e.lane;
    this.laneDamage[e.lane] += e.damage;
    r.flash = Math.max(r.flash, 0.28);
    kit.juice.shake(e.boss ? 12 : 7, 260);
    kit.audio.sfx('breach', { volume: e.boss ? 1 : 0.7 });
    this.burst('burst', this.map.core[0], this.map.core[1], 10, PAL.coral, 170, { grav: 60 });
    this.addFx(1, this.map.core[0], this.map.core[1], 54, 0.5, PAL.coral);
    this.toastNow(this.map.lanes[e.lane].label + ' BREACH', CSS.coral);
    e.active = false; e.dead = true;
    if (e.boss) r.boss = null;
    if (r.coreHp <= 0) this.finishMission(false);
  };

  VergeScene.prototype.updateEnemies = function (dt) {
    var r = this.run, i, j, e, def, hz, hd, mul, remaining, hops, tgt, dx, dy, dist;
    var splitOf = this.splitIdx;
    this.activeEnemies.length = 0;
    for (i = 0; i < this.map.lanes.length; i++) this.laneCounts[i] = 0;

    for (i = 0; i < this.enemies.length; i++) {
      e = this.enemies[i];
      if (!e.active) continue;
      def = e.def;
      e.hit = Math.max(0, e.hit - dt);
      if (e.stun > 0) e.stun -= dt;
      if (e.regen) e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);
      if (def.phaseEvery) {
        e.phaseT -= dt;
        if (e.phaseT <= 0) {
          if (e.inv) { e.inv = false; e.phaseT = def.phaseEvery; }
          else { e.inv = true; e.phaseT = def.phaseFor; }
        }
      }
      if (def.broodEvery) {
        e.broodT -= dt;
        if (e.broodT <= 0) {
          e.broodT = def.broodEvery;
          this.spawnEnemy('crawler', e.lane, false, e.x, e.y, e.wp, e.branch);
          this.burst('burst', e.x, e.y, 6, def.accent, 90);
        }
      }
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.hp -= e.burnDps * dt;
        if (Math.random() < dt * 6) this.spawnParticle('ember', e.x + (Math.random() - 0.5) * 10, e.y, 0, -24 - Math.random() * 20, 0.4, 2.4, PAL.amber, { drag: 1.2 });
        if (e.hp <= 0) { this.killEnemy(e, 'burn'); continue; }
      }

      /* hazard field */
      mul = 1;
      hz = this.hazardAt(e.x, e.y);
      if (hz) {
        hd = C.hazardDef(hz.type);
        if (!def.slowImmune || hd.speed > 1) mul *= hd.speed;
        if (hd.dps) {
          e.hp -= hd.dps * dt;
          if (Math.random() < dt * 3) this.spawnParticle('ember', e.x, e.y - 6, 0, -30, 0.4, 2, hd.edge, { drag: 1.4 });
          if (e.hp <= 0) { this.killEnemy(e, 'hazard'); continue; }
        }
      }
      if (e.stun > 0) mul = 0;
      e.slow = mul;

      /* howler aura */
      if (r.howlBoost > 1 && def.id !== 'howler') mul *= r.howlBoost;

      remaining = e.speed * mul * dt;
      e.step += remaining * 0.09;
      hops = 0;
      while (remaining > 0 && hops < 4) {
        if (e.wp >= e.path.length) { this.breachCore(e); break; }
        tgt = e.path[e.wp];
        dx = tgt.x - e.x; dy = tgt.y - e.y;
        dist = Math.hypot(dx, dy);
        if (dist <= remaining) {
          e.x = tgt.x; e.y = tgt.y;
          remaining -= dist;
          /* the fork: a live barricade folds everyone onto the far branch */
          if (e.wp === splitOf[e.lane]) {
            var want = (r.barricade.lane === e.lane && r.barricade.t > 0) ? 1 : e.branch;
            if (want !== e.branch || e.path !== this.paths[e.lane][want]) {
              e.branch = want;
              e.path = this.paths[e.lane][want];
            }
          }
          e.wp += 1;
          if (e.wp >= e.path.length) { this.breachCore(e); break; }
          hops++;
        } else {
          e.x += dx / dist * remaining;
          e.y += dy / dist * remaining;
          e.facing = Math.atan2(dy, dx);
          remaining = 0;
        }
      }
      if (!e.active) continue;
      this.activeEnemies.push(e);
      this.laneCounts[e.lane] += 1;
    }

    /* howler aura is resolved once per step, not per pair */
    var boost = 1;
    for (i = 0; i < this.activeEnemies.length; i++) {
      if (this.activeEnemies[i].def.aura) { boost = 1 + this.activeEnemies[i].def.aura; break; }
    }
    r.howlBoost = boost;
  };

  VergeScene.prototype.nearestEnemy = function (x, y, range, minRange) {
    var best = null, bd = range * range, i, e, d;
    for (i = 0; i < this.activeEnemies.length; i++) {
      e = this.activeEnemies[i];
      if (e.inv) continue;
      d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (minRange && d < minRange * minRange) continue;
      if (d <= bd) { bd = d; best = e; }
    }
    return best;
  };

  VergeScene.prototype.fireShot = function (x, y, target, damage, speed, color, aoe, radius) {
    for (var i = 0; i < this.shots.length; i++) {
      var s = this.shots[i];
      if (s.active) continue;
      s.active = true; s.x = x; s.y = y; s.tx = target.x; s.ty = target.y;
      s.target = target; s.damage = damage; s.speed = speed; s.color = color;
      s.aoe = aoe || 0; s.radius = radius || 0; s.life = 3.2; s.spin = 0;
      return s;
    }
    return null;
  };

  VergeScene.prototype.updateTowers = function (dt) {
    var r = this.run, i, j, t, stats, range, target, chain, prev, e, ang, count;
    for (i = 0; i < this.towers.length; i++) {
      t = this.towers[i];
      if (!t.active) continue;
      if (t.buildT > 0) t.buildT -= dt;
      if (t.flash > 0) t.flash -= dt;
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 5);
      stats = C.towerStats(t.type, t.level, r.fac);
      range = this.towerRange(t);
      t.cooldown -= dt;

      if (t.type === 'med') {
        if (t.cooldown <= 0) {
          t.cooldown = stats.cooldown;
          if (r.coreHp < r.coreMax) {
            r.coreHp = Math.min(r.coreMax, r.coreHp + stats.repair);
            this.spawnParticle('trail', t.x, t.y - 10, 0, -34, 0.6, 3, PAL.teal, { drag: 1.1 });
          }
        }
        continue;
      }

      target = this.nearestEnemy(t.x, t.y, range, stats.minRange);
      if (!target) continue;
      ang = Math.atan2(target.y - t.y, target.x - t.x);
      t.angle = ang;
      if (t.cooldown > 0) continue;

      if (t.type === 'rifle') {
        t.cooldown = stats.cooldown * t.buff;
        this.fireShot(t.x + Math.cos(ang) * 16, t.y + Math.sin(ang) * 16, target, stats.damage, 420, C.TOWERS.rifle.color, 0, 0);
        t.recoil = 1; t.flash = 0.09;
        this.spawnParticle('contact', t.x + Math.cos(ang) * 20, t.y + Math.sin(ang) * 20,
          Math.cos(ang) * 40, Math.sin(ang) * 40, 0.16, 2.4, PAL.amber, { drag: 3 });
        kit.audio.sfx('fire', { volume: 0.22, rate: 0.9 + Math.random() * 0.25 });
      } else if (t.type === 'mortar') {
        t.cooldown = stats.cooldown * t.buff;
        this.fireShot(t.x, t.y, target, stats.damage, 210, C.TOWERS.mortar.color, 1, stats.radius);
        t.recoil = 1; t.flash = 0.12;
        kit.audio.sfx('fire', { volume: 0.3, rate: 0.6 });
      } else if (t.type === 'tesla') {
        t.cooldown = stats.cooldown * t.buff;
        chain = [target];
        prev = target;
        for (j = 0; j < this.activeEnemies.length && chain.length < stats.chain; j++) {
          e = this.activeEnemies[j];
          if (e === target || e.inv || chain.indexOf(e) >= 0) continue;
          if (Math.hypot(e.x - prev.x, e.y - prev.y) < 78 + t.level * 6) { chain.push(e); prev = e; }
        }
        var px = t.x, py = t.y;
        for (j = 0; j < chain.length; j++) {
          this.addFx(0, px, py, 0, 0.18, C.TOWERS.tesla.color, chain[j].x, chain[j].y);
          this.damageEnemy(chain[j], stats.damage, 'tower');
          this.burst('contact', chain[j].x, chain[j].y, 3, C.TOWERS.tesla.color, 70);
          px = chain[j].x; py = chain[j].y;
        }
        t.flash = 0.14;
        kit.audio.sfx('hit', { volume: 0.32, rate: 1.4 });
      } else if (t.type === 'flame') {
        t.cooldown = stats.cooldown;
        count = 0;
        for (j = 0; j < this.activeEnemies.length; j++) {
          e = this.activeEnemies[j];
          if (e.inv) continue;
          var d = Math.hypot(e.x - t.x, e.y - t.y);
          if (d > range) continue;
          var da = Math.abs(((Math.atan2(e.y - t.y, e.x - t.x) - ang + Math.PI * 3) % TAU) - Math.PI);
          if (da > 0.62) continue;
          this.damageEnemy(e, stats.dps * stats.cooldown, 'tower');
          if (e.active) { e.burnDps = stats.burn; e.burnT = 2; }
          count++;
        }
        t.flash = 0.1;
        this.spawnParticle('trail', t.x + Math.cos(ang) * 22, t.y + Math.sin(ang) * 22,
          Math.cos(ang) * 120, Math.sin(ang) * 120, 0.32, 5, count ? PAL.amber : 0xff9d72, { drag: 1.6 });
        if (count && Math.random() < 0.25) kit.audio.sfx('fire', { volume: 0.16, rate: 1.6 });
      }
    }
  };

  VergeScene.prototype.updateShots = function (dt) {
    var i, j, s, e, dx, dy, dist, stepLen;
    for (i = 0; i < this.shots.length; i++) {
      s = this.shots[i];
      if (!s.active) continue;
      s.life -= dt;
      var tgt = s.target;
      if (s.life <= 0 || !tgt || !tgt.active) {
        if (s.aoe && s.life > 0) this.explode(s);
        s.active = false;
        continue;
      }
      dx = tgt.x - s.x; dy = tgt.y - s.y;
      dist = Math.hypot(dx, dy);
      stepLen = s.speed * dt;
      if (dist <= stepLen + 2) {
        s.x = tgt.x; s.y = tgt.y;
        if (s.aoe) this.explode(s);
        else {
          this.damageEnemy(tgt, s.damage, 'tower');
          this.burst('contact', s.x, s.y, 3, PAL.white, 80);
          kit.audio.sfx('hit', { volume: 0.2, rate: 1 + Math.random() * 0.3 });
        }
        s.active = false;
      } else {
        s.x += dx / dist * stepLen;
        s.y += dy / dist * stepLen;
        s.spin = Math.atan2(dy, dx);
        if (s.aoe && Math.random() < 0.5) {
          this.spawnParticle('trail', s.x, s.y, 0, 0, 0.24, 3, s.color, { drag: 1 });
        }
      }
    }
  };

  VergeScene.prototype.explode = function (s) {
    var i, e;
    this.addFx(2, s.x, s.y, s.radius, 0.4, s.color);
    this.burst('burst', s.x, s.y, 9, s.color, 150, { grav: 60 });
    kit.juice.shake(3, 110);
    kit.audio.sfx('hit', { volume: 0.45, rate: 0.7 });
    for (i = 0; i < this.activeEnemies.length; i++) {
      e = this.activeEnemies[i];
      if (Math.hypot(e.x - s.x, e.y - s.y) <= s.radius) this.damageEnemy(e, s.damage, 'tower');
    }
  };

  /* --------------------------------------------- field operator "Vane" */
  VergeScene.prototype.updateOperator = function (dt) {
    var r = this.run, op = this.op, i, d, dist;
    var ix = 0, iy = 0;
    if (kit.input.keyDown('KeyD') || kit.input.keyDown('ArrowRight')) ix += 1;
    if (kit.input.keyDown('KeyA') || kit.input.keyDown('ArrowLeft')) ix -= 1;
    if (kit.input.keyDown('KeyS') || kit.input.keyDown('ArrowDown')) iy += 1;
    if (kit.input.keyDown('KeyW') || kit.input.keyDown('ArrowUp')) iy -= 1;
    if (this.stick.active) { ix += this.stick.x; iy += this.stick.y; }
    var mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }

    var speed = 168;
    op.x = clamp(op.x + ix * speed * dt, BOARD.x + 18, BOARD.x + BOARD.w - 18);
    op.y = clamp(op.y + iy * speed * dt, BOARD.y + 18, BOARD.y + BOARD.h - 18);
    op.moving = mag;
    if (mag > 0.08) { op.facing = Math.atan2(iy, ix); op.step += dt * 9 * mag; }
    op.bob += dt * (mag > 0.08 ? 7 : 2.4);

    if (op.commandT > 0) op.commandT -= dt;
    op.fire -= dt;
    if (op.fire <= 0) {
      var target = this.nearestEnemy(op.x, op.y, 186, 0);
      if (target) {
        this.fireShot(op.x, op.y, target, 16, 460, PAL.teal, 0, 0);
        op.facing = Math.atan2(target.y - op.y, target.x - op.x);
        op.fire = 0.3;
        op.state = 'fire'; op.stateT = 0.18;
        this.spawnParticle('contact', op.x + Math.cos(op.facing) * 14, op.y + Math.sin(op.facing) * 14,
          Math.cos(op.facing) * 40, Math.sin(op.facing) * 40, 0.14, 2, PAL.teal, { drag: 3 });
      } else op.fire = 0.1;
    }
    if (op.stateT > 0) op.stateT -= dt;
    else if (op.commandT > 0) op.state = 'command';
    else op.state = mag > 0.08 ? 'move' : 'idle';
    if (r.coreHp <= 0) op.state = 'down';

    for (i = 0; i < this.drops.length; i++) {
      d = this.drops[i];
      if (!d.active) continue;
      d.life -= dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.vx *= 1 - Math.min(1, dt * 4); d.vy *= 1 - Math.min(1, dt * 4);
      d.spin += dt * 4;
      dist = Math.hypot(d.x - op.x, d.y - op.y);
      if (dist < 74) {
        var pull = (1 - dist / 74) * 320;
        d.x += (op.x - d.x) / dist * pull * dt;
        d.y += (op.y - d.y) / dist * pull * dt;
      }
      if (dist < 20) {
        d.active = false;
        r.scrap = Math.min(999, r.scrap + 1);
        r.score += 2;
        this.spawnParticle('build', d.x, d.y, 0, -40, 0.3, 3, PAL.amber, { drag: 1.4 });
        this.advanceCoach(1);
      } else if (d.life <= 0) d.active = false;
    }
  };

  VergeScene.prototype.updateParticles = function (dt) {
    var n, arr, i, p;
    for (n = 0; n < PARTICLE_SYSTEMS.length; n++) {
      arr = this.particles[PARTICLE_SYSTEMS[n]];
      for (i = 0; i < arr.length; i++) {
        p = arr[i];
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += p.grav * dt;
        var k = 1 - Math.min(1, p.drag * dt);
        p.vx *= k; p.vy *= k;
        p.rot += p.spin * dt;
      }
    }
    for (i = 0; i < this.fx.length; i++) {
      if (!this.fx[i].active) continue;
      this.fx[i].life -= dt;
      if (this.fx[i].life <= 0) this.fx[i].active = false;
    }
  };

  /* Ambient signature motion: one restrained system per biome. */
  VergeScene.prototype.updateAmbient = function (dt) {
    if (!kit.juice.enabled) return;
    this.ambientT = (this.ambientT || 0) - dt;
    if (this.ambientT > 0) return;
    this.ambientT = 0.22;
    var b = this.map.biome, x = BOARD.x + Math.random() * BOARD.w, y = BOARD.y + Math.random() * BOARD.h;
    if (b === 'asphalt') this.spawnParticle('ember', x, y, 6, -14, 1.5, 2, 0x6b7280, { drag: 0.4 });
    else if (b === 'water') this.spawnParticle('ember', x, y, 0, -10, 1.6, 2.4, 0x43c7f4, { drag: 0.5 });
    else if (b === 'interior') this.spawnParticle('ember', x, y, 0, -18, 1.4, 2, 0x6de0c1, { drag: 0.6 });
    else this.spawnParticle('ember', x, y, 0, -26, 1.3, 2.6, 0xcda1ff, { drag: 0.5 });
  };

  /* ------------------------------------------------------- sim stepping */
  VergeScene.prototype.stepSim = function () {
    var dt = STEP, r = this.run, i, id;
    this.simTime += dt;
    if (!r || r.phase === 'won' || r.phase === 'lost') { this.stepTransients(dt); return; }
    r.elapsed += dt;
    if (r.flash > 0) r.flash = Math.max(0, r.flash - dt * 2.2);

    for (i = 0; i < C.ABILITIES.length; i++) {
      id = C.ABILITIES[i].id;
      if (r.abilityCd[id] > 0) r.abilityCd[id] = Math.max(0, r.abilityCd[id] - dt);
    }
    if (r.barricade.t > 0) {
      r.barricade.t -= dt;
      if (r.barricade.t <= 0) r.barricade.lane = -1;
    }

    if (r.phase === 'prep') {
      r.prep -= dt;
      if (r.prep <= 0) this.startWave();
    } else if (r.phase === 'active') {
      if (r.cursor < r.queue.length) {
        r.spawnTimer -= dt;
        while (r.cursor < r.queue.length && r.spawnTimer <= 0) {
          var q = r.queue[r.cursor];
          this.spawnEnemy(q.type, q.lane, q.boss);
          r.spawnTimer += q.delay;
          r.cursor += 1;
        }
      }
    }

    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateShots(dt);
    this.updateOperator(dt);
    this.updateParticles(dt);
    this.updateAmbient(dt);
    this.stepTransients(dt);

    if (r.phase === 'active' && r.cursor >= r.queue.length && this.activeEnemies.length === 0) this.finishWave();
    if (r.phase === 'active' && !r.bossWarned && r.def.boss && r.cursor >= r.queue.length - 1) r.bossWarned = true;
  };

  /* ============================================================= render */
  VergeScene.prototype.drawDecals = function () {
    var g = this.decalGfx, r = this.run, i, t, sp, pad, def, pos, ok;
    g.clear();
    if (!r) return;
    var t2 = this.animTime;

    /* fork markers: the barricade targets, and the branch the horde prefers */
    for (i = 0; i < this.map.lanes.length; i++) {
      sp = C.splitPoint(this.map.lanes[i]);
      var closed = (r.barricade.lane === i && r.barricade.t > 0);
      ring(g, sp.x, sp.y, 17, closed ? PAL.amber : PAL.slate, closed ? 0.95 : 0.35, 2, 8);
      if (closed) {
        dashRing(g, sp.x, sp.y, 25, PAL.amber, 0.8, 3, t2 * 1.4);
        var b0 = this.map.lanes[i].branches[0][0];
        g.lineStyle(4, PAL.amber, 0.55);
        g.beginPath(); g.moveTo(sp.x, sp.y); g.lineTo(b0[0], b0[1]); g.strokePath();
        g.lineStyle(5, PAL.coral, 0.75);
        g.beginPath();
        g.moveTo((sp.x + b0[0]) / 2 - 9, (sp.y + b0[1]) / 2 - 9);
        g.lineTo((sp.x + b0[0]) / 2 + 9, (sp.y + b0[1]) / 2 + 9);
        g.moveTo((sp.x + b0[0]) / 2 + 9, (sp.y + b0[1]) / 2 - 9);
        g.lineTo((sp.x + b0[0]) / 2 - 9, (sp.y + b0[1]) / 2 + 9);
        g.strokePath();
      }
    }

    /* live hazard perimeter pulse keeps the danger edge crisp */
    for (i = 0; i < this.map.hazards.length; i++) {
      var h = this.map.hazards[i], hd = C.hazardDef(h.type);
      var pulse = 0.28 + 0.16 * Math.sin(t2 * 1.6 + i);
      ring(g, h.x, h.y, h.r - 3, hd.edge, pulse, 2, 20);
    }

    /* built tower ranges only while their socket is selected */
    for (i = 0; i < this.towers.length; i++) {
      t = this.towers[i];
      if (!t.active || t.pad !== this.selectedPad) continue;
      var rr = this.towerRange(t);
      ring(g, t.x, t.y, rr, C.towerDef(t.type).color, 0.5, 2, 26);
      disc(g, t.x, t.y, rr, C.towerDef(t.type).color, 0.05, 20);
      if (C.towerDef(t.type).minRange) ring(g, t.x, t.y, C.towerStats(t.type, t.level, r.fac).minRange, PAL.coral, 0.4, 2, 16);
    }

    /* placement ghost: range, cost validity, and the lane it will cover */
    if (this.selectedPad >= 0 && !this.towerAtPad(this.selectedPad)) {
      pos = this.map.pads[this.selectedPad];
      def = C.towerDef(this.towerType);
      var stats = C.towerStats(def.id, 0, r.fac);
      var gr = stats.range * r.mod.range;
      var hz = this.hazardAt(pos[0], pos[1]);
      if (hz) gr *= C.hazardDef(hz.type).range;
      ok = r.scrap >= def.cost && C.unlockedTowers(C.totalMedals(profile)).indexOf(def.id) >= 0;
      var gc = ok ? def.color : PAL.coral;
      disc(g, pos[0], pos[1], gr, gc, 0.07, 20);
      dashRing(g, pos[0], pos[1], gr, gc, 0.8, 2, t2 * 0.6);
      ring(g, pos[0], pos[1], 24 + Math.sin(t2 * 4) * 1.6, gc, 0.9, 3, 10);
      this.drawTowerGlyph(g, def.id, pos[0], pos[1], 0, -Math.PI / 2, gc, 0.45, 0);
      this.highlightLanes(g, pos[0], pos[1], gr, gc);
    }

    /* targeted ability reticle */
    if (this.pendingAbility) {
      var ad = C.abilityDef(this.pendingAbility);
      var px = this.hoverX, py = this.hoverY;
      if (px != null) {
        var rad = ad.radius || 44;
        dashRing(g, px, py, rad, PAL.amber, 0.9, 3, -t2);
        disc(g, px, py, rad, PAL.amber, 0.08, 18);
        g.lineStyle(2, PAL.amber, 0.8);
        g.beginPath(); g.moveTo(px - rad - 10, py); g.lineTo(px - rad + 6, py);
        g.moveTo(px + rad - 6, py); g.lineTo(px + rad + 10, py);
        g.moveTo(px, py - rad - 10); g.lineTo(px, py - rad + 6);
        g.moveTo(px, py + rad - 6); g.lineTo(px, py + rad + 10);
        g.strokePath();
      }
    }

    /* operator route marker to the selected socket */
    if (this.selectedPad >= 0 && this.op) {
      pos = this.map.pads[this.selectedPad];
      g.lineStyle(2, PAL.cyan, 0.32);
      g.beginPath(); g.moveTo(this.op.x, this.op.y); g.lineTo(pos[0], pos[1]); g.strokePath();
    }
  };

  /* Lane preview: which approach segments the ghost actually covers. */
  VergeScene.prototype.highlightLanes = function (g, x, y, range, color) {
    var i, b, pts, j, covered;
    for (i = 0; i < this.map.lanes.length; i++) {
      for (b = 0; b < 2; b++) {
        pts = this.paths[i][b];
        for (j = 0; j < pts.length - 1; j++) {
          if (b === 1 && j < this.splitIdx[i]) continue;
          covered = pointSegDist(x, y, pts[j].x, pts[j].y, pts[j + 1].x, pts[j + 1].y) <= range;
          if (!covered) continue;
          g.lineStyle(7, color, 0.30);
          g.beginPath(); g.moveTo(pts[j].x, pts[j].y); g.lineTo(pts[j + 1].x, pts[j + 1].y); g.strokePath();
        }
      }
    }
  };

  VergeScene.prototype.drawTowerGlyph = function (g, type, x, y, level, angle, color, alpha, recoil) {
    var a = alpha == null ? 1 : alpha;
    var back = -(recoil || 0) * 3;
    var cx = x + Math.cos(angle) * back, cy = y + Math.sin(angle) * back;
    disc(g, x, y + 3, 17, 0x0a1320, 0.55 * a, 10);
    disc(g, x, y, 15, 0x1d2c3c, a, 10);
    ring(g, x, y, 15, color, 0.9 * a, 2, 10);
    if (type === 'rifle') {
      g.fillStyle(color, a);
      g.save(); g.translateCanvas(cx, cy); g.rotateCanvas(angle);
      g.fillRect(2, -3, 22, 6); g.fillRect(-6, -8, 14, 16);
      g.restore();
    } else if (type === 'mortar') {
      g.save(); g.translateCanvas(cx, cy); g.rotateCanvas(angle);
      g.fillStyle(color, a); g.fillRect(-2, -6, 18, 12);
      g.fillStyle(0x2a1f3c, a); g.fillRect(-9, -9, 12, 18);
      g.restore();
      disc(g, x, y, 6, color, 0.55 * a, 8);
    } else if (type === 'tesla') {
      g.lineStyle(3, color, a);
      g.beginPath();
      for (var i = 0; i < 3; i++) {
        var aa = angle + i * 2.1;
        g.moveTo(x, y); g.lineTo(x + Math.cos(aa) * 15, y + Math.sin(aa) * 15);
      }
      g.strokePath();
      disc(g, x, y - 4, 6, color, 0.85 * a, 8);
    } else if (type === 'flame') {
      g.save(); g.translateCanvas(cx, cy); g.rotateCanvas(angle);
      g.fillStyle(color, a);
      g.beginPath(); g.moveTo(4, -5); g.lineTo(22, -9); g.lineTo(22, 9); g.lineTo(4, 5); g.closePath(); g.fillPath();
      g.fillStyle(0x3a2320, a); g.fillRect(-10, -7, 13, 14);
      g.restore();
    } else {
      g.fillStyle(color, a);
      g.fillRect(x - 3, y - 11, 6, 22);
      g.fillRect(x - 11, y - 3, 22, 6);
    }
    /* level pips read at a glance without a text label */
    for (var k = 0; k < level; k++) {
      disc(g, x - 8 + k * 8, y + 20, 3, PAL.teal, 0.95 * a, 6);
    }
  };

  VergeScene.prototype.drawUnits = function () {
    var g = this.unitGfx, r = this.run, i, t, e, def, d;
    g.clear();
    if (!r) return;
    var t2 = this.animTime;

    /* core: structure silhouette plus an integrity arc */
    var cx = this.map.core[0], cy = this.map.core[1];
    var frac = clamp(r.coreHp / r.coreMax, 0, 1);
    disc(g, cx, cy + 4, 34, 0x0a1320, 0.6, 10);
    disc(g, cx, cy, 30, 0x16324a, 1, 8);
    ring(g, cx, cy, 30, frac > 0.35 ? PAL.cyan : PAL.coral, 0.95, 3, 12);
    disc(g, cx, cy, 14 + Math.sin(t2 * 2) * 1.4, frac > 0.35 ? PAL.teal : PAL.coral, 0.85, 8);
    g.lineStyle(5, frac > 0.6 ? PAL.teal : (frac > 0.3 ? PAL.amber : PAL.coral), 0.95);
    g.beginPath();
    var segs = 22;
    for (i = 0; i <= segs * frac; i++) {
      var a = -Math.PI / 2 + (i / segs) * TAU;
      var px = cx + Math.cos(a) * 38, py = cy + Math.sin(a) * 38;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokePath();

    /* towers */
    for (i = 0; i < this.towers.length; i++) {
      t = this.towers[i];
      if (!t.active) continue;
      var col = C.towerDef(t.type).color;
      if (t.buildT > 0) {
        var bt = 1 - t.buildT / 0.6;
        ring(g, t.x, t.y, 26 - bt * 8, PAL.white, 0.7 * (1 - bt), 3, 10);
      }
      if (t.buff < 1) ring(g, t.x, t.y, 21, PAL.teal, 0.30 + 0.12 * Math.sin(t2 * 3), 2, 10);
      this.drawTowerGlyph(g, t.type, t.x, t.y, t.level, t.angle, col, 1, t.recoil);
      if (t.flash > 0) disc(g, t.x + Math.cos(t.angle) * 20, t.y + Math.sin(t.angle) * 20, 6 * (t.flash / 0.14), PAL.white, 0.85, 8);
      if (t.pad === this.selectedPad) ring(g, t.x, t.y, 24, PAL.white, 0.9, 2, 12);
    }

    /* scrap drops */
    for (i = 0; i < this.drops.length; i++) {
      d = this.drops[i];
      if (!d.active) continue;
      var fade = d.life < 3 ? d.life / 3 : 1;
      tri(g, d.x, d.y, 6, d.spin, PAL.amber, 0.95 * fade);
      disc(g, d.x, d.y, 2, PAL.white, 0.8 * fade, 6);
    }

    /* infected: bone bodies, coral wounds, faction-free until identified */
    for (i = 0; i < this.activeEnemies.length; i++) {
      e = this.activeEnemies[i];
      def = e.def;
      var bob = Math.sin(e.step * 2.2) * (e.stun > 0 ? 0 : 1.6);
      var lean = Math.sin(e.step * 2.2) * 0.18;
      var ex = e.x, ey = e.y + bob;
      var alpha = e.inv ? 0.35 : 1;
      disc(g, ex, e.y + e.radius * 0.75, e.radius * 0.9, 0x060b12, 0.4 * alpha, 8);
      /* legs */
      g.lineStyle(Math.max(2, e.radius * 0.28), 0x8d8875, 0.85 * alpha);
      g.beginPath();
      g.moveTo(ex - e.radius * 0.35, ey + e.radius * 0.3);
      g.lineTo(ex - e.radius * 0.35 + Math.sin(e.step * 3) * e.radius * 0.5, ey + e.radius * 1.05);
      g.moveTo(ex + e.radius * 0.35, ey + e.radius * 0.3);
      g.lineTo(ex + e.radius * 0.35 - Math.sin(e.step * 3) * e.radius * 0.5, ey + e.radius * 1.05);
      g.strokePath();
      /* body mass */
      disc(g, ex, ey, e.radius, PAL.body, alpha, e.boss ? 12 : 9);
      /* coral wound accents plus the type notch */
      disc(g, ex + e.radius * 0.35, ey - e.radius * 0.25, e.radius * 0.26, 0xb72e4d, 0.75 * alpha, 6);
      g.fillStyle(def.accent, alpha);
      g.fillRect(ex - e.radius * 0.55, ey - e.radius - 3, e.radius * 1.1, 4);
      if (def.tier === 'elite' || e.boss) {
        g.save(); g.translateCanvas(ex, ey); g.rotateCanvas(lean);
        g.fillStyle(def.accent, 0.9 * alpha);
        g.fillRect(e.radius * 0.5, -e.radius * 0.9, e.radius * 0.55, e.radius * 1.1);
        g.restore();
      }
      if (e.boss) {
        ring(g, ex, ey, e.radius + 7, def.accent, 0.85, 3, 14);
        dashRing(g, ex, ey, e.radius + 14, def.accent, 0.5, 2, t2);
      }
      if (e.stun > 0) ring(g, ex, ey - e.radius - 8, 5, PAL.cyan, 0.8, 2, 8);
      if (e.hit > 0) disc(g, ex, ey, e.radius + 1, PAL.white, e.hit / 0.11 * 0.85, 9);
      if (e.burnT > 0) ring(g, ex, ey, e.radius + 3, PAL.amber, 0.5, 2, 9);
      /* health bar below the silhouette, hidden at full health */
      if (e.hp < e.maxHp) {
        var w = e.radius * 2.2, hf = clamp(e.hp / e.maxHp, 0, 1);
        g.fillStyle(0x060b12, 0.75); g.fillRect(ex - w / 2, ey + e.radius + 4, w, 3);
        g.fillStyle(hf > 0.5 ? PAL.teal : (hf > 0.25 ? PAL.amber : PAL.coral), 0.95);
        g.fillRect(ex - w / 2, ey + e.radius + 4, w * hf, 3);
      }
    }

    this.drawOperator(g);
  };

  /* Player proxy: idle, move, command, fire and down states. */
  VergeScene.prototype.drawOperator = function (g) {
    var op = this.op;
    if (!op) return;
    var t2 = this.animTime;
    var bob = op.state === 'move' ? Math.sin(op.step * 2) * 2.2 : Math.sin(op.bob) * 1.1;
    var x = op.x, y = op.y + bob;
    var down = op.state === 'down';
    var lean = op.state === 'move' ? Math.sin(op.step * 2) * 0.12 : 0;

    disc(g, op.x, op.y + 12, 13, 0x060b12, 0.45, 10);
    ring(g, op.x, op.y + 11, 15, PAL.cyan, down ? 0.25 : 0.75, 2, 12);
    if (op.state === 'command') dashRing(g, op.x, op.y + 11, 22, PAL.cyan, 0.85, 3, t2 * 2.4);

    if (down) {
      g.save(); g.translateCanvas(x, y + 6); g.rotateCanvas(1.2);
      g.fillStyle(0x3f5566, 1); g.fillRect(-7, -12, 14, 24);
      g.restore();
      disc(g, x + 12, y + 8, 6, 0xe8dcc0, 0.9, 8);
      return;
    }

    /* legs */
    g.lineStyle(4, 0x2c4358, 1);
    g.beginPath();
    g.moveTo(x - 4, y + 6); g.lineTo(x - 4 + Math.sin(op.step * 2) * 5 * op.moving, y + 14);
    g.moveTo(x + 4, y + 6); g.lineTo(x + 4 - Math.sin(op.step * 2) * 5 * op.moving, y + 14);
    g.strokePath();
    /* torso with the radio pack always visible during placement */
    g.save(); g.translateCanvas(x, y); g.rotateCanvas(lean);
    g.fillStyle(0x33607f, 1); g.fillRect(-7, -9, 14, 17);
    g.fillStyle(PAL.cyan, 0.9); g.fillRect(-7, -9, 14, 3);
    g.fillStyle(0x22384a, 1); g.fillRect(-11, -7, 5, 12);
    g.fillStyle(PAL.teal, 0.95); g.fillRect(-11, -7, 5, 3);
    g.restore();
    /* head */
    disc(g, x, y - 14, 6, 0xe8dcc0, 1, 8);
    g.fillStyle(0x1b2a38, 1); g.fillRect(x - 6, y - 17, 12, 3);
    /* weapon arm points at the current facing */
    g.save(); g.translateCanvas(x, y - 2); g.rotateCanvas(op.facing);
    g.fillStyle(0x9fb4c4, 1); g.fillRect(4, -2, 15, 4);
    if (op.state === 'fire') { g.fillStyle(PAL.teal, 0.9); g.fillRect(18, -3, 7, 6); }
    g.restore();
    /* antenna blip so the proxy reads as the commander */
    g.lineStyle(2, PAL.teal, 0.8);
    g.beginPath(); g.moveTo(x - 9, y - 8); g.lineTo(x - 12, y - 20); g.strokePath();
    disc(g, x - 12, y - 21, 2.4 + Math.sin(t2 * 5) * 0.7, PAL.teal, 0.95, 6);
  };

  VergeScene.prototype.drawFx = function () {
    var g = this.fxGfx, r = this.run, i, n, arr, p, s, f;
    g.clear();
    if (!r) return;
    for (i = 0; i < this.shots.length; i++) {
      s = this.shots[i];
      if (!s.active) continue;
      if (s.aoe) {
        disc(g, s.x, s.y, 5, s.color, 0.95, 8);
        ring(g, s.x, s.y, 8, s.color, 0.4, 2, 8);
      } else {
        g.lineStyle(3, s.color, 0.95);
        g.beginPath();
        g.moveTo(s.x, s.y);
        g.lineTo(s.x - Math.cos(s.spin) * 11, s.y - Math.sin(s.spin) * 11);
        g.strokePath();
      }
    }
    for (n = 0; n < PARTICLE_SYSTEMS.length; n++) {
      arr = this.particles[PARTICLE_SYSTEMS[n]];
      for (i = 0; i < arr.length; i++) {
        p = arr[i];
        if (!p.active) continue;
        var k = p.life / p.max;
        var sz = p.size * (0.35 + k * 0.75);
        g.fillStyle(p.color, clamp(k * 1.1, 0, 1));
        g.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
    }
    for (i = 0; i < this.fx.length; i++) {
      f = this.fx[i];
      if (!f.active) continue;
      var kf = f.life / f.max;
      if (f.kind === 0) {
        g.lineStyle(2 + kf * 2, f.color, kf);
        g.beginPath(); g.moveTo(f.x, f.y);
        var mx = (f.x + f.x2) / 2 + (Math.random() - 0.5) * 12;
        var my = (f.y + f.y2) / 2 + (Math.random() - 0.5) * 12;
        g.lineTo(mx, my); g.lineTo(f.x2, f.y2); g.strokePath();
      } else if (f.kind === 1) {
        ring(g, f.x, f.y, f.r * (1.25 - kf * 0.45), f.color, kf * 0.85, 3, 18);
      } else if (f.kind === 2) {
        disc(g, f.x, f.y, f.r * (1 - kf * 0.15), f.color, kf * 0.35, 16);
        ring(g, f.x, f.y, f.r * (1.05 - kf * 0.2), f.color, kf, 3, 20);
      } else if (f.kind === 3) {
        ring(g, f.x, f.y, f.r * (1 - kf), PAL.cyan, kf * 0.7, 4, 26);
      }
    }
    if (r.flash > 0) {
      var fa = r.flash * (kit.juice.enabled ? 0.5 : 0.2);
      g.fillStyle(PAL.coral, fa);
      g.fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);
    }
  };

  VergeScene.prototype.drawHud = function () {
    var g = this.hudGfx, r = this.run, u = this.ui, i, x, y, def, ok, t2 = this.animTime;
    g.clear();
    if (!r) return;
    var medals = C.totalMedals(profile);
    var unlockedT = C.unlockedTowers(medals), unlockedA = C.unlockedAbilities(medals);

    /* --- top strip meters --- */
    var frac = clamp(r.coreHp / r.coreMax, 0, 1);
    tri(g, 38, 33, 13, -Math.PI / 2, frac > 0.35 ? PAL.cyan : PAL.coral, 1);
    box(g, 58, 24, 194, 18, 0x0a1622, 1, PAL.line, 2);
    box(g, 60, 26, 190 * frac, 14, frac > 0.6 ? PAL.teal : (frac > 0.3 ? PAL.amber : PAL.coral), 1);
    tri(g, 344, 33, 10, -Math.PI / 2, PAL.amber, 1);
    box(g, 476, 24, 16, 16, PAL.coral, 0.9);
    disc(g, 624, 33, 8, PAL.teal, 0.95, 8);
    setTextIfChanged(u.core, Math.round(frac * 100) + '%');
    setColorIfChanged(u.core, frac > 0.6 ? CSS.text : (frac > 0.3 ? CSS.amber : CSS.coral));
    setTextIfChanged(u.scrap, String(r.scrap));
    setTextIfChanged(u.wave, r.endless ? String(r.wave) : (r.wave + ' / ' + r.def.waves));
    setTextIfChanged(u.medal, medals + '/' + C.MEDAL_TOTAL);
    setTextIfChanged(u.mod, r.mod.short || '');
    setVis(u.mod, !!r.mod.short);
    setTextIfChanged(u.speed, r.speed + 'x');
    setColorIfChanged(u.speed, r.speed > 1 ? CSS.cyan : CSS.muted);
    setTextIfChanged(u.score, String(r.score));

    /* --- coach strip: one thin fading line, top edge only --- */
    var coachOn = this.coachIndex >= 0 && this.coachTimer > 0;
    if (coachOn) {
      var ca = clamp(this.coachTimer > 3 ? (4.2 - this.coachTimer) * 4 : this.coachTimer / 1.4, 0, 1);
      box(g, BOARD.x, BOARD.y, BOARD.w, 44, PAL.ink, 0.62 * ca);
      box(g, BOARD.x, BOARD.y + 42, BOARD.w, 2, PAL.cyan, 0.55 * ca);
      setTextIfChanged(u.coach, C.TUTORIAL[this.coachIndex]);
      u.coach.setAlpha(ca);
    } else if (u.coach.alpha !== 0) u.coach.setAlpha(0);

    /* --- one corner chip at a time --- */
    if (this.toast && !coachOn) {
      var ta = clamp(this.toast.t > 0.75 ? (1 - this.toast.t) * 4 : this.toast.t / 0.4, 0, 1);
      setTextIfChanged(u.toast, this.toast.text);
      setColorIfChanged(u.toast, this.toast.color);
      u.toast.setAlpha(ta);
      var tw = u.toast.width + 24;
      box(g, BOARD.x + BOARD.w - 8 - tw, BOARD.y + 8, tw, 30, PAL.ink, 0.72 * ta, PAL.line, 2);
    } else if (u.toast.alpha !== 0) u.toast.setAlpha(0);

    /* --- centre banner only at run boundaries --- */
    if (this.banner) {
      var k = this.banner.t / this.banner.max;
      var ba = clamp(k > 0.82 ? (1 - k) * 5.5 : k / 0.3, 0, 1);
      var over = k > 0.82 ? 1 + (k - 0.82) * 0.9 : 1;
      var bw = BOARD.w * 0.6, bx = BOARD.x + (BOARD.w - bw) / 2;
      box(g, bx, BOARD.y + 200, bw, 108, PAL.ink, 0.82 * ba, PAL.line, 2);
      box(g, bx, BOARD.y + 200, bw, 5, PAL.cyan, ba);
      setTextIfChanged(u.bannerTitle, this.banner.title);
      setTextIfChanged(u.bannerSub, this.banner.sub);
      u.bannerTitle.setAlpha(ba); u.bannerSub.setAlpha(ba);
      u.bannerTitle.setScale(kit.juice.enabled ? over : 1);
    } else if (u.bannerTitle.alpha !== 0) { u.bannerTitle.setAlpha(0); u.bannerSub.setAlpha(0); }

    /* --- command rail --- */
    for (i = 0; i < C.TOWER_KEYS.length; i++) {
      def = C.TOWERS[C.TOWER_KEYS[i]];
      x = RAIL.x + 6 + i * 88; y = RAIL.y + 6;
      var locked = unlockedT.indexOf(def.id) < 0;
      var afford = r.scrap >= def.cost;
      var sel = this.towerType === def.id && !locked;
      box(g, x, y, 84, 90, sel ? PAL.panel2 : PAL.panel, 0.95, sel ? PAL.cyan : PAL.line, sel ? 3 : 2);
      box(g, x, y, 84, 4, locked ? PAL.slate : def.color, locked ? 0.4 : 1);
      if (!locked) this.drawTowerGlyph(g, def.id, x + 42, y + 30, 0, -Math.PI / 2, def.color, afford ? 1 : 0.45, 0);
      else {
        g.lineStyle(3, PAL.slate, 0.7);
        g.strokeRect(x + 32, y + 24, 20, 16);
        g.beginPath(); g.moveTo(x + 37, y + 24); g.lineTo(x + 37, y + 18);
        g.lineTo(x + 47, y + 18); g.lineTo(x + 47, y + 24); g.strokePath();
      }
      setTextIfChanged(u.chipName[i], locked ? 'LOCK' : def.short);
      setColorIfChanged(u.chipName[i], locked ? CSS.dim : (sel ? CSS.text : CSS.muted));
      setTextIfChanged(u.chipCost[i], locked ? (def.unlock + ' MED') : (def.cost + '  ' + def.key));
      setColorIfChanged(u.chipCost[i], locked ? CSS.dim : (afford ? CSS.amber : CSS.coral));
    }
    for (i = 0; i < C.ABILITIES.length; i++) {
      def = C.ABILITIES[i];
      x = RAIL.x + 458 + i * 88; y = RAIL.y + 6;
      var alocked = unlockedA.indexOf(def.id) < 0;
      var cd = r.abilityCd[def.id];
      var ready = !alocked && cd <= 0;
      var pend = this.pendingAbility === def.id;
      box(g, x, y, 84, 90, pend ? PAL.panel2 : PAL.panel, 0.95, pend ? PAL.amber : PAL.line, pend ? 3 : 2);
      box(g, x, y, 84, 4, alocked ? PAL.slate : PAL.amber, alocked ? 0.4 : 1);
      this.drawAbilityGlyph(g, def.id, x + 42, y + 32, ready ? PAL.amber : PAL.slate, alocked ? 0.35 : (ready ? 1 : 0.5));
      if (!alocked && cd > 0) {
        var cf = 1 - cd / this.abilityCooldown(def.id);
        box(g, x + 8, y + 52, 68, 6, 0x0a1622, 1);
        box(g, x + 8, y + 52, 68 * cf, 6, PAL.amber, 0.9);
      }
      setTextIfChanged(u.abilName[i], alocked ? 'LOCK' : def.name.slice(0, 5));
      setColorIfChanged(u.abilName[i], alocked ? CSS.dim : (ready ? CSS.text : CSS.muted));
      setTextIfChanged(u.abilCd[i], alocked ? (def.unlock + ' MED') : (cd > 0 ? Math.ceil(cd) + 's' : def.key));
      setColorIfChanged(u.abilCd[i], alocked ? CSS.dim : (ready ? CSS.amber : CSS.dim));
    }
    var canCall = r.phase === 'prep';
    box(g, RAIL.x + 726, RAIL.y + 6, 68, 90, canCall ? PAL.blue : PAL.panel, 0.95, canCall ? PAL.teal : PAL.line, 2);
    box(g, RAIL.x + 802, RAIL.y + 6, 68, 90, PAL.panel, 0.95, PAL.line, 2);
    setTextIfChanged(u.callText, canCall ? 'CALL' : 'LIVE');
    setColorIfChanged(u.callText, canCall ? CSS.text : CSS.dim);
    setTextIfChanged(u.callSub, canCall ? Math.ceil(r.prep) + 's' : 'SPACE');
    setTextIfChanged(u.speedText, r.speed + 'x');
    setTextIfChanged(u.speedSub, 'F');

    /* --- panel: pressure bars sit beside their lane rows --- */
    for (i = 0; i < 4; i++) {
      if (i >= this.map.lanes.length) continue;
      var pressure = clamp(this.laneCounts[i] / 12, 0, 1);
      var dmg = clamp(this.laneDamage[i] / (r.coreMax * 0.5), 0, 1);
      box(g, PANEL.x + 168, 491 + i * 22, 84, 6, 0x0a1622, 1);
      box(g, PANEL.x + 168, 491 + i * 22, 84 * pressure, 6, pressure > 0.6 ? PAL.coral : PAL.cyan, 0.95);
      box(g, PANEL.x + 260, 491 + i * 22, 76, 6, 0x0a1622, 1);
      box(g, PANEL.x + 260, 491 + i * 22, 76 * dmg, 6, PAL.wine, 0.95);
    }
    /* panel buttons */
    box(g, PANEL.x + 12, 640, 164, 48, PAL.panel2, 0.95, PAL.line, 2);
    box(g, PANEL.x + 180, 640, 160, 48, PAL.panel2, 0.95, PAL.line, 2);
    /* build / sell action row */
    var padSel = this.selectedPad >= 0;
    if (padSel) {
      var cost = this.buildCost(this.selectedPad);
      ok = cost >= 0 && r.scrap >= cost;
      box(g, PANEL.x + 12, 412, 200, 40, ok ? PAL.blue : PAL.panel, 0.95, ok ? PAL.cyan : PAL.line, 2);
      if (this.towerAtPad(this.selectedPad)) box(g, PANEL.x + 220, 412, 120, 40, PAL.panel, 0.95, PAL.coral, 2);
    }
  };

  VergeScene.prototype.drawAbilityGlyph = function (g, id, x, y, color, alpha) {
    if (id === 'airstrike') {
      g.fillStyle(color, alpha);
      g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + 11, y + 8); g.lineTo(x, y + 2); g.lineTo(x - 11, y + 8); g.closePath(); g.fillPath();
      ring(g, x, y + 8, 9, color, alpha * 0.6, 2, 10);
    } else if (id === 'barricade') {
      g.fillStyle(color, alpha);
      g.fillRect(x - 13, y - 8, 26, 6);
      g.fillRect(x - 13, y + 1, 26, 6);
      g.fillStyle(color, alpha * 0.5);
      g.fillRect(x - 4, y - 12, 8, 22);
    } else {
      ring(g, x, y, 11, color, alpha, 2, 12);
      g.lineStyle(3, color, alpha);
      g.beginPath();
      g.moveTo(x - 5, y - 8); g.lineTo(x + 2, y - 1); g.lineTo(x - 2, y + 1); g.lineTo(x + 5, y + 9);
      g.strokePath();
    }
  };

  VergeScene.prototype.drawPanel = function () {
    var r = this.run, u = this.ui, i, def, stats;
    if (!r) return;
    setTextIfChanged(u.pTitle, r.endless ? 'ENDLESS SIEGE' : r.def.name);
    setTextIfChanged(u.pSector, r.endless ? '∞' : ('S' + r.def.sector));

    /* wave preview, or the boss bar while one is on the board */
    if (r.boss && r.boss.active) {
      setTextIfChanged(u.pWaveHead, r.boss.def.name);
      setColorIfChanged(u.pWaveHead, CSS.coral);
      setTextIfChanged(u.pWaveClock, Math.max(0, Math.round(r.boss.hp)) + '');
      setTextIfChanged(u.pRows[0], r.boss.def.line);
      if (u.pRows[0].__vpWrap !== 1) { u.pRows[0].setWordWrapWidth(PANEL.w - 60); u.pRows[0].__vpWrap = 1; }
      setColorIfChanged(u.pRows[0], CSS.muted);
      setTextIfChanged(u.pRowCounts[0], '');
      for (i = 1; i < 4; i++) { setTextIfChanged(u.pRows[i], ''); setTextIfChanged(u.pRowCounts[i], ''); }
      var bf = clamp(r.boss.hp / r.boss.maxHp, 0, 1);
      box(this.hudGfx, PANEL.x + 16, 252, PANEL.w - 32, 12, 0x0a1622, 1, PAL.line, 2);
      box(this.hudGfx, PANEL.x + 18, 254, (PANEL.w - 36) * bf, 8, PAL.coral, 1);
    } else {
      var plan = r.phase === 'prep' ? this.nextWaveDef() : r.waveDef;
      setTextIfChanged(u.pWaveHead, r.phase === 'prep' ? 'NEXT WAVE' : 'WAVE ' + r.wave);
      setColorIfChanged(u.pWaveHead, CSS.muted);
      setTextIfChanged(u.pWaveClock, r.phase === 'prep' ? Math.ceil(r.prep) + 's' :
        (r.queue.length - r.cursor) + ' inbound');
      if (u.pRows[0].__vpWrap !== 0) { u.pRows[0].setWordWrapWidth(0); u.pRows[0].__vpWrap = 0; }
      for (i = 0; i < 4; i++) {
        var lab = plan && plan.labels[i];
        if (lab) {
          var ed = lab.boss ? C.bossDef(lab.type) : C.enemyDef(lab.type);
          setTextIfChanged(u.pRows[i], ed.name);
          setColorIfChanged(u.pRows[i], lab.boss ? CSS.coral : CSS.text);
          setTextIfChanged(u.pRowCounts[i], 'x' + lab.count);
        } else { setTextIfChanged(u.pRows[i], ''); setTextIfChanged(u.pRowCounts[i], ''); }
      }
      /* type swatch column */
      for (i = 0; i < 4; i++) {
        var l2 = plan && plan.labels[i];
        if (!l2) continue;
        var e2 = l2.boss ? C.bossDef(l2.type) : C.enemyDef(l2.type);
        disc(this.hudGfx, PANEL.x + 30, 172 + i * 28, 8, PAL.body, 1, 8);
        this.hudGfx.fillStyle(e2.accent, 1);
        this.hudGfx.fillRect(PANEL.x + 24, 164 + i * 28, 12, 3);
      }
    }

    /* selection */
    var pad = this.selectedPad, t = pad >= 0 ? this.towerAtPad(pad) : null;
    if (pad < 0) {
      setTextIfChanged(u.pSelHead, 'SOCKET');
      setTextIfChanged(u.pSelName, 'NONE SELECTED');
      setColorIfChanged(u.pSelName, CSS.muted);
      setTextIfChanged(u.pSelStat, '');
      setTextIfChanged(u.pSelRole, 'Tap a socket on the board to preview a build.');
      setTextIfChanged(u.pAction, '');
      setTextIfChanged(u.pSell, '');
    } else if (t) {
      def = C.towerDef(t.type);
      stats = C.towerStats(t.type, t.level, r.fac);
      setTextIfChanged(u.pSelHead, 'SOCKET ' + (pad + 1));
      setTextIfChanged(u.pSelName, def.name + '  LV' + (t.level + 1));
      setColorIfChanged(u.pSelName, def.css);
      var line = 'RNG ' + Math.round(this.towerRange(t));
      if (stats.damage) line += '   DMG ' + Math.round(stats.damage);
      if (stats.dps) line += '   DPS ' + Math.round(stats.dps);
      if (stats.radius) line += '   BLAST ' + Math.round(stats.radius);
      if (stats.chain) line += '   CHAIN ' + stats.chain;
      if (stats.repair) line += '   REPAIR ' + stats.repair.toFixed(1) + '/s';
      if (t.buff < 1) line += '   +12% RATE';
      setTextIfChanged(u.pSelStat, line);
      setTextIfChanged(u.pSelRole, def.role);
      var uc = t.level >= C.MAX_TOWER_LEVEL ? -1 : C.upgradeCost(t.level);
      setTextIfChanged(u.pAction, uc < 0 ? 'MAX LEVEL' : 'UPGRADE  ' + uc);
      setColorIfChanged(u.pAction, uc < 0 ? CSS.dim : (r.scrap >= uc ? CSS.teal : CSS.coral));
      setTextIfChanged(u.pSell, 'SELL');
    } else {
      def = C.towerDef(this.towerType);
      stats = C.towerStats(def.id, 0, r.fac);
      setTextIfChanged(u.pSelHead, 'SOCKET ' + (pad + 1) + '  EMPTY');
      setTextIfChanged(u.pSelName, def.name);
      setColorIfChanged(u.pSelName, def.css);
      var l3 = 'RNG ' + Math.round(stats.range * r.mod.range) + '   COST ' + def.cost;
      setTextIfChanged(u.pSelStat, l3);
      setTextIfChanged(u.pSelRole, def.role);
      setTextIfChanged(u.pAction, 'BUILD  ' + def.cost);
      setColorIfChanged(u.pAction, r.scrap >= def.cost ? CSS.teal : CSS.coral);
      setTextIfChanged(u.pSell, '');
    }

    setTextIfChanged(u.pLaneHead, 'LANE PRESSURE');
    for (i = 0; i < 4; i++) {
      if (i < this.map.lanes.length) {
        setTextIfChanged(u.pLanes[i], this.map.lanes[i].label);
        setColorIfChanged(u.pLanes[i], this.laneCounts[i] > 7 ? CSS.coral : CSS.text);
        setVis(u.pLanes[i], true);
      } else setVis(u.pLanes[i], false);
    }
    setTextIfChanged(u.pHint, this.pendingAbility ? C.abilityDef(this.pendingAbility).hint : this.map.signature);
    setTextIfChanged(u.pPause, 'PAUSE');
    setTextIfChanged(u.pMenu, 'MENU');
  };

  /* ============================================================== input */
  /* Every pointer claim is registered on a WINDOW listener added after the
   * GGKit init above, and seeds kit.input.pointers itself so a claim made
   * while the kit is paused is never lost. */
  VergeScene.prototype.wireInput = function () {
    var self = this;
    this.hoverX = BOARD.x + BOARD.w / 2;
    this.hoverY = BOARD.y + BOARD.h / 2;
    /* The pause key must work while the scene update loop is stopped, so it
     * lives on its own window listener rather than in the stepped key edge
     * handler. */
    window.addEventListener('keydown', function (e) {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      if (self.mode !== 'mission') return;
      if (self.pauseOpen) { self.setPaused(false); kit.audio.sfx('select'); }
      else if (!kit.paused) self.setPaused(true);
    });
    window.addEventListener('pointerdown', function (e) { self.onDown(e); }, { passive: true });
    window.addEventListener('pointermove', function (e) { self.onMove(e); }, { passive: true });
    window.addEventListener('pointerup', function (e) { self.onUp(e); }, { passive: true });
    window.addEventListener('pointercancel', function (e) { self.onUp(e); }, { passive: true });
  };

  VergeScene.prototype.seedPointer = function (e) {
    if (!kit.input.pointers.has(e.pointerId)) {
      kit.input.pointers.set(e.pointerId, {
        x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
        downAt: performance.now(), zone: 'game'
      });
    }
  };

  VergeScene.prototype.toGame = function (cx, cy) {
    var canvas = this.game && this.game.canvas;
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return { x: (cx - rect.left) / rect.width * GAME_W, y: (cy - rect.top) / rect.height * GAME_H };
  };

  VergeScene.prototype.hitTest = function (name, p) {
    var list = this.screenHits[name], i, h;
    if (!list) return false;
    for (i = 0; i < list.length; i++) {
      h = list[i];
      if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) { this.doAction(h.act); return true; }
    }
    return false;
  };

  VergeScene.prototype.onDown = function (e) {
    this.seedPointer(e);
    var p = this.toGame(e.clientX, e.clientY);
    if (!p) return;
    this.hoverX = p.x; this.hoverY = p.y;
    if (this.pauseOpen) { this.hitTest('pause', p); return; }
    if (this.mode === 'results') { this.hitTest('results', p); return; }
    if (this.mode === 'menu' || this.mode === 'campaign' || this.mode === 'base') { this.hitTest(this.mode, p); return; }
    if (this.mode !== 'mission' || !this.run) return;
    if (this.hitTest('mission', p)) return;

    var inBoard = p.x >= BOARD.x && p.x <= BOARD.x + BOARD.w && p.y >= BOARD.y && p.y <= BOARD.y + BOARD.h;
    if (!inBoard) return;

    if (this.pendingAbility) {
      var ad = C.abilityDef(this.pendingAbility);
      if (ad.targeted) { this.fireAbility(this.pendingAbility, p.x, p.y); return; }
    }

    var pad = this.padAt(p.x, p.y);
    if (pad >= 0) {
      if (this.selectedPad === pad) this.confirmBuild(pad);
      else { this.selectedPad = pad; kit.audio.sfx('select'); }
      return;
    }
    /* thumb-zone virtual stick: lower-left of the board, away from sockets */
    if (this.stickId === null && p.x < BOARD.x + 320 && p.y > BOARD.y + BOARD.h - 260) {
      this.stickId = e.pointerId;
      this.stick.active = true; this.stick.ox = p.x; this.stick.oy = p.y;
      this.stick.x = 0; this.stick.y = 0;
      this.pointerClaims[e.pointerId] = 'stick';
      return;
    }
    if (this.selectedPad >= 0) { this.selectedPad = -1; }
  };

  VergeScene.prototype.onMove = function (e) {
    var p = this.toGame(e.clientX, e.clientY);
    if (!p) return;
    if (this.stickId === e.pointerId) {
      var dx = p.x - this.stick.ox, dy = p.y - this.stick.oy;
      var m = Math.hypot(dx, dy), max = 64;
      if (m > max) { dx = dx / m * max; dy = dy / m * max; m = max; }
      this.stick.x = dx / max; this.stick.y = dy / max;
      return;
    }
    if (this.mode === 'mission' && this.pendingAbility) { this.hoverX = p.x; this.hoverY = p.y; }
  };

  VergeScene.prototype.onUp = function (e) {
    if (this.stickId === e.pointerId) {
      this.stickId = null;
      this.stick.active = false; this.stick.x = 0; this.stick.y = 0;
    }
    delete this.pointerClaims[e.pointerId];
  };

  VergeScene.prototype.padAt = function (x, y) {
    var pads = this.map.pads, best = -1, bd = 34, i, d;
    for (i = 0; i < pads.length; i++) {
      d = Math.hypot(pads[i][0] - x, pads[i][1] - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  VergeScene.prototype.doAction = function (act) {
    var i, r = this.run;
    if (act === 'back') { kit.audio.sfx('cancel'); this.showScreen('menu'); return; }
    if (act.indexOf('menu') === 0 && act.length > 4) {
      i = Number(act.slice(4));
      kit.audio.sfx('select');
      if (i === 0) this.showScreen('campaign');
      else if (i === 1) this.startMission(Math.min(3, Math.floor(C.highestUnlocked(profile) / 6)), true);
      else if (i === 2) this.showScreen('base');
      else kit.openSettings();
      return;
    }
    if (act.indexOf('mission') === 0) {
      i = Number(act.slice(7));
      if (!C.missionUnlocked(profile, i)) { kit.audio.sfx('cancel'); return; }
      kit.audio.sfx('select');
      this.startMission(i, false);
      return;
    }
    if (act.indexOf('fac') === 0) {
      i = Number(act.slice(3));
      var lvl = profile.facilities[i];
      if (lvl >= C.FACILITY_MAX) { kit.audio.sfx('cancel'); return; }
      var cost = C.facilityCost(lvl);
      if (profile.salvage < cost) { kit.audio.sfx('cancel'); return; }
      profile.salvage -= cost;
      profile.facilities[i] = lvl + 1;
      saveProfile();
      kit.audio.sfx('upgrade');
      this.paintScreen();
      return;
    }
    if (act.indexOf('res') === 0) {
      i = Number(act.slice(3));
      kit.audio.sfx('select');
      if (i === 0) this.restartRun();
      else if (i === 1) {
        if (!r.endless && this.lastResult.won && r.missionIndex + 1 < C.MISSIONS.length) this.startMission(r.missionIndex + 1, false);
        else this.showScreen('base');
      } else this.showScreen('campaign');
      return;
    }
    if (act.indexOf('pause') === 0 && act.length > 5) {
      i = Number(act.slice(5));
      kit.audio.sfx('select');
      if (i === 0) this.setPaused(false);
      else if (i === 1) { this.setPaused(false); this.restartRun(); }
      else if (i === 2) kit.openSettings();
      else { this.setPaused(false); this.showScreen('campaign'); }
      return;
    }
    if (act === 'pauseBtn') { this.setPaused(true); return; }
    if (act === 'menuBtn') { kit.audio.sfx('cancel'); this.showScreen('campaign'); return; }
    if (act === 'buildBtn') { if (this.selectedPad >= 0) this.confirmBuild(this.selectedPad); return; }
    if (act === 'sellBtn') { if (this.selectedPad >= 0) this.sellTower(this.selectedPad); return; }
    if (act.indexOf('tower') === 0) {
      i = Number(act.slice(5));
      var td = C.TOWERS[C.TOWER_KEYS[i]];
      if (!td) return;
      if (C.unlockedTowers(C.totalMedals(profile)).indexOf(td.id) < 0) {
        this.toastNow('NEEDS ' + td.unlock + ' MEDALS', CSS.muted);
        kit.audio.sfx('cancel');
        return;
      }
      this.towerType = td.id;
      this.pendingAbility = null;
      kit.audio.sfx('select');
      return;
    }
    if (act.indexOf('abil') === 0) {
      i = Number(act.slice(4));
      if (C.ABILITIES[i]) this.selectAbility(C.ABILITIES[i].id);
      return;
    }
    if (act === 'call') {
      if (r && r.phase === 'prep') {
        var bonus = Math.max(0, Math.ceil(r.prep));
        r.scrap = Math.min(999, r.scrap + bonus);
        r.prep = 0;
        this.startWave();
        if (bonus) this.toastNow('EARLY CALL  +' + bonus, CSS.amber);
        this.advanceCoach(2);
      } else kit.audio.sfx('cancel');
      return;
    }
    if (act === 'speed') {
      if (r) { r.speed = r.speed >= 3 ? 1 : r.speed + 1; kit.audio.sfx('select'); }
      return;
    }
  };

  /* ------------------------------------------------------------- keys */
  VergeScene.prototype.edge = function (code) {
    var down = kit.input.keyDown(code), was = !!this.keyEdges[code];
    this.keyEdges[code] = down;
    return down && !was;
  };

  VergeScene.prototype.handleKeys = function () {
    var i, codes;
    if (this.pauseOpen) {
      if (this.edge('Enter')) this.doAction('pause0');
      return;
    }
    if (this.mode === 'menu') {
      if (this.edge('Enter') || this.edge('Space')) this.doAction('menu0');
      return;
    }
    if (this.mode === 'campaign') {
      if (this.edge('Escape')) this.doAction('back');
      if (this.edge('Enter')) this.doAction('mission' + C.highestUnlocked(profile));
      return;
    }
    if (this.mode === 'base') {
      if (this.edge('Enter')) this.doAction('back');
      return;
    }
    if (this.mode === 'results') {
      if (this.edge('Enter')) this.doAction('res1');
      if (this.edge('KeyR')) this.doAction('res0');
      return;
    }
    if (this.mode !== 'mission' || !this.run) return;
    codes = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
    for (i = 0; i < codes.length; i++) if (this.edge(codes[i])) this.doAction('tower' + i);
    if (this.edge('KeyQ')) this.doAction('abil0');
    if (this.edge('KeyE')) this.doAction('abil1');
    if (this.edge('KeyR')) this.doAction('abil2');
    if (this.edge('Space')) this.doAction('call');
    if (this.edge('KeyF')) this.doAction('speed');
    if (this.edge('BracketRight') || this.edge('KeyX')) this.cyclePad(1);
    if (this.edge('BracketLeft') || this.edge('KeyZ')) this.cyclePad(-1);
    if (this.edge('Enter')) {
      if (this.pendingAbility) {
        var ad = C.abilityDef(this.pendingAbility);
        if (ad.targeted) this.fireAbility(this.pendingAbility, this.selectedPad >= 0 ?
          this.map.pads[this.selectedPad][0] : this.op.x, this.selectedPad >= 0 ?
          this.map.pads[this.selectedPad][1] : this.op.y);
      } else if (this.selectedPad >= 0) this.confirmBuild(this.selectedPad);
      else this.cyclePad(1);
    }
  };

  VergeScene.prototype.cyclePad = function (dir) {
    var n = this.map.pads.length;
    this.selectedPad = ((this.selectedPad + dir) % n + n) % n;
    kit.audio.sfx('select', { volume: 0.6 });
  };

  /* ======================================================= frame driver */
  VergeScene.prototype.checkForce = function () {
    /* Test switches are readable from the boot fallback object and from the
     * live scene, and are applied at most once per change. */
    if (hook.forceStage !== this.lastForceStage) {
      this.lastForceStage = hook.forceStage;
      if (hook.forceStage != null && this.mode === 'mission' && this.run && !this.run.endless) {
        this.startMission(hook.forceStage, false);
        return;
      }
    }
    if (hook.forceMode !== this.lastForceMode) {
      this.lastForceMode = hook.forceMode;
      var m = hook.forceMode;
      if (m === 'mission') this.startMission(hook.forceStage == null ? 0 : hook.forceStage, false);
      else if (m === 'endless') this.startMission(hook.forceStage == null ? 0 : hook.forceStage, true);
      else if (m === 'menu' || m === 'campaign' || m === 'base') this.showScreen(m);
    }
  };

  VergeScene.prototype.syncHook = function () {
    var st = hook.state, r = this.run;
    st.mode = this.mode;
    st.ready = true;
    st.medals = C.totalMedals(profile);
    st.salvage = profile.salvage;
    st.best = profile.best;
    if (r) {
      st.stage = r.endless ? -1 : r.missionIndex;
      st.stageName = r.endless ? ('ENDLESS ' + this.map.name) : r.def.name;
      st.wave = r.wave;
      st.waves = r.endless ? 0 : r.def.waves;
      st.progress = r.endless ? r.wavesDone : clamp(r.wavesDone / r.def.waves, 0, 1);
      st.score = r.score;
      st.coreHp = Math.round(r.coreHp);
      st.coreMax = r.coreMax;
      st.health = clamp(r.coreHp / r.coreMax, 0, 1);
      st.scrap = r.scrap;
      st.phase = r.phase;
      st.map = this.map.id;
    } else {
      st.stage = C.highestUnlocked(profile);
      st.stageName = C.missionDef(st.stage).name;
      st.wave = 0; st.waves = 0; st.progress = 0; st.score = 0;
      st.health = 1; st.coreHp = 100; st.coreMax = 100; st.scrap = 0;
      st.phase = this.mode;
      st.map = this.map ? this.map.id : '';
    }
  };

  VergeScene.prototype.update = function (time, delta) {
    var frame = Math.min(delta, 100) / 1000;
    var j = kit.juice.frame();
    /* hit-stop freezes the cosmetic clock only; the sim accumulator never
     * pauses or skips. */
    if (!j.frozen) this.animTime += frame;
    if (this.world.x !== j.dx || this.world.y !== j.dy) this.world.setPosition(j.dx, j.dy);

    this.handleKeys();
    this.checkForce();

    if (this.mode === 'mission' && this.run) {
      var speed = this.run.speed;
      var cap = MAX_STEPS * speed;
      this.accumulator += frame * speed;
      var steps = 0;
      while (this.accumulator >= STEP && steps < cap) { this.stepSim(); this.accumulator -= STEP; steps++; }
      if (this.accumulator > STEP * 4) this.accumulator = STEP;
    } else if (this.mode === 'results') {
      this.animTime += 0;
      this.updateParticles(STEP);
    }

    if (this.mode === 'mission' || this.mode === 'results') {
      this.drawDecals();
      this.drawUnits();
      this.drawFx();
      this.drawHud();
      this.drawPanel();
    } else if (this.hudGfx.commandBuffer && this.hudGfx.commandBuffer.length) {
      this.hudGfx.clear();
    }

    this.updateMusic();
    this.syncHook();
  };



  var config = {
    type: Phaser.AUTO, parent: 'game', width: GAME_W, height: GAME_H,
    backgroundColor: '#090f18',
    render: {},
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: Math.round(GAME_W * RETINA_FACTOR), height: Math.round(GAME_H * RETINA_FACTOR) },
    scene: [VergeScene]
  };
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
  kit.loader.show('VERGE PROTOCOL');
  kit.loader.progress(0.15);
  Game.phaser = new Phaser.Game(config);
  kit.loader.progress(0.6);
  window.__VP_READY = true;
})();
