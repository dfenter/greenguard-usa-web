// Progression and cross-face pressure for the v5 cube.
import {
  FACE_W,
  FACES,
  LINES_PER_PHASE,
  PHASES,
  ROWS,
  WIN_PHASE,
} from '../config.js';
import { rng } from './pieces.js';
import {
  addGarbage,
  clearFaceRows,
  faceDanger,
  faceWindow,
} from './board.js';

function clampPhase(phase) {
  const value = Number(phase);
  if (!Number.isFinite(value)) return 1;
  return Math.min(WIN_PHASE, Math.max(1, Math.floor(value)));
}

function countValue(value) {
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
    G.seam = { active: false, cleared: Array(FACES.length).fill(false) };
  }
  if (!Array.isArray(G.seam.cleared)) G.seam.cleared = [];
  G.seam.cleared = FACES.map((_, face) => Boolean(G.seam.cleared[face]));
  G.seam.active = Boolean(G.seam.active);
  return G.seam;
}

function faceIndex(face) {
  if (Number.isInteger(face)) return ((face % FACES.length) + FACES.length) % FACES.length;
  const index = FACES.indexOf(face);
  return index >= 0 ? index : 0;
}

function randomHole(G) {
  const value = Number(rng(G && G.rngState));
  if (!Number.isFinite(value)) return 0;
  return Math.min(FACE_W - 1, Math.max(0, Math.floor(value * FACE_W)));
}

// Keep seam holes off shared corner columns. The four independent seam rows
// are inserted through the real shared ring columns, so an edge hole on one
// face would otherwise be overwritten by its neighbor's insertion.
function randomSeamHole(G) {
  const value = Number(rng(G && G.rngState));
  if (!Number.isFinite(value)) return 1;
  return 1 + Math.min(FACE_W - 3, Math.max(0, Math.floor(value * (FACE_W - 2))));
}

function rowHasOwnedSeam(G, face, y) {
  if (!G || !G.ring || !G.ring.grid || y < 0 || y >= ROWS) return false;
  return faceWindow(face).some((rc) => {
    const cell = G.ring.grid[y][rc];
    return cell && cell.t === 'SEAM' && cell.sf === face;
  });
}

function stampSeamRow(G, face) {
  const row = G.ring.grid[ROWS - 1];
  for (const rc of faceWindow(face)) {
    const cell = row && row[rc];
    if (cell && cell.t === 'SEAM') cell.sf = face;
  }
}

export function phaseFor(lines) {
  const count = countValue(lines);
  return Math.min(WIN_PHASE, 1 + Math.floor(count / LINES_PER_PHASE));
}

export function phaseCfg(phase) {
  return PHASES[clampPhase(phase)];
}

export function gravityMs(phase) {
  return phaseCfg(phase).gravMs;
}

/** Add one gold seam row to each face, with an independent hole per face. */
export function spawnSeam(G) {
  if (!G || !G.ring) return false;
  const seam = ensureSeam(G);
  if (seam.active) return false;

  seam.active = true;
  seam.cleared = FACES.map(() => false);
  let topOut = false;
  for (let face = 0; face < FACES.length; face += 1) {
    const didTopOut = addGarbage(G.ring, face, randomSeamHole(G), true);
    stampSeamRow(G, face);
    if (didTopOut) {
      topOut = true;
      if (G.overFace == null) G.overFace = face;
    }
  }
  return topOut;
}

export function onLinesCleared(G, n) {
  if (!G) return false;
  const cleared = countValue(n);
  G.lines = countValue(G.lines) + cleared;

  const before = clampPhase(G.phase);
  const next = phaseFor(G.lines);
  G.phase = next;
  if (next > before) ensureFx(G).push({ k: 'levelup', phase: next });

  if (next === WIN_PHASE && !ensureSeam(G).active) return spawnSeam(G);
  return false;
}

function nextUnseenFace(G) {
  const current = faceIndex(G.face);
  let cursor = Number.isInteger(G.festerCursor) ? G.festerCursor : 0;
  cursor = ((cursor % FACES.length) + FACES.length) % FACES.length;
  for (let offset = 0; offset < FACES.length; offset += 1) {
    const candidate = (cursor + offset) % FACES.length;
    if (candidate !== current) {
      G.festerCursor = (candidate + 1) % FACES.length;
      return candidate;
    }
  }
  return (current + 1) % FACES.length;
}

/** Fester unseen faces in deterministic round-robin order. */
export function festerCheck(G) {
  if (!G || !G.ring) return false;
  const every = phaseCfg(G.phase).festerEvery;
  const elapsed = countValue(G.piecesSinceFester);
  if (elapsed < every) return false;

  const amount = Math.floor(elapsed / every);
  G.piecesSinceFester = elapsed % every;
  let toppedOut = false;
  for (let i = 0; i < amount; i += 1) {
    const face = nextUnseenFace(G);
    const hole = randomHole(G);
    if (addGarbage(G.ring, face, hole, false)) {
      toppedOut = true;
      if (G.overFace == null) G.overFace = face;
    }
    ensureFx(G).push({ k: 'garbage', face, world: FACES[face], hole, phase: G.phase });
    if (toppedOut) break;
  }
  return toppedOut;
}

function mostDangerousUnseenFace(G) {
  const current = faceIndex(G.face);
  let best = null;
  for (let step = 1; step < FACES.length; step += 1) {
    const face = (current + step) % FACES.length;
    const danger = faceDanger(G.ring, face);
    if (!best || danger > best.danger) best = { face, danger };
  }
  return best ? best.face : (current + 1) % FACES.length;
}

/**
 * Echo away bottom garbage rows from the most endangered unseen face. This
 * is called after the source clear has collapsed, so it only needs ring rows.
 */
export function echoClear(G, count) {
  const amount = countValue(count) - 1;
  if (!G || !G.ring || amount <= 0) return 0;

  const face = mostDangerousUnseenFace(G);
  const rows = [];
  const columns = faceWindow(face);
  for (let y = ROWS - 1; y >= 0 && rows.length < amount; y -= 1) {
    if (columns.some((rc) => {
      const cell = G.ring.grid[y][rc];
      return cell && cell.t === 'G';
    })) rows.push(y);
  }
  if (!rows.length) return 0;

  const cleared = clearFaceRows(G.ring, rows.map((y) => ({ face, y })));
  ensureFx(G).push({
    k: 'echo',
    face,
    world: FACES[face],
    rows: rows.slice().sort((a, b) => a - b),
    count: cleared,
    phase: G.phase,
  });
  return rows.length;
}

/** Mark seam rows before the board collapses; return true once all four faces mend. */
export function checkSeamWin(G, clearedMarks) {
  if (!G || !Array.isArray(clearedMarks)) return false;
  const seam = ensureSeam(G);
  if (!seam.active) return false;

  for (const mark of clearedMarks) {
    if (!mark || !Number.isInteger(mark.y) || mark.y < 0 || mark.y >= ROWS) continue;
    const face = faceIndex(mark.face);
    if (rowHasOwnedSeam(G, face, mark.y)) seam.cleared[face] = true;
  }
  return seam.cleared.every(Boolean);
}
