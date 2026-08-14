/* game.js — Tubeshock, AAA rebuild (fleet F4).
 *
 * Portrait tube shooter. The claw rides the rim of a procedural tube, auto
 * fires down the lanes, and banks a SURGE charge that clears the rim in one
 * shockwave. Depth Runs chain seeded tube segments into a descent, Score
 * Attack is the sprint, and Core Breach ends on a multi phase guardian.
 *
 * Engine: Phaser 3.87 from /play/_shared/. GGKit is the sole lifecycle,
 * input, save and audio implementation. Every texture and every audio cue in
 * this title is generated procedurally at boot: no asset file ships except
 * the PWA icons, which are drawn offline from primitives.
 *
 * Defect classes explicitly handled (all shipped broken somewhere once):
 *  - debug views are preallocated records, never a live pool alias
 *  - per entity render state lives on the view record, never on the sim record
 *  - DOM control handlers seed kit.input.pointers at claim time
 *  - one camera, never a split (nothing here needs a second camera)
 *  - Phaser plain config scenes are promoted to real Scene subclasses
 *  - test switches are readable from the boot fallback AND the live scene
 *  - no clock advances past the stepped sim: a slow device gets slow motion
 *  - every keyed lookup goes through a guarded accessor in ts_data.js
 *  - coach copy is a thin fading strip at the top, never over the play area
 *  - sw.js precaches only files that exist
 */
