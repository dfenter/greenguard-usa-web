// FLIPSIDE HUD — LANE L8
//
// DOM class registry used by css/style.css:
// .hud-top, .hud-score, .hud-lines, .hud-phase, .hud-next, .hud-hold,
// .face-compass > .fdot / .fdot.here / .fdot.danger,
// .world-tag, .toast, .banner,
// .screen.title/.pause/.over/.win, .screen .logo, .screen .stats,
// .btn, .btn-primary, #btn-fold-left, #btn-fold-right, .tc-btn,
// and #btn-pause.

import { COLORS, FACE_W, FACES, QUEUE_LEN, ROWS, ringCol } from '../config.js';
import * as boardOps from '../core/board.js';

const MINI_WIDTH = 76;
const MINI_HEIGHT = 50;
const MINI_CELL = 12;
const TOAST_MS = 1350;
const BANNER_MS = 1550;

const MINI_SHAPES = Object.freeze({
  I: Object.freeze([[0, 1], [1, 1], [2, 1], [3, 1]]),
  O: Object.freeze([[1, 0], [2, 0], [1, 1], [2, 1]]),
  T: Object.freeze([[1, 0], [0, 1], [1, 1], [2, 1]]),
  S: Object.freeze([[1, 0], [2, 0], [0, 1], [1, 1]]),
  Z: Object.freeze([[0, 0], [1, 0], [1, 1], [2, 1]]),
  J: Object.freeze([[0, 0], [0, 1], [1, 1], [2, 1]]),
  L: Object.freeze([[2, 0], [0, 1], [1, 1], [2, 1]]),
});

