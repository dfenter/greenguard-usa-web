/* Carnival Reels - AAA rebuild. Phaser 3 + GGKit.
   A five machine carnival slots parlour with posted maths on every machine,
   no purchases anywhere, and a coin balance that always comes back free. */
(function (root) {
  'use strict';

  var Phaser = root.Phaser;
  var M = root.CR_MACHINES;
  var ART = root.CR_ART;
  var META = root.CR_META;
  var PAL = ART.PAL, THEME = ART.THEME, GEO = ART.GEO, FONT = ART.FONT;

  var VW = 720;                 // virtual design width
  var STEP = 1 / 60, MAX_STEPS = 4;
  var MAX_PARTS = 132;
  var SIM_CHUNK = 2500;         // monte carlo spins analysed per loading tick

  var AUDIO = {
    mus_menu: 'assets/mus_menu.mp3', mus_parlour: 'assets/mus_parlour.mp3',
    mus_feature: 'assets/mus_feature.mp3', mus_finale: 'assets/mus_finale.mp3',
    tap: 'assets/sfx_tap.mp3', spin_start: 'assets/sfx_spin_start.mp3',
    reel_stop: 'assets/sfx_reel_stop.mp3', near_miss: 'assets/sfx_near_miss.mp3',
    win_small: 'assets/sfx_win_small.mp3', win_mid: 'assets/sfx_win_mid.mp3',
    win_big: 'assets/sfx_win_big.mp3', coin_lock: 'assets/sfx_coin_lock.mp3',
    cascade_pop: 'assets/sfx_cascade_pop.mp3', wheel_tick: 'assets/sfx_wheel_tick.mp3',
    wheel_stop: 'assets/sfx_wheel_stop.mp3', level_up: 'assets/sfx_level_up.mp3',
    collect: 'assets/sfx_collect.mp3', denied: 'assets/sfx_denied.mp3',
    toss: 'assets/sfx_toss.mp3', fanfare: 'assets/sfx_fanfare.mp3'
  };
  var SFX_KEYS = ['tap', 'spin_start', 'reel_stop', 'near_miss', 'win_small', 'win_mid',
    'win_big', 'coin_lock', 'cascade_pop', 'wheel_tick', 'wheel_stop', 'level_up',
    'collect', 'denied', 'toss', 'fanfare'];

  var WIN_TIERS = [
    { at: 0, name: '', sfx: null, shake: 0, banner: null },
    { at: 0.01, name: 'WIN', sfx: 'win_small', shake: 0, banner: null },
    { at: 2, name: 'NICE WIN', sfx: 'win_small', shake: 2, banner: null },
    { at: 10, name: 'BIG WIN', sfx: 'win_mid', shake: 4, banner: 'BIG WIN' },
    { at: 25, name: 'MEGA WIN', sfx: 'win_big', shake: 7, banner: 'MEGA WIN' },
    { at: 75, name: 'CARNIVAL WIN', sfx: 'fanfare', shake: 10, banner: 'CARNIVAL WIN' }
  ];

  /* ------------------------------------------------------------- helpers -- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function nf(n) {
    n = Math.round(n);
    var s = String(Math.abs(n)), out = '', c = 0, i;
    for (i = s.length - 1; i >= 0; i--) { out = s.charAt(i) + out; if (++c % 3 === 0 && i > 0) out = ',' + out; }
    return (n < 0 ? '-' : '') + out;
  }
  function pct(p, d) { return (p * 100).toFixed(d == null ? 2 : d) + '%'; }
  function oneIn(p) { return p > 0 ? '1 in ' + nf(Math.round(1 / p)) : 'never'; }
  // Number.toString already drops trailing zeros, so rounding to a sensible
  // number of places is all the formatting a multiplier needs.
  function xs(v) {
    if (v >= 100) return Math.round(v) + 'x';
    if (v >= 10) return (Math.round(v * 10) / 10) + 'x';
    if (v >= 1) return (Math.round(v * 100) / 100) + 'x';
    return (Math.round(v * 1000) / 1000) + 'x';
  }
  function easeOutBack(t) { var c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function setT(node, v) { if (node && node.text !== String(v)) node.setText(String(v)); }
  function setC(node, c) { if (node && node._crCol !== c) { node.setColor(c); node._crCol = c; } }
  function setV(node, v) { if (node && node.visible !== v) node.setVisible(v); }
  function texOr(scene, key, fb) { return scene.textures.exists(key) ? key : fb; }

  /* ---------------------------------------------------------------- save -- */
  var save = META.fresh();
  var Game = { phaser: null, play: null };

  var kit = root.GGKit.create({
    slug: 'carnival-reels', orientation: 'portrait',
    validateSave: META.validate,
    onPause: function () { if (Game.play) Game.play.onPaused(); },
    onResume: function () { if (Game.play) Game.play.onResumed(); },
    onRestart: function () { if (Game.play) Game.play.goTitle(); }
  });
  save = META.coerce(kit.save.get(null));
  kit.audio.register(AUDIO);

  // Reduced motion: if the device asks for it and the player has not made a
  // choice yet, start with the GGKit juice toggle off. The settings row still
  // owns the preference from then on.
  (function () {
    try {
      if (!root.matchMedia || !root.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (localStorage.getItem('gg-carnival-reels-ui') != null) return;
    } catch (e) { return; }
    kit.juice.enabled = false;
  })();
  function persist() { kit.save.set(save); }

  /* ---------------------------------------------------- verification hook -- */
  var hook = {
    mode: 'boot', stage: 0, machine: META.MACHINE_IDS[0], progress: 0,
    score: save.bank, health: 1, coins: save.bank, bet: META.BETS[save.betIdx],
    spinning: false, feature: '', unlocked: save.unlocked, rush: save.rush, ready: false
  };
  var cr = root.__cr = root.__cr || {};
  cr.state = hook;
  cr.forceMode = function (m) { if (Game.play) Game.play.forceMode(m); return hook.mode; };
  cr.forceStage = function (i) { if (Game.play) Game.play.forceStage(i); return hook.stage; };
  cr.spin = function () { if (Game.play) Game.play.trySpin(); return hook.spinning; };
  // Test switch only: makes the NEXT spin re-roll until it lands the named
  // feature. The shipped odds are untouched; nothing in the game calls this.
  cr.forceFeature = function (kind) {
    if (!Game.play) return false;
    Game.play.forceFeat = kind || null;
    Game.play.trySpin();
    return hook.spinning;
  };

  function query(name) {
    if (typeof location === 'undefined' || !location.search) return null;
    var m = new RegExp('[?&]' + name + '=([^&]+)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  // Test switches must be readable from the boot fallback AND the live scene.
  var BOOT_MODE = query('mode');
  var BOOT_STAGE = parseInt(query('stage'), 10);
  if (isFinite(BOOT_STAGE)) hook.stage = clamp(BOOT_STAGE, 0, META.MACHINE_IDS.length - 1);

  /* ------------------------------------------------------------ analysis -- */
  // Posted maths. Exact machines are enumerated; the rest are simulated in
  // chunks during the loading screen so the progress bar tracks real work.
  var analysis = {};
  function analysisJobs() {
    var jobs = [];
    M.MACHINES.forEach(function (m) {
      var an = new M.Analysis(!!m.exact);
      analysis[m.id] = an;
      if (m.exact && m.enumerate) {
        jobs.push(function () { m.enumerate(an); });
      } else {
        var chunks = Math.ceil(m.simTarget / SIM_CHUNK);
        for (var c = 0; c < chunks; c++) {
          jobs.push(function () {
            for (var i = 0; i < SIM_CHUNK; i++) an.add(m.spin(true), 1);
          });
        }
        jobs.push(function () { an.done = true; });
      }
    });
    var wan = new M.Analysis(true);
    analysis.wheel = wan;
    jobs.push(function () { M.D.enumerateWheel(wan); });
    return jobs;
  }

  /* ----------------------------------------------------------- boot scene -- */
  var BootScene = {
    key: 'boot',
    create: function () {
      kit.loader.show('CARNIVAL REELS');
      var self = this;
      this.jobs = ART.buildJobs(this, M.MACHINES).concat(analysisJobs());
      this.jobs.push(function () { /* audio decode is awaited below */ });
      this.done = 0;
      this.audioReady = false;
      kit.audio.preload(SFX_KEYS).then(function () { self.audioReady = true; });
    },
    update: function () {
      if (!this.jobs) return;
      var budget = 3;
      while (budget-- > 0 && this.done < this.jobs.length) {
        this.jobs[this.done++]();
      }
      var frac = this.done / this.jobs.length;
      kit.loader.progress(frac * 0.92 + (this.audioReady ? 0.08 : 0));
      if (this.done >= this.jobs.length && this.audioReady) {
        this.jobs = null;
        kit.loader.progress(1);
        kit.loader.hide();
        this.scene.start('play');
      }
    }
  };

  /* ----------------------------------------------------------- play scene -- */
  var PlayScene = { key: 'play' };

  PlayScene.create = function () {
    Game.play = this;
    this.t = 0; this.acc = 0;
    this.mode = 'title';
    this.mi = clamp(save.machine, 0, save.unlocked - 1);
    this.machine = M.MACHINES[this.mi];
    this.spinState = 'idle';
    this.res = null; this.win = 0; this.winShown = 0; this.winTier = 0;
    this.fx = null;
    this.session = { spins: 0, wagered: 0, won: 0, peak: save.bank, low: save.bank, hits: 0 };
    this.toastQ = [];
    this.toast = null; this.toastT = 0;
    this.coach = ''; this.coachT = 0;
    this.banner = null; this.bannerT = 0;
    this.pendingBanner = null;
    this.sheetScroll = 0; this.sheetMax = 0; this.dragging = false;
    this.audioStarted = false;
    this.lastMusic = '';
    this.pipState = 'idle'; this.pipT = 0;
    this.skill = null;
    this.autoHold = 0;

    this.root = this.add.container(0, 0);
    this.layerBg = this.add.container(0, 0); this.root.add(this.layerBg);
    this.layerMachine = this.add.container(0, 0); this.root.add(this.layerMachine);
    this.layerFx = this.add.container(0, 0); this.root.add(this.layerFx);
    this.layerHud = this.add.container(0, 0); this.root.add(this.layerHud);
    this.layerSheet = this.add.container(0, 0); this.root.add(this.layerSheet);
    this.layerTop = this.add.container(0, 0); this.root.add(this.layerTop);

    this.buildBackdrop();
    this.buildMachine();
    this.buildParticles();
    this.buildHud();
    this.buildSheet();
    this.buildTop();

    this.hits = [];   // {x,y,w,h,id} rebuilt on layout
    this.keyQ = [];
    var self = this;
    // Window level listener registered AFTER GGKit init so the kit never
    // overwrites a claim made here.
    this.onKey = function (e) {
      if (kit.paused) return;
      self.keyQ.push(e.code);
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') e.preventDefault();
    };
    root.addEventListener('keydown', this.onKey);
    this.events.once('shutdown', function () { root.removeEventListener('keydown', self.onKey); });

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.scale.on('resize', this.layout, this);

    this.layout();
    this.setMode(BOOT_MODE === 'play' ? 'play' : 'title', true);
    if (BOOT_MODE === 'play' && isFinite(BOOT_STAGE)) this.forceStage(BOOT_STAGE);
    hook.ready = true;
  };

  /* ------------------------------------------------------------- backdrop -- */
  PlayScene.buildBackdrop = function () {
    this.bdImgs = {};
    var self = this;
    META.MACHINE_IDS.forEach(function (id) {
      var img = self.add.image(0, 0, texOr(self, 'bd_' + id, 'p_dot')).setOrigin(0.5, 0.5);
      img.setVisible(false);
      self.layerBg.add(img);
      self.bdImgs[id] = img;
    });
    this.bokeh = [];
    for (var i = 0; i < 12; i++) {
      var b = this.add.image(0, 0, 'glow_soft').setOrigin(0.5);
      b.setBlendMode(Phaser.BlendModes.ADD);
      this.layerBg.add(b);
      this.bokeh.push({
        img: b, x: Math.random(), y: Math.random(), vy: -0.008 - Math.random() * 0.016,
        vx: (Math.random() - 0.5) * 0.006, s: 0.18 + Math.random() * 0.42, a: 0.05 + Math.random() * 0.14,
        ph: Math.random() * 6.283
      });
    }
    this.vignette = this.add.image(0, 0, 'p_dot').setOrigin(0.5).setVisible(false);
    this.layerBg.add(this.vignette);
  };

  /* -------------------------------------------------------------- machine -- */
  PlayScene.buildMachine = function () {
    this.cab = this.add.image(0, 0, texOr(this, 'cab_orchard', 'p_dot')).setOrigin(0.5, 0);
    this.layerMachine.add(this.cab);

    this.reelCons = [];
    this.reelImgs = [];
    this.reels = [];
    var maxCols = 5, maxRows = 5, c, r;
    for (c = 0; c < maxCols; c++) {
      var con = this.add.container(0, 0);
      this.layerMachine.add(con);
      var imgs = [];
      for (r = 0; r < maxRows + 2; r++) {
        var im = this.add.image(0, 0, 'p_dot').setOrigin(0.5);
        im.setVisible(false);
        con.add(im);
        imgs.push(im);
      }
      this.reelCons.push(con);
      this.reelImgs.push(imgs);
      this.reels.push({
        pos: (Math.random() * 997) | 0, vel: 0, state: 'idle', from: 0, to: 0, t: 0, dur: 1,
        stopAt: 0, anticipate: false, len: 1, glow: 0, lastIdx: []
      });
    }
    // cascade grid (own images so gravity is per cell)
    this.gridImgs = [];
    for (var i = 0; i < 25; i++) {
      var g = this.add.image(0, 0, 'p_dot').setOrigin(0.5);
      g.setVisible(false);
      this.layerMachine.add(g);
      this.gridImgs.push({ img: g, x: 0, y: 0, ty: 0, vy: 0, sc: 1, tier: 0, popping: 0, falling: 0 });
    }
    // hold and spin coin value labels
    this.coinTx = [];
    for (var k = 0; k < 5; k++) {
      var tx = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '32px', color: PAL.ink, fontStyle: '800', resolution: 2 }).setOrigin(0.5);
      tx.setStroke('#2a1145', 7);
      tx.setVisible(false);
      this.layerMachine.add(tx);
      this.coinTx.push(tx);
    }
    // win line / cell highlight frames
    this.marks = [];
    for (var mI = 0; mI < 25; mI++) {
      var mk = this.add.image(0, 0, 'p_ring').setOrigin(0.5);
      mk.setVisible(false); mk.setBlendMode(Phaser.BlendModes.ADD);
      this.layerMachine.add(mk);
      this.marks.push(mk);
    }
    // Pip the barker
    this.pip = this.add.container(0, 0);
    this.pipArmL = this.add.image(-34, -110, 'pip_arm').setOrigin(0.5, 0.1);
    this.pipArmR = this.add.image(34, -110, 'pip_arm').setOrigin(0.5, 0.1);
    this.pipCane = this.add.image(46, -98, 'pip_cane').setOrigin(0.5, 0.1);
    this.pipBody = this.add.image(0, -104, 'pip_body').setOrigin(0.5, 0);
    this.pipHead = this.add.image(0, -150, 'pip_head').setOrigin(0.5, 0.5);
    this.pipHat = this.add.image(0, -188, 'pip_hat').setOrigin(0.5, 0.5);
    this.pip.add(this.pipCane); this.pip.add(this.pipArmL); this.pip.add(this.pipBody);
    this.pip.add(this.pipArmR); this.pip.add(this.pipHead); this.pip.add(this.pipHat);
    this.layerMachine.add(this.pip);

    // wheel overlay
    this.wheelCon = this.add.container(0, 0);
    this.wheelFace = this.add.image(0, 0, 'wheel_face').setOrigin(0.5);
    this.wheelHub = this.add.image(0, 0, 'wheel_hub').setOrigin(0.5);
    this.wheelPtr = this.add.image(0, 0, 'wheel_ptr').setOrigin(0.5, 1);
    this.wheelCon.add(this.wheelFace); this.wheelCon.add(this.wheelHub); this.wheelCon.add(this.wheelPtr);
    this.wheelCon.setVisible(false);
    this.layerMachine.add(this.wheelCon);

    // pick booth overlay
    this.pickCon = this.add.container(0, 0);
    this.pickBtns = []; this.pickTx = [];
    var p;
    for (p = 0; p < 9; p++) {
      var b = this.add.image(0, 0, 'btn_pick').setOrigin(0.5);
      this.pickCon.add(b);
      this.pickBtns.push(b);
    }
    for (p = 0; p < 9; p++) {
      var t2 = this.add.text(0, 0, '?', { fontFamily: FONT, fontSize: '40px', color: PAL.ink, fontStyle: '800', resolution: 2 }).setOrigin(0.5);
      t2.setStroke('#1a0a2c', 6);
      this.pickCon.add(t2);
      this.pickTx.push(t2);
    }
    this.pickCon.setVisible(false);
    this.layerMachine.add(this.pickCon);

    // curtain wipe used for feature transitions
    this.curtain = this.add.image(0, 0, 'p_dot').setOrigin(0.5).setVisible(false);
    this.curtain.setTint(0x1a0a2c);
    this.layerMachine.add(this.curtain);
  };

  /* ------------------------------------------------------------ particles -- */
  PlayScene.buildParticles = function () {
    this.parts = [];
    for (var i = 0; i < MAX_PARTS; i++) {
      var im = this.add.image(0, 0, 'p_dot').setOrigin(0.5);
      im.setVisible(false);
      this.layerFx.add(im);
      this.parts.push({
        img: im, on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1,
        s0: 1, s1: 1, rot: 0, spin: 0, a0: 1, kind: 'spark'
      });
    }
    this.partIdx = 0;
  };
  PlayScene.emit = function (kind, x, y, n, opt) {
    opt = opt || {};
    var tex = kind === 'confetti' ? 'p_conf' : kind === 'coin' ? 'p_coin' :
      kind === 'ring' ? 'p_ring' : kind === 'star' ? 'p_star' :
        kind === 'puff' ? 'p_puff' : kind === 'spark' ? 'p_spark' : 'p_dot';
    var budget = kit.juice.enabled ? n : Math.ceil(n * 0.35);
    for (var i = 0; i < budget; i++) {
      var p = null, guard = 0;
      while (guard++ < MAX_PARTS) {
        var cand = this.parts[this.partIdx = (this.partIdx + 1) % MAX_PARTS];
        if (!cand.on) { p = cand; break; }
      }
      if (!p) p = this.parts[this.partIdx];
      var ang = opt.ang != null ? opt.ang + (Math.random() - 0.5) * (opt.spread || 6.283) : Math.random() * 6.283;
      var spd = (opt.spd || 180) * (0.5 + Math.random());
      p.on = true; p.x = x + (Math.random() - 0.5) * (opt.jitter || 8);
      p.y = y + (Math.random() - 0.5) * (opt.jitter || 8);
      p.vx = Math.cos(ang) * spd; p.vy = Math.sin(ang) * spd - (opt.lift || 0);
      p.g = opt.g == null ? 520 : opt.g;
      p.max = p.life = (opt.life || 0.7) * (0.7 + Math.random() * 0.6);
      p.s0 = (opt.s0 || 0.5) * (0.7 + Math.random() * 0.6);
      p.s1 = opt.s1 == null ? 0 : opt.s1;
      p.rot = Math.random() * 6.283; p.spin = (Math.random() - 0.5) * 12;
      p.a0 = opt.alpha == null ? 1 : opt.alpha;
      p.kind = kind;
      p.img.setTexture(tex);
      p.img.setTint(opt.tint == null ? 0xffffff : opt.tint);
      p.img.setBlendMode(kind === 'confetti' || kind === 'coin' ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
      p.img.setVisible(true);
    }
  };
  PlayScene.stepParticles = function (dt) {
    for (var i = 0; i < MAX_PARTS; i++) {
      var p = this.parts[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; p.img.setVisible(false); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      var f = 1 - p.life / p.max;
      var s = p.s0 + (p.s1 - p.s0) * f;
      p.img.x = p.x; p.img.y = p.y;
      p.img.setScale(s);
      p.img.setAlpha(p.a0 * (1 - f * f));
      p.img.rotation = p.kind === 'ring' ? 0 : p.rot;
    }
  };

  /* ------------------------------------------------------------------ hud -- */
  function mkText(scene, parent, size, col, weight, origin) {
    var t = scene.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: String(size) + 'px', color: col || PAL.ink,
      fontStyle: weight || '700', resolution: 2
    });
    t.setOrigin(origin == null ? 0.5 : origin, 0.5);
    parent.add(t);
    return t;
  }

  PlayScene.buildHud = function () {
    this.hudBar = this.add.image(0, 0, 'ui_topbar').setOrigin(0.5, 0);
    this.layerHud.add(this.hudBar);
    this.coinIcon = this.add.image(0, 0, 'p_coin').setOrigin(0.5);
    this.layerHud.add(this.coinIcon);
    this.coinTxt = mkText(this, this.layerHud, 40, PAL.gold, '800', 0);
    this.lvTxt = mkText(this, this.layerHud, 24, PAL.dim, '700', 0);
    this.barTrack = this.add.image(0, 0, 'bar_track').setOrigin(0, 0.5);
    this.barFill = this.add.image(0, 0, 'bar_fill').setOrigin(0, 0.5);
    this.layerHud.add(this.barTrack); this.layerHud.add(this.barFill);

    this.dock = this.add.image(0, 0, 'ui_dock').setOrigin(0.5, 0);
    this.layerHud.add(this.dock);
    this.btnSpin = this.add.image(0, 0, 'btn_spin').setOrigin(0.5);
    this.layerHud.add(this.btnSpin);
    this.spinTxt = mkText(this, this.layerHud, 40, '#3a1a00', '800');
    this.btns = {};
    this.btnTx = {};
    var self = this;
    ['minus', 'plus', 'fast', 'info', 'tour', 'topup', 'rush'].forEach(function (id) {
      var tex = id === 'topup' || id === 'rush' ? 'btn_small' : 'btn_sq';
      var b = self.add.image(0, 0, tex).setOrigin(0.5);
      self.layerHud.add(b);
      self.btns[id] = b;
      self.btnTx[id] = mkText(self, self.layerHud, 30, PAL.ink, '800');
    });
    this.betChip = this.add.image(0, 0, 'chip_lg').setOrigin(0.5);
    this.layerHud.add(this.betChip);
    this.betTxt = mkText(this, this.layerHud, 32, PAL.ink, '800');

    this.winChip = this.add.image(0, 0, 'chip_lg').setOrigin(0.5);
    this.layerHud.add(this.winChip);
    this.winTxt = mkText(this, this.layerHud, 40, PAL.mint, '800');
    this.featChip = this.add.image(0, 0, 'chip_sm').setOrigin(0.5);
    this.layerHud.add(this.featChip);
    this.featTxt = mkText(this, this.layerHud, 28, PAL.gold, '800');

    this.coachBg = this.add.image(0, 0, 'strip_coach').setOrigin(0.5);
    this.layerHud.add(this.coachBg);
    this.coachTxt = mkText(this, this.layerHud, 26, PAL.teal, '700');
    this.toastBg = this.add.image(0, 0, 'chip_sm').setOrigin(0.5);
    this.layerHud.add(this.toastBg);
    this.toastTxt = mkText(this, this.layerHud, 26, PAL.ink, '800');
  };

  /* ---------------------------------------------------------------- sheet -- */
  PlayScene.buildSheet = function () {
    this.shade = this.add.image(0, 0, 'p_dot').setOrigin(0.5).setVisible(false);
    this.shade.setTint(0x07030f);
    this.layerSheet.add(this.shade);
    this.sheetBg = this.add.image(0, 0, 'ui_sheet').setOrigin(0.5, 0);
    this.layerSheet.add(this.sheetBg);
    this.sheetTitle = mkText(this, this.layerSheet, 38, PAL.gold, '800');
    this.sheetSub = mkText(this, this.layerSheet, 26, PAL.dim, '700');
    this.sheetBody = this.add.container(0, 0);
    this.layerSheet.add(this.sheetBody);
    this.rows = [];
    var i;
    for (i = 0; i < 30; i++) {
      var bg = this.add.image(0, 0, 'ui_row').setOrigin(0.5);
      this.sheetBody.add(bg);
      this.rows.push({ bg: bg, a: null, b: null, ic: null, on: false });
    }
    for (i = 0; i < 30; i++) {
      var r0 = this.rows[i];
      r0.ic = this.add.image(0, 0, 'p_dot').setOrigin(0.5);
      this.sheetBody.add(r0.ic);
      r0.a = mkText(this, this.sheetBody, 26, PAL.ink, '700', 0);
      r0.b = mkText(this, this.sheetBody, 26, PAL.gold, '800', 1);
    }
    // skill game meter (bands, track, marker) lives above the sheet body
    this.skillWrap = this.add.container(0, 0);
    this.layerSheet.add(this.skillWrap);
    this.skillTrack = this.add.image(0, 0, 'band_soft').setOrigin(0.5);
    this.skillTrack.setTint(0x1a0a2c);
    this.skillWrap.add(this.skillTrack);
    this.skillBands = [];
    for (i = 2; i >= 0; i--) {
      var bandImg = this.add.image(0, 0, 'band_soft').setOrigin(0.5);
      this.skillWrap.add(bandImg);
      this.skillBands[i] = bandImg;
    }
    this.skillMarker = this.add.image(0, 0, 'p_spark').setOrigin(0.5);
    this.skillMarker.setTint(0xfff4e6);
    this.skillMarker.rotation = Math.PI / 2;
    this.skillWrap.add(this.skillMarker);
    this.skillWrap.setVisible(false);
    this.sheetBtns = [];
    for (var j = 0; j < 4; j++) {
      var img = this.add.image(0, 0, 'btn_mid').setOrigin(0.5);
      this.layerSheet.add(img);
      var tx = mkText(this, this.layerSheet, 32, PAL.ink, '800');
      this.sheetBtns.push({ img: img, tx: tx, id: '' });
    }
    this.hideSheet();
  };

  /* ------------------------------------------------------------------ top -- */
  PlayScene.buildTop = function () {
    this.bannerImg = this.add.image(0, 0, 'banner').setOrigin(0.5);
    this.bannerTitle = mkText(this, this.layerTop, 54, PAL.gold, '800');
    this.bannerSub = mkText(this, this.layerTop, 30, PAL.ink, '700');
    this.layerTop.add(this.bannerImg);
    this.layerTop.moveTo(this.bannerImg, 0);
    this.bannerImg.setVisible(false);
    this.bannerTitle.setVisible(false); this.bannerSub.setVisible(false);
    this.titleNote = mkText(this, this.layerTop, 25, PAL.dim, '700');
    this.titleNote.setVisible(false);
    this.titleTag = mkText(this, this.layerTop, 27, PAL.teal, '800');
    this.titleTag.setVisible(false);
  };

  /* --------------------------------------------------------------- layout -- */
  PlayScene.readInsets = function () {
    if (this.insets) return this.insets;
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;' +
      'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);' +
      'padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);';
    document.body.appendChild(d);
    var cs = getComputedStyle(d);
    var out = {
      t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0,
      l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0
    };
    d.remove();
    this.insets = out;
    return out;
  };

  PlayScene.layout = function () {
    var gw = this.scale.gameSize.width, gh = this.scale.gameSize.height;
    if (!gw || !gh) return;
    var k = gw / VW;
    this.k = k;
    this.vh = gh / k;
    this.root.setScale(k);
    var ins = this.readInsets();
    var top = ins.t / k, bot = ins.b / k;
    var vh = this.vh;
    var L = this.L = {};
    L.top = top; L.bot = bot; L.vh = vh;
    L.barY = top; L.barH = 96;
    L.barBottom = top + 96;
    L.dockH = 210;
    L.dockY = vh - bot - L.dockH - 8;
    L.bandTop = L.barBottom + 16;
    L.bandBottom = L.dockY - 12;

    // backdrop covers the viewport
    var self = this;
    META.MACHINE_IDS.forEach(function (id) {
      var img = self.bdImgs[id];
      var s = Math.max(VW / img.width, vh / img.height);
      img.setScale(s);
      img.x = VW / 2; img.y = vh / 2;
    });
    this.vignette.x = VW / 2; this.vignette.y = vh / 2;

    // hud bar
    this.hudBar.x = VW / 2; this.hudBar.y = top;
    this.hudBar.setDisplaySize(VW, 96);
    this.coinIcon.x = 40; this.coinIcon.y = top + 48; this.coinIcon.setScale(1.05);
    this.coinTxt.x = 68; this.coinTxt.y = top + 48;
    this.lvTxt.x = 400; this.lvTxt.y = top + 28;
    this.barTrack.x = 400; this.barTrack.y = top + 64;
    this.barFill.x = 400; this.barFill.y = top + 64;

    // dock
    this.dock.x = VW / 2; this.dock.y = L.dockY;
    this.dock.setDisplaySize(VW, L.dockH);
    var r1 = L.dockY + 54, r2 = L.dockY + 150;
    this.place(this.btns.minus, this.btnTx.minus, 66, r1, '-');
    this.betChip.x = 196; this.betChip.y = r1; this.betChip.setDisplaySize(180, 64);
    this.betTxt.x = 196; this.betTxt.y = r1;
    this.place(this.btns.plus, this.btnTx.plus, 326, r1, '+');
    this.place(this.btns.fast, this.btnTx.fast, 442, r1, save.fast ? '>>' : '>');
    this.place(this.btns.info, this.btnTx.info, 542, r1, 'ODDS');
    this.place(this.btns.tour, this.btnTx.tour, 646, r1, 'MAP');
    this.btnTx.fast.setFontSize(30);
    this.btnTx.info.setFontSize(23);
    this.btnTx.tour.setFontSize(24);
    this.btnTx.topup.setFontSize(26);
    this.btnTx.rush.setFontSize(26);
    this.btnSpin.x = VW / 2; this.btnSpin.y = r2;
    this.spinTxt.x = VW / 2; this.spinTxt.y = r2;
    this.place(this.btns.topup, this.btnTx.topup, 92, r2, '+C');
    this.place(this.btns.rush, this.btnTx.rush, 628, r2, 'RUSH');

    // machine band
    var g = GEO[this.machine.id];
    this.cab.setTexture(texOr(this, 'cab_' + this.machine.id, 'p_dot'));
    var band = L.bandBottom - L.bandTop;
    var cabScale = Math.min(1, (VW - 24) / g.w, band / (g.h + 150));
    if (cabScale <= 0 || !isFinite(cabScale)) cabScale = 0.6;
    this.cabScale = cabScale;
    this.cab.setScale(cabScale);
    this.cab.x = VW / 2;
    this.cab.y = L.bandTop + Math.max(0, (band - g.h * cabScale - 140) * 0.28);
    L.cabTop = this.cab.y;
    L.cabBottom = this.cab.y + g.h * cabScale;
    L.gridX = VW / 2 - (g.w / 2 - g.gx) * cabScale;
    L.gridY = L.cabTop + g.gy * cabScale;
    L.cw = g.cw * cabScale; L.ch = g.ch * cabScale;

    // win readout + feature chip sit just under the cabinet
    var wy = Math.min(L.cabBottom + 42, L.dockY - 44);
    this.winChip.x = VW / 2; this.winChip.y = wy; this.winChip.setDisplaySize(300, 66);
    this.winTxt.x = VW / 2; this.winTxt.y = wy;
    this.featChip.x = VW / 2; this.featChip.y = wy - 4; this.featChip.setDisplaySize(300, 56);
    this.featTxt.x = VW / 2; this.featTxt.y = wy - 4;

    // Pip stands in whatever space is left, and steps aside when there is none
    var gapTop = wy + 40, gapBot = L.dockY - 6;
    var pipH = Math.min(200, gapBot - gapTop);
    this.pipVisible = pipH >= 112;
    this.pipScale = clamp(pipH / 216, 0.45, 0.95);
    this.pipY = gapBot - 6;

    // coach strip + toast
    this.coachBg.x = VW / 2; this.coachBg.y = L.barBottom + 40;
    this.coachTxt.x = VW / 2; this.coachTxt.y = L.barBottom + 40;
    this.toastBg.x = VW - 150; this.toastBg.y = L.barBottom + 40;
    this.toastBg.setDisplaySize(280, 58);
    this.toastTxt.x = VW - 150; this.toastTxt.y = L.barBottom + 40;

    // banner
    this.bannerImg.x = VW / 2; this.bannerImg.y = L.bandTop + (L.bandBottom - L.bandTop) * 0.42;
    this.bannerTitle.x = VW / 2; this.bannerTitle.y = this.bannerImg.y - 30;
    this.bannerSub.x = VW / 2; this.bannerSub.y = this.bannerImg.y + 40;

    // sheet
    this.shade.x = VW / 2; this.shade.y = vh / 2;
    this.shade.setDisplaySize(VW * 1.2, vh * 1.2);
    var sh = Math.min(1080, vh - top - bot - 60);
    var sy = top + (vh - top - bot - sh) / 2;
    this.sheetBg.x = VW / 2; this.sheetBg.y = sy;
    this.sheetBg.setDisplaySize(668, sh);
    this.L.sheetY = sy; this.L.sheetH = sh;
    this.sheetTitle.x = VW / 2; this.sheetTitle.y = sy + 46;
    this.sheetSub.x = VW / 2; this.sheetSub.y = sy + 88;
    this.L.bodyTop = sy + 120;
    this.L.bodyH = sh - 120 - 108;
    if (!this.bodyMask) {
      this.bodyMaskG = this.make.graphics({ add: false });
      this.bodyMask = this.bodyMaskG.createGeometryMask();
      this.sheetBody.setMask(this.bodyMask);
    }
    this.bodyMaskG.clear();
    this.bodyMaskG.fillStyle(0xffffff);
    this.bodyMaskG.fillRect((VW / 2 - 334) * k, this.L.bodyTop * k, 668 * k, this.L.bodyH * k);
    for (var b = 0; b < this.sheetBtns.length; b++) {
      this.sheetBtns[b].img.y = sy + sh - 56;
      this.sheetBtns[b].tx.y = sy + sh - 56;
    }

    // reel mask
    if (!this.reelMaskG) {
      this.reelMaskG = this.make.graphics({ add: false });
      this.reelMask = this.reelMaskG.createGeometryMask();
      for (var c = 0; c < this.reelCons.length; c++) this.reelCons[c].setMask(this.reelMask);
    }
    this.reelMaskG.clear();
    this.reelMaskG.fillStyle(0xffffff);
    this.reelMaskG.fillRect(L.gridX * k, L.gridY * k, g.gw * cabScale * k, g.gh * cabScale * k);
    if (!this.gridMasked) {
      this.gridMasked = true;
      for (var gi = 0; gi < this.gridImgs.length; gi++) this.gridImgs[gi].img.setMask(this.reelMask);
    }

    // wheel + pick overlays
    var cx = VW / 2, cy = L.gridY + g.gh * cabScale / 2;
    this.wheelCon.x = cx; this.wheelCon.y = cy;
    var ws = Math.min(0.94, (g.gw * cabScale) / 448, (g.gh * cabScale) / 448);
    this.wheelCon.setScale(Math.max(0.5, ws));
    this.wheelPtr.y = -198;
    this.pickCon.x = cx; this.pickCon.y = cy;
    var cell = Math.min(g.gw * cabScale, g.gh * cabScale) / 3;
    for (var pi = 0; pi < 9; pi++) {
      var px = ((pi % 3) - 1) * cell, py = (Math.floor(pi / 3) - 1) * cell;
      this.pickBtns[pi].x = px; this.pickBtns[pi].y = py;
      this.pickBtns[pi].setDisplaySize(cell * 0.88, cell * 0.88);
      this.pickTx[pi].x = px; this.pickTx[pi].y = py;
    }
    this.curtain.x = VW / 2; this.curtain.y = cy;

    // skill meter geometry
    var mw = 600, my = this.L.bodyTop + 300;
    this.skillTrack.x = VW / 2; this.skillTrack.y = my;
    this.skillTrack.setDisplaySize(mw + 20, 52);
    for (var si = 0; si < 3; si++) {
      this.skillBands[si].x = VW / 2; this.skillBands[si].y = my;
    }
    this.skillMarker.x = VW / 2; this.skillMarker.y = my;
    this.skillMarker.setDisplaySize(58, 10);

    if (this.mode === 'title') this.showTitle();
    this.buildHits();
    this.refreshLayout();
  };

  PlayScene.place = function (btn, txt, x, y, label) {
    btn.x = x; btn.y = y;
    txt.x = x; txt.y = y;
    setT(txt, label);
  };

  PlayScene.refreshLayout = function () {
    // reel columns for the active machine
    var g = GEO[this.machine.id], k = this.cabScale, L = this.L;
    if (!L) return;
    var cols = g.cols, rows = g.rows;
    for (var c = 0; c < this.reelCons.length; c++) {
      var on = this.mode === 'play' && this.machine.id !== 'cascade' && c < cols;
      this.reelCons[c].setVisible(on);
      this.reelCons[c].x = L.gridX + (c + 0.5) * L.cw;
      this.reelCons[c].y = L.gridY;
      var imgs = this.reelImgs[c];
      for (var r = 0; r < imgs.length; r++) {
        var use = on && r < rows + 2;
        imgs[r].setVisible(use);
        if (use) imgs[r].setDisplaySize(L.cw * 0.78, L.cw * 0.78);
      }
    }
    var casOn = this.mode === 'play' && this.machine.id === 'cascade';
    for (var i = 0; i < 25; i++) {
      var cell = this.gridImgs[i];
      cell.img.setVisible(casOn);
      if (casOn) {
        var cx2 = i % 5, cy2 = Math.floor(i / 5);
        cell.x = L.gridX + (cx2 + 0.5) * L.cw;
        cell.ty = L.gridY + (cy2 + 0.5) * L.ch;
        if (!this.casRunning) cell.y = cell.ty;
        cell.img.setDisplaySize(L.cw * 0.82, L.cw * 0.82);
      }
    }
    for (var m2 = 0; m2 < 25; m2++) this.marks[m2].setDisplaySize(L.cw * 0.98, L.cw * 0.98);
    this.cab.setVisible(this.mode === 'play');
    if (this.mode === 'play') {
      this.pip.setVisible(this.pipVisible);
      this.pip.x = 104; this.pip.y = this.pipY;
      this.pip.setScale(this.pipScale);
    } else if (this.mode !== 'title') this.pip.setVisible(false);
    if (this.mode === 'play') {
      if (casOn && !this.casRunning) this.idleGrid();
      else if (!casOn) this.paintReels(true);
    }
  };
  // Idle cascade board so the machine is never a grid of blanks.
  PlayScene.idleGrid = function () {
    var w = M.C.gemWeights, tot = 0, i;
    for (i = 0; i < w.length; i++) tot += w[i];
    var grid = [];
    for (i = 0; i < 25; i++) {
      var r = Math.random() * tot, t = 5;
      for (var j = 0; j < w.length; j++) { r -= w[j]; if (r < 0) { t = j; break; } }
      grid.push(t);
    }
    this.setGrid(grid, false);
  };

  /* --------------------------------------------------------------- hitmap -- */
  PlayScene.buildHits = function () {
    var L = this.L, h = this.hits;
    h.length = 0;
    var self = this;
    function add(id, x, y, w, hh) { h.push({ id: id, x: x - w / 2, y: y - hh / 2, w: w, h: hh }); }
    if (this.mode === 'play') {
      var r1 = L.dockY + 54, r2 = L.dockY + 150;
      add('minus', 66, r1, 92, 92); add('plus', 326, r1, 92, 92);
      add('fast', 442, r1, 92, 92); add('info', 540, r1, 92, 92);
      add('tour', 646, r1, 92, 92);
      add('spin', VW / 2, r2, 320, 110);
      add('topup', 92, r2, 140, 92); add('rush', 628, r2, 140, 92);
      if (this.fx && this.fx.kind === 'pick') {
        var cell = this.pickBtns[0].displayWidth;
        for (var p = 0; p < 9; p++) {
          add('pick' + p, this.pickCon.x + this.pickBtns[p].x, this.pickCon.y + this.pickBtns[p].y, cell, cell);
        }
      }
    } else if (this.mode === 'title') {
      var cy = L.bandTop + (L.bandBottom - L.bandTop) * 0.62;
      add('tPlay', VW / 2, cy, 460, 108);
      add('tTour', VW / 2, cy + 118, 440, 100);
      add('tSet', VW / 2, cy + 236, 440, 100);
    } else if (this.mode !== 'title') {
      for (var b = 0; b < this.sheetBtns.length; b++) {
        var sb = this.sheetBtns[b];
        if (sb.id) add(sb.id, sb.img.x, sb.img.y, sb.img.displayWidth + 8, 96);
      }
      if (this.mode === 'tour' && this.tourRowY) {
        for (var t = 0; t < this.tourRowY.length; t++) {
          var ty = L.bodyTop + this.tourRowY[t] + this.sheetScroll + 18;
          if (ty > L.bodyTop - 30 && ty < L.bodyTop + L.bodyH + 30) add('tour' + t, VW / 2, ty, 640, 120);
        }
      }
    }
  };

  /* ---------------------------------------------------------------- input -- */
  PlayScene.toVirt = function (p) {
    return { x: p.x / this.k, y: p.y / this.k };
  };
  PlayScene.onDown = function (p) {
    if (kit.paused) return;
    this.startAudio();
    var v = this.toVirt(p);
    this.dragStart = v.y; this.dragFrom = this.sheetScroll; this.dragging = false; this.dragMoved = 0;
    this.downId = this.hitAt(v.x, v.y);
    if (this.downId) {
      var btn = this.btns[this.downId];
      if (btn) btn.setScale(0.95);
    }
  };
  PlayScene.onMove = function (p) {
    if (!p.isDown || kit.paused) return;
    var v = this.toVirt(p);
    if (this.dragStart == null) return;
    var d = v.y - this.dragStart;
    this.dragMoved = Math.max(this.dragMoved, Math.abs(d));
    if (this.sheetMax > 0 && Math.abs(d) > 8) {
      this.dragging = true;
      this.sheetScroll = clamp(this.dragFrom + d, -this.sheetMax, 0);
      this.sheetBody.y = this.sheetScroll;
    }
  };
  PlayScene.onUp = function (p) {
    if (kit.paused) return;
    var v = this.toVirt(p);
    for (var id in this.btns) this.btns[id].setScale(1);
    this.dragStart = null;
    if (this.dragMoved > 14) { this.downId = null; return; }
    var hit = this.hitAt(v.x, v.y);
    if (hit && hit === this.downId) this.act(hit);
    else if (!hit && this.banner && this.bannerT > 0.35) this.dismissBanner();
    this.downId = null;
  };
  PlayScene.hitAt = function (x, y) {
    for (var i = this.hits.length - 1; i >= 0; i--) {
      var h = this.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
    }
    return null;
  };
  PlayScene.startAudio = function () {
    if (this.audioStarted) return;
    this.audioStarted = true;
    this.applyMusic();
  };
  PlayScene.applyMusic = function () {
    if (!this.audioStarted) return;
    var want = this.mode === 'play' ? THEME[this.machine.id].music : 'mus_menu';
    if (this.fx && (this.fx.kind === 'free' || this.fx.kind === 'hold')) want = 'mus_feature';
    if (this.fx && (this.fx.kind === 'wheel' || this.fx.kind === 'pick')) want = 'mus_finale';
    if (want !== this.lastMusic) { this.lastMusic = want; kit.audio.music(want, 700); }
  };

  /* ---------------------------------------------------------------- modes -- */
  PlayScene.setMode = function (m, silent) {
    this.mode = m;
    this.sheetScroll = 0; this.sheetMax = 0; this.sheetBody.y = 0;
    hook.mode = m;
    var play = m === 'play';
    setV(this.hudBar, play); setV(this.coinIcon, true); setV(this.coinTxt, true);
    setV(this.lvTxt, play); setV(this.barTrack, play); setV(this.barFill, play);
    setV(this.dock, play); setV(this.btnSpin, play); setV(this.spinTxt, play);
    setV(this.betChip, play); setV(this.betTxt, play);
    for (var id in this.btns) { setV(this.btns[id], play); setV(this.btnTx[id], play); }
    if (!play) { setV(this.winChip, false); setV(this.winTxt, false); setV(this.featChip, false); setV(this.featTxt, false); }
    setV(this.titleNote, false); setV(this.titleTag, false);
    if (m !== 'skill') { this.skillWrap.setVisible(false); }
    if (m === 'title') this.showTitle();
    else if (m === 'play') this.hideSheet();
    else this.openSheet(m);
    this.refreshLayout();
    this.buildHits();
    this.applyMusic();
    if (!silent) kit.audio.sfx('tap');
  };
  PlayScene.forceMode = function (m) {
    if (m === 'play') { this.setMode('play'); return; }
    if (['title', 'tour', 'paytable', 'rush', 'collection', 'daily', 'skill'].indexOf(m) >= 0) this.setMode(m);
  };
  PlayScene.forceStage = function (i) {
    i = clamp(Math.floor(i) || 0, 0, META.MACHINE_IDS.length - 1);
    if (i >= save.unlocked) { save.unlocked = i + 1; persist(); }
    this.dismissBanner();
    this.resetReels();
    this.selectMachine(i);
    if (this.mode !== 'play') this.setMode('play');
  };
  PlayScene.selectMachine = function (i) {
    if (this.spinState !== 'idle') return;
    this.mi = clamp(i, 0, save.unlocked - 1);
    this.machine = M.MACHINES[this.mi];
    save.machine = this.mi;
    hook.stage = this.mi; hook.machine = this.machine.id;
    for (var c = 0; c < this.reels.length; c++) this.reels[c].pos = (Math.random() * 997) | 0;
    this.resetReels();
    this.layout();
    this.lastMusic = ''; this.applyMusic();
    persist();
  };

  PlayScene.showTitle = function () {
    this.hideSheet();
    var L = this.L;
    if (!L) return;
    var cy = L.bandTop + (L.bandBottom - L.bandTop) * 0.62;
    this.sheetTitle.setVisible(true);
    this.sheetTitle.x = VW / 2; this.sheetTitle.y = L.bandTop + 110;
    this.sheetTitle.setFontSize(60);
    setC(this.sheetTitle, PAL.gold);
    setT(this.sheetTitle, 'CARNIVAL REELS');
    this.sheetSub.setVisible(true);
    this.sheetSub.x = VW / 2; this.sheetSub.y = L.bandTop + 170;
    setT(this.sheetSub, 'Five machines. Posted odds. Play money only.');
    var labels = ['PLAY', 'CARNIVAL TOUR', 'SETTINGS'];
    var ids = ['tPlay', 'tTour', 'tSet'];
    for (var i = 0; i < 3; i++) {
      var b = this.sheetBtns[i];
      b.img.setVisible(true); b.tx.setVisible(true);
      b.img.setTexture(i === 0 ? 'btn_wide' : 'btn_ghost');
      b.img.setDisplaySize(i === 0 ? 440 : 420, i === 0 ? 100 : 92);
      b.img.x = VW / 2; b.img.y = cy + i * 118;
      b.tx.x = VW / 2; b.tx.y = cy + i * 118;
      b.tx.setFontSize(i === 0 ? 40 : 32);
      setT(b.tx, labels[i]);
      b.id = ids[i];
    }
    this.sheetBtns[3].img.setVisible(false); this.sheetBtns[3].tx.setVisible(false);
    this.sheetBtns[3].id = '';
    setV(this.shade, false);
    setV(this.sheetBg, false);
    var open = save.unlocked, tot = META.MACHINE_IDS.length;
    this.titleTag.setVisible(true);
    this.titleTag.x = VW / 2; this.titleTag.y = cy - 78;
    setT(this.titleTag, open + ' of ' + tot + ' machines open   ' + nf(save.bank) + ' coins');
    this.titleNote.setVisible(true);
    this.titleNote.x = VW / 2; this.titleNote.y = cy + 316;
    setT(this.titleNote, 'Coins refill free. Nothing here is for sale.');
    this.pip.setVisible(true);
    this.pip.x = 612; this.pip.y = cy + 366;
    this.pip.setScale(0.92);
    this.setPip('idle');
  };

  PlayScene.hideSheet = function () {
    setV(this.shade, false); setV(this.sheetBg, false);
    setV(this.sheetTitle, false); setV(this.sheetSub, false);
    for (var i = 0; i < this.rows.length; i++) this.setRow(i, null);
    for (var b = 0; b < this.sheetBtns.length; b++) {
      this.sheetBtns[b].img.setVisible(false);
      this.sheetBtns[b].tx.setVisible(false);
      this.sheetBtns[b].id = '';
    }
  };
  PlayScene.setRow = function (i, data) {
    var r = this.rows[i];
    if (!r) return;
    if (!data) {
      r.on = false;
      r.bg.setVisible(false); r.a.setVisible(false); r.b.setVisible(false); r.ic.setVisible(false);
      return;
    }
    r.on = true;
    var y = (this.L ? this.L.bodyTop : 0) + data.y;
    r.bg.setVisible(data.bg !== false);
    r.bg.y = y; r.bg.x = VW / 2;
    r.bg.setDisplaySize(data.w || 620, data.h || 54);
    r.bg.setAlpha(data.alpha == null ? 1 : data.alpha);
    r.a.setVisible(true); r.a.y = y; r.a.x = data.ax || (VW / 2 - 288);
    r.a.setFontSize(data.size || 26);
    setT(r.a, data.a == null ? '' : data.a);
    setC(r.a, data.acol || PAL.ink);
    var hasB = data.b != null && data.b !== '';
    r.b.setVisible(hasB);
    if (hasB) {
      r.b.y = y; r.b.x = VW / 2 + 288;
      r.b.setFontSize(data.size || 26);
      setT(r.b, data.b); setC(r.b, data.bcol || PAL.gold);
    }
    if (data.icon) {
      r.ic.setVisible(true); r.ic.setTexture(texOr(this, data.icon, 'p_dot'));
      r.ic.x = data.iconX == null ? VW / 2 - 268 : data.iconX;
      r.ic.y = y;
      r.ic.setDisplaySize(data.iconS || 44, data.iconS || 44);
      r.ic.setAlpha(data.iconA == null ? 1 : data.iconA);
      r.a.x = (data.ax || (VW / 2 - 288)) + 46;
    } else r.ic.setVisible(false);
  };

  /* ---------------------------------------------------------------- sheets -- */
  PlayScene.openSheet = function (which) {
    setV(this.shade, true); this.shade.setAlpha(0.72);
    setV(this.sheetBg, true);
    setV(this.sheetTitle, true); setV(this.sheetSub, true);
    this.sheetTitle.setFontSize(38);
    this.sheetTitle.x = VW / 2; this.sheetTitle.y = this.L.sheetY + 46;
    this.sheetSub.x = VW / 2; this.sheetSub.y = this.L.sheetY + 88;
    for (var i = 0; i < this.rows.length; i++) this.setRow(i, null);
    for (var b = 0; b < this.sheetBtns.length; b++) {
      this.sheetBtns[b].img.setVisible(false); this.sheetBtns[b].tx.setVisible(false);
      this.sheetBtns[b].id = '';
    }
    if (which === 'tour') this.sheetTour();
    else if (which === 'paytable') this.sheetPaytable();
    else if (which === 'rush') this.sheetRush();
    else if (which === 'collection') this.sheetCollection();
    else if (which === 'daily') this.sheetDaily();
    else if (which === 'skill') this.sheetSkill();
    this.sheetBody.y = 0;
    this.buildHits();
  };
  PlayScene.sheetBtn = function (slot, id, label, tex, x, w, yOff) {
    var b = this.sheetBtns[slot];
    b.img.setVisible(true); b.tx.setVisible(true);
    b.img.setTexture(tex || 'btn_mid');
    b.img.setDisplaySize(w || 300, 84);
    b.img.x = x == null ? VW / 2 : x;
    b.img.y = this.L.sheetY + this.L.sheetH - 56 - (yOff || 0);
    b.tx.x = b.img.x;
    b.tx.y = b.img.y;
    b.tx.setFontSize(30);
    setT(b.tx, label);
    b.id = id;
  };

  PlayScene.sheetTour = function () {
    setT(this.sheetTitle, 'CARNIVAL TOUR');
    var done = save.unlocked, total = META.MACHINE_IDS.length;
    setT(this.sheetSub, done + ' of ' + total + ' machines open');
    var y = 40, self = this;
    M.MACHINES.forEach(function (m, i) {
      var st = save.m[m.id], open = i < save.unlocked;
      var lp = META.levelProgress(st.spins);
      var tick = st.tickets.filter(Boolean).length;
      self.setRow(i, {
        y: y, h: 108, w: 640, size: 30,
        a: (open ? '' : 'LOCKED  ') + m.name,
        acol: open ? PAL.ink : PAL.mute,
        b: open ? 'LV ' + lp.level : 'LV ' + META.UNLOCK_LEVEL + ' before',
        bcol: open ? PAL.gold : PAL.mute,
        alpha: open ? 1 : 0.55
      });
      self.setRow(5 + i, {
        y: y + 34, h: 30, w: 640, bg: false, size: 23,
        a: m.tag,
        acol: PAL.mute,
        b: open ? (tick + ' of 6 prizes') : 'locked',
        bcol: open ? PAL.teal : PAL.mute
      });
      y += 128;
    });
    this.tourRowY = [];
    for (var i2 = 0; i2 < 5; i2++) this.tourRowY.push(40 + i2 * 128);
    this.sheetMax = Math.max(0, y - this.L.bodyH);
    this.sheetBtn(0, 'closeSheet', 'BACK', 'btn_ghost', VW / 2 - 172, 300);
    this.sheetBtn(1, 'openDaily', 'DAILY WHEEL', 'btn_accent', VW / 2 + 172, 300);
    this.sheetBtn(2, 'openSettings', 'SETTINGS', 'btn_ghost', VW / 2, 300, 96);
  };

  PlayScene.sheetPaytable = function () {
    var m = this.machine, an = analysis[m.id], st = save.m[m.id];
    setT(this.sheetTitle, m.name);
    setT(this.sheetSub, m.tag + '  ' + m.blurb);
    var y = 30, i = 0, self = this;
    function row(a, b, opt) {
      opt = opt || {};
      self.setRow(i++, {
        y: y, a: a, b: b, size: opt.size || 25, bg: opt.bg,
        acol: opt.acol || PAL.ink, bcol: opt.bcol || PAL.gold,
        icon: opt.icon, iconS: opt.iconS, h: opt.h || 50, w: 620
      });
      y += opt.gap || 54;
    }
    function head(txt) {
      self.setRow(i++, { y: y, a: txt, bg: false, size: 25, acol: PAL.teal, ax: VW / 2 - 288 });
      y += 42;
    }
    head('POSTED MATHS');
    var ci = an.n > 1 ? 1.96 * an.sd() / Math.sqrt(an.n) : 0;
    row('Return to player', an.exact ? pct(an.rtp(), 2) + '  exact'
      : pct(an.rtp(), 2) + ' +/- ' + (ci * 100).toFixed(2));
    row('Hit frequency', pct(an.hitAny / Math.max(1, an.n), 2));
    row('Volatility (SD)', an.sd().toFixed(2) + 'x');
    row('Largest seen', xs(an.max));
    row('Sample', an.exact ? nf(an.n) + ' outcomes enumerated' : nf(an.n) + ' spins simulated',
      { bcol: PAL.dim });
    if (m.id === 'carousel') {
      var wan = analysis.wheel;
      head('GRAND WHEEL (exact)');
      row('Wheel return', pct(wan.rtp(), 2) + ' of a ' + m.wheelStake + 'x stake');
      row('Grand 500x', oneIn(1 / m.wheelSlots), { bcol: PAL.rose });
      row('Slots on the wheel', nf(m.wheelSlots));
    }
    head('OUTCOME TABLE   odds, share of return');
    var rows = an.rows();
    for (var r = 0; r < rows.length && i < this.rows.length - 6; r++) {
      var rr = rows[r];
      if (rr.p < 1e-6) continue;
      row(rr.label, oneIn(rr.p) + '   ' + pct(rr.rtp, 2),
        { size: 23, acol: PAL.dim, bcol: rr.rtp > 0.08 ? PAL.gold : PAL.mute, h: 44, gap: 46 });
    }
    head('YOUR SESSION');
    var s = this.session;
    row('Spins this session', nf(s.spins), { bcol: PAL.ink });
    row('Wagered / returned', nf(s.wagered) + ' / ' + nf(s.won), { bcol: PAL.ink });
    row('Realised return', s.wagered > 0 ? pct(s.won / s.wagered, 2) : 'no spins yet',
      { bcol: s.wagered > 0 && s.won >= s.wagered ? PAL.mint : PAL.rose });
    row('Session peak / low', nf(s.peak) + ' / ' + nf(s.low), { bcol: PAL.ink });
    head('LIFETIME ON THIS MACHINE');
    row('Spins', nf(st.spins), { bcol: PAL.ink });
    row('Realised return', st.wagered > 0 ? pct(st.won / st.wagered, 2) : 'no spins yet', { bcol: PAL.ink });
    row('Best single win', nf(st.best) + ' coins', { bcol: PAL.gold });
    for (; i < this.rows.length; i++) this.setRow(i, null);
    this.sheetMax = Math.max(0, y - this.L.bodyH);
    this.sheetBtn(0, 'closeSheet', 'BACK', 'btn_ghost', VW / 2 - 172, 300);
    this.sheetBtn(1, 'openCollection', 'PRIZES', 'btn_accent', VW / 2 + 172, 300);
  };

  PlayScene.sheetRush = function () {
    setT(this.sheetTitle, 'BONUS RUSH');
    var open = save.rush < META.RUSH.length;
    setT(this.sheetSub, open ? ('Rung ' + (save.rush + 1) + ' of ' + META.RUSH.length)
      : 'Ladder complete');
    var y = 30, self = this;
    META.RUSH.forEach(function (r, i) {
      var state = i < save.rush ? 'done' : (i === save.rush ? 'now' : 'locked');
      var extra = '';
      if (state === 'now' && r.kind === 'count') extra = '  ' + save.rushCount + '/' + r.need;
      self.setRow(i, {
        y: y, h: 62, w: 620, size: 25,
        a: (i + 1) + '.  ' + r.text + extra,
        acol: state === 'done' ? PAL.mint : state === 'now' ? PAL.ink : PAL.mute,
        b: state === 'done' ? 'CLAIMED' : nf(r.coins),
        bcol: state === 'done' ? PAL.mint : state === 'now' ? PAL.gold : PAL.mute,
        alpha: state === 'locked' ? 0.5 : 1
      });
      y += 68;
    });
    for (var j = META.RUSH.length; j < this.rows.length; j++) this.setRow(j, null);
    this.sheetMax = Math.max(0, y - this.L.bodyH);
    this.sheetBtn(0, 'closeSheet', 'BACK', 'btn_ghost', VW / 2 - 172, 300);
    this.sheetBtn(1, 'openSkill', 'SKILL GAMES', 'btn_accent', VW / 2 + 172, 300);
  };

  PlayScene.sheetCollection = function () {
    var m = this.machine, st = save.m[m.id];
    setT(this.sheetTitle, 'PRIZE SHELF');
    var got = st.tickets.filter(Boolean).length;
    setT(this.sheetSub, m.name + '  ' + got + ' of 6');
    var y = 30, self = this, names = META.TICKET_NAMES[m.id] || [];
    for (var i = 0; i < 6; i++) {
      var have = st.tickets[i];
      this.setRow(i, {
        y: y, h: 76, w: 620, size: 27,
        icon: 'tick_' + i, iconS: 58, iconA: have ? 1 : 0.28,
        a: have ? (names[i] || 'Prize ' + (i + 1)) : 'Sealed',
        acol: have ? PAL.ink : PAL.mute,
        b: have ? 'WON' : 'LV ' + META.TICKET_LEVELS[i],
        bcol: have ? PAL.mint : PAL.mute,
        alpha: have ? 1 : 0.6
      });
      y += 84;
    }
    y += 12;
    this.setRow(6, {
      y: y, bg: false, size: 25, ax: VW / 2 - 288,
      a: st.setDone ? 'Set complete, ' + nf(META.SET_BONUS) + ' coins paid' :
        'Complete the set for ' + nf(META.SET_BONUS) + ' coins',
      acol: st.setDone ? PAL.mint : PAL.teal
    });
    y += 56;
    this.setRow(7, { y: y, bg: false, size: 25, acol: PAL.teal, ax: VW / 2 - 288, a: 'ODDITY BADGES' });
    y += 46;
    var slot = 8;
    for (var b = 0; b < META.BADGES.length && slot < this.rows.length; b++) {
      var bd = META.BADGES[b], has = !!save.badges[bd.id];
      this.setRow(slot++, {
        y: y, h: 48, w: 620, size: 23,
        a: bd.name + '  ' + bd.desc,
        acol: has ? PAL.ink : PAL.mute,
        b: has ? 'YES' : '-', bcol: has ? PAL.mint : PAL.mute,
        alpha: has ? 1 : 0.5
      });
      y += 52;
    }
    for (; slot < this.rows.length; slot++) this.setRow(slot, null);
    this.sheetMax = Math.max(0, y - this.L.bodyH);
    this.sheetBtn(0, 'closeSheet', 'BACK', 'btn_ghost');
  };

  PlayScene.sheetDaily = function () {
    setT(this.sheetTitle, 'DAILY WHEEL');
    var now = Date.now(), ready = META.dailyReady(save, now);
    setT(this.sheetSub, ready ? 'One free spin is waiting' :
      'Next free spin in ' + this.hms(META.dailyIn(save, now)));
    var y = 40, self = this;
    META.DAILY.forEach(function (d, i) {
      var tw = 0;
      for (var k = 0; k < META.DAILY.length; k++) tw += META.DAILY[k].w;
      self.setRow(i, {
        y: y, h: 56, w: 620, size: 26,
        a: nf(d.v) + ' coins', b: oneIn(d.w / tw),
        acol: i >= 6 ? PAL.gold : PAL.ink, bcol: PAL.dim
      });
      y += 62;
    });
    for (var j = META.DAILY.length; j < this.rows.length; j++) this.setRow(j, null);
    this.sheetMax = Math.max(0, y - this.L.bodyH);
    this.sheetBtn(0, 'closeSheet', 'BACK', 'btn_ghost', VW / 2 - 172, 300);
    if (ready) this.sheetBtn(1, 'claimDaily', 'SPIN IT', 'btn_wide', VW / 2 + 172, 300);
  };

  PlayScene.sheetSkill = function () {
    if (this.skill) { this.renderSkill(); return; }
    this.skillWrap.setVisible(false);
    setT(this.sheetTitle, 'SKILL GAMES');
    setT(this.sheetSub, 'Earn coins with your hands, not the reels');
    var y = 40, self = this;
    META.SKILL.forEach(function (s, i) {
      self.setRow(i * 2, {
        y: y, h: 72, w: 620, size: 30,
        a: s.name, b: 'up to ' + nf(s.bands[0].coins * s.tries), bcol: PAL.gold
      });
      self.setRow(i * 2 + 1, { y: y + 40, bg: false, size: 23, acol: PAL.mute, ax: VW / 2 - 288, a: s.hint });
      y += 128;
    });
    for (var j = 4; j < this.rows.length; j++) this.setRow(j, null);
    this.sheetMax = 0;
    this.sheetBtn(0, 'closeSheet', 'BACK', 'btn_ghost', VW / 2 - 172, 300);
    this.sheetBtn(1, 'play0', 'RING TOSS', 'btn_accent', VW / 2 + 172, 300);
    this.sheetBtn(2, 'play1', 'HIGH STRIKER', 'btn_accent', VW / 2, 300, 96);
  };

  PlayScene.hms = function (ms) {
    var s = Math.ceil(ms / 1000);
    var h = Math.floor(s / 3600), m2 = Math.floor((s % 3600) / 60), ss = s % 60;
    if (h > 0) return h + 'h ' + m2 + 'm';
    if (m2 > 0) return m2 + 'm ' + ss + 's';
    return ss + 's';
  };

  /* --------------------------------------------------------------- actions -- */
  PlayScene.act = function (id) {
    kit.audio.sfx('tap');
    if (id === 'tPlay') { this.setMode('play', true); this.startCoach(); return; }
    if (id === 'tTour') { this.setMode('tour', true); return; }
    if (id === 'tSet') { kit.openSettings(this.settingsRows()); return; }
    if (id === 'closeSheet') {
      this.skill = null; this.skillWrap.setVisible(false);
      this.setMode(this.returnMode || 'play', true); this.returnMode = null; return;
    }
    if (id === 'skillGo') { this.skillThrow(); return; }
    if (id === 'skillAgain') { this.startSkill(META.SKILL.indexOf(this.skill.def)); return; }
    if (id === 'openSettings') { kit.openSettings(this.settingsRows()); return; }
    if (id === 'openDaily') { this.returnMode = 'tour'; this.setMode('daily', true); return; }
    if (id === 'openSkill') { this.returnMode = 'rush'; this.setMode('skill', true); return; }
    if (id === 'openCollection') { this.returnMode = 'play'; this.setMode('collection', true); return; }
    if (id === 'claimDaily') { this.claimDaily(); return; }
    if (id === 'play0') { this.startSkill(0); return; }
    if (id === 'play1') { this.startSkill(1); return; }
    if (id.indexOf('tour') === 0 && id.length > 4) {
      var idx = parseInt(id.slice(4), 10);
      if (idx < save.unlocked) { this.selectMachine(idx); this.setMode('play', true); }
      else { kit.audio.sfx('denied'); this.pushToast('Reach LV ' + META.UNLOCK_LEVEL + ' first'); }
      return;
    }
    if (id.indexOf('pick') === 0) { this.pickBooth(parseInt(id.slice(4), 10)); return; }
    if (this.mode !== 'play') return;
    if (id === 'spin') this.trySpin();
    else if (id === 'minus') this.changeBet(-1);
    else if (id === 'plus') this.changeBet(1);
    else if (id === 'fast') { save.fast = !save.fast; persist(); this.pushToast(save.fast ? 'Fast spin on' : 'Fast spin off'); }
    else if (id === 'info') { this.returnMode = 'play'; this.setMode('paytable', true); }
    else if (id === 'tour') { this.returnMode = 'play'; this.setMode('tour', true); }
    else if (id === 'rush') { this.returnMode = 'play'; this.setMode('rush', true); }
    else if (id === 'topup') this.doTopUp();
  };

  PlayScene.settingsRows = function () {
    return [function (box, row) {
      row('Fast spin', function () { return save.fast; }, function (v) { save.fast = v; persist(); });
    }];
  };

  PlayScene.changeBet = function (d) {
    if (this.spinState !== 'idle') return;
    var n = clamp(save.betIdx + d, 0, META.BETS.length - 1);
    if (n === save.betIdx) { kit.audio.sfx('denied'); return; }
    save.betIdx = n; persist();
    hook.bet = META.BETS[n];
  };
  PlayScene.bet = function () { return META.BETS[save.betIdx]; };

  PlayScene.doTopUp = function () {
    var now = Date.now();
    if (save.bank >= META.TOPUP_FLOOR) {
      kit.audio.sfx('denied');
      this.pushToast('Top up under ' + nf(META.TOPUP_FLOOR));
      return;
    }
    if (!META.topUpReady(save, now)) {
      kit.audio.sfx('denied');
      this.pushToast('Ready in ' + this.hms(META.topUpIn(save, now)));
      return;
    }
    save.topUp = now;
    save.bank = Math.min(META.TOPUP_CEIL, save.bank + META.TOPUP_AMOUNT);
    persist();
    kit.audio.sfx('collect');
    this.pushToast('+' + nf(META.TOPUP_AMOUNT) + ' free coins');
    this.emit('coin', 92, this.L.dockY + 150, 12, { spd: 260, lift: 220, g: 900, life: 0.9, s0: 0.8, s1: 0.3 });
  };

  PlayScene.claimDaily = function () {
    var now = Date.now();
    if (!META.dailyReady(save, now)) { kit.audio.sfx('denied'); return; }
    var idx = META.rollDaily();
    var v = META.DAILY[idx].v;
    save.daily = now;
    save.bank += v;
    persist();
    kit.audio.sfx(v >= 2500 ? 'fanfare' : 'collect');
    this.showBanner('DAILY WHEEL', '+' + nf(v) + ' coins', v >= 2500 ? PAL.gold : PAL.mint);
    this.emit('confetti', VW / 2, this.L.vh * 0.4, v >= 2500 ? 40 : 18,
      { spd: 380, lift: 260, g: 780, life: 1.5, s0: 0.9, s1: 0.7 });
    this.setMode('daily', true);
  };

  /* ----------------------------------------------------------- skill games -- */
  PlayScene.startSkill = function (idx) {
    var def = META.SKILL[idx];
    if (!def) return;
    this.skill = { def: def, throwIdx: 0, pos: 0, dir: 1, won: 0, phase: 'aim', t: 0, last: null };
    this.setMode('skill', true);
    this.renderSkill();
  };
  PlayScene.renderSkill = function () {
    var s = this.skill;
    if (!s) { this.skillWrap.setVisible(false); return; }
    setT(this.sheetTitle, s.def.name);
    setT(this.sheetSub, 'Throw ' + Math.min(s.throwIdx + 1, s.def.tries) + ' of ' + s.def.tries +
      '   won ' + nf(s.won));
    for (var i = 0; i < this.rows.length; i++) this.setRow(i, null);
    var y = 40, self = this;
    s.def.bands.forEach(function (b, i) {
      self.setRow(i, {
        y: y, h: 54, w: 620, size: 26,
        a: b.label, b: nf(b.coins) + ' coins',
        acol: i === 0 ? PAL.gold : PAL.ink, bcol: i === 0 ? PAL.gold : PAL.dim
      });
      y += 60;
    });
    this.setRow(3, {
      y: 372, bg: false, size: 25, ax: VW / 2 - 288,
      a: s.last ? s.last : s.def.hint, acol: s.last ? PAL.mint : PAL.mute
    });
    // live meter
    var mw = 600, cols = [0xffc23d, 0x35e0d0, 0xa06bff];
    this.skillWrap.setVisible(true);
    for (var b2 = 2; b2 >= 0; b2--) {
      var im = this.skillBands[b2];
      im.setDisplaySize(Math.max(14, s.def.bands[b2].half * 2 * mw), 40);
      im.setTint(cols[b2]);
      im.setAlpha(b2 === 0 ? 0.95 : 0.42 - b2 * 0.1);
    }
    this.skillMarker.x = VW / 2 - mw / 2 + s.pos * mw;
    this.sheetMax = 0;
    this.sheetBtn(0, 'closeSheet', 'LEAVE', 'btn_ghost', VW / 2 - 172, 300);
    if (s.phase !== 'over') this.sheetBtn(1, 'skillGo', 'THROW', 'btn_wide', VW / 2 + 172, 300);
    else this.sheetBtn(1, 'skillAgain', 'PLAY AGAIN', 'btn_accent', VW / 2 + 172, 300);
    this.buildHits();
  };
  PlayScene.skillThrow = function () {
    var s = this.skill;
    if (!s || s.phase !== 'aim') return;
    var off = Math.abs(s.pos - 0.5);
    var band = null;
    for (var i = 0; i < s.def.bands.length; i++) {
      if (off <= s.def.bands[i].half) { band = s.def.bands[i]; break; }
    }
    kit.audio.sfx('toss');
    if (band) {
      s.won += band.coins;
      save.bank += band.coins;
      s.last = band.label + '  +' + nf(band.coins);
      kit.audio.sfx(band.coins >= 900 ? 'win_mid' : 'win_small');
      this.emit('star', VW / 2, this.L.vh * 0.5, 12, { spd: 300, lift: 180, g: 760, life: 0.9, s0: 0.5, s1: 0.1, tint: 0xffc23d });
    } else {
      s.last = 'Missed. No coins.';
      kit.audio.sfx('denied');
    }
    s.throwIdx++;
    if (s.throwIdx >= s.def.tries) {
      s.phase = 'over';
      s.last = 'Finished. ' + nf(s.won) + ' coins won.';
      persist();
    }
    this.renderSkill();
  };

  /* --------------------------------------------------------------- spinning -- */
  PlayScene.resetReels = function () {
    for (var c = 0; c < this.reels.length; c++) {
      var r = this.reels[c];
      r.state = 'idle'; r.vel = 0; r.glow = 0; r.anticipate = false;
      r.lastIdx.length = 0;
    }
    this.casRunning = false;
    this.cas = null;
    this.res = null; this.win = 0; this.winShown = 0; this.winTier = 0;
    this.fx = null; this.fxCurtain = null;
    this.spinState = 'idle';
    hook.spinning = false; hook.feature = '';
    // Every readout belongs to the spin that made it, so nothing survives a
    // machine change or a restart.
    this.clearMarks();
    this.setFeatureChip('');
    setV(this.winChip, false); setV(this.winTxt, false);
    this.curtain.setVisible(false);
    this.wheelCon.setVisible(false);
    this.pickCon.setVisible(false);
    for (var i = 0; i < this.coinTx.length; i++) this.coinTx[i].setVisible(false);
    this.paintReels(true);
  };

  PlayScene.stripFor = function (c) {
    var m = this.machine;
    if (m.strips && m.strips[c]) return m.strips[c];
    if (m.strip) return m.strip;
    return ['CH'];
  };
  PlayScene.symTex = function (code) {
    var key = 'sym_' + this.machine.id + '_' + code;
    return texOr(this, key, 'p_dot');
  };

  PlayScene.paintReels = function (force) {
    var m = this.machine;
    if (m.id === 'cascade') return;
    var g = GEO[m.id], rows = g.rows, L = this.L;
    if (!L) return;
    for (var c = 0; c < g.cols; c++) {
      var r = this.reels[c], strip = this.stripFor(c), len = strip.length;
      r.len = len;
      var base = Math.floor(r.pos), frac = r.pos - base;
      var imgs = this.reelImgs[c];
      for (var i = 0; i < rows + 2; i++) {
        var si = ((base + i - 1) % len + len) % len;
        if (force || r.lastIdx[i] !== si) {
          imgs[i].setTexture(this.symTex(strip[si]));
          r.lastIdx[i] = si;
        }
        imgs[i].y = (i - 1) * L.ch + L.ch / 2 - frac * L.ch;
        imgs[i].x = 0;
      }
      var blur = clamp(Math.abs(r.vel) / 34, 0, 1);
      if (force || Math.abs(blur - (r.lastBlur == null ? -1 : r.lastBlur)) > 0.02) {
        r.lastBlur = blur;
        var sc = (L.cw * 0.78 / 128) * (1 - blur * 0.06), al = 1 - blur * 0.35;
        for (var j = 0; j < rows + 2; j++) { imgs[j].setAlpha(al); imgs[j].setScale(sc); }
      }
      var glowOn = r.glow > 0;
      if (force || r.lastGlow !== glowOn) {
        r.lastGlow = glowOn;
        for (var q = 0; q < rows + 2; q++) {
          if (glowOn) imgs[q].setTint(0xffe08a); else imgs[q].clearTint();
        }
      }
    }
  };

  PlayScene.trySpin = function () {
    if (this.mode !== 'play') { this.setMode('play', true); return; }
    if (this.spinState !== 'idle') {
      // second tap slams the reels home
      if (this.spinState === 'reels') this.slamReels();
      return;
    }
    var b = this.bet();
    if (save.bank < b) {
      kit.audio.sfx('denied');
      this.pushToast('Not enough coins. Top up free.');
      return;
    }
    this.beginSpin();
  };

  PlayScene.beginSpin = function () {
    var m = this.machine, b = this.bet();
    save.bank -= b;
    this.session.spins++; this.session.wagered += b;
    var st = save.m[m.id];
    st.spins++; st.wagered += b;
    this.win = 0; this.winShown = 0; this.winTier = 0;
    this.res = m.spin(false);
    if (this.forceFeat) {
      var want = this.forceFeat, tries = 0;
      while (tries++ < 20000 && !this.hasFeature(this.res, want)) this.res = m.spin(false);
      this.forceFeat = null;
    }
    hook.spinning = true;
    this.spinState = 'reels';
    this.setPip('anticipate');
    kit.audio.sfx('spin_start');
    this.clearMarks();
    setV(this.winChip, false); setV(this.winTxt, false);
    if (m.id === 'cascade') this.startCascade();
    else this.startReels();
    this.coachAdvance('spin');
    if (save.bank < this.session.low) this.session.low = save.bank;
  };

  PlayScene.hasFeature = function (res, kind) {
    if (kind === 'hold') return !!res.bonus;
    if (kind === 'free') return !!(res.free && res.free.spins && res.free.spins.length);
    if (kind === 'wheel') return !!res.wheel;
    if (kind === 'pick') return !!res.prize;
    if (kind === 'big') return res.mult >= 25;
    return true;
  };

  PlayScene.startReels = function () {
    var m = this.machine, g = GEO[m.id], res = this.res;
    var fast = save.fast;
    var baseT = fast ? 0.34 : 0.62, gap = fast ? 0.1 : 0.19;
    for (var c = 0; c < g.cols; c++) {
      var r = this.reels[c], strip = this.stripFor(c);
      r.len = strip.length;
      r.state = 'spin';
      r.vel = 30 + c * 1.5;
      r.glow = 0;
      r.anticipate = !!(res.anticipate && res.anticipate[c]);
      r.stopAt = baseT + c * gap + (r.anticipate ? (fast ? 0.5 : 1.0) : 0);
      r.target = this.targetStop(c, strip);
      r.t = 0;
    }
    this.reelClock = 0;
    this.antiPlayed = false;
  };
  PlayScene.targetStop = function (c, strip) {
    var m = this.machine, res = this.res;
    if (m.id === 'orchard') return res.stops[c];
    if (m.id === 'ghost') {
      var want = res.cells[c], tries = 0, i = (Math.random() * strip.length) | 0;
      while (strip[i] !== want && tries++ < strip.length) i = (i + 1) % strip.length;
      return i;
    }
    if (res.stops && res.stops[c] != null) return res.stops[c];
    return 0;
  };
  PlayScene.slamReels = function () {
    for (var c = 0; c < this.reels.length; c++) {
      var r = this.reels[c];
      if (r.state === 'spin') { r.stopAt = Math.min(r.stopAt, this.reelClock + 0.02); r.anticipate = false; }
      else if (r.state === 'brake') { r.dur = Math.min(r.dur, r.t + 0.08); }
    }
  };

  PlayScene.stepReels = function (dt) {
    var m = this.machine, g = GEO[m.id];
    this.reelClock += dt;
    var running = false;
    for (var c = 0; c < g.cols; c++) {
      var r = this.reels[c];
      if (r.state === 'idle') continue;
      running = true;
      if (r.state === 'spin') {
        var v = r.anticipate && this.reelClock > r.stopAt - 0.9 ? r.vel * 0.42 : r.vel;
        r.pos += v * dt;
        if (r.anticipate && !this.antiPlayed && this.reelClock > r.stopAt - 0.9) {
          this.antiPlayed = true;
          kit.audio.sfx('near_miss');
          r.glow = 1;
        }
        if (this.reelClock >= r.stopAt) {
          r.state = 'brake'; r.t = 0;
          r.dur = save.fast ? 0.24 : 0.42;
          r.from = r.pos;
          var len = r.len;
          var turns = save.fast ? 1 : 2;
          var to = r.target;
          while (to < r.from + len * turns) to += len;
          r.to = to;
        }
      } else if (r.state === 'brake') {
        r.t += dt;
        var t = clamp(r.t / r.dur, 0, 1);
        r.pos = r.from + (r.to - r.from) * easeOutBack(t);
        r.vel = (r.to - r.from) * (1 - t) * 3;
        if (t >= 1) {
          r.pos = r.to; r.vel = 0; r.state = 'idle'; r.glow = 0;
          kit.audio.sfx('reel_stop', { rate: 0.94 + c * 0.03 });
          var L = this.L;
          this.emit('puff', L.gridX + (c + 0.5) * L.cw, L.gridY + g.gh * this.cabScale - 6, 3,
            { spd: 70, g: -40, life: 0.5, s0: 0.5, s1: 1.1, alpha: 0.4, tint: 0xd8c0ff });
          if (kit.juice.enabled) kit.juice.shake(1.6, 90);
        }
      }
    }
    this.paintReels(false);
    if (!running && this.spinState === 'reels') this.resolveSpin();
  };

  /* -------------------------------------------------------------- cascade -- */
  PlayScene.startCascade = function () {
    var res = this.res;
    this.cas = { steps: res.steps || [], idx: 0, phase: 'drop', t: 0, mult: 1, running: true };
    this.casRunning = true;
    var grid = this.cas.steps.length ? this.cas.steps[0].grid : res.grid;
    this.setGrid(grid, true);
  };
  PlayScene.setGrid = function (grid, drop) {
    var L = this.L;
    for (var i = 0; i < 25; i++) {
      var cell = this.gridImgs[i];
      cell.tier = grid[i];
      cell.img.setTexture(texOr(this, 'sym_cascade_g' + grid[i], 'p_dot'));
      cell.img.setAlpha(1);
      cell.sc = 1; cell.popping = 0; cell.lastSc = -1;
      cell.ty = L.gridY + (Math.floor(i / 5) + 0.5) * L.ch;
      if (drop) {
        cell.y = cell.ty - L.ch * (5 - Math.floor(i / 5)) - 60 - (i % 5) * 18;
        cell.vy = 0; cell.falling = 1;
      } else { cell.y = cell.ty; cell.falling = 0; }
      cell.img.x = cell.x; cell.img.y = cell.y;
    }
  };
  PlayScene.stepCascade = function (dt) {
    var c = this.cas, L = this.L;
    if (!c) return;
    // gravity for falling cells
    var moving = false;
    for (var i = 0; i < 25; i++) {
      var cell = this.gridImgs[i];
      if (cell.falling) {
        cell.vy += 2600 * dt;
        cell.y += cell.vy * dt;
        if (cell.y >= cell.ty) { cell.y = cell.ty; cell.vy = 0; cell.falling = 0; }
        else moving = true;
      }
      if (cell.popping > 0) {
        cell.popping -= dt;
        var f = clamp(cell.popping / 0.22, 0, 1);
        cell.img.setAlpha(f);
        cell.sc = 1 + (1 - f) * 0.5;
        if (cell.popping <= 0) cell.img.setAlpha(0);
        moving = true;
      }
      cell.img.x = cell.x; cell.img.y = cell.y;
      if (cell.lastSc !== cell.sc) {
        cell.lastSc = cell.sc;
        cell.img.setScale((L.cw * 0.82 / 128) * cell.sc);
      }
    }
    c.t += dt;
    if (moving) return;
    if (c.phase === 'drop') {
      c.phase = 'scan'; c.t = 0; c.idx = 1;
      return;
    }
    if (c.phase === 'scan') {
      if (c.idx >= c.steps.length) { this.casRunning = false; this.cas = null; this.resolveSpin(); return; }
      var step = c.steps[c.idx];
      if (step.clear) {
        // pop the clusters
        var any = false;
        for (var k = 0; k < step.clusters.length; k++) {
          var cl = step.clusters[k];
          for (var j = 0; j < cl.cells.length; j++) {
            var ci = cl.cells[j], cc = this.gridImgs[ci];
            cc.popping = 0.22;
            any = true;
            this.emit('spark', cc.x, cc.y, 3,
              { spd: 220, g: 420, life: 0.45, s0: 0.5, s1: 0, tint: [0xcfe4f5, 0x7ef2a8, 0xffd96b, 0xff8fb1, 0x6b9bff, 0xc9a5ff][cl.tier] });
          }
        }
        if (any) {
          kit.audio.sfx('cascade_pop', { rate: 0.9 + Math.min(c.idx, 8) * 0.06 });
          if (kit.juice.enabled) kit.juice.shake(2.2, 110);
        }
        this.setFeatureChip('TUMBLE x' + step.mult);
        c.idx++;
        c.phase = 'wait'; c.t = 0;
      } else {
        this.setGrid(step.grid, true);
        c.idx++;
        c.phase = 'wait'; c.t = 0;
      }
      return;
    }
    if (c.phase === 'wait') {
      if (c.t >= (save.fast ? 0.06 : 0.14)) { c.phase = 'scan'; c.t = 0; }
    }
  };

  /* --------------------------------------------------------------- resolve -- */
  PlayScene.resolveSpin = function () {
    var m = this.machine, res = this.res, b = this.bet();
    this.markWinCells();
    // features first, then payout
    if (m.id === 'ghost' && res.bonus) { this.startHold(); return; }
    if (res.wheel) { this.startWheel(); return; }
    if (res.prize) { this.startPick(); return; }
    if (res.free && res.free.spins && res.free.spins.length) { this.startFree(); return; }
    this.finishSpin();
  };

  PlayScene.clearMarks = function () {
    for (var i = 0; i < this.marks.length; i++) this.marks[i].setVisible(false);
  };
  PlayScene.markWinCells = function () {
    this.clearMarks();
    var m = this.machine, res = this.res, L = this.L, g = GEO[m.id], n = 0, self = this;
    function mark(col, row, tint) {
      if (n >= self.marks.length) return;
      var mk = self.marks[n++];
      mk.setVisible(true);
      mk.x = L.gridX + (col + 0.5) * L.cw;
      mk.y = L.gridY + (row + 0.5) * L.ch;
      mk.setTint(tint || 0xffc23d);
      mk.setAlpha(0.9);
      mk.setDisplaySize(L.cw * 0.98, L.cw * 0.98);
    }
    if (res.mult <= 0) return;
    if (m.id === 'orchard') { for (var c = 0; c < 3; c++) mark(c, 1); }
    else if (m.id === 'ghost') { for (var c2 = 0; c2 < 5; c2++) mark(c2, 0); }
    else if (m.id === 'midway' || m.id === 'carousel') {
      for (var c3 = 0; c3 < g.cols; c3++) for (var r3 = 0; r3 < g.rows; r3++) {
        var s = res.grid && res.grid[c3] ? res.grid[c3][r3] : null;
        if (s === 'WLD' || s === 'SCT' || s === 'WHL' || s === 'STA' || s === 'PRZ') mark(c3, r3, 0x35e0d0);
      }
    }
  };

  PlayScene.finishSpin = function () {
    var m = this.machine, res = this.res, b = this.bet();
    var raw = res.mult * b;
    var win = raw > 0 ? Math.max(1, Math.round(raw)) : 0;
    this.win = win;
    save.bank += win;
    this.session.won += win;
    if (win > 0) this.session.hits++;
    if (save.bank > this.session.peak) this.session.peak = save.bank;
    if (save.bank < this.session.low) this.session.low = save.bank;
    if (save.bank > save.bestPeak) save.bestPeak = save.bank;
    var st = save.m[m.id];
    st.won += win;
    if (win > 0) st.hits++;
    if (win > st.best) st.best = win;

    var ratio = res.mult;
    var tier = 0;
    for (var i = WIN_TIERS.length - 1; i >= 0; i--) {
      if (ratio >= WIN_TIERS[i].at && (i > 0 || ratio > 0)) { tier = i; break; }
    }
    if (ratio <= 0) tier = 0;
    this.winTier = tier;
    this.winShown = 0;
    this.celebrate(tier, win);

    // badges from the machine result plus the parlour wide ones
    var tags = [];
    for (var p = 0; p < res.parts.length; p++) tags.push(res.parts[p].tag);
    if (res.badges) for (var bI = 0; bI < res.badges.length; bI++) this.award(res.badges[bI]);
    if (ratio >= 50) this.award('big_hit');
    if (save.bank >= 5000) this.award('ladder_v');
    if (st.spins >= 100) this.award('century');

    this.progressLevel(m.id);
    this.rushEvent({ type: 'spin', machine: m.id, mult: ratio, tags: tags, tumbles: res.tumbles || 0 });
    if (res.bonus) this.rushEvent({ type: 'feature', feature: 'hold', coins: res.bonus.filled });
    if (res.free) this.rushEvent({ type: 'feature', feature: 'free' });
    if (res.wheel) this.rushEvent({ type: 'feature', feature: 'wheel' });
    if (res.prize) this.rushEvent({ type: 'feature', feature: 'pick' });

    this.spinState = 'idle';
    hook.spinning = false; hook.feature = '';
    this.fx = null;
    this.setPip(tier >= 3 ? 'cheer' : tier > 0 ? 'nod' : 'shrug');
    persist();
    this.applyMusic();
    this.coachAdvance('result');
    this.buildHits();
  };

  PlayScene.celebrate = function (tier, win) {
    var L = this.L, cx = VW / 2, cy = (L.cabTop + L.cabBottom) / 2;
    if (tier <= 0) {
      setV(this.winChip, false); setV(this.winTxt, false);
      return;
    }
    var T = WIN_TIERS[tier];
    setV(this.winChip, true); setV(this.winTxt, true);
    if (T.sfx) kit.audio.sfx(T.sfx);
    if (T.shake) kit.juice.shake(T.shake, 220 + tier * 60);
    if (tier >= 4) kit.juice.hitStop(tier >= 5 ? 90 : 60);
    var tint = tier >= 4 ? 0xffc23d : tier >= 3 ? 0x7ef2a8 : 0x35e0d0;
    this.emit('spark', cx, cy, 6 + tier * 4, { spd: 300, g: 500, life: 0.6, s0: 0.6, s1: 0, tint: tint });
    this.emit('ring', cx, cy, 1, { spd: 0, g: 0, life: 0.55, s0: 0.4, s1: 2.6, alpha: 0.7, tint: tint });
    if (tier >= 2) this.emit('coin', cx, cy, 6 + tier * 4, { spd: 340, lift: 240, g: 900, life: 1.1, s0: 0.8, s1: 0.5 });
    if (tier >= 3) {
      this.emit('confetti', cx, L.bandTop + 30, 14 + tier * 8,
        { spd: 260, lift: 120, g: 620, life: 1.6, s0: 0.9, s1: 0.8, tint: 0xffffff });
      this.emit('star', cx, cy, 8 + tier * 3, { spd: 320, g: 520, life: 0.9, s0: 0.5, s1: 0, tint: 0xffe8c9 });
      this.showBanner(T.banner, '+' + nf(win) + ' coins', tier >= 4 ? PAL.gold : PAL.mint);
    }
  };

  PlayScene.award = function (id) {
    if (!id || save.badges[id]) return;
    if (META.BADGE_IDS.indexOf(id) < 0) return;
    save.badges[id] = true;
    var name = id;
    for (var i = 0; i < META.BADGES.length; i++) if (META.BADGES[i].id === id) name = META.BADGES[i].name;
    this.pushToast('Badge: ' + name);
    kit.audio.sfx('collect');
    persist();
  };

  PlayScene.progressLevel = function (id) {
    var st = save.m[id];
    var lp = META.levelProgress(st.spins);
    if (lp.level <= st.level) return;
    while (st.level < lp.level) {
      st.level++;
      var coins = META.LEVEL_COINS[Math.min(st.level - 1, META.LEVEL_COINS.length - 1)];
      save.bank += coins;
      kit.audio.sfx('level_up');
      this.pushToast('LV ' + st.level + '  +' + nf(coins));
      this.emit('star', VW / 2, this.L.barBottom + 30, 10,
        { spd: 260, g: 520, life: 0.8, s0: 0.5, s1: 0, tint: 0xffc23d });
      var ti = META.TICKET_LEVELS.indexOf(st.level);
      if (ti >= 0 && !st.tickets[ti]) {
        st.tickets[ti] = true;
        var names = META.TICKET_NAMES[id] || [];
        this.pushToast('Prize: ' + (names[ti] || 'ticket'));
      }
      if (st.level >= META.UNLOCK_LEVEL) {
        var idx = META.MACHINE_IDS.indexOf(id);
        if (idx >= 0 && save.unlocked === idx + 1 && save.unlocked < META.MACHINE_IDS.length) {
          save.unlocked++;
          this.showBanner('MACHINE OPEN', META.MACHINE_TITLES[META.MACHINE_IDS[save.unlocked - 1]], PAL.teal);
          kit.audio.sfx('fanfare');
          this.emit('confetti', VW / 2, this.L.bandTop + 30, 34,
            { spd: 280, lift: 140, g: 620, life: 1.8, s0: 0.9, s1: 0.8 });
          hook.unlocked = save.unlocked;
          if (save.unlocked >= META.MACHINE_IDS.length) this.award('tour_complete');
        }
      }
      if (!st.setDone && st.tickets.every(function (v) { return v; })) {
        st.setDone = true;
        save.bank += META.SET_BONUS;
        this.showBanner('PRIZE SET', '+' + nf(META.SET_BONUS) + ' coins', PAL.gold);
        kit.audio.sfx('fanfare');
        var all = META.MACHINE_IDS.every(function (mid) { return save.m[mid].setDone; });
        if (all) this.award('collector');
      }
      this.rushEvent({ type: 'level', machine: id, level: st.level });
    }
    persist();
  };

  PlayScene.rushEvent = function (ev) {
    var done = META.rushProgress(save, ev);
    if (done) {
      save.bank += done.coins;
      kit.audio.sfx('level_up');
      this.pushToast('Rush ' + done.id.slice(1) + '  +' + nf(done.coins));
      this.emit('coin', VW - 96, this.L.dockY + 150, 10,
        { spd: 260, lift: 220, g: 900, life: 0.9, s0: 0.8, s1: 0.3 });
    }
    hook.rush = save.rush;
    persist();
  };

  /* -------------------------------------------------------------- features -- */
  PlayScene.curtainWipe = function (cb) {
    this.fxCurtain = { t: 0, dur: save.fast ? 0.26 : 0.4, cb: cb, fired: false };
    this.curtain.setVisible(true);
    this.curtain.setAlpha(0);
  };
  PlayScene.stepCurtain = function (dt) {
    var c = this.fxCurtain;
    if (!c) return;
    c.t += dt;
    var f = clamp(c.t / c.dur, 0, 1);
    var a = f < 0.5 ? f * 2 : (1 - f) * 2;
    this.curtain.setAlpha(a * 0.92);
    var L = this.L;
    this.curtain.setDisplaySize(VW * 1.2, (L.cabBottom - L.cabTop) * 1.1);
    if (f >= 0.5 && !c.fired) { c.fired = true; if (c.cb) c.cb(); }
    if (f >= 1) { this.curtain.setVisible(false); this.fxCurtain = null; }
  };

  PlayScene.startHold = function () {
    var res = this.res, self = this;
    hook.feature = 'hold';
    this.spinState = 'feature';
    this.clearMarks();
    this.showBanner('HOLD AND SPIN', 'Lock the coins', PAL.teal, 0.85);
    kit.audio.sfx('fanfare');
    this.curtainWipe(function () {
      self.fx = { kind: 'hold', round: 0, t: 0, phase: 'enter', vals: res.bonus.rounds[0].vals.slice() };
      self.applyMusic();
      self.paintHold();
    });
  };
  PlayScene.paintHold = function () {
    var f = this.fx, L = this.L;
    if (!f || f.kind !== 'hold') return;
    for (var i = 0; i < 5; i++) {
      var t = this.coinTx[i];
      var v = f.vals[i];
      t.setVisible(v > 0);
      if (v > 0) {
        t.x = L.gridX + (i + 0.5) * L.cw;
        t.y = L.gridY + L.ch * 0.5 + 4;
        setT(t, xs(v));
        setC(t, v >= 38 ? PAL.gold : PAL.ink);
      }
      var imgs = this.reelImgs[i];
      for (var r = 0; r < imgs.length; r++) {
        if (v > 0) { imgs[r].setTexture(this.symTex('COIN')); imgs[r].setAlpha(r === 1 ? 1 : 0); }
      }
      this.reels[i].lastIdx.length = 0;
    }
    var rounds = this.res.bonus.rounds;
    var left = rounds[Math.min(f.round, rounds.length - 1)].left;
    this.setFeatureChip('RESPINS ' + left + '   ' + f.vals.filter(function (v) { return v > 0; }).length + '/5');
  };
  PlayScene.stepHold = function (dt) {
    var f = this.fx, res = this.res;
    if (!f || f.kind !== 'hold') return;
    f.t += dt;
    var wait = save.fast ? 0.34 : 0.62;
    if (f.phase === 'enter') { if (f.t >= wait * 0.6) { f.phase = 'spin'; f.t = 0; } return; }
    if (f.t < wait) return;
    f.t = 0;
    var rounds = res.bonus.rounds;
    f.round++;
    if (f.round >= rounds.length) {
      var filled = res.bonus.filled;
      this.setFeatureChip('');
      for (var i = 0; i < 5; i++) this.coinTx[i].setVisible(false);
      this.fx = null;
      this.showBanner(filled === 5 ? 'FULL VAULT' : 'TRAIN PAID',
        '+' + nf(Math.round(res.bonus.total * this.bet())) + ' coins', filled === 5 ? PAL.gold : PAL.mint);
      this.finishSpin();
      return;
    }
    var round = rounds[f.round];
    f.vals = round.vals.slice();
    for (var g = 0; g < round.gained.length; g++) {
      var ci = round.gained[g];
      var L = this.L;
      kit.audio.sfx('coin_lock');
      this.emit('coin', L.gridX + (ci + 0.5) * L.cw, L.gridY + L.ch * 0.5, 8,
        { spd: 240, lift: 150, g: 900, life: 0.8, s0: 0.7, s1: 0.3 });
      this.emit('ring', L.gridX + (ci + 0.5) * L.cw, L.gridY + L.ch * 0.5, 1,
        { spd: 0, g: 0, life: 0.4, s0: 0.3, s1: 1.6, alpha: 0.8, tint: 0xffc23d });
      kit.juice.shake(3, 140);
    }
    this.paintHold();
  };

  PlayScene.startFree = function () {
    var res = this.res, self = this;
    hook.feature = 'free';
    this.spinState = 'feature';
    this.clearMarks();
    var n = res.free.count;
    this.showBanner('FREE SPINS', n + ' spins awarded', PAL.violet, 0.85);
    kit.audio.sfx('fanfare');
    this.curtainWipe(function () {
      self.fx = { kind: 'free', idx: -1, t: 0, phase: 'next', total: 0 };
      self.applyMusic();
    });
  };
  PlayScene.stepFree = function (dt) {
    var f = this.fx, res = this.res, m = this.machine;
    if (!f || f.kind !== 'free') return;
    f.t += dt;
    var spins = res.free.spins;
    if (f.phase === 'next') {
      if (f.t < (save.fast ? 0.16 : 0.3)) return;
      f.idx++;
      if (f.idx >= spins.length) {
        this.setFeatureChip('');
        this.fx = null;
        this.showBanner('FREE SPINS DONE',
          '+' + nf(Math.round(res.free.total * this.bet())) + ' coins', PAL.gold);
        this.finishSpin();
        return;
      }
      var sp = spins[f.idx];
      var strips = m.id === 'midway' ? (m.fsStrips || m.strips) : m.strips;
      for (var c = 0; c < GEO[m.id].cols; c++) {
        var r = this.reels[c], strip = strips[c] || this.stripFor(c);
        r.len = strip.length;
        r.state = 'brake'; r.t = 0; r.dur = save.fast ? 0.22 : 0.38 + c * 0.05;
        r.from = r.pos;
        var to = sp.stops[c];
        while (to < r.from + r.len) to += r.len;
        r.to = to;
        r.glow = 0;
        r.lastIdx.length = 0;
      }
      this.freeStrips = strips;
      f.phase = 'spin'; f.t = 0;
      kit.audio.sfx('spin_start', { volume: 0.7 });
      this.setFeatureChip('FREE ' + (f.idx + 1) + '/' + spins.length +
        (sp.mult ? '   x' + sp.mult : (res.free.mult ? '   x' + res.free.mult : '')));
      return;
    }
    if (f.phase === 'spin') {
      var moving = false;
      for (var c2 = 0; c2 < GEO[m.id].cols; c2++) {
        var rr = this.reels[c2];
        if (rr.state !== 'brake') continue;
        moving = true;
        rr.t += dt;
        var t = clamp(rr.t / rr.dur, 0, 1);
        rr.pos = rr.from + (rr.to - rr.from) * easeOutBack(t);
        rr.vel = (rr.to - rr.from) * (1 - t) * 3;
        if (t >= 1) { rr.pos = rr.to; rr.vel = 0; rr.state = 'idle'; kit.audio.sfx('reel_stop', { volume: 0.7 }); }
      }
      this.paintFree();
      if (!moving) {
        var w = spins[f.idx].win;
        if (w > 0) {
          f.total += w;
          kit.audio.sfx('win_small');
          var L = this.L;
          this.emit('spark', VW / 2, (L.cabTop + L.cabBottom) / 2, 6,
            { spd: 260, g: 480, life: 0.5, s0: 0.5, s1: 0, tint: 0xa06bff });
        }
        f.phase = 'next'; f.t = 0;
      }
    }
  };
  PlayScene.paintFree = function () {
    var m = this.machine, g = GEO[m.id], L = this.L;
    var strips = this.freeStrips || m.strips;
    for (var c = 0; c < g.cols; c++) {
      var r = this.reels[c], strip = strips[c] || this.stripFor(c), len = strip.length;
      var base = Math.floor(r.pos), frac = r.pos - base;
      var imgs = this.reelImgs[c];
      for (var i = 0; i < g.rows + 2; i++) {
        var si = ((base + i - 1) % len + len) % len;
        if (r.lastIdx[i] !== si) { imgs[i].setTexture(this.symTex(strip[si])); r.lastIdx[i] = si; }
        imgs[i].y = (i - 1) * L.ch + L.ch / 2 - frac * L.ch;
        imgs[i].setAlpha(1);
        imgs[i].setScale(L.cw * 0.78 / 128);
      }
    }
  };

  PlayScene.startWheel = function () {
    var res = this.res, self = this;
    hook.feature = 'wheel';
    this.spinState = 'feature';
    this.clearMarks();
    this.showBanner('GRAND WHEEL', 'Spun for ' + this.machine.wheelStake + 'x your bet', PAL.gold, 0.85);
    kit.audio.sfx('fanfare');
    this.curtainWipe(function () {
      var layout = M.D.layout, matches = [];
      for (var i = 0; i < layout.length; i++) if (layout[i] === res.wheel.seg) matches.push(i);
      var pickIdx = matches.length ? matches[(Math.random() * matches.length) | 0] : 0;
      var per = 6.2832 / layout.length;
      var target = -(pickIdx * per) + 6.2832 * (save.fast ? 3 : 5);
      self.fx = {
        kind: 'wheel', t: 0, dur: save.fast ? 2.0 : 3.4, from: 0, to: target,
        phase: 'spin', tick: 0, lastWedge: -1
      };
      self.wheelCon.setVisible(true);
      self.wheelFace.rotation = 0;
      self.applyMusic();
      self.setFeatureChip('GRAND WHEEL');
    });
  };
  PlayScene.stepWheel = function (dt) {
    var f = this.fx, res = this.res;
    if (!f || f.kind !== 'wheel') return;
    f.t += dt;
    if (f.phase === 'spin') {
      var t = clamp(f.t / f.dur, 0, 1);
      var e = 1 - Math.pow(1 - t, 3.4);
      this.wheelFace.rotation = f.from + (f.to - f.from) * e;
      var wedge = Math.floor(this.wheelFace.rotation / (6.2832 / M.D.layout.length));
      if (wedge !== f.lastWedge) {
        f.lastWedge = wedge;
        if (t < 0.995) kit.audio.sfx('wheel_tick', { volume: 0.5, rate: 0.9 + t * 0.5 });
      }
      this.wheelPtr.rotation = Math.sin(f.t * 40) * 0.08 * (1 - t);
      if (t >= 1) {
        f.phase = 'hold'; f.t = 0;
        kit.audio.sfx('wheel_stop');
        kit.juice.shake(6, 260);
        var L = this.L, cy = (L.cabTop + L.cabBottom) / 2;
        this.emit('confetti', VW / 2, cy - 120, res.wheel.value >= 25 ? 34 : 12,
          { spd: 300, lift: 180, g: 660, life: 1.5, s0: 0.9, s1: 0.8 });
        this.emit('ring', VW / 2, cy, 1, { spd: 0, g: 0, life: 0.6, s0: 0.5, s1: 3, alpha: 0.8, tint: 0xffc23d });
        this.setFeatureChip('WHEEL ' + res.wheel.label);
      }
      return;
    }
    if (f.t >= (save.fast ? 0.5 : 0.95)) {
      this.wheelCon.setVisible(false);
      this.setFeatureChip('');
      this.fx = null;
      var pay = res.wheel.value * this.machine.wheelStake;
      this.showBanner(res.wheel.seg === 9 ? 'GRAND RING' : 'WHEEL PAID',
        pay > 0 ? '+' + nf(Math.round(pay * this.bet())) + ' coins' : 'No wedge value', PAL.gold);
      if (res.prize) { this.startPick(); return; }
      if (res.free && res.free.spins && res.free.spins.length) { this.startFree(); return; }
      this.finishSpin();
    }
  };

  PlayScene.startPick = function () {
    var res = this.res, self = this;
    hook.feature = 'pick';
    this.spinState = 'feature';
    this.clearMarks();
    this.showBanner('PRIZE BOOTH', 'Pick ' + M.D.picks + ' booths', PAL.teal, 0.85);
    kit.audio.sfx('fanfare');
    this.curtainWipe(function () {
      self.fx = { kind: 'pick', taken: 0, t: 0, phase: 'pick', revealed: [] };
      self.pickCon.setVisible(true);
      for (var i = 0; i < 9; i++) {
        self.pickBtns[i].setTexture('btn_pick');
        self.pickBtns[i].setAlpha(1);
        setT(self.pickTx[i], '?');
        setC(self.pickTx[i], PAL.ink);
      }
      self.applyMusic();
      self.setFeatureChip('PICKS 0/' + M.D.picks);
      self.buildHits();
    });
  };
  PlayScene.pickBooth = function (i) {
    var f = this.fx, res = this.res;
    if (!f || f.kind !== 'pick' || f.phase !== 'pick') return;
    if (f.revealed.indexOf(i) >= 0) return;
    var v = res.prize.picked[f.taken];
    f.revealed.push(i);
    f.taken++;
    setT(this.pickTx[i], xs(v));
    setC(this.pickTx[i], v >= 20 ? PAL.gold : PAL.ink);
    this.pickBtns[i].setTexture('btn_accent');
    kit.audio.sfx(v >= 20 ? 'win_mid' : 'collect');
    var L = this.L;
    this.emit('star', this.pickCon.x + this.pickBtns[i].x, this.pickCon.y + this.pickBtns[i].y, 8,
      { spd: 240, g: 520, life: 0.7, s0: 0.5, s1: 0, tint: 0x35e0d0 });
    kit.juice.shake(3, 140);
    this.setFeatureChip('PICKS ' + f.taken + '/' + M.D.picks);
    if (f.taken >= M.D.picks) {
      f.phase = 'reveal'; f.t = 0;
      // show what was behind the rest, so the booth is never a mystery
      var b = 0;
      for (var k = 0; k < 9; k++) {
        if (f.revealed.indexOf(k) >= 0) continue;
        var other = res.prize.board[M.D.picks + (b++)] || res.prize.board[0];
        setT(this.pickTx[k], xs(other));
        setC(this.pickTx[k], PAL.mute);
        this.pickBtns[k].setAlpha(0.45);
      }
      this.buildHits();
    }
  };
  PlayScene.stepPick = function (dt) {
    var f = this.fx, res = this.res;
    if (!f || f.kind !== 'pick') return;
    if (f.phase === 'pick') {
      f.t += dt;
      // If nobody touches the booth the barker picks for you, so the run
      // always resolves and never sits on a dead screen.
      if (f.t > 7) {
        for (var i = 0; i < 9 && f.taken < M.D.picks; i++) {
          if (f.revealed.indexOf(i) < 0) this.pickBooth(i);
        }
      }
      return;
    }
    f.t += dt;
    if (f.t >= (save.fast ? 0.7 : 1.2)) {
      this.pickCon.setVisible(false);
      this.setFeatureChip('');
      this.fx = null;
      this.showBanner('BOOTH PAID', '+' + nf(Math.round(res.prize.total * this.bet())) + ' coins', PAL.teal);
      if (res.free && res.free.spins && res.free.spins.length) { this.startFree(); return; }
      this.finishSpin();
    }
  };

  /* --------------------------------------------------------------- banners -- */
  PlayScene.showBanner = function (title, sub, col, hold) {
    this.banner = { title: title, sub: sub, col: col || PAL.gold, hold: hold || 0 };
    this.bannerT = 0;
    this.bannerImg.setVisible(true);
    this.bannerTitle.setVisible(true);
    this.bannerSub.setVisible(!!sub);
    setT(this.bannerTitle, title);
    setC(this.bannerTitle, col || PAL.gold);
    setT(this.bannerSub, sub || '');
  };
  PlayScene.dismissBanner = function () {
    this.banner = null;
    this.bannerImg.setVisible(false);
    this.bannerTitle.setVisible(false);
    this.bannerSub.setVisible(false);
  };
  PlayScene.stepBanner = function (dt) {
    if (!this.banner) return;
    this.bannerT += dt;
    var t = this.bannerT;
    var hold = this.banner.hold || (this.winTier >= 4 ? 2.1 : 1.5);
    var s, a = 1;
    if (t < 0.42) { s = kit.juice.enabled ? easeOutBack(t / 0.42) : easeOutCubic(t / 0.42); }
    else if (t < hold) s = 1;
    else { var f = clamp((t - hold) / 0.34, 0, 1); s = 1 - f * 0.12; a = 1 - f; }
    this.bannerImg.setScale(s * 0.98, s * 0.98);
    this.bannerImg.setAlpha(a);
    this.bannerTitle.setScale(s); this.bannerTitle.setAlpha(a);
    this.bannerSub.setScale(s); this.bannerSub.setAlpha(a);
    if (t > hold + 0.34) this.dismissBanner();
  };

  /* ----------------------------------------------------------------- coach -- */
  var COACH = [
    { key: 'spin', text: 'Tap SPIN to play. Each spin costs your bet.' },
    { key: 'result', text: 'The i button shows this machine posted odds.' },
    { key: 'result', text: 'Coins are play money. Top up free any time.' },
    { key: 'result', text: 'Fill the level bar to open the next machine.' }
  ];
  PlayScene.startCoach = function () {
    if (save.tutorial >= COACH.length) return;
    this.setCoach(COACH[save.tutorial].text);
  };
  PlayScene.coachAdvance = function (key) {
    if (save.tutorial >= COACH.length) return;
    if (COACH[save.tutorial].key !== key) return;
    save.tutorial++;
    persist();
    if (save.tutorial < COACH.length) this.setCoach(COACH[save.tutorial].text);
  };
  PlayScene.setCoach = function (txt) {
    this.coach = txt; this.coachT = 0;
    setT(this.coachTxt, txt);
  };
  PlayScene.stepCoach = function (dt) {
    var on = !!this.coach && this.mode === 'play';
    setV(this.coachBg, on); setV(this.coachTxt, on);
    if (!on) return;
    this.coachT += dt;
    var a = this.coachT < 0.3 ? this.coachT / 0.3 :
      this.coachT > 3.4 ? clamp(1 - (this.coachT - 3.4) / 0.8, 0, 1) : 1;
    this.coachBg.setAlpha(a * 0.92);
    this.coachTxt.setAlpha(a);
    if (this.coachT > 4.2) { this.coach = ''; setV(this.coachBg, false); setV(this.coachTxt, false); }
  };

  /* ---------------------------------------------------------------- toasts -- */
  PlayScene.pushToast = function (txt) {
    if (this.toastQ.length > 3) this.toastQ.shift();
    this.toastQ.push(txt);
  };
  PlayScene.stepToast = function (dt) {
    // one transient at a time: the coach strip has priority, and a sheet
    // owns the whole screen so nothing floats over it
    if (this.mode !== 'play' || (this.coach && this.mode === 'play')) {
      if (this.mode !== 'play') { this.toast = null; this.toastQ.length = 0; }
      setV(this.toastBg, false); setV(this.toastTxt, false);
      return;
    }
    if (!this.toast && this.toastQ.length) {
      this.toast = this.toastQ.shift();
      this.toastT = 0;
      setT(this.toastTxt, this.toast);
    }
    var on = !!this.toast;
    setV(this.toastBg, on); setV(this.toastTxt, on);
    if (!on) return;
    this.toastT += dt;
    var a = this.toastT < 0.16 ? this.toastT / 0.16 :
      this.toastT > 1.0 ? clamp(1 - (this.toastT - 1.0) / 0.4, 0, 1) : 1;
    this.toastBg.setAlpha(a * 0.9);
    this.toastTxt.setAlpha(a);
    this.toastBg.y = this.L.barBottom + 40 - (1 - a) * 8;
    this.toastTxt.y = this.toastBg.y;
    if (this.toastT > 1.45) this.toast = null;
  };
  PlayScene.setFeatureChip = function (txt) {
    var on = !!txt && this.mode === 'play';
    setV(this.featChip, on); setV(this.featTxt, on);
    if (on) setT(this.featTxt, txt);
  };

  /* ------------------------------------------------------------------- pip -- */
  PlayScene.setPip = function (state) {
    if (this.pipState === state) return;
    this.pipState = state; this.pipT = 0;
  };
  PlayScene.stepPip = function (dt) {
    if (!this.pip.visible) return;
    this.pipT += dt;
    var t = this.t, s = this.pipState;
    var bob = Math.sin(t * 3.1) * 3;
    var armL = 0, armR = 0, headR = 0, bodyS = 1, caneR = 0;
    if (s === 'idle') {
      armL = Math.sin(t * 2.2) * 0.12; armR = -Math.sin(t * 2.2) * 0.12;
      headR = Math.sin(t * 1.4) * 0.05;
      caneR = Math.sin(t * 2.2) * 0.1;
    } else if (s === 'anticipate') {
      bob = Math.sin(t * 9) * 2;
      armL = -0.7 + Math.sin(t * 13) * 0.1; armR = 0.7 - Math.sin(t * 13) * 0.1;
      headR = Math.sin(t * 11) * 0.09; bodyS = 1.02;
      caneR = -0.5;
    } else if (s === 'cheer') {
      var c = Math.min(this.pipT * 5, 1);
      bob = -8 * Math.abs(Math.sin(t * 8)) * c;
      armL = -2.1; armR = 2.1;
      headR = Math.sin(t * 9) * 0.16; bodyS = 1 + 0.05 * Math.sin(t * 9);
      caneR = 1.4;
      if (this.pipT > 2.2) this.setPip('idle');
    } else if (s === 'nod') {
      headR = Math.sin(this.pipT * 12) * 0.16 * clamp(1 - this.pipT / 1.2, 0, 1);
      armL = -0.4; armR = 0.4;
      if (this.pipT > 1.4) this.setPip('idle');
    } else if (s === 'shrug') {
      armL = -1.0; armR = 1.0;
      headR = -0.1;
      bodyS = 0.985;
      if (this.pipT > 1.2) this.setPip('idle');
    }
    this.pipBody.y = -104 + bob;
    this.pipBody.setScale(1, bodyS);
    this.pipHead.y = -150 + bob;
    this.pipHead.rotation = headR;
    this.pipHat.y = -188 + bob - Math.abs(headR) * 6;
    this.pipHat.rotation = headR * 1.2;
    this.pipArmL.y = -110 + bob; this.pipArmL.rotation = armL;
    this.pipArmR.y = -110 + bob; this.pipArmR.rotation = armR;
    this.pipCane.y = -98 + bob; this.pipCane.rotation = caneR;
  };

  /* ------------------------------------------------------------------- hud -- */
  PlayScene.paintHud = function () {
    setT(this.coinTxt, nf(save.bank));
    setC(this.coinTxt, save.bank < META.TOPUP_FLOOR ? PAL.rose : PAL.gold);
    if (this.mode !== 'play') {
      this.coinIcon.x = 40; this.coinIcon.y = this.L.top + 40;
      this.coinTxt.x = 68; this.coinTxt.y = this.L.top + 40;
      return;
    }
    var st = save.m[this.machine.id];
    var lp = META.levelProgress(st.spins);
    setT(this.lvTxt, 'LV ' + lp.level + (lp.max ? '  MAX' : '  ' + lp.have + '/' + lp.need));
    this.barFill.setCrop(0, 0, 300 * lp.frac, 16);
    setT(this.betTxt, 'BET ' + nf(this.bet()));
    var spinLabel = this.spinState === 'idle' ? 'SPIN' : 'STOP';
    setT(this.spinTxt, spinLabel);
    this.btnSpin.setAlpha(save.bank >= this.bet() || this.spinState !== 'idle' ? 1 : 0.55);
    setT(this.btnTx.fast, save.fast ? '>>' : '>');
    setC(this.btnTx.fast, save.fast ? PAL.gold : PAL.dim);
    var now = Date.now();
    var ready = META.topUpReady(save, now);
    setC(this.btnTx.topup, ready ? PAL.mint : PAL.mute);
    setT(this.btnTx.topup, ready ? 'FREE' : '+C');
    setC(this.btnTx.rush, save.rush < META.RUSH.length ? PAL.gold : PAL.mute);
    // win count up
    if (this.win > 0) {
      this.winShown = Math.min(this.win, this.winShown + Math.max(1, this.win * 0.06));
      setT(this.winTxt, '+' + nf(this.winShown));
      setC(this.winTxt, this.winTier >= 4 ? PAL.gold : this.winTier >= 3 ? PAL.mint : PAL.teal);
    }
    hook.coins = save.bank; hook.score = save.bank;
    hook.unlocked = save.unlocked; hook.rush = save.rush;
    hook.stage = this.mi; hook.machine = this.machine.id;
    hook.bet = this.bet();
    hook.health = clamp(save.bank / Math.max(1, META.START_BANK), 0, 1);
    hook.progress = clamp((save.unlocked - 1 + lp.frac) / META.MACHINE_IDS.length, 0, 1);
  };

  /* ------------------------------------------------------------------ step -- */
  PlayScene.stepBg = function (dt) {
    // Ambient drift is decorative: half rate is indistinguishable and halves
    // the per frame cost of the backdrop layer.
    this.bgTick = (this.bgTick || 0) + 1;
    if (this.bgTick & 1) return;
    dt *= 2;
    var vh = this.vh || 1280;
    for (var i = 0; i < this.bokeh.length; i++) {
      var b = this.bokeh[i];
      b.y += b.vy * dt; b.x += b.vx * dt;
      if (b.y < -0.1) { b.y = 1.1; b.x = Math.random(); }
      if (b.x < -0.1) b.x = 1.1; else if (b.x > 1.1) b.x = -0.1;
      b.ph += dt * 1.4;
      b.img.x = b.x * VW;
      b.img.y = b.y * vh;
      b.img.setScale(b.s * (0.9 + Math.sin(b.ph) * 0.12));
      b.img.setAlpha(b.a * (0.7 + Math.sin(b.ph * 0.7) * 0.3));
    }
  };

  PlayScene.step = function (dt) {
    this.t += dt;
    this.stepBg(dt);
    this.stepParticles(dt);
    this.stepCurtain(dt);
    this.stepBanner(dt);
    this.stepCoach(dt);
    this.stepToast(dt);
    this.stepPip(dt);
    if (this.mode === 'play') {
      if (this.spinState === 'reels') {
        if (this.machine.id === 'cascade') this.stepCascade(dt);
        else this.stepReels(dt);
      } else if (this.fx) {
        if (this.fx.kind === 'hold') this.stepHold(dt);
        else if (this.fx.kind === 'free') this.stepFree(dt);
        else if (this.fx.kind === 'wheel') this.stepWheel(dt);
        else if (this.fx.kind === 'pick') this.stepPick(dt);
      }
      for (var i = 0; i < this.marks.length; i++) {
        var mk = this.marks[i];
        if (mk.visible) mk.setAlpha(0.45 + 0.35 * Math.sin(this.t * 7 + i));
      }
    }
    if (this.skill && this.mode === 'skill' && this.skill.phase === 'aim') {
      var sp = this.skill.def.speed[Math.min(this.skill.throwIdx, this.skill.def.speed.length - 1)];
      this.skill.pos += this.skill.dir * sp * dt;
      if (this.skill.pos > 1) { this.skill.pos = 1; this.skill.dir = -1; }
      if (this.skill.pos < 0) { this.skill.pos = 0; this.skill.dir = 1; }
      this.skillPaintT = (this.skillPaintT || 0) + dt;
      if (this.skillPaintT > 0.05) { this.skillPaintT = 0; this.renderSkill(); }
    }
  };

  PlayScene.update = function (time, delta) {
    var j = kit.juice.frame();
    this.root.x = j.dx; this.root.y = j.dy;
    if (kit.paused) return;
    this.pumpKeys();
    if (!j.frozen) {
      this.acc += Math.min(delta, 100);
      var steps = 0;
      while (this.acc >= STEP * 1000 && steps < MAX_STEPS) {
        this.step(STEP);
        this.acc -= STEP * 1000;
        steps++;
      }
      if (steps >= MAX_STEPS) this.acc = 0;   // never let the clock outrun the sim
    }
    this.paintHud();
    // backdrop selection
    var wantBd = this.mode === 'play' ? this.machine.id : META.MACHINE_IDS[clamp(save.unlocked - 1, 0, 4)];
    for (var i = 0; i < META.MACHINE_IDS.length; i++) {
      var id = META.MACHINE_IDS[i];
      setV(this.bdImgs[id], id === wantBd);
    }
  };

  PlayScene.pumpKeys = function () {
    while (this.keyQ.length) {
      var c = this.keyQ.shift();
      if (c === 'Space' || c === 'Enter') {
        if (this.mode === 'title') this.act('tPlay');
        else if (this.mode === 'skill' && this.skill) this.skillThrow();
        else if (this.mode === 'play') this.trySpin();
        else this.act('closeSheet');
      } else if (c === 'Escape' || c === 'KeyB') {
        if (this.mode === 'play') this.setMode('title');
        else if (this.mode !== 'title') this.act('closeSheet');
      } else if (c === 'ArrowRight' || c === 'Equal' || c === 'NumpadAdd') this.changeBet(1);
      else if (c === 'ArrowLeft' || c === 'Minus' || c === 'NumpadSubtract') this.changeBet(-1);
      else if (c === 'KeyF') this.act('fast');
      else if (c === 'KeyI') { this.returnMode = 'play'; this.setMode(this.mode === 'paytable' ? 'play' : 'paytable'); }
      else if (c === 'KeyT') { this.returnMode = 'play'; this.setMode(this.mode === 'tour' ? 'play' : 'tour'); }
      else if (c === 'KeyR') { this.returnMode = 'play'; this.setMode(this.mode === 'rush' ? 'play' : 'rush'); }
      else if (c === 'KeyC') { this.returnMode = 'play'; this.setMode(this.mode === 'collection' ? 'play' : 'collection'); }
      else if (c === 'KeyP') kit.openSettings();
      else if (c === 'KeyM') kit.audio.setMute(!kit.audio.prefs.mute);
      else if (c.indexOf('Digit') === 0) {
        var n = parseInt(c.slice(5), 10);
        if (n >= 1 && n <= 5 && n <= save.unlocked) { this.selectMachine(n - 1); if (this.mode !== 'play') this.setMode('play'); }
      }
    }
  };

  PlayScene.onPaused = function () { this.keyQ.length = 0; this.dragStart = null; persist(); };
  PlayScene.onResumed = function () { this.keyQ.length = 0; };
  PlayScene.goTitle = function () {
    this.resetReels();
    this.setMode('title', true);
  };

  /* ------------------------------------------------------------------ boot -- */
  function toScene(config) {
    var K = function () { Phaser.Scene.call(this, { key: config.key }); };
    K.prototype = Object.create(Phaser.Scene.prototype);
    K.prototype.constructor = K;
    Object.keys(config).forEach(function (k) { K.prototype[k] = config[k]; });
    return K;
  }

  Game.phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: PAL.deep,
    scale: { mode: Phaser.Scale.RESIZE, width: VW, height: 1280 },
    render: { antialias: true, powerPreference: 'high-performance', roundPixels: false, batchSize: 2048 },
    fps: { target: 60, min: 30 },
    scene: [toScene(BootScene), toScene(PlayScene)]
  });
  kit.registerPWA();
  root.__CARNIVAL_REELS_READY = true;
})(typeof window !== 'undefined' ? window : globalThis);
