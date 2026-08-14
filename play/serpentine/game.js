/* Serpentine - game.js
 * Portrait snake / light-cycle arena survival. Phaser 3 (vendored, no CDN).
 * GGKit is the sole lifecycle, input-identity, save and audio implementation.
 *
 * ARCHITECTURE
 *  - Fixed 1/60 s sim accumulator. The accumulator is CLAMPED, never drained
 *    in one go: a degraded device runs the world in slow motion and no clock
 *    in this file ever advances past the steps that actually ran. simTime is
 *    incremented inside simStep() only. uiTime (menus, banner easing) is the
 *    one cosmetic clock and it drives nothing the sim reads.
 *  - The whole world lives in ONE container authored in "bake space", where a
 *    cell is 32 x 32. Resizing moves and scales that container; nothing is
 *    re-laid-out and no texture is re-baked on resize.
 *  - The static board (floor, grid, walls, frame, set-piece plate) is BAKED to
 *    a single canvas texture at round start. A large static Graphics object
 *    replays its entire command list every frame; there is none in the display
 *    list. There is no Graphics.arc anywhere in the render path either - the
 *    ring art is hand-tessellated once into a texture.
 *  - Everything else is pooled: body cells, pips, pads, gate bars, storm
 *    plates, particle emitters. The hot loop allocates nothing.
 *  - Body cells are rewritten only on a sim step. Between steps only the head
 *    (interpolated) and the retiring tail (scaled out) move, so a 300-cell
 *    world costs 8 sprite writes on a non-step frame.
 *
 * DEFECT CLASSES DELIBERATELY DESIGNED OUT (all shipped broken once in fleet)
 *  - No debug view separate from the live pools: window.__sp.state IS the
 *    object the scene writes every frame, and it exists before Phaser boots so
 *    a probe during load reads the boot fallback rather than undefined.
 *  - No per-entity render state handed to the renderer: sprites are pool
 *    slots, snakes hold only sim data, and the binding is rebuilt from the
 *    ring buffer.
 *  - No DOM control handlers at all. Every control reads kit.input, so there
 *    is no handler that could claim a pointer without seeding kit.input.
 *  - One camera. No split, so there is no second camera to forget to create.
 *  - Scenes are real Phaser.Scene subclasses, so no plain-config extend: trap.
 *  - Test switches (?round, ?arena, window.__sp.forceRound/forceArena) are
 *    read from the boot fallback AND applied live by the running scene.
 *  - Every keyed lookup against variant content goes through SP_DATA's
 *    guarded accessors, which always return a real entry.
 *  - The tutorial coach is a thin fading strip under the HUD. It never
 *    occupies the center or the bottom half of the play area.
 *  - Scene Systems emits 'prerender' / 'render'. Nothing here subscribes to
 *    'postrender', which does not exist; all drawing happens in update().
 *  - Arrow-function IIFEs are not used; every closure closes as }())  on a
 *    plain function expression, which parses identically in every engine.
 */
