/* Reef Tiles - core engine: canvas, rng, storage, audio, input, ui helpers, particles */
(function () {
  'use strict';
  var G = (window.G = {});

  /* ---------- math ---------- */
  G.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  G.lerp = function (a, b, t) { return a + (b - a) * t; };
  G.dist = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); };
  G.mulberry32 = function (a) {
    a = a | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---------- storage (hardening #4) ---------- */
  G.store = {
    get: function (key, fallback, validate) {
      try {
        var raw = localStorage.getItem(key);
        if (raw === null || raw === undefined || raw === 'undefined') return fallback;
        var v = JSON.parse(raw);
        if (v === null || v === undefined) return fallback;
        if (validate && !validate(v)) return fallback;
        return v;
      } catch (e) { return fallback; }
    },
    set: function (key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota / private mode */ }
    }
  };
  G.num = function (v, def, lo, hi) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n) || isNaN(n)) return def;
    if (lo !== undefined) n = Math.max(lo, n);
    if (hi !== undefined) n = Math.min(hi, n);
    return n;
  };
  G.int = function (v, def, lo, hi) { return Math.round(G.num(v, def, lo, hi)); };

  /* ---------- timers (hardening #2) ---------- */
  G.timers = [];
  G.after = function (ms, fn) {
    var id = setTimeout(function () {
      var i = G.timers.indexOf(id); if (i >= 0) G.timers.splice(i, 1);
      fn();
    }, ms);
    G.timers.push(id);
    if (G.timers.length > 32) { clearTimeout(G.timers.shift()); }
    return id;
  };
  G.clearTimers = function () {
    for (var i = 0; i < G.timers.length; i++) clearTimeout(G.timers[i]);
    G.timers.length = 0;
  };

  /* ---------- audio (WebAudio synthesis only) ---------- */
  var A = G.audio = {
    ctx: null, master: null, ready: false, muted: false,
    init: function () {
      if (this.ctx) { this.resume(); return; }
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
        this.ready = true;
        this.resume();
      } catch (e) { this.ctx = null; this.ready = false; }
    },
    resume: function () { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) { } },
    tone: function (f0, f1, dur, type, vol, delay) {
      if (!this.ready || this.muted || !this.ctx) return;
      try {
        var c = this.ctx, t0 = c.currentTime + (delay || 0);
        var o = c.createOscillator(), g = c.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(f0, t0);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol === undefined ? 0.3 : vol), t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(this.master);
        o.start(t0); o.stop(t0 + dur + 0.03);
      } catch (e) { }
    },
    noise: function (dur, vol, hp, delay) {
      if (!this.ready || this.muted || !this.ctx) return;
      try {
        var c = this.ctx, t0 = c.currentTime + (delay || 0);
        var n = Math.floor(c.sampleRate * dur);
        var buf = c.createBuffer(1, Math.max(16, n), c.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        var s = c.createBufferSource(); s.buffer = buf;
        var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hp || 900; f.Q.value = 0.9;
        var g = c.createGain(); g.gain.value = vol === undefined ? 0.25 : vol;
        s.connect(f); f.connect(g); g.connect(this.master);
        s.start(t0); s.stop(t0 + dur + 0.02);
      } catch (e) { }
    },
    sfx: function (name, arg) {
      switch (name) {
        case 'match': this.tone(420 + (arg || 0) * 90, 700 + (arg || 0) * 120, 0.13, 'triangle', 0.3); break;
        case 'swap': this.tone(300, 380, 0.07, 'sine', 0.18); break;
        case 'bad': this.tone(200, 140, 0.12, 'sawtooth', 0.14); break;
        case 'special': this.tone(520, 1180, 0.26, 'square', 0.16); this.noise(0.22, 0.16, 1600); break;
        case 'pop': this.noise(0.09, 0.14, 1500 + Math.random() * 900); break;
        case 'tap': this.tone(660, 880, 0.05, 'sine', 0.14); break;
        case 'buy': this.tone(520, 780, 0.09, 'triangle', 0.24); this.tone(780, 1040, 0.12, 'triangle', 0.18, 0.09); break;
        case 'plop': this.tone(240, 620, 0.1, 'sine', 0.2); break;
        case 'eat': this.tone(700 + Math.random() * 160, 380, 0.07, 'sine', 0.14); break;
        case 'win':
          [523, 659, 784, 1046].forEach(function (f, i) { A.tone(f, f, 0.24, 'triangle', 0.22, i * 0.1); });
          break;
        case 'lose': this.tone(340, 110, 0.55, 'sawtooth', 0.16); break;
        case 'unlock': this.tone(392, 392, 0.16, 'square', 0.16); this.tone(587, 784, 0.3, 'square', 0.16, 0.14); break;
      }
    }
  };

  /* ---------- canvas ---------- */
  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d', { alpha: false });
  G.cv = cv; G.ctx = ctx;
  G.W = 390; G.H = 700; G.scale = 1;
  G.landscape = false;

  G.resize = function () {
    var w = Math.max(240, window.innerWidth || 390);
    var h = Math.max(320, window.innerHeight || 700);
    G.W = w; G.H = h;
    G.landscape = w > h * 1.02;
    var s = Math.min(2, window.devicePixelRatio || 1);
    var long = Math.max(w, h);
    if (long * s > 960) s = 960 / long;
    s = Math.max(0.6, s);
    G.scale = s;
    cv.width = Math.round(w * s);
    cv.height = Math.round(h * s);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    if (G.onResize) G.onResize();
  };

  /* ---------- particles (capped, hardening #5) ---------- */
  var PART_MAX = 200;
  G.parts = [];
  G.spark = function (x, y, col, n, spd, life, grav, size) {
    n = n || 6;
    for (var i = 0; i < n; i++) {
      if (G.parts.length >= PART_MAX) G.parts.shift();
      var a = Math.random() * Math.PI * 2, v = (spd || 90) * (0.35 + Math.random() * 0.9);
      G.parts.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: (life || 0.5) * (0.6 + Math.random() * 0.7), max: (life || 0.5),
        c: col || '#8ef', g: grav === undefined ? 260 : grav, r: (size || 3.4) * (0.6 + Math.random() * 0.8)
      });
    }
  };
  G.updateParts = function (dt) {
    for (var i = G.parts.length - 1; i >= 0; i--) {
      var p = G.parts[i];
      p.life -= dt;
      if (p.life <= 0) { G.parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.vx *= (1 - 1.6 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    if (G.parts.length > PART_MAX) G.parts.splice(0, G.parts.length - PART_MAX);
  };
  G.drawParts = function () {
    var c = ctx;
    for (var i = 0; i < G.parts.length; i++) {
      var p = G.parts[i];
      var a = G.clamp(p.life / Math.max(0.05, p.max), 0, 1);
      c.globalAlpha = a;
      c.fillStyle = p.c;
      c.beginPath(); c.arc(p.x, p.y, p.r * (0.4 + a * 0.8), 0, 6.2832); c.fill();
    }
    c.globalAlpha = 1;
  };

  /* ---------- screen shake ---------- */
  G.shake = 0;
  G.addShake = function (v) { G.shake = Math.min(16, G.shake + v); };

  /* ---------- text helpers ---------- */
  G.text = function (s, x, y, size, col, align, weight) {
    ctx.font = (weight || '700') + ' ' + size + 'px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col || '#eaf6ff';
    ctx.fillText(s, x, y);
  };
  G.rr = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  /* ---------- immediate-mode buttons + keyboard focus ---------- */
  G.ui = {
    hits: [],
    focus: 0,
    reset: function () { this.focus = 0; },
    clearFrame: function () { this.hits.length = 0; },
    btn: function (x, y, w, h, label, fn, opt) {
      opt = opt || {};
      var idx = this.hits.length;
      this.hits.push({ x: x, y: y, w: w, h: h, fn: fn, dis: !!opt.disabled, label: label });
      var focused = (this.focus === idx) && G.keyMode;
      var down = false;
      G.input.pointers.forEach(function (p) {
        if (p.btnIdx === idx && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) down = true;
      });
      var c = ctx;
      c.save();
      if (down) { c.translate(0, 1.5); }
      var bg = opt.disabled ? '#123241' : (opt.bg || (down ? '#1f7fa0' : '#12586f'));
      c.fillStyle = bg;
      G.rr(x, y, w, h, opt.r === undefined ? 12 : opt.r); c.fill();
      c.strokeStyle = opt.disabled ? '#1d4557' : (focused ? '#ffe08a' : (opt.border || '#2ea9cc'));
      c.lineWidth = focused ? 3 : 2;
      G.rr(x, y, w, h, opt.r === undefined ? 12 : opt.r); c.stroke();
      if (label) G.text(label, x + w / 2, y + h / 2 + 1, opt.fs || 16, opt.disabled ? '#5b7f8e' : (opt.fg || '#eaf6ff'), 'center');
      c.restore();
      return idx;
    },
    nextFocus: function (d) {
      if (!this.hits.length) return;
      var start = this.focus, n = this.hits.length;
      for (var i = 1; i <= n; i++) {
        var k = ((start + d * i) % n + n) % n;
        if (!this.hits[k].dis) { this.focus = k; return; }
      }
    },
    activate: function () {
      var b = this.hits[this.focus];
      if (b && !b.dis && b.fn) { G.audio.sfx('tap'); b.fn(); return true; }
      return false;
    }
  };
  G.keyMode = false;

  /* ---------- input (hardening #2 #3) ---------- */
  var IN = G.input = {
    pointers: new Map(),
    keys: new Set(),
    reset: function () {
      this.pointers.clear();
      this.keys.clear();
      G.ui.focus = 0;
    }
  };

  function pos(e) {
    var r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function scr() { return G.screens[G.screen]; }

  function down(e) {
    e.preventDefault();
    var wasStarted = G.started;
    G.firstGesture();
    var p = pos(e);
    if (!wasStarted || G.paused()) return;
    var rec = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), btnIdx: -1, claim: null };
    // button hit test (frozen from last frame)
    for (var i = 0; i < G.ui.hits.length; i++) {
      var b = G.ui.hits[i];
      if (!b.dis && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { rec.btnIdx = i; break; }
    }
    IN.pointers.set(e.pointerId, rec);
    if (IN.pointers.size > 8) { var first = IN.pointers.keys().next().value, evicted = IN.pointers.get(first); IN.pointers.delete(first); var oldScreen = scr(); if (oldScreen && oldScreen.cancel) oldScreen.cancel(evicted); }
    G.keyMode = false;
    if (rec.btnIdx < 0) { var s = scr(); if (s && s.down) s.down(rec); }
  }
  function move(e) {
    e.preventDefault();
    var rec = IN.pointers.get(e.pointerId);
    if (!rec) return;
    var p = pos(e);
    rec.x = p.x; rec.y = p.y;
    if (rec.btnIdx < 0) { var s = scr(); if (s && s.move) s.move(rec); }
  }
  function up(e) {
    e.preventDefault();
    var rec = IN.pointers.get(e.pointerId);
    if (!rec) return;
    IN.pointers.delete(e.pointerId);
    var p = pos(e); rec.x = p.x; rec.y = p.y;
    if (G.paused()) return;
    if (rec.btnIdx >= 0) {
      var b = G.ui.hits[rec.btnIdx];
      if (b && !b.dis && rec.x >= b.x && rec.x <= b.x + b.w && rec.y >= b.y && rec.y <= b.y + b.h) {
        G.ui.focus = rec.btnIdx;
        G.audio.sfx('tap');
        if (b.fn) b.fn();
      }
      return;
    }
    var s = scr(); if (s && s.up) s.up(rec);
  }
  function cancel(e) {
    var rec = IN.pointers.get(e.pointerId);
    if (!rec) return;
    IN.pointers.delete(e.pointerId);
    var s = scr(); if (s && s.cancel) s.cancel(rec);
  }
  G.releaseAll = function () {
    var s = scr();
    IN.pointers.forEach(function (rec) { if (s && s.cancel) s.cancel(rec); });
    IN.pointers.clear();
    IN.keys.clear();
  };

  cv.addEventListener('pointerdown', down, { passive: false });
  cv.addEventListener('pointermove', move, { passive: false });
  cv.addEventListener('pointerup', up, { passive: false });
  cv.addEventListener('pointercancel', cancel, { passive: false });
  cv.addEventListener('pointerleave', cancel, { passive: false });
  cv.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('blur', function () { G.releaseAll(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) G.releaseAll(); });
  window.addEventListener('resize', function () { G.resize(); });
  window.addEventListener('orientationchange', function () { G.resize(); });

  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab'].indexOf(k) >= 0) e.preventDefault();
    var wasStarted = G.started;
    G.firstGesture();
    if (!wasStarted || G.paused()) return;
    IN.keys.add(k);
    G.keyMode = true;
    var s = scr();
    if (s && s.key && s.key(k, e)) return;
    if (k === 'Tab' || k === 'ArrowDown' || k === 'ArrowRight') G.ui.nextFocus(1);
    else if (k === 'ArrowUp' || k === 'ArrowLeft') G.ui.nextFocus(-1);
    else if (k === 'Enter' || k === ' ') G.ui.activate();
    else if (k === 'm' || k === 'M') { G.audio.muted = !G.audio.muted; }
  });
  window.addEventListener('keyup', function (e) { IN.keys.delete(e.key); });
})();
