import { FLIP_MS, FLIP_REDUCED_MS } from '../config.js';

const HALF_TURN = 90;
const HOLD_ANGLE = HALF_TURN;
const FULL_TURN = 180;

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
 * Camera controller for the Super Paper Mario-style dimension flip.
 * Game state owns the lane and world swap; this module owns only the camera.
 */
export function createFlip() {
  let currentAngle = 0;
  let startAngle = 0;
  let targetAngle = 0;
  let elapsedMs = 0;
  let durationMs = FLIP_MS;
  let currentMode = 'off';
  let reducedMotion = false;

  function begin(target, mode) {
    startAngle = currentAngle;
    targetAngle = target;
    elapsedMs = 0;
    durationMs = reducedMotion ? FLIP_REDUCED_MS : FLIP_MS;
    currentMode = mode;
  }

  function enter() {
    if (currentMode !== 'off') return;
    reducedMotion = prefersReducedMotion();
    currentAngle = 0;
    begin(HOLD_ANGLE, 'enter');
  }

  function exitTo(changedWorld) {
    if (currentMode === 'off' || currentMode === 'exit') return;
    begin(changedWorld === true ? FULL_TURN : 0, 'exit');
  }

  function update(dtMs) {
    if (currentMode === 'off' || currentMode === 'held') return false;

    const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
    elapsedMs = Math.min(durationMs, elapsedMs + dt);
    const progress = durationMs > 0 ? elapsedMs / durationMs : 1;
    const eased = easeInOutCubic(progress);
    currentAngle = startAngle + (targetAngle - startAngle) * eased;

    if (progress < 1) return false;

    currentAngle = targetAngle;
    if (currentMode === 'enter') {
      currentAngle = HOLD_ANGLE;
      currentMode = 'held';
      return true;
    }

    // main.js swaps G.world on this completion frame. The next normal 2D
    // draw therefore starts at angle 0 without exposing a mirrored face.
    currentAngle = 0;
    currentMode = 'off';
    return true;
  }

  return {
    enter,
    exitTo,
    update,
    angle() { return Math.max(0, Math.min(FULL_TURN, currentAngle)); },
    mode() { return currentMode; },
    active() { return currentMode !== 'off'; },
    reduced() { return reducedMotion; },
  };
}
