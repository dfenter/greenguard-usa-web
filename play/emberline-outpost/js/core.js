/* Emberline Outpost - core: storage, audio, timers, math, particles */
var EO = window.EO || {}; window.EO = EO;

/* ---------- math ---------- */
EO.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
EO.lerp = function (a, b, t) { return a + (b - a) * t; };
EO.dist2 = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
EO.rnd = function (a, b) { return a + Math.random() * (b - a); };
EO.rndi = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };
EO.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
/* deterministic per-map rng */
EO.seeded = function (seed) {
  var s = (seed | 0) || 1;
  return function () { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 8) & 0xffffff) / 0x1000000; };
};

/* ---------- timers (all cancellable) ---------- */
EO.timers = [];
EO.after = function (ms, fn) {
  var id = setTimeout(function () {
    var i = EO.timers.indexOf(id); if (i >= 0) EO.timers.splice(i, 1);
    try { fn(); } catch (e) { }
  }, ms);
  EO.timers.push(id);
  if (EO.timers.length > 64) { var old = EO.timers.shift(); clearTimeout(old); }
  return id;
};
EO.clearTimers = function () {
  for (var i = 0; i < EO.timers.length; i++) clearTimeout(EO.timers[i]);
  EO.timers.length = 0;
};

/* ---------- storage (hardened) ---------- */
EO.SKEY = 'emberline_outpost_v1';
EO.defaultSave = function () {
  return {
    unlocked: ['blocker', 'pike'],
    cleared: 0,
    mats: { scrap: 0, ember: 0, alloy: 0 },
    kits: [null, null, null, null],
    best: {},
    seen: 0
  };
};
function numOr(v, d) { var n = (typeof v === 'number') ? v : parseFloat(v); return (isFinite(n)) ? n : d; }
EO.loadSave = function () {
  var d = EO.defaultSave();
  var raw = null;
  try { raw = localStorage.getItem(EO.SKEY); } catch (e) { return d; }
  if (!raw || typeof raw !== 'string') return d;
  var o = null;
  try { o = JSON.parse(raw); } catch (e) { return d; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return d;
  var s = EO.defaultSave();
  if (Array.isArray(o.unlocked)) {
    var u = [];
    for (var i = 0; i < o.unlocked.length && u.length < 32; i++) {
      var id = o.unlocked[i];
      if (typeof id === 'string' && EO.DEF_BY_ID && EO.DEF_BY_ID[id] && u.indexOf(id) < 0) u.push(id);
    }
    if (u.length) s.unlocked = u;
  }
  s.cleared = EO.clamp(Math.floor(numOr(o.cleared, 0)), 0, 8);
  if (o.mats && typeof o.mats === 'object') {
    s.mats.scrap = EO.clamp(Math.floor(numOr(o.mats.scrap, 0)), 0, 99999);
    s.mats.ember = EO.clamp(Math.floor(numOr(o.mats.ember, 0)), 0, 99999);
    s.mats.alloy = EO.clamp(Math.floor(numOr(o.mats.alloy, 0)), 0, 99999);
  }
  if (Array.isArray(o.kits)) {
    for (var k = 0; k < 4; k++) {
      var kid = o.kits[k];
      s.kits[k] = (typeof kid === 'string' && EO.KIT_BY_ID && EO.KIT_BY_ID[kid]) ? kid : null;
    }
    /* no duplicate kits */
    for (var a = 0; a < 4; a++) for (var b = a + 1; b < 4; b++) if (s.kits[a] && s.kits[a] === s.kits[b]) s.kits[b] = null;
  }
  if (o.best && typeof o.best === 'object' && !Array.isArray(o.best)) {
    var n = 0;
    for (var key in o.best) {
      if (!Object.prototype.hasOwnProperty.call(o.best, key)) continue;
      if (!/^m\d+$/.test(key) || +key.slice(1) >= EO.MAPS.length) continue;
      if (n++ > 16) break;
      var v = Math.floor(numOr(o.best[key], 0));
      if (v > 0) s.best[key] = EO.clamp(v, 0, 9999999);
    }
  }
  s.seen = numOr(o.seen, 0) ? 1 : 0;
  return s;
};
EO.writeSave = function (s) {
  try { localStorage.setItem(EO.SKEY, JSON.stringify(s)); } catch (e) { }
};

/* ---------- audio (WebAudio synthesis only) ---------- */
EO.audio = {
  ctx: null, master: null, ok: false, muted: false, last: 0,
  init: function () {
    if (this.ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
      this.ok = true;
    } catch (e) { this.ok = false; }
  },
  resume: function () {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) { } }
  },
  tone: function (freq, dur, type, vol, slideTo) {
    if (!this.ok || this.muted || !this.ctx) return;
    var t = this.ctx.currentTime;
    if (t - this.last < 0.012) return; this.last = t;
    try {
      var o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol || 0.2), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { }
  },
  noise: function (dur, vol, hp) {
    if (!this.ok || this.muted || !this.ctx) return;
    try {
      var t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
      if (n < 8) n = 8;
      var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var src = this.ctx.createBufferSource(); src.buffer = buf;
      var f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 400;
      var g = this.ctx.createGain(); g.gain.value = vol || 0.2;
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
    } catch (e) { }
  }
};
EO.sfx = {
  place: function () { EO.audio.tone(220, 0.09, 'square', 0.18, 440); },
  deny: function () { EO.audio.tone(150, 0.12, 'sawtooth', 0.14, 90); },
  shot: function () { EO.audio.tone(680, 0.045, 'square', 0.06, 520); },
  boom: function () { EO.audio.noise(0.22, 0.22, 240); EO.audio.tone(90, 0.2, 'sine', 0.16, 45); },
  hit: function () { EO.audio.tone(320, 0.04, 'triangle', 0.07, 240); },
  die: function () { EO.audio.noise(0.12, 0.14, 700); },
  leak: function () { EO.audio.tone(160, 0.3, 'sawtooth', 0.2, 70); },
  skill: function () { EO.audio.tone(520, 0.16, 'triangle', 0.2, 900); },
  win: function () { EO.audio.tone(440, 0.12, 'square', 0.2); EO.after(120, function () { EO.audio.tone(660, 0.12, 'square', 0.2); }); EO.after(250, function () { EO.audio.tone(880, 0.24, 'square', 0.2); }); },
  lose: function () { EO.audio.tone(300, 0.3, 'sawtooth', 0.2, 80); EO.after(200, function () { EO.audio.tone(180, 0.4, 'sawtooth', 0.18, 50); }); },
  ui: function () { EO.audio.tone(560, 0.05, 'square', 0.1); },
  craft: function () { EO.audio.tone(300, 0.1, 'triangle', 0.18, 700); EO.after(90, function () { EO.audio.tone(720, 0.14, 'triangle', 0.16, 1100); }); }
};

