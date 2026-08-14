import {
  FACES,
  LOCK_DELAY_MS,
  LOCK_RESETS_MAX,
  QUEUE_LEN,
  RING_COLS,
  ROWS,
  RING_CLEAR_SCORE,
  SCORE_LINES,
  SOFT_DROP_FACTOR,
  nextFace,
  ringCol,
} from '../config.js?v=43ddf0f';
import {
  cellsOf,
  createRngState,
  makeBag,
  rotate,
  spawnPiece,
} from './pieces.js?v=43ddf0f';
import {
  anyAbove,
  cellAt,
  clearFaceRows,
  collides,
  createRing,
  faceRowFull,
  faceWindow,
  lockCells,
  ringRowFull,
} from './board.js?v=43ddf0f';
import {
  checkSeamWin,
  echoClear,
  festerCheck,
  gravityMs,
  onLinesCleared,
} from './progression.js?v=43ddf0f';

const COMBO_SCORE = 50;
const B2B_MULT = 1.5;
const EPSILON = 1e-7;
const MAX_TIME_STEPS = 128;

function wrapRingColumn(x) {
  return ((Math.trunc(Number(x) || 0) % RING_COLS) + RING_COLS) % RING_COLS;
}

/**
 * Return the ring direction toward one or more columns from a viewed face.
 * Exactly opposite columns use the same clockwise/right tie policy as the
 * auto-follow behavior, so seam profiles and camera folds agree.
 */
export function ringDirectionToward(face, ringColumns) {
  const start = ringCol(face, 0);
  const columns = Array.isArray(ringColumns) ? ringColumns : [ringColumns];
  let signedDistance = 0;
  for (const column of columns) {
    const relative = (wrapRingColumn(column) - start + RING_COLS) % RING_COLS;
    signedDistance += relative <= RING_COLS * 0.5
      ? relative
      : relative - RING_COLS;
  }
  return signedDistance >= 0 ? 1 : -1;
}

function cloneCell(cell) {
  return cell
    ? { w: cell.w, t: cell.t, ...(Number.isInteger(cell.sf) ? { sf: cell.sf } : {}) }
    : null;
}

function clonePiece(piece) {
  return piece
    ? { t: piece.t, x: piece.x, y: piece.y, rot: piece.rot, prism: !!piece.prism }
    : null;
}

function cloneCells(cells) {
  return Array.isArray(cells) ? cells.map(([x, y]) => [x, y]) : [];
}

function pushFx(G, k, detail = {}) {
  if (!Array.isArray(G.fx)) G.fx = [];
  G.fx.push({ k, ...detail });
}

function queueEntry(value) {
  if (typeof value === 'string') return { t: value, prism: false };
  return { t: value?.t, prism: value?.prism === true };
}

function setHold(G, entry) {
  const normalized = entry && typeof entry.t === 'string' ? entry : null;
  G.holdT = normalized ? normalized.t : null;
  G.holdPrism = Boolean(normalized?.prism);
}

function appendBag(G) {
  const bag = makeBag(G.bagIndex, G.rngState);
  G.bagIndex += 1;
  for (const entry of bag) G.queue.push(queueEntry(entry));
}

function ensureQueue(G) {
  while (G.queue.length < QUEUE_LEN + 1) appendBag(G);
}

function nextQueueEntry(G) {
  ensureQueue(G);
  const entry = queueEntry(G.queue.shift());
  ensureQueue(G);
  return entry;
}

function canControlPiece(G) {
  return Boolean(G && G.status === 'playing' && G.piece);
}

function pieceFits(G, piece) {
  return !collides(G.ring, cellsOf(piece));
}

function isGrounded(G) {
  if (!G.piece) return false;
  const falling = clonePiece(G.piece);
  falling.y += 1;
  return collides(G.ring, cellsOf(falling));
}

function resetPieceTimers(G) {
  G.gravMs = 0;
  G.lockMs = 0;
  G.lockResets = 0;
}

