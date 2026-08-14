/* Fizzlift - core utilities.
 * Math, deterministic RNG, timing helpers, and the procedural audio bank.
 * Every sound in this title is synthesised here at boot into WAV blobs and
 * handed to GGKit's audio bus: GGKit stays the SOLE audio implementation,
 * and the shipped payload carries no audio files at all.
 * All original. No external assets, no network.
 */
(function (root) {
  'use strict';

  var FZ = root.FZ || {};
  root.FZ = FZ;

  /* ------------------------------------------------------------- math */
  FZ.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  FZ.lerp = function (a, b, t) { return a + (b - a) * t; };
  FZ.easeOutCubic = function (t) { var u = 1 - t; return 1 - u * u * u; };
  FZ.easeOutBack = function (t) {
    var c1 = 1.70158, c3 = c1 + 1, u = t - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
  };
  FZ.easeInOutSine = function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; };
  /* critically-ish damped approach, frame-rate independent */
  FZ.approach = function (cur, target, rate, dt) {
    var f = 1 - Math.exp(-rate * dt);
    return cur + (target - cur) * f;
  };

  /* deterministic xorshift32 */
  FZ.rng = function (seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  /* Cosmetic-only random stream. The view uses this so no visual effect can
     ever perturb the simulation's seeded stream. */
  FZ.vfxRnd = FZ.rng(0x5EED1FE);

  /* ------------------------------------------------ colour utilities */
  FZ.hex = function (n) {
    var s = (n & 0xffffff).toString(16);
    while (s.length < 6) s = '0' + s;
    return '#' + s;
  };
  FZ.mix = function (a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0);
  };
  FZ.shade = function (c, t) { return t < 0 ? FZ.mix(c, 0x000000, -t) : FZ.mix(c, 0xffffff, t); };

  /* ----------------------------------------------------- WAV synthesis */
  var RATE = 22050;

  function mkBuf(sec) { return new Float32Array(Math.max(1, Math.round(RATE * sec))); }

  /* Adds a swept oscillator with a decaying envelope. type: 0 sine, 1 square,
     2 triangle, 3 saw. */
  function tone(out, t0, dur, f0, f1, type, vol, decay) {
    var s0 = Math.floor(t0 * RATE), n = Math.max(1, Math.floor(dur * RATE));
    var ph = 0, atk = Math.max(1, Math.floor(0.004 * RATE));
    var dk = (decay === undefined ? 2.2 : decay);
    for (var i = 0; i < n; i++) {
      var k = i / n;
      var f = f0 + (f1 - f0) * k;
      ph += (2 * Math.PI * f) / RATE;
      var u = (ph / (2 * Math.PI)) % 1;
      if (u < 0) u += 1;
      var v;
      if (type === 1) v = u < 0.5 ? 1 : -1;
      else if (type === 2) v = 4 * Math.abs(u - 0.5) - 1;
      else if (type === 3) v = 2 * u - 1;
      else v = Math.sin(ph);
      var e = Math.pow(1 - k, dk);
      if (i < atk) e *= i / atk;
      var idx = s0 + i;
      if (idx >= 0 && idx < out.length) out[idx] += v * e * vol;
    }
  }

  /* Filtered noise burst. hp = one-pole highpass corner in Hz. */
  function noise(out, t0, dur, vol, hp, decay, seed) {
    var rnd = FZ.rng(seed || 0x51F1);
    var s0 = Math.floor(t0 * RATE), n = Math.max(1, Math.floor(dur * RATE));
    var a = 1 / (1 + (2 * Math.PI * (hp || 800)) / RATE);
    var yPrev = 0, xPrev = 0;
    var dk = (decay === undefined ? 2.0 : decay);
    for (var i = 0; i < n; i++) {
      var x = rnd() * 2 - 1;
      yPrev = a * (yPrev + x - xPrev);
      xPrev = x;
      var e = Math.pow(1 - i / n, dk);
      var idx = s0 + i;
      if (idx >= 0 && idx < out.length) out[idx] += yPrev * e * vol;
    }
  }

  /* Bubble: a short rising sine "bloop" with a filtered fizz tail. */
  function bubble(out, t0, f, vol, seed) {
    tone(out, t0, 0.09, f, f * 2.1, 0, vol, 2.6);
    noise(out, t0, 0.05, vol * 0.28, 2600, 2.4, seed);
  }

  /* Soft-clipping limiter, then PCM16 WAV bytes. */
  function encodeWav(data) {
    var n = data.length;
    var bytes = new Uint8Array(44 + n * 2);
    var dv = new DataView(bytes.buffer);
    function str(off, s) { for (var i = 0; i < s.length; i++) bytes[off + i] = s.charCodeAt(i); }
    str(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, RATE, true); dv.setUint32(28, RATE * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) {
      var v = data[i];
      /* cheap soft clip keeps stacked partials from crackling */
      v = v < -1 ? -1 : (v > 1 ? 1 : v * (1.5 - 0.5 * v * v));
      dv.setInt16(44 + i * 2, (v * 32200) | 0, true);
    }
    return bytes;
  }

  var objectUrls = [];
  function wavUrl(data) {
    var url = URL.createObjectURL(new Blob([encodeWav(data)], { type: 'audio/wav' }));
    objectUrls.push(url);
    return url;
  }

  /* --------------------------------------------------- the sound bank */
  /* Semitone helper on an A-minor-ish soda scale. */
  function nt(semi) { return 220 * Math.pow(2, semi / 12); }

  function sfxBank() {
    var out = {}, b;

    /* ui: dry enamel click */
    b = mkBuf(0.10);
    tone(b, 0, 0.05, 900, 700, 2, 0.30, 3.0);
    noise(b, 0, 0.03, 0.10, 3000, 3.0, 11);
    out.ui = b;

    /* select: pitched glass blip */
    b = mkBuf(0.14);
    tone(b, 0, 0.09, 620, 900, 2, 0.34, 2.4);
    tone(b, 0.01, 0.07, 1240, 1500, 0, 0.10, 2.6);
    out.select = b;

    /* swap: short tick with a bubble edge, the instant-feedback cue */
    b = mkBuf(0.16);
    tone(b, 0, 0.06, 480, 720, 2, 0.32, 2.6);
    noise(b, 0.005, 0.05, 0.11, 2200, 2.2, 23);
    out.swap = b;

    /* invalid: low damp thud, never harsh */
    b = mkBuf(0.20);
    tone(b, 0, 0.15, 190, 120, 3, 0.20, 2.0);
    noise(b, 0, 0.07, 0.06, 400, 2.6, 31);
    out.invalid = b;

    /* clear: the workhorse pop. Cascades replay this with a rising rate. */
    b = mkBuf(0.22);
    tone(b, 0, 0.13, nt(12), nt(19), 2, 0.30, 2.2);
    tone(b, 0.012, 0.09, nt(24), nt(28), 0, 0.13, 2.6);
    noise(b, 0, 0.06, 0.09, 1800, 2.4, 41);
    out.clear = b;

    /* fizz: the ambient bubble wash used on line moves */
    b = mkBuf(0.42);
    noise(b, 0, 0.40, 0.10, 2400, 1.4, 53);
    bubble(b, 0.03, 520, 0.10, 57);
    bubble(b, 0.14, 660, 0.08, 59);
    bubble(b, 0.26, 780, 0.07, 61);
    out.fizz = b;

    /* combo: bright arpeggio chord */
    b = mkBuf(0.55);
    var chord = [0, 4, 7, 12, 16];
    for (var i = 0; i < chord.length; i++) {
      tone(b, i * 0.035, 0.34 - i * 0.03, nt(24 + chord[i]), nt(24 + chord[i]), 2, 0.17, 2.4);
    }
    noise(b, 0, 0.10, 0.07, 2600, 2.4, 67);
    out.combo = b;

    /* cap: a bottle cap breaking the surface - pop then sparkle then fizz */
    b = mkBuf(0.48);
    tone(b, 0, 0.10, 300, 1100, 0, 0.34, 2.0);
    tone(b, 0.05, 0.16, nt(28), nt(35), 2, 0.20, 2.2);
    tone(b, 0.10, 0.14, nt(35), nt(40), 0, 0.12, 2.4);
    noise(b, 0.02, 0.24, 0.11, 2200, 1.6, 71);
    out.cap = b;

    /* crack: a seal taking damage but holding */
    b = mkBuf(0.24);
    noise(b, 0, 0.10, 0.24, 900, 2.6, 83);
    tone(b, 0, 0.10, 260, 170, 1, 0.16, 2.6);
    noise(b, 0.07, 0.09, 0.11, 1600, 2.8, 89);
    out.crack = b;

    /* valve: the seal breaks and the fizz line lifts */
    b = mkBuf(0.70);
    tone(b, 0, 0.16, 170, 90, 3, 0.22, 2.0);
    noise(b, 0.02, 0.55, 0.18, 700, 1.1, 97);
    tone(b, 0.08, 0.42, 240, 780, 2, 0.18, 1.6);
    bubble(b, 0.20, 640, 0.11, 101);
    bubble(b, 0.34, 820, 0.09, 103);
    out.valve = b;

    /* rise: the fizz line moving on its own (wave beat) */
    b = mkBuf(0.40);
    noise(b, 0, 0.36, 0.09, 1400, 1.3, 107);
    tone(b, 0, 0.30, 190, 340, 0, 0.11, 1.8);
    out.rise = b;

    /* fanfare: the only long cue, reserved for a cleared vat level */
    b = mkBuf(1.35);
    var fan = [0, 4, 7, 12, 16, 19];
    for (i = 0; i < fan.length; i++) {
      tone(b, i * 0.085, 0.55, nt(12 + fan[i]), nt(12 + fan[i]), 2, 0.15, 2.0);
      tone(b, i * 0.085, 0.30, nt(24 + fan[i]), nt(24 + fan[i]), 0, 0.07, 2.4);
    }
    tone(b, 0.52, 0.70, nt(36), nt(36), 2, 0.14, 1.8);
    noise(b, 0.50, 0.36, 0.07, 3000, 1.6, 109);
    out.fanfare = b;

    /* medal: a single struck chime for the medal ceremony */
    b = mkBuf(0.95);
    tone(b, 0, 0.85, nt(31), nt(31), 0, 0.22, 1.5);
    tone(b, 0, 0.55, nt(38), nt(38), 0, 0.11, 1.8);
    tone(b, 0.10, 0.60, nt(43), nt(43), 0, 0.07, 1.9);
    out.medal = b;

    /* fail: soft descending sigh, never punishing */
    b = mkBuf(0.80);
    tone(b, 0, 0.55, 300, 130, 2, 0.20, 1.6);
    tone(b, 0.10, 0.45, 220, 98, 0, 0.11, 1.8);
    noise(b, 0.02, 0.42, 0.06, 500, 1.5, 113);
    out.fail = b;

    return out;
  }

  /* Two loopable music states: a calm board loop and a brighter resolve loop
     used for menus, medal ceremonies and Seal Rush. */
  function musicBank() {
    var out = {};
    var beat = 0.42, bars = 4, beats = bars * 4;
    var len = beat * beats;

    function build(bright) {
      var b = mkBuf(len);
      /* i-VI-III-VII in A minor, one chord per bar */
      var prog = bright ? [[0, 4, 7], [5, 9, 12], [7, 11, 14], [3, 7, 10]]
                        : [[0, 3, 7], [-4, 0, 3], [-1, 3, 7], [-5, -1, 2]];
      for (var bar = 0; bar < bars; bar++) {
        var ch = prog[bar % prog.length] || prog[0];
        var t0 = bar * 4 * beat;
        /* bass */
        tone(b, t0, beat * 3.6, nt(ch[0] - 12), nt(ch[0] - 12), 2, bright ? 0.13 : 0.11, 1.1);
        /* pad */
        for (var v = 0; v < ch.length; v++) {
          tone(b, t0 + 0.02 * v, beat * 3.4, nt(ch[v] + 12), nt(ch[v] + 12), 0, 0.055, 0.9);
        }
        /* arp: soda-glass marimba */
        for (var s = 0; s < 8; s++) {
          var deg = ch[s % ch.length] + (s >= 4 ? 12 : 0) + 24;
          var amp = (bright ? 0.11 : 0.075) * (s % 2 === 0 ? 1 : 0.6);
          tone(b, t0 + s * beat * 0.5, 0.30, nt(deg), nt(deg), 2, amp, 2.4);
        }
        /* bubbles instead of a drum kit */
        bubble(b, t0 + beat * 0.5, bright ? 700 : 520, 0.05, 200 + bar * 13);
        bubble(b, t0 + beat * 2.5, bright ? 880 : 620, 0.04, 260 + bar * 17);
        if (bright) bubble(b, t0 + beat * 3.25, 1020, 0.035, 300 + bar * 19);
      }
      /* loop-safe: fade the last 60ms into the head level */
      var tail = Math.floor(0.06 * RATE);
      for (var i = 0; i < tail; i++) {
        var k = i / tail;
        b[b.length - tail + i] = b[b.length - tail + i] * (1 - k) + b[i] * k;
      }
      return b;
    }
    out.music_vat = build(false);
    out.music_rush = build(true);
    return out;
  }

  /* Builds every cue and registers it with the GGKit audio bus.
     Chunked through a callback so the loader bar can advance. */
  FZ.buildAudio = function (kit, onProgress, done) {
    var reg = {};
    var jobs = [
      function () { var s = sfxBank(); for (var k in s) reg['sfx_' + k] = wavUrl(s[k]); },
      function () { var m = musicBank(); for (var k in m) reg[k] = wavUrl(m[k]); }
    ];
    var i = 0;
    function step() {
      if (i >= jobs.length) {
        kit.audio.register(reg);
        FZ.audioNames = Object.keys(reg);
        if (onProgress) onProgress(1);
        if (done) done(reg);
        return;
      }
      try { jobs[i](); } catch (e) { /* a synth failure must never block boot */ }
      i++;
      if (onProgress) onProgress(i / jobs.length);
      root.setTimeout(step, 0);
    }
    step();
  };

  FZ.releaseAudio = function () {
    for (var i = 0; i < objectUrls.length; i++) {
      try { URL.revokeObjectURL(objectUrls[i]); } catch (e) {}
    }
    objectUrls.length = 0;
  };

  /* ------------------------------------------------- text/colour guards */
  /* Defect class: unguarded setText AND unguarded setColor both cost a full
     texture re-upload every frame. Both get the same change guard. */
  FZ.setTextIfChanged = function (obj, str) {
    if (!obj) return;
    if (obj.__fzText === str) return;
    obj.__fzText = str;
    obj.setText(str);
  };
  FZ.setColorIfChanged = function (obj, css) {
    if (!obj) return;
    if (obj.__fzColor === css) return;
    obj.__fzColor = css;
    if (obj.setColor) obj.setColor(css);
  };
  FZ.setTintIfChanged = function (obj, tint) {
    if (!obj) return;
    if (obj.__fzTint === tint) return;
    obj.__fzTint = tint;
    if (obj.setTint) obj.setTint(tint);
  };
  FZ.setVisibleIfChanged = function (obj, vis) {
    if (!obj) return;
    if (obj.visible === vis) return;
    obj.setVisible(vis);
  };

  /* ------------------------------------------------------ safe areas */
  FZ.safeInsets = function () {
    var probe = document.getElementById('fz-safe');
    if (!probe) {
      probe = document.createElement('div');
      probe.id = 'fz-safe';
      probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;' +
        'visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
        'env(safe-area-inset-bottom) env(safe-area-inset-left);';
      document.body.appendChild(probe);
    }
    var cs = root.getComputedStyle(probe);
    function px(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
    return {
      top: px(cs.paddingTop), right: px(cs.paddingRight),
      bottom: px(cs.paddingBottom), left: px(cs.paddingLeft)
    };
  };

  FZ.prefersReducedMotion = function () {
    try {
      return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
