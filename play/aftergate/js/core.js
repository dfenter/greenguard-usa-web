/* Aftergate - core: canvas, input, audio, storage, fx. All original. */
'use strict';

var DW = 540, DH = 960;               // design space
var cv, ctx, scale = 1, offX = 0, offY = 0;

/* ---------- math ---------- */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function rndi(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* ---------- storage (hardening 4) ---------- */
var Store = {
  get: function (key, fallback) {
    try {
      var raw = localStorage.getItem('aftergate.' + key);
      if (raw === null || raw === undefined || raw === 'undefined') return fallback;
      var v = JSON.parse(raw);
      if (v === null || v === undefined) return fallback;
      if (typeof fallback === 'number') {
        var n = Number(v);
        if (!isFinite(n)) return fallback;
        return n;
      }
      if (typeof fallback !== typeof v) return fallback;
      return v;
    } catch (e) { return fallback; }
  },
  set: function (key, val) {
    try {
      if (typeof val === 'number' && !isFinite(val)) return;
      localStorage.setItem('aftergate.' + key, JSON.stringify(val));
    } catch (e) { /* quota / private mode: ignore */ }
  }
};

/* ---------- timers (hardening 2) ---------- */
var Timers = {
  ids: [],
  after: function (ms, fn) {
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
var Sfx = {
  ac: null, master: null, on: false,
  unlock: function () {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ac.destination);
      this.on = true;
      if (this.ac.state === 'suspended') this.ac.resume();
    } catch (e) { this.on = false; }
  },
  tone: function (f0, f1, dur, type, vol) {
    if (!this.on || !this.ac) return;
    try {
      var t = this.ac.currentTime;
      var o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.5, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { }
  },
  noise: function (dur, vol, freq) {
    if (!this.on || !this.ac) return;
    try {
      var t = this.ac.currentTime, n = Math.floor(this.ac.sampleRate * dur);
      var buf = this.ac.createBuffer(1, n, this.ac.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = this.ac.createBufferSource(); s.buffer = buf;
      var f = this.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 900;
      var g = this.ac.createGain(); g.gain.value = vol || 0.4;
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
    } catch (e) { }
  },
  good: function () { this.tone(420, 900, 0.16, 'square', 0.35); },
  bad: function () { this.tone(300, 90, 0.24, 'sawtooth', 0.32); },
  hit: function () { this.noise(0.12, 0.35, 1400); },
  thud: function () { this.noise(0.22, 0.5, 320); this.tone(90, 40, 0.2, 'sine', 0.4); },
  shoot: function () { this.tone(760, 480, 0.05, 'triangle', 0.2); },
  place: function () { this.tone(300, 620, 0.09, 'triangle', 0.35); },
  wave: function () { this.tone(200, 340, 0.3, 'sawtooth', 0.25); },
  win: function () {
    var s = this, n = [523, 659, 784, 1047];
    for (var i = 0; i < 4; i++) (function (i) { Timers.after(i * 120, function () { s.tone(n[i], n[i], 0.22, 'square', 0.35); }); })(i);
  },
  lose: function () {
    var s = this, n = [392, 330, 262, 196];
    for (var i = 0; i < 4; i++) (function (i) { Timers.after(i * 150, function () { s.tone(n[i], n[i] * 0.9, 0.3, 'sawtooth', 0.32); }); })(i);
  }
};

/* ---------- input (hardening 2,3) ---------- */
var Input = {
  ptr: {},            // pointerId -> {x,y,px,py,dx,dy,down,startX,startY,moved}
  keys: {},
  taps: [],           // queued discrete taps {x,y}
  releases: [],       // queued pointer releases {id,x,y,startX,startY,cancelled}
  primaryId: null,
  reset: function () {
    this.ptr = {}; this.keys = {}; this.taps.length = 0; this.releases.length = 0; this.primaryId = null;
  },
  list: function () {
    var o = [], k; for (k in this.ptr) if (this.ptr.hasOwnProperty(k)) o.push(this.ptr[k]);
    return o;
  },
  primary: function () { return this.primaryId !== null ? this.ptr[this.primaryId] : null; },
  consumeTap: function () { return this.taps.length ? this.taps.shift() : null; },
  clearTaps: function () { this.taps.length = 0; }
};

function toDesign(cx, cy) {
  var r = cv.getBoundingClientRect();
  return { x: (cx - r.left - offX) / scale, y: (cy - r.top - offY) / scale };
}

function ptrDown(id, cx, cy) {
  var p = toDesign(cx, cy);
  Input.ptr[id] = { id: id, x: p.x, y: p.y, px: p.x, py: p.y, dx: 0, dy: 0, down: true, startX: p.x, startY: p.y, moved: false, t: performance.now() };
  if (Object.keys(Input.ptr).length > 8) ptrUp(Object.keys(Input.ptr)[0], true);
  if (Input.primaryId === null) Input.primaryId = id;
}
function ptrMove(id, cx, cy) {
  var e = Input.ptr[id]; if (!e) return;
  var p = toDesign(cx, cy);
  e.dx += p.x - e.x; e.dy += p.y - e.y;
  e.px = e.x; e.py = e.y; e.x = p.x; e.y = p.y;
  if (Math.abs(e.x - e.startX) > 8 || Math.abs(e.y - e.startY) > 8) e.moved = true;
}
function ptrUp(id, cancelled) {
  var e = Input.ptr[id]; if (!e) return;
  if (!cancelled && !e.moved && performance.now() - e.t < 700) {
    Input.taps.push({ x: e.x, y: e.y });
    if (Input.taps.length > 8) Input.taps.shift();
  }
  Input.releases.push({ id: id, x: e.x, y: e.y, startX: e.startX, startY: e.startY, cancelled: !!cancelled });
  if (Input.releases.length > 8) Input.releases.shift();
  delete Input.ptr[id];
  if (Input.primaryId === id) {
    var l = Input.list();
    Input.primaryId = l.length ? l[0].id : null;
  }
}

function bindInput() {
  var el = cv;
  var hasPointer = !!window.PointerEvent;
  if (hasPointer) {
    el.addEventListener('pointerdown', function (e) { e.preventDefault(); if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (x) { } } ptrDown(e.pointerId, e.clientX, e.clientY); Sfx.unlock(); }, { passive: false });
    el.addEventListener('pointermove', function (e) { e.preventDefault(); ptrMove(e.pointerId, e.clientX, e.clientY); }, { passive: false });
    el.addEventListener('pointerup', function (e) { e.preventDefault(); ptrUp(e.pointerId, false); }, { passive: false });
    el.addEventListener('pointercancel', function (e) { e.preventDefault(); ptrUp(e.pointerId, true); }, { passive: false });
    el.addEventListener('lostpointercapture', function (e) { ptrUp(e.pointerId, true); });
  } else {
    el.addEventListener('touchstart', function (e) {
      e.preventDefault(); Sfx.unlock();
      for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; ptrDown('t' + t.identifier, t.clientX, t.clientY); }
    }, { passive: false });
    el.addEventListener('touchmove', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; ptrMove('t' + t.identifier, t.clientX, t.clientY); }
    }, { passive: false });
    el.addEventListener('touchend', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; ptrUp('t' + t.identifier, false); }
    }, { passive: false });
    el.addEventListener('touchcancel', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; ptrUp('t' + t.identifier, true); }
    }, { passive: false });
    el.addEventListener('mousedown', function (e) { e.preventDefault(); Sfx.unlock(); ptrDown('m', e.clientX, e.clientY); }, { passive: false });
    window.addEventListener('mousemove', function (e) { ptrMove('m', e.clientX, e.clientY); });
    window.addEventListener('mouseup', function (e) { ptrUp('m', false); });
  }
  el.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === ' ' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'Enter' || k === 'Tab') e.preventDefault();
    Input.keys[k] = true;
    Sfx.unlock();
    if (typeof onKey === 'function') onKey(k);
  });
  window.addEventListener('keyup', function (e) { delete Input.keys[e.key]; });
  window.addEventListener('blur', function () { Input.reset(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) Input.reset(); });
}