function endGame(G, face = G.face) {
  if (G.status === 'gameover' || G.status === 'won') return;
  const normalized = Number.isInteger(face)
    ? ((face % FACES.length) + FACES.length) % FACES.length
    : G.face;
  G.status = 'gameover';
  G.overFace = normalized;
  pushFx(G, 'gameover', { face: normalized, world: FACES[normalized], phase: G.phase });
}

function endWin(G) {
  if (G.status === 'won') return;
  G.status = 'won';
  pushFx(G, 'seamwin', { face: G.face, world: FACES[G.face], phase: G.phase });
}

function spawnSpecific(G, entry) {
  const normalized = queueEntry(entry);
  const piece = spawnPiece(normalized.t, normalized.prism);
  piece.x = ringCol(G.face, 3);
  G.piece = piece;
  resetPieceTimers(G);
  if (!pieceFits(G, piece)) {
    endGame(G, G.face);
    return false;
  }
  return true;
}

function spawnNext(G) {
  return spawnSpecific(G, nextQueueEntry(G));
}

function resetLockAfterAction(G) {
  if (!isGrounded(G)) {
    G.lockMs = 0;
    return;
  }
  if (G.lockResets < LOCK_RESETS_MAX) {
    G.lockMs = 0;
    G.lockResets += 1;
  }
}

function visibleInFace(G, face, cells = cellsOf(G.piece)) {
  const window = new Set(faceWindow(face));
  return cells.some(([x]) => window.has(wrapRingColumn(x)));
}

function directionTowardPiece(G) {
  const current = G.face;
  const cells = cellsOf(G.piece);
  const next = nextFace(current, 1);
  const previous = nextFace(current, -1);
  const nextWindow = new Set(faceWindow(next));
  const previousWindow = new Set(faceWindow(previous));
  const nextCount = cells.filter(([x]) => nextWindow.has(wrapRingColumn(x))).length;
  const previousCount = cells.filter(([x]) => previousWindow.has(wrapRingColumn(x))).length;
  if (nextCount !== previousCount) return nextCount > previousCount ? 1 : -1;

  return ringDirectionToward(current, cells.map(([x]) => x));
}

function beginFold(G, dir, auto = false) {
  if (!G || G.status !== 'playing') return false;
  const direction = dir < 0 ? -1 : 1;
  const from = G.face;
  const to = nextFace(from, direction);
  G.status = 'folding';
  G.fold = { from, to, dir: direction };
  G.stats.folds += 1;
  pushFx(G, 'fold_start', { from, to, dir: direction, auto: auto === true });
  return true;
}

function maybeAutoFollow(G) {
  if (!canControlPiece(G) || visibleInFace(G, G.face)) return false;
  return beginFold(G, directionTowardPiece(G), true);
}

function moveHorizontal(G, dx) {
  if (!canControlPiece(G)) return false;
  const candidate = clonePiece(G.piece);
  candidate.x = wrapRingColumn(candidate.x + dx);
  if (collides(G.ring, cellsOf(candidate))) return false;
  G.piece = candidate;
  resetLockAfterAction(G);
  pushFx(G, 'move', {
    face: G.face,
    world: FACES[G.face],
    piece: clonePiece(candidate),
    cells: cloneCells(cellsOf(candidate)),
  });
  maybeAutoFollow(G);
  return true;
}

function rotatePiece(G, dir) {
  if (!canControlPiece(G)) return false;
  const turned = rotate(G.piece, dir, (candidateCells) => collides(G.ring, candidateCells));
  if (!turned) return false;
  turned.x = wrapRingColumn(turned.x);
  G.piece = turned;
  resetLockAfterAction(G);
  pushFx(G, 'rotate', {
    face: G.face,
    world: FACES[G.face],
    dir,
    piece: clonePiece(turned),
    cells: cloneCells(cellsOf(turned)),
  });
  maybeAutoFollow(G);
  return true;
}

