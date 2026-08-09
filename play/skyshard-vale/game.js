(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const refs = {
    zone: document.getElementById('zone'), hpFill: document.getElementById('hp-fill'), hpLabel: document.getElementById('hp-label'),
    score: document.getElementById('score'), clock: document.getElementById('clock'), hint: document.getElementById('hint'), toast: document.getElementById('toast'),
    rotate: document.getElementById('rotate'), modal: document.getElementById('modal'), result: document.getElementById('result'), restart: document.getElementById('restart'),
    stick: document.getElementById('stick-area'), thumb: document.getElementById('stick-thumb'), attack: document.getElementById('attack'), skill: document.getElementById('skill'), chips: [...document.querySelectorAll('.chip')]
  };

  const WORLD = { w: 2200, h: 3000, lake: { x: 570, y: 1700, rx: 470, ry: 335 } };
  const LIMITS = { particles: 420, projectiles: 72, texts: 38, enemies: 14, timeouts: 18 };
  const SAVE_KEY = 'skyshard-vale-save-v1';
  const TAU = Math.PI * 2;
  const COLORS = { ink: '#101b2b', paper: '#f8f0db', mist: '#b9e7df', ember: '#ff9b69', frost: '#9bdcff', spark: '#ffe27b', wet: '#6dbde5', strike: '#e9e0bc', ruin: '#8a8a9f' };
  const characters = [
    { name: 'TAVI', role: 'BLADE', color: '#ed866b', element: 'strike' },
    { name: 'SERA', role: 'BOW', color: '#9bdcff', element: 'frost' },
    { name: 'MALK', role: 'STAFF', color: '#ffe27b', element: 'spark' }
  ];
  const shrines = [
    { id: 0, name: 'ROOTWELL', x: 1100, y: 2440, color: '#d4f4e2', ability: '', gift: 'A safe return point' },
    { id: 1, name: 'DRIFTGLASS', x: 330, y: 1740, color: '#80d6d1', ability: 'dash', gift: 'DASH · burst through blue gates' },
    { id: 2, name: 'SUNKEN ARCHIVE', x: 1660, y: 1510, color: '#e0a9e9', ability: 'lift', gift: 'LIFT · raise the ruin stair' },
    { id: 3, name: 'CLOUDSTEP', x: 1120, y: 815, color: '#f8d285', ability: 'glide', gift: 'GLIDE · cross the high wind' }
  ];
  const chests = [
    { id: 0, x: 855, y: 2310 }, { id: 1, x: 205, y: 1360 }, { id: 2, x: 930, y: 1470 },
    { id: 3, x: 1830, y: 1760 }, { id: 4, x: 870, y: 690 }, { id: 5, x: 1930, y: 420 }
  ];

  let saveData = readSave();
  let viewport = { w: 390, h: 700, scale: 1 };
  let orientationPaused = false;
  let rafId = 0;
  let previousTime = 0;
  let audioContext = null;
  let toastTimer = 0;
  const timeoutIds = new Set();
  const input = {
    keys: new Set(), queued: [], held: { attack: false }, keySkillDown: false,
    stick: { x: 0, y: 0, mag: 0 }, stickPointerId: null, controlPointers: new Map()
  };
  const particles = [], projectiles = [], floatTexts = [];
  let enemies = [];
  let player;
  let game;

  function finite(value, fallback, min, max) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  }

  function readSave() {
    const blank = { shrineBits: 1, chestBits: 0, best: 0 };
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (typeof raw !== 'string' || raw.length > 2000) return blank;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return blank;
      const shrineBits = Number.isInteger(parsed.shrineBits) ? (parsed.shrineBits & 15) | 1 : 1;
      const chestBits = Number.isInteger(parsed.chestBits) ? (parsed.chestBits & 63) : 0;
      const best = finite(parsed.best, 0, 0, 999999);
      return { shrineBits, chestBits, best };
    } catch (_) { return blank; }
  }

  function persist() {
    try {
      const safe = { shrineBits: Number.isInteger(saveData.shrineBits) ? saveData.shrineBits & 15 : 1, chestBits: Number.isInteger(saveData.chestBits) ? saveData.chestBits & 63 : 0, best: finite(saveData.best, 0, 0, 999999) };
      localStorage.setItem(SAVE_KEY, JSON.stringify(safe));
    } catch (_) { /* Storage can be disabled; the run remains playable. */ }
  }

  function makePlayer() {
    return { x: shrines[0].x, y: shrines[0].y, hp: 100, maxHp: 100, facing: -Math.PI / 2, char: 0, attackCd: 0, skillCd: 0, invuln: 0, dashTime: 0, dashX: 0, dashY: 0, respawnTime: 0, lastShrine: 0 };
  }

  function makeEnemies() {
    const guardianPositions = [[330, 1740], [1660, 1510], [1120, 815]];
    const list = [
      { x: 930, y: 2230, kind: 'mote', hp: 42, damage: 8 }, { x: 630, y: 1920, kind: 'mote', hp: 48, damage: 9 },
      { x: 790, y: 1310, kind: 'mote', hp: 45, damage: 9 }, { x: 1410, y: 1770, kind: 'guard', hp: 68, damage: 11 },
      { x: 1870, y: 1380, kind: 'guard', hp: 72, damage: 12 }, { x: 1460, y: 1050, kind: 'mote', hp: 55, damage: 10 },
      { x: 460, y: 1670, kind: 'guardian', hp: 105, damage: 13, shrine: 1 }, { x: 1510, y: 1550, kind: 'guardian', hp: 120, damage: 14, shrine: 2 },
      { x: 1260, y: 750, kind: 'guardian', hp: 132, damage: 15, shrine: 3 },
      { x: 1500, y: 310, kind: 'boss', hp: 270, damage: 18, boss: true }
    ];
    return list.slice(0, LIMITS.enemies).map((source, index) => {
      const maxHp = source.hp;
      const unlocked = source.shrine !== undefined && (saveData.shrineBits & (1 << source.shrine));
      return { id: index, x: source.x, y: source.y, homeX: source.x, homeY: source.y, kind: source.kind, boss: !!source.boss, shrine: source.shrine, hp: unlocked ? 0 : maxHp, maxHp, damage: source.damage, element: source.shrine !== undefined ? 'frost' : '', statusTime: 0, hitCd: 0, stun: 0, attackTimer: 0, dead: !!unlocked, wake: false };
    });
  }

  function resetRun() {
    clearAllInput();
    clearTrackedTimeouts();
    particles.length = 0; projectiles.length = 0; floatTexts.length = 0;
    player = makePlayer(); enemies = makeEnemies();
    game = { phase: 'play', time: 0, score: 0, best: saveData.best, shake: 0, flash: 0, zone: 'MEADOW', respawnLock: false, hint: 'Walk the valley. Attune shrines to earn movement gifts.', abilities: { dash: !!(saveData.shrineBits & 2), lift: !!(saveData.shrineBits & 4), glide: !!(saveData.shrineBits & 8) } };
    refs.modal.classList.remove('visible');
    refs.hint.textContent = game.hint;
    if (game.abilities.dash) showToast('YOUR MAP REMEMBERS · DASH READY', 1800);
    updateUi();
  }

  function schedule(callback, delay) {
    if (timeoutIds.size >= LIMITS.timeouts) return 0;
    const id = window.setTimeout(() => { timeoutIds.delete(id); callback(); }, delay);
    timeoutIds.add(id);
    return id;
  }

  function clearTrackedTimeouts() {
    timeoutIds.forEach(id => window.clearTimeout(id));
    timeoutIds.clear();
    if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = 0; }
  }

  function showToast(message, duration = 1500) {
    if (toastTimer) window.clearTimeout(toastTimer);
    refs.toast.textContent = message;
    refs.toast.classList.add('show');
    toastTimer = schedule(() => { refs.toast.classList.remove('show'); toastTimer = 0; }, duration);
  }

  function unlockAudio() {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
    } catch (_) { audioContext = null; }
  }

  function tone(frequency, length = .07, type = 'sine', volume = .025) {
    if (!audioContext) return;
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator(); const gain = audioContext.createGain();
      osc.type = type; osc.frequency.setValueAtTime(frequency, now); osc.frequency.exponentialRampToValueAtTime(Math.max(45, frequency * .72), now + length);
      gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.001, now + length);
      osc.connect(gain).connect(audioContext.destination); osc.start(now); osc.stop(now + length + .01);
    } catch (_) { /* Audio is decoration, never a dependency. */ }
  }

  function resize() {
    const w = Math.max(1, window.innerWidth); const h = Math.max(1, window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.min(dpr, 960 / Math.max(w, h));
    viewport = { w, h, scale: Math.max(.1, scale) };
    canvas.width = Math.max(1, Math.round(w * viewport.scale)); canvas.height = Math.max(1, Math.round(h * viewport.scale));
    ctx.setTransform(viewport.scale, 0, 0, viewport.scale, 0, 0);
    checkOrientation();
  }

  function checkOrientation() {
    const show = window.innerWidth > window.innerHeight;
    if (show !== orientationPaused) {
      orientationPaused = show;
      refs.rotate.classList.toggle('visible', show);
      clearAllInput();
      previousTime = performance.now();
    } else refs.rotate.classList.toggle('visible', show);
  }

  function clearAllInput() {
    input.keys.clear(); input.queued.length = 0; input.held.attack = false; input.keySkillDown = false;
    input.stick.x = 0; input.stick.y = 0; input.stick.mag = 0; input.stickPointerId = null; input.controlPointers.clear();
    refs.thumb.style.transform = 'translate(0, 0)'; refs.attack.classList.remove('held');
  }

  function queueAction(action) {
    if (input.queued.length >= 12) input.queued.shift();
    input.queued.push(action);
  }

  function takeAction(action) {
    const index = input.queued.indexOf(action);
    if (index < 0) return false;
    input.queued.splice(index, 1); return true;
  }

  function bindControls() {
    const press = (element, name, onDown, onUp) => {
      element.addEventListener('pointerdown', event => {
        event.preventDefault(); unlockAudio();
        if (input.controlPointers.has(name)) return;
        input.controlPointers.set(name, event.pointerId); element.setPointerCapture?.(event.pointerId); onDown(event);
      }, { passive: false });
      const release = event => { if (input.controlPointers.get(name) !== event.pointerId) return; event.preventDefault(); input.controlPointers.delete(name); onUp?.(event); };
      element.addEventListener('pointerup', release, { passive: false }); element.addEventListener('pointercancel', release, { passive: false });
    };
    refs.stick.addEventListener('pointerdown', event => {
      event.preventDefault(); unlockAudio(); if (input.stickPointerId !== null) return;
      input.stickPointerId = event.pointerId; refs.stick.setPointerCapture?.(event.pointerId); updateStick(event);
    }, { passive: false });
    const endStick = event => { if (input.stickPointerId !== event.pointerId) return; event.preventDefault(); input.stickPointerId = null; input.stick.x = 0; input.stick.y = 0; input.stick.mag = 0; refs.thumb.style.transform = 'translate(0, 0)'; };
    refs.stick.addEventListener('pointermove', event => { if (input.stickPointerId === event.pointerId) { event.preventDefault(); updateStick(event); } }, { passive: false });
    refs.stick.addEventListener('pointerup', endStick, { passive: false }); refs.stick.addEventListener('pointercancel', endStick, { passive: false });
    press(refs.attack, 'attack', () => { input.held.attack = true; refs.attack.classList.add('held'); }, () => { input.held.attack = false; refs.attack.classList.remove('held'); });
    press(refs.skill, 'skill', () => queueAction('skill'));
    refs.chips.forEach(chip => press(chip, `chip-${chip.dataset.slot}`, () => queueAction(`swap-${chip.dataset.slot}`)));
    press(refs.restart, 'restart', () => resetRun());
    canvas.addEventListener('pointerdown', event => { event.preventDefault(); unlockAudio(); }, { passive: false });
    window.addEventListener('keydown', event => {
      unlockAudio(); const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'j', 'k', '1', '2', '3', ' '].includes(key)) event.preventDefault();
      if (key === 'j') { input.keys.add(key); input.held.attack = true; refs.attack.classList.add('held'); }
      else if (key === 'k') { if (!input.keySkillDown) queueAction('skill'); input.keySkillDown = true; input.keys.add(key); }
      else if (key >= '1' && key <= '3') queueAction(`swap-${Number(key) - 1}`);
      else if (key === 'w' || key === 'a' || key === 's' || key === 'd') input.keys.add(key);
    }, { passive: false });
    window.addEventListener('keyup', event => { const key = event.key.toLowerCase(); input.keys.delete(key); if (key === 'j') { input.held.attack = false; refs.attack.classList.remove('held'); } if (key === 'k') input.keySkillDown = false; }, { passive: false });
    window.addEventListener('blur', clearAllInput);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearAllInput(); });
    document.addEventListener('touchmove', event => event.preventDefault(), { passive: false });
  }

  function updateStick(event) {
    const rect = refs.stick.getBoundingClientRect(); const cx = rect.left + rect.width / 2; const cy = rect.top + rect.height / 2;
    const max = rect.width * .37; let dx = event.clientX - cx; let dy = event.clientY - cy; const distance = Math.hypot(dx, dy); const mag = Math.min(1, distance / max);
    if (distance > max) { dx = dx / distance * max; dy = dy / distance * max; }
    input.stick.x = dx / max; input.stick.y = dy / max; input.stick.mag = mag; refs.thumb.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function keyVector() {
    let x = 0, y = 0; if (input.keys.has('a')) x -= 1; if (input.keys.has('d')) x += 1; if (input.keys.has('w')) y -= 1; if (input.keys.has('s')) y += 1;
    const length = Math.hypot(x, y); return length ? { x: x / length, y: y / length, mag: 1 } : input.stick;
  }

  function clampWorld(x, y) { return { x: Math.max(32, Math.min(WORLD.w - 32, x)), y: Math.max(32, Math.min(WORLD.h - 32, y)) }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function insideLake(x, y) { const dx = (x - WORLD.lake.x) / WORLD.lake.rx, dy = (y - WORLD.lake.y) / WORLD.lake.ry; return dx * dx + dy * dy < 1; }
  function shrineUnlocked(id) { return !!(saveData.shrineBits & (1 << id)); }

  function gateMessage(x, y) {
    if (!game.abilities.dash && x > 1240 && x < 1300 && y > 1400 && y < 1980) return 'DRIFTGLASS SHRINE: find a way through the blue break.';
    if (!game.abilities.lift && y < 1080 && y > 1000 && x > 1000 && x < 1900) return 'THE RUIN STAIR IS PINNED. SEEK THE ARCHIVE SHRINE.';
    if (!game.abilities.glide && y < 620 && y > 560 && x > 950 && x < 1850) return 'THE HIGH WIND NEEDS A GLIDE. ATTUNE CLOUDSTEP.';
    return '';
  }

  function canMoveTo(x, y) {
    if (player.dashTime > 0) return true;
    return !gateMessage(x, y);
  }

  function movement(dt) {
    const move = keyVector(); if (!move.mag) return;
    if (player.dashTime > 0) { const dashNext = clampWorld(player.x + player.dashX * dt, player.y + player.dashY * dt); player.x = dashNext.x; player.y = dashNext.y; return; }
    player.facing = Math.atan2(move.y, move.x);
    const speed = 205; const nx = player.x + move.x * speed * move.mag * dt; const ny = player.y + move.y * speed * move.mag * dt; const next = clampWorld(nx, ny);
    if (canMoveTo(next.x, player.y)) player.x = next.x;
    if (canMoveTo(player.x, next.y)) player.y = next.y;
  }

  function performDash() {
    if (!game.abilities.dash || player.skillCd > 0) return false;
    const move = keyVector(); if (!move.mag) return false;
    player.dashTime = .24; player.dashX = move.x * 880; player.dashY = move.y * 880; player.skillCd = .38; player.invuln = .32;
    burst(player.x, player.y, COLORS.mist, 16, 2); tone(230, .12, 'triangle', .04); game.shake = Math.max(game.shake, 5); return true;
  }

  function processActions() {
    if (takeAction('skill') && !performDash()) useSkill();
    for (let i = 0; i < 3; i++) if (takeAction(`swap-${i}`)) swapCharacter(i);
    if (input.held.attack) attack();
  }

  function swapCharacter(index) {
    if (!characters[index] || player.char === index) return;
    player.char = index; player.attackCd = .12; burst(player.x, player.y, characters[index].color, 8, 1); tone(180 + index * 80, .07, 'sine', .025); showToast(`${characters[index].name} · ${characters[index].role}`, 650);
  }

  function attack() {
    if (player.attackCd > 0 || game.phase !== 'play') return;
    const current = characters[player.char]; player.attackCd = player.char === 1 ? .36 : .28; tone(player.char === 0 ? 120 : player.char === 1 ? 430 : 690, .07, player.char === 0 ? 'sawtooth' : 'sine', .035);
    if (player.char === 0) {
      burst(player.x + Math.cos(player.facing) * 42, player.y + Math.sin(player.facing) * 42, COLORS.ember, 9, 1);
      enemies.forEach(enemy => { if (!enemy.dead && dist(player, enemy) < (enemy.boss ? 74 : 82) && inFront(enemy, 1.15)) applyHit(enemy, 25, 'strike'); });
    } else if (player.char === 1) fireProjectile(player.x, player.y, player.facing, 620, 22, 'frost', COLORS.frost, 1);
    else fireProjectile(player.x, player.y, player.facing, 440, 20, 'spark', COLORS.spark, 2);
  }

  function useSkill() {
    if (player.skillCd > 0 || game.phase !== 'play') return;
    player.skillCd = player.char === 1 ? 2.7 : 2.2; const angle = player.facing;
    if (player.char === 0) {
      burst(player.x, player.y, COLORS.ember, 28, 3); game.flash = .12;
      enemies.forEach(enemy => { if (!enemy.dead && dist(player, enemy) < 140) applyHit(enemy, 48, 'ember'); }); tone(150, .2, 'sawtooth', .05);
    } else if (player.char === 1) {
      for (let i = -2; i <= 2; i++) fireProjectile(player.x, player.y, angle + i * .12, 550, 28, 'frost', COLORS.frost, 1);
      burst(player.x, player.y, COLORS.frost, 18, 2); tone(480, .18, 'sine', .045);
    } else {
      burst(player.x, player.y, COLORS.spark, 22, 2);
      enemies.forEach(enemy => { if (!enemy.dead && dist(player, enemy) < 190) applyHit(enemy, 36, 'spark'); });
      tone(740, .2, 'square', .035);
    }
  }

  function inFront(target, halfAngle) {
    const targetAngle = Math.atan2(target.y - player.y, target.x - player.x); let delta = Math.atan2(Math.sin(targetAngle - player.facing), Math.cos(targetAngle - player.facing)); return Math.abs(delta) < halfAngle;
  }

  function fireProjectile(x, y, angle, speed, damage, element, color, owner) {
    if (projectiles.length >= LIMITS.projectiles) projectiles.splice(0, Math.ceil(LIMITS.projectiles * .08));
    projectiles.push({ x: x + Math.cos(angle) * 24, y: y + Math.sin(angle) * 24, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.1, damage, element, color, owner, radius: owner === 2 ? 13 : 8 });
  }

  function applyHit(target, baseDamage, element, chained = false) {
    if (!target || target.dead) return;
    let damage = baseDamage; let combo = '';
    const old = target.element;
    if ((element === 'spark' && old === 'wet') || (element === 'wet' && old === 'spark')) { damage *= 1.8; combo = 'CHAIN SHOCK'; target.stun = 1.1; shockChain(target); }
    else if ((element === 'strike' && old === 'frost') || (element === 'frost' && old === 'strike')) { damage *= 1.7; combo = 'SHATTER'; target.stun = .7; burst(target.x, target.y, COLORS.paper, 18, 3); }
    else if ((element === 'ember' && old === 'wet') || (element === 'wet' && old === 'ember')) { player.hp = Math.min(player.maxHp, player.hp + 8); combo = 'STEAM HEAL +8'; burst(player.x, player.y, COLORS.mist, 12, 2); }
    target.hp -= damage; target.element = element; target.statusTime = 4;
    floatText(target.x, target.y - 30, combo || `-${Math.round(damage)}`, combo ? COLORS.paper : colorForElement(element));
    burst(target.x, target.y, colorForElement(element), combo ? 11 : 5, combo ? 2 : 1); game.shake = Math.max(game.shake, combo ? 7 : 2);
    if (combo) { floatText(target.x, target.y - 52, combo, COLORS.paper); tone(combo === 'CHAIN SHOCK' ? 780 : combo === 'SHATTER' ? 220 : 360, .14, 'triangle', .04); }
    if (target.hp <= 0) defeatEnemy(target);
  }

  function shockChain(source) {
    let chained = 0;
    enemies.forEach(enemy => { if (enemy !== source && !enemy.dead && chained < 2 && dist(source, enemy) < 155) { enemy.stun = .65; enemy.hp -= 12; burst(enemy.x, enemy.y, COLORS.spark, 7, 1); chained++; if (enemy.hp <= 0) defeatEnemy(enemy); } });
  }

  function colorForElement(element) { return element === 'ember' ? COLORS.ember : element === 'frost' ? COLORS.frost : element === 'spark' ? COLORS.spark : element === 'wet' ? COLORS.wet : COLORS.strike; }

  function defeatEnemy(enemy) {
    if (enemy.dead) return; enemy.dead = true; enemy.hp = 0; game.score += enemy.boss ? 1500 : enemy.shrine !== undefined ? 260 : 80; burst(enemy.x, enemy.y, enemy.boss ? COLORS.paper : colorForElement(enemy.element || 'strike'), enemy.boss ? 70 : 24, enemy.boss ? 4 : 2); game.shake = enemy.boss ? 16 : 7; tone(enemy.boss ? 90 : 180, enemy.boss ? .5 : .16, 'triangle', .05);
    if (enemy.boss) { completeRun(); return; }
    if (enemy.shrine !== undefined) showToast('GUARDIAN SILENCED · ATTUNE THE SHRINE', 1500);
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const shot = projectiles[i]; shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      let remove = shot.life <= 0 || shot.x < 0 || shot.x > WORLD.w || shot.y < 0 || shot.y > WORLD.h;
      if (!remove && shot.owner !== 0) {
        for (const enemy of enemies) if (!enemy.dead && Math.hypot(enemy.x - shot.x, enemy.y - shot.y) < shot.radius + (enemy.boss ? 25 : 18)) { applyHit(enemy, shot.damage, shot.element); remove = true; break; }
      } else if (!remove && shot.owner === 0 && Math.hypot(player.x - shot.x, player.y - shot.y) < shot.radius + 18) { harmPlayer(shot.damage); remove = true; }
      if (remove) projectiles.splice(i, 1);
    }
  }

  function updateEnemies(dt) {
    enemies.forEach(enemy => {
      if (enemy.dead) return; enemy.hitCd -= dt; enemy.stun -= dt; enemy.statusTime -= dt; enemy.attackTimer -= dt;
      if (enemy.statusTime <= 0 && enemy.element !== 'wet') enemy.element = '';
      if (insideLake(enemy.x, enemy.y)) { enemy.element = 'wet'; enemy.statusTime = Math.max(enemy.statusTime, .2); }
      const distance = dist(player, enemy); const aggro = enemy.boss ? 680 : enemy.kind === 'guardian' ? 470 : 360;
      if (distance < aggro) enemy.wake = true;
      if (enemy.stun > 0) return;
      if (enemy.boss && enemy.wake && enemy.attackTimer <= 0) { enemy.attackTimer = 1.25; const a = Math.atan2(player.y - enemy.y, player.x - enemy.x); fireProjectile(enemy.x, enemy.y, a, 250, 10, 'spark', COLORS.spark, 0); burst(enemy.x, enemy.y, COLORS.spark, 7, 1); }
      if (enemy.wake && distance > (enemy.boss ? 100 : 42)) { const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x); const speed = enemy.boss ? 56 : enemy.kind === 'guardian' ? 46 : 64; enemy.x += Math.cos(angle) * speed * dt; enemy.y += Math.sin(angle) * speed * dt; }
      if (distance < (enemy.boss ? 96 : 45) && enemy.hitCd <= 0) { enemy.hitCd = enemy.boss ? 1.05 : 1.3; harmPlayer(enemy.damage); }
    });
  }

  function harmPlayer(damage) {
    if (player.invuln > 0 || player.respawnTime > 0 || game.phase !== 'play') return;
    player.hp -= damage; player.invuln = .42; game.flash = .14; game.shake = Math.max(game.shake, 7); floatText(player.x, player.y - 35, `-${damage}`, '#ff8b79'); tone(80, .12, 'sawtooth', .035);
    if (player.hp <= 0) respawnAtShrine();
  }

  function respawnAtShrine() {
    const shrine = shrines[player.lastShrine] || shrines[0]; player.x = shrine.x; player.y = shrine.y; player.hp = player.maxHp; player.respawnTime = 1.05; player.invuln = 1.4; game.score = Math.max(0, game.score - 30); burst(player.x, player.y, shrine.color, 32, 3); showToast(`RETURNED TO ${shrine.name}`, 1250); tone(280, .25, 'sine', .04);
  }

  function updateShrines() {
    shrines.forEach(shrine => {
      if (shrineUnlocked(shrine.id)) { if (dist(player, shrine) < 105) player.lastShrine = shrine.id; return; }
      if (dist(player, shrine) < 100) {
        const guardian = enemies.find(enemy => enemy.shrine === shrine.id);
        if (guardian && guardian.dead) {
          saveData.shrineBits |= 1 << shrine.id; persist(); game.abilities[shrine.ability] = true; player.lastShrine = shrine.id; game.score += 300; burst(shrine.x, shrine.y, shrine.color, 50, 3); floatText(shrine.x, shrine.y - 85, shrine.gift, shrine.color); showToast(`${shrine.name} ATTUNED · ${shrine.gift}`, 2200); tone(390 + shrine.id * 120, .34, 'triangle', .05);
        } else if (game.time % 2 < .03) showToast('A GUARDIAN HOLDS THIS SHRINE', 900);
      }
    });
  }

  function updateChests() {
    chests.forEach(chest => {
      if (saveData.chestBits & (1 << chest.id)) return;
      if (Math.hypot(player.x - chest.x, player.y - chest.y) < 48) {
        saveData.chestBits |= 1 << chest.id; persist(); player.maxHp = Math.min(150, player.maxHp + 8); player.hp = Math.min(player.maxHp, player.hp + 25); game.score += 120; burst(chest.x, chest.y, COLORS.spark, 20, 2); showToast('CACHE OPEN · VITAL +8', 1100); tone(560, .18, 'sine', .04);
      }
    });
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy *= .97; p.life -= dt; if (p.life <= 0) particles.splice(i, 1); }
    for (let i = floatTexts.length - 1; i >= 0; i--) { const t = floatTexts[i]; t.y -= 22 * dt; t.life -= dt; if (t.life <= 0) floatTexts.splice(i, 1); }
  }

  function addParticle(x, y, color, life, size, vx, vy) {
    if (particles.length >= LIMITS.particles) particles.splice(0, Math.ceil(LIMITS.particles * .08)); particles.push({ x, y, color, life, maxLife: life, size, vx, vy });
  }

  function burst(x, y, color, count = 8, force = 1) {
    const safeCount = Math.min(count, 70);
    for (let i = 0; i < safeCount; i++) { const a = Math.random() * TAU; const speed = (20 + Math.random() * 75) * force; addParticle(x, y, color, .35 + Math.random() * .5, 2 + Math.random() * 3, Math.cos(a) * speed, Math.sin(a) * speed); }
  }

  function floatText(x, y, text, color) {
    if (floatTexts.length >= LIMITS.texts) floatTexts.splice(0, 2); floatTexts.push({ x, y, text, color, life: 1.05 });
  }

  function zoneAt(x, y) { if (y < 950) return 'PEAK'; if (x > 1250 && y < 2150) return 'RUIN'; if (insideLake(x, y)) return 'LAKE'; return 'MEADOW'; }

  function update(dt) {
    if (game.phase !== 'play' || orientationPaused) return;
    game.time += dt; player.attackCd = Math.max(0, player.attackCd - dt); player.skillCd = Math.max(0, player.skillCd - dt); player.invuln = Math.max(0, player.invuln - dt); player.respawnTime = Math.max(0, player.respawnTime - dt); player.dashTime = Math.max(0, player.dashTime - dt); game.shake = Math.max(0, game.shake - dt * 20); game.flash = Math.max(0, game.flash - dt);
    processActions(); movement(dt); updateProjectiles(dt); updateEnemies(dt); updateShrines(); updateChests(); updateParticles(dt);
    game.zone = zoneAt(player.x, player.y); refs.zone.textContent = game.zone;
    const active = characters[player.char]; game.hint = !game.abilities.dash ? 'Find the lake guardian, then touch the Driftglass shrine.' : !game.abilities.lift ? 'Dash through the blue break. The ruin guardian guards LIFT.' : !game.abilities.glide ? 'Lift the ruin stair. Cloudstep waits in the pale wind.' : 'Glide through the high wind and silence the valley boss.';
    refs.hint.textContent = game.hint; updateUi();
    if (game.time > 99999) game.time = 0;
  }

  function updateUi() {
    if (!player || !game) return; const hp = Math.max(0, player.hp); refs.hpFill.style.width = `${Math.max(0, Math.min(100, hp / player.maxHp * 100))}%`; refs.hpLabel.textContent = `VITAL ${Math.ceil(hp)} / ${player.maxHp}`; refs.score.textContent = `SCORE ${String(Math.floor(game.score)).padStart(4, '0')}`; refs.clock.textContent = `TIME ${formatTime(game.time)}`; refs.skill.classList.toggle('ready', player.skillCd <= 0); refs.chips.forEach((chip, i) => chip.classList.toggle('active', i === player.char));
  }

  function formatTime(seconds) { const total = Math.floor(seconds); return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }

  function completeRun() {
    if (game.phase !== 'play') return; game.phase = 'win'; clearAllInput(); const finalScore = Math.floor(game.score); if (!saveData.best || finalScore > saveData.best) { saveData.best = finalScore; persist(); } refs.result.textContent = `TIME ${formatTime(game.time)} · SCORE ${String(finalScore).padStart(4, '0')} · BEST ${String(Math.floor(saveData.best)).padStart(4, '0')}`; refs.modal.classList.add('visible'); showToast('THE VALE IS CLEAR', 1800);
  }

  function camera() { return { x: Math.max(0, Math.min(WORLD.w - viewport.w, player.x - viewport.w / 2)), y: Math.max(0, Math.min(WORLD.h - viewport.h, player.y - viewport.h / 2)) }; }

  function draw() {
    if (!player || !game) return; ctx.setTransform(viewport.scale, 0, 0, viewport.scale, 0, 0); ctx.clearRect(0, 0, viewport.w, viewport.h);
    const cam = camera(); const shakeX = game.shake ? (Math.random() - .5) * game.shake : 0; const shakeY = game.shake ? (Math.random() - .5) * game.shake : 0;
    ctx.save(); ctx.translate(-cam.x + shakeX, -cam.y + shakeY); drawWorld(cam); drawEntities(); ctx.restore();
    if (game.flash > 0) { ctx.fillStyle = `rgba(255,235,204,${game.flash * 1.8})`; ctx.fillRect(0, 0, viewport.w, viewport.h); }
    if (game.phase === 'win') { ctx.fillStyle = '#f8d28522'; ctx.fillRect(0, 0, viewport.w, viewport.h); }
  }

  function drawWorld(cam) {
    ctx.fillStyle = '#152d3b'; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    ctx.fillStyle = '#244c4b'; ctx.fillRect(0, 1500, 1230, 1500); ctx.fillStyle = '#304450'; ctx.fillRect(1230, 1050, 970, 1950); ctx.fillStyle = '#34445a'; ctx.fillRect(0, 0, WORLD.w, 1050);
    for (let i = 0; i < 34; i++) { const x = (i * 337) % WORLD.w; const y = (i * 191 + 120) % WORLD.h; ctx.fillStyle = i % 2 ? '#5e9b78' : '#477c69'; ctx.globalAlpha = .17; ctx.beginPath(); ctx.arc(x, y, 30 + (i % 4) * 9, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    drawPaths(); drawLake(); drawRuin(); drawPeak(); drawGates(); drawLabels();
    shrines.forEach(drawShrine); chests.forEach(drawChest);
  }

  function drawPaths() {
    ctx.lineCap = 'round'; ctx.strokeStyle = '#d0b17a55'; ctx.lineWidth = 42; ctx.beginPath(); ctx.moveTo(1100, 2480); ctx.bezierCurveTo(900, 2240, 620, 2070, 340, 1740); ctx.stroke(); ctx.beginPath(); ctx.moveTo(330, 1740); ctx.bezierCurveTo(730, 1590, 1050, 1610, 1660, 1510); ctx.stroke(); ctx.beginPath(); ctx.moveTo(1660, 1510); ctx.bezierCurveTo(1510, 1220, 1320, 1020, 1120, 815); ctx.stroke(); ctx.beginPath(); ctx.moveTo(1120, 815); ctx.bezierCurveTo(1170, 620, 1320, 440, 1500, 310); ctx.stroke();
  }

  function drawLake() {
    ctx.save(); ctx.translate(WORLD.lake.x, WORLD.lake.y); ctx.scale(WORLD.lake.rx, WORLD.lake.ry); ctx.fillStyle = '#3d91ad'; ctx.beginPath(); ctx.ellipse(0, 0, 1, 1, -.18, 0, TAU); ctx.fill(); ctx.strokeStyle = '#a4e1d888'; ctx.lineWidth = .025; ctx.stroke(); ctx.restore();
    ctx.strokeStyle = '#b8e9df55'; ctx.lineWidth = 5; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(WORLD.lake.x + i * 120, WORLD.lake.y + (i % 2) * 40, 44, .2, 2.2); ctx.stroke(); }
  }

  function drawRuin() {
    ctx.fillStyle = '#697284'; ctx.globalAlpha = .78; ctx.fillRect(1390, 1260, 520, 500); ctx.globalAlpha = 1; ctx.fillStyle = '#374458'; ctx.fillRect(1440, 1320, 95, 300); ctx.fillRect(1620, 1235, 110, 420); ctx.fillRect(1810, 1330, 76, 340); ctx.fillStyle = '#9a9ab2'; ctx.globalAlpha = .55; ctx.fillRect(1385, 1255, 550, 16); ctx.globalAlpha = 1; ctx.strokeStyle = '#b5c0c977'; ctx.lineWidth = 8; ctx.strokeRect(1480, 1420, 110, 130); ctx.strokeRect(1730, 1370, 88, 150);
  }

  function drawPeak() {
    ctx.fillStyle = '#4c627b'; ctx.beginPath(); ctx.moveTo(760, 620); ctx.lineTo(1140, 60); ctx.lineTo(1730, 610); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#8b9eb0'; ctx.beginPath(); ctx.moveTo(1140, 60); ctx.lineTo(1320, 480); ctx.lineTo(1110, 390); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#d7e2de99'; ctx.beginPath(); ctx.moveTo(1140, 60); ctx.lineTo(1270, 260); ctx.lineTo(1150, 220); ctx.lineTo(1050, 340); ctx.closePath(); ctx.fill();
  }

  function drawGates() {
    if (!game.abilities.dash) drawGate(1270, 1410, 1270, 1940, COLORS.mist, 'DASH');
    if (!game.abilities.lift) drawGate(1020, 1040, 1890, 1040, '#d9a8eb', 'LIFT');
    if (!game.abilities.glide) drawGate(970, 585, 1850, 585, COLORS.spark, 'GLIDE');
  }

  function drawGate(x1, y1, x2, y2, color, label) {
    ctx.save(); ctx.strokeStyle = color + '99'; ctx.lineWidth = 12; ctx.setLineDash([12, 12]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = color; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.fillText(label, (x1 + x2) / 2, (y1 + y2) / 2 - 12); ctx.restore();
  }

  function drawLabels() {
    ctx.save(); ctx.font = '900 23px system-ui'; ctx.letterSpacing = '3px'; ctx.fillStyle = '#d4f4e244'; ctx.fillText('GREENWIND MEADOW', 750, 2730); ctx.fillText('THE BLUEWATER', 280, 1130); ctx.fillText('FALLEN ARCHIVE', 1450, 1870); ctx.fillText('HIGH SHARD', 1060, 170); ctx.restore();
  }

  function drawShrine(shrine) {
    const unlocked = shrineUnlocked(shrine.id); const pulse = 1 + Math.sin(game.time * 3 + shrine.id) * .08; ctx.save(); ctx.translate(shrine.x, shrine.y); ctx.globalAlpha = unlocked ? .95 : .7; ctx.strokeStyle = shrine.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 29 * pulse, 0, TAU); ctx.stroke(); ctx.rotate(Math.PI / 4); ctx.fillStyle = shrine.color + '99'; ctx.fillRect(-17, -17, 34, 34); ctx.rotate(-Math.PI / 4); ctx.fillStyle = '#102434'; ctx.beginPath(); ctx.moveTo(-10, 13); ctx.lineTo(0, -21); ctx.lineTo(10, 13); ctx.closePath(); ctx.fill(); if (unlocked) { ctx.globalAlpha = .13; ctx.fillStyle = shrine.color; ctx.beginPath(); ctx.arc(0, 0, 78 + Math.sin(game.time * 2) * 5, 0, TAU); ctx.fill(); } ctx.fillStyle = shrine.color; ctx.font = '900 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(shrine.name, 0, 54); ctx.restore();
  }

  function drawChest(chest) {
    const open = !!(saveData.chestBits & (1 << chest.id)); ctx.save(); ctx.translate(chest.x, chest.y); ctx.fillStyle = open ? '#607078' : '#e1a45c'; ctx.strokeStyle = open ? '#98b4b2' : '#ffe0a0'; ctx.lineWidth = 3; ctx.fillRect(-18, -13, 36, 26); ctx.strokeRect(-18, -13, 36, 26); if (!open) { ctx.fillStyle = '#fff0b0'; ctx.fillRect(-3, -2, 6, 8); } ctx.restore();
  }

  function drawEntities() {
    projectiles.forEach(shot => { ctx.save(); ctx.translate(shot.x, shot.y); ctx.rotate(Math.atan2(shot.vy, shot.vx)); ctx.fillStyle = shot.color; ctx.shadowColor = shot.color; ctx.shadowBlur = 12; ctx.fillRect(-shot.radius, -2, shot.radius * 2.4, 4); ctx.restore(); });
    enemies.forEach(drawEnemy); drawPlayer(); particles.forEach(drawParticle); floatTexts.forEach(drawFloatText);
  }

  function drawEnemy(enemy) {
    if (enemy.dead) return; const color = enemy.boss ? '#e6a4df' : enemy.shrine !== undefined ? '#d6b0ed' : colorForElement(enemy.element || 'strike'); ctx.save(); ctx.translate(enemy.x, enemy.y); const bob = Math.sin(game.time * 4 + enemy.id) * 3; ctx.globalAlpha = enemy.stun > 0 ? .65 : 1; ctx.fillStyle = '#07121c88'; ctx.beginPath(); ctx.ellipse(0, 20, enemy.boss ? 40 : 22, 9, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = enemy.boss ? 5 : 3; ctx.fillStyle = enemy.boss ? '#5a3d6d' : '#273b4c'; ctx.beginPath(); ctx.arc(0, bob, enemy.boss ? 32 : enemy.kind === 'guardian' ? 24 : 17, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(-7, bob - 4, 4, 0, TAU); ctx.arc(7, bob - 4, 4, 0, TAU); ctx.fill(); if (enemy.boss) { ctx.rotate(game.time * .5); ctx.strokeStyle = '#f8d285aa'; ctx.beginPath(); ctx.moveTo(-48, 0); ctx.lineTo(0, -48); ctx.lineTo(48, 0); ctx.lineTo(0, 48); ctx.closePath(); ctx.stroke(); } ctx.restore();
    drawHealth(enemy);
  }

  function drawHealth(enemy) { const width = enemy.boss ? 98 : 38; const pct = Math.max(0, enemy.hp / enemy.maxHp); ctx.fillStyle = '#07121ccc'; ctx.fillRect(enemy.x - width / 2, enemy.y - (enemy.boss ? 54 : 31), width, 5); ctx.fillStyle = enemy.boss ? '#ed91c6' : '#ffb982'; ctx.fillRect(enemy.x - width / 2, enemy.y - (enemy.boss ? 54 : 31), width * pct, 5); }

  function drawPlayer() {
    const c = characters[player.char]; if (player.invuln > 0 && Math.floor(player.invuln * 18) % 2 === 0) return; ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.facing); ctx.fillStyle = '#07121c88'; ctx.beginPath(); ctx.ellipse(0, 22, 23, 9, 0, 0, TAU); ctx.fill(); ctx.fillStyle = c.color; ctx.strokeStyle = COLORS.paper; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#162b3c'; ctx.beginPath(); ctx.arc(6, -4, 4, 0, TAU); ctx.fill(); if (player.char === 0) { ctx.strokeStyle = COLORS.ember; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(10, 3); ctx.lineTo(38, -10); ctx.stroke(); } else if (player.char === 1) { ctx.strokeStyle = COLORS.frost; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(17, 0, 14, -1.1, 1.1); ctx.stroke(); } else { ctx.strokeStyle = COLORS.spark; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(12, 3); ctx.lineTo(17, 30); ctx.stroke(); ctx.fillStyle = COLORS.spark; ctx.beginPath(); ctx.arc(14, -18, 5 + Math.sin(game.time * 6), 0, TAU); ctx.fill(); } ctx.restore();
  }

  function drawParticle(p) { ctx.save(); ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 7; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * Math.max(.45, p.life / p.maxLife), 0, TAU); ctx.fill(); ctx.restore(); }
  function drawFloatText(t) { ctx.save(); ctx.globalAlpha = Math.min(1, t.life * 2); ctx.fillStyle = t.color; ctx.font = '900 12px system-ui'; ctx.textAlign = 'center'; ctx.strokeStyle = '#09121fcc'; ctx.lineWidth = 4; ctx.strokeText(t.text, t.x, t.y); ctx.fillText(t.text, t.x, t.y); ctx.restore(); }

  function frame(now) {
    if (!previousTime) previousTime = now; const dt = Math.min(.034, Math.max(0, (now - previousTime) / 1000)); previousTime = now; checkOrientation(); if (!orientationPaused) update(dt); draw(); rafId = requestAnimationFrame(frame);
  }

  bindControls(); resize(); window.addEventListener('resize', resize); resetRun(); rafId = requestAnimationFrame(frame);
})();
