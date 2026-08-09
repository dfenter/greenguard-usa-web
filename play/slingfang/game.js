(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const bootLayer = document.getElementById('bootLayer');
  const rotateLayer = document.getElementById('rotateLayer');
  const bootButton = document.getElementById('bootButton');
  const restartButton = document.getElementById('restartButton');
  const teamControls = document.getElementById('teamControls');
  const announce = document.getElementById('announce');

  const VW = 390;
  const VH = 700;
  const ARENA = { left: 17, right: 373, top: 116, bottom: 578 };
  const STORAGE_KEY = 'slingfang-run-v1';
  const MAX_PARTICLES = 180;
  const MAX_SHARDS = 12;
  const MAX_EFFECTS = 28;
  const MAX_TIMERS = 8;
  const TAU = Math.PI * 2;

  const roster = [
    { name: 'Flintling', short: 'FLINT', sigil: '◆', color: '#ffbf69', passive: 'PIERCE', aura: 'Grit' },
    { name: 'Splitmaw', short: 'SPLIT', sigil: 'Y', color: '#ff83b5', passive: 'SPLIT', aura: 'Rend' },
    { name: 'Pullpup', short: 'PULL', sigil: '⊙', color: '#84c9ff', passive: 'MAGNET', aura: 'Tug' },
    { name: 'Mossmender', short: 'MEND', sigil: '✚', color: '#9eeda7', passive: 'HEAL RING', aura: 'HEAL' },
    { name: 'Sparkjaw', short: 'SPARK', sigil: 'ϟ', color: '#ffe27b', passive: 'SPARK BURST', aura: 'SPARK' },
    { name: 'Wardwisp', short: 'WARD', sigil: '⬢', color: '#c5a6ff', passive: 'SHIELD', aura: 'SHIELD' }
  ];

  const defaults = { maxStage: 1, unlocked: 3, bestScore: 0, bestTime: 0 };
  let progress = readProgress();
  let layout = { cssW: 390, cssH: 700, scale: 1, ox: 0, oy: 0, dpr: 1, portrait: true };
  let audioCtx = null;
  let audioReady = false;
  let audioGate = true;
  let state = 'play';
  let stage = 1;
  let score = 0;
  let stageScore = 0;
  let stageStartedAt = 0;
  let stageSeconds = 0;
  let teamHP = 100;
  let activeSlot = 0;
  let team = [0, 1, 2];
  let player = null;
  let enemies = [];
  let walls = [];
  let shards = [];
  let particles = [];
  let effects = [];
  let trails = [];
  let stageClearQueued = false;
  let shotNumber = 0;
  let combo = 0;
  let shake = 0;
  let flash = 0;
  let nextId = 1;
  let aim = { x: 0, y: -1 };
  let aimStart = null;
  let aimPointerId = null;
  let bootPointerId = null;
  let keys = new Set();
  let queuedActions = [];
  let buttonPointers = new Map();
  let pendingTimers = new Set();
  let lastFrame = performance.now();
  let nowMs = 0;
  let orientationPaused = false;
  const backdropDots = Array.from({ length: 46 }, (_, i) => ({
    x: 12 + ((i * 73) % 366), y: 8 + ((i * 127) % 610), r: i % 4 === 0 ? 1.5 : .8, a: .16 + (i % 5) * .035
  }));

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const clampInt = (n, min, max, fallback) => Number.isFinite(n) ? Math.round(clamp(n, min, max)) : fallback;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const normalize = (x, y) => {
    const m = Math.hypot(x, y) || 1;
    return { x: x / m, y: y / m };
  };
  const hexToRgb = (hex) => {
    const value = hex.replace('#', '');
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  };
  const rgba = (hex, alpha) => {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  function readProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (typeof raw !== 'string' || raw.length > 1800) return { ...defaults };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...defaults };
      return {
        maxStage: clampInt(parsed.maxStage, 1, 12, defaults.maxStage),
        unlocked: clampInt(parsed.unlocked, 3, 6, defaults.unlocked),
        bestScore: clampInt(parsed.bestScore, 0, 999999, defaults.bestScore),
        bestTime: clampInt(parsed.bestTime, 0, 999999, defaults.bestTime)
      };
    } catch (_) {
      return { ...defaults };
    }
  }

  function saveProgress() {
    try {
      const safe = {
        maxStage: clampInt(progress.maxStage, 1, 12, 1),
        unlocked: clampInt(progress.unlocked, 3, 6, 3),
        bestScore: clampInt(progress.bestScore, 0, 999999, 0),
        bestTime: clampInt(progress.bestTime, 0, 999999, 0)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch (_) { /* Storage is optional. */ }
  }

  function later(fn, delay) {
    if (pendingTimers.size >= MAX_TIMERS) return 0;
    let timer = 0;
    timer = window.setTimeout(() => {
      pendingTimers.delete(timer);
      fn();
    }, delay);
    pendingTimers.add(timer);
    return timer;
  }

  function cancelTimers() {
    pendingTimers.forEach((timer) => window.clearTimeout(timer));
    pendingTimers.clear();
  }

  function resetInput() {
    const capturedAimId = aimPointerId;
    const capturedBootId = bootPointerId;
    const capturedButtons = Array.from(buttonPointers.entries());
    aimPointerId = null;
    bootPointerId = null;
    aimStart = null;
    buttonPointers.clear();
    keys.clear();
    queuedActions.length = 0;
    aim = { x: 0, y: -1 };
    try { if (capturedAimId !== null && canvas.hasPointerCapture && canvas.hasPointerCapture(capturedAimId)) canvas.releasePointerCapture(capturedAimId); } catch (_) {}
    try { if (capturedBootId !== null && bootButton.hasPointerCapture && bootButton.hasPointerCapture(capturedBootId)) bootButton.releasePointerCapture(capturedBootId); } catch (_) {}
    for (const [key, pointerId] of capturedButtons) {
      const target = key === 'restart' ? restartButton : teamControls.querySelector(`[data-id="${key}"]`);
      try { if (target && target.hasPointerCapture && target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId); } catch (_) {}
    }
  }

  function updateLayout() {
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1), 960 / Math.max(cssW, cssH));
    const scale = Math.min(cssW / VW, cssH / VH);
    layout = { cssW, cssH, scale, ox: (cssW - VW * scale) / 2, oy: (cssH - VH * scale) / 2, dpr, portrait: cssH >= cssW };
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    const nextPaused = !layout.portrait || document.hidden;
    if (nextPaused !== orientationPaused) resetInput();
    orientationPaused = nextPaused;
    rotateLayer.hidden = layout.portrait;
  }

  function worldPoint(clientX, clientY) {
    return { x: (clientX - layout.ox) / layout.scale, y: (clientY - layout.oy) / layout.scale };
  }

  function makeTeam() {
    const safe = team.slice(0, 3).filter((id) => id >= 0 && id < progress.unlocked);
    while (safe.length < 3) safe.push(safe.length % progress.unlocked);
    team = safe;
    activeSlot = clampInt(activeSlot, 0, team.length - 1, 0);
    renderTeamControls();
  }

  function basePosition(slot) {
    return [{ x: 74, y: 548 }, { x: 195, y: 555 }, { x: 316, y: 548 }][slot] || { x: 195, y: 550 };
  }

  function resetPlayer() {
    const base = basePosition(activeSlot);
    player = { x: base.x, y: base.y, vx: 0, vy: 0, r: 18, launched: false, settle: 0, shotTime: 0, bounces: 0, splitUsed: false, invuln: 0, banked: false };
    aim = { x: 0, y: -1 };
  }

  function enemy(x, y, type = 'drift', hp = 1) {
    const palette = { drift: '#ee7e70', heavy: '#e89d65', guard: '#d477b3', boss: '#f05e6f' };
    return { id: nextId++, x, y, vx: 0, vy: 0, r: type === 'boss' ? 31 : type === 'heavy' ? 22 : 18, hp, maxHp: hp, type, color: palette[type] || palette.drift, hitCooldown: 0, flash: 0 };
  }

  function buildStage(n) {
    enemies = [];
    walls = [];
    shards = [];
    particles = [];
    effects = [];
    trails = [];
    stageClearQueued = false;
    shotNumber = 0;
    combo = 0;
    teamHP = 100;
    nextId = 1;
    const boss = n === 6 || n === 12;
    const count = boss ? (n === 12 ? 7 : 5) : Math.min(12, 2 + n);
    const pattern = n % 4;
    for (let i = 0; i < count && enemies.length < 18; i++) {
      let x = 65 + ((i * 73 + n * 29) % 260);
      let y = 170 + ((i * 47 + n * 19) % 210);
      let type = i % 5 === 0 && n > 2 ? 'heavy' : i % 7 === 0 && n > 4 ? 'guard' : 'drift';
      if (pattern === 0) { x = 64 + i * (262 / Math.max(1, count - 1)); y = 178 + (i % 2) * 54; }
      if (pattern === 1) { x = 195 + Math.cos(i / Math.max(1, count) * TAU) * 120; y = 275 + Math.sin(i / Math.max(1, count) * TAU) * 105; }
      if (pattern === 2) { x = 58 + (i % 4) * 92 + (Math.floor(i / 4) % 2) * 24; y = 175 + Math.floor(i / 4) * 72; }
      if (boss && i === count - 1) { x = 195; y = 192; type = 'boss'; }
      enemies.push(enemy(x, y, type, type === 'boss' ? (n === 12 ? 13 : 8) : type === 'heavy' ? 2 : type === 'guard' ? 2 : 1));
    }
    if (boss) {
      const wallCount = n === 12 ? 3 : 2;
      for (let i = 0; i < wallCount && walls.length < 6; i++) {
        walls.push({ id: nextId++, x: i === 0 ? 68 : i === 1 ? 195 : 322, y: 300 + (i % 2) * 75, w: 86, h: 13, hp: n === 12 ? 2 : 1, maxHp: n === 12 ? 2 : 1, alive: true, flash: 0 });
      }
    }
    resetPlayer();
    stageStartedAt = performance.now();
    stageSeconds = 0;
    announce.textContent = `Stage ${n}. ${boss ? 'Bank shots through the phase walls.' : 'Clear the formation.'}`;
    renderTeamControls();
  }

  function startAudio() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      audioReady = true;
    } catch (_) { audioReady = false; }
  }

  function tone(freq, duration = .08, type = 'sine', volume = .035) {
    if (!audioReady || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(volume, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  function emit(x, y, color, count = 8, speed = 80, life = .45) {
    const safeCount = Math.min(count, MAX_PARTICLES - particles.length);
    for (let i = 0; i < safeCount; i++) {
      const a = Math.random() * TAU;
      const s = speed * (.35 + Math.random() * .9);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, maxLife: life, size: 1.5 + Math.random() * 3.5, color });
    }
    while (particles.length > MAX_PARTICLES) particles.shift();
  }

  function addEffect(effect) {
    if (effects.length >= MAX_EFFECTS) effects.shift();
    effects.push(effect);
  }

  function clearStage() {
    if (stageClearQueued || state !== 'play') return;
    stageClearQueued = true;
    state = 'clear';
    const elapsed = Math.max(1, Math.round(stageSeconds));
    const stageGain = Math.max(100, 900 - shotNumber * 55 - elapsed * 4 + combo * 25);
    stageScore = stageGain;
    score += stageGain;
    progress.bestScore = Math.max(progress.bestScore, score);
    progress.bestTime = progress.bestTime === 0 ? elapsed : Math.min(progress.bestTime, elapsed);
    progress.maxStage = Math.max(progress.maxStage, Math.min(12, stage + 1));
    progress.unlocked = Math.min(6, Math.max(progress.unlocked, Math.min(3 + stage, 6)));
    saveProgress();
    emit(195, 300, '#c8ffcf', 42, 150, .95);
    tone(392, .12, 'triangle', .05);
    const advanceStage = () => {
      if (orientationPaused || document.hidden) { later(advanceStage, 760); return; }
      if (stage >= 12) {
        state = 'win';
        bootLayer.hidden = true;
        restartButton.textContent = 'Play again';
        announce.textContent = 'All twelve stages cleared. Victory.';
        tone(659, .2, 'triangle', .06);
      } else {
        stage += 1;
        state = 'play';
        buildStage(stage);
        restartButton.textContent = 'Restart';
      }
    };
    later(advanceStage, 760);
  }

  function failStage() {
    if (state !== 'play') return;
    state = 'fail';
    resetInput();
    restartButton.textContent = 'Retry stage';
    announce.textContent = `Stage ${stage} failed. Team vitality depleted.`;
    flash = .55;
    shake = 12;
    tone(120, .22, 'sawtooth', .055);
  }

  function startNewRun() {
    cancelTimers();
    resetInput();
    state = 'play';
    stage = 1;
    score = 0;
    stageScore = 0;
    activeSlot = 0;
    makeTeam();
    buildStage(stage);
    restartButton.textContent = 'Restart';
    announce.textContent = 'New run started.';
  }

  function restartStage() {
    cancelTimers();
    resetInput();
    state = 'play';
    buildStage(stage);
    restartButton.textContent = 'Restart';
    announce.textContent = `Stage ${stage} restarted.`;
  }

  function launch() {
    if (!player || player.launched || state !== 'play' || orientationPaused || audioGate) return;
    const dir = normalize(aim.x, aim.y);
    const power = clamp(170 + (Math.abs(dir.x) + Math.abs(dir.y)) * 36, 180, 245);
    player.vx = dir.x * power;
    player.vy = dir.y * power;
    player.launched = true;
    player.shotTime = 0;
    player.settle = 0;
    player.bounces = 0;
    player.banked = false;
    player.splitUsed = false;
    shotNumber = Math.min(999, shotNumber + 1);
    trails.length = 0;
    emit(player.x, player.y, roster[team[activeSlot]].color, 10, 65, .28);
    tone(210 + Math.abs(dir.x) * 80, .09, 'square', .035);
  }

  function hitEnemy(target, damage, source, normal) {
    if (!target || target.hitCooldown > 0) return;
    if (target.type === 'boss' && !bossWallsCleared() && !(source === 'player' && player.bounces > 0)) return;
    const creature = roster[team[activeSlot]];
    target.hp -= damage;
    target.hitCooldown = .12;
    target.flash = .18;
    combo = Math.min(99, combo + 1);
    score += damage * 12;
    emit(target.x, target.y, target.color, target.type === 'boss' ? 11 : 6, 88, .35);
    tone(target.type === 'boss' ? 130 : 250 + damage * 40, .045, 'square', .022);
    if (target.hp <= 0) {
      const value = target.type === 'boss' ? 500 : target.type === 'heavy' ? 130 : 80;
      score += value;
      emit(target.x, target.y, '#fdf0bc', target.type === 'boss' ? 26 : 12, 150, .7);
      shake = Math.max(shake, target.type === 'boss' ? 10 : 4);
      enemies = enemies.filter((item) => item !== target);
      addEffect({ kind: 'pop', x: target.x, y: target.y, t: .45, max: .45, color: target.color });
    }
    if (source === 'player' && creature.passive === 'SPLIT' && !player.splitUsed) {
      player.splitUsed = true;
      const base = Math.atan2(player.vy, player.vx);
      for (const offset of [-.42, .42]) {
        if (shards.length < MAX_SHARDS) shards.push({ x: player.x, y: player.y, vx: Math.cos(base + offset) * 150, vy: Math.sin(base + offset) * 150, r: 7, life: 1.8, hit: 0 });
      }
      emit(player.x, player.y, creature.color, 14, 110, .5);
      tone(520, .1, 'triangle', .035);
    }
    if (source === 'player' && creature.passive === 'PIERCE') {
      player.banked = player.banked || player.bounces > 0;
    }
    if (normal && source === 'player' && creature.passive !== 'PIERCE') {
      const dot = player.vx * normal.x + player.vy * normal.y;
      player.vx -= 2 * dot * normal.x;
      player.vy -= 2 * dot * normal.y;
      player.vx *= .88;
      player.vy *= .88;
    }
    if (source === 'player' && target.type !== 'boss') hurtTeam(target.type === 'heavy' ? 7 : 4);
  }

  function hurtTeam(amount) {
    const warded = effects.some((item) => item.kind === 'shield' && item.t > 0);
    if (warded) amount = Math.ceil(amount * .35);
    teamHP = clamp(teamHP - amount, 0, 100);
    flash = Math.max(flash, .16);
    shake = Math.max(shake, 4);
    if (teamHP <= 0) failStage();
  }

  function triggerAura(slot) {
    const id = team[slot];
    const creature = roster[id];
    const base = basePosition(slot);
    combo = Math.min(99, combo + 2);
    if (creature.aura === 'HEAL') {
      teamHP = clamp(teamHP + 18, 0, 100);
      addEffect({ kind: 'heal', x: base.x, y: base.y, t: .7, max: .7, color: creature.color });
      emit(base.x, base.y, creature.color, 18, 92, .62);
      tone(530, .16, 'sine', .04);
    } else if (creature.aura === 'SPARK') {
      addEffect({ kind: 'spark', x: base.x, y: base.y, t: .42, max: .42, color: creature.color });
      emit(base.x, base.y, creature.color, 22, 170, .5);
      for (const target of enemies.slice()) {
        if (Math.hypot(target.x - base.x, target.y - base.y) < 100) hitEnemy(target, 2, 'aura');
      }
      tone(760, .13, 'square', .04);
    } else if (creature.aura === 'SHIELD') {
      addEffect({ kind: 'shield', x: base.x, y: base.y, t: 4, max: 4, color: creature.color });
      emit(base.x, base.y, creature.color, 16, 76, .55);
      tone(340, .18, 'triangle', .045);
    } else {
      addEffect({ kind: 'pulse', x: base.x, y: base.y, t: .48, max: .48, color: creature.color });
      emit(base.x, base.y, creature.color, 10, 100, .4);
      tone(300, .07, 'sine', .025);
    }
    announce.textContent = `${creature.name} aura: ${creature.aura === 'HEAL' ? 'vitality restored' : creature.aura === 'SPARK' ? 'nearby foes shocked' : creature.aura === 'SHIELD' ? 'damage dampened' : creature.aura.toLowerCase()}.`;
  }

  function bossWallsCleared() {
    return walls.every((wall) => !wall.alive);
  }

  function wallCollision(wall) {
    if (!wall.alive || !player.launched) return false;
    const closestX = clamp(player.x, wall.x - wall.w / 2, wall.x + wall.w / 2);
    const closestY = clamp(player.y, wall.y - wall.h / 2, wall.y + wall.h / 2);
    const dx = player.x - closestX;
    const dy = player.y - closestY;
    if (dx * dx + dy * dy > player.r * player.r) return false;
    if (player.bounces > 0) {
      wall.hp -= 1;
      wall.flash = .22;
      player.banked = true;
      emit(wall.x, wall.y, '#ffd681', 12, 105, .4);
      tone(470, .08, 'square', .028);
      if (wall.hp <= 0) { wall.alive = false; score += 110; emit(wall.x, wall.y, '#c8ffcf', 20, 130, .58); }
    }
    const horizontal = Math.abs(dx) > Math.abs(dy);
    if (horizontal) player.vx *= -1; else player.vy *= -1;
    if (horizontal) player.x += dx > 0 ? 3 : -3; else player.y += dy > 0 ? 3 : -3;
    player.vx *= .9; player.vy *= .9;
    shake = Math.max(shake, 3);
    return true;
  }

  function updateAim(dt) {
    if (player?.launched || !player) return;
    let ax = 0;
    let ay = 0;
    if (keys.has('ArrowLeft')) ax -= 1;
    if (keys.has('ArrowRight')) ax += 1;
    if (keys.has('ArrowUp')) ay -= 1;
    if (keys.has('ArrowDown')) ay += 1;
    if (ax || ay) {
      const current = Math.atan2(aim.y, aim.x);
      const desired = Math.atan2(ay, ax);
      let diff = desired - current;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      const next = current + clamp(diff, -dt * 2.9, dt * 2.9);
      aim = { x: Math.cos(next), y: Math.sin(next) };
    }
  }

  function update(dt) {
    if (orientationPaused || document.hidden || audioGate) return;
    if (state !== 'play') {
      updateParticles(dt);
      return;
    }
    stageSeconds = Math.max(0, (performance.now() - stageStartedAt) / 1000);
    updateAim(dt);
    if (queuedActions.length) {
      const action = queuedActions.shift();
      if (action === 'launch') launch();
    }
    walls.forEach((wall) => { wall.flash = Math.max(0, wall.flash - dt); });
    enemies.forEach((item) => {
      item.hitCooldown = Math.max(0, item.hitCooldown - dt);
      item.flash = Math.max(0, item.flash - dt);
      if (roster[team[activeSlot]]?.passive === 'MAGNET' && player.launched && item.type !== 'boss') {
        const dx = player.x - item.x;
        const dy = player.y - item.y;
        const d = Math.hypot(dx, dy);
        if (d > 12 && d < 124) { item.vx += dx / d * 16 * dt; item.vy += dy / d * 16 * dt; }
      }
      item.x = clamp(item.x + item.vx * dt, ARENA.left + item.r, ARENA.right - item.r);
      item.y = clamp(item.y + item.vy * dt, ARENA.top + item.r, 408 - item.r);
      item.vx *= Math.pow(.02, dt);
      item.vy *= Math.pow(.02, dt);
    });
    updateShards(dt);
    updateEffects(dt);
    updateParticles(dt);
    if (!player.launched) return;
    player.shotTime += dt;
    player.invuln = Math.max(0, player.invuln - dt);
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.vx *= Math.pow(.19, dt);
    player.vy *= Math.pow(.19, dt);
    trails.push({ x: player.x, y: player.y, life: .34 });
    while (trails.length > 24) trails.shift();
    let bounced = false;
    if (player.x - player.r < ARENA.left) { player.x = ARENA.left + player.r; player.vx = Math.abs(player.vx); bounced = true; }
    if (player.x + player.r > ARENA.right) { player.x = ARENA.right - player.r; player.vx = -Math.abs(player.vx); bounced = true; }
    if (player.y - player.r < ARENA.top) { player.y = ARENA.top + player.r; player.vy = Math.abs(player.vy); bounced = true; }
    if (player.y + player.r > ARENA.bottom) { player.y = ARENA.bottom - player.r; player.vy = -Math.abs(player.vy); bounced = true; }
    if (bounced) {
      player.bounces = Math.min(20, player.bounces + 1);
      player.banked = true;
      emit(player.x, player.y, '#d9f5ff', 5, 50, .25);
      tone(165 + player.bounces * 14, .035, 'sine', .018);
    }
    for (const wall of walls) wallCollision(wall);
    for (const target of enemies.slice()) {
      const d = Math.hypot(player.x - target.x, player.y - target.y);
      if (d < player.r + target.r) {
        if (target.type === 'boss' && !bossWallsCleared() && player.bounces === 0) {
          hurtTeam(3);
          const n = normalize(player.x - target.x, player.y - target.y);
          const vx = Math.abs(player.vx), vy = Math.abs(player.vy);
          player.vx = vx * n.x - vy * n.y;
          player.vy = vx * n.y + vy * n.x;
          emit(target.x, target.y, '#ef9b86', 8, 75, .3);
        } else {
          const normal = normalize(player.x - target.x, player.y - target.y);
          hitEnemy(target, roster[team[activeSlot]].passive === 'PIERCE' ? 2 : 1, 'player', normal);
          player.x = target.x + normal.x * (player.r + target.r + 1);
          player.y = target.y + normal.y * (player.r + target.r + 1);
        }
      }
    }
    for (let i = 0; i < team.length; i++) {
      if (i === activeSlot) continue;
      const ally = basePosition(i);
      if (Math.hypot(player.x - ally.x, player.y - ally.y) < player.r + 22) {
        const auraKey = `ally-${i}`;
        const already = effects.some((item) => item.kind === auraKey);
        if (!already) {
          addEffect({ kind: auraKey, x: ally.x, y: ally.y, t: .46, max: .46, color: roster[team[i]].color });
          triggerAura(i);
          const n = normalize(player.x - ally.x, player.y - ally.y);
          player.vx = Math.abs(player.vx) * n.x;
          player.vy = Math.abs(player.vy) * n.y;
        }
      }
    }
    const speed = Math.hypot(player.vx, player.vy);
    if (speed < 24) player.settle += dt; else player.settle = 0;
    if (player.settle > .52 || player.shotTime > 8) endShot();
    if (!enemies.length && !walls.some((wall) => wall.alive)) clearStage();
    if (teamHP <= 0) failStage();
  }

  function endShot() {
    player.launched = false;
    player.vx = 0;
    player.vy = 0;
    const previous = activeSlot;
    activeSlot = (activeSlot + 1) % team.length;
    if (activeSlot === previous) activeSlot = 0;
    resetPlayer();
    renderTeamControls();
    if (enemies.length > 0) hurtTeam(Math.min(7, Math.max(1, enemies.length - 4)));
  }

  function updateShards(dt) {
    for (let i = shards.length - 1; i >= 0; i--) {
      const shard = shards[i];
      shard.life -= dt;
      shard.hit = Math.max(0, shard.hit - dt);
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      shard.vx *= Math.pow(.06, dt);
      shard.vy *= Math.pow(.06, dt);
      if (shard.x - shard.r < ARENA.left || shard.x + shard.r > ARENA.right) shard.vx *= -1;
      if (shard.y - shard.r < ARENA.top || shard.y + shard.r > ARENA.bottom) shard.vy *= -1;
      for (const target of enemies.slice()) {
        if (shard.hit <= 0 && Math.hypot(shard.x - target.x, shard.y - target.y) < shard.r + target.r) {
          shard.hit = .16;
          hitEnemy(target, 1, 'shard', normalize(shard.x - target.x, shard.y - target.y));
        }
      }
      if (shard.life <= 0) shards.splice(i, 1);
    }
  }

  function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      effects[i].t -= dt;
      if (effects[i].t <= 0) effects.splice(i, 1);
    }
    for (let i = trails.length - 1; i >= 0; i--) {
      trails[i].life -= dt;
      if (trails[i].life <= 0) trails.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(.08, dt);
      p.vy *= Math.pow(.08, dt);
      if (p.life <= 0) particles.splice(i, 1);
    }
    shake = Math.max(0, shake - dt * 18);
    flash = Math.max(0, flash - dt);
  }

  function guideEndpoint() {
    const origin = player;
    const dir = normalize(aim.x, aim.y);
    let best = 330;
    let hit = null;
    if (dir.x > 0) { const t = (ARENA.right - origin.r - origin.x) / dir.x; if (t > 0 && t < best) { best = t; hit = 'x'; } }
    if (dir.x < 0) { const t = (ARENA.left + origin.r - origin.x) / dir.x; if (t > 0 && t < best) { best = t; hit = 'x'; } }
    if (dir.y > 0) { const t = (ARENA.bottom - origin.r - origin.y) / dir.y; if (t > 0 && t < best) { best = t; hit = 'y'; } }
    if (dir.y < 0) { const t = (ARENA.top + origin.r - origin.y) / dir.y; if (t > 0 && t < best) { best = t; hit = 'y'; } }
    return { x: origin.x + dir.x * best, y: origin.y + dir.y * best, hit, dir };
  }

  function draw() {
    const sx = layout.dpr * layout.scale;
    const sy = layout.dpr * layout.scale;
    ctx.setTransform(sx, 0, 0, sy, layout.dpr * (layout.ox + shake * (Math.random() - .5)), layout.dpr * (layout.oy + shake * (Math.random() - .5)));
    ctx.clearRect(-20, -20, VW + 40, VH + 40);
    drawBackground();
    ctx.save();
    roundRect(10, 10, 370, 590, 24, '#111a28', 'rgba(203,230,246,.16)', 1);
    ctx.clip();
    drawArena();
    ctx.restore();
    drawHud();
    drawBottomHint();
    if (state === 'fail') drawStateCard('RUN OUT', 'The team vitality pool hit zero.', 'Retry this stage');
    if (state === 'clear') drawStateCard('FORMATION CLEARED', `+${stageScore} score  •  next stage loading`, progress.unlocked >= Math.min(6, stage + 3) ? 'Roster expanded' : 'Nice bank');
    if (state === 'win') drawStateCard('Slingfang complete', `12 stages cleared  •  ${score} score`, 'Play again');
  }

  function drawBackground() {
    const bg = ctx.createLinearGradient(0, 0, 0, VH);
    bg.addColorStop(0, '#0b111c'); bg.addColorStop(.55, '#111d2b'); bg.addColorStop(1, '#0d1521');
    ctx.fillStyle = bg; ctx.fillRect(-1, -1, VW + 2, VH + 2);
    for (const dot of backdropDots) { ctx.fillStyle = `rgba(160,216,232,${dot.a})`; ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.r, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(133,179,201,.055)'; ctx.lineWidth = 1;
    for (let x = 20; x < VW; x += 26) { ctx.beginPath(); ctx.moveTo(x, 94); ctx.lineTo(x, 612); ctx.stroke(); }
    for (let y = 110; y < 612; y += 26) { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(380, y); ctx.stroke(); }
  }

  function drawArena() {
    const field = ctx.createLinearGradient(0, ARENA.top, 0, ARENA.bottom);
    field.addColorStop(0, '#15283a'); field.addColorStop(1, '#101a27');
    roundRect(17, 116, 356, 462, 19, field, 'rgba(175,221,239,.22)', 1.5);
    ctx.save();
    ctx.globalAlpha = .23;
    ctx.setLineDash([5, 9]);
    ctx.strokeStyle = '#8acbd6';
    ctx.beginPath(); ctx.moveTo(25, 420); ctx.lineTo(365, 420); ctx.stroke();
    ctx.restore();
    for (const wall of walls) drawWall(wall);
    for (const trail of trails) { ctx.fillStyle = `rgba(178,239,245,${trail.life * .7})`; ctx.beginPath(); ctx.arc(trail.x, trail.y, 3 + trail.life * 5, 0, TAU); ctx.fill(); }
    for (const target of enemies) drawEnemy(target);
    for (const shard of shards) { ctx.fillStyle = '#ffd47c'; ctx.shadowColor = '#ffb15c'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(shard.x, shard.y, shard.r, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; }
    for (let i = 0; i < team.length; i++) drawAlly(i);
    drawGuide();
    if (player) drawPlayer();
    for (const effect of effects) drawEffect(effect);
    for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    ctx.fillStyle = '#eff7ff'; ctx.font = '800 21px system-ui, sans-serif'; ctx.fillText('SLINGFANG', 26, 38);
    ctx.fillStyle = '#7ee7ef'; ctx.font = '800 10px system-ui, sans-serif'; ctx.letterSpacing = '1px'; ctx.fillText(`STAGE ${String(stage).padStart(2, '0')} / 12`, 28, 57);
    ctx.fillStyle = '#8091a6'; ctx.font = '700 10px system-ui, sans-serif'; ctx.fillText(`BEST ${String(progress.bestScore).padStart(5, '0')}`, 28, 74);
    ctx.fillStyle = '#8899ae'; ctx.fillText('VITALITY', 157, 29);
    roundRect(157, 36, 112, 11, 6, '#202d3b', null, 0);
    roundRect(157, 36, 112 * teamHP / 100, 11, 6, teamHP > 35 ? '#8ee8b0' : '#ff8776', null, 0);
    ctx.fillStyle = '#eff7ff'; ctx.font = '800 12px system-ui, sans-serif'; ctx.fillText(`${Math.ceil(teamHP)}%`, 274, 46);
    ctx.fillStyle = '#c6d5e2'; ctx.font = '700 12px system-ui, sans-serif'; ctx.fillText(`SCORE ${String(score).padStart(5, '0')}`, 280, 69);
    ctx.fillStyle = '#7f91a6'; ctx.font = '600 10px system-ui, sans-serif'; ctx.fillText(`${Math.floor(stageSeconds)}s  •  SHOT ${shotNumber}`, 280, 84);
  }

  function drawBottomHint() {
    ctx.fillStyle = '#91a0b7'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(player?.launched ? 'Contact damages foes • bank off walls for better angles' : 'Drag back from your fang, then release  •  arrows + space', 195, 618);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#52647b'; ctx.font = '700 9px system-ui, sans-serif'; ctx.fillText(`TEAM ${team.map((id) => roster[id].short).join('  ·  ')}`, 23, 674);
  }

  function drawStateCard(title, subtitle, action) {
    ctx.fillStyle = 'rgba(7, 12, 19, .77)'; ctx.fillRect(10, 10, 370, 590);
    roundRect(37, 216, 316, 188, 24, '#162436', 'rgba(190,230,239,.25)', 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = state === 'fail' ? '#ff9e85' : state === 'win' ? '#c8ffcf' : '#8feaf0';
    ctx.font = '900 26px system-ui, sans-serif'; ctx.fillText(title, 195, 271);
    ctx.fillStyle = '#bdcadb'; ctx.font = '600 13px system-ui, sans-serif'; ctx.fillText(subtitle, 195, 301);
    ctx.fillStyle = '#7f93a9'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillText(action.toUpperCase(), 195, 354);
    ctx.fillStyle = '#5d7189'; ctx.font = '600 10px system-ui, sans-serif'; ctx.fillText('Use the button in the top-right', 195, 379);
    ctx.textAlign = 'left';
  }

  function drawWall(wall) {
    if (!wall.alive) return;
    ctx.save();
    ctx.translate(wall.x, wall.y);
    ctx.shadowColor = '#ffbd6d'; ctx.shadowBlur = wall.flash ? 22 : 9;
    roundRect(-wall.w / 2, -wall.h / 2, wall.w, wall.h, 6, wall.flash ? '#fff0a8' : '#c07656', 'rgba(255,223,157,.7)', 1);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffe4a0'; ctx.font = '900 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`BANK ${wall.hp}`, 0, 3); ctx.restore();
  }

  function drawEnemy(item) {
    ctx.save(); ctx.translate(item.x, item.y);
    ctx.globalAlpha = item.flash ? .7 + item.flash : 1;
    ctx.shadowColor = item.color; ctx.shadowBlur = item.type === 'boss' ? 22 : 12;
    ctx.fillStyle = rgba(item.color, .24);
    ctx.beginPath(); ctx.arc(0, 2, item.r + 6, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = item.color;
    if (item.type === 'boss') {
      polygon(0, -item.r, item.r * .88, -item.r * .36, item.r * .72, item.r * .65, 0, item.r, -item.r * .72, item.r * .65, -item.r * .88, -item.r * .36);
      ctx.fillStyle = '#351c34'; ctx.beginPath(); ctx.arc(-9, -3, 4, 0, TAU); ctx.arc(9, -3, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff1b8'; ctx.beginPath(); ctx.arc(-8, -4, 1.5, 0, TAU); ctx.arc(10, -4, 1.5, 0, TAU); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, item.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#202538'; ctx.beginPath(); ctx.arc(-5, -2, 3.3, 0, TAU); ctx.arc(5, -2, 3.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.arc(-4.5, -2.4, 1.1, 0, TAU); ctx.arc(5.5, -2.4, 1.1, 0, TAU); ctx.fill();
      if (item.type === 'heavy') { ctx.strokeStyle = '#ffedaa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, item.r - 4, .4, 2.8); ctx.stroke(); }
    }
    ctx.restore();
    if (item.maxHp > 1) { roundRect(item.x - 18, item.y - item.r - 10, 36, 4, 2, '#283746', null, 0); roundRect(item.x - 18, item.y - item.r - 10, 36 * clamp(item.hp / item.maxHp, 0, 1), 4, 2, '#ffd67a', null, 0); }
  }

  function drawAlly(slot) {
    const pos = basePosition(slot); const id = team[slot]; const info = roster[id];
    const active = slot === activeSlot && !player?.launched;
    ctx.save(); ctx.translate(pos.x, pos.y);
    ctx.shadowColor = info.color; ctx.shadowBlur = active ? 22 : 9;
    ctx.fillStyle = rgba(info.color, active ? .26 : .12); ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = info.color; ctx.beginPath(); ctx.arc(0, 0, 21, 0, TAU); ctx.fill();
    ctx.fillStyle = '#182330'; ctx.font = '900 17px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(info.sigil, 0, 6);
    ctx.strokeStyle = active ? '#f4ffff' : 'rgba(221,244,249,.4)'; ctx.lineWidth = active ? 2 : 1; ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = active ? '#effcff' : '#7890a7'; ctx.font = '800 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(info.short, pos.x, pos.y + 35); ctx.textAlign = 'left';
  }

  function drawPlayer() {
    const info = roster[team[activeSlot]];
    ctx.save(); ctx.translate(player.x, player.y);
    if (!player.launched) { ctx.strokeStyle = rgba(info.color, .28); ctx.lineWidth = 2; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.arc(0, 0, 27 + Math.sin(nowMs / 190) * 2, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
    ctx.shadowColor = info.color; ctx.shadowBlur = 24; ctx.fillStyle = info.color; ctx.beginPath(); ctx.arc(0, 0, player.r, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#142131'; ctx.beginPath(); ctx.arc(-6, -3, 3.4, 0, TAU); ctx.arc(6, -3, 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f7ffff'; ctx.beginPath(); ctx.arc(-5.3, -3.5, 1, 0, TAU); ctx.arc(6.7, -3.5, 1, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawGuide() {
    if (!player || player.launched || state !== 'play' || audioGate) return;
    const endpoint = guideEndpoint();
    const length = Math.hypot(endpoint.x - player.x, endpoint.y - player.y);
    ctx.save();
    ctx.strokeStyle = 'rgba(212,247,249,.82)'; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
    ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(endpoint.x, endpoint.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#f4ffff'; ctx.beginPath(); ctx.arc(endpoint.x, endpoint.y, 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(roster[team[activeSlot]].color, .55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(endpoint.x, endpoint.y, 10 + Math.min(9, length / 35), 0, TAU); ctx.stroke();
    if (endpoint.hit) {
      const reflect = endpoint.hit === 'x' ? { x: -endpoint.dir.x, y: endpoint.dir.y } : { x: endpoint.dir.x, y: -endpoint.dir.y };
      ctx.strokeStyle = 'rgba(212,247,249,.38)'; ctx.beginPath(); ctx.moveTo(endpoint.x, endpoint.y); ctx.lineTo(endpoint.x + reflect.x * 108, endpoint.y + reflect.y * 108); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEffect(effect) {
    const p = clamp(effect.t / effect.max, 0, 1);
    ctx.save(); ctx.globalAlpha = p;
    if (effect.kind === 'heal' || effect.kind === 'shield' || effect.kind === 'pulse' || effect.kind.startsWith('ally-')) {
      ctx.strokeStyle = effect.color; ctx.lineWidth = effect.kind === 'shield' ? 3 : 2; ctx.beginPath(); ctx.arc(effect.x, effect.y, 22 + (1 - p) * (effect.kind === 'shield' ? 34 : 35), 0, TAU); ctx.stroke();
      if (effect.kind === 'shield') { ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.arc(effect.x, effect.y, 29, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
    } else if (effect.kind === 'spark') {
      ctx.strokeStyle = effect.color; ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(effect.x + Math.cos(a) * 12, effect.y + Math.sin(a) * 12); ctx.lineTo(effect.x + Math.cos(a) * (74 - p * 28), effect.y + Math.sin(a) * (74 - p * 28)); ctx.stroke(); }
    } else if (effect.kind === 'pop') {
      ctx.strokeStyle = effect.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(effect.x, effect.y, (1 - p) * 38, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r, fill, stroke, lineWidth) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  function polygon(...points) {
    ctx.beginPath(); ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath(); ctx.fill();
  }

  function renderTeamControls() {
    teamControls.replaceChildren();
    roster.forEach((info, id) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'team-button'; button.dataset.id = String(id); button.style.setProperty('--button-color', info.color);
      button.innerHTML = `<span class="sigil">${info.sigil}</span><span>${info.short}</span>`;
      const unlocked = id < progress.unlocked;
      const selected = team.includes(id);
      button.disabled = !unlocked;
      button.classList.toggle('locked', !unlocked); button.classList.toggle('active', selected && team[activeSlot] === id);
      button.title = unlocked ? `${info.name}: ${info.passive}. Tap to make your next fang.` : 'Unlock by clearing stages';
      if (unlocked) {
        button.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          if (orientationPaused || document.hidden || buttonPointers.has(id) || state === 'clear' || state === 'win' || state === 'fail') return;
          buttonPointers.set(id, event.pointerId);
          try { button.setPointerCapture(event.pointerId); } catch (_) {}
        }, { passive: false });
        button.addEventListener('pointerup', (event) => {
          event.preventDefault();
          if (buttonPointers.get(id) !== event.pointerId) return;
          buttonPointers.delete(id);
          if (state === 'play' && player && !player.launched) selectCreature(id);
        }, { passive: false });
        button.addEventListener('pointercancel', (event) => { if (buttonPointers.get(id) === event.pointerId) buttonPointers.delete(id); }, { passive: false });
        button.addEventListener('lostpointercapture', () => { buttonPointers.delete(id); });
        button.addEventListener('click', (event) => { if (event.detail === 0 && state === 'play' && player && !player.launched) selectCreature(id); });
      }
      teamControls.appendChild(button);
    });
  }

  function selectCreature(id) {
    if (id < 0 || id >= progress.unlocked || state !== 'play' || player?.launched) return;
    const existing = team.indexOf(id);
    if (existing >= 0) activeSlot = existing;
    else {
      team[activeSlot] = id;
      activeSlot = clamp(activeSlot, 0, 2);
    }
    resetPlayer();
    renderTeamControls();
    announce.textContent = `${roster[id].name} selected. Passive: ${roster[id].passive.toLowerCase()}.`;
  }

  function onPointerDown(event) {
    if (orientationPaused || document.hidden || audioGate || state !== 'play' || !player || player.launched) return;
    event.preventDefault();
    if (aimPointerId !== null) return;
    const p = worldPoint(event.clientX, event.clientY);
    if (Math.hypot(p.x - player.x, p.y - player.y) > 34) return;
    aimPointerId = event.pointerId;
    aimStart = { x: p.x, y: p.y };
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
  }

  function onPointerMove(event) {
    if (event.pointerId !== aimPointerId || orientationPaused || document.hidden || !aimStart || !player || player.launched) return;
    event.preventDefault();
    const p = worldPoint(event.clientX, event.clientY);
    const dragX = aimStart.x - p.x;
    const dragY = aimStart.y - p.y;
    if (Math.hypot(dragX, dragY) > 5) aim = normalize(dragX, dragY);
  }

  function endPointer(event, shouldLaunch) {
    if (event.pointerId !== aimPointerId) return;
    event.preventDefault();
    aimPointerId = null; aimStart = null;
    if (shouldLaunch && !orientationPaused && !document.hidden) launch();
  }

  function handleKeyDown(event) {
    if (orientationPaused || document.hidden) return;
    if (audioGate && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      boot();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === ' ') {
      event.preventDefault();
      keys.add(event.key);
      if (event.key === ' ' && !event.repeat && queuedActions.length < 8) queuedActions.push('launch');
    }
    if (event.key.toLowerCase() === 'r') restartButton.click();
  }

  function releaseAllInput() { resetInput(); }

  function boot() {
    startAudio();
    cancelTimers();
    audioGate = false;
    bootLayer.hidden = true;
    resetInput();
    stage = clampInt(progress.maxStage, 1, 12, 1);
    makeTeam();
    buildStage(stage);
    announce.textContent = 'Arena awake. Drag from the glowing fang.';
    tone(260, .08, 'triangle', .035);
  }

  bootButton.addEventListener('pointerdown', (event) => { event.preventDefault(); if (bootPointerId !== null) return; bootPointerId = event.pointerId; try { bootButton.setPointerCapture(event.pointerId); } catch (_) {} }, { passive: false });
  bootButton.addEventListener('pointerup', (event) => { event.preventDefault(); if (bootPointerId !== event.pointerId) return; bootPointerId = null; boot(); }, { passive: false });
  bootButton.addEventListener('pointercancel', (event) => { if (bootPointerId === event.pointerId) bootPointerId = null; try { bootButton.releasePointerCapture(event.pointerId); } catch (_) {} }, { passive: false });
  bootButton.addEventListener('click', (event) => { if (event.detail === 0) boot(); });
  restartButton.addEventListener('pointerdown', (event) => { event.preventDefault(); if (orientationPaused || document.hidden) return; buttonPointers.set('restart', event.pointerId); try { restartButton.setPointerCapture(event.pointerId); } catch (_) {} }, { passive: false });
  restartButton.addEventListener('pointerup', (event) => {
    event.preventDefault();
    if (buttonPointers.get('restart') !== event.pointerId) return;
    buttonPointers.delete('restart');
    if (state === 'win') startNewRun(); else restartStage();
  }, { passive: false });
  restartButton.addEventListener('pointercancel', (event) => { if (buttonPointers.get('restart') === event.pointerId) buttonPointers.delete('restart'); }, { passive: false });
  restartButton.addEventListener('click', (event) => { if (event.detail === 0) { if (state === 'win') startNewRun(); else restartStage(); } });
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', (event) => endPointer(event, true), { passive: false });
  canvas.addEventListener('pointercancel', (event) => endPointer(event, false), { passive: false });
  canvas.addEventListener('lostpointercapture', () => { aimPointerId = null; aimStart = null; });
  window.addEventListener('keydown', handleKeyDown, { passive: false });
  window.addEventListener('keyup', (event) => { keys.delete(event.key); }, { passive: false });
  window.addEventListener('blur', releaseAllInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseAllInput(); lastFrame = performance.now(); } updateLayout(); });
  window.addEventListener('resize', updateLayout, { passive: true });
  window.addEventListener('orientationchange', updateLayout, { passive: true });
  updateLayout();
  makeTeam();
  buildStage(stage);

  function frame(timestamp) {
    nowMs = timestamp;
    const paused = orientationPaused || document.hidden || audioGate;
    const dt = paused ? 0 : clamp((timestamp - lastFrame) / 1000, 0, .033);
    lastFrame = timestamp;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