(function () {
  'use strict';

  var VERSION = '2026-08-10-fix-round-1';
  var D = (typeof window !== 'undefined' && window.SP_DATA) || null;

  // =========================================================== boot fallback
  // Established before Phaser exists. The scene mutates this same object.
  var STATE = {
    version: VERSION,
    ready: false,
    booted: false,
    phase: 'boot',
    round: 1,
    roundPar: 0,
    arena: 'yard',
    arenaName: '',
    setPiece: '',
    score: 0,
    best: 0,
    length: 0,
    pips: 0,
    pipGoal: 0,
    rivals: 0,
    rivalsAlive: 0,
    alive: false,
    survived: 0,
    medal: 'none',
    boost: 0,
    shield: 0,
    chain: 0,
    stormInset: 0,
    seed: 0,
    trail: 'pulse',
    skin: 'arrow',
    reducedMotion: false,
    paused: false,
    tutorial: null,
    error: null
  };

  // Pending test switches. Read at boot, and applied live by the scene.
  var SWITCH = { round: null, arena: null, restart: false };

  function parseSwitches() {
    var q;
    try { q = new URLSearchParams(window.location.search); } catch (e) { return; }
    var r = parseInt(q.get('round') || q.get('sp_round'), 10);
    if (isFinite(r) && r > 0) SWITCH.round = r;
    var a = q.get('arena') || q.get('sp_arena');
    if (a) SWITCH.arena = a;
  }
  parseSwitches();
  if (SWITCH.round) STATE.round = SWITCH.round;
  if (SWITCH.arena && D) STATE.arena = D.arena(SWITCH.arena).id;

  var liveScene = null;   // set once the play scene is running

  window.__sp = {
    state: STATE,
    version: VERSION,
    // Both switches work before boot (queued) and live (applied at once).
    forceRound: function (n) {
      n = Math.max(1, Math.floor(n || 1));
      SWITCH.round = n;
      STATE.round = n;
      if (liveScene) liveScene.applySwitches(true);
      return n;
    },
    forceArena: function (id) {
      var a = D ? D.arena(id) : null;
      SWITCH.arena = a ? a.id : id;
      if (a) STATE.arena = a.id;
      if (liveScene) liveScene.applySwitches(true);
      return SWITCH.arena;
    },
    forceRestart: function () {
      SWITCH.restart = true;
      if (liveScene) liveScene.applySwitches(true);
      return true;
    },
    scene: function () { return liveScene; },
    data: D
  };

  if (!D) {
    STATE.error = 'sp_data.js failed to load';
    return;
  }
  var dataErrors = D.validate();
  if (dataErrors.length) STATE.error = 'arena data: ' + dataErrors[0];

  // ================================================================ constants
  var COLS = D.COLS, ROWS = D.ROWS;
  var CELL = 32;                       // bake-space cell size
  var BW = COLS * CELL, BH = ROWS * CELL;
  var SIM_STEP = 1 / 60;
  var MAX_STEPS = 5;
  var MAX_SNAKES = 4;                  // player + 3 hunters
  var MAX_SNAKE_LEN = 110;             // bounded growth for the authored ladder
  var BODY_CAP = MAX_SNAKE_LEN + 2;    // ring-buffer capacity per snake
  var MAX_PIPS = 30;
  var MAX_PADS = 96;
  var MAX_GATES = 20;
  var BODY_POOL = MAX_SNAKES * (MAX_SNAKE_LEN - 1) + 8;
  var START_LEN = 6;
  var PIP_GROW = 2;                    // body cells gained per pip
  var BOOST_MULT = 0.60;               // step interval multiplier while boosted
  var BOOST_TIME = 1.45;
  var BOOST_TIME_EARLY = 2.10;         // generous early-round boost window
  var BOOST_CAP = 3.4;
  var EARLY_WINDOW = 14;               // seconds of the generous opening
  var SHIELD_MAX = 2;
  var SURGE_CHAIN = 8;
  var RIVAL_RESPAWN = 6.0;
  var NEAR_MISS_CD = 0.55;

  var DIRS = [
    { x: 0, y: -1, name: 'up' },
    { x: 1, y: 0, name: 'right' },
    { x: 0, y: 1, name: 'down' },
    { x: -1, y: 0, name: 'left' }
  ];
  var DIR_BY_NAME = { up: 0, right: 1, down: 2, left: 3 };

  var RIVAL_RAMPS = [
    { body: [0x8f2340, 0xd94a70, 0xff668e], head: 0xffd9e3, glow: 0xff668e },
    { body: [0x8a5c10, 0xdb9c22, 0xffc85c], head: 0xfff2d2, glow: 0xffc85c },
    { body: [0x5e2a94, 0x9d59d6, 0xc789ff], head: 0xf1dcff, glow: 0xc789ff }
  ];

  // ================================================================== helpers
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function idx(c, r) { return r * COLS + c; }
  function cellX(c) { return c * CELL + CELL * 0.5; }
  function cellY(r) { return r * CELL + CELL * 0.5; }

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

  function lerpInt(a, b, t) { return Math.round(a + (b - a) * t); }
  function mixColor(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (lerpInt(ar, br, t) << 16) | (lerpInt(ag, bg, t) << 8) | lerpInt(ab, bb, t);
  }
  // 3-stop ramp lookup, t = 0 at ramp[0].
  function ramp3(ramp, t) {
    t = clamp(t, 0, 1);
    if (t < 0.5) return mixColor(ramp[0], ramp[1], t * 2);
    return mixColor(ramp[1], ramp[2], (t - 0.5) * 2);
  }
  function hex(c) {
    var s = (c >>> 0).toString(16);
    while (s.length < 6) s = '0' + s;
    return '#' + s;
  }

  // Change-guarded setters. setColor gets the same guard as setText because an
  // unguarded setColor rebuilds the text canvas on every frame.
  function setTxt(o, s) { if (o && o.__t !== s) { o.__t = s; o.setText(s); } }
  function setFill(o, s) { if (o && o.__f !== s) { o.__f = s; o.setColor(s); } }
  // NineSlice carries a plain `tint` property rather than the Tint component,
  // so the guard has to cover both shapes.
  function setTintIf(o, c) {
    if (!o || o.__c === c) return;
    o.__c = c;
    if (o.setTint) o.setTint(c); else o.tint = c;
  }
  function panelSize(o, w, h) {
    if (!o) return;
    if (o.setSize && o.leftWidth !== undefined) o.setSize(w, h);
    else o.setDisplaySize(w, h);
  }
  function setAlphaIf(o, a) { if (o && o.__a !== a) { o.__a = a; o.setAlpha(a); } }
  function setVis(o, v) { if (o && o.visible !== v) o.setVisible(v); }

  function fmtTime(s) {
    if (s < 0) s = 0;
    var m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  var REDUCED = false;
  try {
    REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { REDUCED = false; }
  STATE.reducedMotion = REDUCED;

  // ============================================================ safe insets
  var insetProbe = null;
  function readSafeArea() {
    if (!insetProbe) {
      insetProbe = document.createElement('div');
      insetProbe.style.cssText =
        'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;visibility:hidden;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
        'env(safe-area-inset-bottom) env(safe-area-inset-left);';
      document.body.appendChild(insetProbe);
    }
    var cs = window.getComputedStyle(insetProbe);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0
    };
  }

  // Authored local audio. Registration is cheap; GGKit decodes on first use
  // after its first-gesture unlock, so boot never fetches or decodes audio.
  var AUDIO_FILES = {
    turn: 'assets/audio/turn.mp3', pip: 'assets/audio/pip.mp3',
    boost: 'assets/audio/boost.mp3', gatewarn: 'assets/audio/gatewarn.mp3',
    gate: 'assets/audio/gate.mp3', crash: 'assets/audio/crash.mp3',
    save: 'assets/audio/save.mp3', shield: 'assets/audio/shield.mp3',
    surge: 'assets/audio/surge.mp3', clear: 'assets/audio/clear.mp3',
    unlock: 'assets/audio/unlock.mp3', click: 'assets/audio/click.mp3',
    storm: 'assets/audio/storm.mp3', music_calm: 'assets/audio/music_calm.mp3',
    music_heat: 'assets/audio/music_heat.mp3'
  };

  // ======================================================= archived prototype helpers
  // These inert helpers remain only for source archaeology. The shipped build
  // does not call them or register their output; AUDIO_FILES above is the live
  // MP3-only source for GGKit.
  var SR = 22050;

  function writeStr(view, off, s) {
    for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  }
  // Retained only as a harmless compatibility stub for archived prototype
  // helpers below. The live build registers AUDIO_FILES and never calls it.
  function toWavUrl() { return null; }
  function buffer(seconds) { return new Float32Array(Math.max(1, Math.floor(seconds * SR))); }
  function fadeEdges(b, ms) {
    var n = Math.min(Math.floor(SR * ms / 1000), Math.floor(b.length / 2));
    for (var i = 0; i < n; i++) {
      var f = i / n;
      b[i] *= f;
      b[b.length - 1 - i] *= f;
    }
    return b;
  }
  function addTone(b, freq, start, dur, amp, wave, decay) {
    var i0 = Math.floor(start * SR), i1 = Math.min(b.length, Math.floor((start + dur) * SR));
    var ph = 0;
    for (var i = i0; i < i1; i++) {
      var t = (i - i0) / SR;
      var f = typeof freq === 'function' ? freq(t / dur) : freq;
      ph += f / SR;
      var v;
      var frac = ph - Math.floor(ph);
      if (wave === 'square') v = frac < 0.5 ? 1 : -1;
      else if (wave === 'saw') v = frac * 2 - 1;
      else if (wave === 'tri') v = 1 - 4 * Math.abs(frac - 0.5);
      else v = Math.sin(frac * Math.PI * 2);
      var env = decay === false ? 1 : Math.pow(1 - t / dur, decay || 2.2);
      b[i] += v * amp * env;
    }
    return b;
  }
  function addNoise(b, start, dur, amp, decay, lp) {
    var i0 = Math.floor(start * SR), i1 = Math.min(b.length, Math.floor((start + dur) * SR));
    var last = 0, k = lp == null ? 0.35 : lp;
    for (var i = i0; i < i1; i++) {
      var t = (i - i0) / SR;
      var n = Math.sin(i * 12.9898) * 0.5;
      last = last + (n - last) * k;
      b[i] += last * amp * Math.pow(1 - t / dur, decay || 2.0);
    }
    return b;
  }

  function buildSounds() {
    var out = {};
    var b;

    // turn tick: barely there, but the hand feels it
    b = buffer(0.05); addTone(b, 1560, 0, 0.045, 0.16, 'square', 3.4);
    out.turn = toWavUrl(fadeEdges(b, 4));

    // pip collect: two-step bright blip
    b = buffer(0.16);
    addTone(b, 900, 0, 0.06, 0.30, 'sine', 2.2);
    addTone(b, 1500, 0.05, 0.10, 0.26, 'sine', 2.4);
    out.pip = toWavUrl(fadeEdges(b, 4));

    // boost: pad whoosh
    b = buffer(0.40);
    addNoise(b, 0, 0.36, 0.30, 1.5, 0.6);
    addTone(b, function (u) { return 260 + 900 * u; }, 0, 0.34, 0.22, 'saw', 1.8);
    out.boost = toWavUrl(fadeEdges(b, 8));

    // gate warning tick
    b = buffer(0.11); addTone(b, 330, 0, 0.10, 0.24, 'square', 2.6);
    out.gatewarn = toWavUrl(fadeEdges(b, 5));

    // gate clang: inharmonic partials, fast metal decay
    b = buffer(0.62);
    addTone(b, 523, 0, 0.60, 0.20, 'sine', 2.8);
    addTone(b, 787, 0, 0.52, 0.16, 'sine', 3.2);
    addTone(b, 1173, 0, 0.42, 0.12, 'sine', 3.6);
    addTone(b, 1583, 0, 0.30, 0.09, 'sine', 4.0);
    addNoise(b, 0, 0.10, 0.20, 3.0, 0.8);
    out.gate = toWavUrl(fadeEdges(b, 6));

    // crash
    b = buffer(0.85);
    addNoise(b, 0, 0.72, 0.55, 1.6, 0.5);
    addTone(b, function (u) { return 240 * Math.pow(0.18, u); }, 0, 0.75, 0.42, 'saw', 1.5);
    out.crash = toWavUrl(fadeEdges(b, 8));

    // near-miss save
    b = buffer(0.22);
    addTone(b, function (u) { return 620 + 760 * u; }, 0, 0.20, 0.26, 'tri', 2.0);
    out.save = toWavUrl(fadeEdges(b, 5));

    // shield pickup
    b = buffer(0.45);
    addTone(b, 392, 0, 0.42, 0.20, 'sine', 2.0);
    addTone(b, 588, 0.06, 0.36, 0.18, 'sine', 2.0);
    addTone(b, 784, 0.12, 0.30, 0.16, 'sine', 2.0);
    out.shield = toWavUrl(fadeEdges(b, 6));

    // surge
    b = buffer(0.60);
    addTone(b, function (u) { return 180 + 1200 * u * u; }, 0, 0.55, 0.28, 'saw', 1.4);
    addNoise(b, 0.1, 0.45, 0.22, 1.4, 0.7);
    out.surge = toWavUrl(fadeEdges(b, 8));

    // round clear fanfare
    b = buffer(1.00);
    var notes = [523, 659, 784, 1047];
    for (var i = 0; i < notes.length; i++) addTone(b, notes[i], i * 0.09, 0.55, 0.19, 'tri', 2.0);
    out.clear = toWavUrl(fadeEdges(b, 8));

    // medal / unlock shimmer
    b = buffer(0.90);
    var up = [784, 1047, 1319, 1568];
    for (var k = 0; k < up.length; k++) addTone(b, up[k], k * 0.07, 0.55, 0.15, 'sine', 2.4);
    addNoise(b, 0, 0.30, 0.06, 2.2, 0.9);
    out.unlock = toWavUrl(fadeEdges(b, 8));

    // ui click
    b = buffer(0.07); addTone(b, 720, 0, 0.06, 0.20, 'square', 3.0);
    out.click = toWavUrl(fadeEdges(b, 4));

    // storm warning: low pulsing swell
    b = buffer(0.70);
    addTone(b, 88, 0, 0.66, 0.30, 'saw', 1.2);
    addTone(b, 132, 0, 0.60, 0.16, 'sine', 1.4);
    out.storm = toWavUrl(fadeEdges(b, 20));

    return out;
  }

  // Two music beds so intensity can be crossfaded on the GGKit music bus.
  function buildMusic(heat) {
    var bars = 4, bpm = heat ? 132 : 118;
    var beat = 60 / bpm;
    var len = bars * 4 * beat;
    var b = buffer(len);
    var root = heat ? 55 : 49;                       // low pulse, Hz
    var scale = heat ? [0, 3, 5, 7, 10] : [0, 2, 3, 7, 9];
    var rng = mulberry32(heat ? 0x51EF : 0x2C0D);
    var i, t;
    // bass pulse on every beat
    for (i = 0; i < bars * 4; i++) {
      t = i * beat;
      addTone(b, root, t, beat * 0.92, 0.24, 'saw', 1.6);
      addTone(b, root * 2, t, beat * 0.45, 0.10, 'square', 2.4);
    }
    // arpeggio on eighths
    for (i = 0; i < bars * 8; i++) {
      t = i * beat * 0.5;
      var deg = scale[Math.floor(rng() * scale.length)];
      var f = root * 8 * Math.pow(2, deg / 12);
      addTone(b, f, t, beat * 0.42, heat ? 0.085 : 0.065, 'tri', 2.6);
    }
    // hats on offbeats
    for (i = 0; i < bars * 8; i++) {
      t = i * beat * 0.5 + beat * 0.25;
      addNoise(b, t, 0.05, heat ? 0.055 : 0.038, 3.0, 0.95);
    }
    // a long pad underneath so the loop is not just percussion
    addTone(b, root * 4, 0, len, heat ? 0.05 : 0.04, 'sine', false);
    addTone(b, root * 6, 0, len, 0.025, 'sine', false);
    // loop-safe: crossfade the seam
    var n = Math.floor(SR * 0.03);
    for (i = 0; i < n; i++) {
      var f2 = i / n;
      b[i] = b[i] * f2 + b[b.length - n + i] * (1 - f2);
    }
    return toWavUrl(b);
  }

  // ===================================================== texture generation
  // Everything drawn is baked once into a texture. No Graphics survives into
  // the display list, and no arc() is walked at runtime.
  function tessRing(g, cx, cy, rOuter, rInner, segments) {
    // Hand-tessellated ring. Graphics.arc walks the sweep in 0.01 rad steps,
    // which costs milliseconds per frame for HUD rings; this runs once at
    // bake time with a fixed segment count.
    var step = Math.PI * 2 / segments;
    for (var i = 0; i < segments; i++) {
      var a0 = i * step, a1 = a0 + step * 1.02;
      g.fillPoints([
        { x: cx + Math.cos(a0) * rOuter, y: cy + Math.sin(a0) * rOuter },
        { x: cx + Math.cos(a1) * rOuter, y: cy + Math.sin(a1) * rOuter },
        { x: cx + Math.cos(a1) * rInner, y: cy + Math.sin(a1) * rInner },
        { x: cx + Math.cos(a0) * rInner, y: cy + Math.sin(a0) * rInner }
      ], true);
    }
  }
  function tessDisc(g, cx, cy, r, segments) {
    var pts = [], step = Math.PI * 2 / segments;
    for (var i = 0; i < segments; i++) pts.push({ x: cx + Math.cos(i * step) * r, y: cy + Math.sin(i * step) * r });
    g.fillPoints(pts, true);
  }
  function tessDiamond(g, cx, cy, r) {
    g.fillPoints([
      { x: cx, y: cy - r }, { x: cx + r, y: cy }, { x: cx, y: cy + r }, { x: cx - r, y: cy }
    ], true);
  }

  function makeTextures(scene) {
    var g = scene.make.graphics({ x: 0, y: 0, add: false });

    function bake(key, w, h) {
      if (scene.textures.exists(key)) scene.textures.remove(key);
      g.generateTexture(key, w, h);
      g.clear();
    }

    // solid square (storm plates, bars, panels backing)
    g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 8, 8);
    bake('sp_px', 8, 8);

    // rounded panel. Used as a NINE-SLICE, never a stretched image: scaling a
    // rounded rect stretches its corner radius too and every card turns into
    // an ellipse.
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(0, 0, 64, 64, 18);
    bake('sp_panel', 64, 64);

    // medal chip ring (hand tessellated, baked once)
    g.fillStyle(0xffffff, 1); tessRing(g, 24, 24, 23, 18, 30);
    g.fillStyle(0xffffff, 0.35); tessDisc(g, 24, 24, 17, 24);
    bake('sp_ring', 48, 48);

    g.destroy();
  }

  function headTextureFor(skinId) {
    var shape = D.skin(skinId).shape;
    return 'sp_head_' + shape + '_idle';
  }

  function headTextureForState(skinId, state) {
    var shape = D.skin(skinId).shape;
    return 'sp_head_' + shape + '_' + (state || 'idle');
  }

  // ============================================================ board baking
  // One texture per round. The old one is removed first so VRAM never grows.
  function bakeBoard(scene, arena, key) {
    var th = arena.theme;
    var g = scene.make.graphics({ x: 0, y: 0, add: false });

    // floor: vertical gradient in 24 bands (cheaper than a shader, baked once)
    var bands = 24;
    for (var i = 0; i < bands; i++) {
      var t = i / (bands - 1);
      g.fillStyle(mixColor(th.floorTop, th.floorBot, t), 1);
      g.fillRect(0, Math.floor(BH * i / bands), BW, Math.ceil(BH / bands) + 1);
    }

    // grid
    g.fillStyle(th.grid, 0.30);
    for (var c = 1; c < COLS; c++) g.fillRect(c * CELL - 1, 0, 2, BH);
    for (var r = 1; r < ROWS; r++) g.fillRect(0, r * CELL - 1, BW, 2);

    // cell vignette dots at intersections for texture
    g.fillStyle(th.grid, 0.55);
    for (var c2 = 1; c2 < COLS; c2++) {
      for (var r2 = 1; r2 < ROWS; r2++) g.fillRect(c2 * CELL - 2, r2 * CELL - 2, 4, 4);
    }

    // walls with a lit top edge and a dropped bottom edge
    var map = arena.map;
    for (var r3 = 0; r3 < ROWS; r3++) {
      var row = map[r3];
      for (var c3 = 0; c3 < COLS; c3++) {
        if (row.charAt(c3) !== '#') continue;
        var x = c3 * CELL, y = r3 * CELL;
        var above = r3 > 0 && map[r3 - 1].charAt(c3) === '#';
        var below = r3 < ROWS - 1 && map[r3 + 1].charAt(c3) === '#';
        g.fillStyle(0x000000, 0.35);
        g.fillRect(x + 2, y + 3, CELL, CELL);
        g.fillStyle(th.wall, 1);
        g.fillRect(x, y, CELL, CELL);
        g.fillStyle(mixColor(th.wall, th.wallEdge, 0.35), 1);
        if (!above) g.fillRect(x, y, CELL, 4);
        g.fillStyle(mixColor(th.wall, 0x000000, 0.45), 1);
        if (!below) g.fillRect(x, y + CELL - 4, CELL, 4);
        g.fillStyle(th.wallEdge, 0.16);
        g.fillRect(x + 4, y + 6, CELL - 8, 3);
      }
    }

    // arena frame: a bright inner rule that reads as the play boundary
    g.fillStyle(th.frame, 0.55);
    g.fillRect(CELL - 3, CELL - 3, BW - CELL * 2 + 6, 3);
    g.fillRect(CELL - 3, BH - CELL, BW - CELL * 2 + 6, 3);
    g.fillRect(CELL - 3, CELL - 3, 3, BH - CELL * 2 + 6);
    g.fillRect(BW - CELL, CELL - 3, 3, BH - CELL * 2 + 6);
    g.fillStyle(th.frame, 0.12);
    g.fillRect(CELL, CELL, BW - CELL * 2, 12);
    g.fillRect(CELL, BH - CELL - 12, BW - CELL * 2, 12);

    // corner ticks so the frame reads as authored hardware, not a rectangle
    g.fillStyle(th.accent, 0.75);
    var tk = 26;
    g.fillRect(CELL - 3, CELL - 3, tk, 5); g.fillRect(CELL - 3, CELL - 3, 5, tk);
    g.fillRect(BW - CELL - tk + 3, CELL - 3, tk, 5); g.fillRect(BW - CELL - 2, CELL - 3, 5, tk);
    g.fillRect(CELL - 3, BH - CELL - 2, tk, 5); g.fillRect(CELL - 3, BH - CELL - tk + 3, 5, tk);
    g.fillRect(BW - CELL - tk + 3, BH - CELL - 2, tk, 5); g.fillRect(BW - CELL - 2, BH - CELL - tk + 3, 5, tk);

    if (scene.textures.exists(key)) scene.textures.remove(key);
    g.generateTexture(key, BW, BH);
    g.destroy();
  }

  // ==================================================== snake ring buffer
  function makeSnake(i) {
    return {
      i: i,
      ai: i > 0,
      alive: false,
      buf: new Int32Array(BODY_CAP),
      head: 0,               // index of head cell in buf
      count: 0,
      dir: 1,
      pendingDir: -1,
      grow: 0,
      moveAcc: 0,
      stepInterval: 0.13,
      boost: 0,
      shield: 0,
      animState: 'idle',
      animT: 0,
      skill: 0.5,
      think: 0,
      ramp: RIVAL_RAMPS[0],
      headTex: 'sp_head_arrow_idle',
      prevHeadC: 0, prevHeadR: 0,
      headC: 0, headR: 0,
      stepT: 0,              // 0..1 interpolation across the current step
      tailCell: -1,
      tailFade: 0,
      pips: 0,
      deathT: 0,
      respawnT: 0,
      deathVisualT: 0,
      contactCell: -1
    };
  }
  function bodyCellAt(s, i) {                 // i = 0 at the head
    return s.buf[(s.head - i + BODY_CAP * 2) % BODY_CAP];
  }
  function pushHead(s, cell) {
    if (s.count >= BODY_CAP) return false;
    s.head = (s.head + 1) % BODY_CAP;
    s.buf[s.head] = cell;
    if (s.count < BODY_CAP) s.count++;
  }
  function popTail(s) {
    if (s.count <= 0) return -1;
    var t = bodyCellAt(s, s.count - 1);
    s.count--;
    return t;
  }

  // ============================================================ set-pieces
  // Guarded map: SET_PIECES[id] || SET_PIECES.none. A miss is a no-op, never
  // an exception in the middle of a sim step.
  var SET_PIECES = {
    none: { start: function () {}, tick: function () {}, label: '' },

    pulseCore: {
      label: 'Pulse Core',
      start: function (sc) { sc.spTimer = 6.0; },
      tick: function (sc, dt) {
        sc.spTimer -= dt;
        if (sc.spTimer > 0) return;
        sc.spTimer = 8.0;
        var core = sc.coreCell;
        if (core < 0) return;
        var cc = core % COLS, cr = Math.floor(core / COLS);
        var offs = [[0, -4], [0, 4], [-4, 0], [4, 0]];
        var made = 0;
        for (var i = 0; i < offs.length; i++) {
          if (sc.spawnPipAt(cc + offs[i][0], cr + offs[i][1], 'charge')) made++;
        }
        if (made) {
          sc.corePulse = 1;
          sc.sfx('unlock', 0.35);
          sc.emitRing(cellX(cc), cellY(cr), sc.theme.accent, 14);
          sc.setChip('PULSE CORE', sc.theme.accent);
        }
      }
    },

    lockstepCross: {
      label: 'Lockstep Cross',
      start: function (sc) { sc.spTimer = 0; },
      tick: function (sc) {
        // Beat on every gate transition; the core answers the clang.
        if (sc.gateJustClosed) {
          sc.corePulse = 1;
          sc.setChip('LOCKSTEP', sc.theme.accent);
        }
      }
    },

    slipstreamRing: {
      label: 'Slipstream Ring',
      start: function (sc) { sc.chain = 0; },
      tick: function (sc) {
        if (sc.chain < SURGE_CHAIN) return;
        sc.chain = 0;
        var p = sc.snakes[0];
        if (!p.alive) return;
        p.boost = Math.min(BOOST_CAP, p.boost + 2.0);
        sc.corePulse = 1;
        sc.padFlash = 1;
        sc.sfx('surge', 0.75);
        sc.shake(9, 260);
        sc.addScore(150);
        sc.setChip('SURGE', sc.theme.accent);
        sc.emitRing(sc.headScreenX(p), sc.headScreenY(p), sc.theme.pad, 22);
      }
    },

    stormEye: {
      label: 'Storm Eye',
      start: function (sc) { sc.spTimer = 9.0; },
      tick: function (sc, dt) {
        sc.spTimer -= dt;
        if (sc.spTimer > 0) return;
        sc.spTimer = 13.0;
        var core = sc.coreCell;
        if (core < 0) return;
        var cc = core % COLS, cr = Math.floor(core / COLS);
        var spots = [[0, -2], [0, 2], [-2, 0], [2, 0], [0, -3], [0, 3]];
        for (var i = 0; i < spots.length; i++) {
          if (sc.spawnPipAt(cc + spots[i][0], cr + spots[i][1], 'shield')) {
            sc.corePulse = 1;
            sc.setChip('SHIELD READY', sc.theme.accent);
            sc.sfx('shield', 0.4);
            return;
          }
        }
      }
    },

    wardenGauntlet: {
      label: 'Warden Gauntlet',
      start: function (sc) { sc.spTimer = 0; },
      tick: function (sc) {
        if (sc.gateJustClosed) {
          sc.corePulse = 1;
          sc.shake(4, 160);
          sc.setChip('GAUNTLET', sc.theme.accent);
        }
      }
    }
  };
  function setPieceFor(id) { return SET_PIECES[id] || SET_PIECES.none; }

  // ================================================================== save
  var DEFAULT_PROFILE = {
    v: 3,
    best: 0,
    bestRound: 0,
    totalPips: 0,
    totalSurvival: 0,
    goldCount: 0,
    platinumCount: 0,
    medals: {},          // roundNumber -> medal id
    trail: 'pulse',
    skin: 'arrow',
    unlocked: { pulse: true, arrow: true },
    tutorialDone: false,
    runs: 0
  };
  function validProfile(o) {
    return !!o && typeof o === 'object' && Number.isFinite(Number(o.v)) &&
      Number.isInteger(Number(o.v)) && Number(o.v) >= 1 && Number(o.v) <= DEFAULT_PROFILE.v;
  }
  function finiteSaveInt(value, max) {
    var n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.min(max, Math.floor(n)) : 0;
  }
  function normaliseProfile(p) {
    var out = {};
    for (var k in DEFAULT_PROFILE) out[k] = DEFAULT_PROFILE[k];
    if (p && validProfile(p)) {
      out.best = finiteSaveInt(p.best, 1000000000);
      out.bestRound = finiteSaveInt(p.bestRound, 100000);
      out.totalPips = finiteSaveInt(p.totalPips, 10000000);
      out.totalSurvival = finiteSaveInt(p.totalSurvival, 10000000);
      out.goldCount = finiteSaveInt(p.goldCount, 100000);
      out.platinumCount = finiteSaveInt(p.platinumCount, 100000);
      out.runs = finiteSaveInt(p.runs, 1000000);
      out.tutorialDone = !!p.tutorialDone;
      out.medals = {};
      if (p.medals && typeof p.medals === 'object') {
        for (var m in p.medals) {
          var id = p.medals[m];
          if (D.medal(id).id === id && id !== 'none') out.medals[m] = id;
        }
      }
      // Every persisted id is validated against the live registry before it
      // is trusted; a stale id silently falls back to the default variant.
      out.trail = D.trail(p.trail).id;
      out.skin = D.skin(p.skin).id;
      out.unlocked = { pulse: true, arrow: true };
      if (p.unlocked && typeof p.unlocked === 'object') {
        for (var u in p.unlocked) {
          if (!p.unlocked[u]) continue;
          if (D.TRAILS[u] || D.SKINS[u]) out.unlocked[u] = true;
        }
      }
      if (!out.unlocked[out.trail]) out.trail = 'pulse';
      if (!out.unlocked[out.skin]) out.skin = 'arrow';
    }
    return out;
  }

  // ==================================================================== kit
  var kit = window.GGKit.create({
    slug: 'serpentine',
    orientation: 'portrait',
    validateSave: validProfile,
    onPause: function () {
      STATE.paused = true;
      if (liveScene) liveScene.onKitPause();
    },
    onResume: function () {
      STATE.paused = false;
      if (liveScene) liveScene.onKitResume();
    },
    onRestart: function () {
      if (liveScene) { liveScene.resetInputState(); liveScene.startRun(1); }
    }
  });

  // GGKit owns the input surface; this adapter adds the browser Gamepad API
  // behind kit.input so the scene never reads raw controllers or raw pointers.
  (function attachGamepadInput(input) {
    var previous = { direction: null, confirm: false, pause: false };
    function clear() { previous.direction = null; previous.confirm = false; previous.pause = false; }
    input.clearGamepad = clear;
    input.gamepad = function () {
      if ((kit.paused && (!liveScene || !liveScene.menuVisible)) ||
          !window.navigator || !navigator.getGamepads) { clear(); return null; }
      var pads;
      try { pads = navigator.getGamepads(); } catch (e) { clear(); return null; }
      var pad = null;
      for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
      if (!pad) { clear(); return null; }
      var up = !!(pad.buttons[12] && pad.buttons[12].pressed) || (pad.axes[1] || 0) < -0.42;
      var down = !!(pad.buttons[13] && pad.buttons[13].pressed) || (pad.axes[1] || 0) > 0.42;
      var left = !!(pad.buttons[14] && pad.buttons[14].pressed) || (pad.axes[0] || 0) < -0.42;
      var right = !!(pad.buttons[15] && pad.buttons[15].pressed) || (pad.axes[0] || 0) > 0.42;
      var direction = up ? 'up' : down ? 'down' : left ? 'left' : right ? 'right' : null;
      var confirmDown = !!(pad.buttons[0] && pad.buttons[0].pressed) || !!(pad.buttons[9] && pad.buttons[9].pressed);
      var pauseDown = !!(pad.buttons[8] && pad.buttons[8].pressed);
      var result = {
        direction: direction,
        pressed: !!direction && direction !== previous.direction,
        confirm: confirmDown && !previous.confirm,
        pause: pauseDown && !previous.pause
      };
      previous.direction = direction;
      previous.confirm = confirmDown;
      previous.pause = pauseDown;
      return result;
    };
  }(kit.input));

  // ============================================================ boot scene
  function BootScene() { Phaser.Scene.call(this, { key: 'boot' }); }
  BootScene.prototype = Object.create(Phaser.Scene.prototype);
  BootScene.prototype.constructor = BootScene;

  BootScene.prototype.preload = function () {
    var art = [
      ['sp_board_detail', 'assets/board-detail.svg'],
      ['sp_body_art', 'assets/body.svg'], ['sp_pip_art', 'assets/pip.svg'],
      ['sp_shieldpip_art', 'assets/shield-pip.svg'], ['sp_pad_art', 'assets/pad.svg'],
      ['sp_gate_art', 'assets/gate.svg'], ['sp_core_art', 'assets/core.svg'],
      ['sp_glow_art', 'assets/glow.svg'], ['sp_spark_art', 'assets/spark.svg'],
      ['sp_star_art', 'assets/star.svg'], ['sp_flare_art', 'assets/flare.svg'],
      ['sp_jet_art', 'assets/jet.svg'], ['sp_guide_art', 'assets/guide.svg']
    ];
    for (var i = 0; i < art.length; i++) this.load.image(art[i][0], art[i][1]);
    var shapes = ['arrow', 'visor', 'crown', 'halo'];
    var states = ['idle', 'turn', 'damage'];
    for (var s = 0; s < shapes.length; s++) {
      for (var t = 0; t < states.length; t++) {
        this.load.image('sp_head_' + shapes[s] + '_' + states[t],
          'assets/head-' + shapes[s] + '-' + states[t] + '.svg');
      }
    }
  };

  BootScene.prototype.create = function () {
    var self = this;
    kit.loader.show('Serpentine');
    kit.loader.progress(0.1);
    makeTextures(this);
    kit.loader.progress(0.35);
    kit.audio.register(AUDIO_FILES);
    kit.loader.progress(0.82);
    kit.loader.progress(1);
    kit.loader.hide();
    self.scene.start('play');
  };

  // ============================================================ play scene
  function PlayScene() { Phaser.Scene.call(this, { key: 'play' }); }
  PlayScene.prototype = Object.create(Phaser.Scene.prototype);
  PlayScene.prototype.constructor = PlayScene;

  PlayScene.prototype.create = function () {
    var self = this;
    liveScene = this;

    this.profile = normaliseProfile(kit.save.get(null));
    this.refreshUnlocks(true);

    // ------- world grids (preallocated, reused for every arena and round)
    this.wallGrid = new Uint8Array(COLS * ROWS);
    this.gateGrid = new Uint8Array(COLS * ROWS);   // 0 none, 1..4 = A..D
    this.padGrid = new Uint8Array(COLS * ROWS);
    this.coreGrid = new Uint8Array(COLS * ROWS);
    this.occ = new Int16Array(COLS * ROWS);        // 0 empty, else snake index+1
    this.pipGrid = new Int16Array(COLS * ROWS);    // 0 none, else pip index+1
    this.floodMark = new Int32Array(COLS * ROWS);
    this.floodQueue = new Int32Array(COLS * ROWS);
    this.floodStamp = 0;
    this.pipSites = [];

    // ------- clocks
    this.simTime = 0;      // advanced ONLY inside simStep
    this.uiTime = 0;       // cosmetic only: menu shimmer and banner easing
    this.acc = 0;
    this.roundTime = 0;
    this.phase = 'title';
    this.phaseT = 0;

    // ------- containers
    this.world = this.add.container(0, 0);
    this.world.setDepth(0);
    this.hud = this.add.container(0, 0);
    this.hud.setDepth(20);
    this.overlay = this.add.container(0, 0);
    this.overlay.setDepth(30);

    this.boardImg = this.add.image(0, 0, 'sp_px').setOrigin(0, 0);
    this.world.add(this.boardImg);
    this.boardDetail = this.add.image(0, 0, 'sp_board_detail').setOrigin(0, 0).setAlpha(0.42);
    this.world.add(this.boardDetail);

    // ------- pools
    this.padPool = [];
    for (var i = 0; i < MAX_PADS; i++) {
      var pad = this.add.image(0, 0, 'sp_pad_art').setVisible(false);
      this.world.add(pad); this.padPool.push(pad);
    }
    this.gatePool = [];
    this.gateLabels = [];
    for (i = 0; i < MAX_GATES; i++) {
      var gate = this.add.image(0, 0, 'sp_gate_art').setVisible(false);
      this.world.add(gate); this.gatePool.push(gate);
      var gateLabel = this.add.text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif', fontSize: '11px', fontStyle: 'bold',
        color: '#07121d', stroke: '#e8fbff', strokeThickness: 2
      }).setOrigin(0.5).setVisible(false);
      this.world.add(gateLabel); this.gateLabels.push(gateLabel);
    }
    this.corePlate = this.add.image(0, 0, 'sp_core_art').setVisible(false);
    this.world.add(this.corePlate);
    this.coreGlow = this.add.image(0, 0, 'sp_glow_art').setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    this.world.add(this.coreGlow);

    this.pipPool = [];
    for (i = 0; i < MAX_PIPS; i++) {
      var pip = this.add.image(0, 0, 'sp_pip_art').setVisible(false);
      this.world.add(pip); this.pipPool.push(pip);
    }

    this.tutorialGuide = this.add.image(0, 0, 'sp_guide_art').setVisible(false)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.world.add(this.tutorialGuide);

    this.impactRing = this.add.image(0, 0, 'sp_ring').setVisible(false)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.world.add(this.impactRing);
    this.impactText = this.add.text(0, 0, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', fontStyle: 'bold',
      color: '#eafaff', stroke: '#06101c', strokeThickness: 4
    }).setOrigin(0.5).setVisible(false);
    this.world.add(this.impactText);

    this.damageVignette = this.add.image(0, 0, 'sp_px').setOrigin(0, 0)
      .setTint(0xff335f).setAlpha(0).setVisible(false);
    this.hud.add(this.damageVignette);

    this.bodyPool = [];
    for (i = 0; i < BODY_POOL; i++) {
      var bc = this.add.image(0, 0, 'sp_body_art').setVisible(false);
      this.world.add(bc); this.bodyPool.push(bc);
    }

    this.headSprites = [];
    this.headGlows = [];
    for (i = 0; i < MAX_SNAKES; i++) {
      var hg = this.add.image(0, 0, 'sp_glow_art').setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
      this.world.add(hg); this.headGlows.push(hg);
      var hs = this.add.image(0, 0, 'sp_head_arrow_idle').setVisible(false);
      this.world.add(hs); this.headSprites.push(hs);
    }

    // storm plates: four closed bands plus four warning bands
    this.stormPlates = [];
    this.warnPlates = [];
    for (i = 0; i < 4; i++) {
      var sp = this.add.image(0, 0, 'sp_px').setOrigin(0, 0).setVisible(false);
      this.world.add(sp); this.stormPlates.push(sp);
      var wp = this.add.image(0, 0, 'sp_px').setOrigin(0, 0).setVisible(false);
      this.world.add(wp); this.warnPlates.push(wp);
    }

    // ------- particle systems (pooled, bounded)
    var pcount = REDUCED ? 0.4 : 1;
    this.emSpark = this.add.particles(0, 0, 'sp_spark_art', {
      speed: { min: 40, max: 190 }, lifespan: { min: 180, max: 420 },
      scale: { start: 0.9, end: 0 }, alpha: { start: 0.95, end: 0 },
      blendMode: 'ADD', emitting: false, maxAliveParticles: 90
    });
    this.emPip = this.add.particles(0, 0, 'sp_star_art', {
      speed: { min: 60, max: 240 }, lifespan: { min: 220, max: 520 },
      scale: { start: 0.7, end: 0 }, alpha: { start: 1, end: 0 },
      rotate: { start: 0, end: 180 }, blendMode: 'ADD', emitting: false,
      maxAliveParticles: 110
    });
    this.emCrash = this.add.particles(0, 0, 'sp_flare_art', {
      speed: { min: 80, max: 340 }, lifespan: { min: 320, max: 820 },
      scale: { start: 1.1, end: 0 }, alpha: { start: 1, end: 0 },
      rotate: { min: -180, max: 180 }, blendMode: 'ADD', emitting: false,
      maxAliveParticles: 130
    });
    this.emJet = this.add.particles(0, 0, 'sp_jet_art', {
      speed: { min: 10, max: 70 }, lifespan: { min: 160, max: 340 },
      scale: { start: 0.55, end: 0 }, alpha: { start: 0.7, end: 0 },
      blendMode: 'ADD', emitting: false, maxAliveParticles: 70
    });
    this.particleScale = pcount;
    this.world.add(this.emSpark); this.world.add(this.emPip);
    this.world.add(this.emCrash); this.world.add(this.emJet);

    // ------- snakes
    this.snakes = [];
    for (i = 0; i < MAX_SNAKES; i++) this.snakes.push(makeSnake(i));

    // ------- pips
    this.pips = [];
    for (i = 0; i < MAX_PIPS; i++) this.pips.push({ live: false, cell: -1, kind: 'charge', born: 0, phase: 0 });

    // ------- input bookkeeping (GGKit is the only source)
    this.ptrState = new Map();   // pointerId -> { swiped, sx, sy }
    this.keyEdge = {};
    this.tapPending = false;

    this.buildHud();
    this.buildOverlay();

    this.rng = mulberry32(0x5E2F1D);
    this.visualRng = mulberry32(0xA17E5EED);
    this.chain = 0;
    this.padFlash = 0;
    this.corePulse = 0;
    this.coreCell = -1;
    this.spTimer = 0;
    this.gateJustClosed = false;
    this.nearMissCd = 0;
    this.chipT = 0;
    this.chipQueue = [];
    this.coachT = 0;
    this.score = 0;
    this.runPips = 0;
    this.roundsCleared = 0;
    this.pendingUnlocks = [];
    this.impactT = 0;
    this.impactKind = '';
    this.impactScore = '';
    this.impactColor = 0x55e7ff;

    // Attract backdrop: a real baked arena behind the title card.
    this.roundInfo = D.round(1);
    this.loadArena(D.arena(SWITCH.arena || D.round(1).arena));

    this.layout();
    this.scale.on('resize', function () { self.layout(); });

    // Test switches queued before boot land here, and are reflected in the
    // published state immediately so a probe can read them from the title.
    this.applySwitches(false);
    this.round = this.forcedRound || 1;
    this.roundInfo = this.roundDef(this.round);
    this.showTitle();

    STATE.booted = true;
    STATE.ready = true;
    kit.registerPWA();
  };

  // ------------------------------------------------------------- unlocks
  PlayScene.prototype.refreshUnlocks = function (silent) {
    var p = this.profile;
    var gained = [];
    var i, id, def;
    for (i = 0; i < D.TRAIL_ORDER.length; i++) {
      id = D.TRAIL_ORDER[i];
      def = D.trail(id);
      if (!p.unlocked[id] && D.meetsReq(def.req, p)) { p.unlocked[id] = true; gained.push(def); }
    }
    for (i = 0; i < D.SKIN_ORDER.length; i++) {
      id = D.SKIN_ORDER[i];
      def = D.skin(id);
      if (!p.unlocked[id] && D.meetsReq(def.req, p)) { p.unlocked[id] = true; gained.push(def); }
    }
    if (gained.length && !silent) {
      for (i = 0; i < gained.length; i++) this.pendingUnlocks.push(gained[i]);
    }
    if (gained.length) this.saveProfile();
    return gained;
  };

  PlayScene.prototype.saveProfile = function () { kit.save.set(this.profile); };

  // -------------------------------------------------------------- layout
  PlayScene.prototype.layout = function () {
    var W = this.scale.width, H = this.scale.height;
    var inset = readSafeArea();
    this.safe = inset;
    this.viewW = W; this.viewH = H;

    var hudTop = inset.top + 140;                // compact stat band + one top strip
    var hudBottom = inset.bottom + 54;           // pause hit zone / safe thumb gap
    var availW = W - 12 - inset.left - inset.right;
    var availH = H - hudTop - hudBottom;
    var s = Math.min(availW / BW, availH / BH);
    s = Math.max(0.02, s);
    this.boardScale = s;
    this.boardX = inset.left + (W - inset.left - inset.right - BW * s) * 0.5;
    this.boardY = hudTop + (availH - BH * s) * 0.5;
    this.world.setScale(s);
    this.world.setPosition(this.boardX, this.boardY);

    this.layoutHud();
    this.layoutOverlay();
  };

  PlayScene.prototype.worldToScreenX = function (bx) { return this.boardX + bx * this.boardScale; };
  PlayScene.prototype.worldToScreenY = function (by) { return this.boardY + by * this.boardScale; };

  // ----------------------------------------------------------------- HUD
  // Nine-slice panel factory. Corners keep their authored radius at every
  // size, which a stretched rounded-rect image cannot do.
  PlayScene.prototype.panel = function (tint) {
    var p = this.add.nineslice(0, 0, 'sp_panel', undefined, 64, 64, 18, 18, 18, 18);
    p.setOrigin(0.5, 0.5);
    p.tint = tint;
    p.__c = tint;
    return p;
  };

  PlayScene.prototype.buildHud = function () {
    var self = this;
    function txt(size, color, weight, align) {
      var t = self.add.text(0, 0, '', {
        fontFamily: '"Trebuchet MS", Verdana, system-ui, sans-serif',
        fontSize: size + 'px', color: color, fontStyle: weight || 'normal',
        align: align || 'left'
      });
      t.setResolution(Math.min(2, window.devicePixelRatio || 1));
      self.hud.add(t);
      return t;
    }

    this.hudBack = this.add.image(0, 0, 'sp_px').setOrigin(0, 0).setTint(0x050912).setAlpha(0.72);
    this.hud.add(this.hudBack);

    this.hudBrandMark = this.add.image(0, 0, 'sp_ring').setTint(0x55e7ff);
    this.hud.add(this.hudBrandMark);
    this.hudBrand = txt(11, '#cfeeff', 'bold');
    this.hudBrand.setLetterSpacing ? this.hudBrand.setLetterSpacing(3) : null;
    setTxt(this.hudBrand, 'SERPENTINE');

    this.hudRound = txt(14, '#9fd8ee', 'bold');
    this.hudArena = txt(11, '#7d97ad');
    this.hudScore = txt(26, '#eafaff', 'bold', 'right');
    this.hudScore.setOrigin(1, 0);
    this.hudScoreLabel = txt(8, '#6f889c', 'bold', 'right');
    this.hudScoreLabel.setOrigin(1, 0);
    this.hudBest = txt(10, '#7d97ad', 'normal', 'right');
    this.hudBest.setOrigin(1, 0);

    // survival bar
    this.barBack = this.add.image(0, 0, 'sp_px').setOrigin(0, 0).setTint(0x16283a);
    this.barFill = this.add.image(0, 0, 'sp_px').setOrigin(0, 0).setTint(0x55e7ff);
    this.hud.add(this.barBack); this.hud.add(this.barFill);
    this.barLabel = txt(9, '#8fb2c6', 'bold');

    // boost bar
    this.boostBack = this.add.image(0, 0, 'sp_px').setOrigin(0, 0).setTint(0x16283a);
    this.boostFill = this.add.image(0, 0, 'sp_px').setOrigin(0, 0).setTint(0xffc85c);
    this.hud.add(this.boostBack); this.hud.add(this.boostFill);
    this.boostLabel = txt(9, '#8fb2c6', 'bold');

    // right-side stat chips
    this.statLen = txt(14, '#cfeeff', 'bold', 'right'); this.statLen.setOrigin(1, 0);
    this.statPips = txt(14, '#cfeeff', 'bold', 'right'); this.statPips.setOrigin(1, 0);
    this.statShield = txt(14, '#9ef6ff', 'bold', 'right'); this.statShield.setOrigin(1, 0);

    // One thin coach strip: top edge only, never the center or bottom half.
    this.coachBack = this.panel(0x0a1524).setAlpha(0);
    this.hud.add(this.coachBack);
    this.coachText = txt(14, '#d7f2ff', 'bold', 'center');
    this.coachText.setOrigin(0.5, 0.5);
    this.coachText.setAlpha(0);

    // One queued edge chip (SURGE / SAVE / GAUNTLET ...); never stacks with
    // the coach strip or a boundary banner.
    this.chipBack = this.panel(0x0a1524).setAlpha(0);
    this.hud.add(this.chipBack);
    this.chipText = txt(14, '#eafaff', 'bold', 'center');
    this.chipText.setOrigin(0.5, 0.5);
    this.chipText.setAlpha(0);

    // Pause hit zone; the bottom edge has no always-on instructional copy.
    this.legend = txt(10, '#6f889c', 'normal', 'center');
    this.legend.setOrigin(0.5, 0.5);
    this.pauseBtn = this.panel(0x11202f).setAlpha(0.85);
    this.hud.add(this.pauseBtn);
    this.pauseLabel = txt(11, '#cfeeff', 'bold', 'center');
    this.pauseLabel.setOrigin(0.5, 0.5);
    setTxt(this.pauseLabel, 'II');
    this.pauseRect = { x: 0, y: 0, w: 1, h: 1 };
  };

  PlayScene.prototype.layoutHud = function () {
    var W = this.viewW, H = this.viewH, s = this.safe;
    var top = s.top;
    var left = s.left + 14, right = W - s.right - 14;

    this.hudBack.setPosition(0, 0);
    this.hudBack.setDisplaySize(W, top + 92);
    this.damageVignette.setPosition(0, 0);
    this.damageVignette.setDisplaySize(W, H);

    this.hudBrandMark.setPosition(left + 7, top + 15);
    this.hudBrandMark.setDisplaySize(14, 14);
    this.hudBrand.setPosition(left + 20, top + 9);

    this.hudRound.setPosition(left, top + 32);
    this.hudArena.setPosition(left, top + 50);

    this.hudScoreLabel.setPosition(right, top + 8);
    this.hudScore.setPosition(right, top + 16);
    this.hudBest.setPosition(right, top + 46);

    var barW = Math.min(W - (s.left + s.right) - 28, 520);
    var barX = (W - barW) * 0.5;
    this.barLabel.setPosition(barX, top + 62);
    this.barBack.setPosition(barX, top + 76);
    this.barBack.setDisplaySize(barW, 5);
    this.barFill.setPosition(barX, top + 76);
    this.barFill.setDisplaySize(1, 5);

    this.boostLabel.setPosition(barX, top + 62);
    this.boostLabel.setOrigin ? this.boostLabel.setOrigin(0, 0) : null;
    this.boostBack.setPosition(barX, top + 85);
    this.boostBack.setDisplaySize(barW, 3);
    this.boostFill.setPosition(barX, top + 85);
    this.boostFill.setDisplaySize(1, 3);

    this.statLen.setPosition(right, top + 62);
    this.statPips.setPosition(right - 74, top + 62);
    this.statShield.setPosition(right - 148, top + 62);

    var coachY = top + 108;
    this.coachBack.setPosition(W * 0.5, coachY);
    panelSize(this.coachBack, Math.min(W - 28, 460), 30);
    this.coachText.setPosition(W * 0.5, coachY);

    var chipY = top + 108, chipX = s.left + 14 + 72;
    this.chipBack.setPosition(chipX, chipY);
    panelSize(this.chipBack, 144, 28);
    this.chipText.setPosition(chipX, chipY);

    this.legend.setPosition(W * 0.5, H - s.bottom - 24);
    this.pauseBtn.setPosition(right - 20, H - s.bottom - 24);
    panelSize(this.pauseBtn, 48, 38);
    this.pauseLabel.setPosition(right - 20, H - s.bottom - 25);
    this.pauseRect = { x: right - 46, y: H - s.bottom - 46, w: 52, h: 44 };
  };

  // ------------------------------------------------------------- overlay
  PlayScene.prototype.buildOverlay = function () {
    var self = this;
    function txt(size, color, weight, align) {
      var t = self.add.text(0, 0, '', {
        fontFamily: '"Trebuchet MS", Verdana, system-ui, sans-serif',
        fontSize: size + 'px', color: color, fontStyle: weight || 'normal',
        align: align || 'center', wordWrap: { width: 520 }
      });
      t.setResolution(Math.min(2, window.devicePixelRatio || 1));
      t.setOrigin(0.5, 0.5);
      self.overlay.add(t);
      return t;
    }

    // dimmer
    this.dim = this.add.image(0, 0, 'sp_px').setOrigin(0, 0).setTint(0x03060d).setAlpha(0).setVisible(false);
    this.overlay.add(this.dim);

    // Boundary banner beat: center-stage is reserved for clear/death/unlock
    // moments, never for live-round events.
    this.bannerBack = this.panel(0x0a1626).setVisible(false);
    this.overlay.add(this.bannerBack);
    this.bannerEdge = this.add.image(0, 0, 'sp_px').setOrigin(0.5, 0.5).setTint(0x55e7ff).setVisible(false);
    this.overlay.add(this.bannerEdge);
    this.bannerTitle = txt(30, '#eafaff', 'bold');
    this.bannerSub = txt(14, '#9fd8ee');
    this.bannerMedal = this.add.image(0, 0, 'sp_ring').setVisible(false);
    this.overlay.add(this.bannerMedal);
    this.bannerMedalText = txt(10, '#0b1321', 'bold');
    this.bannerVisible = false;
    this.bannerT = 0;
    this.bannerHold = 0;

    // menu (title / pause / dead) - one card, repainted per phase
    this.menuBack = this.panel(0x081220).setVisible(false);
    this.overlay.add(this.menuBack);
    this.menuTitle = txt(34, '#eafaff', 'bold');
    this.menuSub = txt(13, '#9fd8ee');
    this.menuStats = txt(12, '#8fb2c6');
    this.menuHint = txt(11, '#63798c');

    // variant roster: trail row + skin row, each a strip of chips
    this.rosterLabelA = txt(10, '#6f889c', 'bold');
    this.rosterLabelB = txt(10, '#6f889c', 'bold');
    this.trailChips = [];
    this.skinChips = [];
    var i;
    for (i = 0; i < D.TRAIL_ORDER.length; i++) {
      this.trailChips.push(this.makeChip(D.TRAIL_ORDER[i], 'trail'));
    }
    for (i = 0; i < D.SKIN_ORDER.length; i++) {
      this.skinChips.push(this.makeChip(D.SKIN_ORDER[i], 'skin'));
    }
    this.rosterNote = txt(10, '#63798c');

    // primary button
    this.btnBack = this.panel(0x1c9ec4).setVisible(false);
    this.overlay.add(this.btnBack);
    this.btnText = txt(15, '#03121a', 'bold');
    this.btnRect = { x: 0, y: 0, w: 1, h: 1 };

    // secondary button (settings / restart)
    this.btn2Back = this.panel(0x16283a).setVisible(false);
    this.overlay.add(this.btn2Back);
    this.btn2Text = txt(13, '#cfeeff', 'bold');
    this.btn2Rect = { x: 0, y: 0, w: 1, h: 1 };

    this.menuVisible = false;
  };

  PlayScene.prototype.makeChip = function (id, kind) {
    var back = this.panel(0x11202f).setVisible(false);
    this.overlay.add(back);
    var swatch = this.add.image(0, 0, 'sp_body_art').setVisible(false);
    this.overlay.add(swatch);
    var label = this.add.text(0, 0, '', {
      fontFamily: '"Trebuchet MS", Verdana, system-ui, sans-serif',
      fontSize: '10px', color: '#cfeeff', align: 'center'
    });
    label.setOrigin(0.5, 0.5);
    label.setResolution(Math.min(2, window.devicePixelRatio || 1));
    this.overlay.add(label);
    return { id: id, kind: kind, back: back, swatch: swatch, label: label, rect: { x: 0, y: 0, w: 1, h: 1 } };
  };

  PlayScene.prototype.layoutOverlay = function () {
    var W = this.viewW, H = this.viewH;
    this.dim.setPosition(0, 0);
    this.dim.setDisplaySize(W, H);

    // banner: 60% width
    var bw = Math.min(W * 0.60, 460);
    var by = H * 0.30;
    this.bannerBack.setPosition(W * 0.5, by);
    panelSize(this.bannerBack, bw, 106);
    this.bannerEdge.setPosition(W * 0.5, by - 53);
    this.bannerEdge.setDisplaySize(bw, 3);
    this.bannerTitle.setPosition(W * 0.5, by - 16);
    this.bannerSub.setPosition(W * 0.5, by + 20);
    this.bannerMedal.setPosition(W * 0.5, by - 62);
    this.bannerMedal.setDisplaySize(38, 38);
    this.bannerMedalText.setPosition(W * 0.5, by - 62);

    // The card is sized to the content it is about to show, so the pause card
    // is not a tall empty box with two buttons at the bottom of it.
    var roster = !!this.menuRoster;
    var cw = Math.min(W - 32, 400);
    var wantH = roster ? 472 : 322;
    var ch = Math.min(wantH, H - 76);
    var k = ch / wantH;                       // uniform squeeze on short screens
    var cy = H * 0.5;
    this.menuBack.setPosition(W * 0.5, cy);
    panelSize(this.menuBack, cw, ch);
    var top = cy - ch * 0.5;
    var at = function (o) { return top + o * k; };
    this.menuTitle.setPosition(W * 0.5, at(46));
    this.menuSub.setPosition(W * 0.5, at(84));
    this.menuStats.setPosition(W * 0.5, at(128));
    this.menuSub.setWordWrapWidth(cw - 44);
    this.menuStats.setWordWrapWidth(cw - 44);
    this.menuHint.setWordWrapWidth(cw - 30);
    this.bannerSub.setWordWrapWidth(Math.min(W * 0.60, 460) - 30);

    this.rosterLabelA.setPosition(W * 0.5, at(172));
    var i, chip, n, x0, gap;
    n = this.trailChips.length;
    gap = Math.min(62, (cw - 30) / n);
    x0 = W * 0.5 - gap * (n - 1) * 0.5;
    for (i = 0; i < n; i++) {
      chip = this.trailChips[i];
      var x = x0 + gap * i, y = at(204);
      chip.back.setPosition(x, y); panelSize(chip.back, gap - 6, 46);
      chip.swatch.setPosition(x, y - 8); chip.swatch.setDisplaySize(20, 20);
      chip.label.setPosition(x, y + 13);
      chip.rect = { x: x - (gap - 6) * 0.5, y: y - 23, w: gap - 6, h: 46 };
    }
    this.rosterLabelB.setPosition(W * 0.5, at(242));
    n = this.skinChips.length;
    gap = Math.min(74, (cw - 30) / n);
    x0 = W * 0.5 - gap * (n - 1) * 0.5;
    for (i = 0; i < n; i++) {
      chip = this.skinChips[i];
      var x2 = x0 + gap * i, y2 = at(274);
      chip.back.setPosition(x2, y2); panelSize(chip.back, gap - 6, 46);
      chip.swatch.setPosition(x2, y2 - 8); chip.swatch.setDisplaySize(22, 22);
      chip.label.setPosition(x2, y2 + 13);
      chip.rect = { x: x2 - (gap - 6) * 0.5, y: y2 - 23, w: gap - 6, h: 46 };
    }
    this.rosterNote.setPosition(W * 0.5, at(308));

    var bw2 = Math.min(cw - 56, 260);
    var by1 = at(roster ? 358 : 200);
    this.btnBack.setPosition(W * 0.5, by1);
    panelSize(this.btnBack, bw2, 48);
    this.btnText.setPosition(W * 0.5, by1);
    this.btnRect = { x: W * 0.5 - bw2 * 0.5, y: by1 - 26, w: bw2, h: 52 };

    var by2 = at(roster ? 414 : 256);
    this.btn2Back.setPosition(W * 0.5, by2);
    panelSize(this.btn2Back, bw2, 38);
    this.btn2Text.setPosition(W * 0.5, by2);
    this.btn2Rect = { x: W * 0.5 - bw2 * 0.5, y: by2 - 21, w: bw2, h: 42 };

    this.menuHint.setPosition(W * 0.5, at(roster ? 448 : 292));
  };

  // ============================================================ round setup
  PlayScene.prototype.applySwitches = function (live) {
    var changed = false;
    if (SWITCH.round != null) {
      this.forcedRound = SWITCH.round;
      changed = true;
    }
    if (SWITCH.arena != null) {
      this.forcedArena = D.arena(SWITCH.arena).id;
      changed = true;
    }
    if (SWITCH.restart) { SWITCH.restart = false; changed = true; live = true; }
    if (live && changed) this.startRun(this.forcedRound || 1);
    return changed;
  };

  PlayScene.prototype.roundDef = function (n) {
    var def = D.round(n);
    if (this.forcedArena) {
      // Shallow clone so the authored table is never mutated by a switch.
      var copy = {};
      for (var k in def) copy[k] = def[k];
      copy.arena = this.forcedArena;
      return copy;
    }
    return def;
  };

  // Reads an authored map into the sim grids, bakes its board texture and
  // places the static furniture. Called for every round AND once at boot so
  // the title card sits on a real arena rather than an empty background.
  PlayScene.prototype.loadArena = function (arena) {
    var c, r, i;
    this.arena = arena;
    this.theme = arena.theme;
    this.wallGrid.fill(0); this.gateGrid.fill(0); this.padGrid.fill(0); this.coreGrid.fill(0);
    this.occ.fill(0); this.pipGrid.fill(0);
    this.pipSites.length = 0;
    this.coreCell = -1;
    var map = arena.map;
    for (r = 0; r < ROWS; r++) {
      var row = map[r];
      for (c = 0; c < COLS; c++) {
        var ch = row.charAt(c);
        var k = idx(c, r);
        if (ch === '#') this.wallGrid[k] = 1;
        else if (ch === '>') this.padGrid[k] = 1;
        else if (ch >= 'A' && ch <= 'D') this.gateGrid[k] = ch.charCodeAt(0) - 64;
        else if (ch === 'o') this.pipSites.push(k);
        else if (ch === '*') { this.coreCell = k; this.coreGrid[k] = 1; }
      }
    }
    // Shuffle the authored pip sites with the round seed: same round, same
    // drops, every time.
    for (i = this.pipSites.length - 1; i > 0; i--) {
      var j = Math.floor(this.rng() * (i + 1));
      var tmp = this.pipSites[i]; this.pipSites[i] = this.pipSites[j]; this.pipSites[j] = tmp;
    }
    this.pipCursor = 0;

    bakeBoard(this, arena, 'sp_board');
    this.boardImg.setTexture('sp_board');
    this.boardImg.setPosition(0, 0);
    this.boardImg.setDisplaySize(BW, BH);
    this.boardDetail.setPosition(0, 0);
    this.boardDetail.setDisplaySize(BW, BH);

    this.layoutPads();
    this.layoutGates();
    this.layoutCore();
  };

  PlayScene.prototype.startRun = function (startRound) {
    this.resetInputState();
    this.chipQueue.length = 0;
    this.chipT = 0;
    this.score = 0;
    this.runPips = 0;
    this.roundsCleared = 0;
    this.runSurvival = 0;
    this.profile.runs++;
    this.saveProfile();
    this.hideMenu();
    this.startRound(Math.max(1, startRound || 1));
  };

  PlayScene.prototype.startRound = function (n) {
    var i, c, r;
    this.resetInputState();
    this.round = n;
    this.roundInfo = this.roundDef(n);
    this.arena = D.arena(this.roundInfo.arena);
    this.theme = this.arena.theme;
    this.seed = (0x5E2F1D ^ (n * 7919) ^ (this.arena.id.length * 131)) >>> 0;
    this.rng = mulberry32(this.seed);
    this.roundTime = 0;
    this.acc = 0;
    this.stormInset = 0;
    this.stormNext = this.roundInfo.shrink ? this.roundInfo.shrink.start : Infinity;
    this.stormWarn = 0;
    this.chain = 0;
    this.padFlash = 0;
    this.corePulse = 0;
    this.nearMissCd = 0;
    this.roundPips = 0;
    this.rivalKills = 0;
    this.gateJustClosed = false;
    this.bodyDirty = true;
    this.rivalRespawnT = 0;

    this.loadArena(this.arena);

    // ---- snakes
    for (i = 0; i < MAX_SNAKES; i++) this.resetSnake(this.snakes[i]);
    this.spawnPlayer();
    var want = clamp(this.roundInfo.rivals, 0, 3);
    for (i = 0; i < want; i++) this.spawnRival(i);

    // ---- pips
    for (i = 0; i < MAX_PIPS; i++) {
      this.pips[i].live = false;
      this.pips[i].cell = -1;
      setVis(this.pipPool[i], false);
    }
    this.livePips = 0;
    this.pipBackoff = 0;
    this.maintainPips(0);

    setPieceFor(this.arena.setPiece).start(this);

    this.phase = 'play';
    this.phaseT = 0;
    this.tutorialStep = this.profile.tutorialDone ? -1 : 0;
    this.tutorialT = 0;
    this.coachT = 0;
    this.coachAlpha = 0;

    // Music intensity follows the arena, not a timer, so the mix is readable.
    kit.audio.music(this.roundInfo.shrink || this.round > 8 ? 'music_heat' : 'music_calm', 900);

    this.syncState();
  };

  PlayScene.prototype.resetSnake = function (s) {
    // Clear this snake's occupancy without touching anyone else's.
    for (var i = 0; i < s.count; i++) {
      var cell = bodyCellAt(s, i);
      if (cell >= 0 && this.occ[cell] === s.i + 1) this.occ[cell] = 0;
    }
    s.count = 0; s.head = 0; s.alive = false; s.grow = 0; s.boost = 0;
    s.pendingDir = -1; s.moveAcc = 0; s.shield = 0; s.tailCell = -1; s.tailFade = 0;
    s.deathT = 0; s.respawnT = 0; s.pips = 0; s.stepT = 0;
    s.animState = 'idle'; s.animT = 0; s.deathVisualT = 0; s.contactCell = -1;
  };

  PlayScene.prototype.findBodyPath = function (c, r, dir, len) {
    var path = [idx(c, r)], seen = {};
    seen[path[0]] = true;
    var preferred = [(dir + 2) % 4, (dir + 1) % 4, (dir + 3) % 4, dir];
    function walk(sc, sr) {
      if (path.length >= len) return true;
      var choices = preferred.slice();
      choices.sort(function (a, b) {
        var da = DIRS[a], db = DIRS[b];
        var ka = idx(sc + da.x, sr + da.y), kb = idx(sc + db.x, sr + db.y);
        var va = 0, vb = 0;
        for (var z = 0; z < 4; z++) {
          var za = DIRS[z], zb = DIRS[z];
          var na = sc + da.x + za.x, ra = sr + da.y + za.y;
          var nb = sc + db.x + zb.x, rb = sr + db.y + zb.y;
          if (na >= 1 && na < COLS - 1 && ra >= 1 && ra < ROWS - 1 && !seen[idx(na, ra)]) va++;
          if (nb >= 1 && nb < COLS - 1 && rb >= 1 && rb < ROWS - 1 && !seen[idx(nb, rb)]) vb++;
        }
        return va - vb;
      });
      for (var i = 0; i < choices.length; i++) {
        var d = DIRS[choices[i]], nc = sc + d.x, nr = sr + d.y;
        if (nc < 1 || nc >= COLS - 1 || nr < 1 || nr >= ROWS - 1) continue;
        var k = idx(nc, nr);
        if (this.wallGrid[k] || this.gateGrid[k] || this.coreGrid[k] || this.occ[k] || seen[k]) continue;
        seen[k] = true; path.push(k);
        if (walk.call(this, nc, nr)) return true;
        path.pop(); delete seen[k];
      }
      return false;
    }
    if (!walk.call(this, c, r)) return path;
    return path;
  };

  PlayScene.prototype.placeSnake = function (s, c, r, dirName, len) {
    var d = DIR_BY_NAME[dirName] != null ? DIR_BY_NAME[dirName] : 1;
    s.dir = d; s.pendingDir = -1;
    s.count = 0; s.head = 0;
    // Backtrack through reachable floor instead of greedily taking a dead end.
    // That guarantees the authored hunter length whenever the spawn has room.
    var cells = this.findBodyPath(c, r, d, Math.min(MAX_SNAKE_LEN, len));
    // cells is head-first; the ring buffer wants tail-first.
    for (var q = cells.length - 1; q >= 0; q--) {
      pushHead(s, cells[q]);
      this.occ[cells[q]] = s.i + 1;
    }
    var hk = bodyCellAt(s, 0);
    s.headC = hk % COLS; s.headR = Math.floor(hk / COLS);
    s.prevHeadC = s.headC; s.prevHeadR = s.headR;
    s.alive = true;
    s.stepT = 1;
  };

  PlayScene.prototype.spawnPlayer = function () {
    var s = this.snakes[0];
    var sp = this.arena.spawn;
    var trail = D.trail(this.profile.trail);
    s.ramp = { body: trail.body, head: trail.head, glow: trail.glow };
    s.headTex = headTextureFor(this.profile.skin);
    s.animState = 'idle'; s.animT = 0;
    s.ai = false;
    s.stepInterval = this.roundInfo.stepMs / 1000;
    this.placeSnake(s, sp.c, sp.r, sp.dir, START_LEN);
    s.shield = 0;
    this.headSprites[0].setTexture(s.headTex);
  };

  PlayScene.prototype.spawnRival = function (slot) {
    var s = this.snakes[slot + 1];
    var sp = this.arena.rivalSpawns[slot % this.arena.rivalSpawns.length];
    s.ramp = RIVAL_RAMPS[slot % RIVAL_RAMPS.length];
    s.headTex = 'sp_head_visor_idle';
    s.animState = 'idle'; s.animT = 0;
    s.ai = true;
    s.skill = this.roundInfo.skill;
    s.stepInterval = (this.roundInfo.stepMs + 12) / 1000;
    s.think = 0;
    this.placeSnake(s, sp.c, sp.r, sp.dir, Math.min(14, START_LEN + Math.floor(this.round * 0.6)));
    this.headSprites[slot + 1].setTexture(s.headTex);
    s.respawnT = 0;
  };

  // ------------------------------------------------------- static furniture
  PlayScene.prototype.layoutPads = function () {
    var n = 0, k, c, r;
    for (k = 0; k < COLS * ROWS; k++) {
      if (!this.padGrid[k]) continue;
      if (n >= MAX_PADS) break;
      c = k % COLS; r = Math.floor(k / COLS);
      var sp = this.padPool[n++];
      sp.setPosition(cellX(c), cellY(r));
      sp.setDisplaySize(CELL, CELL);
      setTintIf(sp, this.theme.pad);
      sp.setBlendMode(Phaser.BlendModes.ADD);
      sp.setVisible(true);
      sp.__cell = k;
      sp.__phase = this.visualRng() * Math.PI * 2;
    }
    this.padCount = n;
    for (; n < MAX_PADS; n++) setVis(this.padPool[n], false);
  };

  PlayScene.prototype.layoutGates = function () {
    var n = 0, k, c, r;
    this.gateGroups = {};
    for (k = 0; k < COLS * ROWS; k++) {
      var gcode = this.gateGrid[k];
      if (!gcode) continue;
      if (n >= MAX_GATES) break;
      c = k % COLS; r = Math.floor(k / COLS);
      var sp = this.gatePool[n++];
      sp.setPosition(cellX(c), cellY(r));
      sp.setDisplaySize(CELL, CELL);
      sp.setVisible(true);
      sp.__code = gcode;
      var letter = String.fromCharCode(64 + gcode);
      // Open/closed gate art and the warning pulse carry the hazard state;
      // group letters are debug-like text and do not belong in active play.
      setVis(this.gateLabels[n - 1], false);
      if (!this.gateGroups[letter]) {
        var def = this.arena.gates[letter] || { period: 8, phase: 0, openFrac: 0.6 };
        this.gateGroups[letter] = { def: def, open: true, wasOpen: true, warn: 0, flash: 0 };
      }
    }
    this.gateCount = n;
    for (; n < MAX_GATES; n++) {
      setVis(this.gatePool[n], false);
      setVis(this.gateLabels[n], false);
    }
  };

  PlayScene.prototype.layoutCore = function () {
    if (this.coreCell < 0) {
      setVis(this.corePlate, false); setVis(this.coreGlow, false);
      return;
    }
    var c = this.coreCell % COLS, r = Math.floor(this.coreCell / COLS);
    this.corePlate.setPosition(cellX(c), cellY(r));
    this.corePlate.setDisplaySize(CELL * 2.6, CELL * 2.6);
    setTintIf(this.corePlate, this.theme.accent);
    this.corePlate.setBlendMode(Phaser.BlendModes.ADD);
    setVis(this.corePlate, true);
    this.coreGlow.setPosition(cellX(c), cellY(r));
    this.coreGlow.setDisplaySize(CELL * 5, CELL * 5);
    setTintIf(this.coreGlow, this.theme.accent);
    setVis(this.coreGlow, true);
  };

  // ==================================================================== pips
  PlayScene.prototype.pipTarget = function () {
    var base = this.arena.pipBase;
    // GENEROUS opening: the drop set is fattest in the first stretch of every
    // round, then settles to the arena baseline.
    if (this.roundTime < EARLY_WINDOW) return base + 5;
    if (this.roundTime < EARLY_WINDOW * 2) return base + 2;
    return base;
  };

  PlayScene.prototype.cellFree = function (k) {
    return k >= 0 && k < COLS * ROWS && !this.wallGrid[k] && !this.gateGrid[k] &&
      !this.coreGrid[k] && !this.occ[k] && !this.pipGrid[k] && !this.inStorm(k);
  };

  PlayScene.prototype.spawnPipAt = function (c, r, kind) {
    if (c < 1 || c >= COLS - 1 || r < 1 || r >= ROWS - 1) return false;
    var k = idx(c, r);
    if (!this.cellFree(k)) return false;
    return this.addPip(k, kind);
  };

  PlayScene.prototype.addPip = function (k, kind) {
    for (var i = 0; i < MAX_PIPS; i++) {
      var p = this.pips[i];
      if (p.live) continue;
      p.live = true; p.cell = k; p.kind = kind || 'charge'; p.born = this.simTime;
      p.phase = this.visualRng() * Math.PI * 2;
      this.pipGrid[k] = i + 1;
      this.livePips++;
      var sp = this.pipPool[i];
      sp.setTexture(kind === 'shield' ? 'sp_shieldpip_art' : 'sp_pip_art');
      sp.setPosition(cellX(k % COLS), cellY(Math.floor(k / COLS)));
      sp.setBlendMode(Phaser.BlendModes.ADD);
      setTintIf(sp, kind === 'shield' ? 0x9ef6ff
        : mixColor(0xffffff, this.theme ? this.theme.accent : 0x55e7ff, 0.5));
      sp.setVisible(true);
      return true;
    }
    return false;
  };

  PlayScene.prototype.removePip = function (i) {
    var p = this.pips[i];
    if (!p.live) return;
    p.live = false;
    if (this.pipGrid[p.cell] === i + 1) this.pipGrid[p.cell] = 0;
    this.livePips--;
    this.pipBackoff = 0;              // a freed cell is a fresh chance to place
    setVis(this.pipPool[i], false);
  };

  PlayScene.prototype.maintainPips = function (dt) {
    if (this.pipBackoff > 0) { this.pipBackoff -= (dt || 0); return; }
    var want = this.pipTarget();
    if (this.livePips >= want) return;
    var placed = 0;
    var guard = 0;
    while (this.livePips < want && guard++ < 12) {
      var k = -1;
      // authored sites first, so the early drops sit where they were placed
      var tries = 0;
      while (this.pipCursor < this.pipSites.length && tries++ < this.pipSites.length) {
        var cand = this.pipSites[this.pipCursor++];
        if (this.cellFree(cand)) { k = cand; break; }
      }
      if (k < 0) {
        for (var t = 0; t < 30; t++) {
          var c = 1 + Math.floor(this.rng() * (COLS - 2));
          var r = 1 + Math.floor(this.rng() * (ROWS - 2));
          var cand2 = idx(c, r);
          if (this.cellFree(cand2)) { k = cand2; break; }
        }
      }
      if (k < 0) break;
      if (!this.addPip(k, 'charge')) break;
      placed++;
      if (this.pipCursor >= this.pipSites.length) this.pipCursor = 0;
    }
    // Nothing would fit: stop hunting for a slot for a beat.
    if (!placed) this.pipBackoff = 0.5;
  };

  // =================================================================== gates
  PlayScene.prototype.updateGates = function () {
    this.gateJustClosed = false;
    for (var letter in this.gateGroups) {
      var g = this.gateGroups[letter];
      var def = g.def;
      var phase = (this.roundTime + def.phase) % def.period;
      var openFor = def.period * def.openFrac;
      var open = phase < openFor;
      g.open = open;
      // Tell: the last 2 s of the open window is the telegraph.
      g.warn = open ? clamp((phase - (openFor - 2.0)) / 2.0, 0, 1) : 0;
      if (g.wasOpen && !open) {
        this.gateJustClosed = true;
        g.flash = 1;
        this.sfx('gate', 0.55);
      }
      if (!g.wasOpen && open) g.flash = 0.5;
      if (g.warn > 0 && g.warnTick !== Math.floor(g.warn * 3)) {
        g.warnTick = Math.floor(g.warn * 3);
        this.sfx('gatewarn', 0.16);
      }
      g.wasOpen = open;
    }
  };

  PlayScene.prototype.gateClosedAt = function (k, lookaheadSec) {
    var code = this.gateGrid[k];
    if (!code) return false;
    var g = this.gateGroups[String.fromCharCode(64 + code)];
    if (!g) return true;                      // guarded: unknown gate is solid
    if (!g.open) return true;
    if (!lookaheadSec) return false;
    var def = g.def;
    var phase = (this.roundTime + def.phase) % def.period;
    var openFor = def.period * def.openFrac;
    return (openFor - phase) < lookaheadSec;
  };

  // =================================================================== storm
  PlayScene.prototype.inStorm = function (k) {
    if (!this.stormInset) return false;
    var c = k % COLS, r = Math.floor(k / COLS);
    var i = this.stormInset;
    return c <= i || c >= COLS - 1 - i || r <= i || r >= ROWS - 1 - i;
  };

  PlayScene.prototype.updateStorm = function (dt) {
    var sh = this.roundInfo.shrink;
    if (!sh) { this.stormWarn = 0; return; }
    var untilNext = this.stormNext - this.roundTime;
    this.stormWarn = untilNext <= 4 ? clamp(1 - untilNext / 4, 0, 1) : 0;
    if (untilNext <= 4 && !this.stormTicked) {
      this.stormTicked = true;
      this.sfx('storm', 0.5);
      this.setChip('WALLS CLOSING', this.theme.storm);
    }
    if (untilNext > 4) this.stormTicked = false;
    if (this.roundTime >= this.stormNext && this.stormInset < sh.max) {
      this.stormInset++;
      this.stormNext = this.roundTime + sh.period;
      this.stormTicked = false;
      this.shake(7, 320);
      this.sfx('gate', 0.5);
      // Anything caught in the new ring dies with it.
      for (var k = 0; k < COLS * ROWS; k++) {
        if (!this.inStorm(k)) continue;
        if (this.pipGrid[k]) this.removePip(this.pipGrid[k] - 1);
        var owner = this.occ[k];
        if (owner) {
          var s = this.snakes[owner - 1];
          if (s.alive) this.killSnake(s, 'storm');
        }
      }
    }
  };

  // ================================================================== sim
  PlayScene.prototype.simStep = function (dt) {
    this.simTime += dt;
    this.roundTime += dt;
    this.phaseT += dt;

    this.updateGates();
    this.updateStorm(dt);
    var i, s;

    for (i = 0; i < MAX_SNAKES; i++) {
      if (this.snakes[i].animT > 0) {
        this.snakes[i].animT -= dt;
        if (this.snakes[i].animT <= 0 && this.snakes[i].alive) this.snakes[i].animState = 'idle';
      }
    }

    var player = this.snakes[0];

    for (i = 0; i < MAX_SNAKES; i++) {
      s = this.snakes[i];
      if (!s.alive) {
        if (s.deathVisualT > 0) s.deathVisualT = Math.max(0, s.deathVisualT - dt);
        if (s.ai && s.respawnT > 0) {
          s.respawnT -= dt;
          if (s.respawnT <= 0) this.respawnRival(i - 1);
        }
        continue;
      }
      s.boost = Math.max(0, s.boost - dt);
      var interval = s.stepInterval * (s.boost > 0 ? BOOST_MULT : 1);
      s.moveAcc += dt;
      var guard = 0;
      while (s.moveAcc >= interval && guard++ < 4) {
        s.moveAcc -= interval;
        this.stepSnake(s, interval);
        if (!s.alive) break;
        interval = s.stepInterval * (s.boost > 0 ? BOOST_MULT : 1);
      }
      s.stepT = interval > 0 ? clamp(s.moveAcc / interval, 0, 1) : 1;
    }

    this.nearMissCd = Math.max(0, this.nearMissCd - dt);
    this.padFlash = Math.max(0, this.padFlash - dt * 2.2);
    this.corePulse = Math.max(0, this.corePulse - dt * 1.6);
    this.chipT = Math.max(0, this.chipT - dt);
    setPieceFor(this.arena.setPiece).tick(this, dt);
    this.maintainPips(dt);
    this.tickTutorial(dt);

    // rival respawn pressure: the round always wants its full hunter count
    var aliveRivals = 0;
    for (i = 1; i < MAX_SNAKES; i++) if (this.snakes[i].alive) aliveRivals++;
    if (aliveRivals < clamp(this.roundInfo.rivals, 0, 3)) {
      for (i = 1; i < MAX_SNAKES; i++) {
        var rs = this.snakes[i];
        if (!rs.alive && rs.respawnT <= 0 && i - 1 < clamp(this.roundInfo.rivals, 0, 3)) {
          rs.respawnT = RIVAL_RESPAWN;
          break;
        }
      }
    }

    // score accrues with survival
    this.score += dt * 5 * (1 + Math.min(2, this.round * 0.08));

    if (player.alive && this.roundTime >= this.roundInfo.par) this.clearRound();
  };

  PlayScene.prototype.respawnRival = function (slot) {
    // Pick the spawn point furthest from the player so a respawn is never a
    // free kill on either side.
    var player = this.snakes[0];
    var best = 0, bestD = -1;
    var pc = player.headC, pr = player.headR;
    for (var i = 0; i < this.arena.rivalSpawns.length; i++) {
      var sp = this.arena.rivalSpawns[i];
      var k = idx(sp.c, sp.r);
      if (this.occ[k] || this.inStorm(k)) continue;
      var d = Math.abs(sp.c - pc) + Math.abs(sp.r - pr);
      if (d > bestD) { bestD = d; best = i; }
    }
    if (bestD < 0) return;
    var s = this.snakes[slot + 1];
    var save = this.arena.rivalSpawns;
    var pick = save[best];
    s.ramp = RIVAL_RAMPS[slot % RIVAL_RAMPS.length];
    s.headTex = 'sp_head_visor_idle';
    s.animState = 'idle'; s.animT = 0;
    s.ai = true;
    s.skill = this.roundInfo.skill;
    s.stepInterval = (this.roundInfo.stepMs + 12) / 1000;
    this.placeSnake(s, pick.c, pick.r, pick.dir, Math.min(14, START_LEN + Math.floor(this.round * 0.6)));
    this.headSprites[slot + 1].setTexture(s.headTex);
    this.bodyDirty = true;
    this.emitRing(cellX(pick.c), cellY(pick.r), s.ramp.glow, 12);
  };

  PlayScene.prototype.stepSnake = function (s) {
    if (s.ai) this.thinkRival(s);
    var oldDir = s.dir;
    // -------- turn consumption: exactly one per step, reversal blocked.
    if (s.pendingDir >= 0) {
      var nd = s.pendingDir;
      s.pendingDir = -1;
      if (!((nd + 2) % 4 === s.dir)) s.dir = nd;
    }
    var turned = s.dir !== oldDir;

    var dir = DIRS[s.dir];
    var nc = s.headC + dir.x, nr = s.headR + dir.y;

    // -------- tail leaves before the head arrives, so chasing your own tail
    // is legal exactly as a player expects.
    var freedTail = -1;
    if (s.grow > 0) s.grow--;
    else {
      freedTail = popTail(s);
      if (freedTail >= 0 && this.occ[freedTail] === s.i + 1) this.occ[freedTail] = 0;
      s.tailCell = freedTail;
      s.tailFade = 1;
    }

    if (this.isFatal(nc, nr)) {
      // shield: spend a charge and take the best legal turn instead of dying
      if (s.shield > 0) {
        var alt = this.bestEscape(s);
        if (alt >= 0) {
          s.shield--;
          s.dir = alt;
          dir = DIRS[alt];
          nc = s.headC + dir.x; nr = s.headR + dir.y;
          if (!s.ai) {
            this.sfx('shield', 0.7);
            this.shake(10, 300);
            this.emitRing(cellX(s.headC), cellY(s.headR), 0x9ef6ff, 18);
            this.setChip('SHIELD SPENT', 0x9ef6ff);
          }
          } else { this.killSnake(s, 'crash', this.safeContactCell(nc, nr)); return; }
        } else { this.killSnake(s, 'crash', this.safeContactCell(nc, nr)); return; }
    } else if (turned && this.isFatal(s.headC + DIRS[oldDir].x, s.headR + DIRS[oldDir].y)) {
      // NEAR MISS: the cell straight ahead would have ended the run.
      if (!s.ai && this.nearMissCd <= 0) {
        this.nearMissCd = NEAR_MISS_CD;
        this.shake(6, 220);
        this.sfx('save', 0.5);
        this.addScore(25);
        this.setChip('SAVE', 0x9ef6ff);
        this.emitSpark(cellX(s.headC), cellY(s.headR), s.ramp.glow, 8);
      }
    }

    var k = idx(nc, nr);
    s.prevHeadC = s.headC; s.prevHeadR = s.headR;
    s.headC = nc; s.headR = nr;
    pushHead(s, k);
    this.occ[k] = s.i + 1;
    this.bodyDirty = true;

    if (turned) {
      s.animState = 'turn';
      s.animT = 0.34;
      if (!s.ai) this.sfx('turn', 0.22);
    }

    // -------- pickups
    var pipIdx = this.pipGrid[k];
    if (pipIdx) this.collectPip(s, pipIdx - 1);
    if (this.padGrid[k]) this.hitPad(s, k);
  };

  PlayScene.prototype.bestEscape = function (s) {
    var order = [(s.dir + 3) % 4, (s.dir + 1) % 4, s.dir, (s.dir + 2) % 4];
    var best = -1, bestSpace = -1;
    for (var i = 0; i < order.length; i++) {
      var d = order[i];
      if ((d + 2) % 4 === s.dir && i < 3) continue;
      var dir = DIRS[d];
      var c = s.headC + dir.x, r = s.headR + dir.y;
      if (this.isFatal(c, r)) continue;
      var space = this.freeSpace(idx(c, r), 60);
      if (space > bestSpace) { bestSpace = space; best = d; }
    }
    return best;
  };

  PlayScene.prototype.isFatal = function (c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true;
    var k = idx(c, r);
    if (this.wallGrid[k]) return true;
    if (this.occ[k]) return true;
    if (this.inStorm(k)) return true;
    if (this.gateClosedAt(k, 0)) return true;
    return false;
  };

  PlayScene.prototype.safeContactCell = function (c, r) {
    return idx(clamp(c, 0, COLS - 1), clamp(r, 0, ROWS - 1));
  };

  PlayScene.prototype.collectPip = function (s, i) {
    var p = this.pips[i];
    if (!p.live) return;
    var kind = p.kind;
    var x = cellX(p.cell % COLS), y = cellY(Math.floor(p.cell / COLS));
    this.removePip(i);
    if (kind === 'shield') {
      s.shield = Math.min(SHIELD_MAX, s.shield + 1);
      if (!s.ai) {
        this.sfx('shield', 0.6);
        this.setChip('SHIELD +1', 0x9ef6ff);
        this.emitRing(x, y, 0x9ef6ff, 16);
        this.triggerImpact('pickup', x, y, 0x9ef6ff, 'SHIELD');
      }
      return;
    }
    s.grow = Math.min(MAX_SNAKE_LEN - s.count, s.grow + PIP_GROW);
    s.pips++;
    if (s.ai) {
      this.emitPipBurst(x, y, s.ramp.glow, 4);
      return;
    }
    this.roundPips++;
    this.runPips++;
    this.profile.totalPips++;
    this.addScore(10 * (1 + Math.min(1.5, this.chain * 0.08)));
    this.sfx('pip', 0.6);
    this.emitPipBurst(x, y, s.ramp.glow, 10);
    this.shake(2.5, 110);
    this.triggerImpact('pickup', x, y, s.ramp.glow, '+10');
    this.tutorialEvent('pip');
  };

  PlayScene.prototype.hitPad = function (s, k) {
    var dur = this.roundTime < EARLY_WINDOW ? BOOST_TIME_EARLY : BOOST_TIME;
    var had = s.boost > 0.25;
    s.boost = Math.min(BOOST_CAP, s.boost + dur);
    if (s.ai) return;
    if (!had) this.sfx('boost', 0.5);
    this.chain++;
    this.padFlash = 1;
    this.addScore(6);
    this.emitSpark(cellX(k % COLS), cellY(Math.floor(k / COLS)), this.theme.pad, 7);
    this.shake(3, 130);
    this.triggerImpact('pad', cellX(k % COLS), cellY(Math.floor(k / COLS)), this.theme.pad, '+6');
    if (this.chain % 4 === 0) this.setChip('CHAIN x' + this.chain, this.theme.pad);
  };

  PlayScene.prototype.killSnake = function (s, cause, contactCell) {
    if (!s.alive) return;
    s.alive = false;
    s.deathT = 0;
    s.animState = 'damage'; s.animT = 0.42; s.deathVisualT = 0.42;
    s.contactCell = contactCell == null ? idx(s.headC, s.headR) : contactCell;
    var contactC = clamp(s.contactCell % COLS, 0, COLS - 1);
    var contactR = clamp(Math.floor(s.contactCell / COLS), 0, ROWS - 1);
    var x = cellX(contactC), y = cellY(contactR);
    this.emitCrash(x, y, s.ramp.glow, s.ai ? 16 : 30);
    // release the whole body so the arena breathes again
    for (var i = 0; i < s.count; i++) {
      var cell = bodyCellAt(s, i);
      if (cell >= 0 && this.occ[cell] === s.i + 1) this.occ[cell] = 0;
    }
    this.bodyDirty = true;
    if (s.ai) {
      this.rivalKills++;
      this.addScore(150);
      this.sfx('crash', 0.45);
      this.shake(6, 240);
      this.setChip('HUNTER DOWN', s.ramp.glow);
      this.triggerImpact('hunter', x, y, s.ramp.glow, '+150');
      s.respawnT = RIVAL_RESPAWN;
      setPieceFor(this.arena.setPiece).tick(this, 0);
    } else {
      this.sfx('crash', 0.9);
      this.shake(16, 520);
      this.triggerImpact('crash', x, y, s.ramp.glow, 'LINE LOST');
      this.endRun(cause);
    }
  };

  // ------------------------------------------------------------------- AI
  PlayScene.prototype.freeSpace = function (startCell, budget) {
    this.floodStamp++;
    var stamp = this.floodStamp;
    var q = this.floodQueue, mark = this.floodMark;
    var qh = 0, qt = 0, seen = 0;
    q[qt++] = startCell; mark[startCell] = stamp;
    while (qh < qt && seen < budget) {
      var k = q[qh++]; seen++;
      var c = k % COLS, r = (k - c) / COLS;
      for (var d = 0; d < 4; d++) {
        var nc = c + DIRS[d].x, nr = r + DIRS[d].y;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        var nk = nr * COLS + nc;
        if (mark[nk] === stamp) continue;
        if (this.wallGrid[nk] || this.occ[nk] || this.inStorm(nk)) continue;
        if (this.gateClosedAt(nk, 0)) continue;
        mark[nk] = stamp;
        if (qt < q.length) q[qt++] = nk;
      }
    }
    return seen;
  };

  PlayScene.prototype.thinkRival = function (s) {
    var player = this.snakes[0];
    var lead = 2 + Math.floor(s.skill * 3);
    var tc, tr;
    if (player.alive) {
      tc = clamp(player.headC + DIRS[player.dir].x * lead, 1, COLS - 2);
      tr = clamp(player.headR + DIRS[player.dir].y * lead, 1, ROWS - 2);
    } else {
      tc = Math.floor(COLS / 2); tr = Math.floor(ROWS / 2);
    }
    // Collect the legal moves FIRST. The flood fill is the expensive part of
    // this function by a wide margin, so it never runs for a corridor where
    // there is only one way to go, and its budget is bounded tightly enough
    // that three hunters cost a fraction of a frame at 4x throttle.
    var order = [(s.dir + 3) % 4, s.dir, (s.dir + 1) % 4];
    var legal = this._legal || (this._legal = [0, 0, 0]);
    var nLegal = 0;
    for (var i = 0; i < order.length; i++) {
      var d0 = order[i];
      var dir0 = DIRS[d0];
      var c0 = s.headC + dir0.x, r0 = s.headR + dir0.y;
      if (this.isFatal(c0, r0)) continue;
      // A gate about to slam is treated as shut: hunters read the tell too.
      if (this.gateClosedAt(idx(c0, r0), 0.55)) continue;
      legal[nLegal++] = d0;
    }
    if (nLegal === 0) return;                       // boxed in; it dies as it should
    if (nLegal === 1) {
      if (legal[0] !== s.dir) s.pendingDir = legal[0];
      return;
    }

    var budget = Math.floor(26 + s.skill * 40);
    var noise = (1 - s.skill) * 5;
    var best = -1, bestScore = -1e9;
    for (i = 0; i < nLegal; i++) {
      var d = legal[i];
      var dir = DIRS[d];
      var c = s.headC + dir.x, r = s.headR + dir.y;
      var k = idx(c, r);
      var space = this.freeSpace(k, budget);
      var dist = Math.abs(c - tc) + Math.abs(r - tr);
      var score = space * 0.34 - dist * 1.0 + (d === s.dir ? 0.7 : 0) + this.rng() * noise;
      if (this.padGrid[k]) score += 1.4;
      if (this.pipGrid[k]) score += 2.2;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    if (best >= 0 && best !== s.dir) s.pendingDir = best;
  };

  // ================================================================= scoring
  PlayScene.prototype.addScore = function (n) { this.score += n; };

  PlayScene.prototype.clearRound = function () {
    if (this.phase !== 'play') return;
    this.phase = 'clear';
    this.phaseT = 0;
    this.roundsCleared++;
    this.runSurvival += this.roundTime;
    this.profile.totalSurvival += this.roundTime;

    var medal = D.medalFor(this.roundInfo, this.roundTime, this.roundPips);
    var bonus = { none: 0, bronze: 50, silver: 120, gold: 250, platinum: 450 }[medal] || 0;
    this.addScore(200 + bonus);
    this.recordMedal(this.round, medal);

    if (this.round > this.profile.bestRound) this.profile.bestRound = this.round;
    this.saveProfile();
    var gained = this.refreshUnlocks(false);

    this.sfx('clear', 0.8);
    kit.juice.hitStop(REDUCED ? 0 : 90);
    this.showBanner('ROUND CLEAR', D.medal(medal).name.toUpperCase() + '  -  ' +
      this.roundPips + ' pips  -  ' + fmtTime(this.roundTime), medal, 2.4);
    if (gained.length) this.queueUnlockBanner(gained[0]);
    this.syncState();
  };

  PlayScene.prototype.recordMedal = function (roundN, medal) {
    var key = String(roundN);
    var prev = this.profile.medals[key];
    var prevRank = D.medal(prev).rank;
    var rank = D.medal(medal).rank;
    if (rank <= prevRank) return;
    this.profile.medals[key] = medal;
    // recount so the milestone gates cannot drift out of sync with the table
    var g = 0, p = 0;
    for (var k in this.profile.medals) {
      var m = this.profile.medals[k];
      if (m === 'gold') g++;
      else if (m === 'platinum') { g++; p++; }
    }
    this.profile.goldCount = g;
    this.profile.platinumCount = p;
  };

  PlayScene.prototype.endRun = function () {
    if (this.phase === 'dead') return;
    this.phase = 'dead';
    this.phaseT = 0;
    this.runSurvival += this.roundTime;
    this.profile.totalSurvival += this.roundTime;

    var medal = D.medalFor(this.roundInfo, this.roundTime, this.roundPips);
    if (medal !== 'none') this.recordMedal(this.round, medal);
    this.lastMedal = medal;

    var sc = Math.floor(this.score);
    if (sc > this.profile.best) this.profile.best = sc;
    if (this.round - 1 > this.profile.bestRound) this.profile.bestRound = this.round - 1;
    this.saveProfile();
    var gained = this.refreshUnlocks(false);

    kit.audio.stopMusic(600);
    kit.juice.hitStop(REDUCED ? 0 : 120);
    this.showBanner('LINE LOST', 'Round ' + this.round + '  -  ' + fmtTime(this.roundTime) +
      ' survived  -  ' + D.medal(medal).name, medal !== 'none' ? medal : null, 2.0);
    if (gained.length) this.queueUnlockBanner(gained[0]);
    this.deadMenuAt = 2.0;
    this.syncState();
  };

  PlayScene.prototype.queueUnlockBanner = function (def) {
    this.unlockQueue = this.unlockQueue || [];
    this.unlockQueue.push(def);
  };

  // ================================================================== juice
  PlayScene.prototype.shake = function (mag, ms) {
    if (REDUCED) return;
    kit.juice.shake(mag, ms);
  };
  PlayScene.prototype.sfx = function (name, vol) {
    kit.audio.sfx(name, { volume: vol == null ? 0.6 : vol });
  };
  PlayScene.prototype.showChip = function (item) {
    this.chipTextValue = item.text;
    this.chipColor = item.color || 0x55e7ff;
    this.chipT = 1.0;
  };
  PlayScene.prototype.pumpChip = function () {
    if (this.chipT > 0 || this.bannerVisible || this.menuVisible ||
        this.tutorialStep >= 0 || this.coachAlpha > 0.05) return;
    if (this.chipQueue.length) this.showChip(this.chipQueue.shift());
  };
  PlayScene.prototype.setChip = function (text, color) {
    if (this.menuVisible || this.phase === 'title') return;
    var item = { text: text, color: color || 0x55e7ff };
    var last = this.chipQueue.length ? this.chipQueue[this.chipQueue.length - 1] : null;
    if ((this.chipT > 0 && this.chipTextValue === text) || (last && last.text === text)) return;
    if (this.chipT > 0 || this.bannerVisible || this.tutorialStep >= 0 || this.coachAlpha > 0.05) {
      if (this.chipQueue.length >= 4) this.chipQueue.shift();
      this.chipQueue.push(item);
      return;
    }
    this.showChip(item);
  };
  PlayScene.prototype.triggerImpact = function (kind, x, y, color, scoreText) {
    this.impactKind = kind;
    this.impactX = x;
    this.impactY = y;
    this.impactColor = color || 0x55e7ff;
    this.impactScore = scoreText || '';
    this.impactT = (REDUCED || !kit.juice.enabled) ? 0 : 0.52;
    if (this.impactT <= 0) {
      setVis(this.impactRing, false);
      setVis(this.impactText, false);
      setVis(this.damageVignette, false);
    }
  };
  PlayScene.prototype.renderImpact = function (dt) {
    if (this.impactT <= 0) {
      setVis(this.impactRing, false);
      setVis(this.impactText, false);
      setVis(this.damageVignette, false);
      return;
    }
    this.impactT = Math.max(0, this.impactT - dt);
    var elapsed = 0.52 - this.impactT;
    var anticipation = clamp(elapsed / 0.10, 0, 1);
    var contact = clamp((elapsed - 0.10) / 0.10, 0, 1);
    var follow = clamp((elapsed - 0.20) / 0.32, 0, 1);
    var scale = elapsed < 0.10 ? 0.68 + anticipation * 0.22 :
      elapsed < 0.20 ? 0.90 + contact * 0.42 : 1.32 + follow * 0.82;
    var alpha = elapsed < 0.20 ? 0.88 : 0.88 * (1 - follow);
    this.impactRing.setPosition(this.impactX, this.impactY);
    this.impactRing.setDisplaySize(CELL * scale, CELL * scale);
    setTintIf(this.impactRing, this.impactColor);
    this.impactRing.setAlpha(alpha);
    setVis(this.impactRing, true);
    // The score already lives in the HUD. Keep the local ring as a restrained
    // visual hit cue, but remove duplicate floating text from active play.
    setVis(this.impactText, false);
    var damage = this.impactKind === 'crash' ? (elapsed < 0.20 ? 0.36 : 0.36 * (1 - follow)) : 0;
    this.damageVignette.setAlpha(damage);
    setVis(this.damageVignette, damage > 0);
  };
  PlayScene.prototype.emitSpark = function (x, y, color, n) {
    n = Math.max(1, Math.round(n * this.particleScale));
    this.emSpark.setParticleTint(color);
    this.emSpark.explode(n, x, y);
  };
  PlayScene.prototype.emitPipBurst = function (x, y, color, n) {
    n = Math.max(1, Math.round(n * this.particleScale));
    this.emPip.setParticleTint(color);
    this.emPip.explode(n, x, y);
  };
  PlayScene.prototype.emitCrash = function (x, y, color, n) {
    n = Math.max(1, Math.round(n * this.particleScale));
    this.emCrash.setParticleTint(color);
    this.emCrash.explode(n, x, y);
  };
  PlayScene.prototype.emitRing = function (x, y, color, n) {
    n = Math.max(1, Math.round(n * this.particleScale));
    this.emSpark.setParticleTint(color);
    this.emSpark.explode(n, x, y);
  };
  PlayScene.prototype.headScreenX = function (s) { return cellX(s.headC); };
  PlayScene.prototype.headScreenY = function (s) { return cellY(s.headR); };

  // =============================================================== tutorial
  PlayScene.prototype.tickTutorial = function (dt) {
    if (this.tutorialStep < 0) return;
    var step = D.TUTORIAL[this.tutorialStep];
    if (!step) { this.tutorialStep = -1; return; }
    this.tutorialT += dt;
    if (step.done === 'time' && this.tutorialT * 1000 >= step.minMs) this.tutorialEvent('time');
  };

  PlayScene.prototype.tutorialEvent = function (kind) {
    if (this.tutorialStep < 0) return;
    var step = D.TUTORIAL[this.tutorialStep];
    if (!step || step.done !== kind) return;
    if (this.tutorialT * 1000 < step.minMs && kind !== 'time') return;
    this.tutorialStep++;
    this.tutorialT = 0;
    this.coachT = 0;
    if (this.tutorialStep >= D.TUTORIAL.length) {
      this.tutorialStep = -1;
      this.profile.tutorialDone = true;
      this.saveProfile();
    }
  };

  // ================================================================== input
  PlayScene.prototype.resetInputState = function () {
    this.ptrState.clear();
    this.keyEdge = {};
    this.tapPending = false;
    if (kit.input.clearGamepad) kit.input.clearGamepad();
  };

  PlayScene.prototype.pollInput = function () {
    var i;
    var gamepad = kit.input.gamepad ? kit.input.gamepad() : null;
    if (gamepad) {
      if (gamepad.pressed) this.requestTurn(gamepad.direction);
      if (gamepad.confirm) this.confirm();
      if (gamepad.pause) this.togglePause();
    }
    // ---- pointers: GGKit owns identity; this only reads the map.
    var live = kit.input.pointers;
    var seen = this.ptrState;
    live.forEach(function (p, id) {
      var st = seen.get(id);
      if (!st) { st = { swiped: false, sx: p.startX, sy: p.startY, t: 0 }; seen.set(id, st); }
      var dx = p.x - st.sx, dy = p.y - st.sy;
      var adx = Math.abs(dx), ady = Math.abs(dy);
      if (Math.max(adx, ady) >= 22) {
        st.swiped = true;
        // Re-anchor so one continuous drag can chain several turns, which is
        // what a light-cycle player expects from their thumb.
        st.sx = p.x; st.sy = p.y;
        this.requestTurn(adx > ady ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      }
    }, this);
    // released pointers -> tap or swipe end
    var toDrop = [];
    seen.forEach(function (st, id) {
      if (!live.has(id)) toDrop.push(id);
    });
    for (i = 0; i < toDrop.length; i++) {
      var st2 = seen.get(toDrop[i]);
      if (st2 && !st2.swiped) this.handleTap(st2.sx, st2.sy);
      seen.delete(toDrop[i]);
    }

    // ---- keys: polled from GGKit every frame, edge-detected here.
    this.keyTurn('ArrowUp', 'up'); this.keyTurn('KeyW', 'up');
    this.keyTurn('ArrowDown', 'down'); this.keyTurn('KeyS', 'down');
    this.keyTurn('ArrowLeft', 'left'); this.keyTurn('KeyA', 'left');
    this.keyTurn('ArrowRight', 'right'); this.keyTurn('KeyD', 'right');
    if (this.keyPressed('Space') || this.keyPressed('Enter')) this.confirm();
    if (this.keyPressed('Escape') || this.keyPressed('KeyP')) this.togglePause();
  };

  PlayScene.prototype.keyPressed = function (code) {
    var down = kit.input.keyDown(code);
    var was = !!this.keyEdge[code];
    this.keyEdge[code] = down;
    return down && !was;
  };
  PlayScene.prototype.keyTurn = function (code, dirName) {
    if (this.keyPressed(code)) this.requestTurn(dirName);
  };

  PlayScene.prototype.requestTurn = function (dirName) {
    if (this.phase !== 'play' || kit.paused) return;
    var s = this.snakes[0];
    if (!s.alive) return;
    var d = DIR_BY_NAME[dirName];
    if (d == null) return;
    // Reversal guard, and the no-double-turn rule: the request is compared
    // against the turn already queued for this step, not just the live
    // direction, so two fast swipes can never fold the head into the neck.
    var reference = s.pendingDir >= 0 ? s.pendingDir : s.dir;
    if (d === reference) return;
    if ((d + 2) % 4 === reference) return;
    s.pendingDir = d;
    this.tutorialEvent('turn');
  };

  PlayScene.prototype.hit = function (rect, x, y) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  };

  PlayScene.prototype.handleTap = function (x, y) {
    if (this.menuVisible) {
      var i;
      for (i = 0; i < this.trailChips.length; i++) {
        if (this.hit(this.trailChips[i].rect, x, y)) return this.pickVariant(this.trailChips[i]);
      }
      for (i = 0; i < this.skinChips.length; i++) {
        if (this.hit(this.skinChips[i].rect, x, y)) return this.pickVariant(this.skinChips[i]);
      }
      if (this.hit(this.btnRect, x, y)) { this.sfx('click', 0.5); return this.primaryAction(); }
      if (this.hit(this.btn2Rect, x, y)) { this.sfx('click', 0.4); return this.secondaryAction(); }
      return;
    }
    if (this.hit(this.pauseRect, x, y)) { this.sfx('click', 0.4); return this.togglePause(); }
    if (this.phase === 'dead' && this.phaseT >= this.deadMenuAt) return this.showDeadMenu();
  };

  PlayScene.prototype.confirm = function () {
    if (this.menuVisible) return this.primaryAction();
    if (this.phase === 'dead' && this.phaseT >= this.deadMenuAt) return this.showDeadMenu();
  };

  PlayScene.prototype.pickVariant = function (chip) {
    if (!this.profile.unlocked[chip.id]) {
      var def = chip.kind === 'trail' ? D.trail(chip.id) : D.skin(chip.id);
      this.setChip('LOCKED', 0xff668e);
      setTxt(this.rosterNote, def.reqText);
      this.sfx('click', 0.3);
      return;
    }
    this.sfx('click', 0.5);
    if (chip.kind === 'trail') this.profile.trail = chip.id;
    else this.profile.skin = chip.id;
    this.saveProfile();
    setTxt(this.rosterNote, chip.kind === 'trail'
      ? 'Trail: ' + D.trail(chip.id).name
      : 'Head: ' + D.skin(chip.id).name);
    this.paintRoster();
  };

  PlayScene.prototype.primaryAction = function () {
    if (this.menuMode === 'title') { this.startRun(this.forcedRound || 1); return; }
    if (this.menuMode === 'pause') { this.hideMenu(); kit.resume('menu'); return; }
    if (this.menuMode === 'dead') { this.startRun(this.forcedRound || 1); return; }
  };
  PlayScene.prototype.secondaryAction = function () {
    if (this.menuMode === 'pause') { this.hideMenu(); kit.resume('menu'); this.showTitle(); return; }
    kit.openSettings([function (box) {
      function volumeRow(label, get, set) {
        var b = document.createElement('button');
        b.style.cssText = 'font:inherit;font-size:16px;color:#e8eef4;background:#1b2733;border:1px solid #2e3e4e;border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);';
        function paint() { b.textContent = label + ': ' + Math.round(get() * 100) + '%'; }
        b.addEventListener('click', function () {
          var next = Math.round((get() + 0.25) * 100) / 100;
          set(next > 1 ? 0 : next); paint();
        });
        paint(); box.appendChild(b);
      }
      volumeRow('Music volume', function () { return kit.audio.prefs.music; }, kit.audio.setMusicVolume);
      volumeRow('SFX volume', function () { return kit.audio.prefs.sfx; }, kit.audio.setSfxVolume);
    }]);
  };

  PlayScene.prototype.togglePause = function () {
    if (this.phase !== 'play') return;
    if (this.menuVisible && this.menuMode === 'pause') {
      this.hideMenu();
      kit.resume('menu');
    } else if (!this.menuVisible) {
      kit.pause('menu');
      this.showPauseMenu();
    }
  };

  PlayScene.prototype.onKitPause = function () {
    this.resetInputState();
    if (this.phase === 'play' && !this.menuVisible) this.showPauseMenu();
  };
  PlayScene.prototype.onKitResume = function () {
    this.resetInputState();
    if (this.menuVisible && this.menuMode === 'pause') this.hideMenu();
  };

  // =================================================================== menus
  PlayScene.prototype.showTitle = function () {
    this.phase = 'title';
    this.phaseT = 0;
    this.menuMode = 'title';
    var p = this.profile;
    setTxt(this.menuTitle, 'SERPENTINE');
    setTxt(this.menuSub, 'Portrait light-cycle survival. Swipe or steer, grab charge pips, outlive the hunters.');
    setTxt(this.menuStats, 'Best ' + p.best + '   Furthest round ' + p.bestRound +
      '   Pips ' + p.totalPips + '   Time ' + fmtTime(p.totalSurvival));
    setTxt(this.rosterLabelA, 'TRAIL');
    setTxt(this.rosterLabelB, 'HEAD');
    setTxt(this.rosterNote, 'Trail: ' + D.trail(p.trail).name + '   Head: ' + D.skin(p.skin).name);
    setTxt(this.btnText, 'START RUN');
    setTxt(this.btn2Text, 'SETTINGS');
    setTxt(this.menuHint, 'Space or tap to start  -  P pauses');
    this.paintRoster();
    this.showMenu(true);
  };

  PlayScene.prototype.showPauseMenu = function () {
    this.menuMode = 'pause';
    setTxt(this.menuTitle, 'PAUSED');
    setTxt(this.menuSub, this.arena ? this.arena.name + '  -  round ' + this.round : '');
    setTxt(this.menuStats, 'Score ' + Math.floor(this.score) + '   Length ' + this.snakes[0].count +
      '   Pips ' + this.roundPips);
    setTxt(this.btnText, 'RESUME');
    setTxt(this.btn2Text, 'QUIT TO TITLE');
    setTxt(this.menuHint, 'Escape or P resumes');
    this.showMenu(false);
  };

  PlayScene.prototype.showDeadMenu = function () {
    if (this.bannerVisible) return;
    this.menuMode = 'dead';
    var p = this.profile;
    setTxt(this.menuTitle, 'RUN OVER');
    setTxt(this.menuSub, 'Round ' + this.round + '  -  ' + this.arena.name + '  -  ' +
      D.medal(this.lastMedal || 'none').name);
    setTxt(this.menuStats, 'Score ' + Math.floor(this.score) + '   Best ' + p.best +
      '\nPips ' + this.runPips + '   Rounds cleared ' + this.roundsCleared +
      '   Survived ' + fmtTime(this.runSurvival));
    setTxt(this.rosterLabelA, 'TRAIL');
    setTxt(this.rosterLabelB, 'HEAD');
    setTxt(this.rosterNote, 'Trail: ' + D.trail(p.trail).name + '   Head: ' + D.skin(p.skin).name);
    setTxt(this.btnText, 'RUN AGAIN');
    setTxt(this.btn2Text, 'SETTINGS');
    setTxt(this.menuHint, 'Space or tap to run again');
    this.paintRoster();
    this.showMenu(true);
  };

  PlayScene.prototype.paintRoster = function () {
    var p = this.profile, i, chip, def;
    for (i = 0; i < this.trailChips.length; i++) {
      chip = this.trailChips[i];
      def = D.trail(chip.id);
      var un = !!p.unlocked[chip.id];
      var sel = p.trail === chip.id;
      setTintIf(chip.back, sel ? 0x1c5f78 : (un ? 0x11202f : 0x0c1520));
      setAlphaIf(chip.back, un ? 1 : 0.6);
      setTintIf(chip.swatch, un ? def.body[2] : 0x2a3947);
      setFill(chip.label, un ? (sel ? '#eafaff' : '#9fd8ee') : '#4d6072');
      setTxt(chip.label, un ? def.name : 'LOCKED');
    }
    for (i = 0; i < this.skinChips.length; i++) {
      chip = this.skinChips[i];
      def = D.skin(chip.id);
      var un2 = !!p.unlocked[chip.id];
      var sel2 = p.skin === chip.id;
      chip.swatch.setTexture(headTextureFor(chip.id));
      setTintIf(chip.back, sel2 ? 0x1c5f78 : (un2 ? 0x11202f : 0x0c1520));
      setAlphaIf(chip.back, un2 ? 1 : 0.6);
      setTintIf(chip.swatch, un2 ? 0xdff8ff : 0x2a3947);
      setFill(chip.label, un2 ? (sel2 ? '#eafaff' : '#9fd8ee') : '#4d6072');
      setTxt(chip.label, un2 ? def.name : 'LOCKED');
    }
  };

  PlayScene.prototype.showMenu = function (withRoster) {
    this.menuVisible = true;
    this.menuRoster = !!withRoster;
    setVis(this.dim, true);
    setVis(this.menuBack, true);
    setVis(this.btnBack, true);
    setVis(this.btn2Back, true);
    this.menuT = 0;
    this.layoutOverlay();
  };

  PlayScene.prototype.hideMenu = function () {
    this.menuVisible = false;
    setVis(this.dim, false);
    setVis(this.menuBack, false);
    setVis(this.btnBack, false);
    setVis(this.btn2Back, false);
    var i;
    for (i = 0; i < this.trailChips.length; i++) {
      setVis(this.trailChips[i].back, false);
      setVis(this.trailChips[i].swatch, false);
      setVis(this.trailChips[i].label, false);
    }
    for (i = 0; i < this.skinChips.length; i++) {
      setVis(this.skinChips[i].back, false);
      setVis(this.skinChips[i].swatch, false);
      setVis(this.skinChips[i].label, false);
    }
    setVis(this.menuTitle, false); setVis(this.menuSub, false);
    setVis(this.menuStats, false); setVis(this.menuHint, false);
    setVis(this.btnText, false); setVis(this.btn2Text, false);
    setVis(this.rosterLabelA, false); setVis(this.rosterLabelB, false);
    setVis(this.rosterNote, false);
  };

  // ================================================================= banner
  PlayScene.prototype.showBanner = function (title, sub, medal, hold) {
    setTxt(this.bannerTitle, title);
    setTxt(this.bannerSub, sub || '');
    this.bannerMedalId = medal || null;
    this.bannerVisible = true;
    this.bannerT = 0;
    this.bannerHold = hold || 2.0;
    // Boundary beats take over the single transient channel. Any in-play
    // chip content is already represented by score/meters or the result card.
    this.chipT = 0;
    this.chipQueue.length = 0;
    setVis(this.chipBack, false);
    setVis(this.chipText, false);
    this.impactT = 0;
    setVis(this.impactRing, false);
    setVis(this.impactText, false);
    setVis(this.damageVignette, false);
  };

  PlayScene.prototype.updateBanner = function (dt) {
    if (!this.bannerVisible) {
      setVis(this.bannerBack, false); setVis(this.bannerEdge, false);
      setVis(this.bannerTitle, false); setVis(this.bannerSub, false);
      setVis(this.bannerMedal, false); setVis(this.bannerMedalText, false);
      // next queued unlock beat, once the previous banner has cleared
      if (this.unlockQueue && this.unlockQueue.length) {
        var def = this.unlockQueue.shift();
        this.sfx('unlock', 0.7);
        this.showBanner('UNLOCKED', def.name + '  -  ' + (def.shape ? 'head skin' : 'trail'), null, 1.9);
      }
      return;
    }
    this.bannerT += dt;
    var inT = REDUCED ? 0.12 : 0.34;
    var outT = 0.26;
    var a, scaleX;
    if (this.bannerT < inT) {
      var u = this.bannerT / inT;
      // overshoot: back-out easing, hand rolled so it reads the same on every
      // engine version
      var c1 = 1.70158, c3 = c1 + 1;
      var e = 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
      a = Math.min(1, u * 2);
      scaleX = REDUCED ? 1 : e;
    } else if (this.bannerT < inT + this.bannerHold) {
      a = 1; scaleX = 1;
    } else if (this.bannerT < inT + this.bannerHold + outT) {
      var u2 = (this.bannerT - inT - this.bannerHold) / outT;
      a = 1 - u2; scaleX = 1 - u2 * 0.12;
    } else {
      this.bannerVisible = false;
      return;
    }

    var W = this.viewW;
    var bw = Math.min(W * 0.60, 460) * scaleX;
    var by = this.viewH * 0.30;
    setVis(this.bannerBack, true); setVis(this.bannerEdge, true);
    setVis(this.bannerTitle, true); setVis(this.bannerSub, true);
    panelSize(this.bannerBack, bw, 106);
    this.bannerBack.setAlpha(a * 0.94);
    this.bannerEdge.setDisplaySize(bw, 3);
    this.bannerEdge.setAlpha(a);
    setTintIf(this.bannerEdge, this.theme ? this.theme.accent : 0x55e7ff);
    this.bannerTitle.setAlpha(a);
    this.bannerSub.setAlpha(a * 0.9);
    this.bannerTitle.setScale(REDUCED ? 1 : (0.94 + 0.06 * Math.min(1, this.bannerT / inT)));

    if (this.bannerMedalId) {
      var m = D.medal(this.bannerMedalId);
      setVis(this.bannerMedal, true); setVis(this.bannerMedalText, true);
      this.bannerMedal.setPosition(W * 0.5, by - 62);
      this.bannerMedal.setDisplaySize(38 * (REDUCED ? 1 : scaleX), 38);
      this.bannerMedalText.setPosition(W * 0.5, by - 62);
      setTintIf(this.bannerMedal, m.color);
      this.bannerMedal.setAlpha(a);
      setTxt(this.bannerMedalText, m.name.charAt(0));
      this.bannerMedalText.setAlpha(a);
    } else {
      setVis(this.bannerMedal, false); setVis(this.bannerMedalText, false);
    }
  };

  // ================================================================== render
  PlayScene.prototype.renderSync = function (dt, jitter) {
    var i, s;
    var visualDt = jitter.frozen ? 0 : dt;
    // world jitter from the GGKit juice budget
    this.world.setPosition(this.boardX + jitter.dx, this.boardY + jitter.dy);

    // ---- body cells: only rebuilt on a step
    if (this.bodyDirty) {
      this.rebuildBodies();
      this.bodyDirty = false;
    }

    // ---- heads interpolate; tails scale out. 8 writes on a non-step frame.
    for (i = 0; i < MAX_SNAKES; i++) {
      s = this.snakes[i];
      var hs = this.headSprites[i], hg = this.headGlows[i];
      if (!s.alive && s.deathVisualT <= 0) { setVis(hs, false); setVis(hg, false); continue; }
      var t = clamp(s.stepT, 0, 1);
      var x = s.alive ? cellX(s.prevHeadC + (s.headC - s.prevHeadC) * t) : cellX(s.contactCell >= 0 ? s.contactCell % COLS : s.headC);
      var y = s.alive ? cellY(s.prevHeadR + (s.headR - s.prevHeadR) * t) : cellY(s.contactCell >= 0 ? Math.floor(s.contactCell / COLS) : s.headR);
      var skinId = i === 0 ? this.profile.skin : 'visor';
      var stateKey = s.alive ? (s.animState || 'idle') : 'damage';
      var desiredHeadTexture = headTextureForState(skinId, stateKey);
      if (hs.texture.key !== desiredHeadTexture) hs.setTexture(desiredHeadTexture);
      setVis(hs, true);
      hs.setPosition(x, y);
      var damageScale = s.alive ? 1 : 1.08 + (1 - clamp(s.deathVisualT / 0.42, 0, 1)) * 0.18;
      hs.setDisplaySize(CELL * 1.06 * damageScale, CELL * 1.06 * damageScale);
      hs.setRotation((s.dir - 1) * Math.PI * 0.5 + (s.alive ? 0 : 0.12));
      setTintIf(hs, s.boost > 0 ? 0xffffff : s.ramp.head);
      setVis(hg, true);
      hg.setPosition(x, y);
      var gp = REDUCED ? 2.4 : (2.4 + Math.sin(this.simTime * 8 + i * 1.7) * 0.18 + (s.boost > 0 ? 0.7 : 0));
      hg.setDisplaySize(CELL * gp, CELL * gp);
      setTintIf(hg, s.ramp.glow);
      hg.setAlpha(s.alive ? (s.boost > 0 ? 0.55 : 0.34) : 0.75);
      if (s.boost > 0 && !REDUCED && i === 0 && this.visualRng() < 0.6) {
        this.emJet.setParticleTint(s.ramp.glow);
        this.emJet.explode(1, x, y);
      }
    }

    // The first two tutorial beats have a reachable, animated demonstration
    // in the board, not just a sentence in the coach strip.
    var guideShown = false, player = this.snakes[0];
    if (this.phase === 'play' && !this.menuVisible && this.tutorialStep === 0 && player.alive) {
      var turnC = clamp(player.headC + DIRS[(player.dir + 1) % 4].x * 2, 1, COLS - 2);
      var turnR = clamp(player.headR + DIRS[(player.dir + 1) % 4].y * 2, 1, ROWS - 2);
      this.tutorialGuide.setPosition(cellX(turnC), cellY(turnR));
      this.tutorialGuide.setRotation(REDUCED ? 0 : this.simTime * 1.5);
      this.tutorialGuide.setDisplaySize(CELL * 1.15, CELL * 1.15);
      this.tutorialGuide.setAlpha(0.72 + (REDUCED ? 0 : Math.sin(this.simTime * 5) * 0.16));
      guideShown = true;
    } else if (this.phase === 'play' && !this.menuVisible && this.tutorialStep === 1 && player.alive) {
      for (i = 0; i < MAX_PIPS; i++) {
        if (!this.pips[i].live) continue;
        var gp = this.pips[i], gc = gp.cell % COLS, gr = Math.floor(gp.cell / COLS);
        this.tutorialGuide.setPosition(cellX(gc), cellY(gr));
        this.tutorialGuide.setRotation(REDUCED ? 0 : -this.simTime * 1.1);
        this.tutorialGuide.setDisplaySize(CELL * 1.45, CELL * 1.45);
        this.tutorialGuide.setAlpha(0.70 + (REDUCED ? 0 : Math.sin(this.simTime * 5) * 0.16));
        guideShown = true;
        break;
      }
    }
    setVis(this.tutorialGuide, guideShown);

    // ---- pips pulse
    for (i = 0; i < MAX_PIPS; i++) {
      var p = this.pips[i];
      var spr = this.pipPool[i];
      if (!p.live) { setVis(spr, false); continue; }
      var extra = p.kind === 'shield' ? 1.30 : 1.0;
      var psz = CELL * 0.66 * (1 + (REDUCED ? 0 : Math.sin(this.simTime * 5 + p.phase) * 0.10)) * extra;
      spr.setDisplaySize(psz, psz);
      spr.setRotation(REDUCED ? 0 : (this.simTime + p.phase) * (p.kind === 'shield' ? 0.4 : 0.7));
    }

    // ---- pads
    for (i = 0; i < this.padCount; i++) {
      var pd = this.padPool[i];
      var phase = pd.__phase || 0;
      var localPadPulse = 0.85 + (REDUCED ? 0.1 : Math.sin(this.simTime * 4 + phase) * 0.12) + this.padFlash * 0.5;
      pd.setDisplaySize(CELL * (0.86 + this.padFlash * 0.16), CELL * (0.86 + this.padFlash * 0.16));
      pd.setAlpha(clamp(localPadPulse, 0.25, 1));
    }

    // ---- gates
    for (i = 0; i < this.gateCount; i++) {
      var gs = this.gatePool[i];
      var group = this.gateGroups[String.fromCharCode(64 + gs.__code)];
      if (!group) { gs.setAlpha(0.9); setTintIf(gs, 0xff668e); continue; }
      group.flash = Math.max(0, group.flash - visualDt * 2.2);
      if (group.open) {
        var warn = group.warn;
        if (warn > 0) {
          // telegraph: amber, blinking faster as the slam approaches
          var blink = REDUCED ? 1 : (0.5 + 0.5 * Math.sin(this.simTime * (10 + warn * 34)));
          setTintIf(gs, mixColor(0xffc85c, 0xff5a5a, warn));
          gs.setAlpha(0.64 + 0.30 * warn * blink);
          gs.setDisplaySize(CELL * (0.86 + 0.14 * warn), CELL * (0.86 + 0.14 * warn));
        } else {
          setTintIf(gs, this.theme.accent);
          gs.setAlpha(0.72);
          gs.setDisplaySize(CELL * 0.86, CELL * 0.86);
        }
      } else {
        setTintIf(gs, mixColor(0xff8a3c, 0xffffff, group.flash));
        gs.setAlpha(0.95);
        gs.setDisplaySize(CELL * (1 + group.flash * 0.16), CELL * (1 + group.flash * 0.16));
      }
    }

    // ---- set-piece core
    if (this.coreCell >= 0) {
      var cp = 1 + this.corePulse * 0.35;
      this.corePlate.setDisplaySize(CELL * 2.6 * cp, CELL * 2.6 * cp);
      this.corePlate.setAlpha(0.35 + this.corePulse * 0.5);
      this.corePlate.setRotation(REDUCED ? 0 : this.simTime * 0.25);
      this.coreGlow.setAlpha(0.10 + this.corePulse * 0.35);
      this.coreGlow.setDisplaySize(CELL * 5 * cp, CELL * 5 * cp);
    }

    // ---- storm plates
    this.renderStorm();

    // ---- HUD
    this.renderImpact(visualDt);
    this.renderHud(visualDt);
    this.updateBanner(visualDt);
    this.renderMenu(dt);
  };

  PlayScene.prototype.rebuildBodies = function () {
    var used = 0, i, j, s;
    this.bodyOverflow = false;
    for (i = 0; i < MAX_SNAKES; i++) {
      s = this.snakes[i];
      if (!s.alive || s.count <= 0) continue;
      var n = s.count;
      // j starts at 1: cell 0 is the head, drawn by the interpolating head
      // sprite. Drawing both would park a static block a cell ahead of it.
      for (j = 1; j < n; j++) {
        if (used >= BODY_POOL) { this.bodyOverflow = true; break; }
        var cell = bodyCellAt(s, j);
        if (cell < 0) continue;
        var spr = this.bodyPool[used++];
        var f = n > 2 ? (j - 1) / (n - 2) : 0;   // 0 just behind the head, 1 at the tail
        spr.setPosition(cellX(cell % COLS), cellY(Math.floor(cell / COLS)));
        var sz = CELL * (0.98 - f * 0.26);
        spr.setDisplaySize(sz, sz);
        setTintIf(spr, ramp3(s.ramp.body, 1 - f));
        spr.setAlpha(0.95 - f * 0.35);
        setVis(spr, true);
      }
    }
    this.bodyUsed = used;
    for (i = used; i < BODY_POOL; i++) setVis(this.bodyPool[i], false);
  };

  PlayScene.prototype.renderStorm = function () {
    var inset = this.stormInset;
    var i;
    if (!inset && this.stormWarn <= 0) {
      for (i = 0; i < 4; i++) { setVis(this.stormPlates[i], false); setVis(this.warnPlates[i], false); }
      return;
    }
    var th = this.theme;
    // closed rings
    if (inset > 0) {
      var w = (inset + 1) * CELL;
      var bands = [
        [0, 0, BW, w],
        [0, BH - w, BW, w],
        [0, w, w, BH - w * 2],
        [BW - w, w, w, BH - w * 2]
      ];
      for (i = 0; i < 4; i++) {
        var sp = this.stormPlates[i];
        setVis(sp, true);
        sp.setPosition(bands[i][0], bands[i][1]);
        sp.setDisplaySize(bands[i][2], bands[i][3]);
        setTintIf(sp, th.storm);
        sp.setAlpha(0.42);
      }
    } else {
      for (i = 0; i < 4; i++) setVis(this.stormPlates[i], false);
    }
    // the warning band: the ring that is ABOUT to close
    if (this.stormWarn > 0 && this.roundInfo.shrink && inset < this.roundInfo.shrink.max) {
      var o = (inset + 1) * CELL;
      var t = CELL;
      var wb = [
        [o, o, BW - o * 2, t],
        [o, BH - o - t, BW - o * 2, t],
        [o, o + t, t, BH - o * 2 - t * 2],
        [BW - o - t, o + t, t, BH - o * 2 - t * 2]
      ];
      var pulseA = REDUCED ? 0.5 : (0.30 + 0.45 * Math.abs(Math.sin(this.simTime * (3 + this.stormWarn * 8))));
      for (i = 0; i < 4; i++) {
        var wp = this.warnPlates[i];
        setVis(wp, true);
        wp.setPosition(wb[i][0], wb[i][1]);
        wp.setDisplaySize(wb[i][2], wb[i][3]);
        setTintIf(wp, th.storm);
        wp.setAlpha(pulseA * this.stormWarn);
      }
    } else {
      for (i = 0; i < 4; i++) setVis(this.warnPlates[i], false);
    }
  };

  PlayScene.prototype.renderHud = function (dt) {
    var p = this.snakes[0];
    var showPlay = this.phase !== 'title';
    setVis(this.hudBack, true);
    // Branding is useful on menus, but it is a watermark during a run.
    setVis(this.hudBrandMark, false);
    setVis(this.hudBrand, false);
    setVis(this.hudRound, showPlay);
    setVis(this.hudArena, false);
    setVis(this.hudScore, showPlay);
    setVis(this.hudScoreLabel, false);
    setVis(this.hudBest, false);
    setVis(this.barBack, showPlay); setVis(this.barFill, showPlay);
    setVis(this.boostBack, showPlay); setVis(this.boostFill, showPlay);
    setVis(this.statLen, showPlay); setVis(this.statPips, showPlay);
    setVis(this.statShield, showPlay);
    setVis(this.barLabel, false);
    setVis(this.boostLabel, false);
    setVis(this.pauseBtn, showPlay && !this.menuVisible);
    setVis(this.pauseLabel, showPlay && !this.menuVisible);

    setTxt(this.hudScore, '#' + Math.floor(this.score));

    if (showPlay && this.arena) {
      setTxt(this.hudRound, 'R' + this.round);

      var frac = clamp(this.roundTime / this.roundInfo.par, 0, 1);
      var barW = this.barBack.displayWidth;
      this.barFill.setDisplaySize(Math.max(1, barW * frac), 5);
      setTintIf(this.barFill, this.stormWarn > 0 ? this.theme.storm : this.theme.accent);

      var bfrac = clamp(p.boost / BOOST_CAP, 0, 1);
      setVis(this.boostFill, bfrac > 0.001);
      setVis(this.boostBack, bfrac > 0.001);
      if (bfrac > 0.001) this.boostFill.setDisplaySize(Math.max(2, barW * bfrac), 3);
      setTintIf(this.boostFill, 0xffc85c);

      setTxt(this.statLen, '↔ ' + p.count);
      setTxt(this.statPips, '● ' + this.roundPips + '/' + this.roundInfo.pipGoal);
      setTxt(this.statShield, p.shield > 0 ? '◇ ' + p.shield : '');
    }

    // One thin tutorial line. It is readable for three seconds, then recedes
    // so the playfield stays visually dominant while the step remains active.
    var wantCoach = this.phase === 'play' && this.tutorialStep >= 0 && !this.menuVisible;
    if (wantCoach) this.coachT += dt;
    var target = wantCoach ? 1 : 0;
    this.coachAlpha += (target - this.coachAlpha) * Math.min(1, dt * 6);
    if (this.coachAlpha > 0.01) {
      var step = D.TUTORIAL[this.tutorialStep] || null;
      setVis(this.coachBack, true); setVis(this.coachText, true);
      var coachFade = wantCoach ? (this.coachT < 3 ? 1 : 0.10) : 0;
      this.coachBack.setAlpha(this.coachAlpha * 0.68 * coachFade);
      this.coachText.setAlpha(this.coachAlpha * coachFade);
      if (step) setTxt(this.coachText, step.text);
    } else {
      setVis(this.coachBack, false); setVis(this.coachText, false);
    }

    // Event chips use the same transient channel as the coach/banner: one at
    // a time, queued, edge-aligned, and held for no more than one second.
    this.pumpChip();
    if (this.chipT > 0 && !this.menuVisible && !this.bannerVisible && this.coachAlpha <= 0.05) {
      var ca = clamp(this.chipT / 0.4, 0, 1);
      setVis(this.chipBack, true); setVis(this.chipText, true);
      this.chipBack.setAlpha(ca * 0.85);
      this.chipText.setAlpha(ca);
      setTintIf(this.chipBack, this.chipColor || 0x11202f);
      setTxt(this.chipText, this.chipTextValue || '');
    } else {
      setVis(this.chipBack, false); setVis(this.chipText, false);
    }

    // Controls are taught on the title/pause cards; the bottom edge is a
    // thumb zone during play and carries no persistent instructional text.
    setVis(this.legend, false);
  };

  PlayScene.prototype.renderMenu = function () {
    var vis = this.menuVisible;
    setVis(this.menuTitle, vis); setVis(this.menuSub, vis);
    setVis(this.menuStats, vis); setVis(this.menuHint, vis);
    setVis(this.btnText, vis); setVis(this.btn2Text, vis);
    if (!vis) { setAlphaIf(this.dim, 0); return; }
    // The title card sits on the live attract board, so it dims rather than
    // erases it; the results card wants more separation than that.
    this.dim.setAlpha(this.menuMode === 'title' ? 0.55 : (this.menuMode === 'pause' ? 0.72 : 0.80));
    var roster = this.menuRoster;
    setVis(this.rosterLabelA, roster); setVis(this.rosterLabelB, roster);
    setVis(this.rosterNote, roster);
    var i;
    for (i = 0; i < this.trailChips.length; i++) {
      setVis(this.trailChips[i].back, roster);
      setVis(this.trailChips[i].swatch, roster);
      setVis(this.trailChips[i].label, roster);
    }
    for (i = 0; i < this.skinChips.length; i++) {
      setVis(this.skinChips[i].back, roster);
      setVis(this.skinChips[i].swatch, roster);
      setVis(this.skinChips[i].label, roster);
    }
  };

  // ================================================================== state
  PlayScene.prototype.syncState = function () {
    var p = this.snakes[0];
    STATE.phase = this.menuVisible ? this.menuMode : this.phase;
    STATE.round = this.round || this.forcedRound || 1;
    STATE.roundPar = this.roundInfo ? this.roundInfo.par : 0;
    STATE.arena = this.arena ? this.arena.id : STATE.arena;
    STATE.arenaName = this.arena ? this.arena.name : '';
    STATE.setPiece = this.arena ? this.arena.setPiece : '';
    STATE.score = Math.floor(this.score || 0);
    STATE.best = this.profile.best;
    STATE.length = p ? p.count : 0;
    STATE.pips = this.roundPips || 0;
    STATE.pipGoal = this.roundInfo ? this.roundInfo.pipGoal : 0;
    STATE.rivals = this.roundInfo ? this.roundInfo.rivals : 0;
    var alive = 0;
    for (var i = 1; i < MAX_SNAKES; i++) if (this.snakes[i].alive) alive++;
    STATE.rivalsAlive = alive;
    STATE.alive = !!(p && p.alive);
    STATE.survived = this.roundTime || 0;
    STATE.medal = this.roundInfo ? D.medalFor(this.roundInfo, this.roundTime || 0, this.roundPips || 0) : 'none';
    STATE.boost = p ? p.boost : 0;
    STATE.shield = p ? p.shield : 0;
    STATE.chain = this.chain || 0;
    STATE.stormInset = this.stormInset || 0;
    STATE.seed = this.seed || 0;
    STATE.trail = this.profile.trail;
    STATE.skin = this.profile.skin;
    STATE.paused = kit.paused;
    STATE.tutorial = this.tutorialStep >= 0 && D.TUTORIAL[this.tutorialStep]
      ? D.TUTORIAL[this.tutorialStep].id : null;
  };

  // =================================================================== loop
  PlayScene.prototype.update = function (time, delta) {
    var dtMs = Math.min(delta, 100);
    var dt = dtMs / 1000;
    this.uiTime += dt;

    var jitter = kit.juice.frame();

    this.pollInput();

    if (this.phase === 'play' && !kit.paused && !this.menuVisible) {
      this.acc += dt;
      // Clamp, never drain. A stalled or throttled device gets slow motion,
      // never a jump the player did not see coming. Hit-stop freezes only
      // presentation, so the authoritative simulation continues stepping.
      var cap = SIM_STEP * MAX_STEPS;
      if (this.acc > cap) this.acc = cap;
      var steps = 0;
      while (this.acc >= SIM_STEP && steps < MAX_STEPS) {
        this.simStep(SIM_STEP);
        this.acc -= SIM_STEP;
        steps++;
        if (this.phase !== 'play') break;
      }
    } else if (this.phase === 'clear' && !kit.paused && !this.menuVisible) {
      this.phaseT += dt;
      if (this.phaseT > 2.6 && !this.bannerVisible &&
          !(this.unlockQueue && this.unlockQueue.length)) this.startRound(this.round + 1);
    } else if (this.phase === 'dead') {
      this.phaseT += dt;
      for (var d = 0; d < MAX_SNAKES; d++) {
        if (this.snakes[d].deathVisualT > 0) this.snakes[d].deathVisualT = Math.max(0, this.snakes[d].deathVisualT - dt);
      }
    }

    this.renderSync(dt, jitter);
    this.syncState();
  };

  // ================================================================== boot
  function boot() {
    var game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: document.body,
      backgroundColor: '#04070f',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER,
        width: window.innerWidth,
        height: window.innerHeight
      },
      render: { antialias: true, powerPreference: 'high-performance' },
      fps: { target: 60, min: 20 },
      scene: [BootScene, PlayScene],
      banner: false,
      audio: { noAudio: true }   // GGKit owns audio; Phaser must not open a 2nd context
    });
    window.__sp.game = game;
  }
  boot();
}());