function faceClearPlan(G, affectedRows) {
  const rows = [...new Set(affectedRows.filter((y) => Number.isInteger(y) && y >= 0 && y < ROWS))]
    .sort((a, b) => a - b);
  const ringRows = rows.filter((y) => ringRowFull(G.ring, y));
  const ringSet = new Set(ringRows);
  const marks = [];
  for (const y of rows) {
    if (ringSet.has(y)) continue;
    for (let face = 0; face < FACES.length; face += 1) {
      if (faceRowFull(G.ring, face, y)) marks.push({ face, y });
    }
  }
  const seamMarks = marks.concat(
    ringRows.flatMap((y) => FACES.map((_, face) => ({ face, y }))),
  );
  return { rows, ringRows, marks, seamMarks };
}

function faceGroups(marks) {
  const groups = new Map();
  for (const mark of marks) {
    if (!groups.has(mark.face)) groups.set(mark.face, []);
    groups.get(mark.face).push(mark);
  }
  return groups;
}

function captureFaceRows(G, marks) {
  return marks.map((mark) => ({
    ...mark,
    cells: faceWindow(mark.face).map((rc) => cloneCell(G.ring.grid[mark.y][rc])),
  }));
}

function captureRingRows(G, rows) {
  return rows.map((y) => ({ y, cells: G.ring.grid[y].map(cloneCell) }));
}

function clearPlan(G, plan) {
  const faceCount = plan.marks.length;
  const ringCount = plan.ringRows.length;
  const total = faceCount + ringCount;
  if (!total) {
    G.combo = -1;
    return { total: 0, seamWin: false };
  }

  const phase = G.phase;
  const groups = faceGroups(plan.marks);
  let facePoints = 0;
  let hasTetris = false;
  for (const group of groups.values()) {
    const count = group.length;
    facePoints += SCORE_LINES[count] || 0;
    if (count === 4) hasTetris = true;
  }

  const wasB2B = G.b2b;
  if (hasTetris && wasB2B) facePoints *= B2B_MULT;
  const basePoints = (facePoints + ringCount * RING_CLEAR_SCORE) * phase;
  G.combo += 1;
  const points = Math.round(basePoints + COMBO_SCORE * G.combo * phase);
  G.score += points;
  G.b2b = hasTetris;
  G.stats.tetris += [...groups.values()].filter((group) => group.length === 4).length;
  G.stats.rings += ringCount;
  G.stats.maxCombo = Math.max(G.stats.maxCombo, G.combo);

  const faceRows = captureFaceRows(G, plan.marks);
  const ringRows = captureRingRows(G, plan.ringRows);
  const seamWin = checkSeamWin(G, plan.seamMarks);

  // Expand every ring row into its four face windows, then clear the complete
  // union once so row indices remain stable and each touched column collapses
  // exactly once.
  const allMarks = plan.marks.concat(
    plan.ringRows.flatMap((y) => FACES.map((_, face) => ({ face, y }))),
  );
  clearFaceRows(G.ring, allMarks);

  for (const [face, group] of groups) {
    const count = group.length;
    pushFx(G, 'clear', {
      face,
      world: FACES[face],
      rows: group.map((mark) => mark.y),
      cells: faceRows.filter((row) => row.face === face),
      count,
      score: Math.round((SCORE_LINES[count] || 0) * phase),
      phase,
      combo: G.combo,
      b2b: count === 4 && wasB2B,
    });
    if (count === 4) {
      pushFx(G, 'tetris', {
        face,
        world: FACES[face],
        rows: group.map((mark) => mark.y),
        count,
        b2b: wasB2B,
      });
    }
  }
  for (const row of ringRows) pushFx(G, 'ring_clear', row);

  const progressionTopOut = onLinesCleared(G, total);
  if (progressionTopOut) endGame(G, G.overFace == null ? G.face : G.overFace);
  if (G.status === 'gameover') return { total, seamWin };

  if (faceCount >= 2) echoClear(G, faceCount);
  return { total, seamWin };
}

function resolveLines(G, affectedRows) {
  const result = clearPlan(G, faceClearPlan(G, affectedRows));
  if (result.seamWin && G.status === 'playing') endWin(G);
  return result.total;
}

