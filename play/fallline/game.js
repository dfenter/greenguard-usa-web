(() => {
  'use strict';

  const COLS = 10;
  const ROWS = 20;
  const STEP = 1 / 60;
  const LOCK_DELAY = .46;
  const MAX_LOCK_RESETS = 12;
  const TAU = Math.PI * 2;
  const COLORS = {
    I: 0x63f2da,
    J: 0x7898ff,
    L: 0xffb45f,
    O: 0xffe16b,
    S: 0x92ed78,
    T: 0xc99aff,
    Z: 0xff7890
  };
  const COLOR_HEX = {
    I: '#63f2da',
    J: '#7898ff',
    L: '#ffb45f',
    O: '#ffe16b',
    S: '#92ed78',
    T: '#c99aff',
    Z: '#ff7890'
  };
  const PIECE_NAMES = { I: 'ION BAR', J: 'JOLT HOOK', L: 'LANTERN', O: 'ORBIT', S: 'SWITCHBACK', T: 'TRIAD', Z: 'ZIGZAG' };
  const PIECES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
  const SHAPES = {
    I: [
      [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
      [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
      [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }],
      [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }]
    ],
    J: [
      [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
      [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
      [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }]
    ],
    L: [
      [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
      [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }],
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }]
    ],
    O: [
      [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }]
    ],
    S: [
      [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
      [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
      [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
      [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }]
    ],
    T: [
      [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
      [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
      [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }]
    ],
    Z: [
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
      [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
      [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }]
    ]
  };
  const MODES = {
    fallline: { label: 'FALLLINE', sub: 'CLASSIC · 4:00', gravity: 1, timeLimit: 240, accent: 0xd9ff63 },
    rush: { label: 'RUSH', sub: '90 SECONDS · FAST STACK', gravity: 1.14, timeLimit: 90, accent: 0xff846e },
    zen: { label: 'ZEN', sub: 'PRACTICE · NO CLOCK', gravity: .72, timeLimit: 0, accent: 0x63f2da }
  };

  const dom = {};
  const get = (id) => document.getElementById(id);
  function cacheDom() {
    if (dom.game) return;
    [
      'game', 'modeReadout', 'zoneReadout', 'scoreReadout', 'linesReadout', 'levelReadout',
      'phaseReadout', 'matchTimer', 'gravityReadout', 'nextName', 'holdName', 'comboReadout',
      'modeButton', 'transientToast', 'toastIcon', 'toastText', 'coachStrip', 'touchLeft',
      'touchRight', 'touchRotate', 'touchDrop', 'touchHold', 'modePanel', 'modeOptions',
      'closeMode', 'tutorialOverlay', 'beginRun', 'boundaryBanner', 'boundaryKicker',
      'boundaryTitle', 'boundarySubtitle', 'resultOverlay', 'resultKicker', 'resultTitle',
      'medalBadge', 'resultScore', 'resultLines', 'resultLevel', 'resultCopy', 'requeue',
      'resultModes', 'careerReadout'
    ].forEach((id) => { dom[id] = get(id); });
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function safeMode(value) {
    if (MODES[value]) return value;
    if (value === 'duo') return 'rush';
    if (value === 'sharpshoot') return 'rush';
    return 'fallline';
  }
  function makeDefaultCareer() { return { version: 2, bestScore: 0, bestLines: 0, bestLevel: 1, runs: 0, tutorialSeen: false }; }
  function validateCareer(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 2) return false;
    const keys = ['bestScore', 'bestLines', 'bestLevel', 'runs'];
    if (keys.some((key) => !Number.isInteger(value[key]) || value[key] < 0 || value[key] > 999999999)) return false;
    return value.bestLevel >= 1 && value.bestLevel <= 99 && typeof value.tutorialSeen === 'boolean';
  }
  function setVisible(element, visible) {
    if (!element) return;
    element.classList.toggle('visible', visible);
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }
  function formatTime(seconds) {
    if (!seconds) return '∞';
    const safe = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }
  function formatScore(value) { return Math.max(0, Math.floor(value)).toLocaleString('en-US'); }
  function copyBoard(board) { return board.map((row) => row.slice()); }

  class RNG {
    constructor(seed) { this.seed = seed >>> 0; }
    next() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
    shuffle(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    }
  }

  let sceneRef = null;
  let pendingMode = 'fallline';
  const kit = GGKit.create({
    slug: 'fallline',
    orientation: 'landscape',
    validateSave: validateCareer,
    onPause() {
      if (sceneRef) {
        sceneRef.simPaused = true;
        sceneRef.clearInputState();
      }
    },
    onResume() {
      if (sceneRef) sceneRef.simPaused = window.innerWidth < window.innerHeight || kit.paused;
    },
    onRestart() { if (sceneRef) sceneRef.resetRun(); }
  });
  kit.audio.register({
    theme: 'assets/audio/storm.mp3',
    rotate: 'assets/audio/switch.mp3',
    drop: 'assets/audio/impact.mp3',
    lock: 'assets/audio/reload.mp3',
    clear: 'assets/audio/victory.mp3',
    chain: 'assets/audio/pickup.mp3',
    gameover: 'assets/audio/hurt.mp3',
    menu: 'assets/audio/gunfire.mp3'
  });

  const probeState = {
    mode: 'fallline', phase: 1, level: 1, score: 0, lines: 0, combo: 0,
    next: 'I', hold: null, active: 'T', state: 'active', board: []
  };
  window.__fl = {
    state: probeState,
    forceMode(value) {
      pendingMode = safeMode(value);
      if (sceneRef) sceneRef.setMode(pendingMode);
      return pendingMode;
    },
    forcePhase(value) {
      if (!sceneRef) return false;
      const phase = clamp(Number(value) || 1, 1, 15);
      sceneRef.level = phase;
      sceneRef.phase = Math.min(5, Math.ceil(phase / 3));
      sceneRef.updateHud();
      return sceneRef.level;
    }
  };

  class FalllineScene extends Phaser.Scene {
    constructor() {
      super('FalllineScene');
      this.mode = pendingMode;
      this.state = 'active';
      this.simPaused = false;
      this.tutorialOpen = false;
      this.modeOpen = false;
      this.accumulator = 0;
      this.simTime = 0;
      this.gravityClock = 0;
      this.seed = 0xF4111E;
      this.rng = new RNG(this.seed);
      this.career = makeDefaultCareer();
      this.board = [];
      this.bag = [];
      this.active = null;
      this.nextKind = 'I';
      this.holdKind = null;
      this.canHold = true;
      this.level = 1;
      this.phase = 1;
      this.score = 0;
      this.lines = 0;
      this.combo = 0;
      this.clearTimer = 0;
      this.clearRows = [];
      this.placementFlash = 0;
      this.transient = { time: 0 };
      this.boundaryTime = 0;
      this.keyLatch = Object.create(null);
      this.controlPointers = Object.create(null);
      this.gestureState = new Map();
      this.horizontalRepeat = 0;
      this.lastLeft = false;
      this.lastRight = false;
      this.softDropHeld = false;
      this.juiceOffset = { dx: 0, dy: 0 };
      this.boardX = 0;
      this.boardY = 0;
      this.cell = 28;
      this.boardWidth = COLS * this.cell;
      this.boardHeight = ROWS * this.cell;
      this.backgroundG = null;
      this.boardG = null;
      this.previewG = null;
      this.fxG = null;
      this.sparkPool = [];
      this.shardPool = [];
    }

    create() {
      sceneRef = this;
      cacheDom();
      this.career = kit.save.get(makeDefaultCareer());
      this.backgroundG = this.add.graphics().setDepth(0);
      this.boardG = this.add.graphics().setDepth(3);
      this.previewG = this.add.graphics().setDepth(4);
      this.fxG = this.add.graphics().setDepth(8);
      this.createFxPools();
      this.bindUi();
      this.refreshModePanel();
      this.scale.on('resize', () => this.resizeScene());
      this.resizeScene();
      this.resetRun(true);
      kit.loader.hide();
      kit.registerPWA();
      if (!this.career.tutorialSeen) this.openTutorial();
      this.ready = true;
    }

    createFxPools() {
      for (let i = 0; i < 120; i++) {
        this.sparkPool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, size: 2, color: 0xffffff });
      }
      for (let i = 0; i < 80; i++) {
        this.shardPool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, size: 3, color: 0xffffff });
      }
    }

    resizeScene() {
      const landscape = window.innerWidth >= window.innerHeight;
      this.simPaused = !landscape || kit.paused;
      const width = Math.max(320, this.scale.width || window.innerWidth);
      const height = Math.max(220, this.scale.height || window.innerHeight);
      this.cell = Math.max(14, Math.min(34, (height - 112) / ROWS, (width - 280) / COLS));
      this.boardWidth = COLS * this.cell;
      this.boardHeight = ROWS * this.cell;
      this.boardX = Math.round((width - this.boardWidth) / 2);
      this.boardY = Math.round((height - this.boardHeight) / 2 + 18);
      this.drawBackground(width, height);
      this.drawBoard();
    }

    drawBackground(width, height) {
      this.backgroundG.clear();
      this.backgroundG.fillStyle(0x071016, 1);
      this.backgroundG.fillRect(0, 0, width, height);
      this.backgroundG.fillStyle(0x10232b, .56);
      this.backgroundG.fillRect(0, 0, width, height * .52);
      this.backgroundG.fillStyle(0x160f2b, .32);
      this.backgroundG.fillRect(0, height * .52, width, height * .48);
      this.backgroundG.lineStyle(1, 0x63f2da, .06);
      for (let x = 0; x < width; x += 44) {
        this.backgroundG.beginPath();
        this.backgroundG.moveTo(x, 0);
        this.backgroundG.lineTo(x + height * .23, height);
        this.backgroundG.strokePath();
      }
      this.backgroundG.lineStyle(1, 0xd9ff63, .04);
      for (let y = 0; y < height; y += 34) this.backgroundG.lineBetween(0, y, width, y);
      this.backgroundG.fillStyle(0xd9ff63, .22);
      for (let i = 0; i < 32; i++) {
        const x = (i * 157) % Math.max(1, width);
        const y = (i * 71) % Math.max(1, height);
        this.backgroundG.fillCircle(x, y, i % 3 === 0 ? 2 : 1);
      }
    }

    bindUi() {
      dom.modeButton.addEventListener('click', () => this.openModePanel());
      dom.closeMode.addEventListener('click', () => this.closeModePanel());
      dom.resultModes.addEventListener('click', () => this.openModePanel());
      dom.requeue.addEventListener('click', () => {
        kit.resume('result');
        this.resetRun();
      });
      dom.beginRun.addEventListener('click', () => this.closeTutorial());
      dom.tutorialOverlay.addEventListener('click', (event) => {
        if (event.target === dom.tutorialOverlay) this.closeTutorial();
      });
    }

    refreshModePanel() {
      dom.modeOptions.textContent = '';
      Object.keys(MODES).forEach((key) => {
        const mode = MODES[key];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `mode-option control ${key === this.mode ? 'selected' : ''}`;
        button.innerHTML = `<strong>${mode.label}</strong><span>${mode.sub}</span>`;
        button.addEventListener('click', () => {
          kit.audio.sfx('menu', { volume: .45 });
          this.setMode(key);
        });
        dom.modeOptions.appendChild(button);
      });
    }

    openTutorial() {
      this.tutorialOpen = true;
      setVisible(dom.tutorialOverlay, true);
      kit.pause('tutorial');
    }

    closeTutorial() {
      if (!this.tutorialOpen) return;
      this.tutorialOpen = false;
      this.career.tutorialSeen = true;
      kit.save.set(this.career);
      setVisible(dom.tutorialOverlay, false);
      kit.resume('tutorial');
      this.showToast('DROP READY', '◆', 'good');
    }

    openModePanel() {
      this.modeOpen = true;
      setVisible(dom.modePanel, true);
      setVisible(dom.resultOverlay, false);
      kit.pause('mode');
      this.refreshModePanel();
    }

    closeModePanel() {
      this.modeOpen = false;
      setVisible(dom.modePanel, false);
      kit.resume('mode');
      if (this.state === 'result') setVisible(dom.resultOverlay, true);
    }

    setMode(value, initial) {
      const next = safeMode(value);
      this.mode = next;
      pendingMode = next;
      this.refreshModePanel();
      if (!initial) {
        this.modeOpen = false;
        setVisible(dom.modePanel, false);
        setVisible(dom.resultOverlay, false);
        kit.resume('mode');
        kit.resume('result');
        this.resetRun();
      }
      return next;
    }

    resetRun(initial) {
      this.state = 'active';
      this.simTime = 0;
      this.accumulator = 0;
      this.gravityClock = 0;
      this.score = 0;
      this.lines = 0;
      this.level = 1;
      this.phase = 1;
      this.combo = 0;
      this.clearTimer = 0;
      this.clearRows = [];
      this.placementFlash = 0;
      this.rng = new RNG((this.seed + Date.now()) >>> 0);
      this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      this.bag = [];
      this.nextKind = this.drawKind();
      this.holdKind = null;
      this.canHold = true;
      this.active = null;
      this.spawnPiece();
      this.transient.time = 0;
      this.boundaryTime = initial ? .9 : .65;
      this.gestureState.clear();
      this.clearInputState();
      setVisible(dom.resultOverlay, false);
      setVisible(dom.modePanel, false);
      kit.audio.stopMusic(180);
      kit.audio.music('theme', 500);
      this.showBoundary();
      this.updateHud();
      this.drawBoard();
    }

    clearInputState() {
      this.keyLatch = Object.create(null);
      this.controlPointers = Object.create(null);
      this.gestureState.clear();
      this.lastLeft = false;
      this.lastRight = false;
      this.horizontalRepeat = 0;
      this.softDropHeld = false;
    }

    drawKind() {
      if (!this.bag.length) this.bag = this.rng.shuffle(PIECES.slice());
      return this.bag.pop() || 'I';
    }

    makePiece(kind) {
      const piece = { kind, rotation: 0, x: 3, y: -1, lockTimer: 0, lockResets: 0, age: 0 };
      if (!this.canPlace(piece)) piece.y = 0;
      return piece;
    }

    // rotation is optional: lockPiece/drawBoard/spawnPlacementFx call this with the
    // piece alone. Without the default, (undefined + 4) % 4 is NaN and the lookup
    // returns undefined, which threw on the first frame.
    cellsFor(piece, rotation) {
      const r = rotation == null ? piece.rotation : rotation;
      return SHAPES[piece.kind][(r + 4) % 4];
    }

    canPlace(piece, dx = 0, dy = 0, rotation = piece.rotation) {
      return this.cellsFor(piece, rotation).every((cell) => {
        const x = piece.x + cell.x + dx;
        const y = piece.y + cell.y + dy;
        if (x < 0 || x >= COLS || y >= ROWS) return false;
        if (y < 0) return true;
        return !this.board[y][x];
      });
    }

    spawnPiece(kind) {
      const next = kind || this.nextKind;
      this.nextKind = this.drawKind();
      this.active = this.makePiece(next);
      if (!this.canPlace(this.active)) {
        this.finishRun(false, 'STACK LIMIT');
        return;
      }
      this.canHold = true;
      kit.audio.sfx('lock', { volume: .12, rate: 1.12 });
    }

    gravityInterval() {
      const mode = MODES[this.mode] || MODES.fallline;
      return Math.max(.055, .82 * Math.pow(.86, this.level - 1) / mode.gravity);
    }

    moveHorizontal(direction) {
      if (this.state !== 'active' || this.clearTimer > 0 || !this.active) return false;
      if (!this.canPlace(this.active, direction, 0)) return false;
      this.active.x += direction;
      this.resetLockIfGrounded();
      return true;
    }

    rotatePiece(direction) {
      if (this.state !== 'active' || this.clearTimer > 0 || !this.active) return false;
      const rotation = (this.active.rotation + direction + 4) % 4;
      const kicks = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [0, 1]];
      for (const [dx, dy] of kicks) {
        if (!this.canPlace(this.active, dx, dy, rotation)) continue;
        this.active.rotation = rotation;
        this.active.x += dx;
        this.active.y += dy;
        this.resetLockIfGrounded();
        this.active.age = Math.max(this.active.age, .12);
        kit.audio.sfx('rotate', { volume: .42, rate: direction > 0 ? 1 : .9 });
        this.showToast('ROTATE', '↻', 'good', .42);
        return true;
      }
      kit.audio.sfx('menu', { volume: .18, rate: .75 });
      return false;
    }

    holdPiece() {
      if (this.state !== 'active' || this.clearTimer > 0 || !this.active || !this.canHold) return;
      const old = this.active.kind;
      const hadHold = !!this.holdKind;
      const incoming = hadHold ? this.holdKind : this.nextKind;
      this.holdKind = old;
      this.canHold = false;
      if (!hadHold) this.nextKind = this.drawKind();
      this.active = this.makePiece(incoming);
      if (!this.canPlace(this.active)) {
        this.finishRun(false, 'STACK LIMIT');
        return;
      }
      kit.audio.sfx('chain', { volume: .42, rate: .82 });
      this.showToast('HOLD SET', '◇', 'good', .65);
    }

    hardDrop() {
      if (this.state !== 'active' || this.clearTimer > 0 || !this.active) return;
      let distance = 0;
      while (this.canPlace(this.active, 0, 1)) { this.active.y++; distance++; }
      this.score += distance * 2;
      this.active.lockTimer = LOCK_DELAY;
      this.lockPiece('hard');
    }

    resetLockIfGrounded() {
      if (this.active && !this.canPlace(this.active, 0, 1) && this.active.lockResets < MAX_LOCK_RESETS) {
        this.active.lockTimer = 0;
        this.active.lockResets++;
      }
    }

    lockPiece(reason) {
      if (!this.active) return;
      const cells = this.cellsFor(this.active);
      let aboveTop = false;
      cells.forEach((cell) => {
        const x = this.active.x + cell.x;
        const y = this.active.y + cell.y;
        if (y < 0) aboveTop = true;
        else if (x >= 0 && x < COLS && y < ROWS) this.board[y][x] = this.active.kind;
      });
      if (aboveTop) {
        this.finishRun(false, 'STACK LIMIT');
        return;
      }
      this.placementFlash = .18;
      this.spawnPlacementFx(this.active, reason === 'hard');
      const full = [];
      for (let row = 0; row < ROWS; row++) if (this.board[row].every(Boolean)) full.push(row);
      if (full.length) {
        this.clearRows = full;
        this.clearTimer = .25;
        this.combo++;
        const base = [0, 100, 300, 500, 800][full.length] || 800;
        const multiplier = 1 + Math.max(0, this.combo - 1) * .5;
        const gained = Math.round(base * this.level * multiplier);
        this.score += gained;
        this.lines += full.length;
        kit.audio.sfx(this.combo > 1 ? 'chain' : 'clear', { volume: .72, rate: 1 + Math.min(.4, this.combo * .03) });
        this.spawnClearEffects(full, this.combo);
        this.showToast(`${full.length === 4 ? 'QUAD' : 'LINE'}  +${formatScore(gained)}  CHAIN x${this.combo}`, '✦', 'good', 1.1);
      } else {
        this.combo = 0;
        kit.audio.sfx('lock', { volume: .3, rate: reason === 'hard' ? 1.18 : .96 });
      }
      this.active = null;
    }

    finishClear() {
      if (!this.clearRows.length) return;
      const removed = new Set(this.clearRows);
      const remaining = this.board.filter((_, row) => !removed.has(row));
      while (remaining.length < ROWS) remaining.unshift(Array(COLS).fill(null));
      this.board = remaining;
      this.clearRows = [];
      this.clearTimer = 0;
      const previousLevel = this.level;
      this.level = clamp(1 + Math.floor(this.lines / 8), 1, 15);
      this.phase = clamp(1 + Math.floor(this.lines / 12), 1, 5);
      if (this.level > previousLevel) {
        kit.juice.shake(3, 120);
        this.showToast(`WAVE ${this.phase}  LEVEL ${this.level}`, '▲', 'storm', .9);
      }
      this.spawnPiece();
    }

    stepSimulation(dt) {
      if (this.state !== 'active') return;
      this.simTime += dt;
      const mode = MODES[this.mode] || MODES.fallline;
      if (mode.timeLimit && this.simTime >= mode.timeLimit) {
        this.finishRun(true, 'TIME COMPLETE');
        return;
      }
      if (this.clearTimer > 0) {
        this.clearTimer -= dt;
        if (this.clearTimer <= 0) this.finishClear();
        this.tickEffects(dt);
        return;
      }
      if (!this.active) {
        this.spawnPiece();
        return;
      }
      this.active.age += dt;
      this.gravityClock += dt;
      const interval = this.softDropHeld ? .035 : this.gravityInterval();
      while (this.gravityClock >= interval) {
        this.gravityClock -= interval;
        if (this.canPlace(this.active, 0, 1)) {
          this.active.y++;
          if (this.softDropHeld) this.score++;
          this.active.lockTimer = 0;
        } else {
          this.active.lockTimer += interval;
          if (this.active.lockTimer >= LOCK_DELAY) {
            this.lockPiece('gravity');
            break;
          }
        }
      }
      this.tickEffects(dt);
      this.placementFlash = Math.max(0, this.placementFlash - dt);
      if (this.boundaryTime > 0) this.boundaryTime = Math.max(0, this.boundaryTime - dt);
      this.transient.time = Math.max(0, this.transient.time - dt);
      if (this.transient.time === 0) setVisible(dom.transientToast, false);
      if (this.boundaryTime === 0) setVisible(dom.boundaryBanner, false);
    }

    finishRun(won, cause) {
      if (this.state !== 'active') return;
      this.state = 'result';
      this.career.runs++;
      this.career.bestScore = Math.max(this.career.bestScore, Math.floor(this.score));
      this.career.bestLines = Math.max(this.career.bestLines, this.lines);
      this.career.bestLevel = Math.max(this.career.bestLevel, this.level);
      kit.save.set(this.career);
      kit.audio.stopMusic(260);
      kit.audio.sfx(won ? 'clear' : 'gameover', { volume: .72 });
      kit.juice.shake(won ? 5 : 3, 220);
      const grade = this.score >= (this.mode === 'rush' ? 2600 : 7200) ? 'GOLD' : this.score >= 1800 ? 'SILVER' : 'BRONZE';
      dom.resultKicker.textContent = won ? 'RUN COMPLETE' : 'STACK LIMIT';
      dom.resultTitle.textContent = won ? 'FALLLINE HELD' : 'GRID LOST';
      dom.medalBadge.textContent = grade;
      dom.medalBadge.className = `medal-badge ${grade.toLowerCase()}`;
      dom.resultScore.textContent = formatScore(this.score);
      dom.resultLines.textContent = String(this.lines);
      dom.resultLevel.textContent = String(this.level);
      dom.resultCopy.textContent = won ? `${cause}. The signal stayed clean.` : `${cause}. Clear rows, then keep the stack low.`;
      dom.careerReadout.textContent = `BEST ${formatScore(this.career.bestScore)} · ${this.career.bestLines} LINES · ${this.career.runs} RUNS`;
      setVisible(dom.resultOverlay, true);
      setVisible(dom.transientToast, false);
      kit.pause('result');
      this.syncProbe();
    }

    showBoundary() {
      const mode = MODES[this.mode] || MODES.fallline;
      dom.boundaryKicker.textContent = this.mode === 'zen' ? 'PRACTICE READY' : 'DROP READY';
      dom.boundaryTitle.textContent = mode.label;
      dom.boundarySubtitle.textContent = this.mode === 'rush' ? 'FAST STACK · CHAIN FOR SCORE' : 'STACK · CLEAR · CHAIN';
      setVisible(dom.boundaryBanner, true);
    }

    showToast(text, icon, tone, duration) {
      dom.toastText.textContent = text;
      dom.toastIcon.textContent = icon || '◆';
      dom.transientToast.className = `transient-toast visible ${tone || ''}`;
      dom.transientToast.setAttribute('aria-hidden', 'false');
      this.transient.time = duration == null ? 1.2 : duration;
    }

    isDown(code) { return kit.input.keyDown(code); }
    action(name, down) {
      const fired = !!down && !this.keyLatch[name];
      this.keyLatch[name] = !!down;
      return fired;
    }

    pointerId(pointer) {
      for (const [id, value] of kit.input.pointers.entries()) if (value === pointer) return id;
      return null;
    }

    controlPointer(id) {
      const element = dom[id];
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return kit.input.firstIn({ x: rect.left, y: rect.top, w: rect.width, h: rect.height });
    }

    controlHeld(id) { return !!this.controlPointer(id); }

    controlPressed(id) {
      const pointer = this.controlPointer(id);
      const pointerId = pointer ? this.pointerId(pointer) : null;
      if (pointerId == null) {
        this.controlPointers[id] = null;
        return false;
      }
      if (this.controlPointers[id] === pointerId) return false;
      this.controlPointers[id] = pointerId;
      return true;
    }

    boardPoint(pointer) {
      const canvas = this.game.canvas;
      const rect = canvas.getBoundingClientRect();
      const sx = this.scale.width / Math.max(1, rect.width);
      const sy = this.scale.height / Math.max(1, rect.height);
      return { x: (pointer.x - rect.left) * sx, y: (pointer.y - rect.top) * sy };
    }

    processBoardGestures() {
      const live = new Set();
      for (const [id, pointer] of kit.input.pointers.entries()) {
        const point = this.boardPoint(pointer);
        if (point.x < this.boardX || point.x > this.boardX + this.boardWidth || point.y < this.boardY || point.y > this.boardY + this.boardHeight) continue;
        live.add(id);
        const dx = pointer.x - pointer.startX;
        const dy = pointer.y - pointer.startY;
        const state = this.gestureState.get(id) || { moveX: 0, rotated: false, dropped: false };
        if (Math.abs(dx) >= 26) {
          const target = Math.trunc(dx / 26);
          const delta = target - state.moveX;
          if (delta) {
            const direction = delta > 0 ? 1 : -1;
            for (let i = 0; i < Math.abs(delta); i++) this.moveHorizontal(direction);
            state.moveX = target;
          }
        }
        if (!state.rotated && dy < -28 && dy > -70 && Math.abs(dx) < 42) {
          this.rotatePiece(1);
          state.rotated = true;
        }
        if (!state.dropped && dy <= -70) {
          this.hardDrop();
          state.dropped = true;
        }
        if (!state.rotated && Math.abs(dx) < 14 && Math.abs(dy) < 14 && performance.now() - pointer.downAt > 160) {
          this.rotatePiece(1);
          state.rotated = true;
        }
        this.gestureState.set(id, state);
      }
      for (const id of this.gestureState.keys()) if (!live.has(id) || !kit.input.pointers.has(id)) this.gestureState.delete(id);
    }

    pollInput(deltaSeconds) {
      if (this.tutorialOpen || this.modeOpen || this.state !== 'active' || kit.paused) return;
      this.processBoardGestures();
      const left = this.isDown('ArrowLeft') || this.isDown('KeyA') || this.controlHeld('touchLeft');
      const right = this.isDown('ArrowRight') || this.isDown('KeyD') || this.controlHeld('touchRight');
      if (left || right) {
        this.horizontalRepeat -= deltaSeconds;
        const direction = left && !right ? -1 : 1;
        if ((!this.lastLeft && left) || (!this.lastRight && right) || this.horizontalRepeat <= 0) {
          this.moveHorizontal(direction);
          this.horizontalRepeat = this.lastLeft || this.lastRight ? .11 : .02;
        }
      } else {
        this.horizontalRepeat = 0;
      }
      this.lastLeft = left;
      this.lastRight = right;
      const rotate = this.isDown('ArrowUp') || this.isDown('KeyX') || this.isDown('KeyZ') || this.controlPressed('touchRotate');
      if (this.action('rotate', rotate)) this.rotatePiece(1);
      const drop = this.isDown('Space') || this.controlPressed('touchDrop');
      if (this.action('drop', drop)) this.hardDrop();
      const hold = this.isDown('KeyC') || this.isDown('ShiftLeft') || this.isDown('ShiftRight') || this.controlPressed('touchHold');
      if (this.action('hold', hold)) this.holdPiece();
      this.softDropHeld = this.isDown('ArrowDown') || this.isDown('KeyS');
      if (this.action('modes', this.isDown('Escape'))) this.openModePanel();
    }

    update(time, delta) {
      const dt = clamp(delta / 1000, 0, .2);
      const juice = kit.juice.frame();
      this.juiceOffset.dx = juice.dx;
      this.juiceOffset.dy = juice.dy;
      this.pollInput(dt);
      if (!this.simPaused && !kit.paused && !this.tutorialOpen && !this.modeOpen && !juice.frozen && this.state === 'active') {
        this.accumulator = Math.min(.28, this.accumulator + dt);
        let steps = 0;
        while (this.accumulator >= STEP && steps < 8) {
          this.stepSimulation(STEP);
          this.accumulator -= STEP;
          steps++;
        }
        if (steps === 8 && this.accumulator > STEP * 2) this.accumulator = STEP * 2;
      }
      this.renderViews();
      this.updateHud();
    }

    drawCell(graphics, col, row, kind, alpha, scale, ghost) {
      const size = this.cell * (scale == null ? 1 : scale);
      const offset = (this.cell - size) / 2;
      const x = this.boardX + col * this.cell + offset;
      const y = this.boardY + row * this.cell + offset;
      const color = COLORS[kind] || 0xffffff;
      if (ghost) {
        graphics.lineStyle(Math.max(1, this.cell * .07), color, alpha);
        graphics.strokeRect(x + 3, y + 3, size - 6, size - 6);
        return;
      }
      graphics.fillStyle(0x02070c, alpha * .7);
      graphics.fillRect(x + 2, y + 4, size - 2, size - 2);
      graphics.fillStyle(color, alpha);
      graphics.fillRect(x + 2, y + 2, size - 4, size - 5);
      graphics.fillStyle(0xffffff, alpha * .28);
      graphics.fillRect(x + 4, y + 4, Math.max(1, size - 8), Math.max(1, size * .13));
      graphics.lineStyle(Math.max(1, this.cell * .035), 0x061018, alpha * .72);
      graphics.strokeRect(x + 2, y + 2, size - 4, size - 5);
    }

    drawBoard() {
      if (!this.boardG) return;
      this.boardG.clear();
      const pad = Math.max(8, this.cell * .55);
      this.boardG.fillStyle(0x03080e, .84);
      this.boardG.fillRect(this.boardX - pad, this.boardY - pad, this.boardWidth + pad * 2, this.boardHeight + pad * 2);
      this.boardG.lineStyle(Math.max(2, this.cell * .08), 0x63f2da, .64);
      this.boardG.strokeRect(this.boardX - 5, this.boardY - 5, this.boardWidth + 10, this.boardHeight + 10);
      this.boardG.fillStyle(0x0c1c26, .82);
      this.boardG.fillRect(this.boardX, this.boardY, this.boardWidth, this.boardHeight);
      this.boardG.lineStyle(1, 0x9bd7d0, .13);
      for (let col = 0; col <= COLS; col++) this.boardG.lineBetween(this.boardX + col * this.cell, this.boardY, this.boardX + col * this.cell, this.boardY + this.boardHeight);
      for (let row = 0; row <= ROWS; row++) this.boardG.lineBetween(this.boardX, this.boardY + row * this.cell, this.boardX + this.boardWidth, this.boardY + row * this.cell);
      const clearing = new Set(this.clearRows);
      this.board.forEach((line, row) => line.forEach((kind, col) => {
        if (!kind) return;
        const pulse = clearing.has(row) ? 1 + Math.sin((this.clearTimer * 22) + col) * .09 : 1;
        const alpha = clearing.has(row) ? clamp(.5 + this.clearTimer * 2.4, .5, 1) : 1;
        this.drawCell(this.boardG, col, row, kind, alpha, pulse, false);
      }));
      if (this.active) {
        let ghostY = this.active.y;
        while (this.canPlace(this.active, 0, ghostY - this.active.y + 1)) ghostY++;
        this.cellsFor(this.active).forEach((cell) => {
          if (ghostY + cell.y >= 0) this.drawCell(this.boardG, this.active.x + cell.x, ghostY + cell.y, this.active.kind, .34, .92, true);
        });
        const spawnLift = this.active.age < .16 ? (1 - this.active.age / .16) * this.cell * .22 : 0;
        const lockPulse = this.active.lockTimer > .1 ? 1 + Math.sin(this.active.lockTimer * 36) * .035 : 1;
        this.cellsFor(this.active).forEach((cell) => {
          const row = this.active.y + cell.y;
          if (row >= 0) this.drawCell(this.boardG, this.active.x + cell.x, row, this.active.kind, 1, lockPulse, false);
          if (spawnLift && row >= 0) {
            this.boardG.fillStyle(COLORS[this.active.kind], .22);
            this.boardG.fillRect(this.boardX + (this.active.x + cell.x) * this.cell + 3, this.boardY + row * this.cell - spawnLift + 3, this.cell - 6, this.cell - 7);
          }
        });
      }
      if (this.placementFlash > 0) {
        this.boardG.fillStyle(0xd9ff63, this.placementFlash * 1.8);
        this.boardG.fillRect(this.boardX, this.boardY + this.boardHeight - this.cell * 1.2, this.boardWidth, this.cell * .12);
      }
    }

    drawPreview(x, y, kind, label) {
      const mini = clamp(this.cell * .58, 8, 18);
      const boxW = mini * 5.2;
      const boxH = mini * 5.5;
      this.previewG.fillStyle(0x07141c, .92);
      this.previewG.fillRect(x, y, boxW, boxH);
      this.previewG.lineStyle(1, 0x9bd7d0, .34);
      this.previewG.strokeRect(x, y, boxW, boxH);
      const cells = SHAPES[kind] ? SHAPES[kind][0] : [];
      const minX = Math.min(...cells.map((cell) => cell.x));
      const maxX = Math.max(...cells.map((cell) => cell.x));
      const minY = Math.min(...cells.map((cell) => cell.y));
      const maxY = Math.max(...cells.map((cell) => cell.y));
      const pieceW = (maxX - minX + 1) * mini;
      const pieceH = (maxY - minY + 1) * mini;
      cells.forEach((cell) => {
        const cx = x + (boxW - pieceW) / 2 + (cell.x - minX) * mini;
        const cy = y + (boxH - pieceH) / 2 + (cell.y - minY) * mini;
        this.previewG.fillStyle(COLORS[kind], 1);
        this.previewG.fillRect(cx + 1, cy + 1, mini - 2, mini - 2);
        this.previewG.fillStyle(0xffffff, .26);
        this.previewG.fillRect(cx + 2, cy + 2, mini - 4, Math.max(1, mini * .13));
      });
      if (label) {
        this.previewG.fillStyle(0x63f2da, .76);
        this.previewG.fillRect(x, y - 5, Math.min(boxW, label.length * 5.5), 2);
      }
    }

    drawPreviews() {
      this.previewG.clear();
      const width = this.scale.width || window.innerWidth;
      const mini = clamp(this.cell * .58, 8, 18);
      const cardW = mini * 5.2;
      let x = this.boardX + this.boardWidth + 24;
      if (x + cardW > width - 12) x = this.boardX - cardW - 24;
      if (x < 12) x = width - cardW - 12;
      this.drawPreview(x, this.boardY + 64, this.nextKind, 'NEXT');
      if (this.holdKind) this.drawPreview(x, this.boardY + 190, this.holdKind, 'HOLD');
      else {
        this.previewG.fillStyle(0x07141c, .72);
        this.previewG.fillRect(x, this.boardY + 190, cardW, mini * 5.5);
        this.previewG.lineStyle(1, 0x9bd7d0, .2);
        this.previewG.strokeRect(x, this.boardY + 190, cardW, mini * 5.5);
      }
    }

    spawnParticle(pool, x, y, color, speed, life, size, angle) {
      const item = pool.find((particle) => !particle.active);
      if (!item) return;
      const direction = angle == null ? this.rng.next() * TAU : angle;
      item.active = true;
      item.x = x;
      item.y = y;
      item.vx = Math.cos(direction) * speed;
      item.vy = Math.sin(direction) * speed;
      item.life = life;
      item.max = life;
      item.size = size;
      item.color = color;
    }

    spawnPlacementFx(piece, hard) {
      this.cellsFor(piece).forEach((cell) => {
        const x = this.boardX + (piece.x + cell.x + .5) * this.cell;
        const y = this.boardY + (piece.y + cell.y + .5) * this.cell;
        for (let i = 0; i < (hard ? 5 : 3); i++) this.spawnParticle(this.sparkPool, x, y, COLORS[piece.kind], 28 + this.rng.next() * 48, .24 + this.rng.next() * .2, 2 + this.rng.next() * 2);
      });
    }

    spawnClearEffects(rows, combo) {
      rows.forEach((row, rowIndex) => {
        const y = this.boardY + (row + .5) * this.cell;
        for (let i = 0; i < 24; i++) {
          const x = this.boardX + this.rng.next() * this.boardWidth;
          this.spawnParticle(this.sparkPool, x, y, i % 2 ? 0xd9ff63 : 0x63f2da, 60 + this.rng.next() * 120, .35 + rowIndex * .03, 2 + this.rng.next() * 3, this.rng.next() < .5 ? 0 : Math.PI);
        }
        for (let i = 0; i < 14; i++) {
          const x = this.boardX + this.rng.next() * this.boardWidth;
          this.spawnParticle(this.shardPool, x, y, combo > 1 ? 0xffb45f : 0xc99aff, 80 + this.rng.next() * 150, .5 + this.rng.next() * .28, 3 + this.rng.next() * 4, this.rng.next() * TAU);
        }
      });
    }

    tickEffects(dt) {
      [this.sparkPool, this.shardPool].forEach((pool) => pool.forEach((particle) => {
        if (!particle.active) return;
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += (particle === this.shardPool ? 140 : 42) * dt;
        if (particle.life <= 0) particle.active = false;
      }));
    }

    renderFx() {
      this.fxG.clear();
      [this.sparkPool, this.shardPool].forEach((pool) => pool.forEach((particle) => {
        if (!particle.active) return;
        const alpha = clamp(particle.life / particle.max, 0, 1);
        this.fxG.fillStyle(particle.color, alpha);
        this.fxG.fillRect(particle.x, particle.y, particle.size, particle.size);
      }));
    }

    renderViews() {
      this.drawBoard();
      this.drawPreviews();
      this.renderFx();
    }

    updateHud() {
      if (!dom.modeReadout || !this.active) return;
      const mode = MODES[this.mode] || MODES.fallline;
      dom.modeReadout.textContent = mode.label;
      dom.zoneReadout.textContent = 'GRID 10×20';
      dom.scoreReadout.textContent = formatScore(this.score);
      dom.linesReadout.textContent = String(this.lines);
      dom.levelReadout.textContent = String(this.level);
      dom.phaseReadout.textContent = `WAVE ${this.phase}`;
      dom.matchTimer.textContent = formatTime(mode.timeLimit ? mode.timeLimit - this.simTime : 0);
      dom.gravityReadout.textContent = `GRAVITY ${this.gravityInterval().toFixed(2)}S`;
      dom.nextName.textContent = `${this.nextKind} · ${PIECE_NAMES[this.nextKind]}`;
      dom.holdName.textContent = this.holdKind ? `${this.holdKind} · ${PIECE_NAMES[this.holdKind]}` : 'EMPTY';
      dom.comboReadout.textContent = this.combo > 1 ? `CHAIN x${this.combo}` : this.combo === 1 ? 'CHAIN x1' : 'NO CHAIN';
      const step = this.simTime < 7 ? 'MOVE WITH A / D OR THE ARROWS' : this.simTime < 16 ? 'ROTATE WITH X OR THE ROTATE PAD' : this.simTime < 28 ? 'SPACE OR DROP PAD HARD DROPS' : this.simTime < 48 ? 'FULL ROWS CLEAR. KEEP THE STACK LOW.' : 'CHAIN CLEARS FOR A HIGHER MULTIPLIER.';
      dom.coachStrip.textContent = step;
      setVisible(dom.coachStrip, this.simTime < 60 && this.state === 'active');
      this.syncProbe();
    }

    syncProbe() {
      probeState.mode = this.mode;
      probeState.phase = this.phase;
      probeState.level = this.level;
      probeState.score = Math.floor(this.score);
      probeState.lines = this.lines;
      probeState.combo = this.combo;
      probeState.next = this.nextKind;
      probeState.hold = this.holdKind;
      probeState.active = this.active ? this.active.kind : null;
      probeState.state = this.state;
      probeState.board = copyBoard(this.board);
    }
  }

  cacheDom();
  kit.loader.show('FALLLINE');
  kit.loader.progress(.28);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    width: 1280,
    height: 720,
    backgroundColor: '#071016',
    render: { antialias: false, pixelArt: true, roundPixels: true },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [FalllineScene]
  });
  kit.loader.progress(1);
  window.__fl.game = game;
})();