(function () {
  'use strict';

  var D = window.TSData;
  var PAL = D.PAL;
  var TAU = Math.PI * 2;

  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  var SAVE_VERSION = 1;

  // Pool ceilings. Nothing in the sim allocates after boot.
  var MAX_ENEMIES = 72;
  var MAX_BULLETS = 56;
  var MAX_PICKUPS = 14;
  var MAX_TELEGRAPHS = 14;
  var MAX_BLOCKERS = 8;
  var MAX_DUST = 48;

  var LOCK_ARC = 0.34;        // radians, half width of the target lock cone
  var AIM_ASSIST = 0.62;      // how much of the lock offset a shot inherits
  var CLAW_T = 1.0;           // the rim
  var BREACH_T = 1.035;       // past this an enemy is through
  var INVULN = 1.25;          // seconds after a hit

  // ------------------------------------------------------------- helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function angWrap(a) { a = a % TAU; return a < 0 ? a + TAU : a; }
  function angDiff(a, b) {
    var d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }
  function pad(n, w) {
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < w) s = '0' + s;
    return s;
  }
  function commas(n) {
    var s = String(Math.max(0, Math.round(n)));
    var out = '', c = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      out = s.charAt(i) + out;
      if (++c % 3 === 0 && i > 0) out = ',' + out;
    }
    return out;
  }
  function setTextIfChanged(t, s) { if (t && t.text !== s) t.setText(s); }
  // Shrink a text object until it fits a pixel width. Used wherever a plate
  // has a fixed width and the copy does not.
  function fitText(t, maxW, base, min) {
    if (!t) return;
    t.setFontSize(base);
    if (t.width <= maxW) return;
    t.setFontSize(Math.max(min, Math.floor(base * maxW / Math.max(1, t.width))));
  }
  // pad() is decimal-only (it floors its input), so hex strings get their own
  // zero fill here. A '#000NaNbb' colour string once crashed boot.
  function hex(n) {
    var s = Math.max(0, n | 0).toString(16);
    while (s.length < 6) s = '0' + s;
    return '#' + s;
  }

  // Deterministic PRNG so a seeded segment replays identically.
  function makeRng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  var FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  function label(scene, x, y, text, size, color, weight) {
    return scene.add.text(x, y, text, {
      fontFamily: FONT,
      fontSize: Math.round(size) + 'px',
      color: color || PAL.text,
      fontStyle: weight || 'normal'
    });
  }

  // Real safe area insets, measured once from a probe element.
  function readInsets() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
      'env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;';
    document.body.appendChild(probe);
    var cs = getComputedStyle(probe);
    var out = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0
    };
    probe.remove();
    return out;
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  // ==================================================== verification hook
  // ONE object. The boot fallback below and the live PlayScene both read and
  // write this exact instance, so a switch flipped before Phaser finishes
  // booting is still honoured by the scene, and a switch flipped mid run is
  // picked up on the next sim step.
  var TS_STATE = {
    ready: false,
    mode: 'boot',            // boot | menu | run | sprint | over
    phase: 'boot',           // intro | play | transit | boss | lost | won
    score: 0,
    level: 1,                // 1 based segment number inside the run
    lives: 3,
    surgeCharge: 0,          // 0..100
    surgeReady: false,
    runKey: '',
    runName: '',
    tubeFamily: '',
    tubeFamilyName: '',
    segment: 0,
    segments: 0,
    tier: 0,
    depth: 0,                // metres descended this run
    shots: 0,
    hits: 0,
    accuracy: 0,
    enemiesAlive: 0,
    hazard: '',
    hazardPhase: '',
    shields: 0,
    multiplier: 1,
    boss: { active: false, phase: 0, plates: 0, coreHp: 0, maxCoreHp: 0 },
    tutorialStep: -1,
    medals: {},
    unlockedRuns: 1,
    bestSprint: 0,
    livePickups: [],
    poolOverflows: { enemies: 0, bullets: 0, pickups: 0, telegraphs: 0, popups: 0 },
    // ---- test switches (orchestrator writes these) ----
    forceLevel: -1,          // 0 based segment index to jump to
    forceTubeFamily: '',     // family key override for the live segment
    forceBoss: false,        // jump straight to the guardian
    forceGenerousDrops: false,
    forceSurgeFull: false,
    forceHazard: '',         // hazard key to arm immediately
    forceInvincible: false
  };
  // Preallocated debug records. These are refreshed from the pickup pool
  // every frame and are never the pool itself, so a harness reading the view
  // cannot truncate or mutate a live pool.
  for (var lp = 0; lp < MAX_PICKUPS; lp++) {
    TS_STATE.livePickups.push({ active: false, kind: '', angle: 0, depth: 0, ttl: 0 });
  }
  window.__ts = { state: TS_STATE };

  // ============================================================ save file
  function defaultSave() {
    return {
      v: SAVE_VERSION,
      medals: {},            // runKey -> medal name
      best: {},              // runKey -> best rating
      bestScore: {},         // runKey -> best score
      unlocked: 1,           // how many depth runs are open
      sprintBest: 0,
      tutorialDone: false,
      flash: !prefersReducedMotion()
    };
  }
  function validSaveMap(o, kind) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    for (var k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      if (kind === 'medal') {
        if (D.MEDAL.order.indexOf(o[k]) < 0) return false;
      } else if (typeof o[k] !== 'number' || !isFinite(o[k]) || o[k] < 0) {
        return false;
      }
    }
    return true;
  }
  function validateSave(o) {
    return !!o && typeof o === 'object' && !Array.isArray(o) &&
      o.v === SAVE_VERSION && Number.isInteger(o.unlocked) &&
      o.unlocked >= 1 && o.unlocked <= D.RUNS.length &&
      validSaveMap(o.medals, 'medal') && validSaveMap(o.best, 'number') &&
      validSaveMap(o.bestScore, 'number') &&
      typeof o.sprintBest === 'number' && isFinite(o.sprintBest) && o.sprintBest >= 0 &&
      typeof o.tutorialDone === 'boolean' && typeof o.flash === 'boolean';
  }

  // =============================================================== GGKit
  var Game = { phaser: null, play: null, title: null, insets: readInsets() };

  var kit = GGKit.create({
    slug: 'tubeshock',
    orientation: 'portrait',
    validateSave: validateSave,
    onPause: function () {
      var s = Game.play;
      if (s && s.scene.isActive()) s.scene.pause();
      Dom.setControlsVisible(false);
    },
    onResume: function () {
      var s = Game.play;
      if (s && s.scene.isPaused()) s.scene.resume();
      Dom.setControlsVisible(!!(s && s.scene.isActive() && s.phase !== 'lost' && s.phase !== 'won'));
    },
    onRestart: function () {
      var s = Game.play;
      if (s) s.scene.restart(s.launch);
    }
  });

  var profile = kit.save.get(null);
  if (!validateSave(profile)) profile = defaultSave();
  function persist() { kit.save.set(profile); }
  // First boot on a reduced motion device starts with the house motion
  // budget already dialled down. The player can put it back in Settings.
  if (prefersReducedMotion() && kit.juice.enabled && !profile.tutorialDone) {
    kit.juice.enabled = false;
  }
  syncProfileDebug();
  function syncProfileDebug() {
    TS_STATE.unlockedRuns = profile.unlocked;
    TS_STATE.bestSprint = profile.sprintBest;
    var m = TS_STATE.medals;
    for (var k in m) delete m[k];
    for (var r = 0; r < D.RUNS.length; r++) {
      var key = D.RUNS[r].key;
      m[key] = profile.medals[key] || 'none';
    }
  }

  // Accessibility routing. One switch pair covers shake, hit stop, flash
  // plate, bloom strength and particle counts, so the toggle really covers
  // everything the player sees.
  function motionOn() { return kit.juice.enabled !== false; }
  function flashOn() { return motionOn() && profile.flash !== false; }
  function fxCount(n) { return Math.max(1, Math.round(n * (motionOn() ? 1 : 0.3))); }

  function openSettings() {
    var box = kit.openSettings([function (parent, row) {
      row('Flash effects', function () { return profile.flash !== false; }, function (v) {
        profile.flash = !!v; persist();
      });
    }]);
    skinOverlay(box, 'SETTINGS');
    return box;
  }

  // GGKit owns the loader and the settings shell; the title only restyles the
  // DOM they produce so no screen ships in the kit's default utility grey.
  function skinOverlay(box, title) {
    if (!box) return box;
    box.style.background = 'radial-gradient(120% 80% at 50% 14%, #0d2a44 0%, #071733 48%, #04070f 100%)';
    box.style.color = '#e9feff';
    box.style.fontFamily = FONT;
    var kids = box.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.tagName === 'BUTTON') {
        el.style.fontFamily = FONT;
        el.style.letterSpacing = '.12em';
        el.style.borderRadius = '12px';
        if (el.style.background.indexOf('rgb(57, 211, 83)') >= 0 || el.style.background === '#39d353') {
          el.style.background = 'linear-gradient(150deg,#7cf4ff,#3aa8d8)';
          el.style.color = '#04121c';
        } else {
          el.style.background = 'rgba(11,32,50,.86)';
          el.style.border = '1px solid rgba(124,244,255,.42)';
          el.style.color = '#dff7ff';
        }
      } else if (i === 0 && title) {
        el.textContent = title;
        el.style.letterSpacing = '.24em';
      }
    }
    return box;
  }

  // ======================================================= audio synthesis
  // Everything is generated into 16 bit PCM WAV blobs at boot and handed to
  // the GGKit audio buses. No audio file is fetched, and no ogg exists.
  var RATE = 22050;

  function toWav(f32) {
    var n = f32.length;
    var buf = new ArrayBuffer(44 + n * 2);
    var v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, RATE, true);
    v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) {
      var s = clamp(f32[i], -1, 1);
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  function render(seconds, fn) {
    var n = Math.max(1, Math.floor(seconds * RATE));
    var out = new Float32Array(n);
    var rng = makeRng(0x51f17a);
    for (var i = 0; i < n; i++) out[i] = fn(i / RATE, i / n, rng) || 0;
    // 4 ms edges so nothing clicks
    var e = Math.min(Math.floor(RATE * 0.004), Math.floor(n / 2));
    for (var j = 0; j < e; j++) { out[j] *= j / e; out[n - 1 - j] *= j / e; }
    return out;
  }
  function sine(t, f) { return Math.sin(TAU * f * t); }
  function sawv(t, f) { var x = (t * f) % 1; return x * 2 - 1; }
  function sqv(t, f) { return ((t * f) % 1) < 0.5 ? 1 : -1; }
  function env(x, a, d) { return x < a ? x / a : Math.max(0, 1 - (x - a) / d); }

  function buildAudio() {
    var A = {};
    A.sfx_fire = toWav(render(0.055, function (t, u) {
      var f = 700 - 300 * u;
      return (sqv(t, f) * 0.30 + sine(t, f * 2) * 0.14) * Math.pow(1 - u, 2.4);
    }));
    A.sfx_lock = toWav(render(0.09, function (t, u) {
      return (sine(t, 1180) * 0.20 + sine(t, 1760) * 0.10) * Math.pow(1 - u, 3);
    }));
    A.sfx_hit = toWav(render(0.07, function (t, u, r) {
      return ((r() * 2 - 1) * 0.32 + sine(t, 520 - 200 * u) * 0.2) * Math.pow(1 - u, 2.6);
    }));
    A.sfx_kill = toWav(render(0.16, function (t, u, r) {
      var f = 520 - 340 * u;
      return (sine(t, f) * 0.32 + sawv(t, f * 1.5) * 0.13 + (r() * 2 - 1) * 0.10) * Math.pow(1 - u, 2.0);
    }));
    A.sfx_killbig = toWav(render(0.34, function (t, u, r) {
      var f = 300 - 240 * u;
      return (sine(t, f) * 0.36 + sawv(t, f * 0.5) * 0.18 + (r() * 2 - 1) * 0.20 * (1 - u)) *
        Math.pow(1 - u, 1.5);
    }));
    A.sfx_shield = toWav(render(0.30, function (t, u) {
      return (sine(t, 880 + 320 * u) * 0.20 + sine(t, 1320) * 0.10) * Math.pow(1 - u, 1.6);
    }));
    A.sfx_pickup = toWav(render(0.30, function (t, u) {
      var step = Math.floor(u * 3);
      var f = [660, 880, 1320][step];
      var lu = (u * 3) % 1;
      return (sine(t, f) * 0.26 + sine(t, f * 2) * 0.08) * Math.pow(1 - lu, 1.7);
    }));
    A.sfx_life = toWav(render(0.55, function (t, u) {
      return (sine(t, 523) * 0.18 + sine(t, 784) * 0.14 + sine(t, 1046) * 0.10) *
        Math.pow(1 - u, 1.3);
    }));
    A.sfx_surge_ready = toWav(render(0.42, function (t, u) {
      return (sine(t, 440 + 660 * u) * 0.22 + sine(t, 880 + 880 * u) * 0.10) * Math.pow(1 - u, 1.2);
    }));
    A.sfx_surge_charge = toWav(render(0.60, function (t, u) {
      return (sawv(t, 120 + 520 * u * u) * 0.16 + sine(t, 60 + 200 * u) * 0.18) *
        Math.min(1, u * 4) * Math.pow(1 - u, 0.6);
    }));
    A.sfx_surge_fire = toWav(render(0.85, function (t, u, r) {
      var noise = (r() * 2 - 1) * 0.34 * Math.pow(1 - u, 1.1);
      var low = sine(t, 150 - 110 * u) * 0.40 * Math.pow(1 - u, 0.9);
      var ring = sine(t, 1400 * (1 - u) + 180) * 0.14 * Math.pow(1 - u, 2.0);
      return noise + low + ring;
    }));
    A.sfx_breach = toWav(render(0.62, function (t, u, r) {
      return (sine(t, 130 - 80 * u) * 0.42 + sawv(t, 65 - 30 * u) * 0.18 +
        (r() * 2 - 1) * 0.16 * (1 - u)) * Math.pow(1 - u, 1.1);
    }));
    A.sfx_warn = toWav(render(0.46, function (t, u) {
      var beat = u < 0.45 ? u / 0.45 : (u - 0.55) / 0.45;
      if (u >= 0.45 && u < 0.55) return 0;
      return sine(t, 760) * 0.22 * Math.pow(1 - clamp(beat, 0, 1), 1.5);
    }));
    A.sfx_transit = toWav(render(1.05, function (t, u, r) {
      var sweep = sine(t, 90 + 900 * u * u) * 0.20;
      var air = (r() * 2 - 1) * 0.16 * Math.sin(Math.PI * u);
      return (sweep + air) * Math.pow(Math.sin(Math.PI * u), 0.7);
    }));
    A.sfx_medal = toWav(render(1.10, function (t, u) {
      var notes = [523, 659, 784, 1046];
      var step = Math.min(3, Math.floor(u * 4.4));
      var lu = clamp(u * 4.4 - step, 0, 1);
      return (sine(t, notes[step]) * 0.22 + sine(t, notes[step] * 2) * 0.07) *
        Math.pow(1 - lu, 1.1);
    }));
    A.sfx_boss = toWav(render(0.90, function (t, u, r) {
      return (sawv(t, 55) * 0.24 + sine(t, 110) * 0.22 + (r() * 2 - 1) * 0.10 * (1 - u)) *
        Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 1.1);
    }));
    A.sfx_ui = toWav(render(0.05, function (t, u) {
      return sqv(t, 1400) * 0.14 * Math.pow(1 - u, 3);
    }));
    A.sfx_over = toWav(render(1.20, function (t, u) {
      var f = 330 * Math.pow(0.35, u);
      return (sine(t, f) * 0.26 + sawv(t, f * 0.5) * 0.10) * Math.pow(1 - u, 0.9);
    }));

    // Music beds. Eight second loops, tempo divides evenly so the seam is
    // inaudible under the crossfade.
    A.mus_tube = toWav(render(8.0, function (t, u, r) {
      var drone = sine(t, 55) * 0.16 + sine(t, 82.5) * 0.10 + sine(t, 110) * 0.07;
      var breath = 0.5 + 0.5 * Math.sin(TAU * t / 4);
      var shimmer = sine(t, 440 + 8 * Math.sin(TAU * t / 3)) * 0.030 * breath;
      var tick = ((t * 2) % 1) < 0.03 ? (r() * 2 - 1) * 0.05 : 0;
      return (drone * (0.75 + 0.25 * breath) + shimmer + tick) * 0.9;
    }));
    A.mus_drive = toWav(render(8.0, function (t, u, r) {
      var beat = (t * 4) % 1;
      var kick = sine(t, 90 * Math.pow(0.4, beat)) * 0.30 * Math.pow(1 - beat, 3);
      var arpN = [220, 277, 330, 415, 330, 277];
      var ai = Math.floor(t * 8) % arpN.length;
      var au = (t * 8) % 1;
      var arp = sqv(t, arpN[ai]) * 0.075 * Math.pow(1 - au, 2.0);
      var bass = sawv(t, 55) * 0.14;
      var hat = ((t * 8) % 1) < 0.05 ? (r() * 2 - 1) * 0.045 : 0;
      return kick + arp + bass + hat;
    }));
    A.mus_core = toWav(render(8.0, function (t, u, r) {
      var beat = (t * 2) % 1;
      var hit = (sine(t, 62 * Math.pow(0.5, beat)) * 0.34 + (r() * 2 - 1) * 0.06) *
        Math.pow(1 - beat, 2.2);
      var brass = (sawv(t, 110) * 0.10 + sawv(t, 164.8) * 0.07) *
        (0.6 + 0.4 * Math.sin(TAU * t / 2));
      var siren = sine(t, 600 + 180 * Math.sin(TAU * t / 1.6)) * 0.030;
      return hit + brass + siren;
    }));
    return A;
  }

  // ====================================================== texture forge
  // Every sprite in the game is drawn here with the 2D context into a Phaser
  // canvas texture. Supersampled 2x then relied on LINEAR filtering, so the
  // neon edges stay soft at any device pixel ratio.
  function forge(scene, key, w, h, draw) {
    if (scene.textures.exists(key)) return;
    var tex = scene.textures.createCanvas(key, w, h);
    if (!tex) return;
    var ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    tex.refresh();
  }

  function glowStroke(ctx, color, blur, width) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  function buildTextures(scene) {
    // ---- particles and soft shapes
    forge(scene, 'p_dot', 32, 32, function (c, w) {
      var g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    forge(scene, 'p_spark', 24, 8, function (c, w, h) {
      var g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.45, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, h * 0.25, w, h * 0.5);
    });
    forge(scene, 'p_shard', 18, 18, function (c, w) {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(w / 2, 0); c.lineTo(w * 0.82, w / 2);
      c.lineTo(w / 2, w); c.lineTo(w * 0.18, w / 2);
      c.closePath(); c.fill();
    });
    forge(scene, 'p_smoke', 40, 40, function (c, w) {
      var g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,.55)');
      g.addColorStop(0.6, 'rgba(255,255,255,.18)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    forge(scene, 'p_ring', 128, 128, function (c, w) {
      var r = w / 2 - 4;
      glowStroke(c, 'rgba(255,255,255,.95)', 12, 5);
      c.beginPath(); c.arc(w / 2, w / 2, r, 0, TAU); c.stroke();
      glowStroke(c, 'rgba(255,255,255,.45)', 20, 12);
      c.beginPath(); c.arc(w / 2, w / 2, r - 8, 0, TAU); c.stroke();
    });

    // ---- claw, three animation states
    function claw(state) {
      return function (c, w, h) {
        var cx = w / 2;
        var open = state === 'fire' ? 1.28 : state === 'charge' ? 0.78 : 1.0;
        // rear glow
        var g = c.createRadialGradient(cx, h * 0.55, 2, cx, h * 0.55, w * 0.46);
        g.addColorStop(0, state === 'charge' ? 'rgba(255,184,74,.85)' : 'rgba(124,244,255,.75)');
        g.addColorStop(1, 'rgba(124,244,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        // hull
        glowStroke(c, state === 'charge' ? '#ffd79a' : '#bff8ff', 14, 3);
        c.fillStyle = state === 'fire' ? '#ffffff' : '#e2feff';
        c.beginPath();
        c.moveTo(cx, h * 0.06);
        c.lineTo(cx + w * 0.24, h * 0.66);
        c.lineTo(cx, h * 0.52);
        c.lineTo(cx - w * 0.24, h * 0.66);
        c.closePath(); c.fill(); c.stroke();
        // prongs
        glowStroke(c, state === 'charge' ? '#ffb84a' : '#7cf4ff', 12, 3.2);
        c.beginPath();
        c.moveTo(cx - w * 0.24, h * 0.66);
        c.lineTo(cx - w * 0.44 * open, h * 0.30);
        c.moveTo(cx + w * 0.24, h * 0.66);
        c.lineTo(cx + w * 0.44 * open, h * 0.30);
        c.stroke();
        // muzzle
        c.shadowBlur = 18;
        c.shadowColor = state === 'fire' ? '#ffffff' : '#7cf4ff';
        c.fillStyle = state === 'fire' ? '#ffffff' : 'rgba(191,248,255,.85)';
        c.beginPath();
        c.arc(cx, h * 0.16, state === 'fire' ? w * 0.11 : w * 0.055, 0, TAU);
        c.fill();
        // tail vents
        c.shadowBlur = 8;
        c.fillStyle = 'rgba(124,244,255,.55)';
        c.fillRect(cx - w * 0.12, h * 0.68, w * 0.08, h * 0.16);
        c.fillRect(cx + w * 0.04, h * 0.68, w * 0.08, h * 0.16);
      };
    }
    forge(scene, 'claw_idle', 64, 78, claw('idle'));
    forge(scene, 'claw_charge', 64, 78, claw('charge'));
    forge(scene, 'claw_fire', 64, 78, claw('fire'));

    forge(scene, 'bullet', 14, 34, function (c, w, h) {
      var g = c.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, 'rgba(124,244,255,0)');
      g.addColorStop(0.5, 'rgba(191,250,255,.9)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(w / 2, 0); c.lineTo(w * 0.88, h * 0.72);
      c.lineTo(w / 2, h); c.lineTo(w * 0.12, h * 0.72);
      c.closePath(); c.fill();
    });

    forge(scene, 'reticle', 72, 72, function (c, w) {
      var r = w / 2 - 6;
      glowStroke(c, 'rgba(255,211,110,.95)', 10, 2.4);
      for (var q = 0; q < 4; q++) {
        var a0 = q * Math.PI / 2 + 0.30;
        c.beginPath(); c.arc(w / 2, w / 2, r, a0, a0 + 0.65); c.stroke();
      }
      glowStroke(c, 'rgba(255,255,255,.8)', 6, 1.6);
      c.beginPath();
      c.moveTo(w / 2 - r * 0.28, w / 2); c.lineTo(w / 2 + r * 0.28, w / 2);
      c.moveTo(w / 2, w / 2 - r * 0.28); c.lineTo(w / 2, w / 2 + r * 0.28);
      c.stroke();
    });

    // ---- pickups
    function pu(glyph, col) {
      return function (c, w) {
        var g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        g.addColorStop(0, col + 'cc');
        g.addColorStop(0.55, col + '55');
        g.addColorStop(1, col + '00');
        c.fillStyle = g; c.fillRect(0, 0, w, w);
        glowStroke(c, col, 12, 2.6);
        c.beginPath(); c.arc(w / 2, w / 2, w * 0.31, 0, TAU); c.stroke();
        c.fillStyle = '#ffffff'; c.shadowColor = col; c.shadowBlur = 12;
        var s = w * 0.16;
        c.beginPath();
        if (glyph === 'surge') {
          c.moveTo(w / 2 + s * 0.2, w / 2 - s * 1.2);
          c.lineTo(w / 2 - s * 0.9, w / 2 + s * 0.1);
          c.lineTo(w / 2 - s * 0.1, w / 2 + s * 0.1);
          c.lineTo(w / 2 - s * 0.2, w / 2 + s * 1.3);
          c.lineTo(w / 2 + s * 0.9, w / 2 - s * 0.2);
          c.lineTo(w / 2 + s * 0.1, w / 2 - s * 0.2);
          c.closePath(); c.fill();
        } else if (glyph === 'mult') {
          c.lineWidth = 3; c.strokeStyle = '#ffffff';
          c.moveTo(w / 2 - s, w / 2 - s); c.lineTo(w / 2 + s, w / 2 + s);
          c.moveTo(w / 2 + s, w / 2 - s); c.lineTo(w / 2 - s, w / 2 + s);
          c.stroke();
        } else if (glyph === 'shield') {
          c.moveTo(w / 2, w / 2 - s * 1.2);
          c.lineTo(w / 2 + s, w / 2 - s * 0.4);
          c.lineTo(w / 2, w / 2 + s * 1.3);
          c.lineTo(w / 2 - s, w / 2 - s * 0.4);
          c.closePath(); c.fill();
        } else {
          c.moveTo(w / 2, w / 2 + s * 1.1);
          c.bezierCurveTo(w / 2 - s * 1.7, w / 2 - s * 0.3, w / 2 - s * 0.5, w / 2 - s * 1.4, w / 2, w / 2 - s * 0.4);
          c.bezierCurveTo(w / 2 + s * 0.5, w / 2 - s * 1.4, w / 2 + s * 1.7, w / 2 - s * 0.3, w / 2, w / 2 + s * 1.1);
          c.fill();
        }
      };
    }
    forge(scene, 'pu_surge', 44, 44, pu('surge', '#ffb84a'));
    forge(scene, 'pu_mult', 44, 44, pu('mult', '#ffd36e'));
    forge(scene, 'pu_shield', 44, 44, pu('shield', '#7cf4ff'));
    forge(scene, 'pu_life', 44, 44, pu('life', '#ff8fa8'));

    // ---- enemies, one silhouette set per family and state
    // Silhouettes stay constant per archetype so the read is learnable, and
    // the family restyles the fill, the trim and the extra furniture so a
    // crawler in the gear works is never mistaken for one in the bio tube.
    for (var f = 0; f < D.FAMILIES.length; f++) {
      var fam = D.FAMILIES[f];
      for (var e = 0; e < D.ENEMIES.length; e++) {
        forgeEnemy(scene, fam, D.ENEMIES[e], 'idle');
        forgeEnemy(scene, fam, D.ENEMIES[e], 'telegraph');
        forgeEnemy(scene, fam, D.ENEMIES[e], 'hurt');
        forgeEnemy(scene, fam, D.ENEMIES[e], 'death');
      }
    }

    // ---- boss parts
    forge(scene, 'boss_plate', 96, 64, function (c, w, h) {
      glowStroke(c, '#ffd36e', 16, 3);
      c.fillStyle = 'rgba(60,34,12,.92)';
      c.beginPath();
      c.moveTo(w * 0.08, h * 0.5); c.lineTo(w * 0.26, h * 0.10);
      c.lineTo(w * 0.74, h * 0.10); c.lineTo(w * 0.92, h * 0.5);
      c.lineTo(w * 0.74, h * 0.90); c.lineTo(w * 0.26, h * 0.90);
      c.closePath(); c.fill(); c.stroke();
      glowStroke(c, 'rgba(255,246,214,.75)', 8, 2);
      c.beginPath();
      c.moveTo(w * 0.28, h * 0.5); c.lineTo(w * 0.72, h * 0.5);
      c.moveTo(w * 0.40, h * 0.26); c.lineTo(w * 0.40, h * 0.74);
      c.moveTo(w * 0.60, h * 0.26); c.lineTo(w * 0.60, h * 0.74);
      c.stroke();
    });
    forge(scene, 'boss_core', 160, 160, function (c, w) {
      var g = c.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,.95)');
      g.addColorStop(0.28, 'rgba(255,150,90,.85)');
      g.addColorStop(0.62, 'rgba(200,60,120,.45)');
      g.addColorStop(1, 'rgba(120,20,90,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
      glowStroke(c, 'rgba(255,220,160,.9)', 18, 3);
      for (var i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(w / 2, w / 2, w * (0.20 + i * 0.09), w * (0.34 - i * 0.06), i * 0.7, 0, TAU);
        c.stroke();
      }
    });

    // ---- family background plates, 8x256 vertical ramps
    for (var b = 0; b < D.FAMILIES.length; b++) {
      (function (famb) {
        forge(scene, 'bg_' + famb.key, 8, 256, function (c, w, h) {
          var g = c.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, hex(famb.pal.bgTop));
          g.addColorStop(0.55, hex(famb.pal.bgBot));
          g.addColorStop(1, hex(PAL.ink));
          c.fillStyle = g; c.fillRect(0, 0, w, h);
        });
      }(D.FAMILIES[b]));
    }
  }

  function forgeEnemy(scene, fam, arch, state) {
    var key = 'en_' + fam.key + '_' + arch.key + '_' + state;
    var tint = hex(fam.pal[arch.tint] || fam.pal.enemy);
    var trim = hex(fam.pal.rim);
    var size = 72;
    forge(scene, key, size, size, function (c, w) {
      var cx = w / 2, cy = w / 2, R = w * 0.36;
      c.save();
      // family furniture behind the silhouette
      var g = c.createRadialGradient(cx, cy, 1, cx, cy, R * 1.30);
      g.addColorStop(0, tint + 'bb');
      g.addColorStop(0.5, tint + '3a');
      g.addColorStop(1, tint + '00');
      c.fillStyle = g; c.fillRect(0, 0, w, w);

      glowStroke(c, tint, 14, 3);
      c.fillStyle = 'rgba(8,18,30,.80)';

      if (arch.shape === 'dart') {
        c.beginPath();
        c.moveTo(cx, cy - R); c.lineTo(cx + R * 0.74, cy + R * 0.20);
        c.lineTo(cx, cy + R * 0.92); c.lineTo(cx - R * 0.74, cy + R * 0.20);
        c.closePath(); c.fill(); c.stroke();
        glowStroke(c, trim, 10, 2.2);
        c.beginPath();
        c.moveTo(cx - R * 0.62, cy - R * 0.10); c.lineTo(cx - R * 1.10, cy - R * 0.55);
        c.moveTo(cx + R * 0.62, cy - R * 0.10); c.lineTo(cx + R * 1.10, cy - R * 0.55);
        c.stroke();
      } else if (arch.shape === 'rotor') {
        c.beginPath();
        for (var i = 0; i < 10; i++) {
          var a = i * Math.PI / 5 - Math.PI / 2;
          var rr = i % 2 ? R * 0.44 : R * 1.02;
          var x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
          if (!i) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#ffffff'; c.shadowBlur = 14;
        c.beginPath(); c.arc(cx, cy, R * 0.20, 0, TAU); c.fill();
      } else if (arch.shape === 'arcnode') {
        glowStroke(c, tint, 16, 3.4);
        c.beginPath(); c.arc(cx, cy, R * 0.80, 0, TAU); c.stroke();
        c.beginPath();
        c.moveTo(cx - R * 1.15, cy); c.lineTo(cx - R * 0.36, cy - R * 0.50);
        c.lineTo(cx + R * 0.14, cy + R * 0.46); c.lineTo(cx + R * 1.15, cy);
        c.stroke();
        c.fillStyle = '#ffffff'; c.shadowBlur = 16;
        c.beginPath(); c.arc(cx, cy, R * 0.22, 0, TAU); c.fill();
      } else if (arch.shape === 'orb') {
        c.beginPath(); c.arc(cx, cy, R * 0.82, 0, TAU); c.fill(); c.stroke();
        glowStroke(c, trim, 12, 2.4);
        for (var s = 0; s < 6; s++) {
          var sa = s * TAU / 6;
          c.beginPath();
          c.moveTo(cx + Math.cos(sa) * R * 0.86, cy + Math.sin(sa) * R * 0.86);
          c.lineTo(cx + Math.cos(sa) * R * 1.26, cy + Math.sin(sa) * R * 1.26);
          c.stroke();
        }
        c.fillStyle = 'rgba(255,255,255,.85)'; c.shadowBlur = 18;
        c.beginPath(); c.arc(cx, cy, R * 0.30, 0, TAU); c.fill();
      } else {
        // bulwark: heavy front plate, exposed rear
        c.beginPath();
        c.moveTo(cx, cy + R * 0.96); c.lineTo(cx + R * 0.70, cy + R * 0.28);
        c.lineTo(cx + R * 0.48, cy - R * 0.72); c.lineTo(cx - R * 0.48, cy - R * 0.72);
        c.lineTo(cx - R * 0.70, cy + R * 0.28);
        c.closePath(); c.fill(); c.stroke();
        glowStroke(c, trim, 16, 4.2);
        c.beginPath();
        c.arc(cx, cy, R * 1.06, Math.PI * 1.18, Math.PI * 1.82);
        c.stroke();
      }
      if (state === 'telegraph') {
        c.globalAlpha = 0.78;
        glowStroke(c, '#fff1a8', 10, 2.4);
        c.beginPath(); c.arc(cx, cy, R * 1.20, -Math.PI * 0.72, Math.PI * 0.72); c.stroke();
      } else if (state === 'hurt') {
        c.globalAlpha = 0.92;
        glowStroke(c, '#ffffff', 12, 3.5);
        c.beginPath(); c.arc(cx, cy, R * 1.12, 0, TAU); c.stroke();
      } else if (state === 'death') {
        c.globalAlpha = 0.88;
        glowStroke(c, '#ffffff', 12, 2.8);
        c.beginPath();
        c.moveTo(cx - R * 1.18, cy - R * 1.18); c.lineTo(cx + R * 1.18, cy + R * 1.18);
        c.moveTo(cx + R * 1.18, cy - R * 1.18); c.lineTo(cx - R * 1.18, cy + R * 1.18);
        c.stroke();
      }
      c.restore();
    });
    return key;
  }

  // ====================================================== tube geometry
  // The shape table is resolved through a guarded accessor: an unknown key
  // returns the round tube rather than undefined.
  var SHAPES = {
    round: function () { return 1; },
    breathe: function (a, t, time) {
      // Three lobes for the organic read, plus a UNIFORM pulse. An angular
      // term on the pulse skewed the rim off centre and made the rim
      // position hard to judge.
      return 1 + 0.075 * Math.sin(a * 3 + time * 1.05) + 0.035 * Math.sin(time * 0.9);
    },
    star: function (a, t, time) {
      return 1 + 0.13 * Math.cos(a * 7 + time * 0.12);
    },
    teeth: function (a, t, time) {
      return 1 + 0.075 * Math.cos(a * 8) + 0.030 * Math.cos(a * 4 - time * 0.4);
    }
  };
  // A ring is a polygon: it must be sampled at several times the radial
  // frequency of its own shape or the outline crawls. Undersampling the gear
  // tube at 26 segments produced a wandering, broken looking rim.
  var SHAPE_SEGMENTS = { round: 28, breathe: 40, star: 56, teeth: 64 };
  function shapeOf(key) { return SHAPES[key] || SHAPES.round; }
  function shapeSegments(key) { return SHAPE_SEGMENTS[key] || 28; }

  // ======================================================== DOM controls
  // The SURGE button and the pause button are real DOM buttons: bigger tap
  // targets than a canvas hit area and they respect the safe area. Their
  // handlers SEED kit.input.pointers at claim time and release the entry on
  // up or cancel, so the playfield drag logic never sees the control pointer
  // as a claw drag.
  var Dom = (function () {
    var root = document.createElement('div');
    root.id = 'ts-controls';
    root.style.cssText = 'position:fixed;inset:0;z-index:5;pointer-events:none;' +
      'display:none;font-family:' + FONT + ';';
    document.body.appendChild(root);

    var surge = document.createElement('button');
    surge.type = 'button';
    surge.id = 'ts-surge';
    surge.setAttribute('aria-label', 'Release surge');
    surge.innerHTML = '<span class="ts-surge-icon" aria-hidden="true">↯</span>' +
      '<span class="ts-surge-pct">0%</span>';
    root.appendChild(surge);

    var pause = document.createElement('button');
    pause.type = 'button';
    pause.id = 'ts-pause';
    pause.setAttribute('aria-label', 'Pause and settings');
    pause.textContent = 'II';
    root.appendChild(pause);

    var css = document.createElement('style');
    css.textContent =
      '#ts-controls button{pointer-events:auto;-webkit-tap-highlight-color:transparent;' +
      'touch-action:manipulation;font-family:inherit;}' +
      '#ts-surge{position:fixed;right:max(16px,env(safe-area-inset-right));' +
      'bottom:max(20px,env(safe-area-inset-bottom));width:88px;height:88px;border-radius:50%;' +
      'border:2px solid rgba(255,184,74,.55);color:#fff6e2;' +
      'background:radial-gradient(circle at 34% 26%,#5a3a12,#241407 62%,#150c05);' +
      'box-shadow:0 0 0 4px rgba(255,184,74,.10),0 8px 26px rgba(0,0,0,.55);' +
      'font-weight:800;font-size:24px;line-height:1;display:flex;' +
      'flex-direction:column;align-items:center;justify-content:center;gap:3px;' +
      'transition:box-shadow .18s,border-color .18s,filter .12s;}' +
      '#ts-surge .ts-surge-icon{height:25px;}' +
      '#ts-surge .ts-surge-pct{font-size:15px;letter-spacing:.02em;color:#ffd79a;}' +
      '#ts-surge.ready{border-color:#ffd36e;color:#fffbf0;' +
      'background:radial-gradient(circle at 34% 26%,#ffbe5a,#b8542c 58%,#3d1a10);' +
      'box-shadow:0 0 0 6px rgba(255,184,74,.22),0 0 34px rgba(255,150,60,.62);}' +
      '#ts-surge.ready .ts-surge-pct{color:#fffdf6;}' +
      '#ts-surge:active{filter:brightness(1.25);transform:scale(.95);}' +
      '#ts-pause{position:fixed;left:max(14px,env(safe-area-inset-left));' +
      'bottom:max(22px,env(safe-area-inset-bottom));width:52px;height:52px;border-radius:14px;' +
      'border:1px solid rgba(124,244,255,.34);color:#cdeeff;background:rgba(8,22,36,.72);' +
      'font-weight:800;font-size:15px;letter-spacing:.14em;}' +
      '#ts-pause:active{filter:brightness(1.3);}';
    document.head.appendChild(css);

    // ---- pointer claim / release, seeding the kit map
    function claim(el, zone, onDown) {
      el.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        // Seed kit.input.pointers with the SAME record shape the kit writes,
        // tagged with a zone. The playfield only drags on zone-less pointers.
        kit.input.pointers.set(e.pointerId, {
          x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
          downAt: performance.now(), zone: zone
        });
        // GGKit's window listener runs after this target listener and seeds a
        // fresh record with zone:null. Restore the claim after propagation so
        // a control pointer can never also steer the claw.
        window.setTimeout(function () {
          var p = kit.input.pointers.get(e.pointerId);
          if (p) p.zone = zone;
        }, 0);
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* optional */ }
        onDown();
      }, { passive: false });
      function release(e) { kit.input.pointers.delete(e.pointerId); }
      el.addEventListener('pointerup', release, { passive: true });
      el.addEventListener('pointercancel', release, { passive: true });
      el.addEventListener('lostpointercapture', release, { passive: true });
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    var api = {
      onSurge: function () {},
      onPause: function () {},
      lastPct: -1,
      lastReady: null,
      setControlsVisible: function (v) { root.style.display = v ? 'block' : 'none'; },
      setSurge: function (pct, ready) {
        var p = Math.round(pct);
        if (p !== api.lastPct) {
          api.lastPct = p;
          surge.lastChild.textContent = p + '%';
        }
        if (ready !== api.lastReady) {
          api.lastReady = ready;
          surge.classList.toggle('ready', !!ready);
        }
      }
    };
    claim(surge, 'surge', function () { api.onSurge(); });
    claim(pause, 'pause', function () { api.onPause(); });
    return api;
  }());

  // ================================================================ Boot
  var BootScene = {
    key: 'Boot',
    preload: function () {
      kit.loader.show('TUBESHOCK');
      kit.loader.progress(0.05);
    },
    create: function () {
      var self = this;
      buildTextures(this);
      kit.loader.progress(0.45);
      // Audio synthesis is a few hundred milliseconds of number crunching;
      // it runs after the first paint so the loader bar actually moves.
      this.time.delayedCall(30, function () {
        var urls = buildAudio();
        kit.audio.register(urls);
        kit.loader.progress(0.85);
        kit.audio.preload(['sfx_ui', 'sfx_fire', 'sfx_kill', 'mus_tube']).then(function () {
          kit.loader.progress(1);
          kit.loader.hide();
          TS_STATE.ready = true;
          self.scene.start('Title');
        });
      });
    }
  };

  // =============================================================== Title
  var TitleScene = {
    key: 'Title',

    create: function () {
      var self = this;
      Game.title = this;
      Dom.setControlsVisible(false);
      TS_STATE.mode = 'menu';
      TS_STATE.phase = 'menu';
      syncProfileDebug();

      this.W = this.scale.width; this.H = this.scale.height;
      this.t = 0;
      this.page = 'main';
      this.menuButtons = [];
      this.menuFocus = 0;
      this.menuKeyEdge = { up: false, down: false, enter: false, escape: false };

      this.bg = this.add.image(0, 0, 'bg_neongrid').setOrigin(0, 0);
      this.gfx = this.add.graphics();
      this.root = this.add.container(0, 0);

      this.buildStatic();
      this.layout();

      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', function () {
        self.scale.off('resize', self.layout, self);
      });

      kit.audio.music('mus_tube', 900);
      kit.registerPWA();
    },

    buildStatic: function () {
      this.title = label(this, 0, 0, 'TUBESHOCK', 40, '#eafeff', 'bold').setOrigin(0.5);
      this.title.setShadow(0, 0, '#3ad8ff', 20, false, true);
      this.tagline = label(this, 0, 0, 'RIDE THE RIM. CLEAR THE TUBE.', 12, '#8fd8ea').setOrigin(0.5);
      this.tagline.setLetterSpacing ? this.tagline.setLetterSpacing(3) : 0;
      this.root.add(this.title); this.root.add(this.tagline);

      this.itemsBox = this.add.container(0, 0);
      this.root.add(this.itemsBox);

      this.foot = label(this, 0, 0, '', 9, '#6f95a8').setOrigin(0.5);
      this.root.add(this.foot);
    },

    // One button factory for every menu row so the pages stay consistent.
    makeButton: function (w, h, title, sub, tint, enabled, onTap) {
      var c = this.add.container(0, 0);
      var bg = this.add.rectangle(0, 0, w, h, 0x081a2c, enabled ? 0.86 : 0.42)
        .setStrokeStyle(1.5, tint, enabled ? 0.7 : 0.25);
      var t1 = label(this, -w / 2 + 18, -h / 2 + 11, title, 15,
        enabled ? '#e9feff' : '#5b7382', 'bold');
      var t2 = label(this, -w / 2 + 18, -h / 2 + 32, sub, 10,
        enabled ? '#8fb4c6' : '#4d6472');
      c.add(bg); c.add(t1); c.add(t2);
      c.bg = bg; c.t1 = t1; c.t2 = t2;
      c.menuOnTap = onTap;
      c.menuTint = tint;
      c.menuStrokeAlpha = enabled ? 0.7 : 0.25;
      if (enabled) {
        this.menuButtons.push(c);
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', function () {
          kit.audio.sfx('sfx_ui');
          bg.setFillStyle(0x11405e, 0.95);
        });
        bg.on('pointerup', function () {
          bg.setFillStyle(0x081a2c, 0.86);
          onTap();
        });
        bg.on('pointerout', function () { bg.setFillStyle(0x081a2c, 0.86); });
      }
      return c;
    },

    clearItems: function () {
      this.itemsBox.removeAll(true);
      this.menuButtons = [];
    },

    layout: function () {
      this.W = this.scale.width; this.H = this.scale.height;
      var W = this.W, H = this.H;
      this.bg.setDisplaySize(W, H);
      var top = Game.insets.top;
      this.title.setPosition(W / 2, top + H * 0.10);
      this.title.setFontSize(Math.round(clamp(W * 0.105, 26, 46)));
      this.tagline.setPosition(W / 2, top + H * 0.10 + this.title.height * 0.62);
      this.foot.setPosition(W / 2, H - Math.max(22, Game.insets.bottom + 18));
      this.paintPage();
    },

    paintPage: function () {
      this.clearItems();
      var W = this.W, H = this.H;
      var bw = Math.min(W * 0.86, 420);
      var bh = 56;
      var gap = 10;
      var y0 = Game.insets.top + H * 0.30;
      var self = this;
      var i;

      if (this.page === 'main') {
        var rows = [
          ['DEPTH RUNS', 'Chained tube segments, medals per run', PAL.rim || 0x7cf4ff, true,
            function () { self.page = 'runs'; self.paintPage(); }],
          ['SCORE ATTACK', D.SPRINT.sub + '. Best ' + commas(profile.sprintBest), 0xffd36e, true,
            function () { self.launch({ mode: 'sprint' }); }],
          ['CORE BREACH', profile.unlocked >= D.RUNS.length ?
            'The guardian, straight in' : 'LOCKED. CLEAR ' + D.RUNS[D.RUNS.length - 2].name,
            0xff8fa8, profile.unlocked >= D.RUNS.length,
            function () { self.launch({ mode: 'run', runKey: 'core-breach', straightToBoss: true }); }],
          ['SETTINGS', 'Sound, screen shake, flash effects', 0x8ff5d2, true,
            function () { openSettings(); }]
        ];
        for (i = 0; i < rows.length; i++) {
          var r = rows[i];
          var b = this.makeButton(bw, bh, r[0], r[1], r[2], r[3], r[4]);
          b.setPosition(W / 2, y0 + i * (bh + gap) + bh / 2);
          this.itemsBox.add(b);
        }
        setTextIfChanged(this.foot,
          'DRAG OR ARROWS TO MOVE. SPACE FOR SURGE. PLAYS OFFLINE.');
      } else {
        var listTop = Game.insets.top + H * 0.19;
        var rbh = 52;
        for (i = 0; i < D.RUNS.length; i++) {
          var run = D.RUNS[i];
          var open = i < profile.unlocked;
          var medal = profile.medals[run.key] || 'none';
          var best = profile.bestScore[run.key] || 0;
          var sub = open
            ? (run.segs.length + ' SEGMENTS  ' + D.MEDAL.label[medal] +
               (best ? '  BEST ' + commas(best) : ''))
            : 'LOCKED. FINISH ' + D.RUNS[Math.max(0, i - 1)].name;
          var tint = medal !== 'none' ? D.MEDAL.tint[medal] : 0x7cf4ff;
          var btn = this.makeButton(bw, rbh, (i + 1) + '. ' + run.name, sub, tint, open,
            (function (rk) {
              return function () { self.launch({ mode: 'run', runKey: rk }); };
            }(run.key)));
          btn.setPosition(W / 2, listTop + i * (rbh + 8) + rbh / 2);
          this.itemsBox.add(btn);
        }
        var back = this.makeButton(bw, 46, 'BACK', 'Return to the main menu', 0x8fb4c6, true,
          function () { self.page = 'main'; self.paintPage(); });
        back.setPosition(W / 2, listTop + D.RUNS.length * (rbh + 8) + 30);
        this.itemsBox.add(back);
        setTextIfChanged(this.foot, 'MEDALS BLEND SCORE, DEPTH REACHED AND ACCURACY.');
      }
      this.menuFocus = clamp(this.menuFocus, 0, Math.max(0, this.menuButtons.length - 1));
      this.paintMenuFocus();
    },

    paintMenuFocus: function () {
      for (var i = 0; i < this.menuButtons.length; i++) {
        var b = this.menuButtons[i];
        var focused = i === this.menuFocus;
        b.bg.setStrokeStyle(focused ? 2.5 : 1.5,
          focused ? 0xffffff : b.menuTint,
          focused ? 0.98 : b.menuStrokeAlpha);
      }
    },

    readMenuInput: function () {
      if (!this.menuButtons.length) return;
      var up = kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW');
      var down = kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS');
      var enter = kit.input.keyDown('Enter') || kit.input.keyDown('Space');
      var escape = kit.input.keyDown('Escape');
      if (up && !this.menuKeyEdge.up) {
        this.menuFocus = (this.menuFocus + this.menuButtons.length - 1) % this.menuButtons.length;
        this.paintMenuFocus();
      }
      if (down && !this.menuKeyEdge.down) {
        this.menuFocus = (this.menuFocus + 1) % this.menuButtons.length;
        this.paintMenuFocus();
      }
      if (enter && !this.menuKeyEdge.enter) {
        var selected = this.menuButtons[this.menuFocus];
        if (selected && selected.menuOnTap) selected.menuOnTap();
      }
      if (escape && !this.menuKeyEdge.escape && this.page === 'runs') {
        this.page = 'main';
        this.paintPage();
      }
      this.menuKeyEdge.up = up;
      this.menuKeyEdge.down = down;
      this.menuKeyEdge.enter = enter;
      this.menuKeyEdge.escape = escape;
    },

    launch: function (cfg) {
      kit.audio.sfx('sfx_ui');
      this.scene.start('Play', cfg);
    },

    update: function (time, delta) {
      this.readMenuInput();
      this.t += delta / 1000;
      // Slow decorative tube behind the menu. Cheap: 5 rings, no entities.
      var g = this.gfx;
      g.clear();
      var cx = this.W / 2, cy = this.H * 0.5;
      var R = Math.min(this.W * 0.62, this.H * 0.42);
      for (var i = 0; i < 6; i++) {
        var p = ((i / 6) + (this.t * 0.06)) % 1;
        var rr = R * Math.pow(p, 1.7);
        g.lineStyle(1.4, 0x2f7fa8, 0.30 * (1 - p) + 0.06);
        g.strokeEllipse(cx, cy, rr * 2, rr * 1.7);
      }
    }
  };

  // ================================================================ Play
  var PlayScene = {
    key: 'Play',

    init: function (cfg) {
      this.launch = cfg || { mode: 'run', runKey: D.RUNS[0].key };
      Game.play = this;
    },

    create: function () {
      var self = this;
      this.W = this.scale.width;
      this.H = this.scale.height;
      this.dbg = TS_STATE;
      window.__ts = { state: this.dbg };

      this.acc = 0;
      this.time_ = 0;          // simulated clock, advanced ONLY by step()
      this.frozen = false;
      this.transientActive = null;
      this.transientQueue = [];
      this.transientClock = 0;
      this.coachText = '';
      this.coachClock = 0;

      this.mode = this.launch.mode === 'sprint' ? 'sprint' : 'run';
      this.run = this.mode === 'run' ? D.runOf(this.launch.runKey) : null;
      this.rng = makeRng(this.mode === 'run'
        ? 0x1b3f00 + D.runIndexOf(this.launch.runKey) * 7919
        : (Date.now() & 0xffffff));

      this.buildWorld();
      this.buildPools();
      this.buildHud();
      this.buildInput();

      this.resetRun();

      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', function () {
        self.scale.off('resize', self.layout, self);
        Dom.setControlsVisible(false);
        if (Game.play === self) Game.play = null;
      });
      this.layout();
    },

    // ------------------------------------------------------------ world
    buildWorld: function () {
      this.bg = this.add.image(0, 0, 'bg_neongrid').setOrigin(0, 0).setDepth(0);
      this.gTube = this.add.graphics().setDepth(10);
      this.dustLayer = this.add.container(0, 0).setDepth(5);
      this.entityLayer = this.add.container(0, 0).setDepth(20);
      this.gFx = this.add.graphics().setDepth(30);
      this.clawSpr = this.add.image(0, 0, 'claw_idle').setDepth(34);
      this.reticle = this.add.image(0, 0, 'reticle').setDepth(33)
        .setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
      this.shock = this.add.image(0, 0, 'p_ring').setDepth(36)
        .setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
      this.flashPlate = this.add.rectangle(0, 0, 10, 10, 0xffffff, 0)
        .setOrigin(0, 0).setDepth(70).setScrollFactor(0);
      this.vignette = this.add.rectangle(0, 0, 10, 10, 0xff2a44, 0)
        .setOrigin(0, 0).setDepth(69).setScrollFactor(0);

      // Six pooled particle systems. All emitting:false and driven by
      // explode(), so nothing runs when nothing happened.
      var addEm = function (scene, tex, cfg, depth) {
        var em = scene.add.particles(0, 0, tex, cfg);
        em.setDepth(depth);
        return em;
      };
      this.emKill = addEm(this, 'p_dot', {
        speed: { min: 40, max: 220 }, lifespan: { min: 240, max: 620 },
        scale: { start: 0.42, end: 0 }, alpha: { start: 1, end: 0 },
        blendMode: 'ADD', emitting: false, quantity: 1
      }, 26);
      this.emShard = addEm(this, 'p_shard', {
        speed: { min: 60, max: 300 }, lifespan: { min: 260, max: 700 },
        scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 },
        rotate: { start: 0, end: 360 }, blendMode: 'ADD', emitting: false, quantity: 1
      }, 27);
      this.emSurge = addEm(this, 'p_spark', {
        speed: { min: 160, max: 520 }, lifespan: { min: 300, max: 760 },
        scale: { start: 1.1, end: 0 }, alpha: { start: 1, end: 0 },
        blendMode: 'ADD', emitting: false, quantity: 1
      }, 37);
      this.emBreach = addEm(this, 'p_smoke', {
        speed: { min: 20, max: 130 }, lifespan: { min: 500, max: 1200 },
        scale: { start: 0.7, end: 1.6 }, alpha: { start: 0.7, end: 0 },
        blendMode: 'NORMAL', emitting: false, quantity: 1
      }, 25);
      this.emPickup = addEm(this, 'p_dot', {
        speed: { min: 20, max: 120 }, lifespan: { min: 300, max: 700 },
        scale: { start: 0.30, end: 0 }, alpha: { start: 1, end: 0 },
        blendMode: 'ADD', emitting: false, quantity: 1
      }, 28);
      this.emHazard = addEm(this, 'p_dot', {
        speed: { min: 10, max: 90 }, lifespan: { min: 400, max: 900 },
        scale: { start: 0.24, end: 0 }, alpha: { start: 0.85, end: 0 },
        blendMode: 'ADD', emitting: false, quantity: 1
      }, 24);
    },

    // ------------------------------------------------------------ pools
    // SIM records and VIEW records are separate objects. A renderer only ever
    // receives the view; nothing that the renderer writes lands on the record
    // the simulation iterates.
    buildPools: function () {
      var i;
      this.enemies = []; this.enemyView = [];
      for (i = 0; i < MAX_ENEMIES; i++) {
        this.enemies.push({
          active: false, type: 'crawler', ang: 0, t: 0, hp: 1, maxHp: 1,
          age: 0, seed: 0, weave: 0, park: 0, hurt: 0, dying: 0, scale: 1,
          spawnDelay: 0, drift: 0
        });
        this.enemyView.push({
          spr: this.add.image(0, 0, 'en_neongrid_crawler_idle')
            .setVisible(false).setBlendMode(Phaser.BlendModes.ADD),
          texKey: '', flash: 0, spin: 0, hurtTint: false
        });
        this.entityLayer.add(this.enemyView[i].spr);
      }

      this.bullets = []; this.bulletView = [];
      for (i = 0; i < MAX_BULLETS; i++) {
        this.bullets.push({ active: false, ang: 0, t: 0, vt: 0, lock: -1, curve: 0 });
        this.bulletView.push({ spr: this.add.image(0, 0, 'bullet').setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD) });
        this.entityLayer.add(this.bulletView[i].spr);
      }

      this.pickups = []; this.pickupView = [];
      for (i = 0; i < MAX_PICKUPS; i++) {
        this.pickups.push({ active: false, kind: 'surge', ang: 0, t: 0, ttl: 0, age: 0 });
        this.pickupView.push({ spr: this.add.image(0, 0, 'pu_surge').setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD) });
        this.entityLayer.add(this.pickupView[i].spr);
      }

      this.blockers = []; this.blockerView = [];
      for (i = 0; i < MAX_BLOCKERS; i++) {
        this.blockers.push({ active: false, ang: 0, t: 0, hp: 4, hurt: 0 });
        this.blockerView.push({ spr: this.add.image(0, 0, 'p_shard').setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD) });
        this.entityLayer.add(this.blockerView[i].spr);
      }

      this.telegraphs = [];
      for (i = 0; i < MAX_TELEGRAPHS; i++) {
        this.telegraphs.push({ active: false, ang: 0, ttl: 0, life: 0, kind: 'spawn' });
      }

      this.dust = []; this.dustView = [];
      for (i = 0; i < MAX_DUST; i++) {
        this.dust.push({ ang: 0, t: 0, spd: 0, layer: 0 });
        this.dustView.push({ spr: this.add.image(0, 0, 'p_dot')
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false) });
        this.dustLayer.add(this.dustView[i].spr);
      }

      // Boss parts. Preallocated even when the run has no boss.
      this.bossPlateView = [];
      for (i = 0; i < D.BOSS.plates; i++) {
        this.bossPlateView.push({
          spr: this.add.image(0, 0, 'boss_plate').setDepth(22).setVisible(false)
        });
      }
      this.bossCoreSpr = this.add.image(0, 0, 'boss_core').setDepth(9)
        .setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    },

    // -------------------------------------------------------------- HUD
    buildHud: function () {
      this.hud = {};
      var h = this.hud;
      h.box = this.add.container(0, 0).setDepth(80).setScrollFactor(0);

      h.band = this.add.rectangle(0, 0, 10, 76, 0x03080f, 0.55).setOrigin(0, 0);
      h.box.add(h.band);

      h.scoreT = label(this, 0, 0, '000000', 26, '#f4feff', 'bold').setOrigin(0.5, 0);
      h.livesT = label(this, 0, 0, '', 18, '#ff8fa8', 'bold').setOrigin(0, 0);
      h.depthT = label(this, 0, 0, '0 M', 16, '#8ff5d2', 'bold').setOrigin(1, 0);
      h.segT = label(this, 0, 0, '', 14, '#9fd8ea').setOrigin(0.5, 0);
      h.buffT = label(this, 0, 0, '', 14, '#ffd36e', 'bold').setOrigin(0.5, 0).setVisible(false);
      h.box.add([h.scoreT, h.livesT, h.depthT, h.segT, h.buffT]);

      // Surge meter, an arc ring drawn only when the bucket changes.
      h.surgeG = this.add.graphics().setDepth(81).setScrollFactor(0);

      // Boss bar
      h.bossBox = this.add.container(0, 0).setDepth(82).setScrollFactor(0).setVisible(false);
      h.bossBg = this.add.rectangle(0, 0, 10, 9, 0x2a0a18, 0.9).setOrigin(0, 0.5);
      h.bossFill = this.add.rectangle(0, 0, 10, 9, 0xff6a5a, 1).setOrigin(0, 0.5);
      h.bossT = label(this, 0, 0, '', 14, '#ffc7b0', 'bold').setOrigin(0.5, 1);
      h.bossBox.add([h.bossBg, h.bossFill, h.bossT]);

      // Center banners are reserved for run boundaries and level changes.
      h.banner = this.add.container(0, 0).setDepth(90).setScrollFactor(0).setAlpha(0);
      h.bannerFill = this.add.rectangle(0, 0, 10, 48, 0x061a2c, 0.90);
      h.bannerTop = this.add.rectangle(0, -24, 10, 2, 0x7cf4ff, 0.9);
      h.bannerBot = this.add.rectangle(0, 24, 10, 2, 0x7cf4ff, 0.55);
      h.bannerT1 = label(this, 0, 0, '', 18, '#eafeff', 'bold').setOrigin(0.5);
      h.banner.add([h.bannerFill, h.bannerTop, h.bannerBot, h.bannerT1]);

      // Live events share one small top-edge chip. It never stacks with a
      // banner or tutorial copy; callers are queued by notify().
      h.chip = this.add.container(0, 0).setDepth(89).setScrollFactor(0)
        .setAlpha(0).setVisible(false);
      h.chipFill = this.add.rectangle(0, 0, 10, 30, 0x04121e, 0.88);
      h.chipEdge = this.add.rectangle(0, 14, 10, 1.5, 0x7cf4ff, 0.82);
      h.chipT = label(this, 0, 0, '', 14, '#eafeff', 'bold').setOrigin(0.5);
      h.chip.add([h.chipFill, h.chipEdge, h.chipT]);

      // Coach strip: one line, top edge, then near-transparent after 3 s.
      h.coach = this.add.container(0, 0).setDepth(88).setScrollFactor(0)
        .setAlpha(0).setVisible(false);
      h.coachFill = this.add.rectangle(0, 0, 10, 30, 0x04121e, 0.78);
      h.coachEdge = this.add.rectangle(0, 15, 10, 1.5, 0x8ff5d2, 0.75);
      h.coachT = label(this, 0, 0, '', 14, '#cdf3ff').setOrigin(0.5);
      h.coach.add([h.coachFill, h.coachEdge, h.coachT]);

      // Results overlay lives inside the scene so a restart never leaves DOM
      // behind. Hidden until the run ends.
      h.result = this.add.container(0, 0).setDepth(95).setScrollFactor(0).setVisible(false);
      h.resultDim = this.add.rectangle(0, 0, 10, 10, 0x02060f, 0.86).setOrigin(0, 0);
      h.resultCard = this.add.rectangle(0, 0, 10, 10, 0x07182a, 0.96)
        .setStrokeStyle(1.5, 0x7cf4ff, 0.6);
      h.resultT1 = label(this, 0, 0, '', 24, '#eafeff', 'bold').setOrigin(0.5);
      h.resultMedal = label(this, 0, 0, '', 17, '#ffd36e', 'bold').setOrigin(0.5);
      h.resultBody = label(this, 0, 0, '', 12, '#9fc6d6').setOrigin(0.5);
      h.resultBody.setAlign('center');
      h.result.add([h.resultDim, h.resultCard, h.resultT1, h.resultMedal, h.resultBody]);
      h.resultBtns = this.add.container(0, 0);
      h.result.add(h.resultBtns);

      this.hudCache = {
        score: -1, lives: -1, depth: -1, seg: '', buff: '', surge: -1,
        boss: -1, coach: ''
      };
    },

    // ------------------------------------------------------------ input
    buildInput: function () {
      var self = this;
      Dom.onSurge = function () { self.requestSurge(); };
      Dom.onPause = function () { openSettings(); };
      Dom.setControlsVisible(true);
      this.dragId = null;
      this.dragAng = 0;
      this.dragFallbackX = 0;
      this.keyEdge = { surge: false };
      this.resultButtons = [];
      this.resultFocus = 0;
      this.resultKeyEdge = { up: false, down: false, enter: false };
    },

    // ------------------------------------------------------- run reset
    resetRun: function () {
      var i;
      this.score = 0;
      this.lives = this.mode === 'sprint' ? D.SPRINT.lives : 3;
      this.surge = 40;
      this.surgeArmed = false;
      this.shields = 0;
      this.multT = 0;
      this.shots = 0;
      this.hits = 0;
      this.depth = 0;
      this.invuln = 0;
      this.combo = 0;
      this.comboT = 0;
      this.dropPity = 0;
      this.clawAng = -Math.PI / 2;
      this.clawTarget = -Math.PI / 2;
      this.clawAnim = 'idle';
      this.clawFireT = 0;
      this.fireTimer = 0.2;
      this.lockIdx = -1;
      this.lockT = 0;
      this.spinAng = 0;
      this.sprintLeft = D.SPRINT.seconds;
      this.tubePulse = 0;
      this.shockT = -1;
      this.shockPow = 0;
      this.musicLayer = '';
      this.poolStats = { enemies: 0, bullets: 0, pickups: 0, telegraphs: 0, popups: 0 };
      this.hazTimer = 6;
      this.haz = { active: false, kind: '', phase: '', ttl: 0, ang: 0, arc: 0, spin: 0 };
      this.boss = {
        active: false, phase: 0, phaseT: 0, coreHp: 0, maxCoreHp: 0,
        plates: [], spawnT: 0, beamT: 0, spin: 0, hurt: 0, beams: [], intro: 0
      };
      for (i = 0; i < D.BOSS.plates; i++) {
        this.boss.plates.push({ alive: true, hp: D.BOSS.plateHp, ang: i * TAU / D.BOSS.plates });
      }
      for (i = 0; i < 6; i++) this.boss.beams.push({ active: false, ang: 0, ttl: 0, warn: 0 });

      for (i = 0; i < MAX_ENEMIES; i++) { this.enemies[i].active = false; this.enemyView[i].spr.setVisible(false); }
      for (i = 0; i < MAX_BULLETS; i++) { this.bullets[i].active = false; this.bulletView[i].spr.setVisible(false); }
      for (i = 0; i < MAX_PICKUPS; i++) { this.pickups[i].active = false; this.pickupView[i].spr.setVisible(false); }
      for (i = 0; i < MAX_BLOCKERS; i++) { this.blockers[i].active = false; this.blockerView[i].spr.setVisible(false); }
      for (i = 0; i < MAX_TELEGRAPHS; i++) this.telegraphs[i].active = false;
      for (i = 0; i < D.BOSS.plates; i++) this.bossPlateView[i].spr.setVisible(false);
      this.bossCoreSpr.setVisible(false);
      this.hud.bossBox.setVisible(false);

      this.segIndex = 0;
      this.segTime = 0;
      this.phase = 'intro';
      this.phaseT = 0;
      this.spawnTimer = 1.2;

      // Test switches honoured at run start as well as mid run.
      if (this.mode === 'run' && this.dbg.forceLevel >= 0) {
        this.segIndex = clamp(this.dbg.forceLevel | 0, 0, this.run.segs.length - 1);
      }
      if (this.launch.straightToBoss || this.dbg.forceBoss) {
        if (this.run && this.run.boss) this.segIndex = this.run.segs.length - 1;
      }

      this.applySegment();
      this.seedDust();

      this.tutStep = (!profile.tutorialDone && this.mode === 'run') ? 0 : -1;
      this.tutT = 0;
      this.tutMoved = 0;
      this.transientActive = null;
      this.transientQueue.length = 0;
      this.transientClock = 0;
      this.coachText = '';
      this.coachClock = 0;
      this.hud.banner.setAlpha(0).setVisible(false);
      this.hud.chip.setAlpha(0).setVisible(false);
      this.hud.coach.setAlpha(0).setVisible(false);

      this.banner(this.mode === 'sprint' ? D.SPRINT.name : this.run.name,
        this.mode === 'sprint' ? D.SPRINT.sub : this.run.sub, 0x7cf4ff);
      this.syncMusic();
      this.pushDebug();
    },

    // ------------------------------------------------- segment handling
    currentSeg: function () {
      if (this.mode === 'sprint') {
        var idx = Math.floor((D.SPRINT.seconds - this.sprintLeft) / D.SPRINT.swapEvery);
        var famKey = D.SPRINT.cycle[idx % D.SPRINT.cycle.length];
        return {
          fam: famKey, dur: D.SPRINT.swapEvery,
          tier: D.SPRINT.startTier + (D.SPRINT.seconds - this.sprintLeft) * D.SPRINT.tierPerSecond
        };
      }
      var segs = this.run.segs;
      return segs[clamp(this.segIndex, 0, segs.length - 1)] || segs[0];
    },

    applySegment: function () {
      var seg = this.currentSeg();
      var famKey = seg.fam;
      // Test switch: family override, guarded through familyOf.
      if (this.dbg.forceTubeFamily) famKey = this.dbg.forceTubeFamily;
      this.fam = D.familyOf(famKey);
      this.famKey = this.fam.key;
      this.tier = seg.tier || 1;
      this.segDur = seg.dur || 30;
      this.segTime = 0;
      this.shapeFn = shapeOf(this.fam.shape);
      this.bg.setTexture('bg_' + this.fam.key);
      this.bg.setDisplaySize(this.W, this.H);
      this.hazTimer = this.fam.hazardEvery[0] * 0.55;
      this.spawnTimer = 0.9;
      this.retintDust();
      if (seg.boss) this.startBoss();
    },

    syncMusic: function () {
      var want = this.boss && this.boss.active ? 'mus_core' :
        (this.tier > 9 ? 'mus_drive' : 'mus_tube');
      if (want === this.musicLayer) return;
      this.musicLayer = want;
      kit.audio.music(want, 700);
    },

    // ------------------------------------------------------- projection
    // t is depth: 0 is the core, 1 is the rim under the claw.
    // The scratch points are separate objects, so a caller can hold two
    // projections at once without aliasing.
    metrics: function () {
      var W = this.W, H = this.H;
      this.cx = W * 0.5;
      this.cy = Game.insets.top + H * 0.44;
      this.R = Math.min(W * 0.462, H * 0.310);
      this.drop = H * 0.070;
    },
    project: function (t, a, out) {
      var p = Math.pow(clamp(t, 0, 1.2), 1.85);
      var m = 1 + (this.shapeFn(a - this.spinAng, t, this.time_) - 1) * (0.32 + 0.68 * p);
      var r = this.R * p * m;
      out.x = this.cx + Math.cos(a) * r;
      out.y = this.cy + Math.sin(a) * r * this.fam.squash + p * this.drop;
      out.r = r;
      out.p = p;
      return out;
    },

    // ---------------------------------------------------------- helpers
    freeEnemy: function () {
      for (var i = 0; i < MAX_ENEMIES; i++) if (!this.enemies[i].active) return i;
      return -1;
    },
    aliveEnemies: function () {
      var n = 0;
      for (var i = 0; i < MAX_ENEMIES; i++) if (this.enemies[i].active && !this.enemies[i].dying) n++;
      return n;
    },
    laneAngle: function (lane) {
      return angWrap(-Math.PI / 2 + (lane % this.fam.lanes) * TAU / this.fam.lanes);
    },
    randLaneAngle: function () {
      return this.laneAngle(Math.floor(this.rng() * this.fam.lanes));
    },

    telegraph: function (ang, life, kind) {
      for (var i = 0; i < MAX_TELEGRAPHS; i++) {
        var tg = this.telegraphs[i];
        if (!tg.active) {
          tg.active = true; tg.ang = ang; tg.ttl = life; tg.life = life;
          tg.kind = kind || 'spawn';
          return tg;
        }
      }
      this.poolStats.telegraphs++;
      return null;
    },

    spawnEnemy: function (typeKey, ang, delay, scale) {
      var i = this.freeEnemy();
      if (i < 0) { this.poolStats.enemies++; return null; }
      var arch = D.enemyOf(typeKey);
      var e = this.enemies[i];
      e.active = true;
      e.type = arch.key;
      e.ang = angWrap(ang);
      e.t = 0.035;
      e.maxHp = arch.hp + (this.tier > 9 ? 1 : 0) + (this.tier > 15 ? 1 : 0);
      e.hp = e.maxHp;
      e.age = 0;
      e.seed = this.rng() * TAU;
      e.weave = arch.weave || 0;
      e.park = arch.parks || 0;
      e.hurt = 0;
      e.dying = 0;
      e.scale = (scale || 1) * arch.size;
      e.spawnDelay = delay || 0;
      e.drift = this.fam.spin * 0.55;
      var v = this.enemyView[i];
      var texKey = 'en_' + this.fam.key + '_' + arch.key + '_idle';
      if (!this.textures.exists(texKey)) texKey = 'en_neongrid_crawler_idle';
      if (v.texKey !== texKey) { v.spr.setTexture(texKey); v.texKey = texKey; }
      v.flash = 0;
      v.deathT = 0;
      v.spin = (this.rng() - 0.5) * 2;
      if (v.hurtTint) { v.spr.clearTint(); v.hurtTint = false; }
      return e;
    },

    fireBullet: function (ang, lockIdx) {
      for (var i = 0; i < MAX_BULLETS; i++) {
        var b = this.bullets[i];
        if (!b.active) {
          b.active = true;
          b.ang = ang;
          b.t = 1.02;
          b.vt = 2.05;
          b.lock = lockIdx;
          b.curve = 0;
          this.shots++;
          return b;
        }
      }
      this.poolStats.bullets++;
      return null;
    },

    // --------------------------------------------------------- transient UI
    // The queue is deliberately shared by boundary banners and live chips.
    // A coach strip is hidden while an event is active and restored after it,
    // so active play can never show two transient text elements at once.
    notify: function (text, tint) {
      var item = { kind: 'chip', text: text, tint: tint || 0x7cf4ff };
      if (this.transientActive) {
        if (this.transientQueue.length < 4) this.transientQueue.push(item);
        return;
      }
      this.startTransient(item);
    },

    banner: function (t1, t2, tint) {
      // Boundary banners keep the title; subtitles are flavor copy and are
      // intentionally discarded from active-play presentation.
      var item = { kind: 'banner', text: t1, tint: tint || 0x7cf4ff };
      if (this.transientActive) {
        if (this.transientQueue.length < 4) this.transientQueue.push(item);
        return;
      }
      this.startTransient(item);
    },

    startTransient: function (item) {
      var h = this.hud;
      this.transientActive = item;
      this.transientClock = 0;
      h.banner.setVisible(item.kind === 'banner').setAlpha(0).setScale(1);
      h.chip.setVisible(item.kind === 'chip').setAlpha(0).setScale(1);
      this.hideCoachVisual();

      if (item.kind === 'banner') {
        var bw = Math.round(this.W * 0.60);
        h.bannerFill.setSize(bw, 48);
        h.bannerTop.setSize(bw, 2);
        h.bannerBot.setSize(bw, 2);
        h.bannerTop.setFillStyle(item.tint, 0.9);
        h.bannerBot.setFillStyle(item.tint, 0.5);
        setTextIfChanged(h.bannerT1, item.text);
        fitText(h.bannerT1, bw - 26, 18, 14);
      } else {
        var cw = Math.min(this.W * 0.52, 220);
        h.chipFill.setSize(cw, 30);
        h.chipEdge.setSize(cw, 1.5);
        h.chipEdge.setFillStyle(item.tint, 0.82);
        setTextIfChanged(h.chipT, item.text);
        h.chipT.setColor(hex(item.tint));
        fitText(h.chipT, cw - 18, 14, 14);
      }
      this.paintTransient();
    },

    coach: function (text) {
      this.coachText = text;
      this.coachClock = 0;
      if (this.transientActive) return;
      this.showCoach();
    },
    showCoach: function () {
      if (!this.coachText || this.tutStep < 0 || this.transientActive) return;
      var h = this.hud;
      setTextIfChanged(h.coachT, this.coachText);
      h.coach.setVisible(true).setAlpha(0);
      this.coachClock = 0;
      this.paintCoach();
    },
    hideCoachVisual: function () {
      this.hud.coach.setAlpha(0).setVisible(false);
    },
    paintTransient: function () {
      if (!this.transientActive) return;
      var item = this.transientActive;
      var inDur = motionOn() ? 0.12 : 0;
      var hold = item.kind === 'chip' ? 0.68 : 1.02;
      var outDur = motionOn() ? 0.20 : 0;
      var t = this.transientClock;
      var alpha;
      if (t < inDur) alpha = inDur ? t / inDur * 0.96 : 0.96;
      else if (t < inDur + hold) alpha = 0.96;
      else alpha = outDur ? Math.max(0, 0.96 * (1 - (t - inDur - hold) / outDur)) : 0;
      var h = this.hud;
      if (item.kind === 'banner') {
        h.banner.setAlpha(alpha);
        if (motionOn()) h.banner.setScale(0.97 + Math.min(0.03, t / 0.12 * 0.03));
      } else {
        h.chip.setAlpha(alpha);
      }
    },
    paintCoach: function () {
      if (!this.hud.coach.visible) return;
      var t = this.coachClock;
      var a = motionOn() && t < 0.20 ? t / 0.20 * 0.86 :
        (t < 3.0 ? 0.86 : 0.12);
      if (!motionOn()) a = t < 3.0 ? 0.86 : 0.12;
      this.hud.coach.setAlpha(a);
    },
    stepTransient: function (dt) {
      if (!this.transientActive) return;
      this.transientClock += dt;
      var inDur = motionOn() ? 0.12 : 0;
      var hold = this.transientActive.kind === 'chip' ? 0.68 : 1.02;
      var outDur = motionOn() ? 0.20 : 0;
      this.paintTransient();
      if (this.transientClock >= inDur + hold + outDur) this.finishTransient();
    },
    stepCoach: function (dt) {
      if (!this.transientActive && this.hud.coach.visible) {
        this.coachClock += dt;
        this.paintCoach();
      }
    },
    finishTransient: function () {
      var h = this.hud;
      h.banner.setAlpha(0).setVisible(false);
      h.chip.setAlpha(0).setVisible(false);
      this.transientActive = null;
      this.transientClock = 0;
      if (this.transientQueue.length) {
        this.startTransient(this.transientQueue.shift());
      } else if (this.coachText && this.tutStep >= 0) {
        this.showCoach();
      }
    },
    clearTransient: function () {
      this.transientActive = null;
      this.transientQueue.length = 0;
      this.transientClock = 0;
      this.hud.banner.setAlpha(0).setVisible(false);
      this.hud.chip.setAlpha(0).setVisible(false);
      this.hud.coach.setAlpha(0).setVisible(false);
    },
    coachOut: function () {
      this.coachText = '';
      this.coachClock = 0;
      this.hideCoachVisual();
    },

    // ------------------------------------------------------------ dust
    seedDust: function () {
      for (var i = 0; i < MAX_DUST; i++) {
        var d = this.dust[i];
        d.ang = this.rng() * TAU;
        d.t = this.rng();
        d.layer = i % 3;
        d.spd = 0.12 + d.layer * 0.10 + this.rng() * 0.05;
        this.dustView[i].spr.setVisible(true);
      }
      this.retintDust();
    },
    retintDust: function () {
      for (var i = 0; i < MAX_DUST; i++) {
        this.dustView[i].spr.setTint(this.fam.pal.dust);
      }
    },

    // ============================================================= input
    readInput: function (dt) {
      // Claw drag: the first live pointer WITHOUT a control zone owns the
      // claw. Angular deltas are accumulated as shortest arcs, so crossing
      // the wrap point cannot produce a jump, and the claw target is never
      // wrapped, so the smoothing lerp cannot snap the long way round.
      var owner = null, ownerId = null;
      var it = kit.input.pointers.entries();
      var n = it.next();
      while (!n.done) {
        var id = n.value[0], p = n.value[1];
        if (!p.zone) { owner = p; ownerId = id; break; }
        n = it.next();
      }

      if (owner) {
        var dx = owner.x - this.cx;
        var dy = owner.y - this.cy;
        var rad = Math.sqrt(dx * dx + dy * dy);
        if (ownerId !== this.dragId) {
          this.dragId = ownerId;
          this.dragAng = Math.atan2(dy, dx);
          this.dragFallbackX = owner.x;
        }
        if (rad > this.R * 0.22) {
          // Angular drag: direct and predictable anywhere outside the core.
          var a = Math.atan2(dy, dx);
          this.clawTarget += angDiff(a, this.dragAng);
          this.dragAng = a;
          this.dragFallbackX = owner.x;
        } else {
          // Near the vanishing point atan2 is unstable, so fall back to a
          // horizontal slide mapping. No jitter, no wrap discontinuity.
          var slide = (owner.x - this.dragFallbackX) / Math.max(1, this.W) * TAU * 1.15;
          this.clawTarget += slide;
          this.dragFallbackX = owner.x;
          this.dragAng = Math.atan2(dy, dx);
        }
        if (this.tutStep === 0) this.tutMoved += Math.abs(angDiff(this.clawTarget, this.clawAng));
      } else {
        this.dragId = null;
      }

      // Keyboard, through the kit so a paused sim ignores held keys.
      var step = TAU / this.fam.lanes * dt * 4.6;
      var left = kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA') ||
        kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW');
      var right = kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD') ||
        kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS');
      if (left) { this.clawTarget -= step; this.tutMoved += step; }
      if (right) { this.clawTarget += step; this.tutMoved += step; }

      var surgeKey = kit.input.keyDown('Space') || kit.input.keyDown('Enter');
      if (surgeKey && !this.keyEdge.surge) this.requestSurge();
      this.keyEdge.surge = surgeKey;
    },

    // ============================================================= surge
    requestSurge: function () {
      if (this.phase !== 'play' && this.phase !== 'boss') return;
      if (this.surge < 100) {
        kit.audio.sfx('sfx_ui');
        return;
      }
      this.surge = 0;
      this.surgeArmed = false;
      this.shockT = 1.10;
      this.shockPow = 1;
      this.clawAnim = 'charge';
      this.clawFireT = 0.28;
      kit.audio.sfx('sfx_surge_fire');
      kit.juice.shake(14, 380);
      kit.juice.hitStop(70);
      if (this.tutStep === 2) this.advanceTutorial();
      this.emSurge.setParticleTint(this.fam.pal.rim);
      var pt = { x: 0, y: 0, r: 0, p: 0 };
      for (var i = 0; i < fxCount(26); i++) {
        var a = this.rng() * TAU;
        this.project(1.0, a, pt);
        this.emSurge.explode(1, pt.x, pt.y);
      }
      this.flash(0.55);
      this.notify('SURGE • CLEAR', PAL.surge);
    },

    flash: function (v) {
      if (!flashOn()) return;
      this.flashPlate.setAlpha(Math.min(0.85, this.flashPlate.alpha + v * 0.4));
    },

    // ============================================================== step
    step: function (dt) {
      this.time_ += dt;
      this.readInput(dt);

      // Test switches are read every step so the orchestrator can flip them
      // at any point, including before the scene existed.
      this.pollSwitches();

      this.spinAng += this.fam.spin * dt;
      this.tubePulse = Math.max(0, this.tubePulse - dt * 2.4);
      if (this.invuln > 0) this.invuln -= dt;
      if (this.multT > 0) this.multT -= dt;
      if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }

      // claw smoothing, both angles unwrapped so this can never wrap-snap
      this.clawAng += (this.clawTarget - this.clawAng) * Math.min(1, dt * 17);
      if (this.clawFireT > 0) {
        this.clawFireT -= dt;
        if (this.clawFireT <= 0) this.clawAnim = 'idle';
      }

      this.stepDust(dt);
      this.stepTelegraphs(dt);
      this.stepBullets(dt);
      this.stepEnemies(dt);
      this.stepBlockers(dt);
      this.stepPickups(dt);
      this.stepShock(dt);
      this.stepTutorial(dt);
      this.stepTransient(dt);
      this.stepCoach(dt);

      if (this.phase === 'intro') {
        this.phaseT += dt;
        if (this.phaseT > 1.1) { this.phase = 'play'; this.phaseT = 0; }
      } else if (this.phase === 'play') {
        this.stepPlay(dt);
      } else if (this.phase === 'transit') {
        this.phaseT += dt;
        if (this.phaseT > 1.35) this.enterSegment();
      } else if (this.phase === 'boss') {
        this.stepBoss(dt);
      }

    },

    pollSwitches: function () {
      var s = this.dbg;
      if (s.forceTubeFamily && s.forceTubeFamily !== this.famKey) {
        var f = D.familyOf(s.forceTubeFamily);
        if (f.key === s.forceTubeFamily) {
          this.fam = f;
          this.famKey = f.key;
          this.shapeFn = shapeOf(f.shape);
          this.bg.setTexture('bg_' + f.key);
          this.bg.setDisplaySize(this.W, this.H);
          this.retintDust();
        }
      }
      if (s.forceLevel >= 0 && this.mode === 'run') {
        var want = clamp(s.forceLevel | 0, 0, this.run.segs.length - 1);
        if (want !== this.segIndex && this.phase === 'play') {
          this.segIndex = want;
          s.forceLevel = -1;
          this.enterSegment();
        }
      }
      if (s.forceSurgeFull && this.surge < 100) this.addSurge(100);
      if (s.forceBoss && !this.boss.active && this.run && this.run.boss &&
          this.phase === 'play') {
        this.segIndex = this.run.segs.length - 1;
        s.forceBoss = false;
        this.startBoss();
      }
      if (s.forceHazard) {
        var hk = s.forceHazard;
        s.forceHazard = '';
        this.haz.active = false;
        this.armHazard(hk);
      }
    },

    stepPlay: function (dt) {
      this.segTime += dt;
      this.depth += dt * (this.mode === 'sprint' ? 14 : this.run.depthUnit / 12);

      // spawn cadence: the family density curve, tightened by run tier
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnWave();
        var den = this.fam.density;
        var iv = Math.max(den.floor, den.base - den.growth * this.tier);
        if (this.rng() < den.burst) iv *= den.burstMul;
        this.spawnTimer = iv * (0.78 + this.rng() * 0.46);
      }

      // hazard cadence
      this.hazTimer -= dt;
      if (this.hazTimer <= 0 && !this.haz.active) {
        this.armHazard(this.fam.hazard);
        var he = this.fam.hazardEvery;
        this.hazTimer = he[0] + this.rng() * (he[1] - he[0]);
      }
      this.stepHazard(dt);

      // auto fire
      this.updateLock();
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        var cad = clamp(0.225 - this.tier * 0.0045, 0.105, 0.225);
        this.fireTimer = cad;
        this.autoFire();
      }

      if (this.mode === 'sprint') {
        this.sprintLeft -= dt;
        var wantFam = D.SPRINT.cycle[
          Math.floor((D.SPRINT.seconds - this.sprintLeft) / D.SPRINT.swapEvery) %
          D.SPRINT.cycle.length];
        if (wantFam !== this.famKey && !this.dbg.forceTubeFamily) {
          this.applySprintFamily(wantFam);
        }
        this.tier = D.SPRINT.startTier +
          (D.SPRINT.seconds - this.sprintLeft) * D.SPRINT.tierPerSecond;
        this.syncMusic();
        if (this.sprintLeft <= 0) this.finishRun(true);
      } else if (this.segTime >= this.segDur && this.segDur > 0) {
        this.startTransit();
      }
    },

    applySprintFamily: function (key) {
      this.fam = D.familyOf(key);
      this.famKey = this.fam.key;
      this.shapeFn = shapeOf(this.fam.shape);
      this.bg.setTexture('bg_' + this.fam.key);
      this.bg.setDisplaySize(this.W, this.H);
      this.retintDust();
      this.hazTimer = 5;
      this.notify(this.fam.name, this.fam.pal.rim);
      kit.audio.sfx('sfx_transit');
      this.syncMusic();
    },

    startTransit: function () {
      this.phase = 'transit';
      this.phaseT = 0;
      this.clearField(false);
      kit.audio.sfx('sfx_transit');
      kit.juice.shake(6, 260);
      this.flash(0.3);
      if (this.mode === 'run' && this.segIndex + 1 >= this.run.segs.length) {
        this.finishRun(true);
        return;
      }
      this.segIndex++;
      var next = this.run.segs[this.segIndex];
      var nf = D.familyOf(next.fam);
      this.banner('SEGMENT ' + (this.segIndex + 1) + '/' + this.run.segs.length +
        ' • ' + nf.name, '', nf.pal.rim);
    },

    enterSegment: function () {
      this.phase = 'play';
      this.phaseT = 0;
      this.applySegment();
      if (!this.boss.active) {
        this.addSurge(20);
        this.syncMusic();
      }
    },

    clearField: function (keepPickups) {
      var i;
      for (i = 0; i < MAX_ENEMIES; i++) this.enemies[i].active = false;
      for (i = 0; i < MAX_BULLETS; i++) this.bullets[i].active = false;
      for (i = 0; i < MAX_BLOCKERS; i++) this.blockers[i].active = false;
      for (i = 0; i < MAX_TELEGRAPHS; i++) this.telegraphs[i].active = false;
      if (!keepPickups) for (i = 0; i < MAX_PICKUPS; i++) this.pickups[i].active = false;
      this.haz.active = false;
    },

    // ------------------------------------------------------ spawn waves
    // Every spawn is telegraphed: the lane lights from the core to the rim
    // before anything comes down it.
    spawnWave: function () {
      var mix = this.boss.active ? D.BOSS.phases[this.boss.phase].mix : this.fam.mix;
      var count = 1;
      if (this.tier > 5 && this.rng() < 0.28) count = 2;
      if (this.tier > 11 && this.rng() < 0.20) count = 3;
      var baseLane = Math.floor(this.rng() * this.fam.lanes);
      for (var i = 0; i < count; i++) {
        var lane = (baseLane + i * (1 + Math.floor(this.rng() * 3))) % this.fam.lanes;
        var ang = this.laneAngle(lane);
        var type = D.pickWeighted(mix, this.rng());
        this.telegraph(ang, 0.62, 'spawn');
        this.queueSpawn(type, ang, 0.62);
      }
    },

    queueSpawn: function (type, ang, delay) {
      var e = this.spawnEnemy(type, ang, delay, 1);
      if (e) { e.t = 0.02; e.spawnDelay = delay; }
    },

    // ---------------------------------------------------------- hazards
    armHazard: function (kind) {
      var hz = D.hazardOf(kind);
      // Only one hazard formation is ever on the field, so anything the
      // previous one placed is retired here rather than left to leak.
      for (var bi = 0; bi < MAX_BLOCKERS; bi++) {
        if (this.blockers[bi].active) {
          this.blockers[bi].active = false;
          this.blockerView[bi].spr.setVisible(false);
        }
      }
      this.haz.active = true;
      this.haz.kind = kind;
      this.haz.phase = 'warn';
      this.haz.ttl = 1.5;
      this.haz.ang = this.randLaneAngle();
      this.haz.arc = hz.arc;
      this.haz.spin = kind === 'gearsweep' ? 1.05 : (kind === 'pulsegate' ? 0.55 : 0);
      kit.audio.sfx('sfx_warn');
      this.notify('⚠ ' + hz.name, this.fam.pal.hazard);
    },

    stepHazard: function (dt) {
      var h = this.haz;
      if (!h.active) return;
      h.ttl -= dt;
      if (h.phase === 'warn') {
        if (h.ttl <= 0) {
          h.phase = 'live';
          h.ttl = D.hazardOf(h.kind).life;
          this.fireHazard(h.kind);
        }
        return;
      }
      if (h.kind === 'pulsegate' || h.kind === 'gearsweep') {
        h.ang = angWrap(h.ang + h.spin * dt);
        var hit = Math.abs(angDiff(this.clawAng, h.ang)) < h.arc * 0.5;
        if (hit && this.invuln <= 0) this.loseLife('hazard');
        if (this.rng() < dt * 26) {
          var pt = { x: 0, y: 0, r: 0, p: 0 };
          this.project(1.0, h.ang + (this.rng() - 0.5) * h.arc, pt);
          this.emHazard.setParticleTint(this.fam.pal.hazard);
          this.emHazard.explode(1, pt.x, pt.y);
        }
      }
      if (h.ttl <= 0) {
        h.active = false;
        if (h.kind === 'shardlattice') {
          for (var i = 0; i < MAX_BLOCKERS; i++) this.blockers[i].active = false;
        }
      }
    },

    fireHazard: function (kind) {
      var i, ang;
      if (kind === 'sporebloom') {
        var base = Math.floor(this.rng() * this.fam.lanes);
        for (i = 0; i < 5; i++) {
          ang = this.laneAngle(base + i - 2);
          this.telegraph(ang, 0.45, 'spawn');
          this.spawnEnemy(i === 2 ? 'pulsar' : 'crawler', ang, 0.45, i === 2 ? 1.1 : 0.9);
        }
        this.haz.ttl = 0.5;
      } else if (kind === 'shardlattice') {
        var n = 3 + Math.floor(this.rng() * 3);
        var lane0 = Math.floor(this.rng() * this.fam.lanes);
        var placed = 0;
        for (i = 0; i < MAX_BLOCKERS && placed < n; i++) {
          var b = this.blockers[i];
          if (b.active) continue;
          b.active = true;
          b.ang = this.laneAngle(lane0 + placed * 2);
          b.t = 0.46 + this.rng() * 0.18;
          b.hp = 4;
          b.hurt = 0;
          this.blockerView[i].spr.setVisible(true).setTint(this.fam.pal.hazard);
          placed++;
        }
      }
      kit.juice.shake(6, 220);
    },

    // ----------------------------------------------------------- firing
    updateLock: function () {
      var best = -1, bestScore = 1e9;
      for (var i = 0; i < MAX_ENEMIES; i++) {
        var e = this.enemies[i];
        if (!e.active || e.dying || e.spawnDelay > 0) continue;
        var d = Math.abs(angDiff(e.ang, this.clawAng));
        if (d > LOCK_ARC) continue;
        // Prefer the closest to the rim, then the closest in angle.
        var sc = (1 - e.t) * 2.0 + d;
        if (sc < bestScore) { bestScore = sc; best = i; }
      }
      if (best !== this.lockIdx) {
        if (best >= 0 && this.lockT <= 0) kit.audio.sfx('sfx_lock', { volume: 0.5 });
        this.lockIdx = best;
        this.lockT = best >= 0 ? 0.001 : 0;
      }
      if (this.lockIdx >= 0) this.lockT += STEP;
    },

    autoFire: function () {
      var ang = this.clawAng;
      var lock = -1;
      if (this.lockIdx >= 0) {
        var e = this.enemies[this.lockIdx];
        if (e && e.active && !e.dying) {
          ang = this.clawAng + angDiff(e.ang, this.clawAng) * AIM_ASSIST;
          lock = this.lockIdx;
        }
      }
      this.fireBullet(ang, lock);
      this.clawAnim = 'fire';
      this.clawFireT = 0.07;
      kit.audio.sfx('sfx_fire', { volume: 0.45, rate: 0.94 + this.rng() * 0.12 });
    },

    stepBullets: function (dt) {
      for (var i = 0; i < MAX_BULLETS; i++) {
        var b = this.bullets[i];
        if (!b.active) continue;
        // Light homing toward the locked target keeps the aim assist honest
        // without turning shots into seekers.
        if (b.lock >= 0) {
          var tg = this.enemies[b.lock];
          if (tg && tg.active && !tg.dying) {
            b.ang += angDiff(tg.ang, b.ang) * Math.min(1, dt * 3.4);
          } else {
            b.lock = -1;
          }
        }
        b.t -= b.vt * dt;
        var hitSomething = false;

        for (var j = 0; j < MAX_ENEMIES && !hitSomething; j++) {
          var e = this.enemies[j];
          if (!e.active || e.dying || e.spawnDelay > 0) continue;
          var arch = D.enemyOf(e.type);
          if (Math.abs(b.t - e.t) > 0.055) continue;
          if (Math.abs(angDiff(b.ang, e.ang)) > arch.hitArc * e.scale) continue;
          // Shielders eat shots that arrive inside the plated arc.
          if (arch.shieldArc) {
            var facing = angDiff(b.ang, e.ang);
            if (Math.abs(facing) < arch.shieldArc * 0.5 && e.hp > 1) {
              this.onShieldPing(e);
              hitSomething = true;
              break;
            }
          }
          this.damageEnemy(j, 1);
          hitSomething = true;
        }

        if (!hitSomething) {
          for (var k = 0; k < MAX_BLOCKERS; k++) {
            var bl = this.blockers[k];
            if (!bl.active) continue;
            if (Math.abs(b.t - bl.t) > 0.06) continue;
            if (Math.abs(angDiff(b.ang, bl.ang)) > 0.20) continue;
            bl.hp--;
            bl.hurt = 0.14;
            this.hits++;
            kit.audio.sfx('sfx_hit', { volume: 0.5 });
            if (bl.hp <= 0) {
              bl.active = false;
              this.blockerView[k].spr.setVisible(false);
              this.addScore(80, bl.ang, bl.t);
              this.burst(bl.ang, bl.t, 10, this.fam.pal.hazard, true);
            }
            hitSomething = true;
            break;
          }
        }

        if (!hitSomething && this.boss.active && b.t <= 0.52) {
          hitSomething = this.bossBulletHit(b);
        }

        if (hitSomething || b.t < -0.05) {
          b.active = false;
          this.bulletView[i].spr.setVisible(false);
        }
      }
    },

    onShieldPing: function (e) {
      e.hurt = 0.10;
      kit.audio.sfx('sfx_shield', { volume: 0.28, rate: 1.6 });
      this.burst(e.ang, e.t, 3, this.fam.pal.rim, false);
    },

    damageEnemy: function (idx, amount) {
      var e = this.enemies[idx];
      var arch = D.enemyOf(e.type);
      e.hp -= amount;
      e.hurt = 0.14;
      this.hits++;
      this.enemyView[idx].flash = 0.12;
      if (e.hp > 0) {
        kit.audio.sfx('sfx_hit', { volume: 0.42 });
        this.addSurge(1.2);
        return;
      }
      this.killEnemy(idx, false);
    },

    killEnemy: function (idx, bySurge) {
      var e = this.enemies[idx];
      if (!e.active || e.dying) return;
      var arch = D.enemyOf(e.type);
      e.dying = 0.22;
      this.enemyView[idx].deathT = 0.22;

      this.combo++;
      this.comboT = 2.4;
      var mult = (this.multT > 0 ? D.DROP.multFactor : 1) *
        (1 + Math.min(1.5, this.combo * 0.04));
      this.addScore(Math.round(arch.score * (1 + this.tier * 0.06) * mult), e.ang, e.t);
      this.addSurge(bySurge ? 1.5 : 5 + arch.surgeValue * 2);

      var big = arch.hp >= 3;
      this.burst(e.ang, e.t, fxCount(big ? 16 : 9),
        this.fam.pal[arch.tint] || this.fam.pal.enemy, big);
      kit.audio.sfx(big ? 'sfx_killbig' : 'sfx_kill', { volume: big ? 0.65 : 0.45 });
      kit.juice.shake(big ? 5 : 2.5, big ? 160 : 78);
      kit.juice.hitStop(big ? 28 : 14);
      this.flash(big ? 0.22 : 0.08);

      if (arch.splits && !bySurge) {
        for (var s = 0; s < arch.splits; s++) {
          var child = this.spawnEnemy('crawler',
            e.ang + (s - (arch.splits - 1) / 2) * 0.30, 0, 0.72);
          if (child) child.t = e.t;
        }
      }
      this.maybeDrop(e.ang, e.t);
      if (this.tutStep === 1) this.advanceTutorial();
    },

    burst: function (ang, t, n, tint, big) {
      var pt = { x: 0, y: 0, r: 0, p: 0 };
      this.project(t, ang, pt);
      var em = big ? this.emShard : this.emKill;
      em.setParticleTint(tint);
      em.explode(fxCount(n), pt.x, pt.y);
      if (big) {
        this.emKill.setParticleTint(0xffffff);
        this.emKill.explode(fxCount(6), pt.x, pt.y);
      }
    },

    maybeDrop: function (ang, t) {
      var chance = this.dbg.forceGenerousDrops ? D.DROP.generousChance : D.DROP.baseChance;
      this.dropPity++;
      var forced = this.dropPity >= D.DROP.pity;
      if (!forced && this.rng() > chance) return;
      var slot = -1;
      var recycle = -1;
      var lowestTtl = 1e9;
      for (var i = 0; i < MAX_PICKUPS; i++) {
        var existing = this.pickups[i];
        if (!existing.active) { slot = i; break; }
        if (existing.ttl < lowestTtl) {
          lowestTtl = existing.ttl;
          recycle = i;
        }
      }
      // A guaranteed drop is allowed to replace the least valuable, nearly
      // expired pickup. A normal roll keeps its pity debt if the pool is full.
      if (slot < 0 && forced && recycle >= 0 && lowestTtl <= 0.9) slot = recycle;
      if (slot < 0) { this.poolStats.pickups++; return; }
      this.dropPity = 0;
      // Weighted pick, then bias toward what the player is short of. The
      // owner's rule is generous drops, so scarcity always tilts the roll.
      var kind = D.pickWeighted(
        D.PICKUPS.map(function (p) { return [p.key, p.weight]; }), this.rng());
      if (this.lives <= 1 && this.rng() < 0.45) kind = 'life';
      else if (this.surge < 30 && this.rng() < 0.40) kind = 'surge';
      else if (this.shields <= 0 && this.rng() < 0.25) kind = 'shield';
      var p = this.pickups[slot];
      p.active = true;
      p.kind = kind;
      p.ang = ang;
      p.t = Math.max(0.30, t);
      p.ttl = D.DROP.driftSeconds;
      p.age = 0;
      var pd = D.pickupOf(kind);
      this.pickupView[slot].spr.setTexture(pd.glyph).setTint(pd.tint).setVisible(true);
    },

    stepPickups: function (dt) {
      for (var i = 0; i < MAX_PICKUPS; i++) {
        var p = this.pickups[i];
        if (!p.active) continue;
        p.age += dt;
        p.ttl -= dt;
        // Pickups ride out to the rim and then hug it, so a generous drop is
        // never a drop the player cannot reach.
        if (p.t < 0.96) p.t = Math.min(0.96, p.t + dt * 0.24);
        else p.ang = angWrap(p.ang + dt * 0.22);
        if (Math.abs(angDiff(p.ang, this.clawAng)) < 0.30 && p.t > 0.80) {
          this.collect(p.kind, p.ang, p.t);
          p.active = false;
          this.pickupView[i].spr.setVisible(false);
          continue;
        }
        if (p.ttl <= 0) {
          p.active = false;
          this.pickupView[i].spr.setVisible(false);
        }
      }
    },

    collect: function (kind, ang, t) {
      var pd = D.pickupOf(kind);
      var pt = { x: 0, y: 0, r: 0, p: 0 };
      this.project(t, ang, pt);
      this.emPickup.setParticleTint(pd.tint);
      this.emPickup.explode(fxCount(12), pt.x, pt.y);
      if (kind === 'surge') {
        this.addSurge(D.DROP.surgeGain);
        kit.audio.sfx('sfx_pickup');
      } else if (kind === 'mult') {
        this.multT = Math.max(this.multT, D.DROP.multSeconds);
        kit.audio.sfx('sfx_pickup', { rate: 1.15 });
      } else if (kind === 'shield') {
        this.shields = Math.min(D.DROP.shieldMax, this.shields + 1);
        kit.audio.sfx('sfx_shield');
      } else {
        this.lives = Math.min(D.DROP.lifeMax, this.lives + 1);
        kit.audio.sfx('sfx_life');
      }
      var pickupText = kind === 'surge' ? 'SURGE +50' :
        (kind === 'mult' ? '×2 • 9S' : (kind === 'shield' ? 'SHIELD' : '+CLAW'));
      this.notify(pickupText, pd.tint);
      kit.juice.shake(3, 120);
    },

    addSurge: function (n) {
      var was = this.surge;
      this.surge = clamp(this.surge + n, 0, 100);
      if (was < 100 && this.surge >= 100) {
        this.surgeArmed = true;
        kit.audio.sfx('sfx_surge_ready');
        if (this.tutStep === 2) this.coach(D.TUTORIAL[2].text);
      }
    },

    addScore: function (n, ang, t) {
      this.score += n;
      // The score HUD is the persistent score feedback; floating numbers
      // multiplied the text on screen during every kill.
    },

    // ---------------------------------------------------------- enemies
    stepEnemies: function (dt) {
      var famSpeed = this.fam.speed;
      var tierSpeed = 1 + this.tier * 0.030;
      for (var i = 0; i < MAX_ENEMIES; i++) {
        var e = this.enemies[i];
        if (!e.active) continue;
        if (e.dying > 0) {
          e.dying -= dt;
          if (e.dying <= 0) {
            e.dying = 0;
            e.active = false;
            this.enemyView[i].spr.setVisible(false);
          }
          continue;
        }
        if (e.spawnDelay > 0) { e.spawnDelay -= dt; continue; }
        var arch = D.enemyOf(e.type);
        e.age += dt;
        if (e.hurt > 0) e.hurt -= dt;
        e.ang = angWrap(e.ang + e.drift * dt);

        if (arch.parks && e.t >= arch.parks) {
          // Zappers park just short of the rim and sweep sideways: a lane
          // threat you slide away from rather than shoot down head on.
          e.t = arch.parks + Math.sin(e.age * 2.2 + e.seed) * 0.035;
          e.ang = angWrap(e.ang + arch.sweep * dt * (0.6 + this.tier * 0.02) *
            (Math.sin(e.seed) > 0 ? 1 : -1));
          if (Math.abs(angDiff(e.ang, this.clawAng)) < 0.24 && this.invuln <= 0) {
            this.loseLife('zapper');
            this.burst(e.ang, e.t, fxCount(10), this.fam.pal.hazard, false);
          }
        } else {
          e.t += arch.rate * famSpeed * tierSpeed * dt;
        }

        if (arch.weave) {
          e.ang = angWrap(e.ang + Math.sin(e.age * 2.6 + e.seed) * dt * arch.weave * 0.45);
        }

        if (e.t >= BREACH_T) {
          this.burst(e.ang, 1.0, fxCount(8), PAL.danger, false);
          e.active = false;
          this.enemyView[i].spr.setVisible(false);
          this.loseLife('breach');
        }
      }
    },

    stepBlockers: function (dt) {
      for (var i = 0; i < MAX_BLOCKERS; i++) {
        var b = this.blockers[i];
        if (!b.active) continue;
        if (b.hurt > 0) b.hurt -= dt;
        b.ang = angWrap(b.ang + this.fam.spin * 0.4 * dt);
      }
    },

    stepTelegraphs: function (dt) {
      for (var i = 0; i < MAX_TELEGRAPHS; i++) {
        var t = this.telegraphs[i];
        if (!t.active) continue;
        t.ttl -= dt;
        if (t.ttl <= 0) t.active = false;
      }
    },

    stepShock: function (dt) {
      if (this.shockT < 0) return;
      var prev = this.shockT;
      this.shockT -= dt * 2.0;
      var i;
      for (i = 0; i < MAX_ENEMIES; i++) {
        var e = this.enemies[i];
        if (!e.active || e.spawnDelay > 0) continue;
        if (e.t <= prev && e.t >= this.shockT) this.killEnemy(i, true);
      }
      for (i = 0; i < MAX_BLOCKERS; i++) {
        var b = this.blockers[i];
        if (b.active && b.t <= prev && b.t >= this.shockT) {
          b.active = false;
          this.blockerView[i].spr.setVisible(false);
          this.addScore(80, b.ang, b.t);
        }
      }
      if (this.haz.active && this.haz.phase === 'live' && this.shockT < 0.8) {
        this.haz.active = false;
      }
      if (this.boss.active && this.shockT <= 0.5 && prev > 0.5) {
        this.damageBoss(4);
      }
      if (this.shockT < -0.1) this.shockT = -1;
    },

    stepDust: function (dt) {
      for (var i = 0; i < MAX_DUST; i++) {
        var d = this.dust[i];
        d.t += d.spd * dt * (this.phase === 'transit' ? 4.2 : 1);
        if (d.t > 1.12) { d.t -= 1.12; d.ang = this.rng() * TAU; }
      }
    },

    // -------------------------------------------------------- life loss
    loseLife: function (reason) {
      if (this.invuln > 0 || this.phase === 'lost' || this.phase === 'won') return;
      if (this.dbg.forceInvincible) return;
      if (this.shields > 0) {
        this.shields--;
        this.invuln = 0.9;
        kit.audio.sfx('sfx_shield');
        kit.juice.shake(6, 200);
        this.notify('SHIELD • BLOCKED', 0x7cf4ff);
        return;
      }
      this.lives--;
      this.invuln = INVULN;
      this.combo = 0;
      this.surge = Math.max(0, this.surge - 15);
      kit.audio.sfx('sfx_breach');
      kit.juice.shake(16, 420);
      kit.juice.hitStop(80);
      this.flash(0.5);
      if (flashOn()) this.vignette.setAlpha(0.42);
      var pt = { x: 0, y: 0, r: 0, p: 0 };
      this.project(1.0, this.clawAng, pt);
      this.emBreach.setParticleTint(PAL.danger);
      this.emBreach.explode(fxCount(14), pt.x, pt.y);
      if (this.lives <= 0) this.finishRun(false);
      else this.notify('CLAW -1 • ' + this.lives + ' LEFT', PAL.danger);
    },

    // ============================================================== boss
    startBoss: function () {
      var b = this.boss;
      b.active = true;
      b.phase = 0;
      b.phaseT = 0;
      b.maxCoreHp = D.BOSS.coreHp;
      b.coreHp = D.BOSS.coreHp;
      b.spawnT = 2.0;
      b.beamT = 3.0;
      b.spin = D.BOSS.phases[0].spin;
      b.hurt = 0;
      b.intro = 1.6;
      for (var i = 0; i < b.plates.length; i++) {
        b.plates[i].alive = true;
        b.plates[i].hp = D.BOSS.plateHp;
        b.plates[i].ang = i * TAU / b.plates.length;
        this.bossPlateView[i].spr.setVisible(true);
      }
      for (var j = 0; j < b.beams.length; j++) b.beams[j].active = false;
      this.bossCoreSpr.setVisible(true);
      this.hud.bossBox.setVisible(true);
      this.phase = 'boss';
      this.clearField(true);
      this.syncMusic();
      kit.audio.sfx('sfx_boss');
      this.banner(D.BOSS.name, D.BOSS.phases[0].sub, 0xff8f5a);
      kit.juice.shake(10, 420);
    },

    stepBoss: function (dt) {
      var b = this.boss;
      if (!b.active) { this.phase = 'play'; return; }
      var ph = D.BOSS.phases[clamp(b.phase, 0, D.BOSS.phases.length - 1)] || D.BOSS.phases[0];
      b.phaseT += dt;
      if (b.intro > 0) { b.intro -= dt; return; }
      if (b.hurt > 0) b.hurt -= dt;
      b.spin = ph.spin;
      this.depth += dt * 8;

      for (var i = 0; i < b.plates.length; i++) {
        b.plates[i].ang = angWrap(b.plates[i].ang + b.spin * dt);
      }

      // adds
      b.spawnT -= dt;
      if (b.spawnT <= 0) {
        b.spawnT = ph.spawnEvery;
        var ang = this.randLaneAngle();
        this.telegraph(ang, 0.55, 'spawn');
        this.queueSpawn(D.pickWeighted(ph.mix, this.rng()), ang, 0.55);
      }

      // lane beams, telegraphed then live
      if (ph.beamEvery > 0) {
        b.beamT -= dt;
        if (b.beamT <= 0) {
          b.beamT = ph.beamEvery;
          var lanes = ph.beamLanes || 2;
          for (var k = 0; k < lanes; k++) {
            for (var s = 0; s < b.beams.length; s++) {
              if (!b.beams[s].active) {
                b.beams[s].active = true;
                b.beams[s].ang = this.randLaneAngle();
                b.beams[s].warn = 0.85;
                b.beams[s].ttl = 1.5;
                break;
              }
            }
          }
          kit.audio.sfx('sfx_warn', { volume: 0.6 });
        }
      }
      for (var m = 0; m < b.beams.length; m++) {
        var bm = b.beams[m];
        if (!bm.active) continue;
        if (bm.warn > 0) { bm.warn -= dt; continue; }
        bm.ttl -= dt;
        if (Math.abs(angDiff(bm.ang, this.clawAng)) < 0.20 && this.invuln <= 0) {
          this.loseLife('beam');
        }
        if (bm.ttl <= 0) bm.active = false;
      }

      // shared play systems still run during the fight
      this.updateLock();
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = clamp(0.20 - this.tier * 0.004, 0.10, 0.20);
        this.autoFire();
      }
    },

    bossBulletHit: function (b) {
      var bs = this.boss;
      if (!bs.active || bs.intro > 0) return false;
      if (bs.phase < 2) {
        for (var i = 0; i < bs.plates.length; i++) {
          var pl = bs.plates[i];
          if (!pl.alive) continue;
          if (Math.abs(angDiff(b.ang, pl.ang)) > 0.42) continue;
          if (Math.abs(b.t - 0.46) > 0.10) continue;
          pl.hp--;
          this.hits++;
          kit.audio.sfx('sfx_hit', { volume: 0.55 });
          this.burst(pl.ang, 0.46, fxCount(5), 0xffd36e, false);
          if (pl.hp <= 0) {
            pl.alive = false;
            this.bossPlateView[i].spr.setVisible(false);
            this.addScore(1200, pl.ang, 0.46);
            this.burst(pl.ang, 0.46, fxCount(18), 0xffd36e, true);
            kit.juice.shake(9, 300);
            kit.audio.sfx('sfx_killbig');
            this.checkBossPhase();
          }
          return true;
        }
        return false;
      }
      if (Math.abs(b.t - 0.22) > 0.18) return false;
      this.damageBoss(1);
      return true;
    },

    damageBoss: function (n) {
      var bs = this.boss;
      if (!bs.active) return;
      if (bs.phase < 2) {
        // Before the core is open, SURGE strips plate armour instead.
        for (var i = 0; i < bs.plates.length; i++) {
          if (bs.plates[i].alive) {
            bs.plates[i].hp -= n;
            if (bs.plates[i].hp <= 0) {
              bs.plates[i].alive = false;
              this.bossPlateView[i].spr.setVisible(false);
              this.addScore(1200, bs.plates[i].ang, 0.46);
            }
          }
        }
        this.checkBossPhase();
        return;
      }
      bs.coreHp -= n;
      bs.hurt = 0.16;
      this.hits += 0;
      kit.audio.sfx('sfx_hit', { volume: 0.6 });
      this.burst(this.clawAng, 0.22, fxCount(6), 0xffb07a, false);
      if (bs.coreHp <= 0) this.defeatBoss();
    },

    checkBossPhase: function () {
      var bs = this.boss;
      var alive = 0;
      for (var i = 0; i < bs.plates.length; i++) if (bs.plates[i].alive) alive++;
      if (alive === 0 && bs.phase < 2) {
        bs.phase = 2;
        bs.phaseT = 0;
        kit.audio.sfx('sfx_boss');
        this.notify(D.BOSS.phases[2].title, 0xffd36e);
        kit.juice.shake(12, 400);
        this.addSurge(50);
      } else if (bs.phase === 0 && alive <= 2) {
        bs.phase = 1;
        bs.phaseT = 0;
        kit.audio.sfx('sfx_boss');
        this.notify(D.BOSS.phases[1].title, 0xff8f5a);
        kit.juice.shake(10, 340);
        this.addSurge(35);
      } else if (bs.phase === 1 && alive === 0) {
        bs.phase = 2;
        bs.phaseT = 0;
        kit.audio.sfx('sfx_boss');
        this.notify(D.BOSS.phases[2].title, 0xffd36e);
        kit.juice.shake(12, 400);
        this.addSurge(50);
      }
    },

    defeatBoss: function () {
      var bs = this.boss;
      bs.active = false;
      this.bossCoreSpr.setVisible(false);
      this.hud.bossBox.setVisible(false);
      this.addScore(D.BOSS.score, this.clawAng, 0.4);
      kit.juice.shake(20, 700);
      kit.juice.hitStop(110);
      this.flash(0.8);
      this.emShard.setParticleTint(0xffd36e);
      this.emShard.explode(fxCount(40), this.cx, this.cy);
      kit.audio.sfx('sfx_killbig');
      this.finishRun(true);
    },

    // =========================================================== results
    finishRun: function (won) {
      if (this.phase === 'lost' || this.phase === 'won') return;
      this.phase = won ? 'won' : 'lost';
      this.clearField(false);
      Dom.setControlsVisible(false);
      this.hud.surgeG.clear();
      this.hud.bossBox.setVisible(false);
      this.hud.buffT.setVisible(false);
      this.reticle.setVisible(false);
      this.shock.setVisible(false);
      this.clearTransient();
      this.coachOut();
      kit.audio.stopMusic(500);
      kit.audio.sfx(won ? 'sfx_medal' : 'sfx_over');

      var acc = this.shots > 0 ? clamp(this.hits / this.shots, 0, 1) : 0;
      var medal = 'none';
      var newBest = false;

      if (this.mode === 'run') {
        var rate = D.rating(this.score, this.depth, acc);
        medal = won ? D.medalFor(this.run.key, this.score, this.depth, acc) : 'none';
        var prev = profile.medals[this.run.key] || 'none';
        if (D.medalRank(medal) > D.medalRank(prev)) profile.medals[this.run.key] = medal;
        if (rate > (profile.best[this.run.key] || 0)) profile.best[this.run.key] = rate;
        if (this.score > (profile.bestScore[this.run.key] || 0)) {
          profile.bestScore[this.run.key] = this.score;
          newBest = true;
        }
        if (won) {
          var idx = D.runIndexOf(this.run.key);
          if (idx + 1 >= profile.unlocked) {
            profile.unlocked = Math.min(D.RUNS.length, idx + 2);
          }
        }
      } else {
        if (this.score > profile.sprintBest) { profile.sprintBest = this.score; newBest = true; }
      }
      persist();
      syncProfileDebug();
      this.showResult(won, medal, acc, newBest);
      this.pushDebug();
    },

    showResult: function (won, medal, acc, newBest) {
      var h = this.hud;
      var self = this;
      var W = this.W, H = this.H;
      h.resultBtns.removeAll(true);
      this.resultButtons = [];
      this.resultFocus = 0;
      this.resultKeyEdge = {
        up: kit.input.keyDown('ArrowLeft') || kit.input.keyDown('ArrowUp'),
        down: kit.input.keyDown('ArrowRight') || kit.input.keyDown('ArrowDown'),
        enter: kit.input.keyDown('Enter') || kit.input.keyDown('Space')
      };
      h.result.setVisible(true);
      h.resultDim.setPosition(0, 0).setSize(W, H);

      var cw = Math.min(W * 0.86, 400);
      var chh = 300;
      h.resultCard.setPosition(W / 2, H * 0.44).setSize(cw, chh);
      h.resultT1.setPosition(W / 2, H * 0.44 - chh / 2 + 40);
      h.resultMedal.setPosition(W / 2, H * 0.44 - chh / 2 + 78);
      h.resultBody.setPosition(W / 2, H * 0.44 - chh / 2 + 152);

      var title = won
        ? (this.mode === 'sprint' ? 'TIME UP' : 'RUN COMPLETE')
        : 'RIM BREACHED';
      setTextIfChanged(h.resultT1, title);
      h.resultT1.setColor(won ? '#eafeff' : PAL.dangerCss);

      if (this.mode === 'run') {
        setTextIfChanged(h.resultMedal, D.MEDAL.label[medal]);
        h.resultMedal.setColor(hex(D.MEDAL.tint[medal]));
      } else {
        setTextIfChanged(h.resultMedal, newBest ? 'NEW BEST' : 'SCORE ATTACK');
        h.resultMedal.setColor(newBest ? PAL.goldCss : '#9fc6d6');
      }

      var body =
        'SCORE  ' + commas(this.score) + '\n' +
        'DEPTH  ' + commas(this.depth) + ' M\n' +
        'ACCURACY  ' + Math.round(acc * 100) + '%\n' +
        'SEGMENT  ' + (this.segIndex + 1) +
          (this.mode === 'run' ? ' OF ' + this.run.segs.length : '') + '\n' +
        (this.mode === 'run'
          ? 'RATING  ' + commas(D.rating(this.score, this.depth, acc))
          : 'BEST  ' + commas(profile.sprintBest));
      setTextIfChanged(h.resultBody, body);

      var by = H * 0.44 + chh / 2 - 46;
      var mk = function (x, w, text, tint, fn) {
        var c = self.add.container(x, by);
        var bg = self.add.rectangle(0, 0, w, 46, 0x0d2438, 0.95)
          .setStrokeStyle(1.4, tint, 0.75);
        var t = label(self, 0, 0, text, 12, '#e9feff', 'bold').setOrigin(0.5);
        c.add([bg, t]);
        c.resultOnTap = fn;
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerup', function () { kit.audio.sfx('sfx_ui'); fn(); });
        h.resultBtns.add(c);
        self.resultButtons.push(c);
      };
      var bw = (cw - 44) / 2;
      mk(W / 2 - bw / 2 - 6, bw, 'RETRY', 0x7cf4ff, function () {
        h.result.setVisible(false);
        kit.restart();
      });
      mk(W / 2 + bw / 2 + 6, bw, 'MENU', 0x8ff5d2, function () {
        h.result.setVisible(false);
        self.scene.start('Title');
      });
      this.paintResultFocus();
    },

    paintResultFocus: function () {
      for (var i = 0; i < this.resultButtons.length; i++) {
        var c = this.resultButtons[i];
        var bg = c.list[0];
        var focused = i === this.resultFocus;
        bg.setStrokeStyle(focused ? 2.5 : 1.4,
          focused ? 0xffffff : (i === 0 ? 0x7cf4ff : 0x8ff5d2),
          focused ? 0.98 : 0.75);
      }
    },

    readResultInput: function () {
      if (this.phase !== 'lost' && this.phase !== 'won') return;
      if (!this.resultButtons.length) return;
      var up = kit.input.keyDown('ArrowLeft') || kit.input.keyDown('ArrowUp');
      var down = kit.input.keyDown('ArrowRight') || kit.input.keyDown('ArrowDown');
      var enter = kit.input.keyDown('Enter') || kit.input.keyDown('Space');
      if (up && !this.resultKeyEdge.up) {
        this.resultFocus = (this.resultFocus + this.resultButtons.length - 1) % this.resultButtons.length;
        this.paintResultFocus();
      }
      if (down && !this.resultKeyEdge.down) {
        this.resultFocus = (this.resultFocus + 1) % this.resultButtons.length;
        this.paintResultFocus();
      }
      if (enter && !this.resultKeyEdge.enter) {
        var selected = this.resultButtons[this.resultFocus];
        if (selected && selected.resultOnTap) selected.resultOnTap();
      }
      this.resultKeyEdge.up = up;
      this.resultKeyEdge.down = down;
      this.resultKeyEdge.enter = enter;
    },

    // ========================================================== tutorial
    stepTutorial: function (dt) {
      if (this.tutStep < 0) return;
      this.tutT += dt;
      var stepDef = D.TUTORIAL[this.tutStep];
      if (!stepDef) { this.tutStep = -1; return; }
      if (this.tutT < 0.05) this.coach(stepDef.text);
      // Each prompt waits for the action it teaches. A timer may keep the
      // copy visible, but it must never award tutorial completion by itself.
      if (this.tutStep === 0 && this.tutMoved > 1.4) this.advanceTutorial();
    },
    advanceTutorial: function () {
      if (this.tutStep < 0) return;
      this.tutStep++;
      this.tutT = 0;
      if (this.tutStep >= D.TUTORIAL.length) {
        this.tutStep = -1;
        this.coachOut();
        profile.tutorialDone = true;
        persist();
        return;
      }
      this.coach(D.TUTORIAL[this.tutStep].text);
    },

    // ============================================================= paint
    // Nothing here writes to a sim record. Every per entity render value
    // lives on the matching view record.
    paint: function (vdt, alpha) {
      var i;
      this.metrics();
      var pt = this._pa || (this._pa = { x: 0, y: 0, r: 0, p: 0 });
      var pt2 = this._pb || (this._pb = { x: 0, y: 0, r: 0, p: 0 });
      var pal = this.fam.pal;

      // ---- tube
      var g = this.gTube;
      g.clear();
      // Six stroked rings is the readable floor; the family ring count
      // only ever raises the DENSITY of the far end, never the draw cost.
      var rings = Math.min(7, this.fam.rings);
      var segsN = shapeSegments(this.fam.shape);
      for (i = 0; i < rings; i++) {
        // p = t^1.85, so evenly spaced t values bunch every ring against the
        // rim. Spacing on the inverse curve puts them evenly on screen.
        var rt = 0.10 + Math.pow(i / (rings - 1), 0.56) * 0.92;
        var a0 = (0.10 + 0.55 * (i / (rings - 1)));
        g.lineStyle(i === rings - 1 ? 2.4 : 1.2, i === rings - 1 ? pal.rim : pal.glow,
          i === rings - 1 ? 0.95 : a0 * 0.55);
        g.beginPath();
        for (var s = 0; s <= segsN; s++) {
          this.project(rt, s / segsN * TAU, pt);
          if (s === 0) g.moveTo(pt.x, pt.y); else g.lineTo(pt.x, pt.y);
        }
        g.strokePath();
      }
      // lane spokes
      g.lineStyle(1, pal.spoke, 0.42);
      for (var ln = 0; ln < this.fam.lanes; ln++) {
        var la = this.laneAngle(ln);
        g.beginPath();
        for (var q = 0; q <= 5; q++) {
          this.project(0.10 + q / 5 * 0.92, la, pt);
          if (q === 0) g.moveTo(pt.x, pt.y); else g.lineTo(pt.x, pt.y);
        }
        g.strokePath();
      }
      // core
      var corePulse = 1 + Math.sin(this.time_ * 2.1) * 0.12 + this.tubePulse * 0.5;
      g.fillStyle(pal.core, 0.16);
      g.fillEllipse(this.cx, this.cy, this.R * 0.26 * corePulse, this.R * 0.20 * corePulse);
      g.lineStyle(1.4, pal.core, 0.7);
      g.strokeEllipse(this.cx, this.cy, this.R * 0.19 * corePulse, this.R * 0.15 * corePulse);

      // ---- dust parallax
      for (i = 0; i < MAX_DUST; i++) {
        var d = this.dust[i];
        var dv = this.dustView[i].spr;
        this.project(d.t, d.ang, pt);
        dv.setPosition(pt.x, pt.y);
        var ds = 0.06 + pt.p * (0.10 + d.layer * 0.06);
        dv.setScale(ds);
        dv.setAlpha(clamp(pt.p * (0.30 + d.layer * 0.18), 0, 0.7));
      }

      // ---- telegraphs, drawn under the entities but over the tube
      var fg = this.gFx;
      fg.clear();
      for (i = 0; i < MAX_TELEGRAPHS; i++) {
        var tg = this.telegraphs[i];
        if (!tg.active) continue;
        var u = 1 - tg.ttl / tg.life;
        var pulse = 0.35 + 0.65 * Math.abs(Math.sin(u * Math.PI * 3));
        fg.lineStyle(2.6, pal.hazard, 0.30 + pulse * 0.55);
        fg.beginPath();
        for (var tq = 0; tq <= 10; tq++) {
          this.project(0.08 + tq / 10 * 0.96, tg.ang, pt);
          if (tq === 0) fg.moveTo(pt.x, pt.y); else fg.lineTo(pt.x, pt.y);
        }
        fg.strokePath();
        // chevron running down the lane toward the rim
        this.project(0.10 + u * 0.90, tg.ang, pt);
        fg.fillStyle(pal.hazard, 0.85);
        fg.fillCircle(pt.x, pt.y, 3.4);
      }

      // ---- hazard overlays
      var hz = this.haz;
      if (hz.active) {
        var live = hz.phase === 'live';
        if (hz.kind === 'pulsegate' || hz.kind === 'gearsweep') {
          var alphaH = live ? 0.85 : 0.30 + 0.45 * Math.abs(Math.sin(this.time_ * 9));
          fg.lineStyle(hz.kind === 'gearsweep' ? 8 : 5, pal.hazard, alphaH);
          fg.beginPath();
          var steps = 14;
          for (var hstep = 0; hstep <= steps; hstep++) {
            var ha = hz.ang - hz.arc / 2 + hz.arc * (hstep / steps);
            this.project(hz.kind === 'gearsweep' ? 0.99 : 1.0, ha, pt);
            if (hstep === 0) fg.moveTo(pt.x, pt.y); else fg.lineTo(pt.x, pt.y);
          }
          fg.strokePath();
          if (hz.kind === 'gearsweep') {
            this.project(0.0, hz.ang, pt);
            this.project(0.99, hz.ang, pt2);
            fg.lineStyle(3, pal.hazard, alphaH * 0.7);
            fg.lineBetween(pt.x, pt.y, pt2.x, pt2.y);
          }
        }
      }

      // ---- boss beams
      if (this.boss.active) {
        for (i = 0; i < this.boss.beams.length; i++) {
          var bm = this.boss.beams[i];
          if (!bm.active) continue;
          var warn = bm.warn > 0;
          fg.lineStyle(warn ? 2 : 9, warn ? 0xffd36e : 0xff6a5a,
            warn ? 0.35 + 0.5 * Math.abs(Math.sin(this.time_ * 14)) : 0.85);
          fg.beginPath();
          for (var bq = 0; bq <= 10; bq++) {
            this.project(0.05 + bq / 10 * 0.98, bm.ang, pt);
            if (bq === 0) fg.moveTo(pt.x, pt.y); else fg.lineTo(pt.x, pt.y);
          }
          fg.strokePath();
        }
      }

      // ---- entities
      for (i = 0; i < MAX_ENEMIES; i++) {
        var e = this.enemies[i];
        var ev = this.enemyView[i];
        if (!e.active) {
          if (ev.spr.visible) ev.spr.setVisible(false);
          continue;
        }
        this.project(e.t, e.ang, pt);
        var state = e.dying > 0 ? 'death' : e.spawnDelay > 0 ? 'telegraph' :
          (e.hurt > 0 ? 'hurt' : 'idle');
        var stateKey = 'en_' + this.fam.key + '_' + e.type + '_' + state;
        if (!this.textures.exists(stateKey)) stateKey = 'en_neongrid_crawler_' + state;
        if (ev.texKey !== stateKey) {
          ev.texKey = stateKey;
          ev.spr.setTexture(stateKey);
        }
        var deathProgress = e.dying > 0 ? 1 - e.dying / 0.22 : 0;
        var sc = (0.10 + pt.p * 0.62) * e.scale *
          (state === 'death' ? 1 + deathProgress * 0.72 :
            (state === 'telegraph' ? 0.92 + Math.sin(this.time_ * 18) * 0.06 : 1));
        ev.spr.setVisible(true);
        ev.spr.setPosition(pt.x, pt.y);
        ev.spr.setScale(sc);
        ev.spr.setRotation(Math.atan2(pt.y - this.cy, pt.x - this.cx) + Math.PI / 2 +
          ev.spin * this.time_ * 0.8);
        // Tint is only touched when the hurt state actually flips: calling
        // setTintFill/clearTint on every sprite every frame is pure cost.
        var wantHurt = state === 'hurt';
        if (wantHurt !== ev.hurtTint) {
          ev.hurtTint = wantHurt;
          if (wantHurt) ev.spr.setTintFill(0xffffff); else ev.spr.clearTint();
        }
        ev.spr.setAlpha(clamp(0.25 + pt.p * 1.1, 0, 1) *
          (state === 'death' ? 1 - deathProgress * 0.72 :
            (state === 'telegraph' ? 0.72 : 1)));
      }

      for (i = 0; i < MAX_BULLETS; i++) {
        var b = this.bullets[i];
        var bv = this.bulletView[i];
        if (!b.active) { if (bv.spr.visible) bv.spr.setVisible(false); continue; }
        this.project(b.t, b.ang, pt);
        bv.spr.setVisible(true).setPosition(pt.x, pt.y);
        bv.spr.setRotation(Math.atan2(this.cy - pt.y, this.cx - pt.x) + Math.PI / 2);
        bv.spr.setScale(0.35 + pt.p * 0.6);
        bv.spr.setTint(pal.rim);
        bv.spr.setAlpha(0.55 + pt.p * 0.45);
      }

      for (i = 0; i < MAX_PICKUPS; i++) {
        var pk = this.pickups[i];
        var pv = this.pickupView[i];
        if (!pk.active) { if (pv.spr.visible) pv.spr.setVisible(false); continue; }
        this.project(pk.t, pk.ang, pt);
        pv.spr.setVisible(true).setPosition(pt.x, pt.y);
        pv.spr.setScale((0.35 + pt.p * 0.55) * (1 + Math.sin(this.time_ * 6 + i) * 0.08));
        // Blink out over the last second so an expiring drop reads.
        pv.spr.setAlpha(pk.ttl < 1.2 ? (Math.sin(this.time_ * 18) > 0 ? 0.35 : 0.95) : 1);
      }

      for (i = 0; i < MAX_BLOCKERS; i++) {
        var bl = this.blockers[i];
        var blv = this.blockerView[i];
        if (!bl.active) { if (blv.spr.visible) blv.spr.setVisible(false); continue; }
        this.project(bl.t, bl.ang, pt);
        blv.spr.setVisible(true).setPosition(pt.x, pt.y);
        blv.spr.setScale((0.9 + pt.p * 1.6) * (bl.hurt > 0 ? 1.2 : 1));
        blv.spr.setRotation(this.time_ * 0.8 + bl.ang);
        blv.spr.setAlpha(0.7 + 0.3 * (bl.hp / 4));
      }

      // ---- boss art
      if (this.boss.active) {
        var bs = this.boss;
        var coreScale = 0.6 + (bs.phase === 2 ? 0.55 : 0.2) +
          Math.sin(this.time_ * 2.4) * 0.06 + (bs.hurt > 0 ? 0.16 : 0);
        this.bossCoreSpr.setVisible(true)
          .setPosition(this.cx, this.cy)
          .setScale(this.R / 160 * 2.2 * coreScale)
          .setAlpha(0.75 + Math.sin(this.time_ * 3) * 0.12);
        for (i = 0; i < bs.plates.length; i++) {
          var pl = bs.plates[i];
          var pvw = this.bossPlateView[i];
          if (!pl.alive) { if (pvw.spr.visible) pvw.spr.setVisible(false); continue; }
          this.project(0.46, pl.ang, pt);
          pvw.spr.setVisible(true).setPosition(pt.x, pt.y)
            .setScale(0.30 + pt.p * 0.55)
            .setRotation(Math.atan2(pt.y - this.cy, pt.x - this.cx) + Math.PI / 2);
          pvw.spr.setAlpha(0.55 + 0.45 * (pl.hp / D.BOSS.plateHp));
        }
      }

      // ---- claw
      this.project(CLAW_T, this.clawAng, pt);
      var wantTex = 'claw_' + this.clawAnim;
      if (this.surge >= 100 && this.clawAnim === 'idle') wantTex = 'claw_charge';
      if (this.clawSpr.texture.key !== wantTex) this.clawSpr.setTexture(wantTex);
      this.clawSpr.setPosition(pt.x, pt.y);
      this.clawSpr.setRotation(Math.atan2(pt.y - this.cy, pt.x - this.cx) - Math.PI / 2);
      this.clawSpr.setScale(clamp(this.R / 285, 0.42, 0.82));
      this.clawSpr.setAlpha(this.invuln > 0 ?
        (Math.sin(this.time_ * 26) > 0 ? 0.35 : 1) : 1);

      // shield rings around the claw
      if (this.shields > 0) {
        for (i = 0; i < this.shields; i++) {
          fg.lineStyle(1.6, 0x7cf4ff, 0.55 - i * 0.12);
          fg.strokeCircle(pt.x, pt.y, this.R * (0.10 + i * 0.035) +
            Math.sin(this.time_ * 4 + i) * 1.5);
        }
      }

      // ---- lock reticle
      if (this.lockIdx >= 0 && this.enemies[this.lockIdx].active &&
          !this.enemies[this.lockIdx].spawnDelay) {
        var le = this.enemies[this.lockIdx];
        this.project(le.t, le.ang, pt2);
        this.reticle.setVisible(true).setPosition(pt2.x, pt2.y)
          .setScale((0.25 + pt2.p * 0.55) * (1 + Math.sin(this.time_ * 12) * 0.06))
          .setRotation(this.time_ * 1.3)
          .setAlpha(clamp(0.35 + this.lockT * 3, 0, 0.95));
        // tracer from the claw to the lock so the aim assist is visible
        fg.lineStyle(1, 0xffd36e, 0.22);
        fg.lineBetween(pt.x, pt.y, pt2.x, pt2.y);
      } else if (this.reticle.visible) {
        this.reticle.setVisible(false);
      }

      // ---- surge shockwave
      if (this.shockT >= 0) {
        this.project(clamp(this.shockT, 0, 1.1), this.clawAng, pt2);
        var rr = Math.max(4, pt2.r);
        this.shock.setVisible(true).setPosition(this.cx, this.cy + pt2.p * this.drop)
          .setScale(rr / 56, rr / 56 * this.fam.squash)
          .setAlpha(clamp(this.shockT, 0, 1) * 0.9)
          .setTint(PAL.surge);
      } else if (this.shock.visible) {
        this.shock.setVisible(false);
      }

      // ---- plates
      if (this.flashPlate.alpha > 0) {
        this.flashPlate.setAlpha(Math.max(0, this.flashPlate.alpha - vdt * 2.6));
      }
      if (this.vignette.alpha > 0) {
        this.vignette.setAlpha(Math.max(0, this.vignette.alpha - vdt * 1.1));
      }

      this.paintHud();
      // The debug view is refreshed once per painted frame. Running it per
      // sim step meant up to five full sweeps of the pools per frame for a
      // view nothing in the game reads.
      this.pushDebug();
    },

    paintHud: function () {
      var h = this.hud, c = this.hudCache;
      if (this.score !== c.score) {
        c.score = this.score;
        setTextIfChanged(h.scoreT, pad(this.score, 6));
      }
      if (this.lives !== c.lives) {
        c.lives = this.lives;
        var s = '';
        for (var i = 0; i < Math.min(6, this.lives); i++) s += '\u25cf ';
        setTextIfChanged(h.livesT, s || '\u25cb');
      }
      var dm = Math.round(this.depth / 10) * 10;
      if (dm !== c.depth) {
        c.depth = dm;
        setTextIfChanged(h.depthT, commas(dm) + ' M');
      }
      var segLabel = this.mode === 'sprint'
        ? '◷ ' + Math.max(0, Math.ceil(this.sprintLeft)) + 's'
        : '◇ ' + (this.segIndex + 1) + '/' + this.run.segs.length;
      if (segLabel !== c.seg) {
        c.seg = segLabel;
        setTextIfChanged(h.segT, segLabel);
      }
      h.segT.setVisible(!this.boss.active);
      var buff = '';
      if (this.multT > 0) buff = '×2 ' + Math.ceil(this.multT) + 's';
      else if (this.combo >= 5) buff = '×' + this.combo;
      if (buff !== c.buff) {
        c.buff = buff;
        setTextIfChanged(h.buffT, buff);
        h.buffT.setVisible(!!buff);
      }

      var bucket = Math.round(this.surge / 2);
      if (bucket !== c.surge) {
        c.surge = bucket;
        this.paintSurgeMeter();
        Dom.setSurge(this.surge, this.surge >= 100);
      }

      if (this.boss.active) {
        var frac = clamp(this.boss.coreHp / Math.max(1, this.boss.maxCoreHp), 0, 1);
        var alive = 0;
        for (var p = 0; p < this.boss.plates.length; p++) if (this.boss.plates[p].alive) alive++;
        var key = Math.round(frac * 100) * 10 + alive;
        if (key !== c.boss) {
          c.boss = key;
          var bw = Math.min(this.W * 0.72, 340);
          h.bossFill.setSize(bw * (this.boss.phase < 2 ? (alive / this.boss.plates.length) : frac), 9);
          setTextIfChanged(h.bossT, this.boss.phase < 2
            ? '◇ ' + alive
            : '◉ ' + Math.max(0, this.boss.coreHp));
        }
      }
    },

    paintSurgeMeter: function () {
      var g = this.hud.surgeG;
      g.clear();
      var r = 52;
      var x = this.W - Math.max(16, Game.insets.right) - 44;
      var y = this.H - Math.max(20, Game.insets.bottom) - 44;
      g.lineStyle(5, 0x2a1c0c, 0.85);
      g.beginPath(); g.arc(x, y, r, -Math.PI / 2, Math.PI * 1.5); g.strokePath();
      var frac = this.surge / 100;
      if (frac > 0) {
        g.lineStyle(5, this.surge >= 100 ? 0xffd36e : 0xff9a3c, 0.95);
        g.beginPath();
        g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
        g.strokePath();
      }
    },

    // ---------------------------------------------------- debug plumbing
    // Everything written here is a scalar or a preallocated record. The
    // pickup view is refreshed in place: it is never the pool array.
    pushDebug: function () {
      var s = this.dbg;
      s.mode = this.mode;
      s.phase = this.phase;
      s.score = this.score;
      s.level = this.segIndex + 1;
      s.lives = this.lives;
      s.surgeCharge = Math.round(this.surge);
      s.surgeReady = this.surge >= 100;
      s.runKey = this.mode === 'run' ? this.run.key : D.SPRINT.key;
      s.runName = this.mode === 'run' ? this.run.name : D.SPRINT.name;
      s.tubeFamily = this.famKey;
      s.tubeFamilyName = this.fam.name;
      s.segment = this.segIndex;
      s.segments = this.mode === 'run' ? this.run.segs.length : 1;
      s.tier = Math.round(this.tier * 10) / 10;
      s.depth = Math.round(this.depth);
      s.shots = this.shots;
      s.hits = this.hits;
      s.accuracy = this.shots > 0 ? Math.round(this.hits / this.shots * 1000) / 1000 : 0;
      s.enemiesAlive = this.aliveEnemies();
      s.hazard = this.haz.active ? this.haz.kind : '';
      s.hazardPhase = this.haz.active ? this.haz.phase : '';
      s.shields = this.shields;
      s.multiplier = this.multT > 0 ? D.DROP.multFactor : 1;
      s.tutorialStep = this.tutStep;
      s.poolOverflows.enemies = this.poolStats.enemies;
      s.poolOverflows.bullets = this.poolStats.bullets;
      s.poolOverflows.pickups = this.poolStats.pickups;
      s.poolOverflows.telegraphs = this.poolStats.telegraphs;
      s.poolOverflows.popups = this.poolStats.popups;
      s.boss.active = this.boss.active;
      s.boss.phase = this.boss.phase;
      s.boss.coreHp = this.boss.coreHp;
      s.boss.maxCoreHp = this.boss.maxCoreHp;
      var alive = 0;
      for (var p = 0; p < this.boss.plates.length; p++) if (this.boss.plates[p].alive) alive++;
      s.boss.plates = alive;
      for (var i = 0; i < MAX_PICKUPS; i++) {
        var rec = s.livePickups[i], src = this.pickups[i];
        rec.active = src.active;
        rec.kind = src.kind;
        rec.angle = Math.round(angWrap(src.ang) * 1000) / 1000;
        rec.depth = Math.round(src.t * 1000) / 1000;
        rec.ttl = Math.round(src.ttl * 100) / 100;
      }
    },

    // ------------------------------------------------------------ layout
    layout: function () {
      this.W = this.scale.width;
      this.H = this.scale.height;
      var W = this.W, H = this.H;
      this.metrics();
      this.bg.setDisplaySize(W, H);
      this.flashPlate.setSize(W, H);
      this.vignette.setSize(W, H);

      var h = this.hud;
      var top = Game.insets.top;
      h.band.setPosition(0, 0).setSize(W, top + 78);
      h.scoreT.setPosition(W / 2, top + 19);
      h.livesT.setPosition(Math.max(14, Game.insets.left + 10), top + 20);
      h.depthT.setPosition(W - Math.max(14, Game.insets.right + 10), top + 20);
      h.segT.setPosition(W / 2, top + 52);
      h.buffT.setPosition(W / 2, top + 66);

      var cw = Math.min(W * 0.88, 430);
      h.coach.setPosition(W / 2, top + 96);
      h.coachFill.setSize(cw, 30);
      h.coachEdge.setSize(cw, 1.5);
      h.banner.setPosition(W / 2, top + H * 0.205);

      var chipW = Math.min(W * 0.52, 220);
      var chipRight = Math.max(14, Game.insets.right + 10);
      h.chip.setPosition(W - chipRight - chipW / 2, top + 122);
      h.chipFill.setSize(chipW, 30);
      h.chipEdge.setSize(chipW, 1.5);

      var bbw = Math.min(W * 0.72, 340);
      h.bossBox.setPosition(W / 2 - bbw / 2, top + 92);
      h.bossBg.setSize(bbw, 9);
      h.bossT.setPosition(bbw / 2, -8);

      this.paintSurgeMeter();
      this.hudCache.surge = -1;
      this.hudCache.boss = -1;
      if (h.result.visible) {
        h.resultDim.setSize(W, H);
      }
    },

    // ============================================================ update
    update: function (time, delta) {
      var dt = Math.min(0.05, delta / 1000);
      this.readResultInput();

      var j = kit.juice.frame();
      this.cameras.main.setScroll(j.dx, j.dy);

      var steps = 0;
      var playable = this.phase !== 'lost' && this.phase !== 'won';
      if (!j.frozen) {
        this.acc += dt;
        while (this.acc >= STEP && steps < MAX_STEPS) {
          this.acc -= STEP;
          steps++;
          if (playable) this.step(STEP);
        }
      }
      // A device that cannot keep up gets slow motion, never a time skip:
      // the leftover accumulator beyond the step budget is DROPPED, and every
      // cosmetic clock below is driven by the stepped time, not by wall time.
      if (this.acc > STEP) this.acc = STEP * 0.999;

      var simDt = steps * STEP;
      this.frozen = j.frozen;
      this.paint(j.frozen ? 0 : simDt, this.acc / STEP);
    }
  };

  // ================================================================ boot
  // Phaser only wires preload/create/update from a plain config object, so
  // each scene literal is promoted to a real Scene subclass carrying its
  // whole method set on the prototype.
  function toScene(cfg) {
    var Klass = function () { Phaser.Scene.call(this, { key: cfg.key }); };
    Klass.prototype = Object.create(Phaser.Scene.prototype);
    Klass.prototype.constructor = Klass;
    for (var k in cfg) {
      if (k === 'key') continue;
      Klass.prototype[k] = cfg[k];
    }
    return Klass;
  }

  Game.phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: document.body,
    backgroundColor: PAL.inkCss,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight
    },
    render: {
      antialias: true, antialiasGL: false, powerPreference: 'high-performance',
      roundPixels: false, batchSize: 4096
    },
    fps: { target: 60, min: 30 },
    scene: [toScene(BootScene), toScene(TitleScene), toScene(PlayScene)]
  });

  // Harness hooks. The live scene accessor lets a frame trace drive the game
  // from inside the page instead of paying a round trip per input.
  window.__TUBESHOCK_READY = true;
  window.__TS_SCENE = function () { return Game.play; };
  window.__TS_DBG = function () {
    var s = Game.play;
    if (!s) return 'noscene';
    var en = 0, bu = 0, pk = 0, i;
    for (i = 0; i < MAX_ENEMIES; i++) if (s.enemies[i].active) en++;
    for (i = 0; i < MAX_BULLETS; i++) if (s.bullets[i].active) bu++;
    for (i = 0; i < MAX_PICKUPS; i++) if (s.pickups[i].active) pk++;
    return s.phase + ' ' + s.famKey + ' en' + en + ' bu' + bu + ' pk' + pk +
      ' sc' + s.score + ' su' + Math.round(s.surge) + ' lv' + s.lives +
      ' tut' + s.tutStep + ' haz' + (s.haz.active ? s.haz.kind + ':' + s.haz.phase : '-');
  };
}());