/* ---------- particles (capped) ---------- */
EO.PMAX = 200;
EO.Particles = function () { this.list = []; };
EO.Particles.prototype.add = function (x, y, vx, vy, life, col, size, grav) {
  if (this.list.length >= EO.PMAX) this.list.shift();
  this.list.push({ x: x, y: y, vx: vx, vy: vy, t: life, mt: life, c: col, s: size || 3, g: grav === undefined ? 40 : grav });
};
EO.Particles.prototype.burst = function (x, y, n, col, spd, size) {
  n = Math.min(n, 18);
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, s = spd * (0.4 + Math.random() * 0.8);
    this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.3 + Math.random() * 0.4, col, size || 3, 60);
  }
};
EO.Particles.prototype.update = function (dt) {
  var l = this.list;
  for (var i = l.length - 1; i >= 0; i--) {
    var p = l[i];
    p.t -= dt;
    if (p.t <= 0) { l.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
    p.vx *= (1 - 1.4 * dt);
  }
  if (l.length > EO.PMAX) l.splice(0, l.length - EO.PMAX);
};
EO.Particles.prototype.draw = function (g) {
  var l = this.list;
  for (var i = 0; i < l.length; i++) {
    var p = l[i], a = EO.clamp(p.t / p.mt, 0, 1);
    g.globalAlpha = a;
    g.fillStyle = p.c;
    var s = p.s * (0.5 + a * 0.5);
    g.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
  }
  g.globalAlpha = 1;
};
EO.Particles.prototype.clear = function () { this.list.length = 0; };
