/* Lantern Bingo, fleet F16. Phaser 3 render shell with GGKit-owned save, audio, input and lifecycle. */
(function (root) {
  'use strict';

  var Phaser = root.Phaser;
  var W = 390;
  var H = 844;
  var STEP = 1 / 60;
  var MAX_STEPS = 4;
  var FONT = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif';
  var REDUCED = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var DECK = 75;
  var COLS = ['L', 'I', 'G', 'H', 'T'];

  var C = {
    ink: '#fdf4e3', muted: '#b9aa95', deep: '#0b1018', panel: '#141d2b', panel2: '#1c2739',
    line: '#33445d', gold: '#ffc660', ember: '#ff8d5c', rose: '#ff7fa8', jade: '#6ee2c8',
    sky: '#7fc9ff', violet: '#c6a4ff', slate: '#8294aa', red: '#ff6a71', white: '#ffffff'
  };

  var CITIES = [
    { id: 'harbour', name: 'Kindlewharf Harbour', short: 'HARBOUR', motif: 'harbour',
      bg: '#0a1622', bg2: '#123049', glow: '#ffc367', hot: '#ff8f5f', cool: '#63d7d0',
      paper: '#f7e7c8', ink: '#231708', music: 'music_lantern' },
    { id: 'shrine', name: 'Stonebell Shrine', short: 'SHRINE', motif: 'shrine',
      bg: '#0d1024', bg2: '#232c56', glow: '#9fe9c4', hot: '#ff8fae', cool: '#ffe08a',
      paper: '#eef1e2', ink: '#131b22', music: 'music_lantern' },
    { id: 'market', name: 'Emberlane Night Market', short: 'MARKET', motif: 'market',
      bg: '#160c1e', bg2: '#3a1740', glow: '#ffd166', hot: '#ff5fa2', cool: '#7ee7b0',
      paper: '#ffeccf', ink: '#2a1410', music: 'music_lantern' },
    { id: 'terrace', name: 'Glasswater Terrace', short: 'TERRACE', motif: 'terrace',
      bg: '#08131f', bg2: '#123a52', glow: '#7fe4ff', hot: '#a58cff', cool: '#b8f27a',
      paper: '#e8f3f7', ink: '#0c2130', music: 'music_hall' },
    { id: 'finale', name: 'Skyfire Finale', short: 'FINALE', motif: 'finale',
      bg: '#100a1c', bg2: '#43164a', glow: '#ffe9a8', hot: '#ff6a5c', cool: '#7fa8ff',
      paper: '#fff3e0', ink: '#2a1420', music: 'music_skyfire' }
  ];

  var SOUVENIRS = [
    { name: 'Brass Buoy', city: 0 }, { name: 'Net Lantern', city: 0 },
    { name: 'Tide Bell', city: 0 }, { name: 'Gull Kite', city: 0 },
    { name: 'Stone Bell', city: 1 }, { name: 'Pine Charm', city: 1 },
    { name: 'Snow Moth', city: 1 }, { name: 'Cloud Ribbon', city: 1 },
    { name: 'Sugar Fan', city: 2 }, { name: 'Spice Lamp', city: 2 },
    { name: 'Paper Tiger', city: 2 }, { name: 'Copper Ladle', city: 2 },
    { name: 'Rain Chime', city: 3 }, { name: 'Glass Fish', city: 3 },
    { name: 'Mirror Fan', city: 3 }, { name: 'Reed Boat', city: 3 },
    { name: 'Sky Ember', city: 4 }, { name: 'Crown Wick', city: 4 },
    { name: 'Comet Sash', city: 4 }, { name: 'First Flame', city: 4 }
  ];

  var LINES = [];
  (function () {
    var r, c, set;
    for (r = 0; r < 5; r++) { set = []; for (c = 0; c < 5; c++) set.push(r * 5 + c); LINES.push(set); }
    for (c = 0; c < 5; c++) { set = []; for (r = 0; r < 5; r++) set.push(r * 5 + c); LINES.push(set); }
  })();
  var ALL25 = (function () { var a = []; for (var i = 0; i < 25; i++) a.push(i); return a; })();

  function maskOf(list) { var m = []; for (var i = 0; i < 25; i++) m.push(list.indexOf(i) >= 0); return m; }

  var PATTERNS = [
    { id: 'line', name: 'Any Line', kind: 'lines', n: 1, mask: maskOf([10, 11, 12, 13, 14]) },
    { id: 'corners', name: 'Four Corners', kind: 'sets', sets: [[0, 4, 20, 24]], mask: maskOf([0, 4, 20, 24]) },
    { id: 'diag', name: 'Single Diagonal', kind: 'sets', sets: [[0, 6, 12, 18, 24], [4, 8, 12, 16, 20]], mask: maskOf([0, 6, 12, 18, 24]) },
    { id: 'plus', name: 'Crossbeam', kind: 'sets', sets: [[2, 7, 12, 17, 22, 10, 11, 13, 14]], mask: maskOf([2, 7, 12, 17, 22, 10, 11, 13, 14]) },
    { id: 'tee', name: 'Torch T', kind: 'sets', sets: [[0, 1, 2, 3, 4, 7, 12, 17, 22]], mask: maskOf([0, 1, 2, 3, 4, 7, 12, 17, 22]) },
    { id: 'two', name: 'Two Lines', kind: 'lines', n: 2, mask: maskOf([5, 6, 7, 8, 9, 15, 16, 17, 18, 19]) },
    { id: 'stamp', name: 'Postage Lantern', kind: 'sets', sets: [[0, 1, 5, 6], [3, 4, 8, 9], [15, 16, 20, 21], [18, 19, 23, 24]], mask: maskOf([0, 1, 5, 6]) },
    { id: 'ell', name: 'Lamp L', kind: 'sets', sets: [[0, 5, 10, 15, 20, 21, 22, 23, 24]], mask: maskOf([0, 5, 10, 15, 20, 21, 22, 23, 24]) },
    { id: 'bigx', name: 'Lantern X', kind: 'sets', sets: [[0, 6, 12, 18, 24, 4, 8, 16, 20]], mask: maskOf([0, 6, 12, 18, 24, 4, 8, 16, 20]) },
    { id: 'diamond', name: 'Paper Diamond', kind: 'sets', sets: [[2, 6, 8, 10, 12, 14, 16, 18, 22]], mask: maskOf([2, 6, 8, 10, 12, 14, 16, 18, 22]) },
    { id: 'frame', name: 'Outer Frame', kind: 'sets', sets: [[0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24]], mask: maskOf([0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24]) },
    { id: 'three', name: 'Triple Beam', kind: 'lines', n: 3, mask: maskOf([0, 1, 2, 3, 4, 10, 11, 12, 13, 14, 20, 21, 22, 23, 24]) },
    { id: 'black', name: 'Blackout', kind: 'sets', sets: [ALL25.slice()], mask: maskOf(ALL25) }
  ];
  var PATTERN_BY_ID = {};
  (function () { for (var i = 0; i < PATTERNS.length; i++) PATTERN_BY_ID[PATTERNS[i].id] = PATTERNS[i]; })();
  function patternById(id) { return PATTERN_BY_ID[id] || PATTERNS[0]; }

  /* The 20-city Lantern Tour. Call intervals hold the prototype's tuned band
     (2.25 s opening room down to 1.16 s in the final hall). */
  var TOUR = [
    { city: 0, room: 'Rope Walk', pattern: 'line', cards: 1, interval: 2.60, rivals: 2, acc: 0.55 },
    { city: 0, room: 'Cinder Porch', pattern: 'line', cards: 1, interval: 2.40, rivals: 3, acc: 0.62 },
    { city: 0, room: 'Salt Lantern Hall', pattern: 'corners', cards: 2, interval: 2.25, rivals: 3, acc: 0.66 },
    { city: 0, room: 'Harbour Finale', pattern: 'diag', cards: 2, interval: 2.15, rivals: 4, acc: 0.70 },
    { city: 1, room: 'Moss Steps', pattern: 'plus', cards: 2, interval: 2.05, rivals: 4, acc: 0.72 },
    { city: 1, room: 'Bell Court', pattern: 'tee', cards: 2, interval: 1.95, rivals: 4, acc: 0.74 },
    { city: 1, room: 'Pine Terrace', pattern: 'two', cards: 3, interval: 1.90, rivals: 5, acc: 0.76 },
    { city: 1, room: 'Shrine Finale', pattern: 'stamp', cards: 3, interval: 1.82, rivals: 5, acc: 0.78 },
    { city: 2, room: 'Sugar Row', pattern: 'ell', cards: 3, interval: 1.76, rivals: 5, acc: 0.80 },
    { city: 2, room: 'Moth Garden', pattern: 'bigx', cards: 3, interval: 1.70, rivals: 5, acc: 0.82 },
    { city: 2, room: 'Spice Arcade', pattern: 'diamond', cards: 3, interval: 1.62, rivals: 6, acc: 0.84 },
    { city: 2, room: 'Market Finale', pattern: 'two', cards: 3, interval: 1.56, rivals: 6, acc: 0.85 },
    { city: 3, room: 'Blueglass Walk', pattern: 'frame', cards: 4, interval: 1.50, rivals: 6, acc: 0.86 },
    { city: 3, room: 'Rain Balcony', pattern: 'bigx', cards: 4, interval: 1.44, rivals: 6, acc: 0.88 },
    { city: 3, room: 'Mirror Landing', pattern: 'three', cards: 4, interval: 1.38, rivals: 7, acc: 0.89 },
    { city: 3, room: 'Terrace Finale', pattern: 'diamond', cards: 4, interval: 1.32, rivals: 7, acc: 0.90 },
    { city: 4, room: 'Ember Stair', pattern: 'frame', cards: 4, interval: 1.28, rivals: 7, acc: 0.91 },
    { city: 4, room: 'Crown Gallery', pattern: 'three', cards: 4, interval: 1.24, rivals: 7, acc: 0.92 },
    { city: 4, room: 'Thunder Hall', pattern: 'black', cards: 4, interval: 1.20, rivals: 7, acc: 0.94 },
    { city: 4, room: 'Skyfire Finale', pattern: 'black', cards: 4, interval: 1.16, rivals: 7, acc: 0.96 }
  ];

  var RUSH = [
    { name: 'Paper Cuts', city: 0, cards: 2, interval: 1.95, budget: 22,
      patterns: ['stamp', 'diag', 'plus', 'tee', 'corners'], unlock: 0 },
    { name: 'Glass Runs', city: 3, cards: 2, interval: 1.72, budget: 24,
      patterns: ['ell', 'diamond', 'bigx', 'two', 'frame'], unlock: 8 },
    { name: 'Skyfire Set', city: 4, cards: 3, interval: 1.48, budget: 30,
      patterns: ['frame', 'three', 'diamond', 'bigx', 'black'], unlock: 16 }
  ];

  var ENDLESS_PATTERNS = ['line', 'corners', 'diag', 'two', 'plus', 'stamp', 'tee', 'ell', 'bigx', 'diamond', 'frame', 'three', 'black'];
  var RIVAL_NAMES = ['Mica', 'Pax', 'Orrin', 'Tavi', 'Juno', 'Kite', 'Rune'];
  var CHIPS = [
    { id: 'auto', name: 'AUTO', note: 'Daubs every live match on this call' },
    { id: 'double', name: 'DOUBLE', note: 'Double score for 8 seconds' },
    { id: 'freeze', name: 'FREEZE', note: 'Freezes the call clock for 4.5 seconds' },
    { id: 'peek', name: 'PEEK', note: 'Shows the next three calls for 4.5 seconds' }
  ];
  var CHARGE_COST = 3;
  var CHIP_MAX = 3;
  var DOUBLE_TIME = 8;
  var FREEZE_TIME = 4.5;
  var PEEK_TIME = 4.5;
  var LIVE_FRACTION = 0.78;

  var LAY = {
    hudY: 8, hudH: 40,
    coachY: 52, coachH: 24,
    callY: 82, callH: 116,
    oddsY: 202, oddsH: 22,
    cardsY: 228, cardsH: 472,
    meterY: 706, meterH: 10,
    chipsY: 722, chipW: 86, chipH: 70, chipGap: 13
  };
  var GRID = { ox: 17.5 / 260, oy: 30 / 260, cell: 45 / 260, face: 260 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function whole(v, d) { return Number.isInteger(v) ? v : d; }
  function tint(hex) { return parseInt(String(hex).replace('#', ''), 16) || 0xffffff; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeBack(t) { var c = 1.70158; return 1 + c * Math.pow(t - 1, 3) + (c + 0.3) * Math.pow(t - 1, 2); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function randInt(n) { return Math.floor(Math.random() * n); }
  function mixHex(a, b, t) {
    var x = tint(a), y = tint(b);
    var r = Math.round(lerp((x >> 16) & 255, (y >> 16) & 255, t));
    var g = Math.round(lerp((x >> 8) & 255, (y >> 8) & 255, t));
    var bl = Math.round(lerp(x & 255, y & 255, t));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  function setTextIfChanged(node, value, colorValue) {
    if (!node) return;
    var next = String(value);
    if (node.text !== next) node.setText(next);
    if (colorValue && node._lbColor !== colorValue) { node.setColor(colorValue); node._lbColor = colorValue; }
  }
  function setFillIfChanged(node, value, alpha) {
    if (!node) return;
    var next = tint(value);
    if (node._lbFill !== next || (alpha != null && node._lbAlpha !== alpha)) {
      node.setFillStyle(next, alpha == null ? 1 : alpha); node._lbFill = next; node._lbAlpha = alpha;
    }
  }
  function setStrokeIfChanged(node, value, width) {
    if (!node) return;
    var next = tint(value);
    if (node._lbStroke !== next || node._lbStrokeW !== width) {
      node.setStrokeStyle(width || 1, next, 1); node._lbStroke = next; node._lbStrokeW = width;
    }
  }
  function setTextureIfChanged(node, key) { if (node && node._lbTex !== key) { node.setTexture(key); node._lbTex = key; } }
  function setTintIfChanged(node, value) { var v = tint(value); if (node && node._lbTint !== v) { node.setTint(v); node._lbTint = v; } }
  function setAlphaIfChanged(node, v) { if (node && node._lbA !== v) { node.setAlpha(v); node._lbA = v; } }
  function visible(node, value) { if (node && node.visible !== value) node.setVisible(value); }

  function cityOf(index) { return CITIES[clamp(whole(index, 0), 0, CITIES.length - 1)]; }
  function tourStop(index) { return TOUR[clamp(whole(index, 0), 0, TOUR.length - 1)]; }
  function rushLadder(index) { return RUSH[clamp(whole(index, 0), 0, RUSH.length - 1)]; }

  function lineCount(m) {
    var n = 0, i, j, ok;
    for (i = 0; i < LINES.length; i++) {
      ok = true;
      for (j = 0; j < 5; j++) if (!m[LINES[i][j]]) { ok = false; break; }
      if (ok) n++;
    }
    return n;
  }
  function patComplete(m, pat) {
    var i, j, s, ok;
    if (pat.kind === 'lines') return lineCount(m) >= pat.n;
    for (i = 0; i < pat.sets.length; i++) {
      s = pat.sets[i]; ok = true;
      for (j = 0; j < s.length; j++) if (!m[s[j]]) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }
  function patProgress(m, pat) {
    var i, j, s, cnt, best = 0;
    if (pat.kind === 'lines') {
      var lc = lineCount(m), part = 0;
      for (i = 0; i < LINES.length; i++) {
        cnt = 0;
        for (j = 0; j < 5; j++) if (m[LINES[i][j]]) cnt++;
        if (cnt < 5) part = Math.max(part, cnt / 5);
      }
      return clamp((lc + part) / pat.n, 0, 1);
    }
    for (i = 0; i < pat.sets.length; i++) {
      s = pat.sets[i]; cnt = 0;
      for (j = 0; j < s.length; j++) if (m[s[j]]) cnt++;
      best = Math.max(best, cnt / s.length);
    }
    return best;
  }
  function findOneAway(m, pat, out) {
    out.length = 0;
    if (patComplete(m, pat)) return out;
    for (var i = 0; i < 25; i++) {
      if (m[i]) continue;
      m[i] = true;
      if (patComplete(m, pat)) out.push(i);
      m[i] = false;
      if (out.length >= 4) break;
    }
    return out;
  }

  // ------------------------------------------------------------- save state
  var SAVE_VERSION = 1;
  function boolArray(n) { var a = []; for (var i = 0; i < n; i++) a.push(false); return a; }
  function zeroArray(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }

  function defaultProfile() {
    return {
      v: SAVE_VERSION,
      unlocked: 0,
      cleared: boolArray(TOUR.length),
      best: zeroArray(TOUR.length),
      souvenirs: boolArray(SOUVENIRS.length),
      endlessBest: 0,
      endlessHalls: 0,
      rushBest: zeroArray(RUSH.length),
      rushCleared: boolArray(RUSH.length),
      tutorial: false,
      crowns: 0
    };
  }
  function validProfile(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    if (v.v !== SAVE_VERSION) return false;
    if (!Number.isInteger(v.unlocked) || v.unlocked < 0 || v.unlocked >= TOUR.length) return false;
    if (!Array.isArray(v.cleared) || v.cleared.length !== TOUR.length) return false;
    if (!Array.isArray(v.best) || v.best.length !== TOUR.length) return false;
    if (!Array.isArray(v.souvenirs) || v.souvenirs.length !== SOUVENIRS.length) return false;
    if (!Array.isArray(v.rushBest) || v.rushBest.length !== RUSH.length) return false;
    if (!Array.isArray(v.rushCleared) || v.rushCleared.length !== RUSH.length) return false;
    var i;
    for (i = 0; i < v.cleared.length; i++) if (typeof v.cleared[i] !== 'boolean') return false;
    for (i = 0; i < v.souvenirs.length; i++) if (typeof v.souvenirs[i] !== 'boolean') return false;
    for (i = 0; i < v.rushCleared.length; i++) if (typeof v.rushCleared[i] !== 'boolean') return false;
    for (i = 0; i < v.best.length; i++) if (!Number.isInteger(v.best[i]) || v.best[i] < 0 || v.best[i] > 99999999) return false;
    for (i = 0; i < v.rushBest.length; i++) if (!Number.isInteger(v.rushBest[i]) || v.rushBest[i] < 0 || v.rushBest[i] > 99999999) return false;
    if (!Number.isInteger(v.endlessBest) || v.endlessBest < 0 || v.endlessBest > 99999999) return false;
    if (!Number.isInteger(v.endlessHalls) || v.endlessHalls < 0 || v.endlessHalls > 9999) return false;
    if (!Number.isInteger(v.crowns) || v.crowns < 0 || v.crowns > TOUR.length) return false;
    if (typeof v.tutorial !== 'boolean') return false;
    return true;
  }
  function souvenirCount(p) { var n = 0; for (var i = 0; i < p.souvenirs.length; i++) if (p.souvenirs[i]) n++; return n; }
  function clearedCount(p) { var n = 0; for (var i = 0; i < p.cleared.length; i++) if (p.cleared[i]) n++; return n; }

  // ------------------------------------------------------- verification hook
  var bootState = {
    mode: 'boot', screen: 'boot', stage: 0, stageName: 'boot', city: 'boot',
    pattern: 'none', progress: 0, score: 0, health: 1, calls: 0, callsLeft: DECK,
    streak: 0, chips: [0, 0, 0, 0], rivals: [], souvenirs: 0, cleared: 0, best: 0,
    ended: false, result: '', ready: false, forceMode: null, forceStage: null
  };
  var hook = root.__lb && typeof root.__lb === 'object' ? root.__lb : {};
  if (!hook.state || typeof hook.state !== 'object') hook.state = bootState;
  if (!Object.prototype.hasOwnProperty.call(hook, 'forceMode')) hook.forceMode = null;
  if (!Object.prototype.hasOwnProperty.call(hook, 'forceStage')) hook.forceStage = null;
  root.__lb = hook;

  function normalizeMode(value) {
    var v = String(value == null ? '' : value).toLowerCase();
    if (v === 'tour' || v === 'endless' || v === 'rush' || v === 'menu' || v === 'map' || v === 'case') return v;
    return null;
  }

  // ------------------------------------------------------------------- kit
  var Game = { phaser: null, play: null };
  var profile;
  var keyEdges = Object.create(null);
  var kit = root.GGKit ? root.GGKit.create({
    slug: 'lantern-bingo', orientation: 'portrait', validateSave: validProfile,
    onPause: function () {
      keyEdges = Object.create(null);
      if (Game.play) { Game.play.pointerSeen.clear(); Game.play.pointerEdges.length = 0; Game.play.accumulator = 0; }
    },
    onResume: function () {
      keyEdges = Object.create(null);
      if (Game.play) { Game.play.pointerSeen.clear(); Game.play.pointerEdges.length = 0; }
    },
    onRestart: function () { if (Game.play) Game.play.restartCurrent(); }
  }) : null;
  if (kit) profile = kit.save.get(defaultProfile());
  if (!validProfile(profile)) profile = defaultProfile();
  if (kit) kit.audio.register({
    tap: 'assets/tap.mp3', daub: 'assets/daub.mp3', streak: 'assets/streak.mp3',
    miss: 'assets/miss.mp3', call: 'assets/call.mp3', charge: 'assets/charge.mp3',
    chip: 'assets/chip.mp3', oneaway: 'assets/oneaway.mp3', bingo: 'assets/bingo.mp3',
    rivalwin: 'assets/rivalwin.mp3', souvenir: 'assets/souvenir.mp3', back: 'assets/back.mp3',
    start: 'assets/start.mp3',
    music_lantern: 'assets/music_lantern.mp3', music_hall: 'assets/music_hall.mp3',
    music_skyfire: 'assets/music_skyfire.mp3'
  });
  var SFX_KEYS = ['tap', 'daub', 'streak', 'miss', 'call', 'charge', 'chip', 'oneaway',
    'bingo', 'rivalwin', 'souvenir', 'back', 'start'];
  function persist() { if (kit) kit.save.set(profile); }
  function sfx(name, volume, rate) {
    if (kit) kit.audio.sfx(name, { volume: volume == null ? 0.85 : volume, rate: rate || 1 });
  }

  // --------------------------------------------------------------- run model
  function makeCard() {
    return { v: zeroArray(25), m: boolArray(25), live: -1, oneAway: [], hadOneAway: false, done: false };
  }
  function dealCard(card) {
    var col, row, pool, i, j, tmp, pick;
    for (col = 0; col < 5; col++) {
      pool = [];
      for (i = 0; i < 15; i++) pool.push(col * 15 + 1 + i);
      for (i = pool.length - 1; i > 0; i--) { j = randInt(i + 1); tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
      pick = pool.slice(0, 5).sort(function (a, b) { return a - b; });
      for (row = 0; row < 5; row++) {
        card.v[row * 5 + col] = pick[row];
        card.m[row * 5 + col] = false;
      }
    }
    card.v[12] = 0;
    card.m[12] = true;
    card.live = -1;
    card.oneAway.length = 0;
    card.hadOneAway = false;
    card.done = false;
    return card;
  }
  function cardIndexOf(card, value) {
    for (var i = 0; i < 25; i++) if (card.v[i] === value && !card.m[i]) return i;
    return -1;
  }

  var state = bootState;
  var run = {
    mode: 'tour', stage: 0, cityIndex: 0, roomName: '', pattern: PATTERNS[0],
    cards: [], rivals: [],
    sequence: [], cursor: 0, serial: 0, current: null, elapsed: 0,
    baseInterval: 2.25, interval: 2.25, live: false, calls: 0,
    daubedThisCall: 0, missedCall: false, streak: 0, bestStreak: 0, charge: 0, chargeTurn: 0,
    chips: [0, 0, 0, 0], doubleT: 0, freezeT: 0, peekT: 0, peek: [],
    score: 0, timer: 0, recent: [],
    ended: false, result: '', resultTitle: '', resultText: '',
    rushIndex: 0, rushCalls: 0, rushBudget: 22, rushTotal: 0,
    halls: 0, rivalAcc: 0.8, souvenir: -1, newBest: false, crown: false
  };
  var cardPool = [];
  (function () { for (var i = 0; i < 12; i++) cardPool.push(makeCard()); })();

  function shuffledDeck(out) {
    out.length = 0;
    var i, j, tmp;
    for (i = 0; i < DECK; i++) out.push(i + 1);
    for (i = out.length - 1; i > 0; i--) { j = randInt(i + 1); tmp = out[i]; out[i] = out[j]; out[j] = tmp; }
    return out;
  }

  function hitOdds() {
    /* Truthful posted odds: how many of the numbers still in the drum sit
       unmarked on the player's cards, over the size of the remaining drum. */
    var left = run.sequence.length - run.cursor;
    if (left <= 0) return { hits: 0, left: 0 };
    var seen = Object.create(null), hits = 0, i, c, k, v;
    for (i = run.cursor; i < run.sequence.length; i++) seen[run.sequence[i]] = true;
    var counted = Object.create(null);
    for (c = 0; c < run.cards.length; c++) {
      for (k = 0; k < 25; k++) {
        v = run.cards[c].v[k];
        if (!v || run.cards[c].m[k] || counted[v] || !seen[v]) continue;
        counted[v] = true;
        hits++;
      }
    }
    return { hits: hits, left: left };
  }

  // ------------------------------------------------------------ scene bridge
  function fxBurst(x, y, color, n) { if (Game.play) Game.play.burst(x, y, color, n); }
  function fxCelebrate(color) { if (Game.play) Game.play.celebrate(color); }
  function fxRing(x, y, color, size) { if (Game.play) Game.play.ringPulse(x, y, color, size); }
  function fxCharge(x, y, color) { if (Game.play) Game.play.chargeSparks(x, y, color); }
  function toast(text, color) { if (Game.play) Game.play.pushToast(text, color); }
  function banner(title, sub, color, hold) { if (Game.play) Game.play.showBanner(title, sub, color, hold); }
  function keeper(name, hold) { if (Game.play) Game.play.setKeeper(name, hold); }
  function coach(line, hold) { if (Game.play) Game.play.setCoach(line, hold); }
  function cellPoint(cardIndex, cellIndex, out) {
    if (Game.play) return Game.play.cellPoint(cardIndex, cellIndex, out);
    out.x = W * 0.5; out.y = H * 0.5; return out;
  }
  function shake(mag, ms) { if (kit && !REDUCED) kit.juice.shake(mag, ms); }
  function hitStop(ms) { if (kit && !REDUCED) kit.juice.hitStop(ms); }
  var tmpPoint = { x: 0, y: 0 };

  // ---------------------------------------------------------- run lifecycle
  function currentPatternId() {
    if (run.mode === 'rush') {
      var ladder = rushLadder(run.stage);
      return ladder.patterns[clamp(run.rushIndex, 0, ladder.patterns.length - 1)];
    }
    if (run.mode === 'endless') return ENDLESS_PATTERNS[run.halls % ENDLESS_PATTERNS.length];
    return tourStop(run.stage).pattern;
  }

  function dealTable(cardCount, rivalCount, rivalAcc) {
    var i, card, slot = 0;
    run.cards.length = 0;
    for (i = 0; i < cardCount && slot < cardPool.length; i++) {
      card = dealCard(cardPool[slot++]);
      findOneAway(card.m, run.pattern, card.oneAway);
      card.hadOneAway = card.oneAway.length > 0;
      run.cards.push(card);
    }
    run.rivals.length = 0;
    for (i = 0; i < rivalCount && slot < cardPool.length; i++) {
      card = dealCard(cardPool[slot++]);
      run.rivals.push({
        name: RIVAL_NAMES[i % RIVAL_NAMES.length],
        card: card,
        delay: 0.15 + i * 0.075 + Math.random() * 0.15,
        acc: clamp(rivalAcc, 0.2, 0.98),
        lastSerial: -1,
        progress: 0,
        done: false
      });
    }
  }

  function refreshCardLive() {
    var i, card;
    for (i = 0; i < run.cards.length; i++) {
      card = run.cards[i];
      card.live = run.current == null ? -1 : cardIndexOf(card, run.current);
    }
  }

  function refreshOneAway(card, announce) {
    var before = card.hadOneAway;
    findOneAway(card.m, run.pattern, card.oneAway);
    card.hadOneAway = card.oneAway.length > 0;
    if (announce && card.hadOneAway && !before) {
      sfx('oneaway', 0.7);
      toast('ONE AWAY', run.mode === 'rush' ? C.gold : cityOf(run.cityIndex).glow);
    }
  }

  function startRun(mode, stage) {
    var city, stop, ladder;
    run.mode = mode;
    run.stage = stage;
    run.ended = false;
    run.result = '';
    run.resultTitle = '';
    run.resultText = '';
    run.score = 0;
    run.timer = 0;
    run.calls = 0;
    run.streak = 0;
    run.bestStreak = 0;
    run.charge = 0;
    run.chargeTurn = 0;
    run.chips = [0, 0, 0, 0];
    run.doubleT = 0;
    run.freezeT = 0;
    run.peekT = 0;
    run.peek = [];
    run.recent.length = 0;
    run.rushIndex = 0;
    run.rushCalls = 0;
    run.rushTotal = 0;
    run.halls = 0;
    run.souvenir = -1;
    run.newBest = false;
    run.crown = false;
    run.current = null;
    run.daubedThisCall = 0;
    run.missedCall = false;

    if (mode === 'rush') {
      ladder = rushLadder(stage);
      run.cityIndex = ladder.city;
      run.roomName = ladder.name;
      run.baseInterval = ladder.interval;
      run.rushBudget = ladder.budget;
      run.pattern = patternById(ladder.patterns[0]);
      run.rivalAcc = 0;
      shuffledDeck(run.sequence);
      run.cursor = 0;
      dealTable(ladder.cards, 0, 0);
    } else if (mode === 'endless') {
      run.cityIndex = 2;
      run.roomName = 'Endless Hall';
      run.baseInterval = 2.20;
      run.pattern = patternById(ENDLESS_PATTERNS[0]);
      run.rivalAcc = 0.74;
      shuffledDeck(run.sequence);
      run.cursor = 0;
      dealTable(2, 3, run.rivalAcc);
    } else {
      stop = tourStop(stage);
      city = cityOf(stop.city);
      run.cityIndex = stop.city;
      run.roomName = stop.room;
      run.baseInterval = stop.interval;
      run.pattern = patternById(stop.pattern);
      run.rivalAcc = stop.acc;
      shuffledDeck(run.sequence);
      run.cursor = 0;
      dealTable(stop.cards, stop.rivals, stop.acc);
    }
    run.interval = run.baseInterval;
    run.serial = 0;
    run.elapsed = 0;
    run.live = false;
    if (Game.play) Game.play.onRunStart();
    nextCall(true);
  }

  function effectiveInterval() {
    return run.baseInterval * Math.max(0.72, 1 - run.calls * 0.006);
  }

  function nextCall(first) {
    if (run.ended) return;
    if (!first && run.current !== null && run.daubedThisCall === 0) {
      if (run.streak > 0) keeper('dim', 0.5);
      run.streak = 0;
    }
    if (run.cursor >= run.sequence.length) {
      endRun('fail', 'THE DRUM IS EMPTY', 'The last lantern faded before the pattern closed.');
      return;
    }
    run.current = run.sequence[run.cursor++];
    run.serial++;
    run.calls++;
    run.elapsed = 0;
    run.live = true;
    run.daubedThisCall = 0;
    run.missedCall = false;
    run.interval = effectiveInterval();
    run.recent.unshift(run.current);
    if (run.recent.length > 5) run.recent.length = 5;
    if (run.mode === 'rush') run.rushCalls++;
    if (run.peekT > 0) run.peek = run.sequence.slice(run.cursor, run.cursor + 3);
    refreshCardLive();
    sfx('call', 0.5, 0.92 + (run.current % 12) * 0.012);
    if (Game.play) Game.play.onCall();
    if (run.mode === 'rush' && run.rushCalls > run.rushBudget) {
      endRun('fail', 'CALL BUDGET SPENT', 'That pattern needed more calls than the rush allows.');
    }
  }

  function chargeChip() {
    run.charge++;
    if (run.charge < CHARGE_COST) return;
    run.charge -= CHARGE_COST;
    var start = run.chargeTurn, i;
    for (i = 0; i < CHIPS.length; i++) {
      var idx = (start + i) % CHIPS.length;
      if (run.chips[idx] < CHIP_MAX) {
        run.chips[idx]++;
        run.chargeTurn = (idx + 1) % CHIPS.length;
        sfx('charge', 0.7);
        toast(CHIPS[idx].name + ' READY', cityOf(run.cityIndex).cool);
        if (Game.play) Game.play.onChipCharged(idx);
        return;
      }
    }
    run.charge = CHARGE_COST - 1;
  }

  function scoreDaub() {
    var mult = run.doubleT > 0 ? 2 : 1;
    run.score += (100 + Math.min(300, run.streak * 25)) * mult;
  }

  function markCell(cardIndex, cellIndex, fromAuto) {
    var card = run.cards[cardIndex];
    if (!card || cellIndex < 0 || card.m[cellIndex]) return false;
    card.m[cellIndex] = true;
    card.live = -1;
    var first = run.daubedThisCall === 0;
    run.daubedThisCall++;
    if (first) {
      run.streak++;
      if (run.streak > run.bestStreak) run.bestStreak = run.streak;
      chargeChip();
    }
    scoreDaub();
    var city = cityOf(run.cityIndex);
    cellPoint(cardIndex, cellIndex, tmpPoint);
    fxBurst(tmpPoint.x, tmpPoint.y, run.streak >= 6 ? city.hot : city.glow, REDUCED ? 5 : 10);
    if (Game.play) Game.play.onDaub(cardIndex, cellIndex, run.streak);
    if (!fromAuto) shake(run.streak >= 6 ? 4 : 2.6, 120);
    if (run.streak > 0 && run.streak % 5 === 0) {
      sfx('streak', 0.8);
      keeper('streak', 0.9);
    } else {
      sfx('daub', 0.85, clamp(0.94 + run.streak * 0.02, 0.9, 1.32));
      keeper('flare', 0.32);
    }
    refreshOneAway(card, true);
    if (patComplete(card.m, run.pattern)) {
      card.done = true;
      onPatternCleared(cardIndex);
      return true;
    }
    return true;
  }

  function daubCard(cardIndex) {
    if (run.ended || state.screen !== 'play') return;
    var card = run.cards[cardIndex];
    if (!card) return;
    if (!run.live || run.current == null) {
      sfx('miss', 0.35);
      toast('CALL CLOSED', C.slate);
      return;
    }
    if (card.live < 0) {
      sfx('miss', 0.4);
      keeper('dim', 0.3);
      toast('NO MATCH HERE', C.slate);
      return;
    }
    markCell(cardIndex, card.live, false);
  }

  function quickDaub() {
    for (var i = 0; i < run.cards.length; i++) {
      if (run.cards[i].live >= 0) { daubCard(i); return; }
    }
    daubCard(0);
  }

  function useChip(index) {
    if (run.ended || state.screen !== 'play') return;
    if (index < 0 || index >= CHIPS.length || run.chips[index] <= 0) {
      sfx('miss', 0.3);
      return;
    }
    run.chips[index]--;
    sfx('chip', 0.8);
    var city = cityOf(run.cityIndex);
    if (Game.play) Game.play.onChipUsed(index);
    if (index === 0) {
      var hits = 0, i;
      if (run.live && run.current != null) {
        for (i = 0; i < run.cards.length; i++) {
          if (run.cards[i].live >= 0) { markCell(i, run.cards[i].live, true); hits++; if (run.ended) break; }
        }
      }
      toast(hits ? 'AUTO DAUB ' + hits : 'AUTO FOUND NONE', hits ? city.glow : C.slate);
    } else if (index === 1) {
      run.doubleT = DOUBLE_TIME;
      toast('DOUBLE SCORE 8s', city.hot);
    } else if (index === 2) {
      run.freezeT = FREEZE_TIME;
      run.live = true;
      toast('CALL CLOCK FROZEN', city.cool);
    } else {
      run.peekT = PEEK_TIME;
      run.peek = run.sequence.slice(run.cursor, run.cursor + 3);
      toast('NEXT THREE SHOWN', city.cool);
    }
  }

  function updateRivals(dt) {
    var i, j, rival, idx, matched;
    for (i = 0; i < run.rivals.length; i++) {
      rival = run.rivals[i];
      if (rival.done) continue;
      if (run.live && run.current != null && rival.lastSerial !== run.serial && run.elapsed >= rival.delay) {
        rival.lastSerial = run.serial;
        if (Math.random() < rival.acc) {
          matched = false;
          for (j = 0; j < 25; j++) {
            if (rival.card.v[j] === run.current && !rival.card.m[j]) { rival.card.m[j] = true; matched = true; }
          }
          if (matched && patComplete(rival.card.m, run.pattern)) rival.done = true;
        }
      }
      rival.progress = patProgress(rival.card.m, run.pattern);
      if (rival.done && !run.ended) {
        endRun('fail', 'RIVAL LANTERN LIT', rival.name + ' closed the pattern first.');
        return;
      }
    }
  }

  function playerProgress() {
    var best = 0;
    for (var i = 0; i < run.cards.length; i++) best = Math.max(best, patProgress(run.cards[i].m, run.pattern));
    return best;
  }

  function advanceEndlessHall() {
    var city = cityOf(run.cityIndex);
    run.halls++;
    run.score += 500 + run.halls * 120;
    run.baseInterval = Math.max(0.95, run.baseInterval - 0.06);
    run.rivalAcc = Math.min(0.94, run.rivalAcc + 0.02);
    run.pattern = patternById(ENDLESS_PATTERNS[run.halls % ENDLESS_PATTERNS.length]);
    shuffledDeck(run.sequence);
    run.cursor = 0;
    dealTable(Math.min(4, 2 + Math.floor(run.halls / 3)), 3, run.rivalAcc);
    sfx('souvenir', 0.75);
    fxCelebrate(city.glow);
    toast('HALL ' + run.halls + ' CLEARED', city.glow);
    hitStop(70);
    shake(5, 200);
    run.serial = 0;
    run.elapsed = 0;
    nextCall(true);
  }

  function advanceRushPattern() {
    var ladder = rushLadder(run.stage);
    var city = cityOf(run.cityIndex);
    run.rushTotal += run.rushCalls;
    run.score += 400 + Math.max(0, run.rushBudget - run.rushCalls) * 40;
    run.rushIndex++;
    if (run.rushIndex >= ladder.patterns.length) {
      endRun('win', 'RUSH SET COMPLETE', ladder.name + ' cleared in ' + run.rushTotal + ' calls.');
      return;
    }
    run.pattern = patternById(ladder.patterns[run.rushIndex]);
    run.rushCalls = 0;
    shuffledDeck(run.sequence);
    run.cursor = 0;
    dealTable(ladder.cards, 0, 0);
    sfx('souvenir', 0.7);
    fxCelebrate(city.cool);
    toast('PATTERN ' + (run.rushIndex + 1) + ' OF ' + ladder.patterns.length, city.cool);
    hitStop(60);
    run.serial = 0;
    run.elapsed = 0;
    nextCall(true);
  }

  function onPatternCleared(cardIndex) {
    if (run.mode === 'endless') { advanceEndlessHall(); return; }
    if (run.mode === 'rush') { advanceRushPattern(); return; }
    var stop = tourStop(run.stage);
    run.score += Math.max(0, DECK - run.calls) * 30 + (run.stage + 1) * 150;
    endRun('win', 'BINGO', stop.room + ' answered your lantern.');
  }

  function tierFor(calls, budgetTotal) {
    if (calls <= budgetTotal * 0.62) return 'GOLD';
    if (calls <= budgetTotal * 0.80) return 'SILVER';
    return 'BRONZE';
  }

  function endRun(result, title, text) {
    if (run.ended) return;
    run.ended = true;
    run.live = false;
    run.result = result;
    run.resultTitle = title;
    run.resultText = text;
    var city = cityOf(run.cityIndex);
    var i, ladder;
    if (result === 'win') {
      sfx('bingo', 0.95);
      keeper('win', 3);
      fxCelebrate(city.glow);
      hitStop(REDUCED ? 0 : 110);
      shake(8, 320);
      if (run.mode === 'tour') {
        if (!profile.cleared[run.stage]) profile.cleared[run.stage] = true;
        if (run.stage >= profile.unlocked && run.stage + 1 < TOUR.length) profile.unlocked = run.stage + 1;
        if (!profile.souvenirs[run.stage]) { profile.souvenirs[run.stage] = true; run.souvenir = run.stage; }
        if (run.score > profile.best[run.stage]) { profile.best[run.stage] = Math.min(99999999, Math.floor(run.score)); run.newBest = true; }
        if (run.stage === TOUR.length - 1) { run.crown = true; profile.crowns = clearedCount(profile); }
      } else if (run.mode === 'rush') {
        ladder = rushLadder(run.stage);
        if (!profile.rushCleared[run.stage]) profile.rushCleared[run.stage] = true;
        if (run.score > profile.rushBest[run.stage]) { profile.rushBest[run.stage] = Math.min(99999999, Math.floor(run.score)); run.newBest = true; }
        run.resultText = ladder.name + ' cleared in ' + run.rushTotal + ' calls  ' + tierFor(run.rushTotal, ladder.budget * ladder.patterns.length);
      }
    } else {
      sfx('rivalwin', 0.8);
      keeper('dim', 2);
      if (run.mode === 'endless' && run.halls > 0) {
        if (run.score > profile.endlessBest) { profile.endlessBest = Math.min(99999999, Math.floor(run.score)); run.newBest = true; }
        if (run.halls > profile.endlessHalls) profile.endlessHalls = Math.min(9999, run.halls);
      }
    }
    if (run.mode === 'endless' && result === 'win') {
      if (run.score > profile.endlessBest) { profile.endlessBest = Math.min(99999999, Math.floor(run.score)); run.newBest = true; }
    }
    if (run.mode === 'endless' && result !== 'win' && run.halls === 0 && run.score > profile.endlessBest) {
      profile.endlessBest = Math.min(99999999, Math.floor(run.score));
      run.newBest = true;
    }
    if (run.mode === 'tour' && run.stage === 0 && !profile.tutorial) profile.tutorial = true;
    persist();
    if (Game.play) Game.play.onRunEnd();
  }

  function stepSim(dt) {
    if (run.ended) {
      if (Game.play) Game.play.stepFx(dt);
      return;
    }
    run.timer += dt;
    if (run.freezeT > 0) {
      run.freezeT = Math.max(0, run.freezeT - dt);
      if (run.freezeT === 0) toast('CLOCK RUNNING', C.slate);
    } else {
      run.elapsed += dt;
    }
    run.doubleT = Math.max(0, run.doubleT - dt);
    run.peekT = Math.max(0, run.peekT - dt);
    if (run.peekT === 0 && run.peek.length) run.peek.length = 0;
    if (run.elapsed >= run.interval) {
      nextCall(false);
    } else if (run.live && run.elapsed >= run.interval * LIVE_FRACTION) {
      run.live = false;
      var hadMatch = false;
      for (var i = 0; i < run.cards.length; i++) if (run.cards[i].live >= 0) hadMatch = true;
      if (hadMatch && run.daubedThisCall === 0 && !run.missedCall) {
        run.missedCall = true;
        sfx('miss', 0.45);
        keeper('dim', 0.45);
        toast('MISSED', C.red);
      }
    }
    updateRivals(dt);
    if (Game.play) Game.play.stepFx(dt);
    if (Game.play) Game.play.stepTutorial(dt);
  }

  // ------------------------------------------------------------ probe bridge
  function syncProbe() {
    var out = state;
    var i;
    out.mode = run.mode;
    out.screen = Game.play ? Game.play.screen : 'boot';
    out.stage = run.stage;
    out.stageName = run.mode === 'rush' ? rushLadder(run.stage).name
      : run.mode === 'endless' ? 'Hall ' + (run.halls + 1) : tourStop(run.stage).room;
    out.city = cityOf(run.cityIndex).name;
    out.pattern = run.pattern ? run.pattern.name : 'none';
    out.progress = Math.round(playerProgress() * 1000) / 1000;
    out.score = run.score;
    out.health = Math.round(clamp((run.sequence.length - run.cursor) / DECK, 0, 1) * 1000) / 1000;
    out.calls = run.calls;
    out.callsLeft = Math.max(0, run.sequence.length - run.cursor);
    out.streak = run.streak;
    out.chips = run.chips.slice();
    out.rivals.length = 0;
    for (i = 0; i < run.rivals.length; i++) {
      out.rivals.push({ name: run.rivals[i].name, progress: Math.round(run.rivals[i].progress * 1000) / 1000 });
    }
    out.souvenirs = souvenirCount(profile);
    out.cleared = clearedCount(profile);
    out.best = run.mode === 'endless' ? profile.endlessBest
      : run.mode === 'rush' ? profile.rushBest[clamp(run.stage, 0, RUSH.length - 1)]
      : profile.best[clamp(run.stage, 0, TOUR.length - 1)];
    out.ended = run.ended;
    out.result = run.result;
    out.ready = !!(Game.play && Game.play.ready);
    out.forceMode = root.__lb.forceMode == null ? null : root.__lb.forceMode;
    out.forceStage = root.__lb.forceStage == null ? null : root.__lb.forceStage;
    root.__lb.state = out;
  }

  // ============================================================ render scene
  function PlayScene() {
    Phaser.Scene.call(this, { key: 'lantern-bingo' });
    this.screen = 'menu';
    this.ready = false;
    this.interacted = false;
    this.accumulator = 0;
    this.visualTime = 0;
    this.pointerSeen = new Map();
    this.pointerEdges = [];
    this.hitZones = [];
    this.menuFocus = 0;
    this.mapFocus = 0;
    this.pendingMode = 'tour';
    this.wantMusic = 'music_lantern';
    this.bakedBg = Object.create(null);
    this.toastQueue = [];
    this.toast = null;
    this.toastT = 0;
    this.banner = null;
    this.bannerT = 0;
    this.coachLine = '';
    this.coachT = 0;
    this.tutorialStep = 0;
    this.keeperState = 'idle';
    this.keeperT = 0;
    this.callPop = 0;
    this.daubPops = [];
    this.sparks = [];
    this.embers = [];
    this.rings = [];
    this.lastForcedMode = null;
    this.lastForcedStage = null;
    this.cardRects = [];
    this.chipPulse = [0, 0, 0, 0];
    this.prewarm = null;
    this.prewarmFrames = 0;
  }
  PlayScene.prototype = Object.create(Phaser.Scene.prototype);
  PlayScene.prototype.constructor = PlayScene;

  // ------------------------------------------------------------ bake helpers
  function rr(c, x, y, w, h, r) {
    var rad = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rad, y);
    c.arcTo(x + w, y, x + w, y + h, rad);
    c.arcTo(x + w, y + h, x, y + h, rad);
    c.arcTo(x, y + h, x, y, rad);
    c.arcTo(x, y, x + w, y, rad);
    c.closePath();
  }
  function radial(c, x, y, r, inner, outer) {
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, inner);
    g.addColorStop(0.55, outer);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    return g;
  }
  function lanternShape(c, x, y, w, h, body, cap, cord) {
    if (cord) {
      c.strokeStyle = cord;
      c.lineWidth = Math.max(1, w * 0.05);
      c.beginPath();
      c.moveTo(x, y - h * 0.5 - h * 0.30);
      c.lineTo(x, y - h * 0.5);
      c.stroke();
    }
    c.fillStyle = body;
    rr(c, x - w * 0.5, y - h * 0.5, w, h, w * 0.42);
    c.fill();
    c.fillStyle = cap;
    rr(c, x - w * 0.32, y - h * 0.5 - h * 0.13, w * 0.64, h * 0.17, w * 0.06);
    c.fill();
    rr(c, x - w * 0.32, y + h * 0.5 - h * 0.04, w * 0.64, h * 0.17, w * 0.06);
    c.fill();
  }

  PlayScene.prototype.canvasTex = function (key, w, h, draw) {
    var tex = this.textures.exists(key) ? this.textures.get(key) : this.textures.createCanvas(key, w, h);
    if (!tex || !tex.getContext) return null;
    var c = tex.getContext();
    c.clearRect(0, 0, w, h);
    draw(c, w, h);
    tex.refresh();
    return tex;
  };

  PlayScene.prototype.bakeCore = function () {
    var self = this;
    this.canvasTex('lb-spark', 16, 16, function (c) {
      c.fillStyle = radial(c, 8, 8, 8, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.42)');
      c.fillRect(0, 0, 16, 16);
    });
    this.canvasTex('lb-glow', 96, 96, function (c) {
      c.fillStyle = radial(c, 48, 48, 48, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.30)');
      c.fillRect(0, 0, 96, 96);
    });
    this.canvasTex('lb-disc', 64, 64, function (c) {
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(32, 32, 29, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.32;
      c.beginPath(); c.arc(32, 32, 31, 0, Math.PI * 2); c.fill();
    });
    this.canvasTex('lb-ring', 76, 76, function (c) {
      c.strokeStyle = '#ffffff';
      c.lineWidth = 7;
      c.beginPath(); c.arc(38, 38, 32, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 0.30;
      c.lineWidth = 14;
      c.beginPath(); c.arc(38, 38, 32, 0, Math.PI * 2); c.stroke();
    });
    this.canvasTex('lb-ring-thin', 76, 76, function (c) {
      c.strokeStyle = '#ffffff';
      c.lineWidth = 3.5;
      c.beginPath(); c.arc(38, 38, 33, 0, Math.PI * 2); c.stroke();
    });
    this.canvasTex('lb-pip', 24, 24, function (c) {
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(12, 12, 8, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.35;
      c.beginPath(); c.arc(12, 12, 11, 0, Math.PI * 2); c.fill();
    });
    this.canvasTex('lb-node', 70, 70, function (c) {
      c.fillStyle = '#ffffff';
      c.globalAlpha = 0.16;
      c.beginPath(); c.arc(35, 35, 32, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 3;
      c.beginPath(); c.arc(35, 35, 30, 0, Math.PI * 2); c.stroke();
    });
    this.canvasTex('lb-chipframe', 86, 70, function (c) {
      c.globalAlpha = 0.16;
      c.fillStyle = '#ffffff';
      rr(c, 1, 1, 84, 68, 15); c.fill();
      c.globalAlpha = 1;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2;
      rr(c, 1.5, 1.5, 83, 67, 15); c.stroke();
    });
    this.canvasTex('lb-panel', 96, 96, function (c) {
      c.globalAlpha = 0.20;
      c.fillStyle = '#ffffff';
      rr(c, 2, 2, 92, 92, 16); c.fill();
    });
    // The called-number lantern ball, baked white so each city can tint it.
    this.canvasTex('lb-ball', 112, 112, function (c) {
      c.fillStyle = radial(c, 56, 56, 56, 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0.10)');
      c.fillRect(0, 0, 112, 112);
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(56, 56, 40, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.55;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 3;
      c.beginPath(); c.ellipse(56, 56, 22, 40, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.ellipse(56, 56, 40, 22, 0, 0, Math.PI * 2); c.stroke();
    });
    this.canvasTex('lb-minball', 46, 46, function (c) {
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(23, 23, 19, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.4;
      c.beginPath(); c.arc(23, 23, 22, 0, Math.PI * 2); c.fill();
    });
    var chipDraw = [
      function (c) { // AUTO: a struck spark
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.moveTo(22, 2); c.lineTo(10, 21); c.lineTo(19, 21); c.lineTo(15, 36);
        c.lineTo(29, 16); c.lineTo(20, 16); c.closePath(); c.fill();
      },
      function (c) { // DOUBLE: stacked diamonds
        c.fillStyle = '#ffffff';
        c.beginPath(); c.moveTo(19, 3); c.lineTo(31, 15); c.lineTo(19, 27); c.lineTo(7, 15); c.closePath(); c.fill();
        c.globalAlpha = 0.62;
        c.beginPath(); c.moveTo(19, 13); c.lineTo(31, 25); c.lineTo(19, 37); c.lineTo(7, 25); c.closePath(); c.fill();
      },
      function (c) { // FREEZE: six-spoke frost star
        c.strokeStyle = '#ffffff';
        c.lineWidth = 3;
        c.lineCap = 'round';
        for (var i = 0; i < 6; i++) {
          var a = i * Math.PI / 3;
          c.beginPath();
          c.moveTo(19, 19);
          c.lineTo(19 + Math.cos(a) * 16, 19 + Math.sin(a) * 16);
          c.stroke();
          c.beginPath();
          c.moveTo(19 + Math.cos(a) * 10, 19 + Math.sin(a) * 10);
          c.lineTo(19 + Math.cos(a + 0.5) * 15, 19 + Math.sin(a + 0.5) * 15);
          c.stroke();
        }
      },
      function (c) { // PEEK: a lantern eye
        c.strokeStyle = '#ffffff';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(2, 19); c.quadraticCurveTo(19, 3, 36, 19);
        c.quadraticCurveTo(19, 35, 2, 19); c.stroke();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(19, 19, 6, 0, Math.PI * 2); c.fill();
      }
    ];
    for (var i = 0; i < chipDraw.length; i++) {
      (function (n) { self.canvasTex('lb-chipicon-' + n, 38, 38, chipDraw[n]); })(i);
    }
  };

  PlayScene.prototype.bakePatternIcons = function () {
    var self = this;
    for (var i = 0; i < PATTERNS.length; i++) {
      (function (pat) {
        self.canvasTex('lb-pat-' + pat.id, 46, 46, function (c) {
          var pad = 3, cell = 8;
          for (var r = 0; r < 5; r++) {
            for (var col = 0; col < 5; col++) {
              var on = pat.mask[r * 5 + col];
              c.fillStyle = on ? '#ffc660' : 'rgba(255,255,255,0.16)';
              rr(c, pad + col * cell, pad + r * cell, cell - 2, cell - 2, 1.6);
              c.fill();
            }
          }
        });
      })(PATTERNS[i]);
    }
  };

  PlayScene.prototype.bakeSouvenirs = function () {
    var self = this;
    for (var i = 0; i < SOUVENIRS.length; i++) {
      (function (index) {
        var city = cityOf(SOUVENIRS[index].city);
        var band = Math.floor(index / 4);
        var shape = (index + band) % 4;
        var accent = [city.glow, city.hot, city.cool, mixHex(city.glow, city.cool, 0.5)][(index + band * 2) % 4];
        self.canvasTex('lb-sv-' + index, 58, 58, function (c) {
          c.fillStyle = radial(c, 29, 29, 29, mixHex(accent, '#ffffff', 0.2), 'rgba(0,0,0,0)');
          c.globalAlpha = 0.55;
          c.fillRect(0, 0, 58, 58);
          c.globalAlpha = 1;
          if (shape === 0) {
            lanternShape(c, 29, 30, 28, 32, city.paper, accent, accent);
            c.fillStyle = city.ink;
            c.beginPath(); c.arc(29, 30, 5, 0, Math.PI * 2); c.fill();
          } else if (shape === 1) {
            c.fillStyle = city.paper;
            c.beginPath(); c.moveTo(29, 8); c.lineTo(48, 29); c.lineTo(29, 50); c.lineTo(10, 29); c.closePath(); c.fill();
            c.strokeStyle = accent; c.lineWidth = 3;
            c.beginPath(); c.moveTo(29, 8); c.lineTo(29, 50); c.moveTo(10, 29); c.lineTo(48, 29); c.stroke();
          } else if (shape === 2) {
            c.fillStyle = city.paper;
            c.beginPath(); c.arc(29, 32, 18, Math.PI, 0); c.closePath(); c.fill();
            c.strokeStyle = accent; c.lineWidth = 2.5;
            for (var k = 0; k < 4; k++) {
              c.beginPath();
              c.moveTo(29, 32);
              c.lineTo(29 + Math.cos(Math.PI + k * Math.PI / 3) * 18, 32 + Math.sin(Math.PI + k * Math.PI / 3) * 18);
              c.stroke();
            }
            c.fillStyle = accent;
            c.beginPath(); c.arc(29, 32, 4, 0, Math.PI * 2); c.fill();
          } else {
            c.fillStyle = accent;
            c.beginPath();
            for (var s = 0; s < 10; s++) {
              var ang = -Math.PI / 2 + s * Math.PI / 5;
              var rad = s % 2 === 0 ? 21 : 9;
              if (s === 0) c.moveTo(29 + Math.cos(ang) * rad, 29 + Math.sin(ang) * rad);
              else c.lineTo(29 + Math.cos(ang) * rad, 29 + Math.sin(ang) * rad);
            }
            c.closePath(); c.fill();
            c.fillStyle = city.paper;
            c.beginPath(); c.arc(29, 29, 7, 0, Math.PI * 2); c.fill();
          }
        });
      })(i);
    }
  };

  /* The Lantern Keeper: the player avatar beside the caller. Six baked frames
     across five states (idle x3, flare, dim, win). */
  function drawKeeper(c, opts) {
    var w = 76, h = 100;
    var flame = opts.flame;
    var body = '#2b3a52';
    var cloak = opts.cloak;
    var skin = '#f0cfa8';
    c.save();
    // halo
    if (opts.halo > 0) {
      c.globalAlpha = opts.halo;
      c.fillStyle = radial(c, 38, 42, 38, flame, 'rgba(0,0,0,0)');
      c.fillRect(0, 0, w, h);
      c.globalAlpha = 1;
    }
    // cloak
    c.fillStyle = cloak;
    c.beginPath();
    c.moveTo(38, 30);
    c.quadraticCurveTo(64, 46, 60, 96);
    c.lineTo(16, 96);
    c.quadraticCurveTo(12, 46, 38, 30);
    c.closePath();
    c.fill();
    // hood
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(38, 16);
    c.quadraticCurveTo(56, 22, 54, 44);
    c.lineTo(22, 44);
    c.quadraticCurveTo(20, 22, 38, 16);
    c.closePath();
    c.fill();
    // face
    c.fillStyle = skin;
    c.beginPath(); c.ellipse(38, 36, 10, 9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a1c14';
    c.beginPath(); c.arc(34, 35 + opts.eye, 1.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(42, 35 + opts.eye, 1.8, 0, Math.PI * 2); c.fill();
    // sash
    c.fillStyle = flame;
    c.globalAlpha = 0.75;
    c.fillRect(20, 62, 36, 5);
    c.globalAlpha = 1;
    // arm and pole
    c.strokeStyle = '#8a6a48';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(50, 58);
    c.lineTo(66, 58 - opts.lift);
    c.stroke();
    // hanging lantern
    var lx = 66, ly = 58 - opts.lift + opts.swing;
    c.strokeStyle = '#8a6a48';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx, ly + 6); c.stroke();
    c.globalAlpha = opts.bright;
    c.fillStyle = radial(c, lx, ly + 17, 22, flame, 'rgba(0,0,0,0)');
    c.fillRect(lx - 24, ly - 8, 48, 50);
    c.globalAlpha = 1;
    lanternShape(c, lx, ly + 17, 20, 24, opts.paper, flame, null);
    c.fillStyle = flame;
    c.globalAlpha = opts.bright;
    c.beginPath();
    c.moveTo(lx, ly + 11);
    c.quadraticCurveTo(lx + 5, ly + 18, lx, ly + 24);
    c.quadraticCurveTo(lx - 5, ly + 18, lx, ly + 11);
    c.closePath(); c.fill();
    c.globalAlpha = 1;
    c.restore();
  }

  PlayScene.prototype.bakeKeeper = function () {
    var self = this;
    var frames = [
      ['lb-keeper-idle0', { flame: '#ffc367', cloak: '#3a4f6e', paper: '#fbe9c6', halo: 0.16, eye: 0, lift: 0, swing: 0, bright: 0.85 }],
      ['lb-keeper-idle1', { flame: '#ffce7d', cloak: '#3a4f6e', paper: '#fdefd2', halo: 0.22, eye: 0, lift: 1, swing: 1.5, bright: 0.95 }],
      ['lb-keeper-idle2', { flame: '#ffbe58', cloak: '#3a4f6e', paper: '#f7e2ba', halo: 0.14, eye: 1, lift: 0, swing: -1.5, bright: 0.80 }],
      ['lb-keeper-flare', { flame: '#ffdc8f', cloak: '#4a628a', paper: '#fff6df', halo: 0.55, eye: 0, lift: 5, swing: 0, bright: 1 }],
      ['lb-keeper-dim', { flame: '#7d7a86', cloak: '#2c3a50', paper: '#cfc7bb', halo: 0.05, eye: 2, lift: -4, swing: 2, bright: 0.35 }],
      ['lb-keeper-win', { flame: '#ffe9a8', cloak: '#6b7fae', paper: '#fffaf0', halo: 0.85, eye: 0, lift: 12, swing: 0, bright: 1 }]
    ];
    for (var i = 0; i < frames.length; i++) {
      (function (row) {
        self.canvasTex(row[0], 76, 100, function (c) { drawKeeper(c, row[1]); });
      })(frames[i]);
    }
  };

  PlayScene.prototype.bakeTitle = function () {
    this.canvasTex('lb-title', 340, 128, function (c) {
      c.fillStyle = radial(c, 170, 62, 150, 'rgba(255,198,96,0.30)', 'rgba(255,141,92,0.05)');
      c.fillRect(0, 0, 340, 128);
      // three hanging lanterns behind the word mark
      var spots = [[46, 40, 26, 30, '#ff8f5f'], [170, 30, 32, 38, '#ffc660'], [294, 42, 24, 28, '#63d7d0']];
      for (var i = 0; i < spots.length; i++) {
        var s = spots[i];
        c.globalAlpha = 0.55;
        c.fillStyle = radial(c, s[0], s[1], s[2] * 1.8, s[4], 'rgba(0,0,0,0)');
        c.fillRect(s[0] - 60, s[1] - 60, 120, 120);
        c.globalAlpha = 1;
        lanternShape(c, s[0], s[1], s[2], s[3], '#fbe9c6', s[4], 'rgba(255,255,255,0.25)');
      }
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '800 46px ' + FONT;
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fillText('LANTERN', 170, 84);
      c.fillStyle = '#fff2d6';
      c.fillText('LANTERN', 170, 82);
      c.font = '800 30px ' + FONT;
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fillText('B I N G O', 170, 116);
      c.fillStyle = '#ffc660';
      c.fillText('B I N G O', 170, 114);
    });
  };

  /* One translucent chrome plate carries every static play-screen frame, so
     the render loop never replays a Graphics command list. */
  PlayScene.prototype.bakeChrome = function () {
    this.canvasTex('lb-chrome', W, H, function (c) {
      function plate(x, y, w, h, r, a) {
        c.globalAlpha = a;
        c.fillStyle = '#050a12';
        rr(c, x, y, w, h, r); c.fill();
        c.globalAlpha = a * 0.55;
        c.strokeStyle = '#7f93ad';
        c.lineWidth = 1;
        rr(c, x + 0.5, y + 0.5, w - 1, h - 1, r); c.stroke();
        c.globalAlpha = 1;
      }
      plate(8, LAY.hudY, 374, LAY.hudH, 14, 0.55);
      plate(8, LAY.callY, 374, LAY.callH, 18, 0.45);
      plate(8, LAY.oddsY, 374, LAY.oddsH, 9, 0.42);
      // calls-remaining meter track
      c.globalAlpha = 0.5;
      c.fillStyle = '#050a12';
      rr(c, 10, LAY.meterY, 370, LAY.meterH, 5); c.fill();
      c.globalAlpha = 1;
      // chip cradle
      plate(4, LAY.chipsY - 6, 382, LAY.chipH + 12, 18, 0.42);
      // top and bottom vignette so the play field reads over any city
      var grad = c.createLinearGradient(0, 0, 0, 120);
      grad.addColorStop(0, 'rgba(3,6,12,0.72)');
      grad.addColorStop(1, 'rgba(3,6,12,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, W, 120);
      var grad2 = c.createLinearGradient(0, H - 160, 0, H);
      grad2.addColorStop(0, 'rgba(3,6,12,0)');
      grad2.addColorStop(1, 'rgba(3,6,12,0.78)');
      c.fillStyle = grad2;
      c.fillRect(0, H - 160, W, 160);
    });
  };

  /* Authored city backdrops. Baked once per city on first visit and cached. */
  PlayScene.prototype.bakeCity = function (index) {
    var city = cityOf(index);
    var key = 'lb-bg-' + city.id;
    if (this.bakedBg[key]) return key;
    this.bakedBg[key] = true;
    this.canvasTex(key, W, H, function (c) {
      var i, x, y, k;
      var sky = c.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, city.bg2);
      sky.addColorStop(0.45, mixHex(city.bg2, city.bg, 0.7));
      sky.addColorStop(1, city.bg);
      c.fillStyle = sky;
      c.fillRect(0, 0, W, H);
      // stars
      c.fillStyle = 'rgba(255,255,255,0.35)';
      for (i = 0; i < 90; i++) {
        x = (i * 71.3) % W;
        y = (i * 137.9) % (H * 0.55);
        c.globalAlpha = 0.10 + ((i * 37) % 30) / 100;
        c.fillRect(x, y, 1.6, 1.6);
      }
      c.globalAlpha = 1;
      // a moon or a high beacon
      c.fillStyle = radial(c, 312, 96, 96, mixHex(city.glow, '#ffffff', 0.4), 'rgba(0,0,0,0)');
      c.globalAlpha = 0.5;
      c.fillRect(216, 0, 192, 192);
      c.globalAlpha = 1;

      if (city.motif === 'harbour') {
        // masts, hulls, and a rippled waterline
        c.fillStyle = mixHex(city.bg, '#000000', 0.35);
        for (i = 0; i < 9; i++) {
          x = 12 + i * 44;
          c.fillRect(x, 470 - (i % 3) * 26, 3, 130);
          c.beginPath();
          c.moveTo(x - 22, 600); c.lineTo(x + 26, 600); c.lineTo(x + 16, 626); c.lineTo(x - 12, 626);
          c.closePath(); c.fill();
        }
        c.fillStyle = mixHex(city.bg, city.cool, 0.24);
        c.fillRect(0, 626, W, H - 626);
        c.strokeStyle = 'rgba(255,255,255,0.10)';
        c.lineWidth = 2;
        for (i = 0; i < 22; i++) {
          y = 640 + i * 9;
          c.beginPath();
          c.moveTo(0, y);
          for (k = 0; k <= W; k += 26) c.lineTo(k, y + Math.sin((k + i * 40) * 0.05) * 3);
          c.stroke();
        }
      } else if (city.motif === 'shrine') {
        c.fillStyle = mixHex(city.bg, '#000000', 0.42);
        for (i = 0; i < 4; i++) {
          x = 40 + i * 96;
          y = 520 + (i % 2) * 40;
          c.fillRect(x - 4, y, 8, 130);
          c.beginPath();
          c.moveTo(x - 46, y); c.lineTo(x + 46, y); c.lineTo(x + 30, y - 26); c.lineTo(x - 30, y - 26);
          c.closePath(); c.fill();
        }
        // stepped path
        c.fillStyle = mixHex(city.bg, city.cool, 0.14);
        for (i = 0; i < 10; i++) c.fillRect(120 - i * 6, 660 + i * 18, 150 + i * 12, 12);
        c.fillStyle = 'rgba(255,255,255,0.22)';
        for (i = 0; i < 60; i++) {
          c.globalAlpha = 0.10 + ((i * 17) % 40) / 120;
          c.beginPath();
          c.arc((i * 53.7) % W, 200 + (i * 91.3) % 560, 1.6, 0, Math.PI * 2);
          c.fill();
        }
        c.globalAlpha = 1;
      } else if (city.motif === 'market') {
        // striped stall canopies
        for (i = 0; i < 6; i++) {
          x = -20 + i * 74;
          y = 500 + (i % 3) * 44;
          c.fillStyle = i % 2 ? mixHex(city.hot, '#000000', 0.32) : mixHex(city.glow, '#000000', 0.38);
          c.beginPath();
          c.moveTo(x, y); c.lineTo(x + 78, y); c.lineTo(x + 66, y + 26); c.lineTo(x + 12, y + 26);
          c.closePath(); c.fill();
          c.fillStyle = mixHex(city.bg, '#000000', 0.30);
          c.fillRect(x + 10, y + 26, 58, 120);
        }
        // strung bulbs
        c.strokeStyle = 'rgba(255,255,255,0.18)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(0, 300);
        for (k = 0; k <= W; k += 20) c.lineTo(k, 300 + Math.sin(k * 0.03) * 16);
        c.stroke();
        for (k = 10; k < W; k += 34) {
          var by = 300 + Math.sin(k * 0.03) * 16 + 8;
          c.fillStyle = k % 68 === 10 ? city.glow : city.hot;
          c.globalAlpha = 0.85;
          c.beginPath(); c.arc(k, by, 4, 0, Math.PI * 2); c.fill();
          c.globalAlpha = 1;
        }
      } else if (city.motif === 'terrace') {
        c.fillStyle = mixHex(city.bg, '#000000', 0.36);
        for (i = 0; i < 7; i++) {
          x = i * 58;
          c.fillRect(x, 430 + (i % 4) * 34, 46, H);
        }
        c.strokeStyle = 'rgba(255,255,255,0.14)';
        c.lineWidth = 1;
        for (i = 0; i < 140; i++) {
          x = (i * 47.3) % W;
          y = (i * 83.1) % H;
          c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3, y + 16); c.stroke();
        }
        c.fillStyle = mixHex(city.bg, city.glow, 0.16);
        c.fillRect(0, 748, W, H - 748);
      } else {
        // finale: a mass lantern release over a dark skyline
        c.fillStyle = mixHex(city.bg, '#000000', 0.45);
        for (i = 0; i < 12; i++) {
          x = i * 34;
          c.fillRect(x, 620 + ((i * 53) % 90), 28, H);
        }
        for (i = 0; i < 26; i++) {
          x = (i * 61.7) % W;
          y = 120 + (i * 97.3) % 500;
          var s = 7 + (i % 4) * 3;
          c.globalAlpha = 0.55;
          c.fillStyle = radial(c, x, y, s * 3, i % 3 === 0 ? city.hot : city.glow, 'rgba(0,0,0,0)');
          c.fillRect(x - s * 3, y - s * 3, s * 6, s * 6);
          c.globalAlpha = 1;
          lanternShape(c, x, y, s, s * 1.2, mixHex(city.paper, city.bg, 0.25), city.hot, null);
        }
      }
      // a warm ground glow so no frame is flat
      c.globalAlpha = 0.30;
      c.fillStyle = radial(c, W / 2, H * 0.86, 300, city.glow, 'rgba(0,0,0,0)');
      c.fillRect(0, H * 0.55, W, H * 0.45);
      c.globalAlpha = 1;
    });
    return key;
  };

  /* A dealt card face is baked once per deal, so the play loop only draws one
     image plus its daub marks. Numbers never change inside a run. */
  PlayScene.prototype.bakeCardFace = function (slot, card, city) {
    var S = GRID.face;
    var ox = GRID.ox * S, oy = GRID.oy * S, cell = GRID.cell * S;
    this.canvasTex('lb-card-' + slot, S, S, function (c) {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      rr(c, 4, 6, S - 8, S - 8, 20); c.fill();
      var paper = c.createLinearGradient(0, 0, 0, S);
      paper.addColorStop(0, city.paper);
      paper.addColorStop(1, mixHex(city.paper, city.glow, 0.22));
      c.fillStyle = paper;
      rr(c, 2, 0, S - 6, S - 6, 18); c.fill();
      c.strokeStyle = mixHex(city.ink, city.paper, 0.55);
      c.lineWidth = 2;
      rr(c, 3, 1, S - 8, S - 8, 18); c.stroke();
      // header band with the LIGHT column letters
      c.fillStyle = city.hot;
      rr(c, ox - 3, 5, cell * 5 + 6, 22, 8); c.fill();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '800 15px ' + FONT;
      c.fillStyle = city.paper;
      for (var col = 0; col < 5; col++) c.fillText(COLS[col], ox + cell * (col + 0.5), 17);
      // grid
      for (var r = 0; r < 5; r++) {
        for (var k = 0; k < 5; k++) {
          var x = ox + k * cell, y = oy + r * cell, idx = r * 5 + k;
          c.fillStyle = (r + k) % 2 ? 'rgba(0,0,0,0.045)' : 'rgba(255,255,255,0.30)';
          rr(c, x + 1.5, y + 1.5, cell - 3, cell - 3, 7); c.fill();
          c.strokeStyle = mixHex(city.ink, city.paper, 0.72);
          c.lineWidth = 1;
          rr(c, x + 1.5, y + 1.5, cell - 3, cell - 3, 7); c.stroke();
          if (idx === 12) {
            c.globalAlpha = 0.85;
            lanternShape(c, x + cell / 2, y + cell / 2 - 3, cell * 0.34, cell * 0.40, city.hot, city.glow, null);
            c.globalAlpha = 1;
            c.font = '700 9px ' + FONT;
            c.fillStyle = city.ink;
            c.fillText('FREE', x + cell / 2, y + cell - 8);
          } else {
            c.font = '700 26px ' + FONT;
            c.fillStyle = city.ink;
            c.fillText(String(card.v[idx]), x + cell / 2, y + cell / 2 + 1);
          }
        }
      }
    });
    return 'lb-card-' + slot;
  };

  PlayScene.prototype.layoutCards = function (n) {
    var out = this.cardRects;
    out.length = 0;
    var top = LAY.cardsY, area = LAY.cardsH, s, x, y, i;
    if (n <= 1) {
      s = 320;
      out.push({ x: (W - s) / 2, y: top + (area - s) / 2, s: s });
    } else if (n === 2) {
      s = 226;
      y = top + (area - (s * 2 + 20)) / 2;
      for (i = 0; i < 2; i++) out.push({ x: (W - s) / 2, y: y + i * (s + 20), s: s });
    } else {
      s = 182;
      var gap = 14;
      var gw = s * 2 + gap;
      x = (W - gw) / 2;
      y = top + (area - gw) / 2;
      for (i = 0; i < n; i++) {
        out.push({ x: x + (i % 2) * (s + gap), y: y + Math.floor(i / 2) * (s + gap), s: s });
      }
    }
    return out;
  };

  PlayScene.prototype.cellPoint = function (cardIndex, cellIndex, outPoint) {
    var rect = this.cardRects[cardIndex];
    if (!rect) { outPoint.x = W / 2; outPoint.y = H / 2; return outPoint; }
    var col = cellIndex % 5, row = Math.floor(cellIndex / 5);
    outPoint.x = rect.x + (GRID.ox + GRID.cell * (col + 0.5)) * rect.s;
    outPoint.y = rect.y + (GRID.oy + GRID.cell * (row + 0.5)) * rect.s;
    return outPoint;
  };

  // ------------------------------------------------------------------ create
  PlayScene.prototype.create = function () {
    var self = this, i, j;
    Game.play = this;
    if (kit) kit.loader.show('Lantern Bingo');
    var progress = 0;
    function tick(v) { progress = v; if (kit) kit.loader.progress(v); }

    tick(0.05);
    this.bakeCore();
    tick(0.20);
    this.bakePatternIcons();
    tick(0.32);
    this.bakeSouvenirs();
    tick(0.46);
    this.bakeKeeper();
    tick(0.56);
    this.bakeTitle();
    this.bakeChrome();
    tick(0.66);
    for (i = 0; i < CITIES.length; i++) this.bakeCity(i);
    tick(0.74);
    for (i = 0; i < 4; i++) this.bakeCardFace(i, cardPool[i], cityOf(0));
    tick(0.82);

    var add = this.add;
    var ui = this.ui = {};

    this.background = add.image(W / 2, H / 2, 'lb-bg-harbour').setDisplaySize(W, H).setDepth(0);
    this.background._lbTex = 'lb-bg-harbour';

    // ambient city embers, always alive so no frame is static
    this.embers = [];
    for (i = 0; i < 40; i++) {
      var em = add.image(0, 0, 'lb-spark').setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
      em.setVisible(false);
      this.embers.push({ img: em, x: Math.random() * W, y: Math.random() * H, vy: -6 - Math.random() * 14, vx: (Math.random() - 0.5) * 6, s: 3 + Math.random() * 7, a: 0.10 + Math.random() * 0.35, ph: Math.random() * 6.28 });
    }

    this.chrome = add.image(W / 2, H / 2, 'lb-chrome').setDepth(4);
    this.chrome.setVisible(false);

    // ---- play HUD
    ui.pauseIcon = add.image(28, LAY.hudY + 20, 'lb-panel').setDisplaySize(40, 34).setDepth(6);
    ui.pauseText = add.text(28, LAY.hudY + 20, '||', { fontFamily: FONT, fontSize: '17px', fontStyle: '700', color: C.ink }).setOrigin(0.5).setDepth(7);
    ui.goalIcon = add.image(64, LAY.hudY + 20, 'lb-pat-line').setDisplaySize(30, 30).setDepth(6);
    ui.goalName = add.text(84, LAY.hudY + 12, '', { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: C.ink }).setOrigin(0, 0.5).setDepth(6);
    ui.roomName = add.text(84, LAY.hudY + 29, '', { fontFamily: FONT, fontSize: '12px', color: C.slate }).setOrigin(0, 0.5).setDepth(6);
    ui.score = add.text(372, LAY.hudY + 13, '0', { fontFamily: FONT, fontSize: '19px', fontStyle: '800', color: C.gold }).setOrigin(1, 0.5).setDepth(6);
    ui.scoreSub = add.text(372, LAY.hudY + 30, '', { fontFamily: FONT, fontSize: '12px', color: C.slate }).setOrigin(1, 0.5).setDepth(6);

    ui.coachStrip = add.rectangle(W / 2, LAY.coachY + LAY.coachH / 2, 374, LAY.coachH, tint('#050a12'), 0.66).setDepth(6);
    ui.coachText = add.text(W / 2, LAY.coachY + LAY.coachH / 2, '', { fontFamily: FONT, fontSize: '14px', color: C.ink }).setOrigin(0.5).setDepth(7);

    // ---- call band
    ui.callGlow = add.image(78, LAY.callY + 52, 'lb-glow').setDisplaySize(150, 150).setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    ui.callBall = add.image(78, LAY.callY + 52, 'lb-ball').setDisplaySize(96, 96).setDepth(6);
    ui.callNum = add.text(78, LAY.callY + 54, '', { fontFamily: FONT, fontSize: '34px', fontStyle: '800', color: '#1a1208' }).setOrigin(0.5).setDepth(7);
    ui.callCol = add.text(78, LAY.callY + 30, '', { fontFamily: FONT, fontSize: '13px', fontStyle: '800', color: '#1a1208' }).setOrigin(0.5).setDepth(7);
    ui.callArc = add.graphics().setDepth(7);
    ui.recentLabel = add.text(146, LAY.callY + 14, 'CALLED', { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: C.slate }).setOrigin(0, 0.5).setDepth(6);
    ui.recent = [];
    ui.recentText = [];
    for (i = 0; i < 5; i++) {
      ui.recent.push(add.image(160 + i * 34, LAY.callY + 38, 'lb-minball').setDisplaySize(28, 28).setDepth(6));
      ui.recentText.push(add.text(160 + i * 34, LAY.callY + 38, '', { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: '#14202c' }).setOrigin(0.5).setDepth(7));
    }
    ui.peekLabel = add.text(146, LAY.callY + 62, '', { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: C.jade }).setOrigin(0, 0.5).setDepth(6);
    ui.peek = [];
    for (i = 0; i < 3; i++) {
      ui.peek.push(add.text(210 + i * 34, LAY.callY + 62, '', { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: C.jade }).setOrigin(0.5).setDepth(6));
    }
    ui.keeper = add.image(348, LAY.callY + 50, 'lb-keeper-idle0').setDisplaySize(57, 75).setDepth(6);
    ui.raceLabel = add.text(16, LAY.callY + 96, 'YOU', { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: C.ink }).setOrigin(0, 0.5).setDepth(6);
    ui.raceTrack = add.rectangle(W / 2 + 12, LAY.callY + 96, 300, 4, tint('#22303f'), 0.9).setDepth(5);
    ui.racePips = [];
    for (i = 0; i < 8; i++) ui.racePips.push(add.image(0, LAY.callY + 96, 'lb-pip').setDisplaySize(11, 11).setDepth(6));

    ui.odds = add.text(W / 2, LAY.oddsY + LAY.oddsH / 2, '', { fontFamily: FONT, fontSize: '14px', color: C.muted }).setOrigin(0.5).setDepth(6);

    // ---- cards
    ui.cards = [];
    for (i = 0; i < 4; i++) {
      var group = { face: null, daubs: [], live: null, hints: [], badge: null };
      group.face = add.image(0, 0, 'lb-card-' + i).setDepth(5);
      group.face._lbTex = 'lb-card-' + i;
      for (j = 0; j < 25; j++) {
        group.daubs.push(add.image(0, 0, 'lb-disc').setDepth(6));
      }
      group.live = add.image(0, 0, 'lb-ring').setDepth(7);
      for (j = 0; j < 4; j++) group.hints.push(add.image(0, 0, 'lb-ring-thin').setDepth(7));
      group.badge = add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: C.deep, backgroundColor: '#ffc660', padding: { x: 5, y: 2 } }).setOrigin(0, 0).setDepth(8);
      ui.cards.push(group);
    }
    tick(0.90);

    // ---- meter and chips
    ui.meterFill = add.rectangle(12, LAY.meterY + LAY.meterH / 2, 366, LAY.meterH - 4, tint(C.gold), 1).setOrigin(0, 0.5).setDepth(6);
    ui.meterText = add.text(W / 2, LAY.meterY - 8, '', { fontFamily: FONT, fontSize: '12px', color: C.slate }).setOrigin(0.5).setDepth(6);
    ui.chips = [];
    for (i = 0; i < 4; i++) {
      var cx = 4 + i * (LAY.chipW + LAY.chipGap) + LAY.chipW / 2;
      ui.chips.push({
        frame: add.image(cx, LAY.chipsY + LAY.chipH / 2, 'lb-chipframe').setDepth(6),
        icon: add.image(cx, LAY.chipsY + 24, 'lb-chipicon-' + i).setDisplaySize(30, 30).setDepth(7),
        label: add.text(cx, LAY.chipsY + 50, CHIPS[i].name, { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: C.ink }).setOrigin(0.5).setDepth(7),
        count: add.text(cx + 32, LAY.chipsY + 12, '', { fontFamily: FONT, fontSize: '13px', fontStyle: '800', color: C.deep, backgroundColor: '#ffc660', padding: { x: 4, y: 1 } }).setOrigin(0.5).setDepth(8)
      });
    }

    // ---- transient chip and run-boundary banner
    ui.toastBox = add.rectangle(W - 14, LAY.hudY + LAY.hudH + 16, 160, 26, tint('#050a12'), 0.86).setOrigin(1, 0.5).setDepth(13);
    ui.toastText = add.text(W - 24, LAY.hudY + LAY.hudH + 16, '', { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: C.ink }).setOrigin(1, 0.5).setDepth(14);
    ui.shade = add.rectangle(W / 2, H / 2, W, H, tint('#04070d'), 1).setDepth(10);
    ui.bannerBox = add.rectangle(W / 2, H / 2 - 40, 234, 118, tint('#0a1220'), 0.95).setDepth(15);
    ui.bannerTitle = add.text(W / 2, H / 2 - 62, '', { fontFamily: FONT, fontSize: '28px', fontStyle: '800', color: C.gold }).setOrigin(0.5).setDepth(16);
    ui.bannerSub = add.text(W / 2, H / 2 - 26, '', { fontFamily: FONT, fontSize: '14px', color: C.ink, align: 'center', wordWrap: { width: 210 } }).setOrigin(0.5).setDepth(16);

    // ---- particle pools
    this.sparks = [];
    for (i = 0; i < 150; i++) {
      var sp = add.image(0, 0, 'lb-spark').setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
      sp.setVisible(false);
      this.sparks.push({ img: sp, life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, size: 3, tintHex: '#ffffff' });
    }
    this.rings = [];
    for (i = 0; i < 10; i++) {
      var rg = add.image(0, 0, 'lb-ring-thin').setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
      rg.setVisible(false);
      this.rings.push({ img: rg, life: 0, max: 1, x: 0, y: 0, size: 40 });
    }
    tick(0.96);
    this.buildMenuPools();
    this.installInputBridges();
    this.buildPrewarm();
    this.applyForced(true);
    this.setScreen(this.screen);
    tick(1);
    this.finishLoading();
  };

  PlayScene.prototype.buildMenuPools = function () {
    var add = this.add, ui = this.ui, i;
    ui.title = add.image(W / 2, 150, 'lb-title').setDisplaySize(320, 120).setDepth(11);
    ui.headline = add.text(W / 2, 92, '', { fontFamily: FONT, fontSize: '20px', fontStyle: '800', color: C.ink }).setOrigin(0.5).setDepth(11);
    ui.subline = add.text(W / 2, 118, '', { fontFamily: FONT, fontSize: '13px', color: C.slate, align: 'center', wordWrap: { width: 330 } }).setOrigin(0.5).setDepth(11);
    ui.rows = [];
    for (i = 0; i < 6; i++) {
      ui.rows.push({
        box: add.rectangle(W / 2, 0, 350, 78, tint(C.panel), 0.94).setDepth(11),
        name: add.text(30, 0, '', { fontFamily: FONT, fontSize: '18px', fontStyle: '800', color: C.ink }).setOrigin(0, 0.5).setDepth(11),
        meta: add.text(30, 0, '', { fontFamily: FONT, fontSize: '13px', color: C.slate, wordWrap: { width: 268 } }).setOrigin(0, 0.5).setDepth(11),
        status: add.text(360, 0, '', { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: C.gold }).setOrigin(1, 0.5).setDepth(11),
        icon: add.image(0, 0, 'lb-pat-line').setDisplaySize(30, 30).setDepth(11)
      });
    }
    ui.nodes = [];
    for (i = 0; i < TOUR.length; i++) {
      ui.nodes.push({
        img: add.image(0, 0, 'lb-node').setDisplaySize(62, 62).setDepth(11),
        num: add.text(0, 0, '', { fontFamily: FONT, fontSize: '17px', fontStyle: '800', color: C.ink }).setOrigin(0.5).setDepth(12),
        mark: add.image(0, 0, 'lb-pat-line').setDisplaySize(18, 18).setDepth(12)
      });
    }
    ui.bands = [];
    for (i = 0; i < CITIES.length; i++) {
      ui.bands.push(add.text(16, 0, '', { fontFamily: FONT, fontSize: '13px', fontStyle: '800', color: C.slate }).setOrigin(0, 0.5).setDepth(11));
    }
    ui.slots = [];
    for (i = 0; i < SOUVENIRS.length; i++) {
      ui.slots.push({
        img: add.image(0, 0, 'lb-sv-0').setDisplaySize(44, 44).setDepth(11),
        name: add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', color: C.slate }).setOrigin(0.5).setDepth(11)
      });
    }
    ui.footBtns = [];
    for (i = 0; i < 3; i++) {
      ui.footBtns.push({
        box: add.rectangle(0, 0, 110, 54, tint(C.panel2), 0.96).setDepth(11),
        text: add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: C.ink }).setOrigin(0.5).setDepth(12)
      });
    }
    ui.note = add.text(W / 2, 0, '', { fontFamily: FONT, fontSize: '13px', color: C.slate, align: 'center', wordWrap: { width: 340 } }).setOrigin(0.5, 0).setDepth(11);
  };

  /* Textures upload to the GPU on their first draw. One warm frame with every
     key on screen keeps the first seconds of play free of upload hitches. */
  PlayScene.prototype.buildPrewarm = function () {
    var keys = ['lb-spark', 'lb-glow', 'lb-disc', 'lb-ring', 'lb-ring-thin', 'lb-pip', 'lb-node',
      'lb-chipframe', 'lb-panel', 'lb-ball', 'lb-minball', 'lb-title', 'lb-chrome'];
    var i;
    for (i = 0; i < CITIES.length; i++) keys.push('lb-bg-' + CITIES[i].id);
    for (i = 0; i < PATTERNS.length; i++) keys.push('lb-pat-' + PATTERNS[i].id);
    for (i = 0; i < SOUVENIRS.length; i++) keys.push('lb-sv-' + i);
    for (i = 0; i < 4; i++) { keys.push('lb-chipicon-' + i); keys.push('lb-card-' + i); }
    keys.push('lb-keeper-idle0', 'lb-keeper-idle1', 'lb-keeper-idle2', 'lb-keeper-flare', 'lb-keeper-dim', 'lb-keeper-win');
    this.prewarm = [];
    for (i = 0; i < keys.length; i++) {
      if (!this.textures.exists(keys[i])) continue;
      this.prewarm.push(this.add.image(2, 2, keys[i]).setDisplaySize(2, 2).setAlpha(0.02).setDepth(19));
    }
    this.prewarmFrames = 3;
  };

  PlayScene.prototype.finishLoading = function () {
    var self = this;
    var done = false;
    function hide() {
      if (done) return;
      done = true;
      self.ready = true;
      if (kit) kit.loader.hide();
    }
    if (kit) {
      var guard = setTimeout(hide, 3500);
      kit.audio.preload(SFX_KEYS).then(function () { clearTimeout(guard); hide(); }, function () { clearTimeout(guard); hide(); });
    } else {
      hide();
    }
    if (kit) kit.registerPWA();
  };

  // ------------------------------------------------------------------ input
  PlayScene.prototype.installInputBridges = function () {
    var self = this;
    /* Registered on window AFTER GGKit init so the kit's own pointer map is
       already seeded when this handler claims the press. */
    this.pointerEdgeHandler = function (event) {
      /* Never bail on pause: GGKit stops feeding its own pointer map while the
         sim is paused, and the pause menu still has to be tappable. Gameplay
         actions guard on screen === 'play' instead. */
      if (kit && kit.input && !kit.paused && !kit.input.pointers.has(event.pointerId)) {
        kit.input.pointers.set(event.pointerId, {
          x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
          downAt: performance.now(), zone: null
        });
      }
      self.pointerEdges.push({ id: event.pointerId, x: event.clientX, y: event.clientY });
      if (self.pointerEdges.length > 24) self.pointerEdges.shift();
      self.markInteracted();
    };
    root.addEventListener('pointerdown', this.pointerEdgeHandler, { passive: true });
    /* Same reason for keys: GGKit drops keydown while paused, so the pause and
       menu screens own their own rising-edge queue. */
    this.keyQueue = [];
    this.keyHandler = function (event) {
      if (event.repeat) return;
      self.keyQueue.push(event.code);
      if (self.keyQueue.length > 12) self.keyQueue.shift();
      self.markInteracted();
    };
    root.addEventListener('keydown', this.keyHandler);
    root.addEventListener('blur', function () { self.keyQueue.length = 0; });
  };

  PlayScene.prototype.markInteracted = function () {
    if (this.interacted) return;
    this.interacted = true;
    if (kit) kit.audio.music(this.wantMusic, 900);
  };

  PlayScene.prototype.setMusic = function (name) {
    if (this.wantMusic === name) return;
    this.wantMusic = name;
    if (this.interacted && kit) kit.audio.music(name, 900);
  };

  PlayScene.prototype.zone = function (x, y, w, h, fn) { this.hitZones.push({ x: x, y: y, w: w, h: h, fn: fn }); };
  PlayScene.prototype.gamePoint = function (p) {
    var rect = this.game.canvas.getBoundingClientRect();
    return { x: (p.x - rect.left) / Math.max(1, rect.width) * W, y: (p.y - rect.top) / Math.max(1, rect.height) * H };
  };
  PlayScene.prototype.tapAt = function (x, y) {
    for (var i = this.hitZones.length - 1; i >= 0; i--) {
      var z = this.hitZones[i];
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) { if (z.fn) z.fn(); return; }
    }
  };
  PlayScene.prototype.readInput = function () {
    if (!kit) return;
    var self = this, edge, point;
    while (this.pointerEdges.length) {
      edge = this.pointerEdges.shift();
      if (!this.pointerSeen.has(edge.id)) {
        this.pointerSeen.set(edge.id, true);
        point = this.gamePoint(edge);
        this.tapAt(point.x, point.y);
      }
    }
    kit.input.pointers.forEach(function (p, id) {
      if (!self.pointerSeen.has(id)) {
        self.pointerSeen.set(id, true);
        var q = self.gamePoint(p);
        self.tapAt(q.x, q.y);
      }
    });
    this.pointerSeen.forEach(function (v, id) { if (!kit.input.pointers.has(id)) self.pointerSeen.delete(id); });
    var codes = ['Space', 'Enter', 'Escape', 'KeyP', 'KeyM', 'KeyC', 'KeyR', 'KeyQ', 'KeyW', 'KeyE',
      'Digit1', 'Digit2', 'Digit3', 'Digit4', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    while (this.keyQueue.length) {
      var code = this.keyQueue.shift();
      if (codes.indexOf(code) >= 0) this.keyAction(code);
    }
  };

  // ------------------------------------------------------------------- flow
  PlayScene.prototype.setScreen = function (name) {
    if (name !== this.screen && name !== 'pause' && this.screen !== 'pause') {
      this.toast = null;
      this.toastT = 0;
      this.toastQueue.length = 0;
      if (name !== 'result') { this.banner = null; this.bannerT = 0; }
      this.coachT = 0;
    }
    this.screen = name;
    this.hitZones.length = 0;
    if (name === 'play') {
      this.setMusic(run.mode === 'rush' ? 'music_skyfire'
        : run.mode === 'endless' ? 'music_hall' : cityOf(run.cityIndex).music);
    } else {
      this.setMusic('music_lantern');
    }
    syncProbe();
  };

  PlayScene.prototype.startMode = function (mode, stage) {
    var target = whole(stage, 0);
    if (mode === 'tour') target = clamp(target, 0, TOUR.length - 1);
    if (mode === 'rush') target = clamp(target, 0, RUSH.length - 1);
    if (mode === 'endless') target = 0;
    startRun(mode, target);
    this.setScreen('play');
  };

  PlayScene.prototype.restartCurrent = function () {
    if (this.screen === 'play' || this.screen === 'result') {
      startRun(run.mode, run.stage);
      this.setScreen('play');
    } else {
      this.setScreen('menu');
    }
  };

  PlayScene.prototype.applyForced = function (atBoot) {
    if (!root.__lb) return;
    var fm = normalizeMode(root.__lb.forceMode);
    var fs = root.__lb.forceStage == null ? null : whole(Number(root.__lb.forceStage), 0);
    if (!atBoot && fm === this.lastForcedMode && fs === this.lastForcedStage) return;
    this.lastForcedMode = fm;
    this.lastForcedStage = fs;
    if (!fm) return;
    if (fm === 'menu') { this.setScreen('menu'); return; }
    if (fm === 'map') { this.setScreen('tour'); return; }
    if (fm === 'case') { this.setScreen('case'); return; }
    this.startMode(fm, fs == null ? 0 : fs);
  };

  // -------------------------------------------------------------------- fx
  PlayScene.prototype.burst = function (x, y, color, amount) {
    var made = 0;
    for (var i = 0; i < this.sparks.length && made < amount; i++) {
      var p = this.sparks[i];
      if (p.life > 0) continue;
      var ang = Math.random() * Math.PI * 2;
      var speed = 26 + Math.random() * 120;
      p.x = x; p.y = y;
      p.vx = Math.cos(ang) * speed;
      p.vy = Math.sin(ang) * speed - 26;
      p.max = 0.42 + Math.random() * 0.5;
      p.life = p.max;
      p.size = 3 + Math.random() * 5;
      p.tintHex = color;
      made++;
    }
  };
  PlayScene.prototype.celebrate = function (color) {
    if (REDUCED) { this.burst(W / 2, H * 0.42, color, 16); return; }
    var made = 0;
    for (var i = 0; i < this.sparks.length && made < 70; i++) {
      var p = this.sparks[i];
      if (p.life > 0) continue;
      p.x = 30 + Math.random() * (W - 60);
      p.y = H * 0.55 + Math.random() * 120;
      p.vx = (Math.random() - 0.5) * 40;
      p.vy = -70 - Math.random() * 130;
      p.max = 1.1 + Math.random() * 1.0;
      p.life = p.max;
      p.size = 4 + Math.random() * 7;
      p.tintHex = made % 3 === 0 ? '#ffffff' : color;
      made++;
    }
  };
  PlayScene.prototype.ringPulse = function (x, y, color, size) {
    for (var i = 0; i < this.rings.length; i++) {
      var r = this.rings[i];
      if (r.life > 0) continue;
      r.x = x; r.y = y; r.size = size;
      r.max = REDUCED ? 0.22 : 0.45;
      r.life = r.max;
      setTintIfChanged(r.img, color);
      return;
    }
  };
  PlayScene.prototype.chargeSparks = function (x, y, color) {
    var made = 0;
    for (var i = 0; i < this.sparks.length && made < (REDUCED ? 4 : 12); i++) {
      var p = this.sparks[i];
      if (p.life > 0) continue;
      p.x = x + (Math.random() - 0.5) * 40;
      p.y = y + 16;
      p.vx = (Math.random() - 0.5) * 18;
      p.vy = -50 - Math.random() * 50;
      p.max = 0.5 + Math.random() * 0.4;
      p.life = p.max;
      p.size = 3 + Math.random() * 3;
      p.tintHex = color;
      made++;
    }
  };
  PlayScene.prototype.pushToast = function (text, color) {
    /* One transient at a time: a new chip replaces a stale one and otherwise
       waits its turn. The queue never stacks on screen. */
    var entry = { text: String(text).slice(0, 22), color: color || C.ink };
    if (!this.toast) { this.toast = entry; this.toastT = REDUCED ? 0.7 : 1.0; return; }
    if (this.toastQueue.length > 2) this.toastQueue.shift();
    this.toastQueue.push(entry);
  };
  PlayScene.prototype.showBanner = function (title, sub, color, hold) {
    this.banner = { title: title, sub: sub, color: color || C.gold };
    this.bannerT = hold == null ? 1.5 : hold;
  };
  PlayScene.prototype.setCoach = function (line, hold) {
    this.coachLine = String(line).slice(0, 64);
    this.coachT = hold == null ? 3.4 : hold;
  };
  PlayScene.prototype.setKeeper = function (name, hold) {
    if (this.keeperState === 'win' && name !== 'idle') return;
    this.keeperState = name;
    this.keeperT = hold == null ? 0.4 : hold;
  };

  // ----------------------------------------------------------- sim callbacks
  PlayScene.prototype.onRunStart = function () {
    var city = cityOf(run.cityIndex);
    var i;
    this.bakeCity(run.cityIndex);
    setTextureIfChanged(this.background, 'lb-bg-' + city.id);
    this.layoutCards(run.cards.length);
    for (i = 0; i < run.cards.length; i++) this.bakeCardFace(i, run.cards[i], city);
    for (i = 0; i < this.ui.cards.length; i++) {
      var group = this.ui.cards[i];
      for (var j = 0; j < 25; j++) { group.daubs[j].setScale(1); group.daubs[j]._lbPop = 0; }
    }
    this.keeperState = 'idle';
    this.keeperT = 0;
    this.toast = null;
    this.toastQueue.length = 0;
    this.toastT = 0;
    this.coachT = 0;
    this.tutorialStep = profile.tutorial ? 99 : 0;
    var label = run.mode === 'rush' ? rushLadder(run.stage).name
      : run.mode === 'endless' ? 'ENDLESS HALL'
      : 'STOP ' + (run.stage + 1) + ' OF ' + TOUR.length;
    /* Run boundary beat only, and short: the call odds live permanently on the
       odds strip, so the banner does not repeat them. */
    this.showBanner(label, run.roomName + '\n' + run.pattern.name, city.glow, REDUCED ? 0.9 : 1.7);
    sfx('start', 0.8);
    this.setMusic(run.mode === 'rush' ? 'music_skyfire' : run.mode === 'endless' ? 'music_hall' : city.music);
    if (!profile.tutorial && run.mode === 'tour' && run.stage === 0) {
      this.setCoach('Tap the card holding the called number.', 5);
    }
  };
  PlayScene.prototype.onCall = function () {
    this.callPop = 1;
    var city = cityOf(run.cityIndex);
    fxRing(78, LAY.callY + 52, city.glow, 60);
  };
  PlayScene.prototype.onDaub = function (cardIndex, cellIndex, streak) {
    var group = this.ui.cards[cardIndex];
    if (group && group.daubs[cellIndex]) group.daubs[cellIndex]._lbPop = 1;
    this.callPop = Math.max(this.callPop, 0.4);
    if (this.tutorialStep === 0) { this.tutorialStep = 1; this.setCoach('A missed call stays missed. Watch the clock ring.', 4); }
  };
  PlayScene.prototype.onChipCharged = function (index) {
    var cx = 4 + index * (LAY.chipW + LAY.chipGap) + LAY.chipW / 2;
    this.chipPulse[index] = 1;
    fxCharge(cx, LAY.chipsY + 20, cityOf(run.cityIndex).cool);
    if (this.tutorialStep === 2) { this.tutorialStep = 3; this.setCoach('Streaks charge chips. One tap uses one.', 4); }
  };
  PlayScene.prototype.onChipUsed = function (index) {
    this.chipPulse[index] = 1;
    var cx = 4 + index * (LAY.chipW + LAY.chipGap) + LAY.chipW / 2;
    fxRing(cx, LAY.chipsY + LAY.chipH / 2, cityOf(run.cityIndex).cool, 70);
  };
  PlayScene.prototype.onRunEnd = function () {
    var city = cityOf(run.cityIndex);
    this.setScreen('result');
    this.banner = null;
    this.bannerT = 0;
  };

  PlayScene.prototype.stepTutorial = function () {
    if (profile.tutorial || run.mode !== 'tour' || run.stage !== 0) return;
    if (this.tutorialStep === 1 && run.calls >= 4) {
      this.tutorialStep = 2;
      this.setCoach('One away from the goal glows with a ring.', 4);
    }
  };

  PlayScene.prototype.stepFx = function (dt) {
    var i, p, r;
    for (i = 0; i < this.sparks.length; i++) {
      p = this.sparks[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 62 * dt;
    }
    for (i = 0; i < this.rings.length; i++) {
      r = this.rings[i];
      if (r.life > 0) r.life -= dt;
    }
    for (i = 0; i < this.embers.length; i++) {
      var e = this.embers[i];
      e.y += e.vy * dt;
      e.x += e.vx * dt + Math.sin(this.visualTime * 0.9 + e.ph) * 6 * dt;
      if (e.y < -20) { e.y = H + 16; e.x = Math.random() * W; }
      if (e.x < -20) e.x = W + 16;
      if (e.x > W + 20) e.x = -16;
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) {
        this.toast = this.toastQueue.length ? this.toastQueue.shift() : null;
        this.toastT = this.toast ? (REDUCED ? 0.7 : 1.0) : 0;
      }
    }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.banner = null; }
    if (this.coachT > 0) this.coachT -= dt;
    if (this.keeperT > 0) {
      this.keeperT -= dt;
      if (this.keeperT <= 0 && this.keeperState !== 'idle') this.keeperState = 'idle';
    }
    this.callPop = Math.max(0, this.callPop - dt * 3.4);
    for (i = 0; i < this.chipPulse.length; i++) this.chipPulse[i] = Math.max(0, this.chipPulse[i] - dt * 2.6);
    for (i = 0; i < this.ui.cards.length; i++) {
      var group = this.ui.cards[i];
      for (var j = 0; j < 25; j++) {
        if (group.daubs[j]._lbPop > 0) group.daubs[j]._lbPop = Math.max(0, group.daubs[j]._lbPop - dt * 3.6);
      }
    }
  };

  // ------------------------------------------------------------- keyboard
  PlayScene.prototype.keyAction = function (code) {
    if (code === 'Escape' || code === 'KeyP') {
      if (this.screen === 'play') { this.openPause(); return; }
      if (this.screen === 'pause') { this.closePause(); return; }
      if (this.screen !== 'menu') { sfx('back', 0.6); this.setScreen('menu'); return; }
      return;
    }
    if (this.screen === 'play') {
      if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4') {
        daubCard(Number(code.slice(5)) - 1);
        return;
      }
      if (code === 'Space') { quickDaub(); return; }
      if (code === 'KeyQ') { useChip(0); return; }
      if (code === 'KeyW') { useChip(1); return; }
      if (code === 'KeyE') { useChip(2); return; }
      if (code === 'KeyR') { useChip(3); return; }
      return;
    }
    if (this.screen === 'result') {
      if (code === 'Enter' || code === 'Space') { this.advanceResult(); return; }
      if (code === 'KeyR') { this.restartCurrent(); return; }
      return;
    }
    if (this.screen === 'menu') {
      if (code === 'ArrowUp') { this.menuFocus = (this.menuFocus + 4) % 5; sfx('tap', 0.4); return; }
      if (code === 'ArrowDown') { this.menuFocus = (this.menuFocus + 1) % 5; sfx('tap', 0.4); return; }
      if (code === 'Enter' || code === 'Space') { this.menuSelect(this.menuFocus); return; }
      if (code === 'KeyM') { this.setScreen('tour'); return; }
      if (code === 'KeyC') { this.setScreen('case'); return; }
      return;
    }
    if (this.screen === 'tour') {
      if (code === 'ArrowLeft') { this.mapFocus = (this.mapFocus + TOUR.length - 1) % TOUR.length; sfx('tap', 0.4); return; }
      if (code === 'ArrowRight') { this.mapFocus = (this.mapFocus + 1) % TOUR.length; sfx('tap', 0.4); return; }
      if (code === 'ArrowUp') { this.mapFocus = (this.mapFocus + TOUR.length - 4) % TOUR.length; sfx('tap', 0.4); return; }
      if (code === 'ArrowDown') { this.mapFocus = (this.mapFocus + 4) % TOUR.length; sfx('tap', 0.4); return; }
      if (code === 'Enter' || code === 'Space') { this.pickStop(this.mapFocus); return; }
      return;
    }
    if (this.screen === 'pause') {
      if (code === 'Enter' || code === 'Space') { this.closePause(); return; }
    }
  };

  PlayScene.prototype.openPause = function () {
    if (!kit || this.screen !== 'play') return;
    this.setScreen('pause');
    kit.pause('menu');
    sfx('back', 0.6);
  };
  PlayScene.prototype.closePause = function () {
    if (!kit) return;
    kit.resume('menu');
    this.setScreen('play');
    sfx('tap', 0.6);
  };
  PlayScene.prototype.quitToMenu = function () {
    if (kit && kit.paused) kit.resume('menu');
    sfx('back', 0.7);
    this.setScreen('menu');
  };
  PlayScene.prototype.menuSelect = function (index) {
    sfx('tap', 0.7);
    if (index === 0) { this.setScreen('tour'); return; }
    if (index === 1) { this.startMode('endless', 0); return; }
    if (index === 2) { this.setScreen('rush'); return; }
    if (index === 3) { this.setScreen('case'); return; }
    if (kit) kit.openSettings();
  };
  PlayScene.prototype.pickStop = function (index) {
    if (index > profile.unlocked) { sfx('miss', 0.5); this.pushToast('LOCKED', C.slate); return; }
    this.startMode('tour', index);
  };
  PlayScene.prototype.pickRush = function (index) {
    var ladder = rushLadder(index);
    if (clearedCount(profile) < ladder.unlock) {
      sfx('miss', 0.5);
      this.pushToast('CLEAR ' + ladder.unlock + ' STOPS', C.slate);
      return;
    }
    this.startMode('rush', index);
  };
  PlayScene.prototype.advanceResult = function () {
    sfx('tap', 0.7);
    if (run.result === 'win' && run.mode === 'tour' && run.stage + 1 < TOUR.length) {
      this.startMode('tour', run.stage + 1);
      return;
    }
    if (run.result === 'win' && run.mode === 'rush' && run.stage + 1 < RUSH.length) {
      this.setScreen('rush');
      return;
    }
    if (run.mode === 'tour') { this.setScreen('tour'); return; }
    this.setScreen('menu');
  };

  // ------------------------------------------------------------ frame loop
  PlayScene.prototype.update = function (time, delta) {
    if (this.prewarmFrames > 0) {
      this.prewarmFrames--;
      if (this.prewarmFrames === 0 && this.prewarm) {
        for (var w = 0; w < this.prewarm.length; w++) this.prewarm[w].destroy();
        this.prewarm = null;
      }
    }
    /* Hit zones are rebuilt by render() and consumed on the NEXT frame, so a
       press is always tested against zones that were actually on screen. */
    this.readInput();
    this.applyForced(false);
    var frame = kit ? kit.juice.frame() : { dx: 0, dy: 0, frozen: false };
    var paused = kit ? kit.paused : false;
    var dt = Math.min(0.1, (delta || 16.7) / 1000);
    if (!paused && !frame.frozen) {
      this.visualTime += dt;
      this.accumulator += dt;
      var steps = 0;
      while (this.accumulator >= STEP && steps < MAX_STEPS) {
        this.accumulator -= STEP;
        steps++;
        if (this.screen === 'play') stepSim(STEP);
        else this.stepFx(STEP);
      }
      if (this.accumulator > STEP * MAX_STEPS) this.accumulator = 0;
    }
    this.cameras.main.setScroll(-frame.dx, -frame.dy);
    this.render();
    syncProbe();
  };

  // ----------------------------------------------------------------- render
  PlayScene.prototype.hideAll = function () {
    var ui = this.ui, i, j;
    this.hitZones.length = 0;
    visible(this.chrome, false);
    visible(ui.pauseIcon, false); visible(ui.pauseText, false);
    visible(ui.goalIcon, false); visible(ui.goalName, false); visible(ui.roomName, false);
    visible(ui.score, false); visible(ui.scoreSub, false);
    visible(ui.coachStrip, false); visible(ui.coachText, false);
    visible(ui.callGlow, false); visible(ui.callBall, false); visible(ui.callNum, false);
    visible(ui.callCol, false); visible(ui.recentLabel, false); visible(ui.peekLabel, false);
    visible(ui.keeper, false); visible(ui.raceLabel, false); visible(ui.raceTrack, false);
    visible(ui.odds, false); visible(ui.meterFill, false); visible(ui.meterText, false);
    visible(ui.toastBox, false); visible(ui.toastText, false);
    visible(ui.shade, false); visible(ui.bannerBox, false);
    visible(ui.bannerTitle, false); visible(ui.bannerSub, false);
    visible(ui.title, false); visible(ui.headline, false); visible(ui.subline, false);
    visible(ui.note, false);
    ui.callArc.clear();
    for (i = 0; i < ui.recent.length; i++) { visible(ui.recent[i], false); visible(ui.recentText[i], false); }
    for (i = 0; i < ui.peek.length; i++) visible(ui.peek[i], false);
    for (i = 0; i < ui.racePips.length; i++) visible(ui.racePips[i], false);
    for (i = 0; i < ui.chips.length; i++) {
      visible(ui.chips[i].frame, false); visible(ui.chips[i].icon, false);
      visible(ui.chips[i].label, false); visible(ui.chips[i].count, false);
    }
    for (i = 0; i < ui.cards.length; i++) {
      visible(ui.cards[i].face, false);
      visible(ui.cards[i].live, false);
      visible(ui.cards[i].badge, false);
      for (j = 0; j < 25; j++) visible(ui.cards[i].daubs[j], false);
      for (j = 0; j < ui.cards[i].hints.length; j++) visible(ui.cards[i].hints[j], false);
    }
    for (i = 0; i < ui.rows.length; i++) {
      visible(ui.rows[i].box, false); visible(ui.rows[i].name, false);
      visible(ui.rows[i].meta, false); visible(ui.rows[i].status, false); visible(ui.rows[i].icon, false);
    }
    for (i = 0; i < ui.nodes.length; i++) {
      visible(ui.nodes[i].img, false); visible(ui.nodes[i].num, false); visible(ui.nodes[i].mark, false);
    }
    for (i = 0; i < ui.bands.length; i++) visible(ui.bands[i], false);
    for (i = 0; i < ui.slots.length; i++) { visible(ui.slots[i].img, false); visible(ui.slots[i].name, false); }
    for (i = 0; i < ui.footBtns.length; i++) { visible(ui.footBtns[i].box, false); visible(ui.footBtns[i].text, false); }
  };

  PlayScene.prototype.renderParticles = function () {
    var i, p, r, e, k;
    for (i = 0; i < this.sparks.length; i++) {
      p = this.sparks[i];
      if (p.life <= 0) { visible(p.img, false); continue; }
      k = p.life / p.max;
      visible(p.img, true);
      p.img.setPosition(p.x, p.y);
      p.img.setDisplaySize(p.size * k + 1, p.size * k + 1);
      p.img.setAlpha(clamp(k, 0, 1));
      setTintIfChanged(p.img, p.tintHex);
    }
    for (i = 0; i < this.rings.length; i++) {
      r = this.rings[i];
      if (r.life <= 0) { visible(r.img, false); continue; }
      k = 1 - r.life / r.max;
      visible(r.img, true);
      r.img.setPosition(r.x, r.y);
      r.img.setDisplaySize(r.size * (0.5 + k * 1.1), r.size * (0.5 + k * 1.1));
      r.img.setAlpha((1 - k) * 0.8);
    }
    var showEmbers = this.screen !== 'pause';
    for (i = 0; i < this.embers.length; i++) {
      e = this.embers[i];
      if (!showEmbers) { visible(e.img, false); continue; }
      visible(e.img, true);
      e.img.setPosition(e.x, e.y);
      e.img.setDisplaySize(e.s, e.s);
      e.img.setAlpha(e.a * (0.6 + 0.4 * Math.sin(this.visualTime * 1.6 + e.ph)));
      setTintIfChanged(e.img, cityOf(this.screen === 'play' ? run.cityIndex : 0).glow);
    }
  };

  PlayScene.prototype.renderTransients = function () {
    var ui = this.ui;
    if (this.toast && this.toastT > 0) {
      var fade = clamp(this.toastT / 0.3, 0, 1);
      visible(ui.toastBox, true); visible(ui.toastText, true);
      setTextIfChanged(ui.toastText, this.toast.text, this.toast.color);
      ui.toastText.setAlpha(fade);
      ui.toastBox.setAlpha(0.86 * fade);
      ui.toastBox.setSize(Math.max(90, ui.toastText.width + 22), 26);
    }
    if (this.banner && this.bannerT > 0) {
      var life = this.bannerT;
      var grow = REDUCED ? 1 : clamp(easeBack(clamp(1 - life / 1.7, 0, 1) * 2.2), 0.85, 1.06);
      var alpha = clamp(life / 0.35, 0, 1);
      visible(ui.shade, true);
      visible(ui.bannerBox, true); visible(ui.bannerTitle, true); visible(ui.bannerSub, true);
      ui.shade.setAlpha(0.42 * alpha);
      setTextIfChanged(ui.bannerTitle, this.banner.title, this.banner.color);
      setTextIfChanged(ui.bannerSub, this.banner.sub, C.ink);
      ui.bannerBox.setSize(234, Math.max(96, 56 + ui.bannerSub.height));
      ui.bannerBox.setAlpha(0.95 * alpha);
      ui.bannerBox.setScale(grow);
      ui.bannerTitle.setAlpha(alpha).setScale(grow);
      ui.bannerSub.setAlpha(alpha).setScale(grow);
    }
  };

  PlayScene.prototype.renderPlay = function (dim) {
    var ui = this.ui, i, j, city = cityOf(run.cityIndex);
    visible(this.chrome, true);
    setTextureIfChanged(this.background, 'lb-bg-' + city.id);

    visible(ui.pauseIcon, true); visible(ui.pauseText, true);
    setTintIfChanged(ui.pauseIcon, city.cool);
    if (!dim) this.zone(6, LAY.hudY - 2, 48, LAY.hudH + 4, this.openPause.bind(this));

    visible(ui.goalIcon, true); visible(ui.goalName, true); visible(ui.roomName, true);
    setTextureIfChanged(ui.goalIcon, 'lb-pat-' + run.pattern.id);
    setTextIfChanged(ui.goalName, run.pattern.name, C.ink);
    var sub = run.mode === 'rush'
      ? rushLadder(run.stage).name + '  ' + (run.rushIndex + 1) + '/' + rushLadder(run.stage).patterns.length
      : run.mode === 'endless' ? 'Endless Hall ' + (run.halls + 1)
      : 'Stop ' + (run.stage + 1) + '  ' + run.roomName;
    setTextIfChanged(ui.roomName, sub, C.slate);
    visible(ui.score, true); visible(ui.scoreSub, true);
    setTextIfChanged(ui.score, String(run.score), run.doubleT > 0 ? city.hot : C.gold);
    setTextIfChanged(ui.scoreSub, run.streak > 1 ? 'STREAK ' + run.streak : (run.doubleT > 0 ? 'DOUBLE' : ''), run.doubleT > 0 ? city.hot : C.slate);

    if (this.coachT > 0 && this.coachLine && !dim) {
      visible(ui.coachStrip, true); visible(ui.coachText, true);
      var ca = clamp(this.coachT / 1.2, 0.12, 0.92);
      ui.coachStrip.setAlpha(0.6 * ca);
      ui.coachText.setAlpha(ca);
      setTextIfChanged(ui.coachText, this.coachLine, C.ink);
    }

    // caller lantern
    visible(ui.callGlow, true); visible(ui.callBall, true);
    var pop = 1 + (REDUCED ? 0 : this.callPop * 0.16);
    ui.callBall.setDisplaySize(96 * pop, 96 * pop);
    setTintIfChanged(ui.callBall, run.live ? city.paper : mixHex(city.paper, city.bg, 0.5));
    ui.callGlow.setDisplaySize(160 * pop, 160 * pop);
    setTintIfChanged(ui.callGlow, run.live ? city.glow : C.slate);
    ui.callGlow.setAlpha(run.live ? 0.55 : 0.18);
    if (run.current != null) {
      visible(ui.callNum, true); visible(ui.callCol, true);
      setTextIfChanged(ui.callNum, String(run.current), '#1a1208');
      setTextIfChanged(ui.callCol, COLS[Math.min(4, Math.floor((run.current - 1) / 15))], '#54402a');
      ui.callNum.setScale(pop);
    }
    // hand tessellated clock ring: 44 segments, never Graphics.arc
    var frac = clamp(1 - run.elapsed / Math.max(0.001, run.interval), 0, 1);
    ui.callArc.clear();
    ui.callArc.lineStyle(5, tint(run.freezeT > 0 ? city.cool : run.live ? city.glow : C.red), 0.95);
    var segs = 44, radius = 55, cx = 78, cy = LAY.callY + 52;
    ui.callArc.beginPath();
    for (i = 0; i <= segs; i++) {
      var t = i / segs;
      if (t > frac) break;
      var a = -Math.PI / 2 + t * Math.PI * 2;
      var px = cx + Math.cos(a) * radius, py = cy + Math.sin(a) * radius;
      if (i === 0) ui.callArc.moveTo(px, py); else ui.callArc.lineTo(px, py);
    }
    ui.callArc.strokePath();

    visible(ui.recentLabel, true);
    for (i = 0; i < ui.recent.length; i++) {
      var value = run.recent[i + 1];
      var show = value != null;
      visible(ui.recent[i], show); visible(ui.recentText[i], show);
      if (!show) continue;
      ui.recent[i].setAlpha(0.85 - i * 0.13);
      setTintIfChanged(ui.recent[i], mixHex(city.paper, city.bg, 0.18));
      setTextIfChanged(ui.recentText[i], String(value), '#14202c');
    }
    if (run.peekT > 0 && run.peek.length) {
      visible(ui.peekLabel, true);
      setTextIfChanged(ui.peekLabel, 'NEXT', city.cool);
      for (i = 0; i < ui.peek.length; i++) {
        var pv = run.peek[i];
        visible(ui.peek[i], pv != null);
        if (pv != null) setTextIfChanged(ui.peek[i], String(pv), city.cool);
      }
    }

    visible(ui.keeper, true);
    var frameName = 'lb-keeper-idle' + (Math.floor(this.visualTime * 3.6) % 3);
    if (this.keeperState === 'flare') frameName = 'lb-keeper-flare';
    else if (this.keeperState === 'streak') frameName = 'lb-keeper-flare';
    else if (this.keeperState === 'dim') frameName = 'lb-keeper-dim';
    else if (this.keeperState === 'win') frameName = 'lb-keeper-win';
    setTextureIfChanged(ui.keeper, frameName);
    var bob = REDUCED ? 0 : Math.sin(this.visualTime * 2.1) * 2;
    ui.keeper.setPosition(348, LAY.callY + 50 + bob);
    ui.keeper.setDisplaySize(57 * (this.keeperState === 'streak' ? 1.08 : 1), 75 * (this.keeperState === 'streak' ? 1.08 : 1));

    // rival race track
    visible(ui.raceLabel, true); visible(ui.raceTrack, true);
    var mine = playerProgress();
    var pipIndex = 0;
    visible(ui.racePips[0], true);
    ui.racePips[0].setPosition(48 + mine * 300, LAY.callY + 96).setDisplaySize(14, 14);
    setTintIfChanged(ui.racePips[0], city.glow);
    ui.racePips[0].setAlpha(1);
    pipIndex = 1;
    for (i = 0; i < run.rivals.length && pipIndex < ui.racePips.length; i++) {
      var pip = ui.racePips[pipIndex++];
      visible(pip, true);
      pip.setPosition(48 + run.rivals[i].progress * 300, LAY.callY + 96).setDisplaySize(9, 9);
      setTintIfChanged(pip, run.rivals[i].progress > mine ? C.red : C.slate);
      pip.setAlpha(0.85);
    }

    // posted odds, part of the play screen
    visible(ui.odds, !dim);
    var odds = hitOdds();
    setTextIfChanged(ui.odds, 'NEXT CALL HITS YOUR CARDS  ' + odds.hits + ' in ' + odds.left + '  ·  no repeats', C.muted);

    this.renderCards(city, dim);

    if (dim) return;
    visible(ui.meterFill, true); visible(ui.meterText, true);
    var left = clamp((run.sequence.length - run.cursor) / DECK, 0, 1);
    ui.meterFill.setSize(366 * left, LAY.meterH - 4);
    setFillIfChanged(ui.meterFill, left < 0.2 ? C.red : city.glow, 1);
    var meterLabel = run.mode === 'rush'
      ? 'CALLS ' + run.rushCalls + ' / ' + run.rushBudget
      : (run.sequence.length - run.cursor) + ' CALLS LEFT';
    setTextIfChanged(ui.meterText, meterLabel, C.slate);

    for (i = 0; i < ui.chips.length; i++) {
      var chip = ui.chips[i];
      var have = run.chips[i];
      var cxp = 4 + i * (LAY.chipW + LAY.chipGap) + LAY.chipW / 2;
      visible(chip.frame, true); visible(chip.icon, true); visible(chip.label, true);
      var pulse = 1 + (REDUCED ? 0 : this.chipPulse[i] * 0.12);
      chip.frame.setDisplaySize(LAY.chipW * pulse, LAY.chipH * pulse);
      setTintIfChanged(chip.frame, have > 0 ? city.cool : C.slate);
      chip.frame.setAlpha(have > 0 ? 1 : 0.45);
      setTintIfChanged(chip.icon, have > 0 ? city.paper : C.slate);
      chip.icon.setAlpha(have > 0 ? 1 : 0.45);
      setTextIfChanged(chip.label, CHIPS[i].name, have > 0 ? C.ink : C.slate);
      chip.label.setAlpha(have > 0 ? 1 : 0.5);
      visible(chip.count, have > 0);
      if (have > 0) setTextIfChanged(chip.count, String(have), C.deep);
      this.zone(cxp - LAY.chipW / 2, LAY.chipsY, LAY.chipW, LAY.chipH, (function (n) {
        return function () { useChip(n); };
      })(i));
    }

    // charge meter folded into the chip cradle edge
    var chargeFrac = run.charge / CHARGE_COST;
    ui.meterText.setAlpha(1);
    if (chargeFrac > 0) setTextIfChanged(ui.meterText, meterLabel + '   ·   CHIP ' + Math.round(chargeFrac * 100) + '%', C.slate);
  };

  PlayScene.prototype.renderCards = function (city, dim) {
    var ui = this.ui, i, j;
    for (i = 0; i < ui.cards.length; i++) {
      var group = ui.cards[i];
      var card = run.cards[i];
      var rect = this.cardRects[i];
      if (!card || !rect) continue;
      visible(group.face, true);
      setTextureIfChanged(group.face, 'lb-card-' + i);
      group.face.setPosition(rect.x + rect.s / 2, rect.y + rect.s / 2).setDisplaySize(rect.s, rect.s);
      var cell = GRID.cell * rect.s;
      for (j = 0; j < 25; j++) {
        var mark = group.daubs[j];
        if (!card.m[j] || j === 12) { visible(mark, false); continue; }
        visible(mark, true);
        this.cellPoint(i, j, tmpPoint);
        var popK = mark._lbPop || 0;
        var size = cell * (0.80 + popK * 0.42);
        mark.setPosition(tmpPoint.x, tmpPoint.y).setDisplaySize(size, size);
        setTintIfChanged(mark, city.hot);
        mark.setAlpha(0.94);
      }
      // live match ring: at most one cell per card can hold the current call
      if (card.live >= 0 && run.live) {
        visible(group.live, true);
        this.cellPoint(i, card.live, tmpPoint);
        var beat = REDUCED ? 1 : 1 + Math.sin(this.visualTime * 9) * 0.07;
        group.live.setPosition(tmpPoint.x, tmpPoint.y).setDisplaySize(cell * 1.02 * beat, cell * 1.02 * beat);
        setTintIfChanged(group.live, city.glow);
        group.live.setAlpha(0.95);
      } else {
        visible(group.live, false);
      }
      // one away: unmistakable, a thin bright ring on every completing cell
      for (j = 0; j < group.hints.length; j++) {
        var hintCell = card.oneAway[j];
        if (hintCell == null) { visible(group.hints[j], false); continue; }
        visible(group.hints[j], true);
        this.cellPoint(i, hintCell, tmpPoint);
        var hb = REDUCED ? 1 : 1 + Math.sin(this.visualTime * 5 + j) * 0.05;
        group.hints[j].setPosition(tmpPoint.x, tmpPoint.y).setDisplaySize(cell * 0.94 * hb, cell * 0.94 * hb);
        setTintIfChanged(group.hints[j], C.jade);
        group.hints[j].setAlpha(0.85);
      }
      if (card.hadOneAway) {
        visible(group.badge, true);
        setTextIfChanged(group.badge, 'ONE AWAY');
        group.badge.setPosition(rect.x + 6, rect.y - 4);
      } else {
        visible(group.badge, false);
      }
      if (!dim) this.zone(rect.x, rect.y, rect.s, rect.s, (function (n) { return function () { daubCard(n); }; })(i));
    }
  };

  PlayScene.prototype.footBtn = function (slot, count, label, color, fn, rowY) {
    var ui = this.ui, b = ui.footBtns[slot];
    if (!b) return;
    var w = count === 1 ? 250 : count === 2 ? 168 : 114;
    var x = count === 1 ? W / 2 : count === 2 ? (slot === 0 ? 103 : 287) : 68 + slot * 127;
    var y = rowY == null ? 782 : rowY;
    visible(b.box, true); visible(b.text, true);
    b.box.setPosition(x, y).setSize(w, 54);
    setFillIfChanged(b.box, C.panel2, 0.96);
    setStrokeIfChanged(b.box, color, 2);
    b.text.setPosition(x, y);
    setTextIfChanged(b.text, label, color);
    this.zone(x - w / 2, y - 27, w, 54, fn);
  };

  PlayScene.prototype.renderMenu = function () {
    var ui = this.ui, i;
    this.flattenDepths();
    ui.shade.setAlpha(0.18);
    setTextureIfChanged(this.background, 'lb-bg-' + cityOf(0).id);
    visible(ui.title, true);
    ui.title.setPosition(W / 2, 148 + (REDUCED ? 0 : Math.sin(this.visualTime * 1.3) * 3));
    var rows = [
      ['LANTERN TOUR', TOUR.length + ' rooms across 5 cities', clearedCount(profile) + '/' + TOUR.length, 'lb-pat-' + tourStop(profile.unlocked).pattern],
      ['ENDLESS HALL', 'Patterns forever, one long score run', profile.endlessBest ? String(profile.endlessBest) : 'PLAY', 'lb-pat-line'],
      ['PATTERN RUSH', 'Exotic patterns against a call budget', clearedCount(profile) >= RUSH[1].unlock ? 'OPEN' : 'LADDER 1', 'lb-pat-diamond'],
      ['SOUVENIR CASE', 'Collectables earned only by play', souvenirCount(profile) + '/' + SOUVENIRS.length, 'lb-pat-stamp'],
      ['SETTINGS', 'Sound, screen shake, controls', '', 'lb-pat-frame']
    ];
    for (i = 0; i < rows.length; i++) {
      var r = ui.rows[i];
      var y = 268 + i * 88;
      var focus = this.menuFocus === i;
      visible(r.box, true); visible(r.name, true); visible(r.meta, true); visible(r.status, true); visible(r.icon, true);
      r.box.setPosition(W / 2, y).setSize(350, 78);
      setFillIfChanged(r.box, focus ? '#1b2a3e' : C.panel, 0.94);
      setStrokeIfChanged(r.box, focus ? C.gold : C.line, focus ? 2 : 1);
      r.icon.setPosition(48, y).setDisplaySize(34, 34);
      setTextureIfChanged(r.icon, rows[i][3]);
      r.name.setPosition(78, y - 12);
      setTextIfChanged(r.name, rows[i][0], focus ? C.gold : C.ink);
      r.meta.setPosition(78, y + 12);
      setTextIfChanged(r.meta, rows[i][1], C.slate);
      r.status.setPosition(360, y);
      setTextIfChanged(r.status, rows[i][2], C.jade);
      this.zone(20, y - 39, 350, 78, (function (n) { return function () { this.menuFocus = n; this.menuSelect(n); }; })(i).bind(this));
    }
    visible(ui.note, true);
    ui.note.setPosition(W / 2, 736);
    setTextIfChanged(ui.note, 'Tap a card to daub the called number. Every call is 1 of 75, drawn without repeats. Nothing is for sale.', C.slate);
  };

  PlayScene.prototype.renderTour = function () {
    var ui = this.ui, i;
    this.flattenDepths();
    setTextureIfChanged(this.background, 'lb-bg-' + cityOf(clamp(Math.floor(this.mapFocus / 4), 0, 4)).id);
    visible(ui.headline, true); visible(ui.subline, true);
    setTextIfChanged(ui.headline, 'LANTERN TOUR', C.ink);
    setTextIfChanged(ui.subline, clearedCount(profile) + ' of ' + TOUR.length + ' rooms cleared  ·  ' + souvenirCount(profile) + ' souvenirs', C.slate);
    for (i = 0; i < CITIES.length; i++) {
      var band = ui.bands[i];
      var by = 150 + i * 106;
      visible(band, true);
      band.setPosition(20, by);
      setTextIfChanged(band, CITIES[i].short + '  ·  ' + CITIES[i].name, CITIES[i].glow);
    }
    for (i = 0; i < TOUR.length; i++) {
      var node = ui.nodes[i];
      var cityRow = Math.floor(i / 4);
      var col = i % 4;
      var x = 62 + col * 89;
      var y = 194 + cityRow * 106;
      var unlocked = i <= profile.unlocked;
      var cleared = profile.cleared[i];
      var focus = this.mapFocus === i;
      visible(node.img, true); visible(node.num, true); visible(node.mark, true);
      node.img.setPosition(x, y).setDisplaySize(focus ? 68 : 62, focus ? 68 : 62);
      setTintIfChanged(node.img, cleared ? cityOf(TOUR[i].city).glow : unlocked ? C.ink : C.slate);
      node.img.setAlpha(unlocked ? 1 : 0.42);
      node.num.setPosition(x, y - 8);
      setTextIfChanged(node.num, String(i + 1), cleared ? cityOf(TOUR[i].city).glow : unlocked ? C.ink : C.slate);
      node.mark.setPosition(x, y + 14).setDisplaySize(20, 20);
      setTextureIfChanged(node.mark, 'lb-pat-' + TOUR[i].pattern);
      node.mark.setAlpha(unlocked ? 0.95 : 0.35);
      this.zone(x - 34, y - 34, 68, 68, (function (n) { return function () { this.mapFocus = n; this.pickStop(n); }; })(i).bind(this));
    }
    var stop = tourStop(this.mapFocus);
    visible(ui.note, true);
    ui.note.setPosition(W / 2, 666);
    setTextIfChanged(ui.note, 'STOP ' + (this.mapFocus + 1) + '  ' + stop.room + '\n' + patternById(stop.pattern).name +
      '  ·  ' + stop.cards + ' card' + (stop.cards === 1 ? '' : 's') + '  ·  ' + stop.rivals + ' rivals  ·  call every ' +
      stop.interval.toFixed(2) + 's\nBest ' + profile.best[this.mapFocus], C.slate);
    this.footBtn(0, 2, this.mapFocus <= profile.unlocked ? 'PLAY STOP' : 'LOCKED', this.mapFocus <= profile.unlocked ? C.gold : C.slate, (function () { this.pickStop(this.mapFocus); }).bind(this));
    this.footBtn(1, 2, 'BACK', C.slate, (function () { sfx('back', 0.6); this.setScreen('menu'); }).bind(this));
  };

  PlayScene.prototype.renderRush = function () {
    var ui = this.ui, i;
    this.flattenDepths();
    ui.shade.setAlpha(0.56);
    setTextureIfChanged(this.background, 'lb-bg-' + cityOf(4).id);
    visible(ui.headline, true); visible(ui.subline, true);
    setTextIfChanged(ui.headline, 'PATTERN RUSH', C.ink);
    setTextIfChanged(ui.subline, 'Five exotic patterns, one call budget each', C.slate);
    for (i = 0; i < RUSH.length; i++) {
      var ladder = RUSH[i];
      var r = ui.rows[i];
      var y = 232 + i * 110;
      var open = clearedCount(profile) >= ladder.unlock;
      visible(r.box, true); visible(r.name, true); visible(r.meta, true); visible(r.status, true); visible(r.icon, true);
      r.box.setPosition(W / 2, y).setSize(350, 92);
      setFillIfChanged(r.box, C.panel, 0.94);
      setStrokeIfChanged(r.box, open ? cityOf(ladder.city).glow : C.line, open ? 2 : 1);
      r.icon.setPosition(48, y).setDisplaySize(34, 34);
      setTextureIfChanged(r.icon, 'lb-pat-' + ladder.patterns[0]);
      r.icon.setAlpha(open ? 1 : 0.4);
      r.name.setPosition(78, y - 22);
      setTextIfChanged(r.name, ladder.name, open ? C.ink : C.slate);
      r.meta.setPosition(78, y + 4);
      var names = [];
      for (var k = 0; k < ladder.patterns.length; k++) names.push(patternById(ladder.patterns[k]).name);
      setTextIfChanged(r.meta, names.join(', '), C.slate);
      r.status.setPosition(360, y - 22);
      setTextIfChanged(r.status, open ? (profile.rushBest[i] ? String(profile.rushBest[i]) : 'PLAY') : 'CLEAR ' + ladder.unlock, open ? C.jade : C.slate);
      this.zone(20, y - 46, 350, 92, (function (n) { return function () { this.pickRush(n); }; })(i).bind(this));
    }
    visible(ui.note, true);
    ui.note.setPosition(W / 2, 590);
    setTextIfChanged(ui.note, 'A rush pattern must close inside its posted call budget. Rivals sit this one out; the drum is the only opponent.', C.slate);
    this.footBtn(0, 1, 'BACK', C.slate, (function () { sfx('back', 0.6); this.setScreen('menu'); }).bind(this));
  };

  PlayScene.prototype.renderCase = function () {
    var ui = this.ui, i;
    this.flattenDepths();
    ui.shade.setAlpha(0.56);
    setTextureIfChanged(this.background, 'lb-bg-' + cityOf(2).id);
    visible(ui.headline, true); visible(ui.subline, true);
    setTextIfChanged(ui.headline, 'SOUVENIR CASE', C.ink);
    setTextIfChanged(ui.subline, souvenirCount(profile) + ' of ' + SOUVENIRS.length + ' collected  ·  one per tour room', C.slate);
    for (i = 0; i < CITIES.length; i++) {
      var band = ui.bands[i];
      visible(band, true);
      band.setPosition(20, 158 + i * 112);
      setTextIfChanged(band, CITIES[i].short, CITIES[i].glow);
    }
    for (i = 0; i < SOUVENIRS.length; i++) {
      var slot = ui.slots[i];
      var row = Math.floor(i / 4);
      var col = i % 4;
      var x = 62 + col * 89;
      var y = 202 + row * 112;
      var owned = profile.souvenirs[i];
      visible(slot.img, true); visible(slot.name, true);
      slot.img.setPosition(x, y).setDisplaySize(52, 52);
      setTextureIfChanged(slot.img, 'lb-sv-' + i);
      slot.img.setAlpha(owned ? 1 : 0.24);
      slot.name.setPosition(x, y + 36);
      setTextIfChanged(slot.name, owned ? SOUVENIRS[i].name : 'STOP ' + (i + 1), owned ? C.ink : C.slate);
    }
    visible(ui.note, true);
    ui.note.setPosition(W / 2, 706);
    setTextIfChanged(ui.note, 'Souvenirs are earned by clearing a tour room. They cannot be bought and they never expire.', C.slate);
    this.footBtn(0, 1, 'BACK', C.slate, (function () { sfx('back', 0.6); this.setScreen('menu'); }).bind(this));
  };

  /* The menu screens share their header and plate objects with the pause and
     result overlays, so every screen restates depth AND position instead of
     inheriting whatever the last overlay left behind. */
  PlayScene.prototype.flattenDepths = function () {
    var ui = this.ui, i;
    ui.headline.setDepth(12); ui.subline.setDepth(12); ui.note.setDepth(12);
    ui.headline.setPosition(W / 2, 92);
    ui.subline.setPosition(W / 2, 118);
    visible(ui.shade, true);
    ui.shade.setAlpha(0.34);
    ui.rows[5].box.setDepth(11);
    for (i = 0; i < ui.slots.length; i++) { ui.slots[i].img.setDepth(11); ui.slots[i].name.setDepth(12); }
  };

  PlayScene.prototype.overlayPlate = function (title, titleColor, sub, bottom) {
    var ui = this.ui, plate = ui.rows[5];
    visible(ui.shade, true);
    ui.shade.setAlpha(0.88);
    visible(plate.box, true);
    /* Explicit depths: these objects are shared with the menus, where creation
       order decides the draw order at equal depth. */
    plate.box.setDepth(11);
    ui.headline.setDepth(12);
    ui.subline.setDepth(12);
    ui.note.setDepth(12);
    var low = bottom == null ? 740 : bottom;
    plate.box.setPosition(W / 2, (250 + low) / 2).setSize(352, low - 250);
    setFillIfChanged(plate.box, '#0a1220', 1);
    setStrokeIfChanged(plate.box, titleColor, 2);
    visible(ui.headline, true); visible(ui.subline, true);
    ui.headline.setPosition(W / 2, 296);
    setTextIfChanged(ui.headline, title, titleColor);
    ui.subline.setPosition(W / 2, 336);
    setTextIfChanged(ui.subline, sub, C.ink);
  };

  PlayScene.prototype.renderPause = function () {
    var ui = this.ui;
    this.overlayPlate('PAUSED', C.gold, run.roomName + '  ·  ' + run.pattern.name, 740);
    var odds = hitOdds();
    visible(ui.note, true);
    ui.note.setPosition(W / 2, 380);
    setTextIfChanged(ui.note,
      'Posted odds: 75 numbers, drawn without repeats. ' + odds.hits + ' of the ' + odds.left +
      ' still in the drum sit unmarked on your cards.\n\nAUTO daubs every live match. DOUBLE doubles score for 8s. ' +
      'FREEZE holds the call clock 4.5s. PEEK shows the next three.\n\nKeys: 1 to 4 daub, Space quick daub, Q W E R chips, P pause.', C.slate);
    this.footBtn(0, 3, 'RESUME', C.gold, this.closePause.bind(this), 700);
    this.footBtn(1, 3, 'RESTART', C.jade, (function () { if (kit) { kit.resume('menu'); kit.restart(); } }).bind(this), 700);
    this.footBtn(2, 3, 'QUIT', C.slate, this.quitToMenu.bind(this), 700);
  };

  PlayScene.prototype.renderResult = function () {
    var ui = this.ui;
    var won = run.result === 'win';
    var city = cityOf(run.cityIndex);
    var accent = won ? city.glow : C.red;
    var hasSouvenir = run.souvenir >= 0;
    this.overlayPlate(run.resultTitle, accent, run.resultText, hasSouvenir ? 740 : 524);
    var btnY = hasSouvenir ? 700 : 484;
    var lines = 'SCORE ' + run.score + (run.newBest ? '   NEW BEST' : '') +
      '\nCALLS USED ' + run.calls + '   BEST STREAK ' + run.bestStreak;
    if (run.mode === 'endless') lines += '\nHALLS CLEARED ' + run.halls + '   BEST ' + profile.endlessBest;
    if (run.mode === 'rush') lines += '\nLADDER ' + rushLadder(run.stage).name + '   PATTERNS ' + run.rushIndex + '/' + rushLadder(run.stage).patterns.length;
    if (run.mode === 'tour') lines += '\nTOUR ' + clearedCount(profile) + '/' + TOUR.length + '   SOUVENIRS ' + souvenirCount(profile) + '/' + SOUVENIRS.length;
    visible(ui.note, true);
    ui.note.setPosition(W / 2, 396);
    setTextIfChanged(ui.note, lines, C.slate);
    if (hasSouvenir) {
      var slot = ui.slots[run.souvenir];
      visible(slot.img, true); visible(slot.name, true);
      slot.img.setDepth(12); slot.name.setDepth(12);
      slot.img.setPosition(W / 2, 540).setDisplaySize(84, 84);
      setTextureIfChanged(slot.img, 'lb-sv-' + run.souvenir);
      slot.img.setAlpha(1);
      slot.name.setPosition(W / 2, 598);
      setTextIfChanged(slot.name, 'SOUVENIR  ' + SOUVENIRS[run.souvenir].name, city.glow);
    }
    var nextLabel = won && run.mode === 'tour' && run.stage + 1 < TOUR.length ? 'NEXT STOP'
      : won && run.mode === 'rush' && run.stage + 1 < RUSH.length ? 'RUSH MENU'
      : run.mode === 'tour' ? 'TOUR MAP' : null;
    if (nextLabel) {
      this.footBtn(0, 3, nextLabel, accent, this.advanceResult.bind(this), btnY);
      this.footBtn(1, 3, 'RETRY', C.jade, this.restartCurrent.bind(this), btnY);
      this.footBtn(2, 3, 'MENU', C.slate, (function () { sfx('back', 0.6); this.setScreen('menu'); }).bind(this), btnY);
    } else {
      this.footBtn(0, 2, 'RETRY', C.jade, this.restartCurrent.bind(this), btnY);
      this.footBtn(1, 2, 'MENU', accent, (function () { sfx('back', 0.6); this.setScreen('menu'); }).bind(this), btnY);
    }
  };

  PlayScene.prototype.render = function () {
    this.hideAll();
    if (this.screen === 'play') this.renderPlay();
    else if (this.screen === 'result') { this.renderPlay(true); this.renderResult(); }
    else if (this.screen === 'pause') { this.renderPlay(true); this.renderPause(); }
    else if (this.screen === 'tour') this.renderTour();
    else if (this.screen === 'rush') this.renderRush();
    else if (this.screen === 'case') this.renderCase();
    else this.renderMenu();
    this.renderParticles();
    if (this.screen !== 'pause') this.renderTransients();
  };

  // -------------------------------------------------------------------- boot
  if (!Phaser || !kit) {
    root.__lb.state = bootState;
    return;
  }
  Game.phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: C.deep,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance', batchSize: 2048 },
    fps: { target: 60, min: 30 },
    scene: [PlayScene]
  });
  Game.phaser.events.once('ready', function () {
    Game.play = Game.phaser.scene.getScene('lantern-bingo');
    syncProbe();
  });
  root.__LB_READY = true;
})(typeof window !== 'undefined' ? window : globalThis);
