// FLIPSIDE procedural audio.  The module is deliberately silent until the
// first user gesture calls unlock(), so loading the game never creates an
// AudioContext or triggers a browser autoplay warning.

const WORLD_FADE_MS = 400;
const MUSIC_STEP_SEC = 0.5;
const MUSIC_LOOKAHEAD_SEC = 0.14;
const MUSIC_START_DELAY_SEC = 0.035;
const MAX_MUSIC_SOURCES = 32;
const MAX_SFX_SOURCES = 48;
const MIN_GAIN = 0.0001;

const SUN_MELODY = [0, 4, 7, 11, 14, 11, 7, 4];
const INK_MELODY = [0, 3, 7, 10, 14, 10, 7, 3];
const CLEAR_NOTES = [0, 4, 7, 11];

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

function createGraph(ctx, world, musicOn, sfxOn) {
  const musicMaster = ctx.createGain();
  const sfxMaster = ctx.createGain();
  const sunBus = ctx.createGain();
  const inkBus = ctx.createGain();
  const inkFilter = ctx.createBiquadFilter();
  const inkDelay = ctx.createDelay(1.2);
  const inkFeedback = ctx.createGain();
  const inkEcho = ctx.createGain();
  const inkReturn = ctx.createGain();

  setNodeParam(musicMaster, 'gain', musicOn ? 0.15 : 0);
  setNodeParam(sfxMaster, 'gain', sfxOn ? 0.24 : 0);
  setNodeParam(sunBus, 'gain', world === 'sun' ? 1 : 0);
  setNodeParam(inkBus, 'gain', world === 'ink' ? 1 : 0);

  try { inkFilter.type = 'lowpass'; } catch (_) { /* optional */ }
  setNodeParam(inkFilter, 'frequency', 1100);
  setNodeParam(inkFilter, 'Q', 0.65);
  setNodeParam(inkDelay, 'delayTime', 0.19);
  setNodeParam(inkFeedback, 'gain', 0.2);
  setNodeParam(inkEcho, 'gain', 0.22);
  setNodeParam(inkReturn, 'gain', world === 'ink' ? 1 : 0);

  sunBus.connect(musicMaster);
  inkBus.connect(inkFilter);
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
    sunBus,
    inkBus,
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

  function applyOutputLevels(fadeMusic) {
    if (!ctx || !graph) return;
    const at = now() + 0.003;
    rampParam(graph.musicMaster.gain, audibleMusic() ? 0.15 : 0,
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

  function musicTone(when, frequency, options) {
    return scheduleTone({
      bucket: 'music',
      bus: world === 'sun' ? graph.sunBus : graph.inkBus,
      when,
      frequency,
      ...options,
    });
  }

  function scheduleKick(when) {
    if (!ctx || !graph) return;
    const bus = graph.sunBus;
    const bucket = musicSources;
    if (bucket.size >= MAX_MUSIC_SOURCES) return;
    let oscillator = null;
    let amp = null;
    try {
      oscillator = ctx.createOscillator();
      amp = ctx.createGain();
      oscillator.type = 'sine';
      setParam(oscillator.frequency, 'setValueAtTime', 135, when);
      setParam(oscillator.frequency, 'exponentialRampToValueAtTime', 53, when + 0.18);
      setParam(amp.gain, 'setValueAtTime', MIN_GAIN, when);
      setParam(amp.gain, 'linearRampToValueAtTime', 0.075, when + 0.004);
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
    const melody = world === 'sun' ? SUN_MELODY : INK_MELODY;
    const frequency = midiToHz(60 + melody[musicStep]);
    if (world === 'sun') {
      // A triangle fundamental and a quiet octave make a warm paper-pluck.
      musicTone(when, frequency, {
        type: 'triangle', duration: 0.23, volume: 0.052, attack: 0.006, release: 0.13,
      });
      musicTone(when, frequency * 2, {
        type: 'sine', duration: 0.16, volume: 0.018, attack: 0.004, release: 0.09,
      });
      if (musicStep % 4 === 0) scheduleKick(when);
    } else {
      // The same rhythm/melody is reharmonized to minor and allowed to bloom
      // through the persistent low-pass + feedback delay graph.
      musicTone(when, frequency, {
        type: 'sawtooth', duration: 0.68, volume: 0.026, attack: 0.075, release: 0.28,
      });
      musicTone(when, frequency * 2, {
        type: 'triangle', duration: 0.55, volume: 0.013, attack: 0.095, release: 0.24,
      });
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
    const at = now() + 0.006;
    for (let i = 0; i < rows; i += 1) {
      playSfxTone(midiToHz(72 + CLEAR_NOTES[i]), {
        type: 'sine', duration: 0.16 + i * 0.025, volume: 0.045,
        attack: 0.004, release: 0.11, delay: 0.035 * i,
      });
    }
    if (rows >= 4) {
      playSfxTone(midiToHz(84), {
        type: 'triangle', duration: 0.34, volume: 0.045,
        attack: 0.008, release: 0.22, delay: 0.1,
      });
    }
    void at;
  }

  function playFlip() {
    const at = now() + 0.004;
    scheduleNoise({
      when: at, duration: 0.43, volume: 0.065,
      filterType: 'bandpass', frequency: 260, endFrequency: 1800, q: 0.65,
    });
    playSfxTone(175, {
      type: 'sine', duration: 0.36, volume: 0.034,
      endFrequency: 72, attack: 0.012, release: 0.19, delay: 0,
    });
    for (let i = 0; i < 3; i += 1) {
      playSfxTone(780 + i * 170, {
        type: 'triangle', duration: 0.055, volume: 0.028,
        attack: 0.003, release: 0.038, delay: 0.31 + i * 0.035,
      });
    }
  }

  function playGameOver() {
    [392, 330, 262].forEach((frequency, index) => {
      playSfxTone(frequency, {
        type: 'triangle', duration: 0.28, volume: 0.05,
        attack: 0.012, release: 0.19, delay: index * 0.16,
      });
    });
  }

  function playWin() {
    [523, 659, 784, 1047].forEach((frequency, index) => {
      playSfxTone(frequency, {
        type: 'triangle', duration: 0.38, volume: 0.052,
        attack: 0.012, release: 0.27, delay: index * 0.11,
      });
    });
    scheduleNoise({
      when: now() + 0.34, duration: 0.66, volume: 0.035,
      filterType: 'highpass', frequency: 1800, endFrequency: 5200, q: 0.5,
    });
  }

  function handle(evt, G) {
    try {
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
        case 'flip':
          playFlip();
          break;
        case 'garbage':
          scheduleNoise({ when: at, duration: 0.38, volume: 0.06, frequency: 95, endFrequency: 48, q: 0.85 });
          playSfxTone(72, { type: 'sine', duration: 0.35, volume: 0.035, endFrequency: 44, release: 0.22 });
          break;
        case 'echo':
          playSfxTone(587, { type: 'sine', duration: 0.28, volume: 0.035, release: 0.2 });
          playSfxTone(880, { type: 'sine', duration: 0.34, volume: 0.025, delay: 0.095, release: 0.25 });
          break;
        case 'charge':
          playSfxTone(660, { type: 'triangle', duration: 0.13, volume: 0.04, release: 0.09 });
          playSfxTone(990, { type: 'triangle', duration: 0.2, volume: 0.04, delay: 0.075, release: 0.14 });
          break;
        case 'foldover':
          playSfxTone(740, { type: 'sine', duration: 0.2, volume: 0.036, release: 0.15 });
          playSfxTone(1110, { type: 'sine', duration: 0.26, volume: 0.027, delay: 0.06, release: 0.19 });
          break;
        case 'levelup':
          [392, 494, 587].forEach((frequency, index) => {
            playSfxTone(frequency, { type: 'triangle', duration: 0.25, volume: 0.04, delay: index * 0.07, release: 0.17 });
          });
          break;
        case 'gameover':
          playGameOver();
          break;
        case 'seamwin':
          playWin();
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
        graph = createGraph(ctx, world, audibleMusic(), audibleSfx());
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
      if (nextWorld !== 'sun' && nextWorld !== 'ink') return;
      const previous = world;
      world = nextWorld;
      if (!ctx || !graph || previous === nextWorld) return;
      const at = now() + 0.004;
      rampParam(graph.sunBus.gain, nextWorld === 'sun' ? 1 : 0, at, WORLD_FADE_MS / 1000);
      rampParam(graph.inkBus.gain, nextWorld === 'ink' ? 1 : 0, at, WORLD_FADE_MS / 1000);
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

  function update(_dtMs) {
    try {
      if (!ctx || !graph || ctx.state === 'closed') return;
      scheduleMusic();
    } catch (_) {
      // Never let an audio scheduling failure interrupt the RAF loop.
    }
  }

  return { unlock, handle, setWorld, toggleMute, setEnabled, update };
}