function lockCurrentPiece(G) {
  if (!canControlPiece(G)) return;

  const locked = clonePiece(G.piece);
  const cells = cellsOf(locked);
  const face = G.face;
  const world = FACES[face];
  lockCells(G.ring, cells, world, locked.t);

  const drilled = [];
  if (locked.prism) {
    const oppositeFace = nextFace(face, 2);
    const oppositeWorld = FACES[oppositeFace];
    const farCells = cells.map(([x, y]) => [wrapRingColumn(x + 18), y]);
    for (const [x, y] of farCells) {
      if (y >= 0 && y < ROWS && cellAt(G.ring, x, y) === null) drilled.push([x, y]);
    }
    lockCells(G.ring, drilled, oppositeWorld, locked.t);
    pushFx(G, 'prism_drill', {
      face: oppositeFace,
      world: oppositeWorld,
      cells: cloneCells(drilled),
    });
  }

  pushFx(G, 'lock', {
    face,
    world,
    cells: cloneCells(cells),
    piece: locked,
    prism: locked.prism === true,
    phase: G.phase,
  });
  G.stats.pieces += 1;
  G.piecesSinceFester += 1;
  G.piece = null;
  resetPieceTimers(G);

  if (anyAbove(cells)) {
    endGame(G, face);
    return;
  }

  resolveLines(G, cells.map(([, y]) => y));
  if (G.status !== 'playing') return;

  if (festerCheck(G)) {
    endGame(G, G.overFace == null ? face : G.overFace);
    return;
  }
  if (G.status !== 'playing') return;

  G.canHold = true;
  spawnNext(G);
}

function hardDrop(G) {
  if (!canControlPiece(G)) return;
  const dropped = clonePiece(G.piece);
  let distance = 0;
  while (true) {
    const next = clonePiece(dropped);
    next.y += 1;
    if (collides(G.ring, cellsOf(next))) break;
    dropped.y += 1;
    distance += 1;
  }
  G.piece = dropped;
  pushFx(G, 'hard', {
    face: G.face,
    world: FACES[G.face],
    distance,
    cells: cloneCells(cellsOf(dropped)),
    phase: G.phase,
  });
  lockCurrentPiece(G);
}

function hold(G) {
  if (!canControlPiece(G) || !G.canHold) return;
  const outgoing = { t: G.piece.t, prism: G.piece.prism === true };
  const heldT = typeof G.holdT === 'string' ? G.holdT : null;
  const incoming = heldT === null
    ? nextQueueEntry(G)
    : { t: heldT, prism: G.holdPrism === true };
  setHold(G, outgoing);
  G.canHold = false;
  pushFx(G, 'hold', {
    face: G.face,
    world: FACES[G.face],
    holdT: G.holdT,
    incoming: incoming.t,
    phase: G.phase,
  });
  spawnSpecific(G, incoming);
}

function applyAction(G, action) {
  switch (action) {
    case 'left':
      moveHorizontal(G, -1);
      break;
    case 'right':
      moveHorizontal(G, 1);
      break;
    case 'rotcw':
      rotatePiece(G, 1);
      break;
    case 'rotccw':
      rotatePiece(G, -1);
      break;
    case 'soft_on':
    case 'soft':
      G.softDrop = true;
      break;
    case 'soft_off':
      G.softDrop = false;
      break;
    case 'hard':
      hardDrop(G);
      break;
    case 'hold':
      hold(G);
      break;
    case 'flip_left':
      beginFold(G, -1);
      break;
    case 'flip_right':
      beginFold(G, 1);
      break;
    case 'pause':
      G.status = 'paused';
      break;
    default:
      break;
  }
}

function currentGravity(G) {
  return Math.max(1, gravityMs(G.phase) / (G.softDrop ? SOFT_DROP_FACTOR : 1));
}

function consumeGravity(G) {
  const interval = currentGravity(G);
  G.gravMs -= interval;
  if (G.gravMs < EPSILON) G.gravMs = 0;
  const falling = clonePiece(G.piece);
  falling.y += 1;
  if (!collides(G.ring, cellsOf(falling))) {
    G.piece = falling;
    G.lockMs = 0;
    maybeAutoFollow(G);
  }
}

