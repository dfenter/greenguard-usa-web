(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const W = 360, H = 640;
  const arena = { l: 24, t: 91, r: 336, b: 604 };
  const TAU = Math.PI * 2;
  const BEST_KEY = 'deadline-dungeon-bests-v1';
  let scaleX = 1, scaleY = 1, dpr = 1;

  const input = {
    keys: Object.create(null), joy: { active: false, id: null, x: 0, y: 0, cx: 70, cy: 554 },
    attack: false, dash: false, pointer: { x: 0, y: 0 },
  };
  const game = {
    mode: 'run', type: 'daily', seed: dailySeed(), seedLabel: '', rooms: [], roomIndex: 0,
    roomTime: 0, runTime: 0, best: null, roomHits: 0, roomPenalty: 0, roomFlash: 0,
    shake: 0, transition: 0, transitionText: '', completed: false, won: false, newBest: false,
    player: null, enemies: [], bolts: [], particles: [], hazards: [], gate: null, key: null,
    announced: false, last: 0, attackQueued: false, dashQueued: false,
  };

  function dailySeed() {
    const d = new Date();
    const stamp = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    return hash32(stamp ^ 0xD3A11F);
  }
  function hash32(n) {
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return (n ^ (n >>> 16)) >>> 0;
  }
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function formatTime(t) {
    const ms = Math.max(0, Math.floor(t * 1000));
    return `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}.${pad(Math.floor(ms / 10) % 100)}`;
  }
  function readBests() {
    try {
      const saved = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch (_) { return {}; }
  }
  function saveBest() {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(bests)); } catch (_) {}
  }
  let bests = readBests();

  function seedText(seed) { return (seed >>> 0).toString(36).toUpperCase().slice(-6); }
  function resetRun(type, seed) {
    input.keys = Object.create(null); input.joy.active = false; input.joy.id = null; input.joy.x = 0; input.joy.y = 0; input.attack = false; input.dash = false; input.pointer.x = 0; input.pointer.y = 0; game.attackQueued = false; game.dashQueued = false; game.particles.length = 0; game.last = 0;
    game.mode = 'run';
    game.type = type || 'daily';
    game.seed = seed == null ? (type === 'daily' ? dailySeed() : hash32((Date.now() ^ performance.now()) >>> 0)) : seed >>> 0;
    game.seedLabel = seedText(game.seed);
    game.rooms = buildRooms(game.seed);
    game.roomIndex = 0;
    game.roomTime = 0;
    game.runTime = 0;
    const savedBest = Number(bests[`${game.type}:${game.seed}`]);
    game.best = Number.isFinite(savedBest) && savedBest >= 0 ? savedBest : null;
    game.roomHits = 0;
    game.roomPenalty = 0;
    game.roomFlash = 0;
    game.shake = 0;
    game.transition = 0;
    game.transitionText = '';
    game.completed = false;
    game.newBest = false;
    game.won = false;
    game.announced = false;
    loadRoom(0, true);
  }

  function buildRooms(seed) {
    const rooms = [];
    const random = rng(seed);
    const kinds = ['pack', 'spikes', 'pack', 'key', 'timing', 'pack', 'pack', 'timing', 'keypack'];
    for (let i = 0; i < 9; i++) rooms.push(makeRoom(i + 1, kinds[i], random));
    rooms.push(makeRoom(10, 'boss', random));
    return rooms;
  }
  function makeRoom(number, kind, random) {
    const room = { number, kind, hue: Math.floor(190 + random() * 75), variant: random(), obstacles: [], enemies: [], hazards: [], key: null };
    if (kind === 'pack' || kind === 'keypack') {
      const count = 3 + Math.floor(random() * 2);
      for (let i = 0; i < count; i++) {
        const types = ['drifter', 'watcher', 'skitter'];
        room.enemies.push({ type: types[i % types.length], x: 138 + random() * 130, y: 172 + random() * 350, phase: random() * TAU, hp: 2, speed: 1 + random() * .4 });
      }
    }
    if (kind === 'boss') room.enemies.push({ type: 'warden', x: 248, y: 322, phase: random() * TAU, hp: 15, maxHp: 15, speed: 1 });
    if (kind === 'spikes' || kind === 'timing' || kind === 'key' || kind === 'keypack') {
      const count = kind === 'timing' ? 6 : (kind === 'key' ? 4 : 3);
      for (let i = 0; i < count; i++) {
        const horizontal = i % 2 === 0;
        const x = horizontal ? 74 + (i % 3) * 82 : 138 + (i % 2) * 86;
        const y = horizontal ? 164 + (i % 3) * 116 : 128 + (i % 2) * 228;
        room.hazards.push({ x, y, w: horizontal ? 57 : 28, h: horizontal ? 25 : 62, phase: random() * TAU, active: true, timing: kind === 'timing' });
      }
    }
    if (kind === 'key' || kind === 'keypack') room.key = { x: 82 + random() * 95, y: 155 + random() * 280, collected: false };
    if (kind === 'key') room.obstacles.push({ x: 188, y: 204, w: 30, h: 152 });
    if (kind === 'keypack') room.obstacles.push({ x: 72, y: 268, w: 32, h: 116 });
    if (room.key && !keyReachable(room, room.key.x, room.key.y)) {
      const spots = [{ x: 120, y: 150 }, { x: 260, y: 150 }, { x: 120, y: 470 }, { x: 260, y: 470 }, { x: 280, y: 350 }, { x: 56, y: 480 }];
      const safe = spots.filter(p => keyReachable(room, p.x, p.y));
      const spot = safe.length ? safe[Math.floor(random() * safe.length)] : { x: 260, y: 470 };
      room.key.x = spot.x; room.key.y = spot.y;
    }
    return room;
  }

  function keyReachable(room, x, y) {
    return x >= arena.l + 18 && x <= arena.r - 18 && y >= arena.t + 18 && y <= arena.b - 18 && !room.obstacles.some(o => circleRect(x, y, 18, o));
  }

  function loadRoom(index, first) {
    const room = game.rooms[index];
    game.roomIndex = index;
    game.roomTime = 0;
    game.roomHits = 0;
    game.roomPenalty = 0;
    game.roomFlash = 0;
    game.enemies = room.enemies.map(e => ({ ...e, hurt: 0, hitCooldown: 0 }));
    game.hazards = room.hazards.map(h => ({ ...h, hitCooldown: 0 }));
    game.key = room.key ? { ...room.key } : null;
    game.bolts = [];
    game.gate = { x: 312, y: 348, w: 22, h: 74, open: false };
    game.player = { x: 53, y: 348, r: 11, faceX: 1, faceY: 0, dash: 0, dashCooldown: 0, attack: 0, attackCooldown: 0, invuln: first ? .4 : .2, trail: [] };
    game.transition = first ? .45 : .9;
    game.transitionText = `ROOM ${pad(room.number)}`;
    for (let i = 0; i < 12; i++) burst(50 + Math.random() * 270, 120 + Math.random() * 430, room.hue, 1);
  }

  function roomLabel(room) {
    return ({ pack: 'PACK', spikes: 'SPIKE RUN', timing: 'PULSE HALL', key: 'KEY DETOUR', keypack: 'KEY + PACK', boss: 'WARDEN' })[room.kind] || 'ROOM';
  }
  function roomReady() {
    const room = game.rooms[game.roomIndex];
    return game.enemies.length === 0 && (!game.key || game.key.collected);
  }
  function gateOpen() {
    game.gate.open = roomReady();
  }

  function update(dt) {
    if (window.innerWidth > window.innerHeight && window.innerHeight <= 560) return;
    dt = Math.min(.034, Math.max(0, dt));
    if (game.mode === 'run') {
      game.runTime += dt;
      game.roomTime += dt;
      game.roomFlash = Math.max(0, game.roomFlash - dt);
      if (game.transition > 0) game.transition = Math.max(0, game.transition - dt);
      updatePlayer(dt);
      updateHazards(dt);
      updateEnemies(dt);
      updateBolts(dt);
      updateParticles(dt);
      gateOpen();
      if (game.player.x > 300 && game.player.y > 305 && game.player.y < 430 && game.gate.open && game.transition <= 0) advanceRoom();
    } else {
      updateParticles(dt);
    }
    game.shake = Math.max(0, game.shake - dt * 2.6);
  }

  function movementVector() {
    let x = 0, y = 0;
    if (input.keys.a || input.keys.arrowleft) x -= 1;
    if (input.keys.d || input.keys.arrowright) x += 1;
    if (input.keys.w || input.keys.arrowup) y -= 1;
    if (input.keys.s || input.keys.arrowdown) y += 1;
    if (input.joy.active) { x += input.joy.x; y += input.joy.y; }
    const m = Math.hypot(x, y);
    return m > 1 ? { x: x / m, y: y / m, strength: 1 } : { x, y, strength: Math.min(1, m) };
  }
  function updatePlayer(dt) {
    const p = game.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.attack = Math.max(0, p.attack - dt);
    if (input.dash || game.dashQueued) {
      game.dashQueued = false;
      input.dash = false;
      if (p.dashCooldown <= 0) {
        const v = movementVector();
        const dx = v.strength ? v.x : p.faceX;
        const dy = v.strength ? v.y : p.faceY;
        p.dash = .19;
        p.dashCooldown = 1.05;
        p.invuln = .23;
        p.faceX = dx; p.faceY = dy;
        burst(p.x, p.y, 178, 12);
        game.shake = .22;
      }
    }
    const v = movementVector();
    if (v.strength > .12) { p.faceX = v.x; p.faceY = v.y; }
    if (input.attack || game.attackQueued) {
      game.attackQueued = false;
      input.attack = false;
      if (p.attackCooldown <= 0) {
        p.attack = .17;
        p.attackCooldown = .28;
        doAttack();
      }
    }
    const speed = p.dash > 0 ? 530 : 154;
    const oldX = p.x, oldY = p.y;
    p.x += v.x * speed * dt;
    p.y += v.y * speed * dt;
    if (p.dash > 0) p.dash -= dt;
    p.x = clamp(p.x, arena.l + p.r, arena.r - p.r - 2);
    p.y = clamp(p.y, arena.t + p.r, arena.b - p.r);
    if (collidesObstacle(p.x, p.y, p.r)) { p.x = oldX; p.y = oldY; }
    if (p.dash > 0 || Math.hypot(p.x - oldX, p.y - oldY) > 1) {
      p.trail.push({ x: p.x, y: p.y, life: .28 });
      if (p.trail.length > 8) p.trail.shift();
    }
    p.trail.forEach(t => t.life -= dt);
    p.trail = p.trail.filter(t => t.life > 0);
    if (game.key && !game.key.collected && distance(p, game.key) < 25) {
      game.key.collected = true;
      burst(game.key.x, game.key.y, 49, 20);
      game.shake = .16;
    }
  }
  function collidesObstacle(x, y, r) {
    return game.rooms[game.roomIndex].obstacles.some(o => {
      const nx = clamp(x, o.x, o.x + o.w), ny = clamp(y, o.y, o.y + o.h);
      return Math.hypot(x - nx, y - ny) < r;
    });
  }

  function doAttack() {
    const p = game.player;
    burst(p.x + p.faceX * 24, p.y + p.faceY * 24, 42, 4);
    for (const e of game.enemies) {
      const dx = e.x - p.x, dy = e.y - p.y, dist = Math.hypot(dx, dy) || 1;
      const dot = (dx * p.faceX + dy * p.faceY) / dist;
      if (dist < (e.type === 'warden' ? 62 : 55) && dot > -.12 && e.hitCooldown <= 0) {
        e.hp -= 1;
        e.hitCooldown = .18;
        e.hurt = .18;
        e.x += dx / dist * 16;
        e.y += dy / dist * 16;
        burst(e.x, e.y, e.type === 'warden' ? 322 : 24, 7);
        game.shake = .1;
        if (e.hp <= 0) {
          burst(e.x, e.y, e.type === 'warden' ? 322 : 8, e.type === 'warden' ? 26 : 13);
        }
      }
    }
    game.enemies = game.enemies.filter(e => e.hp > 0);
  }

  function updateEnemies(dt) {
    const p = game.player;
    for (const e of game.enemies) {
      e.hurt = Math.max(0, e.hurt - dt);
      e.hitCooldown = Math.max(0, e.hitCooldown - dt);
      e.phase += dt * (e.type === 'skitter' ? 5 : 1.5);
      let dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (e.type === 'watcher') {
        if (d > 134) { e.x += dx / d * 24 * dt; e.y += dy / d * 24 * dt; }
        if (d < 220 && Math.sin(e.phase * .7) > .82 && e.shotClock !== 1) {
          e.shotClock = 1;
          game.bolts.push({ x: e.x, y: e.y, vx: dx / d * 112, vy: dy / d * 112, life: 2.6 });
        }
        if (Math.sin(e.phase * .7) < .72) e.shotClock = 0;
      } else if (e.type === 'skitter') {
        const sx = -dy / d * Math.sin(e.phase) * 34;
        const sy = dx / d * Math.sin(e.phase) * 34;
        e.x += (dx / d * 66 + sx) * dt;
        e.y += (dy / d * 66 + sy) * dt;
      } else if (e.type === 'warden') {
        if (d > 116) { e.x += dx / d * 30 * dt; e.y += dy / d * 30 * dt; }
        if (d < 270 && Math.sin(e.phase * .72) > .91 && e.shotClock !== 1) {
          e.shotClock = 1;
          for (let i = -1; i <= 1; i++) {
            const a = Math.atan2(dy, dx) + i * .23;
            game.bolts.push({ x: e.x, y: e.y, vx: Math.cos(a) * 136, vy: Math.sin(a) * 136, life: 2.4, heavy: true });
          }
        }
        if (Math.sin(e.phase * .72) < .75) e.shotClock = 0;
      } else {
        e.x += dx / d * 47 * e.speed * dt;
        e.y += dy / d * 47 * e.speed * dt;
      }
      e.x = clamp(e.x, arena.l + 18, arena.r - 22);
      e.y = clamp(e.y, arena.t + 18, arena.b - 18);
      if (d < p.r + (e.type === 'warden' ? 24 : 14)) hurtPlayer(e.x, e.y, e.type === 'warden' ? 1.3 : 1);
    }
  }
  function updateBolts(dt) {
    for (const b of game.bolts) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life > 0 && distance(b, game.player) < game.player.r + 8) {
        b.life = 0;
        hurtPlayer(b.x, b.y, b.heavy ? 1.1 : .8);
        burst(b.x, b.y, 335, 5);
      }
    }
    game.bolts = game.bolts.filter(b => b.life > 0 && b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);
  }
  function updateHazards(dt) {
    const p = game.player;
    for (const h of game.hazards) {
      h.hitCooldown = Math.max(0, h.hitCooldown - dt);
      h.active = h.timing ? Math.sin(game.roomTime * 2.8 + h.phase) > -.18 : true;
      if (h.active && h.hitCooldown <= 0 && circleRect(p.x, p.y, p.r, h)) {
        h.hitCooldown = .9;
        hurtPlayer(h.x + h.w / 2, h.y + h.h / 2, 1.2);
      }
    }
  }
  function hurtPlayer(fromX, fromY, amount) {
    const p = game.player;
    if (p.invuln > 0 || game.mode !== 'run') return;
    p.invuln = .65;
    game.roomHits += 1;
    game.roomFlash = .2;
    game.runTime += 2;
    game.roomPenalty += 2;
    game.shake = .5;
    const dx = p.x - fromX, dy = p.y - fromY, d = Math.hypot(dx, dy) || 1;
    p.x = clamp(p.x + dx / d * 28, arena.l + p.r, arena.r - p.r - 2);
    p.y = clamp(p.y + dy / d * 28, arena.t + p.r, arena.b - p.r);
    burst(p.x, p.y, 347, 13);
    if (game.roomHits >= 3) restartRoom();
  }
  function restartRoom() {
    game.roomPenalty = 0;
    game.runTime += 10;
    game.roomFlash = .7;
    game.transitionText = `ROOM ${pad(game.roomIndex + 1)} RESET  +10s`;
    loadRoom(game.roomIndex, false);
    game.transition = 1.05;
  }
  function advanceRoom() {
    if (game.roomIndex >= game.rooms.length - 1) {
      game.mode = 'done';
      game.completed = true;
      game.won = true;
      const key = `${game.type}:${game.seed}`;
      const previousBest = Number(bests[key]);
      const validPrevious = Number.isFinite(previousBest) && previousBest >= 0;
      game.newBest = !validPrevious || game.runTime < previousBest;
      game.best = validPrevious ? Math.min(previousBest, game.runTime) : game.runTime;
      bests[key] = game.best;
      saveBest();
      burst(314, 368, 168, 42);
      return;
    }
    game.roomIndex += 1;
    loadRoom(game.roomIndex, false);
  }

  function updateParticles(dt) {
    for (const p of game.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .966; p.vy *= .966; p.life -= dt; }
    game.particles = game.particles.filter(p => p.life > 0);
  }
  function burst(x, y, hue, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = 18 + Math.random() * 90;
      game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .3 + Math.random() * .45, max: .75, size: 1 + Math.random() * 3, hue });
    }
  }

  function draw() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    const sh = game.shake * 7;
    ctx.fillStyle = '#080c16'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (sh) ctx.translate((Math.random() - .5) * sh, (Math.random() - .5) * sh);
    drawBackdrop();
    drawHud();
    drawRoom();
    drawEntities();
    drawParticles();
    drawControls();
    ctx.restore();
    if (game.mode === 'done') drawDone();
    if (game.transition > 0 && game.mode === 'run') drawTransition();
  }
  function drawBackdrop() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1222'); g.addColorStop(.52, '#111a2d'); g.addColorStop(1, '#080c16');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#18243a'; ctx.lineWidth = 1;
    for (let x = 12; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 90); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 100; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.fillStyle = '#0e1728'; ctx.fillRect(0, 0, W, 78);
    ctx.strokeStyle = '#283756'; ctx.beginPath(); ctx.moveTo(0, 78); ctx.lineTo(W, 78); ctx.stroke();
  }
  function drawHud() {
    const room = game.rooms[game.roomIndex];
    ctx.fillStyle = '#92a5c8'; ctx.font = '700 10px ui-sans-serif, system-ui'; ctx.letterSpacing = '1px';
    ctx.fillText(`${game.type === 'daily' ? 'DAILY' : 'PRACTICE'}  /  SEED ${game.seedLabel}`, 15, 18);
    ctx.fillStyle = '#f3f7ff'; ctx.font = '800 23px ui-monospace, SFMono-Regular, Menlo, monospace'; ctx.letterSpacing = '0px';
    ctx.fillText(formatTime(game.runTime), 14, 48);
    ctx.fillStyle = '#92a5c8'; ctx.font = '700 10px ui-sans-serif, system-ui';
    ctx.fillText(`BEST ${game.best == null ? '--:--.--' : formatTime(game.best)}`, 15, 65);
    pill(210, 10, 58, 29, `R${pad(game.roomIndex + 1)}`, '#17243c', '#b9c9e4');
    pill(274, 10, 72, 29, 'PRACTICE', '#17243c', '#93f2d6');
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i < game.roomIndex ? '#4ae2bd' : (i === game.roomIndex ? '#ffd36b' : '#263754');
      ctx.fillRect(15 + i * 26, 82, 20, 3);
    }
    ctx.fillStyle = '#b9c9e4'; ctx.font = '800 11px ui-sans-serif, system-ui';
    ctx.fillText(`${roomLabel(room)}  ·  SPLIT ${formatTime(game.roomTime)}`, 15, 104);
    if (game.roomPenalty > 0) { ctx.fillStyle = '#ff7582'; ctx.fillText(`+${game.roomPenalty.toFixed(0)}s`, 286, 104); }
  }
  function pill(x, y, w, h, text, fill, color) {
    ctx.fillStyle = fill; roundRect(x, y, w, h, 9); ctx.fill();
    ctx.strokeStyle = '#304363'; ctx.stroke();
    ctx.fillStyle = color; ctx.font = '800 9px ui-sans-serif, system-ui'; ctx.textAlign = 'center'; ctx.fillText(text, x + w / 2, y + 19); ctx.textAlign = 'left';
  }
  function drawRoom() {
    const room = game.rooms[game.roomIndex];
    ctx.fillStyle = '#0c1525'; roundRect(arena.l, arena.t + 12, arena.r - arena.l, arena.b - arena.t - 12, 14); ctx.fill();
    ctx.strokeStyle = `hsla(${room.hue}, 70%, 64%, .35)`; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = `hsla(${room.hue}, 70%, 64%, .1)`; ctx.fillRect(arena.l + 4, arena.t + 16, 6, arena.b - arena.t - 20);
    for (const o of room.obstacles) {
      ctx.fillStyle = '#192941'; roundRect(o.x, o.y, o.w, o.h, 7); ctx.fill();
      ctx.strokeStyle = '#2c4362'; ctx.stroke();
      ctx.fillStyle = '#315073'; ctx.fillRect(o.x + 5, o.y + 7, 3, Math.max(4, o.h - 14));
    }
    for (const h of game.hazards) drawHazard(h);
    drawGate();
    if (game.key && !game.key.collected) drawKey(game.key);
  }
  function drawHazard(h) {
    ctx.save(); ctx.globalAlpha = h.active ? 1 : .22;
    ctx.fillStyle = h.active ? '#d74d75' : '#532d50'; roundRect(h.x, h.y, h.w, h.h, 5); ctx.fill();
    ctx.strokeStyle = h.active ? '#ff8a7f' : '#8d516d'; ctx.lineWidth = 1;
    const n = h.w > h.h ? 5 : 4;
    for (let i = 0; i < n; i++) {
      const px = h.w > h.h ? h.x + 7 + i * (h.w - 14) / Math.max(1, n - 1) : h.x + h.w / 2;
      const py = h.w > h.h ? h.y + h.h / 2 : h.y + 7 + i * (h.h - 14) / Math.max(1, n - 1);
      ctx.beginPath();
      if (h.w > h.h) { ctx.moveTo(px - 5, py + 5); ctx.lineTo(px, py - 5); ctx.lineTo(px + 5, py + 5); }
      else { ctx.moveTo(px - 5, py - 5); ctx.lineTo(px + 5, py); ctx.lineTo(px - 5, py + 5); }
      ctx.stroke();
    }
    if (h.timing) { ctx.fillStyle = '#ffd36b'; ctx.globalAlpha *= .7; ctx.fillRect(h.x, h.y - 4, h.w, 2); }
    ctx.restore();
  }
  function drawGate() {
    const g = game.gate;
    ctx.save(); ctx.globalAlpha = g.open ? .98 : .38;
    ctx.fillStyle = g.open ? '#41e2b0' : '#5e708f'; roundRect(g.x, g.y, g.w, g.h, 7); ctx.fill();
    ctx.fillStyle = g.open ? '#d8fff4' : '#a5b3c8'; ctx.fillRect(g.x + 6, g.y + 10, 3, g.h - 20); ctx.fillRect(g.x + 13, g.y + 10, 3, g.h - 20);
    ctx.strokeStyle = g.open ? '#b7ffe8' : '#8493aa'; ctx.stroke();
    if (g.open) { ctx.fillStyle = '#9dffe0'; ctx.font = '800 9px ui-sans-serif, system-ui'; ctx.textAlign = 'center'; ctx.fillText('GO', g.x + 11, g.y - 7); ctx.textAlign = 'left'; }
    ctx.restore();
  }
  function drawKey(k) {
    const pulse = 1 + Math.sin(performance.now() / 180) * .12;
    ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(-.25); ctx.scale(pulse, pulse);
    ctx.shadowColor = '#ffd36b'; ctx.shadowBlur = 16; ctx.strokeStyle = '#ffe69a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(-5, 0, 7, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(16, 0); ctx.lineTo(16, 5); ctx.moveTo(10, 0); ctx.lineTo(10, 5); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffd36b'; ctx.font = '800 9px ui-sans-serif, system-ui'; ctx.fillText('KEY', k.x - 12, k.y - 17);
  }
  function drawEntities() {
    for (const b of game.bolts) {
      ctx.fillStyle = b.heavy ? '#ff8b8b' : '#f79cf4'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.heavy ? 6 : 4, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    }
    for (const e of game.enemies) drawEnemy(e);
    const p = game.player;
    for (const t of p.trail) { ctx.fillStyle = `hsla(167, 84%, 70%, ${t.life * .55})`; ctx.beginPath(); ctx.arc(t.x, t.y, 6 * t.life, 0, TAU); ctx.fill(); }
    if (p.attack > 0) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.faceY, p.faceX));
      ctx.strokeStyle = '#d9fff5'; ctx.shadowColor = '#45e1bb'; ctx.shadowBlur = 18; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(4, 0, 29, -.78, .78); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = p.invuln > 0 && Math.floor(p.invuln * 18) % 2 === 0 ? .4 : 1;
    ctx.fillStyle = '#e9fff9'; ctx.shadowColor = '#43e0b8'; ctx.shadowBlur = p.dash > 0 ? 23 : 10;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a3945'; ctx.beginPath(); ctx.arc(p.x + p.faceX * 4, p.y + p.faceY * 4, 3, 0, TAU); ctx.fill(); ctx.restore();
    if (game.roomHits > 0) {
      ctx.fillStyle = '#8da1bf'; ctx.font = '800 9px ui-sans-serif, system-ui'; ctx.fillText(`IMPACT ${Math.floor(game.roomHits)}/3`, 27, 119);
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i < game.roomHits ? '#ff6e7e' : '#31415b'; ctx.beginPath(); ctx.arc(102 + i * 11, 116, 3, 0, TAU); ctx.fill(); }
    }
  }
  function drawEnemy(e) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.globalAlpha = e.hurt > 0 ? .45 : 1;
    const boss = e.type === 'warden';
    const color = boss ? '#c183ff' : e.type === 'watcher' ? '#ffbd6f' : e.type === 'skitter' ? '#ff718a' : '#f35d76';
    ctx.shadowColor = color; ctx.shadowBlur = boss ? 20 : 10; ctx.fillStyle = color;
    if (boss) {
      ctx.rotate(Math.sin(e.phase) * .05); ctx.beginPath(); ctx.arc(0, 0, 27, 0, TAU); ctx.fill();
      ctx.fillStyle = '#211a38'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#f0d6ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 21, e.phase, e.phase + 4.8); ctx.stroke();
      ctx.fillStyle = '#ffd36b'; ctx.font = '800 9px ui-sans-serif, system-ui'; ctx.textAlign = 'center'; ctx.fillText('WARDEN', 0, -38); ctx.textAlign = 'left';
      ctx.fillStyle = '#2e2046'; roundRect(-34, 32, 68, 5, 2); ctx.fill(); ctx.fillStyle = '#c183ff'; ctx.fillRect(-34, 32, 68 * Math.max(0, e.hp / e.maxHp), 5);
    } else if (e.type === 'watcher') {
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill(); ctx.fillStyle = '#382b23'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffe0a8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(17, 0); ctx.stroke();
    } else if (e.type === 'skitter') {
      ctx.rotate(e.phase * .4); ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(12, 12); ctx.lineTo(-12, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#401c32'; ctx.fillRect(-3, 3, 6, 5);
    } else {
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill(); ctx.fillStyle = '#421b35'; ctx.beginPath(); ctx.arc(4, -3, 4, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffb0a4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-13, 9); ctx.lineTo(-20, 15); ctx.moveTo(13, 9); ctx.lineTo(20, 15); ctx.stroke();
    }
    ctx.restore();
  }
  function drawParticles() {
    for (const p of game.particles) { ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${Math.min(1, p.life * 2.2)})`; ctx.fillRect(p.x, p.y, p.size, p.size); }
  }
  function drawControls() {
    const j = input.joy;
    ctx.save(); ctx.globalAlpha = .8;
    ctx.fillStyle = '#13233a'; ctx.strokeStyle = '#46607c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(j.cx, j.cy, 38, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6d8ba5'; ctx.globalAlpha = .66; ctx.beginPath(); ctx.arc(j.cx + j.x * 17, j.cy + j.y * 17, 17, 0, TAU); ctx.fill();
    controlButton(224, 523, 64, 64, '#253657', '#f5c8d0', 'ATTACK');
    controlButton(291, 449, 52, 52, '#273652', '#93f2d6', 'DASH');
    ctx.globalAlpha = 1; ctx.fillStyle = '#8096b4'; ctx.font = '700 8px ui-sans-serif, system-ui'; ctx.textAlign = 'center'; ctx.fillText('MOVE', j.cx, j.cy + 3); ctx.textAlign = 'left';
    ctx.restore();
  }
  function controlButton(x, y, w, h, fill, color, label) {
    ctx.fillStyle = fill; roundRect(x, y, w, h, 17); ctx.fill(); ctx.strokeStyle = '#527091'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = color; ctx.font = `900 ${label === 'ATTACK' ? 9 : 8}px ui-sans-serif, system-ui`; ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y + h / 2 + 3); ctx.textAlign = 'left';
    if (label === 'DASH' && game.player && game.player.dashCooldown > 0) { ctx.fillStyle = '#0b1222aa'; roundRect(x, y, w, h * Math.min(1, game.player.dashCooldown / 1.05), 17); ctx.fill(); }
  }
  function drawTransition() {
    ctx.fillStyle = `rgba(6,10,18,${Math.min(.8, game.transition * .72)})`; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#eaf3ff'; ctx.font = '900 30px ui-sans-serif, system-ui'; ctx.textAlign = 'center'; ctx.fillText(game.transitionText, W / 2, 303);
    ctx.fillStyle = '#8ea4c8'; ctx.font = '700 11px ui-sans-serif, system-ui'; ctx.fillText('CLEAR THE ROOM · REACH THE GREEN GATE', W / 2, 327); ctx.textAlign = 'left';
  }
  function drawDone() {
    ctx.fillStyle = 'rgba(5, 9, 17, .84)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#44e0b6'; ctx.font = '900 13px ui-sans-serif, system-ui'; ctx.textAlign = 'center'; ctx.fillText('GAUNTLET CLEARED', W / 2, 170);
    ctx.fillStyle = '#f1f7ff'; ctx.font = '900 37px ui-monospace, monospace'; ctx.fillText(formatTime(game.runTime), W / 2, 220);
    ctx.fillStyle = '#8fa4c4'; ctx.font = '700 11px ui-sans-serif, system-ui'; ctx.fillText(game.newBest ? 'NEW SEED BEST' : `BEST  ${formatTime(game.best)}`, W / 2, 244);
    resultButton(49, 290, 262, 54, 'RUN DAILY', '#1d3b50', '#a7ffea');
    resultButton(49, 356, 262, 54, 'NEW PRACTICE SEED', '#30274d', '#dfc5ff');
    ctx.fillStyle = '#627795'; ctx.font = '700 10px ui-sans-serif, system-ui'; ctx.fillText('TAP A BUTTON  ·  PRESS D OR P', W / 2, 450);
    ctx.textAlign = 'left';
  }
  function resultButton(x, y, w, h, label, fill, color) {
    ctx.fillStyle = fill; roundRect(x, y, w, h, 14); ctx.fill(); ctx.strokeStyle = '#4a6380'; ctx.stroke();
    ctx.fillStyle = color; ctx.font = '900 12px ui-sans-serif, system-ui'; ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y + 33); ctx.textAlign = 'left';
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function circleRect(x, y, r, q) { const nx = clamp(x, q.x, q.x + q.w), ny = clamp(y, q.y, q.y + q.h); return Math.hypot(x - nx, y - ny) < r; }
  function canvasPoint(ev) {
    const rect = canvas.getBoundingClientRect();
    return { x: (ev.clientX - rect.left) * W / rect.width, y: (ev.clientY - rect.top) * H / rect.height };
  }
  function pressAt(x, y, id) {
    input.pointer.x = x; input.pointer.y = y;
    if (game.mode === 'done') {
      if (x >= 40 && x <= 320 && y >= 278 && y <= 350) { resetRun('daily', dailySeed()); return; }
      if (x >= 40 && x <= 320 && y >= 350 && y <= 428) { resetRun('practice'); return; }
    }
    if (y < 55 && x > 265) { resetRun('practice'); return; }
    if (x < 142 && y > 505) { input.joy.active = true; input.joy.id = id; updateJoy(x, y); return; }
    if (x > 210 && y > 515) { game.attackQueued = true; return; }
    if (x > 270 && y > 425 && y < 515) { game.dashQueued = true; return; }
  }
  function updateJoy(x, y) {
    const dx = x - input.joy.cx, dy = y - input.joy.cy, d = Math.hypot(dx, dy), max = 31;
    const s = d > max ? max / d : 1;
    input.joy.x = dx * s / max; input.joy.y = dy * s / max;
  }
  function releasePointer(id) {
    if (input.joy.id === id) { input.joy.active = false; input.joy.id = null; input.joy.x = 0; input.joy.y = 0; }
  }

  canvas.addEventListener('pointerdown', ev => { ev.preventDefault(); canvas.setPointerCapture?.(ev.pointerId); const q = canvasPoint(ev); pressAt(q.x, q.y, ev.pointerId); }, { passive: false });
  canvas.addEventListener('pointermove', ev => { if (input.joy.id === ev.pointerId) { ev.preventDefault(); const q = canvasPoint(ev); updateJoy(q.x, q.y); } }, { passive: false });
  canvas.addEventListener('pointerup', ev => { ev.preventDefault(); releasePointer(ev.pointerId); }, { passive: false });
  canvas.addEventListener('pointercancel', ev => releasePointer(ev.pointerId));
  canvas.addEventListener('contextmenu', ev => ev.preventDefault());
  window.addEventListener('keydown', ev => {
    const k = ev.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'enter'].includes(k)) ev.preventDefault();
    if (k === 'p') { resetRun('practice'); return; }
    if (k === 'd' && game.mode === 'done') { resetRun('daily', dailySeed()); return; }
    input.keys[k] = true;
    if ((k === ' ' || k === 'enter') && game.mode === 'run') game.attackQueued = true;
    if (k === 'shift' && game.mode === 'run') game.dashQueued = true;
    if (k === 'r' && game.mode === 'run') restartRoom();
  });
  window.addEventListener('keyup', ev => { input.keys[ev.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { input.keys = Object.create(null); input.joy.active = false; input.joy.x = 0; input.joy.y = 0; });
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const longAxis = Math.max(rect.width, rect.height) * dpr;
    const cap = longAxis > 960 ? 960 / longAxis : 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr * cap));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr * cap));
    scaleX = rect.width / W; scaleY = rect.height / H;
  }
  window.addEventListener('resize', resize);
  resetRun('daily', dailySeed());
  resize();
  function frame(now) { const dt = game.last ? (now - game.last) / 1000 : 0; game.last = now; update(dt); draw(); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
})();
