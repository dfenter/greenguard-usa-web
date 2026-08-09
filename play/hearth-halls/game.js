(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const srStatus = document.getElementById('sr-status');

  const C = {
    ink: '#172235',
    navy: '#101827',
    navy2: '#1b2b43',
    paper: '#fff7e9',
    cream: '#f3e6cf',
    muted: '#9eb0bf',
    coral: '#ef7559',
    coralDark: '#b74f45',
    teal: '#2cb5ad',
    tealDark: '#157a7c',
    gold: '#f6bf55',
    purple: '#8a70df',
    green: '#71c77d',
    red: '#e45c63',
    shadow: 'rgba(5, 12, 24, .28)'
  };
  const TILE = [
    { fill: '#ef7559', dark: '#b74f45', light: '#ffb076' },
    { fill: '#32b8b1', dark: '#147f80', light: '#8be0c9' },
    { fill: '#f6bf55', dark: '#b77a35', light: '#ffe99d' },
    { fill: '#8a70df', dark: '#5946a5', light: '#c8baff' },
    { fill: '#71c77d', dark: '#358a59', light: '#b4e59c' },
    { fill: '#e45c8b', dark: '#a43f6e', light: '#ffabc4' }
  ];
  const STYLES = [
    { name: 'COZY', color: C.coral, sub: 'soft + warm' },
    { name: 'GRAND', color: C.gold, sub: 'bold + polished' },
    { name: 'QUIRKY', color: C.teal, sub: 'odd + bright' }
  ];
  const ROOMS = [
    { name: 'Cinderwick Nook', wall: '#ecd7bf', floor: '#a96d55', trim: '#d95f4d', npcA: '#e88268', npcB: '#5bb9ad' },
    { name: 'Mossbell Parlor', wall: '#d8e1ca', floor: '#758c6a', trim: '#e6af4e', npcA: '#806bd2', npcB: '#e58d56' }
  ];
  const FIXTURES = ['HEARTH', 'RUG', 'TABLE', 'LAMP', 'SHELF', 'WINDOW'];
  const COMMENTS = [
    {
      name: 'Marn', color: '#ef876b', lines: [
        'Soft edges. I can breathe in here.',
        'At last, a ceiling-worthy entrance.',
        'The crooked bits know my name.'
      ]
    },
    {
      name: 'Pip', color: '#63c5b8', lines: [
        'I claim the amber corner.',
        'Do we bow to the furniture?',
        'Excellent. Nothing matches on purpose.'
      ]
    }
  ];
  const LEVELS = [
    { seed: 7919, moves: 19, goal: 240 },
    { seed: 15431, moves: 20, goal: 280 },
    { seed: 23887, moves: 21, goal: 330 },
    { seed: 31271, moves: 22, goal: 390 },
    { seed: 40111, moves: 23, goal: 450 },
    { seed: 48799, moves: 24, goal: 520 },
    { seed: 57149, moves: 22, goal: 500 },
    { seed: 65063, moves: 23, goal: 560 },
    { seed: 73471, moves: 24, goal: 620 },
    { seed: 81929, moves: 25, goal: 690 },
    { seed: 90121, moves: 26, goal: 760 },
    { seed: 98317, moves: 27, goal: 840 }
  ];
  const COLS = 7;
  const ROWS = 8;
  const CELL_COUNT = COLS * ROWS;
  const MAX_PARTICLES = 180;
  const STORAGE_KEY = 'hearth-halls-v1';

  let W = 390;
  let H = 700;
  let backingScale = 1;
  let state = 'intro';
  let board = [];
  let rngState = 1;
  let currentLevel = 0;
  let levelScore = 0;
  let totalScore = 0;
  let bestScore = 0;
  let moves = 0;
  let goal = 0;
  let selectedCell = null;
  let cursor = { col: 3, row: 4 };
  let decorFocus = 0;
  let decorStyle = -1;
  let roomTab = 0;
  let boardAnimating = 0;
  let shake = 0;
  let flash = 0;
  let message = 'Make three sparks. Every match helps a room.';
  let messageAge = 0;
  let lastFrame = 0;
  let audioContext = null;
  let orientationBlocked = false;
  let saveStage = 'level';
  let choices = blankChoices();
  const particles = [];
  const activePointers = new Map();
  const pressedButtonPointers = new Map();
  const heldKeys = new Set();
  const queuedActions = [];
  const pendingTimers = new Set();

  function blankChoices() {
    return [Array(6).fill(-1), Array(6).fill(-1)];
  }

  function finiteInt(value, min, max, fallback) {
    return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
  }

  function validStyle(value) {
    return Number.isInteger(value) && value >= 0 && value < 3 ? value : -1;
  }

  function readSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (typeof raw !== 'string' || raw.length === 0) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const nextChoices = blankChoices();
      if (Array.isArray(parsed.choices)) {
        for (let r = 0; r < 2; r += 1) {
          if (!Array.isArray(parsed.choices[r])) continue;
          for (let s = 0; s < 6; s += 1) nextChoices[r][s] = validStyle(parsed.choices[r][s]);
        }
      }
      const stage = parsed.stage === 'decorate' || parsed.stage === 'commentary' ? parsed.stage : 'level';
      return {
        choices: nextChoices,
        currentLevel: finiteInt(parsed.currentLevel, 0, LEVELS.length, 0),
        bestScore: finiteInt(parsed.bestScore, 0, 9999999, 0),
        totalScore: finiteInt(parsed.totalScore, 0, 9999999, 0),
        stage
      };
    } catch (error) {
      return null;
    }
  }

  function writeSave(stage) {
    try {
      const cleanChoices = blankChoices();
      for (let r = 0; r < 2; r += 1) {
        for (let s = 0; s < 6; s += 1) cleanChoices[r][s] = validStyle(choices[r][s]);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        choices: cleanChoices,
        currentLevel: finiteInt(currentLevel, 0, LEVELS.length, 0),
        bestScore: finiteInt(bestScore, 0, 9999999, 0),
        totalScore: finiteInt(totalScore, 0, 9999999, 0),
        stage: stage === 'decorate' || stage === 'commentary' ? stage : 'level'
      }));
    } catch (error) {
      // Storage is optional; a private browsing quota must not stop the game.
    }
  }

  function resizeCanvas() {
    W = Math.max(1, window.innerWidth || 390);
    H = Math.max(1, window.innerHeight || 700);
    const dpr = Math.min(Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1, 2);
    backingScale = Math.min(dpr, 960 / Math.max(W, H));
    canvas.width = Math.max(1, Math.round(W * backingScale));
    canvas.height = Math.max(1, Math.round(H * backingScale));
    ctx.setTransform(backingScale, 0, 0, backingScale, 0, 0);
    const wasBlocked = orientationBlocked;
    orientationBlocked = W > H;
    if (orientationBlocked && !wasBlocked) clearInputState();
  }

  function unlockAudio() {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
    } catch (error) {
      audioContext = null;
    }
  }

  function blip(kind) {
    if (!audioContext) return;
    try {
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = kind === 'bad' ? 'square' : 'sine';
      oscillator.frequency.value = kind === 'good' ? 610 : kind === 'win' ? 820 : kind === 'bad' ? 150 : 320;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(kind === 'win' ? 0.08 : 0.045, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'win' ? 0.24 : 0.12));
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + (kind === 'win' ? 0.25 : 0.13));
    } catch (error) {
      // Audio is a garnish and remains optional.
    }
  }

  function clearInputState() {
    activePointers.clear();
    pressedButtonPointers.clear();
    heldKeys.clear();
    queuedActions.length = 0;
    selectedCell = null;
    boardPointerId = null;
  }

  function cancelPendingTimers() {
    for (const timer of pendingTimers) clearTimeout(timer);
    pendingTimers.clear();
  }

  function schedule(fn, delay) {
    if (pendingTimers.size >= 8) cancelPendingTimers();
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      fn();
    }, delay);
    pendingTimers.add(timer);
    return timer;
  }

  function setMessage(text) {
    message = text;
    messageAge = 0;
    srStatus.textContent = text;
  }

  function queueAction(action) {
    if (queuedActions.length < 20) queuedActions.push(action);
  }

  function rand() {
    rngState ^= rngState << 13;
    rngState ^= rngState >>> 17;
    rngState ^= rngState << 5;
    return ((rngState >>> 0) % 100000) / 100000;
  }

  function randomTile() {
    return Math.floor(rand() * TILE.length) % TILE.length;
  }

  function indexAt(col, row) {
    return row * COLS + col;
  }

  function makeBoard(seed) {
    rngState = seed >>> 0 || 1;
    const next = Array(CELL_COUNT).fill(0);
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        let tile = randomTile();
        let tries = 0;
        while (tries < 12 && ((col >= 2 && next[indexAt(col - 1, row)] === tile && next[indexAt(col - 2, row)] === tile) || (row >= 2 && next[indexAt(col, row - 1)] === tile && next[indexAt(col, row - 2)] === tile))) {
          tile = randomTile();
          tries += 1;
        }
        next[indexAt(col, row)] = tile;
      }
    }
    board = next;
    if (!hasAnyMove()) shuffleBoard();
    return board;
  }

  function findMatches() {
    const matches = new Set();
    for (let row = 0; row < ROWS; row += 1) {
      let start = 0;
      while (start < COLS) {
        const tile = board[indexAt(start, row)];
        let end = start + 1;
        while (end < COLS && tile !== null && board[indexAt(end, row)] === tile) end += 1;
        if (tile !== null && end - start >= 3) for (let col = start; col < end; col += 1) matches.add(indexAt(col, row));
        start = end;
      }
    }
    for (let col = 0; col < COLS; col += 1) {
      let start = 0;
      while (start < ROWS) {
        const tile = board[indexAt(col, start)];
        let end = start + 1;
        while (end < ROWS && tile !== null && board[indexAt(col, end)] === tile) end += 1;
        if (tile !== null && end - start >= 3) for (let row = start; row < end; row += 1) matches.add(indexAt(col, row));
        start = end;
      }
    }
    return matches;
  }

  function hasAnyMove() {
    for (let i = 0; i < CELL_COUNT; i += 1) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      if (col < COLS - 1) {
        const other = i + 1;
        [board[i], board[other]] = [board[other], board[i]];
        const match = findMatches().size > 0;
        [board[i], board[other]] = [board[other], board[i]];
        if (match) return true;
      }
      if (row < ROWS - 1) {
        const other = i + COLS;
        [board[i], board[other]] = [board[other], board[i]];
        const match = findMatches().size > 0;
        [board[i], board[other]] = [board[other], board[i]];
        if (match) return true;
      }
    }
    return false;
  }

  function shuffleBoard() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      for (let i = CELL_COUNT - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [board[i], board[j]] = [board[j], board[i]];
      }
      if (findMatches().size === 0 && hasAnyMove()) return;
    }
    makeGuaranteedBoard();
  }

  function makeGuaranteedBoard() {
    const next = Array(CELL_COUNT).fill(0);
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) next[indexAt(col, row)] = (col + row * 2) % TILE.length;
    }
    next[0] = 0; next[1] = 0; next[2] = 1; next[3] = 0;
    board = next;
  }

  function addParticle(x, y, color, amount) {
    const count = Math.min(amount, MAX_PARTICLES - particles.length);
    for (let i = 0; i < count; i += 1) {
      const life = 0.35 + rand() * 0.35;
      particles.push({
        x, y, vx: (rand() - 0.5) * 150, vy: -40 - rand() * 150,
        life, maxLife: life, color, size: 2 + rand() * 4
      });
    }
  }

  function resolveMatches() {
    let chain = 0;
    let totalCleared = 0;
    while (chain < 8) {
      const matches = findMatches();
      if (matches.size === 0) break;
      chain += 1;
      totalCleared += matches.size;
      for (const i of matches) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const point = tileCenter(col, row);
        addParticle(point.x, point.y, TILE[board[i]].light, 4);
        board[i] = null;
      }
      levelScore += matches.size * 20 * chain;
      totalScore += matches.size * 20 * chain;
      for (let col = 0; col < COLS; col += 1) {
        let writeRow = ROWS - 1;
        for (let row = ROWS - 1; row >= 0; row -= 1) {
          const value = board[indexAt(col, row)];
          if (value !== null) {
            board[indexAt(col, writeRow)] = value;
            if (writeRow !== row) board[indexAt(col, row)] = null;
            writeRow -= 1;
          }
        }
        while (writeRow >= 0) {
          board[indexAt(col, writeRow)] = randomTile();
          writeRow -= 1;
        }
      }
    }
    if (totalCleared > 0) {
      shake = Math.min(9, 3 + totalCleared * 0.18);
      flash = 0.12;
      blip(chain > 1 ? 'win' : 'good');
      setMessage(chain > 1 ? `Chain x${chain}! ${totalCleared} sparks cleared.` : `${totalCleared} sparks cleared. Keep the rhythm.`);
    }
    if (!hasAnyMove()) {
      shuffleBoard();
      setMessage('The board reset its rhythm. Find a fresh spark.');
    }
  }

  function beginFromSave() {
    clearInputState();
    cancelPendingTimers();
    if (currentLevel >= LEVELS.length) {
      state = 'end';
      roomTab = 0;
      return;
    }
    const room = Math.floor(currentLevel / 6);
    const slot = currentLevel % 6;
    if (saveStage === 'commentary' && validStyle(choices[room][slot]) >= 0) {
      decorStyle = choices[room][slot];
      state = 'commentary';
      setMessage('Choice saved. Your household has opinions.');
      return;
    }
    if (saveStage === 'decorate') {
      decorStyle = validStyle(choices[room][slot]);
      state = 'decorate';
      decorFocus = decorStyle >= 0 ? decorStyle : 0;
      setMessage('A room slot is ready. Pick its mood.');
      return;
    }
    beginLevel(currentLevel);
  }

  function beginLevel(level) {
    clearInputState();
    cancelPendingTimers();
    currentLevel = finiteInt(level, 0, LEVELS.length - 1, 0);
    const config = LEVELS[currentLevel];
    levelScore = 0;
    moves = config.moves;
    goal = config.goal;
    selectedCell = null;
    cursor = { col: 3, row: 4 };
    boardAnimating = 0;
    state = 'level';
    makeBoard(config.seed);
    saveStage = 'level';
    writeSave('level');
    setMessage('Swipe or tap two neighbors. Match three sparks to build the room.');
  }

  function restartLevel() {
    unlockAudio();
    const level = currentLevel;
    clearInputState();
    cancelPendingTimers();
    beginLevel(level);
    blip('neutral');
  }

  function newRun() {
    unlockAudio();
    clearInputState();
    cancelPendingTimers();
    choices = blankChoices();
    currentLevel = 0;
    levelScore = 0;
    totalScore = 0;
    decorStyle = -1;
    saveStage = 'level';
    writeSave('level');
    beginLevel(0);
    blip('neutral');
  }

  function boardTapCell(col, row) {
    if (state !== 'level' || boardAnimating > 0 || moves <= 0) return;
    const cell = { col, row };
    if (!selectedCell) {
      selectedCell = cell;
      setMessage('Neighbor selected. Tap or swipe a tile beside it.');
      return;
    }
    if (selectedCell.col === col && selectedCell.row === row) {
      selectedCell = null;
      setMessage('Selection cleared.');
      return;
    }
    if (Math.abs(selectedCell.col - col) + Math.abs(selectedCell.row - row) === 1) {
      performSwap(selectedCell.col, selectedCell.row, col, row);
      selectedCell = null;
      return;
    }
    selectedCell = cell;
    setMessage('That tile is not a neighbor. Pick a nearby spark.');
  }

  function performSwap(colA, rowA, colB, rowB) {
    if (state !== 'level' || boardAnimating > 0 || moves <= 0) return;
    const a = indexAt(colA, rowA);
    const b = indexAt(colB, rowB);
    [board[a], board[b]] = [board[b], board[a]];
    if (findMatches().size === 0) {
      [board[a], board[b]] = [board[b], board[a]];
      moves -= 1;
      blip('bad');
      setMessage(moves > 0 ? 'No spark there. Try a different neighbor.' : 'No sparks left. The room can be retried instantly.');
      if (moves <= 0) state = 'fail';
      return;
    }
    moves -= 1;
    resolveMatches();
    boardAnimating = 0.16;
    if (moves <= 0 && levelScore < goal) setMessage('Last move! Make it a bright one.');
  }

  function finishLevel() {
    if (state !== 'level' || levelScore < goal) return;
    bestScore = Math.max(bestScore, totalScore);
    const room = Math.floor(currentLevel / 6);
    const slot = currentLevel % 6;
    decorStyle = validStyle(choices[room][slot]);
    state = 'decorate';
    decorFocus = decorStyle >= 0 ? decorStyle : 0;
    saveStage = 'decorate';
    writeSave('decorate');
    blip('win');
    setMessage(`Level clear. Choose the ${FIXTURES[slot].toLowerCase()} mood.`);
  }

  function chooseStyle(style) {
    if (state !== 'decorate' || !Number.isInteger(style) || style < 0 || style > 2) return;
    unlockAudio();
    const room = Math.floor(currentLevel / 6);
    const slot = currentLevel % 6;
    decorStyle = style;
    decorFocus = style;
    choices[room][slot] = style;
    state = 'commentary';
    saveStage = 'commentary';
    writeSave('commentary');
    setMessage(`${STYLES[style].name} ${FIXTURES[slot].toLowerCase()} chosen. Listen to the room.`);
    addParticle(W * 0.5, H * 0.42, STYLES[style].color, 22);
    blip('good');
  }

  function advanceAfterCommentary() {
    if (state !== 'commentary') return;
    clearInputState();
    cancelPendingTimers();
    if (currentLevel >= LEVELS.length - 1) {
      currentLevel = LEVELS.length;
      saveStage = 'level';
      writeSave('level');
      state = 'end';
      blip('win');
      setMessage('Both rooms are yours. Every style is part of the story.');
      return;
    }
    currentLevel += 1;
    saveStage = 'level';
    beginLevel(currentLevel);
  }

  function moveCursor(dx, dy) {
    cursor.col = (cursor.col + dx + COLS) % COLS;
    cursor.row = (cursor.row + dy + ROWS) % ROWS;
    if (state === 'level') setMessage('Cursor moved. Enter selects a tile; Enter again swaps a neighbor.');
  }

  function updateActions() {
    let count = 0;
    while (queuedActions.length && count < 8) {
      const action = queuedActions.shift();
      count += 1;
      if (orientationBlocked) continue;
      if (action.type === 'start') {
        unlockAudio();
        beginFromSave();
      } else if (action.type === 'retry') {
        restartLevel();
      } else if (action.type === 'new') {
        newRun();
      } else if (action.type === 'swipe') {
        performSwap(action.col, action.row, action.toCol, action.toRow);
      } else if (action.type === 'tap') {
        boardTapCell(action.col, action.row);
      } else if (action.type === 'style') {
        chooseStyle(action.style);
      } else if (action.type === 'continue') {
        advanceAfterCommentary();
      } else if (action.type === 'room') {
        roomTab = action.room;
      }
    }
  }

  function update(dt) {
    updateActions();
    messageAge += dt;
    if (boardAnimating > 0) {
      boardAnimating -= dt;
      if (boardAnimating <= 0 && levelScore >= goal) finishLevel();
    }
    shake = Math.max(0, shake - dt * 28);
    flash = Math.max(0, flash - dt);
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 270 * dt;
      if (particle.life <= 0) particles.splice(i, 1);
    }
  }

  function rr(x, y, w, h, radius) {
    const r = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(x, y, w, h, fill, radius = 16) {
    ctx.fillStyle = C.shadow;
    rr(x + 3, y + 5, w, h, radius);
    ctx.fill();
    ctx.fillStyle = fill;
    rr(x, y, w, h, radius);
    ctx.fill();
  }

  function text(value, x, y, size, color, align = 'left', weight = 700) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  }

  function textFit(value, x, y, maxWidth, size, color, align = 'left', weight = 700) {
    let actual = size;
    while (actual > 10) {
      ctx.font = `${weight} ${actual}px Arial, Helvetica, sans-serif`;
      if (ctx.measureText(value).width <= maxWidth) break;
      actual -= 1;
    }
    text(value, x, y, actual, color, align, weight);
  }

  function button(rect, label, fill, color = C.paper, small = false) {
    panel(rect.x, rect.y, rect.w, rect.h, fill, 14);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1;
    rr(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2, 13);
    ctx.stroke();
    textFit(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, rect.w - 14, small ? 12 : 14, color, 'center', 800);
  }

  function bg() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#13233a');
    gradient.addColorStop(0.56, '#192d46');
    gradient.addColorStop(1, '#0f1a2c');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = C.teal;
    ctx.beginPath(); ctx.arc(W * 0.08, H * 0.1, 62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.coral;
    ctx.beginPath(); ctx.arc(W * 0.94, H * 0.38, 88, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawTopTitle(label, sub) {
    text('HEARTH & HALLS', 18, 22, 14, C.paper, 'left', 900);
    text(label, W - 18, 20, 13, C.gold, 'right', 800);
    text(sub, W - 18, 43, 11, C.muted, 'right', 700);
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(18, 60); ctx.lineTo(W - 18, 60); ctx.stroke();
  }

  function drawHint(value, y = 82) {
    textFit(value, W / 2, y, W - 32, 12, C.cream, 'center', 600);
  }

  function boardRect() {
    const cell = Math.max(30, Math.min((W - 32) / COLS, (H - 256) / ROWS));
    const w = cell * COLS;
    return { x: (W - w) / 2, y: 112, w, h: cell * ROWS, cell };
  }

  function tileCenter(col, row) {
    const rect = boardRect();
    return { x: rect.x + (col + 0.5) * rect.cell, y: rect.y + (row + 0.5) * rect.cell };
  }

  function drawTile(tile, col, row, rect) {
    if (tile === null || tile === undefined) return;
    const x = rect.x + col * rect.cell + 3;
    const y = rect.y + row * rect.cell + 3;
    const size = rect.cell - 6;
    const colors = TILE[tile];
    ctx.fillStyle = colors.dark;
    rr(x + 1, y + 3, size, size, Math.min(12, size * 0.22));
    ctx.fill();
    ctx.fillStyle = colors.fill;
    rr(x, y, size, size - 3, Math.min(12, size * 0.22));
    ctx.fill();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = colors.light;
    ctx.beginPath(); ctx.arc(x + size * 0.29, y + size * 0.25, Math.max(2, size * 0.08), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    const cx = x + size / 2;
    const cy = y + size / 2 + 1;
    ctx.fillStyle = 'rgba(255,255,255,.76)';
    ctx.strokeStyle = 'rgba(255,255,255,.78)';
    ctx.lineWidth = Math.max(2, size * 0.055);
    if (tile === 0) { ctx.beginPath(); ctx.arc(cx, cy, size * .17, 0, Math.PI * 2); ctx.fill(); }
    if (tile === 1) { ctx.beginPath(); ctx.moveTo(cx, cy - size * .22); ctx.lineTo(cx + size * .22, cy); ctx.lineTo(cx, cy + size * .22); ctx.lineTo(cx - size * .22, cy); ctx.closePath(); ctx.fill(); }
    if (tile === 2) { ctx.beginPath(); ctx.arc(cx, cy, size * .18, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, cy - size * .27); ctx.lineTo(cx, cy + size * .27); ctx.stroke(); }
    if (tile === 3) { ctx.beginPath(); ctx.moveTo(cx, cy - size * .23); ctx.lineTo(cx + size * .23, cy + size * .2); ctx.lineTo(cx - size * .23, cy + size * .2); ctx.closePath(); ctx.fill(); }
    if (tile === 4) { ctx.beginPath(); ctx.moveTo(cx - size * .24, cy); ctx.quadraticCurveTo(cx, cy - size * .3, cx + size * .24, cy); ctx.quadraticCurveTo(cx, cy + size * .3, cx - size * .24, cy); ctx.fill(); }
    if (tile === 5) { ctx.beginPath(); for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + i * Math.PI / 5; const radius = i % 2 ? size * .11 : size * .25; const px = cx + Math.cos(a) * radius; const py = cy + Math.sin(a) * radius; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); }
  }

  function drawBoard() {
    const rect = boardRect();
    ctx.save();
    const dx = shake ? Math.sin(shake * 13) * shake * 0.45 : 0;
    const dy = shake ? Math.cos(shake * 9) * shake * 0.45 : 0;
    ctx.translate(dx, dy);
    panel(rect.x - 8, rect.y - 8, rect.w + 16, rect.h + 16, '#203650', 20);
    ctx.fillStyle = 'rgba(8,16,30,.32)';
    rr(rect.x, rect.y, rect.w, rect.h, 14); ctx.fill();
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        ctx.fillStyle = 'rgba(255,255,255,.035)';
        rr(rect.x + col * rect.cell + 2, rect.y + row * rect.cell + 2, rect.cell - 4, rect.cell - 4, 10); ctx.fill();
        drawTile(board[indexAt(col, row)], col, row, rect);
      }
    }
    if (selectedCell) {
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 4;
      rr(rect.x + selectedCell.col * rect.cell + 2, rect.y + selectedCell.row * rect.cell + 2, rect.cell - 4, rect.cell - 7, 11); ctx.stroke();
    }
    ctx.strokeStyle = C.paper;
    ctx.globalAlpha = 0.78;
    ctx.lineWidth = 2;
    rr(rect.x + cursor.col * rect.cell + 6, rect.y + cursor.row * rect.cell + 6, rect.cell - 12, rect.cell - 15, 8); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function levelRetryRect() {
    return { x: 18, y: H - 62, w: 156, h: 50 };
  }

  function drawLevel() {
    bg();
    const config = LEVELS[currentLevel] || LEVELS[0];
    drawTopTitle(`LEVEL ${String(currentLevel + 1).padStart(2, '0')} / 12`, `GOAL ${levelScore} / ${goal}`);
    text(`MOVES ${String(Math.max(0, moves)).padStart(2, '0')}`, 18, 78, 12, moves <= 4 ? C.coral : C.gold, 'left', 900);
    text(`BEST ${bestScore}`, W - 18, 78, 11, C.muted, 'right', 700);
    drawHint(messageAge < 3 ? message : 'Swipe a neighbor, or use arrows + Enter.', 97);
    drawBoard();
    const retry = levelRetryRect();
    button(retry, 'RETRY LEVEL', C.coralDark, C.paper);
    textFit(`${config.moves} moves • no lives`, W - 18, H - 37, W - retry.w - 54, 11, C.muted, 'right', 700);
    drawParticles();
    if (flash > 0) { ctx.globalAlpha = flash * 1.8; ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  function drawNpc(x, y, color, name, flip = false) {
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.fillStyle = 'rgba(9,18,29,.25)'; ctx.beginPath(); ctx.ellipse(0, 22, 28, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.paper; ctx.beginPath(); ctx.arc(-5, -2, 3, 0, Math.PI * 2); ctx.arc(5, -2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 3, 7, 0.2, Math.PI - 0.2); ctx.stroke();
    text(name, 0, 31, 10, C.ink, 'center', 900);
    ctx.restore();
  }

  function drawFixture(slot, style, x, y, w, h, active = false) {
    ctx.save();
    if (active) { ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.setLineDash([5, 3]); rr(x - 5, y - 5, w + 10, h + 10, 10); ctx.stroke(); ctx.setLineDash([]); }
    if (style < 0) {
      ctx.fillStyle = 'rgba(23,34,53,.10)'; rr(x, y, w, h, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(23,34,53,.42)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); rr(x, y, w, h, 8); ctx.stroke(); ctx.setLineDash([]);
      text(`+ ${FIXTURES[slot]}`, x + w / 2, y + h / 2, Math.min(10, w / 8), C.ink, 'center', 900);
      ctx.restore(); return;
    }
    const cozy = style === 0;
    const grand = style === 1;
    const quirky = style === 2;
    ctx.fillStyle = cozy ? '#c57552' : grand ? '#ae7d3d' : '#39a8a1';
    ctx.strokeStyle = grand ? '#74502d' : '#633b35';
    ctx.lineWidth = Math.max(2, w * .035);
    if (slot === 0) {
      const base = quirky ? 0.12 : grand ? 0.03 : 0.08;
      rr(x + w * base, y + h * .2, w * (1 - base * 2), h * .8, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = grand ? '#f6bf55' : cozy ? '#ef7559' : '#9fe2c9';
      ctx.beginPath(); ctx.arc(x + w / 2 + (quirky ? 4 : 0), y + h * .63, h * .22, Math.PI, 0); ctx.lineTo(x + w * .72, y + h * .85); ctx.lineTo(x + w * .28, y + h * .85); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffcc73'; ctx.globalAlpha = cozy ? .9 : .6; ctx.beginPath(); ctx.arc(x + w / 2, y + h * .62, h * .1, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    } else if (slot === 1) {
      ctx.fillStyle = cozy ? '#d85f4d' : grand ? '#c69a43' : '#37a5a2';
      if (quirky) { ctx.rotate(-0.08); }
      rr(x, y + h * .2, w, h * .58, 10); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = grand ? '#fff0b0' : '#f4c67a'; ctx.lineWidth = 2;
      if (grand) { ctx.beginPath(); ctx.moveTo(x + w * .15, y + h * .48); ctx.lineTo(x + w * .5, y + h * .26); ctx.lineTo(x + w * .85, y + h * .48); ctx.lineTo(x + w * .5, y + h * .7); ctx.closePath(); ctx.stroke(); }
      if (cozy) { ctx.beginPath(); ctx.arc(x + w * .18, y + h * .5, 4, 0, Math.PI * 2); ctx.arc(x + w * .82, y + h * .5, 4, 0, Math.PI * 2); ctx.fillStyle = '#f6bf55'; ctx.fill(); }
      if (quirky) { ctx.fillStyle = '#f6bf55'; ctx.fillRect(x + w * .18, y + h * .35, 7, 7); ctx.fillRect(x + w * .62, y + h * .58, 7, 7); }
    } else if (slot === 2) {
      ctx.fillStyle = grand ? '#c89a50' : cozy ? '#b96e48' : '#49b6ac';
      if (quirky) { ctx.beginPath(); ctx.moveTo(x + w * .5, y); ctx.lineTo(x + w, y + h * .65); ctx.lineTo(x, y + h * .65); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else { ctx.beginPath(); ctx.ellipse(x + w * .5, y + h * .35, w * .46, h * .22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillRect(x + w * .27, y + h * .38, w * .07, h * .5); ctx.fillRect(x + w * .66, y + h * .38, w * .07, h * .5); }
      if (grand) { ctx.strokeStyle = '#fff1b0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + w * .5, y + h * .35, w * .3, h * .1, 0, 0, Math.PI * 2); ctx.stroke(); }
    } else if (slot === 3) {
      ctx.fillStyle = grand ? '#e2b64d' : cozy ? '#e98759' : '#3faeaa';
      ctx.strokeStyle = '#613b35';
      ctx.beginPath(); ctx.moveTo(x + w * .5, y + h * .12); ctx.lineTo(x + w * .5, y + h * .78); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + w * .5, y + h * .78, w * .18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + w * .5 + (quirky ? 5 : 0), y + h * .13, w * (grand ? .35 : .28), Math.PI, 0); ctx.lineTo(x + w * .8, y + h * .32); ctx.lineTo(x + w * .2, y + h * .32); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = grand ? '#fff0a3' : '#ffc778'; ctx.globalAlpha = .78; ctx.beginPath(); ctx.arc(x + w * .5, y + h * .23, w * .12, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    } else if (slot === 4) {
      ctx.fillStyle = grand ? '#bc873e' : cozy ? '#aa6748' : '#43a39b';
      ctx.save(); if (quirky) ctx.rotate(-0.12); rr(x, y + h * .25, w, h * .12, 4); ctx.fill(); rr(x, y + h * .58, w, h * .12, 4); ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#603f38'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + w * .12, y + h * .2); ctx.lineTo(x + w * .12, y + h * .83); ctx.moveTo(x + w * .88, y + h * .2); ctx.lineTo(x + w * .88, y + h * .83); ctx.stroke();
      ctx.fillStyle = grand ? '#f3cf72' : '#e1a86a'; ctx.fillRect(x + w * .25, y + h * .34, w * .14, h * .15); ctx.fillRect(x + w * .58, y + h * .68, w * .16, h * .12);
    } else if (slot === 5) {
      ctx.fillStyle = grand ? '#e4bc5e' : cozy ? '#8bbfa8' : '#ef7559';
      if (grand) { ctx.beginPath(); ctx.arc(x + w / 2, y + h * .55, Math.min(w, h) * .48, Math.PI, 0); ctx.lineTo(x + w * .98, y + h); ctx.lineTo(x + w * .02, y + h); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else { rr(x + w * .04, y + h * .05, w * .92, h * .88, 4); ctx.fill(); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(23,34,53,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w * .5, y + h * .08); ctx.lineTo(x + w * .5, y + h * .92); ctx.moveTo(x + w * .08, y + h * .5); ctx.lineTo(x + w * .92, y + h * .5); ctx.stroke();
      if (cozy) { ctx.fillStyle = '#e99a69'; ctx.beginPath(); ctx.arc(x + w * .15, y + h * .42, w * .16, 0, Math.PI * 2); ctx.arc(x + w * .85, y + h * .42, w * .16, 0, Math.PI * 2); ctx.fill(); }
      if (quirky) { ctx.fillStyle = '#f6bf55'; ctx.beginPath(); ctx.arc(x + w * .72, y + h * .22, 4, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  function roomFixtureRect(slot, x, y, w, h) {
    const layout = [
      [.06, .47, .28, .42], [.19, .78, .62, .15], [.43, .5, .28, .28],
      [.78, .18, .13, .34], [.05, .17, .29, .25], [.55, .13, .32, .27]
    ][slot];
    return { x: x + w * layout[0], y: y + h * layout[1], w: w * layout[2], h: h * layout[3] };
  }

  function tally(room) {
    const counts = [0, 0, 0];
    for (const value of choices[room]) if (validStyle(value) >= 0) counts[value] += 1;
    return counts;
  }

  function drawTally(room, x, y, small = false) {
    const counts = tally(room);
    const gap = small ? 4 : 7;
    const width = small ? 64 : 76;
    for (let i = 0; i < 3; i += 1) {
      const bx = x + i * (width + gap);
      panel(bx, y, width, small ? 20 : 24, 'rgba(23,34,53,.72)', 8);
      ctx.fillStyle = STYLES[i].color; ctx.beginPath(); ctx.arc(bx + 10, y + (small ? 10 : 12), 4, 0, Math.PI * 2); ctx.fill();
      text(`${STYLES[i].name[0]} ${counts[i]}`, bx + 19, y + (small ? 10 : 12), small ? 9 : 10, C.paper, 'left', 800);
    }
  }

  function drawRoomScene(x, y, w, h, room, activeSlot = -1, previewStyle = -1) {
    const theme = ROOMS[room];
    ctx.save();
    panel(x, y, w, h, theme.wall, 18);
    ctx.save();
    rr(x, y, w, h, 18); ctx.clip();
    ctx.fillStyle = theme.floor; ctx.fillRect(x, y + h * .78, w, h * .22);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x, y + h * .74, w, 4);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x + w * .5, y, 2, h * .78);
    ctx.fillStyle = 'rgba(23,34,53,.08)'; ctx.beginPath(); ctx.arc(x + w * .2, y + h * .28, h * .18, 0, Math.PI * 2); ctx.fill();
    for (let slot = 0; slot < 6; slot += 1) {
      const fixture = roomFixtureRect(slot, x, y, w, h);
      let style = validStyle(choices[room][slot]);
      if (slot === activeSlot && previewStyle >= 0) style = previewStyle;
      drawFixture(slot, style, fixture.x, fixture.y, fixture.w, fixture.h, slot === activeSlot);
    }
    drawNpc(x + w * .16, y + h * .78, theme.npcA, 'Marn');
    drawNpc(x + w * .84, y + h * .78, theme.npcB, 'Pip', true);
    ctx.restore();
    text(theme.name, x + 14, y + 20, 13, C.ink, 'left', 900);
    drawTally(room, x + 14, y + h - 34, true);
    ctx.restore();
  }

  function decorateRects() {
    const y = H - 146;
    const gap = 6;
    const w = (W - 28 - gap * 2) / 3;
    return [0, 1, 2].map((i) => ({ x: 14 + i * (w + gap), y, w, h: 56 }));
  }

  function continueRect() {
    return { x: W - 190, y: H - 67, w: 172, h: 52 };
  }

  function drawStyleButton(rect, style, selected) {
    panel(rect.x, rect.y, rect.w, rect.h, selected ? STYLES[style].color : '#233954', 13);
    if (selected) { ctx.strokeStyle = C.paper; ctx.lineWidth = 2; rr(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4, 11); ctx.stroke(); }
    text(STYLES[style].name, rect.x + rect.w / 2, rect.y + 22, 12, selected ? C.ink : C.paper, 'center', 900);
    textFit(STYLES[style].sub, rect.x + rect.w / 2, rect.y + 40, rect.w - 8, 10, selected ? C.ink : C.muted, 'center', 700);
  }

  function drawDecorate() {
    const room = Math.floor(currentLevel / 6);
    const slot = currentLevel % 6;
    const roomH = Math.min(324, H - 310);
    bg();
    drawTopTitle(ROOMS[room].name.toUpperCase(), `SLOT ${slot + 1} / 6`);
    drawRoomScene(16, 99, W - 32, roomH, room, slot, decorStyle);
    drawTally(room, 16, 99 + roomH + 9);
    drawHint('Pick one look. It changes the scene and both household voices.');
    const rects = decorateRects();
    for (let i = 0; i < 3; i += 1) drawStyleButton(rects[i], i, decorStyle === i);
    if (decorStyle >= 0) button(continueRect(), currentLevel === 11 ? 'SEE BOTH ROOMS' : 'NEXT LEVEL', C.coral, C.paper);
    drawParticles();
  }

  function drawBubble(x, y, w, line, color) {
    panel(x, y, w, 58, C.paper, 12);
    ctx.fillStyle = C.paper;
    ctx.beginPath(); ctx.moveTo(x + 22, y + 58); ctx.lineTo(x + 34, y + 58); ctx.lineTo(x + 22, y + 68); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 9, y + 10); ctx.lineTo(x + 9, y + 48); ctx.stroke();
    textFit(line, x + 20, y + 29, w - 28, 11, C.ink, 'left', 700);
  }

  function drawCommentary() {
    const room = Math.floor(currentLevel / 6);
    const slot = currentLevel % 6;
    bg();
    drawTopTitle('THE ROOM REACTS', `${FIXTURES[slot]} • ${STYLES[decorStyle].name}`);
    drawRoomScene(16, 88, W - 32, Math.min(302, H - 380), room, slot, decorStyle);
    const boxY = H - 250;
    text('MARN + PIP', 18, boxY - 20, 11, C.gold, 'left', 900);
    drawBubble(16, boxY, W - 32, COMMENTS[0].lines[decorStyle], COMMENTS[0].color);
    drawBubble(16, boxY + 68, W - 32, COMMENTS[1].lines[decorStyle], COMMENTS[1].color);
    drawTally(room, 16, H - 108);
    button(continueRect(), currentLevel === 11 ? 'SEE BOTH ROOMS' : 'KEEP BUILDING', C.coral, C.paper);
    drawHint('Your style is tallied above; the next match funds the next fixture.', 78);
    drawParticles();
  }

  function endCardRect(room) {
    const gap = 12;
    const top = 92 + room * ((H - 166) / 2 + gap / 2);
    return { x: 14, y: top, w: W - 28, h: (H - 166) / 2 - gap / 2 };
  }

  function drawEnd() {
    bg();
    drawTopTitle('TWO ROOMS, ONE STORY', 'RUN COMPLETE');
    text('EVERY CHOICE STAYS', 18, 80, 12, C.gold, 'left', 900);
    text(`SCORE ${totalScore}  •  BEST ${bestScore}`, W - 18, 80, 11, C.muted, 'right', 800);
    for (let room = 0; room < 2; room += 1) {
      const card = endCardRect(room);
      drawRoomScene(card.x, card.y, card.w, card.h, room);
      textFit(`${COMMENTS[0].name}: ${COMMENTS[0].lines[tally(room).indexOf(Math.max(...tally(room)))] || 'A room with a point of view.'}`, card.x + 14, card.y + card.h - 58, card.w - 28, 10, C.ink, 'left', 700);
    }
    button({ x: 18, y: H - 58, w: W - 36, h: 48 }, 'START A NEW RUN', C.coral, C.paper);
  }

  function drawIntro() {
    bg();
    drawTopTitle('A MATCH-MADE HOME', 'ORIGINAL PROTOTYPE');
    drawRoomScene(16, 94, W - 32, Math.min(318, H - 320), 0);
    panel(16, H - 250, W - 32, 176, 'rgba(16,24,39,.94)', 20);
    textFit('HEARTH & HALLS', W / 2, H - 215, W - 44, 27, C.paper, 'center', 900);
    text('12 matches fund 2 rooms', W / 2, H - 178, 14, C.gold, 'center', 800);
    text('Six choices per room. Every mood talks back.', W / 2, H - 151, 11, C.muted, 'center', 700);
    button({ x: 38, y: H - 126, w: W - 76, h: 54 }, currentLevel > 0 ? 'TAP TO CONTINUE' : 'TAP TO BEGIN', C.coral, C.paper);
    text('Arrows + Enter also work', W / 2, H - 84, 10, C.muted, 'center', 700);
    drawHint('One gesture wakes the sound; then swipe sparks to start building.');
  }

  function drawFail() {
    drawLevel();
    ctx.fillStyle = 'rgba(10,17,29,.74)'; ctx.fillRect(0, 0, W, H);
    const box = { x: 20, y: H * .27, w: W - 40, h: 238 };
    panel(box.x, box.y, box.w, box.h, C.paper, 20);
    text('OUT OF MOVES', W / 2, box.y + 44, 23, C.ink, 'center', 900);
    text('The room is still waiting on a spark.', W / 2, box.y + 82, 12, C.coralDark, 'center', 700);
    button({ x: box.x + 24, y: box.y + 116, w: box.w - 48, h: 52 }, 'TRY THIS LEVEL AGAIN', C.coral, C.paper);
    button({ x: box.x + 24, y: box.y + 178, w: box.w - 48, h: 48 }, 'NEW RUN', C.navy2, C.paper, true);
  }

  function drawRotateOverlay() {
    ctx.fillStyle = 'rgba(9,15,27,.96)'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.gold; ctx.lineWidth = 6;
    rr(W * .35, H * .34, W * .3, W * .2, 14); ctx.stroke();
    ctx.fillStyle = C.coral; ctx.beginPath(); ctx.arc(W * .5, H * .44, 8, 0, Math.PI * 2); ctx.fill();
    text('TURN YOUR PHONE', W / 2, H * .58, 18, C.paper, 'center', 900);
    text('Hearth & Halls is portrait-first.', W / 2, H * .63, 12, C.muted, 'center', 700);
    text('The game is paused.', W / 2, H * .68, 11, C.gold, 'center', 800);
  }

  function draw() {
    ctx.save();
    if (state === 'intro') drawIntro();
    else if (state === 'level') drawLevel();
    else if (state === 'decorate') drawDecorate();
    else if (state === 'commentary') drawCommentary();
    else if (state === 'fail') drawFail();
    else if (state === 'end') drawEnd();
    if (orientationBlocked) drawRotateOverlay();
    ctx.restore();
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (W / rect.width), y: (event.clientY - rect.top) * (H / rect.height) };
  }

  function inside(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  function cellFromPoint(point) {
    const rect = boardRect();
    if (!inside(point, rect)) return null;
    const col = Math.floor((point.x - rect.x) / rect.cell);
    const row = Math.floor((point.y - rect.y) / rect.cell);
    return col >= 0 && col < COLS && row >= 0 && row < ROWS ? { col, row } : null;
  }

  function hitAt(point) {
    if (state === 'intro') {
      const buttonRect = { x: 38, y: H - 126, w: W - 76, h: 54 };
      return inside(point, buttonRect) ? { kind: 'button', id: 'start' } : null;
    }
    if (state === 'level') {
      const cell = cellFromPoint(point);
      if (cell) return { kind: 'board', cell };
      return inside(point, levelRetryRect()) ? { kind: 'button', id: 'retry' } : null;
    }
    if (state === 'decorate') {
      const rects = decorateRects();
      for (let i = 0; i < rects.length; i += 1) if (inside(point, rects[i])) return { kind: 'button', id: 'style', style: i };
      if (decorStyle >= 0 && inside(point, continueRect())) return { kind: 'button', id: 'continue' };
      return null;
    }
    if (state === 'commentary') return inside(point, continueRect()) ? { kind: 'button', id: 'continue' } : null;
    if (state === 'fail') {
      const boxY = H * .27;
      if (inside(point, { x: 44, y: boxY + 116, w: W - 88, h: 52 })) return { kind: 'button', id: 'retry' };
      if (inside(point, { x: 44, y: boxY + 178, w: W - 88, h: 48 })) return { kind: 'button', id: 'new' };
      return null;
    }
    if (state === 'end') return inside(point, { x: 18, y: H - 58, w: W - 36, h: 48 }) ? { kind: 'button', id: 'new' } : null;
    return null;
  }

  function handlePointerDown(event) {
    event.preventDefault();
    if (orientationBlocked) return;
    const point = pointFromEvent(event);
    const hit = hitAt(point);
    if (!hit) return;
    if (activePointers.size >= 8) return;
    if (hit.kind === 'board' && boardPointerId !== null) return;
    if (hit.kind === 'button') {
      for (const pressedId of pressedButtonPointers.values()) if (pressedId === hit.id) return;
    }
    canvas.focus({ preventScroll: true });
    try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* capture is optional */ }
    const record = { kind: hit.kind, id: hit.id, startX: point.x, startY: point.y, x: point.x, y: point.y, cell: hit.cell, style: hit.style };
    activePointers.set(event.pointerId, record);
    if (hit.kind === 'board') boardPointerId = event.pointerId;
    if (hit.kind === 'button') pressedButtonPointers.set(event.pointerId, hit.id);
    unlockAudio();
  }

  function handlePointerMove(event) {
    event.preventDefault();
    const record = activePointers.get(event.pointerId);
    if (!record) return;
    const point = pointFromEvent(event);
    record.x = point.x; record.y = point.y;
  }

  function releasePointer(event, cancelled) {
    event.preventDefault();
    const record = activePointers.get(event.pointerId);
    if (!record) return;
    activePointers.delete(event.pointerId);
    pressedButtonPointers.delete(event.pointerId);
    if (event.pointerId === boardPointerId) boardPointerId = null;
    try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* capture is optional */ }
    if (cancelled || orientationBlocked) return;
    const point = pointFromEvent(event);
    if (record.kind === 'board') {
      const dx = point.x - record.startX;
      const dy = point.y - record.startY;
      const start = record.cell;
      if (!start) return;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 16) {
        let toCol = start.col;
        let toRow = start.row;
        if (Math.abs(dx) > Math.abs(dy)) toCol += dx > 0 ? 1 : -1;
        else toRow += dy > 0 ? 1 : -1;
        if (toCol >= 0 && toCol < COLS && toRow >= 0 && toRow < ROWS) queueAction({ type: 'swipe', col: start.col, row: start.row, toCol, toRow });
      } else {
        const cell = cellFromPoint(point);
        if (cell) queueAction({ type: 'tap', col: cell.col, row: cell.row });
      }
    } else {
      const hit = hitAt(point);
      if (hit && hit.kind === 'button' && hit.id === record.id) {
        if (record.id === 'start') queueAction({ type: 'start' });
        if (record.id === 'retry') queueAction({ type: 'retry' });
        if (record.id === 'new') queueAction({ type: 'new' });
        if (record.id === 'continue') queueAction({ type: 'continue' });
        if (record.id === 'style') queueAction({ type: 'style', style: record.style });
      }
    }
  }

  function handleKeyDown(event) {
    if (orientationBlocked) return;
    if (heldKeys.size < 64) heldKeys.add(event.key);
    const key = event.key;
    const actionKey = key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown' || key === 'Enter' || key === ' ' || key.toLowerCase() === 'r' || key.toLowerCase() === 'n';
    if (actionKey) event.preventDefault();
    if (event.repeat) return;
    if (state === 'intro' && (key === 'Enter' || key === ' ')) queueAction({ type: 'start' });
    else if (state === 'level') {
      if (key.toLowerCase() === 'r') queueAction({ type: 'retry' });
      else if (key === 'ArrowLeft') moveCursor(-1, 0);
      else if (key === 'ArrowRight') moveCursor(1, 0);
      else if (key === 'ArrowUp') moveCursor(0, -1);
      else if (key === 'ArrowDown') moveCursor(0, 1);
      else if (key === 'Enter' || key === ' ') queueAction({ type: 'tap', col: cursor.col, row: cursor.row });
    } else if (state === 'decorate') {
      if (key === 'ArrowLeft') decorFocus = (decorFocus + 2) % 3;
      else if (key === 'ArrowRight') decorFocus = (decorFocus + 1) % 3;
      else if (key === 'Enter' || key === ' ') queueAction({ type: 'style', style: decorFocus });
    } else if (state === 'commentary' && (key === 'Enter' || key === ' ')) queueAction({ type: 'continue' });
    else if (state === 'fail') {
      if (key.toLowerCase() === 'n') queueAction({ type: 'new' });
      else if (key === 'Enter' || key === ' ') queueAction({ type: 'retry' });
    } else if (state === 'end' && (key === 'Enter' || key === ' ' || key.toLowerCase() === 'n')) queueAction({ type: 'new' });
  }

  function frame(now) {
    const dt = lastFrame ? Math.min(0.033, Math.max(0, (now - lastFrame) / 1000)) : 0;
    lastFrame = now;
    if (!orientationBlocked && !document.hidden) update(dt);
    draw();
    window.requestAnimationFrame(frame);
  }

  let boardPointerId = null;
  const initialSave = readSave();
  if (initialSave) {
    choices = initialSave.choices;
    currentLevel = initialSave.currentLevel;
    bestScore = initialSave.bestScore;
    totalScore = initialSave.totalScore;
    saveStage = initialSave.stage;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, { passive: true });
  window.addEventListener('blur', clearInputState);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearInputState(); lastFrame = 0; });
  canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
  canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
  canvas.addEventListener('pointerup', (event) => releasePointer(event, false), { passive: false });
  canvas.addEventListener('pointercancel', (event) => releasePointer(event, true), { passive: false });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('keydown', handleKeyDown, { passive: false });
  window.addEventListener('keyup', (event) => { heldKeys.delete(event.key); });
  window.requestAnimationFrame(frame);
})();
