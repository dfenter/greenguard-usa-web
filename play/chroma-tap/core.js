/* Chroma Tap - core utilities: rng, safe storage, webaudio synth */
(function (g) {
  'use strict';

  /* ---------- deterministic rng ---------- */
  function rng(seed) {
    var a = (seed | 0) || 1;
    var f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = function (n) { return Math.floor(f() * n) % (n || 1); };
    f.pick = function (arr) { return arr[f.int(arr.length)]; };
    return f;
  }

  /* ---------- safe storage (hardening #4) ---------- */
  var KEY = 'chromatap.v1';
  function num(v, def, lo, hi) {
    if (typeof v !== 'number' || !isFinite(v)) return def;
    if (v < lo) return lo; if (v > hi) return hi;
    return Math.floor(v);
  }
  var Store = {
    load: function () {
      var out = { best: {}, stars: {}, unlocked: 1, mute: 0, totalStars: 0 };
      var raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { return out; }
      if (typeof raw !== 'string' || !raw) return out;
      var d = null;
      try { d = JSON.parse(raw); } catch (e) { return out; }
      if (!d || typeof d !== 'object' || Array.isArray(d)) return out;
      out.unlocked = num(d.unlocked, 1, 1, 25);
      out.mute = d.mute ? 1 : 0;
      var k, keys, i, total = 0;
      if (d.best && typeof d.best === 'object' && !Array.isArray(d.best)) {
        keys = Object.keys(d.best).slice(0, 40);
        for (i = 0; i < keys.length; i++) {
          k = keys[i];
          if (!/^\d{1,2}$/.test(k)) continue;
          var b = num(d.best[k], 0, 0, 99999999);
          if (b > 0) out.best[k] = b;
        }
      }
      if (d.stars && typeof d.stars === 'object' && !Array.isArray(d.stars)) {
        keys = Object.keys(d.stars).slice(0, 40);
        for (i = 0; i < keys.length; i++) {
          k = keys[i];
          if (!/^\d{1,2}$/.test(k)) continue;
          var s = num(d.stars[k], 0, 0, 3);
          if (s > 0) { out.stars[k] = s; total += s; }
        }
      }
      out.totalStars = total;
      return out;
    },
    save: function (data) {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          best: data.best, stars: data.stars, unlocked: data.unlocked, mute: data.mute
        }));
      } catch (e) { /* quota / private mode: ignore */ }
    }
  };

  /* ---------- webaudio synth ---------- */
  var Sfx = (function () {
    var ctx = null, master = null, muted = false, ok = false;
    function unlock() {
      if (ok) return true;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        ok = true;
      } catch (e) { ok = false; }
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return ok;
    }
    function tone(freq, dur, type, vol, slide) {
      if (!ok || muted || !ctx) return;
      try {
        var t = ctx.currentTime;
        var o = ctx.createOscillator(), gn = ctx.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
        gn.gain.setValueAtTime(0.0001, t);
        gn.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.012);
        gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(gn); gn.connect(master);
        o.start(t); o.stop(t + dur + 0.02);
      } catch (e) {}
    }
    function noise(dur, vol, hp) {
      if (!ok || muted || !ctx) return;
      try {
        var n = Math.floor(ctx.sampleRate * dur);
        var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        var s = ctx.createBufferSource(); s.buffer = buf;
        var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hp || 900; f.Q.value = 0.8;
        var gn = ctx.createGain(); gn.gain.value = vol || 0.2;
        s.connect(f); f.connect(gn); gn.connect(master); s.start();
      } catch (e) {}
    }
    var timers = [];
    function later(fn, ms) {
      if (timers.length > 24) { clearTimeout(timers.shift()); }
      var id = setTimeout(function () {
        var k = timers.indexOf(id); if (k >= 0) timers.splice(k, 1);
        fn();
      }, ms);
      timers.push(id);
    }
    return {
      unlock: unlock,
      isMuted: function () { return muted; },
      setMuted: function (m) { muted = !!m; },
      clearTimers: function () {
        for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
        timers.length = 0;
      },
      pop: function (n) {
        var f = 300 + Math.min(12, n) * 42;
        tone(f, 0.09, 'square', 0.13, f * 1.7);
        noise(0.06, 0.09, 1400);
      },
      make: function () { tone(520, 0.09, 'triangle', 0.16, 980); tone(780, 0.12, 'sine', 0.12, 1560); },
      blast: function () { noise(0.3, 0.28, 500); tone(160, 0.28, 'sawtooth', 0.16, 50); },
      orb: function () {
        for (var i = 0; i < 5; i++) tone(400 + i * 160, 0.22 - i * 0.02, 'sine', 0.1);
        noise(0.35, 0.16, 2200);
      },
      click: function () { tone(660, 0.05, 'square', 0.1, 880); },
      bad: function () { tone(220, 0.22, 'sawtooth', 0.13, 90); },
      win: function () {
        var s = [523, 659, 784, 1046], i;
        for (i = 0; i < s.length; i++) (function (fq, k) {
          later(function () { tone(fq, 0.22, "triangle", 0.15); }, k * 105);
        })(s[i], i);
      },
      lose: function () {
        var s = [440, 370, 294, 220], i;
        for (i = 0; i < s.length; i++) (function (fq, k) {
          later(function () { tone(fq, 0.2, "sawtooth", 0.12); }, k * 110);
        })(s[i], i);
      },
      star: function (i) { tone(700 + i * 220, 0.18, 'sine', 0.16); }
    };
  })();

  g.CT = { rng: rng, Store: Store, Sfx: Sfx };
  g.rng = rng;
})(window);
