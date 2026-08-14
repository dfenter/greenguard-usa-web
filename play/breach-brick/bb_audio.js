/* bb_audio.js - Breach & Brick procedural audio bank.
 *
 * Every cue in this title is synthesised here at boot, encoded as 16-bit mono
 * PCM WAV, wrapped in a Blob URL and handed to the GGKit audio bus. GGKit
 * stays the sole audio implementation: this file only produces buffers, it
 * never creates an AudioContext, never plays anything and never touches
 * destination nodes.
 *
 * No audio FILE ships with the game, so the "mp3/m4a only, never ogg" asset
 * law is satisfied by having no encoded asset at all. Nothing is fetched from
 * the network. See LICENSES.md.
 */
(function (root) {
  'use strict';

  var RATE = 22050;

  // ------------------------------------------------------------ tiny synth
  function Voice(dur) {
    this.n = Math.max(1, Math.ceil(dur * RATE));
    this.d = new Float32Array(this.n);
  }
  Voice.prototype.at = function (t) { return Math.round(t * RATE); };

  // Amplitude envelope: linear attack, exponential-ish decay.
  function env(i, len, aN, dN) {
    if (i < aN) return aN > 0 ? i / aN : 1;
    var k = (i - aN) / Math.max(1, dN);
    if (k >= 1) return 0;
    return (1 - k) * (1 - k);
  }

  function wave(type, phase) {
    switch (type) {
      case 'square': return phase % 1 < 0.5 ? 1 : -1;
      case 'saw': return 2 * (phase % 1) - 1;
      case 'tri': {
        var p = phase % 1;
        return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
      }
      case 'pulse': return phase % 1 < 0.25 ? 1 : -1;
      default: return Math.sin(phase * Math.PI * 2);
    }
  }

  // Adds an oscillator that sweeps f0 -> f1 over `dur`, starting at `start`.
  Voice.prototype.osc = function (o) {
    var start = this.at(o.start || 0);
    var len = this.at(o.dur);
    var aN = this.at(o.a == null ? 0.004 : o.a);
    var dN = Math.max(1, len - aN);
    var f0 = o.f0, f1 = o.f1 == null ? o.f0 : o.f1;
    var amp = o.amp == null ? 0.3 : o.amp;
    var type = o.type || 'sine';
    var phase = 0;
    var curve = o.curve || 1;
    for (var i = 0; i < len; i++) {
      var j = start + i;
      if (j >= this.n) break;
      var k = i / len;
      var f = f0 + (f1 - f0) * Math.pow(k, curve);
      phase += f / RATE;
      var e = env(i, len, aN, dN);
      if (o.hold) e = i < aN ? i / Math.max(1, aN) : (i > len - aN ? Math.max(0, (len - i) / Math.max(1, aN)) : 1);
      var v = wave(type, phase) * amp * e;
      if (o.vib) v *= 1 + o.vib * Math.sin(i / RATE * Math.PI * 2 * (o.vibHz || 6));
      this.d[j] += v;
    }
    return this;
  };

  // Filtered noise burst. `lp` is a one-pole coefficient (0..1, lower = darker).
  Voice.prototype.noise = function (o) {
    var start = this.at(o.start || 0);
    var len = this.at(o.dur);
    var aN = this.at(o.a == null ? 0.002 : o.a);
    var dN = Math.max(1, len - aN);
    var amp = o.amp == null ? 0.25 : o.amp;
    var lp = o.lp == null ? 0.35 : o.lp;
    var last = 0, hpLast = 0, hpPrev = 0;
    var seed = o.seed == null ? 12345 : o.seed;
    for (var i = 0; i < len; i++) {
      var j = start + i;
      if (j >= this.n) break;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      var w = (seed / 4294967296) * 2 - 1;
      var lpc = lp;
      if (o.lpEnd != null) lpc = lp + (o.lpEnd - lp) * (i / len);
      last = last + lpc * (w - last);
      var v = last;
      if (o.hp) {
        var out = 0.86 * (hpLast + v - hpPrev);
        hpPrev = v; hpLast = out; v = out;
      }
      this.d[j] += v * amp * env(i, len, aN, dN);
    }
    return this;
  };

  Voice.prototype.finish = function (gain) {
    var g = gain == null ? 1 : gain;
    var peak = 0;
    for (var i = 0; i < this.n; i++) { var a = Math.abs(this.d[i]); if (a > peak) peak = a; }
    var norm = peak > 0.001 ? Math.min(1, 0.92 / peak) : 1;
    // 3 ms edge fades so no cue clicks on start or stop.
    var fade = Math.min(Math.floor(this.n / 2), Math.round(0.003 * RATE));
    for (var k = 0; k < this.n; k++) {
      var e = 1;
      if (k < fade) e = k / fade;
      else if (k > this.n - fade) e = (this.n - k) / fade;
      this.d[k] = Math.max(-1, Math.min(1, this.d[k] * norm * g * e));
    }
    return this.d;
  };

  // Music loops must not click at the seam, so the periodic content is phase
  // locked: every pad partial is snapped to an exact multiple of 1/duration.
  function LoopVoice(dur) {
    Voice.call(this, dur);
    this.dur = dur;
  }
  LoopVoice.prototype = Object.create(Voice.prototype);
  LoopVoice.prototype.constructor = LoopVoice;
  LoopVoice.prototype.snap = function (f) {
    var base = 1 / this.dur;
    return Math.max(base, Math.round(f / base) * base);
  };
  LoopVoice.prototype.pad = function (f, amp, type, vibHz) {
    var fr = this.snap(f);
    var type2 = type || 'sine';
    for (var i = 0; i < this.n; i++) {
      var t = i / RATE;
      var lfo = 1 + 0.22 * Math.sin(t * Math.PI * 2 * this.snap(vibHz || 0.5));
      this.d[i] += wave(type2, t * fr) * amp * lfo;
    }
    return this;
  };
  LoopVoice.prototype.finishLoop = function (gain) {
    var peak = 0;
    for (var i = 0; i < this.n; i++) { var a = Math.abs(this.d[i]); if (a > peak) peak = a; }
    var norm = peak > 0.001 ? Math.min(1, 0.9 / peak) : 1;
    var g = gain == null ? 1 : gain;
    for (var k = 0; k < this.n; k++) this.d[k] = Math.max(-1, Math.min(1, this.d[k] * norm * g));
    return this.d;
  };

  // ------------------------------------------------------------- WAV + blob
  function writeStr(view, off, s) {
    for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  }
  function wavBlob(samples) {
    var n = samples.length;
    var buf = new ArrayBuffer(44 + n * 2);
    var v = new DataView(buf);
    writeStr(v, 0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); writeStr(v, 8, 'WAVE');
    writeStr(v, 12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    writeStr(v, 36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) {
      var s = samples[i];
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  // ------------------------------------------------------------------ cues
  function arp(v, notes, step, amp, type, dur) {
    for (var i = 0; i < notes.length; i++) {
      v.osc({ start: i * step, dur: dur || step * 1.9, f0: notes[i], f1: notes[i], amp: amp, type: type || 'tri', a: 0.005 });
    }
    return v;
  }

  var BANK = {
    // -- contact
    paddle: function () {
      var v = new Voice(0.09);
      v.osc({ dur: 0.075, f0: 340, f1: 190, amp: 0.42, type: 'square', a: 0.002, curve: 0.6 });
      v.osc({ dur: 0.05, f0: 680, f1: 420, amp: 0.14, type: 'sine' });
      return v.finish(0.9);
    },
    brick: function () {
      var v = new Voice(0.11);
      v.osc({ dur: 0.09, f0: 720, f1: 300, amp: 0.34, type: 'tri', a: 0.002, curve: 0.5 });
      v.noise({ dur: 0.05, amp: 0.16, lp: 0.6, lpEnd: 0.18, hp: true });
      return v.finish(0.95);
    },
    brick_hard: function () {
      var v = new Voice(0.13);
      v.osc({ dur: 0.1, f0: 260, f1: 140, amp: 0.36, type: 'square', a: 0.003, curve: 0.7 });
      v.noise({ dur: 0.07, amp: 0.2, lp: 0.28, lpEnd: 0.08 });
      return v.finish(0.9);
    },
    steel: function () {
      var v = new Voice(0.22);
      v.osc({ dur: 0.2, f0: 1180, f1: 1130, amp: 0.16, type: 'square', a: 0.001 });
      v.osc({ dur: 0.2, f0: 1570, f1: 1490, amp: 0.12, type: 'square', a: 0.001 });
      v.osc({ dur: 0.06, f0: 420, f1: 220, amp: 0.3, type: 'tri' });
      v.noise({ dur: 0.12, amp: 0.22, lp: 0.85, lpEnd: 0.3, hp: true });
      return v.finish(0.85);
    },
    charge: function () {
      var v = new Voice(0.5);
      v.noise({ dur: 0.42, amp: 0.5, lp: 0.7, lpEnd: 0.05, a: 0.004 });
      v.osc({ dur: 0.4, f0: 180, f1: 34, amp: 0.42, type: 'sine', curve: 0.5 });
      v.osc({ dur: 0.12, f0: 900, f1: 200, amp: 0.2, type: 'saw' });
      return v.finish(1);
    },
    crush: function () {
      var v = new Voice(0.3);
      v.noise({ dur: 0.26, amp: 0.44, lp: 0.42, lpEnd: 0.06 });
      v.osc({ dur: 0.22, f0: 150, f1: 52, amp: 0.34, type: 'square', curve: 0.6 });
      return v.finish(0.95);
    },
    impact: function () {
      var v = new Voice(0.34);
      v.osc({ dur: 0.3, f0: 118, f1: 38, amp: 0.5, type: 'sine', curve: 0.5 });
      v.noise({ dur: 0.16, amp: 0.3, lp: 0.3, lpEnd: 0.04 });
      return v.finish(1);
    },
    // -- the falling-brick tell and the stun loop
    warn: function () {
      var v = new Voice(0.42);
      v.osc({ start: 0.0, dur: 0.14, f0: 620, f1: 780, amp: 0.3, type: 'square', hold: true, a: 0.01 });
      v.osc({ start: 0.18, dur: 0.14, f0: 620, f1: 780, amp: 0.3, type: 'square', hold: true, a: 0.01 });
      v.osc({ start: 0.0, dur: 0.34, f0: 210, f1: 250, amp: 0.14, type: 'tri' });
      return v.finish(0.8);
    },
    warn_drop: function () {
      var v = new Voice(0.3);
      v.osc({ dur: 0.28, f0: 900, f1: 160, amp: 0.32, type: 'saw', curve: 1.6 });
      v.noise({ dur: 0.2, amp: 0.16, lp: 0.5, lpEnd: 0.1 });
      return v.finish(0.85);
    },
    stun: function () {
      var v = new Voice(0.55);
      v.osc({ dur: 0.5, f0: 240, f1: 70, amp: 0.4, type: 'square', curve: 0.7, vib: 0.35, vibHz: 22 });
      v.noise({ dur: 0.34, amp: 0.28, lp: 0.35, lpEnd: 0.05 });
      v.osc({ dur: 0.5, f0: 62, f1: 44, amp: 0.3, type: 'sine' });
      return v.finish(1);
    },
    recover: function () {
      var v = new Voice(0.34);
      v.osc({ dur: 0.28, f0: 340, f1: 980, amp: 0.3, type: 'tri', curve: 0.6 });
      v.osc({ start: 0.1, dur: 0.22, f0: 660, f1: 1320, amp: 0.2, type: 'sine' });
      return v.finish(0.85);
    },
    // -- player actions
    launch: function () {
      var v = new Voice(0.26);
      v.osc({ dur: 0.22, f0: 220, f1: 720, amp: 0.32, type: 'tri', curve: 0.7 });
      v.noise({ dur: 0.18, amp: 0.18, lp: 0.2, lpEnd: 0.75, hp: true });
      return v.finish(0.85);
    },
    lance: function () {
      var v = new Voice(0.16);
      v.osc({ dur: 0.14, f0: 1500, f1: 380, amp: 0.3, type: 'saw', curve: 1.4 });
      v.osc({ dur: 0.08, f0: 2300, f1: 900, amp: 0.14, type: 'square' });
      return v.finish(0.75);
    },
    // -- one distinct catch confirmation per powerup type
    catch_multi: function () { return arp(new Voice(0.5), [523, 659, 784, 1047], 0.075, 0.26, 'tri').finish(0.9); },
    catch_wreck: function () {
      var v = new Voice(0.44);
      v.osc({ dur: 0.4, f0: 90, f1: 210, amp: 0.4, type: 'square', curve: 0.5 });
      v.noise({ dur: 0.2, amp: 0.22, lp: 0.35, lpEnd: 0.1 });
      return v.finish(0.95);
    },
    catch_wide: function () {
      var v = new Voice(0.42);
      v.osc({ dur: 0.36, f0: 330, f1: 494, amp: 0.3, type: 'tri', curve: 0.4 });
      v.osc({ start: 0.06, dur: 0.32, f0: 247, f1: 330, amp: 0.22, type: 'sine' });
      return v.finish(0.85);
    },
    catch_sticky: function () {
      var v = new Voice(0.44);
      v.osc({ dur: 0.4, f0: 700, f1: 300, amp: 0.28, type: 'sine', vib: 0.5, vibHz: 14, curve: 0.6 });
      v.osc({ start: 0.16, dur: 0.24, f0: 300, f1: 600, amp: 0.2, type: 'tri' });
      return v.finish(0.85);
    },
    catch_laser: function () { return arp(new Voice(0.42), [880, 1175, 1760], 0.06, 0.24, 'saw').finish(0.8); },
    catch_shield: function () {
      var v = new Voice(0.55);
      v.osc({ dur: 0.5, f0: 196, f1: 392, amp: 0.28, type: 'sine', curve: 0.4 });
      v.osc({ start: 0.05, dur: 0.45, f0: 294, f1: 588, amp: 0.2, type: 'tri' });
      v.noise({ start: 0.02, dur: 0.3, amp: 0.1, lp: 0.9, lpEnd: 0.3, hp: true });
      return v.finish(0.85);
    },
    catch_slow: function () {
      var v = new Voice(0.55);
      v.osc({ dur: 0.5, f0: 880, f1: 220, amp: 0.3, type: 'tri', curve: 1.5 });
      return v.finish(0.8);
    },
    catch_life: function () { return arp(new Voice(0.7), [523, 784, 1047, 1319, 1568], 0.085, 0.24, 'sine').finish(0.9); },
    // -- progression
    clear: function () {
      var v = new Voice(1.5);
      var notes = [392, 523, 659, 784, 1047];
      for (var i = 0; i < notes.length; i++) {
        v.osc({ start: i * 0.12, dur: 0.55, f0: notes[i], amp: 0.2, type: 'tri', a: 0.008 });
        v.osc({ start: i * 0.12, dur: 0.5, f0: notes[i] * 2, amp: 0.08, type: 'sine' });
      }
      v.osc({ start: 0.6, dur: 0.85, f0: 196, amp: 0.18, type: 'saw', a: 0.02 });
      v.noise({ start: 0, dur: 0.5, amp: 0.09, lp: 0.9, lpEnd: 0.4, hp: true });
      return v.finish(0.95);
    },
    medal: function () {
      var v = new Voice(0.9);
      var n = [1047, 1319, 1568, 2093];
      for (var i = 0; i < n.length; i++) v.osc({ start: i * 0.06, dur: 0.6, f0: n[i], amp: 0.14, type: 'sine', a: 0.004 });
      return v.finish(0.8);
    },
    unlock: function () {
      var v = new Voice(1.0);
      var n = [440, 554, 659, 880];
      for (var i = 0; i < n.length; i++) v.osc({ start: i * 0.09, dur: 0.7, f0: n[i], amp: 0.17, type: 'tri', a: 0.01 });
      return v.finish(0.85);
    },
    lose: function () {
      var v = new Voice(0.7);
      v.osc({ dur: 0.6, f0: 420, f1: 90, amp: 0.36, type: 'square', curve: 1.4 });
      v.osc({ start: 0.08, dur: 0.5, f0: 210, f1: 60, amp: 0.24, type: 'tri', curve: 1.4 });
      return v.finish(0.95);
    },
    over: function () {
      var v = new Voice(1.6);
      [147, 175, 208].forEach(function (f, i) {
        v.osc({ start: i * 0.03, dur: 1.4, f0: f, f1: f * 0.96, amp: 0.2, type: 'saw', a: 0.05 });
      });
      v.noise({ dur: 0.9, amp: 0.1, lp: 0.16, lpEnd: 0.03 });
      return v.finish(0.9);
    },
    boss_hit: function () {
      var v = new Voice(0.2);
      v.osc({ dur: 0.18, f0: 300, f1: 120, amp: 0.34, type: 'saw', curve: 0.7 });
      v.noise({ dur: 0.1, amp: 0.2, lp: 0.4, lpEnd: 0.1 });
      return v.finish(0.9);
    },
    boss_die: function () {
      var v = new Voice(1.3);
      v.noise({ dur: 1.1, amp: 0.5, lp: 0.6, lpEnd: 0.03, a: 0.01 });
      v.osc({ dur: 1.0, f0: 220, f1: 28, amp: 0.44, type: 'square', curve: 0.5 });
      v.osc({ start: 0.02, dur: 0.4, f0: 1200, f1: 180, amp: 0.2, type: 'saw' });
      return v.finish(1);
    },
    ui: function () {
      var v = new Voice(0.07);
      v.osc({ dur: 0.055, f0: 900, f1: 620, amp: 0.24, type: 'square' });
      return v.finish(0.6);
    },
    ui_back: function () {
      var v = new Voice(0.09);
      v.osc({ dur: 0.07, f0: 500, f1: 300, amp: 0.24, type: 'square' });
      return v.finish(0.6);
    },
    // -- music stems, 8 s seamless loops
    music_deep: function () {
      var v = new LoopVoice(8);
      v.pad(55, 0.34, 'sine', 0.25).pad(82.5, 0.2, 'sine', 0.375)
        .pad(110, 0.16, 'tri', 0.5).pad(164.8, 0.09, 'sine', 0.125)
        .pad(220, 0.05, 'sine', 0.75);
      for (var b = 0; b < 8; b++) {
        v.osc({ start: b * 1.0, dur: 0.22, f0: 62, f1: 38, amp: 0.3, type: 'sine', curve: 0.5 });
        if (b % 2 === 1) v.noise({ start: b * 1.0 + 0.5, dur: 0.11, amp: 0.07, lp: 0.9, lpEnd: 0.4, hp: true, seed: 7 + b });
      }
      return v.finishLoop(0.85);
    },
    music_surge: function () {
      var v = new LoopVoice(8);
      v.pad(73.4, 0.3, 'saw', 0.25).pad(110, 0.18, 'square', 0.5)
        .pad(146.8, 0.14, 'tri', 0.375).pad(220, 0.09, 'saw', 0.125)
        .pad(293.7, 0.06, 'sine', 0.625);
      var seq = [146.8, 220, 293.7, 220, 174.6, 261.6, 349.2, 261.6];
      for (var i = 0; i < 16; i++) {
        v.osc({ start: i * 0.5, dur: 0.24, f0: seq[i % seq.length], amp: 0.12, type: 'square', a: 0.006 });
        v.osc({ start: i * 0.5, dur: 0.16, f0: 55, f1: 40, amp: 0.26, type: 'sine', curve: 0.5 });
        if (i % 2 === 1) v.noise({ start: i * 0.5 + 0.25, dur: 0.09, amp: 0.1, lp: 0.95, lpEnd: 0.5, hp: true, seed: 31 + i });
      }
      return v.finishLoop(0.9);
    }
  };

  // ----------------------------------------------------------------- install
  var urls = [];

  function install(kit, onProgress) {
    var names = Object.keys(BANK);
    var map = {};
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var maker = BANK[name];
      var samples;
      try {
        samples = maker();
      } catch (e) {
        samples = new Float32Array(8); // guarded fallback: a silent cue, never a throw
      }
      var url = URL.createObjectURL(wavBlob(samples));
      urls.push(url);
      map[name] = url;
      if (onProgress) onProgress((i + 1) / names.length);
    }
    kit.audio.register(map);
    return names;
  }

  function dispose() {
    while (urls.length) {
      try { URL.revokeObjectURL(urls.pop()); } catch (e) { /* ignore */ }
    }
  }

  root.BBAudio = {
    RATE: RATE,
    names: Object.keys(BANK),
    install: install,
    dispose: dispose
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BBAudio;
})(typeof window !== 'undefined' ? window : globalThis);
