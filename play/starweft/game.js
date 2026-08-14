(() => {
  'use strict';

  const W = 390;
  const H = 844;
  const VERSION = 8;
  const WORLD_W = 1800;
  const WORLD_H = 1100;
  const TILE = 48;
  const REGION_NAMES = ['Luminous Moor', 'Saltglass Reach', 'Nightlace Canopy'];
  const REGION_TILEMAPS = [
    ['mmmmmmmmmmmmmmm', 'mmpppppppmmmmmm', 'mmpmmmmpppppmmm', 'mmppppppmpmmmmp', 'mmmmmmmmmmmmmmm'],
    ['sssssssssssssss', 'ssppppsssssssss', 'ssppwwwwppppsss', 'ssppwwwwpppssss', 'sssssssssssssss'],
    ['nnnnnnnnnnnnnnn', 'nnppppnnnnnppnn', 'nnppvppppppppnn', 'nnnnvnnnnnnnnnn', 'nnppppppppppppn'],
  ];
  const COLORS = {
    ink: 0x071421,
    deep: 0x0b1f2c,
    panel: 0x102a38,
    panel2: 0x173b47,
    line: 0x396878,
    text: '#effaf7',
    muted: '#9bbcc0',
    cyan: 0x76e5dc,
    gold: 0xffd886,
    ember: 0xff8b6b,
    tide: 0x64c9f1,
    bloom: 0xb8e879,
    danger: 0xff827e,
  };
  const ELEMENTS = {
    ember: { name: 'Ember', color: COLORS.ember },
    tide: { name: 'Tide', color: COLORS.tide },
    bloom: { name: 'Bloom', color: COLORS.bloom },
  };
  const REGIONS = [
    { id: 'moor', name: REGION_NAMES[0], x: 0, y: 0, w: 720, h: WORLD_H, music: 'exploration-theme', tile: 0x173b3b, edge: 0x2c6b63, gateText: 'Open from the Lyra Seed constellation' },
    { id: 'reach', name: REGION_NAMES[1], x: 720, y: 0, w: 540, h: WORLD_H, music: 'dungeon-theme', tile: 0x17334a, edge: 0x397a85, gateText: 'Open from the Orion Wake constellation' },
    { id: 'canopy', name: REGION_NAMES[2], x: 1260, y: 0, w: 540, h: WORLD_H, music: 'danger-theme', tile: 0x263747, edge: 0x657557, gateText: 'Open from the Veil Crown constellation' },
  ];
  const GATES = [
    { x: 720, region: 1, ability: 'tide-step', y: 550 },
    { x: 1260, region: 2, ability: 'bloom-lantern', y: 550 },
  ];
  const ABILITIES = {
    'star-sense': 'Star Sense',
    'tide-step': 'Tide Step',
    'bloom-lantern': 'Bloom Lantern',
    'weft-crown': 'Weft Crown',
  };
  const THREADS = [
    { id: 'moor-amber', region: 0, x: 214, y: 270, color: COLORS.gold, name: 'Amber thread' },
    { id: 'moor-cyan', region: 0, x: 478, y: 410, color: COLORS.cyan, name: 'Cyan thread' },
    { id: 'moor-green', region: 0, x: 570, y: 820, color: COLORS.bloom, name: 'Green thread' },
    { id: 'reach-silver', region: 1, x: 850, y: 230, color: 0xdceeff, name: 'Silver thread' },
    { id: 'reach-coral', region: 1, x: 1080, y: 760, color: COLORS.ember, name: 'Coral thread' },
    { id: 'reach-blue', region: 1, x: 1180, y: 420, color: COLORS.tide, name: 'Blue thread' },
    { id: 'canopy-lime', region: 2, x: 1400, y: 250, color: COLORS.bloom, name: 'Lime thread' },
    { id: 'canopy-violet', region: 2, x: 1640, y: 720, color: 0xc6a5ff, name: 'Violet thread' },
    { id: 'canopy-gold', region: 2, x: 1510, y: 920, color: COLORS.gold, name: 'Crown thread' },
  ];
  const CONSTELLATIONS = [
    {
      id: 'lyra', name: 'Lyra Seed', region: 0, altar: { x: 340, y: 690 },
      nodes: [{ x: 100, y: 34 }, { x: 154, y: -52 }, { x: 224, y: 16 }, { x: 278, y: 68 }],
      pattern: [0, 1, 2, 3], reward: 'tide-step', unlocks: 1,
      hint: 'Begin at the low star, then climb, cross, and descend.', threadMin: 3,
    },
    {
      id: 'orion', name: 'Orion Wake', region: 1, altar: { x: 990, y: 520 },
      nodes: [{ x: 118, y: -34 }, { x: 196, y: -72 }, { x: 254, y: 10 }, { x: 190, y: 78 }, { x: 92, y: 58 }],
      pattern: [0, 1, 2, 3, 4], reward: 'bloom-lantern', unlocks: 2,
      hint: 'Trace the wake clockwise from the small blue star.', threadMin: 6,
    },
    {
      id: 'veil', name: 'Veil Crown', region: 2, altar: { x: 1500, y: 520 },
      nodes: [{ x: 116, y: 4 }, { x: 174, y: -80 }, { x: 232, y: 4 }, { x: 206, y: 92 }, { x: 126, y: 122 }, { x: 74, y: 52 }],
      pattern: [0, 1, 2, 3, 4, 5], reward: 'weft-crown', unlocks: 2,
      hint: 'Make a crown: left peak, high peak, right peak, then the roots.', threadMin: 9,
    },
  ];
  const PROPS = [
    { type: 'reed', x: 82, y: 160 }, { type: 'tree', x: 120, y: 490 }, { type: 'rock', x: 270, y: 140 },
    { type: 'lantern', x: 420, y: 210 }, { type: 'tree', x: 605, y: 310 }, { type: 'rock', x: 170, y: 890 },
    { type: 'reed', x: 650, y: 740 }, { type: 'rock', x: 810, y: 120 }, { type: 'reed', x: 930, y: 310 },
    { type: 'rock', x: 1110, y: 160 }, { type: 'lantern', x: 1140, y: 870 }, { type: 'reed', x: 790, y: 900 },
    { type: 'tree', x: 1370, y: 170 }, { type: 'tree', x: 1730, y: 250 }, { type: 'rock', x: 1420, y: 830 },
    { type: 'tree', x: 1710, y: 880 }, { type: 'lantern', x: 1320, y: 680 }, { type: 'rock', x: 1580, y: 420 },
    { type: 'reed', x: 1770, y: 600 }, { type: 'tree', x: 1320, y: 960 },
  ];
  const OBSTACLES = PROPS.filter((prop) => prop.type === 'tree' || prop.type === 'rock').map((prop) => ({ x: prop.x - 22, y: prop.y - 22, w: 44, h: 44 }));
  const WATER = [{ x: 832, y: 72, w: 260, h: 290 }, { x: 808, y: 400, w: 178, h: 196 }, { x: 1030, y: 630, w: 176, h: 230 }];
  const VINES = [{ x: 1340, y: 360, w: 220, h: 120 }, { x: 1560, y: 520, w: 180, h: 150 }];
  const ENEMY_DATA = [
    { id: 'moth-moor', type: 'moth', region: 0, x: 560, y: 190, hp: 74, tint: 0xd38c61 },
    { id: 'thorn-moor', type: 'thorn', region: 0, x: 600, y: 920, hp: 88, tint: 0x83b77a },
    { id: 'moth-reach', type: 'moth', region: 1, x: 880, y: 700, hp: 94, tint: 0x68b9d0 },
    { id: 'thorn-reach', type: 'thorn', region: 1, x: 1160, y: 260, hp: 102, tint: 0x83ca9a },
    { id: 'moth-canopy', type: 'moth', region: 2, x: 1380, y: 790, hp: 122, tint: 0xb17ed4 },
    { id: 'thorn-canopy', type: 'thorn', region: 2, x: 1690, y: 430, hp: 136, tint: 0xd4ac67 },
  ];
  const AUDIO = {
    'exploration-theme': 'assets/theme.mp3',
    'dungeon-theme': 'assets/skill.mp3',
    'danger-theme': 'assets/ultimate.mp3',
    pickup: 'assets/victory.mp3',
    door: 'assets/victory.mp3',
    secret: 'assets/ultimate.mp3',
    footstep: 'assets/skill.mp3',
    hurt: 'assets/break.mp3',
    hit: 'assets/break.mp3',
    ui: 'assets/skill.mp3',
    constellation: 'assets/ultimate.mp3',
  };
  const reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reducedMotion = !!(reducedMotionQuery && reducedMotionQuery.matches);
  if (reducedMotionQuery) {
    const onMotionChange = (event) => { reducedMotion = !!event.matches; };
    if (typeof reducedMotionQuery.addEventListener === 'function') reducedMotionQuery.addEventListener('change', onMotionChange);
    else if (typeof reducedMotionQuery.addListener === 'function') reducedMotionQuery.addListener(onMotionChange);
  }

  const Game = { scene: null, instance: null };
  const priorProbe = window.__sw && typeof window.__sw === 'object' ? window.__sw : {};

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function isInt(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
  function distance(ax, ay, bx, by) { const dx = ax - bx; const dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function regionAt(x) { return x < REGIONS[1].x ? 0 : x < REGIONS[2].x ? 1 : 2; }
  function regionName(index) { return REGIONS[index]?.name || REGIONS[0].name; }
  function abilityName(id) { return ABILITIES[id] || id; }
  function motionEnabled() { return kit.juice.enabled && !reducedMotion; }
  function textColor(color) { return `#${color.toString(16).padStart(6, '0')}`; }

  function defaultPuzzles() {
    const result = {};
    CONSTELLATIONS.forEach((item) => { result[item.id] = { state: 'dormant', progress: 0, attempts: 0, hintUsed: false }; });
    return result;
  }
  function defaultThreads() {
    const result = {};
    THREADS.forEach((item) => { result[item.id] = false; });
    return result;
  }
  function defaultDefeated() {
    const result = {};
    ENEMY_DATA.forEach((item) => { result[item.id] = false; });
    return result;
  }
  function defaultState() {
    return {
      version: VERSION, scene: 'home', menuIndex: 0, atlasIndex: 0,
      player: { x: 280, y: 560, hp: 100, facing: 'down' },
      threads: defaultThreads(), threadCount: 0, puzzles: defaultPuzzles(), defeated: defaultDefeated(),
      unlockedRegions: [0], abilities: ['star-sense'], tutorialStep: 0, totalPlayTime: 0,
      lastRegion: 0, activePuzzle: null, puzzleCursor: 0, puzzleInput: [],
    };
  }
  function keysMatch(value, source) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.every((key) => Object.prototype.hasOwnProperty.call(source, key));
  }
  function validState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== VERSION) return false;
    if (!value.player || !Number.isFinite(value.player.x) || !Number.isFinite(value.player.y) || value.player.x < 20 || value.player.x > WORLD_W - 20 || value.player.y < 20 || value.player.y > WORLD_H - 20) return false;
    if (!Number.isFinite(value.player.hp) || value.player.hp < 0 || value.player.hp > 100) return false;
    if (!['up', 'down', 'left', 'right'].includes(value.player.facing)) return false;
    if (!keysMatch(value.threads, defaultThreads()) || !THREADS.every((item) => typeof value.threads[item.id] === 'boolean')) return false;
    const count = THREADS.reduce((total, item) => total + (value.threads[item.id] ? 1 : 0), 0);
    if (!isInt(value.threadCount, 0, THREADS.length) || value.threadCount !== count) return false;
    if (!keysMatch(value.puzzles, defaultPuzzles())) return false;
    for (const item of CONSTELLATIONS) {
      const puzzle = value.puzzles[item.id];
      if (!puzzle || !['dormant', 'discovered', 'hinted', 'failed', 'solved'].includes(puzzle.state) || !isInt(puzzle.progress, 0, item.pattern.length) || !isInt(puzzle.attempts, 0, 999) || typeof puzzle.hintUsed !== 'boolean') return false;
      if (puzzle.state === 'solved' && puzzle.progress !== item.pattern.length) return false;
    }
    if (!keysMatch(value.defeated, defaultDefeated()) || !ENEMY_DATA.every((item) => typeof value.defeated[item.id] === 'boolean')) return false;
    if (!Array.isArray(value.unlockedRegions) || value.unlockedRegions.length < 1 || value.unlockedRegions.length > REGIONS.length || !value.unlockedRegions.every((index, position) => isInt(index, 0, REGIONS.length - 1) && index === position) || new Set(value.unlockedRegions).size !== value.unlockedRegions.length || value.unlockedRegions[0] !== 0) return false;
    if (!Array.isArray(value.abilities) || value.abilities.length < 1 || !value.abilities.every((id) => Object.prototype.hasOwnProperty.call(ABILITIES, id)) || new Set(value.abilities).size !== value.abilities.length || !value.abilities.includes('star-sense')) return false;
    if (value.unlockedRegions.includes(1) && (value.puzzles.lyra.state !== 'solved' || !value.abilities.includes('tide-step'))) return false;
    if (value.unlockedRegions.includes(2) && (value.puzzles.orion.state !== 'solved' || !value.abilities.includes('bloom-lantern'))) return false;
    if (!isInt(value.menuIndex, 0, 2) || !isInt(value.atlasIndex, 0, REGIONS.length - 1) || !isInt(value.tutorialStep, 0, 4) || !Number.isFinite(value.totalPlayTime) || value.totalPlayTime < 0 || value.totalPlayTime > 1e8 || !isInt(value.lastRegion, 0, REGIONS.length - 1)) return false;
    return true;
  }
  function hydrateState(value) {
    const next = defaultState();
    if (!validState(value)) return next;
    next.player.x = clamp(value.player.x, 20, WORLD_W - 20);
    next.player.y = clamp(value.player.y, 20, WORLD_H - 20);
    next.player.hp = clamp(value.player.hp, 0, 100);
    next.player.facing = value.player.facing;
    next.menuIndex = value.menuIndex; next.atlasIndex = value.atlasIndex;
    next.threads = { ...next.threads, ...value.threads }; next.threadCount = value.threadCount;
    const puzzleDefaults = defaultPuzzles();
    next.puzzles = {};
    CONSTELLATIONS.forEach((item) => { next.puzzles[item.id] = { ...puzzleDefaults[item.id], ...value.puzzles[item.id] }; });
    next.defeated = { ...next.defeated, ...value.defeated };
    next.unlockedRegions = value.unlockedRegions.slice().sort((a, b) => a - b);
    next.abilities = value.abilities.slice(); next.tutorialStep = value.tutorialStep;
    next.totalPlayTime = value.totalPlayTime; next.lastRegion = value.lastRegion;
    return next;
  }

  const kit = GGKit.create({
    slug: 'starweft', orientation: 'portrait', validateSave: validState,
    onPause: () => { if (Game.scene) Game.scene.simPaused = true; },
    onResume: () => { if (Game.scene) Game.scene.simPaused = false; },
    onRestart: () => { if (Game.scene) Game.scene.restartToHome(); },
  });
  kit.audio.register(AUDIO);
  kit.registerPWA();

  const storedState = kit.save.get(null);
  let state = hydrateState(storedState);
  let hasSave = storedState !== null;

  function saveState() {
    const snapshot = clone(state);
    snapshot.version = VERSION;
    snapshot.scene = state.scene === 'puzzle' ? 'world' : state.scene;
    snapshot.activePuzzle = null; snapshot.puzzleCursor = 0; snapshot.puzzleInput = [];
    kit.save.set(snapshot);
    hasSave = true;
  }
  function exposeProbe() {
    Object.defineProperty(priorProbe, 'state', { configurable: true, get: () => state });
    Object.defineProperty(priorProbe, 'region', { configurable: true, get: () => regionAt(state.player.x) });
    Object.defineProperty(priorProbe, 'threads', { configurable: true, get: () => state.threadCount });
    Object.defineProperty(priorProbe, 'puzzles', { configurable: true, get: () => state.puzzles });
    priorProbe.setRegion = (index) => { if (isInt(Number(index), 0, REGIONS.length - 1)) { state.player.x = REGIONS[Number(index)].x + 120; state.scene = 'world'; if (Game.scene) Game.scene.syncScene(true); saveState(); } return state; };
    priorProbe.solve = (id) => { const puzzle = state.puzzles[id]; if (puzzle) { puzzle.state = 'solved'; puzzle.progress = CONSTELLATIONS.find((item) => item.id === id).pattern.length; unlockForPuzzle(id); saveState(); if (Game.scene) Game.scene.syncScene(true); } return state; };
    window.__sw = priorProbe;
  }
  exposeProbe();

  function setTransient(text, duration = 1.3, kind = 'notice') {
    if (!Game.scene) return;
    Game.scene.transient = { text, life: duration, max: duration, kind };
  }
  function regionUnlocked(index) { return state.unlockedRegions.includes(index); }
  function hasAbility(id) { return state.abilities.includes(id); }
  function puzzleById(id) { return CONSTELLATIONS.find((item) => item.id === id) || null; }
  function puzzleForRegion(index) { return CONSTELLATIONS.find((item) => item.region === index) || null; }
  function unlockForPuzzle(id) {
    const item = puzzleById(id);
    if (!item) return;
    if (!hasAbility(item.reward)) state.abilities.push(item.reward);
    for (let index = 0; index <= item.unlocks; index += 1) if (!regionUnlocked(index)) state.unlockedRegions.push(index);
    state.unlockedRegions.sort((a, b) => a - b);
    setTransient(`${regionName(item.unlocks)} opens. ${abilityName(item.reward)} acquired.`, 2.6, 'unlock');
    if (Game.scene) {
      Game.scene.spawnUnlockFx(REGIONS[item.unlocks].x + 22, 550);
      kit.audio.sfx('door', { volume: 0.8 });
      Game.scene.updateMusic(true);
    }
  }
  function currentConstellation() { return puzzleById(state.activePuzzle); }
  function allSolved() { return CONSTELLATIONS.every((item) => state.puzzles[item.id].state === 'solved'); }

  function drawStaticTexture(scene, key, width, height, painter) {
    const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
    painter(graphics, width, height);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }
  function drawPlayerTexture(g, direction, frame) {
    const bob = frame ? 2 : 0;
    const color = direction === 'up' ? 0x71c5d2 : direction === 'left' ? 0xb8e879 : direction === 'right' ? 0xffb66e : 0xffd886;
    g.fillStyle(0x06131c, 1); g.fillCircle(18, 23, 14);
    g.fillStyle(color, 1); g.fillCircle(18, 20 - bob, 10); g.fillRect(10, 20 - bob, 16, 12);
    g.fillStyle(0xeffaf7, 0.95);
    if (direction === 'left') g.fillRect(8, 17 - bob, 3, 3);
    else if (direction === 'right') g.fillRect(25, 17 - bob, 3, 3);
    else if (direction === 'up') g.fillRect(13, 15 - bob, 3, 3);
    else { g.fillRect(13, 17 - bob, 3, 3); g.fillRect(21, 17 - bob, 3, 3); }
    g.fillStyle(0x102a38, 1); g.fillRect(8, 33, frame ? 7 : 6, 5); g.fillRect(21, 33, frame ? 7 : 6, 5);
    g.lineStyle(2, 0xfff3c4, 0.8); g.strokeCircle(18, 23, 15);
  }
  function drawEnemyTexture(g, type, tint) {
    g.fillStyle(0x081923, 1); g.fillCircle(20, 20, 17);
    g.fillStyle(tint, 1);
    if (type === 'moth') {
      g.fillTriangle(18, 18, 1, 7, 6, 29); g.fillTriangle(22, 18, 39, 7, 34, 29); g.fillCircle(20, 21, 8);
      g.fillStyle(0xffe8ad, 1); g.fillCircle(17, 20, 2); g.fillCircle(23, 20, 2);
    } else {
      g.fillTriangle(20, 1, 38, 33, 20, 28); g.fillTriangle(20, 1, 2, 33, 20, 28); g.fillStyle(0xeffaf7, 0.85); g.fillRect(17, 18, 6, 3);
    }
    g.lineStyle(2, 0xeffaf7, 0.38); g.strokeCircle(20, 20, 18);
  }

  class StarweftScene extends Phaser.Scene {
    constructor() { super({ key: 'StarweftScene' }); }

    preload() {}

    create() {
      Game.scene = this;
      this.input.enabled = false;
      this.simPaused = false;
      this.keyLatch = new Set();
      this.padLatch = { confirm: false, back: false, up: false, down: false, left: false, right: false };
      this.gamepadConnected = false;
      this.menuReturnScene = 'home';
      this.saveClock = 0;
      this.transient = null;
      this.worldG = this.add.graphics().setDepth(0);
      this.detailG = this.add.graphics().setDepth(3);
      this.fxG = this.add.graphics().setDepth(14);
      this.uiG = this.add.graphics().setDepth(30).setScrollFactor(0);
      this.dynamicG = this.add.graphics().setDepth(8);
      this.buildTextures();
      this.playerSprite = this.add.image(state.player.x, state.player.y, 'sw-player-down-0').setDepth(12);
      this.enemyActors = ENEMY_DATA.map((item) => ({ ...item, maxHp: item.hp, cooldown: 0, kx: 0, ky: 0, phase: 0 }));
      this.enemySprites = this.enemyActors.map((item) => this.add.image(item.x, item.y, `sw-enemy-${item.type}-${item.id}`).setDepth(10));
      this.floaters = Array.from({ length: 24 }, () => ({ sprite: this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#ffffff', stroke: '#071421', strokeThickness: 4 }).setOrigin(0.5).setDepth(25), life: 0, x: 0, y: 0, dy: 0 }));
      this.collectionFx = this.makeFxPool(18);
      this.constellationFx = this.makeFxPool(24);
      this.unlockFx = this.makeFxPool(40);
      this.motionFx = this.makeFxPool(28);
      this.hitFx = this.makeFxPool(20);
      this.renderWorldBase();
      this.createTextLayers();
      this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
      this.cameras.main.startFollow(this.playerSprite, true, 0.12, 0.12);
      this.syncScene(true);
      kit.loader.progress(1); kit.loader.hide();
      kit.audio.music('exploration-theme', 450);
      if (state.scene === 'home') this.showHomeMessage();
    }

    buildTextures() {
      ['up', 'down', 'left', 'right'].forEach((direction) => [0, 1].forEach((frame) => drawStaticTexture(this, `sw-player-${direction}-${frame}`, 36, 42, (g) => drawPlayerTexture(g, direction, frame))));
      ENEMY_DATA.forEach((item) => drawStaticTexture(this, `sw-enemy-${item.type}-${item.id}`, 40, 40, (g) => drawEnemyTexture(g, item.type, item.tint)));
    }

    makeFxPool(size) { return Array.from({ length: size }, () => ({ active: false, life: 0, max: 1, x: 0, y: 0, color: COLORS.cyan, seed: 0 })); }

    createTextLayers() {
      const add = (x, y, value, size = 14, color = COLORS.text, originX = 0, originY = 0.5) => this.add.text(x, y, value, { fontFamily: 'Arial, sans-serif', fontSize: `${size}px`, fontStyle: size >= 18 ? 'bold' : 'normal', color, resolution: 2 }).setOrigin(originX, originY).setScrollFactor(0).setDepth(32);
      this.texts = {
        brand: add(20, 24, 'STARWEFT', 18, '#effaf7'),
        region: add(20, 55, '', 14, '#9bbcc0'),
        stats: add(370, 24, '', 13, '#effaf7', 1),
        objective: add(20, 95, '', 14, '#d9f4e9'),
        prompt: add(195, 800, '', 13, '#effaf7', 0.5),
        banner: add(195, 127, '', 16, '#effaf7', 0.5),
        homeTitle: add(195, 128, 'STARWEFT', 38, '#effaf7', 0.5),
        homeSub: add(195, 178, 'A small sky route, waiting to be rewoven.', 15, '#9bbcc0', 0.5),
        homeProgress: add(195, 242, '', 14, '#d9f4e9', 0.5),
        puzzleTitle: add(195, 70, '', 25, '#effaf7', 0.5),
        puzzleHelp: add(195, 110, '', 14, '#9bbcc0', 0.5),
        puzzleStatus: add(195, 700, '', 15, '#d9f4e9', 0.5),
        mapTitle: add(195, 92, 'ROUTE ATLAS', 27, '#effaf7', 0.5),
        mapHint: add(195, 735, 'Left and right choose a region. Enter returns to the route.', 12, '#9bbcc0', 0.5),
        helpTitle: add(195, 88, 'WEFTING GUIDE', 27, '#effaf7', 0.5),
        helpBody: add(195, 190, '', 14, '#d9f4e9', 0.5, 0),
      };
      this.texts.homeMenu = [
        add(195, 330, '', 19, '#effaf7', 0.5), add(195, 405, 'Route atlas', 19, '#effaf7', 0.5), add(195, 480, 'Guide', 19, '#effaf7', 0.5),
      ];
      this.texts.mapCards = REGIONS.map(() => add(195, 0, '', 15, '#effaf7', 0.5, 0));
      this.texts.homeFooter = add(195, 654, 'Arrows move  Enter chooses  M map  H guide', 12, '#9bbcc0', 0.5);
      this.texts.worldFooter = add(195, 826, 'WASD or arrows move  Space pulse  E interact  M map', 12, '#9bbcc0', 0.5);
      this.texts.puzzleFooter = add(195, 790, 'Arrows choose a star  Enter traces it  H reveals a hint  Esc leaves', 12, '#9bbcc0', 0.5);
      this.texts.helpBody.setWordWrapWidth(330);
      this.a11y = document.getElementById('screen-reader');
      this.a11yControls = document.getElementById('accessible-controls');
    }

    renderWorldBase() {
      const g = this.worldG;
      g.clear(); g.fillStyle(COLORS.ink, 1); g.fillRect(0, 0, WORLD_W, WORLD_H);
      REGIONS.forEach((region, regionIndex) => {
        g.fillStyle(region.tile, 1); g.fillRect(region.x, region.y, region.w, region.h);
        const map = REGION_TILEMAPS[regionIndex];
        for (let row = 0; row < 23; row += 1) for (let col = 0; col < Math.ceil(region.w / TILE); col += 1) {
          const tile = map[row % map.length][col % map[0].length];
          const color = tile === 'p' ? 0x214b50 : tile === 'w' ? 0x17445a : tile === 'v' ? 0x314b3b : region.tile;
          g.fillStyle(color, 0.78); g.fillRect(region.x + col * TILE, row * TILE, TILE + 1, TILE + 1);
        }
        g.fillStyle(region.edge, 0.75); g.fillRect(region.x + 14, 0, 3, WORLD_H); g.fillRect(region.x + region.w - 17, 0, 3, WORLD_H);
      });
      g.fillStyle(0x4b8b79, 0.9); g.fillRect(70, 515, 590, 72);
      g.fillStyle(0x5a9b8a, 0.45); g.fillRect(70, 529, 590, 4); g.fillRect(70, 569, 590, 4);
      g.fillStyle(0x397a85, 0.55); WATER.forEach((water) => { g.fillRect(water.x, water.y, water.w, water.h); g.lineStyle(2, 0x7acdd4, 0.4); g.strokeRect(water.x, water.y, water.w, water.h); });
      g.fillStyle(0x3c543d, 0.55); VINES.forEach((vine) => { g.fillRect(vine.x, vine.y, vine.w, vine.h); });
      PROPS.forEach((prop) => this.drawProp(g, prop));
      CONSTELLATIONS.forEach((item) => this.drawAltar(g, item));
      GATES.forEach((gate) => { g.lineStyle(7, 0x10232e, 1); g.lineBetween(gate.x, 0, gate.x, WORLD_H); g.lineStyle(2, COLORS.gold, 0.78); g.lineBetween(gate.x, 0, gate.x, WORLD_H); });
    }

    drawProp(g, prop) {
      if (prop.type === 'tree') { g.fillStyle(0x102a2c, 1); g.fillRect(prop.x - 5, prop.y + 6, 10, 25); g.fillStyle(0x4e8e70, 1); g.fillCircle(prop.x, prop.y, 26); g.fillStyle(0x77b878, 0.6); g.fillCircle(prop.x - 8, prop.y - 8, 10); }
      else if (prop.type === 'rock') { g.fillStyle(0x122a38, 1); g.fillTriangle(prop.x - 22, prop.y + 16, prop.x - 8, prop.y - 20, prop.x + 20, prop.y + 13); g.fillStyle(0x71909b, 0.72); g.fillTriangle(prop.x - 11, prop.y + 4, prop.x - 3, prop.y - 12, prop.x + 8, prop.y + 7); }
      else if (prop.type === 'reed') { g.lineStyle(3, 0x75a875, 0.8); g.lineBetween(prop.x, prop.y + 15, prop.x - 6, prop.y - 20); g.lineBetween(prop.x + 8, prop.y + 15, prop.x + 15, prop.y - 16); g.lineBetween(prop.x + 3, prop.y + 15, prop.x + 1, prop.y - 28); }
      else { g.fillStyle(0x10232e, 1); g.fillRect(prop.x - 4, prop.y - 15, 8, 30); g.fillStyle(COLORS.gold, 0.9); g.fillCircle(prop.x, prop.y - 18, 7); g.lineStyle(2, COLORS.gold, 0.5); g.strokeCircle(prop.x, prop.y - 18, 13); }
    }

    drawAltar(g, item) {
      const solved = state.puzzles[item.id].state === 'solved';
      g.fillStyle(0x0c202e, 1); g.fillCircle(item.altar.x, item.altar.y, 40); g.lineStyle(3, solved ? COLORS.gold : COLORS.cyan, 0.9); g.strokeCircle(item.altar.x, item.altar.y, 32); g.lineStyle(1, COLORS.text, 0.35); g.strokeCircle(item.altar.x, item.altar.y, 22); g.fillStyle(solved ? COLORS.gold : COLORS.cyan, 0.9); g.fillTriangle(item.altar.x, item.altar.y - 18, item.altar.x + 10, item.altar.y, item.altar.x, item.altar.y + 18); g.fillTriangle(item.altar.x, item.altar.y - 18, item.altar.x - 10, item.altar.y, item.altar.x, item.altar.y + 18);
    }

    showHomeMessage() { if (!hasSave) setTransient('Move through the Moor and collect the sky threads.', 2.6, 'coach'); }

    syncScene(force = false) {
      if (!force && this.lastScene === state.scene) return;
      this.lastScene = state.scene;
      const world = state.scene === 'world';
      this.worldG.setVisible(world); this.detailG.setVisible(world); this.dynamicG.setVisible(world); this.playerSprite.setVisible(world); this.enemySprites.forEach((sprite) => sprite.setVisible(world));
      if (world) { this.cameras.main.startFollow(this.playerSprite, true, 0.12, 0.12); this.updateMusic(true); }
      else this.cameras.main.stopFollow();
      this.renderUi(); this.updateAccessibility();
    }

    updateMusic(force = false) {
      if (state.scene !== 'world') return;
      const region = regionAt(state.player.x);
      let track = REGIONS[region].music;
      for (const enemy of this.enemyActors) if (!state.defeated[enemy.id] && enemy.region === region && distance(enemy.x, enemy.y, state.player.x, state.player.y) < 210) track = 'danger-theme';
      if (force || this.currentTrack !== track) { this.currentTrack = track; kit.audio.music(track, 500); }
    }

    restartToHome() { state.scene = 'home'; state.activePuzzle = null; state.puzzleInput = []; state.puzzleCursor = 0; this.syncScene(true); }

    renderUi() {
      const g = this.uiG; g.clear();
      Object.values(this.texts).forEach((value) => { if (value && typeof value.setVisible === 'function') value.setVisible(false); });
      this.texts.homeMenu.forEach((item) => item.setVisible(false)); this.texts.mapCards.forEach((item) => item.setVisible(false));
      if (state.scene === 'home') this.renderHomeUi(g);
      else if (state.scene === 'world') this.renderWorldUi(g);
      else if (state.scene === 'puzzle') this.renderPuzzleUi(g);
      else if (state.scene === 'map') this.renderMapUi(g);
      else this.renderHelpUi(g);
    }

    renderHomeUi(g) {
      g.fillStyle(COLORS.ink, 1); g.fillRect(0, 0, W, H); g.fillStyle(0x123542, 1); g.fillRect(0, 0, W, 230); g.fillStyle(0x0c2632, 1); g.fillRect(0, 230, W, H - 230);
      for (let index = 0; index < 16; index += 1) { const x = 18 + (index * 71) % W; const y = 30 + (index * 43) % 250; g.fillStyle(index % 3 === 0 ? COLORS.gold : COLORS.cyan, 0.45); g.fillCircle(x, y, index % 2 ? 2 : 3); }
      for (let index = 0; index < 3; index += 1) { const y = 292 + index * 75; g.fillStyle(state.menuIndex === index ? COLORS.panel2 : COLORS.panel, 1); g.fillRoundedRect(34, y, 322, 56, 13); g.lineStyle(state.menuIndex === index ? 2 : 1, state.menuIndex === index ? COLORS.gold : COLORS.line, 0.9); g.strokeRoundedRect(34, y, 322, 56, 13); this.texts.homeMenu[index].setVisible(true); }
      this.texts.brand.setVisible(true); this.texts.homeTitle.setVisible(true); this.texts.homeSub.setVisible(true); this.texts.homeProgress.setVisible(true); this.texts.homeFooter.setVisible(true);
      this.texts.homeMenu[0].setText(hasSave ? 'Continue weaving' : 'Begin weaving');
      this.texts.homeProgress.setText(`${state.threadCount} / ${THREADS.length} threads  •  ${state.unlockedRegions.length} / ${REGIONS.length} regions`);
    }

    renderWorldUi(g) {
      const region = regionAt(state.player.x); const current = REGIONS[region]; const puzzle = puzzleForRegion(region); const solved = puzzle && state.puzzles[puzzle.id].state === 'solved';
      g.fillStyle(0x071421, 0.93); g.fillRoundedRect(12, 12, 366, 62, 13); g.lineStyle(1, current.edge, 0.95); g.strokeRoundedRect(12, 12, 366, 62, 13);
      g.fillStyle(0x071421, 0.91); g.fillRoundedRect(12, 750, 366, 75, 13); g.lineStyle(1, COLORS.line, 0.9); g.strokeRoundedRect(12, 750, 366, 75, 13);
      this.texts.brand.setVisible(true); this.texts.region.setVisible(true); this.texts.stats.setVisible(true); this.texts.objective.setVisible(true); this.texts.prompt.setVisible(true); this.texts.worldFooter.setVisible(true);
      this.texts.region.setText(`${current.name}  •  ${hasAbility('star-sense') ? 'Star Sense active' : 'Signal quiet'}`);
      this.texts.stats.setText(`${state.threadCount}/${THREADS.length}  HP ${Math.ceil(state.player.hp)}/100`);
      this.texts.objective.setText(solved ? 'Constellation woven. Seek the next altar.' : `${puzzle ? puzzle.name : 'The Starweft'}  •  ${state.threadCount} threads gathered`);
      const nearby = this.nearbyPrompt(); this.texts.prompt.setText(nearby || 'Explore the route and follow the thread glow.');
      if (this.transient && this.transient.life > 0) { this.texts.banner.setVisible(true); this.texts.banner.setText(this.transient.text); this.texts.banner.setColor(this.transient.kind === 'danger' ? '#ff827e' : this.transient.kind === 'unlock' ? '#ffd886' : '#effaf7'); }
    }

    renderPuzzleUi(g) {
      const item = currentConstellation(); if (!item) { state.scene = 'world'; return; }
      g.fillStyle(0x071421, 1); g.fillRect(0, 0, W, H); g.fillStyle(0x102a38, 1); g.fillRoundedRect(20, 20, 350, 700, 20); g.lineStyle(2, COLORS.cyan, 0.8); g.strokeRoundedRect(20, 20, 350, 700, 20);
      const centerX = 195; const centerY = 390; const progress = state.puzzles[item.id].progress;
      g.lineStyle(2, COLORS.gold, 0.65); for (let index = 1; index < state.puzzleInput.length; index += 1) { const a = item.nodes[state.puzzleInput[index - 1]]; const b = item.nodes[state.puzzleInput[index]]; g.lineBetween(centerX + a.x, centerY + a.y, centerX + b.x, centerY + b.y); }
      item.nodes.forEach((node, index) => { const selected = state.puzzleInput.includes(index); const cursor = state.puzzleCursor === index; g.fillStyle(selected ? COLORS.gold : cursor ? COLORS.cyan : 0x345a68, 1); g.fillCircle(centerX + node.x, centerY + node.y, cursor ? 18 : 13); g.lineStyle(cursor ? 3 : 1, cursor ? COLORS.text : COLORS.cyan, 0.9); g.strokeCircle(centerX + node.x, centerY + node.y, cursor ? 22 : 17); });
      this.texts.brand.setVisible(true); this.texts.puzzleTitle.setVisible(true); this.texts.puzzleHelp.setVisible(true); this.texts.puzzleStatus.setVisible(true); this.texts.puzzleFooter.setVisible(true);
      this.texts.puzzleTitle.setText(item.name); this.texts.puzzleHelp.setText(state.puzzles[item.id].hintUsed ? item.hint : 'Trace the authored pattern one star at a time.');
      this.texts.puzzleStatus.setText(`Pattern ${progress} / ${item.pattern.length}  •  ${state.puzzles[item.id].attempts} failed traces`);
    }

    renderMapUi(g) {
      g.fillStyle(COLORS.ink, 1); g.fillRect(0, 0, W, H); g.fillStyle(0x102a38, 1); g.fillRoundedRect(16, 18, 358, 700, 18); g.lineStyle(2, COLORS.cyan, 0.75); g.strokeRoundedRect(16, 18, 358, 700, 18);
      this.texts.brand.setVisible(true); this.texts.mapTitle.setVisible(true); this.texts.mapHint.setVisible(true);
      REGIONS.forEach((region, index) => { const y = 145 + index * 175; const unlocked = regionUnlocked(index); const selected = state.atlasIndex === index; g.fillStyle(selected ? 0x254d55 : 0x173b47, 1); g.fillRoundedRect(38, y, 314, 130, 14); g.lineStyle(selected ? 2 : 1, selected ? COLORS.gold : COLORS.line, 0.9); g.strokeRoundedRect(38, y, 314, 130, 14); this.texts.mapCards[index].setVisible(true).setPosition(54, y + 17).setText(`${unlocked ? 'OPEN' : 'LOCKED'}  ${region.name}\n${unlocked ? 'A traversable route' : region.gateText}\nThreads in region: ${THREADS.filter((thread) => thread.region === index && state.threads[thread.id]).length}/${THREADS.filter((thread) => thread.region === index).length}`); });
    }

    renderHelpUi(g) {
      g.fillStyle(COLORS.ink, 1); g.fillRect(0, 0, W, H); g.fillStyle(0x102a38, 1); g.fillRoundedRect(18, 20, 354, 710, 18); g.lineStyle(2, COLORS.gold, 0.8); g.strokeRoundedRect(18, 20, 354, 710, 18);
      this.texts.brand.setVisible(true); this.texts.helpTitle.setVisible(true); this.texts.helpBody.setVisible(true); this.texts.helpBody.setText('Move with WASD, arrows, or a gamepad stick.\n\nCollect glowing celestial threads. Stand near an altar and press E or Enter to open its constellation. Trace each authored pattern. H reveals a hint. A wrong star resets the trace, but never the save.\n\nThe first constellation grants Tide Step and opens Saltglass Reach. The second grants Bloom Lantern and opens Nightlace Canopy. The third completes the Starweft.\n\nSpace pulses nearby sentinels. Hits show damage, knockback, and leaf sparks. M opens the atlas. Escape returns from menus.');
    }

    nearbyPrompt() {
      const altar = CONSTELLATIONS.find((item) => item.region === regionAt(state.player.x) && distance(state.player.x, state.player.y, item.altar.x, item.altar.y) < 78 && state.puzzles[item.id].state !== 'solved');
      if (altar) return `E / Enter weave ${altar.name}`;
      for (const gate of GATES) if (Math.abs(state.player.x - gate.x) < 46) return regionUnlocked(gate.region) ? 'Route gate open' : `Gate sealed. ${REGIONS[gate.region].gateText}`;
      for (const enemy of this.enemyActors) if (!state.defeated[enemy.id] && distance(enemy.x, enemy.y, state.player.x, state.player.y) < 92) return 'Space pulse the sentinel';
      return '';
    }

    update(time, delta) {
      const dt = clamp((Number(delta) || 0) / 1000, 0, 0.05);
      this.processPointers(); this.processKeys(); this.updateGamepad();
      const juice = kit.juice.frame();
      if (!this.simPaused && !juice.frozen) {
        state.totalPlayTime += dt;
        if (this.transient && this.transient.life > 0) this.transient.life = Math.max(0, this.transient.life - dt);
        if (state.scene === 'world') this.updateWorld(dt);
        this.updateFx(dt); this.updateFloaters(dt); this.updateDynamicDraw();
      }
      this.renderUi(); this.updateAccessibility();
    }

    updateWorld(dt) {
      this.updatePlayer(dt); this.collectThreads(); this.updateEnemies(dt); this.updateRegion();
      if (this.musicTimer > 0) this.musicTimer -= dt; else this.updateMusic();
      this.updateTutorial();
      this.saveClock += dt;
      if (this.saveClock >= 3) { this.saveClock = 0; saveState(); }
    }

    updatePlayer(dt) {
      let axisX = 0; let axisY = 0;
      if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) axisX -= 1;
      if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) axisX += 1;
      if (kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW')) axisY -= 1;
      if (kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS')) axisY += 1;
      axisX += this.gamepadAxisX || 0; axisY += this.gamepadAxisY || 0;
      const length = Math.sqrt(axisX * axisX + axisY * axisY); const moving = length > 0.05 || Math.abs(state.player.kx || 0) > 1 || Math.abs(state.player.ky || 0) > 1;
      if (length > 1) { axisX /= length; axisY /= length; }
      const speed = hasAbility('tide-step') ? 194 : 176;
      const vx = (axisX * speed + (state.player.kx || 0)) * dt; const vy = (axisY * speed + (state.player.ky || 0)) * dt;
      this.tryMove(vx, 0); this.tryMove(0, vy);
      state.player.kx = (state.player.kx || 0) * Math.pow(0.06, dt); state.player.ky = (state.player.ky || 0) * Math.pow(0.06, dt);
      if (moving) {
        if (Math.abs(axisX) > Math.abs(axisY)) state.player.facing = axisX < 0 ? 'left' : 'right'; else if (Math.abs(axisY) > 0.05) state.player.facing = axisY < 0 ? 'up' : 'down';
        this.walkClock = (this.walkClock || 0) + dt;
        if (this.walkClock > 0.2) { this.walkClock = 0; this.spawnMotionFx(state.player.x, state.player.y, state.player.facing); kit.audio.sfx('footstep', { volume: 0.08, rate: 1 + Math.random() * 0.15 }); }
      } else this.walkClock = 0;
      const frame = moving && Math.floor((this.walkClock || 0) * 10) % 2 ? 1 : 0;
      this.playerSprite.setTexture(`sw-player-${state.player.facing}-${frame}`).setPosition(state.player.x, state.player.y);
      if (state.player.hp <= 0) this.resetAfterFall();
    }

    tryMove(dx, dy) {
      if (!dx && !dy) return;
      const nextX = clamp(state.player.x + dx, 24, WORLD_W - 24); const nextY = clamp(state.player.y + dy, 24, WORLD_H - 24);
      if (!this.isBlocked(nextX, nextY)) { state.player.x = nextX; state.player.y = nextY; }
      else if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) this.gateNotice(nextX, nextY);
    }

    isBlocked(x, y) {
      for (const gate of GATES) if (!regionUnlocked(gate.region) && Math.abs(x - gate.x) < 25) return true;
      for (const obstacle of OBSTACLES) if (x > obstacle.x - 14 && x < obstacle.x + obstacle.w + 14 && y > obstacle.y - 14 && y < obstacle.y + obstacle.h + 14) return true;
      if (!hasAbility('tide-step')) for (const water of WATER) if (x > water.x - 15 && x < water.x + water.w + 15 && y > water.y - 15 && y < water.y + water.h + 15) return true;
      if (!hasAbility('bloom-lantern')) for (const vine of VINES) if (x > vine.x - 14 && x < vine.x + vine.w + 14 && y > vine.y - 14 && y < vine.y + vine.h + 14) return true;
      return false;
    }

    gateNotice(x, y) {
      const region = regionAt(x); if (region === regionAt(state.player.x)) return;
      const gate = GATES.find((item) => item.region === region); if (gate && !regionUnlocked(region) && (!this.gateNoticeTimer || this.gateNoticeTimer <= 0)) { setTransient(`${regionName(region)} is sealed. ${REGIONS[region].gateText}.`, 2, 'notice'); this.gateNoticeTimer = 1.5; }
    }

    collectThreads() {
      for (const thread of THREADS) if (!state.threads[thread.id] && distance(thread.x, thread.y, state.player.x, state.player.y) < 34 && regionUnlocked(thread.region)) {
        state.threads[thread.id] = true; state.threadCount += 1; this.spawnCollectionFx(thread.x, thread.y, thread.color); spawnSavedMessage(this, `${thread.name} collected. ${state.threadCount} of ${THREADS.length}.`, 'pickup');
        kit.audio.sfx('pickup', { volume: 0.65 }); saveState(); this.updateTutorial();
      }
    }

    updateEnemies(dt) {
      for (let index = 0; index < this.enemyActors.length; index += 1) {
        const enemy = this.enemyActors[index]; const sprite = this.enemySprites[index];
        if (state.defeated[enemy.id]) { sprite.setVisible(false); continue; }
        enemy.cooldown = Math.max(0, enemy.cooldown - dt); enemy.phase += dt;
        const d = distance(enemy.x, enemy.y, state.player.x, state.player.y); const sameRegion = enemy.region === regionAt(state.player.x);
        if (sameRegion && d < 240 && d > 30) { const step = 24 * dt; enemy.x += (state.player.x - enemy.x) / Math.max(1, d) * step; enemy.y += (state.player.y - enemy.y) / Math.max(1, d) * step; }
        else { enemy.x += Math.cos(enemy.phase * 1.4 + index) * 9 * dt; enemy.y += Math.sin(enemy.phase * 1.1 + index) * 9 * dt; }
        enemy.x += enemy.kx * dt; enemy.y += enemy.ky * dt; enemy.kx *= Math.pow(0.04, dt); enemy.ky *= Math.pow(0.04, dt);
        if (d < 34 && enemy.cooldown <= 0) { enemy.cooldown = 1.1; const damage = 8 + enemy.region * 3; state.player.hp = clamp(state.player.hp - damage, 0, 100); state.player.kx = (state.player.x - enemy.x) * 3; state.player.ky = (state.player.y - enemy.y) * 3; this.spawnHitFx(state.player.x, state.player.y, COLORS.danger); this.spawnFloat(`-${damage}`, state.player.x, state.player.y - 26, '#ff827e'); kit.audio.sfx('hurt', { volume: 0.5 }); setTransient('Sentinel contact. Pulse back or move away.', 1.1, 'danger'); if (motionEnabled()) kit.juice.shake(3, 100); }
        sprite.setVisible(true).setPosition(enemy.x, enemy.y).setAlpha(d < 220 ? 1 : 0.72);
      }
    }

    updateRegion() {
      const next = regionAt(state.player.x); if (next !== state.lastRegion) { state.lastRegion = next; this.musicTimer = 1.1; setTransient(`${regionName(next)} reached.`, 1.5, 'notice'); kit.audio.sfx('secret', { volume: 0.38 }); saveState(); this.updateMusic(true); }
      if (this.gateNoticeTimer > 0) this.gateNoticeTimer -= 1 / 60;
    }

    resetAfterFall() { state.player.hp = 100; state.player.x = 280; state.player.y = 560; state.lastRegion = 0; setTransient('The route folds back to the beacon.', 1.8, 'danger'); kit.audio.sfx('hurt', { volume: 0.65 }); saveState(); }

    updateTutorial() {
      if (state.tutorialStep === 0 && state.scene === 'world') { state.tutorialStep = 1; setTransient('Move with WASD or arrows. Follow the glowing threads.', 3, 'coach'); saveState(); }
      else if (state.tutorialStep === 1 && state.threadCount >= 1) { state.tutorialStep = 2; setTransient('Three threads reveal the first constellation altar.', 2.8, 'coach'); saveState(); }
      else if (state.tutorialStep === 2 && state.puzzles.lyra.state !== 'dormant') { state.tutorialStep = 3; setTransient('Trace the stars in order. H reveals a hint.', 2.8, 'coach'); saveState(); }
      else if (state.tutorialStep === 3 && state.puzzles.lyra.state === 'solved') { state.tutorialStep = 4; setTransient('Tide Step opens the next region. Keep weaving.', 2.8, 'coach'); saveState(); }
    }

    updateDynamicDraw() {
      this.detailG.clear();
      const t = performance.now() / 1000;
      WATER.forEach((water, waterIndex) => { for (let row = 0; row < 5; row += 1) { const y = water.y + 28 + row * 47; this.detailG.lineStyle(2, 0x8de1e0, 0.38); this.detailG.lineBetween(water.x + 12, y + Math.sin(t * 1.6 + row + waterIndex) * 4, water.x + water.w - 12, y + Math.sin(t * 1.6 + row + waterIndex) * 4); } });
      THREADS.forEach((thread) => { if (state.threads[thread.id] || !regionUnlocked(thread.region)) return; const pulse = 1 + Math.sin(t * 3 + thread.x) * 0.16; this.detailG.fillStyle(thread.color, 0.18); this.detailG.fillCircle(thread.x, thread.y, 24 * pulse); this.detailG.fillStyle(thread.color, 0.95); this.detailG.fillTriangle(thread.x, thread.y - 10, thread.x + 9, thread.y, thread.x, thread.y + 10); this.detailG.fillTriangle(thread.x, thread.y - 10, thread.x - 9, thread.y, thread.x, thread.y + 10); });
      CONSTELLATIONS.forEach((item) => { if (state.puzzles[item.id].state === 'solved') return; const pulse = 1 + Math.sin(t * 2 + item.altar.x) * 0.12; this.detailG.lineStyle(1, COLORS.cyan, 0.28); this.detailG.strokeCircle(item.altar.x, item.altar.y, 45 * pulse); });
      this.fxG.clear(); this.drawFxPool(this.collectionFx, 'collection'); this.drawFxPool(this.constellationFx, 'constellation'); this.drawFxPool(this.unlockFx, 'unlock'); this.drawFxPool(this.motionFx, 'motion'); this.drawFxPool(this.hitFx, 'hit');
    }

    spawnPool(pool, x, y, color, amount = 1) { let placed = 0; for (const item of pool) { if (item.active) continue; item.active = true; item.life = item.max = motionEnabled() ? 0.68 : 0.28; item.x = x; item.y = y; item.color = color; item.seed = placed; placed += 1; if (placed >= amount) break; } }
    spawnCollectionFx(x, y, color) { this.spawnPool(this.collectionFx, x, y, color, 10); }
    spawnUnlockFx(x, y) { this.spawnPool(this.unlockFx, x, y, COLORS.gold, 28); }
    spawnConstellationFx(x, y) { this.spawnPool(this.constellationFx, x, y, COLORS.cyan, 16); }
    spawnMotionFx(x, y, facing) { this.spawnPool(this.motionFx, x - (facing === 'right' ? 7 : facing === 'left' ? -7 : 0), y + 13, facing === 'up' ? COLORS.cyan : COLORS.bloom, 2); }
    spawnHitFx(x, y, color) { this.spawnPool(this.hitFx, x, y, color, 9); }
    drawFxPool(pool, type) { for (const item of pool) if (item.active) { const fade = clamp(item.life / item.max, 0, 1); const phase = 1 - fade; this.fxG.fillStyle(item.color, fade); if (type === 'collection') { const angle = item.seed * 0.63; const radius = 8 + phase * 30; this.fxG.fillCircle(item.x + Math.cos(angle) * radius, item.y + Math.sin(angle) * radius, 3); } else if (type === 'constellation') { this.fxG.lineStyle(2, item.color, fade); this.fxG.strokeCircle(item.x, item.y, 16 + phase * 50 + item.seed); } else if (type === 'unlock') { const x = item.x + Math.cos(item.seed * 1.9) * (16 + phase * 80); const y = item.y + Math.sin(item.seed * 1.7) * (20 + phase * 80) - phase * 34; this.fxG.fillRect(x, y, 5, 5); } else if (type === 'motion') this.fxG.fillEllipse(item.x + phase * (item.seed % 2 ? 6 : -6), item.y + phase * 12, 4, 2); else { this.fxG.lineStyle(2, item.color, fade); this.fxG.strokeCircle(item.x, item.y, 12 + phase * 34); } } }
    updateFx(dt) { [this.collectionFx, this.constellationFx, this.unlockFx, this.motionFx, this.hitFx].forEach((pool) => pool.forEach((item) => { if (item.active) { item.life -= dt; if (item.life <= 0) item.active = false; } })); }
    spawnFloat(value, x, y, color) { const item = this.floaters.find((entry) => entry.life <= 0); if (!item) return; item.life = motionEnabled() ? 0.85 : 0.45; item.x = x; item.y = y; item.dy = -26; item.sprite.setText(value).setColor(color).setPosition(x, y).setVisible(true); }
    updateFloaters(dt) { this.floaters.forEach((item) => { if (item.life <= 0) { item.sprite.setVisible(false); return; } item.life -= dt; item.y += item.dy * dt; item.dy += 8 * dt; item.sprite.setPosition(item.x, item.y).setAlpha(clamp(item.life * 1.8, 0, 1)); }); }

    pulseAttack() {
      let target = null; let closest = 96;
      for (const enemy of this.enemyActors) if (!state.defeated[enemy.id]) { const d = distance(enemy.x, enemy.y, state.player.x, state.player.y); if (d < closest && enemy.region === regionAt(state.player.x)) { target = enemy; closest = d; } }
      if (!target) { this.interact(); return; }
      const damage = hasAbility('weft-crown') ? 38 : 28; target.hp -= damage; const push = Math.max(0.1, closest); target.kx = (target.x - state.player.x) / push * 130; target.ky = (target.y - state.player.y) / push * 130; this.spawnHitFx(target.x, target.y, COLORS.gold); this.spawnFloat(String(damage), target.x, target.y - 25, '#ffd886'); kit.audio.sfx('hit', { volume: 0.5 }); if (motionEnabled()) kit.juice.hitStop(42);
      if (target.hp <= 0) { state.defeated[target.id] = true; setTransient(`${target.type === 'moth' ? 'Moth' : 'Thorn'} sentinel dispersed.`, 1.1, 'notice'); this.spawnCollectionFx(target.x, target.y, COLORS.cyan); kit.audio.sfx('secret', { volume: 0.35 }); saveState(); }
    }

    interact() {
      const item = CONSTELLATIONS.find((entry) => entry.region === regionAt(state.player.x) && distance(state.player.x, state.player.y, entry.altar.x, entry.altar.y) < 82);
      if (item && state.puzzles[item.id].state !== 'solved') { this.startPuzzle(item.id); return; }
      if (item && state.puzzles[item.id].state === 'solved') { setTransient(`${item.name} is already woven.`, 1, 'notice'); return; }
      const gate = GATES.find((entry) => Math.abs(state.player.x - entry.x) < 52); if (gate && !regionUnlocked(gate.region)) { setTransient(REGIONS[gate.region].gateText + '.', 1.8, 'notice'); return; }
      setTransient('No constellation signal nearby.', 0.85, 'notice'); kit.audio.sfx('ui', { volume: 0.2 });
    }

    startPuzzle(id) { const item = puzzleById(id); if (!item) return; if (!regionUnlocked(item.region)) { setTransient(REGIONS[item.region].gateText + '.', 1.8, 'notice'); return; } if (state.threadCount < item.threadMin) { setTransient(`Gather ${item.threadMin} threads before opening ${item.name}.`, 1.8, 'coach'); return; } state.activePuzzle = id; state.puzzleCursor = 0; state.puzzleInput = []; const puzzle = state.puzzles[id]; if (puzzle.state === 'dormant' || puzzle.state === 'failed') puzzle.state = 'discovered'; state.scene = 'puzzle'; saveState(); this.spawnConstellationFx(item.altar.x, item.altar.y); kit.audio.sfx('constellation', { volume: 0.7 }); this.syncScene(true); }
    selectPuzzleNode(index) {
      const item = currentConstellation(); if (!item) return; const progress = state.puzzles[item.id].progress; const expected = item.pattern[progress];
      if (index !== expected) { state.puzzles[item.id].attempts += 1; state.puzzles[item.id].state = 'failed'; state.puzzles[item.id].progress = 0; state.puzzleInput = []; state.puzzleCursor = 0; setTransient('The trace breaks. Try the pattern again.', 1.4, 'danger'); kit.audio.sfx('hurt', { volume: 0.35 }); saveState(); return; }
      state.puzzleInput.push(index); state.puzzles[item.id].progress += 1; state.puzzles[item.id].state = 'discovered'; kit.audio.sfx('ui', { volume: 0.3, rate: 1.1 });
      if (state.puzzles[item.id].progress >= item.pattern.length) { state.puzzles[item.id].state = 'solved'; unlockForPuzzle(item.id); this.spawnConstellationFx(item.altar.x, item.altar.y); kit.audio.sfx('constellation', { volume: 0.85 }); state.scene = 'world'; state.activePuzzle = null; state.puzzleInput = []; saveState(); this.syncScene(true); }
      else saveState();
    }
    giveHint() { const item = currentConstellation(); if (!item) return; const puzzle = state.puzzles[item.id]; if (puzzle.state === 'solved') return; puzzle.hintUsed = true; puzzle.state = 'hinted'; setTransient(item.hint, 3, 'coach'); saveState(); }

    processPointers() {
      const rect = this.game.canvas.getBoundingClientRect();
      for (const pointer of kit.input.pointers.values()) {
        if (pointer.zone) continue; pointer.zone = 'starweft-claimed'; const x = (pointer.x - rect.left) * W / Math.max(1, rect.width); const y = (pointer.y - rect.top) * H / Math.max(1, rect.height); this.handleAction(this.hitTest(x, y));
      }
    }
    hitTest(x, y) {
      if (state.scene === 'home') { if (y >= 292 && y <= 548) return { type: 'menu', index: clamp(Math.floor((y - 292) / 75), 0, 2) }; return null; }
      if (state.scene === 'world') { if (y < 76 && x > 320) return { type: 'map' }; if (y > 748) return { type: 'worldAction' }; const wx = this.cameras.main.scrollX + x; const wy = this.cameras.main.scrollY + y; for (const enemy of this.enemyActors) if (!state.defeated[enemy.id] && distance(enemy.x, enemy.y, wx, wy) < 60) return { type: 'worldAction' }; return { type: 'move', x: wx, y: wy }; }
      if (state.scene === 'puzzle') { const item = currentConstellation(); if (!item) return null; for (let index = 0; index < item.nodes.length; index += 1) { const node = item.nodes[index]; if (distance(195 + node.x, 390 + node.y, x, y) < 28) return { type: 'puzzleNode', index }; } if (y > 745) return { type: 'back' }; return null; }
      if (state.scene === 'map') { if (y > 735) return { type: 'back' }; for (let index = 0; index < REGIONS.length; index += 1) if (y >= 145 + index * 175 && y <= 275 + index * 175) return { type: 'atlas', index }; return null; }
      return { type: 'back' };
    }
    handleAction(action) {
      if (!action) return;
      if (action.type === 'menu') { state.menuIndex = action.index; this.activateMenu(); return; }
      if (action.type === 'map') { this.menuReturnScene = state.scene; state.scene = 'map'; saveState(); this.syncScene(true); return; }
      if (action.type === 'worldAction') { this.pulseAttack(); return; }
      if (action.type === 'move') { state.moveTarget = { x: clamp(action.x, 24, WORLD_W - 24), y: clamp(action.y, 24, WORLD_H - 24) }; return; }
      if (action.type === 'puzzleNode') { state.puzzleCursor = action.index; this.selectPuzzleNode(action.index); return; }
      if (action.type === 'atlas') { state.atlasIndex = action.index; setTransient(regionUnlocked(action.index) ? `${regionName(action.index)} is open.` : REGIONS[action.index].gateText + '.', 1.3, 'notice'); return; }
      if (action.type === 'back') { if (state.scene === 'puzzle') { state.scene = 'world'; state.activePuzzle = null; state.puzzleInput = []; this.syncScene(true); } else if (state.scene === 'map' || state.scene === 'help') { state.scene = this.menuReturnScene || 'home'; state.activePuzzle = null; state.puzzleInput = []; this.syncScene(true); } }
    }
    activateMenu() { if (state.menuIndex === 0) { state.scene = 'world'; this.syncScene(true); updateFirstWorldSave(); } else if (state.menuIndex === 1) { this.menuReturnScene = 'home'; state.scene = 'map'; this.syncScene(true); } else { this.menuReturnScene = 'home'; state.scene = 'help'; this.syncScene(true); } kit.audio.sfx('ui', { volume: 0.35 }); }

    processKeys() {
      const codes = ['Enter', 'Space', 'KeyE', 'KeyM', 'KeyH', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      codes.forEach((code) => {
        const down = kit.input.keyDown(code);
        if (down && !this.keyLatch.has(code)) {
          this.keyLatch.add(code);
          if (state.scene === 'home' && (code === 'ArrowUp' || code === 'ArrowDown')) { state.menuIndex = (state.menuIndex + (code === 'ArrowDown' ? 1 : 2)) % 3; kit.audio.sfx('ui', { volume: 0.18 }); }
          else if (state.scene === 'home' && (code === 'Enter' || code === 'Space')) this.activateMenu();
          else if (state.scene === 'home' && code === 'KeyM') { this.menuReturnScene = 'home'; state.scene = 'map'; this.syncScene(true); }
          else if (state.scene === 'home' && code === 'KeyH') { this.menuReturnScene = 'home'; state.scene = 'help'; this.syncScene(true); }
          else if (state.scene === 'world' && code === 'KeyM') { this.menuReturnScene = 'world'; state.scene = 'map'; saveState(); this.syncScene(true); }
          else if (state.scene === 'world' && (code === 'KeyE' || code === 'Enter')) this.interact();
          else if (state.scene === 'world' && code === 'Space') this.pulseAttack();
          else if (state.scene === 'world' && code === 'KeyH') { this.menuReturnScene = 'world'; state.scene = 'help'; this.syncScene(true); }
          else if (state.scene === 'puzzle' && code === 'Escape') this.handleAction({ type: 'back' });
          else if (state.scene === 'puzzle' && code === 'KeyH') this.giveHint();
          else if (state.scene === 'puzzle' && (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown')) this.movePuzzleCursor(code);
          else if (state.scene === 'puzzle' && (code === 'Enter' || code === 'Space')) this.selectPuzzleNode(state.puzzleCursor);
          else if ((state.scene === 'map' || state.scene === 'help') && (code === 'Escape' || code === 'Enter')) this.handleAction({ type: 'back' });
          else if (state.scene === 'map' && (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown')) this.moveAtlasCursor(code);
        }
        if (!down) this.keyLatch.delete(code);
      });
      if (state.scene === 'world') { const tx = state.moveTarget; if (tx) { const d = distance(tx.x, tx.y, state.player.x, state.player.y); if (d < 18) state.moveTarget = null; else { const speed = 176; state.player.kx = (tx.x - state.player.x) / d * speed; state.player.ky = (tx.y - state.player.y) / d * speed; } } }
    }
    movePuzzleCursor(code) { const item = currentConstellation(); if (!item) return; const count = item.nodes.length; const delta = code === 'ArrowLeft' || code === 'ArrowUp' ? -1 : 1; state.puzzleCursor = (state.puzzleCursor + delta + count) % count; kit.audio.sfx('ui', { volume: 0.16 }); }
    moveAtlasCursor(code) { const delta = code === 'ArrowLeft' || code === 'ArrowUp' ? -1 : 1; state.atlasIndex = (state.atlasIndex + delta + REGIONS.length) % REGIONS.length; kit.audio.sfx('ui', { volume: 0.16 }); }

    updateGamepad() {
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      let pad = null; for (const item of pads) if (item && item.connected) { pad = item; break; }
      if (!pad) { if (this.gamepadConnected) { this.gamepadConnected = false; setTransient('Gamepad disconnected. Keyboard and touch remain available.', 1.5, 'notice'); } this.gamepadAxisX = 0; this.gamepadAxisY = 0; return; }
      if (!this.gamepadConnected) { this.gamepadConnected = true; setTransient('Gamepad connected.', 1.1, 'notice'); }
      const dead = (value) => Math.abs(value) < 0.22 ? 0 : clamp(value, -1, 1);
      this.gamepadAxisX = dead(pad.axes?.[0] || 0); this.gamepadAxisY = dead(pad.axes?.[1] || 0);
      const button = (index) => !!pad.buttons?.[index]?.pressed;
      const confirm = button(0); const back = button(1); const up = button(12) || this.gamepadAxisY < -0.6; const down = button(13) || this.gamepadAxisY > 0.6; const left = button(14) || this.gamepadAxisX < -0.6; const right = button(15) || this.gamepadAxisX > 0.6;
      if (confirm && !this.padLatch.confirm) { if (state.scene === 'home') this.activateMenu(); else if (state.scene === 'world') this.pulseAttack(); else if (state.scene === 'puzzle') this.selectPuzzleNode(state.puzzleCursor); else this.handleAction({ type: 'back' }); }
      if (back && !this.padLatch.back) { if (state.scene !== 'home') this.handleAction({ type: 'back' }); }
      if (state.scene === 'home') { if (down && !this.padLatch.down) state.menuIndex = (state.menuIndex + 1) % 3; if (up && !this.padLatch.up) state.menuIndex = (state.menuIndex + 2) % 3; }
      if (state.scene === 'puzzle') { if ((left || up) && !this.padLatch.left && !this.padLatch.up) this.movePuzzleCursor('ArrowLeft'); if ((right || down) && !this.padLatch.right && !this.padLatch.down) this.movePuzzleCursor('ArrowRight'); }
      if (state.scene === 'map') { if ((left || up) && !this.padLatch.left && !this.padLatch.up) this.moveAtlasCursor('ArrowLeft'); if ((right || down) && !this.padLatch.right && !this.padLatch.down) this.moveAtlasCursor('ArrowRight'); }
      this.padLatch = { confirm, back, up, down, left, right };
    }

    updateAccessibility() {
      if (!this.a11y) return;
      let message = 'Starweft. ';
      if (state.scene === 'home') message += `Main menu. ${hasSave ? 'Continue weaving' : 'Begin weaving'} selected. Use arrow keys and Enter. ${state.threadCount} of ${THREADS.length} threads collected.`;
      else if (state.scene === 'world') message += `${regionName(regionAt(state.player.x))}. ${state.threadCount} of ${THREADS.length} threads. Health ${Math.ceil(state.player.hp)} of 100. ${this.nearbyPrompt() || 'Explore with WASD, arrows, touch, or a gamepad.'}`;
      else if (state.scene === 'puzzle') { const item = currentConstellation(); message += `${item ? item.name : 'Constellation'}. Star ${state.puzzleCursor + 1} selected. ${state.puzzles[item.id].progress} of ${item.pattern.length} traced. Enter traces the selected star. H gives a hint.`; }
      else if (state.scene === 'map') message += `Route atlas. ${regionName(state.atlasIndex)} selected. ${regionUnlocked(state.atlasIndex) ? 'Open' : 'Locked'}.`;
      else message += 'Guide. Movement, collection, constellation, gate, and sentinel controls are listed on screen.';
      this.a11y.textContent = message;
      if (this.a11yControls) { this.a11yControls.setAttribute('aria-label', `Starweft ${state.scene} controls`); this.a11yControls.dataset.scene = state.scene; }
    }
  }

  function spawnSavedMessage(scene, text, kind) { setTransient(text, 1.5, kind); scene.spawnCollectionFx(state.player.x, state.player.y, COLORS.gold); }
  function updateFirstWorldSave() { state.moveTarget = null; state.scene = 'world'; saveState(); }

  kit.loader.show('STARWEFT'); kit.loader.progress(0.2);
  Game.instance = new Phaser.Game({ type: Phaser.CANVAS, width: W, height: H, parent: 'game-shell', backgroundColor: '#071421', render: { pixelArt: true, antialias: false, roundPixels: true, transparent: false }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, fps: { target: 60, min: 5, forceSetTimeOut: false }, scene: [StarweftScene] });
})();
