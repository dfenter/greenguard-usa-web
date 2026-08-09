// audio.js — Rally Dust engine synthesis, co-driver voice chips and music.
//
// The engine is synthesised so it can track RPM continuously, and because a
// rally car wants gravel and overrun pops that a single looped sample cannot
// give. Discrete events stay sampled assets. Every node reads the GGKit audio
// prefs, so the kit's mute, volume and suspend contracts still own the output.
//
// Adapted from the sibling title Redline GT's audio module; nothing is
// imported. The co-driver voice chip generator is new to this title.

// ------------------------------------------------------- shared audio graph
// GGKit owns the audio contract: one context, touch unlock, mute, per-bus
// volume and the visibility suspend. It keeps its context private and this
// title may not modify shared code, so instead of building a second context we
// CAPTURE the one GGKit constructs and hang our procedural buses off it.
//
// `captureAudioContext()` must run before GGKit.create(). It leaves a subclass
// installed that records the first context the page builds, which is always the
// kit's: nothing else in this title constructs one. The result is a single
// context (iOS starves multiple ones), so kit.audio.suspend()/resume() on
// visibility governs the engine, the co-driver and the synth bed as well.
let capturedCtx = null;
export function captureAudioContext(root) {
  const w = root || window;
  const AC = w.AudioContext || w.webkitAudioContext;
  if (!AC || AC.__ggCaptured) return;
  function Captured(...args) {
    const inst = new AC(...args);
    if (!capturedCtx) capturedCtx = inst;
    return inst;
  }
  Captured.prototype = AC.prototype;
  Captured.__ggCaptured = true;
  try {
    if (w.AudioContext) w.AudioContext = Captured;
    if (w.webkitAudioContext) w.webkitAudioContext = Captured;
  } catch (e) { /* frozen global: fall back to our own context */ }
}

// The kit builds its context lazily on the first gesture or the first preload.
// Nudging sfx() with an unregistered name runs its ensureCtx() and plays
// nothing, so the shared context exists by the time anything synthesised does.
function sharedContext(kit) {
  if (capturedCtx) return capturedCtx;
  try { kit.audio.sfx('__ctx'); } catch (e) {}
  if (capturedCtx) return capturedCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  capturedCtx = new AC();
  return capturedCtx;
}

// Our two procedural buses on the kit's context. They mirror the kit's own
// bus maths off kit.audio.prefs, so the settings mute and the volume sliders
// own the procedural output exactly as they own the sampled output.
const buses = { ctx: null, sfx: null, music: null };
function procBus(kit, which) {
  const ctx = sharedContext(kit);
  if (!ctx) return null;
  if (buses.ctx !== ctx) {
    buses.ctx = ctx;
    buses.sfx = ctx.createGain();
    buses.music = ctx.createGain();
    buses.sfx.connect(ctx.destination);
    buses.music.connect(ctx.destination);
  }
  const p = kit.audio.prefs;
  buses.sfx.gain.value = p.mute ? 0 : Math.min(1, p.sfx);
  buses.music.gain.value = p.mute ? 0 : Math.min(1, p.music);
  return which === 'music' ? buses.music : buses.sfx;
}

// Keep the procedural buses in step with the kit prefs whenever they change.
export function refreshBuses(kit) {
  if (!buses.ctx) return;
  const p = kit.audio.prefs;
  buses.sfx.gain.value = p.mute ? 0 : Math.min(1, p.sfx);
  buses.music.gain.value = p.mute ? 0 : Math.min(1, p.music);
}

export class EngineSynth {
  constructor(kit) {
    this.kit = kit;
    this.ctx = null;
    this.nodes = null;
    this.running = false;
    this.lastPop = 0;
    this.prevLoad = 0;
  }

  ensure() {
    if (this.nodes) return true;
    const bus = procBus(this.kit, 'sfx');
    if (!bus) return false;
    this.ctx = buses.ctx;
    const ctx = this.ctx;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }

    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(bus);       // engine rides the kit sfx bus, never destination

    // Three detuned saws through a resonant lowpass reads as a small turbo
    // four; a square sub-octave carries the low end under load.
    const osc1 = ctx.createOscillator(); osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator(); osc2.type = 'sawtooth'; osc2.detune.value = 19;
    const osc3 = ctx.createOscillator(); osc3.type = 'sawtooth'; osc3.detune.value = -23;
    const sub = ctx.createOscillator(); sub.type = 'square';

