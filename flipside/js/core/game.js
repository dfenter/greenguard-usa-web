import {
  B2B_MULT,
  CLEARS_PER_CHARGE,
  COMBO_SCORE,
  FOLDOVER_MULT,
  FOLDOVER_WINDOW_MS,
  FLIP_MAX,
  FLIP_START,
  FLIP3D_MS,
  FLIP3D_REFILL_MS,
  LOCK_DELAY_MS,
  LOCK_RESETS_MAX,
  METER_SEGMENTS,
  QUEUE_LEN,
  SCORE_LINES,
  SOFT_DROP_FACTOR,
  other,
} from '../config.js';
import {
  cellsOf,
  createRngState,
  makeBag,
  rotate,
  spawnPiece,
} from './pieces.js';
import {
  anyAbove,
  clearRows,
  collides,
  createBoard,
  fullRows,
  lockCells,
  lockPrismFar,
} from './board.js';
import {
  checkSeamWin,
  festerCheck,
  gravityMs,
  onLinesCleared,
} from './progression.js';

const EPSILON = 1e-7;
const MAX_TIME_STEPS = 128;
const FLIP_METER_SEGMENT_MS = FLIP3D_MS / METER_SEGMENTS;

function cloneCell(cell) {
  return cell ? { pol: cell.pol, t: cell.t } : null;
}

function clonePiece(piece) {
  return piece
    ? { t: piece.t, x: piece.x, y: piece.y, rot: piece.rot, prism: !!piece.prism }
    : null;
}

function cloneCells(cells) {
  return cells.map(([x, y]) => [x, y]);
}

function pushFx(G, k, detail = {}) {
  G.fx.push({ k, ...detail });
}

function queueEntry(value) {
  if (typeof value === 'string') return { t: value, prism: false };
  return { t: value.t, prism: value.prism === true };
}

// The HUD renders holdT as a piece type string. Prism metadata lives beside
// it so the hold slot can round-trip a prism without changing that contract.
function setHold(G, entry) {
  const normalized = entry && typeof entry.t === 'string' ? entry : null;
  G.holdT = normalized ? normalized.t : null;
  G.holdPrism = Boolean(normalized && normalized.prism === true);
}

function appendBag(G) {
  const bag = makeBag(G.bagIndex, G.rngState);
  G.bagIndex += 1;
  for (const entry of bag) G.queue.push(queueEntry(entry));
}

function ensureQueue(G) {
  // Keep one complete upcoming bag beyond the visible preview. This makes the
  // active draw independent of the preview length and preserves bag order.
  while (G.queue.length < QUEUE_LEN + 1) appendBag(G);
}

function nextQueueEntry(G) {
  ensureQueue(G);
  const entry = queueEntry(G.queue.shift());
  ensureQueue(G);
  return entry;
}

function boardFor(G, world = activeWorld(G)) {
  return G.boards[world];
}

function activeWorld(G) {
  if (G && G.status === 'flip3d' && G.flip3d &&
      (G.flip3d.lane === 'sun' || G.flip3d.lane === 'ink')) {
    return G.flip3d.lane;
  }
  return G.world;
}

function canControlPiece(G) {
  return G && (G.status === 'playing' ||
    (G.status === 'flip3d' && G.flip3d && G.flip3d.phase === 'held'));
}

function clampMeter(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(FLIP3D_MS, numeric));
}

function refillMeter(G, dtMs) {
  const dt = Number.isFinite(Number(dtMs)) ? Math.max(0, Number(dtMs)) : 0;
  const refill = FLIP3D_MS / FLIP3D_REFILL_MS;
  G.meterMs = clampMeter((G.meterMs == null ? 0 : G.meterMs) + dt * refill);
}

function pieceFits(G, piece, world = activeWorld(G)) {
  return !collides(boardFor(G, world), cellsOf(piece));
}

function isGrounded(G) {
  if (!G.piece) return false;
  const falling = clonePiece(G.piece);
  falling.y += 1;
  return collides(boardFor(G, activeWorld(G)), cellsOf(falling));
}

function resetPieceTimers(G) {
  G.gravMs = 0;
  G.lockMs = 0;
  G.lockResets = 0;
}

