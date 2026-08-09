/* Silkwind - WebAudio synthesis only. No files, no network. */
'use strict';
var SND = (function () {
  var ac = null, bus = null, ok = false;

  function init() {
    if (ac) return;
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      ac = new C();
      bus = ac.createGain();
      bus.gain.value = 0.30;
      bus.connect(ac.destination);
      ok = true;
    } catch (e) { ac = null; ok = false; }
  }
  function resume() { try { if (ac && ac.state === 'suspended') ac.resume(); } catch (e) {} }
  function now() { return ac ? ac.currentTime : 0; }

  function env(node, t, a, d, peak) {
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g); g.connect(bus);
    return g;
  }
  function tone(f0, f1, dur, type, peak, delay) {
    if (!ok) return;
    try {
      var t = now() + (delay || 0);
      var o = ac.createOscillator();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      env(o, t, Math.min(0.02, dur * 0.3), dur, peak == null ? 0.25 : peak);
      o.start(t); o.stop(t + dur + 0.06);
    } catch (e) {}
  }
  var nb = null;
  function noiseBuf() {
    if (nb) return nb;
    var n = Math.floor(ac.sampleRate * 0.5);
    nb = ac.createBuffer(1, n, ac.sampleRate);
    var d = nb.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    return nb;
  }
  function noise(dur, peak, f0, f1, q, delay) {
    if (!ok) return;
    try {
      var t = now() + (delay || 0);
      var s = ac.createBufferSource(); s.buffer = noiseBuf();
      var bp = ac.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = q || 1.1;
      bp.frequency.setValueAtTime(f0, t);
      if (f1) bp.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
      s.connect(bp);
      env(bp, t, 0.008, dur, peak);
      s.start(t); s.stop(t + dur + 0.06);
    } catch (e) {}
  }

  return {
    init: init, resume: resume,
    ready: function () { return ok; },
    whoosh: function () { noise(0.16, 0.16, 900, 240, 0.9); },
    hit: function (big) {
      noise(0.16, big ? 0.5 : 0.32, 420, 90, 0.8);
      tone(big ? 150 : 200, 52, 0.2, 'square', big ? 0.26 : 0.16);
    },
    block: function () { noise(0.09, 0.2, 2600, 1400, 3.5); tone(1500, 900, 0.07, 'square', 0.09); },
    clash: function () {
      tone(1720, 1180, 0.26, 'triangle', 0.2); tone(2380, 1610, 0.2, 'sine', 0.13, 0.01);
      noise(0.1, 0.2, 3400, 1800, 3);
    },
    parry: function () {
      tone(880, 1760, 0.1, 'triangle', 0.22);
      tone(1760, 2640, 0.3, 'sine', 0.17, 0.05);
      noise(0.07, 0.16, 4200, 2200, 4);
    },
    grab: function () { tone(300, 130, 0.22, 'sawtooth', 0.17); noise(0.2, 0.2, 500, 160, 1.2); },
    dash: function () { noise(0.22, 0.2, 300, 1500, 0.7); tone(280, 700, 0.16, 'sine', 0.1); },
    burst: function () {
      tone(120, 40, 0.5, 'sawtooth', 0.3); tone(600, 90, 0.4, 'square', 0.16, 0.02);
      noise(0.45, 0.4, 1600, 120, 0.6);
    },
    stance: function (i) { tone(520 + i * 180, 780 + i * 200, 0.1, 'triangle', 0.13); },
    ui: function () { tone(660, 880, 0.07, 'square', 0.1); },
    ko: function () {
      tone(240, 60, 0.7, 'sawtooth', 0.28); noise(0.7, 0.34, 900, 90, 0.5);
      tone(90, 40, 0.9, 'sine', 0.22, 0.05);
    },
    win: function () {
      var s = [523, 659, 784, 1046];
      for (var i = 0; i < s.length; i++) tone(s[i], s[i] * 1.5, 0.34, 'triangle', 0.2, i * 0.11);
    },
    lose: function () {
      var s = [440, 392, 330, 247];
      for (var i = 0; i < s.length; i++) tone(s[i], s[i] * 0.7, 0.4, 'sine', 0.2, i * 0.13);
    },
    gong: function () {
      tone(160, 78, 1.6, 'sine', 0.3); tone(241, 118, 1.3, 'triangle', 0.15, 0.02);
      noise(1.0, 0.16, 700, 140, 0.6);
    }
  };
})();
