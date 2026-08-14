// FLIPSIDE — js/render/renderer.js (LANE L5)
// The renderer presents one continuous 36-column ring as a paper cube: the
// viewed face is flat, with the previous and next faces standing at its two
// creases. Board pixels are cached by ring signature; only the active piece,
// fold projection, shimmer, and ripple are painted on the frame path.

import {
  COLORS,
  FACE_W,
  FACES,
  RING_COLS,
  ROWS,
  SEAM_W_CELLS,
  nextFace,
  ringCol,
} from '../config.js?v=43ddf0f';
import { cellsOf } from '../core/pieces.js?v=43ddf0f';
import { collides } from '../core/board.js?v=43ddf0f';
import { ringDirectionToward } from '../core/game.js?v=43ddf0f';
import { drawBackground } from './backgrounds.js?v=43ddf0f';

const MAX_DPR = 2;
const FOLD_SLICES = 24;
const IDLE_SHEEN_PERIOD = 9000;
const IDLE_SHEEN_LENGTH = 1350;
const LOCK_SETTLE_MS = 90;
const HARD_TRAIL_MS = 56;
const CLEAR_FLASH_MS = 180;
const CLEAR_SETTLE_MS = 40;
const FOLD_DONE_MS = 620;
const CELL_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L', 'G'];
const PRISM_COLORS = [
  '#57b8c9', '#6fe3ff', '#c98bc9', '#e39bff',
  '#f2c14e', '#ffd76f', '#e2695c', '#ff8f80',
];

const rgbCache = new Map();
const darkCache = new Map();
const cellSpriteCache = new Map();
const profileRowsLeft = new Uint8Array(ROWS);
const profileRowsRight = new Uint8Array(ROWS);
const grainMarks = [
  [0.16, 0.23, 0.39, 0.20],
  [0.63, 0.31, 0.78, 0.34],
  [0.28, 0.62, 0.47, 0.59],
  [0.72, 0.78, 0.88, 0.74],
  [0.10, 0.48, 0.22, 0.46],
];
let reducedMotionState = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrap(value, size) {
  return ((value % size) + size) % size;
}

function faceIndex(value, fallback = 0) {
  if (Number.isInteger(value) && value >= 0 && value < FACES.length) return value;
  if (typeof value === 'string') {
    const index = FACES.indexOf(value);
    if (index >= 0) return index;
  }
  return fallback;
}

function ringOf(gameState) {
  return gameState && gameState.ring && Array.isArray(gameState.ring.grid)
    ? gameState.ring : null;
}

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

