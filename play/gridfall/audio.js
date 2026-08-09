/* Gridfall - audio.js : WebAudio synthesis only, unlocked on first gesture */
'use strict';
var Snd = (function () {
  var ctx = null, master = null, on = false;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} } return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      on = true;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    } catch (e) { ctx = null; on = false; }
  }

  function tone(freq, dur, type, vol, delay, slideTo) {
    if (!on || !ctx) return;
    try {
      var t0 = ctx.currentTime + (delay || 0);
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.03);
    } catch (e) {}
  }

  function noise(dur, vol, hp) {
    if (!on || !ctx) return;
    try {
      var n = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = ctx.createBufferSource(); s.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 700;
      var g = ctx.createGain(); g.gain.value = vol || 0.12;
      s.connect(f); f.connect(g); g.connect(master);
      s.start();
    } catch (e) {}
  }

  var SC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  function note(i, dur, vol, delay, type) {
    var st = SC[Math.min(i, SC.length - 1)];
    tone(220 * Math.pow(2, st / 12), dur || 0.16, type || 'triangle', vol || 0.16, delay || 0);
  }

  return {
    unlock: unlock,
    ready: function () { return on; },
    pick: function () { tone(520, 0.05, 'square', 0.07); },
    drop: function () { tone(300, 0.07, 'square', 0.1, 0, 190); noise(0.06, 0.05, 1200); },
    bad: function () { tone(150, 0.12, 'sawtooth', 0.09, 0, 90); },
    clear: function (lines, streak) {
      var base = Math.min(6, (lines - 1) * 2) + Math.min(3, streak - 1);
      for (var i = 0; i < Math.min(4, lines + 1); i++) note(base + i * 2, 0.18, 0.15, i * 0.055);
      noise(0.16, 0.09, 900);
    },
    perfect: function () { for (var i = 0; i < 5; i++) note(i * 2, 0.22, 0.15, i * 0.07, 'sine'); },
    over: function () {
      tone(330, 0.3, 'triangle', 0.16, 0, 160);
      tone(220, 0.5, 'sawtooth', 0.1, 0.16, 70);
    },
    ui: function () { tone(700, 0.05, 'triangle', 0.1); }
  };
})();
