// Tetromino geometry and the Guideline Super Rotation System (SRS).
// Coordinates are relative to the top-left of the piece's 4x4 spawn box;
// positive y moves down the board.
import { PRISM_BAG_EVERY } from '../config.js';

const TYPE_ORDER = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

function freezeStates(states) {
  return Object.freeze(states.map((state) => Object.freeze(
    state.map(([x, y]) => Object.freeze([x, y])),
  )));
}

// JLSTZ use a 3x3 rotation area inside the 4x4 spawn box. Their center of
// rotation is the middle cell of that area. The O states are intentionally
// identical: O has no effective rotation in SRS.
export const SHAPES = Object.freeze({
  I: freezeStates([
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ]),
  O: freezeStates([
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ]),
  T: freezeStates([
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ]),
  S: freezeStates([
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ]),
  Z: freezeStates([
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ]),
  J: freezeStates([
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ]),
  L: freezeStates([
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ]),
});

// SRS tables are conventionally documented with y increasing upward. These
// values are the equivalent screen/canvas coordinates, where y increases
// downward. Keys are `${from rotation}>${to rotation}`.
const JLSTZ_KICKS = Object.freeze({
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
});

const I_KICKS = Object.freeze({
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
});

const RNG_SEED = 0x6d2b79f5;
const RNG_INCREMENT = 0x6d2b79f5;
let rngState = RNG_SEED;

function nextRandom(state) {
  const next = (state + RNG_INCREMENT) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return {
    state: next,
    value: ((t ^ (t >>> 14)) >>> 0) / 4294967296,
  };
}

/** Create an independent Mulberry32 stream for one game/run instance. */
export function createRngState(seed = RNG_SEED) {
  return { value: Number(seed) >>> 0 };
}

/** Set the deterministic Mulberry32 stream to a 32-bit seed. */
export function seedRng(seed) {
  rngState = Number(seed) >>> 0;
}

/**
 * Return the next deterministic pseudo-random value in [0, 1).
 *
 * With no argument this preserves the test-facing global stream. Passing a
 * state object advances only that object's stream, so demo and player games
 * cannot perturb one another's bags or progression randomness.
 */
export function rng(state = null) {
  if (state && typeof state === 'object') {
    const seed = Number.isFinite(state.value) ? state.value : RNG_SEED;
    const next = nextRandom(seed >>> 0);
    state.value = next.state;
    return next.value;
  }

  const next = nextRandom(rngState);
  rngState = next.state;
  return next.value;
}

function normalizeRotation(rot) {
  const value = Number(rot);
  return ((value % 4) + 4) % 4;
}

function rotationStep(dir) {
  if (dir === 1 || dir === 'cw' || dir === 'CW' || dir === 'clockwise') return 1;
  if (dir === -1 || dir === 'ccw' || dir === 'CCW' || dir === 'counterclockwise') return -1;
  return 0;
}

export function spawnPiece(t, prism = false) {
  if (!SHAPES[t]) throw new RangeError(`Unknown tetromino type: ${t}`);
  return { t, x: 3, y: -1, rot: 0, prism: Boolean(prism) };
}

export function cellsOf(piece) {
  const states = SHAPES[piece.t];
  if (!states) throw new RangeError(`Unknown tetromino type: ${piece.t}`);
  const state = states[normalizeRotation(piece.rot)];
  return state.map(([dx, dy]) => [piece.x + dx, piece.y + dy]);
}

export function rotate(piece, dir, collides) {
  if (!piece || !SHAPES[piece.t] || typeof collides !== 'function') return null;

  const step = rotationStep(dir);
  if (step === 0) return null;

  const from = normalizeRotation(piece.rot);
  const to = (from + step + 4) % 4;
  const kickTests = piece.t === 'O'
    ? [[0, 0]]
    : (piece.t === 'I' ? I_KICKS : JLSTZ_KICKS)[`${from}>${to}`];

  if (!kickTests) return null;
  for (const [kx, ky] of kickTests) {
    const candidate = {
      ...piece,
      x: piece.x + kx,
      y: piece.y + ky,
      rot: to,
    };
    if (!collides(cellsOf(candidate))) return candidate;
  }
  return null;
}

export function makeBag(bagIndex = 0, state = null) {
  const bag = TYPE_ORDER.slice();
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng(state) * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }

  if (Number(bagIndex) % PRISM_BAG_EVERY !== PRISM_BAG_EVERY - 1) return bag;

  const prismAt = Math.floor(rng(state) * bag.length);
  return bag.map((t, index) => ({ t, prism: index === prismAt }));
}
