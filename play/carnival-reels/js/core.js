/* Carnival Reels - core: storage, audio, input, timers, draw helpers. */
(function (root) {
  'use strict';

  var U = {};
  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
  U.easeInOut = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  U.fmt = function (n) {
    n = Math.round(n);
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };
  U.pct = function (p, d) { return (p * 100).toFixed(d === undefined ? 1 : d) + '%'; };
  U.oneIn = function (p) {
    if (!p || !isFinite(p) || p <= 0) return '-';
    var x = 1 / p;
    return '1 in ' + (x >= 1000 ? U.fmt(x) : x.toFixed(x < 20 ? 1 : 0));
  };
  U.mx = function (m) { return (m >= 100 ? m.toFixed(0) : m.toFixed(m < 10 ? 2 : 1)).replace(/\.?0+$/, '') + 'x'; };

  /* ---------------- storage (hardening #4) ---------------- */
  var KEY = 'carnivalReels.v1';
  var Store = {
    ok: true,
    read: function () {
      var d = null;
      try {
        var raw = root.localStorage ? root.localStorage.getItem(KEY) : null;
        if (typeof raw === 'string' && raw.length && raw.length < 200000) d = JSON.parse(raw);
      } catch (e) { Store.ok = false; d = null; }
      if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
      return d;
    },
    write: function (obj) {
      try {
        if (root.localStorage) root.localStorage.setItem(KEY, JSON.stringify(obj));
      } catch (e) { Store.ok = false; }
    },
    num: function (v, def, lo, hi) {
      var n = typeof v === 'number' ? v : parseFloat(v);
      if (typeof n !== 'number' || !isFinite(n) || isNaN(n)) return def;
      if (lo !== undefined && n < lo) return lo;
      if (hi !== undefined && n > hi) return hi;
      return n;
    },
    obj: function (v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; },
    bool: function (v, def) { return typeof v === 'boolean' ? v : def; },
    str: function (v, def, allow) {
      if (typeof v !== 'string') return def;
      if (allow && allow.indexOf(v) < 0) return def;
      return v;
    }
  };

  /* ---------------- timers (hardening #2) ---------------- */
  var Timers = {
    ids: [],
    set: function (fn, ms) {
      var id = root.setTimeout(function () {
        var k = Timers.ids.indexOf(id); if (k >= 0) Timers.ids.splice(k, 1);
        fn();
      }, ms);
      Timers.ids.push(id);
      if (Timers.ids.length > 64) { root.clearTimeout(Timers.ids.shift()); }
      return id;
    },
    clearAll: function () {
      for (var i = 0; i < Timers.ids.length; i++) root.clearTimeout(Timers.ids[i]);
      Timers.ids.length = 0;
    }
  };

  /* ---------------- audio (WebAudio synthesis only) ---------------- */
  var Audio = {
    ctx: null, master: null, muted: false, ready: false,
    unlock: function () {
      if (Audio.ctx) { if (Audio.ctx.state === 'suspended') Audio.ctx.resume(); return; }
      try {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        Audio.ctx = new AC();
        Audio.master = Audio.ctx.createGain();
        Audio.master.gain.value = 0.5;
        Audio.master.connect(Audio.ctx.destination);
        Audio.ready = true;
        if (Audio.ctx.state === 'suspended') Audio.ctx.resume();
      } catch (e) { Audio.ready = false; }
    },
    tone: function (freq, dur, type, vol, delay, slideTo) {
      if (!Audio.ready || Audio.muted) return;
      try {
        var c = Audio.ctx, t0 = c.currentTime + (delay || 0);
        var o = c.createOscillator(), g = c.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, t0);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.15), t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(Audio.master);
        o.start(t0); o.stop(t0 + dur + 0.03);
      } catch (e) { }
    },
    noise: function (dur, vol, delay, hp) {
      if (!Audio.ready || Audio.muted) return;
      try {
        var c = Audio.ctx, t0 = c.currentTime + (delay || 0);
        var n = Math.max(1, (c.sampleRate * dur) | 0);
        var buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        var s = c.createBufferSource(); s.buffer = buf;
        var f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 700;
        var g = c.createGain(); g.gain.value = vol || 0.12;
        s.connect(f); f.connect(g); g.connect(Audio.master);
        s.start(t0);
      } catch (e) { }
    },
    click: function () { Audio.tone(520, 0.05, 'square', 0.09); },
    tick: function (i) { Audio.tone(300 + i * 40, 0.04, 'square', 0.07); },
    spinUp: function () { Audio.tone(160, 0.35, 'sawtooth', 0.06, 0, 420); },
    coin: function (i) { Audio.tone(760 + (i % 5) * 90, 0.12, 'triangle', 0.14); Audio.tone(1180, 0.09, 'sine', 0.08, 0.02); },
    pop: function (i) { Audio.tone(420 + Math.min(i, 8) * 70, 0.09, 'triangle', 0.1); Audio.noise(0.06, 0.05, 0, 1600); },
    lose: function () { Audio.tone(200, 0.14, 'sine', 0.05, 0, 130); },
    win: function (size) {
      var s = [0, 4, 7, 12, 16, 19, 24];
      var n = U.clamp(2 + Math.floor(size), 2, 7);
      for (var i = 0; i < n; i++) Audio.tone(330 * Math.pow(2, s[i] / 12), 0.16, 'triangle', 0.13, i * 0.06);
    },
    fanfare: function () {
      var s = [0, 7, 12, 16, 19, 24, 28, 31];
      for (var i = 0; i < s.length; i++) {
        Audio.tone(262 * Math.pow(2, s[i] / 12), 0.3, 'square', 0.11, i * 0.08);
        Audio.tone(131 * Math.pow(2, s[i] / 12), 0.3, 'triangle', 0.08, i * 0.08);
      }
      Audio.noise(0.5, 0.08, 0.6, 400);
    },
    badge: function () {
      Audio.tone(880, 0.1, 'sine', 0.12);
      Audio.tone(1320, 0.14, 'sine', 0.11, 0.08);
      Audio.tone(1760, 0.2, 'sine', 0.1, 0.16);
    }
  };

  /* ---------------- input (hardening #2 and #3) ---------------- */
  function Input(canvas, toVirtual) {
    this.canvas = canvas; this.toVirtual = toVirtual;
    this.keys = Object.create(null);
    this.pointers = Object.create(null);   // pointerId -> {x,y,btn}
    this.pressed = null;                   // currently visually-pressed control id
    this.queue = [];                       // action queue
    this.controls = [];                    // hit rects, rebuilt per frame
    this.onAction = null;
    this.enabled = true;
    var self = this;

    function down(e) {
      if (!self.enabled || document.hidden) return;
      e.preventDefault();
      var pts = e.changedTouches ? e.changedTouches : [e];
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], id = p.identifier !== undefined ? 't' + p.identifier : 'p' + (p.pointerId || 0);
        var v = self.toVirtual(p.clientX, p.clientY);
        var btn = self.hit(v.x, v.y);
        self.pointers[id] = { x: v.x, y: v.y, btn: btn ? btn.id : null };
        if (btn) self.pressed = btn.id;
      }
    }
    function move(e) {
      if (!self.enabled || document.hidden) return;
      e.preventDefault();
      var pts = e.changedTouches ? e.changedTouches : [e];
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], id = p.identifier !== undefined ? 't' + p.identifier : 'p' + (p.pointerId || 0);
        var rec = self.pointers[id]; if (!rec) continue;
        var v = self.toVirtual(p.clientX, p.clientY);
        rec.x = v.x; rec.y = v.y;
        var btn = self.hit(v.x, v.y);
        if (!btn || btn.id !== rec.btn) { if (self.pressed === rec.btn) self.pressed = null; }
        else self.pressed = rec.btn;
      }
    }
    function up(e, cancel) {
      if (!self.enabled) { self.releaseAll(); return; }
      if (e.preventDefault) e.preventDefault();
      var pts = e.changedTouches ? e.changedTouches : [e];
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], id = p.identifier !== undefined ? 't' + p.identifier : 'p' + (p.pointerId || 0);
        var rec = self.pointers[id]; if (!rec) continue;
        delete self.pointers[id];
        if (self.pressed === rec.btn) self.pressed = null;
        if (!cancel && rec.btn) {
          var v = self.toVirtual(p.clientX, p.clientY);
          var btn = self.hit(v.x, v.y);
          if (btn && btn.id === rec.btn) self.fire(rec.btn);
        }
      }
    }
    this._handlers = [];
    function on(t, ev, fn, opt) { t.addEventListener(ev, fn, opt); self._handlers.push([t, ev, fn]); }

    if (root.PointerEvent) {
      on(canvas, 'pointerdown', down, { passive: false });
      on(canvas, 'pointermove', move, { passive: false });
      on(root, 'pointerup', function (e) { up(e, false); }, { passive: false });
      on(root, 'pointercancel', function (e) { up(e, true); }, { passive: false });
    } else {
      on(canvas, 'touchstart', down, { passive: false });
      on(canvas, 'touchmove', move, { passive: false });
      on(root, 'touchend', function (e) { up(e, false); }, { passive: false });
      on(root, 'touchcancel', function (e) { up(e, true); }, { passive: false });
      on(canvas, 'mousedown', down, { passive: false });
      on(canvas, 'mousemove', move, { passive: false });
      on(root, 'mouseup', function (e) { up(e, false); }, { passive: false });
    }
    on(canvas, 'contextmenu', function (e) { e.preventDefault(); });

    on(root, 'keydown', function (e) {
      if (!self.enabled || document.hidden) { self.releaseAll(); return; }
      var k = e.key;
      if (k === ' ' || k === 'Spacebar' || k === 'ArrowLeft' || k === 'ArrowRight' ||
        k === 'ArrowUp' || k === 'ArrowDown' || k === 'Enter') e.preventDefault();
      if (self.keys[k]) return;
      self.keys[k] = 1;
      var a = self.keyMap(k);
      if (a) self.fire(a);
    });
    on(root, 'keyup', function (e) { delete self.keys[e.key]; });
    on(root, 'blur', function () { self.releaseAll(); });
    on(document, 'visibilitychange', function () { if (document.hidden) self.releaseAll(); });
  }
  Input.prototype.keyMap = function (k) {
    if (k === ' ' || k === 'Spacebar' || k === 'Enter') return 'spin';
    if (k === 'ArrowRight' || k === '+' || k === '=') return 'betUp';
    if (k === 'ArrowLeft' || k === '-' || k === '_') return 'betDown';
    if (k === '1') return 'm0'; if (k === '2') return 'm1';
    if (k === '3') return 'm2'; if (k === '4') return 'm3';
    if (k === 'ArrowDown') return 'panelNext';
    if (k === 'ArrowUp') return 'panelPrev';
    if (k === 'r' || k === 'R') return 'reset';
    if (k === 'm' || k === 'M') return 'mute';
    if (k === 'h' || k === 'H' || k === '?') return 'help';
    return null;
  };
  Input.prototype.hit = function (x, y) {
    for (var i = this.controls.length - 1; i >= 0; i--) {
      var c = this.controls[i];
      if (c.disabled) continue;
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return c;
    }
    return null;
  };
  Input.prototype.fire = function (id) {
    if (this.queue.length > 12) return;
    this.queue.push(id);
  };
  Input.prototype.drain = function (fn) {
    var q = this.queue; this.queue = [];
    for (var i = 0; i < q.length; i++) fn(q[i]);
  };
  Input.prototype.releaseAll = function () {
    this.pointers = Object.create(null);
    this.keys = Object.create(null);
    this.pressed = null;
    this.queue.length = 0;
  };
  Input.prototype.reset = function () { this.releaseAll(); this.controls.length = 0; };

  /* ---------------- particles (capped, hardening #5) ---------------- */
  function Particles(cap) {
    this.cap = cap || 200; this.list = [];
  }
  Particles.prototype.burst = function (x, y, n, color, spd, life) {
    for (var i = 0; i < n; i++) {
      if (this.list.length >= this.cap) this.list.shift();
      var a = Math.random() * Math.PI * 2, s = (spd || 120) * (0.35 + Math.random() * 0.9);
      this.list.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        life: life || 0.7, max: life || 0.7, c: color || '#ffd36b', r: 2 + Math.random() * 3
      });
    }
  };
  Particles.prototype.update = function (dt) {
    var l = this.list;
    for (var i = l.length - 1; i >= 0; i--) {
      var p = l[i];
      p.life -= dt;
      if (p.life <= 0) { l.splice(i, 1); continue; }
      p.vy += 620 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.99;
    }
    if (l.length > this.cap) l.splice(0, l.length - this.cap);
  };
  Particles.prototype.draw = function (g) {
    var l = this.list;
    for (var i = 0; i < l.length; i++) {
      var p = l[i], a = p.life / p.max;
      g.globalAlpha = a < 0 ? 0 : a;
      g.fillStyle = p.c;
      g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    g.globalAlpha = 1;
  };
  Particles.prototype.clear = function () { this.list.length = 0; };

  /* ---------------- draw helpers ---------------- */
  var D = {};
  D.rr = function (g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  };
  D.text = function (g, s, x, y, size, color, align, weight) {
    g.font = (weight || '600') + ' ' + size + 'px ui-monospace, Menlo, Consolas, monospace';
    g.textAlign = align || 'left';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(s, x, y);
  };
  D.star = function (g, x, y, r, pts, inner) {
    g.beginPath();
    for (var i = 0; i < pts * 2; i++) {
      var rad = i % 2 ? r * inner : r, a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
      g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    g.closePath();
  };

  root.CR = { U: U, Store: Store, Timers: Timers, Audio: Audio, Input: Input, Particles: Particles, D: D };
})(window);
