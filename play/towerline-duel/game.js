(() => {
  'use strict';

  const W = 390;
  const H = 700;
  const ARENA = { top: 111, bottom: 548, left: 22, right: 368, laneCenters: [112, 278] };
  const STORAGE_KEY = 'towerline-duel-save-v1';
  const MAX_PARTICLES = 180;
  const MAX_ENTITIES = 52;
  const MAX_PROJECTILES = 60;
  const MAX_FLOATERS = 28;
  const MAX_ACTIONS = 12;
  const MAX_TIMEOUTS = 12;
  const MAX_POINTERS = 8;
  const MAX_KEYS = 16;
  const TAU = Math.PI * 2;

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const rotateOverlay = document.getElementById('rotateOverlay');

  const COLORS = {
    ink: '#07101d',
    panel: '#101d2e',
    panel2: '#162941',
    line: '#28445b',
    text: '#e9fbff',
    muted: '#8eafba',
    mint: '#58e0c9',
    gold: '#ffd36a',
    coral: '#ff6d72',
    violet: '#a98dff',
    blue: '#6db8ff',
    enemy: '#ff6f78',
    player: '#59e5cb'
  };

  const ROLE_COLORS = {
    swarm: '#f1c55f',
    tank: '#d88762',
    ranged: '#6eb9ff',
    splash: '#b08bff',
    rush: '#5ee2c3',
    building: '#d6e0e8',
    spell: '#ff78bd'
  };

  // Every card is an original name and a flat-power rule. The role matchup
  // cycle is intentionally visible in the forge: swarm > tank > ranged > rush > swarm.
  const CARDS = [
    { id: 'rivetlings', name: 'Rivetlings', short: 'Rivets', role: 'swarm', cost: 2, hp: 62, damage: 18, count: 4, speed: 42, range: 20, attack: .72, color: '#f1c55f', counter: 'tank', blurb: 'four quick bodies' },
    { id: 'midge-mob', name: 'Midge Mob', short: 'Midges', role: 'swarm', cost: 3, hp: 48, damage: 14, count: 6, speed: 36, range: 22, attack: .58, color: '#e9b457', counter: 'tank', blurb: 'six tiny scrappers' },
    { id: 'shard-sprites', name: 'Shard Sprites', short: 'Sprites', role: 'swarm', cost: 4, hp: 42, damage: 20, count: 5, speed: 49, range: 30, attack: .65, color: '#ffdb76', counter: 'tank', blurb: 'darting bladelets' },
    { id: 'bulwark', name: 'Bulwark', short: 'Bulwark', role: 'tank', cost: 5, hp: 560, damage: 42, count: 1, speed: 19, range: 26, attack: 1.25, color: '#d88762', counter: 'ranged', blurb: 'slow, stubborn wall' },
    { id: 'gravelback', name: 'Gravelback', short: 'Gravel', role: 'tank', cost: 4, hp: 420, damage: 32, count: 1, speed: 25, range: 25, attack: 1.05, color: '#bd755c', counter: 'ranged', blurb: 'steady lane anchor' },
    { id: 'iron-cask', name: 'Iron Cask', short: 'Cask', role: 'tank', cost: 6, hp: 740, damage: 53, count: 1, speed: 14, range: 28, attack: 1.5, color: '#a96559', counter: 'ranged', blurb: 'the heavy answer' },
    { id: 'needlewing', name: 'Needlewing', short: 'Needle', role: 'ranged', cost: 3, hp: 135, damage: 36, count: 1, speed: 27, range: 150, attack: 1.05, color: '#6eb9ff', counter: 'rush', blurb: 'long reach, light shell' },
    { id: 'prism-scout', name: 'Prism Scout', short: 'Prism', role: 'ranged', cost: 4, hp: 180, damage: 48, count: 1, speed: 24, range: 175, attack: 1.25, color: '#77c6ff', counter: 'rush', blurb: 'focused beam' },
    { id: 'longbeam', name: 'Longbeam', short: 'Beam', role: 'ranged', cost: 5, hp: 220, damage: 74, count: 1, speed: 17, range: 205, attack: 1.6, color: '#9ad8ff', counter: 'rush', blurb: 'patient, piercing shot' },
    { id: 'cinder-orbiter', name: 'Cinder Orbiter', short: 'Cinder', role: 'splash', cost: 4, hp: 185, damage: 34, splash: 55, count: 1, speed: 24, range: 130, attack: 1.2, color: '#b08bff', counter: 'swarm', blurb: 'burns clustered foes' },
    { id: 'gale-mortar', name: 'Gale Mortar', short: 'Gale', role: 'splash', cost: 5, hp: 240, damage: 56, splash: 72, count: 1, speed: 15, range: 180, attack: 1.5, color: '#c0a4ff', counter: 'swarm', blurb: 'wide pressure arc' },
    { id: 'quillburst', name: 'Quillburst', short: 'Quill', role: 'splash', cost: 3, hp: 110, damage: 26, splash: 48, count: 1, speed: 32, range: 105, attack: .92, color: '#9877f1', counter: 'swarm', blurb: 'cheap burst runner' },
    { id: 'volt-hound', name: 'Volt Hound', short: 'Hound', role: 'rush', cost: 3, hp: 170, damage: 92, count: 1, speed: 83, range: 22, attack: 1.35, color: '#5ee2c3', counter: 'swarm', blurb: 'fast first bite' },
    { id: 'skitter-dash', name: 'Skitter Dash', short: 'Skitter', role: 'rush', cost: 2, hp: 100, damage: 58, count: 1, speed: 104, range: 21, attack: 1.05, color: '#54cfb4', counter: 'swarm', blurb: 'cheap lane sprint' },
    { id: 'razor-kite', name: 'Razor Kite', short: 'Razor', role: 'rush', cost: 4, hp: 220, damage: 135, count: 1, speed: 70, range: 24, attack: 1.55, color: '#84f0d7', counter: 'swarm', blurb: 'all-in tower dive' },
    { id: 'spark-nest', name: 'Spark Nest', short: 'Nest', role: 'building', cost: 4, hp: 360, damage: 28, count: 1, speed: 0, range: 150, attack: .9, color: '#d6e0e8', counter: 'rush', building: true, blurb: 'holds a lane in place' },
    { id: 'pulse-mill', name: 'Pulse Mill', short: 'Mill', role: 'building', cost: 5, hp: 470, damage: 44, count: 1, speed: 0, range: 175, attack: 1.15, color: '#b9cbd7', counter: 'rush', building: true, blurb: 'reliable lane turret' },
    { id: 'bramble-beacon', name: 'Bramble Beacon', short: 'Beacon', role: 'building', cost: 3, hp: 250, damage: 20, count: 1, speed: 0, range: 110, attack: .7, color: '#a9d5c0', counter: 'rush', building: true, blurb: 'cheap slow field' },
    { id: 'tether-post', name: 'Tether Post', short: 'Tether', role: 'building', cost: 2, hp: 210, damage: 10, count: 1, speed: 0, range: 95, attack: .55, color: '#a8c4d4', counter: 'rush', building: true, blurb: 'buys precious seconds' },
    { id: 'aegis-relay', name: 'Aegis Relay', short: 'Aegis', role: 'building', cost: 6, hp: 620, damage: 60, count: 1, speed: 0, range: 200, attack: 1.7, color: '#e1eef2', counter: 'rush', building: true, blurb: 'fortified late anchor' },
    { id: 'static-bloom', name: 'Static Bloom', short: 'Static', role: 'spell', cost: 3, damage: 125, radius: 70, spell: 'shock', color: '#ff78bd', blurb: 'burst + brief lock' },
    { id: 'frostline', name: 'Frostline', short: 'Frost', role: 'spell', cost: 2, damage: 70, radius: 78, spell: 'freeze', color: '#72d9ff', blurb: 'slow a whole pocket' },
    { id: 'meteor-knot', name: 'Meteor Knot', short: 'Meteor', role: 'spell', cost: 5, damage: 240, radius: 54, spell: 'meteor', color: '#ff9b6b', blurb: 'heavy pinpoint impact' },
    { id: 'mend-field', name: 'Mend Field', short: 'Mend', role: 'spell', cost: 3, heal: 175, radius: 78, spell: 'heal', color: '#65e6a6', blurb: 'restore friendly bodies' }
  ];

  const LADDER = [
    { name: 'Seedline', style: 'warm-up swarm', deck: [0, 3, 6, 1, 16, 13, 21, 22], skill: .34, gap: 1.55, accent: '#f1c55f' },
    { name: 'Copper Reach', style: 'patient wall', deck: [3, 4, 6, 16, 18, 0, 21, 22], skill: .43, gap: 1.38, accent: '#d88762' },
    { name: 'Prism Yard', style: 'ranged lattice', deck: [6, 7, 9, 3, 16, 19, 21, 23], skill: .52, gap: 1.28, accent: '#6eb9ff' },
    { name: 'Gale Cut', style: 'splash tempo', deck: [9, 10, 11, 1, 4, 16, 21, 22], skill: .61, gap: 1.15, accent: '#b08bff' },
    { name: 'Green Rush', style: 'tower dive', deck: [12, 13, 14, 0, 2, 18, 21, 22], skill: .68, gap: 1.02, accent: '#5ee2c3' },
    { name: 'Relay Ring', style: 'fortified counter', deck: [17, 19, 20, 5, 7, 14, 21, 23], skill: .76, gap: .92, accent: '#d6e0e8' },
    { name: 'Black Current', style: 'spell control', deck: [5, 8, 10, 14, 16, 20, 21, 22], skill: .84, gap: .8, accent: '#ff78bd' },
    { name: 'Crown Circuit', style: 'adaptive grandmaster', deck: [2, 5, 8, 10, 14, 19, 21, 23], skill: .93, gap: .68, accent: '#ffd36a' }
  ];

  let screen = 'menu';
  let progress = loadProgress();
  let game = null;
  let selectedDeckSlot = 0;
  let pointerMap = new Map();
  let activeDrag = null;
  let keys = new Set();
  let queuedActions = [];
  let scheduledTimeouts = new Set();
  let orientationPaused = false;
  let hiddenPaused = false;
  let lastFrame = performance.now();
  let cssWidth = 390;
  let cssHeight = 700;
  let audio = null;

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function card(id) { return CARDS[id] || CARDS[0]; }
  function isLandscape() { return window.innerWidth > window.innerHeight; }
  function safeInt(value, fallback, min, max) {
    const n = Number(value);
    return Number.isFinite(n) && Number.isInteger(n) ? clamp(n, min, max) : fallback;
  }

  function defaultDeck() { return [0, 1, 2, 0, 1, 2, 0, 1]; }

  function validDeck(value) {
    return Array.isArray(value) && value.length === 8 && value.every((id) => Number.isInteger(id) && id >= 0 && id < CARDS.length);
  }

  function loadProgress() {
    const fallback = { rung: 1, deck: defaultDeck() };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
      const rung = safeInt(parsed.rung, 1, 1, 8);
      const deck = validDeck(parsed.deck) ? parsed.deck.slice() : fallback.deck.slice();
      return { rung, deck };
    } catch (error) {
      return fallback;
    }
  }

  function saveProgress() {
    try {
      const payload = { rung: safeInt(progress.rung, 1, 1, 8), deck: validDeck(progress.deck) ? progress.deck.slice() : defaultDeck() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      // Storage is a convenience only; a private window or a full quota must not break play.
    }
  }

  function clearScheduledTimeouts() {
    scheduledTimeouts.forEach((id) => clearTimeout(id));
    scheduledTimeouts.clear();
  }

  function schedule(fn, ms) {
    if (scheduledTimeouts.size >= MAX_TIMEOUTS) return null;
    const id = setTimeout(() => { scheduledTimeouts.delete(id); fn(); }, ms);
    scheduledTimeouts.add(id);
    return id;
  }

  function resetInput() {
    pointerMap.forEach((_, pointerId) => {
      try { canvas.releasePointerCapture(pointerId); } catch (error) { /* pointer may already be gone */ }
    });
    pointerMap.clear();
    activeDrag = null;
    keys.clear();
    queuedActions.length = 0;
    clearScheduledTimeouts();
  }

  function queueAction(action) {
    if (queuedActions.length >= MAX_ACTIONS) queuedActions.shift();
    queuedActions.push(action);
  }

  function unlockAudio() {
    if (!audio) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        audio = new AudioContext();
      } catch (error) { return; }
    }
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  }

  function tone(frequency, duration, type = 'sine', volume = .035) {
    if (!audio || audio.state !== 'running') return;
    try {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    } catch (error) { /* audio is decorative */ }
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 960 / Math.max(cssWidth, cssHeight));
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    orientationPaused = isLandscape();
    rotateOverlay.setAttribute('aria-hidden', orientationPaused ? 'false' : 'true');
    lastFrame = performance.now();
  }

  function mapPointer(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / Math.max(1, rect.width) * W, 0, W),
      y: clamp((event.clientY - rect.top) / Math.max(1, rect.height) * H, 0, H)
    };
  }

  function pointIn(x, y, rect) { return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h; }

  function startGame(rung = progress.rung) {
    resetInput();
    unlockAudio();
    const rungIndex = clamp(rung, 1, 8) - 1;
    const bot = LADDER[rungIndex];
    game = {
      rung: rungIndex + 1,
      bot,
      time: 180,
      overtime: false,
      status: 'playing',
      playerTower: 1000,
      enemyTower: 1000,
      playerEnergy: 5,
      enemyEnergy: 5,
      maxEnergy: 10,
      units: [],
      projectiles: [],
      particles: [],
      floaters: [],
      hand: progress.deck.slice(0, 4),
      deckIndex: 4,
      selectedHand: 0,
      laneFocus: 0,
      aiTimer: .65,
      pulse: 0,
      shake: 0,
      flash: 0,
      nextEntityId: 1,
      message: 'Drag a card into a lane · 1–4 choose · ←→ lane · Space deploy',
      messageTime: 6,
      lastTowerHit: 0
    };
    screen = 'game';
    lastFrame = performance.now();
    tone(260, .12, 'triangle', .045);
  }

  function goMenu() {
    resetInput();
    game = null;
    screen = 'menu';
  }

  function openForge() {
    resetInput();
    screen = 'forge';
  }

  function createEntity(cardId, team, lane, y) {
    if (!game || game.units.length >= MAX_ENTITIES) return null;
    const c = card(cardId);
    const entity = {
      id: game.nextEntityId,
      cardId,
      team,
      lane,
      x: ARENA.laneCenters[lane] + rand(-7, 7),
      y,
      hp: c.hp,
      maxHp: c.hp,
      attackTimer: rand(.05, .3),
      freeze: 0,
      slow: 0,
      hit: 0,
      building: Boolean(c.building),
      phase: rand(0, TAU)
    };
    game.nextEntityId = (game.nextEntityId % 99999) + 1;
    game.units.push(entity);
    return entity;
  }

  function spend(team, cost) {
    if (team === 'player') game.playerEnergy -= cost;
    else game.enemyEnergy -= cost;
  }

  function deployCard(cardId, team, lane, targetY) {
    const c = card(cardId);
    if (!game || game.status !== 'playing') return false;
    const energy = team === 'player' ? game.playerEnergy : game.enemyEnergy;
    if (energy + .001 < c.cost) {
      if (team === 'player') {
        game.message = 'Need more energy';
        game.messageTime = 1.2;
        tone(115, .08, 'square', .022);
      }
      return false;
    }
    spend(team, c.cost);
    const safeLane = clamp(lane | 0, 0, 1);
    if (c.role === 'spell') {
      castSpell(c, team, safeLane, clamp(targetY || (team === 'player' ? 330 : 340), ARENA.top + 12, ARENA.bottom - 12));
    } else {
      const baseY = c.building ? (team === 'player' ? 485 : 173) : (team === 'player' ? 518 : 141);
      const direction = team === 'player' ? -1 : 1;
      const count = clamp(c.count || 1, 1, 6);
      for (let i = 0; i < count; i += 1) {
        const offset = (i - (count - 1) / 2) * 12;
        createEntity(cardId, team, safeLane, baseY + offset * direction);
      }
      burst(ARENA.laneCenters[safeLane], baseY, c.color, c.building ? 12 : 7);
      if (team === 'player') {
        game.message = `${c.name} deployed · ${c.blurb}`;
        game.messageTime = 1.7;
        tone(390 + c.cost * 22, .09, 'triangle', .028);
      }
    }
    return true;
  }

  function rotateHand() {
    if (!game) return;
    game.hand[game.selectedHand] = progress.deck[game.deckIndex % progress.deck.length];
    game.deckIndex = (game.deckIndex + 1) % progress.deck.length;
    game.selectedHand = clamp(game.selectedHand, 0, 3);
  }

  function deployPlayer(cardIndex, lane, targetY) {
    if (!game || game.status !== 'playing') return;
    const index = clamp(cardIndex | 0, 0, 3);
    const id = game.hand[index];
    if (deployCard(id, 'player', lane, targetY)) {
      game.selectedHand = index;
      rotateHand();
    }
  }

  function castSpell(c, team, lane, targetY) {
    const enemyTeam = team === 'player' ? 'enemy' : 'player';
    const centerX = ARENA.laneCenters[lane];
    burst(centerX, targetY, c.color, c.spell === 'meteor' ? 24 : 14);
    game.flash = .14;
    game.shake = Math.max(game.shake, c.spell === 'meteor' ? 8 : 4);
    if (c.spell === 'heal') {
      game.units.forEach((unit) => {
        if (unit.team === team && unit.lane === lane && Math.abs(unit.y - targetY) <= c.radius) {
          unit.hp = Math.min(unit.maxHp, unit.hp + c.heal);
          unit.hit = .15;
        }
      });
      if (team === 'player') addFloater(centerX, targetY - 20, `+${c.heal}`, COLORS.mint);
      tone(680, .16, 'sine', .035);
      return;
    }
    let affected = 0;
    game.units.forEach((unit) => {
      if (unit.team === enemyTeam && unit.lane === lane && Math.abs(unit.y - targetY) <= c.radius) {
        unit.hp -= c.damage;
        unit.hit = .2;
        affected += 1;
        if (c.spell === 'shock') unit.freeze = Math.max(unit.freeze, 1.1);
        if (c.spell === 'freeze') unit.slow = Math.max(unit.slow, 2.2);
      }
    });
    const towerY = enemyTeam === 'enemy' ? 79 : 579;
    if (Math.abs(targetY - towerY) < 52) damageTower(enemyTeam, c.damage * (c.spell === 'meteor' ? .58 : .2), c.color);
    if (team === 'player') addFloater(centerX, targetY - 20, affected ? `${affected} tagged` : 'impact', c.color);
    tone(c.spell === 'meteor' ? 92 : 260, c.spell === 'meteor' ? .22 : .12, 'sawtooth', .032);
  }

  function matchupMultiplier(attacker, target) {
    const a = card(attacker.cardId);
    const t = card(target.cardId);
    let mult = 1;
    if (a.counter === t.role) mult *= 1.36;
    if (a.role === 'splash' && t.role === 'swarm') mult *= 1.22;
    if (a.role === 'building' && t.role === 'rush') mult *= 1.22;
    if (a.role === 'tank' && t.role === 'building') mult *= .88;
    return mult;
  }

  function findTarget(attacker) {
    const opponents = game.units.filter((unit) => unit.team !== attacker.team && unit.lane === attacker.lane && unit.hp > 0);
    let best = null;
    let bestDistance = Infinity;
    opponents.forEach((opponent) => {
      const distance = Math.abs(opponent.y - attacker.y);
      const isAhead = attacker.team === 'player' ? opponent.y < attacker.y + 14 : opponent.y > attacker.y - 14;
      if (isAhead && distance < bestDistance) {
        best = opponent;
        bestDistance = distance;
      }
    });
    return best;
  }

  function hitUnit(target, damage, attacker, splash = 0) {
    if (!target || target.hp <= 0) return;
    const amount = damage * matchupMultiplier(attacker, target);
    target.hp -= amount;
    target.hit = .16;
    burst(target.x, target.y, card(attacker.cardId).color, 3);
    if (splash > 0) {
      game.units.forEach((near) => {
        if (near !== target && near.team !== attacker.team && near.lane === target.lane && Math.abs(near.y - target.y) <= splash) {
          near.hp -= damage * .62;
          near.hit = .12;
        }
      });
    }
  }

  function fire(attacker, target) {
    const c = card(attacker.cardId);
    const distance = Math.abs(target.y - attacker.y);
    const damage = c.damage || 0;
    if (c.range > 40 && distance > 32) {
      if (game.projectiles.length >= MAX_PROJECTILES) game.projectiles.shift();
      game.projectiles.push({ x: attacker.x, y: attacker.y, tx: target.x, ty: target.y, life: .13, maxLife: .13, attackerId: attacker.id, targetId: target.id, damage, splash: c.splash || 0, color: c.color });
    } else {
      hitUnit(target, damage, attacker, c.splash || 0);
    }
    attacker.attackTimer = c.attack;
    attacker.hit = .08;
  }

  function damageTower(which, amount, color = COLORS.coral) {
    if (!game || game.status !== 'playing') return;
    if (game.overtime) {
      if (which === 'enemy') game.enemyTower = 0;
      else game.playerTower = 0;
    } else if (which === 'enemy') {
      game.enemyTower = Math.max(0, game.enemyTower - amount);
    } else {
      game.playerTower = Math.max(0, game.playerTower - amount);
    }
    const x = W / 2;
    const y = which === 'enemy' ? 79 : 579;
    burst(x, y, color, game.overtime ? 25 : 12);
    game.shake = Math.max(game.shake, game.overtime ? 13 : 6);
    game.flash = .12;
    game.lastTowerHit = .35;
    addFloater(x, y + (which === 'enemy' ? 30 : -30), `-${Math.round(amount)}`, color);
    tone(which === 'enemy' ? 150 : 105, .14, 'square', .035);
    if (game.enemyTower <= 0) finishGame('victory');
    if (game.playerTower <= 0) finishGame('defeat');
  }

  function finishGame(result) {
    if (!game || game.status !== 'playing') return;
    game.status = result;
    resetInput();
    if (result === 'victory') {
      if (game.rung >= progress.rung) progress.rung = Math.min(8, game.rung + (game.rung < 8 ? 1 : 0));
      saveProgress();
      if (game.rung >= 8) screen = 'champion';
      tone(520, .18, 'triangle', .05);
      schedule(() => tone(780, .26, 'triangle', .045), 110);
    } else {
      tone(100, .22, 'sawtooth', .045);
    }
  }

  function beginOvertime() {
    if (!game || game.overtime || game.status !== 'playing') return;
    game.overtime = true;
    game.time = 0;
    game.message = 'SUDDEN DEATH · next core hit decides it';
    game.messageTime = 5;
    game.flash = .28;
    game.shake = 8;
    burst(W / 2, 337, COLORS.gold, 28);
    tone(230, .3, 'sawtooth', .04);
  }

  function updatePlayerEnergy(dt) { game.playerEnergy = Math.min(game.maxEnergy, game.playerEnergy + dt * 1.28); }
  function updateEnemyEnergy(dt) { game.enemyEnergy = Math.min(game.maxEnergy, game.enemyEnergy + dt * 1.18); }

  function enemyHasRole(role, lane) {
    return game.units.some((unit) => unit.team === 'enemy' && unit.lane === lane && card(unit.cardId).role === role && unit.hp > 0);
  }

  function chooseBotCard() {
    const available = game.bot.deck.filter((id) => card(id).cost <= game.enemyEnergy + .001);
    if (!available.length) return null;
    const playerUnits = game.units.filter((unit) => unit.team === 'player' && unit.hp > 0);
    const dangerous = playerUnits.sort((a, b) => b.y - a.y)[0];
    let wanted = available[0];
    if (dangerous) {
      const dangerRole = card(dangerous.cardId).role;
      const counter = available.find((id) => card(id).counter === dangerRole || (dangerRole === 'swarm' && card(id).role === 'splash'));
      if (counter) wanted = counter;
    }
    if (!dangerous || Math.random() > game.bot.skill) {
      wanted = available[Math.floor(Math.random() * available.length)];
    }
    return wanted;
  }

  function updateBot(dt) {
    game.aiTimer -= dt;
    if (game.aiTimer > 0) return;
    game.aiTimer = game.bot.gap * rand(.82, 1.18);
    const cardId = chooseBotCard();
    if (cardId === null) return;
    const c = card(cardId);
    const playerUnits = game.units.filter((unit) => unit.team === 'player' && unit.hp > 0);
    let lane = Math.random() < .5 ? 0 : 1;
    let targetY = rand(220, 455);
    if (playerUnits.length) {
      const threat = playerUnits.sort((a, b) => (b.team === 'player' ? b.y : 0) - (a.team === 'player' ? a.y : 0))[0];
      if (game.bot.skill > .5 && threat) lane = threat.lane;
      if (c.role === 'spell' && threat) targetY = threat.y;
    }
    if (c.role === 'spell' && c.spell !== 'heal') targetY = playerUnits.length ? playerUnits[0].y : rand(240, 430);
    if (c.role === 'spell' && c.spell === 'heal') targetY = 220;
    if (deployCard(cardId, 'enemy', lane, targetY)) {
      if (game.bot.skill > .7) {
        const nextThreat = game.units.find((unit) => unit.team === 'player' && unit.lane !== lane);
        if (nextThreat && c.role === 'building' && !enemyHasRole('building', lane)) { /* deliberate lane pressure */ }
      }
    }
  }

  function updateUnits(dt) {
    const dead = [];
    game.units.forEach((unit) => {
      if (unit.hp <= 0) { dead.push(unit); return; }
      const c = card(unit.cardId);
      unit.hit = Math.max(0, unit.hit - dt);
      unit.freeze = Math.max(0, unit.freeze - dt);
      unit.slow = Math.max(0, unit.slow - dt);
      unit.attackTimer -= dt;
      if (unit.freeze > 0) return;
      const target = findTarget(unit);
      const distance = target ? Math.abs(target.y - unit.y) : Infinity;
      const reach = Math.max(22, c.range || 20);
      if (target && distance <= reach) {
        if (unit.attackTimer <= 0) fire(unit, target);
      } else if (!unit.building) {
        const speed = (c.speed || 20) * (unit.slow > 0 ? .42 : 1);
        unit.y += (unit.team === 'player' ? -1 : 1) * speed * dt;
        unit.x = ARENA.laneCenters[unit.lane] + Math.sin(game.pulse * 2 + unit.phase) * 4;
        if ((unit.team === 'player' && unit.y < 101) || (unit.team === 'enemy' && unit.y > 557)) {
          damageTower(unit.team === 'player' ? 'enemy' : 'player', c.damage * (c.role === 'rush' ? 1.22 : .72), c.color);
          dead.push(unit);
        }
      }
    });
    if (dead.length) {
      const deadSet = new Set(dead);
      game.units = game.units.filter((unit) => !deadSet.has(unit));
      dead.forEach((unit) => burst(unit.x, unit.y, card(unit.cardId).color, 7));
    }
  }

  function updateProjectiles(dt) {
    const keep = [];
    game.projectiles.forEach((projectile) => {
      projectile.life -= dt;
      if (projectile.life <= 0) {
        const attacker = game.units.find((unit) => unit.id === projectile.attackerId && unit.hp > 0);
        const target = game.units.find((unit) => unit.id === projectile.targetId && unit.hp > 0);
        if (attacker && target) hitUnit(target, projectile.damage, attacker, projectile.splash);
        return;
      }
      keep.push(projectile);
    });
    game.projectiles = keep;
  }

  function updateEffects(dt) {
    game.particles.forEach((particle) => {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 34 * dt;
      particle.life -= dt;
    });
    game.particles = game.particles.filter((particle) => particle.life > 0).slice(-MAX_PARTICLES);
    game.floaters.forEach((floater) => { floater.y -= 25 * dt; floater.life -= dt; });
    game.floaters = game.floaters.filter((floater) => floater.life > 0).slice(-MAX_FLOATERS);
    game.shake = Math.max(0, game.shake - dt * 28);
    game.flash = Math.max(0, game.flash - dt);
    game.messageTime = Math.max(0, game.messageTime - dt);
    game.lastTowerHit = Math.max(0, game.lastTowerHit - dt);
  }

  function updateGame(dt) {
    if (!game || game.status !== 'playing') { updateEffects(dt); return; }
    game.pulse += dt;
    if (!game.overtime) {
      game.time = Math.max(0, game.time - dt);
      if (game.time <= 0) {
        const difference = Math.abs(game.playerTower - game.enemyTower);
        if (difference < 1) beginOvertime();
        else finishGame(game.enemyTower < game.playerTower ? 'victory' : 'defeat');
      }
    }
    updatePlayerEnergy(dt);
    updateEnemyEnergy(dt);
    while (queuedActions.length) {
      const action = queuedActions.shift();
      if (action.type === 'deploy') deployPlayer(action.cardIndex, action.lane, action.targetY);
    }
    updateBot(dt);
    updateUnits(dt);
    updateProjectiles(dt);
    updateEffects(dt);
  }

  function burst(x, y, color, count) {
    if (!game) return;
    const room = Math.max(0, MAX_PARTICLES - game.particles.length);
    const amount = Math.min(count, room);
    for (let i = 0; i < amount; i += 1) {
      const angle = rand(0, TAU);
      const speed = rand(18, 72);
      game.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 18, life: rand(.24, .7), maxLife: .7, size: rand(1.5, 4), color });
    }
  }

  function addFloater(x, y, text, color) {
    if (!game) return;
    if (game.floaters.length >= MAX_FLOATERS) game.floaters.shift();
    game.floaters.push({ x, y, text: String(text).slice(0, 24), color, life: 1, maxLife: 1 });
  }

  function pathRoundRect(x, y, w, h, radius) {
    const r = Math.min(Math.max(0, radius), Math.min(w, h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function roundedRect(x, y, w, h, radius, fill, stroke, lineWidth = 1) {
    pathRoundRect(x, y, w, h, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function text(value, x, y, size, color = COLORS.text, align = 'left', weight = 500) {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), x, y);
  }

  function drawBackground() {
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0, 0, W, H);
    const gradient = ctx.createLinearGradient(0, 0, W, H);
    gradient.addColorStop(0, '#0d1a2b');
    gradient.addColorStop(.54, '#07131f');
    gradient.addColorStop(1, '#0a1c25');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = .08;
    ctx.strokeStyle = COLORS.mint;
    ctx.lineWidth = 1;
    for (let i = -H; i < W + H; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - H, H); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawHeader(title, right) {
    text(title, 16, 28, 17, COLORS.text, 'left', 800);
    if (right) text(right, W - 16, 28, 12, COLORS.muted, 'right', 700);
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(14, 51); ctx.lineTo(W - 14, 51); ctx.stroke();
  }

  function drawButton(rect, label, accent = COLORS.mint, disabled = false) {
    roundedRect(rect.x, rect.y, rect.w, rect.h, 12, disabled ? '#182331' : '#162c3c', disabled ? '#30404a' : accent, 1.5);
    text(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, 12, disabled ? '#637680' : COLORS.text, 'center', 800);
  }

  function drawMenu() {
    drawBackground();
    text('TOWERLINE', W / 2, 49, 29, COLORS.text, 'center', 900);
    text('DUEL', W / 2, 80, 39, COLORS.mint, 'center', 900);
    text('A free lane battle of timing and counterplay', W / 2, 108, 12, COLORS.muted, 'center', 500);
    roundedRect(15, 128, 360, 53, 14, '#0e2130', '#274c5a');
    text(`RUNG ${progress.rung} / 8`, 28, 148, 13, COLORS.gold, 'left', 800);
    text(`${Math.min(24, progress.rung * 3)} / 24 cards unlocked`, 28, 166, 11, COLORS.muted, 'left', 600);
    drawButton({ x: 15, y: 194, w: 218, h: 52 }, `DUEL RUNG ${progress.rung}`, COLORS.mint);
    drawButton({ x: 242, y: 194, w: 133, h: 52 }, 'DECK FORGE', COLORS.violet);
    text('LADDER // THREE CARDS PER RUNG', 16, 272, 11, COLORS.muted, 'left', 800);
    LADDER.forEach((rung, index) => {
      const y = 286 + index * 43;
      const unlocked = index < progress.rung;
      const current = index + 1 === progress.rung;
      roundedRect(15, y, 360, 37, 9, current ? '#183646' : '#0c1927', current ? rung.accent : '#1b3041');
      text(String(index + 1).padStart(2, '0'), 28, y + 18, 11, unlocked ? rung.accent : '#5c6d78', 'left', 900);
      text(rung.name, 55, y + 12, 11, unlocked ? COLORS.text : '#6a7a84', 'left', 800);
      text(rung.style, 55, y + 27, 9, unlocked ? COLORS.muted : '#53636d', 'left', 500);
      const unlockNames = [index * 3, index * 3 + 1, index * 3 + 2].map((id) => CARDS[id].short).join(' · ');
      text(unlockNames, 365, y + 12, 9, unlocked ? '#cae6ea' : '#53636d', 'right', 700);
      text(unlocked ? 'READY' : 'LOCKED', 365, y + 27, 8, unlocked ? rung.accent : '#53636d', 'right', 800);
    });
    text('Win rungs to unlock cards. No chests. No shop. Just play.', W / 2, 653, 10, COLORS.muted, 'center', 500);
    text('Tap DUEL to deploy · tap DECK FORGE to tune your eight', W / 2, 674, 10, '#698691', 'center', 500);
  }

  function drawForge() {
    drawBackground();
    drawHeader('DECK FORGE', `${Math.min(24, progress.rung * 3)}/24 READY`);
    drawButton({ x: 12, y: 58, w: 88, h: 48 }, '← BACK', COLORS.muted);
    text('EIGHT-SLOT DECK', 112, 72, 11, COLORS.muted, 'left', 800);
    text('Tap a slot, then a ready card', 112, 91, 10, '#6f8e99', 'left', 500);
    for (let i = 0; i < 8; i += 1) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 8 + col * 95;
      const y = 111 + row * 55;
      const c = card(progress.deck[i]);
      const selected = i === selectedDeckSlot;
      roundedRect(x, y, 88, 49, 9, selected ? '#193c45' : '#102333', selected ? COLORS.mint : '#294153', selected ? 2 : 1);
      ctx.fillStyle = c.color; ctx.fillRect(x, y, 4, 49);
      text(`${i + 1}`, x + 12, y + 15, 9, COLORS.muted, 'left', 800);
      text(c.short, x + 26, y + 16, 11, COLORS.text, 'left', 800);
      text(`◆ ${c.cost}`, x + 12, y + 35, 9, c.color, 'left', 700);
      text(c.role, x + 80, y + 35, 8, COLORS.muted, 'right', 600);
    }
    text('CARD LIBRARY', 12, 230, 11, COLORS.muted, 'left', 800);
    for (let i = 0; i < CARDS.length; i += 1) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 8 + col * 95;
      const y = 242 + row * 63;
      const c = CARDS[i];
      const ready = i < progress.rung * 3;
      roundedRect(x, y, 88, 56, 9, ready ? '#112536' : '#0a111b', ready ? c.color : '#25313a', ready ? 1.2 : 1);
      ctx.fillStyle = ready ? c.color : '#34434b'; ctx.fillRect(x, y, 4, 56);
      text(c.short, x + 10, y + 16, 10, ready ? COLORS.text : '#5f7079', 'left', 800);
      text(`◆ ${c.cost}`, x + 10, y + 36, 9, ready ? c.color : '#5f7079', 'left', 700);
      text(ready ? c.role : `R${Math.floor(i / 3) + 1}`, x + 80, y + 36, 8, ready ? COLORS.muted : '#5f7079', 'right', 600);
    }
    text('Flat power. Matchups matter. Slots can repeat cards.', W / 2, 680, 10, COLORS.muted, 'center', 500);
  }

  function drawArena() {
    roundedRect(14, 58, 362, 500, 18, '#091521', '#223b4b');
    ctx.save();
    pathRoundRect(14, 58, 362, 500, 18); ctx.clip();
    ctx.fillStyle = '#0a1b25'; ctx.fillRect(14, ARENA.top, 362, ARENA.bottom - ARENA.top);
    [0, 1].forEach((lane) => {
      const x = lane === 0 ? 28 : 194;
      ctx.fillStyle = lane === 0 ? 'rgba(61,170,169,.075)' : 'rgba(92,127,207,.075)';
      ctx.fillRect(x, ARENA.top, 150, ARENA.bottom - ARENA.top);
      ctx.strokeStyle = '#214050'; ctx.lineWidth = 1;
      ctx.strokeRect(x, ARENA.top, 150, ARENA.bottom - ARENA.top);
    });
    ctx.fillStyle = 'rgba(111,202,196,.12)'; ctx.fillRect(14, 329, 362, 16);
    ctx.fillStyle = '#5cc3bd'; ctx.globalAlpha = .45; ctx.fillRect(14, 337, 362, 1); ctx.globalAlpha = 1;
    for (let y = ARENA.top + 28; y < ARENA.bottom; y += 35) {
      ctx.strokeStyle = 'rgba(135,196,202,.08)'; ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(376, y); ctx.stroke();
    }
    ctx.restore();
    text('ENEMY ZONE', 26, 124, 8, '#587984', 'left', 800);
    text('YOUR ZONE', 364, 536, 8, '#587984', 'right', 800);
  }

  function drawTower(y, hp, team) {
    const isEnemy = team === 'enemy';
    const color = isEnemy ? COLORS.enemy : COLORS.player;
    const x = W / 2;
    const hit = game && game.lastTowerHit > 0;
    ctx.save();
    if (hit) { ctx.shadowBlur = 18; ctx.shadowColor = color; }
    ctx.fillStyle = '#132c3d';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 31, y + (isEnemy ? 18 : -18)); ctx.lineTo(x - 24, y + (isEnemy ? -14 : 14)); ctx.lineTo(x - 10, y + (isEnemy ? -25 : 25)); ctx.lineTo(x + 10, y + (isEnemy ? -25 : 25)); ctx.lineTo(x + 24, y + (isEnemy ? -14 : 14)); ctx.lineTo(x + 31, y + (isEnemy ? 18 : -18)); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.globalAlpha = .75;
    ctx.fillRect(x - 7, y + (isEnemy ? -11 : 1), 14, 12); ctx.globalAlpha = 1;
    ctx.restore();
    roundedRect(142, isEnemy ? 61 : 588, 106, 9, 4, '#122332', '#294153');
    ctx.fillStyle = color; ctx.fillRect(144, isEnemy ? 63 : 590, 102 * clamp(hp / 1000, 0, 1), 5);
    text(isEnemy ? 'OPPONENT CORE' : 'YOUR CORE', x, y + (isEnemy ? -35 : 35), 8, color, 'center', 800);
    text(`${Math.ceil(hp)} HP`, x, y + (isEnemy ? -47 : 47), 8, COLORS.muted, 'center', 600);
  }

  function drawEntity(unit) {
    const c = card(unit.cardId);
    const color = unit.team === 'player' ? c.color : '#ff7782';
    const radius = c.building ? 16 : c.role === 'tank' ? 15 : c.role === 'swarm' ? 8 : 11;
    ctx.save();
    ctx.translate(unit.x, unit.y);
    if (unit.hit > 0) { ctx.shadowBlur = 14; ctx.shadowColor = '#ffffff'; }
    ctx.globalAlpha = unit.freeze > 0 ? .6 : 1;
    ctx.fillStyle = '#102033'; ctx.strokeStyle = color; ctx.lineWidth = 2;
    if (c.building) { roundedRect(-16, -14, 32, 28, 7, '#162b3b', color, 2); ctx.fillStyle = color; ctx.globalAlpha = .65; ctx.fillRect(-5, -9, 10, 18); }
    else if (c.role === 'tank') { ctx.beginPath(); ctx.moveTo(0, -radius - 3); ctx.lineTo(radius + 3, radius); ctx.lineTo(0, radius + 5); ctx.lineTo(-radius - 3, radius); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else if (c.role === 'rush') { ctx.beginPath(); ctx.moveTo(radius + 4, 0); ctx.lineTo(-radius, -radius); ctx.lineTo(-radius + 3, 0); ctx.lineTo(-radius, radius); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#dffcff'; ctx.beginPath(); ctx.arc(3, -3, 2.1, 0, TAU); ctx.fill();
    ctx.restore();
    const barW = c.building ? 30 : 25;
    ctx.fillStyle = '#08121b'; ctx.fillRect(unit.x - barW / 2, unit.y - radius - 11, barW, 3);
    ctx.fillStyle = unit.team === 'player' ? COLORS.player : COLORS.enemy; ctx.fillRect(unit.x - barW / 2, unit.y - radius - 11, barW * clamp(unit.hp / unit.maxHp, 0, 1), 3);
  }

  function drawProjectiles() {
    game.projectiles.forEach((projectile) => {
      const t = 1 - clamp(projectile.life / projectile.maxLife, 0, 1);
      const x = projectile.x + (projectile.tx - projectile.x) * t;
      const y = projectile.y + (projectile.ty - projectile.y) * t;
      ctx.fillStyle = projectile.color; ctx.shadowBlur = 10; ctx.shadowColor = projectile.color;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    });
  }

  function drawEffects() {
    game.particles.forEach((particle) => {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, TAU); ctx.fill();
    });
    game.floaters.forEach((floater) => {
      ctx.globalAlpha = clamp(floater.life, 0, 1);
      text(floater.text, floater.x, floater.y, 10, floater.color, 'center', 800);
    });
    ctx.globalAlpha = 1;
  }

  function drawHand() {
    ctx.fillStyle = '#07111b'; ctx.fillRect(0, 601, W, 99);
    text(`ENERGY ${game.playerEnergy.toFixed(1)} / ${game.maxEnergy}`, 12, 611, 10, COLORS.muted, 'left', 800);
    ctx.fillStyle = '#162a37'; ctx.fillRect(132, 608, 246, 6);
    ctx.fillStyle = COLORS.mint; ctx.fillRect(132, 608, 246 * clamp(game.playerEnergy / game.maxEnergy, 0, 1), 6);
    game.hand.forEach((id, index) => {
      const c = card(id);
      const x = 8 + index * 96;
      const y = 622;
      const selected = index === game.selectedHand;
      const affordable = game.playerEnergy + .001 >= c.cost;
      roundedRect(x, y, 88, 69, 10, selected ? '#1a3c43' : '#102334', selected ? COLORS.mint : c.color, selected ? 2.5 : 1.2);
      ctx.fillStyle = c.color; ctx.fillRect(x, y, 4, 69);
      text(String(index + 1), x + 12, y + 13, 9, COLORS.muted, 'left', 900);
      text(c.short, x + 12, y + 31, 11, affordable ? COLORS.text : '#647983', 'left', 800);
      text(`◆ ${c.cost}`, x + 12, y + 54, 10, affordable ? c.color : '#647983', 'left', 800);
      text(c.role === 'building' ? 'BUILD' : c.role.toUpperCase(), x + 80, y + 54, 7, COLORS.muted, 'right', 700);
      if (!affordable) { ctx.fillStyle = 'rgba(3,8,13,.4)'; ctx.fillRect(x, y, 88, 69); }
    });
    {
      ctx.fillStyle = 'rgba(4,10,16,.82)'; ctx.fillRect(0, 587, W, 21);
      const hint = game.messageTime > 0 ? game.message : 'Drag a card into a lane · 1–4 choose · ←→ lane · Space deploy';
      text(hint, W / 2, 598, 9, game.overtime ? COLORS.gold : COLORS.text, 'center', 700);
    }
  }

  function drawGame() {
    drawBackground();
    const bot = game.bot;
    drawHeader(`RUNG ${game.rung} · ${bot.name}`, game.overtime ? 'SUDDEN DEATH' : formatTime(game.time));
    text(bot.style, 16, 68, 9, bot.accent, 'left', 700);
    text(`ENEMY ENERGY ${game.enemyEnergy.toFixed(1)}`, W - 16, 68, 9, '#718e9a', 'right', 700);
    ctx.save();
    const shakeX = game.shake ? rand(-game.shake, game.shake) : 0;
    const shakeY = game.shake ? rand(-game.shake * .35, game.shake * .35) : 0;
    ctx.translate(shakeX, shakeY);
    drawArena();
    drawTower(79, game.enemyTower, 'enemy');
    drawTower(579, game.playerTower, 'player');
    game.units.slice().sort((a, b) => a.y - b.y).forEach(drawEntity);
    drawProjectiles();
    drawEffects();
    ctx.restore();
    drawHand();
    if (activeDrag && game.status === 'playing') {
      const c = card(game.hand[activeDrag.cardIndex]);
      ctx.globalAlpha = .86;
      roundedRect(activeDrag.x - 34, activeDrag.y - 24, 68, 48, 12, '#173847', c.color, 2);
      text(c.short, activeDrag.x, activeDrag.y, 10, COLORS.text, 'center', 800);
      ctx.globalAlpha = 1;
    }
    if (game.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${game.flash * .18})`; ctx.fillRect(0, 0, W, H); }
    if (game.status !== 'playing') drawResult();
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }

  function drawResult() {
    ctx.fillStyle = 'rgba(3,8,14,.72)'; ctx.fillRect(0, 0, W, H);
    const victory = game.status === 'victory';
    roundedRect(28, 230, 334, 236, 20, '#102334', victory ? COLORS.mint : COLORS.coral, 2);
    text(victory ? 'CORE BREACHED' : 'LINE LOST', W / 2, 276, 27, victory ? COLORS.mint : COLORS.coral, 'center', 900);
    text(victory ? (game.rung >= 8 ? 'The circuit crowns you.' : `Rung ${game.rung + 1} is now live.`) : 'Your counter window is still open.', W / 2, 315, 12, COLORS.text, 'center', 600);
    text(`Core score  ${Math.ceil(game.enemyTower)} — ${Math.ceil(game.playerTower)}`, W / 2, 351, 11, COLORS.muted, 'center', 700);
    drawButton({ x: 48, y: 385, w: 138, h: 52 }, victory ? 'REMATCH' : 'RETRY RUNG', victory ? COLORS.mint : COLORS.coral);
    drawButton({ x: 204, y: 385, w: 138, h: 52 }, 'LADDER', COLORS.violet);
  }

  function drawChampion() {
    drawBackground();
    text('CHAMPION', W / 2, 160, 38, COLORS.gold, 'center', 900);
    text('THE TOWERLINE IS YOURS', W / 2, 208, 14, COLORS.text, 'center', 800);
    roundedRect(38, 260, 314, 150, 18, '#12283a', '#80683e', 2);
    text('8 / 8', W / 2, 302, 42, COLORS.gold, 'center', 900);
    text('rungs cleared', W / 2, 344, 13, COLORS.muted, 'center', 600);
    text('24 flat-power cards unlocked', W / 2, 372, 11, COLORS.mint, 'center', 700);
    drawButton({ x: 42, y: 458, w: 145, h: 54 }, 'REMATCH RUNG 8', COLORS.gold);
    drawButton({ x: 203, y: 458, w: 145, h: 54 }, 'DECK FORGE', COLORS.violet);
    text('Mastery is the progression.', W / 2, 565, 13, COLORS.text, 'center', 700);
    text('No chests. No timers. No shop.', W / 2, 590, 11, COLORS.muted, 'center', 500);
  }

  function render() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    if (screen === 'menu') drawMenu();
    else if (screen === 'forge') drawForge();
    else if (screen === 'champion') drawChampion();
    else if (screen === 'game' && game) drawGame();
    else drawMenu();
  }

  function forgeHit(x, y) {
    if (pointIn(x, y, { x: 12, y: 58, w: 88, h: 48 })) return { type: 'back' };
    for (let i = 0; i < 8; i += 1) {
      const col = i % 4; const row = Math.floor(i / 4);
      const rect = { x: 8 + col * 95, y: 111 + row * 55, w: 88, h: 49 };
      if (pointIn(x, y, rect)) return { type: 'slot', index: i };
    }
    for (let i = 0; i < CARDS.length; i += 1) {
      const col = i % 4; const row = Math.floor(i / 4);
      const rect = { x: 8 + col * 95, y: 242 + row * 63, w: 88, h: 56 };
      if (pointIn(x, y, rect)) return { type: 'card', index: i };
    }
    return null;
  }

  function gameButtonHit(x, y) {
    if (pointIn(x, y, { x: 48, y: 385, w: 138, h: 52 })) return 'retry';
    if (pointIn(x, y, { x: 204, y: 385, w: 138, h: 52 })) return 'ladder';
    return null;
  }

  function handIndexAt(x, y) {
    if (y < 620 || y > 696) return -1;
    for (let i = 0; i < 4; i += 1) if (pointIn(x, y, { x: 8 + i * 96, y: 622, w: 88, h: 69 })) return i;
    return -1;
  }

  function laneAt(x) { return x < W / 2 ? 0 : 1; }

  function handlePointerDown(event) {
    event.preventDefault();
    unlockAudio();
    const pointerId = event.pointerId;
    const p = mapPointer(event);
    if (pointerMap.size >= MAX_POINTERS) {
      const oldest = pointerMap.keys().next().value;
      pointerMap.delete(oldest);
      try { canvas.releasePointerCapture(oldest); } catch (error) { /* pointer may already be gone */ }
    }
    pointerMap.set(pointerId, { pointerId, x: p.x, y: p.y, startX: p.x, startY: p.y, moved: false, screen });
    try { canvas.setPointerCapture(pointerId); } catch (error) { /* capture is not available in every embedded webview */ }
    if (orientationPaused || hiddenPaused) return;
    if (screen === 'menu') {
      if (pointIn(p.x, p.y, { x: 15, y: 194, w: 218, h: 52 })) startGame(progress.rung);
      else if (pointIn(p.x, p.y, { x: 242, y: 194, w: 133, h: 52 })) openForge();
      return;
    }
    if (screen === 'forge') {
      const hit = forgeHit(p.x, p.y);
      if (hit && hit.type === 'back') goMenu();
      else if (hit && hit.type === 'slot') selectedDeckSlot = hit.index;
      else if (hit && hit.type === 'card' && hit.index < progress.rung * 3) {
        progress.deck[selectedDeckSlot] = hit.index;
        selectedDeckSlot = (selectedDeckSlot + 1) % 8;
        saveProgress();
        tone(440, .08, 'triangle', .03);
      }
      return;
    }
    if (screen === 'champion') {
      if (pointIn(p.x, p.y, { x: 42, y: 458, w: 145, h: 54 })) startGame(8);
      else if (pointIn(p.x, p.y, { x: 203, y: 458, w: 145, h: 54 })) openForge();
      return;
    }
    if (screen !== 'game' || !game) return;
    if (game.status !== 'playing') {
      const action = gameButtonHit(p.x, p.y);
      if (action === 'retry') startGame(game.rung);
      else if (action === 'ladder') goMenu();
      return;
    }
    const handIndex = handIndexAt(p.x, p.y);
    if (handIndex >= 0) {
      activeDrag = { pointerId, cardIndex: handIndex, x: p.x, y: p.y };
      return;
    }
    if (p.y >= ARENA.top && p.y <= ARENA.bottom) {
      game.laneFocus = laneAt(p.x);
      pointerMap.get(pointerId).laneTap = true;
    }
  }

  function handlePointerMove(event) {
    event.preventDefault();
    const pointerId = event.pointerId;
    const record = pointerMap.get(pointerId);
    if (!record) return;
    const p = mapPointer(event);
    record.x = p.x; record.y = p.y;
    if (Math.hypot(p.x - record.startX, p.y - record.startY) > 8) record.moved = true;
    if (activeDrag && activeDrag.pointerId === pointerId) { activeDrag.x = p.x; activeDrag.y = p.y; }
  }

  function handlePointerUp(event, canceled = false) {
    event.preventDefault();
    const pointerId = event.pointerId;
    const record = pointerMap.get(pointerId);
    if (!record) return;
    const p = mapPointer(event);
    if (!canceled && screen === 'game' && game && game.status === 'playing') {
      if (activeDrag && activeDrag.pointerId === pointerId) {
        if (record.moved && p.y >= ARENA.top - 10 && p.y <= ARENA.bottom + 12) queueAction({ type: 'deploy', cardIndex: activeDrag.cardIndex, lane: laneAt(p.x), targetY: p.y });
        else game.selectedHand = activeDrag.cardIndex;
        activeDrag = null;
      } else if (record.laneTap && !record.moved) {
        queueAction({ type: 'deploy', cardIndex: game.selectedHand, lane: laneAt(p.x), targetY: p.y });
      }
    }
    pointerMap.delete(pointerId);
    try { canvas.releasePointerCapture(pointerId); } catch (error) { /* already released */ }
  }

  function handleKeyDown(event) {
    const key = event.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(key)) event.preventDefault();
    unlockAudio();
    if (key === 'Escape') {
      if (screen === 'forge' || screen === 'champion') goMenu();
      else if (screen === 'game') goMenu();
      return;
    }
    if (screen === 'menu' && (key === 'Enter' || key === ' ')) { startGame(progress.rung); return; }
    if (screen === 'champion' && (key === 'Enter' || key === ' ')) { startGame(8); return; }
    if (screen === 'forge') {
      if (/^[1-8]$/.test(key)) selectedDeckSlot = Number(key) - 1;
      return;
    }
    if (screen !== 'game' || !game || game.status !== 'playing') return;
    if (/^[1-4]$/.test(key)) { game.selectedHand = Number(key) - 1; tone(300 + game.selectedHand * 35, .05, 'triangle', .018); }
    if (key === 'ArrowLeft') game.laneFocus = 0;
    if (key === 'ArrowRight') game.laneFocus = 1;
    if (key === 'ArrowUp') game.selectedHand = (game.selectedHand + 3) % 4;
    if (key === 'ArrowDown') game.selectedHand = (game.selectedHand + 1) % 4;
    if (key === ' ' || key === 'Enter') queueAction({ type: 'deploy', cardIndex: game.selectedHand, lane: game.laneFocus, targetY: game.laneFocus === 0 ? 390 : 390 });
    if (keys.size >= MAX_KEYS) keys.clear();
    keys.add(key);
  }

  function handleKeyUp(event) { keys.delete(event.key); }

  function updatePauseState() {
    resetInput();
    orientationPaused = isLandscape();
    hiddenPaused = document.hidden;
    rotateOverlay.setAttribute('aria-hidden', orientationPaused ? 'false' : 'true');
    lastFrame = performance.now();
  }

  function frame(now) {
    const raw = Math.max(0, (now - lastFrame) / 1000);
    lastFrame = now;
    const dt = Math.min(raw, 0.033);
    if (!orientationPaused && !hiddenPaused) updateGame(dt);
    render();
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
  canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
  canvas.addEventListener('pointerup', handlePointerUp, { passive: false });
  canvas.addEventListener('pointercancel', (event) => handlePointerUp(event, true), { passive: false });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  // Pointer Events are the shared touch/mouse path; these prevent mobile browser gestures too.
  canvas.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  canvas.addEventListener('touchend', (event) => event.preventDefault(), { passive: false });
  window.addEventListener('keydown', handleKeyDown, { passive: false });
  window.addEventListener('keyup', handleKeyUp, { passive: false });
  window.addEventListener('blur', () => { resetInput(); });
  document.addEventListener('visibilitychange', updatePauseState);
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', () => { updatePauseState(); resizeCanvas(); });

  resizeCanvas();
  render();
  requestAnimationFrame(frame);
})();
