/* game.js -- Slingfang (AAA rebuild).
 *
 * Flick co-op creature RPG. Drag back from the glowing fang and release to
 * launch; bank off walls to break phase barriers; bump ally posts to fire
 * auras; clear twelve authored formations across four world sets, or run the
 * six hand-authored Formation Rush legs.
 *
 * Phaser 3 (vendored, /play/_shared) for rendering only. GGKit is the SOLE
 * implementation of lifecycle, input, save and audio.
 *
 * UI obeys /play/_assets/UI_LAW.md: one transient at a time, corner chips for
 * in-play events, centre banners only at run boundaries, icons over labels,
 * a thin fading tutorial strip, nothing informational under the thumbs.
 */
(function () {
  'use strict';

  var D = window.SFData;
  var A = D.ARENA;
  var T = D.TUNE;

  var W = 390, H = 844;
  var RETINA_FACTOR = GGKit.hiDpi.factor(W, H);
  var ARENA_W = A.right - A.left;
  var ARENA_H = A.bottom - A.top;

  // Launch row: the three base ally posts live inside the arena floor.
  var BASE_POSTS = [
    { x: 78, y: 588 }, { x: 195, y: 596 }, { x: 312, y: 588 }
  ];
  var DOCK_Y = 690;          // roster orb row, inside the thumb zone
  var DOCK_STEP = 58;        // >= 44px touch targets with room to spare

  var STEP = 1 / 60;         // fixed sim step
  var MAX_STEPS = 3;         // degraded devices go slow-mo, never time-skip

  var MAX_ENEMIES = 18;
  var MAX_BARRIERS = 8;
  var MAX_POSTS = 8;
  var MAX_SHARDS = 8;
  var MAX_TRAJ = 40;
  var MAX_MARKS = 4;
  var MAX_FLOATERS = 6;
  var COMBO_WINDOW = 2.4;

  // Centre banner geometry. Run boundaries only; never during live play.
  var BANNER_W = 322, BANNER_H = 186, BANNER_Y = 352;

  var REDUCED = false;
  try {
    REDUCED = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { REDUCED = false; }

  // ------------------------------------------------------ verification hook
  // Readable from the boot fallback AND from the live scene: the object
  // identity never changes, the scene only writes into it.
  var HOOK = {
    ready: false,
    mode: 'boot',            // boot | menu | play | clear | fail | done
    formation: -1,
    formationId: '',
    formationName: '',
    setId: '',
    roster: [],              // unlocked creature ids
    team: [],
    active: '',
    vitality: 0,
    combo: 0,
    bestCombo: 0,
    shots: 0,
    freeShots: 0,
    score: 0,
    enemiesLeft: 0,
    barriersLeft: 0,
    medals: {},
    maxCleared: 0,
    aiming: false,
    launched: false,
    banked: false,
    reducedMotion: REDUCED,
    error: null
  };
  var PENDING = { formation: null, roster: null, mode: null };
  var LIVE = null;           // the live PlayScene, once it exists

  window.__sf = {
    version: '2026-08-11-aaa-fix1',
    get state() { return HOOK; },
    forceFormation: function (n) {
      var i = Math.max(0, Math.min(D.FORMATIONS.length - 1, n | 0));
      if (LIVE && LIVE.forceFormation) { LIVE.forceFormation(i); return true; }
      PENDING.formation = i;
      return true;
    },
    forceRoster: function (id) {
      if (LIVE && LIVE.forceRoster) { LIVE.forceRoster(id); return true; }
      PENDING.roster = id;
      return true;
    },
    forceMode: function (m) {
      if (LIVE && LIVE.forceMode) { LIVE.forceMode(m); return true; }
      PENDING.mode = m;
      return true;
    }
  };

  // ------------------------------------------------------------------ kit
  var kit = window.GGKit.create({
    slug: 'slingfang',
    orientation: 'portrait',
    validateSave: function (o) {
      return !!o && typeof o === 'object' && !Array.isArray(o) && o.v === 1;
    },
    onPause: function () { if (LIVE) LIVE.setFrozen(true); },
    onResume: function () { if (LIVE) LIVE.setFrozen(false); },
    onRestart: function () { if (LIVE) LIVE.restartFormation(); }
  });
  if (REDUCED) kit.juice.enabled = false;

  var SAVE_DEFAULT = {
    v: 1, maxCleared: 0, medals: {}, bestScore: 0, bestRush: 0,
    active: 'flint', seenTutorial: 0
  };

  function loadSave() {
    var s = kit.save.get(null);
    if (!s) return JSON.parse(JSON.stringify(SAVE_DEFAULT));
    var out = JSON.parse(JSON.stringify(SAVE_DEFAULT));
    out.maxCleared = clampInt(s.maxCleared, 0, D.FORMATIONS.length, 0);
    out.bestScore = clampInt(s.bestScore, 0, 9999999, 0);
    out.bestRush = clampInt(s.bestRush, 0, 9999999, 0);
    out.seenTutorial = clampInt(s.seenTutorial, 0, 9, 0);
    // Persisted ids must validate against the content registry.
    out.active = D.creature(s.active).id;
    out.medals = {};
    if (s.medals && typeof s.medals === 'object') {
      for (var k in s.medals) {
        if (!Object.prototype.hasOwnProperty.call(s.medals, k)) continue;
        var v = s.medals[k];
        if (v === 'bronze' || v === 'silver' || v === 'gold') out.medals[k] = v;
      }
    }
    return out;
  }

  var SAVE = loadSave();
  function persist() {
    SAVE.v = 1;
    kit.save.set(SAVE);
    HOOK.medals = SAVE.medals;
    HOOK.maxCleared = SAVE.maxCleared;
  }

  // --------------------------------------------------------------- helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  function clampInt(v, a, b, f) {
    return Number.isFinite(v) ? Math.round(clamp(v, a, b)) : f;
  }
  function setTextIfChanged(o, s) {
    if (!o) return;
    if (o.__txt !== s) { o.__txt = s; o.setText(s); }
  }
  function setTintIfChanged(o, c) {
    // The same change guard setText gets: setTint dirties the batch too.
    if (!o) return;
    if (o.__tintv !== c) { o.__tintv = c; o.setTint(c); }
  }
  function setVisibleIfChanged(o, v) {
    if (!o) return;
    if (o.visible !== v) o.setVisible(v);
  }

  var AUDIO = {
    pull: 'assets/sfx_pull.mp3',
    launch: 'assets/sfx_launch.mp3',
    bank: 'assets/sfx_bank.mp3',
    impact: 'assets/sfx_impact.mp3',
    brk: 'assets/sfx_break.mp3',
    brood: 'assets/sfx_brood.mp3',
    aura: 'assets/sfx_aura.mp3',
    drop: 'assets/sfx_drop.mp3',
    medal: 'assets/sfx_medal.mp3',
    unlock: 'assets/sfx_unlock.mp3',
    tap: 'assets/sfx_tap.mp3',
    fail: 'assets/sfx_fail.mp3',
    music_field: 'assets/music_field.mp3',
    music_rush: 'assets/music_rush.mp3'
  };
  kit.audio.register(AUDIO);

  // ============================================================ BootScene
  function BootScene() { Phaser.Scene.call(this, { key: 'Boot' }); }
  BootScene.prototype = Object.create(Phaser.Scene.prototype);
  BootScene.prototype.constructor = BootScene;

  BootScene.prototype.preload = function () {
    kit.loader.show('Slingfang');
    this.load.on('progress', function (p) { kit.loader.progress(p * 0.8); });
    this.load.atlas('atlas', 'assets/atlas.png', 'assets/atlas.json');
    this.load.image('ground', 'assets/ground.png');
    this.load.image('disc', 'assets/disc.png');
    this.load.image('edge', 'assets/edge.png');
  };

  BootScene.prototype.create = function () {
    this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.centerOn(W / 2, H / 2);
    // 1x1 white pixel: every meter, rule and fill scales this instead of
    // leaving a static Graphics in the display list.
    var g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 4, 4);
    g.generateTexture('px', 4, 4);
    g.destroy();

    kit.loader.progress(0.9);
    // Audio decode is lazy and must never block the first frame; the buffers
    // land behind the title screen.
    kit.audio.preload(Object.keys(AUDIO));
    kit.loader.progress(1);
    kit.loader.hide();
    kit.registerPWA();
    this.scene.start('Menu');
  };

  // ============================================================ MenuScene
  function MenuScene() { Phaser.Scene.call(this, { key: 'Menu' }); }
  MenuScene.prototype = Object.create(Phaser.Scene.prototype);
  MenuScene.prototype.constructor = MenuScene;

  MenuScene.prototype.create = function () {
    this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.centerOn(W / 2, H / 2);
    var self = this;
    HOOK.mode = 'menu';
    HOOK.ready = true;
    this.taps = [];               // {x,y,w,h,fn}
    this.prevIds = new Set();

    this.add.image(0, 0, 'px').setOrigin(0).setDisplaySize(W, H).setTint(0x0a0f18);
    this.add.image(W / 2, 250, 'disc').setDisplaySize(560, 560)
      .setTint(0x1a3a4a).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);

    this.add.image(W / 2, 176, 'atlas', 'fang').setScale(1.0);
    this.add.text(W / 2, 268, 'SLINGFANG', {
      fontFamily: 'SF Display, Trebuchet MS, sans-serif', fontSize: '38px',
      color: '#e8fff8', resolution: RETINA_FACTOR
    }).setOrigin(0.5);
    // Narrow face at 13px: the display face at this length runs off both
    // edges of a 390pt screen.
    this.add.text(W / 2, 302, 'pull back  ·  bank  ·  break the formation', {
      fontFamily: 'SF Body, Verdana, sans-serif', fontSize: '13px',
      color: '#7f9bb0', resolution: RETINA_FACTOR
    }).setOrigin(0.5);

    // Campaign progress strip: medals earned, told with marks not sentences.
    var earned = 0, gold = 0;
    for (var i = 0; i < D.FORMATIONS.length; i++) {
      var m = SAVE.medals[D.FORMATIONS[i].id];
      if (m) earned++;
      if (m === 'gold') gold++;
    }
    for (var j = 0; j < D.FORMATIONS.length; j++) {
      var mm = SAVE.medals[D.FORMATIONS[j].id];
      var px = 40 + (j % 6) * 62;
      var py = 348 + Math.floor(j / 6) * 46;
      var pip = this.add.image(px, py, 'atlas', mm ? 'medal_' + mm : 'hi_lock')
        .setScale(mm ? 0.5 : 0.42);
      if (!mm) pip.setAlpha(0.32);
    }

    this.button(W / 2, 470, 240, 60, 'CAMPAIGN', 0x39d353, function () {
      kit.audio.sfx('tap');
      self.scene.start('Play', { mode: 'campaign', formation: Math.min(SAVE.maxCleared, D.FORMATIONS.length - 1) });
    });
    this.button(W / 2, 544, 240, 56, 'FORMATION RUSH', 0x7ac8ff, function () {
      kit.audio.sfx('tap');
      self.scene.start('Play', { mode: 'rush', formation: 0 });
    });
    if (SAVE.maxCleared > 0) {
      this.button(W / 2, 612, 240, 48, 'REPLAY FROM FIRST', 0x3a4a5e, function () {
        kit.audio.sfx('tap');
        self.scene.start('Play', { mode: 'campaign', formation: 0 });
      });
    }
    this.button(W / 2, SAVE.maxCleared > 0 ? 676 : 612, 240, 48, 'SETTINGS', 0x3a4a5e, function () {
      kit.audio.sfx('tap');
      kit.openSettings();
    });

    var best = 'best ' + SAVE.bestScore + '  ·  rush ' + SAVE.bestRush +
      '  ·  ' + earned + '/' + D.FORMATIONS.length + ' medals  ·  ' + gold + ' gold';
    this.add.text(W / 2, 764, best, {
      fontFamily: 'SF Body, Verdana, sans-serif', fontSize: '12px', color: '#6f8798', resolution: RETINA_FACTOR
    }).setOrigin(0.5);

    if (PENDING.mode !== null || PENDING.formation !== null) {
      var pendingMode = PENDING.mode === 'rush' ? 'rush' : 'campaign';
      var f = PENDING.formation === null ? 0 : PENDING.formation;
      PENDING.mode = null;
      PENDING.formation = null;
      this.scene.start('Play', { mode: pendingMode, formation: f });
      return;
    }
    kit.audio.music('music_field', 900);
  };

  MenuScene.prototype.button = function (cx, cy, w, h, label, tint, fn) {
    var bg = this.add.image(cx, cy, 'px').setDisplaySize(w, h).setTint(0x14202e);
    var line = this.add.image(cx, cy + h / 2 - 2, 'px').setDisplaySize(w, 3).setTint(tint);
    bg.setAlpha(0.96); line.setAlpha(0.9);
    this.add.text(cx, cy, label, {
      fontFamily: 'SF Display, Trebuchet MS, sans-serif', fontSize: '17px',
      color: '#e8fff8', resolution: RETINA_FACTOR
    }).setOrigin(0.5);
    this.taps.push({ x: cx - w / 2, y: cy - h / 2, w: w, h: h, fn: fn });
  };

  MenuScene.prototype.update = function () {
    // GGKit owns input. Down-edges are derived from its per-pointer identity
    // map, so the menu never grows its own DOM handlers (and never has to
    // seed kit.input.pointers at claim time).
    var ids = new Set();
    var fired = null;
    var it = kit.input.pointers.entries();
    var n = it.next();
    while (!n.done) {
      var id = n.value[0], p = n.value[1];
      ids.add(id);
      if (!this.prevIds.has(id) && !fired) {
        var d = toDesign(this.game, p.startX, p.startY);
        for (var i = 0; i < this.taps.length; i++) {
          var t = this.taps[i];
          if (d.x >= t.x && d.x <= t.x + t.w && d.y >= t.y && d.y <= t.y + t.h) {
            fired = t; break;
          }
        }
      }
      n = it.next();
    }
    this.prevIds = ids;
    if (fired) fired.fn();
  };

  // Map a CSS-pixel client point into the 390x844 design space.
  // getBoundingClientRect forces layout, and the scratch object would be a
  // fresh allocation on every pointer on every sim step: the rect is cached
  // per frame and the result is written into a caller-owned point.
  var RECT = { x: 0, y: 0, w: 0, h: 0, stamp: -1 };
  var PT_A = { x: 0, y: 0 }, PT_B = { x: 0, y: 0 };
  function refreshRect(game, stamp) {
    if (RECT.stamp === stamp) return;
    RECT.stamp = stamp;
    var r = game.canvas.getBoundingClientRect();
    RECT.x = r.left; RECT.y = r.top; RECT.w = r.width; RECT.h = r.height;
  }
  function toDesignInto(game, cx, cy, out) {
    refreshRect(game, game.loop.frame);
    if (!RECT.w || !RECT.h) { out.x = -999; out.y = -999; return out; }
    out.x = (cx - RECT.x) / RECT.w * W;
    out.y = (cy - RECT.y) / RECT.h * H;
    return out;
  }
  function toDesign(game, cx, cy) {
    return toDesignInto(game, cx, cy, { x: 0, y: 0 });
  }

  // ============================================================ PlayScene
  function PlayScene() { Phaser.Scene.call(this, { key: 'Play' }); }
  PlayScene.prototype = Object.create(Phaser.Scene.prototype);
  PlayScene.prototype.constructor = PlayScene;

  PlayScene.prototype.init = function (data) {
    this.mode = (data && data.mode === 'rush') ? 'rush' : 'campaign';
    this.formationIndex = (data && data.formation | 0) || 0;
    this.frozen = false;
  };

  PlayScene.prototype.create = function () {
    this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.centerOn(W / 2, H / 2);
    LIVE = this;
    var self = this;
    this.acc = 0;
    this.phase = 'aim';        // aim | flight | clear | fail | done
    this.phaseT = 0;
    this.score = 0;
    this.runVitality = T.startVitality;
    this.freeShots = this.mode === 'rush' ? T.rushDropFreeShots : T.dropFreeShots;
    this.prevIds = new Set();
    this.curIds = new Set();
    this.downQueue = [];
    this.pullScratch = { dx: 0, dy: -1, power: 0, len: 0 };
    this.pathSegs = [];
    this.pathBanks = [];
    this.segPool = [];
    this.bankPool = [];
    for (var bp = 0; bp < MAX_MARKS; bp++) {
      this.bankPool.push({ x: 0, y: 0, barrier: false });
    }
    this.path = { segs: null, banks: null };
    this.hitScratch = { ax: 0, x: 0, y: 0 };
    this.kbScratch = { dx: 0, dy: -1, power: 0, len: 0 };
    this.dragId = null;
    this.dragFrom = null;
    this.chipQueue = [];
    this.chipT = 0;
    this.bannerT = 0;
    this.tutorialT = 0;
    this.impactT = 0;
    this.comboRingT = 0;
    this.vitalityFlashT = 0;
    this.comboT = 0;
    this.formationStartScore = 0;
    this.musicIntensity = null;

    this.buildStatic();
    this.buildPools();
    this.buildHud();
    this.buildDock();

    if (PENDING.roster) {
      this.forceUnlock = D.creature(PENDING.roster).id;
      this.activeId = this.forceUnlock;
      PENDING.roster = null;
    }
    else this.activeId = D.creature(SAVE.active).id;
    if (PENDING.formation !== null && this.mode === 'campaign') {
      this.formationIndex = PENDING.formation; PENDING.formation = null;
    }
    this.syncTeam();
    this.loadFormation(this.formationIndex);

    this.events.once('shutdown', function () { if (LIVE === self) LIVE = null; });
  };

  // ----------------------------------------------------------- static bake
  //
  // Fill rate, not JavaScript, is what stalls this frame: a CPU profile of the
  // idle play frame put game.js at 0.8% of samples and the rasteriser at ~30%.
  // So the static world is ONE quad. The arena floor tiling, the frame, the
  // corner bank ticks and the launch rule are all stamped into a single board
  // texture at create time; a full-screen clear colour stands in for the old
  // full-screen background image, and the HUD and dock backings are their own
  // small cropped quads instead of another full-screen sheet.
  //
  // Nothing static stays in the display list as Graphics either: Phaser
  // replays a Graphics command list in full every frame.
  PlayScene.prototype.buildStatic = function () {
    var bx = A.left - 7, by = A.top - 7;
    var bw = ARENA_W + 14, bh = ARENA_H + 14;

    // Restarting the scene (mode switch, test hook) runs this again, and
    // createCanvas() returns NULL for a key already in the manager -- which
    // then dies on getContext(). Reclaim the keys first.
    var baked = ['board', 'boardbg', 'boardframe', 'hudband', 'dockband'];
    for (var bk = 0; bk < baked.length; bk++) {
      if (this.textures.exists(baked[bk])) this.textures.remove(baked[bk]);
    }

    // A CanvasTexture, not a RenderTexture: a RenderTexture keeps its own
    // framebuffer and costs a pipeline flush every frame it is drawn, and this
    // surface never changes after create(). Measured at 4x throttle it was the
    // single biggest game-side contributor to dropped frames.
    var ctex = this.textures.createCanvas('board', bw, bh);
    var ctx = ctex.getContext();

    var g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x0e1624, 1);
    g.fillRoundedRect(0, 0, bw, bh, 20);
    g.generateTexture('boardbg', bw, bh);
    g.destroy();
    ctx.drawImage(this.textures.get('boardbg').getSourceImage(), 0, 0);

    // Tiled floor, stamped once. A TileSprite would re-sample the whole
    // rectangle every frame for a surface that never moves.
    var tile = this.textures.get('ground').getSourceImage();
    var tw = tile.width || 128, th = tile.height || 128;
    ctx.save();
    ctx.beginPath();
    ctx.rect(7, 7, ARENA_W, ARENA_H);
    ctx.clip();
    ctx.globalAlpha = 0.9;
    for (var ty = 0; ty < ARENA_H; ty += th) {
      for (var tx = 0; tx < ARENA_W; tx += tw) {
        ctx.drawImage(tile, 7 + tx, 7 + ty);
      }
    }
    ctx.restore();

    var f = this.make.graphics({ x: 0, y: 0, add: false });
    f.lineStyle(2, 0x22384f, 1);
    f.strokeRoundedRect(1, 1, bw - 2, bh - 2, 20);
    f.lineStyle(1, 0x1a2b3d, 1);
    f.strokeRoundedRect(10, 10, bw - 20, bh - 20, 14);
    // corner bank ticks: they tell you which edges you can ricochet from
    var ct = [[7, 7, 1, 1], [bw - 7, 7, -1, 1],
              [7, bh - 7, 1, -1], [bw - 7, bh - 7, -1, -1]];
    f.lineStyle(3, 0x3f6d86, 1);
    for (var i = 0; i < ct.length; i++) {
      var c = ct[i];
      f.beginPath();
      f.moveTo(c[0] + c[2] * 4, c[1] + c[3] * 30);
      f.lineTo(c[0] + c[2] * 4, c[1] + c[3] * 4);
      f.lineTo(c[0] + c[2] * 30, c[1] + c[3] * 4);
      f.strokePath();
    }
    // launch row rule
    f.lineStyle(1, 0x1d3145, 1);
    f.beginPath();
    f.moveTo(23, 552 - by); f.lineTo(bw - 23, 552 - by);
    f.strokePath();
    f.generateTexture('boardframe', bw, bh);
    f.destroy();
    ctx.drawImage(this.textures.get('boardframe').getSourceImage(), 0, 0);
    ctex.refresh();
    this.textures.remove('boardbg');
    this.textures.remove('boardframe');
    this.board = this.add.image(bx, by, 'board').setOrigin(0);

    // Set-accent wash behind the play area. Kept well inside the arena so it
    // is not another near-full-screen additive quad.
    this.wash = this.add.image(W / 2, A.top + ARENA_H * 0.36, 'disc')
      .setDisplaySize(360, 360).setAlpha(0.20)
      .setBlendMode(Phaser.BlendModes.ADD);

    // HUD band and roster dock backings: two small cropped quads.
    var hb = this.make.graphics({ x: 0, y: 0, add: false });
    hb.fillStyle(0x0c131f, 0.92);
    hb.fillRoundedRect(0, 0, W - 16, 46, 12);
    hb.lineStyle(1, 0x1c2c3e, 1);
    hb.strokeRoundedRect(0, 0, W - 16, 46, 12);
    hb.generateTexture('hudband', W - 16, 46);
    hb.destroy();
    this.add.image(8, 10, 'hudband').setOrigin(0);

    var db = this.make.graphics({ x: 0, y: 0, add: false });
    db.fillStyle(0x0c131f, 0.85);
    db.fillRoundedRect(0, 0, W - 20, 68, 16);
    db.generateTexture('dockband', W - 20, 68);
    db.destroy();
    this.add.image(10, DOCK_Y - 34, 'dockband').setOrigin(0);
  };

  // ---------------------------------------------------------------- pools
  PlayScene.prototype.buildPools = function () {
    var i;
    // Enemies. The verification hook reads THIS pool; there is no second
    // shadow list anywhere in the game (a shipped title desynced a debug view
    // from its preallocated pool exactly that way).
    this.enemies = [];
    for (i = 0; i < MAX_ENEMIES; i++) {
      var s = this.add.image(-200, -200, 'atlas', 'en_mote').setVisible(false);
      // Damage pip. It lives ON the entity, not in the HUD, so a wounded
      // brute or the Master anchor reads without a single HUD word.
      var pip = this.add.image(-200, -200, 'px').setOrigin(0, 0.5)
        .setDisplaySize(2, 3).setVisible(false);
      this.enemies.push({
        sprite: s, pip: pip, active: false, x: 0, y: 0, vx: 0, vy: 0, r: 17,
        hp: 0, maxHp: 0, type: 'mote', def: D.enemy('mote'),
        cool: 0, flash: 0, pulse: Math.random() * 6.28,
        deathT: 0, deathAge: 0, unsealed: false, attackT: 0, warningT: 0
      });
    }
    this.barriers = [];
    for (i = 0; i < MAX_BARRIERS; i++) {
      this.barriers.push({
        sprite: this.add.image(-200, -200, 'atlas', 'barrier').setVisible(false),
        active: false, x: 0, y: 0, w: 0, h: 0, hp: 0, maxHp: 0, flash: 0
      });
    }
    this.posts = [];
    for (i = 0; i < MAX_POSTS; i++) {
      var ps = this.add.image(-200, -200, 'atlas', 'post_flint').setVisible(false);
      var pc = this.add.image(-200, -200, 'atlas', 'cr_flint_idle')
        .setVisible(false).setScale(0.62);
      this.posts.push({
        sprite: ps, occupant: pc, active: false, base: false,
        x: 0, y: 0, creature: 'flint', used: false, glow: 0
      });
    }
    this.shards = [];
    for (i = 0; i < MAX_SHARDS; i++) {
      this.shards.push({
        sprite: this.add.image(-200, -200, 'atlas', 'p_shard')
          .setVisible(false).setScale(0.45),
        active: false, hostile: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, cool: 0
      });
    }

    // Player creature.
    this.player = {
      x: BASE_POSTS[0].x, y: BASE_POSTS[0].y, vx: 0, vy: 0, r: 18,
      launched: false, bounces: 0, wallBanks: 0, settle: 0, time: 0,
      splitUsed: false, gritStacks: 0, shielded: 0, iframes: 0
    };
    this.playerSprite = this.add.image(this.player.x, this.player.y,
      'atlas', 'cr_flint_idle').setScale(0.62);
    this.playerGlow = this.add.image(this.player.x, this.player.y, 'disc')
      .setDisplaySize(96, 96).setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.comboRing = this.add.image(-200, -200, 'atlas', 'p_ring')
      .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);

    // Trajectory preview: pooled dot IMAGES, never a per-frame Graphics path.
    this.traj = [];
    for (i = 0; i < MAX_TRAJ; i++) {
      this.traj.push(this.add.image(-200, -200, 'atlas', 'p_dot')
        .setVisible(false).setScale(0.16).setAlpha(0.85)
        .setBlendMode(Phaser.BlendModes.ADD));
    }
    // Bank markers: the ricochet points, shown BEFORE release.
    this.marks = [];
    for (i = 0; i < MAX_MARKS; i++) {
      this.marks.push(this.add.image(-200, -200, 'atlas', 'p_ring')
        .setVisible(false).setScale(0.36).setTint(0xffe27b)
        .setBlendMode(Phaser.BlendModes.ADD));
    }
    this.aimBand = this.add.image(-200, -200, 'px')
      .setVisible(false).setOrigin(0, 0.5).setAlpha(0.5);

    // Four pooled particle systems (the lane floor is two).
    var common = { blendMode: 'ADD', emitting: false };
    this.fxImpact = this.add.particles(0, 0, 'atlas', Object.assign({
      frame: 'p_spark', lifespan: 420, speed: { min: 90, max: 300 },
      scale: { start: 0.34, end: 0 }, quantity: 8, maxAliveParticles: 90
    }, common));
    this.fxBank = this.add.particles(0, 0, 'atlas', Object.assign({
      frame: 'p_dot', lifespan: 340, speed: { min: 60, max: 210 },
      scale: { start: 0.30, end: 0 }, quantity: 6, maxAliveParticles: 70,
      tint: 0xffe27b
    }, common));
    this.fxAura = this.add.particles(0, 0, 'atlas', Object.assign({
      frame: 'p_ring', lifespan: 620, speed: { min: 20, max: 60 },
      scale: { start: 0.10, end: 0.95 }, alpha: { start: 0.9, end: 0 },
      quantity: 3, maxAliveParticles: 30
    }, common));
    this.fxTrail = this.add.particles(0, 0, 'atlas', Object.assign({
      frame: 'p_dot', lifespan: 340, speed: { min: 4, max: 26 },
      scale: { start: 0.34, end: 0 }, alpha: { start: 0.85, end: 0 },
      quantity: 1, maxAliveParticles: 60
    }, common));

    // Score floaters.
    this.floaters = [];
    for (i = 0; i < MAX_FLOATERS; i++) {
      this.floaters.push({
        text: this.add.text(-200, -200, '', {
          fontFamily: 'SF Display, Trebuchet MS, sans-serif', fontSize: '15px',
          color: '#ffeec2', resolution: RETINA_FACTOR
        }).setOrigin(0.5).setVisible(false),
        t: 0, age: 0, life: 0.75, x: 0, y: 0, baseY: 0
      });
    }
  };

  // ------------------------------------------------------------------ HUD
  PlayScene.prototype.buildHud = function () {
    var f = 'SF Display, Trebuchet MS, sans-serif';
    // One compact top cluster. Icons and meters, no word labels.
    this.add.image(26, 26, 'atlas', 'hi_vital').setScale(0.46);
    this.add.image(102, 26, 'px').setDisplaySize(112, 9).setTint(0x22303f);
    this.vitalFill = this.add.image(47, 26, 'px').setOrigin(0, 0.5)
      .setDisplaySize(110, 9).setTint(0x4be08a);
    this.vitalText = this.add.text(46, 40, '', {
      fontFamily: f, fontSize: '14px', color: '#8fb3c6', resolution: RETINA_FACTOR
    }).setOrigin(0, 0.5);

    this.comboIcon = this.add.image(196, 24, 'atlas', 'hi_combo')
      .setScale(0.44).setVisible(false);
    this.comboText = this.add.text(212, 24, '', {
      fontFamily: f, fontSize: '18px', color: '#ffd678', resolution: RETINA_FACTOR
    }).setOrigin(0, 0.5).setVisible(false);

    this.add.image(272, 26, 'atlas', 'hi_shot').setScale(0.42);
    this.shotText = this.add.text(286, 26, '', {
      fontFamily: f, fontSize: '16px', color: '#bfe4ff', resolution: RETINA_FACTOR
    }).setOrigin(0, 0.5);
    this.freeIcon = this.add.image(342, 26, 'atlas', 'hi_bank')
      .setScale(0.38).setVisible(false);
    this.freeText = this.add.text(356, 26, '', {
      fontFamily: f, fontSize: '15px', color: '#ffe27b', resolution: RETINA_FACTOR
    }).setOrigin(0, 0.5).setVisible(false);

    this.formText = this.add.text(W / 2, 45, '', {
      fontFamily: 'SF Body, Verdana, sans-serif', fontSize: '13px',
      color: '#6f8798', resolution: RETINA_FACTOR
    }).setOrigin(0.5);

    // Thin fading tutorial strip: top edge, one line, never centre-stage.
    // Body (narrow) face and a hard wrap width, because the display face at
    // 14px runs off both edges of a 390pt screen.
    // Kept clear of the 44px pause target in the top-right corner: the strip
    // is centred on the space LEFT of it, not on the screen.
    this.tutorialBg = this.add.image(168, 86, 'px')
      .setDisplaySize(288, 28).setTint(0x0d1826).setAlpha(0).setVisible(false);
    this.tutorial = this.add.text(168, 86, '', {
      fontFamily: 'SF Body, Verdana, sans-serif', fontSize: '13px',
      color: '#a9c8d8', wordWrap: { width: 274 }, align: 'center', resolution: RETINA_FACTOR
    }).setOrigin(0.5).setAlpha(0).setVisible(false);

    // ONE transient chip. New events queue behind it; they never stack.
    this.chipBg = this.add.image(W - 96, 78, 'px')
      .setDisplaySize(168, 32).setTint(0x14212f).setAlpha(0).setVisible(false);
    this.chipIcon = this.add.image(W - 166, 78, 'atlas', 'hi_aura')
      .setScale(0.40).setAlpha(0).setVisible(false);
    this.chipText = this.add.text(W - 150, 78, '', {
      fontFamily: f, fontSize: '14px', color: '#e6f4ff', resolution: RETINA_FACTOR
    }).setOrigin(0, 0.5).setAlpha(0).setVisible(false);

    // Centre banner: run boundaries ONLY (formation clear, medal, unlock,
    // vitality out, campaign complete). Never during live play.
    this.bannerBg = this.add.image(W / 2, BANNER_Y, 'px')
      .setDisplaySize(BANNER_W, BANNER_H).setTint(0x0d1a28)
      .setAlpha(0).setVisible(false);
    this.bannerMedal = this.add.image(W / 2, BANNER_Y - 62, 'atlas', 'medal_gold')
      .setScale(0.9).setAlpha(0).setVisible(false);
    this.bannerTitle = this.add.text(W / 2, BANNER_Y - 4, '', {
      fontFamily: f, fontSize: '22px', color: '#e8fff8', resolution: RETINA_FACTOR
    }).setOrigin(0.5).setAlpha(0).setVisible(false);
    this.bannerSub = this.add.text(W / 2, BANNER_Y + 38, '', {
      fontFamily: 'SF Body, Verdana, sans-serif', fontSize: '13px',
      color: '#96b6c8', align: 'center', lineSpacing: 4,
      wordWrap: { width: BANNER_W - 32 }, resolution: RETINA_FACTOR
    }).setOrigin(0.5).setAlpha(0).setVisible(false);

    // Pause: 44px target in the top-right, clear of the vitality meter.
    this.pauseBtn = this.add.image(W - 26, 78, 'px')
      .setDisplaySize(44, 44).setTint(0x14212f).setAlpha(0.0);
    this.pauseMark = this.add.text(W - 26, 78, '=', {
      fontFamily: f, fontSize: '20px', color: '#7f9bb0', resolution: RETINA_FACTOR
    }).setOrigin(0.5).setAlpha(0.7);

    this.damageVignette = this.add.image(W / 2, H / 2, 'disc')
      .setDisplaySize(W * 2.2, H * 1.6).setTint(0xff5a6e)
      .setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
  };

  PlayScene.prototype.buildDock = function () {
    this.dock = [];
    var n = D.ROSTER.length;
    var x0 = W / 2 - (n - 1) * DOCK_STEP / 2;
    for (var i = 0; i < n; i++) {
      var c = D.creature(i);
      var x = x0 + i * DOCK_STEP;
      var orb = this.add.image(x, DOCK_Y, 'atlas', 'orb_' + c.id).setScale(0.72);
      var lock = this.add.image(x, DOCK_Y, 'atlas', 'hi_lock')
        .setScale(0.42).setVisible(false);
      var ring = this.add.image(x, DOCK_Y, 'atlas', 'p_ring')
        .setScale(0.62).setTint(c.color).setVisible(false)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.dock.push({ id: c.id, x: x, y: DOCK_Y, orb: orb, lock: lock, ring: ring });
    }
  };

  // ------------------------------------------------------------ formation
  PlayScene.prototype.currentFormation = function () {
    return this.mode === 'rush'
      ? D.rushLeg(this.formationIndex)
      : D.formation(this.formationIndex);
  };

  PlayScene.prototype.loadFormation = function (index) {
    var i, f;
    this.formationIndex = index;
    var form = this.currentFormation();
    this.form = form;
    this.shotsUsed = 0;
    this.bestCombo = 0;
    this.combo = 0;
    this.comboT = 0;
    this.vitalityLost = false;
    this.formationVitality = this.runVitality;
    this.formationStartScore = this.score;
    this.phase = 'aim';
    this.phaseT = 0;
    this.player.gritStacks = 0;
    this.player.shielded = 0;
    this.player.iframes = 0;

    for (i = 0; i < this.enemies.length; i++) this.releaseEnemy(this.enemies[i]);
    for (i = 0; i < this.barriers.length; i++) {
      this.barriers[i].active = false;
      this.barriers[i].sprite.setVisible(false);
    }
    for (i = 0; i < this.posts.length; i++) {
      this.posts[i].active = false;
      this.posts[i].sprite.setVisible(false);
      this.posts[i].occupant.setVisible(false);
    }
    for (i = 0; i < this.shards.length; i++) {
      this.shards[i].active = false;
      this.shards[i].sprite.setVisible(false);
    }

    var list = form.enemies || [];
    for (i = 0; i < list.length && i < MAX_ENEMIES; i++) {
      var spec = list[i];
      var def = D.enemy(spec.t);
      var e = this.enemies[i];
      e.active = true;
      e.type = def.key; e.def = def;
      e.x = spec.x; e.y = spec.y; e.vx = 0; e.vy = 0;
      e.r = def.r; e.hp = def.hp; e.maxHp = def.hp;
      e.cool = 0; e.flash = 0; e.deathT = 0; e.deathAge = 0;
      e.unsealed = false; e.attackT = 0; e.warningT = 0;
      e.sprite.setTexture('atlas', def.frame).setVisible(true)
        .setPosition(spec.x, spec.y).setScale(1).setAlpha(1);
      e.pip.setVisible(false);
      setTintIfChanged(e.sprite, 0xffffff);
    }
    var bars = form.barriers || [];
    for (i = 0; i < bars.length && i < MAX_BARRIERS; i++) {
      var bs = bars[i];
      var b = this.barriers[i];
      b.active = true;
      b.x = bs.x; b.y = bs.y; b.w = bs.w; b.h = bs.h;
      b.hp = bs.hp; b.maxHp = bs.hp; b.flash = 0;
      b.sprite.setTexture('atlas', 'barrier').setVisible(true)
        .setPosition(bs.x, bs.y).setDisplaySize(bs.w, bs.h).setAlpha(1);
      setTintIfChanged(b.sprite, 0xffffff);
    }

    // Base posts. The ACTIVE creature always sits in the centre socket: the
    // shot has to leave from the middle of the launch row or every formation
    // reads as biased toward one wall.
    var order = this.baseOrder();
    var pi = 0;
    for (i = 0; i < BASE_POSTS.length && pi < MAX_POSTS; i++, pi++) {
      this.setupPost(this.posts[pi], BASE_POSTS[i].x, BASE_POSTS[i].y,
        order[i], true);
    }
    var fp = form.posts || [];
    for (i = 0; i < fp.length && pi < MAX_POSTS; i++, pi++) {
      this.setupPost(this.posts[pi], fp[i].x, fp[i].y,
        this.team[(i + 1) % this.team.length] || this.team[0], false);
    }

    var set = D.set(form.set);
    this.wash.setTint(set.accent);
    this.syncMusicIntensity(true);

    this.resetPlayer();
    this.refreshDock();
    this.showFormationBrief(form, set);
    this.syncHook();
  };

  PlayScene.prototype.setupPost = function (p, x, y, creatureId, base) {
    var c = D.creature(creatureId);
    p.active = true; p.base = base; p.x = x; p.y = y;
    p.creature = c.id; p.used = false; p.glow = 0;
    p.sprite.setTexture('atlas', 'post_' + c.id).setVisible(true)
      .setPosition(x, y).setScale(base ? 0.86 : 0.7).setAlpha(base ? 1 : 0.92);
    p.occupant.setTexture('atlas', 'cr_' + c.id + '_idle')
      .setPosition(x, y - 4).setScale(base ? 0.5 : 0.42).setVisible(true);
  };

  PlayScene.prototype.releaseEnemy = function (e) {
    e.active = false;
    e.deathT = 0;
    e.deathAge = 0;
    e.unsealed = false;
    e.attackT = 0;
    e.warningT = 0;
    e.sprite.setVisible(false).setPosition(-200, -200);
    e.pip.setVisible(false);
  };

  PlayScene.prototype.resetPlayer = function () {
    var seat = this.activeSeat();
    this.player.x = seat.x; this.player.y = seat.y - 6;
    this.player.vx = 0; this.player.vy = 0;
    this.player.launched = false;
    this.player.bounces = 0;
    this.player.wallBanks = 0;
    this.player.settle = 0;
    this.player.time = 0;
    this.player.splitUsed = false;
    var c = D.creature(this.activeId);
    this.playerSprite.setTexture('atlas', 'cr_' + c.id + '_idle')
      .setPosition(this.player.x, this.player.y).setScale(0.62).setAlpha(1)
      .setVisible(true);
    this.playerGlow.setTint(c.color);
  };

  // Left / CENTRE / right base sockets. team[0] is the active creature and it
  // always takes the centre one.
  PlayScene.prototype.baseOrder = function () {
    var t = this.team || [this.activeId, this.activeId, this.activeId];
    return [t[1] || t[0], t[0], t[2] || t[0]];
  };

  PlayScene.prototype.activeSeat = function () {
    // The active creature launches from the base post that holds it, so the
    // seat moves with the roster pick and the launch reads as "that one".
    for (var i = 0; i < this.posts.length; i++) {
      var p = this.posts[i];
      if (p.active && p.base && p.creature === this.activeId) return p;
    }
    return { x: BASE_POSTS[1].x, y: BASE_POSTS[1].y };
  };

  PlayScene.prototype.syncTeam = function () {
    var unlocked = D.unlockedCount(SAVE.maxCleared);
    var ids = [];
    for (var i = 0; i < unlocked && i < D.ROSTER.length; i++) ids.push(D.creature(i).id);
    if (this.forceUnlock && ids.indexOf(this.forceUnlock) < 0) ids.push(this.forceUnlock);
    if (ids.indexOf(this.activeId) < 0) this.activeId = ids[0];
    // Team is the active creature plus the next two unlocked, wrapping.
    var start = ids.indexOf(this.activeId);
    this.team = [ids[start],
                 ids[(start + 1) % ids.length],
                 ids[(start + 2) % ids.length]];
    this.unlockedIds = ids;
    SAVE.active = this.activeId;
  };

  PlayScene.prototype.reseatBasePosts = function () {
    var order = this.baseOrder();
    var pi = 0;
    for (var i = 0; i < this.posts.length; i++) {
      var p = this.posts[i];
      if (!p.active || !p.base) continue;
      this.setupPost(p, p.x, p.y, order[pi] || order[1], true);
      pi++;
    }
  };

  PlayScene.prototype.refreshDock = function () {
    for (var i = 0; i < this.dock.length; i++) {
      var d = this.dock[i];
      var unlocked = this.unlockedIds.indexOf(d.id) >= 0;
      d.orb.setAlpha(unlocked ? 1 : 0.26);
      setVisibleIfChanged(d.lock, !unlocked);
      setVisibleIfChanged(d.ring, unlocked && d.id === this.activeId);
    }
  };

  // ------------------------------------------------------------- messaging
  PlayScene.prototype.showFormationBrief = function (form, set) {
    // Formation identity belongs in the persistent HUD line, not a banner.
    setTextIfChanged(this.formText,
      (this.mode === 'rush' ? 'RUSH ' : '') +
      (form.index + 1) + '/' + (this.mode === 'rush' ? D.RUSH.length : D.FORMATIONS.length) +
      '  ·  ' + set.name);
    // Coach line: thin strip, three lessons total, never again after that.
    var lesson = null;
    if (this.mode === 'campaign') {
      if (form.index === 0 && SAVE.seenTutorial < 2) {
        lesson = SAVE.seenTutorial < 1
          ? 'Drag back, release, then bank off a wall'
          : 'Bank off a wall to break the first barrier';
        SAVE.seenTutorial = 2; persist();
      } else if (form.set === 'canyon' && SAVE.seenTutorial < 3) {
        lesson = 'Bank off a wall to break barriers';
        SAVE.seenTutorial = 3; persist();
      } else if (form.set === 'yard' && SAVE.seenTutorial < 4) {
        lesson = 'Clip an ally to fire its aura';
        SAVE.seenTutorial = 4; persist();
      }
    }
    if (lesson) {
      setTextIfChanged(this.tutorial, lesson);
      this.tutorialT = 3.4;
      this.tutorial.setVisible(true);
      this.tutorialBg.setVisible(true);
    }
  };

  PlayScene.prototype.chip = function (frame, text, tint) {
    // One at a time. A new chip queues; it never stacks on the live one.
    if (this.chipQueue.length >= 4) this.chipQueue.shift();
    this.chipQueue.push({ frame: frame, text: text, tint: tint || 0xffffff });
  };

  PlayScene.prototype.banner = function (title, sub, medalFrame, hold) {
    // One transient at a time: the coach strip and any queued chip yield to a
    // boundary banner rather than stacking with it.
    this.tutorialT = 0;
    this.tutorial.setVisible(false);
    this.tutorialBg.setVisible(false);
    this.chipQueue.length = 0;
    this.chipT = 0;
    this.chipBg.setVisible(false);
    this.chipIcon.setVisible(false);
    this.chipText.setVisible(false);
    this.bannerTitle.setVisible(true);
    this.bannerSub.setVisible(true);
    this.bannerBg.setVisible(true);
    setTextIfChanged(this.bannerTitle, title);
    setTextIfChanged(this.bannerSub, sub || '');
    if (medalFrame) {
      this.bannerMedal.setTexture('atlas', medalFrame).setVisible(true);
    } else {
      this.bannerMedal.setVisible(false);
    }
    this.bannerT = hold || 2.2;
    this.bannerHold = this.bannerT;
  };

  // -------------------------------------------------------------- controls
  PlayScene.prototype.readInput = function () {
    // Two sets are swapped between frames rather than allocated per step, and
    // the down queue is a reused array: this runs 60 times a second forever.
    var ids = this.curIds;
    ids.clear();
    this.downQueue.length = 0;
    var it = kit.input.pointers.entries();
    var n = it.next();
    var dragSeen = false;
    while (!n.done) {
      var id = n.value[0], p = n.value[1];
      ids.add(id);
      if (!this.prevIds.has(id)) {
        this.downQueue.push(id, p.startX, p.startY);
      }
      if (this.dragId === id) {
        dragSeen = true;
        this.dragCur = toDesignInto(this.game, p.x, p.y, PT_A);
      }
      n = it.next();
    }
    // pointer up: the id vanished from GGKit's identity map
    var released = this.dragId !== null && !dragSeen;
    for (var i = 0; i < this.downQueue.length; i += 3) {
      this.onDown(this.downQueue[i],
        toDesignInto(this.game, this.downQueue[i + 1], this.downQueue[i + 2], PT_B));
    }
    var swap = this.prevIds;
    this.prevIds = ids;
    this.curIds = swap;
    if (released) this.onUp();
  };

  PlayScene.prototype.onDown = function (id, d) {
    // Pause first: it must work in every phase.
    if (Math.abs(d.x - (W - 26)) < 26 && Math.abs(d.y - 78) < 26) {
      kit.audio.sfx('tap');
      kit.openSettings();
      return;
    }
    if (this.phase === 'clear' || this.phase === 'fail' || this.phase === 'done') {
      if (this.bannerT <= 0) this.advanceFromBoundary();
      return;
    }
    // Roster dock.
    if (d.y > DOCK_Y - 34 && d.y < DOCK_Y + 34) {
      for (var i = 0; i < this.dock.length; i++) {
        var dk = this.dock[i];
        if (Math.abs(d.x - dk.x) < DOCK_STEP / 2 && Math.abs(d.y - dk.y) < 30) {
          this.selectCreature(dk.id);
          return;
        }
      }
      return;
    }
    // Aim drag: anywhere in the play area while a shot is not in flight.
    if (this.phase === 'aim' && !this.player.launched && this.dragId === null &&
        d.y > A.top - 10 && d.y < A.bottom + 10) {
      this.dragId = id;
      // d is a shared scratch point; the anchor must be a copy of it.
      this.dragFrom = { x: d.x, y: d.y };
      this.dragCur = { x: d.x, y: d.y };
      kit.audio.sfx('pull', { volume: 0.55 });
      HOOK.aiming = true;
    }
  };

  PlayScene.prototype.onUp = function () {
    var pull = this.pullVector();
    this.dragId = null;
    this.dragFrom = null;
    HOOK.aiming = false;
    if (pull && pull.power >= T.minPower) this.launch(pull);
  };

  PlayScene.prototype.pullVector = function () {
    if (!this.dragFrom || !this.dragCur) return null;
    // Slingshot: the shot flies OPPOSITE the drag, like pulling a band back.
    var dx = this.dragFrom.x - this.dragCur.x;
    var dy = this.dragFrom.y - this.dragCur.y;
    var len = Math.hypot(dx, dy);
    if (len < 6) return null;
    var power = clamp(len / T.maxPull, 0, 1);
    var v = this.pullScratch;
    v.dx = dx / len; v.dy = dy / len; v.power = power; v.len = len;
    return v;
  };

  PlayScene.prototype.keyboardAim = function (dt) {
    // Arrows aim, Space launches. GGKit owns the key state and refuses it
    // while paused, so a paused game can never queue a shot.
    if (this.phase !== 'aim' || this.player.launched) return;
    if (this.kbAngle === undefined) this.kbAngle = -Math.PI / 2;
    if (this.kbPower === undefined) this.kbPower = 0.72;
    var moved = false;
    if (kit.input.keyDown('ArrowLeft')) { this.kbAngle -= dt * 2.2; moved = true; }
    if (kit.input.keyDown('ArrowRight')) { this.kbAngle += dt * 2.2; moved = true; }
    if (kit.input.keyDown('ArrowUp')) { this.kbPower = clamp(this.kbPower + dt * 0.8, 0.22, 1); moved = true; }
    if (kit.input.keyDown('ArrowDown')) { this.kbPower = clamp(this.kbPower - dt * 0.8, 0.22, 1); moved = true; }
    // Rising edge, not level: holding Space must not machine-gun shots, and a
    // launch must not require an arrow press first (Space alone fires the
    // current aim, which starts pointing up the field).
    var space = kit.input.keyDown('Space');
    var pressed = space && !this.prevSpace;
    this.prevSpace = space;
    if (moved || pressed) this.kbActive = true;
    if (pressed) {
      var kv = this.kbScratch;
      kv.dx = Math.cos(this.kbAngle); kv.dy = Math.sin(this.kbAngle);
      kv.power = this.kbPower; kv.len = this.kbPower * T.maxPull;
      this.launch(kv);
    }
  };

  PlayScene.prototype.selectCreature = function (id) {
    if (this.player.launched) return;
    if (this.unlockedIds.indexOf(id) < 0) {
      this.chip('hi_lock', 'clear ' + D.creature(id).unlockAt, 0x93a7bb);
      kit.audio.sfx('tap', { volume: 0.5 });
      return;
    }
    if (id === this.activeId) return;
    this.activeId = id;
    SAVE.active = id;
    persist();
    this.syncTeam();
    this.reseatBasePosts();
    this.resetPlayer();
    this.refreshDock();
    kit.audio.sfx('tap');
    var c = D.creature(id);
    this.chip('orb_' + c.id, c.tag, c.color);
    this.syncHook();
  };

  // ---------------------------------------------------------------- launch
  PlayScene.prototype.launch = function (pull) {
    if (this.player.launched || this.phase !== 'aim') return;
    var speed = T.launchSpeed * (0.36 + pull.power * 0.64);
    this.player.vx = pull.dx * speed;
    this.player.vy = pull.dy * speed;
    this.player.launched = true;
    this.player.bounces = 0;
    this.player.wallBanks = 0;
    this.player.settle = 0;
    this.player.time = 0;
    this.player.splitUsed = false;
    this.shotsUsed++;
    this.phase = 'flight';
    for (var i = 0; i < this.posts.length; i++) this.posts[i].used = false;
    var c = D.creature(this.activeId);
    this.playerSprite.setTexture('atlas', 'cr_' + c.id + '_launch');
    kit.audio.sfx('launch', { volume: 0.8, rate: 0.92 + pull.power * 0.2 });
    this.fxBank.setParticleTint(c.color);
    this.fxBank.emitParticleAt(this.player.x, this.player.y, REDUCED ? 4 : 10);
    this.hideAim();
    this.syncHook();
  };

  PlayScene.prototype.hideAim = function () {
    for (var i = 0; i < this.traj.length; i++) setVisibleIfChanged(this.traj[i], false);
    for (var j = 0; j < this.marks.length; j++) setVisibleIfChanged(this.marks[j], false);
    setVisibleIfChanged(this.aimBand, false);
  };

  // ------------------------------------------------------------------ sim
  PlayScene.prototype.update = function (time, delta) {
    if (this.frozen) return;
    var j = kit.juice.frame();
    var cam = this.cameras.main;
    cam.setScroll(j.dx, j.dy);

    // Clamp the wall-clock delta INTO the stepped sim. A degraded device runs
    // in slow motion; it never receives a time skip.
    var dt = Math.min(delta, 100) / 1000;
    if (!j.frozen) this.acc += dt;
    var steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (this.acc > STEP * MAX_STEPS) this.acc = STEP * MAX_STEPS;
    this.render(dt);
  };

  PlayScene.prototype.step = function (dt) {
    this.readInput();
    this.keyboardAim(dt);
    this.phaseT += dt;
    this.chipStep(dt);
    this.timersStep(dt);

    if (this.phase === 'clear' || this.phase === 'fail' || this.phase === 'done') return;

    var i, e;
    for (i = 0; i < this.enemies.length; i++) {
      e = this.enemies[i];
      if (!e.active) continue;
      e.cool = Math.max(0, e.cool - dt);
      e.flash = Math.max(0, e.flash - dt);
      e.pulse += dt * 2.0;
      var c = D.creature(this.activeId);
      if (c.passive === 'magnet' && this.player.launched && e.def.key !== 'brood') {
        var mdx = this.player.x - e.x, mdy = this.player.y - e.y;
        var md = Math.hypot(mdx, mdy);
        if (md > 14 && md < 140) {
          e.vx += mdx / md * 52 * dt;
          e.vy += mdy / md * 52 * dt;
        }
      }
      e.x = clamp(e.x + e.vx * dt, A.left + e.r, A.right - e.r);
      e.y = clamp(e.y + e.vy * dt, A.top + e.r, 520 - e.r);
      var k = Math.pow(0.04, dt);
      e.vx *= k; e.vy *= k;
    }
    for (i = 0; i < this.barriers.length; i++) {
      if (this.barriers[i].active) {
        this.barriers[i].flash = Math.max(0, this.barriers[i].flash - dt);
      }
    }
    for (i = 0; i < this.posts.length; i++) {
      if (this.posts[i].active) {
        this.posts[i].glow = Math.max(0, this.posts[i].glow - dt);
      }
    }

    this.shardStep(dt);

    if (!this.player.launched) return;
    this.player.time += dt;
    if (this.player.shielded > 0) this.player.shielded -= dt;

    var p = this.player;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    var fk = Math.pow(T.friction, dt);
    p.vx *= fk; p.vy *= fk;

    if (!REDUCED && this.player.time > 0) {
      this.fxTrail.setParticleTint(D.creature(this.activeId).color);
      this.fxTrail.emitParticleAt(p.x, p.y, 1);
    }

    this.wallStep();
    this.barrierStep();
    this.syncMusicIntensity();
    this.enemyStep(dt);
    this.postStep();

    var speed = Math.hypot(p.vx, p.vy);
    if (speed < T.settleSpeed) p.settle += dt; else p.settle = 0;
    if (p.settle > T.settleTime || p.time > T.shotTimeout) this.endShot();
    if (this.runVitality <= 0) this.failFormation();
    else if (this.allClear()) this.clearFormation();
  };

  PlayScene.prototype.wallStep = function () {
    var p = this.player, hit = false, nx = 0, ny = 0;
    if (p.x - p.r < A.left) { p.x = A.left + p.r; p.vx = Math.abs(p.vx); hit = true; nx = 1; }
    else if (p.x + p.r > A.right) { p.x = A.right - p.r; p.vx = -Math.abs(p.vx); hit = true; nx = -1; }
    if (p.y - p.r < A.top) { p.y = A.top + p.r; p.vy = Math.abs(p.vy); hit = true; ny = 1; }
    else if (p.y + p.r > A.bottom) { p.y = A.bottom - p.r; p.vy = -Math.abs(p.vy); hit = true; ny = -1; }
    if (!hit) return;
    p.bounces = Math.min(30, p.bounces + 1);
    p.wallBanks = Math.min(30, p.wallBanks + 1);
    p.vx *= 0.94; p.vy *= 0.94;
    this.onBank(p.x, p.y, nx, ny);
  };

  PlayScene.prototype.onBank = function (x, y, nx, ny) {
    kit.audio.sfx('bank', { volume: 0.6, rate: 0.94 + Math.min(6, this.player.bounces) * 0.05 });
    this.fxBank.setParticleTint(0xffe27b);
    this.fxBank.emitParticleAt(x, y, REDUCED ? 3 : 9);
    kit.juice.shake(2.5, 90);
    if (this.player.bounces === 1) {
      // The one moment the bank rule matters: say it once, in a corner chip.
      this.chip('hi_bank', 'BANKED', 0xffe27b);
    }
    var c = D.creature(this.activeId);
    if (c.passive === 'spark') {
      var near = this.nearestEnemy(x, y, 150);
      if (near) this.damage(near, 1, 'aura', null);
    }
  };

  PlayScene.prototype.barrierStep = function () {
    var p = this.player;
    for (var i = 0; i < this.barriers.length; i++) {
      var b = this.barriers[i];
      if (!b.active) continue;
      var cx = clamp(p.x, b.x - b.w / 2, b.x + b.w / 2);
      var cy = clamp(p.y, b.y - b.h / 2, b.y + b.h / 2);
      var dx = p.x - cx, dy = p.y - cy;
      if (dx * dx + dy * dy > p.r * p.r) continue;
      var horizontal = Math.abs(dx) > Math.abs(dy);
      if (horizontal) { p.vx *= -1; p.x += dx > 0 ? 4 : -4; }
      else { p.vy *= -1; p.y += dy > 0 ? 4 : -4; }
      p.vx *= 0.92; p.vy *= 0.92;
      if (p.wallBanks > 0) {
        b.hp -= 1; b.flash = 0.24;
        this.fxBank.setParticleTint(0x9fe8ff);
        this.fxBank.emitParticleAt(b.x, b.y, REDUCED ? 4 : 12);
        kit.audio.sfx('bank', { volume: 0.75, rate: 1.18 });
        kit.juice.shake(4, 120);
        if (b.hp <= 0) {
          b.active = false;
          b.sprite.setVisible(false);
          this.score += 140;
          this.floater(b.x, b.y, '+140');
          this.chip('hi_bank', 'BARRIER DOWN', 0x9fe8ff);
          kit.audio.sfx('brk', { volume: 0.8, rate: 1.1 });
        } else {
          b.sprite.setTexture('atlas', 'barrier_hit');
        }
      } else {
        // Not banked: the barrier holds, and the miss must READ as a rule,
        // not as a bug. Bright reject flash, no damage, no vitality cost.
        b.flash = 0.18;
        kit.audio.sfx('tap', { volume: 0.4 });
      }
      p.bounces = Math.min(30, p.bounces + 1);
    }
  };

  // The brood changes language when its cage falls: a warning beat leads
  // into a targeted three-shard volley, then the warning repeats. This keeps
  // the finale readable without adding a second heavyweight enemy pool.
  PlayScene.prototype.broodStep = function (e, dt) {
    if (this.barriersLeft() > 0) {
      e.unsealed = false;
      e.attackT = 0;
      e.warningT = 0;
      return;
    }
    if (!e.unsealed) {
      e.unsealed = true;
      e.warningT = 1.0;
      e.attackT = 2.1;
      this.chip('hi_aura', 'BROOD UNSEALED', 0xff6f86);
      kit.audio.sfx('brood', { volume: 0.45, rate: 0.72 });
      return;
    }
    if (e.warningT > 0) {
      e.warningT = Math.max(0, e.warningT - dt);
      return;
    }
    e.attackT -= dt;
    if (e.attackT <= 0) {
      var angle = Math.atan2(this.player.y - e.y, this.player.x - e.x);
      this.spawnShard(e.x, e.y, angle - 0.30, true);
      this.spawnShard(e.x, e.y, angle, true);
      this.spawnShard(e.x, e.y, angle + 0.30, true);
      e.warningT = 0.62;
      e.attackT = 2.5;
      this.fxImpact.setParticleTint(e.def.color);
      this.fxImpact.emitParticleAt(e.x, e.y, REDUCED ? 3 : 9);
      this.chip('hi_aura', 'BROOD VOLLEY', 0xff6f86);
      kit.audio.sfx('brood', { volume: 0.55, rate: 0.86 });
    }
  };

  PlayScene.prototype.enemyStep = function (dt) {
    var p = this.player;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.active) continue;
      if (e.def.key === 'brood') this.broodStep(e, dt);
      var dx = p.x - e.x, dy = p.y - e.y;
      var d = Math.hypot(dx, dy);
      if (d >= p.r + e.r) continue;
      var nx = dx / (d || 1), ny = dy / (d || 1);
      var needsBank = !!e.def.needsBank;
      var broodLocked = e.def.key === 'brood' && this.barriersLeft() > 0;
      if ((needsBank && p.wallBanks === 0) || broodLocked) {
        // Shielded: shoved off, small vitality bite, unmistakable reject.
        p.x = e.x + nx * (p.r + e.r + 2);
        p.y = e.y + ny * (p.r + e.r + 2);
        var sp = Math.hypot(p.vx, p.vy);
        p.vx = nx * sp * 0.8; p.vy = ny * sp * 0.8;
        e.flash = 0.2;
        this.hurt(2);
        kit.audio.sfx('tap', { volume: 0.5, rate: 0.7 });
        continue;
      }
      var c = D.creature(this.activeId);
      var dmg = c.passive === 'pierce' ? 2 : 1;
      if (p.gritStacks > 0) { dmg *= 2; p.gritStacks--; }
      this.damage(e, dmg, 'player', { x: nx, y: ny });
      if (!e.active) continue;
      p.x = e.x + nx * (p.r + e.r + 1);
      p.y = e.y + ny * (p.r + e.r + 1);
      if (c.passive !== 'pierce') {
        var dot = p.vx * nx + p.vy * ny;
        p.vx -= 2 * dot * nx; p.vy -= 2 * dot * ny;
        p.vx *= 0.9; p.vy *= 0.9;
      }
    }
  };

  PlayScene.prototype.postStep = function () {
    var p = this.player;
    for (var i = 0; i < this.posts.length; i++) {
      var post = this.posts[i];
      if (!post.active || post.used) continue;
      if (post.creature === this.activeId && post.base) continue;
      if (Math.hypot(p.x - post.x, p.y - post.y) > p.r + 24) continue;
      post.used = true;
      post.glow = 0.6;
      this.fireAura(post);
      var n = Math.hypot(p.x - post.x, p.y - post.y) || 1;
      var sp = Math.hypot(p.vx, p.vy);
      p.vx = (p.x - post.x) / n * sp;
      p.vy = (p.y - post.y) / n * sp;
    }
  };

  PlayScene.prototype.fireAura = function (post) {
    var c = D.creature(post.creature);
    kit.audio.sfx('aura', { volume: 0.85 });
    this.fxAura.setParticleTint(c.color);
    this.fxAura.emitParticleAt(post.x, post.y, REDUCED ? 1 : 3);
    kit.juice.shake(3, 120);
    var i, e;
    if (c.aura === 'heal') {
      this.runVitality = clamp(this.runVitality + 22, 0, T.maxVitality);
    } else if (c.aura === 'shock') {
      for (i = 0; i < this.enemies.length; i++) {
        e = this.enemies[i];
        if (e.active && Math.hypot(e.x - post.x, e.y - post.y) < 118) {
          this.damage(e, 2, 'aura', null);
        }
      }
    } else if (c.aura === 'shield') {
      this.player.shielded = 6;
    } else if (c.aura === 'grit') {
      this.player.gritStacks = Math.min(3, this.player.gritStacks + 1);
    } else if (c.aura === 'rend') {
      for (i = 0; i < 4; i++) {
        this.spawnShard(post.x, post.y, i * Math.PI / 2 + 0.4);
      }
    } else if (c.aura === 'tug') {
      for (i = 0; i < this.enemies.length; i++) {
        e = this.enemies[i];
        if (!e.active) continue;
        var dx = post.x - e.x, dy = post.y - e.y, d = Math.hypot(dx, dy);
        if (d > 8 && d < 210) { e.vx += dx / d * 190; e.vy += dy / d * 190; }
      }
    }
    // Corner chip, not a banner: this fires several times per shot.
    this.chip('hi_aura', c.tag + ' ' + c.aura.toUpperCase(), c.color);
    this.syncMusicIntensity();
  };

  PlayScene.prototype.damage = function (e, amount, source, normal) {
    if (!e.active || e.cool > 0) return;
    // Protection is enforced here, not only in player collision code. Auras,
    // splinters and wall-bank passives must obey the same phase rules.
    if (e.def.needsBank && this.player.wallBanks === 0) return;
    if (e.def.key === 'brood' && this.barriersLeft() > 0) return;
    e.hp -= amount;
    e.cool = 0.1;
    e.flash = 0.2;

    // Impact escalates with the combo: particles, shake, hit-stop, pitch.
    var tier = Math.min(6, Math.max(1, this.combo));
    var qty = REDUCED ? 3 : 5 + tier * 2;
    this.fxImpact.setParticleTint(e.def.color);
    this.fxImpact.emitParticleAt(e.x, e.y, qty);
    kit.juice.shake(2 + tier * 1.1, 90 + tier * 16);
    if (this.combo >= 3) kit.juice.hitStop(Math.min(70, 18 + tier * 9));
    kit.audio.sfx('impact', {
      volume: 0.7, rate: clamp(0.9 + this.combo * 0.055, 0.9, 1.9)
    });
    this.impactT = 0.16;
    this.comboRingT = 0.32;

    var c = D.creature(this.activeId);
    if (source === 'player' && c.passive === 'split' && !this.player.splitUsed) {
      this.player.splitUsed = true;
      var base = Math.atan2(this.player.vy, this.player.vx);
      this.spawnShard(this.player.x, this.player.y, base - 0.45);
      this.spawnShard(this.player.x, this.player.y, base + 0.45);
    }

    if (e.hp <= 0) {
      this.combo = Math.min(99, this.combo + 1);
      this.comboT = COMBO_WINDOW;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      var multiplier = Math.max(1, Math.min(8, this.combo));
      var val = e.def.score * multiplier;
      e.active = false;
      e.deathT = 0.48;
      e.deathAge = 0;
      e.sprite.setVisible(true).setPosition(e.x, e.y).setScale(1.08);
      e.pip.setVisible(false);
      this.score += val;
      this.floater(e.x, e.y, '+' + val);
      this.fxImpact.setParticleTint(0xfff0c4);
      this.fxImpact.emitParticleAt(e.x, e.y, REDUCED ? 5 : (e.def.key === 'brood' ? 40 : 14));
      kit.audio.sfx(e.def.key === 'brood' ? 'brood' : 'brk',
        { volume: e.def.key === 'brood' ? 1 : 0.7 });
      kit.juice.shake(e.def.key === 'brood' ? 14 : 5, e.def.key === 'brood' ? 480 : 130);
      if (c.passive === 'mend') {
        this.runVitality = clamp(this.runVitality + 4, 0, T.maxVitality);
      }
    }
    if (source === 'player' && e.def.key !== 'brood') {
      this.hurt(e.def.key === 'brute' ? T.recoilBrute : T.recoilBase);
    }
    this.syncHook();
  };

  PlayScene.prototype.hurt = function (amount) {
    if (this.player.iframes > 0 || this.phase === 'fail' || this.phase === 'done') return;
    var c = D.creature(this.activeId);
    if (this.player.shielded > 0) amount = Math.ceil(amount * 0.35);
    if (c.passive === 'ward') amount = Math.ceil(amount * 0.4);
    if (amount <= 0) return;
    this.player.iframes = 0.48;
    this.runVitality = clamp(this.runVitality - amount, 0, T.maxVitality);
    this.vitalityLost = true;
    this.vitalityFlashT = 0.3;
    this.syncMusicIntensity();
    if (this.runVitality <= 0) this.failFormation();
  };

  PlayScene.prototype.spawnShard = function (x, y, angle, hostile) {
    for (var i = 0; i < this.shards.length; i++) {
      var s = this.shards[i];
      if (s.active) continue;
      s.active = true;
      s.hostile = !!hostile;
      s.x = x; s.y = y;
      s.vx = Math.cos(angle) * 380;
      s.vy = Math.sin(angle) * 380;
      s.life = 1.7; s.cool = 0;
      s.sprite.setVisible(true).setPosition(x, y)
        .setTint(s.hostile ? 0xff6f86 : D.creature(this.activeId).color);
      return;
    }
  };

  PlayScene.prototype.shardStep = function (dt) {
    for (var i = 0; i < this.shards.length; i++) {
      var s = this.shards[i];
      if (!s.active) continue;
      s.life -= dt;
      s.cool = Math.max(0, s.cool - dt);
      s.x += s.vx * dt; s.y += s.vy * dt;
      var k = Math.pow(0.08, dt);
      s.vx *= k; s.vy *= k;
      if (s.x < A.left + 7 || s.x > A.right - 7) s.vx *= -1;
      if (s.y < A.top + 7 || s.y > A.bottom - 7) s.vy *= -1;
      if (s.hostile && Math.hypot(s.x - this.player.x, s.y - this.player.y) < 18 + 8) {
        this.hurt(5);
        s.active = false;
        s.sprite.setVisible(false);
        continue;
      }
      if (s.hostile) {
        if (s.life <= 0) { s.active = false; s.sprite.setVisible(false); }
        continue;
      }
      for (var j = 0; j < this.enemies.length && s.cool <= 0; j++) {
        var e = this.enemies[j];
        if (!e.active) continue;
        if (Math.hypot(s.x - e.x, s.y - e.y) < 8 + e.r) {
          s.cool = 0.18;
          this.damage(e, 1, 'shard', null);
        }
      }
      if (s.life <= 0) { s.active = false; s.hostile = false; s.sprite.setVisible(false); }
    }
  };

  PlayScene.prototype.nearestEnemy = function (x, y, maxDist) {
    var best = null, bd = maxDist;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.active) continue;
      var d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };

  PlayScene.prototype.enemiesLeft = function () {
    var n = 0;
    for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].active) n++;
    return n;
  };
  PlayScene.prototype.barriersLeft = function () {
    var n = 0;
    for (var i = 0; i < this.barriers.length; i++) if (this.barriers[i].active) n++;
    return n;
  };
  PlayScene.prototype.allClear = function () {
    return this.enemiesLeft() === 0 && this.barriersLeft() === 0;
  };

  PlayScene.prototype.syncMusicIntensity = function (force) {
    var high = this.mode === 'rush' || !!(this.form &&
      (this.form.brood || this.runVitality <= 35 || this.barriersLeft() >= 2));
    if (!force && high === this.musicIntensity) return;
    this.musicIntensity = high;
    kit.audio.music(high ? 'music_rush' : 'music_field', 900);
  };

  PlayScene.prototype.endShot = function () {
    var p = this.player;
    p.launched = false;
    p.vx = 0; p.vy = 0;
    if (this.allClear()) { this.clearFormation(); return; }
    var left = this.enemiesLeft();
    if (left > 0) {
      if (this.freeShots > 0) {
        this.freeShots--;
        this.chip('hi_bank', 'FREE SHOT', 0xffe27b);
      } else {
        var drain = clamp(left - 2, T.endShotDrainMin, T.endShotDrainMax);
        this.hurt(drain);
      }
    }
    for (var i = 0; i < this.shards.length; i++) {
      this.shards[i].active = false;
      this.shards[i].sprite.setVisible(false);
    }
    if (this.phase === 'flight') this.phase = 'aim';
    this.resetPlayer();
    this.syncHook();
  };

  // ------------------------------------------------------------ boundaries
  PlayScene.prototype.clearFormation = function () {
    if (this.phase === 'clear' || this.phase === 'done') return;
    this.phase = 'clear';
    this.player.launched = false;
    this.player.vx = 0; this.player.vy = 0;
    this.hideAim();
    this.resetPlayer();

    var form = this.form;
    var medal = D.medalFor(form, this.shotsUsed, this.bestCombo, this.vitalityLost);
    var bonus = { bronze: 200, silver: 500, gold: 1200 }[medal] || 200;
    this.score += bonus;

    var prevMedal = SAVE.medals[form.id];
    var better = !prevMedal ||
      (D.MEDAL_VALUE[medal] || 0) > (D.MEDAL_VALUE[prevMedal] || 0);
    if (better) SAVE.medals[form.id] = medal;

    var unlockedBefore = D.unlockedCount(SAVE.maxCleared);
    if (this.mode === 'campaign') {
      SAVE.maxCleared = Math.max(SAVE.maxCleared, form.index + 1);
    }
    var unlockedAfter = D.unlockedCount(SAVE.maxCleared);
    this.newUnlock = null;
    if (unlockedAfter > unlockedBefore) {
      this.newUnlock = D.creature(unlockedAfter - 1);
    }
    if (this.score > SAVE.bestScore && this.mode === 'campaign') SAVE.bestScore = this.score;
    if (this.score > SAVE.bestRush && this.mode === 'rush') SAVE.bestRush = this.score;
    persist();

    // GENEROUS drop, per the owner directive: never a rationed trickle.
    var dv = this.mode === 'rush' ? T.rushDropVitality : T.dropVitality;
    var df = this.mode === 'rush' ? T.rushDropFreeShots : T.dropFreeShots;
    this.runVitality = clamp(this.runVitality + dv, 0, T.maxVitality);
    this.freeShots += df;
    kit.audio.sfx('drop', { volume: 0.8 });

    kit.audio.sfx('medal', { volume: 0.9 });
    this.banner(medal.toUpperCase(),
      form.name + '\n' + this.shotsUsed + ' shots  ·  x' + this.bestCombo +
      ' combo\n+' + dv + ' vitality  ·  +' + df + ' free shots\nTAP TO CONTINUE',
      'medal_' + medal, 2.6);
    this.syncHook();
  };

  PlayScene.prototype.failFormation = function () {
    if (this.phase === 'fail' || this.phase === 'done') return;
    this.phase = 'fail';
    this.runVitality = 0;
    this.player.launched = false;
    this.player.vx = 0; this.player.vy = 0;
    this.hideAim();
    kit.audio.sfx('fail', { volume: 0.9 });
    kit.juice.shake(10, 400);
    this.banner('VITALITY OUT',
      this.form.name + '\ntap to retry this formation', null, 1.8);
    this.syncHook();
  };

  PlayScene.prototype.advanceFromBoundary = function () {
    if (this.phase === 'fail') {
      this.score = this.formationStartScore;
      this.runVitality = T.startVitality;
      this.freeShots = Math.max(this.freeShots, this.mode === 'rush'
        ? T.rushDropFreeShots : T.dropFreeShots);
      this.hideBanner();
      this.syncTeam();
      this.loadFormation(this.formationIndex);
      return;
    }
    if (this.phase === 'done') {
      this.hideBanner();
      this.scene.start('Menu');
      return;
    }
    if (this.phase !== 'clear') return;

    if (this.newUnlock) {
      var c = this.newUnlock;
      this.newUnlock = null;
      kit.audio.sfx('unlock');
      this.banner(c.name.toUpperCase(), c.passiveText + '\n' + c.auraText,
        'orb_' + c.id, 2.4);
      this.syncTeam();
      this.refreshDock();
      return;
    }
    var total = this.mode === 'rush' ? D.RUSH.length : D.FORMATIONS.length;
    if (this.formationIndex + 1 >= total) {
      this.phase = 'done';
      this.banner(this.mode === 'rush' ? 'RUSH COMPLETE' : 'SLINGFANG COMPLETE',
        'score ' + this.score + '\ntap to return', 'medal_gold', 2.4);
      return;
    }
    this.hideBanner();
    this.syncTeam();
    this.loadFormation(this.formationIndex + 1);
  };

  PlayScene.prototype.hideBanner = function () {
    this.bannerT = 0;
    this.bannerBg.setVisible(false).setAlpha(0);
    this.bannerTitle.setVisible(false).setAlpha(0);
    this.bannerSub.setVisible(false).setAlpha(0);
    this.bannerMedal.setVisible(false).setAlpha(0);
  };

  // --------------------------------------------------------------- timers
  PlayScene.prototype.timersStep = function (dt) {
    if (this.bannerT > 0) this.bannerT = Math.max(0, this.bannerT - dt);
    if (this.tutorialT > 0) this.tutorialT = Math.max(0, this.tutorialT - dt);
    if (this.impactT > 0) this.impactT = Math.max(0, this.impactT - dt);
    if (this.comboRingT > 0) this.comboRingT = Math.max(0, this.comboRingT - dt);
    if (this.vitalityFlashT > 0) this.vitalityFlashT = Math.max(0, this.vitalityFlashT - dt);
    if (this.player.iframes > 0) this.player.iframes = Math.max(0, this.player.iframes - dt);
    if (this.comboT > 0) {
      this.comboT = Math.max(0, this.comboT - dt);
      if (this.comboT <= 0) this.combo = 0;
    }
    for (var i = 0; i < this.floaters.length; i++) {
      var f = this.floaters[i];
      if (f.t <= 0) continue;
      f.t -= dt;
      f.age += dt;
      var fp = clamp(f.age / f.life, 0, 1);
      f.y = f.baseY - 30 * easeOutBack(fp);
      if (f.t <= 0) f.text.setVisible(false);
    }
  };

  PlayScene.prototype.chipStep = function (dt) {
    if (this.tutorialT > 0) return;
    if (this.chipT > 0) {
      this.chipT = Math.max(0, this.chipT - dt);
      if (this.chipT <= 0) {
        this.chipBg.setVisible(false);
        this.chipIcon.setVisible(false);
        this.chipText.setVisible(false);
      }
      return;
    }
    if (!this.chipQueue.length) return;
    var c = this.chipQueue.shift();
    this.chipHold = 0.95;
    this.chipT = this.chipHold;
    this.chipIcon.setTexture('atlas', c.frame).setVisible(true);
    setTintIfChanged(this.chipIcon, c.tint);
    setTextIfChanged(this.chipText, c.text);
    this.chipText.setVisible(true);
    this.chipBg.setVisible(true);
  };

  PlayScene.prototype.floater = function (x, y, text) {
    for (var i = 0; i < this.floaters.length; i++) {
      var f = this.floaters[i];
      if (f.t > 0) continue;
      f.t = f.life; f.age = 0; f.x = x; f.y = y; f.baseY = y;
      setTextIfChanged(f.text, text);
      f.text.setVisible(true);
      return;
    }
  };

  // --------------------------------------------------------------- render
  PlayScene.prototype.render = function (dt) {
    var i, o;
    var c = D.creature(this.activeId);
    var p = this.player;

    for (i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.active) continue;
      e.sprite.setPosition(e.x, e.y);
      var s = (e.def.key === 'brood' ? 1.0 : 1.0) *
        (1 + Math.sin(e.pulse) * 0.02 + (e.flash > 0 ? 0.12 : 0) +
          (e.warningT > 0 ? Math.sin(e.warningT * 22) * 0.06 : 0));
      e.sprite.setScale(s);
      setTintIfChanged(e.sprite, e.flash > 0 ? 0xffffff :
        (e.warningT > 0 ? 0xff6f86 : (e.hp < e.maxHp ? 0xffc9b8 : 0xffffff)));
      e.sprite.setAlpha(e.flash > 0 ? 1 : 0.98);
      var wounded = e.maxHp > 1 && e.hp < e.maxHp;
      setVisibleIfChanged(e.pip, wounded);
      if (wounded) {
        var pw = e.r * 1.6;
        e.pip.setPosition(e.x - pw / 2, e.y + e.r + 6)
          .setDisplaySize(Math.max(2, pw * (e.hp / e.maxHp)), 3);
        setTintIfChanged(e.pip, e.hp / e.maxHp > 0.5 ? 0xffd166 : 0xff6b7f);
      }
    }
    // A lethal hit owns its sprite for a short, pooled collapse stage. The
    // first tenth is a white flash, then the body folds and fades while the
    // impact particle burst supplies the debris pass.
    for (i = 0; i < this.enemies.length; i++) {
      var dead = this.enemies[i];
      if (dead.active || dead.deathT <= 0) continue;
      dead.deathAge += dt;
      dead.deathT = Math.max(0, dead.deathT - dt);
      if (dead.deathT <= 0) {
        dead.sprite.setVisible(false).setPosition(-200, -200);
        continue;
      }
      var dq = clamp(dead.deathAge / 0.48, 0, 1);
      dead.sprite.setVisible(true).setPosition(dead.x, dead.y)
        .setScale(1.08 + dq * 0.16, 1.08 - dq * 0.82)
        .setAlpha(1 - dq * 0.72);
      setTintIfChanged(dead.sprite, dead.deathAge < 0.12 ? 0xffffff : dead.def.color);
    }
    for (i = 0; i < this.barriers.length; i++) {
      var b = this.barriers[i];
      if (!b.active) continue;
      setTintIfChanged(b.sprite, b.flash > 0 ? 0xffffff : 0xbfe4ff);
      b.sprite.setAlpha(b.flash > 0 ? 1 : 0.9);
    }
    for (i = 0; i < this.posts.length; i++) {
      var post = this.posts[i];
      if (!post.active) continue;
      var lit = post.glow > 0;
      post.sprite.setAlpha(lit ? 1 : (post.base ? 0.9 : 0.8));
      post.sprite.setScale((post.base ? 0.86 : 0.7) * (lit ? 1.12 : 1));
      var isSeat = post.base && post.creature === this.activeId;
      setVisibleIfChanged(post.occupant, !(isSeat && true));
    }
    for (i = 0; i < this.shards.length; i++) {
      var sh = this.shards[i];
      if (!sh.active) continue;
      sh.sprite.setPosition(sh.x, sh.y).setRotation(Math.atan2(sh.vy, sh.vx));
    }

    // Player creature: idle / launch / impact states from the authored set.
    var frame = 'cr_' + c.id + (this.impactT > 0 ? '_impact'
      : (p.launched ? '_launch' : '_idle'));
    if (this.playerSprite.frame.name !== frame) {
      this.playerSprite.setTexture('atlas', frame);
    }
    this.playerSprite.setPosition(p.x, p.y);
    var blink = p.iframes > 0 && Math.floor(p.iframes * 22) % 2 === 0;
    setVisibleIfChanged(this.playerSprite, !blink);
    if (p.launched) {
      this.playerSprite.setRotation(Math.atan2(p.vy, p.vx) + Math.PI / 2);
    } else {
      this.playerSprite.setRotation(0);
    }
    this.playerGlow.setPosition(p.x, p.y)
      .setAlpha(0.22 + (p.launched ? 0.2 : 0.1 * (0.5 + 0.5 * Math.sin(this.phaseT * 3))));
    setTintIfChanged(this.playerGlow, c.color);

    if (this.comboRingT > 0 && this.combo >= 3) {
      var f2 = 1 - this.comboRingT / 0.32;
      this.comboRing.setVisible(true).setPosition(p.x, p.y)
        .setScale(0.4 + f2 * 1.5).setAlpha((1 - f2) * 0.75);
      setTintIfChanged(this.comboRing, c.color);
    } else setVisibleIfChanged(this.comboRing, false);

    this.renderAim();
    this.renderHud();

    for (i = 0; i < this.floaters.length; i++) {
      var fl = this.floaters[i];
      if (fl.t <= 0) continue;
      var fp2 = clamp(fl.age / fl.life, 0, 1);
      fl.text.setPosition(fl.x, fl.y)
        .setScale(0.78 + 0.32 * easeOutBack(fp2))
        .setAlpha(clamp(fl.t / 0.35, 0, 1));
    }

    // Transient chip fade.
    if (this.chipT > 0) {
      var a = clamp(this.chipT / 0.25, 0, 1);
      this.chipBg.setAlpha(a * 0.92);
      this.chipIcon.setAlpha(a);
      this.chipText.setAlpha(a);
    }
    // Tutorial strip fade.
    if (this.tutorialT > 0) {
      var ta = clamp(this.tutorialT / 0.9, 0, 1);
      this.tutorial.setAlpha(ta);
      this.tutorialBg.setAlpha(ta * 0.8);
    } else if (this.tutorial.visible) {
      this.tutorial.setVisible(false);
      this.tutorialBg.setVisible(false);
    }
    // Centre banner fade.
    if (this.bannerT > 0) {
      var ba = clamp(this.bannerT / 0.4, 0, 1);
      var grow = REDUCED ? 1 : clamp((this.bannerHold - this.bannerT) / 0.18, 0, 1);
      // setDisplaySize writes scaleX/scaleY, so animating with setScale here
      // would reset the panel to its 4px source width and make it vanish.
      this.bannerBg.setAlpha(ba * 0.95)
        .setDisplaySize(BANNER_W, BANNER_H * (0.6 + grow * 0.4));
      this.bannerTitle.setAlpha(ba);
      this.bannerSub.setAlpha(ba * 0.92);
      this.bannerMedal.setAlpha(ba).setScale(0.9 * (0.7 + grow * 0.3));
      this.bannerBg.setPosition(W / 2, BANNER_Y);
    } else if (this.bannerBg.visible && this.phase !== 'clear' &&
               this.phase !== 'fail' && this.phase !== 'done') {
      this.hideBanner();
    } else if (this.bannerBg.visible) {
      // Boundary reached and the banner has faded: leave the prompt readable
      // at low alpha so "tap to continue" is never a guess.
      this.bannerBg.setAlpha(0.9);
      this.bannerTitle.setAlpha(1);
      this.bannerSub.setAlpha(0.9);
      this.bannerMedal.setAlpha(1);
    }

    this.damageVignette.setAlpha(this.vitalityFlashT > 0
      ? this.vitalityFlashT * 0.35 : 0);
  };

  PlayScene.prototype.renderAim = function () {
    if (this.phase !== 'aim' || this.player.launched) { this.hideAim(); return; }
    var pull = this.pullVector();
    if (!pull && this.kbActive) {
      pull = this.kbScratch;
      pull.dx = Math.cos(this.kbAngle); pull.dy = Math.sin(this.kbAngle);
      pull.power = this.kbPower; pull.len = this.kbPower * T.maxPull;
    }
    if (!pull || pull.power < T.minPower) { this.hideAim(); return; }

    var c = D.creature(this.activeId);
    var speed = T.launchSpeed * (0.36 + pull.power * 0.64);
    // Analytic travel distance for exponential drag: v0 * (1 - r^t) / ln(1/r),
    // taken to the settle horizon. This is what makes the preview honest.
    var total = Math.min(1100, speed / Math.log(1 / T.friction) * 0.92);
    var path = this.predict(this.player.x, this.player.y, pull.dx, pull.dy, total);

    var spacing = total / MAX_TRAJ;
    var used = 0, walked = 0, seg = 0, segPos = 0;
    for (var i = 0; i < MAX_TRAJ; i++) {
      var target = i * spacing;
      while (seg < path.segs.length - 1 && walked + path.segs[seg].len < target) {
        walked += path.segs[seg].len; seg++;
      }
      var s = path.segs[seg];
      if (!s) { setVisibleIfChanged(this.traj[i], false); continue; }
      segPos = clamp(target - walked, 0, s.len);
      var t = this.traj[i];
      t.setVisible(true)
        .setPosition(s.x0 + s.dx * segPos, s.y0 + s.dy * segPos)
        .setAlpha(0.85 * (1 - i / MAX_TRAJ) + 0.1)
        .setScale(0.10 + 0.09 * (1 - i / MAX_TRAJ));
      setTintIfChanged(t, seg === 0 ? c.color : 0xffe27b);
      used++;
    }
    for (var j = used; j < MAX_TRAJ; j++) setVisibleIfChanged(this.traj[j], false);

    // Bank markers at every predicted ricochet: the shot's bank plan is
    // visible BEFORE release, which is the whole point of the mechanic.
    for (var k = 0; k < MAX_MARKS; k++) {
      var bp = path.banks[k];
      if (!bp) { setVisibleIfChanged(this.marks[k], false); continue; }
      var pulse = 0.34 + Math.sin(this.phaseT * 8 + k) * 0.05;
      this.marks[k].setVisible(true).setPosition(bp.x, bp.y)
        .setScale(REDUCED ? 0.34 : pulse)
        .setAlpha(0.9 - k * 0.16);
      setTintIfChanged(this.marks[k], bp.barrier ? 0x9fe8ff : 0xffe27b);
    }

    // Pull band: the drawn-back fang line, thickness tracks power.
    if (this.dragFrom && this.dragCur) {
      var ang = Math.atan2(pull.dy, pull.dx);
      var len = Math.min(T.maxPull, pull.len);
      this.aimBand.setVisible(true)
        .setPosition(this.player.x, this.player.y)
        .setRotation(ang)
        .setDisplaySize(len, 2 + pull.power * 5);
      setTintIfChanged(this.aimBand, c.color);
    } else setVisibleIfChanged(this.aimBand, false);
  };

  // Stepped raycast with reflection off arena walls and live barriers.
  // The segment and bank records are POOLED: this runs every frame the player
  // is aiming, which is most of the game's wall-clock time.
  PlayScene.prototype.predict = function (x, y, dx, dy, total) {
    var segs = this.pathSegs, banks = this.pathBanks;
    segs.length = 0; banks.length = 0;
    var r = this.player.r;
    var stepLen = 7;
    var left = total;
    var cx = x, cy = y;
    var sx = cx, sy = cy;
    var guard = 0;
    while (left > 0 && guard++ < 260 && segs.length < 6) {
      var nx = cx + dx * stepLen;
      var ny = cy + dy * stepLen;
      var hit = null;
      var HR = this.hitScratch;
      if (nx - r < A.left) { HR.ax = 1; HR.x = A.left + r; HR.y = ny; hit = HR; }
      else if (nx + r > A.right) { HR.ax = 1; HR.x = A.right - r; HR.y = ny; hit = HR; }
      if (!hit) {
        if (ny - r < A.top) { HR.ax = 2; HR.x = nx; HR.y = A.top + r; hit = HR; }
        else if (ny + r > A.bottom) { HR.ax = 2; HR.x = nx; HR.y = A.bottom - r; hit = HR; }
      }
      var barrierHit = false;
      if (!hit) {
        for (var i = 0; i < this.barriers.length; i++) {
          var b = this.barriers[i];
          if (!b.active) continue;
          var qx = clamp(nx, b.x - b.w / 2, b.x + b.w / 2);
          var qy = clamp(ny, b.y - b.h / 2, b.y + b.h / 2);
          var ddx = nx - qx, ddy = ny - qy;
          if (ddx * ddx + ddy * ddy > r * r) continue;
          HR.ax = Math.abs(ddx) > Math.abs(ddy) ? 1 : 2;
          HR.x = nx; HR.y = ny;
          hit = HR;
          barrierHit = true;
          break;
        }
      }
      if (hit) {
        segs.push(this.seg(segs.length, sx, sy, hit.x, hit.y));
        if (banks.length < MAX_MARKS) {
          var bk = this.bankPool[banks.length];
          bk.x = hit.x; bk.y = hit.y; bk.barrier = barrierHit;
          banks.push(bk);
        }
        if (hit.ax === 1) dx = -dx; else dy = -dy;
        cx = hit.x + dx * 2; cy = hit.y + dy * 2;
        sx = cx; sy = cy;
      } else {
        cx = nx; cy = ny;
      }
      left -= stepLen;
    }
    segs.push(this.seg(segs.length, sx, sy, cx, cy));
    this.path.segs = segs;
    this.path.banks = banks;
    return this.path;
  };

  PlayScene.prototype.seg = function (i, x0, y0, x1, y1) {
    var s = this.segPool[i] ||
      (this.segPool[i] = { x0: 0, y0: 0, dx: 0, dy: 0, len: 0 });
    var dx = x1 - x0, dy = y1 - y0;
    var len = Math.hypot(dx, dy) || 0.0001;
    s.x0 = x0; s.y0 = y0; s.dx = dx / len; s.dy = dy / len; s.len = len;
    return s;
  };

  PlayScene.prototype.renderHud = function () {
    var vit = clamp(this.runVitality / T.maxVitality, 0, 1);
    this.vitalFill.setDisplaySize(Math.max(1, 110 * vit), 9);
    setTintIfChanged(this.vitalFill,
      vit > 0.5 ? 0x4be08a : vit > 0.25 ? 0xffd166 : 0xff6b7f);
    setTextIfChanged(this.vitalText, String(Math.round(this.runVitality)));

    var showCombo = this.combo >= 2;
    setVisibleIfChanged(this.comboIcon, showCombo);
    setVisibleIfChanged(this.comboText, showCombo);
    if (showCombo) setTextIfChanged(this.comboText, 'x' + this.combo);

    setTextIfChanged(this.shotText, String(this.shotsUsed) + '/' + this.form.par);
    setTintIfChanged(this.shotText, this.shotsUsed <= this.form.par ? 0xbfe4ff : 0xff9aa8);
    var showFree = this.freeShots > 0;
    setVisibleIfChanged(this.freeIcon, showFree);
    setVisibleIfChanged(this.freeText, showFree);
    if (showFree) setTextIfChanged(this.freeText, String(this.freeShots));
  };

  // ------------------------------------------------------------ hook + api
  PlayScene.prototype.syncHook = function () {
    HOOK.ready = true;
    HOOK.mode = this.phase === 'aim' || this.phase === 'flight'
      ? (this.mode === 'rush' ? 'rush' : 'play') : this.phase;
    HOOK.formation = this.formationIndex;
    HOOK.formationId = this.form ? this.form.id : '';
    HOOK.formationName = this.form ? this.form.name : '';
    HOOK.setId = this.form ? this.form.set : '';
    HOOK.roster = this.unlockedIds ? this.unlockedIds.slice() : [];
    HOOK.team = this.team ? this.team.slice() : [];
    HOOK.active = this.activeId;
    HOOK.vitality = Math.round(this.runVitality);
    HOOK.combo = this.combo;
    HOOK.bestCombo = this.bestCombo;
    HOOK.shots = this.shotsUsed;
    HOOK.freeShots = this.freeShots;
    HOOK.score = this.score;
    HOOK.enemiesLeft = this.enemiesLeft();
    HOOK.barriersLeft = this.barriersLeft();
    HOOK.launched = this.player.launched;
    HOOK.banked = this.player.wallBanks > 0;
    HOOK.medals = SAVE.medals;
    HOOK.maxCleared = SAVE.maxCleared;
  };

  PlayScene.prototype.forceFormation = function (n) {
    var total = this.mode === 'rush' ? D.RUSH.length : D.FORMATIONS.length;
    this.hideBanner();
    this.phase = 'aim';
    this.runVitality = T.startVitality;
    this.syncTeam();
    this.loadFormation(clamp(n | 0, 0, total - 1));
  };

  PlayScene.prototype.forceRoster = function (id) {
    var c = D.creature(id);
    // Test switches must not be gated behind progression. syncTeam() rebuilds
    // the unlocked list from the save, so the override has to survive it:
    // forceUnlock is consulted there rather than patched around afterwards.
    this.forceUnlock = c.id;
    this.activeId = c.id;
    this.syncTeam();
    this.reseatBasePosts();
    this.resetPlayer();
    this.refreshDock();
    this.syncHook();
  };

  PlayScene.prototype.forceMode = function (m) {
    this.scene.start('Play', { mode: m === 'rush' ? 'rush' : 'campaign', formation: 0 });
  };

  PlayScene.prototype.setFrozen = function (v) {
    this.frozen = !!v;
    if (v) { this.dragId = null; this.dragFrom = null; this.prevIds.clear(); this.curIds.clear(); }
    this.acc = 0;
  };

  PlayScene.prototype.restartFormation = function () {
    this.score = this.formationStartScore;
    this.runVitality = T.startVitality;
    this.hideBanner();
    this.phase = 'aim';
    this.loadFormation(this.formationIndex);
  };

  // ------------------------------------------------------------------ boot
  var config = {
    type: Phaser.AUTO,
    // parent:null SKIPS mounting the canvas and the game runs invisibly.
    parent: document.body,
    width: W,
    height: H,
    backgroundColor: '#080d15',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: W,
      height: H
    },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
    banner: false,
    scene: [BootScene, MenuScene, PlayScene]
  };
  config.scale.width = Math.round(W * RETINA_FACTOR);
  config.scale.height = Math.round(H * RETINA_FACTOR);
  config.width = config.scale.width;
  config.height = config.scale.height;
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
  var game = new Phaser.Game(config);
  window.__sfGame = game;
})();