function endGame(G, side = activeWorld(G)) {
  if (G.status === 'gameover' || G.status === 'won') return;
  G.status = 'gameover';
  G.overSide = side;
  pushFx(G, 'gameover', { world: side, overSide: side, phase: G.phase });
}

function endWin(G, world) {
  if (G.status === 'won') return;
  G.status = 'won';
  G.seam.active = false;
  pushFx(G, 'seamwin', { world, phase: G.phase });
}

function spawnSpecific(G, entry) {
  const normalized = queueEntry(entry);
  const piece = spawnPiece(normalized.t, normalized.prism);
  G.piece = piece;
  resetPieceTimers(G);

  if (!piece || !pieceFits(G, piece)) {
    endGame(G, activeWorld(G));
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

function moveHorizontal(G, dx) {
  if (!G.piece) return false;
  const candidate = clonePiece(G.piece);
  candidate.x += dx;
  if (collides(boardFor(G), cellsOf(candidate))) return false;

  G.piece = candidate;
  resetLockAfterAction(G);
  pushFx(G, 'move', {
    world: G.world,
    piece: clonePiece(candidate),
    cells: cloneCells(cellsOf(candidate)),
  });
  return true;
}

function rotatePiece(G, dir) {
  if (!G.piece) return false;
  const turned = rotate(
    G.piece,
    dir,
    (candidateCells) => collides(boardFor(G), candidateCells),
  );
  if (!turned) return false;

  G.piece = turned;
  resetLockAfterAction(G);
  pushFx(G, 'rotate', {
    world: G.world,
    dir,
    piece: clonePiece(turned),
    cells: cloneCells(cellsOf(turned)),
  });
  return true;
}

function awardCharges(G, cleared) {
  const before = G.flipCharge;
  const carried = G.clearsTowardCharge;
  G.clearsTowardCharge += cleared;

  let earned = Math.floor(G.clearsTowardCharge / CLEARS_PER_CHARGE);
  G.clearsTowardCharge %= CLEARS_PER_CHARGE;
  if (cleared === 4) earned = Math.max(earned, 2);

  G.flipCharge = Math.min(FLIP_MAX, G.flipCharge + earned);
  const amount = G.flipCharge - before;
  if (amount > 0) {
    pushFx(G, 'charge', {
      amount,
      value: G.flipCharge,
      clears: cleared,
      carry: carried,
      phase: G.phase,
    });
  }
}

function garbageRows(board, amount) {
  const rows = [];
  for (let y = board.grid.length - 1; y >= 0 && rows.length < amount; y -= 1) {
    const row = board.grid[y];
    if (row.some((cell) => cell && cell.t === 'G')) rows.push(y);
  }
  return rows.sort((a, b) => a - b);
}

function echoClear(G, sourceWorld, count) {
  if (count < 2) return;
  const farWorld = other(sourceWorld);
  const farBoard = boardFor(G, farWorld);
  const rows = garbageRows(farBoard, count - 1);
  if (!rows.length) return;

  clearRows(farBoard, rows);
  pushFx(G, 'echo', {
    world: sourceWorld,
    farWorld,
    rows,
    count: rows.length,
    phase: G.phase,
  });
}

function collectLineResult(G, world) {
  const board = boardFor(G, world);
  const rows = fullRows(board);
  return {
    world,
    board,
    rows,
    count: rows.length,
    rowCells: rows.map((y) => board.grid[y].map(cloneCell)),
    seamWin: rows.length > 0 && checkSeamWin(G, rows, world),
  };
}

/**
 * Resolve every board touched by one lock as one shared scoring event.
 *
 * Prism rows are collected before any board is changed. This is important:
 * echo clearing belongs after scoring and must not erase full rows on the far
 * side before they are counted. Combo, charges, phase progression, and the
 * shared score bonus are also applied once for the lock, not once per world.
 */
function resolveLineBatch(G, worlds) {
  const results = worlds.map((world) => collectLineResult(G, world));
  const active = results.filter((result) => result.count > 0);
  const total = active.reduce((sum, result) => sum + result.count, 0);
  const playWorld = activeWorld(G);

  if (total === 0) {
    G.combo = -1;
    return 0;
  }

  const phaseAtClear = G.phase;
  const hasTetris = active.some((result) => result.count === 4);
  let points = active.reduce(
    (sum, result) => sum + (SCORE_LINES[result.count] || 0),
    0,
  ) * phaseAtClear;
  if (hasTetris && G.b2b) points *= B2B_MULT;

  G.combo += 1;
  points += COMBO_SCORE * G.combo * phaseAtClear;

  const foldover = G.timeMs - G.lastFlipAt <= FOLDOVER_WINDOW_MS;
  if (foldover) {
    points *= FOLDOVER_MULT;
    pushFx(G, 'foldover', {
      world: playWorld,
      worlds: active.map((result) => result.world),
      rows: active.flatMap((result) => result.rows),
      count: total,
      phase: phaseAtClear,
      multiplier: FOLDOVER_MULT,
    });
  }

  const awardedScore = Math.round(points);
  G.score += awardedScore;
  G.b2b = hasTetris;
  G.stats.tetris += active.filter((result) => result.count === 4).length;
  if (G.combo > G.stats.maxCombo) G.stats.maxCombo = G.combo;

  // All rows were captured above; only now may either board be collapsed.
  for (const result of active) {
    clearRows(result.board, result.rows);
    pushFx(G, 'clear', {
      world: result.world,
      rows: result.rows.slice(),
      cells: result.rowCells,
      count: result.count,
      score: Math.round((SCORE_LINES[result.count] || 0) * phaseAtClear),
      sharedScore: awardedScore,
      phase: phaseAtClear,
      combo: G.combo,
      b2b: result.count === 4 && G.b2b,
    });
    if (result.count === 4) {
      pushFx(G, 'tetris', {
        world: result.world,
        rows: result.rows.slice(),
        count: result.count,
        b2b: G.b2b,
      });
    }
  }

  awardCharges(G, total);
  const sunWouldTopOut = G.boards.sun.grid[0].some((cell) => cell !== null);
  const inkWouldTopOut = G.boards.ink.grid[0].some((cell) => cell !== null);
  const progressionTopOut = onLinesCleared(G, total);
  if (progressionTopOut) {
    endGame(
      G,
      sunWouldTopOut ? 'sun' : (inkWouldTopOut ? 'ink' : playWorld),
    );
    return total;
  }

  // Echo clears happen only after both sides have scored and collapsed.
  for (const result of active) echoClear(G, result.world, result.count);

  if (results.some((result) => result.seamWin)) endWin(G, playWorld);
  return total;
}

function lockCurrentPiece(G) {
  if (!G.piece || !canControlPiece(G)) return;

  const locked = clonePiece(G.piece);
  const cells = cellsOf(locked);
  const world = activeWorld(G);
  const farWorld = other(world);
  const wasPrism = locked.prism === true;

  lockCells(boardFor(G, world), cells, world, locked.t);
  if (wasPrism) lockPrismFar(boardFor(G, farWorld), cells, locked.t);

  pushFx(G, 'lock', {
    world,
    cells: cloneCells(cells),
    piece: locked,
    prism: wasPrism,
    phase: G.phase,
  });

  G.stats.pieces += 1;
  G.piecesSinceFester += 1;
  G.piece = null;
  resetPieceTimers(G);

  // Cells above the paper are deliberately checked after locking: board.js
  // skips those cells, while the caller owns the top-out decision.
  if (anyAbove(cells)) {
    endGame(G, world);
    return;
  }

  const worlds = wasPrism ? [world, farWorld] : [world];
  resolveLineBatch(G, worlds);
  if (!canControlPiece(G)) return;

  const originalWorld = G.world;
  if (G.status === 'flip3d') G.world = world;
  let festerResult;
  try {
    festerResult = festerCheck(G);
  } finally {
    G.world = originalWorld;
  }
  if (festerResult === true) {
    endGame(G, G.overSide || farWorld);
    return;
  }
  if (festerResult && typeof festerResult === 'object' && festerResult.topedOut) {
    endGame(G, festerResult.world || festerResult.side || farWorld);
    return;
  }
  if (G.status === 'gameover') return;

  // Hold is once per falling piece, not once per run. It becomes available
  // again only after the current piece has been committed to the board.
  G.canHold = true;
  spawnNext(G);
}

function hardDrop(G) {
  if (!G.piece || !canControlPiece(G)) return;
  const dropped = clonePiece(G.piece);
  let distance = 0;
  while (true) {
    const next = clonePiece(dropped);
    next.y += 1;
    if (collides(boardFor(G), cellsOf(next))) break;
    dropped.y += 1;
    distance += 1;
  }
  G.piece = dropped;
  pushFx(G, 'hard', {
    world: activeWorld(G),
    distance,
    cells: cloneCells(cellsOf(dropped)),
    phase: G.phase,
  });
  lockCurrentPiece(G);
}

function hold(G) {
  if (!G.piece || !G.canHold) return;

  const outgoing = { t: G.piece.t, prism: G.piece.prism === true };
  const heldT = typeof G.holdT === 'string' ? G.holdT : null;
  const heldPrism = heldT !== null && G.holdPrism === true;
  let incoming;
  if (heldT === null) {
    setHold(G, outgoing);
    incoming = nextQueueEntry(G);
  } else {
    incoming = { t: heldT, prism: heldPrism };
    setHold(G, outgoing);
  }

  G.canHold = false;
  pushFx(G, 'hold', {
    world: G.world,
    holdT: G.holdT,
    incoming: incoming.t,
    phase: G.phase,
  });
  spawnSpecific(G, incoming);
}

function requestFlipExit(G) {
  const f3 = G && G.flip3d;
  if (!G || G.status !== 'flip3d' || !f3 || f3.phase !== 'held') return false;
  if (f3.exiting) return true;
  f3.phase = 'exit';
  f3.exiting = true;
  f3.changed = f3.lane !== G.world;
  return true;
}

function beginFlip(G) {
  if (!G || G.flipCharge <= 0 || G.status !== 'playing') return false;
  const meterMs = clampMeter(G.meterMs == null ? FLIP3D_MS : G.meterMs);
  if (meterMs + EPSILON < FLIP_METER_SEGMENT_MS) return false;

  G.meterMs = meterMs;
  G.status = 'flip3d';
  G.flip3d = {
    phase: 'enter',
    lane: G.world,
    meterMs,
    exiting: false,
    changed: false,
  };
  G.flipCharge = Math.max(0, G.flipCharge - 1);
  G.stats.flips += 1;
  pushFx(G, 'flip3d_enter', {
    world: G.world,
    from: G.world,
    lane: G.world,
    meterMs,
    phase: G.phase,
  });
  pushFx(G, 'charge', {
    amount: -1,
    value: G.flipCharge,
    world: G.world,
    phase: G.phase,
  });
  return true;
}

function switchFlipLane(G) {
  const f3 = G.flip3d;
  const from = f3.lane;
  const destination = other(from);
  const moved = clonePiece(G.piece);
  let nudge = 0;
  let fits = false;

  for (; nudge <= 2; nudge += 1) {
    moved.y = G.piece.y - nudge;
    if (!collides(boardFor(G, destination), cellsOf(moved))) {
      fits = true;
      break;
    }
  }

  if (!fits) {
    pushFx(G, 'flip3d_blocked', {
      world: from,
      from,
      to: destination,
      lane: from,
      piece: clonePiece(G.piece),
      cells: cloneCells(cellsOf(G.piece)),
      phase: G.phase,
    });
    return false;
  }

  f3.lane = destination;
  G.piece = moved;
  resetLockAfterAction(G);
  pushFx(G, 'flip3d_lane', {
    world: destination,
    from,
    to: destination,
    lane: destination,
    nudge,
    piece: clonePiece(moved),
    cells: cloneCells(cellsOf(moved)),
    phase: G.phase,
  });
  return true;
}

function applyFlip3dAction(G, action) {
  const f3 = G.flip3d;
  if (!f3) return;
  if (action === 'pause') {
    G.paused3d = true;
    G.status = 'paused';
    return;
  }
  if (f3.phase !== 'held') return;

  switch (action) {
    case 'left':
    case 'right':
      switchFlipLane(G);
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
      if (G.status === 'flip3d') requestFlipExit(G);
      break;
    case 'flip':
      requestFlipExit(G);
      break;
    default:
      // Rotation and hold are deliberately unavailable in the side view.
      break;
  }
}

function applyAction(G, action) {
  if (G.status === 'flip3d') {
    applyFlip3dAction(G, action);
    return;
  }
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
    case 'flip':
      beginFlip(G);
      break;
    case 'pause':
      G.paused3d = false;
      G.status = 'paused';
      break;
    default:
      break;
  }
}

function currentGravity(G) {
  const base = gravityMs(G.phase);
  return Math.max(1, G.softDrop ? base / SOFT_DROP_FACTOR : base);
}

function consumeGravity(G) {
  const interval = currentGravity(G);
  if (G.gravMs + EPSILON < interval) return false;
  G.gravMs -= interval;
  if (G.gravMs < EPSILON) G.gravMs = 0;

  const falling = clonePiece(G.piece);
  falling.y += 1;
  if (!collides(boardFor(G), cellsOf(falling))) {
    G.piece = falling;
    G.lockMs = 0;
  }
  // A grounded gravity tick leaves lockMs running toward the lock delay.
  return true;
}

function advancePlaying(G, dtMs) {
  const numericDt = Number(dtMs);
  let remaining = Number.isFinite(numericDt) ? Math.max(0, numericDt) : 0;

  // MAX_TIME_STEPS is a per-pass safety budget, not permission to throw away
  // elapsed time. A large update starts another pass with its remainder.
  while (remaining > EPSILON && canControlPiece(G) && G.piece) {
    let steps = 0;
    while (
      remaining > EPSILON &&
      canControlPiece(G) &&
      G.piece &&
      steps < MAX_TIME_STEPS
    ) {
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
        continue;
      }

      const slice = Math.min(remaining, untilGravity, untilLock);
      G.gravMs += slice;
      if (grounded) G.lockMs += slice;
      else G.lockMs = 0;
      remaining -= slice;
    }
  }

  // A zero-duration update can still be used to service a timer that was
  // exactly due after an input action.
  let serviceSteps = 0;
  while (
    canControlPiece(G) &&
    G.piece &&
    serviceSteps < MAX_TIME_STEPS
  ) {
    const grounded = isGrounded(G);
    if (grounded && G.lockMs + EPSILON >= LOCK_DELAY_MS) {
      serviceSteps += 1;
      lockCurrentPiece(G);
      continue;
    }
    if (G.gravMs + EPSILON >= currentGravity(G)) {
      serviceSteps += 1;
      consumeGravity(G);
      continue;
    }
    break;
  }
}

