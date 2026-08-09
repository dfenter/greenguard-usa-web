(() => {
  'use strict';

  const DESIGN_W = 390;
  const DESIGN_H = 700;
  const MAP_TOP = 91;
  const MAP_BOTTOM = 584;
  const CORE_ID = 'core';
  const STORAGE_KEY = 'verge-protocol-best-v1';
  const MAX_ENEMIES = 140;
  const MAX_PROJECTILES = 120;
  const MAX_PARTICLES = 260;
  const MAX_SCRAP = 80;
  const MAX_FX = 120;
  const MAX_POINTERS = 16;
  const MAX_TIMERS = 32;
  const TRACKED_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '1', '2', '3', '4', 'b', 'r', 'enter', ' ']);

  const canvas = document.getElementById('gameCanvas');
  const rotateOverlay = document.getElementById('rotateOverlay');
  const srStatus = document.getElementById('srStatus');
  const ctx = canvas.getContext('2d', { alpha: false });

  const NODE_DATA = {
    core: { x: 195, y: 548, kind: 'core' },
    l0: { x: 35, y: 108, kind: 'spawn' }, l1: { x: 63, y: 202 }, ls: { x: 99, y: 305, kind: 'split' },
    la: { x: 127, y: 425 }, lb: { x: 177, y: 385 },
    c0: { x: 195, y: 108, kind: 'spawn' }, c1: { x: 195, y: 206 }, cs: { x: 195, y: 311, kind: 'split' },
    ca: { x: 148, y: 432 }, cb: { x: 242, y: 432 },
    r0: { x: 355, y: 108, kind: 'spawn' }, r1: { x: 327, y: 202 }, rs: { x: 291, y: 305, kind: 'split' },
    ra: { x: 263, y: 425 }, rb: { x: 213, y: 385 }
  };

  const EDGES = [
    ['l0', 'l1'], ['l1', 'ls'], ['ls', 'la'], ['ls', 'lb'], ['la', 'core'], ['lb', 'core'],
    ['c0', 'c1'], ['c1', 'cs'], ['cs', 'ca'], ['cs', 'cb'], ['ca', 'core'], ['cb', 'core'],
    ['r0', 'r1'], ['r1', 'rs'], ['rs', 'ra'], ['rs', 'rb'], ['ra', 'core'], ['rb', 'core']
  ];
  const SPLITS = {
    ls: { branches: ['la', 'lb'], label: 'L' },
    cs: { branches: ['ca', 'cb'], label: 'C' },
    rs: { branches: ['ra', 'rb'], label: 'R' }
  };
  const LANE_SPAWNS = { left: 'l0', center: 'c0', right: 'r0' };
  const BUILD_NODES = ['l1', 'ls', 'la', 'lb', 'c1', 'cs', 'ca', 'cb', 'r1', 'rs', 'ra', 'rb'];

  const TURRETS = {
    gun: { key: '1', short: 'G', name: 'GUN', color: '#f4c86b', cost: 5, range: 105 },
    slow: { key: '2', short: 'S', name: 'SLOW', color: '#72d6ff', cost: 7, range: 68 },
    mortar: { key: '3', short: 'M', name: 'MORTAR', color: '#ff9d72', cost: 10, range: 145 },
    tesla: { key: '4', short: 'T', name: 'TESLA', color: '#cf9aff', cost: 12, range: 94 }
  };
  const TURRET_KEYS = ['gun', 'slow', 'mortar', 'tesla'];
  const ENEMY_TYPES = {
    shambler: { name: 'WALKER', short: 'W', hp: 34, speed: 34, radius: 10, reward: 1, color: '#a2c79e', damage: 7 },
    runner: { name: 'RUSHER', short: 'R', hp: 21, speed: 66, radius: 8, reward: 1, color: '#f0c96f', damage: 5 },
    brute: { name: 'BRUTE', short: 'B', hp: 112, speed: 18, radius: 15, reward: 3, color: '#ef866e', damage: 15 },
    splitter: { name: 'SPLITTER', short: 'P', hp: 61, speed: 28, radius: 12, reward: 2, color: '#d59be8', damage: 9 },
    carrier: { name: 'CARRIER', short: 'C', hp: 77, speed: 22, radius: 13, reward: 4, color: '#7ed8c4', damage: 12 }
  };

  const TECHS = [
    { id: 'overclock', name: 'OVERCLOCK', copy: 'All turrets fire 14% faster.', color: '#f4c86b' },
    { id: 'reinforced', name: 'REINFORCED', copy: '+35 core integrity and repair 20.', color: '#8ce3c4' },
    { id: 'salvage', name: 'SALVAGE RIG', copy: 'Enemies drop one extra scrap.', color: '#ffad72' },
    { id: 'kinetic', name: 'KINETIC ROUNDS', copy: 'Rook deals 28% more damage.', color: '#cf9aff' },
    { id: 'relay', name: 'RELAY LINK', copy: 'Rook auto-fires 22% faster.', color: '#72d6ff' },
    { id: 'wideband', name: 'WIDEBAND', copy: 'Slow and mortar fields gain 18% range.', color: '#9fe2ff' }
  ];

  const neighbors = Object.create(null);
  for (const id of Object.keys(NODE_DATA)) neighbors[id] = [];
  for (const [a, b] of EDGES) {
    neighbors[a].push(b);
    neighbors[b].push(a);
  }

  const viewport = { scale: 1, ox: 0, oy: 0, cssW: DESIGN_W, cssH: DESIGN_H, pixelScale: 1 };
  const input = {
    pointers: new Map(),
    stickPointerId: null,
    stick: { x: 0, y: 0 },
    keys: new Set(),
    queue: [],
    selectedType: 'gun',
    mode: 'turret'
  };
  const pendingTimers = new Set();
  let state;
  let orientationPaused = false;
  let lastFrame = performance.now();
  let audioContext = null;
  let audioReady = false;

  function safeLoadBest() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (typeof raw !== 'string' || raw.length > 80) return 0;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Number.isSafeInteger(parsed.best) || parsed.best < 0 || parsed.best > 1000000000) return 0;
      return parsed.best;
    } catch (_) {
      return 0;
    }
  }

  function safeSaveBest(score) {
    try {
      if (Number.isSafeInteger(score) && score >= 0 && score <= 1000000000) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ best: score }));
      }
    } catch (_) {}
  }

  function schedule(fn, delay) {
    if (pendingTimers.size >= MAX_TIMERS) return null;
    const id = setTimeout(() => {
      pendingTimers.delete(id);
      fn();
    }, delay);
    pendingTimers.add(id);
    return id;
  }

  function cancelPendingTimers() {
    for (const id of pendingTimers) clearTimeout(id);
    pendingTimers.clear();
  }

  function clearInput() {
    for (const id of input.pointers.keys()) {
      try { canvas.releasePointerCapture(id); } catch (_) {}
    }
    input.pointers.clear();
    input.stickPointerId = null;
    input.stick.x = 0;
    input.stick.y = 0;
    input.keys.clear();
    input.queue.length = 0;
  }

  function makeState(showStart) {
    return {
      phase: showStart ? 'start' : 'playing',
      wave: 0,
      wavePlan: null,
      spawnQueue: [],
      spawnTimer: 0,
      waveStartedAt: 0,
      waveCleared: false,
      score: 0,
      best: safeLoadBest(),
      kills: 0,
      scrap: 16,
      coreHp: 100,
      coreMax: 100,
      enemies: [],
      projectiles: [],
      particles: [],
      scraps: [],
      fx: [],
      nextId: 1,
      hero: { x: 195, y: 500, fire: .25, facing: -Math.PI / 2 },
      nodes: Object.fromEntries(BUILD_NODES.map(id => [id, { id, turret: null }])),
      barriers: { ls: false, cs: false, rs: false },
      tech: { fireMult: 1, coreBonus: 0, rewardBonus: 0, heroDamage: 1, heroRate: 1, field: 1 },
      techChoices: [],
      notice: '',
      noticeTime: 0,
      shake: 0,
      flash: 0,
      elapsed: 0
    };
  }

  function resetGame(showStart) {
    cancelPendingTimers();
    clearInput();
    state = makeState(showStart);
    input.selectedType = 'gun';
    input.mode = 'turret';
    if (!showStart) startWave(1);
  }

  function edgeKey(a, b) { return a < b ? `${a}~${b}` : `${b}~${a}`; }

  function isBlocked(a, b) {
    for (const splitId of Object.keys(SPLITS)) {
      const split = SPLITS[splitId];
      if (state.barriers[splitId] && edgeKey(a, b) === edgeKey(splitId, split.branches[0])) return true;
    }
    return false;
  }

  function findRoute(start) {
    if (start === CORE_ID) return [CORE_ID];
    const queue = [start];
    const previous = Object.create(null);
    previous[start] = null;
    while (queue.length) {
      const current = queue.shift();
      if (current === CORE_ID) break;
      for (const next of neighbors[current]) {
        if (isBlocked(current, next) || Object.prototype.hasOwnProperty.call(previous, next)) continue;
        previous[next] = current;
        queue.push(next);
      }
    }
    if (!Object.prototype.hasOwnProperty.call(previous, CORE_ID)) return [start, CORE_ID];
    const path = [];
    let node = CORE_ID;
    while (node !== null) { path.unshift(node); node = previous[node]; }
    return path;
  }

  function createWavePlan(wave) {
    const counts = {
      shambler: Math.min(7 + Math.floor(wave * .76), 26),
      runner: wave >= 2 ? Math.min(1 + Math.floor(wave / 3), 9) : 0,
      brute: wave >= 4 ? Math.min(1 + Math.floor((wave - 4) / 5), 5) : 0,
      splitter: wave >= 8 ? Math.min(1 + Math.floor((wave - 8) / 5), 4) : 0,
      carrier: wave >= 14 ? Math.min(1 + Math.floor((wave - 14) / 5), 3) : 0
    };
    const labels = [];
    for (const type of Object.keys(counts)) if (counts[type]) labels.push({ type, count: counts[type] });
    return { wave, counts, labels, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
  }

  function seededShuffle(items, seed) {
    let value = (seed * 1103515245 + 12345) >>> 0;
    for (let i = items.length - 1; i > 0; i--) {
      value = (value * 1664525 + 1013904223) >>> 0;
      const j = value % (i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function startWave(wave) {
    state.wave = wave;
    state.wavePlan = createWavePlan(wave);
    const types = [];
    for (const entry of state.wavePlan.labels) {
      for (let i = 0; i < entry.count; i++) types.push(entry.type);
    }
    seededShuffle(types, wave * 47 + 9);
    state.spawnQueue = types.map((type, index) => ({ type, lane: ['left', 'center', 'right'][index % 3], delay: index === 0 ? .65 : .42 + (type === 'brute' ? .12 : 0) }));
    state.spawnTimer = .2;
    state.waveStartedAt = state.elapsed;
    state.waveCleared = false;
    state.phase = 'playing';
    notify(`WAVE ${String(wave).padStart(2, '0')} INBOUND`);
    tone(220, .06, 'square');
    announce(`Wave ${wave} inbound. ${state.wavePlan.total} hostiles.`, false);
  }

  function beginGame() {
    resetGame(false);
    tone(330, .1, 'sine');
    announce('Wave 1 started. Tap a node to deploy a turret.', false);
  }

  function restartGame() {
    resetGame(false);
    tone(260, .08, 'square');
    announce('New run started.', false);
  }

  function finishWave() {
    if (state.waveCleared) return;
    state.waveCleared = true;
    state.scrap = Math.min(99, state.scrap + 3 + Math.floor(state.wave / 5));
    state.score += state.wave * 40;
    if (state.score > state.best) { state.best = state.score; safeSaveBest(state.best); }
    if (state.wave >= 25) {
      state.phase = 'win';
      state.flash = .8;
      addBurst(195, 385, '#8ce3c4', 42);
      tone(660, .14, 'sine');
      schedule(() => tone(880, .16, 'sine'), 120);
      announce(`Protocol complete. Score ${state.score}.`, true);
      return;
    }
    state.techChoices = pickTechChoices(state.wave);
    state.phase = 'between';
    tone(440, .1, 'triangle');
    announce(`Wave ${state.wave} clear. Choose one upgrade.`, false);
  }

  function finishLoss() {
    if (state.phase === 'over' || state.phase === 'win') return;
    state.phase = 'over';
    if (state.score > state.best) { state.best = state.score; safeSaveBest(state.best); }
    state.flash = .9;
    addBurst(NODE_DATA.core.x, NODE_DATA.core.y, '#ff766a', 40);
    tone(110, .22, 'sawtooth');
    announce(`Core breached on wave ${state.wave}. Score ${state.score}.`, true);
  }

  function pickTechChoices(wave) {
    const first = TECHS[(wave * 2 + state.kills) % TECHS.length];
    let second = TECHS[(wave * 3 + state.scrap + 1) % TECHS.length];
    if (second.id === first.id) second = TECHS[(TECHS.indexOf(second) + 1) % TECHS.length];
    return [first, second];
  }

  function applyTech(tech) {
    switch (tech.id) {
      case 'overclock': state.tech.fireMult *= 1.14; break;
      case 'reinforced': state.tech.coreBonus += 35; state.coreMax += 35; state.coreHp = Math.min(state.coreMax, state.coreHp + 20); break;
      case 'salvage': state.tech.rewardBonus += 1; break;
      case 'kinetic': state.tech.heroDamage *= 1.28; break;
      case 'relay': state.tech.heroRate *= 1.22; break;
      case 'wideband': state.tech.field *= 1.18; break;
    }
    state.score += state.wave * 12;
    notify(`${tech.name} ONLINE`);
    tone(520, .08, 'triangle');
    startWave(state.wave + 1);
  }

  function notify(message) {
    state.notice = message;
    state.noticeTime = 2.2;
  }

  function announce(message, important) {
    srStatus.textContent = message;
    if (important) srStatus.dataset.important = 'true';
  }

  function unlockAudio() {
    if (audioReady) {
      if (audioContext && audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      return;
    }
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audioContext = new AudioCtor();
      audioReady = true;
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch (_) {
      audioContext = null;
    }
  }

  function tone(frequency, duration, wave) {
    if (!audioReady || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = wave || 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.045, now + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + .02);
    } catch (_) {}
  }

  function addParticle(x, y, color, count) {
    if (state.particles.length >= MAX_PARTICLES) return;
    const amount = Math.min(count || 1, MAX_PARTICLES - state.particles.length);
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 18 + Math.random() * 86;
      state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 22, life: .35 + Math.random() * .45, max: .8, size: 1.5 + Math.random() * 2.5, color });
    }
  }

  function addBurst(x, y, color, count) {
    addParticle(x, y, color, count);
    if (state.fx.length < MAX_FX) state.fx.push({ type: 'ring', x, y, radius: 4, life: .46, color });
  }

  function addZap(a, b, color) {
    if (state.fx.length < MAX_FX) state.fx.push({ type: 'zap', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, life: .16, color });
  }

  function spawnEnemy(type, lane, startNode) {
    if (state.enemies.length >= MAX_ENEMIES) return;
    const data = ENEMY_TYPES[type];
    const currentNode = startNode || LANE_SPAWNS[lane];
    const path = findRoute(currentNode);
    if (!data || path.length < 2) return;
    const point = NODE_DATA[currentNode];
    state.enemies.push({
      id: state.nextId++, type, lane, x: point.x, y: point.y, currentNode, path, pathIndex: 1,
      toNode: path[1], hp: data.hp * (1 + Math.max(0, state.wave - 1) * .018), maxHp: data.hp * (1 + Math.max(0, state.wave - 1) * .018),
      speed: data.speed, radius: data.radius, slow: 1, hit: 0, dead: false
    });
  }

  function repath(enemy) {
    const path = findRoute(enemy.currentNode);
    if (path.length < 2) return false;
    enemy.path = path;
    enemy.pathIndex = 1;
    enemy.toNode = path[1];
    return true;
  }

  function enemyDistanceToCore(enemy) {
    const target = NODE_DATA[enemy.toNode];
    if (!target) return 0;
    let total = Math.hypot(target.x - enemy.x, target.y - enemy.y);
    for (let i = enemy.pathIndex; i < enemy.path.length - 1; i++) {
      const a = NODE_DATA[enemy.path[i]];
      const b = NODE_DATA[enemy.path[i + 1]];
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return total;
  }

  function updateEnemy(enemy, dt) {
    enemy.hit = Math.max(0, enemy.hit - dt);
    enemy.slow = 1;
    for (const nodeId of BUILD_NODES) {
      const turret = state.nodes[nodeId].turret;
      if (!turret || turret.type !== 'slow') continue;
      const node = NODE_DATA[nodeId];
      const range = TURRETS.slow.range * state.tech.field + turret.level * 5;
      if (Math.hypot(enemy.x - node.x, enemy.y - node.y) <= range) enemy.slow = Math.min(enemy.slow, Math.max(.42, 1 - .22 * Math.min(3, 1 + turret.level * .12)));
    }
    let remaining = enemy.speed * enemy.slow * dt;
    let hops = 0;
    while (remaining > 0 && hops < 4) {
      const target = NODE_DATA[enemy.toNode];
      if (!target) return false;
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= remaining) {
        enemy.x = target.x;
        enemy.y = target.y;
        remaining -= distance;
        enemy.currentNode = enemy.toNode;
        if (enemy.currentNode === CORE_ID) return damageCore(enemy);
        if (!repath(enemy)) return false;
        hops++;
      } else {
        enemy.x += dx / distance * remaining;
        enemy.y += dy / distance * remaining;
        remaining = 0;
      }
    }
    return true;
  }

  function damageCore(enemy) {
    state.coreHp = Math.max(0, state.coreHp - ENEMY_TYPES[enemy.type].damage);
    state.shake = Math.max(state.shake, 8);
    state.flash = .24;
    addBurst(NODE_DATA.core.x, NODE_DATA.core.y, '#ff766a', 9);
    tone(86, .04, 'sawtooth');
    if (state.coreHp <= 0) finishLoss();
    return false;
  }

  function killEnemy(enemy, source) {
    if (!enemy || enemy.dead) return;
    enemy.dead = true;
    const data = ENEMY_TYPES[enemy.type];
    state.kills++;
    state.score += 8 + (source === 'hero' ? 2 : 0);
    const drops = Math.min(3, data.reward + state.tech.rewardBonus);
    for (let i = 0; i < drops; i++) {
      if (state.scraps.length >= MAX_SCRAP) break;
      state.scraps.push({ x: enemy.x + (Math.random() - .5) * 12, y: enemy.y + (Math.random() - .5) * 12, value: 1, spin: Math.random() * 6.28, life: 18 });
    }
    addBurst(enemy.x, enemy.y, data.color, enemy.type === 'brute' ? 16 : 8);
    if (enemy.type === 'splitter' && state.enemies.length < MAX_ENEMIES - 2 && enemy.currentNode !== CORE_ID) {
      spawnEnemy('runner', enemy.lane, enemy.currentNode);
      spawnEnemy('runner', enemy.lane, enemy.currentNode);
    }
    tone(source === 'hero' ? 520 : 310, .025, 'square');
  }

  function damageEnemy(enemy, amount, source) {
    if (!enemy || enemy.dead) return;
    enemy.hp -= amount;
    enemy.hit = .11;
    if (enemy.hp <= 0) killEnemy(enemy, source);
  }

  function nearestEnemy(x, y, range) {
    let found = null;
    let best = Infinity;
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const distance = Math.hypot(enemy.x - x, enemy.y - y);
      if (distance <= range && distance < best) { best = distance; found = enemy; }
    }
    return found;
  }

  function fireProjectile(x, y, target, damage, speed, color, aoe, radius, source) {
    if (!target || state.projectiles.length >= MAX_PROJECTILES) return;
    state.projectiles.push({ x, y, target, damage, speed, color, aoe: aoe || 0, radius: radius || 0, source: source || 'turret', life: 4 });
  }

  function updateTurrets(dt) {
    for (const nodeId of BUILD_NODES) {
      const mounted = state.nodes[nodeId].turret;
      if (!mounted) continue;
      mounted.cooldown -= dt;
      const node = NODE_DATA[nodeId];
      const spec = TURRETS[mounted.type];
      const range = spec.range * (mounted.type === 'slow' || mounted.type === 'mortar' ? state.tech.field : 1) + mounted.level * 5;
      if (mounted.type === 'slow') continue;
      if (mounted.cooldown > 0) continue;
      const target = nearestEnemy(node.x, node.y, range);
      if (!target) continue;
      if (mounted.type === 'gun') {
        fireProjectile(node.x, node.y, target, 12 + mounted.level * 7, 310, spec.color, 0, 0, 'turret');
        mounted.cooldown = .48 / state.tech.fireMult;
      } else if (mounted.type === 'mortar') {
        fireProjectile(node.x, node.y, target, 26 + mounted.level * 10, 172, spec.color, 1, 30 + mounted.level * 6, 'turret');
        mounted.cooldown = 1.48 / state.tech.fireMult;
      } else if (mounted.type === 'tesla') {
        const chain = [target];
        for (const other of state.enemies) {
          if (other.dead || other === target || chain.length >= 3) continue;
          if (Math.hypot(other.x - target.x, other.y - target.y) < 53 + mounted.level * 4) chain.push(other);
        }
        let previous = { x: node.x, y: node.y };
        for (const victim of chain) {
          damageEnemy(victim, 10 + mounted.level * 5, 'turret');
          addZap(previous, victim, spec.color);
          previous = victim;
        }
        mounted.cooldown = .86 / state.tech.fireMult;
        state.flash = Math.max(state.flash, .04);
      }
    }
  }

  function updateProjectiles(dt) {
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const shot = state.projectiles[i];
      shot.life -= dt;
      if (shot.life <= 0 || !shot.target || shot.target.dead) { state.projectiles.splice(i, 1); continue; }
      const dx = shot.target.x - shot.x;
      const dy = shot.target.y - shot.y;
      const distance = Math.hypot(dx, dy);
      const step = shot.speed * dt;
      if (distance <= step + 2) {
        shot.x = shot.target.x;
        shot.y = shot.target.y;
        if (shot.aoe) {
          addBurst(shot.x, shot.y, shot.color, 7);
          for (const enemy of state.enemies) {
            if (!enemy.dead && Math.hypot(enemy.x - shot.x, enemy.y - shot.y) <= shot.radius) damageEnemy(enemy, shot.damage, shot.source);
          }
        } else {
          damageEnemy(shot.target, shot.damage, shot.source);
          addParticle(shot.x, shot.y, shot.color, 3);
        }
        state.projectiles.splice(i, 1);
      } else {
        shot.x += dx / distance * step;
        shot.y += dy / distance * step;
      }
    }
  }

  function updateHero(dt) {
    const hero = state.hero;
    let x = (input.keys.has('d') || input.keys.has('arrowright') ? 1 : 0) - (input.keys.has('a') || input.keys.has('arrowleft') ? 1 : 0) + input.stick.x;
    let y = (input.keys.has('s') || input.keys.has('arrowdown') ? 1 : 0) - (input.keys.has('w') || input.keys.has('arrowup') ? 1 : 0) + input.stick.y;
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) { x /= magnitude; y /= magnitude; }
    const speed = 148;
    hero.x = Math.max(22, Math.min(368, hero.x + x * speed * dt));
    hero.y = Math.max(MAP_TOP + 20, Math.min(535, hero.y + y * speed * dt));
    if (magnitude > .08) hero.facing = Math.atan2(y, x);
    hero.fire -= dt;
    if (hero.fire <= 0) {
      const target = nearestEnemy(hero.x, hero.y, 158);
      if (target) {
        fireProjectile(hero.x, hero.y, target, 15 * state.tech.heroDamage, 350, '#8ce3c4', 0, 0, 'hero');
        hero.facing = Math.atan2(target.y - hero.y, target.x - hero.x);
        hero.fire = .3 / state.tech.heroRate;
      } else hero.fire = .08;
    }
    for (let i = state.scraps.length - 1; i >= 0; i--) {
      const scrap = state.scraps[i];
      scrap.life -= dt;
      scrap.spin += dt * 4;
      const distance = Math.hypot(scrap.x - hero.x, scrap.y - hero.y);
      if (distance < 28) {
        state.scrap = Math.min(99, state.scrap + scrap.value);
        state.score += 2;
        addParticle(scrap.x, scrap.y, '#f4c86b', 4);
        state.scraps.splice(i, 1);
      } else if (scrap.life <= 0) state.scraps.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const particle = state.particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 72 * dt;
      if (particle.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.fx.length - 1; i >= 0; i--) {
      const effect = state.fx[i];
      effect.life -= dt;
      if (effect.type === 'ring') effect.radius += 110 * dt;
      if (effect.life <= 0) state.fx.splice(i, 1);
    }
  }

  function update(dt) {
    state.elapsed += dt;
    state.noticeTime = Math.max(0, state.noticeTime - dt);
    state.shake = Math.max(0, state.shake - dt * 18);
    state.flash = Math.max(0, state.flash - dt * 1.8);
    if (state.phase === 'playing') {
      state.spawnTimer -= dt;
      while (state.spawnQueue.length && state.spawnTimer <= 0) {
        const next = state.spawnQueue.shift();
        spawnEnemy(next.type, next.lane);
        state.spawnTimer += next.delay;
        if (state.spawnQueue.length > MAX_ENEMIES) state.spawnQueue.length = MAX_ENEMIES;
      }
      updateHero(dt);
      updateTurrets(dt);
      updateProjectiles(dt);
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const enemy = state.enemies[i];
        if (enemy.dead || !updateEnemy(enemy, dt)) state.enemies.splice(i, 1);
      }
      if (!state.spawnQueue.length && !state.enemies.length) finishWave();
    }
    updateParticles(dt);
  }

  function processQueue() {
    if (orientationPaused || document.hidden || !input.queue.length) return;
    while (input.queue.length) {
      const action = input.queue.shift();
      if (action.kind === 'start' && state.phase === 'start') beginGame();
      else if (action.kind === 'restart' && (state.phase === 'over' || state.phase === 'win')) restartGame();
      else if (action.kind === 'select' && state.phase === 'playing') { input.selectedType = action.type; input.mode = 'turret'; notify(`${TURRETS[action.type].name} SELECTED`); }
      else if (action.kind === 'barrier' && state.phase === 'playing') { input.mode = 'barrier'; notify('BARRIER MODE: tap a split node'); }
      else if (action.kind === 'node' && state.phase === 'playing') handleNodeAction(action.id);
      else if (action.kind === 'tech' && state.phase === 'between') chooseTech(action.index);
      else if (action.kind === 'button' && state.phase === 'playing') handleButtonAction(action.id);
    }
  }

  function handleButtonAction(id) {
    if (id === 'barrier') { input.mode = 'barrier'; notify('BARRIER MODE: tap a split node'); return; }
    if (TURRETS[id]) { input.selectedType = id; input.mode = 'turret'; notify(`${TURRETS[id].name} SELECTED`); }
  }

  function chooseTech(index) {
    const tech = state.techChoices[index];
    if (!tech) return;
    applyTech(tech);
  }

  function handleNodeAction(nodeId) {
    const node = state.nodes[nodeId];
    if (!node) return;
    if (input.mode === 'barrier') {
      if (!SPLITS[nodeId]) { notify('BARRIERS ONLY FIT SPLIT NODES'); return; }
      if (!state.barriers[nodeId]) {
        if (state.scrap < 3) { notify('NEED 3 SCRAP FOR A BARRIER'); return; }
        state.scrap -= 3;
        state.barriers[nodeId] = true;
        for (const enemy of state.enemies) if (enemy.currentNode === nodeId) repath(enemy);
        addBurst(NODE_DATA[nodeId].x, NODE_DATA[nodeId].y, '#ffad72', 12);
        notify(`${SPLITS[nodeId].label}-SPLIT REDIRECTED`);
        tone(180, .06, 'square');
      } else {
        state.barriers[nodeId] = false;
        for (const enemy of state.enemies) if (enemy.currentNode === nodeId) repath(enemy);
        notify(`${SPLITS[nodeId].label}-SPLIT OPEN`);
        tone(260, .05, 'triangle');
      }
      return;
    }
    const existing = node.turret;
    const type = existing ? existing.type : input.selectedType;
    const cost = existing ? 4 + existing.level * 3 : TURRETS[type].cost;
    if (state.scrap < cost) { notify(`NEED ${cost} SCRAP`); return; }
    state.scrap -= cost;
    if (existing) existing.level = Math.min(4, existing.level + 1);
    else node.turret = { type, level: 1, cooldown: .12 };
    addBurst(NODE_DATA[nodeId].x, NODE_DATA[nodeId].y, TURRETS[type].color, 10);
    notify(existing ? `${TURRETS[type].name} UPGRADED` : `${TURRETS[type].name} DEPLOYED`);
    tone(existing ? 460 : 380, .05, 'triangle');
  }

  function controlButtons() {
    return [
      { id: 'gun', x: 126, y: 605, w: 48, h: 48 }, { id: 'slow', x: 180, y: 605, w: 48, h: 48 },
      { id: 'mortar', x: 234, y: 605, w: 48, h: 48 }, { id: 'tesla', x: 288, y: 605, w: 48, h: 48 },
      { id: 'barrier', x: 342, y: 605, w: 48, h: 48 }
    ];
  }

  function hitRect(point, rect, pad) {
    const extra = pad || 0;
    return point.x >= rect.x - extra && point.x <= rect.x + rect.w + extra && point.y >= rect.y - extra && point.y <= rect.y + rect.h + extra;
  }

  function pointerPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left - viewport.ox) / viewport.scale, y: (event.clientY - rect.top - viewport.oy) / viewport.scale };
  }

  function inStick(point) { return Math.hypot(point.x - 62, point.y - 644) <= 72; }

  function updateStick(point) {
    const dx = point.x - 62;
    const dy = point.y - 644;
    const distance = Math.hypot(dx, dy);
    const radius = 48;
    const amount = Math.min(1, distance / radius);
    input.stick.x = distance ? dx / distance * amount : 0;
    input.stick.y = distance ? dy / distance * amount : 0;
  }

  function queueAction(action) {
    if (orientationPaused || document.hidden) return;
    if (input.queue.length < 32) input.queue.push(action);
  }

  function onPointerDown(event) {
    event.preventDefault();
    unlockAudio();
    if (orientationPaused || document.hidden) return;
    if (input.pointers.size >= MAX_POINTERS) return;
    const point = pointerPoint(event);
    const record = { x: point.x, y: point.y, originX: point.x, originY: point.y, control: 'none', id: null };
    if (state.phase === 'playing' && input.stickPointerId === null && inStick(point)) {
      record.control = 'stick';
      input.stickPointerId = event.pointerId;
      updateStick(point);
    } else if (state.phase === 'playing') {
      const button = controlButtons().find(item => hitRect(point, item, 4));
      if (button) { record.control = 'button'; record.id = button.id; }
      else {
        const nodeId = BUILD_NODES.find(id => Math.hypot(point.x - NODE_DATA[id].x, point.y - NODE_DATA[id].y) <= 29);
        if (nodeId) { record.control = 'node'; record.id = nodeId; }
      }
    } else if (state.phase === 'start') record.control = 'start';
    else if (state.phase === 'over' || state.phase === 'win') record.control = 'restart';
    else if (state.phase === 'between') {
      const index = techCardAt(point);
      if (index >= 0) { record.control = 'tech'; record.id = index; }
    }
    input.pointers.set(event.pointerId, record);
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
  }

  function onPointerMove(event) {
    event.preventDefault();
    const record = input.pointers.get(event.pointerId);
    if (!record) return;
    const point = pointerPoint(event);
    record.x = point.x;
    record.y = point.y;
    if (record.control === 'stick' && input.stickPointerId === event.pointerId) updateStick(point);
  }

  function onPointerUp(event) {
    event.preventDefault();
    const record = input.pointers.get(event.pointerId);
    if (!record) return;
    const point = pointerPoint(event);
    if (record.control === 'stick' && input.stickPointerId === event.pointerId) {
      input.stickPointerId = null;
      input.stick.x = 0;
      input.stick.y = 0;
    } else if (record.control === 'button' && Math.hypot(point.x - record.originX, point.y - record.originY) < 30) queueAction({ kind: 'button', id: record.id });
    else if (record.control === 'node' && Math.hypot(point.x - record.originX, point.y - record.originY) < 30) queueAction({ kind: 'node', id: record.id });
    else if (record.control === 'start') queueAction({ kind: 'start' });
    else if (record.control === 'restart') queueAction({ kind: 'restart' });
    else if (record.control === 'tech' && techCardAt(point) === record.id) queueAction({ kind: 'tech', index: record.id });
    input.pointers.delete(event.pointerId);
    try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
  }

  function onPointerCancel(event) {
    event.preventDefault();
    const record = input.pointers.get(event.pointerId);
    if (record && record.control === 'stick' && input.stickPointerId === event.pointerId) {
      input.stickPointerId = null;
      input.stick.x = 0;
      input.stick.y = 0;
    }
    input.pointers.delete(event.pointerId);
  }

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '1', '2', '3', '4', 'b', 'r', 'enter', ' '].includes(key)) event.preventDefault();
    if (orientationPaused || document.hidden) { clearInput(); return; }
    unlockAudio();
    if (TRACKED_KEYS.has(key)) input.keys.add(key);
    if (event.repeat) return;
    if (state.phase === 'start' && (key === 'enter' || key === ' ')) queueAction({ kind: 'start' });
    else if ((state.phase === 'over' || state.phase === 'win') && (key === 'r' || key === 'enter' || key === ' ')) queueAction({ kind: 'restart' });
    else if (state.phase === 'between' && (key === '1' || key === '2')) queueAction({ kind: 'tech', index: Number(key) - 1 });
    else if (state.phase === 'playing' && key >= '1' && key <= '4') queueAction({ kind: 'select', type: TURRET_KEYS[Number(key) - 1] });
    else if (state.phase === 'playing' && key === 'b') queueAction({ kind: 'barrier' });
  }

  function onKeyUp(event) { input.keys.delete(event.key.toLowerCase()); }

  function techCardAt(point) {
    if (point.y < 270 || point.y > 540) return -1;
    if (point.x >= 20 && point.x <= 185) return 0;
    if (point.x >= 205 && point.x <= 370) return 1;
    return -1;
  }

  function handleOrientation() {
    const wasPaused = orientationPaused;
    orientationPaused = window.innerWidth > window.innerHeight;
    rotateOverlay.classList.toggle('show', orientationPaused);
    if (!wasPaused && orientationPaused) { cancelPendingTimers(); clearInput(); }
    lastFrame = performance.now();
    resizeCanvas();
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    viewport.cssW = rect.width;
    viewport.cssH = rect.height;
    viewport.scale = Math.min(rect.width / DESIGN_W, rect.height / DESIGN_H);
    viewport.ox = (rect.width - DESIGN_W * viewport.scale) / 2;
    viewport.oy = (rect.height - DESIGN_H * viewport.scale) / 2;
    viewport.pixelScale = Math.min(window.devicePixelRatio || 1, 2, 960 / Math.max(1, rect.width), 960 / Math.max(1, rect.height));
    canvas.width = Math.max(1, Math.round(rect.width * viewport.pixelScale));
    canvas.height = Math.max(1, Math.round(rect.height * viewport.pixelScale));
  }

  function withWorldTransform() {
    ctx.setTransform(viewport.scale * viewport.pixelScale, 0, 0, viewport.scale * viewport.pixelScale, viewport.ox * viewport.pixelScale, viewport.oy * viewport.pixelScale);
  }

  function roundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawBackground() {
    ctx.fillStyle = '#08111d';
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    ctx.fillStyle = '#0b1927';
    ctx.fillRect(0, MAP_TOP, DESIGN_W, MAP_BOTTOM - MAP_TOP);
    ctx.strokeStyle = 'rgba(104, 153, 171, .065)';
    ctx.lineWidth = 1;
    for (let x = 8; x < DESIGN_W; x += 24) { ctx.beginPath(); ctx.moveTo(x, MAP_TOP); ctx.lineTo(x, MAP_BOTTOM); ctx.stroke(); }
    for (let y = MAP_TOP; y < MAP_BOTTOM; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(DESIGN_W, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(20, 52, 62, .18)';
    ctx.fillRect(0, MAP_BOTTOM - 42, DESIGN_W, 42);
  }

  function drawRoads() {
    for (const [aId, bId] of EDGES) {
      const a = NODE_DATA[aId];
      const b = NODE_DATA[bId];
      const blocked = isBlocked(aId, bId);
      ctx.lineCap = 'round';
      ctx.strokeStyle = blocked ? '#4a2930' : '#223949';
      ctx.lineWidth = 18;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = blocked ? '#9b5554' : '#45687a';
      ctx.lineWidth = 2;
      ctx.setLineDash(blocked ? [5, 5] : []);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const splitId of Object.keys(SPLITS)) {
      const split = NODE_DATA[splitId];
      const branch = NODE_DATA[SPLITS[splitId].branches[0]];
      if (state.barriers[splitId]) {
        const angle = Math.atan2(branch.y - split.y, branch.x - split.x);
        ctx.save();
        ctx.translate(split.x + (branch.x - split.x) * .34, split.y + (branch.y - split.y) * .34);
        ctx.rotate(angle);
        ctx.fillStyle = '#ffad72';
        ctx.fillRect(-11, -3, 22, 6);
        ctx.fillStyle = '#ffdc9b';
        ctx.fillRect(-8, -3, 4, 6); ctx.fillRect(2, -3, 4, 6);
        ctx.restore();
      }
    }
  }

  function drawCore() {
    const core = NODE_DATA.core;
    ctx.save();
    ctx.translate(core.x, core.y);
    ctx.strokeStyle = 'rgba(140, 227, 196, .18)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 34 + Math.sin(state.elapsed * 2) * 2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#102b35';
    ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8ce3c4'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#8ce3c4';
    ctx.beginPath(); ctx.moveTo(-9, -13); ctx.lineTo(12, 0); ctx.lineTo(-9, 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d9f5ec'; ctx.font = '800 8px Arial'; ctx.textAlign = 'center'; ctx.fillText('CORE', 0, 43);
    ctx.restore();
  }

  function drawBuildNodes() {
    for (const id of BUILD_NODES) {
      const data = NODE_DATA[id];
      const mounted = state.nodes[id].turret;
      const isSplit = Boolean(SPLITS[id]);
      const selected = input.mode === 'barrier' ? isSplit : Boolean(mounted && mounted.type === input.selectedType);
      ctx.save();
      ctx.translate(data.x, data.y);
      ctx.fillStyle = selected ? 'rgba(244, 200, 107, .16)' : 'rgba(7, 17, 27, .76)';
      ctx.strokeStyle = mounted ? TURRETS[mounted.type].color : (isSplit ? '#ffad72' : '#7da7b7');
      ctx.lineWidth = selected ? 3 : 2;
      ctx.beginPath(); ctx.arc(0, 0, mounted ? 16 : 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (mounted) {
        ctx.fillStyle = TURRETS[mounted.type].color;
        ctx.font = '800 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(TURRETS[mounted.type].short, 0, 0);
        ctx.fillStyle = '#07111b'; ctx.beginPath(); ctx.arc(11, -11, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f4f7f5'; ctx.font = '800 8px Arial'; ctx.fillText(mounted.level, 11, -11.5);
        if (mounted.type === 'slow') {
          ctx.strokeStyle = 'rgba(114, 214, 255, .13)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, TURRETS.slow.range * state.tech.field + mounted.level * 5, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (isSplit && state.barriers[id]) {
        ctx.fillStyle = '#ffad72'; ctx.font = '800 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('↗', 0, 0);
      } else {
        ctx.fillStyle = '#8daab6'; ctx.font = '800 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(isSplit ? '◆' : '+', 0, 0);
      }
      ctx.restore();
    }
  }

  function drawEnemies() {
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const data = ENEMY_TYPES[enemy.type];
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      const scale = enemy.hit > 0 ? 1.16 : 1;
      ctx.scale(scale, scale);
      ctx.fillStyle = data.color;
      ctx.globalAlpha = enemy.slow < .9 ? .88 : 1;
      ctx.beginPath(); ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#17241f';
      ctx.beginPath(); ctx.arc(-3.5, -2, 2, 0, Math.PI * 2); ctx.arc(3.5, -2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#17241f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(4, 4); ctx.stroke();
      ctx.restore();
      const width = enemy.radius * 2.4;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.radius - 8, width, 3);
      ctx.fillStyle = data.color; ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.radius - 8, width * Math.max(0, enemy.hp / enemy.maxHp), 3);
    }
  }

  function drawScraps() {
    for (const scrap of state.scraps) {
      ctx.save(); ctx.translate(scrap.x, scrap.y); ctx.rotate(scrap.spin);
      ctx.fillStyle = '#f4c86b'; ctx.fillRect(-4, -4, 8, 8);
      ctx.fillStyle = '#fff0b1'; ctx.fillRect(-2, -4, 2, 2); ctx.restore();
    }
  }

  function drawProjectiles() {
    for (const shot of state.projectiles) {
      ctx.fillStyle = shot.color;
      ctx.beginPath(); ctx.arc(shot.x, shot.y, shot.aoe ? 4 : 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawHero() {
    const hero = state.hero;
    ctx.save(); ctx.translate(hero.x, hero.y); ctx.rotate(hero.facing);
    ctx.fillStyle = 'rgba(140, 227, 196, .16)'; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8ce3c4'; ctx.fillRect(-9, -9, 18, 18);
    ctx.fillStyle = '#d9f5ec'; ctx.fillRect(1, -6, 10, 5);
    ctx.fillStyle = '#16433f'; ctx.fillRect(3, 2, 5, 4);
    ctx.restore();
    ctx.fillStyle = '#d9f5ec'; ctx.font = '800 8px Arial'; ctx.textAlign = 'center'; ctx.fillText('ROOK', hero.x, hero.y + 29);
  }

  function drawEffects() {
    for (const effect of state.fx) {
      if (effect.type === 'ring') {
        ctx.globalAlpha = Math.max(0, effect.life / .46);
        ctx.strokeStyle = effect.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = Math.max(0, effect.life / .16);
        ctx.strokeStyle = effect.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(effect.a.x, effect.a.y); ctx.lineTo(effect.b.x, effect.b.y); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    for (const particle of state.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, particle.life / particle.max));
      ctx.fillStyle = particle.color; ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    ctx.fillStyle = '#07111c'; ctx.fillRect(0, 0, DESIGN_W, 90);
    ctx.fillStyle = '#d9f5ec'; ctx.font = '800 16px Arial'; ctx.textAlign = 'left'; ctx.fillText('VERGE PROTOCOL', 14, 22);
    ctx.fillStyle = '#7894a3'; ctx.font = '700 9px Arial'; ctx.fillText(`BEST ${state.best}`, 14, 36);
    ctx.textAlign = 'center'; ctx.fillStyle = '#f4f7f5'; ctx.font = '800 14px Arial'; ctx.fillText(`WAVE ${String(state.wave || 1).padStart(2, '0')} / 25`, 195, 21);
    ctx.textAlign = 'right'; ctx.fillStyle = '#f4c86b'; ctx.font = '800 16px Arial'; ctx.fillText(`${state.scrap} SCRAP`, 376, 22);
    ctx.fillStyle = '#7894a3'; ctx.font = '700 9px Arial'; ctx.fillText(`SCORE ${state.score}`, 376, 36);
    ctx.fillStyle = '#142c3a'; roundedRect(14, 43, 120, 13, 6); ctx.fill();
    ctx.fillStyle = state.coreHp < state.coreMax * .35 ? '#ff766a' : '#8ce3c4'; roundedRect(14, 43, 120 * Math.max(0, state.coreHp / state.coreMax), 13, 6); ctx.fill();
    ctx.fillStyle = '#d9f5ec'; ctx.font = '800 8px Arial'; ctx.textAlign = 'left'; ctx.fillText(`CORE ${Math.ceil(state.coreHp)} / ${state.coreMax}`, 19, 52.5);
    ctx.fillStyle = '#102434'; roundedRect(142, 41, 234, 18, 7); ctx.fill();
    ctx.fillStyle = '#91acba'; ctx.font = '700 9px Arial'; ctx.textAlign = 'left';
    const next = state.phase === 'between' ? createWavePlan(state.wave + 1) : (state.wavePlan || createWavePlan(1));
    const composition = next.labels.map(item => `${item.count}${ENEMY_TYPES[item.type].short}`).join('  ');
    ctx.fillText(`${state.phase === 'between' ? 'NEXT' : 'LIVE'} ${String(next.wave).padStart(2, '0')}  ${composition}`, 150, 53);
    ctx.fillStyle = '#6f919d'; ctx.font = '700 9px Arial'; ctx.fillText('TAP NODES  •  STEER ROOK  •  COLLECT SCRAP', 14, 76);
    if (state.noticeTime > 0) {
      ctx.textAlign = 'center'; ctx.fillStyle = '#f4c86b'; ctx.font = '800 10px Arial'; ctx.fillText(state.notice, 195, 88);
    }
  }

  function drawControls() {
    const activeStick = input.stickPointerId !== null || Math.abs(input.stick.x) + Math.abs(input.stick.y) > .01;
    ctx.fillStyle = '#091622'; ctx.fillRect(0, 584, DESIGN_W, 116);
    ctx.strokeStyle = '#1b3442'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 584); ctx.lineTo(DESIGN_W, 584); ctx.stroke();
    ctx.fillStyle = '#7894a3'; ctx.font = '700 8px Arial'; ctx.textAlign = 'left'; ctx.fillText('ROOK CONTROL', 16, 600);
    ctx.fillStyle = activeStick ? 'rgba(140, 227, 196, .2)' : 'rgba(56, 94, 105, .45)'; ctx.beginPath(); ctx.arc(62, 644, 48, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#456c72'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(62, 644, 48, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = activeStick ? '#8ce3c4' : '#82a6ac'; ctx.beginPath(); ctx.arc(62 + input.stick.x * 30, 644 + input.stick.y * 30, 19, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9f5ec'; ctx.font = '800 8px Arial'; ctx.textAlign = 'center'; ctx.fillText('MOVE', 62, 647);
    ctx.textAlign = 'left'; ctx.fillStyle = '#7894a3'; ctx.font = '700 8px Arial'; ctx.fillText(input.mode === 'barrier' ? 'BARRIER MODE' : `BUILD: ${TURRETS[input.selectedType].name}`, 126, 598);
    for (const button of controlButtons()) {
      const isBarrier = button.id === 'barrier';
      const active = isBarrier ? input.mode === 'barrier' : input.mode === 'turret' && input.selectedType === button.id;
      const color = isBarrier ? '#ffad72' : TURRETS[button.id].color;
      ctx.fillStyle = active ? 'rgba(255,255,255,.14)' : '#102433'; roundedRect(button.x, button.y, button.w, button.h, 10); ctx.fill();
      ctx.strokeStyle = active ? color : '#2e4c5c'; ctx.lineWidth = active ? 2 : 1; roundedRect(button.x, button.y, button.w, button.h, 10); ctx.stroke();
      ctx.fillStyle = color; ctx.font = '800 15px Arial'; ctx.textAlign = 'center'; ctx.fillText(isBarrier ? 'B' : TURRETS[button.id].short, button.x + button.w / 2, button.y + 20);
      ctx.fillStyle = '#8faab5'; ctx.font = '700 7px Arial'; ctx.fillText(isBarrier ? 'WALL' : TURRETS[button.id].key, button.x + button.w / 2, button.y + 37);
    }
    ctx.fillStyle = '#6e8a96'; ctx.font = '700 8px Arial'; ctx.textAlign = 'right'; ctx.fillText('1–4 / B', 376, 674);
  }

  function drawStartPanel() {
    ctx.fillStyle = 'rgba(4, 10, 17, .74)'; ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    ctx.fillStyle = '#8ce3c4'; ctx.font = '800 11px Arial'; ctx.textAlign = 'center'; ctx.fillText('FIELD TEST // 01', 195, 205);
    ctx.fillStyle = '#d9f5ec'; ctx.font = '900 37px Arial'; ctx.fillText('VERGE', 195, 249); ctx.fillText('PROTOCOL', 195, 288);
    ctx.fillStyle = '#7894a3'; ctx.font = '700 12px Arial'; ctx.fillText('One core. Three roads. No second chances.', 195, 321);
    ctx.fillStyle = '#102c39'; roundedRect(89, 360, 212, 62, 16); ctx.fill();
    ctx.strokeStyle = '#8ce3c4'; ctx.lineWidth = 2; roundedRect(89, 360, 212, 62, 16); ctx.stroke();
    ctx.fillStyle = '#d9f5ec'; ctx.font = '900 17px Arial'; ctx.fillText('TAP TO DEPLOY', 195, 388);
    ctx.fillStyle = '#7894a3'; ctx.font = '700 9px Arial'; ctx.fillText('audio unlocks on first gesture', 195, 407);
    ctx.fillStyle = '#9db3c3'; ctx.font = '700 10px Arial'; ctx.fillText('SURVIVE 25 WAVES  •  BUILD WITH EARNED SCRAP', 195, 468);
  }

  function drawTechPanel() {
    ctx.fillStyle = 'rgba(4, 10, 17, .78)'; ctx.fillRect(0, 90, DESIGN_W, 494);
    ctx.fillStyle = '#8ce3c4'; ctx.font = '800 10px Arial'; ctx.textAlign = 'center'; ctx.fillText(`WAVE ${String(state.wave).padStart(2, '0')} CLEAR`, 195, 184);
    ctx.fillStyle = '#d9f5ec'; ctx.font = '900 25px Arial'; ctx.fillText('CHOOSE FIELD TECH', 195, 220);
    const nextPlan = createWavePlan(state.wave + 1);
    ctx.fillStyle = '#7894a3'; ctx.font = '700 10px Arial'; ctx.fillText(`NEXT WAVE ${String(nextPlan.wave).padStart(2, '0')}  •  ${nextPlan.total} HOSTILES PREVIEWED ABOVE`, 195, 240);
    state.techChoices.forEach((tech, index) => {
      const x = index === 0 ? 20 : 205;
      ctx.fillStyle = '#0e2230'; roundedRect(x, 274, 165, 186, 15); ctx.fill();
      ctx.strokeStyle = tech.color; ctx.lineWidth = 2; roundedRect(x, 274, 165, 186, 15); ctx.stroke();
      ctx.fillStyle = tech.color; ctx.font = '900 28px Arial'; ctx.textAlign = 'center'; ctx.fillText(index === 0 ? '01' : '02', x + 82.5, 322);
      ctx.fillStyle = '#d9f5ec'; ctx.font = '900 13px Arial'; ctx.fillText(tech.name, x + 82.5, 360);
      ctx.fillStyle = '#9db3c3'; ctx.font = '700 11px Arial';
      const words = tech.copy.split(' '); let line = ''; let lineY = 393;
      for (const word of words) { if ((line + word).length > 23) { ctx.fillText(line.trim(), x + 82.5, lineY); line = ''; lineY += 16; } line += `${word} `; }
      if (line) ctx.fillText(line.trim(), x + 82.5, lineY);
      ctx.fillStyle = tech.color; ctx.font = '900 10px Arial'; ctx.fillText(index === 0 ? 'TAP / PRESS 1' : 'TAP / PRESS 2', x + 82.5, 438);
    });
  }

  function drawEndPanel() {
    ctx.fillStyle = 'rgba(4, 10, 17, .82)'; ctx.fillRect(0, 90, DESIGN_W, 494);
    const won = state.phase === 'win';
    ctx.textAlign = 'center'; ctx.fillStyle = won ? '#8ce3c4' : '#ff766a'; ctx.font = '800 11px Arial'; ctx.fillText(won ? 'PROTOCOL COMPLETE' : 'CORE BREACHED', 195, 218);
    ctx.fillStyle = '#d9f5ec'; ctx.font = '900 34px Arial'; ctx.fillText(won ? 'YOU HELD' : 'LINE LOST', 195, 264);
    ctx.fillStyle = '#9db3c3'; ctx.font = '700 12px Arial'; ctx.fillText(won ? 'The perimeter has a future.' : `Wave ${state.wave} reached the core.`, 195, 294);
    ctx.fillStyle = '#f4c86b'; ctx.font = '900 27px Arial'; ctx.fillText(`SCORE  ${state.score}`, 195, 343);
    ctx.fillStyle = '#9db3c3'; ctx.font = '700 11px Arial'; ctx.fillText(`BEST  ${state.best}   •   KILLS  ${state.kills}`, 195, 369);
    ctx.fillStyle = '#102c39'; roundedRect(96, 407, 198, 58, 15); ctx.fill();
    ctx.strokeStyle = won ? '#8ce3c4' : '#ff766a'; ctx.lineWidth = 2; roundedRect(96, 407, 198, 58, 15); ctx.stroke();
    ctx.fillStyle = '#d9f5ec'; ctx.font = '900 16px Arial'; ctx.fillText('RESTART  /  R', 195, 442);
  }

  function render() {
    resizeCanvasIfNeeded();
    ctx.setTransform(viewport.pixelScale, 0, 0, viewport.pixelScale, 0, 0);
    ctx.clearRect(0, 0, canvas.width / viewport.pixelScale, canvas.height / viewport.pixelScale);
    withWorldTransform();
    ctx.save();
    if (state.shake > 0) ctx.translate((Math.random() - .5) * state.shake, (Math.random() - .5) * state.shake);
    drawBackground();
    drawRoads();
    drawCore();
    drawScraps();
    drawBuildNodes();
    drawEnemies();
    drawProjectiles();
    drawHero();
    drawEffects();
    ctx.restore();
    withWorldTransform();
    drawHud();
    drawControls();
    if (state.phase === 'start') drawStartPanel();
    else if (state.phase === 'between') drawTechPanel();
    else if (state.phase === 'over' || state.phase === 'win') drawEndPanel();
    if (state.flash > 0) { ctx.fillStyle = `rgba(255, 240, 210, ${Math.min(.22, state.flash * .22)})`; ctx.fillRect(0, 0, DESIGN_W, DESIGN_H); }
  }

  function resizeCanvasIfNeeded() {
    const rect = canvas.getBoundingClientRect();
    if (Math.abs(rect.width - viewport.cssW) > .5 || Math.abs(rect.height - viewport.cssH) > .5) resizeCanvas();
  }

  function frame(now) {
    const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    processQueue();
    if (!orientationPaused && !document.hidden) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  canvas.addEventListener('pointercancel', onPointerCancel, { passive: false });
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp, { passive: false });
  window.addEventListener('blur', clearInput);
  window.addEventListener('resize', handleOrientation);
  window.addEventListener('orientationchange', handleOrientation);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelPendingTimers(); clearInput(); }
    lastFrame = performance.now();
  });

  resetGame(true);
  handleOrientation();
  requestAnimationFrame(frame);
})();