function node(tag, className, text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function button(className, label, action, onClick) {
  const el = node('button', className, label);
  el.type = 'button';
  if (action) el.dataset.action = action;
  if (onClick) el.addEventListener('click', onClick);
  return el;
}

function statRow(stats, label) {
  const row = node('div', 'stat-row');
  const name = node('span', '', label);
  const value = node('strong');
  row.append(name, value);
  stats.append(row);
  return { el: value, last: null, row };
}

function setStat(ref, value) {
  const text = String(value);
  if (ref.last === text) return;
  ref.last = text;
  ref.el.textContent = text;
}

function formatNumber(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-US');
}

function readBestScore() {
  try {
    const value = Number.parseInt(window.localStorage.getItem('flipside.best') || '0', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (_error) {
    return 0;
  }
}

function writeBestScore(value) {
  try {
    window.localStorage.setItem('flipside.best', String(Math.max(0, Math.floor(value))));
    return true;
  } catch (_error) {
    // Private browsing and embedded webviews may deny storage. The HUD still works.
    return false;
  }
}

function pieceEntry(entry) {
  if (typeof entry === 'string') return { t: entry.toUpperCase(), prism: false };
  if (entry && typeof entry === 'object') {
    return {
      t: typeof entry.t === 'string' ? entry.t.toUpperCase() : '',
      prism: Boolean(entry.prism),
    };
  }
  return { t: '', prism: false };
}

function pieceKey(entry) {
  const piece = pieceEntry(entry);
  return `${piece.t}:${piece.prism ? 1 : 0}`;
}

function darken(hex, amount = 0.7) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16);
    return Math.max(0, Math.min(255, Math.round(value * amount)))
      .toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

function roundedPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
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

function prismFill(ctx, x, y, size, palette) {
  const hues = Object.values(palette.minos);
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  const count = Math.max(1, hues.length - 1);
  hues.forEach((color, index) => gradient.addColorStop(index / count, color));
  return gradient;
}

function drawMini(canvas, entry, palette) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const piece = pieceEntry(entry);
  const dpr = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1));
  if (canvas.width !== MINI_WIDTH * dpr || canvas.height !== MINI_HEIGHT * dpr) {
    canvas.width = MINI_WIDTH * dpr;
    canvas.height = MINI_HEIGHT * dpr;
  }

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, MINI_WIDTH, MINI_HEIGHT);

  const cells = MINI_SHAPES[piece.t];
  if (!cells) {
    ctx.restore();
    canvas.removeAttribute('data-piece');
    canvas.setAttribute('aria-label', 'Empty piece preview');
    return;
  }

  const minX = Math.min(...cells.map(([x]) => x));
  const maxX = Math.max(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  const maxY = Math.max(...cells.map(([, y]) => y));
  const width = (maxX - minX + 1) * MINI_CELL;
  const height = (maxY - minY + 1) * MINI_CELL;
  const originX = (MINI_WIDTH - width) / 2 - minX * MINI_CELL;
  const originY = (MINI_HEIGHT - height) / 2 - minY * MINI_CELL;
  const color = palette.minos[piece.t] || palette.garbage;

  for (const [cellX, cellY] of cells) {
    const x = originX + cellX * MINI_CELL + 0.5;
    const y = originY + cellY * MINI_CELL + 0.5;
    const size = MINI_CELL - 1;

    ctx.save();
    ctx.fillStyle = palette.shadow;
    roundedPath(ctx, x + 1.5, y + 1.5, size, size, 3);
    ctx.fill();

    ctx.fillStyle = piece.prism ? prismFill(ctx, x, y, size, palette) : color;
    roundedPath(ctx, x, y, size, size, 3);
    ctx.fill();
    ctx.strokeStyle = piece.prism ? '#ffffff' : darken(color);
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(x + 2.5, y + 2);
    ctx.lineTo(x + size - 2.5, y + 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
  canvas.dataset.piece = piece.t;
  canvas.setAttribute('aria-label', `${piece.prism ? 'Prism ' : ''}${piece.t} piece preview`);
}

function makeMini(label) {
  const canvas = node('canvas', 'mini');
  canvas.width = MINI_WIDTH;
  canvas.height = MINI_HEIGHT;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  canvas.title = label;
  return canvas;
}

function makeMetric(className, label) {
  const wrap = node('div', className);
  const caption = node('span', 'hud-label', label);
  const value = node('strong', 'hud-value');
  wrap.append(caption, value);
  return { wrap, value };
}

function setHidden(el, hidden) {
  if (el.hidden === hidden) return;
  el.hidden = hidden;
  el.setAttribute('aria-hidden', String(hidden));
}

function makeScreen(kind, title, subtitle = '') {
  const screen = node('section', `screen ${kind}`);
  screen.hidden = true;
  screen.setAttribute('aria-hidden', 'true');
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');

  const heading = node('h1', 'logo');
  if (kind === 'title') {
    heading.classList.add('logo-cutouts');
    heading.setAttribute('aria-label', title);
    Array.from(title).forEach((character, index) => {
      const letter = node('span', 'logo-letter', character === ' ' ? '\u00a0' : character);
      letter.dataset.index = String(index);
      letter.setAttribute('aria-hidden', 'true');
      heading.append(letter);
    });
  } else {
    heading.textContent = title;
  }
  screen.append(heading);
  if (subtitle) screen.append(node('p', 'screen-subtitle', subtitle));
  const stats = node('div', 'stats');
  screen.append(stats);
  const actions = node('div', 'screen-actions');
  screen.append(actions);
  return { screen, stats, actions };
}

function invoke(hooks, name, ...args) {
  if (hooks && typeof hooks[name] === 'function') return hooks[name](...args);
  return undefined;
}

function worldName(world) {
  const name = typeof world === 'string' ? world.toLowerCase() : 'sun';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}side`;
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function faceForState(state) {
  if (Number.isInteger(state?.face)) return ((state.face % FACES.length) + FACES.length) % FACES.length;
  const legacy = FACES.indexOf(typeof state?.world === 'string' ? state.world.toLowerCase() : 'sun');
  return legacy >= 0 ? legacy : 0;
}

function cellIsFilled(cell) {
  return cell != null;
}

// v5 board.js exposes faceDanger(); this local fallback keeps the HUD
// decoupled from a lane that may still be shipping that helper.
function faceDangerFor(state, face) {
  if (typeof boardOps.faceDanger === 'function' && state?.ring) {
    const value = Number(boardOps.faceDanger(state.ring, face));
    if (Number.isFinite(value)) return Math.max(0, Math.min(1, value));
  }
  if (typeof state?.faceDanger === 'function') {
    const value = Number(state.faceDanger(face));
    if (Number.isFinite(value)) return Math.max(0, Math.min(1, value));
  }
  if (Array.isArray(state?.faceDanger)) {
    const value = Number(state.faceDanger[face]);
    if (Number.isFinite(value)) return Math.max(0, Math.min(1, value));
  }

  const ring = state?.ring;
  if (ring?.grid && Array.isArray(ring.grid)) {
    let highest = ROWS;
    for (let y = 0; y < Math.min(ROWS, ring.grid.length); y += 1) {
      const row = ring.grid[y] || [];
      for (let c = 0; c < FACE_W; c += 1) {
        if (cellIsFilled(row[ringCol(face, c)])) highest = Math.min(highest, y);
      }
    }
    return highest === ROWS ? 0 : Math.max(0, Math.min(1, (ROWS - highest) / ROWS));
  }

  const board = state?.boards?.[FACES[face]];
  if (board?.grid) {
    let highest = ROWS;
    for (let y = 0; y < Math.min(ROWS, board.grid.length); y += 1) {
      if ((board.grid[y] || []).some(cellIsFilled)) highest = y;
    }
    return highest === ROWS ? 0 : Math.max(0, Math.min(1, (ROWS - highest) / ROWS));
  }
  return 0;
}

export function createHud(G, hooks = {}) {
  const ui = document.getElementById('ui');
  if (!ui) throw new Error('FLIPSIDE HUD requires a #ui root');

  ui.replaceChildren();

  const top = node('div', 'hud-top');
  const score = makeMetric('hud-score', 'SCORE');
  const lines = makeMetric('hud-lines', 'LINES');
  const phase = makeMetric('hud-phase', 'PHASE');

  const hold = node('div', 'hud-hold');
  hold.append(node('span', 'hud-label', 'HOLD'));
  const holdCanvas = makeMini('Empty hold piece');
  hold.append(holdCanvas);

  const next = node('div', 'hud-next');
  next.append(node('span', 'hud-label', 'NEXT'));
  const nextCanvases = [];
  for (let index = 0; index < QUEUE_LEN; index += 1) {
    const canvas = makeMini(`Next piece ${index + 1}`);
    nextCanvases.push(canvas);
    next.append(canvas);
  }

  const worldTag = node('div', 'world-tag', 'SUNSIDE');
  worldTag.setAttribute('aria-live', 'polite');

  const faceCompass = node('div', 'face-compass');
  faceCompass.setAttribute('role', 'img');
  faceCompass.setAttribute('aria-label', 'Cube face compass');
  const faceDots = FACES.map((face) => {
    const dot = node('span', 'fdot');
    dot.dataset.face = face;
    dot.setAttribute('aria-label', worldName(face));
    dot.title = worldName(face);
    faceCompass.append(dot);
    return dot;
  });

  top.append(score.wrap, lines.wrap, phase.wrap, hold, next);

  const toast = node('div', 'toast');
  toast.hidden = true;
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('aria-atomic', 'true');
  const toastFlame = node('span', 'combo-flame');
  toastFlame.setAttribute('aria-hidden', 'true');
  const toastCopy = node('span', 'toast-copy');
  toast.append(toastFlame, toastCopy);

  const banner = node('div', 'banner phase-up');
  banner.hidden = true;
  banner.setAttribute('aria-live', 'polite');
  banner.setAttribute('aria-atomic', 'true');
  const waxSeal = node('span', 'wax-seal');
  waxSeal.setAttribute('aria-hidden', 'true');
  const bannerCopy = node('span', 'banner-copy');
  banner.append(waxSeal, bannerCopy);

  const titleScreen = makeScreen('title', 'FLIPSIDE', 'A four-face papercraft Tetris');
  const titleBest = statRow(titleScreen.stats, 'Best score');
  titleScreen.stats.classList.add('best-score-card');
  titleBest.row.classList.add('best-score-row');
  const titleHowTo = node('div', 'how-to');
  titleHowTo.hidden = true;
  titleHowTo.textContent = 'Drag to move • tap to rotate • swipe down to drop • hold a piece • fold left or right to follow the ring.';
  titleScreen.stats.after(titleHowTo);

  const pauseScreen = makeScreen('pause', 'Paused', 'The fold is held in place.');
  const pauseScore = statRow(pauseScreen.stats, 'Score');
  const pauseLines = statRow(pauseScreen.stats, 'Lines');
  const pausePhase = statRow(pauseScreen.stats, 'Phase');

  const overScreen = makeScreen('over', 'Fold failed', 'Any face can top out the cube.');
  const overFace = statRow(overScreen.stats, 'Failed face');
  const overScore = statRow(overScreen.stats, 'Score');
  const overLines = statRow(overScreen.stats, 'Lines');
  const overPhase = statRow(overScreen.stats, 'Phase');
  const overBest = statRow(overScreen.stats, 'Best score');
  const overPieces = statRow(overScreen.stats, 'Pieces');

  const winScreen = makeScreen('win', 'You mended the Fold', 'All four faces are stitched together.');
  const winScore = statRow(winScreen.stats, 'Score');
  const winLines = statRow(winScreen.stats, 'Lines');
  const winPhase = statRow(winScreen.stats, 'Phase');
  const winBest = statRow(winScreen.stats, 'Best score');
  const winTetris = statRow(winScreen.stats, 'Tetrises');

  const initialSettings = invoke(hooks, 'getSettings');
  // `muted` is stored as the inverse of the user-facing Sound toggle.
  const settingState = {
    muted: typeof initialSettings?.muted === 'boolean' ? !initialSettings.muted : true,
    music: typeof initialSettings?.music === 'boolean' ? initialSettings.music : true,
    sfx: typeof initialSettings?.sfx === 'boolean' ? initialSettings.sfx : true,
  };
  const settingButtons = [];

  const syncSettingLabels = () => {
    for (const setting of settingButtons) {
      const enabled = settingState[setting.key];
      setting.el.textContent = `${setting.label}: ${enabled ? 'On' : 'Off'}`;
      setting.el.setAttribute('aria-pressed', String(enabled));
    }
  };

  const addSettingButton = (parent, key, label, hookName) => {
    const initialEnabled = Boolean(settingState[key]);
    const el = button('btn', `${label}: ${initialEnabled ? 'On' : 'Off'}`, null, () => {
      const result = invoke(hooks, hookName);
      settingState[key] = typeof result === 'boolean' ? !result : !settingState[key];
      syncSettingLabels();
    });
    el.setAttribute('aria-pressed', String(initialEnabled));
    settingButtons.push({ el, key, label });
    parent.append(el);
    return el;
  };

  titleScreen.actions.append(
    button('btn btn-primary', 'Start folding', null, () => invoke(hooks, 'start')),
  );
  const howToButton = button('btn', 'How to play', null, () => {
    titleHowTo.hidden = !titleHowTo.hidden;
    howToButton.textContent = titleHowTo.hidden ? 'How to play' : 'Hide how to play';
  });
  titleScreen.actions.append(howToButton);
  addSettingButton(titleScreen.actions, 'muted', 'Sound', 'toggleMute');

  pauseScreen.actions.append(
    button('btn btn-primary', 'Resume', null, () => invoke(hooks, 'resume')),
    button('btn', 'Restart run', null, () => invoke(hooks, 'restart')),
  );
  addSettingButton(pauseScreen.actions, 'muted', 'Sound', 'toggleMute');
  addSettingButton(pauseScreen.actions, 'music', 'Music', 'toggleMusic');
  addSettingButton(pauseScreen.actions, 'sfx', 'SFX', 'toggleSfx');

  overScreen.actions.append(
    button('btn btn-primary', 'Try again', null, () => invoke(hooks, 'restart')),
  );

  winScreen.actions.append(
    button('btn btn-primary', 'Keep folding', null, () => invoke(hooks, 'keepFolding')),
  );

  ui.append(top, worldTag, faceCompass, toast, banner, titleScreen.screen, pauseScreen.screen, overScreen.screen, winScreen.screen);

  const touchControls = document.getElementById('touch-controls');
  if (touchControls) {
    touchControls.replaceChildren();
    const pauseButton = button('tc-btn btn', 'Ⅱ', 'pause');
    pauseButton.id = 'btn-pause';
    pauseButton.setAttribute('aria-label', 'Pause');
    const ccwButton = button('tc-btn btn', '⟲', 'rotccw');
    ccwButton.id = 'btn-rot-ccw';
    ccwButton.setAttribute('aria-label', 'Rotate counterclockwise');
    const holdButton = button('tc-btn btn', 'HOLD', 'hold');
    holdButton.id = 'btn-hold';
    holdButton.setAttribute('aria-label', 'Hold piece');
    const foldLeft = button('tc-btn btn btn-primary fold-hero fold-hero-left', '↶', 'flip_left');
    foldLeft.id = 'btn-fold-left';
    foldLeft.setAttribute('aria-label', 'Fold left around the cube');
    foldLeft.title = 'Fold left (Q / Shift)';
    const foldRight = button('tc-btn btn btn-primary fold-hero fold-hero-right', '↷', 'flip_right');
    foldRight.id = 'btn-fold-right';
    foldRight.setAttribute('aria-label', 'Fold right around the cube');
    foldRight.title = 'Fold right (F / E)';
    const cwButton = button('tc-btn btn', '⟳', 'rotcw');
    cwButton.id = 'btn-rot-cw';
    cwButton.setAttribute('aria-label', 'Rotate clockwise');
    top.append(pauseButton);
    touchControls.append(ccwButton, holdButton, foldLeft, foldRight, cwButton);
    touchControls.setAttribute('aria-label', 'Touch controls');
  }

  let bestScore = readBestScore();
  let displayedScore = 0;
  let lastScoreTarget = null;
  let lastRenderedScore = null;
  let lastDisplayedText = null;
  let lastScoreBucket = null;
  let scorePopToggle = false;
  let lastLines = null;
  let lastPhase = null;
  let lastWorld = null;
  let lastQueueKey = null;
  let lastHoldKey = null;
  let lastCompassKey = null;
  let lastStatus = null;
  let lastCombo = null;
  let lastB2b = null;
  let toastPopToggle = false;
  let bannerUntil = 0;
  let toastUntil = 0;
  let lastBestCommitted = bestScore;
  let lastSummaryKey = null;

  const themeColorMeta = typeof document.querySelector === 'function'
    ? document.querySelector('meta[name="theme-color"]')
    : null;

  function updateThemeColor(world) {
    if (!themeColorMeta) return;
    themeColorMeta.setAttribute('content', COLORS[world]?.paper || COLORS.sun.paper);
  }

  function renderScore() {
    if (displayedScore === lastRenderedScore) return;
    lastRenderedScore = displayedScore;
    const text = formatNumber(displayedScore);
    if (text === lastDisplayedText) return;
    lastDisplayedText = text;
    score.value.textContent = text;
  }

  function snapScoreAtBoundary() {
    scorePopToggle = !scorePopToggle;
    score.value.classList.toggle('score-pop-a', scorePopToggle);
    score.value.classList.toggle('score-pop-b', !scorePopToggle);
  }

  function setToast(text, comboLevel = 0) {
    toastCopy.textContent = text;
    toast.dataset.comboLevel = String(Math.max(0, comboLevel));
    toast.classList.toggle('combo-ticker', comboLevel > 0);
    toast.classList.toggle('b2b-toast', comboLevel <= 0);
    toastPopToggle = !toastPopToggle;
    toast.classList.toggle('toast-pop-a', toastPopToggle);
    toast.classList.toggle('toast-pop-b', !toastPopToggle);
  }

  function updateScreens(state, status) {
    const visible = {
      title: status === 'title',
      pause: status === 'paused',
      over: status === 'gameover',
      win: status === 'won',
    };
    setHidden(titleScreen.screen, !visible.title);
    setHidden(pauseScreen.screen, !visible.pause);
    setHidden(overScreen.screen, !visible.over);
    setHidden(winScreen.screen, !visible.win);

    if (touchControls) {
      const showControls = status === 'playing' || status === 'folding' || status === 'clearing';
      setHidden(touchControls, !showControls);
    }

    const stats = state.stats || {};
    const summaryKey = [
      status,
      state.score,
      state.lines,
      state.phase,
      state.overFace,
      stats.pieces,
      stats.tetris,
      bestScore,
    ].join('|');
    if (summaryKey === lastSummaryKey) return;
    lastSummaryKey = summaryKey;

    setStat(titleBest, formatNumber(bestScore));
    setStat(pauseScore, formatNumber(state.score));
    setStat(pauseLines, numberValue(state.lines));
    setStat(pausePhase, numberValue(state.phase, 1));

    const failed = state.overFace != null
      ? worldName(typeof state.overFace === 'number' ? FACES[state.overFace] : state.overFace)
      : 'Any face';
    setStat(overFace, failed);
    setStat(overScore, formatNumber(state.score));
    setStat(overLines, numberValue(state.lines));
    setStat(overPhase, numberValue(state.phase, 1));
    setStat(overBest, formatNumber(bestScore));
    setStat(overPieces, numberValue(stats.pieces));

    setStat(winScore, formatNumber(state.score));
    setStat(winLines, numberValue(state.lines));
    setStat(winPhase, numberValue(state.phase, 1));
    setStat(winBest, formatNumber(bestScore));
    setStat(winTetris, numberValue(stats.tetris));
  }

  function updatePreview(state, world) {
    const palette = COLORS[world] || COLORS.sun;
    const queue = Array.isArray(state.queue) ? state.queue : [];
    const queueKey = `${world}|${Array.from({ length: QUEUE_LEN }, (_, index) => pieceKey(queue[index])).join('|')}`;
    if (queueKey !== lastQueueKey) {
      lastQueueKey = queueKey;
      for (let index = 0; index < nextCanvases.length; index += 1) {
        const entry = queue[index];
        drawMini(nextCanvases[index], entry, palette);
        nextCanvases[index].title = entry ? `Next piece ${pieceEntry(entry).t}` : 'Empty next preview';
      }
    }

    const heldPiece = pieceEntry(state.holdT);
    const holdEntry = state.holdT == null ? null : {
      ...heldPiece,
      prism: heldPiece.prism || Boolean(state.holdPrism),
    };
    const holdKey = `${world}|${pieceKey(holdEntry)}|${state.holdPrism ? 1 : 0}`;
    if (holdKey !== lastHoldKey) {
      lastHoldKey = holdKey;
      drawMini(holdCanvas, holdEntry, palette);
      holdCanvas.title = holdEntry ? `Held piece ${holdEntry.t}` : 'Empty hold piece';
    }
  }

  function updateCompass(state) {
    const activeFace = faceForState(state);
    const dangerKey = faceDots.map((_, index) => faceDangerFor(state, index).toFixed(3)).join('|');
    const key = `${activeFace}|${dangerKey}`;
    if (key === lastCompassKey) return;
    lastCompassKey = key;
    faceDots.forEach((dot, index) => {
      const danger = faceDangerFor(state, index);
      dot.classList.toggle('here', index === activeFace);
      dot.classList.toggle('danger', danger > 0.7);
      dot.dataset.danger = danger.toFixed(2);
      dot.setAttribute('aria-label', `${worldName(FACES[index])}${index === activeFace ? ', viewed' : ''}${danger > 0.7 ? ', danger' : ''}`);
    });
    faceCompass.setAttribute('aria-label', `Viewed face: ${worldName(FACES[activeFace])}`);
  }

  function updateFeedback(state, status, now) {
    const phaseNumber = Math.max(1, Math.floor(numberValue(state.phase, 1)));
    if (lastPhase !== null && phaseNumber > lastPhase) {
      const finalPhase = phaseNumber >= 9;
      bannerCopy.textContent = finalPhase ? 'THE SEAM' : `PHASE ${phaseNumber}`;
      waxSeal.textContent = String(phaseNumber);
      banner.dataset.phase = String(phaseNumber);
      banner.classList.toggle('phase-final', finalPhase);
      bannerUntil = now + BANNER_MS;
    }
    lastPhase = phaseNumber;

    const combo = numberValue(state.combo, -1);
    const b2b = Boolean(state.b2b);
    if (status === 'playing') {
      if (b2b && !lastB2b) {
        setToast('BACK-TO-BACK');
        toastUntil = now + TOAST_MS;
      } else if (combo > 0 && combo !== lastCombo) {
        setToast(`COMBO ×${Math.floor(combo) + 1}`, Math.min(8, Math.floor(combo) + 1));
        toastUntil = now + TOAST_MS;
      }
    }
    lastCombo = combo;
    lastB2b = b2b;

    setHidden(banner, status === 'title' || now >= bannerUntil);
    setHidden(toast, status !== 'playing' || now >= toastUntil);
  }

  function update(state = G) {
    if (!state) return;
    const status = state.status || 'title';
    const face = faceForState(state);
    const world = FACES[face];
    const targetScore = Math.max(0, Math.floor(numberValue(state.score)));
    const statusChanged = status !== lastStatus;

    if (statusChanged && status === 'playing' && targetScore === 0) {
      displayedScore = 0;
      lastDisplayedText = null;
      lastScoreBucket = 0;
    }
    if (lastScoreTarget === null) {
      displayedScore = targetScore;
      lastScoreBucket = Math.floor(displayedScore / 1000);
    }
    lastScoreTarget = targetScore;
    if (displayedScore !== targetScore) {
      const delta = targetScore - displayedScore;
      const step = Math.max(1, Math.ceil(Math.abs(delta) * 0.18));
      displayedScore += Math.sign(delta) * Math.min(Math.abs(delta), step);
    }
    const scoreBucket = Math.floor(displayedScore / 1000);
    if (lastScoreBucket !== null && scoreBucket > lastScoreBucket) snapScoreAtBoundary();
    lastScoreBucket = scoreBucket;
    renderScore();

    if (world !== lastWorld) {
      lastWorld = world;
      FACES.forEach((name) => document.body.classList.toggle(`world-${name}`, world === name));
      updateThemeColor(world);
      worldTag.textContent = `${world.toUpperCase()}SIDE`;
      worldTag.dataset.world = world;
      worldTag.setAttribute('aria-label', `Current world: ${worldName(world)}`);
    }

    const lineCount = numberValue(state.lines);
    if (lineCount !== lastLines) {
      lastLines = lineCount;
      lines.value.textContent = String(lineCount);
    }
    const phaseNumber = Math.max(1, Math.floor(numberValue(state.phase, 1)));
    const phaseText = String(phaseNumber);
    if (phase.value.textContent !== phaseText) {
      phase.value.textContent = phaseText;
    }

    updatePreview(state, world);
    updateCompass(state);

    if (status === 'gameover' || status === 'won') {
      if (targetScore > bestScore) {
        bestScore = targetScore;
      }
      if (bestScore !== lastBestCommitted) {
        if (writeBestScore(bestScore)) lastBestCommitted = bestScore;
      }
    }

    updateScreens(state, status);
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : 0;
    updateFeedback(state, status, now);
    lastStatus = status;
  }

  const H = { update };
  syncSettingLabels();
  update(G);
  return H;
}
