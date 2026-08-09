'use strict';
/* Vector Storm - engine: math, rng, input, audio, particles, view */

var TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

/* deterministic seeded rng (mulberry32) */
function makeRng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- view / canvas ---------- */
var View = {
  cv: null, ctx: null, w: 390, h: 700, scale: 1,
  init: function () {
    this.cv = document.getElementById('c');
    this.ctx = this.cv.getContext('2d', { alpha: false });
    this.resize();
    window.addEventListener('resize', this.resize.bind(this));
    window.addEventListener('orientationchange', function () {
      setTimeout(View.resize.bind(View), 250);
    });
  },
  resize: function () {
    var w = Math.max(240, window.innerWidth | 0);
    var h = Math.max(320, window.innerHeight | 0);
    this.w = w; this.h = h;
    var s = Math.min(window.devicePixelRatio || 1, 2);
    var longAxis = Math.max(w, h);
    if (longAxis * s > 960) s = 960 / longAxis;
    this.scale = s;
    this.cv.width = Math.round(w * s);
    this.cv.height = Math.round(h * s);
    this.cv.style.width = w + 'px';
    this.cv.style.height = h + 'px';
  },
  begin: function () {
    var c = this.ctx;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
  }
};

/* ---------- input: dual floating sticks + keyboard ---------- */
var Input = {
  move: { x: 0, y: 0, mag: 0 },
  aim: { x: 0, y: 0, mag: 0 },
  sticks: {},          /* pointerId -> stick */
  keys: {},
  bombEdge: false,
  anyEdge: false,      /* any press this frame (restart) */
  R: 46,               /* stick travel radius */
  bomb: { x: 0, y: 0, r: 30, hit: 42 },
  init: function () {
    var cv = View.cv, self = this;
    var opt = { passive: false };
    cv.addEventListener('pointerdown', function (e) { self.down(e); e.preventDefault(); }, opt);
    cv.addEventListener('pointermove', function (e) { self.moveEv(e); e.preventDefault(); }, opt);
    cv.addEventListener('pointerup', function (e) { self.up(e); e.preventDefault(); }, opt);
    cv.addEventListener('pointercancel', function (e) { self.up(e); e.preventDefault(); }, opt);
    document.addEventListener('touchmove', function (e) { e.preventDefault(); }, opt);
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, opt);
    window.addEventListener('keydown', function (e) {
      if (e.repeat) { e.preventDefault(); return; }
      self.keys[e.code] = 1; self.anyEdge = true; Snd.init();
      if (e.code === 'Space' || e.code === 'KeyB') self.bombEdge = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].indexOf(e.code) >= 0) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) { self.keys[e.code] = 0; });
    window.addEventListener('blur', function () { self.keys = {}; self.sticks = {}; });
  },
  down: function (e) {
    Snd.init();
    this.anyEdge = true;
    var x = e.clientX, y = e.clientY;
    if (dist2(x, y, this.bomb.x, this.bomb.y) < this.bomb.hit * this.bomb.hit) {
      this.bombEdge = true; return;
    }
    this.sticks[e.pointerId] = { side: x < View.w * 0.5 ? 0 : 1, ox: x, oy: y, x: x, y: y };
  },
  moveEv: function (e) {
    var s = this.sticks[e.pointerId];
    if (!s) return;
    s.x = e.clientX; s.y = e.clientY;
    /* let the origin trail if pushed beyond travel radius */
    var dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
    if (d > this.R) { s.ox = s.x - dx / d * this.R; s.oy = s.y - dy / d * this.R; }
  },
  up: function (e) { delete this.sticks[e.pointerId]; },
  /* build axis vectors for this frame */
  poll: function () {
    var m = this.move, a = this.aim;
    m.x = m.y = m.mag = 0; a.x = a.y = a.mag = 0;
    for (var id in this.sticks) {
      var s = this.sticks[id];
      var dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
      if (d < 7) continue;
      var mg = Math.min(d, this.R) / this.R;
      var t = s.side === 0 ? m : a;
      t.x = dx / d; t.y = dy / d; t.mag = mg;
    }
    var k = this.keys, kx = 0, ky = 0;
    if (k['KeyA']) kx -= 1; if (k['KeyD']) kx += 1;
    if (k['KeyW']) ky -= 1; if (k['KeyS']) ky += 1;
    if (kx || ky) { var kd = Math.hypot(kx, ky); m.x = kx / kd; m.y = ky / kd; m.mag = 1; }
    var ax = 0, ay = 0;
    if (k['ArrowLeft']) ax -= 1; if (k['ArrowRight']) ax += 1;
    if (k['ArrowUp']) ay -= 1; if (k['ArrowDown']) ay += 1;
    if (ax || ay) { var ad = Math.hypot(ax, ay); a.x = ax / ad; a.y = ay / ad; a.mag = 1; }
  },
  drawSticks: function (c) {
    for (var id in this.sticks) {
      var s = this.sticks[id];
      var dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
      var kx = s.ox, ky = s.oy;
      if (d > 0) { var m = Math.min(d, this.R); kx = s.ox + dx / d * m; ky = s.oy + dy / d * m; }
      var col = s.side === 0 ? '90,230,255' : '255,120,190';
      c.lineWidth = 2;
      c.strokeStyle = 'rgba(' + col + ',0.28)';
      c.beginPath(); c.arc(s.ox, s.oy, this.R, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(' + col + ',0.20)';
      c.beginPath(); c.arc(kx, ky, 20, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(' + col + ',0.7)';
      c.beginPath(); c.arc(kx, ky, 20, 0, TAU); c.stroke();
    }
  }
};

/* ---------- audio: WebAudio only, synthesized ---------- */
var Snd = {
  ctx: null, master: null, last: 0, muted: false,
  init: function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  tone: function (f0, f1, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime;
    if (t - this.last < 0.012) return;
    this.last = t;
    var o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise: function (dur, vol, f) {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = this.ctx.createBufferSource(); src.buffer = buf;
    var bp = this.ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = f || 900;
    var g = this.ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t);
  },
  shoot: function () { this.tone(760, 320, 0.06, 'square', 0.12); },
  hit: function () { this.tone(320, 120, 0.07, 'sawtooth', 0.14); },
  boom: function () { this.noise(0.35, 0.4, 700); this.tone(180, 40, 0.3, 'triangle', 0.22); },
  pop: function () { this.tone(900, 1400, 0.05, 'triangle', 0.1); },
  die: function () { this.noise(0.6, 0.5, 500); this.tone(220, 30, 0.7, 'sawtooth', 0.25); },
  wave: function () { this.tone(420, 880, 0.22, 'triangle', 0.18); },
  bombS: function () { this.noise(0.7, 0.6, 1400); this.tone(90, 25, 0.8, 'sine', 0.3); }
};

/* ---------- particles ---------- */
var Particles = {
  list: [], max: 420,
  clear: function () { this.list.length = 0; },
  burst: function (x, y, n, col, spd, life, size) {
    for (var i = 0; i < n; i++) {
      if (this.list.length >= this.max) break;
      var a = Math.random() * TAU, s = spd * (0.35 + Math.random() * 0.85);
      this.list.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        l: life * (0.6 + Math.random() * 0.6), m: life, c: col, s: size || 2.2
      });
    }
  },
  update: function (dt) {
    var L = this.list;
    for (var i = L.length - 1; i >= 0; i--) {
      var p = L[i];
      p.l -= dt;
      if (p.l <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - 1.9 * dt; p.vy *= 1 - 1.9 * dt;
    }
  },
  draw: function (c) {
    var L = this.list;
    for (var i = 0; i < L.length; i++) {
      var p = L[i], a = clamp(p.l / p.m, 0, 1);
      c.globalAlpha = a;
      c.fillStyle = p.c;
      var s = p.s * (0.4 + a * 0.8);
      c.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
    }
    c.globalAlpha = 1;
  }
};

/* ---------- shockwave ripples that warp the arena grid ---------- */
var Ripples = {
  list: [],
  add: function (x, y, amp) {
    if (this.list.length > 6) this.list.shift();
    this.list.push({ x: x, y: y, t: 0, amp: amp });
  },
  clear: function () { this.list.length = 0; },
  update: function (dt) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var r = this.list[i]; r.t += dt;
      if (r.t > 1.5) this.list.splice(i, 1);
    }
  },
  disp: function (x, y, out) {
    var dx = 0, dy = 0, L = this.list;
    for (var i = 0; i < L.length; i++) {
      var r = L[i];
      var ex = x - r.x, ey = y - r.y;
      var d = Math.sqrt(ex * ex + ey * ey) + 0.001;
      var front = r.t * 300;
      var diff = d - front;
      if (diff > 130 || diff < -130) continue;
      var k = diff / 55;
      var f = r.amp * Math.exp(-k * k) * (1 - r.t / 1.5);
      dx += ex / d * f; dy += ey / d * f;
    }
    out[0] = dx; out[1] = dy;
  }
};
