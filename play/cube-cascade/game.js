(() => {
  'use strict';

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d', { alpha: false });
  const TAU = Math.PI * 2;
  const BEST_KEY = 'cubeCascadeBest';
  const palette = {
    ink: '#07121f',
    panel: '#0d2233',
    line: '#29475a',
    text: '#e8f7ff',
    muted: '#8aa9b8',
    aqua: '#61f0da',
    cyan: '#78d9ff',
    gold: '#ffc66d',
    coral: '#ff6f86',
    violet: '#9d86ff',
    orb: '#ff637e',
    gremlin: '#a8f26f'
  };

  const state = {
    mode: 'play', level: 1, score: 0, best: readBest(), lives: 3,
    size: 3, target: 1, board: [], rng: null, seed: 0,
    player: { x: 0, y: 0 }, motion: null, invuln: 0,
    shake: 0, flash: 0, flashColor: palette.coral, hint: 7,
    clearTimer: 0, failTimer: 0, particles: [],
    orbT: 0, snake: null, gremlins: [], disc: null, revertTimer: 0,
    lastTime: 0, elapsed: 0, inputLock: 0, edgePath: [], edgePathSize: 0
  };

  let view = { w: 390, h: 700, dpr: 1, layout: null };
  let pointerStart = null;
  let backgroundGradient = null;
  let glowGradient = null;
  let playerGradient = null;
  const pathPointA = { x: 0, y: 0 };
  const pathPointB = { x: 0, y: 0 };
  const collisionPathPosition = { x: 0, y: 0, xCell: 0, yCell: 0 };
  const orbPositions = [
    { x: 0, y: 0, xCell: 0, yCell: 0 },
    { x: 0, y: 0, xCell: 0, yCell: 0 },
    { x: 0, y: 0, xCell: 0, yCell: 0 }
  ];
  const pressed = Object.create(null);

  function readBest() {
    try {
      const value = Number(localStorage.getItem(BEST_KEY));
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (err) { return 0; }
  }

  function saveBest() {
    if (state.score > state.best) {
      state.best = state.score;
      try { localStorage.setItem(BEST_KEY, String(state.best)); } catch (err) { /* storage is optional */ }
    }
  }

  function makeRng(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function key(x, y) { return x + ',' + y; }
  function inBounds(x, y) { return x >= 0 && y >= 0 && x < state.size && y < state.size; }

  function makeBoard() {
    state.board = [];
    for (let x = 0; x < state.size; x += 1) {
      const column = [];
      for (let y = 0; y < state.size; y += 1) {
        column.push({
          x, y, progress: 0, pulse: 0, flash: 0,
          tint: Math.floor(state.rng() * 22)
        });
      }
      state.board.push(column);
    }
  }

  function cell(x, y) { return inBounds(x, y) ? state.board[x][y] : null; }

  function startLevel(level) {
    state.mode = 'play';
    state.level = level;
    state.size = Math.min(6, 3 + Math.floor((level - 1) / 2));
    state.target = level >= 3 ? 2 : 1;
    state.seed = (0x4c415354 ^ Math.imul(level, 1103515245)) >>> 0;
    state.rng = makeRng(state.seed);
    state.player = { x: 0, y: 0 };
    state.motion = null;
    state.invuln = 1.25;
    state.clearTimer = 0;
    state.failTimer = 0;
    state.hint = level === 1 ? 7 : 2.4;
    state.orbT = 0;
    state.revertTimer = 0;
    makeBoard();
    state.snake = level >= 3 ? {
      head: { x: state.size - 1, y: state.size - 1 },
      trail: [], moveTimer: 1.1, moveEvery: Math.max(0.57, 1.08 - level * 0.035)
    } : null;
    state.gremlins = [];
    if (level >= 4) {
      const count = Math.min(2, 1 + Math.floor((level - 4) / 3));
      for (let i = 0; i < count; i += 1) {
        state.gremlins.push({
          x: state.size - 1 - i, y: i, timer: 1.6 + state.rng() * 1.4,
          tint: state.rng()
        });
      }
    }
    state.disc = level >= 2 ? {
      active: false, timer: 2.8 + state.rng() * 2, progress: 0,
      start: { x: 0, y: 0 }, dir: { x: -1, y: -1 }, duration: 1.15
    } : null;
    view.layout = makeLayout(view.w, view.h);
    burstAtCell(0, 0, palette.aqua, 12);
  }

  function resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const longAxis = Math.max(w, h);
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 960 / longAxis);
    view = { w, h, dpr, layout: makeLayout(w, h) };
    canvas.width = Math.round(w * view.dpr);
    canvas.height = Math.round(h * view.dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    backgroundGradient = null;
    glowGradient = null;
    playerGradient = null;
  }

  function makeLayout(w, h) {
    const compact = h < 580;
    const tileW = clamp((w - 72) / Math.max(3.4, state.size + 1.25), 43, 62);
    const tileH = tileW * 0.53;
    const lift = clamp(tileH * 0.31, 7, 12);
    const boardTop = compact ? 118 : 154;
    const controlsY = h - (compact ? 76 : 92);
    return {
      cx: w * 0.5, baseY: boardTop + (state.size - 1) * lift,
      tileW, tileH, lift, side: Math.max(7, tileH * 0.25), controlsY
    };
  }

  function tilePosition(x, y, out) {
    const l = view.layout;
    const height = (state.size - 1 - x) + (state.size - 1 - y);
    const result = out || {};
    result.x = l.cx + (x - y) * l.tileW * 0.5;
    result.y = l.baseY + (x + y) * l.tileH * 0.48 - height * l.lift;
    return result;
  }

  function playerPosition() {
    if (!state.motion) return tilePosition(state.player.x, state.player.y);
    const from = tilePosition(state.motion.from.x, state.motion.from.y);
    const to = tilePosition(state.motion.to.x, state.motion.to.y);
    const t = easeOut(clamp(state.motion.time / state.motion.duration, 0, 1));
    return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) - Math.sin(t * Math.PI) * 27 };
  }

  function drawRoundedRect(x, y, w, h, radius, fill, stroke, lineWidth) {
    const r = Math.max(0, Math.min(radius, w * 0.5, h * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 1; ctx.stroke(); }
  }

  function drawBackground() {
    if (!backgroundGradient || !glowGradient) {
      backgroundGradient = ctx.createLinearGradient(0, 0, 0, view.h);
      backgroundGradient.addColorStop(0, '#07121f');
      backgroundGradient.addColorStop(0.55, '#0a1d2d');
      backgroundGradient.addColorStop(1, '#06101b');
      glowGradient = ctx.createRadialGradient(view.w * 0.5, view.h * 0.32, 8, view.w * 0.5, view.h * 0.32, view.w * 0.7);
      glowGradient.addColorStop(0, 'rgba(51, 145, 172, 0.13)');
      glowGradient.addColorStop(1, 'rgba(51, 145, 172, 0)');
    }
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.save();
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 18; i += 1) {
      const x = (i * 83 + 31) % view.w;
      const y = (i * 137 + 22) % Math.max(100, view.h - 160);
      ctx.fillStyle = i % 3 === 0 ? palette.aqua : palette.cyan;
      ctx.fillRect(x, y, i % 2 ? 1 : 2, i % 2 ? 1 : 2);
    }
    ctx.restore();
  }

  function drawHeader() {
    const w = view.w;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.text;
    ctx.font = '800 15px Arial, sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText('CUBE CASCADE', 20, 24);
    ctx.fillStyle = palette.aqua;
    ctx.fillRect(20, 39, 45, 2);

    ctx.fillStyle = palette.muted;
    ctx.font = '700 10px Arial, sans-serif';
    ctx.fillText('LEVEL', 20, 61);
    ctx.fillText('SCORE', w * 0.43, 61);
    ctx.fillText('BEST', w - 88, 61);
    ctx.fillStyle = palette.text;
    ctx.font = '800 18px Arial, sans-serif';
    ctx.fillText(String(state.level).padStart(2, '0'), 20, 79);
    ctx.fillText(String(state.score).padStart(5, '0'), w * 0.43, 79);
    ctx.fillText(String(state.best).padStart(5, '0'), w - 88, 79);

    ctx.fillStyle = palette.muted;
    ctx.font = '700 10px Arial, sans-serif';
    ctx.fillText('LIVES', w - 88, 108);
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(w - 36 + i * 15, 107, 4.5, 0, TAU);
      ctx.fillStyle = i < state.lives ? palette.coral : '#244052';
      ctx.fill();
    }
    ctx.restore();
  }

  function cubeColors(c) {
    const variant = c.progress >= state.target ? 2 : state.target === 2 && c.progress === 1 ? 1 : 0;
    if (c.colors && c.colorVariant === variant) return c.colors;
    if (variant === 2) c.colors = [palette.aqua, '#299b9a', '#165c6d'];
    else if (variant === 1) c.colors = [palette.gold, '#b36553', '#643b4d'];
    else {
      const hue = 190 + c.tint;
      c.colors = ['hsl(' + hue + ', 28%, 27%)', 'hsl(' + hue + ', 28%, 20%)', 'hsl(' + hue + ', 28%, 14%)'];
    }
    c.colorVariant = variant;
    return c.colors;
  }

  function drawCube(c) {
    const p = tilePosition(c.x, c.y);
    const l = view.layout;
    const hw = l.tileW * 0.5;
    const hh = l.tileH * 0.5;
    const s = l.side;
    const top = { x: p.x, y: p.y - hh };
    const right = { x: p.x + hw, y: p.y };
    const bottom = { x: p.x, y: p.y + hh };
    const left = { x: p.x - hw, y: p.y };
    const colors = cubeColors(c);
    const pulse = c.pulse > 0 ? Math.sin((1 - c.pulse) * Math.PI) : 0;

    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#02080f';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + s + 4, hw * 0.78, hh * 0.28, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(bottom.x, bottom.y + s);
    ctx.lineTo(left.x, left.y + s);
    ctx.closePath();
    ctx.fillStyle = colors[2];
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(right.x, right.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(bottom.x, bottom.y + s);
    ctx.lineTo(right.x, right.y + s);
    ctx.closePath();
    ctx.fillStyle = colors[1];
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(left.x, left.y);
    ctx.closePath();
    ctx.fillStyle = colors[0];
    ctx.fill();
    ctx.strokeStyle = c.progress >= state.target ? 'rgba(150,255,235,.75)' : 'rgba(155,216,230,.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (pulse > 0) {
      ctx.strokeStyle = 'rgba(230,255,249,' + (pulse * 0.8) + ')';
      ctx.lineWidth = 2 + pulse * 2;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y - pulse * 4);
      ctx.lineTo(right.x + pulse * 4, right.y);
      ctx.lineTo(bottom.x, bottom.y + pulse * 4);
      ctx.lineTo(left.x - pulse * 4, left.y);
      ctx.closePath();
      ctx.stroke();
    }

    const markY = p.y + 2;
    for (let i = 0; i < state.target; i += 1) {
      ctx.beginPath();
      ctx.arc(p.x + (i - (state.target - 1) * 0.5) * 8, markY, 2.3, 0, TAU);
      ctx.fillStyle = i < c.progress ? palette.text : 'rgba(7,18,31,.42)';
      ctx.fill();
    }
    if (c.flash > 0) {
      ctx.globalAlpha = c.flash * 0.45;
      ctx.fillStyle = c.flash > 0.7 ? palette.coral : palette.gold;
      ctx.beginPath();
      ctx.arc(p.x, p.y, hw * 0.65, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBoard() {
    const last = state.size - 1;
    for (let sum = 0; sum <= last * 2; sum += 1) {
      for (let x = 0; x < state.size; x += 1) {
        const y = sum - x;
        if (y >= 0 && y < state.size) drawCube(state.board[x][y]);
      }
    }
  }

  function edgePath() {
    if (state.edgePathSize === state.size) return state.edgePath;
    const path = [];
    for (let x = 0; x < state.size; x += 1) path.push({ x, y: 0 });
    for (let y = 1; y < state.size; y += 1) path.push({ x: state.size - 1, y });
    for (let x = state.size - 2; x >= 0; x -= 1) path.push({ x, y: state.size - 1 });
    for (let y = state.size - 2; y > 0; y -= 1) path.push({ x: 0, y });
    state.edgePath = path;
    state.edgePathSize = state.size;
    return path;
  }

  function pathPosition(t, out) {
    const path = edgePath();
    const total = path.length;
    let at = ((t % total) + total) % total;
    const index = Math.floor(at);
    const next = (index + 1) % total;
    const mix = at - index;
    tilePosition(path[index].x, path[index].y, pathPointA);
    tilePosition(path[next].x, path[next].y, pathPointB);
    const result = out || collisionPathPosition;
    result.x = lerp(pathPointA.x, pathPointB.x, mix);
    result.y = lerp(pathPointA.y, pathPointB.y, mix);
    result.xCell = path[index].x;
    result.yCell = path[index].y;
    return result;
  }

  function drawOrbChain() {
    if (state.level < 2) return;
    for (let i = 0; i < 3; i += 1) pathPosition(state.orbT - i * 0.72, orbPositions[i]);
    for (let i = 2; i >= 0; i -= 1) {
      const p = orbPositions[i];
      const bob = Math.sin(state.elapsed * 6 - i) * 3;
      ctx.save();
      ctx.fillStyle = i === 0 ? '#ff9b89' : '#d94776';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 16 + bob, 8 - i * 1.2, 0, TAU);
      ctx.fill();
      ctx.restore();
      if (i < 2) {
        const q = orbPositions[i + 1];
        ctx.strokeStyle = 'rgba(255,116,136,.42)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 16 + bob);
        ctx.lineTo(q.x, q.y - 16);
        ctx.stroke();
      }
    }
  }

  function drawSnake() {
    if (!state.snake) return;
    const trailCount = Math.min(3, state.snake.trail.length);
    for (let i = trailCount; i >= 0; i -= 1) {
      const piece = i === 0 ? state.snake.head : state.snake.trail[state.snake.trail.length - i];
      const p = tilePosition(piece.x, piece.y);
      ctx.save();
      ctx.fillStyle = i === 0 ? '#cc7aff' : '#714bb8';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 17 - i * 1.5, 9 - i, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1a1234';
      ctx.beginPath();
      ctx.arc(p.x - 3, p.y - 19 - i * 1.5, 1.4, 0, TAU);
      ctx.arc(p.x + 3, p.y - 19 - i * 1.5, 1.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawGremlins() {
    for (const g of state.gremlins) {
      const p = tilePosition(g.x, g.y);
      ctx.save();
      ctx.translate(p.x, p.y - 15);
      ctx.fillStyle = palette.gremlin;
      ctx.beginPath();
      ctx.moveTo(-8, 7); ctx.lineTo(-7, -5); ctx.lineTo(-12, -10);
      ctx.lineTo(-4, -8); ctx.lineTo(0, -12); ctx.lineTo(4, -8);
      ctx.lineTo(12, -10); ctx.lineTo(7, -4); ctx.lineTo(8, 7);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#19331f';
      ctx.fillRect(-4, -3, 2, 3); ctx.fillRect(2, -3, 2, 3);
      ctx.restore();
    }
  }

  function drawDisc() {
    const d = state.disc;
    if (!d || !d.active) return;
    const p = tilePosition(d.start.x, d.start.y);
    const t = clamp(d.progress, 0, 1);
    const x = p.x + d.dir.x * 62 * t;
    const y = p.y - 12 + d.dir.y * 34 * t;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * Math.PI * 2);
    ctx.fillStyle = '#d7fbff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 6, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = palette.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 6, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    if (state.invuln > 0 && Math.floor(state.invuln * 14) % 2 === 0) return;
    const p = playerPosition();
    if (!playerGradient) {
      playerGradient = ctx.createRadialGradient(-3, -9, 1, 0, -4, 15);
      playerGradient.addColorStop(0, '#fff3bb');
      playerGradient.addColorStop(0.38, '#ffc56f');
      playerGradient.addColorStop(1, '#ff6c67');
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#02070c';
    ctx.beginPath(); ctx.ellipse(0, 6, 15, 5, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = playerGradient;
    ctx.beginPath();
    ctx.moveTo(0, -19); ctx.lineTo(12, -7);
    ctx.lineTo(0, 5); ctx.lineTo(-12, -7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#522b47';
    ctx.beginPath(); ctx.arc(-3, -9, 1.6, 0, TAU); ctx.arc(3, -9, 1.6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function eachControl(callback) {
    const x = view.w * 0.5;
    const y = view.layout.controlsY;
    callback(x - 64, y - 28, '↖');
    callback(x + 10, y - 28, '↗');
    callback(x - 64, y + 30, '↙');
    callback(x + 10, y + 30, '↘');
  }

  function drawControl(x, y, label) {
    drawRoundedRect(x, y, 54, 46, 15, 'rgba(18,53,70,.72)', 'rgba(109,223,222,.28)', 1);
    ctx.fillStyle = 'rgba(214,250,255,.82)';
    ctx.font = '700 23px Arial, sans-serif';
    ctx.fillText(label, x + 27, y + 23);
  }

  function drawControls() {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    eachControl(drawControl);
    ctx.fillStyle = 'rgba(150,190,202,.75)';
    ctx.font = '700 10px Arial, sans-serif';
    ctx.fillText('SWIPE DIAGONALLY', view.w * 0.5, view.h - 18);
    ctx.restore();
  }

  function drawProgress() {
    const total = state.size * state.size;
    let lit = 0;
    for (const column of state.board) for (const c of column) lit += c.progress >= state.target ? 1 : 0;
    const width = Math.max(0, Math.min(210, view.w - 80));
    const x = (view.w - width) * 0.5;
    const y = 120;
    ctx.save();
    ctx.fillStyle = 'rgba(6,17,27,.62)';
    drawRoundedRect(x, y, width, 5, 3, 'rgba(42,70,83,.7)', null);
    if (lit) drawRoundedRect(x, y, width * lit / total, 5, 3, palette.aqua, null);
    ctx.fillStyle = palette.muted;
    ctx.font = '700 9px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(lit + ' / ' + total + ' LIT', view.w * 0.5, y - 8);
    ctx.restore();
  }

  function drawHint() {
    if (state.hint <= 0 || state.mode !== 'play') return;
    const alpha = clamp(Math.min(1, state.hint) * 0.75, 0, 0.75);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette.text;
    ctx.font = '700 12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.level === 1 ? 'SWIPE A DIAGONAL TO HOP' : 'KEEP HOPPING — WATCH THE EDGES', view.w * 0.5, 143);
    ctx.restore();
  }

  function drawOverlay() {
    if (state.mode === 'play') return;
    ctx.save();
    ctx.fillStyle = state.mode === 'fail' ? 'rgba(5,10,18,.78)' : 'rgba(4,18,25,.65)';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (state.mode === 'clear') {
      ctx.fillStyle = palette.aqua;
      ctx.font = '900 28px Arial, sans-serif';
      ctx.fillText('PYRAMID CLEAR', view.w * 0.5, view.h * 0.44);
      ctx.fillStyle = palette.text;
      ctx.font = '700 12px Arial, sans-serif';
      ctx.fillText('NEXT CASCADE IN ' + Math.max(1, Math.ceil(state.clearTimer)) + '…', view.w * 0.5, view.h * 0.50);
    } else {
      ctx.fillStyle = palette.coral;
      ctx.font = '900 32px Arial, sans-serif';
      ctx.fillText('CASCADE LOST', view.w * 0.5, view.h * 0.42);
      ctx.fillStyle = palette.text;
      ctx.font = '700 13px Arial, sans-serif';
      ctx.fillText('SCORE  ' + state.score, view.w * 0.5, view.h * 0.49);
      ctx.fillStyle = palette.aqua;
      ctx.font = '800 15px Arial, sans-serif';
      ctx.fillText('TAP TO RETRY', view.w * 0.5, view.h * 0.58);
    }
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.save();
    if (state.shake > 0) {
      const amount = state.shake * 7;
      ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
    }
    drawBackground();
    drawHeader();
    drawProgress();
    drawBoard();
    drawOrbChain();
    drawSnake();
    drawGremlins();
    drawDisc();
    drawPlayer();
    drawParticles();
    drawControls();
    drawHint();
    if (state.flash > 0) {
      ctx.fillStyle = state.flashColor;
      ctx.globalAlpha = state.flash * 0.12;
      ctx.fillRect(0, 0, view.w, view.h);
    }
    ctx.restore();
    drawOverlay();
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + p.life / p.maxLife), 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function burstAtCell(x, y, color, amount) {
    const p = tilePosition(x, y);
    for (let i = 0; i < amount; i += 1) {
      const angle = state.rng ? state.rng() * TAU : Math.random() * TAU;
      const speed = 20 + (state.rng ? state.rng() : Math.random()) * 58;
      state.particles.push({
        x: p.x, y: p.y - 12, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 22,
        life: 0.35 + Math.random() * 0.45, maxLife: 0.8, size: 1.5 + Math.random() * 2.5, color
      });
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 80 * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    if (state.particles.length > 150) state.particles.splice(0, state.particles.length - 150);
  }

  function markCell(x, y) {
    const c = cell(x, y);
    if (!c) return;
    const before = c.progress;
    c.progress = Math.min(state.target, c.progress + 1);
    c.pulse = 1;
    c.flash = 0;
    burstAtCell(x, y, c.progress >= state.target ? palette.aqua : palette.gold, c.progress >= state.target ? 8 : 4);
    if (c.progress > before) {
      state.score += 10 + state.level * 4;
      saveBest();
    }
    if (before < state.target && c.progress >= state.target) state.score += 12 * state.level;
  }

  function boardComplete() {
    for (const column of state.board) for (const c of column) if (c.progress < state.target) return false;
    return true;
  }

  function loseLife(reason) {
    if (state.mode !== 'play' || (state.invuln > 0 && reason !== 'edge')) return;
    state.lives -= 1;
    state.motion = null;
    state.invuln = 1.15;
    state.shake = 1;
    state.flash = 1;
    state.flashColor = reason === 'edge' ? palette.gold : palette.coral;
    burstAtCell(state.player.x, state.player.y, state.flashColor, 18);
    if (state.lives <= 0) {
      state.mode = 'fail'; state.failTimer = 0;
      saveBest();
    } else {
      state.player = { x: 0, y: 0 };
    }
  }

  function collideAt(x, y) {
    if (state.invuln > 0) return false;
    if (state.level >= 2) {
      for (let i = 0; i < 3; i += 1) {
        const orbT = state.orbT - i * 0.72;
        const p = pathPosition(orbT);
        const phase = ((orbT % 1) + 1) % 1;
        if (p.xCell === x && p.yCell === y && Math.min(phase, 1 - phase) < 0.42) return true;
      }
    }
    if (state.snake && state.snake.head.x === x && state.snake.head.y === y) return true;
    for (const g of state.gremlins) if (g.x === x && g.y === y) return true;
    return false;
  }

  function hop(name) {
    if (state.mode === 'fail') { restart(); return; }
    if (state.mode === 'clear') { startLevel(state.level + 1); return; }
    if (state.mode !== 'play' || state.motion || state.inputLock > 0) return;
    const dirs = {
      'up-left': { x: -1, y: 0 }, 'up-right': { x: 0, y: -1 },
      'down-left': { x: 0, y: 1 }, 'down-right': { x: 1, y: 0 }
    };
    const d = dirs[name];
    if (!d) return;
    state.hint = Math.min(state.hint, 1.5);
    const from = { x: state.player.x, y: state.player.y };
    const to = { x: from.x + d.x, y: from.y + d.y };
    if (!inBounds(to.x, to.y)) { loseLife('edge'); return; }
    state.player = to;
    markCell(to.x, to.y);
    state.motion = { from, to, time: 0, duration: 0.18 };
    state.inputLock = 0.08;
    if (collideAt(to.x, to.y)) {
      state.motion.time = state.motion.duration;
      loseLife('enemy');
      return;
    }
    if (boardComplete()) {
      state.score += state.level * 100 + state.lives * 40;
      saveBest();
      state.mode = 'clear'; state.clearTimer = 0.9; state.motion = null;
    }
  }

  function restart() {
    clearPressed();
    pointerStart = null;
    state.score = 0;
    state.lives = 3;
    state.inputLock = 0;
    state.particles.length = 0;
    state.shake = 0;
    state.flash = 0;
    startLevel(1);
  }

  function chooseSnakeStep() {
    const s = state.snake;
    if (!s) return;
    const options = [];
    const dx = state.player.x - s.head.x;
    const dy = state.player.y - s.head.y;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) options.push({ x: Math.sign(dx), y: 0 });
    if (dy !== 0) options.push({ x: 0, y: Math.sign(dy) });
    if (dx !== 0) options.push({ x: Math.sign(dx), y: 0 });
    options.push({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 });
    for (const step of options) {
      const x = s.head.x + step.x; const y = s.head.y + step.y;
      if (inBounds(x, y)) {
        s.trail.push({ x: s.head.x, y: s.head.y });
        if (s.trail.length > 4) s.trail.shift();
        s.head = { x, y };
        if (x === state.player.x && y === state.player.y) loseLife('enemy');
        return;
      }
    }
  }

  function updateEnemies(dt) {
    if (state.level >= 2) {
      state.orbT += dt * (0.62 + state.level * 0.04);
      if (collideAt(state.player.x, state.player.y)) loseLife('enemy');
      if (state.disc) {
        const d = state.disc;
        if (!d.active) {
          d.timer -= dt;
          if (d.timer <= 0) {
            const edge = Math.floor(state.rng() * 4);
            const last = state.size - 1;
            const corners = [
              [{ x: 0, y: 0 }, { x: -1, y: -1 }],
              [{ x: last, y: 0 }, { x: 1, y: -1 }],
              [{ x: last, y: last }, { x: 1, y: 1 }],
              [{ x: 0, y: last }, { x: -1, y: 1 }]
            ];
            d.start = corners[edge][0]; d.dir = corners[edge][1]; d.progress = 0; d.active = true;
          }
        } else {
          d.progress += dt / d.duration;
          if (d.progress < 0.42 && state.player.x === d.start.x && state.player.y === d.start.y) loseLife('enemy');
          if (d.progress >= 1) { d.active = false; d.timer = 2.4 + state.rng() * 2.2; }
        }
      }
    }
    if (state.snake) {
      state.snake.moveTimer -= dt;
      if (state.snake.moveTimer <= 0) {
        state.snake.moveTimer = state.snake.moveEvery;
        chooseSnakeStep();
      }
    }
    for (const g of state.gremlins) {
      g.timer -= dt;
      if (g.timer <= 0) {
        g.timer = 1.1 + state.rng() * 1.4;
        const choices = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
        const d = choices[Math.floor(state.rng() * choices.length)];
        if (inBounds(g.x + d.x, g.y + d.y)) { g.x += d.x; g.y += d.y; }
        const c = cell(g.x, g.y);
        if (c && c.progress > 0 && !(g.x === state.player.x && g.y === state.player.y)) {
          c.progress -= 1; c.flash = 1; burstAtCell(g.x, g.y, palette.coral, 5);
        }
        if (g.x === state.player.x && g.y === state.player.y) loseLife('enemy');
      }
    }
    if (state.level >= 4) {
      state.revertTimer += dt;
      const interval = Math.max(1.7, 4.8 - state.level * 0.22);
      if (state.revertTimer >= interval) {
        state.revertTimer = 0;
        const options = [];
        for (const column of state.board) for (const c of column) {
          if (c.progress > 0 && !(c.x === state.player.x && c.y === state.player.y)) options.push(c);
        }
        if (options.length) {
          const c = options[Math.floor(state.rng() * options.length)];
          c.progress -= 1; c.flash = 1; burstAtCell(c.x, c.y, palette.coral, 5);
          loseLife('revert');
        }
      }
    }
  }

  function update(dt) {
    state.elapsed += dt;
    if (state.hint > 0) state.hint -= dt;
    state.shake = Math.max(0, state.shake - dt * 3.8);
    state.flash = Math.max(0, state.flash - dt * 2.8);
    state.invuln = Math.max(0, state.invuln - dt);
    state.inputLock = Math.max(0, state.inputLock - dt);
    updateParticles(dt);
    for (const column of state.board) for (const c of column) {
      c.pulse = Math.max(0, c.pulse - dt * 2.6);
      c.flash = Math.max(0, c.flash - dt * 1.7);
    }
    if (state.mode === 'play') {
      if (state.motion) {
        state.motion.time += dt;
        if (state.motion.time >= state.motion.duration) state.motion = null;
      }
      updateEnemies(dt);
    } else if (state.mode === 'clear') {
      state.clearTimer -= dt;
      if (state.clearTimer <= 0) startLevel(state.level + 1);
    }
  }

  function frame(now) {
    if (!state.lastTime) state.lastTime = now;
    const dt = Math.min(0.034, Math.max(0, (now - state.lastTime) / 1000));
    state.lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function diagonalFromDelta(dx, dy) {
    if (Math.abs(dx) < 24 || Math.abs(dy) < 24) return null;
    if (dx < 0 && dy < 0) return 'up-left';
    if (dx > 0 && dy < 0) return 'up-right';
    if (dx < 0 && dy > 0) return 'down-left';
    return 'down-right';
  }

  function hitControl(x, y) {
    const cx = view.w * 0.5;
    const cy = view.layout.controlsY;
    const inBox = (left, top) => x >= left - 4 && x <= left + 58 && y >= top - 4 && y <= top + 50;
    if (inBox(cx - 64, cy - 28)) return 'up-left';
    if (inBox(cx + 10, cy - 28)) return 'up-right';
    if (inBox(cx - 64, cy + 30)) return 'down-left';
    if (inBox(cx + 10, cy + 30)) return 'down-right';
    return null;
  }

  function pointerDown(event) {
    event.preventDefault();
    if (pointerStart) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left; const y = event.clientY - rect.top;
    pointerStart = { x, y, control: hitControl(x, y), id: event.pointerId };
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
  }

  function pointerUp(event) {
    event.preventDefault();
    if (!pointerStart || event.pointerId !== pointerStart.id) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left; const y = event.clientY - rect.top;
    const start = pointerStart; pointerStart = null;
    const dx = x - start.x; const dy = y - start.y;
    const swipe = diagonalFromDelta(dx, dy);
    if (swipe) hop(swipe);
    else if (start.control && Math.hypot(dx, dy) < 34) hop(start.control);
    else if (state.mode === 'fail') restart();
    else if (state.mode === 'clear') startLevel(state.level + 1);
  }

  function keyboardMove() {
    const up = pressed.ArrowUp || pressed.w;
    const down = pressed.ArrowDown || pressed.s;
    const left = pressed.ArrowLeft || pressed.a;
    const right = pressed.ArrowRight || pressed.d;
    if (up && left) hop('up-left');
    else if (up && right) hop('up-right');
    else if (down && left) hop('down-left');
    else if (down && right) hop('down-right');
  }

  function keyDown(event) {
    const k = event.key;
    const directionKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'];
    if (directionKeys.includes(k)) {
      event.preventDefault(); pressed[k] = true; keyboardMove(); return;
    }
    if (k === 'q' || k === 'e' || k === 'z' || k === 'c') {
      event.preventDefault(); hop({ q: 'up-left', e: 'up-right', z: 'down-left', c: 'down-right' }[k]); return;
    }
    if (k === ' ' || k === 'Enter' || k === 'r' || k === 'R') {
      event.preventDefault(); if (state.mode !== 'play') restart();
    }
  }

  function clearPressed() {
    for (const keyName in pressed) delete pressed[keyName];
  }

  function keyUp(event) { delete pressed[event.key]; }

  window.addEventListener('resize', resize, { passive: true });
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointerup', pointerUp, { passive: false });
  canvas.addEventListener('pointercancel', event => {
    if (pointerStart && event.pointerId === pointerStart.id) pointerStart = null;
  }, { passive: true });
  canvas.addEventListener('touchmove', event => event.preventDefault(), { passive: false });
  window.addEventListener('keydown', keyDown, { passive: false });
  window.addEventListener('keyup', keyUp, { passive: true });
  window.addEventListener('blur', () => { clearPressed(); pointerStart = null; }, { passive: true });

  resize();
  startLevel(1);
  requestAnimationFrame(frame);
})();
