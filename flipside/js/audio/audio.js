import { FACES, WIN_PHASE } from '../config.js?v=e886a29';

// FLIPSIDE procedural audio.  The module is deliberately silent until the
// first user gesture calls unlock(), so loading the game never creates an
// AudioContext or triggers a browser autoplay warning.

const WORLD_FADE_MS = 400;
const LAYER_FADE_MS = 720;
const MUSIC_STEP_SEC = 0.5;
const MUSIC_LOOKAHEAD_SEC = 0.14;
const MUSIC_START_DELAY_SEC = 0.035;
const MAX_MUSIC_SOURCES = 32;
const MAX_SFX_SOURCES = 48;
const MIN_GAIN = 0.0001;

const SUN_MELODY = [0, 4, 7, 11, 14, 11, 7, 4];
const DUSK_MELODY = [0, 3, 7, 10, 14, 10, 7, 3];
const INK_MELODY = [0, 3, 7, 10, 14, 10, 7, 3];
const DAWN_MELODY = [0, 5, 7, 12, 14, 12, 7, 5];
const CLEAR_NOTES = [0, 4, 7, 11];
const PHASE_UP_NOTES = [0, 4, 7];
const GOLD_CASCADE = [12, 16, 19, 23, 24];
const GOLD_CASCADE_CALM = [12, 19, 24];
const VICTORY_NOTES = [60, 64, 67, 72, 76];
const GAMEOVER_NOTES = [392, 330, 262];

const LAYER_BASE = 0;
const LAYER_BASS = 1;
const LAYER_COUNTER = 2;

// Each face gets its own small arrangement.  The shared step clock keeps the
// four moods musically related while their voicings and register make the
// fold around the cube feel like a change of paper stock, not a hard cut.
const WORLD_ARRANGEMENTS = {
  sun: {
    rootMidi: 60, melody: SUN_MELODY,
    bass: [-12, -12, -5, -12, -10, -12, -5, -12],
    counter: [12, 16, 14, 16, 19, 16, 14, 16],
    baseType: 'triangle', baseDuration: 0.23, baseVolume: 0.052,
    baseAttack: 0.006, baseRelease: 0.13, baseRatio: 2, baseOvertone: 0.018,
    bassType: 'sine', bassDuration: 0.34, bassVolume: 0.045,
    bassAttack: 0.012, bassRelease: 0.23,
    counterType: 'sine', counterDuration: 0.24, counterVolume: 0.034,
    counterAttack: 0.014, counterRelease: 0.16, counterDelay: 0.018,
    kickEvery: 4, kickStart: 135, kickEnd: 53, kickVolume: 0.075,
  },
  dusk: {
    rootMidi: 58, melody: DUSK_MELODY,
    bass: [-12, -12, -9, -12, -2, -12, -9, -12],
    counter: [10, 14, 17, 14, 10, 14, 17, 14],
    baseType: 'triangle', baseDuration: 0.34, baseVolume: 0.038,
    baseAttack: 0.025, baseRelease: 0.19, baseRatio: 1.498, baseOvertone: 0.012,
    bassType: 'sine', bassDuration: 0.48, bassVolume: 0.036,
    bassAttack: 0.028, bassRelease: 0.31,
    counterType: 'triangle', counterDuration: 0.34, counterVolume: 0.025,
    counterAttack: 0.032, counterRelease: 0.22, counterDelay: 0.03,
    kickEvery: 8, kickStart: 108, kickEnd: 48, kickVolume: 0.043,
  },
  ink: {
    rootMidi: 57, melody: INK_MELODY,
    bass: [-12, -12, -5, -12, -2, -12, -5, -12],
    counter: [12, 15, 19, 15, 12, 15, 19, 15],
    baseType: 'sawtooth', baseDuration: 0.68, baseVolume: 0.026,
    baseAttack: 0.075, baseRelease: 0.28, baseRatio: 2, baseOvertone: 0.013,
    bassType: 'triangle', bassDuration: 0.62, bassVolume: 0.033,
    bassAttack: 0.06, bassRelease: 0.38,
    counterType: 'sine', counterDuration: 0.52, counterVolume: 0.022,
    counterAttack: 0.09, counterRelease: 0.3, counterDelay: 0.055,
    kickEvery: 0,
  },
  dawn: {
    rootMidi: 62, melody: DAWN_MELODY,
    bass: [-12, -12, -5, -12, -7, -12, -5, -12],
    counter: [17, 19, 24, 19, 17, 19, 24, 19],
    baseType: 'sine', baseDuration: 0.76, baseVolume: 0.03,
    baseAttack: 0.12, baseRelease: 0.38, baseRatio: 2, baseOvertone: 0.013,
    bassType: 'sine', bassDuration: 0.58, bassVolume: 0.031,
    bassAttack: 0.09, bassRelease: 0.36,
    counterType: 'triangle', counterDuration: 0.64, counterVolume: 0.023,
    counterAttack: 0.13, counterRelease: 0.38, counterDelay: 0.045,
    kickEvery: 8, kickStart: 96, kickEnd: 44, kickVolume: 0.032,
  },
};

