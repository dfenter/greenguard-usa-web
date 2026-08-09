// audio.js — Redline GT engine synthesis + music stems.
// The engine is synthesised so it can track RPM continuously (the house
// pattern: synth engine + asset SFX for everything discrete). Every node is
// routed into the GGKit sfx/music buses so the kit's mute, volume and
// suspend/resume contracts still own the output.

// ------------------------------------------------------- shared context
// GGKit keeps its AudioContext private and creates it lazily inside its own
// first-gesture unlock handler. Two contexts on iOS starve each other and the
// second one is created outside the gesture, so the engine could come up
// suspended and stay that way.
//
// This module therefore installs a one-instance AudioContext factory BEFORE
// GGKit ever constructs one (module bodies evaluate before game.js runs). Both
// the kit and this file then hold the SAME context: it is created and unlocked
// by the kit's own gesture handler, its suspend/resume lifecycle is the kit's,
// and nothing here can outlive or diverge from it. Output level still mirrors
// the kit's mute and volume prefs on every change (see syncPrefs in game.js).
let sharedCtx = null;
(function installSharedAudioContext() {
  if (typeof window === 'undefined') return;
  const Native = window.AudioContext || window.webkitAudioContext;
  if (!Native || Native.__ggShared) return;
  function Shared() {
    if (!sharedCtx) sharedCtx = new Native();
    return sharedCtx;
  }
  Shared.__ggShared = true;
  Shared.prototype = Native.prototype;
  window.AudioContext = Shared;
  if (window.webkitAudioContext) window.webkitAudioContext = Shared;
})();

// The one context every node in this game is built on.
function kitContext() { return sharedCtx; }

export class EngineSynth {
  constructor(kit) {
    this.kit = kit;
    this.ctx = null;
    this.nodes = null;
    this.running = false;
    this.rpm = 1800;
    this.load = 0;
    this.targetGain = 0;
  }

  ensure() {
    if (this.nodes) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!this.ctx) this.ctx = kitContext() || new AC();
    const ctx = this.ctx;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }

    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(ctx.destination);

    // Two detuned saw oscillators through a lowpass = a serviceable four
    // cylinder; a square sub-octave adds the low rumble under load.
    const osc1 = ctx.createOscillator(); osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator(); osc2.type = 'sawtooth'; osc2.detune.value = 14;
    const sub = ctx.createOscillator(); sub.type = 'square';

    const g1 = ctx.createGain(); g1.gain.value = 0.34;
    const g2 = ctx.createGain(); g2.gain.value = 0.26;
    const gs = ctx.createGain(); gs.gain.value = 0.30;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 4.5;

    // Intake growl: filtered noise that swells with throttle load. Half a
    // second of noise loops indistinguishably through a bandpass and costs a
    // quarter of the fill the two-second buffer did; building this graph at the
    // GO beat was one of the measured first-seconds stalls, so the whole rig is
    // now constructed on the loading screen (see prewarm()).
    const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf; noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 420;
    noiseFilter.Q.value = 1.2;
    const noiseGain = ctx.createGain(); noiseGain.gain.value = 0;

    osc1.connect(g1); osc2.connect(g2); sub.connect(gs);
    g1.connect(filter); g2.connect(filter); gs.connect(filter);
    filter.connect(out);
    noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(out);

    osc1.start(); osc2.start(); sub.start(); noise.start();

    this.nodes = { out, osc1, osc2, sub, filter, noiseGain, noiseFilter };
    return true;
  }

  // Build the whole node graph while the loading screen is up, silent, so the
  // GO beat only has to flip a flag.
  prewarm() { this.ensure(); }

  start() {
    if (!this.ensure()) return;
    const ctx = this.ctx;
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    this.running = true;
  }

  stop() {
    this.running = false;
    if (this.nodes) {
      const t = this.ctx.currentTime;
      this.nodes.out.gain.cancelScheduledValues(t);
      this.nodes.out.gain.setValueAtTime(this.nodes.out.gain.value, t);
      this.nodes.out.gain.setTargetAtTime(0, t, 0.04);
    }
  }

  // rpm 1800..7100, load 0..1 (throttle), speedFrac 0..1
  update(rpm, load, speedFrac) {
    if (!this.running || !this.nodes) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const prefs = this.kit.audio.prefs;
    const vol = prefs.mute ? 0 : Math.min(1, prefs.sfx) * 0.16;
    const t = ctx.currentTime;
    const n = this.nodes;

    // Base pitch tracks RPM; the audible gear step comes from the RPM reset
    // the sim already performs on each shift.
    const f = 34 + (rpm - 1800) * 0.0295;
    n.osc1.frequency.setTargetAtTime(f, t, 0.035);
    n.osc2.frequency.setTargetAtTime(f * 1.005, t, 0.035);
    n.sub.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    n.filter.frequency.setTargetAtTime(430 + rpm * 0.34 + load * 900, t, 0.06);
    n.noiseFilter.frequency.setTargetAtTime(320 + speedFrac * 1500, t, 0.08);
    n.noiseGain.gain.setTargetAtTime(vol * (0.18 + load * 0.42) * (0.35 + speedFrac), t, 0.08);
    n.out.gain.setTargetAtTime(vol * (0.55 + load * 0.45), t, 0.05);
  }

  // Pause: silence immediately and stop driving the graph. Resume re-enters the
  // shared context explicitly, because a context that was suspended while the
  // page was hidden does not always come back on its own.
  suspend() {
    if (this.nodes) {
      const t = this.ctx.currentTime;
      this.nodes.out.gain.cancelScheduledValues(t);
      this.nodes.out.gain.setValueAtTime(0, t);
      this.nodes.noiseGain.gain.cancelScheduledValues(t);
      this.nodes.noiseGain.gain.setValueAtTime(0, t);
    }
  }

  resume() {
    const ctx = this.ctx;
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
  }

  dispose() {
    if (!this.nodes) return;
    const n = this.nodes;
    try { n.osc1.stop(); n.osc2.stop(); n.sub.stop(); } catch (e) {}
    try { n.out.disconnect(); } catch (e) {}
    this.nodes = null;
  }
}

