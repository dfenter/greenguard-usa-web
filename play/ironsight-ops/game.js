(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = (id) => document.getElementById(id);
  const VW = 390;
  const VH = 700;
  const MAX_PARTICLES = 180;
  const MAX_TRACERS = 32;
  const MAX_SMOKES = 4;
  const MAX_GRENADES = 8;
  const MAX_FEED = 5;
  const TAU = Math.PI * 2;

  const WEAPONS = {
    ar: { name: 'AR', damage: 16, cooldown: .12, range: 350, spread: .042, color: '#ffd47b' },
    smg: { name: 'SMG', damage: 10, cooldown: .075, range: 255, spread: .10, color: '#77d7ff' },
    dmr: { name: 'DMR', damage: 31, cooldown: .38, range: 520, spread: .018, color: '#f9f2d0' }
  };

  const CAMOS = ['#b8f4dc', '#f0b45e', '#d7898c', '#8eb7f2', '#d0a7f4', '#e6e5bb'];
  const MAPS = [
    {
      name: 'WAREHOUSE', bg: '#0e1b22', floor: '#14262d', grid: '#29424a', accent: '#51d3ba',
      walls: [
        { x: 28, y: 188, w: 112, h: 24 }, { x: 28, y: 212, w: 24, h: 110 },
        { x: 252, y: 174, w: 110, h: 24 }, { x: 338, y: 198, w: 24, h: 116 },
        { x: 92, y: 350, w: 82, h: 24 }, { x: 216, y: 350, w: 82, h: 24 },
        { x: 92, y: 374, w: 24, h: 104 }, { x: 274, y: 374, w: 24, h: 104 },
        { x: 26, y: 544, w: 124, h: 22 }, { x: 240, y: 544, w: 124, h: 22 }
      ],
      covers: [
        { x: 62, y: 170 }, { x: 168, y: 222 }, { x: 230, y: 220 }, { x: 326, y: 328 },
        { x: 70, y: 338 }, { x: 190, y: 330 }, { x: 320, y: 514 }, { x: 178, y: 510 }, { x: 70, y: 515 }
      ],
      point: { x: 195, y: 324, r: 46 },
      spawns: {
        blue: [{ x: 54, y: 626 }, { x: 92, y: 604 }, { x: 142, y: 620 }, { x: 47, y: 478 }],
        red: [{ x: 338, y: 108 }, { x: 294, y: 112 }, { x: 248, y: 100 }, { x: 342, y: 382 }]
      }
    },
    {
      name: 'COURTYARD', bg: '#152022', floor: '#24332f', grid: '#3b5047', accent: '#e2b269',
      walls: [
        { x: 24, y: 174, w: 108, h: 25 }, { x: 24, y: 199, w: 25, h: 96 },
        { x: 258, y: 174, w: 108, h: 25 }, { x: 341, y: 199, w: 25, h: 96 },
        { x: 50, y: 376, w: 70, h: 26 }, { x: 270, y: 376, w: 70, h: 26 },
        { x: 50, y: 402, w: 26, h: 92 }, { x: 314, y: 402, w: 26, h: 92 },
        { x: 142, y: 246, w: 106, h: 20 }, { x: 142, y: 434, w: 106, h: 20 },
        { x: 26, y: 558, w: 106, h: 24 }, { x: 258, y: 558, w: 106, h: 24 }
      ],
      covers: [
        { x: 62, y: 158 }, { x: 176, y: 214 }, { x: 222, y: 214 }, { x: 328, y: 320 },
        { x: 76, y: 348 }, { x: 186, y: 358 }, { x: 310, y: 526 }, { x: 186, y: 536 }, { x: 72, y: 528 }
      ],
      point: { x: 195, y: 344, r: 48 },
      spawns: {
        blue: [{ x: 54, y: 626 }, { x: 98, y: 614 }, { x: 144, y: 628 }, { x: 50, y: 510 }],
        red: [{ x: 338, y: 108 }, { x: 294, y: 106 }, { x: 246, y: 112 }, { x: 340, y: 336 }]
      }
    }
  ];

  const state = {
    mapIndex: 0, mode: 'tdm', map: MAPS[0], weapon: 'ar', gadget: 'frag',
    roundTime: 120, blue: 0, red: 0, controlBlue: 0, controlRed: 0,
    roundOver: false, entities: [], particles: [], tracers: [], smokes: [], grenades: [], feed: [],
    player: null, killStreak: 0, uavTimer: 0, sensorTimer: 0, flash: 0, shake: 0,
    charges: { frag: 2, smoke: 2, sensor: 3 }, lastAim: { x: 1, y: 0 },
    nextEntityId: 1, pendingTimers: []
  };

  const input = {
    keys: new Set(), queuedGadget: 0,
    left: { pointerId: null, x: 0, y: 0, active: false, el: $('leftStick') },
    right: { pointerId: null, x: 0, y: 0, active: false, el: $('rightStick') },
    gadget: { pointerId: null, el: $('gadgetButton') },
    taps: []
  };

  const view = { w: 1, h: 1, dpr: 1, scale: 1, ox: 0, oy: 0 };
  let orientationBlocked = false;
  let lastFrame = performance.now();
  let audioContext = null;

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function pad(value) { return String(Math.max(0, Math.floor(value))).padStart(2, '0'); }
  function pushCap(list, value, cap) { if (list.length >= cap) list.shift(); list.push(value); }

  function readStore(key, fallback, valid) {
    try {
      const raw = localStorage.getItem(key);
      if (typeof raw !== 'string' || raw.length === 0) return fallback;
      const parsed = JSON.parse(raw);
      return valid(parsed) ? parsed : fallback;
    } catch (_) { return fallback; }
  }

  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage is optional */ }
  }

  function validProfile(value) {
    return value && typeof value === 'object' && !Array.isArray(value) &&
      Number.isFinite(value.xp) && Number.isFinite(value.wins) && Number.isFinite(value.played) &&
      Number.isFinite(value.camo) && Number.isFinite(value.bestKills);
  }

  let profile = readStore('ironsight-ops-profile', { xp: 0, wins: 0, played: 0, camo: 0, bestKills: 0 }, validProfile);
  profile.xp = clamp(Math.floor(profile.xp), 0, 999999);
  profile.wins = clamp(Math.floor(profile.wins), 0, 999999);
  profile.played = clamp(Math.floor(profile.played), 0, 999999);
  profile.camo = clamp(Math.floor(profile.camo), 0, CAMOS.length - 1);
  profile.bestKills = clamp(Math.floor(profile.bestKills), 0, 999999);

  function rankNumber() { return Math.min(99, 1 + Math.floor(profile.xp / 100)); }
  function rankProgress() { return profile.xp % 100; }

  function resizeCanvas() {
    view.w = Math.max(1, window.innerWidth);
    view.h = Math.max(1, window.innerHeight);
    view.dpr = Math.min(window.devicePixelRatio || 1, 2, 960 / Math.max(view.w, view.h));
    if (!Number.isFinite(view.dpr) || view.dpr <= 0) view.dpr = 1;
    canvas.width = Math.max(1, Math.floor(view.w * view.dpr));
    canvas.height = Math.max(1, Math.floor(view.h * view.dpr));
    view.scale = Math.min(view.w / VW, view.h / VH);
    view.ox = (view.w - VW * view.scale) * .5;
    view.oy = (view.h - VH * view.scale) * .5;
  }

  function syncOrientation() {
    const blocked = window.innerWidth > window.innerHeight;
    if (blocked !== orientationBlocked) {
      orientationBlocked = blocked;
      releaseAllInput();
      lastFrame = performance.now();
    }
    $('rotateOverlay').hidden = !blocked;
  }

  function unlockAudio() {
    if (!audioContext) {
      try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { audioContext = null; }
    }
    if (audioContext) {
      try { audioContext.resume(); } catch (_) { /* gesture may be unavailable */ }
    }
    $('audioToast').classList.add('off');
  }

  function tone(frequency, duration, type = 'square', volume = .025) {
    if (!audioContext) return;
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch (_) { /* audio is flavor, not a dependency */ }
  }

  function cancelPendingTimers() {
    for (const timer of state.pendingTimers) {
      try { clearTimeout(timer); } catch (_) { /* no-op */ }
    }
    state.pendingTimers.length = 0;
  }

  function schedule(callback, delay) {
    if (state.pendingTimers.length >= 12) return;
    const timer = setTimeout(() => {
      const index = state.pendingTimers.indexOf(timer);
      if (index >= 0) state.pendingTimers.splice(index, 1);
      callback();
    }, delay);
    state.pendingTimers.push(timer);
  }

  function resetPad(pad) {
    pad.pointerId = null;
    pad.x = 0;
    pad.y = 0;
    pad.active = false;
    const knob = pad.el.querySelector('.stickKnob');
    if (knob) knob.style.transform = 'translate(-50%, -50%)';
  }

  function releaseAllInput() {
    input.keys.clear();
    input.queuedGadget = 0;
    for (const pad of [input.left, input.right]) {
      if (pad.pointerId !== null) {
        try { pad.el.releasePointerCapture(pad.pointerId); } catch (_) { /* capture may already be gone */ }
      }
      resetPad(pad);
    }
    if (input.gadget.pointerId !== null) {
      try { input.gadget.el.releasePointerCapture(input.gadget.pointerId); } catch (_) { /* no-op */ }
    }
    input.gadget.pointerId = null;
    for (const tap of input.taps) {
      if (tap.pointerId !== null) {
        try { tap.el.releasePointerCapture(tap.pointerId); } catch (_) { /* no-op */ }
      }
      tap.pointerId = null;
    }
  }

  function bindStick(pad) {
    const el = pad.el;
    const update = (event) => {
      if (event.pointerId !== pad.pointerId) return;
      const rect = el.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width * .5);
      const dy = event.clientY - (rect.top + rect.height * .5);
      const radius = rect.width * .39;
      const length = Math.hypot(dx, dy) || 1;
      const scale = Math.min(1, radius / length);
      pad.x = clamp(dx / radius, -1, 1);
      pad.y = clamp(dy / radius, -1, 1);
      const knob = el.querySelector('.stickKnob');
      if (knob) knob.style.transform = `translate(calc(-50% + ${dx * scale}px), calc(-50% + ${dy * scale}px))`;
    };
    const release = (event) => {
      if (event.pointerId !== pad.pointerId) return;
      resetPad(pad);
      event.preventDefault();
    };
    el.addEventListener('pointerdown', (event) => {
      if (orientationBlocked || document.hidden || pad.pointerId !== null) return;
      unlockAudio();
      pad.pointerId = event.pointerId;
      pad.active = true;
      try { el.setPointerCapture(event.pointerId); } catch (_) { /* capture is optional */ }
      update(event);
      event.preventDefault();
    }, { passive: false });
    el.addEventListener('pointermove', update, { passive: false });
    el.addEventListener('pointerup', release, { passive: false });
    el.addEventListener('pointercancel', release, { passive: false });
  }

  function bindGadgetButton() {
    const el = input.gadget.el;
    const release = (event) => {
      if (event.pointerId !== input.gadget.pointerId) return;
      input.gadget.pointerId = null;
      event.preventDefault();
    };
    el.addEventListener('pointerdown', (event) => {
      if (orientationBlocked || document.hidden || input.gadget.pointerId !== null) return;
      unlockAudio();
      input.gadget.pointerId = event.pointerId;
      try { el.setPointerCapture(event.pointerId); } catch (_) { /* optional */ }
      input.queuedGadget = 1;
      event.preventDefault();
    }, { passive: false });
    el.addEventListener('pointerup', release, { passive: false });
    el.addEventListener('pointercancel', release, { passive: false });
  }

  function bindTapButton(element, action) {
    const control = { el: element, pointerId: null };
    input.taps.push(control);
    const release = (event) => {
      if (event.pointerId !== control.pointerId) return;
      control.pointerId = null;
      if (event.type === 'pointerup') action();
      event.preventDefault();
    };
    element.addEventListener('pointerdown', (event) => {
      if (orientationBlocked || document.hidden || control.pointerId !== null) return;
      unlockAudio();
      control.pointerId = event.pointerId;
      try { element.setPointerCapture(event.pointerId); } catch (_) { /* optional */ }
      event.preventDefault();
    }, { passive: false });
    element.addEventListener('pointerup', release, { passive: false });
    element.addEventListener('pointercancel', release, { passive: false });
  }

  function makeEntity(name, team, type, position, weapon) {
    return {
      id: state.nextEntityId++, name, team, type, weapon, x: position.x, y: position.y, r: type === 'player' ? 12 : 10,
      angle: team === 'blue' ? -Math.PI / 2 : Math.PI / 2, hp: 100, maxHp: 100, alive: true,
      respawn: 0, fireCd: .3, think: Math.random() * .2, target: null, goal: null, kills: 0, deaths: 0,
      invuln: type === 'player' ? 1.5 : .7, strafe: Math.random() > .5 ? 1 : -1
    };
  }

  function resetRound() {
    cancelPendingTimers();
    releaseAllInput();
    state.map = MAPS[state.mapIndex];
    state.roundTime = 120;
    state.blue = 0;
    state.red = 0;
    state.controlBlue = 0;
    state.controlRed = 0;
    state.roundOver = false;
    state.killStreak = 0;
    state.uavTimer = 0;
    state.sensorTimer = 0;
    state.flash = 0;
    state.shake = 0;
    state.charges = { frag: 2, smoke: 2, sensor: 3 };
    state.particles.length = 0;
    state.tracers.length = 0;
    state.smokes.length = 0;
    state.grenades.length = 0;
    state.feed.length = 0;
    state.nextEntityId = 1;
    state.entities.length = 0;

    const blueSpawns = state.map.spawns.blue;
    const redSpawns = state.map.spawns.red;
    state.player = makeEntity('YOU', 'blue', 'player', blueSpawns[0], state.weapon);
    state.entities.push(state.player);
    const allyNames = ['Kite', 'Mica', 'Dune'];
    const botWeapons = ['ar', 'smg', 'dmr'];
    for (let i = 0; i < 3; i++) state.entities.push(makeEntity(allyNames[i], 'blue', 'bot', blueSpawns[i + 1], botWeapons[i]));
    const enemyNames = ['Vex', 'Nix', 'Orla', 'Rook'];
    for (let i = 0; i < 4; i++) state.entities.push(makeEntity(enemyNames[i], 'red', 'bot', redSpawns[i], botWeapons[(i + 1) % botWeapons.length]));
    $('roundResult').hidden = true;
    renderUi();
  }

  function respawn(entity) {
    const spawnSet = entity.team === 'blue' ? state.map.spawns.blue : state.map.spawns.red;
    const spawn = spawnSet[(entity.deaths + entity.id) % spawnSet.length];
    entity.x = spawn.x;
    entity.y = spawn.y;
    entity.hp = entity.maxHp;
    entity.alive = true;
    entity.invuln = 1.25;
    entity.fireCd = .35;
    entity.goal = null;
    entity.target = null;
    burst(entity.x, entity.y, entity.team === 'blue' ? '#66caff' : '#ff737b', 8, 32);
  }

  function circleHitsWall(x, y, radius) {
    for (const wall of state.map.walls) {
      const qx = clamp(x, wall.x, wall.x + wall.w);
      const qy = clamp(y, wall.y, wall.y + wall.h);
      if ((x - qx) ** 2 + (y - qy) ** 2 < radius ** 2) return true;
    }
    return false;
  }

  function moveEntity(entity, dx, dy) {
    const nx = clamp(entity.x + dx, 18, VW - 18);
    const ny = clamp(entity.y + dy, 103, VH - 26);
    if (!circleHitsWall(nx, entity.y, entity.r)) entity.x = nx;
    if (!circleHitsWall(entity.x, ny, entity.r)) entity.y = ny;
  }

  function segmentHitsWall(a, b) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 7);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(a.x, b.x, t);
      const y = lerp(a.y, b.y, t);
      for (const wall of state.map.walls) if (x >= wall.x && x <= wall.x + wall.w && y >= wall.y && y <= wall.y + wall.h) return true;
    }
    return false;
  }

  function segmentHitsSmoke(a, b) {
    for (const smoke of state.smokes) {
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 9);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = lerp(a.x, b.x, t);
        const y = lerp(a.y, b.y, t);
        if ((x - smoke.x) ** 2 + (y - smoke.y) ** 2 < smoke.r ** 2) return true;
      }
    }
    return false;
  }

  function lineClear(a, b, includeSmoke) {
    if (segmentHitsWall(a, b)) return false;
    return !includeSmoke || !segmentHitsSmoke(a, b);
  }

  function getMoveVector() {
    let x = input.left.x;
    let y = input.left.y;
    if (input.keys.has('w')) y -= 1;
    if (input.keys.has('s')) y += 1;
    if (input.keys.has('a')) x -= 1;
    if (input.keys.has('d')) x += 1;
    const length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
  }

  function getAimVector() {
    let x = input.right.x;
    let y = input.right.y;
    let usingKeyboard = false;
    if (input.keys.has('ArrowLeft')) { x -= 1; usingKeyboard = true; }
    if (input.keys.has('ArrowRight')) { x += 1; usingKeyboard = true; }
    if (input.keys.has('ArrowUp')) { y -= 1; usingKeyboard = true; }
    if (input.keys.has('ArrowDown')) { y += 1; usingKeyboard = true; }
    const length = Math.hypot(x, y);
    if (length > .08) {
      state.lastAim = { x: x / length, y: y / length };
      return state.lastAim;
    }
    return state.lastAim;
  }

  function playerIsFiring() {
    return input.right.active && Math.hypot(input.right.x, input.right.y) > .12 ||
      input.keys.has('ArrowLeft') || input.keys.has('ArrowRight') || input.keys.has('ArrowUp') || input.keys.has('ArrowDown');
  }

  function nearestTarget(bot) {
    let best = null;
    let bestScore = Infinity;
    for (const candidate of state.entities) {
      if (!candidate.alive || candidate.team === bot.team) continue;
      const distance = dist(bot, candidate);
      const hiddenPenalty = lineClear(bot, candidate, true) ? 0 : 230;
      const score = distance + hiddenPenalty;
      if (score < bestScore) { best = candidate; bestScore = score; }
    }
    return best;
  }

  function chooseBotGoal(bot) {
    const target = bot.target;
    if (target && target.alive) {
      if (lineClear(target, bot, true)) {
        let cover = null;
        let coverScore = Infinity;
        for (const spot of state.map.covers) {
          if (lineClear(target, spot, true)) continue;
          const score = dist(bot, spot) + dist(target, spot) * .08;
          if (score < coverScore) { cover = spot; coverScore = score; }
        }
        if (cover && dist(bot, cover) < 230) return { x: cover.x, y: cover.y };
      }
      if (dist(bot, target) > WEAPONS[bot.weapon].range * .62) return { x: target.x, y: target.y };
      return { x: target.x + Math.cos(bot.angle + Math.PI / 2) * 34 * bot.strafe, y: target.y + Math.sin(bot.angle + Math.PI / 2) * 34 * bot.strafe };
    }
    if (state.mode === 'control' && dist(bot, state.map.point) > 76) return { x: state.map.point.x, y: state.map.point.y };
    return { x: bot.x, y: bot.y };
  }

  function updatePlayer(dt) {
    const player = state.player;
    if (!player.alive) {
      player.respawn -= dt;
      if (player.respawn <= 0) respawn(player);
      return;
    }
    player.invuln = Math.max(0, player.invuln - dt);
    player.fireCd -= dt;
    player.weapon = state.weapon;
    const move = getMoveVector();
    moveEntity(player, move.x * 124 * dt, move.y * 124 * dt);
    const aim = getAimVector();
    player.angle = Math.atan2(aim.y, aim.x);
    if (playerIsFiring()) shoot(player, aim, true);
  }

  function updateBot(bot, dt) {
    if (!bot.alive) {
      bot.respawn -= dt;
      if (bot.respawn <= 0) respawn(bot);
      return;
    }
    bot.invuln = Math.max(0, bot.invuln - dt);
    bot.fireCd -= dt;
    bot.think -= dt;
    if (bot.think <= 0) {
      bot.think = .22 + Math.random() * .18;
      bot.target = nearestTarget(bot);
      bot.goal = chooseBotGoal(bot);
    }
    const target = bot.target && bot.target.alive ? bot.target : nearestTarget(bot);
    if (target) bot.target = target;
    const weapon = WEAPONS[bot.weapon];
    if (target && lineClear(bot, target, true)) {
      const aimX = target.x - bot.x;
      const aimY = target.y - bot.y;
      const distance = Math.hypot(aimX, aimY);
      bot.angle = Math.atan2(aimY, aimX);
      if (distance < weapon.range * 1.08 && bot.fireCd <= 0) shoot(bot, { x: aimX / distance, y: aimY / distance }, false);
    }
    const goal = bot.goal || chooseBotGoal(bot);
    if (goal) {
      const gx = goal.x - bot.x;
      const gy = goal.y - bot.y;
      const length = Math.hypot(gx, gy);
      if (length > 8) moveEntity(bot, gx / length * 64 * dt, gy / length * 64 * dt);
    }
  }

  function shoot(shooter, aim, isPlayer) {
    if (!shooter.alive || shooter.fireCd > 0) return;
    const weapon = WEAPONS[shooter.weapon];
    shooter.fireCd = weapon.cooldown;
    const angle = Math.atan2(aim.y, aim.x) + (Math.random() - .5) * weapon.spread;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const start = { x: shooter.x + direction.x * (shooter.r + 3), y: shooter.y + direction.y * (shooter.r + 3) };
    let end = { x: shooter.x + direction.x * weapon.range, y: shooter.y + direction.y * weapon.range };
    let hit = null;
    for (let distance = 0; distance <= weapon.range; distance += 5) {
      const point = { x: shooter.x + direction.x * distance, y: shooter.y + direction.y * distance };
      let blocked = false;
      for (const wall of state.map.walls) {
        if (point.x >= wall.x && point.x <= wall.x + wall.w && point.y >= wall.y && point.y <= wall.y + wall.h) { blocked = true; break; }
      }
      if (blocked) { end = point; break; }
      for (const candidate of state.entities) {
        if (!candidate.alive || candidate.team === shooter.team || candidate.id === shooter.id) continue;
        if ((point.x - candidate.x) ** 2 + (point.y - candidate.y) ** 2 < (candidate.r + 3) ** 2) {
          hit = candidate;
          end = point;
          break;
        }
      }
      if (hit) break;
    }
    pushCap(state.tracers, { x1: start.x, y1: start.y, x2: end.x, y2: end.y, life: .075, color: weapon.color }, MAX_TRACERS);
    burst(start.x, start.y, weapon.color, isPlayer ? 3 : 2, 22);
    if (hit) {
      const falloff = clamp(1 - dist(shooter, hit) / weapon.range * .35, .58, 1);
      takeDamage(hit, weapon.damage * falloff, shooter);
      burst(end.x, end.y, hit.team === 'blue' ? '#83d2ff' : '#ff7b7e', 6, 42);
      if (isPlayer) state.flash = .07;
    }
    tone(isPlayer ? 125 : 90, .035, 'square', isPlayer ? .018 : .009);
  }

  function takeDamage(target, amount, attacker) {
    if (!target.alive || target.invuln > 0) return;
    target.hp -= amount;
    target.invuln = Math.max(target.invuln, .06);
    if (target.type === 'player') { state.flash = .11; state.shake = Math.max(state.shake, 3); }
    if (target.hp <= 0) eliminate(target, attacker);
  }

  function eliminate(victim, killer) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    victim.respawn = 2.2;
    victim.deaths++;
    if (killer) {
      killer.kills++;
      if (killer.team === 'blue') state.blue++; else state.red++;
      if (killer.type === 'player') {
        state.killStreak++;
        if (state.killStreak === 3) {
          state.uavTimer = 8;
          addFeed('UAV PING ONLINE', '#59e0c0');
          tone(760, .18, 'sine', .04);
        }
      }
      addFeed(`${killer.name} dropped ${victim.name}`, killer.team === 'blue' ? '#7ccaff' : '#ff7b7e');
    }
    if (victim.type === 'player') {
      state.killStreak = 0;
      addFeed('YOU ARE DOWN · RESPAWNING', '#ffbc63');
      state.shake = 7;
      tone(52, .18, 'sawtooth', .035);
    }
    burst(victim.x, victim.y, victim.team === 'blue' ? '#66caff' : '#ff6872', 18, 75);
    if (state.mode === 'tdm' && (state.blue >= 20 || state.red >= 20)) endRound();
  }

  function useGadget() {
    if (state.roundOver || !state.player.alive) return;
    const type = state.gadget;
    if (!state.charges[type]) { addFeed(`${type.toUpperCase()} EMPTY`, '#ffbc63'); tone(180, .06, 'square', .025); return; }
    const aim = getAimVector();
    const range = type === 'sensor' ? 0 : 106;
    const target = { x: clamp(state.player.x + aim.x * range, 22, VW - 22), y: clamp(state.player.y + aim.y * range, 110, VH - 30) };
    state.charges[type]--;
    if (type === 'frag') {
      if (state.grenades.length < MAX_GRENADES) state.grenades.push({ x: target.x, y: target.y, t: .72, owner: state.player });
      addFeed('FRAG OUT', '#ffbc63');
      tone(230, .08, 'square', .035);
    } else if (type === 'smoke') {
      pushCap(state.smokes, { x: target.x, y: target.y, r: 66, life: 7 }, MAX_SMOKES);
      burst(target.x, target.y, '#aeb9bd', 16, 44);
      addFeed('SMOKE SCREEN ACTIVE', '#b9d4d0');
      tone(300, .08, 'sine', .025);
    } else {
      state.sensorTimer = 5;
      addFeed('SENSOR PING · HOSTILES MARKED', '#e2b269');
      burst(state.player.x, state.player.y, '#e2b269', 14, 34);
      tone(640, .12, 'sine', .035);
    }
  }

  function explodeFrag(grenade) {
    burst(grenade.x, grenade.y, '#ffbd66', 32, 115);
    state.shake = Math.max(state.shake, 8);
    for (const entity of state.entities) {
      if (!entity.alive || entity.team === grenade.owner.team) continue;
      const distance = Math.hypot(entity.x - grenade.x, entity.y - grenade.y);
      if (distance < 84 && lineClear(grenade, entity, false)) takeDamage(entity, 88 * (1 - distance / 130), grenade.owner);
    }
    tone(68, .22, 'sawtooth', .045);
  }

  function updateOrdnance(dt) {
    for (let i = state.grenades.length - 1; i >= 0; i--) {
      const grenade = state.grenades[i];
      grenade.t -= dt;
      if (grenade.t <= 0) { explodeFrag(grenade); state.grenades.splice(i, 1); }
    }
    for (let i = state.smokes.length - 1; i >= 0; i--) {
      state.smokes[i].life -= dt;
      if (state.smokes[i].life <= 0) state.smokes.splice(i, 1);
    }
  }

  function updateEffects(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= .94;
      p.vy *= .94;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.tracers.length - 1; i >= 0; i--) {
      state.tracers[i].life -= dt;
      if (state.tracers[i].life <= 0) state.tracers.splice(i, 1);
    }
    for (let i = state.feed.length - 1; i >= 0; i--) {
      state.feed[i].life -= dt;
      if (state.feed[i].life <= 0) state.feed.splice(i, 1);
    }
    state.flash = Math.max(0, state.flash - dt);
    state.shake = Math.max(0, state.shake - dt * 16);
    state.uavTimer = Math.max(0, state.uavTimer - dt);
    state.sensorTimer = Math.max(0, state.sensorTimer - dt);
  }

  function updateControl(dt) {
    if (state.mode !== 'control') return;
    let blue = 0;
    let red = 0;
    for (const entity of state.entities) {
      if (!entity.alive || dist(entity, state.map.point) > state.map.point.r) continue;
      if (entity.team === 'blue') blue++; else red++;
    }
    if (blue > red) state.controlBlue = clamp(state.controlBlue + dt * 5, 0, 100);
    if (red > blue) state.controlRed = clamp(state.controlRed + dt * 5, 0, 100);
    if (state.controlBlue >= 100 || state.controlRed >= 100) endRound();
  }

  function update(dt) {
    if (orientationBlocked || document.hidden || state.roundOver) return;
    state.roundTime = Math.max(0, state.roundTime - dt);
    updatePlayer(dt);
    for (const entity of state.entities) if (entity.type === 'bot') updateBot(entity, dt);
    updateOrdnance(dt);
    updateControl(dt);
    updateEffects(dt);
    if (input.queuedGadget) { input.queuedGadget = 0; useGadget(); }
    if (state.roundTime <= 0) endRound();
  }

  function burst(x, y, color, count, force) {
    const safeCount = Math.min(count, MAX_PARTICLES - state.particles.length);
    for (let i = 0; i < safeCount; i++) {
      const angle = Math.random() * TAU;
      const speed = Math.random() * force;
      pushCap(state.particles, { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .16 + Math.random() * .35, size: 1 + Math.random() * 2.5, color }, MAX_PARTICLES);
    }
  }

  function addFeed(text, color) { pushCap(state.feed, { text, color, life: 3.2 }, MAX_FEED); }

  function endRound() {
    if (state.roundOver) return;
    state.roundOver = true;
    releaseAllInput();
    cancelPendingTimers();
    const blueScore = state.mode === 'tdm' ? state.blue : Math.floor(state.controlBlue);
    const redScore = state.mode === 'tdm' ? state.red : Math.floor(state.controlRed);
    const winner = blueScore > redScore ? 'blue' : redScore > blueScore ? 'red' : 'draw';
    const win = winner === 'blue';
    const xpGain = winner === 'draw' ? 50 : (win ? 100 : 35) + Math.min(40, state.player.kills * 4);
    profile.xp = clamp(profile.xp + xpGain, 0, 999999);
    profile.wins = clamp(profile.wins + (win ? 1 : 0), 0, 999999);
    profile.played = clamp(profile.played + 1, 0, 999999);
    profile.bestKills = Math.max(profile.bestKills, state.player.kills);
    profile.camo = clamp(Math.floor(profile.xp / 125), 0, CAMOS.length - 1);
    writeStore('ironsight-ops-profile', profile);
    const title = winner === 'draw' ? 'DRAW' : win ? 'VICTORY' : 'DEFEAT';
    $('resultTitle').textContent = title;
    $('resultTitle').style.color = winner === 'draw' ? '#ffbc63' : win ? '#59e0c0' : '#ff6872';
    $('resultBody').textContent = `${state.map.name} · ${state.mode === 'tdm' ? 'TEAM DEATHMATCH' : 'CONTROL POINT'} · ${blueScore} — ${redScore}. ${win ? 'Your squad owns the drill.' : winner === 'draw' ? 'Nobody took the final lane.' : 'Recalibrate and take the next lane.'}`;
    $('resultKills').textContent = `${state.player.kills} KILLS · ${xpGain} XP`;
    $('resultRank').textContent = `RANK ${String(rankNumber()).padStart(2, '0')} · CAMO ${profile.camo + 1}`;
    $('roundResult').hidden = false;
    renderUi();
    tone(win ? 520 : 120, .28, win ? 'sine' : 'sawtooth', .04);
  }

  function cycleMap() {
    state.mapIndex = (state.mapIndex + 1) % MAPS.length;
    resetRound();
  }

  function cycleMode() {
    state.mode = state.mode === 'tdm' ? 'control' : 'tdm';
    resetRound();
  }

  function renderUi() {
    const blueScore = state.mode === 'tdm' ? state.blue : Math.floor(state.controlBlue);
    const redScore = state.mode === 'tdm' ? state.red : Math.floor(state.controlRed);
    $('blueScore').textContent = pad(blueScore);
    $('redScore').textContent = pad(redScore);
    $('timerReadout').textContent = `${Math.floor(state.roundTime / 60)}:${pad(state.roundTime % 60)}`;
    $('modeReadout').textContent = state.mode === 'tdm' ? 'TDM' : 'CONTROL';
    $('mapReadout').textContent = state.map.name;
    $('mapCycle').textContent = `MAP · ${state.map.name}`;
    $('modeCycle').textContent = `MODE · ${state.mode === 'tdm' ? 'TDM' : 'CONTROL'}`;
    $('objectiveReadout').textContent = state.mode === 'tdm' ? 'ELIMINATE HOSTILES · FIRST TO 20' : `HOLD CENTER · ${Math.floor(state.controlBlue)} / 100`;
    $('rankPill').textContent = `RANK ${String(rankNumber()).padStart(2, '0')} · ${rankProgress()} / 100 XP · CAMO ${profile.camo + 1}`;
    $('gadgetLabel').textContent = `${state.gadget.toUpperCase()} · ${state.charges[state.gadget]}`;
    document.querySelectorAll('[data-weapon]').forEach((button) => button.classList.toggle('active', button.dataset.weapon === state.weapon));
    document.querySelectorAll('[data-gadget]').forEach((button) => button.classList.toggle('active', button.dataset.gadget === state.gadget));
  }

  function drawArena() {
    const map = state.map;
    ctx.fillStyle = map.bg;
    ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = map.floor;
    ctx.fillRect(14, 96, VW - 28, VH - 124);
    ctx.strokeStyle = map.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = .28;
    for (let x = 20; x < VW - 10; x += 24) { ctx.beginPath(); ctx.moveTo(x, 100); ctx.lineTo(x, VH - 28); ctx.stroke(); }
    for (let y = 108; y < VH - 20; y += 24) { ctx.beginPath(); ctx.moveTo(15, y); ctx.lineTo(VW - 15, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = map.accent;
    ctx.globalAlpha = .35;
    ctx.strokeRect(14, 96, VW - 28, VH - 124);
    ctx.globalAlpha = 1;
    for (const wall of map.walls) {
      ctx.fillStyle = 'rgba(2, 8, 12, .48)';
      ctx.fillRect(wall.x + 4, wall.y + 5, wall.w, wall.h);
      ctx.fillStyle = '#263d42';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.fillStyle = map.accent;
      ctx.globalAlpha = .52;
      ctx.fillRect(wall.x, wall.y, wall.w, 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(188, 235, 216, .15)';
      ctx.strokeRect(wall.x + .5, wall.y + .5, wall.w - 1, wall.h - 1);
      if (wall.w > 50) {
        ctx.strokeStyle = 'rgba(7, 16, 21, .36)';
        ctx.beginPath(); ctx.moveTo(wall.x + 8, wall.y + wall.h - 5); ctx.lineTo(wall.x + wall.w - 8, wall.y + wall.h - 5); ctx.stroke();
      }
    }
    drawObjective();
    drawOrdnance();
    drawEntities();
    drawSmokes();
    drawTracers();
    drawParticles();
    drawFeed();
    drawMinimap();
  }

  function drawObjective() {
    const p = state.map.point;
    const blue = state.controlBlue > state.controlRed;
    const red = state.controlRed > state.controlBlue;
    ctx.save();
    ctx.globalAlpha = .16;
    ctx.fillStyle = blue ? '#61b7ff' : red ? '#ff6872' : '#e2b269';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    ctx.globalAlpha = .8;
    ctx.strokeStyle = blue ? '#61b7ff' : red ? '#ff6872' : '#e2b269';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#dcece4';
    ctx.font = 'bold 8px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(state.mode === 'control' ? 'CONTROL' : 'CENTER', p.x, p.y + 3);
    ctx.restore();
  }

  function drawOrdnance() {
    for (const grenade of state.grenades) {
      const pulse = 3 + Math.sin(grenade.t * 20) * 2;
      ctx.fillStyle = '#ffbc63';
      ctx.beginPath(); ctx.arc(grenade.x, grenade.y, pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 188, 99, .55)';
      ctx.beginPath(); ctx.arc(grenade.x, grenade.y, 10 + pulse, 0, TAU); ctx.stroke();
    }
  }

  function drawEntities() {
    for (const entity of state.entities) {
      if (!entity.alive) continue;
      const teamColor = entity.team === 'blue' ? '#61b7ff' : '#ff6872';
      const bodyColor = entity.type === 'player' ? CAMOS[profile.camo] : teamColor;
      ctx.save();
      ctx.translate(entity.x, entity.y);
      ctx.rotate(entity.angle);
      ctx.fillStyle = 'rgba(0, 0, 0, .38)';
      ctx.beginPath(); ctx.ellipse(2, 5, entity.r + 2, entity.r * .64, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-entity.r * .78, -entity.r * .78, entity.r * 1.56, entity.r * 1.56);
      ctx.fillStyle = teamColor;
      ctx.fillRect(entity.r * .25, -2, entity.r + 7, 4);
      ctx.fillStyle = '#f1f6e9';
      ctx.beginPath(); ctx.arc(entity.r * .12, 0, entity.r * .35, 0, TAU); ctx.fill();
      ctx.restore();
      if (entity.invuln > 0 && Math.floor(entity.invuln * 12) % 2 === 0) {
        ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(entity.x, entity.y, entity.r + 4, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(3, 9, 13, .72)'; ctx.fillRect(entity.x - 15, entity.y - 19, 30, 3);
      ctx.fillStyle = entity.team === 'blue' ? '#62c8ff' : '#ff7178'; ctx.fillRect(entity.x - 15, entity.y - 19, 30 * clamp(entity.hp / entity.maxHp, 0, 1), 3);
      if (entity.type === 'player') {
        ctx.fillStyle = '#eafbf3'; ctx.font = 'bold 7px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText('YOU', entity.x, entity.y - 24);
      }
    }
  }

  function drawSmokes() {
    for (const smoke of state.smokes) {
      const fade = clamp(smoke.life / 1.2, 0, 1);
      ctx.save();
      ctx.globalAlpha = .72 * fade;
      ctx.fillStyle = '#9daeb0';
      ctx.beginPath(); ctx.arc(smoke.x, smoke.y, smoke.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = .25 * fade;
      ctx.strokeStyle = '#e0e8e4';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(smoke.x, smoke.y, smoke.r * .72 + Math.sin(smoke.life * 3) * 4, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  function drawTracers() {
    for (const tracer of state.tracers) {
      ctx.globalAlpha = clamp(tracer.life / .075, 0, 1);
      ctx.strokeStyle = tracer.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tracer.x1, tracer.y1); ctx.lineTo(tracer.x2, tracer.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.globalAlpha = clamp(p.life * 3, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawFeed() {
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'left';
    let y = 235;
    for (let i = state.feed.length - 1; i >= 0; i--) {
      const item = state.feed[i];
      ctx.globalAlpha = clamp(item.life, 0, 1);
      ctx.fillStyle = 'rgba(5, 14, 18, .75)'; ctx.fillRect(9, y - 9, Math.min(190, ctx.measureText(item.text).width + 12), 13);
      ctx.fillStyle = item.color; ctx.fillText(item.text, 15, y);
      y += 16;
    }
    ctx.globalAlpha = 1;
  }

  function drawMinimap() {
    const x = 302; const y = 82; const w = 76; const h = 76;
    ctx.fillStyle = 'rgba(4, 12, 17, .8)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(180, 223, 211, .35)'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    for (const wall of state.map.walls) {
      ctx.fillStyle = 'rgba(130, 167, 158, .42)';
      ctx.fillRect(x + wall.x / VW * w, y + wall.y / VH * h, wall.w / VW * w, wall.h / VH * h);
    }
    for (const entity of state.entities) {
      if (!entity.alive || (entity.team === 'red' && state.uavTimer <= 0 && state.sensorTimer <= 0)) continue;
      ctx.fillStyle = entity.type === 'player' ? '#f1f9dc' : entity.team === 'blue' ? '#61b7ff' : '#ff6872';
      ctx.beginPath(); ctx.arc(x + entity.x / VW * w, y + entity.y / VH * h, entity.type === 'player' ? 3 : 2, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#e2b269'; ctx.font = 'bold 7px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.fillText(state.uavTimer > 0 ? 'UAV' : 'RADAR', x + 4, y + 9);
  }

  function draw() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * (view.ox + (Math.random() - .5) * state.shake), view.dpr * (view.oy + (Math.random() - .5) * state.shake));
    drawArena();
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 240, 220, ${state.flash * 1.8})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    if (orientationBlocked) {
      ctx.fillStyle = '#071016'; ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  function frame(now) {
    const dt = clamp((now - lastFrame) / 1000, 0, .05);
    lastFrame = now;
    update(dt);
    renderUi();
    draw();
    requestAnimationFrame(frame);
  }

  function toGamePosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left - view.ox) / view.scale, y: (event.clientY - rect.top - view.oy) / view.scale };
  }

  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  bindStick(input.left);
  bindStick(input.right);
  bindGadgetButton();
  window.addEventListener('blur', releaseAllInput);
  window.addEventListener('resize', () => { resizeCanvas(); syncOrientation(); });
  window.addEventListener('orientationchange', () => { resizeCanvas(); syncOrientation(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseAllInput(); lastFrame = performance.now(); } });
  $('gameCanvas').addEventListener('pointerdown', (event) => { toGamePosition(event); event.preventDefault(); }, { passive: false });
  $('app').addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
  $('app').addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });

  window.addEventListener('keydown', (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'g', 'r', 'Enter', ' '].includes(key)) event.preventDefault();
    if (orientationBlocked || document.hidden) return;
    if ((key === 'r' || key === 'Enter') && state.roundOver) { resetRound(); return; }
    if (key === 'g' && !event.repeat) input.queuedGadget = 1;
    input.keys.add(key);
  });
  window.addEventListener('keyup', (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    input.keys.delete(key);
  });

  document.querySelectorAll('[data-weapon]').forEach((button) => {
    bindTapButton(button, () => { state.weapon = button.dataset.weapon; if (state.player) state.player.weapon = state.weapon; renderUi(); tone(440, .04, 'sine', .015); });
  });
  document.querySelectorAll('[data-gadget]').forEach((button) => {
    bindTapButton(button, () => { state.gadget = button.dataset.gadget; renderUi(); tone(360, .04, 'sine', .015); });
  });
  bindTapButton($('mapCycle'), cycleMap);
  bindTapButton($('modeCycle'), cycleMode);
  bindTapButton($('restartButton'), resetRound);

  resizeCanvas();
  syncOrientation();
  resetRound();
  requestAnimationFrame(frame);
})();