function midiToHz(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function safeDisconnect(node) {
  try {
    if (node && typeof node.disconnect === 'function') node.disconnect();
  } catch (_) {
    // Audio nodes can already be disconnected or belong to a closed context.
  }
}

function setParam(param, method, value, time) {
  if (!param || !isFiniteNumber(value)) return;
  try {
    if (typeof param[method] === 'function' && isFiniteNumber(time)) {
      param[method](value, time);
    } else {
      param.value = value;
    }
  } catch (_) {
    try { param.value = value; } catch (__) { /* unavailable AudioParam */ }
  }
}

function setNodeParam(node, name, value) {
  try {
    if (node && node[name]) node[name].value = value;
  } catch (_) {
    // Optional node parameters are not available in every browser environment.
  }
}

function createNoiseBuffer(ctx) {
  try {
    const sampleRate = isFiniteNumber(ctx.sampleRate) ? ctx.sampleRate : 44100;
    const length = Math.max(1, Math.floor(sampleRate * 2));
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x4f1bbcdc;
    for (let i = 0; i < data.length; i += 1) {
      // A tiny deterministic generator keeps the noise stable across unlocks
      // without touching the game's seeded piece randomizer.
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0x80000000) - 1;
    }
    return buffer;
  } catch (_) {
    return null;
  }
}

