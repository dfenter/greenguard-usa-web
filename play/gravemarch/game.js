(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const STORAGE_KEY = 'gravemarch-save-v1';
  const MAX_PARTICLES = 180;
  const MAX_DAMAGE_NUMBERS = 42;
  const MAX_ENEMIES = 12;
  const MAX_POINTERS = 8;
  const RARITIES = [
    { name: 'Worn', short: 'WORN', chance: .60, color: '#b6b9c3', mult: .82 },
    { name: 'Etched', short: 'ETCHED', chance: .27, color: '#75e6df', mult: 1.05 },
    { name: 'Radiant', short: 'RADIANT', chance: .10, color: '#f3b66d', mult: 1.38 },
    { name: 'Singular', short: 'SINGULAR', chance: .03, color: '#c19cff', mult: 1.9 }
  ];
  const SLOT_NAMES = { weapon: 'Hollow Pike', armor: 'Mothglass Coat', charm: 'Tide-Eye Knot' };
  const SLOT_LABELS = { weapon: 'WEAPON', armor: 'ARMOR', charm: 'CHARM' };
  const state = {
    phase: 'playing',
    floor: 1,
    highestFloor: 1,
    bestTime: 0,
    floorTime: 0,
    runSeconds: 0,
    floorProfile: null,
    spawnQueue: [],
    spawnClock: .25,
    enemies: [],
    particles: [],
    damageNumbers: [],
    gear: null,
    gearScore: 0,
    hero: { x: 0, y: 0, hp: 100, maxHp: 100, attackClock: .25, rollTime: 0, rollCooldown: 0, invuln: 0, rollDx: 0, rollDy: 0 },
    skills: { pulse: 0, hook: 0 },
    toast: { text: '', until: 0, color: '#f3b66d' },
    shake: 0,
    hitFlash: 0,
    manualOpen: false,
    orientationPaused: false,
    tabPaused: false,
    lastUiSync: 0,
    statusPhase: ''
  };

  let viewW = 390;
  let viewH = 700;
  let backingScale = 1;
  let lastFrame = 0;
  let audioContext = null;
  const pressedKeys = new Set();
  const surfacePointers = new Map();
  const controlButtons = [];
  const pendingTimeouts = new Set();

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function pick(values) { return values[Math.floor(Math.random() * values.length)]; }
  function pushLimited(list, value, limit) {
    list.push(value);
    if (list.length > limit) list.splice(0, list.length - limit);
  }
  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }

  function safeStorageRead() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (typeof raw !== 'string' || raw.length > 24000) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_) { return null; }
  }

  function safeStorageWrite(value) {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch (_) { /* storage is optional */ }
  }

  function validSlot(slot) { return slot === 'weapon' || slot === 'armor' || slot === 'charm'; }

  function defaultItem(slot) {
    const power = slot === 'weapon' ? 5 : slot === 'armor' ? 5 : 2;
    return { slot, rarity: 0, score: 10, power, name: SLOT_NAMES[slot], id: `starter-${slot}` };
  }

  function freshGear() {
    return { weapon: defaultItem('weapon'), armor: defaultItem('armor'), charm: defaultItem('charm') };
  }

  function sanitizeItem(raw, slot) {
    if (!raw || typeof raw !== 'object' || !validSlot(slot)) return defaultItem(slot);
    const rarity = clamp(Number.isInteger(raw.rarity) ? raw.rarity : 0, 0, RARITIES.length - 1);
    const score = Number.isFinite(raw.score) ? clamp(Math.round(raw.score), 1, 9999) : 10;
    const power = Number.isFinite(raw.power) ? clamp(Math.round(raw.power * 10) / 10, 1, 9999) : 5;
    const name = typeof raw.name === 'string' && raw.name.length > 0 && raw.name.length < 80 ? raw.name : SLOT_NAMES[slot];
    const id = typeof raw.id === 'string' && raw.id.length < 100 ? raw.id : `saved-${slot}`;
    return { slot, rarity, score, power, name, id };
  }

  function loadSave() {
    const raw = safeStorageRead();
    const gear = freshGear();
    if (!raw) return { depth: 1, highestFloor: 1, bestTime: 0, gear };
    for (const slot of Object.keys(gear)) gear[slot] = sanitizeItem(raw.gear && raw.gear[slot], slot);
    const depth = Number.isFinite(raw.depth) ? clamp(Math.floor(raw.depth), 1, 30) : 1;
    const highestFloor = Number.isFinite(raw.highestFloor) ? clamp(Math.floor(raw.highestFloor), 1, 30) : depth;
    const bestTime = Number.isFinite(raw.bestTime) && raw.bestTime > 0 ? clamp(raw.bestTime, 1, 999999) : 0;
    return { depth, highestFloor: Math.max(depth, highestFloor), bestTime, gear };
  }

  function saveProgress() {
    safeStorageWrite({
      depth: clamp(Math.floor(state.floor), 1, 30),
      highestFloor: clamp(Math.floor(state.highestFloor), 1, 30),
      bestTime: Number.isFinite(state.bestTime) ? state.bestTime : 0,
      gear: state.gear
    });
  }

  function recalculateStats() {
    state.gearScore = Object.values(state.gear).reduce((sum, item) => sum + item.score, 0);
    state.hero.maxHp = 100 + state.gear.armor.power * 7 + state.gear.charm.power * 2;
    state.hero.hp = clamp(state.hero.hp, 0, state.hero.maxHp);
  }

  function currentDps() {
    return Math.max(1, state.gear.weapon.power * (1 + state.gear.charm.power * .04));
  }

  function doorRequirement(nextFloor) {
    return Math.ceil(20 + nextFloor * 7.5);
  }

  function createFloorProfile(floor) {
    const boss = floor % 10 === 0;
    const minions = boss ? Math.min(4, 2 + Math.floor(floor / 10)) : Math.min(6, 2 + Math.floor(floor / 6));
    const queue = [];
    for (let i = 0; i < minions; i += 1) queue.push('shade');
    if (boss) queue.push('warden');
    return { floor, boss, minions, queue, baseHp: 32 + floor * 9, baseDamage: 5 + floor * .9 };
  }

  function makeEnemy(kind) {
    const p = state.floorProfile;
    const isBoss = kind === 'warden';
    const hp = isBoss ? p.baseHp * (8 + p.floor * .08) : p.baseHp * rand(.9, 1.15);
    const edge = Math.random() < .5 ? -1 : 1;
    return {
      kind,
      x: viewW * .5 + edge * rand(42, 105),
      y: rand(198, 295),
      hp,
      maxHp: hp,
      radius: isBoss ? 31 : rand(16, 22),
      speed: isBoss ? 22 + p.floor * .2 : 28 + p.floor * .7,
      damage: isBoss ? p.baseDamage * 2.2 : p.baseDamage,
      attackClock: rand(.5, 1.3),
      attackGap: isBoss ? 1.8 : 1.35,
      stun: 0,
      phase: rand(0, TAU),
      dead: false
    };
  }

  function clearPendingTimers() {
    for (const timer of pendingTimeouts) window.clearTimeout(timer);
    pendingTimeouts.clear();
  }

  function schedule(fn, delay) {
    const timer = window.setTimeout(() => {
      pendingTimeouts.delete(timer);
      fn();
    }, delay);
    pendingTimeouts.add(timer);
    return timer;
  }

  function showToast(text, color = '#f3b66d', duration = 3000) {
    state.toast = { text, color, until: performance.now() + duration };
    $('toast').textContent = text;
    $('toast').style.borderLeftColor = color;
    $('toast').classList.add('visible');
  }

  function hideToast() {
    $('toast').classList.remove('visible');
  }

  function unlockAudio() {
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      try { audioContext = new AudioCtor(); } catch (_) { audioContext = null; }
    }
    if (audioContext && audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  }

  function tone(frequency, duration, type = 'sine', volume = .035) {
    if (!audioContext || audioContext.state !== 'running') return;
    try {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      osc.connect(gain).connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + duration);
    } catch (_) { /* sound is decorative */ }
  }

  function releaseAllInput() {
    pressedKeys.clear();
    surfacePointers.clear();
    for (const button of controlButtons) {
      if (button._activePointerId !== null) {
        try { button.releasePointerCapture(button._activePointerId); } catch (_) {}
      }
      button._activePointerId = null;
      button.classList.remove('pressed');
    }
  }

  function bindControl(button, action) {
    button._action = action;
    button._activePointerId = null;
    button._lastPointerAction = -1000;
    controlButtons.push(button);
    button.addEventListener('pointerdown', (event) => {
      if (button._activePointerId !== null) return;
      event.preventDefault();
      unlockAudio();
      button._activePointerId = event.pointerId;
      button._lastPointerAction = performance.now();
      button.classList.add('pressed');
      try { button.setPointerCapture(event.pointerId); } catch (_) {}
      if (typeof button._action === 'function' && !button.disabled) button._action();
    }, { passive: false });
    const release = (event) => {
      if (button._activePointerId !== event.pointerId) return;
      event.preventDefault();
      button._activePointerId = null;
      button.classList.remove('pressed');
    };
    button.addEventListener('pointerup', release, { passive: false });
    button.addEventListener('pointercancel', release, { passive: false });
    button.addEventListener('lostpointercapture', () => { button._activePointerId = null; button.classList.remove('pressed'); });
    button.addEventListener('click', () => {
      if (performance.now() - button._lastPointerAction < 450) return;
      unlockAudio();
      if (typeof button._action === 'function' && !button.disabled) button._action();
    });
  }

  function spawnParticles(x, y, color, count = 8, speed = 80) {
    const amount = Math.min(count, MAX_PARTICLES - state.particles.length);
    for (let i = 0; i < amount; i += 1) {
      const angle = rand(0, TAU);
      const velocity = rand(speed * .35, speed);
      pushLimited(state.particles, { x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life: rand(.25, .65), maxLife: .65, size: rand(1.5, 4), color }, MAX_PARTICLES);
    }
  }

  function addDamageNumber(x, y, text, color) {
    pushLimited(state.damageNumbers, { x, y, text, color, life: .8, maxLife: .8, drift: rand(8, 18) }, MAX_DAMAGE_NUMBERS);
  }

  function rollRarity() {
    const value = Math.random();
    let sum = 0;
    for (let i = 0; i < RARITIES.length; i += 1) {
      sum += RARITIES[i].chance;
      if (value <= sum) return i;
    }
    return 0;
  }

  function createLootItem(slot) {
    const rarity = rollRarity();
    const r = RARITIES[rarity];
    const floor = state.floor;
    const base = 8 + floor * 1.55 + rand(0, floor * 1.4 + 2);
    const score = Math.max(1, Math.round(base * r.mult));
    const powerBase = slot === 'weapon' ? 4 + floor * .62 : slot === 'armor' ? 4 + floor * .78 : 2 + floor * .34;
    const power = Math.max(1, Math.round(powerBase * r.mult + rand(0, 2)));
    return { slot, rarity, score, power, name: `${r.short} ${SLOT_NAMES[slot]}`, id: `${floor}-${slot}-${Date.now()}-${Math.random()}` };
  }

  function collectLoot(enemy) {
    if (!enemy || (enemy.kind !== 'warden' && Math.random() > .45)) return;
    const item = createLootItem(pick(['weapon', 'armor', 'charm']));
    const old = state.gear[item.slot];
    const rarity = RARITIES[item.rarity];
    if (item.score > old.score) {
      state.gear[item.slot] = item;
      recalculateStats();
      saveProgress();
      showToast(`AUTO-EQUIP  ${SLOT_LABELS[item.slot]} +${item.score - old.score}  |  ${old.score} → ${item.score}`, rarity.color, 3400);
      tone(item.rarity >= 2 ? 660 : 440, .12, 'triangle', .04);
    } else {
      showToast(`LOOT  ${rarity.short} ${SLOT_LABELS[item.slot]}  ${item.score} score  |  kept ${old.score}`, rarity.color, 1900);
      tone(330, .07, 'sine', .018);
    }
  }

  function startFloor(floor) {
    clearPendingTimers();
    releaseAllInput();
    state.floor = clamp(Math.floor(floor), 1, 30);
    state.floorProfile = createFloorProfile(state.floor);
    state.spawnQueue = state.floorProfile.queue.slice(0, 16);
    state.spawnClock = .25;
    state.enemies.length = 0;
    state.particles.length = 0;
    state.damageNumbers.length = 0;
    state.floorTime = 0;
    state.phase = 'playing';
    state.statusPhase = '';
    state.skills.pulse = 0;
    state.skills.hook = 0;
    state.hero.x = viewW * .5;
    state.hero.y = viewH * .69;
    state.hero.rollTime = 0;
    state.hero.rollCooldown = 0;
    state.hero.invuln = 0;
    state.hero.attackClock = .3;
    recalculateStats();
    state.hero.hp = state.hero.maxHp;
    state.highestFloor = Math.max(state.highestFloor, state.floor);
    saveProgress();
    hideToast();
    syncStatusPanel();
  }

  function startAgain() {
    clearPendingTimers();
    releaseAllInput();
    state.runSeconds = 0;
    startFloor(1);
  }

  function spawnNextEnemy() {
    if (!state.spawnQueue.length || state.enemies.length >= MAX_ENEMIES) return;
    const kind = state.spawnQueue.shift();
    pushLimited(state.enemies, makeEnemy(kind), MAX_ENEMIES);
    spawnParticles(viewW * .5 + rand(-80, 80), rand(185, 285), kind === 'warden' ? '#c19cff' : '#75e6df', kind === 'warden' ? 20 : 8, 45);
    tone(kind === 'warden' ? 130 : 190, kind === 'warden' ? .25 : .08, 'sawtooth', .025);
  }

  function nearestEnemy() {
    let best = null;
    let bestDistance = Infinity;
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const distance = Math.hypot(enemy.x - state.hero.x, enemy.y - state.hero.y);
      if (distance < bestDistance) { best = enemy; bestDistance = distance; }
    }
    return best;
  }

  function defeatEnemy(enemy) {
    if (!enemy || enemy.dead) return;
    enemy.dead = true;
    spawnParticles(enemy.x, enemy.y, enemy.kind === 'warden' ? '#c19cff' : '#75e6df', enemy.kind === 'warden' ? 34 : 15, enemy.kind === 'warden' ? 130 : 95);
    state.shake = Math.max(state.shake, enemy.kind === 'warden' ? 12 : 4);
    addDamageNumber(enemy.x, enemy.y - enemy.radius - 7, 'CLEARED', enemy.kind === 'warden' ? '#c19cff' : '#75e6df');
    collectLoot(enemy);
    tone(enemy.kind === 'warden' ? 260 : 200, enemy.kind === 'warden' ? .22 : .08, 'triangle', .035);
  }

  function damageEnemy(enemy, amount, color = '#f0e8d9') {
    if (!enemy || enemy.dead || state.phase !== 'playing') return;
    const safeAmount = Math.max(0, Number.isFinite(amount) ? amount : 0);
    enemy.hp -= safeAmount;
    enemy.stun = Math.max(enemy.stun, color === '#c19cff' ? .8 : 0);
    addDamageNumber(enemy.x + rand(-4, 4), enemy.y - enemy.radius, `-${Math.max(1, Math.round(safeAmount))}`, color);
    spawnParticles(enemy.x, enemy.y, color, Math.min(5, 2 + Math.floor(safeAmount / 20)), 58);
    state.shake = Math.max(state.shake, color === '#c19cff' ? 7 : 2);
    if (enemy.hp <= 0) defeatEnemy(enemy);
  }

  function usePulse() {
    if (state.phase !== 'playing' || state.manualOpen || state.orientationPaused || state.tabPaused || state.skills.pulse > 0) return;
    state.skills.pulse = 7;
    const power = currentDps() * 2.4;
    let hits = 0;
    for (const enemy of state.enemies) {
      if (Math.hypot(enemy.x - state.hero.x, enemy.y - state.hero.y) < 205) { damageEnemy(enemy, power, '#75e6df'); hits += 1; }
    }
    spawnParticles(state.hero.x, state.hero.y, '#75e6df', 32, 180);
    state.shake = Math.max(state.shake, 9);
    tone(520, .18, 'square', .03);
    if (hits === 0) showToast('RIFT PULSE  ready when a shade enters the ring', '#75e6df', 1300);
  }

  function useHook() {
    if (state.phase !== 'playing' || state.manualOpen || state.orientationPaused || state.tabPaused || state.skills.hook > 0) return;
    const enemy = nearestEnemy();
    if (!enemy) return;
    state.skills.hook = 11;
    damageEnemy(enemy, currentDps() * 4.2, '#c19cff');
    enemy.stun = 1.8;
    enemy.x = state.hero.x + clamp(enemy.x - state.hero.x, -82, 82);
    enemy.y = state.hero.y - 116;
    spawnParticles(state.hero.x, state.hero.y - 45, '#c19cff', 24, 160);
    state.shake = Math.max(state.shake, 12);
    tone(250, .25, 'sawtooth', .035);
  }

  function dodge(dx, dy) {
    if (state.phase !== 'playing' || state.manualOpen || state.orientationPaused || state.tabPaused || state.hero.rollCooldown > 0 || state.hero.rollTime > 0) return;
    const length = Math.hypot(dx, dy) || 1;
    state.hero.rollDx = dx / length;
    state.hero.rollDy = dy / length;
    state.hero.rollTime = .34;
    state.hero.rollCooldown = 1.35;
    state.hero.invuln = .44;
    spawnParticles(state.hero.x, state.hero.y, '#f3b66d', 15, 110);
    tone(380, .08, 'triangle', .025);
  }

  function takeDamage(amount) {
    if (state.hero.invuln > 0 || state.phase !== 'playing') return;
    state.hero.hp = clamp(state.hero.hp - Math.max(1, amount), 0, state.hero.maxHp);
    state.hitFlash = .15;
    state.shake = Math.max(state.shake, 10);
    spawnParticles(state.hero.x, state.hero.y, '#f76f73', 12, 105);
    addDamageNumber(state.hero.x, state.hero.y - 35, `-${Math.round(amount)}`, '#f76f73');
    tone(90, .12, 'sawtooth', .04);
    if (state.hero.hp <= 0) enterDeath();
  }

  function enterDeath() {
    releaseAllInput();
    clearPendingTimers();
    state.phase = 'dead';
    saveProgress();
    syncStatusPanel();
  }

  function enterClear() {
    state.phase = state.floor === 30 ? 'win' : 'clear';
    state.highestFloor = Math.max(state.highestFloor, state.floor);
    if (state.floor === 30 && (!state.bestTime || state.runSeconds < state.bestTime)) state.bestTime = state.runSeconds;
    saveProgress();
    releaseAllInput();
    syncStatusPanel();
    tone(state.floor === 30 ? 760 : 480, .32, 'triangle', .045);
  }

  function update(dt) {
    if (state.phase !== 'playing') return;
    state.runSeconds += dt;
    state.floorTime += dt;
    state.skills.pulse = Math.max(0, state.skills.pulse - dt);
    state.skills.hook = Math.max(0, state.skills.hook - dt);
    state.hero.rollCooldown = Math.max(0, state.hero.rollCooldown - dt);
    state.hero.invuln = Math.max(0, state.hero.invuln - dt);
    state.hitFlash = Math.max(0, state.hitFlash - dt);
    state.shake = Math.max(0, state.shake - dt * 26);

    if (state.hero.rollTime > 0) {
      state.hero.rollTime = Math.max(0, state.hero.rollTime - dt);
      state.hero.x += state.hero.rollDx * 250 * dt;
      state.hero.y += state.hero.rollDy * 180 * dt;
      state.hero.x = clamp(state.hero.x, 48, viewW - 48);
      state.hero.y = clamp(state.hero.y, 155, viewH - 160);
    }

    state.spawnClock -= dt;
    if (state.spawnClock <= 0 && state.spawnQueue.length && state.enemies.length < 4) {
      spawnNextEnemy();
      state.spawnClock = .72;
    }

    state.hero.attackClock -= dt;
    if (state.hero.attackClock <= 0) {
      const target = nearestEnemy();
      if (target) {
        const attackInterval = .72;
        damageEnemy(target, currentDps() * attackInterval, '#f0e8d9');
        state.hero.attackClock = attackInterval;
        spawnParticles(state.hero.x, state.hero.y - 20, '#f0e8d9', 3, 35);
        tone(290, .045, 'sine', .012);
      } else state.hero.attackClock = .15;
    }

    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      enemy.phase += dt;
      enemy.stun = Math.max(0, enemy.stun - dt);
      if (enemy.stun > 0) continue;
      const dx = state.hero.x - enemy.x;
      const dy = state.hero.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance > 112) {
        enemy.x += dx / distance * enemy.speed * dt;
        enemy.y += dy / distance * enemy.speed * dt;
      } else {
        enemy.attackClock -= dt;
        if (enemy.attackClock <= 0) {
          enemy.attackClock = enemy.attackGap;
          takeDamage(enemy.damage);
        }
      }
    }

    state.enemies = state.enemies.filter((enemy) => !enemy.dead);
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= .96;
      particle.vy *= .96;
      if (particle.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.damageNumbers.length - 1; i >= 0; i -= 1) {
      const number = state.damageNumbers[i];
      number.life -= dt;
      number.y -= number.drift * dt;
      if (number.life <= 0) state.damageNumbers.splice(i, 1);
    }

    if (!state.spawnQueue.length && !state.enemies.length) enterClear();
  }

  function drawBackground(time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, viewH);
    gradient.addColorStop(0, '#10152a');
    gradient.addColorStop(.52, '#111927');
    gradient.addColorStop(1, '#070a11');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.save();
    ctx.globalAlpha = .22;
    for (let i = 0; i < 8; i += 1) {
      const x = (i * 83 + 22) % (viewW + 70) - 35;
      const height = 90 + (i % 3) * 52;
      ctx.fillStyle = i % 2 ? '#26364c' : '#1d2842';
      ctx.beginPath();
      ctx.moveTo(x, 128); ctx.lineTo(x + 16, 128 - height); ctx.lineTo(x + 49, 128 - height - 18); ctx.lineTo(x + 72, 128); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(117, 230, 223, .07)';
    ctx.lineWidth = 1;
    const horizon = viewH * .55;
    for (let i = -5; i <= 5; i += 1) { ctx.beginPath(); ctx.moveTo(viewW * .5, horizon); ctx.lineTo(viewW * .5 + i * 130, viewH); ctx.stroke(); }
    for (let y = horizon; y < viewH; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(viewW, y); ctx.stroke(); }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = .35 + Math.sin(time * .001) * .05;
    ctx.fillStyle = '#75e6df';
    ctx.beginPath(); ctx.arc(viewW * .5, 147, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawEnemy(enemy, time) {
    const bob = Math.sin(time * .002 + enemy.phase) * 3;
    const x = enemy.x;
    const y = enemy.y + bob;
    const isBoss = enemy.kind === 'warden';
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = enemy.stun > 0 ? .55 : 1;
    ctx.shadowBlur = isBoss ? 20 : 10;
    ctx.shadowColor = isBoss ? '#9a88ff' : '#4cbbb9';
    ctx.fillStyle = isBoss ? '#58477c' : '#273e50';
    ctx.strokeStyle = isBoss ? '#c19cff' : '#75e6df';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const sides = isBoss ? 8 : 6;
    for (let i = 0; i < sides; i += 1) {
      const angle = -Math.PI / 2 + i * TAU / sides;
      const radius = enemy.radius * (i % 2 ? .85 : 1.08);
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = isBoss ? '#f3b66d' : '#75e6df';
    ctx.beginPath(); ctx.arc(-enemy.radius * .27, -2, 2.2, 0, TAU); ctx.arc(enemy.radius * .27, -2, 2.2, 0, TAU); ctx.fill();
    if (isBoss) { ctx.strokeStyle = '#c19cff'; ctx.beginPath(); ctx.moveTo(-14, -38); ctx.lineTo(-7, -25); ctx.moveTo(14, -38); ctx.lineTo(7, -25); ctx.stroke(); }
    ctx.restore();

    const barW = isBoss ? 94 : 54;
    const barY = y - enemy.radius - 12;
    ctx.fillStyle = 'rgba(7, 9, 15, .75)'; ctx.fillRect(x - barW / 2, barY, barW, 4);
    ctx.fillStyle = isBoss ? '#c19cff' : '#75e6df'; ctx.fillRect(x - barW / 2, barY, barW * clamp(enemy.hp / enemy.maxHp, 0, 1), 4);
    if (isBoss) { ctx.fillStyle = '#c19cff'; ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText('WARDEN', x, barY - 6); }
  }

  function drawHero(time) {
    const x = state.hero.x;
    const y = state.hero.y;
    const roll = state.hero.rollTime > 0;
    ctx.save();
    if (roll) {
      ctx.globalAlpha = .18;
      ctx.fillStyle = '#f3b66d';
      for (let i = 1; i < 4; i += 1) { ctx.beginPath(); ctx.arc(x - state.hero.rollDx * i * 18, y - state.hero.rollDy * i * 14, 17 - i * 3, 0, TAU); ctx.fill(); }
    }
    ctx.translate(x, y);
    ctx.rotate(roll ? -state.hero.rollDx * .5 : Math.sin(time * .002) * .025);
    ctx.shadowBlur = state.hero.invuln > 0 ? 22 : 12;
    ctx.shadowColor = state.hero.invuln > 0 ? '#f3b66d' : '#75e6df';
    ctx.fillStyle = '#dbe5e0';
    ctx.strokeStyle = '#75e6df';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(18, -7); ctx.lineTo(13, 22); ctx.lineTo(-13, 22); ctx.lineTo(-18, -7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#101827'; ctx.beginPath(); ctx.arc(0, -11, 8, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#f3b66d'; ctx.beginPath(); ctx.moveTo(-16, 5); ctx.lineTo(-28, 19); ctx.moveTo(16, 5); ctx.lineTo(28, 19); ctx.stroke();
    ctx.restore();
  }

  function drawArenaMark() {
    const y = viewH * .69;
    ctx.save();
    ctx.strokeStyle = 'rgba(117, 230, 223, .2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(viewW * .5, y + 30, Math.min(145, viewW * .38), 25, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(243, 182, 109, .16)';
    ctx.beginPath(); ctx.arc(viewW * .5, y + 30, 54, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function drawEffects() {
    for (const particle of state.particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px ui-monospace, monospace';
    for (const number of state.damageNumbers) {
      ctx.globalAlpha = clamp(number.life / number.maxLife, 0, 1);
      ctx.fillStyle = number.color;
      ctx.fillText(number.text, number.x, number.y);
    }
    ctx.globalAlpha = 1;
  }

  function render(time) {
    ctx.setTransform(backingScale, 0, 0, backingScale, 0, 0);
    drawBackground(time);
    const shakeX = state.shake ? rand(-state.shake, state.shake) : 0;
    const shakeY = state.shake ? rand(-state.shake * .5, state.shake * .5) : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawArenaMark();
    for (const enemy of state.enemies) drawEnemy(enemy, time);
    drawHero(time);
    drawEffects();
    ctx.restore();
    if (state.hitFlash > 0) { ctx.fillStyle = `rgba(247,111,115,${state.hitFlash * .35})`; ctx.fillRect(0, 0, viewW, viewH); }
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    viewW = Math.max(1, rect.width);
    viewH = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    backingScale = Math.min(dpr, 960 / Math.max(viewW, viewH));
    canvas.width = Math.max(1, Math.floor(viewW * backingScale));
    canvas.height = Math.max(1, Math.floor(viewH * backingScale));
    ctx.imageSmoothingEnabled = true;
    state.hero.x = clamp(state.hero.x || viewW * .5, 48, viewW - 48);
    state.hero.y = clamp(state.hero.y || viewH * .69, 155, viewH - 160);
  }

  function setOrientationPaused(shouldPause) {
    if (state.orientationPaused === shouldPause) return;
    state.orientationPaused = shouldPause;
    $('orientationOverlay').hidden = !shouldPause;
    if (shouldPause) releaseAllInput();
    lastFrame = performance.now();
  }

  function refreshOrientation() {
    setOrientationPaused(window.innerWidth > window.innerHeight);
  }

  function syncHud(now) {
    if (now - state.lastUiSync < 80) return;
    state.lastUiSync = now;
    $('floorReadout').textContent = `FLOOR ${String(state.floor).padStart(2, '0')}`;
    $('gearReadout').textContent = `GEAR ${String(state.gearScore).padStart(2, '0')}`;
    $('timeReadout').textContent = formatTime(state.runSeconds);
    $('healthReadout').textContent = `${Math.ceil(state.hero.hp)} / ${state.hero.maxHp}`;
    $('healthFill').style.transform = `scaleX(${clamp(state.hero.hp / Math.max(1, state.hero.maxHp), 0, 1)})`;
    $('dpsReadout').textContent = `DPS ${Math.round(currentDps())}`;
    $('doorReadout').textContent = state.floor >= 30 ? 'FINAL DEPTH' : `DOOR ${doorRequirement(state.floor + 1)}`;
    $('skillOneCooldown').textContent = state.skills.pulse > 0 ? `${state.skills.pulse.toFixed(1)}s` : 'READY';
    $('skillTwoCooldown').textContent = state.skills.hook > 0 ? `${state.skills.hook.toFixed(1)}s` : 'READY';
    if (state.toast.until && now >= state.toast.until) { state.toast.until = 0; hideToast(); }
  }

  function syncManual() {
    $('manualDamage').textContent = Math.round(currentDps());
    const gear = state.gear;
    $('loadoutReadout').textContent = `WEAPON ${gear.weapon.score} · ARMOR ${gear.armor.score} · CHARM ${gear.charm.score}  /  TOTAL ${state.gearScore}`;
  }

  function syncStatusPanel() {
    const panel = $('statusPanel');
    const secondary = $('panelSecondary');
    if (state.phase === 'playing') { panel.hidden = true; state.statusPhase = 'playing'; return; }
    panel.hidden = false;
    if (state.statusPhase === state.phase) return;
    state.statusPhase = state.phase;
    const primary = $('panelPrimary');
    if (state.phase === 'clear') {
      $('panelKicker').textContent = `DESCENT LOG / FLOOR ${String(state.floor).padStart(2, '0')}`;
      $('panelTitle').textContent = 'FLOOR CLEAR';
      $('panelBody').textContent = `The shade pack broke in ${formatTime(state.floorTime)}. Door ${doorRequirement(state.floor + 1)} is asking for gear score; you carry ${state.gearScore}.`;
      primary.textContent = `OPEN DOOR  ${doorRequirement(state.floor + 1)}`;
      primary.disabled = state.gearScore < doorRequirement(state.floor + 1);
      primary._action = () => { if (!primary.disabled) startFloor(state.floor + 1); };
      secondary.hidden = false; secondary.textContent = 'REPLAY FLOOR'; secondary._action = () => startFloor(state.floor);
    } else if (state.phase === 'dead') {
      $('panelKicker').textContent = `DESCENT LOG / FLOOR ${String(state.floor).padStart(2, '0')}`;
      $('panelTitle').textContent = 'THE MARCH ENDS';
      $('panelBody').textContent = `Your gear stays equipped. Restart this floor instantly, read the manual, then roll through red telegraphs when the next shade closes in.`;
      primary.textContent = 'RESTART FLOOR'; primary.disabled = false; primary._action = () => startFloor(state.floor);
      secondary.hidden = false; secondary.textContent = 'FIELD MANUAL'; secondary._action = openManual;
    } else {
      $('panelKicker').textContent = 'DESCENT LOG / DEPTH 30';
      $('panelTitle').textContent = 'THE DEEP ANSWERS';
      $('panelBody').textContent = `You cleared the last Warden in ${formatTime(state.runSeconds)}. Best clear: ${formatTime(state.bestTime)}. Depth and gear are saved on this device.`;
      primary.textContent = 'DESCEND AGAIN'; primary.disabled = false; primary._action = startAgain;
      secondary.hidden = false; secondary.textContent = 'FIELD MANUAL'; secondary._action = openManual;
    }
  }

  function openManual() {
    unlockAudio();
    state.manualOpen = true;
    releaseAllInput();
    syncManual();
    $('manualScreen').hidden = false;
  }

  function closeManual() {
    state.manualOpen = false;
    $('manualScreen').hidden = true;
    lastFrame = performance.now();
  }

  function handleSurfaceDown(event) {
    if (state.manualOpen || state.orientationPaused || surfacePointers.size >= MAX_POINTERS) return;
    event.preventDefault();
    unlockAudio();
    surfacePointers.set(event.pointerId, { x: event.clientX, y: event.clientY, time: performance.now() });
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
  }

  function handleSurfaceMove(event) {
    if (!surfacePointers.has(event.pointerId)) return;
    event.preventDefault();
  }

  function handleSurfaceUp(event) {
    const start = surfacePointers.get(event.pointerId);
    if (!start) return;
    event.preventDefault();
    surfacePointers.delete(event.pointerId);
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) >= 38 && performance.now() - start.time < 900) dodge(dx, dy);
  }

  function handleSurfaceCancel(event) { surfacePointers.delete(event.pointerId); }

  function keyDown(event) {
    if (state.manualOpen || state.orientationPaused) return;
    const key = event.key.toLowerCase();
    if (['j', 'k', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) event.preventDefault();
    if (!['j', 'k', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) return;
    if (event.repeat) { pressedKeys.add(key); return; }
    if (pressedKeys.size < 8) pressedKeys.add(key);
    unlockAudio();
    if (key === 'j') usePulse();
    if (key === 'k') useHook();
    if (key === 'arrowleft') dodge(-1, 0);
    if (key === 'arrowright') dodge(1, 0);
    if (key === 'arrowup') dodge(0, -1);
    if (key === 'arrowdown') dodge(0, 1);
  }

  function keyUp(event) { pressedKeys.delete(event.key.toLowerCase()); }

  function loop(now) {
    if (!lastFrame) lastFrame = now;
    const rawDelta = (now - lastFrame) / 1000;
    lastFrame = now;
    const delta = clamp(rawDelta, 0, .05);
    if (!state.orientationPaused && !state.manualOpen && !state.tabPaused) update(delta);
    render(now);
    syncHud(now);
    syncStatusPanel();
    window.requestAnimationFrame(loop);
  }

  bindControl($('skillOne'), usePulse);
  bindControl($('skillTwo'), useHook);
  bindControl($('economyButton'), openManual);
  bindControl($('closeManual'), closeManual);
  bindControl($('panelPrimary'), () => {});
  bindControl($('panelSecondary'), () => {});

  canvas.addEventListener('pointerdown', handleSurfaceDown, { passive: false });
  canvas.addEventListener('pointermove', handleSurfaceMove, { passive: false });
  canvas.addEventListener('pointerup', handleSurfaceUp, { passive: false });
  canvas.addEventListener('pointercancel', handleSurfaceCancel, { passive: false });
  canvas.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  canvas.addEventListener('touchend', (event) => event.preventDefault(), { passive: false });
  window.addEventListener('keydown', keyDown, { passive: false });
  window.addEventListener('keyup', keyUp, { passive: false });
  window.addEventListener('blur', releaseAllInput);
  window.addEventListener('resize', () => { resizeCanvas(); refreshOrientation(); });
  window.addEventListener('orientationchange', () => { resizeCanvas(); refreshOrientation(); });
  document.addEventListener('visibilitychange', () => {
    state.tabPaused = document.hidden;
    if (state.tabPaused) releaseAllInput();
    lastFrame = performance.now();
  });

  const saved = loadSave();
  state.floor = saved.depth;
  state.highestFloor = saved.highestFloor;
  state.bestTime = saved.bestTime;
  state.gear = saved.gear;
  resizeCanvas();
  refreshOrientation();
  startFloor(state.floor);
  window.requestAnimationFrame(loop);
})();
