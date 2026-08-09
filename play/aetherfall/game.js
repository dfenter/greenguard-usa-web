/* Aetherfall — a tiny, original ATB JRPG vertical slice. */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const W = 390, H = 700, WORLD_H = 486;
  const TAU = Math.PI * 2;
  const SAVE_KEY = 'aetherfall-save-v1';
  const BEST_KEY = 'aetherfall-best-v1';
  const glyphs = {
    ember: { name: 'Ember', color: '#ff7a58', icon: '◆', spell: 'Cinder', kind: 'hit', power: 28 },
    frost: { name: 'Frost', color: '#70d9ff', icon: '◇', spell: 'Rime', kind: 'hit', power: 24 },
    jolt: { name: 'Jolt', color: '#ffe66d', icon: '✦', spell: 'Arcflash', kind: 'hit', power: 23 },
    mend: { name: 'Mend', color: '#9dffb4', icon: '✚', spell: 'Refrain', kind: 'heal', power: 36 }
  };
  const partyBlueprint = [
    { id: 'tavi', name: 'Tavi', role: 'blade', job: 'blade mercenary', maxHp: 104, speed: 42, color: '#ff9a6d', skill: 'Rift Cut' },
    { id: 'nema', name: 'Nema', role: 'scout', job: 'sparkgun scout', maxHp: 78, speed: 56, color: '#70d9ff', skill: 'Pinpoint' },
    { id: 'iri', name: 'Iri', role: 'medic', job: 'chant medic', maxHp: 86, speed: 36, color: '#b4ff9e', skill: 'Soft Chord' }
  ];
  const npcData = [
    { id: 'mira', name: 'Mira', x: 94, y: 315, color: '#ff83c6', lines: ['The skyrail hums louder near the old reactor.', 'If it starts singing, run toward the blue lights.'] },
    { id: 'oren', name: 'Oren', x: 288, y: 318, color: '#ffc56d', lines: ['I tune the plaza lamps by ear.', 'The west gate opens for anyone brave enough.'] },
    { id: 'vela', name: 'Vela', x: 156, y: 385, color: '#a89dff', lines: ['Crystals remember the shape of a traveler.', 'Touch one before the city forgets you.'] }
  ];
  const enemySets = {
    field: [
      [{ name: 'Glimmer Mite', hp: 58, maxHp: 58, speed: 34, color: '#d5f36e', power: 10 }, { name: 'Glimmer Mite', hp: 58, maxHp: 58, speed: 37, color: '#d5f36e', power: 10 }],
      [{ name: 'Weld Hound', hp: 96, maxHp: 96, speed: 39, color: '#ff866f', power: 15 }]
    ],
    dungeon: [
      [{ name: 'Coil Wisp', hp: 82, maxHp: 82, speed: 42, color: '#bd9aff', power: 14 }, { name: 'Coil Wisp', hp: 82, maxHp: 82, speed: 40, color: '#bd9aff', power: 14 }],
      [{ name: 'Soot Walker', hp: 138, maxHp: 138, speed: 31, color: '#ffb35c', power: 18 }]
    ]
  };

  let dpr = 1, last = performance.now();
  const game = {
    screen: 'world', world: 'town', floor: 0, hero: { x: 195, y: 268, tx: 195, ty: 268, dir: 1 },
    party: [], coins: 26, tonics: 3, orbs: ['ember'], equipped: { tavi: 'ember', nema: null, iri: null },
    openChests: {}, orbUses: { ember: 0, frost: 0, jolt: 0, mend: 0 }, risk: 0, stepCount: 0, stepsSinceBattle: 0, firstEncounter: false, stepPending: false,
    elapsed: 0, message: 'Tap a tile to move · reach the cyan gate', messageTime: 6,
    dialog: null, modal: null, selectedHero: 0, particles: [], shake: 0, flash: 0,
    combat: null, victoryStats: null, best: (() => { try { const value = Number(localStorage.getItem(BEST_KEY)); return Number.isFinite(value) && value >= 0 ? value : 0; } catch (_) { return 0; } })(), savePoint: null
  };

  function newParty() {
    return partyBlueprint.map(p => ({ ...p, hp: p.maxHp, atb: 0, limit: 0, guard: false, level: 1, xp: 0 }));
  }
  game.party = newParty();

  function fitCanvas() {
    const cssW = Math.max(1, canvas.clientWidth), cssH = Math.max(1, canvas.clientHeight);
    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const long = Math.max(cssW, cssH) * scale;
    const factor = Math.min(1, 960 / long);
    dpr = scale * factor;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  }
  window.addEventListener('resize', fitCanvas, { passive: true });
  fitCanvas();

  function resetRun() {
    game.screen = 'world'; game.world = 'town'; game.floor = 0;
    game.hero = { x: 195, y: 268, tx: 195, ty: 268, dir: 1 };
    game.party = newParty(); game.coins = 26; game.tonics = 3; game.orbs = ['ember'];
    game.equipped = { tavi: 'ember', nema: null, iri: null }; game.openChests = {}; game.orbUses = { ember: 0, frost: 0, jolt: 0, mend: 0 }; game.stepPending = false;
    game.risk = 0; game.stepCount = 0; game.stepsSinceBattle = 0; game.firstEncounter = false;
    game.elapsed = 0; game.message = 'Tap a tile to move · reach the cyan gate'; game.messageTime = 6;
    game.dialog = null; game.modal = null; game.combat = null; game.victoryStats = null; game.interaction = null; game.selectedHero = 0;
    game.particles = []; game.shake = 0; game.flash = 0; pointerDown = null;
    saveGame();
  }
  function saveData() {
    return { world: game.world, floor: game.floor, hero: { x: game.hero.x, y: game.hero.y }, party: game.party.map(p => ({ id: p.id, hp: p.hp, maxHp: p.maxHp, level: p.level, xp: p.xp, limit: p.limit })), coins: game.coins, tonics: game.tonics, orbs: game.orbs, orbUses: game.orbUses, equipped: game.equipped, openChests: game.openChests, elapsed: game.elapsed };
  }
  function saveGame() {
    game.savePoint = saveData();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.savePoint)); } catch (_) {}
  }
  function loadSave() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!raw || !raw.party) return;
      game.world = raw.world || 'town'; game.floor = raw.floor || 0;
      game.hero.x = raw.hero?.x ?? 195; game.hero.y = raw.hero?.y ?? 268; game.hero.tx = game.hero.x; game.hero.ty = game.hero.y;
      game.party = partyBlueprint.map((base, i) => ({ ...base, ...(raw.party[i] || {}), atb: 0, guard: false }));
      game.coins = raw.coins ?? 26; game.tonics = raw.tonics ?? 3; game.orbs = Array.isArray(raw.orbs) ? raw.orbs.filter(id => glyphs[id]) : ['ember']; if (!game.orbs.length) game.orbs = ['ember']; game.orbUses = raw.orbUses || { ember: 0, frost: 0, jolt: 0, mend: 0 };
      const savedEquipped = raw.equipped || {};
      game.equipped = { tavi: glyphs[savedEquipped.tavi] ? savedEquipped.tavi : 'ember', nema: glyphs[savedEquipped.nema] ? savedEquipped.nema : null, iri: glyphs[savedEquipped.iri] ? savedEquipped.iri : null }; game.openChests = raw.openChests || {};
      game.elapsed = raw.elapsed || 0; game.savePoint = { ...raw, orbs: game.orbs, equipped: game.equipped };
      announce('A crystal returns you to the last safe glow.');
    } catch (_) {}
  }
  loadSave();
  if (!game.savePoint) saveGame();

  function announce(text, seconds = 3.2) { game.message = text; game.messageTime = seconds; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }
  function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
  function addParticles(x, y, color, count = 10, burst = 60) {
    for (let i = 0; i < count; i++) game.particles.push({ x, y, vx: (Math.random() - .5) * burst, vy: (Math.random() - .5) * burst, life: .35 + Math.random() * .45, max: .8, color, size: 1.5 + Math.random() * 3 });
    if (game.particles.length > 320) game.particles.splice(0, game.particles.length - 320);
  }
  function hurtShake(amount = 4) { game.shake = Math.max(game.shake, amount); game.flash = .12; }
  function addXp(hero, amount) {
    hero.xp += amount;
    const needed = hero.level * 60;
    if (hero.xp >= needed) { hero.xp -= needed; hero.level++; hero.maxHp += 9; hero.hp = hero.maxHp; announce(`${hero.name} reached level ${hero.level}.`); addParticles( hero.x || 190, 230, hero.color, 14, 35); }
  }

  // ----- Input -----
  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) * W / r.width, 0, W), y: clamp((e.clientY - r.top) * H / r.height, 0, H) };
  }
  let pointerDown = null;
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); pointerDown = { ...canvasPoint(e), time: performance.now() }; canvas.setPointerCapture?.(e.pointerId); }, { passive: false });
  canvas.addEventListener('pointerup', e => { e.preventDefault(); if (!pointerDown) return; const p = canvasPoint(e); if (dist(p.x, p.y, pointerDown.x, pointerDown.y) < 28 && performance.now() - pointerDown.time < 900) handleTap(p.x, p.y); pointerDown = null; }, { passive: false });
  canvas.addEventListener('pointercancel', () => { pointerDown = null; });
  canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  window.addEventListener('blur', () => { pointerDown = null; });
  window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) e.preventDefault();
    if (game.screen === 'win' || game.screen === 'fail') { if (e.key === 'Enter' || e.key === ' ') resetRun(); return; }
    if (game.dialog) { if (e.key === 'Enter' || e.key === ' ') advanceDialog(); return; }
    if (game.modal) { if (e.key === 'Escape' || e.key === 'x') game.modal = null; return; }
    if (game.screen === 'world') {
      if (e.key === 'Enter' || e.key === ' ') interactNearest();
      else { const dx = (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' ? 1 : e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' ? -1 : 0) * 64; const dy = (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S' ? 1 : e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' ? -1 : 0) * 64; if (dx || dy) setTarget(game.hero.x + dx, game.hero.y + dy); }
    } else if (game.screen === 'combat') { if (game.combat?.phase === 'fail' && (e.key === 'Enter' || e.key === ' ')) resetFromSave(); else combatKey(e.key); }
  }, { passive: false });

  function handleTap(x, y) {
    if (game.screen === 'win' || game.screen === 'fail') { resetRun(); return; }
    if (game.dialog) { advanceDialog(); return; }
    if (game.modal) { handleModalTap(x, y); return; }
    if (game.screen === 'combat') { handleCombatTap(x, y); return; }
    if (game.screen === 'world') {
      if (y >= 632) { if (x < 130) game.modal = 'orbs'; else if (x < 260) announce('Crystals restore the party and save your route. Find one before risky steps.'); else announce('The reactor waits beyond the cyan gate.'); return; }
      if (y < WORLD_H) handleWorldTap(x, y); else announce('Tap the field to walk.');
    }
  }

  function setTarget(x, y, interaction = null) {
    const margin = game.world === 'town' ? 16 : 12;
    game.hero.tx = clamp(x, margin, W - margin); game.hero.ty = clamp(y, 42, WORLD_H - 18); game.interaction = interaction; game.stepPending = true;
    if (x < game.hero.x) game.hero.dir = -1; else if (x > game.hero.x) game.hero.dir = 1;
  }
  function nearestInteraction() {
    const h = game.hero;
    if (game.world === 'town') {
      const choices = [{ type: 'inn', x: 78, y: 129 }, { type: 'shop', x: 307, y: 129 }, { type: 'crystal', x: 195, y: 340 }, { type: 'gate', x: 367, y: 244 }, ...npcData.map(n => ({ type: 'npc', id: n.id, x: n.x, y: n.y }))];
      return choices.sort((a, b) => dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, b.x, b.y))[0];
    }
    if (game.world === 'field') return [{ type: 'crystal', x: 62, y: 122 }, { type: 'chest', x: 234, y: 284 }, { type: 'gate', x: 366, y: 224 }].sort((a, b) => dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, b.x, b.y))[0];
    const choices = [{ type: 'crystal', x: 54, y: 105 }, { type: 'chest', x: 250, y: 300 }];
    if (game.floor < 3) choices.push({ type: 'stair', x: 340, y: 190 }); else choices.push({ type: 'boss', x: 287, y: 154 });
    return choices.sort((a, b) => dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, b.x, b.y))[0];
  }
  function interactNearest() { const n = nearestInteraction(); setTarget(n.x, n.y, n); }
  function handleWorldTap(x, y) {
    const h = game.hero;
    if (game.world === 'town') {
      if (x > 340 && y > 150 && y < 330) return setTarget(360, 244, { type: 'gate', x: 367, y: 244 });
      if (x < 136 && y < 190) return setTarget(78, 129, { type: 'inn', x: 78, y: 129 });
      if (x > 245 && y < 190) return setTarget(307, 129, { type: 'shop', x: 307, y: 129 });
      for (const n of npcData) if (dist(x, y, n.x, n.y) < 28) return setTarget(n.x, n.y, { type: 'npc', id: n.id, x: n.x, y: n.y });
      if (dist(x, y, 195, 340) < 30) return setTarget(195, 340, { type: 'crystal', x: 195, y: 340 });
    } else if (game.world === 'field') {
      if (x > 334 && y > 135 && y < 330) return setTarget(366, 224, { type: 'gate', x: 366, y: 224 });
      if (dist(x, y, 234, 284) < 32) return setTarget(234, 284, { type: 'chest', x: 234, y: 284 });
      if (dist(x, y, 62, 122) < 28) return setTarget(62, 122, { type: 'crystal', x: 62, y: 122 });
    } else {
      if (dist(x, y, 54, 105) < 28) return setTarget(54, 105, { type: 'crystal', x: 54, y: 105 });
      if (dist(x, y, 250, 300) < 30) return setTarget(250, 300, { type: 'chest', x: 250, y: 300 });
      if (game.floor < 3 && x > 302 && x < 378 && y > 140 && y < 240) return setTarget(340, 190, { type: 'stair', x: 340, y: 190 });
      if (game.floor === 3 && dist(x, y, 287, 154) < 42) return setTarget(287, 154, { type: 'boss', x: 287, y: 154 });
    }
    setTarget(x, y);
  }
  function interact(type) {
    if (!type) return;
    if (game.world === 'town') {
      if (type.type === 'inn') { if (game.coins >= 8) { game.coins -= 8; game.party.forEach(p => p.hp = p.maxHp); announce('The Ember Inn restores every circuit. 8 crowns paid.'); addParticles(78, 129, '#ff9a6d', 16, 32); } else announce('The inn needs 8 crowns for a full mend.'); }
      else if (type.type === 'shop') game.modal = 'shop';
      else if (type.type === 'npc') { const n = npcData.find(v => v.id === type.id); if (n) game.dialog = { name: n.name, color: n.color, lines: n.lines, index: 0 }; }
      else if (type.type === 'crystal') restAtCrystal();
      else if (type.type === 'gate') { game.world = 'field'; game.hero.x = 35; game.hero.y = 235; game.hero.tx = 80; game.hero.ty = 235; announce('A service path opens into the glassbloom verge.'); }
    } else if (game.world === 'field') {
      if (type.type === 'crystal') restAtCrystal();
      else if (type.type === 'chest') openChest('field');
      else if (type.type === 'gate') { game.world = 'dungeon'; game.floor = 1; game.hero.x = 42; game.hero.y = 350; game.hero.tx = 42; game.hero.ty = 350; game.risk = 0; saveGame(); announce('The reactor shell descends three floors below.'); }
    } else {
      if (type.type === 'crystal') restAtCrystal();
      else if (type.type === 'chest') openChest(`floor${game.floor}`);
      else if (type.type === 'stair') { game.floor++; game.hero.x = 42; game.hero.y = 350; game.hero.tx = 42; game.hero.ty = 350; game.risk = 0; saveGame(); announce(`Floor ${game.floor}: coolant sings through the walls.`); }
      else if (type.type === 'boss') startCombat('boss');
    }
  }
  function restAtCrystal() { game.party.forEach(p => p.hp = p.maxHp); game.party.forEach(p => p.limit = Math.min(100, p.limit)); saveGame(); addParticles(game.hero.x, game.hero.y, '#72e7ff', 18, 40); announce('Save crystal lit. The party is restored.'); }
  function openChest(key) {
    if (game.openChests[key]) { announce('The chest is empty, but its hinge still glows.'); return; }
    const found = key === 'field' ? 'frost' : key === 'floor1' ? 'mend' : key === 'floor2' ? 'jolt' : 'ember';
    game.openChests[key] = true; if (!game.orbs.includes(found)) game.orbs.push(found); announce(`Glyph orb found: ${glyphs[found].name}. Tap ORBS to socket it.`); addParticles(game.hero.x, game.hero.y, glyphs[found].color, 24, 75); saveGame();
  }

  function advanceDialog() { if (!game.dialog) return; if (game.dialog.index < game.dialog.lines.length - 1) game.dialog.index++; else game.dialog = null; }

  // ----- World and combat transitions -----
  function onStep() {
    game.stepCount++; game.stepsSinceBattle++;
    if (game.world === 'town') return;
    game.risk = clamp(game.risk + (game.world === 'field' ? 10 : 14), 0, 100);
    const first = !game.firstEncounter && game.stepsSinceBattle >= 2;
    if (first || (game.stepsSinceBattle >= 2 && (game.risk >= 100 || Math.random() < (game.world === 'field' ? .13 : .18)))) {
      game.firstEncounter = true; startCombat(game.world === 'field' ? 'field' : 'dungeon');
    }
  }
  function startCombat(kind) {
    const source = kind === 'field' ? enemySets.field : enemySets.dungeon;
    const raw = kind === 'boss' ? [{ name: 'The Cinder Warden', hp: 560, maxHp: 560, speed: 30, color: '#ff5d73', power: 23, boss: true }] : source[Math.floor(Math.random() * source.length)];
    game.combat = { kind, enemies: raw.map(e => ({ ...e, hp: e.maxHp, atb: Math.random() * 25, guard: false })), activeHero: null, menu: 'root', cursor: 0, sub: null, log: kind === 'boss' ? 'A furnace-heart wakes beneath the city.' : 'Hostiles emerge from the blue dust.', phase: 'fight', timer: 0, totalDamage: 0, actions: 0 };
    game.screen = 'combat'; game.interaction = null; game.stepPending = false; game.party.forEach(p => { p.atb = Math.min(p.atb, 50); p.guard = false; }); game.risk = Math.max(0, game.risk - 30); addParticles(195, 250, '#ff5d73', 28, 100); hurtShake(3);
  }
  function combatLog(text) { if (game.combat) game.combat.log = text; }
  function livingParty() { return game.party.filter(p => p.hp > 0); }
  function livingEnemies() { return game.combat.enemies.filter(e => e.hp > 0); }
  function chooseReadyHero() {
    if (game.combat.activeHero !== null) return;
    const ready = game.party.findIndex(p => p.hp > 0 && p.atb >= 100);
    if (ready >= 0) { game.combat.activeHero = ready; game.combat.menu = 'root'; game.combat.cursor = 0; }
  }
  function enemyAction(enemy) {
    const targets = livingParty(); if (!targets.length) return;
    const target = targets[Math.floor(Math.random() * targets.length)];
    const dmg = Math.max(3, Math.round(enemy.power + Math.random() * 7 - target.level * 1.5));
    const actual = target.guard ? Math.ceil(dmg * .45) : dmg;
    target.hp = Math.max(0, target.hp - actual); target.limit = clamp(target.limit + actual * 1.45, 0, 100); game.combat.totalDamage += actual;
    addParticles(78 + game.party.indexOf(target) * 38, 330, '#ff6376', 8, 42); hurtShake(4); combatLog(`${enemy.name} strikes ${target.name} for ${actual}.`);
    if (target.hp <= 0) combatLog(`${target.name} falls, but the crystal remembers.`);
  }
  function finishHeroAction(hero) { hero.atb = 0; hero.guard = false; game.combat.activeHero = null; game.combat.menu = 'root'; game.combat.sub = null; game.combat.actions++; }
  function targetEnemy(index) { const e = game.combat.enemies[index]; return e && e.hp > 0 ? e : livingEnemies()[0]; }
  function damageEnemy(enemy, amount, color, label) {
    if (!enemy) return;
    const actual = Math.max(1, Math.round(amount + Math.random() * 5)); enemy.hp = Math.max(0, enemy.hp - actual); addParticles(enemy.x || 290, enemy.y || 200, color, 15, 80); hurtShake(3); game.flash = .08; combatLog(`${label} hits ${enemy.name} for ${actual}.`);
    if (enemy.hp <= 0) { addParticles(enemy.x || 290, enemy.y || 200, '#fff3a6', 22, 110); combatLog(`${enemy.name} disperses into motes.`); }
  }
  function heroAttack(hero, targetIndex) { const e = targetEnemy(targetIndex); damageEnemy(e, 18 + hero.level * 4 + (hero.role === 'blade' ? 7 : 0), hero.color, `${hero.name}'s strike`); finishHeroAction(hero); }
  function heroArt(hero, targetIndex) {
    if (hero.role === 'blade') { damageEnemy(targetEnemy(targetIndex), 34 + hero.level * 5, '#ff9a6d', `${hero.name} uses Rift Cut`); }
    else if (hero.role === 'scout') { damageEnemy(targetEnemy(targetIndex), 27 + hero.level * 4, '#70d9ff', `${hero.name} uses Pinpoint`); }
    else { const target = livingParty().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; const heal = 30 + hero.level * 6; target.hp = Math.min(target.maxHp, target.hp + heal); addParticles(78 + game.party.indexOf(target) * 38, 330, '#b4ff9e', 16, 45); combatLog(`${hero.name}'s Soft Chord restores ${target.name} by ${heal}.`); }
    finishHeroAction(hero);
  }
  function heroOrb(hero, orbId, targetIndex) {
    const orb = glyphs[orbId]; if (!orb) return;
    const orbLevel = Math.floor((game.orbUses[orbId] || 0) / 3) + 1;
    if (orb.kind === 'heal') { const target = livingParty().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; const heal = orb.power + hero.level * 4 + (orbLevel - 1) * 5; target.hp = Math.min(target.maxHp, target.hp + heal); addParticles(78 + game.party.indexOf(target) * 38, 330, orb.color, 18, 48); combatLog(`${orb.spell} restores ${target.name} by ${heal}.`); }
    else damageEnemy(targetEnemy(targetIndex), orb.power + hero.level * 4 + (orbLevel - 1) * 4, orb.color, `${hero.name} casts ${orb.spell}`);
    game.orbUses[orbId] = (game.orbUses[orbId] || 0) + 1;
    finishHeroAction(hero);
  }
  function useTonic(hero) {
    if (game.tonics <= 0) { combatLog('The tonic satchel is empty.'); return; }
    const target = livingParty().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; const heal = 32; game.tonics--; target.hp = Math.min(target.maxHp, target.hp + heal); addParticles(78 + game.party.indexOf(target) * 38, 330, '#ffe66d', 14, 40); combatLog(`${hero.name} gives ${target.name} a tonic (+${heal}).`); finishHeroAction(hero);
  }
  function useSurge(hero) {
    if (hero.limit < 100) return;
    hero.limit = 0; livingEnemies().forEach(e => damageEnemy(e, 58 + hero.level * 9, '#fff1a0', `${hero.name}'s SKYBREAK`)); addParticles(294, 202, '#fff1a0', 40, 140); game.flash = .2; combatLog(`${hero.name} unleashes SKYBREAK!`); finishHeroAction(hero);
  }
  function commandRoot(index) {
    const c = game.combat, hero = game.party[c.activeHero]; if (!hero) return;
    if (index === 0) c.menu = 'target', c.sub = 'attack';
    if (index === 1) c.menu = 'arts';
    if (index === 2) c.menu = 'orbs';
    if (index === 3) c.menu = 'item';
    if (index === 4) { hero.guard = true; combatLog(`${hero.name} braces behind a prism guard.`); finishHeroAction(hero); }
  }
  const rootLabels = ['ATTACK', 'ARTS', 'ORBS', 'ITEM', 'GUARD'];
  function handleCombatTap(x, y) {
    const c = game.combat; if (!c) return;
    if (c.phase === 'victory') { if (c.kind === 'boss') showWin(); else leaveCombat(); return; }
    if (c.phase === 'fail') { resetFromSave(); return; }
    if (c.activeHero === null) return;
    const hero = game.party[c.activeHero];
    if (hero.limit >= 100 && x > 278 && y > 430 && y < 525) return useSurge(hero);
    if (c.menu === 'root') {
      if (y >= 536 && y < 621) { const col = Math.floor(x / 77.5); if (col >= 0 && col < 5) commandRoot(col); }
    } else if (c.menu === 'arts') {
      if (y > 532 && y < 592 && x < 190) heroArt(hero, 0); else if (y > 532 && y < 592) c.menu = 'root'; else if (y > 604 && y < 664) c.menu = 'root';
    } else if (c.menu === 'orbs') {
      const orb = game.equipped[hero.id];
      if (!orb) { combatLog('No glyph orb is socketed to this weapon.'); c.menu = 'root'; }
      else if (y > 532 && y < 596 && x < 190) { c.menu = glyphs[orb].kind === 'heal' ? 'item' : 'target'; c.sub = 'orb'; }
      else if (y > 532 && y < 596) { game.modal = 'orbs'; }
      else if (y > 604 && y < 664) { c.menu = 'root'; }
    } else if (c.menu === 'item') {
      if (y > 532 && y < 592 && x < 190) useTonic(hero); else if (y > 532 && y < 592) c.menu = 'root'; else if (y > 604 && y < 664) c.menu = 'root';
    } else if (c.menu === 'target') {
      const idx = enemyIndexAt(x, y); if (idx >= 0) { if (c.sub === 'attack') heroAttack(hero, idx); else heroOrb(hero, game.equipped[hero.id], idx); }
      else if (y > 604 && y < 664) c.menu = 'root';
    }
  }
  function enemyIndexAt(x, y) { const n = game.combat.enemies.length; for (let i = 0; i < n; i++) { const ex = 272 + i * 52, ey = n === 1 ? 212 : 170 + i * 72; if (dist(x, y, ex, ey) < 34 && game.combat.enemies[i].hp > 0) return i; } return -1; }
  function combatKey(key) {
    const c = game.combat; if (!c || c.activeHero === null) return;
    if (key === 'x' || key === 'Escape') { c.menu = 'root'; return; }
    const max = c.menu === 'root' ? 4 : 1;
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') c.cursor = clamp(c.cursor - 1, 0, max);
    if (key === 'ArrowRight' || key === 'd' || key === 'D') c.cursor = clamp(c.cursor + 1, 0, max);
    if (key === 'ArrowUp' || key === 'w' || key === 'W') c.cursor = clamp(c.cursor - 1, 0, max);
    if (key === 'ArrowDown' || key === 's' || key === 'S') c.cursor = clamp(c.cursor + 1, 0, max);
    if (key === 'Enter' || key === ' ') {
      if (c.menu === 'root') commandRoot(c.cursor); else if (c.menu === 'arts') heroArt(game.party[c.activeHero], 0); else if (c.menu === 'orbs') heroOrb(game.party[c.activeHero], game.equipped[game.party[c.activeHero].id], 0); else if (c.menu === 'item') useTonic(game.party[c.activeHero]); else if (c.menu === 'target') heroAttack(game.party[c.activeHero], 0);
    }
  }
  function leaveCombat() {
    game.screen = 'world'; game.combat = null; game.stepsSinceBattle = 0; game.risk = Math.max(0, game.risk - 25); game.stepPending = false; game.hero.tx = game.hero.x; game.hero.ty = game.hero.y; announce('The path clears. Keep moving toward the reactor.');
  }
  function resetFromSave() {
    const s = game.savePoint || saveData();
    game.world = s.world || 'town'; game.floor = s.floor || 0; game.hero.x = s.hero?.x ?? 195; game.hero.y = s.hero?.y ?? 268; game.hero.tx = game.hero.x; game.hero.ty = game.hero.y;
    game.party = partyBlueprint.map((base, i) => ({ ...base, ...(s.party?.[i] || {}), atb: 0, guard: false })); game.coins = s.coins ?? 26; game.tonics = s.tonics ?? 3; game.orbs = s.orbs || ['ember']; game.orbUses = s.orbUses || { ember: 0, frost: 0, jolt: 0, mend: 0 }; game.equipped = s.equipped || { tavi: 'ember', nema: null, iri: null }; game.openChests = s.openChests || {};
    game.screen = 'world'; game.combat = null; game.stepsSinceBattle = 0; game.risk = 0; game.stepPending = false; game.particles = []; game.shake = 0; game.flash = 0; game.interaction = null; game.selectedHero = 0; pointerDown = null; announce('The crystal catches the party. Try a different rhythm.');
  }
  function showWin() {
    const score = Math.max(100, Math.round(6200 - game.elapsed * 3 + game.party.reduce((n, p) => n + p.level * 120 + p.xp, 0) - game.combat.totalDamage));
    game.best = Math.max(game.best, score); try { localStorage.setItem(BEST_KEY, String(game.best)); } catch (_) {}
    game.victoryStats = { score, time: game.elapsed, actions: game.combat.actions }; game.screen = 'win'; game.combat = null;
  }

  // ----- Orb and shop menus -----
  function handleModalTap(x, y) {
    if (game.modal === 'shop') {
      if (y > 240 && y < 320) { if (game.coins >= 6) { game.coins -= 6; game.tonics++; announce('Tonic added to the satchel.'); } else announce('The vendor needs 6 crowns.'); }
      else if (y > 590) game.modal = null;
      return;
    }
    if (game.modal === 'orbs') {
      if (x > 340 && y < 100) { game.modal = null; return; }
      if (y > 164 && y < 320) { game.selectedHero = clamp(Math.floor((y - 164) / 52), 0, 2); return; }
      if (y > 355 && y < 620) { const i = clamp(Math.floor((y - 355) / 58), 0, game.orbs.length - 1); const orb = game.orbs[i]; if (orb) { const hero = game.party[game.selectedHero]; const other = game.party.find(p => game.equipped[p.id] === orb); const old = game.equipped[hero.id]; if (other && other.id !== hero.id) game.equipped[other.id] = old || null; game.equipped[hero.id] = orb; announce(`${glyphs[orb].name} socketed to ${hero.name}.`); saveGame(); } }
    }
  }
  function restOrShopLabel() { return game.world === 'town' ? 'ORBS' : 'ORBS'; }

  // ----- Drawing -----
  function resizeTransform() { ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0); }
  function roundedRect(x, y, w, h, r, fill, stroke, line = 1) { ctx.beginPath(); ctx.roundRect?.(x, y, w, h, r); if (!ctx.roundRect) { ctx.rect(x, y, w, h); } if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = line; ctx.stroke(); } }
  function text(str, x, y, size = 12, color = '#d9fbff', align = 'left', weight = '400') { ctx.fillStyle = color; ctx.font = `${weight} ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(str, x, y); }
  function line(x1, y1, x2, y2, color, width = 1) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function panel(x, y, w, h, fill = 'rgba(6,15,24,.92)', stroke = '#245366') { roundedRect(x, y, w, h, 8, fill, stroke, 1); }
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#071824'); g.addColorStop(1, '#05090f'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = .55; for (let i = 0; i < 26; i++) { const x = (i * 79 + 17) % W, y = (i * 43 + 23) % 470; ctx.fillStyle = i % 3 ? '#58c9e5' : '#ff7995'; ctx.fillRect(x, y, 1.5, 1.5); } ctx.globalAlpha = 1;
    line(0, 486, W, 486, '#1b4051', 2);
  }
  function drawSkyline() {
    ctx.fillStyle = '#09131e'; ctx.fillRect(0, 82, W, 340);
    const buildings = [[0,140,58,280],[65,94,47,326],[120,160,70,260],[196,112,42,308],[246,72,58,348],[311,132,79,288]];
    buildings.forEach((b, bi) => { ctx.fillStyle = bi % 2 ? '#0d2430' : '#0b1c29'; ctx.fillRect(...b); for (let wy = b[1] + 16; wy < 400; wy += 24) for (let wx = b[0] + 10; wx < b[0] + b[2] - 4; wx += 18) { ctx.fillStyle = ((wx + wy + bi) % 3) ? '#195161' : '#e1c86e'; ctx.globalAlpha = ((wx + wy) % 5 === 0) ? .9 : .35; ctx.fillRect(wx, wy, 4, 6); } }); ctx.globalAlpha = 1;
    ctx.fillStyle = '#0a121d'; ctx.fillRect(0, 395, W, 72); line(0, 410, W, 410, '#234b5e', 2); line(0, 463, W, 463, '#1b4051', 2);
    // skyrail
    line(0, 72, W, 72, '#4ca5b7', 2); line(0, 78, W, 78, '#173e4c', 2); for (let x = 20; x < W; x += 58) { line(x, 72, x - 8, 130, '#1c5260', 2); ctx.fillStyle = '#ff7191'; ctx.fillRect(x + 8, 66, 9, 3); }
  }
  function drawTown() {
    drawSkyline();
    ctx.fillStyle = '#111c2a'; ctx.fillRect(26, 102, 109, 112); ctx.fillStyle = '#173348'; ctx.fillRect(36, 116, 90, 82); ctx.fillStyle = '#ff7f76'; ctx.fillRect(46, 91, 70, 24); text('EMBER INN', 81, 103, 10, '#fff1a0', 'center', '700'); ctx.fillStyle = '#08131d'; ctx.fillRect(75, 164, 24, 34); ctx.fillStyle = '#c7f3ff'; ctx.fillRect(47, 137, 17, 18); ctx.fillRect(108, 137, 17, 18);
    ctx.fillStyle = '#111c2a'; ctx.fillRect(253, 102, 111, 112); ctx.fillStyle = '#173348'; ctx.fillRect(263, 116, 91, 82); ctx.fillStyle = '#73e6ef'; ctx.fillRect(269, 91, 78, 24); text('LUMEN MART', 308, 103, 10, '#071018', 'center', '700'); ctx.fillStyle = '#08131d'; ctx.fillRect(300, 163, 25, 35); ctx.fillStyle = '#c7f3ff'; ctx.fillRect(273, 137, 18, 18); ctx.fillRect(330, 137, 18, 18);
    ctx.fillStyle = '#0e2630'; ctx.fillRect(24, 214, 340, 200); ctx.fillStyle = '#142d39'; ctx.fillRect(45, 231, 300, 145); ctx.fillStyle = '#173f4a'; ctx.beginPath(); ctx.arc(195, 310, 72, 0, TAU); ctx.fill(); ctx.fillStyle = '#1d5360'; ctx.beginPath(); ctx.arc(195, 310, 56, 0, TAU); ctx.fill();
    // gate
    ctx.fillStyle = '#071018'; ctx.fillRect(355, 166, 35, 154); line(355, 166, 355, 320, '#5be7f2', 3); line(389, 166, 389, 320, '#5be7f2', 3); for (let y = 180; y < 315; y += 24) line(356, y, 388, y, '#1d7683', 1); text('GATE', 372, 338, 9, '#5be7f2', 'center', '700');
    drawCrystal(195, 340); npcData.forEach(n => drawNpc(n.x, n.y, n.color, n.name));
    text('NEON VEIL / LOWER PLAZA', 16, 438, 10, '#78a8b2', 'left', '700'); text('west path →', 337, 438, 9, '#70d9ff', 'right');
  }
  function drawField() {
    const g = ctx.createLinearGradient(0, 0, 0, 470); g.addColorStop(0, '#0a2832'); g.addColorStop(1, '#07131b'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, WORLD_H);
    ctx.fillStyle = '#0d3540'; ctx.fillRect(0, 390, W, 78); for (let x = -20; x < W + 20; x += 32) { line(x, 390, x + 18, 468, '#19515b', 1); }
    // path and reactor silhouette
    ctx.fillStyle = '#142a31'; ctx.beginPath(); ctx.moveTo(28, 440); ctx.lineTo(122, 330); ctx.lineTo(215, 280); ctx.lineTo(360, 210); ctx.lineTo(390, 200); ctx.lineTo(390, 330); ctx.lineTo(240, 333); ctx.lineTo(110, 390); ctx.lineTo(60, 468); ctx.fill();
    for (let i = 0; i < 8; i++) { const x = 16 + i * 47, y = 90 + (i * 57) % 240; ctx.fillStyle = i % 2 ? '#4b9a7d' : '#2f6e6f'; ctx.beginPath(); ctx.arc(x, y, 9 + i % 4, 0, TAU); ctx.fill(); ctx.fillStyle = '#75e6ad'; ctx.fillRect(x - 2, y - 15, 4, 7); }
    ctx.fillStyle = '#101c28'; ctx.fillRect(315, 86, 66, 99); ctx.fillStyle = '#263d4e'; ctx.fillRect(326, 98, 44, 77); ctx.strokeStyle = '#ff6c71'; ctx.lineWidth = 3; ctx.strokeRect(326, 98, 44, 77); text('REACTOR', 348, 126, 8, '#ff9696', 'center', '700'); text('SHELL', 348, 138, 8, '#ff9696', 'center', '700');
    drawCrystal(62, 122); drawChest(234, 284, !!game.openChests.field); text('GLASSBLOOM VERGE', 16, 438, 10, '#9ff5c4', 'left', '700'); text('reactor gate →', 375, 438, 9, '#ff9d88', 'right');
  }
  function drawDungeon() {
    ctx.fillStyle = '#0a0d18'; ctx.fillRect(0, 0, W, WORLD_H); ctx.fillStyle = '#111b2a'; ctx.fillRect(15, 55, 360, 356); ctx.strokeStyle = '#263856'; ctx.lineWidth = 2; ctx.strokeRect(15, 55, 360, 356);
    for (let x = 22; x < 375; x += 28) { line(x, 55, x, 411, '#172944', 1); } for (let y = 61; y < 411; y += 28) { line(15, y, 375, y, '#172944', 1); }
    const g = ctx.createRadialGradient(200, 200, 10, 200, 200, 230); g.addColorStop(0, 'rgba(255,95,112,.13)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(15, 55, 360, 356);
    for (let i = 0; i < 7; i++) { const x = 62 + i * 43, y = 188 + (i % 3) * 44; ctx.fillStyle = '#20334b'; ctx.fillRect(x, y, 23, 12); ctx.fillStyle = i % 2 ? '#4e91a5' : '#995769'; ctx.fillRect(x + 7, y - 4, 8, 4); }
    drawCrystal(54, 105); drawChest(250, 300, !!game.openChests[`floor${game.floor}`]);
    if (game.floor < 3) { ctx.fillStyle = '#271e38'; ctx.beginPath(); ctx.arc(340, 190, 30, 0, TAU); ctx.fill(); ctx.strokeStyle = '#a89dff'; ctx.lineWidth = 3; ctx.stroke(); text('↓', 340, 190, 28, '#d6cbff', 'center', '700'); text('DOWN', 340, 232, 8, '#a89dff', 'center', '700'); }
    else { ctx.fillStyle = '#261624'; ctx.beginPath(); ctx.arc(287, 154, 44, 0, TAU); ctx.fill(); ctx.strokeStyle = '#ff647a'; ctx.lineWidth = 2; ctx.stroke(); for (let a = 0; a < 6; a++) { const xx = 287 + Math.cos(a) * 34, yy = 154 + Math.sin(a) * 34; ctx.fillStyle = '#ff9b6f'; ctx.fillRect(xx - 3, yy - 3, 6, 6); } text('WARDEN', 287, 211, 9, '#ff97a2', 'center', '700'); }
    text(`REACTOR / FLOOR ${game.floor}`, 16, 438, 10, '#ff9c9c', 'left', '700'); text(game.floor < 3 ? 'downward route →' : 'warden chamber', 375, 438, 9, '#ff9c9c', 'right');
  }
  function drawCrystal(x, y) { ctx.save(); ctx.translate(x, y); ctx.shadowBlur = 16; ctx.shadowColor = '#72e7ff'; ctx.fillStyle = '#72e7ff'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(11, -5); ctx.lineTo(7, 14); ctx.lineTo(-7, 14); ctx.lineTo(-11, -5); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#e5feff'; ctx.globalAlpha = .75; ctx.beginPath(); ctx.moveTo(-2, -11); ctx.lineTo(3, -5); ctx.lineTo(0, 8); ctx.closePath(); ctx.fill(); ctx.restore(); }
  function drawChest(x, y, opened) { ctx.fillStyle = opened ? '#293642' : '#b9704f'; ctx.fillRect(x - 16, y - 11, 32, 22); ctx.fillStyle = opened ? '#41505a' : '#ffd06f'; ctx.fillRect(x - 16, y - 2, 32, 4); ctx.fillStyle = '#0b151d'; ctx.fillRect(x - 3, y - 1, 6, 4); if (!opened) { ctx.shadowBlur = 12; ctx.shadowColor = '#ffe66d'; ctx.strokeStyle = '#ffe66d'; ctx.strokeRect(x - 17, y - 12, 34, 24); ctx.shadowBlur = 0; } }
  function drawNpc(x, y, color, name) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y - 13, 9, 0, TAU); ctx.fill(); ctx.fillStyle = '#0b131c'; ctx.fillRect(x - 10, y - 4, 20, 27); ctx.fillStyle = color; ctx.fillRect(x - 14, y + 3, 28, 4); text(name, x, y + 35, 8, color, 'center', '700'); }
  function drawHero(x, y, color, dir = 1, scale = 1) { ctx.save(); ctx.translate(x, y); ctx.scale(dir * scale, scale); ctx.shadowBlur = 12; ctx.shadowColor = color; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -18, 10, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#0b1420'; ctx.fillRect(-10, -7, 20, 25); ctx.fillStyle = '#d9fbff'; ctx.fillRect(3, -19, 4, 3); ctx.fillStyle = color; ctx.fillRect(-16, -2, 7, 4); ctx.fillRect(9, -2, 10, 4); ctx.fillStyle = '#1f4050'; ctx.fillRect(-9, 18, 6, 10); ctx.fillRect(3, 18, 6, 10); ctx.restore(); }
  function drawWorldHero() { drawHero(game.hero.x, game.hero.y, game.party[0].color, game.hero.dir, .85); if (dist(game.hero.x, game.hero.y, game.hero.tx, game.hero.ty) > 3) { ctx.globalAlpha = .28; ctx.fillStyle = '#d9fbff'; ctx.beginPath(); ctx.arc(game.hero.tx, game.hero.ty, 5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; } }
  function drawWorldUI() {
    panel(10, 8, 220, 46, 'rgba(6,15,24,.84)', '#245366'); text(game.world === 'town' ? 'LOWER PLAZA' : game.world === 'field' ? 'GLASSBLOOM VERGE' : `REACTOR FLOOR ${game.floor}`, 20, 23, 11, '#d9fbff', 'left', '700'); text(`◈ ${game.coins}   ⏱ ${fmtTime(game.elapsed)}`, 20, 41, 10, '#a7cbd1');
    if (game.world !== 'town') { panel(244, 8, 136, 46, 'rgba(6,15,24,.84)', '#245366'); text('STEP RISK', 254, 19, 9, '#ffb27b', 'left', '700'); ctx.fillStyle = '#1a2630'; ctx.fillRect(254, 29, 114, 9); ctx.fillStyle = game.risk > 70 ? '#ff6376' : '#ffb27b'; ctx.fillRect(254, 29, 114 * game.risk / 100, 9); text(`${Math.round(game.risk)}%`, 368, 43, 9, '#ffcfab', 'right'); }
    panel(10, 498, 370, 112, 'rgba(6,15,24,.92)', '#245366'); text(game.messageTime > 0 ? game.message : 'Tap the glowing landmarks to interact.', 20, 520, 11, '#d9fbff', 'left', '700'); text('Party', 20, 548, 9, '#78a8b2', 'left', '700'); game.party.forEach((p, i) => { const x = 20 + i * 118; text(`${p.name} ${p.hp}/${p.maxHp}`, x, 565, 9, p.color, 'left', '700'); ctx.fillStyle = '#192630'; ctx.fillRect(x, 575, 100, 6); ctx.fillStyle = p.hp / p.maxHp > .35 ? p.color : '#ff6376'; ctx.fillRect(x, 575, 100 * p.hp / p.maxHp, 6); });
    button(10, 640, 112, 45, 'ORBS', '#70d9ff'); button(130, 640, 120, 45, 'INFO', '#a89dff'); button(258, 640, 122, 45, game.world === 'town' ? 'GATE →' : 'ROUTE', '#ff9a6d'); text('Arrows/WASD move · Enter interacts', 195, 695, 9, '#62818b', 'center');
  }
  function button(x, y, w, h, label, color, selected = false) { roundedRect(x, y, w, h, 6, selected ? color : 'rgba(18,37,49,.95)', color, 1.5); text(label, x + w / 2, y + h / 2, 10, selected ? '#071018' : color, 'center', '700'); }

  function drawCombat() {
    const c = game.combat;
    const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#080f1c'); g.addColorStop(.55, '#101a30'); g.addColorStop(1, '#241324'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, WORLD_H);
    ctx.fillStyle = '#15223a'; ctx.beginPath(); ctx.ellipse(199, 386, 171, 42, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#334e68'; ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < 16; i++) { const x = (i * 53 + 20) % 390, y = 70 + (i * 37) % 260; ctx.fillStyle = i % 3 ? '#376176' : '#d66d7e'; ctx.globalAlpha = .6; ctx.fillRect(x, y, 2, 2); } ctx.globalAlpha = 1;
    // party side view
    game.party.forEach((p, i) => { const x = 67 + i * 42, y = 289 + (i % 2) * 27; if (p.hp > 0) drawHero(x, y, p.color, 1, .88); else { ctx.globalAlpha = .28; drawHero(x, y + 7, '#53636d', 1, .7); ctx.globalAlpha = 1; } });
    c.enemies.forEach((e, i) => { const x = 286 + i * 49, y = c.enemies.length === 1 ? 216 : 172 + i * 72; if (e.hp > 0) drawEnemy(x, y, e.color, e.boss, 1 + (e.boss ? .35 : 0)); else { ctx.globalAlpha = .2; drawEnemy(x, y + 8, '#65717d', false, .75); ctx.globalAlpha = 1; } });
    panel(10, 8, 370, 47, 'rgba(5,11,20,.8)', '#29465c'); text(c.kind === 'boss' ? 'WARDEN CHAMBER' : 'UNSTABLE CONTACT', 20, 23, 11, c.kind === 'boss' ? '#ff9a9a' : '#d9fbff', 'left', '700'); text(`DAMAGE TAKEN ${c.totalDamage}`, 370, 23, 9, '#93aeb8', 'right'); text(c.log, 20, 42, 10, '#c2d6da');
    // enemy names and bars
    c.enemies.forEach((e, i) => { const x = 246 + i * 52, y = c.enemies.length === 1 ? 132 : 102 + i * 72; text(e.name, x, y, 8, e.color, 'center', '700'); ctx.fillStyle = '#2a1c2b'; ctx.fillRect(x - 27, y + 10, 54, 5); ctx.fillStyle = e.color; ctx.fillRect(x - 27, y + 10, 54 * e.hp / e.maxHp, 5); });
    // ATB cards
    game.party.forEach((p, i) => drawPartyCombatCard(p, 10 + i * 123, 428));
    const hero = c.activeHero === null ? null : game.party[c.activeHero];
    if (hero && hero.limit >= 100) button(282, 432, 96, 38, 'SURGE!', '#fff1a0', true);
    if (c.activeHero === null) { panel(10, 534, 370, 130, 'rgba(6,15,24,.9)', '#245366'); text('ATB flowing…', 195, 565, 14, '#78a8b2', 'center', '700'); text('The next ready hero will open a command ring.', 195, 593, 10, '#8aaab2', 'center'); }
    else drawCommandPanel(hero);
  }
  function drawEnemy(x, y, color, boss, scale) { ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.shadowBlur = boss ? 24 : 12; ctx.shadowColor = color; ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, -33); ctx.lineTo(23, -5); ctx.lineTo(17, 30); ctx.lineTo(-18, 30); ctx.lineTo(-24, -5); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#171328'; ctx.fillRect(-13, -7, 8, 5); ctx.fillRect(7, -7, 8, 5); ctx.fillStyle = '#fff1a0'; ctx.fillRect(-11, -6, 4, 3); ctx.fillRect(7, -6, 4, 3); if (boss) { ctx.strokeStyle = '#ffdd84'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -12, 34, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); } ctx.restore(); }
  function drawPartyCombatCard(p, x, y) { panel(x, y, 113, 43, 'rgba(5,12,20,.86)', p.hp > 0 ? '#244c5d' : '#472b38'); text(p.name, x + 7, y + 10, 9, p.color, 'left', '700'); text(`${Math.max(0, p.hp)}/${p.maxHp}`, x + 106, y + 10, 8, '#aac7cc', 'right'); ctx.fillStyle = '#182832'; ctx.fillRect(x + 7, y + 18, 99, 5); ctx.fillStyle = p.hp / p.maxHp > .35 ? p.color : '#ff6376'; ctx.fillRect(x + 7, y + 18, 99 * Math.max(0, p.hp) / p.maxHp, 5); ctx.fillStyle = '#162d38'; ctx.fillRect(x + 7, y + 29, 99, 5); ctx.fillStyle = '#f3cc68'; ctx.fillRect(x + 7, y + 29, 99 * p.atb / 100, 5); }
  function drawCommandPanel(hero) { const c = game.combat; panel(10, 534, 370, 130, 'rgba(6,15,24,.94)', '#356a78'); text(`${hero.name} READY`, 20, 548, 10, hero.color, 'left', '700'); if (c.menu === 'root') rootLabels.forEach((label, i) => button(15 + i * 74, 559, 68, 45, label, hero.color, i === c.cursor)); else if (c.menu === 'arts') { button(15, 559, 170, 45, hero.skill.toUpperCase(), hero.color, true); button(195, 559, 170, 45, 'BACK', '#8aaab2'); text(hero.role === 'medic' ? 'Restores the lowest ally.' : 'A focused strike.', 195, 646, 10, '#8aaab2', 'center'); } else if (c.menu === 'orbs') { const orb = game.equipped[hero.id], level = orb ? Math.floor((game.orbUses[orb] || 0) / 3) + 1 : 0; button(15, 559, 170, 45, orb ? `${glyphs[orb].spell.toUpperCase()} L${level}` : 'EMPTY SOCKET', orb ? glyphs[orb].color : '#6f838b', !!orb); button(195, 559, 170, 45, 'LOADOUT', '#70d9ff'); text(orb ? `${glyphs[orb].name} glyph · grows with use` : 'Socket an orb from the loadout.', 195, 646, 10, '#8aaab2', 'center'); } else if (c.menu === 'item') { button(15, 559, 170, 45, `TONIC ×${game.tonics}`, '#ffe66d', game.tonics > 0); button(195, 559, 170, 45, 'BACK', '#8aaab2'); text('Restores the lowest ally.', 195, 646, 10, '#8aaab2', 'center'); } else if (c.menu === 'target') { text(c.sub === 'orb' ? 'CHOOSE A TARGET' : 'CHOOSE A TARGET', 195, 568, 12, '#d9fbff', 'center', '700'); button(15, 604, 360, 45, 'BACK', '#8aaab2'); }
  }
  function drawModal() {
    ctx.fillStyle = 'rgba(2,7,12,.78)'; ctx.fillRect(0, 0, W, H);
    if (game.modal === 'shop') { panel(24, 105, 342, 510, 'rgba(7,18,28,.98)', '#73e6ef'); text('LUMEN MART', 45, 139, 18, '#73e6ef', 'left', '700'); text(`PURSE ◈ ${game.coins}`, 345, 140, 10, '#ffe66d', 'right'); text('The vendor trades warm tonics for cold crowns.', 45, 170, 10, '#9bb9bf'); panel(42, 218, 306, 84, 'rgba(15,39,49,.95)', '#ffe66d'); text('TONIC', 60, 240, 12, '#ffe66d', 'left', '700'); text('heal the lowest ally', 60, 262, 10, '#9bb9bf'); text('◈ 6', 330, 255, 12, '#ffe66d', 'right', '700'); text(`SATCHEL ×${game.tonics}`, 45, 360, 11, '#d9fbff', 'left', '700'); text('Glyph orbs are found in the field chests.', 45, 386, 10, '#8aaab2'); button(42, 548, 306, 48, 'CLOSE', '#73e6ef'); } else if (game.modal === 'orbs') drawOrbModal();
  }
  function drawOrbModal() { panel(16, 70, 358, 570, 'rgba(7,18,28,.98)', '#70d9ff'); text('GLYPH LOADOUT', 34, 103, 17, '#70d9ff', 'left', '700'); text('X', 354, 103, 15, '#ff9a6d', 'center', '700'); text('Select a hero, then tap an orb to socket it.', 34, 130, 10, '#9bb9bf'); text('HEROES', 34, 153, 9, '#78a8b2', 'left', '700'); game.party.forEach((p, i) => { const y = 169 + i * 52; const selected = i === game.selectedHero; panel(30, y, 330, 43, selected ? 'rgba(36,73,84,.96)' : 'rgba(13,29,39,.95)', selected ? p.color : '#244858'); text(p.name, 44, y + 14, 11, p.color, 'left', '700'); text(p.job, 44, y + 30, 9, '#9bb9bf'); const orb = game.equipped[p.id]; text(orb ? `${glyphs[orb].icon} ${glyphs[orb].name}` : 'EMPTY SOCKET', 344, y + 21, 10, orb ? glyphs[orb].color : '#6c848c', 'right', '700'); }); text('ORBS IN SATCHEL', 34, 337, 9, '#78a8b2', 'left', '700'); if (!game.orbs.length) text('No glyphs yet.', 34, 375, 11, '#8aaab2'); game.orbs.forEach((id, i) => { const y = 355 + i * 58; const orb = glyphs[id]; panel(30, y, 330, 45, 'rgba(13,29,39,.95)', orb.color); text(`${orb.icon}  ${orb.name}`, 45, y + 14, 11, orb.color, 'left', '700'); text(`${orb.spell} · power ${orb.power}`, 45, y + 31, 9, '#a7c4c9'); }); text('Socketing swaps the displaced orb between heroes.', 34, 610, 9, '#7898a1'); }
  function drawDialog() { ctx.fillStyle = 'rgba(2,7,12,.44)'; ctx.fillRect(0, 0, W, WORLD_H); panel(18, 355, 354, 108, 'rgba(6,15,24,.97)', game.dialog.color); text(game.dialog.name, 34, 378, 12, game.dialog.color, 'left', '700'); text(game.dialog.lines[game.dialog.index], 34, 407, 11, '#d9fbff'); text(game.dialog.index < game.dialog.lines.length - 1 ? 'tap to continue' : 'tap to close', 354, 443, 9, '#8aaab2', 'right'); }
  function drawFail() { ctx.fillStyle = 'rgba(3,7,12,.86)'; ctx.fillRect(0, 0, W, H); text('SIGNAL LOST', 195, 238, 29, '#ff7185', 'center', '700'); text('The last crystal catches your names.', 195, 282, 11, '#d9fbff', 'center'); button(74, 342, 242, 58, 'RETURN TO CRYSTAL', '#70d9ff', true); text('tap / Enter to restart', 195, 426, 10, '#8aaab2', 'center'); }
  function drawWin() { ctx.fillStyle = '#071522'; ctx.fillRect(0, 0, W, H); const g = ctx.createRadialGradient(195, 235, 5, 195, 235, 260); g.addColorStop(0, 'rgba(255,171,100,.3)'); g.addColorStop(1, 'rgba(7,21,34,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); for (let i = 0; i < 30; i++) { ctx.fillStyle = i % 2 ? '#ffe66d' : '#70d9ff'; ctx.fillRect((i * 67) % W, 110 + (i * 29) % 360, 2, 2); } text('AETHERFALL', 195, 150, 30, '#d9fbff', 'center', '700'); text('WARDEN SILENCED', 195, 191, 13, '#ff9a6d', 'center', '700'); line(72, 220, 318, 220, '#356a78', 1); text(`TIME  ${fmtTime(game.victoryStats.time)}`, 195, 263, 14, '#d9fbff', 'center', '700'); text(`SCORE  ${game.victoryStats.score}`, 195, 294, 19, '#ffe66d', 'center', '700'); text(`BEST   ${game.best}`, 195, 322, 11, '#9bb9bf', 'center'); text(`ACTIONS  ${game.victoryStats.actions}`, 195, 351, 11, '#9bb9bf', 'center'); text('The lower plaza is safe for one more night.', 195, 412, 10, '#a7c4c9', 'center'); button(74, 505, 242, 58, 'RUN IT AGAIN', '#70d9ff', true); text('tap / Enter to restart', 195, 590, 10, '#8aaab2', 'center'); }

  function update(dt) {
    game.elapsed += game.screen === 'win' ? 0 : dt;
    if (game.messageTime > 0) game.messageTime -= dt;
    game.shake = Math.max(0, game.shake - dt * 12); game.flash = Math.max(0, game.flash - dt); game.particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 32 * dt; p.life -= dt; }); game.particles = game.particles.filter(p => p.life > 0);
    if (game.screen === 'world' && !game.dialog && !game.modal) { const dx = game.hero.tx - game.hero.x, dy = game.hero.ty - game.hero.y, d = Math.hypot(dx, dy); if (d > 2) { const step = Math.min(d, 92 * dt); game.hero.x += dx / d * step; game.hero.y += dy / d * step; } else if (game.stepPending) { game.stepPending = false; onStep(); if (game.screen === 'world' && game.interaction) { const interaction = game.interaction; game.interaction = null; interact(interaction); } } }
    if (game.screen === 'combat') updateCombat(dt);
  }
  function updateCombat(dt) {
    const c = game.combat; if (!c) return;
    if (c.phase === 'fight') {
      game.party.forEach(p => { if (p.hp > 0 && p.atb < 100) p.atb = Math.min(100, p.atb + p.speed * dt * .7); });
      c.enemies.forEach(e => { if (e.hp > 0) { e.atb += e.speed * dt * .58; if (e.atb >= 100) { e.atb = 0; enemyAction(e); } } });
      chooseReadyHero();
      if (!livingEnemies().length) { c.phase = 'victory'; c.timer = 0; const xp = c.kind === 'boss' ? 160 : 36; game.party.forEach(p => { if (p.hp > 0) addXp(p, xp); }); game.coins += c.kind === 'boss' ? 120 : 9; saveGame(); }
      else if (!livingParty().length) { c.phase = 'fail'; c.timer = 0; }
    } else if (c.phase === 'victory') { c.timer += dt; if (c.kind === 'boss') showWin(); else if (c.timer > 2.2) leaveCombat(); }
  }
  function render() {
    resizeTransform(); ctx.save(); if (game.shake > 0) ctx.translate((Math.random() - .5) * game.shake, (Math.random() - .5) * game.shake); drawBackground(); if (game.screen === 'world') { if (game.world === 'town') drawTown(); else if (game.world === 'field') drawField(); else drawDungeon(); drawWorldHero(); drawWorldUI(); } else if (game.screen === 'combat') drawCombat(); ctx.restore(); if (game.dialog) drawDialog(); if (game.modal) drawModal(); if (game.screen === 'fail' || (game.screen === 'combat' && game.combat?.phase === 'fail')) drawFail(); else if (game.screen === 'win') drawWin(); for (const p of game.particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; if (game.flash > 0) { ctx.fillStyle = `rgba(255,245,210,${game.flash * 1.5})`; ctx.fillRect(0, 0, W, H); } }

  function frame(now) { const dt = Math.min(.033, Math.max(0, (now - last) / 1000)); last = now; update(dt); render(); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
})();
