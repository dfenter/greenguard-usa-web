(() => {
  'use strict';

  const W = 390;
  const H = 700;
  const STORE_KEY = 'sporeling-saga.records.v1';
  const MAX_PARTICLES = 110;
  const MAX_FLOATERS = 24;
  const MAX_HISTORY = 120;
  const MAX_DROPS = 8;
  const MAX_POINTERS = 16;
  const MAX_KEYS = 32;
  const MAX_TIMERS = 24;
  const TAU = Math.PI * 2;

  const canvas = document.getElementById('game-canvas');
  const shell = document.getElementById('game-shell');
  const rotateOverlay = document.getElementById('rotate-overlay');
  const ctx = canvas.getContext('2d', { alpha: false });

  const palette = {
    ink: '#0b1020',
    panel: '#131b31',
    panel2: '#182440',
    line: '#2d3d62',
    paper: '#f7f0df',
    muted: '#8fa0bf',
    cyan: '#66e0d0',
    gold: '#ffd166',
    coral: '#ff7a78',
    purple: '#bb9cff',
    green: '#a8e063',
  };

  const FOES = [
    { name: 'Mire Mote', color: '#e7787d', shape: 'orb' },
    { name: 'Brass Bramble', color: '#e3b65e', shape: 'horn' },
    { name: 'Hush Hopper', color: '#9c89e8', shape: 'hopper' },
    { name: 'Cinder Crawler', color: '#ed895b', shape: 'crawler' },
    { name: 'Velvet Maw', color: '#69c3b7', shape: 'maw' },
    { name: 'Rattle Reed', color: '#a9ca67', shape: 'reed' },
  ];

  const EVOLUTION = {
    guardian: {
      label: 'GUARDIAN', color: palette.cyan, final: 'Aegisroot',
      tiers: [
        { power: 2, armor: 4, tempo: 0, skill: 'Brace: 8% less incoming' },
        { power: 3, armor: 5, tempo: 0, skill: 'Bulwark: 12% less incoming' },
        { power: 5, armor: 7, tempo: 0, skill: 'Aegis: 18% less incoming' },
      ],
    },
    trickster: {
      label: 'TRICKSTER', color: palette.purple, final: 'Glimmerjack',
      tiers: [
        { power: 2, armor: 0, tempo: 0.18, skill: 'Afterimage: +7% crit' },
        { power: 3, armor: 0, tempo: 0.23, skill: 'Feint: +14% crit' },
        { power: 5, armor: 1, tempo: 0.28, skill: 'Mirage: +22% crit' },
      ],
    },
    bloom: {
      label: 'BLOOM', color: palette.green, final: 'Verdant Halo',
      tiers: [
        { power: 1, armor: 1, tempo: 0.06, skill: 'Sporewell: food +12' },
        { power: 2, armor: 2, tempo: 0.08, skill: 'Pollenheart: food +22' },
        { power: 4, armor: 3, tempo: 0.1, skill: 'Crownseed: food +35' },
      ],
    },
  };
  const BRANCHES = ['guardian', 'trickster', 'bloom'];

  const input = {
    activePointers: new Map(),
    pressedKeys: new Set(),
    queuedActions: [],
    stick: { x: 0, y: 0 },
  };
  const pendingTimers = new Set();
  const view = { landscape: false, hidden: false, dpr: 1 };
  let audioContext = null;
  let records = loadRecords();

  const game = {
    status: 'playing',
    rank: 1,
    xp: 0,
    runXp: 0,
    runElapsed: 0,
    score: 0,
    runSeed: 0,
    rng: 1,
    legacyAtStart: 0,
    playerHp: 72,
    maxHp: 72,
    foe: null,
    foeIndex: 0,
    attackTimer: 0.3,
    foeTimer: 1.1,
    sampleTimer: 1,
    history: [],
    particles: [],
    floaters: [],
    recentDrops: [],
    lastDrop: 'Tap the foe to strike. Forage for a free upgrade.',
    notice: '',
    noticeUntil: 0,
    shake: 0,
    flash: 0,
    flashColor: palette.cyan,
    choiceTier: 0,
    path: [],
    loot: { gear: 0, food: 0, trinket: 0 },
    stats: { power: 12, armor: 2, tempo: 1, fortune: 0 },
    skills: { guard: 0, crit: 0, food: 0 },
    ratePerMin: 0,
    finalForm: '',
  };

  const mainControls = {
    forage: { x: 16, y: 523, w: 358, h: 62 },
    restart: { x: 42, y: 473, w: 306, h: 62 },
  };
  let choiceControls = [];
  let lastFrame = performance.now();

  function defaultRecords() {
    return { bestRank: 1, bestScore: 0, wins: 0, legacy: 0, tree: { guardian: 0, trickster: 0, bloom: 0 } };
  }

  function finiteNumber(value, min, max, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  }

  function wholeNumber(value, min, max, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
  }

  function loadRecords() {
    const fallback = defaultRecords();
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (typeof raw !== 'string' || raw.length > 4096) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
      const tree = parsed.tree && typeof parsed.tree === 'object' && !Array.isArray(parsed.tree) ? parsed.tree : {};
      return {
        bestRank: wholeNumber(parsed.bestRank, 1, 20, fallback.bestRank),
        bestScore: wholeNumber(parsed.bestScore, 0, 99999999, fallback.bestScore),
        wins: wholeNumber(parsed.wins, 0, 9999, fallback.wins),
        legacy: wholeNumber(parsed.legacy, 0, 20, fallback.legacy),
        tree: {
          guardian: wholeNumber(tree.guardian, 0, 30, 0),
          trickster: wholeNumber(tree.trickster, 0, 30, 0),
          bloom: wholeNumber(tree.bloom, 0, 30, 0),
        },
      };
    } catch (_) {
      return fallback;
    }
  }

  function saveRecords() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(records));
    } catch (_) {
      // Storage can be disabled or full; the run remains playable.
    }
  }

  function later(fn, ms) {
    if (pendingTimers.size >= MAX_TIMERS) {
      const oldest = pendingTimers.values().next().value;
      window.clearTimeout(oldest);
      pendingTimers.delete(oldest);
    }
    let timer = 0;
    timer = window.setTimeout(() => {
      pendingTimers.delete(timer);
      fn();
    }, ms);
    pendingTimers.add(timer);
    return timer;
  }

  function cancelTimers() {
    pendingTimers.forEach((timer) => window.clearTimeout(timer));
    pendingTimers.clear();
  }

  function clearInput() {
    input.activePointers.clear();
    input.pressedKeys.clear();
    input.queuedActions.length = 0;
    input.stick.x = 0;
    input.stick.y = 0;
  }

  function announce(message, duration = 1800) {
    game.notice = message;
    game.noticeUntil = performance.now() + duration;
    later(() => {
      if (performance.now() >= game.noticeUntil) game.notice = '';
    }, duration + 30);
  }

  function unlockAudio() {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
    } catch (_) {
      audioContext = null;
    }
  }

  function tone(frequency, duration, type = 'sine', volume = 0.025) {
    if (!audioContext) return;
    try {
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch (_) { /* Audio is optional. */ }
  }

  function seedFromTime() {
    let seed = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        const values = new Uint32Array(1);
        window.crypto.getRandomValues(values);
        seed ^= values[0];
      }
    } catch (_) { /* Time seed is sufficient. */ }
    return seed || 1;
  }

  function random() {
    game.rng = (Math.imul(game.rng, 1664525) + 1013904223) >>> 0;
    return game.rng / 4294967296;
  }

  function xpForNext() {
    return Math.round(26 + game.rank * 11 + game.rank * game.rank * 0.6);
  }

  function resetRun() {
    clearInput();
    cancelTimers();
    game.status = 'playing';
    game.rank = 1;
    game.xp = 0;
    game.runXp = 0;
    game.runElapsed = 0;
    game.score = 0;
    game.runSeed = seedFromTime();
    game.rng = game.runSeed;
    game.legacyAtStart = records.legacy;
    game.maxHp = 72 + records.legacy * 4;
    game.playerHp = game.maxHp;
    game.foeIndex = 0;
    game.attackTimer = 0.25;
    game.foeTimer = 1.05;
    game.sampleTimer = 1;
    game.history = [{ t: 0, xp: 0 }];
    game.particles.length = 0;
    game.floaters.length = 0;
    game.recentDrops.length = 0;
    game.choiceTier = 0;
    game.path = [];
    game.loot = { gear: 0, food: 0, trinket: 0 };
    game.stats = { power: 12 + records.legacy * 0.8, armor: 2 + records.legacy * 0.25, tempo: 1, fortune: records.legacy * 0.005 };
    game.skills = { guard: 0, crit: 0, food: 0 };
    game.ratePerMin = 0;
    game.finalForm = '';
    game.notice = '';
    game.noticeUntil = 0;
    game.shake = 0;
    game.flash = 0;
    game.lastDrop = 'Tap the foe to strike. Forage for a free upgrade.';
    spawnFoe();
  }

  function spawnFoe() {
    const base = FOES[(game.foeIndex + game.rank - 1) % FOES.length];
    const maxHp = Math.round(28 + game.rank * 8 + game.foeIndex % 3 * 5);
    game.foe = {
      name: base.name,
      color: base.color,
      shape: base.shape,
      maxHp,
      hp: maxHp,
      damage: 5 + game.rank * 0.9 + (game.foeIndex % 4) * 0.8,
      bob: random() * TAU,
      hit: 0,
    };
    game.foeTimer = 1.05;
  }

  function capPush(list, item, limit) {
    if (list.length >= limit) list.splice(0, list.length - limit + 1);
    list.push(item);
  }

  function addParticles(x, y, color, count = 8, spread = 1) {
    for (let i = 0; i < count; i += 1) {
      capPush(game.particles, {
        x, y,
        vx: (random() - 0.5) * 100 * spread,
        vy: (random() - 0.78) * 120 * spread,
        life: 0.35 + random() * 0.45,
        maxLife: 0.8,
        size: 2 + random() * 4,
        color,
      }, MAX_PARTICLES);
    }
  }

  function addFloater(textValue, x, y, color) {
    capPush(game.floaters, { text: textValue, x, y, life: 0.8, color }, MAX_FLOATERS);
  }

  function updateFx(dt) {
    game.shake = Math.max(0, game.shake - dt * 16);
    game.flash = Math.max(0, game.flash - dt * 4);
    for (let i = game.particles.length - 1; i >= 0; i -= 1) {
      const p = game.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      if (p.life <= 0) game.particles.splice(i, 1);
    }
    for (let i = game.floaters.length - 1; i >= 0; i -= 1) {
      const f = game.floaters[i];
      f.life -= dt;
      f.y -= 28 * dt;
      if (f.life <= 0) game.floaters.splice(i, 1);
    }
  }

  function attack() {
    if (game.status !== 'playing' || !game.foe) return;
    const crit = random() < 0.08 + game.skills.crit + game.stats.fortune;
    const damage = game.stats.power * (crit ? 1.75 : 1) + random() * 2.5;
    game.foe.hp -= damage;
    game.foe.hit = 0.16;
    game.shake = Math.min(8, game.shake + (crit ? 3.5 : 1.4));
    game.flash = 0.2;
    game.flashColor = crit ? palette.gold : palette.cyan;
    addFloater(`${crit ? 'CRIT ' : ''}-${Math.round(damage)}`, 278, 142, crit ? palette.gold : palette.paper);
    addParticles(280, 190, crit ? palette.gold : palette.cyan, crit ? 10 : 5, 0.7);
    tone(crit ? 620 : 350, crit ? 0.11 : 0.06, 'triangle', crit ? 0.04 : 0.022);
    if (game.foe.hp <= 0) defeatFoe();
  }

  function defeatFoe() {
    if (!game.foe) return;
    const reward = Math.round(10 + game.rank * 3.4 + game.stats.fortune * 20);
    game.xp += reward;
    game.runXp += reward;
    game.score += reward * 4 + game.rank * 6;
    addFloater(`+${reward} XP`, 286, 176, palette.gold);
    addParticles(282, 194, game.foe.color, 15, 1.2);
    game.flash = 0.34;
    game.flashColor = game.foe.color;
    game.foeIndex += 1;
    tone(180, 0.08, 'square', 0.03);
    spawnFoe();
    checkRankUps();
  }

  function checkRankUps() {
    let safety = 0;
    while (game.status === 'playing' && game.rank < 20 && game.xp >= xpForNext() && safety < 4) {
      safety += 1;
      const requirement = xpForNext();
      game.xp -= requirement;
      game.rank += 1;
      game.score += game.rank * 40;
      game.maxHp += 3;
      game.playerHp = Math.min(game.maxHp, game.playerHp + 8);
      records.bestRank = Math.max(records.bestRank, game.rank);
      saveRecords();
      addFloater(`RANK ${game.rank}`, 92, 156, palette.gold);
      addParticles(96, 204, palette.gold, 18, 1.3);
      game.flash = 0.55;
      game.flashColor = palette.gold;
      tone(520, 0.12, 'sine', 0.04);
      if (game.rank === 5 || game.rank === 10 || game.rank === 15) {
        openChoice(Math.floor(game.rank / 5));
        return;
      }
    }
    if (game.rank >= 20) winRun();
  }

  function openChoice(tier) {
    game.status = 'choice';
    game.choiceTier = tier;
    input.queuedActions.length = 0;
    choiceControls = [];
    announce(`RANK ${game.rank} REACHED — choose a branch`, 2200);
  }

  function chooseEvolution(branch) {
    if (game.status !== 'choice' || !EVOLUTION[branch]) return;
    const tierIndex = game.choiceTier - 1;
    const delta = EVOLUTION[branch].tiers[tierIndex];
    game.path[tierIndex] = branch;
    game.stats.power += delta.power;
    game.stats.armor += delta.armor;
    game.stats.tempo += delta.tempo;
    if (branch === 'guardian') game.skills.guard += [0.08, 0.12, 0.18][tierIndex];
    if (branch === 'trickster') game.skills.crit += [0.07, 0.14, 0.22][tierIndex];
    if (branch === 'bloom') game.skills.food += [12, 22, 35][tierIndex];
    records.tree[branch] = Math.min(30, records.tree[branch] + 1);
    saveRecords();
    game.status = 'playing';
    game.lastDrop = `${EVOLUTION[branch].label} chosen • ${delta.skill}`;
    game.flash = 0.5;
    game.flashColor = EVOLUTION[branch].color;
    addParticles(195, 208, EVOLUTION[branch].color, 20, 1.4);
    tone(420 + tierIndex * 80, 0.15, 'sine', 0.04);
    checkRankUps();
  }

  function forage() {
    if (game.status !== 'playing') return;
    const roll = random();
    let kind;
    if (roll < 0.45) {
      kind = 'gear';
      const value = 1.2 + game.rank * 0.12;
      game.stats.power += value;
      game.loot.gear += 1;
      game.lastDrop = `GEAR found • +${value.toFixed(1)} power`;
      addFloater(`POWER +${value.toFixed(1)}`, 90, 478, palette.cyan);
      addParticles(90, 550, palette.cyan, 12, 1);
    } else if (roll < 0.8) {
      kind = 'food';
      const value = 8 + game.rank + game.skills.food;
      game.playerHp = Math.min(game.maxHp, game.playerHp + value);
      game.loot.food += 1;
      game.lastDrop = `FOOD found • +${value} vitality`;
      addFloater(`VITAL +${value}`, 90, 478, palette.green);
      addParticles(90, 550, palette.green, 12, 1);
    } else {
      kind = 'trinket';
      const value = 0.07 + game.rank * 0.004;
      game.stats.tempo += value;
      game.stats.fortune += 0.008;
      game.loot.trinket += 1;
      game.lastDrop = `TRINKET found • +${value.toFixed(2)} tempo, luck`;
      addFloater('TEMPO UP', 90, 478, palette.purple);
      addParticles(90, 550, palette.purple, 12, 1);
    }
    capPush(game.recentDrops, kind, MAX_DROPS);
    game.score += 12 + game.rank;
    game.flash = 0.22;
    game.flashColor = kind === 'gear' ? palette.cyan : kind === 'food' ? palette.green : palette.purple;
    tone(kind === 'trinket' ? 740 : kind === 'food' ? 480 : 580, 0.07, 'triangle', 0.03);
  }

  function foeStrike() {
    if (!game.foe || game.foe.hp <= 0) return;
    const mitigation = Math.max(0.35, 1 - game.stats.armor * 0.028 - game.skills.guard);
    const damage = game.foe.damage * mitigation;
    game.playerHp -= damage;
    game.shake = Math.min(9, game.shake + 2.2);
    addFloater(`-${Math.round(damage)}`, 100, 145, palette.coral);
    addParticles(105, 202, palette.coral, 6, 0.7);
    tone(120, 0.06, 'sawtooth', 0.018);
    if (game.playerHp <= 0) loseRun();
  }

  function update(dt) {
    if (game.status !== 'playing') return;
    game.runElapsed += dt;
    game.attackTimer -= dt;
    game.foeTimer -= dt;
    let loops = 0;
    while (game.attackTimer <= 0 && loops < 3 && game.status === 'playing') {
      attack();
      game.attackTimer += Math.max(0.34, 0.86 / (game.stats.tempo + 0.2));
      loops += 1;
    }
    loops = 0;
    while (game.foeTimer <= 0 && loops < 2 && game.status === 'playing') {
      foeStrike();
      game.foeTimer += Math.max(0.68, 1.15 - game.rank * 0.008);
      loops += 1;
    }
    if (game.foe) game.foe.hit = Math.max(0, game.foe.hit - dt);
    game.sampleTimer -= dt;
    if (game.sampleTimer <= 0) {
      game.sampleTimer += 1;
      capPush(game.history, { t: game.runElapsed, xp: game.runXp }, MAX_HISTORY);
      updateRate();
    }
    updateFx(dt);
  }

  function updateRate() {
    if (game.history.length < 2) {
      game.ratePerMin = 0;
      return;
    }
    const newest = game.history[game.history.length - 1];
    const cutoff = newest.t - 60;
    let oldest = game.history[0];
    for (let i = game.history.length - 1; i >= 0; i -= 1) {
      if (game.history[i].t <= cutoff) { oldest = game.history[i]; break; }
    }
    const seconds = Math.max(1, newest.t - oldest.t);
    game.ratePerMin = Math.max(0, (newest.xp - oldest.xp) / seconds * 60);
  }

  function loseRun() {
    if (game.status !== 'playing') return;
    game.status = 'lost';
    game.playerHp = 0;
    records.bestRank = Math.max(records.bestRank, game.rank);
    records.bestScore = Math.max(records.bestScore, Math.floor(game.score));
    saveRecords();
    clearInput();
    addParticles(104, 203, palette.coral, 20, 1.5);
    tone(90, 0.22, 'sawtooth', 0.04);
  }

  function winRun() {
    if (game.status === 'won') return;
    game.status = 'won';
    game.rank = 20;
    game.finalForm = EVOLUTION[game.path[2] || game.path[1] || game.path[0] || 'bloom'].final;
    game.score += 1000 + records.legacy * 100;
    records.bestRank = 20;
    records.bestScore = Math.max(records.bestScore, Math.floor(game.score));
    records.wins = Math.min(9999, records.wins + 1);
    records.legacy = Math.min(20, records.legacy + 1);
    saveRecords();
    clearInput();
    addParticles(195, 210, palette.gold, 35, 1.8);
    tone(520, 0.16, 'sine', 0.04);
    later(() => tone(780, 0.22, 'sine', 0.04), 130);
  }

  function isPaused() {
    return view.landscape || view.hidden || game.status !== 'playing';
  }

  function processActions() {
    if (input.queuedActions.length > 12) input.queuedActions.splice(0, input.queuedActions.length - 12);
    while (input.queuedActions.length) {
      const action = input.queuedActions.shift();
      if (action === 'restart') { resetRun(); return; }
      if (game.status === 'playing') {
        if (action === 'attack') attack();
        if (action === 'forage') forage();
      } else if (game.status === 'choice' && action.indexOf('choose-') === 0) {
        chooseEvolution(BRANCHES[Number(action.slice(7))]);
      }
    }
  }

  function queueAction(action) {
    if (input.queuedActions.length < 12) input.queuedActions.push(action);
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * W / Math.max(1, rect.width), y: (event.clientY - rect.top) * H / Math.max(1, rect.height) };
  }

  function inside(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  function hitControl(point) {
    if (game.status === 'choice') {
      for (let i = 0; i < choiceControls.length; i += 1) if (inside(point, choiceControls[i])) return `choose-${i}`;
      return '';
    }
    if (game.status === 'lost' || game.status === 'won') return inside(point, mainControls.restart) ? 'restart' : '';
    if (inside(point, mainControls.forage)) return 'forage';
    if (point.y >= 92 && point.y <= 312 && point.x >= 176) return 'attack';
    return '';
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    if (view.landscape || view.hidden) return;
    unlockAudio();
    if (input.activePointers.size >= MAX_POINTERS || input.activePointers.has(event.pointerId)) return;
    const control = hitControl(pointFromEvent(event));
    if (!control) return;
    input.activePointers.set(event.pointerId, control);
    try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* Capture is optional. */ }
  }

  function onPointerUp(event) {
    event.preventDefault();
    const control = input.activePointers.get(event.pointerId);
    input.activePointers.delete(event.pointerId);
    if (control && !view.landscape && !view.hidden) queueAction(control);
  }

  function onPointerCancel(event) {
    event.preventDefault();
    input.activePointers.delete(event.pointerId);
  }

  function onKeyDown(event) {
    if (event.code === 'Space' || event.key === '1' || event.key === '2' || event.key === '3' || event.key.toLowerCase() === 'f' || event.key.toLowerCase() === 'r') event.preventDefault();
    if (input.pressedKeys.has(event.code)) return;
    if (view.landscape || view.hidden) return;
    if (input.pressedKeys.size >= MAX_KEYS) input.pressedKeys.clear();
    input.pressedKeys.add(event.code);
    unlockAudio();
    if (event.code === 'Space') queueAction('attack');
    else if (event.key.toLowerCase() === 'f') queueAction('forage');
    else if (event.key.toLowerCase() === 'r') queueAction('restart');
    else if (event.key === '1' || event.key === '2' || event.key === '3') queueAction(`choose-${Number(event.key) - 1}`);
  }

  function onKeyUp(event) {
    input.pressedKeys.delete(event.code);
  }

  function resizeCanvas() {
    const rect = shell.getBoundingClientRect();
    const rawDpr = Math.min(2, window.devicePixelRatio || 1);
    view.dpr = Math.min(rawDpr, 960 / Math.max(1, rect.width, rect.height));
    canvas.width = Math.max(1, Math.round(rect.width * view.dpr));
    canvas.height = Math.max(1, Math.round(rect.height * view.dpr));
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    updateOrientation();
  }

  function updateOrientation() {
    const next = window.innerWidth > window.innerHeight;
    if (next !== view.landscape) clearInput();
    view.landscape = next;
    rotateOverlay.hidden = !view.landscape;
  }

  function roundedRect(x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fillPanel(x, y, w, h, color = palette.panel, stroke = palette.line, radius = 12) {
    roundedRect(x, y, w, h, radius);
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function label(value, x, y, size = 12, color = palette.paper, align = 'left', weight = 700) {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  }

  function bar(x, y, w, h, ratio, color, back = '#202d49') {
    roundedRect(x, y, w, h, h / 2);
    ctx.fillStyle = back;
    ctx.fill();
    roundedRect(x, y, w * Math.max(0, Math.min(1, ratio)), h, h / 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawBackdrop() {
    ctx.fillStyle = palette.ink;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0f1830';
    ctx.fillRect(0, 74, W, 240);
    ctx.strokeStyle = '#1c2a4a';
    ctx.lineWidth = 1;
    for (let y = 100; y < 315; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let x = -30; x < W + 30; x += 52) { ctx.beginPath(); ctx.moveTo(x, 74); ctx.lineTo(x + 74, 314); ctx.stroke(); }
    for (let i = 0; i < 18; i += 1) {
      const sx = (game.runSeed * (i + 13) % 370 + i * 9) % 370 + 10;
      const sy = 88 + ((game.runSeed >>> (i % 16)) % 210);
      ctx.fillStyle = i % 3 === 0 ? '#4c638a' : '#273a61';
      ctx.fillRect(sx, sy, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
    }
  }

  function drawHeader() {
    label('SPORELING SAGA', 16, 22, 17, palette.paper, 'left', 900);
    label(`SEED ${String(game.runSeed).slice(-4)}`, 374, 19, 9, palette.muted, 'right', 800);
    label(`RANK ${game.rank}/20`, 16, 49, 12, palette.gold, 'left', 900);
    label(`BEST ${records.bestRank}  •  LEGACY +${records.legacy * 5}%`, 374, 49, 10, palette.muted, 'right', 700);
    bar(16, 62, 358, 6, game.xp / xpForNext(), palette.gold, '#283553');
  }

  function drawSporeling(x, y, scale, final = false) {
    const pulse = Math.sin(game.runElapsed * 5) * 2;
    ctx.save();
    ctx.translate(x, y + pulse);
    ctx.fillStyle = final ? palette.gold : '#66e0d0';
    ctx.beginPath();
    ctx.ellipse(0, 20, 29 * scale, 11 * scale, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = final ? '#fff0a7' : '#baf5dd';
    ctx.beginPath();
    ctx.arc(0, -3, 22 * scale, 0, TAU);
    ctx.fill();
    ctx.fillStyle = final ? '#d99e4c' : '#347d8b';
    ctx.beginPath();
    ctx.moveTo(-28 * scale, -7 * scale);
    ctx.quadraticCurveTo(0, -40 * scale, 28 * scale, -7 * scale);
    ctx.quadraticCurveTo(0, -17 * scale, -28 * scale, -7 * scale);
    ctx.fill();
    ctx.fillStyle = palette.ink;
    ctx.beginPath(); ctx.arc(-8 * scale, -1 * scale, 3.2 * scale, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(8 * scale, -1 * scale, 3.2 * scale, 0, TAU); ctx.fill();
    ctx.strokeStyle = palette.ink; ctx.lineWidth = 2 * scale;
    ctx.beginPath(); ctx.arc(0, 5 * scale, 7 * scale, 0.1, Math.PI - 0.1); ctx.stroke();
    if (final) {
      ctx.strokeStyle = palette.gold; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -3, 34 * scale, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function drawFoe(x, y, scale) {
    if (!game.foe) return;
    const foe = game.foe;
    const bob = Math.sin(game.runElapsed * 4 + foe.bob) * 3;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = foe.color;
    if (foe.shape === 'horn') {
      ctx.beginPath(); ctx.moveTo(-29, 15); ctx.lineTo(-17, -25); ctx.lineTo(0, -10); ctx.lineTo(17, -25); ctx.lineTo(29, 15); ctx.quadraticCurveTo(0, 31, -29, 15); ctx.fill();
    } else if (foe.shape === 'hopper') {
      ctx.beginPath(); ctx.ellipse(0, 4, 28, 27, 0, 0, TAU); ctx.fill();
      ctx.fillRect(-32, 5, 12, 7); ctx.fillRect(20, 5, 12, 7);
    } else if (foe.shape === 'crawler') {
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-31, -18, 62, 40, 18) : ctx.rect(-31, -18, 62, 40); ctx.fill();
      ctx.fillRect(-34, 15, 12, 5); ctx.fillRect(-5, 15, 12, 5); ctx.fillRect(24, 15, 12, 5);
    } else if (foe.shape === 'maw') {
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
      ctx.fillStyle = palette.ink; ctx.beginPath(); ctx.ellipse(0, 7, 18, 10, 0, 0, TAU); ctx.fill();
    } else if (foe.shape === 'reed') {
      ctx.beginPath(); ctx.moveTo(-25, 20); ctx.quadraticCurveTo(-22, -25, -5, -30); ctx.quadraticCurveTo(5, -5, 25, -22); ctx.lineTo(18, 22); ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, 29, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = palette.ink;
    ctx.beginPath(); ctx.arc(-9, -2, 3.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(9, -2, 3.5, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawCombat() {
    label('YOUR SPORELING', 16, 94, 10, palette.muted, 'left', 800);
    label(game.foe ? game.foe.name.toUpperCase() : 'FOE', 374, 94, 10, palette.muted, 'right', 800);
    drawSporeling(104, 198, 1.05, false);
    drawFoe(282, 198, 1);
    bar(42, 244, 124, 8, game.playerHp / game.maxHp, palette.cyan);
    bar(224, 244, 124, 8, game.foe ? game.foe.hp / game.foe.maxHp : 0, palette.coral);
    label(`${Math.max(0, Math.ceil(game.playerHp))}/${Math.ceil(game.maxHp)}`, 104, 264, 10, palette.cyan, 'center', 800);
    label(game.foe ? `${Math.max(0, Math.ceil(game.foe.hp))}/${game.foe.maxHp}` : '0/0', 282, 264, 10, palette.coral, 'center', 800);
    ctx.strokeStyle = '#355179'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(166, 207); ctx.lineTo(216, 207); ctx.stroke();
    label('AUTO-FIGHT LANE', 195, 288, 10, palette.muted, 'center', 800);
    label('TAP FOE TO STRIKE  •  SPACE STRIKES  •  F FORAGES', 195, 324, 9, palette.gold, 'center', 800);
    for (const f of game.floaters) {
      label(f.text, f.x, f.y, 11, f.color, 'center', 900);
    }
    for (const p of game.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawChart(x, y, w, h) {
    ctx.strokeStyle = '#314364'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke();
    if (game.history.length < 2) {
      ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x, y + h - 2); ctx.lineTo(x + w, y + h - 2); ctx.stroke(); ctx.setLineDash([]);
      label('collecting live data', x + w / 2, y + h / 2, 8, palette.muted, 'center', 700);
      return;
    }
    const start = game.history[0].t;
    const end = game.history[game.history.length - 1].t;
    const span = Math.max(1, end - start);
    const minXp = game.history.reduce((m, point) => Math.min(m, point.xp), game.history[0].xp);
    const maxXp = game.history.reduce((m, point) => Math.max(m, point.xp), game.history[0].xp);
    const range = Math.max(1, maxXp - minXp);
    ctx.strokeStyle = palette.gold; ctx.lineWidth = 2; ctx.beginPath();
    game.history.forEach((point, index) => {
      const px = x + ((point.t - start) / span) * w;
      const py = y + h - ((point.xp - minXp) / range) * (h - 4) - 2;
      if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  function drawEconomy() {
    fillPanel(16, 345, 358, 157, palette.panel, palette.line, 12);
    label('PLAY ECONOMY', 28, 364, 11, palette.paper, 'left', 900);
    label('EVERYTHING IS EARNED IN-RUN', 362, 364, 8, palette.muted, 'right', 800);
    label(`NEXT RANK  ${Math.max(0, Math.ceil(xpForNext() - game.xp))} XP`, 28, 388, 12, palette.gold, 'left', 900);
    label(`SCORE  ${Math.floor(game.score)}`, 28, 408, 10, palette.paper, 'left', 800);
    label(`FORAGE  GEAR 45%  •  FOOD 35%  •  TRINKET 20%`, 28, 427, 8, palette.muted, 'left', 700);
    label(`POWER ${game.stats.power.toFixed(1)}   ARM ${game.stats.armor.toFixed(1)}   TEMPO ${game.stats.tempo.toFixed(2)}`, 28, 445, 9, palette.paper, 'left', 800);
    label(`DROPS  ${game.loot.gear}G  ${game.loot.food}F  ${game.loot.trinket}T`, 28, 463, 9, palette.muted, 'left', 800);
    label('XP / MIN  •  LAST 60 SEC', 198, 385, 9, palette.cyan, 'left', 900);
    label(`${Math.round(game.ratePerMin)} XP`, 362, 385, 9, palette.cyan, 'right', 900);
    drawChart(198, 397, 164, 50);
    label(game.notice || game.lastDrop, 195, 487, 9, game.notice ? palette.gold : palette.muted, 'center', 800);
  }

  function drawButton(rect, title, subtitle, color) {
    fillPanel(rect.x, rect.y, rect.w, rect.h, '#1d2c4b', color, 12);
    label(title, rect.x + rect.w / 2, rect.y + 23, 16, color, 'center', 900);
    label(subtitle, rect.x + rect.w / 2, rect.y + 45, 9, palette.paper, 'center', 700);
  }

  function drawTree() {
    label('EVOLUTION TREE', 16, 613, 9, palette.muted, 'left', 900);
    label(`WINS ${records.wins}`, 374, 613, 9, palette.muted, 'right', 800);
    const xs = [78, 158, 238, 318];
    ctx.strokeStyle = '#35486e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xs[0], 642); ctx.lineTo(xs[3], 642); ctx.stroke();
    [0, 1, 2, 3].forEach((index) => {
      const current = game.path[index - 1];
      const active = index === 0 || current;
      ctx.fillStyle = index === 3 && game.status === 'won' ? palette.gold : active ? (current ? EVOLUTION[current].color : palette.gold) : '#30415f';
      ctx.beginPath(); ctx.arc(xs[index], 642, 12, 0, TAU); ctx.fill();
      label(index === 0 ? '1' : index === 3 ? '20' : String(index * 5), xs[index], 642, 9, palette.ink, 'center', 900);
    });
    [0, 1, 2].forEach((index) => {
      const branch = game.path[index];
      label(branch ? EVOLUTION[branch].label[0] : '·', xs[index + 1], 664, 9, branch ? EVOLUTION[branch].color : palette.muted, 'center', 900);
    });
  }

  function drawPlay() {
    drawBackdrop();
    drawHeader();
    drawCombat();
    drawEconomy();
    drawButton(mainControls.forage, 'FORAGE PICK', 'ROLL A FREE GEAR / FOOD / TRINKET DROP', palette.green);
    drawTree();
    if (game.flash > 0) {
      ctx.globalAlpha = game.flash * 0.16;
      ctx.fillStyle = game.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  function drawChoice() {
    ctx.fillStyle = 'rgba(5, 8, 18, 0.88)'; ctx.fillRect(0, 0, W, H);
    fillPanel(12, 55, 366, 584, '#111b32', '#435d89', 16);
    label(`RANK ${game.rank} EVOLUTION`, 195, 86, 19, palette.gold, 'center', 900);
    label('Choose one branch. The stat delta is permanent this run.', 195, 111, 10, palette.muted, 'center', 700);
    choiceControls = [];
    BRANCHES.forEach((branch, index) => {
      const y = 133 + index * 145;
      const rect = { x: 24, y, w: 342, h: 125 };
      choiceControls.push(rect);
      const path = EVOLUTION[branch];
      const delta = path.tiers[game.choiceTier - 1];
      fillPanel(rect.x, rect.y, rect.w, rect.h, '#1a2948', path.color, 12);
      label(`${index + 1}`, 45, y + 27, 14, palette.ink, 'center', 900);
      ctx.fillStyle = path.color; ctx.beginPath(); ctx.arc(45, y + 27, 16, 0, TAU); ctx.fill();
      label(`${index + 1}`, 45, y + 27, 13, palette.ink, 'center', 900);
      label(path.label, 70, y + 25, 15, path.color, 'left', 900);
      label(`+${delta.power} PWR   +${delta.armor} ARM   +${delta.tempo.toFixed(2)} TEMPO`, 70, y + 51, 10, palette.paper, 'left', 800);
      label(delta.skill, 70, y + 74, 10, palette.muted, 'left', 700);
      label(`TREE UNLOCKS  ${records.tree[branch]}`, 70, y + 99, 9, '#6e83a9', 'left', 800);
    });
    label('TAP A CARD  •  KEYS 1 / 2 / 3', 195, 615, 10, palette.gold, 'center', 900);
  }

  function drawEnd() {
    ctx.fillStyle = 'rgba(5, 8, 18, 0.86)'; ctx.fillRect(0, 0, W, H);
    fillPanel(20, 138, 350, 365, '#121d35', game.status === 'won' ? palette.gold : palette.coral, 18);
    if (game.status === 'won') {
      drawSporeling(195, 209, 1.25, true);
      label('SAGA COMPLETE', 195, 290, 24, palette.gold, 'center', 900);
      label(game.finalForm.toUpperCase(), 195, 317, 13, palette.paper, 'center', 900);
      label('Rank 20 reached. A new seed carries your legacy.', 195, 349, 10, palette.muted, 'center', 700);
      label(`SCORE ${Math.floor(game.score)}   •   LEGACY +${records.legacy * 5}%`, 195, 378, 11, palette.paper, 'center', 800);
      label(`BEST SCORE ${records.bestScore}`, 195, 402, 10, palette.muted, 'center', 700);
      drawButton(mainControls.restart, 'NEW SEED RERUN', 'KEEP YOUR LEGACY BONUS • INSTANT START', palette.gold);
    } else {
      drawSporeling(104, 209, 1.15, false);
      label('THE SPORELING FELL', 195, 290, 22, palette.coral, 'center', 900);
      label(`Rank ${game.rank}  •  Score ${Math.floor(game.score)}`, 195, 322, 12, palette.paper, 'center', 800);
      label('The lane resets. Your best rank is kept.', 195, 352, 10, palette.muted, 'center', 700);
      label(`BEST RANK ${records.bestRank}  •  BEST SCORE ${records.bestScore}`, 195, 380, 10, palette.muted, 'center', 800);
      drawButton(mainControls.restart, 'RESTART RUN', 'CLEAR INPUT • FRESH SEED • NO WAIT', palette.coral);
    }
  }

  function draw() {
    const shakeX = game.shake ? (random() - 0.5) * game.shake : 0;
    const shakeY = game.shake ? (random() - 0.5) * game.shake : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawPlay();
    if (game.status === 'choice') drawChoice();
    if (game.status === 'lost' || game.status === 'won') drawEnd();
    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (view.landscape || view.hidden) {
      lastFrame = now;
      // A rotate overlay is a hard simulation pause: no physics, timers, spawns, or particles advance.
    } else {
      // Input still resolves while a choice or end screen is visible; only the run simulation pauses.
      processActions();
      if (game.status === 'playing') update(dt);
      else updateFx(Math.min(dt, 0.033));
    }
    draw();
    window.requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  canvas.addEventListener('pointercancel', onPointerCancel, { passive: false });
  canvas.addEventListener('pointerleave', () => { /* Pointer capture/up owns the control. */ }, { passive: true });
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp, { passive: false });
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => {
    view.hidden = document.hidden;
    if (view.hidden) clearInput();
  });
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', resizeCanvas);

  resetRun();
  resizeCanvas();
  window.requestAnimationFrame(frame);
})();
