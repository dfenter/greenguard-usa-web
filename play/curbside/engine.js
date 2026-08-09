'use strict';
/* Curbside - engine: math, audio, particles, input */

var TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function irnd(a, b) { return Math.floor(rnd(a, b + 1)); }
function pick(a) { return a[(Math.random() * a.length) | 0]; }
function angNorm(a) { a = a % TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; }
function easeOut(t) { return 1 - Math.pow(1 - t, 2.2); }

/* ---------------- Audio (WebAudio only, no files) ---------------- */
var SFX = {
  ctx: null, master: null, noiseBuf: null, grindSrc: null, grindGain: null, on: true,
  init: function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.on = false; return; }
    try { this.ctx = new AC(); } catch (e) { this.on = false; return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    var sr = this.ctx.sampleRate, len = sr * 2;
    var b = this.ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
  },
  tone: function (f0, f1, dur, type, vol) {
    if (!this.on || !this.ctx) return;
    var t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  noise: function (dur, f, q, vol) {
    if (!this.on || !this.ctx) return;
    var t = this.ctx.currentTime, s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    var bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q || 1;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.02);
  },
  ollie: function () { this.noise(0.16, 1700, 1.2, 0.22); this.tone(320, 620, 0.10, 'square', 0.07); },
  land: function (good) { this.noise(0.13, good ? 480 : 260, 0.9, 0.3); if (good) this.tone(220, 130, 0.09, 'triangle', 0.1); },
  trick: function (n) { this.tone(420 + n * 90, 900 + n * 120, 0.13, 'sawtooth', 0.1); },
  bail: function () { this.noise(0.55, 300, 0.5, 0.5); this.tone(180, 40, 0.5, 'sawtooth', 0.18); },
  chime: function (n) { this.tone(520 + n * 60, 900 + n * 60, 0.2, 'triangle', 0.12); },
  grindStart: function () {
    if (!this.on || !this.ctx || this.grindSrc) return;
    var s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    var bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 6;
    var g = this.ctx.createGain(); g.gain.value = 0.0001;
    g.gain.linearRampToValueAtTime(0.16, this.ctx.currentTime + 0.05);
    s.connect(bp); bp.connect(g); g.connect(this.master); s.start();
    this.grindSrc = s; this.grindGain = g;
  },
  grindStop: function () {
    if (!this.grindSrc) return;
    var s = this.grindSrc, g = this.grindGain, t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.08);
    try { s.stop(t + 0.12); } catch (e) { }
    this.grindSrc = null; this.grindGain = null;
  }
};

/* ---------------- Particles ---------------- */
var Parts = {
  list: [],
  reset: function () { this.list.length = 0; },
  spawn: function (x, y, n, opt) {
    opt = opt || {};
    for (var i = 0; i < n; i++) {
      if (this.list.length > 260) break;
      this.list.push({
        x: x, y: y,
        vx: rnd(opt.vx0 === undefined ? -60 : opt.vx0, opt.vx1 === undefined ? 60 : opt.vx1),
        vy: rnd(opt.vy0 === undefined ? -120 : opt.vy0, opt.vy1 === undefined ? -10 : opt.vy1),
        g: opt.g === undefined ? 900 : opt.g,
        life: 0, max: rnd(opt.l0 || 0.25, opt.l1 || 0.6),
        s: rnd(opt.s0 || 2, opt.s1 || 4),
        c: opt.c || '#ffd166', sq: !!opt.sq
      });
    }
  },
  update: function (dt) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var p = this.list[i];
      p.life += dt;
      if (p.life >= p.max) { this.list.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
  },
  draw: function (c) {
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i], a = 1 - p.life / p.max;
      c.globalAlpha = a;
      c.fillStyle = p.c;
      if (p.sq) c.fillRect(p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
      else { c.beginPath(); c.arc(p.x, p.y, p.s * a + 0.6, 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
  }
};

/* ---------------- Input ---------------- */
var Input = {
  ptr: null,           // active pointer {id,x0,y0,x,y,t0,fired,dragOx}
  swipe: 0,            // 1=L 2=R 3=U 4=D consumed by game
  tapPress: false,     // pointer/space went down this frame
  tapQuick: false,     // quick tap released this frame
  dragX: 0,            // live horizontal drag (px) for balance
  keys: {},
  keyBal: 0,
  bind: function (cv, onFirst) {
    var self = this;
    function first() { SFX.init(); if (onFirst) onFirst(); }
    function pos(e) {
      var r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    cv.addEventListener('pointerdown', function (e) {
      e.preventDefault(); first();
      if (self.ptr) return;
      var p = pos(e);
      self.ptr = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, t0: performance.now(), fired: false, moved: 0 };
      self.tapPress = true; self.dragX = 0;
      if (cv.setPointerCapture) { try { cv.setPointerCapture(e.pointerId); } catch (er) { } }
    }, { passive: false });
    cv.addEventListener('pointermove', function (e) {
      e.preventDefault();
      if (!self.ptr || self.ptr.id !== e.pointerId) return;
      var p = pos(e), q = self.ptr;
      q.x = p.x; q.y = p.y;
      var dx = q.x - q.x0, dy = q.y - q.y0;
      q.moved = Math.max(q.moved, Math.hypot(dx, dy));
      self.dragX = dx;
      if (!q.fired && Math.hypot(dx, dy) > 30) {
        q.fired = true;
        if (Math.abs(dx) > Math.abs(dy)) self.swipe = dx < 0 ? 1 : 2;
        else self.swipe = dy < 0 ? 3 : 4;
      }
    }, { passive: false });
    function up(e) {
      if (!self.ptr || self.ptr.id !== e.pointerId) return;
      var q = self.ptr;
      if (!q.fired && q.moved < 20 && performance.now() - q.t0 < 260) self.tapQuick = true;
      self.ptr = null; self.dragX = 0;
    }
    cv.addEventListener('pointerup', function (e) { e.preventDefault(); up(e); }, { passive: false });
    cv.addEventListener('pointercancel', function (e) { up(e); }, { passive: false });
    cv.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    window.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase();
      if ([' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', 'enter'].indexOf(k) >= 0) e.preventDefault();
      if (self.keys[k]) return;
      self.keys[k] = true; first();
      if (k === ' ' || k === 'enter') { self.tapPress = true; self.tapQuick = true; }
      if (k === 'arrowleft' || k === 'a') self.swipe = 1;
      if (k === 'arrowright' || k === 'd') self.swipe = 2;
      if (k === 'arrowup' || k === 'w') self.swipe = 3;
      if (k === 'arrowdown' || k === 's') self.swipe = 4;
    });
    window.addEventListener('keyup', function (e) { self.keys[e.key.toLowerCase()] = false; });
  },
  balance: function () {
    var k = 0;
    if (this.keys['arrowleft'] || this.keys['a']) k -= 60;
    if (this.keys['arrowright'] || this.keys['d']) k += 60;
    if (k !== 0) return clamp(k / 60, -1, 1);
    return clamp(this.dragX / 55, -1, 1);
  },
  clear: function () {
    this.ptr = null; this.swipe = 0; this.tapPress = false; this.tapQuick = false;
    this.dragX = 0; this.keys = {}; this.keyBal = 0;
  },
  endFrame: function () { this.swipe = 0; this.tapPress = false; this.tapQuick = false; }
};
window.addEventListener('blur', function () { Input.clear(); });
