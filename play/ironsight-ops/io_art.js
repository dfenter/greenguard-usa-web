/* Ironsight Ops - io_art.js
 * Every pixel in this title is baked here into canvas textures at boot and
 * drawn as plain Images, Sprites or Blitter bobs afterwards.
 *
 * Rules this file exists to enforce:
 *  - There is NOT ONE Phaser Graphics object in this game. Graphics replays
 *    its whole command list every frame and Graphics.arc walks a sweep in
 *    0.01 rad steps; a 200 cell grid cost 316 ms/frame at 4x throttle on a
 *    sibling title. Rings, plates, bars, sticks and chrome are textures.
 *  - Multi frame art uses Texture.add(name, 0, x, y, w, h): the second
 *    argument is the SOURCE INDEX, never an x offset.
 *  - Animation states are separate BAKED frames swapped with setFrame, so
 *    the canvas renderer shows what WebGL shows.
 *  - Baking is deterministic: all noise comes from a seeded generator, so
 *    two boots produce identical art.
 */
var IOArt = (function () {
  'use strict';

  var TAU = Math.PI * 2;

  var CSS = {
    ink: '#080d12', deep: '#0e1620', steel: '#22323d', line: '#3b5464',
    text: '#e6f0f6', dim: '#93aab8', mint: '#57d6b6', amber: '#f0b256',
    rust: '#e0715f', sky: '#7fc4ff', gold: '#ffd98a', white: '#ffffff',
    blood: '#c8484f', violet: '#b79bff', warn: '#ff8f6b', green: '#7ce6a4'
  };
  var PAL = {};
  (function () { for (var k in CSS) if (CSS.hasOwnProperty(k)) PAL[k] = parseInt(CSS[k].slice(1), 16); })();

  function rgba(hex, a) {
    var n = typeof hex === 'number' ? hex : parseInt(String(hex).slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function hexstr(n) { return '#' + ('000000' + ((n >>> 0) & 0xffffff).toString(16)).slice(-6); }
  function mix(a, b, t) {
    var x = typeof a === 'number' ? a : parseInt(String(a).slice(1), 16);
    var y = typeof b === 'number' ? b : parseInt(String(b).slice(1), 16);
    var r = Math.round(((x >> 16) & 255) * (1 - t) + ((y >> 16) & 255) * t);
    var g = Math.round(((x >> 8) & 255) * (1 - t) + ((y >> 8) & 255) * t);
    var bl = Math.round((x & 255) * (1 - t) + (y & 255) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  function rnd(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  var scene = null;
  function tex(key, w, h) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var t = scene.textures.createCanvas(key, w, h);
    if (!t) return null;                       // guarded: soft reload can refuse a key
    return t;
  }
  function ctxOf(t) { return t ? t.getContext() : null; }
  function done(t) { if (t) t.refresh(); }

  /* Hand tessellated arc. Never ctx.arc for big sweeps in bulk, and never
   * Phaser Graphics.arc anywhere. */
  function ring(c, x, y, r, width, color, from, to, segs) {
    var a0 = from == null ? 0 : from, a1 = to == null ? TAU : to;
    var n = Math.max(10, segs || Math.max(12, Math.round(r * 0.9)));
    c.beginPath();
    for (var i = 0; i <= n; i++) {
      var a = a0 + (a1 - a0) * (i / n);
      var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
    c.stroke();
  }
  function disc(c, x, y, r, inner, outer, mid) {
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, inner);
    g.addColorStop(mid == null ? 0.45 : mid, outer);
    g.addColorStop(1, rgba(0x000000, 0));
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function roundRect(c, x, y, w, h, r) {
    var rr = Math.min(r, w * 0.5, h * 0.5);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y); c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr); c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h); c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr); c.quadraticCurveTo(x, y, x + rr, y);
    c.closePath();
  }
  function grain(c, x, y, w, h, amount, seed) {
    var r = rnd(seed || 1234);
    for (var i = 0; i < amount; i++) {
      var px = x + r() * w, py = y + r() * h;
      var v = r();
      c.fillStyle = rgba(v > 0.5 ? 0xffffff : 0x000000, 0.03 + v * 0.05);
      c.fillRect(px, py, 1 + Math.floor(r() * 2), 1 + Math.floor(r() * 2));
    }
  }

  /* ============================================================ effects */
  function bakeEffects() {
    var t, c;

    t = tex('io_dot', 32, 32); c = ctxOf(t);
    if (c) { disc(c, 16, 16, 16, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.55)', 0.3); }
    done(t);

    t = tex('io_smoke', 64, 64); c = ctxOf(t);
    if (c) {
      var r = rnd(99);
      for (var i = 0; i < 26; i++) {
        var px = 32 + (r() - 0.5) * 26, py = 32 + (r() - 0.5) * 26, rr = 10 + r() * 16;
        disc(c, px, py, rr, 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0.06)', 0.5);
      }
    }
    done(t);

    t = tex('io_spark', 24, 6); c = ctxOf(t);
    if (c) {
      var g = c.createLinearGradient(0, 0, 24, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 1.5, 24, 3);
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(0, 2.5, 24, 1);
    }
    done(t);

    t = tex('io_chip', 8, 8); c = ctxOf(t);
    if (c) {
      c.fillStyle = 'rgba(255,255,255,0.95)'; c.fillRect(1, 1, 6, 6);
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(0, 0, 8, 2);
    }
    done(t);

    t = tex('io_tracer', 96, 8); c = ctxOf(t);
    if (c) {
      var tg = c.createLinearGradient(0, 0, 96, 0);
      tg.addColorStop(0, 'rgba(255,255,255,0)');
      tg.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      tg.addColorStop(0.9, 'rgba(255,255,255,1)');
      tg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = tg;
      c.fillRect(0, 2.5, 96, 3);
      c.globalAlpha = 0.35; c.fillRect(0, 1, 96, 6); c.globalAlpha = 1;
    }
    done(t);

    t = tex('io_muzzle', 48, 48); c = ctxOf(t);
    if (c) {
      disc(c, 24, 24, 22, 'rgba(255,255,255,1)', 'rgba(255,236,190,0.5)', 0.25);
      c.fillStyle = 'rgba(255,255,255,0.92)';
      for (var s = 0; s < 5; s++) {
        var a = -0.9 + s * 0.45, len = s === 2 ? 23 : 15 - Math.abs(2 - s) * 3;
        c.save(); c.translate(24, 24); c.rotate(a);
        c.beginPath(); c.moveTo(0, -3.2); c.lineTo(len, 0); c.lineTo(0, 3.2); c.closePath(); c.fill();
        c.restore();
      }
    }
    done(t);

    /* Wall drop shadow, baked so the level bake is one batched draw list
     * instead of a fill call per cell. */
    t = tex('io_shadow', 48, 48); c = ctxOf(t);
    if (c) {
      var sg2 = c.createRadialGradient(24, 24, 6, 24, 24, 26);
      sg2.addColorStop(0, 'rgba(0,0,0,0.42)');
      sg2.addColorStop(0.7, 'rgba(0,0,0,0.30)');
      sg2.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sg2; c.fillRect(0, 0, 48, 48);
    }
    done(t);

    t = tex('io_px', 8, 8); c = ctxOf(t);
    if (c) { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 8, 8); }
    done(t);

    t = tex('io_vignette', 256, 256); c = ctxOf(t);
    if (c) {
      var vg = c.createRadialGradient(128, 128, 40, 128, 128, 150);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(0.62, 'rgba(0,0,0,0.16)');
      vg.addColorStop(1, 'rgba(0,0,0,0.72)');
      c.fillStyle = vg; c.fillRect(0, 0, 256, 256);
    }
    done(t);

    /* Team base ring: the one thing that must never be lost in a dark
     * theatre is which body is yours. */
    t = tex('io_base', 72, 72); c = ctxOf(t);
    if (c) {
      disc(c, 36, 36, 34, 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.06)', 0.55);
      ring(c, 36, 36, 21, 3, 'rgba(255,255,255,0.95)', 0, TAU, 34);
      ring(c, 36, 36, 27, 1.6, 'rgba(255,255,255,0.42)', 0, TAU, 34);
      for (var bq = 0; bq < 4; bq++) {
        var ba = bq * Math.PI / 2 + Math.PI / 4;
        c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath();
        c.moveTo(36 + Math.cos(ba) * 22, 36 + Math.sin(ba) * 22);
        c.lineTo(36 + Math.cos(ba) * 29, 36 + Math.sin(ba) * 29);
        c.stroke();
      }
    }
    done(t);

    t = tex('io_lamp', 160, 160); c = ctxOf(t);
    if (c) {
      disc(c, 80, 80, 78, 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.22)', 0.18);
    }
    done(t);

    /* Crosshair ring frames: eight bloom sizes, all baked. */
    t = tex('io_ring', 8 * 96, 96); c = ctxOf(t);
    if (c) {
      for (var f = 0; f < 8; f++) {
        var ox = f * 96 + 48, rad = 9 + f * 4.6;
        c.save();
        ring(c, ox, 48, rad, 2, 'rgba(255,255,255,0.85)', 0, TAU, 30);
        ring(c, ox, 48, rad + 3.5, 1, 'rgba(255,255,255,0.28)', 0, TAU, 30);
        for (var q = 0; q < 4; q++) {
          var qa = q * Math.PI / 2 + Math.PI / 4;
          c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2.4; c.lineCap = 'round';
          c.beginPath();
          c.moveTo(ox + Math.cos(qa) * (rad - 4), 48 + Math.sin(qa) * (rad - 4));
          c.lineTo(ox + Math.cos(qa) * (rad + 5), 48 + Math.sin(qa) * (rad + 5));
          c.stroke();
        }
        c.fillStyle = 'rgba(255,255,255,0.95)';
        c.fillRect(ox - 1, 47, 2, 2);
        c.restore();
        t.add('r' + f, 0, f * 96, 0, 96, 96);
      }
    }
    done(t);

    /* Hit marker: four ticks, one frame. */
    t = tex('io_hitmark', 48, 48); c = ctxOf(t);
    if (c) {
      c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 3; c.lineCap = 'round';
      for (var m = 0; m < 4; m++) {
        var ma = m * Math.PI / 2 + Math.PI / 4;
        c.beginPath();
        c.moveTo(24 + Math.cos(ma) * 7, 24 + Math.sin(ma) * 7);
        c.lineTo(24 + Math.cos(ma) * 17, 24 + Math.sin(ma) * 17);
        c.stroke();
      }
    }
    done(t);

    /* Objective diamond, three states. */
    t = tex('io_marker', 3 * 40, 40); c = ctxOf(t);
    if (c) {
      var mcol = [CSS.mint, CSS.amber, CSS.sky];
      for (var mi = 0; mi < 3; mi++) {
        var mx = mi * 40 + 20;
        c.save(); c.translate(mx, 20); c.rotate(Math.PI / 4);
        c.fillStyle = rgba(parseInt(mcol[mi].slice(1), 16), 0.22);
        c.fillRect(-11, -11, 22, 22);
        c.strokeStyle = mcol[mi]; c.lineWidth = 2.6; c.strokeRect(-11, -11, 22, 22);
        c.fillStyle = mcol[mi]; c.fillRect(-3.5, -3.5, 7, 7);
        c.restore();
        t.add('m' + mi, 0, mi * 40, 0, 40, 40);
      }
    }
    done(t);

    /* Offscreen direction arrow. */
    t = tex('io_arrow', 28, 28); c = ctxOf(t);
    if (c) {
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.beginPath(); c.moveTo(25, 14); c.lineTo(8, 5); c.lineTo(12, 14); c.lineTo(8, 23); c.closePath(); c.fill();
    }
    done(t);
  }

  /* =========================================================== soldiers */
  /* Legs are a separate sprite from the torso so the run cycle can face the
   * movement vector while the torso faces the aim vector. Six leg frames
   * and six torso frames, all baked, none tinted into existence. */
  function legFrame(c, x, y, phase, kind) {
    c.save(); c.translate(x, y);
    var swing = kind === 'stand' ? 0 : Math.sin(phase * TAU) * 6.5;
    var lift = kind === 'vault' ? -3 : 0;
    for (var s = 0; s < 2; s++) {
      var side = s === 0 ? -1 : 1;
      var off = kind === 'stand' ? side * 4 : swing * side;
      c.save();
      c.translate(side * 4.2, lift);
      c.rotate(off * 0.045);
      var g = c.createLinearGradient(-3.5, -6, 3.5, 9);
      g.addColorStop(0, '#4b5a63'); g.addColorStop(0.5, '#33424c'); g.addColorStop(1, '#1d272e');
      c.fillStyle = g;
      roundRect(c, -3.6, -5 + off * 0.5, 7.2, 13, 3); c.fill();
      c.fillStyle = 'rgba(10,15,20,0.85)';
      roundRect(c, -3.8, 6 + off * 0.5, 7.6, 4.2, 2); c.fill();
      c.restore();
    }
    c.restore();
  }
  function torsoFrame(c, x, y, kind, team) {
    var body = team === 'foe' ? '#5b3b3b' : '#3f7a80';
    var body2 = team === 'foe' ? '#8a5147' : '#8fdcd2';
    var vest = team === 'foe' ? '#3a2a2a' : '#2b4a55';
    var skin = team === 'foe' ? '#c69374' : '#d7a888';
    c.save(); c.translate(x, y);
    if (kind === 'down') {
      c.globalAlpha = 0.9;
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath(); c.ellipse(0, 2, 13, 9, 0.5, 0, TAU); c.fill();
      c.fillStyle = vest;
      c.beginPath(); c.ellipse(0, 0, 11, 7, 0.5, 0, TAU); c.fill();
      c.fillStyle = mix(vest, '#000000', 0.35);
      c.beginPath(); c.ellipse(-6, -3, 4.5, 4, 0, 0, TAU); c.fill();
      c.restore(); return;
    }
    var lean = kind === 'lean' ? 3 : 0;
    var recoil = kind === 'fire' ? -1.6 : 0;
    c.translate(recoil, lean * 0.0);
    /* pack and shoulders */
    var g = c.createLinearGradient(-9, -9, 9, 9);
    g.addColorStop(0, body2); g.addColorStop(0.55, body); g.addColorStop(1, mix(body, '#000000', 0.42));
    c.fillStyle = g;
    c.beginPath(); c.ellipse(0, 0, 9.4, 8.2, 0, 0, TAU); c.fill();
    c.strokeStyle = team === 'foe' ? 'rgba(255,214,205,0.60)' : 'rgba(226,250,255,0.72)';
    c.lineWidth = 1.7;
    c.beginPath(); c.ellipse(0, 0, 9.4, 8.2, 0, 0, TAU); c.stroke();
    /* plate carrier */
    c.fillStyle = vest;
    roundRect(c, -6.5, -5.4, 11, 10.8, 3); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(c, -6.5, -5.4, 11, 3.4, 2); c.fill();
    /* head */
    c.fillStyle = skin;
    c.beginPath(); c.arc(1.5, 0, 4.1, 0, TAU); c.fill();
    c.fillStyle = team === 'foe' ? '#3b2b2b' : '#22333b';
    c.beginPath(); c.arc(1.0, 0, 4.4, Math.PI * 0.55, Math.PI * 1.45); c.fill();
    /* arms and weapon */
    if (kind === 'reload') {
      c.fillStyle = mix(body, '#000000', 0.2);
      roundRect(c, 2, -1, 8, 4.4, 2); c.fill();
      c.fillStyle = '#20272c';
      roundRect(c, 6, -2.4, 9, 3.6, 1.4); c.fill();
      c.fillStyle = CSS.amber;
      roundRect(c, 7.5, 1.4, 3.4, 4.4, 1); c.fill();
    } else if (kind === 'vault') {
      c.fillStyle = mix(body, '#ffffff', 0.12);
      roundRect(c, 1, -6.5, 9, 3.6, 1.8); c.fill();
      c.fillStyle = '#20272c';
      roundRect(c, 3, 1.5, 12, 3.4, 1.4); c.fill();
    } else {
      c.fillStyle = mix(body, '#000000', 0.18);
      roundRect(c, 1.5, -4.6, 7, 3.6, 1.8); c.fill();
      roundRect(c, 1.5, 1.2, 7, 3.6, 1.8); c.fill();
      /* weapon body */
      c.fillStyle = '#1c2328';
      roundRect(c, 4, -1.9, 14.5, 3.8, 1.4); c.fill();
      c.fillStyle = '#2c363d';
      roundRect(c, 5.5, -2.9, 5, 1.6, 0.8); c.fill();
      c.fillStyle = '#151b1f';
      roundRect(c, 8, 1.2, 3.4, 4.2, 1); c.fill();
      if (kind === 'fire') {
        c.fillStyle = 'rgba(255,226,160,0.95)';
        c.beginPath(); c.arc(19.5, 0, 3.4, 0, TAU); c.fill();
      }
    }
    if (kind === 'flinch') {
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.beginPath(); c.ellipse(0, 0, 9.4, 8.2, 0, 0, TAU); c.fill();
    }
    c.restore();
  }

  function bakeActors() {
    var LEG_KINDS = ['stand', 'run0', 'run1', 'run2', 'run3', 'vault'];
    var t = tex('io_legs', LEG_KINDS.length * 32, 32);
    var c = ctxOf(t);
    if (c) {
      for (var i = 0; i < LEG_KINDS.length; i++) {
        var k = LEG_KINDS[i];
        var phase = k === 'stand' ? 0 : (k === 'vault' ? 0.25 : (i - 1) / 4);
        legFrame(c, i * 32 + 16, 16, phase, k === 'vault' ? 'vault' : (k === 'stand' ? 'stand' : 'run'));
        t.add(k, 0, i * 32, 0, 32, 32);
      }
    }
    done(t);

    var TORSO = ['idle', 'fire', 'reload', 'vault', 'lean', 'down'];
    var teams = [['io_torso', 'us'], ['io_foe', 'foe']];
    for (var ti = 0; ti < teams.length; ti++) {
      var key = teams[ti][0], team = teams[ti][1];
      var kinds = team === 'foe' ? ['idle', 'fire', 'flinch', 'down', 'lean'] : TORSO;
      var tt = tex(key, kinds.length * 48, 48);
      var cc = ctxOf(tt);
      if (cc) {
        for (var f = 0; f < kinds.length; f++) {
          torsoFrame(cc, f * 48 + 20, 24, kinds[f], team);
          tt.add(kinds[f], 0, f * 48, 0, 48, 48);
        }
      }
      done(tt);
    }

    /* Civilians under escort: hostage and asset, two frames each. */
    var ct = tex('io_civ', 4 * 40, 40);
    var cx = ctxOf(ct);
    if (cx) {
      var civs = [['hostage', '#d5d8c8', '#8a8f7a'], ['hostage_move', '#d5d8c8', '#8a8f7a'],
                  ['vip', '#c9d6e8', '#5d6f8c'], ['vip_move', '#c9d6e8', '#5d6f8c']];
      for (var v = 0; v < civs.length; v++) {
        var ox = v * 40 + 20;
        cx.save(); cx.translate(ox, 20);
        if (v % 2 === 1) cx.rotate(0.16);
        var gg = cx.createLinearGradient(-8, -8, 8, 8);
        gg.addColorStop(0, civs[v][1]); gg.addColorStop(1, civs[v][2]);
        cx.fillStyle = gg;
        cx.beginPath(); cx.ellipse(0, 0, 8.2, 7.4, 0, 0, TAU); cx.fill();
        cx.fillStyle = '#c99a7c';
        cx.beginPath(); cx.arc(1, 0, 3.8, 0, TAU); cx.fill();
        cx.fillStyle = 'rgba(0,0,0,0.3)';
        cx.beginPath(); cx.arc(0.5, 0, 4.2, Math.PI * 0.6, Math.PI * 1.4); cx.fill();
        cx.restore();
        ct.add(civs[v][0], 0, v * 40, 0, 40, 40);
      }
    }
    done(ct);
  }

  /* ============================================================== props */
  function bakeProps() {
    /* Crate: penetrable cover with three damage frames. */
    var t = tex('io_crate', 3 * 40, 40), c = ctxOf(t);
    if (c) {
      for (var d = 0; d < 3; d++) {
        var ox = d * 40;
        c.save(); c.translate(ox, 0);
        var g = c.createLinearGradient(0, 0, 40, 40);
        g.addColorStop(0, '#8a6a3f'); g.addColorStop(0.5, '#6b5130'); g.addColorStop(1, '#463420');
        c.fillStyle = g; roundRect(c, 2, 2, 36, 36, 3); c.fill();
        c.strokeStyle = '#2b1f12'; c.lineWidth = 2; roundRect(c, 2, 2, 36, 36, 3); c.stroke();
        c.strokeStyle = 'rgba(255,225,170,0.24)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(5, 5); c.lineTo(35, 35); c.moveTo(35, 5); c.lineTo(5, 35); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(4, 4, 32, 5);
        c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(4, 31, 32, 5);
        if (d > 0) {
          var r = rnd(77 + d);
          c.fillStyle = 'rgba(0,0,0,0.55)';
          for (var i = 0; i < 6 + d * 8; i++) {
            var px = 5 + r() * 30, py = 5 + r() * 30;
            c.fillRect(px, py, 2 + r() * 4, 2 + r() * 3);
          }
        }
        if (d === 2) {
          c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 3;
          c.beginPath(); c.moveTo(8, 12); c.lineTo(20, 22); c.lineTo(15, 32); c.stroke();
        }
        grain(c, 2, 2, 36, 36, 60, 900 + d);
        c.restore();
        t.add('c' + d, 0, ox, 0, 40, 40);
      }
    }
    done(t);

    /* Barrel: intact and scorched. */
    t = tex('io_barrel', 2 * 40, 40); c = ctxOf(t);
    if (c) {
      for (var b = 0; b < 2; b++) {
        var bx = b * 40 + 20;
        var g2 = c.createLinearGradient(bx - 15, 0, bx + 15, 0);
        if (b === 0) {
          g2.addColorStop(0, '#d1633f'); g2.addColorStop(0.4, '#a3452a'); g2.addColorStop(1, '#5d2517');
        } else {
          g2.addColorStop(0, '#4a4038'); g2.addColorStop(0.5, '#2f2823'); g2.addColorStop(1, '#191512');
        }
        c.fillStyle = g2;
        c.beginPath(); c.arc(bx, 20, 15, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 2;
        ring(c, bx, 20, 15, 2, 'rgba(0,0,0,0.6)', 0, TAU, 28);
        ring(c, bx, 20, 11, 2.2, b === 0 ? 'rgba(255,225,170,0.35)' : 'rgba(120,110,100,0.3)', 0, TAU, 24);
        ring(c, bx, 20, 6, 2, 'rgba(0,0,0,0.35)', 0, TAU, 20);
        if (b === 0) {
          c.fillStyle = CSS.gold;
          c.beginPath(); c.moveTo(bx, 13); c.lineTo(bx + 5, 24); c.lineTo(bx - 5, 24); c.closePath(); c.fill();
          c.fillStyle = '#2b1c0c'; c.fillRect(bx - 0.9, 17, 1.8, 4);
        }
        grain(c, bx - 15, 5, 30, 30, 40, 55 + b);
        t.add('b' + b, 0, b * 40, 0, 40, 40);
      }
    }
    done(t);

    /* Glass panel: intact and shattered. */
    t = tex('io_glass', 2 * 40, 40); c = ctxOf(t);
    if (c) {
      for (var gi = 0; gi < 2; gi++) {
        var gx = gi * 40;
        c.save(); c.translate(gx, 0);
        c.fillStyle = 'rgba(150,215,235,0.20)'; c.fillRect(1, 1, 38, 38);
        c.strokeStyle = 'rgba(190,235,255,0.55)'; c.lineWidth = 2; c.strokeRect(2, 2, 36, 36);
        c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(4, 30); c.lineTo(30, 4); c.moveTo(14, 36); c.lineTo(36, 14); c.stroke();
        if (gi === 1) {
          var r2 = rnd(313);
          c.strokeStyle = 'rgba(220,245,255,0.75)'; c.lineWidth = 1.2;
          for (var s = 0; s < 12; s++) {
            c.beginPath(); c.moveTo(20, 20);
            c.lineTo(20 + Math.cos(s * 0.52 + r2()) * 20, 20 + Math.sin(s * 0.52 + r2()) * 20);
            c.stroke();
          }
          c.globalAlpha = 0.35;
        }
        c.restore();
        t.add('g' + gi, 0, gi * 40, 0, 40, 40);
      }
    }
    done(t);

    /* Breachable door and an intel case. */
    t = tex('io_door', 2 * 40, 40); c = ctxOf(t);
    if (c) {
      for (var di = 0; di < 2; di++) {
        var dx = di * 40;
        c.save(); c.translate(dx, 0);
        if (di === 0) {
          var dg = c.createLinearGradient(0, 0, 40, 0);
          dg.addColorStop(0, '#5a6672'); dg.addColorStop(0.5, '#3d4854'); dg.addColorStop(1, '#232c35');
          c.fillStyle = dg; c.fillRect(2, 0, 36, 40);
          c.strokeStyle = '#151b21'; c.lineWidth = 2; c.strokeRect(3, 1, 34, 38);
          c.fillStyle = CSS.amber; c.fillRect(6, 17, 28, 3);
          c.fillStyle = '#101519'; c.fillRect(28, 18, 6, 5);
          grain(c, 2, 0, 36, 40, 50, 21);
        } else {
          c.fillStyle = 'rgba(40,30,26,0.55)'; c.fillRect(2, 0, 36, 40);
          var r3 = rnd(41);
          for (var k = 0; k < 22; k++) {
            c.fillStyle = 'rgba(90,80,70,' + (0.3 + r3() * 0.4) + ')';
            c.fillRect(3 + r3() * 34, r3() * 38, 2 + r3() * 5, 2 + r3() * 4);
          }
        }
        c.restore();
        t.add('d' + di, 0, dx, 0, 40, 40);
      }
    }
    done(t);

    t = tex('io_intel', 32, 32); c = ctxOf(t);
    if (c) {
      c.fillStyle = 'rgba(87,214,182,0.20)';
      roundRect(c, 4, 6, 24, 20, 3); c.fill();
      c.fillStyle = '#1d3b3a'; roundRect(c, 6, 8, 20, 16, 2); c.fill();
      c.fillStyle = CSS.mint; roundRect(c, 8, 10, 16, 12, 1.5); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(9, 11, 14, 3);
      c.fillStyle = '#2b4a4d'; roundRect(c, 4, 24, 24, 4, 2); c.fill();
    }
    done(t);
  }

  /* ======================================================= theatre tiles */
  function bakeTheatre(th) {
    var m = th.mood, id = th.id;
    var t = tex('io_floor_' + id, 80, 80), c = ctxOf(t);
    if (c) {
      c.fillStyle = hexstr(m.floor); c.fillRect(0, 0, 80, 80);
      var shade = [0, 0.35, 0.16, 0.55];
      var r = rnd(id.charCodeAt(0) * 977);
      for (var y = 0; y < 2; y++) for (var x = 0; x < 2; x++) {
        var s = shade[y * 2 + x];
        c.fillStyle = mix(hexstr(m.floor), hexstr(m.floorAlt), s);
        c.fillRect(x * 40, y * 40, 40, 40);
        /* soft slab wear so the tiling does not read as a grid of boxes */
        var wg = c.createLinearGradient(x * 40, y * 40, x * 40 + 40, y * 40 + 40);
        wg.addColorStop(0, rgba(0xffffff, 0.035));
        wg.addColorStop(0.6, rgba(0x000000, 0.0));
        wg.addColorStop(1, rgba(0x000000, 0.07));
        c.fillStyle = wg; c.fillRect(x * 40, y * 40, 40, 40);
        c.strokeStyle = rgba(m.grout, 0.40); c.lineWidth = 1;
        c.strokeRect(x * 40 + 0.5, y * 40 + 0.5, 39, 39);
      }
      for (var i = 0; i < 26; i++) {
        c.fillStyle = rgba(m.decal, 0.18 + r() * 0.30);
        c.fillRect(r() * 80, r() * 80, 3 + r() * 22, 1 + r() * 2);
      }
      for (var b2 = 0; b2 < 5; b2++) {
        disc(c, r() * 80, r() * 80, 12 + r() * 22, rgba(m.decal, 0.16), rgba(m.decal, 0.05), 0.5);
      }
      grain(c, 0, 0, 80, 80, 260, id.charCodeAt(1) * 31);
    }
    done(t);

    t = tex('io_wall_' + id, 40, 40); c = ctxOf(t);
    if (c) {
      var g = c.createLinearGradient(0, 0, 0, 40);
      g.addColorStop(0, hexstr(m.wallTop));
      g.addColorStop(0.42, hexstr(m.wall));
      g.addColorStop(1, hexstr(m.edge));
      c.fillStyle = g; c.fillRect(0, 0, 40, 40);
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, 0, 40, 4);
      c.fillStyle = 'rgba(0,0,0,0.30)'; c.fillRect(0, 34, 40, 6);
      c.strokeStyle = rgba(m.edge, 0.85); c.lineWidth = 2; c.strokeRect(1, 1, 38, 38);
      c.fillStyle = 'rgba(255,255,255,0.07)';
      c.fillRect(6, 12, 28, 2); c.fillRect(6, 24, 28, 2);
      grain(c, 0, 0, 40, 40, 90, id.charCodeAt(0) * 13);
    }
    done(t);

    t = tex('io_deco_' + id, 64, 64); c = ctxOf(t);
    if (c) {
      var r2 = rnd(id.charCodeAt(2) * 613);
      c.strokeStyle = rgba(m.accent, 0.30); c.lineWidth = 3;
      c.beginPath(); c.moveTo(6, 32); c.lineTo(58, 32); c.stroke();
      c.strokeStyle = rgba(m.accent, 0.16); c.lineWidth = 6;
      c.beginPath(); c.moveTo(10, 12); c.lineTo(54, 12); c.stroke();
      for (var j = 0; j < 24; j++) {
        c.fillStyle = rgba(m.decal, 0.3 + r2() * 0.3);
        c.fillRect(r2() * 64, r2() * 64, 3 + r2() * 10, 2 + r2() * 3);
      }
    }
    done(t);
  }

  /* ================================================================ ui */
  var ICONS = ['frag', 'smoke', 'flash', 'ping', 'breach', 'reload', 'swap', 'pause',
    'star', 'skull', 'intel', 'hostage', 'vip', 'hold', 'defuse', 'extract',
    'medal', 'lock', 'play', 'gear', 'left', 'right', 'clear', 'vault', 'health', 'ammo'];

  function drawIcon(c, name, s) {
    var h = s * 0.5;
    c.save(); c.translate(h, h);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = '#ffffff'; c.fillStyle = '#ffffff'; c.lineWidth = s * 0.09;
    var k = s / 32;
    switch (name) {
      case 'frag':
        c.beginPath(); c.ellipse(0, 2 * k, 8 * k, 9 * k, 0, 0, TAU); c.fill();
        c.fillRect(-3 * k, -11 * k, 6 * k, 5 * k);
        c.beginPath(); c.arc(6 * k, -10 * k, 4 * k, 0, TAU); c.stroke();
        break;
      case 'smoke':
        for (var i = 0; i < 3; i++) {
          c.globalAlpha = 0.55 + i * 0.15;
          c.beginPath(); c.arc(-5 * k + i * 5 * k, (i % 2 ? -3 : 3) * k, 6.5 * k, 0, TAU); c.fill();
        }
        c.globalAlpha = 1;
        break;
      case 'flash':
        c.beginPath();
        c.moveTo(2 * k, -13 * k); c.lineTo(-8 * k, 2 * k); c.lineTo(-1 * k, 2 * k);
        c.lineTo(-3 * k, 13 * k); c.lineTo(8 * k, -2 * k); c.lineTo(1 * k, -2 * k);
        c.closePath(); c.fill();
        break;
      case 'ping':
        for (var p = 0; p < 3; p++) ring(c, 0, 2 * k, (4 + p * 4.5) * k, 2.2 * k, 'rgba(255,255,255,' + (0.9 - p * 0.24) + ')', -2.5, -0.6, 18);
        c.beginPath(); c.arc(0, 2 * k, 2.6 * k, 0, TAU); c.fill();
        break;
      case 'breach':
        c.strokeRect(-9 * k, -11 * k, 18 * k, 22 * k);
        c.fillRect(-3 * k, -3 * k, 6 * k, 6 * k);
        c.beginPath(); c.moveTo(9 * k, -11 * k); c.lineTo(13 * k, -15 * k); c.stroke();
        break;
      case 'reload':
        ring(c, 0, 0, 9.5 * k, 3 * k, '#ffffff', -2.0, 2.6, 26);
        c.beginPath(); c.moveTo(9.5 * k, -8 * k); c.lineTo(13 * k, 0); c.lineTo(5 * k, -1 * k); c.closePath(); c.fill();
        break;
      case 'swap':
        c.beginPath(); c.moveTo(-10 * k, -4 * k); c.lineTo(8 * k, -4 * k); c.stroke();
        c.beginPath(); c.moveTo(4 * k, -9 * k); c.lineTo(10 * k, -4 * k); c.lineTo(4 * k, 1 * k); c.stroke();
        c.beginPath(); c.moveTo(10 * k, 6 * k); c.lineTo(-8 * k, 6 * k); c.stroke();
        c.beginPath(); c.moveTo(-4 * k, 1 * k); c.lineTo(-10 * k, 6 * k); c.lineTo(-4 * k, 11 * k); c.stroke();
        break;
      case 'pause':
        c.fillRect(-7 * k, -9 * k, 5 * k, 18 * k); c.fillRect(3 * k, -9 * k, 5 * k, 18 * k);
        break;
      case 'play':
        c.beginPath(); c.moveTo(-6 * k, -10 * k); c.lineTo(11 * k, 0); c.lineTo(-6 * k, 10 * k); c.closePath(); c.fill();
        break;
      case 'star': case 'medal':
        c.beginPath();
        for (var st = 0; st < 10; st++) {
          var ra = (st % 2 === 0 ? 12 : 5.2) * k, aa = -Math.PI / 2 + st * Math.PI / 5;
          var px = Math.cos(aa) * ra, py = Math.sin(aa) * ra;
          if (st === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.closePath(); c.fill();
        break;
      case 'skull':
        c.beginPath(); c.arc(0, -2 * k, 8.5 * k, 0, TAU); c.fill();
        c.fillRect(-5 * k, 4 * k, 10 * k, 7 * k);
        c.fillStyle = '#000000';
        c.beginPath(); c.arc(-3.4 * k, -2 * k, 2.5 * k, 0, TAU); c.fill();
        c.beginPath(); c.arc(3.4 * k, -2 * k, 2.5 * k, 0, TAU); c.fill();
        c.fillRect(-1 * k, 5 * k, 2 * k, 5 * k);
        break;
      case 'intel':
        c.strokeRect(-9 * k, -7 * k, 18 * k, 13 * k);
        c.fillRect(-6 * k, -4 * k, 12 * k, 2 * k);
        c.fillRect(-6 * k, 0, 8 * k, 2 * k);
        c.fillRect(-11 * k, 7 * k, 22 * k, 3 * k);
        break;
      case 'hostage': case 'vip':
        c.beginPath(); c.arc(0, -6 * k, 4.6 * k, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(-8 * k, 12 * k); c.quadraticCurveTo(0, -3 * k, 8 * k, 12 * k); c.closePath(); c.fill();
        if (name === 'vip') { c.fillStyle = '#000000'; c.fillRect(-1.4 * k, 2 * k, 2.8 * k, 8 * k); }
        break;
      case 'hold':
        ring(c, 0, 0, 10 * k, 2.6 * k, '#ffffff', 0, TAU, 30);
        c.fillRect(-1.4 * k, -7 * k, 2.8 * k, 8 * k);
        c.fillRect(0, -1 * k, 6 * k, 2.6 * k);
        break;
      case 'defuse':
        c.beginPath(); c.arc(-1 * k, 3 * k, 8 * k, 0, TAU); c.fill();
        c.strokeStyle = '#ffffff';
        c.beginPath(); c.moveTo(3 * k, -3 * k); c.quadraticCurveTo(10 * k, -8 * k, 12 * k, -13 * k); c.stroke();
        c.lineWidth = 2.4 * k;
        c.beginPath(); c.moveTo(6 * k, -12 * k); c.lineTo(13 * k, -6 * k); c.stroke();
        break;
      case 'extract':
        c.beginPath(); c.moveTo(0, -12 * k); c.lineTo(9 * k, -2 * k); c.lineTo(3.5 * k, -2 * k);
        c.lineTo(3.5 * k, 11 * k); c.lineTo(-3.5 * k, 11 * k); c.lineTo(-3.5 * k, -2 * k);
        c.lineTo(-9 * k, -2 * k); c.closePath(); c.fill();
        break;
      case 'lock':
        c.fillRect(-8 * k, -1 * k, 16 * k, 12 * k);
        ring(c, 0, -1 * k, 5.5 * k, 2.6 * k, '#ffffff', Math.PI, TAU, 16);
        break;
      case 'gear':
        for (var t2 = 0; t2 < 8; t2++) {
          c.save(); c.rotate(t2 * TAU / 8);
          c.fillRect(-2 * k, -12 * k, 4 * k, 5 * k);
          c.restore();
        }
        ring(c, 0, 0, 7.5 * k, 4 * k, '#ffffff', 0, TAU, 26);
        break;
      case 'left': case 'right':
        c.save(); if (name === 'left') c.scale(-1, 1);
        c.beginPath(); c.moveTo(-4 * k, -9 * k); c.lineTo(6 * k, 0); c.lineTo(-4 * k, 9 * k); c.closePath(); c.fill();
        c.restore();
        break;
      case 'clear':
        c.lineWidth = 3.4 * k;
        c.beginPath(); c.moveTo(-9 * k, 1 * k); c.lineTo(-3 * k, 8 * k); c.lineTo(10 * k, -8 * k); c.stroke();
        break;
      case 'vault':
        c.lineWidth = 3 * k;
        c.beginPath(); c.moveTo(-11 * k, 8 * k); c.quadraticCurveTo(0, -13 * k, 11 * k, 8 * k); c.stroke();
        c.fillRect(-12 * k, 8 * k, 24 * k, 3.5 * k);
        break;
      case 'health':
        c.fillRect(-3 * k, -10 * k, 6 * k, 20 * k);
        c.fillRect(-10 * k, -3 * k, 20 * k, 6 * k);
        break;
      case 'ammo':
        c.fillRect(-7 * k, -2 * k, 14 * k, 12 * k);
        c.beginPath(); c.moveTo(-7 * k, -2 * k); c.lineTo(0, -12 * k); c.lineTo(7 * k, -2 * k); c.closePath(); c.fill();
        break;
      default:
        c.beginPath(); c.arc(0, 0, 8 * k, 0, TAU); c.fill();
    }
    c.restore();
  }

  function bakeUi() {
    var S = 48;
    var t = tex('io_icons', ICONS.length * S, S), c = ctxOf(t);
    if (c) {
      for (var i = 0; i < ICONS.length; i++) {
        c.save(); c.translate(i * S, 0);
        drawIcon(c, ICONS[i], S);
        c.restore();
        t.add(ICONS[i], 0, i * S, 0, S, S);
      }
    }
    done(t);

    /* Panel plate for nine slice use: 64x64, 20 px corners. */
    t = tex('io_plate', 64, 64); c = ctxOf(t);
    if (c) {
      var g = c.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, 'rgba(26,38,48,0.94)');
      g.addColorStop(1, 'rgba(12,19,25,0.94)');
      c.fillStyle = g; roundRect(c, 1, 1, 62, 62, 12); c.fill();
      c.strokeStyle = 'rgba(140,190,210,0.35)'; c.lineWidth = 2;
      roundRect(c, 2, 2, 60, 60, 12); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 1;
      roundRect(c, 5, 5, 54, 54, 9); c.stroke();
    }
    done(t);

    t = tex('io_plate_hi', 64, 64); c = ctxOf(t);
    if (c) {
      var g2 = c.createLinearGradient(0, 0, 0, 64);
      g2.addColorStop(0, 'rgba(46,86,86,0.96)');
      g2.addColorStop(1, 'rgba(20,44,46,0.96)');
      c.fillStyle = g2; roundRect(c, 1, 1, 62, 62, 12); c.fill();
      c.strokeStyle = CSS.mint; c.lineWidth = 2.4;
      roundRect(c, 2, 2, 60, 60, 12); c.stroke();
    }
    done(t);

    t = tex('io_slot', 64, 64); c = ctxOf(t);
    if (c) {
      c.fillStyle = 'rgba(10,16,21,0.72)'; roundRect(c, 1, 1, 62, 62, 14); c.fill();
      c.strokeStyle = 'rgba(150,200,215,0.28)'; c.lineWidth = 2; roundRect(c, 2, 2, 60, 60, 14); c.stroke();
    }
    done(t);

    /* Round action button, idle and pressed. */
    t = tex('io_btn', 2 * 128, 128); c = ctxOf(t);
    if (c) {
      for (var b = 0; b < 2; b++) {
        var bx = b * 128 + 64;
        var bg = c.createRadialGradient(bx, 54, 6, bx, 64, 60);
        if (b === 0) {
          bg.addColorStop(0, 'rgba(52,78,90,0.92)'); bg.addColorStop(1, 'rgba(14,22,28,0.86)');
        } else {
          bg.addColorStop(0, 'rgba(96,190,170,0.95)'); bg.addColorStop(1, 'rgba(26,64,62,0.9)');
        }
        c.fillStyle = bg; c.beginPath(); c.arc(bx, 64, 60, 0, TAU); c.fill();
        ring(c, bx, 64, 58, 3, b === 0 ? 'rgba(160,205,220,0.5)' : CSS.mint, 0, TAU, 44);
        ring(c, bx, 64, 50, 1.5, 'rgba(255,255,255,0.12)', 0, TAU, 40);
        t.add('b' + b, 0, b * 128, 0, 128, 128);
      }
    }
    done(t);

    /* Virtual stick base and knob. */
    t = tex('io_stick', 160, 160); c = ctxOf(t);
    if (c) {
      disc(c, 80, 80, 78, 'rgba(120,170,190,0.12)', 'rgba(90,140,160,0.06)', 0.6);
      ring(c, 80, 80, 66, 3, 'rgba(170,215,230,0.34)', 0, TAU, 54);
      ring(c, 80, 80, 30, 2, 'rgba(170,215,230,0.20)', 0, TAU, 34);
      for (var d = 0; d < 4; d++) {
        var da = d * Math.PI / 2;
        c.strokeStyle = 'rgba(190,230,240,0.30)'; c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath();
        c.moveTo(80 + Math.cos(da) * 44, 80 + Math.sin(da) * 44);
        c.lineTo(80 + Math.cos(da) * 56, 80 + Math.sin(da) * 56);
        c.stroke();
      }
    }
    done(t);

    t = tex('io_knob', 96, 96); c = ctxOf(t);
    if (c) {
      var kg = c.createRadialGradient(48, 40, 4, 48, 48, 44);
      kg.addColorStop(0, 'rgba(215,240,245,0.92)');
      kg.addColorStop(0.55, 'rgba(120,165,180,0.72)');
      kg.addColorStop(1, 'rgba(40,66,78,0.62)');
      c.fillStyle = kg; c.beginPath(); c.arc(48, 48, 42, 0, TAU); c.fill();
      ring(c, 48, 48, 40, 2.5, 'rgba(235,250,255,0.55)', 0, TAU, 40);
    }
    done(t);

    /* Title mark used on the menu. */
    t = tex('io_mark', 192, 192); c = ctxOf(t);
    if (c) {
      ring(c, 96, 96, 62, 8, CSS.mint, 0, TAU, 70);
      ring(c, 96, 96, 45, 3, 'rgba(255,255,255,0.30)', 0, TAU, 54);
      for (var q2 = 0; q2 < 4; q2++) {
        var qa2 = q2 * Math.PI / 2;
        c.strokeStyle = CSS.amber; c.lineWidth = 9; c.lineCap = 'butt';
        c.beginPath();
        c.moveTo(96 + Math.cos(qa2) * 44, 96 + Math.sin(qa2) * 44);
        c.lineTo(96 + Math.cos(qa2) * 84, 96 + Math.sin(qa2) * 84);
        c.stroke();
      }
      c.fillStyle = CSS.amber;
      c.beginPath();
      c.moveTo(96, 66); c.lineTo(124, 118); c.lineTo(96, 106); c.lineTo(68, 118);
      c.closePath(); c.fill();
      c.fillStyle = '#fff6e8';
      c.beginPath(); c.arc(96, 100, 7, 0, TAU); c.fill();
    }
    done(t);

    /* Soft scanline sheet used behind menus for texture. */
    t = tex('io_scan', 8, 8); c = ctxOf(t);
    if (c) {
      c.fillStyle = 'rgba(255,255,255,0.035)'; c.fillRect(0, 0, 8, 2);
    }
    done(t);
  }

  /* ============================================================== build */
  /* Baking is staged so the loading bar shows real progress. */
  function build(sc, content, onStep) {
    scene = sc;
    var steps = [];
    steps.push(function () { bakeEffects(); });
    steps.push(function () { bakeActors(); });
    steps.push(function () { bakeProps(); });
    steps.push(function () { bakeUi(); });
    var order = content.THEATRE_ORDER;
    for (var i = 0; i < order.length; i++) {
      (function (id) { steps.push(function () { bakeTheatre(content.theatre(id)); }); })(order[i]);
    }
    for (var s = 0; s < steps.length; s++) {
      steps[s]();
      if (onStep) onStep((s + 1) / steps.length);
    }
    return steps.length;
  }

  return {
    build: build, CSS: CSS, PAL: PAL, ICONS: ICONS,
    rgba: rgba, mix: mix, hexstr: hexstr, ring: ring, roundRect: roundRect
  };
})();
