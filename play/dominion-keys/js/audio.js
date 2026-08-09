/* Dominion Keys - WebAudio synthesis only */
(function (root) {
  'use strict';
  var ctx = null, master = null, ok = false;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      ok = true;
    } catch (e) { ctx = null; ok = false; }
  }

  function tone(type, f0, f1, dur, vol, delay) {
    if (!ok) return;
    try {
      var t = ctx.currentTime + (delay || 0);
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { }
  }

  function noise(dur, vol, f, q, delay) {
    if (!ok) return;
    try {
      var t = ctx.currentTime + (delay || 0);
      var n = Math.max(1, Math.floor(ctx.sampleRate * dur));
      var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0), i;
      for (i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q || 1;
      var g = ctx.createGain(); g.gain.value = vol;
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t);
    } catch (e) { }
  }

  var SFX = {
    tap: function () { tone('square', 420, 300, 0.06, 0.09); },
    pull: function () { tone('sawtooth', 260, 120, 0.18, 0.12); noise(0.16, 0.1, 1400, 1.2); },
    coin: function (n) { tone('triangle', 780 + (n % 5) * 60, 1180 + (n % 5) * 60, 0.12, 0.13); },
    sizzle: function () { noise(0.35, 0.16, 900, 0.7); },
    ignite: function () { tone('sawtooth', 180, 40, 0.4, 0.18); noise(0.3, 0.2, 320, 0.6); },
    slay: function () { tone('square', 300, 70, 0.25, 0.15); noise(0.2, 0.12, 500, 1); },
    burn: function () { tone('sawtooth', 300, 90, 0.16, 0.1); },
    fail: function () { tone('sawtooth', 200, 55, 0.5, 0.2); noise(0.4, 0.12, 200, 0.8); },
    win: function () {
      tone('triangle', 523, 523, 0.16, 0.16, 0);
      tone('triangle', 659, 659, 0.16, 0.16, 0.13);
      tone('triangle', 784, 784, 0.16, 0.16, 0.26);
      tone('triangle', 1046, 1046, 0.42, 0.17, 0.39);
    },
    crown: function () {
      var s = [523, 659, 784, 1046, 1318];
      for (var i = 0; i < s.length; i++) tone('triangle', s[i], s[i], 0.5, 0.15, i * 0.14);
    }
  };

  root.DKAudio = {
    unlock: unlock,
    play: function (k, a) { if (ok && SFX[k]) SFX[k](a || 0); },
    ready: function () { return ok; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
