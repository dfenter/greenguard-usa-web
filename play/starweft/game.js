(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const reader = document.getElementById('screen-reader');
  const W = 390, H = 700, SAVE_KEY = 'starweft-save-v1';
  const MAX_PARTICLES = 120, MAX_POPUPS = 24, MAX_POINTERS = 8, MAX_TIMERS = 12;

  const ELEMENTS = [
    { id: 'ember', label: 'EMBER', short: 'E', color: '#ff765d', soft: '#ffb197' },
    { id: 'tide', label: 'TIDE', short: 'T', color: '#55c9ff', soft: '#b9eeff' },
    { id: 'bloom', label: 'BLOOM', short: 'B', color: '#b4e46c', soft: '#e2ffb3' }
  ];
  const HEROES = [
    { name: 'Sola Nacre', call: 'FLARE', element: 'ember', maxHp: 118, basic: 17, skill: 31, ult: 60, break: 25, role: 'STRIKER', blurb: 'Direct heat, no wasted motion.' },
    { name: 'Brin Quill', call: 'WAVE', element: 'tide', maxHp: 132, basic: 14, skill: 25, ult: 49, break: 23, role: 'ANCHOR', blurb: 'Steady hands for rough rails.' },
    { name: 'Oren Pike', call: 'GRAFT', element: 'bloom', maxHp: 108, basic: 12, skill: 21, ult: 43, break: 22, role: 'MENDER', blurb: 'Reads the living current.' },
    { name: 'Veya Moss', call: 'SPARK', element: 'ember', maxHp: 96, basic: 15, skill: 29, ult: 55, break: 28, role: 'SCOUT', blurb: 'Fast eyes, faster follow-through.' },
    { name: 'Nyx Lumen', call: 'UNDERTOW', element: 'tide', maxHp: 116, basic: 13, skill: 34, ult: 64, break: 35, role: 'BREAKER', blurb: 'A quiet answer to loud armor.' },
    { name: 'Mio Rill', call: 'VERDURE', element: 'bloom', maxHp: 124, basic: 13, skill: 24, ult: 50, break: 27, role: 'TEMPO', blurb: 'Keeps the whole crew moving.' }
  ];
  const ENEMIES = {
    cinder: { name: 'Cinder Kest', weak: 'tide', maxHp: 82, breakMax: 54, atk: 12, color: '#db634d', shape: 'kite', xp: 45 },
    drift: { name: 'Drift Nib', weak: 'bloom', maxHp: 68, breakMax: 42, atk: 10, color: '#8b78dc', shape: 'orb', xp: 40 },
    mire: { name: 'Mire Bell', weak: 'ember', maxHp: 94, breakMax: 58, atk: 14, color: '#6d9e71', shape: 'bell', xp: 52 },
    glass: { name: 'Glass Talon', weak: 'tide', maxHp: 118, breakMax: 62, atk: 16, color: '#6ab5d4', shape: 'talon', xp: 64 },
    siren: { name: 'Silt Siren', weak: 'bloom', maxHp: 136, breakMax: 70, atk: 18, color: '#cc759f', shape: 'siren', xp: 70 },
    prowler: { name: 'Gale Prowler', weak: 'ember', maxHp: 128, breakMax: 65, atk: 17, color: '#a19bd1', shape: 'kite', xp: 68 },
    needle: { name: 'Needle Finch', weak: 'tide', maxHp: 152, breakMax: 76, atk: 20, color: '#e0b757', shape: 'talon', xp: 82 },
    leech: { name: 'Cloud Leech', weak: 'bloom', maxHp: 178, breakMax: 84, atk: 22, color: '#7bd4b5', shape: 'orb', xp: 90 },
    warden: { name: 'Rift Warden', weak: 'tide', maxHp: 310, breakMax: 118, atk: 25, color: '#ef835d', shape: 'boss', xp: 240 },
    engine: { name: 'Brine Engine', weak: 'ember', maxHp: 390, breakMax: 132, atk: 29, color: '#4dbbd2', shape: 'boss', xp: 320 },
    crown: { name: 'Crown of Quiet', weak: 'bloom', maxHp: 500, breakMax: 150, atk: 34, color: '#d99c4d', shape: 'boss', xp: 500 }
  };
  const BATTLE_PLAN = [
    { zone: 1, rail: 'SUNSPOOL', enemies: ['cinder'] },
    { zone: 1, rail: 'SUNSPOOL', enemies: ['drift', 'cinder'] },
    { zone: 1, rail: 'SUNSPOOL', enemies: ['mire'] },
    { zone: 1, rail: 'SUNSPOOL', enemies: ['mire', 'drift'] },
    { zone: 1, rail: 'SUNSPOOL', enemies: ['warden'], boss: true },
    { zone: 2, rail: 'MISTFOLD', enemies: ['glass'] },
    { zone: 2, rail: 'MISTFOLD', enemies: ['siren', 'glass'] },
    { zone: 2, rail: 'MISTFOLD', enemies: ['prowler'] },
    { zone: 2, rail: 'MISTFOLD', enemies: ['siren', 'prowler'] },
    { zone: 2, rail: 'MISTFOLD', enemies: ['engine'], boss: true },
    { zone: 3, rail: 'NIGHTLACE', enemies: ['needle'] },
    { zone: 3, rail: 'NIGHTLACE', enemies: ['leech', 'needle'] },
    { zone: 3, rail: 'NIGHTLACE', enemies: ['leech'] },
    { zone: 3, rail: 'NIGHTLACE', enemies: ['needle', 'leech'] },
    { zone: 3, rail: 'NIGHTLACE', enemies: ['crown'], boss: true }
  ];
  const STORIES = [
    { lines: ['The sky-rail is losing altitude one knot at a time.', 'Four hands, one route: reach the quiet end of the line.'] },
    { lines: ['A red-winged thing peels away from the signal mast.'] },
    { lines: ['Brin spots a second pulse under the railglass. It is not weather.'] },
    { lines: ['The crew learns the first rule of the high route: read the color before the teeth.'] },
    { lines: ['The SunsPool relay folds around a wound in the sky.'] },
    { lines: ['The Rift Warden falls. A fifth traveler steps from the maintenance car.', 'Nyx Lumen joins the crew; their tidecraft can crack stubborn armor.'], recruit: 4 },
    { lines: ['MistFold begins where the sunlight ends. The rail hums in a new key.'] },
    { lines: ['A glass-winged hunter mirrors every move.'] },
    { lines: ['Oren marks the safe rhythm in chalk; Veya turns it into a dare.'] },
    { lines: ['A brine engine blocks the splice toward Nightlace.'] },
    { lines: ['The engine goes still. Mio Rill is waiting on the far platform.', 'Mio joins the crew and tunes every pulse back toward life.'], recruit: 5 },
    { lines: ['Nightlace has no sun, but the rails are bright with old promises.'] },
    { lines: ['Needle fins descend. The route wants a toll in momentum.'] },
    { lines: ['The last signals are silent. Whatever waits at the crown has heard you coming.'] },
    { lines: ['Beyond this boss is open sky. Hold the line.'] }
  ];

  let view = { w: 390, h: 700, dpr: 1, scale: 1, ox: 0, oy: 0, portrait: true };
  let state = bootState();
  let bootSave = readSave();
  let saveAvailable = !!bootSave;
  let particles = [], popups = [], stars = [], pointerControls = new Map();
  let heldKeys = new Set(), actionQueue = [], pendingTimers = new Set();
  let audioCtx = null, lastFrame = 0, nowTime = 0, shake = 0, flash = 0;
  let noticeText = '', noticeTime = 0, inspectElement = 'ember';

  for (let i = 0; i < 44; i++) stars.push({ x: (i * 83) % W, y: (i * 47) % H, r: 0.5 + (i % 3) * 0.45, a: 0.25 + (i % 5) * 0.1 });

  function bootState() {
    return { started: false, scene: 'start', battleIndex: 0, storyLine: 0, unlocked: [0, 1, 2, 3], activeParty: [0, 1, 2, 3], rosterCursor: 0, partyHp: HEROES.map(h => h.maxHp), ults: [0, 0, 0, 0, 0, 0], sp: 2, score: 0, runTime: 0, bestScore: 0, battle: null, saveClock: 0, won: false };
  }

  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function finite(value, min, max) { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
  function int(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
  function validIdList(list, max, minLength) { return Array.isArray(list) && list.length >= minLength && list.length <= max && list.every(v => int(v, 0, HEROES.length - 1)); }

  function readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (typeof raw !== 'string' || raw.length > 60000) return null;
      const data = JSON.parse(raw);
      if (!isObject(data) || data.version !== 1 || !isObject(data.state)) return null;
      const s = data.state;
      if (!['story', 'battle', 'roster', 'win', 'fail'].includes(s.scene) || !int(s.battleIndex, 0, BATTLE_PLAN.length)) return null;
      if (!validIdList(s.unlocked, HEROES.length, 4) || !validIdList(s.activeParty, 4, 1)) return null;
      if (!s.activeParty.every(id => s.unlocked.includes(id))) return null;
      if (!Array.isArray(s.partyHp) || s.partyHp.length !== HEROES.length || !s.partyHp.every((v, i) => finite(v, 0, HEROES[i].maxHp))) return null;
      if (!Array.isArray(s.ults) || s.ults.length !== HEROES.length || !s.ults.every(v => finite(v, 0, 100))) return null;
      if (!int(s.storyLine, 0, 4) || !finite(s.sp, 0, 5) || !finite(s.score, 0, 9999999) || !finite(s.runTime, 0, 9999999)) return null;
      const out = bootState();
      Object.assign(out, { started: true, scene: s.scene, battleIndex: s.battleIndex, storyLine: s.storyLine, unlocked: s.unlocked.slice(0, 6), activeParty: s.activeParty.slice(0, 4), rosterCursor: int(s.rosterCursor, 0, 3) ? s.rosterCursor : 0, partyHp: s.partyHp.slice(), ults: s.ults.slice(), sp: s.sp, score: s.score, runTime: s.runTime, bestScore: finite(s.bestScore, 0, 9999999) ? s.bestScore : 0, won: s.won === true });
      if (s.scene === 'battle' || s.scene === 'fail') {
        const battle = restoreBattle(s.battle);
        if (!battle) { out.scene = 'story'; out.battle = null; }
        else out.battle = battle;
      }
      return out;
    } catch (_) { return null; }
  }

  function restoreBattle(data) {
    if (!isObject(data) || !Array.isArray(data.enemies) || data.enemies.length < 1 || data.enemies.length > 5) return null;
    const enemies = data.enemies.map(e => {
      if (!isObject(e) || typeof e.kind !== 'string' || !ENEMIES[e.kind] || !finite(e.hp, 0, ENEMIES[e.kind].maxHp) || !finite(e.break, 0, ENEMIES[e.kind].breakMax)) return null;
      const def = ENEMIES[e.kind];
      return { kind: e.kind, name: def.name, weak: def.weak, maxHp: def.maxHp, breakMax: def.breakMax, hp: e.hp, break: e.break, atk: def.atk, color: def.color, shape: def.shape, xp: def.xp, broken: e.broken === true };
    });
    if (enemies.some(e => !e) || !int(data.round, 1, 9999) || !int(data.actions, 0, 6) || !int(data.activeHero, 0, HEROES.length - 1) || !int(data.target, 0, 4)) return null;
    return { enemies, round: data.round, actions: data.actions, activeHero: data.activeHero, target: data.target };
  }

  function serializedBattle() {
    if (!state.battle) return null;
    return { enemies: state.battle.enemies.map(e => ({ kind: e.kind, hp: e.hp, break: e.break, broken: e.broken })), round: state.battle.round, actions: state.battle.actions, activeHero: state.battle.activeHero, target: state.battle.target };
  }

  function saveGame() {
    try {
      const data = { version: 1, state: { scene: state.scene, battleIndex: state.battleIndex, storyLine: state.storyLine, unlocked: state.unlocked.slice(0, 6), activeParty: state.activeParty.slice(0, 4), rosterCursor: state.rosterCursor, partyHp: state.partyHp.slice(0, 6), ults: state.ults.slice(0, 6), sp: state.sp, score: state.score, runTime: state.runTime, bestScore: state.bestScore, won: state.won, battle: serializedBattle() } };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      saveAvailable = true;
    } catch (_) { /* local saves are optional */ }
  }

  function clearTransient() {
    heldKeys.clear(); pointerControls.clear(); actionQueue.length = 0;
    pendingTimers.forEach(id => { try { clearTimeout(id); } catch (_) {} });
    pendingTimers.clear();
  }

  function schedule(fn, ms) {
    if (pendingTimers.size >= MAX_TIMERS) return;
    const id = setTimeout(() => { pendingTimers.delete(id); fn(); }, ms);
    pendingTimers.add(id);
  }

  function enqueue(action) { if (actionQueue.length < 8) actionQueue.push(action); }

  function newRun() {
    const priorBest = state.bestScore || bootSave?.bestScore || 0;
    clearTransient();
    state = bootState();
    state.started = true;
    state.scene = 'story';
    state.bestScore = priorBest;
    particles.length = 0; popups.length = 0; noticeText = ''; noticeTime = 0; inspectElement = 'ember';
    saveGame();
  }

  function startFromOverlay(useSave) {
    unlockAudio();
    if (useSave && bootSave) { clearTransient(); state = bootSave; state.started = true; bootSave = null; saveAvailable = true; }
    else newRun();
    tone(440, 0.1, 'sine', 0.035);
  }

  function startBattle(index) {
    const plan = BATTLE_PLAN[index];
    if (!plan) return;
    const enemies = plan.enemies.map(kind => {
      const d = ENEMIES[kind];
      return { kind, name: d.name, weak: d.weak, maxHp: d.maxHp, breakMax: d.breakMax, hp: d.maxHp, break: 0, atk: d.atk, color: d.color, shape: d.shape, xp: d.xp, broken: false };
    });
    state.battle = { enemies, round: 1, actions: 0, activeHero: firstLivingHero(), target: 0 };
    state.scene = 'battle';
    state.saveClock = 0;
    chooseTarget();
    saveGame();
    notice('Tap a foe, then choose a move.');
  }

  function firstLivingHero() {
    return state.activeParty.find(id => state.partyHp[id] > 0) ?? state.activeParty[0] ?? 0;
  }
  function livingParty() { return state.activeParty.filter(id => state.partyHp[id] > 0); }
  function livingEnemies() { return state.battle ? state.battle.enemies.filter(e => e.hp > 0) : []; }
  function chooseTarget() {
    if (!state.battle) return;
    if (!state.battle.enemies[state.battle.target] || state.battle.enemies[state.battle.target].hp <= 0) {
      const i = state.battle.enemies.findIndex(e => e.hp > 0);
      if (i >= 0) state.battle.target = i;
    }
  }

  function advanceStory() {
    const story = STORIES[state.battleIndex] || { lines: ['The rail goes quiet.'] };
    if (state.storyLine < story.lines.length - 1) { state.storyLine++; saveGame(); return; }
    if (story.recruit !== undefined && !state.unlocked.includes(story.recruit)) {
      state.unlocked.push(story.recruit);
      state.score += 50;
      notice(`${HEROES[story.recruit].name} joined the crew.`);
      burst(195, 230, ELEMENTS.find(e => e.id === HEROES[story.recruit].element).color, 22);
    }
    state.storyLine = 0;
    if (state.battleIndex >= BATTLE_PLAN.length) { state.scene = 'win'; state.won = true; saveGame(); return; }
    startBattle(state.battleIndex);
  }

  function toggleRoster(id) {
    if (!state.unlocked.includes(id)) return;
    const at = state.activeParty.indexOf(id);
    if (at >= 0) { state.rosterCursor = at; notice(`${HEROES[id].name} is in slot ${at + 1}.`); return; }
    if (state.activeParty.length < 4) state.activeParty.push(id);
    else state.activeParty[state.rosterCursor] = id;
    state.rosterCursor = (state.rosterCursor + 1) % Math.min(4, state.activeParty.length);
    state.battle && (state.battle.activeHero = firstLivingHero());
    tone(520, 0.08, 'triangle', 0.025);
    saveGame();
  }

  function restartBattle() {
    if (!state.started || state.battleIndex >= BATTLE_PLAN.length) return;
    clearTransient();
    state.partyHp = HEROES.map(h => h.maxHp);
    state.ults = state.ults.map(() => 0);
    state.sp = 2;
    state.scene = 'battle';
    state.battle = null;
    particles.length = 0; popups.length = 0; shake = 0; flash = 0;
    startBattle(state.battleIndex);
    tone(220, 0.12, 'sawtooth', 0.03);
  }

  function finishBattle() {
    const plan = BATTLE_PLAN[state.battleIndex];
    state.score += (plan.boss ? 300 : 100) + Math.max(0, 120 - state.battle.round * 8);
    state.partyHp = state.partyHp.map((hp, i) => Math.min(HEROES[i].maxHp, hp + Math.round(HEROES[i].maxHp * 0.18)));
    burst(195, 180, plan.boss ? '#ffe08b' : '#8fe7ff', 38);
    flash = 0.5; shake = 5; tone(plan.boss ? 880 : 620, 0.16, 'triangle', 0.045);
    if (state.battleIndex >= BATTLE_PLAN.length - 1) {
      state.battleIndex = BATTLE_PLAN.length;
      state.scene = 'win'; state.won = true;
      state.bestScore = Math.max(state.bestScore, state.score);
    } else {
      state.battleIndex++;
      state.storyLine = 0;
      state.scene = 'story';
    }
    state.battle = null;
    saveGame();
  }

  function failBattle() {
    state.scene = 'fail';
    saveGame();
    notice('The crew was scattered. The route remains open.');
    tone(110, 0.24, 'sawtooth', 0.04);
  }

  function playerAction(kind) {
    if (state.scene !== 'battle' || !state.battle) return;
    const id = state.battle.activeHero;
    const hero = HEROES[id];
    if (!hero || state.partyHp[id] <= 0) { state.battle.activeHero = firstLivingHero(); return; }
    chooseTarget();
    const enemy = state.battle.enemies[state.battle.target];
    if (!enemy || enemy.hp <= 0) { notice('Choose a live target.'); return; }
    if (kind === 'skill' && state.sp < 1) { notice('Need 1 shared SP. Basics restore it.'); tone(160, 0.08, 'square', 0.025); return; }
    if (kind === 'ultimate' && state.ults[id] < 100) { notice(`${hero.call} is at ${Math.floor(state.ults[id])}%.`); tone(160, 0.08, 'square', 0.025); return; }
    const power = kind === 'basic' ? hero.basic : kind === 'skill' ? hero.skill : hero.ult;
    const breakPower = kind === 'basic' ? hero.break : kind === 'skill' ? hero.break + 12 : hero.break + 24;
    let damage = Math.round(power * (0.94 + Math.random() * 0.12));
    const isWeak = enemy.weak === hero.element;
    if (enemy.broken) damage = Math.round(damage * 1.34);
    if (isWeak) { enemy.break = Math.min(enemy.breakMax, enemy.break + breakPower); }
    if (kind === 'basic') state.sp = Math.min(5, state.sp + 1);
    if (kind === 'skill') state.sp = Math.max(0, state.sp - 1);
    if (kind === 'ultimate') state.ults[id] = 0;
    else state.ults[id] = Math.min(100, state.ults[id] + (kind === 'basic' ? 24 : 16));
    state.ults = state.ults.map((v, i) => i === id ? v : Math.min(100, v + 4));
    enemy.hp = Math.max(0, enemy.hp - damage);
    state.score += damage;
    burst(enemyX(state.battle.target), enemyY(state.battle.target), ELEMENTS.find(e => e.id === hero.element).color, kind === 'ultimate' ? 22 : 10);
    popup(enemyX(state.battle.target), enemyY(state.battle.target) - 52, `${damage}`, ELEMENTS.find(e => e.id === hero.element).soft, kind === 'ultimate' ? 24 : 18);
    if (isWeak) popup(enemyX(state.battle.target), enemyY(state.battle.target) - 78, 'WEAK', '#fff1a5', 14);
    if (hero.role === 'MENDER' && kind !== 'basic') healParty(kind === 'ultimate' ? 26 : 15);
    if (hero.role === 'ANCHOR' && kind === 'skill') healParty(7);
    if (hero.role === 'TEMPO' && kind === 'skill') state.sp = Math.min(5, state.sp + 1);
    if (enemy.break >= enemy.breakMax && !enemy.broken) {
      enemy.broken = true; enemy.break = enemy.breakMax;
      popup(enemyX(state.battle.target), enemyY(state.battle.target) - 106, 'BROKEN', '#ffe08b', 16);
      burst(enemyX(state.battle.target), enemyY(state.battle.target), '#ffe08b', 28); shake = 8; flash = 0.22;
    }
    tone(kind === 'ultimate' ? 760 : isWeak ? 570 : 390, kind === 'ultimate' ? 0.18 : 0.07, kind === 'ultimate' ? 'sawtooth' : 'triangle', 0.04);
    if (livingEnemies().length === 0) { finishBattle(); return; }
    state.battle.actions++;
    const aliveCount = livingParty().length;
    if (state.battle.actions >= Math.max(1, aliveCount)) enemyPhase();
    else state.battle.activeHero = nextLivingHero(id);
    chooseTarget();
    saveGame();
  }

  function nextLivingHero(current) {
    const list = state.activeParty;
    const at = Math.max(0, list.indexOf(current));
    for (let n = 1; n <= list.length; n++) { const id = list[(at + n) % list.length]; if (state.partyHp[id] > 0) return id; }
    return firstLivingHero();
  }

  function healParty(amount) {
    const targets = state.activeParty.filter(id => state.partyHp[id] > 0).sort((a, b) => state.partyHp[a] / HEROES[a].maxHp - state.partyHp[b] / HEROES[b].maxHp);
    const id = targets[0];
    if (id === undefined) return;
    state.partyHp[id] = Math.min(HEROES[id].maxHp, state.partyHp[id] + amount);
    popup(heroX(id), 376, `+${amount}`, '#d9ffad', 13);
  }

  function enemyPhase() {
    state.battle.actions = 0; state.battle.round++;
    livingEnemies().forEach(enemy => {
      if (enemy.broken) {
        enemy.broken = false; enemy.break = 0;
        popup(enemyX(state.battle.enemies.indexOf(enemy)), enemyY(state.battle.enemies.indexOf(enemy)) - 75, 'STUN', '#ffe08b', 15);
        return;
      }
      const alive = livingParty();
      if (!alive.length) return;
      const target = alive[Math.floor(Math.random() * alive.length)];
      const damage = Math.max(1, Math.round(enemy.atk * (0.9 + Math.random() * 0.18) + state.battle.round * 0.5));
      state.partyHp[target] = Math.max(0, state.partyHp[target] - damage);
      popup(heroX(target), 376, `-${damage}`, '#ff9b91', 15);
      burst(heroX(target), 400, '#ff6f65', 9); shake = 4;
      if (state.partyHp[target] <= 0) notice(`${HEROES[target].name} is down.`);
    });
    state.battle.activeHero = firstLivingHero();
    if (!livingParty().length) failBattle();
    else saveGame();
  }

  function enemyX(index) {
    const count = state.battle ? state.battle.enemies.length : 1;
    return count === 1 ? 195 : index === 0 ? 118 : 272;
  }
  function enemyY(index) { return state.battle && state.battle.enemies.length > 1 ? 168 + (index === 1 ? 5 : 0) : 164; }
  function heroX(id) { const at = state.activeParty.indexOf(id); return 55 + Math.max(0, at) * 94; }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 150, vy: (Math.random() - 0.7) * 150, life: 0.35 + Math.random() * 0.55, max: 0.9, size: 2 + Math.random() * 3, color });
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  }
  function popup(x, y, text, color, size) {
    popups.push({ x, y, text, color, size, life: 1.05, max: 1.05 });
    if (popups.length > MAX_POPUPS) popups.splice(0, popups.length - MAX_POPUPS);
  }
  function updateFx(dt) {
    particles.forEach(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 180 * dt; });
    particles = particles.filter(p => p.life > 0).slice(-MAX_PARTICLES);
    popups.forEach(p => { p.life -= dt; p.y -= 22 * dt; });
    popups = popups.filter(p => p.life > 0).slice(-MAX_POPUPS);
    shake = Math.max(0, shake - dt * 26); flash = Math.max(0, flash - dt);
    noticeTime = Math.max(0, noticeTime - dt);
  }
  function notice(text) { noticeText = text; noticeTime = 2.7; reader.textContent = text; }

  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (_) { audioCtx = null; }
  }
  function tone(freq, duration, type, volume) {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = type; osc.frequency.value = freq; gain.gain.setValueAtTime(volume, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  function resize() {
    const wasPortrait = view.portrait;
    view.w = Math.max(1, window.innerWidth); view.h = Math.max(1, window.innerHeight); view.portrait = view.h >= view.w;
    if (wasPortrait !== view.portrait) clearTransient();
    const longAxis = Math.max(view.w, view.h); view.dpr = Math.min(2, 960 / longAxis, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(view.w * view.dpr)); canvas.height = Math.max(1, Math.floor(view.h * view.dpr));
    if (view.portrait) { view.scale = Math.min(view.w / W, view.h / H); view.ox = (view.w - W * view.scale) / 2; view.oy = (view.h - H * view.scale) / 2; }
  }

  function localPoint(e) {
    if (!view.portrait) return { x: -1, y: -1 };
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.ox) / view.scale, y: (e.clientY - r.top - view.oy) / view.scale };
  }

  function hitTest(x, y) {
    if (state.scene === 'start') {
      if (saveAvailable && y >= 512 && y <= 585 && x >= 22 && x <= 368) return { type: 'continue' };
      return { type: 'new' };
    }
    if (state.scene === 'story') {
      if (x >= 280 && y >= 12 && y <= 60) return { type: 'roster' };
      if (y >= 588) return { type: 'story' };
      return null;
    }
    if (state.scene === 'roster') {
      if (y >= 598) return { type: 'rosterDone' };
      for (let i = 0; i < HEROES.length; i++) {
        const col = i % 2, row = Math.floor(i / 2), bx = 20 + col * 186, by = 110 + row * 112;
        if (x >= bx && x <= bx + 168 && y >= by && y <= by + 96) return { type: 'rosterHero', id: i };
      }
      return null;
    }
    if (state.scene === 'win') return y >= 545 ? { type: 'new' } : null;
    if (state.scene === 'fail') return x >= 48 && x <= 342 && y >= 378 && y <= 441 ? { type: 'retry' } : null;
    if (state.scene !== 'battle') return null;
    if (x >= 13 && x <= 97 && y >= 14 && y <= 62) return { type: 'restart' };
    if (y >= 94 && y <= 258) {
      for (let i = 0; i < state.battle.enemies.length; i++) {
        const ex = enemyX(i); if (Math.abs(x - ex) < 82) return { type: 'target', index: i };
      }
    }
    if (y >= 276 && y <= 342) {
      const i = Math.floor(x / 130); if (i >= 0 && i < 3) return { type: 'inspect', element: ELEMENTS[i].id };
    }
    if (y >= 360 && y <= 514) {
      const i = Math.floor((x - 8) / 94); if (i >= 0 && i < state.activeParty.length) return { type: 'hero', id: state.activeParty[i] };
    }
    if (y >= 574) {
      const i = Math.floor(x / 130); if (i === 0) return { type: 'action', action: 'basic' }; if (i === 1) return { type: 'action', action: 'skill' }; if (i === 2) return { type: 'action', action: 'ultimate' };
    }
    return null;
  }

  function handleAction(action) {
    if (!action) return;
    if (action.type === 'continue') { startFromOverlay(true); return; }
    if (action.type === 'new') { startFromOverlay(false); return; }
    if (action.type === 'start') { startFromOverlay(saveAvailable); return; }
    if (action.type === 'story') { unlockAudio(); advanceStory(); return; }
    if (action.type === 'roster') { state.scene = 'roster'; saveGame(); return; }
    if (action.type === 'rosterHero') { toggleRoster(action.id); return; }
    if (action.type === 'rosterDone') { state.scene = 'story'; saveGame(); return; }
    if (action.type === 'retry') { restartBattle(); return; }
    if (action.type === 'restart') { restartBattle(); return; }
    if (action.type === 'target' && state.battle && state.battle.enemies[action.index]?.hp > 0) { state.battle.target = action.index; notice(`${state.battle.enemies[action.index].name} targeted.`); tone(300, 0.05, 'sine', 0.02); return; }
    if (action.type === 'inspect') { inspectElement = action.element; const foe = state.battle?.enemies[state.battle.target]; notice(`${action.element.toUpperCase()} ${foe && foe.weak === action.element ? 'breaks this target.' : 'does not break this target.'}`); return; }
    if (action.type === 'hero') { if (state.partyHp[action.id] > 0) { state.battle.activeHero = action.id; notice(`${HEROES[action.id].name}'s turn.`); } else notice('That hero needs a rest.'); return; }
    if (action.type === 'action') { playerAction(action.action); }
  }

  function onPointerDown(e) {
    e.preventDefault(); unlockAudio();
    if (pointerControls.size >= MAX_POINTERS) return;
    if (!view.portrait) return;
    const p = localPoint(e), control = state.scene === 'start' ? (saveAvailable && p.y >= 512 && p.y <= 585 ? { type: 'continue' } : { type: 'new' }) : hitTest(p.x, p.y);
    pointerControls.set(e.pointerId, { control, x: p.x, y: p.y });
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (control) enqueue(control);
  }
  function onPointerMove(e) { const p = pointerControls.get(e.pointerId); if (p) { const q = localPoint(e); p.x = q.x; p.y = q.y; } }
  function onPointerUp(e) { e.preventDefault(); pointerControls.delete(e.pointerId); try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} }
  function onPointerCancel(e) { pointerControls.delete(e.pointerId); }

  function onKeyDown(e) {
    const key = e.key.toLowerCase();
    const allowed = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', '1', '2', '3', 'enter', 'r', 'p', 'n', ' '];
    if (!allowed.includes(key)) return;
    e.preventDefault();
    if (heldKeys.has(key)) return;
    if (heldKeys.size >= 32) return;
    heldKeys.add(key);
    unlockAudio();
    if (!state.started && (key === 'enter' || key === ' ')) enqueue({ type: saveAvailable ? 'continue' : 'new' });
    else if (key === 'n') enqueue({ type: 'new' });
    else if (key === 'r' && (state.scene === 'battle' || state.scene === 'fail')) enqueue({ type: 'restart' });
    else if (key === 'p' && state.scene === 'story') enqueue({ type: 'roster' });
    else if (state.scene === 'story' && (key === 'enter' || key === ' ')) enqueue({ type: 'story' });
    else if (state.scene === 'fail' && (key === 'enter' || key === ' ')) enqueue({ type: 'retry' });
    else if (state.scene === 'roster') {
      if (key === 'enter' || key === ' ') enqueue({ type: 'rosterDone' });
      else if (key === 'arrowleft' || key === 'arrowright' || key === 'arrowup' || key === 'arrowdown') rosterMove(key);
    } else if (state.scene === 'battle') {
      if (key === 'arrowleft') enqueue({ type: 'targetMove', dir: -1 });
      if (key === 'arrowright') enqueue({ type: 'targetMove', dir: 1 });
      if (key === 'arrowup') enqueue({ type: 'heroMove', dir: -1 });
      if (key === 'arrowdown') enqueue({ type: 'heroMove', dir: 1 });
      if (key === '1') enqueue({ type: 'action', action: 'basic' });
      if (key === '2') enqueue({ type: 'action', action: 'skill' });
      if (key === '3') enqueue({ type: 'action', action: 'ultimate' });
    }
  }
  function rosterMove(key) {
    const delta = key === 'arrowleft' ? -1 : key === 'arrowright' ? 1 : key === 'arrowup' ? -2 : 2;
    const unlocked = state.unlocked, current = state.rosterCursor;
    const next = Math.max(0, Math.min(unlocked.length - 1, current + delta));
    state.rosterCursor = next % 4;
    const hero = unlocked[next]; if (hero !== undefined) enqueue({ type: 'rosterHero', id: hero });
  }
  function keyboardMove(action) {
    if (!state.battle) return;
    if (action.type === 'targetMove') {
      const alive = state.battle.enemies.map((e, i) => e.hp > 0 ? i : -1).filter(i => i >= 0);
      if (alive.length) { const at = Math.max(0, alive.indexOf(state.battle.target)); state.battle.target = alive[(at + action.dir + alive.length) % alive.length]; notice(`${state.battle.enemies[state.battle.target].name} targeted.`); }
    }
    if (action.type === 'heroMove') {
      const alive = state.activeParty.filter(id => state.partyHp[id] > 0); if (alive.length) { const at = Math.max(0, alive.indexOf(state.battle.activeHero)); state.battle.activeHero = alive[(at + action.dir + alive.length) % alive.length]; notice(`${HEROES[state.battle.activeHero].name}'s turn.`); }
    }
  }

  function update(dt) {
    if (!view.portrait) return;
    nowTime += dt; updateFx(dt);
    if (!state.started) {
      if (actionQueue.length) handleAction(actionQueue.shift());
      return;
    }
    if (actionQueue.length) { const action = actionQueue.shift(); if (action.type === 'targetMove' || action.type === 'heroMove') keyboardMove(action); else handleAction(action); }
    if (state.scene === 'battle') {
      state.runTime += dt; state.saveClock += dt;
      if (state.saveClock > 1.2) { state.saveClock = 0; saveGame(); }
    }
  }

  function txt(value, x, y, size, color, align = 'left', weight = 500) {
    ctx.fillStyle = color; ctx.font = `${weight} ${size}px system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
  }
  function box(x, y, w, h, fill, stroke = null, radius = 12) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function line(x1, y1, x2, y2, color, width = 1) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function bar(x, y, w, h, value, max, fill, back = '#1a2636') { box(x, y, w, h, back, null, h / 2); if (value > 0) box(x, y, Math.max(2, w * Math.min(1, value / max)), h, fill, null, h / 2); }
  function elem(id) { return ELEMENTS.find(e => e.id === id) || ELEMENTS[0]; }
  function wrap(text, x, y, maxW, size, color, lineH = 25, maxLines = 3) {
    const words = text.split(' '); let lineText = '', lines = [];
    words.forEach(word => { const test = lineText ? `${lineText} ${word}` : word; if (ctx.measureText(test).width > maxW && lineText) { lines.push(lineText); lineText = word; } else lineText = test; });
    if (lineText) lines.push(lineText); lines = lines.slice(0, maxLines);
    lines.forEach((v, i) => txt(v, x, y + i * lineH, size, color)); return lines.length;
  }

  function drawBackdrop() {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#09172a'); g.addColorStop(0.62, '#0a1a2a'); g.addColorStop(1, '#07101c'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    stars.forEach((s, i) => { ctx.globalAlpha = s.a * (0.7 + Math.sin(nowTime * 1.8 + i) * 0.3); ctx.fillStyle = i % 5 === 0 ? '#8de3ff' : '#cad9e8'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1;
    const drift = (nowTime * 12) % 46;
    ctx.strokeStyle = '#18344b'; ctx.lineWidth = 1;
    for (let i = -2; i < 10; i++) { line(i * 50 - drift, 548, i * 50 + 92 - drift, 370, '#18334b', 1); line(i * 50 + 17 - drift, 548, i * 50 + 108 - drift, 370, '#112b41', 1); }
    line(0, 548, W, 548, '#2b5064', 2); line(0, 554, W, 554, '#10283e', 2);
    ctx.globalAlpha = 0.14; ctx.fillStyle = '#5fd7f4'; ctx.fillRect(0, 540, W, 2); ctx.globalAlpha = 1;
  }

  function drawHeader(label, sub) {
    ctx.fillStyle = '#0a1425'; ctx.fillRect(0, 0, W, 76); line(0, 75, W, 75, '#294862', 1);
    txt(label, 18, 25, 12, '#8daec1', 'left', 700); txt(sub, 18, 49, 18, '#f1f6fa', 'left', 750);
  }
  function drawStart() {
    drawBackdrop(); ctx.fillStyle = 'rgba(4,9,18,.45)'; ctx.fillRect(0, 0, W, H);
    txt('STARWEFT', 195, 188, 42, '#eff8ff', 'center', 800); txt('SKY-RAIL TACTICS', 195, 226, 13, '#74d9ee', 'center', 750);
    line(100, 249, 290, 249, '#31546b', 1);
    wrap('Six travelers. Three elements. One route through a collapsing sky.', 52, 286, 286, 17, '#b8ccd7', 26, 3);
    box(22, 512, 346, 73, '#18354a', '#4ec6df', 16);
    txt(saveAvailable ? 'CONTINUE RUN' : 'TAP TO BEGIN', 195, 540, 19, '#e8fbff', 'center', 800);
    txt(saveAvailable ? 'Your route is stored on this device' : 'First gesture wakes the rail', 195, 564, 12, '#91c7d7', 'center', 500);
    txt('N = new run', 195, 625, 12, '#6c8d9c', 'center');
    txt('NO DRAWS  •  NO ENERGY  •  JUST THE NEXT MOVE', 195, 669, 10, '#557486', 'center', 650);
  }

  function drawStory() {
    const story = STORIES[state.battleIndex] || { lines: ['The line is yours.'] };
    drawHeader(`ZONE ${Math.min(3, Math.floor(state.battleIndex / 5) + 1)}  //  ${BATTLE_PLAN[Math.min(state.battleIndex, 14)]?.rail || 'OPEN SKY'}`, `LOG ${String(state.battleIndex + 1).padStart(2, '0')}  —  BETWEEN BATTLES`);
    box(280, 13, 95, 45, '#12283a', '#30566b', 12); txt('SQUAD', 327, 35, 12, '#b5e7f1', 'center', 750);
    ctx.save(); ctx.translate(0, 20 * Math.sin(nowTime * 1.4));
    ctx.globalAlpha = 0.8; line(60, 170, 330, 170, '#416579', 2); line(90, 184, 300, 184, '#1f4056', 2); ctx.globalAlpha = 1;
    ctx.fillStyle = '#f3cf83'; ctx.beginPath(); ctx.arc(92, 170, 12, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#62d7e8'; ctx.beginPath(); ctx.arc(195, 170, 16, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#b8e476'; ctx.beginPath(); ctx.arc(298, 170, 10, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    box(24, 242, 342, 250, 'rgba(12,28,45,.93)', '#2d5266', 18);
    txt('RAIL NOTE', 48, 276, 11, '#71d6e8', 'left', 800);
    let y = 323; const lines = story.lines.slice(0, 2); lines.forEach((lineText, i) => { ctx.font = '500 19px system-ui, sans-serif'; const n = wrap(lineText, 48, y, 292, 19, i === state.storyLine ? '#f0f6fa' : '#7898a8', 30, 3); y += n * 30 + 20; });
    if (story.recruit !== undefined) { const h = HEROES[story.recruit]; box(48, 425, 294, 48, '#162f35', elem(h.element).color, 12); txt('NEW CREW', 64, 441, 10, elem(h.element).soft, 'left', 800); txt(h.name, 64, 460, 15, '#effaff', 'left', 700); txt(h.role, 326, 451, 10, '#9bc5c2', 'right', 700); }
    box(24, 594, 342, 66, '#1a4150', '#54d2df', 15); txt(state.storyLine < lines.length - 1 ? 'NEXT BEAT' : 'LAUNCH BATTLE', 195, 627, 16, '#effcff', 'center', 800);
    txt('Tap the button or press Enter', 195, 680, 11, '#7196a5', 'center');
  }

  function drawRoster() {
    drawBackdrop(); drawHeader('CREW DECK', `${state.activeParty.length}/4  ACTIVE  —  TAP TO SWAP`);
    txt('Tap an active slot, then tap a traveler to replace it.', 195, 91, 12, '#8db0bd', 'center');
    for (let i = 0; i < HEROES.length; i++) {
      const h = HEROES[i], unlocked = state.unlocked.includes(i), active = state.activeParty.includes(i), col = i % 2, row = Math.floor(i / 2), x = 20 + col * 186, y = 110 + row * 112, color = elem(h.element).color;
      box(x, y, 168, 96, unlocked ? '#12283a' : '#0d1825', active ? color : '#223a4a', 14);
      ctx.globalAlpha = unlocked ? 1 : 0.35; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + 25, y + 32, 14, 0, Math.PI * 2); ctx.fill(); txt(elem(h.element).short, x + 25, y + 32, 12, '#07121d', 'center', 800);
      txt(unlocked ? h.name : 'LOCKED', x + 48, y + 25, 14, unlocked ? '#f0f7fa' : '#75909c', 'left', 750); txt(unlocked ? h.role : 'STORY RECRUIT', x + 48, y + 47, 10, unlocked ? color : '#617581', 'left', 700);
      txt(active ? `SLOT ${state.activeParty.indexOf(i) + 1}` : unlocked ? 'AVAILABLE' : '—', x + 48, y + 73, 11, active ? '#f5db92' : '#89a5b1', 'left', 650); ctx.globalAlpha = 1;
    }
    box(20, 598, 350, 62, '#1a4150', '#54d2df', 15); txt('DONE  •  RETURN TO THE LINE', 195, 629, 15, '#effcff', 'center', 800);
  }

  function drawBattle() {
    const plan = BATTLE_PLAN[state.battleIndex], boss = !!plan.boss;
    drawHeader(`${plan.rail}  //  ${boss ? 'BOSS' : 'ENCOUNTER'}`, `BATTLE ${state.battleIndex + 1}/15  •  ROUND ${state.battle?.round || 1}`);
    box(13, 14, 84, 48, '#13283a', '#38586b', 11); txt('RETRY', 55, 37, 11, '#b7d4dd', 'center', 800);
    txt(`${formatTime(state.runTime)}`, 300, 25, 15, '#deedf1', 'right', 750); txt(`SCORE ${state.score}`, 300, 48, 10, '#7297a6', 'right', 700); txt(`SP ${state.sp}/5`, 373, 25, 13, '#f0d586', 'right', 750);
    for (let i = 0; i < 15; i++) box(112 + i * 17, 17, 11, 5, i < state.battleIndex ? '#5ce2d0' : i === state.battleIndex ? '#f5d27d' : '#274254', null, 3);
    state.battle.enemies.forEach((enemy, i) => drawEnemy(enemy, enemyX(i), enemyY(i), i === state.battle.target));
    txt(noticeTime > 0 ? noticeText : 'Tap a foe, inspect elements, then commit a move.', 195, 265, 12, noticeTime > 0 ? '#e3f5f7' : '#7193a2', 'center', 600);
    drawElementInspect();
    drawParty();
    drawSkills();
    drawFx();
    if (flash > 0) { ctx.fillStyle = `rgba(255,243,188,${flash * 0.28})`; ctx.fillRect(0, 0, W, H); }
  }

  function drawEnemy(enemy, x, y, selected) {
    const d = enemy.hp > 0 ? 1 : 0.55, c = enemy.color;
    ctx.save(); ctx.translate(x, y + Math.sin(nowTime * 2 + x) * 4); ctx.globalAlpha = d;
    if (selected) { ctx.shadowColor = '#ffe08b'; ctx.shadowBlur = 18; }
    ctx.fillStyle = c; ctx.strokeStyle = selected ? '#ffe08b' : '#6c8992'; ctx.lineWidth = selected ? 3 : 1.5;
    if (enemy.shape === 'orb') { ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#12263a'; ctx.beginPath(); ctx.arc(-8, -7, 7, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(11, -7, 7, 0, Math.PI * 2); ctx.fill(); }
    else if (enemy.shape === 'boss') { ctx.beginPath(); ctx.moveTo(-56, 30); ctx.lineTo(-44, -30); ctx.lineTo(-14, -53); ctx.lineTo(14, -53); ctx.lineTo(44, -30); ctx.lineTo(56, 30); ctx.closePath(); ctx.fill(); ctx.stroke(); line(-34, -19, 34, -19, '#ffe08b', 2); line(-26, 6, 26, 6, '#16233a', 3); }
    else if (enemy.shape === 'talon') { ctx.beginPath(); ctx.moveTo(-35, 28); ctx.lineTo(-5, -42); ctx.lineTo(8, -10); ctx.lineTo(31, -37); ctx.lineTo(27, 28); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else if (enemy.shape === 'bell') { ctx.beginPath(); ctx.moveTo(-36, 28); ctx.quadraticCurveTo(-30, -34, 0, -40); ctx.quadraticCurveTo(30, -34, 36, 28); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#172b3c'; ctx.beginPath(); ctx.arc(0, 24, 9, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(39, 25); ctx.lineTo(0, 40); ctx.lineTo(-39, 25); ctx.closePath(); ctx.fill(); ctx.stroke(); line(-27, 0, 27, 0, '#15283b', 3); }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    if (enemy.broken) { ctx.strokeStyle = '#ffe08b'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(0, 0, 48, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
    const nameY = y + 54; txt(enemy.name, x, nameY, 12, selected ? '#fff3c1' : '#d2e5eb', 'center', 750);
    bar(x - 56, nameY + 14, 112, 7, enemy.hp, enemy.maxHp, c, '#182a3a'); bar(x - 56, nameY + 25, 112, 5, enemy.break, enemy.breakMax, enemy.broken ? '#ffe08b' : '#c58bdb', '#182a3a');
    txt(enemy.broken ? 'STUNNED' : `${elem(enemy.weak).short} WEAK`, x, nameY + 39, 9, enemy.broken ? '#ffe08b' : elem(enemy.weak).soft, 'center', 800);
  }

  function drawElementInspect() {
    txt('ELEMENT READOUT', 18, 289, 10, '#7395a4', 'left', 800);
    ELEMENTS.forEach((e, i) => { const x = 18 + i * 124, active = inspectElement === e.id; box(x, 300, 108, 38, active ? '#234457' : '#102337', active ? e.color : '#2a4353', 10); ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(x + 20, 319, 10, 0, Math.PI * 2); ctx.fill(); txt(e.short, x + 20, 319, 10, '#07131e', 'center', 800); txt(e.label, x + 37, 319, 11, active ? e.soft : '#91abb5', 'left', 750); });
  }

  function drawParty() {
    txt('CREW', 18, 357, 10, '#7395a4', 'left', 800);
    state.activeParty.forEach((id, i) => {
      const h = HEROES[id], x = 8 + i * 94, y = 369, active = state.battle.activeHero === id, alive = state.partyHp[id] > 0, color = elem(h.element).color;
      box(x, y, 86, 137, active ? '#214052' : '#102337', active ? '#f3d47e' : '#294758', 12); ctx.globalAlpha = alive ? 1 : 0.42;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + 23, y + 27, 15, 0, Math.PI * 2); ctx.fill(); txt(elem(h.element).short, x + 23, y + 27, 11, '#08131d', 'center', 800);
      txt(h.name.split(' ')[0], x + 44, y + 24, 12, '#eaf4f6', 'left', 750); txt(h.call, x + 44, y + 42, 9, color, 'left', 800);
      bar(x + 10, y + 64, 66, 7, state.partyHp[id], h.maxHp, alive ? '#62d9b1' : '#6a7180'); txt(`${Math.ceil(state.partyHp[id])}/${h.maxHp}`, x + 43, y + 82, 9, '#a7c0c6', 'center');
      bar(x + 10, y + 96, 66, 6, state.ults[id], 100, '#f0ca68'); txt(`ULT ${Math.floor(state.ults[id])}%`, x + 43, y + 116, 9, state.ults[id] >= 100 ? '#ffe08b' : '#829da8', 'center', 750);
      ctx.globalAlpha = 1;
    });
  }

  function drawSkills() {
    const id = state.battle.activeHero, h = HEROES[id], availableUlt = state.ults[id] >= 100, availableSkill = state.sp >= 1;
    txt(`${h.name}  /  ${h.role}`, 18, 523, 11, '#a8c5cc', 'left', 750); txt('ARROWS: SELECT', 372, 523, 10, '#638492', 'right', 700);
    const skills = [['BASIC', '+1 SP', true, '#69d5ba'], ['SKILL', '−1 SP', availableSkill, '#6dcaf0'], ['ULTIMATE', availableUlt ? 'READY' : `${Math.floor(state.ults[id])}%`, availableUlt, '#f0c967']];
    skills.forEach((s, i) => { const x = 8 + i * 126; box(x, 550, 118, 91, s[2] ? '#173448' : '#111f2c', s[2] ? s[3] : '#2a3945', 14); txt(String(i + 1), x + 16, 570, 12, s[2] ? s[3] : '#546a76', 'left', 800); txt(s[0], x + 59, 580, 13, s[2] ? '#eff9fb' : '#6d818b', 'center', 800); txt(s[1], x + 59, 610, 12, s[2] ? s[3] : '#61727b', 'center', 700); });
    txt('Break the enemy weakness to stun it for a turn.', 195, 676, 10, '#6f919e', 'center');
  }

  function drawFx() {
    particles.forEach(p => { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.55 + p.life), 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1;
    popups.forEach(p => { ctx.globalAlpha = Math.max(0, p.life / p.max); txt(p.text, p.x, p.y, p.size, p.color, 'center', 800); }); ctx.globalAlpha = 1;
  }

  function drawFail() {
    drawBattle(); ctx.fillStyle = 'rgba(5,10,18,.74)'; ctx.fillRect(0, 0, W, H);
    box(25, 176, 340, 300, '#102235', '#c56e68', 20); txt('THE LINE BROKE', 195, 225, 26, '#ffe2d2', 'center', 800); wrap('Every traveler is down, but the rail is still humming. Retry this battle at full strength.', 53, 270, 284, 16, '#b6cbd1', 25, 4);
    box(48, 378, 294, 63, '#583844', '#f08b77', 14); txt('RETRY NOW', 195, 410, 18, '#fff0e9', 'center', 800); txt('R / Enter', 195, 465, 11, '#a9969c', 'center');
  }

  function drawWin() {
    drawBackdrop(); ctx.fillStyle = 'rgba(4,9,18,.33)'; ctx.fillRect(0, 0, W, H);
    txt('OPEN SKY', 195, 160, 13, '#7fe0e6', 'center', 800); txt('THE LINE HELD', 195, 210, 33, '#f4f8ed', 'center', 800); line(86, 244, 304, 244, '#6cd7c5', 2);
    wrap('The last signal fades. Six travelers step onto a rail with nowhere left to fall.', 48, 286, 294, 18, '#bfd4d4', 28, 3);
    box(54, 380, 282, 88, '#112d3c', '#4dd4c1', 15); txt(`SCORE  ${state.score}`, 195, 408, 22, '#f4d57f', 'center', 800); txt(`TIME  ${formatTime(state.runTime)}   •   BEST  ${state.bestScore}`, 195, 440, 11, '#9fc1c2', 'center', 700);
    box(48, 545, 294, 67, '#1b4650', '#6be1cf', 15); txt('NEW RUN', 195, 578, 17, '#effff8', 'center', 800); txt('Tap to send another crew', 195, 644, 11, '#769b9f', 'center');
  }

  function formatTime(seconds) { const s = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

  function drawRotate() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); ctx.fillStyle = '#07101c'; ctx.fillRect(0, 0, view.w, view.h);
    const cx = view.w / 2, cy = view.h / 2; ctx.fillStyle = '#10253a'; ctx.beginPath(); ctx.roundRect(cx - 125, cy - 80, 250, 160, 20); ctx.fill();
    txt('ROTATE TO PLAY', cx, cy - 18, 22, '#edf8f8', 'center', 800); txt('Starweft pauses while the rail is sideways.', cx, cy + 20, 12, '#8eb8c0', 'center');
    ctx.strokeStyle = '#60d6d7'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy - 51, 16, 0.2, Math.PI * 1.7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - 10, cy - 64); ctx.lineTo(cx - 12, cy - 47); ctx.lineTo(cx + 2, cy - 52); ctx.stroke();
  }

  function draw() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); ctx.clearRect(0, 0, view.w, view.h);
    if (!view.portrait) { drawRotate(); return; }
    ctx.save(); ctx.translate(view.ox, view.oy); ctx.scale(view.scale, view.scale); ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    if (state.scene === 'start') drawStart(); else if (state.scene === 'story') drawStory(); else if (state.scene === 'roster') drawRoster(); else if (state.scene === 'battle') drawBattle(); else if (state.scene === 'fail') drawFail(); else drawWin();
    ctx.restore();
  }

  function frame(t) {
    const dt = lastFrame ? Math.min(0.05, Math.max(0, (t - lastFrame) / 1000)) : 0; lastFrame = t;
    update(dt); draw(); requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  canvas.addEventListener('pointercancel', onPointerCancel, { passive: false });
  canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', e => heldKeys.delete(e.key.toLowerCase()), { passive: false });
  window.addEventListener('blur', clearTransient);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();
  requestAnimationFrame(frame);
})();
