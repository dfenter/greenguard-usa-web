/* Transit Dash - core utilities: storage, rng, audio, missions, themes */
(function (g) {
  'use strict';

  /* ---------- math ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function int(v, d) { v = Math.floor(num(v, NaN)); return isFinite(v) ? v : d; }

  /* ---------- seeded rng ---------- */
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    var f = mulberry32(seed);
    return {
      f: f,
      next: f,
      range: function (a, b) { return a + f() * (b - a); },
      int: function (a, b) { return a + Math.floor(f() * (b - a + 1)); },
      pick: function (arr) { return arr[Math.floor(f() * arr.length) % arr.length]; },
      chance: function (p) { return f() < p; }
    };
  }
  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  function hashSeed(n) {
    n = (n ^ 0x9E3779B9) >>> 0;
    n = Math.imul(n ^ (n >>> 16), 0x85EBCA6B) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 0xC2B2AE35) >>> 0;
    return (n ^ (n >>> 16)) >>> 0;
  }

  /* ---------- storage (hardening #4) ---------- */
  var KEY = 'transitdash.v1';
  function rawGet() {
    try {
      var s = window.localStorage.getItem(KEY);
      if (typeof s !== 'string' || !s) return null;
      var o = JSON.parse(s);
      if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
      return o;
    } catch (e) { return null; }
  }
  function rawSet(o) {
    try { window.localStorage.setItem(KEY, JSON.stringify(o)); return true; }
    catch (e) { return false; }
  }

  /* ---------- themes ---------- */
  var THEMES = [
    {
      id: 'yard', name: 'RAIL YARD',
      sky: ['#1b2a3d', '#0d141d'], ground: '#232c38', rail: '#37455a',
      accent: '#ffd166', prop: '#2c3a4c', fog: '#111a26',
      mix: { train: 0.34, barrier: 0.26, block: 0.22, ramp: 0.18 }
    },
    {
      id: 'rooftops', name: 'ROOFTOP LINE',
      sky: ['#3a2340', '#140d1c'], ground: '#2f2438', rail: '#4a3556',
      accent: '#ff9de2', prop: '#3d2c4a', fog: '#1a1122',
      mix: { train: 0.24, barrier: 0.3, block: 0.2, ramp: 0.26 }
    },
    {
      id: 'tunnels', name: 'DEEP TUNNEL',
      sky: ['#0f2a2b', '#05100f'], ground: '#16262a', rail: '#223a3c',
      accent: '#5ad2ff', prop: '#1b3236', fog: '#08151a',
      mix: { train: 0.3, barrier: 0.38, block: 0.2, ramp: 0.12 }
    }
  ];

  /* ---------- missions ---------- */
  var MISSIONS = [
    { id: 'slide', label: 'Slide under {n} barriers', tiers: [10, 18, 28, 40], run: false },
    { id: 'vault', label: 'Vault over {n} rail cars', tiers: [8, 14, 22, 32], run: false },
    { id: 'coins', label: 'Bank {n} tokens in one run', tiers: [50, 95, 150, 220], run: true },
    { id: 'dist', label: 'Reach {n} m in one run', tiers: [600, 1000, 1600, 2400], run: true },
    { id: 'pick', label: 'Grab {n} power pickups', tiers: [4, 8, 13, 20], run: false },
    { id: 'ramp', label: 'Launch off {n} ramps', tiers: [5, 10, 16, 24], run: false },
    { id: 'clean', label: 'Run {n} m without a stumble', tiers: [400, 700, 1100, 1600], run: true },
    { id: 'lanes', label: 'Make {n} track changes', tiers: [40, 70, 110, 160], run: false }
  ];
  function missionDef(id) {
    for (var i = 0; i < MISSIONS.length; i++) if (MISSIONS[i].id === id) return MISSIONS[i];
    return MISSIONS[0];
  }
  function missionGoal(m) {
    var d = missionDef(m.id);
    return d.tiers[clamp(m.tier, 0, d.tiers.length - 1)];
  }
  function missionText(m) {
    var d = missionDef(m.id);
    return d.label.replace('{n}', missionGoal(m)) + '  [T' + (clamp(m.tier, 0, 3) + 1) + ']';
  }

  function pickDailyMissions(day) {
    var r = makeRng(hashSeed(day));
    var pool = MISSIONS.slice();
    var out = [];
    for (var i = 0; i < 3 && pool.length; i++) {
      var k = Math.floor(r.f() * pool.length) % pool.length;
      out.push({ id: pool[k].id, tier: 0, prog: 0 });
      pool.splice(k, 1);
    }
    return out;
  }

  /* ---------- save state ---------- */
  var Save = {
    data: null,
    load: function () {
      var day = dayKey();
      var o = rawGet() || {};
      var d = {
        day: int(o.day, day),
        best: int(o.best, 0),
        coins: int(o.coins, 0),
        runs: int(o.runs, 0),
        theme: clamp(int(o.theme, 0), 0, THEMES.length - 1),
        rotations: int(o.rotations, 0),
        missions: null
      };
      var ms = Array.isArray(o.missions) ? o.missions : null;
      if (ms && d.day === day) {
        var clean = [];
        for (var i = 0; i < ms.length && clean.length < 3; i++) {
          var m = ms[i];
          if (!m || typeof m !== 'object') continue;
          if (typeof m.id !== 'string') continue;
          var found = false;
          for (var j = 0; j < MISSIONS.length; j++) if (MISSIONS[j].id === m.id) found = true;
          if (!found) continue;
          clean.push({ id: m.id, tier: clamp(int(m.tier, 0), 0, 3), prog: Math.max(0, int(m.prog, 0)) });
        }
        d.missions = clean.length === 3 ? clean : null;
      }
      if (!d.missions) { d.missions = pickDailyMissions(day); d.day = day; }
      d.best = Math.max(0, Math.min(d.best, 9999999));
      d.coins = Math.max(0, Math.min(d.coins, 9999999));
      Save.data = d;
      return d;
    },
    save: function () { if (Save.data) rawSet(Save.data); }
  };

  /* ---------- audio (WebAudio synthesis only) ---------- */
  var Audio2 = {
    ctx: null, master: null, ok: false, muted: false,
    unlock: function () {
      if (this.ctx) { if (this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) { } } return; }
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(this.ctx.destination);
        this.ok = true;
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { this.ok = false; }
    },
    tone: function (freq, dur, type, vol, slideTo) {
      if (!this.ok || this.muted) return;
      try {
        var c = this.ctx, t = c.currentTime;
        var o = c.createOscillator(), gn = c.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, t);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
        gn.gain.setValueAtTime(0.0001, t);
        gn.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012);
        gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(gn); gn.connect(this.master);
        o.start(t); o.stop(t + dur + 0.03);
      } catch (e) { }
    },
    noise: function (dur, vol, hp) {
      if (!this.ok || this.muted) return;
      try {
        var c = this.ctx, t = c.currentTime;
        var n = Math.floor(c.sampleRate * dur);
        var buf = c.createBuffer(1, Math.max(1, n), c.sampleRate);
        var ch = buf.getChannelData(0);
        for (var i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
        var s = c.createBufferSource(); s.buffer = buf;
        var f = c.createBiquadFilter(); f.type = hp ? 'highpass' : 'lowpass';
        f.frequency.value = hp || 900;
        var gn = c.createGain(); gn.gain.value = vol || 0.2;
        s.connect(f); f.connect(gn); gn.connect(this.master);
        s.start(t); s.stop(t + dur + 0.02);
      } catch (e) { }
    },
    coin: function (n) { this.tone(760 + (n % 6) * 60, 0.09, 'triangle', 0.16); },
    jump: function () { this.tone(300, 0.16, 'square', 0.14, 700); },
    slide: function () { this.noise(0.22, 0.16, 1600); },
    land: function () { this.tone(140, 0.08, 'sine', 0.16); },
    hit: function () { this.noise(0.3, 0.3, 0); this.tone(150, 0.3, 'sawtooth', 0.2, 60); },
    power: function () { this.tone(520, 0.1, 'square', 0.18, 900); this.tone(880, 0.16, 'triangle', 0.12); },
    ramp: function () { this.tone(220, 0.35, 'sawtooth', 0.16, 1200); },
    caught: function () { this.tone(400, 0.7, 'sawtooth', 0.24, 70); this.noise(0.5, 0.24, 0); },
    fanfare: function () {
      var self = this, notes = [523, 659, 784, 1046];
      for (var i = 0; i < notes.length; i++) {
        (function (f, i) { var later = g.TD.Game && g.TD.Game.later ? g.TD.Game.later.bind(g.TD.Game) : setTimeout; later(function () { self.tone(f, 0.18, 'triangle', 0.2); }, i * 90); })(notes[i], i);
      }
    }
  };

  g.TD = {
    clamp: clamp, lerp: lerp, num: num, int: int,
    makeRng: makeRng, dayKey: dayKey, hashSeed: hashSeed,
    THEMES: THEMES, MISSIONS: MISSIONS,
    missionDef: missionDef, missionGoal: missionGoal, missionText: missionText,
    pickDailyMissions: pickDailyMissions,
    Save: Save, Audio: Audio2
  };
})(window);
