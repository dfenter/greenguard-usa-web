// FLIPSIDE — LANE O5: attract-mode heuristic bot.
// createBot() -> B ; B.step(G) -> string[] of input actions.
// Runs the demo game behind the title screen. Must NEVER throw for any G.
import { COLS, ROWS, FLIP_MAX, other } from './config.js';
import { SHAPES } from './core/pieces.js';

// ---------------------------------------------------------------------------
// Local SRS shape table (fallback + validation reference). Offsets are
// [dx,dy] inside the 4x4 spawn box, matching the Piece {x,y} contract.
// ---------------------------------------------------------------------------
const LOCAL_SHAPES = {
  I: [[[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]],
      [[0,2],[1,2],[2,2],[3,2]], [[1,0],[1,1],[1,2],[1,3]]],
  O: [[[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]],
      [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]]],
  T: [[[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]],
      [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]]],
  S: [[[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]],
      [[1,1],[2,1],[0,2],[1,2]], [[0,0],[0,1],[1,1],[1,2]]],
  Z: [[[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]],
      [[0,1],[1,1],[1,2],[2,2]], [[1,0],[0,1],[1,1],[0,2]]],
  J: [[[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]],
      [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]]],
  L: [[[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]],
      [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]]],
};

// Distinct rotation states worth searching (avoids duplicate work).
const ROT_STATES = { I: 2, O: 1, S: 2, Z: 2, T: 4, J: 4, L: 4 };

// El-Tetris style weights, mildly retuned for a watchable (not perfect) bot.
const W_HEIGHT = -0.510066;
const W_LINES = 0.760666;
const W_HOLES = -0.6;
const W_BUMPY = -0.184483;
const W_WELL = -0.12;
const W_MAXH = -0.22;

const ACTION_MS = 165;          // ~6 actions/sec, human-ish cadence
const FLIP_COOLDOWN_MS = 2600;  // don't spam the page turn

function isArr(a) { return Array.isArray(a); }

/** Validated [dx,dy]x4 for a type+rotation; falls back to the local table. */
function cellsFor(t, rot) {
  const r = ((rot | 0) % 4 + 4) % 4;
  let s = null;
  try {
    const tab = SHAPES && SHAPES[t];
    if (isArr(tab) && isArr(tab[r]) && tab[r].length === 4) {
      let ok = true;
      for (const c of tab[r]) {
        if (!isArr(c) || c.length < 2 ||
            typeof c[0] !== 'number' || typeof c[1] !== 'number') { ok = false; break; }
      }
      if (ok) s = tab[r];
    }
  } catch (_) { s = null; }
  if (!s) {
    const loc = LOCAL_SHAPES[t];
    s = loc ? loc[r] : LOCAL_SHAPES.O[0];
  }
  return s;
}

/** Copy of a board grid as a compact boolean occupancy matrix. */
function occupancyOf(board) {
  const out = new Array(ROWS);
  const grid = board && board.grid;
  for (let y = 0; y < ROWS; y++) {
    const row = new Uint8Array(COLS);
    const src = isArr(grid) ? grid[y] : null;
    if (isArr(src)) {
      for (let x = 0; x < COLS; x++) row[x] = src[x] ? 1 : 0;
    }
    out[y] = row;
  }
  return out;
}

function occCollides(occ, cells, ox, oy) {
  for (let i = 0; i < cells.length; i++) {
    const x = ox + cells[i][0];
    const y = oy + cells[i][1];
    if (x < 0 || x >= COLS) return true;
    if (y >= ROWS) return true;
    if (y < 0) continue;              // above the ceiling is free
    if (occ[y][x]) return true;
  }
  return false;
}

/** Heuristic score of an occupancy matrix (higher = better). */
function evaluate(occ, clearedLines) {
  const heights = new Array(COLS).fill(0);
  let holes = 0;
  for (let x = 0; x < COLS; x++) {
    let top = -1;
    for (let y = 0; y < ROWS; y++) {
      if (occ[y][x]) { top = y; break; }
    }
    if (top < 0) { heights[x] = 0; continue; }
    heights[x] = ROWS - top;
    for (let y = top + 1; y < ROWS; y++) if (!occ[y][x]) holes++;
  }
  let agg = 0, bumpy = 0, maxH = 0, wells = 0;
  for (let x = 0; x < COLS; x++) {
    agg += heights[x];
    if (heights[x] > maxH) maxH = heights[x];
    if (x < COLS - 1) bumpy += Math.abs(heights[x] - heights[x + 1]);
    const l = x === 0 ? ROWS : heights[x - 1];
    const r = x === COLS - 1 ? ROWS : heights[x + 1];
    const d = Math.min(l, r) - heights[x];
    if (d > 2) wells += d - 2;
  }
  return W_HEIGHT * agg + W_LINES * clearedLines + W_HOLES * holes +
         W_BUMPY * bumpy + W_WELL * wells + W_MAXH * maxH;
}

/** Place piece cells at (ox, restY) into a clone, clear lines, evaluate. */
function scorePlacement(occ, cells, ox, oy) {
  const clone = new Array(ROWS);
  for (let y = 0; y < ROWS; y++) clone[y] = Uint8Array.from(occ[y]);
  for (let i = 0; i < cells.length; i++) {
    const x = ox + cells[i][0], y = oy + cells[i][1];
    if (y >= 0 && y < ROWS && x >= 0 && x < COLS) clone[y][x] = 1;
  }
  // clear full rows
  const kept = [];
  let cleared = 0;
  for (let y = 0; y < ROWS; y++) {
    let full = true;
    for (let x = 0; x < COLS; x++) if (!clone[y][x]) { full = false; break; }
    if (full) cleared++; else kept.push(clone[y]);
  }
  if (cleared) {
    const packed = new Array(ROWS);
    for (let i = 0; i < cleared; i++) packed[i] = new Uint8Array(COLS);
    for (let i = 0; i < kept.length; i++) packed[cleared + i] = kept[i];
    return evaluate(packed, cleared);
  }
  return evaluate(clone, 0);
}

