(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const TAU = Math.PI * 2;
  const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const BEST_KEY = 'breach-brick-best';
  const palette = ['#4edbca', '#5ca8ff', '#b883ff', '#ff719d', '#ffc85b', '#76e276'];

  let W = 390, H = 700, pixelScale = 1;
  let audio = null;
  let pointer = { down: false, x: 195, y: 600, startX: 195, startY: 600, started: 0 };
  let keyLeft = false, keyRight = false;
  let lastFrame = 0;

  function loadBest() {
    try { const n = Number(localStorage.getItem(BEST_KEY)); return Number.isFinite(n) && n >= 0 ? n : 0; } catch (_) { return 0; }
  }

  const state = {
    phase: 'play', level: 1, lives: 3, score: 0,
    best: loadBest(),
    seed: 0, rng: null, bricks: [], debris: [], powerups: [],
    balls: [], lasers: [], particles: [], stars: [],
    paddle: { x: 195, y: 625, w: 92, h: 14, targetX: 195, stun: 0, sticky: 0, laser: 0 },
    boss: null, shake: 0, flash: 0, combo: 0, comboTimer: 0,
    armed: true, wallRemaining: 0, levelStart: 0
  };

  function resize() {
    W = Math.max(280, window.innerWidth);
    H = Math.max(500, window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    pixelScale = Math.min(dpr, 960 / Math.max(W, H));
    canvas.width = Math.floor(W * pixelScale);
    canvas.height = Math.floor(H * pixelScale);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    state.paddle.y = H - 74;
    state.paddle.x = clamp(state.paddle.x, state.paddle.w / 2 + 8, W - state.paddle.w / 2 - 8);
    state.paddle.targetX = clamp(state.paddle.targetX, state.paddle.w / 2 + 8, W - state.paddle.w / 2 - 8);
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  function mulberry32(seed) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a = 0, b = 1) { return a + state.rng() * (b - a); }
  function roundedRect(c, x, y, w, h, r) {
    const q = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + q, y); c.arcTo(x + w, y, x + w, y + h, q);
    c.arcTo(x + w, y + h, x, y + h, q); c.arcTo(x, y + h, x, y, q);
    c.arcTo(x, y, x + w, y, q); c.closePath();
  }
  function circleRectHit(ball, rect) {
    const x = clamp(ball.x, rect.x, rect.x + rect.w);
    const y = clamp(ball.y, rect.y, rect.y + rect.h);
    const dx = ball.x - x, dy = ball.y - y;
    return dx * dx + dy * dy < ball.r * ball.r;
  }
  function rectsHit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function addScore(n) {
    state.score += n;
    if (state.score > state.best) { state.best = state.score; try { localStorage.setItem(BEST_KEY, state.best); } catch (_) {} }
  }
  function beep(freq = 280, duration = 0.045, type = 'sine') {
    if (!audio) return;
    try {
      const now = audio.currentTime;
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.045, now); g.gain.exponentialRampToValueAtTime(0.001, now + duration);
      o.connect(g).connect(audio.destination); o.start(now); o.stop(now + duration);
    } catch (_) {}
  }
  function wakeAudio() {
    if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }
    if (audio && audio.state === 'suspended') audio.resume();
  }

  function buildLevel(level) {
    state.seed = (0x9e3779b9 ^ Math.imul(level, 2654435761)) >>> 0;
    state.rng = mulberry32(state.seed);
    const cols = W < 360 ? 6 : 7;
    const rows = 6 + Math.min(2, Math.floor((level - 1) / 3));
    const gap = 5, side = 14, top = 106;
    const bw = (W - side * 2 - gap * (cols - 1)) / cols, bh = 25;
    const bricks = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const edge = col === 0 || col === cols - 1;
        let present = true;
        if (row > 1 && state.rng() < 0.13 + (level % 3) * 0.025) present = false;
        if (row === rows - 1 && state.rng() < 0.18) present = false;
        if (level % 5 === 0 && row === 0 && col > 0 && col < cols - 1) present = state.rng() > 0.18;
        if (present) {
          const hp = 1 + (level > 3 && state.rng() < 0.22 ? 1 : 0) + (level > 8 && state.rng() < 0.12 ? 1 : 0);
          bricks.push({
            row, col, x: side + col * (bw + gap), y: top + row * (bh + gap), w: bw, h: bh,
            hp, maxHp: hp, mass: 0.7 + state.rng() * 1.4, color: palette[(row + col + level) % palette.length],
            alive: true, support: false, hit: 0
          });
        }
      }
    }
    state.bricks = bricks;
    state.wallRemaining = bricks.length;
    state.boss = level % 5 === 0 ? { x: W / 2, y: top - 32, r: 18, hp: 9 + level * 2, maxHp: 9 + level * 2, t: 0 } : null;
    state.debris.length = 0; state.powerups.length = 0; state.lasers.length = 0; state.stars.length = 0;
    state.particles.length = 0; state.combo = 0; state.comboTimer = 0; state.shake = 0; state.flash = 0;
    state.paddle.stun = 0; state.paddle.sticky = 0; state.paddle.laser = 0;
    state.paddle.y = H - 74; state.paddle.x = W / 2; state.paddle.targetX = W / 2;
    state.balls = [newBall(true)]; state.armed = true; state.levelStart = performance.now();
    for (let i = 0; i < 30; i++) state.stars.push({ x: rand(0, W), y: rand(0, H), r: rand(0.5, 1.7), a: rand(0.2, 0.8) });
    collapseUnsupported(false);
  }

  function newBall(attached = false, source = null) {
    return {
      x: state.paddle.x, y: state.paddle.y - 12, r: source ? source.r : 7,
      vx: 0, vy: 0, launched: !attached, stuck: attached, heavy: !!(source && source.heavy),
      color: source ? source.color : '#f8ffff', trail: []
    };
  }
  function launchBall(ball) {
    if (!ball) return;
    ball.stuck = false; ball.launched = true;
    const speed = 305 + Math.min(85, state.level * 5);
    const angle = rand(-0.72, 0.72);
    ball.vx = Math.sin(angle) * speed; ball.vy = -Math.cos(angle) * speed;
    state.armed = false; beep(420, 0.08, 'triangle');
  }
  function action() {
    if (state.phase !== 'play') { restart(); return; }
    wakeAudio();
    const held = state.balls.find(b => b.stuck || !b.launched);
    if (held) launchBall(held);
    else if (state.paddle.laser > 0) fireLaser();
  }

  function destroyBrick(brick, source = 'ball') {
    if (!brick || !brick.alive) return;
    brick.alive = false; state.wallRemaining--;
    const points = source === 'crush' ? 16 : 24;
    state.combo = Math.min(99, state.combo + 1); state.comboTimer = 2.2;
    addScore(points + state.combo * 3); state.shake = Math.min(12, state.shake + 2.5); state.flash = 0.05;
    burst(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, source === 'crush' ? 8 : 14);
    beep(source === 'crush' ? 125 : 190 + state.combo * 8, 0.035, 'square');
    if (state.rng() < 0.14) dropPowerup(brick.x + brick.w / 2, brick.y + brick.h / 2);
    if (state.wallRemaining <= 0 && (!state.boss || state.boss.hp <= 0)) completeWall();
    else collapseUnsupported(true);
  }
  function collapseUnsupported(makeDebris) {
    const alive = state.bricks.filter(b => b.alive);
    const supported = new Set();
    const open = [];
    for (const b of alive) if (b.row === 0 || b.col === 0 || b.col === Math.max(...state.bricks.map(x => x.col))) { supported.add(b); open.push(b); }
    while (open.length) {
      const b = open.pop();
      for (const n of alive) {
        if (supported.has(n)) continue;
        if (Math.abs(n.row - b.row) + Math.abs(n.col - b.col) === 1) { supported.add(n); open.push(n); }
      }
    }
    for (const b of alive) {
      b.support = supported.has(b);
      if (!b.support) {
        b.alive = false; state.wallRemaining--;
        if (makeDebris) {
          state.debris.push({ x: b.x, y: b.y, w: b.w, h: b.h, vx: rand(-45, 45), vy: rand(15, 60),
            angle: rand(-0.2, 0.2), spin: rand(-3, 3), color: b.color, mass: b.mass, life: 10 });
          burst(b.x + b.w / 2, b.y + b.h / 2, b.color, 4);
        }
      }
    }
    if (state.wallRemaining <= 0 && (!state.boss || state.boss.hp <= 0) && state.phase === 'play') completeWall();
  }

  function dropPowerup(x, y) {
    if (state.powerups.length >= 32) return;
    const types = ['multi', 'wreck', 'sticky', 'laser'];
    state.powerups.push({ x, y, w: 30, h: 17, vy: 65, type: types[Math.floor(rand(0, types.length))], t: rand(0, TAU) });
  }
  function applyPowerup(type) {
    state.shake = 7; beep(650, 0.11, 'sine');
    if (type === 'multi') {
      const base = state.balls.find(b => b.launched) || state.balls[0];
      if (base) {
        for (const sign of [-1, 1]) { if (state.balls.length >= 8) break; state.balls.push({ ...base, vx: base.vx * 0.68 + sign * 115, vy: base.vy * 0.94, trail: [], color: '#8bf6e7' }); }
      }
    } else if (type === 'wreck') {
      state.balls.forEach(b => { b.heavy = true; b.r = Math.max(b.r, 10); b.color = '#ffca66'; });
    } else if (type === 'sticky') state.paddle.sticky = 12;
    else if (type === 'laser') state.paddle.laser = 12;
    burst(state.paddle.x, state.paddle.y, powerColor(type), 22);
  }
  function powerColor(type) { return type === 'multi' ? '#64e6d4' : type === 'wreck' ? '#ffbd5c' : type === 'sticky' ? '#d593ff' : '#ff719d'; }

  function fireLaser() {
    state.lasers.push({ x: state.paddle.x - 25, y: state.paddle.y - 12, w: 4, h: 16, vy: -520 },
      { x: state.paddle.x + 21, y: state.paddle.y - 12, w: 4, h: 16, vy: -520 });
    beep(770, 0.04, 'sawtooth');
  }
  function completeWall() {
    if (state.phase !== 'play') return;
    state.phase = 'clear'; state.armed = true; state.shake = 12; burst(W / 2, H * 0.38, '#fff4a8', 55); beep(820, 0.18, 'triangle');
    setTimeout(() => { if (state.phase === 'clear') { state.level++; state.phase = 'play'; buildLevel(state.level); } }, 900);
  }
  function loseBall(ball) {
    const idx = state.balls.indexOf(ball); if (idx < 0) return;
    state.balls.splice(idx, 1); burst(ball.x, H - 14, '#ff668c', 18); state.shake = 10; beep(90, 0.12, 'sawtooth');
    if (state.balls.length === 0) {
      state.lives--;
      if (state.lives <= 0) { state.phase = 'over'; state.armed = false; return; }
      state.balls = [newBall(true)]; state.armed = true; state.paddle.stun = 0;
    }
  }
  function restart() {
    keyLeft = false; keyRight = false; pointer = { down: false, x: W / 2, y: H - 100, startX: W / 2, startY: H - 100, started: 0 }; lastFrame = 0;
    state.phase = 'play'; state.level = 1; state.lives = 3; state.score = 0; state.paddle.x = W / 2; state.paddle.targetX = W / 2; buildLevel(1); wakeAudio();
  }

  function update(dt) {
    if (state.phase === 'over') { updateParticles(dt); return; }
    dt = Math.min(0.032, dt);
    state.shake = Math.max(0, state.shake - dt * 22); state.flash = Math.max(0, state.flash - dt); state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 0;
    const p = state.paddle;
    if (state.paddle.stun > 0) state.paddle.stun -= dt;
    if (p.sticky > 0) p.sticky -= dt;
    if (p.laser > 0) p.laser -= dt;
    const keyboard = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
    if (keyboard) p.targetX += keyboard * 430 * dt;
    p.targetX = clamp(p.targetX, p.w / 2 + 8, W - p.w / 2 - 8);
    const follow = p.stun > 0 ? 0.12 : 0.28;
    p.x += (p.targetX - p.x) * Math.min(1, follow * 60 * dt);
    if (state.boss) { state.boss.t += dt; state.boss.x = W / 2 + Math.sin(state.boss.t * 1.4) * (W * 0.33); }
    for (const ball of [...state.balls]) updateBall(ball, dt);
    updateDebris(dt); updatePowerups(dt); updateLasers(dt); updateParticles(dt);
    if (state.phase === 'play' && state.boss && state.boss.hp <= 0) {
      state.boss = null; addScore(500); burst(W / 2, 74, '#fff2a5', 35);
      if (state.wallRemaining <= 0) completeWall();
    }
  }
  function updateBall(ball, dt) {
    if (ball.stuck || !ball.launched) { ball.x = state.paddle.x; ball.y = state.paddle.y - ball.r - 3; return; }
    ball.trail.push({ x: ball.x, y: ball.y }); if (ball.trail.length > 6) ball.trail.shift();
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); beep(120, 0.018); }
    if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); beep(120, 0.018); }
    if (ball.y < 62 + ball.r) { ball.y = 62 + ball.r; ball.vy = Math.abs(ball.vy); beep(120, 0.018); }
    const p = state.paddle;
    if (ball.vy > 0 && circleRectHit(ball, { x: p.x - p.w / 2, y: p.y, w: p.w, h: p.h })) {
      ball.y = p.y - ball.r - 1;
      const hit = clamp((ball.x - p.x) / (p.w / 2), -1, 1);
      const speed = clamp(Math.hypot(ball.vx, ball.vy) * 1.015, 260, ball.heavy ? 475 : 420);
      ball.vx = hit * speed * 0.92; ball.vy = -Math.sqrt(Math.max(120, speed * speed - ball.vx * ball.vx));
      if (p.sticky > 0 && !ball.stuck) { ball.stuck = true; ball.launched = false; state.armed = true; }
      burst(ball.x, p.y, ball.heavy ? '#ffca66' : '#eaffff', 4); beep(245, 0.025);
    }
    for (const d of state.debris) {
      if (!circleRectHit(ball, d)) continue;
      if (ball.heavy) { d.life = 0; addScore(12); burst(ball.x, ball.y, d.color, 5); }
      else { bounceFromRect(ball, d); d.life -= 1.5; }
      state.shake = Math.min(8, state.shake + 1.2); break;
    }
    for (const b of state.bricks) {
      if (!b.alive || !circleRectHit(ball, b)) continue;
      const beforeY = ball.y;
      b.hit = 0.12; b.hp -= ball.heavy ? 2 : 1;
      if (b.hp <= 0) destroyBrick(b, 'ball'); else { addScore(4); burst(ball.x, ball.y, b.color, 3); beep(240, 0.022); }
      if (!ball.heavy || b.hp > 0) bounceFromRect(ball, b); else {
        ball.vy *= 1.015; ball.vx *= 1.015;
        if (Math.abs(ball.y - beforeY) < 0.2) ball.vy *= -1;
      }
      break;
    }
    if (state.boss && circleRectHit(ball, { x: state.boss.x - state.boss.r, y: state.boss.y - state.boss.r, w: state.boss.r * 2, h: state.boss.r * 2 })) {
      state.boss.hp -= ball.heavy ? 2 : 1; bounceFromRect(ball, { x: state.boss.x - state.boss.r, y: state.boss.y - state.boss.r, w: state.boss.r * 2, h: state.boss.r * 2 });
      burst(state.boss.x, state.boss.y, '#fff19a', 6); addScore(12); state.shake = 4;
    }
    if (ball.y - ball.r > H + 20) loseBall(ball);
  }
  function bounceFromRect(ball, rect) {
    const left = Math.abs(ball.x - rect.x), right = Math.abs(ball.x - (rect.x + rect.w));
    const top = Math.abs(ball.y - rect.y), bottom = Math.abs(ball.y - (rect.y + rect.h));
    if (Math.min(left, right) < Math.min(top, bottom)) ball.vx *= -1; else ball.vy *= -1;
    const speed = clamp(Math.hypot(ball.vx, ball.vy) * 1.003, 230, ball.heavy ? 470 : 410);
    const len = Math.max(1, Math.hypot(ball.vx, ball.vy)); ball.vx = ball.vx / len * speed; ball.vy = ball.vy / len * speed;
  }

  function updateDebris(dt) {
    for (const d of state.debris) {
      d.vy += 370 * d.mass * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.angle += d.spin * dt; d.life -= dt;
      if (d.x < -40 || d.x > W + 40 || d.y > H + 60) d.life = 0;
      const box = { x: d.x, y: d.y, w: d.w, h: d.h };
      if (d.vy > 0 && rectsHit(box, { x: state.paddle.x - state.paddle.w / 2, y: state.paddle.y, w: state.paddle.w, h: state.paddle.h })) {
        d.life = 0; state.paddle.stun = Math.max(state.paddle.stun, 0.8); state.shake = 9; burst(d.x + d.w / 2, state.paddle.y, '#ff718d', 10); beep(72, 0.08, 'sawtooth');
      }
      if (d.vy > 0) for (const b of state.bricks) {
        if (b.alive && rectsHit(box, b)) { destroyBrick(b, 'crush'); d.life = 0; break; }
      }
    }
    state.debris = state.debris.filter(d => d.life > 0);
  }
  function updatePowerups(dt) {
    for (const p of state.powerups) {
      p.y += p.vy * dt; p.t += dt * 4;
      if (rectsHit({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h }, { x: state.paddle.x - state.paddle.w / 2, y: state.paddle.y - 5, w: state.paddle.w, h: state.paddle.h + 10 })) { p.y = H + 99; applyPowerup(p.type); }
    }
    state.powerups = state.powerups.filter(p => p.y < H + 30);
  }
  function updateLasers(dt) {
    for (const l of state.lasers) {
      l.y += l.vy * dt;
      for (const b of state.bricks) if (b.alive && rectsHit(l, b)) { l.y = -100; destroyBrick(b, 'laser'); break; }
      if (state.boss && rectsHit(l, { x: state.boss.x - state.boss.r, y: state.boss.y - state.boss.r, w: state.boss.r * 2, h: state.boss.r * 2 })) { state.boss.hp--; l.y = -100; burst(state.boss.x, state.boss.y, '#ff8bb5', 4); }
    }
    state.lasers = state.lasers.filter(l => l.y > -30);
  }
  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) state.particles.push({ x, y, vx: rand(-125, 125), vy: rand(-145, 85), life: rand(0.3, 0.8), max: 0.8, size: rand(1.5, 4), color });
  }
  function updateParticles(dt) {
    for (const q of state.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 210 * dt; q.life -= dt; }
    state.particles = state.particles.filter(q => q.life > 0);
  }

  function draw() {
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a1021'); g.addColorStop(0.55, '#0b1020'); g.addColorStop(1, '#121021');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save();
    const sx = state.shake ? rand(-state.shake, state.shake) : 0, sy = state.shake ? rand(-state.shake, state.shake) : 0; ctx.translate(sx, sy);
    drawStars(); drawHud(); drawArena();
    for (const b of state.bricks) if (b.alive) drawBrick(b);
    for (const d of state.debris) drawDebris(d);
    if (state.boss) drawBoss();
    for (const p of state.powerups) drawPowerup(p);
    for (const l of state.lasers) { ctx.fillStyle = '#ff8bb5'; ctx.shadowColor = '#ff6b9b'; ctx.shadowBlur = 12; roundedRect(ctx, l.x, l.y, l.w, l.h, 2); ctx.fill(); ctx.shadowBlur = 0; }
    drawPaddle(); for (const ball of state.balls) drawBall(ball); drawParticles();
    ctx.restore();
    if (state.flash) { ctx.fillStyle = `rgba(255,255,255,${state.flash * 2})`; ctx.fillRect(0, 0, W, H); }
    if (state.phase === 'over') drawEndCard();
  }
  function drawStars() {
    ctx.fillStyle = '#d8e6ff'; for (const s of state.stars) { ctx.globalAlpha = s.a; ctx.fillRect(s.x, s.y, s.r, s.r); } ctx.globalAlpha = 1;
  }
  function drawHud() {
    ctx.fillStyle = '#f3f7ff'; ctx.font = `700 14px ${FONT}`; ctx.textBaseline = 'top';
    ctx.fillText('BREACH & BRICK', 14, 15);
    ctx.fillStyle = '#8591b1'; ctx.font = `11px ${FONT}`; ctx.fillText(`WALL ${String(state.level).padStart(2, '0')}`, 14, 36);
    ctx.textAlign = 'right'; ctx.fillStyle = '#e8f0ff'; ctx.font = `700 14px ${FONT}`; ctx.fillText(String(state.score).padStart(5, '0'), W - 14, 15);
    ctx.fillStyle = '#8591b1'; ctx.font = `11px ${FONT}`; ctx.fillText(`BEST ${String(state.best).padStart(5, '0')}`, W - 14, 36); ctx.textAlign = 'left';
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < state.lives ? '#ff719d' : '#2a2f42'; ctx.beginPath(); ctx.arc(18 + i * 18, 62, 5, 0, TAU); ctx.fill(); }
    if (state.combo > 1 && state.comboTimer > 0) { ctx.fillStyle = '#ffc85b'; ctx.font = `700 11px ${FONT}`; ctx.fillText(`COMBO x${state.combo}`, 78, 57); }
    if (state.paddle.sticky > 0 || state.paddle.laser > 0) {
      ctx.textAlign = 'right'; ctx.font = `10px ${FONT}`; ctx.fillStyle = state.paddle.laser > 0 ? '#ff8bb5' : '#d593ff';
      ctx.fillText(`${state.paddle.laser > 0 ? 'LASER' : 'STICKY'} ${Math.ceil(Math.max(state.paddle.laser, state.paddle.sticky))}`, W - 14, 57); ctx.textAlign = 'left';
    }
  }
  function drawArena() {
    ctx.strokeStyle = 'rgba(105,133,190,0.2)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(8, 75); ctx.lineTo(W - 8, 75); ctx.stroke();
    ctx.fillStyle = 'rgba(90,120,190,0.05)'; ctx.fillRect(8, 78, W - 16, H - 160);
    if (state.armed && state.phase === 'play') { ctx.fillStyle = '#8998ba'; ctx.font = `11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('DRAG TO STEER  •  TAP TO LAUNCH', W / 2, H - 25); ctx.textAlign = 'left'; }
  }
  function drawBrick(b) {
    const alpha = b.support ? 1 : 0.8; ctx.globalAlpha = alpha;
    const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h); grad.addColorStop(0, b.color); grad.addColorStop(1, shade(b.color, -0.42));
    ctx.fillStyle = grad; roundedRect(ctx, b.x, b.y, b.w, b.h, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.23)'; roundedRect(ctx, b.x + 3, b.y + 3, b.w - 6, 3, 2); ctx.fill();
    if (b.maxHp > 1) { ctx.fillStyle = 'rgba(4,8,18,0.45)'; ctx.fillRect(b.x + 7, b.y + b.h - 5, (b.w - 14) * (b.hp / b.maxHp), 2); }
    ctx.globalAlpha = 1;
  }
  function drawDebris(d) { ctx.save(); ctx.translate(d.x + d.w / 2, d.y + d.h / 2); ctx.rotate(d.angle); ctx.fillStyle = shade(d.color, -0.25); roundedRect(ctx, -d.w / 2, -d.h / 2, d.w, d.h, 4); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.stroke(); ctx.restore(); }
  function drawBoss() {
    const b = state.boss; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.t * 0.7); ctx.fillStyle = '#3a2849'; ctx.strokeStyle = '#ff719d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, b.r + 7, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffcf69'; ctx.beginPath(); ctx.arc(0, 0, b.r * 0.62 + Math.sin(b.t * 6) * 2, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff5c4'; ctx.beginPath(); ctx.arc(-4, -4, 4, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#27182e'; ctx.fillRect(W * 0.25, 80, W * 0.5, 4); ctx.fillStyle = '#ff719d'; ctx.fillRect(W * 0.25, 80, W * 0.5 * b.hp / b.maxHp, 4);
  }
  function drawPowerup(p) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.sin(p.t) * 0.08); ctx.fillStyle = powerColor(p.type); ctx.shadowColor = powerColor(p.type); ctx.shadowBlur = 12; roundedRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 6); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#07101d'; ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.type === 'multi' ? 'M' : p.type === 'wreck' ? 'W' : p.type === 'sticky' ? 'S' : 'L', 0, 1); ctx.restore(); }
  function drawPaddle() {
    const p = state.paddle; ctx.save(); ctx.translate(p.x, p.y); const col = p.stun > 0 ? '#ff526f' : p.laser > 0 ? '#ff8bb5' : p.sticky > 0 ? '#d593ff' : '#71e3d0';
    ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.fillStyle = col; roundedRect(ctx, -p.w / 2, 0, p.w, p.h, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.65)'; roundedRect(ctx, -p.w / 2 + 9, 3, p.w - 18, 3, 2); ctx.fill(); ctx.restore();
  }
  function drawBall(ball) {
    for (let i = 0; i < ball.trail.length; i++) { const t = ball.trail[i], a = i / ball.trail.length * 0.23; ctx.fillStyle = `rgba(159,244,236,${a})`; ctx.beginPath(); ctx.arc(t.x, t.y, ball.r * (i / ball.trail.length) * 0.8, 0, TAU); ctx.fill(); }
    ctx.fillStyle = ball.color; ctx.shadowColor = ball.color; ctx.shadowBlur = ball.heavy ? 22 : 11; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ball.x - ball.r * .3, ball.y - ball.r * .35, ball.r * .25, 0, TAU); ctx.fill();
  }
  function drawParticles() { for (const q of state.particles) { ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.color; ctx.fillRect(q.x, q.y, q.size, q.size); } ctx.globalAlpha = 1; }
  function drawEndCard() {
    ctx.fillStyle = 'rgba(6,9,18,.76)'; ctx.fillRect(0, 0, W, H); ctx.textAlign = 'center';
    ctx.fillStyle = '#ff719d'; ctx.font = `700 28px ${FONT}`; ctx.fillText('RUN ENDED', W / 2, H * .39);
    ctx.fillStyle = '#f3f7ff'; ctx.font = `15px ${FONT}`; ctx.fillText(`SCORE ${state.score}  •  BEST ${state.best}`, W / 2, H * .39 + 36);
    ctx.fillStyle = '#9eabc8'; ctx.font = `12px ${FONT}`; ctx.fillText('TAP OR PRESS ENTER TO REBUILD', W / 2, H * .39 + 72); ctx.textAlign = 'left';
  }

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16), r = clamp((n >> 16) + amount * 255, 0, 255), g = clamp(((n >> 8) & 255) + amount * 255, 0, 255), b = clamp((n & 255) + amount * 255, 0, 255);
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  function pointFromEvent(e) { const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); if (pointer.down) return; wakeAudio(); const q = pointFromEvent(e); pointer = { id: e.pointerId, down: true, x: q.x, y: q.y, startX: q.x, startY: q.y, started: performance.now() }; state.paddle.targetX = q.x; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }, { passive: false });
  canvas.addEventListener('pointermove', e => { e.preventDefault(); const q = pointFromEvent(e); if (e.pointerType === 'mouse' || (pointer.down && pointer.id === e.pointerId)) { pointer.x = q.x; pointer.y = q.y; state.paddle.targetX = q.x; } }, { passive: false });
  canvas.addEventListener('pointerup', e => { e.preventDefault(); if (!pointer.down || pointer.id !== e.pointerId) return; const q = pointFromEvent(e); const tap = Math.hypot(q.x - pointer.startX, q.y - pointer.startY) < 16 && performance.now() - pointer.started < 420; pointer.down = false; if (tap) action(); }, { passive: false });
  canvas.addEventListener('pointercancel', e => { if (pointer.id === e.pointerId) pointer = { down: false, x: pointer.x, y: pointer.y, startX: pointer.x, startY: pointer.y, started: 0 }; }, { passive: true });
  canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  window.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') { keyLeft = true; e.preventDefault(); } if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') { keyRight = true; e.preventDefault(); } if (e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 'w') { action(); e.preventDefault(); } });
  window.addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keyLeft = false; if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keyRight = false; });

  buildLevel(1);
  function frame(now) { const dt = lastFrame ? (now - lastFrame) / 1000 : 0; lastFrame = now; update(dt); draw(); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
})();