// ---------------------------------------------------------------- music
// Layered synth stems used when no licensed music track is available, and as
// the menu bed. Three stems (pad, bass pulse, arpeggio) crossfade by intensity
// so menu and race share one generator with different mixes.
export class SynthMusic {
  constructor(kit) {
    this.kit = kit;
    this.ctx = null;
    this.nodes = null;
    this.mode = null;
    this.startedAt = 0;
    this.timer = null;
    this.step = 0;
    this.paused = false;
  }

  ensure() {
    if (this.nodes) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = kitContext() || new AC();
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(ctx.destination);

    const padGain = ctx.createGain(); padGain.gain.value = 0.0;
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

  // mode: 'menu' | 'race'
  play(mode) {
    if (!this.ensure()) return;
    if (this.mode === mode) return;
    this.mode = mode;
    const ctx = this.ctx;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    const n = this.nodes;
    const t = ctx.currentTime;
    const menu = mode === 'menu';

    // Root motion differs per mode: menu is a slow suspended pad, race is a
    // driving minor pulse an octave lower.
    const root = menu ? 138.59 : 92.50; // C#3 / F#2
    n.pads.forEach((o, i) => {
      const mult = menu ? [1, 1.5, 2.0][i] : [1, 1.335, 2.0][i];
      o.frequency.setTargetAtTime(root * mult, t, 0.4);
    });
    n.padFilter.frequency.setTargetAtTime(menu ? 900 : 1650, t, 0.6);
    n.padGain.gain.setTargetAtTime(menu ? 0.85 : 0.55, t, 0.8);

    this.applyVolume();
    this.startSequencer(menu ? 640 : 340, menu
      ? [0, 3, 7, 10, 7, 3]
      : [0, 7, 12, 10, 12, 7, 5, 7]);
  }

  startSequencer(intervalMs, semis) {
    if (this.timer) clearInterval(this.timer);
    this.step = 0;
    const root = this.mode === 'menu' ? 277.18 : 369.99;
    const tick = () => {
      if (!this.nodes || this.kit.paused) return;
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      const prefs = this.kit.audio.prefs;
      if (prefs.mute) return;
      const t = ctx.currentTime;
      const semi = semis[this.step % semis.length];
      this.step++;
      const o = ctx.createOscillator();
      o.type = this.mode === 'menu' ? 'triangle' : 'square';
      o.frequency.value = root * Math.pow(2, semi / 12);
      const g = ctx.createGain();
      const peak = (this.mode === 'menu' ? 0.10 : 0.075);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0008, t + intervalMs / 1000 * 0.92);
      o.connect(g); g.connect(this.nodes.leadFilter);
      o.start(t); o.stop(t + intervalMs / 1000);
    };
    this.timer = setInterval(tick, intervalMs);
    this.nodes.leadGain.gain.value = 1;
  }

