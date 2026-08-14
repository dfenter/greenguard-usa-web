// FLIPSIDE — v5 cube attract-mode bot.
// It plans landings on the viewed face, but reasons about the shared ring for
// collision, and occasionally folds toward the face carrying the most danger.
import {
  FACE_W,
  FACES,
  RING_COLS,
  ROWS,
  nextFace,
  ringCol,
} from './config.js?v=43ddf0f';
import { SHAPES, cellsOf } from './core/pieces.js?v=43ddf0f';
import { cellAt, collides, faceDanger, faceWindow } from './core/board.js?v=43ddf0f';

const ROT_STATES = { I: 2, O: 1, S: 2, Z: 2, T: 4, J: 4, L: 4 };
const W_HEIGHT = -0.510066;
const W_LINES = 0.760666;
const W_HOLES = -0.6;
const W_BUMPY = -0.184483;
const W_WELL = -0.12;
const W_MAXH = -0.22;
const ACTION_MS = 145;
const FOLD_COOLDOWN_MS = 1500;

function isArray(value) { return Array.isArray(value); }

function wrapRingColumn(value) {
  return ((Math.trunc(Number(value) || 0) % RING_COLS) + RING_COLS) % RING_COLS;
}

function cellsFor(type, rotation) {
  const states = SHAPES[type];
  const rot = ((rotation | 0) % 4 + 4) % 4;
  if (states && isArray(states[rot]) && states[rot].length === 4) return states[rot];
  return SHAPES.O[0];
}

function localColumn(face, rc) {
  return (wrapRingColumn(rc) - ringCol(face, 0) + RING_COLS) % RING_COLS;
}

function occupancyOf(G, face) {
  const window = faceWindow(face);
  return Array.from({ length: ROWS }, (_, y) => (
    Uint8Array.from(window.map((rc) => (G.ring.grid[y][rc] ? 1 : 0)))
  ));
}

function evaluate(occupancy, clearedLines) {
  const heights = new Array(FACE_W).fill(0);
  let holes = 0;
  for (let x = 0; x < FACE_W; x += 1) {
    let top = -1;
    for (let y = 0; y < ROWS; y += 1) {
      if (occupancy[y][x]) { top = y; break; }
    }
    if (top < 0) continue;
    heights[x] = ROWS - top;
    for (let y = top + 1; y < ROWS; y += 1) if (!occupancy[y][x]) holes += 1;
  }

  let aggregate = 0;
  let bumpy = 0;
  let maxHeight = 0;
  let wells = 0;
  for (let x = 0; x < FACE_W; x += 1) {
    aggregate += heights[x];
    maxHeight = Math.max(maxHeight, heights[x]);
    if (x < FACE_W - 1) bumpy += Math.abs(heights[x] - heights[x + 1]);
    const left = x === 0 ? ROWS : heights[x - 1];
    const right = x === FACE_W - 1 ? ROWS : heights[x + 1];
    const wellDepth = Math.min(left, right) - heights[x];
    if (wellDepth > 2) wells += wellDepth - 2;
  }
  return W_HEIGHT * aggregate + W_LINES * clearedLines + W_HOLES * holes
    + W_BUMPY * bumpy + W_WELL * wells + W_MAXH * maxHeight;
}

function scorePlacement(occupancy, cells, face, originX, originY) {
  const clone = occupancy.map((row) => Uint8Array.from(row));
  for (const [dx, dy] of cells) {
    const x = originX + dx;
    const y = originY + dy;
    if (x >= 0 && x < FACE_W && y >= 0 && y < ROWS) clone[y][x] = 1;
  }

  const kept = [];
  let cleared = 0;
  for (let y = 0; y < ROWS; y += 1) {
    if (clone[y].every(Boolean)) cleared += 1;
    else kept.push(clone[y]);
  }
  if (!cleared) return evaluate(clone, 0);
  const packed = Array.from({ length: ROWS }, () => new Uint8Array(FACE_W));
  for (let i = 0; i < kept.length; i += 1) packed[cleared + i] = kept[i];
  return evaluate(packed, cleared);
}

function bestPlacement(G, piece) {
  const face = G.face;
  const occupancy = occupancyOf(G, face);
  const rotations = ROT_STATES[piece.t] || 4;
  let best = null;

  for (let rotation = 0; rotation < rotations; rotation += 1) {
    const shape = cellsFor(piece.t, rotation);
    const minDx = Math.min(...shape.map(([x]) => x));
    const maxDx = Math.max(...shape.map(([x]) => x));
    const lowX = -minDx;
    const highX = FACE_W - 1 - maxDx;
    for (let originX = lowX; originX <= highX; originX += 1) {
      const candidate = {
        ...piece,
        x: ringCol(face, originX),
        y: -4,
        rot: rotation,
      };
      if (collides(G.ring, cellsOf(candidate))) continue;
      while (candidate.y < ROWS + 3) {
        const next = { ...candidate, y: candidate.y + 1 };
        if (collides(G.ring, cellsOf(next))) break;
        candidate.y += 1;
      }
      const landing = cellsOf(candidate);
      if (landing.some(([, y]) => y < 0)) continue;
      const score = scorePlacement(occupancy, shape, face, originX, candidate.y);
      if (!best || score > best.score) {
        best = { rotation, x: candidate.x, score };
      }
    }
  }
  return best;
}

function pieceVisible(G) {
  const window = new Set(faceWindow(G.face));
  return cellsOf(G.piece).some(([x]) => window.has(wrapRingColumn(x)));
}

