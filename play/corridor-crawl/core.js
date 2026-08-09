/* Corridor Crawl - core utilities: rng, math, audio, particles */
(function (g) {
  'use strict';

  function RNG(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  RNG.prototype.next = function () {
    var x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x; return x;
  };
  RNG.prototype.f = function () { return this.next() / 4294967296; };
  RNG.prototype.int = function (a, b) { return a + Math.floor(this.f() * (b - a + 1)); };
  RNG.prototype.pick = function (a) { return a[this.int(0, a.length - 1)]; };
  RNG.prototype.chance = function (p) { return this.f() < p; };
  RNG.prototype.shuffle = function (a) {
    for (var i = a.length - 1; i > 0; i--) { var j = this.int(0, i), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }
  function dist(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }

  /* ---- audio: tiny WebAudio blip synth, no files ---- */
  var AC = null, muted = false;
  function audioInit() {
    if (AC) return;
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (C) AC = new C();
    } catch (e) { AC = null; }
  }
  function resumeAudio() { if (AC && AC.state === 'suspended') AC.resume(); }
  function blip(freq, dur, type, vol, slide) {
    if (!AC || muted) return;
    try {
      var t = AC.currentTime;
      var o = AC.createOscillator(), gn = AC.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(vol || 0.10, t + 0.008);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn); gn.connect(AC.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { }
  }
  function noise(dur, vol) {
    if (!AC || muted) return;
    try {
      var n = Math.floor(AC.sampleRate * dur);
      var buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = AC.createBufferSource(); s.buffer = buf;
      var gn = AC.createGain(); gn.gain.value = vol || 0.08;
      var f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      s.connect(f); f.connect(gn); gn.connect(AC.destination); s.start();
    } catch (e) { }
  }

  var SFX = {
    step: function () { blip(180, 0.05, 'triangle', 0.05, 0.9); },
    hit: function () { noise(0.10, 0.10); blip(240, 0.08, 'square', 0.07, 0.5); },
    hurt: function () { blip(150, 0.18, 'sawtooth', 0.11, 0.4); },
    kill: function () { blip(420, 0.16, 'square', 0.09, 0.35); noise(0.14, 0.09); },
    pickup: function () { blip(660, 0.07, 'triangle', 0.08); blip(880, 0.09, 'triangle', 0.07); },
    quaff: function () { blip(300, 0.16, 'sine', 0.09, 2.2); },
    scroll: function () { blip(520, 0.22, 'sawtooth', 0.07, 1.8); },
    stairs: function () { blip(220, 0.20, 'sine', 0.09, 1.9); },
    bad: function () { blip(110, 0.30, 'sawtooth', 0.10, 0.6); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { blip(f, 0.28, 'triangle', 0.10); }, i * 130); }); },
    die: function () { [330, 262, 196, 130].forEach(function (f, i) { setTimeout(function () { blip(f, 0.34, 'sawtooth', 0.10); }, i * 150); }); }
  };

  /* ---- particles ---- */
  function Particles() { this.list = []; }
  Particles.prototype.burst = function (x, y, color, n, spd, life) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = (0.4 + Math.random() * 0.6) * (spd || 90);
      this.list.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: (life || 0.45) * (0.6 + Math.random() * 0.6), m: (life || 0.45), c: color, r: 1.5 + Math.random() * 2.5 });
    }
  };
  Particles.prototype.text = function (x, y, str, color) {
    this.list.push({ x: x, y: y, vx: 0, vy: -34, l: 0.75, m: 0.75, c: color, txt: str });
  };
  Particles.prototype.update = function (dt) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var p = this.list[i];
      p.l -= dt;
      if (p.l <= 0) { this.list.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (!p.txt) { p.vy += 150 * dt; p.vx *= 0.96; }
    }
  };
  Particles.prototype.draw = function (ctx) {
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i], a = Math.max(0, Math.min(1, p.l / p.m));
      ctx.globalAlpha = a;
      if (p.txt) {
        ctx.fillStyle = p.c;
        ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.txt, p.x, p.y);
      } else {
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    }
    ctx.globalAlpha = 1;
  };
  Particles.prototype.clear = function () { this.list.length = 0; };

  g.CC = {
    RNG: RNG, clamp: clamp, lerp: lerp, sign: sign, dist: dist,
    audioInit: audioInit, resumeAudio: resumeAudio, SFX: SFX,
    Particles: Particles,
    setMuted: function (v) { muted = v; }, isMuted: function () { return muted; }
  };
})(window);