function easeOutBack(value) {
  const t = clamp(value, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const n = t - 1;
  return 1 + c3 * n * n * n + c1 * n * n;
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

function makeScratchCanvas(width, height) {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  return null;
}

function makeGrainPattern(ctx, world, unit) {
  const tile = makeScratchCanvas(Math.max(32, 72 * unit), Math.max(32, 72 * unit));
  if (!tile) return null;
  const tileCtx = tile.getContext('2d');
  if (!tileCtx) return null;
  const size = tile.width;
  const palette = COLORS[world] || COLORS.sun;
  const rgb = readHex(palette.ink) || [74, 63, 51];
  let seed = 0x29a43d + FACES.indexOf(world) * 0x13579;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  tileCtx.clearRect(0, 0, size, size);
  for (let i = 0; i < 150; i += 1) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    const length = 0.4 * unit + random() * 2.1 * unit;
    tileCtx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.018 + random() * 0.035})`;
    tileCtx.fillRect(x, y, length, Math.max(0.45 * unit, random() * 0.8 * unit));
  }
  return ctx.createPattern(tile, 'repeat');
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

function spriteKey(world, type, size, unit) {
  return `${world}:${type}:${Math.round(size * 100)}:${Math.round(unit * 100)}`;
}

function getCellSprite(ctx, px, py, size, cell, palette, world, unit) {
  const key = spriteKey(world, cell.t, size, unit);
  const cached = cellSpriteCache.get(key);
  if (cached) {
    ctx.drawImage(cached.canvas, px - cached.pad, py - cached.pad);
    return true;
  }
  const pad = Math.ceil(Math.max(unit * 3.4, size * 0.09));
  const canvas = makeScratchCanvas(size + pad * 2, size + pad * 2);
  if (!canvas) return false;
  const spriteCtx = canvas.getContext('2d');
  if (!spriteCtx) return false;
  drawCell(spriteCtx, pad, pad, size, cell, palette, world, 0, unit, { staticSprite: true });
  cellSpriteCache.set(key, { canvas, pad });
  ctx.drawImage(canvas, px - pad, py - pad);
  return true;
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
  const animate = options.animate !== false;
  const color = cellColor(cell, palette);
  const edge = cellEdge(cell, palette);

  if (!ghost && !prism && !seam && options.staticSprite !== true
    && options.goldOutline !== true && getCellSprite(ctx, px, py, size, cell, palette, world, unit)) {
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
    const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.35);
    gradient.addColorStop(0, PRISM_COLORS[0]);
    gradient.addColorStop(0.28, PRISM_COLORS[2]);
    gradient.addColorStop(0.52, PRISM_COLORS[5]);
    gradient.addColorStop(0.76, PRISM_COLORS[1]);
    gradient.addColorStop(1, PRISM_COLORS[4]);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = color;
  }
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.save();
  roundedRectPath(ctx, x, y, width, width, radius);
  ctx.clip();
  ctx.fillStyle = rgba('#ffffff', world === 'ink' ? 0.12 : 0.16);
  ctx.fillRect(x, y, width, Math.max(unit * 1.4, width * 0.1));
  const cut = Math.max(unit * 1.1, width * 0.075);
  ctx.fillStyle = rgba(world === 'ink' ? '#000000' : '#4a3f33', world === 'ink' ? 0.13 : 0.075);
  ctx.fillRect(x, y + width - cut, width, cut);
  ctx.strokeStyle = rgba('#ffffff', world === 'ink' ? 0.10 : 0.22);
  ctx.lineWidth = Math.max(unit * 0.35, size * 0.014);
  ctx.beginPath();
  ctx.moveTo(x + width * 0.10, y + width * 0.055);
  ctx.lineTo(x + width * 0.88, y + width * 0.055);
  ctx.moveTo(x + width * 0.055, y + width * 0.10);
  ctx.lineTo(x + width * 0.055, y + width * 0.82);
  ctx.stroke();
  // The paper grain is deliberately baked into the cell sprite. This keeps
  // the 6% texture visible on blocks without paying for a pattern lookup on
  // every frame.
  ctx.strokeStyle = rgba(world === 'ink' ? '#ffffff' : '#4a3f33', world === 'ink' ? 0.055 : 0.06);
  ctx.lineWidth = Math.max(unit * 0.22, size * 0.009);
  ctx.lineCap = 'round';
  for (let mark = 0; mark < grainMarks.length; mark += 1) {
    const grain = grainMarks[mark];
    const skew = ((cell.t.charCodeAt(0) + mark * 7) % 5) * unit * 0.08;
    ctx.beginPath();
    ctx.moveTo(x + grain[0] * width, y + grain[1] * width);
    ctx.lineTo(x + grain[2] * width + skew, y + grain[3] * width);
    ctx.stroke();
  }
  if (garbage) {
    ctx.strokeStyle = rgba(edge, world === 'ink' ? 0.5 : 0.42);
    ctx.lineWidth = Math.max(unit * 0.45, size * 0.018);
    ctx.beginPath();
    ctx.moveTo(x + width * 0.14, y + width * 0.28);
    ctx.lineTo(x + width * 0.88, y + width * 0.18);
    ctx.moveTo(x + width * 0.1, y + width * 0.65);
    ctx.lineTo(x + width * 0.76, y + width * 0.79);
    ctx.stroke();
  }
  if (animate && (seam || prism)) {
    const span = width * 2.4;
    const sweep = x + ((timeMs * unit * (seam ? 0.005 : 0.006) + px + py) % span) - width * 0.65;
    ctx.fillStyle = seam ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.34)';
    ctx.beginPath();
    ctx.moveTo(sweep, y + width);
    ctx.lineTo(sweep + width * 0.28, y + width);
    ctx.lineTo(sweep + width * 0.72, y);
    ctx.lineTo(sweep + width * 0.44, y);
    ctx.closePath();
    ctx.fill();
    if (prism) {
      const interference = x + ((timeMs * unit * 0.0014 + px * 0.32 + py * 0.17) % (width * 2.8)) - width * 0.9;
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.beginPath();
      ctx.moveTo(interference, y + width);
      ctx.lineTo(interference + width * 0.18, y + width);
      ctx.lineTo(interference + width * 0.56, y);
      ctx.lineTo(interference + width * 0.38, y);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(unit * 0.7, size * 0.027);
  roundedRectPath(ctx, x, y, width, width, radius);
  ctx.stroke();
  if (prism) {
    ctx.strokeStyle = 'rgba(255,255,255,0.82)';
    ctx.lineWidth = Math.max(unit * 0.55, size * 0.02);
    roundedRectPath(ctx, x + unit * 0.35, y + unit * 0.35,
      width - unit * 0.7, width - unit * 0.7, Math.max(0, radius - unit * 0.35));
    ctx.stroke();
  }
  if (animate && seam) {
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
    ctx.strokeStyle = COLORS.seam;
    ctx.lineWidth = Math.max(unit * 1.05, size * 0.042);
    roundedRectPath(ctx, x - unit * 0.25, y - unit * 0.25,
      width + unit * 0.5, width + unit * 0.5, radius + unit * 0.25);
    ctx.stroke();
  }
  ctx.restore();
}

function makeLayout(width, height, dpr) {
  const unit = dpr;
  const framePad = Math.max(unit * 4, Math.min(width, height) * 0.015);
  const verticalMargin = Math.max(unit * 6, height * 0.028);
  const contentCells = FACE_W + SEAM_W_CELLS * 2;
  const cell = Math.max(1, Math.min(
    (width - framePad * 2) / contentCells,
    (height - verticalMargin * 2) / ROWS,
  ));
  const seamW = cell * SEAM_W_CELLS;
  const boardW = cell * FACE_W;
  const boardH = cell * ROWS;
  const boardX = Math.round((width - boardW) * 0.5);
  const boardY = Math.round((height - boardH) * 0.5);
  const leftSeamX = boardX - seamW;
  const rightSeamX = boardX + boardW;
  return {
    width, height, cell, unit,
    boardX, boardY, boardW, boardH,
    boardRight: boardX + boardW,
    boardBottom: boardY + boardH,
    leftSeamX, rightSeamX, seamW,
    pageX: leftSeamX - framePad,
    pageY: boardY - framePad,
    pageW: boardW + seamW * 2 + framePad * 2,
    pageH: boardH + framePad * 2,
    stitchDash: [Math.max(unit * 1.25, cell * 0.095), Math.max(unit * 1.5, cell * 0.12)],
    seamGridDash: [Math.max(unit * 1.2, seamW * 0.12), Math.max(unit * 1.7, seamW * 0.18)],
    seamAccentDash: [Math.max(unit * 2, cell * 0.14), Math.max(unit * 1.6, cell * 0.1)],
    seamStitchDash: [Math.max(unit * 1.3, seamW * 0.13), Math.max(unit * 1.1, seamW * 0.1)],
  };
}

function makePaintCache(ctx, layout, palette) {
  const page = ctx.createLinearGradient(layout.pageX, layout.pageY, layout.pageX, layout.pageY + layout.pageH);
  page.addColorStop(0, palette.panel);
  page.addColorStop(0.48, palette.paper);
  page.addColorStop(1, palette.panel);
  const surface = ctx.createLinearGradient(layout.boardX, layout.boardY,
    layout.boardX + layout.boardW * 0.4, layout.boardY + layout.boardH);
  surface.addColorStop(0, palette.paper);
  surface.addColorStop(0.55, palette.paper);
  surface.addColorStop(1, palette.panel);
  return { page, surface };
}

function drawFrame(ctx, world, layout, palette, paints, grainPattern) {
  const radius = Math.max(layout.unit * 2.5, layout.unit * 0.7);
  ctx.save();
  roundedRectPath(ctx, layout.pageX, layout.pageY, layout.pageW, layout.pageH, radius);
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = layout.unit * (world === 'ink' ? 1.25 : 1.05);
  ctx.shadowOffsetX = layout.unit * 0.8;
  ctx.shadowOffsetY = layout.unit * 1.4;
  ctx.fillStyle = paints.page;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = rgba(palette.ink, world === 'ink' ? 0.52 : 0.46);
  ctx.lineWidth = Math.max(layout.unit * 0.85, 1);
  roundedRectPath(ctx, layout.pageX, layout.pageY, layout.pageW, layout.pageH, radius);
  ctx.stroke();
  if (grainPattern) {
    ctx.save();
    roundedRectPath(ctx, layout.pageX, layout.pageY, layout.pageW, layout.pageH, radius);
    ctx.clip();
    ctx.globalAlpha = world === 'ink' ? 0.82 : 0.95;
    ctx.fillStyle = grainPattern;
    ctx.fillRect(layout.pageX, layout.pageY, layout.pageW, layout.pageH);
    ctx.restore();
  }
  ctx.strokeStyle = rgba(palette.ink, world === 'ink' ? 0.34 : 0.22);
  ctx.lineWidth = Math.max(layout.unit * 0.6, 0.8);
  roundedRectPath(ctx, layout.boardX - layout.unit * 0.32, layout.boardY - layout.unit * 0.32,
    layout.boardW + layout.unit * 0.64, layout.boardH + layout.unit * 0.64, Math.max(layout.unit * 1.4, 1));
  ctx.stroke();
  ctx.restore();
}

function drawBoardSurface(ctx, world, layout, paints, grainPattern) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.boardX, layout.boardY, layout.boardW, layout.boardH);
  ctx.clip();
  ctx.fillStyle = paints.surface;
  ctx.fillRect(layout.boardX, layout.boardY, layout.boardW, layout.boardH);
  if (grainPattern) {
    ctx.globalAlpha = world === 'ink' ? 0.5 : 0.68;
    ctx.fillStyle = grainPattern;
    ctx.fillRect(layout.boardX, layout.boardY, layout.boardW, layout.boardH);
  }
  if (world === 'sun' || world === 'dawn') {
    ctx.strokeStyle = rgba(COLORS[world].ink, 0.055);
    ctx.lineWidth = Math.max(layout.unit * 0.4, 0.6);
    for (let x = -layout.boardH; x < layout.boardW; x += Math.max(layout.unit * 8, layout.boardW * 0.11)) {
      ctx.beginPath();
      ctx.moveTo(layout.boardX + x, layout.boardY + layout.boardH);
      ctx.lineTo(layout.boardX + x + layout.boardH * 0.24, layout.boardY);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = world === 'ink' ? 'rgba(0,0,0,0.12)' : 'rgba(90,58,51,0.06)';
    ctx.fillRect(layout.boardX, layout.boardY, layout.boardW, layout.boardH);
  }
  ctx.restore();
}

function drawStitchGrid(ctx, layout, palette) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.boardX, layout.boardY, layout.boardW, layout.boardH);
  ctx.clip();
  ctx.strokeStyle = rgba(palette.ink, palette === COLORS.ink ? 0.25 : 0.2);
  ctx.lineWidth = Math.max(layout.unit * 0.42, 0.65);
  ctx.setLineDash(layout.stitchDash);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let column = 0; column <= FACE_W; column += 1) {
    const x = layout.boardX + column * layout.cell;
    ctx.moveTo(x, layout.boardY);
    ctx.lineTo(x, layout.boardBottom);
  }
  for (let row = 0; row <= ROWS; row += 1) {
    const y = layout.boardY + row * layout.cell;
    ctx.moveTo(layout.boardX, y);
    ctx.lineTo(layout.boardRight, y);
  }
  ctx.stroke();
  ctx.restore();
}

function newSeamCaches() {
  return Array.from({ length: FACES.length }, () => ({
    signature: null,
    fill: new Float32Array(ROWS),
    kind: new Uint8Array(ROWS),
  }));
}

function ringSignature(ring) {
  if (!ring || !Array.isArray(ring.grid)) return 0;
  if (Number.isFinite(ring.revision)) return ring.revision;
  let hash = 2166136261;
  for (let y = 0; y < ROWS; y += 1) {
    const row = ring.grid[y];
    for (let rc = 0; rc < RING_COLS; rc += 1) {
      const cell = row && row[rc];
      hash = Math.imul(hash ^ (cell ? 1 : 0), 16777619);
      if (cell) {
        const type = typeof cell.t === 'string' ? cell.t : '';
        for (let i = 0; i < type.length; i += 1) {
          hash = Math.imul(hash ^ type.charCodeAt(i), 16777619);
        }
        hash = Math.imul(hash ^ (cell.w ? FACES.indexOf(cell.w) + 1 : 0), 16777619);
      }
    }
  }
  return hash >>> 0;
}

function updateSeamCache(cache, ring, face, signature) {
  if (cache.signature === signature) return;
  cache.signature = signature;
  for (let y = 0; y < ROWS; y += 1) {
    const row = ring && ring.grid[y];
    let filled = 0;
    let kind = 0;
    for (let c = 0; c < FACE_W; c += 1) {
      const cell = row && row[ringCol(face, c)];
      if (!cell) continue;
      filled += 1;
      if (cell.t === 'SEAM') kind = 2;
      else if (cell.t === 'G' && kind === 0) kind = 1;
      else if (kind === 0) kind = 3;
    }
    cache.fill[y] = filled / FACE_W;
    cache.kind[y] = kind;
  }
}

function drawSeamTab(ctx, world, x, y, width, palette, unit) {
  ctx.save();
  ctx.fillStyle = palette.panel;
  ctx.beginPath();
  ctx.moveTo(x + unit * 0.35, y);
  ctx.lineTo(x + width - unit * 0.35, y);
  ctx.lineTo(x + width - unit * 1.15, y - unit * 2.3);
  ctx.lineTo(x + unit * 1.15, y - unit * 2.3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(palette.ink, 0.52);
  ctx.lineWidth = Math.max(unit * 0.45, 0.75);
  ctx.stroke();
  ctx.font = `700 ${Math.max(6, unit * 5.2)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.ink;
  ctx.fillText(world.toUpperCase(), x + width * 0.5, y - unit * 1.15);
  ctx.restore();
}

function drawSeamStrip(ctx, ring, seamFace, edgeColumn, layout, timeMs, seamCaches, signature, options = {}) {
  const world = FACES[seamFace];
  const palette = COLORS[world];
  const cache = seamCaches[seamFace];
  const animate = options.animate !== false;
  updateSeamCache(cache, ring, seamFace, signature);
  const x = edgeColumn === 0 ? layout.rightSeamX : layout.leftSeamX;
  const rowHeight = layout.cell;
  const innerX = x + Math.max(layout.unit * 1.1, layout.seamW * 0.09);
  const innerW = Math.max(1, layout.seamW - Math.max(layout.unit * 2.2, layout.seamW * 0.18));

  ctx.save();
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = Math.max(layout.unit * 2.4, layout.seamW * 0.14);
  ctx.shadowOffsetX = edgeColumn === 0 ? layout.unit * 1.2 : -layout.unit * 1.2;
  ctx.shadowOffsetY = layout.unit * 1.8;
  ctx.fillStyle = palette.paper;
  ctx.fillRect(x, layout.boardY, layout.seamW, layout.boardH);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = rgba(palette.ink, world === 'ink' ? 0.72 : 0.58);
  ctx.lineWidth = Math.max(layout.unit * 0.9, 1);
  ctx.strokeRect(x, layout.boardY, layout.seamW, layout.boardH);

  for (let row = 0; row < ROWS; row += 1) {
    const rowY = layout.boardY + row * rowHeight;
    const fill = cache.fill[row];
    const kind = cache.kind[row];
    const fillWidth = innerW * fill;
    if (fillWidth > 0) {
      const fillHeight = Math.max(layout.unit * 2.2, rowHeight * 0.68);
      const fillY = rowY + (rowHeight - fillHeight) * 0.5;
      ctx.fillStyle = kind === 2 ? COLORS.seam
        : (kind === 1 ? palette.garbage : rgba(palette.ink, 0.82));
      ctx.fillRect(edgeColumn === 0 ? innerX : innerX + innerW - fillWidth,
        fillY, fillWidth, fillHeight);
      if (kind === 1) {
        ctx.strokeStyle = rgba(palette.garbageEdge, 0.62);
        ctx.lineWidth = Math.max(layout.unit * 0.42, 0.7);
        ctx.beginPath();
        ctx.moveTo(innerX + innerW * 0.12, fillY + fillHeight * 0.26);
        ctx.lineTo(innerX + innerW * 0.78, fillY + fillHeight * 0.7);
        ctx.moveTo(innerX + innerW * 0.58, fillY + fillHeight * 0.18);
        ctx.lineTo(innerX + innerW * 0.94, fillY + fillHeight * 0.52);
        ctx.stroke();
      }
    }
    if (animate && kind === 2) {
      ctx.strokeStyle = 'rgba(255,247,201,0.92)';
      ctx.lineWidth = Math.max(layout.unit * 0.55, 0.8);
      ctx.setLineDash(layout.seamStitchDash);
      ctx.lineDashOffset = -(timeMs * 0.004 + row * layout.unit * 0.2);
      ctx.beginPath();
      ctx.moveTo(x + layout.unit * 0.4, rowY + rowHeight * 0.5);
      ctx.lineTo(x + layout.seamW - layout.unit * 0.4, rowY + rowHeight * 0.5);
      ctx.stroke();
    }

    // A shared edge is a real ring column, not a decorative seam hint. Draw
    // it at full cell strength over the narrow profile strip.
    const cell = ring && ring.grid[row] && ring.grid[row][ringCol(seamFace, edgeColumn)];
    if (cell) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, rowY, layout.seamW, rowHeight);
      ctx.clip();
      drawCell(ctx, x + (layout.seamW - layout.cell) * 0.5, rowY, layout.cell,
        cell, palette, world, timeMs, layout.unit, { animate });
      ctx.restore();
    }
  }

  ctx.setLineDash(layout.seamGridDash);
  ctx.lineDashOffset = 0;
  ctx.strokeStyle = rgba(palette.ink, world === 'ink' ? 0.28 : 0.22);
  ctx.lineWidth = Math.max(layout.unit * 0.38, 0.65);
  ctx.beginPath();
  for (let row = 0; row <= ROWS; row += 1) {
    const y = layout.boardY + row * rowHeight;
    ctx.moveTo(x, y);
    ctx.lineTo(x + layout.seamW, y);
  }
  ctx.stroke();
  drawSeamTab(ctx, world, x, layout.boardY, layout.seamW, palette, layout.unit);
  ctx.restore();
}

