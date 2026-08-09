(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const stage = document.querySelector('.stage');
  const metricLabel = document.getElementById('metricLabel');
  const metricValue = document.getElementById('metricValue');
  const secondaryLabel = document.getElementById('secondaryLabel');
  const secondaryValue = document.getElementById('secondaryValue');
  const levelValue = document.getElementById('levelValue');
  const statusLine = document.getElementById('statusLine');
  const modeButtons = [...document.querySelectorAll('.mode-button')];

  const COLS = 10;
  const ROWS = 20;
  const PIECES = [
    { name: 'PULSE', color: '#60d8ee', glow: '#b4f5ff', shape: [[1,1,1,1]] },
    { name: 'NOVA', color: '#f6cf57', glow: '#fff0a7', shape: [[1,1],[1,1]] },
    { name: 'WISP', color: '#b48cff', glow: '#e1d4ff', shape: [[0,1,0],[1,1,1]] },
    { name: 'FLARE', color: '#ff9a56', glow: '#ffd1ac', shape: [[1,0,0],[1,1,1]] },
    { name: 'ANCHOR', color: '#6f9dff', glow: '#c0d1ff', shape: [[0,0,1],[1,1,1]] },
    { name: 'MINT', color: '#6be7bb', glow: '#c2ffe9', shape: [[0,1,1],[1,1,0]] },
    { name: 'FANG', color: '#f47288', glow: '#ffc2cc', shape: [[1,1,0],[0,1,1]] }
  ];

  let mode = 'marathon';
  let board = [];
  let active = null;
  let queue = [];
  let hold = null;
  let holdUsed = false;
  let bag = [];
  let score = 0;
  let lines = 0;
  let level = 1;
  let dropClock = 0;
  let startedAt = 0;
  let elapsed = 0;
  let lastFrame = performance.now();
  let running = true;
  let result = '';
  let shake = 0;
  let flash = 0;
  let particles = [];
  let layout = { x: 0, y: 0, cell: 20, boardW: 200, boardH: 400, sideX: 220, sideW: 100 };
  let pointer = null;

  const key = (suffix) => `stacklock:${suffix}`;
  function storedNumber(suffix) {
    try {
      const value = Number(localStorage.getItem(key(suffix)) || 0);
      return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch (_) { return 0; }
  }
  const bestScore = () => storedNumber('marathon-best');
  const bestTime = () => storedNumber('sprint-best');
  function saveNumber(suffix, value) {
    try { localStorage.setItem(key(suffix), String(value)); } catch (_) { /* storage is optional */ }
  }

  function emptyBoard() { return Array.from({ length: ROWS }, () => Array(COLS).fill(null)); }

  function cloneMatrix(matrix) { return matrix.map(row => row.slice()); }

  function rotateMatrix(matrix) {
    const h = matrix.length;
    const w = matrix[0].length;
    const rotated = Array.from({ length: w }, () => Array(h).fill(0));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rotated[x][h - 1 - y] = matrix[y][x];
    return rotated;
  }

  function shuffledBag() {
    const next = PIECES.map((_, i) => i);
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  function nextType() {
    if (!bag.length) bag = shuffledBag();
    return bag.pop();
  }

  function makePiece(type) {
    const shape = cloneMatrix(PIECES[type].shape);
    return { type, shape, x: Math.floor((COLS - shape[0].length) / 2), y: 0 };
  }

  function fillQueue() { while (queue.length < 3) queue.push(nextType()); }

  function beginGame(nextMode = mode) {
    mode = nextMode;
    board = emptyBoard();
    bag = [];
    queue = [];
    fillQueue();
    hold = null;
    holdUsed = false;
    score = 0;
    lines = 0;
    level = 1;
    dropClock = 0;
    elapsed = 0;
    startedAt = performance.now();
    running = true;
    result = '';
    shake = 0;
    flash = 0;
    particles = [];
    pointer = null;
    spawnPiece();
    statusLine.textContent = mode === 'sprint' ? 'Clear 40 lines as fast as you can.' : 'Build a clean stack.';
    updateHud();
    canvas.focus({ preventScroll: true });
  }

  function spawnPiece(type = queue.shift()) {
    fillQueue();
    active = makePiece(type);
    fillQueue();
    holdUsed = false;
    if (collides(active, 0, 0, active.shape)) finish('STACK FULL');
  }

  function collides(piece, dx = 0, dy = 0, shape = piece.shape) {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const nx = piece.x + x + dx;
        const ny = piece.y + y + dy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function move(dx) {
    if (!running || !active) return false;
    if (!collides(active, dx, 0)) { active.x += dx; return true; }
    return false;
  }

  function rotate() {
    if (!running || !active) return;
    const turned = rotateMatrix(active.shape);
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (!collides(active, kick, 0, turned)) {
        active.shape = turned;
        active.x += kick;
        flash = Math.max(flash, .12);
        return;
      }
    }
  }

  function softDrop() {
    if (!running || !active) return;
    if (!collides(active, 0, 1)) { active.y++; score++; dropClock = 0; updateHud(); }
    else lockPiece();
  }

  function hardDrop() {
    if (!running || !active) return;
    let distance = 0;
    while (!collides(active, 0, 1)) { active.y++; distance++; }
    score += distance * 2;
    shake = Math.max(shake, Math.min(6, 2 + distance * .16));
    lockPiece();
  }

  function holdPiece() {
    if (!running || !active || holdUsed) return;
    const currentType = active.type;
    if (hold === null) { hold = currentType; spawnPiece(); }
    else { const heldType = hold; hold = currentType; active = makePiece(heldType); if (collides(active)) finish('STACK FULL'); }
    holdUsed = true;
  }

  function lockPiece() {
    if (!running || !active) return;
    for (let y = 0; y < active.shape.length; y++) {
      for (let x = 0; x < active.shape[y].length; x++) {
        if (!active.shape[y][x]) continue;
        const by = active.y + y;
        const bx = active.x + x;
        if (by < 0) return finish('STACK FULL');
        board[by][bx] = active.type;
      }
    }
    const cleared = clearLines();
    if (cleared) {
      const weights = [0, 100, 300, 500, 800];
      score += weights[cleared] * level;
      lines += cleared;
      level = Math.floor(lines / 10) + 1;
      flash = .42;
      shake = Math.min(13, 4 + cleared * 2.8);
      emitLineParticles(cleared);
      if (mode === 'sprint' && lines >= 40) return finish('SPRINT CLEAR');
    }
    spawnPiece();
    updateHud();
  }

  function clearLines() {
    const full = [];
    for (let y = 0; y < ROWS; y++) if (board[y].every(Boolean)) full.push(y);
    if (!full.length) return 0;
    for (let i = full.length - 1; i >= 0; i--) board.splice(full[i], 1);
    while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
    return full.length;
  }

  function emitLineParticles(count) {
    const yBase = layout.y + layout.boardH - Math.max(0, count - 1) * layout.cell;
    for (let i = 0; i < count * 18; i++) {
      particles.push({
        x: layout.x + Math.random() * layout.boardW,
        y: yBase + (Math.random() - .5) * layout.cell * count,
        vx: (Math.random() - .5) * 160,
        vy: -40 - Math.random() * 170,
        life: .35 + Math.random() * .5,
        max: .85,
        size: 1 + Math.random() * 3,
        color: ['#6be7bb', '#f6cf57', '#b48cff', '#60d8ee'][i % 4]
      });
    }
  }

  function finish(message) {
    if (!running) return;
    running = false;
    result = message;
    if (mode === 'marathon') {
      if (score > bestScore()) saveNumber('marathon-best', score);
      statusLine.textContent = message === 'SPRINT CLEAR' ? 'New run ready.' : 'Tap the board or press enter to restart.';
    } else {
      if (message === 'SPRINT CLEAR' && (!bestTime() || elapsed < bestTime())) saveNumber('sprint-best', elapsed);
      statusLine.textContent = message === 'SPRINT CLEAR' ? 'Tap the board or press enter to run again.' : 'Tap the board or press enter to retry.';
    }
    updateHud();
  }

  function gravityMs() { return Math.max(85, 720 - (level - 1) * 54); }

  function updateHud() {
    metricLabel.textContent = mode === 'marathon' ? 'SCORE' : 'TIME';
    metricValue.textContent = mode === 'marathon' ? String(score).padStart(5, '0') : formatTime(elapsed);
    secondaryLabel.textContent = mode === 'marathon' ? 'BEST' : 'BEST TIME';
    secondaryValue.textContent = mode === 'marathon' ? String(bestScore()).padStart(5, '0') : (bestTime() ? formatTime(bestTime()) : '--:--.--');
    levelValue.textContent = mode === 'sprint' ? `${Math.min(lines, 40)}/40` : String(level);
  }

  function formatTime(ms) {
    const centis = Math.floor(ms / 10) % 100;
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cap = 960;
    const scale = Math.min(dpr, cap / Math.max(rect.width, rect.height));
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const w = rect.width;
    const h = rect.height;
    const sideW = Math.min(112, Math.max(91, w * .275));
    const usableBoardW = w - sideW - 25;
    const cell = Math.max(13, Math.floor(Math.min(usableBoardW / COLS, (h - 25) / ROWS)));
    const boardW = cell * COLS;
    const boardH = cell * ROWS;
    const x = Math.max(8, (w - (boardW + sideW + 15)) / 2);
    const y = Math.max(10, (h - boardH) / 2);
    layout = { x, y, cell, boardW, boardH, sideX: x + boardW + 15, sideW };
  }

  function roundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function draw() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    const pulse = Math.sin(elapsed * .003) * .5 + .5;
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0b1729'); bg.addColorStop(.54, '#091321'); bg.addColorStop(1, '#10192b');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * .32, h * .1, 0, w * .32, h * .1, w * .78);
    glow.addColorStop(0, `rgba(107,231,187,${.075 + pulse * .02})`); glow.addColorStop(1, 'rgba(107,231,187,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

    const offsetX = shake ? (Math.random() - .5) * shake : 0;
    const offsetY = shake ? (Math.random() - .5) * shake : 0;
    ctx.save(); ctx.translate(offsetX, offsetY);
    drawBoard();
    drawSidePanel();
    ctx.restore();
    drawParticles(w, h);
    if (!running) drawResult(w, h);
  }

  function drawBoard() {
    const { x, y, cell, boardW, boardH } = layout;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
    roundedRect(x - 4, y - 4, boardW + 8, boardH + 8, 13);
    ctx.fillStyle = 'rgba(5, 10, 19, .78)'; ctx.fill();
    ctx.shadowColor = 'transparent';
    roundedRect(x - 3, y - 3, boardW + 6, boardH + 6, 12);
    ctx.strokeStyle = 'rgba(145, 181, 220, .18)'; ctx.lineWidth = 1; ctx.stroke();
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const gx = x + col * cell, gy = y + row * cell;
        ctx.fillStyle = (row + col) % 2 ? 'rgba(28, 48, 76, .22)' : 'rgba(19, 36, 60, .22)';
        ctx.fillRect(gx + 1, gy + 1, cell - 2, cell - 2);
        const tile = board[row][col];
        if (tile !== null) drawTile(gx, gy, cell, PIECES[tile], 1);
      }
    }
    if (active && running) {
      const ghostY = ghostLanding();
      if (ghostY !== active.y) drawPiece(active, ghostY, .14, true);
      drawPiece(active, active.y, 1, false);
    }
    if (flash > 0) { ctx.fillStyle = `rgba(219,255,244,${flash * .16})`; ctx.fillRect(x, y, boardW, boardH); }
    ctx.restore();
  }

  function ghostLanding() {
    let dy = 0;
    while (!collides(active, 0, dy + 1)) dy++;
    return active.y + dy;
  }

  function drawPiece(piece, yOverride, alpha, ghost) {
    const { x, y, cell } = layout;
    const data = PIECES[piece.type];
    for (let py = 0; py < piece.shape.length; py++) for (let px = 0; px < piece.shape[py].length; px++) {
      if (piece.shape[py][px]) drawTile(x + (piece.x + px) * cell, y + (yOverride + py) * cell, cell, data, alpha, ghost);
    }
  }

  function drawTile(x, y, size, data, alpha = 1, ghost = false) {
    const pad = Math.max(1.5, size * .075);
    ctx.save(); ctx.globalAlpha = alpha;
    if (ghost) {
      roundedRect(x + pad, y + pad, size - pad * 2, size - pad * 2, size * .18);
      ctx.fillStyle = data.color; ctx.fill();
      ctx.strokeStyle = data.color; ctx.lineWidth = Math.max(1, size * .07); ctx.stroke();
      ctx.restore(); return;
    }
    ctx.shadowColor = data.color; ctx.shadowBlur = size * .18;
    roundedRect(x + pad, y + pad, size - pad * 2, size - pad * 2, size * .18);
    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, data.glow); grad.addColorStop(.2, data.color); grad.addColorStop(1, shade(data.color, -.22));
    ctx.fillStyle = grad; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,.26)'; ctx.lineWidth = Math.max(1, size * .035); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    roundedRect(x + pad * 2, y + pad * 1.6, size - pad * 4, Math.max(1.5, size * .08), size * .04); ctx.fill();
    ctx.restore();
  }

  function shade(hex, amount) {
    const value = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (value >> 16) + 255 * amount));
    const g = Math.max(0, Math.min(255, ((value >> 8) & 255) + 255 * amount));
    const b = Math.max(0, Math.min(255, (value & 255) + 255 * amount));
    return `rgb(${r|0},${g|0},${b|0})`;
  }

  function drawSidePanel() {
    const { sideX, sideW, y, boardH, cell } = layout;
    const labelSize = Math.max(7, Math.min(9, cell * .34));
    drawMiniPanel(sideX, y + 1, sideW, Math.min(boardH * .23, 112), 'HOLD', hold, true, labelSize);
    drawMiniPanel(sideX, y + Math.min(boardH * .23, 112) + 12, sideW, Math.min(boardH * .49, 220), 'NEXT', queue, false, labelSize);
    ctx.fillStyle = 'rgba(167, 188, 216, .52)'; ctx.font = `700 ${labelSize}px system-ui`; ctx.letterSpacing = '.12em';
    ctx.fillText(mode === 'sprint' ? `${Math.min(lines,40)} / 40 LINES` : `${lines} LINES`, sideX + 4, y + boardH - 26);
  }

  function drawMiniPanel(x, y, w, h, label, content, isHold, labelSize) {
    roundedRect(x, y, w, h, 10); ctx.fillStyle = 'rgba(23, 39, 65, .55)'; ctx.fill(); ctx.strokeStyle = 'rgba(145,181,220,.14)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(173, 197, 226, .63)'; ctx.font = `800 ${labelSize}px system-ui`; ctx.fillText(label, x + 7, y + 14);
    if (isHold) { if (content !== null) drawMiniPiece(content, x + w / 2, y + h * .61, Math.min(15, w / 7)); return; }
    for (let i = 0; i < 3; i++) if (content[i] !== undefined) drawMiniPiece(content[i], x + w / 2, y + 31 + i * Math.min(48, h / 3.2), Math.min(11.5, w / 9));
  }

  function drawMiniPiece(type, cx, cy, cell) {
    const shape = PIECES[type].shape;
    const width = shape[0].length * cell, height = shape.length * cell;
    for (let py = 0; py < shape.length; py++) for (let px = 0; px < shape[py].length; px++) if (shape[py][px]) drawTile(cx - width / 2 + px * cell, cy - height / 2 + py * cell, cell, PIECES[type], .95);
  }

  function drawParticles(w, h) {
    ctx.save();
    for (const particle of particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.max);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    ctx.restore();
  }

  function drawResult(w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(5, 10, 19, .64)'; ctx.fillRect(0, 0, w, h);
    const cx = w * .5, cy = h * .48;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = result === 'SPRINT CLEAR' ? '#6be7bb' : '#f6cf57'; ctx.font = `850 ${Math.max(24, Math.min(38, w * .105))}px system-ui`; ctx.fillText(result, cx, cy - 13);
    ctx.fillStyle = 'rgba(235,244,255,.82)'; ctx.font = `700 ${Math.max(9, Math.min(12, w * .03))}px system-ui`;
    ctx.fillText(mode === 'marathon' ? `${score.toLocaleString()} POINTS` : formatTime(elapsed), cx, cy + 19);
    ctx.fillStyle = 'rgba(190,211,238,.58)'; ctx.font = `700 ${Math.max(8, Math.min(10, w * .025))}px system-ui`; ctx.fillText('TAP TO RESTART', cx, cy + 47);
    ctx.restore();
  }

  function update(dt, now) {
    if (running) {
      elapsed = now - startedAt;
      dropClock += dt;
      if (dropClock >= gravityMs()) { dropClock = 0; if (!collides(active, 0, 1)) active.y++; else lockPiece(); }
      updateHud();
    }
    shake *= Math.pow(.04, dt / 1000);
    flash = Math.max(0, flash - dt / 1000);
    for (const particle of particles) { particle.life -= dt / 1000; particle.x += particle.vx * dt / 1000; particle.y += particle.vy * dt / 1000; particle.vy += 260 * dt / 1000; }
    particles = particles.filter(p => p.life > 0);
  }

  function loop(now) {
    const dt = Math.min(50, now - lastFrame); lastFrame = now;
    update(dt, now); draw(); requestAnimationFrame(loop);
  }

  function handleAction(action) {
    if (!running) { beginGame(mode); return; }
    if (action === 'hold') holdPiece();
    if (action === 'rotate') rotate();
    if (action === 'drop') hardDrop();
  }

  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => handleAction(button.dataset.action)));
  modeButtons.forEach(button => button.addEventListener('click', () => {
    modeButtons.forEach(item => item.classList.toggle('active', item === button));
    beginGame(button.dataset.mode);
  }));

  window.addEventListener('keydown', (event) => {
    const k = event.key.toLowerCase();
    if (['arrowleft','arrowright','arrowdown','arrowup',' ','c','z','a','d','s','w','enter'].includes(k)) event.preventDefault();
    if (!running && (k === 'enter' || k === ' ')) return beginGame(mode);
    if (k === 'arrowleft' || k === 'a') move(-1);
    else if (k === 'arrowright' || k === 'd') move(1);
    else if (k === 'arrowdown' || k === 's') softDrop();
    else if (k === 'arrowup' || k === 'w' || k === 'z') rotate();
    else if (k === ' ') hardDrop();
    else if (k === 'c') holdPiece();
  }, { passive: false });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (pointer) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now() };
  });
  canvas.addEventListener('pointerup', (event) => {
    event.preventDefault();
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y, dt = performance.now() - pointer.t;
    pointer = null;
    if (!running) return beginGame(mode);
    const distance = Math.hypot(dx, dy);
    if (distance > 24 && dy < -24) holdPiece();
    else if (distance > 24 && dy > 24) { if (dt < 260 || Math.abs(dy) > 130) hardDrop(); else softDrop(); }
    else if (Math.abs(dx) > 22) move(dx < 0 ? -1 : 1);
    else {
      const rect = canvas.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      if (activePieceContains(localX, localY)) rotate();
      else if (localX < rect.width * .5) move(-1); else move(1);
    }
  });
  canvas.addEventListener('pointercancel', (event) => { if (pointer && pointer.id === event.pointerId) pointer = null; });
  canvas.addEventListener('touchmove', event => event.preventDefault(), { passive: false });
  window.addEventListener('resize', resize, { passive: true });

  function activePieceContains(localX, localY) {
    if (!active) return false;
    const boardX = Math.floor((localX - layout.x) / layout.cell);
    const boardY = Math.floor((localY - layout.y) / layout.cell);
    const px = boardX - active.x;
    const py = boardY - active.y;
    return py >= 0 && py < active.shape.length && px >= 0 && px < active.shape[py].length && Boolean(active.shape[py][px]);
  }

  resize();
  beginGame('marathon');
  requestAnimationFrame(loop);
})();
