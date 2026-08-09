// Meadow Solitaire - WebAudio synthesis only. No files, no network.
var Sound = (function () {
  var ctx = null, master = null, enabled = true;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { enabled = false; return; }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { enabled = false; ctx = null; }
  }

  function now() { return ctx.currentTime; }

  function tone(freq, dur, type, vol, delay, slideTo) {
    if (!enabled || !ctx) return;
    try {
      var t0 = now() + (delay || 0);
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol || 0.2), t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.03);
    } catch (e) { }
  }

  function noise(dur, vol, hp, delay) {
    if (!enabled || !ctx) return;
    try {
      var t0 = now() + (delay || 0);
      var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 700;
      var g = ctx.createGain(); g.gain.value = vol || 0.2;
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t0);
    } catch (e) { }
  }

  var SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
  function nfreq(step) { return 196 * Math.pow(2, (SCALE[Math.max(0, Math.min(SCALE.length - 1, step))]) / 12); }

  return {
    unlock: unlock,
    ready: function () { return !!ctx; },
    play: function (streak) {
      tone(nfreq(Math.min(11, streak)), 0.17, 'triangle', 0.22);
      tone(nfreq(Math.min(11, streak)) * 2, 0.09, 'sine', 0.07);
    },
    draw: function () { noise(0.13, 0.13, 1200); tone(150, 0.09, 'sine', 0.08, 0, 90); },
    deny: function () { tone(150, 0.13, 'square', 0.09, 0, 105); },
    peak: function () {
      [0, 4, 7, 12].forEach(function (s, i) { tone(392 * Math.pow(2, s / 12), 0.4, 'triangle', 0.15, i * 0.05); });
      noise(0.3, 0.1, 2000);
    },
    wild: function () { tone(660, 0.28, 'sawtooth', 0.11, 0, 1320); tone(330, 0.3, 'sine', 0.1); },
    win: function () {
      [0, 4, 7, 12, 16, 19].forEach(function (s, i) {
        tone(392 * Math.pow(2, s / 12), 0.55, 'triangle', 0.16, i * 0.09);
      });
      noise(0.5, 0.09, 1500, 0.1);
    },
    fail: function () {
      tone(220, 0.5, 'sine', 0.16, 0, 82);
      tone(164, 0.55, 'triangle', 0.1, 0.05, 70);
    },
    plant: function (stage) {
      tone(330 * Math.pow(2, stage / 12), 0.3, 'sine', 0.17);
      tone(495 * Math.pow(2, stage / 12), 0.24, 'triangle', 0.09, 0.06);
      noise(0.2, 0.07, 2500);
    },
    coin: function (i) { tone(880 + i * 60, 0.1, 'square', 0.06, i * 0.035); },
    tap: function () { tone(520, 0.06, 'sine', 0.1); },
    bloom: function () {
      [0, 5, 9, 12, 17, 21, 24].forEach(function (s, i) {
        tone(261 * Math.pow(2, s / 12), 0.9, 'triangle', 0.14, i * 0.13);
      });
    }
  };
})();