/** Best {rot, x, score} for a piece type on this occupancy, or null. */
function bestPlacement(occ, t) {
  const rots = ROT_STATES[t] || 4;
  let best = null;
  for (let r = 0; r < rots; r++) {
    const cells = cellsFor(t, r);
    let minDx = 3, maxDx = 0;
    for (const c of cells) {
      if (c[0] < minDx) minDx = c[0];
      if (c[0] > maxDx) maxDx = c[0];
    }
    const loX = -minDx, hiX = COLS - 1 - maxDx;
    for (let ox = loX; ox <= hiX; ox++) {
      // drop from above the ceiling
      let oy = -4;
      if (occCollides(occ, cells, ox, oy)) continue;
      while (!occCollides(occ, cells, ox, oy + 1)) oy++;
      // The game treats even one hidden final cell as a top-out on lock.
      // Only plan landings whose complete tetromino is inside the board.
      let fullyVisible = true;
      for (const c of cells) {
        if (oy + c[1] < 0) { fullyVisible = false; break; }
      }
      if (!fullyVisible) continue;
      const s = scorePlacement(occ, cells, ox, oy);
      if (!best || s > best.score) best = { rot: r, x: ox, score: s };
    }
  }
  return best;
}

function stackHeight(board) {
  const grid = board && board.grid;
  if (!isArr(grid)) return 0;
  for (let y = 0; y < ROWS; y++) {
    const row = grid[y];
    if (!isArr(row)) continue;
    for (let x = 0; x < COLS; x++) if (row[x]) return ROWS - y;
  }
  return 0;
}

export function createBot() {
  let plan = null;          // { rot, x }
  let planKey = '';         // identity of the piece the plan was made for
  let nextActAt = -1e9;     // G.timeMs of next allowed action
  let lastSeenMs = 0;
  let flippedForKey = '';   // don't re-flip on the same piece
  let lastFlipMs = -1e9;
  let actsThisPiece = 0;

  function reset() {
    plan = null; planKey = ''; nextActAt = -1e9;
    flippedForKey = ''; lastFlipMs = -1e9; actsThisPiece = 0;
  }

  function stepInner(G) {
    if (!G || typeof G !== 'object') return [];
    const now = typeof G.timeMs === 'number' && isFinite(G.timeMs) ? G.timeMs : 0;
    if (now + 1 < lastSeenMs) reset();      // game restarted -> clock rewound
    lastSeenMs = now;

    // A fold is owned by the camera handshake. Do not queue gameplay actions
    // or a second flip while it is in progress.
    if (G.status === 'folding') return [];

    if (G.status !== 'playing') {
      if (G.status === 'title' || G.status === 'gameover' || G.status === 'won') reset();
      return [];
    }

    const p = G.piece;
    if (!p || typeof p !== 'object' || typeof p.t !== 'string') return [];
    const world = G.world === 'ink' ? 'ink' : 'sun';
    const boards = G.boards || {};
    const board = boards[world];
    if (!board || !isArr(board.grid)) return [];

    const pieces = (G.stats && typeof G.stats.pieces === 'number') ? G.stats.pieces : 0;
    const key = world + '#' + pieces + '#' + p.t;

    if (now < nextActAt) return [];

    // --- fold decision (once per piece, only just after it spawns) ----------
    const charge = typeof G.flipCharge === 'number' ? G.flipCharge : 0;
    if (charge > 0 && flippedForKey !== key && now - lastFlipMs > FLIP_COOLDOWN_MS) {
      const farBoard = boards[other(world)];
      const far = farBoard ? stackHeight(farBoard) : 0;
      const here = stackHeight(board);
      const urgent = far >= 12 || far - here >= 5;
      // Spend a banked charge occasionally even before the far side is
      // critical; urgent far-side pressure remains an independent trigger.
      const chargeHigh = charge >= Math.max(2, FLIP_MAX - 1);
      if (urgent || chargeHigh) {
        flippedForKey = key;
        lastFlipMs = now;
        nextActAt = now + ACTION_MS * 3;
        plan = null; planKey = '';
        return ['flip'];
      }
    }

    // --- (re)plan on a new piece ------------------------------------------
    if (planKey !== key || !plan) {
      let best = null;
      try { best = bestPlacement(occupancyOf(board), p.t); } catch (_) { best = null; }
      plan = best ? { rot: best.rot, x: best.x } : { rot: (p.rot | 0) & 3, x: p.x | 0 };
      planKey = key;
      actsThisPiece = 0;
    }
    // Stuck against a wall / blocked kick: stop fidgeting and just drop.
    if (++actsThisPiece > 14) {
      nextActAt = now + ACTION_MS;
      plan = null;
      return ['hard'];
    }

    // --- emit one action toward the plan -----------------------------------
    const curRot = ((p.rot | 0) % 4 + 4) % 4;
    const curX = p.x | 0;
    let act = null;
    if (curRot !== plan.rot) {
      const cw = (plan.rot - curRot + 4) % 4;
      act = cw === 3 ? 'rotccw' : 'rotcw';
    } else if (curX < plan.x) {
      act = 'right';
    } else if (curX > plan.x) {
      act = 'left';
    } else {
      act = 'hard';
      plan = null;                 // piece is committed; replan on the next one
    }
    nextActAt = now + ACTION_MS;
    return [act];
  }

  return {
    step(G) {
      try {
        const out = stepInner(G);
        return isArr(out) ? out : [];
      } catch (_) {
        return [];
      }
    },
    reset,
  };
}

export default createBot;
