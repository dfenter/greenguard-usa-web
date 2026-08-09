(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const TAU = Math.PI * 2;
  const COLORS = {
    bg: '#081116', floor: '#17232b', floor2: '#1c2c35', wall: '#415864', wallHi: '#607783',
    ink: '#d7f0ed', muted: '#86a4a5', cyan: '#58e0d4', amber: '#ffc857', violet: '#ad83ff',
    red: '#ff6678', orange: '#ff955c', blue: '#66a9ff', green: '#7de59a', white: '#f4ffff'
  };

  let W = 390, H = 700, dpr = 1, last = 0, time = 0;
  let camera = { x: 190, y: 410 }, shake = 0, flash = 0;
  let gameState = 'play', level = null, player = null, particles = [], bullets = [], texts = [];
  let levelNo = 1, kills = 0, roomsCleared = 0, score = 0, best = 0, toast = '', toastTime = 0;
  const keys = Object.create(null);
  const pointer = { moveId: null, fireId: null, moveX: 0, moveY: 0, fire: false };
  const touch = { stick: { x: 84, y: 608, r: 58 }, fire: { x: 318, y: 608, r: 58 }, swap: { x: 248, y: 516, w: 130, h: 42 } };

  const roomBlueprint = [
    { id: 'start', name: 'ENTRY', x: 70, y: 300, w: 260, h: 210 },
    { id: 'north', name: 'ARCHIVE', x: 390, y: 80, w: 250, h: 200 },
    { id: 'east', name: 'FOUNDRY', x: 760, y: 310, w: 280, h: 200 },
    { id: 'south', name: 'LIFT BAY', x: 430, y: 590, w: 260, h: 160 }
  ];
  const corridorBlueprint = [
    { x: 280, y: 175, w: 54, h: 180 }, { x: 280, y: 175, w: 160, h: 54 },
    { x: 585, y: 170, w: 210, h: 54 }, { x: 740, y: 170, w: 54, h: 180 },
    { x: 620, y: 450, w: 54, h: 170 }
  ];
  const doorBlueprint = [
    { id: 'amber', label: 'AMBER', x: 280, y: 260, w: 54, h: 14, color: COLORS.amber, cardRoom: 'start' },
    { id: 'cyan', label: 'CYAN', x: 700, y: 170, w: 14, h: 54, color: COLORS.cyan, cardRoom: 'north' },
    { id: 'violet', label: 'VIOLET', x: 620, y: 548, w: 54, h: 14, color: COLORS.violet, cardRoom: 'east' }
  ];

  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = Math.imul(1664525, s) + 1013904223 | 0) >>> 0) / 4294967296;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
  const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const rectHas = (r, x, y, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
  const fmt = n => String(Math.max(0, Math.floor(n))).padStart(3, '0');

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(320, r.width || window.innerWidth);
    H = Math.max(540, r.height || window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    touch.stick.x = 84;
    touch.stick.y = H - 91;
    touch.fire.x = W - 72;
    touch.fire.y = H - 91;
    touch.swap.x = W - 168;
    touch.swap.y = H - 174;
  }

  function loadBest() {
    try { const value = Number(localStorage.getItem('descentProtocolBest')); best = Number.isFinite(value) && value >= 0 ? value : 0; } catch (_) { best = 0; }
  }
  function saveBest() {
    if (score > best) {
      best = score;
      try { localStorage.setItem('descentProtocolBest', String(best)); } catch (_) {}
    }
  }

  function roomById(id) { return level.rooms.find(r => r.id === id); }
  function floorPoint(x, y) {
    return level.rooms.some(r => rectHas(r, x, y)) || level.corridors.some(r => rectHas(r, x, y));
  }
  function blockedDoor(x, y, pad = 0) {
    return level.doors.some(d => !d.open && rectHas(d, x, y, pad));
  }
  function walkable(x, y, radius = 0) {
    const pts = [[x, y], [x - radius, y], [x + radius, y], [x, y - radius], [x, y + radius]];
    return pts.every(p => floorPoint(p[0], p[1]) && !blockedDoor(p[0], p[1]));
  }
  function hasLOS(a, b) {
    const d = dist(a.x, a.y, b.x, b.y);
    const steps = Math.ceil(d / 18);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t);
      if (!floorPoint(x, y) || blockedDoor(x, y, 2)) return false;
    }
    return true;
  }

  function makeLevel(n) {
    const random = rng((0xD35C0DE ^ (n * 2654435761)) >>> 0);
    level = {
      no: n, seed: (0xD35C0DE ^ n * 2654435761) >>> 0,
      rooms: roomBlueprint.map(r => ({ ...r, entered: false, cleared: false, tint: Math.floor(random() * 3) })),
      corridors: corridorBlueprint.map(r => ({ ...r })),
      doors: doorBlueprint.map(d => ({ ...d, open: false })), cards: [], enemies: [], pickups: [], decor: [], lift: { x: 550, y: 670 },
      particlesSeed: random()
    };
    const cardPositions = [
      { key: 'amber', x: 214 + (random() - .5) * 30, y: 395 + (random() - .5) * 40 },
      { key: 'cyan', x: 520 + (random() - .5) * 38, y: 170 + (random() - .5) * 42 },
      { key: 'violet', x: 900 + (random() - .5) * 44, y: 398 + (random() - .5) * 46 }
    ];
    cardPositions.forEach(c => level.cards.push({ ...c, got: false, bob: random() * TAU }));
    const addEnemy = (type, roomId, x, y) => {
      const scale = 1 + (n - 1) * .16;
      const stats = {
        lunger: { hp: 32, speed: 92, radius: 15, color: COLORS.orange },
        gunner: { hp: 44, speed: 45, radius: 16, color: COLORS.red },
        turret: { hp: 66, speed: 0, radius: 20, color: COLORS.violet },
        warden: { hp: 100, speed: 38, radius: 21, color: COLORS.amber }
      }[type];
      level.enemies.push({ type, roomId, x, y, homeX: x, homeY: y, hp: stats.hp * scale, maxHp: stats.hp * scale,
        speed: stats.speed * (1 + Math.min(n - 1, 4) * .04), radius: stats.radius, color: stats.color,
        alive: true, alert: 0, state: 'patrol', cooldown: random() * 1.2, facing: random() * TAU,
        patrol: random() * TAU, shield: type === 'warden' ? 1 : 0 });
    };
    addEnemy('lunger', 'start', 264, 412);
    if (n > 1) addEnemy('gunner', 'start', 128, 342);
    addEnemy('gunner', 'north', 500, 145);
    addEnemy('lunger', 'north', 574, 225);
    if (n > 2) addEnemy('turret', 'north', 455, 230);
    addEnemy('turret', 'east', 890, 390);
    addEnemy('lunger', 'east', 970, 455);
    addEnemy('lunger', 'east', 815, 355);
    if (n > 1) addEnemy('gunner', 'east', 992, 350);
    addEnemy('warden', 'south', 575, 675);
    if (n > 2) addEnemy('lunger', 'south', 480, 645);
    level.pickups.push({ type: 'ammo', x: 585, y: 140, bob: random() * TAU });
    level.pickups.push({ type: 'med', x: 845, y: 455, bob: random() * TAU });
    level.pickups.push({ type: n % 2 ? 'spreadAmmo' : 'rifleAmmo', x: 495, y: 690, bob: random() * TAU });
    for (const r of level.rooms) {
      for (let i = 0; i < 7; i++) {
        const x = r.x + 24 + random() * Math.max(20, r.w - 48), y = r.y + 24 + random() * Math.max(20, r.h - 48);
        level.decor.push({ x, y, w: 8 + random() * 18, h: 3 + random() * 8, c: random() > .5 ? '#29404a' : '#21323a' });
      }
    }
    player = player || { x: 155, y: 410, health: 100, invuln: 0, face: 0, weapon: 0, shootTimer: 0,
      ammo: { spread: 10, rifle: 40 } };
    player.x = 155; player.y = 410; player.health = 100; player.invuln = .8; player.shootTimer = 0;
    gameState = 'play';
    toastMessage(n === 1 ? 'FIND THE AMBER CARD' : `DESCENT ${String(n).padStart(2, '0')}`);
  }

  function startRun() {
    levelNo = 1; kills = 0; roomsCleared = 0; score = 0; particles = []; bullets = []; texts = [];
    time = 0; camera = { x: 190, y: 410 }; shake = 0; flash = 0; toast = ''; toastTime = 0;
    for (const key in keys) delete keys[key];
    pointer.moveId = null; pointer.fireId = null; pointer.moveX = 0; pointer.moveY = 0; pointer.fire = false;
    player = { x: 155, y: 410, health: 100, invuln: .8, face: 0, weapon: 0, shootTimer: 0, ammo: { spread: 10, rifle: 40 } };
    makeLevel(1);
  }

  function toastMessage(message) { toast = message; toastTime = 2.2; }
  function addText(x, y, text, color = COLORS.white) { texts.push({ x, y, text, color, life: 1 }); }
  function burst(x, y, color, count = 10, power = 90) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = power * (.35 + Math.random() * .8);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .35 + Math.random() * .5, max: .8, size: 2 + Math.random() * 3, color });
    }
    if (particles.length > 320) particles.splice(0, particles.length - 320);
  }

  function currentTarget() {
    let bestEnemy = null, bestDistance = 640;
    for (const e of level.enemies) {
      if (!e.alive) continue;
      const d = dist(player.x, player.y, e.x, e.y);
      if (d < bestDistance && hasLOS(player, e)) { bestDistance = d; bestEnemy = e; }
    }
    return bestEnemy;
  }
  function inputVector() {
    let x = 0, y = 0;
    if (keys.w || keys.ArrowUp) y -= 1;
    if (keys.s || keys.ArrowDown) y += 1;
    if (keys.a || keys.ArrowLeft) x -= 1;
    if (keys.d || keys.ArrowRight) x += 1;
    x += pointer.moveX; y += pointer.moveY;
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l, power: 1 } : { x, y, power: Math.min(1, l) };
  }
  function isFiring() { return pointer.fire || keys[' '] || keys.Enter; }

  function cycleWeapon() {
    player.weapon = (player.weapon + 1) % 3;
    const names = ['PISTOL', 'SPREAD', 'RIFLE'];
    toastMessage(names[player.weapon]);
  }
  function weaponInfo() {
    return [
      { name: 'PISTOL', ammo: '∞', cooldown: .3, damage: 18, speed: 720, spread: 0, count: 1, color: COLORS.cyan },
      { name: 'SPREAD', ammo: player.ammo.spread, cooldown: .72, damage: 10, speed: 570, spread: .24, count: 5, color: COLORS.amber },
      { name: 'RIFLE', ammo: player.ammo.rifle, cooldown: .105, damage: 9, speed: 850, spread: .025, count: 1, color: COLORS.red }
    ][player.weapon];
  }
  function fireWeapon() {
    if (gameState !== 'play' || player.shootTimer > 0) return;
    const weapon = weaponInfo();
    if (player.weapon === 1 && player.ammo.spread <= 0) { toastMessage('NO SHELLS'); return; }
    if (player.weapon === 2 && player.ammo.rifle <= 0) { toastMessage('NO ROUNDS'); return; }
    const target = currentTarget();
    const base = target ? Math.atan2(target.y - player.y, target.x - player.x) : player.face;
    player.face = base;
    for (let i = 0; i < weapon.count; i++) {
      const a = base + (i - (weapon.count - 1) / 2) * weapon.spread;
      bullets.push({ friendly: true, x: player.x + Math.cos(a) * 18, y: player.y + Math.sin(a) * 18,
        vx: Math.cos(a) * weapon.speed, vy: Math.sin(a) * weapon.speed, damage: weapon.damage,
        life: .9, radius: player.weapon === 1 ? 3 : 2.5, color: weapon.color });
    }
    if (player.weapon === 1) player.ammo.spread--;
    if (player.weapon === 2) player.ammo.rifle--;
    player.shootTimer = weapon.cooldown;
    shake = Math.max(shake, player.weapon === 1 ? 5 : 2.5);
    flash = Math.max(flash, .08);
    burst(player.x + Math.cos(base) * 20, player.y + Math.sin(base) * 20, weapon.color, player.weapon === 1 ? 8 : 3, 55);
    for (const e of level.enemies) if (e.alive && dist(player.x, player.y, e.x, e.y) < 580) { e.alert = 5.5; e.state = 'alert'; }
  }

  function hurt(amount) {
    if (player.invuln > 0 || gameState !== 'play') return;
    player.health -= amount; player.invuln = .55; shake = Math.max(shake, 8); flash = .16;
    burst(player.x, player.y, COLORS.red, 6, 65);
    if (player.health <= 0) {
      player.health = 0; gameState = 'dead'; saveBest(); toast = '';
      burst(player.x, player.y, COLORS.red, 30, 150);
    }
  }

  function enemyShoot(e, damage, speed, color) {
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    bullets.push({ friendly: false, x: e.x + Math.cos(a) * 18, y: e.y + Math.sin(a) * 18,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, damage, life: 3, radius: 4, color });
    burst(e.x + Math.cos(a) * 17, e.y + Math.sin(a) * 17, color, 3, 45);
  }

  function updatePlayer(dt) {
    const move = inputVector();
    if (move.power > .02) {
      const speed = 190 * (0.4 + move.power * .6);
      const nx = player.x + move.x * speed * dt, ny = player.y + move.y * speed * dt;
      if (walkable(nx, player.y, 14)) player.x = nx;
      if (walkable(player.x, ny, 14)) player.y = ny;
      if (!currentTarget()) player.face = Math.atan2(move.y, move.x);
    }
    player.shootTimer = Math.max(0, player.shootTimer - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    if (isFiring()) fireWeapon();
    const room = level.rooms.find(r => rectHas(r, player.x, player.y));
    if (room) room.entered = true;
    for (const card of level.cards) {
      if (!card.got && dist(player.x, player.y, card.x, card.y) < 26) {
        card.got = true;
        const door = level.doors.find(d => d.id === card.key);
        if (door) door.open = true;
        addText(card.x, card.y - 20, `${card.key.toUpperCase()} CARD`, door ? door.color : COLORS.white);
        toastMessage(`${card.key.toUpperCase()} DOOR OPEN`);
        burst(card.x, card.y, door ? door.color : COLORS.white, 18, 85);
      }
    }
    for (const p of level.pickups) {
      if (!p.got && dist(player.x, player.y, p.x, p.y) < 24) {
        p.got = true;
        if (p.type === 'med') { player.health = Math.min(100, player.health + 34); toastMessage('MEDKIT +34'); addText(p.x, p.y - 20, '+34', COLORS.green); }
        else if (p.type === 'ammo') { player.ammo.spread += 5; player.ammo.rifle += 16; toastMessage('AMMO CACHE'); addText(p.x, p.y - 20, 'AMMO', COLORS.amber); }
        else if (p.type === 'spreadAmmo') { player.ammo.spread += 7; toastMessage('SHELLS +7'); addText(p.x, p.y - 20, '+7', COLORS.amber); }
        else { player.ammo.rifle += 24; toastMessage('RIFLE ROUNDS'); addText(p.x, p.y - 20, '+24', COLORS.red); }
        burst(p.x, p.y, p.type === 'med' ? COLORS.green : COLORS.amber, 14, 70);
      }
    }
    if (dist(player.x, player.y, level.lift.x, level.lift.y) < 42) {
      const ready = level.cards.every(c => c.got);
      if (ready) {
        levelNo++;
        score = roomsCleared + kills;
        makeLevel(levelNo);
      } else if (toastTime <= .1) toastMessage('THREE CARDS REQUIRED');
    }
  }

  function updateEnemies(dt) {
    for (const e of level.enemies) {
      if (!e.alive) continue;
      const d = dist(e.x, e.y, player.x, player.y);
      if (e.alert > 0) e.alert -= dt;
      if (d < 240 && hasLOS(e, player)) { e.alert = Math.max(e.alert, 2.2); e.state = 'alert'; }
      if (e.type === 'warden') e.shield = e.alert > 0 ? .92 : .58;
      if (e.alert > 0) {
        e.facing = Math.atan2(player.y - e.y, player.x - e.x);
        if (e.type === 'lunger' || e.type === 'warden') {
          if (d > (e.type === 'warden' ? 100 : 34)) {
            const a = Math.atan2(player.y - e.y, player.x - e.x);
            const speed = e.speed * (e.type === 'warden' ? .75 : 1);
            const nx = e.x + Math.cos(a) * speed * dt, ny = e.y + Math.sin(a) * speed * dt;
            if (walkable(nx, e.y, e.radius)) e.x = nx;
            if (walkable(e.x, ny, e.radius)) e.y = ny;
          } else if (e.type === 'lunger') hurt(22 * dt);
        } else if ((e.type === 'gunner' || e.type === 'turret') && d < 560 && hasLOS(e, player)) {
          e.cooldown -= dt;
          if (e.cooldown <= 0) {
            enemyShoot(e, e.type === 'turret' ? 12 : 8, e.type === 'turret' ? 250 : 220, e.color);
            e.cooldown = e.type === 'turret' ? 1.0 : 1.25;
          }
          if (e.type === 'gunner' && d < 230) {
            const a = Math.atan2(e.y - player.y, e.x - player.x), nx = e.x + Math.cos(a) * e.speed * dt, ny = e.y + Math.sin(a) * e.speed * dt;
            if (walkable(nx, e.y, e.radius)) e.x = nx;
            if (walkable(e.x, ny, e.radius)) e.y = ny;
          }
        }
      } else {
        e.patrol += dt * (e.type === 'warden' ? .8 : .35);
        e.facing = e.patrol + Math.sin(e.patrol * .7) * .25;
        if (e.type === 'warden') {
          const nx = e.homeX + Math.cos(e.patrol) * 35, ny = e.homeY + Math.sin(e.patrol * .8) * 24;
          if (walkable(nx, ny, e.radius)) { e.x = nx; e.y = ny; }
        }
      }
      if (d < e.radius + 15 && e.type !== 'lunger') hurt(12 * dt);
    }
    for (const r of level.rooms) {
      if (!r.entered || r.cleared) continue;
      if (!level.enemies.some(e => e.alive && e.roomId === r.id)) {
        r.cleared = true; roomsCleared++; score = roomsCleared + kills; addText(r.x + r.w / 2, r.y + 26, 'ROOM CLEAR', COLORS.green); toastMessage(`${r.name} CLEAR`);
      }
    }
  }

  function killEnemy(e) {
    if (!e.alive) return;
    e.alive = false; kills++; score = roomsCleared + kills; shake = Math.max(shake, 4);
    addText(e.x, e.y - 20, '+1', COLORS.green); burst(e.x, e.y, e.color, e.type === 'warden' ? 24 : 14, 110);
  }
  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || !floorPoint(b.x, b.y) || blockedDoor(b.x, b.y, b.radius)) { bullets.splice(i, 1); continue; }
      if (b.friendly) {
        let hit = false;
        for (const e of level.enemies) {
          if (!e.alive || dist(b.x, b.y, e.x, e.y) > e.radius + b.radius) continue;
          hit = true;
          const shotAngle = Math.atan2(b.vy, b.vx);
          if (e.type === 'warden' && e.shield > .7 && Math.abs(angleDiff(shotAngle, e.facing)) < 1.18 && Math.random() < e.shield) {
            burst(b.x, b.y, COLORS.blue, 5, 40); addText(e.x, e.y - 26, 'BLOCK', COLORS.blue);
          } else {
            e.hp -= b.damage; burst(b.x, b.y, b.color, 3, 32); if (e.hp <= 0) killEnemy(e);
          }
          break;
        }
        if (hit) bullets.splice(i, 1);
      } else if (dist(b.x, b.y, player.x, player.y) < 16) {
        hurt(b.damage); burst(b.x, b.y, b.color, 5, 45); bullets.splice(i, 1);
      }
    }
  }
  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .93; p.vy *= .93; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) { texts[i].y -= 22 * dt; texts[i].life -= dt; if (texts[i].life <= 0) texts.splice(i, 1); }
    toastTime = Math.max(0, toastTime - dt); shake = Math.max(0, shake - dt * 17); flash = Math.max(0, flash - dt);
  }

  function update(dt) {
    time += dt;
    if (gameState === 'play') { updatePlayer(dt); if (gameState === 'play') updateEnemies(dt); if (gameState === 'play') updateBullets(dt); }
    updateEffects(dt);
    camera.x = lerp(camera.x, player.x, Math.min(1, dt * 5)); camera.y = lerp(camera.y, player.y, Math.min(1, dt * 5));
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
  }
  function worldText(text, x, y, size, color, align = 'center') {
    ctx.font = `700 ${size}px system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function drawWorld() {
    ctx.fillStyle = '#0d171c'; ctx.fillRect(0, 0, 1200, 820);
    for (const c of level.corridors) { ctx.fillStyle = COLORS.floor; ctx.fillRect(c.x, c.y, c.w, c.h); ctx.strokeStyle = COLORS.wall; ctx.lineWidth = 6; ctx.strokeRect(c.x, c.y, c.w, c.h); }
    for (const r of level.rooms) {
      ctx.fillStyle = r.tint === 0 ? COLORS.floor : r.tint === 1 ? '#182831' : '#1a2930'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = COLORS.wall; ctx.lineWidth = 8; ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#263b45'; ctx.lineWidth = 2; ctx.strokeRect(r.x + 12, r.y + 12, r.w - 24, r.h - 24);
      worldText(r.name, r.x + 20, r.y + 25, 10, r.cleared ? COLORS.green : '#58727b', 'left');
    }
    for (const d of level.decor) { ctx.fillStyle = d.c; ctx.fillRect(d.x, d.y, d.w, d.h); }
    for (const d of level.doors) {
      if (d.open) { ctx.strokeStyle = d.color; ctx.globalAlpha = .35; ctx.lineWidth = 3; ctx.strokeRect(d.x, d.y, d.w, d.h); ctx.globalAlpha = 1; }
      else { ctx.fillStyle = '#10191e'; ctx.fillRect(d.x, d.y, d.w, d.h); ctx.strokeStyle = d.color; ctx.lineWidth = 3; ctx.strokeRect(d.x, d.y, d.w, d.h); }
    }
    const liftPulse = 1 + Math.sin(time * 3) * .12;
    ctx.save(); ctx.translate(level.lift.x, level.lift.y); ctx.rotate(Math.PI / 4); ctx.scale(liftPulse, liftPulse);
    ctx.fillStyle = '#293d45'; ctx.fillRect(-34, -34, 68, 68); ctx.strokeStyle = COLORS.cyan; ctx.lineWidth = 4; ctx.strokeRect(-30, -30, 60, 60); ctx.restore();
    worldText('LIFT', level.lift.x, level.lift.y, 11, COLORS.cyan);
    for (const c of level.cards) if (!c.got) {
      const bob = Math.sin(time * 4 + c.bob) * 4; ctx.save(); ctx.translate(c.x, c.y + bob); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = level.doors.find(d => d.id === c.key).color; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14; ctx.fillRect(-10, -10, 20, 20); ctx.shadowBlur = 0; ctx.restore();
    }
    for (const p of level.pickups) if (!p.got) {
      const bob = Math.sin(time * 3 + p.bob) * 3; ctx.save(); ctx.translate(p.x, p.y + bob); ctx.fillStyle = p.type === 'med' ? COLORS.green : p.type === 'rifleAmmo' ? COLORS.red : COLORS.amber; ctx.strokeStyle = '#081116'; ctx.lineWidth = 3;
      if (p.type === 'med') { ctx.fillRect(-11, -11, 22, 22); ctx.fillStyle = '#0b1a19'; ctx.fillRect(-3, -8, 6, 16); ctx.fillRect(-8, -3, 16, 6); }
      else { ctx.fillRect(-12, -8, 24, 16); ctx.strokeRect(-12, -8, 24, 16); ctx.fillStyle = '#152027'; ctx.fillRect(-7, -3, 4, 6); ctx.fillRect(1, -3, 4, 6); }
      ctx.restore();
    }
    for (const b of bullets) { ctx.fillStyle = b.color; ctx.shadowColor = b.color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; }
    for (const e of level.enemies) if (e.alive) drawEnemy(e);
    for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    const target = currentTarget();
    if (target) { ctx.strokeStyle = COLORS.cyan; ctx.globalAlpha = .45; ctx.lineWidth = 1.5; ctx.setLineDash([5, 8]); ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(target.x, target.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.strokeStyle = COLORS.white; ctx.beginPath(); ctx.arc(target.x, target.y, target.radius + 9 + Math.sin(time * 8) * 2, 0, TAU); ctx.stroke(); }
    drawPlayer();
    for (const t of texts) { ctx.globalAlpha = clamp(t.life, 0, 1); worldText(t.text, t.x, t.y, 12, t.color); ctx.globalAlpha = 1; }
  }
  function drawPlayer() {
    ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.face); ctx.globalAlpha = player.invuln > 0 && Math.floor(time * 18) % 2 ? .45 : 1;
    ctx.fillStyle = '#0b151a'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill();
    ctx.fillStyle = COLORS.cyan; ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = COLORS.white; ctx.fillRect(8, -4, 13, 8); ctx.fillStyle = '#0d3e47'; ctx.fillRect(-6, -5, 7, 10); ctx.restore();
  }
  function drawEnemy(e) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.facing);
    ctx.fillStyle = '#081116'; ctx.beginPath(); ctx.arc(0, 0, e.radius + 4, 0, TAU); ctx.fill();
    ctx.fillStyle = e.color;
    if (e.type === 'lunger') { ctx.rotate(Math.PI / 4); ctx.fillRect(-11, -11, 22, 22); ctx.fillStyle = '#24171a'; ctx.fillRect(2, -4, 13, 8); }
    else if (e.type === 'gunner') { ctx.fillRect(-13, -13, 26, 26); ctx.fillStyle = '#321b28'; ctx.fillRect(5, -4, 17, 8); }
    else if (e.type === 'turret') { ctx.rotate(Math.PI / 4); ctx.fillRect(-14, -14, 28, 28); ctx.rotate(-Math.PI / 4); ctx.fillStyle = '#281b3d'; ctx.fillRect(4, -4, 19, 8); }
    else { ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(17, -9); ctx.lineTo(14, 13); ctx.lineTo(0, 20); ctx.lineTo(-14, 13); ctx.lineTo(-17, -9); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff1b3'; ctx.lineWidth = 2; ctx.stroke(); ctx.strokeStyle = COLORS.blue; ctx.globalAlpha = e.shield; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 27, -1.1, 1.1); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.restore();
    if (e.hp < e.maxHp) { ctx.fillStyle = '#091217'; ctx.fillRect(e.x - 20, e.y - e.radius - 12, 40, 4); ctx.fillStyle = e.type === 'warden' ? COLORS.amber : COLORS.red; ctx.fillRect(e.x - 20, e.y - e.radius - 12, 40 * clamp(e.hp / e.maxHp, 0, 1), 4); }
    if (e.alert > 0) worldText('!', e.x, e.y - e.radius - 20, 14, COLORS.red);
  }

  function panel(x, y, w, h, fill = 'rgba(10,22,28,.88)', stroke = '#304954') {
    roundRect(x, y, w, h, 12); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
  }
  function drawHUD() {
    panel(12, 12, W - 24, 55);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '800 13px system-ui, sans-serif'; ctx.fillStyle = COLORS.cyan; ctx.fillText('DESCENT', 26, 29); ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = COLORS.muted; ctx.fillText(`LV ${String(levelNo).padStart(2, '0')}`, 26, 49);
    ctx.textAlign = 'center'; ctx.font = '800 13px system-ui, sans-serif'; ctx.fillStyle = COLORS.white; ctx.fillText(`SCORE ${fmt(score)}`, W * .52, 30); ctx.font = '700 10px system-ui, sans-serif'; ctx.fillStyle = COLORS.muted; ctx.fillText(`BEST ${fmt(best)}`, W * .52, 49);
    ctx.textAlign = 'right'; ctx.font = '800 13px system-ui, sans-serif'; ctx.fillStyle = COLORS.amber; ctx.fillText(`K ${String(kills).padStart(2, '0')}`, W - 26, 29); ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = COLORS.green; ctx.fillText(`${roomsCleared} ROOMS`, W - 26, 49);
    panel(12, 76, W - 24, 31, 'rgba(10,22,28,.72)', '#203943');
    const weapon = weaponInfo(); ctx.textAlign = 'left'; ctx.font = '800 11px system-ui, sans-serif'; ctx.fillStyle = weapon.color; ctx.fillText(`${weapon.name}  ${weapon.ammo}`, 24, 92);
    ctx.textAlign = 'right'; ctx.fillStyle = player.health > 35 ? COLORS.green : COLORS.red; ctx.fillText(`HP ${String(Math.ceil(player.health)).padStart(3, '0')}`, W - 24, 92);
    ctx.fillStyle = '#233941'; ctx.fillRect(24, 99, W - 48, 3); ctx.fillStyle = player.health > 35 ? COLORS.green : COLORS.red; ctx.fillRect(24, 99, (W - 48) * player.health / 100, 3);
    const cards = level.cards.map(c => c.got ? c.key : '·').join('  '); ctx.textAlign = 'center'; ctx.font = '700 10px system-ui, sans-serif'; ctx.fillStyle = COLORS.muted; ctx.fillText(`CARDS  ${cards}`, W / 2, 125);
    ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = '#9db6b5'; ctx.fillText('MOVE  •  HOLD FIRE  •  COLLECT CARDS  •  REACH LIFT', W / 2, 147);
  }
  function drawControls() {
    const s = touch.stick, f = touch.fire;
    ctx.globalAlpha = .82; ctx.fillStyle = 'rgba(19,42,49,.82)'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); ctx.strokeStyle = '#44666e'; ctx.lineWidth = 2; ctx.stroke();
    const knobX = s.x + pointer.moveX * 30, knobY = s.y + pointer.moveY * 30; ctx.fillStyle = pointer.moveId !== null ? COLORS.cyan : '#6e9295'; ctx.globalAlpha = pointer.moveId !== null ? .9 : .55; ctx.beginPath(); ctx.arc(knobX, knobY, 24, 0, TAU); ctx.fill();
    ctx.globalAlpha = pointer.fire ? .95 : .72; ctx.fillStyle = pointer.fire ? COLORS.red : '#7d4350'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill(); ctx.strokeStyle = '#da7180'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1; worldText('FIRE', f.x, f.y, 14, COLORS.white);
    panel(touch.swap.x, touch.swap.y, touch.swap.w, touch.swap.h, 'rgba(17,33,40,.92)', '#46616a'); ctx.textAlign = 'center'; ctx.font = '800 11px system-ui, sans-serif'; ctx.fillStyle = weaponInfo().color; ctx.fillText(`${weaponInfo().name}  ⇄`, touch.swap.x + touch.swap.w / 2, touch.swap.y + 15); ctx.font = '600 9px system-ui, sans-serif'; ctx.fillStyle = COLORS.muted; ctx.fillText('TAP TO SWAP', touch.swap.x + touch.swap.w / 2, touch.swap.y + 31);
  }
  function drawOverlay() {
    if (toastTime > 0 && toast) { const w = Math.min(W - 42, 280); panel((W - w) / 2, H * .2, w, 38, 'rgba(12,27,32,.92)', '#48636a'); worldText(toast, W / 2, H * .2 + 19, 12, COLORS.white); }
    if (gameState === 'dead') {
      ctx.fillStyle = 'rgba(4,10,13,.78)'; ctx.fillRect(0, 0, W, H); panel(28, H * .32, W - 56, 190, 'rgba(12,24,29,.97)', COLORS.red);
      worldText('RUN OVER', W / 2, H * .32 + 44, 26, COLORS.red); worldText(`SCORE  ${fmt(score)}`, W / 2, H * .32 + 82, 14, COLORS.white); worldText(`BEST  ${fmt(best)}`, W / 2, H * .32 + 107, 12, COLORS.muted); panel(W / 2 - 78, H * .32 + 130, 156, 42, '#263b43', COLORS.cyan); worldText('TAP TO RESTART', W / 2, H * .32 + 151, 11, COLORS.cyan);
    }
  }
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, H);
    const zoom = Math.min(.78, Math.max(.58, Math.min(W / 510, H / 900)));
    ctx.save(); ctx.translate(W / 2 + (Math.random() - .5) * shake, H / 2 + (Math.random() - .5) * shake); ctx.scale(zoom, zoom); ctx.translate(-camera.x, -camera.y); drawWorld(); ctx.restore();
    drawHUD(); drawControls(); drawOverlay();
    if (flash > 0) { ctx.fillStyle = `rgba(255,80,100,${flash * 1.8})`; ctx.fillRect(0, 0, W, H); }
  }
  function frame(now) {
    const dt = Math.min(.033, (now - last) / 1000 || .016); last = now; update(dt); render(); requestAnimationFrame(frame);
  }

  function pointerPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function hitCircle(p, c) { return dist(p.x, p.y, c.x, c.y) <= c.r + 10; }
  function hitRect(p, r) { return p.x >= r.x - 8 && p.x <= r.x + r.w + 8 && p.y >= r.y - 8 && p.y <= r.y + r.h + 8; }
  function handlePointerDown(e) {
    e.preventDefault(); const p = pointerPos(e); canvas.setPointerCapture?.(e.pointerId);
    if (gameState === 'dead') { startRun(); return; }
    if (hitRect(p, touch.swap)) { cycleWeapon(); return; }
    if (hitCircle(p, touch.fire)) { pointer.fireId = e.pointerId; pointer.fire = true; return; }
    if (hitCircle(p, touch.stick)) { pointer.moveId = e.pointerId; updateStick(p); }
  }
  function updateStick(p) {
    let dx = p.x - touch.stick.x, dy = p.y - touch.stick.y, l = Math.hypot(dx, dy); if (l > 42) { dx *= 42 / l; dy *= 42 / l; }
    pointer.moveX = dx / 42; pointer.moveY = dy / 42;
  }
  function handlePointerMove(e) { if (pointer.moveId === e.pointerId) { e.preventDefault(); updateStick(pointerPos(e)); } }
  function handlePointerUp(e) { e.preventDefault(); if (pointer.moveId === e.pointerId) { pointer.moveId = null; pointer.moveX = 0; pointer.moveY = 0; } if (pointer.fireId === e.pointerId) { pointer.fireId = null; pointer.fire = false; } }

  window.addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
  canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
  canvas.addEventListener('pointerup', handlePointerUp, { passive: false });
  canvas.addEventListener('pointercancel', handlePointerUp, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  window.addEventListener('keydown', e => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = true;
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (gameState === 'dead' && (e.key === 'Enter' || e.key === ' ')) startRun();
    if (gameState === 'play' && (k === 'q' || k === 'e' || k === '1' || k === '2' || k === '3')) { if (k === 'q' || k === 'e') cycleWeapon(); else player.weapon = Number(k) - 1; }
  });
  window.addEventListener('keyup', e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = false; });
  window.addEventListener('blur', () => { for (const key in keys) delete keys[key]; pointer.moveId = null; pointer.fireId = null; pointer.moveX = 0; pointer.moveY = 0; pointer.fire = false; });
  resize(); loadBest(); startRun(); requestAnimationFrame(frame);
})();
