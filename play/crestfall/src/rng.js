// Seeded deterministic RNG (studio-standard LCG).
// s = (s * 1664525 + 1013904223) >>> 0 ; value = s / 4294967296
//
// Named streams keep gameplay-affecting rolls separate from cosmetic-only
// ones so that, e.g., changing particle jitter never perturbs enemy spawns
// or field-encounter layout for a given seed.
//
// Usage:
//   import { worldRng, combatRng, fxRng, seedAll } from './rng.js';
//   seedAll(12345);
//   worldRng.next(); // 0..1 float, same call-pattern as Math.random()

export const DEFAULT_SEED = 20260718; // fixed constant fallback

// Trace mode (Phase 0.5 harness): when enabled, every draw from every named
// stream is appended to `trace.log` as { stream, tag, seq, value }. Enabled
// via ?trace=1 (see resolveTraceFromURL) or directly by the Node harness.
// `steps` holds per-sim-step checkpoints (frame index, player pos/hp/mp,
// enemy array digest) pushed by Game._traceStep(); `log` holds one entry
// per RNG draw across all four streams, in call order.
export const trace = { enabled: false, log: [], seq: 0, steps: [] };

export function resetTrace() {
  trace.log = [];
  trace.seq = 0;
  trace.steps = [];
}

export class SeededRng {
  constructor(seed = DEFAULT_SEED, name = 'rng') {
    this.name = name;
    this.seed(seed);
  }

  seed(seed) {
    // Ensure a non-zero 32-bit unsigned starting state.
    this._s = (seed >>> 0) || 1;
    return this;
  }

  // Drop-in replacement for Math.random(): returns a float in [0, 1).
  // `tag` is an optional call-site label used only for trace logging; it
  // never affects the produced value or the stream's advancement.
  next(tag) {
    this._s = (Math.imul(this._s, 1664525) + 1013904223) >>> 0;
    const value = this._s / 4294967296;
    if (trace.enabled) {
      trace.log.push({ stream: this.name, tag: tag || null, seq: trace.seq++, value });
    }
    return value;
  }

  // Stream-state accessors used by the save system (R6) so a save fixture
  // can freeze/restore exact RNG position, not just the seed.
  getState() { return this._s; }
  setState(s) { this._s = (s >>> 0) || 1; return this; }
}

// worldRng: overworld/level generation (map/room/encounter layout) AND the
// runtime overworld encounter roll + buildFieldEncounter terrain/enemy
// draws are kept explicit so seeded runs remain reproducible.
export const worldRng = new SeededRng(DEFAULT_SEED, 'worldRng');
// combatRng: gameplay-affecting rolls during play (enemy AI decisions,
// spawn positions/timers, projectile aim, blocking chance, etc.)
export const combatRng = new SeededRng(DEFAULT_SEED, 'combatRng');
// townRng: gameplay stream (decision 3) for town NPC movement — NPC
// position gates dialogue interaction, so it is parity-gated like world/
// combat, unlike fxRng.
export const townRng = new SeededRng(DEFAULT_SEED, 'townRng');
// fxRng: cosmetic-only effects (particle jitter, hit sparks, death bursts)
// that never affect gameplay state. Ungated.
export const fxRng = new SeededRng(DEFAULT_SEED, 'fxRng');

// Re-seed all streams together, e.g. from a URL ?seed= param.
export function seedAll(seed) {
  worldRng.seed(seed);
  combatRng.seed(seed);
  townRng.seed(seed);
  fxRng.seed(seed);
  resetTrace();
}

// Resolve the seed to use: ?seed=N URL param, else DEFAULT_SEED.
// Safe to call in non-browser (Node) contexts, where it just returns
// DEFAULT_SEED since there is no `location`.
export function resolveSeedFromURL() {
  try {
    if (typeof location !== 'undefined' && location.search) {
      const params = new URLSearchParams(location.search);
      const raw = params.get('seed');
      if (raw !== null) {
        const n = Number(raw);
        if (Number.isFinite(n)) return n >>> 0;
      }
    }
  } catch (_e) {
    // no-op: fall through to default
  }
  return DEFAULT_SEED;
}

// Resolve ?trace=1 from the URL. Safe to call in non-browser contexts.
export function resolveTraceFromURL() {
  try {
    if (typeof location !== 'undefined' && location.search) {
      const params = new URLSearchParams(location.search);
      return params.get('trace') === '1';
    }
  } catch (_e) {
    // no-op
  }
  return false;
}
