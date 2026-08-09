/* Skyhammer - core: view, input, audio, particles, math */
var SH = (function () {
  'use strict';

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function rngObj(seed) {
    var f = mulberry32(seed >>> 0);
    return {
      r: f,
      range: function (a, b) { return a + f() * (b - a); },
      int: function (a, b) { return Math.floor(a + f() * (b - a + 1)); },
      pick: function (arr) { return arr[Math.floor(f() * arr.length)]; },
      chance: function (p) { return f() < p; }
    };
  }

  /* ---------- view ---------- */
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d', { alpha: false });
  var view = { cw: 0, ch: 0, W: 360, H: 640, scale: 1, ox: 0, oy: 0, dpr: 1 };

  function resize() {
    var cw = window.innerWidth || 360;
    var ch = window.innerHeight || 640;
    view.cw = cw; view.ch = ch;
    view.W = 360;
    view.H = clamp(360 * ch / cw, 520, 780);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var longCss = Math.max(cw, ch);
    if (longCss * dpr > 960) dpr = 960 / longCss;
    view.dpr = dpr;
    canvas.width = Math.max(1, Math.round(cw * dpr));
    canvas.height = Math.max(1, Math.round(ch * dpr));
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    var s = Math.min(cw / view.W, ch / view.H);
    view.scale = s * dpr;
    view.ox = (cw - view.W * s) * 0.5 * dpr;
    view.oy = (ch - view.H * s) * 0.5 * dpr;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
  resize();

  function applyTransform() {
    ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);
  }
  function toWorldX(cx) { return (cx * view.dpr - view.ox) / view.scale; }
  function toWorldY(cy) { return (cy * view.dpr - view.oy) / view.scale; }

  /* ---------- input ---------- */
  var input = {
    pointers: [],           // {id,x,y,bomb}
    keys: Object.create(null),
    onDown: null, onUp: null, onKey: null, onBlur: null,
    anyInput: false
  };
  function findP(id) {
    for (var i = 0; i < input.pointers.length; i++) if (input.pointers[i].id === id) return input.pointers[i];
    return null;
  }
  function pdown(e) {
    input.anyInput = true; ensureAudio();
    var p = { id: e.pointerId, x: toWorldX(e.clientX), y: toWorldY(e.clientY), bomb: false };
    input.pointers.push(p);
    if (input.onDown) input.onDown(p);
    if (e.cancelable) e.preventDefault();
  }
  function pmove(e) {
    var p = findP(e.pointerId);
    if (!p) return;
    p.x = toWorldX(e.clientX); p.y = toWorldY(e.clientY);
    if (e.cancelable) e.preventDefault();
  }
  function pup(e) {
    var p = findP(e.pointerId);
    if (!p) return;
    input.pointers.splice(input.pointers.indexOf(p), 1);
    if (input.onUp) input.onUp(p);
  }
  canvas.addEventListener('pointerdown', pdown, { passive: false });
  window.addEventListener('pointermove', pmove, { passive: false });
  window.addEventListener('pointerup', pup);
  window.addEventListener('pointercancel', pup);
  document.addEventListener('touchmove', function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    input.anyInput = true; ensureAudio();
    input.keys[e.code] = true;
    if (input.onKey) input.onKey(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { input.keys[e.code] = false; });
  window.addEventListener('blur', function () { input.keys = Object.create(null); input.pointers.length = 0; input.anyInput = false; if (input.onBlur) input.onBlur(); });

  /* ---------- audio (WebAudio synth only) ---------- */
  var A = { ctx: null, master: null };
  function ensureAudio() {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    try {
      A.ctx = new C();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.22;
      A.master.connect(A.ctx.destination);
    } catch (err) { A.ctx = null; }
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (!A.ctx) return;
    var t = A.ctx.currentTime;
    var o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.2), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  var noiseBuf = null;
  function noise(dur, vol, freq) {
    if (!A.ctx) return;
    if (!noiseBuf) {
      noiseBuf = A.ctx.createBuffer(1, A.ctx.sampleRate * 0.5, A.ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t = A.ctx.currentTime;
    var s = A.ctx.createBufferSource(); s.buffer = noiseBuf;
    var f = A.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(freq || 1200, t);
    f.frequency.exponentialRampToValueAtTime(120, t + dur);
    var g = A.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(A.master);
    s.start(t); s.stop(t + dur);
  }

  /* ---------- particles ---------- */
  var parts = [];
  function spawnParts(x, y, n, color, speed, size, life) {
    for (var i = 0; i < n; i++) {
      if (parts.length > 340) break;
      var a = Math.random() * TAU, sp = speed * (0.35 + Math.random() * 0.85);
      parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: (life || 0.5) * (0.6 + Math.random() * 0.7), max: life || 0.5,
        s: size || 2.5, c: color
      });
    }
  }
  function updateParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy = p.vy * 0.94 + 26 * dt;
      p.life -= dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
  }
  function drawParts(c) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var a = clamp(p.life / p.max, 0, 1);
      c.globalAlpha = a;
      c.fillStyle = p.c;
      var s = p.s * (0.4 + a * 0.8);
      c.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
    }
    c.globalAlpha = 1;
  }

  return {
    TAU: TAU, clamp: clamp, lerp: lerp, rngObj: rngObj,
    canvas: canvas, ctx: ctx, view: view, resize: resize,
    applyTransform: applyTransform, toWorldX: toWorldX, toWorldY: toWorldY,
    input: input, ensureAudio: ensureAudio, tone: tone, noise: noise,
    parts: parts, spawnParts: spawnParts, updateParts: updateParts, drawParts: drawParts
  };
})();