function directionToPiece(G) {
  const cells = cellsOf(G.piece);
  const rightWindow = new Set(faceWindow(nextFace(G.face, 1)));
  const leftWindow = new Set(faceWindow(nextFace(G.face, -1)));
  const right = cells.filter(([x]) => rightWindow.has(wrapRingColumn(x))).length;
  const left = cells.filter(([x]) => leftWindow.has(wrapRingColumn(x))).length;
  if (right !== left) return right > left ? 1 : -1;
  return 1;
}

function mostDangerousFace(G) {
  let best = null;
  for (let step = 1; step < FACES.length; step += 1) {
    const face = (G.face + step) % FACES.length;
    const danger = faceDanger(G.ring, face);
    if (!best || danger > best.danger) best = { face, danger };
  }
  return best || { face: nextFace(G.face, 1), danger: 0 };
}

function foldDirectionToward(G, target) {
  const right = nextFace(G.face, 1);
  const left = nextFace(G.face, -1);
  if (target === right) return 1;
  if (target === left) return -1;
  return faceDanger(G.ring, right) >= faceDanger(G.ring, left) ? 1 : -1;
}

export function createBot() {
  let plan = null;
  let planKey = '';
  let nextActionAt = -1e9;
  let lastSeenMs = 0;
  let lastFoldMs = -1e9;
  let foldedPieceKey = '';
  let followedPieceKey = '';
  let actionsThisPiece = 0;

  function reset() {
    plan = null;
    planKey = '';
    nextActionAt = -1e9;
    lastSeenMs = 0;
    lastFoldMs = -1e9;
    foldedPieceKey = '';
    followedPieceKey = '';
    actionsThisPiece = 0;
  }

  function stepInner(G) {
    if (!G || typeof G !== 'object' || !G.ring || !Array.isArray(G.ring.grid)) return [];
    const now = Number.isFinite(G.timeMs) ? G.timeMs : 0;
    if (now + 1 < lastSeenMs) reset();
    lastSeenMs = now;
    if (G.status === 'folding') return [];
    if (G.status !== 'playing') {
      if (G.status === 'title' || G.status === 'gameover' || G.status === 'won') reset();
      return [];
    }

    const piece = G.piece;
    if (!piece || typeof piece.t !== 'string') return [];
    const pieceNumber = G.stats && Number.isFinite(G.stats.pieces) ? G.stats.pieces : 0;
    const pieceKey = `${pieceNumber}:${piece.t}:${piece.prism ? 1 : 0}`;
    const faceKey = `${pieceKey}:${G.face}`;
    if (now < nextActionAt) return [];

    // Manual folds can leave a piece in a seam. Fold back toward it if the
    // camera is not already following it; the game itself also auto-follows
    // on the next gravity/move/rotate event.
    if (!pieceVisible(G) && followedPieceKey !== pieceKey
        && now - lastFoldMs >= FOLD_COOLDOWN_MS) {
      followedPieceKey = pieceKey;
      lastFoldMs = now;
      nextActionAt = now + ACTION_MS * 2;
      return [directionToPiece(G) < 0 ? 'flip_left' : 'flip_right'];
    }

    // Occasionally move toward the most endangered unseen face. Folds are
    // free in v5, so this decision is pressure-driven.
    const danger = mostDangerousFace(G);
    const hereDanger = faceDanger(G.ring, G.face);
    const occasional = pieceNumber % 6 === 0 && danger.danger > 0.25;
    const urgent = danger.danger > 0.78 && danger.danger > hereDanger + 0.04;
    if (foldedPieceKey !== pieceKey && now - lastFoldMs >= FOLD_COOLDOWN_MS
        && (occasional || urgent)) {
      foldedPieceKey = pieceKey;
      lastFoldMs = now;
      nextActionAt = now + ACTION_MS * 2;
      return [foldDirectionToward(G, danger.face) < 0 ? 'flip_left' : 'flip_right'];
    }

    if (planKey !== faceKey || !plan) {
      try { plan = bestPlacement(G, piece); } catch (_) { plan = null; }
      if (!plan) plan = { rotation: piece.rot | 0, x: wrapRingColumn(piece.x) };
      planKey = faceKey;
      actionsThisPiece = 0;
    }

    if (++actionsThisPiece > 16) {
      nextActionAt = now + ACTION_MS;
      plan = null;
      return ['hard'];
    }

    const currentRotation = ((piece.rot | 0) % 4 + 4) % 4;
    const targetRotation = ((plan.rotation | 0) % 4 + 4) % 4;
    const currentX = wrapRingColumn(piece.x);
    const targetX = wrapRingColumn(plan.x);
    let action;
    if (currentRotation !== targetRotation) {
      const clockwise = (targetRotation - currentRotation + 4) % 4;
      action = clockwise === 3 ? 'rotccw' : 'rotcw';
    } else if (currentX !== targetX) {
      const rightDistance = (targetX - currentX + RING_COLS) % RING_COLS;
      action = rightDistance <= RING_COLS / 2 ? 'right' : 'left';
    } else {
      action = 'hard';
      plan = null;
    }
    nextActionAt = now + ACTION_MS;
    return [action];
  }

  return {
    step(G) {
      try {
        const actions = stepInner(G);
        return isArray(actions) ? actions : [];
      } catch (_) {
        return [];
      }
    },
    reset,
  };
}

export default createBot;
