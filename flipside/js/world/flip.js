import { COLORS, FLIP_MS, other } from '../config.js';

const MIDPOINT = 0.5;
const REDUCED_FLIP_MS = 200;
const NORMAL_BULGE = 0.035;
const NORMAL_SKEW = 0.018;

// Sample this at start(), so a settings change applies to the next page turn
// without making the RAF path query the DOM every frame.
let activeReducedMotion = false;
let activeDirection = 1;

function prefersReducedMotion() {
  try {
    return typeof globalThis.matchMedia === 'function'
      && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch (_error) {
    // A restricted browser context can expose matchMedia but reject the query.
    return false;
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function easeInOutCubic(value) {
  const t = clamp01(value);
  return t < MIDPOINT
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function worldOrSun(world) {
  return world === 'ink' ? 'ink' : 'sun';
}

function rgba(hex, alpha) {
  const value = String(hex).replace('#', '');
  const normalized = value.length === 3
    ? value.split('').map((part) => part + part).join('')
    : value;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

/**
 * Create the stateful half-page-turn controller.
 *
 * The midpoint notification is deliberately a consumable latch. main.js may
 * ask more than once while a frame is being processed, but finishFlip can only
 * be reached once for each start().
 */
export function createFlip() {
  let elapsedMs = 0;
  let rawProgress = 0;
  let easedProgress = 0;
  let running = false;
  let midpointReady = false;
  let midpointConsumed = false;
  let durationMs = FLIP_MS;

  return {
    start(dir = 1) {
      activeDirection = Number(dir) < 0 ? -1 : 1;
      activeReducedMotion = prefersReducedMotion();
      durationMs = activeReducedMotion ? REDUCED_FLIP_MS : FLIP_MS;
      elapsedMs = 0;
      rawProgress = 0;
      easedProgress = 0;
      midpointReady = false;
      midpointConsumed = false;
      running = true;
    },

    update(dtMs) {
      if (!running) return true;

      const safeDt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
      const previousRawProgress = rawProgress;
      elapsedMs = Math.min(durationMs, elapsedMs + safeDt);
      rawProgress = durationMs > 0 ? elapsedMs / durationMs : 1;
      easedProgress = easeInOutCubic(rawProgress);

      if (!midpointConsumed
        && previousRawProgress < MIDPOINT
        && rawProgress >= MIDPOINT) {
        midpointReady = true;
      }

      if (rawProgress >= 1) running = false;
      return !running;
    },

    progress() {
      return easedProgress;
    },

    active() {
      return running;
    },

    pastMidpoint() {
      if (!midpointReady || midpointConsumed) return false;
      midpointConsumed = true;
      midpointReady = false;
      return true;
    },

  };
}

/**
 * Apply the page's fold transform around the vertical center axis.
 *
 * The magnitude of cosine keeps the destination face in the same canvas
 * orientation at the end of the turn. Direction is carried by the skew and
 * the moving fold shadow, so removing the transform after the last frame is
 * seamless instead of revealing a mirrored destination for one frame.
 */
export function applyFlipTransform(ctx, progress, w, h) {
  const t = clamp01(progress);
  const width = Math.max(0, Number.isFinite(w) ? w : 0);
  const height = Math.max(0, Number.isFinite(h) ? h : 0);
  const centerX = width / 2;
  const centerY = height / 2;

  ctx.translate(centerX, centerY);
  const foldAmount = t > 0 && t < 1 ? Math.sin(Math.PI * t) : 0;

  if (activeReducedMotion) {
    const squash = 1 - 0.035 * foldAmount;
    ctx.transform(squash, 0, 0, 1, 0, 0);
  } else {
    const scaleX = Math.abs(Math.cos(Math.PI * t));
    const bulgeY = 1 + NORMAL_BULGE * foldAmount;
    const skewX = NORMAL_SKEW * foldAmount * activeDirection;
    ctx.transform(scaleX, 0, skewX, bulgeY, 0, 0);
  }

  ctx.translate(-centerX, -centerY);
}

/**
 * Draw the destination paper, fold shadow, and a quiet crease highlight.
 * main.js calls this while the page transform is still installed; the overlay
 * therefore switches to canvas coordinates temporarily so the paper wash and
 * shadow remain screen-filling at the edge-on midpoint.
 */
export function drawFlipOverlay(ctx, progress, w, h, fromWorld) {
  const t = clamp01(progress);
  if (t <= 0 || t >= 1) return;

  const width = Math.max(0, Number.isFinite(w) ? w : 0);
  const height = Math.max(0, Number.isFinite(h) ? h : 0);
  const currentWorld = worldOrSun(fromWorld);
  const backWorld = t < MIDPOINT ? other(currentWorld) : currentWorld;
  const palette = COLORS[backWorld];
  const turnAmount = Math.sin(Math.PI * t);

  ctx.save();
  if (typeof ctx.setTransform === 'function') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // The blank reverse side gives the midpoint a tangible sheet-of-paper
  // moment. It is translucent so the board never strobes or hard-cuts.
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = (activeReducedMotion ? 0.52 : 0.78) * turnAmount;
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, width, height);

  // A very faint printed bleed at the fold keeps the reverse side from
  // reading as a digital wipe, especially on the dark Inkside paper.
  const bleed = ctx.createLinearGradient(0, 0, width, 0);
  bleed.addColorStop(0, 'rgba(255,255,255,0)');
  bleed.addColorStop(0.5, rgba(palette.ink, activeReducedMotion ? 0.045 : 0.075));
  bleed.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = turnAmount;
  ctx.fillStyle = bleed;
  ctx.fillRect(0, 0, width, height);

  const travelProgress = activeDirection > 0 ? t : 1 - t;
  const shadowPosition = activeReducedMotion
    ? width / 2
    : width * (0.16 + 0.68 * travelProgress);
  const band = Math.max(10, width * (activeReducedMotion ? 0.09 : 0.13));
  const shadow = ctx.createLinearGradient(
    shadowPosition - band,
    0,
    shadowPosition + band,
    0,
  );
  const shadowColor = rgba(palette.ink, activeReducedMotion ? 0.08 : 0.17);
  shadow.addColorStop(0, 'rgba(0,0,0,0)');
  shadow.addColorStop(0.5, shadowColor);
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = turnAmount;
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, width, height);

  // A narrow paper highlight on the fold makes the center seam legible
  // without the luminous, high-frequency look that reduced motion avoids.
  if (!activeReducedMotion) {
    const crease = ctx.createLinearGradient(
      shadowPosition - band * 0.22,
      0,
      shadowPosition + band * 0.22,
      0,
    );
    crease.addColorStop(0, 'rgba(255,255,255,0)');
    crease.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    crease.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = turnAmount * 0.7;
    ctx.fillStyle = crease;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.restore();
}
