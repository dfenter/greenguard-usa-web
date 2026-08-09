(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const rotateOverlay = document.getElementById('rotateOverlay');
  const TAU = Math.PI * 2;
  const MAX_MATCH = 150;
  const WORLD = { w: 900, h: 1400 };
  const LIMITS = { particles: 260, projectiles: 130, gems: 28, mines: 28, turrets: 12, texts: 24, actions: 12 };
  const COLORS = { ink: '#07111c', paper: '#eef6ff', muted: '#8fa8be', blue: '#5dd7ff', blue2: '#1675c7', red: '#ff6b83', red2: '#a52d52', gold: '#ffd66b', green: '#83efb0', purple: '#bd8cff' };
  const KITS = [
    { name: 'Rattle', role: 'shotgunner', tag: 'BUCKSHOT BLOOM', color: '#ffb65d', hp: 105, speed: 220, rate: .47, damage: 8, shots: 5, bullet: 510, super: 'BREACH RING' },
    { name: 'Skylens', role: 'sniper', tag: 'LINEBREAK', color: '#82b9ff', hp: 82, speed: 185, rate: .9, damage: 34, shots: 1, bullet: 780, super: 'RAIL FLASH' },
    { name: 'Soothe', role: 'healer', tag: 'HUSHWAVE', color: '#7df2cd', hp: 92, speed: 205, rate: .62, damage: 9, shots: 1, bullet: 470, super: 'MEND FIELD' },
    { name: 'Grub', role: 'tank', tag: 'GROUNDLOCK', color: '#e5d176', hp: 155, speed: 145, rate: .68, damage: 13, shots: 3, bullet: 390, super: 'IRON WAKE' },
    { name: 'Popstone', role: 'bomber', tag: 'BLOOM BOMB', color: '#ff8fa3', hp: 98, speed: 195, rate: .82, damage: 30, shots: 1, bullet: 330, super: 'MINE GARDEN' },
    { name: 'Crosscut', role: 'dasher', tag: 'SLIPSTREAM', color: '#eaa6ff', hp: 88, speed: 260, rate: .28, damage: 10, shots: 1, bullet: 610, super: 'RIPLINE DASH' },
    { name: 'Rivet', role: 'engineer', tag: 'NEST NODE', color: '#72e5ed', hp: 100, speed: 185, rate: .5, damage: 12, shots: 1, bullet: 520, super: 'DROP TURRET' },
    { name: 'Orbit', role: 'boomerang', tag: 'LOOPBACK', color: '#b59cff', hp: 104, speed: 210, rate: .58, damage: 17, shots: 1, bullet: 430, super: 'TRIPLE ARC' }
  ];
  const ROAD = [0, 2, 4, 6, 8, 10, 12, 14];
  const COVERS = [
    { x: 205, y: 270, w: 120, h: 36 }, { x: 575, y: 270, w: 120, h: 36 },
    { x: 205, y: 1094, w: 120, h: 36 }, { x: 575, y: 1094, w: 120, h: 36 },
    { x: 335, y: 450, w: 58, h: 130 }, { x: 507, y: 450, w: 58, h: 130 },
    { x: 335, y: 820, w: 58, h: 130 }, { x: 507, y: 820, w: 58, h: 130 }
  ];

  let W = 390, H = 700, scale = 1, lastFrame = 0, orientationBlocked = false;
  let camera = { x: 0, y: 0 };
  let audio = null;
  let game = null;
  let save = loadSave();
  let landscapeKnown = false;

  const keys = new Set();
  const actions = [];
  const sticks = { left: { id: null, x: 0, y: 0 }, right: { id: null, x: 0, y: 0 } };
  const buttons = { super: null, menu: null };
  const timers = new Set();

  function finite(value, fallback, min, max) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  }

  function loadSave() {
    const fallback = { trophies: 0, wins: 0, losses: 0, bestGems: 0, bestHeist: 0, selectedKit: 0, mode: 'gem' };
    try {
      const raw = localStorage.getItem('scrapper-squad-save');
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
      return {
        trophies: Math.floor(finite(parsed.trophies, 0, 0, 10000)),
        wins: Math.floor(finite(parsed.wins, 0, 0, 1000000)),
        losses: Math.floor(finite(parsed.losses, 0, 0, 1000000)),
        bestGems: Math.floor(finite(parsed.bestGems, 0, 0, 99)),
        bestHeist: Math.floor(finite(parsed.bestHeist, 0, 0, 100)),
        selectedKit: Math.floor(finite(parsed.selectedKit, 0, 0, KITS.length - 1)),
        mode: parsed.mode === 'heist' ? 'heist' : 'gem'
      };
    } catch (err) { return fallback; }
  }

  function saveProgress() {
    try {
      localStorage.setItem('scrapper-squad-save', JSON.stringify(save));
    } catch (err) { /* local storage is optional */ }
  }

  function unlocked(index) { return save.trophies >= ROAD[index]; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function norm(x, y) {
    const l = Math.hypot(x, y);
    return l > .001 ? { x: x / l, y: y / l } : { x: 1, y: 0 };
  }
  function angle(v) { return Math.atan2(v.y, v.x); }
  function addBounded(list, item, limit) {
    list.push(item);
    if (list.length > limit) list.splice(0, list.length - limit);
  }
  function randomRange(a, b) { return a + Math.random() * (b - a); }

  function schedule(fn, delay) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, delay);
    timers.add(id);
    return id;
  }
  function cancelTimers() {
    timers.forEach(id => clearTimeout(id));
    timers.clear();
  }

  function resetInput() {
    sticks.left.id = sticks.right.id = null;
    sticks.left.x = sticks.left.y = sticks.right.x = sticks.right.y = 0;
    buttons.super = buttons.menu = null;
    keys.clear();
    actions.length = 0;
  }

  function unlockAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (err) { audio = null; }
  }
  function tone(freq, duration, type, volume) {
    if (!audio) return;
    try {
      const now = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type || 'sine'; osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(volume || .025, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.connect(gain).connect(audio.destination); osc.start(now); osc.stop(now + duration);
    } catch (err) { /* audio is a bonus */ }
  }

  function resize() {
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    scale = Math.min(dpr, 960 / Math.max(W, H));
    canvas.width = Math.max(1, Math.round(W * scale));
    canvas.height = Math.max(1, Math.round(H * scale));
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    updateOrientation();
  }

  function updateOrientation() {
    const blocked = window.innerWidth > window.innerHeight;
    if (blocked !== landscapeKnown) {
      landscapeKnown = blocked;
      resetInput();
    }
    orientationBlocked = blocked;
    rotateOverlay.hidden = !blocked;
  }

  function pushAction(action) {
    if (actions.length >= LIMITS.actions) actions.shift();
    actions.push(action);
  }

  function newMatch(mode) {
    cancelTimers();
    resetInput();
    save.mode = mode === 'heist' ? 'heist' : 'gem';
    saveProgress();
    game = {
      mode: save.mode, status: 'playing', time: 0, shake: 0, flash: 0, gemClock: 1.7,
      holdTeam: -1, holdTimer: 15, actors: [], projectiles: [], gems: [], particles: [], texts: [], mines: [], turrets: [],
      safes: { 0: 100, 1: 100 }, result: null, resultReason: '', playerAim: { x: 1, y: 0 }, hint: save.mode === 'gem' ? 'Mine drip incoming — scoop, scrap, hold.' : 'Press the enemy safe while your squad covers yours.'
    };
    game.actors.push(actor(0, save.selectedKit, 130, 700, true));
    game.actors.push(actor(0, (save.selectedKit + 2) % KITS.length, 174, 770, false));
    game.actors.push(actor(0, (save.selectedKit + 5) % KITS.length, 174, 630, false));
    game.actors.push(actor(1, (save.selectedKit + 1) % KITS.length, 770, 700, false));
    game.actors.push(actor(1, (save.selectedKit + 3) % KITS.length, 726, 630, false));
    game.actors.push(actor(1, (save.selectedKit + 6) % KITS.length, 726, 770, false));
    if (game.mode === 'gem') {
      for (let i = 0; i < 3; i++) dropGem(450 + randomRange(-22, 22), 700 + randomRange(-22, 22));
    }
    unlockAudio();
    tone(240, .12, 'square', .04);
  }

  function actor(team, kitIndex, x, y, human) {
    const kit = KITS[kitIndex];
    return { id: team + '-' + kitIndex + '-' + Math.random().toString(36).slice(2, 6), team, kit: kitIndex, x, y, spawnX: x, spawnY: y, human: !!human, r: 22,
      hp: kit.hp, maxHp: kit.hp, speed: kit.speed, cooldown: 0, super: 0, gems: 0, alive: true, respawn: 0, aim: { x: team ? -1 : 1, y: 0 },
      aiClock: randomRange(0, .4), barrier: 0, dash: 0, label: human ? 'YOU' : (team ? 'RIVAL' : 'ALLY') };
  }

  function dropGem(x, y) {
    if (!game || game.gems.length >= LIMITS.gems) return;
    addBounded(game.gems, { x: clamp(x, 28, WORLD.w - 28), y: clamp(y, 100, WORLD.h - 30), pulse: Math.random() * TAU }, LIMITS.gems);
  }

  function burst(x, y, color, count, speed) {
    if (!game) return;
    const room = Math.max(0, LIMITS.particles - game.particles.length);
    const amount = Math.min(count, room);
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * TAU, v = randomRange(speed * .35, speed);
      game.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: randomRange(.25, .7), max: .7, size: randomRange(2, 6), color });
    }
  }
  function textPop(x, y, text, color) {
    if (!game) return;
    addBounded(game.texts, { x, y, text, color: color || COLORS.paper, life: 1 }, LIMITS.texts);
  }

  function living(team) { return game.actors.filter(a => a.team === team && a.alive); }
  function teamGems(team) { return game.actors.reduce((sum, a) => sum + (a.team === team ? a.gems : 0), 0); }
  function nearest(from, team, includeSafe) {
    let best = null, bestD = Infinity;
    for (const a of game.actors) if (a.alive && a.team !== team) { const d = dist(from, a); if (d < bestD) { best = a; bestD = d; } }
    if (includeSafe) {
      const safe = { x: team ? 80 : 820, y: 700 };
      const d = dist(from, safe);
      if (d < bestD) best = { ...safe, safe: true };
    }
    return best;
  }

  function getPlayerMove() {
    let x = sticks.left.x, y = sticks.left.y;
    if (Math.hypot(x, y) < .08) { x = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0); y = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0); }
    return norm(x, y);
  }
  function getPlayerAim() {
    let x = sticks.right.x, y = sticks.right.y;
    if (Math.hypot(x, y) < .08) { x = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0); y = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0); }
    return Math.hypot(x, y) > .08 ? norm(x, y) : game.playerAim;
  }

  function update(dt) {
    if (!game || game.status !== 'playing') return;
    game.time += dt;
    game.shake = Math.max(0, game.shake - dt * 4);
    game.flash = Math.max(0, game.flash - dt * 2.6);
    if (game.time >= MAX_MATCH) return finishMatch(decideByScore(), 'TIME CALLED');
    const p = game.actors[0];
    if (p.alive) {
      const move = getPlayerMove();
      moveActor(p, move.x * p.speed * dt, move.y * p.speed * dt);
      const aim = getPlayerAim();
      game.playerAim = aim; p.aim = aim;
      if (sticks.right.id === null && (keys.has('ArrowRight') || keys.has('ArrowLeft') || keys.has('ArrowUp') || keys.has('ArrowDown'))) fire(p, aim);
      while (actions.length) {
        const action = actions.shift();
        if (action.type === 'fire' && p.alive) fire(p, action.dir);
        if (action.type === 'super' && p.alive) useSuper(p);
      }
    } else if (actions.length) actions.length = 0;
    for (const a of game.actors) {
      a.cooldown = Math.max(0, a.cooldown - dt); a.barrier = Math.max(0, a.barrier - dt);
      if (!a.alive) { a.respawn -= dt; if (a.respawn <= 0) respawn(a); continue; }
      a.super = clamp(a.super + dt * 1.3, 0, 100);
      if (!a.human) botUpdate(a, dt);
    }
    updateProjectiles(dt);
    updateMines(dt);
    updateTurrets(dt);
    collectGems();
    if (game.mode === 'gem') updateGemMode(dt);
    else updateHeistMode(dt);
    updateParticles(dt);
    camera.x = clamp(p.x - W * .5, 0, Math.max(0, WORLD.w - W));
    camera.y = clamp(p.y - H * .48, 0, Math.max(0, WORLD.h - H));
  }

  function moveActor(a, dx, dy) {
    a.x = clamp(a.x + dx, 32, WORLD.w - 32); a.y = clamp(a.y + dy, 100, WORLD.h - 26);
  }

  function botUpdate(a, dt) {
    a.aiClock -= dt;
    if (a.aiClock > 0) return;
    a.aiClock = .16 + Math.random() * .15;
    const kit = KITS[a.kit], targetEnemy = nearest(a, a.team, false);
    let goal = targetEnemy || { x: a.team ? 820 : 80, y: 700 };
    if (game.mode === 'gem') {
      const held = teamGems(a.team);
      if (held < 7 || a.gems === 0) goal = { x: 450 + Math.sin(game.time * .7) * 45, y: 700 + Math.cos(game.time * .7) * 45 };
      if (a.gems >= 4) goal = { x: a.team ? 770 : 130, y: 700 };
      if (kit.role === 'sniper') goal = targetEnemy ? { x: targetEnemy.x + (a.team ? 125 : -125), y: targetEnemy.y } : goal;
      if (kit.role === 'healer') {
        const hurt = living(a.team).sort((u, v) => u.hp / u.maxHp - v.hp / v.maxHp)[0];
        if (hurt && hurt.hp < hurt.maxHp * .82) goal = hurt;
      }
    } else {
      goal = { x: a.team ? 80 : 820, y: 700 };
      if (kit.role === 'engineer') goal = { x: a.team ? 330 : 570, y: 700 };
      if (kit.role === 'sniper' && targetEnemy) goal = { x: targetEnemy.x + (a.team ? 160 : -160), y: targetEnemy.y };
      if (kit.role === 'healer') {
        const hurt = living(a.team).sort((u, v) => u.hp / u.maxHp - v.hp / v.maxHp)[0];
        if (hurt && hurt.hp < hurt.maxHp * .85) goal = hurt;
      }
    }
    const d = Math.hypot(goal.x - a.x, goal.y - a.y);
    const dir = norm(goal.x - a.x, goal.y - a.y);
    const keepAway = kit.role === 'sniper' && targetEnemy && d < 250;
    moveActor(a, (keepAway ? -dir.x : dir.x) * a.speed * .48 * .16, (keepAway ? -dir.y : dir.y) * a.speed * .48 * .16);
    if (targetEnemy) { a.aim = norm(targetEnemy.x - a.x, targetEnemy.y - a.y); if (d < (kit.role === 'sniper' ? 690 : 460)) fire(a, a.aim); }
    if (kit.role === 'healer') {
      const hurt = living(a.team).find(u => u !== a && u.hp < u.maxHp * .88);
      if (hurt) { a.aim = norm(hurt.x - a.x, hurt.y - a.y); fire(a, a.aim); }
    }
    if (a.super >= 100 && ((game.mode === 'heist' && d < 260) || a.hp < a.maxHp * .4 || game.mode === 'gem' && a.gems >= 4)) useSuper(a);
  }

  function fire(a, dir) {
    if (!a.alive || a.cooldown > 0) return;
    const kit = KITS[a.kit], spread = kit.role === 'shotgunner' ? .2 : kit.role === 'tank' ? .12 : 0;
    a.cooldown = kit.rate;
    for (let i = 0; i < kit.shots; i++) {
      const offset = kit.shots === 1 ? 0 : (i - (kit.shots - 1) / 2) * spread;
      const a0 = angle(dir) + offset;
      const bomb = kit.role === 'bomber';
      const boomer = kit.role === 'boomerang';
      addBounded(game.projectiles, { x: a.x + Math.cos(a0) * 26, y: a.y + Math.sin(a0) * 26, vx: Math.cos(a0) * kit.bullet, vy: Math.sin(a0) * kit.bullet,
        life: bomb ? 1.55 : boomer ? 1.1 : 1.05, team: a.team, owner: a, damage: kit.damage, radius: bomb ? 12 : 7, bomb, boomer, returning: false, heal: kit.role === 'healer' }, LIMITS.projectiles);
    }
    burst(a.x + dir.x * 28, a.y + dir.y * 28, kit.color, kit.role === 'shotgunner' ? 4 : 2, 45);
    tone(kit.role === 'sniper' ? 520 : 190, .045, 'square', .018);
  }

  function useSuper(a) {
    if (!a.alive || a.super < 100) return;
    const kit = KITS[a.kit]; a.super = 0; game.flash = .8; game.shake = .55;
    textPop(a.x, a.y - 34, kit.super, kit.color); burst(a.x, a.y, kit.color, 22, 190); tone(kit.role === 'sniper' ? 880 : 420, .18, 'sawtooth', .045);
    if (kit.role === 'shotgunner') areaDamage(a, 130, 42);
    if (kit.role === 'sniper') spawnSpecial(a, a.aim, 78, 980, { pierce: true, color: kit.color, life: 1.3 });
    if (kit.role === 'healer') for (const ally of living(a.team)) { ally.hp = Math.min(ally.maxHp, ally.hp + 42); burst(ally.x, ally.y, COLORS.green, 8, 70); }
    if (kit.role === 'tank') { a.barrier = 5; areaDamage(a, 115, 32); }
    if (kit.role === 'bomber') for (let i = 0; i < 5; i++) addBounded(game.mines, { x: a.x + randomRange(-90, 90), y: a.y + randomRange(-90, 90), team: a.team, life: 10 }, LIMITS.mines);
    if (kit.role === 'dasher') { const d = norm(a.aim.x, a.aim.y); for (let i = 0; i < 9; i++) { moveActor(a, d.x * 34, d.y * 34); areaDamage(a, 38, 13); burst(a.x, a.y, kit.color, 3, 60); } }
    if (kit.role === 'engineer') addBounded(game.turrets, { x: a.x, y: a.y, team: a.team, life: 18, cooldown: 0 }, LIMITS.turrets);
    if (kit.role === 'boomerang') for (let i = -1; i <= 1; i++) { const aa = angle(a.aim) + i * .3; spawnSpecial(a, { x: Math.cos(aa), y: Math.sin(aa) }, 28, 470, { boomer: true, color: kit.color, life: 1.5 }); }
  }

  function spawnSpecial(a, dir, damage, speed, extra) {
    const aa = angle(dir);
    addBounded(game.projectiles, { x: a.x + Math.cos(aa) * 25, y: a.y + Math.sin(aa) * 25, vx: Math.cos(aa) * speed, vy: Math.sin(aa) * speed,
      life: extra.life || 1, team: a.team, owner: a, damage, radius: 9, bomb: false, boomer: !!extra.boomer, returning: false, pierce: !!extra.pierce, color: extra.color || COLORS.gold, heal: false }, LIMITS.projectiles);
  }

  function areaDamage(source, radius, damage) {
    for (const a of game.actors) if (a.alive && a.team !== source.team && dist(a, source) < radius) hit(a, damage, source);
  }

  function updateProjectiles(dt) {
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
      const p = game.projectiles[i]; p.life -= dt;
      if (p.boomer && p.life < .45) { p.returning = true; p.vx *= -.94; p.vy *= -.94; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      let remove = p.life <= 0 || p.x < 0 || p.x > WORLD.w || p.y < 70 || p.y > WORLD.h;
      if (!remove) {
        for (const a of game.actors) {
          if (!a.alive || a.team === p.team || p.owner === a) continue;
          if (dist(p, a) < p.radius + a.r) { hit(a, p.damage, p.owner); if (p.bomb) explosion(p.x, p.y, p.owner); if (!p.pierce) remove = true; break; }
        }
        if (p.heal && !remove) {
          for (const a of game.actors) if (a.alive && a.team === p.team && dist(p, a) < p.radius + a.r) { a.hp = Math.min(a.maxHp, a.hp + 22); textPop(a.x, a.y - 30, '+22', COLORS.green); remove = true; break; }
        }
        if (game.mode === 'heist' && !remove) {
          const safeTeam = p.team ? 0 : 1, safe = { x: safeTeam ? 820 : 80, y: 700 };
          if (Math.hypot(p.x - safe.x, p.y - safe.y) < 56) { game.safes[safeTeam] = Math.max(0, game.safes[safeTeam] - p.damage * .34); burst(p.x, p.y, p.color || COLORS.gold, 4, 55); if (!p.pierce) remove = true; }
        }
      }
      if (remove) game.projectiles.splice(i, 1);
    }
  }

  function explosion(x, y, source) {
    burst(x, y, COLORS.red, 18, 130); game.shake = Math.max(game.shake, .24);
    for (const a of game.actors) if (a.alive && a.team !== source.team && Math.hypot(a.x - x, a.y - y) < 70) hit(a, 24, source);
  }

  function hit(target, damage, source) {
    if (!target || !target.alive) return;
    const actual = target.barrier > 0 ? damage * .35 : damage;
    target.hp -= actual; target.super = clamp(target.super + damage * .7, 0, 100);
    burst(target.x, target.y, target.team ? COLORS.red : COLORS.blue, 3, 45);
    if (target.hp <= 0) down(target, source);
  }
  function down(target) {
    target.alive = false; target.respawn = 3; target.hp = 0;
    for (let i = 0; i < target.gems; i++) dropGem(target.x + randomRange(-18, 18), target.y + randomRange(-18, 18));
    target.gems = 0; burst(target.x, target.y, target.team ? COLORS.red : COLORS.blue, 24, 180); game.shake = Math.max(game.shake, .4); tone(90, .16, 'sawtooth', .04);
  }
  function respawn(a) {
    a.alive = true; a.hp = a.maxHp; a.respawn = 0; a.x = a.team ? 770 : 130; a.y = 700 + randomRange(-70, 70); a.super = Math.max(a.super, 20); burst(a.x, a.y, a.team ? COLORS.red : COLORS.blue, 12, 90);
  }

  function updateMines(dt) {
    for (let i = game.mines.length - 1; i >= 0; i--) {
      const m = game.mines[i]; m.life -= dt;
      let trigger = m.life <= 0;
      for (const a of game.actors) if (a.alive && a.team !== m.team && Math.hypot(a.x - m.x, a.y - m.y) < 34) trigger = true;
      if (trigger) { const owner = { team: m.team, x: m.x, y: m.y }; explosion(m.x, m.y, owner); game.mines.splice(i, 1); }
    }
  }
  function updateTurrets(dt) {
    for (let i = game.turrets.length - 1; i >= 0; i--) {
      const t = game.turrets[i]; t.life -= dt; t.cooldown -= dt;
      if (t.life <= 0) { game.turrets.splice(i, 1); continue; }
      const target = nearest(t, t.team, false);
      if (target && t.cooldown <= 0 && dist(t, target) < 500) { t.cooldown = .78; const d = norm(target.x - t.x, target.y - t.y); spawnTurretShot(t, d); }
    }
  }
  function spawnTurretShot(t, d) {
    addBounded(game.projectiles, { x: t.x, y: t.y, vx: d.x * 480, vy: d.y * 480, life: 1.1, team: t.team, owner: t, damage: 9, radius: 6, color: COLORS.blue, bomb: false, boomer: false, returning: false, pierce: false, heal: false }, LIMITS.projectiles);
  }

  function collectGems() {
    for (let gi = game.gems.length - 1; gi >= 0; gi--) {
      const gem = game.gems[gi];
      for (const a of game.actors) if (a.alive && dist(a, gem) < 30 && a.gems < 10) {
        a.gems++; game.gems.splice(gi, 1); a.super = clamp(a.super + 5, 0, 100); textPop(a.x, a.y - 32, '+1 GEM', COLORS.gold); burst(gem.x, gem.y, COLORS.gold, 8, 85); tone(660, .08, 'triangle', .025); break;
      }
    }
  }
  function updateGemMode(dt) {
    game.gemClock -= dt;
    if (game.gemClock <= 0) { game.gemClock = 3.4; dropGem(450 + randomRange(-35, 35), 700 + randomRange(-35, 35)); burst(450, 700, COLORS.gold, 10, 70); }
    const blue = teamGems(0), red = teamGems(1);
    let lead = -1;
    if (blue >= 10) lead = 0; if (red >= 10 && red > blue) lead = 1;
    if (lead < 0) { game.holdTeam = -1; game.holdTimer = 15; }
    else if (game.holdTeam !== lead) { game.holdTeam = lead; game.holdTimer = 15; game.flash = .25; }
    else { game.holdTimer -= dt; if (game.holdTimer <= 0) finishMatch(lead === 0 ? 'win' : 'loss', 'GEM LOCK'); }
  }
  function updateHeistMode() {
    if (game.safes[1] <= 0) finishMatch('win', 'SAFE CRACKED');
    else if (game.safes[0] <= 0) finishMatch('loss', 'BASE BREACHED');
  }
  function decideByScore() {
    if (game.mode === 'heist') return game.safes[1] > game.safes[0] ? 'win' : game.safes[1] < game.safes[0] ? 'loss' : 'draw';
    const b = teamGems(0), r = teamGems(1); return b > r ? 'win' : r > b ? 'loss' : 'draw';
  }
  function finishMatch(result, reason) {
    if (!game || game.status !== 'playing') return;
    game.status = 'result'; game.result = result; game.resultReason = reason; resetInput(); cancelTimers();
    if (result === 'win') { save.wins++; save.trophies = Math.min(10000, save.trophies + 2); }
    if (result === 'loss') save.losses++;
    if (game.mode === 'gem') save.bestGems = Math.max(save.bestGems, teamGems(0));
    else save.bestHeist = Math.max(save.bestHeist, Math.round(100 - game.safes[1]));
    saveProgress(); game.flash = result === 'win' ? 1 : .4; game.shake = .5; tone(result === 'win' ? 780 : 110, .3, 'triangle', .05);
  }

  function updateParticles(dt) {
    for (let i = game.particles.length - 1; i >= 0; i--) { const p = game.particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy *= .97; if (p.life <= 0) game.particles.splice(i, 1); }
    for (let i = game.texts.length - 1; i >= 0; i--) { const t = game.texts[i]; t.life -= dt; t.y -= 25 * dt; if (t.life <= 0) game.texts.splice(i, 1); }
  }

  function roundRect(x, y, w, h, r, fill, stroke) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y); ctx.arcTo(x + w, y, x + w, y + rr, rr); ctx.lineTo(x + w, y + h - rr); ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr); ctx.lineTo(x + rr, y + h); ctx.arcTo(x, y + h, x, y + h - rr, rr); ctx.lineTo(x, y + rr); ctx.arcTo(x, y, x + rr, y, rr); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function txt(text, x, y, size, color, align, weight) {
    ctx.font = (weight || 700) + ' ' + size + 'px system-ui, sans-serif'; ctx.fillStyle = color || COLORS.paper; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
  }
  function draw() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = COLORS.ink; ctx.fillRect(0, 0, W, H);
    if (!game || game.status === 'menu') drawMenu(); else { drawArena(); if (game.status === 'result') drawResult(); }
    if (orientationBlocked) { ctx.fillStyle = 'rgba(4,10,17,.5)'; ctx.fillRect(0, 0, W, H); }
  }

  function drawMenu() {
    const grad = ctx.createLinearGradient(0, 0, W, H); grad.addColorStop(0, '#10283a'); grad.addColorStop(1, '#07111c'); ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = .18; for (let i = 0; i < 18; i++) { ctx.fillStyle = i % 2 ? COLORS.blue : COLORS.purple; ctx.beginPath(); ctx.arc((i * 97) % W, 100 + (i * 137) % H, 1 + (i % 4), 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    txt('SCRAPPER', W / 2, 57, 31, COLORS.paper, 'center', 950); txt('SQUAD', W / 2, 89, 31, COLORS.blue, 'center', 950);
    txt('3v3 FIELD TEST  /  FREE BY DESIGN', W / 2, 117, 10, COLORS.muted, 'center', 800);
    txt('CHOOSE THE RUN', 20, 151, 11, COLORS.muted, 'left', 800);
    const modeW = (W - 52) / 2;
    modeCard(20, 165, modeW, 54, 'GEM HOARD', '10 gems + 15s lock', save.mode === 'gem');
    modeCard(32 + modeW, 165, modeW, 54, 'HEIST', 'crack their safe', save.mode === 'heist');
    txt('TROPHY ROAD  /  WIN +2', 20, 242, 11, COLORS.muted, 'left', 800);
    drawRoad(20, 283);
    txt('KIT BAY  /  FLAT POWER', 20, 319, 11, COLORS.muted, 'left', 800);
    const cardW = (W - 52) / 4;
    for (let i = 0; i < KITS.length; i++) {
      const x = 10 + (i % 4) * (cardW + 4), y = 334 + Math.floor(i / 4) * 65;
      kitCard(x, y, cardW, 56, i, save.selectedKit === i);
    }
    txt('BEST  ' + save.bestGems + ' gems  ·  ' + save.bestHeist + '% safe damage', W / 2, 484, 11, COLORS.muted, 'center', 700);
    roundRect(20, H - 92, W - 40, 58, 18, COLORS.blue); txt('TAP TO ARM AUDIO  /  BEGIN RUN', W / 2, H - 63, 14, COLORS.ink, 'center', 950);
    txt('One hint line. Eight free kits. Make the call.', W / 2, H - 16, 11, COLORS.muted, 'center', 650);
  }
  function modeCard(x, y, w, h, title, sub, active) { roundRect(x, y, w, h, 15, active ? '#1c5b78' : '#10202e', active ? COLORS.blue : '#263b4a'); txt(title, x + 12, y + 20, 12, active ? COLORS.paper : COLORS.muted, 'left', 900); txt(sub, x + 12, y + 39, 10, active ? '#c9f5ff' : '#71879b', 'left', 650); }
  function kitCard(x, y, w, h, i, active) {
    const k = KITS[i], open = unlocked(i); roundRect(x, y, w, h, 12, active ? '#1b5367' : '#0e1c29', active ? k.color : '#223443');
    ctx.fillStyle = open ? k.color : '#324453'; ctx.beginPath(); ctx.arc(x + 18, y + 28, 11, 0, TAU); ctx.fill();
    txt(open ? k.name : 'LOCK', x + 34, y + 19, 10, open ? COLORS.paper : '#73879a', 'left', 900); txt(open ? k.role.toUpperCase() : ROAD[i] + 'T', x + 34, y + 37, 8, open ? k.color : '#607487', 'left', 800);
  }
  function drawRoad(x, y) {
    ctx.strokeStyle = '#2b495b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 9, y, x + W - 29, y); ctx.stroke();
    const gap = (W - 40) / 7;
    for (let i = 0; i < ROAD.length; i++) { const px = x + 9 + i * gap, open = unlocked(i); ctx.fillStyle = open ? COLORS.gold : '#1d3544'; ctx.beginPath(); ctx.arc(px, y, 11, 0, TAU); ctx.fill(); if (open) txt(i === 0 ? '★' : String(i), px, y, 9, COLORS.ink, 'center', 950); else txt(String(ROAD[i]), px, y, 7, COLORS.muted, 'center', 800); txt(i === 0 ? 'RAT' : KITS[i].name.slice(0, 4).toUpperCase(), px, y + 23, 7, open ? COLORS.paper : '#657c90', 'center', 800); }
  }

  function drawArena() {
    const shakeX = game.shake > 0 ? randomRange(-game.shake * 5, game.shake * 5) : 0, shakeY = game.shake > 0 ? randomRange(-game.shake * 5, game.shake * 5) : 0;
    ctx.save(); ctx.translate(shakeX, shakeY); ctx.save(); ctx.translate(-camera.x, -camera.y);
    const bg = ctx.createLinearGradient(0, 0, 0, WORLD.h); bg.addColorStop(0, '#0d2737'); bg.addColorStop(1, '#091822'); ctx.fillStyle = bg; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    ctx.strokeStyle = 'rgba(126,186,208,.08)'; ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD.w; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); ctx.stroke(); }
    for (let y = 0; y <= WORLD.h; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,214,107,.07)'; ctx.beginPath(); ctx.arc(450, 700, 145 + Math.sin(game.time * 2) * 6, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(255,214,107,.33)'; ctx.lineWidth = 3; ctx.stroke();
    for (const c of COVERS) { roundRect(c.x + 7, c.y + 8, c.w, c.h, 10, 'rgba(0,0,0,.25)'); roundRect(c.x, c.y, c.w, c.h, 10, '#1b3844', '#315868'); }
    drawSafe(80, 700, 0, game.safes[0]); drawSafe(820, 700, 1, game.safes[1]);
    for (const g of game.gems) { const pulse = 1 + Math.sin(game.time * 4 + g.pulse) * .12; ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(Math.PI / 4); ctx.fillStyle = COLORS.gold; ctx.shadowColor = COLORS.gold; ctx.shadowBlur = 14; ctx.fillRect(-8 * pulse, -8 * pulse, 16 * pulse, 16 * pulse); ctx.restore(); }
    for (const m of game.mines) { ctx.fillStyle = COLORS.red; ctx.beginPath(); ctx.arc(m.x, m.y, 13, 0, TAU); ctx.fill(); ctx.strokeStyle = '#ffd2db'; ctx.stroke(); }
    for (const t of game.turrets) { ctx.fillStyle = COLORS.blue2; ctx.beginPath(); ctx.arc(t.x, t.y, 18, 0, TAU); ctx.fill(); ctx.strokeStyle = COLORS.blue; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = COLORS.paper; ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + 23, t.y); ctx.stroke(); }
    for (const p of game.projectiles) { ctx.fillStyle = p.color || (p.team ? COLORS.red : COLORS.blue); ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, TAU); ctx.fill(); }
    for (const a of game.actors) drawActor(a);
    for (const p of game.particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); } ctx.globalAlpha = 1;
    for (const t of game.texts) { ctx.globalAlpha = clamp(t.life, 0, 1); txt(t.text, t.x, t.y, 10, t.color, 'center', 900); } ctx.globalAlpha = 1;
    ctx.restore(); ctx.restore();
    drawHud();
  }
  function drawSafe(x, y, team, health) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = team ? 'rgba(255,107,131,.16)' : 'rgba(93,215,255,.16)'; ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.fill(); roundRect(-32, -37, 64, 74, 12, team ? '#54263a' : '#174056', team ? COLORS.red : COLORS.blue); roundRect(-22, -27, 44, 54, 8, '#0a1722'); ctx.fillStyle = COLORS.gold; ctx.fillRect(-5, -9, 10, 18); ctx.fillStyle = team ? COLORS.red : COLORS.blue; ctx.fillRect(-32, -50, 64 * clamp(health / 100, 0, 1), 5); ctx.restore();
  }
  function drawActor(a) {
    if (!a.alive) { ctx.globalAlpha = .34; ctx.strokeStyle = a.team ? COLORS.red : COLORS.blue; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(a.x, a.y, 18, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; return; }
    const k = KITS[a.kit]; ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(angle(a.aim));
    ctx.fillStyle = a.team ? COLORS.red2 : COLORS.blue2; ctx.beginPath(); ctx.arc(0, 0, a.r + 3, 0, TAU); ctx.fill(); ctx.fillStyle = k.color; ctx.beginPath(); ctx.arc(0, 0, a.r - 3, 0, TAU); ctx.fill(); ctx.fillStyle = '#101c29'; ctx.fillRect(3, -5, 19, 10); ctx.fillStyle = COLORS.paper; ctx.beginPath(); ctx.arc(7, -6, 3, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(a.x - 24, a.y - 35, 48, 4); ctx.fillStyle = a.team ? COLORS.red : COLORS.blue; ctx.fillRect(a.x - 24, a.y - 35, 48 * clamp(a.hp / a.maxHp, 0, 1), 4);
    if (a.gems) txt(String(a.gems), a.x, a.y + 37, 11, COLORS.gold, 'center', 950);
    if (a.human) { ctx.strokeStyle = COLORS.paper; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(a.x, a.y, 29, 0, TAU); ctx.stroke(); }
  }
  function drawHud() {
    ctx.fillStyle = 'rgba(6,15,25,.88)'; ctx.fillRect(0, 0, W, 76);
    txt(game.mode === 'gem' ? 'GEM HOARD' : 'HEIST', 14, 18, 11, COLORS.gold, 'left', 900);
    const remain = Math.max(0, MAX_MATCH - game.time); txt(formatTime(remain), W / 2, 19, 18, COLORS.paper, 'center', 950);
    txt('BLUE ' + teamGems(0), 14, 49, 12, COLORS.blue, 'left', 900); txt('RED ' + teamGems(1), W - 14, 49, 12, COLORS.red, 'right', 900);
    if (game.mode === 'heist') { ctx.fillStyle = COLORS.blue; ctx.fillRect(W / 2 - 48, 35, 40 * clamp(game.safes[0] / 100, 0, 1), 5); ctx.fillStyle = COLORS.red; ctx.fillRect(W / 2 + 8, 35, 40 * clamp(game.safes[1] / 100, 0, 1), 5); }
    const hint = game.holdTeam >= 0 ? (game.holdTeam === 0 ? 'BLUE LOCK  ' : 'RED LOCK  ') + game.holdTimer.toFixed(1) + 's' : game.hint;
    txt(hint, W / 2, 68, 10, game.holdTeam >= 0 ? COLORS.gold : COLORS.muted, 'center', 750);
    drawSticks(); drawSuper();
    if (game.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + clamp(game.flash * .13, 0, .13) + ')'; ctx.fillRect(0, 0, W, H); }
  }
  function drawSticks() {
    const baseY = H - 91, leftX = 74, rightX = W - 74;
    stick(leftX, baseY, sticks.left, COLORS.blue); stick(rightX, baseY, sticks.right, COLORS.purple);
  }
  function stick(x, y, s, color) { ctx.globalAlpha = .38; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 57, 0, TAU); ctx.fill(); ctx.globalAlpha = .5; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + s.x * 33, y + s.y * 33, 22, 0, TAU); ctx.fill(); ctx.fillStyle = COLORS.ink; ctx.globalAlpha = .35; ctx.beginPath(); ctx.arc(x + s.x * 33, y + s.y * 33, 10, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  function drawSuper() {
    const p = game.actors[0], x = W / 2, y = H - 91, ready = p && p.super >= 100; ctx.fillStyle = ready ? COLORS.gold : '#263f51'; ctx.beginPath(); ctx.arc(x, y, 31, 0, TAU); ctx.fill(); ctx.strokeStyle = ready ? '#fff0a7' : '#496476'; ctx.lineWidth = 3; ctx.stroke(); txt(ready ? 'SUPER' : Math.floor(p.super) + '%', x, y, ready ? 9 : 10, ready ? COLORS.ink : COLORS.paper, 'center', 950); }
  function drawResult() {
    ctx.fillStyle = 'rgba(4,10,17,.84)'; ctx.fillRect(0, 76, W, H - 76);
    const win = game.result === 'win'; txt(win ? 'FIELD WON' : game.result === 'draw' ? 'FIELD EVEN' : 'FIELD LOST', W / 2, 150, 28, win ? COLORS.green : game.result === 'draw' ? COLORS.gold : COLORS.red, 'center', 950);
    txt(game.resultReason, W / 2, 180, 12, COLORS.paper, 'center', 800);
    txt(win ? '+2 TROPHIES' : game.result === 'draw' ? 'NO TROPHY CHANGE' : 'SCRAP THE PLAN', W / 2, 216, 15, COLORS.gold, 'center', 900);
    txt('TROPHIES  ' + save.trophies + '   ·   WINS  ' + save.wins, W / 2, 247, 11, COLORS.muted, 'center', 750);
    txt(game.mode === 'gem' ? 'BEST GEM HAUL  ' + save.bestGems : 'BEST SAFE DAMAGE  ' + save.bestHeist + '%', W / 2, 270, 11, COLORS.muted, 'center', 750);
    txt('TROPHY ROAD', W / 2, 322, 11, COLORS.muted, 'center', 800); drawRoad(20, 356);
    roundRect(20, H - 92, W - 40, 58, 18, win ? COLORS.green : COLORS.blue); txt('RUN AGAIN', W / 2, H - 63, 16, COLORS.ink, 'center', 950);
    txt('Tap a kit or mode after the next drop.', W / 2, H - 16, 10, COLORS.muted, 'center', 700);
  }
  function formatTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); }

  function canvasPoint(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
  function setStick(name, p) { const baseX = name === 'left' ? 74 : W - 74, baseY = H - 91, dx = p.x - baseX, dy = p.y - baseY, l = Math.hypot(dx, dy), max = 57, m = Math.min(1, l / max); if (!l) { sticks[name].x = sticks[name].y = 0; return; } sticks[name].x = dx / l * m; sticks[name].y = dy / l * m; }
  function inCircle(p, x, y, r) { return Math.hypot(p.x - x, p.y - y) <= r; }
  function handleMenuTap(p) {
    const modeW = (W - 52) / 2;
    if (p.y >= 160 && p.y <= 229) { save.mode = p.x < W / 2 ? 'gem' : 'heist'; saveProgress(); tone(310, .05, 'sine', .02); return; }
    if (p.y >= 330 && p.y <= 465) { const cardW = (W - 52) / 4, col = clamp(Math.floor((p.x - 10) / (cardW + 4)), 0, 3), row = p.y < 397 ? 0 : 1, i = row * 4 + col; if (unlocked(i)) { save.selectedKit = i; saveProgress(); tone(420, .05, 'sine', .02); } return; }
    if (p.y >= H - 110) { unlockAudio(); newMatch(save.mode); }
  }
  function onPointerDown(e) {
    e.preventDefault(); if (orientationBlocked) return; try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ } const p = canvasPoint(e);
    if (!game || game.status === 'menu') { buttons.menu = e.pointerId; handleMenuTap(p); return; }
    if (game.status === 'result') { if (p.y >= H - 115) { buttons.menu = e.pointerId; newMatch(game.mode); } return; }
    if (inCircle(p, W / 2, H - 91, 38)) { if (buttons.super === null) { buttons.super = e.pointerId; pushAction({ type: 'super' }); } return; }
    if (inCircle(p, 74, H - 91, 61) && sticks.left.id === null) { sticks.left.id = e.pointerId; setStick('left', p); return; }
    if (inCircle(p, W - 74, H - 91, 61) && sticks.right.id === null) { sticks.right.id = e.pointerId; setStick('right', p); return; }
  }
  function onPointerMove(e) { e.preventDefault(); if (orientationBlocked || !game || game.status !== 'playing') return; const p = canvasPoint(e); if (e.pointerId === sticks.left.id) setStick('left', p); if (e.pointerId === sticks.right.id) setStick('right', p); }
  function onPointerUp(e) { e.preventDefault(); try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* capture is optional */ } if (e.pointerId === sticks.left.id) { sticks.left.id = null; sticks.left.x = sticks.left.y = 0; } if (e.pointerId === sticks.right.id) { if (Math.hypot(sticks.right.x, sticks.right.y) > .2) pushAction({ type: 'fire', dir: norm(sticks.right.x, sticks.right.y) }); sticks.right.id = null; sticks.right.x = sticks.right.y = 0; } if (e.pointerId === buttons.super) buttons.super = null; if (e.pointerId === buttons.menu) buttons.menu = null; }
  function onKeyDown(e) { const allowed = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']; if (allowed.includes(e.key)) { e.preventDefault(); if (e.key === ' ' && !e.repeat) pushAction({ type: 'super' }); keys.add(e.key); } if ((e.key === 'Enter' || e.key === ' ') && game && (game.status === 'menu' || game.status === 'result') && !e.repeat) { unlockAudio(); if (game.status === 'menu') newMatch(save.mode); else newMatch(game.mode); } }
  function onKeyUp(e) { keys.delete(e.key); }
  function onBlur() { resetInput(); }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  canvas.addEventListener('pointercancel', onPointerUp, { passive: false });
  canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false }); canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false }); canvas.addEventListener('touchend', e => e.preventDefault(), { passive: false });
  window.addEventListener('keydown', onKeyDown, { passive: false }); window.addEventListener('keyup', onKeyUp, { passive: false }); window.addEventListener('blur', onBlur); window.addEventListener('resize', resize); window.addEventListener('orientationchange', resize);

  function boot(now) {
    const dt = lastFrame ? Math.min(.033, Math.max(0, (now - lastFrame) / 1000)) : 0; lastFrame = now;
    updateOrientation();
    if (!orientationBlocked && game && game.status === 'playing') update(dt);
    draw(); requestAnimationFrame(boot);
  }
  resize(); game = { status: 'menu' }; requestAnimationFrame(boot);
})();
