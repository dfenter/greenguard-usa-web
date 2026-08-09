// Warring Banners - WebAudio synthesis only. No files, no network.
var SFX = (function () {
  var ctx = null, master = null, ok = false;

  function unlock() {
    if (ok) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      ok = true;
    } catch (e) { ok = false; }
    resume();
  }
  function resume() {
    try { if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (e) {}
  }

  // basic tone
  function tone(freq, dur, type, vol, atk, detune) {
    if (!ok) return;
    try {
      var t = ctx.currentTime;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (detune) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * detune), t + dur);
      var a = atk || 0.006;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  function noise(dur, vol, hp) {
    if (!ok) return;
    try {
      var t = ctx.currentTime;
      var n = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = ctx.createBufferSource(); s.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 600;
      var g = ctx.createGain(); g.gain.value = vol || 0.2;
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + dur + 0.02);
    } catch (e) {}
  }

  var API = {
    unlock: unlock,
    resume: resume,
    tap:    function () { tone(440, 0.05, 'square', 0.09); },
    select: function () { tone(620, 0.07, 'triangle', 0.13); },
    move:   function () { tone(300, 0.09, 'triangle', 0.13, 0.005, 1.5); noise(0.07, 0.05, 900); },
    deny:   function () { tone(150, 0.11, 'sawtooth', 0.11, 0.005, 0.6); },
    clash:  function () {
      noise(0.26, 0.30, 1400); tone(120, 0.22, 'sawtooth', 0.20, 0.004, 0.5);
      tone(300, 0.14, 'square', 0.10, 0.004, 0.7);
    },
    recruit:function () { tone(520, 0.07, 'square', 0.12); setTimeout(function(){tone(780,0.09,'square',0.12);},60); },
    coin:   function () { tone(880, 0.05, 'triangle', 0.10); },
    turn:   function () { tone(220, 0.13, 'triangle', 0.13); },
    starve: function () { tone(190, 0.18, 'sawtooth', 0.10, 0.01, 0.55); },
    win:    function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { tone(f, 0.30, 'triangle', 0.17); }, i * 130); }); },
    lose:   function () { [392, 330, 262, 196].forEach(function (f, i) { setTimeout(function () { tone(f, 0.36, 'sawtooth', 0.15); }, i * 165); }); }
  };
  return API;
})();
