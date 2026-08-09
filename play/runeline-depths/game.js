(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const shell = document.getElementById("gameShell");
  const rotateOverlay = document.getElementById("rotateOverlay");
  const rosterPanel = document.getElementById("rosterPanel");
  const rosterList = document.getElementById("rosterList");
  const teamPicker = document.getElementById("teamPicker");
  const rosterBtn = document.getElementById("rosterBtn");
  const closeRosterBtn = document.getElementById("closeRosterBtn");
  const newRunBtn = document.getElementById("newRunBtn");
  const restartBtn = document.getElementById("restartBtn");
  const muteBtn = document.getElementById("muteBtn");

  const W = 6, H = 5, CELLS = W * H, MAX_PARTICLES = 150, MAX_TEXTS = 14;
  const ORB_COLORS = ["ember", "tide", "moss", "storm", "aether"];
  const PALETTE = { ember: "#ff735f", tide: "#55c7ff", moss: "#72dc83", storm: "#b68cff", aether: "#ffd166" };
  const PALETTE_DARK = { ember: "#7e2b35", tide: "#184c75", moss: "#225c47", storm: "#4d3379", aether: "#73521d" };
  const STARTERS = [
    { id: "trail-ember", name: "Cinderling", element: "ember", hp: 48, atk: 11, skill: "Warm Start · first ember match +30%" },
    { id: "trail-tide", name: "Dewdrift", element: "tide", hp: 58, atk: 8, skill: "Clear Current · tide match heals the team" },
    { id: "trail-moss", name: "Mosskin", element: "moss", hp: 68, atk: 7, skill: "Soft Bark · team takes 12% less damage" },
    { id: "trail-storm", name: "Zipfin", element: "storm", hp: 39, atk: 13, skill: "Quick Spark · 3+ colors adds a combo" }
  ];
  const CREATURES = [
    { id: "cinder-crown", name: "Cinder Crown", element: "ember", hp: 55, atk: 15, skill: "Singe Logic · 2+ colors doubles damage" },
    { id: "brine-bloom", name: "Brine Bloom", element: "tide", hp: 74, atk: 10, skill: "Rain Ledger · tide matches heal 20%" },
    { id: "root-rumbler", name: "Root Rumbler", element: "moss", hp: 92, atk: 9, skill: "Deep Hold · team damage taken −18%" },
    { id: "thunder-mite", name: "Thunder Mite", element: "storm", hp: 48, atk: 18, skill: "Static Count · each combo adds 12%" },
    { id: "veil-vireo", name: "Veil Vireo", element: "aether", hp: 61, atk: 13, skill: "Many-Sight · 3+ colors grants +1 combo" },
    { id: "ash-antler", name: "Ash Antler", element: "ember", hp: 79, atk: 14, skill: "Coalheart · ember matches +45%" },
    { id: "rill-raven", name: "Rill Raven", element: "tide", hp: 63, atk: 16, skill: "Low-Tide Cut · tide damage +55%" },
    { id: "fern-fang", name: "Fern Fang", element: "moss", hp: 81, atk: 15, skill: "Green Echo · 3+ colors restores 8% hp" },
    { id: "gale-gourmand", name: "Gale Gourmand", element: "storm", hp: 67, atk: 17, skill: "Pressure Feast · 4+ combo +35%" },
    { id: "opal-owl", name: "Opal Owl", element: "aether", hp: 73, atk: 12, skill: "Prism Rule · unmatched colors deal 40%" },
    { id: "flare-fawn", name: "Flare Fawn", element: "ember", hp: 70, atk: 19, skill: "Bright Rake · first hit each floor +50%" },
    { id: "moon-marrow", name: "Moon Marrow", element: "aether", hp: 86, atk: 16, skill: "Quiet Math · 2+ colors grants a shield" }
  ];
  const ALL_CREATURES = STARTERS.concat(CREATURES);
  const CREATURE_BY_ID = Object.fromEntries(ALL_CREATURES.map(c => [c.id, c]));
  const FLOOR_NAMES = ["Silt Door", "Lantern Vein", "Murmur Shelf", "Hollow Orchard", "Copper Wound", "Glassroot", "Blue Ember", "The Slow Stair", "Wickwater", "Ash Archive", "Cloud Scar", "Night Reservoir", "The Underbough", "Last Switchback", "Runeline Heart"];
  const GUARDIANS = ["The Pebble Choir", "Mire-Needle", "Old Sparkjaw", "Cask of Vines", "The Copper Hush", "Cradleback", "Aster Moth", "Nine-Knot", "The Drowned Bell", "Soot Regent", "Cloud-Eater", "Vesper Maw", "Root of Noon", "The Long Glint", "The Depth That Listens"];

  const layout = { w: 390, h: 700, dpr: 1, bx: 15, by: 202, cell: 60, boardBottom: 502, enemyY: 559 };
  const board = new Array(CELLS).fill("ember");
  const particles = [], floatTexts = [], path = [], keyHeld = new Set(), actionQueue = [], pendingTimers = new Set();
  const activeControlPointers = new Set();
  let boardPointerId = null, keyboardPath = false, cursor = { r: 2, c: 2 }, keyRepeat = 0;
  let audio = null, muted = false, lastTime = 0, gameTime = 0, shake = 0, flash = 0;
  let mode = "play", floor = 1, bestFloor = 1, moveTimer = 6, resolveTimer = 0, rosterOpen = false, selectedSlot = 0;
  let enemy = null, team = [], roster = [], toast = "", toastTimer = 0, savedWin = false;

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function rand(n) { return Math.floor(Math.random() * n); }
  function cellIndex(r, c) { return r * W + c; }
  function cellRC(i) { return { r: Math.floor(i / W), c: i % W }; }
  function knownId(id) { return typeof id === "string" && Object.prototype.hasOwnProperty.call(CREATURE_BY_ID, id); }
  function safeInt(v, lo, hi, fallback) { return Number.isFinite(v) && Number.isInteger(v) && v >= lo && v <= hi ? v : fallback; }
  function saveData() {
    try {
      const value = { floor, bestFloor, roster: roster.slice(0, 16), team: team.slice(0, 4), savedWin: savedWin === true };
      window.localStorage.setItem("runeline-depths-save-v1", JSON.stringify(value));
    } catch (_) { /* storage is optional */ }
  }
  function loadData() {
    try {
      const raw = window.localStorage.getItem("runeline-depths-save-v1");
      if (typeof raw !== "string" || !raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      const savedRoster = Array.isArray(data.roster) ? data.roster.filter(knownId).slice(0, 16) : [];
      const savedTeam = Array.isArray(data.team) ? data.team.filter(id => knownId(id) && savedRoster.concat(STARTERS.map(c => c.id)).includes(id)).slice(0, 4) : [];
      floor = safeInt(data.floor, 1, 15, 1);
      bestFloor = safeInt(data.bestFloor, 1, 15, floor);
      roster = [...new Set(savedRoster)];
      team = [...new Set(savedTeam)];
      savedWin = data.savedWin === true;
    } catch (_) { floor = 1; bestFloor = 1; roster = []; team = []; savedWin = false; }
  }
  function forgetData() { try { window.localStorage.removeItem("runeline-depths-save-v1"); } catch (_) {} }

  function getCreature(id) { return CREATURE_BY_ID[id] || STARTERS[0]; }
  function resetInput() {
    if (boardPointerId !== null && canvas.releasePointerCapture) { try { canvas.releasePointerCapture(boardPointerId); } catch (_) {} }
    boardPointerId = null;
    keyboardPath = false;
    if (path.length) cancelPath();
    path.length = 0;
    keyHeld.clear();
    actionQueue.length = 0;
    keyRepeat = 0;
    cursor = { r: 2, c: 2 };
    for (const el of activeControlPointers) el.__activePointerId = null;
    activeControlPointers.clear();
    for (const timer of pendingTimers) window.clearTimeout(timer);
    pendingTimers.clear();
  }
  function newRun() {
    resetInput();
    floor = 1; bestFloor = 1; roster = []; team = STARTERS.map(c => c.id); savedWin = false;
    mode = "play"; rosterOpen = false; toast = "The first guardian is listening."; toastTimer = 2.7;
    closeRoster(); startFloor(); saveData();
  }
  function retryFloor() {
    const wasWin = mode === "win";
    resetInput();
    if (wasWin) { savedWin = false; saveData(); }
    mode = "play"; toast = "The runeline gives you another line."; toastTimer = 2.2;
    closeRoster(); startFloor();
  }
  function startFloor() {
    moveTimer = 6; resolveTimer = 0; shake = 0; flash = 0;
    team = team.length === 4 ? team : STARTERS.map(c => c.id);
    team = team.map(id => knownId(id) ? id : STARTERS[0].id);
    for (const id of team) { const c = getCreature(id); c._hp = c.hp; }
    enemy = { name: GUARDIANS[floor - 1], hp: 92 + floor * 31, maxHp: 92 + floor * 31, atk: 10 + floor * 2, pulse: 0 };
    for (let i = 0; i < CELLS; i++) board[i] = ORB_COLORS[rand(ORB_COLORS.length)];
    for (let tries = 0; tries < 20 && findLineMatches().size; tries++) for (let i = 0; i < CELLS; i++) board[i] = ORB_COLORS[rand(ORB_COLORS.length)];
    updateButtons();
  }
  function openRoster() { if (mode === "play" || mode === "fail" || mode === "win") { resetInput(); rosterOpen = true; rosterPanel.classList.remove("hidden"); renderRoster(); } }
  function closeRoster() { if (rosterOpen) resetInput(); rosterOpen = false; rosterPanel.classList.add("hidden"); }
  function toggleRoster() { rosterOpen ? closeRoster() : openRoster(); }

  function unlockAudio() {
    if (audio) { if (audio.state === "suspended") audio.resume().catch(() => {}); return; }
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { audio = null; }
  }
  function tone(freq, duration, type = "sine", gain = .035) {
    if (muted || !audio) return;
    try {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(gain, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration); o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + duration);
    } catch (_) {}
  }
  function toggleMute() { muted = !muted; muteBtn.textContent = muted ? "QUIET" : "SOUND"; unlockAudio(); if (!muted) tone(500, .1, "triangle", .04); }

  function boardPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function pointCell(x, y) {
    const c = Math.floor((x - layout.bx) / layout.cell), r = Math.floor((y - layout.by) / layout.cell);
    return r >= 0 && r < H && c >= 0 && c < W ? { r, c } : null;
  }
  function adjacent(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1; }
  function pathHas(r, c) { return path.some(p => p.r === r && p.c === c); }
  function swapCells(a, b) { const ai = cellIndex(a.r, a.c), bi = cellIndex(b.r, b.c); [board[ai], board[bi]] = [board[bi], board[ai]]; }
  function beginPath(cell, fromKeyboard = false) {
    if (mode !== "play" || rosterOpen || !cell) return;
    path.length = 0; path.push({ r: cell.r, c: cell.c }); keyboardPath = fromKeyboard; tone(220, .05, "sine", .022);
  }
  function extendPath(cell) {
    if (!path.length || !cell || mode !== "play") return;
    const last = path[path.length - 1];
    if (last.r === cell.r && last.c === cell.c) return;
    if (path.length > 1 && path[path.length - 2].r === cell.r && path[path.length - 2].c === cell.c) { swapCells(last, cell); path.pop(); tone(180, .035, "sine", .015); return; }
    if (pathHas(cell.r, cell.c) || !adjacent(last, cell) || path.length >= 30) return;
    swapCells(last, cell); path.push({ r: cell.r, c: cell.c }); tone(260 + path.length * 8, .025, "triangle", .012);
  }
  function cancelPath() { if (path.length) { for (let i = path.length - 1; i > 0; i--) swapCells(path[i], path[i - 1]); } path.length = 0; keyboardPath = false; }
  function finishPointerPath() { if (boardPointerId !== null) boardPointerId = null; if (path.length) finishPath(); }
  function finishPath() {
    if (!path.length) return;
    if (path.length < 3) { cancelPath(); moveTimer = 6; toast = "Trace three neighboring orbs."; toastTimer = 1.5; return; }
    const chosen = path.map(p => ({ r: p.r, c: p.c })); path.length = 0; keyboardPath = false; resolveMove(chosen);
  }
  function keyboardMove(dr, dc) {
    if (mode !== "play" || rosterOpen) return;
    if (!keyboardPath) beginPath(cursor, true);
    const next = { r: clamp(cursor.r + dr, 0, H - 1), c: clamp(cursor.c + dc, 0, W - 1) };
    if (next.r === cursor.r && next.c === cursor.c) return;
    const before = path.length; extendPath(next); if (path.length !== before) cursor = next;
  }
  function enqueueAction(action) { if (actionQueue.length < 12) actionQueue.push(action); }
  function runQueuedAction() { const a = actionQueue.shift(); if (a) keyboardMove(a.dr, a.dc); }

  function findLineMatches() {
    const out = new Set();
    for (let r = 0; r < H; r++) for (let c = 0; c < W;) {
      const color = board[cellIndex(r, c)], start = c; while (c < W && board[cellIndex(r, c)] === color) c++;
      if (color && c - start >= 3) for (let x = start; x < c; x++) out.add(cellIndex(r, x));
    }
    for (let c = 0; c < W; c++) for (let r = 0; r < H;) {
      const color = board[cellIndex(r, c)], start = r; while (r < H && board[cellIndex(r, c)] === color) r++;
      if (color && r - start >= 3) for (let y = start; y < r; y++) out.add(cellIndex(y, c));
    }
    return out;
  }
  function refill(matches) {
    for (let c = 0; c < W; c++) {
      const keep = [];
      for (let r = H - 1; r >= 0; r--) if (!matches.has(cellIndex(r, c))) keep.push(board[cellIndex(r, c)]);
      for (let r = H - 1, k = 0; r >= 0; r--, k++) board[cellIndex(r, c)] = k < keep.length ? keep[k] : ORB_COLORS[rand(ORB_COLORS.length)];
    }
  }
  function resolveMove(chosen) {
    if (mode !== "play") return;
    moveTimer = 6; const colors = new Set(chosen.map(p => board[cellIndex(p.r, p.c)]));
    let matches = new Set(chosen.map(p => cellIndex(p.r, p.c))), cascades = 0;
    for (const i of matches) board[i] = null;
    refill(matches); cascades++;
    while (cascades < 5) { const extra = findLineMatches(); if (!extra.size) break; for (const i of extra) { matches.add(i); board[i] = null; } refill(extra); cascades++; }
    const colorCount = colors.size, combo = cascades + Math.max(0, colorCount - 1);
    const leader = getCreature(team[0]), active = team.map(getCreature);
    let damage = active.reduce((sum, c) => sum + c.atk * (colors.has(c.element) ? 1.22 : .58), 0);
    damage *= 1 + Math.max(0, combo - 1) * .16;
    if (leader.id === "cinder-crown" && colorCount >= 2) damage *= 2;
    if (leader.id === "gale-gourmand" && combo >= 4) damage *= 1.35;
    if (leader.id === "flare-fawn" && enemy.hp === enemy.maxHp) damage *= 1.5;
    if (leader.id === "ash-antler" && colors.has("ember")) damage *= 1.45;
    if (leader.id === "rill-raven" && colors.has("tide")) damage *= 1.55;
    enemy.hp = Math.max(0, enemy.hp - damage);
    const center = { x: layout.bx + layout.cell * 3, y: layout.by + layout.cell * 2.5 };
    burst(center.x, center.y, [...colors][0] || "aether", Math.min(28, 8 + matches.size));
    floatTexts.unshift({ x: center.x, y: center.y - 18, text: Math.round(damage) + " DMG", color: "#fff0a6", life: 1.15 });
    if (floatTexts.length > MAX_TEXTS) floatTexts.length = MAX_TEXTS;
    shake = Math.min(12, 3 + combo * 1.8); flash = .14; tone(330 + combo * 55, .14, "triangle", .05);
    if (colors.has("tide") && active.some(c => c.id === "trail-tide" || c.id === "brine-bloom")) healTeam(.18);
    if (leader.id === "fern-fang" && colorCount >= 3) healTeam(.08);
    if (enemy.hp <= 0) { mode = "resolve"; resolveTimer = .55; toast = "Guardian broken — the depth opens."; toastTimer = 2.6; return; }
    enemyAttack(active);
    if (mode === "play") { mode = "resolve"; resolveTimer = .42; } else updateButtons();
  }
  function healTeam(amount) { activeHpChange(amount); }
  function activeHpChange(amount) { for (const id of team) { const c = getCreature(id); const hp = c._hp == null ? c.hp : c._hp; c._hp = hp > 0 ? clamp(hp + c.hp * amount, 0, c.hp) : 0; } }
  function enemyAttack(active) {
    const living = active.filter(c => (c._hp == null ? c.hp : c._hp) > 0);
    if (!living.length) return;
    let reduction = active.some(c => c.id === "trail-moss") ? .88 : 1;
    if (active.some(c => c.id === "root-rumbler")) reduction *= .82;
    const hit = (enemy.atk * (1 + floor * .035) * reduction) / living.length;
    for (const c of living) c._hp = Math.max(0, (c._hp == null ? c.hp : c._hp) - hit);
    enemy.pulse = .28; shake = Math.max(shake, 7); flash = .1; tone(100, .16, "sawtooth", .028);
    if (!active.some(c => (c._hp == null ? c.hp : c._hp) > 0)) { mode = "fail"; toast = "The team fades, but the floor remains."; toastTimer = 2.5; updateButtons(); }
  }
  function completeFloor() {
    const found = floor <= 12 ? CREATURES[floor - 1] : null;
    if (found && !roster.includes(found.id)) { roster.push(found.id); toast = found.name + " joined the roster."; toastTimer = 3.1; burst(layout.bx + layout.cell * 3, layout.enemyY, found.element, 34); }
    bestFloor = Math.max(bestFloor, floor); saveData();
    if (floor >= 15) { mode = "win"; savedWin = true; saveData(); toast = "Runeline Heart reached."; toastTimer = 4; tone(760, .3, "triangle", .06); updateButtons(); return; }
    floor++; bestFloor = Math.max(bestFloor, floor); saveData(); startFloor(); mode = "play"; updateButtons();
  }
  function advanceResolve(dt) {
    resolveTimer -= dt;
    if (resolveTimer > 0) return;
    if (mode === "resolve") { if (enemy.hp <= 0) completeFloor(); else { mode = "play"; updateButtons(); } }
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 100;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .35 + Math.random() * .55, max: .9, color, size: 2 + Math.random() * 4 });
    }
  }
  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy = p.vy * .97 + 35 * dt; if (p.life <= 0) particles.splice(i, 1); }
    for (let i = floatTexts.length - 1; i >= 0; i--) { const t = floatTexts[i]; t.life -= dt; t.y -= 24 * dt; if (t.life <= 0) floatTexts.splice(i, 1); }
    shake = Math.max(0, shake - dt * 24); flash = Math.max(0, flash - dt);
    if (toastTimer > 0) toastTimer -= dt;
  }
  function update(dt) {
    if (document.hidden || orientationVisible() || rosterOpen) return;
    gameTime += dt;
    updateEffects(dt);
    if (mode === "resolve") { advanceResolve(dt); return; }
    if (mode !== "play") return;
    while (actionQueue.length) runQueuedAction();
    if (enemy) enemy.pulse = Math.max(0, enemy.pulse - dt);
    moveTimer -= dt; if (moveTimer <= 0) { moveTimer = 6; cancelPath(); toast = "Time reset — trace a line."; toastTimer = 1.4; enemyAttack(team.map(getCreature)); }
    if (moveTimer <= 0) moveTimer = 6;
    if (keyHeld.size) { keyRepeat -= dt; if (keyRepeat <= 0) { keyRepeat = .12; for (const k of keyHeld) { const d = ({ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]})[k]; if (d) enqueueAction({ dr: d[0], dc: d[1] }); } } }
  }
  function orientationVisible() { return window.innerWidth > window.innerHeight; }
  function resize() {
    layout.w = window.innerWidth; layout.h = window.innerHeight;
    const longest = Math.max(layout.w, layout.h), dpr = Math.min(window.devicePixelRatio || 1, 2, 960 / Math.max(1, longest)); layout.dpr = dpr;
    canvas.width = Math.max(1, Math.round(layout.w * layout.dpr)); canvas.height = Math.max(1, Math.round(layout.h * layout.dpr)); ctx.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0);
    layout.cell = Math.min((layout.w - 24) / 6, 62); layout.bx = (layout.w - layout.cell * 6) / 2; layout.by = Math.max(158, Math.min(202, layout.h - 480)); layout.boardBottom = layout.by + layout.cell * 5; layout.enemyY = layout.boardBottom + 56;
    const visible = orientationVisible(); rotateOverlay.classList.toggle("hidden", !visible); if (visible) resetInput();
  }

  function roundedRect(x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } }
  function text(s, x, y, size, color, align = "left", weight = 600) { ctx.font = weight + " " + size + "px ui-sans-serif,system-ui,sans-serif"; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, layout.h); g.addColorStop(0, "#0b1224"); g.addColorStop(.55, "#111a2e"); g.addColorStop(1, "#090d18"); ctx.fillStyle = g; ctx.fillRect(0, 0, layout.w, layout.h);
    ctx.globalAlpha = .12; for (let i = 0; i < 18; i++) { const x = (i * 91 + floor * 19) % layout.w, y = (i * 47 + floor * 31) % layout.h; ctx.fillStyle = i % 2 ? PALETTE.tide : PALETTE.aether; ctx.beginPath(); ctx.arc(x, y, 1 + i % 3, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(89,228,219,.11)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(18, 74); ctx.lineTo(layout.w - 18, 74); ctx.stroke();
  }
  function drawHud() {
    text("RUNELINE DEPTHS", 17, 24, 13, "#f5f2e9", "left", 900); text("P32 / PORTRAIT DESCENT", 17, 46, 9, "#71809c", "left", 800);
    text("FLOOR " + String(floor).padStart(2, "0"), 17, 90, 12, "#ffd166", "left", 900); text(FLOOR_NAMES[floor - 1], 17, 111, 11, "#aeb8ce", "left", 700);
    const timerColor = moveTimer < 1.5 ? "#ff735f" : "#59e4db"; text(moveTimer.toFixed(1), layout.w - 18, 93, 25, timerColor, "right", 900); text("LINE TIMER", layout.w - 18, 113, 8, "#8490ab", "right", 900);
    const hint = keyboardPath ? "ARROWS: extend line  •  SPACE: strike" : "DRAG: follow neighbors  •  SPACE: strike"; text(hint, layout.w / 2, layout.by - 22, 10, "#aeb8ce", "center", 700);
  }
  function drawTeam() {
    const top = 128, gap = 7, w = (layout.w - 34 - gap * 3) / 4;
    team.forEach((id, i) => { const c = getCreature(id), x = 17 + i * (w + gap), hp = clamp((c._hp == null ? c.hp : c._hp) / c.hp, 0, 1); roundedRect(x, top, w, 38, 10, "rgba(18,27,48,.94)", i === 0 ? "rgba(255,209,102,.65)" : "rgba(226,232,255,.12)"); ctx.fillStyle = PALETTE[c.element]; ctx.beginPath(); ctx.arc(x + 13, top + 13, 6, 0, Math.PI * 2); ctx.fill(); text(c.name, x + 24, top + 12, 9, "#e7ebf5", "left", 900); text("" + Math.ceil(Math.max(0, c._hp == null ? c.hp : c._hp)), x + w - 8, top + 12, 9, hp < .35 ? "#ff735f" : "#b8c7d8", "right", 800); roundedRect(x + 8, top + 26, w - 16, 4, 2, "#27334d"); roundedRect(x + 8, top + 26, (w - 16) * hp, 4, 2, PALETTE[c.element]); });
  }
  function drawOrb(i, selected) {
    const { r, c } = cellRC(i), x = layout.bx + c * layout.cell + layout.cell / 2, y = layout.by + r * layout.cell + layout.cell / 2, color = board[i];
    const fill = PALETTE[color] || "#293651"; const dark = PALETTE_DARK[color] || "#182039";
    roundedRect(layout.bx + c * layout.cell + 3, layout.by + r * layout.cell + 3, layout.cell - 6, layout.cell - 6, 14, "rgba(14,22,39,.85)", selected ? fill : "rgba(226,232,255,.1)");
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, y + 2, layout.cell * .28, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, layout.cell * .22, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = .7; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x - layout.cell * .08, y - layout.cell * .09, layout.cell * .06, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  function drawBoard() {
    roundedRect(layout.bx - 4, layout.by - 4, layout.cell * 6 + 8, layout.cell * 5 + 8, 19, "rgba(6,11,23,.66)", "rgba(89,228,219,.13)");
    for (let i = 0; i < CELLS; i++) drawOrb(i, pathHas(Math.floor(i / W), i % W));
    if (path.length) { ctx.lineWidth = Math.max(3, layout.cell * .095); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(255,239,167,.9)"; ctx.beginPath(); path.forEach((p, n) => { const x = layout.bx + p.c * layout.cell + layout.cell / 2, y = layout.by + p.r * layout.cell + layout.cell / 2; n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); path.forEach((p, n) => { const x = layout.bx + p.c * layout.cell + layout.cell / 2, y = layout.by + p.r * layout.cell + layout.cell / 2; ctx.fillStyle = "#fff1a6"; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); text("" + (n + 1), x, y - 1, 9, "#17213b", "center", 900); }); }
    if (!path.length && mode === "play") { const x = layout.bx + cursor.c * layout.cell + layout.cell / 2, y = layout.by + cursor.r * layout.cell + layout.cell / 2; ctx.strokeStyle = "rgba(255,209,102,.6)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, layout.cell * .38, 0, Math.PI * 2); ctx.stroke(); }
  }
  function drawEnemy() {
    const x = layout.w / 2, y = layout.enemyY; if (!enemy) return;
    text("GUARDIAN", x, y - 32, 9, "#8490ab", "center", 900); text(enemy.name, x, y - 14, 16, "#f5f2e9", "center", 900);
    const hp = clamp(enemy.hp / enemy.maxHp, 0, 1), barW = Math.min(290, layout.w - 68); roundedRect(x - barW / 2, y + 4, barW, 14, 7, "#252d46"); roundedRect(x - barW / 2, y + 4, barW * hp, 14, 7, enemy.pulse ? "#ff735f" : "#c05c94"); text(Math.ceil(enemy.hp) + " / " + enemy.maxHp, x, y + 11, 9, "#fff", "center", 900);
    ctx.fillStyle = enemy.pulse ? "#ff735f" : "#8c4d8c"; ctx.globalAlpha = .2; ctx.beginPath(); ctx.arc(x, y + 54, 32 + Math.sin(gameTime * 3.8) * 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = enemy.pulse ? "#ff8877" : "#d788b4"; ctx.beginPath(); ctx.arc(x, y + 54, 22, 0, Math.PI * 2); ctx.fill(); text("◆", x, y + 54, 18, "#542d5c", "center", 900);
  }
  function drawFooter() {
    const y = Math.min(layout.h - 100, layout.enemyY + 90); text("MATCH 3+ • CASCADES CHARGE THE TEAM", layout.w / 2, y, 9, "#71809c", "center", 800); if (toastTimer > 0 && toast) { roundedRect(18, y + 13, layout.w - 36, 29, 12, "rgba(13,19,35,.9)", "rgba(89,228,219,.22)"); text(toast, layout.w / 2, y + 27, 10, "#e6ebf6", "center", 800); }
    if (mode === "fail" || mode === "win") { const title = mode === "win" ? "THE HEART ANSWERS" : "THE LINE GOES QUIET"; text(title, layout.w / 2, layout.h * .72, 22, mode === "win" ? "#ffd166" : "#ff9b88", "center", 900); text(mode === "win" ? "Every guardian yielded. The roster is yours." : "Retry this floor, or open ROSTER to tune the team.", layout.w / 2, layout.h * .72 + 29, 11, "#c0c8da", "center", 700); }
  }
  function drawEffects() { for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = PALETTE[p.color] || p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; for (const t of floatTexts) { ctx.globalAlpha = clamp(t.life, 0, 1); text(t.text, t.x, t.y, 15, t.color, "center", 900); } ctx.globalAlpha = 1; if (flash > 0) { ctx.fillStyle = "rgba(255,242,187," + flash * 1.6 + ")"; ctx.fillRect(0, 0, layout.w, layout.h); } }
  function draw() {
    ctx.save(); const sx = shake ? (Math.random() - .5) * shake : 0, sy = shake ? (Math.random() - .5) * shake : 0; ctx.translate(sx, sy); drawBackground(); drawHud(); drawTeam(); drawBoard(); drawEnemy(); drawFooter(); drawEffects(); ctx.restore();
  }
  function frame(now) { const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000 || 0)); lastTime = now; update(dt); draw(); requestAnimationFrame(frame); }

  function renderRoster() {
    const ids = STARTERS.map(c => c.id).concat(roster.filter(id => knownId(id))); const available = [...new Set(ids)];
    teamPicker.innerHTML = team.map((id, i) => { const c = getCreature(id); return '<button class="teamSlot ' + (selectedSlot === i ? "selected" : "") + '" type="button" data-slot="' + i + '"><span class="slotNum">SLOT ' + (i + 1) + '</span><span class="slotName">' + c.name + '</span></button>'; }).join("");
    rosterList.innerHTML = available.map(id => { const c = getCreature(id), recruited = roster.includes(id); return '<button class="creatureBtn ' + (recruited ? "recruited" : "") + '" type="button" data-creature="' + c.id + '"><span class="creatureTop"><span class="creatureName" style="color:' + PALETTE[c.element] + '">' + c.name + '</span><span class="creatureMeta">' + c.element.toUpperCase() + '</span></span><span class="creatureSkill">' + c.skill + '</span></button>'; }).join("");
    teamPicker.querySelectorAll("button").forEach(el => bindControl(el, () => { selectedSlot = Number(el.dataset.slot); renderRoster(); }));
    rosterList.querySelectorAll("button").forEach(el => bindControl(el, () => { const id = el.dataset.creature; if (knownId(id)) { team[selectedSlot] = id; saveData(); renderRoster(); toast = getCreature(id).name + " is slot " + (selectedSlot + 1) + "."; toastTimer = 2; } }));
  }
  function updateButtons() { restartBtn.textContent = mode === "play" || mode === "resolve" ? "RETRY" : "RESTART"; rosterBtn.textContent = rosterOpen ? "CLOSE" : "ROSTER"; }
  function bindControl(el, action) {
    if (!el || el.dataset.bound === "1") return; el.dataset.bound = "1";
    el.__activePointerId = null;
    el.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); if (document.hidden || orientationVisible()) { resetInput(); return; } el.__activePointerId = e.pointerId; activeControlPointers.add(el); unlockAudio(); if (el.setPointerCapture) try { el.setPointerCapture(e.pointerId); } catch (_) {} });
    el.addEventListener("pointerup", e => { e.preventDefault(); e.stopPropagation(); if (document.hidden || orientationVisible()) { resetInput(); return; } if (el.__activePointerId !== e.pointerId) return; el.__activePointerId = null; activeControlPointers.delete(el); action(); });
    el.addEventListener("pointercancel", e => { if (el.__activePointerId === e.pointerId) { el.__activePointerId = null; activeControlPointers.delete(el); } });
  }

  canvas.addEventListener("pointerdown", e => { e.preventDefault(); if (document.hidden || orientationVisible()) { resetInput(); return; } unlockAudio(); if (rosterOpen || mode !== "play" || boardPointerId !== null) return; const p = boardPoint(e), cell = pointCell(p.x, p.y); if (!cell) return; boardPointerId = e.pointerId; if (canvas.setPointerCapture) try { canvas.setPointerCapture(e.pointerId); } catch (_) {} beginPath(cell); });
  canvas.addEventListener("pointermove", e => { e.preventDefault(); if (e.pointerId !== boardPointerId) return; const p = boardPoint(e), cell = pointCell(p.x, p.y); if (cell) extendPath(cell); });
  canvas.addEventListener("pointerup", e => { e.preventDefault(); if (e.pointerId !== boardPointerId) return; finishPointerPath(); });
  canvas.addEventListener("pointercancel", e => { e.preventDefault(); if (e.pointerId !== boardPointerId) return; boardPointerId = null; cancelPath(); });
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
  canvas.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
  canvas.addEventListener("touchend", e => e.preventDefault(), { passive: false });
  window.addEventListener("keydown", e => { if (document.hidden || orientationVisible()) { resetInput(); return; } unlockAudio(); if (e.key === "Escape") { closeRoster(); updateButtons(); return; } if (rosterOpen) return; if (e.key === " " || e.code === "Space") { e.preventDefault(); if (keyboardPath) finishPath(); return; } if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); if (!keyHeld.has(e.key)) { keyHeld.add(e.key); keyRepeat = 0; const d = ({ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]})[e.key]; enqueueAction({ dr: d[0], dc: d[1] }); } } if (e.key.toLowerCase() === "r") retryFloor(); if (e.key.toLowerCase() === "n") newRun(); });
  window.addEventListener("keyup", e => { keyHeld.delete(e.key); });
  window.addEventListener("blur", resetInput);
  document.addEventListener("visibilitychange", () => { resetInput(); if (!document.hidden) lastTime = performance.now(); });
  window.addEventListener("resize", resize, { passive: true });
  bindControl(restartBtn, () => retryFloor());
  bindControl(muteBtn, () => toggleMute());
  bindControl(rosterBtn, () => { toggleRoster(); updateButtons(); });
  bindControl(closeRosterBtn, () => { closeRoster(); updateButtons(); });
  bindControl(newRunBtn, () => { forgetData(); newRun(); updateButtons(); });

  loadData();
  if (!team.length) team = STARTERS.map(c => c.id);
  if (savedWin) { floor = 15; }
  startFloor(); resize(); updateButtons();
  if (savedWin) { mode = "win"; updateButtons(); }
  requestAnimationFrame(frame);
})();
