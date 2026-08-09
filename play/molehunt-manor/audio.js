/* WebAudio synthesis only - no assets, no network. */
(function () {
  'use strict';
  var MH = (window.MH = window.MH || {});
  var ctx = null, master = null, ok = false, muted = false;

  function unlock() {
    if (ok) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      ok = true;
    } catch (e) { ok = false; }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e2) {} }
  }

  function tone(freq, dur, type, vol, delay, slideTo) {
    if (!ok || muted || !ctx) return;
    try {
      var t0 = ctx.currentTime + (delay || 0);
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol || 0.2), t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.03);
    } catch (e) {}
  }

  function noise(dur, vol, delay, hp) {
    if (!ok || muted || !ctx) return;
    try {
      var t0 = ctx.currentTime + (delay || 0);
      var n = (ctx.sampleRate * dur) | 0;
      var buf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = buf.getChannelData(0), i;
      for (i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = ctx.createBufferSource(); s.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 700;
      var g = ctx.createGain(); g.gain.value = vol || 0.15;
      s.connect(f); f.connect(g); g.connect(master); s.start(t0);
    } catch (e) {}
  }

  var S = {
    tap: function () { tone(420, 0.06, 'square', 0.12); },
    move: function () { tone(300, 0.05, 'triangle', 0.10); },
    open: function () { tone(520, 0.09, 'triangle', 0.16); tone(780, 0.09, 'triangle', 0.10, 0.05); },
    close: function () { tone(360, 0.07, 'triangle', 0.12); },
    look: function () { noise(0.18, 0.10, 0, 1200); tone(660, 0.10, 'sine', 0.12); },
    clue: function () { tone(700, 0.09, 'square', 0.16); tone(1050, 0.12, 'square', 0.14, 0.08); },
    lie: function () { tone(220, 0.22, 'sawtooth', 0.20, 0, 110); noise(0.2, 0.12, 0, 500); },
    alarm: function () { tone(500, 0.16, 'square', 0.16); tone(380, 0.20, 'square', 0.16, 0.16); },
    catch_: function () {
      tone(440, 0.10, 'square', 0.18); tone(660, 0.10, 'square', 0.18, 0.09);
      tone(880, 0.18, 'square', 0.18, 0.18); noise(0.25, 0.10, 0.18, 900);
    },
    wrong: function () { tone(180, 0.34, 'sawtooth', 0.22, 0, 80); noise(0.3, 0.10, 0, 300); },
    win: function () {
      var f = [523, 659, 784, 1046], i;
      for (i = 0; i < f.length; i++) tone(f[i], 0.28, 'triangle', 0.20, i * 0.11);
    },
    lose: function () {
      var f = [392, 330, 262, 196], i;
      for (i = 0; i < f.length; i++) tone(f[i], 0.32, 'sawtooth', 0.18, i * 0.14);
    },
    round: function () { tone(300, 0.09, 'triangle', 0.14); tone(450, 0.12, 'triangle', 0.12, 0.08); }
  };

  MH.audio = {
    unlock: unlock,
    play: function (n) { if (S[n]) S[n](); },
    toggle: function () { muted = !muted; return muted; },
    isMuted: function () { return muted; }
  };
})();
