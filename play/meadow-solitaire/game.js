/* Meadow Solitaire
 * Phaser 3 presentation with GGKit lifecycle, input identity, save, audio,
 * pause, settings, PWA registration and juice. All art is procedural.
 *
 * The original prototype's tuned rules remain intact: rank adjacency wraps
 * around aces, a clear chain raises the multiplier, peak tops pay a wildcard,
 * and a deal is checked for a complete clear before it can be played.
 */
(function () {
  'use strict';

  // --------------------------------------------------------------- constants
  var WIDTH = 390, HEIGHT = 844, STEP = 1 / 60, MAX_STEPS = 5;
  var MAX_WILDS = 3, MAX_UNDOS = 5, TOTAL_DEALS = 90;
  var STREAK_BASE = 10, PEAK_REWARD = 100, MAX_PARTICLES = 120;
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var SUITS = ['leaf', 'petal', 'berry', 'seed'];
  var SUIT_MARKS = ['✦', '✿', '●', '◆'];
  var DAILY_SEED = 0x4d534441;

  var SEASONS = [
    { id: 'spring-orchard', name: 'SPRING ORCHARD', note: 'apple blossom', sky: 0x9bc6a7, sky2: 0xdde8b6, felt: 0x285344, felt2: 0x3d7954, accent: 0xffe39a, card: 0x3b7650, wild: 0x88d86e, music: 'musicSpring' },
    { id: 'high-summer', name: 'HIGH SUMMER', note: 'clover field', sky: 0x63a8a1, sky2: 0xf2d88e, felt: 0x245242, felt2: 0x568353, accent: 0xffc96e, card: 0x2f704d, wild: 0xffd46d, music: 'musicSummer' },
    { id: 'harvest-gold', name: 'HARVEST GOLD', note: 'sunflower ridge', sky: 0x7c8b69, sky2: 0xe6b46e, felt: 0x493f2b, felt2: 0x86633b, accent: 0xffd56a, card: 0x775230, wild: 0xffb755, music: 'musicHarvest' },
    { id: 'first-frost', name: 'FIRST FROST', note: 'silver grass', sky: 0x536a78, sky2: 0xd8d7bc, felt: 0x324e54, felt2: 0x557c78, accent: 0xb9e8dc, card: 0x426f76, wild: 0xb9e8dc, music: 'musicFrost' },
    { id: 'moon-meadow', name: 'MOON MEADOW', note: 'mothlight', sky: 0x202d55, sky2: 0x8291b8, felt: 0x252c4b, felt2: 0x3e4f73, accent: 0xcbb7ff, card: 0x4a437a, wild: 0xd9c7ff, music: 'musicMoon' },
    { id: 'renewal-rain', name: 'RENEWAL RAIN', note: 'new green', sky: 0x416d72, sky2: 0x9ed3b6, felt: 0x245248, felt2: 0x438866, accent: 0xa7f1c2, card: 0x36775d, wild: 0xa7f1c2, music: 'musicRain' }
  ];

  var LAYOUT_DEFS = [
    { id: 'tri-peaks', name: 'TRI-PEAKS', rows: [3, 5, 7, 13], stock: 24, peaks: 3 },
    { id: 'four-peaks', name: 'FOUR PEAKS', rows: [4, 6, 8, 10, 12], stock: 28, peaks: 4 },
    { id: 'braided', name: 'BRAIDED', rows: [4, 6, 8, 10, 12, 14], stock: 32, peaks: 4 },
    { id: 'walled', name: 'WALLED', rows: [5, 7, 9, 11, 13], stock: 32, peaks: 5 },
    { id: 'double-deck', name: 'DOUBLE DECK', rows: [4, 6, 8, 10, 10, 10], stock: 48, peaks: 4 }
  ];
  var LAYOUT_BY_ID = Object.create(null);
  for (var li = 0; li < LAYOUT_DEFS.length; li++) LAYOUT_BY_ID[LAYOUT_DEFS[li].id] = LAYOUT_DEFS[li];
  var LAYOUT_SCHEDULE = ['tri-peaks', 'tri-peaks', 'four-peaks', 'four-peaks', 'braided', 'braided', 'walled', 'walled', 'double-deck', 'double-deck'];

  var AUDIO = {
    musicSpring: 'assets/music-spring.mp3', musicSummer: 'assets/music-summer.mp3',
    musicHarvest: 'assets/music-harvest.mp3', musicFrost: 'assets/music-frost.mp3',
    musicMoon: 'assets/music-moon.mp3', musicRain: 'assets/music-rain.mp3',
    tap: 'assets/sfx-tap.mp3', flip: 'assets/sfx-flip.mp3', draw: 'assets/sfx-draw.mp3',
    streak: 'assets/sfx-streak.mp3', peak: 'assets/sfx-peak.mp3', undo: 'assets/sfx-undo.mp3',
    hint: 'assets/sfx-hint.mp3', clear: 'assets/sfx-clear.mp3', fail: 'assets/sfx-fail.mp3',
    grow: 'assets/sfx-grow.mp3', boundary: 'assets/sfx-boundary.mp3'
  };

  var PAL = {
    ink: '#eef5dd', dim: '#b7c8ad', deep: '#102a22', panel: '#17382b',
    gold: '#ffd56a', mint: '#a7e58d', rose: '#f2a4a0', violet: '#d8b8ff',
    card: '#fbf7e9', cardInk: '#243a2e', blocked: '#aeb9a5'
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function color(hex) { return Phaser.Display.Color.HexStringToColor(hex).color; }
  function intColor(hex) { return parseInt(hex.replace('#', ''), 16); }
  function rng(seed) {
    var n = seed >>> 0;
    return function () { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
  }
  function rankOf(card) { return card.rank; }
  function adjacent(a, b) { var d = Math.abs(rankOf(a) - rankOf(b)); return d === 1 || d === 12; }
  function card(rank, suit) { return { rank: rank | 0, suit: suit | 0 }; }
  function safeInset(name) {
    var value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return Number.isFinite(value) ? value : 0;
  }
  function setTextIfChanged(obj, value) { var next = String(value); if (obj && obj.text !== next) obj.setText(next); }
  function setColorIfChanged(obj, value) { if (obj && obj.__msColor !== value) { obj.setColor(value); obj.__msColor = value; } }
  function setFillIfChanged(obj, fill, alpha) {
    var stamp = String(fill) + '/' + String(alpha);
    if (obj && obj.__msFill !== stamp) { obj.setFillStyle(fill, alpha); obj.__msFill = stamp; }
  }
  function plainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  // ---------------------------------------------------------- authored graph
  function makeLayout(id) {
    if (LAYOUT_BY_ID[id]._made) return LAYOUT_BY_ID[id]._made;
    var def = LAYOUT_BY_ID[id] || LAYOUT_DEFS[0];
    var layout = { id: def.id, name: def.name, stock: def.stock, peaks: def.peaks, rows: [], positions: [], children: [], order: [], count: 0 };
    var nextIndex = 0;
    for (var r = 0; r < def.rows.length; r++) {
      var count = def.rows[r], step = count > 1 ? Math.min(39, 350 / (count - 1)) : 0;
      var start = WIDTH * 0.5 - step * (count - 1) * 0.5;
      layout.rows.push({ start: nextIndex, count: count, step: step });
      for (var j = 0; j < count; j++) {
        layout.positions.push({ x: start + j * step, y: 154 + r * 45, row: r, column: j });
        layout.children.push([]);
        nextIndex++;
      }
    }
    layout.count = nextIndex;
    for (var pr = 0; pr < layout.rows.length - 1; pr++) {
      var parentRow = layout.rows[pr], childRow = layout.rows[pr + 1];
      for (var pj = 0; pj < parentRow.count; pj++) {
        var pIndex = parentRow.start + pj;
        var begin = Math.floor(pj * childRow.count / parentRow.count);
        var end = Math.ceil((pj + 1) * childRow.count / parentRow.count);
        if (end <= begin) end = begin + 1;
        begin = clamp(begin, 0, childRow.count - 1); end = clamp(end, begin + 1, childRow.count);
        for (var cj = begin; cj < end; cj++) layout.children[pIndex].push(childRow.start + cj);
        if (layout.children[pIndex].length < 2 && childRow.count > 1) {
          var extra = begin > 0 ? begin - 1 : end;
          if (extra >= 0 && extra < childRow.count) layout.children[pIndex].push(childRow.start + extra);
        }
      }
    }
    for (var rr = layout.rows.length - 1; rr >= 0; rr--) {
      for (var cc = 0; cc < layout.rows[rr].count; cc++) layout.order.push(layout.rows[rr].start + cc);
    }
    layout._made = layout;
    return layout;
  }

  function verifyDeal(layout, tableau, stock) {
    var alive = new Array(layout.count).fill(true), waste = stock[0];
    function free(index) {
      var children = layout.children[index];
      for (var i = 0; i < children.length; i++) if (alive[children[i]]) return false;
      return true;
    }
    for (var o = 0; o < layout.order.length; o++) {
      var index = layout.order[o];
      if (!free(index) || !adjacent(tableau[index], waste)) return false;
      alive[index] = false; waste = tableau[index];
    }
    return true;
  }

  function makeDeal(seed, layoutId) {
    var layout = makeLayout(layoutId), attempt = 0, result = null;
    while (!result && attempt < 4) {
      var random = rng((seed + attempt * 0x9e3779b9) >>> 0);
      var startRank = Math.floor(random() * 13), current = startRank;
      var tableau = new Array(layout.count);
      for (var o = 0; o < layout.order.length; o++) {
        current = (current + (random() < 0.5 ? 1 : -1) + 13) % 13;
        tableau[layout.order[o]] = card(current, Math.floor(random() * 4));
      }
      var stock = [card(startRank, Math.floor(random() * 4))];
      for (var s = 1; s < layout.stock; s++) stock.push(card(Math.floor(random() * 13), Math.floor(random() * 4)));
      if (verifyDeal(layout, tableau, stock)) result = { tableau: tableau, stock: stock, verified: true, seed: (seed + attempt * 0x9e3779b9) >>> 0 };
      attempt++;
    }
    if (!result) throw new Error('Meadow deal generation failed');
    return result;
  }

  function campaignSpec(index) {
    var safe = clamp(index | 0, 0, TOTAL_DEALS - 1), season = Math.floor(safe / 15), slot = safe % 15;
    var scheduleIndex = clamp(Math.floor(slot / 1.5), 0, LAYOUT_SCHEDULE.length - 1);
    return {
      kind: 'campaign', dealIndex: safe, season: season, stage: LAYOUT_SCHEDULE[scheduleIndex],
      seed: (0x6d530000 + safe * 0x45d9f3b) >>> 0, name: 'DEAL ' + String(safe + 1).padStart(2, '0')
    };
  }

  function dailySpec() {
    return { kind: 'daily', dealIndex: -1, season: 1, stage: 'braided', seed: DAILY_SEED, name: 'DAILY DEAL' };
  }

  // --------------------------------------------------------------- persistence
  function blankMeadow() {
    var out = [];
    for (var i = 0; i < SEASONS.length; i++) out.push([0, 0, 0, 0, 0, 0]);
    return out;
  }
  function defaultProfile() {
    return {
      v: 4, current: 0, wilds: 0, undoCharges: 0, totalWins: 0,
      cleared: new Array(TOTAL_DEALS).fill(0), stars: new Array(TOTAL_DEALS).fill(0),
      bestStreak: new Array(TOTAL_DEALS).fill(0), meadow: blankMeadow(),
      dailyBest: 0, dailyStars: 0, dailyBestStreak: 0, endlessBest: 0, endlessBestStreak: 0
    };
  }
  function validArray(arr, length, lo, hi) {
    if (!Array.isArray(arr) || arr.length !== length) return false;
    for (var i = 0; i < arr.length; i++) if (!Number.isInteger(arr[i]) || arr[i] < lo || arr[i] > hi) return false;
    return true;
  }
  function validateProfile(v) {
    if (!plainObject(v) || v.v !== 4 || !Number.isInteger(v.current) || v.current < 0 || v.current >= TOTAL_DEALS ||
        !Number.isInteger(v.wilds) || v.wilds < 0 || v.wilds > MAX_WILDS || !Number.isInteger(v.undoCharges) || v.undoCharges < 0 || v.undoCharges > MAX_UNDOS ||
        !Number.isInteger(v.totalWins) || v.totalWins < 0 || v.totalWins > 100000 || !validArray(v.cleared, TOTAL_DEALS, 0, 1) ||
        !validArray(v.stars, TOTAL_DEALS, 0, 3) || !validArray(v.bestStreak, TOTAL_DEALS, 0, 999) || !Array.isArray(v.meadow) || v.meadow.length !== SEASONS.length ||
        !Number.isInteger(v.dailyBest) || v.dailyBest < 0 || v.dailyBest > 99999999 || !Number.isInteger(v.dailyStars) || v.dailyStars < 0 || v.dailyStars > 3 ||
        !Number.isInteger(v.dailyBestStreak) || v.dailyBestStreak < 0 || v.dailyBestStreak > 999 || !Number.isInteger(v.endlessBest) || v.endlessBest < 0 || v.endlessBest > 99999999 ||
        !Number.isInteger(v.endlessBestStreak) || v.endlessBestStreak < 0 || v.endlessBestStreak > 999) return false;
    for (var s = 0; s < SEASONS.length; s++) if (!validArray(v.meadow[s], 6, 0, 3)) return false;
    return true;
  }

  var DEBUG_STATE = { mode: 'boot', progress: 0, score: 0, health: 0, currentStage: 0, stageId: 'tri-peaks', cardsLeft: 0, verified: false };
  var sceneRef = null, pendingForceMode = null, pendingForceStage = null, audioStarted = false;
  var pauseOverlay = document.getElementById('pause-overlay');
  var loadingNote = document.getElementById('loading-note');

  var kit = GGKit.create({
    slug: 'meadow-solitaire', orientation: 'portrait', validateSave: validateProfile,
    onPause: function (reason) {
      if (sceneRef) sceneRef.gestureMap = Object.create(null);
      if (sceneRef && sceneRef.scene.isActive()) sceneRef.scene.pause();
      if (reason === 'manual') pauseOverlay.hidden = false;
    },
    onResume: function () {
      if (sceneRef && sceneRef.scene.isPaused()) sceneRef.scene.resume();
      pauseOverlay.hidden = true;
    },
    onRestart: function () { if (sceneRef) sceneRef.restartCurrent(); }
  });
  kit.audio.register(AUDIO);
  kit.registerPWA();
  var profile = kit.save.get(defaultProfile());

  function persist() { kit.save.set(profile); }
  function campaignProgress() {
    var n = 0;
    for (var i = 0; i < profile.cleared.length; i++) n += profile.cleared[i];
    return n;
  }
  function syncDebug() {
    var r = sceneRef && sceneRef.run;
    DEBUG_STATE.mode = sceneRef ? sceneRef.mode : 'boot';
    DEBUG_STATE.progress = campaignProgress() / TOTAL_DEALS;
    DEBUG_STATE.score = r ? r.score : 0;
    DEBUG_STATE.health = r ? r.cardsLeft : 0;
    DEBUG_STATE.currentStage = r ? r.spec.season : Math.floor(profile.current / 15);
    DEBUG_STATE.stageId = r ? r.layout.id : campaignSpec(profile.current).stage;
    DEBUG_STATE.cardsLeft = r ? r.cardsLeft : 0;
    DEBUG_STATE.verified = !!(r && r.verified);
  }
  function forceMode(value) {
    var v = String(value || '').toLowerCase();
    if (v !== 'meadow' && v !== 'campaign' && v !== 'play' && v !== 'daily' && v !== 'endless') return false;
    pendingForceMode = v;
    if (sceneRef) {
      if (v === 'meadow') sceneRef.showMeadow();
      else if (v === 'campaign') sceneRef.startRun(campaignSpec(profile.current));
      else if (v === 'daily') sceneRef.startRun(dailySpec());
      else if (v === 'endless') sceneRef.startEndless();
      else sceneRef.startRun(campaignSpec(profile.current));
    }
    return true;
  }
  function forceStage(value) {
    var v = String(value == null ? '' : value).toLowerCase();
    var idx = Number(value);
    if (Number.isFinite(idx)) idx = clamp(Math.floor(idx), 0, SEASONS.length - 1) * 15;
    else {
      var stageSlots = { 'tri-peaks': 0, 'four-peaks': 2, braided: 4, walled: 6, 'double-deck': 8 };
      idx = stageSlots[v] == null ? 0 : stageSlots[v];
    }
    pendingForceStage = idx;
    if (sceneRef) sceneRef.startRun(campaignSpec(idx));
    return idx;
  }
  window.__ms = { state: DEBUG_STATE, forceMode: forceMode, forceStage: forceStage };

  // -------------------------------------------------------------- baked art
  function bakeTexture(scene, name, width, height, draw) {
    if (scene.textures.exists(name)) return;
    var g = scene.make.graphics({ x: 0, y: 0, add: false });
    draw(g, width, height); g.generateTexture(name, width, height); g.destroy();
  }
  function hill(g, x, y, w, h, tint, alpha) {
    g.fillStyle(tint, alpha);
    g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + h * 0.54);
    g.lineTo(x + w * 0.18, y + h * 0.42); g.lineTo(x + w * 0.36, y + h * 0.58);
    g.lineTo(x + w * 0.54, y + h * 0.35); g.lineTo(x + w * 0.72, y + h * 0.55);
    g.lineTo(x + w, y + h * 0.32); g.lineTo(x + w, y + h); g.closePath(); g.fillPath();
  }
  function bakeAll(scene) {
    for (var i = 0; i < SEASONS.length; i++) (function (season, index) {
      bakeTexture(scene, 'ms_bg_' + index, WIDTH, HEIGHT, function (g, w, h) {
        g.fillStyle(season.sky, 1).fillRect(0, 0, w, h);
        g.fillStyle(season.sky2, 0.28).fillCircle(w * 0.78, h * 0.16, 82);
        hill(g, 0, 116, w, 410, season.felt, 0.76);
        hill(g, 0, 214, w, 350, season.felt2, 0.78);
        g.fillStyle(0x102a22, 0.72).fillRect(0, 505, w, h - 505);
        for (var mote = 0; mote < 34; mote++) {
          var mx = (mote * 73 + index * 17) % w, my = 126 + ((mote * 47 + index * 31) % 420);
          g.fillStyle(season.accent, mote % 3 === 0 ? 0.32 : 0.14).fillCircle(mx, my, mote % 2 ? 1 : 2);
        }
      });
      bakeTexture(scene, 'ms_felt_' + index, WIDTH, 430, function (g, w, h) {
        g.fillStyle(season.felt, 0.98).fillRoundedRect(8, 0, w - 16, h, 24);
        g.fillStyle(season.felt2, 0.12).fillRoundedRect(18, 12, w - 36, h - 24, 18);
        g.lineStyle(2, season.accent, 0.24).strokeRoundedRect(10, 2, w - 20, h - 4, 22);
        g.fillStyle(0xffffff, 0.035).fillCircle(w * 0.18, h * 0.26, 110);
        g.fillStyle(0x071a12, 0.12).fillCircle(w * 0.82, h * 0.72, 148);
      });
    }(SEASONS[i], i));
    bakeTexture(scene, 'ms_hud', WIDTH, 112, function (g, w, h) {
      g.fillStyle(0x0d2119, 0.96).fillRect(0, 0, w, h);
      g.fillStyle(0x28513b, 0.74).fillRect(0, h - 2, w, 2);
      g.fillStyle(0xffffff, 0.05).fillRect(0, 60, w, 1);
    });
    bakeTexture(scene, 'ms_bottom', WIDTH, 118, function (g, w, h) {
      g.fillStyle(0x0b1b15, 0.97).fillRect(0, 0, w, h);
      g.fillStyle(0x28513b, 0.7).fillRect(0, 0, w, 2);
      g.fillStyle(0xffffff, 0.035).fillRect(0, 58, w, 1);
    });
    bakeTexture(scene, 'ms_back', 66, 86, function (g, w, h) {
      g.fillStyle(0x376d4b, 1).fillRoundedRect(2, 2, w - 4, h - 4, 8);
      g.lineStyle(3, 0xa8d889, 0.86).strokeRoundedRect(7, 7, w - 14, h - 14, 5);
      g.lineStyle(2, 0xe2efb2, 0.42).strokeLineShape(new Phaser.Geom.Line(w * 0.5, 17, w * 0.5, h - 17));
      g.fillStyle(0xe2efb2, 0.55).fillTriangle(w * 0.5, 25, w * 0.5 - 12, 42, w * 0.5, 35);
      g.fillStyle(0xe2efb2, 0.55).fillTriangle(w * 0.5, h - 25, w * 0.5 + 12, h - 42, w * 0.5, h - 35);
    });
    bakeTexture(scene, 'ms_spark', 18, 18, function (g) {
      g.fillStyle(0xffffff, 0.18).fillCircle(9, 9, 8);
      g.fillStyle(0xffffff, 1).fillCircle(9, 9, 3);
    });
  }

  // --------------------------------------------------------------- boot scene
  function BootScene() { Phaser.Scene.call(this, { key: 'boot' }); }
  BootScene.prototype = Object.create(Phaser.Scene.prototype);
  BootScene.prototype.constructor = BootScene;
  BootScene.prototype.preload = function () { kit.loader.show('MEADOW SOLITAIRE'); kit.loader.progress(0.2); };
  BootScene.prototype.create = function () {
    bakeAll(this); kit.loader.progress(0.78);
    kit.loader.progress(1); kit.loader.hide();
    if (loadingNote) loadingNote.remove();
    this.scene.start('meadow');
  };

  // ------------------------------------------------------------- main scene
  function MeadowScene() { Phaser.Scene.call(this, { key: 'meadow' }); }
  MeadowScene.prototype = Object.create(Phaser.Scene.prototype);
  MeadowScene.prototype.constructor = MeadowScene;

  MeadowScene.prototype.createText = function (x, y, text, size, colorValue, align, bold) {
    return this.add.text(x, y, text, { fontFamily: 'Verdana, Geneva, sans-serif', fontSize: size + 'px', fontStyle: bold ? 'bold' : 'normal', color: colorValue, align: align || 'left', resolution: 1 }).setOrigin(align === 'center' ? 0.5 : align === 'right' ? 1 : 0, 0.5);
  };
  MeadowScene.prototype.createButton = function (x, y, w, h, text, tint, depth) {
    var rect = this.add.rectangle(x, y, w, h, tint || 0x214b36, 0.98).setOrigin(0.5).setDepth(depth || 100);
    rect.setStrokeStyle(2, 0xa8d889, 0.68);
    var label = this.createText(x, y, text, 14, PAL.ink, 'center', true).setDepth((depth || 100) + 1);
    return { x: x - w / 2, y: y - h / 2, w: w, h: h, rect: rect, label: label, base: tint || 0x214b36, id: text };
  };
  MeadowScene.prototype.createCardView = function () {
    var bg = this.add.rectangle(0, 0, 34, 44, intColor(PAL.card), 1).setOrigin(0.5).setVisible(false);
    var rank = this.createText(0, 0, '', 16, PAL.cardInk, 'center', true).setVisible(false);
    var mark = this.createText(0, 0, '', 16, PAL.cardInk, 'center', false).setVisible(false);
    var badge = this.createText(0, 0, '', 12, PAL.cardInk, 'center', true).setVisible(false);
    var glow = this.add.rectangle(0, 0, 40, 50, 0xffffff, 0).setOrigin(0.5).setVisible(false);
    glow.setStrokeStyle(3, 0xffe39a, 0.98);
    this.fieldRoot.add([bg, glow, rank, mark, badge]);
    return { bg: bg, glow: glow, rank: rank, mark: mark, badge: badge, card: null, pos: null };
  };
  MeadowScene.prototype.createMovingView = function () {
    var view = this.createCardView();
    view.bg.setDepth(74); view.glow.setDepth(75); view.rank.setDepth(76); view.mark.setDepth(76); view.badge.setDepth(76);
    return view;
  };
  MeadowScene.prototype.create = function () {
    sceneRef = this;
    this.mode = 'meadow'; this.viewSeason = Math.floor(profile.current / 15); this.run = null; this.layout = null;
    this.history = []; this.accumulator = 0; this.simClock = 0; this.renderClock = 0; this.gestureMap = Object.create(null);
    this.pressed = null; this.selectedCard = -1; this.toast = { text: '', color: PAL.ink, time: 0 }; this.anim = null;
    this.keyPrev = Object.create(null); this.musicName = '';
    this.fieldRoot = this.add.container(0, 0).setDepth(0);
    this.bg = this.add.image(0, 0, 'ms_bg_0').setOrigin(0).setDepth(-30); this.fieldRoot.add(this.bg);
    this.felt = this.add.image(0, 112, 'ms_felt_0').setOrigin(0).setDepth(-10).setVisible(false); this.fieldRoot.add(this.felt);
    this.meadowArt = this.add.graphics().setDepth(2); this.fieldRoot.add(this.meadowArt);
    this.stockBack = this.add.image(64, 536, 'ms_back').setOrigin(0.5).setDepth(30).setVisible(false); this.fieldRoot.add(this.stockBack);
    this.wasteBg = this.add.rectangle(195, 536, 54, 70, intColor(PAL.card), 1).setOrigin(0.5).setDepth(30).setVisible(false); this.fieldRoot.add(this.wasteBg);
    this.wasteRank = this.createText(195, 524, '', 20, PAL.cardInk, 'center', true).setDepth(31).setVisible(false); this.fieldRoot.add(this.wasteRank);
    this.wasteMark = this.createText(195, 551, '', 18, PAL.cardInk, 'center', false).setDepth(31).setVisible(false); this.fieldRoot.add(this.wasteMark);
    this.wildWell = this.add.circle(326, 536, 33, 0x553f76, 0.96).setDepth(30).setVisible(false); this.fieldRoot.add(this.wildWell);
    this.wildMark = this.createText(326, 526, '✦', 22, PAL.violet, 'center', true).setDepth(31).setVisible(false); this.fieldRoot.add(this.wildMark);
    this.wildCount = this.createText(326, 554, '0', 16, PAL.ink, 'center', true).setDepth(31).setVisible(false); this.fieldRoot.add(this.wildCount);
    this.cardViews = [];
    for (var ci = 0; ci < 70; ci++) { var cv = this.createCardView(); cv.bg.setDepth(40); cv.glow.setDepth(41); cv.rank.setDepth(42); cv.mark.setDepth(42); cv.badge.setDepth(43); this.cardViews.push(cv); }
    this.animView = this.createMovingView(); this.animView.bg.setVisible(false); this.animView.glow.setVisible(false); this.animView.rank.setVisible(false); this.animView.mark.setVisible(false); this.animView.badge.setVisible(false);
    this.cardParticles = this.add.particles(0, 0, 'ms_spark', { lifespan: 420, speed: { min: 22, max: 78 }, scale: { start: 1.3, end: 0 }, alpha: { start: 0.92, end: 0 }, gravityY: 42, emitting: false, quantity: 0, blendMode: Phaser.BlendModes.ADD }).setDepth(78);
    this.rewardParticles = this.add.particles(0, 0, 'ms_spark', { lifespan: 820, speed: { min: 46, max: 138 }, scale: { start: 1.9, end: 0 }, alpha: { start: 1, end: 0 }, gravityY: 70, emitting: false, quantity: 0, blendMode: Phaser.BlendModes.ADD }).setDepth(79);
    this.growParticles = this.add.particles(0, 0, 'ms_spark', { lifespan: 1000, speed: { min: 18, max: 66 }, scale: { start: 1.5, end: 0 }, alpha: { start: 0.85, end: 0 }, gravityY: -14, emitting: false, quantity: 0, blendMode: Phaser.BlendModes.ADD }).setDepth(79);

    this.hudPlate = this.add.image(0, 0, 'ms_hud').setOrigin(0).setDepth(80);
    this.hudDeal = this.createText(16, 20, '', 15, PAL.ink, 'left', true).setDepth(82);
    this.hudStage = this.createText(16, 47, '', 14, PAL.dim, 'left', false).setDepth(82);
    this.hudScore = this.createText(374, 20, '', 16, PAL.ink, 'right', true).setDepth(82);
    this.hudChain = this.createText(374, 47, '', 14, PAL.gold, 'right', true).setDepth(82);
    this.hudMeterBack = this.add.rectangle(16, 78, 214, 7, 0x315843, 1).setOrigin(0, 0.5).setDepth(82);
    this.hudMeter = this.add.rectangle(16, 78, 0, 7, 0xa8d889, 1).setOrigin(0, 0.5).setDepth(83);
    this.hudProgress = this.createText(374, 78, '', 14, PAL.dim, 'right', true).setDepth(82);
    this.pauseButton = this.createButton(350, 106, 46, 46, 'Ⅱ', 0x214b36, 84); this.pauseButton.label.setFontSize('18px');
    this.bottomPlate = this.add.image(0, 726, 'ms_bottom').setOrigin(0).setDepth(80).setVisible(false);
    this.controls = [
      this.createButton(54, 782, 76, 54, '▣ DRAW', 0x214b36, 84),
      this.createButton(144, 782, 76, 54, '✦ WILD', 0x443565, 84),
      this.createButton(234, 782, 76, 54, '↶ UNDO', 0x214b36, 84),
      this.createButton(326, 782, 76, 54, '? HINT', 0x214b36, 84)
    ];
    this.toastBg = this.add.rectangle(195, 126, 300, 28, 0x102a22, 0.9).setOrigin(0.5).setDepth(90).setVisible(false);
    this.toastText = this.createText(195, 126, '', 14, PAL.ink, 'center', true).setDepth(91).setVisible(false);

    this.menuTitle = this.createText(195, 32, 'MEADOW SOLITAIRE', 20, PAL.ink, 'center', true).setDepth(90);
    this.menuProgress = this.createText(195, 72, '', 15, PAL.dim, 'center', true).setDepth(90);
    this.menuSeason = this.createText(195, 101, '', 16, PAL.gold, 'center', true).setDepth(90);
    this.menuHint = this.createText(195, 536, 'Play clears. The meadow keeps the proof.', 14, PAL.dim, 'center', false).setDepth(90);
    this.menuDots = [];
    for (var di = 0; di < SEASONS.length; di++) this.menuDots.push(this.add.circle(145 + di * 20, 572, 6, 0x315843, 1).setDepth(90));
    this.menuButtons = [
      this.createButton(195, 626, 250, 58, 'PLAY NEXT DEAL', 0x3e7046, 90),
      this.createButton(195, 696, 250, 58, 'DAILY DEAL', 0x514578, 90),
      this.createButton(195, 766, 250, 58, 'HARVEST RUN', 0x805535, 90)
    ];
    this.settingsButton = this.createButton(350, 32, 46, 46, '⚙', 0x214b36, 90); this.settingsButton.label.setFontSize('18px');

    this.resultShade = this.add.rectangle(195, 422, WIDTH, HEIGHT, 0x07150f, 0.86).setDepth(120).setVisible(false);
    this.resultPanel = this.add.rectangle(195, 430, 334, 386, 0x17382b, 0.98).setDepth(121).setVisible(false); this.resultPanel.setStrokeStyle(2, 0xa8d889, 0.72);
    this.resultTitle = this.createText(195, 286, '', 25, PAL.gold, 'center', true).setDepth(122).setVisible(false);
    this.resultSub = this.createText(195, 324, '', 14, PAL.dim, 'center', false).setDepth(122).setVisible(false);
    this.resultScore = this.createText(195, 380, '', 22, PAL.ink, 'center', true).setDepth(122).setVisible(false);
    this.resultStats = this.createText(195, 425, '', 14, PAL.dim, 'center', false).setDepth(122).setVisible(false);
    this.resultGrowth = this.createText(195, 468, '', 16, PAL.mint, 'center', true).setDepth(122).setVisible(false);
    this.resultButtons = [
      this.createButton(195, 548, 250, 54, 'NEXT DEAL', 0x3e7046, 123),
      this.createButton(195, 614, 250, 54, 'REPLAY', 0x214b36, 123),
      this.createButton(195, 680, 250, 54, 'MEADOW', 0x214b36, 123)
    ];
    for (var ri = 0; ri < this.resultButtons.length; ri++) { this.resultButtons[ri].rect.setVisible(false); this.resultButtons[ri].label.setVisible(false); }

    this.scale.on('resize', this.layoutAll, this);
    this.layoutAll();
    this.showMeadow();
    if (pendingForceStage != null) this.startRun(campaignSpec(pendingForceStage));
    if (pendingForceMode === 'daily') this.startRun(dailySpec());
    else if (pendingForceMode === 'endless') this.startEndless();
    else if (pendingForceMode === 'play') this.startRun(campaignSpec(profile.current));
    this.updateDebug();
  };

  MeadowScene.prototype.layoutAll = function () {
    var top = safeInset('--safe-top'), bottom = safeInset('--safe-bottom');
    this.bg.setDisplaySize(WIDTH, HEIGHT); this.felt.setDisplaySize(WIDTH, 430);
    this.hudPlate.setPosition(0, top); this.bottomPlate.setPosition(0, HEIGHT - 118 - bottom);
    this.controls[0].rect.setPosition(54, HEIGHT - 62 - bottom); this.controls[0].label.setPosition(54, HEIGHT - 62 - bottom);
    this.controls[1].rect.setPosition(144, HEIGHT - 62 - bottom); this.controls[1].label.setPosition(144, HEIGHT - 62 - bottom);
    this.controls[2].rect.setPosition(234, HEIGHT - 62 - bottom); this.controls[2].label.setPosition(234, HEIGHT - 62 - bottom);
    this.controls[3].rect.setPosition(326, HEIGHT - 62 - bottom); this.controls[3].label.setPosition(326, HEIGHT - 62 - bottom);
    this.pauseButton.rect.setPosition(350, 32 + top); this.pauseButton.label.setPosition(350, 32 + top);
    this.toastBg.setPosition(195, 126 + top); this.toastText.setPosition(195, 126 + top);
    this.hudDeal.setPosition(16, 20 + top); this.hudStage.setPosition(16, 47 + top); this.hudScore.setPosition(374, 20 + top); this.hudChain.setPosition(374, 47 + top);
    this.hudMeterBack.setPosition(16, 78 + top); this.hudMeter.setPosition(16, 78 + top); this.hudProgress.setPosition(374, 78 + top);
    this.menuTitle.setPosition(195, 32 + top); this.menuProgress.setPosition(195, 72 + top); this.menuSeason.setPosition(195, 101 + top); this.settingsButton.rect.setPosition(350, 32 + top); this.settingsButton.label.setPosition(350, 32 + top);
    this.menuButtons[0].rect.setPosition(195, 626 - bottom * 0.2); this.menuButtons[0].label.setPosition(195, 626 - bottom * 0.2);
    this.menuButtons[1].rect.setPosition(195, 696 - bottom * 0.2); this.menuButtons[1].label.setPosition(195, 696 - bottom * 0.2);
    this.menuButtons[2].rect.setPosition(195, 766 - bottom * 0.2); this.menuButtons[2].label.setPosition(195, 766 - bottom * 0.2);
  };

  MeadowScene.prototype.setSeason = function (index) {
    var season = SEASONS[clamp(index | 0, 0, SEASONS.length - 1)];
    this.viewSeason = SEASONS.indexOf(season);
    this.bg.setTexture('ms_bg_' + this.viewSeason); this.felt.setTexture('ms_felt_' + this.viewSeason);
    this.stockBack.setTint(season.card);
    if (audioStarted && this.musicName !== season.music) { this.musicName = season.music; kit.audio.music(season.music, 650); }
  };
  MeadowScene.prototype.startAudio = function () {
    if (audioStarted) return;
    audioStarted = true;
    kit.audio.preload(Object.keys(AUDIO));
    this.musicName = SEASONS[this.viewSeason].music; kit.audio.music(this.musicName, 650);
  };
  MeadowScene.prototype.showToast = function (text, tint, seconds) {
    this.toast.text = text; this.toast.color = tint || PAL.ink; this.toast.time = seconds == null ? 1 : seconds;
  };
  MeadowScene.prototype.setButtonState = function (button, active, disabled) {
    var fill = disabled ? 0x243128 : active ? 0x5f944e : button.base;
    setFillIfChanged(button.rect, fill, disabled ? 0.74 : 0.98);
    button.rect.setStrokeStyle(2, active ? 0xffe39a : 0xa8d889, active ? 0.96 : 0.62);
    setColorIfChanged(button.label, disabled ? '#879786' : PAL.ink);
  };
  MeadowScene.prototype.showPlayObjects = function (visible) {
    this.felt.setVisible(visible); this.stockBack.setVisible(visible); this.wasteBg.setVisible(visible); this.wasteRank.setVisible(visible); this.wasteMark.setVisible(visible); this.wildWell.setVisible(visible); this.wildMark.setVisible(visible); this.wildCount.setVisible(visible);
    this.hudPlate.setVisible(visible); this.hudDeal.setVisible(visible); this.hudStage.setVisible(visible); this.hudScore.setVisible(visible); this.hudChain.setVisible(visible); this.hudMeterBack.setVisible(visible); this.hudMeter.setVisible(visible); this.hudProgress.setVisible(visible); this.bottomPlate.setVisible(visible); this.pauseButton.rect.setVisible(visible); this.pauseButton.label.setVisible(visible);
    for (var i = 0; i < this.controls.length; i++) { this.controls[i].rect.setVisible(visible); this.controls[i].label.setVisible(visible); }
  };
  MeadowScene.prototype.showMeadow = function () {
    this.mode = 'meadow'; this.run = null; this.layout = null; this.selectedCard = -1; this.anim = null; this.hideResult();
    this.showPlayObjects(false); this.menuTitle.setVisible(true); this.menuProgress.setVisible(true); this.menuSeason.setVisible(true); this.menuHint.setVisible(true); this.settingsButton.rect.setVisible(true); this.settingsButton.label.setVisible(true);
    for (var i = 0; i < this.menuButtons.length; i++) { this.menuButtons[i].rect.setVisible(true); this.menuButtons[i].label.setVisible(true); }
    this.setSeason(this.viewSeason); this.updateDebug();
  };
  MeadowScene.prototype.hideMenu = function () {
    this.menuTitle.setVisible(false); this.menuProgress.setVisible(false); this.menuSeason.setVisible(false); this.menuHint.setVisible(false); this.settingsButton.rect.setVisible(false); this.settingsButton.label.setVisible(false);
    for (var i = 0; i < this.menuButtons.length; i++) { this.menuButtons[i].rect.setVisible(false); this.menuButtons[i].label.setVisible(false); }
  };
  MeadowScene.prototype.hideResultButtons = function () { for (var i = 0; i < this.resultButtons.length; i++) { this.resultButtons[i].rect.setVisible(false); this.resultButtons[i].label.setVisible(false); } };
  MeadowScene.prototype.hideResult = function () {
    this.resultShade.setVisible(false); this.resultPanel.setVisible(false); this.resultTitle.setVisible(false); this.resultSub.setVisible(false); this.resultScore.setVisible(false); this.resultStats.setVisible(false); this.resultGrowth.setVisible(false); this.hideResultButtons();
  };

  MeadowScene.prototype.startRun = function (spec) {
    this.startAudio();
    var layout = makeLayout(spec.stage), deal = makeDeal(spec.seed, spec.stage);
    this.mode = 'play'; this.spec = spec; this.layout = layout; this.run = {
      spec: spec, layout: layout, tableau: deal.tableau, stock: deal.stock, drawIndex: 1, waste: deal.stock[0], alive: new Array(layout.count).fill(true),
      score: 0, streak: 0, bestStreak: 0, moves: 0, peaks: 0, cardsLeft: layout.count, selected: -1, hintIndex: -1, verified: deal.verified,
      result: '', reward: 0, stars: 0, growth: false, endlessRound: spec.kind === 'endless' ? (this.endlessRound || 1) : 0
    };
    this.history.length = 0; this.anim = null; this.selectedCard = -1; this.hideMenu(); this.showPlayObjects(true); this.hideResult(); this.setSeason(spec.season);
    this.showToast('SOLVABLE PATH VERIFIED', PAL.mint, 2.2); this.updateDebug();
  };
  MeadowScene.prototype.startEndless = function () {
    this.endlessRound = 1; this.startRun({ kind: 'endless', dealIndex: -1, season: 1, stage: 'tri-peaks', seed: (0xE11D5EED + this.endlessRound * 9176) >>> 0, name: 'HARVEST RUN' });
  };
  MeadowScene.prototype.restartCurrent = function () {
    if (this.run && this.mode === 'play') {
      if (this.run.spec.kind === 'daily') this.startRun(dailySpec());
      else if (this.run.spec.kind === 'endless') this.startEndless();
      else this.startRun(campaignSpec(this.run.spec.dealIndex));
    } else this.showMeadow();
  };
  MeadowScene.prototype.snapshot = function () {
    var r = this.run;
    return { alive: r.alive.slice(), drawIndex: r.drawIndex, waste: { rank: r.waste.rank, suit: r.waste.suit }, score: r.score, streak: r.streak, bestStreak: r.bestStreak, moves: r.moves, peaks: r.peaks, cardsLeft: r.cardsLeft, selected: r.selected, wilds: profile.wilds, undoCharges: profile.undoCharges };
  };
  MeadowScene.prototype.pushHistory = function () { this.history.push(this.snapshot()); if (this.history.length > 32) this.history.shift(); };
  MeadowScene.prototype.restoreSnapshot = function (snap) {
    var r = this.run; r.alive = snap.alive.slice(); r.drawIndex = snap.drawIndex; r.waste = card(snap.waste.rank, snap.waste.suit); r.score = snap.score; r.streak = snap.streak; r.bestStreak = snap.bestStreak; r.moves = snap.moves; r.peaks = snap.peaks; r.cardsLeft = snap.cardsLeft; r.selected = snap.selected; profile.wilds = snap.wilds; profile.undoCharges = snap.undoCharges; r.hintIndex = -1; this.anim = null; this.showToast('UNDO USED', PAL.violet, 0.9); this.updateDebug();
  };
  MeadowScene.prototype.isFree = function (index) {
    var children = this.layout.children[index];
    for (var i = 0; i < children.length; i++) if (this.run.alive[children[i]]) return false;
    return true;
  };
  MeadowScene.prototype.isPlayable = function (index) { return this.run.alive[index] && this.isFree(index) && adjacent(this.run.tableau[index], this.run.waste); };
  MeadowScene.prototype.playableList = function () { var list = []; for (var i = 0; i < this.layout.count; i++) if (this.isPlayable(i)) list.push(i); return list; };
  MeadowScene.prototype.freeList = function () { var list = []; for (var i = 0; i < this.layout.count; i++) if (this.run.alive[i] && this.isFree(i)) list.push(i); return list; };
  MeadowScene.prototype.doPlay = function (index, viaWild) {
    var r = this.run;
    if (!r || r.result || !r.alive[index] || !this.isFree(index)) return false;
    if (!viaWild && !adjacent(r.tableau[index], r.waste)) { this.showToast('MATCH ±1', PAL.rose, 0.8); kit.audio.sfx('tap'); kit.juice.shake(1.5, 70); return false; }
    if (viaWild && profile.wilds <= 0) { this.showToast('NO WILDS BANKED', PAL.rose, 0.9); return false; }
    this.pushHistory();
    var from = this.layout.positions[index], oldWaste = r.waste;
    r.alive[index] = false; r.cardsLeft--; r.waste = r.tableau[index]; r.moves++; r.hintIndex = -1;
    if (viaWild) {
      profile.wilds = clamp(profile.wilds - 1, 0, MAX_WILDS); r.streak = 0; this.showToast('WILD · ANY CARD', PAL.violet, 0.9); kit.audio.sfx('streak');
    } else {
      r.streak++; r.bestStreak = Math.max(r.bestStreak, r.streak);
      var mult = Math.min(6, 1 + (r.streak - 1) * 0.5), gain = Math.round(STREAK_BASE * mult); r.score += gain;
      this.showToast('+' + gain + (mult > 1 ? '  x' + mult.toFixed(1) : ''), r.streak > 3 ? PAL.gold : PAL.mint, 0.9); kit.audio.sfx(r.streak > 2 ? 'streak' : 'flip');
    }
    this.anim = { card: r.waste, x: from.x, y: from.y, tx: 195, ty: 536, age: 0, dur: kit.juice.enabled ? 0.16 : 0.01 };
    this.burst(from.x, from.y, 8, viaWild ? 0xd8b8ff : 0xa8d889);
    kit.juice.hitStop(kit.juice.enabled ? 34 : 0);
    if (index < this.layout.rows[0].start + this.layout.rows[0].count) {
      r.peaks++; r.score += PEAK_REWARD; profile.wilds = clamp(profile.wilds + 1, 0, MAX_WILDS); profile.undoCharges = clamp(profile.undoCharges + 1, 0, MAX_UNDOS);
      this.showToast('PEAK +' + PEAK_REWARD + '  ✦ +1  ↶ +1', PAL.gold, 1.0); this.burst(from.x, from.y, 22, 0xffd56a); kit.audio.sfx('peak'); kit.juice.shake(4, 100);
    }
    persist(); this.checkEnd(); this.updateDebug(); return true;
  };
  MeadowScene.prototype.doDraw = function () {
    var r = this.run;
    if (!r || r.result) return false;
    if (r.drawIndex >= r.stock.length) { this.showToast('STOCK EMPTY', PAL.rose, 0.8); kit.audio.sfx('tap'); return false; }
    this.pushHistory();
    r.waste = r.stock[r.drawIndex++]; r.streak = 0; r.hintIndex = -1;
    this.anim = { card: r.waste, x: 64, y: 536, tx: 195, ty: 536, age: 0, dur: kit.juice.enabled ? 0.12 : 0.01 };
    this.showToast('DRAW  ·  ' + (r.stock.length - r.drawIndex) + ' LEFT', PAL.dim, 0.8); kit.audio.sfx('draw'); this.checkEnd(); this.updateDebug(); return true;
  };
  MeadowScene.prototype.doUndo = function () {
    if (!this.run || this.run.result) return;
    if (profile.undoCharges <= 0) { this.showToast('NO UNDO CHARGES', PAL.rose, 0.9); kit.audio.sfx('tap'); return; }
    if (!this.history.length) { this.showToast('NOTHING TO UNDO', PAL.dim, 0.9); return; }
    var snap = this.history.pop(); this.restoreSnapshot(snap); profile.undoCharges = clamp(profile.undoCharges - 1, 0, MAX_UNDOS); persist(); kit.audio.sfx('undo'); kit.juice.hitStop(kit.juice.enabled ? 28 : 0); this.updateDebug();
  };
  MeadowScene.prototype.doHint = function () {
    if (!this.run || this.run.result) return;
    var list = this.playableList(); this.run.hintIndex = list.length ? list[0] : -1;
    this.showToast(list.length ? 'LEGAL CARD HIGHLIGHTED' : (this.run.drawIndex < this.run.stock.length ? 'DRAW TO CHANGE THE WASTE' : 'NO MATCHES'), list.length ? PAL.gold : PAL.dim, 1.0); kit.audio.sfx('hint');
  };
  MeadowScene.prototype.checkEnd = function () {
    var r = this.run;
    if (!r || r.result) return;
    if (r.cardsLeft === 0) { this.finishRun(true); return; }
    if (!this.playableList().length && r.drawIndex >= r.stock.length && (!profile.wilds || !this.freeList().length)) this.finishRun(false);
  };
  MeadowScene.prototype.finishRun = function (won) {
    var r = this.run;
    r.result = won ? 'win' : 'fail'; r.stars = 0; r.reward = 0; r.growth = false;
    if (won) {
      var remaining = r.stock.length - r.drawIndex;
      r.stars = 1 + (r.bestStreak >= 4 ? 1 : 0) + (remaining >= Math.floor(r.stock.length * 0.3) ? 1 : 0);
      if (r.spec.kind === 'campaign') {
        var index = r.spec.dealIndex;
        if (!profile.cleared[index]) { profile.cleared[index] = 1; profile.totalWins++; profile.meadow[r.spec.season][index % 6] = clamp(profile.meadow[r.spec.season][index % 6] + 1, 0, 3); r.growth = true; }
        profile.stars[index] = Math.max(profile.stars[index], r.stars); profile.bestStreak[index] = Math.max(profile.bestStreak[index], r.bestStreak);
        while (profile.current < TOTAL_DEALS && profile.cleared[profile.current]) profile.current++;
        if (profile.current >= TOTAL_DEALS) profile.current = TOTAL_DEALS - 1;
      } else if (r.spec.kind === 'daily') { profile.dailyBest = Math.max(profile.dailyBest, r.score); profile.dailyStars = Math.max(profile.dailyStars, r.stars); profile.dailyBestStreak = Math.max(profile.dailyBestStreak, r.bestStreak); }
      else { profile.endlessBest = Math.max(profile.endlessBest, r.score); profile.endlessBestStreak = Math.max(profile.endlessBestStreak, r.bestStreak); }
      persist(); this.burst(WIDTH * 0.5, 360, 28, 0xffd56a, true); this.burst(WIDTH * 0.5, 360, 24, 0xa8d889, true); if (r.growth) { this.growBurst(195, 658); kit.audio.sfx('grow'); } kit.audio.sfx('clear'); kit.audio.sfx('boundary'); kit.juice.shake(5, 180);
    } else { kit.audio.sfx('fail'); kit.juice.shake(3, 110); }
    this.mode = 'result'; this.showPlayObjects(true); this.updateDebug();
  };
  MeadowScene.prototype.nextEndless = function () {
    this.endlessRound = (this.endlessRound || 1) + 1;
    var season = this.endlessRound % SEASONS.length, stage = LAYOUT_SCHEDULE[Math.min(LAYOUT_SCHEDULE.length - 1, Math.floor(this.endlessRound / 2))];
    this.startRun({ kind: 'endless', dealIndex: -1, season: season, stage: stage, seed: (0xE11D5EED + this.endlessRound * 9176) >>> 0, name: 'HARVEST RUN ' + this.endlessRound });
  };

  MeadowScene.prototype.burst = function (x, y, quantity, tint, reward) {
    var emitter = reward ? this.rewardParticles : this.cardParticles;
    if (!kit.juice.enabled) quantity = Math.min(quantity, 6);
    if (emitter.setParticleTint) emitter.setParticleTint(tint);
    emitter.explode(Math.min(quantity, MAX_PARTICLES), x, y);
  };
  MeadowScene.prototype.growBurst = function (x, y) { if (this.growParticles.setParticleTint) this.growParticles.setParticleTint(SEASONS[this.viewSeason].accent); this.growParticles.explode(18, x, y); };

  MeadowScene.prototype.renderCardParts = function (view, c, x, y, muted, hot, selected) {
    var w = 34, h = 44, red = c.suit === 1 || c.suit === 2, ink = muted ? '#607160' : red ? '#a8444a' : PAL.cardInk;
    view.bg.setPosition(x, y).setSize(w, h); setFillIfChanged(view.bg, muted ? 0xaeb9a5 : intColor(PAL.card), 1); view.bg.setStrokeStyle(hot || selected ? 3 : 1.5, hot ? 0xffe39a : selected ? 0xb9e8dc : 0x385044, 1);
    view.rank.setPosition(x, y - 9); view.mark.setPosition(x, y + 11); view.badge.setPosition(x, y + 20);
    setTextIfChanged(view.rank, RANKS[c.rank]); setTextIfChanged(view.mark, SUIT_MARKS[c.suit]); setTextIfChanged(view.badge, muted ? '•' : '');
    setColorIfChanged(view.rank, ink); setColorIfChanged(view.mark, ink); setColorIfChanged(view.badge, ink);
    view.bg.setVisible(true); view.rank.setVisible(true); view.mark.setVisible(true); view.badge.setVisible(true); view.glow.setVisible(hot || selected); view.glow.setPosition(x, y); view.glow.setSize(40, 50);
  };
  MeadowScene.prototype.hideCardView = function (view) { view.bg.setVisible(false); view.rank.setVisible(false); view.mark.setVisible(false); view.badge.setVisible(false); view.glow.setVisible(false); };
  MeadowScene.prototype.renderPlayCards = function () {
    var r = this.run, i, v, p, hot, selected;
    for (i = 0; i < this.cardViews.length; i++) this.hideCardView(this.cardViews[i]);
    if (!r) return;
    for (i = 0; i < this.layout.count; i++) {
      v = this.cardViews[i]; p = this.layout.positions[i];
      v.bg.setDepth(40 + p.row); v.glow.setDepth(41 + p.row); v.rank.setDepth(42 + p.row); v.mark.setDepth(42 + p.row); v.badge.setDepth(43 + p.row);
      if (!r.alive[i]) continue;
      hot = this.isPlayable(i); selected = r.hintIndex === i || r.selected === i;
      this.renderCardParts(v, r.tableau[i], p.x, p.y, !this.isFree(i), hot, selected);
    }
    if (r) {
      this.renderCardParts(this.animView, r.waste, 195, 536, false, false, false);
      var a = this.anim;
      if (!a) this.hideCardView(this.animView); else {
        var k = clamp(a.age / a.dur, 0, 1), e = k * k * (3 - 2 * k);
        this.renderCardParts(this.animView, a.card, a.x + (a.tx - a.x) * e, a.y + (a.ty - a.y) * e, false, false, false);
        this.animView.bg.setDepth(76); this.animView.rank.setDepth(77); this.animView.mark.setDepth(77); this.animView.badge.setDepth(77);
      }
    }
  };
  MeadowScene.prototype.drawMeadow = function (seasonIndex, x, y, w, h, compact) {
    var g = this.meadowArt, season = SEASONS[seasonIndex];
    g.clear(); g.setDepth(2);
    g.fillStyle(season.felt2, 0.48).fillRoundedRect(x, y, w, h, compact ? 14 : 26);
    g.fillStyle(0xf5e8a7, 0.14).fillCircle(x + w * 0.78, y + h * 0.2, compact ? 24 : 56);
    var slots = compact ? 8 : 12, values = profile.meadow[seasonIndex], baseY = y + h * 0.82;
    for (var i = 0; i < slots; i++) {
      var growth = values[i % 6], px = x + (i + 0.5) * w / slots, py = baseY - (i % 2) * (compact ? 8 : 22), scale = compact ? 0.48 : 1;
      g.fillStyle(0x493528, 0.82).fillEllipse(px, py, 28 * scale, 8 * scale);
      if (growth <= 0) { g.lineStyle(1.5, 0xb7c8ad, 0.34).strokeCircle(px, py - 8 * scale, 7 * scale); continue; }
      g.lineStyle(2.2 * scale, 0x568b48, 0.95).strokeLineShape(new Phaser.Geom.Line(px, py, px + Math.sin(this.simClock * 1.3 + i) * 4 * scale, py - (16 + growth * 9) * scale));
      for (var leaf = 0; leaf < growth + 1; leaf++) {
        g.fillStyle(0x6fb557, 0.95).fillEllipse(px + (leaf % 2 ? 6 : -6) * scale, py - (8 + leaf * 8) * scale, 12 * scale, 6 * scale);
      }
      if (growth >= 2) g.fillStyle(season.accent, 0.94).fillCircle(px + Math.sin(i) * 3 * scale, py - (22 + growth * 8) * scale, (3 + growth) * scale);
    }
    var animals = compact ? 3 : 6;
    for (var a = 0; a < animals; a++) {
      var ax = x + ((a * 71 + 35 + (this.simClock * (8 + a))) % Math.max(1, w)), ay = y + 30 + (a % 3) * (compact ? 15 : 42);
      g.fillStyle(season.accent, 0.7).fillCircle(ax, ay, compact ? 2 : 3);
      if (a % 2 === 0) g.fillStyle(season.accent, 0.28).fillCircle(ax - 5, ay - 2, compact ? 2 : 4);
    }
  };
  MeadowScene.prototype.renderMeadow = function () {
    var wins = campaignProgress(), season = SEASONS[this.viewSeason];
    this.showPlayObjects(false); this.drawMeadow(this.viewSeason, 16, 136, 358, 354, false);
    setTextIfChanged(this.menuProgress, 'CAMPAIGN  ' + wins + ' / ' + TOTAL_DEALS + '  ·  ★ ' + profile.stars.reduce(function (a, b) { return a + b; }, 0));
    setTextIfChanged(this.menuSeason, season.name + '  ·  ' + season.note);
    setTextIfChanged(this.menuHint, 'Growth is earned by cleared deals, never bought.');
    for (var i = 0; i < this.menuDots.length; i++) { setFillIfChanged(this.menuDots[i], i <= this.viewSeason ? season.accent : 0x315843, 1); }
    setTextIfChanged(this.menuButtons[0].label, profile.current >= TOTAL_DEALS - 1 && profile.cleared[profile.current] ? 'REPLAY FINAL DEAL' : 'PLAY DEAL ' + String(profile.current + 1).padStart(2, '0'));
    setTextIfChanged(this.menuButtons[1].label, 'DAILY DEAL  ★ ' + profile.dailyStars);
    setTextIfChanged(this.menuButtons[2].label, 'HARVEST RUN  ' + profile.endlessBest);
    this.setButtonState(this.menuButtons[0], false, false); this.setButtonState(this.menuButtons[1], false, false); this.setButtonState(this.menuButtons[2], false, false);
  };
  MeadowScene.prototype.renderPlay = function () {
    var r = this.run, season = SEASONS[r.spec.season];
    this.showPlayObjects(true); this.drawMeadow(r.spec.season, 18, 610, 354, 98, true); this.renderPlayCards();
    setTextIfChanged(this.hudDeal, r.spec.name); setTextIfChanged(this.hudStage, r.layout.name + '  ·  ' + (r.spec.kind === 'daily' ? 'FIXED SEED' : r.spec.kind === 'endless' ? 'NO TIMER' : 'SOLVABLE'));
    setTextIfChanged(this.hudScore, 'SCORE  ' + r.score); var mult = Math.min(6, 1 + Math.max(0, r.streak - 1) * 0.5); setTextIfChanged(this.hudChain, r.streak ? 'CHAIN  x' + mult.toFixed(1) : 'CHAIN  -');
    this.hudMeter.setSize(214 * clamp(r.streak / 10, 0, 1), 7); setFillIfChanged(this.hudMeter, r.streak >= 4 ? intColor(PAL.gold) : intColor(PAL.mint), 1);
    setTextIfChanged(this.hudProgress, 'MEADOW  ' + campaignProgress() + '/' + TOTAL_DEALS); setTextIfChanged(this.wasteRank, RANKS[r.waste.rank]); setTextIfChanged(this.wasteMark, SUIT_MARKS[r.waste.suit]); setColorIfChanged(this.wasteRank, r.waste.suit === 1 || r.waste.suit === 2 ? '#a8444a' : PAL.cardInk); setColorIfChanged(this.wasteMark, r.waste.suit === 1 || r.waste.suit === 2 ? '#a8444a' : PAL.cardInk);
    setTextIfChanged(this.wildCount, String(profile.wilds)); setColorIfChanged(this.wildCount, profile.wilds ? PAL.violet : PAL.dim);
    this.stockBack.setAlpha(r.drawIndex < r.stock.length ? 1 : 0.34); this.wasteBg.setStrokeStyle(2, season.accent, 0.72);
    setTextIfChanged(this.controls[0].label, '▣ DRAW ' + Math.max(0, r.stock.length - r.drawIndex)); setTextIfChanged(this.controls[1].label, '✦ WILD ' + profile.wilds); setTextIfChanged(this.controls[2].label, '↶ UNDO ' + profile.undoCharges); setTextIfChanged(this.controls[3].label, '? HINT');
    this.setButtonState(this.controls[0], false, r.drawIndex >= r.stock.length); this.setButtonState(this.controls[1], false, profile.wilds <= 0); this.setButtonState(this.controls[2], false, profile.undoCharges <= 0 || !this.history.length); this.setButtonState(this.controls[3], r.hintIndex >= 0, false);
    if (this.toast.time > 0) { this.toastBg.setVisible(true); this.toastText.setVisible(true); setTextIfChanged(this.toastText, this.toast.text); setColorIfChanged(this.toastText, this.toast.color); } else { this.toastBg.setVisible(false); this.toastText.setVisible(false); }
    if (r.result) this.renderResult(); else { this.resultShade.setVisible(false); this.resultPanel.setVisible(false); this.hideResultButtons(); }
  };
  MeadowScene.prototype.renderResult = function () {
    var r = this.run, win = r.result === 'win';
    this.resultShade.setVisible(true); this.resultPanel.setVisible(true); this.resultTitle.setVisible(true); this.resultSub.setVisible(true); this.resultScore.setVisible(true); this.resultStats.setVisible(true); this.resultGrowth.setVisible(true);
    setTextIfChanged(this.resultTitle, win ? 'MEADOW RESTORED' : 'NO MATCHES'); setColorIfChanged(this.resultTitle, win ? PAL.gold : PAL.rose); setTextIfChanged(this.resultSub, win ? (r.spec.kind === 'daily' ? 'Fixed seed cleared.' : r.spec.name + ' complete.') : 'Retry is free. No energy.'); setTextIfChanged(this.resultScore, 'SCORE  ' + r.score); setTextIfChanged(this.resultStats, win ? ('★'.repeat(r.stars) + '  ·  best chain ' + r.bestStreak + '  ·  wilds ' + profile.wilds + '  ·  undo ' + profile.undoCharges) : (r.cardsLeft + ' cards remain  ·  wilds ' + profile.wilds)); setTextIfChanged(this.resultGrowth, win ? (r.growth ? 'MEADOW  +1 GROWTH' : 'MEADOW  HELD THE GAIN') : 'Nothing lost. Keep the meadow growing.');
    this.resultButtons[0].rect.setVisible(true); this.resultButtons[0].label.setVisible(true); this.resultButtons[1].rect.setVisible(true); this.resultButtons[1].label.setVisible(true); this.resultButtons[2].rect.setVisible(true); this.resultButtons[2].label.setVisible(true);
    setTextIfChanged(this.resultButtons[0].label, r.spec.kind === 'endless' && win ? 'NEXT HARVEST' : win ? 'NEXT DEAL' : 'RETRY FREE'); setTextIfChanged(this.resultButtons[1].label, 'REPLAY'); setTextIfChanged(this.resultButtons[2].label, 'MEADOW');
    this.setButtonState(this.resultButtons[0], false, false); this.setButtonState(this.resultButtons[1], false, false); this.setButtonState(this.resultButtons[2], false, false);
  };
  MeadowScene.prototype.render = function () {
    if (this.mode === 'meadow') this.renderMeadow(); else this.renderPlay();
    var juice = kit.juice.frame(); this.fieldRoot.setPosition(juice.dx, juice.dy);
  };
  MeadowScene.prototype.updateDebug = function () { syncDebug(); };

  MeadowScene.prototype.fixedStep = function (dt) {
    this.simClock += dt;
    if (this.toast.time > 0) this.toast.time = Math.max(0, this.toast.time - dt);
    if (this.anim) { this.anim.age += dt; if (this.anim.age >= this.anim.dur) this.anim = null; }
    if (this.mode === 'play' || this.mode === 'result') this.handleKeys();
  };
  MeadowScene.prototype.keyPressed = function (code) { var down = kit.input.keyDown(code), was = !!this.keyPrev[code]; this.keyPrev[code] = down; return down && !was; };
  MeadowScene.prototype.handleKeys = function () {
    if (this.keyPressed('Escape')) { this.showMeadow(); return; }
    if (this.mode === 'result') { if (this.keyPressed('Space') || this.keyPressed('Enter')) this.handleResultTap(0); return; }
    if (!this.run) return;
    var left = this.keyPressed('ArrowLeft'), right = this.keyPressed('ArrowRight');
    if (left || right) { var list = this.freeList(); if (list.length) { var at = list.indexOf(this.run.selected), dir = right ? 1 : -1; this.run.selected = list[(at < 0 ? 0 : (at + dir + list.length) % list.length)]; } }
    if (this.keyPressed('ArrowDown')) this.doDraw();
    if (this.keyPressed('ArrowUp') && this.run.selected >= 0) this.doPlay(this.run.selected, true);
    if (this.keyPressed('Space') || this.keyPressed('Enter')) { var i = this.run.selected >= 0 ? this.run.selected : this.playableList()[0]; if (i != null && i >= 0) this.doPlay(i, false); }
    if (this.keyPressed('KeyH')) this.doHint(); if (this.keyPressed('KeyU')) this.doUndo();
  };
  MeadowScene.prototype.update = function (time, delta) {
    var frameDt = Math.min(0.05, Math.max(0, delta / 1000)), juice = kit.juice.frame(), steps = 0;
    var emitters = [this.cardParticles, this.rewardParticles, this.growParticles];
    for (var ei = 0; ei < emitters.length; ei++) { if (juice.frozen && emitters[ei].pause) emitters[ei].pause(); else if (!juice.frozen && emitters[ei].resume) emitters[ei].resume(); }
    if (!juice.frozen) { this.accumulator = Math.min(0.25, this.accumulator + frameDt); while (this.accumulator >= STEP && steps < MAX_STEPS) { this.fixedStep(STEP); this.accumulator -= STEP; steps++; } }
    this.renderClock += steps * STEP; this.render(); this.updateDebug();
  };

  // ------------------------------------------------------------- hit testing
  function inside(box, x, y) { return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h; }
  MeadowScene.prototype.buttonHit = function (button, x, y) { return inside({ x: button.rect.x - button.rect.displayWidth * 0.5, y: button.rect.y - button.rect.displayHeight * 0.5, w: button.rect.displayWidth, h: button.rect.displayHeight }, x, y); };
  MeadowScene.prototype.cardHit = function (x, y) {
    if (!this.run) return -1;
    var best = -1, bestScore = -Infinity;
    for (var i = 0; i < this.layout.count; i++) {
      if (!this.run.alive[i]) continue;
      var p = this.layout.positions[i], w = 22, h = 27;
      if (x < p.x - w || x > p.x + w || y < p.y - h || y > p.y + h) continue;
      var score = (this.isPlayable(i) ? 100000 : 0) + (this.isFree(i) ? 10000 : 0) + p.row * 100 + i;
      if (score > bestScore) { best = i; bestScore = score; }
    }
    return best;
  };
  MeadowScene.prototype.handleResultTap = function (index) {
    if (!this.run) return;
    this.startAudio(); kit.audio.sfx('tap');
    if (index === 0) { if (this.run.spec.kind === 'endless' && this.run.result === 'win') this.nextEndless(); else if (this.run.result === 'win') this.startRun(campaignSpec(Math.min(TOTAL_DEALS - 1, this.run.spec.dealIndex + 1))); else this.restartCurrent(); }
    else if (index === 1) { if (this.run.spec.kind === 'daily') this.startRun(dailySpec()); else if (this.run.spec.kind === 'endless') this.startEndless(); else this.startRun(campaignSpec(this.run.spec.dealIndex)); }
    else this.showMeadow();
  };
  MeadowScene.prototype.handleTap = function (x, y) {
    this.startAudio();
    if (this.mode === 'meadow') {
      if (this.buttonHit(this.settingsButton, x, y)) { kit.openSettings(); return; }
      if (this.buttonHit(this.menuButtons[0], x, y)) { this.startRun(campaignSpec(profile.current)); return; }
      if (this.buttonHit(this.menuButtons[1], x, y)) { this.startRun(dailySpec()); return; }
      if (this.buttonHit(this.menuButtons[2], x, y)) { this.startEndless(); return; }
      if (y >= 548 && y <= 594 && x >= 125 && x <= 270) { this.viewSeason = clamp(Math.round((x - 145) / 20), 0, SEASONS.length - 1); this.setSeason(this.viewSeason); return; }
      return;
    }
    if (this.mode === 'result') {
      for (var rb = 0; rb < this.resultButtons.length; rb++) if (this.buttonHit(this.resultButtons[rb], x, y)) { this.handleResultTap(rb); return; }
      return;
    }
    if (this.buttonHit(this.pauseButton, x, y)) { kit.pause('manual'); return; }
    if (this.buttonHit(this.controls[0], x, y)) { this.doDraw(); return; }
    if (this.buttonHit(this.controls[1], x, y)) { var legal = this.cardHit(x, y); if (profile.wilds && legal >= 0 && this.run.selected === legal) this.doPlay(legal, true); else this.run.selected = this.run.selected === -2 ? -1 : -2; this.showToast(profile.wilds ? 'WILD ARMED · TAP ANY FREE CARD' : 'CLEAR A PEAK TO EARN A WILD', PAL.violet, 1.0); return; }
    if (this.buttonHit(this.controls[2], x, y)) { this.doUndo(); return; }
    if (this.buttonHit(this.controls[3], x, y)) { this.doHint(); return; }
    var hit = this.cardHit(x, y); if (hit >= 0) { if (this.run.selected === -2) this.doPlay(hit, true); else this.doPlay(hit, false); }
  };

  // Window gesture layer is deliberately registered after GGKit.create().
  // Its own map owns releases because GGKit removes a pointer first.
  function screenToWorld(event) {
    var game = (typeof Game !== 'undefined' && Game) ? Game : sceneRef && sceneRef.game;
    if (!sceneRef || !game || !game.canvas) return { x: 0, y: 0 };
    var rect = game.canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * WIDTH / Math.max(1, rect.width), y: (event.clientY - rect.top) * HEIGHT / Math.max(1, rect.height) };
  }
  function claimPointer(event) {
    if (!sceneRef || !sceneRef.game || event.target !== sceneRef.game.canvas || kit.paused) return;
    var p = screenToWorld(event); sceneRef.gestureMap[event.pointerId] = { sx: p.x, sy: p.y, x: p.x, y: p.y };
    var kitPointer = kit.input.pointers.get(event.pointerId); if (kitPointer) kitPointer.zone = 'meadow-solitaire';
    event.preventDefault();
  }
  function movePointer(event) { var g = sceneRef && sceneRef.gestureMap[event.pointerId]; if (!g || kit.paused) return; var p = screenToWorld(event); g.x = p.x; g.y = p.y; }
  function releasePointer(event) { var g = sceneRef && sceneRef.gestureMap[event.pointerId]; if (!g) return; delete sceneRef.gestureMap[event.pointerId]; if (kit.paused) return; var p = screenToWorld(event), dx = p.x - g.sx, dy = p.y - g.sy; if (dx * dx + dy * dy <= 22 * 22) sceneRef.handleTap(p.x, p.y); }
  window.addEventListener('pointerdown', claimPointer, { passive: false });
  window.addEventListener('pointermove', movePointer, { passive: true });
  window.addEventListener('pointerup', releasePointer, { passive: false });
  window.addEventListener('pointercancel', function (event) { if (sceneRef) delete sceneRef.gestureMap[event.pointerId]; }, { passive: true });
  window.addEventListener('blur', function () { if (sceneRef) sceneRef.gestureMap = Object.create(null); });

  document.getElementById('resume-button').addEventListener('click', function () { kit.resume('manual'); });
  document.getElementById('pause-menu-button').addEventListener('click', function () { if (sceneRef) sceneRef.showMeadow(); kit.resume('manual'); });

  // --------------------------------------------------------------- game boot
  var Game = new Phaser.Game({
    type: Phaser.CANVAS, parent: 'game', backgroundColor: '#102a22',
    render: { antialias: true, antialiasGL: false, roundPixels: true, clearBeforeRender: true },
    scale: { mode: Phaser.Scale.FIT, width: WIDTH, height: HEIGHT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 4 }, scene: [BootScene, MeadowScene]
  });
  // Phaser's canvas is created after the game constructor. Keep the reference
  // for the window gesture layer without using Phaser's pointer map as truth.
  setTimeout(function () { if (sceneRef) sceneRef.game = Game; }, 0);
}());
