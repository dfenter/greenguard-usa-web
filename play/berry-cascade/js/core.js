/* Berry Cascade - core utilities: rng, storage, timers, audio, input, fx */
var BC = (function () {
  var BC = {};

  /* ---------- math ---------- */
  BC.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  BC.lerp = function (a, b, t) { return a + (b - a) * t; };
  BC.easeOut = function (t) { return 1 - (1 - t) * (1 - t); };
  BC.easeIn = function (t) { return t * t; };
  BC.easeInOut = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  /* ---------- seeded rng ---------- */
  BC.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---------- storage (hardening #4) ---------- */
  BC.Store = {
    KEY: 'berrycascade.v1',
    read: function () {
      var def = { stars: [], best: [], endless: 0, unlocked: 1, mute: 0 };
      try {
        var raw = window.localStorage.getItem(this.KEY);
        if (typeof raw !== 'string' || !raw) return def;
        var o = JSON.parse(raw);
        if (!o || typeof o !== 'object' || Array.isArray(o)) return def;
        var out = { stars: [], best: [], endless: 0, unlocked: 1, mute: 0 };
        var i, v;
        if (Array.isArray(o.stars)) {
          for (i = 0; i < 30; i++) {
            v = Number(o.stars[i]);
            out.stars[i] = (isFinite(v) && v > 0) ? BC.clamp(Math.floor(v), 0, 3) : 0;
          }
        } else { for (i = 0; i < 30; i++) out.stars[i] = 0; }
        if (Array.isArray(o.best)) {
          for (i = 0; i < 30; i++) {
            v = Number(o.best[i]);
            out.best[i] = (isFinite(v) && v > 0) ? Math.min(Math.floor(v), 99999999) : 0;
          }
        } else { for (i = 0; i < 30; i++) out.best[i] = 0; }
        v = Number(o.endless); out.endless = (isFinite(v) && v > 0) ? Math.min(Math.floor(v), 99999999) : 0;
        v = Number(o.unlocked); out.unlocked = (isFinite(v) && v >= 1) ? BC.clamp(Math.floor(v), 1, 30) : 1;
        out.mute = o.mute ? 1 : 0;
        return out;
      } catch (e) { return def; }
    },
    write: function (o) {
      try {
        var s = { stars: (o.stars || []).slice(0, 30), best: (o.best || []).slice(0, 30), endless: o.endless | 0, unlocked: o.unlocked | 0, mute: o.mute ? 1 : 0 };
        window.localStorage.setItem(this.KEY, JSON.stringify(s));
      } catch (e) { /* private mode / quota: ignore */ }
    }
  };

  /* ---------- timers (hardening #2) ---------- */
  BC.Timers = {
    ids: [],
    set: function (fn, ms) {
      var self = this;
      var id = window.setTimeout(function () {
        var k = self.ids.indexOf(id); if (k >= 0) self.ids.splice(k, 1);
        fn();
      }, ms);
      this.ids.push(id);
      if (this.ids.length > 64) { window.clearTimeout(this.ids.shift()); }
      return id;
    },
    clearAll: function () {
      for (var i = 0; i < this.ids.length; i++) window.clearTimeout(this.ids[i]);
      this.ids.length = 0;
    }
  };

  /* ---------- audio (WebAudio synthesis only) ---------- */
  BC.Audio = {
    ctx: null, master: null, muted: false, ok: false,
    init: function () {
      if (this.ctx) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.3;
        this.master.connect(this.ctx.destination);
        this.ok = true;
      } catch (e) { this.ok = false; }
    },
    unlock: function () {
      this.init();
      if (!this.ok) return;
      try { if (this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) { }
    },
    setMute: function (m) {
      this.muted = !!m;
      if (this.master) { try { this.master.gain.value = m ? 0 : 0.3; } catch (e) { } }
    },
    tone: function (f0, f1, dur, type, vol) {
      if (!this.ok || this.muted) return;
      try {
        var c = this.ctx, t = c.currentTime;
        var o = c.createOscillator(), g = c.createGain();
        o.type = type || 'triangle';
        o.frequency.setValueAtTime(f0, t);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol || 0.25), t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + dur + 0.02);
      } catch (e) { }
    },
    noise: function (dur, vol, cut) {
      if (!this.ok || this.muted) return;
      try {
        var c = this.ctx, t = c.currentTime;
        var n = Math.floor(c.sampleRate * dur);
        if (n < 8) n = 8;
        var buf = c.createBuffer(1, n, c.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        var src = c.createBufferSource(); src.buffer = buf;
        var f = c.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(cut || 2200, t);
        f.frequency.exponentialRampToValueAtTime(220, t + dur);
        var g = c.createGain(); g.gain.value = vol || 0.2;
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t); src.stop(t + dur + 0.02);
      } catch (e) { }
    },
    pop: function (chain) {
      var k = BC.clamp(chain || 0, 0, 12);
      this.tone(300 * Math.pow(1.09, k), 460 * Math.pow(1.09, k), 0.09, 'triangle', 0.22);
    },
    swap: function () { this.tone(220, 300, 0.06, 'sine', 0.14); },
    deny: function () { this.tone(180, 120, 0.10, 'sawtooth', 0.10); },
    special: function () { this.noise(0.30, 0.24, 3200); this.tone(520, 140, 0.25, 'square', 0.10); },
    acorn: function () { this.tone(420, 900, 0.18, 'sine', 0.2); },
    win: function () {
      var self = this, s = [392, 523, 659, 784];
      for (var i = 0; i < s.length; i++) {
        (function (f, i) { BC.Timers.set(function () { self.tone(f, f, 0.22, 'triangle', 0.22); }, i * 110); })(s[i], i);
      }
    },
    lose: function () { this.tone(240, 80, 0.5, 'sawtooth', 0.16); },
    crown: function () {
      var self = this, s = [523, 659, 784, 1047, 784, 1047, 1319];
      for (var i = 0; i < s.length; i++) {
        (function (f, i) { BC.Timers.set(function () { self.tone(f, f, 0.28, 'triangle', 0.2); }, i * 130); })(s[i], i);
      }
    }
  };

  /* ---------- input state (hardening #2, #3) ---------- */
  BC.Input = {
    pointers: {},      // pointerId -> {x,y,sx,sy,target}
    keys: {},
    reset: function () { this.pointers = {}; this.keys = {}; }
  };

  /* ---------- fx pools (hardening #5: hard caps) ---------- */
  BC.MAX_PARTS = 200;
  BC.MAX_POPUPS = 20;

  BC.Fx = {
    parts: [], pops: [], shake: 0, flash: 0,
    reset: function () { this.parts.length = 0; this.pops.length = 0; this.shake = 0; this.flash = 0; },
    burst: function (x, y, col, n, spd) {
      for (var i = 0; i < n; i++) {
        if (this.parts.length >= BC.MAX_PARTS) this.parts.shift();
        var a = Math.random() * Math.PI * 2, s = (spd || 120) * (0.35 + Math.random() * 0.9);
        this.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.42 + Math.random() * 0.35, t: 0, col: col, r: 2 + Math.random() * 3.4 });
      }
    },
    pop: function (x, y, txt, col) {
      if (this.pops.length >= BC.MAX_POPUPS) this.pops.shift();
      this.pops.push({ x: x, y: y, txt: txt, col: col || '#fff', t: 0, life: 0.9 });
    },
    kick: function (m) { this.shake = Math.min(18, this.shake + m); },
    update: function (dt) {
      var i, p;
      for (i = this.parts.length - 1; i >= 0; i--) {
        p = this.parts[i]; p.t += dt;
        if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
        p.vy += 620 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
      for (i = this.pops.length - 1; i >= 0; i--) {
        p = this.pops[i]; p.t += dt;
        if (p.t >= p.life) { this.pops.splice(i, 1); continue; }
        p.y -= 34 * dt;
      }
      this.shake *= Math.pow(0.0015, dt);
      if (this.shake < 0.1) this.shake = 0;
      this.flash -= dt * 3.2; if (this.flash < 0) this.flash = 0;
    },
    draw: function (g) {
      var i, p;
      for (i = 0; i < this.parts.length; i++) {
        p = this.parts[i];
        var a = 1 - p.t / p.life;
        g.globalAlpha = a;
        g.fillStyle = p.col;
        g.beginPath(); g.arc(p.x, p.y, p.r * (0.4 + a * 0.9), 0, 6.2832); g.fill();
      }
      g.globalAlpha = 1;
      for (i = 0; i < this.pops.length; i++) {
        p = this.pops[i];
        var k = p.t / p.life;
        g.globalAlpha = k < 0.15 ? k / 0.15 : (1 - (k - 0.15) / 0.85);
        g.font = '700 20px ui-sans-serif,system-ui,sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 4; g.strokeStyle = 'rgba(8,6,14,0.85)';
        g.strokeText(p.txt, p.x, p.y);
        g.fillStyle = p.col;
        g.fillText(p.txt, p.x, p.y);
      }
      g.globalAlpha = 1;
    }
  };

  return BC;
})();
