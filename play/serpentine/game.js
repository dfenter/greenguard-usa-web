(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const scoreEl = document.getElementById('score');
  const roundEl = document.getElementById('round');
  const bestEl = document.getElementById('best');
  const message = document.getElementById('round-message');
  const messageTitle = document.getElementById('message-title');
  const messageCopy = document.getElementById('message-copy');

  const W = 26;
  const H = 42;
  const BASE_BOUNDS = { left: 1.15, right: 24.85, top: 2.65, bottom: 39.35 };
  const WALL_TTL = 10.5;
  const SAMPLE_DISTANCE = .16;
  const TAU = Math.PI * 2;
  const DIRS = { right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, up: { x: 0, y: -1 } };
  const COLORS = [
    { main: '#55e7ff', soft: '#55e7ff', rgb: '85,231,255' },
    { main: '#ff668e', soft: '#ff9baf', rgb: '255,102,142' },
    { main: '#c789ff', soft: '#d7b0ff', rgb: '199,137,255' },
    { main: '#ffc85c', soft: '#ffe1a0', rgb: '255,200,92' }
  ];
  const SPEED_PADS = [
    { x: 7.0, y: 9.0, phase: .2 },
    { x: 18.6, y: 20.2, phase: 1.8 },
    { x: 7.2, y: 30.0, phase: 3.1 },
    { x: 19.0, y: 33.4, phase: 4.5 }
  ];

  let viewW = 1;
  let viewH = 1;
  let dpr = 1;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let lastFrame = performance.now();
  let elapsed = 0;
  let roundTime = 0;
  let round = 1;
  let roundState = 'play';
  let roundClearTimer = 0;
  let pipsCollected = 0;
  let rivalKills = 0;
  let best = readBest();
  let rng = mulberry32(0x5e2f1d);
  let player;
  let rivals = [];
  let pips = [];
  let particles = [];
  let shake = 0;
  let pointerStart = null;
  let audioContext = null;
  const MAX_TRAIL_POINTS = 240;

  function readBest() {
    try { const value = Number(localStorage.getItem('serpentine-best') || 0); return Number.isFinite(value) && value >= 0 ? value : 0; } catch (_) { return 0; }
  }

  function saveBest() {
    try { localStorage.setItem('serpentine-best', String(best)); } catch (_) { /* storage is optional */ }
  }

  function mulberry32(seed) {
    return function random() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function rand(min, max) { return min + (max - min) * rng(); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function distSq(a, b) { const x = a.x - b.x; const y = a.y - b.y; return x * x + y * y; }
  function dist(a, b) { return Math.sqrt(distSq(a, b)); }
  function dirName(v) {
    if (v.x > 0) return 'right';
    if (v.x < 0) return 'left';
    if (v.y > 0) return 'down';
    return 'up';
  }
  function copyDir(v) { return { x: v.x, y: v.y }; }
  function leftOf(v) { return { x: v.y, y: -v.x }; }
  function rightOf(v) { return { x: -v.y, y: v.x }; }
  function rgba(rgb, alpha) { return `rgba(${rgb},${clamp(alpha, 0, 1)})`; }

  function resize() {
    viewW = Math.max(1, window.innerWidth);
    viewH = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const longAxis = Math.max(viewW, viewH);
    if (longAxis * dpr > 960) dpr = 960 / longAxis;
    canvas.width = Math.max(1, Math.round(viewW * dpr));
    canvas.height = Math.max(1, Math.round(viewH * dpr));
    scale = Math.min((viewW - 16) / W, (viewH - 16) / H);
    scale = Math.max(.1, scale);
    ox = (viewW - W * scale) * .5;
    oy = (viewH - H * scale) * .5;
  }

  function currentBounds() {
    const phase = clamp((roundTime - 26) / 20, 0, 1);
    const inset = phase * 2.05;
    return {
      left: BASE_BOUNDS.left + inset,
      right: BASE_BOUNDS.right - inset,
      top: BASE_BOUNDS.top + inset * .72,
      bottom: BASE_BOUNDS.bottom - inset
    };
  }

  function gates() {
    return [
      { axis: 'h', pos: 17.1, start: 4.3, end: 21.7, offset: 0 },
      { axis: 'v', pos: 13, start: 24.0, end: 37.0, offset: 3.9 }
    ];
  }

  function gateOpen(g) {
    const phase = (roundTime + g.offset) % 8;
    return phase > 4.6;
  }

  function makeSnake(x, y, direction, color, ai) {
    return {
      x, y, dir: copyDir(direction), nextDir: copyDir(direction), color, ai,
      alive: true, trail: [{ x, y, t: elapsed }], lastSample: { x, y },
      think: rand(.1, .48), boost: 0, padCooldown: 0, lengthBonus: ai ? 0 : 0, deathFlash: 0
    };
  }

  function startGame() {
    round = 1;
    pipsCollected = 0;
    rivalKills = 0;
    roundState = 'play';
    roundTime = 0;
    elapsed = 0;
    rng = mulberry32(0x5e2f1d);
    particles = [];
    shake = 0;
    pointerStart = null;
    player = makeSnake(5.1, 21.3, DIRS.right, COLORS[0], false);
    rivals = [];
    spawnRivals();
    spawnPips();
    message.className = '';
    updateHud();
  }

  function beginRound() {
    roundState = 'play';
    roundTime = 0;
    rng = mulberry32((0x5e2f1d + round * 7919) >>> 0);
    const keepGrowth = player ? player.lengthBonus : 0;
    player = makeSnake(5.1, 21.3, DIRS.right, COLORS[0], false);
    player.lengthBonus = keepGrowth;
    rivals = [];
    particles = [];
    pointerStart = null;
    spawnRivals();
    spawnPips();
    message.className = '';
    updateHud();
  }

  function spawnRivals() {
    const count = Math.min(3, round);
    const spots = [
      { x: 21, y: 8.6, d: DIRS.down },
      { x: 5.2, y: 33.2, d: DIRS.up },
      { x: 20.7, y: 34.8, d: DIRS.left }
    ];
    for (let i = 0; i < count; i++) {
      const spot = spots[i];
      const rival = makeSnake(spot.x, spot.y, spot.d, COLORS[i + 1], true);
      rival.lengthBonus = Math.min(1.8, round * .18);
      rival.think = .35 + i * .18;
      rivals.push(rival);
    }
  }

  function spawnPips() {
    pips = [];
    const candidates = [
      [3.3, 7.2], [8.1, 5.1], [15.4, 6.1], [22.2, 5.6],
      [3.7, 14.0], [10.1, 12.3], [18.7, 13.5], [22.2, 21.2],
      [4.2, 25.2], [9.0, 22.6], [17.3, 24.2], [22.5, 29.0],
      [3.7, 36.1], [9.0, 34.4], [15.8, 37.0], [21.9, 36.0]
    ];
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      pips.push({ x: c[0], y: c[1], pulse: rand(0, TAU), value: 1 });
    }
  }

  function score() { return pipsCollected + round + rivalKills; }

  function updateHud() {
    const current = score();
    if (current > best) { best = current; saveBest(); }
    scoreEl.textContent = String(current);
    roundEl.textContent = String(round);
    bestEl.textContent = String(best);
  }

  function requestTurn(snake, next) {
    if (!next || (!next.x && !next.y)) return;
    if (next.x === -snake.dir.x && next.y === -snake.dir.y) return;
    snake.nextDir = copyDir(next);
  }

  function turnFromName(name) { return DIRS[name] ? copyDir(DIRS[name]) : null; }

  function handleTurn(name) {
    const next = turnFromName(name);
    if (roundState === 'play' && player && player.alive) requestTurn(player, next);
    else if (roundState === 'dead') startGame();
  }

  function pointToSegmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
    t = clamp(t, 0, 1);
    const x = ax + t * dx;
    const y = ay + t * dy;
    const xx = px - x;
    const yy = py - y;
    return Math.sqrt(xx * xx + yy * yy);
  }

  function segmentHitsGate(ax, ay, bx, by, g) {
    if (g.axis === 'h') {
      if (Math.max(ax, bx) < g.start || Math.min(ax, bx) > g.end) return false;
      return pointToSegmentDistance(g.start, g.pos, ax, ay, bx, by) < .48 ||
        pointToSegmentDistance(g.end, g.pos, ax, ay, bx, by) < .48 ||
        ((ay - g.pos) * (by - g.pos) <= 0 && Math.min(ax, bx) <= g.end && Math.max(ax, bx) >= g.start);
    }
    if (Math.max(ay, by) < g.start || Math.min(ay, by) > g.end) return false;
    return pointToSegmentDistance(g.pos, g.start, ax, ay, bx, by) < .48 ||
      pointToSegmentDistance(g.pos, g.end, ax, ay, bx, by) < .48 ||
      ((ax - g.pos) * (bx - g.pos) <= 0 && Math.min(ay, by) <= g.end && Math.max(ay, by) >= g.start);
  }

  function hitsArena(ax, ay, bx, by) {
    const b = currentBounds();
    return bx < b.left + .08 || bx > b.right - .08 || by < b.top + .08 || by > b.bottom - .08;
  }

  function hitsGate(ax, ay, bx, by) {
    for (const g of gates()) if (!gateOpen(g) && segmentHitsGate(ax, ay, bx, by, g)) return true;
    return false;
  }

  function hitsTrails(snake, ax, ay, bx, by, forPlanning) {
    const now = elapsed;
    const check = (other) => {
      if (!other.trail.length) return false;
      for (let i = 0; i < other.trail.length; i++) {
        const point = other.trail[i];
        const age = now - point.t;
        if (age > WALL_TTL || (other === snake && age < (forPlanning ? .55 : .28))) continue;
        if (pointToSegmentDistance(point.x, point.y, ax, ay, bx, by) < .49) return true;
      }
      return false;
    };
    if (check(snake)) return true;
    if (check(player) && snake !== player) return true;
    for (const rival of rivals) if (rival !== snake && check(rival)) return true;
    return false;
  }

  function blockedFor(snake, ax, ay, bx, by, planning) {
    return hitsArena(ax, ay, bx, by) || hitsGate(ax, ay, bx, by) || hitsTrails(snake, ax, ay, bx, by, planning);
  }

  function trimTrail(snake) {
    const cutoff = elapsed - WALL_TTL;
    while (snake.trail.length > 1 && snake.trail[0].t < cutoff) snake.trail.shift();
    if (snake.trail.length > MAX_TRAIL_POINTS) snake.trail.splice(0, snake.trail.length - MAX_TRAIL_POINTS);
  }

  function bodyWindow(snake) { return 2.7 + snake.lengthBonus * .34; }

  function sampleTrail(snake) {
    if (dist(snake, snake.lastSample) >= SAMPLE_DISTANCE) {
      snake.trail.push({ x: snake.x, y: snake.y, t: elapsed });
      snake.lastSample = { x: snake.x, y: snake.y };
    }
  }

  function moveSnake(snake, dt) {
    if (!snake.alive) { trimTrail(snake); return; }
    if (snake.nextDir.x !== -snake.dir.x || snake.nextDir.y !== -snake.dir.y) snake.dir = copyDir(snake.nextDir);
    snake.boost = Math.max(0, snake.boost - dt);
    snake.padCooldown = Math.max(0, snake.padCooldown - dt);
    const speed = (snake.ai ? 5.0 : 5.55) * (snake.boost > 0 ? 1.36 : 1);
    const nx = snake.x + snake.dir.x * speed * dt;
    const ny = snake.y + snake.dir.y * speed * dt;
    if (blockedFor(snake, snake.x, snake.y, nx, ny, false)) {
      destroySnake(snake);
      return;
    }
    snake.x = nx;
    snake.y = ny;
    sampleTrail(snake);
    trimTrail(snake);
  }

  function applySpeedPad(snake) {
    if (!snake.alive) return;
    for (const pad of SPEED_PADS) {
      if (Math.hypot(snake.x - pad.x, snake.y - pad.y) < .8) {
        snake.boost = Math.max(snake.boost, 1.25);
        if (snake.padCooldown <= 0) {
          snake.padCooldown = .45;
          burst(pad.x, pad.y, snake.color, snake.ai ? 3 : 7, .65);
          shake = Math.max(shake, .045);
        }
        break;
      }
    }
  }

  function chooseAiTurn(snake) {
    if (!player || !player.alive) return;
    const choices = [leftOf(snake.dir), copyDir(snake.dir), rightOf(snake.dir)];
    const lead = 2.1 + clamp(player.lengthBonus, 0, 3) * .22;
    const target = {
      x: player.x + player.dir.x * lead,
      y: player.y + player.dir.y * lead
    };
    let bestChoice = snake.dir;
    let bestValue = Infinity;
    for (let i = 0; i < choices.length; i++) {
      const d = choices[i];
      const far = 1.15 + rng() * .45;
      const tx = snake.x + d.x * far;
      const ty = snake.y + d.y * far;
      if (blockedFor(snake, snake.x, snake.y, tx, ty, true)) continue;
      const value = Math.hypot(tx - target.x, ty - target.y) + (i === 1 ? 0 : .08) + rng() * .4;
      if (value < bestValue) { bestValue = value; bestChoice = d; }
    }
    requestTurn(snake, bestChoice);
  }

  function collectPips(snake) {
    for (let i = pips.length - 1; i >= 0; i--) {
      if (dist(snake, pips[i]) < .77) {
        const pip = pips[i];
        pips.splice(i, 1);
        snake.lengthBonus += snake.ai ? .28 : .38;
        if (!snake.ai) { pipsCollected += pip.value; burst(pip.x, pip.y, snake.color, 9, 1.3); shake = Math.max(shake, .08); }
        else burst(pip.x, pip.y, snake.color, 4, .7);
      }
    }
  }

  function destroySnake(snake) {
    if (!snake.alive) return;
    snake.alive = false;
    snake.deathFlash = .8;
    burst(snake.x, snake.y, snake.color, snake.ai ? 17 : 28, snake.ai ? 1.7 : 2.1);
    shake = Math.max(shake, snake.ai ? .13 : .32);
    if (snake.ai) rivalKills++;
    else endGame();
  }

  function endGame() {
    if (roundState === 'dead') return;
    roundState = 'dead';
    updateHud();
    messageTitle.textContent = 'LINE LOST';
    messageCopy.textContent = `Score ${score()}  •  best ${best}`;
    message.querySelector('.restart').textContent = 'TAP OR PRESS SPACE TO RETRY';
    message.className = 'show dead';
  }

  function clearRound() {
    if (roundState !== 'play') return;
    roundState = 'clear';
    roundClearTimer = 1.25;
    round++;
    updateHud();
    messageTitle.textContent = 'ROUND CLEAR';
    messageCopy.textContent = `The arena grows a new edge.  ${Math.min(3, round)} hunters next.`;
    message.querySelector('.restart').textContent = 'NEXT RUN IN A MOMENT';
    message.className = 'show';
    burst(player.x, player.y, player.color, 20, 1.8);
  }

  function update(dt) {
    elapsed += dt;
    for (const particle of particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(.04, dt);
      particle.vy *= Math.pow(.04, dt);
    }
    particles = particles.filter(p => p.life > 0);
    shake = Math.max(0, shake - dt * 1.9);
    if (roundState === 'dead') { trimTrail(player); for (const rival of rivals) trimTrail(rival); return; }
    if (roundState === 'clear') {
      roundClearTimer -= dt;
      trimTrail(player);
      for (const rival of rivals) trimTrail(rival);
      if (roundClearTimer <= 0) beginRound();
      return;
    }
    roundTime += dt;
    if (player.alive) {
      moveSnake(player, dt);
      if (player.alive) { applySpeedPad(player); collectPips(player); }
    }
    for (const rival of rivals) {
      if (!rival.alive) { trimTrail(rival); continue; }
      rival.think -= dt;
      if (rival.think <= 0) { chooseAiTurn(rival); rival.think = .26 + rng() * .32; }
      moveSnake(rival, dt);
      if (rival.alive) { applySpeedPad(rival); collectPips(rival); }
    }
    if (player.alive && rivals.every(rival => !rival.alive)) clearRound();
    updateHud();
  }

  function burst(x, y, color, count, force) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const speed = rand(.35, 1.8) * force;
      particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: rand(.25, .72), max: .72, size: rand(.035, .11), color });
    }
    if (particles.length > 150) particles.splice(0, particles.length - 150);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#070b16';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.save();
    const jx = Math.sin(elapsed * 47.1) * shake * scale * .45;
    const jy = Math.cos(elapsed * 39.7) * shake * scale * .45;
    ctx.translate(ox + jx, oy + jy);
    ctx.scale(scale, scale);
    drawArena();
    drawPips();
    drawTrails();
    drawParticles();
    ctx.restore();
  }

  function drawArena() {
    const b = currentBounds();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0d1a2c');
    grad.addColorStop(1, '#08101d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(82,218,255,.025)';
    ctx.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.left, b.top, b.right - b.left, b.bottom - b.top);
    ctx.clip();
    ctx.strokeStyle = 'rgba(117,184,211,.08)';
    ctx.lineWidth = .035;
    for (let x = Math.ceil(b.left); x <= b.right; x++) { ctx.beginPath(); ctx.moveTo(x, b.top); ctx.lineTo(x, b.bottom); ctx.stroke(); }
    for (let y = Math.ceil(b.top); y <= b.bottom; y++) { ctx.beginPath(); ctx.moveTo(b.left, y); ctx.lineTo(b.right, y); ctx.stroke(); }
    ctx.restore();
    const shrink = clamp((roundTime - 26) / 20, 0, 1);
    ctx.strokeStyle = shrink > 0 ? rgba('255,102,142', .56 + shrink * .27) : '#3ac6e878';
    ctx.lineWidth = .16;
    ctx.shadowColor = shrink > 0 ? '#ff668e' : '#39dfff';
    ctx.shadowBlur = .55 + shrink * .65;
    ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
    ctx.shadowBlur = 0;
    drawSpeedPads();
    for (const g of gates()) drawGate(g);
    if (shrink > 0) {
      ctx.fillStyle = rgba('255,102,142', .025 + shrink * .035);
      ctx.fillRect(0, 0, W, b.top);
      ctx.fillRect(0, b.bottom, W, H - b.bottom);
      ctx.fillRect(0, 0, b.left, H);
      ctx.fillRect(b.right, 0, W - b.right, H);
    }
  }

  function drawSpeedPads() {
    for (const pad of SPEED_PADS) {
      const pulse = .88 + Math.sin(elapsed * 4.5 + pad.phase) * .08;
      ctx.save();
      ctx.translate(pad.x, pad.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(85,231,255,.07)';
      ctx.strokeStyle = 'rgba(85,231,255,.56)';
      ctx.lineWidth = .1;
      ctx.shadowColor = '#55e7ff';
      ctx.shadowBlur = .45;
      ctx.fillRect(-.58 * pulse, -.58 * pulse, 1.16 * pulse, 1.16 * pulse);
      ctx.strokeRect(-.58 * pulse, -.58 * pulse, 1.16 * pulse, 1.16 * pulse);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = 'rgba(218,251,255,.84)';
      ctx.beginPath();
      ctx.moveTo(-.23, .18); ctx.lineTo(.02, -.18); ctx.lineTo(.02, -.03); ctx.lineTo(.24, -.03);
      ctx.lineTo(-.07, .31); ctx.lineTo(-.07, .13); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function drawGate(g) {
    const open = gateOpen(g);
    const t = .35 + Math.sin(elapsed * 3 + g.offset) * .08;
    ctx.save();
    ctx.lineWidth = open ? .08 : .22;
    ctx.strokeStyle = open ? rgba('85,231,255', .22) : rgba('255,200,92', .86);
    ctx.shadowColor = open ? '#55e7ff' : '#ffc85c';
    ctx.shadowBlur = open ? .35 : .8;
    ctx.setLineDash(open ? [.5, .48] : [.9, .18]);
    ctx.beginPath();
    if (g.axis === 'h') { ctx.moveTo(g.start, g.pos); ctx.lineTo(g.end, g.pos); }
    else { ctx.moveTo(g.pos, g.start); ctx.lineTo(g.pos, g.end); }
    ctx.stroke();
    ctx.setLineDash([]);
    if (!open) {
      ctx.fillStyle = rgba('255,200,92', .12 + t * .05);
      if (g.axis === 'h') ctx.fillRect(g.start, g.pos - .19, g.end - g.start, .38);
      else ctx.fillRect(g.pos - .19, g.start, .38, g.end - g.start);
    }
    ctx.restore();
  }

  function drawPips() {
    for (const pip of pips) {
      const pulse = 1 + Math.sin(elapsed * 4 + pip.pulse) * .12;
      ctx.save();
      ctx.translate(pip.x, pip.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#f8fbff';
      ctx.shadowColor = '#a9f4ff';
      ctx.shadowBlur = .65;
      ctx.fillRect(-.23 * pulse, -.23 * pulse, .46 * pulse, .46 * pulse);
      ctx.fillStyle = '#55e7ff';
      ctx.fillRect(-.10 * pulse, -.10 * pulse, .20 * pulse, .20 * pulse);
      ctx.restore();
    }
  }

  function drawTrails() {
    const snakes = [player, ...rivals];
    for (const snake of snakes) {
      if (!snake) continue;
      const bodyTime = bodyWindow(snake);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const wallBuckets = [
        [bodyTime, bodyTime + 2.4, .34],
        [bodyTime + 2.4, bodyTime + 5.0, .25],
        [bodyTime + 5.0, bodyTime + 7.6, .16],
        [bodyTime + 7.6, WALL_TTL + .1, .07]
      ];
      for (const bucket of wallBuckets) {
        ctx.beginPath();
        let hasPath = false;
        for (let i = 1; i < snake.trail.length; i++) {
          const a = snake.trail[i - 1];
          const b = snake.trail[i];
          const age = elapsed - b.t;
          if (age < bucket[0] || age >= bucket[1] || age > WALL_TTL) continue;
          if (!hasPath) { ctx.moveTo(a.x, a.y); hasPath = true; }
          ctx.lineTo(b.x, b.y);
        }
        if (hasPath) {
          ctx.lineWidth = .68;
          ctx.strokeStyle = rgba(snake.color.rgb, bucket[2]);
          ctx.stroke();
        }
      }
      ctx.beginPath();
      let hasBody = false;
      for (let i = 1; i < snake.trail.length; i++) {
        const a = snake.trail[i - 1];
        const b = snake.trail[i];
        if (elapsed - b.t > bodyTime) continue;
        if (!hasBody) { ctx.moveTo(a.x, a.y); hasBody = true; }
        ctx.lineTo(b.x, b.y);
      }
      if (hasBody) {
        ctx.lineWidth = .92;
        ctx.strokeStyle = rgba(snake.color.rgb, .62);
        ctx.shadowColor = snake.color.main;
        ctx.shadowBlur = 1.1;
        ctx.stroke();
      }
      ctx.restore();
      if (snake.alive) {
        ctx.save();
        ctx.translate(snake.x, snake.y);
        ctx.rotate(Math.atan2(snake.dir.y, snake.dir.x));
        ctx.fillStyle = snake.color.main;
        ctx.shadowColor = snake.color.main;
        ctx.shadowBlur = 1.15;
        ctx.beginPath(); ctx.arc(0, 0, .52, 0, TAU); ctx.fill();
        ctx.fillStyle = '#07101b';
        ctx.fillRect(.12, -.23, .18, .15);
        ctx.fillRect(.12, .08, .18, .15);
        ctx.restore();
      }
    }
  }

  function drawParticles() {
    for (const particle of particles) {
      const life = clamp(particle.life / particle.max, 0, 1);
      ctx.fillStyle = rgba(particle.color.rgb, life * .82);
      ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size * (.5 + life), 0, TAU); ctx.fill();
    }
  }

  function frame(now) {
    const dt = Math.min(.045, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function unlockAudio() {
    if (!audioContext) {
      try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { audioContext = null; }
    }
    if (audioContext && audioContext.state === 'suspended') audioContext.resume();
  }

  function pointerTurn(x, y, start) {
    if (!start) return;
    const dx = x - start.x;
    const dy = y - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    if (Math.abs(dx) > Math.abs(dy)) handleTurn(dx > 0 ? 'right' : 'left');
    else handleTurn(dy > 0 ? 'down' : 'up');
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (pointerStart) return;
    unlockAudio();
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, { passive: false });
  canvas.addEventListener('pointermove', (event) => {
    if (pointerStart && pointerStart.id === event.pointerId) event.preventDefault();
  }, { passive: false });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const start = pointerStart; pointerStart = null;
    pointerTurn(event.clientX, event.clientY, start);
    if (roundState === 'dead' && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 22) startGame();
    event.preventDefault();
  }, { passive: false });
  canvas.addEventListener('pointercancel', (event) => {
    if (pointerStart && pointerStart.id === event.pointerId) pointerStart = null;
  }, { passive: false });
  message.addEventListener('click', () => { if (roundState === 'dead') startGame(); });
  window.addEventListener('keydown', (event) => {
    const keys = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
    if (keys[event.key]) { event.preventDefault(); handleTurn(keys[event.key]); }
    if ((event.key === ' ' || event.key === 'Enter') && roundState === 'dead') { event.preventDefault(); startGame(); }
  });
  window.addEventListener('resize', resize, { passive: true });

  resize();
  startGame();
  requestAnimationFrame(frame);
})();
