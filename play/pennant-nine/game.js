/* game.js — Pennant Nine, AAA rebuild.
 * Phaser 3 renderer over the PN rules sim. GGKit owns lifecycle, pointer
 * identity, saves, audio buses, loading, settings and the juice budget.
 */
(function (root) {
  'use strict';

  var PN = root.PN;
  var GEO = PN.GEO;
  var DW = 390;
  var DH = 844;
  var HIDPI_FACTOR = root.GGKit && root.GGKit.hiDpi ? root.GGKit.hiDpi.factor(DW, DH) : 1;
  var FY = PN.FIELD_Y;
  var C = PN.COLORS;
  var FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var STEP = 1 / 60;

  // --------------------------------------------------------------- kit
  var kit = root.GGKit.create({
    slug: 'pennant-nine',
    orientation: 'portrait',
    validateSave: PN.validateSave,
    onPause: function () { if (scene) scene.freeze(); },
    onResume: function () { if (scene) scene.thaw(); },
    onRestart: function () { if (scene) scene.hardRestart(); }
  });

  var save = PN.repairSave(kit.save.get(null));
  function persist() { kit.save.set(save); }

  var AUDIO = {
    'music-day': 'assets/music-day.mp3',
    'music-night': 'assets/music-night.mp3',
    'music-final': 'assets/music-final.mp3',
    'sfx-crack': 'assets/sfx-crack.mp3',
    'sfx-foul': 'assets/sfx-foul.mp3',
    'sfx-whiff': 'assets/sfx-whiff.mp3',
    'sfx-mitt': 'assets/sfx-mitt.mp3',
    'sfx-call': 'assets/sfx-call.mp3',
    'sfx-cheer': 'assets/sfx-cheer.mp3',
    'sfx-groan': 'assets/sfx-groan.mp3',
    'sfx-homer': 'assets/sfx-homer.mp3',
    'sfx-out': 'assets/sfx-out.mp3',
    'sfx-tap': 'assets/sfx-tap.mp3',
    'sfx-bell': 'assets/sfx-bell.mp3',
    'sfx-pitch': 'assets/sfx-pitch.mp3',
    'sfx-step': 'assets/sfx-step.mp3',
    'sfx-reward': 'assets/sfx-reward.mp3',
    'sfx-deny': 'assets/sfx-deny.mp3'
  };
  kit.audio.register(AUDIO);
  var SFX_KEYS = Object.keys(AUDIO).filter(function (k) { return k.indexOf('sfx-') === 0; });

  function sfx(name, opts) { kit.audio.sfx(name, opts); }

  var musicUnlocked = false;
  function playMusic(track) {
    if (!musicUnlocked) return;
    kit.audio.music(track, 900);
  }

  // ------------------------------------------------------- verify hook
  var hook = root.__pn = root.__pn || {};
  hook.version = 'aaa-1';
  hook.state = {
    ready: false, mode: 'boot', screen: 'boot', phase: 'boot', stage: '',
    progress: 0, score: 0, oppScore: 0, health: 1, inning: 0, half: '',
    outs: 0, balls: 0, strikes: 0, park: '', tier: 0, seasonGame: 0
  };
  hook.queue = hook.queue || [];
  hook.forceMode = function (m) {
    if (scene && scene.applyForceMode) return scene.applyForceMode(m);
    hook.queue.push(['mode', m]);
    return false;
  };
  hook.forceStage = function (s) {
    if (scene && scene.applyForceStage) return scene.applyForceStage(s);
    hook.queue.push(['stage', s]);
    return false;
  };

  // --------------------------------------------------------- input map
  var canvasEl = null;
  var controls = [];
  var controlIndex = Object.create(null);
  var claims = new Map();
  var keyEdges = Object.create(null);

  function clearControls() {
    controls.length = 0;
    controlIndex = Object.create(null);
  }
  function addControl(id, x, y, w, h, opts) {
    var c = controlIndex[id];
    if (!c) {
      c = { id: id, x: 0, y: 0, w: 0, h: 0, down: false, fireDown: false, enabled: true, drag: false };
      controls.push(c);
      controlIndex[id] = c;
    }
    c.x = x; c.y = y; c.w = w; c.h = h;
    c.fireDown = !!(opts && opts.fireDown);
    c.drag = !!(opts && opts.drag);
    c.enabled = true;
    c.down = false;
    return c;
  }
  function setEnabled(id, on) {
    var c = controlIndex[id];
    if (c) { c.enabled = !!on; if (!on) c.down = false; }
  }
  function isDown(id) {
    var c = controlIndex[id];
    return !!(c && c.down);
  }

  function toDesign(clientX, clientY) {
    if (!canvasEl) return null;
    var r = canvasEl.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: (clientX - r.left) / r.width * DW,
      y: (clientY - r.top) / r.height * DH
    };
  }
  function hit(c, p) {
    return c.enabled && p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h;
  }
  function findControl(p) {
    for (var i = controls.length - 1; i >= 0; i -= 1) {
      if (hit(controls[i], p)) return controls[i];
    }
    return null;
  }

  var tapHandler = null;
  var dragHandler = null;

  // Window level listeners registered AFTER GGKit init so the kit's own
  // pointer bookkeeping runs first and is never overwritten by ours.
  root.addEventListener('pointerdown', function (e) {
    var p = toDesign(e.clientX, e.clientY);
    if (!p) return;
    if (!musicUnlocked) { musicUnlocked = true; if (pendingMusic) playMusic(pendingMusic); }
    var kp = kit.input.pointers.get(e.pointerId);
    if (!kp) {
      kp = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, downAt: performance.now(), zone: null };
      kit.input.pointers.set(e.pointerId, kp);
    }
    var c = findControl(p);
    if (!c) return;
    kp.zone = c.id;
    claims.set(e.pointerId, c.id);
    c.down = true;
    if (c.drag && dragHandler) dragHandler(c.id, p);
    if (c.fireDown && tapHandler) tapHandler(c.id, p);
  }, { passive: true });

  root.addEventListener('pointermove', function (e) {
    var id = claims.get(e.pointerId);
    if (!id) return;
    var c = controlIndex[id];
    if (!c || !c.drag) return;
    var p = toDesign(e.clientX, e.clientY);
    if (p && dragHandler) dragHandler(id, p);
  }, { passive: true });

  function release(e) {
    var id = claims.get(e.pointerId);
    if (id == null) return;
    claims.delete(e.pointerId);
    var c = controlIndex[id];
    if (!c) return;
    c.down = false;
    var p = toDesign(e.clientX, e.clientY);
    if (e.type === 'pointerup' && p && hit(c, p) && !c.fireDown && tapHandler) tapHandler(id, p);
  }
  root.addEventListener('pointerup', release, { passive: true });
  root.addEventListener('pointercancel', release, { passive: true });
  root.addEventListener('blur', function () {
    claims.clear();
    for (var i = 0; i < controls.length; i += 1) controls[i].down = false;
  });

  root.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    keyEdges[e.code] = true;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      if (e.target === document.body || e.target === document.documentElement) e.preventDefault();
    }
    if (!musicUnlocked) { musicUnlocked = true; if (pendingMusic) playMusic(pendingMusic); }
  });
  function keyHit(code) {
    if (keyEdges[code]) { keyEdges[code] = false; return true; }
    return false;
  }
  function flushKeys() { keyEdges = Object.create(null); }

  var pendingMusic = null;
  function wantMusic(track) {
    pendingMusic = track;
    playMusic(track);
  }

  // ------------------------------------------------------------- utils
  function setText(o, s) { if (o && o.__t !== s) { o.__t = s; o.setText(s); } }
  function setTint(o, v) { if (o && o.__tint !== v) { o.__tint = v; o.setTint(v); } }
  function setCol(o, s) { if (o && o.__c !== s) { o.__c = s; o.setColor(s); } }
  function hexNum(s) { return parseInt(s.slice(1), 16); }
  var clamp = PN.clamp;

  function pad(s, n) {
    s = String(s);
    while (s.length < n) s = ' ' + s;
    return s;
  }
  function padr(s, n) {
    s = String(s);
    while (s.length < n) s += ' ';
    return s.slice(0, n);
  }

  // =================================================================
  // Boot scene: bakes every texture and pre-decodes the SFX bank.
  // =================================================================
  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'boot' }); },
    create: function () {
      this.cameras.main.setZoom(HIDPI_FACTOR);
      var self = this;
      kit.loader.show('Pennant Nine');
      kit.loader.progress(0.02);
      this.bakeProgress = 0;
      this.audioProgress = 0;
      this.audioDone = false;
      this.pump = PN.Art.bakeAll(this, function (f) { self.bakeProgress = f; });
      kit.audio.preload(SFX_KEYS).then(function () {
        self.audioDone = true;
        self.audioProgress = 1;
      }, function () {
        self.audioDone = true;
        self.audioProgress = 1;
      });
      this.baked = false;
      this.settleFrames = 0;
    },
    update: function () {
      if (!this.baked) {
        this.baked = this.pump();
      }
      var p = this.bakeProgress * 0.75 + this.audioProgress * 0.25;
      kit.loader.progress(clamp(p, 0, 1));
      if (this.baked && this.audioDone) {
        this.settleFrames += 1;
        if (this.settleFrames > 2) {
          kit.loader.progress(1);
          kit.loader.hide();
          this.scene.start('play');
        }
      }
    }
  });

  // =================================================================
  // Play scene
  // =================================================================
  var scene = null;

  var PlayScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function PlayScene() { Phaser.Scene.call(this, { key: 'play' }); },

    create: function () {
      scene = this;
      this.cameras.main.setZoom(HIDPI_FACTOR);
      canvasEl = this.game.canvas;
      this.cameras.main.setBackgroundColor('#071116');
      this.acc = 0;
      this.frozen = false;
      this.screen = '';
      this.menuObjects = [];
      this.tickers = [];

      this.buildField();
      this.buildParticles();
      this.buildHud();
      this.buildControls();
      this.buildTransient();

      tapHandler = this.onTap.bind(this);
      dragHandler = this.onDrag.bind(this);

      this.g = null;         // live game state
      this.mode = 'title';
      this.phase = 'idle';
      this.tut = null;
      this.derby = null;
      this.clutch = null;
      this.exhib = null;

      this.showTitle();

      var q = hook.queue.splice(0, hook.queue.length);
      for (var i = 0; i < q.length; i += 1) {
        if (q[i][0] === 'mode') this.applyForceMode(q[i][1]);
        else this.applyForceStage(q[i][1]);
      }
      hook.state.ready = true;
    },

    // ------------------------------------------------------ construction
    buildField: function () {
      this.field = this.add.image(0, FY, 'park_rowan').setOrigin(0, 0).setDepth(0);
      this.parkId = 'rowan';

      this.crowdGlow = this.add.image(DW / 2, FY + 150, 'crowdglow')
        .setDepth(2).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);

      var P = GEO.plate;
      this.catcher = this.add.image(P.x + 2, FY + P.y + 38, 'catcher').setDepth(14);

      this.pitcher = this.add.image(GEO.mound.x, FY + GEO.mound.y + 4, 'pit_set').setDepth(11);

      this.batter = this.add.image(P.x - 30, FY + P.y + 6, 'bat_idle').setDepth(15);
      this.batter.__pose = 'idle';

      this.fielders = [];
      for (var i = 0; i < 5; i += 1) {
        var f = this.add.image(0, 0, 'fld_run').setDepth(9).setVisible(false);
        this.fielders.push(f);
      }
      this.runners = [];
      for (var r = 0; r < 4; r += 1) {
        var rn = this.add.image(0, 0, 'away_trot').setDepth(10).setVisible(false).setScale(0.72);
        this.runners.push(rn);
      }

      this.zoneBox = this.add.image(GEO.zone.x, FY + GEO.zone.y, 'zonebox').setDepth(16).setAlpha(0);
      this.zoneHi = this.add.rectangle(GEO.zone.x, FY + GEO.zone.y, GEO.zone.hw * 2 / 3, GEO.zone.hh * 2,
        hexNum(C.lime), 0.14).setDepth(15).setVisible(false);

      this.ball = this.add.image(-50, -50, 'ball').setDepth(22);
      this.ballTrail = [];
      for (var t = 0; t < 5; t += 1) {
        this.ballTrail.push(this.add.image(-50, -50, 'ball').setDepth(21).setAlpha(0));
      }
      this.slot = this.add.circle(0, 0, 9, hexNum(C.gold), 0).setDepth(20).setStrokeStyle(2.4, hexNum(C.gold), 0);
      this.callDot = this.add.circle(-50, -50, 4, hexNum(C.white), 0).setDepth(23);
      this.reticle = this.add.container(0, 0).setDepth(20).setVisible(false);
      var ring = this.add.circle(0, 0, 15, 0xffffff, 0).setStrokeStyle(2.6, hexNum(C.lime), 0.95);
      var cross1 = this.add.rectangle(0, 0, 34, 2, hexNum(C.lime), 0.8);
      var cross2 = this.add.rectangle(0, 0, 2, 34, hexNum(C.lime), 0.8);
      this.reticle.add([cross1, ring, cross2]);
      this.reticleRing = ring;
      this.reticleArms = [cross1, cross2];

      this.landMark = this.add.circle(-50, -50, 8, 0, 0).setDepth(8)
        .setStrokeStyle(2, hexNum(C.gold), 0.8);

      this.flashRect = this.add.rectangle(DW / 2, DH / 2, DW, DH, 0xffffff, 0).setDepth(120);
      this.vignette = this.add.rectangle(DW / 2, FY + 268, DW, 536, hexNum(C.coral), 0).setDepth(30);
    },

    buildParticles: function () {
      var add = this.add;
      // 1. dirt at the plate / on ground contact
      this.pDirt = add.particles(0, 0, 'p_dirt', {
        speed: { min: 40, max: 150 }, angle: { min: 200, max: 340 },
        scale: { start: 0.9, end: 0 }, alpha: { start: 0.9, end: 0 },
        lifespan: { min: 300, max: 620 }, gravityY: 320, quantity: 1, emitting: false
      }).setDepth(19);
      // 2. bat contact sparks
      this.pSpark = add.particles(0, 0, 'p_spark', {
        speed: { min: 90, max: 340 }, scale: { start: 1.1, end: 0 },
        alpha: { start: 1, end: 0 }, lifespan: { min: 220, max: 520 },
        blendMode: 'ADD', quantity: 1, emitting: false
      }).setDepth(24);
      // 3. celebration confetti at run boundaries
      this.pConfetti = add.particles(0, 0, 'p_confetti', {
        speed: { min: 90, max: 300 }, angle: { min: 200, max: 340 },
        scale: { start: 1, end: 0.6 }, alpha: { start: 1, end: 0.2 },
        rotate: { start: 0, end: 360 }, lifespan: { min: 900, max: 1800 },
        gravityY: 260, quantity: 1, emitting: false,
        tint: [hexNum(C.lime), hexNum(C.aqua), hexNum(C.gold), hexNum(C.coral), hexNum(C.white)]
      }).setDepth(210);
      // 4. base path dust
      this.pDust = add.particles(0, 0, 'p_soft', {
        speed: { min: 12, max: 60 }, scale: { start: 0.5, end: 0 },
        alpha: { start: 0.4, end: 0 }, lifespan: { min: 380, max: 760 },
        quantity: 1, emitting: false, tint: 0xd8c2a4
      }).setDepth(9);
      // 5. camera flashes in the stands
      this.pFlash = add.particles(0, 0, 'p_flash', {
        speed: 0, scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 },
        lifespan: { min: 120, max: 320 }, blendMode: 'ADD', quantity: 1, emitting: false,
        tint: 0xfff6d0
      }).setDepth(6);
      // 6. grass and chalk scatter on hard ground balls
      this.pGrass = add.particles(0, 0, 'p_grass', {
        speed: { min: 30, max: 120 }, angle: { min: 190, max: 350 },
        scale: { start: 0.9, end: 0 }, alpha: { start: 0.9, end: 0 },
        lifespan: { min: 260, max: 520 }, gravityY: 260, quantity: 1, emitting: false
      }).setDepth(18);
    },

    buildHud: function () {
      var d = 100;
      this.hudBand = this.add.image(0, 0, 'hudband').setOrigin(0, 0).setDepth(d);
      this.hudMarkA = this.add.image(24, 26, 'mark_n9').setDepth(d + 1).setScale(0.62);
      this.hudMarkB = this.add.image(DW - 24, 26, 'mark_co').setDepth(d + 1).setScale(0.62);
      this.hudAbbrA = this.mkText(46, 26, 'N9', 13, C.text, 'left', '700', d + 1);
      this.hudAbbrB = this.mkText(DW - 46, 26, 'CO', 13, C.text, 'right', '700', d + 1);
      this.hudScoreA = this.mkText(92, 26, '0', 24, C.lime, 'left', '800', d + 1);
      this.hudScoreB = this.mkText(DW - 92, 26, '0', 24, C.text, 'right', '800', d + 1);
      this.hudInning = this.mkText(DW / 2 + 6, 26, '1', 18, C.white, 'center', '800', d + 1);
      this.hudArrow = this.add.triangle(DW / 2 - 12, 26, 0, 7, 7, -5, -7, -5, hexNum(C.gold)).setDepth(d + 1);

      this.hudCount = this.mkText(80, 62, '0-0', 15, C.aqua, 'center', '700', d + 1);
      this.hudOuts = [];
      for (var i = 0; i < 3; i += 1) {
        this.hudOuts.push(this.add.circle(288 + i * 15, 62, 4.6, hexNum(C.muted), 0.35).setDepth(d + 1));
      }
      // base diamond, centered under the inning marker
      this.hudBases = [];
      var bx = DW / 2, by = 62;
      var pts = [[bx + 14, by], [bx, by - 14], [bx - 14, by]];
      for (var b = 0; b < 3; b += 1) {
        var sq = this.add.rectangle(pts[b][0], pts[b][1], 10, 10, hexNum(C.white), 0.16)
          .setDepth(d + 1).setAngle(45).setStrokeStyle(1, hexNum(C.white), 0.5);
        this.hudBases.push(sq);
      }

      this.pauseBtn = this.add.image(32, FY + 24, 'btn_sm').setDepth(d).setDisplaySize(42, 34).setAlpha(0.34);
      this.pauseIcon1 = this.add.rectangle(29, FY + 24, 3.4, 12, hexNum(C.text), 0.8).setDepth(d + 1);
      this.pauseIcon2 = this.add.rectangle(36, FY + 24, 3.4, 12, hexNum(C.text), 0.8).setDepth(d + 1);
    },

    buildControls: function () {
      var d = 90;
      this.ctlPanel = this.add.image(0, 596, 'panel_ctl').setOrigin(0, 0).setDepth(d - 1);

      // card strip
      this.cardBg = this.add.image(16, 606, 'panel_row').setOrigin(0, 0).setDepth(d).setDisplaySize(358, 42);
      this.cardName = this.mkText(28, 627, '', 14, C.text, 'left', '700', d + 1);
      this.bars = [];
      for (var i = 0; i < 3; i += 1) {
        var bg = this.add.rectangle(232 + i * 46, 627, 40, 7, hexNum(C.line), 0.7).setOrigin(0, 0.5).setDepth(d + 1);
        var fg = this.add.rectangle(232 + i * 46, 627, 10, 7, hexNum(C.lime), 1).setOrigin(0, 0.5).setDepth(d + 2);
        this.bars.push({ bg: bg, fg: fg });
      }

      // primary chip row (swing plan or pitch type)
      this.chipA = [];
      for (var a = 0; a < 5; a += 1) {
        this.chipA.push(this.mkChip('ca' + a, 0, 660, 70, 46, d));
      }
      // secondary chip row (zone guess or effort)
      this.chipB = [];
      for (var b = 0; b < 3; b += 1) {
        this.chipB.push(this.mkChip('cb' + b, 0, 714, 118, 46, d));
      }

      // action bar
      this.actionBtn = this.add.image(242, 796, 'btn_lg').setDepth(d).setDisplaySize(264, 58);
      this.actionTxt = this.mkText(242, 796, 'SWING', 20, C.lime, 'center', '800', d + 1);
      this.meterBg = this.add.rectangle(20, 782, 74, 8, hexNum(C.line), 0.8).setOrigin(0, 0.5).setDepth(d + 1);
      this.meterFg = this.add.rectangle(20, 782, 74, 8, hexNum(C.aqua), 1).setOrigin(0, 0.5).setDepth(d + 2);
      this.meterTxt = this.mkText(20, 806, '', 10, C.muted, 'left', '700', d + 1).setAlpha(0.85);

      this.playGroup = [this.ctlPanel, this.cardBg, this.cardName,
        this.actionBtn, this.actionTxt,
        this.meterBg, this.meterFg, this.meterTxt];
      this.bars.forEach(function (x) { this.playGroup.push(x.bg, x.fg); }, this);
      this.chipA.forEach(function (x) { this.playGroup.push(x.img, x.txt, x.sub); }, this);
      this.chipB.forEach(function (x) { this.playGroup.push(x.img, x.txt, x.sub); }, this);
      this.hudGroup = [this.hudBand, this.hudMarkA, this.hudMarkB, this.hudAbbrA, this.hudAbbrB,
        this.hudScoreA, this.hudScoreB, this.hudInning, this.hudArrow, this.hudCount,
        this.pauseBtn, this.pauseIcon1, this.pauseIcon2]
        .concat(this.hudOuts).concat(this.hudBases);
      this.fieldGroup = [this.field, this.crowdGlow, this.catcher, this.pitcher,
        this.batter, this.zoneBox, this.zoneHi, this.ball, this.slot, this.callDot,
        this.reticle, this.landMark, this.vignette]
        .concat(this.ballTrail).concat(this.fielders).concat(this.runners);
      this.setGroup(this.playGroup, false);
    },

    buildTransient: function () {
      var d = 130;
      this.chipBg = this.add.image(DW / 2, 150, 'chip_toast').setDepth(d).setAlpha(0);
      this.chipTxt = this.mkText(DW / 2, 150, '', 14, C.text, 'center', '700', d + 1).setAlpha(0);
      this.chipTimer = 0;
      this.chipQueue = [];

      this.bannerBg = this.add.image(DW / 2, 340, 'panel_mid').setDepth(200).setAlpha(0).setDisplaySize(234, 132);
      this.bannerTxt = this.mkText(DW / 2, 322, '', 26, C.lime, 'center', '800', 201).setAlpha(0);
      this.bannerSub = this.mkText(DW / 2, 356, '', 14, C.muted, 'center', '600', 201).setAlpha(0);
      this.bannerTimer = 0;

      this.gradeTxt = this.mkText(DW / 2, FY + 414, '', 18, C.gold, 'center', '800', 40).setAlpha(0);
      this.gradeTimer = 0;
    },

    mkText: function (x, y, s, size, color, align, weight, depth) {
      var t = this.add.text(x, y, s, {
        fontFamily: FONT, fontSize: size + 'px', color: color,
        fontStyle: weight === '800' || weight === '700' ? 'bold' : 'normal', resolution: HIDPI_FACTOR
      }).setDepth(depth == null ? 100 : depth);
      t.setOrigin(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5);
      t.__t = s;
      t.__c = color;
      return t;
    },

    mkChip: function (id, x, y, w, h, d) {
      var img = this.add.image(x, y, 'btn_sm').setDepth(d).setDisplaySize(w, h).setVisible(false);
      var txt = this.mkText(x, y - 6, '', 13, C.text, 'center', '700', d + 1).setVisible(false);
      var sub = this.mkText(x, y + 11, '', 10, C.muted, 'center', '600', d + 1).setVisible(false);
      return { id: id, img: img, txt: txt, sub: sub, w: w, h: h };
    },

    setGroup: function (arr, on) {
      for (var i = 0; i < arr.length; i += 1) if (arr[i]) arr[i].setVisible(on);
    },

    // -------------------------------------------------------- menu build
    clearMenu: function () {
      for (var i = 0; i < this.menuObjects.length; i += 1) this.menuObjects[i].destroy();
      this.menuObjects.length = 0;
    },
    mo: function (o) { this.menuObjects.push(o); return o; },

    menuPanel: function (x, y, w, h, alpha) {
      var key = 'mpanel_' + w + '_' + h;
      if (!this.textures.exists(key)) PN.Art.bakePanel(this, key, w, h, alpha == null ? 0.94 : alpha);
      return this.mo(this.add.image(x, y, key).setOrigin(0, 0).setDepth(200));
    },
    menuText: function (x, y, s, size, color, align, weight) {
      return this.mo(this.mkText(x, y, s, size, color, align, weight, 202));
    },
    menuButton: function (id, x, y, w, h, label, tone) {
      var key = w > 160 ? 'btn_lg' : w > 100 ? 'btn_md' : 'btn_sm';
      var img = this.mo(this.add.image(x + w / 2, y + h / 2, key).setDisplaySize(w, h).setDepth(201));
      var col = tone === 'go' ? C.lime : tone === 'warn' ? C.gold : C.text;
      // monospace fits about w/7.6 characters at 13px; step down for long rows
      var size = label.length > w / 7.4 ? Math.max(9, Math.floor(w / label.length * 1.62)) : (w > 160 ? 17 : 14);
      var txt = this.mo(this.mkText(x + w / 2, y + h / 2, label, size, col, 'center', '700', 202));
      addControl(id, x, y, w, h);
      var rec = { id: id, img: img, txt: txt };
      this.menuButtons.push(rec);
      return rec;
    },

    // ================================================== screens
    beginScreen: function (name) {
      this.clearMenu();
      clearControls();
      this.hideThrowChips();
      this.menuButtons = [];
      this.screen = name;
      hook.state.screen = name;
      this.pendingCoach = null;
      // the transient channel never survives a screen change
      this.chipTimer = 0;
      this.chipBg.setAlpha(0);
      this.chipTxt.setAlpha(0);
      this.bannerTimer = 0;
      this.bannerBg.setAlpha(0);
      this.bannerTxt.setAlpha(0);
      this.bannerSub.setAlpha(0);
      this.gradeTimer = 0;
      this.gradeTxt.setAlpha(0);
      flushKeys();
    },

    showTitle: function () {
      this.beginScreen('title');
      this.mode = 'title';
      this.phase = 'idle';
      hook.state.mode = 'title';
      this.setGroup(this.playGroup, false);
      this.setGroup(this.hudGroup, false);
      this.setGroup(this.fieldGroup, false);
      this.setPark(save.season ? this.seasonParkId() : 'meridian');
      this.field.setVisible(true);
      this.field.setAlpha(0.55);
      wantMusic('music-day');

      this.menuPanel(16, 150, 358, 470, 0.9);
      this.menuText(DW / 2, 206, 'PENNANT', 40, C.lime, 'center', '800');
      this.menuText(DW / 2, 248, 'NINE', 40, C.white, 'center', '800');
      this.menuText(DW / 2, 284, 'Read the pitch. Own the season.', 12, C.muted, 'center', '600');

      var y = 320;
      var self = this;
      this.menuButton('m_season', 55, y, 280, 56, save.season ? 'CONTINUE SEASON' : 'NEW SEASON', 'go');
      y += 66;
      this.menuButton('m_exhib', 55, y, 280, 50, 'EXHIBITION GAME');
      y += 60;
      this.menuButton('m_derby', 55, y, 136, 50, 'HR DERBY');
      this.menuButton('m_clutch', 199, y, 136, 50, 'CLUTCH');
      y += 60;
      this.menuButton('m_roster', 55, y, 136, 50, 'ROSTER');
      this.menuButton('m_settings', 199, y, 136, 50, 'SETTINGS');
      y += 62;

      var car = save.career;
      this.menuText(DW / 2, y + 4, 'Pennants ' + car.pennants + '   Titles ' + car.titles
        + '   Record ' + car.wins + '-' + car.losses, 11, C.aqua, 'center', '600');
      this.menuText(DW / 2, y + 22, 'Tier: ' + PN.TIERS[save.tier].name, 11, C.muted, 'center', '600');
      void self;
    },

    seasonParkId: function () {
      if (!save.season) return 'rowan';
      var row = save.season.schedule[Math.min(save.season.game, PN.SEASON_GAMES - 1)];
      if (!row) return 'rowan';
      return row.home ? PN.teamById('n9').park : PN.teamById(row.opp).park;
    },

    showSeasonHub: function () {
      this.beginScreen('seasonhub');
      this.mode = 'season';
      hook.state.mode = 'season';
      this.setGroup(this.playGroup, false);
      this.setGroup(this.hudGroup, false);
      this.setGroup(this.fieldGroup, false);
      this.field.setVisible(true).setAlpha(0.4);

      var s = save.season;
      if (!s) {
        s = save.season = PN.newSeason((Math.random() * 1e9) | 0, save.tier);
        persist();
      }
      var po = s.playoff;
      this.setPark(this.seasonParkId());

      this.menuPanel(16, 96, 358, 700, 0.94);
      var title = po ? (po.round === 0 ? 'SEMIFINAL' : 'PENNANT SERIES') : 'PENNANT CHASE';
      this.menuText(DW / 2, 126, title, 20, C.lime, 'center', '800');
      var sub = po
        ? 'Best of ' + (po.round === 0 ? '3' : '5') + '   ' + po.wins + ' - ' + po.losses
        : 'Game ' + (s.game + 1) + ' of ' + PN.SEASON_GAMES + '   ' + PN.TIERS[s.tier].name;
      this.menuText(DW / 2, 148, sub, 12, C.muted, 'center', '600');

      // standings table
      var rows = PN.sortedStandings(s);
      this.menuText(32, 178, padr('CLUB', 18) + pad('W', 3) + pad('L', 3) + pad('DIF', 5), 11, C.aqua, 'left', '700');
      for (var i = 0; i < rows.length; i += 1) {
        var r = rows[i];
        var t = PN.teamById(r.id);
        var line = padr((i + 1) + '. ' + t.name, 18) + pad(r.w, 3) + pad(r.l, 3)
          + pad((r.rf - r.ra >= 0 ? '+' : '') + (r.rf - r.ra), 5);
        this.menuText(32, 200 + i * 20, line, 11, r.id === 'n9' ? C.lime : C.text, 'left', r.id === 'n9' ? '700' : '600');
      }

      // next game card
      var nextOpp, home;
      if (po) { nextOpp = po.opp; home = (po.wins + po.losses) % 2 === 0; }
      else {
        var row = s.schedule[s.game];
        nextOpp = row.opp; home = row.home;
      }
      var park = PN.parkById(home ? PN.teamById('n9').park : PN.teamById(nextOpp).park);
      this.menuText(32, 336, 'NEXT', 11, C.aqua, 'left', '700');
      this.menuText(32, 358, (home ? 'vs ' : 'at ') + PN.teamById(nextOpp).name, 16, C.text, 'left', '700');
      this.menuText(32, 380, park.name + '   ' + park.fence.left + ' / ' + park.fence.center + ' / ' + park.fence.right, 11, C.muted, 'left', '600');
      this.menuText(32, 398, park.blurb, 10, C.muted, 'left', '600');

      // rotation
      this.menuText(32, 428, 'ROTATION', 11, C.aqua, 'left', '700');
      var self = this;
      PN.ROTATION.forEach(function (a, k) {
        var rec = s.arms[a.id];
        var rest = Math.round(rec.rest * 100);
        var ready = rec.rest > 0.55;
        var y = 450 + k * 34;
        self.menuButton('arm_' + a.id, 24, y - 14, 342, 30,
          padr(a.name + ' (' + a.role + ')', 22) + (ready ? 'READY ' : 'TIRED ') + pad(rest + '%', 5),
          s.rotationIndex === k ? 'go' : '');
      });
      var pick = PN.ROTATION[s.rotationIndex];
      this.menuText(32, 594, 'Starter: ' + pick.name + '   rest ' + Math.round(s.arms[pick.id].rest * 100) + '%', 11, C.gold, 'left', '600');

      this.menuButton('s_play', 24, 618, 342, 56, 'PLAY BALL', 'go');
      this.menuButton('s_roster', 24, 684, 166, 46, 'ROSTER');
      this.menuButton('s_sim', 200, 684, 166, 46, 'QUICK SIM');
      this.menuButton('s_back', 24, 738, 166, 46, 'MENU');
      this.menuButton('s_abandon', 200, 738, 166, 46, 'END SEASON', 'warn');
    },

    showRoster: function (from) {
      this.beginScreen('roster');
      this.rosterFrom = from;
      this.setGroup(this.playGroup, false);
      this.setGroup(this.hudGroup, false);
      this.setGroup(this.fieldGroup, false);
      this.field.setVisible(true).setAlpha(0.35);
      this.menuPanel(16, 96, 358, 700, 0.94);
      this.menuText(DW / 2, 126, 'NORTHSTAR NINE', 20, C.lime, 'center', '800');
      this.menuText(DW / 2, 148, 'Twelve bats and a four arm rotation', 11, C.muted, 'center', '600');
      this.menuText(30, 176, padr('PLAYER', 15) + pad('CON', 4) + pad('POW', 4) + pad('SPD', 4) + pad('AVG', 6), 10, C.aqua, 'left', '700');
      var s = save.season;
      for (var i = 0; i < PN.ROSTER.length; i += 1) {
        var p = PN.ROSTER[i];
        var f = s && s.form[p.id] ? s.form[p.id] : { form: 0, growth: 0, ab: 0, h: 0 };
        var st = PN.hitterStats(p, f);
        var avg = f.ab > 0 ? ('.' + pad(Math.round(f.h / f.ab * 1000), 3).replace(/ /g, '0')) : ' .---';
        var mark = f.form > 0.02 ? '+' : f.form < -0.02 ? '-' : ' ';
        this.menuText(30, 196 + i * 21,
          padr(mark + p.name, 15) + pad(Math.round(st.contact * 99), 4) + pad(Math.round(st.power * 99), 4)
          + pad(Math.round(st.speed * 99), 4) + pad(avg, 6), 10,
          p.bench ? C.muted : C.text, 'left', '600');
      }
      this.menuText(30, 466, padr('ARM', 15) + pad('CTL', 4) + pad('STA', 4) + pad('REST', 6), 10, C.aqua, 'left', '700');
      for (var k = 0; k < PN.ROTATION.length; k += 1) {
        var a = PN.ROTATION[k];
        var rec = s && s.arms[a.id] ? s.arms[a.id] : { rest: 1, ip: 0 };
        this.menuText(30, 486 + k * 21,
          padr(a.name, 15) + pad(Math.round(a.control * 99), 4) + pad(Math.round(a.stamina * 99), 4)
          + pad(Math.round(rec.rest * 100) + '%', 6), 10, C.text, 'left', '600');
      }
      this.menuText(30, 584, 'Form marks: + hot bat, - cold bat. Hits and homers', 10, C.muted, 'left', '600');
      this.menuText(30, 600, 'add permanent growth across the season.', 10, C.muted, 'left', '600');
      this.menuText(30, 630, 'CAREER', 11, C.aqua, 'left', '700');
      var car = save.career;
      this.menuText(30, 652, 'Seasons ' + car.seasons + '   Pennants ' + car.pennants + '   Titles ' + car.titles, 11, C.text, 'left', '600');
      this.menuText(30, 672, 'Record ' + car.wins + '-' + car.losses + '   Home runs ' + car.hr, 11, C.text, 'left', '600');
      this.menuText(30, 692, 'Derby best ' + save.derby.best + '   Longest ' + save.derby.far + ' ft', 11, C.text, 'left', '600');
      this.menuButton('r_back', 24, 730, 342, 52, 'BACK');
    },

    showClutchList: function () {
      this.beginScreen('clutchlist');
      this.mode = 'clutch';
      hook.state.mode = 'clutch';
      this.setGroup(this.playGroup, false);
      this.setGroup(this.hudGroup, false);
      this.setGroup(this.fieldGroup, false);
      this.field.setVisible(true).setAlpha(0.35);
      this.menuPanel(16, 96, 358, 700, 0.94);
      this.menuText(DW / 2, 126, 'CLUTCH SITUATIONS', 19, C.lime, 'center', '800');
      var done = 0;
      PN.CLUTCH.forEach(function (c) { if (save.clutch[c.id] && save.clutch[c.id].done) done += 1; });
      this.menuText(DW / 2, 148, done + ' of ' + PN.CLUTCH.length + ' cleared', 12, C.muted, 'center', '600');
      var self = this;
      var unlocked = 0;
      PN.CLUTCH.forEach(function (c, i) {
        var prev = i === 0 ? true : (save.clutch[PN.CLUTCH[i - 1].id] || {}).done;
        var open = !!prev;
        if (open) unlocked = i;
        var rec = save.clutch[c.id] || { done: false, medal: 0 };
        var medal = rec.medal >= 3 ? '***' : rec.medal === 2 ? '** ' : rec.medal === 1 ? '*  ' : '   ';
        var label = padr((i + 1) + '. ' + c.name, 20) + (open ? medal : 'LOCK');
        var y = 176 + i * 50;
        if (open) self.menuButton('cl_' + c.id, 24, y, 342, 44, label, rec.done ? 'go' : '');
        else {
          self.mo(self.add.image(195, y + 22, 'btn_lg').setDisplaySize(342, 44).setDepth(201).setAlpha(0.35));
          self.menuText(195, y + 22, label, 13, C.muted, 'center', '600');
        }
      });
      this.menuText(DW / 2, 690, PN.CLUTCH[unlocked].par, 10, C.gold, 'center', '600');
      this.menuButton('cl_back', 24, 730, 342, 52, 'BACK');
    },

    showDerbyIntro: function () {
      this.beginScreen('derbyintro');
      this.mode = 'derby';
      hook.state.mode = 'derby';
      this.setGroup(this.playGroup, false);
      this.setGroup(this.hudGroup, false);
      this.setGroup(this.fieldGroup, false);
      this.field.setVisible(true).setAlpha(0.4);
      this.menuPanel(16, 180, 358, 470, 0.94);
      this.menuText(DW / 2, 218, 'HOME RUN DERBY', 21, C.gold, 'center', '800');
      this.menuText(DW / 2, 244, 'Three rounds. Ten outs each.', 12, C.muted, 'center', '600');
      var self = this;
      PN.DERBY_ROUNDS.forEach(function (r, i) {
        var park = PN.parkById(r.park);
        self.menuText(46, 288 + i * 44, r.name, 14, C.text, 'left', '700');
        self.menuText(46, 306 + i * 44, park.name + '   clear ' + r.target + ' to advance', 10, C.muted, 'left', '600');
      });
      this.menuText(DW / 2, 442, 'Best round ' + save.derby.best + '   longest ' + save.derby.far + ' ft', 11, C.aqua, 'center', '600');
      this.menuText(DW / 2, 462, 'Anything that is not a home run is an out.', 10, C.muted, 'center', '600');
      this.menuButton('d_start', 55, 492, 280, 56, 'START DERBY', 'go');
      this.menuButton('d_back', 55, 562, 280, 50, 'BACK');
    },

    showExhibPick: function () {
      this.beginScreen('exhibpick');
      this.mode = 'exhibition';
      hook.state.mode = 'exhibition';
      this.setGroup(this.playGroup, false);
      this.setGroup(this.hudGroup, false);
      this.setGroup(this.fieldGroup, false);
      this.field.setVisible(true).setAlpha(0.35);
      this.exhibSel = this.exhibSel || { opp: 'co', park: 'rowan', innings: 3 };
      this.menuPanel(16, 120, 358, 640, 0.94);
      this.menuText(DW / 2, 152, 'EXHIBITION', 20, C.lime, 'center', '800');
      this.menuText(DW / 2, 174, 'Pick a club, a yard and a length', 11, C.muted, 'center', '600');
      var self = this;
      this.menuText(32, 204, 'OPPONENT', 11, C.aqua, 'left', '700');
      PN.TEAMS.slice(1).forEach(function (t, i) {
        var x = 24 + (i % 2) * 174, y = 220 + ((i / 2) | 0) * 50;
        self.menuButton('ex_opp_' + t.id, x, y, 166, 44, t.short + ' ' + t.name.split(' ')[0],
          self.exhibSel.opp === t.id ? 'go' : '');
      });
      this.menuText(32, 380, 'BALLPARK', 11, C.aqua, 'left', '700');
      PN.PARKS.forEach(function (p, i) {
        var open = save.unlockedParks.indexOf(p.id) >= 0;
        var x = 24 + (i % 2) * 174, y = 396 + ((i / 2) | 0) * 50;
        if (open) {
          self.menuButton('ex_park_' + p.id, x, y, 166, 44, p.name.split(' ')[0],
            self.exhibSel.park === p.id ? 'go' : '');
        } else {
          self.mo(self.add.image(x + 83, y + 22, 'btn_md').setDisplaySize(166, 44).setDepth(201).setAlpha(0.3));
          self.menuText(x + 83, y + 22, 'LOCKED', 12, C.muted, 'center', '600');
        }
      });
      this.menuText(32, 528, 'LENGTH', 11, C.aqua, 'left', '700');
      [3, 6, 9].forEach(function (n, i) {
        self.menuButton('ex_inn_' + n, 24 + i * 116, 544, 108, 44, n + ' INN',
          self.exhibSel.innings === n ? 'go' : '');
      });
      this.menuText(DW / 2, 612, PN.parkById(this.exhibSel.park).blurb, 10, C.gold, 'center', '600');
      this.menuButton('ex_go', 24, 636, 342, 54, 'PLAY BALL', 'go');
      this.menuButton('ex_back', 24, 700, 342, 48, 'BACK');
    },

    // ------------------------------------------------------ box score
    showBox: function (title, subtitle, nextId, nextLabel) {
      this.beginScreen('box');
      var g = this.g;
      this.setGroup(this.playGroup, false);
      this.setGroup(this.fieldGroup, false);
      this.setGroup(this.hudGroup, false);
      this.field.setVisible(true).setAlpha(0.4);
      this.menuPanel(16, 96, 358, 700, 0.94);
      this.menuText(DW / 2, 126, title, 21, C.lime, 'center', '800');
      this.menuText(DW / 2, 150, subtitle, 12, C.muted, 'center', '600');

      var away = g.playerHome ? PN.teamById(g.opp.id) : PN.teamById('n9');
      var home = g.playerHome ? PN.teamById('n9') : PN.teamById(g.opp.id);
      var header = padr('', 6);
      var i;
      for (i = 0; i < g.lineScore[0].length; i += 1) header += pad(i + 1, 3);
      header += pad('R', 4) + pad('H', 3);
      this.menuText(28, 184, header, 10, C.aqua, 'left', '700');
      var lineA = padr(away.short, 6);
      var lineB = padr(home.short, 6);
      for (i = 0; i < g.lineScore[0].length; i += 1) {
        lineA += pad(g.lineScore[0][i], 3);
        lineB += pad(g.lineScore[1].length > i ? g.lineScore[1][i] : '-', 3);
      }
      lineA += pad(g.score[0], 4) + pad(g.hits[0], 3);
      lineB += pad(g.score[1], 4) + pad(g.hits[1], 3);
      this.menuText(28, 204, lineA, 10, away.id === 'n9' ? C.lime : C.text, 'left', '600');
      this.menuText(28, 222, lineB, 10, home.id === 'n9' ? C.lime : C.text, 'left', '600');

      this.menuText(28, 254, padr('BATTER', 14) + pad('AB', 3) + pad('H', 3) + pad('HR', 3) + pad('RBI', 4) + pad('K', 3), 10, C.aqua, 'left', '700');
      var y = 274;
      for (i = 0; i < PN.ROSTER.length; i += 1) {
        var p = PN.ROSTER[i];
        var l = g.lines[p.id];
        if (!l || (l.ab === 0 && l.bb === 0)) continue;
        this.menuText(28, y, padr(p.name, 14) + pad(l.ab, 3) + pad(l.h, 3) + pad(l.hr, 3) + pad(l.rbi, 4) + pad(l.k, 3),
          10, C.text, 'left', '600');
        y += 19;
      }
      y = Math.max(y, 420) + 12;
      this.menuText(28, y, 'ARM  ' + (g.arm ? g.arm.name : 'staff') + '   pitches ' + g.pitches
        + '   stamina ' + Math.round(g.stamina * 100) + '%', 10, C.gold, 'left', '600');
      y += 24;
      for (i = Math.max(0, g.log.length - 8); i < g.log.length; i += 1) {
        this.menuText(28, y, g.log[i], 10, C.muted, 'left', '600');
        y += 17;
      }
      this.menuButton(nextId, 24, 730, 342, 54, nextLabel, 'go');
    },

    showSeasonEnd: function (won, champion) {
      this.beginScreen('seasonend');
      this.setGroup(this.playGroup, false);
      this.setGroup(this.hudGroup, false);
      this.setGroup(this.fieldGroup, false);
      this.field.setVisible(true).setAlpha(0.5);
      this.menuPanel(16, 200, 358, 430, 0.94);
      this.menuText(DW / 2, 250, champion ? 'CHAMPIONS' : won ? 'PENNANT WON' : 'SEASON OVER',
        30, champion ? C.gold : won ? C.lime : C.coral, 'center', '800');
      var s = save.season;
      var row = s ? PN.standingsRow(s, 'n9') : { w: 0, l: 0 };
      this.menuText(DW / 2, 292, 'Final record ' + row.w + ' - ' + row.l, 15, C.text, 'center', '700');
      this.menuText(DW / 2, 320, 'Career pennants ' + save.career.pennants + '   titles ' + save.career.titles, 12, C.muted, 'center', '600');
      var best = null;
      if (s) {
        PN.ROSTER.forEach(function (p) {
          var f = s.form[p.id];
          if (!best || f.h > s.form[best.id].h) best = p;
        });
        var bf = s.form[best.id];
        this.menuText(DW / 2, 356, 'Top bat: ' + best.name, 13, C.aqua, 'center', '700');
        this.menuText(DW / 2, 376, bf.h + ' hits, ' + bf.hr + ' home runs, ' + bf.rbi + ' driven in', 11, C.muted, 'center', '600');
      }
      if (champion && save.tier < 2) {
        this.menuText(DW / 2, 412, 'Unlocked: ' + PN.TIERS[save.tier + 1].name, 12, C.gold, 'center', '700');
      }
      this.menuButton('se_new', 55, 452, 280, 54, 'NEW SEASON', 'go');
      this.menuButton('se_menu', 55, 516, 280, 50, 'MAIN MENU');
      if (champion) this.celebrate(true);
    },

    // ================================================== game setup
    setPark: function (id) {
      var park = PN.parkById(id);
      if (this.parkId !== park.id) {
        this.parkId = park.id;
        this.field.setTexture('park_' + park.id);
      }
      this.park = park;
      return park;
    },

    startGame: function (opts) {
      var park = this.setPark(opts.parkId);
      var oppTeam = PN.teamById(opts.oppId);
      var armId = opts.armId || PN.ROTATION[0].id;
      var arm = PN.armById(armId);
      var g = PN.newGame({
        mode: opts.mode,
        park: park,
        opp: oppTeam,
        playerHome: opts.playerHome,
        innings: opts.innings || 9,
        arm: arm
      });
      g.stamina = opts.stamina == null ? 1 : opts.stamina;
      g.tier = opts.tier == null ? save.tier : opts.tier;
      g.oppLineup = PN.OPP_LINEUPS[oppTeam.id] || PN.OPP_LINEUPS.co;
      this.g = g;
      this.mode = opts.mode;
      hook.state.mode = opts.mode;

      this.beginScreen('play');
      this.setGroup(this.fieldGroup, true);
      this.setGroup(this.hudGroup, true);
      this.setGroup(this.playGroup, true);
      this.field.setAlpha(1);
      this.zoneBox.setAlpha(0);
      this.landMark.setVisible(false);
      this.reticle.setVisible(false);
      this.hideBall();
      this.registerPlayControls();
      this.swingPlan = 1;
      this.guessCol = 1;
      this.pitchSel = 0;
      this.effortSel = 1;
      this.rnd = Math.random;
      this.lastResult = null;
      this.throwOptions = null;
      this.paceClock = 0;

      wantMusic(park.night ? 'music-night' : 'music-day');
      this.hudMarkA.setTexture('mark_n9');
      this.hudMarkB.setTexture('mark_' + oppTeam.id);
      setText(this.hudAbbrA, g.playerHome ? oppTeam.short : 'N9');
      setText(this.hudAbbrB, g.playerHome ? 'N9' : oppTeam.short);
      this.hudMarkA.setTexture('mark_' + (g.playerHome ? oppTeam.id : 'n9'));
      this.hudMarkB.setTexture('mark_' + (g.playerHome ? 'n9' : oppTeam.id));
      setCol(this.hudScoreA, g.playerHome ? oppTeam.color : C.lime);
      setCol(this.hudScoreB, g.playerHome ? C.lime : oppTeam.color);

      this.banner((opts.bannerTitle || 'PLAY BALL'),
        (opts.bannerSub || (g.playerHome ? 'vs ' : 'at ') + oppTeam.name + '   ' + park.name), 1500);
      this.phase = 'intro';
      this.timer = 1.5;
      this.placeFielders();
      this.syncHud();

      if (!save.tutorialDone && opts.mode !== 'derby') this.startTutorial();
    },

    registerPlayControls: function () {
      clearControls();
      // Registration order is hit test priority: later entries win overlaps.
      addControl('swingzone', 0, FY, DW, 470, { fireDown: true });
      addControl('pause', 8, FY + 4, 56, 46);
      for (var a = 0; a < 5; a += 1) addControl('ca' + a, 0, 0, 0, 0);
      for (var b = 0; b < 3; b += 1) addControl('cb' + b, 0, 0, 0, 0, { drag: true });
      addControl('action', 110, 768, 264, 58, { fireDown: true });
      addControl('throw0', 20, 560, 160, 44);
      addControl('throw1', 210, 560, 160, 44);
      setEnabled('throw0', false);
      setEnabled('throw1', false);
    },

    // ------------------------------------------------------- tutorial
    startTutorial: function () {
      this.tut = {
        step: 0,
        steps: [
          { text: 'Pick a swing plan. Contact widens the timing window.', wait: 'plan' },
          { text: 'Call a zone. A correct call adds real contact quality.', wait: 'zone' },
          { text: 'Watch the release slot, then tap the field as the ball reaches the plate.', wait: 'swing' },
          { text: 'Your half now. Pick a pitch, set the effort, then stop the target.', wait: 'pitch' },
          { text: 'That is the loop. Nine innings, then the standings move.', wait: 'none', hold: 3.4 }
        ]
      };
      this.coach(this.tut.steps[0].text, 6);
    },
    tutorialDo: function (what) {
      if (!this.tut) return;
      var st = this.tut.steps[this.tut.step];
      if (!st || st.wait !== what) return;
      this.tut.step += 1;
      var next = this.tut.steps[this.tut.step];
      if (!next) {
        this.tut = null;
        save.tutorialDone = true;
        persist();
        return;
      }
      this.coach(next.text, next.hold || 6);
      if (next.wait === 'none') {
        this.tut = null;
        save.tutorialDone = true;
        persist();
      }
    },

    // ------------------------------------------------------ transient
    coach: function (text, secs) {
      this.chipQueue.length = 0;
      this.chipTimer = secs || 3.2;
      this.chipHold = this.chipTimer;
      setText(this.chipTxt, text);
      setCol(this.chipTxt, C.aqua);
      this.chipBg.setAlpha(0.9);
      this.chipTxt.setAlpha(1);
      this.chipTxt.setFontSize(text.length > 44 ? 11 : 13);
      this.chipBg.setDisplaySize(Math.min(370, 40 + text.length * (text.length > 44 ? 6.2 : 7.6)), 34);
    },
    chip: function (text, color) {
      // One transient at a time. New in play chips replace, never stack.
      this.chipQueue.length = 0;
      this.chipTimer = 1.0;
      this.chipHold = 1.0;
      setText(this.chipTxt, text);
      setCol(this.chipTxt, color || C.text);
      this.chipTxt.setFontSize(13);
      this.chipBg.setAlpha(0.9);
      this.chipTxt.setAlpha(1);
      this.chipBg.setDisplaySize(Math.min(370, 40 + text.length * 8), 34);
    },
    banner: function (title, sub, ms) {
      setText(this.bannerTxt, title);
      setText(this.bannerSub, sub || '');
      this.bannerTimer = (ms || 1400) / 1000;
      this.bannerHold = this.bannerTimer;
      var w = Math.max(234, Math.min(DW * 0.62, 40 + title.length * 17));
      this.bannerBg.setDisplaySize(w, 116);
      this.bannerBg.setAlpha(0);
      this.bannerTxt.setAlpha(0);
      this.bannerSub.setAlpha(0);
      this.bannerScale = kit.juice.enabled ? 0.7 : 1;
    },
    grade: function (text, color) {
      setText(this.gradeTxt, text);
      setCol(this.gradeTxt, color);
      this.gradeTimer = 0.85;
      this.gradeTxt.setAlpha(1);
      this.gradeTxt.setScale(kit.juice.enabled ? 1.35 : 1);
    },

    celebrate: function (big) {
      var n = big ? 90 : 40;
      this.pConfetti.explode(n, DW / 2, big ? 120 : FY + 120);
      this.pConfetti.explode((n / 2) | 0, 70, FY + 90);
      this.pConfetti.explode((n / 2) | 0, DW - 70, FY + 90);
      sfx('sfx-cheer');
    },

    crowdPop: function (strength) {
      this.crowdGlow.setAlpha(Math.min(0.85, strength));
      for (var i = 0; i < 10 * strength; i += 1) {
        var ang = Math.PI + Math.random() * Math.PI;
        var fr = 1.05 + Math.random() * 0.34;
        this.pFlash.explode(1,
          GEO.plate.x + Math.cos(ang) * GEO.wallRx * fr,
          FY + GEO.plate.y + Math.sin(ang) * GEO.wallRy * fr);
      }
    },

    // ================================================== per frame
    freeze: function () { this.frozen = true; },
    thaw: function () { this.frozen = false; this.acc = 0; },
    hardRestart: function () {
      this.g = null;
      this.tut = null;
      this.showTitle();
    },

    update: function (time, delta) {
      var jf = kit.juice.frame();
      this.cameras.main.setScroll(jf.dx, jf.dy);
      if (kit.paused || this.frozen) { this.acc = 0; return; }
      var dt = Math.min(delta, 66) / 1000;
      this.acc += dt;
      var guard = 0;
      while (this.acc >= STEP && guard < 5) {
        this.acc -= STEP;
        guard += 1;
        if (!jf.frozen) this.step(STEP);
        this.stepUi(STEP);
      }
      this.render();
      this.publishHook();
    },

    stepUi: function (dt) {
      if (this.chipTimer > 0) {
        this.chipTimer -= dt;
        var f = clamp(this.chipTimer / Math.max(0.001, this.chipHold * 0.35), 0, 1);
        var a = this.chipTimer < this.chipHold * 0.35 ? f : 1;
        this.chipBg.setAlpha(0.9 * a);
        this.chipTxt.setAlpha(a);
        if (this.chipTimer <= 0) { this.chipBg.setAlpha(0); this.chipTxt.setAlpha(0); }
      }
      if (this.bannerTimer > 0) {
        this.bannerTimer -= dt;
        var life = 1 - this.bannerTimer / this.bannerHold;
        var inA = clamp(life / 0.16, 0, 1);
        var outA = clamp(this.bannerTimer / 0.28, 0, 1);
        var al = Math.min(inA, outA);
        this.bannerBg.setAlpha(0.94 * al);
        this.bannerTxt.setAlpha(al);
        this.bannerSub.setAlpha(al * 0.9);
        if (kit.juice.enabled) {
          var s = inA < 1 ? 0.7 + 0.42 * inA : 1 + Math.sin(life * 3.1) * 0.012;
          this.bannerTxt.setScale(Math.min(s, 1.12));
        }
        if (this.bannerTimer <= 0) {
          this.bannerBg.setAlpha(0); this.bannerTxt.setAlpha(0); this.bannerSub.setAlpha(0);
          if (this.pendingCoach) {
            var pc = this.pendingCoach;
            this.pendingCoach = null;
            this.coach(pc[0], pc[1]);
          }
        }
      }
      if (this.gradeTimer > 0) {
        this.gradeTimer -= dt;
        var ga = clamp(this.gradeTimer / 0.35, 0, 1);
        this.gradeTxt.setAlpha(ga);
        if (kit.juice.enabled) this.gradeTxt.setScale(1 + ga * 0.3);
        if (this.gradeTimer <= 0) this.gradeTxt.setAlpha(0);
      }
      if (this.crowdGlow.alpha > 0) this.crowdGlow.setAlpha(Math.max(0, this.crowdGlow.alpha - dt * 0.9));
      if (this.flashRect.alpha > 0) this.flashRect.setAlpha(Math.max(0, this.flashRect.alpha - dt * 2.6));
      if (this.vignette.alpha > 0) this.vignette.setAlpha(Math.max(0, this.vignette.alpha - dt * 1.6));
    },

    step: function (dt) {
      this.handleKeys();
      if (this.screen !== 'play') return;
      var g = this.g;
      if (!g) return;
      var ph = this.phase;
      this.timer -= dt;

      if (ph === 'intro') {
        if (this.timer <= 0) this.nextAtBat();
      } else if (ph === 'batReady') {
        this.slotFade = clamp(1 - this.timer / 0.34, 0, 1);
        if (this.timer <= 0) this.releasePitch();
      } else if (ph === 'batPitch') {
        this.pitchT += dt / this.pitchDur;
        if (this.pitchT >= 1.16) this.takePitch();
      } else if (ph === 'flight') {
        this.flightT += dt / this.flightDur;
        if (this.throwWindow > 0) {
          this.throwWindow -= dt;
          if (this.throwWindow <= 0) this.resolveThrow(null);
        }
        if (this.flightT >= 1) this.landBall();
      } else if (ph === 'result') {
        if (this.timer <= 0) this.afterResult();
      } else if (ph === 'pitchReady') {
        if (this.timer <= 0) this.beginPitchAim();
      } else if (ph === 'pitching') {
        this.aimT += dt;
        this.updateReticle();
        if (this.aimT > 1.85) this.throwPitch(false);
      } else if (ph === 'halfBreak') {
        if (this.timer <= 0) this.nextAtBat();
      } else if (ph === 'gameOver') {
        if (this.timer <= 0) this.finishGame();
      }
    },

    handleKeys: function () {
      if (keyHit('Escape') || keyHit('KeyP')) {
        if (this.screen === 'play') this.openPause();
        return;
      }
      if (this.screen === 'play') {
        if (keyHit('Space') || keyHit('Enter')) this.onTap('action');
        if (keyHit('ArrowLeft')) this.cycleRowB(-1);
        if (keyHit('ArrowRight')) this.cycleRowB(1);
        if (keyHit('ArrowUp')) this.cycleRowA(-1);
        if (keyHit('ArrowDown')) this.cycleRowA(1);
        if (keyHit('Digit1')) this.onTap('ca0');
        if (keyHit('Digit2')) this.onTap('ca1');
        if (keyHit('Digit3')) this.onTap('ca2');
        if (keyHit('Digit4')) this.onTap('ca3');
        if (keyHit('Digit5')) this.onTap('ca4');
        if (keyHit('KeyQ')) this.onTap('throw0');
        if (keyHit('KeyE')) this.onTap('throw1');
      } else {
        if (keyHit('Space') || keyHit('Enter')) {
          if (this.menuButtons && this.menuButtons.length) this.onTap(this.menuButtons[0].id);
        }
      }
    },

    cycleRowA: function (d) {
      var n = this.rowACount || 0;
      if (!n) return;
      if (this.playerBattingNow()) {
        this.swingPlan = (this.swingPlan + d + n) % n;
        this.tutorialDo('plan');
      } else {
        this.pitchSel = (this.pitchSel + d + n) % n;
      }
      sfx('sfx-tap', { volume: 0.35 });
      this.layoutControls();
    },
    cycleRowB: function (d) {
      if (this.playerBattingNow()) {
        this.guessCol = clamp(this.guessCol + d, 0, 2);
        this.tutorialDo('zone');
      } else {
        this.effortSel = clamp(this.effortSel + d, 0, 2);
      }
      sfx('sfx-tap', { volume: 0.35 });
      this.layoutControls();
    },

    // ================================================== at bat flow
    playerBattingNow: function () {
      var g = this.g;
      if (!g) return true;
      if (g.mode === 'derby' || g.mode === 'clutch') return true;
      return PN.playerIsBatting(g);
    },

    nextAtBat: function () {
      var g = this.g;
      if (!g || g.over) { this.endGame(); return; }
      PN.clearCount(g);
      this.lastResult = null;
      this.throwOptions = null;
      setEnabled('throw0', false);
      setEnabled('throw1', false);
      this.syncHud();
      if (this.playerBattingNow()) this.beginBatReady();
      else this.beginPitchReady();
    },

    currentHitter: function () {
      var g = this.g;
      if (g.mode === 'clutch' && this.clutch) return this.clutchHitter;
      if (g.mode === 'derby') return this.derbyHitter;
      var p = PN.ROSTER[g.playerBat % 9];
      var f = save.season ? save.season.form[p.id] : null;
      return PN.hitterStats(p, f);
    },
    currentAiHitter: function () {
      var g = this.g;
      var row = g.oppLineup[g.aiBat % g.oppLineup.length];
      var scale = PN.TIERS[g.tier].aiBat;
      return {
        id: 'ai' + (g.aiBat % g.oppLineup.length),
        name: row[0], pos: '',
        contact: clamp(row[1] * scale, 0.2, 0.99),
        power: clamp(row[2] * scale, 0.2, 0.99),
        speed: clamp(row[3], 0.2, 0.99)
      };
    },

    beginBatReady: function () {
      var g = this.g;
      this.phase = 'batReady';
      this.timer = g.mode === 'derby' ? 0.62 : 0.74;
      this.hitter = this.currentHitter();
      // AI picks the pitch and the location; the tell is honest.
      var pool = PN.PITCHES.filter(function (p) {
        return p.unlock === 0 || (save.season && save.season.game >= p.unlock) || g.tier > 0;
      });
      if (this.clutch) {
        pool = PN.PITCHES.filter(function (p) { return this.clutch.pitchPool.indexOf(p.id) >= 0; }, this);
      }
      if (g.mode === 'derby') pool = [PN.pitchById('glint')];
      this.pitch = pool[(Math.random() * pool.length) | 0] || PN.PITCHES[0];
      var aim = PN.TIERS[g.tier].aiArm;
      if (g.mode === 'derby') {
        this.plateX = (Math.random() - 0.5) * 0.5;
        this.plateY = (Math.random() - 0.5) * 0.5;
      } else {
        var edge = Math.random() < 0.34 + aim * 0.2;
        this.plateX = edge ? (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 0.7) : (Math.random() - 0.5) * 1.5;
        this.plateY = edge ? (Math.random() - 0.5) * 2.4 : (Math.random() - 0.5) * 1.6;
      }
      this.actualCol = PN.zoneColumn(this.plateX);
      this.pitchDur = PN.pitchDuration(this.pitch);
      this.pitchT = 0;
      this.slotFade = 0;
      this.zoneBox.setAlpha(0.9);
      this.callDot.setFillStyle(hexNum(C.white), 0);
      this.setBatterPose('idle');
      this.pitcher.setTexture('pit_set');
      this.layoutControls();
      this.hideBall();
    },

    releasePitch: function () {
      this.phase = 'batPitch';
      this.g.paPitches += 1;
      this.pitchT = 0;
      this.pitcher.setTexture('pit_release');
      sfx('sfx-pitch', { volume: 0.5 });
      this.setBatterPose('load');
      setEnabled('swingzone', true);
    },

    swing: function () {
      var g = this.g;
      if (this.phase !== 'batPitch') return;
      var plan = PN.SWINGS[this.swingPlan];
      var res = PN.resolveContact({
        rnd: Math.random,
        progress: this.pitchT,
        swing: plan,
        windowScale: PN.TIERS[g.tier].window,
        guessCol: this.guessCol,
        actualCol: this.actualCol,
        hitter: this.hitter,
        park: this.park,
        plateX: this.plateX,
        plateY: this.plateY,
        // the derby is an exhibition of power, not a pitcher duel
        boost: g.mode === 'derby' ? 1.18 : 1
      });
      this.tutorialDo('swing');
      this.setBatterPose('swing');
      this.batterPoseTimer = 0.14;
      setEnabled('swingzone', false);
      this.applyBatResult(res);
    },

    takePitch: function () {
      var g = this.g;
      if (this.phase !== 'batPitch') return;
      var strike = PN.isStrike(this.plateX, this.plateY);
      this.showCallDot();
      sfx('sfx-mitt', { volume: 0.7 });
      if (g.mode === 'derby') {
        this.chip('TAKEN', C.muted);
        this.phase = 'result';
        this.timer = 0.34;
        this.lastResult = { kind: 'take' };
        return;
      }
      if (strike) {
        g.strikes += 1;
        sfx('sfx-call', { volume: 0.8 });
        this.chip('STRIKE ' + g.strikes + '   ' + this.pitch.label, C.gold);
        if (g.strikes >= 3) return this.strikeout(true);
      } else {
        g.balls += 1;
        this.chip('BALL ' + g.balls + '   ' + this.pitch.label, C.aqua);
        if (g.balls >= 4) return this.walkBatter();
      }
      this.syncHud();
      this.phase = 'result';
      this.timer = 0.30;
      this.lastResult = { kind: 'take' };
    },

    showCallDot: function () {
      var Z = GEO.zone;
      this.callDot.setPosition(Z.x + this.plateX * Z.hw, FY + Z.y + this.plateY * Z.hh);
      this.callDot.setFillStyle(hexNum(PN.isStrike(this.plateX, this.plateY) ? C.gold : C.aqua), 0.95);
    },

    applyBatResult: function (res) {
      var g = this.g;
      this.lastResult = res;
      var side = PN.playerSideIndex(g);
      var hid = this.hitter.id;

      if (res.kind === 'whiff') {
        sfx('sfx-whiff', { volume: 0.8 });
        this.grade('MISS', C.coral);
        this.pDirt.explode(4, GEO.plate.x, FY + GEO.plate.y + 6);
        if (g.mode === 'derby') return this.derbyOut('SWING AND MISS');
        g.strikes += 1;
        this.chip('SWING AND MISS   ' + this.pitch.label, C.coral);
        if (g.strikes >= 3) return this.strikeout(false);
        this.syncHud();
        this.phase = 'result';
        this.timer = 0.36;
        return;
      }

      // contact of some kind
      var loud = res.quality > 0.62;
      sfx('sfx-crack', { volume: loud ? 1 : 0.6, rate: loud ? 0.94 : 1.14 });
      this.pSpark.explode(loud ? 16 : 7, GEO.plate.x + 4, FY + GEO.plate.y - 6);
      this.pDirt.explode(res.kind === 'ground' ? 10 : 4, GEO.plate.x, FY + GEO.plate.y + 6);
      if (res.kind === 'ground') this.pGrass.explode(9, GEO.plate.x + 10, FY + GEO.plate.y - 2);
      this.grade(res.grade, res.grade === 'PERFECT' ? C.gold : res.grade === 'SOLID' ? C.lime : C.aqua);
      if (kit.juice.enabled) {
        kit.juice.shake(loud ? 5 : 2, loud ? 170 : 90);
        kit.juice.hitStop(loud ? 62 : 26);
      }
      this.setBatterPose('follow');
      this.batterPoseTimer = 0.5;

      if (res.kind === 'foul') {
        sfx('sfx-foul', { volume: 0.8 });
        if (g.mode === 'derby') { this.chip('FOUL', C.muted); this.phase = 'result'; this.timer = 0.36; return; }
        if (g.strikes < 2) g.strikes += 1;
        // pace guard: no plate appearance may run past eight deliveries
        if (g.paPitches >= 8) return this.strikeout(false);
        this.chip('FOUL BALL', C.muted);
        this.syncHud();
        this.phase = 'result';
        this.timer = 0.38;
        return;
      }

      if (g.mode === 'derby') {
        if (res.outcome === 'HOME RUN') return this.derbyHomer(res);
        return this.derbyOut(res.outcome);
      }

      PN.recordLine(g, hid, 'ab');
      this.beginFlight(res, side, true);
    },

    strikeout: function (looking) {
      var g = this.g;
      PN.recordLine(g, this.hitter.id, 'ab');
      PN.recordLine(g, this.hitter.id, 'k');
      g.playerBat += 1;
      sfx('sfx-out', { volume: 0.9 });
      this.chip(looking ? 'STRIKEOUT LOOKING' : 'STRIKEOUT', C.coral);
      g.log.push(this.hitter.name + ' struck out');
      this.registerOut();
    },

    walkBatter: function () {
      var g = this.g;
      var side = PN.playerSideIndex(g);
      var runs = PN.walk(g, side);
      PN.recordLine(g, this.hitter.id, 'bb');
      if (runs) PN.recordLine(g, this.hitter.id, 'rbi', runs);
      g.playerBat += 1;
      this.chip('WALK', C.aqua);
      g.log.push(this.hitter.name + ' walked');
      sfx('sfx-step', { volume: 0.6 });
      this.pDust.explode(8, GEO.plate.x + 40, FY + GEO.plate.y - 30);
      this.syncHud();
      if (this.clutch) return this.finishClutch(runs > 0, 0, runs);
      this.phase = 'result';
      this.timer = 0.5;
      this.pendingTransition = 'next';
      PN.checkWalkoff(g);
    },

    registerOut: function () {
      var g = this.g;
      g.outs += 1;
      this.syncHud();
      if (this.clutch) return this.finishClutch(false, 0, 0);
      if (g.outs >= 3) {
        this.pendingTransition = 'half';
        this.phase = 'result';
        this.timer = 0.62;
      } else {
        this.pendingTransition = 'next';
        this.phase = 'result';
        this.timer = 0.5;
      }
    },

    // ------------------------------------------------------- ball flight
    beginFlight: function (res, side, byPlayer) {
      var g = this.g;
      this.phase = 'flight';
      this.flightT = 0;
      this.flightRes = res;
      this.flightSide = side;
      this.flightByPlayer = byPlayer;
      var land = PN.ballGround(this.park, res.spray, res.carry);
      this.flightFrom = { x: GEO.plate.x, y: GEO.plate.y - 8 };
      this.flightTo = land;
      var dist = Math.hypot(land.x - this.flightFrom.x, land.y - this.flightFrom.y);
      this.flightDur = clamp(0.34 + dist / 420 + (res.la > 30 ? 0.34 : 0), 0.42, 1.35);
      this.flightArc = clamp(res.la / 60, 0.06, 1) * 150;
      this.landMark.setPosition(land.x, FY + land.y).setVisible(res.kind !== 'ground');
      this.showBall();
      this.sendFielder(land, res);

      // manual throw choice when a runner can be challenged
      this.throwOptions = null;
      this.throwWindow = 0;
      var basesOn = g.bases[0] || g.bases[1] || g.bases[2];
      if (basesOn && res.kind !== 'homer') {
        var opts = [];
        if (g.bases[2]) opts.push({ id: 'home', label: 'THROW HOME' });
        if (g.bases[1]) opts.push({ id: 'third', label: 'THROW THIRD' });
        if (g.bases[0]) opts.push({ id: 'second', label: 'THROW SECOND' });
        opts.push({ id: 'first', label: 'THROW FIRST' });
        this.throwOptions = opts.slice(0, 2);
        this.throwWindow = this.flightDur * 0.86;
        this.throwPicked = null;
        setEnabled('throw0', true);
        setEnabled('throw1', this.throwOptions.length > 1);
        this.layoutThrowChips();
      }
      if (res.kind === 'homer') {
        this.crowdPop(byPlayer ? 1 : 0.4);
        if (byPlayer) sfx('sfx-homer'); else sfx('sfx-groan');
      }
    },

    layoutThrowChips: function () {
      var o = this.throwOptions;
      if (!this.throwTxt) {
        this.throwImgs = [
          this.add.image(100, 582, 'btn_md').setDepth(95).setDisplaySize(160, 44).setVisible(false),
          this.add.image(290, 582, 'btn_md').setDepth(95).setDisplaySize(160, 44).setVisible(false)
        ];
        this.throwTxt = [
          this.mkText(100, 582, '', 12, C.gold, 'center', '700', 96).setVisible(false),
          this.mkText(290, 582, '', 12, C.gold, 'center', '700', 96).setVisible(false)
        ];
      }
      for (var i = 0; i < 2; i += 1) {
        var on = o && o[i];
        this.throwImgs[i].setVisible(!!on);
        this.throwTxt[i].setVisible(!!on);
        if (on) setText(this.throwTxt[i], o[i].label);
      }
    },
    hideThrowChips: function () {
      if (!this.throwTxt) return;
      for (var i = 0; i < 2; i += 1) {
        this.throwImgs[i].setVisible(false);
        this.throwTxt[i].setVisible(false);
      }
    },

    resolveThrow: function (pick) {
      this.throwWindow = 0;
      setEnabled('throw0', false);
      setEnabled('throw1', false);
      this.hideThrowChips();
      this.throwPicked = pick;
    },

    sendFielder: function (land, res) {
      var i;
      for (i = 0; i < this.fielders.length; i += 1) this.fielders[i].setVisible(false);
      var spots = [[-30, 0.62], [0, 0.72], [30, 0.62], [-16, 0.36], [16, 0.36]];
      for (i = 0; i < spots.length; i += 1) {
        var p = PN.sprayPoint(spots[i][0], spots[i][1], GEO.wallRx, GEO.wallRy);
        var f = this.fielders[i];
        f.setVisible(true).setTexture('fld_run').setPosition(p.x, FY + p.y);
        f.__hx = p.x; f.__hy = p.y;
      }
      // nearest fielder converges on the landing spot
      var best = 0, bd = 1e9;
      for (i = 0; i < this.fielders.length; i += 1) {
        var d = Math.hypot(this.fielders[i].__hx - land.x, this.fielders[i].__hy - land.y);
        if (d < bd) { bd = d; best = i; }
      }
      this.chaseIndex = best;
      this.chaseDive = res.out && res.kind === 'liner';
    },

    landBall: function () {
      var g = this.g;
      var res = this.flightRes;
      this.landMark.setVisible(false);
      var f = this.fielders[this.chaseIndex];
      if (f) f.setTexture(this.chaseDive ? 'fld_dive' : 'fld_catch');
      this.pDust.explode(9, this.flightTo.x, FY + this.flightTo.y);

      if (this.flightByPlayer) this.completePlayerHit(res);
      else this.completeAiHit(res);
    },

    completePlayerHit: function (res) {
      var g = this.g;
      var side = PN.playerSideIndex(g);
      var hid = this.hitter.id;
      var pick = this.throwPicked;
      this.resolveThrow(pick);

      if (res.out) {
        var dp = false;
        if (res.kind === 'ground' && pick && g.bases[0] && g.outs < 2) {
          dp = pick.id === 'second';
        }
        sfx('sfx-out', { volume: 0.85 });
        this.chip(res.outcome + (dp ? '   DOUBLE PLAY' : ''), C.coral);
        g.log.push(this.hitter.name + ' ' + res.outcome.toLowerCase());
        g.playerBat += 1;
        if (dp) { g.bases[0] = false; g.outs += 1; }
        this.registerOut();
        return;
      }
      var lead = this.leadRunnerHeld(pick);
      g.hits[side] += 1;
      PN.recordLine(g, hid, 'h');
      if (res.bases === 4) {
        PN.recordLine(g, hid, 'hr');
        save.career.hr += 1;
      }
      var runs = PN.advanceBases(g, res.bases, side, lead ? 0 : this.hitter.speed);
      if (runs) PN.recordLine(g, hid, 'rbi', runs);
      g.playerBat += 1;
      var colr = res.bases === 4 ? C.gold : C.lime;
      this.chip(res.outcome + (res.bases === 4 ? '   ' + Math.round(res.carry) + ' FT' : '')
        + (runs ? '   ' + runs + (runs === 1 ? ' RUN' : ' RUNS') : ''), colr);
      g.log.push(this.hitter.name + ' ' + res.outcome.toLowerCase() + (runs ? ', ' + runs + ' in' : ''));
      if (res.bases === 4) {
        this.pSpark.explode(34, this.flightTo.x, FY + this.flightTo.y);
        this.pConfetti.explode(26, this.flightTo.x, FY + this.flightTo.y);
        this.flashRect.setAlpha(kit.juice.enabled ? 0.4 : 0.14);
        if (kit.juice.enabled) kit.juice.shake(7, 260);
        this.crowdPop(1);
      } else {
        sfx('sfx-cheer', { volume: 0.5 });
        this.crowdPop(0.45);
      }
      this.syncHud();
      if (this.clutch) return this.finishClutch(true, res.bases, runs);
      this.pendingTransition = 'next';
      this.phase = 'result';
      this.timer = res.bases === 4 ? 1.0 : 0.6;
      if (PN.checkWalkoff(g)) { this.phase = 'gameOver'; this.timer = 1.1; }
    },

    leadRunnerHeld: function (pick) {
      var g = this.g;
      if (!pick) return false;
      if (pick.id === 'home' && g.bases[2]) return true;
      if (pick.id === 'third' && g.bases[1]) return true;
      if (pick.id === 'second' && g.bases[0]) return true;
      return false;
    },

    // -------------------------------------------------- player pitching
    beginPitchReady: function () {
      var g = this.g;
      this.phase = 'pitchReady';
      this.timer = 0.44;
      this.aiHitter = this.currentAiHitter();
      this.aimT = 0;
      this.reticle.setVisible(false);
      this.zoneBox.setAlpha(0.9);
      this.pitcher.setTexture('pit_set');
      this.setBatterPose('away');
      this.callDot.setFillStyle(hexNum(C.white), 0);
      this.layoutControls();
      this.hideBall();
      if (this.g.mode !== 'derby') this.chip('PITCH TO  ' + this.aiHitter.name, this.g.opp.color);
    },

    beginPitchAim: function () {
      this.phase = 'pitching';
      this.aimT = 0;
      this.reticle.setVisible(true);
      this.pitcher.setTexture('pit_windup');
      this.updateReticle();
    },

    updateReticle: function () {
      var g = this.g;
      var arms = this.armsAvailable();
      var pitch = arms[clamp(this.pitchSel, 0, arms.length - 1)];
      var eff = PN.EFFORTS[this.effortSel];
      var stam = clamp(g.stamina, 0, 1);
      var t = this.aimT * (1.6 + pitch.speed);
      var wob = (1.35 - stam * 0.35) / eff.accuracy;
      this.aimX = Math.sin(t * 2.1) * 1.25 * pitch.sway * wob;
      this.aimY = Math.cos(t * 2.65 + 0.7) * 1.05 * pitch.sway * wob;
      var Z = GEO.zone;
      this.reticle.setPosition(Z.x + this.aimX * Z.hw, FY + Z.y + this.aimY * Z.hh);
      this.reticleRing.setStrokeStyle(2.6, hexNum(pitch.color), 0.95);
      this.reticleArms[0].setFillStyle(hexNum(pitch.color), 0.75);
      this.reticleArms[1].setFillStyle(hexNum(pitch.color), 0.75);
    },

    armsAvailable: function () {
      var g = this.g;
      var arm = g.arm || PN.ROTATION[0];
      var list = [];
      for (var i = 0; i < arm.arsenal.length; i += 1) list.push(PN.pitchById(arm.arsenal[i]));
      return list;
    },

    throwPitch: function (stopped) {
      var g = this.g;
      if (this.phase !== 'pitching') return;
      this.tutorialDo('pitch');
      var arms = this.armsAvailable();
      var pitch = arms[clamp(this.pitchSel, 0, arms.length - 1)];
      var eff = PN.EFFORTS[this.effortSel];
      var arm = g.arm || PN.ROTATION[0];
      this.pitcher.setTexture('pit_release');
      sfx('sfx-pitch', { volume: 0.5 });
      g.pitches += 1;
      g.paPitches += 1;
      g.stamina = clamp(g.stamina - 0.0125 * eff.drain / Math.max(0.4, arm.stamina), 0, 1);

      var res = PN.resolvePitch({
        rnd: Math.random,
        targetX: this.aimX,
        targetY: this.aimY,
        pitch: pitch,
        effort: eff,
        stamina: g.stamina,
        control: arm.control,
        hitter: this.aiHitter,
        park: this.park
      });
      this.plateX = this.aimX;
      this.plateY = this.aimY;
      this.showCallDot();
      this.reticle.setVisible(false);
      this.applyPitchResult(res, stopped);
    },

    applyPitchResult: function (res, stopped) {
      var g = this.g;
      var side = PN.oppSideIndex(g);
      if (!stopped) res.outcome = res.kind === 'ball' ? 'BALL' : res.outcome;

      if (res.kind === 'ball') {
        g.balls += 1;
        sfx('sfx-mitt', { volume: 0.6 });
        this.chip('BALL ' + g.balls, C.aqua);
        if (g.balls >= 4) {
          var runs = PN.walk(g, side);
          g.aiBat += 1;
          this.chip('WALK ISSUED', C.coral);
          PN.clearCount(g);
          this.syncHud();
          this.phase = 'result';
          this.timer = 0.5;
          this.pendingTransition = 'next';
          void runs;
          return;
        }
        this.syncHud();
        this.phase = 'result';
        this.timer = 0.32;
        return;
      }
      if (res.kind === 'out' || res.kind === 'weak') {
        g.aiBat += 1;
        sfx(res.outcome === 'SWING AND MISS' ? 'sfx-whiff' : 'sfx-out', { volume: 0.85 });
        this.chip(res.outcome, C.lime);
        g.log.push(this.aiHitter.name + ' ' + res.outcome.toLowerCase());
        this.pDirt.explode(5, GEO.plate.x, FY + GEO.plate.y + 6);
        PN.clearCount(g);
        g.outs += 1;
        this.syncHud();
        this.crowdPop(0.3);
        if (g.outs >= 3) { this.pendingTransition = 'half'; this.phase = 'result'; this.timer = 0.6; }
        else { this.pendingTransition = 'next'; this.phase = 'result'; this.timer = 0.46; }
        return;
      }
      if (res.kind === 'foul') {
        if (g.strikes < 2) g.strikes += 1;
        sfx('sfx-foul', { volume: 0.7 });
        if (g.paPitches >= 8) {
          g.aiBat += 1;
          this.chip('FOULED OUT', C.lime);
          PN.clearCount(g);
          g.outs += 1;
          this.syncHud();
          if (g.outs >= 3) { this.pendingTransition = 'half'; this.phase = 'result'; this.timer = 0.6; }
          else { this.pendingTransition = 'next'; this.phase = 'result'; this.timer = 0.46; }
          return;
        }
        this.chip('FOUL BALL', C.muted);
        this.syncHud();
        this.phase = 'result';
        this.timer = 0.34;
        return;
      }
      // ball in play against the player
      sfx('sfx-crack', { volume: 0.85, rate: 1.02 });
      this.pSpark.explode(9, GEO.plate.x + 4, FY + GEO.plate.y - 6);
      if (kit.juice.enabled) kit.juice.shake(2.5, 110);
      g.aiBat += 1;
      PN.clearCount(g);
      this.beginFlight(res, side, false);
    },

    completeAiHit: function (res) {
      var g = this.g;
      var side = PN.oppSideIndex(g);
      var pick = this.throwPicked;
      this.resolveThrow(pick);
      var held = this.leadRunnerHeld(pick);
      g.hits[side] += 1;
      var runs = PN.advanceBases(g, res.bases, side, held ? 0 : this.aiHitter.speed);
      this.chip(res.outcome + (runs ? '   ' + runs + ' AGAINST' : ''), res.bases === 4 ? C.coral : C.gold);
      g.log.push(this.aiHitter.name + ' ' + res.outcome.toLowerCase() + (runs ? ', ' + runs + ' in' : ''));
      if (res.bases === 4) {
        this.pSpark.explode(20, this.flightTo.x, FY + this.flightTo.y);
        this.vignette.setAlpha(0.24);
        if (kit.juice.enabled) kit.juice.shake(4, 180);
      }
      this.syncHud();
      this.pendingTransition = 'next';
      this.phase = 'result';
      this.timer = 0.6;
      if (PN.checkWalkoff(g)) { this.phase = 'gameOver'; this.timer = 1.1; }
    },

    afterResult: function () {
      var g = this.g;
      if (!g) return;
      if (g.mode === 'derby' && this.derby) {
        if (this.derbyStep()) return;
        this.hideBall();
        this.beginBatReady();
        return;
      }
      if (g.over) { this.endGame(); return; }
      this.hideBall();
      this.callDot.setFillStyle(hexNum(C.white), 0);
      if (this.pendingTransition === 'half') {
        var r = PN.endHalf(g);
        this.pendingTransition = 'next';
        if (r === 'game' || g.over) { this.endGame(); return; }
        sfx('sfx-bell', { volume: 0.5 });
        this.chip((g.half === 'top' ? 'TOP ' : 'BOTTOM ') + this.ordinal(g.inning), C.aqua);
        this.phase = 'halfBreak';
        this.timer = 0.85;
        this.syncHud();
        return;
      }
      if (g.outs >= 3) {
        this.pendingTransition = 'half';
        this.phase = 'result';
        this.timer = 0.2;
        return;
      }
      this.nextAtBat();
    },

    ordinal: function (n) {
      var s = ['TH', 'ST', 'ND', 'RD'];
      var v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    },

    endGame: function () {
      if (this.phase === 'gameOver' || this.screen !== 'play') { this.finishGame(); return; }
      this.phase = 'gameOver';
      this.timer = 1.0;
      this.g.over = true;
    },

    finishGame: function () {
      var g = this.g;
      if (!g) { this.showTitle(); return; }
      // close any half that never got rolled into the line score
      var tot0 = g.lineScore[0].reduce(function (a, b) { return a + b; }, 0);
      if (g.score[0] > tot0) g.lineScore[0].push(g.score[0] - tot0);
      var tot1 = g.lineScore[1].reduce(function (a, b) { return a + b; }, 0);
      if (g.score[1] > tot1 || g.lineScore[1].length < g.lineScore[0].length - 1) {
        g.lineScore[1].push(g.score[1] - tot1);
      }
      var winner = PN.gameWinner(g);
      var playerSide = PN.playerSideIndex(g);
      var won = winner === playerSide;

      if (g.mode === 'exhibition') {
        this.showBox(won ? 'WIN' : winner < 0 ? 'DRAW' : 'LOSS',
          g.score[playerSide] + ' to ' + g.score[1 - playerSide] + '   ' + this.park.name,
          'bx_menu', 'MAIN MENU');
        if (won) this.celebrate(false);
        return;
      }
      this.finishSeasonGame(won, winner);
    },

    finishSeasonGame: function (won, winner) {
      var g = this.g;
      var s = save.season;
      if (!s) { this.showTitle(); return; }
      var playerSide = PN.playerSideIndex(g);
      var rnd = PN.rng(s.seed + s.game * 7919 + 13);
      var me = PN.standingsRow(s, 'n9');
      var them = PN.standingsRow(s, g.opp.id);
      me.rf += g.score[playerSide];
      me.ra += g.score[1 - playerSide];
      them.rf += g.score[1 - playerSide];
      them.ra += g.score[playerSide];
      if (winner < 0) { if (rnd() < 0.5) won = true; }
      if (won) { me.w += 1; them.l += 1; save.career.wins += 1; }
      else { me.l += 1; them.w += 1; save.career.losses += 1; }
      PN.applyGameStats(s, g, rnd);
      PN.rollSeasonDay(s, g.arm ? g.arm.id : null, rnd);
      s.arms[g.arm.id].ip += g.lineScore[0].length;

      var title, sub, nextId = 'bx_hub', nextLabel = 'SEASON HUB';
      if (s.playoff) {
        if (won) s.playoff.wins += 1; else s.playoff.losses += 1;
        var need = s.playoff.round === 0 ? 2 : 3;
        title = won ? 'WIN' : 'LOSS';
        sub = 'Series ' + s.playoff.wins + ' - ' + s.playoff.losses
          + '   first to ' + need;
        if (s.playoff.wins >= need) {
          if (s.playoff.round === 0) {
            var field = PN.playoffField(s).filter(function (id) { return id !== 'n9' && id !== s.playoff.opp; });
            s.playoff = { round: 1, opp: field[0] || 'cl', wins: 0, losses: 0 };
            save.career.pennants += 1;
            title = 'SERIES WON';
            sub = 'On to the Pennant Series';
            this.celebrate(false);
          } else {
            save.career.titles += 1;
            save.career.seasons += 1;
            s.done = true;
            if (save.unlockedParks.indexOf('meridian') < 0) save.unlockedParks.push('meridian');
            if (save.unlockedParks.indexOf('vault') < 0) save.unlockedParks.push('vault');
            if (save.unlockedParks.indexOf('sunfield') < 0) save.unlockedParks.push('sunfield');
            if (save.tier < 2) save.tier += 1;
            persist();
            this.showSeasonEnd(true, true);
            return;
          }
        } else if (s.playoff.losses >= need) {
          s.done = true;
          save.career.seasons += 1;
          persist();
          this.showSeasonEnd(s.playoff.round === 1, false);
          return;
        }
      } else {
        PN.simOtherGames(s, ['n9', g.opp.id], rnd);
        s.game += 1;
        title = won ? 'WIN' : 'LOSS';
        sub = g.score[playerSide] + ' to ' + g.score[1 - playerSide] + '   ' + this.park.name;
        if (s.game >= PN.SEASON_GAMES) {
          var field2 = PN.playoffField(s);
          if (field2.indexOf('n9') >= 0) {
            var opp = field2[3] === 'n9' ? field2[0] : field2[field2.length - 1];
            if (opp === 'n9') opp = field2[0];
            s.playoff = { round: 0, opp: opp, wins: 0, losses: 0 };
            title = 'PLAYOFF BOUND';
            sub = 'Semifinal against ' + PN.teamById(opp).name;
            this.celebrate(false);
          } else {
            s.done = true;
            save.career.seasons += 1;
            save.career.bestWins = Math.max(save.career.bestWins, PN.standingsRow(s, 'n9').w);
            persist();
            this.showSeasonEnd(false, false);
            return;
          }
        }
        if (save.unlockedParks.indexOf('vault') < 0 && s.game >= 8) save.unlockedParks.push('vault');
        if (save.unlockedParks.indexOf('sunfield') < 0 && s.game >= 4) save.unlockedParks.push('sunfield');
      }
      persist();
      this.showBox(title, sub, nextId, nextLabel);
      if (won) this.celebrate(false);
    },

    // ------------------------------------------------------------ derby
    startDerby: function (roundIndex) {
      var round = PN.DERBY_ROUNDS[roundIndex];
      this.derby = { round: roundIndex, outs: 0, hr: 0, far: 0, total: 0 };
      this.derbyHitter = PN.hitterStats(PN.playerById('oren'), save.season ? save.season.form.oren : null);
      this.startGame({
        mode: 'derby', parkId: round.park, oppId: 'vv', playerHome: true, innings: 1,
        bannerTitle: round.name, bannerSub: 'Ten outs. Clear ' + round.target + '.'
      });
      this.g.mode = 'derby';
      this.swingPlan = 2;
      this.layoutControls();
      this.pendingCoach = ['Every swing counts. Only home runs score.', 3.4];
    },
    derbyHomer: function (res) {
      var d = this.derby;
      d.hr += 1;
      d.far = Math.max(d.far, Math.round(res.carry));
      d.total += Math.round(res.carry);
      sfx('sfx-homer');
      this.pSpark.explode(30, DW / 2, FY + 200);
      this.pConfetti.explode(18, DW / 2, FY + 160);
      this.crowdPop(1);
      if (kit.juice.enabled) { kit.juice.shake(6, 220); this.flashRect.setAlpha(0.34); }
      this.chip('HOME RUN   ' + Math.round(res.carry) + ' FT   x' + d.hr, C.gold);
      this.phase = 'result';
      this.timer = 0.72;
      this.pendingTransition = 'next';
    },
    derbyOut: function (label) {
      var d = this.derby;
      d.outs += 1;
      sfx('sfx-out', { volume: 0.7 });
      this.chip(label + '   OUT ' + d.outs + '/10', C.coral);
      this.phase = 'result';
      this.timer = 0.42;
      this.pendingTransition = 'next';
    },
    derbyStep: function () {
      var d = this.derby;
      var round = PN.DERBY_ROUNDS[d.round];
      if (d.outs >= round.outs) {
        save.derby.best = Math.max(save.derby.best, d.hr);
        save.derby.far = Math.max(save.derby.far, d.far);
        var cleared = d.hr >= round.target;
        if (cleared && d.round + 1 >= PN.DERBY_ROUNDS.length) {
          save.derby.cleared += 1;
          if (save.unlockedParks.indexOf('meridian') < 0) save.unlockedParks.push('meridian');
        }
        persist();
        this.beginScreen('derbyend');
        this.setGroup(this.playGroup, false);
        this.setGroup(this.hudGroup, false);
        this.setGroup(this.fieldGroup, false);
        this.field.setVisible(true).setAlpha(0.45);
        this.menuPanel(16, 240, 358, 360, 0.94);
        this.menuText(DW / 2, 290, cleared ? 'ROUND CLEARED' : 'ROUND OVER',
          24, cleared ? C.gold : C.coral, 'center', '800');
        this.menuText(DW / 2, 330, d.hr + ' home runs', 17, C.text, 'center', '700');
        this.menuText(DW / 2, 356, 'Longest ' + d.far + ' ft   total ' + d.total + ' ft', 12, C.muted, 'center', '600');
        this.menuText(DW / 2, 384, 'Target was ' + round.target, 12, C.muted, 'center', '600');
        this.menuText(DW / 2, 414, 'Career best ' + save.derby.best + '   longest ' + save.derby.far + ' ft', 11, C.aqua, 'center', '600');
        if (cleared && d.round + 1 < PN.DERBY_ROUNDS.length) {
          this.menuButton('dy_next', 55, 448, 280, 54, 'NEXT ROUND', 'go');
        } else {
          this.menuButton('dy_again', 55, 448, 280, 54, 'DERBY AGAIN', 'go');
        }
        this.menuButton('dy_menu', 55, 512, 280, 50, 'MAIN MENU');
        if (cleared) this.celebrate(true);
        return true;
      }
      return false;
    },

    // ----------------------------------------------------------- clutch
    startClutch: function (def) {
      this.clutch = def;
      var p = PN.playerById(def.batter);
      this.clutchHitter = PN.hitterStats(p, save.season ? save.season.form[p.id] : null);
      this.startGame({
        mode: 'clutch', parkId: def.park, oppId: def.opp, playerHome: true, innings: 9,
        bannerTitle: def.name, bannerSub: def.par
      });
      var g = this.g;
      g.mode = 'clutch';
      g.inning = def.inning;
      g.half = 'bottom';
      g.outs = def.outs;
      g.strikes = def.strikes || 0;
      g.bases = def.bases.slice();
      g.score[0] = def.deficit;
      g.score[1] = 0;
      this.syncHud();
      this.pendingCoach = [def.par, 4.0];
    },
    finishClutch: function (hit, bases, runs) {
      var def = this.clutch;
      var ok = false;
      if (def.need === 'hit') ok = hit;
      else if (def.need === 'rbi') ok = runs >= 1;
      else if (def.need === 'rbi2') ok = runs >= 2;
      else if (def.need === 'xbh') ok = bases >= 2;
      else if (def.need === 'hr') ok = bases === 4;
      var medal = !ok ? 0 : bases === 4 ? 3 : bases >= 2 ? 2 : 1;
      var rec = save.clutch[def.id] || { done: false, medal: 0 };
      if (ok) {
        rec.done = true;
        rec.medal = Math.max(rec.medal, medal);
        sfx('sfx-reward');
      } else {
        sfx('sfx-deny');
      }
      save.clutch[def.id] = rec;
      persist();
      this.phase = 'idle';
      this.beginScreen('clutchend');
      this.setGroup(this.playGroup, false);
      this.setGroup(this.hudGroup, false);
      this.setGroup(this.fieldGroup, false);
      this.field.setVisible(true).setAlpha(0.45);
      this.menuPanel(16, 250, 358, 340, 0.94);
      this.menuText(DW / 2, 300, ok ? 'CLEARED' : 'NOT THIS TIME', 24, ok ? C.lime : C.coral, 'center', '800');
      this.menuText(DW / 2, 336, def.name, 14, C.text, 'center', '700');
      this.menuText(DW / 2, 360, def.par, 11, C.muted, 'center', '600');
      this.menuText(DW / 2, 392, ok ? ('Medal ' + rec.medal + ' of 3') : 'Try a different swing plan', 12, C.gold, 'center', '600');
      this.menuButton('ck_retry', 55, 424, 280, 52, ok ? 'PLAY AGAIN' : 'RETRY', 'go');
      this.menuButton('ck_list', 55, 486, 280, 48, 'CHALLENGE LIST');
      if (ok) this.celebrate(false);
      this.lastClutch = def;
      this.clutch = null;
    },

    // ================================================== render
    render: function () {
      if (this.screen !== 'play') return;
      var g = this.g;
      if (!g) return;
      var Z = GEO.zone;
      var ph = this.phase;

      if (ph === 'batPitch' || (ph === 'batReady' && this.slotFade > 0)) {
        if (ph === 'batReady') {
          // release slot tell: colour and angle map one to one to the pitch
          var ang = PN.pitchIndex(this.pitch.id) * 0.42 - 0.6;
          this.slot.setPosition(GEO.mound.x + Math.cos(ang) * 16, FY + GEO.mound.y - 18 + Math.sin(ang) * 10);
          this.slot.setStrokeStyle(2.4, hexNum(this.pitch.color), this.slotFade * 0.95);
          this.slot.setScale(1 + (1 - this.slotFade) * 0.6);
          this.hideBall();
        } else {
          this.slot.setStrokeStyle(2.4, hexNum(this.pitch.color), Math.max(0, 0.9 - this.pitchT * 3));
          var t = clamp(this.pitchT, 0, 1.16);
          var pp = PN.pitchPath(this.pitch, this.plateX, this.plateY, t, this._pp || (this._pp = { x: 0, y: 0 }));
          var sc = 0.26 + 0.74 * Math.pow(clamp(t, 0, 1), 1.6);
          this.ball.setVisible(true);
          this.ball.setPosition(Z.x + pp.x * Z.hw, FY + Z.y + pp.y * Z.hh);
          this.ball.setScale(sc);
          this.ball.setTint(hexNum(C.white));
          this.updateTrail(t > 0.1, this.pitch.color, sc);
        }
      } else if (ph === 'flight') {
        var ft = clamp(this.flightT, 0, 1);
        var fx = this.flightFrom.x + (this.flightTo.x - this.flightFrom.x) * ft;
        var fy = this.flightFrom.y + (this.flightTo.y - this.flightFrom.y) * ft;
        fy -= Math.sin(ft * Math.PI) * this.flightArc;
        this.ball.setVisible(true);
        this.ball.setPosition(fx, FY + fy);
        this.ball.setScale(1 - ft * 0.42 + Math.sin(ft * Math.PI) * 0.2);
        this.updateTrail(true, this.flightRes.kind === 'homer' ? C.gold : C.white, this.ball.scaleX);
        var chase = this.fielders[this.chaseIndex];
        if (chase) {
          var ct = clamp(ft * 1.12, 0, 1);
          chase.setPosition(chase.__hx + (this.flightTo.x - chase.__hx) * ct,
            FY + chase.__hy + (this.flightTo.y - chase.__hy) * ct);
        }
      } else if (ph === 'pitching' || ph === 'pitchReady') {
        this.updateTrail(false);
        this.hideBall();
      } else {
        this.updateTrail(false);
      }

      if (this.batterPoseTimer > 0) {
        this.batterPoseTimer -= STEP;
        if (this.batterPoseTimer <= 0 && this.batter.__pose === 'swing') this.setBatterPose('follow');
      }

      // runners on base
      var basePts = [PN.sprayPoint(45, 0.335, GEO.wallRx, GEO.wallRy),
        PN.sprayPoint(0, 0.40, GEO.wallRx, GEO.wallRy),
        PN.sprayPoint(-45, 0.335, GEO.wallRx, GEO.wallRy)];
      for (var b = 0; b < 3; b += 1) {
        var rn = this.runners[b];
        if (g.bases[b]) {
          rn.setVisible(true);
          rn.setPosition(basePts[b].x + 6, FY + basePts[b].y + 2);
        } else rn.setVisible(false);
      }
    },

    updateTrail: function (on, color, scale) {
      if (!on) {
        for (var i = 0; i < this.ballTrail.length; i += 1) {
          if (this.ballTrail[i].alpha > 0) this.ballTrail[i].setAlpha(0);
        }
        return;
      }
      for (var k = this.ballTrail.length - 1; k > 0; k -= 1) {
        var prev = this.ballTrail[k - 1];
        this.ballTrail[k].setPosition(prev.x, prev.y).setAlpha(prev.alpha * 0.62)
          .setScale(prev.scaleX * 0.9);
      }
      var h = this.ballTrail[0];
      h.setPosition(this.ball.x, this.ball.y).setAlpha(0.42).setScale((scale || 1) * 0.9);
      h.setTint(hexNum(color || C.white));
    },

    hideBall: function () {
      this.ball.setVisible(false);
      this.updateTrail(false);
    },
    showBall: function () { this.ball.setVisible(true); },

    setBatterPose: function (pose) {
      if (pose === 'away') {
        if (this.batter.__pose !== 'away') {
          this.batter.__pose = 'away';
          this.batter.setTexture('away_idle');
          this.batter.setX(GEO.plate.x - 30);
        }
        return;
      }
      if (this.batter.__pose === pose) return;
      this.batter.__pose = pose;
      this.batter.setTexture('bat_' + pose);
      this.batter.setX(GEO.plate.x - 30);
    },

    placeFielders: function () {
      var spots = [[-30, 0.62], [0, 0.72], [30, 0.62], [-16, 0.36], [16, 0.36]];
      for (var i = 0; i < this.fielders.length; i += 1) {
        var p = PN.sprayPoint(spots[i][0], spots[i][1], GEO.wallRx, GEO.wallRy);
        this.fielders[i].setVisible(true).setTexture('fld_run').setPosition(p.x, FY + p.y);
        this.fielders[i].__hx = p.x;
        this.fielders[i].__hy = p.y;
      }
    },

    // ------------------------------------------------------------- HUD
    syncHud: function () {
      var g = this.g;
      if (!g) return;
      setText(this.hudScoreA, String(g.score[0]));
      setText(this.hudScoreB, String(g.score[1]));
      setText(this.hudInning, String(g.inning));
      this.hudArrow.setAngle(g.half === 'top' ? 0 : 180);
      this.hudArrow.setFillStyle(hexNum(g.half === 'top' ? C.gold : C.aqua));
      setText(this.hudCount, g.balls + '-' + g.strikes);
      for (var i = 0; i < 3; i += 1) {
        this.hudOuts[i].setFillStyle(hexNum(i < g.outs ? C.coral : C.muted), i < g.outs ? 1 : 0.3);
        this.hudBases[i].setFillStyle(hexNum(g.bases[i] ? C.gold : C.white), g.bases[i] ? 1 : 0.16);
      }
      this.layoutControls();
    },

    layoutThrowChipsIfNeeded: function () {
      if (this.throwWindow > 0) this.layoutThrowChips();
    },

    layoutControls: function () {
      var g = this.g;
      if (!g) return;
      var batting = this.playerBattingNow();
      var i, x;
      if (batting) {
        var h = this.hitter || this.currentHitter();
        setText(this.cardName, h.name + (h.pos ? '  ' + h.pos : ''));
        this.setBars([h.contact, h.power, h.speed], [C.aqua, C.gold, C.lime]);
        this.rowACount = PN.SWINGS.length;
        var wA = 118, gapA = 8;
        var totalA = PN.SWINGS.length * wA + (PN.SWINGS.length - 1) * gapA;
        var x0 = (DW - totalA) / 2;
        for (i = 0; i < this.chipA.length; i += 1) {
          var ch = this.chipA[i];
          if (i < PN.SWINGS.length) {
            var sw = PN.SWINGS[i];
            x = x0 + i * (wA + gapA);
            this.placeChip(ch, x, 660, wA, 46, sw.name,
              'x' + sw.power.toFixed(2), i === this.swingPlan, sw.color);
            addControl('ca' + i, x, 660 - 23, wA, 46);
          } else {
            this.hideChip(ch);
            setEnabled('ca' + i, false);
          }
        }
        var zl = ['INSIDE', 'MIDDLE', 'OUTSIDE'];
        for (i = 0; i < 3; i += 1) {
          x = 16 + i * 122;
          this.placeChip(this.chipB[i], x, 714, 118, 46, zl[i], '', i === this.guessCol, C.aqua);
          addControl('cb' + i, x, 714 - 23, 118, 46, { drag: true });
        }
        setText(this.actionTxt, this.phase === 'batPitch' ? 'SWING' : 'READY');
        setCol(this.actionTxt, this.phase === 'batPitch' ? C.ink : C.lime);
        this.actionBtn.setTexture(this.phase === 'batPitch' ? 'btn_lg_on' : 'btn_lg');
        this.meterFg.setFillStyle(hexNum(PN.SWINGS[this.swingPlan].color));
        this.setMeter(74 * clamp(PN.SWINGS[this.swingPlan].power / 1.4, 0.1, 1));
        setText(this.meterTxt, 'POWER');
        // zone highlight over the strike zone box
        this.zoneHi.setVisible(this.phase === 'batReady' || this.phase === 'batPitch');
        this.zoneHi.setX(GEO.zone.x + (this.guessCol - 1) * (GEO.zone.hw * 2 / 3));
      } else {
        var arms = this.armsAvailable();
        var arm = g.arm || PN.ROTATION[0];
        setText(this.cardName, arm.name + '  ' + arm.role);
        this.setBars([arm.control, g.stamina, PN.EFFORTS[this.effortSel].accuracy - 0.3],
          [C.aqua, g.stamina > 0.4 ? C.lime : C.coral, C.gold]);
        this.rowACount = arms.length;
        var wB = arms.length >= 4 ? 88 : 118, gapB = 8;
        var totalB = arms.length * wB + (arms.length - 1) * gapB;
        var xb = (DW - totalB) / 2;
        for (i = 0; i < this.chipA.length; i += 1) {
          if (i < arms.length) {
            x = xb + i * (wB + gapB);
            this.placeChip(this.chipA[i], x, 660, wB, 46, arms[i].name, arms[i].tell,
              i === this.pitchSel, arms[i].color);
            addControl('ca' + i, x, 660 - 23, wB, 46);
          } else {
            this.hideChip(this.chipA[i]);
            setEnabled('ca' + i, false);
          }
        }
        for (i = 0; i < 3; i += 1) {
          x = 16 + i * 122;
          this.placeChip(this.chipB[i], x, 714, 118, 46, PN.EFFORTS[i].name, '', i === this.effortSel, PN.EFFORTS[i].color);
          addControl('cb' + i, x, 714 - 23, 118, 46);
        }
        setText(this.actionTxt, this.phase === 'pitching' ? 'STOP' : 'SET');
        setCol(this.actionTxt, this.phase === 'pitching' ? C.ink : C.lime);
        this.actionBtn.setTexture(this.phase === 'pitching' ? 'btn_lg_on' : 'btn_lg');
        this.meterFg.setFillStyle(hexNum(g.stamina > 0.4 ? C.aqua : C.coral));
        this.setMeter(74 * clamp(g.stamina, 0.02, 1));
        setText(this.meterTxt, 'ARM');
        this.zoneHi.setVisible(false);
      }
      setEnabled('swingzone', batting && this.phase === 'batPitch');
    },

    setMeter: function (w) {
      var n = Math.max(3, Math.round(w));
      if (this.meterFg.__w !== n) { this.meterFg.__w = n; this.meterFg.setSize(n, 8); }
    },

    setBars: function (vals, colors) {
      for (var i = 0; i < 3; i += 1) {
        var v = clamp(vals[i] == null ? 0 : vals[i], 0, 1);
        var w = Math.max(3, Math.round(40 * v));
        var bar = this.bars[i].fg;
        if (bar.__w !== w) { bar.__w = w; bar.setSize(w, 7); }
        bar.setFillStyle(hexNum(colors[i]));
      }
    },

    placeChip: function (ch, x, y, w, h, label, sub, active, color) {
      ch.img.setVisible(true).setPosition(x + w / 2, y).setDisplaySize(w, h);
      ch.img.setTexture(active ? 'btn_sm_on' : 'btn_sm');
      ch.img.setTint(active ? hexNum(color) : 0xffffff);
      ch.txt.setVisible(true).setPosition(x + w / 2, sub ? y - 7 : y);
      setText(ch.txt, label);
      setCol(ch.txt, active ? C.ink : C.text);
      if (sub) {
        ch.sub.setVisible(true).setPosition(x + w / 2, y + 11);
        setText(ch.sub, sub);
        setCol(ch.sub, active ? C.ink : C.muted);
      } else ch.sub.setVisible(false);
    },
    hideChip: function (ch) {
      ch.img.setVisible(false);
      ch.txt.setVisible(false);
      ch.sub.setVisible(false);
    },

    // ------------------------------------------------------------ pause
    openPause: function () {
      var self = this;
      kit.openSettings([function (box, row) {
        row('Fullscreen', function () { return !!document.fullscreenElement; }, function () { kit.requestFullscreen(); });
        var b = document.createElement('button');
        b.textContent = 'Quit to menu';
        b.style.cssText = 'font:inherit;font-size:16px;color:#0b0f14;background:#ff7861;border:0;'
          + 'border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);font-weight:700;';
        b.addEventListener('click', function () {
          box.remove();
          kit.resume('settings');
          self.g = null;
          self.clutch = null;
          self.derby = null;
          self.showTitle();
        });
        box.appendChild(b);
      }]);
    },

    // ------------------------------------------------------------- taps
    onDrag: function (id, p) {
      if (this.screen !== 'play') return;
      if (id.indexOf('cb') === 0 && this.playerBattingNow()) {
        var col = clamp(Math.floor((p.x - 16) / 122), 0, 2);
        if (col !== this.guessCol) {
          this.guessCol = col;
          sfx('sfx-tap', { volume: 0.3 });
          this.tutorialDo('zone');
          this.layoutControls();
        }
      }
    },

    onTap: function (id) {
      if (id !== 'swingzone' && id !== 'action') sfx('sfx-tap', { volume: 0.5 });

      // menus
      if (this.screen === 'title') {
        if (id === 'm_season') { this.showSeasonHub(); return; }
        if (id === 'm_exhib') { this.showExhibPick(); return; }
        if (id === 'm_derby') { this.showDerbyIntro(); return; }
        if (id === 'm_clutch') { this.showClutchList(); return; }
        if (id === 'm_roster') { this.showRoster('title'); return; }
        if (id === 'm_settings') { this.openPause(); return; }
        return;
      }
      if (this.screen === 'seasonhub') {
        if (id === 's_play') { this.launchSeasonGame(); return; }
        if (id === 's_roster') { this.showRoster('seasonhub'); return; }
        if (id === 's_back') { this.showTitle(); return; }
        if (id === 's_sim') { this.quickSim(); return; }
        if (id === 's_abandon') {
          save.season = null;
          persist();
          this.showTitle();
          return;
        }
        if (id.indexOf('arm_') === 0) {
          var armId = id.slice(4);
          for (var k = 0; k < PN.ROTATION.length; k += 1) {
            if (PN.ROTATION[k].id === armId) save.season.rotationIndex = k;
          }
          persist();
          this.showSeasonHub();
          return;
        }
        return;
      }
      if (this.screen === 'roster') { if (id === 'r_back') this.backTo(this.rosterFrom); return; }
      if (this.screen === 'clutchlist') {
        if (id === 'cl_back') { this.showTitle(); return; }
        if (id.indexOf('cl_') === 0) {
          var cid = id.slice(3);
          for (var i = 0; i < PN.CLUTCH.length; i += 1) {
            if (PN.CLUTCH[i].id === cid) { this.startClutch(PN.CLUTCH[i]); return; }
          }
        }
        return;
      }
      if (this.screen === 'clutchend') {
        if (id === 'ck_retry') {
          if (this.lastClutch) this.startClutch(this.lastClutch);
          else this.showClutchList();
          return;
        }
        if (id === 'ck_list') { this.showClutchList(); return; }
        return;
      }
      if (this.screen === 'derbyintro') {
        if (id === 'd_start') { this.startDerby(0); return; }
        if (id === 'd_back') { this.showTitle(); return; }
        return;
      }
      if (this.screen === 'derbyend') {
        if (id === 'dy_next') { this.startDerby(Math.min(this.derby.round + 1, PN.DERBY_ROUNDS.length - 1)); return; }
        if (id === 'dy_again') { this.startDerby(0); return; }
        if (id === 'dy_menu') { this.showTitle(); return; }
        return;
      }
      if (this.screen === 'exhibpick') {
        if (id === 'ex_back') { this.showTitle(); return; }
        if (id === 'ex_go') {
          this.startGame({
            mode: 'exhibition', parkId: this.exhibSel.park, oppId: this.exhibSel.opp,
            playerHome: true, innings: this.exhibSel.innings,
            armId: PN.ROTATION[0].id
          });
          return;
        }
        if (id.indexOf('ex_opp_') === 0) { this.exhibSel.opp = id.slice(7); this.showExhibPick(); return; }
        if (id.indexOf('ex_park_') === 0) { this.exhibSel.park = id.slice(8); this.showExhibPick(); return; }
        if (id.indexOf('ex_inn_') === 0) { this.exhibSel.innings = parseInt(id.slice(7), 10); this.showExhibPick(); return; }
        return;
      }
      if (this.screen === 'box') {
        if (id === 'bx_hub') { this.showSeasonHub(); return; }
        if (id === 'bx_menu') { this.showTitle(); return; }
        return;
      }
      if (this.screen === 'seasonend') {
        if (id === 'se_new') {
          save.career.seasons += 1;
          save.season = PN.newSeason((Math.random() * 1e9) | 0, save.tier);
          persist();
          this.showSeasonHub();
          return;
        }
        if (id === 'se_menu') { save.season = null; persist(); this.showTitle(); return; }
        return;
      }

      // live play
      if (this.screen !== 'play') return;
      if (id === 'pause') { this.openPause(); return; }
      if (id === 'throw0' || id === 'throw1') {
        var idx = id === 'throw0' ? 0 : 1;
        if (this.throwOptions && this.throwOptions[idx] && this.throwWindow > 0) {
          sfx('sfx-step', { volume: 0.7 });
          this.resolveThrow(this.throwOptions[idx]);
        }
        return;
      }
      if (id.indexOf('ca') === 0) {
        var n = parseInt(id.slice(2), 10);
        if (this.playerBattingNow()) {
          if (n < PN.SWINGS.length) { this.swingPlan = n; this.tutorialDo('plan'); }
        } else {
          var arms = this.armsAvailable();
          if (n < arms.length) this.pitchSel = n;
        }
        this.layoutControls();
        return;
      }
      if (id.indexOf('cb') === 0) {
        var m = parseInt(id.slice(2), 10);
        if (this.playerBattingNow()) { this.guessCol = m; this.tutorialDo('zone'); }
        else this.effortSel = m;
        this.layoutControls();
        return;
      }
      if (id === 'action' || id === 'swingzone') {
        if (this.phase === 'batPitch') { this.swing(); return; }
        if (this.phase === 'pitching') { this.throwPitch(true); return; }
        if (this.phase === 'batReady') { this.timer = Math.min(this.timer, 0.12); return; }
        if (this.phase === 'pitchReady') { this.timer = Math.min(this.timer, 0.05); return; }
        return;
      }
    },

    backTo: function (from) {
      if (from === 'seasonhub') this.showSeasonHub();
      else this.showTitle();
    },

    launchSeasonGame: function () {
      var s = save.season;
      var row, home, oppId;
      if (s.playoff) {
        oppId = s.playoff.opp;
        home = (s.playoff.wins + s.playoff.losses) % 2 === 0;
      } else {
        row = s.schedule[Math.min(s.game, PN.SEASON_GAMES - 1)];
        oppId = row.opp;
        home = row.home;
      }
      var parkId = s.playoff && s.playoff.round === 1 ? 'meridian'
        : (home ? PN.teamById('n9').park : PN.teamById(oppId).park);
      var arm = PN.ROTATION[s.rotationIndex];
      var stam = clamp(0.55 + s.arms[arm.id].rest * 0.45, 0.35, 1);
      this.startGame({
        mode: 'season', parkId: parkId, oppId: oppId, playerHome: home,
        innings: 9, armId: arm.id, stamina: stam, tier: s.tier,
        bannerTitle: s.playoff ? (s.playoff.round === 0 ? 'SEMIFINAL' : 'PENNANT SERIES') : 'GAME ' + (s.game + 1),
        bannerSub: (home ? 'vs ' : 'at ') + PN.teamById(oppId).name
      });
    },

    quickSim: function () {
      var s = save.season;
      if (!s || s.playoff) { this.chip('Playoff games must be played', C.gold); return; }
      var rnd = PN.rng(s.seed + s.game * 104729 + 3);
      var row = s.schedule[s.game];
      var me = PN.standingsRow(s, 'n9');
      var them = PN.standingsRow(s, row.opp);
      var mine = 1 + ((rnd() * 8) | 0);
      var theirs = 1 + ((rnd() * 8) | 0);
      if (mine === theirs) mine += rnd() < 0.5 ? 1 : -1;
      if (mine < 0) mine = 0;
      me.rf += mine; me.ra += theirs;
      them.rf += theirs; them.ra += mine;
      if (mine > theirs) { me.w += 1; them.l += 1; save.career.wins += 1; }
      else { me.l += 1; them.w += 1; save.career.losses += 1; }
      PN.simOtherGames(s, ['n9', row.opp], rnd);
      PN.rollSeasonDay(s, PN.ROTATION[s.rotationIndex].id, rnd);
      s.game += 1;
      if (s.game >= PN.SEASON_GAMES) {
        var field = PN.playoffField(s);
        if (field.indexOf('n9') >= 0) {
          var opp = field[0] === 'n9' ? field[3] : field[0];
          s.playoff = { round: 0, opp: opp, wins: 0, losses: 0 };
        } else {
          s.done = true;
          save.career.seasons += 1;
          persist();
          this.showSeasonEnd(false, false);
          return;
        }
      }
      persist();
      this.showSeasonHub();
      this.chip('Simmed ' + mine + ' to ' + theirs, mine > theirs ? C.lime : C.coral);
    },

    // ------------------------------------------------------ force hooks
    applyForceMode: function (m) {
      if (m === 'title') { this.showTitle(); return true; }
      if (m === 'season') { this.showSeasonHub(); return true; }
      if (m === 'roster') { this.showRoster('title'); return true; }
      if (m === 'clutchlist') { this.showClutchList(); return true; }
      if (m === 'derby') { this.startDerby(0); return true; }
      if (m === 'clutch') { this.startClutch(PN.CLUTCH[0]); return true; }
      if (m === 'exhibition') {
        this.startGame({
          mode: 'exhibition', parkId: 'rowan', oppId: 'co', playerHome: true,
          innings: 3, armId: PN.ROTATION[0].id
        });
        return true;
      }
      if (m === 'game' || m === 'play') {
        if (!save.season) save.season = PN.newSeason((Math.random() * 1e9) | 0, save.tier);
        this.launchSeasonGame();
        return true;
      }
      return false;
    },
    applyForceStage: function (s) {
      if (typeof s === 'string' && PN.PARKS.some(function (p) { return p.id === s; })) {
        this.setPark(s);
        return true;
      }
      if (typeof s === 'number') {
        var park = PN.PARKS[clamp(s | 0, 0, PN.PARKS.length - 1)];
        this.setPark(park.id);
        return true;
      }
      return false;
    },

    publishHook: function () {
      var h = hook.state;
      var g = this.g;
      h.screen = this.screen;
      h.phase = this.phase;
      h.mode = this.mode;
      h.park = this.parkId;
      h.tier = save.tier;
      h.stage = this.parkId;
      if (g) {
        h.score = g.score[PN.playerSideIndex(g)];
        h.oppScore = g.score[1 - PN.playerSideIndex(g)];
        h.inning = g.inning;
        h.half = g.half;
        h.outs = g.outs;
        h.balls = g.balls;
        h.strikes = g.strikes;
        h.health = clamp(g.stamina, 0, 1);
        h.progress = clamp((g.inning - 1) / g.innings, 0, 1);
      } else {
        h.progress = save.season ? save.season.game / PN.SEASON_GAMES : 0;
        h.health = 1;
      }
      h.seasonGame = save.season ? save.season.game : 0;
    }
  });

  // ------------------------------------------------------------- launch
  function boot() {
    var game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: document.getElementById('game') || document.body,
      width: Math.round(DW * HIDPI_FACTOR),
      height: Math.round(DH * HIDPI_FACTOR),
      backgroundColor: '#071116',
      roundPixels: false,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: Math.round(DW * HIDPI_FACTOR),
        height: Math.round(DH * HIDPI_FACTOR)
      },
      input: { keyboard: false, mouse: false, touch: false },
      render: Object.assign({}, root.GGKit.renderDefaults),
      fps: { target: 60, min: 30 },
      scene: [BootScene, PlayScene]
    });
    root.__pnGame = game;
    kit.registerPWA();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else boot();
})(typeof window !== 'undefined' ? window : globalThis);
