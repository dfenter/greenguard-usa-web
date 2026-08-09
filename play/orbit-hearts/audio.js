/* Orbit Hearts - WebAudio synthesis only. No files, no network. */
(function (g) {
  'use strict';
  var ctx = null, master = null, ok = false, muted = false, hum = null, humGain = null;

  function unlock() {
    if (ok) return;
    try {
      var AC = g.AudioContext || g.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      ok = true;
      startHum();
    } catch (e) { ok = false; }
    try { if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (e) {}
  }

  function startHum() {
    if (!ok || hum) return;
    try {
      hum = ctx.createOscillator();
      hum.type = 'sine';
      hum.frequency.value = 55;
      humGain = ctx.createGain();
      humGain.gain.value = 0.05;
      var lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.11;
      var lg = ctx.createGain(); lg.gain.value = 0.02;
      lfo.connect(lg); lg.connect(humGain.gain);
      hum.connect(humGain); humGain.connect(master);
      hum.start(); lfo.start();
    } catch (e) { hum = null; }
  }

  function tone(freq, dur, type, vol, delay, slide) {
    if (!ok || muted) return;
    try {
      var t0 = ctx.currentTime + (delay || 0);
      var o = ctx.createOscillator();
      var gn = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn); gn.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.03);
    } catch (e) {}
  }

  function noise(dur, vol) {
    if (!ok || muted) return;
    try {
      var n = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = ctx.createBufferSource(); s.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900;
      var gn = ctx.createGain(); gn.gain.value = vol || 0.15;
      s.connect(f); f.connect(gn); gn.connect(master);
      s.start();
    } catch (e) {}
  }

  var A = {
    unlock: unlock,
    ready: function () { return ok; },
    setMuted: function (m) {
      muted = !!m;
      try { if (humGain) humGain.gain.value = muted ? 0 : 0.05; } catch (e) {}
    },
    isMuted: function () { return muted; },
    blip: function (v) { tone(420 + (v || 0) * 30, 0.05, 'square', 0.05); },
    tap: function () { tone(660, 0.08, 'triangle', 0.16); },
    choose: function () { tone(523, 0.12, 'triangle', 0.18); tone(784, 0.18, 'sine', 0.14, 0.06); },
    hit: function (n) {
      var s = [523, 659, 784, 988][n % 4];
      tone(s, 0.16, 'triangle', 0.2); tone(s * 2, 0.2, 'sine', 0.1, 0.03);
    },
    perfect: function () { tone(1046, 0.22, 'sine', 0.22); tone(1568, 0.26, 'sine', 0.12, 0.05); },
    miss: function () { noise(0.16, 0.12); tone(160, 0.18, 'sawtooth', 0.12, 0, 90); },
    heart: function () { tone(880, 0.1, 'sine', 0.14); tone(1174, 0.16, 'sine', 0.1, 0.07); },
    ending: function () {
      var s = [392, 523, 659, 784, 1046];
      for (var i = 0; i < s.length; i++) tone(s[i], 0.6, 'triangle', 0.14, i * 0.13);
    },
    ui: function () { tone(330, 0.06, 'square', 0.08); }
  };
  g.OH_AUDIO = A;
})(window);
