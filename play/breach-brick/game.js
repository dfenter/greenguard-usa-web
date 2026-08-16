/* game.js - Breach & Brick (AAA rebuild, fleet F6).
 *
 * Phaser 3 (vendored, /play/_shared/phaser.min.js) + GGKit (/play/_shared/
 * ggkit.js). GGKit owns lifecycle, input identity, save and audio; nothing in
 * this file registers a competing pointer/key/visibility handler, opens an
 * AudioContext, or touches localStorage directly.
 *
 * Architecture notes that exist to dodge the fleet's shipped defect classes:
 *  - one pooled set of display objects per entity family, and NO separate
 *    debug view: the verification hook (window.__bb) reads the same records
 *    the renderer draws.
 *  - render state lives in parallel `view` records owned by the renderer, never
 *    on the simulation entity handed to it.
 *  - every keyed lookup (theme, wall, power, skin, medal) goes through pick()
 *    with an explicit fallback.
 *  - fixed 1/120 s simulation steps with a hard per-frame step cap, so a
 *    degraded device runs in slow motion and never time-skips. Every gameplay
 *    timer is denominated in stepped simulation seconds.
 *  - static chrome (HUD frame, rails, floor, background) is baked into
 *    textures at boot; no Graphics object survives into the display list, and
 *    no arc is walked per frame (the stun ring is a hand tessellated baked
 *    annulus).
 *  - Scene Systems only ever emits 'prerender'/'render'; this file subscribes
 *    to neither and draws through ordinary display objects.
 */
