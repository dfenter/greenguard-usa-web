(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const rotate = document.getElementById('rotate');
  const TAU = Math.PI * 2;
  const WORLD = { w: 900, h: 1400, pad: 34 };
  const VIEW_W = 560;
  const VIEW_H = 1000;
  const COLORS = {
    ink: '#07101b',
    field: '#0b1725',
    grid: '#122739',
    gridBright: '#1a3545',
    wall: '#253b4a',
    wallEdge: '#668b96',
    player: '#4de7dc',
    playerHot: '#d4fffb',
    enemy: '#ff6572',
    camper: '#ffb24c',
    flanker: '#d77cff',
    rico: '#ff667e',
    shell: '#fff4ad',
    mine: '#86f08e'
  };

  let W = 390;
  let H = 700;
  let scale = 0.7;
  let dpr = 1;
  let camera = { x: 170, y: 400 };
  let arena;
  let player;
  let enemies = [];
  let shells = [];
  let sparks = [];
  let debris = [];
  let deployedMines = [];
  let state = 'play';
  let level = 1;
  let kills = 0;
  let lives = 3;
  let score = 1;
  let best = readBest();
  let runSeed = (Date.now() ^ 0x51f15e) >>> 0;
  let levelBanner = '';
  let bannerTimer = 0;
  let clearTimer = 0;
  let respawnTimer = 0;
  let shake = 0;
  let lastTime = performance.now();
  let lastAim = { x: 450, y: 700 };
  let aimFlash = 0;
  let drivePointer = null;
  let pointers = new Map();
  let keys = Object.create(null);

  function readBest() {
    try { return Number(localStorage.getItem('ironclad-alley-best') || 0); } catch (e) { return 0; }
  }

  function saveBest() {
    if (score <= best) return;
    best = score;
    try { localStorage.setItem('ironclad-alley-best', String(best)); } catch (e) {}
  }

  function mulberry32(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function angleTo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
  function normAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }
  function approachAngle(a, b, amount) { return a + clamp(normAngle(b - a), -amount, amount); }

  function resize() {
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    scale = Math.min(W / VIEW_W, H / VIEW_H);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const longAxis = Math.max(W, H) * dpr;
    if (longAxis > 960) dpr *= 960 / longAxis;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    rotate.classList.toggle('show', W > H * 1.05);
  }

  function addWall(walls, x, y, w, h, kind) {
    if (w <= 0 || h <= 0) return;
    walls.push({ x, y, w, h, kind: kind || 'barrier' });
  }

  function makeArena(levelNumber) {
    const rnd = mulberry32((runSeed + Math.imul(levelNumber, 0x45d9f3b)) >>> 0);
    const walls = [];
    const slits = [];
    const addSafe = (x, y, w, h, kind) => {
      if (x < 54 || y < 54 || x + w > WORLD.w - 54 || y + h > WORLD.h - 54) return;
      addWall(walls, x, y, w, h, kind);
    };

    const crossY = levelNumber === 1 ? 750 : 610 + Math.floor(rnd() * 330);
    const gapX = 220 + Math.floor(rnd() * 340);
    const gapW = 84 + Math.floor(rnd() * 42);
    addSafe(64, crossY, gapX - 64, 24, 'slit');
    addSafe(gapX + gapW, crossY, 836 - gapX - gapW, 24, 'slit');
    slits.push({ x: gapX, y: crossY + 12, w: gapW, vertical: false });

    if (levelNumber === 1) {
      addSafe(282, 230, 24, 360, 'alley');
      addSafe(600, 860, 24, 330, 'alley');
      addSafe(590, 330, 180, 24, 'corner');
      addSafe(130, 1020, 220, 24, 'corner');
    } else {
      const vx = 180 + Math.floor(rnd() * 520);
      const vy = 210 + Math.floor(rnd() * 210);
      const vh = 230 + Math.floor(rnd() * 230);
      addSafe(vx, vy, 24, vh, 'alley');
      if (rnd() > 0.35) addSafe(vx, vy + vh + 112, 24, 220 + Math.floor(rnd() * 180), 'alley');

      const slitX = 140 + Math.floor(rnd() * 600);
      const slitY = 250 + Math.floor(rnd() * 700);
      const slitGap = 80 + Math.floor(rnd() * 35);
      addSafe(slitX, 80, 22, slitY - 80, 'slit');
      addSafe(slitX, slitY + slitGap, 22, 1220 - slitY - slitGap, 'slit');
      slits.push({ x: slitX + 11, y: slitY, w: 0, h: slitGap, vertical: true });

      const cornerX = 120 + Math.floor(rnd() * 590);
      const cornerY = 850 + Math.floor(rnd() * 220);
      addSafe(cornerX, cornerY, 250, 22, 'corner');
      addSafe(cornerX, cornerY - 175, 22, 197, 'corner');
      if (levelNumber > 2) {
        const cornerX2 = 570 + Math.floor(rnd() * 130);
        addSafe(cornerX2, 360, 200, 22, 'corner');
        addSafe(cornerX2, 360, 22, 145, 'corner');
      }
    }

    const pickups = [];
    const pickupCount = Math.min(3, 1 + Math.floor(levelNumber / 2));
    let attempts = 0;
    while (pickups.length < pickupCount && attempts++ < 100) {
      const p = { x: 100 + rnd() * 700, y: 160 + rnd() * 1080 };
      if (!isBlockedIn(p, walls, 32) && dist(p, { x: 450, y: 1220 }) > 180 && pickups.every(q => dist(p, q) > 150)) pickups.push(p);
    }

    return { walls, slits, pickups, seed: runSeed + levelNumber };
  }

  function isBlockedIn(p, walls, radius) {
    if (p.x - radius < WORLD.pad || p.x + radius > WORLD.w - WORLD.pad || p.y - radius < WORLD.pad || p.y + radius > WORLD.h - WORLD.pad) return true;
    for (const wall of walls) if (circleRect(p.x, p.y, radius, wall)) return true;
    return false;
  }

  function circleRect(x, y, r, rect) {
    const nx = clamp(x, rect.x, rect.x + rect.w);
    const ny = clamp(y, rect.y, rect.y + rect.h);
    return Math.hypot(x - nx, y - ny) < r;
  }

  function resetRun() {
    runSeed = ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    level = 1;
    kills = 0;
    lives = 3;
    score = 1;
    state = 'play';
    clearTimer = 0;
    respawnTimer = 0;
    shake = 0;
    drivePointer = null;
    pointers.clear();
    for (const key in keys) delete keys[key];
    lastAim = { x: 450, y: 700 }; aimFlash = 0;
    shells.length = 0;
    sparks.length = 0;
    debris.length = 0;
    deployedMines.length = 0;
    player = makePlayer();
    createLevel();
  }

  function makePlayer() {
    return {
      x: 450, y: 1220, angle: -Math.PI / 2, turret: -Math.PI / 2,
      radius: 22, alive: true, shield: 1.1, mineCount: 0, color: COLORS.player
    };
  }

  function createLevel() {
    arena = makeArena(level);
    const spawnCandidates = [
      { x: 450, y: 160 }, { x: 130, y: 170 }, { x: 770, y: 180 },
      { x: 120, y: 540 }, { x: 780, y: 540 }, { x: 770, y: 1100 }, { x: 150, y: 1040 }
    ];
    enemies = [];
    const enemyCount = Math.min(4, level);
    const behaviors = ['camper', 'flanker', 'rico', 'flanker'];
    for (let i = 0; i < enemyCount; i++) {
      let spawn = spawnCandidates[i % spawnCandidates.length];
      for (let n = 0; n < spawnCandidates.length; n++) {
        const candidate = spawnCandidates[(i + n) % spawnCandidates.length];
        if (!isBlockedIn(candidate, arena.walls, 25) && dist(candidate, player) > 380 && enemies.every(e => dist(candidate, e) > 150)) { spawn = candidate; break; }
      }
      const color = behaviors[i] === 'camper' ? COLORS.camper : behaviors[i] === 'rico' ? COLORS.rico : COLORS.flanker;
      enemies.push({
        x: spawn.x, y: spawn.y, angle: i % 2 ? Math.PI / 2 : 0, turret: Math.PI / 2,
        radius: 22, alive: true, behavior: behaviors[i], color,
        cooldown: 0.8 + i * 0.45, phase: i * 1.7, anchor: { x: spawn.x, y: spawn.y },
        flash: 0, stuck: 0
      });
    }
    player.x = 450;
    player.y = 1220;
    player.angle = -Math.PI / 2;
    player.turret = -Math.PI / 2;
    player.alive = true;
    player.shield = 1.1;
    player.mineCount = Math.min(2, Math.max(player.mineCount, 0));
    shells.length = 0;
    deployedMines.length = 0;
    levelBanner = `SECTOR ${String(level).padStart(2, '0')}`;
    bannerTimer = 1.5;
    updateScore();
  }

  function updateScore() {
    score = level + kills;
    saveBest();
  }

  function isBlocked(x, y, radius) {
    return isBlockedIn({ x, y }, arena.walls, radius);
  }

  function moveTank(tank, amount, dt) {
    const forward = (amount.left + amount.right) * 0.5;
    const turn = (amount.right - amount.left) * 0.5;
    tank.angle = normAngle(tank.angle + turn * 1.9 * dt);
    const speed = tank === player ? 72 : 52;
    const nx = tank.x + Math.cos(tank.angle) * forward * speed * dt;
    const ny = tank.y + Math.sin(tank.angle) * forward * speed * dt;
    let moved = false;
    if (!isBlocked(nx, tank.y, tank.radius)) { tank.x = nx; moved = true; }
    if (!isBlocked(tank.x, ny, tank.radius)) { tank.y = ny; moved = true; }
    if (!moved && Math.abs(forward) > 0.1) tank.stuck = (tank.stuck || 0) + dt;
    else tank.stuck = 0;
  }

  function playerInput() {
    let forward = 0;
    let turn = 0;
    if (keys.w || keys.ArrowUp) forward += 1;
    if (keys.s || keys.ArrowDown) forward -= 1;
    if (keys.a || keys.ArrowLeft) turn -= 1;
    if (keys.d || keys.ArrowRight) turn += 1;
    if (drivePointer && pointers.has(drivePointer)) {
      const p = pointers.get(drivePointer);
      const dx = clamp(p.x - p.sx, -110, 110);
      const dy = clamp(p.y - p.sy, -110, 110);
      const nx = dx / 110;
      const ny = dy / 110;
      forward = clamp(-ny, -1, 1);
      turn = clamp(nx, -1, 1);
    }
    return { left: clamp(forward - turn * 0.75, -1, 1), right: clamp(forward + turn * 0.75, -1, 1) };
  }

  function updatePlayer(dt) {
    if (!player.alive) {
      respawnTimer -= dt;
      if (respawnTimer <= 0 && lives > 0) {
        player.x = 450;
        player.y = 1220;
        player.angle = -Math.PI / 2;
        player.turret = -Math.PI / 2;
        player.alive = true;
        player.shield = 1.1;
        levelBanner = `REDEPLOYED // ${lives} LIVES`;
        bannerTimer = 1.3;
      }
      return;
    }
    player.shield = Math.max(0, player.shield - dt);
    moveTank(player, playerInput(), dt);
    if (player.mineCount < 4) {
      for (let i = arena.pickups.length - 1; i >= 0; i--) {
        if (dist(player, arena.pickups[i]) < 30) {
          arena.pickups.splice(i, 1);
          player.mineCount++;
          levelBanner = 'MINE ACQUIRED';
          bannerTimer = 0.9;
          burst(player.x, player.y, COLORS.mine, 9, 80);
        }
      }
    }
  }

  function updateAI(tank, dt) {
    if (!tank.alive || !player.alive) return;
    tank.cooldown -= dt;
    tank.flash = Math.max(0, tank.flash - dt);
    const d = dist(tank, player);
    const direct = angleTo(tank, player);
    let goal = tank.anchor;
    let speedFactor = 0.45;

    if (tank.behavior === 'camper') {
      goal = tank.anchor;
      speedFactor = d > 270 ? 0.7 : 0.22;
    } else if (tank.behavior === 'flanker') {
      const side = Math.sin(tank.phase) < 0 ? -1 : 1;
      const orbit = { x: player.x - Math.sin(direct) * 230 * side, y: player.y + Math.cos(direct) * 230 * side };
      goal = orbit;
      speedFactor = 0.85;
      tank.phase += dt * 0.16;
    } else {
      const desired = 380;
      const side = Math.cos(tank.phase) < 0 ? -1 : 1;
      goal = { x: player.x + Math.cos(direct) * (d < desired ? 120 : -80) + Math.sin(direct) * 190 * side, y: player.y + Math.sin(direct) * (d < desired ? 120 : -80) - Math.cos(direct) * 190 * side };
      speedFactor = 0.58;
      tank.phase += dt * 0.23;
    }

    if (tank.stuck > 0.45) tank.phase += 1.8;
    const desiredBody = angleTo(tank, goal);
    const error = normAngle(desiredBody - tank.angle);
    const turn = clamp(error * 2.6, -1, 1);
    const forward = Math.abs(error) > 1.7 ? 0.05 : speedFactor;
    moveTank(tank, { left: clamp(forward - turn * 0.72, -1, 1), right: clamp(forward + turn * 0.72, -1, 1) }, dt);

    let shotAngle = direct;
    const bank = bankShot(tank, player);
    if (tank.behavior === 'rico' && bank) shotAngle = bank.angle;
    else if (!lineHitsWall(tank, player) && d < 780) shotAngle = direct;
    else if (bank) shotAngle = bank.angle;
    tank.turret = approachAngle(tank.turret, shotAngle, dt * (tank.behavior === 'rico' ? 1.25 : 1.8));

    const fireRange = tank.behavior === 'camper' ? 760 : 700;
    if (tank.cooldown <= 0 && d < fireRange && Math.abs(normAngle(tank.turret - shotAngle)) < 0.24) {
      fireShell(tank, tank.turret);
      tank.cooldown = tank.behavior === 'camper' ? 1.7 : tank.behavior === 'rico' ? 2.05 : 1.35;
    }
  }

  function lineHitsWall(a, b) {
    const length = dist(a, b);
    const steps = Math.max(2, Math.ceil(length / 20));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = lerp(a.x, b.x, t);
      const y = lerp(a.y, b.y, t);
      for (const wall of arena.walls) if (x > wall.x - 3 && x < wall.x + wall.w + 3 && y > wall.y - 3 && y < wall.y + wall.h + 3) return true;
    }
    return false;
  }

  function bankShot(shooter, target) {
    let bestShot = null;
    for (const wall of arena.walls) {
      const horizontal = wall.w >= wall.h;
      const edges = horizontal ? [wall.y - 1, wall.y + wall.h + 1] : [wall.x - 1, wall.x + wall.w + 1];
      for (const edge of edges) {
        const virtualTarget = horizontal ? { x: target.x, y: edge * 2 - target.y } : { x: edge * 2 - target.x, y: target.y };
        const length = dist(shooter, virtualTarget);
        if (length > 1000) continue;
        const angle = angleTo(shooter, virtualTarget);
        const hit = { x: shooter.x + Math.cos(angle) * length * 0.51, y: shooter.y + Math.sin(angle) * length * 0.51 };
        if (horizontal ? Math.abs(hit.y - edge) > 36 : Math.abs(hit.x - edge) > 36) continue;
        if (lineHitsWall(shooter, virtualTarget) && (!bestShot || length < bestShot.length)) bestShot = { angle, length };
      }
    }
    return bestShot;
  }

  function fireShell(owner, angle) {
    const muzzle = { x: owner.x + Math.cos(angle) * 30, y: owner.y + Math.sin(angle) * 30 };
    shells.push({ x: muzzle.x, y: muzzle.y, vx: Math.cos(angle) * 560, vy: Math.sin(angle) * 560, r: 5, bounces: 0, owner, life: 3.4, color: owner === player ? COLORS.shell : owner.color });
    burst(muzzle.x, muzzle.y, owner === player ? COLORS.playerHot : owner.color, 5, 55);
    shake = Math.max(shake, owner === player ? 2.5 : 1.2);
  }

  function updateShells(dt) {
    for (let i = shells.length - 1; i >= 0; i--) {
      const shell = shells[i];
      shell.life -= dt;
      if (shell.life <= 0) { shells.splice(i, 1); continue; }
      shell.x += shell.vx * dt;
      shell.y += shell.vy * dt;
      let normal = null;
      if (shell.x < WORLD.pad + shell.r) { shell.x = WORLD.pad + shell.r; normal = { x: 1, y: 0 }; }
      else if (shell.x > WORLD.w - WORLD.pad - shell.r) { shell.x = WORLD.w - WORLD.pad - shell.r; normal = { x: -1, y: 0 }; }
      else if (shell.y < WORLD.pad + shell.r) { shell.y = WORLD.pad + shell.r; normal = { x: 0, y: 1 }; }
      else if (shell.y > WORLD.h - WORLD.pad - shell.r) { shell.y = WORLD.h - WORLD.pad - shell.r; normal = { x: 0, y: -1 }; }
      if (!normal) {
        for (const wall of arena.walls) {
          if (circleRect(shell.x, shell.y, shell.r, wall)) { normal = wallNormal(shell, wall); break; }
        }
      }
      if (normal) {
        if (shell.bounces >= 2) { burst(shell.x, shell.y, shell.color, 8, 85); shells.splice(i, 1); continue; }
        const dot = shell.vx * normal.x + shell.vy * normal.y;
        shell.vx -= 2 * dot * normal.x;
        shell.vy -= 2 * dot * normal.y;
        shell.x += normal.x * 4;
        shell.y += normal.y * 4;
        shell.bounces++;
        burst(shell.x, shell.y, COLORS.shell, 10, 105);
        shake = Math.max(shake, 3.2);
      }
      let hit = false;
      if (shell.owner !== player && player.alive && player.shield <= 0 && dist(shell, player) < player.radius + shell.r) {
        hitPlayer(); hit = true;
      } else if (shell.owner === player) {
        for (const enemy of enemies) {
          if (enemy.alive && dist(shell, enemy) < enemy.radius + shell.r) { hitEnemy(enemy); hit = true; break; }
        }
      }
      if (hit) shells.splice(i, 1);
    }
  }

  function wallNormal(shell, wall) {
    const left = Math.abs(shell.x - wall.x);
    const right = Math.abs(shell.x - (wall.x + wall.w));
    const top = Math.abs(shell.y - wall.y);
    const bottom = Math.abs(shell.y - (wall.y + wall.h));
    const min = Math.min(left, right, top, bottom);
    if (min === left) return { x: -1, y: 0 };
    if (min === right) return { x: 1, y: 0 };
    if (min === top) return { x: 0, y: -1 };
    return { x: 0, y: 1 };
  }

  function hitPlayer() {
    if (!player.alive) return;
    player.alive = false;
    lives--;
    respawnTimer = 1.05;
    shells.length = 0;
    burst(player.x, player.y, COLORS.player, 30, 210);
    shake = 16;
    updateScore();
    if (lives <= 0) {
      state = 'fail';
      levelBanner = 'HULL LOST';
      bannerTimer = 999;
      saveBest();
    } else {
      levelBanner = `HULL LOST // ${lives} LIVES`;
      bannerTimer = 1.2;
    }
  }

  function hitEnemy(enemy) {
    enemy.alive = false;
    kills++;
    updateScore();
    burst(enemy.x, enemy.y, enemy.color, 30, 210);
    shake = Math.max(shake, 9);
    if (enemies.every(e => !e.alive)) {
      state = 'clear';
      clearTimer = 1.45;
      levelBanner = 'SECTOR SECURED';
      bannerTimer = 999;
      shells.length = 0;
      saveBest();
    }
  }

  function updateMines(dt) {
    for (let i = deployedMines.length - 1; i >= 0; i--) {
      const mine = deployedMines[i];
      mine.arm -= dt;
      if (mine.arm > 0) continue;
      let triggered = null;
      for (const enemy of enemies) if (enemy.alive && dist(mine, enemy) < 32) { triggered = enemy; break; }
      if (triggered) { hitEnemy(triggered); burst(mine.x, mine.y, COLORS.mine, 36, 240); deployedMines.splice(i, 1); }
    }
  }

  function dropMine() {
    if (state !== 'play' || !player.alive || player.mineCount <= 0) return;
    player.mineCount--;
    deployedMines.push({ x: player.x - Math.cos(player.angle) * 18, y: player.y - Math.sin(player.angle) * 18, arm: 0.55, pulse: 0 });
    levelBanner = 'MINE DEPLOYED';
    bannerTimer = 0.8;
    burst(player.x, player.y, COLORS.mine, 8, 70);
  }

  function burst(x, y, color, count, force) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const speed = force * (0.25 + Math.random() * 0.9);
      sparks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.24 + Math.random() * 0.52, max: 0.8, size: 1.5 + Math.random() * 3, color });
    }
    for (let i = 0; i < Math.min(8, Math.ceil(count / 4)); i++) debris.push({ x, y, r: 3 + Math.random() * 7, life: .38 + Math.random() * .25, color });
  }

  function updateFx(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      if (p.life <= 0) sparks.splice(i, 1);
    }
    for (let i = debris.length - 1; i >= 0; i--) {
      debris[i].life -= dt;
      debris[i].r += dt * 30;
      if (debris[i].life <= 0) debris.splice(i, 1);
    }
    shake = Math.max(0, shake - dt * 25);
    aimFlash = Math.max(0, aimFlash - dt);
    bannerTimer = Math.max(0, bannerTimer - dt);
  }

  function getCamera() {
    const visibleW = W / scale;
    const visibleH = H / scale;
    const focus = player && player.alive ? player : { x: 450, y: 700 };
    return { x: clamp(focus.x - visibleW * 0.5, 0, WORLD.w - visibleW), y: clamp(focus.y - visibleH * 0.56, 0, WORLD.h - visibleH) };
  }

  function worldPoint(sx, sy) {
    const visible = getCamera();
    return { x: visible.x + sx / scale, y: visible.y + sy / scale };
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0, 0, W, H);
    camera = getCamera();
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(scale, scale);
    ctx.translate(-camera.x, -camera.y);
    drawArena();
    for (const pickup of arena.pickups) drawPickup(pickup);
    for (const mine of deployedMines) drawMine(mine);
    for (const shell of shells) drawShell(shell);
    for (const p of sparks) drawSpark(p);
    for (const p of debris) drawDebris(p);
    for (const enemy of enemies) if (enemy.alive) drawTank(enemy, false);
    if (player.alive || state !== 'play') drawTank(player, true);
    if (aimFlash > 0 && player.alive) {
      ctx.save();
      ctx.globalAlpha = aimFlash * 3;
      ctx.strokeStyle = COLORS.playerHot;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 9]);
      ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(lastAim.x, lastAim.y); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    drawScreenFx();
    drawUi();
  }

  function drawArena() {
    ctx.fillStyle = COLORS.field;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const left = Math.floor(camera.x / 48) * 48 - 48;
    const right = camera.x + W / scale + 48;
    const top = Math.floor(camera.y / 48) * 48 - 48;
    const bottom = camera.y + H / scale + 48;
    for (let x = left; x < right; x += 48) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); }
    for (let y = top; y < bottom; y += 48) { ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); }
    ctx.strokeStyle = COLORS.gridBright;
    ctx.lineWidth = 3;
    ctx.strokeRect(WORLD.pad, WORLD.pad, WORLD.w - WORLD.pad * 2, WORLD.h - WORLD.pad * 2);
    for (const wall of arena.walls) {
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(wall.x + 7, wall.y + 8, wall.w, wall.h);
      ctx.fillStyle = COLORS.wall; ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.fillStyle = COLORS.wallEdge;
      ctx.fillRect(wall.x, wall.y, wall.w, Math.min(3, wall.h));
      ctx.fillRect(wall.x, wall.y, Math.min(3, wall.w), wall.h);
    }
    for (const slit of arena.slits) {
      ctx.save();
      ctx.globalAlpha = 0.58;
      ctx.strokeStyle = COLORS.mine;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 8]);
      ctx.beginPath();
      if (slit.vertical) { ctx.moveTo(slit.x, slit.y + 15); ctx.lineTo(slit.x, slit.y + slit.h - 15); }
      else { ctx.moveTo(slit.x + 15, slit.y); ctx.lineTo(slit.x + slit.w - 15, slit.y); }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTank(tank, isPlayer) {
    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.angle);
    ctx.globalAlpha = tank.alive ? 1 : 0.25;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(-24, -13, 48, 32);
    ctx.fillStyle = '#15232c'; ctx.fillRect(-23, -19, 46, 10); ctx.fillRect(-23, 9, 46, 10);
    ctx.fillStyle = tank.flash > 0 ? '#ffffff' : tank.color;
    ctx.fillRect(-18, -14, 36, 28);
    ctx.fillStyle = isPlayer ? COLORS.playerHot : '#ffe0bc';
    ctx.fillRect(-7, -9, 15, 18);
    ctx.strokeStyle = tank.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(-18, -14, 36, 28);
    ctx.restore();

    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.turret);
    ctx.strokeStyle = isPlayer ? COLORS.playerHot : '#ffd2aa';
    ctx.lineWidth = 8;
    ctx.lineCap = 'square';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(31, 0); ctx.stroke();
    ctx.fillStyle = tank.color; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e9fbfa'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

    if (!isPlayer) {
      ctx.save();
      ctx.translate(tank.x, tank.y - 34);
      ctx.fillStyle = tank.color;
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tank.behavior === 'camper' ? 'CAMP' : tank.behavior === 'rico' ? 'RICO' : 'FLANK', 0, 0);
      ctx.restore();
    }
    if (isPlayer && player.shield > 0) {
      ctx.save(); ctx.translate(player.x, player.y); ctx.globalAlpha = 0.22 + Math.sin(performance.now() * 0.012) * 0.1; ctx.strokeStyle = COLORS.playerHot; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 31, 0, TAU); ctx.stroke(); ctx.restore();
    }
  }

  function drawShell(shell) {
    ctx.save();
    ctx.globalAlpha = 0.2; ctx.fillStyle = shell.color; ctx.beginPath(); ctx.arc(shell.x, shell.y, 13, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = shell.color; ctx.beginPath(); ctx.arc(shell.x, shell.y, shell.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(shell.x - 1, shell.y - 1, 2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawPickup(p) {
    const pulse = 1 + Math.sin(performance.now() * 0.005 + p.x) * 0.12;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(performance.now() * 0.001);
    ctx.globalAlpha = 0.2; ctx.fillStyle = COLORS.mine; ctx.beginPath(); ctx.arc(0, 0, 23 * pulse, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = COLORS.mine; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 12 * pulse, 0, TAU); ctx.stroke();
    ctx.fillStyle = COLORS.mine; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
  }

  function drawMine(mine) {
    const pulse = 1 + Math.sin(performance.now() * 0.007 + mine.x) * 0.16;
    ctx.save(); ctx.translate(mine.x, mine.y); ctx.globalAlpha = mine.arm > 0 ? 0.38 : 1;
    ctx.fillStyle = COLORS.mine; ctx.beginPath(); ctx.arc(0, 0, 8 * pulse, 0, TAU); ctx.fill();
    ctx.strokeStyle = COLORS.mine; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 16 * pulse, 0, TAU); ctx.stroke(); ctx.restore();
  }

  function drawSpark(p) {
    ctx.save(); ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); ctx.restore();
  }

  function drawDebris(p) {
    ctx.save(); ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke(); ctx.restore();
  }

  function drawScreenFx() {
    const gradient = ctx.createRadialGradient(W * .5, H * .46, Math.min(W, H) * .18, W * .5, H * .5, Math.max(W, H) * .72);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,.52)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
    if (state === 'fail') { ctx.fillStyle = 'rgba(80,7,20,.23)'; ctx.fillRect(0, 0, W, H); }
  }

  function drawUi() {
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(5,13,22,.82)';
    ctx.fillRect(12, 12, Math.min(228, W - 24), 70);
    ctx.strokeStyle = 'rgba(111,224,220,.42)'; ctx.lineWidth = 1; ctx.strokeRect(12.5, 12.5, Math.min(228, W - 25), 70);
    ctx.fillStyle = COLORS.playerHot; ctx.font = 'bold 13px ui-monospace, monospace'; ctx.fillText('IRONCLAD // ALLEY', 23, 22);
    ctx.fillStyle = '#a6bac3'; ctx.font = '11px ui-monospace, monospace'; ctx.fillText(`SECTOR ${String(level).padStart(2, '0')}   SCORE ${String(score).padStart(2, '0')}`, 23, 43);
    ctx.fillStyle = '#78909b'; ctx.fillText(`KILLS ${String(kills).padStart(2, '0')}   BEST ${String(best).padStart(2, '0')}`, 23, 59);

    const statX = W - 96;
    ctx.textAlign = 'right'; ctx.fillStyle = COLORS.playerHot; ctx.font = 'bold 12px ui-monospace, monospace'; ctx.fillText('LIVES', statX, 19);
    ctx.fillStyle = lives > 1 ? COLORS.mine : COLORS.enemy; ctx.font = 'bold 21px ui-monospace, monospace'; ctx.fillText('◆'.repeat(Math.max(0, lives)), statX, 37);
    ctx.fillStyle = COLORS.mine; ctx.font = 'bold 12px ui-monospace, monospace'; ctx.fillText(`MINES ${player ? player.mineCount : 0}`, statX, 65);
    ctx.textAlign = 'left';

    if (bannerTimer > 0 && levelBanner) {
      ctx.textAlign = 'center'; ctx.font = 'bold 21px ui-monospace, monospace'; ctx.fillStyle = state === 'fail' ? COLORS.enemy : COLORS.playerHot; ctx.fillText(levelBanner, W * .5, H * .32);
      if (state === 'fail') { ctx.font = '12px ui-monospace, monospace'; ctx.fillStyle = '#ffd1d4'; ctx.fillText('TAP OR PRESS ENTER TO RESTART', W * .5, H * .32 + 34); }
      ctx.textAlign = 'left';
    }

    ctx.textAlign = 'center'; ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = 'rgba(211,239,239,.8)';
    ctx.fillText('DRAG TO DRIVE  •  TAP TO FIRE  •  MINE BUTTON TO DROP', W * .5, H - 144);
    ctx.textAlign = 'left';

    const padX = 76; const padY = H - 72;
    ctx.globalAlpha = 0.72; ctx.strokeStyle = 'rgba(130,208,218,.48)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(padX, padY, 52, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(padX, padY, 27, 0, TAU); ctx.stroke();
    if (drivePointer && pointers.has(drivePointer)) {
      const p = pointers.get(drivePointer); const dx = clamp(p.x - p.sx, -34, 34); const dy = clamp(p.y - p.sy, -34, 34);
      ctx.fillStyle = COLORS.player; ctx.globalAlpha = .8; ctx.beginPath(); ctx.arc(padX + dx, padY + dy, 17, 0, TAU); ctx.fill();
    } else { ctx.fillStyle = 'rgba(100,196,201,.45)'; ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(padX, padY, 15, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.fillStyle = '#94cdd0'; ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText('DRIVE', padX, padY + 68);

    const mineX = W - 66; const mineY = H - 72;
    ctx.fillStyle = player && player.mineCount ? 'rgba(91,224,140,.22)' : 'rgba(129,150,157,.12)'; ctx.strokeStyle = player && player.mineCount ? COLORS.mine : '#5c7078'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mineX, mineY, 35, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = player && player.mineCount ? COLORS.mine : '#6b7c82'; ctx.font = 'bold 12px ui-monospace, monospace'; ctx.fillText('MINE', mineX, mineY - 6); ctx.font = '9px ui-monospace, monospace'; ctx.fillText('DROP', mineX, mineY + 8);
    ctx.restore();
  }

  function isMineButton(x, y) { return x > W - 115 && y > H - 125; }

  function fireAtScreen(x, y) {
    if (state === 'fail') { resetRun(); return; }
    if (state !== 'play' || !player.alive) return;
    lastAim = worldPoint(x, y);
    player.turret = angleTo(player, lastAim);
    fireShell(player, player.turret);
    aimFlash = 0.28;
  }

  function pointerDown(e) {
    e.preventDefault();
    const p = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, start: performance.now(), mine: false };
    if (state === 'fail') { resetRun(); return; }
    if (isMineButton(p.x, p.y)) { dropMine(); p.mine = true; pointers.set(e.pointerId, p); canvas.setPointerCapture?.(e.pointerId); return; }
    pointers.set(e.pointerId, p);
    if (p.y > H * 0.5) drivePointer = e.pointerId;
    else fireAtScreen(p.x, p.y);
    canvas.setPointerCapture?.(e.pointerId);
  }

  function pointerMove(e) {
    e.preventDefault();
    const p = pointers.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
  }

  function pointerUp(e) {
    e.preventDefault();
    const p = pointers.get(e.pointerId); if (!p) return;
    const moved = Math.hypot(p.x - p.sx, p.y - p.sy);
    if (!p.mine && drivePointer === e.pointerId && moved < 16 && performance.now() - p.start < 360) fireAtScreen(p.x, p.y);
    if (drivePointer === e.pointerId) drivePointer = null;
    pointers.delete(e.pointerId);
    canvas.releasePointerCapture?.(e.pointerId);
  }

  function keyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(e.key)) e.preventDefault();
    if (state === 'fail' && (e.key === 'Enter' || e.key === ' ' || e.key.toLowerCase() === 'r')) { resetRun(); return; }
    keys[e.key] = true;
    keys[e.key.toLowerCase()] = true;
    if (!e.repeat && (e.key === ' ' || e.key === 'Enter')) fireAtScreen(W * .5, H * .35);
    if (!e.repeat && (e.key.toLowerCase() === 'm' || e.key.toLowerCase() === 'q')) dropMine();
  }

  function keyUp(e) { keys[e.key] = false; keys[e.key.toLowerCase()] = false; }

  function tick(now) {
    const dt = Math.min(0.034, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    if (state === 'play') {
      updatePlayer(dt);
      for (const enemy of enemies) updateAI(enemy, dt);
      updateShells(dt);
      updateMines(dt);
    } else if (state === 'clear') {
      clearTimer -= dt;
      if (clearTimer <= 0) { level++; state = 'play'; createLevel(); }
    }
    updateFx(dt);
    draw();
    requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointermove', pointerMove, { passive: false });
  canvas.addEventListener('pointerup', pointerUp, { passive: false });
  canvas.addEventListener('pointercancel', pointerUp, { passive: false });
  canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchend', e => e.preventDefault(), { passive: false });
  window.addEventListener('keydown', keyDown, { passive: false });
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', () => { pointers.clear(); drivePointer = null; for (const key in keys) delete keys[key]; });
  resetRun();
  requestAnimationFrame(tick);
})();