  // The pad is a continuous drone, so pause and mute have to reach its own
  // output gain: only the sequencer used to check them, which left the bed
  // audible over a paused game and after Sound was switched off.
  applyVolume() {
    if (!this.nodes || !this.ctx) return;
    const prefs = this.kit.audio.prefs;
    const off = prefs.mute || this.paused || !this.mode;
    const v = off ? 0 : Math.min(1, prefs.music) * 0.30;
    this.nodes.out.gain.setTargetAtTime(v, this.ctx.currentTime, this.paused ? 0.05 : 0.3);
  }

  setPaused(p) {
    this.paused = !!p;
    if (!this.paused && this.ctx && this.ctx.state === 'suspended') {
      try { this.ctx.resume(); } catch (e) {}
    }
    this.applyVolume();
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.mode = null;
    if (this.nodes && this.ctx) {
      this.nodes.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    }
  }

  dispose() {
    this.stop();
    if (!this.nodes) return;
    try { this.nodes.pads.forEach((o) => o.stop()); } catch (e) {}
    try { this.nodes.out.disconnect(); } catch (e) {}
    this.nodes = null;
  }
}

// ------------------------------------------------------- music director
// Plays the licensed CC0 tracks through the kit's music bus (which owns
// crossfade, looping and the music volume pref) and falls back to the
// SynthMusic bed above when a track cannot be fetched or decoded. Nothing
// is fetched until the first user gesture, so the menu paints on a cold
// load without competing for bandwidth with the car models.
//
// tracks: { menu: 'name', race: ['nameA', 'nameB'] } — names already
// registered with kit.audio.register().
export class MusicDirector {
  constructor(kit, tracks) {
    this.kit = kit;
    this.tracks = tracks;
    this.synth = new SynthMusic(kit);
    this.mode = null;         // 'menu' | 'race' | null (read by the settings row)
    this.useSynth = false;    // latched true once a decode has failed
    this.raceIndex = 0;
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

  // Name of the track that play(mode) would pick next, without consuming the
  // race rotation slot.
  nextName(mode) {
    if (mode !== 'race') return this.tracks.menu;
    const list = this.tracks.race;
    return list[this.raceIndex % list.length];
  }

  // Decode ahead of time so the switch into a mode never runs a decode on a
  // gameplay frame. Resolves either way; a failed decode just latches the
  // synth bed at play() time.
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
    if (mode === 'race') {
      const list = this.tracks.race;
      name = list[this.raceIndex % list.length];
      this.raceIndex++;
    } else {
      name = this.tracks.menu;
    }
    // preload resolves to the decoded buffer, or null when fetch/decode
    // failed. The kit's music() would just no-op on a null buffer, so we
    // check here and swap in the synth bed instead of shipping silence.
    Promise.resolve(this.kit.audio.preload([name])).then((res) => {
      const buf = res && res[0];
      if (!buf || !buf.duration) {
        this.useSynth = true;
        if (this.mode) this.synth.play(this.mode);
        return;
      }
      if (this.mode !== mode) return; // mode changed while decoding
      this.kit.audio.music(name, 900);
    }).catch(() => {
      this.useSynth = true;
      if (this.mode) this.synth.play(this.mode);
    });
  }

  // The settings row toggles kit.audio.setMusicVolume, which already owns
  // the kit bus; only the synth bed needs to be told.
  applyVolume() { if (this.useSynth) this.synth.applyVolume(); }

  // Pause/resume have to reach the fallback bed explicitly: the kit only owns
  // its own music bus, and the synth bed is not on it.
  setPaused(p) { this.synth.setPaused(p); }

  stop() {
    this.mode = null;
    this.pending = null;
    this.synth.stop();
    try { this.kit.audio.stopMusic(); } catch (e) {}
  }

  dispose() { this.synth.dispose(); }
}
