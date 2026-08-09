/* Willowmere - core: math, storage, audio, input, particles, timers */
'use strict';

var VW = 390, VH = 700;            // virtual (logical) portrait resolution
var MAXAXIS = 960;                 // backing-store cap on long axis

/* ---------- math ---------- */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function ri(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
function int(v, d) { v = num(v, NaN); return isFinite(v) ? Math.round(v) : d; }
function str(v, d) { return (typeof v === 'string') ? v : d; }
function bool(v) { return v === true; }
function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
function arr(v) { return Array.isArray(v) ? v : []; }

/* ---------- storage (hardening #4) ---------- */
var SKEY = 'willowmere.save.v1';
var Store = {
  read: function () {
    try {
      var raw = window.localStorage.getItem(SKEY);
      if (typeof raw !== 'string' || !raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
      return o;
    } catch (e) { return null; }
  },
  write: function (o) {
    try { window.localStorage.setItem(SKEY, JSON.stringify(o)); return true; }
    catch (e) { return false; }
  },
  wipe: function () { try { window.localStorage.removeItem(SKEY); } catch (e) { } }
};

/* ---------- timers (hardening #2) ---------- */
var Timers = {
  ids: [],
  set: function (fn, ms) {
    var self = this;
    var id = setTimeout(function () {
      var i = self.ids.indexOf(id); if (i >= 0) self.ids.splice(i, 1);
      fn();
    }, ms);
    this.ids.push(id);
    if (this.ids.length > 64) { clearTimeout(this.ids.shift()); }
    return id;
  },
  clearAll: function () {
    for (var i = 0; i < this.ids.length; i++) clearTimeout(this.ids[i]);
    this.ids.length = 0;
  }
};

/* ---------- audio (WebAudio synthesis only) ---------- */
var Snd = {
  ctx: null, master: null, on: true,
  init: function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) { } } return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  tone: function (freq, dur, type, vol, slide) {
    if (!this.ctx || !this.on) return;
    try {
      var t = this.ctx.currentTime;
      var o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol || 0.2), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.03);
    } catch (e) { }
  },
  noise: function (dur, vol, hp) {
    if (!this.ctx || !this.on) return;
    try {
      var t = this.ctx.currentTime;
      var n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = this.ctx.createBufferSource(); s.buffer = buf;
      var f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 400;
      var g = this.ctx.createGain(); g.gain.value = vol || 0.15;
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t); s.stop(t + dur + 0.02);
    } catch (e) { }
  },
  step: function () { this.tone(rnd(150, 200), 0.05, 'triangle', 0.05); },
  tap: function () { this.tone(520, 0.07, 'sine', 0.14, 700); },
  bad: function () { this.tone(180, 0.16, 'square', 0.1, 90); },
  splash: function () { this.noise(0.28, 0.16, 300); },
  bite: function () { this.tone(880, 0.09, 'square', 0.12); this.tone(660, 0.12, 'square', 0.09); },
  hit: function (i) { this.tone(500 + i * 130, 0.1, 'triangle', 0.16); },
  catchFx: function () {
    var self = this, n = [523, 659, 784, 1046];
    for (var i = 0; i < 4; i++) (function (k) {
      Timers.set(function () { self.tone(n[k], 0.18, 'sine', 0.16); }, k * 75);
    })(i);
  },
  pickup: function () { this.tone(680, 0.09, 'sine', 0.13, 900); },
  craft: function () { this.tone(320, 0.1, 'square', 0.11); Timers.set(function () { Snd.tone(480, 0.16, 'triangle', 0.14); }, 90); },
  heart: function () { this.tone(660, 0.12, 'sine', 0.15); Timers.set(function () { Snd.tone(880, 0.2, 'sine', 0.13); }, 100); },
  page: function () { this.tone(420, 0.05, 'sine', 0.08); },
  fanfare: function () {
    var self = this, n = [392, 523, 659, 784, 1046, 1318];
    for (var i = 0; i < 6; i++) (function (k) {
      Timers.set(function () { self.tone(n[k], 0.35, 'triangle', 0.16); }, k * 130);
    })(i);
  }
};

/* ---------- input (hardening #2/#3) ---------- */
var Input = {
  pointers: {},        // id -> {x,y,ox,oy,btn,claim}
  keys: {},
  order: [],
  reset: function () {
    this.pointers = {}; this.keys = {}; this.order.length = 0;
  },
  releaseKeys: function () { this.keys = {}; },
  add: function (id, x, y) {
    this.pointers[id] = { id: id, x: x, y: y, ox: x, oy: y, btn: null, claim: null, moved: false, t: 0 };
    this.order.push(id);
    if (this.order.length > 12) { var d = this.order.shift(); delete this.pointers[d]; }
    return this.pointers[id];
  },
  get: function (id) { return this.pointers[id] || null; },
  del: function (id) {
    delete this.pointers[id];
    var i = this.order.indexOf(id); if (i >= 0) this.order.splice(i, 1);
  },
  count: function () { return this.order.length; }
};

/* ---------- particles (hardening #5) ---------- */
var PMAX = 170;
var Parts = {
  list: [],
  add: function (x, y, vx, vy, life, col, size, grav, kind) {
    if (this.list.length >= PMAX) this.list.shift();
    this.list.push({ x: x, y: y, vx: vx, vy: vy, l: life, ml: life, c: col, s: size || 3, g: grav === undefined ? 40 : grav, k: kind || 0 });
  },
  burst: function (x, y, n, col, spd, life, grav) {
    n = Math.min(n, 26);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = rnd(spd * 0.3, spd);
      this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(life * 0.6, life), col, rnd(2, 4.5), grav);
    }
  },
  update: function (dt) {
    var l = this.list;
    for (var i = l.length - 1; i >= 0; i--) {
      var p = l[i];
      p.l -= dt;
      if (p.l <= 0) { l.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      p.vx *= (1 - 1.2 * dt);
    }
    if (l.length > PMAX) l.splice(0, l.length - PMAX);
  },
  draw: function (g) {
    var l = this.list;
    for (var i = 0; i < l.length; i++) {
      var p = l[i], a = clamp(p.l / p.ml, 0, 1);
      g.globalAlpha = a; g.fillStyle = p.c;
      if (p.k === 1) { g.fillRect(p.x - p.s, p.y - p.s * 0.6, p.s * 2, p.s * 1.2); }
      else { g.beginPath(); g.arc(p.x, p.y, p.s * (0.4 + a * 0.6), 0, 6.2832); g.fill(); }
    }
    g.globalAlpha = 1;
  },
  clear: function () { this.list.length = 0; }
};

/* ---------- drawing helpers ---------- */
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function fillRR(g, x, y, w, h, r, col) { rr(g, x, y, w, h, r); g.fillStyle = col; g.fill(); }
function txt(g, s, x, y, size, col, align, weight) {
  g.font = (weight || 600) + ' ' + size + 'px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
  g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillStyle = col;
  g.fillText(s, x, y);
}
function wrap(g, s, size, maxw) {
  g.font = '500 ' + size + 'px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
  var words = String(s).split(' '), lines = [], cur = '';
  for (var i = 0; i < words.length; i++) {
    var t = cur ? cur + ' ' + words[i] : words[i];
    if (g.measureText(t).width > maxw && cur) { lines.push(cur); cur = words[i]; }
    else cur = t;
    if (lines.length > 12) break;
  }
  if (cur) lines.push(cur);
  return lines;
}
