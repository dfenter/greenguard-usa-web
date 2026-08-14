/* Chroma Tap - view layer: Phaser 3 scenes, HUD, animation, verification hook.
 *
 * House rules honoured here, each one a shipped defect elsewhere in the fleet:
 *  - no Graphics object lives in the display list; all chrome is baked (ct_art)
 *  - render state lives in this.view, never on a simulation cell
 *  - pools are preallocated and shared with the debug/telegraph views
 *  - the verification hook is readable from the boot fallback AND the live scene
 *  - scene classes extend Phaser.Scene, so custom methods always exist
 *  - Phaser emits 'prerender'/'render', never 'postrender'
 *  - Container.add() returns the container: child references come from the
 *    factory call, never from add()
 *  - game config uses parent: document.body, never parent: null
 */
(function (g) {
  'use strict';

  var D = g.CTData, Sim = g.CTSim, Art = g.CTArt;
  var T = D.TOKENS;

  var W = 390, H = 800;
  var CELL = 50, PAD = 10;
  var COLS = D.COLS, ROWS = D.ROWS;
  var BOARD_W = COLS * CELL + PAD * 2;
  var BOARD_H = ROWS * CELL + PAD * 2;
  var BOARD_X = Math.round((W - BOARD_W) / 2);
  var BOARD_Y = 164;
  var CHIP_Y = 656;
  var TILE_SCALE = CELL / Art.S;
  var FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  var kit = null;
  var save = null;

  /* ------------------------------------------------------------------ helpers */
  function setT(obj, str) { if (obj && obj.text !== str) obj.setText(str); }
  function setC(obj, color) { if (obj && obj.__c !== color) { obj.__c = color; obj.setColor(color); } }
  function setTint(obj, tint) { if (obj && obj.__t !== tint) { obj.__t = tint; obj.setTint(tint); } }
  function hex(s) { return parseInt(String(s).replace('#', ''), 16); }
  function mixColor(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return ((Math.round(ar + (br - ar) * t) << 16) |
      (Math.round(ag + (bg - ag) * t) << 8) |
      Math.round(ab + (bb - ab) * t)) >>> 0;
  }
  function bx(x) { return BOARD_X + PAD + x * CELL + CELL / 2; }
  function by(y) { return BOARD_Y + PAD + y * CELL + CELL / 2; }

  function texFor(cell, def) {
    if (!cell) return 'tile0';
    if (cell.k === 'crate') {
      var maxHp = (def && def.crateHp) || 1;
      var stage = Math.min(2, Math.max(0, maxHp - cell.hp));
      return 'crate' + stage;
    }
    if (cell.k === 'balloon') return 'balloon';
    if (cell.k === 'gear') return 'gear';
    var c = cell.c | 0;
    if (cell.sp === Sim.SP_ROCKET) return (cell.rot ? 'sp1v' : 'sp1h') + c;
    if (cell.sp === Sim.SP_BOMB) return 'sp2' + c;
    if (cell.sp === Sim.SP_ORB) return 'sp3';
    return 'tile' + c;
  }
  function famTint(cell) {
    if (!cell || cell.k !== 'tile') return 0xffffff;
    return hex(D.family(cell.c).face);
  }

  /* Rounded panel from the single baked 'panel' texture. */
  /* Nine-sliced card: constant corner radius at any size. */
  function panel(scene, x, y, w, h, color, alpha) {
    var s = Math.max(4, Math.min(16, Math.floor(Math.min(w, h) / 2) - 1));
    var img = scene.add.nineslice(x, y, 'panel', undefined, w, h, s, s, s, s);
    img.setTint(color == null ? hex(T.board) : color);
    img.setAlpha(alpha == null ? 1 : alpha);
    return img;
  }
  function label(scene, x, y, str, size, color, weight, origin) {
    var t = scene.add.text(x, y, str, {
      fontFamily: FONT, fontSize: size + 'px', color: color || T.highlight,
      fontStyle: weight || '700'
    });
    t.setOrigin(origin == null ? 0.5 : origin, 0.5);
    t.__c = color || T.highlight;
    return t;
  }

  /* ------------------------------------------------------------------ verification hook
   * Created at parse time so a probe that lands before boot still finds it
   * (defect class: test switches readable only from the live scene).
   */
  var hook = g.__ct || {};
  hook.ready = false;
  hook.mode = 'boot';
  hook.level = 1;
  hook.pending = hook.pending || {};
  hook.state = {
    mode: 'boot', level: 1, moves: 0, board: null, goals: [],
    medal: 'none', pack: 'crate-yard', score: 0, over: 0
  };
  function enterPlay(level, mode) {
    if (hook._scene && hook._scene.startLevel) { hook._scene.startLevel(level, mode); return true; }
    if (g.__ctGame && g.__ctGame.scene) {
      try { g.__ctGame.scene.start('Play', { level: level, mode: mode }); return true; } catch (e) { /* pre-boot */ }
    }
    return false;   /* queued in hook.pending; applied when Play boots */
  }
  hook.forceLevel = function (n) {
    hook.pending.level = n | 0;
    return enterPlay(n | 0, 'campaign');
  };
  hook.forceDaily = function () {
    hook.pending.daily = 1;
    return enterPlay(0, 'daily');
  };
  hook.forceBoard = function (spec) {
    hook.pending.board = spec || null;
    if (hook._scene && hook._scene.applyForcedBoard) hook._scene.applyForcedBoard(spec || null);
    return true;
  };
  hook.tap = function (x, y) {
    if (hook._scene && hook._scene.tryTap) return hook._scene.tryTap(x | 0, y | 0, true);
    return false;
  };
  hook.hint = function () {
    if (hook._scene && hook._scene.doHint) { hook._scene.doHint(); return true; }
    return false;
  };
  g.__ct = hook;

  function publish(scene) {
    var b = scene && scene.board ? scene.board : null;
    hook.state = {
      mode: scene ? scene.mode : 'boot',
      level: scene ? scene.levelNo : 0,
      pack: b ? b.pack.key : 'crate-yard',
      moves: b ? b.movesLeft : 0,
      board: b ? b.snapshot() : null,
      goals: b ? b.goalList() : [],
      medal: b ? b.medal : 'none',
      score: b ? b.score : 0,
      over: b ? b.over : 0,
      busy: scene ? !!scene.busy : false,
      save: save ? { unlocked: save.unlocked, points: save.totalPoints, medals: save.medals, daily: save.daily } : null
    };
    hook.mode = hook.state.mode;
    hook.level = hook.state.level;
    hook.ready = true;
  }

  /* ================================================================== BootScene */
  function BootScene() { Phaser.Scene.call(this, { key: 'Boot' }); }
  BootScene.prototype = Object.create(Phaser.Scene.prototype);
  BootScene.prototype.constructor = BootScene;

  BootScene.prototype.create = function () {
    kit.loader.show('Chroma Tap');
    kit.loader.progress(0.15);
    Art.bakeAll(this);
    kit.loader.progress(0.55);

    var sfx = Art.sfxSources();
    var mus = Art.musicSources();
    var map = {}, k;
    for (k in sfx) if (Object.prototype.hasOwnProperty.call(sfx, k)) map[k] = sfx[k];
    for (k in mus) if (Object.prototype.hasOwnProperty.call(mus, k)) map[k] = mus[k];
    kit.audio.register(map);
    kit.loader.progress(0.8);

    var self = this;
    var done = false;
    function go() {
      if (done) return;
      done = true;
      kit.loader.progress(1);
      kit.loader.hide();
      self.scene.start('Menu');
    }
    kit.audio.preload(['tap', 'ui', 'cascade']).then(go, go);
    this.time.delayedCall(1500, go);
  };

  /* ================================================================== MenuScene */
  function MenuScene() { Phaser.Scene.call(this, { key: 'Menu' }); }
  MenuScene.prototype = Object.create(Phaser.Scene.prototype);
  MenuScene.prototype.constructor = MenuScene;

  MenuScene.prototype.create = function () {
    var self = this;
    this.cameras.main.setBackgroundColor(hex('#131c33'));
    kit.audio.music('m_menu', 600);

    /* Decorative tile arch: the menu is allowed to breathe (UI_LAW rule 6). */
    var i;
    for (i = 0; i < 6; i++) {
      var im = this.add.image(60 + i * 54, 154 + Math.sin(i * 0.9) * 10, 'tile' + i);
      im.setScale(TILE_SCALE * 0.92);
      im.setAngle(-8 + i * 3);
      im.setAlpha(0.95);
    }

    label(this, W / 2, 68, 'CHROMA TAP', 34, T.highlight, '800');
    label(this, W / 2, 98, 'Tap a group. Collapse the board.', 15, '#9fb2d8', '600');

    var nextLevel = Math.min(D.MAXLV, save.unlocked || 1);
    this.bigButton(W / 2, 232, 'Play level ' + nextLevel, hex('#5BCB77'), T.ink, function () {
      self.go(nextLevel, 'campaign');
    });

    var dailyKey = D.dayKey();
    var dailyDone = save.daily && save.daily.key === dailyKey && save.daily.cleared;
    this.bigButton(W / 2, 306, dailyDone ? 'Daily Blast cleared' : 'Daily Blast', hex('#F7C948'), T.ink, function () {
      self.go(0, 'daily');
    });

    this.bigButton(W / 2, 380, 'Levels', hex('#38A8DE'), T.ink, function () {
      kit.audio.sfx('ui');
      self.scene.start('Levels');
    });

    this.bigButton(W / 2, 454, 'Settings', hex('#3b4c73'), T.highlight, function () {
      kit.audio.sfx('ui');
      kit.openSettings();
    });

    /* Progress line: icons and numbers, no prose. */
    var pts = save.totalPoints | 0;
    panel(this, W / 2, 540, 300, 56, hex('#1b2542'), 1);
    var mx = W / 2 - 108;
    var counts = { bronze: 0, silver: 0, gold: 0 }, kk;
    for (kk in save.medals) if (Object.prototype.hasOwnProperty.call(save.medals, kk)) {
      if (counts[save.medals[kk]] != null) counts[save.medals[kk]]++;
    }
    var order = ['gold', 'silver', 'bronze'];
    for (i = 0; i < 3; i++) {
      var mi = this.add.image(mx + i * 78, 540, 'medal_' + order[i]);
      mi.setDisplaySize(30, 30);
      label(this, mx + i * 78 + 24, 540, String(counts[order[i]] || 0), 17, T.highlight, '700');
    }
    label(this, W / 2 + 118, 540, pts + 'p', 16, '#F3BC50', '700');

    var st = (save.daily && save.daily.streak) | 0;
    label(this, W / 2, 596, st > 0 ? ('Daily streak ' + st) : 'No daily streak yet', 14, '#8fa3c9', '600');

    label(this, W / 2, 700, 'No lives. Nothing to buy.', 13, '#6d7fa5', '600');
    publish(null);
  };

  MenuScene.prototype.bigButton = function (x, y, text, color, textColor, fn) {
    var p = panel(this, x, y, 268, 56, color, 1);
    var t = label(this, x, y, text, 19, textColor, '800');
    p.setInteractive({ useHandCursor: true });
    p.on('pointerdown', function () { p.setAlpha(0.82); t.setScale(0.97); });
    p.on('pointerup', function () { p.setAlpha(1); t.setScale(1); fn(); });
    p.on('pointerout', function () { p.setAlpha(1); t.setScale(1); });
    return p;
  };

  MenuScene.prototype.go = function (n, mode) {
    kit.audio.sfx('ui');
    this.scene.start('Play', { level: n, mode: mode });
  };

  /* ================================================================== LevelsScene */
  function LevelsScene() { Phaser.Scene.call(this, { key: 'Levels' }); }
  LevelsScene.prototype = Object.create(Phaser.Scene.prototype);
  LevelsScene.prototype.constructor = LevelsScene;

  LevelsScene.prototype.create = function () {
    var self = this;
    this.cameras.main.setBackgroundColor(hex('#131c33'));
    this.packIdx = 0;
    for (var i = D.PACKS.length - 1; i >= 0; i--) {
      if (D.packUnlocked(D.PACKS[i], save)) { this.packIdx = i; break; }
    }
    this.build();

    var backHit = panel(this, 62, 40, 108, 48, hex('#22304f'), 0.9);
    var back = this.add.image(34, 40, 'ic_grid');
    back.setDisplaySize(24, 24);
    label(this, 56, 40, 'Menu', 16, '#cfe0ff', '700', 0);
    backHit.setInteractive({ useHandCursor: true });
    backHit.on('pointerup', function () { kit.audio.sfx('ui'); self.scene.start('Menu'); });
  };

  LevelsScene.prototype.build = function () {
    var self = this;
    if (this.body) this.body.destroy(true);
    var body = this.add.container(0, 0);
    this.body = body;

    var pk = D.PACKS[this.packIdx] || D.PACKS[0];
    var open = D.packUnlocked(pk, save);
    var i;

    /* pack tabs */
    for (i = 0; i < D.PACKS.length; i++) {
      var p = D.PACKS[i];
      var on = i === this.packIdx;
      var tab = panel(this, 54 + i * 94, 92, 88, 44, on ? hex(p.frameEdge) : hex('#243453'), 1);
      var tt = label(this, 54 + i * 94, 92, p.short, 15, on ? T.ink : '#9fb2d8', '800');
      body.add(tab); body.add(tt);
      if (!D.packUnlocked(p, save)) {
        var lk = this.add.image(54 + i * 94 + 30, 78, 'lock');
        lk.setDisplaySize(16, 16);
        body.add(lk);
      }
      tab.setInteractive({ useHandCursor: true });
      (function (idx) {
        tab.on('pointerup', function () { kit.audio.sfx('ui'); self.packIdx = idx; self.build(); });
      })(i);
    }

    var head = label(this, W / 2, 142, pk.name, 24, T.highlight, '800');
    var sub = label(this, W / 2, 168, open ? pk.blurb : ('Locked: needs ' + pk.unlockPoints + ' medal points'), 14, open ? '#9fb2d8' : '#e08a8a', '600');
    body.add(head); body.add(sub);

    var levels = D.packLevels(pk.key);
    for (i = 0; i < levels.length; i++) {
      var def = levels[i];
      var col = i % 3, row = Math.floor(i / 3);
      var x = 79 + col * 116, y = 232 + row * 108;
      var unlocked = D.levelUnlocked(def.n, save);
      var medal = save.medals[String(def.n)] || 'none';
      var card = panel(this, x, y, 100, 92, unlocked ? hex(pk.frame) : hex('#222c46'), 1);
      body.add(card);
      var num = label(this, x, y - 16, String(def.n), 27, unlocked ? T.highlight : '#5c6b8c', '800');
      body.add(num);
      var mimg = this.add.image(x, y + 24, 'medal_' + medal);
      mimg.setDisplaySize(26, 26);
      body.add(mimg);
      if (!unlocked) {
        var lk2 = this.add.image(x + 32, y - 28, 'lock');
        lk2.setDisplaySize(18, 18);
        body.add(lk2);
      }
      if (unlocked) {
        card.setInteractive({ useHandCursor: true });
        (function (n) {
          card.on('pointerup', function () {
            kit.audio.sfx('ui');
            self.scene.start('Play', { level: n, mode: 'campaign' });
          });
        })(def.n);
      }
    }

    var ptsLine = label(this, W / 2, 640, (save.totalPoints | 0) + (save.totalPoints===1?' medal point banked':' medal points banked'), 15, '#F3BC50', '700');
    body.add(ptsLine);
    publish(null);
  };

  /* ================================================================== RestoreScene
   * A small authored meta loop receives the board-clear token. Each choice is
   * persisted immediately, so the restored place survives a reload. */
  function RestoreScene() { Phaser.Scene.call(this, { key: 'Restore' }); }
  RestoreScene.prototype = Object.create(Phaser.Scene.prototype);
  RestoreScene.prototype.constructor = RestoreScene;

  RestoreScene.prototype.init = function (data) {
    this.result = data || {};
  };

  RestoreScene.prototype.create = function () {
    var self = this;
    this.cameras.main.setBackgroundColor(hex('#131c33'));
    kit.audio.music('m_menu', 500);
    if (!save.meta) save.meta = D.emptySave().meta;
    if (this.result.medal && this.result.reward !== false) {
      save.meta.tokens = Math.min(9999, (save.meta.tokens | 0) + 1);
      this.result.reward = false;
      kit.save.set(save);
    }
    label(this, W / 2, 64, 'RESTORE THE COURTYARD', 27, T.highlight, '800');
    label(this, W / 2, 98, 'Your clear earned a restoration token.', 15, '#9fb2d8', '600');
    this.status = label(this, W / 2, 146, '', 14, '#F3BC50', '700');
    this.body = this.add.container(0, 0);
    this.renderStep();
    publish(null);
    this.events.on('shutdown', function () { if (hook._scene === self) hook._scene = null; });
  };

  RestoreScene.prototype.renderStep = function () {
    var self = this, choices = save.meta.choices, steps = [
      { key: 'canopy', title: 'Step 1 of 3: choose a canopy', options: [
        ['leaf-canopy', 'Leaf canopy'], ['cloth-canopy', 'Cloth canopy']
      ]},
      { key: 'water', title: 'Step 2 of 3: choose a waterway', options: [
        ['stone-channel', 'Stone channel'], ['rain-garden', 'Rain garden']
      ]},
      { key: 'light', title: 'Step 3 of 3: choose a light', options: [
        ['warm-lantern', 'Warm lantern'], ['sun-mirror', 'Sun mirror']
      ]}
    ];
    this.body.removeAll(true);
    var step = null, i;
    for (i = 0; i < steps.length; i++) if (!choices[steps[i].key]) { step = steps[i]; break; }
    if (!step) {
      save.meta.restored = 1;
      kit.save.set(save);
      setT(this.status, 'Courtyard restored. Token spent: ' + String(save.meta.tokens));
      var done = panel(this, W / 2, 330, 250, 56, hex('#5BCB77'), 1);
      var doneText = label(this, W / 2, 330, 'Back to levels', 18, T.ink, '800');
      this.body.add(done); this.body.add(doneText);
      done.setInteractive({ useHandCursor: true });
      done.on('pointerup', function () { kit.audio.sfx('ui'); self.scene.start('Levels'); });
      if (this.result.level && this.result.level < D.MAXLV) {
        var next = panel(this, W / 2, 410, 250, 56, hex('#3b4c73'), 1);
        var nextText = label(this, W / 2, 410, 'Next level', 18, T.highlight, '800');
        this.body.add(next); this.body.add(nextText);
        next.setInteractive({ useHandCursor: true });
        next.on('pointerup', function () {
          kit.audio.sfx('ui');
          self.scene.start('Play', { level: self.result.level + 1, mode: 'campaign' });
        });
      }
      return;
    }
    setT(this.status, step.title);
    for (i = 0; i < step.options.length; i++) {
      var y = 280 + i * 82, p = panel(this, W / 2, y, 254, 56, hex('#3b4c73'), 1);
      var t = label(this, W / 2, y, step.options[i][1], 17, T.highlight, '800');
      this.body.add(p); this.body.add(t);
      (function (key, pp) {
        pp.setInteractive({ useHandCursor: true });
        pp.on('pointerup', function () {
          choices[step.key] = key;
          save.meta.restored = 0;
          kit.save.set(save);
          kit.audio.sfx('ui');
          self.renderStep();
        });
      })(step.options[i][0], p);
    }
    var skip = label(this, W / 2, 548, 'Choices are saved after each step.', 13, '#7890b9', '600');
    this.body.add(skip);
  };

  /* ================================================================== PlayScene */
  function PlayScene() { Phaser.Scene.call(this, { key: 'Play' }); }
  PlayScene.prototype = Object.create(Phaser.Scene.prototype);
  PlayScene.prototype.constructor = PlayScene;

  PlayScene.prototype.init = function (data) {
    this.levelNo = (data && data.level) || 1;
    this.mode = (data && data.mode) || 'campaign';
    if (hook.pending.level) { this.levelNo = hook.pending.level; hook.pending.level = 0; }
    if (hook.pending.daily) { this.mode = 'daily'; hook.pending.daily = 0; }
  };

  PlayScene.prototype.create = function () {
    var self = this;
    this.cameras.main.setBackgroundColor(hex('#101728'));
    this.busy = false;
    this.timers = [];
    this.chipQueue = [];
    this.chipBusy = false;
    this.view = {};            // cell id -> sprite. Render state NEVER on a cell.
    this.selCell = null;
    this.pointerClaims = {};
    this.cursor = { x: 3, y: 6 };
    this.selectorState = 'ready';

    this.layer = this.add.container(0, 0);       // board container (shake target)
    this.fxLayer = this.add.container(0, 0);
    this.uiLayer = this.add.container(0, 0);

    this.buildPools();
    this.buildHud();
    this.startLevel(this.levelNo, this.mode);

    /* Phaser only adapts canvas coordinates into the GGKit pointer records.
       Gameplay never trusts an engine pointer without a kit identity. */
    this.input.on('pointerdown', function (p) { self.pointerAdapter('down', p); });
    this.input.on('pointermove', function (p) { self.pointerAdapter('move', p); });
    this.input.on('pointerup', function (p) { self.pointerAdapter('up', p); });
    this.input.on('pointercancel', function (p) { self.pointerAdapter('cancel', p); });

    this.keyTimer = 0;
    hook._scene = this;
    this.events.on('shutdown', function () { if (hook._scene === self) hook._scene = null; });
  };

  /* ---------------------------------------------------------------- pools */
  PlayScene.prototype.buildPools = function () {
    var i, s;
    this.boardImg = this.add.image(BOARD_X, BOARD_Y, 'panel');
    this.boardImg.setOrigin(0, 0);
    this.boardImg.setDisplaySize(BOARD_W, BOARD_H);
    this.layer.add(this.boardImg);

    /* Everything that lives inside the cell field goes in a masked sub-layer:
       refill tiles fall in from above the board and would otherwise be drawn
       over the HUD, and a shaped pack would show them inside its holes. The
       mask Graphics is never added to the display list, and it is redrawn once
       per level, not per frame. */
    this.tileLayer = this.add.container(0, 0);
    this.layer.add(this.tileLayer);
    this.maskG = this.make.graphics({ x: 0, y: 0, add: false });
    this.tileLayer.setMask(this.maskG.createGeometryMask());

    /* tile pool: every cell plus a refill margin, preallocated once */
    this.tilePool = [];
    for (i = 0; i < COLS * ROWS + 24; i++) {
      s = this.add.image(-200, -200, 'tile0');
      s.setScale(TILE_SCALE);
      s.setVisible(false);
      this.tileLayer.add(s);
      this.tilePool.push(s);
    }

    /* highlight + telegraph pool, shared by play and by the debug/telegraph
       view, never a second allocation path */
    this.markPool = [];
    for (i = 0; i < COLS * ROWS; i++) {
      s = this.add.image(-200, -200, 'tcell');
      s.setScale(TILE_SCALE);
      s.setVisible(false);
      this.tileLayer.add(s);
      this.markPool.push(s);
    }
    this.markUsed = 0;

    /* selector ring: the player entity (Ready / Preview / Resolve states) */
    this.selector = this.add.image(-200, -200, 'ring');
    this.selector.setScale(TILE_SCALE);
    this.selector.setVisible(false);
    this.tileLayer.add(this.selector);

    /* Three independent, capped pools. A crowded fragment burst cannot
       consume the streak or reward budget. */
    this.parts = [];
    this.partPools = {};
    var poolDefs = [{ name: 'match', count: 24, tex: 'p_frag' },
      { name: 'cascade', count: 24, tex: 'p_frag' },
      { name: 'chain', count: 16, tex: 'p_spark' }];
    for (var pi = 0; pi < poolDefs.length; pi++) {
      var pd = poolDefs[pi], pool = { items: [], at: 0 };
      this.partPools[pd.name] = pool;
      for (i = 0; i < pd.count; i++) {
        s = this.add.image(-200, -200, pd.tex);
        s.setVisible(false);
        this.fxLayer.add(s);
        var part = { s: s, life: 0, max: 1, vx: 0, vy: 0, gv: 0, rot: 0, sc: 1, fade: 1, pool: pd.name };
        pool.items.push(part);
        this.parts.push(part);
      }
    }

    /* next-spawn dock sprites: 7 columns x 2 previews */
    this.dock = [];
    for (i = 0; i < COLS * 2; i++) {
      s = this.add.image(-200, -200, 'tile0');
      s.setScale(TILE_SCALE * 0.42);
      s.setVisible(false);
      this.uiLayer.add(s);
      this.dock.push(s);
    }
  };

  /* ---------------------------------------------------------------- HUD */
  PlayScene.prototype.buildHud = function () {
    var self = this;
    var u = this.uiLayer;

    /* top cluster: level chip | moves meter | controls. One compact line. */
    this.lvlChip = panel(this, 44, 30, 60, 40, hex('#2c3d63'), 1);
    this.lvlText = label(this, 44, 30, '1', 20, T.highlight, '800');
    u.add(this.lvlChip); u.add(this.lvlText);

    this.movePanel = panel(this, W / 2, 30, 116, 44, hex('#1c2745'), 1);
    this.moveIcon = this.add.image(W / 2 - 34, 30, 'ic_moves');
    this.moveIcon.setDisplaySize(22, 22);
    this.moveText = label(this, W / 2 + 12, 30, '00', 25, T.highlight, '800');
    this.rescueText = label(this, W / 2, 52, 'Rescues 0', 12, '#9fb2d8', '700');
    u.add(this.movePanel); u.add(this.moveIcon); u.add(this.moveText); u.add(this.rescueText);

    this.pauseBtn = this.iconButton(W - 34, 30, 'ic_pause', function () { self.openPause(); });
    this.hintBtn = this.iconButton(W - 96, 30, 'ic_hint', function () { self.doHint(); });

    /* goal chips */
    this.goalChips = [];
    for (var i = 0; i < 4; i++) {
      var gx = 56 + i * 84;
      var p = panel(this, gx, 76, 78, 38, hex('#1c2745'), 1);
      var ic = this.add.image(gx - 22, 76, 'crate0');
      ic.setDisplaySize(26, 26);
      var tx = label(this, gx + 12, 76, '0/0', 15, T.highlight, '700');
      var tick = this.add.image(gx + 28, 62, 'p_spark');
      tick.setDisplaySize(14, 14);
      tick.setTint(hex('#5BCB77'));
      tick.setVisible(false);
      u.add(p); u.add(ic); u.add(tx); u.add(tick);
      this.goalChips.push({ p: p, ic: ic, tx: tx, tick: tick, x: gx });
    }

    /* tutorial strip: thin, top edge, one line, fades. Never centred. */
    this.tutPanel = panel(this, W / 2, 112, 356, 30, hex('#0f1830'), 0.92);
    this.tutText = label(this, W / 2, 112, '', 14, '#cfe0ff', '600');
    this.tutPanel.setVisible(false); this.tutText.setVisible(false);
    u.add(this.tutPanel); u.add(this.tutText);

    /* next-spawn dock label-free strip */
    this.dockPanel = panel(this, W / 2, 143, BOARD_W, 34, hex('#18213c'), 1);
    u.add(this.dockPanel);
    /* A Phaser Container renders its children in LIST order, not by depth, so
       the preview tiles have to be lifted above the dock plate explicitly.
       (Depth alone silently hid the whole next-spawn strip.) */
    for (var di = 0; di < this.dock.length; di++) u.bringToTop(this.dock[di]);

    /* score chip under the board (out of the thumb zone) */
    this.scorePanel = panel(this, W / 2, 610, 244, 40, hex('#1c2745'), 1);
    this.scoreIcon = this.add.image(W / 2 - 104, 610, 'ic_score');
    this.scoreIcon.setDisplaySize(20, 20);
    this.scoreText = label(this, W / 2 - 84, 610, '0', 18, T.highlight, '800', 0);
    u.add(this.scorePanel); u.add(this.scoreIcon); u.add(this.scoreText);

    /* combo pip row: shows medal-relevant combo count without words */
    this.comboPips = [];
    for (var c = 0; c < 7; c++) {
      var pip = this.add.image(W / 2 + 34 + c * 12, 610, 'p_spark');
      pip.setDisplaySize(10, 10);
      setTint(pip, hex('#3a4a70'));
      u.add(pip);
      this.comboPips.push(pip);
    }

    /* bottom corner controls, thumb reachable, 56px targets */
    this.restartBtn = this.iconButton(46, 712, 'ic_restart', function () { self.restartLevel(); });
    this.gridBtn = this.iconButton(W - 46, 712, 'ic_grid', function () {
      kit.audio.sfx('ui'); self.scene.start('Levels');
    });

    /* corner chip (single transient element, queued) */
    this.chipPanel = panel(this, W - 92, CHIP_Y, 150, 38, hex('#0f1830'), 0.95);
    this.chipIcon = this.add.image(W - 152, CHIP_Y, 'p_spark');
    this.chipIcon.setDisplaySize(20, 20);
    this.chipText = label(this, W - 134, CHIP_Y, '', 15, T.highlight, '700', 0);
    this.chipPanel.setVisible(false); this.chipIcon.setVisible(false); this.chipText.setVisible(false);
    u.add(this.chipPanel); u.add(this.chipIcon); u.add(this.chipText);

    /* centre banner: run boundaries only */
    this.bannerPanel = panel(this, W / 2, 360, 320, 200, hex('#0d1730'), 0.97);
    this.bannerTitle = label(this, W / 2, 300, '', 28, T.highlight, '800');
    this.bannerSub = label(this, W / 2, 336, '', 16, '#a9bde2', '600');
    this.bannerSub.setWordWrapWidth(280);
    this.bannerSub.setAlign('center');
    this.bannerMedal = this.add.image(W / 2, 388, 'medal_none');
    this.bannerMedal.setDisplaySize(54, 54);
    this.bannerBtns = [];
    this.setBannerVisible(false);
    u.add(this.bannerPanel); u.add(this.bannerTitle); u.add(this.bannerSub); u.add(this.bannerMedal);
  };

  /* 56px control: comfortably past the 44px touch-target floor. */
  PlayScene.prototype.iconButton = function (x, y, tex, fn) {
    var hit = panel(this, x, y, 56, 56, hex('#22304f'), 0.9);
    var ic = this.add.image(x, y, tex);
    ic.setDisplaySize(24, 24);
    this.uiLayer.add(hit); this.uiLayer.add(ic);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerdown', function () { hit.setAlpha(0.6); });
    hit.on('pointerup', function () { hit.setAlpha(0.9); fn(); });
    hit.on('pointerout', function () { hit.setAlpha(0.9); });
    return { hit: hit, ic: ic };
  };

  PlayScene.prototype.setBannerVisible = function (v) {
    this.bannerBlock = !!v;
    this.bannerPanel.setVisible(v);
    this.bannerTitle.setVisible(v);
    this.bannerSub.setVisible(v);
    this.bannerMedal.setVisible(v && !!this.bannerMedalOn);
    for (var i = 0; i < this.bannerBtns.length; i++) {
      this.bannerBtns[i].p.setVisible(v);
      this.bannerBtns[i].t.setVisible(v);
      if (v) this.bannerBtns[i].p.setInteractive({ useHandCursor: true });
      else this.bannerBtns[i].p.disableInteractive();
    }
  };

  /* ---------------------------------------------------------------- level start */
  PlayScene.prototype.startLevel = function (n, mode) {
    var i, opts = arguments[2] || {}, fresh = !!opts.fresh;
    this.clearTimers();
    this.mode = mode || this.mode || 'campaign';
    this.levelNo = this.mode === 'daily' ? 0 : Math.max(1, Math.min(D.MAXLV, n | 0 || 1));
    var def = this.mode === 'daily' ? D.dailyDef(D.dayKey()) : D.level(this.levelNo);
    var forced = false;
    if (hook.pending.board) {
      var spec = hook.pending.board; hook.pending.board = null;
      def = this.mergeSpec(def, spec);
      forced = true;
    }
    this.def = def;
    this.board = new Sim.Board(def);
    this.fxRng = Sim.rng((def.seed | 0) ^ 0x4c7a19);
    var active = save && save.active;
    var canResume = !fresh && !forced && active && active.mode === this.mode &&
      ((this.mode === 'daily' && active.daily === D.dayKey()) ||
      (this.mode === 'campaign' && active.level === this.levelNo));
    if (canResume && !this.board.restoreState(active.state)) canResume = false;
    this.resumed = canResume;
    this.hintCells = null;
    this.busy = false;
    this.goalDone = { crate: 0, balloon: 0, gear: 0, pop: 0 };

    /* Board chrome is baked once per pack shape and never redrawn. */
    var key = 'board_' + this.board.pack.key;
    if (!this.textures.exists(key)) {
      Art.bakeBoard(this, key, this.board.pack, { cols: COLS, rows: ROWS, cell: CELL, pad: PAD });
    }
    this.boardImg.setTexture(key);
    this.boardImg.setTint(0xffffff);
    this.boardImg.setDisplaySize(BOARD_W, BOARD_H);

    /* Field mask follows the pack silhouette: one rect per playable column. */
    this.maskG.clear();
    this.maskG.fillStyle(0xffffff, 1);
    for (i = 0; i < COLS; i++) {
      var top = this.board.colTop[i] || 0;
      this.maskG.fillRect(
        BOARD_X + PAD + i * CELL,
        BOARD_Y + PAD + top * CELL,
        CELL,
        (ROWS - top) * CELL + 6
      );
    }

    /* recycle every sprite, then repopulate */
    for (i = 0; i < this.tilePool.length; i++) { this.tilePool[i].setVisible(false); this.tilePool[i].setPosition(-200, -200); }
    this.tileAt = 0;
    this.view = {};
    this.syncAll();
    this.updateHud(true);
    this.paintDock();

    kit.audio.music('m_board', 700);
    var packName = this.board.pack.name;
    var title = this.mode === 'daily' ? 'Daily Blast' : ('Level ' + this.levelNo);
    this.bannerMedalOn = false;
    this.showBanner(canResume ? 'Resume' : title, packName + '  ' + this.goalSummary(), 1200, null, null);
    this.tutorialFor(this.levelNo);
    this.persistActive();
    publish(this);
  };

  /* forceBoard test switch: merge a partial spec over the authored level. */
  PlayScene.prototype.mergeSpec = function (def, spec) {
    var out = {}, k;
    for (k in def) if (Object.prototype.hasOwnProperty.call(def, k)) out[k] = def[k];
    out.goals = { crate: def.goals.crate, balloon: def.goals.balloon, gear: def.goals.gear, pop: def.goals.pop };
    if (!spec) return out;
    if (typeof spec.seed === 'number') out.seed = spec.seed | 0;
    if (typeof spec.colors === 'number') out.colors = Math.max(3, Math.min(6, spec.colors | 0));
    if (typeof spec.moves === 'number') out.moves = Math.max(1, Math.min(999, spec.moves | 0));
    if (typeof spec.crateHp === 'number') out.crateHp = Math.max(1, Math.min(3, spec.crateHp | 0));
    if (typeof spec.rescue === 'number') out.rescue = Math.max(0, Math.min(9, spec.rescue | 0));
    if (typeof spec.spawnEvery === 'number') out.spawnEvery = Math.max(1, spec.spawnEvery | 0);
    if (spec.pack && D.pack(spec.pack).key === spec.pack) out.pack = spec.pack;
    if (spec.goals && typeof spec.goals === 'object') {
      var gk = ['crate', 'balloon', 'gear', 'pop'];
      for (var i = 0; i < gk.length; i++) {
        if (typeof spec.goals[gk[i]] === 'number') out.goals[gk[i]] = Math.max(0, spec.goals[gk[i]] | 0);
      }
      if (typeof spec.goals.popColor === 'number') out.popColor = Math.max(0, Math.min(5, spec.goals.popColor | 0));
    }
    return out;
  };
  PlayScene.prototype.applyForcedBoard = function (spec) {
    hook.pending.board = spec;
    this.startLevel(this.levelNo || 1, this.mode);
  };

  PlayScene.prototype.persistActive = function () {
    if (!this.board || !save || this.board.over) return;
    save.active = {
      v: 1,
      mode: this.mode === 'daily' ? 'daily' : 'campaign',
      level: this.mode === 'daily' ? 0 : this.levelNo,
      daily: this.mode === 'daily' ? D.dayKey() : '',
      state: this.board.saveState()
    };
    kit.save.set(save);
  };

  PlayScene.prototype.clearActive = function () {
    if (save && save.active) {
      save.active = null;
      kit.save.set(save);
    }
  };

  PlayScene.prototype.goalSummary = function () {
    var gl = this.board.goalList(), parts = [], names = {
      crate: 'crates', balloon: 'balloons', gear: 'gears', pop: 'tiles'
    };
    for (var i = 0; i < gl.length; i++) {
      parts.push(gl[i].need + ' ' + (names[gl[i].k] || 'goals'));
    }
    return parts.join(', ');
  };

  PlayScene.prototype.tutorialFor = function (n) {
    if (this.mode !== 'campaign') return;
    var msg = null;
    if (n === 1) msg = 'Same color, edges only, never corners. Tap 2+.';
    else if (n === 2) msg = 'Five in a group leaves a rocket. Seven a bomb, nine an orb.';
    else if (n === 4) msg = 'Cracked crates need a second hit.';
    else if (n === 8) msg = 'Balloons rise one row every move. Pop them.';
    else if (n === 15) msg = 'Gears sink. Land one on the floor to bank it.';
    else if (n === 22) msg = 'Every hazard at once. Chain specials for the medal.';
    if (!msg) return;
    this.showTutorial(msg);
  };

  PlayScene.prototype.showTutorial = function (msg) {
    var self = this;
    setT(this.tutText, msg);
    this.tutPanel.setVisible(true); this.tutText.setVisible(true);
    this.tutPanel.setAlpha(0.92); this.tutText.setAlpha(1);
    this.tweens.add({
      targets: [this.tutPanel, this.tutText], alpha: 0, delay: 3000, duration: 700,
      onComplete: function () { self.tutPanel.setVisible(false); self.tutText.setVisible(false); }
    });
  };

  /* ---------------------------------------------------------------- sprites */
  PlayScene.prototype.grab = function () {
    for (var i = 0; i < this.tilePool.length; i++) {
      var k = (this.tileAt + i) % this.tilePool.length;
      if (!this.tilePool[k].visible) { this.tileAt = (k + 1) % this.tilePool.length; return this.tilePool[k]; }
    }
    return this.tilePool[0];
  };

  PlayScene.prototype.syncAll = function () {
    var x, y, id, keep = {};
    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
      var c = this.board.at(x, y);
      if (!c) continue;
      keep[c.id] = 1;
      var s = this.view[c.id];
      if (!s) { s = this.grab(); this.view[c.id] = s; }
      s.setTexture(texFor(c, this.def));
      s.setVisible(true);
      s.setAlpha(1);
      s.setScale(TILE_SCALE);
      s.setAngle(0);
      s.clearTint();
      s.__t = null;
      s.setPosition(bx(x), by(y));
      s.setDepth(10);
    }
    for (id in this.view) if (Object.prototype.hasOwnProperty.call(this.view, id)) {
      if (!keep[id]) { this.view[id].setVisible(false); delete this.view[id]; }
    }
  };

  PlayScene.prototype.paintDock = function () {
    var next = this.board.nextSpawns();
    for (var x = 0; x < COLS; x++) {
      var pair = next[x] || [0, 0];
      for (var j = 0; j < 2; j++) {
        var s = this.dock[x * 2 + j];
        if (!s) continue;
        s.setTexture('tile' + (pair[j] | 0));
        s.setVisible(true);
        s.setPosition(bx(x) - 9 + j * 18, 143);
        s.setAlpha(j === 0 ? 1 : 0.55);
        s.setDepth(5);
      }
    }
  };

  /* ---------------------------------------------------------------- HUD paint */
  PlayScene.prototype.updateHud = function (force) {
    var b = this.board;
    setT(this.lvlText, this.mode === 'daily' ? 'D' : String(this.levelNo));
    setTint(this.lvlChip, hex(b.pack.frame));
    setT(this.moveText, String(b.movesLeft));
    setC(this.moveText, b.movesLeft <= 3 ? '#FF9AA2' : T.highlight);
    setT(this.rescueText, 'Rescues ' + String(b.rescuesLeft));
    setT(this.scoreText, String(b.score));

    var gl = b.goalList(), i;
    var iconOf = { crate: 'crate0', balloon: 'balloon', gear: 'gear', pop: null };
    for (i = 0; i < this.goalChips.length; i++) {
      var ch = this.goalChips[i];
      if (i >= gl.length) {
        ch.p.setVisible(false); ch.ic.setVisible(false); ch.tx.setVisible(false); ch.tick.setVisible(false);
        continue;
      }
      var gg = gl[i];
      ch.p.setVisible(true); ch.ic.setVisible(true); ch.tx.setVisible(true);
      var tex = iconOf[gg.k] || ('tile' + (gg.c | 0));
      if (ch.ic.texture.key !== tex) ch.ic.setTexture(tex);
      ch.ic.setDisplaySize(26, 26);
      var full = gg.have >= gg.need;
      setT(ch.tx, full ? String(gg.need) : (gg.have + '/' + gg.need));
      setC(ch.tx, full ? '#5BCB77' : T.highlight);
      ch.tick.setVisible(full);
      setTint(ch.p, full ? hex('#1d3a2a') : hex('#1c2745'));
    }
    /* centre the visible goal chips */
    var n = Math.min(4, gl.length);
    var startX = W / 2 - ((n - 1) * 84) / 2;
    for (i = 0; i < n; i++) {
      var c2 = this.goalChips[i], nx = startX + i * 84;
      c2.p.x = nx; c2.ic.x = nx - 22; c2.tx.x = nx + 12; c2.tick.x = nx + 28;
    }

    for (i = 0; i < this.comboPips.length; i++) {
      setTint(this.comboPips[i], i < b.combos ? hex('#F7C948') : hex('#3a4a70'));
      this.comboPips[i].setAlpha(i < b.combos ? 1 : 0.4);
    }
    if (force) publish(this);
  };

  /* ---------------------------------------------------------------- marks */
  PlayScene.prototype.clearMarks = function () {
    for (var i = 0; i < this.markUsed; i++) this.markPool[i].setVisible(false);
    this.markUsed = 0;
  };
  PlayScene.prototype.showMarks = function (cells, tint, alpha) {
    this.clearMarks();
    if (!cells) return;
    for (var i = 0; i < cells.length && i < this.markPool.length; i++) {
      var m = this.markPool[i];
      m.setTexture('tcell');
      m.setPosition(bx(cells[i][0]), by(cells[i][1]));
      m.setScale(TILE_SCALE);
      m.setTint(tint);
      m.setAlpha(alpha == null ? 0.9 : alpha);
      m.setDepth(30);
      m.setVisible(true);
      this.markUsed++;
    }
  };

  /* selector states: ready / preview / resolve */
  PlayScene.prototype.setSelector = function (x, y, state, tint) {
    if (x < 0) { this.selector.setVisible(false); return; }
    this.selector.setVisible(true);
    this.selector.setPosition(bx(x), by(y));
    this.selector.setDepth(31);
    this.selector.setTint(tint == null ? hex(T.highlight) : tint);
    this.selectorState = state || 'ready';
    if (state === 'resolve') {
      this.selector.setScale(TILE_SCALE * 1.18);
      this.selector.setAngle(-6);
    } else if (state === 'preview') {
      this.selector.setAngle(0);
    } else {
      this.selector.setAngle(0);
    }
  };

  /* ---------------------------------------------------------------- input */
  PlayScene.prototype.cellAt = function (px, py) {
    var x = Math.floor((px - BOARD_X - PAD) / CELL);
    var y = Math.floor((py - BOARD_Y - PAD) / CELL);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
    if (this.board.hole(x, y)) return null;
    return { x: x, y: y };
  };

  PlayScene.prototype.pointerAdapter = function (kind, p) {
    if (!kit || !kit.input || !kit.input.pointers) return;
    if (kind === 'down') this.onDown(p);
    else if (kind === 'move') this.onMove(p);
    else if (kind === 'cancel') {
      delete this.pointerClaims[p.id];
      kit.input.pointers.delete(p.id);
      this.clearMarks();
      this.setSelector(-1);
    } else this.onUp(p);
  };

  PlayScene.prototype.onDown = function (p) {
    var kp = kit.input.pointers.get(p.id);
    if (!kp) return;
    if (this.busy || this.bannerBlock || !this.board || this.board.over) return;
    var c = this.cellAt(p.x, p.y);
    if (!c) { this.clearMarks(); this.setSelector(-1); return; }
    this.previewAt(c.x, c.y, true);
    kp.zone = 'board';
    this.pointerClaims[p.id] = { x: c.x, y: c.y };
  };

  PlayScene.prototype.onMove = function (p) {
    if (this.busy || this.bannerBlock || !this.board || this.board.over) return;
    if (p.isDown && !this.pointerClaims[p.id]) return;
    var c = this.cellAt(p.x, p.y);
    if (!c) { if (!p.isDown) { this.clearMarks(); this.setSelector(-1); } return; }
    if (this.lastPreview && this.lastPreview.x === c.x && this.lastPreview.y === c.y) return;
    this.previewAt(c.x, c.y, p.isDown);
  };

  PlayScene.prototype.onUp = function (p) {
    var kp = kit.input.pointers.get(p.id), down = this.pointerClaims[p.id];
    delete this.pointerClaims[p.id];
    if (this.busy || !this.board || this.board.over) return;
    if (!kp || !down || kp.zone !== 'board') return;
    var c = this.cellAt(p.x, p.y);
    if (!c || c.x !== down.x || c.y !== down.y) {
      this.clearMarks(); this.setSelector(-1); return;
    }
    this.tryTap(c.x, c.y, false);
    kit.input.pointers.delete(p.id);
  };

  PlayScene.prototype.previewAt = function (x, y, pressed) {
    var pv = this.board.previewBlast(x, y);
    this.lastPreview = { x: x, y: y };
    this.cursor.x = x; this.cursor.y = y;
    if (!pv) {
      this.clearMarks();
      this.setSelector(x, y, 'ready', hex('#7c8db3'));
      return null;
    }
    var tint = pv.kind === 'group' ? hex(T.highlight) : hex('#F7C948');
    this.showMarks(pv.cells, tint, pv.kind === 'group' ? 0.85 : 0.95);
    this.setSelector(x, y, pressed ? 'preview' : 'ready', tint);
    return pv;
  };

  /* Telegraph then fire. A special always shows its blast radius first. */
  PlayScene.prototype.tryTap = function (x, y, fromHook) {
    if (this.busy || this.bannerBlock || !this.board || this.board.over) return false;
    var pv = this.board.previewBlast(x, y);
    if (!pv) {
      kit.audio.sfx('invalid');
      this.setSelector(x, y, 'ready', hex('#e08a8a'));
      return false;
    }
    var self = this;
    this.hintCells = null;
    if (pv.kind === 'group') {
      this.setSelector(x, y, 'resolve', hex(T.highlight));
      this.resolveTap(x, y);
      return true;
    }
    /* telegraph beat: 200ms of blast radius before anything fires */
    this.busy = true;
    this.showMarks(pv.cells, hex('#FFD86B'), 1);
    this.setSelector(x, y, 'resolve', hex('#FFD86B'));
    kit.audio.sfx('charge');
    this.pulseMarks();
    this.delay(200, function () {
      self.busy = false;
      self.resolveTap(x, y);
    });
    return true;
  };

  PlayScene.prototype.pulseMarks = function () {
    if (!kit.juice.enabled) return;
    for (var i = 0; i < this.markUsed; i++) {
      this.tweens.add({
        targets: this.markPool[i], alpha: 0.45, duration: 100, yoyo: true, repeat: 1
      });
    }
  };

  /* ---------------------------------------------------------------- resolution */
  PlayScene.prototype.resolveTap = function (x, y) {
    var self = this;
    var beforeGoals = this.board.goalList();
    var rep = this.board.tap(x, y);
    if (!rep) {
      kit.audio.sfx('invalid');
      this.clearMarks();
      return;
    }
    this.busy = true;
    this.clearMarks();

    var i, e, s;

    /* 1. specials that fired: streak + blast audio */
    for (i = 0; i < rep.fired.length; i++) {
      e = rep.fired[i];
      this.burstStreak(e, 'chain');
    }
    if (rep.fired.length) {
      kit.audio.sfx('blast');
      var mag = rep.combo ? 6 : 3;
      kit.juice.shake(Math.min(6, mag), 70);
      if (rep.combo) { kit.audio.sfx('combo'); kit.juice.hitStop(70); }
    } else {
      kit.audio.sfx('tap', { rate: 0.9 + Math.min(8, rep.groupSize) * 0.06 });
    }

    /* 2. cleared cells pop and fragment */
    for (i = 0; i < rep.cleared.length; i++) {
      e = rep.cleared[i];
      s = this.view[e.id];
      if (!s) continue;
      delete this.view[e.id];
      this.popSprite(s, e);
    }

    /* 3. cracked crates change texture (state cue, not a colour flash) */
    for (i = 0; i < rep.cracked.length; i++) {
      e = rep.cracked[i];
      s = this.view[e.id];
      if (!s) continue;
      s.setTexture('crate' + Math.min(2, Math.max(0, (this.def.crateHp || 1) - e.hp)));
      if (kit.juice.enabled) {
        this.tweens.add({ targets: s, scaleX: TILE_SCALE * 1.12, scaleY: TILE_SCALE * 0.9, duration: 90, yoyo: true });
        this.spawnParts(bx(e.x), by(e.y), 3, hex('#A9763F'), 'p_frag', 'match');
      }
    }
    if (rep.cracked.length) kit.audio.sfx('clunk');

    /* 4. a special was created */
    var madeList = rep.madeList || (rep.made ? [rep.made] : []);
    for (i = 0; i < madeList.length; i++) {
      var made = madeList[i];
      s = this.view[made.id];
      if (s) {
        s.setTexture(texFor({
          k: 'tile', c: made.c, sp: made.sp,
          rot: (made.x + made.y) % 2
        }, this.def));
        if (kit.juice.enabled) {
          s.setScale(TILE_SCALE * 1.45);
          this.tweens.add({ targets: s, scaleX: TILE_SCALE, scaleY: TILE_SCALE, duration: 220, ease: 'Back.easeOut' });
          this.spawnParts(bx(made.x), by(made.y), 8, hex('#FFFFFF'), 'p_spark', 'chain');
        } else {
          s.setTint(0xffffff);
        }
      }
      kit.audio.sfx('charge');
      this.queueChip(made.sp === 3 ? 'sp3' : (made.sp === 2 ? 'sp20' : 'sp1h0'), 'New special', hex('#F7C948'));
    }

    if (rep.cascadeCount) {
      for (i = 0; i < rep.cascadeCount; i++) {
        this.spawnParts(W / 2, 360 - i * 12, 4 + Math.min(8, i), hex('#F7C948'), 'p_spark', 'chain');
      }
      this.queueChip('p_spark', 'Chain x' + rep.chainMax, hex('#F7C948'));
      kit.audio.sfx('cascade', { rate: 1 + Math.min(6, rep.cascadeCount) * 0.05 });
    }

    /* 5. play every collapse, cascade and hazard phase in order. */
    var phases = rep.phases || [
      { kind: 'collapse', phase: rep.phaseA },
      { kind: 'hazard', phase: rep.phaseB }
    ];
    var phaseAt = 0;
    function nextPhase() {
      if (phaseAt >= phases.length) { self.finishMove(rep, beforeGoals); return; }
      var item = phases[phaseAt++];
      self.animatePhase(item.phase, item.kind === 'cascade' ? 130 : 150, function () {
        if (item.kind === 'cascade') kit.audio.sfx('cascade', { rate: 1 + Math.min(6, item.chain || 0) * 0.04 });
        nextPhase();
      });
    }
    this.delay(rep.cleared.length ? 130 : 40, function () {
      nextPhase();
    });
  };

  PlayScene.prototype.animatePhase = function (phase, ms, done) {
    var self = this, i, m, s, n = 0;
    if (!phase) { done(); return; }
    for (i = 0; i < phase.moves.length; i++) {
      m = phase.moves[i];
      s = this.view[m.cell.id];
      if (!s) { s = this.grab(); this.view[m.cell.id] = s; s.setPosition(bx(m.fx), by(m.fy)); s.setVisible(true); s.setScale(TILE_SCALE); s.setAlpha(1); s.setDepth(10); }
      s.setTexture(texFor(m.cell, this.def));
      n++;
      this.tweens.add({
        targets: s, x: bx(m.x), y: by(m.y),
        duration: ms + Math.abs(m.y - m.fy) * 14,
        ease: 'Quad.easeIn'
      });
    }
    for (i = 0; i < phase.spawns.length; i++) {
      var sp = phase.spawns[i];
      s = this.view[sp.cell.id] || this.grab();
      this.view[sp.cell.id] = s;
      s.setTexture(texFor(sp.cell, this.def));
      s.setVisible(true);
      s.setAlpha(1);
      s.setScale(TILE_SCALE);
      s.setAngle(0);
      s.clearTint();
      s.setDepth(10);
      s.setPosition(bx(sp.x), by(sp.y) - CELL * (3 + (i % 3)));
      n++;
      this.tweens.add({
        targets: s, x: bx(sp.x), y: by(sp.y),
        duration: ms + 60, ease: 'Quad.easeIn', delay: i * 8
      });
    }
    this.delay(n ? ms + 110 : 10, function () {
      self.settleBounce(phase);
      done();
    });
  };

  PlayScene.prototype.settleBounce = function (phase) {
    if (!kit.juice.enabled || !phase) return;
    var list = phase.moves.concat(phase.spawns), i;
    for (i = 0; i < list.length && i < 24; i++) {
      var s = this.view[list[i].cell.id];
      if (!s) continue;
      s.setScale(TILE_SCALE * 1.06, TILE_SCALE * 0.94);
      this.tweens.add({ targets: s, scaleX: TILE_SCALE, scaleY: TILE_SCALE, duration: 130, ease: 'Back.easeOut' });
    }
  };

  PlayScene.prototype.finishMove = function (rep, beforeGoals) {
    var self = this;
    this.syncAll();
    this.paintDock();
    this.updateHud(true);

    /* goal completion pings: corner chips, never banners */
    var after = this.board.goalList(), i;
    for (i = 0; i < after.length; i++) {
      var b = beforeGoals[i];
      if (!b) continue;
      if (after[i].have >= after[i].need && b.have < b.need) {
        this.queueChip(after[i].k === 'pop' ? ('tile' + (after[i].c | 0)) : (after[i].k === 'crate' ? 'crate0' : after[i].k), 'Goal clear', hex('#5BCB77'));
        kit.audio.sfx('goal');
      }
    }
    for (i = 0; i < rep.gearsHome.length; i++) {
      this.spawnParts(bx(rep.gearsHome[i].x), by(rep.gearsHome[i].y), 8, hex('#CBD5E1'), 'p_spark');
    }
    for (i = 0; i < rep.chips.length; i++) {
      var ch = rep.chips[i];
      if (ch.t === 'rescue') {
        this.queueChip('ic_moves', '+' + ch.n + ' moves', hex('#5BCB77'));
        kit.audio.sfx('rescue');
      } else if (ch.t === 'gift') {
        this.queueChip(ch.sp === 2 ? 'sp20' : 'sp1h0', 'Free special', hex('#F7C948'));
        kit.audio.sfx('charge');
      }
    }

    this.busy = false;
    this.setSelector(-1);

    if (this.board.over) this.clearActive();
    else this.persistActive();
    if (this.board.over === 1) this.delay(320, function () { self.win(); });
    else if (this.board.over === -1) this.delay(320, function () { self.lose(); });
    publish(this);
  };

  /* ---------------------------------------------------------------- particles */
  PlayScene.prototype.fxRandom = function () {
    return this.fxRng ? this.fxRng() : 0.5;
  };

  PlayScene.prototype.spawnParts = function (px, py, n, tint, tex, poolName) {
    if (!kit.juice.enabled) return;
    var pool = this.partPools[poolName || (tex === 'p_spark' ? 'chain' : 'match')];
    if (!pool || !pool.items.length) return;
    for (var i = 0; i < n; i++) {
      var p = pool.items[pool.at];
      pool.at = (pool.at + 1) % pool.items.length;
      var a = this.fxRandom() * Math.PI * 2, sp = 40 + this.fxRandom() * 150;
      p.s.setTexture(tex || 'p_frag');
      p.s.setPosition(px, py);
      p.s.setTint(tint);
      p.s.setAlpha(1);
      p.s.setVisible(true);
      p.s.setDepth(40);
      var sc = 0.5 + this.fxRandom() * 0.7;
      p.s.setScale(sc);
      p.sc = sc;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 40;
      p.gv = 460;
      p.rot = (this.fxRandom() * 2 - 1) * 5;
      p.life = 0;
      p.max = 0.34 + this.fxRandom() * 0.3;
    }
  };

  PlayScene.prototype.burstStreak = function (e, poolName) {
    var i, cells = e.cells || [];
    var tint = e.kind === 'orb' ? hex('#F7FBFF') : (e.kind === 'bomb' ? hex('#F29A4A') : hex('#38A8DE'));
    var step = Math.max(1, Math.floor(cells.length / 14));
    for (i = 0; i < cells.length; i += step) {
      this.spawnParts(bx(cells[i][0]), by(cells[i][1]), 1, tint, 'p_streak', poolName || 'cascade');
    }
    this.spawnParts(bx(e.x), by(e.y), 8, tint, 'p_spark', poolName || 'chain');
  };

  PlayScene.prototype.popSprite = function (s, e) {
    var self = this;
    var tint = e.kind === 'tile' ? hex(D.family(e.c).face)
      : (e.kind === 'crate' ? hex('#A9763F') : (e.kind === 'balloon' ? hex('#F06292') : hex('#8B93A6')));
    this.spawnParts(s.x, s.y, e.kind === 'tile' ? 4 : 8, tint, 'p_frag', 'match');
    if (kit.juice.enabled) {
      var resolveBase = e.kind === 'tile' ? hex(D.family(e.c).face) : tint;
      this.tweens.addCounter({
        from: 0, to: 1, duration: 120,
        onUpdate: function (tw) { s.setTint(mixColor(resolveBase, 0xffffff, tw.getValue())); },
        onComplete: function () { s.setVisible(false); s.setAlpha(1); s.setScale(TILE_SCALE); s.clearTint(); }
      });
      this.tweens.add({
        targets: s, scaleX: TILE_SCALE * 1.28, scaleY: TILE_SCALE * 1.28, alpha: 0,
        duration: 150, ease: 'Quad.easeOut',
        onComplete: function () { s.setVisible(false); s.setAlpha(1); s.setScale(TILE_SCALE); s.clearTint(); }
      });
    } else {
      s.setTint(0xffffff);
      this.tweens.add({
        targets: s, alpha: 0, duration: 90,
        onComplete: function () { s.setVisible(false); s.setAlpha(1); s.clearTint(); }
      });
    }
  };

  /* ---------------------------------------------------------------- chips + banner */
  PlayScene.prototype.queueChip = function (icon, text, tint) {
    if (this.chipQueue.length > 4) this.chipQueue.shift();
    this.chipQueue.push({ icon: icon, text: text, tint: tint });
    this.pumpChips();
  };
  PlayScene.prototype.pumpChips = function () {
    var self = this;
    if (this.chipBusy || !this.chipQueue.length) return;
    var c = this.chipQueue.shift();
    this.chipBusy = true;
    var tex = c.icon;
    if (tex === 'balloon' || tex === 'gear') { /* already a texture key */ }
    if (!this.textures.exists(tex)) tex = 'p_spark';
    this.chipIcon.setTexture(tex);
    this.chipIcon.setDisplaySize(22, 22);
    setT(this.chipText, c.text);
    setTint(this.chipPanel, hex('#0f1830'));
    this.chipText.setColor('#ffffff');
    this.chipPanel.setVisible(true); this.chipIcon.setVisible(true); this.chipText.setVisible(true);
    this.chipPanel.setAlpha(0); this.chipIcon.setAlpha(0); this.chipText.setAlpha(0);
    var targets = [this.chipPanel, this.chipIcon, this.chipText];
    this.tweens.add({ targets: targets, alpha: 1, duration: 120 });
    this.delay(900, function () {
      self.tweens.add({
        targets: targets, alpha: 0, duration: 200,
        onComplete: function () {
          self.chipPanel.setVisible(false); self.chipIcon.setVisible(false); self.chipText.setVisible(false);
          self.chipBusy = false;
          self.pumpChips();
        }
      });
    });
  };

  PlayScene.prototype.clearBannerButtons = function () {
    for (var i = 0; i < this.bannerBtns.length; i++) {
      this.bannerBtns[i].p.destroy();
      this.bannerBtns[i].t.destroy();
    }
    this.bannerBtns = [];
  };

  PlayScene.prototype.showBanner = function (title, sub, ms, buttons, medal) {
    var self = this;
    this.clearBannerButtons();
    setT(this.bannerTitle, title);
    setT(this.bannerSub, sub || '');
    this.bannerMedalOn = !!medal && medal !== 'none';
    if (this.bannerMedalOn) this.bannerMedal.setTexture('medal_' + medal);
    var h = buttons && buttons.length ? 320 : 150;
    var top = 360 - h / 2;
    this.bannerPanel.setSize(320, h);
    this.bannerPanel.y = 360;
    this.bannerTitle.y = top + 46;
    this.bannerSub.y = top + 80;
    this.bannerMedal.y = top + 122;
    this.bannerMedal.setDisplaySize(48, 48);
    if (buttons) {
      for (var i = 0; i < buttons.length; i++) {
        var byy = top + h - 36 - (buttons.length - 1 - i) * 52;
        var p = panel(this, W / 2, byy, 232, 44, buttons[i].color || hex('#3b4c73'), 1);
        var t = label(this, W / 2, byy, buttons[i].text, 17, buttons[i].tc || T.highlight, '800');
        this.uiLayer.add(p); this.uiLayer.add(t);
        p.setDepth(60); t.setDepth(61);
        this.bannerBtns.push({ p: p, t: t });
        (function (fn, pp) {
          pp.on('pointerup', function () { kit.audio.sfx('ui'); fn(); });
        })(buttons[i].fn, p);
      }
    }
    this.bannerPanel.setDepth(58);
    this.bannerTitle.setDepth(60);
    this.bannerSub.setDepth(60);
    this.bannerMedal.setDepth(60);
    this.setBannerVisible(true);
    this.bannerPanel.setAlpha(0);
    this.tweens.add({ targets: this.bannerPanel, alpha: 0.97, duration: 160 });
    if (ms) {
      this.delay(ms, function () { self.setBannerVisible(false); });
    }
  };

  /* ---------------------------------------------------------------- outcomes */
  PlayScene.prototype.win = function () {
    var self = this;
    var b = this.board;
    this.clearActive();
    kit.audio.sfx('win');
    if (kit.juice.enabled) {
      kit.juice.shake(4, 70);
      for (var i = 0; i < 5; i++) {
        this.delay(i * 70, function () {
          self.spawnParts(W / 2 + (self.fxRandom() * 200 - 100), 300 + self.fxRandom() * 120, 8,
            hex(D.family(Math.floor(self.fxRandom() * 6)).face), 'p_spark', 'chain');
        });
      }
    }
    var medal = b.medal;
    if (this.mode === 'campaign') {
      var key = String(this.levelNo);
      var old = save.medals[key] || 'none';
      if (D.medalPoints(medal) > D.medalPoints(old)) save.medals[key] = medal;
      if ((save.best[key] | 0) < b.score) save.best[key] = b.score;
      if (this.levelNo >= (save.unlocked | 0)) save.unlocked = Math.min(D.MAXLV, this.levelNo + 1);
      var total = 0, kk;
      for (kk in save.medals) if (Object.prototype.hasOwnProperty.call(save.medals, kk)) total += D.medalPoints(save.medals[kk]);
      save.totalPoints = total;
    } else {
      var dk = D.dayKey();
      if (save.daily.key !== dk) {
        var yst = new Date(Date.now() - 86400000);
        save.daily.streak = (save.daily.key === D.dayKey(yst)) ? (save.daily.streak | 0) + 1 : 1;
        save.daily.key = dk;
        save.daily.cleared = 1;
        save.daily.best = b.score;
        save.daily.last = dk;
      } else if (b.score > (save.daily.best | 0)) {
        save.daily.best = b.score;
      }
    }
    kit.save.set(save);

    if (this.mode === 'campaign') {
      this.scene.start('Restore', { level: this.levelNo, medal: b.medal });
      return;
    }

    var nextN = Math.min(D.MAXLV, this.levelNo + 1);
    var btns = [];
    if (this.mode === 'campaign' && this.levelNo < D.MAXLV) {
      btns.push({
        text: 'Next level', color: hex('#5BCB77'), tc: T.ink,
        fn: function () { self.scene.restart({ level: nextN, mode: 'campaign' }); }
      });
    }
    btns.push({
      text: 'Replay', color: hex('#3b4c73'),
      fn: function () { self.restartLevel(); }
    });
    btns.push({
      text: 'Levels', color: hex('#22304f'),
      fn: function () { self.scene.start('Levels'); }
    });
    var packUnlockNote = this.newlyUnlockedPack();
    this.showBanner('Level clear',
      b.score + ' points  ' + b.movesLeft + ' moves left' + (packUnlockNote ? '  |  ' + packUnlockNote : ''),
      0, btns, medal);
    publish(this);
  };

  PlayScene.prototype.newlyUnlockedPack = function () {
    for (var i = D.PACKS.length - 1; i >= 1; i--) {
      var p = D.PACKS[i];
      if (save.totalPoints >= p.unlockPoints && save.totalPoints - 3 < p.unlockPoints) return p.name + ' open';
    }
    return '';
  };

  PlayScene.prototype.lose = function () {
    var self = this;
    kit.audio.sfx('lose');
    var btns = [
      { text: 'Try again', color: hex('#5BCB77'), tc: T.ink, fn: function () { self.restartLevel(); } },
      { text: 'Levels', color: hex('#22304f'), fn: function () { self.scene.start('Levels'); } }
    ];
    this.showBanner('Out of moves', 'The board keeps every crate you cracked.', 0, btns, null);
    publish(this);
  };

  /* ---------------------------------------------------------------- controls */
  PlayScene.prototype.doHint = function () {
    if (this.busy || !this.board || this.board.over) return;
    var cells = this.board.hint(true);
    if (!cells || !cells.length) { kit.audio.sfx('invalid'); return; }
    kit.audio.sfx('ui');
    this.showMarks(cells, hex('#F7C948'), 0.95);
    this.pulseMarks();
    this.queueChip('ic_hint', 'Hint used', hex('#F7C948'));
    publish(this);
  };

  PlayScene.prototype.restartLevel = function () {
    if (!arguments[0]) { kit.audio.sfx('ui'); kit.restart(); return; }
    this.clearActive();
    this.setBannerVisible(false);
    this.clearBannerButtons();
    this.startLevel(this.levelNo || 1, this.mode, { fresh: true });
  };

  PlayScene.prototype.openPause = function () {
    kit.audio.sfx('ui');
    var self = this;
    kit.openSettings([function (box, row) {
      row('Board hints', function () { return true; }, function () { self.doHint(); });
    }]);
  };

  /* ---------------------------------------------------------------- timers */
  PlayScene.prototype.delay = function (ms, fn) {
    var ev = this.time.delayedCall(ms, fn);
    this.timers.push(ev);
    if (this.timers.length > 64) {
      var old = this.timers.shift();
      if (old && old.remove) old.remove(false);
    }
    return ev;
  };
  PlayScene.prototype.clearTimers = function () {
    for (var i = 0; i < this.timers.length; i++) {
      if (this.timers[i] && this.timers[i].remove) this.timers[i].remove(false);
    }
    this.timers.length = 0;
    this.tweens.killAll();
    if (kit && kit.input) kit.input.clearAll();
    this.pointerClaims = {};
    this.padPrev = {};
    this._juiceFrozen = false;
    for (var p = 0; p < this.parts.length; p++) this.parts[p].s.setVisible(false);
    this.chipBusy = false;
    this.chipQueue.length = 0;
    if (this.chipPanel) { this.chipPanel.setVisible(false); this.chipIcon.setVisible(false); this.chipText.setVisible(false); }
    this.clearMarks();
  };

  PlayScene.prototype.moveCursor = function (dx, dy) {
    var nx = Math.max(0, Math.min(COLS - 1, this.cursor.x + dx));
    var ny = Math.max(0, Math.min(ROWS - 1, this.cursor.y + dy));
    while (this.board.hole(nx, ny) && ny < ROWS - 1) ny++;
    this.cursor.x = nx; this.cursor.y = ny;
    this.previewAt(nx, ny, false);
  };

  PlayScene.prototype.pollGamepad = function () {
    var nav = g.navigator, pads = nav && nav.getGamepads ? nav.getGamepads() : null;
    var pad = pads && pads[0], b = pad && pad.buttons ? pad.buttons : [];
    if (!pad || !b.length) { this.padPrev = {}; return; }
    var now = {
      left: !!(b[14] && b[14].pressed), right: !!(b[15] && b[15].pressed),
      up: !!(b[12] && b[12].pressed), down: !!(b[13] && b[13].pressed),
      action: !!(b[0] && b[0].pressed), menu: !!((b[9] && b[9].pressed) || (b[16] && b[16].pressed)),
      restart: !!(b[1] && b[1].pressed)
    };
    var prev = this.padPrev || {}, edge = function (key) { return now[key] && !prev[key]; };
    this.padPrev = now;
    if (edge('menu')) { this.openPause(); return; }
    if (this.busy || !this.board || this.board.over || this.bannerBlock || this.keyTimer > 0) return;
    if (edge('left')) { this.moveCursor(-1, 0); this.keyTimer = 0.14; }
    else if (edge('right')) { this.moveCursor(1, 0); this.keyTimer = 0.14; }
    else if (edge('up')) { this.moveCursor(0, -1); this.keyTimer = 0.14; }
    else if (edge('down')) { this.moveCursor(0, 1); this.keyTimer = 0.14; }
    else if (edge('action')) { this.tryTap(this.cursor.x, this.cursor.y, false); this.keyTimer = 0.25; }
    else if (edge('restart')) { this.restartLevel(); this.keyTimer = 0.6; }
  };

  /* ---------------------------------------------------------------- update */
  PlayScene.prototype.update = function (time, delta) {
    /* Cosmetic clock only; the sim is turn-based. dt is clamped so a degraded
       device gets slow motion, never a time skip. */
    var dt = Math.min(delta, 33) / 1000;

    var f = kit.juice.frame();
    if (f.frozen && !this._juiceFrozen) this.tweens.pauseAll();
    if (!f.frozen && this._juiceFrozen) this.tweens.resumeAll();
    this._juiceFrozen = !!f.frozen;
    this.layer.x = f.dx;
    this.layer.y = f.dy;
    /* the field mask is not a child of the shaken container, so it is moved
       by the same offset instead of being redrawn */
    if (this.maskG.x !== f.dx || this.maskG.y !== f.dy) {
      this.maskG.setPosition(f.dx, f.dy);
    }

    if (f.frozen) return;

    /* Tile treatment one: a low-amplitude idle color lift on plain tiles. */
    this.idleTick = ((this.idleTick || 0) + 1) % 3;
    if (kit.juice.enabled && this.board && this.idleTick === 0) {
      for (var yy = 0; yy < ROWS; yy++) for (var xx = 0; xx < COLS; xx++) {
        var tc = this.board.at(xx, yy), ts = tc && this.view[tc.id];
        if (tc && ts && tc.k === 'tile' && tc.sp === Sim.SP_NONE) {
          var lift = 0.035 + (Math.sin(time * 0.002 + tc.id * 0.37) + 1) * 0.018;
          ts.setTint(mixColor(hex(D.family(tc.c).face), 0xffffff, lift));
        }
      }
    }

    /* selector breathing = Ready state */
    if (this.selector.visible) {
      if (this.selectorState === 'resolve') {
        this.selector.setScale(this.selector.scaleX + (TILE_SCALE - this.selector.scaleX) * Math.min(1, dt * 9));
        this.selector.setAngle(this.selector.angle * (1 - Math.min(1, dt * 9)));
      } else {
        var s = TILE_SCALE * (1 + Math.sin(time * 0.005) * (this.selectorState === 'preview' ? 0.05 : 0.02));
        this.selector.setScale(s);
      }
    }

    /* particles */
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      if (!p.s.visible) continue;
      p.life += dt;
      if (p.life >= p.max) { p.s.setVisible(false); continue; }
      p.vy += p.gv * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.angle += p.rot * dt * 60;
      var k = 1 - p.life / p.max;
      p.s.setAlpha(k);
      p.s.setScale(p.sc * (0.4 + k * 0.6));
    }

    /* GGKit keyboard plus the small gamepad adapter. */
    this.keyTimer -= dt;
    if (kit.input.keyDown('Escape') && !this.escapeLatch) {
      this.escapeLatch = true; this.openPause();
    } else if (!kit.input.keyDown('Escape')) {
      this.escapeLatch = false;
    }
    this.pollGamepad();
    if (this.keyTimer <= 0 && !this.busy && this.board && !this.board.over) {
      var moved = false;
      if (kit.input.keyDown('ArrowLeft')) { this.moveCursor(-1, 0); moved = true; }
      else if (kit.input.keyDown('ArrowRight')) { this.moveCursor(1, 0); moved = true; }
      else if (kit.input.keyDown('ArrowUp')) { this.moveCursor(0, -1); moved = true; }
      else if (kit.input.keyDown('ArrowDown')) { this.moveCursor(0, 1); moved = true; }
      if (moved) {
        this.keyTimer = 0.14;
      } else if (kit.input.keyDown('Space') || kit.input.keyDown('Enter')) {
        this.keyTimer = 0.25;
        this.tryTap(this.cursor.x, this.cursor.y, false);
      } else if (kit.input.keyDown('KeyH')) {
        this.keyTimer = 0.4; this.doHint();
      } else if (kit.input.keyDown('KeyR')) {
        this.keyTimer = 0.6; this.restartLevel();
      }
    }
  };

  /* ================================================================== boot */
  function boot() {
    var reduced = false;
    try {
      reduced = !!(g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { reduced = false; }

    kit = GGKit.create({
      slug: 'chroma-tap',
      orientation: 'portrait',
      validateSave: D.validateSave,
      onPause: function () {
        var sc = g.__ctGame && g.__ctGame.scene.getScene('Play');
        if (sc && sc.scene.isActive()) sc.scene.pause();
      },
      onResume: function () {
        var sc = g.__ctGame && g.__ctGame.scene.getScene('Play');
        if (sc && sc.scene.isPaused()) sc.scene.resume();
      },
      onRestart: function () {
        var sc = g.__ctGame && g.__ctGame.scene.getScene('Play');
        if (sc && sc.restartLevel) sc.restartLevel(true);
      }
    });

    /* prefers-reduced-motion is the INITIAL preference; the GGKit settings
       shell still overrides it, and no puzzle information depends on juice. */
    if (reduced) kit.juice.enabled = false;

    save = D.normalizeSave(kit.save.get(null));
    kit.save.set(save);

    var game = new Phaser.Game({
      type: Phaser.AUTO,
      width: W, height: H,
      parent: document.body,
      backgroundColor: '#101728',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: W, height: H
      },
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
      fps: { target: 60, min: 20 },
      scene: [BootScene, MenuScene, LevelsScene, RestoreScene, PlayScene]
    });
    g.__ctGame = game;
    hook.kit = kit;
    hook.save = function () { return save; };
    hook.resetSave = function () {
      save = D.emptySave();
      kit.save.set(save);
      return true;
    };
    kit.registerPWA();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})(typeof window !== 'undefined' ? window : globalThis);