function prefersReducedMotion() {
  try {
    return Boolean(globalThis.matchMedia &&
      globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (_) {
    return false;
  }
}

function phaseBlend(phase) {
  const clamped = Math.min(WIN_PHASE, Math.max(1, Number(phase) || 1));
  const t = (clamped - 1) / (WIN_PHASE - 1);
  return t * t * (3 - 2 * t);
}

function layerGain(layer, phase, calm) {
  if (layer === LAYER_BASE) return 1;
  const blend = phaseBlend(phase);
  if (layer === LAYER_BASS) {
    return (0.055 + blend * 0.945) * (calm ? 0.72 : 1);
  }
  return (0.018 + blend * 0.982) * (calm ? 0.54 : 1);
}

function createGraph(ctx, world, musicOn, sfxOn, phase, calm) {
  const musicMaster = ctx.createGain();
  const sfxMaster = ctx.createGain();
  const inkFilter = ctx.createBiquadFilter();
  const inkDelay = ctx.createDelay(1.2);
  const inkFeedback = ctx.createGain();
  const inkEcho = ctx.createGain();
  const inkReturn = ctx.createGain();
  const moodBuses = [];
  const layerBuses = [];
  const activeMood = FACES.indexOf(world);

  setNodeParam(musicMaster, 'gain', musicOn ? 0.15 : 0);
  setNodeParam(sfxMaster, 'gain', sfxOn ? 0.24 : 0);

  try { inkFilter.type = 'lowpass'; } catch (_) { /* optional */ }
  setNodeParam(inkFilter, 'frequency', 1100);
  setNodeParam(inkFilter, 'Q', 0.65);
  setNodeParam(inkDelay, 'delayTime', 0.19);
  setNodeParam(inkFeedback, 'gain', 0.2);
  setNodeParam(inkEcho, 'gain', 0.22);
  setNodeParam(inkReturn, 'gain', world === 'ink' ? 1 : 0);

  for (let mood = 0; mood < FACES.length; mood += 1) {
    const moodBus = ctx.createGain();
    const layers = [ctx.createGain(), ctx.createGain(), ctx.createGain()];
    moodBuses.push(moodBus);
    layerBuses.push(layers);
    setNodeParam(moodBus, 'gain', mood === activeMood ? 1 : 0);
    for (let layer = 0; layer < layers.length; layer += 1) {
      setNodeParam(layers[layer], 'gain', layerGain(layer, phase, calm));
      layers[layer].connect(moodBus);
    }
    if (FACES[mood] === 'ink') moodBus.connect(inkFilter);
    else moodBus.connect(musicMaster);
  }
  inkFilter.connect(musicMaster);
  inkFilter.connect(inkDelay);
  inkDelay.connect(inkEcho);
  inkEcho.connect(inkReturn);
  inkReturn.connect(musicMaster);
  inkDelay.connect(inkFeedback);
  inkFeedback.connect(inkDelay);
  musicMaster.connect(ctx.destination);
  sfxMaster.connect(ctx.destination);

  return {
    musicMaster,
    sfxMaster,
    moodBuses,
    layerBuses,
    // Keep these aliases local-contract friendly for older QA harnesses.
    sunBus: moodBuses[FACES.indexOf('sun')],
    inkBus: moodBuses[FACES.indexOf('ink')],
    inkReturn,
    noiseBuffer: createNoiseBuffer(ctx),
  };
}

function normalizeRows(evt) {
  if (Array.isArray(evt && evt.rows)) return Math.max(1, Math.min(4, evt.rows.length));
  const value = evt && (evt.count ?? evt.lines ?? evt.n ?? evt.rows);
  const rows = Number(value);
  return Number.isFinite(rows) ? Math.max(1, Math.min(4, Math.floor(rows))) : 1;
}

export function createAudio() {
  let ctx = null;
  let graph = null;
  let world = 'sun';
  let music = true;
  let sfx = true;
  let muted = false;
  let musicStep = 0;
  let musicNextAt = 0;
  let musicSources = new Set();
  let sfxSources = new Set();
  let musicPhase = 1;
  let calmMode = prefersReducedMotion();

  function contextConstructor() {
    try {
      const root = globalThis;
      return root.AudioContext || root.webkitAudioContext || null;
    } catch (_) {
      return null;
    }
  }

  function now() {
    try {
      return ctx && isFiniteNumber(ctx.currentTime) ? ctx.currentTime : 0;
    } catch (_) {
      return 0;
    }
  }

  function audibleMusic() {
    return music && !muted;
  }

  function audibleSfx() {
    return sfx && !muted;
  }

  function musicOutputGain() {
    return audibleMusic() ? 0.15 : 0;
  }

  function rampParam(param, target, start, duration) {
    if (!param || !isFiniteNumber(target) || !isFiniteNumber(start)) return;
    const end = start + Math.max(0.001, duration);
    try {
      if (typeof param.cancelAndHoldAtTime === 'function') {
        param.cancelAndHoldAtTime(start);
      } else {
        if (typeof param.cancelScheduledValues === 'function') {
          param.cancelScheduledValues(start);
        }
        const current = isFiniteNumber(param.value) ? param.value : 0;
        setParam(param, 'setValueAtTime', current, start);
      }
      setParam(param, 'linearRampToValueAtTime', target, end);
    } catch (_) {
      try { param.value = target; } catch (__) { /* unavailable AudioParam */ }
    }
  }

  function applyLayerGains() {
    if (!ctx || !graph || !graph.layerBuses) return;
    const at = now() + 0.004;
    for (let mood = 0; mood < graph.layerBuses.length; mood += 1) {
      const layers = graph.layerBuses[mood];
      rampParam(layers[LAYER_BASS].gain, layerGain(LAYER_BASS, musicPhase, calmMode),
        at, LAYER_FADE_MS / 1000);
      rampParam(layers[LAYER_COUNTER].gain, layerGain(LAYER_COUNTER, musicPhase, calmMode),
        at, LAYER_FADE_MS / 1000);
    }
  }

  function setMusicPhase(nextPhase) {
    const value = Number(nextPhase);
    if (!Number.isFinite(value)) return;
    const next = Math.min(WIN_PHASE, Math.max(1, Math.floor(value)));
    if (next === musicPhase) return;
    musicPhase = next;
    applyLayerGains();
  }

  function refreshCalmMode() {
    const next = prefersReducedMotion();
    if (next === calmMode) return;
    calmMode = next;
    applyLayerGains();
  }

  function applyOutputLevels(fadeMusic) {
    if (!ctx || !graph) return;
    const at = now() + 0.003;
    rampParam(graph.musicMaster.gain, musicOutputGain(),
      at, fadeMusic ? 0.08 : 0.01);
    rampParam(graph.sfxMaster.gain, audibleSfx() ? 0.24 : 0,
      at, 0.015);
    if (audibleMusic() && musicNextAt < at) musicNextAt = at + MUSIC_START_DELAY_SEC;
  }

  function registerSource(source, bucket, cleanup) {
    const limit = bucket === musicSources ? MAX_MUSIC_SOURCES : MAX_SFX_SOURCES;
    if (!source || bucket.size >= limit) return false;
    bucket.add(source);
    source.onended = () => {
      bucket.delete(source);
      if (cleanup) cleanup();
      safeDisconnect(source);
    };
    return true;
  }

  function scheduleTone(options) {
    if (!ctx || !graph || !options || !options.bus) return false;
    const bucket = options.bucket === 'music' ? musicSources : sfxSources;
    const current = now();
    const when = Math.max(current + 0.002, isFiniteNumber(options.when) ? options.when : current + 0.002);
    const duration = Math.max(0.025, isFiniteNumber(options.duration) ? options.duration : 0.1);
    const end = when + duration;
    const attack = Math.min(duration * 0.35, Math.max(0.001, options.attack ?? 0.008));
    const release = Math.min(duration * 0.7, Math.max(0.008, options.release ?? 0.06));
    const peak = Math.max(MIN_GAIN, isFiniteNumber(options.volume) ? options.volume : 0.04);
    let oscillator = null;
    let amp = null;

    try {
      oscillator = ctx.createOscillator();
      amp = ctx.createGain();
      oscillator.type = options.type || 'sine';
      setParam(oscillator.frequency, 'setValueAtTime', Math.max(1, options.frequency || 220), when);
      if (isFiniteNumber(options.endFrequency) && options.endFrequency > 0) {
        setParam(oscillator.frequency, 'linearRampToValueAtTime', options.endFrequency, end);
      }
      if (isFiniteNumber(options.detune)) {
        setParam(oscillator.detune, 'setValueAtTime', options.detune, when);
      }
      setParam(amp.gain, 'setValueAtTime', MIN_GAIN, when);
      setParam(amp.gain, 'linearRampToValueAtTime', peak, when + attack);
      const releaseAt = Math.max(when + attack, end - release);
      setParam(amp.gain, 'setValueAtTime', peak, releaseAt);
      setParam(amp.gain, 'exponentialRampToValueAtTime', MIN_GAIN, end);
      oscillator.connect(amp);
      amp.connect(options.bus);
      if (!registerSource(oscillator, bucket, () => safeDisconnect(amp))) {
        safeDisconnect(amp);
        safeDisconnect(oscillator);
        return false;
      }
      oscillator.start(when);
      oscillator.stop(end + 0.012);
      return true;
    } catch (_) {
      if (oscillator) bucket.delete(oscillator);
      safeDisconnect(amp);
      safeDisconnect(oscillator);
      return false;
    }
  }

  function scheduleNoise(options) {
    if (!ctx || !graph || !graph.noiseBuffer || !options || !graph.sfxMaster) return false;
    const current = now();
    const when = Math.max(current + 0.002, isFiniteNumber(options.when) ? options.when : current + 0.002);
    const duration = Math.max(0.03, Math.min(1.8, options.duration ?? 0.2));
    const end = when + duration;
    let source = null;
    let filter = null;
    let amp = null;
    try {
      source = ctx.createBufferSource();
      filter = ctx.createBiquadFilter();
      amp = ctx.createGain();
      source.buffer = graph.noiseBuffer;
      filter.type = options.filterType || 'lowpass';
      setParam(filter.frequency, 'setValueAtTime', Math.max(30, options.frequency || 900), when);
      if (isFiniteNumber(options.endFrequency) && options.endFrequency > 0) {
        setParam(filter.frequency, 'linearRampToValueAtTime', options.endFrequency, end);
      }
      setNodeParam(filter, 'Q', options.q ?? 0.7);
      const peak = Math.max(MIN_GAIN, options.volume ?? 0.04);
      setParam(amp.gain, 'setValueAtTime', MIN_GAIN, when);
      setParam(amp.gain, 'linearRampToValueAtTime', peak, when + Math.min(0.035, duration * 0.25));
      setParam(amp.gain, 'exponentialRampToValueAtTime', MIN_GAIN, end);
      source.connect(filter);
      filter.connect(amp);
      amp.connect(graph.sfxMaster);
      if (!registerSource(source, sfxSources, () => {
        safeDisconnect(filter);
        safeDisconnect(amp);
      })) {
        safeDisconnect(source);
        safeDisconnect(filter);
        safeDisconnect(amp);
        return false;
      }
      source.start(when);
      source.stop(end + 0.012);
      return true;
    } catch (_) {
      if (source) sfxSources.delete(source);
      safeDisconnect(source);
      safeDisconnect(filter);
      safeDisconnect(amp);
      return false;
    }
  }

  function musicTone(when, frequency, layer, options) {
    const mood = FACES.indexOf(world);
    return scheduleTone({
      bucket: 'music',
      bus: graph.layerBuses[mood][layer],
      when,
      frequency,
      ...options,
    });
  }

  function scheduleKick(when, arrangement) {
    if (!ctx || !graph) return;
    const bus = graph.layerBuses[FACES.indexOf(world)][LAYER_BASS];
    const bucket = musicSources;
    if (bucket.size >= MAX_MUSIC_SOURCES) return;
    let oscillator = null;
    let amp = null;
    try {
      oscillator = ctx.createOscillator();
      amp = ctx.createGain();
      oscillator.type = 'sine';
      setParam(oscillator.frequency, 'setValueAtTime', arrangement.kickStart, when);
      setParam(oscillator.frequency, 'exponentialRampToValueAtTime', arrangement.kickEnd, when + 0.18);
      setParam(amp.gain, 'setValueAtTime', MIN_GAIN, when);
      setParam(amp.gain, 'linearRampToValueAtTime', arrangement.kickVolume, when + 0.004);
      setParam(amp.gain, 'exponentialRampToValueAtTime', MIN_GAIN, when + 0.22);
      oscillator.connect(amp);
      amp.connect(bus);
      if (!registerSource(oscillator, bucket, () => safeDisconnect(amp))) {
        safeDisconnect(amp);
        safeDisconnect(oscillator);
        return;
      }
      oscillator.start(when);
      oscillator.stop(when + 0.235);
    } catch (_) {
      if (oscillator) bucket.delete(oscillator);
      safeDisconnect(amp);
      safeDisconnect(oscillator);
    }
  }

  function scheduleMusicStep(when) {
    if (!graph || !ctx) return;
    const arrangement = WORLD_ARRANGEMENTS[world];
    const step = musicStep % arrangement.melody.length;
    const frequency = midiToHz(arrangement.rootMidi + arrangement.melody[step]);

    musicTone(when, frequency, LAYER_BASE, {
      type: arrangement.baseType,
      duration: arrangement.baseDuration,
      volume: arrangement.baseVolume,
      attack: arrangement.baseAttack,
      release: arrangement.baseRelease,
    });
    musicTone(when, frequency * arrangement.baseRatio, LAYER_BASE, {
      type: 'sine', duration: arrangement.baseDuration * 0.7,
      volume: arrangement.baseOvertone, attack: arrangement.baseAttack * 0.7,
      release: arrangement.baseRelease * 0.7,
    });

    // Early phases leave room for the paper clicks and fold whooshes.  The
    // layer buses still fade continuously, so phase changes never step a
    // waveform or pop.
    if (musicPhase >= 3 || step % 2 === 0) {
      musicTone(when, midiToHz(arrangement.rootMidi + arrangement.bass[step]), LAYER_BASS, {
        type: arrangement.bassType, duration: arrangement.bassDuration,
        volume: arrangement.bassVolume, attack: arrangement.bassAttack,
        release: arrangement.bassRelease,
      });
    }
    if (musicPhase >= 4 || step % 2 === 0) {
      musicTone(when + arrangement.counterDelay,
        midiToHz(arrangement.rootMidi + arrangement.counter[step]), LAYER_COUNTER, {
          type: arrangement.counterType, duration: arrangement.counterDuration,
          volume: arrangement.counterVolume, attack: arrangement.counterAttack,
          release: arrangement.counterRelease,
        });
    }
    if (!calmMode && arrangement.kickEvery && musicStep % arrangement.kickEvery === 0) {
      scheduleKick(when, arrangement);
    }
  }

  function scheduleMusic() {
    if (!ctx || !graph || !audibleMusic()) return;
    const current = now();
    if (!isFiniteNumber(musicNextAt) || musicNextAt < current - MUSIC_STEP_SEC) {
      musicNextAt = current + 0.02;
    }
    const horizon = current + MUSIC_LOOKAHEAD_SEC;
    let steps = 0;
    while (musicNextAt < horizon && steps < 4) {
      scheduleMusicStep(musicNextAt);
      musicNextAt += MUSIC_STEP_SEC;
      musicStep = (musicStep + 1) % SUN_MELODY.length;
      steps += 1;
    }
  }

  function playSfxTone(frequency, options = {}) {
    if (!graph || !audibleSfx()) return;
    scheduleTone({
      bucket: 'sfx',
      bus: graph.sfxMaster,
      when: now() + (options.delay ?? 0.004),
      frequency,
      ...options,
    });
  }

  function playClear(rows) {
    const volume = calmMode ? 0.032 : 0.045;
    for (let i = 0; i < rows; i += 1) {
      playSfxTone(midiToHz(72 + CLEAR_NOTES[i]), {
        type: 'sine', duration: 0.16 + i * 0.025, volume,
        attack: 0.004, release: 0.11, delay: 0.035 * i,
      });
    }
    if (rows >= 4) {
      playSfxTone(midiToHz(84), {
        type: 'triangle', duration: 0.34, volume: volume * 0.9,
        attack: 0.008, release: 0.22, delay: 0.1,
      });
    }
  }

  function playFoldStart(dir = 1) {
    const at = now() + 0.004;
    const rising = Number(dir) < 0;
    scheduleNoise({
      when: at, duration: calmMode ? 0.28 : 0.44, volume: calmMode ? 0.028 : 0.05,
      filterType: 'bandpass', frequency: rising ? 1500 : 360,
      endFrequency: rising ? 360 : 1500, q: 0.55,
    });
    if (!calmMode) {
      scheduleNoise({
        when: at + 0.07, duration: 0.2, volume: 0.026,
        filterType: 'highpass', frequency: 1500, endFrequency: 3600, q: 0.45,
      });
    }
    playSfxTone(rising ? 150 : 240, {
      type: 'sine', duration: calmMode ? 0.27 : 0.38, volume: calmMode ? 0.018 : 0.025,
      endFrequency: rising ? 260 : 92, attack: 0.018, release: 0.2, delay: 0,
    });
  }

  function playFoldDone() {
    const at = now() + 0.004;
    scheduleNoise({
      when: at, duration: calmMode ? 0.12 : 0.17, volume: calmMode ? 0.018 : 0.03,
      filterType: 'lowpass', frequency: 190, endFrequency: 72, q: 0.75,
    });
    playSfxTone(104, {
      type: 'sine', duration: calmMode ? 0.15 : 0.2, volume: calmMode ? 0.026 : 0.038,
      endFrequency: 58, attack: 0.004, release: 0.14,
    });
  }

  function playRingClear() {
    playClear(4);
    const cascade = calmMode ? GOLD_CASCADE_CALM : GOLD_CASCADE;
    const root = midiToHz(60);
    for (let i = 0; i < cascade.length; i += 1) {
      playSfxTone(root * Math.pow(2, cascade[i] / 12), {
        type: 'sine', duration: calmMode ? 0.34 : 0.48,
        volume: calmMode ? 0.022 : 0.032,
        attack: 0.012, release: calmMode ? 0.23 : 0.34, delay: i * 0.07,
      });
    }
    scheduleNoise({
      when: now() + 0.08, duration: calmMode ? 0.3 : 0.58,
      volume: calmMode ? 0.018 : 0.045,
      filterType: 'bandpass', frequency: 1300, endFrequency: 4200, q: 0.35,
    });
  }

  function playPrismDrill() {
    playSfxTone(112, {
      type: 'triangle', duration: 0.42, volume: 0.048,
      endFrequency: 42, attack: 0.006, release: 0.29,
    });
    playSfxTone(672, {
      type: 'sine', duration: 0.26, volume: 0.024,
      endFrequency: 360, attack: 0.004, release: 0.18, delay: 0.035,
    });
  }

  function playGameOver() {
    // Filtered, pre-baked noise is the paper sheet folding into a soft
    // crumple; the descending tones keep the existing game-over identity.
    scheduleNoise({
      when: now() + 0.008,
      duration: calmMode ? 0.38 : 0.84,
      volume: calmMode ? 0.025 : 0.06,
      filterType: calmMode ? 'lowpass' : 'bandpass',
      frequency: calmMode ? 820 : 1800,
      endFrequency: calmMode ? 260 : 180,
      q: calmMode ? 0.5 : 0.8,
    });
    for (let index = 0; index < 3; index += 1) {
      const frequency = GAMEOVER_NOTES[index];
      playSfxTone(frequency, {
        type: 'triangle', duration: calmMode ? 0.22 : 0.28,
        volume: calmMode ? 0.032 : 0.05,
        attack: 0.012, release: 0.19, delay: index * 0.16,
      });
    }
  }

  function playWin() {
    const count = calmMode ? 4 : VICTORY_NOTES.length;
    const root = midiToHz(VICTORY_NOTES[0]);
    for (let index = 0; index < count; index += 1) {
      playSfxTone(midiToHz(VICTORY_NOTES[index]), {
        type: 'triangle', duration: calmMode ? 0.3 : 0.38,
        volume: calmMode ? 0.034 : 0.052,
        attack: 0.012, release: calmMode ? 0.2 : 0.27, delay: index * 0.11,
      });
    }
    if (!calmMode) {
      // A quiet octave bloom is the final held chord of the fanfare.
      playSfxTone(root * 2, {
        type: 'sine', duration: 0.62, volume: 0.024,
        attack: 0.04, release: 0.46, delay: 0.43,
      });
      scheduleNoise({
        when: now() + 0.34, duration: 0.66, volume: 0.035,
        filterType: 'highpass', frequency: 1800, endFrequency: 5200, q: 0.5,
      });
    }
  }

  function playPhaseUp(phase) {
    const rootMidi = 60 + Math.min(5, Math.max(0, Number(phase) - 1));
    const volume = calmMode ? 0.028 : 0.045;
    for (let index = 0; index < PHASE_UP_NOTES.length; index += 1) {
      playSfxTone(midiToHz(rootMidi + PHASE_UP_NOTES[index]), {
        type: 'triangle', duration: calmMode ? 0.2 : 0.25, volume,
        attack: 0.008, release: calmMode ? 0.13 : 0.17,
        delay: index * (calmMode ? 0.08 : 0.07),
      });
    }
  }

  function playUiTick(primary = false) {
    playSfxTone(primary ? 690 : 540, {
      type: 'triangle', duration: calmMode ? 0.04 : 0.055,
      volume: calmMode ? 0.014 : 0.022, attack: 0.002,
      release: calmMode ? 0.026 : 0.036, endFrequency: primary ? 760 : 600,
    });
    if (primary && !calmMode) {
      playSfxTone(920, {
        type: 'sine', duration: 0.06, volume: 0.012,
        attack: 0.003, release: 0.04, delay: 0.024,
      });
    }
  }

  function handle(evt, G) {
    try {
      refreshCalmMode();
      if (G && isFiniteNumber(Number(G.phase))) setMusicPhase(G.phase);
      if (evt && isFiniteNumber(Number(evt.phase))) setMusicPhase(evt.phase);
      if (!evt || !evt.k || !ctx || !graph || !audibleSfx()) return;
      const at = now() + 0.004;
      switch (evt.k) {
        case 'move':
          playSfxTone(235, { type: 'square', duration: 0.035, volume: 0.018, attack: 0.002, release: 0.026 });
          break;
        case 'rotate':
          playSfxTone(410, { type: 'triangle', duration: 0.075, volume: 0.03, endFrequency: 520, release: 0.05 });
          break;
        case 'hold':
          playSfxTone(330, { type: 'triangle', duration: 0.11, volume: 0.032, release: 0.075 });
          playSfxTone(495, { type: 'triangle', duration: 0.13, volume: 0.027, delay: 0.055, release: 0.09 });
          break;
        case 'hard':
          playSfxTone(150, { type: 'square', duration: 0.11, volume: 0.042, endFrequency: 58, release: 0.075 });
          break;
        case 'lock':
          playSfxTone(115, { type: 'sine', duration: 0.13, volume: 0.048, endFrequency: 76, release: 0.09 });
          scheduleNoise({ when: at, duration: 0.08, volume: 0.022, frequency: 420, endFrequency: 120, q: 0.8 });
          break;
        case 'clear':
          playClear(normalizeRows(evt));
          break;
        case 'tetris':
          playClear(4);
          break;
        case 'fold_start':
          playFoldStart(evt.dir);
          break;
        case 'fold_done':
          playFoldDone();
          break;
        case 'ring_clear':
          playRingClear();
          break;
        case 'prism_drill':
          playPrismDrill();
          break;
        case 'garbage':
          scheduleNoise({ when: at, duration: 0.38, volume: 0.06, frequency: 95, endFrequency: 48, q: 0.85 });
          playSfxTone(72, { type: 'sine', duration: 0.35, volume: 0.035, endFrequency: 44, release: 0.22 });
          break;
        case 'echo':
          playSfxTone(587, { type: 'sine', duration: 0.28, volume: 0.035, release: 0.2 });
          playSfxTone(880, { type: 'sine', duration: 0.34, volume: 0.025, delay: 0.095, release: 0.25 });
          break;
        case 'levelup':
        case 'phase_up':
          playPhaseUp(evt.phase || musicPhase);
          break;
        case 'gameover':
          playGameOver();
          break;
        case 'seamwin':
        case 'victory':
          playWin();
          break;
        case 'button':
        case 'button_tick':
        case 'ui_tick':
        case 'menu_tick':
        case 'click':
          playUiTick(Boolean(evt.primary || evt.tier === 'primary'));
          break;
        case 'pause':
        case 'resume':
        case 'start':
        case 'restart':
        case 'toggle':
          playUiTick(evt.k === 'start' || evt.k === 'restart');
          break;
        default:
          break;
      }
    } catch (_) {
      // Audio is decorative; an unsupported node must never affect gameplay.
    }
  }

  function unlock() {
    try {
      refreshCalmMode();
      if (ctx && ctx.state === 'closed') {
        ctx = null;
        graph = null;
        musicSources = new Set();
        sfxSources = new Set();
      }
      if (!ctx) {
        const Ctor = contextConstructor();
        if (!Ctor) return;
        ctx = new Ctor();
        graph = createGraph(ctx, world, audibleMusic(), audibleSfx(), musicPhase, calmMode);
        musicNextAt = now() + MUSIC_START_DELAY_SEC;
        musicStep = 0;
      }
      try {
        const resumeResult = typeof ctx.resume === 'function' ? ctx.resume() : null;
        if (resumeResult && typeof resumeResult.catch === 'function') resumeResult.catch(() => {});
      } catch (_) {
        // Some embedded browsers expose AudioContext without resume().
      }
      applyOutputLevels(false);
      scheduleMusic();
    } catch (_) {
      // Safari private mode and embedded webviews may deny AudioContext.
      const failedContext = ctx;
      try {
        if (failedContext && typeof failedContext.close === 'function' && failedContext.state !== 'closed') {
          const closeResult = failedContext.close();
          if (closeResult && typeof closeResult.catch === 'function') closeResult.catch(() => {});
        }
      } catch (__) {
        // Closing a partially-created context is best effort.
      }
      ctx = null;
      graph = null;
      musicSources = new Set();
      sfxSources = new Set();
    }
  }

  function setWorld(nextWorld) {
    try {
      refreshCalmMode();
      if (!FACES.includes(nextWorld)) return;
      const previous = world;
      world = nextWorld;
      if (!ctx || !graph || previous === nextWorld) return;
      const at = now() + 0.004;
      for (let mood = 0; mood < graph.moodBuses.length; mood += 1) {
        rampParam(graph.moodBuses[mood].gain,
          FACES[mood] === nextWorld ? 1 : 0, at, WORLD_FADE_MS / 1000);
      }
      rampParam(graph.inkReturn.gain, nextWorld === 'ink' ? 1 : 0, at, WORLD_FADE_MS / 1000);
      // Start the destination melody during the fade, retaining the shared
      // step position so the two worlds feel like one piece of music.
      musicNextAt = Math.min(musicNextAt, at + 0.018);
    } catch (_) {
      // World changes must remain safe when audio has been disabled/closed.
    }
  }

  function toggleMute() {
    try {
      muted = !muted;
      applyOutputLevels(true);
    } catch (_) {
      // Keep the setting usable even if the context disappeared.
    }
    return muted;
  }

  function setEnabled(settings) {
    try {
      refreshCalmMode();
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'music')) {
        music = Boolean(settings.music);
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'sfx')) {
        sfx = Boolean(settings.sfx);
      }
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'muted')) {
        muted = Boolean(settings.muted);
      }
      applyOutputLevels(true);
    } catch (_) {
      // Settings are optional and audio availability is not guaranteed.
    }
  }

  function update(_dtMs, G) {
    try {
      if (G && isFiniteNumber(Number(G.phase))) setMusicPhase(G.phase);
      if (!ctx || !graph || ctx.state === 'closed') return;
      scheduleMusic();
    } catch (_) {
      // Never let an audio scheduling failure interrupt the RAF loop.
    }
  }

  return { unlock, handle, setWorld, toggleMute, setEnabled, update };
}
