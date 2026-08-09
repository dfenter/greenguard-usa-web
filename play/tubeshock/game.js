(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const levelEl = document.getElementById('level');
  const livesEl = document.getElementById('lives');
  const surgeEl = document.getElementById('surge');
  const surgeCountEl = document.getElementById('surgeButtonCount');
  const hintEl = document.getElementById('hint');
  const message = document.getElementById('message');
  const messageTitle = document.getElementById('messageTitle');
  const messageText = document.getElementById('messageText');
  const restartBtn = document.getElementById('restart');
  const surgeBtn = document.getElementById('surgeBtn');

  const TAU = Math.PI * 2;
  const LANES = 12;
  const geometries = ['ROUND', 'STAR', 'RIBBON', 'OPEN ARC'];
  const colors = { cyan: '#66f5ff', aqua: '#a6fff0', violet: '#ad8cff', gold: '#ffd36e', pink: '#ff6e9b', red: '#ff596d' };
  let W = 390, H = 700, dpr = 1;
  let state = 'playing';
  let last = performance.now();
  let time = 0;
  let levelTime = 0;
  let warpTime = 0;
  let spawnTimer = .75;
  let fireTimer = .18;
  let playerLane = 6;
  let targetLane = 6;
  let score = 0;
  let best = readBest();
  let level = 1;
  let lives = 3;
  let surge = 2;
  let shake = 0;
  let flash = 0;
  let drag = false;
  let pointerId = null;
  let audio = null;
  let hintTimeout = 0;
  const enemies = [];
  const bullets = [];
  const particles = [];
  const backgroundBits = [];

  function readBest() {
    try { const value = Number(localStorage.getItem('tubeshock-best') || 0); return Number.isFinite(value) && value >= 0 ? value : 0; } catch (e) { return 0; }
  }

  function saveBest() {
    try { localStorage.setItem('tubeshock-best', String(best)); } catch (e) { /* storage can be unavailable */ }
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wrap(v, n) { return ((v % n) + n) % n; }
  function shortestLane(a, b) {
    let d = a - b;
    while (d > LANES / 2) d -= LANES;
    while (d < -LANES / 2) d += LANES;
    return d;
  }
  function ease(t) { return t * t * (3 - 2 * t); }
  function fmt(n) { return String(Math.max(0, Math.floor(n))).padStart(6, '0'); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    const longAxis = Math.max(W, H);
    dpr = Math.min(window.devicePixelRatio || 1, 2, 960 / longAxis);
    dpr = Math.max(.75, dpr);
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedBackground();
  }

  function seedBackground() {
    backgroundBits.length = 0;
    const count = Math.round(clamp(W * H / 9500, 35, 100));
    for (let i = 0; i < count; i++) backgroundBits.push({ x: Math.random() * W, y: Math.random() * H, z: rand(.25, 1), r: rand(.4, 1.6), drift: rand(-.15, .15) });
  }

  function tubeMetrics() {
    return { cx: W * .5, cy: H * .39, rx: Math.min(W * .44, H * .43), ry: Math.min(W * .27, H * .24) };
  }

  function laneAngle(lane) {
    if (geometryName() === 'OPEN ARC') return -Math.PI * .88 + (clamp(lane, 0, LANES - 1) / (LANES - 1)) * Math.PI * 1.55;
    return -Math.PI * .5 + (wrap(lane, LANES) / LANES) * TAU;
  }

  function geometryName() { return geometries[(level - 1) % geometries.length]; }

  function project(t, lane, extraAngle) {
    const m = tubeMetrics();
    const p = ease(clamp(t, 0, 1.12));
    const a = laneAngle(lane) + (extraAngle || 0);
    const deep = geometryName() === 'RIBBON';
    let rx = lerp(18, m.rx, p);
    let ry = lerp(12, m.ry, p);
    let x = m.cx + Math.cos(a) * rx;
    let y = m.cy + p * H * .16 + Math.sin(a) * ry;
    if (geometryName() === 'STAR') {
      const tooth = 1 + Math.cos(a * 5 + level * .48) * .12 * p;
      x = m.cx + Math.cos(a) * rx * tooth;
      y = m.cy + p * H * .16 + Math.sin(a) * ry * tooth;
    } else if (deep) {
      y += Math.sin(a * 2 + p * 4) * 11 * p;
      x += Math.sin(a + p * 2) * 5 * p;
      ry *= .64;
      y = m.cy + p * H * .16 + Math.sin(a) * ry;
    }
    return { x: x, y: y };
  }

  function traceRing(t, openExtra) {
    const name = geometryName();
    const segments = name === 'OPEN ARC' ? 34 : 40;
    const m = tubeMetrics();
    const p = ease(clamp(t, 0, 1.12));
    const start = name === 'OPEN ARC' ? -Math.PI * .88 : -Math.PI * .5;
    const span = name === 'OPEN ARC' ? Math.PI * 1.55 : TAU;
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const a = start + span * (i / segments);
      const fakeLane = name === 'OPEN ARC' ? (i / segments) * (LANES - 1) : (i / segments) * LANES;
      const pt = project(p, fakeLane, name === 'OPEN ARC' ? 0 : 0);
      if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    }
    if (openExtra && name !== 'OPEN ARC') ctx.closePath();
    void m;
  }

  function playTone(freq, duration, type, volume) {
    if (!audio) return;
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(45, freq * .7), now + duration);
    gain.gain.setValueAtTime(volume || .025, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + duration + .02);
  }

  function unlockAudio() {
    if (!audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
    }
    if (audio && audio.state === 'suspended') audio.resume();
  }

  function updateHud() {
    scoreEl.textContent = fmt(score);
    bestEl.textContent = fmt(best);
    levelEl.textContent = String(level).padStart(2, '0');
    livesEl.textContent = '♥ '.repeat(lives) + '· '.repeat(3 - lives);
    surgeEl.textContent = String(surge).padStart(2, '0');
    surgeCountEl.textContent = surge;
  }

  function resetGame() {
    state = 'playing';
    score = 0;
    level = 1;
    lives = 3;
    surge = 2;
    levelTime = 0;
    warpTime = 0;
    spawnTimer = .55;
    fireTimer = .12;
    playerLane = targetLane = 6;
    shake = flash = 0;
    drag = false;
    pointerId = null;
    enemies.length = 0;
    bullets.length = 0;
    particles.length = 0;
    message.classList.remove('show');
    hintEl.classList.remove('fade');
    clearTimeout(hintTimeout);
    hintTimeout = setTimeout(function () { hintEl.classList.add('fade'); }, 6200);
    updateHud();
    unlockAudio();
    playTone(220, .12, 'triangle', .03);
  }

  function setLaneFromPointer(x) {
    const margin = Math.max(18, W * .09);
    const u = clamp((x - margin) / Math.max(1, W - margin * 2), 0, 1);
    targetLane = u * (LANES - 1);
  }

  function moveLane(direction) {
    targetLane = wrap(Math.round(targetLane + direction), LANES);
    unlockAudio();
  }

  function activateSurge() {
    unlockAudio();
    if (state !== 'playing' || surge <= 0) return;
    surge--;
    let removed = 0;
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].t > .52) {
        burstAtEnemy(enemies[i], 14, colors.gold);
        enemies.splice(i, 1);
        removed++;
      }
    }
    score += removed * 65 * level;
    shake = .55;
    flash = .55;
    playTone(110, .3, 'sawtooth', .065);
    updateHud();
  }

  function spawnEnemy() {
    const r = Math.random();
    let type = r < .53 ? 'crawler' : r < .7 ? 'spinner' : r < .87 ? 'zapper' : 'pulsar';
    const e = { type: type, lane: Math.floor(Math.random() * LANES), t: type === 'zapper' ? .72 : .015, age: 0, phase: rand(0, TAU), hit: 0, hue: Math.random() };
    e.speed = (.055 + level * .009) * (type === 'zapper' ? .8 : type === 'pulsar' ? .7 : 1);
    if (type === 'spinner') e.speed *= 1.08;
    enemies.push(e);
  }

  function fire() {
    bullets.push({ lane: playerLane, t: 1.03, life: 0 });
    playTone(570 + Math.random() * 40, .045, 'square', .012);
  }

  function hitEnemy(e, index) {
    const points = (e.type === 'pulsar' ? 150 : e.type === 'zapper' ? 110 : e.type === 'spinner' ? 90 : 60) * level;
    score += points;
    if (score > best) { best = score; saveBest(); }
    burstAtEnemy(e, e.type === 'pulsar' ? 18 : 9, e.type === 'zapper' ? colors.pink : colors.cyan);
    enemies.splice(index, 1);
    flash = .17;
    playTone(e.type === 'pulsar' ? 180 : 330 + level * 14, .09, 'triangle', .028);
  }

  function burstAtEnemy(e, amount, color) {
    const p = project(e.t, e.lane);
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * TAU;
      const speed = rand(20, 130) * (e.t + .25);
      particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: rand(.25, .65), max: .65, size: rand(1, 3), color: color });
    }
  }

  function loseLife(reason) {
    if (state !== 'playing') return;
    lives--;
    flash = .7;
    shake = .8;
    playTone(reason === 'zapper' ? 70 : 95, .35, 'sawtooth', .06);
    const m = tubeMetrics();
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * TAU;
      particles.push({ x: m.cx, y: m.cy + H * .13, vx: Math.cos(a) * rand(30, 160), vy: Math.sin(a) * rand(30, 160), life: rand(.3, .8), max: .8, size: rand(1, 4), color: colors.red });
    }
    updateHud();
    if (lives <= 0) endGame();
  }

  function endGame() {
    state = 'gameover';
    if (score > best) { best = score; saveBest(); }
    updateHud();
    messageTitle.textContent = 'RIM BREACH';
    messageText.innerHTML = 'THE TUBE GOT THROUGH<br>SCORE ' + fmt(score) + ' · BEST ' + fmt(best);
    message.classList.add('show');
  }

  function startWarp() {
    state = 'warp';
    warpTime = 0;
    enemies.length = 0;
    bullets.length = 0;
    flash = .36;
    shake = .35;
    playTone(145, .55, 'sine', .045);
  }

  function finishWarp() {
    level++;
    levelTime = 0;
    state = 'playing';
    spawnTimer = .45;
    fireTimer = .1;
    if (level % 3 === 0) surge = Math.min(3, surge + 1);
    updateHud();
    playTone(420 + level * 20, .2, 'triangle', .035);
  }

  function update(dt) {
    time += dt;
    shake = Math.max(0, shake - dt * 1.8);
    flash = Math.max(0, flash - dt * 1.8);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.7;
      p.vy *= 1 - dt * 1.7;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (state === 'warp') {
      warpTime += dt;
      if (warpTime > 1.45) finishWarp();
      return;
    }
    if (state !== 'playing') return;

    const chase = shortestLane(targetLane, playerLane);
    playerLane = wrap(playerLane + chase * Math.min(1, dt * 13), LANES);
    levelTime += dt;
    const levelDuration = Math.max(12, 19 - level * .55);
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnEnemy();
      const intensity = Math.min(.86, .94 - level * .035);
      spawnTimer = rand(intensity * .7, intensity * 1.12);
      if (level > 4 && Math.random() < .17) spawnTimer *= .4;
    }
    fireTimer -= dt;
    if (fireTimer <= 0) {
      fire();
      fireTimer = Math.max(.19, .37 - level * .012);
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.t -= dt * 1.55;
      b.life += dt;
      let used = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (Math.abs(b.t - e.t) < .06 && Math.abs(shortestLane(b.lane, e.lane)) < .62) {
          hitEnemy(e, j);
          used = true;
          break;
        }
      }
      if (used || b.t < -.08) bullets.splice(i, 1);
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.age += dt;
      e.hit = Math.max(0, e.hit - dt);
      e.t += e.speed * dt;
      if (e.type === 'spinner') e.lane = wrap(e.lane + Math.sin(e.age * 3.4 + e.phase) * dt * (1.5 + level * .04), LANES);
      if (e.type === 'zapper') {
        e.t = .82 + Math.sin(e.age * 2 + e.phase) * .065;
        e.lane = wrap(e.lane + dt * (1.15 + level * .06), LANES);
        if (Math.abs(shortestLane(e.lane, playerLane)) < .63 && e.hit <= 0) {
          e.hit = 1.2;
          loseLife('zapper');
          burstAtEnemy(e, 12, colors.pink);
        }
      }
      if (e.type === 'pulsar') e.t += Math.sin(e.age * 5 + e.phase) * dt * .016;
      if (e.t >= 1.05 && e.type !== 'zapper') {
        burstAtEnemy(e, 7, colors.red);
        enemies.splice(i, 1);
        loseLife('breach');
      }
    }
    if (state === 'playing' && levelTime >= levelDuration) startWarp();
    updateHud();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#050816');
    g.addColorStop(.52, '#0a1725');
    g.addColorStop(1, '#090b18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * .5, H * .38, 4, W * .5, H * .38, Math.max(W, H) * .7);
    glow.addColorStop(0, '#1b446032');
    glow.addColorStop(1, '#060a1500');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#a9eaf0';
    for (const s of backgroundBits) {
      s.y += s.drift * .015;
      if (s.y > H + 5) s.y = -5;
      ctx.globalAlpha = s.z * (.28 + Math.sin(time * 1.5 + s.x) * .12);
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  function drawTube() {
    const m = tubeMetrics();
    const name = geometryName();
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowBlur = 10;
    ctx.shadowColor = name === 'STAR' ? colors.violet : name === 'RIBBON' ? colors.gold : colors.cyan;
    ctx.strokeStyle = name === 'STAR' ? '#a58dff88' : name === 'RIBBON' ? '#ffd56b88' : '#63e8f688';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      traceRing(t, true);
      ctx.globalAlpha = .32 + t * .38;
      ctx.stroke();
    }
    ctx.shadowBlur = 4;
    ctx.globalAlpha = .45;
    for (let lane = 0; lane < LANES; lane++) {
      ctx.beginPath();
      for (let i = 0; i <= 14; i++) {
        const p = project(i / 14, lane);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = .98;
    ctx.lineWidth = 2.3;
    traceRing(1, true);
    ctx.stroke();
    ctx.globalAlpha = .4;
    ctx.lineWidth = 1;
    traceRing(.03, true);
    ctx.stroke();
    ctx.restore();
    drawCenterCore(m);
  }

  function drawCenterCore(m) {
    ctx.save();
    const r = 15 + Math.sin(time * 2.2) * 2;
    ctx.shadowColor = colors.cyan;
    ctx.shadowBlur = 24;
    ctx.strokeStyle = '#86ffffaa';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(m.cx, m.cy, r * 1.5, r, 0, 0, TAU);
    ctx.stroke();
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#d4ffff';
    ctx.beginPath();
    ctx.arc(m.cx, m.cy, r * .45, time * .7, time * .7 + Math.PI * 1.35);
    ctx.stroke();
    ctx.restore();
  }

  function drawBullet(b) {
    const p = project(b.t, b.lane);
    const q = project(Math.min(1.08, b.t + .075), b.lane);
    ctx.save();
    ctx.strokeStyle = '#eaffff';
    ctx.shadowColor = colors.aqua;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(e) {
    const p = project(e.t, e.lane);
    const size = lerp(4, 17, clamp(e.t, 0, 1));
    const pulse = 1 + Math.sin(time * 5 + e.phase) * .1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(e.age * (e.type === 'spinner' ? 4 : .7) + e.phase);
    ctx.globalAlpha = e.hit > 0 ? .45 : 1;
    ctx.lineCap = 'round';
    if (e.type === 'crawler') {
      ctx.strokeStyle = '#75f1df'; ctx.fillStyle = '#1e7f84'; ctx.shadowColor = colors.aqua; ctx.shadowBlur = 13; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * .78, 0); ctx.lineTo(0, size); ctx.lineTo(-size * .78, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-size * .7, -size * .4); ctx.lineTo(-size * 1.4, -size * .9); ctx.moveTo(size * .7, size * .4); ctx.lineTo(size * 1.4, size * .9); ctx.stroke();
    } else if (e.type === 'spinner') {
      ctx.strokeStyle = '#bf9aff'; ctx.fillStyle = '#503f91'; ctx.shadowColor = colors.violet; ctx.shadowBlur = 15; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const rr = i % 2 ? size * .48 : size * 1.05; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, size * .18, 0, TAU); ctx.fill();
    } else if (e.type === 'zapper') {
      ctx.strokeStyle = '#ff719a'; ctx.shadowColor = colors.pink; ctx.shadowBlur = 17; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, size * pulse, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-size * 1.4, 0); ctx.lineTo(-size * .5, -size * .5); ctx.lineTo(size * .1, size * .45); ctx.lineTo(size * 1.4, 0); ctx.stroke();
      ctx.fillStyle = '#ffd7e5'; ctx.beginPath(); ctx.arc(0, 0, size * .16, 0, TAU); ctx.fill();
    } else {
      ctx.strokeStyle = '#ffd56e'; ctx.shadowColor = colors.gold; ctx.shadowBlur = 18; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, size * pulse, 0, TAU); ctx.stroke();
      ctx.globalAlpha = .6;
      ctx.beginPath(); ctx.arc(0, 0, size * .55 + Math.sin(time * 7 + e.phase) * size * .2, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * size, Math.sin(a) * size); ctx.lineTo(Math.cos(a) * size * 1.55, Math.sin(a) * size * 1.55); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawClaw() {
    const p = project(1.055, playerLane);
    const q = project(.95, playerLane);
    const angle = laneAngle(playerLane);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = '#dfffff'; ctx.strokeStyle = '#5bf4ef'; ctx.shadowColor = colors.aqua; ctx.shadowBlur = 18; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 5); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = '#d6fffd88'; ctx.shadowColor = colors.aqua; ctx.shadowBlur = 9; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawWarp() {
    const m = tubeMetrics();
    const t = clamp(warpTime / 1.45, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(m.cx, m.cy + H * .12);
    for (let i = 0; i < 14; i++) {
      const p = (i / 14 + t * .8) % 1;
      const rx = 10 + p * W * .7;
      const ry = 7 + p * H * .35;
      ctx.globalAlpha = (1 - p) * .7;
      ctx.strokeStyle = i % 2 ? colors.violet : colors.cyan;
      ctx.lineWidth = 1 + (1 - p) * 2;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, Math.sin(i) * .5, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#dfffff';
    ctx.shadowColor = colors.cyan; ctx.shadowBlur = 16;
    ctx.font = '800 12px ui-monospace, monospace';
    ctx.letterSpacing = '4px';
    ctx.fillText('WARPING TO LEVEL ' + String(level + 1).padStart(2, '0'), m.cx, H * .78);
    ctx.restore();
  }

  function draw() {
    drawBackground();
    ctx.save();
    if (shake > 0) ctx.translate(rand(-1, 1) * shake * 10, rand(-1, 1) * shake * 10);
    drawTube();
    for (const b of bullets) drawBullet(b);
    for (const e of enemies) drawEnemy(e);
    drawClaw();
    drawParticles();
    if (state === 'warp') drawWarp();
    ctx.restore();
    if (flash > 0) {
      ctx.fillStyle = state === 'gameover' ? '#ff42551e' : '#bfffff' + Math.floor(clamp(flash, 0, 1) * 24).toString(16).padStart(2, '0');
      ctx.fillRect(0, 0, W, H);
    }
  }

  function frame(now) {
    const dt = Math.min(.034, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function pointerStart(e) {
    if (state === 'gameover') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (drag) return;
    if (e.clientY > H * .58 || e.pointerType === 'mouse') {
      drag = true;
      pointerId = e.pointerId;
      setLaneFromPointer(e.clientX);
      unlockAudio();
      try { canvas.setPointerCapture(pointerId); } catch (err) { /* optional */ }
      e.preventDefault();
    }
  }

  function pointerMove(e) {
    if (!drag || (pointerId !== null && e.pointerId !== pointerId)) return;
    setLaneFromPointer(e.clientX);
    e.preventDefault();
  }

  function pointerEnd(e) {
    if (pointerId !== null && e.pointerId !== pointerId) return;
    drag = false;
    pointerId = null;
  }

  canvas.addEventListener('pointerdown', pointerStart, { passive: false });
  canvas.addEventListener('pointermove', pointerMove, { passive: false });
  canvas.addEventListener('pointerup', pointerEnd, { passive: false });
  canvas.addEventListener('pointercancel', pointerEnd, { passive: false });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  surgeBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); activateSurge(); });
  restartBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); resetGame(); });
  restartBtn.addEventListener('click', resetGame);
  window.addEventListener('keydown', function (e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'A', 'D', 'w', 's', 'W', 'S', ' ', 'Enter'].indexOf(e.key) !== -1) e.preventDefault();
    if (state === 'gameover' && (e.key === 'Enter' || e.key === ' ')) { resetGame(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') moveLane(-1);
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') moveLane(1);
    if (e.key === ' ' || e.key === 'Enter') activateSurge();
  }, { passive: false });
  window.addEventListener('resize', resize);
  window.addEventListener('blur', function () { drag = false; pointerId = null; });

  resize();
  resetGame();
  requestAnimationFrame(frame);
})();
