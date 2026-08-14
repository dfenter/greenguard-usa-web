(() => {
  'use strict';

  const boot = {
    mode: 'boot', score: 0, lives: 3, maze: 0, frightTimer: 0,
    circuit: 1, family: 'classic', chaserAI: 'mixed', speedTier: 1,
    forceMaze: null, forceChaserAI: null,
    tutorialStep: 0, seed: 0
  };
  const probe = window.__mp || {};
  window.__mp = {
    state: probe.state || boot,
    forceMaze: Object.prototype.hasOwnProperty.call(probe, 'forceMaze') ? probe.forceMaze : null,
    forceChaserAI: Object.prototype.hasOwnProperty.call(probe, 'forceChaserAI') ? probe.forceChaserAI : null
  };
  window.__mp.state.forceMaze = window.__mp.forceMaze;
  window.__mp.state.forceChaserAI = window.__mp.forceChaserAI;

  const PhaserRef = window.Phaser;
  const GGKitRef = window.GGKit;
  const root = document.documentElement;
  const coachEl = document.getElementById('coach-strip');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const livesEl = document.getElementById('lives');
  const frightEl = document.getElementById('fright');
  const circuitEl = document.getElementById('circuit');
  const effectsEl = document.getElementById('effects');
  const titleMenuEl = document.getElementById('title-menu');
  const titleCopyEl = document.getElementById('title-copy');
  const STEP = 1 / 60;
  const TURN_WINDOW = .34;
  const TAU = Math.PI * 2;

  const DIRS = Object.freeze({
    up: Object.freeze({ x: 0, y: -1, angle: -Math.PI / 2, id: 'up' }),
    right: Object.freeze({ x: 1, y: 0, angle: 0, id: 'right' }),
    down: Object.freeze({ x: 0, y: 1, angle: Math.PI / 2, id: 'down' }),
    left: Object.freeze({ x: -1, y: 0, angle: Math.PI, id: 'left' }),
    none: Object.freeze({ x: 0, y: 0, angle: 0, id: 'none' })
  });
  const DIR_LIST = [DIRS.up, DIRS.right, DIRS.down, DIRS.left];
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left', none: 'none' };
  const KEY_DIRS = {
    up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD']
  };

  const CIRCUITS = [
    { id: 'signal', name: 'SIGNAL CIRCUIT', family: 'classic', mazes: 3, speed: 1, aggression: 1 },
    { id: 'orbit', name: 'ORBIT CIRCUIT', family: 'spiral', mazes: 3, speed: 1.08, aggression: 1.12 },
    { id: 'quad', name: 'QUAD CIRCUIT', family: 'quad', mazes: 3, speed: 1.16, aggression: 1.24 },
    { id: 'tunnel', name: 'TUNNEL CIRCUIT', family: 'wrap', mazes: 3, speed: 1.24, aggression: 1.38 }
  ];
  const FAMILIES = {
    classic: { id: 'classic', name: 'CLASSIC WARREN', cols: 19, rows: 25, color: 0x4b74e8, accent: 0x5effdc, gimmick: 'cross-cut shortcut' },
    spiral: { id: 'spiral', name: 'SPIRAL CORE', cols: 19, rows: 25, color: 0x8c63e7, accent: 0xffb86b, gimmick: 'one-way gate' },
    quad: { id: 'quad', name: 'SYMMETRIC QUAD-MAZE', cols: 19, rows: 25, color: 0x3bbcc3, accent: 0xff78b8, gimmick: 'mirror gate' },
    wrap: { id: 'wrap', name: 'WRAPAROUND TUNNEL', cols: 21, rows: 25, color: 0xe26972, accent: 0xffd56e, gimmick: 'teleport tunnel' },
    prime: { id: 'prime', name: 'PRIME WARREN', cols: 23, rows: 25, color: 0x5effdc, accent: 0xffd66e, gimmick: 'four-way prime gate' }
  };
  const CHASER_ROLES = [
    { id: 'ambusher', name: 'VEX', color: 0xff667f, icon: '>' },
    { id: 'patroller', name: 'ORBIT', color: 0xffbf68, icon: '□' },
    { id: 'wanderer', name: 'DRIFT', color: 0xa78cff, icon: '·' },
    { id: 'hunter', name: 'LOCK', color: 0x5fbeff, icon: '+' }
  ];
  const MEDALS = [
    { id: 'bronze', label: 'BRONZE', color: 0xcd8c61, points: 150 },
    { id: 'silver', label: 'SILVER', color: 0xc4d1e9, points: 300 },
    { id: 'gold', label: 'GOLD', color: 0xffd66e, points: 500 },
    { id: 'prime', label: 'PRIME', color: 0x5effdc, points: 800 }
  ];

  let scene = null;
  let kit = null;

  function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }
  function keyOf(x, y) { return x + ',' + y; }
  function setTextIfChanged(node, value) { if (node && node.textContent !== value) node.textContent = value; }
  function hashSeed(value) {
    let h = value >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }
  function hashString(value) {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function validProfile(value) {
    return !!value && typeof value === 'object' && Number.isSafeInteger(value.best) && value.best >= 0 && value.best <= 999999999 &&
      Number.isInteger(value.unlockedCircuit) && value.unlockedCircuit >= 1 && value.unlockedCircuit <= 4 &&
      typeof value.tutorialSeen === 'boolean' && (value.version == null || value.version === 1);
  }
  function normalizeFamily(value, fallback) {
    if (typeof value === 'number') {
      const list = Object.keys(FAMILIES);
      return FAMILIES[list[clamp(Math.floor(value), 0, list.length - 1)]].id;
    }
    if (typeof value === 'string') {
      const candidate = value.toLowerCase().replace(/[^a-z]/g, '');
      for (const id of Object.keys(FAMILIES)) {
        if (candidate === id || candidate === FAMILIES[id].name.toLowerCase().replace(/[^a-z]/g, '')) return id;
      }
    }
    return fallback;
  }
  function roleFromProbe(value, fallback) {
    if (typeof value === 'string') {
      const clean = value.toLowerCase().replace(/[^a-z]/g, '');
      for (const role of CHASER_ROLES) if (clean === role.id) return role.id;
      if (clean === 'allhunter' || clean === 'prime') return 'hunter';
    }
    return fallback;
  }

  class Rng {
    constructor(seed) { this.value = (seed >>> 0) || 1; }
    next() { this.value = (Math.imul(this.value, 1664525) + 1013904223) >>> 0; return this.value / 4294967296; }
    int(max) { return Math.floor(this.next() * max); }
  }

  function makeGrid(cols, rows) { return Array.from({ length: rows }, () => Array(cols).fill(true)); }
  function inGrid(grid, x, y) { return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length; }
  function open(grid, x, y) { if (inGrid(grid, x, y)) grid[y][x] = false; }
  function openRect(grid, x0, y0, x1, y1) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) open(grid, x, y);
  }
  function nearestOpen(grid, desired) {
    if (inGrid(grid, desired.x, desired.y) && !grid[desired.y][desired.x]) return { x: desired.x, y: desired.y };
    for (let radius = 1; radius < 20; radius++) {
      for (let y = desired.y - radius; y <= desired.y + radius; y++) {
        for (let x = desired.x - radius; x <= desired.x + radius; x++) {
          if (inGrid(grid, x, y) && !grid[y][x]) return { x, y };
        }
      }
    }
    return { x: 1, y: 1 };
  }
  function floodOpen(grid, start) {
    const seen = new Set(); const queue = [start]; seen.add(keyOf(start.x, start.y));
    for (let i = 0; i < queue.length; i++) {
      const point = queue[i];
      for (const dir of DIR_LIST) {
        const x = point.x + dir.x; const y = point.y + dir.y; const key = keyOf(x, y);
        if (inGrid(grid, x, y) && !grid[y][x] && !seen.has(key)) { seen.add(key); queue.push({ x, y }); }
      }
    }
    return seen;
  }
  function repairConnectivity(grid, desired) {
    const anchor = nearestOpen(grid, desired); let guard = grid.length * grid[0].length;
    while (guard-- > 0) {
      const reachable = floodOpen(grid, anchor); let bridge = null;
      for (let y = 0; y < grid.length && !bridge; y++) for (let x = 0; x < grid[0].length && !bridge; x++) {
        if (!reachable.has(keyOf(x, y))) continue;
        for (const dir of DIR_LIST) {
          const wallX = x + dir.x; const wallY = y + dir.y;
          const targetX = wallX + dir.x; const targetY = wallY + dir.y;
          if (inGrid(grid, wallX, wallY) && grid[wallY][wallX] && inGrid(grid, targetX, targetY) && !grid[targetY][targetX] && !reachable.has(keyOf(targetX, targetY))) {
            bridge = { x: wallX, y: wallY }; break;
          }
        }
      }
      if (!bridge) return;
      grid[bridge.y][bridge.x] = false;
    }
  }
  function generateMaze(familyId, seed, tier) {
    const spec = FAMILIES[familyId] || FAMILIES.classic;
    const cols = spec.cols;
    const rows = spec.rows;
    const grid = makeGrid(cols, rows);
    const rng = new Rng(hashSeed(seed ^ hashString(familyId) ^ tier * 977));

    // The shared lane lattice keeps corners generous while each family edits the
    // lattice into a recognizable pacing pattern.
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) if (x % 2 === 1 || y % 2 === 1) grid[y][x] = false;
    }
    if (familyId === 'classic') {
      for (let y = 1; y < rows - 1; y += 2) {
        for (let x = 2; x < cols - 2; x += 2) if (rng.next() < .28 + tier * .025 && !(x === Math.floor(cols / 2) && y % 4 === 1)) grid[y][x] = true;
      }
      for (let x = 1; x < cols - 1; x += 2) for (let y = 2; y < rows - 2; y += 2) if (rng.next() < .12) grid[y][x] = true;
      openRect(grid, 7, 11, 11, 13);
    } else if (familyId === 'spiral') {
      for (let ring = 1; ring < 6; ring++) {
        const left = ring * 2 - 1; const right = cols - ring * 2; const top = ring * 2 - 1; const bottom = rows - ring * 2;
        for (let x = left; x <= right; x++) { open(grid, x, top); open(grid, x, bottom); }
        for (let y = top; y <= bottom; y++) { open(grid, left, y); open(grid, right, y); }
        open(grid, left, bottom - 1); // deliberate spiral breaks
      }
      for (let i = 0; i < 12 + tier * 2; i++) if (rng.next() < .7) grid[2 + rng.int(rows - 4)][2 + rng.int(cols - 4)] = true;
      openRect(grid, 8, 10, 10, 14);
    } else if (familyId === 'quad') {
      const midX = Math.floor(cols / 2); const midY = Math.floor(rows / 2);
      for (let y = 1; y < rows - 1; y++) if (y !== 5 && y !== midY - 1 && y !== midY + 1 && y !== rows - 6) grid[y][midX] = true;
      for (let x = 1; x < cols - 1; x++) if (x !== 5 && x !== midX - 1 && x !== midX + 1 && x !== cols - 6) grid[midY][x] = true;
      for (let q = 0; q < 4; q++) {
        const x0 = q % 2 ? midX + 2 : 2; const x1 = q % 2 ? cols - 3 : midX - 2;
        const y0 = q > 1 ? midY + 2 : 2; const y1 = q > 1 ? rows - 3 : midY - 2;
        if (rng.next() < .9) open(grid, x0 + 1, Math.floor((y0 + y1) / 2));
        if (rng.next() < .9) open(grid, Math.floor((x0 + x1) / 2), y0 + 1);
      }
      openRect(grid, midX - 1, midY - 1, midX + 1, midY + 1);
    } else if (familyId === 'wrap') {
      const warpRow = Math.floor(rows / 2);
      for (let x = 0; x < cols; x++) open(grid, x, warpRow);
      for (let row = 3; row < rows - 2; row += 6) for (let x = 1; x < cols - 1; x++) if (rng.next() < .72) open(grid, x, row);
      for (let y = 1; y < rows - 1; y += 2) for (let x = 2; x < cols - 2; x += 2) if (rng.next() < .18) grid[y][x] = true;
      open(grid, 0, warpRow); open(grid, cols - 1, warpRow);
    } else {
      openRect(grid, 8, 10, 14, 14); openRect(grid, 2, 12, cols - 3, 12); openRect(grid, 11, 2, 11, rows - 3);
      for (let ring = 1; ring < 4; ring++) {
        const left = ring * 2 + 1; const right = cols - ring * 2 - 2; const top = ring * 2 + 1; const bottom = rows - ring * 2 - 2;
        for (let x = left; x <= right; x += 2) { open(grid, x, top); open(grid, x, bottom); }
        for (let y = top; y <= bottom; y += 2) { open(grid, left, y); open(grid, right, y); }
      }
    }

    repairConnectivity(grid, { x: Math.floor(cols / 2), y: Math.floor(rows / 2) });
    const hub = nearestOpen(grid, { x: Math.floor(cols / 2), y: Math.floor(rows / 2) });
    const powerNodes = [
      nearestOpen(grid, { x: 1, y: 1 }), nearestOpen(grid, { x: cols - 2, y: 1 }),
      nearestOpen(grid, { x: 1, y: rows - 2 }), nearestOpen(grid, { x: cols - 2, y: rows - 2 })
    ];
    const warpRow = familyId === 'wrap' ? Math.floor(rows / 2) : -1;
    const midX = Math.floor(cols / 2);
    const shortcuts = familyId === 'classic'
      ? [{ type: 'warp', from: nearestOpen(grid, { x: 3, y: 1 }), to: nearestOpen(grid, { x: cols - 4, y: rows - 2 }), label: 'CROSS-CUT' }]
      : familyId === 'spiral'
        ? [{ type: 'gate', from: nearestOpen(grid, { x: midX, y: 3 }), to: nearestOpen(grid, { x: midX, y: rows - 4 }), label: 'DROP GATE' }]
        : familyId === 'quad'
          ? [{ type: 'gate', from: nearestOpen(grid, { x: 3, y: Math.floor(rows / 2) }), to: nearestOpen(grid, { x: cols - 4, y: Math.floor(rows / 2) }), label: 'MIRROR GATE' }]
          : familyId === 'wrap'
            ? [{ type: 'tunnel', from: { x: 0, y: warpRow }, to: { x: cols - 1, y: warpRow }, label: 'TUNNEL' }]
            : [{ type: 'gate', from: nearestOpen(grid, { x: 3, y: Math.floor(rows / 2) }), to: nearestOpen(grid, { x: cols - 4, y: Math.floor(rows / 2) }), label: 'PRIME GATE' }];
    shortcuts.forEach((shortcut) => { open(grid, shortcut.from.x, shortcut.from.y); open(grid, shortcut.to.x, shortcut.to.y); });

    const pellets = new Set();
    const openCells = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!grid[y][x]) {
        openCells.push({ x, y });
        if (keyOf(x, y) !== keyOf(hub.x, hub.y) && !powerNodes.some((p) => p.x === x && p.y === y)) pellets.add(keyOf(x, y));
      }
    }
    const placements = [
      { type: 'speed', at: { x: 3, y: 3 } }, { type: 'shield', at: { x: cols - 4, y: 3 } },
      { type: 'life', at: { x: midX, y: rows - 4 } }, { type: 'multiplier', at: { x: cols - 4, y: rows - 4 } }
    ];
    const boosts = placements.map((item) => ({ type: item.type, ...nearestOpen(grid, item.at), active: true }));
    boosts.forEach((boost) => pellets.delete(keyOf(boost.x, boost.y)));
    return { id: spec.id, spec, cols, rows, walls: grid, hub, powerNodes: powerNodes.map((p) => ({ ...p, active: true })), shortcuts, warpRow, pellets, totalPellets: pellets.size, boosts, openCells };
  }

  function tileDistance(a, b, maze) {
    let dx = Math.abs(a.x - b.x);
    if (maze && maze.warpRow >= 0 && dx > maze.cols / 2) dx = maze.cols - dx;
    return dx + Math.abs(a.y - b.y);
  }
  function safeTarget(maze, target) { return nearestOpen(maze.walls, { x: clamp(Math.round(target.x), 0, maze.cols - 1), y: clamp(Math.round(target.y), 0, maze.rows - 1) }); }
  function pointKey(point) { return keyOf(Math.round(point.x), Math.round(point.y)); }

  function neighbors(maze, point) {
    const result = [];
    for (const dir of DIR_LIST) {
      let x = Math.round(point.x) + dir.x;
      const y = Math.round(point.y) + dir.y;
      if (maze.warpRow >= 0 && y === maze.warpRow && (x < 0 || x >= maze.cols)) x = x < 0 ? maze.cols - 1 : 0;
      if (x < 0 || x >= maze.cols || y < 0 || y >= maze.rows || maze.walls[y][x]) continue;
      result.push({ x, y, dir });
    }
    for (const shortcut of maze.shortcuts) {
      if (shortcut.from.x === Math.round(point.x) && shortcut.from.y === Math.round(point.y)) result.push({ x: shortcut.to.x, y: shortcut.to.y, dir: DIRS.none });
    }
    return result;
  }
  function bfsDirection(maze, start, target) {
    const origin = safeTarget(maze, start);
    const goal = safeTarget(maze, target);
    const originKey = pointKey(origin);
    const goalKey = pointKey(goal);
    const queue = [origin];
    const came = new Map([[originKey, null]]);
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      if (pointKey(current) === goalKey) break;
      for (const next of neighbors(maze, current)) {
        const nextKey = pointKey(next);
        if (!came.has(nextKey)) { came.set(nextKey, { from: current, dir: next.dir }); queue.push({ x: next.x, y: next.y }); }
      }
    }
    if (!came.has(goalKey)) return null;
    let cursor = goal;
    let first = null;
    while (pointKey(cursor) !== originKey) {
      const step = came.get(pointKey(cursor));
      if (!step) break;
      if (step.dir !== DIRS.none) first = step.dir;
      cursor = step.from;
    }
    return first;
  }

  function createActor(x, y, dir, speed) { return { x, y, dir, nextDir: dir, turnQueue: [], speed, caught: false, respawn: 0, aiClock: 0, routeIndex: 0, wanderTarget: null, flash: 0 }; }
  function canMove(maze, x, y) {
    if (maze.warpRow >= 0 && y === maze.warpRow && (x < 0 || x >= maze.cols)) return true;
    return x >= 0 && x < maze.cols && y >= 0 && y < maze.rows && !maze.walls[y][x];
  }
  function normalizeActor(actor, maze) {
    if (maze.warpRow >= 0 && actor.y === maze.warpRow) {
      if (actor.x < 0) actor.x += maze.cols;
      if (actor.x >= maze.cols) actor.x -= maze.cols;
    }
  }
  function legalDirections(maze, actor) { return DIR_LIST.filter((dir) => canMove(maze, Math.round(actor.x) + dir.x, Math.round(actor.y) + dir.y)); }
  function queueTurn(actor, dir) {
    if (!actor || !dir || dir === DIRS.none) return;
    if (actor.dir.id === OPPOSITE[dir.id]) actor.turnQueue.unshift(dir);
    else if (!actor.turnQueue.some((queued) => queued.id === dir.id)) actor.turnQueue.push(dir);
    if (actor.turnQueue.length > 2) actor.turnQueue.splice(0, actor.turnQueue.length - 2);
  }
  function applyQueuedTurn(actor, maze, isPlayer) {
    const cx = Math.round(actor.x); const cy = Math.round(actor.y);
    const candidates = actor.turnQueue.slice();
    if (isPlayer && actor.dir.id !== 'none' && candidates.length) {
      const nextX = cx + actor.dir.x; const nextY = cy + actor.dir.y;
      const nearCorner = Math.abs(actor.x - nextX) + Math.abs(actor.y - nextY) < TURN_WINDOW;
      if (nearCorner && canMove(maze, nextX + candidates[0].x, nextY + candidates[0].y)) {
        actor.x = nextX; actor.y = nextY; actor.dir = candidates.shift();
      }
    }
    const options = candidates.length ? candidates : [];
    for (let i = 0; i < options.length; i++) {
      const dir = options[i];
      if (canMove(maze, cx + dir.x, cy + dir.y)) {
        actor.x = cx; actor.y = cy; actor.dir = dir; actor.turnQueue = actor.turnQueue.filter((queued) => queued.id !== dir.id); return;
      }
    }
    if (!canMove(maze, cx + actor.dir.x, cy + actor.dir.y)) actor.dir = DIRS.none;
  }
  function moveActor(actor, maze, dt, isPlayer, beforeTile) {
    let remaining = actor.speed * dt;
    let guard = 0;
    while (remaining > .0001 && guard++ < 8) {
      const cx = Math.round(actor.x); const cy = Math.round(actor.y);
      const atCenter = Math.abs(actor.x - cx) < .025 && Math.abs(actor.y - cy) < .025;
      if (isPlayer && actor.turnQueue.length && actor.dir !== DIRS.none && !atCenter) {
        const fromX = Math.round(actor.x - actor.dir.x * .49); const fromY = Math.round(actor.y - actor.dir.y * .49);
        const turnX = fromX + actor.dir.x; const turnY = fromY + actor.dir.y;
        const closeToCorner = Math.abs(actor.x - turnX) + Math.abs(actor.y - turnY) < TURN_WINDOW;
        const queued = actor.turnQueue[0];
        if (closeToCorner && queued && canMove(maze, turnX + queued.x, turnY + queued.y)) { actor.x = turnX; actor.y = turnY; actor.dir = queued; actor.turnQueue.shift(); }
      }
      if (atCenter) { actor.x = cx; actor.y = cy; if (beforeTile) beforeTile(actor, cx, cy); applyQueuedTurn(actor, maze, isPlayer); }
      if (actor.dir === DIRS.none) break;
      if (!canMove(maze, cx + actor.dir.x, cy + actor.dir.y)) { actor.dir = DIRS.none; break; }
      const distance = actor.dir.x ? Math.abs((cx + actor.dir.x) - actor.x) : Math.abs((cy + actor.dir.y) - actor.y);
      const step = Math.min(remaining, Math.max(.002, distance));
      actor.x += actor.dir.x * step; actor.y += actor.dir.y * step; remaining -= step;
      normalizeActor(actor, maze);
    }
  }

  function spawnPool(size) { return Array.from({ length: size }, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: 0xffffff, size: .1 })); }

  class MainScene extends PhaserRef.Scene {
    constructor() { super({ key: 'MainScene' }); }

    preload() {
      if (!this.load || !this.load.svg) return;
      const files = {
        floor: 'assets/floor.svg', wall: 'assets/wall.svg', pellet: 'assets/pellet.svg', power: 'assets/power.svg',
        boost: 'assets/boost.svg', shard: 'assets/shard.svg', runnerIdle: 'assets/runner-idle.svg', runnerMove: 'assets/runner-move.svg',
        runnerPower: 'assets/runner-power.svg', runnerCaught: 'assets/runner-caught.svg', chaser: 'assets/chaser.svg',
        chaserFrightened: 'assets/chaser-frightened.svg', chaserCaught: 'assets/chaser-caught.svg'
      };
      Object.entries(files).forEach(([key, url]) => this.load.svg(key, url, { width: 64, height: 64 }));
      if (kit && kit.loader) {
        kit.loader.show('Loading Mazerunner Prime');
        this.load.on('progress', (value) => kit.loader.progress(value));
        this.load.once('complete', () => kit.loader.hide());
      }
    }

    create() {
      scene = this;
      this.background = this.add.graphics().setDepth(-4);
      this.world = this.add.graphics().setDepth(1);
      this.fx = this.add.graphics().setDepth(3);
      this.damageOverlay = this.add.graphics().setDepth(12);
      this.bannerBack = this.add.graphics().setDepth(8);
      this.bannerText = this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '20px', fontStyle: '900', color: '#eff8ff', align: 'center' }).setOrigin(.5).setDepth(9);
      this.bannerSub = this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '12px', fontStyle: 'bold', color: '#9db5df', align: 'center' }).setOrigin(.5).setDepth(9);
      this.popupBack = this.add.graphics().setDepth(6);
      this.popupText = this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '14px', fontStyle: '900', color: '#ffffff', align: 'center' }).setOrigin(.5).setDepth(7).setVisible(false);
      this.mazeLayer = this.add.container ? this.add.container(0, 0).setDepth(0) : null;
      this.pickupLayer = this.add.container ? this.add.container(0, 0).setDepth(2) : null;
      this.actorLayer = this.add.container ? this.add.container(0, 0).setDepth(4) : null;
      this.wallSprites = []; this.floorSprites = []; this.pelletSprites = []; this.powerSprites = []; this.boostSprites = [];
      this.chaserSprites = []; this.chaserBadges = [];
      this.runnerSprite = this.add.image ? this.add.image(0, 0, 'runnerIdle').setVisible(false) : null;
      if (this.runnerSprite && this.actorLayer) this.actorLayer.add(this.runnerSprite);
      for (let i = 0; i < CHASER_ROLES.length; i++) {
        const sprite = this.add.image ? this.add.image(0, 0, 'chaser').setVisible(false) : null;
        const badge = this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '8px', fontStyle: '900', color: '#ffffff' }).setOrigin(.5).setVisible(false);
        if (sprite && this.actorLayer) this.actorLayer.add(sprite);
        if (this.actorLayer) this.actorLayer.add(badge);
        this.chaserSprites.push(sprite); this.chaserBadges.push(badge);
      }
      this.boostLabels = Array.from({ length: 4 }, () => this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '10px', fontStyle: '900', color: '#ffffff' }).setOrigin(.5).setDepth(6).setVisible(false));
      this.fxSystems = [
        spawnPool(48), spawnPool(42), spawnPool(54), spawnPool(36), spawnPool(32), spawnPool(36)
      ];
      this.fxSystemNames = ['movement', 'power', 'catches', 'damage', 'shortcuts', 'shardRush'];
      this.fxPools = Object.fromEntries(this.fxSystemNames.map((name, index) => [name, this.fxSystems[index]]));
      this.activeTransient = null;
      this.transientQueue = [];
      this.accumulator = 0;
      this.simTime = 0;
      this.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (this.reducedMotion) kit.juice.enabled = false;
      this.lastFamily = '';
      this.audioAwake = false;
      this.musicTrack = '';
      this.juiceFrame = { dx: 0, dy: 0, frozen: false };
      this.visualLayoutKey = '';
      this.keyLatch = {};
      this.profile = kit.save.get({ best: 0, unlockedCircuit: 1, tutorialSeen: false });
      if (!Number.isInteger(this.profile.version)) this.profile.version = 1;
      this.run = { mode: 'boot', score: 0, lives: 3, circuitIndex: 0, mazeIndex: 0, mazeNumber: 1, seed: hashSeed(Date.now() ^ 0x514d5052), time: 0, mazeTime: 0, mazeStartLives: 3, pelletsStart: 0, pelletsCollected: 0, frightTimer: 0, invuln: 0, shieldTimer: 0, speedTimer: 0, multiplierTimer: 0, multiplier: 1, shardTimer: 5, rushTimer: 0, rushCollected: 0, nextAction: '', banner: null, caughtTimer: 0, tutorialFrightTimer: 0, coachTimer: 0, livesAwarded: false };
      this.startSession(true);
      window.__mp.start = (mode) => this.startProbeMode(mode);
      kit.registerPWA();
      this.updateDom();
    }

    startSession(showTitle) {
      this.run.score = 0; this.run.lives = 3; this.run.circuitIndex = clamp(this.profile.unlockedCircuit - 1, 0, CIRCUITS.length - 1); this.run.mazeIndex = 0; this.run.seed = hashSeed(Date.now() ^ 0x514d5052);
      this.run.mode = showTitle ? 'title' : (this.profile.tutorialSeen ? 'run' : 'tutorial');
      this.run.tutorialStep = this.profile.tutorialSeen ? 4 : 0;
      this.run.tutorialFrightTimer = 0;
      this.run.coachTimer = 0;
      this.lastCoachStep = -1;
      this.run.banner = null;
      this.clearTransient();
      this.audioAwake = false; this.musicTrack = '';
      kit.audio.stopMusic(0);
      this.loadMaze();
      if (showTitle) this.setTitleBanner();
      if (titleMenuEl) titleMenuEl.hidden = !showTitle;
      if (!showTitle) this.hideActionCard();
    }

    setTitleBanner() {
      const circuit = CIRCUITS[this.run.circuitIndex] || CIRCUITS[0];
      if (titleCopyEl) titleCopyEl.textContent = circuit.name + ' selected. Select 1 to 4, then deploy. Highest unlocked circuits are available.';
    }

    startFromTitle() {
      if (this.run.mode !== 'title') return;
      this.run.mode = this.profile.tutorialSeen ? 'run' : 'tutorial';
      this.run.tutorialStep = this.profile.tutorialSeen ? 4 : 0;
      this.hideActionCard();
      this.wakeAudio();
    }

    selectCircuit(index) {
      if (this.run.mode !== 'title' || index < 0 || index >= CIRCUITS.length || index >= this.profile.unlockedCircuit) return;
      this.run.circuitIndex = index; this.loadMaze(); this.run.mode = 'title'; this.setTitleBanner();
    }

    startProbeMode(mode) {
      if (mode === 'shardRush') this.startShardRush();
      else if (mode === 'finale') this.startFinale();
      else { this.run.mode = mode === 'tutorial' ? 'tutorial' : 'run'; if (titleMenuEl) titleMenuEl.hidden = true; this.loadMaze(); }
    }

    loadMaze() {
      const circuit = CIRCUITS[this.run.circuitIndex] || CIRCUITS[0];
      const fallback = this.run.mode === 'finale' ? 'prime' : (circuit.family || 'classic');
      const familyId = normalizeFamily(window.__mp.forceMaze, fallback);
      this.run.mazeNumber = this.run.circuitIndex * 3 + this.run.mazeIndex + 1;
      this.run.mazeTime = 0; this.run.mazeStartLives = this.run.lives; this.run.pelletsCollected = 0; this.run.frightTimer = 0;
      this.run.invuln = 1.2; this.run.shieldTimer = 0; this.run.speedTimer = 0; this.run.multiplierTimer = 0; this.run.multiplier = 1; this.run.shardTimer = 4 + this.rngFor(10); this.run.caughtTimer = 0;
      const seed = hashSeed(this.run.seed ^ (this.run.circuitIndex + 1) * 131071 ^ (this.run.mazeIndex + 1) * 8191 ^ hashString(familyId));
      this.maze = generateMaze(familyId, seed, this.run.mazeIndex);
      this.run.mazeSeed = seed;
      this.run.pelletsStart = this.maze.totalPellets;
      this.player = createActor(this.maze.hub.x, this.maze.hub.y, DIRS.left, this.playerSpeed());
      this.player.turnQueue = [DIRS.left];
      this.makeChasers();
      this.shard = { active: false, x: this.maze.hub.x, y: this.maze.hub.y, phase: 0 };
      this.lastFamily = familyId;
      this.rebuildMazeVisuals();
      this.syncPublicState();
    }

    startShardRush() {
      this.run.mode = 'shardRush'; this.run.rushTimer = 24; this.run.rushCollected = 0; this.run.mazeTime = 0;
      this.run.mazeNumber = this.run.circuitIndex * 3 + this.run.mazeIndex + 1;
      this.loadMaze();
      this.run.mode = 'shardRush'; this.run.rushTimer = 24; this.run.shardTimer = .4;
      this.setBanner('SHARD RUSH', '24s · collect orange shards', 0xffbd62, 1.8);
    }

    startFinale() {
      this.run.mode = 'finale'; this.run.mazeIndex = 0; this.run.mazeNumber = 99; this.run.rushTimer = 0;
      this.loadMaze();
      this.run.mode = 'finale'; this.run.mazeNumber = 99;
      this.setBanner('PRIME MAZE', 'Final run · four hunters', 0x5effdc, 2.1);
    }

    rngFor(max) { return Math.floor((hashSeed(this.run.seed ^ this.run.mazeNumber * 31337 ^ Math.floor(this.simTime * 10)) / 4294967296) * max); }

    playerSpeed() {
      const circuit = CIRCUITS[this.run.circuitIndex] || CIRCUITS[0];
      const boost = this.run.speedTimer > 0 ? 1.24 : 1;
      return (4.0 + this.run.circuitIndex * .12 + this.run.mazeIndex * .08) * circuit.speed * boost;
    }

    chaserSpeed(index) {
      const circuit = CIRCUITS[this.run.circuitIndex] || CIRCUITS[0];
      const finale = this.run.mode === 'finale' ? .25 : 0;
      return (2.58 + this.run.circuitIndex * .14 + this.run.mazeIndex * .07 + index * .045 + finale) * circuit.speed;
    }

    makeChasers() {
      const h = this.maze.hub;
      const spots = [{ x: h.x - 1, y: h.y }, { x: h.x + 1, y: h.y }, { x: h.x, y: h.y - 1 }, { x: h.x, y: h.y + 1 }];
      this.chasers = CHASER_ROLES.map((role, index) => {
        const spot = nearestOpen(this.maze.walls, spots[index]);
        const actor = createActor(spot.x, spot.y, index % 2 ? DIRS.left : DIRS.up, this.chaserSpeed(index));
        actor.role = role.id; actor.name = role.name; actor.color = role.color; actor.icon = role.icon; actor.home = spot;
        actor.route = this.maze.powerNodes.map((node) => ({ x: node.x, y: node.y })); actor.animState = 'idle'; actor.animFrame = 0; actor.animClock = 0;
        return actor;
      });
    }

    aiRole(chaser, index) {
      if (this.run.mode === 'finale') return 'hunter';
      const forced = roleFromProbe(window.__mp.forceChaserAI, '');
      if (forced) return forced;
      return chaser.role || CHASER_ROLES[index % CHASER_ROLES.length].id;
    }

    requestDirection(dir) {
      if (!dir) return;
      if (this.run.mode === 'title') { this.startFromTitle(); return; }
      if (this.run.mode === 'gameover') { kit.restart(); return; }
      if (this.run.mode === 'between') { this.continueSequence(); return; }
      if (!this.player) return;
      const queueSize = this.player.turnQueue.length; queueTurn(this.player, dir);
      if (this.player.turnQueue.length > queueSize) kit.audio.sfx('turn-click', { volume: .24, rate: .9 + this.player.turnQueue.length * .04 });
      if (this.run.mode === 'tutorial' && this.tutorialStep() === 0) this.setTutorialStep(1);
      this.wakeAudio();
    }

    tutorialStep() { return this.run.tutorialStep || 0; }
    setTutorialStep(step) {
      this.run.tutorialStep = step;
      if (step >= 4) {
        this.profile.tutorialSeen = true;
        kit.save.set(this.profile);
        if (this.run.mode === 'tutorial') this.run.mode = 'run';
      }
      this.updateCoach();
    }

    wakeAudio() {
      this.audioAwake = true;
      this.updateMusicTrack(true);
    }

    updateMusicTrack(force) {
      if (!this.audioAwake) return;
      const nearby = this.chasers && this.player && this.chasers.some((chaser) => !chaser.caught && tileDistance(this.player, chaser, this.maze) < 4);
      const danger = this.run.mode === 'finale' || this.run.mode === 'shardRush' || this.run.lives <= 1 || nearby;
      const desired = this.run.frightTimer > 0 ? 'fright-stem' : danger ? 'danger-stem' : 'chase-stem';
      if (!force && desired === this.musicTrack) return;
      if (desired === 'danger-stem' && this.musicTrack !== 'danger-stem') kit.audio.sfx('danger-warning', { volume: .55 });
      this.musicTrack = desired; kit.audio.music(desired, force ? 500 : 260);
    }

    pollGamepad() {
      if (!navigator || typeof navigator.getGamepads !== 'function') return;
      const pads = navigator.getGamepads(); const pad = pads && pads[0];
      if (!pad) return;
      const x = pad.axes && pad.axes.length > 0 ? pad.axes[0] : 0; const y = pad.axes && pad.axes.length > 1 ? pad.axes[1] : 0;
      const direction = Math.max(Math.abs(x), Math.abs(y)) > .55 ? (Math.abs(x) > Math.abs(y) ? (x > 0 ? DIRS.right : DIRS.left) : (y > 0 ? DIRS.down : DIRS.up)) : null;
      if (direction && this.gamepadDirection !== direction.id) this.requestDirection(direction);
      this.gamepadDirection = direction ? direction.id : '';
      const action = !!(pad.buttons && pad.buttons.some((button) => button && button.pressed));
      if (action && !this.keyLatch.gamepadAction) { this.keyLatch.gamepadAction = true; if (this.run.mode === 'gameover') kit.restart(); else if (this.run.mode === 'between') this.continueSequence(); else if (this.run.mode === 'title') this.startFromTitle(); }
      if (!action) this.keyLatch.gamepadAction = false;
    }

    pollInput() {
      if (!kit || kit.paused) return;
      for (const [id, codes] of Object.entries(KEY_DIRS)) if (codes.some((code) => kit.input.keyDown(code))) this.requestDirection(DIRS[id]);
      for (let i = 0; i < CIRCUITS.length; i++) if (kit.input.keyDown('Digit' + (i + 1))) this.selectCircuit(i);
      const actionDown = kit.input.keyDown('Enter') || kit.input.keyDown('Space');
      if (actionDown && !this.keyLatch.action) {
        this.keyLatch.action = true;
        if (this.run.mode === 'gameover') kit.restart(); else if (this.run.mode === 'between') this.continueSequence();
      }
      if (!actionDown) this.keyLatch.action = false;
      this.pollGamepad();
      for (const pointer of kit.input.pointers.values()) {
        if (pointer.zone === 'button' || pointer.gestureDone) continue;
        const dx = pointer.x - pointer.startX; const dy = pointer.y - pointer.startY;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) continue;
        pointer.gestureDone = true;
        this.requestDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIRS.right : DIRS.left) : (dy > 0 ? DIRS.down : DIRS.up));
      }
    }

    simulate(dt) {
      if (!this.maze || kit.paused) return;
      const mode = this.run.mode;
      const forcedFamily = normalizeFamily(window.__mp.forceMaze, this.maze.id);
      if (forcedFamily !== this.maze.id && mode !== 'between' && mode !== 'gameover') { this.loadMaze(); this.run.mode = mode; }
      this.simTime += dt;
      if (this.run.mode === 'tutorial') this.run.coachTimer = Math.max(0, this.run.coachTimer - dt);
      if (this.run.banner) { this.run.banner.timer -= dt; if (this.run.banner.timer <= 0 && mode === 'between') this.continueSequence(); }
      this.run.invuln = Math.max(0, this.run.invuln - dt);
      this.run.caughtTimer = Math.max(0, this.run.caughtTimer - dt);
      const wasFright = this.run.frightTimer > 0;
      this.run.frightTimer = Math.max(0, this.run.frightTimer - dt);
      if (wasFright && this.run.frightTimer <= 0) this.updateMusicTrack(false);
      if (this.run.mode === 'tutorial' && this.tutorialStep() === 2 && this.run.tutorialFrightTimer > 0) {
        this.run.tutorialFrightTimer -= dt;
        if (this.run.tutorialFrightTimer <= 0) this.setTutorialStep(3);
      }
      this.run.shieldTimer = Math.max(0, this.run.shieldTimer - dt);
      this.run.speedTimer = Math.max(0, this.run.speedTimer - dt);
      this.run.multiplierTimer = Math.max(0, this.run.multiplierTimer - dt);
      if (this.run.multiplierTimer <= 0) this.run.multiplier = 1;
      this.updateParticles(dt);
      this.updatePopups(dt);
      if (mode === 'title' || mode === 'between' || mode === 'gameover') { this.updateCoach(); this.syncPublicState(); return; }
      this.run.time += dt; this.run.mazeTime += dt;
      if (mode === 'shardRush') this.run.rushTimer = Math.max(0, this.run.rushTimer - dt);
      this.player.speed = this.playerSpeed();
      moveActor(this.player, this.maze, dt, true, (actor, x, y) => this.onTile(actor, x, y));
      if (this.run.mode === 'between' || this.run.mode === 'gameover') { this.updateCoach(); this.syncPublicState(); return; }
      this.updateMusicTrack(false);
      for (let i = 0; i < this.chasers.length; i++) {
        const chaser = this.chasers[i];
        if (chaser.caught) { chaser.respawn -= dt; if (chaser.respawn <= 0) { chaser.caught = false; chaser.x = chaser.home.x; chaser.y = chaser.home.y; chaser.dir = DIRS.up; } continue; }
        chaser.speed = this.chaserSpeed(i) * (this.run.frightTimer > 0 ? .73 : 1);
        chaser.aiClock -= dt;
        const circuit = CIRCUITS[this.run.circuitIndex] || CIRCUITS[0];
        if (Math.abs(chaser.x - Math.round(chaser.x)) < .03 && Math.abs(chaser.y - Math.round(chaser.y)) < .03 && chaser.aiClock <= 0) { this.chooseChaserDirection(chaser, i); chaser.aiClock = Math.max(.08, .2 / circuit.aggression); }
        moveActor(chaser, this.maze, dt, false, null);
      }
      this.collectPickups();
      this.checkChaserHits();
      this.updateShard(dt);
      if (this.run.mode === 'shardRush' && this.run.rushTimer <= 0) this.endShardRush();
      this.updateCoach();
      this.syncPublicState();
    }

    chooseChaserDirection(chaser, index) {
      const role = this.aiRole(chaser, index);
      const current = { x: Math.round(chaser.x), y: Math.round(chaser.y) };
      const options = legalDirections(this.maze, chaser).filter((dir) => dir.id !== OPPOSITE[chaser.dir.id]);
      if (!options.length) { chaser.dir = OPPOSITE[chaser.dir.id] ? DIRS[OPPOSITE[chaser.dir.id]] : DIRS.none; return; }
      let target = { x: this.player.x, y: this.player.y };
      const circuit = CIRCUITS[this.run.circuitIndex] || CIRCUITS[0];
      if (role === 'ambusher') target = { x: this.player.x + this.player.dir.x * (4 + circuit.aggression * 2), y: this.player.y + this.player.dir.y * (4 + circuit.aggression * 2) };
      else if (role === 'patroller') {
        if (!chaser.route.length) chaser.route = this.maze.powerNodes;
        const waypoint = chaser.route[chaser.routeIndex % chaser.route.length];
        target = waypoint;
        if (tileDistance(current, waypoint, this.maze) < 2) chaser.routeIndex++;
      } else if (role === 'wanderer') {
        if (!chaser.wanderTarget || tileDistance(current, chaser.wanderTarget, this.maze) < 2 || chaser.wanderTarget.x < 0) chaser.wanderTarget = this.maze.openCells[this.rngFor(this.maze.openCells.length)];
        target = chaser.wanderTarget;
        if (circuit.aggression > 1.2 && this.rngFor(100) < Math.floor((circuit.aggression - 1) * 100)) target = { x: this.player.x, y: this.player.y };
      }
      let chosen = bfsDirection(this.maze, current, target);
      if (this.run.frightTimer > 0) {
        let best = options[0]; let distance = -Infinity;
        for (const dir of options) {
          const next = { x: current.x + dir.x, y: current.y + dir.y };
          const score = tileDistance(next, this.player, this.maze) + this.rngFor(30) / 100;
          if (score > distance) { distance = score; best = dir; }
        }
        chosen = best;
      }
      if (!chosen || !canMove(this.maze, current.x + chosen.x, current.y + chosen.y)) chosen = options[this.rngFor(options.length)] || DIRS.none;
      chaser.turnQueue = [chosen];
    }

    onTile(actor, x, y) {
      if (actor !== this.player) return;
      const tile = keyOf(x, y);
      if (this.run.mode !== 'shardRush' && this.maze.pellets.delete(tile)) {
        this.run.pelletsCollected++;
        this.addScore(10 * this.run.multiplier, x, y, '#b9eaff');
        kit.audio.sfx('pellet-chomp', { volume: .45, rate: .95 + (this.run.pelletsCollected % 4) * .03 });
        if (this.maze.pellets.size === 0) { this.endMaze(); return; }
      }
      for (const node of this.maze.powerNodes) if (node.active && node.x === x && node.y === y) {
        node.active = false; this.run.frightTimer = 8; this.run.multiplier = Math.min(4, this.run.multiplier + 1); this.run.multiplierTimer = 8;
        this.addScore(80, x, y, '#ffe36e'); kit.audio.sfx('power-siren', { volume: .8 }); this.updateMusicTrack(false);
        this.burst(x, y, 0xffe36e, 24, 2.8, 'power');
        if (this.run.mode === 'tutorial' && this.tutorialStep() === 1) { this.run.tutorialFrightTimer = 1.15; this.setTutorialStep(2); }
      }
      for (const boost of this.maze.boosts) if (boost.active && boost.x === x && boost.y === y) {
        boost.active = false;
        if (boost.type === 'speed') { this.run.speedTimer = 7; this.addScore(120, x, y, '#68d7ff'); kit.audio.sfx('turn-click', { volume: .35, rate: 1.7 }); }
        else if (boost.type === 'shield') { this.run.shieldTimer = 9; this.addScore(140, x, y, '#a990ff'); kit.audio.sfx('shield-pop', { volume: .75 }); }
        else if (boost.type === 'life') { this.run.lives = Math.min(5, this.run.lives + 1); this.addScore(300, x, y, '#ff78b8'); kit.audio.sfx('life-chime', { volume: .8 }); }
        else { this.run.multiplier = Math.min(5, this.run.multiplier + 2); this.run.multiplierTimer = 12; this.addScore(220, x, y, '#ffbd62'); kit.audio.sfx('multiplier-rise', { volume: .7 }); }
        this.burst(x, y, boost.type === 'life' ? 0xff78b8 : 0x5effdc, 18, 2.4, 'power');
      }
      for (const shortcut of this.maze.shortcuts) if (shortcut.from.x === x && shortcut.from.y === y && (shortcut.type !== 'gate' || this.player.dir.id !== 'none')) {
        this.player.x = shortcut.to.x; this.player.y = shortcut.to.y; this.run.invuln = Math.max(this.run.invuln, .25); this.addScore(25, x, y, '#ffbd62'); this.burst(x, y, 0xffbd62, 10, 1.5, 'shortcuts'); kit.audio.sfx('gate-whoosh', { volume: .65 });
      }
    }

    collectPickups() {
      if (!this.shard.active) return;
      if (tileDistance(this.player, this.shard, this.maze) < .65) {
        const points = (this.run.mode === 'shardRush' ? 300 : 240) * this.run.multiplier;
        this.addScore(points, this.shard.x, this.shard.y, '#ffbd62'); this.run.rushCollected += this.run.mode === 'shardRush' ? 1 : 0;
        this.run.multiplier = Math.min(5, this.run.multiplier + 1); this.run.multiplierTimer = 7; this.shard.active = false; this.run.shardTimer = this.run.mode === 'shardRush' ? .25 : 5 + this.rngFor(5);
        this.burst(this.shard.x, this.shard.y, 0xffbd62, 28, 2.8, 'shardRush'); kit.audio.sfx('multiplier-rise', { volume: .7 });
        if (this.run.mode === 'tutorial' && this.tutorialStep() === 3) this.setTutorialStep(4);
      }
    }

    updateShard(dt) {
      this.run.shardTimer -= dt;
      if (!this.shard.active && this.run.shardTimer <= 0) {
        const options = this.maze.openCells.filter((cell) => tileDistance(cell, this.player, this.maze) > 4);
        const point = options[this.rngFor(Math.max(1, options.length))] || this.maze.openCells[0];
        this.shard.active = true; this.shard.x = point.x; this.shard.y = point.y; this.shard.phase = this.simTime;
      }
    }

    checkChaserHits() {
      if (this.run.invuln > 0 || !['tutorial', 'run', 'shardRush', 'finale'].includes(this.run.mode)) return;
      for (const chaser of this.chasers) {
        if (chaser.caught || tileDistance(this.player, chaser, this.maze) >= .62) continue;
        if (this.run.frightTimer > 0) {
          chaser.caught = true; chaser.respawn = 1.1; this.addScore(220 * this.run.multiplier, chaser.x, chaser.y, '#d8e5ff'); this.burst(chaser.x, chaser.y, chaser.color, 26, 2.7, 'catches'); kit.juice.hitStop(45); kit.juice.shake(3, 100); kit.audio.sfx('catch-stinger', { volume: .8 });
        } else if (this.run.shieldTimer > 0) {
          this.run.shieldTimer = 0; this.run.invuln = 1.1; chaser.x = chaser.home.x; chaser.y = chaser.home.y; this.burst(this.player.x, this.player.y, 0xa990ff, 20, 2.5, 'power'); kit.juice.shake(3, 100); kit.audio.sfx('shield-pop', { volume: .65 });
        } else this.loseLife();
        break;
      }
    }

    loseLife() {
      if (this.run.invuln > 0 || !['tutorial', 'run', 'shardRush', 'finale'].includes(this.run.mode)) return;
      this.run.lives--; this.run.invuln = 2; this.run.caughtTimer = .65; this.burst(this.player.x, this.player.y, 0xff667f, 32, 3, 'damage'); kit.juice.shake(6, 220); kit.juice.hitStop(70); kit.audio.sfx('catch-stinger', { volume: 1 });
      if (this.run.lives <= 0) { this.run.mode = 'gameover'; this.run.nextAction = ''; this.run.banner = null; this.clearTransient(); this.showActionCard('RUN COMPLETE', 'Score ' + String(Math.floor(this.run.score)).padStart(6, '0') + ' · all lives spent.', 'REBOOT RUN'); kit.audio.sfx('completion-fanfare', { volume: .8 }); kit.audio.stopMusic(280); }
      else this.resetActors();
    }

    resetActors() {
      this.player.x = this.maze.hub.x; this.player.y = this.maze.hub.y; this.player.dir = DIRS.left; this.player.nextDir = DIRS.left; this.player.turnQueue = [DIRS.left];
      for (const chaser of this.chasers) { chaser.x = chaser.home.x; chaser.y = chaser.home.y; chaser.dir = DIRS.up; chaser.caught = false; chaser.respawn = 0; }
      this.updateMusicTrack(false);
    }

    addScore(points, x, y, color) {
      this.run.score += points;
      if (this.run.score > this.profile.best) { this.profile.best = Math.floor(this.run.score); kit.save.set(this.profile); }
      if (points > 10) this.popup('+' + Math.round(points), x, y, color || '#fff');
      this.syncPublicState();
    }

    medalForMaze() {
      const ratio = this.run.pelletsStart ? this.run.pelletsCollected / this.run.pelletsStart : 1;
      const circuit = CIRCUITS[this.run.circuitIndex] || CIRCUITS[0];
      const par = 42 / circuit.speed + this.run.mazeIndex * 4;
      const livesKept = this.run.lives - this.run.mazeStartLives + 3;
      if (ratio >= 1 && this.run.mazeTime <= par * .72 && livesKept >= 3) return MEDALS[3];
      if (ratio >= 1 && this.run.mazeTime <= par && livesKept >= 2) return MEDALS[2];
      if (ratio >= .96 && livesKept >= 1) return MEDALS[1];
      return MEDALS[0];
    }

    endMaze() {
      if (this.run.mode === 'between' || this.run.mode === 'gameover') return;
      const medal = this.medalForMaze();
      this.addScore(medal.points + this.run.lives * 25, this.maze.hub.x, this.maze.hub.y, '#' + medal.color.toString(16).padStart(6, '0'));
      this.run.lastMedal = medal; this.run.pelletsCollected = this.run.pelletsStart;
      if (this.run.mode === 'tutorial') { this.profile.tutorialSeen = true; kit.save.set(this.profile); }
      if (this.run.mode === 'finale') { this.run.mode = 'gameover'; this.run.banner = null; this.clearTransient(); this.showActionCard('PRIME COMPLETE', medal.label + ' medal · circuit mastery achieved.', 'REBOOT RUN'); kit.audio.sfx('completion-fanfare', { volume: .9 }); kit.audio.stopMusic(300); return; }
      const circuit = CIRCUITS[this.run.circuitIndex] || CIRCUITS[0];
      if (this.run.mazeIndex + 1 >= circuit.mazes) {
        this.run.nextAction = 'rush';
        this.setBanner('CIRCUIT CLEAR', circuit.name + ' · bonus mode ready', 0xffd66e, 2.8);
      } else {
        this.run.nextAction = 'maze';
        this.setBanner('MAZE CLEAR', medal.label + ' MEDAL', medal.color, 2.8);
      }
      this.run.mode = 'between';
    }

    endShardRush() {
      if (this.run.mode !== 'shardRush') return;
      const bonus = this.run.rushCollected * 150;
      if (bonus) this.addScore(bonus, this.maze.hub.x, this.maze.hub.y, '#ffbd62');
      this.run.nextAction = this.run.circuitIndex < CIRCUITS.length - 1 ? 'nextCircuit' : 'finale';
      this.setBanner('RUSH BANKED', this.run.rushCollected + ' SHARDS · +' + bonus, 0xffbd62, 2.8);
      this.run.mode = 'between';
    }

    continueSequence() {
      if (this.run.mode !== 'between') return;
      const action = this.run.nextAction;
      this.run.banner = null;
      if (action === 'maze') { this.run.mazeIndex++; this.run.mode = 'run'; this.loadMaze(); }
      else if (action === 'rush') this.startShardRush();
      else if (action === 'nextCircuit') { this.run.circuitIndex = Math.min(CIRCUITS.length - 1, this.run.circuitIndex + 1); this.run.mazeIndex = 0; this.profile.unlockedCircuit = Math.max(this.profile.unlockedCircuit, this.run.circuitIndex + 1); kit.save.set(this.profile); this.run.mode = 'run'; this.loadMaze(); }
      else if (action === 'finale') this.startFinale();
    }

    setBanner(title, subtitle, color, duration) {
      this.clearTransient();
      this.run.banner = { title, subtitle, color: color || 0x5effdc, timer: duration, duration, boundary: true };
    }

    clearTransient() {
      this.activeTransient = null;
      this.transientQueue.length = 0;
    }

    burst(x, y, color, count, force, systemName) {
      if (this.reducedMotion) return;
      const pool = this.fxPools[systemName || 'movement'] || this.fxPools.movement;
      let emitted = 0;
      for (let i = 0; i < count; i++) {
        const particle = pool.find((item) => !item.active) || pool.reduce((oldest, item) => item.life < oldest.life ? item : oldest, pool[0]);
        const angle = (hashSeed(this.run.mazeSeed + emitted * 17 + Math.floor(this.simTime * 100)) / 4294967296) * TAU;
        const speed = force * (.45 + ((emitted * 29) % 100) / 100);
        particle.active = true; particle.x = x; particle.y = y; particle.vx = Math.cos(angle) * speed; particle.vy = Math.sin(angle) * speed; particle.life = .35 + (emitted % 7) * .08; particle.max = particle.life; particle.color = color; particle.size = .055 + (emitted % 4) * .025;
        emitted++;
      }
    }

    popup(text, x, y, color) {
      if (this.reducedMotion) return;
      if (this.run.mode === 'tutorial' || this.run.mode === 'title' || this.run.mode === 'between' || this.run.mode === 'gameover') return;
      const item = { text, color: color || '#ffffff', life: .8, max: .8 };
      if (!this.activeTransient) this.activeTransient = item;
      else if (this.transientQueue.length < 3 && this.transientQueue[this.transientQueue.length - 1]?.text !== text) this.transientQueue.push(item);
    }
    updateParticles(dt) {
      for (const pool of this.fxSystems) for (const particle of pool) if (particle.active) {
        particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vx *= .94; particle.vy *= .94; if (particle.life <= 0) particle.active = false;
      }
    }
    updatePopups(dt) {
      if (this.reducedMotion || (this.run.banner && this.run.banner.timer > 0)) return;
      if (!this.activeTransient) return;
      this.activeTransient.life -= dt;
      if (this.activeTransient.life <= 0) this.activeTransient = this.transientQueue.shift() || null;
    }

    updateCoach() {
      let text = '';
      if (this.run.mode === 'tutorial') {
        const step = this.tutorialStep();
        text = step === 0 ? 'MOVE · queue a turn before the corner' : step === 1 ? 'POWER · take a gold node' : step === 2 ? 'FRIGHT · chasers flee for 8s' : step === 3 ? 'SHARD · orange shards boost score' : '';
        if (this.lastCoachStep !== step) { this.lastCoachStep = step; this.run.coachTimer = 3.2; }
        coachEl.classList.add('visible'); coachEl.classList.remove('fading');
        coachEl.classList.toggle('faded', this.run.coachTimer <= .35);
      } else { coachEl.classList.remove('visible', 'faded'); coachEl.classList.add('fading'); }
      setTextIfChanged(coachEl, text);
    }

    syncPublicState() {
      const state = window.__mp.state || boot;
      state.mode = this.run.mode; state.score = Math.floor(this.run.score); state.lives = this.run.lives; state.maze = this.run.mode === 'finale' ? 99 : this.run.mazeNumber; state.frightTimer = Number(this.run.frightTimer.toFixed(2)); state.circuit = this.run.circuitIndex + 1; state.family = this.maze ? this.maze.id : 'classic'; state.chaserAI = this.run.mode === 'finale' ? 'hunter' : (roleFromProbe(window.__mp.forceChaserAI, '') || 'mixed'); state.speedTier = this.run.circuitIndex + this.run.mazeIndex + 1; state.tutorialStep = this.tutorialStep(); state.seed = this.run.mazeSeed || this.run.seed; state.forceMaze = window.__mp.forceMaze; state.forceChaserAI = window.__mp.forceChaserAI; window.__mp.state = state;
    }

    updateDom() {
      const active = ['tutorial', 'run', 'shardRush', 'finale'].includes(this.run.mode);
      root.classList.toggle('active-play', active);
      setTextIfChanged(scoreEl, String(Math.floor(this.run.score)).padStart(6, '0'));
      setTextIfChanged(bestEl, String(Math.floor(this.profile.best)).padStart(6, '0'));
      setTextIfChanged(livesEl, '●'.repeat(Math.max(0, this.run.lives)));
      const fright = this.run.frightTimer > 0 ? this.run.frightTimer.toFixed(1) : '—';
      setTextIfChanged(frightEl, fright);
      frightEl.setAttribute('aria-label', this.run.frightTimer > 0 ? 'Power ' + fright + ' seconds' : 'Power ready');
      livesEl.setAttribute('aria-label', this.run.lives + ' lives remaining');
      bestEl.setAttribute('aria-label', 'Best score ' + String(Math.floor(this.profile.best)).padStart(6, '0'));
      const circuit = CIRCUITS[this.run.circuitIndex] || CIRCUITS[0];
      const mazeLabel = this.run.mode === 'finale' ? 'PRIME FINALE' : this.run.mode === 'shardRush' ? 'SHARD RUSH' : 'MAZE ' + String(this.run.mazeIndex + 1).padStart(2, '0');
      const runLabel = this.run.mode === 'finale' ? 'C' + (this.run.circuitIndex + 1) + ' · P' : 'C' + (this.run.circuitIndex + 1) + ' · M' + String(this.run.mazeIndex + 1).padStart(2, '0');
      setTextIfChanged(circuitEl, runLabel);
      circuitEl.setAttribute('aria-label', circuit.name + ' · ' + mazeLabel);
      const effects = [];
      if (this.run.speedTimer > 0) effects.push('↯ ' + this.run.speedTimer.toFixed(1));
      if (this.run.shieldTimer > 0) effects.push('⬡ ' + this.run.shieldTimer.toFixed(1));
      if (this.run.multiplier > 1) effects.push('×' + this.run.multiplier);
      if (this.run.mode === 'shardRush') effects.push('⌁ ' + this.run.rushTimer.toFixed(1));
      setTextIfChanged(effectsEl, effects.join('  ·  '));
      effectsEl.hidden = !active || !effects.length || this.run.mode === 'tutorial' || this.scale.height < 560;
    }

    rebuildMazeVisuals() {
      if (!this.mazeLayer || !this.pickupLayer || !this.add.image) return;
      this.mazeLayer.removeAll(true); this.pickupLayer.removeAll(true);
      this.wallSprites = []; this.floorSprites = []; this.pelletSprites = []; this.powerSprites = []; this.boostSprites = [];
      const add = (layer, texture) => { const sprite = this.add.image(0, 0, texture).setOrigin(.5); layer.add(sprite); return sprite; };
      for (let y = 0; y < this.maze.rows; y++) for (let x = 0; x < this.maze.cols; x++) {
        const entry = { x, y, sprite: add(this.mazeLayer, this.maze.walls[y][x] ? 'wall' : 'floor') };
        (this.maze.walls[y][x] ? this.wallSprites : this.floorSprites).push(entry);
      }
      for (const cell of this.maze.openCells) this.pelletSprites.push({ key: keyOf(cell.x, cell.y), x: cell.x, y: cell.y, sprite: add(this.pickupLayer, 'pellet') });
      this.powerSprites = this.maze.powerNodes.map((node) => ({ x: node.x, y: node.y, sprite: add(this.pickupLayer, 'power') }));
      this.boostSprites = this.maze.boosts.map((boost) => ({ x: boost.x, y: boost.y, type: boost.type, sprite: add(this.pickupLayer, 'boost') }));
      this.shardSprite = add(this.pickupLayer, 'shard'); this.visualLayoutKey = '';
    }

    positionMazeVisuals(layout) {
      if (!this.mazeLayer) return;
      const key = [layout.x, layout.y, layout.tile, this.maze.id].join(':');
      if (key === this.visualLayoutKey) return;
      this.visualLayoutKey = key;
      for (const entry of this.wallSprites.concat(this.floorSprites)) entry.sprite.setPosition(layout.x + (entry.x + .5) * layout.tile, layout.y + (entry.y + .5) * layout.tile).setDisplaySize(layout.tile, layout.tile);
      for (const entry of this.pelletSprites.concat(this.powerSprites, this.boostSprites)) entry.sprite.setPosition(layout.x + (entry.x + .5) * layout.tile, layout.y + (entry.y + .5) * layout.tile).setDisplaySize(layout.tile, layout.tile);
      if (this.shardSprite) this.shardSprite.setDisplaySize(layout.tile, layout.tile);
    }

    setSpriteState(sprite, texture, point, size, tint, scale) {
      if (!sprite) return;
      if (sprite.texture && sprite.texture.key !== texture && sprite.setTexture) sprite.setTexture(texture);
      if (sprite.setPosition) sprite.setPosition(point.x, point.y);
      if (sprite.setDisplaySize) sprite.setDisplaySize(size, size);
      if (sprite.setTint) sprite.setTint(tint);
      if (sprite.setScale) sprite.setScale(scale || 1);
      if (sprite.setVisible) sprite.setVisible(true);
    }

    showActionCard(title, copy, buttonText) {
      if (titleMenuEl) titleMenuEl.hidden = false;
      if (titleCopyEl) titleCopyEl.textContent = copy;
      const button = document.getElementById('title-start');
      if (button) button.textContent = buttonText || 'DEPLOY RUN';
      if (titleMenuEl && titleMenuEl.querySelector) { const heading = titleMenuEl.querySelector('strong'); if (heading) heading.textContent = title; }
    }

    hideActionCard() {
      if (titleMenuEl) titleMenuEl.hidden = true;
      const button = document.getElementById('title-start');
      if (button) button.textContent = 'DEPLOY RUN';
    }

    actionFromShell() {
      if (this.run.mode === 'title') this.startFromTitle();
      else if (this.run.mode === 'gameover') kit.restart();
      else if (this.run.mode === 'between') this.continueSequence();
    }

    layout() {
      const width = this.scale.width; const height = this.scale.height;
      const top = height < 560 ? 108 : 154; const bottom = Math.max(112, height * .17);
      const tile = Math.max(10, Math.min((width - 28) / this.maze.cols, (height - top - bottom) / this.maze.rows));
      return { tile, x: (width - this.maze.cols * tile) / 2, y: top + Math.max(0, (height - top - bottom - this.maze.rows * tile) / 2) };
    }
    px(layout, x, y) { return { x: layout.x + (x + .5) * layout.tile, y: layout.y + (y + .5) * layout.tile }; }

    draw() {
      if (!this.maze) return;
      this.updateDom();
      const layout = this.layout(); const width = this.scale.width; const height = this.scale.height;
      const palette = this.maze.spec;
      this.positionMazeVisuals(layout);
      if (this.world.setPosition) this.world.setPosition(this.juiceFrame.dx, this.juiceFrame.dy);
      if (this.fx.setPosition) this.fx.setPosition(this.juiceFrame.dx, this.juiceFrame.dy);
      this.background.clear(); this.background.fillStyle(0x060a18, 1); this.background.fillRect(0, 0, width, height);
      for (let i = 0; i < 32; i++) { const sx = (i * 83 + 29) % width; const sy = (i * 137 + 13) % height; this.background.fillStyle(i % 3 ? 0x354eae : 0x5effdc, .13 + (i % 4) * .025); this.background.fillCircle(sx, sy, 1 + i % 3); }
      this.background.fillStyle(palette.color, .06); this.background.fillCircle(width * .5, layout.y + layout.tile * this.maze.rows * .45, Math.min(width, height) * .42);
      this.background.fillStyle(0x080e27, .96); this.background.fillRoundedRect(layout.x - 7, layout.y - 7, this.maze.cols * layout.tile + 14, this.maze.rows * layout.tile + 14, 17);
      this.world.clear();
      this.drawShortcuts(layout); this.drawPickups(layout); this.drawActors(layout); this.drawFx(layout); this.drawBanner(width, height);
      this.drawDamageOverlay(width, height);
    }

    drawShortcuts(layout) {
      for (const shortcut of this.maze.shortcuts) {
        const from = this.px(layout, shortcut.from.x, shortcut.from.y); const to = this.px(layout, shortcut.to.x, shortcut.to.y);
        this.world.lineStyle(2, this.maze.spec.accent, .6); this.world.beginPath(); this.world.moveTo(from.x, from.y); this.world.lineTo(to.x, to.y); this.world.strokePath();
        this.world.fillStyle(this.maze.spec.accent, .9); this.world.fillCircle(from.x, from.y, layout.tile * .18); this.world.fillCircle(to.x, to.y, layout.tile * .18);
        this.world.lineStyle(1, 0xffffff, .65); this.world.strokeCircle(from.x, from.y, layout.tile * .31); this.world.strokeCircle(to.x, to.y, layout.tile * .31);
      }
      if (this.maze.warpRow >= 0) {
        const y = layout.y + (this.maze.warpRow + .5) * layout.tile; this.world.lineStyle(3, this.maze.spec.accent, .34); this.world.moveTo(layout.x - 4, y); this.world.lineTo(layout.x + layout.tile * 1.6, y); this.world.moveTo(layout.x + this.maze.cols * layout.tile - layout.tile * 1.6, y); this.world.lineTo(layout.x + this.maze.cols * layout.tile + 4, y); this.world.strokePath();
      }
    }

    drawPickups(layout) {
      for (const entry of this.pelletSprites) entry.sprite.setVisible(this.run.mode !== 'shardRush' && this.maze.pellets.has(entry.key));
      this.maze.powerNodes.forEach((node, index) => {
        const entry = this.powerSprites[index]; if (!entry) return;
        const point = this.px(layout, node.x, node.y); const pulse = this.reducedMotion ? 1 : 1 + Math.sin(this.simTime * 5 + node.x) * .15;
        entry.sprite.setVisible(node.active).setPosition(point.x, point.y).setScale(pulse);
      });
      const glyphs = { speed: 'S', shield: 'H', life: '+1', multiplier: '×' };
      this.maze.boosts.forEach((boost, index) => {
        const entry = this.boostSprites[index]; const label = this.boostLabels[index]; if (!entry) return;
        const point = this.px(layout, boost.x, boost.y); const color = boost.type === 'life' ? 0xff78b8 : boost.type === 'shield' ? 0xa990ff : boost.type === 'speed' ? 0x68d7ff : 0xffbd62;
        entry.sprite.setVisible(boost.active).setPosition(point.x, point.y).setTint(color);
        label.setVisible(boost.active).setPosition(point.x, point.y).setColor('#ffffff'); setTextIfChanged(label, glyphs[boost.type] || '+');
      });
      if (this.shardSprite) {
        const point = this.px(layout, this.shard ? this.shard.x : 0, this.shard ? this.shard.y : 0);
        this.shardSprite.setVisible(!!(this.shard && this.shard.active)).setPosition(point.x, point.y).setScale(this.reducedMotion ? 1 : 1 + Math.sin(this.simTime * 5) * .08);
      }
    }

    drawActors(layout) {
      const frightened = this.run.frightTimer > 0;
      for (let i = 0; i < this.chasers.length; i++) {
        const chaser = this.chasers[i]; const sprite = this.chaserSprites[i]; const badge = this.chaserBadges[i];
        const point = this.px(layout, chaser.x, chaser.y); const moving = chaser.dir !== DIRS.none; const state = chaser.caught ? 'caught' : frightened ? 'frightened' : moving ? 'move' : 'idle';
        if (chaser.animState !== state) { chaser.animState = state; chaser.animFrame = 0; chaser.animClock = this.simTime; }
        const pulse = !this.reducedMotion && moving ? 1 + Math.sin((this.simTime - chaser.animClock) * 12) * .045 : 1;
        const texture = chaser.caught ? 'chaserCaught' : frightened ? 'chaserFrightened' : 'chaser';
        this.setSpriteState(sprite, texture, point, layout.tile * 1.08, frightened ? 0x93a9ec : chaser.color, pulse);
        badge.setVisible(!chaser.caught).setPosition(point.x, point.y - layout.tile * .02).setColor('#' + chaser.color.toString(16).padStart(6, '0')); setTextIfChanged(badge, chaser.icon);
      }
      if (this.player) {
        const point = this.px(layout, this.player.x, this.player.y); const caught = this.run.caughtTimer > 0; const moving = this.player.dir !== DIRS.none; const power = this.run.frightTimer > 0; const state = caught ? 'caught' : power ? 'power' : moving ? 'move' : 'idle';
        if (this.player.animState !== state) { this.player.animState = state; this.player.animClock = this.simTime; }
        const texture = caught ? 'runnerCaught' : power ? 'runnerPower' : moving ? 'runnerMove' : 'runnerIdle';
        const visible = !caught || this.reducedMotion || Math.floor(this.simTime * 14) % 2 === 0;
        this.setSpriteState(this.runnerSprite, texture, point, layout.tile * 1.18, power ? 0xffe36e : caught ? 0xff667f : 0x5effdc, !this.reducedMotion && moving ? 1 + Math.sin((this.simTime - this.player.animClock) * 14) * .04 : 1);
        if (this.runnerSprite) this.runnerSprite.setVisible(visible);
      }
    }

    drawFx(layout) {
      this.fx.clear();
      for (const pool of this.fxSystems) for (const particle of pool) if (particle.active) { const point = this.px(layout, particle.x, particle.y); this.fx.fillStyle(particle.color, clamp(particle.life / particle.max, 0, 1)); this.fx.fillCircle(point.x, point.y, particle.size * layout.tile); }
      const transient = this.activeTransient;
      const show = transient && (!this.run.banner || this.run.banner.timer <= 0) && this.run.mode !== 'tutorial' && this.scale.height >= 560;
      if (!show) { this.popupBack.clear(); this.popupText.setVisible(false); return; }
      const boxW = Math.min(154, this.scale.width - 28); const boxH = 30; const x = this.scale.width - boxW - 14; const y = 116;
      const alpha = clamp(Math.min(1, transient.life * 5), 0, 1);
      this.popupBack.clear(); this.popupBack.fillStyle(0x07132c, .78 * alpha); this.popupBack.fillRoundedRect(x, y, boxW, boxH, 8); this.popupBack.lineStyle(1, 0x5effdc, .42 * alpha); this.popupBack.strokeRoundedRect(x, y, boxW, boxH, 8);
      this.popupText.setVisible(true).setPosition(x + boxW / 2, y + boxH / 2).setAlpha(alpha).setColor(transient.color); setTextIfChanged(this.popupText, transient.text);
    }

    drawDamageOverlay(width, height) {
      this.damageOverlay.clear();
      if (this.run.caughtTimer <= 0) return;
      const alpha = clamp(this.run.caughtTimer / .65, 0, 1) * .34;
      this.damageOverlay.fillStyle(0xff334e, alpha); this.damageOverlay.fillRect(0, 0, width, 18); this.damageOverlay.fillRect(0, height - 18, width, 18); this.damageOverlay.fillRect(0, 0, 18, height); this.damageOverlay.fillRect(width - 18, 0, 18, height);
    }

    drawBanner(width, height) {
      const banner = this.run.banner;
      if (!banner || banner.boundary === false || !Number.isFinite(banner.timer) || banner.timer <= 0) { this.bannerBack.clear(); this.bannerText.setVisible(false); this.bannerSub.setVisible(false); return; }
      const age = banner.duration - banner.timer; const intro = clamp(age / .42, 0, 1); const ease = this.reducedMotion ? 1 : 1 + Math.sin(intro * Math.PI * .5) * .08; const alpha = clamp(Math.min(1, banner.timer * 2), 0, 1); const boxW = Math.min(width * .58, 280); const boxH = 54; const centerY = height * .42;
      this.bannerBack.clear(); this.bannerBack.fillStyle(0x07132c, .92 * alpha); this.bannerBack.fillRoundedRect((width - boxW) / 2, centerY - boxH / 2, boxW, boxH, 18); this.bannerBack.lineStyle(2, banner.color, .7 * alpha); this.bannerBack.strokeRoundedRect((width - boxW) / 2, centerY - boxH / 2, boxW, boxH, 18);
      this.bannerText.setVisible(true).setPosition(width / 2, centerY - 9).setScale(ease).setAlpha(alpha).setColor('#' + banner.color.toString(16).padStart(6, '0')); setTextIfChanged(this.bannerText, banner.title);
      this.bannerSub.setVisible(true).setPosition(width / 2, centerY + 18).setAlpha(alpha); setTextIfChanged(this.bannerSub, banner.subtitle);
    }

    update(_time, delta) {
      if (!this.maze || !kit || kit.paused) { this.draw(); return; }
      this.juiceFrame = kit.juice.frame ? kit.juice.frame() : { dx: 0, dy: 0, frozen: false };
      if (this.juiceFrame.frozen) { this.draw(); return; }
      this.pollInput();
      // Clamp wall-clock input before the fixed-step loop. A slow device plays
      // in slow motion rather than letting gameplay time jump past simulation.
      this.accumulator += Math.min(Math.max((delta || 0) / 1000, 0), .05);
      while (this.accumulator >= STEP) { this.simulate(STEP); this.accumulator -= STEP; }
      this.draw();
    }
  }

  function seedControlPointer(event) {
    if (!kit || kit.paused) return;
    kit.input.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, downAt: performance.now(), zone: 'button', gestureDone: true });
  }
  function wireControls() {
    document.querySelectorAll('.pad').forEach((button) => button.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); seedControlPointer(event); if (scene) scene.requestDirection(DIRS[button.dataset.dir]); }, { passive: false }));
    const settings = document.getElementById('settings');
    const pause = document.getElementById('pause');
    const fullscreen = document.getElementById('fullscreen');
    const titleStart = document.getElementById('title-start');
    const openSettings = (event) => { event.preventDefault(); event.stopPropagation(); kit.openSettings([
      (box) => {
        const heading = document.createElement('div'); heading.textContent = 'Volume'; heading.style.cssText = 'color:#91a6c9;font-size:12px;font-weight:700;min-width:min(70vw,280px);'; box.appendChild(heading);
        [['Music', 'music', kit.audio.setMusicVolume], ['SFX', 'sfx', kit.audio.setSfxVolume]].forEach(([label, key, setter]) => {
          const wrap = document.createElement('label'); wrap.style.cssText = 'display:flex;align-items:center;gap:10px;color:#e8eef4;font-size:13px;min-width:min(70vw,280px);';
          const name = document.createElement('span'); name.textContent = label; name.style.width = '42px';
          const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '.05'; input.value = String(kit.audio.prefs[key]); input.setAttribute('aria-label', label + ' volume'); input.style.flex = '1'; input.addEventListener('input', () => setter.call(kit.audio, Number(input.value)));
          wrap.appendChild(name); wrap.appendChild(input); box.appendChild(wrap);
        });
      }
    ]); };
    settings.addEventListener('click', openSettings);
    pause.addEventListener('click', (event) => { event.preventDefault(); if (!scene) return; if (kit.paused) kit.resume('manual'); else kit.pause('manual'); pause.textContent = kit.paused ? '▶' : 'Ⅱ'; pause.setAttribute('aria-label', kit.paused ? 'Resume game' : 'Pause game'); });
    fullscreen.addEventListener('click', (event) => { event.preventDefault(); kit.requestFullscreen(); });
    titleStart.addEventListener('click', (event) => { event.preventDefault(); if (scene) scene.actionFromShell(); });
  }

  if (!PhaserRef || !GGKitRef) {
    window.__mp.state.mode = 'boot-error';
    setTextIfChanged(coachEl, 'Engine files are unavailable. Reload the local title shell.');
    coachEl.classList.add('visible');
  } else {
    kit = GGKitRef.create({
      slug: 'mazerunner-prime', orientation: 'portrait', validateSave: validProfile,
      onPause: () => { if (scene) scene.accumulator = 0; },
      onResume: () => {},
      onRestart: () => { if (scene) { scene.profile = kit.save.get({ best: 0, unlockedCircuit: 1, tutorialSeen: false }); scene.startSession(false); } }
    });
    kit.audio.register({
      'pellet-chomp': 'assets/pellet-chomp.mp3', 'power-siren': 'assets/power-siren.mp3',
      'chase-stem': 'assets/chase-stem.mp3', 'fright-stem': 'assets/fright-stem.mp3', 'danger-stem': 'assets/danger-stem.mp3', 'catch-stinger': 'assets/catch-stinger.mp3',
      'turn-click': 'assets/turn-click.mp3', 'multiplier-rise': 'assets/multiplier-rise.mp3', 'shield-pop': 'assets/shield-pop.mp3', 'life-chime': 'assets/life-chime.mp3',
      'gate-whoosh': 'assets/gate-whoosh.mp3', 'danger-warning': 'assets/danger-warning.mp3', 'completion-fanfare': 'assets/completion-fanfare.mp3'
    });
    new PhaserRef.Game({
      type: PhaserRef.AUTO, parent: 'game', width: 390, height: 844, backgroundColor: '#060a18',
      scene: [MainScene], scale: { mode: PhaserRef.Scale.RESIZE, autoCenter: PhaserRef.Scale.CENTER_BOTH },
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
      fps: { target: 60, forceSetTimeOut: false }
    });
    wireControls();
  }
})();
