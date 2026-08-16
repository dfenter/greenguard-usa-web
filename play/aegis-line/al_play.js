/* Aegis Line - al_play.js
 * The cover-line simulation: input, firing, recoil, reloads, the enemy line,
 * bursts and the stage state machine. Painting, HUD and the boundary screens
 * live in al_paint.js and are merged into this same scene config.
 *
 * Simulation rules:
 *  - One fixed 60 Hz accumulator. Hit-stop freezes the whole frame, sim and
 *    cosmetics together, and the accumulated time is dropped rather than
 *    replayed, so no clock can ever run ahead of the stepped sim.
 *  - Everything is pooled and grows one record at a time on demand. Building
 *    full pools inside create() is what turns a scene start into a 180 ms
 *    frame on a throttled phone.
 *  - Input is read from GGKit's pointer map and the core tap queue inside the
 *    step. No gameplay decision is ever made in an event handler.
 */
(function (root) {
  'use strict';

  var AL = root.AL, D = root.ALData;
  var STEP = AL.STEP, MAX_STEPS = AL.MAX_STEPS;
  var clamp = AL.clamp;

  function densityDpr() { return root.__GG_AEGIS_DPR || 1; }

  // ---- pool ceilings and initial sizes -----------------------------------
  var MAX_ENEMIES = 40, INIT_ENEMIES = 10;
  var MAX_SHOTS = 40, INIT_SHOTS = 8;
  var MAX_TRACERS = 26, INIT_TRACERS = 8;
  var MAX_POPS = 16, INIT_POPS = 6;
  var MAX_RINGS = 14, INIT_RINGS = 5;

  // ---- feel constants ----------------------------------------------------
  var RISE_TIME = 0.16;       // seconds to pop up from cover
  var DUCK_TIME = 0.13;       // seconds to drop back down
  var REGEN_DELAY = 0.75;     // ducked seconds before repair starts
  var REGEN_RATE = 5.0;       // cover integrity per second while ducked
  var DUCK_MITIGATE = 0.28;   // fraction of damage taken while ducked
  var PERFECT_FROM = 0.55;    // perfect-reload window, fraction of reload
  var PERFECT_TO = 0.78;
  var PERFECT_SHOTS = 12;     // shots that carry the perfect-reload bonus
  var PERFECT_BONUS = 0.5;    // extra damage fraction on those shots
  var Z_STOP = 0.10;          // depth at which the line stops advancing
  var Z_DEPTH_PX = 260;       // design px of depth the field represents
  var AUTO_FIRE_MUL = 0.45;   // damage share of the four non-lead operators
  var GAUGE_TRICKLE = 7;      // burst charge per second, passive
  var GAUGE_PER_DAMAGE = 0.30;
  var WAVE_GAP = 1.15;        // seconds between cleared waves
  var MAX_ALIVE = 14;         // hard cap on simultaneous enemies

  function mkPool(max, init, factory) {
    var p = { list: [], max: max, factory: factory };
    for (var i = 0; i < init; i++) p.list.push(factory());
    p.get = function () {
      for (var i = 0; i < p.list.length; i++) if (!p.list[i].alive) return p.list[i];
      if (p.list.length < p.max) { var n = p.factory(); p.list.push(n); return n; }
      return null;
    };
    return p;
  }

  var PlayScene = {
    key: 'play',

    // ============================================================ create
    create: function (data) {
      var scene = this;
      AL.uiInit(this);
      this.mode = (data && data.mode) || 'campaign';
      this.index = (data && data.index) || 0;
      this.plan = AL.planFor(this.mode, this.index);
      this.ch = this.plan.ch;

      // modifier flags, resolved once
      var mods = this.plan.mods || [];
      this.mod = {
        brittle: mods.indexOf('brittle') !== -1,
        swift: mods.indexOf('swift') !== -1,
        plated: mods.indexOf('plated') !== -1,
        dry: mods.indexOf('dry') !== -1,
        surge: mods.indexOf('surge') !== -1,
        blackout: mods.indexOf('blackout') !== -1,
        dense: mods.indexOf('dense') !== -1
      };

      AL.buildChapterTextures(this, this.ch.key);
      this.bd = AL.makeBackdrop(this, this.ch.key);

      // ---- team ------------------------------------------------------
      var save = AL.save;
      this.team = save.team.slice(0, 5);
      if (!this.team.length) this.team = ['venn'];
      this.leadIdx = Math.max(0, this.team.indexOf(save.lead));
      this.passives = AL.teamPassives(this.team);
      this.maxIntegrity = AL.maxIntegrity(this.team);
      this.integrity = this.maxIntegrity;

      this.units = [];
      for (var u = 0; u < this.team.length; u++) {
        var st = AL.unitStats(this.team[u]);
        var mag = Math.max(2, Math.round(st.weapon.mag * (this.mod.dry ? 0.5 : 1)));
        this.units.push({
          id: this.team[u], stats: st, mag: mag, ammo: mag,
          reloadT: 0, reloading: false, perfectUsed: false,
          gauge: 0, cost: st.unit.burst.cost, shotIdx: 0,
          autoT: Math.random() * 0.4, spr: null, state: 'duck'
        });
      }

      // ---- run state -------------------------------------------------
      this.phase = 'intro';       // intro | fight | clear | fail | paused
      this.acc = 0;
      this.vclock = 0;
      this.score = 0;
      this.kills = 0;
      this.crits = 0;
      this.waveIdx = 0;
      this.waveTimer = 0;
      this.spawnQueue = [];
      this.spawnTimer = 0;
      this.risen = 0;             // 0 ducked, 1 fully popped
      this.holding = false;
      this.duckedT = 0;
      this.hurtT = 0;
      this.fireT = 0;
      this.perfectShots = 0;
      this.aim = { x: 0, y: 0 };
      this.aimTarget = { x: 0, y: 0 };
      this.recoil = { x: 0, y: 0 };
      this.aimPointerId = -1;
      this.aimGrab = null;
      this.shakeBudget = 0;
      this.bossRec = null;
      this.effects = {
        volley: 0, screen: 0, suture: 0, sync: 0, anchor: 0, shatter: 0
      };
      this.cutin = { t: 0, id: '', name: '' };
      this.results = null;
      this.pauseOpen = false;
      this.frozen = false;
      this.stageStars = 0;
      this.damageTaken = 0;
      this.rand = this.makeRand(this.plan.seed || (0x9e37 + this.index * 2654435761));

      // ---- pools -----------------------------------------------------
      this.enemies = mkPool(MAX_ENEMIES, INIT_ENEMIES, function () { return scene.mkEnemy(); });
      this.shots = mkPool(MAX_SHOTS, INIT_SHOTS, function () { return scene.mkShot(); });
      this.tracers = mkPool(MAX_TRACERS, INIT_TRACERS, function () { return scene.mkTracer(); });
      this.pops = mkPool(MAX_POPS, INIT_POPS, function () { return scene.mkPop(); });
      this.rings = mkPool(MAX_RINGS, INIT_RINGS, function () { return scene.mkRing(); });

      this.buildWorld();
      this.buildFx();
      this.buildHud();
      this.layout();

      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', function () {
        scene.scale.off('resize', scene.layout, scene);
      });

      // ---- tutorial --------------------------------------------------
      this.tut = (!AL.save.tutorial && this.mode === 'campaign' && this.index === 0 &&
        !AL.state.forceSkipTutorial) ? { step: 0, t: 0, shots: 0, aimed: 0, done: false } : null;

      AL.onPause = function () { scene.frozen = true; };
      AL.onResume = function () { scene.frozen = false; };
      AL.onRestart = function () { scene.restartRun(); };
      AL.onRawKey = function (code) { scene.onKey(code); };

      AL.state.mode = this.mode;
      AL.state.phase = 'intro';
      AL.clearTaps();

      // Music: the field loop, or the siege loop for elite and boss stages.
      var track = (this.plan.kind === 'boss' || this.plan.kind === 'elite') ? 'music_siege' : 'music_field';
      AL.kit.audio.music(track, 700);

      this.startBanner();
    },

    makeRand: function (seed) {
      var s = (seed >>> 0) || 1;
      return function () {
        s ^= s << 13; s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
      };
    },

    // =========================================================== factories
    mkEnemy: function () {
      var spr = this.add.sprite(-500, -500, 'atlas', 'en_crawler_idle')
        .setOrigin(0.5, 0.94).setVisible(false).setDepth(20);
      return {
        alive: false, key: 'crawler', boss: false, elite: false,
        hp: 1, maxHp: 1, z: 1, lane: 0, x: -500, y: -500, sc: 1,
        st: 'advance', t: 0, cad: 0, wind: 0, windMax: 1,
        hurtT: 0, stagT: 0, dieT: 0, dmg: 1, armor: 0, score: 0,
        speed: 0, ranged: false, arcing: false, charger: false,
        cores: [], coreImgs: [], ring: null, spr: spr, frame: '',
        pattern: 0, patternT: 0
      };
    },
    mkShot: function () {
      var spr = this.add.image(-500, -500, 'atlas', 'bolt')
        .setOrigin(0.5).setVisible(false).setDepth(46)
        .setBlendMode(Phaser.BlendModes.ADD);
      return { alive: false, x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0, t: 0, dur: 1, dmg: 0, arc: 0, spr: spr };
    },
    mkTracer: function () {
      var spr = this.add.image(-500, -500, 'atlas', 'tracer')
        .setOrigin(0, 0.5).setVisible(false).setDepth(58)
        .setBlendMode(Phaser.BlendModes.ADD);
      return { alive: false, t: 0, life: 0.07, spr: spr };
    },
    mkPop: function () {
      var t = AL.txt(this, -500, -500, '', 15, AL.CSS.text, '700')
        .setOrigin(0.5).setVisible(false).setDepth(62);
      return { alive: false, t: 0, life: 0.6, x: 0, y: 0, vy: 0, txt: t };
    },
    mkRing: function () {
      var spr = this.add.image(-500, -500, 'atlas', 'ring_soft')
        .setOrigin(0.5).setVisible(false).setDepth(60)
        .setBlendMode(Phaser.BlendModes.ADD);
      return { alive: false, t: 0, life: 0.4, x: 0, y: 0, r0: 10, r1: 60, tint: 0xffffff, spr: spr };
    },

    // ============================================================== world
    buildWorld: function () {
      var i;
      // cover band and the trench below it, both baked, both flat quads
      this.cover = this.add.tileSprite(0, 0, 8, 8, 'cover_' + this.ch.key)
        .setOrigin(0, 0).setDepth(50);
      // Fully opaque: the ducked squad hides BEHIND this, and any
      // translucency turns them into ghosts showing through the parapet.
      this.trench = this.add.image(0, 0, 'px')
        .setOrigin(0, 0).setDepth(49).setTint(0x05080e).setAlpha(1);

      // operators, behind the cover band
      for (i = 0; i < this.units.length; i++) {
        var un = this.units[i];
        un.spr = this.add.sprite(-500, -500, 'atlas', 'op_' + un.id + '_duck')
          .setOrigin(0.5, 0.94).setDepth(45);
        un.muzzle = this.add.image(-500, -500, 'atlas', 'muzzle')
          .setOrigin(0.1, 0.5).setDepth(47).setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD);
        un.muzzleT = 0;
      }

      // reticle and its spread ring
      this.spreadRing = this.add.image(-500, -500, 'atlas', 'ring')
        .setOrigin(0.5).setDepth(69).setAlpha(0.28).setTint(0xbfe6ff);
      this.reticle = this.add.image(-500, -500, 'atlas', 'reticle')
        .setOrigin(0.5).setDepth(70).setDisplaySize(38, 38);

      // incoming-fire chevrons: the tell for which enemy is about to break
      // your cover. Three is the cap; more than that is noise.
      this.chevs = [];
      for (i = 0; i < 3; i++) {
        this.chevs.push(this.add.image(-500, -500, 'atlas', 'chevron')
          .setOrigin(0.5, 1).setDepth(80).setVisible(false).setDisplaySize(20, 20));
      }

      this.hitVig = this.add.image(0, 0, 'vig')
        .setOrigin(0, 0).setDepth(90).setAlpha(0).setScrollFactor(0).setVisible(false);
      this.flash = this.add.image(0, 0, 'px')
        .setOrigin(0, 0).setDepth(91).setAlpha(0).setScrollFactor(0).setVisible(false)
        .setBlendMode(Phaser.BlendModes.ADD);
    },

    buildFx: function () {
      // Six pooled emitters carry every impact and reward beat, plus one
      // ambient system for the chapter weather. Arcade lane floor is 4 to 6.
      var add = Phaser.BlendModes.ADD;
      this.fxSpark = this.add.particles(0, 0, 'atlas', {
        frame: 'spark', lifespan: 340, speed: { min: 40, max: 210 },
        scale: { start: 0.5, end: 0 }, alpha: { start: 1, end: 0 },
        quantity: 4, emitting: false, blendMode: add
      }).setDepth(61);
      this.fxCrit = this.add.particles(0, 0, 'atlas', {
        frame: 'flare', lifespan: 480, speed: { min: 70, max: 300 },
        scale: { start: 0.7, end: 0 }, alpha: { start: 1, end: 0 },
        rotate: { start: 0, end: 180 }, quantity: 8, emitting: false, blendMode: add
      }).setDepth(63);
      this.fxDebris = this.add.particles(0, 0, 'atlas', {
        frame: 'shard', lifespan: 700, speed: { min: 60, max: 250 },
        gravityY: 420, scale: { start: 1.1, end: 0.3 }, alpha: { start: 1, end: 0.1 },
        rotate: { min: -220, max: 220 }, quantity: 7, emitting: false
      }).setDepth(59);
      this.fxSmoke = this.add.particles(0, 0, 'atlas', {
        frame: 'smoke', lifespan: 900, speed: { min: 10, max: 60 },
        scale: { start: 0.35, end: 1.0 }, alpha: { start: 0.35, end: 0 },
        quantity: 3, emitting: false
      }).setDepth(57);
      this.fxShell = this.add.particles(0, 0, 'atlas', {
        frame: 'shell', lifespan: 620, speedX: { min: 60, max: 150 },
        speedY: { min: -180, max: -80 }, gravityY: 780,
        rotate: { min: -400, max: 400 }, scale: 1.1,
        alpha: { start: 1, end: 0.2 }, quantity: 1, emitting: false
      }).setDepth(46);
      this.fxMuzzleSmoke = this.add.particles(0, 0, 'atlas', {
        frame: 'dot', lifespan: 300, speed: { min: 20, max: 90 },
        scale: { start: 0.5, end: 0 }, alpha: { start: 0.7, end: 0 },
        quantity: 2, emitting: false, blendMode: add
      }).setDepth(60);

      var w = this.scale.width / densityDpr(), h = this.scale.height / densityDpr();
      var weather = this.ch.weather;
      var cfg = {
        ash: { frame: 'dot', lifespan: 5200, speedY: { min: 12, max: 34 }, speedX: { min: -16, max: 8 },
          scale: { min: 0.10, max: 0.34 }, alpha: { start: 0.55, end: 0 }, tint: 0xffb066, freq: 130 },
        rain: { frame: 'shard', lifespan: 900, speedY: { min: 460, max: 700 }, speedX: { min: -70, max: -30 },
          scale: { min: 0.25, max: 0.5 }, alpha: { start: 0.32, end: 0.05 }, tint: 0xa8e8ff, freq: 26 },
        snow: { frame: 'dot', lifespan: 6200, speedY: { min: 20, max: 48 }, speedX: { min: -34, max: 34 },
          scale: { min: 0.14, max: 0.42 }, alpha: { start: 0.8, end: 0.1 }, tint: 0xffffff, freq: 90 },
        spore: { frame: 'dot', lifespan: 6000, speedY: { min: -22, max: 12 }, speedX: { min: -18, max: 18 },
          scale: { min: 0.12, max: 0.4 }, alpha: { start: 0.6, end: 0 }, tint: 0xec9bff, freq: 110 },
        ember: { frame: 'spark', lifespan: 3400, speedY: { min: -70, max: -20 }, speedX: { min: -22, max: 22 },
          scale: { min: 0.12, max: 0.34 }, alpha: { start: 0.85, end: 0 }, tint: 0xffd07a, freq: 100 }
      }[weather] || null;
      if (cfg) {
        this.fxWeather = this.add.particles(0, 0, 'atlas', {
          frame: cfg.frame, lifespan: cfg.lifespan,
          speedX: cfg.speedX, speedY: cfg.speedY,
          scale: cfg.scale, alpha: cfg.alpha, tint: cfg.tint,
          frequency: cfg.freq, blendMode: weather === 'rain' ? 'NORMAL' : Phaser.BlendModes.ADD,
          emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, -20, w, 10) }
        }).setDepth(-60);
      } else this.fxWeather = null;
    },

    // ============================================================= layout
    layout: function () {
      var w = this.scale.width / densityDpr(), h = this.scale.height / densityDpr();
      var ins = AL.insets;
      AL.refreshCanvasOffset(this.game.canvas);
      this.W = w; this.H = h;
      this.ins = ins;
      this.hudTop = ins.top + 6;
      this.fieldTop = ins.top + 46;
      this.coverTop = h - ins.bottom - 112;
      if (this.coverTop < this.fieldTop + 120) this.coverTop = this.fieldTop + 120;
      this.horizonY = this.fieldTop + 8;
      this.groundY = this.coverTop - 4;
      this.cx = w / 2;

      this.bd.layout(w, h, this.horizonY, this.groundY);
      this.cover.setPosition(0, this.coverTop).setSize(w, 40);
      this.cover.setTileScale(40 / 64, 40 / 64);
      this.trench.setPosition(0, this.coverTop + 38).setDisplaySize(w, h - this.coverTop);
      this.hitVig.setDisplaySize(w, h);
      this.flash.setDisplaySize(w, h);

      // operator posts, spread along the cover line, lead in the middle
      var n = this.units.length;
      var span = Math.min(w - 80, 78 * n);
      for (var i = 0; i < n; i++) {
        var f = n === 1 ? 0.5 : i / (n - 1);
        this.units[i].postX = this.cx - span / 2 + span * f;
      }
      this.duckY = this.coverTop + 68;
      this.standY = this.coverTop + 22;

      if (this.fxWeather && this.fxWeather.emitZone) {
        this.fxWeather.setPosition(0, 0);
      }
      if (!this.aimInit) {
        this.aim.x = this.cx; this.aim.y = (this.fieldTop + this.groundY) * 0.5;
        this.aimTarget.x = this.aim.x; this.aimTarget.y = this.aim.y;
        this.aimInit = true;
      }
      this.layoutHud();
    },

    // ============================================================== waves
    skipIntro: function () {
      if (this.phase !== 'intro') return;
      this.banner.hide();
      this.beginFight();
    },

    beginFight: function () {
      this.phase = 'fight';
      AL.state.phase = 'fight';
      this.waveIdx = 0;
      this.startWave();
    },

    startWave: function () {
      this.waveIdx++;
      AL.state.wave = this.waveIdx;
      AL.state.waves = this.plan.waves;
      this.spawnQueue.length = 0;
      this.spawnTimer = 0;

      if (this.plan.boss && this.waveIdx === 1) {
        this.spawnBoss();
        AL.kit.audio.sfx('sfx_alarm', { volume: 0.85 });
        return;
      }
      var tier = this.plan.tier;
      var base = 4 + tier * 1.05 + this.waveIdx * 0.8;
      if (this.plan.kind === 'elite') base += 2;
      if (this.mod.dense) base *= 1.5;
      var count = Math.max(3, Math.min(22, Math.round(base)));
      var mix = (this.plan.mix && this.plan.mix.length) ? this.plan.mix : ['crawler'];
      for (var i = 0; i < count; i++) {
        var key = mix[Math.floor(this.rand() * mix.length) % mix.length] || 'crawler';
        this.spawnQueue.push(key);
      }
      // elite stages promote one spawn per wave to a warden
      if (this.plan.kind === 'elite') this.spawnQueue[0] = 'warden';
      if (this.waveIdx > 1) this.toast.push('WAVE ' + this.waveIdx + ' / ' + this.plan.waves, 'ic_flag', AL.PAL.cyan);
      AL.kit.audio.sfx('sfx_advance', { volume: 0.5 });
    },

    spawnFromQueue: function () {
      if (!this.spawnQueue.length) return;
      if (this.aliveCount() >= MAX_ALIVE) return;
      var key = this.spawnQueue.shift();
      this.spawnEnemy(key);
    },

    spawnEnemy: function (key) {
      var base = D.ENEMIES[key] || D.ENEMIES.crawler;
      var e = this.enemies.get();
      if (!e) return null;
      var tier = this.plan.tier;
      e.alive = true;
      e.key = key;
      e.boss = false;
      e.elite = !!base.elite;
      e.maxHp = Math.round(base.hp * (0.75 + tier * 0.55));
      e.hp = e.maxHp;
      e.z = 1 + this.rand() * 0.18;
      e.lane = (this.rand() * 2 - 1) * 0.92;
      e.speed = base.speed * (this.mod.swift ? 1.35 : 1) / Z_DEPTH_PX;
      e.dmg = base.dmg * (0.7 + tier * 0.16);
      e.armor = base.armor * (this.mod.plated ? 2 : 1);
      e.score = base.score;
      e.ranged = !!base.ranged;
      e.arcing = !!base.arcing;
      e.charger = !!base.charger;
      e.st = 'advance';
      e.t = 0;
      e.cad = base.cadence * (0.7 + this.rand() * 0.5);
      e.windMax = base.windup;
      e.wind = 0;
      e.hurtT = 0;
      e.stagT = 0;
      e.dieT = 0;
      e.stagBuild = 0;
      e.zStop = Z_STOP + this.rand() * 0.22 + (base.ranged ? 0.16 : 0);
      e.cores.length = 0;
      var cn = base.cores || 1;
      for (var c = 0; c < cn; c++) {
        e.cores.push({
          x: base.coreX + (cn > 1 ? (c === 0 ? -16 : 16) : 0),
          y: base.coreY, r: base.coreR, dead: false
        });
      }
      e.frame = '';
      this.setEnemyFrame(e, 'idle');
      e.spr.setVisible(true).setDepth(20 + (1 - e.z) * 18);
      AL.setTint(e.spr, this.ch.enemyTint);
      return e;
    },

    spawnBoss: function () {
      var key = this.plan.boss || 'titan';
      var b = D.BOSSES[key] || D.BOSSES.titan;
      var e = this.enemies.get();
      if (!e) return null;
      e.alive = true;
      e.key = key;
      e.boss = true;
      e.elite = true;
      e.maxHp = Math.round(b.hp * (this.mode === 'tower' ? 0.5 + this.index * 0.09 : 1));
      e.hp = e.maxHp;
      // Bosses start already on the field and close in. Spawning one at the
      // far edge of the depth range means the player spends the opening of
      // the fight looking at a thumbnail.
      e.z = 0.62;
      e.lane = 0;
      e.speed = 6 / Z_DEPTH_PX;
      e.dmg = b.dmg;
      e.armor = b.armor;
      e.score = b.score;
      e.ranged = true;
      e.arcing = false;
      e.charger = false;
      e.st = 'advance';
      e.t = 0;
      e.cad = 3.0;
      e.windMax = 1.4;
      e.wind = 0;
      e.hurtT = 0; e.stagT = 0; e.dieT = 0; e.stagBuild = 0;
      e.zStop = 0.34;
      e.pattern = 0;
      e.patternT = 0;
      e.cores.length = 0;
      for (var c = 0; c < b.cores.length; c++) {
        e.cores.push({ x: b.cores[c].x, y: b.cores[c].y, r: b.cores[c].r, dead: false });
      }
      e.frame = '';
      this.setEnemyFrame(e, 'idle');
      e.spr.setVisible(true).setDepth(24);
      AL.setTint(e.spr, 0xffffff);
      this.bossRec = e;
      AL.state.bossMaxHp = e.maxHp;
      return e;
    },

    setEnemyFrame: function (e, pose) {
      var f = (e.boss ? 'boss_' + e.key + '_' + (pose === 'idle' ? 'idle' : 'roar')
        : 'en_' + e.key + '_' + pose);
      if (e.frame !== f) { e.frame = f; e.spr.setFrame(f); }
    },

    aliveCount: function () {
      var n = 0, list = this.enemies.list;
      for (var i = 0; i < list.length; i++) if (list[i].alive && list[i].st !== 'dying') n++;
      return n;
    },

    // ============================================================== update
    update: function (time, delta) {
      var j = AL.kit.juice.frame();
      var dt = Math.min(delta, 60) / 1000;

      this.drainTaps();

      if (j.frozen) { this.paint(0, j); return; }
      if (this.frozen || this.phase === 'ending') { this.paint(dt, j); return; }

      this.acc += dt;
      var steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps >= MAX_STEPS) this.acc = 0;
      this.vclock += dt;
      this.paint(dt, j);
      this.pollForce();
    },

    // Force switches, readable live. The boot fallback handles the ones that
    // choose a mode before a scene exists.
    pollForce: function () {
      var s = AL.state;
      if (s.forceSkipIntro) { s.forceSkipIntro = false; this.skipIntro(); }
      if (s.forceClear) {
        s.forceClear = false;
        if (this.phase === 'intro') this.skipIntro();
        if (this.phase === 'fight') this.winStage();
      }
      if (s.forceFail) {
        s.forceFail = false;
        if (this.phase === 'intro') this.skipIntro();
        if (this.phase === 'fight') { this.integrity = 0; this.loseStage(); }
      }
      if (s.forceGrant) {
        AL.save.credits = clamp(AL.save.credits + s.forceGrant, 0, 9999999);
        AL.save.cores = clamp(AL.save.cores + Math.round(s.forceGrant / 50), 0, 99999);
        s.forceGrant = 0;
        AL.persist();
      }
      if (s.forceMode && s.forceMode !== 'play' && s.forceMode !== this.mode) {
        var m = s.forceMode;
        s.forceMode = '';
        if (m === 'title') this.leaveTo('title');
        else if (m === 'command') this.leaveTo('command');
        else this.scene.restart({ mode: m, index: m === 'tower' ? Math.max(0, s.forceFloor - 1) : Math.max(0, s.forceStage - 1) });
      }
    },

    // ============================================================== input
    drainTaps: function () {
      var taps = AL.taps;
      while (taps.length) {
        var tap = taps.shift();
        if (this.routeTap(tap)) continue;
        if (this.pauseOpen || this.results) continue;
        // the stage card is skippable: a player who has seen it once should
        // never have to wait it out
        if (this.phase === 'intro') { this.skipIntro(); continue; }
        // portraits first: they are controls and own their rectangles
        if (this.hitPortrait(tap)) continue;
        // a tap inside the reload window during a reload is the perfect cue
        if (this.phase === 'fight') this.tryPerfect();
      }
    },

    onKey: function (code) {
      if (code === 'Escape') {
        if (this.results) return;
        if (this.pauseOpen) this.closePause(); else this.openPause();
        return;
      }
      if (this.phase === 'intro' && (code === 'Enter' || code === 'Space')) { this.skipIntro(); return; }
      if (this.pauseOpen || this.results) return;
      if (code === 'KeyR') this.tryPerfect(true);
      if (code.length === 6 && code.indexOf('Digit') === 0) {
        var n = parseInt(code.charAt(5), 10);
        if (n >= 1 && n <= this.units.length) this.usePortrait(n - 1);
      }
    },

    readInput: function (dt) {
      var kit = AL.kit;
      // Hold to rise and fire. Any live pointer inside the field counts, and
      // the first one found owns the aim, so a second finger on a portrait
      // never steals the trigger.
      var p = null;
      var fieldH = this.coverTop + 40 - this.fieldTop;
      p = AL.pointerIn(0, this.fieldTop, this.W, fieldH);
      var keyFire = kit.input.keyDown('Space') || kit.input.keyDown('KeyW');
      this.holding = (!!p || keyFire) && this.phase === 'fight' && !this.pauseOpen && !this.results;

      if (p) {
        if (this.aimPointerId !== p.raw.__alId) {
          p.raw.__alId = p.raw.__alId || (Math.random() * 1e9) | 0;
          this.aimPointerId = p.raw.__alId;
          this.aimGrab = { px: p.x, py: p.y, ax: this.aim.x, ay: this.aim.y, blend: 0 };
        }
        var g = this.aimGrab;
        if (g) {
          // The reticle eases toward the finger over the first moments, then
          // tracks it one to one. A hard snap under the thumb reads as a
          // glitch; drifting forever reads as lag.
          g.blend = Math.min(1, g.blend + dt * 7);
          var direct = { x: p.x, y: p.y - 34 };
          var rel = { x: g.ax + (p.x - g.px), y: g.ay + (p.y - g.py) };
          this.aimTarget.x = rel.x + (direct.x - rel.x) * g.blend;
          this.aimTarget.y = rel.y + (direct.y - rel.y) * g.blend;
        }
      } else {
        this.aimPointerId = -1;
        this.aimGrab = null;
      }

      var ks = 330 * dt;
      if (kit.input.keyDown('ArrowLeft')) this.aimTarget.x -= ks;
      if (kit.input.keyDown('ArrowRight')) this.aimTarget.x += ks;
      if (kit.input.keyDown('ArrowUp')) this.aimTarget.y -= ks;
      if (kit.input.keyDown('ArrowDown')) this.aimTarget.y += ks;

      this.aimTarget.x = clamp(this.aimTarget.x, 16, this.W - 16);
      this.aimTarget.y = clamp(this.aimTarget.y, this.fieldTop + 6, this.groundY + 20);
      this.aim.x += (this.aimTarget.x - this.aim.x) * Math.min(1, dt * 22);
      this.aim.y += (this.aimTarget.y - this.aim.y) * Math.min(1, dt * 22);
    },

    // ================================================================ step
    step: function (dt) {
      this.readInput(dt);

      // rise and duck
      var want = this.holding ? 1 : 0;
      var rate = want ? dt / RISE_TIME : -dt / DUCK_TIME;
      this.risen = clamp(this.risen + rate, 0, 1);
      if (this.risen < 0.4) this.duckedT += dt; else this.duckedT = 0;

      // ducked repair, the reward for reading the incoming volley
      if (this.duckedT > REGEN_DELAY && this.integrity < this.maxIntegrity && this.phase === 'fight') {
        var reg = (REGEN_RATE + this.passives.regen) * dt;
        if (this.effects.suture > 0) reg *= 3.2;
        this.integrity = Math.min(this.maxIntegrity, this.integrity + reg);
      }
      if (this.effects.suture > 0) this.effects.suture -= dt;
      if (this.effects.volley > 0) this.effects.volley -= dt;
      if (this.effects.screen > 0) this.effects.screen -= dt;
      if (this.effects.sync > 0) this.effects.sync -= dt;
      if (this.effects.anchor > 0) this.effects.anchor -= dt;
      if (this.effects.shatter > 0) this.effects.shatter -= dt;
      if (this.hurtT > 0) this.hurtT -= dt;
      if (this.cutin.t > 0) this.cutin.t -= dt;

      this.stepWeapons(dt);
      this.stepEnemies(dt);
      this.stepShots(dt);
      this.stepGauges(dt);
      this.stepWaveState(dt);
      if (this.tut) this.stepTutorial(dt);
      this.syncState();
    },

    // ---------------------------------------------------------- weapons
    stepWeapons: function (dt) {
      var lead = this.units[this.leadIdx];
      if (!lead) return;

      // recoil recovery: the walk decays toward zero whenever the trigger is
      // not being held, which is what makes the pattern learnable
      var rec = lead.stats.weapon.recover * (this.holding ? 0.55 : 1.9);
      var rl = Math.hypot(this.recoil.x, this.recoil.y);
      if (rl > 0.01) {
        var dec = Math.min(rl, rec * dt);
        this.recoil.x -= this.recoil.x / rl * dec;
        this.recoil.y -= this.recoil.y / rl * dec;
      } else { this.recoil.x = 0; this.recoil.y = 0; }

      // reload
      if (lead.reloading) {
        lead.reloadT -= dt * (1 + this.passives.reload) * (this.mod.dry ? 1.4 : 1);
        if (lead.reloadT <= 0) this.finishReload(lead, false);
      } else if (this.fireT > 0) this.fireT -= dt;

      var canFire = this.phase === 'fight' && this.holding && this.risen > 0.55 &&
        !lead.reloading && lead.ammo > 0;
      if (canFire && this.fireT <= 0) {
        var rpm = lead.stats.rpm * (this.effects.volley > 0 ? 2 : 1);
        this.fireT = 60 / rpm;
        this.fireLead(lead);
      }
      if (!lead.reloading && lead.ammo <= 0) this.startReload(lead);
      if (!this.holding && !lead.reloading && lead.ammo < lead.mag && this.duckedT > 0.35) {
        this.startReload(lead);
      }

      // the four supporting operators fire on their own at reduced weight
      for (var i = 0; i < this.units.length; i++) {
        if (i === this.leadIdx) continue;
        var un = this.units[i];
        un.autoT -= dt;
        if (this.risen > 0.6 && this.phase === 'fight' && un.autoT <= 0) {
          un.autoT = (60 / un.stats.rpm) * 3.2;
          this.fireSupport(un, i);
        }
        if (un.muzzleT > 0) un.muzzleT -= dt;
      }
      if (this.units[this.leadIdx].muzzleT > 0) this.units[this.leadIdx].muzzleT -= dt;
    },

    startReload: function (un) {
      if (un.reloading) return;
      un.reloading = true;
      un.perfectUsed = false;
      un.reloadTotal = un.stats.reload * (this.mod.dry ? 0.7 : 1);
      un.reloadT = un.reloadTotal;
      AL.kit.audio.sfx('sfx_reload', { volume: 0.7 });
    },

    finishReload: function (un, perfect) {
      un.reloading = false;
      un.reloadT = 0;
      un.ammo = un.mag;
      un.shotIdx = 0;
      if (perfect) {
        this.perfectShots = PERFECT_SHOTS;
        un.gauge = Math.min(un.cost, un.gauge + un.cost * 0.08);
        AL.kit.audio.sfx('sfx_perfect', { volume: 0.9 });
        this.toast.push('PERFECT', 'ic_up', AL.PAL.green);
        this.popRing(this.aim.x, this.aim.y, 18, 74, AL.PAL.green, 0.34);
        if (AL.kit.juice.enabled) AL.kit.juice.shake(2.5, 90);
      }
    },

    tryPerfect: function (fromKey) {
      var lead = this.units[this.leadIdx];
      if (!lead) return;
      if (!lead.reloading) {
        if (fromKey && lead.ammo < lead.mag) this.startReload(lead);
        return;
      }
      if (lead.perfectUsed) return;
      lead.perfectUsed = true;
      var p = 1 - (lead.reloadT / lead.reloadTotal);
      if (p >= PERFECT_FROM && p <= PERFECT_TO) {
        this.finishReload(lead, true);
        if (this.tut && this.tut.step === 4) this.tutAdvance();
      } else {
        // a missed cue costs a little time, never the whole reload
        lead.reloadT = Math.min(lead.reloadTotal, lead.reloadT + 0.22);
        AL.kit.audio.sfx('sfx_hurt', { volume: 0.4 });
      }
    },

    fireLead: function (un) {
      var w = un.stats.weapon;
      var pat = D.RECOIL_PATTERNS[w.key] || D.RECOIL_PATTERNS.AR;
      var step = pat[un.shotIdx % pat.length];
      un.shotIdx++;
      un.ammo--;

      var kick = w.kick * (this.effects.volley > 0 ? 0.15 : 1);
      this.recoil.x += step[0] * kick * 0.9 + (this.rand() - 0.5) * kick * 0.35;
      this.recoil.y += step[1] * kick + (this.rand() - 0.5) * kick * 0.2;
      this.recoil.y = Math.max(this.recoil.y, -68);

      var spreadMul = this.effects.volley > 0 ? 0.4 : 1;
      var bonus = this.perfectShots > 0 ? (1 + PERFECT_BONUS) : 1;
      if (this.perfectShots > 0) this.perfectShots--;

      var ax = this.aim.x + this.recoil.x;
      var ay = this.aim.y + this.recoil.y;
      var hitAny = false;
      for (var p = 0; p < w.pellets; p++) {
        var sx = ax + (this.rand() - 0.5) * w.spread * 2 * spreadMul;
        var sy = ay + (this.rand() - 0.5) * w.spread * 1.4 * spreadMul;
        var dmg = un.stats.damage * bonus * (1 + this.passives.dmg);
        if (this.resolveShot(sx, sy, dmg, un.stats.crit + this.passives.crit, w, un)) hitAny = true;
      }
      this.muzzleAt(un, ax, ay);
      this.spawnTracer(un, ax, ay);
      if (w.key !== 'RL' && w.key !== 'GL') {
        this.fxShell.emitParticleAt(un.postX + 8, this.opY(un) - 34, 1);
      }
      AL.kit.audio.sfx(w.kick > 6 ? 'sfx_shot_heavy' : 'sfx_shot', {
        volume: w.kick > 6 ? 0.55 : 0.38,
        rate: 0.92 + this.rand() * 0.16
      });
      if (!hitAny && AL.kit.juice.enabled) AL.kit.juice.shake(w.kick * 0.16, 55);
      if (this.tut && this.tut.step === 0) { this.tut.shots++; if (this.tut.shots > 6) this.tutAdvance(); }
    },

    fireSupport: function (un, idx) {
      var target = this.pickAutoTarget();
      if (!target) return;
      var w = un.stats.weapon;
      var dmg = un.stats.damage * w.pellets * AUTO_FIRE_MUL * (1 + this.passives.dmg);
      var pos = this.enemyScreen(target);
      this.damageEnemy(target, dmg, false, pos.x + (this.rand() - 0.5) * 14, pos.y - 8, un);
      un.muzzleT = 0.05;
      var tr = this.tracers.get();
      if (tr) {
        tr.alive = true; tr.t = 0; tr.life = 0.06;
        var ox = un.postX, oy = this.opY(un) - 30;
        var dx = pos.x - ox, dy = pos.y - oy;
        var len = Math.max(8, Math.hypot(dx, dy));
        tr.spr.setVisible(true).setPosition(ox, oy)
          .setRotation(Math.atan2(dy, dx))
          .setDisplaySize(len, 2.4)
          .setAlpha(0.5)
          .setTint(un.stats.unit.alt);
      }
      if (idx % 2 === 0) AL.kit.audio.sfx('sfx_shot', { volume: 0.13, rate: 1.15 + this.rand() * 0.2 });
    },

    pickAutoTarget: function () {
      var list = this.enemies.list, best = null, bz = 99;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e.alive || e.st === 'dying') continue;
        if (e.z < bz) { bz = e.z; best = e; }
      }
      return best;
    },

    // Hit resolution. Cores are tested first and at a slightly generous
    // radius, because a weak point you cannot reliably hit is not a mechanic.
    resolveShot: function (sx, sy, dmg, crit, w, un) {
      var list = this.enemies.list;
      var hit = null, hitCore = false, bestZ = 99;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e.alive || e.st === 'dying') continue;
        var p = this.enemyScreen(e);
        var bodyR = (D.ENEMIES[e.key] ? D.ENEMIES[e.key].r : (D.BOSSES[e.key] ? D.BOSSES[e.key].r : 16)) * p.sc;
        var bodyY = p.y - bodyR * 0.9;
        var coreHit = false;
        if (this.coresVisible(e)) {
          for (var c = 0; c < e.cores.length; c++) {
            var core = e.cores[c];
            if (core.dead) continue;
            var cxp = p.x + core.x * p.sc, cyp = p.y + core.y * p.sc - bodyR * 0.9;
            var cr = core.r * p.sc * (this.effects.sync > 0 ? 1.7 : 1.25);
            if ((sx - cxp) * (sx - cxp) + (sy - cyp) * (sy - cyp) <= cr * cr) { coreHit = true; break; }
          }
        }
        var inBody = Math.abs(sx - p.x) <= bodyR * 1.05 &&
          Math.abs(sy - bodyY) <= bodyR * 1.25;
        if (coreHit || inBody) {
          if (e.z < bestZ) { bestZ = e.z; hit = e; hitCore = coreHit; }
        }
      }
      if (!hit) {
        // a clean miss still reads: dust puff on the ground line
        if (sy > this.groundY - 30 && this.rand() < 0.5) {
          this.fxSmoke.emitParticleAt(sx, Math.min(sy, this.groundY), 1);
        }
        return false;
      }
      var p2 = this.enemyScreen(hit);
      var isCrit = hitCore;
      var out = dmg;
      if (isCrit) out = dmg * crit;
      else out = Math.max(dmg * 0.12, dmg - hit.armor);
      if (w.splash) {
        this.splashDamage(sx, sy, w.splash * (1 + this.passives.splash), w.splashDmg * (out / Math.max(1, dmg)), hit);
      }
      this.damageEnemy(hit, out, isCrit, sx, sy, un);
      if (isCrit && this.tut && this.tut.step === 3) this.tutAdvance();
      if (w.pierce) {
        // the railgun keeps going: everything behind the first target on the
        // same lane takes a reduced hit
        for (var k = 0; k < list.length; k++) {
          var e2 = list[k];
          if (!e2.alive || e2 === hit || e2.st === 'dying') continue;
          var q = this.enemyScreen(e2);
          if (Math.abs(q.x - p2.x) < 40 && e2.z > hit.z) {
            this.damageEnemy(e2, out * 0.55, false, q.x, q.y - 12, un);
          }
        }
      }
      return true;
    },

    splashDamage: function (x, y, r, dmg, skip) {
      var list = this.enemies.list;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e.alive || e === skip || e.st === 'dying') continue;
        var p = this.enemyScreen(e);
        var d = Math.hypot(p.x - x, p.y - y - 12);
        if (d < r) this.damageEnemy(e, dmg * (1 - d / r), false, p.x, p.y - 12, null);
      }
      this.popRing(x, y, 8, r, AL.PAL.amber, 0.3);
      this.fxSmoke.emitParticleAt(x, y, 3);
    },

    damageEnemy: function (e, dmg, isCrit, x, y, un) {
      if (!e.alive || e.st === 'dying') return;
      dmg = Math.max(1, dmg);
      e.hp -= dmg;
      e.hurtT = 0.075;
      e.stagBuild += dmg / e.maxHp * (1 + this.passives.stagger) * 100;
      if (e.stagBuild > 34 && !e.boss) { e.stagBuild = 0; e.stagT = 0.55; }
      if (e.boss && e.stagBuild > 60) { e.stagBuild = 0; e.stagT = 0.9; }

      this.score += Math.round(dmg * 0.12);
      var owner = un || this.units[this.leadIdx];
      this.chargeGauge(owner, dmg);

      if (isCrit) {
        this.crits++;
        this.fxCrit.emitParticleAt(x, y, 9);
        this.popNumber(x, y, Math.round(dmg), true);
        AL.kit.audio.sfx('sfx_crit', { volume: 0.5, rate: 0.95 + this.rand() * 0.14 });
        if (AL.kit.juice.enabled) { AL.kit.juice.hitStop(38); AL.kit.juice.shake(3.4, 110); }
        this.popRing(x, y, 6, 42, AL.PAL.gold, 0.26);
      } else {
        this.fxSpark.emitParticleAt(x, y, 3);
        if (this.rand() < 0.34) this.popNumber(x, y, Math.round(dmg), false);
        if (this.rand() < 0.3) AL.kit.audio.sfx('sfx_hit', { volume: 0.22, rate: 0.9 + this.rand() * 0.3 });
      }
      if (e.hp <= 0) this.killEnemy(e, x, y);
    },

    killEnemy: function (e, x, y) {
      e.st = 'dying';
      e.dieT = 0.34;
      this.kills++;
      this.score += e.score;
      var p = this.enemyScreen(e);
      this.fxDebris.emitParticleAt(p.x, p.y - 14, e.boss ? 24 : 8);
      this.fxCrit.emitParticleAt(p.x, p.y - 16, e.boss ? 20 : 6);
      this.fxSmoke.emitParticleAt(p.x, p.y - 10, e.boss ? 8 : 2);
      this.popRing(p.x, p.y - 14, 10, e.boss ? 180 : 56, e.boss ? AL.PAL.gold : AL.PAL.amber, e.boss ? 0.7 : 0.32);
      if (e.boss) {
        AL.kit.audio.sfx('sfx_boss_kill', { volume: 1.0 });
        if (AL.kit.juice.enabled) { AL.kit.juice.shake(11, 460); AL.kit.juice.hitStop(120); }
        this.flashScreen(0.5);
      } else {
        AL.kit.audio.sfx('sfx_kill', { volume: e.elite ? 0.7 : 0.34, rate: e.elite ? 0.85 : 1.05 });
        if (AL.kit.juice.enabled) { AL.kit.juice.shake(e.elite ? 5 : 2.2, e.elite ? 180 : 80); AL.kit.juice.hitStop(e.elite ? 46 : 22); }
      }
      this.popNumber(p.x, p.y - 30, e.score, e.elite);
    },

    chargeGauge: function (un, dmg) {
      if (!un) return;
      var mul = (1 + this.passives.gauge) * (this.mod.surge ? 2 : 1);
      un.gauge = Math.min(un.cost, un.gauge + dmg * GAUGE_PER_DAMAGE * mul);
      for (var i = 0; i < this.units.length; i++) {
        if (this.units[i] === un) continue;
        this.units[i].gauge = Math.min(this.units[i].cost,
          this.units[i].gauge + dmg * GAUGE_PER_DAMAGE * 0.22 * mul);
      }
    },

    stepGauges: function (dt) {
      var mul = (1 + this.passives.gauge) * (this.mod.surge ? 2 : 1);
      for (var i = 0; i < this.units.length; i++) {
        var un = this.units[i];
        if (this.phase === 'fight') un.gauge = Math.min(un.cost, un.gauge + GAUGE_TRICKLE * mul * dt);
      }
    },

    // ---------------------------------------------------------- enemies
    stepEnemies: function (dt) {
      var list = this.enemies.list;
      var frozen = this.effects.anchor > 0;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e.alive) continue;
        if (e.hurtT > 0) e.hurtT -= dt;
        if (e.stagT > 0) { e.stagT -= dt; continue; }
        if (e.st === 'dying') {
          e.dieT -= dt;
          if (e.dieT <= 0) { e.alive = false; e.spr.setVisible(false); this.hideCores(e); }
          continue;
        }
        if (frozen) continue;

        if (e.st === 'advance') {
          e.z -= e.speed * dt;
          if (e.z <= e.zStop) { e.z = e.zStop; e.st = 'engage'; e.t = e.cad * 0.5; }
          if (e.charger && e.z <= 0.04) { this.enemyStrike(e, true); continue; }
        } else if (e.st === 'engage') {
          e.t -= dt;
          // chargers keep closing rather than trading fire
          if (e.charger) { e.z = Math.max(0.02, e.z - e.speed * 1.6 * dt); }
          if (e.t <= 0) {
            e.st = 'windup';
            e.wind = e.windMax;
            this.setEnemyFrame(e, 'windup');
            if (e.boss) { e.pattern = (e.pattern + 1) % 4; }
            AL.kit.audio.sfx('sfx_alarm', { volume: e.boss ? 0.55 : 0.16, rate: e.boss ? 0.8 : 1.5 });
          }
        } else if (e.st === 'windup') {
          e.wind -= dt;
          if (e.wind <= 0) {
            this.enemyStrike(e, false);
            e.st = 'engage';
            e.t = e.cad;
            this.setEnemyFrame(e, 'idle');
          }
        }
      }
    },

    enemyStrike: function (e, contact) {
      var dmg = e.dmg;
      if (contact) {
        this.hitCover(dmg * 1.5, e);
        this.killEnemy(e, this.cx, this.coverTop);
        return;
      }
      if (e.ranged) {
        var n = e.boss ? (e.pattern === 1 ? 3 : 2) : 1;
        for (var i = 0; i < n; i++) this.spawnEnemyShot(e, dmg / n * (e.boss ? 1.4 : 1), i);
      } else {
        this.spawnEnemyShot(e, dmg, 0);
      }
      if (e.boss && e.pattern === 3) {
        // the summon pattern adds pressure instead of damage
        var mix = this.plan.mix && this.plan.mix.length ? this.plan.mix : ['crawler'];
        if (this.aliveCount() < MAX_ALIVE - 2) {
          this.spawnEnemy(mix[Math.floor(this.rand() * mix.length) % mix.length] || 'crawler');
        }
      }
    },

    spawnEnemyShot: function (e, dmg, idx) {
      var s = this.shots.get();
      if (!s) return;
      var p = this.enemyScreen(e);
      s.alive = true;
      s.sx = p.x + (idx - 0.5) * 18;
      s.sy = p.y - 22 * p.sc;
      s.tx = this.cx + (this.rand() - 0.5) * this.W * 0.5;
      s.ty = this.coverTop + 6;
      s.t = 0;
      s.dur = 0.62 + e.z * 0.5;
      s.dmg = dmg;
      s.arc = e.arcing ? 70 + this.rand() * 40 : 0;
      s.owner = e;
      s.spr.setVisible(true)
        .setDisplaySize(e.boss ? 26 : 16, e.boss ? 26 : 16)
        .setTint(e.boss ? 0xffd07a : this.ch.fog);
    },

    stepShots: function (dt) {
      var list = this.shots.list;
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (!s.alive) continue;
        s.t += dt / s.dur;
        if (s.t >= 1) {
          s.alive = false;
          s.spr.setVisible(false);
          if (this.effects.anchor > 0 && s.owner && s.owner.alive) {
            // Aegis Anchor reflects the volley back at its owner
            var q = this.enemyScreen(s.owner);
            this.damageEnemy(s.owner, s.dmg * 8, true, q.x, q.y - 14, this.units[this.leadIdx]);
          } else {
            this.hitCover(s.dmg, s.owner);
          }
          this.fxSpark.emitParticleAt(s.tx, s.ty, 4);
          continue;
        }
        var t = s.t;
        s.x = s.sx + (s.tx - s.sx) * t;
        s.y = s.sy + (s.ty - s.sy) * t - Math.sin(t * Math.PI) * s.arc;
        s.spr.setPosition(s.x, s.y).setAlpha(0.9);
      }
    },

    hitCover: function (dmg, from) {
      if (this.phase !== 'fight') return;
      var mit = this.risen > 0.5 ? 1 : DUCK_MITIGATE;
      var out = dmg * mit * (1 - Math.min(0.6, this.passives.armor));
      if (this.effects.screen > 0) out *= 0.2;
      if (this.mod.brittle) out *= 1.4;
      out = Math.max(0.5, out);
      this.integrity -= out;
      this.damageTaken += out;
      this.hurtT = 0.34;
      this.duckedT = 0;
      AL.kit.audio.sfx('sfx_hurt', { volume: Math.min(0.9, 0.3 + out / 30) });
      if (AL.kit.juice.enabled) AL.kit.juice.shake(Math.min(9, 2 + out * 0.22), 150);
      this.fxDebris.emitParticleAt(this.cx + (this.rand() - 0.5) * this.W * 0.4, this.coverTop + 4, 4);
      if (this.integrity <= 0) { this.integrity = 0; this.loseStage(); }
    },

    coresVisible: function (e) {
      if (!this.mod.blackout) {
        if (e.key === 'shielder' && !e.boss) return e.st === 'windup' || e.stagT > 0;
        return true;
      }
      return e.stagT > 0 || this.effects.sync > 0;
    },

    hideCores: function (e) {
      for (var i = 0; i < e.coreImgs.length; i++) e.coreImgs[i].setVisible(false);
      if (e.ring) e.ring.setVisible(false);
    },

    // -------------------------------------------------------- wave state
    stepWaveState: function (dt) {
      if (this.phase !== 'fight') return;
      if (this.spawnQueue.length) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.spawnTimer = 0.42 + this.rand() * 0.5;
          this.spawnFromQueue();
        }
        return;
      }
      if (this.aliveCount() > 0) return;
      this.waveTimer += dt;
      if (this.waveTimer < WAVE_GAP) return;
      this.waveTimer = 0;
      if (this.waveIdx >= this.plan.waves) this.winStage();
      else this.startWave();
    },

    // -------------------------------------------------------- portraits
    hitPortrait: function (tap) {
      for (var i = 0; i < this.units.length; i++) {
        var r = this.portraitRect(i);
        if (tap.x >= r.x && tap.x <= r.x + r.w && tap.y >= r.y && tap.y <= r.y + r.h) {
          this.usePortrait(i);
          return true;
        }
      }
      return false;
    },

    // A portrait tap fires the burst when the gauge is full, and otherwise
    // takes point with that unit. One control, two readable outcomes.
    usePortrait: function (i) {
      var un = this.units[i];
      if (!un || this.phase !== 'fight') return;
      if (un.gauge >= un.cost) { this.fireBurst(i); return; }
      if (i === this.leadIdx) return;
      this.leadIdx = i;
      AL.save.lead = un.id;
      AL.persist();
      this.recoil.x = 0; this.recoil.y = 0;
      AL.kit.audio.sfx('sfx_confirm', { volume: 0.5 });
      this.toast.push(un.stats.unit.name + ' ON POINT', 'ic_flag', un.stats.unit.color);
    },

    fireBurst: function (i) {
      var un = this.units[i];
      var u = un.stats.unit;
      un.gauge = 0;
      this.cutin.t = 0.85;
      this.cutin.id = u.id;
      this.cutin.name = u.burst.short;
      AL.kit.audio.sfx('sfx_burst', { volume: 0.9 });
      if (AL.kit.juice.enabled) { AL.kit.juice.shake(6, 220); AL.kit.juice.hitStop(60); }
      this.flashScreen(0.28);

      var list = this.enemies.list, k, e, p;
      if (u.id === 'venn') {
        this.effects.volley = u.burst.dur;
      } else if (u.id === 'ossa') {
        this.effects.screen = u.burst.dur;
        this.popRing(this.cx, this.coverTop, 40, this.W * 0.7, AL.PAL.green, 0.6);
      } else if (u.id === 'kite') {
        // rail lance: everything near the aim column, cores auto crit
        for (k = 0; k < list.length; k++) {
          e = list[k];
          if (!e.alive || e.st === 'dying') continue;
          p = this.enemyScreen(e);
          if (Math.abs(p.x - this.aim.x) < 74) {
            this.damageEnemy(e, un.stats.damage * un.stats.crit * 4.2, true, p.x, p.y - 16, un);
          }
        }
        this.popRing(this.aim.x, this.aim.y, 10, 120, AL.PAL.cyan, 0.5);
        this.fxCrit.emitParticleAt(this.aim.x, this.aim.y, 22);
      } else if (u.id === 'rook') {
        this.effects.shatter = 0.5;
        for (k = 0; k < list.length; k++) {
          e = list[k];
          if (!e.alive || e.st === 'dying') continue;
          p = this.enemyScreen(e);
          this.damageEnemy(e, un.stats.damage * 3.0, false, p.x, p.y - 14, un);
          e.z = Math.min(1.2, e.z + 0.30);
          e.stagT = 1.1;
          e.st = 'advance';
          this.setEnemyFrame(e, 'idle');
        }
        this.popRing(this.cx, this.coverTop - 10, 30, this.W, AL.PAL.cyan, 0.55);
      } else if (u.id === 'hush') {
        this.integrity = Math.min(this.maxIntegrity, this.integrity + this.maxIntegrity * 0.28);
        this.effects.suture = u.burst.dur;
        AL.kit.audio.sfx('sfx_shield', { volume: 0.8 });
        this.popRing(this.cx, this.coverTop + 10, 20, this.W * 0.6, AL.PAL.green, 0.55);
      } else if (u.id === 'nova') {
        // five rockets onto the densest cluster
        var best = null, bestN = -1;
        for (k = 0; k < list.length; k++) {
          e = list[k];
          if (!e.alive || e.st === 'dying') continue;
          p = this.enemyScreen(e);
          var n = 0;
          for (var m = 0; m < list.length; m++) {
            var o = list[m];
            if (!o.alive || o.st === 'dying') continue;
            var q = this.enemyScreen(o);
            if (Math.hypot(q.x - p.x, q.y - p.y) < 110) n++;
          }
          if (n > bestN) { bestN = n; best = p; }
        }
        var tx = best ? best.x : this.aim.x, ty = best ? best.y : this.aim.y;
        for (var r = 0; r < 5; r++) {
          this.splashDamage(tx + (this.rand() - 0.5) * 130, ty + (this.rand() - 0.5) * 70,
            96, un.stats.damage * 1.6, null);
        }
        this.fxDebris.emitParticleAt(tx, ty, 18);
      } else if (u.id === 'wren') {
        this.effects.sync = u.burst.dur;
        this.popRing(this.cx, (this.fieldTop + this.groundY) / 2, 30, this.W, AL.PAL.cyan, 0.6);
      } else {
        this.effects.anchor = u.burst.dur;
        this.popRing(this.cx, this.coverTop, 24, this.W * 0.8, AL.PAL.amber, 0.6);
      }
      if (this.tut && this.tut.step === 5) this.tutAdvance();
    },

    // ---------------------------------------------------------- helpers
    enemyScreen: function (e) {
      var z = clamp(e.z, 0, 1.3);
      var f = 1 - clamp(z, 0, 1);
      // the line walks the ground plane, which starts 38 percent down the
      // field, never the sky above it
      var top = this.horizonY + (this.groundY - this.horizonY) * 0.38;
      var y = top + (this.groundY - top) * f;
      var spread = 0.30 + 0.44 * f;
      var x = this.cx + e.lane * this.W * spread * 0.5;
      var sc = (0.42 + 0.62 * f) * (e.boss ? 1.5 : 1);
      if (e.stagT > 0) x += Math.sin(this.vclock * 60) * 2.4;
      return { x: x, y: y, sc: sc };
    },

    opY: function (un) {
      return this.duckY + (this.standY - this.duckY) * this.risen;
    },

    muzzleAt: function (un, ax, ay) {
      un.muzzleT = 0.055;
      var ox = un.postX, oy = this.opY(un) - 32;
      un.muzzle.setPosition(ox + 12, oy)
        .setRotation(Math.atan2(ay - oy, ax - ox))
        .setDisplaySize(34 + this.rand() * 10, 20)
        .setVisible(true).setAlpha(0.95);
      this.fxMuzzleSmoke.emitParticleAt(ox + 16, oy, 2);
    },

    spawnTracer: function (un, ax, ay) {
      var tr = this.tracers.get();
      if (!tr) return;
      var ox = un.postX, oy = this.opY(un) - 32;
      var dx = ax - ox, dy = ay - oy;
      var len = Math.max(10, Math.hypot(dx, dy));
      tr.alive = true; tr.t = 0; tr.life = 0.075;
      tr.spr.setVisible(true).setPosition(ox, oy)
        .setRotation(Math.atan2(dy, dx))
        .setDisplaySize(len, 3.4)
        .setAlpha(0.95)
        .setTint(un.stats.unit.alt);
    },

    popNumber: function (x, y, n, big) {
      var p = this.pops.get();
      if (!p) return;
      p.alive = true; p.t = 0; p.life = big ? 0.72 : 0.5;
      p.x = x + (this.rand() - 0.5) * 12; p.y = y;
      p.vy = big ? -64 : -46;
      AL.setTxt(p.txt, String(n));
      p.txt.setFontSize(big ? 19 : 15);
      AL.setCol(p.txt, big ? AL.CSS.gold : AL.CSS.white);
      p.txt.setVisible(true).setPosition(p.x, p.y).setAlpha(1).setScale(big ? 1.15 : 1);
    },

    popRing: function (x, y, r0, r1, tint, life) {
      var r = this.rings.get();
      if (!r) return;
      r.alive = true; r.t = 0; r.life = life || 0.3;
      r.x = x; r.y = y; r.r0 = r0; r.r1 = r1; r.tint = tint;
      r.spr.setVisible(true).setPosition(x, y).setTint(tint);
    },

    flashScreen: function (a) {
      var v = !AL.kit.juice.enabled ? Math.min(0.14, a * 0.3)
        : (AL.reducedMotion ? Math.min(0.16, a * 0.4) : a);
      this.flash.setVisible(true).setAlpha(v);
    },

    syncState: function () {
      var s = AL.state;
      var lead = this.units[this.leadIdx];
      s.ready = true;
      s.mode = this.mode;
      s.phase = this.phase;
      s.chapter = D.CHAPTERS.indexOf(this.ch);
      s.chapterName = this.ch.name;
      s.stage = this.mode === 'campaign' ? this.index + 1 : 0;
      s.stageName = this.plan.name;
      s.floor = this.mode === 'tower' ? this.index + 1 : 0;
      s.score = Math.round(this.score);
      s.integrity = Math.round(this.integrity);
      s.maxIntegrity = this.maxIntegrity;
      s.enemiesAlive = this.aliveCount();
      s.popped = this.risen > 0.5;
      s.tutorialStep = this.tut ? this.tut.step : -1;
      if (lead) {
        s.ammo = lead.ammo;
        s.mag = lead.mag;
        s.reloading = lead.reloading;
        s.leadId = lead.id;
        s.leadWeapon = lead.stats.weapon.key;
      }
      s.bossHp = this.bossRec && this.bossRec.alive ? Math.round(this.bossRec.hp) : 0;
      s.bossMaxHp = this.bossRec ? this.bossRec.maxHp : 0;
      for (var i = 0; i < s.bursts.length; i++) {
        var un = this.units[i];
        s.bursts[i].id = un ? un.id : '';
        s.bursts[i].gauge = un ? Math.round(un.gauge / un.cost * 100) / 100 : 0;
        s.bursts[i].ready = un ? un.gauge >= un.cost : false;
      }
    },

    // -------------------------------------------------------- tutorial
    stepTutorial: function (dt) {
      var t = this.tut;
      if (t.done) return;
      t.t += dt;
      if (t.step === 1) {
        t.aimed += Math.abs(this.aimTarget.x - this.aim.x) + Math.abs(this.aimTarget.y - this.aim.y);
        if (t.aimed > 90) this.tutAdvance();
      } else if (t.step === 2) {
        if (this.duckedT > 1.4) this.tutAdvance();
      }
    },

    tutAdvance: function () {
      var t = this.tut;
      if (!t || t.done) return;
      t.step++;
      t.t = 0;
      t.shots = 0;
      t.aimed = 0;
      AL.kit.audio.sfx('sfx_confirm', { volume: 0.4 });
      if (t.step > 5) {
        t.done = true;
        AL.save.tutorial = true;
        AL.persist();
      }
    }
  };

  root.ALPlay = PlayScene;
})(typeof window !== 'undefined' ? window : globalThis);
