/* Meridian Row - WebAudio synthesis only. Unlocked on first gesture. */
'use strict';

var Snd = {
  ctx: null, master: null, ok: false, muted: false,

  unlock: function () {
    if (Snd.ok) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      Snd.ctx = new AC();
      Snd.master = Snd.ctx.createGain();
      Snd.master.gain.value = 0.32;
      Snd.master.connect(Snd.ctx.destination);
      Snd.ok = true;
    } catch (e) { Snd.ok = false; return; }
    if (Snd.ctx.state === 'suspended') { try { Snd.ctx.resume(); } catch (e) {} }
  },

  tone: function (freq, dur, type, vol, slideTo, delay) {
    if (!Snd.ok || Snd.muted) return;
    var c = Snd.ctx, t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.2), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(Snd.master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  },

  noise: function (dur, vol, freq, delay) {
    if (!Snd.ok || Snd.muted) return;
    var c = Snd.ctx, t0 = c.currentTime + (delay || 0);
    var n = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 900; f.Q.value = 0.9;
    var g = c.createGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(Snd.master);
    src.start(t0);
  },

  play: function (name) {
    if (!Snd.ok || Snd.muted) return;
    switch (name) {
      case 'tap': Snd.tone(520, 0.05, 'square', 0.12, 380); break;
      case 'roll':
        for (var i = 0; i < 7; i++) Snd.noise(0.05, 0.16, 700 + rint(900), i * 0.055);
        break;
      case 'step': Snd.tone(660, 0.045, 'triangle', 0.1, 720); break;
      case 'coin':
        Snd.tone(880, 0.08, 'square', 0.14, 900);
        Snd.tone(1320, 0.12, 'square', 0.1, 1400, 0.06);
        break;
      case 'build':
        Snd.tone(330, 0.16, 'sawtooth', 0.13, 340);
        Snd.tone(494, 0.2, 'triangle', 0.13, 500, 0.07);
        Snd.tone(659, 0.28, 'triangle', 0.12, 664, 0.14);
        break;
      case 'sticker':
        Snd.tone(1046, 0.16, 'sine', 0.18, 1050);
        Snd.tone(1568, 0.24, 'sine', 0.13, 1570, 0.08);
        break;
      case 'heist':
        Snd.noise(0.22, 0.22, 400);
        Snd.tone(180, 0.3, 'sawtooth', 0.16, 520);
        break;
      case 'block':
        Snd.noise(0.16, 0.26, 220);
        Snd.tone(120, 0.24, 'square', 0.18, 70);
        break;
      case 'shield': Snd.tone(440, 0.22, 'triangle', 0.15, 880); break;
      case 'album':
        [523, 659, 784, 1046, 1318].forEach(function (f, i) { Snd.tone(f, 0.3, 'triangle', 0.14, f, i * 0.09); });
        break;
      case 'win':
        [392, 523, 659, 784, 1046, 1318].forEach(function (f, i) { Snd.tone(f, 0.34, 'square', 0.13, f, i * 0.11); });
        break;
      case 'lose':
        [440, 370, 294, 208].forEach(function (f, i) { Snd.tone(f, 0.3, 'sawtooth', 0.13, f * 0.9, i * 0.14); });
        break;
      case 'rival': Snd.tone(260, 0.07, 'triangle', 0.08, 240); break;
    }
  }
};
