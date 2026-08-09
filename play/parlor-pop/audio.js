/* Parlor Pop - audio.js : WebAudio synthesis only, unlocked on first gesture. */
(function (root) {
  'use strict';
  var ctx = null, master = null, on = true, voices = 0, seq = [];

  function later(fn, ms) { var id = setTimeout(function () { var k = seq.indexOf(id); if (k >= 0) seq.splice(k, 1); fn(); }, ms); seq.push(id); if (seq.length > 64) clearTimeout(seq.shift()); }

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
  }

  function env(dur, peak) {
    var g = ctx.createGain(), t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(master);
    voices++;
    later(function () { try { g.disconnect(); } catch (e) {} voices--; }, (dur + 0.1) * 1000);
    return g;
  }

  function tone(freq, dur, type, peak, slide) {
    if (!ctx || !on || voices > 24) return;
    var o = ctx.createOscillator(), g = env(dur, peak || 0.3);
    o.type = type || 'sine';
    var t = ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
    o.connect(g); o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, peak, hz) {
    if (!ctx || !on || voices > 24) return;
    var n = (ctx.sampleRate * dur) | 0;
    var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hz || 900; f.Q.value = 0.8;
    var g = env(dur, peak || 0.25);
    src.connect(f); f.connect(g); src.start();
  }

  var API = {
    unlock: unlock,
    setOn: function (v) { on = !!v; },
    isOn: function () { return on; },
    ready: function () { return !!ctx; },
    pop: function (chain) {
      var c = Math.min(chain || 0, 9);
      tone(330 * Math.pow(1.0595, c * 2), 0.13, 'triangle', 0.28);
      tone(660 * Math.pow(1.0595, c * 2), 0.07, 'sine', 0.1);
    },
    swap: function () { tone(220, 0.06, 'sine', 0.14, 300); },
    bad: function () { tone(150, 0.12, 'square', 0.1, 110); },
    crack: function () { noise(0.2, 0.3, 500); tone(120, 0.16, 'square', 0.12, 70); },
    rocket: function () { noise(0.32, 0.28, 1600); tone(180, 0.3, 'sawtooth', 0.14, 900); },
    key: function () { tone(880, 0.16, 'sine', 0.24); tone(1320, 0.22, 'sine', 0.16); },
    goal: function () { tone(700, 0.1, 'triangle', 0.2); tone(1050, 0.16, 'triangle', 0.14); },
    click: function () { tone(440, 0.05, 'square', 0.1); },
    stopAll: function () { while (seq.length) clearTimeout(seq.pop()); voices = 0; },
    lose: function () { tone(300, 0.5, 'sawtooth', 0.16, 90); },
    win: function (n) {
      var s = [523, 659, 784, 1047, 1319];
      for (var i = 0; i < Math.min(n || 3, 5); i++) {
        (function (i) { later(function () { tone(s[i], 0.34, 'triangle', 0.26); }, i * 130); })(i);
      }
    },
    fanfare: function () {
      var s = [392, 523, 659, 784, 659, 784, 1047];
      for (var i = 0; i < s.length; i++) {
        (function (i) { later(function () { tone(s[i], 0.45, 'triangle', 0.24); tone(s[i] / 2, 0.45, 'sine', 0.12); }, i * 150); })(i);
      }
    }
  };
  root.PP = root.PP || {};
  root.PP.audio = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
