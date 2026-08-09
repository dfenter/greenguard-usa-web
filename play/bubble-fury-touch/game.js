(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const ui = {
    wave: document.getElementById('wave'),
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    health: document.querySelector('#health i'),
    weapon: document.getElementById('weapon'),
    hint: document.getElementById('hint'),
    bossbar: document.getElementById('bossbar'),
    bossFill: document.querySelector('#bossbar i'),
    result: document.getElementById('result'),
    resultTitle: document.getElementById('resultTitle'),
    resultText: document.getElementById('resultText'),
    restart: document.getElementById('restart')
  };

  const VW = 390;
  const VH = 700;
  const ARENA = { left: 24, right: 366, top: 82, bottom: 652 };
  const PLAYER_START = { x: 195, y: 392 };
  let dpr = 1;
  let viewScale = 1;
  let viewX = 0;
  let viewY = 0;
  let lastTime = performance.now();
  let elapsed = 0;
  let state = 'playing';
  let wave = 1;
  let waveTimer = 0;
  let score = 0;
  let kills = 0;
  let best = loadBest();
  let shake = 0;
  let flash = 0;
  let banner = '';
  let bannerTimer = 0;
  let hintTimer = 7;
  let waveRng = () => Math.random();
  let enemyId = 0;
  let player;
  let enemies = [];
  let bullets = [];
  let enemyBullets = [];
  let particles = [];
  let beams = [];
  let pickups = [];
  let pillars = [];
  let hazard = { x: 259, y: 346, r: 54 };

  const keys = Object.create(null);
  const sticks = {
    left: { active: false, pointer: null, baseX: 70, baseY: 600, x: 70, y: 600, dx: 0, dy: 0, mag: 0 },
    right: { active: false, pointer: null, baseX: 320, baseY: 600, x: 320, y: 600, dx: 0, dy: 0, mag: 0 }
  };

  function loadBest() {
    try { const value = Number(localStorage.getItem('bubbleFuryTouchBest')); return Number.isFinite(value) && value >= 0 ? value : 0; } catch (_) { return 0; }
  }

  function saveBest() {
    try { localStorage.setItem('bubbleFuryTouchBest', String(best)); } catch (_) { /* private mode */ }
  }

  function mulberry32(seed) {
    return function rng() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
  function angleDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
  function randomRange(min, max) { return min + waveRng() * (max - min); }
  function pick(array) { return array[Math.floor(waveRng() * array.length)]; }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    viewScale = Math.min(rect.width / VW, rect.height / VH);
    viewX = (rect.width - VW * viewScale) * .5;
    viewY = (rect.height - VH * viewScale) * .5;
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - viewX) / viewScale,
      y: (event.clientY - rect.top - viewY) / viewScale
    };
  }

  function setupArena() {
    pillars = [
      { x: 87, y: 182, r: 19 },
      { x: 301, y: 185, r: 23 },
      { x: 104, y: 469, r: 25 },
      { x: 295, y: 474, r: 18 },
      { x: 195, y: 267, r: 14 }
    ];
    hazard = { x: 254, y: 344, r: 57 };
  }

  function newRun() {
    state = 'playing';
    wave = 1;
    waveTimer = 0;
    score = 0;
    kills = 0;
    shake = 0;
    flash = 0;
    banner = '';
    bannerTimer = 0;
    hintTimer = 7;
    elapsed = 0;
    for (const key in keys) delete keys[key];
    sticks.left.baseX = 70; sticks.left.baseY = 600; sticks.right.baseX = 320; sticks.right.baseY = 600; resetStick(sticks.left); resetStick(sticks.right);
    enemyId = 0;
    enemies = [];
    bullets = [];
    enemyBullets = [];
    particles = [];
    beams = [];
    pickups = [];
    player = {
      x: PLAYER_START.x,
      y: PLAYER_START.y,
      r: 13,
      speed: 185,
      hp: 100,
      maxHp: 100,
      aimX: 1,
      aimY: 0,
      weapon: 'spread',
      weaponTime: 0,
      fireTimer: 0,
      hurtTimer: 0,
      trailTimer: 0
    };
    sticks.left.active = sticks.right.active = false;
    setupArena();
    spawnWave();
    ui.result.hidden = true;
    updateHud();
  }

  function spawnWave() {
    waveRng = mulberry32((0xC001D00D ^ Math.imul(wave, 0x45D9F3B)) >>> 0);
    const count = Math.min(20, 4 + wave + Math.floor(wave * .55));
    const types = ['rusher', 'orbiter', 'spitter', 'shielder', 'splitter'];
    for (let i = 0; i < count; i++) {
      const type = types[(i + wave * 2 + Math.floor(i / 3)) % types.length];
      const p = spawnPoint();
      enemies.push(makeEnemy(type, p.x, p.y));
    }
    if (wave % 5 === 0) {
      const p = spawnPoint(true);
      enemies.push(makeEnemy('boss', p.x, p.y));
      banner = `SCUZZ // WAVE ${wave}`;
      bannerTimer = 2.4;
    } else {
      banner = `WAVE ${wave}`;
      bannerTimer = 1.6;
    }
    if (wave > 1 && wave % 2 === 0) {
      pickups.push({ x: randomRange(62, 328), y: randomRange(170, 545), r: 14, type: ['spread', 'beam', 'bounce'][((wave / 2) - 1) % 3], spin: 0, pulse: 0 });
    }
  }

  function spawnPoint(boss = false) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const edge = Math.floor(waveRng() * 4);
      const inset = boss ? 50 : 33;
      let x = edge === 0 ? ARENA.left + inset : edge === 1 ? ARENA.right - inset : randomRange(45, 345);
      let y = edge === 2 ? ARENA.top + inset : edge === 3 ? ARENA.bottom - inset : randomRange(115, 615);
      if (dist(x, y, player.x, player.y) > 125 && !insidePillar(x, y, boss ? 40 : 19) && dist(x, y, hazard.x, hazard.y) > hazard.r + 35) return { x, y };
    }
    return { x: 45 + waveRng() * 300, y: 120 + waveRng() * 470 };
  }

  function makeEnemy(type, x, y, mini = false) {
    const scale = mini ? .65 : 1;
    const hpBase = { rusher: 22, orbiter: 30, spitter: 25, shielder: 42, splitter: 36, boss: 245 }[type] || 18;
    return {
      id: ++enemyId,
      type,
      mini,
      x, y,
      r: (type === 'boss' ? 36 : type === 'shielder' ? 18 : 15) * scale,
      hp: (hpBase + wave * (type === 'boss' ? 6 : 1.8)) * scale,
      maxHp: (hpBase + wave * (type === 'boss' ? 6 : 1.8)) * scale,
      speed: (type === 'rusher' ? 67 : type === 'orbiter' ? 75 : type === 'spitter' ? 54 : type === 'shielder' ? 38 : type === 'splitter' ? 48 : 40) * (mini ? 1.3 : 1),
      cool: randomRange(.55, 1.7),
      phase: randomRange(0, Math.PI * 2),
      orbitRadius: randomRange(112, 155),
      facing: 0,
      hit: 0,
      dead: false,
      bossPatternTimer: 1.4,
      bossPattern: 0,
      charge: 0,
      chargeX: 0,
      chargeY: 0
    };
  }

  function insidePillar(x, y, radius = 0) {
    return pillars.some(p => dist(x, y, p.x, p.y) < p.r + radius);
  }

  function resolvePillars(body) {
    for (const p of pillars) {
      const dx = body.x - p.x;
      const dy = body.y - p.y;
      const d = Math.hypot(dx, dy) || .001;
      const min = body.r + p.r;
      if (d < min) {
        body.x = p.x + dx / d * min;
        body.y = p.y + dy / d * min;
      }
    }
  }

  function moveBody(body, vx, vy, dt) {
    body.x += vx * dt;
    body.y += vy * dt;
    body.x = clamp(body.x, ARENA.left + body.r, ARENA.right - body.r);
    body.y = clamp(body.y, ARENA.top + body.r, ARENA.bottom - body.r);
    resolvePillars(body);
  }

  function getAim() {
    let ax = 0;
    let ay = 0;
    if (sticks.right.active && sticks.right.mag > .12) {
      ax = sticks.right.dx;
      ay = sticks.right.dy;
    } else {
      if (keys.ArrowLeft) ax -= 1;
      if (keys.ArrowRight) ax += 1;
      if (keys.ArrowUp) ay -= 1;
      if (keys.ArrowDown) ay += 1;
    }
    const mag = Math.hypot(ax, ay);
    if (mag > .1) return { x: ax / mag, y: ay / mag, mag };
    return { x: player.aimX, y: player.aimY, mag: 0 };
  }

  function getMove() {
    let mx = sticks.left.active ? sticks.left.dx : 0;
    let my = sticks.left.active ? sticks.left.dy : 0;
    if (!sticks.left.active) {
      if (keys.KeyA) mx -= 1;
      if (keys.KeyD) mx += 1;
      if (keys.KeyW) my -= 1;
      if (keys.KeyS) my += 1;
    }
    const mag = Math.hypot(mx, my);
    if (mag > 1) return { x: mx / mag, y: my / mag, mag: 1 };
    return { x: mx, y: my, mag };
  }

  function update(dt) {
    elapsed += dt;
    flash = Math.max(0, flash - dt * 3.2);
    shake = Math.max(0, shake - dt * 2.8);
    bannerTimer = Math.max(0, bannerTimer - dt);
    hintTimer = Math.max(0, hintTimer - dt);
    ui.hint.style.opacity = hintTimer > 0 ? String(Math.min(1, hintTimer)) : '0';
    if (state !== 'playing') {
      updateParticles(dt);
      updateHud();
      return;
    }

    if (waveTimer > 0) {
      waveTimer -= dt;
      updatePlayer(dt);
      updateParticles(dt);
      updatePickups(dt);
      if (waveTimer <= 0) {
        if (wave >= 15) finishRun(true);
        else { wave++; spawnWave(); }
      }
      updateHud();
      return;
    }

    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateEnemyBullets(dt);
    updateBeams(dt);
    updateParticles(dt);
    updatePickups(dt);

    if (enemies.length && enemies.every(enemy => enemy.dead)) {
      enemies = enemies.filter(enemy => !enemy.dead);
      waveTimer = 1.45;
      score += wave * 100;
      burst(player.x, player.y, '#ffe28c', 20, 1.2);
      shake = .55;
      if (wave >= 15) banner = 'SCUZZ DOWN // RUN COMPLETE';
      else banner = 'WAVE CLEAR';
      bannerTimer = 1.4;
      best = Math.max(best, score);
      saveBest();
    }
    updateHud();
  }

  function updatePlayer(dt) {
    player.hurtTimer = Math.max(0, player.hurtTimer - dt);
    player.fireTimer -= dt;
    player.weaponTime = Math.max(0, player.weaponTime - dt);
    if (player.weaponTime === 0) player.weapon = 'spread';
    const move = getMove();
    const speed = player.speed * (dist(player.x, player.y, hazard.x, hazard.y) < hazard.r ? .58 : 1);
    moveBody(player, move.x * speed * move.mag, move.y * speed * move.mag, dt);
    const aim = getAim();
    if (aim.mag > 0) { player.aimX = aim.x; player.aimY = aim.y; }
    const shouldFire = (sticks.right.active && sticks.right.mag > .12) || keys.Space || keys.Enter;
    if (shouldFire && player.fireTimer <= 0) firePlayer();
    player.trailTimer -= dt;
    if (move.mag > .1 && player.trailTimer <= 0) {
      player.trailTimer = .06;
      addParticle(player.x - move.x * 9, player.y - move.y * 9, '#71dce9', 1.5, 0, 0, .34);
    }
    if (dist(player.x, player.y, hazard.x, hazard.y) < hazard.r - 5 && player.hurtTimer <= 0) hurtPlayer(5 * dt);
  }

  function firePlayer() {
    const a = Math.atan2(player.aimY, player.aimX);
    player.fireTimer = player.weapon === 'beam' ? .11 : player.weapon === 'bounce' ? .2 : .22;
    if (player.weapon === 'beam') {
      fireBeam(a);
      burst(player.x + player.aimX * 14, player.y + player.aimY * 14, '#c5f7ff', 3, .4);
      return;
    }
    const angles = player.weapon === 'spread' ? [a - .22, a, a + .22] : [a];
    for (const angle of angles) {
      const speed = player.weapon === 'bounce' ? 295 : 330;
      bullets.push({ x: player.x + Math.cos(angle) * 16, y: player.y + Math.sin(angle) * 16, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 4, damage: player.weapon === 'bounce' ? 17 : 9, life: 1.4, bounces: player.weapon === 'bounce' ? 3 : 0, color: player.weapon === 'bounce' ? '#ffcb73' : '#b7fbff' });
    }
    burst(player.x + player.aimX * 14, player.y + player.aimY * 14, player.weapon === 'bounce' ? '#ffcb73' : '#b7fbff', 4, .6);
  }

  function fireBeam(angle) {
    const range = 320;
    beams.push({ x: player.x, y: player.y, angle, range, life: .12 });
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const along = dx * Math.cos(angle) + dy * Math.sin(angle);
      const across = Math.abs(dx * Math.sin(angle) - dy * Math.cos(angle));
      if (along > 0 && along < range && across < enemy.r + 7) damageEnemy(enemy, 10, angle);
    }
  }

  function updateEnemies(dt) {
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      enemy.cool -= dt;
      enemy.hit = Math.max(0, enemy.hit - dt * 4);
      enemy.phase += dt;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      const toPlayerX = dx / d;
      const toPlayerY = dy / d;
      enemy.facing = Math.atan2(dy, dx);
      if (enemy.type === 'boss') updateBoss(enemy, dt, toPlayerX, toPlayerY, d);
      else if (enemy.type === 'rusher' || enemy.type === 'splitter' || enemy.mini) {
        moveBody(enemy, toPlayerX * enemy.speed, toPlayerY * enemy.speed, dt);
        if (d < enemy.r + player.r + 3 && enemy.cool <= 0) { hurtPlayer(enemy.mini ? 10 : 13); enemy.cool = .7; }
      } else if (enemy.type === 'orbiter') {
        const orbit = enemy.phase * .9 + enemy.id;
        const targetX = player.x - toPlayerX * enemy.orbitRadius + Math.cos(orbit) * enemy.orbitRadius * .7;
        const targetY = player.y - toPlayerY * enemy.orbitRadius + Math.sin(orbit) * enemy.orbitRadius * .7;
        const tx = targetX - enemy.x;
        const ty = targetY - enemy.y;
        const td = Math.hypot(tx, ty) || 1;
        moveBody(enemy, tx / td * enemy.speed, ty / td * enemy.speed, dt);
        if (enemy.cool <= 0) { enemyShot(enemy, toPlayerX, toPlayerY, 125, 10, '#db9aff'); enemy.cool = 1.9; }
      } else if (enemy.type === 'spitter') {
        const move = d < 165 ? -1 : d > 225 ? 1 : 0;
        const side = Math.sin(enemy.phase * .8 + enemy.id) * .35;
        moveBody(enemy, (toPlayerX * move - toPlayerY * side) * enemy.speed, (toPlayerY * move + toPlayerX * side) * enemy.speed, dt);
        if (enemy.cool <= 0) { lobbedShot(enemy); enemy.cool = 2.25; }
      } else if (enemy.type === 'shielder') {
        const move = d > 130 ? 1 : -0.35;
        moveBody(enemy, toPlayerX * enemy.speed * move, toPlayerY * enemy.speed * move, dt);
        if (enemy.cool <= 0) { enemyShot(enemy, toPlayerX, toPlayerY, 145, 12, '#ff9c67'); enemy.cool = 3.1; }
        if (d < enemy.r + player.r + 2) hurtPlayer(7 * dt);
      }
      if (dist(enemy.x, enemy.y, hazard.x, hazard.y) < hazard.r - enemy.r * .2) enemy.cool -= dt * .25;
    }
  }

  function updateBoss(enemy, dt, tx, ty, d) {
    if (enemy.charge > 0) {
      enemy.charge -= dt;
      moveBody(enemy, enemy.chargeX * 270, enemy.chargeY * 270, dt);
      if (dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 6) hurtPlayer(25);
      return;
    }
    const orbit = Math.sin(enemy.phase * .55) * 0.5;
    moveBody(enemy, (tx - ty * orbit) * enemy.speed, (ty + tx * orbit) * enemy.speed, dt);
    enemy.bossPatternTimer -= dt;
    if (enemy.bossPatternTimer <= 0) {
      enemy.bossPattern = (enemy.bossPattern + 1) % 3;
      if (enemy.bossPattern === 0) {
        enemy.charge = .82;
        enemy.chargeX = tx;
        enemy.chargeY = ty;
        burst(enemy.x, enemy.y, '#ff718a', 12, 1.2);
      } else if (enemy.bossPattern === 1) {
        for (let i = 0; i < 13; i++) {
          const a = i / 13 * Math.PI * 2 + enemy.phase * .3;
          enemyShot(enemy, Math.cos(a), Math.sin(a), 128, 10, '#ff7097');
        }
        burst(enemy.x, enemy.y, '#ff7097', 22, 1.4);
      } else if (enemies.filter(e => !e.dead).length < 31) {
        enemies = enemies.filter(e => !e.dead);
        for (let i = 0; i < 2; i++) {
          const a = i * Math.PI + enemy.phase;
          enemies.push(makeEnemy(i ? 'orbiter' : 'rusher', enemy.x + Math.cos(a) * 47, enemy.y + Math.sin(a) * 47));
        }
        burst(enemy.x, enemy.y, '#c59bff', 14, 1.1);
      }
      enemy.bossPatternTimer = 2.65;
    }
    if (d < enemy.r + player.r + 4) hurtPlayer(18 * dt);
  }

  function enemyShot(enemy, nx, ny, speed, damage, color) {
    enemyBullets.push({ x: enemy.x + nx * (enemy.r + 6), y: enemy.y + ny * (enemy.r + 6), vx: nx * speed, vy: ny * speed, r: 5, damage, life: 3.2, color, lob: 0 });
  }

  function lobbedShot(enemy) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    enemyBullets.push({ x: enemy.x, y: enemy.y, vx: dx / d * 105, vy: dy / d * 105, r: 7, damage: 17, life: 2.15, lob: 1.1, lobMax: 2.15, color: '#f4c15e' });
    burst(enemy.x, enemy.y, '#f4c15e', 5, .7);
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      let bounced = false;
      if (bullet.x < ARENA.left + bullet.r || bullet.x > ARENA.right - bullet.r) {
        if (bullet.bounces > 0) { bullet.vx *= -1; bullet.bounces--; bounced = true; }
        else bullet.life = 0;
        bullet.x = clamp(bullet.x, ARENA.left + bullet.r, ARENA.right - bullet.r);
      }
      if (bullet.y < ARENA.top + bullet.r || bullet.y > ARENA.bottom - bullet.r) {
        if (bullet.bounces > 0) { bullet.vy *= -1; bullet.bounces--; bounced = true; }
        else bullet.life = 0;
        bullet.y = clamp(bullet.y, ARENA.top + bullet.r, ARENA.bottom - bullet.r);
      }
      if (insidePillar(bullet.x, bullet.y, bullet.r)) {
        if (bullet.bounces > 0) { bullet.vx *= -1; bullet.vy *= -1; bullet.bounces--; bounced = true; }
        else bullet.life = 0;
      }
      if (bounced) burst(bullet.x, bullet.y, '#ffe3a0', 3, .5);
      for (const enemy of enemies) {
        if (enemy.dead || bullet.life <= 0) continue;
        if (dist(bullet.x, bullet.y, enemy.x, enemy.y) < bullet.r + enemy.r) {
          damageEnemy(enemy, bullet.damage, Math.atan2(bullet.vy, bullet.vx));
          if (bullet.bounces > 0 && !enemy.dead) { bullet.vx *= -1; bullet.vy *= -1; bullet.bounces--; bullet.x += bullet.vx * .02; }
          else bullet.life = 0;
        }
      }
      if (bullet.life <= 0) bullets.splice(i, 1);
    }
  }

  function updateEnemyBullets(dt) {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const bullet = enemyBullets[i];
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.lob) bullet.lob = Math.max(0, bullet.lob - dt);
      if (bullet.life <= 0 || bullet.x < 10 || bullet.x > 380 || bullet.y < 72 || bullet.y > 668 || insidePillar(bullet.x, bullet.y, bullet.r)) {
        enemyBullets.splice(i, 1);
        continue;
      }
      const visualR = bullet.r + (bullet.lob ? Math.sin((1 - bullet.lob / 1.1) * Math.PI) * 8 : 0);
      if (dist(bullet.x, bullet.y, player.x, player.y) < visualR + player.r) {
        hurtPlayer(bullet.damage);
        enemyBullets.splice(i, 1);
      }
    }
  }

  function updateBeams(dt) {
    for (let i = beams.length - 1; i >= 0; i--) {
      beams[i].life -= dt;
      if (beams[i].life <= 0) beams.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.spin += dt * 2.5;
      p.pulse += dt * 4;
      if (dist(p.x, p.y, player.x, player.y) < p.r + player.r + 7) {
        player.weapon = p.type;
        player.weaponTime = 13;
        pickups.splice(i, 1);
        banner = `${p.type.toUpperCase()} ONLINE`;
        bannerTimer = 1.1;
        burst(p.x, p.y, weaponColor(p.type), 16, 1.2);
      }
    }
  }

  function hurtPlayer(amount) {
    if (state !== 'playing' || player.hurtTimer > 0) return;
    player.hp -= amount;
    player.hurtTimer = .28;
    flash = 1;
    shake = Math.min(1.3, shake + .25);
    burst(player.x, player.y, '#ff7582', 9, .9);
    if (player.hp <= 0) finishRun(false);
  }

  function damageEnemy(enemy, amount, incomingAngle) {
    if (enemy.dead) return;
    if (enemy.type === 'shielder') {
      const front = Math.abs(angleDiff(incomingAngle, enemy.facing + Math.PI)) < 1.05;
      if (front) {
        enemy.hit = .25;
        burst(enemy.x + Math.cos(enemy.facing) * enemy.r, enemy.y + Math.sin(enemy.facing) * enemy.r, '#9ee8ff', 3, .6);
        return;
      }
    }
    if (enemy.type === 'boss') {
      const weakBack = Math.abs(angleDiff(incomingAngle, enemy.facing + Math.PI)) < .88;
      amount *= weakBack ? 2.4 : .45;
      if (weakBack) burst(enemy.x - Math.cos(enemy.facing) * 24, enemy.y - Math.sin(enemy.facing) * 24, '#ffe77a', 4, .8);
    }
    enemy.hp -= amount;
    enemy.hit = .18;
    addParticle(enemy.x, enemy.y, enemy.type === 'boss' ? '#ffe77a' : '#c9f8ff', 3, 0, 0, .45);
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    kills++;
    score += 25 + wave * 4;
    best = Math.max(best, score);
    if (enemy.type === 'splitter' && !enemy.mini) {
      for (let i = 0; i < 2; i++) enemies.push(makeEnemy('rusher', enemy.x + (i ? 12 : -12), enemy.y + (i ? -8 : 8), true));
    }
    burst(enemy.x, enemy.y, enemyColor(enemy.type), enemy.type === 'boss' ? 42 : 13, enemy.type === 'boss' ? 2.3 : 1);
    shake = Math.min(1.1, shake + (enemy.type === 'boss' ? .75 : .08));
    flash = Math.max(flash, enemy.type === 'boss' ? .7 : .08);
  }

  function finishRun(win) {
    if (state !== 'playing') return;
    state = win ? 'win' : 'dead';
    best = Math.max(best, score);
    saveBest();
    if (win) {
      burst(player.x, player.y, '#ffe487', 55, 3);
      ui.resultTitle.textContent = 'ARENA CLEARED';
      ui.resultText.textContent = `Three Scuzz falls. SCORE ${score} • BEST ${best}`;
    } else {
      ui.resultTitle.textContent = 'RUN OVER';
      ui.resultText.textContent = `WAVE ${wave} • ${kills} KILLS • SCORE ${score}`;
    }
    ui.result.hidden = false;
    updateHud();
  }

  function weaponColor(type) { return type === 'beam' ? '#b9f7ff' : type === 'bounce' ? '#ffcf75' : '#b5f4ff'; }
  function enemyColor(type) { return { rusher: '#ff7183', orbiter: '#c58eff', spitter: '#f1bf5b', shielder: '#62d9dc', splitter: '#ff9c67', boss: '#ff799a' }[type] || '#fff'; }

  function addParticle(x, y, color, size, vx, vy, life = .7) {
    if (particles.length > 280) particles.shift();
    particles.push({ x, y, color, size, vx, vy, life, maxLife: life, gravity: 0 });
  }

  function burst(x, y, color, count, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (20 + Math.random() * 80) * power;
      addParticle(x, y, color, 1.5 + Math.random() * 3, Math.cos(a) * s, Math.sin(a) * s, .25 + Math.random() * .65);
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= .97;
      p.vy *= .97;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function render() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#070b16';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(viewX, viewY);
    ctx.scale(viewScale, viewScale);
    ctx.save();
    ctx.translate((Math.random() - .5) * shake * 8, (Math.random() - .5) * shake * 8);
    drawArena();
    for (const p of pickups) drawPickup(p);
    for (const b of bullets) drawBullet(b);
    for (const b of enemyBullets) drawEnemyBullet(b);
    for (const enemy of enemies) if (!enemy.dead) drawEnemy(enemy);
    drawPlayer();
    for (const beam of beams) drawBeam(beam);
    drawParticles();
    drawSticks();
    if (bannerTimer > 0) drawBanner();
    ctx.restore();
    ctx.restore();
    if (flash > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = `rgba(255, 92, 119, ${flash * .12})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function drawArena() {
    const bg = ctx.createRadialGradient(195, 350, 30, 195, 350, 360);
    bg.addColorStop(0, '#16263a');
    bg.addColorStop(.65, '#0c1728');
    bg.addColorStop(1, '#070b16');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top, 26);
    ctx.clip();
    ctx.strokeStyle = '#ffffff08';
    ctx.lineWidth = 1;
    for (let x = ARENA.left; x <= ARENA.right; x += 26) { ctx.beginPath(); ctx.moveTo(x, ARENA.top); ctx.lineTo(x, ARENA.bottom); ctx.stroke(); }
    for (let y = ARENA.top; y <= ARENA.bottom; y += 26) { ctx.beginPath(); ctx.moveTo(ARENA.left, y); ctx.lineTo(ARENA.right, y); ctx.stroke(); }
    const pulse = 1 + Math.sin(elapsed * 2.2) * .04;
    ctx.fillStyle = '#15253a';
    ctx.beginPath(); ctx.arc(hazard.x, hazard.y, hazard.r * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5b70d8aa'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = '#a3aaff33'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(hazard.x, hazard.y, hazard.r * .72, elapsed, elapsed + Math.PI * 1.55); ctx.stroke();
    ctx.beginPath(); ctx.arc(hazard.x, hazard.y, hazard.r * .9, elapsed + Math.PI, elapsed + Math.PI * 2.55); ctx.stroke();
    for (const p of pillars) drawPillar(p);
    ctx.restore();
    ctx.strokeStyle = '#6a99ae66';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top, 26); ctx.stroke();
    ctx.fillStyle = '#8298b522';
    ctx.font = '700 8px system-ui';
    ctx.letterSpacing = '2px';
    ctx.fillText('DANGER POOL', hazard.x - 30, hazard.y + 3);
  }

  function drawPillar(p) {
    const g = ctx.createRadialGradient(p.x - p.r * .35, p.y - p.r * .4, 2, p.x, p.y, p.r * 1.2);
    g.addColorStop(0, '#355064'); g.addColorStop(1, '#182535');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#80b8c655'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#b6e5ee44'; ctx.beginPath(); ctx.arc(p.x - p.r * .35, p.y - p.r * .4, p.r * .2, 0, Math.PI * 2); ctx.fill();
  }

  function drawPlayer() {
    const a = Math.atan2(player.aimY, player.aimX);
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(a);
    if (player.hurtTimer > 0 && Math.floor(elapsed * 20) % 2 === 0) ctx.globalAlpha = .45;
    ctx.shadowColor = '#5cf3ff'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#74e6ee'; ctx.beginPath(); ctx.arc(0, 0, player.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#d9ffff'; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(5, -7); ctx.lineTo(5, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1b3b58'; ctx.beginPath(); ctx.arc(-3, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawEnemy(enemy) {
    const color = enemyColor(enemy.type);
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.facing);
    ctx.globalAlpha = enemy.hit > 0 ? .6 + enemy.hit * 2 : 1;
    ctx.shadowColor = color; ctx.shadowBlur = enemy.type === 'boss' ? 18 : 9;
    ctx.fillStyle = color;
    if (enemy.type === 'rusher' || enemy.mini) {
      ctx.beginPath(); ctx.moveTo(enemy.r, 0); ctx.lineTo(-enemy.r * .7, -enemy.r * .72); ctx.lineTo(-enemy.r * .7, enemy.r * .72); ctx.closePath(); ctx.fill();
    } else if (enemy.type === 'orbiter') {
      ctx.beginPath(); ctx.arc(0, 0, enemy.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f3d9ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, enemy.r * .6, enemy.phase, enemy.phase + Math.PI * 1.4); ctx.stroke();
    } else if (enemy.type === 'spitter') {
      ctx.beginPath(); ctx.moveTo(enemy.r, 0); ctx.lineTo(0, enemy.r); ctx.lineTo(-enemy.r, 0); ctx.lineTo(0, -enemy.r); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff3c6'; ctx.beginPath(); ctx.arc(enemy.r * .35, 0, 4, 0, Math.PI * 2); ctx.fill();
    } else if (enemy.type === 'shielder') {
      ctx.beginPath(); ctx.arc(0, 0, enemy.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1d3c59'; ctx.beginPath(); ctx.arc(0, 0, enemy.r * .48, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = enemy.hit > 0 ? '#d5fbff' : '#9beeff'; ctx.beginPath(); ctx.arc(enemy.r * .72, 0, enemy.r * .62, -1.05, 1.05); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    } else if (enemy.type === 'splitter') {
      ctx.beginPath(); ctx.arc(0, 0, enemy.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffe0b0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke();
    } else if (enemy.type === 'boss') {
      ctx.fillStyle = '#7b3f71'; ctx.beginPath(); ctx.arc(0, 0, enemy.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c95180'; ctx.beginPath(); ctx.arc(0, 0, enemy.r * .68, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(-enemy.r * .63, 0, 9 + Math.sin(elapsed * 5) * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff829b'; ctx.beginPath(); ctx.arc(enemy.r * .35, -enemy.r * .26, 5, 0, Math.PI * 2); ctx.arc(enemy.r * .35, enemy.r * .26, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffef9e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, enemy.r + 5, Math.PI - .65, Math.PI + .65); ctx.stroke();
    }
    ctx.restore();
    if (enemy.type === 'boss' || enemy.hp < enemy.maxHp) {
      const width = enemy.type === 'boss' ? 76 : 28;
      ctx.fillStyle = '#101728'; ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.r - 10, width, 3);
      ctx.fillStyle = enemy.type === 'boss' ? '#ff8e9d' : '#b6e8c6'; ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.r - 10, width * clamp(enemy.hp / enemy.maxHp, 0, 1), 3);
    }
  }

  function drawBullet(b) {
    ctx.save(); ctx.shadowColor = b.color; ctx.shadowBlur = 9; ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function drawEnemyBullet(b) {
    const r = b.r + (b.lob ? Math.sin((1 - b.lob / 1.1) * Math.PI) * 8 : 0);
    ctx.save(); ctx.shadowColor = b.color; ctx.shadowBlur = 10; ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff5ceaa'; ctx.beginPath(); ctx.arc(b.x - r * .3, b.y - r * .3, r * .25, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function drawBeam(beam) {
    const endX = beam.x + Math.cos(beam.angle) * beam.range;
    const endY = beam.y + Math.sin(beam.angle) * beam.range;
    ctx.save(); ctx.globalAlpha = clamp(beam.life / .12, 0, 1); ctx.lineCap = 'round';
    ctx.strokeStyle = '#73e8ff55'; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(beam.x, beam.y); ctx.lineTo(endX, endY); ctx.stroke();
    ctx.strokeStyle = '#d9ffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(beam.x, beam.y); ctx.lineTo(endX, endY); ctx.stroke(); ctx.restore();
  }

  function drawPickup(p) {
    const color = weaponColor(p.type);
    const pulse = Math.sin(p.pulse) * 2;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin); ctx.shadowColor = color; ctx.shadowBlur = 16;
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, p.r + pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(8, 0); ctx.lineTo(0, 9); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#193149'; ctx.font = '900 8px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.type === 'beam' ? 'B' : p.type === 'bounce' ? '↗' : 'S', 0, 0);
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (.4 + p.life / p.maxLife), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSticks() {
    drawStick(sticks.left, '#7ee9ec');
    drawStick(sticks.right, '#ffcc84');
  }

  function drawStick(stick, color) {
    const alpha = stick.active ? .46 : .17;
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(stick.baseX, stick.baseY, 39, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(stick.baseX, stick.baseY, 22, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = stick.active ? .75 : .27;
    ctx.beginPath(); ctx.arc(stick.x, stick.y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBanner() {
    const alpha = bannerTimer < .35 ? bannerTimer / .35 : 1;
    ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.font = '900 19px system-ui'; ctx.fillStyle = '#f1fbff'; ctx.shadowColor = '#6be7ff'; ctx.shadowBlur = 16; ctx.fillText(banner, VW / 2, 145); ctx.restore();
  }

  function updateHud() {
    ui.wave.textContent = `WAVE ${Math.min(wave, 15)} / 15`;
    ui.score.textContent = `SCORE ${score}`;
    ui.best.textContent = `BEST ${best}`;
    ui.health.style.width = `${clamp(player ? player.hp / player.maxHp * 100 : 100, 0, 100)}%`;
    ui.weapon.textContent = player && player.weapon !== 'spread' && player.weaponTime > 0 ? `${player.weapon.toUpperCase()} ${Math.ceil(player.weaponTime)}s` : 'SPREAD // READY';
    const boss = enemies.find(enemy => enemy.type === 'boss' && !enemy.dead);
    ui.bossbar.style.opacity = boss ? '1' : '0';
    if (boss) ui.bossFill.style.width = `${clamp(boss.hp / boss.maxHp * 100, 0, 100)}%`;
  }

  function setStick(stick, point) {
    const dx = point.x - stick.baseX;
    const dy = point.y - stick.baseY;
    const len = Math.hypot(dx, dy);
    const radius = 43;
    const scale = len > radius ? radius / len : 1;
    stick.x = stick.baseX + dx * scale;
    stick.y = stick.baseY + dy * scale;
    stick.dx = dx / radius;
    stick.dy = dy / radius;
    stick.mag = clamp(len / radius, 0, 1);
  }

  function resetStick(stick) {
    stick.active = false;
    stick.pointer = null;
    stick.x = stick.baseX;
    stick.y = stick.baseY;
    stick.dx = 0;
    stick.dy = 0;
    stick.mag = 0;
  }

  function onPointerDown(event) {
    if (state !== 'playing') return;
    const p = pointFromEvent(event);
    if (p.x < 195) {
      if (sticks.left.active) return;
      sticks.left.active = true; sticks.left.pointer = event.pointerId; sticks.left.baseX = clamp(p.x, 57, 145); sticks.left.baseY = clamp(p.y, 150, 628); setStick(sticks.left, p);
    } else {
      if (sticks.right.active) return;
      sticks.right.active = true; sticks.right.pointer = event.pointerId; sticks.right.baseX = clamp(p.x, 245, 333); sticks.right.baseY = clamp(p.y, 150, 628); setStick(sticks.right, p);
    }
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    const p = pointFromEvent(event);
    if (sticks.left.active && sticks.left.pointer === event.pointerId) setStick(sticks.left, p);
    if (sticks.right.active && sticks.right.pointer === event.pointerId) setStick(sticks.right, p);
    event.preventDefault();
  }

  function onPointerUp(event) {
    if (sticks.left.pointer === event.pointerId) resetStick(sticks.left);
    if (sticks.right.pointer === event.pointerId) resetStick(sticks.right);
    event.preventDefault();
  }

  function onKey(event, down) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(event.code)) event.preventDefault();
    keys[event.code] = down;
    if (down && event.code === 'KeyR' && state !== 'playing') newRun();
  }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  canvas.addEventListener('pointercancel', onPointerUp, { passive: false });
  canvas.addEventListener('touchmove', event => event.preventDefault(), { passive: false });
  window.addEventListener('keydown', event => onKey(event, true), { passive: false });
  window.addEventListener('keyup', event => onKey(event, false), { passive: false });
  window.addEventListener('blur', () => { for (const key in keys) delete keys[key]; resetStick(sticks.left); resetStick(sticks.right); });
  window.addEventListener('resize', resize, { passive: true });
  ui.restart.addEventListener('click', newRun);

  function loop(now) {
    const dt = Math.min(.034, Math.max(.001, (now - lastTime) / 1000));
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  resize();
  newRun();
  requestAnimationFrame(loop);
})();
