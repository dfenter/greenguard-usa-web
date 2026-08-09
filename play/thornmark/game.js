(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const audioGate = document.getElementById('audioGate');
  const rotateOverlay = document.getElementById('rotateOverlay');
  const enterButton = document.getElementById('enterButton');
  const W = 390, H = 700;
  const TAU = Math.PI * 2;
  const MAX_PARTICLES = 180;
  const MAX_FLOATERS = 28;
  const MAX_ENEMIES = 34;
  const MAX_ACTIONS = 10;
  const GEAR_NAMES = { weapon: 'VINE EDGE', armor: 'BARK COAT', ring: 'EMBER LOOP' };
  const GEAR_LABELS = { weapon: 'WEAPON', armor: 'ARMOR', ring: 'RING' };
  const ENHANCE_RATES = [1, .90, .82, .74, .66, .58, .50, .42, .34];
  const FIELDS = [
    { name: 'MOSSWOLD', sub: 'green hush', hue: '#16483c', glow: '#7ee0b2', ground: '#0d2928', boss: 'ROOTCROWN' },
    { name: 'EMBERFEN', sub: 'low red sky', hue: '#653426', glow: '#f2a35e', ground: '#2d191d', boss: 'CINDERMAW' }
  ];
  const ENEMY_TYPES = {
    thornling: { name: 'THORNLING', color: '#66c79f', hp: 28, speed: 24, radius: 13, damage: 4, gold: [4, 8], drops: ['VINE EDGE', 'BARK COAT', 'DEW LOOP'] },
    mireling: { name: 'MIRELING', color: '#b3c46b', hp: 36, speed: 18, radius: 15, damage: 5, gold: [5, 10], drops: ['BARK COAT', 'DEW LOOP', 'VINE EDGE'] },
    cinderkin: { name: 'CINDERKIN', color: '#f49b62', hp: 42, speed: 27, radius: 14, damage: 6, gold: [6, 12], drops: ['EMBER LOOP', 'VINE EDGE', 'BARK COAT'] },
    ashwing: { name: 'ASHWING', color: '#e9c36d', hp: 32, speed: 35, radius: 12, damage: 5, gold: [5, 11], drops: ['EMBER LOOP', 'BARK COAT', 'VINE EDGE'] },
    boss0: { name: 'ROOTCROWN', color: '#d8f2ad', hp: 520, speed: 12, radius: 30, damage: 13, gold: [65, 86], boss: true, drops: ['VINE EDGE', 'BARK COAT', 'DEW LOOP'] },
    boss1: { name: 'CINDERMAW', color: '#ffd29a', hp: 620, speed: 14, radius: 32, damage: 16, boss: true, drops: ['EMBER LOOP', 'BARK COAT', 'VINE EDGE'] }
  };

  let audio = null;
  let started = false;
  let orientationLandscape = false;
  let lastTime = performance.now();
  let rafId = 0;
  let spawnClock = 0;
  let autoClock = .35;
  let toastClock = 0;
  let toastText = '';
  let layout = { cssW: W, cssH: H, scale: 1, ox: 0, oy: 0, pixelRatio: 1 };
  const particles = [];
  const floaters = [];
  const enemies = [];
  const queuedActions = [];
  const keys = new Set();
  const pointers = new Map();
  const controls = { stick: null, skill1: null, skill2: null };
  const stick = { x: 0, y: 0 };
  const timers = new Set();

  function finiteNumber(value, fallback, min = -Infinity, max = Infinity) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  }

  function validGear(value) {
    const out = { weapon: 0, armor: 0, ring: 0 };
    if (!value || typeof value !== 'object') return out;
    for (const key of Object.keys(out)) out[key] = Math.floor(finiteNumber(value[key], 0, 0, 9));
    return out;
  }

  function loadSave() {
    const fallback = { gold: 120, kills: 0, gear: validGear(), drops: { weapon: 0, armor: 0, ring: 0 }, bossDown: [false, false], best: 0 };
    try {
      const raw = localStorage.getItem('thornmark-save-v1');
      if (typeof raw !== 'string' || !raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
      const drops = parsed.drops && typeof parsed.drops === 'object' ? parsed.drops : {};
      const down = Array.isArray(parsed.bossDown) ? parsed.bossDown : [];
      return {
        gold: Math.floor(finiteNumber(parsed.gold, fallback.gold, 0, 999999)),
        kills: Math.floor(finiteNumber(parsed.kills, 0, 0, 999999)),
        gear: validGear(parsed.gear),
        drops: { weapon: Math.floor(finiteNumber(drops.weapon, 0, 0, 50)), armor: Math.floor(finiteNumber(drops.armor, 0, 0, 50)), ring: Math.floor(finiteNumber(drops.ring, 0, 0, 50)) },
        bossDown: [down[0] === true, down[1] === true],
        best: Math.floor(finiteNumber(parsed.best, 0, 0, 999999))
      };
    } catch (error) {
      return fallback;
    }
  }

  let save = loadSave();
  let state = {
    screen: 'play', field: 0, selectedGear: 'weapon', forgeOpen: false, enemySheet: null,
    player: { x: 195, y: 360, hp: 100, maxHp: 100, hitFlash: 0 },
    cooldowns: { skill1: 0, skill2: 0 },
    bossTimers: [180, 180]
  };

  function persist() {
    try {
      localStorage.setItem('thornmark-save-v1', JSON.stringify({
        gold: Math.floor(finiteNumber(save.gold, 0, 0, 999999)),
        kills: Math.floor(finiteNumber(save.kills, 0, 0, 999999)), gear: validGear(save.gear),
        drops: { weapon: Math.floor(finiteNumber(save.drops.weapon, 0, 0, 50)), armor: Math.floor(finiteNumber(save.drops.armor, 0, 0, 50)), ring: Math.floor(finiteNumber(save.drops.ring, 0, 0, 50)) },
        bossDown: [save.bossDown[0] === true, save.bossDown[1] === true], best: Math.floor(finiteNumber(save.best, 0, 0, 999999))
      }));
    } catch (error) { /* Storage is optional. */ }
  }

  function schedule(fn, delay) {
    if (timers.size >= 12) return 0;
    let id = 0;
    id = setTimeout(() => { timers.delete(id); fn(); }, delay);
    timers.add(id);
    return id;
  }

  function clearTimers() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  function clearInputState() {
    pointers.clear();
    controls.stick = controls.skill1 = controls.skill2 = null;
    keys.clear();
    queuedActions.length = 0;
    stick.x = stick.y = 0;
  }

  function resetRun() {
    clearTimers();
    clearInputState();
    particles.length = 0;
    floaters.length = 0;
    enemies.length = 0;
    queuedActions.length = 0;
    state.screen = 'play';
    state.forgeOpen = false;
    state.enemySheet = null;
    state.player = { x: 195, y: 360, hp: 100, maxHp: 100, hitFlash: 0 };
    state.cooldowns = { skill1: 0, skill2: 0 };
    state.bossTimers = [180, 180];
    spawnClock = .2;
    autoClock = .4;
    spawnPack(10);
  }

  function unlockAudio() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audio = audio || new AudioContextClass();
      if (audio.state === 'suspended') audio.resume();
      beep(420, .06, 'sine', .035);
    } catch (error) { audio = null; }
  }

  function beep(freq, duration = .08, type = 'triangle', volume = .045) {
    if (!audio) return;
    try {
      const now = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.connect(gain).connect(audio.destination); osc.start(now); osc.stop(now + duration);
    } catch (error) { /* Audio remains optional. */ }
  }

  function showToast(text, seconds = 2) {
    toastText = text; toastClock = seconds;
  }

  function addParticle(x, y, color, options = {}) {
    if (particles.length >= MAX_PARTICLES) particles.splice(0, Math.max(1, Math.floor(MAX_PARTICLES * .12)));
    particles.push({ x, y, vx: finiteNumber(options.vx, (Math.random() - .5) * 50, -180, 180), vy: finiteNumber(options.vy, (Math.random() - .5) * 50, -180, 180), life: options.life || .45, max: options.life || .45, size: options.size || 3, color, ring: options.ring === true });
  }

  function burst(x, y, color, count = 10, speed = 65) {
    const total = Math.min(count, 24);
    for (let i = 0; i < total; i++) {
      const a = Math.random() * TAU, s = speed * (.35 + Math.random() * .8);
      addParticle(x, y, color, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .25 + Math.random() * .45, size: 2 + Math.random() * 3 });
    }
  }

  function addFloater(text, x, y, color) {
    if (floaters.length >= MAX_FLOATERS) floaters.splice(0, 4);
    floaters.push({ text, x, y, color, life: 1, max: 1 });
  }

  function createEnemy(typeKey, x, y) {
    if (enemies.length >= MAX_ENEMIES) return null;
    const t = ENEMY_TYPES[typeKey];
    if (!t) return null;
    const enemy = { type: typeKey, x, y, hp: t.hp, maxHp: t.hp, nextAtk: .8 + Math.random(), flash: 0, dead: false, id: Math.random() };
    enemies.push(enemy);
    return enemy;
  }

  function randomSpawnPoint() {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return { x: 38 + Math.random() * 314, y: 190 + Math.random() * 42 };
    if (side === 1) return { x: 38 + Math.random() * 314, y: 470 + Math.random() * 40 };
    if (side === 2) return { x: 28 + Math.random() * 44, y: 212 + Math.random() * 240 };
    return { x: 318 + Math.random() * 44, y: 212 + Math.random() * 240 };
  }

  function spawnPack(count) {
    const field = state.field;
    const typePool = field === 0 ? ['thornling', 'thornling', 'mireling'] : ['cinderkin', 'ashwing', 'cinderkin'];
    const open = enemies.filter(e => !ENEMY_TYPES[e.type].boss && !e.dead).length;
    const amount = Math.min(count, 14 - open, MAX_ENEMIES - enemies.length);
    for (let i = 0; i < amount; i++) {
      const p = randomSpawnPoint();
      createEnemy(typePool[Math.floor(Math.random() * typePool.length)], p.x, p.y);
    }
    if (!save.bossDown[field] && !enemies.some(e => ENEMY_TYPES[e.type].boss)) createEnemy(field === 0 ? 'boss0' : 'boss1', 195, 225);
  }

  function currentBoss() { return enemies.find(e => ENEMY_TYPES[e.type].boss && !e.dead) || null; }
  function allGearPlus9() { return Object.values(validGear(save.gear)).every(level => level >= 9); }
  function playerPower() { return 8 + save.gear.weapon * 3 + save.gear.ring * 2; }

  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function nearestEnemy(maxDistance = Infinity) {
    let nearest = null, best = maxDistance;
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const d = distance(state.player, enemy);
      if (d < best) { best = d; nearest = enemy; }
    }
    return nearest;
  }

  function queueAction(action) {
    if (queuedActions.length >= MAX_ACTIONS) queuedActions.shift();
    queuedActions.push(action);
  }

  function hitEnemy(enemy, damage, color = '#f2bd63') {
    if (!enemy || enemy.dead) return;
    const type = ENEMY_TYPES[enemy.type];
    if (type.boss && !allGearPlus9()) {
      enemy.flash = .13;
      addFloater('NEEDS +9 SET', enemy.x, enemy.y - 40, '#f2bd63');
      beep(120, .08, 'square', .03);
      return;
    }
    enemy.hp -= Math.max(1, damage);
    enemy.flash = .16;
    burst(enemy.x, enemy.y, color, type.boss ? 7 : 4, type.boss ? 48 : 32);
    if (enemy.hp <= 0) defeatEnemy(enemy);
  }

  function defeatEnemy(enemy) {
    if (!enemy || enemy.dead) return;
    enemy.dead = true;
    const type = ENEMY_TYPES[enemy.type];
    const gold = Math.floor(type.gold[0] + Math.random() * (type.gold[1] - type.gold[0] + 1));
    save.gold = Math.min(999999, save.gold + gold);
    save.kills = Math.min(999999, save.kills + 1);
    save.best = Math.max(save.best, save.kills);
    addFloater('+' + gold + 'g', enemy.x, enemy.y - 11, '#f2bd63');
    burst(enemy.x, enemy.y, type.color, type.boss ? 32 : 12, type.boss ? 120 : 75);
    beep(type.boss ? 92 : 240, type.boss ? .25 : .06, type.boss ? 'sawtooth' : 'triangle', type.boss ? .08 : .035);
    if (type.boss) {
      save.bossDown[state.field] = true;
      save.best = Math.max(save.best, save.kills);
      showToast(state.field === 0 ? 'ROOTCROWN FELLED' : 'CINDERMAW FELLED', 3);
      persist();
      if (save.bossDown[0] && save.bossDown[1] && allGearPlus9()) {
        state.screen = 'mastery'; clearInputState();
      }
    } else {
      const dropChance = .38 + Math.min(.18, save.gear.weapon * .02);
      if (Math.random() < dropChance) grantDrop(type.drops[Math.floor(Math.random() * type.drops.length)]);
      persist();
    }
  }

  function grantDrop(item) {
    const key = item.includes('VINE') ? 'weapon' : item.includes('BARK') ? 'armor' : 'ring';
    save.drops[key] = Math.min(50, save.drops[key] + 1);
    addFloater(item + ' DROP', state.player.x, state.player.y - 28, '#7ee0b2');
    burst(state.player.x, state.player.y, '#7ee0b2', 9, 42);
    beep(680, .1, 'sine', .04);
  }

  function useSkill(skill) {
    if (state.screen !== 'play' || state.forgeOpen || state.enemySheet) return;
    if (state.cooldowns[skill] > 0) return;
    if (skill === 'skill1') {
      const target = nearestEnemy(142);
      if (!target) { showToast('MOVE INTO RANGE', 1); return; }
      state.cooldowns.skill1 = 4.8;
      for (const enemy of enemies) if (!enemy.dead && distance(state.player, enemy) < 124) hitEnemy(enemy, 20 + save.gear.weapon * 4, '#7ee0b2');
      addParticle(state.player.x, state.player.y, '#7ee0b2', { life: .34, size: 42, ring: true });
      addFloater('THORN ARC', state.player.x, state.player.y - 35, '#7ee0b2');
      beep(510, .12, 'triangle', .05);
    } else {
      const target = nearestEnemy(168);
      if (!target) { showToast('MOVE INTO RANGE', 1); return; }
      state.cooldowns.skill2 = 8.5;
      for (const enemy of enemies) if (!enemy.dead && distance(target, enemy) < 74) hitEnemy(enemy, 40 + save.gear.ring * 5, '#f2a35e');
      burst(target.x, target.y, '#f2a35e', 24, 105);
      addParticle(target.x, target.y, '#f2a35e', { life: .5, size: 54, ring: true });
      addFloater('EMBER BURST', target.x, target.y - 38, '#f2a35e');
      beep(230, .2, 'sawtooth', .045);
    }
  }

  function basicAttack() {
    const target = nearestEnemy(128);
    if (!target) return;
    autoClock = .72;
    hitEnemy(target, playerPower(), '#f4f0e7');
    addParticle((state.player.x + target.x) / 2, (state.player.y + target.y) / 2, '#f4f0e7', { life: .18, size: 12, ring: true });
    beep(165 + Math.random() * 30, .035, 'triangle', .025);
  }

  function update(dt) {
    if (!started || orientationLandscape || document.hidden || state.screen !== 'play' || state.forgeOpen || state.enemySheet) return;
    dt = Math.min(.05, Math.max(0, dt));
    state.cooldowns.skill1 = Math.max(0, state.cooldowns.skill1 - dt);
    state.cooldowns.skill2 = Math.max(0, state.cooldowns.skill2 - dt);
    state.player.hitFlash = Math.max(0, state.player.hitFlash - dt);
    toastClock = Math.max(0, toastClock - dt);
    autoClock -= dt;
    spawnClock -= dt;
    state.bossTimers[state.field] = Math.max(0, state.bossTimers[state.field] - dt);

    const moveX = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0) + stick.x;
    const moveY = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0) + stick.y;
    const len = Math.hypot(moveX, moveY) || 1;
    const speed = 128;
    if (moveX || moveY) {
      state.player.x = Math.min(360, Math.max(30, state.player.x + (moveX / len) * speed * dt));
      state.player.y = Math.min(520, Math.max(185, state.player.y + (moveY / len) * speed * dt));
    }

    if (controls.skill1 !== null || keys.has('j')) queueAction('skill1');
    if (controls.skill2 !== null || keys.has('k')) queueAction('skill2');
    if (queuedActions.length) useSkill(queuedActions.shift());
    if (autoClock <= 0) basicAttack();

    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const t = ENEMY_TYPES[enemy.type];
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.nextAtk -= dt;
      const dx = state.player.x - enemy.x, dy = state.player.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      const reach = t.radius + 17;
      if (d > reach) {
        enemy.x += (dx / d) * t.speed * dt;
        enemy.y += (dy / d) * t.speed * dt;
      } else if (enemy.nextAtk <= 0) {
        enemy.nextAtk = t.boss ? 2.4 : 1.35 + Math.random() * .7;
        state.player.hp = Math.max(0, state.player.hp - t.damage);
        state.player.hitFlash = .2;
        addFloater('-' + t.damage, state.player.x, state.player.y - 22, '#ff7b76');
        burst(state.player.x, state.player.y, '#ff7b76', 4, 28);
        beep(80, .06, 'square', .025);
        if (state.player.hp <= 0) die();
      }
    }
    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
    if (spawnClock <= 0) { spawnClock = 2.7; spawnPack(2); }
    updateCollections(dt);
  }

  function die() {
    if (state.screen !== 'play') return;
    state.screen = 'dead'; clearInputState(); clearTimers();
    burst(state.player.x, state.player.y, '#ff7b76', 28, 100);
    persist();
  }

  function respawn() {
    clearTimers(); clearInputState();
    save.gold = Math.max(0, save.gold - 10);
    persist();
    state.player = { x: 195, y: 360, hp: 100, maxHp: 100, hitFlash: 0 };
    state.screen = 'play'; state.enemySheet = null; state.forgeOpen = false;
    enemies.length = 0; particles.length = 0; floaters.length = 0;
    state.bossTimers[state.field] = save.bossDown[state.field] ? 0 : 180;
    spawnPack(10); showToast('FIELD RESPAWN · 10G', 2); beep(280, .1, 'sine', .04);
  }

  function switchField(index) {
    if (index !== 0 && index !== 1 || state.field === index) return;
    clearInputState(); state.field = index; state.enemySheet = null; state.forgeOpen = false;
    enemies.length = 0; particles.length = 0; floaters.length = 0; state.bossTimers[index] = save.bossDown[index] ? 0 : 180;
    spawnPack(10); showToast('ENTERED ' + FIELDS[index].name, 1.5); beep(380 + index * 100, .08, 'sine', .035);
  }

  function enhance() {
    const key = state.selectedGear, level = save.gear[key], rate = ENHANCE_RATES[level];
    if (level >= 9) { showToast('MAX TIER REACHED', 1.4); return; }
    const cost = enhanceCost(level);
    if (save.gold < cost) { showToast('NEED ' + cost + 'G', 1.4); beep(110, .08, 'square', .025); return; }
    save.gold -= cost;
    if (Math.random() < rate) {
      save.gear[key] = level + 1; addFloater('+' + (level + 1) + ' ' + GEAR_LABELS[key], 195, 285, '#7ee0b2');
      burst(195, 320, '#7ee0b2', 16, 75); beep(720, .15, 'sine', .055); showToast('ENHANCE SUCCESS · NO RISK', 1.7);
    } else {
      addFloater('FAILED · TIER SAFE', 195, 285, '#f2a35e'); burst(195, 320, '#f2a35e', 7, 40); beep(150, .1, 'square', .03); showToast('GOLD SPENT · TIER SAFE', 1.7);
    }
    persist();
  }

  function enhanceCost(level) { return 18 + level * 14; }

  function updateCollections(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy *= .97;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.life -= dt; f.y -= 22 * dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
    if (floaters.length > MAX_FLOATERS) floaters.splice(0, floaters.length - MAX_FLOATERS);
    if (enemies.length > MAX_ENEMIES) enemies.splice(0, enemies.length - MAX_ENEMIES);
  }

  function resize() {
    const cssW = Math.max(1, window.innerWidth), cssH = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelRatio = Math.min(dpr, 960 / Math.max(cssW, cssH));
    canvas.width = Math.max(1, Math.round(cssW * pixelRatio)); canvas.height = Math.max(1, Math.round(cssH * pixelRatio));
    layout = { cssW, cssH, scale: Math.min(cssW / W, cssH / H), ox: (cssW - W * Math.min(cssW / W, cssH / H)) / 2, oy: (cssH - H * Math.min(cssW / W, cssH / H)) / 2, pixelRatio };
    const wasLandscape = orientationLandscape; orientationLandscape = cssW > cssH;
    rotateOverlay.classList.toggle('visible', orientationLandscape);
    if (orientationLandscape && !wasLandscape) clearInputState();
    if (!orientationLandscape && wasLandscape) lastTime = performance.now();
  }

  function beginFrame() {
    ctx.setTransform(layout.pixelRatio * layout.scale, 0, 0, layout.pixelRatio * layout.scale, layout.pixelRatio * layout.ox, layout.pixelRatio * layout.oy);
    ctx.clearRect(0, 0, W, H);
  }

  function roundedRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function label(text, x, y, size, color = '#f4f0e7', align = 'left', weight = 600) {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
  }

  function line(x1, y1, x2, y2, color, width = 1) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

  function render() {
    beginFrame();
    const field = FIELDS[state.field];
    ctx.fillStyle = field.ground; ctx.fillRect(0, 0, W, H);
    drawBackground(field);
    drawArena(field);
    drawEnemies();
    drawPlayer();
    drawParticles();
    drawHud(field);
    drawBottomControls();
    if (state.enemySheet) drawEnemySheet(state.enemySheet);
    if (state.forgeOpen) drawForge();
    if (toastClock > 0 && !state.enemySheet && !state.forgeOpen) drawToast();
    if (state.screen === 'dead') drawDead();
    if (state.screen === 'mastery') drawMastery();
  }

  function drawBackground(field) {
    const gradient = ctx.createLinearGradient(0, 0, 0, H); gradient.addColorStop(0, field.hue); gradient.addColorStop(.42, field.ground); gradient.addColorStop(1, '#080b12'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = .18; ctx.strokeStyle = field.glow; ctx.lineWidth = 1;
    for (let x = -30; x < W + 40; x += 28) line(x, 155, x - 50, 548, field.glow, 1);
    for (let y = 180; y < 550; y += 28) line(0, y, W, y + 18, field.glow, 1);
    ctx.globalAlpha = 1;
    for (let i = 0; i < 13; i++) {
      const x = 16 + (i * 71) % 360, y = 176 + (i * 89) % 354;
      ctx.fillStyle = i % 2 ? field.glow : '#ffffff'; ctx.globalAlpha = .1; ctx.beginPath(); ctx.arc(x, y, i % 3 + 1, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
  }

  function drawArena(field) {
    ctx.strokeStyle = field.glow; ctx.globalAlpha = .26; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(17, 164, 356, 382, 22); ctx.stroke(); ctx.globalAlpha = 1;
    label('OPEN FIELD · PACKS RESPOND', 26, 177, 9, '#b9c1bd', 'left', 700);
    label('DROP TABLE', 364, 177, 9, '#b9c1bd', 'right', 700);
  }

  function drawEnemies() {
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const t = ENEMY_TYPES[enemy.type], boss = t.boss;
      ctx.save(); ctx.translate(enemy.x, enemy.y);
      if (boss) {
        ctx.globalAlpha = .2; ctx.strokeStyle = t.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 45 + Math.sin(performance.now() / 240) * 3, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = enemy.flash > 0 ? '#fff' : t.color; ctx.beginPath(); ctx.arc(0, 0, 27, 0, TAU); ctx.fill();
        ctx.fillStyle = '#28191a'; ctx.beginPath(); ctx.moveTo(-20, -13); ctx.lineTo(-9, -34); ctx.lineTo(-2, -15); ctx.lineTo(9, -37); ctx.lineTo(18, -10); ctx.closePath(); ctx.fill();
        label(t.name, 0, 49, 10, '#fff2cf', 'center', 900);
      } else {
        ctx.rotate(Math.sin(performance.now() / 400 + enemy.x) * .07);
        ctx.fillStyle = enemy.flash > 0 ? '#fff' : t.color; ctx.beginPath(); ctx.moveTo(0, -t.radius); ctx.lineTo(t.radius, 0); ctx.lineTo(0, t.radius); ctx.lineTo(-t.radius, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(8,10,15,.65)'; ctx.beginPath(); ctx.arc(-4, -2, 2, 0, TAU); ctx.arc(4, -2, 2, 0, TAU); ctx.fill();
      }
      ctx.restore();
      const barW = boss ? 72 : 26, barY = enemy.y - (boss ? 39 : t.radius + 8);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(enemy.x - barW / 2, barY, barW, 4); ctx.fillStyle = boss ? '#f2bd63' : '#7ee0b2'; ctx.fillRect(enemy.x - barW / 2, barY, barW * Math.max(0, enemy.hp / enemy.maxHp), 4);
    }
  }

  function drawPlayer() {
    const p = state.player; ctx.save(); ctx.translate(p.x, p.y);
    ctx.globalAlpha = .25; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 17, 17, 6, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = p.hitFlash > 0 ? '#fff' : '#f2bd63'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(15, -4); ctx.lineTo(11, 16); ctx.lineTo(-11, 16); ctx.lineTo(-15, -4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#141824'; ctx.beginPath(); ctx.arc(0, -5, 8, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff2cf'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(11, -3); ctx.lineTo(24, -13); ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.max); ctx.globalAlpha = alpha;
      if (p.ring) { ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + (1 - alpha) * 1.2), 0, TAU); ctx.stroke(); }
      else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * alpha, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    for (const f of floaters) { ctx.globalAlpha = Math.min(1, f.life * 1.5); label(f.text, f.x, f.y, 10, f.color, 'center', 800); }
    ctx.globalAlpha = 1;
  }

  function drawHud(field) {
    ctx.fillStyle = 'rgba(7,9,15,.76)'; ctx.fillRect(0, 0, W, 156);
    label('THORNMARK', 18, 22, 18, '#f4f0e7', 'left', 900);
    label('GOLD ' + Math.floor(save.gold), 372, 18, 11, '#f2bd63', 'right', 800);
    label('KILLS ' + Math.floor(save.kills), 372, 34, 10, '#aeb5bf', 'right', 700);
    drawTab(18, 48, 86, 31, 'FIELD I', state.field === 0, '#7ee0b2');
    drawTab(111, 48, 86, 31, 'FIELD II', state.field === 1, '#f2a35e');
    drawTab(286, 48, 86, 31, state.forgeOpen ? 'CLOSE' : 'FORGE', state.forgeOpen, '#f2bd63');
    label('HINT · drift into a pack; your edge auto-cuts the nearest target.', 18, 93, 10, '#c5c9cc', 'left', 600);
    const boss = currentBoss(), remaining = state.bossTimers[state.field];
    roundedRect(18, 110, 354, 39, 10, 'rgba(0,0,0,.35)', 'rgba(255,255,255,.12)');
    label('FIELD BOSS', 30, 121, 9, '#aeb5bf', 'left', 800);
    label(save.bossDown[state.field] ? 'DOWN' : (boss ? ENEMY_TYPES[boss.type].name : field.boss), 30, 137, 13, save.bossDown[state.field] ? '#7ee0b2' : '#fff2cf', 'left', 900);
    label(save.bossDown[state.field] ? 'CLAIMED' : formatTime(remaining), 360, 130, 18, remaining < 30 && !save.bossDown[state.field] ? '#ff9c79' : '#f2bd63', 'right', 900);
    const hp = Math.max(0, state.player.hp / state.player.maxHp); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(30, 144, 160, 3); ctx.fillStyle = hp < .35 ? '#ff7b76' : '#7ee0b2'; ctx.fillRect(30, 144, 160 * hp, 3);
    label('HP ' + Math.ceil(state.player.hp) + '/' + state.player.maxHp, 199, 145, 9, '#aeb5bf', 'left', 700);
  }

  function drawTab(x, y, w, h, text, active, color) {
    roundedRect(x, y, w, h, 8, active ? color : 'rgba(255,255,255,.07)', active ? color : 'rgba(255,255,255,.12)');
    label(text, x + w / 2, y + h / 2 + 1, 10, active ? '#10141a' : '#d6d9dc', 'center', 900);
  }

  function drawBottomControls() {
    ctx.fillStyle = 'rgba(5,7,12,.94)'; ctx.fillRect(0, 555, W, 145);
    line(18, 555, 372, 555, 'rgba(255,255,255,.1)', 1);
    const sx = 78 + stick.x * 18, sy = 630 + stick.y * 18;
    ctx.globalAlpha = .85; ctx.strokeStyle = '#7ee0b2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(78, 630, 49, 0, TAU); ctx.stroke(); ctx.globalAlpha = .15; ctx.fillStyle = '#7ee0b2'; ctx.beginPath(); ctx.arc(78, 630, 49, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#7ee0b2'; ctx.beginPath(); ctx.arc(sx, sy, 20, 0, TAU); ctx.fill(); label('MOVE', 78, 688, 9, '#aeb5bf', 'center', 800);
    drawSkillButton(250, 625, '#7ee0b2', 'J', 'THORN ARC', state.cooldowns.skill1, 4.8);
    drawSkillButton(330, 625, '#f2a35e', 'K', 'EMBER BURST', state.cooldowns.skill2, 8.5);
    label('AUTO-BASIC · NEAREST', 207, 573, 9, '#aeb5bf', 'center', 800);
  }

  function drawSkillButton(x, y, color, key, text, cooldown, max) {
    ctx.globalAlpha = .18; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 35, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 35, 0, TAU); ctx.stroke();
    label(key, x, y - 4, 18, color, 'center', 900); label(text, x, y + 53, 8, '#c7ccd0', 'center', 800);
    if (cooldown > 0) label(cooldown.toFixed(1), x, y + 16, 9, '#fff', 'center', 800);
    else label('READY', x, y + 16, 8, '#fff', 'center', 900);
  }

  function drawToast() {
    roundedRect(52, 235, 286, 42, 10, 'rgba(7,9,15,.9)', 'rgba(242,189,99,.5)'); label(toastText, 195, 256, 11, '#fff2cf', 'center', 900);
  }

  function drawForge() {
    ctx.fillStyle = 'rgba(6,8,13,.88)'; ctx.fillRect(20, 164, 350, 379); roundedRect(20, 164, 350, 379, 18, null, 'rgba(242,189,99,.55)');
    label('FIELD FORGE', 38, 190, 19, '#f2bd63', 'left', 900); label('FAILURE COSTS GOLD · TIER NEVER FALLS', 38, 209, 9, '#b9c1c8', 'left', 700);
    const gearKeys = ['weapon', 'armor', 'ring'];
    gearKeys.forEach((key, i) => {
      const y = 245 + i * 58, active = state.selectedGear === key, level = save.gear[key];
      roundedRect(32, y, 326, 46, 10, active ? 'rgba(126,224,178,.14)' : 'rgba(255,255,255,.05)', active ? '#7ee0b2' : 'rgba(255,255,255,.1)');
      label(GEAR_LABELS[key], 46, y + 15, 10, active ? '#7ee0b2' : '#d9dde0', 'left', 900); label(GEAR_NAMES[key] + '  +' + level, 46, y + 32, 11, '#fff2cf', 'left', 700);
      label('DROPS ' + save.drops[key], 345, y + 23, 9, '#9ea8ae', 'right', 700);
    });
    const level = save.gear[state.selectedGear], rate = ENHANCE_RATES[level] || 0, cost = enhanceCost(level);
    roundedRect(32, 425, 326, 45, 10, 'rgba(255,255,255,.05)', 'rgba(255,255,255,.1)'); label('NEXT +' + Math.min(9, level + 1), 46, 442, 10, '#b9c1c8', 'left', 800); label(Math.round(rate * 100) + '% SUCCESS', 180, 442, 12, '#f2bd63', 'center', 900); label(cost + 'G', 338, 442, 12, '#f2bd63', 'right', 900);
    roundedRect(32, 481, 326, 45, 10, level >= 9 ? 'rgba(126,224,178,.18)' : '#f2bd63', level >= 9 ? '#7ee0b2' : '#f2bd63'); label(level >= 9 ? 'TIER MAXED' : 'ENHANCE ' + GEAR_LABELS[state.selectedGear], 195, 504, 12, level >= 9 ? '#7ee0b2' : '#16130e', 'center', 900);
  }

  function drawEnemySheet(enemy) {
    const t = ENEMY_TYPES[enemy.type];
    ctx.fillStyle = 'rgba(5,7,12,.9)'; ctx.fillRect(25, 164, 340, 356); roundedRect(25, 164, 340, 356, 18, null, t.boss ? '#f2bd63' : t.color);
    label('DROP TABLE', 45, 193, 18, t.boss ? '#f2bd63' : t.color, 'left', 900); label('TAP TO CLOSE', 345, 193, 9, '#9ea8ae', 'right', 800);
    ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(74, 251, t.boss ? 27 : 18, 0, TAU); ctx.fill(); label(t.name, 111, 244, 16, '#fff2cf', 'left', 900); label(t.boss ? 'FIELD BOSS · VISIBLE TIMER' : 'FIELD PACK CREATURE', 111, 263, 9, '#aeb5bf', 'left', 700);
    line(45, 294, 345, 294, 'rgba(255,255,255,.13)', 1); label('POSTED DROPS', 45, 315, 9, '#aeb5bf', 'left', 800);
    t.drops.forEach((drop, i) => { const color = drop.includes('EMBER') ? '#f2a35e' : drop.includes('BARK') ? '#b3c46b' : '#7ee0b2'; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(55, 347 + i * 34, 5, 0, TAU); ctx.fill(); label(drop, 70, 347 + i * 34, 12, '#f4f0e7', 'left', 800); label(i === 0 ? 'featured' : 'possible', 335, 347 + i * 34, 9, '#9ea8ae', 'right', 700); });
    line(45, 455, 345, 455, 'rgba(255,255,255,.13)', 1); label('GOLD ' + t.gold[0] + '–' + t.gold[1], 45, 480, 11, '#f2bd63', 'left', 800); label('TAP SHEETS KEEP THE GRIND HONEST', 345, 480, 9, '#9ea8ae', 'right', 700);
  }

  function drawDead() {
    ctx.fillStyle = 'rgba(8,9,14,.82)'; ctx.fillRect(0, 0, W, H); label('FIELD REWIND', 195, 255, 28, '#ff9c79', 'center', 900); label('The wild got the last cut.', 195, 290, 12, '#d6c6c2', 'center', 600); label('RESPAWN COST 10G · GEAR SAFE', 195, 322, 10, '#fff2cf', 'center', 800); roundedRect(62, 410, 266, 58, 12, '#f2bd63', '#f2bd63'); label('RESPAWN IN FIELD', 195, 440, 13, '#17130e', 'center', 900); label('best kills ' + save.best, 195, 491, 10, '#aeb5bf', 'center', 700);
  }

  function drawMastery() {
    ctx.fillStyle = 'rgba(5,8,13,.94)'; ctx.fillRect(0, 0, W, H); burstGlow('#7ee0b2');
    label('THORNMARK', 195, 110, 18, '#7ee0b2', 'center', 900); label('TWINFOLD MASTERY', 195, 175, 29, '#fff2cf', 'center', 900); label('ROOTCROWN + CINDERMAW DOWN', 195, 213, 10, '#aeb5bf', 'center', 800); label('+9 SET · EVERY RATE POSTED', 195, 241, 10, '#f2bd63', 'center', 800);
    roundedRect(42, 286, 306, 112, 16, 'rgba(126,224,178,.08)', 'rgba(126,224,178,.35)'); label('FIELD CLEAR', 195, 319, 11, '#7ee0b2', 'center', 900); label('Gold ' + Math.floor(save.gold) + '    Kills ' + Math.floor(save.kills), 195, 352, 16, '#fff2cf', 'center', 800); label('YOUR PROGRESS IS SAVED', 195, 378, 9, '#aeb5bf', 'center', 700);
    roundedRect(62, 465, 266, 58, 12, '#f2bd63', '#f2bd63'); label('PLAY THE FIELDS AGAIN', 195, 495, 12, '#17130e', 'center', 900); label('instant restart · no energy gate', 195, 550, 10, '#9ea8ae', 'center', 700);
  }

  function burstGlow(color) { ctx.globalAlpha = .12; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(195, 300, 130 + Math.sin(performance.now() / 400) * 16, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }

  function formatTime(seconds) { const s = Math.max(0, Math.ceil(seconds)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }

  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect(); return { x: (clientX - rect.left - layout.ox) / layout.scale, y: (clientY - rect.top - layout.oy) / layout.scale };
  }

  function inRect(p, x, y, w, h) { return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h; }
  function controlAt(p) {
    if (inRect(p, 208, 580, 83, 90)) return 'skill1';
    if (inRect(p, 292, 580, 83, 90)) return 'skill2';
    if (inRect(p, 18, 575, 125, 110)) return 'stick';
    return null;
  }

  function updateStick(p) {
    const dx = p.x - 78, dy = p.y - 630, len = Math.hypot(dx, dy) || 1, max = 49;
    const amount = Math.min(1, len / max); stick.x = (dx / len) * amount; stick.y = (dy / len) * amount;
  }

  function onPointerDown(event) {
    event.preventDefault();
    if (!started || orientationLandscape || document.hidden || pointers.size >= 8) { if (document.hidden) clearInputState(); return; }
    const p = toLogical(event.clientX, event.clientY);
    if (state.screen === 'dead') {
      if (inRect(p, 62, 410, 266, 58)) respawn();
      return;
    }
    if (state.screen === 'mastery') {
      if (inRect(p, 62, 465, 266, 58)) { resetRun(); showToast('THE FIELDS ARE OPEN AGAIN', 2); }
      return;
    }
    if (state.enemySheet) { state.enemySheet = null; return; }
    if (state.forgeOpen) {
      if (inRect(p, 32, 240, 326, 46)) state.selectedGear = 'weapon';
      else if (inRect(p, 32, 298, 326, 46)) state.selectedGear = 'armor';
      else if (inRect(p, 32, 356, 326, 46)) state.selectedGear = 'ring';
      else if (inRect(p, 32, 481, 326, 45)) enhance();
      else if (inRect(p, 282, 40, 94, 48)) state.forgeOpen = false;
      return;
    }
    if (inRect(p, 14, 40, 94, 48)) { switchField(0); return; }
    if (inRect(p, 107, 40, 94, 48)) { switchField(1); return; }
    if (inRect(p, 282, 40, 94, 48)) { state.forgeOpen = true; clearInputState(); return; }
    const control = controlAt(p);
    if (control) {
      if (controls[control] !== null) return;
      controls[control] = event.pointerId; pointers.set(event.pointerId, control);
      try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* optional */ }
      if (control === 'stick') updateStick(p); else queueAction(control); return;
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i], t = ENEMY_TYPES[enemy.type];
      if (!enemy.dead && Math.hypot(p.x - enemy.x, p.y - enemy.y) <= t.radius + 18) { state.enemySheet = enemy; clearInputState(); return; }
    }
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault(); const control = pointers.get(event.pointerId); if (control === 'stick') updateStick(toLogical(event.clientX, event.clientY));
  }

  function releasePointer(pointerId) {
    if (!pointers.has(pointerId)) return; const control = pointers.get(pointerId); pointers.delete(pointerId); if (controls[control] === pointerId) controls[control] = null; if (control === 'stick') stick.x = stick.y = 0;
  }

  function onPointerUp(event) { event.preventDefault(); releasePointer(event.pointerId); }

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'j', 'k'].includes(key)) return;
    event.preventDefault(); if (!started || orientationLandscape || document.hidden || state.screen !== 'play') { if (document.hidden) clearInputState(); return; }
    if (!event.repeat && (key === 'j' || key === 'k')) queueAction(key === 'j' ? 'skill1' : 'skill2'); keys.add(key);
  }

  function onKeyUp(event) { const key = event.key.toLowerCase(); if (['w', 'a', 's', 'd', 'j', 'k'].includes(key)) { event.preventDefault(); keys.delete(key); } }

  function frame(now) { const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000)); lastTime = now; update(dt); render(); rafId = requestAnimationFrame(frame); }

  enterButton.addEventListener('click', () => { unlockAudio(); started = true; audioGate.style.display = 'none'; resetRun(); lastTime = performance.now(); showToast('DRIFT INTO A PACK TO BEGIN', 2.8); });
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false }); canvas.addEventListener('pointermove', onPointerMove, { passive: false }); canvas.addEventListener('pointerup', onPointerUp, { passive: false }); canvas.addEventListener('pointercancel', onPointerUp, { passive: false });
  window.addEventListener('pointerup', onPointerUp, { passive: false }); window.addEventListener('pointercancel', onPointerUp, { passive: false }); window.addEventListener('keydown', onKeyDown, { passive: false }); window.addEventListener('keyup', onKeyUp, { passive: false }); window.addEventListener('blur', clearInputState); document.addEventListener('visibilitychange', () => { clearInputState(); if (!document.hidden) lastTime = performance.now(); }); window.addEventListener('resize', resize); window.addEventListener('orientationchange', resize);
  resize(); resetRun(); render(); rafId = requestAnimationFrame(frame);
})();
