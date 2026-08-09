(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const startOverlay = document.getElementById('startOverlay');
  const rotateOverlay = document.getElementById('rotateOverlay');
  const startButton = document.getElementById('startButton');
  const VW = 390;
  const VH = 700;
  const MAX_PARTICLES = 180;
  const MAX_FLOATS = 24;
  const BEST_KEY = 'frosthold.best.v1';
  const PHASE_LENGTH = { calm: 52, blizzard: 38 };
  const COLORS = {
    ink: '#d8eef4', muted: '#91aebb', dim: '#5e7888', panel: '#102437', panel2: '#152f43', line: '#2d5265', cyan: '#86e9e3', blue: '#67b7e8', warm: '#ffca72', hot: '#ff806f', green: '#93dc9b', snow: '#d7f2fa', violet: '#b29feb'
  };
  const BUILDINGS = [
    { id: 'furnace', name: 'FURNACE', key: '1', cost: 0, x: 157, y: 145, w: 76, h: 78, core: true, accent: COLORS.warm },
    { id: 'bunkhouse', name: 'BUNKHOUSE', key: '2', cost: 0, x: 17, y: 142, w: 108, h: 72, accent: COLORS.blue },
    { id: 'hunter', name: 'HUNTER LODGE', key: '3', cost: 28, x: 265, y: 142, w: 108, h: 72, accent: COLORS.green },
    { id: 'woodyard', name: 'WOODYARD', key: '4', cost: 24, x: 17, y: 245, w: 108, h: 72, accent: COLORS.warm },
    { id: 'infirmary', name: 'INFIRMARY', key: '5', cost: 32, x: 141, y: 245, w: 108, h: 72, accent: COLORS.violet },
    { id: 'wall', name: 'ICE WALL', key: '6', cost: 42, x: 265, y: 245, w: 108, h: 72, accent: COLORS.cyan }
  ];
  const JOBS = [
    { id: 'hunt', label: 'HUNT', building: 'hunter', color: COLORS.green, x: 14, y: 349, w: 116, h: 58 },
    { id: 'chop', label: 'CHOP', building: 'woodyard', color: COLORS.warm, x: 137, y: 349, w: 116, h: 58 },
    { id: 'mend', label: 'MEND', building: 'infirmary', color: COLORS.violet, x: 260, y: 349, w: 116, h: 58 }
  ];
  const GUARD_RECT = { x: 14, y: 409, w: 362, h: 48 };
  const SURVIVOR_NAMES = ['Aster', 'Bram', 'Cove', 'Dune', 'Ember', 'Fenn'];
  const HINTS = [
    'Drag a camp badge into HUNT, CHOP, or MEND.',
    'A wall and idle hands turn raider math in your favor.',
    'Burn coal during the whiteout; wood buys the next plan.',
    'MEND pulls sick hands back from the snowline.',
    'No build timers: only the next blizzard is waiting.'
  ];

  let scaleX = 1;
  let scaleY = 1;
  let landscape = false;
  let audio = null;
  let lastTime = performance.now();
  let timeoutIds = new Set();
  let queuedActions = [];
  let keys = new Set();
  let pointerMap = new Map();
  let activeDrags = new Map();
  let stick = { x: 0, y: 0 };
  let game = freshGame();

  function freshGame() {
    return {
      started: false,
      ended: false,
      result: '',
      cycle: 1,
      phase: 'calm',
      phaseTime: 0,
      totalTime: 0,
      resources: { wood: 120, coal: 145, food: 42 },
      buildings: { furnace: true, bunkhouse: true, hunter: false, woodyard: false, infirmary: false, wall: false },
      survivors: SURVIVOR_NAMES.map((name, i) => ({ id: i, name, hp: 100, job: 'guard', cold: 0, sick: 0, alive: true })),
      heat: 63,
      burnRate: 2,
      selectedSlot: 'furnace',
      selectedSurvivor: 0,
      raid: null,
      particles: [],
      snow: makeSnow(54),
      floats: [],
      shake: 0,
      flash: 0,
      toast: '',
      toastTime: 0,
      best: loadBest(),
      phaseNumber: 0,
      productionPulse: 0
    };
  }

  function makeSnow(count) {
    const flakes = [];
    for (let i = 0; i < Math.min(count, 70); i += 1) {
      flakes.push({ x: Math.random() * VW, y: Math.random() * VH, speed: 18 + Math.random() * 36, size: 1 + Math.random() * 2.4, drift: Math.random() * 2 - 1 });
    }
    return flakes;
  }

  function loadBest() {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      if (raw === null) return 0;
      const parsed = JSON.parse(raw);
      const value = typeof parsed === 'number' ? parsed : parsed && typeof parsed.survivors === 'number' ? parsed.survivors : 0;
      return Number.isFinite(value) && value >= 0 && value <= 99 ? Math.floor(value) : 0;
    } catch (_) {
      return 0;
    }
  }

  function saveBest(value) {
    const valid = Number.isFinite(value) && value >= 0 && value <= 99 ? Math.floor(value) : 0;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(valid)); } catch (_) { /* storage is optional */ }
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function aliveSurvivors() { return game.survivors.filter((s) => s.alive); }
  function countJob(job) { return aliveSurvivors().filter((s) => s.job === job).length; }
  function resource(key, amount) { game.resources[key] = clamp(game.resources[key] + amount, 0, 999); }

  function schedule(fn, delay) {
    const id = window.setTimeout(() => { timeoutIds.delete(id); fn(); }, delay);
    timeoutIds.add(id);
    return id;
  }

  function cancelTimers() {
    timeoutIds.forEach((id) => window.clearTimeout(id));
    timeoutIds.clear();
  }

  function resetInput() {
    pointerMap.clear();
    activeDrags.clear();
    keys.clear();
    queuedActions.length = 0;
    stick.x = 0;
    stick.y = 0;
  }

  function resetGame() {
    cancelTimers();
    resetInput();
    game = freshGame();
    game.started = true;
    startOverlay.hidden = true;
    unlockAudio();
    toast('Aster is on furnace watch. Keep the camp breathing.');
  }

  function startGame() {
    resetGame();
  }

  function unlockAudio() {
    if (audio) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audio = new AudioContextClass();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + 0.03);
    } catch (_) { audio = null; }
  }

  function beep(kind) {
    if (!audio) return;
    try {
      if (audio.state === 'suspended') audio.resume();
      const now = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const values = kind === 'danger' ? [130, 82] : kind === 'win' ? [392, 523] : kind === 'build' ? [220, 330] : [260, 390];
      osc.type = kind === 'danger' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(values[0], now);
      osc.frequency.exponentialRampToValueAtTime(values[1], now + (kind === 'win' ? .3 : .12));
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.05, now + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, now + (kind === 'win' ? .38 : .16));
      osc.connect(gain).connect(audio.destination);
      osc.start(now);
      osc.stop(now + (kind === 'win' ? .4 : .18));
    } catch (_) { /* audio is flavor, never a dependency */ }
  }

  function toast(message) {
    game.toast = message;
    game.toastTime = 3.2;
    addFloat(message, VW / 2, 336, COLORS.cyan, 2.5);
  }

  function addFloat(text, x, y, color, life = 1.4) {
    game.floats.push({ text, x, y, color, life, max: life });
    if (game.floats.length > MAX_FLOATS) game.floats.splice(0, game.floats.length - MAX_FLOATS);
  }

  function burst(x, y, color, amount = 12) {
    const count = Math.min(amount, 26);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 15 + Math.random() * 56;
      game.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 1 + Math.random() * 3, color, life: .35 + Math.random() * .65, max: 1 });
    }
    if (game.particles.length > MAX_PARTICLES) game.particles.splice(0, game.particles.length - MAX_PARTICLES);
  }

  function updateOrientation() {
    const next = window.innerWidth > window.innerHeight;
    if (next !== landscape) {
      landscape = next;
      resetInput();
    }
    rotateOverlay.hidden = !landscape;
  }

  function phaseDuration() { return PHASE_LENGTH[game.phase]; }

  function setPhase(phase) {
    game.phase = phase;
    game.phaseTime = 0;
    game.phaseNumber += 1;
    if (phase === 'blizzard') {
      game.flash = .25;
      game.shake = .6;
      addFloat('WHITEOUT', VW / 2, 140, COLORS.snow, 1.8);
      burst(195, 200, COLORS.snow, 24);
      beep('danger');
    } else {
      resource('coal', 8 + game.cycle * 2);
      resource('food', 3 + game.cycle);
      if (game.cycle < 10) beginRaid();
      addFloat('CALM WINDOW', VW / 2, 140, COLORS.cyan, 1.8);
      burst(195, 200, COLORS.cyan, 18);
      beep('good');
    }
  }

  function beginRaid() {
    const threat = Math.round(18 + game.cycle * 8 + Math.random() * 8);
    game.raid = { timer: 6.5, threat, resolved: false, success: false, defense: calcDefense() };
    addFloat('RAIDER PROBE INBOUND', VW / 2, 112, COLORS.hot, 2.2);
    beep('danger');
  }

  function calcDefense() {
    const guards = countJob('guard');
    const wall = game.buildings.wall ? 36 + game.cycle * 2 : 0;
    const healthyGuards = aliveSurvivors().filter((s) => s.job === 'guard' && s.hp > 55).length;
    return Math.round(guards * 8 + healthyGuards * 3 + wall);
  }

  function resolveRaid() {
    if (!game.raid || game.raid.resolved) return;
    const defense = calcDefense();
    const threat = game.raid.threat;
    game.raid.defense = defense;
    game.raid.resolved = true;
    if (defense >= threat) {
      game.raid.success = true;
      resource('wood', 8 + game.cycle * 2);
      resource('coal', 5 + game.cycle);
      addFloat('PROBE TURNED BACK', VW / 2, 132, COLORS.green, 2.1);
      burst(300, 230, COLORS.green, 22);
      beep('good');
    } else {
      const losses = Math.min(2, Math.max(1, Math.ceil((threat - defense) / 22)));
      const victims = aliveSurvivors().sort((a, b) => (a.job === 'guard' ? -1 : 1) - (b.job === 'guard' ? -1 : 1)).slice(0, losses);
      victims.forEach((survivor) => {
        survivor.hp -= 18 + game.cycle * 2;
        survivor.sick = Math.max(survivor.sick, 3);
        survivor.cold += 1;
        if (survivor.hp <= 0) { survivor.hp = 0; survivor.alive = false; survivor.job = 'dead'; }
      });
      game.shake = 1.2;
      game.flash = .45;
      addFloat(`${losses} HIT${losses > 1 ? 'S' : ''} TAKEN`, VW / 2, 132, COLORS.hot, 2.1);
      burst(300, 230, COLORS.hot, 24);
      beep('danger');
      if (!aliveSurvivors().length) endGame('loss');
    }
  }

  function updateSimulation(dt) {
    if (!game.started || game.ended || landscape || document.hidden) return;
    dt = clamp(dt, 0, .05);
    game.totalTime += dt;
    game.phaseTime += dt;
    game.productionPulse += dt;
    game.shake = Math.max(0, game.shake - dt * 1.8);
    game.flash = Math.max(0, game.flash - dt * 1.8);
    game.toastTime = Math.max(0, game.toastTime - dt);

    const living = aliveSurvivors();
    const hunts = countJob('hunt');
    const chops = countJob('chop');
    const menders = countJob('mend');
    if (game.buildings.hunter) resource('food', hunts * (game.phase === 'calm' ? .62 : .26) * dt);
    if (game.buildings.woodyard) resource('wood', chops * (game.phase === 'calm' ? .72 : .18) * dt);
    resource('food', -living.length * .018 * dt);

    const burn = Math.min(game.burnRate, game.resources.coal > 0 ? game.resources.coal / (.36 * dt) : 0);
    resource('coal', -burn * .36 * dt);
    if (game.phase === 'blizzard') {
      const drain = 4.4 + game.cycle * .45;
      const warmth = burn * 3.25;
      game.heat = clamp(game.heat + (warmth - drain) * dt, 0, 100);
      living.forEach((survivor) => {
        if (game.heat < 38) {
          survivor.cold += dt * (game.heat < 18 ? 1.8 : .8);
          survivor.hp -= dt * (game.heat < 18 ? 1.05 : .3);
          if (survivor.cold > 3.5) survivor.sick = Math.min(9, survivor.sick + dt * .25);
        } else {
          survivor.cold = Math.max(0, survivor.cold - dt * .4);
        }
        if (survivor.job === 'mend' && game.buildings.infirmary && survivor.sick > 0) survivor.sick = Math.max(0, survivor.sick - dt * .5);
      });
    } else {
      game.heat = clamp(game.heat + (1.4 + burn * 1.4) * dt, 0, 100);
      living.forEach((survivor) => {
        if (survivor.job === 'mend' && game.buildings.infirmary) {
          survivor.sick = Math.max(0, survivor.sick - dt * .8);
          survivor.hp = Math.min(100, survivor.hp + dt * .28);
        }
      });
    }
    if (game.resources.food <= 0) living.forEach((survivor) => { survivor.hp -= dt * .18; });
    living.forEach((survivor) => {
      if (survivor.hp <= 0) { survivor.hp = 0; survivor.alive = false; survivor.job = 'dead'; burst(65 + survivor.id * 43, 500, COLORS.hot, 12); }
    });

    if (game.raid && !game.raid.resolved) {
      game.raid.timer -= dt;
      game.raid.defense = calcDefense();
      if (game.raid.timer <= 0) resolveRaid();
    }

    if (game.phaseTime >= phaseDuration()) {
      if (game.phase === 'calm') {
        setPhase('blizzard');
      } else if (game.cycle >= 10) {
        endGame('win');
      } else {
        game.cycle += 1;
        setPhase('calm');
      }
    }
    if (!aliveSurvivors().length) endGame('loss');

    updateSnow(dt);
    updateParticles(dt);
    updateFloats(dt);
  }

  function updateSnow(dt) {
    if (game.phase !== 'blizzard') return;
    game.snow.forEach((flake) => {
      flake.y += flake.speed * dt;
      flake.x += flake.drift * dt * 6;
      if (flake.y > VH + 8) { flake.y = -8; flake.x = Math.random() * VW; }
      if (flake.x < -5) flake.x = VW + 5;
      if (flake.x > VW + 5) flake.x = -5;
    });
  }

  function updateParticles(dt) {
    for (let i = game.particles.length - 1; i >= 0; i -= 1) {
      const p = game.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 30 * dt;
      if (p.life <= 0) game.particles.splice(i, 1);
    }
  }

  function updateFloats(dt) {
    for (let i = game.floats.length - 1; i >= 0; i -= 1) {
      const f = game.floats[i];
      f.life -= dt;
      f.y -= 10 * dt;
      if (f.life <= 0) game.floats.splice(i, 1);
    }
  }

  function endGame(result) {
    if (game.ended) return;
    game.ended = true;
    game.result = result;
    const tally = aliveSurvivors().length;
    if (tally > game.best) { game.best = tally; saveBest(tally); }
    game.flash = .65;
    game.shake = 1.3;
    burst(VW / 2, 230, result === 'win' ? COLORS.cyan : COLORS.hot, 42);
    beep(result === 'win' ? 'win' : 'danger');
  }

  function buildingAt(x, y) {
    return BUILDINGS.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  }

  function rosterAt(x, y) {
    const living = game.survivors;
    for (let i = 0; i < living.length; i += 1) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const rect = { x: 12 + col * 125, y: 461 + row * 50, w: 116, h: 48 };
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return living[i];
    }
    return null;
  }

  function jobAt(x, y) {
    return JOBS.find((job) => x >= job.x && x <= job.x + job.w && y >= job.y && y <= job.y + job.h);
  }

  function hit(x, y) {
    if (game.ended && x >= 84 && x <= 306 && y >= 468 && y <= 524) return { kind: 'restart', action: 'restart' };
    if (x >= 14 && x <= 64 && y >= 619 && y <= 667) return { kind: 'burn-', action: 'burn-' };
    if (x >= 326 && x <= 376 && y >= 619 && y <= 667) return { kind: 'burn+', action: 'burn+' };
    if (x >= 14 && x <= 376 && y >= 565 && y <= 613) return { kind: 'build', action: 'build' };
    if (x >= GUARD_RECT.x && x <= GUARD_RECT.x + GUARD_RECT.w && y >= GUARD_RECT.y && y <= GUARD_RECT.y + GUARD_RECT.h) return { kind: 'guard', action: 'guard' };
    const building = buildingAt(x, y);
    if (building) return { kind: 'building', building, action: 'building' };
    const survivor = rosterAt(x, y);
    if (survivor) return { kind: 'survivor', survivor, action: 'survivor' };
    const job = jobAt(x, y);
    if (job) return { kind: 'job', job, action: 'job' };
    return null;
  }

  function assign(id, job) {
    const survivor = game.survivors.find((s) => s.id === id);
    if (!survivor || !survivor.alive) return;
    if (job !== 'guard' && !game.buildings[JOBS.find((j) => j.id === job).building]) {
      toast(`Build the ${job === 'hunt' ? 'HUNTER LODGE' : job === 'chop' ? 'WOODYARD' : 'INFIRMARY'} first.`);
      beep('danger');
      return;
    }
    survivor.job = job;
    game.selectedSurvivor = id;
    addFloat(`${survivor.name} → ${job.toUpperCase()}`, VW / 2, 335, COLORS.cyan, 1.3);
    burst(195, 390, COLORS.cyan, 8);
    beep('good');
  }

  function buildSelected() {
    const b = BUILDINGS.find((item) => item.id === game.selectedSlot);
    if (!b || game.buildings[b.id]) {
      toast('That shelter is already standing.');
      return;
    }
    if (game.resources.wood < b.cost) {
      toast(`Need ${b.cost - Math.floor(game.resources.wood)} more wood.`);
      beep('danger');
      return;
    }
    resource('wood', -b.cost);
    game.buildings[b.id] = true;
    game.flash = .3;
    burst(b.x + b.w / 2, b.y + b.h / 2, b.accent, 24);
    addFloat(`${b.name} RAISED`, b.x + b.w / 2, b.y - 8, b.accent, 1.8);
    beep('build');
  }

  function interact(action) {
    if (action === 'burn-') { game.burnRate = clamp(game.burnRate - 1, 0, 5); addFloat(`BURN ${game.burnRate}`, 195, 110, COLORS.warm, .8); beep('good'); }
    if (action === 'burn+') { game.burnRate = clamp(game.burnRate + 1, 0, 5); addFloat(`BURN ${game.burnRate}`, 195, 110, COLORS.warm, .8); beep('good'); }
    if (action === 'build') buildSelected();
    if (action === 'restart') startGame();
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * VW / rect.width, y: (event.clientY - rect.top) * VH / rect.height };
  }

  function pointerDown(event) {
    event.preventDefault();
    unlockAudio();
    if (!game.started) return;
    const p = pointFromEvent(event);
    const target = hit(p.x, p.y);
    if (!target) return;
    if (target.kind === 'survivor') {
      if (!target.survivor.alive) return;
      pointerMap.set(event.pointerId, { kind: 'drag', survivorId: target.survivor.id, startX: p.x, startY: p.y, moved: false });
      activeDrags.set(event.pointerId, { survivorId: target.survivor.id, x: p.x, y: p.y });
      game.selectedSurvivor = target.survivor.id;
      try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* pointer capture is optional */ }
      return;
    }
    pointerMap.set(event.pointerId, { kind: target.kind, action: target.action, downX: p.x, downY: p.y });
    if (target.kind === 'building') {
      game.selectedSlot = target.building.id;
      beep('good');
    } else if (target.kind === 'job') {
      assign(game.selectedSurvivor, target.job.id);
    } else if (target.kind === 'guard') {
      assign(game.selectedSurvivor, 'guard');
    } else {
      interact(target.action);
    }
  }

  function pointerMove(event) {
    event.preventDefault();
    const control = pointerMap.get(event.pointerId);
    if (!control) return;
    if (control.kind === 'drag') {
      const p = pointFromEvent(event);
      if (Math.hypot(p.x - control.startX, p.y - control.startY) > 7) control.moved = true;
      activeDrags.set(event.pointerId, { survivorId: control.survivorId, x: p.x, y: p.y });
    }
  }

  function pointerUp(event, cancelled = false) {
    event.preventDefault();
    const control = pointerMap.get(event.pointerId);
    if (control && control.kind === 'drag' && !cancelled) {
      const p = pointFromEvent(event);
      const job = jobAt(p.x, p.y);
      if (job) assign(control.survivorId, job.id);
      else if (p.x >= GUARD_RECT.x && p.x <= GUARD_RECT.x + GUARD_RECT.w && p.y >= GUARD_RECT.y && p.y <= GUARD_RECT.y + GUARD_RECT.h) assign(control.survivorId, 'guard');
    }
    pointerMap.delete(event.pointerId);
    activeDrags.delete(event.pointerId);
    try { canvas.releasePointerCapture(event.pointerId); } catch (_) { /* optional */ }
  }

  function keyDown(event) {
    const key = event.key.toLowerCase();
    if ([' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) event.preventDefault();
    if (keys.has(key)) return;
    keys.add(key);
    if (!game.started) return;
    if (/^[1-6]$/.test(key)) {
      const building = BUILDINGS[Number(key) - 1];
      if (building) { game.selectedSlot = building.id; beep('good'); }
    } else if (key === ' ') {
      buildSelected();
    } else if (key === '+' || key === '=') {
      interact('burn+');
    } else if (key === '-' || key === '_') {
      interact('burn-');
    } else if (key === 'h') {
      assign(game.selectedSurvivor, 'hunt');
    } else if (key === 'c') {
      assign(game.selectedSurvivor, 'chop');
    } else if (key === 'm') {
      assign(game.selectedSurvivor, 'mend');
    } else if (key === 'g') {
      assign(game.selectedSurvivor, 'guard');
    } else if (key === 'arrowleft' || key === 'arrowup') {
      game.selectedSurvivor = Math.max(0, game.selectedSurvivor - 1);
    } else if (key === 'arrowright' || key === 'arrowdown') {
      game.selectedSurvivor = Math.min(game.survivors.length - 1, game.selectedSurvivor + 1);
    } else if (key === 'r' && game.ended) {
      startGame();
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.min(960, Math.max(1, Math.round(rect.width * dpr)));
    canvas.height = Math.min(960, Math.max(1, Math.round(rect.height * dpr)));
    scaleX = canvas.width / VW;
    scaleY = canvas.height / VH;
  }

  function roundRect(x, y, w, h, r, fill, stroke, lineWidth = 1) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function text(value, x, y, size = 12, color = COLORS.ink, align = 'left', weight = 600) {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  }

  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, game.phase === 'blizzard' ? '#0b2331' : '#0d1c2d');
    grad.addColorStop(1, '#08121e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = 'rgba(120, 191, 214, .06)';
    for (let x = 0; x < VW; x += 26) ctx.fillRect(x, 116, 1, 222);
    ctx.fillStyle = 'rgba(255,255,255,.025)';
    for (let y = 130; y < 338; y += 22) ctx.fillRect(0, y, VW, 1);
  }

  function drawHud() {
    ctx.fillStyle = '#0a1724';
    ctx.fillRect(0, 0, VW, 78);
    text('FROSTHOLD', 14, 18, 15, COLORS.cyan, 'left', 900);
    text(`CYCLE ${game.cycle}/10`, 376, 18, 12, COLORS.ink, 'right', 800);
    const phase = game.phase === 'blizzard' ? 'WHITEOUT' : 'CALM WINDOW';
    text(phase, 14, 39, 11, game.phase === 'blizzard' ? COLORS.snow : COLORS.green, 'left', 800);
    const remaining = Math.ceil(phaseDuration() - game.phaseTime);
    text(`${remaining}s`, 376, 39, 11, COLORS.muted, 'right', 800);
    drawResource(14, 54, 'WOOD', Math.floor(game.resources.wood), COLORS.warm);
    drawResource(105, 54, 'COAL', Math.floor(game.resources.coal), COLORS.snow);
    drawResource(196, 54, 'FOOD', Math.floor(game.resources.food), COLORS.green);
    const heatColor = game.heat < 30 ? COLORS.hot : game.heat < 55 ? COLORS.warm : COLORS.cyan;
    text('HEAT', 288, 54, 10, COLORS.muted, 'left', 800);
    roundRect(319, 49, 56, 10, 5, '#243443');
    roundRect(319, 49, 56 * game.heat / 100, 10, 5, heatColor);
  }

  function drawResource(x, y, label, value, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 5, 6, 10);
    text(`${label} ${value}`, x + 10, y, 10, COLORS.ink, 'left', 800);
  }

  function drawHint() {
    roundRect(10, 86, 370, 28, 8, '#0f2737', game.raid && !game.raid.resolved ? '#a15b61' : COLORS.line);
    const hint = game.raid && !game.raid.resolved ? `RAID IN ${Math.max(0, game.raid.timer).toFixed(1)}s · THREAT ${game.raid.threat} · DEF ${game.raid.defense}` : HINTS[Math.min(HINTS.length - 1, Math.floor((game.cycle - 1) / 2))];
    text(hint, 195, 100, 10, game.raid && !game.raid.resolved ? COLORS.hot : COLORS.muted, 'center', 700);
  }

  function drawSettlement() {
    roundRect(10, 119, 370, 217, 12, game.phase === 'blizzard' ? '#122b3a' : '#122538', COLORS.line);
    ctx.fillStyle = '#1a3546';
    ctx.beginPath();
    ctx.moveTo(10, 292); ctx.lineTo(115, 260); ctx.lineTo(192, 282); ctx.lineTo(280, 248); ctx.lineTo(380, 276); ctx.lineTo(380, 336); ctx.lineTo(10, 336); ctx.closePath(); ctx.fill();
    ctx.fillStyle = game.phase === 'blizzard' ? '#b9d9e0' : '#7ca7b1';
    ctx.globalAlpha = .14;
    ctx.fillRect(10, 322, 370, 14);
    ctx.globalAlpha = 1;
    BUILDINGS.forEach(drawBuilding);
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i % 2 ? '#356072' : '#284b5f';
      ctx.fillRect(28 + i * 79, 323 - (i % 2) * 3, 25, 3);
    }
  }

  function drawBuilding(building) {
    const built = game.buildings[building.id];
    const selected = game.selectedSlot === building.id;
    const fill = built ? (selected ? '#1b3b4d' : '#142d3f') : '#102131';
    roundRect(building.x, building.y, building.w, building.h, 9, fill, selected ? building.accent : built ? COLORS.line : '#223747', selected ? 2 : 1);
    if (!built) {
      ctx.setLineDash([4, 3]);
      roundRect(building.x + 4, building.y + 4, building.w - 8, building.h - 8, 7, null, '#375263');
      ctx.setLineDash([]);
    }
    drawBuildingArt(building, built);
    const label = building.id === 'furnace' ? 'FURNACE' : building.id === 'bunkhouse' ? 'BUNK' : building.id === 'hunter' ? 'LODGE' : building.id === 'woodyard' ? 'WOOD' : building.id === 'infirmary' ? 'MEND' : 'WALL';
    text(label, building.x + building.w / 2, building.y + building.h - 12, 9, built ? COLORS.ink : COLORS.dim, 'center', 900);
    text(building.key, building.x + 9, building.y + 11, 9, selected ? building.accent : COLORS.dim, 'left', 900);
  }

  function drawBuildingArt(building, built) {
    const x = building.x + building.w / 2;
    const y = building.y + 28;
    const color = built ? building.accent : '#3a5664';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    if (building.id === 'furnace') {
      ctx.fillStyle = built ? '#bc704b' : '#3a5664';
      ctx.fillRect(x - 15, y - 8, 30, 25);
      ctx.fillStyle = built ? COLORS.warm : '#3a5664';
      ctx.beginPath(); ctx.arc(x, y + 2, 8, 0, Math.PI * 2); ctx.fill();
      if (built && game.phase === 'blizzard') { ctx.globalAlpha = .8; ctx.fillStyle = '#fff2b3'; ctx.beginPath(); ctx.arc(x, y + 2, 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = color; ctx.strokeRect(x + 8, y - 24, 8, 16);
    } else if (building.id === 'wall') {
      for (let i = -2; i <= 2; i += 1) ctx.fillRect(x + i * 10 - 4, y - 7 - (Math.abs(i) % 2) * 5, 9, 21);
    } else {
      ctx.beginPath(); ctx.moveTo(x - 25, y - 2); ctx.lineTo(x, y - 22); ctx.lineTo(x + 25, y - 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = built ? '#163247' : '#142431';
      ctx.fillRect(x - 18, y - 1, 36, 18);
      ctx.fillStyle = color;
      ctx.fillRect(x - 4, y + 5, 8, 12);
      ctx.fillRect(x - 15, y + 2, 6, 6);
      ctx.fillRect(x + 9, y + 2, 6, 6);
      if (building.id === 'infirmary') { ctx.fillRect(x - 2, y - 14, 4, 10); ctx.fillRect(x - 7, y - 9, 14, 4); }
    }
  }

  function drawJobs() {
    JOBS.forEach((job) => {
      const open = game.buildings[job.building];
      const selected = game.selectedSurvivor !== null && game.survivors[game.selectedSurvivor] && game.survivors[game.selectedSurvivor].job === job.id;
      roundRect(job.x, job.y, job.w, job.h, 9, open ? '#132c3e' : '#101e2a', selected ? job.color : COLORS.line, selected ? 2 : 1);
      ctx.fillStyle = open ? job.color : '#405564';
      ctx.fillRect(job.x + 10, job.y + 12, 5, 32);
      text(job.label, job.x + 23, job.y + 17, 11, open ? COLORS.ink : COLORS.dim, 'left', 900);
      const count = countJob(job.id);
      text(open ? `${count} assigned` : 'LOCKED', job.x + 23, job.y + 39, 10, open ? job.color : COLORS.dim, 'left', 700);
    });
    const guards = countJob('guard');
    roundRect(GUARD_RECT.x, GUARD_RECT.y, GUARD_RECT.w, GUARD_RECT.h, 9, '#13283a', game.selectedSurvivor !== null && game.survivors[game.selectedSurvivor] && game.survivors[game.selectedSurvivor].job === 'guard' ? COLORS.cyan : COLORS.line, 1);
    text('GUARD LINE', 27, 433, 10, COLORS.cyan, 'left', 900);
    text(`${guards} idle hands · strength ${calcDefense()}`, 363, 433, 10, COLORS.muted, 'right', 700);
    ctx.strokeStyle = '#315467';
    ctx.beginPath(); ctx.moveTo(27, 447); ctx.lineTo(363, 447); ctx.stroke();
  }

  function drawRoster() {
    game.survivors.forEach((survivor, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 12 + col * 125;
      const y = 461 + row * 50;
      const selected = game.selectedSurvivor === survivor.id;
      const fill = !survivor.alive ? '#101820' : selected ? '#1d3c4c' : '#122a3b';
      const stroke = !survivor.alive ? '#293b45' : selected ? COLORS.cyan : COLORS.line;
      roundRect(x, y, 116, 48, 8, fill, stroke, selected ? 2 : 1);
      ctx.fillStyle = survivor.alive ? (survivor.sick > 1 ? COLORS.hot : COLORS.green) : COLORS.hot;
      ctx.beginPath(); ctx.arc(x + 14, y + 24, 7, 0, Math.PI * 2); ctx.fill();
      text(survivor.name, x + 27, y + 16, 10, survivor.alive ? COLORS.ink : COLORS.dim, 'left', 800);
      const role = survivor.alive ? survivor.job.toUpperCase() : 'LOST';
      text(role, x + 27, y + 34, 9, survivor.alive ? (survivor.sick > 1 ? COLORS.hot : COLORS.muted) : COLORS.hot, 'left', 800);
      if (survivor.alive) {
        ctx.fillStyle = '#263b46'; ctx.fillRect(x + 78, y + 12, 27, 5);
        ctx.fillStyle = survivor.hp < 45 ? COLORS.hot : COLORS.green; ctx.fillRect(x + 78, y + 12, 27 * survivor.hp / 100, 5);
      }
    });
  }

  function drawBuildChip() {
    const b = BUILDINGS.find((item) => item.id === game.selectedSlot) || BUILDINGS[0];
    const built = game.buildings[b.id];
    roundRect(14, 565, 362, 48, 10, built ? '#132b3a' : '#173345', built ? COLORS.line : b.accent, built ? 1 : 2);
    if (built) {
      text(`${b.name} ONLINE`, 28, 589, 12, b.accent, 'left', 900);
      text('tap a slot to choose', 363, 589, 10, COLORS.muted, 'right', 700);
    } else {
      text(`BUILD ${b.name}`, 28, 589, 12, b.accent, 'left', 900);
      text(`${b.cost} WOOD · INSTANT`, 363, 589, 10, game.resources.wood >= b.cost ? COLORS.ink : COLORS.hot, 'right', 800);
    }
  }

  function drawBurnControls() {
    roundRect(14, 619, 362, 48, 10, '#102437', COLORS.line);
    roundRect(18, 623, 42, 40, 8, '#1c394b', COLORS.line);
    roundRect(330, 623, 42, 40, 8, '#1c394b', COLORS.line);
    text('−', 39, 643, 24, COLORS.ink, 'center', 400);
    text('+', 351, 643, 22, COLORS.ink, 'center', 700);
    text(`FURNACE BURN  ${game.burnRate}/5`, 195, 636, 11, COLORS.warm, 'center', 900);
    text(`${game.burnRate === 0 ? 'coasting' : `${(game.burnRate * .36).toFixed(1)} coal/s`}`, 195, 653, 9, COLORS.muted, 'center', 700);
  }

  function drawParticles() {
    game.particles.forEach((p) => {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    ctx.globalAlpha = 1;
  }

  function drawSnow() {
    if (game.phase !== 'blizzard') return;
    ctx.globalAlpha = .58;
    ctx.fillStyle = COLORS.snow;
    game.snow.forEach((flake) => ctx.fillRect(flake.x, flake.y, flake.size, flake.size));
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    game.floats.forEach((f) => {
      ctx.globalAlpha = clamp(f.life / Math.min(1, f.max), 0, 1);
      text(f.text, f.x, f.y, f.text.length > 22 ? 10 : 12, f.color, 'center', 900);
    });
    ctx.globalAlpha = 1;
  }

  function drawDragGhost() {
    activeDrags.forEach((drag) => {
      const survivor = game.survivors.find((s) => s.id === drag.survivorId);
      if (!survivor) return;
      ctx.globalAlpha = .92;
      roundRect(drag.x - 48, drag.y - 23, 96, 46, 10, '#214c5a', COLORS.cyan, 2);
      text(survivor.name, drag.x, drag.y - 5, 11, COLORS.ink, 'center', 900);
      text('DROP POST', drag.x, drag.y + 12, 8, COLORS.cyan, 'center', 900);
      ctx.globalAlpha = 1;
    });
  }

  function drawEndCard() {
    if (!game.ended) return;
    ctx.fillStyle = 'rgba(4, 10, 17, .78)';
    ctx.fillRect(0, 0, VW, VH);
    const win = game.result === 'win';
    roundRect(28, 185, 334, 350, 18, '#102536', win ? COLORS.cyan : COLORS.hot, 2);
    text(win ? 'THE CAMP HOLDS' : 'THE CAMP GOES QUIET', 195, 232, 20, win ? COLORS.cyan : COLORS.hot, 'center', 900);
    text(win ? 'Ten whiteouts, one stubborn ember.' : 'The cold found every gap.', 195, 264, 12, COLORS.muted, 'center', 700);
    text(`${aliveSurvivors().length}`, 195, 335, 68, COLORS.ink, 'center', 900);
    text('SURVIVORS REMAINING', 195, 377, 11, COLORS.muted, 'center', 900);
    text(`BEST TALLY  ${game.best}`, 195, 409, 12, COLORS.warm, 'center', 900);
    text(`RUN TIME  ${formatTime(game.totalTime)}`, 195, 433, 11, COLORS.muted, 'center', 700);
    roundRect(84, 468, 222, 56, 11, win ? '#1a4c52' : '#4d2930', win ? COLORS.cyan : COLORS.hot, 2);
    text('TAP TO REKINDLE', 195, 496, 12, COLORS.ink, 'center', 900);
  }

  function formatTime(value) {
    const total = Math.max(0, Math.floor(value));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function render() {
    if (!canvas.width || !canvas.height) return;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, VW, VH);
    ctx.save();
    if (game.shake > 0) ctx.translate((Math.random() - .5) * game.shake * 5, (Math.random() - .5) * game.shake * 5);
    drawBackground();
    drawHud();
    drawHint();
    drawSettlement();
    drawJobs();
    drawRoster();
    drawBuildChip();
    drawBurnControls();
    drawSnow();
    drawParticles();
    drawFloats();
    drawDragGhost();
    if (game.flash > 0) { ctx.fillStyle = `rgba(220, 248, 255, ${game.flash * .16})`; ctx.fillRect(0, 0, VW, VH); }
    if (!game.started) {
      ctx.fillStyle = 'rgba(4, 10, 17, .25)';
      ctx.fillRect(0, 0, VW, VH);
    }
    drawEndCard();
    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    updateSimulation(dt);
    render();
    window.requestAnimationFrame(frame);
  }

  startButton.addEventListener('click', startGame);
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointermove', pointerMove, { passive: false });
  canvas.addEventListener('pointerup', (event) => pointerUp(event), { passive: false });
  canvas.addEventListener('pointercancel', (event) => pointerUp(event, true), { passive: false });
  canvas.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  canvas.addEventListener('touchend', (event) => event.preventDefault(), { passive: false });
  window.addEventListener('keydown', keyDown, { passive: false });
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', resetInput);
  document.addEventListener('visibilitychange', () => { lastTime = performance.now(); if (document.hidden) resetInput(); });
  window.addEventListener('resize', () => { updateOrientation(); resize(); });
  window.addEventListener('orientationchange', () => { updateOrientation(); resize(); });
  updateOrientation();
  resize();
  window.requestAnimationFrame(frame);
})();
