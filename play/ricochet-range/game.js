(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const app = document.getElementById('app');
  const holeStat = document.getElementById('hole-stat');
  const strokeStat = document.getElementById('stroke-stat');
  const gimmickValue = document.getElementById('gimmick-value');
  const scoreStrip = document.getElementById('score-strip');
  const hint = document.getElementById('hint');
  const toast = document.getElementById('toast');
  const modal = document.getElementById('modal');
  const modalEyebrow = document.getElementById('modal-eyebrow');
  const modalTitle = document.getElementById('modal-title');
  const modalCopy = document.getElementById('modal-copy');
  const result = document.getElementById('result');
  const action = document.getElementById('modal-action');
  const bestLine = document.getElementById('best-line');

  const W = 760;
  const H = 1400;
  const TAU = Math.PI * 2;
  const palette = {
    ink: '#e9fff6', mint: '#9af9d5', cyan: '#62d9e4', yellow: '#ffd66e',
    coral: '#ff816f', violet: '#b997ff', sand: '#d99b62', ice: '#82e4f4',
    board: '#0a2529', dark: '#07171b'
  };
  const bestKey = 'ricochet-range-best-card-v1';
  const firstSeed = 849321;

  let view = { width: 0, height: 0, dpr: 1, scale: 1, ox: 0, oy: 0 };
  let camera = { x: 0, y: 0 };
  let course;
  let currentHole = 0;
  let hole;
  let ball;
  let phase = 'play';
  let elapsed = 0;
  let lastFrame = performance.now();
  let aim = null;
  let aimDir = { x: 0, y: -1 };
  let aimPower = 220;
  let particles = [];
  let trail = [];
  let shake = 0;
  let toastTimer = 0;
  let pointers = new Map();
  let pan = null;
  let sinkTimer = null;

  class RNG {
    constructor(seed) { this.s = (seed >>> 0) || 1; }
    next() {
      this.s = (this.s + 0x6D2B79F5) | 0;
      let t = Math.imul(this.s ^ this.s >>> 15, 1 | this.s);
      t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    range(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return Math.floor(this.range(a, b + 1)); }
    pick(list) { return list[Math.floor(this.next() * list.length)]; }
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hypot = (x, y) => Math.sqrt(x * x + y * y);
  const distance = (a, b) => hypot(a.x - b.x, a.y - b.y);
  const unit = (x, y) => {
    const l = hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  };
  const fmtDelta = (n) => n === 0 ? 'E' : (n > 0 ? `+${n}` : `${n}`);
  const pathRoundRect = (c, x, y, w, h, r) => {
    const q = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + q, y);
    c.arcTo(x + w, y, x + w, y + h, q);
    c.arcTo(x + w, y + h, x, y + h, q);
    c.arcTo(x, y + h, x, y, q);
    c.arcTo(x, y, x + w, y, q);
    c.closePath();
  };
  const addWall = (h, x1, y1, x2, y2, kind = 'wall') => h.walls.push({ x1, y1, x2, y2, kind });
  const addRect = (list, x, y, w, h, extra = {}) => list.push({ x, y, w, h, ...extra });

  function createCourse(seed) {
    const rng = new RNG(seed);
    const holes = [];
    for (let i = 0; i < 18; i++) holes.push(createHole(i, rng));
    return { seed, holes, total: 0, parTotal: holes.reduce((sum, h) => sum + h.par, 0), scores: Array(18).fill(null) };
  }

  function createHole(index, rng) {
    const par = [3, 4, 3, 4, 5, 4][index % 6];
    const startSide = index % 4;
    const start = startSide === 0 ? { x: 130 + rng.range(0, 80), y: 1230 } : startSide === 1 ? { x: 630, y: 1190 - rng.range(0, 100) } : startSide === 2 ? { x: 470 + rng.range(0, 90), y: 1220 } : { x: 120, y: 1140 + rng.range(0, 80) };
    const cup = index % 4 === 0 ? { x: 570, y: 175 } : index % 4 === 1 ? { x: 170, y: 205 } : index % 4 === 2 ? { x: 385, y: 145 } : { x: 600, y: 280 };
    const h = {
      index, par, start, cup: { ...cup, r: 22 }, walls: [], gates: [], sand: [], ice: [], boosts: [], bumpers: [],
      stars: [], gimmick: null, theme: rng.pick(['MINT', 'EMBER', 'VIOLET']), shotCount: 0
    };
    addWall(h, 48, 58, 712, 58, 'rail');
    addWall(h, 712, 58, 712, 1342, 'rail');
    addWall(h, 712, 1342, 48, 1342, 'rail');
    addWall(h, 48, 1342, 48, 58, 'rail');

    const pattern = index % 6;
    const ys = [1015, 805, 595, 385];
    ys.forEach((y, row) => {
      const sway = rng.range(-34, 34);
      if (pattern === 0 || pattern === 3) {
        const gap = 172 + ((row + index) % 3) * 176 + sway;
        addWall(h, 74, y, gap - 54, y + (row % 2 ? 16 : -12));
        addWall(h, gap + 54, y + (row % 2 ? 16 : -12), 686, y);
      } else if (pattern === 1 || pattern === 4) {
        const left = 100 + ((row + index) % 2) * 210 + sway;
        addWall(h, 74, y + 25, left, y - 54);
        addWall(h, left + 90, y + 54, 686, y - 18);
      } else {
        const cx = 380 + sway;
        addWall(h, 86, y, cx - 75, y - 58);
        addWall(h, cx + 75, y + 58, 674, y);
        addWall(h, cx - 48, y + 76, cx + 48, y + 76, 'bumper');
      }
    });

    for (let n = 0; n < 4; n++) {
      const bx = 150 + rng.range(0, 440);
      const by = 300 + n * 220 + rng.range(-35, 35);
      const angle = rng.range(-0.65, 0.65);
      h.bumpers.push({ x: bx, y: by, r: rng.range(24, 37), angle });
    }
    addRect(h.sand, 92 + rng.range(0, 100), 700 + rng.range(-25, 30), 125 + rng.range(0, 55), 120);
    addRect(h.sand, 500 + rng.range(-45, 40), 960 + rng.range(-30, 30), 140 + rng.range(0, 55), 100);
    addRect(h.ice, 225 + rng.range(-35, 30), 410 + rng.range(-30, 20), 205, 74);
    const boostY = 1095 + rng.range(-35, 35);
    addRect(h.boosts, 330 + rng.range(-70, 65), boostY, 92, 48, { angle: rng.pick([0, Math.PI / 2]) });

    const gateY = 905 - (index % 3) * 125;
    h.gates.push({ x: 110 + rng.range(-20, 60), y: gateY, length: 270 + rng.range(0, 90), amp: rng.range(55, 105), speed: rng.range(0.9, 1.5), phase: rng.range(0, TAU), axis: index % 2 ? 'x' : 'y' });
    if (index % 5 === 4) h.gates.push({ x: 220, y: 520, length: 210, amp: 80, speed: 1.15, phase: 1.6, axis: 'x' });

    const gimmickType = index % 6;
    if (gimmickType === 0) h.gimmick = { type: 'vortex', name: 'VORTEX', x: 390, y: 690, r: 92 };
    if (gimmickType === 1) h.gimmick = { type: 'portal', name: 'PORTAL', a: { x: 185, y: 610, r: 31 }, b: { x: 580, y: 805, r: 31 }, cooldown: 0 };
    if (gimmickType === 2) h.gimmick = { type: 'wind', name: 'CROSSWIND', x: 385, y: 470, r: 125, wind: { x: rng.pick([-1, 1]) * 145, y: rng.range(-60, 60) } };
    if (gimmickType === 3) h.gimmick = { type: 'bounce', name: 'BOUNCE FIELD', x: 560, y: 565, r: 70, cooldown: 0 };
    if (gimmickType === 4) h.gimmick = { type: 'magnet', name: 'MAGNET RING', x: 205, y: 845, r: 82 };
    if (gimmickType === 5) h.gimmick = { type: 'slingshot', name: 'SLINGSHOT', x: 390, y: 290, r: 64, cooldown: 0 };
    for (let i = 0; i < 22; i++) h.stars.push({ x: rng.range(76, 684), y: rng.range(85, 1315), a: rng.range(.14, .5), r: rng.range(.7, 2.2) });
    return h;
  }

  function gateSegment(g, time) {
    const travel = Math.sin(time * g.speed + g.phase) * g.amp;
    if (g.axis === 'x') return { x1: g.x + travel, y1: g.y, x2: g.x + travel + g.length, y2: g.y, kind: 'gate' };
    return { x1: g.x, y1: g.y + travel, x2: g.x, y2: g.y + g.length + travel, kind: 'gate' };
  }

  function currentSegments() {
    return hole.walls.concat(hole.gates.map(g => gateSegment(g, elapsed)));
  }

  function startHole(index) {
    if (sinkTimer !== null) { clearTimeout(sinkTimer); sinkTimer = null; }
    pointers.clear();
    pan = null;
    currentHole = index;
    hole = course.holes[index];
    hole.shotCount = 0;
    ball = { x: hole.start.x, y: hole.start.y, vx: 0, vy: 0, r: 16, moving: false, shotTime: 0, boostCooldown: 0, gimmickCooldown: 0 };
    aimDir = unit(hole.cup.x - ball.x, hole.cup.y - ball.y);
    aimPower = 220;
    aim = null;
    trail = [];
    particles = [];
    shake = 0;
    phase = 'play';
    camera.x = 0;
    camera.y = 0;
    hideModal();
    updateHUD();
    showToast(`${hole.theme} RANGE`, 900);
  }

  function init() {
    let seed = firstSeed;
    try { seed = Number(localStorage.getItem('ricochet-range-last-seed')) || firstSeed; } catch (_) {}
    course = createCourse(seed);
    buildScoreStrip();
    startHole(0);
    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('orientationchange', resize, { passive: true });
    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onPointerUp, { passive: false });
    canvas.addEventListener('pointercancel', onPointerUp, { passive: false });
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('blur', () => { pointers.clear(); aim = null; pan = null; });
    action.addEventListener('click', onModalAction);
    requestAnimationFrame(frame);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    view.width = rect.width;
    view.height = rect.height;
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * view.dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * view.dpr));
    view.scale = Math.min(rect.width / W, rect.height / H);
    view.ox = (rect.width - W * view.scale) / 2;
    view.oy = (rect.height - H * view.scale) / 2;
    app.classList.toggle('landscape', rect.width > rect.height * 1.08);
  }

  function buildScoreStrip() {
    scoreStrip.innerHTML = '';
    for (let i = 0; i < 18; i++) {
      const cell = document.createElement('div');
      cell.className = 'score-cell';
      cell.textContent = String(i + 1).padStart(2, '0');
      cell.dataset.index = i;
      scoreStrip.appendChild(cell);
    }
  }

  function updateHUD() {
    if (!hole || !ball) return;
    holeStat.textContent = `${String(currentHole + 1).padStart(2, '0')}/18`;
    strokeStat.textContent = `${hole.shotCount} · ${hole.par}`;
    gimmickValue.textContent = hole.gimmick.name;
    [...scoreStrip.children].forEach((cell, i) => {
      cell.className = 'score-cell';
      if (course.scores[i] != null) { cell.classList.add('done'); cell.textContent = course.scores[i]; }
      else { cell.textContent = String(i + 1).padStart(2, '0'); }
      if (i === currentHole && phase === 'play') cell.classList.add('current');
    });
    hint.textContent = ball.moving ? 'Ricochet in progress · watch the surfaces' : 'Drag from the orb · arrows aim · space shoots';
  }

  function frame(now) {
    const raw = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    elapsed += raw;
    update(raw);
    render();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    if (toastTimer > 0) { toastTimer -= dt * 1000; if (toastTimer <= 0) toast.classList.remove('show'); }
    shake = Math.max(0, shake - dt * 2.8);
    particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(.04, dt); p.vy *= Math.pow(.04, dt); p.life -= dt; });
    particles = particles.filter(p => p.life > 0);
    if (phase !== 'play' || !ball.moving) return;
    const steps = Math.min(5, Math.max(1, Math.ceil(dt * 100)));
    const step = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (!ball.moving || phase !== 'play') break;
      simulate(step);
    }
    updateHUD();
  }

  function simulate(dt) {
    ball.shotTime += dt;
    ball.boostCooldown = Math.max(0, ball.boostCooldown - dt);
    ball.gimmickCooldown = Math.max(0, ball.gimmickCooldown - dt);
    applyGimmick(dt);
    const before = { x: ball.x, y: ball.y };
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    trail.push({ x: before.x, y: before.y, life: 1 });
    if (trail.length > 17) trail.shift();
    trail.forEach(p => p.life -= dt * 2.4);
    const hit = collideWalls();
    if (hit) { shake = Math.min(1, shake + .18); burst(ball.x, ball.y, hit === 'gate' ? palette.yellow : palette.mint, 4, 90); }
    applySurfaces(dt);
    checkBoosts();
    if (distance(ball, hole.cup) < hole.cup.r + 4 && hypot(ball.vx, ball.vy) < 620) { sinkBall(); return; }
    const speed = hypot(ball.vx, ball.vy);
    if (speed < 17 && ball.shotTime > .24) stopBall();
  }

  function collideWalls() {
    let impact = null;
    for (const seg of currentSegments()) {
      const hit = collideSegment(seg);
      if (hit) impact = seg.kind;
    }
    for (const b of hole.bumpers) {
      const dx = ball.x - b.x;
      const dy = ball.y - b.y;
      const d = hypot(dx, dy) || 1;
      const rr = ball.r + b.r;
      if (d < rr) {
        const nx = dx / d;
        const ny = dy / d;
        ball.x = b.x + nx * rr;
        ball.y = b.y + ny * rr;
        const toward = ball.vx * nx + ball.vy * ny;
        if (toward < 0) { ball.vx -= 1.9 * toward * nx; ball.vy -= 1.9 * toward * ny; ball.vx *= .98; ball.vy *= .98; }
        impact = 'bumper';
      }
    }
    return impact;
  }

  function collideSegment(seg) {
    const sx = seg.x2 - seg.x1;
    const sy = seg.y2 - seg.y1;
    const l2 = sx * sx + sy * sy || 1;
    const t = clamp(((ball.x - seg.x1) * sx + (ball.y - seg.y1) * sy) / l2, 0, 1);
    const px = seg.x1 + t * sx;
    const py = seg.y1 + t * sy;
    let nx = ball.x - px;
    let ny = ball.y - py;
    let d = hypot(nx, ny);
    if (d < .001) { const n = unit(-sy, sx); nx = n.x; ny = n.y; d = 1; }
    const radius = ball.r + (seg.kind === 'rail' ? 5 : 6);
    if (d >= radius) return false;
    nx /= d; ny /= d;
    ball.x = px + nx * radius;
    ball.y = py + ny * radius;
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      const bounce = seg.kind === 'gate' ? 1.02 : 1.06;
      ball.vx = (ball.vx - 2 * dot * nx) * bounce;
      ball.vy = (ball.vy - 2 * dot * ny) * bounce;
    }
    return true;
  }

  function applySurfaces(dt) {
    let drag = .42;
    for (const r of hole.ice) if (inside(r, ball.x, ball.y)) drag = .985;
    for (const r of hole.sand) if (inside(r, ball.x, ball.y)) drag = .08;
    ball.vx *= Math.pow(drag, dt);
    ball.vy *= Math.pow(drag, dt);
  }

  function applyGimmick(dt) {
    const g = hole.gimmick;
    if (!g) return;
    if (g.type === 'vortex') {
      const dx = g.x - ball.x, dy = g.y - ball.y, d = hypot(dx, dy);
      if (d < g.r && d > 8) { const pull = (1 - d / g.r) * 270; ball.vx += dx / d * pull * dt; ball.vy += dy / d * pull * dt; }
    } else if (g.type === 'wind') {
      const d = hypot(ball.x - g.x, ball.y - g.y);
      if (d < g.r) { const strength = (1 - d / g.r) * .9; ball.vx += g.wind.x * strength * dt; ball.vy += g.wind.y * strength * dt; }
    } else if (g.type === 'magnet') {
      const dx = g.x - ball.x, dy = g.y - ball.y, d = hypot(dx, dy);
      if (d < g.r && d > 9) { const push = (d / g.r) * 200; ball.vx -= dx / d * push * dt; ball.vy -= dy / d * push * dt; }
    } else if (g.type === 'portal' && g.cooldown <= 0) {
      if (distance(ball, g.a) < g.a.r) { teleport(g.b); g.cooldown = 1; }
      else if (distance(ball, g.b) < g.b.r) { teleport(g.a); g.cooldown = 1; }
    } else if (g.type === 'bounce' && g.cooldown <= 0 && distance(ball, g) < g.r) {
      const n = unit(ball.x - g.x, ball.y - g.y);
      const dot = ball.vx * n.x + ball.vy * n.y;
      const reflectedX = ball.vx - 2 * dot * n.x;
      const reflectedY = ball.vy - 2 * dot * n.y;
      ball.vx = reflectedX * 1.12;
      ball.vy = reflectedY * 1.12;
      g.cooldown = .35; burst(ball.x, ball.y, palette.violet, 18, 190); shake = .8;
    } else if (g.type === 'slingshot' && g.cooldown <= 0 && distance(ball, g) < g.r) {
      const n = unit(ball.x - g.x, ball.y - g.y);
      ball.vx += n.x * 560; ball.vy += n.y * 560; g.cooldown = .6; burst(ball.x, ball.y, palette.coral, 18, 220); shake = .7;
    }
  }

  function teleport(target) {
    ball.x = target.x; ball.y = target.y; ball.vx *= 1.05; ball.vy *= 1.05; burst(target.x, target.y, palette.cyan, 20, 160); showToast('PHASE SHIFT', 650);
  }

  function inside(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  function checkBoosts() {
    if (ball.boostCooldown > 0) return;
    for (const pad of hole.boosts) {
      if (inside(pad, ball.x, ball.y)) {
        const direction = pad.angle ? { x: 0, y: -1 } : unit(ball.vx || aimDir.x, ball.vy || aimDir.y);
        ball.vx += direction.x * 360; ball.vy += direction.y * 360; ball.boostCooldown = .5;
        burst(ball.x, ball.y, palette.yellow, 18, 180); showToast('BOOST', 500); shake = .55;
      }
    }
  }

  function stopBall() {
    ball.vx = 0; ball.vy = 0; ball.moving = false;
    if (hole.shotCount >= 12) finishHole(Math.min(12, hole.par + 6), true);
    updateHUD();
  }

  function sinkBall() {
    if (!ball.moving) return;
    ball.moving = false; ball.vx = 0; ball.vy = 0; ball.x = hole.cup.x; ball.y = hole.cup.y;
    burst(ball.x, ball.y, palette.mint, 32, 240); shake = 1;
    sinkTimer = setTimeout(() => { sinkTimer = null; if (phase === 'play' && ball && !ball.moving) finishHole(null, false); }, 280);
  }

  function finishHole(forcedScore = null, forced = false) {
    if (phase !== 'play') return;
    phase = 'holeComplete';
    const score = forcedScore == null ? hole.shotCount : forcedScore;
    course.scores[currentHole] = score;
    course.total = course.scores.reduce((sum, value) => sum + (value || 0), 0);
    updateHUD();
    const delta = score - hole.par;
    modalEyebrow.textContent = forced ? 'CAP REACHED' : (delta <= 0 ? 'CLEAN LINE' : 'HOLE CLEARED');
    modalTitle.textContent = forced ? 'The range moved on.' : (delta <= 0 ? 'Sweet pocket.' : 'Nice ricochet.');
    modalCopy.textContent = forced ? 'The scorecard logged a +6 finish.' : `${hole.gimmick.name.toLowerCase()} survived your line.`;
    result.innerHTML = `<div><strong>${score}</strong><span>strokes</span></div><div><strong>${fmtDelta(delta)}</strong><span>vs par</span></div><div><strong>${course.total}</strong><span>running</span></div>`;
    action.textContent = currentHole === 17 ? 'SEE FINAL CARD' : 'NEXT HOLE';
    bestLine.textContent = '';
    modal.hidden = false;
    showToast(delta <= 0 ? 'UNDER PAR' : `+${delta} ON THE CARD`, 850);
  }

  function finishCourse() {
    phase = 'courseComplete';
    const delta = course.total - course.parTotal;
    const medal = delta <= 0 ? 'GOLD' : delta <= 8 ? 'SILVER' : 'BRONZE';
    const best = readBest();
    const isBest = !best || course.total < best.total;
    if (isBest) writeBest({ total: course.total, par: course.parTotal, seed: course.seed });
    modalEyebrow.textContent = '18-HOLE CARD';
    modalTitle.textContent = `${medal} MEDAL`;
    modalCopy.textContent = isBest ? 'New best card. The range remembers.' : 'The range is ready for another line.';
    result.innerHTML = `<div><strong>${course.total}</strong><span>strokes</span></div><div><strong>${fmtDelta(delta)}</strong><span>vs par</span></div><div><strong>${course.parTotal}</strong><span>course par</span></div>`;
    action.textContent = 'NEXT COURSE';
    const record = isBest ? course.total : best.total;
    bestLine.textContent = `BEST CARD · ${record} STROKES`;
    modal.hidden = false;
    updateHUD();
  }

  function onModalAction() {
    if (phase === 'holeComplete') {
      if (currentHole === 17) finishCourse();
      else startHole(currentHole + 1);
    } else if (phase === 'courseComplete') nextCourse();
  }

  function nextCourse() {
    const seed = randomSeed();
    try { localStorage.setItem('ricochet-range-last-seed', String(seed)); } catch (_) {}
    course = createCourse(seed);
    startHole(0);
  }

  function randomSeed() {
    try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] || Date.now(); } catch (_) { return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0; }
  }

  function readBest() { try { return JSON.parse(localStorage.getItem(bestKey) || 'null'); } catch (_) { return null; } }
  function writeBest(card) { try { localStorage.setItem(bestKey, JSON.stringify(card)); } catch (_) {} }

  function showToast(text, duration) {
    toast.textContent = text; toastTimer = duration; toast.classList.add('show');
  }
  function hideModal() { modal.hidden = true; }
  function getWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left - view.ox) / view.scale - camera.x, y: (clientY - r.top - view.oy) / view.scale - camera.y };
  }
  function midpoint() {
    const values = [...pointers.values()];
    return { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 };
  }
  function onPointerDown(e) {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) { aim = null; pan = { last: midpoint() }; return; }
    if (phase !== 'play' || ball.moving) return;
    const p = getWorld(e.clientX, e.clientY);
    if (distance(p, ball) <= 72) { aim = { id: e.pointerId, point: p }; updateAim(p); }
  }
  function onPointerMove(e) {
    e.preventDefault();
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      if (!pan) pan = { last: midpoint() };
      const m = midpoint();
      camera.x += (m.x - pan.last.x) / view.scale;
      camera.y += (m.y - pan.last.y) / view.scale;
      camera.x = clamp(camera.x, -90, 90); camera.y = clamp(camera.y, -100, 100);
      pan.last = m; aim = null; return;
    }
    if (aim && aim.id === e.pointerId && phase === 'play' && !ball.moving) updateAim(getWorld(e.clientX, e.clientY));
  }
  function onPointerUp(e) {
    e.preventDefault();
    const wasAim = aim && aim.id === e.pointerId;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pan = null;
    if (wasAim) { const p = getWorld(e.clientX, e.clientY); updateAim(p); if (aimPower > 16) shoot(aimDir, aimPower); aim = null; }
  }
  function updateAim(point) {
    if (!ball) return;
    const dx = ball.x - point.x, dy = ball.y - point.y;
    const power = hypot(dx, dy);
    if (power < 4) return;
    aimPower = clamp(power * 1.15, 0, 360);
    aimDir = unit(dx, dy);
  }
  function shoot(dir = aimDir, power = aimPower) {
    if (phase !== 'play' || ball.moving || power < 16) return;
    hole.shotCount += 1;
    ball.vx = dir.x * (power * 4.15);
    ball.vy = dir.y * (power * 4.15);
    ball.moving = true; ball.shotTime = 0;
    trail = [];
    burst(ball.x, ball.y, palette.mint, 8, 90);
    showToast(`SHOT ${hole.shotCount}`, 450);
    updateHUD();
  }
  function onKeyDown(e) {
    const key = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'enter'].includes(key)) e.preventDefault();
    if ((key === 'r' || key === 'escape') && phase !== 'courseComplete') { startHole(currentHole); return; }
    if (key === 'enter' && phase !== 'play') { onModalAction(); return; }
    if (phase !== 'play' || ball.moving) return;
    const dirs = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
    if (dirs[key]) { aimDir = unit(dirs[key][0], dirs[key][1]); aimPower = 230; showToast('AIM LOCKED', 350); }
    if (key === ' ' || key === 'enter') shoot(aimDir, aimPower);
  }

  function firstWallHit(origin, direction) {
    let nearest = null;
    for (const seg of currentSegments()) {
      const hit = raySegment(origin, direction, seg);
      if (hit && hit.t > 8 && (!nearest || hit.t < nearest.t)) nearest = { ...hit, seg };
    }
    return nearest;
  }
  function raySegment(o, d, s) {
    const rx = d.x, ry = d.y;
    const sx = s.x2 - s.x1, sy = s.y2 - s.y1;
    const qx = s.x1 - o.x, qy = s.y1 - o.y;
    const cross = rx * sy - ry * sx;
    if (Math.abs(cross) < .0001) return null;
    const t = (qx * sy - qy * sx) / cross;
    const u = (qx * ry - qy * rx) / cross;
    if (t >= 0 && u >= 0 && u <= 1) return { t, x: o.x + rx * t, y: o.y + ry * t };
    return null;
  }
  function previewPath() {
    const first = firstWallHit(ball, aimDir);
    if (!first) return { first: { x: ball.x + aimDir.x * 260, y: ball.y + aimDir.y * 260 }, second: null };
    const sx = first.seg.x2 - first.seg.x1, sy = first.seg.y2 - first.seg.y1;
    const normal = unit(-sy, sx);
    const dot = aimDir.x * normal.x + aimDir.y * normal.y;
    const reflected = unit(aimDir.x - 2 * dot * normal.x, aimDir.y - 2 * dot * normal.y);
    return { first, second: { x: first.x + reflected.x * 160, y: first.y + reflected.y * 160 }, reflected };
  }

  function burst(x, y, color, count = 10, force = 100) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = force * (.35 + Math.random() * .65);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .34 + Math.random() * .42, max: .7, r: 2 + Math.random() * 3, color });
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
  }

  function render() {
    const dpr = view.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    const bg = ctx.createRadialGradient(view.width * .5, view.height * .4, 0, view.width * .5, view.height * .4, Math.max(view.width, view.height) * .75);
    bg.addColorStop(0, '#103238'); bg.addColorStop(1, '#040d11');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, view.width, view.height);
    const sx = (Math.random() - .5) * shake * 5;
    const sy = (Math.random() - .5) * shake * 5;
    ctx.save();
    ctx.translate(view.ox + sx, view.oy + sy);
    ctx.scale(view.scale, view.scale);
    ctx.translate(camera.x, camera.y);
    drawBoard();
    drawHole();
    ctx.restore();
  }

  function drawBoard() {
    pathRoundRect(ctx, 24, 24, W - 48, H - 48, 42);
    ctx.fillStyle = palette.board; ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(154,249,213,.045)'; ctx.lineWidth = 1;
    for (let x = 45; x < W - 20; x += 34) { ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, H - 20); ctx.stroke(); }
    for (let y = 50; y < H; y += 34) { ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(W - 20, y); ctx.stroke(); }
    hole.stars.forEach(s => { ctx.globalAlpha = s.a; ctx.fillStyle = palette.mint; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); });
    ctx.globalAlpha = 1;
    ctx.restore();
    pathRoundRect(ctx, 48, 58, W - 96, H - 116, 28);
    ctx.strokeStyle = 'rgba(154,249,213,.32)'; ctx.lineWidth = 3; ctx.setLineDash([12, 12]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(154,249,213,.5)'; ctx.font = '700 10px ui-sans-serif, sans-serif'; ctx.letterSpacing = '2px'; ctx.fillText(`RANGE // ${String(course.seed).slice(-4)}`, 70, 91);
    ctx.fillStyle = 'rgba(144,178,173,.5)'; ctx.fillText(`HOLE ${String(currentHole + 1).padStart(2, '0')}`, 630, 91);
  }

  function drawHole() {
    drawSurfaceRects(hole.sand, palette.sand, 'SAND');
    drawSurfaceRects(hole.ice, palette.ice, 'ICE');
    hole.boosts.forEach(drawBoost);
    drawGimmick(hole.gimmick);
    currentSegments().forEach(seg => drawWall(seg));
    hole.bumpers.forEach(drawBumper);
    drawCup();
    if (aim && !ball.moving && phase === 'play') drawAim();
    trail.forEach((p, i) => { if (p.life <= 0) return; ctx.globalAlpha = p.life * .22; ctx.fillStyle = palette.mint; ctx.beginPath(); ctx.arc(p.x, p.y, 6 + i * .35, 0, TAU); ctx.fill(); });
    ctx.globalAlpha = 1;
    particles.forEach(p => { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.7 + p.life), 0, TAU); ctx.fill(); });
    ctx.globalAlpha = 1;
    drawBall();
  }

  function drawSurfaceRects(list, color, label) {
    list.forEach(r => {
      pathRoundRect(ctx, r.x, r.y, r.w, r.h, 15);
      const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      g.addColorStop(0, color + '38'); g.addColorStop(1, color + '12');
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = color + '8a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.clip(); ctx.strokeStyle = color + '35'; ctx.lineWidth = 2;
      for (let x = r.x - r.h; x < r.x + r.w; x += 12) { ctx.beginPath(); ctx.moveTo(x, r.y + r.h); ctx.lineTo(x + r.h, r.y); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = color; ctx.globalAlpha = .76; ctx.font = '800 9px ui-sans-serif, sans-serif'; ctx.fillText(label, r.x + 10, r.y + 18); ctx.globalAlpha = 1;
    });
  }

  function drawBoost(r) {
    pathRoundRect(ctx, r.x, r.y, r.w, r.h, 10); ctx.fillStyle = 'rgba(255,214,110,.16)'; ctx.fill(); ctx.strokeStyle = palette.yellow; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate(r.angle); ctx.fillStyle = palette.yellow;
    ctx.beginPath(); ctx.moveTo(-25, 0); ctx.lineTo(-5, -12); ctx.lineTo(-5, -5); ctx.lineTo(25, -5); ctx.lineTo(25, 5); ctx.lineTo(-5, 5); ctx.lineTo(-5, 12); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function drawWall(s) {
    ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = s.kind === 'rail' ? 16 : 18; ctx.beginPath(); ctx.moveTo(s.x1, s.y1 + 5); ctx.lineTo(s.x2, s.y2 + 5); ctx.stroke();
    ctx.strokeStyle = s.kind === 'gate' ? palette.yellow : s.kind === 'rail' ? palette.mint : palette.cyan; ctx.lineWidth = s.kind === 'rail' ? 8 : 10; ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x1, s.y1 - 2); ctx.lineTo(s.x2, s.y2 - 2); ctx.stroke();
  }

  function drawBumper(b) {
    const grad = ctx.createRadialGradient(b.x - b.r * .25, b.y - b.r * .3, 2, b.x, b.y, b.r);
    grad.addColorStop(0, '#f0ffff'); grad.addColorStop(.18, palette.violet); grad.addColorStop(1, '#443e78');
    ctx.shadowColor = palette.violet; ctx.shadowBlur = 16; ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.stroke();
  }

  function drawGimmick(g) {
    if (!g) return;
    ctx.save();
    if (g.type === 'portal') { drawPortal(g.a, palette.cyan); drawPortal(g.b, palette.coral); }
    else {
      const color = g.type === 'vortex' ? palette.cyan : g.type === 'wind' ? palette.yellow : g.type === 'magnet' ? palette.coral : g.type === 'bounce' ? palette.violet : palette.coral;
      const x = g.x, y = g.y;
      ctx.globalAlpha = .11; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, g.r, 0, TAU); ctx.fill(); ctx.globalAlpha = .75; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([7, 10]); ctx.beginPath(); ctx.arc(x, y, g.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = .7; ctx.strokeStyle = color; ctx.lineWidth = 3;
      if (g.type === 'vortex') for (let r = g.r - 18; r > 15; r -= 21) { ctx.beginPath(); ctx.arc(x, y, r, elapsed * (1 + r / 90), elapsed * (1 + r / 90) + Math.PI * 1.35); ctx.stroke(); }
      if (g.type === 'wind') { for (let i = -1; i <= 1; i++) { const yy = y + i * 30; ctx.beginPath(); ctx.moveTo(x - 58, yy); ctx.lineTo(x + 40, yy + g.wind.y * .1); ctx.lineTo(x + 29, yy + g.wind.y * .1 - 7); ctx.moveTo(x + 40, yy + g.wind.y * .1); ctx.lineTo(x + 29, yy + g.wind.y * .1 + 7); ctx.stroke(); } }
      if (g.type === 'magnet') { ctx.beginPath(); ctx.arc(x, y, 25, Math.PI * .15, Math.PI * .85); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 25, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
      if (g.type === 'bounce' || g.type === 'slingshot') { ctx.beginPath(); ctx.arc(x, y, 22 + Math.sin(elapsed * 5) * 5, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12); ctx.stroke(); }
      ctx.globalAlpha = .8; ctx.fillStyle = color; ctx.font = '800 9px ui-sans-serif, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(g.name, x, y + g.r + 17); ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  function drawPortal(p, color) {
    ctx.globalAlpha = .13; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 10, 0, TAU); ctx.fill(); ctx.globalAlpha = .9; ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + Math.sin(elapsed * 4) * 3, 0, TAU); ctx.stroke(); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 10, 0, TAU); ctx.stroke();
  }

  function drawCup() {
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(hole.cup.x, hole.cup.y, hole.cup.r, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#031013'; ctx.beginPath(); ctx.arc(hole.cup.x, hole.cup.y, hole.cup.r - 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = palette.yellow; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hole.cup.x, hole.cup.y, hole.cup.r + 4, 0, TAU); ctx.stroke();
    ctx.strokeStyle = palette.yellow; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hole.cup.x + 2, hole.cup.y - 2); ctx.lineTo(hole.cup.x + 2, hole.cup.y - 60); ctx.stroke();
    ctx.fillStyle = palette.yellow; ctx.beginPath(); ctx.moveTo(hole.cup.x + 3, hole.cup.y - 58); ctx.lineTo(hole.cup.x + 35, hole.cup.y - 48); ctx.lineTo(hole.cup.x + 3, hole.cup.y - 37); ctx.closePath(); ctx.fill();
  }

  function drawAim() {
    const p = aim.point;
    const drag = hypot(ball.x - p.x, ball.y - p.y);
    ctx.strokeStyle = 'rgba(154,249,213,.5)'; ctx.lineWidth = 4; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = palette.mint; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ball.x + aimDir.x * Math.min(290, aimPower * 1.1), ball.y + aimDir.y * Math.min(290, aimPower * 1.1)); ctx.stroke();
    const preview = previewPath();
    ctx.globalAlpha = .65; ctx.strokeStyle = palette.yellow; ctx.lineWidth = 3; ctx.setLineDash([4, 10]); ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(preview.first.x, preview.first.y); if (preview.second) ctx.lineTo(preview.second.x, preview.second.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.yellow; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ball.x, ball.y, 25 + clamp(drag, 0, 160) * .18, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(drag / 250, 0, 1)); ctx.stroke();
  }

  function drawBall() {
    if (!ball) return;
    const glow = ctx.createRadialGradient(ball.x - 5, ball.y - 6, 1, ball.x, ball.y, 30);
    glow.addColorStop(0, '#ffffff'); glow.addColorStop(.23, palette.mint); glow.addColorStop(1, 'rgba(154,249,213,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ball.x, ball.y, 31, 0, TAU); ctx.fill();
    const ballGrad = ctx.createRadialGradient(ball.x - 5, ball.y - 6, 2, ball.x, ball.y, ball.r);
    ballGrad.addColorStop(0, '#ffffff'); ballGrad.addColorStop(.35, '#d4fff0'); ballGrad.addColorStop(1, '#48b991');
    ctx.fillStyle = ballGrad; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e9fff6'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(ball.x - 5, ball.y - 6, 3, 0, TAU); ctx.fill();
  }

  init();
})();
