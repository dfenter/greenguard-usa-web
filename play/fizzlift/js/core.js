/* Fizzlift - core utilities: rng, storage, audio. All original. */
var FZ = window.FZ || {};
window.FZ = FZ;

FZ.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
FZ.lerp = function (a, b, t) { return a + (b - a) * t; };

/* deterministic xorshift32 */
FZ.rng = function (seed) {
  var s = (seed >>> 0) || 0x9e3779b9;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
};

/* ---------- storage (hardening #4) ---------- */
FZ.store = (function () {
  var KEY = 'fizzlift.save.v1';
  var MAXLEVELS = 40;

  function blank() { return { stars: {}, best: 0, unlocked: 1, mute: false }; }

  function num(v, lo, hi, dflt) {
    if (typeof v !== 'number' || !isFinite(v)) return dflt;
    v = Math.floor(v);
    if (v !== v) return dflt;
    return FZ.clamp(v, lo, hi);
  }

  function load() {
    var d = blank();
    try {
      var raw = null;
      try { raw = window.localStorage.getItem(KEY); } catch (e) { return d; }
      if (typeof raw !== 'string' || !raw) return d;
      var o = null;
      try { o = JSON.parse(raw); } catch (e) { return d; }
      if (!o || typeof o !== 'object' || Array.isArray(o)) return d;
      if (o.stars && typeof o.stars === 'object' && !Array.isArray(o.stars)) {
        var keys = Object.keys(o.stars).slice(0, MAXLEVELS);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (!/^\d{1,3}$/.test(k)) continue;
          var v = num(o.stars[k], 0, 3, 0);
          if (v > 0) d.stars[k] = v;
        }
      }
      d.best = num(o.best, 0, 99999999, 0);
      d.unlocked = num(o.unlocked, 1, MAXLEVELS, 1);
      d.mute = o.mute === true;
    } catch (e) { return blank(); }
    return d;
  }

  function save(d) {
    try {
      if (!d || typeof d !== 'object') return;
      var out = { stars: {}, best: num(d.best, 0, 99999999, 0), unlocked: num(d.unlocked, 1, MAXLEVELS, 1), mute: d.mute === true };
      var keys = Object.keys(d.stars || {}).slice(0, MAXLEVELS);
      for (var i = 0; i < keys.length; i++) out.stars[keys[i]] = num(d.stars[keys[i]], 0, 3, 0);
      window.localStorage.setItem(KEY, JSON.stringify(out));
    } catch (e) { /* quota / private mode: ignore */ }
  }

  return { load: load, save: save, blank: blank };
})();

/* ---------- audio: WebAudio synthesis only ---------- */
FZ.audio = (function () {
  var ctx = null, master = null, muted = false, ready = false;

  function init() {
    if (ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      ready = true;
    } catch (e) { ctx = null; ready = false; }
  }

  function unlock() {
    init();
    if (!ctx) return;
    try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) { }
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!ready || muted || !ctx) return;
    try {
      var t0 = ctx.currentTime + (delay || 0);
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol || 0.3), t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) { }
  }

  function noise(dur, vol, hp) {
    if (!ready || muted || !ctx) return;
    try {
      var n = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, n, ctx.sampleRate);
      var dat = buf.getChannelData(0);
      for (var i = 0; i < n; i++) dat[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 700;
      var g = ctx.createGain(); g.gain.value = vol || 0.2;
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
    } catch (e) { }
  }

  return {
    unlock: unlock,
    setMuted: function (m) { muted = !!m; },
    isMuted: function () { return muted; },
    blip: function () { tone(420, 0.07, 'triangle', 0.25, 620); },
    deny: function () { tone(150, 0.12, 'sawtooth', 0.16, 90); },
    match: function (chain) {
      var c = FZ.clamp(chain || 0, 0, 8);
      tone(330 * Math.pow(1.122, c), 0.16, 'triangle', 0.3, 495 * Math.pow(1.122, c));
      noise(0.09, 0.1, 1600);
    },
    fizz: function () { noise(0.22, 0.09, 2400); },
    pop: function () {
      tone(700, 0.16, 'sine', 0.32, 1500);
      tone(1180, 0.1, 'sine', 0.14, 1900, 0.04);
      noise(0.12, 0.12, 2000);
    },
    crack: function () { tone(220, 0.14, 'square', 0.2, 120); noise(0.16, 0.16, 900); },
    valve: function () { tone(180, 0.4, 'sawtooth', 0.16, 520); noise(0.35, 0.08, 1200); },
    win: function () {
      var s = [523, 659, 784, 1046];
      for (var i = 0; i < s.length; i++) tone(s[i], 0.3, 'triangle', 0.26, 0, i * 0.09);
    },
    lose: function () { tone(300, 0.5, 'sawtooth', 0.22, 90); noise(0.4, 0.08, 300); }
  };
})();
