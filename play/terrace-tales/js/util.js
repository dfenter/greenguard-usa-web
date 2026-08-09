/* Terrace Tales - utilities: rng, storage, timers, audio, particles */
var TT = (function () {
  'use strict';
  var T = {};

  /* ---------- seeded rng (mulberry32) ---------- */
  T.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---------- storage (hardening #4) ---------- */
  var KEY = 'terrace-tales-v1';
  T.store = {
    load: function () {
      var d = { lvl: 0, choices: [], best: {}, seen: false, done: false };
      try {
        var raw = window.localStorage.getItem(KEY);
        if (typeof raw !== 'string' || !raw) return d;
        var o = JSON.parse(raw);
        if (!o || typeof o !== 'object' || Array.isArray(o)) return d;
        if (typeof o.lvl === 'number' && isFinite(o.lvl)) d.lvl = Math.max(0, Math.min(15, o.lvl | 0));
        if (Array.isArray(o.choices)) {
          for (var i = 0; i < 15 && i < o.choices.length; i++) {
            var v = o.choices[i];
            d.choices[i] = (typeof v === 'number' && isFinite(v) && (v | 0) === 1) ? 1 : 0;
          }
        }
        if (o.best && typeof o.best === 'object' && !Array.isArray(o.best)) {
          var kept = 0;
          for (var k in o.best) {
            if (!Object.prototype.hasOwnProperty.call(o.best, k)) continue;
            if (kept >= 15) break;
            var n = o.best[k];
            if (typeof n === 'number' && isFinite(n) && n >= 0) {
              d.best[String(k).slice(0, 4)] = Math.min(9999999, n | 0); kept++;
            }
          }
        }
        d.seen = o.seen === true;
        d.done = o.done === true;
        // prune: choices length capped
        d.choices.length = Math.min(d.choices.length, 15);
      } catch (e) { /* ignore */ }
      return d;
    },
    save: function (d) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify({
          lvl: d.lvl | 0, choices: d.choices.slice(0, 15), best: d.best,
          seen: !!d.seen, done: !!d.done
        }));
      } catch (e) { /* ignore */ }
    },
    wipe: function () { try { window.localStorage.removeItem(KEY); } catch (e) { } }
  };

  /* ---------- managed timers (hardening #2) ---------- */
  var timers = [];
  T.later = function (fn, ms) {
    var id = setTimeout(function () {
      var i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1);
      fn();
    }, ms);
    timers.push(id);
    if (timers.length > 64) { clearTimeout(timers.shift()); }
    return id;
  };
  T.clearTimers = function () {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers.length = 0;
  };

  /* ---------- audio (WebAudio synthesis only) ---------- */
  var actx = null, master = null, muted = false;
  T.audio = {
    unlock: function () {
      if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        actx = new AC();
        master = actx.createGain();
        master.gain.value = 0.32;
        master.connect(actx.destination);
        if (actx.state === 'suspended') actx.resume();
      } catch (e) { actx = null; }
    },
    get muted() { return muted; },
    toggle: function () { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.32; return muted; },
    tone: function (freq, dur, type, vol, delay, slide) {
      if (!actx || muted) return;
      try {
        var t0 = actx.currentTime + (delay || 0);
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, t0);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol == null ? 0.3 : vol), t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(master);
        o.start(t0); o.stop(t0 + dur + 0.03);
      } catch (e) { }
    },
    noise: function (dur, vol, delay) {
      if (!actx || muted) return;
      try {
        var t0 = actx.currentTime + (delay || 0);
        var len = Math.max(1, Math.floor(actx.sampleRate * dur));
        var buf = actx.createBuffer(1, len, actx.sampleRate);
        var ch = buf.getChannelData(0);
        for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var s = actx.createBufferSource(); s.buffer = buf;
        var f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
        var g = actx.createGain(); g.gain.value = vol == null ? 0.25 : vol;
        s.connect(f); f.connect(g); g.connect(master); s.start(t0);
      } catch (e) { }
    }
  };
  var A = T.audio;
  T.sfx = {
    swap: function () { A.tone(420, 0.09, 'triangle', 0.22, 0, 520); },
    bad: function () { A.tone(180, 0.14, 'sawtooth', 0.16, 0, 120); },
    match: function (n) {
      var base = 392 * Math.pow(1.0595, Math.min(14, n * 2));
      A.tone(base, 0.16, 'triangle', 0.26);
      A.tone(base * 1.5, 0.13, 'sine', 0.14, 0.03);
    },
    special: function () { A.tone(300, 0.28, 'square', 0.16, 0, 900); A.noise(0.2, 0.14); },
    tap: function () { A.tone(560, 0.06, 'square', 0.14); },
    win: function () {
      var s = [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < s.length; i++) A.tone(s[i], 0.34, 'triangle', 0.24, i * 0.09);
    },
    fail: function () { A.tone(260, 0.4, 'sine', 0.22, 0, 110); A.noise(0.3, 0.16); },
    build: function () {
      var s = [392, 523.25, 587.33, 784];
      for (var i = 0; i < s.length; i++) A.tone(s[i], 0.5, 'sine', 0.2, i * 0.13);
      A.noise(0.25, 0.1, 0.02);
    }
  };

  /* ---------- particles (hardening #5: hard cap) ---------- */
  var MAXP = 220;
  var parts = [];
  T.fx = {
    list: parts,
    burst: function (x, y, color, n, spd) {
      n = Math.min(n || 8, MAXP - parts.length);
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, v = (spd || 90) * (0.4 + Math.random() * 0.9);
        parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.5 + Math.random() * 0.4, max: 0.9, c: color, s: 2 + Math.random() * 3.5 });
      }
      if (parts.length > MAXP) parts.splice(0, parts.length - MAXP);
    },
    update: function (dt) {
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; p.vx *= 0.99;
      }
      if (parts.length > MAXP) parts.splice(0, parts.length - MAXP);
    },
    draw: function (ctx) {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], a = Math.max(0, Math.min(1, p.life / p.max));
        ctx.globalAlpha = a; ctx.fillStyle = p.c;
        ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
      ctx.globalAlpha = 1;
    },
    clear: function () { parts.length = 0; }
  };

  /* ---------- floating score labels (capped) ---------- */
  var floats = [];
  T.floats = floats;
  T.addFloat = function (x, y, txt, col) {
    floats.push({ x: x, y: y, t: txt, c: col || '#fff', life: 0.9 });
    if (floats.length > 24) floats.splice(0, floats.length - 24);
  };
  T.updateFloats = function (dt) {
    for (var i = floats.length - 1; i >= 0; i--) {
      floats[i].life -= dt; floats[i].y -= 28 * dt;
      if (floats[i].life <= 0) floats.splice(i, 1);
    }
  };
  T.drawFloats = function (ctx) {
    ctx.textAlign = 'center';
    for (var i = 0; i < floats.length; i++) {
      var f = floats[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.6));
      ctx.font = '700 18px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillStyle = '#0c1116'; ctx.fillText(f.t, f.x + 1, f.y + 1);
      ctx.fillStyle = f.c; ctx.fillText(f.t, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  };

  /* ---------- draw helpers ---------- */
  T.rr = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  T.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  T.lerp = function (a, b, t) { return a + (b - a) * t; };
  T.mixHex = function (h1, h2, t) {
    function p(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
    var a = p(h1), b = p(h2);
    var r = Math.round(a[0] + (b[0] - a[0]) * t), g = Math.round(a[1] + (b[1] - a[1]) * t), bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  };
  T.wrap = function (ctx, text, maxW) {
    var words = String(text).split(' '), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var test = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = words[i]; }
      else cur = test;
      if (lines.length > 8) break;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 8);
  };

  return T;
})();
