import { COLS, ROWS } from '../config.js';

const WALL = 'WALL';

/**
 * Create an empty playfield. Each row is independent so callers can safely
 * mutate cells without affecting any other row.
 */
export function createBoard() {
  return {
    grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
  };
}

export function inBounds(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) &&
    x >= 0 && x < COLS && y >= 0 && y < ROWS;
}

/**
 * Read a board cell using Tetris spawn-space semantics: rows above the board
 * are empty, while horizontal and bottom overflow are solid walls.
 */
export function cellAt(board, x, y) {
  if (!Number.isInteger(x) || x < 0 || x >= COLS) return WALL;
  if (!Number.isInteger(y) || y >= ROWS) return WALL;
  if (y < 0) return null;
  return board.grid[y][x];
}

export function collides(board, cells) {
  for (const [x, y] of cells) {
    if (cellAt(board, x, y) !== null) return true;
  }
  return false;
}

export function lockCells(board, cells, pol, t) {
  for (const [x, y] of cells) {
    if (y < 0 || !inBounds(x, y)) continue;
    board.grid[y][x] = { pol, t };
  }
}

export function lockPrismFar(board, cells, t) {
  for (const [x, y] of cells) {
    if (y < 0 || !inBounds(x, y)) continue;
    if (board.grid[y][x] === null) board.grid[y][x] = { pol: 'both', t };
  }
}

export function fullRows(board) {
  const rows = [];
  for (let y = 0; y < ROWS; y += 1) {
    if (board.grid[y].every(cell => cell !== null)) rows.push(y);
  }
  return rows;
}

export function clearRows(board, ys) {
  const rowsToClear = new Set();
  for (const y of ys) {
    if (Number.isInteger(y) && y >= 0 && y < ROWS) rowsToClear.add(y);
  }

  let write = ROWS - 1;
  for (let read = ROWS - 1; read >= 0; read -= 1) {
    if (rowsToClear.has(read)) continue;
    board.grid[write] = board.grid[read];
    write -= 1;
  }
  for (; write >= 0; write -= 1) board.grid[write] = Array(COLS).fill(null);

  return rowsToClear.size;
}

export function addGarbage(board, pol, hole, seam = false) {
  const topedOut = board.grid[0].some(cell => cell !== null);

  for (let y = 0; y < ROWS - 1; y += 1) {
    board.grid[y] = board.grid[y + 1];
  }

  const row = Array.from({ length: COLS }, (_, x) => (
    x === hole ? null : { pol, t: seam ? 'SEAM' : 'G' }
  ));
  board.grid[ROWS - 1] = row;

  return topedOut;
}

export function rowHasSeam(board, y) {
  if (!Number.isInteger(y) || y < 0 || y >= ROWS) return false;
  return board.grid[y].some(cell => cell !== null && cell.t === 'SEAM');
}

export function anyAbove(cells) {
  return cells.some(([, y]) => y < 0);
}
