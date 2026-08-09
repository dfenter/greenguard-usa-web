// Progression and cross-world pressure helpers.
// This module deliberately has no DOM or rendering dependencies.
import {
  COLS,
  LINES_PER_PHASE,
  PHASES,
  WIN_PHASE,
  other,
} from '../config.js';
import { rng } from './pieces.js';
import { addGarbage, rowHasSeam } from './board.js';

function clampPhase(phase) {
  const value = Number(phase);
  if (!Number.isFinite(value)) return 1;
  return Math.min(WIN_PHASE, Math.max(1, Math.floor(value)));
}

function lineCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return count === Infinity ? Number.MAX_SAFE_INTEGER : 0;
  return Math.max(0, Math.floor(count));
}

function ensureFx(G) {
  if (!Array.isArray(G.fx)) G.fx = [];
  return G.fx;
}

function ensureSeam(G) {
  if (!G.seam || typeof G.seam !== 'object') {
    G.seam = { sun: false, ink: false, active: false };
  } else {
    G.seam.sun = Boolean(G.seam.sun);
    G.seam.ink = Boolean(G.seam.ink);
    G.seam.active = Boolean(G.seam.active);
  }
  return G.seam;
}

function randomHole(G = null) {
  const value = Number(rng(G && G.rngState));
  if (!Number.isFinite(value)) return 0;
  return Math.min(COLS - 1, Math.max(0, Math.floor(value * COLS)));
}

function validWorld(world) {
  return world === 'ink' ? 'ink' : 'sun';
}

/** Return the phase for a cumulative line count, capped at the final phase. */
export function phaseFor(lines) {
  const count = lineCount(lines);
  return Math.min(WIN_PHASE, 1 + Math.floor(count / LINES_PER_PHASE));
}

/** Return the authoritative configuration for a phase. */
export function phaseCfg(phase) {
  return PHASES[clampPhase(phase)];
}

/** Return gravity interval in milliseconds for a phase. */
export function gravityMs(phase) {
  return phaseCfg(phase).gravMs;
}

/**
 * Add the phase-nine seam to both worlds using one shared hole position.
 * The board helper returns true when inserting the row pushes a stack out of
 * the board; callers use the returned value to perform the normal top-out
 * transition.
 */
export function spawnSeam(G) {
  if (!G || !G.boards || !G.boards.sun || !G.boards.ink) return false;

  const seam = ensureSeam(G);
  if (seam.active) return false;

  const hole = randomHole(G);
  seam.sun = false;
  seam.ink = false;
  seam.active = true;
  seam.hole = hole;

  // A seam is shared by both sides, so its cells are dual-world cells even
  // though each physical row is inserted into a separate board.
  const sunTopOut = addGarbage(G.boards.sun, 'both', hole, true);
  const inkTopOut = addGarbage(G.boards.ink, 'both', hole, true);
  return Boolean(sunTopOut || inkTopOut);
}

/**
 * Apply a completed line-clear count and activate the seam on reaching phase
 * nine. The game owns score/charge accounting; this helper owns only lines,
 * phase, and the phase-up FX signal.
 */
export function onLinesCleared(G, n) {
  if (!G) return false;

  const cleared = lineCount(n);
  const before = clampPhase(G.phase);
  const currentLines = lineCount(G.lines);
  G.lines = currentLines + cleared;

  const next = phaseFor(G.lines);
  G.phase = next;
  if (next > before) {
    ensureFx(G).push({ k: 'levelup', phase: next });
  }

  if (next === WIN_PHASE && !ensureSeam(G).active) {
    return spawnSeam(G);
  }
  return false;
}

/**
 * Fester the world that is currently off-screen once for each elapsed fester
 * interval. G.piecesSinceFester is incremented by game.js when a piece locks.
 * Returns true if any inserted garbage row caused a top-out.
 */
export function festerCheck(G) {
  if (!G || !G.boards || !G.boards.sun || !G.boards.ink) return false;

  const phase = clampPhase(G.phase);
  const every = phaseCfg(phase).festerEvery;
  const elapsed = lineCount(G.piecesSinceFester);
  if (elapsed < every) return false;

  const festerCount = Math.floor(elapsed / every);
  G.piecesSinceFester = elapsed % every;

  const current = validWorld(G.world);
  const target = other(current);
  const fx = ensureFx(G);
  let topOut = false;

  for (let i = 0; i < festerCount; i += 1) {
    const hole = randomHole(G);
    const didTopOut = addGarbage(G.boards[target], target, hole, false);
    fx.push({ k: 'garbage', world: target, hole, phase });
    if (didTopOut) topOut = true;
    if (didTopOut) break;
  }

  return topOut;
}

/**
 * Mark a side as having cleared a seam row. clearedYs must be the row indices
 * returned by fullRows, before clearRows collapses the board.
 */
export function checkSeamWin(G, clearedYs, world) {
  if (!G || !G.boards) return false;

  const side = validWorld(world);
  const board = G.boards[side];
  if (!board || !Array.isArray(clearedYs)) return false;

  const seam = ensureSeam(G);
  for (const y of clearedYs) {
    if (Number.isInteger(y) && y >= 0 && rowHasSeam(board, y)) {
      seam[side] = true;
      break;
    }
  }

  return Boolean(seam.sun && seam.ink);
}
