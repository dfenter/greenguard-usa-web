(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const TAU = Math.PI * 2;
  const WIN_WAVE = 8;
  const MAX_DT = 0.034;
  const DPR_CAP = 2;
  const upgrades = [
    { id: 'rapid', name: 'RAPID COIL', detail: 'Fire rate +22%', color: '#55e6ff' },
    { id: 'shield', name: 'AUX SHIELD', detail: 'Restore 1 shield', color: '#70f6b4' },
    { id: 'engine', name: 'ION ENGINE', detail: 'Thrust +24%', color: '#ffcf66' },
    { id: 'core', name: 'COIL CORE', detail: 'Bullet damage +1', color: '#d59bff' }
  ];

  let W = 390, H = 700, dpr = 1;
  let state = 'play';
  let wave = 1;
  let score = 0;
  let ore = 0;
  let best = readBest();
  let runSeed = ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) || 1;
  let rng = mulberry32(runSeed);
  let waveRng = rng;
  let ship;
  let asteroids = [];
  let bullets = [];
  let mines = [];
  let drones = [];
  let crystals = [];
  let particles = [];
  let stars = [];
  let offers = [];
  let last = performance.now();
  let flash = 0;
  let shake = 0;
  let waveBanner = 0;
  let waveClearTimer = 0;
  let message = '';
  let messageTimer = 0;
  let lastDashTap = -9999;
  let dashCooldown = 0;
  let firePointer = -1;
  let stickPointer = -1;
  let stick = { x: 0, y: 0, active: false };
  const keys = Object.create(null);

  resize();
  resetRun();
  bindInput();
  requestAnimationFrame(frame);

  function readBest() {
    try { return Number(localStorage.getItem('hullbreaker-best') || 0) || 0; }
    catch (_) { return 0; }
  }

  function saveBest() {
    if (score > best) {
      best = score;
      try { localStorage.setItem('hullbreaker-best', String(best)); } catch (_) {}
    }
  }

  function mulberry32(seed) {
    return () => {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function rand(a = 0, b = 1) { return a + (b - a) * waveRng(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(a, b) { const x = a.x - b.x, y = a.y - b.y; return x * x + y * y; }
  function angleDiff(a, b) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
  function wrap(o, margin = 0) {
    if (o.x < -margin) o.x = W + margin;
    else if (o.x > W + margin) o.x = -margin;
    if (o.y < -margin) o.y = H + margin;
    else if (o.y > H + margin) o.y = -margin;
  }

  function resize() {
    W = Math.max(280, window.innerWidth || 390);
    H = Math.max(480, window.innerHeight || 700);
    const longAxis = Math.max(W, H);
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP, 960 / longAxis);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (stars.length) makeStars();
  }

  function makeStars() {
    const starRng = mulberry32(runSeed ^ 0x9e3779b9);
    stars = [];
    const count = Math.round(clamp(W * H / 6200, 46, 105));
    for (let i = 0; i < count; i++) {
      stars.push({ x: starRng() * W, y: starRng() * H, r: starRng() * 1.5 + 0.25, a: starRng() * 0.46 + 0.16, p: starRng() * TAU });
    }
  }

  function resetRun() {
    runSeed = ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) || 1;
    rng = mulberry32(runSeed);
    makeStars();
    wave = 1; score = 0; ore = 0; state = 'play';
    flash = 0; shake = 0; message = ''; messageTimer = 0; waveClearTimer = 0;
    dashCooldown = 0; lastDashTap = -9999; firePointer = -1; stickPointer = -1; stick.active = false; stick.x = 0; stick.y = 0; for (const k in keys) delete keys[k];
    ship = { x: W / 2, y: H * 0.53, vx: 0, vy: 0, r: 13, angle: -Math.PI / 2,
      shields: 3, invuln: 0, fireTimer: 0, fireRate: 4.5, thrust: 245, damage: 1, dash: 0 };
    particles = []; bullets = []; asteroids = []; mines = []; drones = []; crystals = [];
    beginWave();
  }

  function beginWave() {
    waveRng = mulberry32((runSeed + Math.imul(wave, 0x45d9f3b)) >>> 0);
    asteroids = []; bullets = []; mines = []; drones = []; crystals = [];
    waveBanner = 2.2;
    const count = Math.min(3 + wave, 9);
    for (let i = 0; i < count; i++) spawnAsteroid(3, true);
    const crystalCount = Math.min(1 + Math.floor((wave + 1) / 2), 4);
    for (let i = 0; i < crystalCount; i++) spawnCrystal();
    if (wave >= 2) {
      const mineCount = Math.min(1 + Math.floor(wave / 2), 4);
      for (let i = 0; i < mineCount; i++) spawnMine();
    }
    if (wave >= 3) spawnDrone();
    message = wave === 1 ? 'HULLBREAKER' : 'WAVE ' + wave;
    messageTimer = 1.7;
  }

  function safeSpawnPoint(min = 145) {
    let x, y, tries = 0;
    do {
      x = rand(25, W - 25); y = rand(80, H * 0.56); tries++;
    } while (tries < 30 && ((x - ship.x) * (x - ship.x) + (y - ship.y) * (y - ship.y) < min * min));
    return { x, y };
  }

  function spawnAsteroid(size, away) {
    const p = safeSpawnPoint(away ? 175 : 40);
    const radii = [16, 27, 43];
    const r = radii[size - 1];
    const angle = rand(0, TAU);
    const speed = rand(18, 50) + wave * 2;
    const chunks = [];
    for (let i = 0; i < 9; i++) chunks.push(rand(0.76, 1.22));
    asteroids.push({ x: p.x, y: p.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      r, size, rot: rand(0, TAU), spin: rand(-0.9, 0.9), chunks, hit: 0 });
  }

  function splitAsteroid(a) {
    if (a.size > 1) {
      for (let i = 0; i < 2; i++) {
        const ang = Math.atan2(a.vy, a.vx) + (i ? 1 : -1) * rand(0.5, 1.3);
        const speed = Math.max(34, Math.hypot(a.vx, a.vy) + rand(24, 56));
        const r = a.size === 3 ? 27 : 16;
        const chunks = [];
        for (let j = 0; j < 9; j++) chunks.push(rand(0.76, 1.22));
        asteroids.push({ x: a.x + Math.cos(ang) * 7, y: a.y + Math.sin(ang) * 7,
          vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r, size: a.size - 1,
          rot: rand(0, TAU), spin: rand(-1.5, 1.5), chunks, hit: 0 });
      }
    }
  }

  function spawnMine() {
    const p = safeSpawnPoint(170);
    const ang = rand(0, TAU), speed = rand(12, 31);
    mines.push({ x: p.x, y: p.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      r: 13, phase: rand(0, TAU), armed: rand(0, 1) > 0.2 });
  }

  function spawnDrone() {
    const p = safeSpawnPoint(210);
    drones.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 17, hp: 3, phase: rand(0, TAU), hit: 0 });
  }

  function spawnCrystal() {
    const p = safeSpawnPoint(115);
    const a = rand(0, TAU), speed = rand(8, 22);
    crystals.push({ x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      r: 10, spin: rand(0, TAU), phase: rand(0, TAU) });
  }

  function bindInput() {
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'enter', 'w', 'a', 's', 'd', 'shift'].includes(k)) e.preventDefault();
      if ((state === 'gameover' || state === 'win') && (k === 'enter' || k === ' ')) { resetRun(); return; }
      if (state === 'upgrade' && (k === '1' || k === '2' || k === 'enter' || k === ' ')) { chooseUpgrade(k === '2' ? 1 : 0); return; }
      if ((k === 'enter' || k === 'shift') && !keys[k]) boost();
      keys[k] = true;
    });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { for (const k in keys) delete keys[k]; firePointer = -1; stickPointer = -1; stick.active = false; stick.x = 0; stick.y = 0; lastDashTap = -9999; });
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const p = pointFromEvent(e);
      if (state === 'gameover' || state === 'win') { resetRun(); return; }
      if (state === 'upgrade') { chooseUpgradeAt(p.x, p.y); return; }
      if (isStickZone(p.x, p.y)) {
        stickPointer = e.pointerId; stick.active = true; updateStick(p.x, p.y); canvas.setPointerCapture?.(e.pointerId); return;
      }
      if (isDashZone(p.x, p.y)) {
        const now = performance.now();
        if (now - lastDashTap < 330) boost();
        lastDashTap = now;
        return;
      }
      if (isFireZone(p.x, p.y)) { firePointer = e.pointerId; canvas.setPointerCapture?.(e.pointerId); }
    }, { passive: false });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === stickPointer) { e.preventDefault(); const p = pointFromEvent(e); updateStick(p.x, p.y); }
    }, { passive: false });
    const release = (e) => {
      if (e.pointerId === stickPointer) { stickPointer = -1; stick.active = false; stick.x = 0; stick.y = 0; }
      if (e.pointerId === firePointer) firePointer = -1;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  function pointFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }

  function isStickZone(x, y) { return y > H - 225 && x < W * 0.53; }
  function isFireZone(x, y) { return y > H - 220 && x > W * 0.52 && !isDashZone(x, y); }
  function isDashZone(x, y) { return x > W - 102 && y > H - 286 && y < H - 178; }

  function updateStick(x, y) {
    const cx = W * 0.19, cy = H - 112, radius = 64;
    let dx = x - cx, dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d > radius) { dx *= radius / d; dy *= radius / d; }
    stick.x = dx / radius; stick.y = dy / radius;
  }

  function boost() {
    if (state !== 'play' || dashCooldown > 0) return;
    const input = getControlVector();
    let dx = input.x, dy = input.y;
    if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(ship.angle); dy = Math.sin(ship.angle); }
    const d = Math.hypot(dx, dy) || 1;
    ship.vx += dx / d * 315; ship.vy += dy / d * 315; ship.dash = 0.25; dashCooldown = 1.25;
    shake = Math.max(shake, 7); burst(ship.x, ship.y, '#ffcf66', 16, 110);
  }

  function getControlVector() {
    if (stick.active || Math.hypot(stick.x, stick.y) > 0.02) return { x: stick.x, y: stick.y };
    let x = 0, y = 0;
    if (keys.arrowleft || keys.a) x -= 1;
    if (keys.arrowright || keys.d) x += 1;
    if (keys.arrowup || keys.w) y -= 1;
    if (keys.arrowdown || keys.s) y += 1;
    return { x, y };
  }

  function frame(now) {
    const dt = Math.min(MAX_DT, Math.max(0.001, (now - last) / 1000));
    last = now;
    update(dt);
    draw(now / 1000);
    requestAnimationFrame(frame);
  }

  function update(dt) {
    flash = Math.max(0, flash - dt * 2.8);
    shake = Math.max(0, shake - dt * 18);
    messageTimer = Math.max(0, messageTimer - dt);
    waveBanner = Math.max(0, waveBanner - dt);
    dashCooldown = Math.max(0, dashCooldown - dt);
    updateParticles(dt);
    if (state !== 'play') return;
    waveClearTimer = Math.max(0, waveClearTimer - dt);
    updateShip(dt);
    updateBullets(dt);
    updateAsteroids(dt);
    updateMines(dt);
    updateDrones(dt);
    updateCrystals(dt);
    collisions();
    if (asteroids.length === 0 && waveClearTimer <= 0) {
      score += wave * 120;
      saveBest();
      if (wave >= WIN_WAVE) { state = 'win'; burst(ship.x, ship.y, '#70f6b4', 48, 220); return; }
      state = 'upgrade';
      offers = makeOffers();
      burst(ship.x, ship.y, '#55e6ff', 26, 150);
    }
  }

  function updateShip(dt) {
    ship.invuln = Math.max(0, ship.invuln - dt);
    ship.dash = Math.max(0, ship.dash - dt);
    const control = getControlVector();
    const mag = clamp(Math.hypot(control.x, control.y), 0, 1);
    const keyboardRotate = (keys.arrowleft || keys.a ? -1 : 0) + (keys.arrowright || keys.d ? 1 : 0);
    if (stick.active || Math.hypot(stick.x, stick.y) > 0.02) {
      if (mag > 0.08) {
        const target = Math.atan2(control.y, control.x);
        ship.angle += clamp(angleDiff(ship.angle, target), -7 * dt, 7 * dt);
      }
      if (mag > 0.04) {
        ship.vx += Math.cos(ship.angle) * ship.thrust * mag * dt;
        ship.vy += Math.sin(ship.angle) * ship.thrust * mag * dt;
      }
    } else {
      if (keyboardRotate) ship.angle += keyboardRotate * 3.8 * dt;
      if (keys.arrowup || keys.w) {
        ship.vx += Math.cos(ship.angle) * ship.thrust * dt;
        ship.vy += Math.sin(ship.angle) * ship.thrust * dt;
      }
      if (keys.arrowdown || keys.s) {
        ship.vx -= Math.cos(ship.angle) * ship.thrust * 0.55 * dt;
        ship.vy -= Math.sin(ship.angle) * ship.thrust * 0.55 * dt;
      }
    }
    const drag = Math.pow(0.992, dt * 60);
    ship.vx *= drag; ship.vy *= drag;
    const max = ship.dash > 0 ? 610 : 300;
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > max) { ship.vx = ship.vx / speed * max; ship.vy = ship.vy / speed * max; }
    ship.x += ship.vx * dt; ship.y += ship.vy * dt; wrap(ship, 18);
    ship.fireTimer -= dt;
    if ((firePointer !== -1 || keys[' '] || keys.enter) && ship.fireTimer <= 0) fire();
  }

  function fire() {
    ship.fireTimer = 1 / ship.fireRate;
    const x = ship.x + Math.cos(ship.angle) * 18, y = ship.y + Math.sin(ship.angle) * 18;
    bullets.push({ x, y, vx: ship.vx + Math.cos(ship.angle) * 500, vy: ship.vy + Math.sin(ship.angle) * 500,
      life: 0.95, r: 3.2, damage: ship.damage });
    burst(x, y, '#d9fbff', 2, 40);
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; wrap(b, 5);
      if (b.life <= 0) bullets.splice(i, 1);
    }
  }

  function updateAsteroids(dt) {
    for (const a of asteroids) {
      a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.spin * dt; a.hit = Math.max(0, a.hit - dt); wrap(a, a.r);
    }
  }

  function updateMines(dt) {
    for (const m of mines) { m.x += m.vx * dt; m.y += m.vy * dt; m.phase += dt * 3; wrap(m, m.r); }
  }

  function updateDrones(dt) {
    for (const d of drones) {
      d.phase += dt * 3; d.hit = Math.max(0, d.hit - dt);
      const ang = Math.atan2(ship.y - d.y, ship.x - d.x);
      d.vx += Math.cos(ang) * 38 * dt; d.vy += Math.sin(ang) * 38 * dt;
      const speed = Math.hypot(d.vx, d.vy);
      if (speed > 88) { d.vx = d.vx / speed * 88; d.vy = d.vy / speed * 88; }
      d.vx *= Math.pow(0.994, dt * 60); d.vy *= Math.pow(0.994, dt * 60);
      d.x += d.vx * dt; d.y += d.vy * dt; wrap(d, d.r);
    }
  }

  function updateCrystals(dt) {
    for (const c of crystals) { c.x += c.vx * dt; c.y += c.vy * dt; c.spin += dt * 2; c.phase += dt * 2; wrap(c, c.r); }
  }

  function collisions() {
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi]; let hit = false;
      for (let ai = asteroids.length - 1; ai >= 0 && !hit; ai--) {
        const a = asteroids[ai];
        if (circleHit(b, a)) {
          hit = true; asteroids.splice(ai, 1); splitAsteroid(a); score += a.size === 3 ? 30 : a.size === 2 ? 55 : 90;
          burst(a.x, a.y, a.size === 3 ? '#7d8792' : '#9ca6b2', a.size * 5 + 5, 90); shake = Math.max(shake, a.size * 1.7);
        }
      }
      for (let mi = mines.length - 1; mi >= 0 && !hit; mi--) {
        const m = mines[mi];
        if (circleHit(b, m)) { hit = true; mines.splice(mi, 1); score += 75; burst(m.x, m.y, '#ff966b', 15, 100); shake = Math.max(shake, 4); }
      }
      for (let di = drones.length - 1; di >= 0 && !hit; di--) {
        const d = drones[di];
        if (circleHit(b, d)) { hit = true; d.hp -= b.damage; d.hit = 0.16; burst(b.x, b.y, '#d59bff', 5, 45); if (d.hp <= 0) { drones.splice(di, 1); score += 220; burst(d.x, d.y, '#d59bff', 25, 170); } }
      }
      if (hit) bullets.splice(bi, 1);
    }
    if (ship.invuln <= 0) {
      for (let i = asteroids.length - 1; i >= 0; i--) if (circleHit(ship, asteroids[i], 5)) { asteroids.splice(i, 1); hurt(); break; }
      for (let i = mines.length - 1; i >= 0; i--) if (circleHit(ship, mines[i], 5)) { mines.splice(i, 1); hurt(); break; }
      for (const d of drones) if (circleHit(ship, d, 5)) { hurt(); break; }
    }
    for (let i = crystals.length - 1; i >= 0; i--) {
      if (circleHit(ship, crystals[i], 7)) { const c = crystals[i]; crystals.splice(i, 1); ore++; score += 40; message = 'ORE +1'; messageTimer = 0.8; burst(c.x, c.y, '#70f6b4', 12, 75); }
    }
  }

  function circleHit(a, b, extra = 0) { const rr = a.r + b.r + extra; return dist2(a, b) < rr * rr; }

  function hurt() {
    ship.shields--; ship.invuln = 1.55; flash = 1; shake = 12; burst(ship.x, ship.y, '#ff6978', 24, 150);
    ship.vx *= -0.4; ship.vy *= -0.4;
    if (ship.shields <= 0) { state = 'gameover'; saveBest(); burst(ship.x, ship.y, '#ff6978', 50, 230); }
  }

  function makeOffers() {
    const a = upgrades[Math.floor(rng() * upgrades.length)];
    let b = upgrades[Math.floor(rng() * upgrades.length)];
    while (b.id === a.id) b = upgrades[Math.floor(rng() * upgrades.length)];
    return [a, b];
  }

  function chooseUpgradeAt(x, y) {
    if (y > H * 0.34 && y < H * 0.75) chooseUpgrade(x < W / 2 ? 0 : 1);
  }

  function chooseUpgrade(index) {
    if (state !== 'upgrade' || !offers[index]) return;
    const id = offers[index].id;
    if (id === 'rapid') ship.fireRate *= 1.22;
    if (id === 'shield') ship.shields = Math.min(3, ship.shields + 1);
    if (id === 'engine') ship.thrust *= 1.24;
    if (id === 'core') ship.damage += 1;
    message = offers[index].name + ' ONLINE'; messageTimer = 1.2;
    wave++; state = 'play'; waveClearTimer = 0.55; beginWave();
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = Math.random() * speed;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: Math.random() * 0.45 + 0.22,
        max: 0.67, size: Math.random() * 2.8 + 1, color });
    }
    if (particles.length > 320) particles.splice(0, particles.length - 320);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function draw(time) {
    ctx.save();
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.translate(sx, sy);
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#081a2a'); bg.addColorStop(1, '#030a12');
    ctx.fillStyle = bg; ctx.fillRect(-20, -20, W + 40, H + 40);
    drawStars(time); drawGrid();
    for (const c of crystals) drawCrystal(c, time);
    for (const a of asteroids) drawAsteroid(a);
    for (const m of mines) drawMine(m, time);
    for (const d of drones) drawDrone(d, time);
    for (const b of bullets) drawBullet(b);
    drawParticles();
    if (state === 'play') drawShip(time);
    drawHud();
    if (state === 'upgrade') drawUpgrade();
    else if (state === 'gameover') drawEnd(false);
    else if (state === 'win') drawEnd(true);
    ctx.restore();
  }

  function drawStars(time) {
    for (const s of stars) {
      ctx.globalAlpha = s.a * (0.75 + Math.sin(time * 1.4 + s.p) * 0.25);
      ctx.fillStyle = '#a9dbef'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(74,154,184,0.055)'; ctx.lineWidth = 1;
    const gap = 48;
    for (let x = (W % gap) / 2; x < W; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = (H % gap) / 2; y < H; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }

  function drawAsteroid(a) {
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot);
    ctx.fillStyle = a.hit > 0 ? '#dfe8ed' : a.size === 3 ? '#4e5c67' : a.size === 2 ? '#667580' : '#8798a3';
    ctx.strokeStyle = a.size === 3 ? '#9aa8b2' : '#b3c1c8'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < a.chunks.length; i++) {
      const ang = i / a.chunks.length * TAU, rr = a.r * a.chunks[i];
      const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(225,238,242,0.19)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-a.r * 0.55, -a.r * 0.18); ctx.lineTo(a.r * 0.28, a.r * 0.38); ctx.lineTo(a.r * 0.55, a.r * 0.12); ctx.stroke();
    ctx.restore();
  }

  function drawMine(m, time) {
    const pulse = 1 + Math.sin(m.phase) * 0.1;
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.phase * 0.22);
    ctx.strokeStyle = `rgba(255,118,103,${0.2 + (Math.sin(m.phase) + 1) * 0.1})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, m.r * 1.8 * pulse, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#a8454b'; ctx.strokeStyle = '#ff966b'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, m.r, 0, TAU); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); ctx.stroke(); }
    ctx.fillStyle = '#ffe1b2'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill(); ctx.restore();
  }

  function drawDrone(d) {
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(Math.atan2(d.vy, d.vx));
    ctx.fillStyle = d.hit > 0 ? '#f4e9ff' : '#573b76'; ctx.strokeStyle = '#d59bff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(-11, -12); ctx.lineTo(-7, 0); ctx.lineTo(-11, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff84bb'; ctx.beginPath(); ctx.arc(4, 0, 4 + Math.sin(d.phase) * 1.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(213,155,255,.45)'; ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(-16, -12); ctx.moveTo(-8, 7); ctx.lineTo(-16, 12); ctx.stroke(); ctx.restore();
  }

  function drawCrystal(c, time) {
    const pulse = 1 + Math.sin(time * 3 + c.phase) * 0.12;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.spin);
    ctx.shadowColor = '#70f6b4'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#56cf9e'; ctx.strokeStyle = '#b5ffe0'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -12 * pulse); ctx.lineTo(8 * pulse, 0); ctx.lineTo(0, 12 * pulse); ctx.lineTo(-8 * pulse, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(230,255,245,.65)'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(3, 0); ctx.lineTo(0, 5); ctx.lineTo(-2, 0); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function drawBullet(b) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx)); ctx.shadowColor = '#d9fbff'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#e8ffff'; ctx.fillRect(-7, -1.6, 14, 3.2); ctx.restore();
  }

  function drawShip(time) {
    if (ship.invuln > 0 && Math.floor(time * 18) % 2 === 0) return;
    ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle);
    if (ship.dash > 0 || Math.hypot(ship.vx, ship.vy) > 20) {
      const flame = 9 + Math.random() * 8 + (ship.dash > 0 ? 18 : 0);
      ctx.fillStyle = ship.dash > 0 ? '#ffcf66' : '#55e6ff'; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(-9, -5); ctx.lineTo(-9 - flame, 0); ctx.lineTo(-9, 5); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.shadowColor = '#55e6ff'; ctx.shadowBlur = 13; ctx.fillStyle = '#baf6ff'; ctx.strokeStyle = '#55e6ff'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(-10, -11); ctx.lineTo(-5, 0); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#1b4b61'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    const pad = 18;
    ctx.fillStyle = '#e7f6ff'; ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('HULLBREAKER', pad, 25);
    ctx.fillStyle = '#80a9b9'; ctx.font = '600 10px system-ui, sans-serif'; ctx.fillText('WAVE ' + wave + '  /  ' + WIN_WAVE, pad, 42);
    ctx.textAlign = 'right'; ctx.fillStyle = '#e7f6ff'; ctx.font = '700 15px system-ui, sans-serif'; ctx.fillText(String(score).padStart(5, '0'), W - pad, 25);
    ctx.fillStyle = '#80a9b9'; ctx.font = '600 10px system-ui, sans-serif'; ctx.fillText('BEST ' + String(best).padStart(5, '0'), W - pad, 42);
    ctx.textAlign = 'left'; ctx.fillStyle = '#70f6b4'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText('◆ ' + ore, pad, 62);
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = i < ship.shields ? '#55e6ff' : 'rgba(90,125,143,.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W - pad - 40 + i * 18, 60, 6, 0, TAU); ctx.stroke(); }
    if (state === 'play') {
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(185,227,239,.42)'; ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText('DRAG LEFT PAD  •  HOLD FIRE  •  DOUBLE-TAP DASH', W / 2, H - 18);
      drawControls();
    }
    if (messageTimer > 0 && state === 'play') { ctx.textAlign = 'center'; ctx.globalAlpha = clamp(messageTimer, 0, 1); ctx.fillStyle = '#baf6ff'; ctx.font = '800 22px system-ui, sans-serif'; ctx.fillText(message, W / 2, H * 0.24); ctx.globalAlpha = 1; }
    if (flash > 0) { ctx.fillStyle = `rgba(255,74,91,${flash * 0.12})`; ctx.fillRect(0, 0, W, H); }
  }

  function drawControls() {
    const cx = W * 0.19, cy = H - 112, r = 65;
    ctx.globalAlpha = 0.55; ctx.fillStyle = 'rgba(37,82,101,.52)'; ctx.strokeStyle = 'rgba(119,210,233,.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.8; ctx.fillStyle = 'rgba(98,196,219,.52)';
    ctx.beginPath(); ctx.arc(cx + stick.x * r * 0.65, cy + stick.y * r * 0.65, 26, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.8; ctx.fillStyle = 'rgba(118,194,215,.13)'; ctx.strokeStyle = 'rgba(118,194,215,.45)';
    ctx.beginPath(); ctx.arc(W - 60, H - 105, 56, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = firePointer !== -1 ? 1 : 0.78; ctx.fillStyle = firePointer !== -1 ? '#ff8b88' : '#ff6978'; ctx.strokeStyle = '#ffc0b5';
    ctx.beginPath(); ctx.arc(W - 60, H - 105, 40, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff7f5'; ctx.font = '800 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('FIRE', W - 60, H - 101);
    ctx.globalAlpha = 0.86; ctx.fillStyle = dashCooldown > 0 ? '#6b7880' : '#d19a47'; ctx.strokeStyle = '#ffdc8e';
    roundRect(W - 94, H - 252, 68, 34, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = dashCooldown > 0 ? '#bac3c7' : '#fff5cf'; ctx.font = '800 10px system-ui, sans-serif'; ctx.fillText(dashCooldown > 0 ? 'CHARGING' : 'DASH ×2', W - 60, H - 230);
    ctx.globalAlpha = 1;
  }

  function drawUpgrade() {
    ctx.fillStyle = 'rgba(2,10,17,.76)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e7f6ff'; ctx.font = '800 25px system-ui, sans-serif'; ctx.fillText('WAVE CLEARED', W / 2, H * 0.19);
    ctx.fillStyle = '#80a9b9'; ctx.font = '600 12px system-ui, sans-serif'; ctx.fillText('CHOOSE ONE UPGRADE  •  TAP A CARD', W / 2, H * 0.24);
    const cards = [{ x: W * 0.06, w: W * 0.41 }, { x: W * 0.53, w: W * 0.41 }];
    for (let i = 0; i < 2; i++) {
      const o = offers[i], c = cards[i], y = H * 0.34, h = H * 0.31;
      ctx.fillStyle = 'rgba(16,39,52,.96)'; ctx.strokeStyle = o.color; ctx.lineWidth = 2; roundRect(c.x, y, c.w, h, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = o.color; ctx.font = '900 13px system-ui, sans-serif'; ctx.fillText(String(i + 1), c.x + c.w / 2, y + 29);
      ctx.fillStyle = '#f2fbff'; ctx.font = '800 13px system-ui, sans-serif'; ctx.fillText(o.name, c.x + c.w / 2, y + h * 0.5);
      ctx.fillStyle = '#9bb8c2'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText(o.detail, c.x + c.w / 2, y + h * 0.68);
    }
    ctx.fillStyle = '#70f6b4'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText('ORE BANK  ◆ ' + ore, W / 2, H * 0.78);
    ctx.fillStyle = '#6d8d99'; ctx.font = '600 10px system-ui, sans-serif'; ctx.fillText('KEYBOARD: 1 / 2', W / 2, H * 0.82);
  }

  function drawEnd(win) {
    ctx.fillStyle = 'rgba(2,10,17,.82)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = win ? '#70f6b4' : '#ff8b88'; ctx.font = '900 29px system-ui, sans-serif'; ctx.fillText(win ? 'SECTOR CLEAR' : 'HULL BREACH', W / 2, H * 0.31);
    ctx.fillStyle = '#e7f6ff'; ctx.font = '800 18px system-ui, sans-serif'; ctx.fillText('SCORE  ' + String(score).padStart(5, '0'), W / 2, H * 0.42);
    ctx.fillStyle = '#8aa9b6'; ctx.font = '600 12px system-ui, sans-serif'; ctx.fillText('BEST  ' + String(best).padStart(5, '0') + '   •   WAVE ' + wave, W / 2, H * 0.48);
    ctx.fillStyle = win ? '#70f6b4' : '#ffcf66'; ctx.font = '800 13px system-ui, sans-serif'; ctx.fillText('TAP OR PRESS ENTER TO RESTART', W / 2, H * 0.62);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
})();
