(function () {
  'use strict';

  const SYSTEM_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  // ------------------------------------------------------------- retina
  // See the scale block at the bottom of this file. RETINA is the multiplier
  // from CSS pixels to device pixels; the world stays in CSS pixels and the
  // main camera is zoomed by RETINA, so every layout constant in this file is
  // untouched and only the canvas gets denser.
  const hhCssW = function () { return Math.max(1, window.innerWidth || 390); };
  const hhCssH = function () { return Math.max(1, window.innerHeight || 844); };
  const RETINA = (window.GGKit && window.GGKit.hiDpi)
    ? window.GGKit.hiDpi.factor(hhCssW(), hhCssH())
    : 1;
  const COLS = 7;
  const ROWS = 8;
  const CELLS = COLS * ROWS;
  const SAVE_FALLBACK = {
    choices: [Array(6).fill(-1), Array(6).fill(-1)],
    homeItems: [Array(6).fill(-1), Array(6).fill(-1)],
    comfortInventory: [],
    comfortSeen: Array(6).fill(false),
    best: Array(12).fill(0),
    medals: Array(12).fill(0),
    completed: Array(12).fill(false),
    totalScore: 0,
    lastLevel: 0
  };
  const COLORS = {
    ink: 0x182238,
    board: 0x243453,
    cell: 0x314567,
    cellEdge: 0x5d7294,
    paper: 0xfff8ee,
    paperSoft: 0xf3e4cf,
    wood: 0xa86f4c,
    woodDark: 0x704333,
    brass: 0xf3bc50,
    coral: 0xec6b62,
    leaf: 0x4f9d69,
    water: 0x5db7d8,
    shadow: 0x121a2b,
    plum: 0x9a7cf3,
    accent: 0x4cc0b5
  };
  const TILE_DEFS = [
    { color: 0xf25c68, edge: 0xb83f51, symbol: 'seed' },
    { color: 0xf7c948, edge: 0xc58e2e, symbol: 'sun' },
    { color: 0x5bcb77, edge: 0x328d5b, symbol: 'leaf' },
    { color: 0x38a8de, edge: 0x217399, symbol: 'drop' },
    { color: 0x9a7cf3, edge: 0x654fb4, symbol: 'star' },
    { color: 0xf29a4a, edge: 0xb9672e, symbol: 'flame' }
  ];
  const STYLES = [
    { name: 'Cozy', color: 0xec6b62, light: 0xffc19d, sub: 'soft layers' },
    { name: 'Grand', color: 0xf3bc50, light: 0xffec9f, sub: 'brass glow' },
    { name: 'Quirky', color: 0x4cc0b5, light: 0xa3ead8, sub: 'bright oddities' }
  ];
  const COMFORT_ITEMS = [
    { name: 'Copper kettle', mark: 'K', color: 0xd58b4e, rooms: [0, 1], slots: [0, 5] },
    { name: 'Wool throw', mark: 'W', color: 0xd96d6d, rooms: [0, 1], slots: [1, 3] },
    { name: 'Pressed fern', mark: 'F', color: 0x63a875, rooms: [0, 1], slots: [2, 4] },
    { name: 'Blue crock', mark: 'C', color: 0x5da7c9, rooms: [0, 1], slots: [0, 2] },
    { name: 'Baker tin', mark: 'T', color: 0xe0ae4b, rooms: [0, 1], slots: [2, 4] },
    { name: 'Little bell', mark: 'B', color: 0x9b7ee8, rooms: [0, 1], slots: [3, 5] }
  ];
  const ROOMS = [
    {
      name: 'Cinderwick Living Room', short: 'Living room', kind: 'living',
      wall: 0xe9d1ba, wallDeep: 0xd4ad8f, floor: 0xa96d55, trim: 0xd65f50,
      marn: 0xe98468, pip: 0x58b7aa
    },
    {
      name: 'Mossbell Kitchen', short: 'Kitchen', kind: 'kitchen',
      wall: 0xd5e2d3, wallDeep: 0xa8c4ad, floor: 0x758c6a, trim: 0xe0ae4b,
      marn: 0x7c6bd1, pip: 0xe38e57
    }
  ];
  const FIXTURES = ['Hearth', 'Rug', 'Table', 'Lamp', 'Shelf', 'Window'];
  const LEVELS = [
    { seed: 7919, moves: 18, goal: 250, bronze: 0, silver: 5, gold: 8, bonus: 2, drops: 1 },
    { seed: 15431, moves: 19, goal: 340, bronze: 0, silver: 5, gold: 8, bonus: 1, drops: 0 },
    { seed: 23887, moves: 20, goal: 410, bronze: 0, silver: 5, gold: 8, bonus: 1, drops: 0 },
    { seed: 31271, moves: 19, goal: 490, bronze: 0, silver: 5, gold: 8, bonus: 2, drops: 0 },
    { seed: 40111, moves: 21, goal: 570, bronze: 0, silver: 6, gold: 9, bonus: 1, drops: 0 },
    { seed: 48799, moves: 22, goal: 650, bronze: 0, silver: 6, gold: 9, bonus: 1, drops: 0 },
    { seed: 57149, moves: 20, goal: 730, bronze: 0, silver: 5, gold: 8, bonus: 2, drops: 0 },
    { seed: 65063, moves: 22, goal: 810, bronze: 0, silver: 6, gold: 9, bonus: 1, drops: 0 },
    { seed: 73471, moves: 23, goal: 900, bronze: 0, silver: 6, gold: 9, bonus: 1, drops: 0 },
    { seed: 81929, moves: 22, goal: 1000, bronze: 0, silver: 6, gold: 9, bonus: 2, drops: 0 },
    { seed: 90121, moves: 24, goal: 1110, bronze: 0, silver: 7, gold: 10, bonus: 1, drops: 0 },
    { seed: 98317, moves: 26, goal: 1230, bronze: 0, silver: 7, gold: 10, bonus: 1, drops: 0 }
  ];
  const REACTIONS = [
    [
      ['Marn cups the new fire. "Now the room has a heartbeat."', 'Marn circles the hearth. "Warmth with a little ceremony."', 'Marn grins at the crooked firewood. "That is exactly the right amount of strange."'],
      ['Pip settles on the soft rug. "I am keeping this landing spot."', 'Pip salutes the rug. "A grand entrance for very small feet."', 'Pip tries the rug sideways. "It is a map. I knew it."']
    ],
    [
      ['Marn smooths the new counter. "Good work should have a place to land."', 'Marn taps the counter twice. "We can host a proper feast now."', 'Marn finds the secret drawer. "Aha. The room has an alibi."'],
      ['Pip tests the new table. "One chair for me, two for snacks."', 'Pip climbs the table and bows. "The kitchen has a stage."', 'Pip spins a spoon. "Dinner can be delightfully off schedule."']
    ]
  ];
  const AUDIO = {
    'music-home': 'assets/audio/music-home.mp3',
    'music-board': 'assets/audio/music-board.mp3',
    tap: 'assets/audio/tap.mp3',
    select: 'assets/audio/select.mp3',
    invalid: 'assets/audio/invalid.mp3',
    'swap-tick': 'assets/audio/swap-tick.mp3',
    'match-chime': 'assets/audio/match-chime.mp3',
    cascade: 'assets/audio/cascade.mp3',
    hint: 'assets/audio/hint.mp3',
    goal: 'assets/audio/goal.mp3',
    'reveal-sting': 'assets/audio/reveal-sting.mp3',
    'character-vocal': 'assets/audio/character-vocal.mp3',
    'room-complete': 'assets/audio/room-complete.mp3',
    'ui-confirm': 'assets/audio/ui-confirm.mp3',
    'comfort-place': 'assets/audio/comfort-place.mp3'
  };
  const AUDIO_NAMES = Object.keys(AUDIO);

  function cloneChoices(value) {
    const out = [Array(6).fill(-1), Array(6).fill(-1)];
    if (!value || !Array.isArray(value)) return out;
    for (let room = 0; room < 2; room += 1) {
      const source = Array.isArray(value[room]) ? value[room] : [];
      for (let slot = 0; slot < 6; slot += 1) {
        const choice = Number.isInteger(source[slot]) && source[slot] >= 0 && source[slot] < 3 ? source[slot] : -1;
        out[room][slot] = choice;
      }
    }
    return out;
  }

  function cloneHomeItems(value) {
    const out = [Array(6).fill(-1), Array(6).fill(-1)];
    if (!value || !Array.isArray(value)) return out;
    for (let room = 0; room < 2; room += 1) {
      const source = Array.isArray(value[room]) ? value[room] : [];
      for (let slot = 0; slot < 6; slot += 1) {
        const item = Number.isInteger(source[slot]) && source[slot] >= 0 && source[slot] < COMFORT_ITEMS.length ? source[slot] : -1;
        out[room][slot] = item;
      }
    }
    return out;
  }

  function cloneInventory(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(function (item) {
      return Number.isInteger(item) && item >= 0 && item < COMFORT_ITEMS.length;
    });
  }

  function sanitizeSave(value) {
    const save = value && typeof value === 'object' ? value : SAVE_FALLBACK;
    const homeItems = cloneHomeItems(save.homeItems);
    const comfortInventory = cloneInventory(save.comfortInventory);
    const comfortSeen = Array.from({ length: COMFORT_ITEMS.length }, function (_, i) { return save.comfortSeen && save.comfortSeen[i] === true || comfortInventory.indexOf(i) >= 0 || homeItems.some(function (room) { return room.indexOf(i) >= 0; }); });
    return {
      choices: cloneChoices(save.choices),
      homeItems: homeItems,
      comfortInventory: comfortInventory,
      comfortSeen: comfortSeen,
      best: Array.from({ length: 12 }, (_, i) => Number.isFinite(save.best && save.best[i]) ? Math.max(0, Math.floor(save.best[i])) : 0),
      medals: Array.from({ length: 12 }, (_, i) => Number.isFinite(save.medals && save.medals[i]) ? Math.max(0, Math.min(3, Math.floor(save.medals[i]))) : 0),
      completed: Array.from({ length: 12 }, (_, i) => save.completed && save.completed[i] === true),
      totalScore: Number.isFinite(save.totalScore) ? Math.max(0, Math.floor(save.totalScore)) : 0,
      lastLevel: Number.isFinite(save.lastLevel) ? Math.max(0, Math.min(11, Math.floor(save.lastLevel))) : 0
    };
  }

  function validSave(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.choices) || value.choices.length !== 2 || !Array.isArray(value.homeItems) || value.homeItems.length !== 2 || !Array.isArray(value.comfortInventory) || !Array.isArray(value.comfortSeen) || value.comfortSeen.length !== COMFORT_ITEMS.length || !Array.isArray(value.best) || value.best.length !== 12 || !Array.isArray(value.medals) || value.medals.length !== 12 || !Array.isArray(value.completed) || value.completed.length !== 12) return false;
    for (let room = 0; room < 2; room += 1) {
      if (!Array.isArray(value.choices[room]) || value.choices[room].length !== 6 || !Array.isArray(value.homeItems[room]) || value.homeItems[room].length !== 6) return false;
      for (let slot = 0; slot < 6; slot += 1) {
        const choice = value.choices[room][slot]; const item = value.homeItems[room][slot]; const level = room * 6 + slot;
        if (!Number.isInteger(choice) || choice < -1 || choice > 2 || !Number.isInteger(item) || item < -1 || item >= COMFORT_ITEMS.length) return false;
        if (choice < 0 && item >= 0) return false;
        if (choice >= 0 && value.completed[level] !== true) return false;
      }
    }
    for (let i = 0; i < 12; i += 1) {
      if (typeof value.completed[i] !== 'boolean' || !Number.isInteger(value.best[i]) || value.best[i] < 0 || !Number.isInteger(value.medals[i]) || value.medals[i] < 0 || value.medals[i] > 3) return false;
      if (value.completed[i] && i > 0 && value.completed[i - 1] !== true) return false;
    }
    for (let i = 0; i < value.comfortInventory.length; i += 1) {
      const item = value.comfortInventory[i];
      if (!Number.isInteger(item) || item < 0 || item >= COMFORT_ITEMS.length) return false;
    }
    if (value.comfortInventory.length > 12) return false;
    const heldItems = value.comfortInventory.concat(value.homeItems[0], value.homeItems[1]);
    for (let i = 0; i < COMFORT_ITEMS.length; i += 1) if (typeof value.comfortSeen[i] !== 'boolean' || (heldItems.indexOf(i) >= 0 && !value.comfortSeen[i])) return false;
    return Number.isInteger(value.totalScore) && value.totalScore >= 0 && Number.isInteger(value.lastLevel) && value.lastLevel >= 0 && value.lastLevel < 12;
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function hex(value) { return Phaser.Display.Color.HexStringToColor('#' + value.toString(16).padStart(6, '0')).color; }
  function cellIndex(col, row) { return row * COLS + col; }
  function cellCoord(index) { return { col: index % COLS, row: Math.floor(index / COLS) }; }
  function adjacent(a, b) { return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1; }
  function setTextIfChanged(textObject, value) {
    const next = String(value);
    if (textObject.text !== next) textObject.setText(next);
  }
  function setColorIfChanged(textObject, color) {
    if (textObject._hhColor !== color) { textObject.setColor(color); textObject._hhColor = color; }
  }

  const kit = window.GGKit.create({
    slug: 'hearth-halls',
    orientation: 'portrait',
    validateSave: validSave,
    onPause: function () {
      if (window.__hhScene) { window.__hhScene.cancelPointer(); window.__hhScene.keyLatch.clear(); window.__hhScene.pausedByKit = true; }
    },
    onResume: function () { if (window.__hhScene) window.__hhScene.pausedByKit = false; },
    onRestart: function () {
      if (window.__hhScene) window.__hhScene.restartLevelDirect();
    }
  });
  kit.loader.show('Hearth & Halls');
  kit.loader.progress(0.15);

  const publicState = {
    mode: 'title',
    level: 1,
    moves: 0,
    rooms: [],
    choices: cloneChoices(null),
    comfortInventory: [],
    homeItems: [Array(6).fill(-1), Array(6).fill(-1)],
    best: Array(12).fill(0),
    medals: Array(12).fill(0),
    replayLevel: null,
    reducedMotion: false
  };
  window.__hh = {
    state: publicState,
    forceLevel: function (level) {
      if (window.__hhScene) window.__hhScene.forceLevel(level);
    },
    forceRoom: function (room) {
      if (window.__hhScene) window.__hhScene.forceRoom(room);
    }
  };

  class HearthScene extends Phaser.Scene {
    constructor() {
      super({ key: 'HearthScene' });
      this.mode = 'title';
      this.levelIndex = 0;
      this.replay = false;
      this.roomIndex = 0;
      this.choiceSlot = 0;
      this.choiceFocus = 0;
      this.reactionSpeaker = 0;
      this.revealT = 1;
      this.finalRevealT = 0;
      this.moves = 0;
      this.score = 0;
      this.streak = 0;
      this.bestStreak = 0;
      this.hintUsed = false;
      this.selectedCell = null;
      this.cursor = { col: 3, row: 4 };
      this.preview = null;
      this.drag = null;
      this.keyLatch = new Set();
      this.rngState = 1;
      this.values = Array(CELLS).fill(0);
      this.specials = Array(CELLS).fill(null);
      this.tileViews = [];
      this.markerViews = [];
      this.particles = null;
      this.fx = null;
      this.boardFrame = null;
      this.roomViews = [];
      this.background = null;
      this.layoutDirty = true;
      this.boardPulse = 0;
      this.swapPulse = 0;
      this.chipT = 0;
      this.tutorialT = 0;
      this.reactionReady = false;
      this.roomComplete = false;
      this.pendingStyle = 0;
      this.comfortFocus = -1;
      this.swapAnim = null;
      this.settleT = 0;
      this.roomMotionT = 0;
      this.buildPulse = 0;
      this.comfortPulse = 0;
      this.lastCollectedItem = -1;
      this.gamepadPrev = { left: false, right: false, up: false, down: false, confirm: false, cancel: false, start: false };
      this.lastSr = '';
      this.pausedByKit = false;
    }

    preload() {
      kit.loader.progress(0.35);
    }

    create() {
      window.__hhScene = this;
      this.progress = sanitizeSave(kit.save.get(SAVE_FALLBACK));
      this.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (this.reducedMotion) kit.juice.enabled = false;
      this.createTextures();
      this.createParticles();
      this.createUi();
      kit.audio.register(AUDIO);
      kit.audio.preload(AUDIO_NAMES);
      this.bindInput();
      this.bindAccessibleControls();
      this.scale.on('resize', function () { this.layoutDirty = true; }.bind(this));
      this.game.events.on('hidden', function () { this.keyLatch.clear(); this.cancelPointer(); }.bind(this));
      kit.registerPWA();
      kit.loader.progress(1);
      kit.loader.hide();
      this.setMode(this.progress.completed.some(Boolean) ? 'title' : 'title');
      kit.audio.music('music-home', 500);
      this.refreshPublicState();
    }

    update(time, delta) {
      const juice = kit.juice.frame();
      // Shake is an OFFSET from the scroll centerOn() produced in layout().
      // An absolute setScroll(dx, dy) snaps a zoomed camera back to 0,0 and
      // pushes the whole room off the canvas, with nothing logged.
      if (this.cameras && this.cameras.main) {
        this.cameras.main.setScroll((this.camBaseX || 0) + juice.dx, (this.camBaseY || 0) + juice.dy);
      }
      if (kit.paused) return;
      const dt = Math.min(1 / 30, Math.max(0, delta / 1000));
      if (this.layoutDirty) this.layout();
      this.stepKeys();
      if (!juice.frozen) this.step(dt);
      this.render();
    }

    createTextures() {
      const make = function (key, size, painter) {
        if (this.textures.exists(key)) return;
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        painter(g, size);
        g.generateTexture(key, size, size);
        g.destroy();
      }.bind(this);
      // Phaser 3.87 Graphics has no quadraticBezierTo (that method lives on
      // Phaser.Curves.Path, with a different argument order). Sample the curve
      // into lineTo segments instead, keeping the canvas control-point-first
      // argument order the symbol art was authored against.
      const quadTo = function (g, x0, y0, cpx, cpy, x1, y1) {
        const steps = 18;
        for (let i = 1; i <= steps; i += 1) {
          const t = i / steps;
          const u = 1 - t;
          g.lineTo(u * u * x0 + 2 * u * t * cpx + t * t * x1, u * u * y0 + 2 * u * t * cpy + t * t * y1);
        }
      };
      const drawSymbol = function (g, def, s) {
        const c = hex(def.color);
        g.fillStyle(0xffffff, 0.9);
        g.lineStyle(Math.max(2, s * 0.055), 0xffffff, 0.9);
        const cx = s * 0.5;
        const cy = s * 0.49;
        if (def.symbol === 'seed') { g.fillCircle(cx, cy, s * 0.15); g.fillStyle(c); g.fillCircle(cx + s * 0.045, cy - s * 0.045, s * 0.055); }
        if (def.symbol === 'sun') { g.strokeCircle(cx, cy, s * 0.15); for (let i = 0; i < 4; i += 1) { const a = i * Math.PI / 2; g.lineBetween(cx + Math.cos(a) * s * 0.22, cy + Math.sin(a) * s * 0.22, cx + Math.cos(a) * s * 0.3, cy + Math.sin(a) * s * 0.3); } }
        if (def.symbol === 'leaf') { g.beginPath(); g.moveTo(cx, cy - s * 0.24); quadTo(g, cx, cy - s * 0.24, cx + s * 0.27, cy - s * 0.04, cx, cy + s * 0.24); quadTo(g, cx, cy + s * 0.24, cx - s * 0.27, cy - s * 0.04, cx, cy - s * 0.24); g.closePath(); g.fillPath(); g.lineBetween(cx - s * 0.02, cy + s * 0.18, cx + s * 0.13, cy - s * 0.08); }
        if (def.symbol === 'drop') { g.beginPath(); g.moveTo(cx, cy - s * 0.27); g.lineTo(cx + s * 0.21, cy + s * 0.05); g.arc(cx, cy + s * 0.05, s * 0.21, 0, Math.PI, false); g.closePath(); g.fillPath(); }
        if (def.symbol === 'star') { g.beginPath(); for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? s * 0.11 : s * 0.25; const x = cx + Math.cos(a) * r; const y = cy + Math.sin(a) * r; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.closePath(); g.fillPath(); }
        if (def.symbol === 'flame') { g.beginPath(); g.moveTo(cx, cy - s * 0.27); quadTo(g, cx, cy - s * 0.27, cx + s * 0.27, cy - s * 0.04, cx + s * 0.13, cy + s * 0.22); quadTo(g, cx + s * 0.13, cy + s * 0.22, cx, cy + s * 0.3, cx - s * 0.18, cy + s * 0.2); quadTo(g, cx - s * 0.18, cy + s * 0.2, cx - s * 0.27, cy + s * 0.04, cx, cy - s * 0.27); g.closePath(); g.fillPath(); }
      };
      const drawTileShape = function (g, index, color, offset) {
        const cx = 32; const cy = 31 + offset;
        g.fillStyle(hex(color), 1);
        if (index === 0) { g.fillCircle(cx, cy, 26); g.fillCircle(19, cy + 15, 8); g.fillCircle(45, cy + 15, 8); return; }
        if (index === 1) { g.beginPath(); g.moveTo(20, 5 + offset); g.lineTo(44, 5 + offset); g.lineTo(58, 24 + offset); g.lineTo(47, 56 + offset); g.lineTo(17, 56 + offset); g.lineTo(6, 24 + offset); g.closePath(); g.fillPath(); return; }
        if (index === 2) { g.beginPath(); g.moveTo(32, 4 + offset); g.lineTo(57, 28 + offset); g.lineTo(32, 57 + offset); g.lineTo(7, 28 + offset); g.closePath(); g.fillPath(); return; }
        if (index === 3) { g.beginPath(); g.moveTo(32, 4 + offset); g.lineTo(56, 30 + offset); g.arc(32, 30 + offset, 24, 0, Math.PI, false); g.closePath(); g.fillPath(); return; }
        if (index === 4) { g.beginPath(); for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? 16 : 28; const x = cx + Math.cos(a) * r; const y = cy + Math.sin(a) * r; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.closePath(); g.fillPath(); return; }
        g.beginPath(); g.moveTo(32, 3 + offset); g.lineTo(57, 24 + offset); g.lineTo(48, 57 + offset); g.lineTo(17, 57 + offset); g.lineTo(7, 24 + offset); g.closePath(); g.fillPath();
      };
      TILE_DEFS.forEach(function (def, index) {
        make('hh-tile-' + index, 64, function (g, s) {
          drawTileShape(g, index, def.edge, 4);
          drawTileShape(g, index, def.color, 0);
          g.fillStyle(0xffffff, 0.42); g.fillCircle(s * 0.28, s * 0.24, s * 0.06);
          drawSymbol(g, def, s);
        });
      });
      make('hh-particle', 8, function (g, s) { g.fillStyle(0xffffff, 1); g.fillCircle(4, 4, 4); });
      make('hh-star', 32, function (g, s) { g.fillStyle(0xffffff, 1); g.beginPath(); for (let i = 0; i < 8; i += 1) { const a = -Math.PI / 2 + i * Math.PI / 4; const r = i % 2 ? 6 : 15; const x = 16 + Math.cos(a) * r; const y = 16 + Math.sin(a) * r; if (!i) g.moveTo(x, y); else g.lineTo(x, y); } g.closePath(); g.fillPath(); });
    }

    createParticles() {
      this.fx = {
        clear: this.add.particles(0, 0, 'hh-particle', { speed: { min: 55, max: 190 }, angle: { min: 0, max: 360 }, lifespan: { min: 260, max: 480 }, scale: { start: 0.8, end: 0 }, alpha: { start: 0.95, end: 0 }, emitting: false, maxAliveParticles: 48, blendMode: Phaser.BlendModes.ADD }).setDepth(45),
        streak: this.add.particles(0, 0, 'hh-particle', { speed: { min: 100, max: 240 }, angle: { min: 230, max: 310 }, lifespan: { min: 320, max: 560 }, scale: { start: 0.55, end: 0 }, alpha: { start: 0.75, end: 0 }, emitting: false, maxAliveParticles: 32, blendMode: Phaser.BlendModes.ADD }).setDepth(45),
        reward: this.add.particles(0, 0, 'hh-star', { speed: { min: 45, max: 170 }, angle: { min: 190, max: 350 }, lifespan: { min: 600, max: 980 }, scale: { start: 0.8, end: 0 }, alpha: { start: 0.9, end: 0 }, rotate: { min: -180, max: 180 }, emitting: false, maxAliveParticles: 36, blendMode: Phaser.BlendModes.ADD }).setDepth(150),
        place: this.add.particles(0, 0, 'hh-star', { speed: { min: 25, max: 90 }, angle: { min: 210, max: 330 }, lifespan: { min: 420, max: 700 }, scale: { start: 0.48, end: 0 }, alpha: { start: 0.75, end: 0 }, emitting: false, maxAliveParticles: 18, blendMode: Phaser.BlendModes.ADD }).setDepth(150),
        unlock: this.add.particles(0, 0, 'hh-star', { speed: { min: 50, max: 155 }, angle: { min: 0, max: 360 }, lifespan: { min: 520, max: 880 }, scale: { start: 0.7, end: 0 }, alpha: { start: 0.85, end: 0 }, emitting: false, maxAliveParticles: 28, blendMode: Phaser.BlendModes.ADD }).setDepth(150),
        comfort: this.add.particles(0, 0, 'hh-particle', { speed: { min: 18, max: 70 }, angle: { min: 200, max: 340 }, lifespan: { min: 320, max: 620 }, scale: { start: 0.42, end: 0 }, alpha: { start: 0.7, end: 0 }, emitting: false, maxAliveParticles: 16, blendMode: Phaser.BlendModes.ADD }).setDepth(150)
      };
    }

    createUi() {
      const makeText = function (x, y, text, size, color, weight, originX) {
        const item = this.add.text(x, y, text, { fontFamily: SYSTEM_FONT, fontSize: size + 'px', fontStyle: weight >= 800 ? 'bold' : 'normal', color: '#' + color.toString(16).padStart(6, '0'), resolution: RETINA, align: 'left' }).setOrigin(originX == null ? 0 : originX, 0.5).setDepth(100);
        item._hhColor = color; return item;
      }.bind(this);
      const makeButton = function () {
        const container = this.add.container(0, 0).setDepth(110);
        const bg = this.add.rectangle(0, 0, 10, 10, COLORS.coral).setOrigin(0.5);
        const label = makeText(0, 0, '', 15, COLORS.paper, 800, 0.5);
        container.add([bg, label]);
        return { container: container, bg: bg, label: label, enabled: true, rect: { x: 0, y: 0, w: 0, h: 0 } };
      }.bind(this);
      this.ui = {
        brand: makeText(20, 22, 'HEARTH & HALLS', 17, COLORS.paper, 800),
        context: makeText(0, 22, '', 14, COLORS.brass, 800, 1),
        title: makeText(0, 118, '', 30, COLORS.paper, 800, 0.5),
        subtitle: makeText(0, 154, '', 16, COLORS.paperSoft, 600, 0.5),
        level: makeText(20, 55, '', 16, COLORS.paper, 800),
        moves: makeText(0, 55, '', 16, COLORS.brass, 800, 1),
        goal: makeText(20, 78, '', 15, COLORS.paperSoft, 700),
        best: makeText(0, 78, '', 15, COLORS.paperSoft, 700, 1),
        hint: makeText(0, 104, '', 14, COLORS.paperSoft, 600, 0.5),
        chip: makeText(0, 111, '', 14, COLORS.paper, 800, 1),
        bottom: makeText(20, 0, '', 14, COLORS.paperSoft, 700),
        roomProgress: makeText(20, 0, '', 14, COLORS.paperSoft, 700),
        roomName: makeText(20, 0, '', 16, COLORS.ink, 800),
        choiceTitle: makeText(0, 0, '', 24, COLORS.ink, 800, 0.5),
        choiceSub: makeText(0, 0, '', 15, COLORS.ink, 600, 0.5),
        comfortTitle: makeText(20, 0, '', 13, COLORS.paper, 800),
        reactionSpeaker: makeText(0, 0, '', 16, COLORS.ink, 800),
        reactionLine: makeText(0, 0, '', 17, COLORS.ink, 600),
        clearTitle: makeText(0, 0, '', 27, COLORS.ink, 800, 0.5),
        clearScore: makeText(0, 0, '', 16, COLORS.ink, 700, 0.5),
        clearMedal: makeText(0, 0, '', 32, COLORS.brass, 800, 0.5),
        completeTitle: makeText(0, 0, 'A HOME WITH OPINIONS', 26, COLORS.paper, 800, 0.5),
        completeSub: makeText(0, 0, 'Both rooms are fully revealed.', 16, COLORS.paperSoft, 600, 0.5),
        replayTitle: makeText(0, 0, 'REPLAY A FINISHED LEVEL', 24, COLORS.paper, 800, 0.5),
        replaySub: makeText(0, 0, 'Chase a personal best. Choices stay yours.', 15, COLORS.paperSoft, 600, 0.5)
      };
      this.buttons = {
        start: makeButton(), retry: makeButton(), hint: makeButton(), next: makeButton(),
        newRun: makeButton(), replay: makeButton(), choose: makeButton(), continue: makeButton(), back: makeButton(),
        decorate: makeButton(), settings: makeButton()
      };
      this.choiceButtons = [makeButton(), makeButton(), makeButton()];
      this.comfortButtons = COMFORT_ITEMS.map(function () { return makeButton(); });
      this.replayButtons = Array.from({ length: 12 }, makeButton);
      this.selectionG = this.add.graphics().setDepth(60);
      this.curtainG = this.add.graphics().setDepth(90);
      this.roomGlowG = this.add.graphics().setDepth(52);
      for (let i = 0; i < CELLS; i += 1) {
        this.tileViews.push(this.add.image(0, 0, 'hh-tile-0').setDepth(20).setVisible(false));
        this.markerViews.push(this.add.text(0, 0, '✦', { fontFamily: SYSTEM_FONT, fontSize: '20px', color: '#fff8ee', resolution: RETINA }).setOrigin(0.5).setDepth(25).setVisible(false));
      }
      this.roomViews = [];
      this.srStatus = document.getElementById('sr-status');
    }

    bindInput() {
      // Phaser reports pointer coordinates in GAME space, which after the
      // retina conversion is device pixels. Every hit test, board rect and
      // drag threshold below is in the CSS-pixel world the camera zoom maps
      // from, so bring the pointer back into that space first. Skipping this
      // puts every tap RETINA times too far right and down.
      const toWorld = (pointer) => ({ x: pointer.x / RETINA, y: pointer.y / RETINA });
      this.input.on('pointerdown', function (pointer) {
        if (kit.paused || this.drag) return;
        const p = toWorld(pointer);
        const record = kit.input.pointers.get(pointer.id);
        if (record) record.zone = 'hearth-halls';
        else kit.input.pointers.set(pointer.id, { x: p.x, y: p.y, startX: p.x, startY: p.y, downAt: 0, zone: 'hearth-halls' });
        const hit = this.hitTest(p.x, p.y);
        if (!hit) return;
        if (this.mode === 'choice' && hit.id && hit.id.indexOf('choice-') === 0) { this.choiceFocus = hit.style; this.layoutDirty = true; }
        if (hit.kind === 'board') {
          this.drag = { id: pointer.id, start: hit.cell, startX: p.x, startY: p.y };
          this.preview = null;
        } else {
          this.drag = { id: pointer.id, button: hit.id, style: hit.style, startX: p.x, startY: p.y };
        }
        kit.audio.sfx('tap');
      }, this);
      this.input.on('pointermove', function (pointer) {
        if (!this.drag || pointer.id !== this.drag.id || this.mode !== 'level' && this.mode !== 'replay') return;
        const p = toWorld(pointer);
        const cell = this.cellFromPoint(p.x, p.y);
        if (!this.drag.start || !cell) return;
        const dx = p.x - this.drag.startX;
        const dy = p.y - this.drag.startY;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
          const to = Math.abs(dx) > Math.abs(dy) ? { col: this.drag.start.col + (dx > 0 ? 1 : -1), row: this.drag.start.row } : { col: this.drag.start.col, row: this.drag.start.row + (dy > 0 ? 1 : -1) };
          if (to.col >= 0 && to.col < COLS && to.row >= 0 && to.row < ROWS) this.setPreview(this.drag.start, to);
        } else if (this.selectedCell && adjacent(this.selectedCell, cell)) this.setPreview(this.selectedCell, cell);
      }, this);
      this.input.on('pointerup', function (pointer) {
        if (!this.drag || pointer.id !== this.drag.id) return;
        const p = toWorld(pointer);
        const drag = this.drag; this.drag = null;
        if (drag.start) {
          const dx = p.x - drag.startX;
          const dy = p.y - drag.startY;
          if (Math.max(Math.abs(dx), Math.abs(dy)) > 16) {
            const to = Math.abs(dx) > Math.abs(dy) ? { col: drag.start.col + (dx > 0 ? 1 : -1), row: drag.start.row } : { col: drag.start.col, row: drag.start.row + (dy > 0 ? 1 : -1) };
            if (to.col >= 0 && to.col < COLS && to.row >= 0 && to.row < ROWS) this.trySwap(drag.start, to);
          } else {
            this.tapCell(this.cellFromPoint(p.x, p.y) || drag.start);
          }
        } else if (this.hitTest(p.x, p.y) && this.hitTest(p.x, p.y).id === drag.button) {
          this.activateButton(drag.button, drag.style);
        }
        this.preview = null;
      }, this);
      this.input.on('pointercancel', function (pointer) { this.cancelPointer(pointer); }, this);
      this.input.on('pointerupoutside', function (pointer) { this.cancelPointer(pointer); }, this);
      this.input.on('gameout', function (pointer) { this.cancelPointer(pointer); }, this);
    }

    cancelPointer(pointer) {
      if (!pointer || !this.drag || pointer.id === this.drag.id) { this.drag = null; this.preview = null; }
      if (kit.input && kit.input.pointers) kit.input.pointers.clear();
    }

    bindAccessibleControls() {
      document.querySelectorAll('[data-hh-action]').forEach(function (control) {
        control.addEventListener('click', function () {
          const action = control.getAttribute('data-hh-action');
          if (action === 'left' || action === 'right' || action === 'up' || action === 'down') this.keyAction('Arrow' + action.charAt(0).toUpperCase() + action.slice(1));
          else if (action === 'confirm') this.keyAction('Enter');
          else if (action === 'cancel') this.keyAction('Escape');
          else this.activateButton(action);
        }.bind(this));
      }, this);
    }

    stepKeys() {
      const codes = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Space', 'KeyR', 'KeyN', 'Escape'];
      const pressed = function (code) { return kit.input.keyDown(code); };
      codes.forEach(function (code) {
        const down = pressed(code);
        if (down && !this.keyLatch.has(code)) this.keyAction(code);
        if (down) this.keyLatch.add(code); else this.keyLatch.delete(code);
      }, this);
      const pad = this.pollGamepad();
      if (pad.left) this.keyAction('ArrowLeft');
      if (pad.right) this.keyAction('ArrowRight');
      if (pad.up) this.keyAction('ArrowUp');
      if (pad.down) this.keyAction('ArrowDown');
      if (pad.confirm) this.keyAction('Enter');
      if (pad.cancel) this.keyAction('Escape');
      if (pad.start) this.activateButton('settings');
    }

    pollGamepad() {
      const empty = { left: false, right: false, up: false, down: false, confirm: false, cancel: false, start: false };
      if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') { this.gamepadPrev = empty; return empty; }
      let pads = [];
      try { pads = navigator.getGamepads() || []; } catch (e) { this.gamepadPrev = empty; return empty; }
      const pad = Array.from(pads).find(function (candidate) { return candidate && candidate.connected; });
      if (!pad) { this.gamepadPrev = empty; return empty; }
      const axisX = Number(pad.axes && pad.axes[0]) || 0; const axisY = Number(pad.axes && pad.axes[1]) || 0;
      const current = {
        left: !!((pad.buttons[14] && pad.buttons[14].pressed) || axisX < -0.55),
        right: !!((pad.buttons[15] && pad.buttons[15].pressed) || axisX > 0.55),
        up: !!((pad.buttons[12] && pad.buttons[12].pressed) || axisY < -0.55),
        down: !!((pad.buttons[13] && pad.buttons[13].pressed) || axisY > 0.55),
        confirm: !!(pad.buttons[0] && pad.buttons[0].pressed),
        cancel: !!(pad.buttons[1] && pad.buttons[1].pressed),
        start: !!(pad.buttons[9] && pad.buttons[9].pressed)
      };
      const edge = Object.keys(current).reduce(function (out, key) { out[key] = current[key] && !this.gamepadPrev[key]; return out; }.bind(this), {});
      this.gamepadPrev = current;
      return edge;
    }

    keyAction(code) {
      if (code === 'Escape') {
        if (this.mode === 'replaySelect') this.setMode('complete');
        else if (this.mode === 'choice') this.setMode('clear');
        else if ((this.mode === 'level' || this.mode === 'replay') && this.selectedCell) { this.selectedCell = null; this.preview = null; }
        else if (this.mode !== 'title') this.activateButton('settings');
        return;
      }
      if (this.mode === 'title' && (code === 'Enter' || code === 'Space')) { this.activateButton('start'); return; }
      if ((this.mode === 'level' || this.mode === 'replay') && code === 'KeyR') { this.restartLevel(); return; }
      if ((this.mode === 'level' || this.mode === 'replay') && code === 'KeyN') { this.newRun(); return; }
      if ((this.mode === 'level' || this.mode === 'replay') && code.indexOf('Arrow') === 0) {
        const dx = code === 'ArrowLeft' ? -1 : code === 'ArrowRight' ? 1 : 0;
        const dy = code === 'ArrowUp' ? -1 : code === 'ArrowDown' ? 1 : 0;
        this.cursor.col = (this.cursor.col + dx + COLS) % COLS;
        this.cursor.row = (this.cursor.row + dy + ROWS) % ROWS;
        if (this.selectedCell && adjacent(this.selectedCell, this.cursor)) this.setPreview(this.selectedCell, this.cursor);
        else if (!this.selectedCell) this.preview = this.firstLegalPreview(this.cursor);
        this.tutorialT = 1.8;
        return;
      }
      if (code === 'Enter' || code === 'Space') {
        if (this.mode === 'level' || this.mode === 'replay') {
          if (!this.selectedCell) this.tapCell(this.cursor);
          else if (adjacent(this.selectedCell, this.cursor)) this.trySwap(this.selectedCell, this.cursor);
          else this.tapCell(this.cursor);
        }
        else if (this.mode === 'clear') this.activateButton('choose');
        else if (this.mode === 'choice') this.activateButton('decorate');
        else if (this.mode === 'reaction') this.activateButton('continue');
        else if (this.mode === 'roomComplete') this.activateButton('next');
        else if (this.mode === 'fail') this.activateButton('retry');
        else if (this.mode === 'complete') this.activateButton('replay');
        else if (this.mode === 'replaySelect') this.activateButton('replay-' + this.choiceFocus, this.choiceFocus);
      }
      if (this.mode === 'choice' && (code === 'ArrowLeft' || code === 'ArrowRight')) { this.choiceFocus = (this.choiceFocus + (code === 'ArrowLeft' ? 2 : 1)) % 3; this.pendingStyle = this.choiceFocus; this.layoutDirty = true; }
      if (this.mode === 'choice' && (code === 'ArrowUp' || code === 'ArrowDown') && this.progress.comfortInventory.length) {
        const current = Math.max(0, this.progress.comfortInventory.indexOf(this.comfortFocus)); const offset = code === 'ArrowUp' ? -1 : 1; const next = (current + offset + this.progress.comfortInventory.length) % this.progress.comfortInventory.length; this.selectComfort(this.progress.comfortInventory[next]);
      }
    }

    step(dt) {
      this.tutorialT = Math.max(0, this.tutorialT - dt);
      this.chipT = Math.max(0, this.chipT - dt);
      this.boardPulse = Math.max(0, this.boardPulse - dt);
      this.swapPulse = Math.max(0, this.swapPulse - dt);
      this.settleT = Math.max(0, this.settleT - dt);
      if (this.swapAnim) { this.swapAnim.t -= dt; if (this.swapAnim.t <= 0) this.swapAnim = null; }
      this.roomMotionT += dt;
      this.buildPulse = Math.max(0, this.buildPulse - dt);
      this.comfortPulse = Math.max(0, this.comfortPulse - dt);
      if (this.mode === 'reaction') {
        this.revealT = Math.min(1, this.revealT + dt / 0.92);
        this.reactionReady = this.revealT >= 0.86;
      }
      if (this.mode === 'complete') this.finalRevealT = Math.min(1, this.finalRevealT + dt / 1.2);
      this.refreshPublicState();
    }

    layout() {
      this.layoutDirty = false;
      // scale.width/height are DEVICE pixels after the retina conversion; the
      // world stays in CSS pixels (see RETINA at the top of this file), so the
      // camera zoom absorbs the density and the layout below is unchanged.
      // The centerOn is not optional: a zoomed camera holds its own midpoint
      // under the viewport centre, so without it the whole room slides off.
      const w = this.scale.width / RETINA;
      const h = this.scale.height / RETINA;
      this.cameras.main.setZoom(RETINA);
      this.cameras.main.centerOn(w / 2, h / 2);
      this.camBaseX = this.cameras.main.scrollX;
      this.camBaseY = this.cameras.main.scrollY;
      this.w = w; this.h = h;
      this.ui.context.setX(w - 20);
      const cell = Math.floor(Math.min((w - 34) / COLS, (h - 310) / ROWS));
      this.boardRect = { x: (w - cell * COLS) / 2, y: Math.max(142, Math.min(186, h * 0.215)), cell: cell, w: cell * COLS, h: cell * ROWS };
      this.boardFrame = this.bakeBoardFrame();
      this.bakeBackground();
      this.rebuildRoomViews();
      this.positionStaticUi();
      this.updateModeVisibility();
    }

    bakeBackground() {
      if (this.background) this.background.destroy();
      this.background = this.add.renderTexture(0, 0, this.w, this.h).setOrigin(0).setDepth(-20);
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillGradientStyle(0x3b2930, 0x49312e, 0x181b2a, 0x10141f, 1);
      g.fillRect(0, 0, this.w, this.h);
      g.fillStyle(0x9a5c48, 0.15); g.fillCircle(this.w * 0.05, this.h * 0.3, 120);
      g.fillStyle(0xc78a52, 0.1); g.fillCircle(this.w * 0.96, this.h * 0.53, 150);
      g.fillStyle(0xf3bc50, 0.1); g.fillCircle(this.w * 0.5, this.h * 0.02, 180);
      g.fillStyle(0x0f1420, 0.2); g.fillRect(0, 0, this.w, 7); g.fillRect(0, this.h - 7, this.w, 7);
      g.lineStyle(2, 0xc89262, 0.18); g.lineBetween(0, this.h * 0.24, this.w, this.h * 0.24); g.lineBetween(0, this.h * 0.77, this.w, this.h * 0.77);
      this.background.draw(g, 0, 0); g.destroy();
    }

    bakeBoardFrame() {
      if (this.boardFrame && this.boardFrame.destroy) this.boardFrame.destroy();
      const r = this.boardRect;
      const frame = this.add.renderTexture(r.x - 10, r.y - 10, r.w + 20, r.h + 20).setOrigin(0).setDepth(8);
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x110f18, 0.72); g.fillRoundedRect(0, 5, r.w + 20, r.h + 17, 23);
      g.fillStyle(0x8b563d, 1); g.fillRoundedRect(0, 0, r.w + 20, r.h + 12, 23);
      g.fillStyle(0xc58b58, 0.35); g.fillRoundedRect(5, 4, r.w + 10, r.h + 3, 18);
      g.lineStyle(2, COLORS.brass, 0.9); g.strokeRoundedRect(2, 2, r.w + 16, r.h + 8, 21);
      for (let row = 0; row < ROWS; row += 1) for (let col = 0; col < COLS; col += 1) {
        g.fillStyle(0xead9c3, 1); g.fillRoundedRect(10 + col * r.cell, 10 + row * r.cell, r.cell - 3, r.cell - 3, 9);
        g.lineStyle(1, 0x9d775e, 0.46); g.strokeRoundedRect(11 + col * r.cell, 11 + row * r.cell, r.cell - 5, r.cell - 5, 8);
      }
      g.fillStyle(COLORS.brass, 1); [[8, 8], [r.w + 12, 8], [8, r.h + 1], [r.w + 12, r.h + 1]].forEach(function (p) { g.fillCircle(p[0], p[1], 3); });
      frame.draw(g, 0, 0); g.destroy();
      return frame;
    }

    positionStaticUi() {
      const w = this.w; const h = this.h;
      this.ui.brand.setPosition(20, 22);
      this.ui.context.setPosition(w - 20, 22);
      this.ui.level.setPosition(20, 55); this.ui.moves.setPosition(w - 20, 55);
      this.ui.goal.setPosition(20, 78); this.ui.best.setPosition(w - 20, 78);
      this.ui.hint.setPosition(w / 2, 105); this.ui.chip.setPosition(w - 20, 111);
      this.ui.bottom.setPosition(78, h - 27); this.ui.roomProgress.setPosition(20, h - 27);
      this.ui.comfortTitle.setPosition(20, h - 326);
      this.placeButton(this.buttons.settings, w - 20, 22, 34, 30, '⚙', COLORS.board);
      this.placeButton(this.buttons.hint, w - 66, 105, 44, 44, '?', COLORS.board);
      this.placeButton(this.buttons.retry, 18, h - 52, 48, 44, '↻', COLORS.woodDark);
      this.placeButton(this.buttons.start, w / 2, h - 82, Math.min(w - 44, 320), 54, 'Begin building', COLORS.coral);
      this.placeButton(this.buttons.next, w / 2, h - 76, Math.min(w - 44, 320), 54, 'Next room beat', COLORS.coral);
      this.placeButton(this.buttons.choose, w / 2, h - 76, Math.min(w - 44, 320), 54, 'Choose the fixture', COLORS.coral);
      this.placeButton(this.buttons.continue, w / 2, h - 76, Math.min(w - 44, 320), 54, 'Continue', COLORS.coral);
      this.placeButton(this.buttons.newRun, w / 2, h - 74, Math.min(w - 44, 320), 52, 'Start a new run', COLORS.coral);
      this.placeButton(this.buttons.replay, w / 2, h - 136, Math.min(w - 44, 320), 52, 'Replay a level', COLORS.coral);
      this.placeButton(this.buttons.back, w / 2, h - 74, Math.min(w - 44, 320), 52, 'Back', COLORS.board);
      this.placeButton(this.buttons.decorate, w / 2, h - 76, Math.min(w - 44, 320), 52, 'Reveal fixture', COLORS.coral);
      this.comfortButtons.forEach(function (button, index) {
        const gap = 5; const bw = (w - 40 - gap * 5) / 6;
        this.placeButton(button, 20 + bw / 2 + index * (bw + gap), h - 284, bw, 42, COMFORT_ITEMS[index].mark, COMFORT_ITEMS[index].color);
      }.bind(this));
      this.replayButtons.forEach(function (button, index) { const col = index % 3; const row = Math.floor(index / 3); this.placeButton(button, 72 + col * ((w - 144) / 2), 208 + row * 58, 52, 46, String(index + 1), this.progress.completed[index] ? COLORS.accent : COLORS.cell); }.bind(this));
      const choiceY = h - 190;
      this.choiceButtons.forEach(function (button, index) { const gap = 8; const bw = (w - 40 - gap * 2) / 3; this.placeButton(button, 20 + bw / 2 + index * (bw + gap), choiceY, bw, 78, STYLES[index].name, STYLES[index].color); }.bind(this));
    }

    placeButton(button, x, y, w, h, label, fill) {
      button.container.setPosition(x, y);
      button.bg.setSize(w, h); button.bg.setFillStyle(fill, 1);
      setTextIfChanged(button.label, label); button.label.setPosition(0, 0);
      button.rect = { x: x - w / 2, y: y - h / 2, w: w, h: h };
      button.enabled = true;
    }

    rebuildRoomViews() {
      this.roomViews.forEach(function (view) { if (view && view.destroy) view.destroy(); });
      this.roomViews = [];
      if (this.mode === 'title') {
        this.roomViews.push(this.bakeRoomView(16, 106, this.w - 32, Math.min(310, this.h - 350), 0, -1, -1));
      } else if (this.mode === 'choice' || this.mode === 'reaction') {
        this.roomViews.push(this.bakeRoomView(16, 122, this.w - 32, Math.min(326, this.h - 355), this.roomIndex, this.choiceSlot, this.mode === 'choice' ? this.pendingStyle : this.selectedChoice()));
      } else if (this.mode === 'complete') {
        this.roomViews.push(this.bakeRoomView(14, 142, this.w * 0.46, 230, 0, -1, -1));
        this.roomViews.push(this.bakeRoomView(this.w * 0.54 - 2, 142, this.w * 0.46, 230, 1, -1, -1));
      }
    }

    bakeRoomView(x, y, w, h, room, previewSlot, previewStyle) {
      const view = this.add.renderTexture(x, y, w, h).setOrigin(0).setDepth(3);
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      this.drawRoomGraphic(g, w, h, room, previewSlot, previewStyle);
      view.draw(g, 0, 0); g.destroy();
      return view;
    }

    drawRoomGraphic(g, w, h, roomIndex, previewSlot, previewStyle) {
      const room = ROOMS[roomIndex] || ROOMS[0];
      const selected = function (slot) {
        const stored = this.progress.choices[roomIndex] && this.progress.choices[roomIndex][slot];
        return slot === previewSlot && previewStyle >= 0 ? previewStyle : (stored >= 0 ? stored : -1);
      }.bind(this);
      g.fillStyle(room.wall, 1); g.fillRoundedRect(0, 0, w, h, 20);
      g.fillStyle(0xffffff, 0.13); g.fillRect(0, h * 0.08, w, h * 0.48);
      g.lineStyle(2, room.wallDeep, 0.34); for (let seam = 0.11; seam < 0.7; seam += 0.12) g.lineBetween(w * seam, 10, w * seam, h * 0.7);
      g.fillStyle(room.wallDeep, 0.52); g.fillRect(0, h * 0.7, w, h * 0.3);
      g.fillStyle(room.floor, 1); g.fillRect(0, h * 0.78, w, h * 0.22);
      g.lineStyle(2, 0x5d3b32, 0.3); for (let plank = 0; plank < 5; plank += 1) g.lineBetween(0, h * (0.8 + plank * 0.045), w, h * (0.8 + plank * 0.045));
      g.fillStyle(0xffffff, 0.24); g.fillRect(0, h * 0.74, w, 4);
      g.fillStyle(ROOMS[roomIndex].trim, 0.7); g.fillRect(0, 0, w, 10); g.fillStyle(0x6d4238, 0.4); g.fillRect(0, 10, w, 4);
      if (room.kind === 'living') {
        g.fillStyle(0x91c5bf, 1); g.fillRoundedRect(w * 0.56, h * 0.08, w * 0.32, h * 0.26, 10);
        g.fillStyle(0xeaf4e4, 1); g.fillRect(w * 0.58, h * 0.1, w * 0.14, h * 0.22); g.fillRect(w * 0.73, h * 0.1, w * 0.13, h * 0.22);
        g.lineStyle(3, room.trim, 1); g.lineBetween(w * 0.72, h * 0.08, w * 0.72, h * 0.34);
      } else {
        g.fillStyle(0x9ab7b0, 1); g.fillRect(w * 0.04, h * 0.41, w * 0.92, h * 0.26);
        g.fillStyle(0xc5d7cb, 1); g.fillRect(w * 0.04, h * 0.36, w * 0.92, h * 0.08);
        g.fillStyle(0xf3d37b, 1); g.fillCircle(w * 0.15, h * 0.58, 8); g.fillCircle(w * 0.84, h * 0.58, 8);
        g.fillStyle(0x506b61, 1); g.fillRoundedRect(w * 0.58, h * 0.12, w * 0.28, h * 0.2, 8);
        g.fillStyle(0xe8f1d8, 1); g.fillRect(w * 0.61, h * 0.15, w * 0.22, h * 0.14);
      }
      g.fillStyle(0x49312b, 0.28); g.fillEllipse(w * 0.52, h * 0.85, w * 0.72, h * 0.16);
      for (let slot = 0; slot < 6; slot += 1) {
        const p = this.fixtureRect(slot, w, h);
        this.drawFixture(g, slot, selected(slot), p.x, p.y, p.w, p.h, slot === previewSlot);
        const item = this.progress.homeItems[roomIndex] && this.progress.homeItems[roomIndex][slot];
        if (item >= 0) this.drawComfortItem(g, item, p.x + p.w * 0.84, p.y + p.h * 0.22, Math.max(11, Math.min(18, p.h * 0.32)));
      }
      this.drawCharacter(g, w * 0.16, h * 0.81, room.marn, false, room.kind === 'kitchen');
      this.drawCharacter(g, w * 0.84, h * 0.81, room.pip, true, room.kind === 'living');
      g.fillStyle(0xf7e7d1, 0.74); g.fillRoundedRect(10, 10, Math.min(190, w - 20), 32, 10);
      g.fillStyle(ROOMS[roomIndex].trim, 1); g.fillRoundedRect(14, 14, 5, 24, 2);
      const roomName = room.short;
      this.roomNameText = this.roomNameText || '';
      g.fillStyle(COLORS.ink, 0.88); g.fillRect(0, 0, 0, 0);
      // Room names are rendered by Phaser text outside this baked scene.
      void roomName;
    }

    fixtureRect(slot, w, h) {
      const layouts = [
        [0.06, 0.48, 0.27, 0.28], [0.15, 0.73, 0.7, 0.12], [0.41, 0.5, 0.28, 0.22],
        [0.79, 0.2, 0.12, 0.3], [0.06, 0.18, 0.29, 0.23], [0.55, 0.12, 0.3, 0.25]
      ];
      const a = layouts[slot] || layouts[0];
      return { x: w * a[0], y: h * a[1], w: w * a[2], h: h * a[3] };
    }

    drawFixture(g, slot, style, x, y, w, h, active) {
      if (active) { g.lineStyle(3, COLORS.brass, 1); g.strokeRoundedRect(x - 5, y - 5, w + 10, h + 10, 10); }
      if (style < 0) {
        g.fillStyle(0x6f4d45, 0.18); g.fillEllipse(x + w * 0.5, y + h * 0.85, w * 0.9, h * 0.18);
        g.lineStyle(2, COLORS.ink, 0.34); g.strokeRoundedRect(x, y, w, h, 8);
        g.lineStyle(2, COLORS.brass, 0.42); g.lineBetween(x + w * 0.25, y + h * 0.5, x + w * 0.75, y + h * 0.5); g.lineBetween(x + w * 0.5, y + h * 0.28, x + w * 0.5, y + h * 0.72);
        return;
      }
      const color = STYLES[style] || STYLES[0];
      const fill = hex(color.color); const light = hex(color.light);
      g.fillStyle(0x49312b, 0.3); g.fillEllipse(x + w * 0.5, y + h * 0.9, w * 1.04, Math.max(5, h * 0.18));
      g.lineStyle(3, COLORS.woodDark, 1);
      if (slot === 0) { g.fillStyle(style === 1 ? 0xb78240 : style === 2 ? 0x3d9d91 : 0xb9684c, 1); g.fillRoundedRect(x, y + h * 0.2, w, h * 0.8, 8); g.strokeRoundedRect(x, y + h * 0.2, w, h * 0.8, 8); g.fillStyle(light, 1); g.fillCircle(x + w * 0.5 + (style === 2 ? 5 : 0), y + h * 0.65, h * 0.22); }
      if (slot === 1) { g.fillStyle(fill, 1); g.fillRoundedRect(x, y + h * 0.2, w, h * 0.62, style === 2 ? 3 : 16); g.strokeRoundedRect(x, y + h * 0.2, w, h * 0.62, style === 2 ? 3 : 16); if (style === 1) { g.lineStyle(2, light, 1); g.strokeCircle(x + w * 0.5, y + h * 0.51, h * 0.18); } else { g.fillStyle(light, 1); g.fillCircle(x + w * 0.2, y + h * 0.5, 4); g.fillCircle(x + w * 0.8, y + h * 0.5, 4); } }
      if (slot === 2) { g.fillStyle(fill, 1); if (style === 2) { g.beginPath(); g.moveTo(x + w * 0.5, y); g.lineTo(x + w, y + h * 0.65); g.lineTo(x, y + h * 0.65); g.closePath(); g.fillPath(); g.strokePath(); } else { g.fillEllipse(x + w * 0.5, y + h * 0.3, w * 0.95, h * 0.5); g.fillRect(x + w * 0.18, y + h * 0.3, w * 0.08, h * 0.68); g.fillRect(x + w * 0.74, y + h * 0.3, w * 0.08, h * 0.68); } }
      if (slot === 3) { g.lineStyle(3, COLORS.woodDark, 1); g.lineBetween(x + w * 0.5, y + h * 0.15, x + w * 0.5, y + h * 0.75); g.fillStyle(fill, 1); g.fillCircle(x + w * 0.5, y + h * 0.78, w * 0.22); g.fillRoundedRect(x + w * 0.2, y + h * 0.1, w * 0.6, h * 0.24, style === 2 ? 4 : 12); g.fillStyle(light, 1); g.fillCircle(x + w * 0.5, y + h * 0.22, w * 0.12); }
      if (slot === 4) { g.fillStyle(fill, 1); g.fillRect(x, y + h * 0.25, w, h * 0.12); g.fillRect(x, y + h * 0.6, w, h * 0.12); g.lineStyle(3, COLORS.woodDark, 1); g.lineBetween(x + w * 0.1, y + h * 0.18, x + w * 0.1, y + h * 0.86); g.lineBetween(x + w * 0.9, y + h * 0.18, x + w * 0.9, y + h * 0.86); g.fillStyle(light, 1); g.fillRect(x + w * 0.25, y + h * 0.38, w * 0.13, h * 0.14); g.fillRect(x + w * 0.62, y + h * 0.7, w * 0.15, h * 0.1); }
      if (slot === 5) { g.fillStyle(fill, 1); if (style === 1) { g.beginPath(); g.arc(x + w * 0.5, y + h * 0.56, Math.min(w, h) * 0.48, Math.PI, 0); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); g.fillPath(); g.strokePath(); } else { g.fillRoundedRect(x, y, w, h, style === 2 ? 2 : 6); g.strokeRoundedRect(x, y, w, h, style === 2 ? 2 : 6); } g.lineStyle(2, COLORS.ink, 0.55); g.lineBetween(x + w * 0.5, y + 3, x + w * 0.5, y + h - 3); g.lineBetween(x + 3, y + h * 0.5, x + w - 3, y + h * 0.5); }
    }

    drawComfortItem(g, itemIndex, x, y, size) {
      const item = COMFORT_ITEMS[itemIndex]; if (!item) return;
      g.fillStyle(0x3b2927, 0.36); g.fillCircle(x + 1, y + 2, size * 0.72);
      g.fillStyle(item.color, 1); g.fillCircle(x, y, size * 0.66);
      g.lineStyle(1.5, COLORS.paper, 0.85); g.strokeCircle(x, y, size * 0.66);
      g.fillStyle(COLORS.paper, 1); g.fillCircle(x, y, size * 0.22);
    }

    drawCharacter(g, x, y, color, flip, hat) {
      g.fillStyle(COLORS.ink, 0.18); g.fillEllipse(x, y + 24, 42, 12);
      g.fillStyle(color, 1); g.fillCircle(x, y, 18); g.fillStyle(COLORS.paper, 1); g.fillCircle(x - 6, y - 3, 3); g.fillCircle(x + 5, y - 3, 3);
      g.lineStyle(2, COLORS.ink, 1); g.beginPath(); g.arc(x, y + 3, 7, 0.15, Math.PI - 0.15); g.strokePath();
      if (hat) { g.fillStyle(COLORS.brass, 1); g.fillTriangle(x - 12, y - 15, x + 12, y - 15, x, y - 29); }
      if (flip) { g.fillStyle(COLORS.paper, 0.6); g.fillCircle(x + 16, y + 10, 4); }
    }

    setMode(mode) {
      this.mode = mode;
      if (mode === 'title') this.layoutDirty = true;
      if (mode === 'level' || mode === 'replay') { this.tutorialT = 4; this.chipT = 0; }
      if (mode === 'choice' || mode === 'reaction' || mode === 'complete') this.layoutDirty = true;
      this.updateModeVisibility();
      this.refreshPublicState();
    }

    updateModeVisibility() {
      if (!this.ui || !this.w) return;
      const mode = this.mode;
      const gameplay = mode === 'level' || mode === 'replay';
      const choice = mode === 'choice';
      const reaction = mode === 'reaction';
      const clear = mode === 'clear';
      const fail = mode === 'fail';
      const complete = mode === 'complete';
      const replaySelect = mode === 'replaySelect';
      const title = mode === 'title';
      const roomComplete = mode === 'roomComplete';
      const set = function (object, visible) { if (object) object.setVisible(visible); };
      set(this.ui.level, gameplay); set(this.ui.moves, gameplay); set(this.ui.goal, gameplay); set(this.ui.best, gameplay); set(this.ui.hint, gameplay); set(this.ui.bottom, gameplay); set(this.ui.chip, gameplay || reaction);
      set(this.ui.roomProgress, title || gameplay || choice || complete);
      set(this.ui.title, title); set(this.ui.subtitle, title); set(this.buttons.start.container, title);
      set(this.buttons.retry.container, gameplay); set(this.buttons.hint.container, gameplay);
      set(this.ui.choiceTitle, choice); set(this.ui.choiceSub, choice);
      set(this.ui.comfortTitle, choice); set(this.buttons.decorate.container, choice);
      this.comfortButtons.forEach(function (button) { set(button.container, choice); }.bind(this));
      set(this.buttons.settings.container, true);
      set(this.ui.roomName, choice || reaction); set(this.ui.reactionSpeaker, reaction); set(this.ui.reactionLine, reaction); set(this.buttons.continue.container, reaction);
      set(this.ui.clearTitle, clear || fail); set(this.ui.clearScore, clear || fail); set(this.ui.clearMedal, clear); set(this.buttons.choose.container, clear); set(this.buttons.retry.container, fail); set(this.buttons.newRun.container, fail);
      set(this.ui.completeTitle, complete); set(this.ui.completeSub, complete); set(this.buttons.replay.container, complete); set(this.buttons.newRun.container, complete);
      set(this.ui.replayTitle, replaySelect); set(this.ui.replaySub, replaySelect); set(this.buttons.back.container, replaySelect);
      set(this.buttons.next.container, roomComplete);
      this.choiceButtons.forEach(function (button) { set(button.container, choice); });
      this.replayButtons.forEach(function (button, index) { set(button.container, replaySelect && this.progress.completed[index]); }.bind(this));
      if (this.selectionG) this.selectionG.setVisible(gameplay);
      if (this.curtainG) this.curtainG.setVisible(reaction || complete || clear || fail || roomComplete);
      this.tileViews.forEach(function (view) { view.setVisible(gameplay); });
      this.markerViews.forEach(function (view) { view.setVisible(gameplay); });
      if (this.boardFrame) this.boardFrame.setVisible(gameplay);
      if (this.fx) Object.keys(this.fx).forEach(function (key) { this.fx[key].setVisible(gameplay || choice || reaction || complete || roomComplete); }.bind(this));
      if (this.roomGlowG) this.roomGlowG.setVisible(title || choice || reaction || complete);
      if (this.roomViews) this.roomViews.forEach(function (view) { view.setVisible(title || choice || reaction || complete); });
      this.positionModeUi();
    }

    positionModeUi() {
      if (!this.ui || !this.w) return;
      const w = this.w; const h = this.h;
      this.ui.title.setPosition(w / 2, 72); this.ui.subtitle.setPosition(w / 2, 108);
      this.ui.choiceTitle.setPosition(w / 2, 86); this.ui.choiceSub.setPosition(w / 2, 110);
      this.ui.comfortTitle.setPosition(20, h - 326);
      this.ui.roomName.setPosition(24, 132); this.ui.reactionSpeaker.setPosition(24, h * 0.58); this.ui.reactionLine.setPosition(24, h * 0.64); this.ui.reactionLine.setWordWrapWidth(w - 48);
      this.ui.clearTitle.setPosition(w / 2, h * 0.35); this.ui.clearScore.setPosition(w / 2, h * 0.42); this.ui.clearMedal.setPosition(w / 2, h * 0.51);
      this.ui.completeTitle.setPosition(w / 2, 76); this.ui.completeSub.setPosition(w / 2, 108);
      this.ui.replayTitle.setPosition(w / 2, 76); this.ui.replaySub.setPosition(w / 2, 110);
      this.placeButton(this.buttons.choose, w / 2, h - 76, Math.min(w - 44, 320), 54, 'Choose the fixture', COLORS.coral);
      this.placeButton(this.buttons.continue, w / 2, h - 76, Math.min(w - 44, 320), 54, this.reactionReady ? (this.reactionSpeaker === 0 ? 'Hear Pip' : 'Keep building') : 'Revealing...', COLORS.coral);
      this.placeButton(this.buttons.next, w / 2, h - 76, Math.min(w - 44, 320), 54, this.roomIndex === 1 ? 'See the full reveal' : 'Enter the next room', COLORS.coral);
      this.placeButton(this.buttons.newRun, w / 2, h - 74, Math.min(w - 44, 320), 52, 'Start a new run', COLORS.coral);
      this.placeButton(this.buttons.replay, w / 2, h - 136, Math.min(w - 44, 320), 52, 'Replay a level', COLORS.coral);
      this.placeButton(this.buttons.back, w / 2, h - 74, Math.min(w - 44, 320), 52, 'Back to rooms', COLORS.board);
      this.placeButton(this.buttons.decorate, w / 2, h - 76, Math.min(w - 44, 320), 52, this.pendingStyle >= 0 && this.comfortFocus >= 0 ? 'Place keepsake and reveal' : 'Reveal fixture', COLORS.coral);
    }

    render() {
      if (!this.w) return;
      setTextIfChanged(this.ui.context, this.mode === 'replay' ? 'REPLAY' : this.mode === 'level' ? 'ROOM ' + (this.roomIndex + 1) : this.mode === 'title' ? '12 LEVELS' : '');
      setColorIfChanged(this.ui.context, this.mode === 'replay' ? COLORS.accent : COLORS.brass);
      if (this.mode === 'level' || this.mode === 'replay') this.renderGameplay();
      if (this.mode === 'choice') this.renderChoice();
      if (this.mode === 'reaction') this.renderReaction();
      if (this.mode === 'clear' || this.mode === 'fail') this.renderResult();
      if (this.mode === 'roomComplete') this.renderRoomComplete();
      if (this.mode === 'complete') this.renderComplete();
      if (this.mode === 'replaySelect') this.renderReplaySelect();
      if (this.mode === 'title') this.renderTitle();
      this.renderRoomMotion();
      this.renderCurtain();
    }

    renderRoomMotion() {
      if (!this.roomGlowG || !this.w) return;
      this.roomGlowG.clear();
      const roomMode = this.mode === 'title' || this.mode === 'choice' || this.mode === 'reaction' || this.mode === 'complete';
      if (!roomMode) return;
      const pulse = 0.5 + 0.5 * Math.sin(this.roomMotionT * 1.4);
      this.roomViews.forEach(function (view, index) { if (view && view.visible) view.setScale(1 + Math.sin(this.roomMotionT * 0.9 + index) * 0.002 + (this.buildPulse > 0 ? 0.004 : 0)); }.bind(this));
      const x0 = this.mode === 'complete' ? this.w * 0.14 : this.w * 0.16;
      const y0 = this.mode === 'complete' ? 350 : 372;
      this.roomGlowG.fillStyle(COLORS.brass, 0.05 + pulse * 0.04); this.roomGlowG.fillCircle(x0, y0, 40 + pulse * 5);
      if (this.mode === 'choice' || this.mode === 'reaction') {
        const fixture = this.fixtureRect(this.choiceSlot, this.w - 32, Math.min(326, this.h - 355));
        const gx = 16 + fixture.x + fixture.w * 0.5; const gy = 122 + fixture.y + fixture.h * 0.45;
        this.roomGlowG.fillStyle(this.comfortPulse > 0 ? COLORS.accent : this.buildPulse > 0 ? COLORS.brass : COLORS.coral, 0.08 + pulse * 0.06); this.roomGlowG.fillCircle(gx, gy, 28 + pulse * 6 + (this.comfortPulse > 0 ? 5 : 0));
        this.roomGlowG.lineStyle(2, COLORS.brass, 0.45 + pulse * 0.2); this.roomGlowG.strokeCircle(gx, gy, 20 + pulse * 3);
      }
      if (this.mode === 'complete') { this.roomGlowG.fillStyle(COLORS.brass, 0.06 + pulse * 0.03); this.roomGlowG.fillCircle(this.w * 0.78, y0, 46 + pulse * 5); }
    }

    renderTitle() {
      const roomOne = this.progress.choices[0].filter(function (v) { return v >= 0; }).length;
      const roomTwo = this.progress.choices[1].filter(function (v) { return v >= 0; }).length;
      setTextIfChanged(this.ui.title, 'A MATCH-MADE HOME'); setTextIfChanged(this.ui.subtitle, '12 seeded levels. Two rooms. Six choices each.');
      setTextIfChanged(this.ui.roomProgress, 'Cinderwick ' + roomOne + ' / 6   ·   Mossbell ' + (roomTwo ? roomTwo + ' / 6' : 'LOCKED'));
      this.buttons.start.container.setVisible(true);
      if (this.roomViews[0]) this.roomViews[0].setPosition(16, 140);
    }

    renderGameplay() {
      const config = LEVELS[this.levelIndex] || LEVELS[0];
      setTextIfChanged(this.ui.level, (this.replay ? 'REPLAY ' : 'LEVEL ') + String(this.levelIndex + 1).padStart(2, '0') + ' / 12');
      setTextIfChanged(this.ui.moves, '♥ ' + String(Math.max(0, this.moves)).padStart(2, '0'));
      setColorIfChanged(this.ui.moves, this.moves <= 4 ? COLORS.coral : COLORS.brass);
      setTextIfChanged(this.ui.goal, '✦ ' + this.score + ' / ' + config.goal);
      setTextIfChanged(this.ui.best, 'BEST ' + (this.progress.best[this.levelIndex] || 0));
      let hint = '↻ retry   ? hint';
      if (this.levelIndex === 0 && this.tutorialT > 0) {
        if (this.score <= 0 && !this.selectedCell) hint = 'Match 3: tap a tile, then a neighbor.';
        else if (this.score <= 0 && this.selectedCell) hint = 'Choose a neighboring tile. A brass arrow previews the swap.';
        else if (this.bestStreak < 2) hint = 'Three matching tiles clear. Four makes a powered row or column.';
        else hint = 'Reach the goal, then choose a mood and place a keepsake.';
      }
      this.ui.hint.setPosition(20, 105).setOrigin(0, 0.5); setTextIfChanged(this.ui.hint, hint); this.ui.hint.setAlpha(this.tutorialT > 0 ? clamp(this.tutorialT / 1.5, 0.18, 1) : 0.7);
      const revealed = this.progress.choices[this.roomIndex].filter(function (v) { return v >= 0; }).length;
      setTextIfChanged(this.ui.roomProgress, ROOMS[this.roomIndex].short + '  ' + revealed + ' / 6 fixtures');
      setTextIfChanged(this.ui.bottom, this.replay ? 'Personal best chase' : 'No timers  •  no lives');
      this.ui.bottom.setAlpha(0.75);
      this.renderBoard();
      if (this.chipT > 0) { setTextIfChanged(this.ui.chip, this.chipText || ''); this.ui.chip.setAlpha(clamp(this.chipT / 0.25, 0, 1)); } else this.ui.chip.setAlpha(0);
      this.buttons.hint.container.setVisible(true); this.buttons.retry.container.setVisible(true);
    }

    renderBoard() {
      const r = this.boardRect; const pulse = this.boardPulse > 0 ? Math.sin((this.boardPulse / 0.3) * Math.PI) * 0.06 : 0;
      for (let i = 0; i < CELLS; i += 1) {
        const value = this.values[i]; const view = this.tileViews[i]; const marker = this.markerViews[i];
        if (value == null || value < 0 || value >= TILE_DEFS.length) { view.setVisible(false); marker.setVisible(false); continue; }
        const c = cellCoord(i); const x = r.x + c.col * r.cell + r.cell * 0.5; const y = r.y + c.row * r.cell + r.cell * 0.5;
        let dx = 0; let dy = this.settleT > 0 ? Math.sin((this.settleT / 0.24) * Math.PI) * r.cell * 0.08 : 0;
        if (this.swapAnim) {
          const t = clamp(this.swapAnim.t / 0.18, 0, 1);
          if (i === this.swapAnim.ai) { dx = (this.swapAnim.b.col - this.swapAnim.a.col) * r.cell * t; dy = (this.swapAnim.b.row - this.swapAnim.a.row) * r.cell * t; }
          if (i === this.swapAnim.bi) { dx = (this.swapAnim.a.col - this.swapAnim.b.col) * r.cell * t; dy = (this.swapAnim.a.row - this.swapAnim.b.row) * r.cell * t; }
        }
        view.setTexture('hh-tile-' + value).setPosition(x + dx, y + dy).setScale((r.cell - 6) / 64 * (1 + pulse + this.swapPulse * 0.14));
        view.setAlpha(1); view.setVisible(true);
        const special = this.specials[i];
        setTextIfChanged(marker, special === 'row' ? '↔' : special === 'col' ? '↕' : special === 'wild' ? '✹' : '');
        marker.setPosition(x + dx, y + dy).setScale(r.cell / 64).setVisible(!!special);
      }
      this.selectionG.clear();
      const active = this.preview;
      if (this.selectedCell) {
        const x = r.x + this.selectedCell.col * r.cell + r.cell / 2; const y = r.y + this.selectedCell.row * r.cell + r.cell / 2;
        this.selectionG.lineStyle(4, COLORS.brass, 1); this.selectionG.strokeRoundedRect(x - r.cell * 0.43, y - r.cell * 0.43, r.cell * 0.86, r.cell * 0.86, 12);
      }
      if (active) {
        const a = r.x + active.a.col * r.cell + r.cell / 2; const b = r.x + active.b.col * r.cell + r.cell / 2;
        const ay = r.y + active.a.row * r.cell + r.cell / 2; const by = r.y + active.b.row * r.cell + r.cell / 2;
        const previewColor = active.legal ? COLORS.paper : COLORS.coral;
        this.selectionG.lineStyle(3, previewColor, 0.95); this.selectionG.strokeRoundedRect(b - r.cell * 0.4, by - r.cell * 0.4, r.cell * 0.8, r.cell * 0.8, 11);
        this.selectionG.lineBetween(a, ay, b, by); this.selectionG.fillStyle(previewColor, 1);
        const dirX = active.b.col > active.a.col ? -12 : active.b.col < active.a.col ? 12 : 0; const dirY = active.b.row > active.a.row ? -12 : active.b.row < active.a.row ? 12 : 0;
        this.selectionG.fillTriangle(b, by - 8, b + dirX + (dirY ? 0 : 4), by - 3 + dirY, b + dirX - (dirY ? 0 : 4), by + 3 + dirY);
        if (!active.legal) { this.selectionG.lineStyle(2, COLORS.coral, 0.8); this.selectionG.lineBetween(b - r.cell * 0.22, by - r.cell * 0.22, b + r.cell * 0.22, by + r.cell * 0.22); this.selectionG.lineBetween(b + r.cell * 0.22, by - r.cell * 0.22, b - r.cell * 0.22, by + r.cell * 0.22); }
      }
      const curX = r.x + this.cursor.col * r.cell + r.cell / 2; const curY = r.y + this.cursor.row * r.cell + r.cell / 2;
      this.selectionG.lineStyle(2, COLORS.paper, 0.78); this.selectionG.strokeRoundedRect(curX - r.cell * 0.34, curY - r.cell * 0.34, r.cell * 0.68, r.cell * 0.68, 10);
    }

    renderChoice() {
      setTextIfChanged(this.ui.choiceTitle, ROOMS[this.roomIndex].short.toUpperCase());
      setTextIfChanged(this.ui.choiceSub, 'Choose a mood, then place a keepsake near the fixture');
      setTextIfChanged(this.ui.roomName, ROOMS[this.roomIndex].name);
      const revealed = this.progress.choices[this.roomIndex].filter(function (v) { return v >= 0; }).length;
      setTextIfChanged(this.ui.roomProgress, ROOMS[this.roomIndex].short + '  ' + revealed + ' / 6 fixtures revealed');
      setTextIfChanged(this.ui.comfortTitle, 'KEEPSAKES  ·  place one in a nearby fixture slot');
      setColorIfChanged(this.ui.choiceTitle, COLORS.paper); setColorIfChanged(this.ui.choiceSub, COLORS.paperSoft);
      if (this.roomViews[0]) this.roomViews[0].setPosition(16, 148);
      this.choiceButtons.forEach(function (button, index) { button.bg.setFillStyle(STYLES[index].color, this.pendingStyle === index ? 1 : 0.72); setColorIfChanged(button.label, COLORS.ink); setTextIfChanged(button.label, STYLES[index].name + '\n' + STYLES[index].sub); button.label.setAlign('center'); }.bind(this));
      this.comfortButtons.forEach(function (button, index) {
        const available = this.progress.comfortInventory.indexOf(index) >= 0;
        button.bg.setFillStyle(COMFORT_ITEMS[index].color, available ? (this.comfortFocus === index ? 1 : 0.7) : 0.22);
        setColorIfChanged(button.label, available ? COLORS.ink : COLORS.paperSoft);
        setTextIfChanged(button.label, available ? COMFORT_ITEMS[index].mark : '·');
        button.label.setAlign('center'); button.container.setAlpha(available ? 1 : 0.48); button.enabled = available;
      }.bind(this));
      const existing = this.progress.homeItems[this.roomIndex][this.choiceSlot] >= 0;
      setTextIfChanged(this.buttons.decorate.label, existing ? 'Reveal fixture' : this.comfortFocus >= 0 ? 'Place keepsake and reveal' : 'Choose a keepsake');
    }

    renderReaction() {
      setTextIfChanged(this.ui.roomName, ROOMS[this.roomIndex].name + '  •  ' + FIXTURES[this.choiceSlot]);
      const speaker = this.reactionSpeaker === 0 ? 'MARN' : 'PIP';
      const lineSet = REACTIONS[this.roomIndex] || REACTIONS[0];
      const lines = lineSet[this.reactionSpeaker] || lineSet[0];
      const style = this.selectedChoice();
      setTextIfChanged(this.ui.reactionSpeaker, speaker + '  ' + (style >= 0 ? STYLES[style].name : ''));
      setTextIfChanged(this.ui.reactionLine, this.revealT < 0.86 ? 'The room is finding its new shape...' : lines[style >= 0 ? style : 0]);
      setColorIfChanged(this.ui.reactionSpeaker, COLORS.paper); setColorIfChanged(this.ui.reactionLine, COLORS.paperSoft);
      setTextIfChanged(this.ui.chip, this.revealT < 0.86 ? 'room reveal' : (this.reactionSpeaker === 0 ? 'Marn noticed' : 'Pip noticed'));
      this.ui.chip.setAlpha(this.revealT < 0.86 ? 0.55 : 0.9);
      this.ui.reactionSpeaker.setPosition(24, this.h * 0.59); this.ui.reactionLine.setPosition(24, this.h * 0.65);
      this.ui.reactionLine.setWordWrapWidth(this.w - 48);
      this.positionModeUi();
    }

    renderResult() {
      this.dimOverlay(0.72);
      const title = this.mode === 'fail' ? 'OUT OF MOVES' : 'LEVEL CLEAR';
      setTextIfChanged(this.ui.clearTitle, title);
      const found = !this.replay && this.lastCollectedItem >= 0 ? '  ·  Found ' + COMFORT_ITEMS[this.lastCollectedItem].name : '';
      setTextIfChanged(this.ui.clearScore, this.mode === 'fail' ? 'The room is still waiting on a spark.' : 'Score ' + this.score + '  ·  ' + (this.replay ? 'personal best ' + (this.progress.best[this.levelIndex] || 0) : 'best ' + (this.progress.best[this.levelIndex] || 0)) + found);
      setTextIfChanged(this.ui.clearMedal, this.mode === 'clear' ? this.medalLabel(this.currentMedal || 1) : 'Retry is instant');
      if (this.mode === 'clear') { this.buttons.choose.container.setVisible(true); this.placeButton(this.buttons.choose, this.w / 2, this.h - 76, Math.min(this.w - 44, 320), 54, this.replay ? 'Replay this level' : 'Choose the fixture', COLORS.coral); } else this.buttons.retry.container.setVisible(true);
      if (this.mode === 'fail') this.buttons.newRun.container.setVisible(true);
    }

    renderRoomComplete() {
      this.dimOverlay(0.74); setTextIfChanged(this.ui.clearTitle, ROOMS[this.roomIndex].short.toUpperCase() + ' COMPLETE'); setTextIfChanged(this.ui.clearScore, 'Six fixtures, six points of view.'); setTextIfChanged(this.ui.clearMedal, '✦  ROOM REVEALED  ✦');
      this.buttons.next.container.setVisible(true);
    }

    renderComplete() {
      this.dimOverlay(0.18); setTextIfChanged(this.ui.completeTitle, 'A HOME WITH OPINIONS'); setTextIfChanged(this.ui.completeSub, 'Two rooms, twelve choices, one very personal best.');
      this.buttons.replay.container.setVisible(true); this.buttons.newRun.container.setVisible(true);
      this.buttons.newRun.container.setPosition(this.w / 2, this.h - 74);
      this.buttons.replay.container.setPosition(this.w / 2, this.h - 136);
    }

    renderReplaySelect() {
      this.dimOverlay(0.42); setTextIfChanged(this.ui.replayTitle, 'REPLAY A FINISHED LEVEL'); setTextIfChanged(this.ui.replaySub, 'Gold is a chase, not a gate.');
      this.replayButtons.forEach(function (button, index) { if (this.progress.completed[index]) { const medal = this.progress.medals[index] > 0 ? '  ' + '★'.repeat(this.progress.medals[index]) : ''; setTextIfChanged(button.label, String(index + 1) + medal); } }.bind(this));
    }

    renderCurtain() {
      this.curtainG.clear();
      if (this.mode === 'clear' || this.mode === 'fail' || this.mode === 'roomComplete' || this.mode === 'replaySelect') this.dimOverlay(this.mode === 'replaySelect' ? 0.42 : 0.72);
      if (this.mode === 'complete') { this.curtainG.fillStyle(COLORS.ink, 0.22); this.curtainG.fillRect(0, 0, this.w, this.h); }
      if (this.mode === 'complete') { this.curtainG.fillStyle(COLORS.brass, 0.08); this.curtainG.fillCircle(this.w * 0.5, 380, 150 + this.finalRevealT * 50); }
      if (this.mode === 'reaction') {
        const t = clamp(this.revealT, 0, 1); const ease = t * t * (3 - 2 * t);
        this.curtainG.fillStyle(0x26344a, 0.96); this.curtainG.fillRect(0, 0, this.w * (1 - ease), this.h); this.curtainG.fillRect(this.w - this.w * (1 - ease), 0, this.w * (1 - ease), this.h);
        if (this.revealT < 0.9) { this.curtainG.lineStyle(2, COLORS.brass, 0.8); this.curtainG.lineBetween(this.w * ease, 0, this.w * ease, this.h); this.curtainG.lineBetween(this.w * (1 - ease), 0, this.w * (1 - ease), this.h); }
      }
      if ((this.mode === 'clear' || this.mode === 'fail' || this.mode === 'roomComplete') && this.fx && kit.juice.enabled) this.fx.reward.setVisible(true);
    }

    dimOverlay(alpha) {
      this.curtainG.fillStyle(COLORS.ink, alpha); this.curtainG.fillRect(0, 0, this.w, this.h);
      this.curtainG.fillStyle(COLORS.paper, 0.96); this.curtainG.fillRoundedRect(22, this.h * 0.29, this.w - 44, 250, 24);
      this.curtainG.lineStyle(2, COLORS.brass, 0.9); this.curtainG.strokeRoundedRect(22, this.h * 0.29, this.w - 44, 250, 24);
    }

    hitTest(x, y) {
      if (this.inRect(x, y, this.buttons.settings.rect)) return { id: 'settings' };
      if (this.mode === 'title' && this.inRect(x, y, this.buttons.start.rect)) return { id: 'start' };
      if (this.mode === 'level' || this.mode === 'replay') {
        if (this.inRect(x, y, this.buttons.hint.rect)) return { id: 'hint' };
        if (this.inRect(x, y, this.buttons.retry.rect)) return { id: 'retry' };
        const cell = this.cellFromPoint(x, y); if (cell) return { kind: 'board', cell };
      }
      if (this.mode === 'clear' && this.inRect(x, y, this.buttons.choose.rect)) return { id: 'choose' };
      if (this.mode === 'fail') { if (this.inRect(x, y, this.buttons.retry.rect)) return { id: 'retry' }; if (this.inRect(x, y, this.buttons.newRun.rect)) return { id: 'new' }; }
      if (this.mode === 'choice') {
        for (let i = 0; i < 3; i += 1) if (this.inRect(x, y, this.choiceButtons[i].rect)) return { id: 'choice-' + i, style: i };
        for (let i = 0; i < COMFORT_ITEMS.length; i += 1) if (this.comfortButtons[i].enabled && this.inRect(x, y, this.comfortButtons[i].rect)) return { id: 'comfort-' + i, item: i };
        if (this.inRect(x, y, this.buttons.decorate.rect)) return { id: 'decorate' };
      }
      if (this.mode === 'reaction' && this.inRect(x, y, this.buttons.continue.rect)) return { id: 'continue' };
      if (this.mode === 'roomComplete' && this.inRect(x, y, this.buttons.next.rect)) return { id: 'next' };
      if (this.mode === 'complete') { if (this.inRect(x, y, this.buttons.replay.rect)) return { id: 'replay' }; if (this.inRect(x, y, this.buttons.newRun.rect)) return { id: 'new' }; }
      if (this.mode === 'replaySelect') { for (let i = 0; i < 12; i += 1) if (this.progress.completed[i] && this.inRect(x, y, this.replayButtons[i].rect)) return { id: 'replay-' + i, level: i }; if (this.inRect(x, y, this.buttons.back.rect)) return { id: 'back' }; }
      return null;
    }

    inRect(x, y, rect) { return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h; }
    cellFromPoint(x, y) { const r = this.boardRect; if (!r || x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) return null; const col = Math.floor((x - r.x) / r.cell); const row = Math.floor((y - r.y) / r.cell); return { col: col, row: row }; }

    activateButton(id, style) {
      if (id === 'start') { kit.audio.sfx('ui-confirm'); this.startRun(); }
      else if (id === 'retry') this.restartLevel();
      else if (id === 'hint') this.useHint();
      else if (id === 'settings') { kit.audio.sfx('tap'); kit.openSettings(); }
      else if (id === 'new') this.newRun();
      else if (id === 'choose') { if (this.replay) this.restartLevel(); else this.openChoice(); }
      else if (id === 'decorate') { if (this.progress.homeItems[this.roomIndex][this.choiceSlot] < 0 && this.comfortFocus >= 0) this.placeComfort(this.comfortFocus); if (this.progress.homeItems[this.roomIndex][this.choiceSlot] >= 0 || this.progress.comfortInventory.length === 0) this.commitChoice(this.pendingStyle); }
      else if (id.indexOf('comfort-') === 0) this.selectComfort(Number.isInteger(style) ? style : Number(id.slice(8)));
      else if (id === 'continue') this.advanceReaction();
      else if (id === 'next') this.advanceRoomComplete();
      else if (id === 'replay') this.setMode('replaySelect');
      else if (id === 'back') this.setMode('complete');
      else if (id.indexOf('choice-') === 0) this.selectStyle(Number.isInteger(style) ? style : Number(id.slice(7)));
      else if (id.indexOf('replay-') === 0) this.startReplay(Number.isInteger(style) ? style : Number(id.slice(7)));
    }

    startRun() {
      const firstIncomplete = this.progress.completed.findIndex(function (value) { return !value; });
      const index = firstIncomplete >= 0 ? firstIncomplete : 0;
      this.loadLevel(index, false);
    }

    newRun() {
      this.progress = sanitizeSave(SAVE_FALLBACK); kit.save.set(this.progress); this.replay = false; this.loadLevel(0, false); kit.audio.sfx('ui-confirm');
    }

    restartLevel() {
      if (this.mode !== 'level' && this.mode !== 'replay' && this.mode !== 'fail') return;
      kit.restart();
    }

    restartLevelDirect() {
      if (this.mode !== 'level' && this.mode !== 'replay' && this.mode !== 'fail') return;
      this.loadLevel(this.levelIndex, this.replay);
      kit.audio.sfx('ui-confirm');
    }

    loadLevel(index, replay) {
      this.levelIndex = clamp(Number.isFinite(index) ? Math.floor(index) : 0, 0, 11);
      this.replay = !!replay;
      this.roomIndex = Math.floor(this.levelIndex / 6); this.choiceSlot = this.levelIndex % 6;
      const config = LEVELS[this.levelIndex];
      this.moves = config.moves + config.bonus; this.score = 0; this.streak = 0; this.bestStreak = 0; this.hintUsed = false; this.selectedCell = null; this.preview = null; this.cursor = { col: 3, row: 4 }; this.tutorialT = 4; this.pendingStyle = 0; this.comfortFocus = -1; this.swapAnim = null; this.settleT = 0;
      this.makeBoard(config.seed);
      for (let i = 0; i < config.drops; i += 1) this.dropFreeSpecial(i);
      this.setMode(replay ? 'replay' : 'level');
      kit.audio.music('music-board', 450);
      this.saveProgress();
      this.chipText = config.bonus > 0 || config.drops > 0 ? '✦ +' + config.bonus + ' moves   ' + config.drops + ' free special' : '';
      this.chipT = this.chipText ? 1.8 : 0;
    }

    forceLevel(value) {
      const raw = Number(value); const index = Number.isFinite(raw) ? (raw >= 1 ? Math.floor(raw) - 1 : 0) : 0;
      this.loadLevel(clamp(index, 0, 11), false);
    }

    forceRoom(value) {
      const room = clamp(Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0, 0, 1);
      this.roomIndex = room; this.choiceSlot = 0; this.choiceFocus = 0; this.setMode('choice'); this.layoutDirty = true;
    }

    selectStyle(style) {
      if (this.mode !== 'choice' || !Number.isInteger(style) || style < 0 || style >= STYLES.length) return;
      this.pendingStyle = style; this.choiceFocus = style; this.layoutDirty = true; this.setChip('Mood chosen. Place a nearby keepsake.', 1.1); kit.audio.sfx('select'); this.refreshPublicState();
    }

    selectComfort(item) {
      if (this.mode !== 'choice' || !Number.isInteger(item) || this.progress.comfortInventory.indexOf(item) < 0) return;
      this.comfortFocus = item; this.layoutDirty = true; this.setChip(COMFORT_ITEMS[item].name + ' selected. Check the nearby-slot rule.', 1.2); kit.audio.sfx('select');
    }

    comfortAllowed(itemIndex, roomIndex, slot) {
      const item = COMFORT_ITEMS[itemIndex];
      return !!(item && item.rooms.indexOf(roomIndex) >= 0 && item.slots.some(function (preferred) { return Math.abs(preferred - slot) <= 1; }));
    }

    placeComfort(itemIndex) {
      if (this.mode !== 'choice' || this.progress.comfortInventory.indexOf(itemIndex) < 0) return false;
      if (!this.comfortAllowed(itemIndex, this.roomIndex, this.choiceSlot)) { this.setChip('That keepsake needs a nearby fixture slot.', 1.2); kit.audio.sfx('invalid'); return false; }
      this.progress.homeItems[this.roomIndex][this.choiceSlot] = itemIndex;
      this.progress.comfortInventory = this.progress.comfortInventory.filter(function (item) { return item !== itemIndex; });
      this.progress.comfortSeen[itemIndex] = true; this.comfortFocus = -1; this.comfortPulse = 0.8; this.buildPulse = 0.8; this.layoutDirty = true;
      kit.save.set(this.progress); kit.audio.sfx('comfort-place'); this.emitFx(this.fx.place, 10, this.w * 0.5, this.h * 0.4); this.setChip(COMFORT_ITEMS[itemIndex].name + ' settled into the room.', 1.1); this.refreshPublicState();
      return true;
    }

    collectComfortItem(roomIndex) {
      const candidate = COMFORT_ITEMS[(this.levelIndex + roomIndex) % COMFORT_ITEMS.length];
      const index = COMFORT_ITEMS.indexOf(candidate); this.progress.comfortInventory.push(index); this.progress.comfortSeen[index] = true; this.lastCollectedItem = index; this.emitFx(this.fx && this.fx.comfort, 8, this.w * 0.5, this.h * 0.45); return index;
    }

    emitFx(emitter, count, x, y) {
      if (!emitter || !kit.juice.enabled) return;
      emitter.explode(count, x, y);
    }

    saveProgress() {
      this.progress.lastLevel = this.levelIndex; this.progress.totalScore = Math.max(this.progress.totalScore, this.score); kit.save.set(this.progress); this.refreshPublicState();
    }

    refreshPublicState() {
      publicState.mode = this.mode; publicState.level = this.levelIndex + 1; publicState.moves = this.moves; publicState.choices = cloneChoices(this.progress ? this.progress.choices : null); publicState.best = this.progress ? this.progress.best.slice() : Array(12).fill(0); publicState.medals = this.progress ? this.progress.medals.slice() : Array(12).fill(0); publicState.replayLevel = this.replay ? this.levelIndex + 1 : null; publicState.reducedMotion = !kit.juice.enabled; publicState.comfortInventory = this.progress ? this.progress.comfortInventory.slice() : []; publicState.homeItems = this.progress ? cloneHomeItems(this.progress.homeItems) : cloneHomeItems(null);
      publicState.rooms = ROOMS.map(function (room, index) { return { name: room.name, short: room.short, revealed: this.progress ? this.progress.choices[index].filter(function (v) { return v >= 0; }).length : 0, complete: this.progress ? this.progress.choices[index].every(function (v) { return v >= 0; }) : false }; }, this);
      this.announce(this.accessibleSummary());
    }

    accessibleSummary() {
      if (this.mode === 'title') return 'Hearth and Halls title. ' + this.progress.completed.filter(Boolean).length + ' of 12 levels complete. Press Enter to begin building.';
      if (this.mode === 'level' || this.mode === 'replay') return 'Level ' + (this.levelIndex + 1) + '. ' + this.moves + ' moves left. Score ' + this.score + ' of ' + LEVELS[this.levelIndex].goal + '. ' + (this.selectedCell ? 'Tile selected. Choose a neighboring tile.' : 'Choose a tile.');
      if (this.mode === 'choice') return ROOMS[this.roomIndex].name + '. ' + (this.progress.choices[this.roomIndex].filter(function (v) { return v >= 0; }).length) + ' of 6 fixtures revealed. Choose a mood and place a keepsake.';
      if (this.mode === 'reaction') return 'Fixture reveal. ' + (this.reactionReady ? 'Press Continue for the character reactions.' : 'The room is revealing.');
      if (this.mode === 'clear') return 'Level clear. ' + this.score + ' points. A keepsake is waiting in the home inventory.';
      if (this.mode === 'fail') return 'Out of moves. Press Retry to try the level again.';
      if (this.mode === 'roomComplete') return ROOMS[this.roomIndex].name + ' complete. Six fixtures revealed.';
      if (this.mode === 'complete') return 'Both rooms complete. Press Replay to chase a personal best.';
      if (this.mode === 'replaySelect') return 'Replay select. Choose a finished level.';
      return 'Hearth and Halls.';
    }

    announce(text) {
      if (!this.srStatus || !text || text === this.lastSr) return;
      this.lastSr = text; this.srStatus.textContent = text;
    }

    setChip(text, seconds) { this.chipText = text; this.chipT = seconds == null ? 0.9 : seconds; }

    setPreview(a, b) {
      if (!a || !b || !adjacent(a, b)) { this.preview = null; return; }
      this.preview = { a: { col: a.col, row: a.row }, b: { col: b.col, row: b.row }, legal: this.isLegalSwap(a, b) };
      this.setChip(this.preview.legal ? '✓ match preview' : '× no match', 0.65);
    }

    firstLegalPreview(cell) {
      const candidates = [{ col: cell.col + 1, row: cell.row }, { col: cell.col - 1, row: cell.row }, { col: cell.col, row: cell.row + 1 }, { col: cell.col, row: cell.row - 1 }];
      for (let i = 0; i < candidates.length; i += 1) if (candidates[i].col >= 0 && candidates[i].col < COLS && candidates[i].row >= 0 && candidates[i].row < ROWS && this.isLegalSwap(cell, candidates[i])) return { a: cell, b: candidates[i], legal: true };
      return null;
    }

    tapCell(cell) {
      if (!cell || (this.mode !== 'level' && this.mode !== 'replay') || this.moves <= 0 || this.boardPulse > 0) return;
      this.cursor = { col: cell.col, row: cell.row };
      if (!this.selectedCell) { this.selectedCell = { col: cell.col, row: cell.row }; this.preview = this.firstLegalPreview(this.selectedCell); this.setChip('Choose a neighbor', 0.8); kit.audio.sfx('select'); return; }
      if (this.selectedCell.col === cell.col && this.selectedCell.row === cell.row) { this.selectedCell = null; this.preview = null; return; }
      if (adjacent(this.selectedCell, cell)) this.trySwap(this.selectedCell, cell); else { this.selectedCell = { col: cell.col, row: cell.row }; this.preview = this.firstLegalPreview(this.selectedCell); }
    }

    useHint() {
      if (this.mode !== 'level' && this.mode !== 'replay') return;
      const move = this.findLegalMove(); if (!move) return;
      this.hintUsed = true; this.selectedCell = move.a; this.preview = { a: move.a, b: move.b, legal: true }; this.cursor = move.a; this.setChip('hint shown', 1); kit.audio.sfx('hint');
    }

    trySwap(a, b) {
      if ((this.mode !== 'level' && this.mode !== 'replay') || this.moves <= 0 || !adjacent(a, b) || this.boardPulse > 0) return;
      const ai = cellIndex(a.col, a.row); const bi = cellIndex(b.col, b.row);
      const specialMove = !!(this.specials[ai] || this.specials[bi]);
      const legal = specialMove || this.isLegalSwap(a, b);
      if (!legal) { this.moves = Math.max(0, this.moves - 1); this.setChip(this.moves > 0 ? 'No match. Try another neighbor.' : 'No moves left', 1); kit.audio.sfx('invalid'); if (this.moves === 0) this.setMode('fail'); return; }
      const valueA = this.values[ai]; const valueB = this.values[bi]; const specialA = this.specials[ai]; const specialB = this.specials[bi];
      this.values[ai] = valueB; this.values[bi] = valueA; this.specials[ai] = specialB; this.specials[bi] = specialA; this.moves = Math.max(0, this.moves - 1); this.swapPulse = 0.18; this.boardPulse = 0.28; this.selectedCell = null; this.preview = null;
      this.swapAnim = { a: { col: a.col, row: a.row }, b: { col: b.col, row: b.row }, ai: ai, bi: bi, t: 0.18 }; this.settleT = 0.24;
      kit.audio.sfx('swap-tick');
      const extra = specialMove ? this.specialCells(ai, bi) : null;
      const result = this.resolveMatches(extra);
      if (result.cleared > 0) {
        this.streak = result.chain > 1 ? this.streak + 1 : 1; this.bestStreak = Math.max(this.bestStreak, this.streak); this.setChip(result.chain > 1 ? '✦ streak x' + this.streak : '+' + result.cleared + ' sparks', 0.9); kit.audio.sfx(result.chain > 1 ? 'cascade' : 'match-chime');
        this.emitFx(this.fx.clear, Math.min(16, result.cleared), this.boardRect.x + this.boardRect.w * 0.5, this.boardRect.y + this.boardRect.h * 0.5);
        if (result.chain > 1) this.emitFx(this.fx.streak, Math.min(10, result.chain * 3), this.boardRect.x + this.boardRect.w * 0.5, this.boardRect.y + this.boardRect.h * 0.65);
        if (kit.juice.enabled && result.chain > 2) kit.juice.shake(3, 90);
      } else this.streak = 0;
      if (this.score >= LEVELS[this.levelIndex].goal) this.finishLevel(); else if (this.moves <= 0) this.setMode('fail'); else if (!this.findLegalMove()) { this.shuffleBoard(); this.setChip('Fresh rhythm', 0.9); }
      this.saveProgress();
    }

    resolveMatches(extra) {
      let chain = 0; let cleared = 0; let matches = extra || this.findMatches();
      while (matches.size > 0 && chain < 8) {
        chain += 1; const expanded = new Set(matches); this.expandSpecials(expanded);
        const list = Array.from(expanded); let keep = null;
        if (list.length >= 5) keep = { index: list[0], special: 'wild', value: this.values[list[0]] };
        else if (list.length >= 4) { const point = cellCoord(list[0]); const sameRow = list.filter(function (i) { return Math.floor(i / COLS) === point.row; }).length >= 4; keep = { index: list[0], special: sameRow ? 'row' : 'col', value: this.values[list[0]] }; }
        list.forEach(function (index) { if (!keep || index !== keep.index) { this.values[index] = null; this.specials[index] = null; } }.bind(this));
        if (keep) { this.values[keep.index] = keep.value; this.specials[keep.index] = keep.special; }
        cleared += list.length; this.score += list.length * (keep ? 14 : 18) * chain;
        this.collapseBoard(); matches = this.findMatches();
      }
      return { chain: chain, cleared: cleared };
    }

    expandSpecials(set) {
      const original = Array.from(set);
      original.forEach(function (index) {
        const special = this.specials[index]; if (!special) return; const c = cellCoord(index);
        if (special === 'row') for (let col = 0; col < COLS; col += 1) set.add(cellIndex(col, c.row));
        if (special === 'col') for (let row = 0; row < ROWS; row += 1) set.add(cellIndex(c.col, row));
        if (special === 'wild') { const value = this.values[index]; for (let i = 0; i < CELLS; i += 1) if (this.values[i] === value) set.add(i); }
      }, this);
    }

    specialCells(a, b) {
      const set = new Set([a, b]); this.expandSpecials(set); return set;
    }

    collapseBoard() {
      for (let col = 0; col < COLS; col += 1) {
        let write = ROWS - 1;
        for (let row = ROWS - 1; row >= 0; row -= 1) { const from = cellIndex(col, row); if (this.values[from] != null) { const to = cellIndex(col, write); this.values[to] = this.values[from]; this.specials[to] = this.specials[from]; if (to !== from) { this.values[from] = null; this.specials[from] = null; } write -= 1; } }
        while (write >= 0) { const index = cellIndex(col, write); this.values[index] = this.randomTile(); this.specials[index] = null; write -= 1; }
      }
    }

    findMatches() {
      const set = new Set();
      for (let row = 0; row < ROWS; row += 1) { let start = 0; while (start < COLS) { const value = this.values[cellIndex(start, row)]; let end = start + 1; while (end < COLS && value != null && this.values[cellIndex(end, row)] === value) end += 1; if (value != null && end - start >= 3) for (let col = start; col < end; col += 1) set.add(cellIndex(col, row)); start = end; } }
      for (let col = 0; col < COLS; col += 1) { let start = 0; while (start < ROWS) { const value = this.values[cellIndex(col, start)]; let end = start + 1; while (end < ROWS && value != null && this.values[cellIndex(col, end)] === value) end += 1; if (value != null && end - start >= 3) for (let row = start; row < end; row += 1) set.add(cellIndex(col, row)); start = end; } }
      return set;
    }

    isLegalSwap(a, b) {
      const ai = cellIndex(a.col, a.row); const bi = cellIndex(b.col, b.row); const av = this.values[ai]; const bv = this.values[bi]; const as = this.specials[ai]; const bs = this.specials[bi];
      this.values[ai] = bv; this.values[bi] = av; this.specials[ai] = bs; this.specials[bi] = as; const legal = this.findMatches().size > 0; this.values[ai] = av; this.values[bi] = bv; this.specials[ai] = as; this.specials[bi] = bs; return legal;
    }

    findLegalMove() {
      for (let row = 0; row < ROWS; row += 1) for (let col = 0; col < COLS; col += 1) { const a = { col: col, row: row }; if (col < COLS - 1) { const b = { col: col + 1, row: row }; if (this.specials[cellIndex(col, row)] || this.specials[cellIndex(col + 1, row)] || this.isLegalSwap(a, b)) return { a: a, b: b }; } if (row < ROWS - 1) { const b = { col: col, row: row + 1 }; if (this.specials[cellIndex(col, row)] || this.specials[cellIndex(col, row + 1)] || this.isLegalSwap(a, b)) return { a: a, b: b }; } }
      return null;
    }

    makeBoard(seed) {
      this.rngState = seed >>> 0 || 1; this.values.fill(null); this.specials.fill(null);
      for (let row = 0; row < ROWS; row += 1) for (let col = 0; col < COLS; col += 1) { let value = this.randomTile(); let guard = 0; while (guard < 12 && ((col >= 2 && this.values[cellIndex(col - 1, row)] === value && this.values[cellIndex(col - 2, row)] === value) || (row >= 2 && this.values[cellIndex(col, row - 1)] === value && this.values[cellIndex(col, row - 2)] === value))) { value = this.randomTile(); guard += 1; } this.values[cellIndex(col, row)] = value; }
      if (!this.findLegalMove()) this.makeGuaranteedBoard();
    }

    makeGuaranteedBoard() { for (let row = 0; row < ROWS; row += 1) for (let col = 0; col < COLS; col += 1) this.values[cellIndex(col, row)] = (col * 2 + row) % TILE_DEFS.length; this.values[cellIndex(0, 0)] = 0; this.values[cellIndex(1, 0)] = 0; this.values[cellIndex(2, 0)] = 1; this.values[cellIndex(3, 0)] = 0; }
    shuffleBoard() { for (let attempt = 0; attempt < 24; attempt += 1) { for (let i = CELLS - 1; i > 0; i -= 1) { const j = Math.floor(this.random() * (i + 1)); const value = this.values[i]; this.values[i] = this.values[j]; this.values[j] = value; } if (this.findMatches().size === 0 && this.findLegalMove()) return; } this.makeGuaranteedBoard(); }
    dropFreeSpecial(seedOffset) { const start = (this.levelIndex * 17 + seedOffset * 13) % CELLS; for (let i = 0; i < CELLS; i += 1) { const index = (start + i) % CELLS; if (!this.specials[index]) { this.specials[index] = seedOffset % 2 ? 'row' : 'col'; return; } } }
    random() { let x = this.rngState; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.rngState = x >>> 0; return (this.rngState % 100000) / 100000; }
    randomTile() { return Math.floor(this.random() * TILE_DEFS.length) % TILE_DEFS.length; }

    finishLevel() {
      if (this.mode !== 'level' && this.mode !== 'replay') return;
      const medal = this.computeMedal(); const score = this.score;
      if (!this.replay) { this.progress.completed[this.levelIndex] = true; this.progress.best[this.levelIndex] = Math.max(this.progress.best[this.levelIndex] || 0, score); this.progress.medals[this.levelIndex] = Math.max(this.progress.medals[this.levelIndex] || 0, medal); this.progress.totalScore += score; this.collectComfortItem(this.roomIndex); this.saveProgress(); }
      else this.progress.best[this.levelIndex] = Math.max(this.progress.best[this.levelIndex] || 0, score);
      this.currentMedal = medal; this.setMode('clear'); kit.audio.sfx('goal'); this.emitFx(this.fx.unlock, 18, this.w / 2, this.h * 0.45); if (kit.juice.enabled) kit.juice.hitStop(70);
    }

    computeMedal() { const config = LEVELS[this.levelIndex]; if (this.moves >= config.gold && this.bestStreak >= 3 && !this.hintUsed) return 3; if (this.moves >= config.silver && this.bestStreak >= 2 && !this.hintUsed) return 2; return 1; }
    medalLabel(medal) { return medal >= 3 ? 'GOLD  ★★★' : medal === 2 ? 'SILVER  ★★' : 'BRONZE  ★'; }
    openChoice() { if (this.mode !== 'clear' || this.replay) return; this.roomIndex = Math.floor(this.levelIndex / 6); this.choiceSlot = this.levelIndex % 6; this.choiceFocus = this.progress.choices[this.roomIndex][this.choiceSlot] >= 0 ? this.progress.choices[this.roomIndex][this.choiceSlot] : 0; this.pendingStyle = this.choiceFocus; this.comfortFocus = this.progress.comfortInventory.length ? this.progress.comfortInventory[0] : -1; this.setMode('choice'); }
    selectedChoice() { const saved = this.progress.choices[this.roomIndex] && this.progress.choices[this.roomIndex][this.choiceSlot]; return saved >= 0 ? saved : this.choiceFocus; }

    commitChoice(style) {
      if (this.mode !== 'choice' || !Number.isInteger(style) || style < 0 || style > 2) return;
      if (this.progress.homeItems[this.roomIndex][this.choiceSlot] < 0 && this.progress.comfortInventory.length > 0) { this.setChip('Place a keepsake before revealing this fixture.', 1.1); return; }
      this.progress.choices[this.roomIndex][this.choiceSlot] = style; this.choiceFocus = style; this.reactionSpeaker = 0; this.revealT = 0; this.reactionReady = false; this.setMode('reaction'); this.buildPulse = 0.8; this.layoutDirty = true; kit.save.set(this.progress); kit.audio.sfx('reveal-sting'); this.emitFx(this.fx.unlock, 20, this.w / 2, this.h * 0.3); if (kit.juice.enabled) kit.juice.shake(2, 80); this.refreshPublicState();
    }

    advanceReaction() {
      if (this.mode !== 'reaction' || !this.reactionReady) return;
      if (this.reactionSpeaker === 0) { this.reactionSpeaker = 1; kit.audio.sfx('character-vocal'); return; }
      if (this.choiceSlot === 5) { this.roomComplete = true; this.collectComfortItem(this.roomIndex); this.setMode('roomComplete'); kit.audio.sfx('room-complete'); this.emitFx(this.fx.unlock, 26, this.w / 2, this.h * 0.4); }
      else { this.loadLevel(this.levelIndex + 1, false); }
    }

    advanceRoomComplete() {
      if (this.mode !== 'roomComplete') return;
      if (this.roomIndex === 0) this.loadLevel(6, false); else { this.finalRevealT = 0; this.setMode('complete'); kit.audio.sfx('reveal-sting'); this.emitFx(this.fx.unlock, 32, this.w / 2, 360); }
    }

    startReplay(index) { if (!this.progress.completed[index]) return; this.loadLevel(index, true); }

  }

  const config = {
    // Was Phaser.CANVAS. At native density this title fills up to nine times
    // the pixels it used to, and Canvas2D fill is CPU work: the identical
    // change on skyshard-vale took its load from 7.1s to never finishing
    // inside 45s. AUTO picks WebGL and hands the fill to the compositor.
    type: Phaser.AUTO,
    parent: document.getElementById('game'),
    backgroundColor: '#172541',
    render: { antialias: true, roundPixels: true, transparent: false },
    // Was Scale.RESIZE with a parent, which cannot hold a dense backing store:
    // Phaser re-derives canvas.width from the parent's CSS box every 500ms and
    // silently reverts the density. Scale.NONE sizes in device pixels and the
    // config zoom scales the canvas back down in CSS.
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: Math.round(hhCssW() * RETINA),
      height: Math.round(hhCssH() * RETINA),
      zoom: 1 / RETINA
    },
    input: { activePointers: 2 },
    scene: HearthScene
  };
  kit.loader.progress(0.62);
  const game = new Phaser.Game(config);
  // Scale.NONE does not track the window; game.scale.resize() raises the same
  // 'resize' event the scene already listens to.
  window.addEventListener('resize', function () {
    try { game.scale.resize(Math.round(hhCssW() * RETINA), Math.round(hhCssH() * RETINA)); }
    catch (e) { /* a resize must never take the title down */ }
  });
  window.__hhGame = game;
})();
