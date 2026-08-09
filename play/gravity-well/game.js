(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const frame = document.getElementById('game-frame');
  const ctx = canvas.getContext('2d', { alpha: false });
  const W = 390;
  const H = 700;
  const TAU = Math.PI * 2;
  const GRAVITY = 24;
  const BEST_KEY = 'gravityWellBest';

  const hud = {
    stage: document.getElementById('stage-readout'),
    score: document.getElementById('score-readout'),
    depth: document.getElementById('depth-readout'),
    fuel: document.getElementById('fuel-fill'),
    hint: document.getElementById('hint'),
    screen: document.getElementById('state-screen'),
    kicker: document.getElementById('state-kicker'),
    title: document.getElementById('state-title'),
    copy: document.getElementById('state-copy')
  };

  const input = { left: false, right: false, main: false, up: false, down: false };
  const pointers = new Map();
  const keys = new Set();
  let cssWidth = W;
  let cssHeight = H;
  let stage;
  let player;
  let state = 'playing';
  let stageNumber = 0;
  let runScore = 0;
  let runPads = 0;
  let bestScore = readBest();
  let cameraY = 0;
  let clearClock = 0;
  let hintClock = 9;
  let messageClock = 0;
  let elapsed = 0;
  let lastTime = performance.now();
  let particles = [];
  let floaters = [];
  let shake = 0;

  function readBest() {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (_) { return 0; }
  }

  function saveBest(score) {
    if (score <= bestScore) return;
    bestScore = score;
    try { localStorage.setItem(BEST_KEY, String(bestScore)); } catch (_) {}
  }

  function rng(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedFor(index) {
    return (0x51A7E + Math.imul(index + 1, 0x9E3779B9)) >>> 0;
  }

  function seedLabel(seed) {
    return seed.toString(36).toUpperCase().slice(-4).padStart(4, '0');
  }

  function makeStage(index) {
    const random = rng(seedFor(index));
    const length = 1510 + Math.min(index, 5) * 45;
    const points = [];
    let center = W / 2;
    for (let y = 0; y <= length + 160; y += 80) {
      const wave = Math.sin(y * 0.009 + index * 1.8) * 17;
      center += (random() - 0.5) * 48 + wave * 0.08;
      center = Math.max(118, Math.min(W - 118, center));
      const narrowing = (y > length * 0.46 && y < length * 0.69) ? 35 : 0;
      const half = Math.max(72, 132 - random() * 21 - narrowing);
      points.push({ y, left: Math.max(14, center - half), right: Math.min(W - 14, center + half) });
    }

    const cavern = {
      seed: seedFor(index),
      label: seedLabel(seedFor(index)),
      length,
      floorY: length,
      points,
      crystals: [],
      vents: [],
      pads: [],
      door: null,
      stars: []
    };

    for (let i = 0; i < 34; i++) {
      cavern.stars.push({
        x: random() * W,
        y: random() * (length + 300),
        size: 0.5 + random() * 1.5,
        alpha: 0.18 + random() * 0.48
      });
    }

    for (let i = 0; i < 6; i++) {
      const y = 235 + i * 205 + random() * 70;
      const side = i % 2 === 0 ? 'left' : 'right';
      const size = 19 + random() * 18;
      const edge = corridorAtFrom(points, y, 'left') + size * 0.46;
      const rightEdge = corridorAtFrom(points, y, 'right') - size * 0.46;
      cavern.crystals.push({ y, side, size, x: side === 'left' ? edge : rightEdge, phase: random() * TAU });
    }

    for (let i = 0; i < 4; i++) {
      const y = 300 + i * 285 + random() * 90;
      const side = random() > 0.5 ? 'left' : 'right';
      cavern.vents.push({ y, side, strength: (side === 'left' ? 1 : -1) * (16 + random() * 15), phase: random() * TAU });
    }

    const padYs = [360, 780, 1130].map((value, i) => Math.min(length - 150, value + (random() - 0.5) * 80 - i * index * 2));
    padYs.forEach((y, i) => {
      const bounds = corridorAtFrom(points, y);
      const centerX = (bounds.left + bounds.right) / 2 + (random() - 0.5) * Math.min(55, bounds.right - bounds.left - 100);
      cavern.pads.push({ x: centerX, y, width: 76, landed: false, tone: i % 2 });
    });

    cavern.door = { y: 935 + (random() - 0.5) * 80, gap: 104, phase: random() * TAU, speed: 0.7 + random() * 0.25 };
    return cavern;
  }

  function corridorAtFrom(points, y, side) {
    if (y <= points[0].y) return side === 'left' ? points[0].left : side === 'right' ? points[0].right : points[0];
    for (let i = 1; i < points.length; i++) {
      if (y <= points[i].y) {
        const a = points[i - 1];
        const b = points[i];
        const t = (y - a.y) / (b.y - a.y);
        if (side === 'left') return a.left + (b.left - a.left) * t;
        if (side === 'right') return a.right + (b.right - a.right) * t;
        return {
          left: a.left + (b.left - a.left) * t,
          right: a.right + (b.right - a.right) * t
        };
      }
    }
    const last = points[points.length - 1];
    return side === 'left' ? last.left : side === 'right' ? last.right : { left: last.left, right: last.right };
  }

  function corridorAt(y) { return corridorAtFrom(stage.points, y); }

  function resetRun() {
    stageNumber = 0;
    runScore = 0;
    runPads = 0;
    state = 'playing';
    clearClock = 0;
    messageClock = 0;
    hintClock = 9;
    pointers.clear();
    keys.clear();
    input.left = false; input.right = false; input.main = false; input.up = false; input.down = false;
    particles = [];
    floaters = [];
    loadStage(0);
    hud.screen.classList.remove('visible');
  }

  function loadStage(index) {
    stageNumber = index;
    stage = makeStage(index);
    const bounds = corridorAt(90);
    player = {
      x: (bounds.left + bounds.right) / 2,
      y: 90,
      vx: 0,
      vy: 8,
      angle: 0,
      fuel: 100,
      maxFuel: 100,
      thrusting: false,
      flash: 0
    };
    cameraY = 0;
    state = 'playing';
    hintClock = 9;
    hud.screen.classList.remove('visible');
  }

  function getScore() {
    const depth = Math.floor((stageNumber * stage.length + player.y) / 3);
    return Math.max(0, runScore + depth);
  }

  function setStateOverlay(kicker, title, copy, buttonText) {
    hud.kicker.textContent = kicker;
    hud.title.textContent = title;
    hud.copy.innerHTML = copy;
    document.getElementById('restart').textContent = buttonText;
    hud.screen.classList.add('visible');
  }

  function crash(reason) {
    if (state !== 'playing') return;
    state = 'crashed';
    shake = 11;
    player.flash = 1;
    burst(player.x, player.y, '#ff6d68', 30, 1.8);
    const finalScore = getScore();
    saveBest(finalScore);
    setStateOverlay('RUN OVER', 'CRASHED', `${reason}<br><br>SCORE <b>${pad(finalScore, 5)}</b> · BEST <b>${pad(bestScore, 5)}</b>`, 'RESTART RUN');
  }

  function clearStage() {
    if (state !== 'playing') return;
    state = 'cleared';
    const used = player.maxFuel - player.fuel;
    const par = 70;
    const fuelBonus = Math.max(0, Math.floor((par - used) * 3));
    const clearBonus = 250 + fuelBonus;
    runScore += clearBonus;
    burst(player.x, player.y, '#7fffc1', 36, 1.4);
    floaters.push({ x: player.x, y: player.y - 26, text: `CAVERN CLEAR  +${clearBonus}`, life: 2.3, max: 2.3, color: '#86f9c2' });
    saveBest(getScore());
    setStateOverlay('DEPTH REACHED', 'CAVERN CLEAR', `SEED ${stage.label} · FUEL BONUS +${fuelBonus}<br><br>SCORE <b>${pad(getScore(), 5)}</b>`, 'NEXT CAVERN');
    clearClock = 1.45;
  }

  function pad(value, count) { return String(Math.max(0, Math.floor(value))).padStart(count, '0'); }

  function update(dt) {
    elapsed += dt;
    shake = Math.max(0, shake - dt * 21);
    if (hintClock > 0) hintClock -= dt;
    hud.hint.classList.toggle('visible', hintClock > 0 && state === 'playing');

    if (state === 'cleared') {
      clearClock -= dt;
      if (clearClock <= 0) loadStage(stageNumber + 1);
      updateParticles(dt);
      updateFloaters(dt);
      updateHud();
      return;
    }
    if (state !== 'playing') {
      updateParticles(dt);
      updateFloaters(dt);
      updateHud();
      return;
    }

    const left = input.left;
    const right = input.right;
    const both = left && right;
    const straight = input.main || input.up || both;
    const side = left === right ? 0 : left ? -1 : 1;
    const wasThrusting = player.thrusting;
    player.thrusting = player.fuel > 0 && (straight || side !== 0);

    if (side !== 0) player.angle += side * 2.45 * dt;
    player.angle *= Math.pow(0.82, dt);
    player.angle = Math.max(-0.82, Math.min(0.82, player.angle));

    if (player.thrusting) {
      const power = straight ? 75 : 52;
      player.vx += Math.sin(player.angle) * power * dt;
      player.vy -= Math.cos(player.angle) * power * dt;
      player.fuel = Math.max(0, player.fuel - dt * (straight ? 9.5 : 6.5));
      if (!wasThrusting || Math.random() < dt * 13) {
        const flame = straight ? 1.15 : 0.9;
        burst(player.x - Math.sin(player.angle) * 12, player.y + Math.cos(player.angle) * 12, '#ffcf6e', 1, flame, true);
      }
    }
    if (input.down) player.vy += 18 * dt;

    for (const vent of stage.vents) {
      const distance = Math.abs(player.y - vent.y);
      if (distance < 105) {
        const falloff = 1 - distance / 105;
        player.vx += vent.strength * falloff * dt;
        if (Math.random() < dt * 10 * falloff) {
          const bounds = corridorAt(vent.y);
          const x = vent.side === 'left' ? bounds.left + 8 : bounds.right - 8;
          burst(x, vent.y + (Math.random() - 0.5) * 25, '#7cdbff', 1, 0.5, true);
        }
      }
    }

    player.vy += GRAVITY * dt;
    player.vx *= Math.pow(0.988, dt * 60);
    player.vy *= Math.pow(0.998, dt * 60);
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    const bounds = corridorAt(player.y);
    if (player.x < bounds.left + 11 || player.x > bounds.right - 11) {
      crash('WALL CONTACT');
      return;
    }

    for (const crystal of stage.crystals) {
      if (Math.abs(player.y - crystal.y) < crystal.size * 1.12 && Math.abs(player.x - crystal.x) < crystal.size * 0.95) {
        crash('CRYSTAL IMPACT');
        return;
      }
    }

    const door = stage.door;
    const doorCenter = (corridorAt(door.y).left + corridorAt(door.y).right) / 2 + Math.sin(elapsed * door.speed + door.phase) * 38;
    if (Math.abs(player.y - door.y) < 12 && (player.x < doorCenter - door.gap / 2 + 10 || player.x > doorCenter + door.gap / 2 - 10)) {
      crash('DOOR CONTACT');
      return;
    }

    for (const padItem of stage.pads) {
      if (!padItem.landed && player.vy > 0 && player.y >= padItem.y - 17 && player.y <= padItem.y + 14 && Math.abs(player.x - padItem.x) < padItem.width / 2 + 11) {
        const gentle = player.vy < 115 && Math.abs(player.vx) < 72 && Math.abs(player.angle) < 0.45;
        if (!gentle) {
          crash('PAD HIT TOO FAST');
          return;
        }
        padItem.landed = true;
        player.y = padItem.y - 17;
        player.vy = -24;
        player.vx *= 0.25;
        player.angle *= 0.25;
        player.fuel = player.maxFuel;
        runPads += 1;
        runScore += 100;
        burst(padItem.x, padItem.y, '#7fffc1', 18, 1.0);
        floaters.push({ x: padItem.x, y: padItem.y - 20, text: 'PAD +100 · FUEL TOPPED', life: 1.7, max: 1.7, color: '#82ffc6' });
      }
    }

    if (player.y > stage.floorY - 67) {
      const floorBounds = corridorAt(stage.floorY - 40);
      const beaconX = (floorBounds.left + floorBounds.right) / 2;
      if (Math.abs(player.x - beaconX) < 108 && Math.hypot(player.vx, player.vy) < 160) clearStage();
      else if (Math.hypot(player.vx, player.vy) >= 160 || player.y > stage.floorY + 6) crash('BEACON IMPACT');
    }

    cameraY += ((Math.max(0, Math.min(stage.floorY - H + 130, player.y - 250))) - cameraY) * Math.min(1, dt * 5);
    updateParticles(dt);
    updateFloaters(dt);
    updateHud();
  }

  function updateHud() {
    if (!player) return;
    hud.stage.textContent = `CAVERN ${pad(stageNumber + 1, 2)} · ${stage.label}`;
    hud.score.textContent = `SCORE ${pad(getScore(), 5)}`;
    hud.depth.textContent = `DEPTH ${pad((stageNumber * stage.length + player.y) / 10, 3)}`;
    hud.fuel.style.transform = `scaleX(${Math.max(0, player.fuel / player.maxFuel)})`;
    hud.fuel.style.background = player.fuel < 25 ? '#ff7970' : player.fuel < 50 ? '#ffd16e' : '#70f4b0';
  }

  function burst(x, y, color, amount, force, engine = false) {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * TAU;
      const speed = (0.3 + Math.random() * 0.7) * force * (engine ? 24 : 48);
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: engine ? 0.35 : 0.75 + Math.random() * 0.6, max: engine ? 0.35 : 1.35, size: engine ? 2 + Math.random() * 2 : 2 + Math.random() * 4, color });
    }
    if (particles.length > 320) particles.splice(0, particles.length - 320);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const item = particles[i];
      item.life -= dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.vy += 17 * dt;
      if (item.life <= 0) particles.splice(i, 1);
    }
  }

  function updateFloaters(dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      floaters[i].life -= dt;
      floaters[i].y -= dt * 19;
      if (floaters[i].life <= 0) floaters.splice(i, 1);
    }
  }

  function resize() {
    const rect = frame.getBoundingClientRect();
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.min(960, Math.max(1, Math.floor(cssWidth * dpr)));
    canvas.height = Math.min(960, Math.max(1, Math.floor(cssHeight * dpr)));
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }

  function draw() {
    ctx.save();
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.fillStyle = '#07111e';
    ctx.fillRect(0, 0, W, H);
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    ctx.translate(sx, sy);
    drawCavern();
    drawParticles();
    if (player) drawShip();
    drawFloaters();
    ctx.restore();
  }

  function drawCavern() {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#091a2a');
    bg.addColorStop(0.5, '#07121e');
    bg.addColorStop(1, '#101b26');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    for (const star of stage.stars) {
      const y = star.y - cameraY;
      if (y < -4 || y > H + 4) continue;
      ctx.globalAlpha = star.alpha;
      ctx.fillStyle = '#c7efff';
      ctx.fillRect(star.x, y, star.size, star.size);
    }
    ctx.globalAlpha = 1;

    const visible = stage.points.filter((point) => point.y >= cameraY - 100 && point.y <= cameraY + H + 100);
    ctx.fillStyle = '#0b1622';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    visible.forEach((point) => ctx.lineTo(point.left, point.y - cameraY));
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, 0);
    visible.forEach((point) => ctx.lineTo(point.right, point.y - cameraY));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    drawWall(visible, 'left');
    drawWall(visible, 'right');
    drawPads();
    drawCrystals();
    drawVents();
    drawDoor();
    drawBeacon();
  }

  function drawWall(points, side) {
    ctx.save();
    ctx.strokeStyle = '#294454';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = side === 'left' ? point.left : point.right;
      if (index === 0) ctx.moveTo(x, point.y - cameraY);
      else ctx.lineTo(x, point.y - cameraY);
    });
    ctx.stroke();
    ctx.strokeStyle = '#76bfbd';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = .8;
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const x1 = side === 'left' ? a.left : a.right;
      const x2 = side === 'left' ? b.left : b.right;
      ctx.strokeStyle = i % 2 ? '#152d3b' : '#1c3945';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, a.y - cameraY);
      ctx.lineTo(x2, b.y - cameraY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPads() {
    for (const padItem of stage.pads) {
      const y = padItem.y - cameraY;
      if (y < -30 || y > H + 30) continue;
      const glow = ctx.createLinearGradient(0, y - 14, 0, y + 8);
      glow.addColorStop(0, '#8cffe044');
      glow.addColorStop(1, '#8cffe400');
      ctx.fillStyle = glow;
      ctx.fillRect(padItem.x - 55, y - 15, 110, 30);
      ctx.fillStyle = padItem.landed ? '#56d696' : '#98eee1';
      ctx.fillRect(padItem.x - padItem.width / 2, y - 4, padItem.width, 8);
      ctx.fillStyle = '#102831';
      ctx.fillRect(padItem.x - padItem.width / 2 + 7, y - 1, padItem.width - 14, 2);
      ctx.fillStyle = '#b5fff1';
      for (let i = -2; i <= 2; i++) ctx.fillRect(padItem.x + i * 13 - 2, y - 9, 4, 2);
      ctx.fillStyle = '#8cfbdd';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(padItem.landed ? 'TOPPED' : 'REFUEL', padItem.x, y + 17);
    }
  }

  function drawCrystals() {
    for (const crystal of stage.crystals) {
      const y = crystal.y - cameraY;
      if (y < -55 || y > H + 55) continue;
      const size = crystal.size;
      const direction = crystal.side === 'left' ? 1 : -1;
      ctx.save();
      ctx.translate(crystal.x, y);
      ctx.rotate(Math.sin(elapsed * 0.7 + crystal.phase) * 0.04);
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ff6688aa';
      ctx.fillStyle = '#be5a82';
      ctx.beginPath();
      ctx.moveTo(-direction * size * .62, size * .7);
      ctx.lineTo(direction * size * .95, 0);
      ctx.lineTo(-direction * size * .25, -size * .9);
      ctx.lineTo(-direction * size * .9, -size * .2);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ff9aaf';
      ctx.globalAlpha = .8;
      ctx.beginPath();
      ctx.moveTo(-direction * size * .2, size * .44);
      ctx.lineTo(direction * size * .63, 0);
      ctx.lineTo(-direction * size * .22, -size * .63);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawVents() {
    for (const vent of stage.vents) {
      const y = vent.y - cameraY;
      if (y < -40 || y > H + 40) continue;
      const bounds = corridorAt(vent.y);
      const x = vent.side === 'left' ? bounds.left : bounds.right;
      const direction = vent.side === 'left' ? 1 : -1;
      ctx.strokeStyle = '#70dfff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 14);
      ctx.lineTo(x + direction * 13, y);
      ctx.lineTo(x, y + 14);
      ctx.stroke();
      ctx.strokeStyle = '#70dfff66';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const offset = (i - 1) * 11;
        ctx.beginPath();
        ctx.moveTo(x + direction * 7, y + offset);
        ctx.lineTo(x + direction * 25, y + offset - direction * 5);
        ctx.stroke();
      }
      ctx.fillStyle = '#8ceaff';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textAlign = vent.side === 'left' ? 'left' : 'right';
      ctx.fillText('WIND', x + direction * 10, y - 19);
    }
  }

  function drawDoor() {
    const door = stage.door;
    const y = door.y - cameraY;
    if (y < -30 || y > H + 30) return;
    const bounds = corridorAt(door.y);
    const center = (bounds.left + bounds.right) / 2 + Math.sin(elapsed * door.speed + door.phase) * 38;
    ctx.strokeStyle = '#e2b66b';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(bounds.left + 3, y);
    ctx.lineTo(center - door.gap / 2, y);
    ctx.moveTo(center + door.gap / 2, y);
    ctx.lineTo(bounds.right - 3, y);
    ctx.stroke();
    ctx.strokeStyle = '#fff0ad';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bounds.left, y - 7);
    ctx.lineTo(center - door.gap / 2, y - 7);
    ctx.moveTo(center + door.gap / 2, y - 7);
    ctx.lineTo(bounds.right, y - 7);
    ctx.stroke();
    ctx.fillStyle = '#ffd988';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MOVING DOOR', center, y - 15);
  }

  function drawBeacon() {
    const y = stage.floorY - cameraY - 40;
    if (y < -80 || y > H + 80) return;
    const bounds = corridorAt(stage.floorY - 40);
    const x = (bounds.left + bounds.right) / 2;
    const pulse = 1 + Math.sin(elapsed * 4) * .08;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = '#72f4bd55';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 31, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#a7ffe0';
    ctx.beginPath();
    ctx.moveTo(-21, 0); ctx.lineTo(21, 0);
    ctx.moveTo(0, -21); ctx.lineTo(0, 21);
    ctx.stroke();
    ctx.fillStyle = '#8fffc9';
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#7cffc1';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#aaffdc';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BEACON', 0, 45);
    ctx.restore();
  }

  function drawParticles() {
    for (const item of particles) {
      const y = item.y - cameraY;
      if (y < -10 || y > H + 10) continue;
      ctx.globalAlpha = Math.max(0, item.life / item.max);
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(item.x, y, item.size * (0.5 + item.life / item.max), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawShip() {
    const y = player.y - cameraY;
    ctx.save();
    ctx.translate(player.x, y);
    ctx.rotate(player.angle);
    if (player.thrusting && player.fuel > 0 && state === 'playing') {
      const flame = 12 + Math.sin(elapsed * 40) * 4;
      ctx.fillStyle = '#ffb65e';
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#ffad55';
      ctx.beginPath();
      ctx.moveTo(-5, 12);
      ctx.lineTo(0, 12 + flame);
      ctx.lineTo(5, 12);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.shadowBlur = 13;
    ctx.shadowColor = player.flash > 0 ? '#ff6868' : '#7fe9ff';
    ctx.fillStyle = player.flash > 0 ? '#ff7f7f' : '#c7f7ff';
    ctx.beginPath();
    ctx.moveTo(0, -19);
    ctx.lineTo(10, 10);
    ctx.lineTo(0, 15);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#246a82';
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(5, 1);
    ctx.lineTo(-5, 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#eaffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-12, 8); ctx.lineTo(-6, 6);
    ctx.moveTo(12, 8); ctx.lineTo(6, 6);
    ctx.stroke();
    ctx.restore();
    player.flash = Math.max(0, player.flash - 0.05);
  }

  function drawFloaters() {
    ctx.textAlign = 'center';
    ctx.font = '800 10px ui-monospace, monospace';
    for (const item of floaters) {
      const y = item.y - cameraY;
      ctx.globalAlpha = Math.min(1, item.life / (item.max * .35));
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, item.x, y);
    }
    ctx.globalAlpha = 1;
  }

  function setAction(action, active) {
    input[action] = active;
    const element = document.getElementById(`${action}-control`);
    if (element) element.classList.toggle('active', active);
  }

  function syncPointerActions() {
    const active = new Set(pointers.values());
    setAction('left', active.has('left'));
    setAction('main', active.has('main'));
    setAction('right', active.has('right'));
  }

  function controlAction(event) {
    const button = event.currentTarget;
    const action = button.id.replace('-control', '');
    event.preventDefault();
    if (state !== 'playing') {
      resetRun();
      return;
    }
    if (event.type === 'pointerdown') {
      pointers.set(event.pointerId, action);
      try { button.setPointerCapture(event.pointerId); } catch (_) {}
      syncPointerActions();
    } else if (event.type === 'pointerup' || event.type === 'pointercancel' || event.type === 'lostpointercapture') {
      pointers.delete(event.pointerId);
      syncPointerActions();
    }
  }

  for (const button of document.querySelectorAll('.control')) {
    button.addEventListener('pointerdown', controlAction, { passive: false });
    button.addEventListener('pointerup', controlAction, { passive: false });
    button.addEventListener('pointercancel', controlAction, { passive: false });
    button.addEventListener('lostpointercapture', controlAction, { passive: false });
  }

  document.getElementById('restart').addEventListener('click', (event) => {
    event.preventDefault();
    if (state === 'cleared') loadStage(stageNumber + 1);
    else resetRun();
  });

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'enter', 'a', 'd', 'w', 's'].includes(key)) event.preventDefault();
    if (state !== 'playing' && [' ', 'enter', 'r'].includes(key)) {
      if (state === 'cleared') loadStage(stageNumber + 1);
      else resetRun();
      return;
    }
    keys.add(key);
    setAction('left', keys.has('arrowleft') || keys.has('a'));
    setAction('right', keys.has('arrowright') || keys.has('d'));
    input.main = keys.has(' ') || keys.has('enter');
    input.up = keys.has('arrowup') || keys.has('w');
    input.down = keys.has('arrowdown') || keys.has('s');
    document.getElementById('main-control').classList.toggle('active', input.main || input.up);
  }, { passive: false });

  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    keys.delete(key);
    setAction('left', keys.has('arrowleft') || keys.has('a'));
    setAction('right', keys.has('arrowright') || keys.has('d'));
    input.main = keys.has(' ') || keys.has('enter');
    input.up = keys.has('arrowup') || keys.has('w');
    input.down = keys.has('arrowdown') || keys.has('s');
    document.getElementById('main-control').classList.toggle('active', input.main || input.up);
  }, { passive: false });

  window.addEventListener('blur', () => { pointers.clear(); keys.clear(); input.left = false; input.right = false; input.main = false; input.up = false; input.down = false; document.querySelectorAll('.control').forEach(button => button.classList.remove('active')); });

  frame.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  frame.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
  window.addEventListener('resize', resize, { passive: true });

  function tick(now) {
    const dt = Math.min(0.035, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(tick);
  }

  resize();
  resetRun();
  requestAnimationFrame(tick);
})();
