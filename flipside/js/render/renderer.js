import { COLS, COLORS, ROWS, other } from '../config.js';
import { cellsOf } from '../core/pieces.js';
import { collides } from '../core/board.js';
import { drawBackground } from './backgrounds.js';

const MAX_DPR = 2;
const SEAM_WIDTH_CELLS = 1.2;
const FOLD_SLICES = 24;
const PRISM_COLORS = [
  '#57b8c9', '#6fe3ff', '#c98bc9', '#e39bff',
  '#f2c14e', '#ffd76f', '#e2695c', '#ff8f80',
];
const CELL_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L', 'G'];
const BASE_CELL_OPTIONS = {};

const rgbCache = new Map();
const darkCache = new Map();
const cellSpriteCache = new Map();
const ghostProbe = Array.from({ length: 4 }, () => [0, 0]);
const seamRowsCache = {
  sun: { signature: null, fill: new Float32Array(ROWS), kind: new Uint8Array(ROWS) },
  ink: { signature: null, fill: new Float32Array(ROWS), kind: new Uint8Array(ROWS) },
};
let ghostCache = null;
let reducedMotionState = null;

function reducedMotion() {
  if (reducedMotionState) return reducedMotionState.value;
  reducedMotionState = { value: false, media: null };
  try {
    if (typeof globalThis.matchMedia !== 'function') return false;
    const media = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionState.value = !!media.matches;
    reducedMotionState.media = media;
    const update = (event) => { reducedMotionState.value = !!event.matches; };
    if (typeof media.addEventListener === 'function') media.addEventListener('change', update);
    else if (typeof media.addListener === 'function') media.addListener(update);
  } catch (_) {
    reducedMotionState.value = false;
  }
  return reducedMotionState.value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readHex(hex) {
  if (rgbCache.has(hex)) return rgbCache.get(hex);
  let value = String(hex || '').trim();
  if (value[0] === '#') value = value.slice(1);
  if (value.length === 3) value = value.split('').map((part) => part + part).join('');
  if (!/^[\da-f]{6}$/i.test(value)) return null;
  const rgb = [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
  rgbCache.set(hex, rgb);
  return rgb;
}

function rgba(hex, alpha) {
  const rgb = readHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function darken(hex, amount = 0.22) {
  const key = `${hex}:${amount}`;
  if (darkCache.has(key)) return darkCache.get(key);
  const rgb = readHex(hex);
  if (!rgb) return hex;
  const result = `rgb(${Math.round(rgb[0] * (1 - amount))},${Math.round(rgb[1] * (1 - amount))},${Math.round(rgb[2] * (1 - amount))})`;
  darkCache.set(key, result);
  return result;
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function makeGrainPattern(canvasCtx, world, unit) {
  let tile;
  if (typeof OffscreenCanvas === 'function') {
    tile = new OffscreenCanvas(Math.max(32, Math.round(72 * unit)), Math.max(32, Math.round(72 * unit)));
  } else if (typeof document !== 'undefined') {
    tile = document.createElement('canvas');
    tile.width = Math.max(32, Math.round(72 * unit));
    tile.height = Math.max(32, Math.round(72 * unit));
  }
  if (!tile) return null;

  const tileCtx = tile.getContext('2d');
  if (!tileCtx) return null;
  const size = tile.width;
  tileCtx.clearRect(0, 0, size, size);
  const grainColor = world === 'sun' ? '74,63,51' : '207,214,255';
  let seed = world === 'sun' ? 0x29a43d : 0x7f31c9;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 150; i += 1) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    const length = 0.4 * unit + random() * 2.1 * unit;
    tileCtx.fillStyle = `rgba(${grainColor},${0.018 + random() * 0.035})`;
    tileCtx.fillRect(x, y, length, Math.max(0.45 * unit, random() * 0.8 * unit));
  }
  for (let i = 0; i < 18; i += 1) {
    const x = random() * size;
    const y = random() * size;
    tileCtx.strokeStyle = `rgba(${grainColor},${0.018 + random() * 0.024})`;
    tileCtx.lineWidth = Math.max(0.4 * unit, 0.6 * unit);
    tileCtx.beginPath();
    tileCtx.moveTo(x, y);
    tileCtx.lineTo(x + (random() - 0.5) * 7 * unit, y + (random() - 0.5) * 2 * unit);
    tileCtx.stroke();
  }
  return canvasCtx.createPattern(tile, 'repeat');
}

function makeScratchCanvas(width, height) {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }
  return null;
}

function cellSpriteKey(world, type, size, unit) {
  return `${world}:${type}:${Math.round(size * 100)}:${Math.round(unit * 100)}`;
}

function getCellSprite(ctx, px, py, size, cell, palette, world, unit, draw = true) {
  const key = cellSpriteKey(world, cell.t, size, unit);
  const cached = cellSpriteCache.get(key);
  if (cached) {
    if (draw) ctx.drawImage(cached.canvas, px - cached.pad, py - cached.pad);
    return true;
  }

  const pad = Math.ceil(Math.max(unit * 3.4, size * 0.09));
  const canvas = makeScratchCanvas(size + pad * 2, size + pad * 2);
  if (!canvas) return false;
  const spriteCtx = canvas.getContext('2d');
  if (!spriteCtx) return false;
  drawCell(spriteCtx, pad, pad, size, { pol: cell.pol, t: cell.t }, palette, world, 0, unit, {
    staticSprite: true,
  });
  const sprite = { canvas, pad };
  cellSpriteCache.set(key, sprite);
  if (draw) ctx.drawImage(canvas, px - pad, py - pad);
  return true;
}

function cellColor(cell, palette) {
  if (!cell) return palette.paper;
  if (cell.t === 'G') return palette.garbage;
  if (cell.t === 'SEAM') return COLORS.seam;
  return palette.minos[cell.t] || palette.panel;
}

function cellEdge(cell, palette) {
  if (cell && cell.t === 'G') return palette.garbageEdge;
  if (cell && cell.t === 'SEAM') return darken(COLORS.seam, 0.28);
  return darken(cellColor(cell, palette), 0.24);
}

function drawCell(ctx, px, py, size, cell, palette, world, timeMs, unit, options = {}) {
  if (!cell || py + size <= 0 || px + size <= 0) return;
  const inset = Math.max(unit * 0.9, size * 0.065);
  const x = px + inset;
  const y = py + inset;
  const width = Math.max(1, size - inset * 2);
  const radius = Math.min(size * 0.17, unit * 3.8);
  const ghost = options.ghost === true;
  const prism = options.prism === true || cell.prism === true;
  const seam = cell.t === 'SEAM';
  const garbage = cell.t === 'G';
  const color = cellColor(cell, palette);
  const edge = cellEdge(cell, palette);

  if (!ghost && !prism && !seam && options.staticSprite !== true
    && options.goldOutline !== true
    && getCellSprite(ctx, px, py, size, cell, palette, world, unit)) {
    return;
  }

  ctx.save();
  roundedRectPath(ctx, x, y, width, width, radius);

  if (ghost) {
    ctx.fillStyle = rgba(color, world === 'ink' ? 0.12 : 0.09);
    ctx.fill();
    ctx.strokeStyle = rgba(color, world === 'ink' ? 0.72 : 0.58);
    ctx.lineWidth = Math.max(unit * 0.8, size * 0.035);
    ctx.setLineDash([Math.max(unit * 2, size * 0.18), Math.max(unit * 2, size * 0.14)]);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = clamp(size * 0.07, unit * 1.1, unit * 3.4);
  ctx.shadowOffsetX = unit * 0.55;
  ctx.shadowOffsetY = unit * 0.9;
  if (prism) {
    const prismGradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.35);
    prismGradient.addColorStop(0, PRISM_COLORS[0]);
    prismGradient.addColorStop(0.28, PRISM_COLORS[2]);
    prismGradient.addColorStop(0.52, PRISM_COLORS[5]);
    prismGradient.addColorStop(0.76, PRISM_COLORS[1]);
    prismGradient.addColorStop(1, PRISM_COLORS[4]);
    ctx.fillStyle = prismGradient;
  } else {
    ctx.fillStyle = color;
  }
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // A small highlight makes each mino read as folded paper without a costly
  // per-cell gradient on the normal path.
  ctx.save();
  roundedRectPath(ctx, x, y, width, width, radius);
  ctx.clip();
  ctx.fillStyle = rgba(world === 'ink' ? '#ffffff' : '#ffffff', world === 'ink' ? 0.12 : 0.16);
  ctx.fillRect(x, y, width, Math.max(unit * 1.4, width * 0.1));
  ctx.fillStyle = rgba(world === 'ink' ? '#000000' : '#4a3f33', world === 'ink' ? 0.08 : 0.045);
  ctx.fillRect(x, y + width - Math.max(unit * 1.1, width * 0.075), width, Math.max(unit * 1.1, width * 0.075));

  if (garbage) {
    ctx.strokeStyle = rgba(edge, world === 'ink' ? 0.5 : 0.42);
    ctx.lineWidth = Math.max(unit * 0.45, size * 0.018);
    ctx.beginPath();
    ctx.moveTo(x + width * 0.14, y + width * 0.28);
    ctx.lineTo(x + width * 0.88, y + width * 0.18);
    ctx.moveTo(x + width * 0.1, y + width * 0.65);
    ctx.lineTo(x + width * 0.76, y + width * 0.79);
    ctx.stroke();
    ctx.fillStyle = rgba(edge, world === 'ink' ? 0.28 : 0.3);
    ctx.fillRect(x + width * 0.66, y + width * 0.42, Math.max(unit, width * 0.08), Math.max(unit, width * 0.08));
  }

  if (seam) {
    const shineSpan = width * 2.4;
    const shineX = x + ((timeMs * unit * 0.005 + px * 0.37) % shineSpan) - width * 0.65;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(shineX, y + width);
    ctx.lineTo(shineX + width * 0.28, y + width);
    ctx.lineTo(shineX + width * 0.72, y);
    ctx.lineTo(shineX + width * 0.44, y);
    ctx.closePath();
    ctx.fill();
  } else if (prism) {
    const sweep = x + ((timeMs * unit * 0.006 + px + py) % (width * 2.2)) - width * 0.6;
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.beginPath();
    ctx.moveTo(sweep, y + width);
    ctx.lineTo(sweep + width * 0.2, y + width);
    ctx.lineTo(sweep + width * 0.62, y);
    ctx.lineTo(sweep + width * 0.42, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(unit * 0.7, size * 0.027);
  roundedRectPath(ctx, x, y, width, width, radius);
  ctx.stroke();
  if (prism) {
    ctx.strokeStyle = 'rgba(255,255,255,0.82)';
    ctx.lineWidth = Math.max(unit * 0.55, size * 0.02);
    roundedRectPath(ctx, x + unit * 0.35, y + unit * 0.35, width - unit * 0.7, width - unit * 0.7, Math.max(0, radius - unit * 0.35));
    ctx.stroke();
  }
  if (seam) {
    ctx.strokeStyle = 'rgba(255,247,200,0.78)';
    ctx.lineWidth = Math.max(unit * 0.5, size * 0.018);
    ctx.setLineDash([Math.max(unit * 1.8, size * 0.13), Math.max(unit * 1.5, size * 0.11)]);
    ctx.lineDashOffset = -(timeMs * unit * 0.004 + px * 0.2);
    ctx.beginPath();
    ctx.moveTo(x + width * 0.05, y + width * 0.52);
    ctx.lineTo(x + width * 0.95, y + width * 0.52);
    ctx.stroke();
  }
  if (options.goldOutline === true) {
    ctx.strokeStyle = '#f7d774';
    ctx.lineWidth = Math.max(unit * 1.05, size * 0.042);
    roundedRectPath(ctx, x - unit * 0.25, y - unit * 0.25,
      width + unit * 0.5, width + unit * 0.5, radius + unit * 0.25);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStitchGrid(ctx, layout, palette, world) {
  const { boardX: x, boardY: y, boardW: width, boardH: height, cell, unit } = layout;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.strokeStyle = rgba(palette.ink, world === 'ink' ? 0.25 : 0.2);
  ctx.lineWidth = Math.max(unit * 0.42, 0.65);
  ctx.setLineDash(layout.stitchDash);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let column = 0; column <= COLS; column += 1) {
    const lineX = x + column * cell;
    ctx.moveTo(lineX, y);
    ctx.lineTo(lineX, y + height);
  }
  for (let row = 0; row <= ROWS; row += 1) {
    const lineY = y + row * cell;
    ctx.moveTo(x, lineY);
    ctx.lineTo(x + width, lineY);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSeamAccents(ctx, board, layout) {
  if (!board || !Array.isArray(board.grid)) return;
  const { boardX: x, boardY: y, boardW: width, cell, unit } = layout;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, ROWS * cell);
  ctx.clip();
  ctx.strokeStyle = 'rgba(247,215,116,0.58)';
  ctx.lineWidth = Math.max(unit * 0.55, cell * 0.018);
  ctx.setLineDash(layout.seamAccentDash);
  for (let row = 0; row < ROWS; row += 1) {
    const cells = board.grid[row];
    let hasSeam = false;
    if (cells) {
      for (let column = 0; column < COLS; column += 1) {
        if (cells[column] && cells[column].t === 'SEAM') {
          hasSeam = true;
          break;
        }
      }
    }
    if (!hasSeam) continue;
    ctx.beginPath();
    ctx.moveTo(x + unit * 1.2, y + row * cell + cell * 0.5);
    ctx.lineTo(x + width - unit * 1.2, y + row * cell + cell * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBoardCells(ctx, board, world, layout, timeMs) {
  if (!board || !Array.isArray(board.grid)) return;
  const { boardX: x, boardY: y, cell, unit } = layout;
  const palette = COLORS[world];
  for (let row = 0; row < ROWS; row += 1) {
    const cells = board.grid[row];
    if (!cells) continue;
    for (let column = 0; column < COLS; column += 1) {
      const value = cells[column];
      if (!value) continue;
      drawCell(ctx, x + column * cell, y + row * cell, cell, value, palette, world, timeMs, unit, BASE_CELL_OPTIONS);
    }
  }
}

function boardOccupancySignature(board) {
  if (!board || !Array.isArray(board.grid)) return 0;
  let hash = 2166136261;
  for (let row = 0; row < ROWS; row += 1) {
    const cells = board.grid[row];
    for (let column = 0; column < COLS; column += 1) {
      hash = Math.imul(hash ^ (cells && cells[column] ? 1 : 0), 16777619);
    }
  }
  return hash >>> 0;
}

function getGhostCells(piece, board) {
  if (!piece || !board) return [];
  const signature = boardOccupancySignature(board);
  if (ghostCache
    && ghostCache.board === board
    && ghostCache.signature === signature
    && ghostCache.t === piece.t
    && ghostCache.x === piece.x
    && ghostCache.y === piece.y
    && ghostCache.rot === piece.rot
    && ghostCache.prism === (piece.prism === true)) {
    return ghostCache.cells;
  }

  const baseCells = cellsOf(piece);
  let drop = 0;
  for (let step = 1; step <= ROWS + 6; step += 1) {
    for (let i = 0; i < baseCells.length; i += 1) {
      ghostProbe[i][0] = baseCells[i][0];
      ghostProbe[i][1] = baseCells[i][1] + step;
    }
    if (collides(board, ghostProbe)) break;
    drop = step;
  }

  const cells = baseCells.map(([x, y]) => [x, y + drop]);
  ghostCache = {
    board,
    signature,
    t: piece.t,
    x: piece.x,
    y: piece.y,
    rot: piece.rot,
    prism: piece.prism === true,
    cells,
  };
  return cells;
}

function drawPiece(ctx, piece, board, world, layout, timeMs, ghost = false, options = {}) {
  if (!piece) return;
  const positions = ghost ? getGhostCells(piece, board) : cellsOf(piece);
  const palette = COLORS[world];
  const { boardX: x, boardY: y, cell, unit } = layout;
  const value = { pol: world, t: piece.t, prism: piece.prism === true };
  const cellOptions = {
    ghost,
    prism: !ghost && piece.prism === true,
    goldOutline: !ghost && options.goldOutline === true,
  };
  for (const position of positions) {
    if (!Array.isArray(position) || position.length < 2) continue;
    const [column, row] = position;
    if (column < 0 || column >= COLS || row >= ROWS) continue;
    drawCell(ctx, x + column * cell, y + row * cell, cell, value, palette, world, timeMs, unit, cellOptions);
  }
}

function drawFrame(ctx, world, layout, palette, grainPattern, paints) {
  const { pageX, pageY, pageW, pageH, boardX, boardY, boardW, boardH, unit } = layout;
  const radius = Math.max(unit * 2.5, unit * 0.7);

  ctx.save();
  roundedRectPath(ctx, pageX, pageY, pageW, pageH, radius);
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = unit * (world === 'ink' ? 1.25 : 1.05);
  ctx.shadowOffsetX = unit * 0.8;
  ctx.shadowOffsetY = unit * 1.4;
  ctx.fillStyle = paints.page;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = rgba(palette.ink, world === 'ink' ? 0.52 : 0.46);
  ctx.lineWidth = Math.max(unit * 0.85, 1);
  roundedRectPath(ctx, pageX, pageY, pageW, pageH, radius);
  ctx.stroke();

  if (grainPattern) {
    ctx.save();
    roundedRectPath(ctx, pageX, pageY, pageW, pageH, radius);
    ctx.clip();
    ctx.globalAlpha = world === 'ink' ? 0.82 : 0.95;
    ctx.fillStyle = grainPattern;
    ctx.fillRect(pageX, pageY, pageW, pageH);
    ctx.restore();
  }

  // A restrained inner bevel makes the board feel like a cut window in the
  // page. Inkside gets a cool ink glow; Sunside keeps a pencil-soft edge.
  ctx.strokeStyle = rgba(palette.ink, world === 'ink' ? 0.34 : 0.22);
  ctx.lineWidth = Math.max(unit * 0.6, 0.8);
  roundedRectPath(ctx, boardX - unit * 0.32, boardY - unit * 0.32, boardW + unit * 0.64, boardH + unit * 0.64, Math.max(unit * 1.4, 1));
  if (world === 'ink') {
    ctx.shadowColor = 'rgba(140,180,255,0.26)';
    ctx.shadowBlur = unit * 1.1;
  }
  ctx.stroke();
  ctx.restore();
}

function drawBoardSurface(ctx, world, layout, palette, grainPattern, paints) {
  const { boardX: x, boardY: y, boardW: width, boardH: height, unit } = layout;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.fillStyle = paints.surface;
  ctx.fillRect(x, y, width, height);
  if (grainPattern) {
    ctx.globalAlpha = world === 'ink' ? 0.5 : 0.68;
    ctx.fillStyle = grainPattern;
    ctx.fillRect(x, y, width, height);
  }
  if (world === 'sun') {
    ctx.strokeStyle = 'rgba(74,63,51,0.06)';
    ctx.lineWidth = Math.max(unit * 0.4, 0.6);
    for (let line = -height; line < width; line += Math.max(unit * 8, width * 0.11)) {
      ctx.beginPath();
      ctx.moveTo(x + line, y + height);
      ctx.lineTo(x + line + height * 0.24, y);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = paints.boardVignette;
    ctx.fillRect(x, y, width, height);
  }
  ctx.restore();
}

function measureCanvas(canvas) {
  const rect = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : null;
  const parent = canvas.parentElement;
  const fallbackWidth = parent && parent.clientWidth ? parent.clientWidth : (globalThis.innerWidth || 390);
  const fallbackHeight = parent && parent.clientHeight ? parent.clientHeight : (globalThis.innerHeight || 700);
  const cssWidth = Math.max(1, Math.round(Number(canvas.clientWidth) || (rect && rect.width) || fallbackWidth));
  const cssHeight = Math.max(1, Math.round(Number(canvas.clientHeight) || (rect && rect.height) || fallbackHeight));
  const rawDpr = Number(globalThis.devicePixelRatio) || 1;
  const dpr = clamp(rawDpr, 1, MAX_DPR);
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr));
  return { cssWidth, cssHeight, dpr, width, height };
}

function makeLayout(width, height, dpr) {
  const unit = dpr;
  // The seam and the playable board share the width that the old full board
  // used. Height remains the limiting dimension on short portrait screens.
  const framePad = Math.max(unit * 4, Math.min(width, height) * 0.015);
  const verticalMargin = Math.max(unit * 6, height * 0.028);
  const playWidthCells = COLS + SEAM_WIDTH_CELLS;
  const cell = Math.max(1, Math.min(
    Math.max(1, (width - framePad * 2) / playWidthCells),
    Math.max(1, (height - verticalMargin * 2) / ROWS),
  ));
  const seamW = cell * SEAM_WIDTH_CELLS;
  const boardW = cell * COLS;
  const boardH = cell * ROWS;
  const playW = seamW + boardW;
  const playX = Math.round((width - playW) * 0.5);
  const seamX = playX;
  const boardX = seamX + seamW;
  const boardY = Math.round((height - boardH) * 0.5);
  return {
    playX,
    playW,
    seamX,
    seamW,
    seamY: boardY,
    seamH: boardH,
    seamStitchDash: [Math.max(unit * 1.3, seamW * 0.13), Math.max(unit * 1.1, seamW * 0.1)],
    seamGridDash: [Math.max(unit * 1.2, seamW * 0.12), Math.max(unit * 1.7, seamW * 0.18)],
    seamAccentDash: [Math.max(unit * 2, cell * 0.14), Math.max(unit * 1.6, cell * 0.1)],
    stitchDash: [Math.max(unit * 1.25, cell * 0.095), Math.max(unit * 1.5, cell * 0.12)],
    boardX,
    boardY,
    boardW,
    boardH,
    boardRight: boardX + boardW,
    boardBottom: boardY + boardH,
    pageX: playX - framePad,
    pageY: boardY - framePad,
    pageW: playW + framePad * 2,
    pageH: boardH + framePad * 2,
    cell,
    unit,
    width,
    height,
  };
}

function makePaintCache(ctx, layout, palette) {
  const { pageX, pageY, pageW, pageH, boardX, boardY, boardW, boardH } = layout;
  const page = ctx.createLinearGradient(pageX, pageY, pageX, pageY + pageH);
  page.addColorStop(0, palette.panel);
  page.addColorStop(0.48, palette.paper);
  page.addColorStop(1, palette.panel);

  const surface = ctx.createLinearGradient(boardX, boardY, boardX + boardW * 0.4, boardY + boardH);
  surface.addColorStop(0, palette.paper);
  surface.addColorStop(0.55, palette.paper);
  surface.addColorStop(1, palette.panel);

  const boardVignette = ctx.createRadialGradient(
    boardX + boardW * 0.5, boardY + boardH * 0.36, boardW * 0.1,
    boardX + boardW * 0.5, boardY + boardH * 0.5, boardW * 0.78,
  );
  boardVignette.addColorStop(0, 'rgba(140,180,255,0.055)');
  boardVignette.addColorStop(1, 'rgba(0,0,0,0.16)');
  return { page, surface, boardVignette };
}

function warmCellSprites(ctx, layout) {
  for (const world of ['sun', 'ink']) {
    const palette = COLORS[world];
    for (const type of CELL_TYPES) {
      getCellSprite(ctx, 0, 0, layout.cell, { pol: world, t: type }, palette, world, layout.unit, false);
    }
  }
}

function boardRenderSignature(board) {
  if (!board || !Array.isArray(board.grid)) return 0;
  if (Number.isFinite(board.revision)) return board.revision;

  let hash = 2166136261;
  for (let row = 0; row < ROWS; row += 1) {
    const cells = board.grid[row];
    for (let column = 0; column < COLS; column += 1) {
      const cell = cells && cells[column];
      hash = Math.imul(hash ^ (cell ? 1 : 0), 16777619);
      if (cell) {
        hash = Math.imul(hash ^ (cell.t && cell.t.charCodeAt(0) || 0), 16777619);
        hash = Math.imul(hash ^ (cell.pol === 'ink' ? 2 : cell.pol === 'both' ? 3 : 1), 16777619);
      }
    }
  }
  return hash >>> 0;
}

function updateSeamRows(board, world) {
  const cache = seamRowsCache[world];
  const signature = boardRenderSignature(board);
  if (cache.signature === signature) return cache;

  cache.signature = signature;
  for (let row = 0; row < ROWS; row += 1) {
    const cells = board && board.grid ? board.grid[row] : null;
    let filled = 0;
    let kind = 0;
    if (cells) {
      for (let column = 0; column < COLS; column += 1) {
        const cell = cells[column];
        if (!cell) continue;
        filled += 1;
        if (cell.t === 'SEAM') kind = 2;
        else if (cell.t === 'G' && kind === 0) kind = 1;
      }
    }
    cache.fill[row] = filled / COLS;
    cache.kind[row] = kind;
  }
  return cache;
}

function drawLaneStrip(ctx, board, world, layout, timeMs) {
  const palette = COLORS[world];
  const cache = updateSeamRows(board, world);
  const { seamX: x, seamY: stripY, seamW: stripW, seamH: stripH, unit } = layout;
  const rowHeight = stripH / ROWS;
  const edgeInset = Math.max(unit * 1.1, stripW * 0.09);
  const innerX = x + edgeInset;
  const innerW = Math.max(1, stripW - edgeInset * 2);

  ctx.save();
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = Math.max(unit * 2.4, stripW * 0.14);
  ctx.shadowOffsetX = unit * 1.2;
  ctx.shadowOffsetY = unit * 1.8;
  ctx.fillStyle = palette.paper;
  ctx.fillRect(x, stripY, stripW, stripH);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Bright cut edges keep the standing page legible; the right edge is the
  // crease where the full playable page meets the fold seam.
  ctx.strokeStyle = rgba(palette.ink, world === 'ink' ? 0.72 : 0.58);
  ctx.lineWidth = Math.max(unit * 0.9, 1);
  ctx.strokeRect(x, stripY, stripW, stripH);
  ctx.strokeStyle = rgba('#ffffff', world === 'ink' ? 0.28 : 0.62);
  ctx.lineWidth = Math.max(unit * 0.5, 0.8);
  ctx.beginPath();
  ctx.moveTo(x + unit * 0.7, stripY + unit * 0.7);
  ctx.lineTo(x + unit * 0.7, stripY + stripH - unit * 0.7);
  ctx.moveTo(x + stripW - unit * 0.7, stripY + unit * 0.7);
  ctx.lineTo(x + stripW - unit * 0.7, stripY + stripH - unit * 0.7);
  ctx.stroke();

  ctx.fillStyle = palette.panel;
  ctx.beginPath();
  ctx.moveTo(x + unit * 0.35, stripY);
  ctx.lineTo(x + stripW - unit * 0.35, stripY);
  ctx.lineTo(x + stripW - unit * 1.15, stripY - unit * 2.3);
  ctx.lineTo(x + unit * 1.15, stripY - unit * 2.3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(palette.ink, 0.52);
  ctx.lineWidth = Math.max(unit * 0.45, 0.75);
  ctx.stroke();
  ctx.font = `700 ${Math.max(6, unit * 5.2)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.ink;
  ctx.fillText(world === 'sun' ? 'SUN' : 'INK', x + stripW * 0.5, stripY - unit * 1.15);

  for (let row = 0; row < ROWS; row += 1) {
    const rowY = stripY + row * rowHeight;
    const fill = cache.fill[row];
    const kind = cache.kind[row];
    const fillWidth = innerW * fill;
    if (fillWidth > 0) {
      const fillHeight = Math.max(unit * 2.2, rowHeight * 0.68);
      const fillY = rowY + (rowHeight - fillHeight) * 0.5;
      ctx.fillStyle = kind === 1
        ? palette.garbage
        : (kind === 2 ? COLORS.seam : rgba(palette.ink, 0.82));
      ctx.fillRect(innerX, fillY, fillWidth, fillHeight);

      if (kind === 1) {
        ctx.strokeStyle = rgba(palette.garbageEdge, 0.62);
        ctx.lineWidth = Math.max(unit * 0.42, 0.7);
        ctx.beginPath();
        ctx.moveTo(innerX + fillWidth * 0.12, fillY + fillHeight * 0.26);
        ctx.lineTo(innerX + fillWidth * 0.78, fillY + fillHeight * 0.7);
        ctx.moveTo(innerX + fillWidth * 0.58, fillY + fillHeight * 0.18);
        ctx.lineTo(innerX + fillWidth * 0.94, fillY + fillHeight * 0.52);
        ctx.stroke();
      }
    }

    if (kind === 2) {
      ctx.strokeStyle = rgba('#fff7c9', 0.92);
      ctx.lineWidth = Math.max(unit * 0.55, 0.8);
      ctx.setLineDash(layout.seamStitchDash);
      ctx.lineDashOffset = -(timeMs * 0.004 + row * unit * 0.2);
      ctx.beginPath();
      ctx.moveTo(innerX, rowY + rowHeight * 0.5);
      ctx.lineTo(innerX + innerW, rowY + rowHeight * 0.5);
      ctx.stroke();
    }
  }

  ctx.setLineDash(layout.seamGridDash);
  ctx.lineDashOffset = 0;
  ctx.strokeStyle = rgba(palette.ink, world === 'ink' ? 0.28 : 0.22);
  ctx.lineWidth = Math.max(unit * 0.38, 0.65);
  ctx.beginPath();
  for (let row = 0; row <= ROWS; row += 1) {
    const rowY = stripY + row * rowHeight;
    ctx.moveTo(x, rowY);
    ctx.lineTo(x + stripW, rowY);
  }
  ctx.stroke();
  ctx.restore();
}

function samePiece(a, b) {
  if (!a || !b) return !a && !b;
  return a.t === b.t && a.x === b.x && a.y === b.y
    && a.rot === b.rot && a.prism === (b.prism === true);
}

function makeSheetCache(world, width, height, layout) {
  const sheetCanvas = makeScratchCanvas(width, height);
  if (!sheetCanvas || typeof sheetCanvas.getContext !== 'function') return null;
  const sheetCtx = sheetCanvas.getContext('2d');
  const pieceCanvas = makeScratchCanvas(width, height);
  const pieceCtx = pieceCanvas && typeof pieceCanvas.getContext === 'function'
    ? pieceCanvas.getContext('2d') : null;
  if (!sheetCtx) return null;

  return {
    world,
    canvas: sheetCanvas,
    ctx: sheetCtx,
    pieceCanvas,
    pieceCtx,
    grainPattern: makeGrainPattern(sheetCtx, world, layout.unit),
    paints: makePaintCache(sheetCtx, layout, COLORS[world]),
    boardSignature: null,
    overlayBoardSignature: null,
    overlayWorld: null,
    overlayPiece: null,
  };
}

function repaintSheet(sheet, game, layout, timeMs) {
  if (!sheet || !sheet.ctx) return;
  const world = sheet.world;
  const board = game.boards && game.boards[world];
  const signature = boardRenderSignature(board);
  if (sheet.boardSignature === signature) return;

  const ctx = sheet.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, layout.width, layout.height);
  const palette = COLORS[world];
  drawFrame(ctx, world, layout, palette, sheet.grainPattern, sheet.paints);
  drawBoardSurface(ctx, world, layout, palette, sheet.grainPattern, sheet.paints);
  drawStitchGrid(ctx, layout, palette, world);
  drawSeamAccents(ctx, board, layout);
  drawBoardCells(ctx, board, world, layout, timeMs);
  sheet.boardSignature = signature;
}

function repaintPieceOverlay(sheet, game, pieceWorld, layout) {
  if (!sheet || !sheet.pieceCtx) return;
  const board = game.boards && game.boards[sheet.world];
  const signature = boardRenderSignature(board);
  const piece = sheet.world === pieceWorld ? game.piece : null;
  if (sheet.overlayBoardSignature === signature
    && sheet.overlayWorld === pieceWorld && samePiece(sheet.overlayPiece, piece)) return;

  const ctx = sheet.pieceCtx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, layout.width, layout.height);
  if (piece && board) {
    drawPiece(ctx, piece, board, sheet.world, layout, 0, true);
    drawPiece(ctx, piece, board, sheet.world, layout, 0, false, { goldOutline: true });
  }
  sheet.overlayBoardSignature = signature;
  sheet.overlayWorld = pieceWorld;
  sheet.overlayPiece = piece ? {
    t: piece.t,
    x: piece.x,
    y: piece.y,
    rot: piece.rot,
    prism: piece.prism === true,
  } : null;
}

function drawFlatLayout(ctx, gameState, world, seamWorld, layout, timeMs,
  grainPattern, paints, alpha = 1) {
  if (alpha <= 0) return;
  const palette = COLORS[world];
  const board = gameState.boards && gameState.boards[world];
  const seamBoard = gameState.boards && gameState.boards[seamWorld];
  ctx.save();
  ctx.globalAlpha = alpha;
  drawFrame(ctx, world, layout, palette, grainPattern, paints);
  drawBoardSurface(ctx, world, layout, palette, grainPattern, paints);
  drawLaneStrip(ctx, seamBoard, seamWorld, layout, timeMs);
  drawStitchGrid(ctx, layout, palette, world);
  drawSeamAccents(ctx, board, layout);
  drawBoardCells(ctx, board, world, layout, timeMs);

  const piece = gameState.piece;
  if (piece && board) {
    drawPiece(ctx, piece, board, world, layout, timeMs, true);
    drawPiece(ctx, piece, board, world, layout, timeMs, false);
  }
  ctx.restore();
}

function drawFoldCreaseShadow(ctx, layout, creaseX, strength) {
  if (strength <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.28 * strength;
  ctx.fillStyle = '#000000';
  ctx.shadowColor = 'rgba(0,0,0,0.42)';
  ctx.shadowBlur = Math.max(layout.cell * 1.6, 4);
  ctx.fillRect(creaseX - layout.unit * 0.9, layout.boardY, layout.unit * 1.4, layout.boardH);
  ctx.restore();
}

function projectBoardToFold(ctx, source, layout, destinationX, destinationW, alpha = 1) {
  if (!source || destinationW <= 0 || alpha <= 0) return;
  const sourceSlice = layout.boardW / FOLD_SLICES;
  const destinationSlice = destinationW / FOLD_SLICES;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let slice = 0; slice < FOLD_SLICES; slice += 1) {
    const sourceX = layout.boardX + slice * sourceSlice;
    const destX = destinationX + slice * destinationSlice;
    ctx.drawImage(source,
      sourceX, layout.boardY, sourceSlice + 0.8, layout.boardH,
      destX, layout.boardY, Math.max(0.55, destinationSlice + 0.8), layout.boardH);
  }
  ctx.restore();
}

export function createRenderer(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new TypeError('createRenderer(canvas) requires a canvas element');
  }
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) throw new Error('FLIPSIDE renderer could not acquire a 2D context');

  let dpr = 1;
  let grainPatterns = { sun: null, ink: null };
  let paintCaches = { sun: null, ink: null };
  let sheetCaches = { sun: null, ink: null };
  let layout = makeLayout(390, 700, dpr);
  let measuredWidth = 0;
  let measuredHeight = 0;
  let measuredCssWidth = 0;
  let measuredCssHeight = 0;
  let dprMedia = null;
  let resizeObserver = null;

  function currentDpr() {
    const rawDpr = Number(globalThis.devicePixelRatio) || 1;
    return clamp(rawDpr, 1, MAX_DPR);
  }

  function watchDpr() {
    const view = canvas.ownerDocument && canvas.ownerDocument.defaultView
      ? canvas.ownerDocument.defaultView : globalThis;
    if (!view || typeof view.matchMedia !== 'function') return;
    try {
      if (dprMedia && typeof dprMedia.removeEventListener === 'function') {
        dprMedia.removeEventListener('change', handleDprChange);
      } else if (dprMedia && typeof dprMedia.removeListener === 'function') {
        dprMedia.removeListener(handleDprChange);
      }
      dprMedia = view.matchMedia(`(resolution: ${dpr}dppx)`);
      if (typeof dprMedia.addEventListener === 'function') dprMedia.addEventListener('change', handleDprChange);
      else if (typeof dprMedia.addListener === 'function') dprMedia.addListener(handleDprChange);
    } catch (_) {
      dprMedia = null;
    }
  }

  function handleDprChange() {
    resize();
    watchDpr();
  }

  function resize() {
    const measured = measureCanvas(canvas);
    if (measured.width === measuredWidth
      && measured.height === measuredHeight
      && measured.cssWidth === measuredCssWidth
      && measured.cssHeight === measuredCssHeight
      && measured.dpr === dpr) {
      return layout;
    }
    dpr = measured.dpr;
    measuredWidth = measured.width;
    measuredHeight = measured.height;
    measuredCssWidth = measured.cssWidth;
    measuredCssHeight = measured.cssHeight;
    if (canvas.width !== measured.width) canvas.width = measured.width;
    if (canvas.height !== measured.height) canvas.height = measured.height;
    // Keep the backing-pixel coordinate system intact for both the normal
    // painter and the offscreen sheets.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    layout = makeLayout(measured.width, measured.height, dpr);
    cellSpriteCache.clear();
    ghostCache = null;
    grainPatterns = {
      sun: makeGrainPattern(ctx, 'sun', dpr),
      ink: makeGrainPattern(ctx, 'ink', dpr),
    };
    paintCaches = {
      sun: makePaintCache(ctx, layout, COLORS.sun),
      ink: makePaintCache(ctx, layout, COLORS.ink),
    };
    sheetCaches = {
      sun: makeSheetCache('sun', measured.width, measured.height, layout),
      ink: makeSheetCache('ink', measured.width, measured.height, layout),
    };
    warmCellSprites(ctx, layout);
    watchDpr();
    return layout;
  }

  function drawNormal(gameState, width, height) {
    const world = gameState.world === 'ink' ? 'ink' : 'sun';
    const timeMs = Number.isFinite(gameState.timeMs) ? gameState.timeMs : 0;
    const animationTimeMs = reducedMotion() ? 0 : timeMs;
    drawBackground(ctx, world, animationTimeMs, width, height);
    drawFlatLayout(ctx, gameState, world, other(world), layout, animationTimeMs,
      grainPatterns[world], paintCaches[world]);
  }

  function drawFoldCrossfade(gameState, from, to, progress, width, height, timeMs) {
    const cross = clamp(progress, 0, 1);
    drawBackground(ctx, from, timeMs, width, height);
    if (cross > 0) {
      ctx.save();
      ctx.globalAlpha = cross;
      drawBackground(ctx, to, timeMs, width, height);
      ctx.restore();
    }
    drawFlatLayout(ctx, gameState, from, to, layout, timeMs,
      grainPatterns[from], paintCaches[from], 1 - cross);
    drawFlatLayout(ctx, gameState, to, from, layout, timeMs,
      grainPatterns[to], paintCaches[to], cross);
  }

  function drawFold(gameState, cam, width, height) {
    const fold = gameState.fold || {};
    const from = fold.from === 'ink' || fold.from === 'sun'
      ? fold.from : (gameState.world === 'ink' ? 'ink' : 'sun');
    const to = fold.to === 'ink' || fold.to === 'sun' ? fold.to : other(from);
    const rawProgress = typeof cam.progress === 'function' ? cam.progress() : 0;
    const progress = clamp(Number(rawProgress) || 0, 0, 1);
    const timeMs = Number.isFinite(gameState.timeMs) ? gameState.timeMs : 0;
    const reduced = typeof cam.reduced === 'function' && cam.reduced();

    if (reduced || !sheetCaches[from] || !sheetCaches[to]) {
      drawFoldCrossfade(gameState, from, to, progress, width, height, timeMs);
      return;
    }

    repaintSheet(sheetCaches[from], gameState, layout, timeMs);
    repaintSheet(sheetCaches[to], gameState, layout, timeMs);
    repaintPieceOverlay(sheetCaches[from], gameState, from, layout);
    repaintPieceOverlay(sheetCaches[to], gameState, to, layout);

    const firstBeat = progress < 0.5;
    const beatProgress = firstBeat
      ? clamp(progress * 2, 0, 1)
      : clamp((progress - 0.5) * 2, 0, 1);
    drawBackground(ctx, from, timeMs, width, height);
    if (!firstBeat && beatProgress > 0) {
      ctx.save();
      ctx.globalAlpha = beatProgress;
      drawBackground(ctx, to, timeMs, width, height);
      ctx.restore();
    }

    if (firstBeat) {
      const foldedWidth = layout.boardW + (layout.seamW - layout.boardW) * beatProgress;
      const foldedX = layout.boardX + (layout.seamX - layout.boardX) * beatProgress;
      const creaseX = foldedX + foldedWidth;

      drawFrame(ctx, from, layout, COLORS[from], grainPatterns[from], paintCaches[from]);
      drawLaneStrip(ctx, gameState.boards && gameState.boards[to], to, layout, timeMs);
      projectBoardToFold(ctx, sheetCaches[from].canvas, layout, foldedX, foldedWidth);
      projectBoardToFold(ctx, sheetCaches[from].pieceCanvas, layout, foldedX, foldedWidth);
      drawFoldCreaseShadow(ctx, layout, creaseX, beatProgress);
    } else {
      const openingX = layout.seamX + (layout.boardX - layout.seamX) * beatProgress;
      const openingWidth = layout.seamW + (layout.boardW - layout.seamW) * beatProgress;

      drawFrame(ctx, from, layout, COLORS[from], grainPatterns[from], paintCaches[from]);
      if (beatProgress > 0) {
        ctx.save();
        ctx.globalAlpha = beatProgress;
        drawFrame(ctx, to, layout, COLORS[to], grainPatterns[to], paintCaches[to]);
        ctx.restore();
      }
      projectBoardToFold(ctx, sheetCaches[to].canvas, layout, openingX, openingWidth);
      projectBoardToFold(ctx, sheetCaches[to].pieceCanvas, layout, openingX, openingWidth);
      // The old world becomes the persistent seam as soon as the far page
      // starts unfolding. It is drawn last so the handoff never mirrors.
      drawLaneStrip(ctx, gameState.boards && gameState.boards[from], from, layout, timeMs);
      drawFoldCreaseShadow(ctx, layout, openingX, 1 - beatProgress);
    }
  }

  function draw(gameState, cam) {
    if (!gameState) return;
    if (!measuredWidth || !measuredHeight) resize();
    if (currentDpr() !== dpr) resize();
    const width = measuredWidth || canvas.width || layout.width;
    const height = measuredHeight || canvas.height || layout.height;
    const hasFold = !!(gameState.fold && cam && typeof cam.progress === 'function');
    if (hasFold) {
      drawFold(gameState, cam, width, height);
      return;
    }
    drawNormal(gameState, width, height);
  }

  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(canvas);
  }

  return { resize, draw };
}
