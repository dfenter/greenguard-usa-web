import { FLIP_REDUCED_MS, FOLD_MS } from '../config.js?v=43ddf0f';

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function easeInOutCubic(value) {
  const t = clamp01(value);
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function prefersReducedMotion() {
  try {
    return typeof globalThis.matchMedia === 'function'
      && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch (_error) {
    return false;
  }
}

/**
 * Directional cube-fold camera. Game state owns the from/to faces; this
 * controller owns only the two-beat animation clock and the signed fold
 * angle. Keeping that state here makes the renderer independent from the
 * gameplay clock while preserving a small, deterministic public contract.
 */
export function createFlip() {
  let elapsedMs = 0;
  let durationMs = FOLD_MS;
  let running = false;
  let reducedMotion = false;
  let easedProgress = 0;
  let direction = 1;

  function start(dir = 1) {
    if (running) return;
    direction = Number(dir) < 0 ? -1 : 1;
    reducedMotion = prefersReducedMotion();
    durationMs = reducedMotion ? FLIP_REDUCED_MS : FOLD_MS;
    elapsedMs = 0;
    easedProgress = 0;
    running = true;
  }

  function update(dt) {
    if (!running) return false;

    const delta = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    elapsedMs = Math.min(durationMs, elapsedMs + delta);
    const linear = durationMs > 0 ? elapsedMs / durationMs : 1;
    if (linear < 0.5) {
      easedProgress = easeInOutCubic(linear * 2) * 0.5;
    } else {
      easedProgress = 0.5 + easeInOutCubic((linear - 0.5) * 2) * 0.5;
    }

    if (linear < 1) return false;
    easedProgress = 1;
    running = false;
    return true;
  }

  function angle() {
    if (!running && easedProgress === 0) return 0;
    const beat = easedProgress < 0.5
      ? easedProgress * 2
      : 1 - (easedProgress - 0.5) * 2;
    return direction * Math.PI * 0.5 * clamp01(beat);
  }

  function mode() {
    if (!running) return 'flat';
    return easedProgress < 0.5 ? 'fold-out' : 'unfold-in';
  }

  return {
    start,
    update,
    progress() { return easedProgress; },
    dir() { return direction; },
    active() { return running; },
    reduced() { return reducedMotion; },
    angle,
    mode,
  };
}