function advancePlaying(G, dtMs) {
  let remaining = Number.isFinite(Number(dtMs)) ? Math.max(0, Number(dtMs)) : 0;
  let steps = 0;
  while (canControlPiece(G) && steps < MAX_TIME_STEPS) {
    steps += 1;
    const grounded = isGrounded(G);
    const interval = currentGravity(G);
    const untilGravity = Math.max(0, interval - G.gravMs);
    const untilLock = grounded ? Math.max(0, LOCK_DELAY_MS - G.lockMs) : Infinity;

    if (grounded && untilLock <= EPSILON) {
      lockCurrentPiece(G);
      continue;
    }
    if (untilGravity <= EPSILON) {
      consumeGravity(G);
      if (G.status !== 'playing') break;
      continue;
    }
    if (remaining <= EPSILON) break;

    const slice = Math.min(remaining, untilGravity, untilLock);
    G.gravMs += slice;
    if (grounded) G.lockMs += slice;
    else G.lockMs = 0;
    remaining -= slice;
  }
}

function resetRunState(G) {
  G.ring = createRing();
  G.face = 0;
  G.piece = null;
  G.queue = [];
  G.bagIndex = 0;
  G.rngState = createRngState();
  G.holdT = null;
  G.holdPrism = false;
  G.canHold = true;
  G.score = 0;
  G.lines = 0;
  G.phase = 1;
  G.combo = -1;
  G.b2b = false;
  G.piecesSinceFester = 0;
  G.festerCursor = 0;
  G.seam = { active: false, cleared: [false, false, false, false] };
  G.status = 'playing';
  G.fold = null;
  G.overFace = null;
  G.lastFoldAt = -1e9;
  G.timeMs = 0;
  G.gravMs = 0;
  G.lockMs = 0;
  G.lockResets = 0;
  G.stats = { pieces: 0, folds: 0, tetris: 0, rings: 0, maxCombo: 0 };
  G.softDrop = false;
  if (!Array.isArray(G.fx)) G.fx = [];
  G.fx.length = 0;
  ensureQueue(G);
  spawnNext(G);
}

export function createGame() {
  const G = {
    ring: createRing(),
    face: 0,
    fold: null,
    piece: null,
    queue: [],
    holdT: null,
    holdPrism: false,
    canHold: true,
    score: 0,
    lines: 0,
    phase: 1,
    combo: -1,
    b2b: false,
    piecesSinceFester: 0,
    festerCursor: 0,
    seam: { active: false, cleared: [false, false, false, false] },
    status: 'title',
    overFace: null,
    lastFoldAt: -1e9,
    timeMs: 0,
    gravMs: 0,
    lockMs: 0,
    lockResets: 0,
    stats: { pieces: 0, folds: 0, tetris: 0, rings: 0, maxCombo: 0 },
    fx: [],
    bagIndex: 0,
    rngState: createRngState(),
    softDrop: false,
  };
  ensureQueue(G);
  return G;
}

export function startRun(G) {
  if (!G || typeof G !== 'object') return G;
  resetRunState(G);
  return G;
}

/** Continue from the victory action as a fresh, fully reset cube run. */
export function continueRun(G) {
  if (!G || G.status !== 'won') return G;
  resetRunState(G);
  return G;
}

export function update(G, dtMs, events = []) {
  if (!G || !Array.isArray(events)) return;

  if (G.status === 'paused') {
    if (events.includes('pause')) G.status = 'playing';
    return;
  }
  if (G.status !== 'playing' && G.status !== 'folding') return;

  if (G.status === 'folding') return;
  const dt = Number.isFinite(Number(dtMs)) ? Math.max(0, Number(dtMs)) : 0;
  G.timeMs += dt;

  for (const action of events) {
    if (G.status !== 'playing') break;
    applyAction(G, action);
  }
  if (G.status === 'playing') advancePlaying(G, dt);
}

export function finishFold(G) {
  if (!G || G.status !== 'folding' || !G.fold) return false;
  const fold = G.fold;
  G.face = fold.to;
  G.lastFoldAt = G.timeMs;
  G.fold = null;
  G.status = 'playing';
  pushFx(G, 'fold_done', {
    face: G.face,
    world: FACES[G.face],
    from: fold.from,
    to: fold.to,
    dir: fold.dir,
  });
  return true;
}
