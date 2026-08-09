(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const shell = document.getElementById('gameShell');
  const audioOverlay = document.getElementById('audioOverlay');
  const rotateOverlay = document.getElementById('rotateOverlay');
  const startButton = document.getElementById('startButton');
  const ctx = canvas.getContext('2d', { alpha: false });

  const SAVE_KEY = 'driftwood-cove-v1';
  const COLS = 6;
  const ROWS = 7;
  const CELL_COUNT = COLS * ROWS;
  const CELL_GAP = 5;
  const MAX_PARTICLES = 180;
  const MAX_FLOATERS = 28;
  const MAX_FLASHES = 32;
  const MAX_TIMERS = 24;
  const MAX_POINTERS = 16;
  const RECOVERY_MOVES = 4;
  const TAU = Math.PI * 2;

  const COLORS = {
    ink: '#071923',
    ink2: '#0c2530',
    sea: '#123844',
    seaBright: '#1b5660',
    mist: '#557975',
    paper: '#f5efd9',
    muted: '#91b2aa',
    gold: '#efbd67',
    coral: '#e98568',
    aqua: '#75d1c4',
    herb: '#91c979',
    lavender: '#b6a4dc'
  };

  const CHAINS = {
    driftwood: {
      label: 'DRIFTWOOD', short: 'DRIFT', color: '#b77c52', accent: '#e8ae6e', max: 2,
      next: ['PLANKS', 'FURNITURE']
    },
    shell: {
      label: 'SHELL', short: 'SHELL', color: '#d99c83', accent: '#f4d0a7', max: 1,
      next: ['TOOLS']
    },
    herb: {
      label: 'HERB', short: 'HERB', color: '#6ea66e', accent: '#c3e39d', max: 1,
      next: ['REMEDIES']
    }
  };

  const NOTES = [
    { chapter: 1, title: 'The empty hook', text: '08:10 — I moved the blue lantern from the pier. The fog leaned away from the empty hook.' },
    { chapter: 1, title: 'A matched hand', text: 'Every tide returns with one extra shell. Keep the pairs; the cove likes a matched hand.' },
    { chapter: 1, title: 'Rain remembered', text: 'Juniper grows where the old boards remember rain. I left a pinch beside the bell.' },
    { chapter: 1, title: 'The waiting bell', text: 'The bell is not broken. It is waiting for someone to put the cove back in order.' },
    { chapter: 2, title: 'The dry wreck', text: 'The wreck crate came in dry, though the sea was loud. Inside: a chair leg and a map with no shore.' },
    { chapter: 2, title: 'Toward a window', text: 'Two planks make a table. Two tables make a room. I keep building toward a window.' },
    { chapter: 2, title: 'Dusk clicks', text: 'The tide pool clicks at dusk. Five draws, then it rests until the work elsewhere is done.' },
    { chapter: 2, title: 'Bootprints north', text: 'At the north bluff I found my own bootprints, leading out and never back.' },
    { chapter: 3, title: 'Warm glass', text: "The lamp's glass was warm. Someone has been tending it after I stopped climbing." },
    { chapter: 3, title: 'Tomorrow ink', text: "The keeper's log ends in my handwriting, but the last page is dated tomorrow." },
    { chapter: 3, title: 'The storm behind', text: 'I was never lost at sea. I was hiding the cove from the storm that follows my name.' },
    { chapter: 3, title: 'An answer, not an alarm', text: 'Light the three places, read the twelve scraps, and tell the town: the cove is still here.' }
  ];

  const NOTE_CELLS = [2, 3, 4, 5, 8, 9, 10, 11, 14, 15, 16, 17];
  const LANDMARK_CELLS = [20, 27, 34];
  const LANDMARKS = [
    { name: 'TIDE PIER', icon: 'pier', color: COLORS.aqua },
    { name: 'KEEPER HUT', icon: 'hut', color: COLORS.gold },
    { name: 'BEACON', icon: 'beacon', color: COLORS.coral }
  ];

  let view = { w: 390, h: 700, dpr: 1, boardX: 14, boardY: 128, cell: 54, boardW: 0, boardH: 0 };
  let state = makeNewState();
  let particles = [];
  let floaters = [];
  let flashes = [];
  let activePointers = new Map();
  let controlPointers = { board: null, tide: null, wreck: null, modal: null, restart: null };
  let heldKeys = new Set();
  let queuedActions = [];
  let pendingTimers = new Set();
  let drag = null;
  let lastFrame = 0;
  let orientationPaused = false;
  let audioContext = null;
  let audioReady = false;
  let toastText = 'Start with any matching pair. The cove remembers every repair.';
  let toastLife = 4.5;

  function makeNewState() {
    const fresh = {
      board: Array(CELL_COUNT).fill(null),
      fog: Array(CELL_COUNT).fill(true),
      notes: Array(NOTES.length).fill(false),
      generators: {
        tide: { uses: 5, max: 5, recovery: 0 },
        wreck: { uses: 5, max: 5, recovery: 0 }
      },
      score: 0,
      best: 0,
      merges: 0,
      sessionTime: 0,
      landmarks: 0,
      cursor: 0,
      keyboardPick: -1,
      modal: null,
      finale: false,
      won: false
    };
    const seeds = [
      [0, 'driftwood', 0], [1, 'driftwood', 0],
      [6, 'shell', 0], [7, 'shell', 0],
      [12, 'herb', 0], [13, 'herb', 0],
      [18, 'driftwood', 0], [19, 'driftwood', 0],
      [24, 'shell', 0], [25, 'shell', 0],
      [30, 'herb', 0], [31, 'herb', 0]
    ];
    seeds.forEach(([index, kind, tier]) => {
      fresh.board[index] = { kind, tier };
      fresh.fog[index] = false;
    });
    fresh.fog[NOTE_CELLS[0]] = false;
    [20, 21, 26, 33, 34, 35].forEach(index => { fresh.fog[index] = false; });
    return fresh;
  }

  function safeReadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function finiteInt(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function loadState() {
    const saved = safeReadSave();
    if (!saved) return;
    const fresh = makeNewState();
    if (Array.isArray(saved.board) && saved.board.length === CELL_COUNT) {
      fresh.board = saved.board.map(item => {
        if (!item || typeof item !== 'object') return null;
        const kind = typeof item.kind === 'string' && CHAINS[item.kind] ? item.kind : '';
        const tier = finiteInt(item.tier, -1, 0, 2);
        if (!kind || tier > CHAINS[kind].max) return null;
        return { kind, tier };
      });
      fresh.board.forEach((item, index) => { if (item) fresh.fog[index] = false; });
    }
    if (Array.isArray(saved.fog) && saved.fog.length === CELL_COUNT) {
      fresh.fog = saved.fog.map(value => value === true);
    }
    fresh.board.forEach((item, index) => { if (item) fresh.fog[index] = false; });
    if (Array.isArray(saved.notes) && saved.notes.length === NOTES.length) {
      fresh.notes = saved.notes.map(value => value === true);
    }
    ['tide', 'wreck'].forEach(id => {
      if (!saved.generators || !saved.generators[id] || typeof saved.generators[id] !== 'object') return;
      const g = saved.generators[id];
      fresh.generators[id].uses = finiteInt(g.uses, 5, 0, 5);
      fresh.generators[id].recovery = finiteInt(g.recovery, 0, 0, RECOVERY_MOVES - 1);
    });
    fresh.score = finiteInt(saved.score, 0, 0, 999999);
    fresh.best = finiteInt(saved.best, 0, 0, 999999);
    fresh.merges = finiteInt(saved.merges, 0, 0, 9999);
    fresh.sessionTime = Math.max(0, Math.min(999999, Number.isFinite(Number(saved.sessionTime)) ? Number(saved.sessionTime) : 0));
    fresh.landmarks = finiteInt(saved.landmarks, 0, 0, 3);
    fresh.cursor = finiteInt(saved.cursor, 0, 0, CELL_COUNT - 1);
    fresh.won = saved.won === true && fresh.notes.every(Boolean);
    fresh.finale = fresh.won;
    state = fresh;
    syncProgress(false);
    ensureBoardPlayable();
  }

  function safeSave() {
    const payload = {
      board: state.board,
      fog: state.fog,
      notes: state.notes,
      generators: state.generators,
      score: finiteInt(state.score, 0, 0, 999999),
      best: finiteInt(Math.max(state.best, state.score), 0, 0, 999999),
      merges: finiteInt(state.merges, 0, 0, 9999),
      sessionTime: Math.max(0, Math.min(999999, state.sessionTime)),
      landmarks: finiteInt(state.landmarks, 0, 0, 3),
      cursor: finiteInt(state.cursor, 0, 0, CELL_COUNT - 1),
      won: state.won === true
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch (_) { /* A full or blocked store must not stop play. */ }
  }

  function clearSavedState() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* Storage is optional. */ }
  }

  function schedule(callback, delay) {
    if (pendingTimers.size >= MAX_TIMERS) return 0;
    const id = setTimeout(() => {
      pendingTimers.delete(id);
      callback();
    }, delay);
    pendingTimers.add(id);
    return id;
  }

  function cancelPendingTimers() {
    pendingTimers.forEach(id => clearTimeout(id));
    pendingTimers.clear();
  }

  function resetInput() {
    activePointers.clear();
    Object.keys(controlPointers).forEach(key => { controlPointers[key] = null; });
    heldKeys.clear();
    queuedActions.length = 0;
    drag = null;
  }

  function restartGame() {
    cancelPendingTimers();
    resetInput();
    const previousBest = state.best;
    state = makeNewState();
    state.best = previousBest;
    particles.length = 0;
    floaters.length = 0;
    flashes.length = 0;
    toastText = 'Fresh tide. Start with any matching pair.';
    toastLife = 3.5;
    clearSavedState();
    safeSave();
    playTone(240, .07, 'sine');
  }

  function unlockAudio() {
    if (audioReady) return;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audioContext = new AudioCtor();
      if (audioContext.state === 'suspended') audioContext.resume();
      audioReady = true;
      playTone(420, .08, 'sine');
    } catch (_) { audioReady = false; }
  }

  function playTone(frequency, duration, type) {
    if (!audioReady || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type || 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * .72), now + duration);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.055, now + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + .02);
    } catch (_) { /* Sound is decorative. */ }
  }

  function showToast(text, life) {
    toastText = text;
    toastLife = life || 3;
  }

  function currentChapter() {
    const found = state.notes.filter(Boolean).length;
    return found >= 8 ? 3 : found >= 4 ? 2 : 1;
  }

  function noteUnlocked(index) {
    if (index < 0 || index >= NOTES.length) return false;
    return index === 0 || state.notes[index - 1] === true;
  }

  function syncProgress(notify) {
    const cleared = state.fog.filter(value => value === false).length;
    const thresholds = [20, 28, 36];
    while (state.landmarks < 3 && cleared >= thresholds[state.landmarks]) {
      const landmarkIndex = state.landmarks;
      state.landmarks += 1;
      const cell = LANDMARK_CELLS[landmarkIndex];
      state.fog[cell] = false;
      burstAtCell(cell, LANDMARKS[landmarkIndex].color, 18);
      if (flashes.length < MAX_FLASHES) flashes.push({ life: .52, max: .52, color: LANDMARKS[landmarkIndex].color });
      showToast(`${LANDMARKS[landmarkIndex].name} restored • a new chapter opens`, 4);
      playTone(520 + landmarkIndex * 90, .2, 'triangle');
    }
    if (notify) safeSave();
  }

  function clearFogNear(index) {
    const cx = index % COLS;
    const cy = Math.floor(index / COLS);
    const candidates = [];
    for (let y = -1; y <= 1; y += 1) {
      for (let x = -1; x <= 1; x += 1) {
        const nx = cx + x;
        const ny = cy + y;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        const cell = ny * COLS + nx;
        if (state.fog[cell]) candidates.push(cell);
      }
    }
    candidates.sort((a, b) => Math.abs(a - index) - Math.abs(b - index));
    candidates.slice(0, 5).forEach(cell => {
      state.fog[cell] = false;
      const point = cellCenter(cell);
      burst(point.x, point.y, COLORS.mist, 3, .55);
    });
    syncProgress(true);
  }

  function recoverGenerators() {
    ['tide', 'wreck'].forEach(id => {
      const generator = state.generators[id];
      if (generator.uses > 0) return;
      generator.recovery = Math.min(RECOVERY_MOVES, generator.recovery + 1);
      if (generator.recovery >= RECOVERY_MOVES) {
        generator.uses = generator.max;
        generator.recovery = 0;
        showToast(`${id === 'tide' ? 'Tide pool' : 'Wreck crate'} is ready again`, 2.4);
        playTone(id === 'tide' ? 300 : 220, .1, 'sine');
      }
    });
  }

  function tryMerge(from, to) {
    if (from === to || from < 0 || to < 0) return false;
    const first = state.board[from];
    const second = state.board[to];
    if (!first || !second || first.kind !== second.kind || first.tier !== second.tier) {
      showToast('Only matching pieces can join.', 1.6);
      return false;
    }
    const chain = CHAINS[first.kind];
    if (first.tier >= chain.max) {
      showToast(`${chain.next[first.tier - 1] || chain.label} is a finished link.`, 1.8);
      return false;
    }
    state.board[from] = null;
    state.board[to] = { kind: first.kind, tier: first.tier + 1 };
    state.merges = Math.min(9999, state.merges + 1);
    state.score = Math.min(999999, state.score + 12 * (first.tier + 1));
    state.best = Math.max(state.best, state.score);
    const point = cellCenter(to);
    burst(point.x, point.y, chain.color, 20, 1);
    if (flashes.length < MAX_FLASHES) flashes.push({ life: .32, max: .32, color: chain.accent });
    shake = Math.min(10, shake + 5);
    playTone(260 + first.tier * 100, .12, first.tier ? 'triangle' : 'sine');
    clearFogNear(to);
    recoverGenerators();
    if (state.merges % 3 === 0) showToast('The fog gives way. Keep the chain moving.', 2.5);
    safeSave();
    ensureBoardPlayable();
    return true;
  }

  function generatorKind(id) {
    if (id === 'tide') return state.merges % 2 === 0 ? 'shell' : 'herb';
    return state.merges % 2 === 0 ? 'driftwood' : 'herb';
  }

  function tapGenerator(id) {
    const generator = state.generators[id];
    if (!generator || generator.uses <= 0) {
      const moves = generator ? RECOVERY_MOVES - generator.recovery : RECOVERY_MOVES;
      showToast(`${id === 'tide' ? 'Tide pool' : 'Wreck crate'} resting • merge ${moves} more elsewhere`, 2.8);
      playTone(120, .07, 'square');
      return;
    }
    const target = findSpawnCell();
    if (target < 0) {
      showToast('The board is full. Merge a pair to make room.', 2.5);
      playTone(120, .07, 'square');
      return;
    }
    const kind = generatorKind(id);
    state.board[target] = { kind, tier: 0 };
    state.fog[target] = false;
    generator.uses -= 1;
    const point = cellCenter(target);
    burst(point.x, point.y, CHAINS[kind].accent, 12, .8);
    showToast(`${kind === 'driftwood' ? 'Driftwood' : kind === 'shell' ? 'A shell' : 'Juniper'} washed ashore.`, 1.8);
    playTone(id === 'tide' ? 350 : 190, .09, 'sine');
    safeSave();
    ensureBoardPlayable();
  }

  function findSpawnCell() {
    const open = [];
    for (let i = 0; i < CELL_COUNT; i += 1) {
      if (!state.board[i] && !state.fog[i] && landmarkAt(i) < 0) open.push(i);
    }
    if (!open.length) return -1;
    return open[Math.floor(Math.random() * open.length)];
  }

  function hasLegalMerge() {
    for (let i = 0; i < CELL_COUNT; i += 1) {
      const first = state.board[i];
      if (!first || first.tier >= CHAINS[first.kind].max) continue;
      for (let j = i + 1; j < CELL_COUNT; j += 1) {
        const second = state.board[j];
        if (second && second.kind === first.kind && second.tier === first.tier) return true;
      }
    }
    return false;
  }

  function ensureBoardPlayable() {
    if (hasLegalMerge() || findSpawnCell() >= 0 || state.finale) return;
    const occupied = state.board.map((item, index) => item ? index : -1).filter(index => index >= 0);
    if (occupied.length < 2) {
      const reveal = state.board.findIndex((item, index) => !item && landmarkAt(index) < 0);
      if (reveal >= 0) {
        state.fog[reveal] = false;
        showToast('The cove reveals one more place to work.', 3);
        safeSave();
      }
      return;
    }
    const first = occupied[0], second = occupied[1];
    const kind = state.board[first].kind;
    const tier = Math.max(0, CHAINS[kind].max - 1);
    state.board[first] = { kind, tier };
    state.board[second] = { kind, tier };
    state.keyboardPick = -1;
    showToast('The cove rearranges two pieces and opens a new match.', 3);
    safeSave();
  }

  function landmarkAt(index) {
    for (let i = 0; i < LANDMARK_CELLS.length; i += 1) {
      if (LANDMARK_CELLS[i] === index && state.landmarks > i) return i;
    }
    return -1;
  }

  function openNote(index) {
    if (index < 0 || index >= NOTES.length || state.notes[index] || !noteUnlocked(index)) return;
    state.notes[index] = true;
    if (index + 1 < NOTE_CELLS.length) state.fog[NOTE_CELLS[index + 1]] = false;
    state.modal = index;
    state.score = Math.min(999999, state.score + 25);
    state.best = Math.max(state.best, state.score);
    state.keyboardPick = -1;
    const point = cellCenter(NOTE_CELLS[index]);
    burst(point.x, point.y, COLORS.gold, 20, .9);
    shake = Math.min(10, shake + 3);
    playTone(480 + NOTES[index].chapter * 80, .2, 'triangle');
    if (state.notes.every(Boolean)) {
      state.modal = null;
      state.finale = true;
      state.won = true;
      showToast('The last note turns the fog into a road home.', 4);
      safeSave();
    } else {
      showToast(`Found note ${String(index + 1).padStart(2, '0')} • read it closely`, 2.4);
      safeSave();
    }
  }

  function closeModal() {
    if (state.finale) return;
    state.modal = null;
    resetPointerOnly();
  }

  function resetPointerOnly() {
    activePointers.clear();
    Object.keys(controlPointers).forEach(key => { controlPointers[key] = null; });
    drag = null;
  }

  function queueAction(action) {
    if (queuedActions.length < 12) queuedActions.push(action);
  }

  function processActions() {
    if (orientationPaused || document.hidden) { queuedActions.length = 0; return; }
    while (queuedActions.length) {
      const action = queuedActions.shift();
      if (action === 'space') keyboardSpace();
      if (action === 'left') moveCursor(-1, 0);
      if (action === 'right') moveCursor(1, 0);
      if (action === 'up') moveCursor(0, -1);
      if (action === 'down') moveCursor(0, 1);
    }
  }

  function moveCursor(dx, dy) {
    const x = state.cursor % COLS;
    const y = Math.floor(state.cursor / COLS);
    const nx = Math.max(0, Math.min(COLS - 1, x + dx));
    const ny = Math.max(0, Math.min(ROWS - 1, y + dy));
    state.cursor = ny * COLS + nx;
  }

  function keyboardSpace() {
    if (state.finale) { restartGame(); return; }
    if (state.modal !== null) { closeModal(); return; }
    const index = state.cursor;
    if (state.keyboardPick < 0) {
      if (state.board[index]) {
        state.keyboardPick = index;
        showToast('Selected. Move with arrows, then press Space on a match.', 2.2);
        playTone(350, .05, 'sine');
      } else if (noteIndexAtCell(index) >= 0) {
        openNote(noteIndexAtCell(index));
      }
      return;
    }
    if (state.keyboardPick === index) {
      state.keyboardPick = -1;
      return;
    }
    tryMerge(state.keyboardPick, index);
    state.keyboardPick = -1;
  }

  function noteIndexAtCell(cell) {
    for (let i = 0; i < NOTE_CELLS.length; i += 1) {
      if (NOTE_CELLS[i] === cell && noteUnlocked(i) && !state.notes[i]) return i;
    }
    return -1;
  }

  function resize() {
    view.w = Math.max(240, window.innerWidth || 390);
    view.h = Math.max(420, window.innerHeight || 700);
    const wasPaused = orientationPaused;
    orientationPaused = view.w > view.h;
    rotateOverlay.hidden = !orientationPaused;
    if (orientationPaused && !wasPaused) { cancelPendingTimers(); resetInput(); }
    const longAxis = Math.max(view.w, view.h);
    view.dpr = Math.min(window.devicePixelRatio || 1, 2, 960 / longAxis);
    canvas.width = Math.max(1, Math.round(view.w * view.dpr));
    canvas.height = Math.max(1, Math.round(view.h * view.dpr));
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    view.boardW = Math.min(view.w - 24, 380);
    view.cell = (view.boardW - CELL_GAP * (COLS - 1)) / COLS;
    view.boardW = view.cell * COLS + CELL_GAP * (COLS - 1);
    view.boardX = (view.w - view.boardW) / 2;
    view.boardY = view.h < 590 ? 112 : 128;
    view.boardH = view.cell * ROWS + CELL_GAP * (ROWS - 1);
  }

  function cellRect(index) {
    const x = index % COLS;
    const y = Math.floor(index / COLS);
    return { x: view.boardX + x * (view.cell + CELL_GAP), y: view.boardY + y * (view.cell + CELL_GAP), w: view.cell, h: view.cell };
  }

  function cellCenter(index) {
    const rect = cellRect(Math.max(0, Math.min(CELL_COUNT - 1, index)));
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  }

  function cellAt(x, y) {
    const col = Math.floor((x - view.boardX) / (view.cell + CELL_GAP));
    const row = Math.floor((y - view.boardY) / (view.cell + CELL_GAP));
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return -1;
    const rect = cellRect(row * COLS + col);
    if (x > rect.x + rect.w || y > rect.y + rect.h) return -1;
    return row * COLS + col;
  }

  function generatorRect(id) {
    const margin = 14;
    const gap = 8;
    const width = (view.w - margin * 2 - gap) / 2;
    return { x: margin + (id === 'wreck' ? width + gap : 0), y: view.h - 76, w: width, h: 58 };
  }

  function restartRect() {
    return { x: view.w - 104, y: 12, w: 90, h: 50 };
  }

  function modalCloseRect() {
    if (state.finale) {
      const height = Math.min(430, view.h - 170);
      return { x: 18, y: 96 + height - 62, w: view.w - 36, h: 58 };
    }
    const height = Math.min(350, view.h - 210);
    return { x: 18, y: 116 + height - 65, w: view.w - 36, h: 58 };
  }

  function pointIn(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  function pointerPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function pointerDown(event) {
    event.preventDefault();
    unlockAudio();
    const point = pointerPoint(event);
    const id = event.pointerId;
    if (activePointers.has(id) || activePointers.size >= MAX_POINTERS) return;
    if (orientationPaused || document.hidden) return;
    if (state.finale) {
      if (pointIn(point, modalCloseRect()) && controlPointers.restart === null) {
        controlPointers.restart = id;
        activePointers.set(id, 'restart');
        canvas.setPointerCapture?.(id);
      }
      return;
    }
    if (state.modal !== null) {
      if (pointIn(point, modalCloseRect()) && controlPointers.modal === null) {
        controlPointers.modal = id;
        activePointers.set(id, 'modal');
        canvas.setPointerCapture?.(id);
      }
      return;
    }
    if (pointIn(point, restartRect()) && controlPointers.restart === null) {
      controlPointers.restart = id;
      activePointers.set(id, 'restart');
      canvas.setPointerCapture?.(id);
      return;
    }
    for (const generatorId of ['tide', 'wreck']) {
      if (pointIn(point, generatorRect(generatorId)) && controlPointers[generatorId] === null) {
        controlPointers[generatorId] = id;
        activePointers.set(id, generatorId);
        canvas.setPointerCapture?.(id);
        return;
      }
    }
    const index = cellAt(point.x, point.y);
    if (index >= 0 && controlPointers.board === null) {
      controlPointers.board = id;
      activePointers.set(id, 'board');
      drag = { pointerId: id, start: index, end: index, point };
      state.cursor = index;
      canvas.setPointerCapture?.(id);
    }
  }

  function pointerMove(event) {
    const kind = activePointers.get(event.pointerId);
    if (kind !== 'board' || !drag || drag.pointerId !== event.pointerId || orientationPaused || document.hidden) return;
    event.preventDefault();
    const point = pointerPoint(event);
    const index = cellAt(point.x, point.y);
    if (index >= 0) drag.end = index;
    drag.point = point;
    state.cursor = index >= 0 ? index : state.cursor;
  }

  function pointerUp(event, cancelled) {
    const id = event.pointerId;
    const kind = activePointers.get(id);
    if (!kind) return;
    if (orientationPaused || document.hidden) { resetInput(); return; }
    event.preventDefault();
    const point = pointerPoint(event);
    activePointers.delete(id);
    if (controlPointers[kind] === id) controlPointers[kind] = null;
    if (kind === 'restart') {
      if (!cancelled && (state.finale || pointIn(point, restartRect()))) restartGame();
      return;
    }
    if (kind === 'modal') {
      if (!cancelled && pointIn(point, modalCloseRect())) closeModal();
      return;
    }
    if (kind === 'tide' || kind === 'wreck') {
      if (!cancelled && pointIn(point, generatorRect(kind))) tapGenerator(kind);
      return;
    }
    if (kind === 'board') {
      const boardDrag = drag;
      drag = null;
      if (cancelled || !boardDrag) return;
      const end = cellAt(point.x, point.y);
      const finalCell = end >= 0 ? end : boardDrag.end;
      const noteIndex = noteIndexAtCell(finalCell);
      if (noteIndex >= 0 && boardDrag.start === finalCell) {
        openNote(noteIndex);
      } else if (boardDrag.start !== finalCell) {
        tryMerge(boardDrag.start, finalCell);
        state.keyboardPick = -1;
      } else if (state.board[finalCell]) {
        state.keyboardPick = state.keyboardPick === finalCell ? -1 : finalCell;
        showToast('Selected. Drag it onto its match.', 1.6);
      }
    }
  }

  function clearAllInput() {
    resetInput();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, view.h);
    gradient.addColorStop(0, '#061721');
    gradient.addColorStop(.56, '#0c2b36');
    gradient.addColorStop(1, '#071923');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.save();
    ctx.globalAlpha = .18;
    ctx.strokeStyle = COLORS.aqua;
    ctx.lineWidth = 1;
    for (let row = 0; row < 8; row += 1) {
      ctx.beginPath();
      for (let x = -20; x < view.w + 30; x += 18) {
        const y = 75 + row * 90 + Math.sin(x * .035 + row) * 3;
        if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHeader() {
    ctx.fillStyle = COLORS.paper;
    ctx.font = '800 20px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('DRIFTWOOD COVE', 16, 28);
    ctx.fillStyle = COLORS.gold;
    ctx.font = '800 10px Arial, sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillText(`CHAPTER ${currentChapter()}  ·  ${['LOW TIDE', 'THE DRY WRECK', 'THE ANSWERING LIGHT'][currentChapter() - 1]}`, 17, 46);
    ctx.letterSpacing = '0px';
    const button = restartRect();
    roundedRect(button.x, button.y, button.w, button.h, 12, '#143b43', '#2b6870');
    ctx.fillStyle = COLORS.paper;
    ctx.font = '800 10px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NEW COVE', button.x + button.w / 2, button.y + 26);
    drawStat(16, 67, 'SCORE', String(state.score));
    drawStat(95, 67, 'NOTES', `${state.notes.filter(Boolean).length}/12`);
    drawStat(176, 67, 'LANDMARKS', `${state.landmarks}/3`);
    drawStat(281, 67, 'BEST', String(Math.max(state.best, state.score)));
    ctx.textAlign = 'left';
    const milestones = [20, 28, 36];
    const cleared = state.fog.filter(value => value === false).length;
    ctx.fillStyle = COLORS.muted;
    ctx.font = '700 9px Arial, sans-serif';
    ctx.fillText(`MIST CLEAR  ${Math.min(cleared, 42)}/42`, 16, 93);
    for (let i = 0; i < 3; i += 1) {
      const x = 104 + i * 16;
      ctx.beginPath();
      ctx.arc(x, 90, 4, 0, TAU);
      ctx.fillStyle = state.landmarks > i ? LANDMARKS[i].color : '#244852';
      ctx.fill();
      if (cleared < milestones[i] && state.landmarks === i) {
        ctx.strokeStyle = COLORS.gold;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function drawStat(x, y, label, value) {
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '700 8px Arial, sans-serif';
    ctx.fillText(label, x, y);
    ctx.fillStyle = COLORS.paper;
    ctx.font = '800 14px Arial, sans-serif';
    ctx.fillText(value, x, y + 16);
  }

  function drawBoard() {
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '800 10px Arial, sans-serif';
    ctx.fillText('THE FOGGED BOARD', view.boardX, view.boardY - 11);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.gold;
    ctx.font = '700 10px Arial, sans-serif';
    ctx.fillText(`${state.merges} REPAIRS`, view.boardX + view.boardW, view.boardY - 11);
    ctx.textAlign = 'left';
    for (let i = 0; i < CELL_COUNT; i += 1) drawCell(i);
    if (drag) {
      const targetRect = cellRect(drag.end);
      ctx.save();
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 3;
      ctx.globalAlpha = .9;
      roundedRect(targetRect.x - 2, targetRect.y - 2, targetRect.w + 4, targetRect.h + 4, 13, 'rgba(0,0,0,0)', COLORS.gold);
      ctx.restore();
    }
    if (state.keyboardPick >= 0) {
      const picked = cellRect(state.keyboardPick);
      ctx.save();
      ctx.strokeStyle = COLORS.coral;
      ctx.lineWidth = 3;
      roundedRect(picked.x - 3, picked.y - 3, picked.w + 6, picked.h + 6, 14, 'rgba(0,0,0,0)', COLORS.coral);
      ctx.restore();
    }
    const cursor = cellRect(state.cursor);
    ctx.save();
    ctx.strokeStyle = 'rgba(245,239,217,.8)';
    ctx.lineWidth = 1.5;
    roundedRect(cursor.x - 1, cursor.y - 1, cursor.w + 2, cursor.h + 2, 11, 'rgba(0,0,0,0)', 'rgba(245,239,217,.8)');
    ctx.restore();
  }

  function drawCell(index) {
    const rect = cellRect(index);
    const landmark = landmarkAt(index);
    if (state.fog[index]) {
      roundedRect(rect.x, rect.y, rect.w, rect.h, 12, '#36585a', '#527572');
      ctx.save();
      ctx.globalAlpha = .18;
      ctx.fillStyle = COLORS.paper;
      for (let p = 0; p < 3; p += 1) {
        ctx.beginPath();
        ctx.arc(rect.x + rect.w * (.22 + p * .27), rect.y + rect.h * (.36 + (p % 2) * .2), rect.w * .11, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#80a59c';
      ctx.font = '800 8px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MIST', rect.x + rect.w / 2, rect.y + rect.h * .82);
      ctx.textAlign = 'left';
      return;
    }
    roundedRect(rect.x, rect.y, rect.w, rect.h, 12, '#123a46', '#255966');
    if (landmark >= 0) drawLandmark(rect, landmark);
    const item = state.board[index];
    if (item) drawItem(rect, item);
    const note = noteIndexAtCell(index);
    if (note >= 0) drawNotePin(rect, note);
  }

  function drawItem(rect, item) {
    const chain = CHAINS[item.kind];
    const scale = rect.w / 56;
    ctx.save();
    ctx.translate(rect.x, rect.y);
    ctx.shadowColor = 'rgba(0,0,0,.28)';
    ctx.shadowBlur = 7 * scale;
    roundedRect(4 * scale, 4 * scale, rect.w - 8 * scale, rect.h - 8 * scale, 10 * scale, chain.color, 'rgba(255,255,255,.22)');
    ctx.shadowColor = 'transparent';
    drawIcon(item.kind, item.tier, rect.w / 2, rect.h * .43, scale, chain.accent);
    ctx.fillStyle = '#10272e';
    ctx.font = `800 ${Math.max(7, 8 * scale)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(item.tier === 0 ? chain.short : chain.next[item.tier - 1], rect.w / 2, rect.h - 10 * scale);
    ctx.fillStyle = 'rgba(245,239,217,.75)';
    ctx.font = `800 ${Math.max(7, 8 * scale)}px Arial, sans-serif`;
    ctx.fillText(item.tier === 0 ? 'I' : item.tier === 1 ? 'II' : 'III', rect.w - 12 * scale, 14 * scale);
    ctx.restore();
  }

  function drawIcon(kind, tier, x, y, scale, accent) {
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = Math.max(1.5, 2.2 * scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (kind === 'driftwood') {
      if (tier === 0) {
        ctx.rotate(-.14);
        roundedRect(x - 14 * scale, y - 3 * scale, 28 * scale, 7 * scale, 3 * scale, accent, 'rgba(0,0,0,.14)');
        ctx.beginPath(); ctx.moveTo(x - 7 * scale, y - 2 * scale); ctx.lineTo(x - 3 * scale, y + 2 * scale); ctx.moveTo(x + 3 * scale, y - 2 * scale); ctx.lineTo(x + 7 * scale, y + 2 * scale); ctx.stroke();
      } else if (tier === 1) {
        for (let i = -1; i <= 1; i += 1) {
          ctx.beginPath(); ctx.moveTo(x - 13 * scale, y + i * 6 * scale); ctx.lineTo(x + 12 * scale, y + i * 6 * scale); ctx.stroke();
        }
      } else {
        ctx.beginPath(); ctx.moveTo(x - 12 * scale, y + 9 * scale); ctx.lineTo(x - 12 * scale, y - 9 * scale); ctx.lineTo(x + 9 * scale, y - 9 * scale); ctx.lineTo(x + 9 * scale, y + 9 * scale); ctx.moveTo(x - 16 * scale, y + 9 * scale); ctx.lineTo(x + 14 * scale, y + 9 * scale); ctx.stroke();
      }
    } else if (kind === 'shell') {
      ctx.beginPath();
      ctx.arc(x, y + 4 * scale, 13 * scale, Math.PI, TAU);
      ctx.lineTo(x + 13 * scale, y + 4 * scale);
      ctx.quadraticCurveTo(x, y + 14 * scale, x - 13 * scale, y + 4 * scale);
      ctx.closePath(); ctx.fill();
      for (let i = -1; i <= 1; i += 1) { ctx.beginPath(); ctx.moveTo(x, y + 4 * scale); ctx.lineTo(x + i * 8 * scale, y - 7 * scale); ctx.stroke(); }
    } else {
      ctx.beginPath(); ctx.moveTo(x, y + 13 * scale); ctx.quadraticCurveTo(x - 11 * scale, y + 1 * scale, x - 5 * scale, y - 10 * scale); ctx.quadraticCurveTo(x + 10 * scale, y - 6 * scale, x, y + 13 * scale); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y + 14 * scale); ctx.lineTo(x + 4 * scale, y - 12 * scale); ctx.stroke();
      if (tier === 1) { ctx.beginPath(); ctx.moveTo(x + 10 * scale, y - 7 * scale); ctx.lineTo(x + 16 * scale, y - 7 * scale); ctx.moveTo(x + 13 * scale, y - 10 * scale); ctx.lineTo(x + 13 * scale, y - 4 * scale); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawNotePin(rect, index) {
    const x = rect.x + rect.w - 10;
    const y = rect.y + 10;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 5;
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 4, y + 6); ctx.lineTo(x, y + 13); ctx.lineTo(x + 4, y + 6); ctx.closePath(); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#173039';
    ctx.font = '800 7px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(index + 1), x, y + 3);
    ctx.restore();
  }

  function drawLandmark(rect, index) {
    const centerX = rect.x + rect.w / 2;
    const base = rect.y + rect.h * .68;
    ctx.save();
    ctx.strokeStyle = LANDMARKS[index].color;
    ctx.fillStyle = LANDMARKS[index].color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (index === 0) {
      ctx.beginPath(); ctx.moveTo(centerX - 17, base); ctx.lineTo(centerX + 17, base); ctx.moveTo(centerX - 12, base); ctx.lineTo(centerX - 12, base - 17); ctx.moveTo(centerX + 12, base); ctx.lineTo(centerX + 12, base - 17); ctx.moveTo(centerX - 15, base - 17); ctx.lineTo(centerX + 15, base - 17); ctx.stroke();
    } else if (index === 1) {
      ctx.beginPath(); ctx.moveTo(centerX - 16, base + 2); ctx.lineTo(centerX, base - 15); ctx.lineTo(centerX + 16, base + 2); ctx.closePath(); ctx.stroke(); ctx.strokeRect(centerX - 11, base + 2, 22, 13); ctx.beginPath(); ctx.arc(centerX, base + 8, 2, 0, TAU); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(centerX - 9, base + 15); ctx.lineTo(centerX - 9, base - 12); ctx.lineTo(centerX + 9, base - 12); ctx.lineTo(centerX + 9, base + 15); ctx.closePath(); ctx.fill(); ctx.fillStyle = COLORS.paper; ctx.beginPath(); ctx.arc(centerX, base - 18, 6, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(centerX, base - 25); ctx.lineTo(centerX, base - 35); ctx.stroke();
    }
    ctx.fillStyle = COLORS.paper;
    ctx.font = '800 7px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(LANDMARKS[index].name, centerX, rect.y + rect.h - 7);
    ctx.restore();
  }

  function drawGenerators() {
    const hintY = view.h - 96;
    ctx.fillStyle = COLORS.muted;
    ctx.font = '700 10px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DRAG MATCHES TOGETHER  •  REPAIR THE COVE  •  FOLLOW THE PINS', view.w / 2, hintY);
    ['tide', 'wreck'].forEach(id => {
      const rect = generatorRect(id);
      const generator = state.generators[id];
      const resting = generator.uses <= 0;
      const base = id === 'tide' ? '#16505a' : '#4b3a38';
      const edge = id === 'tide' ? '#3b9a94' : '#bd745e';
      roundedRect(rect.x, rect.y, rect.w, rect.h, 16, resting ? '#253b40' : base, resting ? '#4b6565' : edge);
      ctx.fillStyle = resting ? '#8ba09b' : COLORS.paper;
      ctx.font = '800 11px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(id === 'tide' ? 'TIDE POOL' : 'WRECK CRATE', rect.x + 14, rect.y + 20);
      ctx.fillStyle = resting ? COLORS.gold : COLORS.muted;
      ctx.font = '700 9px Arial, sans-serif';
      const label = resting ? `RESTING  ${generator.recovery}/${RECOVERY_MOVES}` : `TAP TO DRAW  ${generator.uses}/${generator.max}`;
      ctx.fillText(label, rect.x + 14, rect.y + 39);
      drawGeneratorIcon(rect.x + rect.w - 28, rect.y + 29, id, resting);
      if (resting) {
        ctx.strokeStyle = COLORS.gold;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rect.x + rect.w - 28, rect.y + 29, 17, -Math.PI / 2, -Math.PI / 2 + TAU * generator.recovery / RECOVERY_MOVES);
        ctx.stroke();
      }
    });
    ctx.textAlign = 'left';
  }

  function drawGeneratorIcon(x, y, id, resting) {
    ctx.save();
    ctx.strokeStyle = resting ? '#8ba09b' : (id === 'tide' ? COLORS.aqua : COLORS.coral);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    if (id === 'tide') {
      ctx.beginPath(); ctx.arc(x, y + 2, 13, Math.PI, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 14, y + 2); ctx.quadraticCurveTo(x, y + 11, x + 14, y + 2); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y - 4, 3, 0, TAU); ctx.fill();
    } else {
      ctx.strokeRect(x - 13, y - 11, 26, 23); ctx.beginPath(); ctx.moveTo(x - 13, y - 4); ctx.lineTo(x + 13, y - 4); ctx.moveTo(x - 4, y - 11); ctx.lineTo(x - 4, y + 12); ctx.stroke(); ctx.fillRect(x + 4, y + 2, 5, 5);
    }
    ctx.restore();
  }

  function drawToast() {
    if (toastLife <= 0) return;
    const width = Math.min(view.w - 28, Math.max(220, toastText.length * 6.1));
    const x = (view.w - width) / 2;
    const y = view.boardY + view.boardH + 7;
    if (y > view.h - 150) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, toastLife * 2);
    roundedRect(x, y, width, 26, 11, 'rgba(5,20,27,.88)', 'rgba(117,209,196,.35)');
    ctx.fillStyle = COLORS.paper;
    ctx.font = '700 10px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(toastText, view.w / 2, y + 17);
    ctx.restore();
  }

  function drawModal() {
    if (state.modal === null && !state.finale) return;
    ctx.save();
    ctx.fillStyle = 'rgba(3,13,19,.74)';
    ctx.fillRect(0, 0, view.w, view.h);
    const x = 18;
    const y = state.finale ? 96 : 116;
    const w = view.w - 36;
    const h = state.finale ? Math.min(430, view.h - 170) : Math.min(350, view.h - 210);
    roundedRect(x, y, w, h, 24, '#102f39', '#d29b59');
    if (state.finale) drawFinale(x, y, w, h);
    else drawNoteModal(x, y, w, h, state.modal);
    ctx.restore();
  }

  function drawNoteModal(x, y, w, h, index) {
    const note = NOTES[index];
    ctx.fillStyle = COLORS.gold;
    ctx.font = '800 10px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`FOUND NOTE ${String(index + 1).padStart(2, '0')}  ·  CHAPTER ${note.chapter}`, x + 22, y + 31);
    ctx.fillStyle = COLORS.paper;
    ctx.font = '800 23px Arial, sans-serif';
    ctx.fillText(note.title, x + 22, y + 64);
    ctx.fillStyle = '#c3d6cd';
    ctx.font = '16px Georgia, serif';
    wrapText(note.text, x + 22, y + 101, w - 44, 25, 4);
    const button = { x: x + 20, y: y + h - 65, w: w - 40, h: 48 };
    roundedRect(button.x, button.y, button.w, button.h, 13, '#efbd67', '#ffdc9a');
    ctx.fillStyle = '#122c34';
    ctx.font = '800 11px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CONTINUE  •  SPACE', view.w / 2, button.y + 29);
  }

  function drawFinale(x, y, w, h) {
    ctx.fillStyle = COLORS.gold;
    ctx.font = '800 10px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CHAPTER 3 FINALE  ·  RESOLUTION', x + 22, y + 31);
    ctx.fillStyle = COLORS.paper;
    ctx.font = '800 25px Arial, sans-serif';
    ctx.fillText('THE ANSWERING LIGHT', x + 22, y + 66);
    ctx.fillStyle = COLORS.aqua;
    ctx.font = 'italic 15px Georgia, serif';
    wrapText('The cove was never empty. It was waiting to be read.', x + 22, y + 101, w - 44, 23, 2);
    ctx.fillStyle = '#c3d6cd';
    ctx.font = '15px Georgia, serif';
    const finaleText = 'Mara Vale followed the pattern from driftwood to beacon. The missing keeper had hidden the cove’s story inside its own repairs; when the third landmark glowed, the fog became a road home. At first light, the bell rang once—an answer, not an alarm.';
    wrapText(finaleText, x + 22, y + 148, w - 44, 22, 8);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '700 10px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${state.score} fragments  ·  12 notes  ·  3 landmarks restored`, view.w / 2, y + h - 82);
    const button = { x: x + 20, y: y + h - 62, w: w - 40, h: 46 };
    roundedRect(button.x, button.y, button.w, button.h, 13, '#efbd67', '#ffdc9a');
    ctx.fillStyle = '#122c34';
    ctx.font = '800 11px Arial, sans-serif';
    ctx.fillText('NEW COVE  •  SPACE', view.w / 2, button.y + 28);
  }

  function wrapText(text, x, y, maxWidth, lineHeight, maxLines) {
    const words = text.split(' ');
    let line = '';
    let lines = 0;
    for (let i = 0; i < words.length; i += 1) {
      const candidate = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(candidate).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        lines += 1;
        line = words[i];
        if (lines >= maxLines - 1) {
          line = `${line}…`;
          break;
        }
      } else line = candidate;
    }
    if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
  }

  function roundedRect(x, y, w, h, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function burst(x, y, color, amount, speed) {
    const count = Math.min(amount || 8, MAX_PARTICLES - particles.length);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const velocity = (30 + Math.random() * 70) * (speed || 1);
      particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity - 14, life: .45 + Math.random() * .45, max: 1, size: 2 + Math.random() * 3, color });
    }
  }

  function burstAtCell(index, color, amount) {
    const point = cellCenter(index);
    burst(point.x, point.y, color, amount, 1.1);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 70 * dt;
      if (particle.life <= 0) particles.splice(i, 1);
    }
    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      const floater = floaters[i];
      floater.life -= dt;
      floater.y -= 19 * dt;
      if (floater.life <= 0) floaters.splice(i, 1);
    }
    for (let i = flashes.length - 1; i >= 0; i -= 1) {
      flashes[i].life -= dt;
      if (flashes[i].life <= 0) flashes.splice(i, 1);
    }
  }

  function drawParticles() {
    particles.forEach(particle => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, particle.life / particle.max);
      ctx.fillStyle = particle.color;
      ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, TAU); ctx.fill();
      ctx.restore();
    });
    floaters.forEach(floater => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, floater.life / floater.max);
      ctx.fillStyle = floater.color;
      ctx.font = '800 12px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(floater.text, floater.x, floater.y);
      ctx.restore();
    });
  }

  function update(dt) {
    if (orientationPaused || document.hidden) return;
    processActions();
    if (state.modal !== null || state.finale) return;
    state.sessionTime += dt;
    toastLife = Math.max(0, toastLife - dt);
    shake = Math.max(0, shake - dt * 16);
    updateParticles(dt);
  }

  let shake = 0;
  function draw() {
    ctx.save();
    const offsetX = shake ? (Math.random() - .5) * shake : 0;
    const offsetY = shake ? (Math.random() - .5) * shake : 0;
    ctx.translate(offsetX, offsetY);
    drawBackground();
    drawHeader();
    drawBoard();
    drawGenerators();
    drawParticles();
    drawToast();
    ctx.restore();
    flashes.forEach(flash => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, flash.life / flash.max) * .12;
      ctx.fillStyle = flash.color;
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.restore();
    });
    drawModal();
  }

  function frame(time) {
    if (!lastFrame) lastFrame = time;
    const dt = Math.min(.05, Math.max(0, (time - lastFrame) / 1000));
    lastFrame = time;
    update(dt);
    draw();
    window.requestAnimationFrame(frame);
  }

  startButton.addEventListener('pointerdown', event => {
    event.preventDefault();
    unlockAudio();
    audioOverlay.hidden = true;
    resetInput();
  }, { passive: false });
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointermove', pointerMove, { passive: false });
  canvas.addEventListener('pointerup', event => pointerUp(event, false), { passive: false });
  canvas.addEventListener('pointercancel', event => pointerUp(event, true), { passive: false });
  window.addEventListener('pointerup', event => { if (activePointers.has(event.pointerId)) pointerUp(event, false); }, { passive: false });
  window.addEventListener('pointercancel', event => { if (activePointers.has(event.pointerId)) pointerUp(event, true); }, { passive: false });
  window.addEventListener('blur', clearAllInput);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', () => {
    resetInput();
    if (document.hidden) cancelPendingTimers();
    lastFrame = performance.now();
  });
  window.addEventListener('keydown', event => {
    const keyMap = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (orientationPaused || document.hidden) { resetInput(); return; }
    if (keyMap[event.key]) {
      event.preventDefault();
      if (!event.repeat) heldKeys.add(event.key);
      queueAction(keyMap[event.key]);
    } else if (event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) queueAction('space');
    }
  }, { passive: false });
  window.addEventListener('keyup', event => { heldKeys.delete(event.key); });

  loadState();
  resize();
  window.requestAnimationFrame(frame);
})();
