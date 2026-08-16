/* Orbit Hearts, fleet F14. Phaser 3 render shell with GGKit owned save, audio,
 * input identity, lifecycle and juice. Original IP, procedural art and audio.
 * Part 1 of 4: constants, helpers, save model, kit wiring, texture bakery. */
(function (root) {
  'use strict';

  var Phaser = root.Phaser;
  var D = root.OH_STORY;
  var W = 390;
  var H = 844;
  var STEP = 1 / 60;
  var MAX_STEPS = 4;
  var FONT = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif';
  var SAVE_VERSION = 4;
  var REDUCED = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* Preserved prototype rhythm constants. TRAVEL is the marker flight time at
   * difficulty two, TR the beat line coordinate, WIN and PERF the hit windows
   * on the prototype's 104 unit travel scale. */
  var TRAVEL = 1.15;
  var TR = 46;
  var WIN = 26;
  var PERF = 10;
  var BEAT_SCALE = 1.6;

  var C = {
    ink: '#f2f0ff', muted: '#a9b6d4', dim: '#7d8cae', deep: '#080b18',
    panel: '#101a2e', panel2: '#182742', line: '#2c3f62',
    rose: '#ff8fb8', gold: '#ffd67a', cyan: '#7fd4ff', mint: '#9ff2a8',
    amber: '#ffb27f', violet: '#cbb2ff', white: '#ffffff', red: '#ff7d86'
  };

  var EXPR = ['neutral', 'warm', 'wry', 'hurt', 'resolve', 'surprise'];
  var MAIN = ['rell', 'ivane', 'cass'];
  var MINOR = ['nel', 'aud', 'chief'];
  var SPEEDS = [22, 38, 64];
  var SPEED_NAMES = ['Gentle', 'Normal', 'Quick'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return Number.isFinite(v) ? v : d; }
  function whole(v, d) { return Number.isInteger(v) ? v : d; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function tint(hex) { return parseInt(String(hex).replace('#', ''), 16) || 0; }
  function easeBack(t) { var c = 1.70158; return 1 + c * Math.pow(t - 1, 3) + (c + 0.3) * Math.pow(t - 1, 2); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function rgb(hex) {
    var n = tint(hex);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return ((Math.round(lerp(x.r, y.r, t)) << 16) | (Math.round(lerp(x.g, y.g, t)) << 8) |
      Math.round(lerp(x.b, y.b, t)));
  }
  function mixHex(a, b, t) {
    var v = mix(a, b, t).toString(16);
    while (v.length < 6) v = '0' + v;
    return '#' + v;
  }
  function hashCode(s) {
    var h = 2166136261, i;
    s = String(s);
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  function rnd(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function setTextIfChanged(node, value, colorValue) {
    if (!node) return;
    var next = String(value);
    if (node.text !== next) node.setText(next);
    if (colorValue && node._ohColor !== colorValue) { node.setColor(colorValue); node._ohColor = colorValue; }
  }
  function setFillIfChanged(node, value, alpha) {
    if (!node) return;
    var next = typeof value === 'number' ? value : tint(value);
    if (node._ohFill !== next || (alpha != null && node._ohAlpha !== alpha)) {
      node.setFillStyle(next, alpha == null ? 1 : alpha);
      node._ohFill = next; node._ohAlpha = alpha == null ? 1 : alpha;
    }
  }
  function setStrokeIfChanged(node, value, width, alpha) {
    if (!node) return;
    var next = typeof value === 'number' ? value : tint(value);
    if (node._ohStroke !== next || node._ohStrokeW !== width) {
      node.setStrokeStyle(width || 1, next, alpha == null ? 1 : alpha);
      node._ohStroke = next; node._ohStrokeW = width;
    }
  }
  function setTextureIfChanged(node, key) {
    if (node && node._ohTex !== key && key) { node.setTexture(key); node._ohTex = key; }
  }
  function visible(node, value) { if (node && node.visible !== value) node.setVisible(value); }
  function alphaOf(node, value) { if (node && Math.abs(node.alpha - value) > 0.004) node.setAlpha(value); }

  /* ---------------------------------------------------------------- content */
  var SCENES = D.SCENES;
  var ROUTES = D.ROUTES;
  var ENDINGS = D.ENDINGS;
  var LOCALES = D.LOCALES;
  var CHARS = D.CHARS;

  function sceneOf(id) { return SCENES[id] || null; }
  function routeOf(id) {
    for (var i = 0; i < ROUTES.length; i++) if (ROUTES[i].id === id) return ROUTES[i];
    return null;
  }
  function localeOf(id) { return LOCALES[id] || LOCALES.core; }
  function charOf(id) { return CHARS[id] || null; }

  /* Ordered scene list per route, for progress reporting and the gallery. */
  var ROUTE_ORDER = {};
  var CG_LIST = [];
  var MEM_LIST = [];
  (function () {
    var ids = Object.keys(SCENES), i, s;
    for (i = 0; i < ids.length; i++) {
      s = SCENES[ids[i]];
      var key = s.r || 'prologue';
      if (!ROUTE_ORDER[key]) ROUTE_ORDER[key] = [];
      ROUTE_ORDER[key].push(s.id);
      if (s.cg) CG_LIST.push({ id: s.id, name: s.cgName || s.title, route: key, loc: s.loc, tod: s.tod });
      if (s.mem && MEM_LIST.every(function (m) { return m.id !== s.mem.id; })) {
        MEM_LIST.push({ id: s.mem.id, name: s.mem.name, text: s.mem.text, route: key });
      }
    }
  })();
  function memsOfRoute(rid) {
    var out = [], i;
    for (i = 0; i < MEM_LIST.length; i++) if (MEM_LIST[i].route === rid) out.push(MEM_LIST[i]);
    return out;
  }

  /* ------------------------------------------------------------------ save */
  function defaultProfile() {
    return {
      v: SAVE_VERSION, endings: {}, mems: {}, gallery: {}, seen: {}, best: {},
      runs: 0, slots: [null, null, null], auto: null, tutorial: false,
      prefs: { speed: 1, auto: false, timers: true, autoDelay: 1 }
    };
  }
  function validSnapshot(s) {
    if (!s || typeof s !== 'object') return false;
    if (!routeOf(s.rid)) return false;
    if (!sceneOf(s.sid)) return false;
    if (!Number.isInteger(s.li) || s.li < 0 || s.li > 64) return false;
    if (!Number.isFinite(s.aff) || s.aff < 0 || s.aff > 400) return false;
    if (!s.flags || typeof s.flags !== 'object') return false;
    if (!s.mems || typeof s.mems !== 'object') return false;
    return true;
  }
  function validProfile(v) {
    if (!v || typeof v !== 'object' || v.v !== SAVE_VERSION) return false;
    if (!v.endings || !v.mems || !v.gallery || !v.seen || !v.best) return false;
    if (typeof v.endings !== 'object' || typeof v.mems !== 'object') return false;
    if (!Array.isArray(v.slots) || v.slots.length !== 3) return false;
    if (!v.prefs || typeof v.prefs !== 'object') return false;
    if (!Number.isInteger(v.prefs.speed) || v.prefs.speed < 0 || v.prefs.speed > 2) return false;
    if (Object.keys(v.seen).length > 4000) return false;
    var i;
    for (i = 0; i < 3; i++) if (v.slots[i] !== null && !validSnapshot(v.slots[i])) return false;
    if (v.auto !== null && v.auto !== undefined && !validSnapshot(v.auto)) return false;
    return true;
  }
  function endingById(id) {
    var k, i;
    for (k in ENDINGS) for (i = 0; i < ENDINGS[k].length; i++) if (ENDINGS[k][i].id === id) return ENDINGS[k][i];
    return null;
  }

  /* -------------------------------------------------------- verification hook */
  var bootState = {
    mode: 'boot', stage: D.PROLOGUE, route: null, chapter: 0, progress: 0,
    score: 0, health: 0, memories: 0, endings: 0, phase: 'boot'
  };
  var hook = root.__oh && typeof root.__oh === 'object' ? root.__oh : {};
  if (!hook.state || typeof hook.state !== 'object') hook.state = bootState;
  if (!Object.prototype.hasOwnProperty.call(hook, 'forceMode')) hook.forceMode = null;
  if (!Object.prototype.hasOwnProperty.call(hook, 'forceStage')) hook.forceStage = null;
  root.__oh = hook;

  var Game = { phaser: null, play: null };
  var profile;
  var keyEdges = Object.create(null);

  var kit = root.GGKit ? root.GGKit.create({
    slug: 'orbit-hearts', orientation: 'portrait', validateSave: validProfile,
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

  var MUSIC = { drift: 'music-drift', station: 'music-station', orbit: 'music-orbit' };
  if (kit) kit.audio.register({
    'music-drift': 'assets/music-drift.mp3',
    'music-station': 'assets/music-station.mp3',
    'music-orbit': 'assets/music-orbit.mp3',
    tap: 'assets/sfx-tap.mp3', type: 'assets/sfx-type.mp3', choose: 'assets/sfx-choose.mp3',
    heart: 'assets/sfx-heart.mp3', memory: 'assets/sfx-memory.mp3', perfect: 'assets/sfx-perfect.mp3',
    good: 'assets/sfx-good.mp3', miss: 'assets/sfx-miss.mp3', lock: 'assets/sfx-lock.mp3',
    thrust: 'assets/sfx-thrust.mp3', page: 'assets/sfx-page.mp3', chapter: 'assets/sfx-chapter.mp3',
    ending: 'assets/sfx-ending.mp3', ui: 'assets/sfx-ui.mp3', deny: 'assets/sfx-deny.mp3'
  });
  var SFX_KEYS = ['tap', 'type', 'choose', 'heart', 'memory', 'perfect', 'good', 'miss',
    'lock', 'thrust', 'page', 'chapter', 'ending', 'ui', 'deny'];

  function persist() { if (kit) kit.save.set(profile); }
  function sfx(name, volume, rate) {
    if (kit) kit.audio.sfx(name, { volume: volume == null ? 0.85 : volume, rate: rate || 1 });
  }
  var musicOn = false;
  function music(name, fade) {
    if (!kit) return;
    musicOn = true;
    kit.audio.music(name, fade == null ? 900 : fade);
  }

  /* ==================================================================== bakery
   * Every frame of shipped art is composed here once, into canvas textures, so
   * that no Graphics command list is replayed during play. */

  function bakeGradient(g, w, h, stops, bands) {
    var i, t, a, b, seg;
    bands = bands || 26;
    for (i = 0; i < bands; i++) {
      t = i / (bands - 1);
      seg = t * (stops.length - 1);
      a = stops[Math.min(stops.length - 1, Math.floor(seg))];
      b = stops[Math.min(stops.length - 1, Math.floor(seg) + 1)];
      g.fillStyle(mix(a, b, seg - Math.floor(seg)), 1);
      g.fillRect(0, Math.floor(i * h / bands), w, Math.ceil(h / bands) + 1);
    }
  }
  function bakeStars(g, w, h, count, seed, colorA, colorB) {
    var r = rnd(seed), i, x, y, s;
    for (i = 0; i < count; i++) {
      x = r() * w; y = r() * h; s = 0.5 + r() * 1.5;
      g.fillStyle(mix(colorA, colorB, r()), 0.35 + r() * 0.65);
      g.fillCircle(x, y, s);
    }
  }

  function drawFar(g, loc, w, h) {
    var kind = loc.kind;
    bakeGradient(g, w, h, loc.sky, 30);
    var r = rnd(hashCode(kind + 'far'));
    if (kind === 'obs' || kind === 'orbit') {
      bakeStars(g, w, h, kind === 'orbit' ? 190 : 120, hashCode(kind), '#ffffff', loc.glow);
      g.fillStyle(tint(loc.glow), 0.1);
      g.fillCircle(w * 0.7, h * 0.26, w * 0.42);
      g.fillStyle(tint(loc.accent), 0.09);
      g.fillCircle(w * 0.28, h * 0.62, w * 0.34);
      if (kind === 'orbit') {
        g.fillStyle(mix(loc.glow, '#ffffff', 0.35), 0.16);
        g.fillEllipse(w * 0.5, h * 1.12, w * 1.7, h * 0.7);
        g.fillStyle(tint('#ffffff'), 0.09);
        g.fillEllipse(w * 0.5, h * 1.16, w * 1.5, h * 0.6);
      }
    } else if (kind === 'green') {
      var row;
      for (row = 0; row < 7; row++) {
        var y = 26 + row * (h - 40) / 7;
        g.fillStyle(mix(loc.glow, '#ffffff', 0.4), 0.16 + (row % 2) * 0.06);
        g.fillRect(0, y, w, 3);
        g.fillStyle(tint(loc.glow), 0.05);
        g.fillRect(0, y + 3, w, 14);
      }
      g.fillStyle(tint(loc.accent), 0.07);
      g.fillCircle(w * 0.5, h * 0.4, w * 0.5);
    } else if (kind === 'dock') {
      g.fillStyle(tint(loc.glow), 0.12);
      g.fillCircle(w * 0.5, h * 0.55, w * 0.55);
      for (var b = 0; b < 9; b++) {
        g.fillStyle(mix(loc.accent, '#ffffff', 0.2), 0.13);
        g.fillRect(0, 20 + b * (h - 30) / 9, w, 1.5);
      }
      bakeStars(g, w, h * 0.5, 40, hashCode('dockstars'), '#ffffff', loc.accent);
    } else if (kind === 'ring') {
      bakeStars(g, w, h, 70, hashCode('ringstars'), '#ffffff', loc.glow);
      g.fillStyle(tint(loc.glow), 0.08);
      g.fillCircle(w * 0.18, h * 0.2, w * 0.4);
      for (var q = 0; q < 5; q++) {
        g.fillStyle(mix(loc.struct2, loc.glow, 0.25), 0.5 - q * 0.07);
        g.fillRect(0, h * 0.55 + q * 16, w, 7);
      }
    } else {
      for (var k = 0; k < 12; k++) {
        var yy = 10 + k * (h - 20) / 12;
        g.fillStyle(mix(loc.struct2, loc.glow, 0.18), 0.5);
        g.fillRect(6 + (k % 3) * 5, yy, w - 20, 9);
        g.fillStyle(tint(loc.glow), 0.22 + (k % 4) * 0.06);
        g.fillRect(w - 26 - (k % 5) * 7, yy + 2, 5, 5);
      }
      g.fillStyle(tint(loc.glow), 0.07);
      g.fillCircle(w * 0.5, h * 0.35, w * 0.45);
    }
    var i;
    for (i = 0; i < 3; i++) { g.fillStyle(tint('#000000'), 0.06); g.fillRect(0, h - 26 + i * 9, w, 9); }
  }

  function drawMid(g, loc, w, h) {
    var kind = loc.kind, i, x;
    if (kind === 'obs') {
      g.fillStyle(tint(loc.struct), 0.95);
      g.fillRect(0, 0, w, 16); g.fillRect(0, h - 40, w, 40);
      for (i = 0; i < 5; i++) {
        x = 6 + i * (w - 12) / 4;
        g.fillStyle(tint(loc.struct2), 0.92); g.fillRect(x - 4, 0, 8, h - 34);
        g.fillStyle(mix(loc.glow, '#ffffff', 0.3), 0.2); g.fillRect(x - 4, 0, 2, h - 34);
      }
      g.fillStyle(tint(loc.struct), 0.9); g.fillRect(0, h * 0.52, w, 7);
      g.fillStyle(tint(loc.accent), 0.28); g.fillRect(0, h * 0.52, w, 2);
    } else if (kind === 'ring') {
      for (i = 0; i < 6; i++) {
        x = 4 + i * (w - 8) / 5;
        g.fillStyle(tint(loc.struct), 0.94);
        g.fillRect(x - 7, 0, 14, h);
        g.fillStyle(mix(loc.struct2, loc.glow, 0.3), 0.7);
        g.fillRect(x - 7, 0, 3, h);
      }
      for (i = 0; i < 5; i++) {
        var yy = 24 + i * (h - 50) / 5;
        g.fillStyle(tint(loc.struct2), 0.85);
        g.fillRect(0, yy, w, 6);
        g.fillStyle(tint(loc.accent), 0.4);
        g.fillCircle(18 + (i % 3) * 52, yy + 3, 3.2);
      }
    } else if (kind === 'green') {
      var r = rnd(hashCode('greenmid'));
      for (i = 0; i < 5; i++) {
        var by = 34 + i * (h - 56) / 5;
        g.fillStyle(tint(loc.struct), 0.9);
        g.fillRect(4, by, w - 8, 15);
        g.fillStyle(mix(loc.glow, '#ffffff', 0.5), 0.5);
        g.fillRect(4, by - 3, w - 8, 2.5);
        for (var p = 0; p < 7; p++) {
          var px = 12 + p * (w - 26) / 6;
          g.fillStyle(mix(loc.glow, '#0a2a18', 0.35 + r() * 0.4), 0.95);
          g.fillEllipse(px, by - 7, 12 + r() * 7, 12 + r() * 6);
          g.fillStyle(mix(loc.accent, loc.glow, r()), 0.7);
          g.fillCircle(px + 2, by - 10, 2.2);
        }
      }
    } else if (kind === 'dock') {
      g.fillStyle(tint(loc.struct), 0.95);
      g.fillRect(0, h * 0.24, w, h * 0.5);
      g.fillStyle(tint(loc.struct2), 0.95);
      g.fillTriangle(0, h * 0.24, w * 0.62, h * 0.24, w * 0.2, h * 0.06);
      g.fillTriangle(0, h * 0.74, w * 0.62, h * 0.74, w * 0.2, h * 0.92);
      g.fillStyle(mix(loc.accent, '#ffffff', 0.25), 0.75);
      for (i = 0; i < 4; i++) g.fillCircle(w * 0.16 + i * 26, h * 0.42, 5);
      g.fillStyle(tint(loc.glow), 0.5);
      g.fillRect(w * 0.62, h * 0.3, 9, h * 0.38);
      g.fillStyle(mix(loc.glow, '#ffffff', 0.5), 0.9);
      g.fillRect(w * 0.62, h * 0.3, 3, h * 0.38);
    } else if (kind === 'orbit') {
      g.fillStyle(tint(loc.struct2), 0.9);
      g.fillEllipse(w * 0.5, h * 0.46, w * 0.86, h * 0.3);
      g.fillStyle(tint(loc.sky[0]), 1);
      g.fillEllipse(w * 0.5, h * 0.46, w * 0.66, h * 0.2);
      g.fillStyle(tint(loc.struct), 0.95);
      g.fillTriangle(w * 0.47, h * 0.24, w * 0.53, h * 0.24, w * 0.5, h * 0.62);
      g.fillStyle(mix(loc.struct2, loc.glow, 0.3), 0.7);
      g.fillRect(w * 0.495, h * 0.26, w * 0.012, h * 0.3);
      g.fillStyle(mix(loc.glow, '#ffffff', 0.4), 0.55);
      for (i = 0; i < 12; i++) {
        var a = i / 12 * Math.PI * 2;
        g.fillCircle(w * 0.5 + Math.cos(a) * w * 0.37, h * 0.46 + Math.sin(a) * h * 0.13, 2.4);
      }
    } else {
      g.fillStyle(tint(loc.struct), 0.96);
      g.fillRoundedRect(w * 0.16, h * 0.1, w * 0.68, h * 0.72, w * 0.3);
      g.fillStyle(tint(loc.sky[0]), 1);
      g.fillRoundedRect(w * 0.24, h * 0.18, w * 0.52, h * 0.7, w * 0.24);
      g.fillStyle(tint(loc.glow), 0.14);
      g.fillRoundedRect(w * 0.28, h * 0.22, w * 0.44, h * 0.62, w * 0.2);
      for (i = 0; i < 2; i++) {
        x = i === 0 ? w * 0.07 : w * 0.93;
        g.fillStyle(tint(loc.struct), 0.94);
        g.fillRoundedRect(x - w * 0.09, h * 0.06, w * 0.18, h * 0.86, 6);
        for (var s2 = 0; s2 < 10; s2++) {
          g.fillStyle(mix(loc.glow, loc.accent, (i + s2) % 3 / 2), 0.45);
          g.fillRect(x - w * 0.06, h * 0.1 + s2 * h * 0.078, w * 0.12, 3);
        }
      }
      g.fillStyle(tint(loc.accent), 0.5);
      g.fillRect(w * 0.3, h * 0.16, w * 0.4, 2);
      g.fillStyle(tint('#000000'), 0.34);
      g.fillRect(0, h - 60, w, 60);
    }
  }

  function drawNear(g, loc, w, h) {
    var kind = loc.kind, i;
    g.fillStyle(tint(loc.floor), 1);
    g.fillRect(0, h - 46, w, 46);
    g.fillStyle(mix(loc.floor, loc.glow, 0.24), 0.9);
    g.fillRect(0, h - 48, w, 3);
    if (kind === 'obs' || kind === 'orbit') {
      g.fillStyle(tint(loc.struct), 0.98);
      g.fillRect(0, h - 78, w, 8);
      for (i = 0; i < 9; i++) g.fillRect(14 + i * (w - 28) / 8 - 3, h - 74, 6, 30);
      g.fillStyle(tint(loc.accent), 0.5);
      g.fillRect(0, h - 78, w, 2);
    } else if (kind === 'green') {
      g.fillStyle(tint(loc.struct), 0.96);
      g.fillRoundedRect(-10, h - 92, w + 20, 48, 8);
      for (i = 0; i < 8; i++) {
        g.fillStyle(mix(loc.glow, '#08160f', 0.2 + (i % 3) * 0.16), 0.98);
        g.fillEllipse(20 + i * (w - 30) / 7, h - 92, 34, 22);
      }
    } else if (kind === 'dock') {
      g.fillStyle(tint(loc.struct2), 0.98);
      g.fillRect(0, h - 84, w, 40);
      g.fillStyle(tint(loc.accent), 0.35);
      for (i = 0; i < 6; i++) g.fillRect(10 + i * (w - 20) / 5, h - 80, 26, 4);
    } else if (kind === 'ring') {
      g.fillStyle(tint(loc.struct2), 0.98);
      g.fillRect(0, h - 84, w, 40);
      for (i = 0; i < 11; i++) {
        g.fillStyle(mix(loc.struct, loc.accent, i % 2 ? 0.12 : 0.03), 1);
        g.fillRect(i * w / 11, h - 84, w / 11 - 4, 40);
      }
      g.fillStyle(tint(loc.accent), 0.5);
      for (i = 0; i < 5; i++) g.fillCircle(38 + i * (w - 76) / 4, h - 66, 3);
    } else {
      g.fillStyle(tint(loc.struct2), 0.98);
      g.fillRoundedRect(-12, h - 96, w + 24, 54, 10);
      g.fillStyle(tint(loc.glow), 0.32);
      g.fillRect(20, h - 88, w - 40, 3);
      for (i = 0; i < 5; i++) {
        g.fillStyle(mix(loc.glow, loc.accent, i / 4), 0.6);
        g.fillCircle(38 + i * (w - 76) / 4, h - 72, 4);
      }
    }
    g.fillStyle(tint('#000000'), 0.22);
    g.fillRect(0, h - 12, w, 12);
  }

  /* --------------------------------------------------------------- portraits */
  function drawPortrait(g, ch, expr, w, h) {
    var cx = w * 0.5;
    var headY = h * 0.34;
    var headR = w * 0.23;
    var warm = expr === 'warm', hurt = expr === 'hurt', wry = expr === 'wry';
    var res = expr === 'resolve', sur = expr === 'surprise';

    /* shoulders and torso */
    g.fillStyle(mix(ch.cloth, '#000000', 0.45), 1);
    g.fillRoundedRect(cx - w * 0.42, h * 0.62, w * 0.84, h * 0.44, w * 0.13);
    g.fillStyle(tint(ch.cloth), 1);
    g.fillRoundedRect(cx - w * 0.38, h * 0.64, w * 0.76, h * 0.42, w * 0.12);
    g.fillStyle(mix(ch.cloth, '#ffffff', 0.16), 1);
    g.fillRoundedRect(cx - w * 0.34, h * 0.66, w * 0.3, h * 0.4, w * 0.1);
    g.fillStyle(tint(ch.trim), 0.85);
    g.fillRect(cx - w * 0.3, h * 0.7, w * 0.16, 4);
    g.fillRect(cx - w * 0.3, h * 0.76, w * 0.1, 3);

    /* neck */
    g.fillStyle(mix(ch.skin, '#000000', 0.24), 1);
    g.fillRoundedRect(cx - w * 0.09, headY + headR * 0.5, w * 0.18, h * 0.16, 6);

    /* head */
    g.fillStyle(tint(ch.skin), 1);
    g.fillEllipse(cx, headY, headR * 2, headR * 2.3);
    g.fillStyle(mix(ch.skin, '#ffffff', 0.16), 1);
    g.fillEllipse(cx - headR * 0.3, headY - headR * 0.24, headR * 0.9, headR * 1.05);

    /* hair, shaped by character */
    g.fillStyle(tint(ch.hair), 1);
    if (ch.shape === 'hex') {
      g.fillEllipse(cx, headY - headR * 0.86, headR * 2.16, headR * 1.16);
      g.fillRect(cx - headR * 1.08, headY - headR * 0.72, headR * 0.34, headR * 1.5);
      g.fillRect(cx + headR * 0.74, headY - headR * 0.72, headR * 0.34, headR * 1.2);
    } else if (ch.shape === 'leaf') {
      g.fillEllipse(cx, headY - headR * 0.8, headR * 2.2, headR * 1.35);
      g.fillEllipse(cx - headR * 0.95, headY + headR * 0.2, headR * 0.6, headR * 1.5);
      g.fillEllipse(cx + headR * 0.95, headY + headR * 0.2, headR * 0.6, headR * 1.5);
      g.fillStyle(tint(ch.color), 0.9);
      g.fillEllipse(cx + headR * 0.86, headY - headR * 0.86, headR * 0.5, headR * 0.28);
    } else {
      g.fillEllipse(cx, headY - headR * 0.84, headR * 2.1, headR * 1.2);
      g.fillTriangle(cx - headR * 1.05, headY - headR * 0.9, cx + headR * 0.2, headY - headR * 1.15,
        cx - headR * 0.2, headY + headR * 0.5);
      g.fillStyle(tint(ch.hair), 1);
      g.fillRect(cx + headR * 0.6, headY - headR * 0.9, headR * 0.42, headR * 1.6);
    }

    /* eyes */
    var eyeY = headY + headR * 0.16 + (sur ? -1 : 2);
    var eyeW = headR * 0.46, eyeH = headR * (hurt ? 0.24 : sur ? 0.42 : wry ? 0.26 : 0.33);
    var ex = headR * 0.46;
    g.fillStyle(tint('#f6f8ff'), 1);
    g.fillEllipse(cx - ex, eyeY, eyeW, eyeH * 2);
    g.fillEllipse(cx + ex, eyeY, eyeW, eyeH * 2);
    g.fillStyle(mix(ch.color, '#0a0d18', 0.4), 1);
    var look = wry ? headR * 0.1 : 0;
    g.fillCircle(cx - ex + look, eyeY + (hurt ? 1 : 0), eyeH * 0.85);
    g.fillCircle(cx + ex + look, eyeY + (hurt ? 1 : 0), eyeH * 0.85);
    g.fillStyle(tint('#ffffff'), 0.92);
    g.fillCircle(cx - ex + look - eyeH * 0.3, eyeY - eyeH * 0.34, eyeH * 0.26);
    g.fillCircle(cx + ex + look - eyeH * 0.3, eyeY - eyeH * 0.34, eyeH * 0.26);

    /* brows */
    g.fillStyle(mix(ch.hair, '#000000', 0.15), 1);
    var browY = eyeY - headR * (sur ? 0.42 : 0.34);
    var tiltL = hurt ? 0.28 : res ? -0.22 : wry ? -0.3 : warm ? -0.08 : 0;
    var tiltR = hurt ? -0.28 : res ? 0.22 : wry ? 0.06 : warm ? 0.08 : 0;
    g.save(); g.translateCanvas(cx - ex, browY); g.rotateCanvas(tiltL);
    g.fillRoundedRect(-headR * 0.3, -2.5, headR * 0.6, 5, 2.5); g.restore();
    g.save(); g.translateCanvas(cx + ex, browY); g.rotateCanvas(tiltR);
    g.fillRoundedRect(-headR * 0.3, -2.5, headR * 0.6, 5, 2.5); g.restore();

    /* mouth */
    g.fillStyle(mix(ch.skin, '#5a2430', 0.55), 1);
    var my = headY + headR * 0.86;
    if (warm) { g.fillEllipse(cx, my, headR * 0.62, headR * 0.34); g.fillStyle(tint('#ffffff'), 0.75); g.fillRect(cx - headR * 0.26, my - headR * 0.1, headR * 0.52, 3); }
    else if (sur) g.fillEllipse(cx, my, headR * 0.3, headR * 0.4);
    else if (hurt) { g.save(); g.translateCanvas(cx, my); g.rotateCanvas(0.14); g.fillRoundedRect(-headR * 0.26, -2, headR * 0.52, 4, 2); g.restore(); }
    else if (wry) { g.save(); g.translateCanvas(cx, my); g.rotateCanvas(-0.2); g.fillRoundedRect(-headR * 0.3, -2, headR * 0.56, 4.5, 2); g.restore(); }
    else g.fillRoundedRect(cx - headR * 0.24, my - 2, headR * 0.48, 4.5, 2);

    /* blush for warm, shade for hurt */
    /* nose hint */
    g.fillStyle(mix(ch.skin, '#000000', 0.22), 0.7);
    g.fillEllipse(cx + headR * 0.02, headY + headR * 0.55, headR * 0.16, headR * 0.12);
    if (warm) {
      g.fillStyle(tint('#ff8fb8'), 0.3);
      g.fillEllipse(cx - headR * 0.78, headY + headR * 0.5, headR * 0.5, headR * 0.26);
      g.fillEllipse(cx + headR * 0.78, headY + headR * 0.5, headR * 0.5, headR * 0.26);
    }
    if (hurt) {
      g.fillStyle(tint('#4a6ea8'), 0.16);
      g.fillEllipse(cx, headY + headR * 0.2, headR * 2, headR * 1.4);
    }

    /* role props */
    if (ch.shape === 'hex') {
      g.fillStyle(mix(ch.trim, '#000000', 0.35), 1);
      g.fillRoundedRect(cx - headR * 1.08, headY - headR * 1.12, headR * 2.16, headR * 0.26, 5);
      g.fillStyle(mix(ch.color, '#0a1220', 0.45), 1);
      g.fillCircle(cx - headR * 0.62, headY - headR * 1.0, headR * 0.22);
      g.fillCircle(cx + headR * 0.62, headY - headR * 1.0, headR * 0.22);
      g.fillStyle(tint('#ffffff'), 0.35);
      g.fillCircle(cx - headR * 0.68, headY - headR * 1.06, headR * 0.08);
    } else if (ch.shape === 'wing') {
      g.fillStyle(mix(ch.trim, '#000000', 0.1), 1);
      g.fillRoundedRect(cx - w * 0.3, h * 0.66, w * 0.6, 9, 4);
      g.fillStyle(tint(ch.color), 0.9);
      g.fillTriangle(cx - w * 0.24, h * 0.72, cx - w * 0.06, h * 0.72, cx - w * 0.15, h * 0.79);
    } else {
      g.fillStyle(tint(ch.color), 0.9);
      g.fillEllipse(cx - w * 0.27, h * 0.72, 16, 9);
      g.fillEllipse(cx - w * 0.21, h * 0.76, 14, 8);
    }

    /* rim light in the character accent */
    g.fillStyle(tint(ch.color), 0.2);
    g.fillRect(cx + w * 0.3, h * 0.62, 4, h * 0.44);
    g.fillStyle(tint(ch.color), 0.3);
    g.fillEllipse(cx + headR * 0.95, headY, 5, headR * 1.5);
  }

  /* ================================================================== scene */
  function PlayScene() {
    Phaser.Scene.call(this, { key: 'orbit-hearts' });
    this.screen = 'boot';
    this.returnScreen = 'title';
    this.accumulator = 0;
    this.visualTime = 0;
    this.pointerSeen = new Map();
    this.pointerEdges = [];
    this.hitZones = [];
    this.buildQueue = [];
    this.buildTotal = 1;
    this.audioReady = false;
    this.loaded = false;
    this.st = null;
    this.lines = [];
    this.phase = 'text';
    this.mg = null;
    this.backlog = [];
    this.logTop = 0;
    this.galleryTab = 0;
    this.galleryPick = -1;
    this.menuIndex = 0;
    this.chip = null;
    this.coach = '';
    this.coachTimer = 0;
    this.banner = null;
    this.ending = null;
    this.endPage = 0;
    this.auto = false;
    this.skip = false;
    this.autoTimer = 0;
    this.flash = 0;
    this.flashColor = C.white;
    this.hearts = []; this.sparks = []; this.motes = []; this.rings = [];
    this.portraitPop = 0;
    this.blink = 2.4;
    this.lastForceMode = null;
    this.lastForceStage = null;
    this.saveMode = 'save';
  }
  PlayScene.prototype = Object.create(Phaser.Scene.prototype);
  PlayScene.prototype.constructor = PlayScene;

  PlayScene.prototype.createTexture = function (key, width, height, draw) {
    if (this.textures.exists(key)) return key;
    var g = this.make.graphics({ x: 0, y: 0, add: false });
    draw(g);
    g.generateTexture(key, width, height);
    g.destroy();
    return key;
  };

  PlayScene.prototype.queueTextures = function () {
    var self = this, k, i, j;
    var q = this.buildQueue;
    Object.keys(LOCALES).forEach(function (id) {
      q.push(function () {
        var loc = LOCALES[id];
        self.createTexture('oh-far-' + id, 260, 400, function (g) { drawFar(g, loc, 260, 400); });
        self.createTexture('oh-mid-' + id, 260, 400, function (g) { drawMid(g, loc, 260, 400); });
        self.createTexture('oh-near-' + id, 390, 190, function (g) { drawNear(g, loc, 390, 190); });
      });
    });
    MAIN.forEach(function (cid) {
      EXPR.forEach(function (ex) {
        q.push(function () {
          self.createTexture('oh-por-' + cid + '-' + ex, 200, 280, function (g) {
            drawPortrait(g, CHARS[cid], ex, 200, 280);
          });
        });
      });
    });
    MINOR.forEach(function (cid) {
      ['neutral', 'wry', 'warm', 'surprise'].forEach(function (ex) {
        q.push(function () {
          self.createTexture('oh-por-' + cid + '-' + ex, 200, 280, function (g) {
            drawPortrait(g, CHARS[cid], ex, 200, 280);
          });
        });
      });
    });
    q.push(function () { self.makeUiTextures(); });
    q.push(function () { self.makePlayTextures(); });
    this.buildTotal = q.length + 1;
  };

  PlayScene.prototype.makeUiTextures = function () {
    var self = this;
    function heart(g, cx, cy, s, color, alpha) {
      g.fillStyle(tint(color), alpha == null ? 1 : alpha);
      g.fillCircle(cx - s * 0.42, cy - s * 0.28, s * 0.5);
      g.fillCircle(cx + s * 0.42, cy - s * 0.28, s * 0.5);
      g.fillTriangle(cx - s * 0.9, cy - s * 0.06, cx + s * 0.9, cy - s * 0.06, cx, cy + s);
    }
    this.heartShape = heart;
    this.createTexture('oh-heart', 26, 26, function (g) { heart(g, 13, 11, 9, '#ffffff'); });
    this.createTexture('oh-heart-rose', 30, 30, function (g) {
      heart(g, 15, 13, 11, '#ff8fb8'); heart(g, 15, 12, 6.5, '#ffd9e8');
    });
    this.createTexture('oh-spark', 18, 18, function (g) {
      g.fillStyle(tint('#ffffff'), 1);
      g.fillTriangle(9, 0, 11, 9, 7, 9); g.fillTriangle(9, 18, 11, 9, 7, 9);
      g.fillTriangle(0, 9, 9, 11, 9, 7); g.fillTriangle(18, 9, 9, 11, 9, 7);
      g.fillCircle(9, 9, 2.4);
    });
    this.createTexture('oh-mote', 10, 10, function (g) {
      g.fillStyle(tint('#ffffff'), 0.5); g.fillCircle(5, 5, 4.4);
      g.fillStyle(tint('#ffffff'), 1); g.fillCircle(5, 5, 2);
    });
    this.createTexture('oh-ring', 120, 120, function (g) {
      var i;
      for (i = 0; i < 3; i++) {
        g.lineStyle(6 - i * 1.5, tint('#ffffff'), 0.9 - i * 0.28);
        g.strokeCircle(60, 60, 40 + i * 7);
      }
    });
    this.createTexture('oh-panel', 366, 236, function (g) {
      g.fillStyle(tint('#050813'), 0.9); g.fillRoundedRect(0, 4, 366, 232, 20);
      g.fillStyle(tint(C.panel), 0.97); g.fillRoundedRect(0, 0, 366, 232, 20);
      g.fillStyle(tint(C.panel2), 0.75); g.fillRoundedRect(2, 2, 362, 60, 18);
      g.lineStyle(2, tint(C.line), 0.9); g.strokeRoundedRect(1, 1, 364, 230, 20);
      g.fillStyle(tint('#ffffff'), 0.05); g.fillRect(18, 8, 330, 1.5);
    });
    this.createTexture('oh-plate', 200, 40, function (g) {
      g.fillStyle(tint('#ffffff'), 1); g.fillRoundedRect(0, 0, 200, 40, 14);
    });
    this.createTexture('oh-btn', 120, 56, function (g) {
      g.fillStyle(tint(C.panel2), 1); g.fillRoundedRect(0, 0, 120, 56, 14);
      g.lineStyle(1.5, tint(C.line), 1); g.strokeRoundedRect(0.75, 0.75, 118.5, 54.5, 14);
    });
    this.createTexture('oh-btn-hot', 120, 56, function (g) {
      g.fillStyle(tint('#1d3050'), 1); g.fillRoundedRect(0, 0, 120, 56, 14);
      g.lineStyle(2, tint(C.rose), 1); g.strokeRoundedRect(1, 1, 118, 54, 14);
    });
    this.createTexture('oh-chip', 120, 40, function (g) {
      g.fillStyle(tint('#0c1424'), 0.96);
      g.fillRoundedRect(0, 0, 120, 40, 13);
      g.lineStyle(1.5, tint(C.line), 1); g.strokeRoundedRect(0.75, 0.75, 118.5, 38.5, 13);
    });
    this.createTexture('oh-star-on', 34, 34, function (g) {
      g.fillStyle(tint('#ffffff'), 0.22); g.fillCircle(17, 17, 15);
      g.fillStyle(tint('#ffe9a8'), 1);
      g.fillTriangle(17, 1, 20, 15, 14, 15); g.fillTriangle(17, 33, 20, 19, 14, 19);
      g.fillTriangle(1, 17, 15, 20, 15, 14); g.fillTriangle(33, 17, 19, 20, 19, 14);
      g.fillCircle(17, 17, 4.2);
    });
    this.createTexture('oh-star-off', 34, 34, function (g) {
      g.lineStyle(1.5, tint('#3d4a6a'), 1); g.strokeCircle(17, 17, 8);
      g.fillStyle(tint('#3d4a6a'), 1); g.fillCircle(17, 17, 2);
    });
    this.createTexture('oh-vig', 390, 580, function (g) {
      var i;
      for (i = 0; i < 16; i++) {
        g.fillStyle(tint('#000000'), 0.05);
        g.fillRect(0, 0, 390, 20 - i); g.fillRect(0, 560 + i, 390, 20 - i);
        g.fillRect(0, 0, 16 - i, 580); g.fillRect(374 + i, 0, 16 - i, 580);
      }
    });
    this.createTexture('oh-mem', 44, 44, function (g) {
      g.fillStyle(tint('#ffd67a'), 0.2); g.fillCircle(22, 22, 20);
      g.fillStyle(tint('#ffd67a'), 0.42); g.fillCircle(22, 22, 13);
      g.fillStyle(tint('#fff3d0'), 1);
      g.fillTriangle(22, 6, 26, 22, 18, 22); g.fillTriangle(22, 38, 26, 22, 18, 22);
      g.fillTriangle(6, 22, 22, 26, 22, 18); g.fillTriangle(38, 22, 22, 26, 22, 18);
    });
  };

  PlayScene.prototype.makePlayTextures = function () {
    var self = this, i;
    this.createTexture('oh-beat', 44, 96, function (g) {
      g.fillStyle(tint(C.rose), 0.28); g.fillRoundedRect(12, 0, 20, 96, 10);
      g.fillStyle(tint('#ffffff'), 1); g.fillRoundedRect(17, 4, 10, 88, 5);
      g.fillStyle(tint(C.rose), 1); g.fillRoundedRect(19, 8, 6, 80, 3);
    });
    this.createTexture('oh-target', 84, 116, function (g) {
      g.lineStyle(3, tint(C.gold), 0.95); g.strokeRoundedRect(1.5, 1.5, 81, 113, 16);
      g.fillStyle(tint(C.gold), 0.12); g.fillRoundedRect(3, 3, 78, 110, 15);
      g.fillStyle(tint(C.gold), 0.9); g.fillRect(40, 8, 4, 100);
    });
    this.createTexture('oh-track', 340, 12, function (g) {
      g.fillStyle(tint('#16233c'), 1); g.fillRoundedRect(0, 0, 340, 12, 6);
      g.fillStyle(tint(C.line), 0.9); g.fillRoundedRect(2, 2, 336, 3, 2);
    });
    this.createTexture('oh-node', 68, 68, function (g) {
      g.fillStyle(tint('#ffffff'), 0.1); g.fillCircle(34, 34, 30);
      g.lineStyle(3, tint('#ffffff'), 0.9); g.strokeCircle(34, 34, 22);
      g.fillStyle(tint('#ffffff'), 0.22); g.fillCircle(34, 34, 18);
    });
    this.createTexture('oh-node-on', 68, 68, function (g) {
      g.fillStyle(tint('#ffe9a8'), 0.24); g.fillCircle(34, 34, 30);
      g.lineStyle(4, tint('#ffe9a8'), 1); g.strokeCircle(34, 34, 22);
      g.fillStyle(tint('#fff6dd'), 0.95); g.fillCircle(34, 34, 15);
    });
    this.createTexture('oh-link', 12, 12, function (g) {
      g.fillStyle(tint('#ffe9a8'), 1); g.fillRect(0, 0, 12, 12);
    });
    for (i = 0; i < 6; i++) {
      (function (n) {
        self.createTexture('oh-glyph-' + n, 72, 72, function (g) {
          var cx = 36, cy = 36, k;
          g.fillStyle(tint('#ffffff'), 0.95);
          if (n === 0) { g.fillRect(cx - 18, cy - 4, 36, 8); g.fillRect(cx - 4, cy - 18, 8, 36); }
          else if (n === 1) { g.fillCircle(cx, cy, 16); g.fillStyle(tint('#000000'), 1); g.fillCircle(cx, cy, 8); }
          else if (n === 2) { g.fillTriangle(cx, cy - 19, cx + 18, cy + 15, cx - 18, cy + 15); g.fillStyle(tint('#000000'), 1); g.fillTriangle(cx, cy - 6, cx + 8, cy + 10, cx - 8, cy + 10); }
          else if (n === 3) { for (k = 0; k < 3; k++) g.fillRect(cx - 18, cy - 16 + k * 12, 36, 6); }
          else if (n === 4) { g.fillRect(cx - 16, cy - 16, 32, 32); g.fillStyle(tint('#000000'), 1); g.fillRect(cx - 7, cy - 7, 14, 14); }
          else { g.fillTriangle(cx, cy - 18, cx + 16, cy, cx, cy + 18); g.fillTriangle(cx, cy - 18, cx - 16, cy, cx, cy + 18); g.fillStyle(tint('#000000'), 1); g.fillCircle(cx, cy, 5); }
        });
      })(i);
    }
    for (i = 0; i < 3; i++) {
      (function (frame) {
        self.createTexture('oh-diver-' + frame, 72, 84, function (g) {
          var lean = frame === 1 ? 0.22 : frame === 2 ? -0.14 : 0;
          g.save(); g.translateCanvas(36, 44); g.rotateCanvas(lean);
          g.fillStyle(tint('#12213a'), 1); g.fillRoundedRect(-16, -18, 32, 44, 14);
          g.fillStyle(tint('#7fd4ff'), 1); g.fillRoundedRect(-13, -15, 26, 24, 12);
          g.fillStyle(tint('#0a1526'), 1); g.fillEllipse(0, -6, 20, 14);
          g.fillStyle(tint('#cbe9ff'), 0.85); g.fillEllipse(-4, -9, 8, 5);
          g.fillStyle(tint('#ffd67a'), 1); g.fillRect(-16, 6, 32, 4);
          g.fillStyle(tint('#12213a'), 1);
          g.fillRoundedRect(-24, -6, 10, 22, 5); g.fillRoundedRect(14, -6, 10, 22, 5);
          g.fillRoundedRect(-13, 24, 10, 18, 5); g.fillRoundedRect(3, 24, 10, 18, 5);
          if (frame === 1) {
            g.fillStyle(tint('#ffb27f'), 0.9); g.fillTriangle(-6, 42, 6, 42, 0, 62);
            g.fillStyle(tint('#fff0d0'), 0.9); g.fillTriangle(-3, 42, 3, 42, 0, 54);
          }
          if (frame === 2) { g.lineStyle(3, tint('#ff7d86'), 0.7); g.strokeCircle(0, 0, 26); }
          g.restore();
        });
      })(i);
    }
    this.createTexture('oh-gate', 148, 40, function (g) {
      g.fillStyle(tint('#7fd4ff'), 0.16); g.fillRoundedRect(0, 0, 148, 40, 18);
      g.lineStyle(4, tint('#7fd4ff'), 0.95); g.strokeRoundedRect(2, 2, 144, 36, 18);
      g.fillStyle(tint('#ffffff'), 0.9); g.fillCircle(10, 20, 4); g.fillCircle(138, 20, 4);
    });
    this.createTexture('oh-gate-on', 148, 40, function (g) {
      g.fillStyle(tint('#9ff2a8'), 0.3); g.fillRoundedRect(0, 0, 148, 40, 18);
      g.lineStyle(4, tint('#9ff2a8'), 1); g.strokeRoundedRect(2, 2, 144, 36, 18);
    });
    this.createTexture('oh-pip', 22, 22, function (g) {
      g.fillStyle(tint('#ffffff'), 1); g.fillCircle(11, 11, 9);
    });
  };

  /* ------------------------------------------------------------ scene setup */
  PlayScene.prototype.create = function () {
    Game.play = this;
    this.installInputBridges();
    if (kit) kit.loader.show('Orbit Hearts');
    this.bg = this.add.rectangle(0, 0, W, H, tint(C.deep), 1).setOrigin(0).setDepth(0);
    this.queueTextures();
    this.buildDone = 0;
    var self = this;
    if (kit) {
      kit.audio.preload(SFX_KEYS).then(function () { self.audioReady = true; })
        .catch(function () { self.audioReady = true; });
    } else this.audioReady = true;
  };

  PlayScene.prototype.installInputBridges = function () {
    var self = this;
    /* Window level claim, registered AFTER GGKit init so the kit pointer map is
     * seeded first and never overwrites a claim made on the canvas. */
    this.pointerEdgeHandler = function (event) {
      if (kit && kit.paused) return;
      if (kit && kit.input && kit.input.pointers && !kit.input.pointers.has(event.pointerId)) {
        kit.input.pointers.set(event.pointerId, {
          x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
          downAt: performance.now(), zone: null
        });
      }
      self.pointerEdges.push({ id: event.pointerId, x: event.clientX, y: event.clientY });
      if (self.pointerEdges.length > 24) self.pointerEdges.shift();
    };
    root.addEventListener('pointerdown', this.pointerEdgeHandler, { passive: true });
    this.keyQueue = [];
    this.keyEdgeHandler = function (event) {
      if (kit && kit.paused) return;
      if (event.repeat) return;
      var code = event.code;
      if (!code) return;
      self.keyQueue.push(code);
      if (self.keyQueue.length > 16) self.keyQueue.shift();
      if (code === 'Space' || code.indexOf('Arrow') === 0) {
        if (event.preventDefault) event.preventDefault();
      }
    };
    root.addEventListener('keydown', this.keyEdgeHandler);
  };

  PlayScene.prototype.finishBuild = function () {
    this.buildDisplayPool();
    this.loaded = true;
    if (kit) { kit.loader.progress(1); kit.loader.hide(); kit.registerPWA(); }
    var forced = root.__oh ? root.__oh.forceMode : null;
    this.lastForceMode = forced == null ? null : String(forced);
    this.lastForceStage = root.__oh && root.__oh.forceStage != null ? String(root.__oh.forceStage) : null;
    if (forced) this.applyForce(String(forced), this.lastForceStage);
    else this.showTitle();
  };

  PlayScene.prototype.text = function (x, y, size, color, weight, wrap, align) {
    var style = {
      fontFamily: FONT, fontSize: size + 'px', fontStyle: weight || '700',
      color: color || C.ink, align: align || 'left'
    };
    if (wrap) style.wordWrap = { width: wrap };
    var t = this.add.text(x, y, '', style);
    t.setResolution(Math.min(2, root.devicePixelRatio || 1));
    return t;
  };

  PlayScene.prototype.buildDisplayPool = function () {
    var i, u = {};
    this.ui = u;

    /* scene art */
    u.far = this.add.image(195, 290, 'oh-far-core').setDepth(1).setDisplaySize(390, 600);
    u.mid = this.add.image(195, 300, 'oh-mid-core').setDepth(2).setDisplaySize(390, 600);
    u.light = this.add.rectangle(0, 0, W, 580, tint(C.cyan), 0.1).setOrigin(0).setDepth(3);
    u.spot = this.add.ellipse(195, 360, 360, 560, tint('#05070f'), 0.26).setDepth(3);
    u.portraitShadow = this.add.ellipse(195, 520, 200, 34, tint('#000000'), 0.34).setDepth(4);
    u.portrait = this.add.image(195, 360, 'oh-por-rell-neutral').setDepth(5).setDisplaySize(232, 325);
    u.near = this.add.image(195, 500, 'oh-near-core').setDepth(6).setDisplaySize(390, 190);
    u.vig = this.add.image(195, 290, 'oh-vig').setDepth(7).setAlpha(0.85);

    /* ambient motes */
    u.motes = [];
    for (i = 0; i < 22; i++) u.motes[i] = this.add.image(0, 0, 'oh-mote').setDepth(4).setVisible(false);
    u.hearts = [];
    for (i = 0; i < 18; i++) u.hearts[i] = this.add.image(0, 0, 'oh-heart-rose').setDepth(30).setVisible(false);
    u.sparks = [];
    for (i = 0; i < 24; i++) u.sparks[i] = this.add.image(0, 0, 'oh-spark').setDepth(30).setVisible(false);
    u.rings = [];
    for (i = 0; i < 6; i++) u.rings[i] = this.add.image(0, 0, 'oh-ring').setDepth(29).setVisible(false);

    /* top HUD */
    u.hudChip = this.add.image(14, 26, 'oh-chip').setOrigin(0).setDepth(12).setDisplaySize(158, 34);
    u.hudChapter = this.text(26, 34, 14, C.muted, '800');
    u.hudChapter.setDepth(13);
    u.affIcon = this.add.image(190, 43, 'oh-heart-rose').setDepth(13).setDisplaySize(18, 18);
    u.affBarBg = this.add.rectangle(248, 43, 96, 10, tint('#16233c'), 1).setDepth(12);
    u.affBar = this.add.rectangle(201, 43, 6, 10, tint(C.rose), 1).setOrigin(0, 0.5).setDepth(13);
    u.memIcon = this.add.image(306, 43, 'oh-mem').setDepth(13).setDisplaySize(18, 18);
    u.memText = this.text(318, 34, 14, C.gold, '800');
    u.memText.setDepth(13);
    u.menuBtn = this.add.image(348, 26, 'oh-btn').setOrigin(0).setDepth(12).setDisplaySize(30, 34);
    u.menuIcon = this.text(363, 33, 15, C.ink, '900', 0, 'center');
    u.menuIcon.setOrigin(0.5, 0).setDepth(13);

    /* coach strip */
    u.coachBg = this.add.rectangle(0, 72, W, 34, tint('#070c18'), 0.62).setOrigin(0).setDepth(14);
    u.coach = this.text(195, 80, 14, C.muted, '700', 356, 'center');
    u.coach.setOrigin(0.5, 0).setDepth(15);

    /* memory glimmer */
    u.memGlow = this.add.image(340, 470, 'oh-mem').setDepth(9).setVisible(false);

    /* dialogue */
    u.panel = this.add.image(12, 560, 'oh-panel').setOrigin(0).setDepth(16);
    u.plate = this.add.image(28, 550, 'oh-plate').setOrigin(0).setDepth(17).setDisplaySize(150, 32);
    u.name = this.text(103, 557, 15, C.deep, '900', 0, 'center');
    u.name.setOrigin(0.5, 0).setDepth(18);
    u.body = this.text(34, 616, 17, C.ink, '600', 322);
    u.body.setDepth(18).setLineSpacing(6);
    u.caret = this.text(352, 752, 16, C.rose, '900', 0, 'right');
    u.caret.setOrigin(1, 0).setDepth(18);

    /* dialogue controls */
    u.ctl = []; u.ctlText = [];
    for (i = 0; i < 4; i++) {
      u.ctl[i] = this.add.image(14 + i * 92, 792, 'oh-btn').setOrigin(0).setDepth(17).setDisplaySize(86, 44);
      u.ctlText[i] = this.text(57 + i * 92, 804, 14, C.muted, '800', 0, 'center');
      u.ctlText[i].setOrigin(0.5, 0).setDepth(18);
    }

    /* choices */
    u.prompt = this.text(195, 556, 14, C.violet, '800', 340, 'center');
    u.prompt.setOrigin(0.5, 0).setDepth(20);
    u.timerBg = this.add.rectangle(24, 582, 342, 6, tint('#16233c'), 1).setOrigin(0).setDepth(20);
    u.timerBar = this.add.rectangle(24, 582, 342, 6, tint(C.gold), 1).setOrigin(0).setDepth(21);
    u.opt = []; u.optText = []; u.optNum = [];
    for (i = 0; i < 3; i++) {
      u.opt[i] = this.add.image(14, 600 + i * 72, 'oh-btn').setOrigin(0).setDepth(20).setDisplaySize(362, 64);
      u.optNum[i] = this.text(34, 620 + i * 72, 15, C.rose, '900', 0, 'center');
      u.optNum[i].setOrigin(0.5, 0).setDepth(21);
      u.optText[i] = this.text(54, 610 + i * 72, 15, C.ink, '700', 304);
      u.optText[i].setDepth(21).setLineSpacing(3);
    }

    /* minigame surface */
    u.mgTitle = this.text(195, 112, 15, C.gold, '900', 340, 'center');
    u.mgTitle.setOrigin(0.5, 0).setDepth(20);
    u.mgHint = this.text(195, 134, 14, C.muted, '700', 340, 'center');
    u.mgHint.setOrigin(0.5, 0).setDepth(20);
    u.mgFeed = this.text(195, 500, 22, C.ink, '900', 340, 'center');
    u.mgFeed.setOrigin(0.5, 0).setDepth(22);
    u.pips = [];
    for (i = 0; i < 6; i++) u.pips[i] = this.add.image(0, 0, 'oh-pip').setDepth(21).setVisible(false).setDisplaySize(14, 14);
    u.track = this.add.image(195, 400, 'oh-track').setDepth(20).setVisible(false);
    u.target = this.add.image(195, 400, 'oh-target').setDepth(21).setVisible(false);
    u.beat = this.add.image(195, 400, 'oh-beat').setDepth(22).setVisible(false);
    u.nodes = []; u.nodeText = [];
    for (i = 0; i < 7; i++) {
      u.nodes[i] = this.add.image(0, 0, 'oh-node').setDepth(20).setVisible(false).setDisplaySize(58, 58);
      u.nodeText[i] = this.text(0, 0, 15, C.ink, '900', 0, 'center');
      u.nodeText[i].setOrigin(0.5).setDepth(21).setVisible(false);
    }
    u.links = [];
    for (i = 0; i < 6; i++) u.links[i] = this.add.rectangle(0, 0, 10, 3, tint('#ffe9a8'), 0.85).setDepth(19).setVisible(false);
    u.keyGlyph = this.add.image(195, 250, 'oh-glyph-0').setDepth(21).setVisible(false).setDisplaySize(96, 96);
    u.keyLabel = this.text(195, 196, 14, C.muted, '800', 300, 'center');
    u.keyLabel.setOrigin(0.5, 0).setDepth(21);
    u.glyphs = []; u.glyphBg = []; u.glyphNum = [];
    for (i = 0; i < 4; i++) {
      u.glyphBg[i] = this.add.image(24 + i * 88, 356, 'oh-btn').setOrigin(0).setDepth(20).setVisible(false).setDisplaySize(78, 96);
      u.glyphs[i] = this.add.image(63 + i * 88, 396, 'oh-glyph-0').setDepth(21).setVisible(false).setDisplaySize(56, 56);
      u.glyphNum[i] = this.text(63 + i * 88, 436, 13, C.dim, '800', 0, 'center');
      u.glyphNum[i].setOrigin(0.5, 0).setDepth(21).setVisible(false);
    }
    u.diver = this.add.image(195, 430, 'oh-diver-0').setDepth(22).setVisible(false).setDisplaySize(56, 66);
    u.gates = [];
    for (i = 0; i < 5; i++) u.gates[i] = this.add.image(195, 0, 'oh-gate').setDepth(20).setVisible(false).setDisplaySize(140, 38);
    u.lane = this.add.rectangle(195, 300, 300, 400, tint('#0a1526'), 0.4).setDepth(19).setVisible(false);

    /* generic list rows for menus */
    u.rows = [];
    for (i = 0; i < 8; i++) {
      u.rows[i] = {
        bg: this.add.image(16, 0, 'oh-btn').setOrigin(0).setDepth(42).setVisible(false).setDisplaySize(358, 76),
        title: this.text(36, 0, 17, C.ink, '900').setDepth(43),
        meta: this.text(36, 0, 14, C.muted, '700', 260).setDepth(43),
        right: this.text(358, 0, 14, C.cyan, '800', 0, 'right').setDepth(43),
        art: this.add.image(0, 0, 'oh-star-on').setDepth(43).setVisible(false).setDisplaySize(26, 26)
      };
      u.rows[i].right.setOrigin(1, 0);
    }
    /* generic grid tiles for the gallery */
    u.tiles = [];
    for (i = 0; i < 6; i++) {
      u.tiles[i] = {
        bg: this.add.image(0, 0, 'oh-btn').setOrigin(0).setDepth(42).setVisible(false).setDisplaySize(112, 132),
        art: this.add.image(0, 0, 'oh-far-core').setDepth(42).setVisible(false).setDisplaySize(104, 78),
        label: this.text(0, 0, 13, C.ink, '800', 100, 'center').setDepth(43)
      };
      u.tiles[i].label.setOrigin(0.5, 0);
    }
    /* overlays */
    u.shade = this.add.rectangle(0, 0, W, H, tint(C.deep), 0.9).setOrigin(0).setDepth(40);
    u.oTitle = this.text(195, 0, 30, C.ink, '900', 350, 'center');
    u.oTitle.setOrigin(0.5, 0).setDepth(43);
    u.oAccent = this.text(195, 0, 20, C.rose, '900', 350, 'center');
    u.oAccent.setOrigin(0.5, 0).setDepth(43);
    u.oSub = this.text(195, 0, 14, C.muted, '700', 340, 'center');
    u.oSub.setOrigin(0.5, 0).setDepth(43);
    u.oFoot = this.text(195, 0, 14, C.dim, '700', 350, 'center');
    u.oFoot.setOrigin(0.5, 0).setDepth(43);
    u.oBody = this.text(195, 0, 16, C.ink, '600', 330, 'center');
    u.oBody.setOrigin(0.5, 0).setDepth(43).setLineSpacing(7);
    u.oArt = this.add.image(195, 0, 'oh-star-on').setDepth(43).setVisible(false);
    u.oPortrait = this.add.image(195, 0, 'oh-por-rell-warm').setDepth(42).setVisible(false);
    u.back = this.add.image(115, 780, 'oh-btn').setOrigin(0).setDepth(43).setVisible(false).setDisplaySize(160, 48);
    u.backText = this.text(195, 794, 15, C.ink, '900', 0, 'center');
    u.backText.setOrigin(0.5, 0).setDepth(44);

    /* constellation map on the title screen */
    u.stars = []; u.starLabel = [];
    for (i = 0; i < 9; i++) {
      u.stars[i] = this.add.image(0, 0, 'oh-star-off').setDepth(43).setVisible(false).setDisplaySize(28, 28);
      u.starLabel[i] = this.text(0, 0, 12, C.dim, '700', 96, 'center');
      u.starLabel[i].setOrigin(0.5, 0).setDepth(43);
    }

    /* banner, chip, flash */
    u.bannerBg = this.add.image(195, 380, 'oh-btn').setDepth(45).setVisible(false).setDisplaySize(236, 118);
    u.bannerTitle = this.text(195, 348, 24, C.ink, '900', 220, 'center');
    u.bannerTitle.setOrigin(0.5, 0).setDepth(46);
    u.bannerText = this.text(195, 388, 14, C.gold, '800', 220, 'center');
    u.bannerText.setOrigin(0.5, 0).setDepth(46);
    u.chipBg = this.add.image(0, 0, 'oh-chip').setOrigin(0).setDepth(60).setVisible(false);
    u.chipText = this.text(0, 0, 14, C.ink, '800');
    u.chipText.setDepth(61);
    u.flash = this.add.rectangle(0, 0, W, H, tint('#ffffff'), 0).setOrigin(0).setDepth(70).setVisible(false);
    this.setAllVisible(false);
  };

  PlayScene.prototype.setAllVisible = function (value) {
    var key, i, u = this.ui, v;
    for (key in u) {
      if (!Object.prototype.hasOwnProperty.call(u, key)) continue;
      v = u[key];
      if (Array.isArray(v)) {
        for (i = 0; i < v.length; i++) {
          if (v[i] && v[i].label) { visible(v[i].bg, value); visible(v[i].art, value); visible(v[i].label, value); }
          else if (v[i] && v[i].bg) { visible(v[i].bg, value); visible(v[i].title, value); visible(v[i].meta, value); visible(v[i].right, value); visible(v[i].art, value); }
          else visible(v[i], value);
        }
      } else visible(v, value);
    }
    visible(this.bg, true);
  };

  /* =============================================================== flow */
  PlayScene.prototype.showTitle = function () {
    this.screen = 'title';
    this.menuIndex = 0;
    this.phase = 'text';
    this.mg = null;
    this.banner = null;
    this.setAllVisible(false);
    if (musicOn || this.everInteracted) music(MUSIC.drift);
    this.syncProbe();
  };

  PlayScene.prototype.newStory = function () {
    this.st = {
      rid: null, sid: D.PROLOGUE, li: 0, aff: 0, flags: {}, mems: {}, ch: 0
    };
    this.backlog.length = 0;
    this.auto = !!profile.prefs.auto;
    this.skip = false;
    profile.runs++;
    persist();
    this.enterScene(D.PROLOGUE, 0);
    this.screen = 'story';
    this.setAllVisible(false);
    music(MUSIC.station);
    if (!profile.tutorial) {
      this.showCoach('Tap anywhere to advance. Tap again to finish a line instantly.', 5.5);
      profile.tutorial = true;
      persist();
    }
  };

  PlayScene.prototype.startRoute = function (rid) {
    var r = routeOf(rid);
    if (!r) return;
    this.st.rid = rid;
    this.st.aff = 0;
    this.st.ch = 1;
    this.backlog.length = 0;
    this.enterScene(r.start, 0);
    this.screen = 'story';
    this.setAllVisible(false);
    music(MUSIC.station);
    this.showBanner('CHAPTER ONE', r.name.toUpperCase());
  };

  PlayScene.prototype.lineVisible = function (line) {
    var cond = line[3];
    if (!cond) return true;
    if (cond.f && !this.st.flags[cond.f]) return false;
    if (cond.nf && this.st.flags[cond.nf]) return false;
    if (cond.aff != null && this.st.aff < cond.aff) return false;
    if (cond.mem && !this.st.mems[cond.mem]) return false;
    return true;
  };

  PlayScene.prototype.enterScene = function (sid, li) {
    var s = sceneOf(sid);
    if (!s) { this.showTitle(); return; }
    var prevCh = this.st ? this.st.ch : 0;
    this.st.sid = sid;
    this.st.ch = s.ch;
    this.lines = [];
    var i;
    for (i = 0; i < (s.l || []).length; i++) if (this.lineVisible(s.l[i])) this.lines.push(s.l[i]);
    this.st.li = clamp(whole(li, 0), 0, Math.max(0, this.lines.length));
    this.typed = 0;
    this.phase = this.lines.length ? 'text' : 'resolve';
    this.mg = null;
    this.memActive = !!s.mem && !profile.mems[s.mem.id];
    /* mem.at indexes the authored line list, so clamp it into the filtered one:
     * conditional lines can shorten a scene and would otherwise hide the
     * fragment for the whole run. */
    this.memAt = s.mem ? clamp(whole(s.mem.at, 0), 0, Math.max(0, this.lines.length - 1)) : 0;
    this.memTaken = false;
    this.memPulse = 0;
    this.autoTimer = 0;
    if (s.cg && !profile.gallery[sid]) { profile.gallery[sid] = 1; persist(); }
    if (s.coach) this.showCoach(s.coach, REDUCED ? 2.4 : 4.6);
    if (s.ch && s.ch !== prevCh && s.ch > 0 && this.st.rid) {
      this.showBanner('CHAPTER ' + ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'][s.ch], s.title.toUpperCase());
    }
    if (s.loc === 'orbit') music(MUSIC.orbit);
    this.seedMotes(s.loc);
    this.autoSave();
    if (this.phase === 'resolve') this.resolveScene();
    this.syncProbe();
  };

  PlayScene.prototype.curScene = function () { return this.st ? sceneOf(this.st.sid) : null; };
  PlayScene.prototype.curLine = function () {
    return this.lines && this.lines[this.st.li] ? this.lines[this.st.li] : null;
  };
  PlayScene.prototype.lineFull = function () {
    var l = this.curLine();
    return l ? l[1].length : 0;
  };
  PlayScene.prototype.seenKey = function () { return this.st.sid + ':' + this.st.li; };

  PlayScene.prototype.advance = function () {
    if (this.phase !== 'text') return;
    var full = this.lineFull();
    if (this.typed < full) { this.typed = full; sfx('tap', 0.35); return; }
    var l = this.curLine();
    if (l) {
      profile.seen[this.seenKey()] = 1;
      this.pushLog(l);
    }
    this.st.li++;
    this.typed = 0;
    this.autoTimer = 0;
    if (this.st.li >= this.lines.length) { this.phase = 'resolve'; this.resolveScene(); }
    else {
      var nx = this.curLine();
      if (nx && nx[2]) { this.portraitPop = 1; sfx('page', 0.28); }
      if (this.skip && !profile.seen[this.seenKey()]) { this.skip = false; this.showChip('SKIP OFF, NEW LINE', C.gold); }
    }
  };

  PlayScene.prototype.pushLog = function (l) {
    var entry = {
      who: l[0], text: l[1], sid: this.st.sid, li: this.st.li,
      aff: this.st.aff, flags: JSON.stringify(this.st.flags), mems: JSON.stringify(this.st.mems)
    };
    if (root.GGKit && root.GGKit.boundedPush) root.GGKit.boundedPush(this.backlog, entry, 140);
    else { this.backlog.push(entry); if (this.backlog.length > 140) this.backlog.shift(); }
  };

  PlayScene.prototype.resolveScene = function () {
    var s = this.curScene();
    if (!s) { this.showTitle(); return; }
    if (s.mg && !this.mgDone) { this.startMg(s.mg); return; }
    if (s.q && !this.choiceDone) { this.phase = 'choice'; this.choiceFocus = 0; this.choiceTimer = this.choiceLimit(s); return; }
    this.leaveScene(s);
  };

  PlayScene.prototype.choiceLimit = function (s) {
    if (!profile.prefs.timers) return 0;
    return num(s.q.timer, 9);
  };

  PlayScene.prototype.leaveScene = function (s) {
    this.mgDone = false;
    this.choiceDone = false;
    if (s.select) { this.screen = 'routes'; this.menuIndex = 0; this.setAllVisible(false); this.syncProbe(); return; }
    if (s.end) { this.finishRoute(s.end); return; }
    if (s.branch) {
      var k;
      for (k in s.branch) if (this.st.flags[k]) { this.enterScene(s.branch[k], 0); return; }
      var keys = Object.keys(s.branch);
      this.enterScene(s.branch[keys[0]], 0);
      return;
    }
    if (s.go && sceneOf(s.go)) { this.enterScene(s.go, 0); return; }
    this.showTitle();
  };

  PlayScene.prototype.pick = function (index) {
    var s = this.curScene();
    if (!s || !s.q || this.phase !== 'choice') return;
    var opt = s.q.opts[index];
    if (!opt) return;
    this.st.aff = clamp(this.st.aff + num(opt.a, 0), 0, 999);
    if (opt.f) this.st.flags[opt.f] = true;
    this.choiceDone = true;
    this.phase = 'text';
    sfx('choose');
    if (opt.a >= 2) { sfx('heart', 0.7); this.burstHearts(195, 470, 9); }
    else if (opt.a >= 1) this.burstHearts(195, 470, 4);
    this.pushLog(['you', opt.t]);
    if (kit) { kit.juice.shake(REDUCED ? 0 : 3, 160); kit.juice.hitStop(REDUCED ? 0 : 40); }
    this.doFlash(opt.a >= 2 ? C.rose : C.cyan, 0.22);
    if (opt.go && sceneOf(opt.go)) { this.enterScene(opt.go, 0); return; }
    this.leaveScene(s);
  };

  PlayScene.prototype.takeMemory = function () {
    var s = this.curScene();
    if (!s || !s.mem || this.memTaken) return;
    this.memTaken = true;
    this.memActive = false;
    this.st.mems[s.mem.id] = 1;
    profile.mems[s.mem.id] = 1;
    persist();
    sfx('memory');
    this.burstSparks(this.memX, this.memY, 14, C.gold);
    this.ringAt(this.memX, this.memY, C.gold);
    if (kit) kit.juice.shake(REDUCED ? 0 : 4, 200);
    this.showChip('MEMORY: ' + s.mem.name.toUpperCase(), C.gold, 1.6);
    this.memNote = s.mem;
    this.memNoteTimer = 4.5;
  };

  PlayScene.prototype.finishRoute = function (rid) {
    var r = routeOf(rid);
    if (!r) { this.showTitle(); return; }
    var list = ENDINGS[rid] || [];
    var mems = 0, i;
    var pool = memsOfRoute(rid);
    for (i = 0; i < pool.length; i++) if (this.st.mems[pool[i].id]) mems++;
    var idx = 0;
    if (this.st.aff >= r.hi && mems >= D.MEM_TRUE) idx = 2;
    else if (this.st.aff >= r.mid) idx = 1;
    var end = list[idx] || list[0];
    if (!end) { this.showTitle(); return; }
    this.ending = { data: end, route: r, aff: this.st.aff, mems: mems, fresh: !profile.endings[end.id] };
    profile.endings[end.id] = 1;
    if (!profile.best[rid] || this.st.aff > profile.best[rid]) profile.best[rid] = this.st.aff;
    profile.auto = null;
    persist();
    this.endPage = 1;
    this.screen = 'ending';
    this.phase = 'text';
    this.setAllVisible(false);
    music(MUSIC.orbit);
    sfx('ending');
    this.doFlash(C.white, 0.4);
    if (kit) kit.juice.shake(REDUCED ? 0 : 6, 320);
    this.burstHearts(195, 300, 16);
    this.burstSparks(195, 300, 18, end.tier === 'true' ? C.gold : C.rose);
    this.syncProbe();
  };

  /* ---------------------------------------------------------------- saves */
  PlayScene.prototype.snapshot = function () {
    if (!this.st || !this.st.rid) return null;
    var s = this.curScene();
    return {
      rid: this.st.rid, sid: this.st.sid, li: clamp(this.st.li, 0, 63), aff: this.st.aff,
      flags: JSON.parse(JSON.stringify(this.st.flags)), mems: JSON.parse(JSON.stringify(this.st.mems)),
      ch: this.st.ch, t: Date.now(), title: s ? s.title : ''
    };
  };
  PlayScene.prototype.autoSave = function () {
    var snap = this.snapshot();
    if (!snap) return;
    profile.auto = snap;
    persist();
  };
  PlayScene.prototype.saveSlot = function (i) {
    var snap = this.snapshot();
    if (!snap) { sfx('deny'); this.showChip('NOTHING TO SAVE YET', C.muted); return; }
    profile.slots[i] = snap;
    persist();
    sfx('lock');
    this.showChip('SAVED TO SLOT ' + (i + 1), C.mint);
  };
  PlayScene.prototype.loadSnapshot = function (snap) {
    if (!validSnapshot(snap)) { sfx('deny'); this.showChip('SLOT EMPTY', C.muted); return false; }
    this.st = {
      rid: snap.rid, sid: snap.sid, li: snap.li, aff: snap.aff,
      flags: JSON.parse(JSON.stringify(snap.flags)), mems: JSON.parse(JSON.stringify(snap.mems)),
      ch: whole(snap.ch, 1)
    };
    this.backlog.length = 0;
    this.mgDone = false;
    this.choiceDone = false;
    this.screen = 'story';
    this.setAllVisible(false);
    this.enterScene(snap.sid, snap.li);
    this.typed = this.lineFull();
    music(MUSIC.station);
    sfx('page');
    return true;
  };
  PlayScene.prototype.restartCurrent = function () {
    if (this.screen === 'story' && this.st && this.st.rid) {
      var r = routeOf(this.st.rid);
      if (r) { this.st.aff = 0; this.st.flags = {}; this.st.mems = {}; this.backlog.length = 0; this.enterScene(r.start, 0); return; }
    }
    this.showTitle();
  };

  /* -------------------------------------------------------------- feedback */
  PlayScene.prototype.showChip = function (text, color, seconds) {
    this.chip = { text: String(text), color: color || C.ink, timer: seconds == null ? 1.0 : seconds, life: seconds == null ? 1.0 : seconds };
  };
  PlayScene.prototype.showCoach = function (text, seconds) {
    this.coach = String(text);
    this.coachTimer = seconds == null ? (REDUCED ? 2 : 4) : seconds;
  };
  PlayScene.prototype.showBanner = function (title, text) {
    this.banner = { title: String(title), text: String(text || ''), timer: REDUCED ? 1.1 : 2.0, life: REDUCED ? 1.1 : 2.0 };
    sfx('chapter', 0.7);
  };
  PlayScene.prototype.doFlash = function (color, amount) {
    if (REDUCED) return;
    this.flash = Math.max(this.flash, amount == null ? 0.3 : amount);
    this.flashColor = color || C.white;
  };
  PlayScene.prototype.burstHearts = function (x, y, n) {
    var i, p, count = REDUCED ? Math.min(4, n) : n;
    for (i = 0; i < count; i++) {
      p = this.freeParticle(this.hearts, 18);
      if (!p) break;
      p.x = x + (Math.random() - 0.5) * 60; p.y = y + (Math.random() - 0.5) * 24;
      p.vx = (Math.random() - 0.5) * 46; p.vy = -34 - Math.random() * 52;
      p.life = 0.9 + Math.random() * 0.5; p.t = p.life; p.s = 0.5 + Math.random() * 0.6;
      p.rot = (Math.random() - 0.5) * 0.6;
    }
  };
  PlayScene.prototype.burstSparks = function (x, y, n, color) {
    var i, p, count = REDUCED ? Math.min(6, n) : n;
    for (i = 0; i < count; i++) {
      p = this.freeParticle(this.sparks, 24);
      if (!p) break;
      var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 120;
      p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.life = 0.45 + Math.random() * 0.4; p.t = p.life; p.s = 0.4 + Math.random() * 0.7;
      p.color = color || C.white; p.rot = Math.random() * 3;
    }
  };
  PlayScene.prototype.ringAt = function (x, y, color) {
    if (REDUCED) return;
    var p = this.freeParticle(this.rings, 6);
    if (!p) return;
    p.x = x; p.y = y; p.life = 0.5; p.t = 0.5; p.color = color || C.white;
  };
  PlayScene.prototype.freeParticle = function (pool, max) {
    var i;
    for (i = 0; i < pool.length; i++) if (pool[i].t <= 0) return pool[i];
    if (pool.length < max) {
      pool.push({ x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, s: 1, rot: 0, color: C.white });
      return pool[pool.length - 1];
    }
    return null;
  };
  /* ============================================================ minigames */
  PlayScene.prototype.startMg = function (def) {
    var diff = clamp(whole(def.diff, 1), 1, 3);
    var mg = {
      type: def.type, name: def.name || 'INTERLUDE', diff: diff, points: 0, cap: 3,
      done: false, endT: 0, fb: '', fbT: 0, guard: 34
    };
    if (def.type === 'sync') {
      mg.beats = 3; mg.i = 0; mg.p = 0; mg.gap = 0.8; mg.active = false; mg.results = [];
      mg.travel = diff === 1 ? 1.35 : diff === 2 ? TRAVEL : 1.0;
      mg.hint = 'Tap on the beat. Space works too.';
    } else if (def.type === 'trace') {
      var count = clamp(3 + diff, 4, 6);
      var r = rnd(hashCode(this.st.sid + def.name));
      mg.nodes = [];
      for (var i = 0; i < count; i++) {
        mg.nodes.push({
          x: 62 + r() * 266,
          y: 186 + (i / Math.max(1, count - 1)) * 250 + (r() - 0.5) * 42,
          on: false
        });
      }
      mg.next = 0; mg.clean = true; mg.time = 30;
      mg.hint = 'Link the points in order. Number keys work too.';
    } else if (def.type === 'decrypt') {
      mg.rounds = clamp(whole(def.rounds, 3), 2, 5); mg.round = 0; mg.time = 40;
      mg.wrong = false;
      this.rollDecrypt(mg);
      mg.hint = 'Match the key glyph. Number keys work too.';
    } else {
      mg.diver = { x: 195, vx: 0, frame: 0, brace: 0 };
      mg.gates = [];
      var gr = rnd(hashCode(this.st.sid + 'drift'));
      for (var k = 0; k < 5; k++) {
        mg.gates.push({ x: 90 + gr() * 210, y: -120 - k * 168, hit: false, done: false });
      }
      mg.speed = 104 + diff * 20; mg.time = 32; mg.thrust = 0;
      mg.hint = 'Tap a side to thrust. Arrow keys work too.';
    }
    this.mg = mg;
    this.phase = 'mg';
    this.mgDone = false;
    this.coachTimer = 0;
    this.syncProbe();
  };

  PlayScene.prototype.rollDecrypt = function (mg) {
    var r = rnd(hashCode(this.st.sid + 'g' + mg.round));
    var key = Math.floor(r() * 6) % 6;
    var opts = [key], pick;
    while (opts.length < 4) {
      pick = Math.floor(r() * 6) % 6;
      if (opts.indexOf(pick) < 0) opts.push(pick);
    }
    for (var i = opts.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var tmp = opts[i]; opts[i] = opts[j]; opts[j] = tmp;
    }
    mg.key = key; mg.opts = opts; mg.wrong = false;
  };

  PlayScene.prototype.mgFeedback = function (text, color, sound, volume) {
    var mg = this.mg;
    if (!mg) return;
    mg.fb = text; mg.fbT = 0.7; mg.fbColor = color || C.ink;
    if (sound) sfx(sound, volume);
  };

  PlayScene.prototype.mgScore = function (x, y, perfect) {
    var mg = this.mg;
    if (!mg) return;
    if (mg.points < mg.cap) {
      mg.points++;
      this.st.aff = clamp(this.st.aff + 1, 0, 999);
    }
    this.burstSparks(x, y, perfect ? 14 : 8, perfect ? C.gold : C.rose);
    if (perfect) { this.ringAt(x, y, C.gold); this.doFlash(C.white, 0.16); }
    if (kit) { kit.juice.shake(REDUCED ? 0 : (perfect ? 4 : 2), 150); if (perfect) kit.juice.hitStop(REDUCED ? 0 : 45); }
  };

  PlayScene.prototype.mgTap = function (x, y) {
    var mg = this.mg, i;
    if (!mg || mg.done) return;
    if (mg.type === 'sync') { this.syncTap(); return; }
    if (mg.type === 'trace') {
      for (i = 0; i < mg.nodes.length; i++) {
        var n = mg.nodes[i];
        if (Math.abs(x - n.x) < 34 && Math.abs(y - n.y) < 34) { this.traceHit(i); return; }
      }
      return;
    }
    if (mg.type === 'decrypt') {
      for (i = 0; i < 4; i++) {
        if (x >= 24 + i * 88 && x <= 102 + i * 88 && y >= 356 && y <= 452) { this.decryptHit(i); return; }
      }
      return;
    }
    if (mg.type === 'drift') this.driftThrust(x < 195 ? -1 : 1);
  };

  PlayScene.prototype.syncTap = function () {
    var mg = this.mg;
    if (!mg || !mg.active) return;
    var r = 150 - 104 * mg.p;
    var err = Math.abs(r - TR);
    mg.active = false;
    mg.gap = 0.42;
    var bx = 195, by = 400;
    if (err <= PERF) {
      mg.results.push(2); this.mgFeedback('PERFECT', C.gold, 'perfect'); this.mgScore(bx, by, true);
    } else if (err <= WIN) {
      mg.results.push(1); this.mgFeedback('GOOD', C.mint, 'good'); this.mgScore(bx, by, false);
    } else {
      mg.results.push(0); this.mgFeedback('OFF BEAT', C.muted, 'miss', 0.5);
    }
    mg.i++;
  };

  PlayScene.prototype.traceHit = function (index) {
    var mg = this.mg;
    if (index === mg.next) {
      mg.nodes[index].on = true;
      mg.next++;
      var n = mg.nodes[index];
      if (mg.clean) this.mgScore(n.x, n.y, mg.next === mg.nodes.length);
      else this.burstSparks(n.x, n.y, 6, C.cyan);
      this.mgFeedback(mg.next >= mg.nodes.length ? 'TRACE COMPLETE' : 'LINKED', C.mint, 'good', 0.7);
      if (mg.next >= mg.nodes.length) this.endMg(0.8);
    } else {
      mg.clean = false;
      this.mgFeedback('OUT OF ORDER', C.muted, 'miss', 0.5);
    }
  };

  PlayScene.prototype.decryptHit = function (index) {
    var mg = this.mg;
    if (mg.opts[index] === mg.key) {
      if (!mg.wrong) this.mgScore(63 + index * 88, 396, mg.round === mg.rounds - 1);
      else this.burstSparks(63 + index * 88, 396, 6, C.cyan);
      this.mgFeedback('LOCK ' + (mg.round + 1) + ' OPEN', C.mint, 'lock');
      mg.round++;
      if (mg.round >= mg.rounds) this.endMg(0.8);
      else this.rollDecrypt(mg);
    } else {
      mg.wrong = true;
      this.mgFeedback('NOT THAT ONE', C.muted, 'miss', 0.5);
    }
  };

  PlayScene.prototype.driftThrust = function (dir) {
    var mg = this.mg;
    if (!mg || mg.done) return;
    mg.diver.vx += dir * 74;
    mg.thrust = 0.22;
    mg.diver.frame = 1;
    sfx('thrust', 0.4, 0.9 + Math.random() * 0.25);
  };

  PlayScene.prototype.stepMg = function (dt) {
    var mg = this.mg, i;
    if (!mg) return;
    if (mg.fbT > 0) mg.fbT -= dt;
    mg.guard -= dt;
    if (mg.done) {
      mg.endT -= dt;
      if (mg.endT <= 0) this.finishMg();
      return;
    }
    if (mg.guard <= 0) { this.endMg(0.4); return; }
    if (mg.type === 'sync') {
      if (mg.i >= mg.beats) { this.endMg(0.7); return; }
      if (mg.active) {
        mg.p += dt / mg.travel;
        if (mg.p > 1 + WIN / 104) {
          mg.active = false; mg.gap = 0.42; mg.results.push(0); mg.i++;
          this.mgFeedback('MISSED', C.muted, 'miss', 0.5);
        }
        return;
      }
      mg.gap -= dt;
      if (mg.gap <= 0) { mg.active = true; mg.p = 0; }
      return;
    }
    if (mg.type === 'trace' || mg.type === 'decrypt') {
      mg.time -= dt;
      if (mg.time <= 0) this.endMg(0.5);
      return;
    }
    /* drift */
    mg.time -= dt;
    if (mg.thrust > 0) mg.thrust -= dt;
    else mg.diver.frame = mg.diver.brace > 0 ? 2 : 0;
    if (mg.diver.brace > 0) mg.diver.brace -= dt;
    mg.diver.vx *= (1 - clamp(1.9 * dt, 0, 0.4));
    mg.diver.x += mg.diver.vx * dt;
    if (mg.diver.x < 62) { mg.diver.x = 62; mg.diver.vx = Math.abs(mg.diver.vx) * 0.35; mg.diver.brace = 0.3; }
    if (mg.diver.x > 328) { mg.diver.x = 328; mg.diver.vx = -Math.abs(mg.diver.vx) * 0.35; mg.diver.brace = 0.3; }
    var remaining = 0;
    for (i = 0; i < mg.gates.length; i++) {
      var g = mg.gates[i];
      if (g.done) continue;
      remaining++;
      g.y += mg.speed * dt;
      if (g.y >= 430 && !g.hit) {
        g.hit = true; g.done = true;
        if (Math.abs(g.x - mg.diver.x) < 54) {
          this.mgScore(mg.diver.x, 430, Math.abs(g.x - mg.diver.x) < 18);
          this.mgFeedback('CLEAN PASS', C.mint, 'good', 0.8);
        } else {
          mg.diver.brace = 0.4;
          this.mgFeedback('WIDE', C.muted, 'miss', 0.45);
        }
      }
    }
    if (remaining === 0 || mg.time <= 0) this.endMg(0.8);
  };

  PlayScene.prototype.endMg = function (delay) {
    if (!this.mg || this.mg.done) return;
    this.mg.done = true;
    this.mg.endT = REDUCED ? Math.min(0.3, delay) : delay;
  };

  PlayScene.prototype.finishMg = function () {
    var mg = this.mg;
    if (!mg) return;
    this.mg = null;
    this.mgDone = true;
    this.phase = 'resolve';
    if (mg.points > 0) {
      this.burstHearts(195, 430, 4 + mg.points * 3);
      this.showChip(mg.name + '  +' + mg.points, C.rose, 1.4);
    } else this.showChip(mg.name + ' COMPLETE', C.muted, 1.2);
    this.resolveScene();
  };

  /* ============================================================ simulation */
  PlayScene.prototype.update = function (time, delta) {
    if (!this.scene.isActive()) return;
    if (!this.loaded) { this.stepBuild(); return; }
    this.readInput();
    if (kit && kit.paused) { this.render(); return; }
    var frame = kit ? kit.juice.frame() : { frozen: false, dx: 0, dy: 0 };
    this.shakeX = frame.dx || 0;
    this.shakeY = frame.dy || 0;
    if (frame.frozen) { this.render(); return; }
    var add = clamp(num(delta, 0) / 1000, 0, 0.25);
    this.accumulator += add;
    var steps = 0;
    while (this.accumulator >= STEP && steps < MAX_STEPS) {
      this.accumulator -= STEP;
      this.stepSim(STEP);
      this.visualTime += STEP;
      steps++;
    }
    if (steps >= MAX_STEPS && this.accumulator >= STEP) this.accumulator = 0;
    this.checkForces();
    this.probeTick = (this.probeTick || 0) + 1;
    if (this.probeTick % 5 === 0) this.syncProbe();
    this.render();
  };

  PlayScene.prototype.stepBuild = function () {
    var n = 0;
    while (this.buildQueue.length && n < 2) {
      var task = this.buildQueue.shift();
      try { task(); } catch (e) { /* a texture that fails still advances the load */ }
      this.buildDone++;
      n++;
    }
    if (kit) kit.loader.progress(clamp((this.buildDone + (this.audioReady ? 1 : 0)) / this.buildTotal, 0, 0.99));
    if (!this.buildQueue.length && this.audioReady) this.finishBuild();
  };

  PlayScene.prototype.stepSim = function (dt) {
    var i, p;
    if (this.chip) { this.chip.timer -= dt; if (this.chip.timer <= 0) this.chip = null; }
    if (this.coachTimer > 0) this.coachTimer -= dt;
    if (this.banner) { this.banner.timer -= dt; if (this.banner.timer <= 0) this.banner = null; }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.9);
    if (this.memNoteTimer > 0) this.memNoteTimer -= dt;
    if (this.portraitPop > 0) this.portraitPop = Math.max(0, this.portraitPop - dt * 3.6);
    this.blink -= dt;
    if (this.blink < -0.12) this.blink = 2.2 + Math.random() * 2.6;
    this.memPulse = (this.memPulse || 0) + dt;

    for (i = 0; i < this.hearts.length; i++) {
      p = this.hearts[i];
      if (p.t <= 0) continue;
      p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 22 * dt; p.vx *= 0.99;
    }
    for (i = 0; i < this.sparks.length; i++) {
      p = this.sparks[i];
      if (p.t <= 0) continue;
      p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93;
    }
    for (i = 0; i < this.rings.length; i++) {
      p = this.rings[i];
      if (p.t <= 0) continue;
      p.t -= dt;
    }
    for (i = 0; i < this.motes.length; i++) {
      p = this.motes[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y < 50) { p.y = 540; p.x = Math.random() * W; }
      if (p.x < -8) p.x = W + 8;
      if (p.x > W + 8) p.x = -8;
    }

    if (this.screen !== 'story' || !this.st) return;
    if (this.phase === 'text') {
      var full = this.lineFull();
      if (this.skip && profile.seen[this.seenKey()]) {
        this.typed = full;
        this.autoTimer += dt;
        if (this.autoTimer > 0.08) { this.advance(); }
        return;
      }
      if (this.typed < full) {
        var speed = SPEEDS[clamp(whole(profile.prefs.speed, 1), 0, 2)];
        this.typed = Math.min(full, this.typed + speed * dt);
        if (Math.floor(this.typed) % 3 === 0 && Math.floor(this.typed) !== this.lastTypeTick) {
          this.lastTypeTick = Math.floor(this.typed);
          sfx('type', 0.16, 0.92 + Math.random() * 0.2);
        }
        this.autoTimer = 0;
      } else if (this.auto) {
        this.autoTimer += dt;
        var hold = [0.7, 1.2, 1.9][clamp(whole(profile.prefs.autoDelay, 1), 0, 2)] + full * 0.019;
        if (this.autoTimer >= hold) this.advance();
      }
    } else if (this.phase === 'choice') {
      if (this.choiceTimer > 0) {
        this.choiceTimer -= dt;
        if (this.choiceTimer <= 0) {
          var s = this.curScene();
          this.showChip('TIME. QUIET ANSWER TAKEN.', C.muted, 1.4);
          this.pick(s.q.opts.length - 1);
        }
      }
    } else if (this.phase === 'mg') this.stepMg(dt);
  };

  /* ================================================================= input */
  PlayScene.prototype.zone = function (x, y, w, h, fn) { this.hitZones.push({ x: x, y: y, w: w, h: h, fn: fn }); };
  PlayScene.prototype.gamePoint = function (p) {
    var rect = this.game.canvas.getBoundingClientRect();
    return {
      x: (p.x - rect.left) / Math.max(1, rect.width) * W,
      y: (p.y - rect.top) / Math.max(1, rect.height) * H
    };
  };
  PlayScene.prototype.tapAt = function (x, y) {
    if (!this.everInteracted) {
      this.everInteracted = true;
      music(this.screen === 'title' ? MUSIC.drift : MUSIC.station);
    }
    for (var i = this.hitZones.length - 1; i >= 0; i--) {
      var z = this.hitZones[i];
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) { if (z.fn) z.fn(x, y); return; }
    }
  };
  PlayScene.prototype.readInput = function () {
    if (!kit) return;
    var self = this, edge;
    while (this.pointerEdges.length) {
      edge = this.pointerEdges.shift();
      if (!this.pointerSeen.has(edge.id)) {
        this.pointerSeen.set(edge.id, true);
        var ep = this.gamePoint(edge);
        this.tapAt(ep.x, ep.y);
      }
    }
    kit.input.pointers.forEach(function (p, id) {
      if (!self.pointerSeen.has(id)) {
        self.pointerSeen.set(id, true);
        var pt = self.gamePoint(p);
        self.tapAt(pt.x, pt.y);
      }
    });
    this.pointerSeen.forEach(function (v, id) {
      if (!kit.input.pointers.has(id)) self.pointerSeen.delete(id);
    });
    var codes = ['Space', 'Enter', 'Escape', 'KeyA', 'KeyS', 'KeyL', 'KeyG', 'KeyM', 'KeyR',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
    var i, code;
    /* queued window edges first: they survive presses shorter than one frame */
    while (this.keyQueue && this.keyQueue.length) {
      code = this.keyQueue.shift();
      if (codes.indexOf(code) >= 0) { keyEdges[code] = true; this.keyAction(code); }
    }
    for (i = 0; i < codes.length; i++) {
      var down = kit.input.keyDown(codes[i]);
      if (!down) keyEdges[codes[i]] = false;
    }
    if (this.mg && this.mg.type === 'drift' && !this.mg.done) {
      if (kit.input.keyDown('ArrowLeft')) this.mg.diver.vx -= 240 * STEP;
      if (kit.input.keyDown('ArrowRight')) this.mg.diver.vx += 240 * STEP;
    }
  };

  PlayScene.prototype.keyAction = function (code) {
    if (!this.everInteracted) {
      this.everInteracted = true;
      music(this.screen === 'title' ? MUSIC.drift : MUSIC.station);
    }
    var digit = code.indexOf('Digit') === 0 ? Number(code.slice(5)) - 1 : -1;
    if (this.screen === 'title') {
      if (code === 'ArrowDown') { this.menuIndex = (this.menuIndex + 1) % 4; sfx('ui', 0.5); }
      else if (code === 'ArrowUp') { this.menuIndex = (this.menuIndex + 3) % 4; sfx('ui', 0.5); }
      else if (code === 'Space' || code === 'Enter') this.titleAction(this.menuIndex);
      else if (digit >= 0 && digit < 4) this.titleAction(digit);
      return;
    }
    if (this.screen === 'routes') {
      if (code === 'Escape') { this.showTitle(); return; }
      if (code === 'ArrowDown') { this.menuIndex = (this.menuIndex + 1) % ROUTES.length; sfx('ui', 0.5); }
      else if (code === 'ArrowUp') { this.menuIndex = (this.menuIndex + ROUTES.length - 1) % ROUTES.length; sfx('ui', 0.5); }
      else if (code === 'Space' || code === 'Enter') this.startRoute(ROUTES[this.menuIndex].id);
      else if (digit >= 0 && digit < ROUTES.length) this.startRoute(ROUTES[digit].id);
      return;
    }
    if (this.screen === 'log') {
      if (code === 'Escape' || code === 'KeyL') { this.closeOverlay(); return; }
      if (code === 'ArrowDown') this.logTop = clamp(this.logTop + 1, 0, Math.max(0, this.backlog.length - 6));
      if (code === 'ArrowUp') this.logTop = clamp(this.logTop - 1, 0, Math.max(0, this.backlog.length - 6));
      return;
    }
    if (this.screen === 'saves') {
      if (code === 'Escape' || code === 'KeyS') { this.closeOverlay(); return; }
      if (digit >= 0 && digit < 3) this.slotAction(digit);
      return;
    }
    if (this.screen === 'gallery') {
      if (code === 'Escape' || code === 'KeyG') { this.closeOverlay(); return; }
      if (code === 'ArrowLeft' || code === 'ArrowRight') { this.galleryTab = this.galleryTab ? 0 : 1; sfx('ui', 0.5); }
      if (code === 'ArrowDown') this.logTop = clamp(this.logTop + 1, 0, 12);
      if (code === 'ArrowUp') this.logTop = clamp(this.logTop - 1, 0, 12);
      return;
    }
    if (this.screen === 'cgview') {
      if (code === 'Escape' || code === 'Space' || code === 'Enter') { this.screen = 'gallery'; this.setAllVisible(false); sfx('page', 0.5); }
      return;
    }
    if (this.screen === 'ending') {
      if (code === 'Space' || code === 'Enter') this.endingAdvance();
      else if (code === 'Escape') this.showTitle();
      return;
    }
    /* story */
    if (code === 'Escape') { if (kit) kit.openSettings(this.settingsRows()); return; }
    if (code === 'KeyL') { this.openLog(); return; }
    if (code === 'KeyS') { this.openSaves('save'); return; }
    if (code === 'KeyA') { this.toggleAuto(); return; }
    if (code === 'KeyR') { this.toggleSkip(); return; }
    if (code === 'KeyM' && this.memActive && !this.memTaken) { this.takeMemory(); return; }
    if (this.phase === 'choice') {
      var s = this.curScene();
      if (digit >= 0 && s && s.q && digit < s.q.opts.length) { this.pick(digit); return; }
      if (code === 'ArrowDown') { this.choiceFocus = (this.choiceFocus + 1) % s.q.opts.length; sfx('ui', 0.5); return; }
      if (code === 'ArrowUp') { this.choiceFocus = (this.choiceFocus + s.q.opts.length - 1) % s.q.opts.length; sfx('ui', 0.5); return; }
      if (code === 'Space' || code === 'Enter') { this.pick(this.choiceFocus); return; }
      return;
    }
    if (this.phase === 'mg') {
      var mg = this.mg;
      if (!mg) return;
      if (mg.type === 'sync' && (code === 'Space' || code === 'Enter')) this.syncTap();
      else if (mg.type === 'trace' && digit >= 0 && digit < mg.nodes.length) this.traceHit(digit);
      else if (mg.type === 'decrypt' && digit >= 0 && digit < 4) this.decryptHit(digit);
      return;
    }
    if (code === 'Space' || code === 'Enter') this.advance();
  };

  PlayScene.prototype.titleAction = function (index) {
    if (index === 0) {
      if (profile.auto && validSnapshot(profile.auto)) { this.loadSnapshot(profile.auto); return; }
      this.newStory();
      return;
    }
    if (index === 1) { this.newStory(); return; }
    if (index === 2) { this.openGallery(); return; }
    if (kit) kit.openSettings(this.settingsRows());
  };

  PlayScene.prototype.toggleAuto = function () {
    this.auto = !this.auto;
    if (this.auto) this.skip = false;
    profile.prefs.auto = this.auto;
    persist();
    sfx('ui', 0.6);
    this.showChip(this.auto ? 'AUTO ON' : 'AUTO OFF', C.cyan);
  };
  PlayScene.prototype.toggleSkip = function () {
    this.skip = !this.skip;
    if (this.skip) this.auto = false;
    sfx('ui', 0.6);
    this.showChip(this.skip ? 'SKIP READ ON' : 'SKIP OFF', C.violet);
  };
  PlayScene.prototype.openLog = function () {
    if (!this.backlog.length) { sfx('deny'); this.showChip('LOG EMPTY', C.muted); return; }
    this.returnScreen = this.screen;
    this.screen = 'log';
    this.logTop = Math.max(0, this.backlog.length - 6);
    this.setAllVisible(false);
    sfx('page');
  };
  PlayScene.prototype.openSaves = function (mode) {
    this.returnScreen = this.screen;
    this.saveMode = mode || 'save';
    this.screen = 'saves';
    this.setAllVisible(false);
    sfx('page');
  };
  PlayScene.prototype.openGallery = function () {
    this.returnScreen = this.screen;
    this.screen = 'gallery';
    this.galleryTab = 0;
    this.logTop = 0;
    this.setAllVisible(false);
    sfx('page');
  };
  PlayScene.prototype.closeOverlay = function () {
    this.screen = this.returnScreen === 'story' && this.st ? 'story' : this.returnScreen || 'title';
    if (this.screen !== 'story' && this.screen !== 'title') this.screen = 'title';
    this.setAllVisible(false);
    sfx('ui', 0.5);
    this.syncProbe();
  };
  PlayScene.prototype.slotAction = function (i) {
    if (this.saveMode === 'save') this.saveSlot(i);
    else if (this.loadSnapshot(profile.slots[i])) return;
  };
  PlayScene.prototype.jumpBack = function (index) {
    var e = this.backlog[index];
    if (!e || !sceneOf(e.sid)) { sfx('deny'); return; }
    this.st.aff = e.aff;
    try {
      this.st.flags = JSON.parse(e.flags);
      this.st.mems = JSON.parse(e.mems);
    } catch (err) { /* keep the live state if a log entry cannot be parsed */ }
    this.backlog.length = index;
    this.mgDone = false;
    this.choiceDone = false;
    this.screen = 'story';
    this.setAllVisible(false);
    this.enterScene(e.sid, e.li);
    this.typed = 0;
    sfx('page');
  };
  PlayScene.prototype.endingAdvance = function () {
    var pages = this.ending ? this.ending.data.text.length : 0;
    if (this.endPage < pages) { this.endPage++; sfx('tap', 0.5); return; }
    this.showTitle();
  };

  PlayScene.prototype.settingsRows = function () {
    var self = this;
    return [function (box, row) {
      row('Choice timers', function () { return profile.prefs.timers !== false; }, function (v) {
        profile.prefs.timers = v; persist();
      });
      row('Auto advance', function () { return !!profile.prefs.auto; }, function (v) {
        profile.prefs.auto = v; self.auto = v; persist();
      });
      var b = document.createElement('button');
      b.style.cssText = 'font:inherit;font-size:16px;color:#e8eef4;background:#1b2733;border:1px solid #2e3e4e;' +
        'border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);';
      function paint() { b.textContent = 'Text speed: ' + SPEED_NAMES[clamp(whole(profile.prefs.speed, 1), 0, 2)]; }
      b.addEventListener('click', function () {
        profile.prefs.speed = (clamp(whole(profile.prefs.speed, 1), 0, 2) + 1) % 3;
        persist(); paint();
      });
      paint();
      box.appendChild(b);
      var d = document.createElement('button');
      d.style.cssText = b.style.cssText;
      function paintD() { d.textContent = 'Auto pace: ' + ['Brisk', 'Normal', 'Slow'][clamp(whole(profile.prefs.autoDelay, 1), 0, 2)]; }
      d.addEventListener('click', function () {
        profile.prefs.autoDelay = (clamp(whole(profile.prefs.autoDelay, 1), 0, 2) + 1) % 3;
        persist(); paintD();
      });
      paintD();
      box.appendChild(d);
    }];
  };

  /* ================================================= force switches + probe */
  PlayScene.prototype.applyForce = function (mode, stage) {
    var m = String(mode || '').toLowerCase();
    if (m === 'title') { this.showTitle(); return; }
    if (m === 'routes' || m === 'select') {
      if (!this.st) this.st = { rid: null, sid: D.PROLOGUE, li: 0, aff: 0, flags: {}, mems: {}, ch: 0 };
      this.screen = 'routes'; this.menuIndex = 0; this.setAllVisible(false); this.syncProbe(); return;
    }
    if (m === 'gallery') { this.returnScreen = 'title'; this.openGallery(); return; }
    if (m === 'saves') { this.returnScreen = 'title'; this.openSaves('save'); return; }
    if (m === 'ending') {
      var end = stage ? endingById(String(stage)) : null;
      if (!end) end = ENDINGS.rell[2];
      var rid = end.id.split('_')[0];
      this.st = { rid: rid, sid: routeOf(rid) ? routeOf(rid).start : D.PROLOGUE, li: 0, aff: AFF_HIView(), flags: {}, mems: {}, ch: 5 };
      this.ending = { data: end, route: routeOf(rid), aff: this.st.aff, mems: D.MEM_TRUE, fresh: false };
      profile.endings[end.id] = 1; persist();
      this.endPage = 1; this.screen = 'ending'; this.setAllVisible(false); this.syncProbe();
      return;
    }
    if (m === 'log') { this.returnScreen = 'title'; this.screen = 'log'; this.setAllVisible(false); return; }
    /* story */
    var sid = stage ? String(stage) : D.PROLOGUE;
    var r = routeOf(sid);
    if (r) sid = r.start;
    if (!sceneOf(sid)) sid = D.PROLOGUE;
    var target = sceneOf(sid);
    this.st = {
      rid: target.r || null, sid: sid, li: 0, aff: target.r ? 12 : 0,
      flags: { cover: true, splice: true, go: true }, mems: {}, ch: target.ch
    };
    this.backlog.length = 0;
    this.mgDone = false; this.choiceDone = false;
    this.screen = 'story';
    this.setAllVisible(false);
    this.enterScene(sid, 0);
    music(MUSIC.station);
  };
  function AFF_HIView() { return D.AFF_HI; }

  PlayScene.prototype.checkForces = function () {
    if (!root.__oh) return;
    var fm = root.__oh.forceMode == null ? null : String(root.__oh.forceMode);
    var fs = root.__oh.forceStage == null ? null : String(root.__oh.forceStage);
    if (fm !== this.lastForceMode || fs !== this.lastForceStage) {
      this.lastForceMode = fm;
      this.lastForceStage = fs;
      if (fm) this.applyForce(fm, fs);
    }
  };

  PlayScene.prototype.syncProbe = function () {
    if (!root.__oh) root.__oh = {};
    var st = this.st;
    var rid = st ? st.rid : null;
    var order = ROUTE_ORDER[rid || 'prologue'] || [];
    var idx = st ? order.indexOf(st.sid) : -1;
    var r = rid ? routeOf(rid) : null;
    var mems = 0, k;
    if (st) for (k in st.mems) if (st.mems[k]) mems++;
    var endings = 0;
    for (k in profile.endings) if (profile.endings[k]) endings++;
    var out = {
      mode: this.screen,
      phase: this.phase,
      stage: st ? st.sid : D.PROLOGUE,
      route: rid,
      chapter: st ? st.ch : 0,
      progress: order.length ? clamp((idx + 1) / order.length, 0, 1) : 0,
      score: st ? st.aff : 0,
      health: r ? clamp((st.aff / r.max) * 100, 0, 100) : 0,
      affinityMax: r ? r.max : D.AFF_MAX,
      memories: mems,
      memoriesTotal: MEM_LIST.length,
      endings: endings,
      endingsTotal: 9,
      minigame: this.mg ? this.mg.type : null,
      ending: this.ending ? this.ending.data.id : null,
      loaded: !!this.loaded,
      forceMode: root.__oh.forceMode == null ? null : root.__oh.forceMode,
      forceStage: root.__oh.forceStage == null ? null : root.__oh.forceStage
    };
    root.__oh.state = out;
  };

  PlayScene.prototype.seedMotes = function (locId) {
    var loc = localeOf(locId), i, count = REDUCED ? 8 : 20;
    this.motes.length = 0;
    for (i = 0; i < count; i++) {
      this.motes.push({
        x: Math.random() * W, y: 60 + Math.random() * 470,
        vx: (Math.random() - 0.5) * 9, vy: -4 - Math.random() * 12,
        t: 1, life: 1, s: 0.3 + Math.random() * 0.7, color: loc.glow, rot: 0
      });
    }
  };

  /* ================================================================ render */
  var TOD = {
    day: { color: '#ffe9c4', alpha: 0.07, far: 1, tintCol: null },
    dusk: { color: '#ff9ec4', alpha: 0.13, far: 0.92, tintCol: '#ffb27f' },
    night: { color: '#3b5ea8', alpha: 0.2, far: 0.78, tintCol: '#7fa8ff' }
  };

  PlayScene.prototype.render = function () {
    this.hitZones.length = 0;
    if (this.screen !== this._rScreen || this.phase !== this._rPhase) {
      this.setAllVisible(false);
      this._rScreen = this.screen;
      this._rPhase = this.phase;
    }
    this.memZoneOn = false;
    if (this.screen === 'story') this.renderStory();
    else if (this.screen === 'title') this.renderTitle();
    else if (this.screen === 'routes') this.renderRoutes();
    else if (this.screen === 'log') this.renderLog();
    else if (this.screen === 'saves') this.renderSaves();
    else if (this.screen === 'gallery') this.renderGallery();
    else if (this.screen === 'cgview') this.renderCg();
    else if (this.screen === 'ending') this.renderEnding();
    /* the fragment claim is registered last so it wins the reverse hit scan
     * against the advance zone and any interactive scene zone under it */
    if (this.screen === 'story' && this.memZoneOn) {
      var self = this;
      this.zone(this.memX - 30, this.memY - 30, 60, 60, function () { self.takeMemory(); });
    }
    this.renderParticles();
    this.renderChipBanner();
  };

  PlayScene.prototype.renderScenery = function (locId, tod, dim) {
    var u = this.ui, loc = localeOf(locId), t = TOD[tod] || TOD.day;
    var sway = Math.sin(this.visualTime * 0.24) * 6;
    var sx = this.shakeX || 0, sy = this.shakeY || 0;
    setTextureIfChanged(u.far, 'oh-far-' + locId);
    setTextureIfChanged(u.mid, 'oh-mid-' + locId);
    setTextureIfChanged(u.near, 'oh-near-' + locId);
    u.far.setPosition(195 + sway * 0.35 + sx * 0.4, 286 + sy * 0.3);
    u.mid.setPosition(195 + sway + sx * 0.7, 296 + sy * 0.6);
    u.near.setPosition(195 + sway * 2.1 + sx, 500 + sy);
    alphaOf(u.far, dim ? 0.55 : t.far);
    alphaOf(u.mid, dim ? 0.5 : 0.98);
    alphaOf(u.near, dim ? 0.5 : 1);
    visible(u.far, true); visible(u.mid, true); visible(u.near, true);
    setFillIfChanged(u.light, t.color, t.alpha);
    visible(u.light, true);
    visible(u.vig, true);
    alphaOf(u.vig, 0.85);
  };

  PlayScene.prototype.speakerOf = function (line) {
    var who = line ? line[0] : null;
    if (who && who !== 'n' && who !== 'you' && charOf(who)) return who;
    if (this.lastSpeaker && charOf(this.lastSpeaker)) return this.lastSpeaker;
    var s = this.curScene();
    if (s && s.r) return s.r;
    return 'nel';
  };

  PlayScene.prototype.renderPortrait = function (line, dim) {
    var u = this.ui;
    var who = this.speakerOf(line);
    if (!who) { visible(u.portrait, false); visible(u.portraitShadow, false); return; }
    var speaking = !!(line && line[0] === who);
    if (speaking) {
      this.lastSpeaker = who;
      if (line[2]) this.exprOf = this.exprOf || {};
      if (line[2]) { if (this.exprOf[who] !== line[2]) { this.exprOf[who] = line[2]; } }
    }
    this.exprOf = this.exprOf || {};
    var expr = this.exprOf[who] || 'neutral';
    var ch = charOf(who);
    var key = 'oh-por-' + who + '-' + expr;
    if (!this.textures.exists(key)) key = 'oh-por-' + who + '-neutral';
    setTextureIfChanged(u.portrait, key);
    var bob = Math.sin(this.visualTime * 1.5) * 4;
    var talk = speaking && this.typed < this.lineFull() ? Math.sin(this.visualTime * 17) * 2.2 : 0;
    var pop = 1 + (this.portraitPop > 0 ? easeBack(1 - this.portraitPop) * 0.06 : 0);
    var squash = this.blink < 0 ? 0.985 : 1;
    u.portrait.setDisplaySize(232 * pop, 325 * pop * squash);
    u.portrait.setPosition(195 + (this.shakeX || 0) * 1.2 + talk * 0.4, 352 + bob + talk + (this.shakeY || 0));
    alphaOf(u.portrait, dim ? 0.62 : speaking ? 1 : 0.92);
    visible(u.portrait, true);
    u.spot.setPosition(195, 356 + bob * 0.4).setDisplaySize(360, 560);
    alphaOf(u.spot, dim ? 0.34 : 0.26);
    visible(u.spot, true);
    u.portraitShadow.setPosition(195, 516 + bob * 0.3);
    u.portraitShadow.setDisplaySize(206 - bob, 32);
    alphaOf(u.portraitShadow, dim ? 0.16 : 0.3);
    visible(u.portraitShadow, true);
    return ch;
  };

  PlayScene.prototype.renderHud = function () {
    var u = this.ui, s = this.curScene(), r = this.st && this.st.rid ? routeOf(this.st.rid) : null;
    var self = this;
    visible(u.hudChip, true); visible(u.hudChapter, true);
    var loc = localeOf(s ? s.loc : 'core');
    var chapterLabel = (this.st && this.st.ch ? 'CH ' + this.st.ch + '  ' : 'PROLOGUE  ') + loc.name.toUpperCase();
    setTextIfChanged(u.hudChapter, chapterLabel.length > 19 ? chapterLabel.slice(0, 18) : chapterLabel, C.muted);
    if (r) {
      var f = clamp(this.st.aff / r.max, 0, 1);
      visible(u.affIcon, true); visible(u.affBarBg, true); visible(u.affBar, true);
      u.affBar.setDisplaySize(Math.max(4, 92 * f), 10);
      setFillIfChanged(u.affBar, this.st.aff >= r.hi ? C.gold : this.st.aff >= r.mid ? C.rose : C.violet);
      var mems = 0, k;
      for (k in this.st.mems) if (this.st.mems[k]) mems++;
      visible(u.memIcon, true); visible(u.memText, true);
      setTextIfChanged(u.memText, mems + '/6', C.gold);
    }
    visible(u.menuBtn, true); visible(u.menuIcon, true);
    setTextIfChanged(u.menuIcon, '⚙', C.ink);
    this.zone(340, 20, 46, 46, function () { if (kit) kit.openSettings(self.settingsRows()); });
    if (this.coachTimer > 0) {
      visible(u.coachBg, true); visible(u.coach, true);
      var a = clamp(this.coachTimer / 1.6, 0, 1);
      alphaOf(u.coachBg, 0.5 * a); alphaOf(u.coach, clamp(a, 0.12, 0.95));
      setTextIfChanged(u.coach, this.coach, C.muted);
    }
  };

  PlayScene.prototype.renderStory = function () {
    var u = this.ui, self = this, s = this.curScene();
    if (!s) { this.showTitle(); return; }
    var line = this.phase === 'text' ? this.curLine() : null;
    this.renderScenery(s.loc, s.tod, false);
    this.renderPortrait(line, this.phase === 'mg');
    this.renderHud();

    /* memory glimmer, a corner element that never blocks the read */
    if (this.memActive && s.mem && this.st.li >= (this.memAt || 0)) {
      this.memX = 344; this.memY = 452;
      var pulse = 1 + Math.sin(this.memPulse * 3.4) * 0.12;
      u.memGlow.setPosition(this.memX, this.memY).setDisplaySize(40 * pulse, 40 * pulse);
      alphaOf(u.memGlow, 0.75 + Math.sin(this.memPulse * 3.4) * 0.2);
      visible(u.memGlow, true);
      this.memZoneOn = true;
    } else { visible(u.memGlow, false); this.memZoneOn = false; }

    if (this.phase === 'mg') { this.renderContextPanel(); this.renderMg(); return; }
    if (this.phase === 'choice') { this.renderChoice(s); return; }

    /* dialogue */
    visible(u.panel, true);
    alphaOf(u.panel, 1);
    alphaOf(u.body, 1);
    var who = line ? line[0] : '';
    var ch = charOf(who);
    var narration = !ch;
    visible(u.plate, !narration); visible(u.name, !narration);
    if (ch) {
      u.plate.setDisplaySize(Math.max(96, ch.short.length * 11 + 44), 32);
      u.plate.setTint(tint(ch.color));
      setTextIfChanged(u.name, ch.short.toUpperCase(), '#0a0f1c');
      u.name.setPosition(28 + Math.max(96, ch.short.length * 11 + 44) / 2, 557);
    } else if (who === 'you') {
      visible(u.plate, true); visible(u.name, true);
      u.plate.setDisplaySize(96, 32); u.plate.setTint(tint(C.violet));
      setTextIfChanged(u.name, 'YOU', '#0a0f1c');
      u.name.setPosition(76, 557);
    }
    visible(u.body, true);
    u.body.setPosition(34, ch || who === 'you' ? 616 : 592);
    var shown = line ? line[1].slice(0, Math.floor(this.typed)) : '';
    setTextIfChanged(u.body, shown, narration && who !== 'you' ? C.muted : C.ink);
    var complete = line && this.typed >= this.lineFull();
    visible(u.caret, !!complete);
    if (complete) {
      setTextIfChanged(u.caret, this.auto ? 'AUTO' : this.skip ? 'SKIP' : '▼', this.auto ? C.cyan : this.skip ? C.violet : C.rose);
      alphaOf(u.caret, 0.55 + Math.sin(this.visualTime * 5) * 0.4);
    }
    this.zone(0, 96, W, 690, function () { self.advance(); });

    /* control row: icons over labels, 44px targets, out of the reading area */
    var labels = ['LOG', this.auto ? 'AUTO' : 'AUTO', this.skip ? 'SKIP' : 'SKIP', 'SAVE'];
    var colors = [C.muted, this.auto ? C.cyan : C.muted, this.skip ? C.violet : C.muted, C.muted];
    var acts = [
      function () { self.openLog(); },
      function () { self.toggleAuto(); },
      function () { self.toggleSkip(); },
      function () { self.openSaves('save'); }
    ];
    for (var i = 0; i < 4; i++) {
      visible(u.ctl[i], true); visible(u.ctlText[i], true);
      setTextureIfChanged(u.ctl[i], (i === 1 && this.auto) || (i === 2 && this.skip) ? 'oh-btn-hot' : 'oh-btn');
      setTextIfChanged(u.ctlText[i], labels[i], colors[i]);
      this.zone(14 + i * 92, 792, 86, 46, acts[i]);
    }

    /* memory note, a compact card at a run boundary rather than a banner */
    if (this.memNoteTimer > 0 && this.memNote) {
      visible(u.prompt, true);
      alphaOf(u.prompt, clamp(this.memNoteTimer / 1.2, 0, 1));
      setTextIfChanged(u.prompt, this.memNote.text, C.gold);
      u.prompt.setPosition(195, 500);
    } else if (this.phase === 'text') visible(u.prompt, false);
  };

  /* During an interactive scene the dialogue frame stays put and holds the last
   * spoken line, so the reading frame never jumps and the lower third is never
   * an empty void. */
  PlayScene.prototype.renderContextPanel = function () {
    var u = this.ui, last = this.backlog[this.backlog.length - 1];
    visible(u.panel, true);
    alphaOf(u.panel, 0.86);
    var ch = last ? charOf(last.who) : null;
    visible(u.plate, !!ch); visible(u.name, !!ch);
    if (ch) {
      u.plate.setDisplaySize(Math.max(96, ch.short.length * 11 + 44), 32);
      u.plate.setTint(tint(ch.color));
      setTextIfChanged(u.name, ch.short.toUpperCase(), '#0a0f1c');
      u.name.setPosition(28 + Math.max(96, ch.short.length * 11 + 44) / 2, 557);
    }
    visible(u.body, true);
    alphaOf(u.body, 0.72);
    setTextIfChanged(u.body, last ? last.text : '', C.muted);
    visible(u.caret, false);
    for (var i = 0; i < 4; i++) { visible(u.ctl[i], false); visible(u.ctlText[i], false); }
  };

  PlayScene.prototype.renderChoice = function (s) {
    var u = this.ui, self = this, i;
    visible(u.prompt, true);
    u.prompt.setPosition(195, 552);
    setTextIfChanged(u.prompt, s.q.prompt || '', C.violet);
    alphaOf(u.prompt, 1);
    var limit = this.choiceLimit(s);
    if (limit > 0) {
      visible(u.timerBg, true); visible(u.timerBar, true);
      var f = clamp(this.choiceTimer / limit, 0, 1);
      u.timerBar.setDisplaySize(Math.max(2, 342 * f), 6);
      setFillIfChanged(u.timerBar, f < 0.25 ? C.rose : C.gold);
    }
    for (i = 0; i < 3; i++) {
      var opt = s.q.opts[i];
      visible(u.opt[i], !!opt); visible(u.optText[i], !!opt); visible(u.optNum[i], !!opt);
      if (!opt) continue;
      var hot = this.choiceFocus === i;
      setTextureIfChanged(u.opt[i], hot ? 'oh-btn-hot' : 'oh-btn');
      setTextIfChanged(u.optText[i], opt.t, C.ink);
      setTextIfChanged(u.optNum[i], String(i + 1), hot ? C.rose : C.dim);
      this.zone(14, 600 + i * 72, 362, 66, (function (n) {
        return function () { self.pick(n); };
      })(i));
    }
  };

  PlayScene.prototype.renderMg = function () {
    var u = this.ui, mg = this.mg, self = this, i;
    if (!mg) return;
    visible(u.mgTitle, true); visible(u.mgHint, true);
    setTextIfChanged(u.mgTitle, mg.name, C.gold);
    setTextIfChanged(u.mgHint, mg.hint, C.muted);
    for (i = 0; i < 6; i++) {
      var on = i < mg.cap;
      visible(u.pips[i], on);
      if (!on) continue;
      u.pips[i].setPosition(163 + i * 22, 158).setDisplaySize(12, 12);
      u.pips[i].setTint(tint(i < mg.points ? C.rose : '#2c3f62'));
    }
    if (mg.fbT > 0) {
      visible(u.mgFeed, true);
      setTextIfChanged(u.mgFeed, mg.fb, mg.fbColor || C.ink);
      alphaOf(u.mgFeed, clamp(mg.fbT / 0.5, 0, 1));
      u.mgFeed.setPosition(195, 496 - (0.7 - mg.fbT) * 16);
    } else visible(u.mgFeed, false);

    if (mg.type === 'sync') {
      visible(u.track, true); visible(u.target, true); visible(u.beat, true);
      u.track.setPosition(195, 400);
      u.target.setPosition(195, 400);
      var r = mg.active ? 150 - 104 * mg.p : 150;
      u.beat.setPosition(195 + (r - TR) * BEAT_SCALE, 400);
      alphaOf(u.beat, mg.active ? 1 : 0.3);
      this.zone(0, 176, W, 372, function () { self.syncTap(); });
      return;
    }
    if (mg.type === 'trace') {
      for (i = 0; i < 7; i++) {
        var node = mg.nodes[i];
        visible(u.nodes[i], !!node); visible(u.nodeText[i], !!node);
        if (!node) continue;
        setTextureIfChanged(u.nodes[i], node.on ? 'oh-node-on' : 'oh-node');
        var sc = node.on ? 62 : i === mg.next ? 58 + Math.sin(this.visualTime * 4) * 4 : 52;
        u.nodes[i].setPosition(node.x, node.y).setDisplaySize(sc, sc);
        u.nodes[i].setTint(tint(node.on ? C.gold : i === mg.next ? C.rose : C.muted));
        alphaOf(u.nodes[i], node.on ? 1 : i === mg.next ? 1 : 0.6);
        u.nodeText[i].setPosition(node.x, node.y);
        setTextIfChanged(u.nodeText[i], String(i + 1), node.on ? '#20180a' : C.ink);
        this.zone(node.x - 32, node.y - 32, 64, 64, (function (n) {
          return function () { self.traceHit(n); };
        })(i));
      }
      for (i = 0; i < 6; i++) {
        var a = mg.nodes[i], b = mg.nodes[i + 1];
        var lit = !!(a && b && a.on && b.on);
        visible(u.links[i], lit);
        if (!lit) continue;
        var dx = b.x - a.x, dy = b.y - a.y;
        u.links[i].setPosition((a.x + b.x) / 2, (a.y + b.y) / 2);
        u.links[i].setDisplaySize(Math.sqrt(dx * dx + dy * dy), 3);
        u.links[i].setRotation(Math.atan2(dy, dx));
      }
      return;
    }
    if (mg.type === 'decrypt') {
      visible(u.keyGlyph, true); visible(u.keyLabel, true);
      setTextureIfChanged(u.keyGlyph, 'oh-glyph-' + mg.key);
      u.keyGlyph.setPosition(195, 262);
      u.keyGlyph.setTint(tint(C.gold));
      var pulse = 1 + Math.sin(this.visualTime * 3) * 0.04;
      u.keyGlyph.setDisplaySize(104 * pulse, 104 * pulse);
      setTextIfChanged(u.keyLabel, 'KEY ' + (mg.round + 1) + ' OF ' + mg.rounds, C.muted);
      for (i = 0; i < 4; i++) {
        visible(u.glyphBg[i], true); visible(u.glyphs[i], true); visible(u.glyphNum[i], true);
        setTextureIfChanged(u.glyphs[i], 'oh-glyph-' + mg.opts[i]);
        u.glyphs[i].setTint(tint(C.ink));
        setTextIfChanged(u.glyphNum[i], String(i + 1), C.dim);
        this.zone(24 + i * 88, 356, 78, 96, (function (n) {
          return function () { self.decryptHit(n); };
        })(i));
      }
      return;
    }
    /* drift */
    visible(u.lane, true);
    u.lane.setPosition(195, 360).setDisplaySize(288, 368);
    for (i = 0; i < 5; i++) {
      var g = mg.gates[i];
      visible(u.gates[i], !!g && !g.done && g.y > 90);
      if (!g || g.done || g.y <= 90) continue;
      setTextureIfChanged(u.gates[i], 'oh-gate');
      u.gates[i].setPosition(g.x, g.y).setDisplaySize(130, 36);
    }
    visible(u.diver, true);
    setTextureIfChanged(u.diver, 'oh-diver-' + mg.diver.frame);
    u.diver.setPosition(mg.diver.x, 430).setDisplaySize(54, 64);
    u.diver.setRotation(clamp(mg.diver.vx / 420, -0.4, 0.4));
    this.zone(0, 176, 195, 372, function () { self.driftThrust(-1); });
    this.zone(195, 176, 195, 372, function () { self.driftThrust(1); });
  };

  PlayScene.prototype.renderParticles = function () {
    var u = this.ui, i, p, n;
    for (i = 0; i < u.motes.length; i++) {
      p = this.motes[i];
      visible(u.motes[i], !!p && this.screen === 'story');
      if (!p || this.screen !== 'story') continue;
      u.motes[i].setPosition(p.x, p.y).setDisplaySize(9 * p.s, 9 * p.s);
      u.motes[i].setTint(tint(p.color));
      alphaOf(u.motes[i], 0.16 + p.s * 0.3);
    }
    for (i = 0; i < u.hearts.length; i++) {
      p = this.hearts[i];
      n = u.hearts[i];
      visible(n, !!(p && p.t > 0));
      if (!p || p.t <= 0) continue;
      var f = clamp(p.t / p.life, 0, 1);
      n.setPosition(p.x, p.y).setDisplaySize(24 * p.s * (0.6 + f * 0.6), 24 * p.s * (0.6 + f * 0.6));
      n.setRotation(p.rot * (1 - f));
      alphaOf(n, f);
    }
    for (i = 0; i < u.sparks.length; i++) {
      p = this.sparks[i];
      n = u.sparks[i];
      visible(n, !!(p && p.t > 0));
      if (!p || p.t <= 0) continue;
      var sf = clamp(p.t / p.life, 0, 1);
      n.setPosition(p.x, p.y).setDisplaySize(16 * p.s * sf + 3, 16 * p.s * sf + 3);
      n.setTint(tint(p.color));
      n.setRotation(p.rot);
      alphaOf(n, sf);
    }
    for (i = 0; i < u.rings.length; i++) {
      p = this.rings[i];
      n = u.rings[i];
      visible(n, !!(p && p.t > 0));
      if (!p || p.t <= 0) continue;
      var rf = 1 - clamp(p.t / p.life, 0, 1);
      n.setPosition(p.x, p.y).setDisplaySize(30 + rf * 150, 30 + rf * 150);
      n.setTint(tint(p.color));
      alphaOf(n, (1 - rf) * 0.8);
    }
    if (this.flash > 0.003) {
      visible(u.flash, true);
      setFillIfChanged(u.flash, this.flashColor, clamp(this.flash, 0, 0.5));
      alphaOf(u.flash, clamp(this.flash, 0, 0.5));
    } else visible(u.flash, false);
  };

  PlayScene.prototype.renderChipBanner = function () {
    var u = this.ui;
    if (this.chip) {
      visible(u.chipBg, true); visible(u.chipText, true);
      var w = Math.max(96, this.chip.text.length * 8 + 26);
      var a = clamp(this.chip.timer / 0.3, 0, 1);
      u.chipBg.setPosition(W - w - 12, 96).setDisplaySize(w, 34);
      u.chipBg.setTint(tint(this.chip.color));
      alphaOf(u.chipBg, 0.9 * a);
      u.chipText.setPosition(W - w - 1, 104);
      setTextIfChanged(u.chipText, this.chip.text, this.chip.color);
      alphaOf(u.chipText, a);
    } else { visible(u.chipBg, false); visible(u.chipText, false); }

    if (this.banner) {
      visible(u.bannerBg, true); visible(u.bannerTitle, true); visible(u.bannerText, true);
      var t = 1 - clamp(this.banner.timer / this.banner.life, 0, 1);
      var scale = REDUCED ? 1 : clamp(0.86 + easeBack(clamp(t * 3.2, 0, 1)) * 0.14, 0.86, 1.05);
      var fade = clamp(this.banner.timer / 0.4, 0, 1);
      u.bannerBg.setDisplaySize(236 * scale, 118 * scale);
      u.bannerBg.setPosition(195, 380);
      u.bannerBg.setTint(tint(C.panel2));
      alphaOf(u.bannerBg, 0.97 * fade);
      setTextIfChanged(u.bannerTitle, this.banner.title, C.ink);
      setTextIfChanged(u.bannerText, this.banner.text, C.gold);
      u.bannerTitle.setScale(scale); u.bannerText.setScale(scale);
      alphaOf(u.bannerTitle, fade); alphaOf(u.bannerText, fade);
    } else { visible(u.bannerBg, false); visible(u.bannerTitle, false); visible(u.bannerText, false); }
  };

  /* --------------------------------------------------------- menu screens */
  PlayScene.prototype.row = function (i, x, y, w, h, title, meta, right, color, action) {
    var u = this.ui, r = u.rows[i];
    if (!r) return;
    visible(r.bg, true); visible(r.title, true); visible(r.meta, true); visible(r.right, true);
    setTextureIfChanged(r.bg, action === null ? 'oh-btn' : 'oh-btn');
    r.bg.setPosition(x, y).setDisplaySize(w, h);
    r.bg.setTint(tint(color || C.panel2));
    r.title.setPosition(x + 20, y + 12);
    setTextIfChanged(r.title, title, C.ink);
    r.meta.setPosition(x + 20, y + 36);
    setTextIfChanged(r.meta, meta, C.muted);
    r.right.setPosition(x + w - 16, y + 14);
    setTextIfChanged(r.right, right || '', color || C.cyan);
    if (action) this.zone(x, y, w, h, action);
    return r;
  };

  PlayScene.prototype.renderTitle = function () {
    var u = this.ui, self = this, i;
    this.renderScenery('orbit', 'night', true);
    visible(u.shade, true);
    setFillIfChanged(u.shade, C.deep, 0.6);
    alphaOf(u.shade, 0.6);
    visible(u.oTitle, true); visible(u.oAccent, true); visible(u.oSub, true); visible(u.oFoot, true);
    u.oTitle.setPosition(195, 84); setTextIfChanged(u.oTitle, 'ORBIT', C.ink);
    u.oAccent.setPosition(195, 122); setTextIfChanged(u.oAccent, 'HEARTS', C.rose);
    u.oSub.setPosition(195, 156);
    setTextIfChanged(u.oSub, 'A station romance in three routes. Vireo turns, you write it down.', C.muted);

    /* constellation of found endings */
    var found = 0;
    for (i = 0; i < 9; i++) {
      var rid = ROUTES[Math.floor(i / 3)].id;
      var end = ENDINGS[rid][i % 3];
      var got = !!profile.endings[end.id];
      if (got) found++;
      var col = 26 + (i % 3) * 116;
      var rowY = 214 + Math.floor(i / 3) * 46;
      visible(u.stars[i], true); visible(u.starLabel[i], true);
      setTextureIfChanged(u.stars[i], got ? 'oh-star-on' : 'oh-star-off');
      u.stars[i].setPosition(col + 58, rowY).setDisplaySize(got ? 28 : 22, got ? 28 : 22);
      u.stars[i].setTint(tint(got ? (end.tier === 'true' ? C.gold : ROUTES[Math.floor(i / 3)].color) : '#6f7ea6'));
      alphaOf(u.stars[i], got ? 1 : 0.75);
      u.starLabel[i].setPosition(col + 58, rowY + 16);
      setTextIfChanged(u.starLabel[i], got ? end.title : 'unfound', got ? C.muted : C.dim);
    }
    var hasSave = profile.auto && validSnapshot(profile.auto);
    var labels = [
      hasSave ? 'CONTINUE' : 'BEGIN',
      'NEW STORY',
      'GALLERY',
      'SETTINGS'
    ];
    var metas = [
      hasSave ? routeOf(profile.auto.rid).name + ', chapter ' + profile.auto.ch : 'Prologue and route select',
      'Start again from the prologue',
      'Scenes and memory fragments',
      'Sound, motion, text speed, timers'
    ];
    var rights = [
      found + '/9 endings',
      profile.runs ? 'run ' + (profile.runs + 1) : 'first run',
      Object.keys(profile.gallery).length + '/' + CG_LIST.length,
      ''
    ];
    for (i = 0; i < 4; i++) {
      this.row(i, 16, 372 + i * 82, 358, 70, labels[i], metas[i], rights[i],
        this.menuIndex === i ? C.rose : C.panel2, (function (n) {
          return function () { self.menuIndex = n; self.titleAction(n); };
        })(i));
      visible(u.rows[i].art, false);
    }
    u.oFoot.setPosition(195, 726);
    setTextIfChanged(u.oFoot,
      'Tap a row. Keyboard: arrows and space, L log, S saves, A auto, R skip.\nNo energy, no timers, no purchases. Every route is open.', C.dim);
  };

  PlayScene.prototype.renderRoutes = function () {
    var u = this.ui, self = this, i;
    var pick = ROUTES[clamp(this.menuIndex, 0, ROUTES.length - 1)];
    this.renderScenery(pick.loc, 'dusk', true);
    visible(u.shade, true);
    setFillIfChanged(u.shade, C.deep, 0.72);
    alphaOf(u.shade, 0.72);
    visible(u.oTitle, true); visible(u.oSub, true); visible(u.oFoot, true);
    u.oTitle.setPosition(195, 40); setTextIfChanged(u.oTitle, 'THREE NAMES', C.ink);
    u.oSub.setPosition(195, 82);
    setTextIfChanged(u.oSub, 'Pick who the record follows. You can come back and start again.', C.muted);
    for (i = 0; i < ROUTES.length; i++) {
      var r = ROUTES[i];
      var y = 126 + i * 176;
      var stars = 0, k;
      for (k = 0; k < 3; k++) if (profile.endings[ENDINGS[r.id][k].id]) stars++;
      var mems = 0, pool = memsOfRoute(r.id);
      for (k = 0; k < pool.length; k++) if (profile.mems[pool[k].id]) mems++;
      var row = this.row(i, 16, y, 358, 160, r.name, r.role + '\n' + r.blurb,
        stars + '/3 endings', this.menuIndex === i ? r.color : C.panel2,
        (function (n) {
          return function () {
            if (self.menuIndex === n) self.startRoute(ROUTES[n].id);
            else { self.menuIndex = n; sfx('ui', 0.6); }
          };
        })(i));
      if (!row) continue;
      row.title.setPosition(136, y + 16);
      row.meta.setPosition(136, y + 44);
      row.meta.setWordWrapWidth(216);
      row.right.setPosition(358, y + 16);
      visible(row.art, true);
      setTextureIfChanged(row.art, 'oh-por-' + r.chr + '-warm');
      row.art.setPosition(72, y + 82).setDisplaySize(104, 146);
      var extra = 'best affinity ' + (profile.best[r.id] || 0) + ' of ' + r.max + '   |   fragments ' + mems + '/6';
      setTextIfChanged(row.right, stars + '/3 endings', r.color);
      if (u.rows[i + 3]) { visible(u.rows[i + 3].bg, false); }
      row.meta.setText(r.role + '\n' + r.blurb + '\n' + extra);
    }
    u.oFoot.setPosition(195, 668);
    setTextIfChanged(u.oFoot, 'Tap once to look, twice to begin. Keyboard: 1, 2, 3.', C.dim);
    this.backButton('BACK TO TITLE', function () { self.showTitle(); });
  };

  PlayScene.prototype.backButton = function (label, fn) {
    var u = this.ui;
    visible(u.back, true); visible(u.backText, true);
    setTextIfChanged(u.backText, label, C.ink);
    u.back.setPosition(115, 780).setDisplaySize(160, 48);
    u.back.setTint(tint(C.panel2));
    u.backText.setPosition(195, 794);
    this.zone(115, 778, 160, 52, fn);
  };

  PlayScene.prototype.renderLog = function () {
    var u = this.ui, self = this, i;
    visible(u.shade, true);
    setFillIfChanged(u.shade, '#060a14', 0.97);
    alphaOf(u.shade, 0.97);
    visible(u.oTitle, true); visible(u.oSub, true);
    u.oTitle.setPosition(195, 34); setTextIfChanged(u.oTitle, 'BACKLOG', C.ink);
    u.oSub.setPosition(195, 74);
    setTextIfChanged(u.oSub, 'Tap a line to jump back to it. Affinity and flags rewind with you.', C.muted);
    var maxTop = Math.max(0, this.backlog.length - 6);
    this.logTop = clamp(this.logTop, 0, maxTop);
    for (i = 0; i < 6; i++) {
      var e = this.backlog[this.logTop + i];
      if (!e) { visible(u.rows[i].bg, false); visible(u.rows[i].title, false); visible(u.rows[i].meta, false); visible(u.rows[i].right, false); continue; }
      var ch = charOf(e.who);
      var name = ch ? ch.short.toUpperCase() : e.who === 'you' ? 'YOU' : 'VIREO';
      var y = 106 + i * 102;
      var row = this.row(i, 16, y, 358, 92, name, e.text, '', ch ? ch.color : C.panel2,
        (function (n) { return function () { self.jumpBack(self.logTop + n); }; })(i));
      row.meta.setWordWrapWidth(318);
      row.meta.setPosition(36, y + 34);
      visible(row.art, false);
    }
    this.row(6, 16, 722, 170, 44, 'PREV', '', '', C.panel2, function () {
      self.logTop = clamp(self.logTop - 3, 0, maxTop); sfx('ui', 0.5);
    });
    u.rows[6].title.setPosition(74, 734); u.rows[6].meta.setText(''); visible(u.rows[6].art, false);
    this.row(7, 204, 722, 170, 44, 'NEXT', '', '', C.panel2, function () {
      self.logTop = clamp(self.logTop + 3, 0, maxTop); sfx('ui', 0.5);
    });
    u.rows[7].title.setPosition(262, 734); u.rows[7].meta.setText(''); visible(u.rows[7].art, false);
    this.backButton('CLOSE LOG', function () { self.closeOverlay(); });
  };

  PlayScene.prototype.renderSaves = function () {
    var u = this.ui, self = this, i;
    visible(u.shade, true);
    setFillIfChanged(u.shade, '#060a14', 0.97);
    alphaOf(u.shade, 0.97);
    visible(u.oTitle, true); visible(u.oSub, true); visible(u.oFoot, true);
    u.oTitle.setPosition(195, 34);
    setTextIfChanged(u.oTitle, this.saveMode === 'save' ? 'SAVE' : 'LOAD', C.ink);
    u.oSub.setPosition(195, 74);
    setTextIfChanged(u.oSub, 'Slots restore the exact line, affinity, flags and fragments.', C.muted);
    function describe(snap) {
      if (!validSnapshot(snap)) return 'Empty';
      var r = routeOf(snap.rid), s = sceneOf(snap.sid);
      var d = new Date(snap.t || Date.now());
      return r.name + ', chapter ' + snap.ch + '\n' + (s ? s.title : '') + '   |   affinity ' + snap.aff +
        '\n' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5);
    }
    var entries = [{ label: 'AUTOSAVE', snap: profile.auto, slot: -1 }];
    for (i = 0; i < 3; i++) entries.push({ label: 'SLOT ' + (i + 1), snap: profile.slots[i], slot: i });
    for (i = 0; i < entries.length; i++) {
      var e = entries[i];
      var y = 116 + i * 112;
      var can = e.slot >= 0 || validSnapshot(e.snap);
      var row = this.row(i, 16, y, 358, 100, e.label, describe(e.snap),
        e.slot < 0 ? 'LOAD' : (this.saveMode === 'save' ? 'SAVE' : 'LOAD'),
        validSnapshot(e.snap) ? C.cyan : C.panel2,
        (function (entry) {
          return function () {
            if (entry.slot < 0) { self.loadSnapshot(entry.snap); return; }
            self.slotAction(entry.slot);
          };
        })(e));
      row.meta.setWordWrapWidth(300);
      visible(row.art, false);
      if (!can) visible(row.right, false);
    }
    this.row(4, 16, 588, 170, 48, this.saveMode === 'save' ? 'MODE: SAVE' : 'SWITCH TO SAVE', '', '',
      this.saveMode === 'save' ? C.rose : C.panel2, function () { self.saveMode = 'save'; sfx('ui', 0.5); });
    u.rows[4].title.setPosition(36, 602); visible(u.rows[4].art, false);
    this.row(5, 204, 588, 170, 48, this.saveMode === 'load' ? 'MODE: LOAD' : 'SWITCH TO LOAD', '', '',
      this.saveMode === 'load' ? C.rose : C.panel2, function () { self.saveMode = 'load'; sfx('ui', 0.5); });
    u.rows[5].title.setPosition(224, 602); visible(u.rows[5].art, false);
    visible(u.rows[6].bg, false); visible(u.rows[7].bg, false);
    u.oFoot.setPosition(195, 668);
    setTextIfChanged(u.oFoot, 'Autosave writes at every scene. Keyboard: 1, 2, 3 pick a slot.', C.dim);
    this.backButton('CLOSE', function () { self.closeOverlay(); });
  };

  PlayScene.prototype.renderGallery = function () {
    var u = this.ui, self = this, i;
    visible(u.shade, true);
    setFillIfChanged(u.shade, '#060a14', 0.97);
    alphaOf(u.shade, 0.97);
    visible(u.oTitle, true); visible(u.oSub, true); visible(u.oFoot, true);
    u.oTitle.setPosition(195, 30); setTextIfChanged(u.oTitle, 'GALLERY', C.ink);
    var unlockedCg = 0, unlockedMem = 0;
    for (i = 0; i < CG_LIST.length; i++) if (profile.gallery[CG_LIST[i].id]) unlockedCg++;
    for (i = 0; i < MEM_LIST.length; i++) if (profile.mems[MEM_LIST[i].id]) unlockedMem++;
    u.oSub.setPosition(195, 70);
    setTextIfChanged(u.oSub, 'Scenes ' + unlockedCg + '/' + CG_LIST.length +
      '   |   Fragments ' + unlockedMem + '/' + MEM_LIST.length, C.muted);
    this.row(6, 16, 100, 170, 44, 'SCENES', '', '', this.galleryTab === 0 ? C.rose : C.panel2,
      function () { self.galleryTab = 0; self.logTop = 0; sfx('ui', 0.5); });
    u.rows[6].title.setPosition(60, 112); u.rows[6].meta.setText(''); visible(u.rows[6].art, false);
    this.row(7, 204, 100, 170, 44, 'FRAGMENTS', '', '', this.galleryTab === 1 ? C.rose : C.panel2,
      function () { self.galleryTab = 1; self.logTop = 0; sfx('ui', 0.5); });
    u.rows[7].title.setPosition(234, 112); u.rows[7].meta.setText(''); visible(u.rows[7].art, false);

    if (this.galleryTab === 0) {
      var pages = Math.ceil(CG_LIST.length / 6);
      this.logTop = clamp(this.logTop, 0, pages - 1);
      for (i = 0; i < 6; i++) {
        var item = CG_LIST[this.logTop * 6 + i];
        var tile = u.tiles[i];
        visible(tile.bg, !!item); visible(tile.art, !!item); visible(tile.label, !!item);
        if (!item) continue;
        var x = 20 + (i % 3) * 118, y = 164 + Math.floor(i / 3) * 156;
        var got = !!profile.gallery[item.id];
        tile.bg.setPosition(x, y).setDisplaySize(110, 144);
        tile.bg.setTint(tint(got ? C.panel2 : '#131a2a'));
        setTextureIfChanged(tile.art, 'oh-far-' + item.loc);
        tile.art.setPosition(x + 55, y + 52).setDisplaySize(98, 82);
        tile.art.setTint(tint(got ? '#ffffff' : '#1a2336'));
        alphaOf(tile.art, got ? 1 : 0.5);
        tile.label.setPosition(x + 55, y + 102);
        setTextIfChanged(tile.label, got ? item.name : 'LOCKED', got ? C.ink : C.dim);
        if (got) this.zone(x, y, 110, 144, (function (n) {
          return function () { self.galleryPick = n; self.screen = 'cgview'; self.setAllVisible(false); sfx('page'); };
        })(this.logTop * 6 + i));
      }
      for (i = 0; i < 6; i++) { visible(u.rows[i].bg, false); visible(u.rows[i].title, false); visible(u.rows[i].meta, false); visible(u.rows[i].right, false); visible(u.rows[i].art, false); }
      u.oFoot.setPosition(195, 500);
      setTextIfChanged(u.oFoot, 'Page ' + (this.logTop + 1) + ' of ' + pages, C.dim);
    } else {
      for (i = 0; i < 6; i++) visible(u.tiles[i].bg, false);
      for (i = 0; i < 6; i++) { visible(u.tiles[i].art, false); visible(u.tiles[i].label, false); }
      var mpages = Math.ceil(MEM_LIST.length / 5);
      this.logTop = clamp(this.logTop, 0, mpages - 1);
      for (i = 0; i < 5; i++) {
        var m = MEM_LIST[this.logTop * 5 + i];
        if (!m) { visible(u.rows[i].bg, false); visible(u.rows[i].title, false); visible(u.rows[i].meta, false); visible(u.rows[i].right, false); continue; }
        var mgot = !!profile.mems[m.id];
        var my = 162 + i * 110;
        var mrow = this.row(i, 16, my, 358, 98, mgot ? m.name : 'UNFOUND FRAGMENT',
          mgot ? m.text : 'Somewhere on Vireo, still waiting to be tapped.',
          m.route === 'prologue' ? 'PROLOGUE' : m.route.toUpperCase(), mgot ? C.gold : C.panel2, null);
        mrow.meta.setWordWrapWidth(310);
        visible(mrow.art, false);
        alphaOf(mrow.bg, mgot ? 1 : 0.6);
      }
      u.oFoot.setPosition(195, 686);
      setTextIfChanged(u.oFoot, 'Page ' + (this.logTop + 1) + ' of ' + mpages, C.dim);
    }
    var footY = this.galleryTab === 0 ? 540 : 712;
    for (i = 0; i < 2; i++) {
      visible(u.opt[i], true); visible(u.optText[i], true); visible(u.optNum[i], false);
      u.opt[i].setDepth(43).setPosition(16 + i * 188, footY).setDisplaySize(170, 48);
      setTextureIfChanged(u.opt[i], 'oh-btn');
      u.opt[i].setTint(tint(C.panel2));
      u.optText[i].setDepth(44).setPosition(16 + i * 188, footY + 14).setWordWrapWidth(170);
      u.optText[i].setAlign('center');
      setTextIfChanged(u.optText[i], i === 0 ? 'PREV' : 'NEXT', C.ink);
    }
    visible(u.opt[2], false); visible(u.optText[2], false);
    this.zone(16, footY, 170, 48, function () { self.logTop = Math.max(0, self.logTop - 1); sfx('ui', 0.5); });
    this.zone(204, footY, 170, 48, function () { self.logTop = self.logTop + 1; sfx('ui', 0.5); });
    this.backButton('CLOSE', function () { self.closeOverlay(); });
  };

  PlayScene.prototype.renderCg = function () {
    var u = this.ui, self = this;
    var item = CG_LIST[clamp(this.galleryPick, 0, CG_LIST.length - 1)];
    if (!item) { this.screen = 'gallery'; return; }
    var s = sceneOf(item.id);
    this.renderScenery(item.loc, item.tod, false);
    var who = s && s.r ? routeOf(s.r).chr : 'nel';
    setTextureIfChanged(u.portrait, 'oh-por-' + who + '-warm');
    u.portrait.setPosition(195, 352 + Math.sin(this.visualTime * 1.2) * 4).setDisplaySize(240, 336);
    alphaOf(u.portrait, 1);
    visible(u.portrait, true);
    visible(u.portraitShadow, true);
    u.portraitShadow.setPosition(195, 516).setDisplaySize(210, 32);
    visible(u.panel, true);
    visible(u.body, true);
    u.body.setPosition(34, 616);
    setTextIfChanged(u.body, item.name + '\n\n' + (s ? s.title : '') + '\n' + localeOf(item.loc).name +
      ', ' + item.tod, C.ink);
    visible(u.plate, true); visible(u.name, true);
    u.plate.setDisplaySize(140, 32); u.plate.setTint(tint(C.gold));
    u.name.setPosition(98, 557);
    setTextIfChanged(u.name, 'GALLERY', '#0a0f1c');
    this.backButton('BACK', function () { self.screen = 'gallery'; self.setAllVisible(false); sfx('ui', 0.5); });
    this.zone(0, 90, W, 460, function () { self.screen = 'gallery'; self.setAllVisible(false); });
  };

  PlayScene.prototype.renderEnding = function () {
    var u = this.ui, self = this, e = this.ending;
    if (!e) { this.showTitle(); return; }
    var d = e.data;
    this.renderScenery(d.loc, d.tod, true);
    visible(u.shade, true);
    setFillIfChanged(u.shade, C.deep, 0.74);
    alphaOf(u.shade, 0.74);
    var col = d.tier === 'true' ? C.gold : d.tier === 'steady' ? e.route.color : C.violet;
    visible(u.oArt, true);
    setTextureIfChanged(u.oArt, 'oh-star-on');
    var pulse = 1 + Math.sin(this.visualTime * 1.8) * 0.06;
    u.oArt.setPosition(195, 116).setDisplaySize(64 * pulse, 64 * pulse);
    u.oArt.setTint(tint(col));
    visible(u.oTitle, true); visible(u.oAccent, true); visible(u.oBody, true);
    visible(u.oSub, true); visible(u.oFoot, true);
    u.oTitle.setPosition(195, 158);
    setTextIfChanged(u.oTitle, d.title.toUpperCase(), C.ink);
    u.oAccent.setPosition(195, 198);
    setTextIfChanged(u.oAccent,
      (d.tier === 'true' ? 'TRUE ENDING' : d.tier === 'steady' ? 'ENDING' : 'ENDING') + '   |   ' + d.star, col);
    u.oAccent.setFontSize(14);
    visible(u.oPortrait, true);
    setTextureIfChanged(u.oPortrait, 'oh-por-' + e.route.chr + '-warm');
    u.oPortrait.setPosition(195, 448 + Math.sin(this.visualTime * 1.1) * 5).setDisplaySize(200, 280);
    u.oPortrait.setDepth(41);
    alphaOf(u.oPortrait, 0.5);
    var shown = d.text.slice(0, clamp(this.endPage, 0, d.text.length));
    u.oBody.setPosition(195, 250);
    setTextIfChanged(u.oBody, shown.join('\n\n'), C.ink);
    u.oSub.setPosition(195, 668);
    var next = e.aff < e.route.hi ? 'Higher affinity opens a warmer ending.' :
      e.mems < D.MEM_TRUE ? 'Five fragments on a high affinity run opens the true ending.' :
        'Route complete at the highest tier.';
    setTextIfChanged(u.oSub, 'Affinity ' + e.aff + ' of ' + e.route.max + '   |   fragments ' + e.mems + '/6\n' + next, C.muted);
    u.oFoot.setPosition(195, 726);
    setTextIfChanged(u.oFoot, this.endPage < d.text.length ? 'Tap to continue' : 'Tap to return to the constellation', C.dim);
    this.zone(0, 90, W, 640, function () { self.endingAdvance(); });
    this.backButton('TITLE', function () { self.showTitle(); });
  };

  /* ================================================================== boot */
  Game.phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: C.deep,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance', batchSize: 2048 },
    fps: { target: 60, min: 30 },
    scene: [PlayScene]
  });
  root.__ohGame = Game;
})(window);
