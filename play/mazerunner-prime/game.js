(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const levelEl = document.getElementById('level');
  const livesEl = document.getElementById('lives');
  const hintEl = document.getElementById('hint');
  const stateCard = document.getElementById('state-card');
  const stateTitle = document.getElementById('state-title');
  const stateCopy = document.getElementById('state-copy');
  const rotateCard = document.getElementById('rotate-card');

  const TAU = Math.PI * 2;
  const DIRS = {
    up: { x: 0, y: -1, angle: -Math.PI / 2 },
    down: { x: 0, y: 1, angle: Math.PI / 2 },
    left: { x: -1, y: 0, angle: Math.PI },
    right: { x: 1, y: 0, angle: 0 },
    none: { x: 0, y: 0, angle: 0 }
  };
  const DIR_LIST = [DIRS.up, DIRS.right, DIRS.down, DIRS.left];
  const inputDirs = {
    ArrowUp: DIRS.up, w: DIRS.up, W: DIRS.up,
    ArrowDown: DIRS.down, s: DIRS.down, S: DIRS.down,
    ArrowLeft: DIRS.left, a: DIRS.left, A: DIRS.left,
    ArrowRight: DIRS.right, d: DIRS.right, D: DIRS.right
  };
  const COLORS = {
    wall: '#203b87', wallHi: '#3c63c4', corridor: '#090f2c',
    player: '#72f4e1', playerHi: '#e6fffa',
    direct: '#ff648c', ahead: '#ffb861', flank: '#b68cff', wander: '#62aaff'
  };

  let width = 390;
  let height = 700;
  let backingScale = 1;
  let lastTime = 0;
  let elapsed = 0;
  let baseSeed = (Date.now() ^ 0x9e3779b9) >>> 0;
  let rng = null;
  let level = 1;
  let score = 0;
  let best = readBest();
  let lives = 3;
  let gameState = 'playing';
  let maze = null;
  let player = null;
  let chasers = [];
  let particles = [];
  let powerTimer = 0;
  let hitCooldown = 0;
  let bannerTimer = 0;
  let shardCooldown = 9;
  let shard = null;
  let shake = 0;
  let hintTimer = 8;
  let pointerStart = null;
  let orientationBlocked = false;

  function readBest() {
    try { const value = Number(localStorage.getItem('neon-run-best') || 0); return Number.isFinite(value) && value >= 0 ? value : 0; } catch (_) { return 0; }
  }

  function saveBest() {
    if (score <= best) return;
    best = score;
    try { localStorage.setItem('neon-run-best', String(best)); } catch (_) {}
  }

  function random() {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  }

  function setupRng(seed) { rng = seed >>> 0; }

  function resize() {
    width = Math.max(280, window.innerWidth);
    height = Math.max(500, window.innerHeight);
    const cssLong = Math.max(width, height);
    backingScale = Math.min(window.devicePixelRatio || 1, 2, 960 / cssLong);
    canvas.width = Math.max(1, Math.round(width * backingScale));
    canvas.height = Math.max(1, Math.round(height * backingScale));
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(backingScale, 0, 0, backingScale, 0, 0);
    updateOrientation();
  }

  function updateOrientation() {
    orientationBlocked = window.innerWidth > window.innerHeight;
    rotateCard.classList.toggle('visible', orientationBlocked);
  }

  function key(x, y) { return x + ',' + y; }

  function createMaze() {
    const cols = 17;
    const rows = 25;
    const walls = Array.from({ length: rows }, () => Array(cols).fill(true));
    const cellW = (cols - 1) / 2;
    const cellH = (rows - 1) / 2;
    const seen = Array.from({ length: cellH }, () => Array(cellW).fill(false));
    const stack = [{ x: Math.floor(cellW / 2), y: Math.floor(cellH / 2) }];
    const carveCell = (cx, cy) => { walls[cy * 2 + 1][cx * 2 + 1] = false; };
    carveCell(stack[0].x, stack[0].y);
    seen[stack[0].y][stack[0].x] = true;
    while (stack.length) {
      const current = stack[stack.length - 1];
      const candidates = [];
      for (const d of [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]) {
        const nx = current.x + d.x;
        const ny = current.y + d.y;
        if (nx >= 0 && nx < cellW && ny >= 0 && ny < cellH && !seen[ny][nx]) candidates.push({ x: nx, y: ny, d });
      }
      if (!candidates.length) { stack.pop(); continue; }
      const choice = candidates[Math.floor(random() * candidates.length)];
      const gx = current.x * 2 + 1;
      const gy = current.y * 2 + 1;
      walls[gy + choice.d.y][gx + choice.d.x] = false;
      carveCell(choice.x, choice.y);
      seen[choice.y][choice.x] = true;
      stack.push({ x: choice.x, y: choice.y });
    }

    // Add selective cross-links so the route has honest loops and alternate escapes.
    for (let i = 0; i < 18; i++) {
      const x = 1 + Math.floor(random() * (cols - 2));
      const y = 1 + Math.floor(random() * (rows - 2));
      if ((x + y) % 2 === 1) {
        if (x < cols - 2 && walls[y][x + 1]) walls[y][x + 1] = false;
        else if (y < rows - 2 && walls[y + 1][x]) walls[y + 1][x] = false;
      }
    }

    const warpRow = rows % 2 === 0 ? rows / 2 : rows - 2;
    walls[warpRow][0] = false;
    walls[warpRow][1] = false;
    walls[warpRow][cols - 2] = false;
    walls[warpRow][cols - 1] = false;
    // Keep the hub and its four exits legible on every seed.
    const hub = { x: Math.floor(cols / 2), y: Math.floor(rows / 2) };
    walls[hub.y][hub.x] = false;
    for (const d of DIR_LIST) {
      const nx = hub.x + d.x;
      const ny = hub.y + d.y;
      if (nx > 0 && nx < cols - 1 && ny > 0 && ny < rows - 1) walls[ny][nx] = false;
    }

    const powerNodes = [
      { x: 1, y: 1, active: true }, { x: cols - 2, y: 1, active: true },
      { x: 1, y: rows - 2, active: true }, { x: cols - 2, y: rows - 2, active: true }
    ];
    for (const node of powerNodes) walls[node.y][node.x] = false;

    const pellets = new Set();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!walls[y][x] && !(x === hub.x && y === hub.y) && !powerNodes.some(p => p.x === x && p.y === y)) pellets.add(key(x, y));
      }
    }
    return { cols, rows, walls, warpRow, hub, powerNodes, pellets, totalPellets: pellets.size };
  }

  function buildLevel() {
    setupRng((baseSeed + Math.imul(level, 2654435761)) >>> 0);
    maze = createMaze();
    player = { x: maze.hub.x, y: maze.hub.y, dir: DIRS.left, nextDir: DIRS.left, speed: 4.25 + level * .18 };
    chasers = [
      makeChaser('Vector', 'direct', COLORS.direct, 3.14 + level * .15, 0),
      makeChaser('Fore', 'ahead', COLORS.ahead, 3.02 + level * .15, 1),
      makeChaser('Tailwind', 'flank', COLORS.flank, 2.9 + level * .15, 2),
      makeChaser('Driftlock', 'wander', COLORS.wander, 2.72 + level * .14, 3)
    ];
    powerTimer = 0;
    hitCooldown = 1.1;
    bannerTimer = 1.35;
    shardCooldown = 8 + random() * 4;
    shard = { active: false, x: maze.hub.x, y: maze.hub.y, phase: random() * TAU };
    updateHud();
  }

  function makeChaser(name, type, color, speed, offset) {
    const h = maze.hub;
    const home = { x: h.x + (offset % 2 ? 0 : (offset === 0 ? -1 : 1)), y: h.y + (offset > 1 ? 1 : -1) };
    const chaser = { name, type, color, speed, x: home.x, y: home.y, dir: DIRS.up, nextDir: DIRS.up, home, eaten: false, respawn: 0, locked: false, wanderTarget: null, pulse: random() * TAU };
    if (!canMove(home.x, home.y)) { chaser.home = { x: h.x, y: h.y }; chaser.x = h.x; chaser.y = h.y; }
    return chaser;
  }

  function canMove(x, y) {
    if (!maze) return false;
    if (y === maze.warpRow && (x < 0 || x >= maze.cols)) return true;
    if (x < 0 || x >= maze.cols || y < 0 || y >= maze.rows) return false;
    return !maze.walls[y][x];
  }

  function wrappedX(x) {
    if (x < 0) return x + maze.cols;
    if (x >= maze.cols) return x - maze.cols;
    return x;
  }

  function legalDirs(x, y) {
    return DIR_LIST.filter(d => canMove(x + d.x, y + d.y));
  }

  function tileDistance(a, b) {
    let dx = Math.abs(a.x - b.x);
    if (maze && dx > maze.cols / 2) dx = maze.cols - dx;
    return dx + Math.abs(a.y - b.y);
  }

  function targetFor(chaser) {
    const px = Math.round(player.x);
    const py = Math.round(player.y);
    if (chaser.type === 'direct') return { x: px, y: py };
    if (chaser.type === 'ahead') return { x: px + player.dir.x * 5, y: py + player.dir.y * 5 };
    if (chaser.type === 'flank') return { x: px - player.dir.x * 6, y: py - player.dir.y * 6 };
    if (!chaser.locked && tileDistance(chaser, player) < 8) chaser.locked = true;
    if (chaser.locked) return { x: px, y: py };
    if (!chaser.wanderTarget || tileDistance(chaser, chaser.wanderTarget) < 2 || !canMove(chaser.wanderTarget.x, chaser.wanderTarget.y)) {
      const open = [];
      for (let y = 1; y < maze.rows - 1; y++) for (let x = 1; x < maze.cols - 1; x++) if (!maze.walls[y][x]) open.push({ x, y });
      chaser.wanderTarget = open[Math.floor(random() * open.length)];
    }
    return chaser.wanderTarget;
  }

  function bfsDirection(startX, startY, target, flee) {
    const sx = Math.max(0, Math.min(maze.cols - 1, Math.round(startX)));
    const sy = Math.max(0, Math.min(maze.rows - 1, Math.round(startY)));
    let tx = Math.max(0, Math.min(maze.cols - 1, Math.round(target.x)));
    let ty = Math.max(0, Math.min(maze.rows - 1, Math.round(target.y)));
    if (!canMove(tx, ty)) { tx = maze.hub.x; ty = maze.hub.y; }
    const origin = key(sx, sy);
    const queue = [{ x: sx, y: sy }];
    const came = new Map([[origin, null]]);
    while (queue.length) {
      const current = queue.shift();
      if (current.x === tx && current.y === ty) break;
      for (const d of DIR_LIST) {
        let nx = current.x + d.x;
        const ny = current.y + d.y;
        if (ny === maze.warpRow && (nx < 0 || nx >= maze.cols)) nx = wrappedX(nx);
        if (!canMove(nx, ny)) continue;
        const k = key(nx, ny);
        if (!came.has(k)) { came.set(k, { x: current.x, y: current.y, d }); queue.push({ x: nx, y: ny }); }
      }
    }
    const endKey = key(tx, ty);
    if (!came.has(endKey)) return null;
    let cursor = { x: tx, y: ty };
    let first = null;
    while (key(cursor.x, cursor.y) !== origin) {
      const step = came.get(key(cursor.x, cursor.y));
      if (!step) break;
      first = step.d;
      cursor = { x: step.x, y: step.y };
    }
    if (!flee) return first;
    return null;
  }

  function fleeDirection(chaser) {
    const options = legalDirs(Math.round(chaser.x), Math.round(chaser.y));
    if (!options.length) return DIRS.none;
    let bestDir = options[0];
    let bestDistance = -Infinity;
    for (const d of options) {
      const nx = wrappedX(Math.round(chaser.x) + d.x);
      const ny = Math.round(chaser.y) + d.y;
      const distance = tileDistance({ x: nx, y: ny }, { x: player.x, y: player.y });
      const jitter = random() * .35;
      if (distance + jitter > bestDistance) { bestDistance = distance + jitter; bestDir = d; }
    }
    return bestDir;
  }

  function chooseChaserDir(chaser) {
    const x = Math.round(chaser.x);
    const y = Math.round(chaser.y);
    let chosen = powerTimer > 0 ? fleeDirection(chaser) : bfsDirection(x, y, targetFor(chaser), false);
    const options = legalDirs(x, y);
    if (!chosen || !canMove(x + chosen.x, y + chosen.y)) {
      const filtered = options.filter(d => !(d.x === -chaser.dir.x && d.y === -chaser.dir.y));
      chosen = filtered[Math.floor(random() * Math.max(1, filtered.length))] || options[0] || DIRS.none;
    }
    chaser.nextDir = chosen;
  }

  function updateActor(actor, dt, isPlayer) {
    const speed = actor.speed;
    let remaining = speed * dt;
    let guard = 0;
    while (remaining > 0 && guard++ < 3) {
      const tx = Math.round(actor.x);
      const ty = Math.round(actor.y);
      const atTile = Math.abs(actor.x - tx) < .04 && Math.abs(actor.y - ty) < .04;
      if (atTile) {
        actor.x = tx; actor.y = ty;
        const requested = actor.nextDir || DIRS.none;
        if (canMove(tx + requested.x, ty + requested.y)) actor.dir = requested;
        else if (!canMove(tx + actor.dir.x, ty + actor.dir.y)) actor.dir = DIRS.none;
        if (!isPlayer) chooseChaserDir(actor);
        if (isPlayer && canMove(tx + actor.nextDir.x, ty + actor.nextDir.y)) actor.dir = actor.nextDir;
        if (actor.dir.x === 0 && actor.dir.y === 0) break;
      }
      const step = Math.min(remaining, .18);
      const nx = actor.x + actor.dir.x * step;
      const ny = actor.y + actor.dir.y * step;
      if (actor.dir.x && !canMove(Math.round(actor.x + actor.dir.x * .51), Math.round(actor.y))) {
        actor.x = Math.round(actor.x); actor.dir = DIRS.none; break;
      }
      if (actor.dir.y && !canMove(Math.round(actor.x), Math.round(actor.y + actor.dir.y * .51))) {
        actor.y = Math.round(actor.y); actor.dir = DIRS.none; break;
      }
      actor.x = nx; actor.y = ny;
      if (actor.y === maze.warpRow && actor.x < 0) actor.x += maze.cols;
      if (actor.y === maze.warpRow && actor.x >= maze.cols) actor.x -= maze.cols;
      remaining -= step;
    }
  }

  function addScore(points) {
    score += points;
    saveBest();
    updateHud();
  }

  function updateHud() {
    scoreEl.textContent = String(score).padStart(6, '0');
    bestEl.textContent = String(best).padStart(6, '0');
    levelEl.textContent = String(level).padStart(2, '0');
    livesEl.textContent = '●'.repeat(Math.max(0, lives));
  }

  function spawnBurst(x, y, color, count, force) {
    for (let i = 0; i < count; i++) {
      const angle = random() * TAU;
      const speed = force * (.5 + random());
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .35 + random() * .55, max: .9, color, size: .06 + random() * .1 });
    }
  }

  function loseLife() {
    if (hitCooldown > 0 || gameState !== 'playing') return;
    lives -= 1;
    hitCooldown = 2;
    shake = .55;
    spawnBurst(player.x, player.y, '#ff648c', 26, 3.2);
    updateHud();
    if (lives <= 0) {
      gameState = 'gameover';
      showState('RUN ENDED', 'Final score ' + String(score).padStart(6, '0') + ' · best ' + String(best).padStart(6, '0'));
      return;
    }
    player.x = maze.hub.x; player.y = maze.hub.y; player.dir = DIRS.left; player.nextDir = DIRS.left;
    for (const chaser of chasers) { chaser.x = chaser.home.x; chaser.y = chaser.home.y; chaser.eaten = false; chaser.respawn = 0; }
  }

  function showState(title, copy) {
    stateTitle.textContent = title;
    stateCopy.textContent = copy;
    stateCard.classList.add('visible');
  }

  function hideState() { stateCard.classList.remove('visible'); }

  function restart() {
    score = 0; lives = 3; level = 1; elapsed = 0; particles = []; shake = 0; lastTime = 0; pointerStart = null; baseSeed = (Date.now() ^ 0x9e3779b9) >>> 0;
    gameState = 'playing'; hintTimer = 8; hideState(); buildLevel();
  }

  function activateDirection(dir) {
    if (orientationBlocked) return;
    if (gameState === 'gameover') { restart(); return; }
    if (!dir) return;
    player.nextDir = dir;
    hintTimer = 0;
    tryStartAudio();
  }

  function checkPickups() {
    const px = Math.round(player.x);
    const py = Math.round(player.y);
    const pelletKey = key(px, py);
    if (maze.pellets.delete(pelletKey)) {
      addScore(10);
      spawnBurst(px, py, '#bfeaff', 3, .8);
      if (maze.pellets.size === 0) {
        addScore(500 * level);
        level += 1;
        buildLevel();
        return;
      }
    }
    for (const node of maze.powerNodes) {
      if (node.active && node.x === px && node.y === py) {
        node.active = false; powerTimer = 8; addScore(50); shake = .18;
        spawnBurst(node.x, node.y, '#ffe36e', 18, 2.4);
      }
    }
    if (shard.active && tileDistance(player, shard) < .75) {
      shard.active = false; shardCooldown = 13 + random() * 7; addScore(250); shake = .25;
      spawnBurst(shard.x, shard.y, '#ffbd62', 24, 2.6);
    }
  }

  function checkChaserHits() {
    if (hitCooldown > 0) return;
    for (const chaser of chasers) {
      if (chaser.eaten || chaser.respawn > 0) continue;
      if (tileDistance(player, chaser) < .58) {
        if (powerTimer > 0) {
          chaser.eaten = true; chaser.respawn = 1.15; chaser.x = maze.hub.x; chaser.y = maze.hub.y;
          addScore(200); shake = .28; spawnBurst(player.x, player.y, chaser.color, 20, 2.7);
        } else { loseLife(); }
        break;
      }
    }
  }

  function update(dt) {
    if (orientationBlocked) return;
    elapsed += dt;
    const step = Math.min(dt, .045);
    if (bannerTimer > 0) bannerTimer -= step;
    if (hitCooldown > 0) hitCooldown -= step;
    if (shake > 0) shake -= step;
    if (powerTimer > 0) powerTimer = Math.max(0, powerTimer - step);
    if (hintTimer > 0) { hintTimer -= step; if (hintTimer <= 0) hintEl.classList.add('hidden'); }
    if (gameState !== 'playing') { updateParticles(step); return; }

    updateActor(player, step, true);
    for (const chaser of chasers) {
      if (chaser.eaten) { chaser.respawn -= step; if (chaser.respawn <= 0) { chaser.eaten = false; chaser.x = maze.hub.x; chaser.y = maze.hub.y; chaser.dir = DIRS.up; } continue; }
      updateActor(chaser, step, false);
    }
    checkPickups();
    checkChaserHits();
    if (shardCooldown > 0) shardCooldown -= step;
    if (!shard.active && shardCooldown <= 0) { shard.active = true; shard.x = maze.hub.x; shard.y = maze.hub.y; shard.phase = elapsed; }
    updateParticles(step);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .95; p.vy *= .95;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (particles.length > 180) particles.splice(0, particles.length - 180);
  }

  function layout() {
    const tile = Math.max(12, Math.min((width - 26) / maze.cols, (height - 160) / maze.rows));
    return { tile, x: (width - tile * maze.cols) / 2, y: Math.max(92, (height - tile * maze.rows) / 2 + 4) };
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + w, y, x + w, y + h, radius); ctx.arcTo(x + w, y + h, x, y + h, radius); ctx.arcTo(x, y + h, x, y, radius); ctx.arcTo(x, y, x + w, y, radius); ctx.closePath();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#070b1c'); gradient.addColorStop(.5, '#0d1230'); gradient.addColorStop(1, '#180a27');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = .16;
    for (let i = 0; i < 24; i++) {
      const x = (i * 83 + 31) % width; const y = (i * 137 + 21) % height;
      ctx.fillStyle = i % 3 === 0 ? '#72f4e1' : '#778bff'; ctx.beginPath(); ctx.arc(x, y, (i % 3) + .6, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMaze(box) {
    const t = box.tile;
    ctx.save();
    ctx.shadowColor = 'rgba(61, 99, 223, .28)'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#080d27'; roundRect(box.x - 5, box.y - 5, maze.cols * t + 10, maze.rows * t + 10, 16); ctx.fill();
    ctx.shadowBlur = 0;
    for (let y = 0; y < maze.rows; y++) {
      for (let x = 0; x < maze.cols; x++) {
        const px = box.x + x * t; const py = box.y + y * t;
        if (maze.walls[y][x]) {
          ctx.fillStyle = COLORS.wall; roundRect(px + t * .08, py + t * .08, t * .84, t * .84, t * .17); ctx.fill();
          ctx.fillStyle = COLORS.wallHi; ctx.globalAlpha = .42; roundRect(px + t * .17, py + t * .14, t * .5, t * .09, t * .04); ctx.fill(); ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = COLORS.corridor; ctx.fillRect(px, py, t, t);
        }
      }
    }
    // Warp tunnel glows show the cross-screen escape clearly.
    const wy = box.y + maze.warpRow * t + t / 2;
    const warpGradient = ctx.createLinearGradient(box.x, 0, box.x + t * 2, 0);
    warpGradient.addColorStop(0, 'rgba(114,244,225,.1)'); warpGradient.addColorStop(1, 'rgba(114,244,225,0)');
    ctx.fillStyle = warpGradient; ctx.fillRect(box.x, wy - t * .4, t * 2, t * .8);
    const warpGradient2 = ctx.createLinearGradient(box.x + maze.cols * t, 0, box.x + (maze.cols - 2) * t, 0);
    warpGradient2.addColorStop(0, 'rgba(114,244,225,.1)'); warpGradient2.addColorStop(1, 'rgba(114,244,225,0)');
    ctx.fillStyle = warpGradient2; ctx.fillRect(box.x + (maze.cols - 2) * t, wy - t * .4, t * 2, t * .8);
    ctx.restore();
  }

  function drawPickups(box) {
    const t = box.tile;
    for (const p of maze.pellets) {
      const split = p.split(','); const x = Number(split[0]); const y = Number(split[1]);
      ctx.fillStyle = '#b9eaff'; ctx.globalAlpha = .82; ctx.beginPath(); ctx.arc(box.x + (x + .5) * t, box.y + (y + .5) * t, Math.max(1.4, t * .075), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const node of maze.powerNodes) {
      if (!node.active) continue;
      const pulse = 1 + Math.sin(elapsed * 5 + node.x) * .13;
      ctx.save(); ctx.shadowColor = '#ffe36e'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffe36e'; ctx.beginPath(); ctx.arc(box.x + (node.x + .5) * t, box.y + (node.y + .5) * t, t * .27 * pulse, 0, TAU); ctx.fill(); ctx.restore();
    }
    if (shard && shard.active) {
      const sx = box.x + (shard.x + .5) * t; const sy = box.y + (shard.y + .5) * t;
      const spin = elapsed * 2.8 + shard.phase; const r = t * .36;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI / 4 + Math.sin(spin) * .2); ctx.shadowColor = '#ffbd62'; ctx.shadowBlur = 16; ctx.fillStyle = '#ffbd62'; roundRect(-r * .68, -r * .68, r * 1.36, r * 1.36, r * .18); ctx.fill(); ctx.fillStyle = '#fff2c9'; roundRect(-r * .28, -r * .5, r * .25, r * .72, r * .1); ctx.fill(); ctx.restore();
    }
  }

  function drawPlayer(box) {
    if (hitCooldown > 0 && Math.floor(elapsed * 13) % 2 === 0) return;
    const t = box.tile; const x = box.x + (player.x + .5) * t; const y = box.y + (player.y + .5) * t; const r = t * .42;
    ctx.save(); ctx.translate(x, y); ctx.rotate(player.dir.angle); ctx.shadowColor = COLORS.player; ctx.shadowBlur = 17; ctx.fillStyle = COLORS.player; ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * .72, -r * .82); ctx.lineTo(-r * .48, 0); ctx.lineTo(-r * .72, r * .82); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = COLORS.playerHi; ctx.beginPath(); ctx.arc(-r * .12, 0, r * .18, 0, TAU); ctx.fill(); ctx.restore();
  }

  function drawChasers(box) {
    const t = box.tile;
    for (const chaser of chasers) {
      if (chaser.eaten) continue;
      const x = box.x + (chaser.x + .5) * t; const y = box.y + (chaser.y + .5) * t; const r = t * .39;
      ctx.save(); ctx.translate(x, y); ctx.shadowColor = powerTimer > 0 ? '#6d80ff' : chaser.color; ctx.shadowBlur = 13;
      ctx.fillStyle = powerTimer > 0 ? (powerTimer < 2 && Math.floor(elapsed * 9) % 2 ? '#eaf0ff' : '#5a68c8') : chaser.color;
      ctx.beginPath(); ctx.arc(0, -r * .08, r, Math.PI, 0); ctx.lineTo(r, r * .75); ctx.lineTo(r * .5, r * .52); ctx.lineTo(0, r * .78); ctx.lineTo(-r * .5, r * .52); ctx.lineTo(-r, r * .75); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#f7f9ff'; ctx.beginPath(); ctx.arc(-r * .32, -r * .08, r * .18, 0, TAU); ctx.arc(r * .32, -r * .08, r * .18, 0, TAU); ctx.fill(); ctx.fillStyle = '#14204d'; ctx.beginPath(); ctx.arc(-r * .28 + chaser.dir.x * 2, -r * .08 + chaser.dir.y * 2, r * .08, 0, TAU); ctx.arc(r * .36 + chaser.dir.x * 2, -r * .08 + chaser.dir.y * 2, r * .08, 0, TAU); ctx.fill(); ctx.restore();
    }
  }

  function drawParticles(box) {
    const t = box.tile;
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(box.x + (p.x + .5) * t, box.y + (p.y + .5) * t, p.size * t, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    drawBackground();
    if (!maze) return;
    const box = layout();
    const sx = shake > 0 ? (random() - .5) * shake * 12 : 0;
    const sy = shake > 0 ? (random() - .5) * shake * 12 : 0;
    ctx.save(); ctx.translate(sx, sy);
    drawMaze(box); drawPickups(box); drawParticles(box); drawChasers(box); drawPlayer(box);
    ctx.restore();
    if (bannerTimer > 0 && gameState === 'playing') {
      ctx.globalAlpha = Math.min(1, bannerTimer * 2); ctx.fillStyle = '#eaf2ff'; ctx.textAlign = 'center'; ctx.font = '900 12px system-ui'; ctx.letterSpacing = '2px'; ctx.fillText('LEVEL ' + String(level).padStart(2, '0'), width / 2, box.y - 14); ctx.globalAlpha = 1;
    }
    if (powerTimer > 0) {
      ctx.fillStyle = '#ffe36e'; ctx.globalAlpha = .9; ctx.textAlign = 'center'; ctx.font = '900 10px system-ui'; ctx.fillText('HUNT ' + powerTimer.toFixed(1), width / 2, height - 111); ctx.globalAlpha = 1;
    }
  }

  function frame(time) {
    if (!lastTime) lastTime = time;
    const dt = Math.min(.05, (time - lastTime) / 1000);
    lastTime = time;
    update(dt); draw(); requestAnimationFrame(frame);
  }

  let audio = null;
  function tryStartAudio() {
    if (audio || !window.AudioContext && !window.webkitAudioContext) return;
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { audio = null; }
  }

  function pointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest && event.target.closest('.pad')) return;
    if (pointerStart) return;
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function pointerMove(event) { if (pointerStart && pointerStart.id === event.pointerId) event.preventDefault(); }

  function pointerUp(event) {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const start = pointerStart; pointerStart = null;
    const dx = event.clientX - start.x; const dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) { if (gameState === 'gameover') restart(); return; }
    if (Math.abs(dx) > Math.abs(dy)) activateDirection(dx > 0 ? DIRS.right : DIRS.left);
    else activateDirection(dy > 0 ? DIRS.down : DIRS.up);
    event.preventDefault();
  }

  function onKey(event) {
    if (inputDirs[event.key]) { event.preventDefault(); activateDirection(inputDirs[event.key]); return; }
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (gameState === 'gameover') restart(); else tryStartAudio(); }
  }

  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointermove', pointerMove, { passive: false });
  canvas.addEventListener('pointerup', pointerUp, { passive: false });
  canvas.addEventListener('pointercancel', (event) => { if (pointerStart && pointerStart.id === event.pointerId) pointerStart = null; });
  document.addEventListener('touchmove', event => { if (event.target === canvas || event.target.closest('#controls')) event.preventDefault(); }, { passive: false });
  window.addEventListener('keydown', onKey, { passive: false });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', updateOrientation);
  stateCard.addEventListener('pointerup', event => { event.preventDefault(); restart(); });
  stateCard.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') restart(); });
  document.querySelectorAll('.pad').forEach(button => {
    const activate = event => { event.preventDefault(); activateDirection(DIRS[button.dataset.dir]); };
    button.addEventListener('pointerdown', activate, { passive: false });
    button.addEventListener('click', activate, { passive: false });
  });

  resize();
  buildLevel();
  updateHud();
  requestAnimationFrame(frame);
})();