    const g1 = ctx.createGain(); g1.gain.value = 0.30;
    const g2 = ctx.createGain(); g2.gain.value = 0.22;
    const g3 = ctx.createGain(); g3.gain.value = 0.18;
    const gs = ctx.createGain(); gs.gain.value = 0.30;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 5.2;

    // Gravel bed: band-passed noise that swells with throttle and speed. On a
    // loose surface this is most of what the car actually sounds like.
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf; noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 420;
    noiseFilter.Q.value = 1.1;
    const noiseGain = ctx.createGain(); noiseGain.gain.value = 0;

    osc1.connect(g1); osc2.connect(g2); osc3.connect(g3); sub.connect(gs);
    g1.connect(filter); g2.connect(filter); g3.connect(filter); gs.connect(filter);
    filter.connect(out);
    noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(out);

    osc1.start(); osc2.start(); osc3.start(); noise.start(); sub.start();

    this.nodes = { out, osc1, osc2, osc3, sub, filter, noiseGain, noiseFilter, noiseBuf };
    return true;
  }

  start() { if (this.ensure()) this.running = true; }

  stop() {
    this.running = false;
    if (this.nodes && this.ctx) {
      const t = this.ctx.currentTime;
      this.nodes.out.gain.cancelScheduledValues(t);
      this.nodes.out.gain.setTargetAtTime(0, t, 0.05);
    }
  }

  // Overrun crackle when the driver lifts off at high RPM: a very short burst
  // of filtered noise. This is the sound rally cars are recognised by.
  pop(strength) {
    if (!this.running || !this.nodes) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - this.lastPop < 0.09) return;
    this.lastPop = now;
    const prefs = this.kit.audio.prefs;
    if (prefs.mute) return;
    const src = ctx.createBufferSource();
    src.buffer = this.nodes.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1100 + Math.random() * 900; bp.Q.value = 2.2;
    const g = ctx.createGain();
    const peak = 0.14 * strength;        // prefs.sfx is applied by the bus
    g.gain.setValueAtTime(peak, now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.07);
    src.connect(bp); bp.connect(g); g.connect(procBus(this.kit, 'sfx') || ctx.destination);
    src.start(now); src.stop(now + 0.09);
  }

  // rpm 1800..7100, load 0..1 (throttle), speedFrac 0..1, grit 0..1.5
  update(rpm, load, speedFrac, grit) {
    if (!this.running || !this.nodes) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const prefs = this.kit.audio.prefs;
    // The kit's own mute and volume sliders live on its private buses; mirror
    // them onto ours every frame so one setting owns both halves of the mix.
    refreshBuses(this.kit);
    const vol = prefs.mute ? 0 : 0.15;   // prefs.sfx is applied by the bus
    const t = ctx.currentTime;
    const n = this.nodes;

    if (this.prevLoad > 0.7 && load < 0.3 && rpm > 4200) this.pop(0.6 + speedFrac * 0.6);
    this.prevLoad = load;

    const f = 32 + (rpm - 1800) * 0.0305;
    n.osc1.frequency.setTargetAtTime(f, t, 0.032);
    n.osc2.frequency.setTargetAtTime(f * 1.004, t, 0.032);
    n.osc3.frequency.setTargetAtTime(f * 0.997, t, 0.032);
    n.sub.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    n.filter.frequency.setTargetAtTime(400 + rpm * 0.32 + load * 900, t, 0.06);
    const g = grit == null ? 1 : grit;
    n.noiseFilter.frequency.setTargetAtTime(300 + speedFrac * 1400 * (0.6 + g * 0.5), t, 0.08);
    n.noiseGain.gain.setTargetAtTime(vol * (0.16 + load * 0.34) * (0.3 + speedFrac) * (0.5 + g * 0.6), t, 0.08);
    n.out.gain.setTargetAtTime(vol * (0.52 + load * 0.48), t, 0.05);
  }

  suspend() { if (this.nodes) this.nodes.out.gain.value = 0; }

  dispose() {
    if (!this.nodes) return;
    const n = this.nodes;
    try { n.osc1.stop(); n.osc2.stop(); n.osc3.stop(); n.sub.stop(); } catch (e) {}
    try { n.out.disconnect(); } catch (e) {}
    this.nodes = null;
  }
}