function resetRunState(G) {
  G.boards = { sun: createBoard(), ink: createBoard() };
  G.world = 'sun';
  G.piece = null;
  G.queue = [];
  G.bagIndex = 0;
  // Bag and progression randomness belong to this run, never to the module
  // global stream shared by unrelated games (such as attract mode).
  G.rngState = createRngState();
  // holdT intentionally remains the HUD-friendly type string; holdPrism is
  // its parallel flag and must always describe that held string.
  G.holdT = null;
  G.holdPrism = false;
  G.canHold = true;
  G.score = 0;
  G.lines = 0;
  G.phase = 1;
  G.combo = -1;
  G.b2b = false;
  G.flipCharge = FLIP_START;
  G.clearsTowardCharge = 0;
  G.piecesSinceFester = 0;
  G.seam = { sun: false, ink: false, active: false };
  G.overSide = null;
  G.lastFlipAt = -1e9;
  G.timeMs = 0;
  G.meterMs = FLIP3D_MS;
  G.gravMs = 0;
  G.lockMs = 0;
  G.lockResets = 0;
  G.stats = { pieces: 0, flips: 0, tetris: 0, maxCombo: 0 };
  G.fx.length = 0;
  G.softDrop = false;
  G.paused3d = false;
  G.flip3d = null;

  ensureQueue(G);
  G.status = 'playing';
  spawnNext(G);
}

