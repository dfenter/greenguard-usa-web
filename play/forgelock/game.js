(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const VW = 390;
  const VH = 700;
  const TAU = Math.PI * 2;
  const SAVE_KEY = "forgelock-progress-v1";
  const DIRS = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
  ];
  const COLORS = [
    { main: "#55d6ff", deep: "#1977a8", glow: "#8be5ff", name: "cyan" },
    { main: "#ffbe5c", deep: "#a85f1b", glow: "#ffd88b", name: "amber" },
    { main: "#ff6f9c", deep: "#a82f5a", glow: "#ffabc5", name: "rose" },
    { main: "#8de68c", deep: "#398c5a", glow: "#baf8b1", name: "mint" }
  ];

  let view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
  let levels = [];
  let levelIndex = 0;
  let play = null;
  let mode = "game";
  let pointer = null;
  let particles = [];
  let lastFrame = performance.now();
  let elapsed = 0;
  let shake = 0;
  let pulse = 0;
  let progress = loadProgress();

  function key(x, y) { return x + "," + y; }
  function clonePoint(p) { return { x: p.x, y: p.y }; }
  function cloneCrates(a) { return a.map(c => ({ x: c.x, y: c.y, color: c.color })); }
  function cloneState(s) { return { worker: clonePoint(s.worker), crates: cloneCrates(s.crates) }; }
  function mulberry32(seed) {
    return () => {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }
  function inside(x, y, w, h) { return x >= 0 && y >= 0 && x < w && y < h; }
  function insideRoom(x, y, w, h) { return x > 0 && y > 0 && x < w - 1 && y < h - 1; }
  function hasCrate(crates, x, y, skip = -1) {
    return crates.some((c, i) => i !== skip && c.x === x && c.y === y);
  }
  function getCrate(crates, x, y) {
    return crates.findIndex(c => c.x === x && c.y === y);
  }
  function reverseCandidates(state, w, h) {
    const out = [];
    const { x, y } = state.worker;
    for (const d of DIRS) {
      const px = x + d.x;
      const py = y + d.y;
      if (insideRoom(px, py, w, h) && !hasCrate(state.crates, px, py)) {
        out.push({ kind: "walk", dx: d.x, dy: d.y });
      }
    }
    for (const d of DIRS) {
      const crate = getCrate(state.crates, x + d.x, y + d.y);
      const px = x - d.x;
      const py = y - d.y;
      if (crate >= 0 && insideRoom(px, py, w, h) && !hasCrate(state.crates, px, py, crate)) {
        out.push({ kind: "push", dx: d.x, dy: d.y, crate });
      }
    }
    return out;
  }
  function applyReverse(state, op) {
    const old = clonePoint(state.worker);
    if (op.kind === "walk") {
      state.worker.x += op.dx;
      state.worker.y += op.dy;
      return { dx: -op.dx, dy: -op.dy };
    }
    state.crates[op.crate].x = old.x;
    state.crates[op.crate].y = old.y;
    state.worker.x = old.x - op.dx;
    state.worker.y = old.y - op.dy;
    return { dx: op.dx, dy: op.dy };
  }
  function solveState(state, targets) {
    return targets.every(t => state.crates.some(c => c.x === t.x && c.y === t.y && c.color === t.color));
  }
  function makeTargetPoints(w, h, count, rng) {
    const midX = Math.floor(w / 2);
    const midY = Math.floor(h / 2);
    const pool = [
      { x: 1, y: 1 }, { x: w - 2, y: h - 2 }, { x: w - 2, y: 1 }, { x: 1, y: h - 2 },
      { x: midX, y: 1 }, { x: w - 2, y: midY }, { x: midX, y: h - 2 }, { x: 1, y: midY }
    ];
    const points = [];
    for (const p of pool.sort(() => rng() - .5)) {
      if (!points.some(q => q.x === p.x && q.y === p.y)) points.push(p);
      if (points.length === count) return points;
    }
    return points;
  }
  function makeLevel(index, seedBump = 0) {
    const rng = mulberry32(0x41C64E6D + index * 0x9E3779B9 + seedBump * 0x6D2B79F5);
    const stage = Math.floor(index / 6);
    const w = index < 6 ? 7 : index < 18 ? 8 : 9;
    const h = index < 6 ? 7 : index < 12 ? 7 : 8;
    const count = index < 6 ? 1 : index < 12 ? 2 : index < 24 ? 3 : 4;
    const targets = makeTargetPoints(w, h, count, rng).map((p, i) => ({ ...p, color: i % COLORS.length }));
    const occupied = new Set(targets.map(p => key(p.x, p.y)));
    let worker = { x: Math.floor(w / 2), y: Math.floor(h / 2) };
    if (occupied.has(key(worker.x, worker.y))) {
      const options = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (!occupied.has(key(x, y))) options.push({ x, y });
      worker = pick(rng, options);
    }
    const state = { worker, crates: targets.map(p => ({ x: p.x, y: p.y, color: p.color })) };
    const trace = [cloneState(state)];
    const reverseOps = [];
    let pushes = 0;
    const desiredPushes = Math.min(5 + stage * 2, Math.max(3, count * 3));
    const goalSteps = 18 + index * 5;
    const runReverse = () => {
      const candidates = reverseCandidates(state, w, h);
      if (!candidates.length) return false;
      const pushMoves = candidates.filter(c => c.kind === "push");
      let op;
      const walkMoves = candidates.filter(c => c.kind === "walk");
      if (pushMoves.length && (pushes < desiredPushes || !walkMoves.length || rng() < 0.34)) {
        op = pick(rng, pushMoves);
        pushes++;
      } else {
        op = pick(rng, walkMoves);
      }
      reverseOps.push(applyReverse(state, op));
      trace.push(cloneState(state));
      return true;
    };
    for (let i = 0; i < goalSteps; i++) runReverse();
    let guard = 0;
    while ((solveState(state, targets) || pushes < Math.min(desiredPushes, goalSteps / 5)) && guard++ < 80) runReverse();

    const traceCells = new Set();
    trace.forEach(s => {
      traceCells.add(key(s.worker.x, s.worker.y));
      s.crates.forEach(c => traceCells.add(key(c.x, c.y)));
    });
    const free = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (!traceCells.has(key(x, y))) free.push({ x, y });
    }
    const used = new Set();
    const takeFree = () => {
      const choices = free.filter(p => !used.has(key(p.x, p.y)));
      if (!choices.length) return null;
      const p = pick(rng, choices);
      used.add(key(p.x, p.y));
      return p;
    };
    const conveyors = [];
    const gates = [];
    let plate = null;
    let door = null;
    if (index >= 12) {
      for (let i = 0; i < (index >= 18 ? 3 : 2); i++) {
        const p = takeFree();
        if (p) {
          const d = pick(rng, DIRS);
          conveyors.push({ ...p, dx: d.x, dy: d.y });
        }
      }
    }
    if (index >= 18) {
      const p = takeFree();
      if (p) {
        const d = pick(rng, DIRS);
        gates.push({ ...p, dx: d.x, dy: d.y });
      }
    }
    if (index >= 24) {
      plate = takeFree();
      door = takeFree();
    }
    const walls = new Set();
    const wallCount = Math.min(free.length - used.size, index < 6 ? 1 : 2 + stage);
    for (let i = 0; i < wallCount; i++) {
      const p = takeFree();
      if (p) walls.add(key(p.x, p.y));
    }
    if (reverseOps.length < Math.max(16, Math.floor(goalSteps * .75)) && seedBump < 20) return makeLevel(index, seedBump + 1);
    const mechanics = index < 6 ? "PUSH ROUTE" : index < 12 ? "DUAL CORE" : index < 18 ? "COLOR SORT" : index < 24 ? "FLOW GATES" : "LOCK SEQUENCE";
    return {
      w, h, targets, worker: state.worker, crates: state.crates, walls, conveyors, gates, plate, door,
      par: reverseOps.length, mechanics, proof: reverseOps.length > 0
    };
  }
  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (saved && Array.isArray(saved.stars)) return {
        unlocked: Math.max(0, saved.unlocked | 0),
        stars: saved.stars.slice(0, 30).map(n => Math.max(0, Math.min(3, n | 0))),
        best: Array.isArray(saved.best) ? saved.best.slice(0, 30).map(n => n > 0 ? n | 0 : 0) : []
      };
    } catch (_) {}
    return { unlocked: 0, stars: [], best: [] };
  }
  function saveProgress() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch (_) {}
  }
  function startLevel(index) {
    levelIndex = Math.max(0, Math.min(levels.length - 1, index));
    const l = levels[levelIndex];
    play = { worker: clonePoint(l.worker), crates: cloneCrates(l.crates), history: [], moves: 0, won: false, stars: 0 };
    mode = "game";
    pointer = null; elapsed = 0; shake = 0; pulse = 0;
    particles = [];
  }
  function openLevels() { mode = "select"; pointer = null; }
  function resetLevel() {
    startLevel(levelIndex);
    burstAt(195, 340, "#8ba5bb", 9);
  }
  function undo() {
    if (!play || !play.history.length) return;
    const previous = play.history.pop();
    play.worker = previous.worker;
    play.crates = previous.crates;
    play.moves = previous.moves;
    play.won = false;
    play.stars = 0;
    shake = 0;
    pulse = .2;
  }
  function isDoorOpen() {
    const l = levels[levelIndex];
    if (!l.door || !l.plate) return true;
    return hasCrate(play.crates, l.plate.x, l.plate.y);
  }
  function gateAt(x, y) { return levels[levelIndex].gates.find(g => g.x === x && g.y === y); }
  function conveyorAt(x, y) { return levels[levelIndex].conveyors.find(c => c.x === x && c.y === y); }
  function canEnter(from, to) {
    const l = levels[levelIndex];
    if (!insideRoom(to.x, to.y, l.w, l.h) || l.walls.has(key(to.x, to.y))) return false;
    if (l.door && l.door.x === to.x && l.door.y === to.y && !isDoorOpen()) return false;
    const gate = gateAt(to.x, to.y);
    if (gate && (to.x - from.x !== gate.dx || to.y - from.y !== gate.dy)) return false;
    return true;
  }
  function resolveConveyor() {
    const l = levels[levelIndex];
    for (let n = 0; n < 6; n++) {
      const belt = conveyorAt(play.worker.x, play.worker.y);
      if (!belt) break;
      const next = { x: play.worker.x + belt.dx, y: play.worker.y + belt.dy };
      if (!canEnter(play.worker, next)) break;
      const crate = getCrate(play.crates, next.x, next.y);
      if (crate >= 0) {
        const beyond = { x: next.x + belt.dx, y: next.y + belt.dy };
        if (getCrate(play.crates, beyond.x, beyond.y) >= 0 || !canEnter(next, beyond)) break;
        play.crates[crate].x = beyond.x;
        play.crates[crate].y = beyond.y;
      }
      play.worker = next;
      burstAt(cellCenter(next.x, next.y).x, cellCenter(next.x, next.y).y, "#9cecff", 2);
    }
  }
  function tryMove(dx, dy) {
    if (mode !== "game" || !play || play.won) return;
    const from = clonePoint(play.worker);
    const next = { x: from.x + dx, y: from.y + dy };
    if (!canEnter(from, next)) { shake = .08; return; }
    const crate = getCrate(play.crates, next.x, next.y);
    if (crate >= 0) {
      const beyond = { x: next.x + dx, y: next.y + dy };
      if (getCrate(play.crates, beyond.x, beyond.y) >= 0 || !canEnter(next, beyond)) { shake = .08; return; }
      play.history.push({ worker: clonePoint(play.worker), crates: cloneCrates(play.crates), moves: play.moves }); if (play.history.length > 120) play.history.shift();
      play.crates[crate].x = beyond.x;
      play.crates[crate].y = beyond.y;
      play.worker = next;
    } else {
      play.history.push({ worker: clonePoint(play.worker), crates: cloneCrates(play.crates), moves: play.moves }); if (play.history.length > 120) play.history.shift();
      play.worker = next;
    }
    play.moves++;
    resolveConveyor();
    const c = cellCenter(play.worker.x, play.worker.y);
    burstAt(c.x, c.y, crate >= 0 ? COLORS[play.crates[crate].color].glow : "#9cecff", crate >= 0 ? 7 : 3);
    pulse = .35;
    if (solveState(play, levels[levelIndex].targets)) winLevel();
  }
  function winLevel() {
    play.won = true;
    play.stars = play.moves <= levels[levelIndex].par ? 3 : play.moves <= Math.ceil(levels[levelIndex].par * 1.3) ? 2 : 1;
    progress.stars[levelIndex] = Math.max(progress.stars[levelIndex] || 0, play.stars);
    progress.best[levelIndex] = progress.best[levelIndex] ? Math.min(progress.best[levelIndex], play.moves) : play.moves;
    progress.unlocked = Math.max(progress.unlocked || 0, Math.min(levels.length - 1, levelIndex + 1));
    saveProgress();
    const c = cellCenter(play.worker.x, play.worker.y);
    burstAt(c.x, c.y, "#ffe19a", 26);
    shake = .35;
  }
  function burstAt(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const speed = 18 + Math.random() * 62;
      particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 12, life: .35 + Math.random() * .45, max: .75, color, size: 1.5 + Math.random() * 3 });
    }
  }
  function update(dt) {
    if (window.innerWidth > window.innerHeight && window.innerHeight <= 620) return;
    elapsed += dt;
    pulse = Math.max(0, pulse - dt);
    shake = Math.max(0, shake - dt * 1.8);
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 88 * dt; }
    particles = particles.filter(p => p.life > 0);
  }
  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const rawDpr = Math.min(window.devicePixelRatio || 1, 2);
    const dpr = Math.min(rawDpr, Math.max(.5, 960 / Math.max(width, height)));
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    view.dpr = dpr;
    view.scale = Math.min(width / VW, height / VH);
    view.ox = (width - VW * view.scale) / 2;
    view.oy = (height - VH * view.scale) / 2;
  }
  function logicalPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.ox) / view.scale, y: (e.clientY - r.top - view.oy) / view.scale };
  }
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function text(value, x, y, size, color, align = "left", weight = 700) {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillStyle = color; ctx.fillText(value, x, y);
  }
  function line(x1, y1, x2, y2, color, width = 1) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, "#0c1723"); g.addColorStop(.55, "#09111b"); g.addColorStop(1, "#070c13");
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = .16;
    for (let x = 10; x < VW; x += 20) line(x, 0, x, VH, "#1f3947");
    for (let y = 8; y < VH; y += 20) line(0, y, VW, y, "#1f3947");
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#142431"; ctx.fillRect(0, 69, VW, 1); ctx.fillRect(0, VH - 113, VW, 1);
  }
  function drawHeader() {
    text("FORGELOCK", 22, 25, 18, "#f2f7fd", "left", 900);
    text("PUSH-BLOCK FABRICATION", 23, 47, 8, "#5d93a8", "left", 800);
    if (mode === "game") {
      const l = levels[levelIndex];
      text(`LEVEL ${String(levelIndex + 1).padStart(2, "0")}`, 198, 22, 11, "#dbe7ef", "left", 800);
      text(l.mechanics, 198, 43, 8, "#67b3c9", "left", 800);
      button(300, 13, 72, 33, "RESET", "#172a37", "#7dd9ee", 10);
    } else {
      button(300, 13, 72, 33, "PLAY", "#172a37", "#7dd9ee", 10);
    }
  }
  function button(x, y, w, h, label, fill, accent, size = 11, disabled = false) {
    ctx.save();
    ctx.shadowColor = disabled ? "transparent" : "rgba(0,0,0,.25)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    roundRect(x, y, w, h, 9); ctx.fillStyle = disabled ? "#131b23" : fill; ctx.fill(); ctx.shadowColor = "transparent";
    ctx.strokeStyle = disabled ? "#202c37" : accent; ctx.lineWidth = 1; ctx.stroke();
    text(label, x + w / 2, y + h / 2 + 1, size, disabled ? "#53616c" : accent, "center", 900);
    ctx.restore();
  }
  function boardMetrics(l) {
    const cell = Math.min(46, (VW - 38) / l.w, 392 / l.h);
    return { cell, x: (VW - l.w * cell) / 2, y: 104 + (392 - l.h * cell) / 2 };
  }
  function cellCenter(x, y) {
    const m = boardMetrics(levels[levelIndex]);
    return { x: m.x + (x + .5) * m.cell, y: m.y + (y + .5) * m.cell };
  }
  function tileRect(m, x, y, inset = 2) {
    return { x: m.x + x * m.cell + inset, y: m.y + y * m.cell + inset, w: m.cell - inset * 2, h: m.cell - inset * 2 };
  }
  function drawBoard() {
    const l = levels[levelIndex];
    const m = boardMetrics(l);
    const shakeX = shake ? (Math.random() - .5) * shake * 9 : 0;
    const shakeY = shake ? (Math.random() - .5) * shake * 7 : 0;
    ctx.save(); ctx.translate(shakeX, shakeY);
    roundRect(m.x - 12, m.y - 12, l.w * m.cell + 24, l.h * m.cell + 24, 17);
    ctx.fillStyle = "#0d1a25"; ctx.fill(); ctx.strokeStyle = "#203b48"; ctx.lineWidth = 1; ctx.stroke();
    for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
      const r = tileRect(m, x, y, 2);
      if (x === 0 || y === 0 || x === l.w - 1 || y === l.h - 1 || l.walls.has(key(x, y))) {
        roundRect(r.x, r.y, r.w, r.h, 5); ctx.fillStyle = "#111b25"; ctx.fill();
        ctx.save(); ctx.clip();
        for (let q = -r.h; q < r.w + r.h; q += 9) line(r.x + q, r.y + r.h, r.x + q + r.h, r.y, "#213541", 2);
        ctx.restore();
        continue;
      }
      roundRect(r.x, r.y, r.w, r.h, 5); ctx.fillStyle = ((x + y) % 2) ? "#1a2a34" : "#1b2d38"; ctx.fill();
      ctx.strokeStyle = "#284451"; ctx.lineWidth = 1; ctx.stroke();
    }
    for (const b of l.conveyors) drawConveyor(m, b);
    for (const g of l.gates) drawGate(m, g);
    if (l.plate) drawPlate(m, l.plate, isDoorOpen());
    if (l.door) drawDoor(m, l.door, isDoorOpen());
    for (const t of l.targets) drawTarget(m, t);
    for (const c of play.crates) drawCrate(m, c);
    drawWorker(m, play.worker);
    ctx.restore();
  }
  function drawConveyor(m, b) {
    const r = tileRect(m, b.x, b.y, 4);
    ctx.save(); roundRect(r.x, r.y, r.w, r.h, 4); ctx.clip();
    ctx.fillStyle = "#1d4a59"; ctx.fill();
    const shift = (elapsed * 28) % 18;
    ctx.strokeStyle = "#57d3e2"; ctx.lineWidth = 2; ctx.globalAlpha = .75;
    for (let p = -30 + shift; p < r.w + r.h; p += 18) {
      ctx.beginPath();
      if (b.dx !== 0) { const x = b.dx > 0 ? r.x + p : r.x + r.w - p; ctx.moveTo(x, r.y + 7); ctx.lineTo(x + (b.dx > 0 ? 5 : -5), r.y + r.h / 2); ctx.lineTo(x, r.y + r.h - 7); }
      else { const y = b.dy > 0 ? r.y + p : r.y + r.h - p; ctx.moveTo(r.x + 7, y); ctx.lineTo(r.x + r.w / 2, y + (b.dy > 0 ? 5 : -5)); ctx.lineTo(r.x + r.w - 7, y); }
      ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function drawGate(m, g) {
    const r = tileRect(m, g.x, g.y, 5);
    roundRect(r.x, r.y, r.w, r.h, 4); ctx.fillStyle = "#542e50"; ctx.fill(); ctx.strokeStyle = "#e36ca6"; ctx.lineWidth = 1; ctx.stroke();
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.strokeStyle = "#ff9cc5"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - g.dx * 7 - g.dy * 5, cy - g.dy * 7 + g.dx * 5); ctx.lineTo(cx + g.dx * 7 + g.dy * 5, cy + g.dy * 7 - g.dx * 5); ctx.stroke();
    text("›", cx + g.dx * 5, cy + g.dy * 5, 15, "#ffbfd7", "center", 900);
  }
  function drawPlate(m, p, active) {
    const r = tileRect(m, p.x, p.y, 7);
    roundRect(r.x, r.y, r.w, r.h, 4); ctx.fillStyle = active ? "#5b5430" : "#303840"; ctx.fill(); ctx.strokeStyle = active ? "#ffdc73" : "#71818b"; ctx.lineWidth = 2; ctx.stroke();
    line(r.x + 7, r.y + r.h / 2, r.x + r.w - 7, r.y + r.h / 2, active ? "#ffe69a" : "#687782", 2);
  }
  function drawDoor(m, p, open) {
    const r = tileRect(m, p.x, p.y, 4);
    roundRect(r.x, r.y, r.w, r.h, 4); ctx.fillStyle = open ? "#31513e" : "#49243e"; ctx.fill(); ctx.strokeStyle = open ? "#8de68c" : "#ff78ae"; ctx.lineWidth = 2; ctx.stroke();
    if (!open) { for (let x = r.x + 5; x < r.x + r.w; x += 9) line(x, r.y + 4, x, r.y + r.h - 4, "#d95087", 2); }
    text(open ? "✓" : "×", r.x + r.w / 2, r.y + r.h / 2, 15, open ? "#c6ffc3" : "#ffabc9", "center", 900);
  }
  function drawTarget(m, t) {
    const c = COLORS[t.color]; const center = { x: m.x + (t.x + .5) * m.cell, y: m.y + (t.y + .5) * m.cell };
    const rad = m.cell * .31;
    ctx.save(); ctx.globalAlpha = .28 + pulse * .35; ctx.shadowColor = c.glow; ctx.shadowBlur = 12;
    ctx.strokeStyle = c.main; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(center.x, center.y, rad, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.globalAlpha = .8; ctx.fillStyle = c.deep; ctx.beginPath(); ctx.arc(center.x, center.y, rad * .5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = c.glow; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(center.x, center.y, rad * .68, -Math.PI * .75, Math.PI * .25); ctx.stroke();
    ctx.restore();
  }
  function drawCrate(m, c) {
    const p = { x: m.x + c.x * m.cell + 5, y: m.y + c.y * m.cell + 5 };
    const size = m.cell - 10; const palette = COLORS[c.color];
    ctx.save(); ctx.shadowColor = palette.main; ctx.shadowBlur = 9; roundRect(p.x, p.y, size, size, 7); ctx.fillStyle = palette.deep; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = palette.glow; ctx.lineWidth = 2; ctx.stroke();
    line(p.x + 6, p.y + size - 6, p.x + size - 6, p.y + 6, palette.main, 1.4);
    line(p.x + 6, p.y + 6, p.x + size - 6, p.y + size - 6, palette.main, 1.4);
    ctx.fillStyle = palette.main; ctx.beginPath(); ctx.arc(p.x + size / 2, p.y + size / 2, 3.2, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawWorker(m, p) {
    const c = { x: m.x + (p.x + .5) * m.cell, y: m.y + (p.y + .5) * m.cell };
    const r = m.cell * .28;
    ctx.save(); ctx.shadowColor = "#8be5ff"; ctx.shadowBlur = 10; ctx.fillStyle = "#d9f8ff"; ctx.beginPath(); ctx.arc(c.x, c.y + 2, r, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#267e9b"; ctx.beginPath(); ctx.arc(c.x, c.y - r * .35, r * 1.05, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = "#10364a"; ctx.beginPath(); ctx.arc(c.x - r * .32, c.y + 1, 2, 0, TAU); ctx.arc(c.x + r * .32, c.y + 1, 2, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawParticles() {
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function drawGameFooter() {
    const l = levels[levelIndex];
    text("SWIPE TO PUSH  •  Z UNDO", VW / 2, 535, 10, "#75a9b7", "center", 800);
    text(`${play.moves} MOVES`, 24, 557, 11, "#dbeaf0", "left", 850);
    text(`PAR ${l.par}`, 24, 577, 9, "#658390", "left", 800);
    button(24, 600, 158, 54, "↶  UNDO", "#172c39", "#89dff0", 13, !play.history.length);
    button(208, 600, 158, 54, "LEVEL GRID", "#172531", "#83b9c8", 11);
  }
  function drawGame() {
    drawHeader();
    drawBoard();
    drawGameFooter();
    drawParticles();
    if (play.won) drawWinModal();
  }
  function drawWinModal() {
    ctx.fillStyle = "rgba(5, 10, 16, .72)"; ctx.fillRect(0, 0, VW, VH);
    const x = 28, y = 196, w = 334, h = 286;
    ctx.save(); ctx.shadowColor = "rgba(80, 220, 255, .18)"; ctx.shadowBlur = 25; roundRect(x, y, w, h, 18); ctx.fillStyle = "#122432"; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = "#3f8194"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    text("LINE LOCKED", VW / 2, y + 42, 11, "#8be5ff", "center", 900);
    text("FORGE COMPLETE", VW / 2, y + 76, 25, "#f5fbff", "center", 900);
    text(`${play.moves} MOVES  /  PAR ${levels[levelIndex].par}  /  BEST ${progress.best[levelIndex] || play.moves}`, VW / 2, y + 112, 10, "#91adbb", "center", 800);
    text("★".repeat(play.stars) + "☆".repeat(3 - play.stars), VW / 2, y + 151, 29, "#ffd875", "center", 900);
    button(x + 22, y + 192, 136, 52, "RETRY", "#1a303b", "#8ed9e7", 12);
    button(x + 176, y + 192, 136, 52, levelIndex < levels.length - 1 ? "NEXT →" : "GRID", "#275345", "#a9f29b", 12);
  }
  function selectCardRect(i) {
    const cols = 5; const cardW = 60; const gap = 12; const startX = (VW - (cols * cardW + (cols - 1) * gap)) / 2; const row = Math.floor(i / cols); const col = i % cols;
    return { x: startX + col * (cardW + gap), y: 125 + row * 72, w: cardW, h: 56 };
  }
  function drawSelect() {
    drawHeader();
    text("SELECT A LOCK", 24, 95, 13, "#eff8fb", "left", 900);
    text(`${Math.min(30, (progress.unlocked || 0) + 1)} / 30 OPEN`, 366, 95, 10, "#6c99a5", "right", 800);
    for (let i = 0; i < levels.length; i++) {
      const r = selectCardRect(i); const open = i <= (progress.unlocked || 0); const stars = progress.stars[i] || 0;
      ctx.save(); ctx.shadowColor = open ? "rgba(75, 207, 235, .14)" : "transparent"; ctx.shadowBlur = 10;
      roundRect(r.x, r.y, r.w, r.h, 10); ctx.fillStyle = open ? "#152b38" : "#111a22"; ctx.fill(); ctx.shadowColor = "transparent"; ctx.strokeStyle = open ? "#315967" : "#202b33"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      text(String(i + 1).padStart(2, "0"), r.x + 10, r.y + 19, 15, open ? "#eff9fd" : "#51616c", "left", 900);
      text(open ? "★".repeat(stars) + "☆".repeat(3 - stars) : "LOCK", r.x + r.w / 2, r.y + 40, open ? 10 : 8, open ? "#ffd875" : "#53646d", "center", 800);
      if (i === levelIndex && open) { ctx.strokeStyle = "#82e3f4"; ctx.lineWidth = 2; roundRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 12); ctx.stroke(); }
    }
    text("EVERY LOCK OPENS FROM A SOLVED STATE", VW / 2, 590, 10, "#587d89", "center", 800);
    text("SWIPE • PUSH • ALIGN", VW / 2, 617, 13, "#a7d8df", "center", 900);
    button(24, 640, 342, 42, "BACK TO CURRENT LEVEL", "#172c39", "#83b9c8", 11);
  }
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#091018"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.ox, view.dpr * view.oy);
    drawBackground();
    if (mode === "game") drawGame(); else drawSelect();
  }
  function hit(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function handleClick(p) {
    if (mode === "select") {
    if (hit(p.x, p.y, { x: 296, y: 10, w: 80, h: 48 }) || hit(p.x, p.y, { x: 24, y: 636, w: 342, h: 48 })) { startLevel(levelIndex); return; }
      for (let i = 0; i < levels.length; i++) if (hit(p.x, p.y, selectCardRect(i)) && i <= (progress.unlocked || 0)) { startLevel(i); return; }
      return;
    }
    if (play.won) {
      if (hit(p.x, p.y, { x: 50, y: 388, w: 136, h: 52 })) { resetLevel(); return; }
      if (hit(p.x, p.y, { x: 204, y: 388, w: 136, h: 52 })) { levelIndex < levels.length - 1 ? startLevel(levelIndex + 1) : openLevels(); return; }
      return;
    }
    if (hit(p.x, p.y, { x: 294, y: 10, w: 82, h: 48 })) { resetLevel(); return; }
    if (hit(p.x, p.y, { x: 20, y: 596, w: 168, h: 62 })) { undo(); return; }
    if (hit(p.x, p.y, { x: 202, y: 596, w: 170, h: 62 })) { openLevels(); return; }
  }
  function pointerDown(e) {
    e.preventDefault(); const p = logicalPoint(e); pointer = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y }; canvas.setPointerCapture?.(e.pointerId);
  }
  function pointerUp(e) {
    e.preventDefault(); if (!pointer || pointer.id !== e.pointerId) return; const p = logicalPoint(e); const dx = p.x - pointer.sx; const dy = p.y - pointer.sy; const was = pointer; pointer = null;
    if (mode === "game" && !play.won && (Math.abs(dx) > 24 || Math.abs(dy) > 24) && was.sy > 78 && was.sy < 590) {
      if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 1 : -1, 0); else tryMove(0, dy > 0 ? 1 : -1);
    } else if (Math.abs(dx) < 16 && Math.abs(dy) < 16) handleClick(p);
  }
  function keyDown(e) {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    if (mode === "select") {
      if (k === "escape" || k === "enter" || k === " ") startLevel(levelIndex);
      return;
    }
    if (play.won) {
      if (k === "enter" || k === " ") { levelIndex < levels.length - 1 ? startLevel(levelIndex + 1) : openLevels(); e.preventDefault(); }
      if (k === "escape") openLevels();
      return;
    }
    if (k === "arrowup" || k === "w") tryMove(0, -1);
    else if (k === "arrowdown" || k === "s") tryMove(0, 1);
    else if (k === "arrowleft" || k === "a") tryMove(-1, 0);
    else if (k === "arrowright" || k === "d") tryMove(1, 0);
    else if (k === "z") undo();
    else if (k === "r") resetLevel();
    else if (k === "escape") openLevels();
  }
  function loop(now) {
    const dt = Math.min(.034, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now; update(dt); render(); requestAnimationFrame(loop);
  }

  levels = Array.from({ length: 30 }, (_, i) => makeLevel(i));
  progress.unlocked = Math.min(29, Math.max(0, progress.unlocked || 0));
  startLevel(0);
  resize();
  window.addEventListener("resize", resize, { passive: true });
  canvas.addEventListener("pointerdown", pointerDown, { passive: false });
  canvas.addEventListener("pointerup", pointerUp, { passive: false });
  canvas.addEventListener("pointercancel", e => { if (pointer && pointer.id === e.pointerId) pointer = null; }, { passive: true });
  canvas.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
  window.addEventListener("keydown", keyDown, { passive: false });
  requestAnimationFrame(loop);
})();
