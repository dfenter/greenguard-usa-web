import { FACES, FACE_W, RING_COLS, ROWS, ringCol } from '../config.js?v=43ddf0f';

const WALL = 'WALL';

function wrapRingColumn(rc) {
  const value = Number(rc);
  if (!Number.isFinite(value)) return 0;
  return ((Math.trunc(value) % RING_COLS) + RING_COLS) % RING_COLS;
}

function validRow(y) {
  return Number.isInteger(y) && y >= 0 && y < ROWS;
}

function faceIndex(face) {
  if (Number.isInteger(face)) return ((face % FACES.length) + FACES.length) % FACES.length;
  const index = FACES.indexOf(face);
  return index >= 0 ? index : 0;
}

function cellFrom(face, t) {
  return { w: FACES[faceIndex(face)], t };
}

/** Create the one continuous 36-column, four-face ring. */
export function createRing() {
  return {
    grid: Array.from({ length: ROWS }, () => Array(RING_COLS).fill(null)),
  };
}

/** Return the physical ring column for a face-local column. */
export { ringCol };

/** Return the ten physical columns visible on one face, including both seams. */
export function faceWindow(face) {
  const f = faceIndex(face);
  return Array.from({ length: FACE_W }, (_, c) => ringCol(f, c));
}

/** Read ring-space cells: horizontal coordinates wrap; vertical walls do not. */
export function cellAt(ring, rc, y) {
  if (!ring || !Array.isArray(ring.grid)) return WALL;
  if (!Number.isInteger(y) || y >= ROWS) return WALL;
  if (y < 0) return null;
  const row = ring.grid[y];
  if (!Array.isArray(row)) return WALL;
  return row[wrapRingColumn(rc)] ?? null;
}

export function collides(ring, cells) {
  if (!Array.isArray(cells)) return true;
  return cells.some(([x, y]) => cellAt(ring, x, y) !== null);
}

/** Lock cells in ring space. Cells above the paper are ignored by design. */
export function lockCells(ring, cells, w, t) {
  if (!ring || !Array.isArray(ring.grid) || !Array.isArray(cells)) return 0;
  let locked = 0;
  for (const [x, y] of cells) {
    if (!validRow(y)) continue;
    ring.grid[y][wrapRingColumn(x)] = {
      w: typeof w === 'number' ? FACES[faceIndex(w)] : (w || FACES[0]),
      t,
    };
    locked += 1;
  }
  return locked;
}

export function anyAbove(cells) {
  return Array.isArray(cells) && cells.some(([, y]) => y < 0);
}

export function faceRowFull(ring, face, y) {
  if (!validRow(y)) return false;
  return faceWindow(face).every((rc) => cellAt(ring, rc, y) !== null);
}

export function ringRowFull(ring, y) {
  if (!validRow(y)) return false;
  return Array.from({ length: RING_COLS }, (_, rc) => rc)
    .every((rc) => cellAt(ring, rc, y) !== null);
}

function collapseColumns(ring, columns, removedRowsByColumn) {
  for (const rc of columns) {
    const removed = removedRowsByColumn.get(rc) || new Set();
    const kept = [];
    for (let y = ROWS - 1; y >= 0; y -= 1) {
      if (!removed.has(y)) kept.push(ring.grid[y][rc]);
    }
    for (let y = ROWS - 1, i = 0; y >= 0; y -= 1, i += 1) {
      ring.grid[y][rc] = i < kept.length ? kept[i] : null;
    }
  }
}

/**
 * Clear the physical union of face-row windows and collapse each touched
 * column independently. Shared edge columns therefore clear only once.
 */
export function clearFaceRows(ring, marks) {
  if (!ring || !Array.isArray(ring.grid) || !Array.isArray(marks)) return 0;

  const removedRowsByColumn = new Map();
  let cleared = 0;
  for (const mark of marks) {
    if (!mark || !validRow(mark.y)) continue;
    for (const rc of faceWindow(mark.face)) {
      let rows = removedRowsByColumn.get(rc);
      if (!rows) {
        rows = new Set();
        removedRowsByColumn.set(rc, rows);
      }
      if (!rows.has(mark.y)) {
        rows.add(mark.y);
        if (ring.grid[mark.y][rc] !== null) cleared += 1;
      }
    }
  }

  collapseColumns(ring, removedRowsByColumn.keys(), removedRowsByColumn);
  return cleared;
}

/** Clear one complete ring row and collapse all 36 columns independently. */
export function clearRingRow(ring, y) {
  if (!ring || !validRow(y)) return 0;
  const rows = new Map();
  for (let rc = 0; rc < RING_COLS; rc += 1) rows.set(rc, new Set([y]));
  let cleared = 0;
  for (let rc = 0; rc < RING_COLS; rc += 1) {
    if (ring.grid[y][rc] !== null) cleared += 1;
  }
  collapseColumns(ring, rows.keys(), rows);
  return cleared;
}

/**
 * Push one face's ten columns upward and append a one-hole row. Shared edge
 * columns are deliberately moved too: a face garbage row changes both
 * adjacent face stacks because the ring has only one physical column there.
 */
export function addGarbage(ring, face, hole, seam = false) {
  if (!ring || !Array.isArray(ring.grid)) return false;
  const f = faceIndex(face);
  const columns = faceWindow(f);
  const holeColumn = Math.max(0, Math.min(FACE_W - 1, Math.trunc(Number(hole) || 0)));
  let toppedOut = false;

  for (const rc of columns) {
    if (ring.grid[0][rc] !== null) toppedOut = true;
    for (let y = 0; y < ROWS - 1; y += 1) ring.grid[y][rc] = ring.grid[y + 1][rc];
    ring.grid[ROWS - 1][rc] = holeColumn === columns.indexOf(rc)
      ? null
      : cellFrom(f, seam ? 'SEAM' : 'G');
  }
  return toppedOut;
}

export function columnHeights(ring) {
  return Array.from({ length: RING_COLS }, (_, rc) => {
    for (let y = 0; y < ROWS; y += 1) {
      if (cellAt(ring, rc, y) !== null) return ROWS - y;
    }
    return 0;
  });
}

/** Stack danger is the tallest column in the requested face window. */
export function faceDanger(ring, face) {
  const heights = columnHeights(ring);
  let tallest = 0;
  for (const rc of faceWindow(face)) tallest = Math.max(tallest, heights[rc] || 0);
  return Math.max(0, Math.min(1, tallest / ROWS));
}

