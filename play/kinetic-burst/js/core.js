/* Kinetic Burst - core utilities: math, storage, audio, input, particles */
'use strict';

var VW = 390, VH = 700;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function irnd(n) { return (Math.random() * n) | 0; }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

/* ---------- storage (hardening #4: try/catch + type validation) ---------- */
var KEY = 'kinetic-burst-v1';
var Store = {
  read: function () {
    var def = { v: 1, unlocked: null, round: 1, best: 0, team: null, wins: 0 };
    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { return def; }
    if (typeof raw !== 'string' || !raw.length) return def;
    var o = null;
    try { o = JSON.parse(raw); } catch (e) { return def; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return def;
    var out = { v: 1, unlocked: null, round: 1, best: 0, team: null, wins: 0 };
    if (Array.isArray(o.unlocked)) {
      var u = [];
      for (var i = 0; i < o.unlocked.length && u.length < 32; i++) {
        var n = o.unlocked[i];
        var id = n | 0;
        if (typeof n === 'number' && isFinite(n) && n === id && typeof FIGHTERS !== 'undefined' && FIGHTERS[id] && FIGHTERS[id].id === id && u.indexOf(id) < 0) u.push(id);
      }
      if (u.length) out.unlocked = u;
    }
    if (Array.isArray(o.team)) {
      var t = [];
      for (var j = 0; j < o.team.length && t.length < 3; j++) {
        var m = o.team[j];
        var tid = m | 0;
        if (typeof m === 'number' && isFinite(m) && m === tid && typeof FIGHTERS !== 'undefined' && FIGHTERS[tid] && FIGHTERS[tid].id === tid && t.indexOf(tid) < 0) t.push(tid);
      }
      if (t.length === 3) out.team = t;
    }
    if (typeof o.round === 'number' && isFinite(o.round)) out.round = clamp(o.round | 0, 1, 8);
    if (typeof o.best === 'number' && isFinite(o.best)) out.best = clamp(o.best | 0, 0, 9999);
    if (typeof o.wins === 'number' && isFinite(o.wins)) out.wins = clamp(o.wins | 0, 0, 9999);
    return out;
  },
  write: function (obj) {
    try { window.localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) { /* quota / private mode */ }
  }
};

/* ---------- audio (WebAudio synthesis only, unlocked on gesture) ---------- */
var Snd = {
  ctx: null, master: null, on: false,
  init: function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.25;
      this.master.connect(this.ctx.destination);
      this.on = true;
    } catch (e) { this.ctx = null; }
  },
  blip: function (freq, dur, type, vol, slide, at) {
    if (!this.on || !this.ctx) return;
    var t = this.ctx.currentTime + (at || 0);
    var o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise: function (dur, vol, hp) {
    if (!this.on || !this.ctx) return;
    var t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = this.ctx.createBufferSource(); s.buffer = buf;
    var f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 400;
    var g = this.ctx.createGain(); g.gain.value = vol || 0.25;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  },
  link: function (i) { this.blip(300 + Math.min(i, 14) * 32, 0.06, 'square', 0.16); },
  chain: function (i) { this.blip(360 + Math.min(i, 8) * 90, 0.16, 'triangle', 0.3, 1.6); },
  hit: function () { this.noise(0.16, 0.3, 700); this.blip(150, 0.12, 'sawtooth', 0.22, 0.4); },
  perfect: function () { this.blip(880, 0.1, 'triangle', 0.32); this.blip(1320, 0.18, 'triangle', 0.24); },
  miss: function () { this.blip(180, 0.16, 'sawtooth', 0.2, 0.5); },
  ko: function () { this.noise(0.4, 0.35, 200); this.blip(90, 0.5, 'sawtooth', 0.25, 0.3); },
  ui: function () { this.blip(520, 0.05, 'square', 0.16); },
  win: function () {
    var f = [523, 659, 784, 1047];
    for (var i = 0; i < 4; i++) this.blip(f[i], 0.22, 'triangle', 0.3, null, i * 0.11);
  }
};