function drawSeamShimmer(ctx, px, py, size, timeMs, unit) {
  const inset = Math.max(unit * 0.9, size * 0.065);
  const x = px + inset;
  const y = py + inset;
  const width = Math.max(1, size - inset * 2);
  const span = width * 2.4;
  const sweep = x + ((timeMs * unit * 0.005 + px + py) % span) - width * 0.65;
  ctx.save();
  roundedRectPath(ctx, x, y, width, width, Math.min(size * 0.17, unit * 3.8));
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.moveTo(sweep, y + width);
  ctx.lineTo(sweep + width * 0.28, y + width);
  ctx.lineTo(sweep + width * 0.72, y);
  ctx.lineTo(sweep + width * 0.44, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255,247,200,0.78)';
  ctx.lineWidth = Math.max(unit * 0.5, size * 0.018);
  ctx.setLineDash([Math.max(unit * 1.8, size * 0.13), Math.max(unit * 1.5, size * 0.11)]);
  ctx.lineDashOffset = -(timeMs * unit * 0.004 + px * 0.2);
  ctx.beginPath();
  ctx.moveTo(x + width * 0.05, y + width * 0.52);
  ctx.lineTo(x + width * 0.95, y + width * 0.52);
  ctx.stroke();
  ctx.restore();
}

function seamRowHasSeam(ring, face, row) {
  const cells = ring && ring.grid[row];
  if (!cells) return false;
  for (let column = 0; column < FACE_W; column += 1) {
    if (cells[ringCol(face, column)] && cells[ringCol(face, column)].t === 'SEAM') return true;
  }
  return false;
}

function drawSeamStripAnimationOverlay(ctx, ring, seamFace, edgeColumn, layout, timeMs) {
  const x = edgeColumn === 0 ? layout.rightSeamX : layout.leftSeamX;
  const innerX = x + Math.max(layout.unit * 1.1, layout.seamW * 0.09);
  const innerW = Math.max(1, layout.seamW - Math.max(layout.unit * 2.2, layout.seamW * 0.18));
  const rowHeight = layout.cell;
  for (let row = 0; row < ROWS; row += 1) {
    if (!seamRowHasSeam(ring, seamFace, row)) continue;
    const rowY = layout.boardY + row * rowHeight;
    const sweepWidth = Math.max(layout.unit * 2.2, innerW * 0.34);
    const sweep = innerX + ((timeMs * 0.004 + row * layout.unit * 0.2) % (innerW + sweepWidth)) - sweepWidth;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, rowY, layout.seamW, rowHeight);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(sweep, rowY + rowHeight);
    ctx.lineTo(sweep + sweepWidth * 0.28, rowY + rowHeight);
    ctx.lineTo(sweep + sweepWidth * 0.72, rowY);
    ctx.lineTo(sweep + sweepWidth * 0.44, rowY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,247,201,0.92)';
    ctx.lineWidth = Math.max(layout.unit * 0.55, 0.8);
    ctx.setLineDash(layout.seamStitchDash);
    ctx.lineDashOffset = -(timeMs * 0.004 + row * layout.unit * 0.2);
    ctx.beginPath();
    ctx.moveTo(x + layout.unit * 0.4, rowY + rowHeight * 0.5);
    ctx.lineTo(x + layout.seamW - layout.unit * 0.4, rowY + rowHeight * 0.5);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSeamAnimationOverlay(ctx, ring, face, layout, timeMs) {
  if (!ring) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.boardX, layout.boardY, layout.boardW, layout.boardH);
  ctx.clip();
  for (let row = 0; row < ROWS; row += 1) {
    const cells = ring.grid[row];
    for (let column = 0; column < FACE_W; column += 1) {
      const cell = cells && cells[ringCol(face, column)];
      if (cell && cell.t === 'SEAM') {
        drawSeamShimmer(ctx, layout.boardX + column * layout.cell,
          layout.boardY + row * layout.cell, layout.cell, timeMs, layout.unit);
      }
    }
  }
  ctx.restore();
  drawSeamStripAnimationOverlay(ctx, ring, nextFace(face, -1), FACE_W - 1, layout, timeMs);
  drawSeamStripAnimationOverlay(ctx, ring, nextFace(face, 1), 0, layout, timeMs);
}

