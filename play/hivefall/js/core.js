/* Hivefall - core utilities: math, storage, timers, audio, particles */
(function (w) {
  'use strict';
  var HF = w.HF || (w.HF = {});

  /* ---------- math ---------- */
  HF.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  HF.lerp = function (a, b, t) { return a + (b - a) * t; };
  HF.rnd = function (a, b) { return a + Math.random() * (b - a); };
  HF.irnd = function (n) { return (Math.random() * n) | 0; };
  HF.ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  /* ---------- timers (all cancellable on restart) ---------- */
  var timers = [];
  HF.after = function (fn, ms) {
    var id = w.setTimeout(function () {
      var i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1);
      fn();
    }, ms);
    timers.push(id);
    if (timers.length > 64) { w.clearTimeout(timers.shift()); }
    return id;
  };
  HF.clearTimers = function () {
    for (var i = 0; i < timers.length; i++) w.clearTimeout(timers[i]);
    timers.length = 0;
  };

  /* ---------- storage (hardened) ---------- */
  var KEY = 'hivefall.save.v1';
  HF.defaultSave = function () {
    return { fight: 1, coins: 0, best: 1, wins: 0, gear: { dmg: 0, slow: 0, wall: 0, coin: 0 } };
  };
  function intOr(v, def, lo, hi) {
    var n = (typeof v === 'number') ? v : parseInt(v, 10);
    if (typeof n !== 'number' || !isFinite(n) || isNaN(n)) return def;
    n = Math.floor(n);
    return HF.clamp(n, lo, hi);
  }
  HF.loadSave = function () {
    var s = HF.defaultSave();
    try {
      var raw = w.localStorage ? w.localStorage.getItem(KEY) : null;
      if (typeof raw !== 'string' || !raw) return s;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || Array.isArray(o)) return s;
      s.fight = intOr(o.fight, 1, 1, 21);
      s.coins = intOr(o.coins, 0, 0, 9999999);
      s.best = intOr(o.best, 1, 1, 21);
      s.wins = intOr(o.wins, 0, 0, 999999);
      var g = (o.gear && typeof o.gear === 'object' && !Array.isArray(o.gear)) ? o.gear : {};
      s.gear.dmg = intOr(g.dmg, 0, 0, 8);
      s.gear.slow = intOr(g.slow, 0, 0, 8);
      s.gear.wall = intOr(g.wall, 0, 0, 8);
      s.gear.coin = intOr(g.coin, 0, 0, 8);
    } catch (e) { return HF.defaultSave(); }
    return s;
  };
  HF.writeSave = function (s) {
    try {
      if (!w.localStorage) return;
      w.localStorage.setItem(KEY, JSON.stringify({
        fight: s.fight, coins: s.coins, best: s.best, wins: s.wins,
        gear: { dmg: s.gear.dmg, slow: s.gear.slow, wall: s.gear.wall, coin: s.gear.coin }
      }));
    } catch (e) { /* quota / private mode: ignore */ }
  };

  /* ---------- audio (WebAudio synthesis only) ---------- */
  var AC = null, master = null, muted = false;
  HF.audio = {
    unlock: function () {
      if (AC) { if (AC.state === 'suspended') { try { AC.resume(); } catch (e) {} } return; }
      try {
        var C = w.AudioContext || w.webkitAudioContext;
        if (!C) return;
        AC = new C();
        master = AC.createGain();
        master.gain.value = 0.32;
        master.connect(AC.destination);
        if (AC.state === 'suspended') AC.resume();
      } catch (e) { AC = null; }
    },
    toggle: function () { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.32; return muted; },
    muted: function () { return muted; },
    /* generic blip */
    tone: function (freq, dur, type, vol, slideTo) {
      if (!AC || muted) return;
      try {
        var t = AC.currentTime;
        var o = AC.createOscillator(), g = AC.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, t);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol || 0.5, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + dur + 0.02);
      } catch (e) {}
    },
    noise: function (dur, vol, hp) {
      if (!AC || muted) return;
      try {
        var t = AC.currentTime, n = Math.floor(AC.sampleRate * dur);
        var buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        var src = AC.createBufferSource(); src.buffer = buf;
        var f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 500;
        var g = AC.createGain(); g.gain.value = vol || 0.35;
        src.connect(f); f.connect(g); g.connect(master);
        src.start(t);
      } catch (e) {}
    },
    sfx: function (name, n) {
      switch (name) {
        case 'swap': this.tone(420, 0.07, 'triangle', 0.25, 520); break;
        case 'bad': this.tone(150, 0.12, 'sawtooth', 0.22, 90); break;
        case 'match': this.tone(330 + Math.min(8, n || 0) * 55, 0.10, 'square', 0.3, 480 + (n || 0) * 60); break;
        case 'shoot': this.tone(760, 0.05, 'square', 0.16, 1180); break;
        case 'hit': this.noise(0.07, 0.24, 900); break;
        case 'kill': this.tone(220, 0.16, 'sawtooth', 0.28, 60); this.noise(0.12, 0.2, 400); break;
        case 'coin': this.tone(880, 0.06, 'triangle', 0.24, 1320); break;
        case 'repair': this.tone(300, 0.14, 'sine', 0.3, 600); break;
        case 'frost': this.tone(1200, 0.12, 'sine', 0.18, 700); break;
        case 'venom': this.tone(200, 0.12, 'sawtooth', 0.16, 320); break;
        case 'wall': this.noise(0.2, 0.4, 200); this.tone(90, 0.22, 'square', 0.3, 45); break;
        case 'buy': this.tone(520, 0.08, 'square', 0.28, 780); HF.after(function () { HF.audio.tone(780, 0.1, 'square', 0.24, 1040); }, 70); break;
        case 'win': [523, 659, 784, 1047].forEach(function (f, i) { HF.after(function () { HF.audio.tone(f, 0.18, 'triangle', 0.3); }, i * 110); }); break;
        case 'lose': [400, 320, 250, 170].forEach(function (f, i) { HF.after(function () { HF.audio.tone(f, 0.22, 'sawtooth', 0.26); }, i * 130); }); break;
      }
    }
  };

  /* ---------- particles (hard capped) ---------- */
  var MAXP = 190;
  HF.fx = {
    list: [],
    clear: function () { this.list.length = 0; },
    burst: function (x, y, color, n, spd, life) {
      n = n | 0;
      for (var i = 0; i < n; i++) {
        if (this.list.length >= MAXP) this.list.shift();
        var a = Math.random() * Math.PI * 2, s = HF.rnd(spd * 0.3, spd);
        this.list.push({
          x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: life || 0.5, max: life || 0.5, c: color, r: HF.rnd(1.6, 3.6)
        });
      }
    },
    text: function (x, y, str, color) {
      if (this.list.length >= MAXP) this.list.shift();
      this.list.push({ x: x, y: y, vx: 0, vy: -34, life: 0.8, max: 0.8, c: color, txt: str, r: 0 });
    },
    update: function (dt) {
      var L = this.list, k = 0;
      for (var i = 0; i < L.length; i++) {
        var p = L[i];
        p.life -= dt;
        if (p.life <= 0) continue;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (!p.txt) { p.vy += 210 * dt; p.vx *= 0.98; }
        L[k++] = p;
      }
      L.length = k;
    },
    draw: function (g) {
      var L = this.list;
      for (var i = 0; i < L.length; i++) {
        var p = L[i], a = HF.clamp(p.life / p.max, 0, 1);
        g.globalAlpha = a;
        if (p.txt) {
          g.fillStyle = p.c; g.font = 'bold 13px ui-monospace,monospace'; g.textAlign = 'center';
          g.fillText(p.txt, p.x, p.y);
        } else {
          g.fillStyle = p.c;
          g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        }
      }
      g.globalAlpha = 1;
    }
  };
})(window);