/* ---------- fx: particles (capped), shake, popups ---------- */
var MAXP = 200, MAXPOP = 24;
var Fx = {
  parts: [], pops: [], shake: 0, flash: 0, flashCol: '#fff',
  clear: function () { this.parts.length = 0; this.pops.length = 0; this.shake = 0; this.flash = 0; },
  burst: function (x, y, n, col, spd) {
    spd = spd || 220;
    for (var i = 0; i < n; i++) {
      if (this.parts.length >= MAXP) this.parts.shift();
      var a = rnd(0, Math.PI * 2), s = rnd(0.3, 1) * spd;
      this.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.25, 0.6), t: 0, c: col, r: rnd(2, 5) });
    }
  },
  pop: function (x, y, txt, col) {
    if (this.pops.length >= MAXPOP) this.pops.shift();
    this.pops.push({ x: x, y: y, txt: txt, c: col || '#fff', t: 0, life: 0.9 });
  },
  kick: function (a) { this.shake = Math.min(20, this.shake + a); },
  bang: function (col, a) { this.flash = Math.max(this.flash, a || 0.5); this.flashCol = col || '#fff'; },
  update: function (dt) {
    var i, p;
    for (i = this.parts.length - 1; i >= 0; i--) {
      p = this.parts[i]; p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 480 * dt; p.vx *= 0.98;
    }
    for (i = this.pops.length - 1; i >= 0; i--) {
      p = this.pops[i]; p.t += dt;
      if (p.t >= p.life) { this.pops.splice(i, 1); continue; }
      p.y -= 46 * dt;
    }
    this.shake = Math.max(0, this.shake - dt * 60);
    this.flash = Math.max(0, this.flash - dt * 2.6);
  },
  draw: function (g) {
    var i, p;
    for (i = 0; i < this.parts.length; i++) {
      p = this.parts[i];
      g.globalAlpha = 1 - p.t / p.life;
      g.fillStyle = p.c;
      g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    g.globalAlpha = 1;
    g.textAlign = 'center';
    for (i = 0; i < this.pops.length; i++) {
      p = this.pops[i];
      g.globalAlpha = Math.min(1, (1 - p.t / p.life) * 1.6);
      g.font = 'bold 30px ui-monospace,monospace';
      g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.75)';
      g.strokeText(p.txt, p.x, p.y); g.fillStyle = p.c; g.fillText(p.txt, p.x, p.y);
    }
    g.globalAlpha = 1;
  }
};

/* ---------- draw helpers ---------- */
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r); g.closePath();
}
function txt(g, s, x, y, size, col, align, bold) {
  g.font = (bold === false ? '' : 'bold ') + size + 'px ui-monospace,Menlo,monospace';
  g.textAlign = align || 'center'; g.textBaseline = 'middle';
  g.fillStyle = col; g.fillText(s, x, y);
}
function txtO(g, s, x, y, size, col, align) {
  g.font = 'bold ' + size + 'px ui-monospace,Menlo,monospace';
  g.textAlign = align || 'center'; g.textBaseline = 'middle';
  g.lineWidth = Math.max(3, size * 0.16); g.strokeStyle = 'rgba(0,0,0,.8)';
  g.strokeText(s, x, y); g.fillStyle = col; g.fillText(s, x, y);
}
function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