// -------------------------------------------------------------- co-driver
// Pace notes are read as short pitched chips rather than recorded speech: one
// chip per word, on a contour that falls for a left call and rises for a right
// one, so the note is legible with the screen unread. No language, no voice
// actor, no licensing question, and it costs nothing to download.
export class CoDriver {
  constructor(kit) {
    this.kit = kit;
    this.ctx = null;
    this.out = null;
  }

  ensure() {
    if (this.out) return true;
    const bus = procBus(this.kit, 'sfx');
    if (!bus) return false;
    this.ctx = buses.ctx;
    const out = this.ctx.createGain();
    out.gain.value = 1;
    out.connect(bus);       // co-driver rides the kit sfx bus
    this.out = out;
    return true;
  }

  // `text` is the pace note; `urgency` 0..1 raises the pitch and the pace.
  say(text, urgency) {
    if (!this.ensure()) return;
    const ctx = this.ctx;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    if (ctx.state !== 'running') return;
    const prefs = this.kit.audio.prefs;
    if (prefs.mute) return;
    const words = String(text).split(' ').filter(Boolean).slice(0, 4);
    if (!words.length) return;
    const u = urgency == null ? 0.5 : urgency;
    const rising = /RIGHT/.test(text);
    const base = 260 + u * 90;
    const vol = 0.16;                    // prefs.sfx is applied by the bus
    const step = 0.115 - u * 0.02;
    const now = ctx.currentTime + 0.02;

    for (let i = 0; i < words.length; i++) {
      const t0 = now + i * step;
      const contour = words.length > 1 ? (i / (words.length - 1)) : 0.5;
      const f = base * (rising ? (0.9 + contour * 0.36) : (1.16 - contour * 0.34));
      // Two stacked oscillators through a bandpass make a vowel-ish chip.
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * 3.1;
      bp.Q.value = 3.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0006, t0 + step * 0.82);
      const o1 = ctx.createOscillator(); o1.type = 'square'; o1.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 2;
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      o1.connect(bp); o2.connect(g2); g2.connect(bp);
      bp.connect(g); g.connect(this.out);
      o1.start(t0); o2.start(t0);
      o1.stop(t0 + step); o2.stop(t0 + step);
    }
  }
}

// ---------------------------------------------------------------- music
// Layered synth stems, used as the decode-failure fallback so the game never
// ships silence when a track cannot be fetched.
export class SynthMusic {
  constructor(kit) {
    this.kit = kit;
    this.ctx = null;
    this.nodes = null;
    this.mode = null;
    this.timer = null;
    this.step = 0;
  }

  ensure() {
    if (this.nodes) return true;
    const bus = procBus(this.kit, 'music');
    if (!bus) return false;
    this.ctx = buses.ctx;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(bus);       // fallback bed rides the kit music bus

    const padGain = ctx.createGain(); padGain.gain.value = 0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass'; padFilter.frequency.value = 1200; padFilter.Q.value = 0.7;
    padFilter.connect(padGain); padGain.connect(out);

    const pads = [];
    for (const detune of [-7, 0, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.detune.value = detune;
      const g = ctx.createGain(); g.gain.value = 0.16;
      o.connect(g); g.connect(padFilter);
      o.start();
      pads.push(o);
    }

    const leadGain = ctx.createGain(); leadGain.gain.value = 0;
    const leadFilter = ctx.createBiquadFilter();
    leadFilter.type = 'lowpass'; leadFilter.frequency.value = 2600;
    leadFilter.connect(leadGain); leadGain.connect(out);

    this.nodes = { out, padGain, padFilter, pads, leadGain, leadFilter };
    return true;
  }

  play(mode) {
    if (!this.ensure()) return;
    if (this.mode === mode) return;
    this.mode = mode;
    const ctx = this.ctx;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    const n = this.nodes;
    const t = ctx.currentTime;
    const menu = mode === 'menu';
    const root = menu ? 130.81 : 87.31;
    n.pads.forEach((o, i) => {
      const mult = menu ? [1, 1.5, 2.0][i] : [1, 1.335, 2.0][i];
      o.frequency.setTargetAtTime(root * mult, t, 0.4);
    });
    n.padFilter.frequency.setTargetAtTime(menu ? 880 : 1600, t, 0.6);
    n.padGain.gain.setTargetAtTime(menu ? 0.85 : 0.55, t, 0.8);
    this.applyVolume();
    this.startSequencer(menu ? 620 : 330, menu ? [0, 3, 7, 10, 7, 3] : [0, 7, 10, 12, 10, 7, 5, 3]);
  }

  startSequencer(intervalMs, semis) {
    if (this.timer) clearInterval(this.timer);
    this.step = 0;
    const root = this.mode === 'menu' ? 261.63 : 349.23;
    const tick = () => {
      if (!this.nodes || this.kit.paused) return;
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      if (this.kit.audio.prefs.mute) return;
      const t = ctx.currentTime;
      const semi = semis[this.step % semis.length];
      this.step++;
      const o = ctx.createOscillator();
      o.type = this.mode === 'menu' ? 'triangle' : 'square';
      o.frequency.value = root * Math.pow(2, semi / 12);
      const g = ctx.createGain();
      const peak = this.mode === 'menu' ? 0.10 : 0.075;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0008, t + intervalMs / 1000 * 0.92);
      o.connect(g); g.connect(this.nodes.leadFilter);
      o.start(t); o.stop(t + intervalMs / 1000);
    };
    this.timer = setInterval(tick, intervalMs);
    this.nodes.leadGain.gain.value = 1;
  }