export function createGame() {
  const G = {
    boards: { sun: createBoard(), ink: createBoard() },
    world: 'sun',
    piece: null,
    queue: [],
    holdT: null,
    canHold: true,
    score: 0,
    lines: 0,
    phase: 1,
    combo: -1,
    b2b: false,
    flipCharge: FLIP_START,
    clearsTowardCharge: 0,
    piecesSinceFester: 0,
    seam: { sun: false, ink: false, active: false },
    status: 'title',
    overSide: null,
    lastFlipAt: -1e9,
    timeMs: 0,
    meterMs: FLIP3D_MS,
    gravMs: 0,
    lockMs: 0,
    lockResets: 0,
    stats: { pieces: 0, flips: 0, tetris: 0, maxCombo: 0 },
    fx: [],
    bagIndex: 0,
    rngState: createRngState(),
    holdPrism: false,
    softDrop: false,
    paused3d: false,
    flip3d: null,
  };
  ensureQueue(G);
  return G;
}

export function startRun(G) {
  resetRunState(G);
  return G;
}

/** Resume an ended seam run without resetting its boards, score, or stats. */
export function continueRun(G) {
  if (!G || G.status !== 'won') return G;

  G.status = 'playing';
  G.overSide = null;
  G.seam.active = false;
  G.phase = Math.max(9, Number.isFinite(G.phase) ? G.phase : 9);
  G.softDrop = false;
  G.canHold = true;
  resetPieceTimers(G);
  if (!G.piece) spawnNext(G);
  return G;
}