(function () {
  'use strict';

  var VERSION = '2026-08-10-aaa-r3';

  // ==================================================================
  // Verification hook. Declared before anything can fail so a boot
  // fallback still answers the orchestrator, and mutated in place by the
  // live scene so both readers see one object.
  // ==================================================================
  var HOOK = {
    version: VERSION, ok: false, scene: 'boot', phase: 'boot',
    level: 0, wall: 0, wallName: '', theme: '', signature: '',
    lives: 0, balls: 0, ballsHeld: 0, score: 0, best: 0,
    combo: 0, mult: 1, bricks: 0, bricksTotal: 0, cleared: 0,
    boss: 0, bossMax: 0, stun: 0, stunned: false, stuns: 0,
    falling: 0, warning: 0, powerups: 0, active: {}, shield: 0,
    medal: 0, medalName: 'NONE', elapsed: 0, goldAt: 0, silverAt: 0,
    paddleSkin: '', ballSkin: '', tutorial: '', tutorialStep: -1,
    reducedMotion: false, juice: true, muted: false, steps: 0, slowmo: false
  };
  var SWITCHES = {
    forceLevel: 0, forceEvent: null, forceEventArg: null,
    noTutorial: false, invincible: false, lastEvent: null, lastEventOk: false
  };
  var live = null; // set by GameScene; null before boot completes

  try {
    var qs = new URLSearchParams(location.search);
    if (qs.get('wall')) SWITCHES.forceLevel = parseInt(qs.get('wall'), 10) || 0;
    if (qs.get('level')) SWITCHES.forceLevel = parseInt(qs.get('level'), 10) || 0;
    if (qs.get('event')) SWITCHES.forceEvent = qs.get('event');
    if (qs.get('notut') === '1') SWITCHES.noTutorial = true;
    if (qs.get('invincible') === '1') SWITCHES.invincible = true;
  } catch (e) { /* no URL API: switches stay at defaults */ }

  window.__bb = {
    version: VERSION,
    state: HOOK,
    switches: SWITCHES,
    forceLevel: function (n) {
      n = Math.max(1, Math.min(12, parseInt(n, 10) || 1));
      SWITCHES.forceLevel = n;
      if (live && live.hookForceLevel) { live.hookForceLevel(n); return true; }
      return false; // queued: consumed by the next scene start
    },
    forceEvent: function (name, arg) {
      SWITCHES.forceEvent = name;
      SWITCHES.forceEventArg = arg == null ? null : arg;
      SWITCHES.lastEvent = name;
      var ok = false;
      if (live && live.hookForceEvent) ok = !!live.hookForceEvent(name, arg);
      SWITCHES.lastEventOk = ok;
      return ok;
    },
    events: [
      'multiball', 'power:<type>', 'drop:<type>', 'stun', 'recover', 'fall',
      'clear', 'die', 'gameover', 'boss', 'unlockAll', 'resetSave',
      'tutorial', 'banner', 'slow'
    ]
  };

  function markHookFail(why) {
    HOOK.ok = false;
    HOOK.phase = 'failed';
    HOOK.error = String(why);
  }

  // ==================================================================
  // Constants
  // ==================================================================
  var VW = 540, VH = 960;
  var RETINA_FACTOR = window.GGKit.hiDpi.factor(VW, VH);
  var RAIL_L = 12, RAIL_R = VW - 12;
  var CEIL = 116, FLOOR = 946;
  var GRID_X0 = 24, CELL_W = 54, CELL_H = 28, BRICK_W = 50, BRICK_H = 24;
  var GRID_Y0 = 152;
  var PADDLE_Y = 858, PADDLE_H = 18;
  var PADDLE_W = 108, PADDLE_W_WIDE = 152;
  var BALL_R = 9, BALL_R_HEAVY = 13, BALL_TEX_R = 12;
  var MAX_BRICKS = 130, MAX_BALLS = 6, MAX_DEBRIS = 24, MAX_POWERUPS = 14, MAX_BOLTS = 16;
  var STEP = 1 / 120, MAX_STEPS = 8;
  var COMBO_WINDOW = 2.4;
  var FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  var D = {
    BG: -20, HAZE: -15, BRICK: 10, BOSS: 11, DEBRIS: 13, WARN: 9,
    POWER: 14, PADDLE: 15, BOLT: 15, BALL: 16, FX: 20, CHROME: 30,
    HUD: 40, COACH: 45, BANNER: 50, PANEL: 60, PANEL_TXT: 61
  };

  var REDUCED = false;
  try {
    REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { REDUCED = false; }
  HOOK.reducedMotion = REDUCED;

  // ==================================================================
  // Small utilities
  // ==================================================================
  function pick(table, key, fallbackKey) {
    if (table && Object.prototype.hasOwnProperty.call(table, key) && table[key]) return table[key];
    if (table && fallbackKey != null && table[fallbackKey]) return table[fallbackKey];
    var k;
    for (k in table) if (Object.prototype.hasOwnProperty.call(table, k)) return table[k];
    return null;
  }
  function pickAt(arr, index, fallbackIndex) {
    if (Array.isArray(arr)) {
      if (arr[index]) return arr[index];
      if (fallbackIndex != null && arr[fallbackIndex]) return arr[fallbackIndex];
      if (arr.length) return arr[0];
    }
    return null;
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shadeHex(hex, k) {
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
    return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
  }
  function css(hex) { return '#' + ('000000' + (hex >>> 0).toString(16)).slice(-6); }
  function fmtTime(sec) {
    var s = Math.max(0, Math.floor(sec));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function pad(n, w) {
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < w) s = '0' + s;
    return s;
  }
  // Rate limited cue playback. A six ball board fires paddle/brick cues faster
  // than they are audible, and every extra call allocates a WebAudio node; the
  // per-cue cooldown keeps the mix clean and the frame budget flat.
  var SFX_GAP = 45;
  var sfxLast = Object.create(null);
  function SFX(name, opts) {
    var now = performance.now();
    var gap = (opts && opts.gap != null) ? opts.gap : SFX_GAP;
    if (sfxLast[name] != null && now - sfxLast[name] < gap) return;
    sfxLast[name] = now;
    kit.audio.sfx(name, opts);
  }

  function setTxt(o, s) { if (o && o.__t !== s) { o.__t = s; o.setText(s); } }
  function setCol(o, c) { if (o && o.__c !== c) { o.__c = c; o.setColor(c); } }
  function setAlpha(o, a) { if (o && o.__a !== a) { o.__a = a; o.setAlpha(a); } }

  // ==================================================================
  // Save schema
  // ==================================================================
  var SAVE_V = 3;
  var VALID_PADDLE_SKINS = ['standard', 'chrome', 'ember', 'aurora', 'void'];
  var VALID_BALL_SKINS = ['core', 'plasma', 'comet', 'prism', 'nova'];
  function blankSave() {
    return {
      v: SAVE_V, walls: {}, best: 0, cleared: 0, tutorialDone: false,
      skin: { paddle: 'standard', ball: 'core' }, seen: {}
    };
  }
  function record(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function finiteNumber(n) { return typeof n === 'number' && isFinite(n); }
  function intIn(n, lo, hi) { return finiteNumber(n) && Math.floor(n) === n && n >= lo && n <= hi; }
  function hasKey(list, key) { return list.indexOf(key) !== -1; }
  function validateSave(o) {
    var k, w, sk;
    if (!record(o) || o.v !== SAVE_V || !record(o.walls) || !intIn(o.best, 0, 1000000000) ||
        !intIn(o.cleared, 0, 12) || typeof o.tutorialDone !== 'boolean' || !record(o.skin) ||
        !record(o.seen) || !hasKey(VALID_PADDLE_SKINS, o.skin.paddle) || !hasKey(VALID_BALL_SKINS, o.skin.ball)) return false;
    for (k in o.walls) {
      if (!Object.prototype.hasOwnProperty.call(o.walls, k) || !/^(?:[1-9]|1[0-2])$/.test(k)) return false;
      w = o.walls[k];
      if (!record(w) || !intIn(w.medal, 0, 3) || !finiteNumber(w.bestMs) || w.bestMs < 0 ||
          w.bestMs > 3600000 || typeof w.cleared !== 'boolean') return false;
    }
    for (sk in o.seen) {
      if (Object.prototype.hasOwnProperty.call(o.seen, sk) && typeof o.seen[sk] !== 'boolean') return false;
    }
    return true;
  }
  function normalizeSave(o) {
    var out = blankSave(), k, w, medal, bestMs;
    if (!record(o) || o.v !== SAVE_V) return out;
    out.best = intIn(o.best, 0, 1000000000) ? o.best : 0;
    out.tutorialDone = o.tutorialDone === true;
    if (record(o.skin)) {
      out.skin.paddle = hasKey(VALID_PADDLE_SKINS, o.skin.paddle) ? o.skin.paddle : 'standard';
      out.skin.ball = hasKey(VALID_BALL_SKINS, o.skin.ball) ? o.skin.ball : 'core';
    }
    if (record(o.walls)) {
      for (k in o.walls) {
        if (!Object.prototype.hasOwnProperty.call(o.walls, k) || !/^(?:[1-9]|1[0-2])$/.test(k)) continue;
        w = record(o.walls[k]) ? o.walls[k] : {};
        medal = intIn(w.medal, 0, 3) ? w.medal : 0;
        bestMs = finiteNumber(w.bestMs) ? clamp(w.bestMs, 0, 3600000) : 0;
        out.walls[k] = { medal: medal, bestMs: bestMs, cleared: w.cleared === true };
      }
    }
    if (record(o.seen)) {
      for (k in o.seen) if (Object.prototype.hasOwnProperty.call(o.seen, k) && typeof o.seen[k] === 'boolean') out.seen[k] = o.seen[k];
    }
    out.cleared = progressOf(out).cleared;
    return out;
  }
  function progressOf(save) {
    var medals = 0, gold = 0, silver = 0, bestWall = 0, cleared = 0, k, m;
    for (k in save.walls) {
      if (!Object.prototype.hasOwnProperty.call(save.walls, k)) continue;
      m = save.walls[k] && save.walls[k].medal ? save.walls[k].medal : 0;
      if (m > 0) medals++;
      if (m >= 3) gold++;
      if (m >= 2) silver++;
      if (save.walls[k] && save.walls[k].cleared) {
        cleared++;
        bestWall = Math.max(bestWall, parseInt(k, 10) || 0);
      }
    }
    return { medals: medals, gold: gold, silver: silver, cleared: cleared, bestWall: bestWall };
  }
  function needMet(need, prog) {
    if (!need) return true;
    var k;
    for (k in need) {
      if (!Object.prototype.hasOwnProperty.call(need, k)) continue;
      if ((prog[k] || 0) < need[k]) return false;
    }
    return true;
  }

  // ==================================================================
  // Texture bakery. Everything static in this game is drawn once here and
  // lives as a GPU texture; not one Graphics object is added to a scene.
  // ==================================================================
  function bake(scene, key, w, h, fn) {
    if (scene.textures.exists(key)) return key;
    var g = scene.make.graphics({ x: 0, y: 0 }, false);
    try {
      fn(g, w, h);
      g.generateTexture(key, w, h);
    } finally {
      g.destroy();
    }
    return key;
  }
  // A vertical band gradient inside an inset rect: Graphics gradients do not
  // apply to rounded paths, so bands are used instead and the rounded base
  // shows through at the corners as a bevel.
  function bands(g, x, y, w, h, top, bot, n) {
    var i, t, step = h / n;
    for (i = 0; i < n; i++) {
      t = n === 1 ? 0 : i / (n - 1);
      g.fillStyle(lerpHex(top, bot, t), 1);
      g.fillRect(x, y + i * step, w, step + 0.6);
    }
  }
  function lerpHex(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return ((lerp(ar, br, t) & 255) << 16) | ((lerp(ag, bg, t) & 255) << 8) | (lerp(ab, bb, t) & 255);
  }
  // Hand tessellated annulus: Graphics.arc walks the sweep in 0.01 rad steps,
  // which cost 2.4 ms/frame for HUD rings on a shipped title. This runs once.
  function annulus(g, cx, cy, rOuter, rInner, color, alpha, segments) {
    var n = segments || 48, i, a0, a1, TAU = Math.PI * 2;
    g.fillStyle(color, alpha == null ? 1 : alpha);
    for (i = 0; i < n; i++) {
      a0 = (i / n) * TAU; a1 = ((i + 1) / n) * TAU;
      g.fillPoints([
        { x: cx + Math.cos(a0) * rInner, y: cy + Math.sin(a0) * rInner },
        { x: cx + Math.cos(a0) * rOuter, y: cy + Math.sin(a0) * rOuter },
        { x: cx + Math.cos(a1) * rOuter, y: cy + Math.sin(a1) * rOuter },
        { x: cx + Math.cos(a1) * rInner, y: cy + Math.sin(a1) * rInner }
      ], true);
    }
  }
  function softDisc(g, cx, cy, r, color, peak, steps) {
    var n = steps || 16, i, t;
    for (i = n; i >= 1; i--) {
      t = i / n;
      g.fillStyle(color, peak * Math.pow(1 - t, 2.1));
      g.fillCircle(cx, cy, r * t);
    }
  }

  var BRICK_KINDS = ['b1', 'b2', 'b3', 'st', 'ch', 'un', 'pz'];

  function brickColors(theme, kind) {
    var b = theme.brick || [0x4edbca, 0x5ca8ff, 0x7fd4ff];
    switch (kind) {
      case 'b1': return b[0];
      case 'b2': return b[1];
      case 'b3': return b[2] != null ? b[2] : b[1];
      case 'st': return theme.steel;
      case 'ch': return theme.charge;
      case 'un': return theme.unstable;
      case 'pz': return theme.accent2 != null ? theme.accent2 : b[0];
      default: return b[0];
    }
  }

  function bakeBrick(g, w, h, base, kind, dmg) {
    var top = shadeHex(base, 0.30), bot = shadeHex(base, -0.44);
    g.fillStyle(shadeHex(base, -0.66), 1);
    g.fillRoundedRect(0, 0, w, h, 5);
    bands(g, 2, 2, w - 4, h - 4, top, bot, 7);
    g.fillStyle(0xffffff, 0.30);
    g.fillRoundedRect(3, 3, w - 6, 3.5, 1.6);
    g.fillStyle(0x000000, 0.26);
    g.fillRect(2, h - 4.5, w - 4, 2.5);

    if (kind === 'st') {
      // steel plate: seam plus four rivets, reads without color
      g.fillStyle(shadeHex(base, -0.35), 1);
      g.fillRect(w * 0.5 - 1, 3, 2, h - 7);
      var rv = [[6, 6], [w - 6, 6], [6, h - 7], [w - 6, h - 7]];
      for (var i = 0; i < rv.length; i++) {
        g.fillStyle(shadeHex(base, 0.45), 1); g.fillCircle(rv[i][0], rv[i][1], 2.1);
        g.fillStyle(shadeHex(base, -0.5), 0.8); g.fillCircle(rv[i][0], rv[i][1] + 0.8, 1.1);
      }
    } else if (kind === 'ch') {
      // charge brick: bolt sigil
      g.fillStyle(0xfff3c4, 0.95);
      g.fillPoints([
        { x: w * 0.56, y: 4 }, { x: w * 0.40, y: h * 0.56 },
        { x: w * 0.50, y: h * 0.56 }, { x: w * 0.44, y: h - 4 },
        { x: w * 0.62, y: h * 0.44 }, { x: w * 0.52, y: h * 0.44 }
      ], true);
      g.lineStyle(1.5, 0xfff3c4, 0.5);
      g.strokeRoundedRect(2.5, 2.5, w - 5, h - 5, 4);
    } else if (kind === 'un') {
      // unstable brick: hazard hatching, an unmistakable non-color tell
      g.fillStyle(0x1a1206, 0.55);
      for (var x = -h; x < w; x += 9) {
        g.fillPoints([
          { x: x, y: h - 3 }, { x: x + 4, y: h - 3 },
          { x: x + 4 + h - 6, y: 3 }, { x: x + h - 6, y: 3 }
        ], true);
      }
      g.lineStyle(2, 0xffe08a, 0.85);
      g.strokeRoundedRect(2, 2, w - 4, h - 4, 4);
    } else if (kind === 'pz') {
      // prize brick: diamond
      g.fillStyle(0xffffff, 0.9);
      g.fillPoints([
        { x: w / 2, y: 5 }, { x: w / 2 + 7, y: h / 2 },
        { x: w / 2, y: h - 5 }, { x: w / 2 - 7, y: h / 2 }
      ], true);
      g.fillStyle(shadeHex(base, -0.3), 0.85);
      g.fillPoints([
        { x: w / 2, y: 9 }, { x: w / 2 + 3.6, y: h / 2 },
        { x: w / 2, y: h - 9 }, { x: w / 2 - 3.6, y: h / 2 }
      ], true);
    } else if (kind === 'b2' || kind === 'b3') {
      g.lineStyle(1.4, 0xffffff, kind === 'b3' ? 0.4 : 0.22);
      g.strokeRoundedRect(4.5, 4.5, w - 9, h - 9, 3);
      if (kind === 'b3') {
        g.lineStyle(1.2, 0xffffff, 0.22);
        g.strokeRoundedRect(8.5, 7.5, w - 17, h - 15, 2);
      }
    }

    if (dmg > 0) {
      g.lineStyle(1.6, 0x0a0a12, 0.55);
      g.beginPath();
      g.moveTo(w * 0.22, 3); g.lineTo(w * 0.34, h * 0.45); g.lineTo(w * 0.24, h - 3);
      g.strokePath();
      if (dmg > 1) {
        g.beginPath();
        g.moveTo(w * 0.78, 3); g.lineTo(w * 0.62, h * 0.5); g.lineTo(w * 0.74, h - 3);
        g.strokePath();
        g.beginPath();
        g.moveTo(w * 0.34, h * 0.45); g.lineTo(w * 0.62, h * 0.5);
        g.strokePath();
      }
    }
  }

  function bakeAll(scene) {
    var Data = window.BBData;
    var tKeys = Object.keys(Data.THEMES);

    // ---- backgrounds (half resolution, upscaled: soft gradients only)
    tKeys.forEach(function (tk) {
      var th = Data.THEMES[tk];
      bake(scene, 'bg_' + tk, 270, 480, function (g) {
        bands(g, 0, 0, 270, 480, th.sky[0], th.sky[1], 24);
        // horizon haze
        softDisc(g, 135, 150, 190, th.haze, 0.22, 12);
        softDisc(g, 135, 430, 150, th.haze, 0.10, 8);
        // motif
        var r = mulberry32(0xB00B + tk.length * 977), i;
        for (i = 0; i < 130; i++) {
          var sx = r() * 270, sy = r() * 480, ss = 0.4 + r() * 1.3;
          g.fillStyle(th.star, 0.15 + r() * 0.55);
          g.fillRect(sx, sy, ss, ss);
        }
        if (th.motif === 'grid') {
          g.lineStyle(1, th.accent, 0.07);
          for (i = 0; i <= 270; i += 27) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 480); g.strokePath(); }
          for (i = 0; i <= 480; i += 27) { g.beginPath(); g.moveTo(0, i); g.lineTo(270, i); g.strokePath(); }
        } else if (th.motif === 'rivets') {
          for (i = 0; i < 90; i++) {
            g.fillStyle(th.accent, 0.05 + r() * 0.06);
            g.fillCircle(r() * 270, r() * 480, 1.6 + r() * 2.4);
          }
        } else if (th.motif === 'cracks') {
          g.lineStyle(1.2, th.accent2, 0.09);
          for (i = 0; i < 16; i++) {
            var cx = r() * 270, cy = r() * 480, ang = r() * 6.28, len = 30 + r() * 90;
            g.beginPath(); g.moveTo(cx, cy);
            g.lineTo(cx + Math.cos(ang) * len * 0.5, cy + Math.sin(ang) * len * 0.5);
            g.lineTo(cx + Math.cos(ang + 0.6) * len, cy + Math.sin(ang + 0.6) * len);
            g.strokePath();
          }
        } else {
          for (i = 0; i < 5; i++) {
            annulus(g, 135, 210, 60 + i * 26, 58 + i * 26, th.accent, 0.05 + i * 0.008, 36);
          }
        }
      });
      bake(scene, 'haze_' + tk, 256, 256, function (g) {
        softDisc(g, 128, 128, 126, th.accent, 0.5, 20);
      });
    });

    // ---- bricks: theme x kind x damage
    tKeys.forEach(function (tk) {
      var th = Data.THEMES[tk];
      BRICK_KINDS.forEach(function (kind) {
        var base = brickColors(th, kind);
        for (var dmg = 0; dmg < 3; dmg++) {
          (function (base2, kind2, dmg2) {
            bake(scene, 'bk_' + tk + '_' + kind2 + '_' + dmg2, BRICK_W, BRICK_H, function (g, w, h) {
              bakeBrick(g, w, h, base2, kind2, dmg2);
            });
          })(base, kind, dmg);
        }
      });
      // falling chunk: same silhouette, chipped, darker
      bake(scene, 'chunk_' + tk, BRICK_W, BRICK_H, function (g, w, h) {
        bakeBrick(g, w, h, shadeHex(th.unstable, -0.18), 'un', 2);
        g.fillStyle(0x000000, 0.22);
        g.fillPoints([{ x: w - 10, y: 0 }, { x: w, y: 0 }, { x: w, y: 9 }], true);
        g.fillPoints([{ x: 0, y: h }, { x: 0, y: h - 8 }, { x: 9, y: h }], true);
      });
      // boss core plate, sized to the widest authored boss (5 cells)
      bake(scene, 'boss_' + tk, 5 * CELL_W - (CELL_W - BRICK_W), 2 * CELL_H - (CELL_H - BRICK_H), function (g, w, h) {
        g.fillStyle(0x090511, 1);
        g.fillRoundedRect(0, 0, w, h, 12);
        bands(g, 4, 4, w - 8, h - 8, shadeHex(th.accent, 0.1), shadeHex(th.accent2, -0.55), 10);
        g.lineStyle(3, shadeHex(th.accent, 0.35), 0.9);
        g.strokeRoundedRect(3, 3, w - 6, h - 6, 10);
        // plated shoulders
        var i;
        for (i = 0; i < 6; i++) {
          g.fillStyle(shadeHex(th.steel, -0.2), 0.85);
          g.fillRoundedRect(10 + i * ((w - 20) / 6), 8, (w - 20) / 6 - 6, 8, 3);
          g.fillRoundedRect(10 + i * ((w - 20) / 6), h - 16, (w - 20) / 6 - 6, 8, 3);
        }
        // eye
        softDisc(g, w / 2, h / 2, 30, th.accent2, 0.85, 14);
        g.fillStyle(0xfff3d0, 1); g.fillCircle(w / 2, h / 2, 11);
        g.fillStyle(shadeHex(th.charge, -0.1), 1); g.fillCircle(w / 2, h / 2, 6.5);
        g.fillStyle(0x140409, 1); g.fillEllipse(w / 2, h / 2, 5, 12);
      });
    });

    // ---- paddle skins (nine slice: 26 px caps)
    Data.PADDLE_SKINS.forEach(function (sk) {
      bake(scene, 'pdl_' + sk.key, 128, PADDLE_H + 10, function (g, w, h) {
        var top = h - PADDLE_H - 4;
        // under glow baked into the sprite so no runtime blur is needed
        softDisc(g, w / 2, top + PADDLE_H / 2, 44, sk.body, 0.30, 10);
        g.fillStyle(shadeHex(sk.edge, -0.45), 1);
        g.fillRoundedRect(0, top, w, PADDLE_H, 9);
        bands(g, 2, top + 2, w - 4, PADDLE_H - 4, shadeHex(sk.body, 0.24), shadeHex(sk.edge, -0.1), 6);
        g.fillStyle(sk.lamp, 0.85);
        g.fillRoundedRect(10, top + 3.5, w - 20, 4, 2);
        g.fillStyle(0xffffff, 0.5);
        g.fillRoundedRect(4, top + PADDLE_H - 5, w - 8, 2, 1);
        // grip marks at both ends, identity without color
        g.fillStyle(0x000000, 0.28);
        g.fillRect(9, top + 9, 3, 6); g.fillRect(15, top + 9, 3, 6);
        g.fillRect(w - 12, top + 9, 3, 6); g.fillRect(w - 18, top + 9, 3, 6);
      });
    });
    // stun overlay for the paddle, drawn as a tinted copy on top
    bake(scene, 'pdl_stun', 128, PADDLE_H + 10, function (g, w, h) {
      var top = h - PADDLE_H - 4;
      g.fillStyle(0xff4d63, 0.55);
      g.fillRoundedRect(0, top, w, PADDLE_H, 9);
      g.lineStyle(2.5, 0xffd0d6, 0.9);
      g.strokeRoundedRect(1.5, top + 1.5, w - 3, PADDLE_H - 3, 8);
    });

    // ---- balls
    Data.BALL_SKINS.forEach(function (sk) {
      bake(scene, 'bl_' + sk.key, 56, 56, function (g) {
        softDisc(g, 28, 28, 26, sk.glow, 0.75, 16);
        g.fillStyle(sk.body, 1); g.fillCircle(28, 28, BALL_TEX_R);
        g.fillStyle(shadeHex(sk.glow, -0.2), 0.5); g.fillCircle(28, 30.5, BALL_TEX_R - 2.5);
        g.fillStyle(0xffffff, 1); g.fillCircle(24.5, 24, 3.6);
        g.fillStyle(0xffffff, 0.55); g.fillCircle(31.5, 32, 1.8);
      });
    });

    // ---- powerup capsules, one authored glyph per type
    Object.keys(Data.POWERS).forEach(function (pk) {
      var P = Data.POWERS[pk];
      bake(scene, 'pu_' + pk, 52, 34, function (g, w, h) {
        softDisc(g, w / 2, h / 2, 24, P.color, 0.5, 10);
        g.fillStyle(0x080d18, 1); g.fillRoundedRect(2, 3, w - 4, h - 6, 9);
        bands(g, 4, 5, w - 8, h - 10, shadeHex(P.color, 0.2), shadeHex(P.color, -0.5), 6);
        g.lineStyle(2, shadeHex(P.color, 0.5), 0.95);
        g.strokeRoundedRect(3, 4, w - 6, h - 8, 8);
        var cx = w / 2, cy = h / 2, ink = 0x0a0f1a;
        g.fillStyle(ink, 0.92);
        switch (P.glyph) {
          case 'multi':
            g.fillCircle(cx - 8, cy + 2, 4); g.fillCircle(cx, cy - 4, 4); g.fillCircle(cx + 8, cy + 2, 4);
            break;
          case 'wreck':
            g.fillCircle(cx + 4, cy - 1, 6.5);
            g.fillRect(cx - 12, cy + 2, 14, 3.5);
            break;
          case 'wide':
            g.fillRect(cx - 13, cy - 2, 26, 4.5);
            g.fillPoints([{ x: cx - 17, y: cy }, { x: cx - 10, y: cy - 5.5 }, { x: cx - 10, y: cy + 5.5 }], true);
            g.fillPoints([{ x: cx + 17, y: cy }, { x: cx + 10, y: cy - 5.5 }, { x: cx + 10, y: cy + 5.5 }], true);
            break;
          case 'sticky':
            g.fillRect(cx - 10, cy + 3, 20, 4);
            g.fillCircle(cx, cy - 4, 4.5);
            g.fillRect(cx - 1.5, cy - 4, 3, 7);
            break;
          case 'laser':
            g.fillRect(cx - 8, cy - 7, 3.5, 14); g.fillRect(cx + 4.5, cy - 7, 3.5, 14);
            g.fillRect(cx - 2, cy - 3, 4, 8);
            break;
          case 'shield':
            g.fillPoints([
              { x: cx, y: cy - 8 }, { x: cx + 9, y: cy - 4 }, { x: cx + 6, y: cy + 8 },
              { x: cx, y: cy + 9 }, { x: cx - 6, y: cy + 8 }, { x: cx - 9, y: cy - 4 }
            ], true);
            break;
          case 'slow':
            annulus(g, cx, cy, 8, 6, ink, 0.92, 24);
            g.fillRect(cx - 1, cy - 6, 2, 7); g.fillRect(cx - 1, cy - 1, 6, 2);
            break;
          default: // life
            g.fillRect(cx - 9, cy - 1.8, 18, 3.6);
            g.fillRect(cx - 1.8, cy - 9, 3.6, 18);
            break;
        }
      });
      // matching HUD pip for the active-effect row
      bake(scene, 'pip_' + pk, 26, 26, function (g, w, h) {
        g.fillStyle(0x0b1220, 0.9); g.fillRoundedRect(0, 0, w, h, 7);
        g.lineStyle(2, P.color, 0.95); g.strokeRoundedRect(1, 1, w - 2, h - 2, 6);
        g.fillStyle(P.color, 0.95); g.fillCircle(w / 2, h / 2, 5.2);
      });
    });

    // ---- fx and chrome
    bake(scene, 'p_shard', 10, 10, function (g) {
      g.fillStyle(0xffffff, 1);
      g.fillPoints([{ x: 5, y: 0 }, { x: 10, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 5 }], true);
    });
    bake(scene, 'p_spark', 4, 14, function (g) {
      g.fillStyle(0xffffff, 1); g.fillRoundedRect(0, 0, 4, 14, 2);
    });
    bake(scene, 'p_glow', 32, 32, function (g) { softDisc(g, 16, 16, 16, 0xffffff, 0.95, 12); });
    bake(scene, 'p_dust', 20, 20, function (g) { softDisc(g, 10, 10, 10, 0xffffff, 0.5, 8); });
    bake(scene, 'p_chip', 8, 8, function (g) { g.fillStyle(0xffffff, 1); g.fillRoundedRect(0, 0, 8, 8, 2); });
    bake(scene, 'damage_vignette', 270, 480, function (g, w, h) {
      for (var edge = 0; edge < 18; edge++) {
        var alpha = 0.015 + (18 - edge) * 0.008;
        g.fillStyle(0xff3f5e, alpha);
        g.fillRect(edge, edge, w - edge * 2, 3);
        g.fillRect(edge, h - edge - 3, w - edge * 2, 3);
        g.fillRect(edge, edge, 3, h - edge * 2);
        g.fillRect(w - edge - 3, edge, 3, h - edge * 2);
      }
    });
    bake(scene, 'damage_flash', 2, 2, function (g) { g.fillStyle(0xff3f5e, 0.28); g.fillRect(0, 0, 2, 2); });

    bake(scene, 'warn_beam', 16, 64, function (g, w, h) {
      var i;
      for (i = 0; i < 16; i++) {
        g.fillStyle(0xffb24b, 0.30 * (1 - i / 16));
        g.fillRect(0, i * (h / 16), w, h / 16 + 0.5);
      }
    });
    bake(scene, 'warn_mark', 60, 26, function (g, w, h) {
      g.fillStyle(0xffb24b, 0.95);
      g.fillPoints([{ x: 8, y: 2 }, { x: w - 8, y: 2 }, { x: w / 2, y: h * 0.55 }], true);
      g.fillStyle(0xffe08a, 0.85);
      g.fillPoints([{ x: 16, y: h * 0.58 }, { x: w - 16, y: h * 0.58 }, { x: w / 2, y: h - 2 }], true);
    });
    bake(scene, 'ring', 132, 132, function (g) {
      annulus(g, 66, 66, 64, 55, 0xffffff, 1, 56);
    });
    bake(scene, 'ring_thin', 132, 132, function (g) {
      annulus(g, 66, 66, 64, 60, 0xffffff, 1, 56);
    });
    bake(scene, 'bolt', 6, 22, function (g) {
      g.fillStyle(0xffd8e8, 1); g.fillRoundedRect(0, 0, 6, 22, 3);
      g.fillStyle(0xffffff, 0.9); g.fillRoundedRect(1.5, 2, 3, 12, 1.5);
    });
    bake(scene, 'shield_bar', 64, 20, function (g, w, h) {
      g.fillStyle(0x5ca8ff, 0.5); g.fillRoundedRect(0, h / 2 - 3, w, 6, 3);
      g.fillStyle(0xd8ecff, 0.9); g.fillRoundedRect(4, h / 2 - 1.5, w - 8, 3, 1.5);
    });

    // nine-slice chrome pieces
    bake(scene, 'panel', 96, 96, function (g, w, h) {
      g.fillStyle(0x070c18, 0.93); g.fillRoundedRect(0, 0, w, h, 18);
      g.lineStyle(2, 0x3c5a86, 0.9); g.strokeRoundedRect(1, 1, w - 2, h - 2, 17);
      g.lineStyle(1, 0x7fd4ff, 0.25); g.strokeRoundedRect(5, 5, w - 10, h - 10, 14);
    });
    bake(scene, 'panel_hi', 96, 96, function (g, w, h) {
      g.fillStyle(0x0d1830, 0.96); g.fillRoundedRect(0, 0, w, h, 18);
      g.lineStyle(2.5, 0x4edbca, 0.95); g.strokeRoundedRect(1.5, 1.5, w - 3, h - 3, 17);
    });
    bake(scene, 'btn', 96, 96, function (g, w, h) {
      g.fillStyle(0x122240, 0.96); g.fillRoundedRect(0, 0, w, h, 16);
      bands(g, 3, 3, w - 6, h - 6, 0x1c3c5e, 0x0d1830, 4);
      g.lineStyle(2, 0x4edbca, 0.75); g.strokeRoundedRect(1.5, 1.5, w - 3, h - 3, 15);
    });
    bake(scene, 'btn_on', 96, 96, function (g, w, h) {
      g.fillStyle(0x1d4a52, 1); g.fillRoundedRect(0, 0, w, h, 16);
      g.lineStyle(2.5, 0x8ff0e0, 1); g.strokeRoundedRect(1.5, 1.5, w - 3, h - 3, 15);
    });
    bake(scene, 'strip', 64, 48, function (g, w, h) {
      g.fillStyle(0x081020, 0.82); g.fillRoundedRect(0, 0, w, h, 14);
      g.lineStyle(1.5, 0x4edbca, 0.55); g.strokeRoundedRect(1, 1, w - 2, h - 2, 13);
    });
    bake(scene, 'bar_bg', 24, 24, function (g, w, h) {
      g.fillStyle(0x0a1426, 0.9); g.fillRoundedRect(0, 0, w, h, 6);
      g.lineStyle(1, 0x2d4468, 0.9); g.strokeRoundedRect(0.5, 0.5, w - 1, h - 1, 6);
    });
    bake(scene, 'bar_fill', 8, 8, function (g, w, h) {
      g.fillStyle(0xffffff, 1); g.fillRoundedRect(0, 0, w, h, 3);
    });

    // the full-screen static chrome, one texture, one draw call
    bake(scene, 'chrome', VW, VH, function (g) {
      g.fillStyle(0x060a16, 0.86);
      g.fillRoundedRect(6, -20, VW - 12, 128, 20);
      g.lineStyle(2, 0x2f4a72, 0.9);
      g.strokeRoundedRect(6, -20, VW - 12, 128, 20);
      g.fillStyle(0x4edbca, 0.5); g.fillRect(18, 106, VW - 36, 2);
      g.fillStyle(0x4edbca, 0.14); g.fillRect(18, 108, VW - 36, 6);
      // side rails
      var i;
      for (i = 0; i < 3; i++) {
        g.fillStyle(0x2f4a72, 0.5 - i * 0.14);
        g.fillRect(RAIL_L - 6 + i, CEIL, 2, FLOOR - CEIL);
        g.fillRect(RAIL_R + 4 - i, CEIL, 2, FLOOR - CEIL);
      }
      g.fillStyle(0x7fd4ff, 0.30); g.fillRect(RAIL_L - 6, CEIL - 3, VW - (RAIL_L - 6) * 2, 3);
      // floor threshold
      g.fillStyle(0xff719d, 0.55); g.fillRect(RAIL_L - 6, FLOOR, VW - (RAIL_L - 6) * 2, 3);
      for (i = 0; i < 10; i++) {
        g.fillStyle(0xff719d, 0.11 * (1 - i / 10));
        g.fillRect(RAIL_L - 6, FLOOR + 3 + i * 1.4, VW - (RAIL_L - 6) * 2, 1.6);
      }
      // corner brackets
      [[RAIL_L - 6, CEIL], [RAIL_R + 6, CEIL]].forEach(function (c, idx) {
        var s = idx === 0 ? 1 : -1;
        g.fillStyle(0x4edbca, 0.7);
        g.fillRect(c[0], c[1], s * 26, 3);
        g.fillRect(idx === 0 ? c[0] : c[0] - 3, c[1], 3, 26);
      });
    });

    // lives pip
    bake(scene, 'life_on', 26, 14, function (g, w, h) {
      g.fillStyle(0x2fb8a8, 1); g.fillRoundedRect(0, 3, w, h - 6, 4);
      g.fillStyle(0xd8fff8, 0.9); g.fillRoundedRect(3, 5, w - 6, 2.5, 1.2);
    });
    bake(scene, 'life_off', 26, 14, function (g, w, h) {
      g.fillStyle(0x22304a, 1); g.fillRoundedRect(0, 3, w, h - 6, 4);
    });
    // medal marks: distinct silhouettes, not colour alone
    bake(scene, 'medal_0', 30, 30, function (g, w, h) {
      g.lineStyle(2, 0x55617d, 0.8); annulus(g, w / 2, h / 2, 11, 9, 0x55617d, 0.8, 28);
    });
    for (var mi = 1; mi <= 3; mi++) {
      (function (m) {
        var md = pickAt(window.BBData.MEDALS, m, 0);
        bake(scene, 'medal_' + m, 30, 30, function (g, w, h) {
          softDisc(g, w / 2, h / 2, 14, md.color, 0.5, 8);
          annulus(g, w / 2, h / 2, 12, 8.5, md.color, 1, 32);
          g.fillStyle(md.color, 1);
          if (m === 3) {
            g.fillPoints([
              { x: w / 2, y: h / 2 - 7 }, { x: w / 2 + 6.6, y: h / 2 + 5 }, { x: w / 2 - 6.6, y: h / 2 + 5 }
            ], true);
          } else if (m === 2) {
            g.fillRoundedRect(w / 2 - 5, h / 2 - 5, 10, 10, 2);
          } else {
            g.fillCircle(w / 2, h / 2, 5);
          }
        });
      })(mi);
    }
  }

  // ==================================================================
  // Base scene: GGKit-only input, tap routing, buttons, text helpers.
  // ==================================================================
  var kit = null;
  function readSave() {
    try { return kit.save.get(null); } catch (e) { HOOK.saveError = 'read'; return blankSave(); }
  }
  function writeSave(save) {
    try { kit.save.set(normalizeSave(save)); return true; }
    catch (e) { HOOK.saveError = 'write'; return false; }
  }

  function BBScene(key) { Phaser.Scene.call(this, key); }
  BBScene.prototype = Object.create(Phaser.Scene.prototype);
  BBScene.prototype.constructor = BBScene;

  BBScene.prototype.initInput = function () {
    this.ptrCache = new Map();
    this.buttons = [];
    this.steerId = null;
    this.steerLastX = 0;
    this.keyPrev = {};
    this.focusIndex = -1;
  };
  BBScene.prototype.toWorldX = function (clientX) {
    return clamp(this.scale.transformX(clientX), 0, VW);
  };
  BBScene.prototype.toWorldY = function (clientY) {
    return clamp(this.scale.transformY(clientY), 0, VH);
  };
  // Polled every frame from kit.input.pointers, which is the only pointer
  // registry in this title. Taps are derived from a pointer disappearing
  // from that map, so no second DOM handler is ever installed.
  BBScene.prototype.pollPointers = function (onDrag, onTap) {
    var self = this;
    var seen = new Set();
    kit.input.pointers.forEach(function (p, id) {
      seen.add(id);
      var rec = self.ptrCache.get(id);
      if (!rec) {
        rec = { x: p.x, y: p.y, sx: p.x, sy: p.y, t: p.downAt, moved: 0 };
        self.ptrCache.set(id, rec);
        if (self.steerId === null) {
          self.steerId = id;
          self.steerLastX = self.toWorldX(p.x);
        }
      }
      var dx = p.x - rec.x;
      rec.moved += Math.abs(dx) + Math.abs(p.y - rec.y);
      rec.x = p.x; rec.y = p.y;
      if (id === self.steerId && onDrag) {
        var wx = self.toWorldX(p.x);
        onDrag(wx - self.steerLastX, wx, self.toWorldY(p.y));
        self.steerLastX = wx;
      }
    });
    this.ptrCache.forEach(function (rec, id) {
      if (seen.has(id)) return;
      self.ptrCache.delete(id);
      if (self.steerId === id) {
        self.steerId = null;
        self.ptrCache.forEach(function (next, nextId) {
          if (self.steerId !== null || !seen.has(nextId)) return;
          self.steerId = nextId;
          self.steerLastX = self.toWorldX(next.x);
        });
      }
      var travel = Math.hypot(rec.x - rec.sx, rec.y - rec.sy);
      var held = performance.now() - rec.t;
      if (travel < 20 && held < 650) {
        var wx = self.toWorldX(rec.x), wy = self.toWorldY(rec.y);
        if (!self.hitButton(wx, wy) && onTap) onTap(wx, wy);
      }
    });
  };
  BBScene.prototype.hitButton = function (x, y) {
    for (var i = 0; i < this.buttons.length; i++) {
      var b = this.buttons[i];
      if (!b.enabled || !b.img.visible) continue;
      if (x >= b.x - b.w / 2 && x <= b.x + b.w / 2 && y >= b.y - b.h / 2 && y <= b.y + b.h / 2) {
        this.focusButton(this.buttons.indexOf(b));
        this.flashButton(b);
        SFX(b.back ? 'ui_back' : 'ui');
        if (b.cb) b.cb(b);
        return true;
      }
    }
    return false;
  };
  BBScene.prototype.focusButton = function (index) {
    var items = this.buttons.filter(function (b) { return b.enabled && b.img && b.img.visible; });
    var self = this;
    if (!items.length) { this.focusIndex = -1; return null; }
    var chosen = this.buttons[index];
    if (items.indexOf(chosen) < 0) chosen = items[0];
    this.buttons.forEach(function (b) {
      var on = b === chosen;
      b.focused = on;
      if (b.img && b.img.setTint) {
        if (on) b.img.setTint(0xb8fff1); else b.img.clearTint();
      }
    });
    this.focusIndex = this.buttons.indexOf(chosen);
    return chosen;
  };
  BBScene.prototype.moveButtonFocus = function (direction) {
    var items = this.buttons.filter(function (b) { return b.enabled && b.img && b.img.visible; });
    if (!items.length) return null;
    var current = items.indexOf(this.buttons[this.focusIndex]);
    if (current < 0) current = 0;
    current = (current + direction + items.length) % items.length;
    return this.focusButton(this.buttons.indexOf(items[current]));
  };
  BBScene.prototype.activateButton = function (b) {
    if (!b || !b.enabled || !b.img || !b.img.visible) return false;
    this.flashButton(b);
    SFX(b.back ? 'ui_back' : 'ui');
    if (b.cb) b.cb(b);
    return true;
  };
  BBScene.prototype.flashButton = function (b) {
    if (!b.img || !b.img.setTexture) return;
    b.img.setTexture('btn_on');
    var self = this;
    this.time.delayedCall(110, function () {
      if (b.img && b.img.active) b.img.setTexture(b.on ? 'btn_on' : 'btn');
    });
    if (!REDUCED) {
      this.tweens.add({ targets: b.txt, scale: { from: 0.92, to: 1 }, duration: 160, ease: 'Back.easeOut' });
    }
  };
  BBScene.prototype.addButton = function (x, y, w, h, label, cb, opts) {
    opts = opts || {};
    var img = this.add.nineslice(x, y, opts.on ? 'btn_on' : 'btn', null, w, h, 22, 22, 22, 22)
      .setDepth(opts.depth || D.PANEL);
    var txt = this.add.text(x, y, label, {
      fontFamily: FONT, fontSize: (opts.size || 20) + 'px', color: opts.color || '#dff8f4', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth((opts.depth || D.PANEL) + 1);
    var b = { x: x, y: y, w: w, h: h, img: img, txt: txt, cb: cb, enabled: true, on: !!opts.on, back: !!opts.back, focused: false };
    this.buttons.push(b);
    return b;
  };
  BBScene.prototype.label = function (x, y, s, size, color, origin) {
    var t = this.add.text(x, y, s, {
      fontFamily: FONT, fontSize: size + 'px', color: color || '#dfe8ff'
    }).setOrigin(origin == null ? 0.5 : origin, 0.5).setDepth(D.HUD);
    t.__t = s;
    return t;
  };
  BBScene.prototype.keyEdge = function (code) {
    var down = kit.input.keyDown(code);
    var was = this.keyPrev[code];
    this.keyPrev[code] = down;
    return down && !was;
  };
  BBScene.prototype.addBackground = function (themeKey) {
    var tk = window.BBData.THEMES[themeKey] ? themeKey : 'grid';
    this.bgImg = this.add.image(VW / 2, VH / 2, 'bg_' + tk).setDisplaySize(VW, VH).setDepth(D.BG);
    this.hazeImg = this.add.image(VW / 2, 330, 'haze_' + tk)
      .setDisplaySize(620, 620).setDepth(D.HAZE).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD);
    if (!REDUCED) {
      this.tweens.add({
        targets: this.hazeImg, alpha: { from: 0.16, to: 0.30 }, scale: { from: 1, to: 1.06 },
        duration: 4200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
    }
  };
  BBScene.prototype.setTheme = function (themeKey) {
    var tk = window.BBData.THEMES[themeKey] ? themeKey : 'grid';
    if (this.bgImg) this.bgImg.setTexture('bg_' + tk);
    if (this.hazeImg) this.hazeImg.setTexture('haze_' + tk);
  };

  // ==================================================================
  // Boot scene
  // ==================================================================
  function BootScene() { BBScene.call(this, 'boot'); }
  BootScene.prototype = Object.create(BBScene.prototype);
  BootScene.prototype.constructor = BootScene;
  BootScene.prototype.create = function () {
    this.cameras.main.setZoom(RETINA_FACTOR);
    var self = this;
    HOOK.scene = 'boot';
    kit.loader.show('Breach & Brick');
    var steps = [];
    steps.push(function () {
      var problems = window.BBData.validate();
      if (problems.length) {
        // Content is authored, not generated: a broken table must be loud in
        // the hook but must never stop the game booting.
        HOOK.contentProblems = problems;
      }
    });
    steps.push(function () { bakeAll(self); });
    steps.push(function () { window.BBAudio.install(kit); });
    // Decode every cue up front. Lazy decode inside GGKit would otherwise land
    // the first play of a long cue in the middle of a frame. GGKit versions
    // that decode asynchronously return a promise; the boot gate waits for it.
    steps.push(function (done) {
      var result = kit.audio.preload(window.BBAudio.names.filter(function (n) { return n.indexOf('music_') !== 0; }));
      if (result && typeof result.then === 'function') result.then(function () { done(); }, done); else done();
    });
    steps.push(function (done) {
      var result = kit.audio.preload(['music_deep', 'music_surge']);
      if (result && typeof result.then === 'function') result.then(function () { done(); }, done); else done();
    });
    var i = 0;
    var stopped = false;
    function fail(e) {
      if (stopped) return;
      stopped = true;
      markHookFail(e && e.message ? e.message : e);
      try { kit.loader.hide(); } catch (ignore) { /* keep the visible error state */ }
      self.add.text(VW / 2, VH / 2 - 24, 'BOOT ERROR', {
        fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ff719d'
      }).setOrigin(0.5);
      self.add.text(VW / 2, VH / 2 + 24, 'RELOAD TO TRY AGAIN', {
        fontFamily: FONT, fontSize: '16px', color: '#d8e5ff'
      }).setOrigin(0.5);
    }
    function advance(e) {
      if (stopped) return;
      if (e) { fail(e); return; }
      i++;
      kit.loader.progress(i / steps.length);
      self.time.delayedCall(16, run);
    }
    function run() {
      if (stopped) return;
      if (i >= steps.length) {
        kit.loader.progress(1);
        kit.loader.hide();
        HOOK.ok = true;
        self.scene.start('title');
        return;
      }
      var fn = steps[i], settled = false;
      function done(e) {
        if (settled) return;
        settled = true;
        advance(e);
      }
      try {
        var result = fn(done);
        if (fn.length === 0) done();
        else if (result && typeof result.then === 'function') result.then(function () { done(); }, done);
      } catch (e) { done(e); }
    }
    run();
  };

  // ==================================================================
  // Title / menu scene
  // ==================================================================
  function TitleScene() { BBScene.call(this, 'title'); }
  TitleScene.prototype = Object.create(BBScene.prototype);
  TitleScene.prototype.constructor = TitleScene;

  TitleScene.prototype.create = function () {
    this.cameras.main.setZoom(RETINA_FACTOR);
    var self = this;
    var Data = window.BBData;
    HOOK.scene = 'title';
    HOOK.phase = 'menu';
    this.initInput();
    this.save = normalizeSave(readSave());
    this.prog = progressOf(this.save);
    HOOK.best = this.save.best || 0;
    HOOK.cleared = this.prog.cleared;

    this.addBackground('grid');
    this.add.image(VW / 2, VH / 2, 'chrome').setDepth(D.CHROME).setAlpha(0.5);

    // wordmark
    var t1 = this.add.text(VW / 2, 178, 'BREACH', {
      fontFamily: FONT, fontSize: '64px', fontStyle: 'bold', color: '#eafffb'
    }).setOrigin(0.5).setDepth(D.HUD);
    t1.setShadow(0, 0, '#4edbca', 26, false, true);
    var t2 = this.add.text(VW / 2, 246, '& BRICK', {
      fontFamily: FONT, fontSize: '48px', fontStyle: 'bold', color: '#ffc85b'
    }).setOrigin(0.5).setDepth(D.HUD);
    t2.setShadow(0, 0, '#ff9a3d', 22, false, true);

    if (!REDUCED) {
      this.tweens.add({ targets: t1, y: { from: 168, to: 178 }, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: t2, y: { from: 254, to: 246 }, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 200 });
    }

    var nextWall = Math.min(12, (this.prog.bestWall || 0) + 1);
    this.startWall = SWITCHES.forceLevel > 0 ? SWITCHES.forceLevel : nextWall;

    this.mainBtns = [];
    this.titleArt = [t1, t2];
    var y = 400;
    this.playBtn = this.addButton(VW / 2, y, 320, 74,
      this.prog.bestWall > 0 ? 'CONTINUE - WALL ' + pad(this.startWall, 2) : 'START RUN',
      function () { self.startRun(self.startWall); }, { size: 22, depth: D.HUD });
    this.mainBtns.push(this.playBtn);
    this.mainBtns.push(this.addButton(VW / 2 - 84, y + 92, 152, 62, 'WALLS', function () { self.openPanel('walls'); }, { size: 17, depth: D.HUD }));
    this.mainBtns.push(this.addButton(VW / 2 + 84, y + 92, 152, 62, 'DECKS', function () { self.openPanel('decks'); }, { size: 17, depth: D.HUD }));
    this.mainBtns.push(this.addButton(VW / 2 - 84, y + 166, 152, 62, 'HOW TO', function () { self.openPanel('how'); }, { size: 17, depth: D.HUD }));
    this.mainBtns.push(this.addButton(VW / 2 + 84, y + 166, 152, 62, 'OPTIONS', function () { kit.openSettings(); }, { size: 17, depth: D.HUD }));
    this.focusButton(0);

    this.titleTxt = [
      this.label(VW / 2, 296, 'BREAK THE WALL BEFORE IT BREAKS YOU', 14, '#8fa6c8'),
      this.label(VW / 2, y + 236,
        'WALLS ' + this.prog.cleared + '/12   MEDALS ' + this.prog.medals + '/12   GOLD ' + this.prog.gold,
        15, '#7f93b8'),
      this.label(VW / 2, y + 268, 'BEST SCORE ' + pad(this.save.best || 0, 6), 15, '#ffc85b'),
      this.label(VW / 2, VH - 44, 'DRAG TO STEER   TAP TO LAUNCH AND FIRE', 13, '#63739a')
    ];

    this.panel = null;
    this.panelObjs = [];

    kit.audio.music('music_deep', 900);

    // A queued forceLevel from before boot is honoured here as well as live.
    if (SWITCHES.forceEvent) {
      this.startRun(this.startWall);
    }
  };

  TitleScene.prototype.setMainVisible = function (v) {
    this.mainBtns.forEach(function (b) {
      b.enabled = v; b.img.setVisible(v); b.txt.setVisible(v);
    });
    // the panel is a sheet, not a scrim: the wordmark and the run summary must
    // not read through it
    (this.titleArt || []).forEach(function (o) { o.setVisible(v); });
    (this.titleTxt || []).forEach(function (o) { o.setVisible(v); });
  };

  TitleScene.prototype.closePanel = function () {
    this.panelObjs.forEach(function (o) { if (o.destroy) o.destroy(); });
    this.panelObjs = [];
    this.buttons = this.buttons.filter(function (b) { return !b.__panel; });
    this.panel = null;
    this.setMainVisible(true);
    this.focusButton(0);
  };

  TitleScene.prototype.panelAdd = function (o) { this.panelObjs.push(o); return o; };
  TitleScene.prototype.panelBtn = function (x, y, w, h, label, cb, opts) {
    var b = this.addButton(x, y, w, h, label, cb, opts);
    b.__panel = true;
    this.panelObjs.push(b.img); this.panelObjs.push(b.txt);
    return b;
  };

  TitleScene.prototype.openPanel = function (which) {
    var self = this;
    var Data = window.BBData;
    if (this.panel) this.closePanel();
    this.panel = which;
    this.setMainVisible(false);
    var bg = this.panelAdd(this.add.nineslice(VW / 2, 500, 'panel', null, 508, 800, 26, 26, 26, 26).setDepth(D.PANEL));
    bg.setAlpha(1);
    var title = which === 'walls' ? 'WALL SELECT' : which === 'decks' ? 'DECK LOCKER' : 'HOW TO PLAY';
    this.panelAdd(this.add.text(VW / 2, 152, title, {
      fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#eafffb'
    }).setOrigin(0.5).setDepth(D.PANEL_TXT));

    if (which === 'walls') this.buildWallsPanel();
    else if (which === 'decks') this.buildDecksPanel();
    else this.buildHowPanel();

    this.panelBtn(VW / 2, 862, 260, 58, 'BACK', function () { self.closePanel(); }, { size: 18, depth: D.PANEL, back: true });
    this.focusButton(0);
  };

  TitleScene.prototype.buildWallsPanel = function () {
    var self = this, Data = window.BBData;
    var cols = 3, x0 = VW / 2 - 218, y0 = 232, cw = 148, ch = 118;
    for (var i = 0; i < Data.WALLS.length; i++) {
      (function (idx) {
        var w = Data.WALLS[idx];
        var rec = self.save.walls[String(w.id)] || null;
        var open = w.id === 1 || (self.save.walls[String(w.id - 1)] && self.save.walls[String(w.id - 1)].cleared);
        var cx = x0 + (idx % cols) * cw + cw / 2 - 4;
        var cy = y0 + Math.floor(idx / cols) * ch + ch / 2;
        var img = self.panelAdd(self.add.nineslice(cx, cy, open ? 'btn' : 'panel', null, cw - 12, ch - 12, 20, 20, 20, 20).setDepth(D.PANEL_TXT));
        img.setAlpha(open ? 1 : 0.5);
        self.panelAdd(self.add.text(cx, cy - 26, 'WALL ' + pad(w.id, 2), {
          fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: open ? '#eafffb' : '#5d6c8c'
        }).setOrigin(0.5).setDepth(D.PANEL_TXT + 1));
        self.panelAdd(self.add.text(cx, cy - 6, w.name.toUpperCase(), {
          fontFamily: FONT, fontSize: '14px', color: open ? '#8fd8cf' : '#4d5a78'
        }).setOrigin(0.5).setDepth(D.PANEL_TXT + 1));
        var medal = rec && rec.medal ? rec.medal : 0;
        self.panelAdd(self.add.image(cx, cy + 22, 'medal_' + medal).setDepth(D.PANEL_TXT + 1).setScale(0.85).setAlpha(open ? 1 : 0.4));
        if (open) {
          var b = self.addButton(cx, cy, cw - 12, ch - 12, '', function () { self.startRun(w.id); }, { depth: D.PANEL });
          b.__panel = true;
          b.img.destroy(); b.txt.destroy();
          b.img = img; b.txt = self.panelObjs[self.panelObjs.length - 1];
        }
      })(i);
    }
  };

  TitleScene.prototype.buildDecksPanel = function () {
    var self = this, Data = window.BBData;
    var prog = this.prog;
    function row(list, kind, y0, label) {
      self.panelAdd(self.add.text(VW / 2 - 214, y0 - 34, label, {
        fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#8fa6c8'
      }).setOrigin(0, 0.5).setDepth(D.PANEL_TXT));
      list.forEach(function (sk, i) {
        var open = needMet(sk.need, prog);
        var cy = y0 + i * 54;
        var sel = self.save.skin[kind] === sk.key;
        var img = self.panelAdd(self.add.nineslice(VW / 2, cy, sel ? 'btn_on' : 'btn', null, 440, 46, 20, 20, 20, 20).setDepth(D.PANEL_TXT));
        img.setAlpha(open ? 1 : 0.45);
        self.panelAdd(self.add.text(VW / 2 - 190, cy, sk.name.toUpperCase(), {
          fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: open ? '#eafffb' : '#5d6c8c'
        }).setOrigin(0, 0.5).setDepth(D.PANEL_TXT + 1));
        self.panelAdd(self.add.text(VW / 2 + 190, cy, open ? (sel ? 'EQUIPPED' : 'EQUIP') : sk.hint.toUpperCase(), {
          fontFamily: FONT, fontSize: '14px', color: open ? (sel ? '#8ff0e0' : '#9fb4d8') : '#c98a53'
        }).setOrigin(1, 0.5).setDepth(D.PANEL_TXT + 1));
        // swatch: the actual baked art, so the locker shows the real skin
        var swatch = kind === 'paddle'
          ? self.add.nineslice(VW / 2 - 24, cy + 2, 'pdl_' + sk.key, null, 72, PADDLE_H + 10, 26, 26, 0, 0)
          : self.add.image(VW / 2 - 24, cy, 'bl_' + sk.key).setScale(0.5);
        self.panelAdd(swatch.setDepth(D.PANEL_TXT + 1).setAlpha(open ? 1 : 0.35));
        if (open) {
          var b = self.addButton(VW / 2, cy, 440, 46, '', function () {
            self.save.skin[kind] = sk.key;
            writeSave(self.save);
            SFX('unlock');
            self.openPanel('decks');
          }, { depth: D.PANEL });
          b.__panel = true;
          b.img.destroy(); b.txt.destroy();
          b.img = img; b.txt = swatch;
        }
      });
    }
    row(Data.PADDLE_SKINS, 'paddle', 236, 'PADDLE DECKS');
    row(Data.BALL_SKINS, 'ball', 530, 'BALL CORES');
  };

  TitleScene.prototype.buildHowPanel = function () {
    var lines = [
      ['STEER', 'Drag anywhere. The deck tracks your finger'],
      ['', 'one to one, with no smoothing lag.'],
      ['', ''],
      ['LAUNCH', 'Tap or press Space to launch, and to fire'],
      ['', 'the lance once you have caught one.'],
      ['', ''],
      ['FALLING', 'Unstable bricks arm, flash amber and paint'],
      ['BRICKS', 'a beam on the floor before they drop. They'],
      ['', 'smash the wall on the way down and stun'],
      ['', 'your deck if they land on it.'],
      ['', ''],
      ['MEDALS', 'Gold needs a fast clear with no stun.'],
      ['', 'Silver allows one stun. Bronze is any clear.'],
      ['', ''],
      ['DROPS', 'Prize bricks always drop. Early walls hand'],
      ['', 'you a free multiball once they are opened.']
    ];
    var y = 212;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i][0]) {
        this.panelAdd(this.add.text(VW / 2 - 210, y, lines[i][0], {
          fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#4edbca'
        }).setOrigin(0, 0.5).setDepth(D.PANEL_TXT));
      }
      if (lines[i][1]) {
        this.panelAdd(this.add.text(VW / 2 - 118, y, lines[i][1], {
          fontFamily: FONT, fontSize: '14px', color: '#c8d6ee'
        }).setOrigin(0, 0.5).setDepth(D.PANEL_TXT));
      }
      y += lines[i][0] || lines[i][1] ? 26 : 12;
    }
  };

  TitleScene.prototype.startRun = function (wallId) {
    kit.audio.stopMusic(400);
    this.scene.start('game', { wall: clamp(wallId, 1, 12), save: this.save });
  };

  TitleScene.prototype.update = function () {
    this.pollPointers(null, function () { /* taps route through buttons only */ });
    if (this.keyEdge('ArrowDown') || this.keyEdge('ArrowRight')) this.moveButtonFocus(1);
    if (this.keyEdge('ArrowUp') || this.keyEdge('ArrowLeft')) this.moveButtonFocus(-1);
    if (this.keyEdge('Enter') || this.keyEdge('Space')) this.activateButton(this.buttons[this.focusIndex]);
    if (this.keyEdge('Escape') && this.panel) this.closePanel();
    HOOK.phase = this.panel ? 'menu:' + this.panel : 'menu';
  };

  // ==================================================================
  // Game scene
  // ==================================================================
  function GameScene() { BBScene.call(this, 'game'); }
  GameScene.prototype = Object.create(BBScene.prototype);
  GameScene.prototype.constructor = GameScene;

  GameScene.prototype.init = function (data) {
    this.startWall = (data && data.wall) || 1;
    this.save = normalizeSave((data && data.save) || readSave());
  };

  GameScene.prototype.create = function () {
    this.cameras.main.setZoom(RETINA_FACTOR);
    var self = this;
    var Data = window.BBData;
    live = this;
    HOOK.scene = 'game';
    this.initInput();
    this.Data = Data;
    this.acc = 0;
    this.frozenUntil = 0;

    this.addBackground('grid');

    // ---------------- pools -------------------------------------------
    this.brickView = [];
    for (var i = 0; i < MAX_BRICKS; i++) {
      this.brickView.push({
        spr: this.add.image(-100, -100, 'bk_grid_b1_0').setDepth(D.BRICK).setVisible(false),
        tex: '', flash: 0, jitter: 0
      });
    }
    this.ballPool = [];
    for (i = 0; i < MAX_BALLS; i++) {
      this.ballPool.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0, r: BALL_R, held: true, heavy: false,
        spr: this.add.image(-100, -100, 'bl_core').setDepth(D.BALL).setVisible(false)
      });
    }
    this.debrisPool = [];
    for (i = 0; i < MAX_DEBRIS; i++) {
      this.debrisPool.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, crushes: 0,
        spr: this.add.image(-100, -100, 'chunk_grid').setDepth(D.DEBRIS).setVisible(false)
      });
    }
    this.powerPool = [];
    for (i = 0; i < MAX_POWERUPS; i++) {
      this.powerPool.push({
        active: false, x: 0, y: 0, vy: 0, type: 'multi', t: 0,
        spr: this.add.image(-100, -100, 'pu_multi').setDepth(D.POWER).setVisible(false)
      });
    }
    this.boltPool = [];
    for (i = 0; i < MAX_BOLTS; i++) {
      this.boltPool.push({
        active: false, x: 0, y: 0, vy: 0,
        spr: this.add.image(-100, -100, 'bolt').setDepth(D.BOLT).setVisible(false).setBlendMode(Phaser.BlendModes.ADD)
      });
    }
    // warning tell views: beam plus floor chevron, one pair per armed brick
    this.warnPool = [];
    for (i = 0; i < 10; i++) {
      this.warnPool.push({
        active: false, brick: -1,
        beam: this.add.image(-100, -100, 'warn_beam').setDepth(D.WARN).setVisible(false).setBlendMode(Phaser.BlendModes.ADD),
        mark: this.add.image(-100, -100, 'warn_mark').setDepth(D.WARN).setVisible(false)
      });
    }

    // ---------------- boss --------------------------------------------
    this.bossSpr = this.add.image(-200, -200, 'boss_grid').setDepth(D.BOSS).setVisible(false);
    this.bossGlow = this.add.image(-200, -200, 'p_glow').setDepth(D.BOSS - 1).setVisible(false)
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5);

    // ---------------- paddle ------------------------------------------
    var pskKey = (this.save.skin && this.save.skin.paddle) || 'standard';
    this.pSkin = null;
    Data.PADDLE_SKINS.forEach(function (s) { if (s.key === pskKey) self.pSkin = s; });
    if (!this.pSkin) this.pSkin = Data.PADDLE_SKINS[0];
    var bskKey = (this.save.skin && this.save.skin.ball) || 'core';
    this.bSkin = null;
    Data.BALL_SKINS.forEach(function (s) { if (s.key === bskKey) self.bSkin = s; });
    if (!this.bSkin) this.bSkin = Data.BALL_SKINS[0];
    this.ballPool.forEach(function (b) { b.spr.setTexture('bl_' + self.bSkin.key); });

    this.paddleSpr = this.add.nineslice(VW / 2, PADDLE_Y + PADDLE_H / 2 - 3, 'pdl_' + this.pSkin.key, null,
      PADDLE_W, PADDLE_H + 10, 26, 26, 0, 0).setDepth(D.PADDLE);
    this.paddleStun = this.add.nineslice(VW / 2, PADDLE_Y + PADDLE_H / 2 - 3, 'pdl_stun', null,
      PADDLE_W, PADDLE_H + 10, 26, 26, 0, 0).setDepth(D.PADDLE + 1).setVisible(false);
    this.stunRing = this.add.image(VW / 2, PADDLE_Y + PADDLE_H / 2, 'ring')
      .setDepth(D.PADDLE + 1).setVisible(false).setTint(0xff5d6c).setBlendMode(Phaser.BlendModes.ADD);
    this.shieldSpr = this.add.nineslice(VW / 2, FLOOR - 6, 'shield_bar', null, VW - 40, 20, 20, 20, 0, 0)
      .setDepth(D.PADDLE).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    this.aimLine = this.add.image(VW / 2, PADDLE_Y - 60, 'p_spark')
      .setDepth(D.PADDLE).setVisible(false).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.damageVignette = this.add.image(VW / 2, VH / 2, 'damage_vignette')
      .setDisplaySize(VW, VH).setDepth(D.CHROME + 1).setVisible(false).setAlpha(0);
    this.damageFlash = this.add.image(VW / 2, VH / 2, 'damage_flash')
      .setDisplaySize(VW, VH).setDepth(D.CHROME + 2).setVisible(false).setAlpha(0);

    // Small pooled contact beats make rail and ceiling rebounds readable
    // without adding a per-hit particle allocation.
    this.contactPool = [];
    for (i = 0; i < 6; i++) {
      this.contactPool.push({ active: false, t: 0, max: 0.16,
        spr: this.add.image(-100, -100, 'ring_thin').setDepth(D.FX).setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD) });
    }
    // The authored `trail` colour on each ball skin is consumed by this
    // renderer-owned pool, keeping the effect flat under the mobile budget.
    this.trailPool = [];
    for (i = 0; i < 24; i++) {
      this.trailPool.push({ active: false, t: 0, max: 0.22, x: 0, y: 0,
        spr: this.add.image(-100, -100, 'p_glow').setDepth(D.FX - 1).setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD) });
    }
    this.trailTick = 0;

    // ---------------- particles (5 systems, all pooled by Phaser) -------
    this.burstTint = 0xffffff;
    this.exShard = this.add.particles(0, 0, 'p_shard', {
      lifespan: { min: 380, max: 820 }, speed: { min: 60, max: 330 }, angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0.1 }, rotate: { min: -220, max: 220 }, gravityY: 900,
      alpha: { start: 1, end: 0.2 }, emitting: false, maxAliveParticles: 220
    }).setDepth(D.FX);
    this.exSpark = this.add.particles(0, 0, 'p_spark', {
      lifespan: { min: 180, max: 420 }, speed: { min: 140, max: 460 }, angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 },
      blendMode: 'ADD', emitting: false, maxAliveParticles: 180
    }).setDepth(D.FX);
    this.exGlow = this.add.particles(0, 0, 'p_glow', {
      lifespan: { min: 260, max: 600 }, speed: { min: 20, max: 130 }, angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 }, alpha: { start: 0.7, end: 0 },
      blendMode: 'ADD', emitting: false, maxAliveParticles: 120
    }).setDepth(D.FX);
    this.exDust = this.add.particles(0, 0, 'p_dust', {
      lifespan: { min: 420, max: 900 }, speedX: { min: -140, max: 140 }, speedY: { min: -170, max: -40 },
      scale: { start: 0.7, end: 1.7 }, alpha: { start: 0.5, end: 0 },
      emitting: false, maxAliveParticles: 90
    }).setDepth(D.FX);
    this.exChip = this.add.particles(0, 0, 'p_chip', {
      lifespan: { min: 500, max: 1000 }, speed: { min: 90, max: 300 }, angle: { min: 200, max: 340 },
      scale: { start: 1.1, end: 0.2 }, rotate: { min: -300, max: 300 }, gravityY: 620,
      alpha: { start: 1, end: 0 }, emitting: false, maxAliveParticles: 140
    }).setDepth(D.FX);

    // ---------------- chrome + HUD -------------------------------------
    this.add.image(VW / 2, VH / 2, 'chrome').setDepth(D.CHROME);
    this.buildHud();
    this.buildCoach();
    this.buildBanner();
    this.transientQueue = [];
    this.transientActive = null;
    this.transientTimer = null;
    this.coachFadeTimer = null;

    // ---------------- sim ----------------------------------------------
    this.sim = {
      wallIdx: 0, wall: null, theme: null, rng: null,
      bricks: [], grid: [], gridRows: 0, alive: 0, total: 0,
      boss: null, paddle: null, tut: null,
      t: 0, stuns: 0, combo: 0, comboT: 0, mult: 1, armedList: [],
      score: 0, lives: 3, state: 'aim', fallT: 0, multiFired: false,
      speedScale: 1, dropCount: 0
    };
    this.paddle = {
      x: VW / 2, targetX: VW / 2, w: PADDLE_W, vx: 0, aim: 0.28,
      stun: 0, stunMax: 1, shield: 0, laserCd: 0,
      wide: 0, sticky: 0, laser: 0, wreck: 0, slow: 0
    };
    this.sim.paddle = this.paddle;
    this.runScore = 0;
    this.overlay = null;

    this.loadWall(clamp(this.startWall, 1, 12) - 1);

    if (SWITCHES.forceEvent && SWITCHES.forceEvent !== 'startRun') {
      var queuedEvent = SWITCHES.forceEvent;
      var queuedArg = SWITCHES.forceEventArg;
      SWITCHES.forceEvent = null;
      SWITCHES.forceEventArg = null;
      this.time.delayedCall(40, function () {
        SWITCHES.lastEvent = queuedEvent;
        SWITCHES.lastEventOk = !!self.hookForceEvent(queuedEvent, queuedArg);
      });
    }

    this.events.on('shutdown', function () {
      if (live === self) live = null;
    });
  };

  // ---------------------------------------------------------------- HUD
  GameScene.prototype.buildHud = function () {
    var self = this;
    this.hudWall = this.label(20, 30, '#01', 20, '#eafffb', 0);
    this.hudWall.setFontStyle('bold');
    this.hudScore = this.label(VW - 20, 30, '000000', 24, '#ffffff', 1);
    this.hudScore.setFontStyle('bold');
    this.lifePips = [];
    for (var i = 0; i < 5; i++) {
      this.lifePips.push(this.add.image(26 + i * 30, 84, 'life_on').setDepth(D.HUD).setVisible(i < 3));
    }
    this.hudTimer = this.label(VW - 20, 84, '0:00', 17, '#8ff0e0', 1);
    this.hudTarget = this.label(VW - 96, 84, '◎0:30', 15, '#ffc85b', 1);
    this.comboTxt = this.label(VW / 2, 84, '', 18, '#ffc85b');
    this.comboTxt.setFontStyle('bold');

    this.bossBarBg = this.add.nineslice(VW / 2, 132, 'bar_bg', null, 340, 16, 8, 8, 8, 8)
      .setDepth(D.HUD).setVisible(false);
    this.bossBar = this.add.nineslice(VW / 2 - 168, 132, 'bar_fill', null, 336, 10, 3, 3, 3, 3)
      .setDepth(D.HUD + 1).setVisible(false).setOrigin(0, 0.5).setTint(0xff5d6c);

    // active effect pips, pooled
    this.effectPips = [];
    for (i = 0; i < 5; i++) {
      var g = this.add.image(VW - 30 - i * 32, 57, 'pip_multi').setDepth(D.HUD).setVisible(false);
      var bar = this.add.nineslice(VW - 30 - i * 32, 75, 'bar_fill', null, 22, 4, 2, 2, 2, 2)
        .setDepth(D.HUD).setVisible(false);
      this.effectPips.push({ img: g, bar: bar });
    }
    // One compact transient lane, kept above the playfield and away from the
    // thumb zone. Coach text and event chips share this lane.
    this.chipBg = this.add.nineslice(20, 110, 'strip', null, 240, 28, 14, 14, 14, 14)
      .setDepth(D.COACH).setVisible(false);
    this.chipTxt = this.label(32, 110, '', 15, '#eafffb', 0);
    this.chipTxt.setDepth(D.COACH + 1).setVisible(false);

    this.gear = this.addButton(VW / 2, 30, 60, 44, '=', function () { kit.openSettings(); }, { size: 20, depth: D.HUD });
  };

  GameScene.prototype.buildCoach = function () {
    // One-line tutorial strip in the top band. It shares the transient lane,
    // never covers the play area centre or the bottom half, and fades down
    // after three seconds while the instruction remains actionable.
    this.coachBg = this.add.nineslice(VW / 2, 110, 'strip', null, 480, 28, 14, 14, 14, 14)
      .setDepth(D.COACH).setVisible(false).setAlpha(0);
    this.coachTxt = this.label(VW / 2, 110, '', 15, '#d8f4ff');
    this.coachTxt.setDepth(D.COACH + 1).setVisible(false).setAlpha(0);
  };

  GameScene.prototype.buildBanner = function () {
    var w = 300; // Boundary-only banner; never used for live gameplay events.
    this.bannerBg = this.add.nineslice(VW / 2, 430, 'panel_hi', null, w, 96, 22, 22, 22, 22)
      .setDepth(D.BANNER).setVisible(false);
    this.bannerTxt = this.label(VW / 2, 414, '', 22, '#eafffb');
    this.bannerTxt.setFontStyle('bold').setDepth(D.BANNER + 1).setVisible(false);
    this.bannerSub = this.label(VW / 2, 444, '', 13, '#8ff0e0');
    this.bannerSub.setDepth(D.BANNER + 1).setVisible(false);
    this.bannerMedal = this.add.image(VW / 2, 462, 'medal_3').setDepth(D.BANNER + 1).setVisible(false);
  };

  GameScene.prototype.banner = function (title, sub, color, medal, holdMs) {
    this.enqueueTransient({
      type: 'banner', title: title, sub: sub || '', color: color || '#eafffb',
      medal: medal || 0, hold: holdMs || 1000
    });
  };

  GameScene.prototype.chip = function (text, color) {
    this.enqueueTransient({ type: 'chip', text: text, color: color || '#eafffb', hold: 700 });
  };

  GameScene.prototype.coach = function (text) {
    if (!text) {
      this.transientQueue = this.transientQueue.filter(function (item) { return item.type !== 'coach'; });
      if (this.transientActive && this.transientActive.type === 'coach') this.finishTransient(this.transientActive);
      return;
    }
    if (this.transientActive && this.transientActive.type === 'coach') {
      this.refreshCoach(text);
      return;
    }
    this.transientQueue = this.transientQueue.filter(function (item) { return item.type !== 'coach'; });
    this.enqueueTransient({ type: 'coach', text: text });
  };

  // --------------------------------------------------------- transient lane
  // All readable event UI shares one queue. This prevents a power chip,
  // tutorial strip, and boundary beat from ever occupying the screen together.
  GameScene.prototype.enqueueTransient = function (item) {
    var self = this;
    if (!this.transientQueue) this.transientQueue = [];
    if (item.type === 'chip') {
      if (this.transientActive && this.transientActive.type === 'chip' && this.transientActive.text === item.text) return;
      for (var qi = 0; qi < this.transientQueue.length; qi++) {
        if (this.transientQueue[qi].type === 'chip' && this.transientQueue[qi].text === item.text) return;
      }
    }
    this.transientQueue.push(item);
    // Keep event feedback current instead of allowing a long stale backlog.
    while (this.transientQueue.length > 5) {
      var removed = false;
      for (var i = 0; i < this.transientQueue.length; i++) {
        if (this.transientQueue[i].type === 'chip') {
          this.transientQueue.splice(i, 1); removed = true; break;
        }
      }
      if (!removed) this.transientQueue.shift();
    }
    if (!this.transientActive) this.playTransient();
  };

  GameScene.prototype.playTransient = function () {
    if (this.transientActive || !this.transientQueue.length) return;
    var item = this.transientQueue.shift();
    this.transientActive = item;
    if (item.type === 'banner') this.showBoundaryBanner(item);
    else if (item.type === 'chip') this.showChip(item);
    else this.showCoach(item.text);
  };

  GameScene.prototype.transientTargets = function (type) {
    if (type === 'banner') return [this.bannerBg, this.bannerTxt, this.bannerSub, this.bannerMedal];
    if (type === 'coach') return [this.coachBg, this.coachTxt];
    return [this.chipBg, this.chipTxt];
  };

  GameScene.prototype.hideTransientViews = function () {
    var self = this;
    if (this.transientTimer) { this.transientTimer.remove(false); this.transientTimer = null; }
    if (this.coachFadeTimer) { this.coachFadeTimer.remove(false); this.coachFadeTimer = null; }
    var all = [this.bannerBg, this.bannerTxt, this.bannerSub, this.bannerMedal,
      this.chipBg, this.chipTxt, this.coachBg, this.coachTxt];
    this.tweens.killTweensOf(all);
    all.forEach(function (o) { o.setVisible(false).setAlpha(0); });
    this.bannerBg.setScale(1);
    this.bannerTxt.setY(414);
    this.bannerSub.setY(444);
    this.bannerMedal.setY(462);
    this.chipBg.setScale(1);
    this.coachBg.setScale(1);
  };

  GameScene.prototype.finishTransient = function (item) {
    var self = this;
    if (!item || this.transientActive !== item) return;
    if (this.transientTimer) { this.transientTimer.remove(false); this.transientTimer = null; }
    if (this.coachFadeTimer) { this.coachFadeTimer.remove(false); this.coachFadeTimer = null; }
    var targets = this.transientTargets(item.type);
    this.tweens.killTweensOf(targets);
    this.tweens.add({
      targets: targets, alpha: 0, duration: REDUCED ? 120 : 180,
      onComplete: function () {
        if (self.transientActive !== item) return;
        self.hideTransientViews();
        self.transientActive = null;
        self.playTransient();
      }
    });
  };

  GameScene.prototype.showBoundaryBanner = function (item) {
    var self = this, hasMedal = item.medal > 0;
    var group = [this.bannerBg, this.bannerTxt, this.bannerSub];
    if (hasMedal) group.push(this.bannerMedal);
    setTxt(this.bannerTxt, item.title);
    setTxt(this.bannerSub, item.sub);
    setCol(this.bannerTxt, item.color);
    this.bannerMedal.setTexture('medal_' + item.medal);
    this.bannerSub.setY(hasMedal ? 438 : 444);
    this.bannerMedal.setY(462);
    group.forEach(function (o) { o.setVisible(true).setAlpha(1); });
    if (REDUCED) {
      group.forEach(function (o) { o.setScale(1).setAlpha(0); });
      this.tweens.add({ targets: group, alpha: 1, duration: 140 });
    } else {
      this.bannerBg.setScale(0.86, 0.86);
      group.forEach(function (o) { if (o !== self.bannerBg) o.setAlpha(0); });
      this.tweens.add({ targets: this.bannerBg, scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.easeOut' });
      this.tweens.add({
        targets: group.filter(function (o) { return o !== self.bannerBg; }),
        alpha: 1, y: '-=3', duration: 180, delay: 50, ease: 'Back.easeOut'
      });
    }
    this.transientTimer = this.time.delayedCall(item.hold, function () {
      self.transientTimer = null;
      self.finishTransient(item);
    });
  };

  GameScene.prototype.showChip = function (item) {
    var self = this;
    setTxt(this.chipTxt, item.text);
    setCol(this.chipTxt, item.color);
    var w = clamp(Math.max(160, item.text.length * 9 + 34), 160, 300);
    this.chipBg.setPosition(20 + w / 2, 110).setSize(w, 28).setVisible(true).setAlpha(1);
    this.chipTxt.setPosition(32, 110).setVisible(true).setAlpha(1);
    if (!REDUCED) {
      this.chipBg.setScale(0.94, 0.94);
      this.tweens.add({ targets: this.chipBg, scaleX: 1, scaleY: 1, duration: 120, ease: 'Quad.easeOut' });
    }
    this.transientTimer = this.time.delayedCall(item.hold, function () {
      self.transientTimer = null;
      self.finishTransient(item);
    });
  };

  GameScene.prototype.refreshCoach = function (text) {
    var self = this;
    if (this.coachFadeTimer) { this.coachFadeTimer.remove(false); this.coachFadeTimer = null; }
    this.tweens.killTweensOf([this.coachBg, this.coachTxt]);
    setTxt(this.coachTxt, text);
    this.coachBg.setVisible(true).setAlpha(0.84);
    this.coachTxt.setVisible(true).setAlpha(1);
    this.tweens.add({ targets: [this.coachBg, this.coachTxt], alpha: 1, duration: REDUCED ? 100 : 180 });
    this.coachFadeTimer = this.time.delayedCall(3000, function () {
      self.tweens.add({ targets: self.coachBg, alpha: 0.12, duration: REDUCED ? 100 : 220 });
      self.tweens.add({ targets: self.coachTxt, alpha: 0.42, duration: REDUCED ? 100 : 220 });
    });
  };

  GameScene.prototype.showCoach = function (text) {
    this.refreshCoach(text);
  };

  // -------------------------------------------------------------- juice
  GameScene.prototype.shake = function (mag, ms) {
    if (REDUCED) return;
    kit.juice.shake(mag, ms);
  };
  GameScene.prototype.hitStop = function (ms) {
    if (REDUCED) return;
    kit.juice.hitStop(ms);
  };
  GameScene.prototype.damageFeedback = function () {
    var self = this;
    this.tweens.killTweensOf([this.damageVignette, this.damageFlash]);
    this.damageVignette.setVisible(true).setAlpha(REDUCED ? 0.38 : 0.82);
    this.damageFlash.setVisible(true).setAlpha(REDUCED ? 0.14 : 0.42);
    this.tweens.add({
      targets: this.damageFlash, alpha: 0, duration: REDUCED ? 180 : 90,
      yoyo: !REDUCED, hold: REDUCED ? 0 : 45
    });
    this.tweens.add({
      targets: this.damageVignette, alpha: 0, duration: REDUCED ? 420 : 760,
      delay: REDUCED ? 80 : 180,
      onComplete: function () { self.damageVignette.setVisible(false); self.damageFlash.setVisible(false); }
    });
  };
  GameScene.prototype.burst = function (emitter, x, y, count, tint) {
    // One tint op per emitter, set immediately before the explode: the pooled
    // particles carry it, and no per-particle callback runs.
    var c = tint == null ? 0xffffff : tint;
    if (emitter.__tint !== c) { emitter.__tint = c; emitter.setParticleTint(c); }
    emitter.explode(REDUCED ? Math.max(2, Math.round(count * 0.4)) : count, x, y);
  };
  GameScene.prototype.contactBeat = function (x, y, tint) {
    var slot = null;
    for (var i = 0; i < this.contactPool.length; i++) {
      if (!this.contactPool[i].active) { slot = this.contactPool[i]; break; }
    }
    if (!slot) return;
    slot.active = true; slot.t = slot.max;
    slot.spr.setVisible(true).setPosition(x, y).setScale(0.10).setAlpha(0.82).setTint(tint || 0xffffff);
  };
  GameScene.prototype.emitTrail = function (x, y) {
    var slot = null;
    for (var i = 0; i < this.trailPool.length; i++) {
      if (!this.trailPool[i].active) { slot = this.trailPool[i]; break; }
    }
    if (!slot) return;
    slot.active = true; slot.t = slot.max; slot.x = x; slot.y = y;
    slot.spr.setVisible(true).setPosition(x, y).setScale(0.34).setAlpha(0.42)
      .setTint(this.bSkin.trail || this.bSkin.glow || 0xffffff);
  };

  // ------------------------------------------------------------ wall load
  GameScene.prototype.loadWall = function (idx) {
    var self = this, Data = this.Data, s = this.sim;
    var wall = pickAt(Data.WALLS, idx, 0);
    var theme = pick(Data.THEMES, wall.theme, 'grid');
    s.wallIdx = idx;
    s.wall = wall;
    s.theme = theme;
    s.rng = mulberry32(0x51ED0000 ^ (wall.id * 2654435761));
    s.t = 0; s.stuns = 0; s.combo = 0; s.comboT = 0; s.mult = 1;
    s.fallT = wall.fallEvery || 0;
    s.multiFired = false;
    s.dropCount = 0;
    s.state = 'aim';
    s.armedList.length = 0;

    this.setTheme(wall.theme);

    // deactivate every pool
    this.ballPool.forEach(function (b) { b.active = false; b.spr.setVisible(false); });
    this.debrisPool.forEach(function (d) { d.active = false; d.spr.setVisible(false); });
    this.powerPool.forEach(function (p) { p.active = false; p.spr.setVisible(false); });
    this.boltPool.forEach(function (b) { b.active = false; b.spr.setVisible(false); });
    this.warnPool.forEach(function (w) { w.active = false; w.brick = -1; w.beam.setVisible(false); w.mark.setVisible(false); });
    this.brickView.forEach(function (v) { v.spr.setVisible(false); v.flash = 0; v.jitter = 0; });

    // parse the authored layout
    var rows = wall.rows || [];
    var cols = Data.COLS;
    s.gridRows = rows.length;
    s.grid = new Array(cols * rows.length);
    s.bricks.length = 0;
    var id = 0, r, c, ch, kind, hp;
    for (r = 0; r < rows.length; r++) {
      for (c = 0; c < cols; c++) {
        ch = rows[r].charAt(c);
        if (ch === '.' || ch === '') { s.grid[r * cols + c] = null; continue; }
        kind = 'b1'; hp = 1;
        if (ch === '1') { kind = 'b1'; hp = 1; }
        else if (ch === '2') { kind = 'b2'; hp = 2; }
        else if (ch === '3') { kind = 'b3'; hp = 3; }
        else if (ch === 'S') { kind = 'st'; hp = 5; }
        else if (ch === 'X') { kind = 'ch'; hp = 1; }
        else if (ch === 'U') { kind = 'un'; hp = 1; }
        else if (ch === 'P') { kind = 'pz'; hp = 1; }
        var b = {
          id: id, col: c, row: r,
          x: GRID_X0 + c * CELL_W, y: GRID_Y0 + r * CELL_H,
          w: BRICK_W, h: BRICK_H, kind: kind, hp: hp, maxHp: hp,
          alive: true, armed: false, warnT: 0, warnedLate: false, hadFloor: false
        };
        b.cx = b.x + b.w / 2; b.cy = b.y + b.h / 2;
        s.bricks.push(b);
        s.grid[r * cols + c] = b;
        id++;
        if (id >= MAX_BRICKS) break;
      }
    }
    // an unstable brick only self-arms if the cell it rested on is emptied
    for (var i = 0; i < s.bricks.length; i++) {
      var bb = s.bricks[i];
      if (bb.kind !== 'un') continue;
      bb.hadFloor = !!(bb.row + 1 < rows.length && s.grid[(bb.row + 1) * cols + bb.col]);
    }
    s.total = s.bricks.length;
    s.alive = s.bricks.length;

    // views
    for (i = 0; i < s.bricks.length; i++) {
      var v = this.brickView[i];
      var brick = s.bricks[i];
      v.tex = 'bk_' + wall.theme + '_' + brick.kind + '_0';
      v.spr.setTexture(v.tex);
      v.spr.setPosition(brick.cx, brick.cy);
      v.spr.setVisible(true).setAlpha(1).setScale(1).clearTint();
      v.flash = 0; v.jitter = 0;
    }

    // boss
    if (wall.boss) {
      var bw = wall.boss.w * CELL_W - (CELL_W - BRICK_W);
      var bh = wall.boss.h * CELL_H - (CELL_H - BRICK_H);
      s.boss = {
        alive: true, hp: wall.boss.hp, maxHp: wall.boss.hp, name: wall.boss.name || 'CORE',
        x: GRID_X0 + wall.boss.col * CELL_W, y: GRID_Y0 + wall.boss.row * CELL_H,
        w: bw, h: bh, slamT: wall.boss.slamEvery || 8, slamEvery: wall.boss.slamEvery || 8,
        slamOnHurt: wall.boss.slamOnHurt !== false, hurtSlamCd: 0, hurt: 0
      };
      s.boss.cx = s.boss.x + bw / 2; s.boss.cy = s.boss.y + bh / 2;
      this.bossSpr.setTexture('boss_' + wall.theme)
        .setDisplaySize(bw, bh).setPosition(s.boss.cx, s.boss.cy).setVisible(true).clearTint();
      this.bossGlow.setPosition(s.boss.cx, s.boss.cy).setDisplaySize(bw * 1.5, bh * 2.2).setVisible(true)
        .setTint(s.theme.accent2);
      this.bossBarBg.setVisible(true); this.bossBar.setVisible(true);
    } else {
      s.boss = null;
      this.bossSpr.setVisible(false); this.bossGlow.setVisible(false);
      this.bossBarBg.setVisible(false); this.bossBar.setVisible(false);
    }

    // paddle reset
    var p = this.paddle;
    p.x = VW / 2; p.targetX = VW / 2; p.w = PADDLE_W; p.vx = 0; p.aim = 0.28;
    p.stun = 0; p.shield = 0; p.laserCd = 0;
    p.wide = 0; p.sticky = 0; p.laser = 0; p.wreck = 0; p.slow = 0;
    this.applyPaddleWidth();
    this.spawnBall(true);

    // Wall intro is a run-boundary beat, so it may use the compact center
    // banner. Live event feedback below uses the shared corner lane instead.
    this.banner('WALL ' + pad(wall.id, 2), wall.name.toUpperCase(), '#eafffb', 0, 900);

    // tutorial: first run, first wall only
    if (idx === 0 && !this.save.tutorialDone && !SWITCHES.noTutorial) {
      s.tut = { step: 0, moved: 0, dropT: 0, spawned: false };
      this.coach('DRAG ANYWHERE TO STEER THE DECK');
    } else {
      s.tut = null;
      this.coach(null);
    }

    HOOK.signature = wall.signature || '';
    kit.audio.music(wall.boss ? 'music_surge' : 'music_deep', 900);
    this.updateHudStatic();
  };

  GameScene.prototype.updateHudStatic = function () {
    var s = this.sim;
    setTxt(this.hudWall, '#' + pad(s.wall.id, 2));
    setTxt(this.hudTarget, '◎' + fmtTime(s.wall.gold));
  };

  GameScene.prototype.applyPaddleWidth = function () {
    var p = this.paddle;
    p.w = p.wide > 0 ? PADDLE_W_WIDE : PADDLE_W;
    this.paddleSpr.setSize(p.w, PADDLE_H + 10);
    this.paddleStun.setSize(p.w, PADDLE_H + 10);
  };

  // ------------------------------------------------------------- entities
  GameScene.prototype.spawnBall = function (held, from) {
    var b = null;
    for (var i = 0; i < this.ballPool.length; i++) {
      if (!this.ballPool[i].active) { b = this.ballPool[i]; break; }
    }
    if (!b) return null;
    b.active = true;
    b.held = !!held;
    b.heavy = from ? from.heavy : this.paddle.wreck > 0;
    b.r = b.heavy ? BALL_R_HEAVY : BALL_R;
    if (from) {
      b.x = from.x; b.y = from.y; b.vx = from.vx; b.vy = from.vy;
    } else {
      b.x = this.paddle.x; b.y = PADDLE_Y - b.r - 3; b.vx = 0; b.vy = 0;
    }
    b.spr.setVisible(true).setScale(b.r / BALL_TEX_R).setPosition(b.x, b.y).setAlpha(1);
    return b;
  };
  GameScene.prototype.ballSpeed = function () {
    var s = this.sim;
    var base = s.wall.ballSpeed || 300;
    if (this.paddle.slow > 0) base *= 0.72;
    if (this.paddle.wreck > 0) base *= 1.05;
    return base;
  };
  GameScene.prototype.launchHeld = function () {
    var s = this.sim, launched = false, self = this;
    if (s.tut && s.tut.step < 1) return false;
    for (var i = 0; i < this.ballPool.length; i++) {
      var b = this.ballPool[i];
      if (!b.active || !b.held) continue;
      b.held = false;
      var sp = this.ballSpeed();
      // The deck carries a visible, player-adjustable aim. It stays
      // deterministic even when the paddle is stationary.
      var aim = this.paddle.aim;
      b.vx = Math.sin(aim) * sp;
      b.vy = -Math.abs(Math.cos(aim)) * sp;
      launched = true;
      this.burst(this.exSpark, b.x, b.y, 10, this.bSkin.glow);
    }
    if (launched) {
      s.state = 'play';
      SFX('launch');
      if (s.tut && s.tut.step <= 1) this.tutStep(2);
    }
    return launched;
  };
  GameScene.prototype.fireLance = function () {
    var p = this.paddle;
    if (p.laser <= 0 || p.laserCd > 0) return false;
    p.laserCd = 0.24;
    var made = 0;
    for (var side = -1; side <= 1; side += 2) {
      for (var i = 0; i < this.boltPool.length; i++) {
        var bo = this.boltPool[i];
        if (bo.active) continue;
        bo.active = true;
        bo.x = p.x + side * (p.w / 2 - 9);
        bo.y = PADDLE_Y - 10;
        bo.vy = -880;
        bo.spr.setVisible(true).setPosition(bo.x, bo.y);
        made++;
        break;
      }
    }
    if (made) SFX('lance');
    return made > 0;
  };
  GameScene.prototype.action = function () {
    var s = this.sim;
    if (s.state === 'over' || s.state === 'won') { this.toTitle(); return; }
    if (s.state === 'clear') return;
    if (this.launchHeld()) return;
    this.fireLance();
  };

  GameScene.prototype.spawnPower = function (x, y, forced) {
    var s = this.sim, Data = this.Data;
    var slot = null;
    for (var i = 0; i < this.powerPool.length; i++) {
      if (!this.powerPool[i].active) { slot = this.powerPool[i]; break; }
    }
    if (!slot) return null;
    var type = forced;
    if (!type) {
      var table = Data.DROP_TABLE, total = 0, k;
      for (k = 0; k < table.length; k++) {
        if (table[k][0] === 'life' && s.lives >= 4) continue;
        total += table[k][1];
      }
      var roll = s.rng() * total, acc = 0;
      for (k = 0; k < table.length; k++) {
        if (table[k][0] === 'life' && s.lives >= 4) continue;
        acc += table[k][1];
        if (roll <= acc) { type = table[k][0]; break; }
      }
      // generosity rule: early walls weight multiball far higher
      if (s.wall.id <= 3 && s.rng() < 0.34) type = 'multi';
    }
    if (!Data.POWERS[type]) type = 'multi';
    slot.active = true; slot.type = type; slot.x = x; slot.y = y; slot.vy = 132; slot.t = 0;
    slot.spr.setTexture('pu_' + type).setVisible(true).setPosition(x, y).setScale(1).setAlpha(1);
    s.dropCount++;
    return slot;
  };

  GameScene.prototype.applyPower = function (type, x, y) {
    var s = this.sim, Data = this.Data, self = this, p = this.paddle;
    var P = pick(Data.POWERS, type, 'multi');
    var px = x == null ? p.x : x, py = y == null ? PADDLE_Y : y;
    switch (P.key) {
      case 'multi': {
        var source = null, i;
        for (i = 0; i < this.ballPool.length; i++) {
          if (this.ballPool[i].active && !this.ballPool[i].held) { source = this.ballPool[i]; break; }
        }
        if (!source) {
          for (i = 0; i < this.ballPool.length; i++) if (this.ballPool[i].active) { source = this.ballPool[i]; break; }
        }
        if (source) {
          var sp = Math.max(this.ballSpeed(), Math.hypot(source.vx, source.vy));
          var baseA = Math.atan2(source.vy, source.vx);
          [-0.45, 0.45].forEach(function (off) {
            var nb = self.spawnBall(false, source);
            if (!nb) return;
            nb.held = false;
            nb.vx = Math.cos(baseA + off) * sp;
            nb.vy = Math.sin(baseA + off) * sp;
            if (source.held) { nb.vy = -Math.abs(nb.vy || sp * 0.8); }
          });
        }
        break;
      }
      case 'wreck':
        p.wreck = P.dur;
        this.ballPool.forEach(function (b) {
          if (!b.active) return;
          b.heavy = true; b.r = BALL_R_HEAVY; b.spr.setScale(b.r / BALL_TEX_R);
        });
        break;
      case 'wide': p.wide = P.dur; this.applyPaddleWidth(); break;
      case 'sticky': p.sticky = P.dur; break;
      case 'laser': p.laser = P.dur; break;
      case 'shield': p.shield = 1; break;
      case 'slow': p.slow = P.dur; break;
      case 'life':
        s.lives = Math.min(5, s.lives + 1);
        break;
      default: break;
    }
    SFX(P.sfx);
    var status = P.label;
    if (P.key === 'multi') {
      var liveCores = 0;
      for (i = 0; i < this.ballPool.length; i++) if (this.ballPool[i].active) liveCores++;
      status = 'MULTIBALL  ' + liveCores + ' CORES';
    } else if (P.key === 'life') {
      status = 'SPARE DECK  ' + s.lives + ' LIVES';
    }
    this.chip(status, css(P.color));
    this.burst(this.exChip, px, py, 26, P.color);
    this.burst(this.exGlow, px, py, 12, P.color);
    this.shake(5, 160);
  };

  // ---------------------------------------------------------- brick logic
  GameScene.prototype.brickAt = function (row, col) {
    var s = this.sim;
    if (row < 0 || col < 0 || col >= this.Data.COLS || row >= s.gridRows) return null;
    var b = s.grid[row * this.Data.COLS + col];
    return b && b.alive ? b : null;
  };

  GameScene.prototype.damageBrick = function (b, amount, cause, hx, hy) {
    var s = this.sim, v = this.brickView[b.id];
    if (!b.alive) return false;
    if (b.kind === 'un' && cause === 'ball') amount = Math.max(amount, 1);
    b.hp -= amount;
    if (b.hp > 0) {
      var dmg = b.maxHp > 1 ? clamp(Math.round((1 - b.hp / b.maxHp) * 2), 0, 2) : 0;
      var tex = 'bk_' + s.wall.theme + '_' + b.kind + '_' + dmg;
      if (v.tex !== tex) { v.tex = tex; v.spr.setTexture(tex); }
      v.flash = 0.09;
      SFX(b.kind === 'st' ? 'steel' : 'brick_hard');
      this.burst(this.exSpark, hx == null ? b.cx : hx, hy == null ? b.cy : hy, 5,
        b.kind === 'st' ? 0xffffff : brickColors(s.theme, b.kind));
      this.addScore(6);
      return false;
    }
    this.killBrick(b, cause);
    return true;
  };

  GameScene.prototype.killBrick = function (b, cause, depth) {
    var s = this.sim, self = this;
    if (!b.alive) return;
    b.alive = false;
    b.armed = false;
    s.grid[b.row * this.Data.COLS + b.col] = null;
    s.alive--;
    var v = this.brickView[b.id];
    v.spr.setVisible(false);
    this.releaseWarn(b.id);

    var color = brickColors(s.theme, b.kind);
    var pts = cause === 'crush' ? 15 : (b.kind === 'st' ? 70 : b.kind === 'b3' ? 45 : b.kind === 'b2' ? 32 : 25);
    if (cause === 'ball' || cause === 'bolt') {
      s.combo++;
      s.comboT = COMBO_WINDOW;
      s.mult = clamp(1 + Math.floor(s.combo / 5), 1, 5);
    }
    this.addScore(pts * s.mult);
    this.burst(this.exShard, b.cx, b.cy, cause === 'crush' ? 7 : 12, color);
    this.burst(this.exGlow, b.cx, b.cy, 4, shadeHex(color, 0.3));
    SFX(cause === 'crush' ? 'crush' : 'brick', { rate: clamp(1 + s.combo * 0.02, 1, 1.7) });
    this.shake(cause === 'crush' ? 5 : 3.4, 130);

    if (b.kind === 'ch') this.detonate(b, (depth || 0) + 1);
    if (b.kind === 'pz') this.spawnPower(b.cx, b.cy, null);
    else if (s.rng() < (s.wall.dropRate || 0.3)) this.spawnPower(b.cx, b.cy, null);

    // any unstable brick that just lost the cell under it starts its tell
    var above = this.brickAt(b.row - 1, b.col);
    if (above && above.kind === 'un' && above.hadFloor) this.armBrick(above);
    var side;
    for (side = -1; side <= 1; side += 2) {
      var n = this.brickAt(b.row, b.col + side);
      if (n && n.kind === 'un' && !this.brickAt(n.row + 1, n.col) && n.hadFloor) this.armBrick(n);
    }

    // free multiball trigger on the early walls
    if (!s.multiFired && s.wall.multiAt > 0 && s.total > 0) {
      var doneFrac = 1 - s.alive / s.total;
      if (doneFrac >= s.wall.multiAt) {
        s.multiFired = true;
        this.spawnPower(clamp(this.paddle.x, 60, VW - 60), GRID_Y0 + 30, 'multi');
      }
    }
    this.checkClear();
  };

  GameScene.prototype.detonate = function (b, depth) {
    var self = this, s = this.sim;
    if (depth > 4) return;
    this.burst(this.exGlow, b.cx, b.cy, 18, s.theme.charge);
    this.burst(this.exSpark, b.cx, b.cy, 22, 0xfff3c4);
    this.burst(this.exShard, b.cx, b.cy, 14, s.theme.charge);
    SFX('charge');
    this.shake(11, 300);
    this.hitStop(50);
    var dr, dc;
    for (dr = -1; dr <= 1; dr++) {
      for (dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var n = this.brickAt(b.row + dr, b.col + dc);
        if (n) this.killBrick(n, 'crush', depth);
      }
    }
    if (s.boss && s.boss.alive) {
      var bx = b.cx, by = b.cy;
      if (bx > s.boss.x - 40 && bx < s.boss.x + s.boss.w + 40 && by > s.boss.y - 40 && by < s.boss.y + s.boss.h + 40) {
        this.hurtBoss(6);
      }
    }
  };

  GameScene.prototype.armBrick = function (b) {
    var s = this.sim;
    if (!b || !b.alive || b.kind !== 'un' || b.armed) return false;
    var slot = null;
    for (var i = 0; i < this.warnPool.length; i++) {
      if (!this.warnPool[i].active) { slot = this.warnPool[i]; break; }
    }
    if (!slot) return false; // pool is the cap; the tell must never be silent
    b.armed = true;
    b.warnT = s.wall.warn || 1.1;
    b.warnedLate = false;
    s.armedList.push(b);
    slot.active = true; slot.brick = b.id;
    slot.beam.setVisible(true).setPosition(b.cx, (b.cy + FLOOR) / 2)
      .setDisplaySize(BRICK_W * 0.8, FLOOR - b.cy).setAlpha(0.35);
    slot.mark.setVisible(true).setPosition(b.cx, FLOOR - 22).setAlpha(0.9).setScale(1);
    SFX('warn');
    return true;
  };
  GameScene.prototype.releaseWarn = function (brickId) {
    for (var i = 0; i < this.warnPool.length; i++) {
      var w = this.warnPool[i];
      if (w.active && w.brick === brickId) {
        w.active = false; w.brick = -1;
        w.beam.setVisible(false); w.mark.setVisible(false);
      }
    }
  };
  GameScene.prototype.dropBrick = function (b) {
    var s = this.sim;
    if (!b.alive) return;
    var slot = null;
    for (var i = 0; i < this.debrisPool.length; i++) {
      if (!this.debrisPool[i].active) { slot = this.debrisPool[i]; break; }
    }
    b.alive = false;
    b.armed = false;
    s.grid[b.row * this.Data.COLS + b.col] = null;
    s.alive--;
    this.brickView[b.id].spr.setVisible(false);
    this.releaseWarn(b.id);
    if (slot) {
      slot.active = true;
      slot.x = b.cx; slot.y = b.cy;
      slot.vx = (s.rng() - 0.5) * 40; slot.vy = 60;
      slot.rot = 0; slot.spin = (s.rng() - 0.5) * 3.4; slot.crushes = 0;
      slot.spr.setTexture('chunk_' + s.wall.theme).setVisible(true)
        .setPosition(slot.x, slot.y).setRotation(0).setAlpha(1);
    }
    SFX('warn_drop');
    this.burst(this.exDust, b.cx, b.cy + 10, 5, s.theme.unstable);
    this.checkClear();
  };

  GameScene.prototype.hurtBoss = function (amount) {
    var s = this.sim;
    if (!s.boss || !s.boss.alive) return;
    s.boss.hp -= amount;
    s.boss.hurt = 0.12;
    if (s.boss.hp > 0 && s.boss.slamOnHurt && s.boss.hurtSlamCd <= 0) {
      s.boss.hurtSlamCd = 0.38;
      if (this.armBossUnstable()) {
        this.shake(6, 240);
        this.burst(this.exDust, s.boss.cx, s.boss.y + s.boss.h, 8, s.theme.accent2);
        SFX('warn', { rate: 1.25, gap: 0 });
      }
    }
    this.addScore(18 * s.mult);
    this.burst(this.exSpark, s.boss.cx, s.boss.cy, 8, s.theme.accent2);
    SFX('boss_hit');
    this.shake(4, 120);
    if (s.boss.hp <= 0) {
      s.boss.alive = false;
      s.boss.hp = 0;
      this.bossSpr.setVisible(false);
      this.bossGlow.setVisible(false);
      this.addScore(800);
      this.burst(this.exShard, s.boss.cx, s.boss.cy, 40, s.theme.accent);
      this.burst(this.exGlow, s.boss.cx, s.boss.cy, 26, 0xffffff);
      this.burst(this.exSpark, s.boss.cx, s.boss.cy, 44, s.theme.charge);
      SFX('boss_die');
      this.shake(18, 600);
      this.hitStop(90);
      this.chip('CORE DOWN  +800', '#ffc85b');
      this.checkClear();
    }
  };

  GameScene.prototype.addScore = function (n) {
    var s = this.sim;
    s.score += n;
    if (s.score > (this.save.best || 0)) {
      this.save.best = s.score;
    }
  };

  GameScene.prototype.checkClear = function () {
    var s = this.sim;
    if (s.state !== 'play' && s.state !== 'aim') return;
    if (s.alive > 0) return;
    if (s.boss && s.boss.alive) return;
    for (var i = 0; i < this.powerPool.length; i++) if (this.powerPool[i].active) return;
    for (i = 0; i < this.debrisPool.length; i++) if (this.debrisPool[i].active) return;
    this.completeWall();
  };

  // ------------------------------------------------------------- outcomes
  GameScene.prototype.medalFor = function (elapsed, stuns) {
    var w = this.sim.wall;
    if (elapsed <= w.gold && stuns === 0) return 3;
    if (elapsed <= w.silver && stuns <= 1) return 2;
    return 1;
  };

  GameScene.prototype.completeWall = function () {
    var self = this, s = this.sim, Data = this.Data;
    s.state = 'clear';
    var medal = this.medalFor(s.t, s.stuns);
    var md = pickAt(Data.MEDALS, medal, 0);
    var timeBonus = Math.max(0, Math.round((s.wall.silver - s.t) * 10));
    var medalBonus = medal === 3 ? 1500 : medal === 2 ? 800 : 300;
    this.addScore(500 + timeBonus + medalBonus);

    var key = String(s.wall.id);
    var rec = this.save.walls[key] || { medal: 0, bestMs: 0, cleared: false };
    rec.cleared = true;
    if (medal > (rec.medal || 0)) rec.medal = medal;
    if (!rec.bestMs || s.t * 1000 < rec.bestMs) rec.bestMs = Math.round(s.t * 1000);
    this.save.walls[key] = rec;
    this.save.cleared = progressOf(this.save).cleared;
    writeSave(this.save);

    SFX('clear');
    this.time.delayedCall(420, function () { SFX('medal'); });
    this.shake(14, 520);
    this.burst(this.exGlow, VW / 2, 420, 30, s.theme.accent);
    this.burst(this.exShard, VW / 2, 420, 34, s.theme.accent2);
    this.banner('WALL CLEAR', md.name + '   ' + fmtTime(s.t) + '   ' + (s.stuns === 0 ? 'NO STUN' : s.stuns + ' STUN'),
      '#eafffb', medal, 1600);

    var unlocked = this.checkUnlocks();
    var delay = 2400 + (unlocked ? 1500 : 0);
    this.time.delayedCall(2300, function () {
      if (unlocked) {
        self.banner('DECK UNLOCKED', unlocked.toUpperCase(), '#ffc85b', 0, 1400);
        SFX('unlock');
      }
    });
    this.time.delayedCall(delay, function () {
      if (s.wallIdx + 1 >= Data.WALLS.length) self.campaignComplete();
      else self.loadWall(s.wallIdx + 1);
    });
  };

  GameScene.prototype.checkUnlocks = function () {
    var prog = progressOf(this.save), Data = this.Data, unlocked = null, self = this;
    if (!this.save.seen) this.save.seen = {};
    function scan(list, kind) {
      list.forEach(function (sk) {
        if (!sk.need) return;
        var id = kind + ':' + sk.key;
        if (self.save.seen[id]) return;
        if (needMet(sk.need, prog)) {
          self.save.seen[id] = true;
          if (!unlocked) unlocked = sk.name;
        }
      });
    }
    scan(Data.PADDLE_SKINS, 'paddle');
    scan(Data.BALL_SKINS, 'ball');
    if (unlocked) writeSave(this.save);
    return unlocked;
  };

  GameScene.prototype.campaignComplete = function () {
    var s = this.sim;
    s.state = 'won';
    SFX('clear');
    this.showEnd('ALL TWELVE WALLS DOWN');
  };

  GameScene.prototype.loseBall = function (b) {
    var s = this.sim;
    b.active = false;
    b.spr.setVisible(false);
    this.burst(this.exGlow, b.x, FLOOR - 6, 12, 0xff5d6c);
    this.burst(this.exSpark, b.x, FLOOR - 6, 14, 0xff719d);
    this.shake(8, 220);
    var any = false;
    for (var i = 0; i < this.ballPool.length; i++) if (this.ballPool[i].active) { any = true; break; }
    if (any) return;
    SFX('lose');
    if (SWITCHES.invincible) { this.spawnBall(true); s.state = 'aim'; return; }
    s.lives--;
    if (s.lives <= 0) {
      this.gameOver();
      return;
    }
    s.combo = 0; s.mult = 1;
    this.paddle.stun = 0;
    this.spawnBall(true);
    s.state = 'aim';
    this.chip('DECK LOST  ' + s.lives + ' LIVES', '#ff719d');
  };

  GameScene.prototype.gameOver = function () {
    var s = this.sim;
    s.state = 'over';
    SFX('over');
    kit.audio.stopMusic(700);
    this.shake(16, 600);
    this.showEnd('RUN ENDED');
  };

  GameScene.prototype.showEnd = function (title) {
    var self = this, s = this.sim;
    if (s.score > (this.save.best || 0)) this.save.best = s.score;
    writeSave(this.save);
    var prog = progressOf(this.save);
    this.overlay = this.add.nineslice(VW / 2, 480, 'panel', null, 420, 380, 26, 26, 26, 26).setDepth(D.PANEL);
    var objs = [this.overlay];
    objs.push(this.add.text(VW / 2, 358, title, {
      fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#ff9fb5'
    }).setOrigin(0.5).setDepth(D.PANEL_TXT));
    objs.push(this.add.text(VW / 2, 412, 'SCORE ' + pad(s.score, 6), {
      fontFamily: FONT, fontSize: '22px', color: '#eafffb'
    }).setOrigin(0.5).setDepth(D.PANEL_TXT));
    objs.push(this.add.text(VW / 2, 448, 'BEST ' + pad(this.save.best || 0, 6), {
      fontFamily: FONT, fontSize: '15px', color: '#7f93b8'
    }).setOrigin(0.5).setDepth(D.PANEL_TXT));
    objs.push(this.add.text(VW / 2, 486, 'REACHED WALL ' + pad(s.wall.id, 2) + '  ' + s.wall.name.toUpperCase(), {
      fontFamily: FONT, fontSize: '14px', color: '#8fd8cf'
    }).setOrigin(0.5).setDepth(D.PANEL_TXT));
    objs.push(this.add.text(VW / 2, 512, 'MEDALS ' + prog.medals + '/12   GOLD ' + prog.gold, {
      fontFamily: FONT, fontSize: '14px', color: '#ffc85b'
    }).setOrigin(0.5).setDepth(D.PANEL_TXT));
    this.endObjs = objs;
    var retry = this.addButton(VW / 2, 566, 300, 60, 'RETRY WALL ' + pad(s.wall.id, 2), function () {
      self.restartViaKit(s.wall.id);
    }, { size: 17, depth: D.PANEL });
    var back = this.addButton(VW / 2, 634, 300, 60, 'BACK TO MENU', function () { self.toTitle(); },
      { size: 17, depth: D.PANEL, back: true });
    objs.push(retry.img, retry.txt, back.img, back.txt);
    this.focusButton(this.buttons.indexOf(retry));
    if (!REDUCED) {
      this.overlay.setScale(0.8);
      this.tweens.add({ targets: this.overlay, scale: 1, duration: 380, ease: 'Back.easeOut' });
    }
  };

  GameScene.prototype.toTitle = function () {
    writeSave(this.save);
    kit.audio.stopMusic(300);
    this.scene.start('title');
  };

  GameScene.prototype.restartViaKit = function (wallId) {
    this.pendingRestartWall = clamp(wallId || this.sim.wall.id, 1, 12);
    // GGKit clears held keyboard/pointer state before invoking its lifecycle
    // restart callback. Phaser restart is intentionally only reached there.
    kit.restart();
  };
  GameScene.prototype.restartFromKit = function () {
    var wall = this.pendingRestartWall || this.sim.wall.id;
    this.pendingRestartWall = null;
    this.scene.restart({ wall: wall, save: normalizeSave(this.save) });
  };

  // ------------------------------------------------------------ tutorial
  GameScene.prototype.tutStep = function (n) {
    var s = this.sim;
    if (!s.tut) return;
    s.tut.step = n;
    if (n === 1) this.coach('TAP ANYWHERE TO LAUNCH');
    else if (n === 2) { this.coach('CATCH THE DROP WITH YOUR DECK'); s.tut.dropT = 1.4; }
    else if (n >= 3) {
      this.coach(null);
      s.tut = null;
      this.save.tutorialDone = true;
      writeSave(this.save);
    }
  };

  // ---------------------------------------------------------------- step
  GameScene.prototype.step = function (dt) {
    var s = this.sim, p = this.paddle, i, j;
    // Medal time is active play time only. Aim, respawn, sticky holds and the
    // tutorial do not consume the wall's clock.
    if (s.state === 'play') s.t += dt;

    // paddle timers, all in stepped simulation seconds
    if (p.stun > 0) {
      p.stun -= dt;
      if (p.stun <= 0) {
        p.stun = 0;
        SFX('recover');
        this.chip('DECK ONLINE', '#8ff0e0');
        this.burst(this.exGlow, p.x, PADDLE_Y, 12, 0x8ff0e0);
      }
    }
    if (p.wide > 0) { p.wide -= dt; if (p.wide <= 0) { p.wide = 0; this.applyPaddleWidth(); } }
    if (p.sticky > 0) p.sticky = Math.max(0, p.sticky - dt);
    if (p.laser > 0) p.laser = Math.max(0, p.laser - dt);
    if (p.slow > 0) p.slow = Math.max(0, p.slow - dt);
    if (p.laserCd > 0) p.laserCd = Math.max(0, p.laserCd - dt);
    if (p.wreck > 0) {
      p.wreck -= dt;
      if (p.wreck <= 0) {
        p.wreck = 0;
        this.ballPool.forEach(function (b) {
          if (!b.active) return;
          b.heavy = false; b.r = BALL_R; b.spr.setScale(b.r / BALL_TEX_R);
        });
      }
    }
    if (s.comboT > 0) {
      s.comboT -= dt;
      if (s.comboT <= 0) { s.combo = 0; s.mult = 1; }
    }

    // paddle motion: 1:1 while healthy, speed limited while stunned
    var half = p.w / 2;
    var lo = RAIL_L + half, hi = RAIL_R - half;
    p.targetX = clamp(p.targetX, lo, hi);
    var prevX = p.x;
    if (p.stun > 0) {
      var maxStep = 210 * dt;
      var d = clamp(p.targetX - p.x, -maxStep, maxStep);
      p.x += d;
    } else {
      p.x = p.targetX;
    }
    p.x = clamp(p.x, lo, hi);
    p.vx = (p.x - prevX) / dt;

    // --------------------------------------------------------- unstable
    if (s.wall.fallEvery > 0 && s.state === 'play') {
      s.fallT -= dt;
      if (s.fallT <= 0) {
        s.fallT = s.wall.fallEvery;
        this.armRandomUnstable();
      }
    }
    // Armed bricks are kept in their own short list, so the substep loop never
    // walks the whole wall (108 cells x 8 substeps a frame adds up).
    for (i = s.armedList.length - 1; i >= 0; i--) {
      var ub = s.armedList[i];
      if (!ub.alive || !ub.armed) { s.armedList.splice(i, 1); continue; }
      ub.warnT -= dt;
      if (!ub.warnedLate && ub.warnT <= 0.3) {
        ub.warnedLate = true;
        SFX('warn', { rate: 1.35, gap: 0 });
      }
      if (ub.warnT <= 0) { s.armedList.splice(i, 1); this.dropBrick(ub); }
    }

    // --------------------------------------------------------------- boss
    if (s.boss && s.boss.alive) {
      if (s.boss.hurt > 0) s.boss.hurt = Math.max(0, s.boss.hurt - dt);
      if (s.boss.hurtSlamCd > 0) s.boss.hurtSlamCd = Math.max(0, s.boss.hurtSlamCd - dt);
      if (s.state === 'play') {
        s.boss.slamT -= dt;
        if (s.boss.slamT <= 0) {
          s.boss.slamT = s.boss.slamEvery;
          if (this.armRandomUnstable()) {
            this.shake(7, 260);
            this.burst(this.exDust, s.boss.cx, s.boss.y + s.boss.h, 10, s.theme.accent2);
          }
        }
      }
    }

    // --------------------------------------------------------------- balls
    var speed = this.ballSpeed();
    for (i = 0; i < this.ballPool.length; i++) {
      var b = this.ballPool[i];
      if (!b.active) continue;
      if (b.held) {
        b.x = clamp(p.x, RAIL_L + b.r, RAIL_R - b.r);
        b.y = PADDLE_Y - b.r - 3;
        continue;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < RAIL_L + b.r) {
        b.x = RAIL_L + b.r; b.vx = Math.abs(b.vx); SFX('paddle', { rate: 1.5, volume: 0.4 });
        this.contactBeat(b.x, b.y, this.bSkin.trail);
      } else if (b.x > RAIL_R - b.r) {
        b.x = RAIL_R - b.r; b.vx = -Math.abs(b.vx); SFX('paddle', { rate: 1.5, volume: 0.4 });
        this.contactBeat(b.x, b.y, this.bSkin.trail);
      }
      if (b.y < CEIL + b.r) {
        b.y = CEIL + b.r; b.vy = Math.abs(b.vy); SFX('paddle', { rate: 1.7, volume: 0.4 });
        this.contactBeat(b.x, b.y, this.bSkin.trail);
      }

      // paddle
      if (b.vy > 0 && b.y + b.r >= PADDLE_Y && b.y - b.r <= PADDLE_Y + PADDLE_H &&
          b.x >= p.x - half - b.r * 0.6 && b.x <= p.x + half + b.r * 0.6) {
        b.y = PADDLE_Y - b.r - 0.5;
        var off = clamp((b.x - p.x) / half, -1, 1);
        var ang = off * 1.05 + clamp(p.vx / 2600, -0.18, 0.18);
        var sp = speed * (b.heavy ? 1.02 : 1);
        b.vx = Math.sin(ang) * sp;
        b.vy = -Math.abs(Math.cos(ang)) * sp;
        if (p.sticky > 0) { b.held = true; s.state = 'aim'; }
        SFX('paddle');
        this.burst(this.exSpark, b.x, PADDLE_Y, 6, this.pSkin.body);
        this.shake(2, 90);
        s.combo = 0; s.mult = 1; s.comboT = 0;
        if (s.tut && s.tut.step === 0) { /* movement gate handled on drag */ }
      }

      // bricks: only the cells the ball actually overlaps
      this.collideBallBricks(b);

      // boss
      if (s.boss && s.boss.alive && this.circleRect(b, s.boss.x, s.boss.y, s.boss.w, s.boss.h)) {
        this.reflect(b, s.boss.x, s.boss.y, s.boss.w, s.boss.h, speed);
        this.hurtBoss(b.heavy ? 3 : 1);
      }

      // debris
      for (j = 0; j < this.debrisPool.length; j++) {
        var dz = this.debrisPool[j];
        if (!dz.active) continue;
        if (!this.circleRect(b, dz.x - BRICK_W / 2, dz.y - BRICK_H / 2, BRICK_W, BRICK_H)) continue;
        if (b.heavy) {
          this.smashDebris(dz, true);
        } else {
          this.reflect(b, dz.x - BRICK_W / 2, dz.y - BRICK_H / 2, BRICK_W, BRICK_H, speed);
          dz.vy *= 0.6;
        }
        break;
      }

      // floor
      if (b.y - b.r > FLOOR) {
        if (p.shield > 0) {
          p.shield = 0;
          b.y = FLOOR - b.r;
          b.vy = -Math.abs(b.vy);
          SFX('catch_shield');
          this.burst(this.exGlow, b.x, FLOOR, 18, 0x5ca8ff);
          this.chip('FLOOR NET SPENT', '#9fd8ff');
          this.shake(6, 200);
        } else {
          this.loseBall(b);
        }
      }
    }

    // ---------------------------------------------------------- debris
    for (i = 0; i < this.debrisPool.length; i++) {
      var d = this.debrisPool[i];
      if (!d.active) continue;
      d.vy += 1180 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.spin * dt;
      // crush the wall on the way down
      if (d.vy > 0) {
        var row = Math.floor((d.y - GRID_Y0) / CELL_H);
        var col = Math.floor((d.x - GRID_X0) / CELL_W);
        var hit = this.brickAt(row, col);
        if (hit) {
          this.killBrick(hit, 'crush');
          d.crushes++;
          d.vy *= 0.66;
          this.shake(5, 140);
          if (d.crushes >= 3) { this.smashDebris(d, false); continue; }
        }
      }
      // the deck
      if (d.y + BRICK_H / 2 >= PADDLE_Y && d.y - BRICK_H / 2 <= PADDLE_Y + PADDLE_H &&
          d.x > p.x - half - BRICK_W / 2 && d.x < p.x + half + BRICK_W / 2) {
        this.stunPaddle();
        this.smashDebris(d, false);
        continue;
      }
      if (d.y > FLOOR + 30) {
        this.burst(this.exDust, d.x, FLOOR, 10, this.sim.theme.unstable);
        SFX('impact');
        this.shake(4, 150);
        d.active = false;
        d.spr.setVisible(false);
      }
    }

    // ---------------------------------------------------------- powerups
    for (i = 0; i < this.powerPool.length; i++) {
      var pu = this.powerPool[i];
      if (!pu.active) continue;
      pu.t += dt;
      pu.y += pu.vy * dt;
      if (pu.y + 17 >= PADDLE_Y - 4 && pu.y - 17 <= PADDLE_Y + PADDLE_H + 6 &&
          pu.x > p.x - half - 24 && pu.x < p.x + half + 24) {
        pu.active = false;
        pu.spr.setVisible(false);
        this.applyPower(pu.type, pu.x, PADDLE_Y - 10);
        if (s.tut && s.tut.step === 2) this.tutStep(3);
        continue;
      }
      if (pu.y > VH + 40) { pu.active = false; pu.spr.setVisible(false); }
    }

    // ------------------------------------------------------------ bolts
    for (i = 0; i < this.boltPool.length; i++) {
      var bo = this.boltPool[i];
      if (!bo.active) continue;
      bo.y += bo.vy * dt;
      var brow = Math.floor((bo.y - GRID_Y0) / CELL_H);
      var bcol = Math.floor((bo.x - GRID_X0) / CELL_W);
      var target = this.brickAt(brow, bcol);
      if (target) {
        this.damageBrick(target, 1, 'bolt', bo.x, bo.y);
        bo.active = false; bo.spr.setVisible(false);
        continue;
      }
      if (s.boss && s.boss.alive && bo.x > s.boss.x && bo.x < s.boss.x + s.boss.w &&
          bo.y < s.boss.y + s.boss.h && bo.y > s.boss.y) {
        this.hurtBoss(1);
        bo.active = false; bo.spr.setVisible(false);
        continue;
      }
      if (bo.y < CEIL - 20) { bo.active = false; bo.spr.setVisible(false); }
    }

    // ---------------------------------------------------------- tutorial
    if (s.tut && s.tut.step === 2 && !s.tut.spawned) {
      s.tut.dropT -= dt;
      if (s.tut.dropT <= 0) {
        s.tut.spawned = true;
        // straight down the deck's own column: the first catch must be a
        // guaranteed success, not a reaction test
        this.spawnPower(clamp(p.x, 60, VW - 60), GRID_Y0 + 60, 'multi');
      }
    }
    this.checkClear();
  };

  GameScene.prototype.armRandomUnstable = function () {
    var s = this.sim, cands = [], i;
    for (i = 0; i < s.bricks.length; i++) {
      var b = s.bricks[i];
      if (b.alive && b.kind === 'un' && !b.armed) cands.push(b);
    }
    if (!cands.length) return false;
    // half the time the wall aims at the deck, which reads as intent
    var pickB;
    if (s.rng() < 0.5) {
      pickB = cands[0];
      var bestD = 1e9;
      for (i = 0; i < cands.length; i++) {
        var dd = Math.abs(cands[i].cx - this.paddle.x);
        if (dd < bestD) { bestD = dd; pickB = cands[i]; }
      }
    } else {
      pickB = cands[Math.floor(s.rng() * cands.length) % cands.length];
    }
    return this.armBrick(pickB);
  };
  GameScene.prototype.armBossUnstable = function () {
    var s = this.sim, boss = s.boss, pickB = null, best = 1e9;
    if (!boss) return false;
    for (var i = 0; i < s.bricks.length; i++) {
      var b = s.bricks[i];
      if (!b.alive || b.kind !== 'un' || b.armed) continue;
      var d = Math.abs(b.cx - boss.cx) + Math.abs(b.cy - boss.cy);
      if (d < best) { best = d; pickB = b; }
    }
    return this.armBrick(pickB);
  };

  GameScene.prototype.smashDebris = function (d, byBall) {
    d.active = false;
    d.spr.setVisible(false);
    this.burst(this.exShard, d.x, d.y, 12, this.sim.theme.unstable);
    this.burst(this.exSpark, d.x, d.y, 8, 0xffe08a);
    SFX('crush');
    this.shake(6, 180);
    if (byBall) this.addScore(40 * this.sim.mult);
  };

  GameScene.prototype.stunPaddle = function () {
    var s = this.sim, p = this.paddle;
    if (p.stun > 0) return;
    p.stun = 1.05;
    p.stunMax = 1.05;
    s.stuns++;
    s.combo = 0; s.mult = 1;
    SFX('stun');
    this.burst(this.exShard, p.x, PADDLE_Y, 20, 0xff5d6c);
    this.burst(this.exSpark, p.x, PADDLE_Y, 18, 0xffd0d6);
    this.shake(REDUCED ? 0 : 15, 480);
    this.damageFeedback();
    this.hitStop(70);
    this.chip('DECK STUNNED', '#ff9fb5');
  };

  GameScene.prototype.circleRect = function (b, rx, ry, rw, rh) {
    var cx = clamp(b.x, rx, rx + rw), cy = clamp(b.y, ry, ry + rh);
    var dx = b.x - cx, dy = b.y - cy;
    return dx * dx + dy * dy <= b.r * b.r;
  };
  // Reflect off the axis with the smaller overlap and push the ball clear, so
  // a fast ball can never tunnel into a brick and jitter inside it.
  GameScene.prototype.reflect = function (b, rx, ry, rw, rh, speed) {
    var cx = rx + rw / 2, cy = ry + rh / 2;
    var ox = (rw / 2 + b.r) - Math.abs(b.x - cx);
    var oy = (rh / 2 + b.r) - Math.abs(b.y - cy);
    if (ox < oy) {
      b.vx = b.x < cx ? -Math.abs(b.vx) : Math.abs(b.vx);
      b.x += b.x < cx ? -ox : ox;
    } else {
      b.vy = b.y < cy ? -Math.abs(b.vy) : Math.abs(b.vy);
      b.y += b.y < cy ? -oy : oy;
    }
    var len = Math.hypot(b.vx, b.vy) || 1;
    var sp = speed || len;
    b.vx = b.vx / len * sp;
    b.vy = b.vy / len * sp;
    // never let the ball settle into a horizontal groove
    if (Math.abs(b.vy) < sp * 0.20) {
      b.vy = (b.vy < 0 ? -1 : 1) * sp * 0.20;
      var nx = Math.sqrt(Math.max(0, sp * sp - b.vy * b.vy));
      b.vx = (b.vx < 0 ? -1 : 1) * nx;
    }
  };

  GameScene.prototype.collideBallBricks = function (b) {
    var s = this.sim, cols = this.Data.COLS;
    var r0 = Math.floor((b.y - b.r - GRID_Y0) / CELL_H);
    var r1 = Math.floor((b.y + b.r - GRID_Y0) / CELL_H);
    var c0 = Math.floor((b.x - b.r - GRID_X0) / CELL_W);
    var c1 = Math.floor((b.x + b.r - GRID_X0) / CELL_W);
    if (r1 < 0 || r0 >= s.gridRows) return;
    var speed = this.ballSpeed();
    for (var r = Math.max(0, r0); r <= Math.min(s.gridRows - 1, r1); r++) {
      for (var c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
        var br = s.grid[r * cols + c];
        if (!br || !br.alive) continue;
        if (!this.circleRect(b, br.x, br.y, br.w, br.h)) continue;
        var dmg = b.heavy ? 2 : 1;
        var destroyed = this.damageBrick(br, dmg, 'ball', b.x, b.y);
        // a wrecking ball only plows through what it actually broke
        if (!destroyed || !b.heavy) {
          this.reflect(b, br.x, br.y, br.w, br.h, speed);
          return;
        }
        return;
      }
    }
  };

  // ---------------------------------------------------------------- render
  GameScene.prototype.render = function (rdt) {
    var s = this.sim, p = this.paddle, i;

    this.trailTick += rdt;
    if (this.trailTick >= 0.04) {
      this.trailTick = 0;
      for (i = 0; i < this.ballPool.length; i++) {
        if (this.ballPool[i].active && !this.ballPool[i].held) this.emitTrail(this.ballPool[i].x, this.ballPool[i].y);
      }
    }
    for (i = 0; i < this.trailPool.length; i++) {
      var tr = this.trailPool[i];
      if (!tr.active) continue;
      tr.t -= rdt;
      if (tr.t <= 0) { tr.active = false; tr.spr.setVisible(false); continue; }
      var trailK = tr.t / tr.max;
      tr.spr.setPosition(tr.x, tr.y).setScale(0.12 + trailK * 0.22).setAlpha(trailK * 0.42);
    }
    for (i = 0; i < this.contactPool.length; i++) {
      var beat = this.contactPool[i];
      if (!beat.active) continue;
      beat.t -= rdt;
      if (beat.t <= 0) { beat.active = false; beat.spr.setVisible(false); continue; }
      var beatK = 1 - beat.t / beat.max;
      beat.spr.setScale(0.10 + beatK * 0.24).setAlpha((1 - beatK) * 0.82);
    }

    // bricks: only the small flashing set is touched per frame
    for (i = 0; i < s.bricks.length; i++) {
      var b = s.bricks[i], v = this.brickView[i];
      if (!b.alive) continue;
      if (v.flash > 0) {
        v.flash -= rdt;
        if (v.flash <= 0) { v.spr.clearTint(); v.flash = 0; }
        else v.spr.setTintFill(0xffffff);
      }
    }
    for (i = 0; i < s.armedList.length; i++) {
      var ab = s.armedList[i];
      if (!ab.alive) continue;
      var av = this.brickView[ab.id];
      var pulse = 0.5 + 0.5 * Math.sin(s.t * 26);
      av.spr.setTint(lerpHex(0xffffff, 0xffb24b, pulse));
      av.spr.setPosition(ab.cx + (REDUCED ? 0 : (Math.random() - 0.5) * 3.2), ab.cy);
    }
    // warning tells
    for (i = 0; i < this.warnPool.length; i++) {
      var w = this.warnPool[i];
      if (!w.active) continue;
      var wb = s.bricks[w.brick];
      if (!wb || !wb.alive || !wb.armed) { this.releaseWarn(w.brick); continue; }
      var k = 1 - clamp(wb.warnT / (s.wall.warn || 1.1), 0, 1);
      var flick = 0.5 + 0.5 * Math.sin(s.t * (14 + k * 26));
      w.beam.setPosition(wb.cx, (wb.cy + FLOOR) / 2)
        .setDisplaySize(BRICK_W * (0.6 + k * 0.5), FLOOR - wb.cy)
        .setAlpha(0.18 + 0.34 * flick * (0.4 + k));
      w.mark.setPosition(wb.cx, FLOOR - 22)
        .setAlpha(0.5 + 0.5 * flick)
        .setScale(0.85 + k * 0.35 + flick * 0.08);
    }
    // balls
    for (i = 0; i < this.ballPool.length; i++) {
      var ball = this.ballPool[i];
      if (!ball.active) { if (ball.spr.visible) ball.spr.setVisible(false); continue; }
      ball.spr.setPosition(ball.x, ball.y);
      if (ball.heavy) ball.spr.setTint(0xffca66); else ball.spr.clearTint();
    }
    // debris
    for (i = 0; i < this.debrisPool.length; i++) {
      var d = this.debrisPool[i];
      if (!d.active) { if (d.spr.visible) d.spr.setVisible(false); continue; }
      d.spr.setPosition(d.x, d.y).setRotation(d.rot);
    }
    // powerups
    for (i = 0; i < this.powerPool.length; i++) {
      var pu = this.powerPool[i];
      if (!pu.active) { if (pu.spr.visible) pu.spr.setVisible(false); continue; }
      pu.spr.setPosition(pu.x, pu.y + Math.sin(pu.t * 5) * 2);
      pu.spr.setRotation(REDUCED ? 0 : Math.sin(pu.t * 3) * 0.09);
    }
    // bolts
    for (i = 0; i < this.boltPool.length; i++) {
      var bo = this.boltPool[i];
      if (!bo.active) { if (bo.spr.visible) bo.spr.setVisible(false); continue; }
      bo.spr.setPosition(bo.x, bo.y);
    }
    // paddle
    this.paddleSpr.setX(p.x);
    if (p.stun > 0) {
      this.paddleStun.setVisible(true).setX(p.x).setAlpha(0.5 + 0.5 * Math.sin(s.t * 34));
      var kk = clamp(p.stun / p.stunMax, 0, 1);
      this.stunRing.setVisible(true).setPosition(p.x, PADDLE_Y + PADDLE_H / 2)
        .setScale(0.28 + kk * 0.5).setAlpha(0.25 + kk * 0.55);
    } else {
      if (this.paddleStun.visible) this.paddleStun.setVisible(false);
      if (this.stunRing.visible) this.stunRing.setVisible(false);
    }
    if (p.shield > 0) {
      this.shieldSpr.setVisible(true).setAlpha(0.45 + 0.25 * Math.sin(s.t * 4));
    } else if (this.shieldSpr.visible) this.shieldSpr.setVisible(false);
    var heldBall = false;
    for (i = 0; i < this.ballPool.length; i++) if (this.ballPool[i].active && this.ballPool[i].held) { heldBall = true; break; }
    if (heldBall && s.state === 'aim') {
      this.aimLine.setVisible(true)
        .setPosition(p.x + Math.sin(p.aim) * 54, PADDLE_Y - 46 - Math.cos(p.aim) * 54)
        .setRotation(p.aim).setScale(1, 4).setAlpha(0.35);
    } else if (this.aimLine.visible) this.aimLine.setVisible(false);

    // boss
    if (s.boss && s.boss.alive) {
      if (s.boss.hurt > 0) this.bossSpr.setTintFill(0xffffff); else this.bossSpr.clearTint();
      var bp = REDUCED ? 0.5 : 0.5 + 0.5 * Math.sin(s.t * 3);
      this.bossGlow.setAlpha(0.24 + bp * 0.26);
    }
    this.renderHud();
  };

  GameScene.prototype.renderHud = function () {
    var s = this.sim, p = this.paddle, i;
    setTxt(this.hudScore, pad(s.score, 6));
    setTxt(this.hudTimer, fmtTime(s.t));
    var col = s.t <= s.wall.gold && s.stuns === 0 ? '#8ff0e0'
      : (s.t <= s.wall.silver && s.stuns <= 1 ? '#cdd8e6' : '#c98a53');
    setCol(this.hudTimer, col);
    setTxt(this.hudTarget, s.stuns === 0 ? '◎' + fmtTime(s.wall.gold) : '!' + s.stuns);
    for (i = 0; i < this.lifePips.length; i++) {
      var want = i < s.lives;
      if (this.lifePips[i].visible !== (i < Math.max(3, s.lives))) {
        this.lifePips[i].setVisible(i < Math.max(3, s.lives));
      }
      var tex = want ? 'life_on' : 'life_off';
      if (this.lifePips[i].texture.key !== tex) this.lifePips[i].setTexture(tex);
    }
    setTxt(this.comboTxt, s.combo >= 3 ? 'x' + s.mult : '');

    if (s.boss) {
      var frac = clamp(s.boss.hp / s.boss.maxHp, 0, 1);
      this.bossBar.setSize(Math.max(1, 336 * frac), 10);
      if (this.bossBarBg.visible !== s.boss.alive) {
        this.bossBarBg.setVisible(s.boss.alive);
        this.bossBar.setVisible(s.boss.alive);
      }
    }

    // active effects row
    var eff = [];
    if (p.wreck > 0) eff.push(['wreck', p.wreck, 9]);
    if (p.wide > 0) eff.push(['wide', p.wide, 13]);
    if (p.sticky > 0) eff.push(['sticky', p.sticky, 13]);
    if (p.laser > 0) eff.push(['laser', p.laser, 12]);
    if (p.slow > 0) eff.push(['slow', p.slow, 9]);
    if (p.shield > 0) eff.push(['shield', 1, 1]);
    for (i = 0; i < this.effectPips.length; i++) {
      var pip = this.effectPips[i];
      if (i < eff.length) {
        var key = 'pip_' + eff[i][0];
        if (pip.img.texture.key !== key) pip.img.setTexture(key);
        if (!pip.img.visible) { pip.img.setVisible(true); pip.bar.setVisible(true); }
        pip.bar.setSize(Math.max(1, 22 * clamp(eff[i][1] / eff[i][2], 0, 1)), 4);
      } else if (pip.img.visible) {
        pip.img.setVisible(false); pip.bar.setVisible(false);
      }
    }
  };

  // ------------------------------------------------------------ main loop
  GameScene.prototype.update = function (time, delta) {
    var self = this, s = this.sim, p = this.paddle;

    // input first: the deck must react on the same frame the finger moved
    var moved = 0;
    this.pollPointers(function (dx) {
      if (s.state === 'over' || s.state === 'won') return;
      p.targetX += dx;
      p.aim = clamp(p.aim + dx * 0.0032, -0.72, 0.72);
      moved += Math.abs(dx);
    }, function () {
      self.action();
    });
    if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) {
      p.targetX -= 620 * (delta / 1000); p.aim = clamp(p.aim - 1.4 * (delta / 1000), -0.72, 0.72); moved += 6;
    }
    if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) {
      p.targetX += 620 * (delta / 1000); p.aim = clamp(p.aim + 1.4 * (delta / 1000), -0.72, 0.72); moved += 6;
    }
    if (s.state !== 'over' && s.state !== 'won' &&
        (this.keyEdge('Space') || this.keyEdge('KeyW') || this.keyEdge('ArrowUp'))) this.action();
    if (this.keyEdge('Enter')) {
      if (s.state === 'over' || s.state === 'won') this.activateButton(this.buttons[this.focusIndex]);
      else this.action();
    }
    if (s.state === 'over' || s.state === 'won') {
      if (this.keyEdge('ArrowDown') || this.keyEdge('ArrowRight')) this.moveButtonFocus(1);
      if (this.keyEdge('ArrowUp') || this.keyEdge('ArrowLeft')) this.moveButtonFocus(-1);
    }
    if (this.keyEdge('Escape')) kit.openSettings();

    if (s.tut && s.tut.step === 0) {
      s.tut.moved += moved;
      if (s.tut.moved > 70) this.tutStep(1);
    }

    // fixed-step simulation. A slow device runs slow motion; it never skips.
    var juice = kit.juice.frame();
    var running = !kit.paused && s.state !== 'over' && s.state !== 'won' && s.state !== 'clear';
    if (kit.paused) {
      this.acc = 0;
    } else {
      this.acc += delta / 1000;
      var budget = MAX_STEPS * STEP;
      if (this.acc > budget) { this.acc = budget; HOOK.slowmo = true; } else { HOOK.slowmo = false; }
      var steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        if (running) this.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      HOOK.steps = steps;
    }

    var cam = this.cameras.main;
    cam.setScroll(juice.dx, juice.dy);

    this.render(Math.min(0.05, delta / 1000));
    this.publishHook();
  };

  // ------------------------------------------------------------- the hook
  GameScene.prototype.publishHook = function () {
    var s = this.sim, p = this.paddle, i, live_ = 0, held = 0, pw = 0, fall = 0, warn = 0;
    for (i = 0; i < this.ballPool.length; i++) {
      if (!this.ballPool[i].active) continue;
      live_++;
      if (this.ballPool[i].held) held++;
    }
    for (i = 0; i < this.powerPool.length; i++) if (this.powerPool[i].active) pw++;
    for (i = 0; i < this.debrisPool.length; i++) if (this.debrisPool[i].active) fall++;
    for (i = 0; i < this.warnPool.length; i++) if (this.warnPool[i].active) warn++;

    HOOK.phase = s.state;
    HOOK.level = s.wall.id;
    HOOK.wall = s.wall.id;
    HOOK.wallName = s.wall.name;
    HOOK.theme = s.wall.theme;
    HOOK.signature = s.wall.signature;
    HOOK.lives = s.lives;
    HOOK.balls = live_;
    HOOK.ballsHeld = held;
    HOOK.score = s.score;
    HOOK.best = this.save.best || 0;
    HOOK.combo = s.combo;
    HOOK.mult = s.mult;
    HOOK.bricks = s.alive;
    HOOK.bricksTotal = s.total;
    HOOK.boss = s.boss ? Math.max(0, s.boss.hp) : 0;
    HOOK.bossMax = s.boss ? s.boss.maxHp : 0;
    HOOK.stun = Math.max(0, p.stun);
    HOOK.stunned = p.stun > 0;
    HOOK.stuns = s.stuns;
    HOOK.falling = fall;
    HOOK.warning = warn;
    HOOK.powerups = pw;
    HOOK.shield = p.shield;
    HOOK.elapsed = Math.round(s.t * 100) / 100;
    HOOK.goldAt = s.wall.gold;
    HOOK.silverAt = s.wall.silver;
    HOOK.medal = this.medalFor(s.t, s.stuns);
    HOOK.medalName = (pickAt(this.Data.MEDALS, HOOK.medal, 0) || { name: 'NONE' }).name;
    HOOK.paddleSkin = this.pSkin.key;
    HOOK.ballSkin = this.bSkin.key;
    HOOK.tutorial = s.tut ? ['steer', 'launch', 'catch'][s.tut.step] || 'done' : 'done';
    HOOK.tutorialStep = s.tut ? s.tut.step : -1;
    HOOK.active = {
      wreck: Math.round(p.wreck * 10) / 10, wide: Math.round(p.wide * 10) / 10,
      sticky: Math.round(p.sticky * 10) / 10, laser: Math.round(p.laser * 10) / 10,
      slow: Math.round(p.slow * 10) / 10, shield: p.shield
    };
    HOOK.juice = kit.juice.enabled;
    HOOK.muted = kit.audio.prefs.mute;
    HOOK.ok = true;
  };

  GameScene.prototype.hookForceLevel = function (n) {
    this.restartViaKit(n);
    return true;
  };

  GameScene.prototype.hookForceEvent = function (name, arg) {
    var s = this.sim, p = this.paddle, i;
    if (!name) return false;
    var parts = String(name).split(':');
    var head = parts[0];
    var tail = parts.length > 1 ? parts[1] : arg;
    switch (head) {
      case 'multiball': this.applyPower('multi'); return true;
      case 'power': this.applyPower(tail || 'multi'); return true;
      case 'drop': this.spawnPower(clamp(p.x, 60, VW - 60), GRID_Y0 + 40, tail || 'multi'); return true;
      case 'stun': this.stunPaddle(); return true;
      case 'recover': p.stun = 0.0001; return true;
      case 'slow': p.slow = 9; return true;
      case 'fall': return this.armRandomUnstable();
      case 'boss':
        if (s.boss && s.boss.alive) { this.hurtBoss(s.boss.hp); return true; }
        return false;
      case 'clear':
        for (i = 0; i < s.bricks.length; i++) if (s.bricks[i].alive) this.killBrick(s.bricks[i], 'crush');
        if (s.boss && s.boss.alive) this.hurtBoss(s.boss.hp);
        return true;
      case 'die':
        for (i = 0; i < this.ballPool.length; i++) {
          if (this.ballPool[i].active) { this.loseBall(this.ballPool[i]); return true; }
        }
        return false;
      case 'gameover':
        s.lives = 1;
        for (i = 0; i < this.ballPool.length; i++) {
          if (this.ballPool[i].active) { this.loseBall(this.ballPool[i]); return true; }
        }
        this.gameOver();
        return true;
      case 'unlockAll': {
        var Data = this.Data, self2 = this;
        for (i = 1; i <= 12; i++) this.save.walls[String(i)] = { medal: 3, cleared: true, bestMs: 1000 };
        if (!this.save.seen) this.save.seen = {};
        Data.PADDLE_SKINS.forEach(function (sk) { self2.save.seen['paddle:' + sk.key] = true; });
        Data.BALL_SKINS.forEach(function (sk) { self2.save.seen['ball:' + sk.key] = true; });
        this.save.cleared = 12;
        writeSave(this.save);
        return true;
      }
      case 'resetSave':
        this.save = blankSave();
        writeSave(this.save);
        return true;
      case 'tutorial':
        this.save.tutorialDone = false;
        writeSave(this.save);
        s.tut = { step: 0, moved: 0, dropT: 0, spawned: false };
        this.coach('DRAG ANYWHERE TO STEER THE DECK');
        return true;
      case 'banner':
        this.chip('TEST BANNER', '#8ff0e0');
        return true;
      default: return false;
    }
  };

  // ==================================================================
  // Bootstrap
  // ==================================================================
  function start() {
    if (!window.Phaser) { markHookFail('phaser missing'); return; }
    if (!window.GGKit) { markHookFail('ggkit missing'); return; }
    if (!window.BBData) { markHookFail('bb_data missing'); return; }
    if (!window.BBAudio) { markHookFail('bb_audio missing'); return; }

    kit = window.GGKit.create({
      slug: 'breach-brick',
      orientation: 'portrait',
      validateSave: validateSave,
      onPause: function () { /* update() gates every sim step on kit.paused */ },
      onResume: function () { if (live) live.acc = 0; },
      onRestart: function () { if (live && live.restartFromKit) live.restartFromKit(); }
    });

    var config = {
      type: Phaser.AUTO,
      parent: 'app',
      backgroundColor: '#05080f',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: VW,
        height: VH
      },
      render: {},
      fps: { target: 60, min: 20 },
      banner: false,
      audio: { noAudio: true }, // GGKit owns audio; Phaser's own bus stays off
      scene: [BootScene, TitleScene, GameScene]
    };
    config.scale.width = Math.round(VW * RETINA_FACTOR);
    config.scale.height = Math.round(VH * RETINA_FACTOR);
    config.render = Object.assign({}, window.GGKit.renderDefaults, config.render || {});
    var game = new Phaser.Game(config);
    window.__bb.game = game;
    kit.registerPWA();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