  applyVolume() {
    refreshBuses(this.kit);
    if (!this.nodes || !this.ctx) return;
    const prefs = this.kit.audio.prefs;
    const v = prefs.mute ? 0 : 0.30;     // prefs.music is applied by the bus
    this.nodes.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.mode = null;
    if (this.nodes && this.ctx) this.nodes.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
  }

  dispose() {
    this.stop();
    if (!this.nodes) return;
    try { this.nodes.pads.forEach((o) => o.stop()); } catch (e) {}
    try { this.nodes.out.disconnect(); } catch (e) {}
    this.nodes = null;
  }
}

// Plays the licensed CC0 tracks through the kit's music bus (which owns
// crossfade, looping and the music volume pref) and falls back to the synth
// bed above when a track cannot be fetched or decoded. Nothing is fetched
// before the first user gesture, so a cold load paints without competing for
// bandwidth with the car models.
export class MusicDirector {
  constructor(kit, tracks) {
    this.kit = kit;
    this.tracks = tracks;
    this.synth = new SynthMusic(kit);
    this.mode = null;
    this.useSynth = false;
    this.stageIndex = 0;
    this.unlocked = false;
    this.pending = null;
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      const m = this.pending;
      this.pending = null;
      if (m) this._start(m);
    };
    ['pointerdown', 'touchstart', 'keydown'].forEach((t) => {
      window.addEventListener(t, unlock, { once: true, passive: true });
    });
  }

  nextName(mode) {
    if (mode !== 'stage') return this.tracks.menu;
    const list = this.tracks.stage;
    return list[this.stageIndex % list.length];
  }

  preloadFor(mode) {
    if (this.useSynth) return Promise.resolve();
    return Promise.resolve(this.kit.audio.preload([this.nextName(mode)])).catch(() => {});
  }

  play(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (!this.unlocked) { this.pending = mode; return; }
    this._start(mode);
  }

  _start(mode) {
    if (this.useSynth) { this.synth.play(mode); return; }
    let name;
    if (mode === 'stage') {
      const list = this.tracks.stage;
      name = list[this.stageIndex % list.length];
      this.stageIndex++;
    } else {
      name = this.tracks.menu;
    }
    Promise.resolve(this.kit.audio.preload([name])).then((res) => {
      const buf = res && res[0];
      if (!buf || !buf.duration) {
        this.useSynth = true;
        if (this.mode) this.synth.play(this.mode);
        return;
      }
      if (this.mode !== mode) return;   // mode changed while decoding
      this.kit.audio.music(name, 900);
    }).catch(() => {
      this.useSynth = true;
      if (this.mode) this.synth.play(this.mode);
    });
  }

  applyVolume() { refreshBuses(this.kit); if (this.useSynth) this.synth.applyVolume(); }

  stop() {
    this.mode = null;
    this.pending = null;
    this.synth.stop();
    try { this.kit.audio.stopMusic(); } catch (e) {}
  }

  dispose() { this.synth.dispose(); }
}
