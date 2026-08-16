/* Shellshock Pinball - Phaser view over a fixed-step pinball sim.
 * GGKit owns lifecycle, input identity, save validation, audio, settings and PWA.
 */
(function () {
  'use strict';

  var W = 430, H = 900, STEP = 1 / 120, MAX_STEPS = 8, TAU = Math.PI * 2;
  var RETINA_FACTOR = GGKit.hiDpi.factor(W, H);
  var MAX_BALLS = 3, MAX_PARTICLES = 150, MAX_RINGS = 8;
  var SIDE_KEYS = ['left', 'right'];
  var GRAVITY = 1160, MAX_SPEED = 1760;
  var DEBUG_BUILD = !!(window.__GG_DEV__ || (window.location && /(?:localhost|127\.0\.0\.1)$/.test(window.location.hostname)) || (window.location && /(?:^|&)debug=1(?:&|$)/.test(window.location.search.slice(1))));
  var SKINS = [
    { id: 'ion', name: 'ION BLUE', unlock: 0, bg: 0x071727, board: 0x0c2e4d, rail: 0x42e8ff, hot: 0x62f6bb, ink: 0xe9fbff },
    { id: 'ember', name: 'EMBER CIRCUIT', unlock: 25000, bg: 0x1b0d18, board: 0x4a1d2a, rail: 0xffb84f, hot: 0xff5c91, ink: 0xfff0dc },
    { id: 'violet', name: 'VIOLET VECTOR', unlock: 80000, bg: 0x120d2b, board: 0x30205e, rail: 0xb97cff, hot: 0x62f6bb, ink: 0xf5efff },
    { id: 'mint', name: 'MINT ARMATURE', unlock: 180000, bg: 0x071e20, board: 0x0c4e4d, rail: 0x62f6bb, hot: 0xffe06d, ink: 0xecffff },
    { id: 'prism', name: 'PRISM OVERDRIVE', unlock: 350000, bg: 0x1b102d, board: 0x49225c, rail: 0xff5c91, hot: 0xb97cff, ink: 0xffefff }
  ];
  var MISSIONS = [
    { kind: 'bumper', need: 10, label: 'BOUNCE 10 BUMPERS' },
    { kind: 'ramp', need: 3, label: 'RUN 3 OVERPASSES' },
    { kind: 'spinner', need: 16, label: 'SPIN 16 TICKS' },
    { kind: 'target', need: 5, label: 'DROP 5 TARGETS' },
    { kind: 'bank', need: 1, label: 'CLEAR A TARGET BANK' },
    { kind: 'bonus', need: 4, label: 'LIGHT 4 BONUS LAMPS' }
  ];
  var MISSION_SHORT = { bumper: 'BUMPER', ramp: 'RAMP', spinner: 'SPIN', target: 'TARGET', bank: 'BANK', bonus: 'BONUS' };
  var DEFAULT_SEED = SS.hashSeed('shellshock-pinball-fleet-f5');
  var currentSeed = DEFAULT_SEED;
  var profile;
  var Game = { phaser: null, title: null, play: null };
  var debugState = { mode: 'title', ball: { x: 381, y: 820, state: 'ready', index: 1 }, score: 0, seed: currentSeed };
  var pendingForce = null;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function fmt(n) { return Math.floor(n || 0).toLocaleString('en-US'); }
  function setTextIfChanged(obj, value) {
    var next = String(value);
    if (obj._ssText === next) return false;
    obj._ssText = next; obj.setText(next); return true;
  }
  function setTintIfChanged(obj, color) {
    if (obj._ssTint === color) return;
    obj._ssTint = color; obj.setTint(color);
  }
  function setColorIfChanged(obj, color) {
    if (obj._ssColor === color) return;
    obj._ssColor = color; obj.setColor(color);
  }
  function validInt(v, max) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 0 && v <= max; }
  function defaultProfile() {
    return { v: 1, best: 0, lastSeed: DEFAULT_SEED, seedBests: {}, skin: 'ion', tutorialDone: false, unlocked: { ion: true } };
  }
  function skinById(id) {
    var i;
    for (i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) return SKINS[i];
    return SKINS[0];
  }
  function exactSkin(id) {
    var i;
    for (i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) return SKINS[i];
    return null;
  }
  function validateProfile(o) {
    var i, skin;
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== 1) return false;
    if (!validInt(o.best, 1000000000) || !validInt(o.lastSeed, 4294967295)) return false;
    if (typeof o.tutorialDone !== 'boolean' || !exactSkin(o.skin)) return false;
    if (!o.seedBests || typeof o.seedBests !== 'object' || Array.isArray(o.seedBests)) return false;
    var seedKeys = Object.keys(o.seedBests), seedKey, seedNumber;
    if (seedKeys.length > 64) return false;
    for (i = 0; i < seedKeys.length; i++) { seedKey = seedKeys[i]; seedNumber = Number(seedKey); if (!validInt(seedNumber, 4294967295) || String(seedNumber) !== seedKey || !validInt(o.seedBests[seedKey], 1000000000)) return false; }
    if (!o.unlocked || typeof o.unlocked !== 'object' || Array.isArray(o.unlocked)) return false;
    for (i = 0; i < SKINS.length; i++) {
      skin = SKINS[i];
      if (o.unlocked[skin.id] != null && typeof o.unlocked[skin.id] !== 'boolean') return false;
    }
    if (o.unlocked.ion !== true) return false;
    return true;
  }
  function ensureProfile() {
    var fallback = defaultProfile();
    profile = kit.save.get(fallback);
    if (!validateProfile(profile)) profile = fallback;
    if (!profile.unlocked.ion) profile.unlocked.ion = true;
    if (!skinById(profile.skin) || !profile.unlocked[profile.skin]) profile.skin = 'ion';
    currentSeed = (profile.lastSeed >>> 0) || DEFAULT_SEED;
  }
  function persist() { kit.save.set(profile); }
  function unlockForScore(score) {
    var i, changed = false;
    for (i = 0; i < SKINS.length; i++) {
      if (score >= SKINS[i].unlock && profile.unlocked[SKINS[i].id] !== true) {
        profile.unlocked[SKINS[i].id] = true; changed = true;
      }
    }
    if (changed) persist();
  }

  var kit = GGKit.create({
    slug: 'shellshock-pinball',
    orientation: 'portrait',
    validateSave: validateProfile,
    onPause: function () { if (Game.play) { Game.play.lifecyclePaused = true; Game.play.clearInput(); } },
    onResume: function () { if (Game.play) Game.play.lifecyclePaused = false; },
    onRestart: function () { if (Game.play) Game.play.restartRun(currentSeed); }
  });
  function makeGamepadInput() {
    var pad = {
      connected: false, left: false, right: false, launch: false, nudgeLeft: false, nudgeRight: false,
      nudgeUp: false, newGame: false, mute: false, previous: {}, current: {},
      poll: function () {
        var list, i, candidate = null, buttons, axes;
        if (!navigator.getGamepads) { this.connected = false; this.current = {}; return this; }
        list = navigator.getGamepads();
        for (i = 0; i < list.length; i++) if (list[i]) { candidate = list[i]; break; }
        this.connected = !!candidate;
        this.current = {};
        if (!candidate) {
          this.left = this.right = this.launch = this.nudgeLeft = this.nudgeRight = this.nudgeUp = this.newGame = this.mute = false;
          return this;
        }
        buttons = candidate.buttons || []; axes = candidate.axes || [];
        function down(index) { return !!(buttons[index] && (buttons[index].pressed || buttons[index].value > 0.55)); }
        this.left = down(14) || down(4) || (axes[0] || 0) < -0.55;
        this.right = down(15) || down(5) || (axes[0] || 0) > 0.55;
        this.launch = down(0) || down(9);
        this.nudgeLeft = down(14) || ((axes[0] || 0) < -0.8);
        this.nudgeRight = down(15) || ((axes[0] || 0) > 0.8);
        this.nudgeUp = down(12) || ((axes[1] || 0) < -0.8);
        this.newGame = down(8);
        this.mute = down(2);
        this.current = { nudgeLeft: this.nudgeLeft, nudgeRight: this.nudgeRight, nudgeUp: this.nudgeUp, newGame: this.newGame, mute: this.mute };
        return this;
      },
      pressed: function (name) { return !!this.current[name] && !this.previous[name]; },
      commit: function () { this.previous = this.current; },
      clear: function () { this.previous = {}; this.current = {}; this.poll(); this.commit(); }
    };
    return pad;
  }
  kit.input.gamepad = makeGamepadInput();
  ensureProfile();
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) kit.juice.enabled = false;

  function syncDebug(run, ball) {
    var active = ball || (run && run.balls ? run.balls[0] : null);
    debugState.mode = run ? (run.phase === 'play' ? (run.mission.on ? 'mission' : (run.multiball ? 'multiball' : 'play')) : run.phase) : 'title';
    debugState.score = run ? run.score : 0;
    debugState.seed = currentSeed;
    if (!debugState.ball) debugState.ball = {};
    debugState.ball.x = active ? Math.round(active.x) : 381;
    debugState.ball.y = active ? Math.round(active.y) : 820;
    debugState.ball.state = active ? active.state : 'ready';
    debugState.ball.index = run ? run.ballNumber : 1;
    debugState.ball.active = active ? !!active.active : false;
  }
  function forceMode(mode) {
    pendingForce = String(mode || 'play');
    if (pendingForce === 'title') {
      if (Game.title) Game.title.scene.start('title');
      else syncDebug(null);
      return;
    }
    if (Game.play) { Game.play.forceMode(pendingForce); return; }
    if (Game.title) Game.title.scene.start('play', { seed: currentSeed, force: pendingForce });
  }
  function forceSeed(seed) {
    var value = Number(seed);
    if (!isFinite(value)) return;
    currentSeed = (value >>> 0) || DEFAULT_SEED;
    profile.lastSeed = currentSeed; persist();
    if (Game.play) Game.play.scene.restart({ seed: currentSeed });
    else if (Game.title) Game.title.scene.start('play', { seed: currentSeed });
  }
  if (DEBUG_BUILD) window.__ss = { state: debugState, forceMode: forceMode, forceSeed: forceSeed };

  function bake(scene, key, width, height, draw) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var g = scene.make.graphics({ x: 0, y: 0, add: false });
    draw(g); g.generateTexture(key, width, height); g.destroy();
  }
  function bakeTextures(scene) {
    var i, s, g;
    for (i = 0; i < SKINS.length; i++) {
      s = SKINS[i];
      bake(scene, 'board-' + s.id, W, H, function (graphics) {
        var y, f, c;
        for (y = 0; y < H; y += 18) {
          f = y / H; c = ((Math.floor(5 + f * 8) << 16) | (Math.floor(12 + f * 13) << 8) | Math.floor(25 + f * 28));
          graphics.fillStyle(c, 1); graphics.fillRect(0, y, W, 19);
        }
        graphics.fillStyle(s.bg, 0.94); graphics.fillRoundedRect(13, 93, 404, 795, 28);
        graphics.lineStyle(5, s.board, 1); graphics.strokeRoundedRect(15, 95, 400, 791, 27);
        graphics.lineStyle(2, s.rail, 0.82); graphics.strokeRoundedRect(23, 103, 384, 775, 22);
      graphics.fillStyle(s.board, 0.9); graphics.fillRect(0, 0, W, 92);
      graphics.lineStyle(2, s.rail, 0.35); graphics.lineBetween(12, 91, W - 12, 91);
        graphics.fillStyle(0x020913, 0.55); graphics.fillRoundedRect(24, 112, 382, 752, 20);
        graphics.lineStyle(2, s.rail, 0.24); graphics.strokeRoundedRect(27, 115, 376, 746, 18);
        graphics.fillStyle(0x061422, 0.64); graphics.fillRoundedRect(34, 132, 326, 710, 16);
        graphics.fillStyle(s.rail, 0.06); graphics.fillRoundedRect(44, 150, 306, 670, 14);
        graphics.fillStyle(s.rail, 0.09); graphics.fillCircle(215, 338, 155);
        graphics.fillStyle(s.hot, 0.05); graphics.fillCircle(215, 580, 185);
        graphics.lineStyle(1, s.rail, 0.12);
        for (c = 0; c < 8; c++) graphics.lineBetween(35, 136 + c * 84, 395, 136 + c * 84);
        graphics.fillStyle(s.rail, 0.12); graphics.fillRect(365, 150, 36, 715);
      });
    }
    bake(scene, 'ball', 36, 36, function (graphics) {
      graphics.fillStyle(0xeffbff, 0.22); graphics.fillCircle(18, 19, 16);
      graphics.fillStyle(0xffffff, 1); graphics.fillCircle(18, 18, 12);
      graphics.fillStyle(0x94c9e3, 1); graphics.fillCircle(21, 22, 9);
      graphics.fillStyle(0xffffff, 0.92); graphics.fillCircle(14, 13, 3);
      graphics.lineStyle(1.5, 0x173349, 0.9); graphics.strokeCircle(18, 18, 12);
    });
    bake(scene, 'bumper', 64, 64, function (graphics) {
      graphics.fillStyle(0xffffff, 0.10); graphics.fillCircle(32, 32, 30);
      graphics.fillStyle(0x174868, 1); graphics.fillCircle(32, 32, 23);
      graphics.lineStyle(3, 0x8df4ff, 1); graphics.strokeCircle(32, 32, 22);
      graphics.fillStyle(0xffffff, 0.8); graphics.fillCircle(25, 24, 6);
      graphics.fillStyle(0x0a1723, 1); graphics.fillCircle(32, 34, 8);
      graphics.lineStyle(2, 0xb6f8ff, 0.8); graphics.strokeCircle(32, 32, 8);
    });
    bake(scene, 'target', 48, 30, function (graphics) {
      graphics.fillStyle(0xffffff, 0.18); graphics.fillRoundedRect(4, 5, 40, 20, 4);
      graphics.fillStyle(0x4acbba, 1); graphics.fillRoundedRect(5, 5, 38, 18, 3);
      graphics.fillStyle(0xeaffff, 0.55); graphics.fillRect(8, 7, 32, 3);
      graphics.lineStyle(1.5, 0x0c343e, 1); graphics.strokeRoundedRect(5, 5, 38, 18, 3);
    });
    function bakeFlipper(key, body, core, edge) {
      bake(scene, key, 108, 34, function (graphics) {
        graphics.fillStyle(0xffffff, 0.14); graphics.fillRoundedRect(6, 7, 95, 20, 10);
        graphics.fillStyle(body, 1); graphics.fillRoundedRect(7, 7, 94, 18, 9);
        graphics.fillStyle(core, 1); graphics.fillRoundedRect(18, 11, 69, 10, 5);
        graphics.lineStyle(2, edge, 0.9); graphics.strokeRoundedRect(7, 7, 94, 18, 9);
        graphics.fillStyle(0x102235, 1); graphics.fillCircle(13, 16, 6);
        graphics.fillStyle(0xffffff, key === 'flipper-strike' ? 0.8 : 0.42); graphics.fillCircle(81, 11, key === 'flipper-strike' ? 4 : 2);
      });
    }
    bakeFlipper('flipper-rest', 0x658fa8, 0x20435b, 0xbfefff);
    bakeFlipper('flipper-recover', 0x86bad0, 0x245a73, 0xe0fbff);
    bakeFlipper('flipper-strike', 0xffc967, 0x8e3549, 0xffffdf);
    bake(scene, 'spinner', 78, 38, function (graphics) {
      graphics.fillStyle(0xffffff, 0.12); graphics.fillRoundedRect(4, 7, 70, 24, 4);
      graphics.fillStyle(0xffc763, 1); graphics.fillRoundedRect(5, 8, 68, 20, 3);
      graphics.fillStyle(0x593b23, 1); graphics.fillRect(36, 8, 4, 20);
      graphics.lineStyle(2, 0xfff2be, 0.9); graphics.strokeRoundedRect(5, 8, 68, 20, 3);
    });
    bake(scene, 'hole', 78, 78, function (graphics) {
      graphics.fillStyle(0xff5c91, 0.18); graphics.fillCircle(39, 39, 36);
      graphics.fillStyle(0x05080f, 1); graphics.fillCircle(39, 39, 22);
      graphics.lineStyle(3, 0xb1c5e7, 0.9); graphics.strokeCircle(39, 39, 22);
      graphics.lineStyle(2, 0xff5c91, 0.7); graphics.strokeCircle(39, 39, 29);
    });
    bake(scene, 'lamp', 30, 30, function (graphics) {
      graphics.fillStyle(0xffffff, 0.12); graphics.fillCircle(15, 15, 14);
      graphics.fillStyle(0x24354f, 1); graphics.fillCircle(15, 15, 9);
      graphics.lineStyle(2, 0x6683a9, 1); graphics.strokeCircle(15, 15, 9);
    });
    bake(scene, 'lock', 66, 66, function (graphics) {
      graphics.fillStyle(0xffb84f, 0.18); graphics.fillCircle(33, 33, 31);
      graphics.fillStyle(0x412c1a, 1); graphics.fillCircle(33, 33, 22);
      graphics.lineStyle(3, 0xffd978, 1); graphics.strokeCircle(33, 33, 22);
      graphics.lineStyle(4, 0xffd978, 1); graphics.strokeRoundedRect(24, 27, 18, 16, 4);
      graphics.lineBetween(27, 27, 27, 20); graphics.lineBetween(39, 27, 39, 20);
      graphics.lineBetween(27, 20, 39, 20);
    });
    bake(scene, 'spark', 24, 24, function (graphics) {
      graphics.fillStyle(0xffffff, 1); graphics.fillCircle(12, 12, 3);
      graphics.lineStyle(2, 0xffffff, 0.9); graphics.lineBetween(12, 1, 12, 23); graphics.lineBetween(1, 12, 23, 12);
      graphics.lineStyle(1, 0xffffff, 0.6); graphics.lineBetween(4, 4, 20, 20); graphics.lineBetween(20, 4, 4, 20);
    });
    bake(scene, 'fx-dot', 18, 18, function (graphics) {
      graphics.fillStyle(0xffffff, 0.9); graphics.fillCircle(9, 9, 7); graphics.fillStyle(0xffffff, 0.42); graphics.fillCircle(9, 9, 9);
    });
    bake(scene, 'fx-streak', 30, 10, function (graphics) {
      graphics.fillStyle(0xffffff, 0.9); graphics.fillRoundedRect(2, 3, 26, 4, 2); graphics.fillStyle(0xffffff, 0.35); graphics.fillRoundedRect(0, 1, 30, 8, 4);
    });
    bake(scene, 'fx-diamond', 20, 20, function (graphics) {
      graphics.fillStyle(0xffffff, 0.9); graphics.beginPath(); graphics.moveTo(10, 1); graphics.lineTo(19, 10); graphics.lineTo(10, 19); graphics.lineTo(1, 10); graphics.closePath(); graphics.fillPath(); graphics.lineStyle(1, 0xffffff, 0.75); graphics.strokePath();
    });
    bake(scene, 'ring', 120, 120, function (graphics) {
      graphics.lineStyle(4, 0xffffff, 0.9); graphics.strokeCircle(60, 60, 48);
      graphics.lineStyle(1, 0xffffff, 0.5); graphics.strokeCircle(60, 60, 56);
    });
  }

  function bakeTable(scene, table, skin) {
    bake(scene, 'table-layout', W, H, function (g) {
      var i, seg, sl, p, ramp = table.ramp, pal = skin;
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (i = 0; i < table.segs.length; i++) {
        seg = table.segs[i];
        if (seg.kind === 'target' || seg.kind === 'sling') continue;
        g.lineStyle(seg.kind === 'rail' ? 5 : 4, seg.color || pal.rail, seg.kind === 'lane' ? 0.48 : 0.72);
        g.lineBetween(seg.x1, seg.y1, seg.x2, seg.y2);
        g.lineStyle(1, 0xe4fbff, 0.18); g.lineBetween(seg.x1, seg.y1 - 1, seg.x2, seg.y2 - 1);
      }
      for (i = 0; i < table.slings.length; i++) {
        sl = table.slings[i]; p = sl.points;
        g.fillStyle(pal.hot, 0.15); g.beginPath(); g.moveTo(p[0][0], p[0][1]); g.lineTo(p[1][0], p[1][1]); g.lineTo(p[2][0], p[2][1]); g.closePath(); g.fillPath();
        g.lineStyle(3, pal.hot, 0.8); g.beginPath(); g.moveTo(p[0][0], p[0][1]); g.lineTo(p[1][0], p[1][1]); g.lineTo(p[2][0], p[2][1]); g.strokePath();
      }
      if (ramp) {
        g.lineStyle(42, 0x000000, 0.42); g.beginPath(); g.moveTo(ramp.path[0][0] + 5, ramp.path[0][1] + 8);
        for (i = 1; i < ramp.path.length; i++) g.lineTo(ramp.path[i][0] + 5, ramp.path[i][1] + 8); g.strokePath();
        g.lineStyle(31, pal.rail, 0.18); g.beginPath(); g.moveTo(ramp.path[0][0], ramp.path[0][1]);
        for (i = 1; i < ramp.path.length; i++) g.lineTo(ramp.path[i][0], ramp.path[i][1]); g.strokePath();
        g.lineStyle(24, 0x07131f, 0.94); g.beginPath(); g.moveTo(ramp.path[0][0], ramp.path[0][1]);
        for (i = 1; i < ramp.path.length; i++) g.lineTo(ramp.path[i][0], ramp.path[i][1]); g.strokePath();
        g.lineStyle(2, pal.rail, 0.74); g.beginPath(); g.moveTo(ramp.path[0][0], ramp.path[0][1]);
        for (i = 1; i < ramp.path.length; i++) g.lineTo(ramp.path[i][0], ramp.path[i][1]); g.strokePath();
        g.lineStyle(2, 0xe8fbff, 0.7); g.beginPath(); g.moveTo(ramp.path[0][0] - 8, ramp.path[0][1] - 4);
        for (i = 1; i < ramp.path.length; i++) g.lineTo(ramp.path[i][0] - 8, ramp.path[i][1] - 4); g.strokePath();
        g.lineStyle(2, 0xe8fbff, 0.7); g.beginPath(); g.moveTo(ramp.path[0][0] + 8, ramp.path[0][1] - 4);
        for (i = 1; i < ramp.path.length; i++) g.lineTo(ramp.path[i][0] + 8, ramp.path[i][1] - 4); g.strokePath();
        g.fillStyle(pal.rail, 0.12); g.fillTriangle(ramp.mouth.x1, ramp.mouth.y + 24, (ramp.mouth.x1 + ramp.mouth.x2) * 0.5, ramp.mouth.y - 5, ramp.mouth.x2, ramp.mouth.y + 24);
      }
      if (table.lock) { g.lineStyle(8, pal.hot, 0.08); g.strokeCircle(table.lock.x, table.lock.y, 36); g.lineStyle(2, pal.hot, 0.36); g.strokeCircle(table.lock.x, table.lock.y, 33); }
      if (table.kickback) {
        g.fillStyle(pal.hot, 0.08); g.fillCircle(table.kickback.x, table.kickback.y, 29);
        g.lineStyle(2, pal.hot, 0.62); g.strokeCircle(table.kickback.x, table.kickback.y, 20);
      }
    });
  }

  function text(scene, x, y, value, size, color, origin) {
    var readable = Math.max(10, size || 10);
    return scene.add.text(x, y, value, { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: readable + 'px', fontStyle: readable >= 18 ? 'bold' : 'normal', color: color || '#e9fbff', resolution: RETINA_FACTOR }).setOrigin(origin == null ? 0.5 : origin);
  }
  function makeButton(scene, x, y, w, h, label, callback, primary, hitW, hitH, labelSize) {
    var c = scene.add.container(x, y), bg = scene.add.rectangle(0, 0, w, h, primary ? 0x164d62 : 0x10263d, 0.96);
    var stroke = scene.add.rectangle(0, 0, w, h, 0x000000, 0).setStrokeStyle(2, primary ? 0x62f6bb : 0x42e8ff, 0.9);
    var iw = Math.max(w, hitW || w), ih = Math.max(h, hitH || h), t = text(scene, 0, 0, label, labelSize || (primary ? 15 : 12), primary ? '#eaffff' : '#a9d5e6');
    c.add([bg, stroke, t]); c.setSize(iw, ih); c.setInteractive(new Phaser.Geom.Rectangle(-iw / 2, -ih / 2, iw, ih), Phaser.Geom.Rectangle.Contains);
    bg.setInteractive(new Phaser.Geom.Rectangle(-iw / 2, -ih / 2, iw, ih), Phaser.Geom.Rectangle.Contains);
    bg.on('pointerdown', function () { sfx('ui'); c.setScale(0.96, 0.94); });
    bg.on('pointerup', function () { c.setScale(1, 1); callback(); });
    bg.on('pointerout', function () { c.setScale(1, 1); });
    c.label = t; return c;
  }
  function sfx(name, opts) { kit.audio.sfx(name, opts); }

  function toScene(cfg) {
    var Klass = function () { Phaser.Scene.call(this, { key: cfg.key }); };
    Klass.prototype = Object.create(Phaser.Scene.prototype); Klass.prototype.constructor = Klass;
    var k; for (k in cfg) if (k !== 'key') Klass.prototype[k] = cfg[k];
    return Klass;
  }

  var BootScene = {
    key: 'boot',
    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR);
      var scene = this;
      kit.loader.show('SHELLSHOCK PINBALL'); kit.loader.progress(0.18);
      bakeTextures(scene); kit.loader.progress(0.72);
      kit.audio.register({
        music: 'assets/music.mp3', flipper: 'assets/flipper.mp3', bumper: 'assets/bumper.mp3',
        target: 'assets/target.mp3', launch: 'assets/launch.mp3', jackpot: 'assets/jackpot.mp3',
        multiball: 'assets/multiball.mp3', drain: 'assets/drain.mp3', kickback: 'assets/kickback.mp3',
        intensity: 'assets/intensity.mp3', ui: 'assets/ui.mp3'
      });
      kit.audio.preload().then(function () {
        kit.loader.progress(1); kit.loader.hide(); scene.scene.start('title');
      });
    }
  };

  var TitleScene = {
    key: 'title',
    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR);
      var scene = this, skin = skinById(profile.skin), table = SS.generateTable(currentSeed);
      Game.title = this; Game.play = null; syncDebug(null);
      this.cameras.main.setBackgroundColor('#050b15');
      kit.audio.music('music', 900);
      this.add.image(0, 0, 'board-' + skin.id).setOrigin(0);
      this.add.image(215, 205, 'bumper').setTint(skin.rail).setScale(1.35).setBlendMode(Phaser.BlendModes.ADD);
      this.add.image(215, 205, 'bumper').setTint(skin.hot).setScale(0.88);
      text(this, 215, 100, 'SHELLSHOCK', 29, '#eaffff');
      text(this, 215, 136, 'PINBALL', 36, '#62f6bb');
      text(this, 215, 275, table.name, 17, '#ffcf72');
      text(this, 215, 299, table.archetype.tag.toUpperCase(), 10, '#8db6c8');
      text(this, 215, 331, 'SEEDED TABLE  #' + currentSeed.toString(36).toUpperCase(), 10, '#7394aa');
      text(this, 215, 358, 'BEST  ' + fmt(profile.best), 12, '#e9fbff');
      text(this, 215, 389, 'JACKPOT MEDALS  ·  x1 BRONZE  ·  x2 SILVER  ·  x3 GOLD  ·  x4 DIAMOND', 9, '#8db6c8');
      var unlocked = 0, i;
      for (i = 0; i < SKINS.length; i++) if (profile.unlocked[SKINS[i].id]) unlocked++;
      text(this, 215, 416, 'SKIN CHAIN  ' + unlocked + '/' + SKINS.length + ' UNLOCKED  ·  CURRENT  ' + skin.name, 10, '#ffcf72');
      makeButton(this, 215, 493, 280, 54, 'PLAY THIS TABLE', function () { sfx('ui'); scene.scene.start('play', { seed: currentSeed }); }, true);
      makeButton(this, 215, 560, 280, 46, 'NEW TABLE  /  RESEED', function () {
        currentSeed = SS.hashSeed(String(Date.now()) + ':' + (currentSeed + 1)); profile.lastSeed = currentSeed; persist(); sfx('ui'); scene.scene.start('play', { seed: currentSeed });
      }, false);
      makeButton(this, 145, 628, 140, 40, 'CYCLE SKIN', function () {
        var idx = 0;
        for (i = 0; i < SKINS.length; i++) if (SKINS[i].id === profile.skin) idx = i;
        for (i = 1; i <= SKINS.length; i++) { var next = SKINS[(idx + i) % SKINS.length]; if (profile.unlocked[next.id]) { profile.skin = next.id; persist(); scene.scene.restart(); return; } }
      }, false);
      makeButton(this, 285, 628, 140, 40, 'SETTINGS', function () { kit.openSettings(); }, false);
      text(this, 215, 704, profile.tutorialDone ? 'TOUCH: FLIP  ·  DRAG PLUNGER  ·  SWIPE TO NUDGE' : 'FIRST RUN: AN INTERACTIVE COACH WILL GUIDE YOUR FIRST BALL', 10, '#8db6c8');
      text(this, 215, 756, '3 BALLS  ·  MISSION JACKPOTS  ·  MULTIBALL', 9, '#5f8095');
      text(this, 215, 834, 'A GREENGUARD FLEET F5 ORIGINAL', 9, '#45677b');
      if (pendingForce && pendingForce !== 'title') { var f = pendingForce; pendingForce = null; scene.time.delayedCall(30, function () { scene.scene.start('play', { seed: currentSeed, force: f }); }); }
    }
  };

  function makeRun(seed, table) {
    var balls = [], i;
    for (i = 0; i < MAX_BALLS; i++) balls.push({ active: false, x: 381, y: 820, vx: 0, vy: 0, r: 9, state: 'dead', rampDist: 0, hold: 0, holeCooldown: 0, still: 0, prevX: 381, prevY: 820, spinnerInside: [] });
    return {
      phase: 'idle', seed: seed, progression: table.progression, score: 0, ballNumber: 1, ballsLeft: 3, balls: balls, activeBalls: 0,
      clock: 0, multiplier: 1, tilt: false, tiltTimer: 0, drainTimer: 0, nudges: [], nudgeFlash: 0, plungerPower: 0, plungerPointer: null,
      keyboardPlunge: false, keyboardPrev: false, leftPrev: false, rightPrev: false, mutePrev: false, newPrev: false, touchLeft: 0, touchRight: 0, bumperHits: 0, lockHits: 0,
      bonusHits: 0, missionIndex: 0, mission: { on: false, time: 0, kind: '', need: 0, progress: 0, label: '' },
      banner: null, tutorial: { step: profile.tutorialDone ? 3 : 0, flash: 0, age: 0 }, multiball: false, multiballAwarded: false,
      skin: skinById(profile.skin), best: profile.seedBests[String(seed)] || 0
    };
  }
  function resetBall(ball, state) {
    ball.active = true; ball.x = 381; ball.y = 820; ball.vx = 0; ball.vy = 0; ball.state = state || 'ready';
    ball.rampDist = 0; ball.hold = 0; ball.holeCooldown = 0; ball.still = 0; ball.spinnerInside.length = 0; ball.prevX = ball.x; ball.prevY = ball.y;
  }

  var PlayScene = {
    key: 'play',
    create: function (data) {
      this.cameras.main.setZoom(RETINA_FACTOR);
      var seed = data && data.seed != null ? ((Number(data.seed) >>> 0) || DEFAULT_SEED) : currentSeed;
      currentSeed = seed; profile.lastSeed = seed; persist();
      Game.play = this; Game.title = null; this.lifecyclePaused = false; this.acc = 0; this.fxSeed = seed ^ 0x9e3779b9;
      this.table = SS.generateTable(seed); this.run = makeRun(seed, this.table); this.claims = new Map(); this.fx = []; this.rings = [];
      this.chipQueue = []; this.chipTimer = null; this.chipTween = null; this.bannerTimer = null;
      this.buildView(); this.bindInput(); this.serveFirst();
      if (data && data.force) this.forceMode(data.force);
      else if (pendingForce && pendingForce !== 'title') { var f = pendingForce; pendingForce = null; this.forceMode(f); }
      syncDebug(this.run, this.run.balls[0]);
    },
    buildView: function () {
      var scene = this, skin = this.run.skin, i, v;
      this.add.image(0, 0, 'board-' + skin.id).setOrigin(0).setDepth(0);
      bakeTable(this, this.table, skin);
      this.add.image(0, 0, 'table-layout').setOrigin(0).setDepth(1);
      this.views = { bumpers: [], targets: [], spinners: [], bonus: [], balls: [], particles: [], rings: [], labels: [], slingFx: [] };
      this.views.rampFx = this.add.graphics().setDepth(7);
      for (i = 0; i < this.table.slings.length; i++) this.views.slingFx.push(this.add.graphics().setDepth(7));
      this.views.kickback = this.add.graphics().setDepth(8);
      for (i = 0; i < this.table.bumpers.length; i++) { v = this.add.image(this.table.bumpers[i].x, this.table.bumpers[i].y, 'bumper').setDepth(8); this.views.bumpers.push(v); }
      for (i = 0; i < this.table.targets.length; i++) {
        v = this.add.image(this.table.targets[i].x, this.table.targets[i].y, 'target').setDepth(9).setScale(0.72);
        if (this.table.targets[i].seg.x1 === this.table.targets[i].seg.x2) v.setRotation(Math.PI / 2);
        this.views.targets.push(v);
      }
      for (i = 0; i < this.table.spinners.length; i++) { v = this.add.image(this.table.spinners[i].x, this.table.spinners[i].y, 'spinner').setDepth(9); this.views.spinners.push(v); }
      for (i = 0; i < this.table.bonusLights.length; i++) { v = this.add.image(this.table.bonusLights[i].x, this.table.bonusLights[i].y, 'lamp').setDepth(9); this.views.bonus.push(v); }
      this.views.hole = this.add.image(this.table.hole.x, this.table.hole.y, 'hole').setDepth(10);
      this.views.lock = this.table.lock ? this.add.image(this.table.lock.x, this.table.lock.y, 'lock').setDepth(10) : null;
      for (i = 0; i < MAX_BALLS; i++) this.views.balls.push(this.add.image(381, 820, 'ball').setDepth(20));
      this.views.flipperL = this.add.image(this.table.flippers.left.x, this.table.flippers.left.y, 'flipper-rest').setOrigin(0.12, 0.5).setScale(0.8, 1).setDepth(18);
      this.views.flipperR = this.add.image(this.table.flippers.right.x, this.table.flippers.right.y, 'flipper-rest').setOrigin(0.12, 0.5).setFlipX(true).setScale(0.8, 1).setDepth(18);
      for (i = 0; i < MAX_PARTICLES; i++) { v = this.add.image(0, 0, 'spark').setVisible(false).setDepth(30).setBlendMode(Phaser.BlendModes.ADD); this.views.particles.push(v); this.fx.push({ life: 0, max: 0, x: 0, y: 0, vx: 0, vy: 0, color: skin.rail, size: 0.5, style: 'spark' }); }
      for (i = 0; i < MAX_RINGS; i++) { v = this.add.image(0, 0, 'ring').setVisible(false).setDepth(29).setBlendMode(Phaser.BlendModes.ADD); this.views.rings.push(v); this.rings.push({ life: 0, max: 0, x: 0, y: 0, scale: 1, color: skin.rail }); }
      this.createHud();
    },
    createHud: function () {
      var skin = this.run.skin, scene = this, i;
      this.hud = {};
      this.hud.score = text(this, 18, 15, '0', 26, '#eaffff', 0);
      this.hud.ball = text(this, 160, 15, '● 1/3', 14, '#eaffff', 0);
      this.hud.mult = text(this, 160, 41, '×1', 14, '#ffcf72', 0);
      this.hud.nudge = text(this, 246, 16, '↯', 18, '#7293a8', 0);
      this.hud.nudgeDots = [];
      for (i = 0; i < 4; i++) this.hud.nudgeDots.push(this.add.rectangle(263 + i * 12, 22, 8, 10, skin.hot, 0.22).setDepth(12));
      this.hud.mode = text(this, 215, 68, '', 14, '#8db6c8');
      this.hud.missionBar = this.add.rectangle(215, 86, 250, 4, skin.hot, 0).setOrigin(0.5).setDepth(12).setVisible(false);
      this.hud.plungerTrack = this.add.rectangle(386, 780, 9, 112, 0x07131f, 0.9).setStrokeStyle(1, skin.rail, 0.7).setDepth(12);
      this.hud.plungerBand = this.add.rectangle(386, 787, 15, 18, 0xffcf72, 0.16).setDepth(12);
      this.hud.plungerFill = this.add.rectangle(386, 840, 7, 0, skin.hot, 0.9).setOrigin(0.5, 1).setDepth(13);
      this.hud.plungerKnob = this.add.rectangle(386, 840, 17, 4, 0xeaffff, 0.9).setDepth(13);
      this.hud.menu = makeButton(this, 345, 19, 30, 30, '≡', function () { scene.clearInput(); scene.scene.start('title'); }, false, 44, 44, 20).setDepth(50);
      this.hud.new = makeButton(this, 389, 19, 30, 30, '↻', function () { scene.newTable(); }, false, 44, 44, 20).setDepth(50);
      this.tutorialView = this.add.container(215, 110).setDepth(45);
      this.tutorialBg = this.add.rectangle(0, 0, 372, 28, 0x102d43, 0.78).setStrokeStyle(1, skin.hot, 0.55);
      this.tutorialText = text(this, 0, 0, '', 14, '#eaffff');
      this.tutorialView.add([this.tutorialBg, this.tutorialText]);
      this.chipView = this.add.container(16, 110).setDepth(46).setVisible(false);
      this.chipBg = this.add.rectangle(0, 0, 340, 28, skin.board, 0.92).setOrigin(0, 0.5).setStrokeStyle(1, skin.hot, 0.9);
      this.chipText = text(this, 12, 0, '', 14, '#eaffff', 0);
      this.chipView.add([this.chipBg, this.chipText]);
      this.bannerView = this.add.container(215, 430).setDepth(60).setVisible(false);
      this.bannerBg = this.add.rectangle(0, 0, 300, 98, skin.board, 0.96).setStrokeStyle(3, skin.hot, 0.95);
      this.bannerTitle = text(this, 0, -17, '', 25, '#eaffff');
      this.bannerSub = text(this, 0, 18, '', 10, '#ffcf72');
      this.bannerView.add([this.bannerBg, this.bannerTitle, this.bannerSub]);
      this.gameoverPanel = this.add.container(215, 650).setDepth(55).setVisible(false);
      this.gameoverTitle = text(this, 0, -92, 'TABLE COMPLETE', 10, '#8db6c8');
      this.gameoverScore = text(this, 0, -66, 'SCORE 0', 20, '#eaffff');
      this.gameoverBest = text(this, 0, -40, 'TABLE BEST 0', 14, '#ffcf72');
      this.sameButton = makeButton(this, 0, 10, 255, 42, 'PLAY THIS TABLE', function () { scene.beginReplay(currentSeed); }, true);
      this.newButton = makeButton(this, 0, 66, 255, 38, 'NEW TABLE / RESEED', function () { scene.newTable(); }, false);
      this.gameoverPanel.add([this.gameoverTitle, this.gameoverScore, this.gameoverBest, this.sameButton, this.newButton]);
    },
    bindInput: function () {
      var scene = this;
      try { this.input.addPointer(4); } catch (e) {}
      this.input.on('pointerdown', function (pointer) { scene.pointerDown(pointer); });
      this.input.on('pointermove', function (pointer) { scene.pointerMove(pointer); });
      this.input.on('pointerup', function (pointer) { scene.pointerUp(pointer, false); });
      this.input.on('pointerupoutside', function (pointer) { scene.pointerUp(pointer, true); });
      this.input.on('pointercancel', function (pointer) { scene.pointerUp(pointer, true); });
    },
    pointerData: function (pointer) {
      var id = pointer.id, q = this.claims.get(id);
      if (q) { q.x = pointer.x; q.y = pointer.y; return q; }
      q = kit.input.pointers.get(id);
      if (!q) { q = { x: pointer.x, y: pointer.y, startX: pointer.x, startY: pointer.y, downAt: performance.now() }; kit.input.pointers.set(id, q); }
      q.x = pointer.x; q.y = pointer.y; return q;
    },
    pointerDown: function (pointer) {
      if (this.lifecyclePaused || this.run.phase !== 'play' || pointer.y < 145) return;
      var id = pointer.id, q = this.pointerData(pointer);
      if (this.claims.has(id)) return;
      if (this.run.plungerPointer == null && this.run.balls[0].state === 'ready' && pointer.x > 320 && pointer.y > 700) {
        q.role = 'plunge'; q.startX = pointer.x; q.startY = pointer.y; q.downAt = performance.now(); q.swiped = false;
        this.claims.set(id, q); this.run.plungerPointer = id; this.run.plungerPower = 0; return;
      }
      q.role = pointer.x < W * 0.5 ? 'left' : 'right'; q.startX = pointer.x; q.startY = pointer.y; q.downAt = performance.now(); q.swiped = false;
      this.claims.set(id, q); if (q.role === 'left') this.run.touchLeft++; else this.run.touchRight++; this.setFlipper(q.role, true); sfx('flipper', { volume: 0.65 });
      if (this.run.tutorial.step === 0) this.advanceTutorial();
    },
    pointerMove: function (pointer) {
      var q = this.claims.get(pointer.id); if (!q) return;
      q.x = pointer.x; q.y = pointer.y;
      var dx = pointer.x - q.startX, dy = pointer.y - q.startY;
      if (q.role === 'plunge') this.run.plungerPower = clamp(dy / 145, 0, 1);
      else if (!q.swiped && Math.sqrt(dx * dx + dy * dy) > 36 && performance.now() - q.downAt < 340) { q.swiped = true; this.nudge(dx, dy); }
    },
    pointerUp: function (pointer, canceled) {
      var id = pointer.id, q = this.claims.get(id); if (!q) return;
      this.claims.delete(id); kit.input.pointers.delete(id);
      if (q.role === 'plunge') { if (this.run.plungerPointer === id) { this.run.plungerPointer = null; if (!canceled) this.launch(this.run.plungerPower); this.run.plungerPower = 0; } }
      else { if (q.role === 'left') this.run.touchLeft = Math.max(0, this.run.touchLeft - 1); else this.run.touchRight = Math.max(0, this.run.touchRight - 1); this.releaseFlipper(q.role); }
    },
    setFlipper: function (side, on) { if (side === 'left') this.table.flippers.left.on = on; else this.table.flippers.right.on = on; },
    releaseFlipper: function (side) {
      this.setFlipper(side, side === 'left' ? this.run.touchLeft > 0 : this.run.touchRight > 0);
    },
    clearInput: function () {
      this.claims.clear(); kit.input.clearAll(); kit.input.gamepad.clear(); this.run.plungerPointer = null; this.run.keyboardPlunge = false; this.run.touchLeft = 0; this.run.touchRight = 0; this.setFlipper('left', false); this.setFlipper('right', false);
    },
    restartRun: function (seed) { this.scene.restart({ seed: seed }); },
    beginReplay: function (seed) { this.run.phase = 'replay'; this.clearInput(); this.scene.restart({ seed: seed }); },
    newTable: function () { currentSeed = SS.hashSeed(String(Date.now()) + ':' + (currentSeed + 17)); profile.lastSeed = currentSeed; persist(); this.run.phase = 'replay'; this.clearInput(); this.scene.restart({ seed: currentSeed }); },
    serveFirst: function () {
      var run = this.run, i;
      for (i = 0; i < run.balls.length; i++) run.balls[i].active = false;
      run.phase = 'play'; resetBall(run.balls[0], 'ready'); run.activeBalls = 1; run.tilt = false; run.nudges.length = 0; run.tutorial.age = 0; this.table.hole.lit = false; this.table.kickback.armed = true;
      this.showBanner('BALL 1', 'DRAG DOWN THE RIGHT LANE TO PLUNGE', this.run.skin.hot, 1.45);
    },
    launch: function (power) {
      var b = this.run.balls[0]; if (this.run.phase !== 'play' || b.state !== 'ready' || this.run.tilt) return;
      power = clamp(power == null ? 0 : power, 0, 1); b.state = 'live'; b.vy = -(1260 + 540 * power); b.vx = -34 - 52 * power; this.run.plungerPower = 0;
      sfx('launch'); this.burst(381, 828, this.run.skin.hot, 13, 1, 'launch'); if (this.run.tutorial.step === 1) this.advanceTutorial();
    },
    updateKeyboard: function () {
      var run = this.run, pad = kit.input.gamepad.poll(), left = kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA') || kit.input.keyDown('KeyZ') || kit.input.keyDown('ShiftLeft') || pad.left, right = kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD') || kit.input.keyDown('Slash') || kit.input.keyDown('ShiftRight') || pad.right, plunge = kit.input.keyDown('Space') || kit.input.keyDown('Enter') || pad.launch, newTableKey = kit.input.keyDown('KeyN');
      if (left && !run.leftPrev) { sfx('flipper', { volume: 0.65 }); if (run.tutorial.step === 0) this.advanceTutorial(); }
      if (right && !run.rightPrev) { sfx('flipper', { volume: 0.65 }); if (run.tutorial.step === 0) this.advanceTutorial(); }
      this.setFlipper('left', left || run.touchLeft > 0);
      this.setFlipper('right', right || run.touchRight > 0);
      if ((kit.input.keyDown('KeyQ') && !run.qPrev) || (kit.input.keyDown('KeyE') && !run.ePrev) || (kit.input.keyDown('KeyW') && !run.wPrev) || pad.pressed('nudgeLeft') || pad.pressed('nudgeRight') || pad.pressed('nudgeUp')) this.nudge(pad.pressed('nudgeLeft') ? -1 : (pad.pressed('nudgeRight') ? 1 : (kit.input.keyDown('KeyQ') ? -1 : (kit.input.keyDown('KeyE') ? 1 : 0))), -0.75);
      if (plunge && !run.keyboardPrev && run.balls[0].state === 'ready') run.keyboardPlunge = true;
      if (run.keyboardPlunge && plunge) run.plungerPower = clamp(run.plungerPower + STEP / 1.05, 0, 1);
      if (run.keyboardPlunge && !plunge) { run.keyboardPlunge = false; this.launch(run.plungerPower); }
      if ((newTableKey && !run.newPrev) || pad.pressed('newGame')) this.newTable();
      if ((kit.input.keyDown('KeyM') && !run.mutePrev) || pad.pressed('mute')) { kit.audio.setMute(!kit.audio.prefs.mute); sfx('ui'); }
      run.leftPrev = left; run.rightPrev = right; run.keyboardPrev = plunge; run.qPrev = kit.input.keyDown('KeyQ'); run.ePrev = kit.input.keyDown('KeyE'); run.wPrev = kit.input.keyDown('KeyW');
      run.newPrev = newTableKey; run.mutePrev = kit.input.keyDown('KeyM'); pad.commit();
    },
    nudge: function (dx, dy) {
      var run = this.run, length = Math.sqrt(dx * dx + dy * dy) || 1, now = run.clock, i, live = false;
      if (run.phase !== 'play' || run.tilt) return;
      for (i = 0; i < run.balls.length; i++) if (run.balls[i].active && run.balls[i].state === 'live') live = true;
      if (!live) return;
      dx /= length; dy /= length; run.nudges.push(now);
      for (i = run.nudges.length - 1; i >= 0; i--) if (now - run.nudges[i] > 2.6) run.nudges.splice(i, 1);
      for (i = 0; i < run.balls.length; i++) if (run.balls[i].active && run.balls[i].state === 'live') { run.balls[i].vx += dx * 185; run.balls[i].vy += dy * 105 - 56; }
      run.nudgeFlash = 0.3; kit.juice.shake(4, 120); sfx('target', { volume: 0.36 });
      if (run.tutorial.step === 2) this.advanceTutorial();
      if (run.nudges.length >= 4) { run.tilt = true; run.phase = 'tilt'; run.tiltTimer = 0.22; this.setFlipper('left', false); this.setFlipper('right', false); this.showChip('TILT', 'BALL DRAIN', 0xff5c91, 0.9); sfx('drain', { volume: 0.9 }); kit.juice.shake(10, 260); }
    },
    advanceTutorial: function () {
      var tut = this.run.tutorial;
      tut.step = Math.min(3, tut.step + 1); tut.flash = 1; tut.age = 0;
      if (tut.step >= 3) { profile.tutorialDone = true; persist(); }
    },
    addScore: function (amount, x, y, label, color) {
      if (this.run.tilt) return;
      this.run.score += Math.floor(amount); unlockForScore(this.run.score);
    },
    random: function () { this.fxSeed = (Math.imul(this.fxSeed, 1664525) + 1013904223) >>> 0; return this.fxSeed / 4294967296; },
    burst: function (x, y, color, count, force, style) {
      var made = 0, i, p, a, speed;
      for (i = 0; i < this.fx.length && made < count; i++) {
        p = this.fx[i]; if (p.life > 0) continue;
        a = this.random() * TAU; speed = (90 + this.random() * 230) * (force || 1);
        p.life = p.max = 0.26 + this.random() * 0.38; p.x = x; p.y = y; p.vx = Math.cos(a) * speed; p.vy = Math.sin(a) * speed; p.color = color; p.size = 0.5 + this.random() * 0.8; p.style = style || 'spark'; made++;
      }
    },
    ring: function (x, y, color, scale) {
      var i, r;
      for (i = 0; i < this.rings.length; i++) if (this.rings[i].life <= 0) { r = this.rings[i]; break; }
      if (!r) r = this.rings[0];
      r.life = r.max = 0.55; r.x = x; r.y = y; r.scale = scale || 1; r.color = color;
    },
    handleHit: function (hit, ball) {
      var obj = hit.obj, run = this.run, table = this.table, i, all;
      if (obj.kind === 'target' && obj.target && !obj.target.down) {
        obj.target.down = true; obj.down = true; obj.target.flash = 0.4; this.addScore(650 * run.multiplier, obj.target.x, obj.target.y, 'TARGET'); this.burst(obj.target.x, obj.target.y, obj.target.bank.color, 12, 1, 'target'); sfx('target'); this.missionEvent('target', obj.target.x, obj.target.y);
        all = true; for (i = 0; i < obj.target.bank.targets.length; i++) if (!obj.target.bank.targets[i].down) all = false;
        if (all) this.clearBank(obj.target.bank);
      } else if (obj.kind === 'sling') { obj.sling.flash = 0.24; this.addScore(75 * run.multiplier, ball.x, ball.y, ''); this.burst(ball.x, ball.y, run.skin.hot, 7, 0.8, 'sling'); }
      else if (obj.kind === 'bumper') this.bumperHit(obj);
      else if (obj.kind === 'bonus') this.bonusHit(obj);
      else if (obj.kind === 'lock') this.lockHit(obj);
    },
    bumperHit: function (bumper) {
      var run = this.run; bumper.flash = 0.34; run.bumperHits++; this.addScore(bumper.value * run.multiplier, bumper.x, bumper.y, '+' + bumper.value); this.burst(bumper.x, bumper.y, bumper.color, 14, 1.15, 'bumper'); this.ring(bumper.x, bumper.y, bumper.color, 0.65); sfx('bumper'); this.missionEvent('bumper', bumper.x, bumper.y); if (run.bumperHits % 8 === 0) this.triggerMultiball('BUMPER JACKPOT');
    },
    bonusHit: function (bonus) {
      if (bonus.lit) return;
      bonus.lit = true; bonus.flash = 0.45; this.run.bonusHits++; this.addScore(900 * this.run.multiplier, bonus.x, bonus.y, 'BONUS LIT'); this.burst(bonus.x, bonus.y, this.run.skin.hot, 10, 0.9, 'bonus'); sfx('target'); this.missionEvent('bonus', bonus.x, bonus.y);
      var i, all = true; for (i = 0; i < this.table.bonusLights.length; i++) if (!this.table.bonusLights[i].lit) all = false;
      if (all) { this.addScore(15000 * this.run.multiplier, 215, 560, 'BONUS BANK'); this.triggerMultiball('BONUS BANK'); for (i = 0; i < this.table.bonusLights.length; i++) this.table.bonusLights[i].lit = false; }
    },
    lockHit: function (lock) {
      if (lock.locked) return;
      lock.flash = 0.5; lock.hits++; this.run.lockHits = lock.hits; this.addScore(1800 * this.run.multiplier, lock.x, lock.y, 'LOCK ' + lock.hits + '/' + lock.need); this.burst(lock.x, lock.y, this.run.skin.hot, 12, 1, 'lock'); sfx('target');
      if (lock.hits >= lock.need) { lock.locked = true; lock.down = true; this.triggerMultiball('LOCK COMPLETE'); }
    },
    clearBank: function (bank) {
      if (bank.clear) return;
      bank.clear = true; bank.resetAt = this.run.clock + 1.8; bank.flash = 0.75; this.addScore(6500 * this.run.multiplier, bank.x, bank.y, 'BANK CLEAR'); this.burst(bank.x, bank.y, bank.color, 28, 1.2, 'bank'); this.ring(bank.x, bank.y, bank.color, 1.1); sfx('target', { volume: 0.9 }); kit.juice.shake(6, 180); this.missionEvent('bank', bank.x, bank.y);
      if (!this.run.mission.on) { this.table.hole.lit = true; this.table.kickback.armed = true; this.showChip('HOLE LIT', 'SHOOT RING', this.run.skin.hot, 1.0); this.burst(this.table.hole.x, this.table.hole.y, this.run.skin.hot, 20, 1, 'hole'); }
    },
    missionEvent: function (kind, x, y) {
      var m = this.run.mission;
      if (!m.on || m.kind !== kind) return;
      m.progress++; this.addScore(1200 * this.run.multiplier, x, y, 'SHOT ' + m.progress + '/' + m.need, this.run.skin.hot);
      if (m.progress >= m.need) this.finishMission();
    },
    beginMission: function () {
      var m = this.run.mission, def = MISSIONS[this.run.missionIndex % MISSIONS.length];
      this.run.missionIndex++; m.on = true; m.time = 60; m.kind = def.kind; m.need = def.need; m.progress = 0; m.label = def.label; this.table.hole.lit = false;
      this.showChip('MISSION', MISSION_SHORT[def.kind] + ' · 60s', this.run.skin.hot, 1.0); sfx('jackpot'); kit.audio.music('intensity', 650); kit.juice.shake(6, 220);
    },
    finishMission: function () {
      var run = this.run, amount = 24000 * run.multiplier;
      this.addScore(amount, 215, 430, 'JACKPOT +' + fmt(amount), this.run.skin.hot); this.showChip('JACKPOT', '×' + run.multiplier + ' · +' + fmt(amount), this.run.skin.hot, 1.0); this.burst(215, 430, run.skin.hot, 60, 1.6, 'jackpot'); this.ring(215, 430, run.skin.hot, 2.2); sfx('jackpot'); kit.juice.shake(15, 480); kit.juice.hitStop(75);
      run.multiplier = Math.min(4, run.multiplier + 1); run.mission.on = false; run.mission.time = 0; kit.audio.music('music', 650); unlockForScore(run.score); persist();
    },
    triggerMultiball: function (reason) {
      var run = this.run, i, b;
      if (run.multiball || run.phase !== 'play') return;
      run.multiball = true; run.multiballAwarded = true; this.addScore(12000 * run.multiplier, 215, 430, 'MULTIBALL');
      for (i = 0; i < run.balls.length; i++) { b = run.balls[i]; resetBall(b, 'live'); b.x = 173 + i * 42; b.y = 330; b.vx = i === 0 ? -420 : (i === 2 ? 420 : 0); b.vy = -700; }
      run.activeBalls = 3; this.showChip('MULTIBALL', '3 BALLS LIVE', run.skin.hot, 1.0); this.burst(215, 430, run.skin.hot, 46, 1.4, 'multiball'); this.ring(215, 430, run.skin.hot, 1.7); sfx('multiball'); kit.juice.shake(16, 480); kit.juice.hitStop(65);
    },
    drain: function (ball) {
      if (!ball.active || ball.state === 'dead') return;
      ball.active = false; ball.state = 'dead'; ball.vx = 0; ball.vy = 0; this.run.activeBalls--;
      this.burst(ball.x, 846, 0xff5c91, 18, 1, 'drain'); sfx('drain', { volume: 0.8 });
      if (this.run.activeBalls > 0) return;
      this.run.multiball = false; this.run.mission.on = false; this.run.phase = 'drain'; this.run.drainTimer = 0.82; this.run.tilt = false;
      if (this.run.ballsLeft <= 1) kit.audio.music('intensity', 500);
      this.showBanner('BALL DRAIN', this.run.ballsLeft > 1 ? 'NEXT BALL LOADING' : 'LAST BALL · KEEP THE TABLE ALIVE', 0xff5c91, 0.8);
    },
    finishDrain: function () {
      var i;
      this.run.ballsLeft--;
      if (this.run.ballsLeft <= 0) { this.endGame(); return; }
      this.run.phase = 'play'; this.run.ballNumber++; this.run.tilt = false; this.run.nudges.length = 0; this.run.tutorial.age = 0; this.table.kickback.armed = true; this.table.kickback.cooldown = 0;
      for (i = 0; i < this.run.balls.length; i++) this.run.balls[i].active = false;
      resetBall(this.run.balls[0], 'ready'); this.run.activeBalls = 1; kit.audio.music('music', 500); this.showBanner('BALL ' + this.run.ballNumber, '3 BALLS · BANK LIGHTS STAY LIT', this.run.skin.hot, 1.65);
    },
    endGame: function () {
      var run = this.run, key = String(currentSeed), runBest = profile.seedBests[key] || 0, keys, bestText; run.phase = 'gameover'; if (run.score > runBest) { run.best = run.score; profile.seedBests[key] = run.score; keys = Object.keys(profile.seedBests); if (keys.length > 64) delete profile.seedBests[keys[0]]; } if (run.score > profile.best) profile.best = run.score; profile.lastSeed = currentSeed; unlockForScore(run.score); bestText = profile.seedBests[key] || runBest; persist(); setTextIfChanged(this.gameoverScore, 'SCORE ' + fmt(run.score)); setTextIfChanged(this.gameoverBest, 'TABLE BEST ' + fmt(bestText)); this.gameoverPanel.setVisible(true); this.showBanner('GAME OVER', '', run.skin.hot, 3.2); sfx('jackpot'); kit.audio.music('music', 700); kit.juice.shake(12, 360);
    },
    enterRamp: function (ball) {
      var ramp = this.table.ramp, speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (!ramp || ball.state !== 'live' || speed < 430 || ball.vy >= 0) return false;
      if (ball.prevY > ramp.mouth.y && ball.y <= ramp.mouth.y && ball.x > ramp.mouth.x1 - 4 && ball.x < ramp.mouth.x2 + 4) { ball.state = 'ramp'; ball.rampDist = 0; ball.vx = 0; ball.vy = 0; ramp.flash = 0.5; sfx('target'); this.addScore(2800 * this.run.multiplier, ball.x, ball.y, 'OVERPASS'); this.missionEvent('ramp', ball.x, ball.y); return true; }
      return false;
    },
    kickback: function (ball) {
      var lamp = this.table.kickback;
      if (!lamp.armed || lamp.cooldown > 0) return false;
      lamp.armed = false; lamp.cooldown = 4.5; lamp.flash = 0.8; lamp.uses++;
      ball.x = 102; ball.y = 768; ball.vx = 260; ball.vy = -760; ball.still = 0;
      this.addScore(1800 * this.run.multiplier, lamp.x, lamp.y, 'KICKBACK'); this.burst(lamp.x, lamp.y, this.run.skin.hot, 22, 1.25, 'kickback'); this.ring(lamp.x, lamp.y, this.run.skin.hot, 0.8); sfx('kickback'); kit.juice.shake(5, 150);
      return true;
    },
    sensors: function (ball) {
      var table = this.table, run = this.run, i, sp, d, hole = table.hole;
      if (ball.state !== 'live') return;
      if (this.enterRamp(ball)) return;
      if (ball.prevY < table.kickback.y && ball.y >= table.kickback.y && ball.x > 28 && ball.x < 98 && this.kickback(ball)) return;
      for (i = 0; i < table.spinners.length; i++) { sp = table.spinners[i]; d = Math.sqrt((ball.x - sp.x) * (ball.x - sp.x) + (ball.y - sp.y) * (ball.y - sp.y)); if (d < sp.r + 12) { if (!ball.spinnerInside[i]) { ball.spinnerInside[i] = true; sp.vel += (ball.vx * Math.cos(sp.angle) + ball.vy * Math.sin(sp.angle)) * 0.08; sp.flash = 0.25; } } else ball.spinnerInside[i] = false; }
      if (ball.holeCooldown <= 0 && Math.sqrt((ball.x - hole.x) * (ball.x - hole.x) + (ball.y - hole.y) * (ball.y - hole.y)) < hole.r + 4) { ball.state = 'hole'; ball.hold = 0.46; ball.x = hole.x; ball.y = hole.y; ball.vx = 0; ball.vy = 0; hole.flash = 0.5; sfx('target'); if (hole.lit && !run.mission.on) this.beginMission(); else if (!run.mission.on) this.addScore(1200 * run.multiplier, hole.x, hole.y, 'SAUCER'); else this.missionEvent('hole', hole.x, hole.y); }
    },
    collideBall: function (ball) {
      var table = this.table, i, hit;
      for (i = 0; i < table.segs.length; i++) { hit = SS.hitSegment(ball, table.segs[i]); if (hit) this.handleHit(hit, ball); }
      for (i = 0; i < table.circles.length; i++) { hit = SS.hitCircle(ball, table.circles[i]); if (hit) this.handleHit(hit, ball); }
      hit = SS.hitFlipper(ball, table.flippers.left); if (hit && hit.speed > 170) { this.burst(ball.x, ball.y, this.run.skin.rail, 5, 0.65, 'flipper'); sfx('flipper', { volume: 0.8, rate: 1.05 }); }
      hit = SS.hitFlipper(ball, table.flippers.right); if (hit && hit.speed > 170) { this.burst(ball.x, ball.y, this.run.skin.rail, 5, 0.65, 'flipper'); sfx('flipper', { volume: 0.8, rate: 1.08 }); }
    },
    stepBall: function (ball, dt) {
      var i, sp, pathPoint;
      if (!ball.active) return;
      if (ball.state === 'ready') { ball.x = 381; ball.y = 820; ball.vx = 0; ball.vy = 0; return; }
      if (ball.state === 'hole') { ball.hold -= dt; if (ball.hold <= 0) { ball.state = 'live'; ball.x = this.table.hole.x + Math.cos(this.table.hole.ejectAngle) * 30; ball.y = this.table.hole.y + Math.sin(this.table.hole.ejectAngle) * 30; ball.vx = Math.cos(this.table.hole.ejectAngle) * 720; ball.vy = Math.sin(this.table.hole.ejectAngle) * 720; ball.holeCooldown = 0.55; } return; }
      if (ball.state === 'ramp') { ball.rampDist += 740 * dt; if (ball.rampDist >= this.table.ramp.length) { pathPoint = this.table.ramp.path[this.table.ramp.path.length - 1]; ball.x = pathPoint[0]; ball.y = pathPoint[1]; ball.state = 'live'; ball.vx = -260; ball.vy = 460; this.burst(ball.x, ball.y, this.run.skin.rail, 12, 1, 'ramp'); } else { pathPoint = SS.samplePath(this.table.ramp.path, this.table.ramp.cumulative, ball.rampDist); ball.x = pathPoint[0]; ball.y = pathPoint[1]; } return; }
      if (ball.holeCooldown > 0) ball.holeCooldown -= dt;
      ball.prevX = ball.x; ball.prevY = ball.y; ball.vy += GRAVITY * dt; ball.vx *= 1 - 0.06 * dt; ball.vy *= 1 - 0.06 * dt; sp = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy); if (sp > MAX_SPEED) { ball.vx *= MAX_SPEED / sp; ball.vy *= MAX_SPEED / sp; }
      ball.x += ball.vx * dt; ball.y += ball.vy * dt; this.collideBall(ball); this.sensors(ball);
      if (ball.state === 'live' && (ball.y > 875 || ball.x < 6 || ball.x > 424)) this.drain(ball);
      if (ball.state === 'live' && Math.sqrt((ball.x - ball.prevX) * (ball.x - ball.prevX) + (ball.y - ball.prevY) * (ball.y - ball.prevY)) < 0.35) { ball.still += dt; if (ball.still > 1.4) { ball.vx += (this.random() - 0.5) * 260; ball.vy -= 250; ball.still = 0; } } else ball.still = 0;
    },
    decayTable: function (dt) {
      var run = this.run, table = this.table, i, ti;
      for (i = 0; i < table.bumpers.length; i++) table.bumpers[i].flash = Math.max(0, table.bumpers[i].flash - dt * 3.2);
      for (i = 0; i < table.targets.length; i++) table.targets[i].flash = Math.max(0, table.targets[i].flash - dt * 3.2);
      for (i = 0; i < table.bonusLights.length; i++) table.bonusLights[i].flash = Math.max(0, table.bonusLights[i].flash - dt * 3.2);
      for (i = 0; i < table.banks.length; i++) table.banks[i].flash = Math.max(0, table.banks[i].flash - dt * 2.3);
      for (i = 0; i < table.spinners.length; i++) table.spinners[i].flash = Math.max(0, table.spinners[i].flash - dt * 4);
      for (i = 0; i < table.slings.length; i++) table.slings[i].flash = Math.max(0, table.slings[i].flash - dt * 3);
      table.ramp.flash = Math.max(0, table.ramp.flash - dt * 2.5); table.hole.flash = Math.max(0, table.hole.flash - dt * 2.3);
      if (table.lock) table.lock.flash = Math.max(0, table.lock.flash - dt * 2.3);
      table.kickback.flash = Math.max(0, table.kickback.flash - dt * 3); table.kickback.cooldown = Math.max(0, table.kickback.cooldown - dt);
      for (i = 0; i < table.banks.length; i++) if (table.banks[i].clear && table.banks[i].resetAt && run.clock >= table.banks[i].resetAt) { table.banks[i].clear = false; table.banks[i].resetAt = 0; for (ti = 0; ti < table.banks[i].targets.length; ti++) { table.banks[i].targets[ti].down = false; table.banks[i].targets[ti].seg.down = false; } }
      run.nudgeFlash = Math.max(0, run.nudgeFlash - dt); run.tutorial.flash = Math.max(0, run.tutorial.flash - dt * 2.8); run.tutorial.age += dt;
      for (i = run.nudges.length - 1; i >= 0; i--) if (run.clock - run.nudges[i] > 2.6) run.nudges.splice(i, 1);
    },
    step: function (dt) {
      var run = this.run, table = this.table, i, f, target, sp, diff, angleStep, turns;
      if (run.phase === 'idle' || run.phase === 'replay' || run.phase === 'gameover') { syncDebug(run, run.balls[0]); return; }
      run.clock += dt; this.decayTable(dt);
      if (run.phase === 'play') this.updateKeyboard();
      else { this.setFlipper('left', false); this.setFlipper('right', false); }
      for (i = 0; i < SIDE_KEYS.length; i++) {
        f = table.flippers[SIDE_KEYS[i]]; target = f.on && !run.tilt ? f.upAngle : f.restAngle; diff = target - f.angle; angleStep = 32 * dt;
        if (Math.abs(diff) <= angleStep) { f.omega = diff / dt; f.angle = target; }
        else { f.omega = (diff > 0 ? 32 : -32); f.angle += f.omega * dt; }
        if (f.on && Math.abs(f.omega) > 1) f.phase = 'strike'; else if (f.on) f.phase = 'held'; else if (Math.abs(f.omega) > 1) f.phase = 'recover'; else f.phase = 'rest';
      }
      if (run.phase === 'tilt') {
        run.tiltTimer -= dt;
        for (i = 0; i < run.balls.length; i++) if (run.balls[i].active && run.balls[i].state === 'live' && run.tiltTimer <= 0) this.drain(run.balls[i]);
        syncDebug(run, run.balls[0]); return;
      }
      if (run.phase === 'drain') {
        run.drainTimer -= dt; if (run.drainTimer <= 0) this.finishDrain();
        syncDebug(run, run.balls[0]); return;
      }
      if (run.phase !== 'play') { syncDebug(run, run.balls[0]); return; }
      for (i = 0; i < run.balls.length; i++) this.stepBall(run.balls[i], dt);
      for (i = 0; i < table.spinners.length; i++) { sp = table.spinners[i]; sp.rot += sp.vel * dt; sp.vel *= 1 - 1.5 * dt; if (Math.abs(sp.vel) < 0.03) sp.vel = 0; if (Math.abs(sp.rot) > Math.PI) { turns = Math.floor(Math.abs(sp.rot) / Math.PI); sp.rot -= (sp.rot > 0 ? 1 : -1) * turns * Math.PI; sp.turns += turns; this.addScore(120 * run.multiplier * turns, sp.x, sp.y, 'SPIN'); this.missionEvent('spinner', sp.x, sp.y); sfx('target', { volume: 0.22 }); } }
      if (run.mission.on) { run.mission.time -= dt; if (run.mission.time <= 0) { run.mission.on = false; kit.audio.music('music', 650); this.showChip('MISSION OVER', '', run.skin.hot, 0.9); } }
      syncDebug(run, run.balls[0]);
    },
    updateFx: function (dt) {
      var i, p, r;
      for (i = 0; i < this.fx.length; i++) { p = this.fx[i]; if (p.life <= 0) continue; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 470 * dt; p.vx *= 1 - 2.5 * dt; }
      for (i = 0; i < this.rings.length; i++) { r = this.rings[i]; if (r.life > 0) r.life -= dt; }
      for (i = 0; i < this.table.slings.length; i++) this.table.slings[i].flash = Math.max(0, this.table.slings[i].flash - dt * 3);
    },
    updateView: function (dt) {
      var skin = this.run.skin, table = this.table, i, p, v, r, active, j = kit.juice.frame();
      this.cameras.main.setScroll(-j.dx, -j.dy); if (!j.frozen) this.updateFx(dt);
      for (i = 0; i < table.bumpers.length; i++) { v = this.views.bumpers[i]; p = table.bumpers[i]; v.setScale(1 + p.flash * 0.12); setTintIfChanged(v, p.flash > 0 ? 0xffffff : p.color); }
      for (i = 0; i < table.targets.length; i++) { v = this.views.targets[i]; p = table.targets[i]; v.setVisible(!p.down || p.flash > 0); v.setAlpha(p.down ? 0.28 : 1); setTintIfChanged(v, p.flash > 0 ? 0xffffff : p.bank.color); }
      for (i = 0; i < table.spinners.length; i++) { v = this.views.spinners[i]; p = table.spinners[i]; v.setRotation(p.angle + p.rot); v.setScale(1 + p.flash * 0.10, 1); setTintIfChanged(v, p.flash > 0 ? 0xffffff : 0xffc763); }
      for (i = 0; i < table.bonusLights.length; i++) { v = this.views.bonus[i]; p = table.bonusLights[i]; v.setScale(p.lit ? 1.12 + p.flash * 0.12 : 1); setTintIfChanged(v, p.lit ? skin.hot : 0x637b95); }
      this.views.hole.setScale(table.hole.lit ? 1.12 + table.hole.flash * 0.24 + Math.sin(this.run.clock * 8) * 0.03 : 1); setTintIfChanged(this.views.hole, table.hole.lit ? skin.hot : 0x7693aa);
      if (this.views.lock) { this.views.lock.setVisible(!table.lock.locked); this.views.lock.setScale(1 + table.lock.flash * 0.15); setTintIfChanged(this.views.lock, table.lock.flash > 0 ? 0xffffff : skin.hot); }
      this.views.rampFx.clear(); if (table.ramp.flash > 0) { this.views.rampFx.lineStyle(12, skin.hot, table.ramp.flash * 0.45); this.views.rampFx.beginPath(); this.views.rampFx.moveTo(table.ramp.path[0][0], table.ramp.path[0][1]); for (i = 1; i < table.ramp.path.length; i++) this.views.rampFx.lineTo(table.ramp.path[i][0], table.ramp.path[i][1]); this.views.rampFx.strokePath(); }
      for (i = 0; i < table.slings.length; i++) { var sg = this.views.slingFx[i], spoints = table.slings[i].points, sf = table.slings[i].flash; sg.clear(); if (sf > 0) { sg.fillStyle(skin.hot, sf * 0.42); sg.beginPath(); sg.moveTo(spoints[0][0], spoints[0][1]); sg.lineTo(spoints[1][0], spoints[1][1]); sg.lineTo(spoints[2][0], spoints[2][1]); sg.closePath(); sg.fillPath(); sg.lineStyle(5, 0xffffff, sf * 0.85); sg.strokePath(); } }
      this.views.kickback.clear(); this.views.kickback.fillStyle(skin.hot, table.kickback.armed ? 0.24 + table.kickback.flash * 0.5 : 0.05); this.views.kickback.fillCircle(table.kickback.x, table.kickback.y, table.kickback.armed ? 16 + table.kickback.flash * 5 : 12); this.views.kickback.lineStyle(2, table.kickback.armed ? 0xffffff : 0x637b95, 0.85); this.views.kickback.strokeCircle(table.kickback.x, table.kickback.y, 15);
      for (i = 0; i < this.run.balls.length; i++) { active = this.run.balls[i]; v = this.views.balls[i]; v.setVisible(active.active); v.setPosition(active.x, active.y); v.setScale(active.state === 'ramp' ? 0.9 : 1); }
      this.views.flipperL.setTexture('flipper-' + table.flippers.left.phase); this.views.flipperR.setTexture('flipper-' + table.flippers.right.phase); this.views.flipperL.setRotation(table.flippers.left.angle); this.views.flipperR.setRotation(table.flippers.right.angle); setTintIfChanged(this.views.flipperL, this.run.tilt ? 0x5d6b7d : (table.flippers.left.on ? skin.hot : skin.rail)); setTintIfChanged(this.views.flipperR, this.run.tilt ? 0x5d6b7d : (table.flippers.right.on ? skin.hot : skin.rail));
      for (i = 0; i < this.fx.length; i++) { p = this.fx[i]; v = this.views.particles[i]; if (p.life <= 0) { v.setVisible(false); continue; } v.setTexture(p.style === 'streak' || p.style === 'ramp' || p.style === 'kickback' ? 'fx-streak' : (p.style === 'target' || p.style === 'lock' ? 'fx-diamond' : (p.style === 'drain' ? 'fx-dot' : 'spark'))); v.setVisible(true).setPosition(p.x, p.y).setRotation(Math.atan2(p.vy, p.vx)).setScale(p.size * (0.5 + p.life / p.max)); v.setAlpha(clamp(p.life / p.max, 0, 1)); setTintIfChanged(v, p.color); }
      for (i = 0; i < this.rings.length; i++) { r = this.rings[i]; v = this.views.rings[i]; if (r.life <= 0) { v.setVisible(false); continue; } v.setVisible(true).setPosition(r.x, r.y).setScale(r.scale * (1 + (1 - r.life / r.max) * 0.55)); v.setAlpha(r.life / r.max); setTintIfChanged(v, r.color); }
      this.hud.plungerFill.setSize(7, 94 * this.run.plungerPower); this.hud.plungerKnob.setY(840 - 94 * this.run.plungerPower); this.hud.plungerBand.setAlpha(this.run.plungerPower > 0 ? 0.3 : 0.16); this.hud.nudge.setAlpha(this.run.nudgeFlash > 0 ? 1 : 0.86); this.hud.nudge.setScale(this.run.nudgeFlash > 0 ? 1.08 : 1);
      this.updateHud();
    },
    updateHud: function () {
      var run = this.run, m = run.mission, nudgeCount = run.nudges.length, i, chipBusy, tutorialAlpha;
      setTextIfChanged(this.hud.score, fmt(run.score)); setTextIfChanged(this.hud.ball, '● ' + run.ballNumber + '/3'); setTextIfChanged(this.hud.mult, '×' + run.multiplier);
      if (run.phase === 'tilt') { setTextIfChanged(this.hud.mode, 'TILT · BALL DRAIN'); setColorIfChanged(this.hud.mode, '#ff5c91'); }
      else if (run.phase === 'drain') { setTextIfChanged(this.hud.mode, 'BALL DRAIN · NEXT BALL'); setColorIfChanged(this.hud.mode, '#ff5c91'); }
      else if (m.on) { setTextIfChanged(this.hud.mode, 'M ' + (MISSION_SHORT[m.kind] || 'MISSION') + ' ' + m.progress + '/' + m.need); setColorIfChanged(this.hud.mode, '#ff5c91'); this.hud.missionBar.setVisible(true).setFillStyle(this.run.skin.hot, 1).setSize(250 * clamp(m.time / 60, 0, 1), 4); }
      else { setTextIfChanged(this.hud.mode, ''); setColorIfChanged(this.hud.mode, '#8db6c8'); this.hud.missionBar.setVisible(false).setFillStyle(this.run.skin.hot, 0).setSize(0, 4); }
      setTextIfChanged(this.hud.nudge, '↯'); setColorIfChanged(this.hud.nudge, nudgeCount >= 3 ? '#ff5c91' : '#7293a8');
      for (i = 0; i < this.hud.nudgeDots.length; i++) this.hud.nudgeDots[i].setFillStyle(nudgeCount > i ? (nudgeCount >= 3 ? 0xff5c91 : this.run.skin.hot) : this.run.skin.hot, nudgeCount > i ? 0.95 : 0.22);
      chipBusy = this.chipView.visible || this.chipQueue.length > 0 || this.bannerView.visible;
      this.tutorialView.setVisible(run.tutorial.step < 3 && run.phase === 'play' && !chipBusy);
      if (run.tutorial.step === 0) setTextIfChanged(this.tutorialText, 'FLIP LEFT / RIGHT'); else if (run.tutorial.step === 1) setTextIfChanged(this.tutorialText, 'DRAG DOWN · RELEASE'); else if (run.tutorial.step === 2) setTextIfChanged(this.tutorialText, 'SWIPE TO NUDGE · 4 = TILT');
      tutorialAlpha = run.tutorial.age <= 3 ? 0.92 : Math.max(0.18, 0.92 - (run.tutorial.age - 3) * 1.2);
      if (!kit.juice.enabled && run.tutorial.age > 3) tutorialAlpha = 0.18;
      this.tutorialView.setAlpha(tutorialAlpha + run.tutorial.flash * 0.08);
    },
    showBanner: function (title, sub, color, duration) {
      var scene = this, reduced = !kit.juice.enabled, c = color || this.run.skin.hot;
      if (this.chipTimer) { this.chipTimer.remove(); this.chipTimer = null; }
      if (this.chipTween) { this.chipTween.stop(); this.chipTween = null; }
      this.chipQueue.length = 0; this.chipView.setVisible(false).setAlpha(1);
      if (this.bannerTimer) this.bannerTimer.remove();
      setTextIfChanged(this.bannerTitle, title); setTextIfChanged(this.bannerSub, sub); this.bannerBg.setStrokeStyle(3, c, 0.96); this.bannerView.setVisible(true); this.bannerView.setAlpha(1); setTintIfChanged(this.bannerTitle, 0xffffff); if (this.bannerTween) this.bannerTween.stop();
      if (reduced) this.bannerView.setPosition(215, 430);
      else { this.bannerView.setPosition(-190, 430); this.bannerTween = this.tweens.add({ targets: this.bannerView, x: 215, duration: 430, ease: 'Back.easeOut' }); }
      this.bannerTimer = this.time.delayedCall((duration || 1.7) * 1000, function () { if (scene.bannerView) scene.bannerView.setVisible(false); scene.bannerTimer = null; scene.startNextChip(); scene.updateHud(); });
      this.updateHud();
    },
    showChip: function (title, sub, color, duration) {
      var item = { text: String(title || '') + (sub ? ' · ' + String(sub) : ''), color: color || this.run.skin.hot, duration: Math.min(1, duration || 0.9) };
      if (this.bannerView && this.bannerView.visible) { if (this.chipQueue.length < 6) this.chipQueue.push(item); return; }
      if (this.chipView.visible) { if (this.chipQueue.length < 6) this.chipQueue.push(item); return; }
      this.startChip(item);
    },
    startNextChip: function () {
      if (this.bannerView && this.bannerView.visible) return;
      if (this.chipView.visible || !this.chipQueue.length) return;
      this.startChip(this.chipQueue.shift());
    },
    startChip: function (item) {
      var scene = this, reduced = !kit.juice.enabled;
      setTextIfChanged(this.chipText, item.text); this.chipBg.setStrokeStyle(1, item.color, 0.9); setColorIfChanged(this.chipText, '#eaffff');
      this.chipView.setVisible(true).setAlpha(1);
      this.chipTimer = this.time.delayedCall(item.duration * 1000, function () {
        scene.chipTimer = null;
        if (reduced) scene.finishChip();
        else scene.chipTween = scene.tweens.add({ targets: scene.chipView, alpha: 0, duration: 140, ease: 'Linear', onComplete: function () { scene.chipTween = null; scene.finishChip(); } });
      });
      this.updateHud();
    },
    finishChip: function () {
      this.chipView.setVisible(false).setAlpha(1);
      if (this.chipQueue.length) this.startNextChip();
      else this.updateHud();
    },
    forceMode: function (mode) {
      if (mode === 'title') { this.scene.start('title'); return; }
      if (this.run.phase !== 'play' && mode !== 'play') this.restartRun(currentSeed);
      if (mode === 'mission') { if (!this.run.mission.on) { this.table.hole.lit = true; this.beginMission(); } }
      else if (mode === 'multiball') this.triggerMultiball('ORCHESTRATOR TEST');
      else if (mode === 'gameover') this.endGame();
      syncDebug(this.run, this.run.balls[0]);
    },
    update: function (time, delta) {
      if (this.lifecyclePaused) return;
      var dt = Math.min(0.10, Math.max(0, delta / 1000)), steps = 0;
      this.acc += dt;
      while (this.acc >= STEP && steps < MAX_STEPS) { this.acc -= STEP; this.step(STEP); steps++; }
      /* If the device is late, leftover time remains in the accumulator. The
         sim slows down instead of advancing a clock past stepped physics. */
      this.updateView(kit.juice.frame().frozen ? 0 : Math.min(dt, steps * STEP));
    }
  };
  kit.registerPWA();
  var config = {
    type: Phaser.AUTO, parent: document.body, backgroundColor: '#050b15',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
    render: { antialias: true, antialiasGL: false, powerPreference: 'high-performance', roundPixels: false, batchSize: 4096 },
    fps: { target: 60, min: 30 }, scene: [toScene(BootScene), toScene(TitleScene), toScene(PlayScene)]
  };
  config.scale.width = Math.round(W * RETINA_FACTOR);
  config.scale.height = Math.round(H * RETINA_FACTOR);
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
  Game.phaser = new Phaser.Game(config);
}());