/* ---------- input (hardening #2 #3: pointerId maps, cancel, blur release) ---------- */
var Input = {
  pointers: {},      // id -> {x,y,down}
  primaryId: null,
  keys: {},
  tapQueue: [],
  canvas: null,
  onDown: null, onMove: null, onUp: null, onCancel: null, onKey: null,
  reset: function () {
    this.pointers = {};
    this.primaryId = null;
    this.keys = {};
    this.tapQueue.length = 0;
  },
  toLocal: function (cx, cy) {
    var r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return { x: 0, y: 0 };
    return { x: (cx - r.left) / r.width * VW, y: (cy - r.top) / r.height * VH };
  },
  attach: function (canvas) {
    var self = this;
    this.canvas = canvas;
    var down = function (e) {
      e.preventDefault();
      if (document.hidden || (typeof paused !== 'undefined' && paused)) return;
      var p = self.toLocal(e.clientX, e.clientY);
      self.pointers[e.pointerId] = { x: p.x, y: p.y, down: true, id: e.pointerId };
      if (self.primaryId === null) self.primaryId = e.pointerId;
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (er) {} }
      if (self.onDown) self.onDown(p.x, p.y, e.pointerId);
    };
    var move = function (e) {
      e.preventDefault();
      var rec = self.pointers[e.pointerId];
      if (!rec) return;
      var p = self.toLocal(e.clientX, e.clientY);
      rec.x = p.x; rec.y = p.y;
      if (self.onMove) self.onMove(p.x, p.y, e.pointerId);
    };
    var up = function (e) {
      e.preventDefault();
      var rec = self.pointers[e.pointerId];
      var p = rec ? { x: rec.x, y: rec.y } : self.toLocal(e.clientX, e.clientY);
      delete self.pointers[e.pointerId];
      if (self.primaryId === e.pointerId) self.primaryId = null;
      if (rec && self.onUp) self.onUp(p.x, p.y, e.pointerId);
    };
    canvas.addEventListener('pointerdown', down, { passive: false });
    canvas.addEventListener('pointermove', move, { passive: false });
    var cancel = function (e) {
      e.preventDefault();
      var rec = self.pointers[e.pointerId];
      delete self.pointers[e.pointerId];
      if (self.primaryId === e.pointerId) self.primaryId = null;
      if (rec && self.onCancel) self.onCancel(e.pointerId);
    };
    canvas.addEventListener('pointerup', up, { passive: false });
    canvas.addEventListener('pointercancel', cancel, { passive: false });
    canvas.addEventListener('lostpointercapture', cancel, { passive: false });
    canvas.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    window.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === ' ' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') e.preventDefault();
      if (document.hidden || (typeof paused !== 'undefined' && paused)) { self.releaseAll(); return; }
      if (self.keys[k]) return;
      self.keys[k] = true;
      if (self.onKey) self.onKey(k);
    });
    window.addEventListener('keyup', function (e) { delete self.keys[e.key]; });
    window.addEventListener('blur', function () { self.releaseAll(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) self.releaseAll(); });
  },
  releaseAll: function () {
    var ids = Object.keys(this.pointers);
    for (var i = 0; i < ids.length; i++) {
      var rec = this.pointers[ids[i]];
      delete this.pointers[ids[i]];
      if (rec && this.onCancel) this.onCancel(rec.id);
    }
    this.primaryId = null;
    this.keys = {};
    this.tapQueue.length = 0;
  }
};

/* ---------- particles + floaters (hardening #5: hard caps) ---------- */
var MAXP = 260, MAXF = 36;
var FX = {
  parts: [], floats: [], shake: 0, flash: 0, flashCol: '#fff',
  burst: function (x, y, col, n, spd) {
    n = Math.min(n, 26);
    for (var i = 0; i < n; i++) {
      if (this.parts.length >= MAXP) this.parts.shift();
      var a = Math.random() * Math.PI * 2, s = rnd(0.4, 1) * (spd || 150);
      this.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.3, 0.7), t: 0, col: col, r: rnd(2, 4.5) });
    }
  },
  float: function (x, y, text, col, size) {
    if (this.floats.length >= MAXF) this.floats.shift();
    this.floats.push({ x: x, y: y, text: text, col: col || '#fff', t: 0, life: 1.1, size: size || 15 });
  },
  hit: function (mag) { this.shake = Math.min(14, this.shake + mag); },
  bang: function (col, amt) { this.flash = Math.min(1, this.flash + (amt || 0.5)); this.flashCol = col || '#fff'; },
  clear: function () { this.parts.length = 0; this.floats.length = 0; this.shake = 0; this.flash = 0; },
  update: function (dt) {
    var i, p;
    for (i = this.parts.length - 1; i >= 0; i--) {
      p = this.parts[i]; p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 320 * dt; p.vx *= 0.98;
    }
    for (i = this.floats.length - 1; i >= 0; i--) {
      p = this.floats[i]; p.t += dt;
      if (p.t >= p.life) { this.floats.splice(i, 1); continue; }
      p.y -= 26 * dt;
    }
    this.shake *= Math.pow(0.0016, dt);
    if (this.shake < 0.05) this.shake = 0;
    this.flash -= dt * 2.6; if (this.flash < 0) this.flash = 0;
  },
  draw: function (ctx) {
    var i, p;
    for (i = 0; i < this.parts.length; i++) {
      p = this.parts[i];
      var a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < this.floats.length; i++) {
      p = this.floats[i];
      var k = p.t / p.life;
      ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
      ctx.font = '700 ' + p.size + 'px ui-sans-serif,system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.col;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
};

/* ---------- dt-driven timer scheduler (no setTimeout in sim; clearable) ---------- */
var Timers = {
  list: [],
  after: function (t, fn) {
    if (this.list.length > 64) this.list.length = 0;
    this.list.push({ t: t, fn: fn });
  },
  clear: function () { this.list.length = 0; },
  update: function (dt) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var e = this.list[i];
      e.t -= dt;
      if (e.t <= 0) { this.list.splice(i, 1); e.fn(); }
    }
  }
};

/* ---------- drawing helpers ---------- */
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function txt(ctx, s, x, y, size, col, align, weight) {
  ctx.font = (weight || 600) + ' ' + size + 'px ui-sans-serif,system-ui,sans-serif';
  ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}
function bar(ctx, x, y, w, h, pct, col, bg) {
  ctx.fillStyle = bg || '#161c2b'; rrect(ctx, x, y, w, h, h / 2); ctx.fill();
  var p = clamp(pct, 0, 1);
  if (p > 0) { ctx.fillStyle = col; rrect(ctx, x, y, Math.max(h, w * p), h, h / 2); ctx.fill(); }
}