function drawFaceCells(ctx, ring, face, world, layout, timeMs) {
  if (!ring) return;
  const palette = COLORS[world];
  for (let row = 0; row < ROWS; row += 1) {
    const cells = ring.grid[row];
    for (let column = 0; column < FACE_W; column += 1) {
      const cell = cells && cells[ringCol(face, column)];
      if (!cell) continue;
      drawCell(ctx, layout.boardX + column * layout.cell, layout.boardY + row * layout.cell,
        layout.cell, cell, palette, world, timeMs, layout.unit, { animate: false });
    }
  }
}

function drawSeamAccents(ctx, ring, face, layout) {
  if (!ring) return;
  const palette = COLORS[FACES[face]];
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.boardX, layout.boardY, layout.boardW, layout.boardH);
  ctx.clip();
  ctx.strokeStyle = 'rgba(247,215,116,0.58)';
  ctx.lineWidth = Math.max(layout.unit * 0.55, layout.cell * 0.018);
  ctx.setLineDash(layout.seamAccentDash);
  for (let row = 0; row < ROWS; row += 1) {
    const cells = ring.grid[row];
    let hasSeam = false;
    for (let column = 0; column < FACE_W; column += 1) {
      if (cells && cells[ringCol(face, column)] && cells[ringCol(face, column)].t === 'SEAM') {
        hasSeam = true;
        break;
      }
    }
    if (!hasSeam) continue;
    ctx.beginPath();
    ctx.moveTo(layout.boardX + layout.unit * 1.2, layout.boardY + row * layout.cell + layout.cell * 0.5);
    ctx.lineTo(layout.boardRight - layout.unit * 1.2, layout.boardY + row * layout.cell + layout.cell * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function faceLocalColumn(face, rc) {
  const offset = wrap(rc - ringCol(face, 0), RING_COLS);
  return offset <= FACE_W - 1 ? offset : -1;
}

function sideForRc(viewFace, rc) {
  return ringDirectionToward(viewFace, [rc]);
}

function boardSignatureForGhost(ring) {
  return ringSignature(ring);
}

function createGhostState() {
  return { ring: null, signature: null, key: '', cells: [] };
}

function ghostCellsFor(piece, ring, ghostState) {
  if (!piece || !ring) return [];
  const key = `${piece.t}:${piece.x}:${piece.y}:${piece.rot}:${piece.prism === true}`;
  const signature = boardSignatureForGhost(ring);
  if (ghostState.ring === ring && ghostState.signature === signature && ghostState.key === key) {
    return ghostState.cells;
  }
  const source = cellsOf(piece);
  const probe = [[0, 0], [0, 0], [0, 0], [0, 0]];
  let drop = 0;
  for (let step = 1; step <= ROWS + 6; step += 1) {
    for (let i = 0; i < source.length; i += 1) {
      probe[i][0] = source[i][0];
      probe[i][1] = source[i][1] + step;
    }
    if (collides(ring, probe)) break;
    drop = step;
  }
  ghostState.ring = ring;
  ghostState.signature = signature;
  ghostState.key = key;
  ghostState.cells = source.map((position) => [position[0], position[1] + drop]);
  return ghostState.cells;
}

function drawGoldProfiles(ctx, positions, viewFace, layout) {
  profileRowsLeft.fill(0);
  profileRowsRight.fill(0);
  for (let i = 0; i < positions.length; i += 1) {
    const row = positions[i][1];
    if (row < 0 || row >= ROWS) continue;
    const rc = wrap(positions[i][0], RING_COLS);
    if (faceLocalColumn(viewFace, rc) >= 0) continue;
    if (sideForRc(viewFace, rc) < 0) profileRowsLeft[row] = 1;
    else profileRowsRight[row] = 1;
  }
  const width = Math.min(layout.cell * 0.86, layout.seamW * 0.82);
  const drawRows = (rows, left) => {
    for (let row = 0; row < ROWS; row += 1) {
      if (!rows[row]) continue;
      const x = left
        ? layout.leftSeamX + layout.seamW * 0.08
        : layout.rightSeamX + layout.seamW * 0.08;
      const y = layout.boardY + row * layout.cell + layout.cell * 0.16;
      ctx.save();
      ctx.fillStyle = 'rgba(247,215,116,0.22)';
      ctx.strokeStyle = COLORS.seam;
      ctx.lineWidth = Math.max(layout.unit * 0.8, layout.cell * 0.035);
      roundedRectPath(ctx, x + (left ? layout.seamW - width * 1.08 : 0), y,
        width, layout.cell * 0.68, layout.cell * 0.12);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  };
  drawRows(profileRowsLeft, true);
  drawRows(profileRowsRight, false);
}

function drawPrismMotes(ctx, positions, face, layout, timeMs) {
  const phase = timeMs * 0.00125;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,248,205,0.82)';
  ctx.lineCap = 'round';
  for (let i = 0; i < positions.length; i += 1) {
    const rc = wrap(positions[i][0], RING_COLS);
    const column = faceLocalColumn(face, rc);
    const row = positions[i][1];
    if (column < 0 || row < 0 || row >= ROWS) continue;
    const cx = layout.boardX + (column + 0.5) * layout.cell;
    const cy = layout.boardY + (row + 0.5) * layout.cell;
    for (let mote = 0; mote < 2; mote += 1) {
      const orbit = phase + i * 1.71 + mote * 3.07;
      const mx = cx + Math.sin(orbit) * layout.cell * (0.25 + mote * 0.07);
      const my = cy + Math.cos(orbit * 0.83) * layout.cell * (0.24 + mote * 0.06);
      const alpha = 0.30 + (Math.sin(orbit * 1.6) + 1) * 0.16;
      ctx.globalAlpha = reducedMotion() ? 0.34 : alpha;
      ctx.lineWidth = Math.max(layout.unit * 0.45, layout.cell * 0.018);
      ctx.beginPath();
      ctx.moveTo(mx - layout.cell * 0.10, my);
      ctx.lineTo(mx + layout.cell * 0.10, my);
      ctx.moveTo(mx, my - layout.cell * 0.10);
      ctx.lineTo(mx, my + layout.cell * 0.10);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPieceForFace(ctx, piece, ring, face, layout, timeMs, ghostState, withProfiles = false) {
  if (!piece || !ring) return;
  const world = FACES[face];
  const palette = COLORS[world];
  const ghost = ghostCellsFor(piece, ring, ghostState);
  const active = cellsOf(piece);
  const value = { t: piece.t, prism: piece.prism === true };
  for (let i = 0; i < ghost.length; i += 1) {
    const rc = wrap(ghost[i][0], RING_COLS);
    const column = faceLocalColumn(face, rc);
    const row = ghost[i][1];
    if (column < 0 || row < 0 || row >= ROWS) continue;
    drawCell(ctx, layout.boardX + column * layout.cell, layout.boardY + row * layout.cell,
      layout.cell, value, palette, world, timeMs, layout.unit, { ghost: true });
  }
  for (let i = 0; i < active.length; i += 1) {
    const rc = wrap(active[i][0], RING_COLS);
    const column = faceLocalColumn(face, rc);
    const row = active[i][1];
    if (column < 0 || row < 0 || row >= ROWS) continue;
    drawCell(ctx, layout.boardX + column * layout.cell, layout.boardY + row * layout.cell,
      layout.cell, value, palette, world, timeMs, layout.unit);
  }
  if (piece.prism === true) drawPrismMotes(ctx, active, face, layout, timeMs);
  if (withProfiles) drawGoldProfiles(ctx, active, face, layout);
}

function drawFrameShell(ctx, face, layout, paints, grainPattern) {
  const world = FACES[face];
  const palette = COLORS[world];
  drawFrame(ctx, world, layout, palette, paints[face], grainPattern[face]);
  drawBoardSurface(ctx, world, layout, paints[face], grainPattern[face]);
}

// Keep cached sheets on the same canvas implementation as the visible canvas
// when a document is available. Some browser builds accept an OffscreenCanvas
// as a drawImage source but silently discard its pixels after the source has
// been painted. The renderer must not depend on that implementation detail.
function blitSheet(ctx, source, alpha = 1) {
  if (!source || alpha <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
  ctx.drawImage(source, 0, 0);
  ctx.restore();
}

function projectImage(ctx, source, layout, destinationX, destinationW, alpha = 1) {
  if (!source || destinationW <= 0 || alpha <= 0) return;
  const sourceSlice = layout.boardW / FOLD_SLICES;
  const destinationSlice = destinationW / FOLD_SLICES;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let slice = 0; slice < FOLD_SLICES; slice += 1) {
    const sourceX = layout.boardX + slice * sourceSlice;
    const destX = destinationX + slice * destinationSlice;
    ctx.drawImage(source, sourceX, layout.boardY, sourceSlice + 0.8, layout.boardH,
      destX, layout.boardY, Math.max(0.55, destinationSlice + 0.8), layout.boardH);
  }
  ctx.restore();
}

function drawCreaseShadow(ctx, layout, x, strength) {
  if (strength <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.28 * strength;
  ctx.fillStyle = '#000000';
  ctx.shadowColor = 'rgba(0,0,0,0.42)';
  ctx.shadowBlur = Math.max(layout.cell * 1.6, 4);
  ctx.fillRect(x - layout.unit * 0.9, layout.boardY, layout.unit * 1.4, layout.boardH);
  ctx.restore();
}

function drawRingRipple(ctx, layout, timeMs, startedAt) {
  if (!Number.isFinite(startedAt)) return;
  const age = timeMs - startedAt;
  if (age < 0 || age > 820) return;
  const progress = age / 820;
  const alpha = (1 - progress) * 0.78;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = COLORS.seam;
  ctx.lineWidth = Math.max(layout.unit * 0.8, 1.2);
  ctx.setLineDash([layout.cell * 0.24, layout.cell * 0.18]);
  ctx.lineDashOffset = -age * 0.08;
  roundedRectPath(ctx,
    layout.leftSeamX - layout.cell * progress * 0.22,
    layout.boardY - layout.cell * progress * 0.18,
    layout.boardW + layout.seamW * 2 + layout.cell * progress * 0.44,
    layout.boardH + layout.cell * progress * 0.36,
    layout.cell * 0.26);
  ctx.stroke();
  for (let i = 0; i < 3; i += 1) {
    const y = layout.boardY + ((progress * 1.25 + i * 0.34) % 1.1) * layout.boardH;
    ctx.globalAlpha = alpha * (0.6 - i * 0.13);
    ctx.beginPath();
    ctx.moveTo(layout.leftSeamX, y);
    ctx.lineTo(layout.rightSeamX + layout.seamW, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawIdleSheen(ctx, ring, face, layout, timeMs) {
  if (!ring || reducedMotion()) return;
  const cycle = ((timeMs % IDLE_SHEEN_PERIOD) + IDLE_SHEEN_PERIOD) % IDLE_SHEEN_PERIOD;
  if (cycle > IDLE_SHEEN_LENGTH) return;
  const progress = cycle / IDLE_SHEEN_LENGTH;
  const sweep = -0.24 + progress * 1.48;
  const band = 0.16;
  const world = FACES[face];

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.boardX, layout.boardY, layout.boardW, layout.boardH);
  ctx.clip();
  for (let row = 0; row < ROWS; row += 1) {
    const cells = ring.grid[row];
    if (!cells) continue;
    for (let column = 0; column < FACE_W; column += 1) {
      const cell = cells[ringCol(face, column)];
      if (!cell) continue;
      const along = column / Math.max(1, FACE_W - 1) * 0.72
        + row / Math.max(1, ROWS - 1) * 0.28;
      const distance = Math.abs(along - sweep);
      if (distance >= band) continue;
      const alpha = (1 - distance / band) * 0.12;
      const px = layout.boardX + column * layout.cell;
      const py = layout.boardY + row * layout.cell;
      ctx.save();
      ctx.globalAlpha = alpha;
      roundedRectPath(ctx, px + layout.cell * 0.06, py + layout.cell * 0.06,
        layout.cell * 0.88, layout.cell * 0.88, layout.cell * 0.12);
      ctx.clip();
      ctx.fillStyle = world === 'ink' ? '#dff7ff' : '#fffdf4';
      ctx.beginPath();
      ctx.moveTo(px - layout.cell * 0.20, py + layout.cell * 1.08);
      ctx.lineTo(px + layout.cell * 0.12, py + layout.cell * 1.08);
      ctx.lineTo(px + layout.cell * 1.16, py - layout.cell * 0.12);
      ctx.lineTo(px + layout.cell * 0.84, py - layout.cell * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

function faceDangerLevel(ring, face) {
  if (!ring || !Array.isArray(ring.grid)) return 0;
  let danger = 0;
  for (let column = 0; column < FACE_W; column += 1) {
    const rc = ringCol(face, column);
    for (let row = 0; row < ROWS; row += 1) {
      if (ring.grid[row] && ring.grid[row][rc]) {
        danger = Math.max(danger, (ROWS - row) / ROWS);
        break;
      }
    }
  }
  return danger;
}

function drawDangerVignette(ctx, ring, face, layout, timeMs, gradient) {
  const danger = faceDangerLevel(ring, face);
  if (danger <= 0.70) return;
  const strength = clamp((danger - 0.70) / 0.30, 0, 1);
  const pulse = reducedMotion() ? 0.35 : 0.52 + Math.sin(timeMs * Math.PI * 2 / 3200) * 0.48;
  ctx.save();
  ctx.globalAlpha = (0.34 + strength * 0.66) * (0.07 + pulse * 0.10);
  ctx.fillStyle = gradient || 'rgba(170,35,43,0.75)';
  ctx.fillRect(layout.leftSeamX - layout.cell, layout.pageY,
    layout.pageW + layout.cell * 2, layout.boardH * 0.48);
  ctx.globalAlpha *= 0.52;
  ctx.strokeStyle = '#b7444d';
  ctx.lineWidth = Math.max(layout.unit * 0.8, layout.cell * 0.025);
  ctx.beginPath();
  ctx.moveTo(layout.leftSeamX, layout.boardY - layout.unit * 0.5);
  for (let i = 0; i <= 8; i += 1) {
    const x = layout.leftSeamX + layout.pageW * i / 8;
    const y = layout.boardY - layout.unit * (0.4 + (i % 3) * 0.55);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawFaceCellsOffset(ctx, ring, face, world, layout, timeMs, maxRow, offset) {
  if (!ring || maxRow < 0) return;
  const palette = COLORS[world];
  for (let row = 0; row <= maxRow && row < ROWS; row += 1) {
    const cells = ring.grid[row];
    for (let column = 0; column < FACE_W; column += 1) {
      const cell = cells && cells[ringCol(face, column)];
      if (!cell) continue;
      drawCell(ctx, layout.boardX + column * layout.cell,
        layout.boardY + row * layout.cell + offset, layout.cell,
        cell, palette, world, timeMs, layout.unit, { animate: false });
    }
  }
}

function drawClearReveal(ctx, ring, face, layout, paint, grainPattern, timeMs, clearState) {
  if (!clearState || clearState.count <= 0) return;
  const age = timeMs - clearState.startedAt;
  if (age < 0 || age > CLEAR_FLASH_MS) return;

  if (age < CLEAR_SETTLE_MS && ring) {
    const maxRow = clearState.maxRow - 1;
    if (maxRow >= 0) {
      const settle = -layout.cell * 0.11 * (1 - easeOutBack(age / CLEAR_SETTLE_MS));
      ctx.save();
      ctx.beginPath();
      ctx.rect(layout.boardX, layout.boardY, layout.boardW,
        Math.max(0, clearState.maxRow * layout.cell));
      ctx.clip();
      drawBoardSurface(ctx, FACES[face], layout, paint, grainPattern);
      drawStitchGrid(ctx, layout, COLORS[FACES[face]]);
      drawFaceCellsOffset(ctx, ring, face, FACES[face], layout, timeMs, maxRow, settle);
      ctx.restore();
    }
  }

  const flash = Math.sin(clamp(age / CLEAR_FLASH_MS, 0, 1) * Math.PI);
  for (let i = 0; i < clearState.count; i += 1) {
    const row = clearState.rows[i];
    const y = layout.boardY + row * layout.cell;
    ctx.save();
    ctx.globalAlpha = flash * (reducedMotion() ? 0.28 : 0.52);
    ctx.fillStyle = '#fffdf2';
    ctx.fillRect(layout.leftSeamX, y, layout.pageW, layout.cell);
    ctx.globalAlpha *= 0.62;
    ctx.strokeStyle = '#fff8df';
    ctx.lineWidth = Math.max(layout.unit * 0.9, layout.cell * 0.035);
    ctx.beginPath();
    ctx.moveTo(layout.leftSeamX, y + layout.cell * 0.48);
    for (let tooth = 1; tooth <= 12; tooth += 1) {
      const x = layout.leftSeamX + layout.pageW * tooth / 12;
      ctx.lineTo(x, y + layout.cell * (0.42 + (tooth % 2) * 0.12));
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawLockPolish(ctx, ring, face, layout, timeMs, lockState) {
  if (!lockState || lockState.count <= 0 || reducedMotion()) return;
  const age = timeMs - lockState.startedAt;
  if (age < 0 || age > LOCK_SETTLE_MS) return;
  const t = clamp(age / LOCK_SETTLE_MS, 0, 1);
  const squash = 0.92 + easeOutBack(t) * 0.08;
  const trailT = clamp(age / HARD_TRAIL_MS, 0, 1);
  const palette = COLORS[FACES[face]];

  for (let i = 0; i < lockState.count; i += 1) {
    const rc = lockState.columns[i];
    const row = lockState.rows[i];
    const column = faceLocalColumn(face, rc);
    if (column < 0 || row < 0 || row >= ROWS) continue;
    const cell = ring && ring.grid[row] && ring.grid[row][rc];
    if (!cell) continue;
    const px = layout.boardX + column * layout.cell;
    const py = layout.boardY + row * layout.cell;
    if (trailT < 1) {
      for (let trail = 1; trail <= 3; trail += 1) {
        ctx.save();
        ctx.globalAlpha = (1 - trailT) * (0.18 - trail * 0.035);
        drawCell(ctx, px, py - layout.cell * (trail * 0.18) * (1 - trailT), layout.cell,
          cell, palette, FACES[face], timeMs, layout.unit, { ghost: true });
        ctx.restore();
      }
    }
    const cx = px + layout.cell * 0.5;
    const cy = py + layout.cell * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, squash);
    ctx.translate(-cx, -cy);
    drawCell(ctx, px, py, layout.cell, cell, palette, FACES[face], timeMs, layout.unit,
      { animate: false });
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.18;
    ctx.fillStyle = palette.ink;
    ctx.fillRect(px + layout.cell * 0.18, py + layout.cell * 0.87,
      layout.cell * 0.64, Math.max(layout.unit * 0.7, layout.cell * 0.035));
    ctx.restore();
  }
}

function pieceIsOffFace(piece, face) {
  if (!piece) return false;
  const positions = cellsOf(piece);
  for (let i = 0; i < positions.length; i += 1) {
    if (faceLocalColumn(face, wrap(positions[i][0], RING_COLS)) >= 0) return false;
  }
  return true;
}

function drawAutoFoldArrow(ctx, piece, face, direction, layout, progress) {
  if (!piece || !pieceIsOffFace(piece, face) || reducedMotion()) return;
  const edgeX = direction < 0 ? layout.leftSeamX : layout.rightSeamX;
  const centerY = layout.boardY + layout.boardH * 0.5;
  const startX = layout.boardX + layout.boardW * 0.5;
  const endX = edgeX + direction * layout.seamW * 0.38;
  const alpha = 0.62 * (1 - clamp(progress * 2.5, 0, 1));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = COLORS.seam;
  ctx.fillStyle = '#fff0a8';
  ctx.lineWidth = Math.max(layout.unit * 1.1, layout.cell * 0.045);
  ctx.lineCap = 'round';
  ctx.setLineDash([layout.cell * 0.22, layout.cell * 0.14]);
  ctx.beginPath();
  ctx.moveTo(startX, centerY);
  ctx.lineTo(endX, centerY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(endX, centerY);
  ctx.lineTo(endX - direction * layout.cell * 0.34, centerY - layout.cell * 0.22);
  ctx.lineTo(endX - direction * layout.cell * 0.34, centerY + layout.cell * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawFoldPolish(ctx, gameState, layout, from, direction, progress, cameraAngle, timeMs, highlightGradient) {
  const reduced = reducedMotion();
  const edgeX = direction < 0 ? layout.leftSeamX : layout.rightSeamX;
  const ramp = Math.sin(clamp(progress, 0, 1) * Math.PI);
  const width = layout.cell * 4;
  ctx.save();
  ctx.globalAlpha = (reduced ? 0.48 : 0.86) * (0.18 + ramp * 0.82);
  ctx.fillStyle = highlightGradient || 'rgba(255,247,190,0.24)';
  ctx.fillRect(edgeX - width, layout.boardY - layout.cell, width * 2,
    layout.boardH + layout.cell * 2);
  ctx.restore();

  if (!reduced) {
    const beat = progress < 0.5 ? progress * 2 : (progress - 0.5) * 2;
    const streakAlpha = (0.12 + ramp * 0.23) * (progress < 0.5 ? 1 - beat * 0.4 : 0.6 + beat * 0.4);
    ctx.save();
    ctx.globalAlpha = streakAlpha;
    ctx.strokeStyle = '#fff7d0';
    ctx.lineCap = 'round';
    for (let streak = 0; streak < 5; streak += 1) {
      const y = layout.boardY + layout.boardH * (0.18 + streak * 0.16);
      const length = layout.boardW * (0.09 + (1 - beat) * 0.17) * (1 - streak * 0.07);
      const fromX = direction < 0 ? edgeX : edgeX - length;
      const toX = direction < 0 ? edgeX + length : edgeX;
      ctx.lineWidth = Math.max(layout.unit * 0.55, layout.cell * (0.018 + streak * 0.002));
      ctx.beginPath();
      ctx.moveTo(fromX, y + Math.sin(timeMs * 0.004 + streak) * layout.unit * 0.8);
      ctx.lineTo(toX, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = reduced ? 0.18 : 0.28 + ramp * 0.42;
  ctx.strokeStyle = COLORS.seam;
  ctx.lineWidth = Math.max(layout.unit * 1.1, layout.cell * 0.055);
  ctx.beginPath();
  ctx.moveTo(edgeX, layout.boardY - layout.cell * 0.5);
  ctx.lineTo(edgeX, layout.boardBottom + layout.cell * 0.5);
  ctx.stroke();
  ctx.restore();
  drawAutoFoldArrow(ctx, gameState.piece, from, direction, layout, progress);
  if (Number.isFinite(cameraAngle) && Math.abs(cameraAngle) > 0.01) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.18, Math.abs(cameraAngle) * 0.06);
    ctx.fillStyle = '#7a4f35';
    ctx.fillRect(edgeX - direction * layout.unit * 0.9, layout.boardY,
      layout.unit * 1.8, layout.boardH);
    ctx.restore();
  }
}

function drawFoldDonePolish(ctx, layout, timeMs, lastFoldAt) {
  if (!Number.isFinite(lastFoldAt)) return;
  const age = timeMs - lastFoldAt;
  if (age < 0 || age > FOLD_DONE_MS) return;
  const progress = clamp(age / FOLD_DONE_MS, 0, 1);
  const fade = reducedMotion() ? 0.22 : (1 - progress) * (0.78 - progress * 0.18);
  const cx = layout.boardX + layout.boardW * 0.5;
  const cy = layout.boardY + layout.boardH * 0.48;
  ctx.save();
  ctx.globalAlpha = fade * 0.55;
  ctx.strokeStyle = COLORS.seam;
  ctx.lineWidth = Math.max(layout.unit * 0.8, layout.cell * 0.035);
  ctx.setLineDash([layout.cell * 0.20, layout.cell * 0.14]);
  roundedRectPath(ctx, layout.leftSeamX, layout.boardY,
    layout.boardW + layout.seamW * 2, layout.boardH, layout.cell * 0.2);
  ctx.stroke();
  if (!reducedMotion()) {
    ctx.setLineDash([]);
    for (let flutter = 0; flutter < 7; flutter += 1) {
      const angle = flutter * 0.91 + 0.25;
      const distance = layout.cell * (1.4 + progress * 7.0 + flutter * 0.35);
      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * distance * 0.58;
      ctx.save();
      ctx.globalAlpha = fade * (0.82 - flutter * 0.07);
      ctx.translate(x, y);
      ctx.rotate(angle + progress * 1.6);
      ctx.fillStyle = flutter % 2 ? '#fff0a8' : '#f7d774';
      ctx.fillRect(-layout.cell * 0.10, -layout.cell * 0.035,
        layout.cell * 0.20, layout.cell * 0.07);
      ctx.restore();
    }
  }
  ctx.restore();
}

function makeDangerGradient(ctx, layout) {
  const gradient = ctx.createLinearGradient(0, layout.pageY, 0,
    layout.boardY + layout.boardH * 0.52);
  gradient.addColorStop(0, 'rgba(174,38,48,0.88)');
  gradient.addColorStop(0.32, 'rgba(174,38,48,0.28)');
  gradient.addColorStop(1, 'rgba(174,38,48,0)');
  return gradient;
}

function makeFoldGradient(ctx, layout, direction) {
  const edgeX = direction < 0 ? layout.leftSeamX : layout.rightSeamX;
  const width = layout.cell * 4;
  const gradient = ctx.createLinearGradient(edgeX - width, layout.boardY,
    edgeX + width, layout.boardY);
  gradient.addColorStop(0, 'rgba(255,247,190,0)');
  gradient.addColorStop(0.5, 'rgba(255,247,190,0.36)');
  gradient.addColorStop(1, 'rgba(255,247,190,0)');
  return gradient;
}

export function createRenderer(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new TypeError('createRenderer(canvas) requires a canvas element');
  }
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) throw new Error('FLIPSIDE renderer could not acquire a 2D context');

  let dpr = 1;
  let layout = makeLayout(390, 844, dpr);
  let measuredWidth = 0;
  let measuredHeight = 0;
  let measuredCssWidth = 0;
  let measuredCssHeight = 0;
  let dprMedia = null;
  let resizeObserver = null;
  let grainPatterns = [];
  let paintCaches = [];
  let faceSheets = [];
  let dangerGradients = [];
  let foldGradients = [];
  let seamCaches = newSeamCaches();
  let ghostState = createGhostState();
  let ringCountSeen = -1;
  let ringRippleStarted = -1;
  let previousRefs = new Array(ROWS * RING_COLS).fill(null);
  let previousRefSet = new Set();
  let currentRefSet = new Set();
  const missingRows = new Uint8Array(ROWS);
  const lockColumns = new Int16Array(24);
  const lockRows = new Int16Array(24);
  const clearRows = new Int16Array(ROWS);
  const currentRefs = new Array(ROWS * RING_COLS).fill(null);
  let snapshotReady = false;
  let piecesSeen = -1;
  let linesSeen = -1;
  const lockState = { count: 0, startedAt: -1, columns: lockColumns, rows: lockRows };
  const clearState = { count: 0, maxRow: -1, startedAt: -1, rows: clearRows };

  function currentDpr() {
    return clamp(Number(globalThis.devicePixelRatio) || 1, 1, MAX_DPR);
  }

  function handleDprChange() {
    resize();
    watchDpr();
  }

  function watchDpr() {
    const view = canvas.ownerDocument && canvas.ownerDocument.defaultView
      ? canvas.ownerDocument.defaultView : globalThis;
    if (!view || typeof view.matchMedia !== 'function') return;
    try {
      if (dprMedia && typeof dprMedia.removeEventListener === 'function') dprMedia.removeEventListener('change', handleDprChange);
      else if (dprMedia && typeof dprMedia.removeListener === 'function') dprMedia.removeListener(handleDprChange);
      dprMedia = view.matchMedia(`(resolution: ${dpr}dppx)`);
      if (typeof dprMedia.addEventListener === 'function') dprMedia.addEventListener('change', handleDprChange);
      else if (typeof dprMedia.addListener === 'function') dprMedia.addListener(handleDprChange);
    } catch (_) {
      dprMedia = null;
    }
  }

  function measureCanvas() {
    const rect = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : null;
    const parent = canvas.parentElement;
    const fallbackWidth = parent && parent.clientWidth ? parent.clientWidth : (globalThis.innerWidth || 390);
    const fallbackHeight = parent && parent.clientHeight ? parent.clientHeight : (globalThis.innerHeight || 844);
    const cssWidth = Math.max(1, Math.round(Number(canvas.clientWidth) || (rect && rect.width) || fallbackWidth));
    const cssHeight = Math.max(1, Math.round(Number(canvas.clientHeight) || (rect && rect.height) || fallbackHeight));
    const nextDpr = currentDpr();
    return {
      cssWidth, cssHeight, dpr: nextDpr,
      width: Math.max(1, Math.round(cssWidth * nextDpr)),
      height: Math.max(1, Math.round(cssHeight * nextDpr)),
    };
  }

  function resetRingTracking() {
    previousRefs.fill(null);
    currentRefs.fill(null);
    previousRefSet.clear();
    currentRefSet.clear();
    snapshotReady = false;
    piecesSeen = -1;
    linesSeen = -1;
    lockState.count = 0;
    lockState.startedAt = -1;
    clearState.count = 0;
    clearState.maxRow = -1;
    clearState.startedAt = -1;
  }

  function observeRingState(gameState, timeMs) {
    const ring = ringOf(gameState);
    if (!ring) {
      resetRingTracking();
      return;
    }
    const stats = gameState.stats || {};
    const pieces = Number.isFinite(Number(stats.pieces)) ? Number(stats.pieces) : 0;
    const lines = Number.isFinite(Number(gameState.lines)) ? Number(gameState.lines) : 0;
    currentRefSet.clear();
    for (let row = 0; row < ROWS; row += 1) {
      const cells = ring.grid[row];
      for (let rc = 0; rc < RING_COLS; rc += 1) {
        const cell = cells && cells[rc];
        currentRefs[row * RING_COLS + rc] = cell;
        if (cell) currentRefSet.add(cell);
      }
    }

    const freshRun = !snapshotReady || pieces < piecesSeen || lines < linesSeen;
    if (!freshRun && lines > linesSeen) {
      missingRows.fill(0);
      for (let row = 0; row < ROWS; row += 1) {
        for (let rc = 0; rc < RING_COLS; rc += 1) {
          const oldCell = previousRefs[row * RING_COLS + rc];
          if (oldCell && !currentRefSet.has(oldCell)) missingRows[row] += 1;
        }
      }
      clearState.count = 0;
      clearState.maxRow = -1;
      for (let row = 0; row < ROWS; row += 1) {
        if (missingRows[row] < 4 || clearState.count >= ROWS) continue;
        clearRows[clearState.count] = row;
        clearState.maxRow = Math.max(clearState.maxRow, row);
        clearState.count += 1;
      }
      if (clearState.count === 0) {
        let bestRow = ROWS - 1;
        let bestMissing = 0;
        for (let row = 0; row < ROWS; row += 1) {
          if (missingRows[row] > bestMissing) {
            bestMissing = missingRows[row];
            bestRow = row;
          }
        }
        clearRows[0] = bestRow;
        clearState.count = 1;
        clearState.maxRow = bestRow;
      }
      clearState.startedAt = timeMs;
    } else if (freshRun) {
      clearState.count = 0;
      clearState.maxRow = -1;
    }

    if (!freshRun && pieces > piecesSeen) {
      lockState.count = 0;
      lockState.startedAt = timeMs;
      for (let row = 0; row < ROWS; row += 1) {
        for (let rc = 0; rc < RING_COLS; rc += 1) {
          const cell = ring.grid[row] && ring.grid[row][rc];
          if (!cell || previousRefSet.has(cell) || lockState.count >= lockColumns.length) continue;
          lockColumns[lockState.count] = rc;
          lockRows[lockState.count] = row;
          lockState.count += 1;
        }
      }
    } else if (freshRun) {
      lockState.count = 0;
    }

    const oldPrevious = previousRefSet;
    previousRefSet = currentRefSet;
    currentRefSet = oldPrevious;
    for (let index = 0; index < currentRefs.length; index += 1) {
      previousRefs[index] = currentRefs[index];
    }
    snapshotReady = true;
    piecesSeen = pieces;
    linesSeen = lines;
  }

  function resize() {
    const measured = measureCanvas();
    if (measured.width === measuredWidth && measured.height === measuredHeight
      && measured.cssWidth === measuredCssWidth && measured.cssHeight === measuredCssHeight
      && measured.dpr === dpr) return layout;
    dpr = measured.dpr;
    measuredWidth = measured.width;
    measuredHeight = measured.height;
    measuredCssWidth = measured.cssWidth;
    measuredCssHeight = measured.cssHeight;
    if (canvas.width !== measured.width) canvas.width = measured.width;
    if (canvas.height !== measured.height) canvas.height = measured.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    layout = makeLayout(measured.width, measured.height, dpr);
    cellSpriteCache.clear();
    ghostState = createGhostState();
    seamCaches = newSeamCaches();
    grainPatterns = new Array(FACES.length);
    paintCaches = new Array(FACES.length);
    faceSheets = new Array(FACES.length);
    dangerGradients = new Array(FACES.length);
    foldGradients = [makeFoldGradient(ctx, layout, -1), makeFoldGradient(ctx, layout, 1)];
    for (let face = 0; face < FACES.length; face += 1) {
      grainPatterns[face] = makeGrainPattern(ctx, FACES[face], dpr);
      paintCaches[face] = makePaintCache(ctx, layout, COLORS[FACES[face]]);
      dangerGradients[face] = makeDangerGradient(ctx, layout);
      const sheetCanvas = makeScratchCanvas(measured.width, measured.height);
      faceSheets[face] = {
        canvas: sheetCanvas,
        ctx: sheetCanvas && sheetCanvas.getContext('2d'),
        signature: null,
        pieceCanvas: makeScratchCanvas(measured.width, measured.height),
      };
      faceSheets[face].pieceCtx = faceSheets[face].pieceCanvas
        && faceSheets[face].pieceCanvas.getContext('2d');
    }
    for (let i = 0; i < CELL_TYPES.length; i += 1) {
      const type = CELL_TYPES[i];
      // Warm the sprite cache on a scratch target. Drawing the warm-up onto
      // the live canvas leaves a tiny permanent block at the origin before
      // the first board sheet is composited.
      const warmup = makeScratchCanvas(layout.cell + dpr * 8, layout.cell + dpr * 8);
      const warmupCtx = warmup && warmup.getContext('2d');
      if (warmupCtx) {
        getCellSprite(warmupCtx, dpr * 4, dpr * 4, layout.cell,
          { t: type }, COLORS.sun, 'sun', dpr);
        getCellSprite(warmupCtx, dpr * 4, dpr * 4, layout.cell,
          { t: type }, COLORS.dusk, 'dusk', dpr);
        getCellSprite(warmupCtx, dpr * 4, dpr * 4, layout.cell,
          { t: type }, COLORS.ink, 'ink', dpr);
        getCellSprite(warmupCtx, dpr * 4, dpr * 4, layout.cell,
          { t: type }, COLORS.dawn, 'dawn', dpr);
      }
    }
    resetRingTracking();
    watchDpr();
    return layout;
  }

  function repaintFaceSheet(face, gameState, ring, signature, timeMs) {
    const sheet = faceSheets[face];
    if (!sheet || !sheet.ctx || sheet.signature === signature) return;
    const world = FACES[face];
    const ctx2 = sheet.ctx;
    ctx2.setTransform(1, 0, 0, 1, 0, 0);
    ctx2.globalCompositeOperation = 'source-over';
    ctx2.globalAlpha = 1;
    ctx2.clearRect(0, 0, layout.width, layout.height);
    drawFrameShell(ctx2, face, layout, paintCaches, grainPatterns);
    drawSeamStrip(ctx2, ring, nextFace(face, -1), FACE_W - 1, layout, timeMs, seamCaches, signature,
      { animate: false });
    drawSeamStrip(ctx2, ring, nextFace(face, 1), 0, layout, timeMs, seamCaches, signature,
      { animate: false });
    drawStitchGrid(ctx2, layout, COLORS[world]);
    drawFaceCells(ctx2, ring, face, world, layout, timeMs);
    drawSeamAccents(ctx2, ring, face, layout);
    sheet.signature = signature;
  }

  function repaintPieceSheet(face, gameState, ring, timeMs) {
    const sheet = faceSheets[face];
    if (!sheet || !sheet.pieceCtx) return;
    const pieceCtx = sheet.pieceCtx;
    pieceCtx.setTransform(1, 0, 0, 1, 0, 0);
    pieceCtx.globalCompositeOperation = 'source-over';
    pieceCtx.globalAlpha = 1;
    pieceCtx.clearRect(0, 0, layout.width, layout.height);
    drawPieceForFace(pieceCtx, gameState.piece, ring, face, layout, timeMs, ghostState, true);
  }

  function observeRingClear(gameState, timeMs) {
    const rings = gameState.stats && Number(gameState.stats.rings);
    if (Number.isFinite(rings)) {
      if (ringCountSeen < 0) ringCountSeen = rings;
      else if (rings > ringCountSeen) {
        ringRippleStarted = timeMs;
        ringCountSeen = rings;
      } else if (rings < ringCountSeen) {
        ringCountSeen = rings;
      }
    }
    if (Number.isFinite(gameState.lastRingClearAt) && gameState.lastRingClearAt !== ringRippleStarted) {
      ringRippleStarted = gameState.lastRingClearAt;
    }
  }

  function drawNormal(gameState, width, height) {
    const face = faceIndex(gameState.face, faceIndex(gameState.world, 0));
    const world = FACES[face];
    const ring = ringOf(gameState);
    const signature = ringSignature(ring);
    const timeMs = Number.isFinite(gameState.timeMs) ? gameState.timeMs : 0;
    const animationTime = reducedMotion() ? 0 : timeMs;
    observeRingState(gameState, timeMs);
    repaintFaceSheet(face, gameState, ring, signature, animationTime);
    drawBackground(ctx, world, animationTime, width, height);
    if (faceSheets[face] && faceSheets[face].canvas) blitSheet(ctx, faceSheets[face].canvas);
    drawClearReveal(ctx, ring, face, layout, paintCaches[face], grainPatterns[face], timeMs, clearState);
    drawSeamAnimationOverlay(ctx, ring, face, layout, animationTime);
    drawIdleSheen(ctx, ring, face, layout, animationTime);
    drawLockPolish(ctx, ring, face, layout, timeMs, lockState);
    drawPieceForFace(ctx, gameState.piece, ring, face, layout, animationTime, ghostState, true);
    observeRingClear(gameState, timeMs);
    drawDangerVignette(ctx, ring, face, layout, animationTime, dangerGradients[face]);
    drawFoldDonePolish(ctx, layout, timeMs, gameState.lastFoldAt);
    drawRingRipple(ctx, layout, animationTime, ringRippleStarted);
  }

  function drawCrossfade(gameState, from, to, progress, width, height, timeMs) {
    const ring = ringOf(gameState);
    const signature = ringSignature(ring);
    repaintFaceSheet(from, gameState, ring, signature, timeMs);
    repaintFaceSheet(to, gameState, ring, signature, timeMs);
    const alpha = clamp(progress, 0, 1);
    drawBackground(ctx, FACES[from], timeMs, width, height);
    if (alpha > 0) {
      ctx.save();
      ctx.globalAlpha = alpha;
      drawBackground(ctx, FACES[to], timeMs, width, height);
      ctx.restore();
    }
    if (faceSheets[from] && faceSheets[from].canvas) blitSheet(ctx, faceSheets[from].canvas);
    drawSeamAnimationOverlay(ctx, ring, from, layout, timeMs);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (faceSheets[to] && faceSheets[to].canvas) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(faceSheets[to].canvas, 0, 0);
    }
    drawSeamAnimationOverlay(ctx, ring, to, layout, timeMs);
    drawPieceForFace(ctx, gameState.piece, ring, to, layout, timeMs, ghostState, true);
    ctx.restore();
    if (alpha < 1) drawPieceForFace(ctx, gameState.piece, ring, from, layout, timeMs, ghostState, true);
  }

  function drawFold(gameState, cam, width, height) {
    const fold = gameState.fold || {};
    const from = faceIndex(fold.from, faceIndex(gameState.face, 0));
    const direction = typeof cam.dir === 'function' ? cam.dir() : (Number(fold.dir) < 0 ? -1 : 1);
    const to = faceIndex(fold.to, nextFace(from, direction));
    const progress = clamp(Number(cam.progress && cam.progress()) || 0, 0, 1);
    const cameraAngle = typeof cam.angle === 'function'
      ? Number(cam.angle()) || 0
      : direction * Math.sin(progress * Math.PI) * Math.PI * 0.5;
    const timeMs = Number.isFinite(gameState.timeMs) ? gameState.timeMs : 0;
    const ring = ringOf(gameState);
    const signature = ringSignature(ring);
    const reduced = typeof cam.reduced === 'function' && cam.reduced();
    repaintFaceSheet(from, gameState, ring, signature, timeMs);
    repaintFaceSheet(to, gameState, ring, signature, timeMs);

    if (reduced || (typeof cam.mode === 'function' && cam.mode() === 'crossfade')) {
      drawCrossfade(gameState, from, to, progress, width, height, timeMs);
      drawFoldPolish(ctx, gameState, layout, from, direction, progress, cameraAngle, timeMs,
        foldGradients[direction < 0 ? 0 : 1]);
      return;
    }

    const firstBeat = progress < 0.5;
    const beat = firstBeat ? progress * 2 : (progress - 0.5) * 2;
    const edgeX = direction < 0 ? layout.leftSeamX : layout.rightSeamX;
    const boardSource = faceSheets[firstBeat ? from : to] && faceSheets[firstBeat ? from : to].canvas;
    const pieceSource = faceSheets[firstBeat ? from : to] && faceSheets[firstBeat ? from : to].pieceCanvas;
    repaintPieceSheet(firstBeat ? from : to, gameState, ring, timeMs);

    drawBackground(ctx, FACES[from], timeMs, width, height);
    drawFrameShell(ctx, from, layout, paintCaches, grainPatterns);
    drawSeamStrip(ctx, ring, nextFace(from, -1), FACE_W - 1, layout, timeMs, seamCaches, signature);
    drawSeamStrip(ctx, ring, nextFace(from, 1), 0, layout, timeMs, seamCaches, signature);

    if (firstBeat) {
      const destinationX = layout.boardX + (edgeX - layout.boardX) * beat;
      const destinationW = layout.boardW + (layout.seamW - layout.boardW) * beat;
      projectImage(ctx, boardSource, layout, destinationX, destinationW);
      projectImage(ctx, pieceSource, layout, destinationX, destinationW);
      drawCreaseShadow(ctx, layout, direction < 0 ? destinationX + destinationW : destinationX,
        Math.max(beat, Math.abs(cameraAngle) / (Math.PI * 0.5)));
    } else {
      ctx.save();
      ctx.globalAlpha = beat;
      drawFrameShell(ctx, to, layout, paintCaches, grainPatterns);
      drawSeamStrip(ctx, ring, nextFace(to, -1), FACE_W - 1, layout, timeMs, seamCaches, signature);
      drawSeamStrip(ctx, ring, nextFace(to, 1), 0, layout, timeMs, seamCaches, signature);
      ctx.restore();
      const destinationX = edgeX + (layout.boardX - edgeX) * beat;
      const destinationW = layout.seamW + (layout.boardW - layout.seamW) * beat;
      projectImage(ctx, boardSource, layout, destinationX, destinationW);
      projectImage(ctx, pieceSource, layout, destinationX, destinationW);
      drawCreaseShadow(ctx, layout, direction < 0 ? destinationX : destinationX + destinationW,
        Math.max(1 - beat, Math.abs(cameraAngle) / (Math.PI * 0.5)));
    }
    drawFoldPolish(ctx, gameState, layout, from, direction, progress, cameraAngle, timeMs,
      foldGradients[direction < 0 ? 0 : 1]);
  }

  function draw(gameState, cam) {
    if (!gameState) return;
    if (!measuredWidth || !measuredHeight || currentDpr() !== dpr) resize();
    const width = measuredWidth || canvas.width || layout.width;
    const height = measuredHeight || canvas.height || layout.height;
    const folding = !!(gameState.fold && cam && typeof cam.progress === 'function');
    if (folding) drawFold(gameState, cam, width, height);
    else drawNormal(gameState, width, height);
  }

  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(canvas);
  }

  return { resize, draw };
}