export function update(G, dtMs, events = []) {
  if (!G || !Array.isArray(events)) return;

  if (G.status === 'paused') {
    for (const action of events) {
      if (action === 'pause') {
        G.status = G.paused3d && G.flip3d ? 'flip3d' : 'playing';
        G.paused3d = false;
        break;
      }
    }
    return;
  }

  const in3d = G.status === 'flip3d' && G.flip3d;
  if (G.status !== 'playing' && !in3d) return;

  const numericDt = Number(dtMs);
  const dt = Number.isFinite(numericDt) ? Math.max(0, numericDt) : 0;
  G.timeMs += dt;

  if (G.status === 'playing') refillMeter(G, dt);

  for (const action of events) {
    if (G.status !== 'playing' && G.status !== 'flip3d') break;
    applyAction(G, action);
  }

  if (G.status === 'playing') {
    advancePlaying(G, dt);
  } else if (G.status === 'flip3d' && G.flip3d && G.flip3d.phase === 'held') {
    const before = clampMeter(G.flip3d.meterMs);
    const after = clampMeter(before - dt);
    G.flip3d.meterMs = after;
    G.meterMs = after;
    if (before > FLIP_METER_SEGMENT_MS && after <= FLIP_METER_SEGMENT_MS) {
      pushFx(G, 'meter_low', {
        world: G.flip3d.lane,
        lane: G.flip3d.lane,
        meterMs: after,
        phase: G.phase,
      });
    }
    if (after <= EPSILON) {
      G.flip3d.meterMs = 0;
      G.meterMs = 0;
      requestFlipExit(G);
    }
    if (G.status === 'flip3d' && G.flip3d.phase === 'held') advancePlaying(G, dt);
  }
}

export function setFlipPhase(G, phase) {
  if (!G || G.status !== 'flip3d' || !G.flip3d) return false;
  if (phase !== 'enter' && phase !== 'held' && phase !== 'exit') return false;
  if (phase === 'exit') {
    requestFlipExit(G);
    return G.flip3d.phase === 'exit';
  }
  if (G.flip3d.exiting) return false;
  G.flip3d.phase = phase;
  return true;
}

export function exitFlip3d(G) {
  if (!G || G.status !== 'flip3d' || !G.flip3d ||
      G.flip3d.phase !== 'exit' || !G.flip3d.exiting) return false;

  const f3 = G.flip3d;
  const from = G.world;
  const destination = f3.lane;
  const changed = destination !== from;
  G.world = destination;
  G.meterMs = clampMeter(f3.meterMs);
  if (changed) G.lastFlipAt = G.timeMs;
  G.status = 'playing';
  pushFx(G, 'flip3d_exit', {
    world: destination,
    from,
    to: destination,
    lane: destination,
    changed,
    meterMs: G.meterMs,
    phase: G.phase,
  });
  G.flip3d = null;
  return true;
}
