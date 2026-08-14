/* Towerline Duel - fleet F9 AAA rebuild.
 * Phaser renders the presentation. GGKit owns lifecycle, input identity,
 * save validation, audio buses, orientation, and accessibility settings.
 * The simulation is fixed-step and the renderer never writes sim state.
 */
(function () {
  'use strict';

  var W = 390;
  var H = 844;
  var STEP = 1 / 60;
  var MAX_SIM_STEPS_PER_FRAME = 6;
  var MAX_UNITS = 64;
  var MAX_PROJECTILES = 24;
  var MAX_FX = 96;
  var MAX_WAVES = 7;
  var RESULT_STATUSES = { victory: true, defeat: true };
  var TAU = Math.PI * 2;
  var MODE_NAMES = { ladder: 'LADDER', draft: 'DRAFT DUEL', gauntlet: 'GAUNTLET' };
  var TEAM = { player: 0x43c7f4, enemy: 0xff665c };
  var PALETTE = {
    ink: 0x07111d, ink2: 0x0b1a29, panel: 0x10283a, panel2: 0x15354a,
    line: 0x2b5367, text: 0xe9fbff, muted: 0x91aeba, teal: 0x43c7f4,
    blue: 0x3864e8, coral: 0xff665c, wine: 0xb72e4d, amber: 0xe0a34a,
    bone: 0xd8c38c, moss: 0x788b5a, violet: 0xb78cff, white: 0xf6ffff,
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hex(value) { return typeof value === 'number' ? value : Number('0x' + String(value).replace('#', '')); }
  function getCard(id) { return CARDS[id] || CARDS[0]; }
  function getArena(key) { return ARENAS[key] || ARENAS.openField; }
  function modeSafe(value) { return value === 'draft' || value === 'gauntlet' || value === 'ladder' ? value : null; }
  function intSafe(value, fallback, min, max) {
    var n = Number(value);
    return Number.isFinite(n) && Math.floor(n) === n ? clamp(n, min, max) : fallback;
  }
  function formatTime(seconds) {
    var t = Math.max(0, Math.ceil(seconds));
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }
  function tier(score) { return score >= 0.84 ? 'gold' : score >= 0.52 ? 'silver' : 'bronze'; }
  function titleCase(value) { return String(value).charAt(0).toUpperCase() + String(value).slice(1); }

  var CARDS = [
    { id: 'rivetlings', name: 'Rivetlings', short: 'RIVETS', role: 'swarm', counter: 'rush', cost: 2, hp: 70, damage: 17, count: 3, speed: 44, range: 22, attack: 0.72, color: 0xf1c55f, text: 'Three quick bodies' },
    { id: 'midge-mob', name: 'Midge Mob', short: 'MIDGES', role: 'swarm', counter: 'rush', cost: 3, hp: 56, damage: 15, count: 4, speed: 39, range: 24, attack: 0.6, color: 0xe9b457, text: 'Four lane scrappers' },
    { id: 'shard-sprites', name: 'Shard Sprites', short: 'SPRITES', role: 'swarm', counter: 'ranged', cost: 4, hp: 52, damage: 22, count: 3, speed: 52, range: 28, attack: 0.66, color: 0xffdb76, text: 'Fast bladelets' },
    { id: 'bulwark', name: 'Bulwark', short: 'BULWARK', role: 'tank', counter: 'building', cost: 5, hp: 580, damage: 43, count: 1, speed: 20, range: 28, attack: 1.25, color: 0xd88762, text: 'Slow lane wall' },
    { id: 'gravelback', name: 'Gravelback', short: 'GRAVEL', role: 'tank', counter: 'building', cost: 4, hp: 430, damage: 34, count: 1, speed: 26, range: 27, attack: 1.05, color: 0xbd755c, text: 'Steady anchor' },
    { id: 'iron-cask', name: 'Iron Cask', short: 'CASK', role: 'tank', counter: 'building', cost: 6, hp: 760, damage: 56, count: 1, speed: 15, range: 30, attack: 1.5, color: 0xa96559, text: 'Heavy answer' },
    { id: 'needlewing', name: 'Needlewing', short: 'NEEDLE', role: 'ranged', counter: 'tank', cost: 3, hp: 150, damage: 37, count: 1, speed: 29, range: 154, attack: 1.02, color: 0x6eb9ff, text: 'Long reach' },
    { id: 'prism-scout', name: 'Prism Scout', short: 'PRISM', role: 'ranged', counter: 'tank', cost: 4, hp: 190, damage: 50, count: 1, speed: 25, range: 178, attack: 1.24, color: 0x77c6ff, text: 'Focused beam' },
    { id: 'longbeam', name: 'Longbeam', short: 'BEAM', role: 'ranged', counter: 'tank', cost: 5, hp: 235, damage: 76, count: 1, speed: 18, range: 208, attack: 1.58, color: 0x9ad8ff, text: 'Piercing shot' },
    { id: 'cinder-orbiter', name: 'Cinder Orbiter', short: 'CINDER', role: 'splash', counter: 'swarm', cost: 4, hp: 200, damage: 35, splash: 56, count: 1, speed: 25, range: 132, attack: 1.18, color: 0xb08bff, text: 'Burns clusters' },
    { id: 'gale-mortar', name: 'Gale Mortar', short: 'GALE', role: 'splash', counter: 'swarm', cost: 5, hp: 255, damage: 58, splash: 74, count: 1, speed: 16, range: 182, attack: 1.5, color: 0xc0a4ff, text: 'Wide pressure' },
    { id: 'quillburst', name: 'Quillburst', short: 'QUILL', role: 'splash', counter: 'swarm', cost: 3, hp: 120, damage: 27, splash: 50, count: 1, speed: 34, range: 108, attack: 0.9, color: 0x9877f1, text: 'Cheap burst' },
    { id: 'volt-hound', name: 'Volt Hound', short: 'HOUND', role: 'rush', counter: 'ranged', cost: 3, hp: 185, damage: 94, count: 1, speed: 86, range: 24, attack: 1.34, color: 0x5ee2c3, text: 'First bite' },
    { id: 'skitter-dash', name: 'Skitter Dash', short: 'SKITTER', role: 'rush', counter: 'ranged', cost: 2, hp: 108, damage: 60, count: 1, speed: 108, range: 22, attack: 1.03, color: 0x54cfb4, text: 'Lane sprint' },
    { id: 'razor-kite', name: 'Razor Kite', short: 'RAZOR', role: 'rush', counter: 'ranged', cost: 4, hp: 235, damage: 138, count: 1, speed: 72, range: 25, attack: 1.52, color: 0x84f0d7, text: 'Tower dive' },
    { id: 'spark-nest', name: 'Spark Nest', short: 'NEST', role: 'building', counter: 'rush', cost: 4, hp: 380, damage: 30, count: 1, speed: 0, range: 154, attack: 0.88, color: 0xd6e0e8, building: true, text: 'Lane turret' },
    { id: 'pulse-mill', name: 'Pulse Mill', short: 'MILL', role: 'building', counter: 'rush', cost: 5, hp: 490, damage: 46, count: 1, speed: 0, range: 178, attack: 1.12, color: 0xb9cbd7, building: true, text: 'Reliable anchor' },
    { id: 'bramble-beacon', name: 'Bramble Beacon', short: 'BEACON', role: 'building', counter: 'rush', cost: 3, hp: 270, damage: 21, count: 1, speed: 0, range: 114, attack: 0.7, color: 0xa9d5c0, building: true, text: 'Slow field' },
    { id: 'tether-post', name: 'Tether Post', short: 'TETHER', role: 'building', counter: 'rush', cost: 2, hp: 220, damage: 11, count: 1, speed: 0, range: 98, attack: 0.55, color: 0xa8c4d4, building: true, text: 'Buys seconds' },
    { id: 'aegis-relay', name: 'Aegis Relay', short: 'AEGIS', role: 'building', counter: 'rush', cost: 6, hp: 650, damage: 62, count: 1, speed: 0, range: 202, attack: 1.65, color: 0xe1eef2, building: true, text: 'Fortified anchor' },
    { id: 'static-bloom', name: 'Static Bloom', short: 'STATIC', role: 'spell', counter: 'ranged', cost: 3, damage: 132, radius: 68, spell: 'shock', color: 0xff78bd, text: 'Burst and lock' },
    { id: 'frostline', name: 'Frostline', short: 'FROST', role: 'spell', counter: 'rush', cost: 2, damage: 72, radius: 78, spell: 'freeze', color: 0x72d9ff, text: 'Pocket slow' },
    { id: 'meteor-knot', name: 'Meteor Knot', short: 'METEOR', role: 'spell', counter: 'tank', cost: 5, damage: 242, radius: 54, spell: 'meteor', color: 0xff9b6b, text: 'Pinpoint impact' },
    { id: 'mend-field', name: 'Mend Field', short: 'MEND', role: 'spell', counter: 'splash', cost: 3, heal: 178, radius: 78, spell: 'heal', color: 0x65e6a6, text: 'Restore bodies' },
  ];

  var WAVE_PATTERNS = [
    { name: 'SCOUT SCREEN', cards: [0, 6], lanes: [0, 1], formation: 'split', boss: false },
    { name: 'CROSS CURRENT', cards: [1, 13, 9], lanes: [0, 1, 0], formation: 'cross', boss: false },
    { name: 'BREACH STACK', cards: [3, 0, 0], lanes: [0, 0, 1], formation: 'stack', boss: false },
    { name: 'RELAY BREAKER', cards: [7, 12, 17], lanes: [1, 0, 1], formation: 'cross', boss: true },
    { name: 'CROWN PUSH', cards: [5, 10, 14, 1], lanes: [0, 1, 0, 1], formation: 'stack', boss: true },
    { name: 'LAST CIRCUIT', cards: [8, 17, 19, 5], lanes: [1, 0, 1, 0], formation: 'split', boss: true },
  ];
  var TUTORIAL_STEPS = [
    { at: 5, text: 'Build cards snap to open sockets. Adjacency creates a link' },
    { at: 12, text: 'Counters: splash beats swarms, ranged beats tanks' },
    { at: 22, text: 'Card cooldowns are short. Stage, undo, then commit' },
    { at: 35, text: 'Enemy lanes pulse before every formation arrives' },
    { at: 52, text: 'Boss charges flash red. Freeze or focus the boss' },
  ];

  var ARENAS = {
    openField: { key: 'openField', name: 'Open Field', signature: 'Ladder meadow', lanes: 2, accent: 0x43c7f4, ground: 0x123348, river: 0x1a6370, motif: 'meadow' },
    brassworks: { key: 'brassworks', name: 'Brassworks', signature: 'Draft constructed', lanes: 2, accent: 0xe0a34a, ground: 0x3a2c2d, river: 0x805b36, motif: 'brass' },
    skyglass: { key: 'skyglass', name: 'Skyglass Basin', signature: 'Draft constructed', lanes: 2, accent: 0xb78cff, ground: 0x25264d, river: 0x4d4f91, motif: 'sky' },
    mossworks: { key: 'mossworks', name: 'Mossworks', signature: 'Gauntlet ascent', lanes: 2, accent: 0x78b87b, ground: 0x1e3b36, river: 0x376d61, motif: 'moss' },
    nightrelay: { key: 'nightrelay', name: 'Night Relay', signature: 'Gauntlet pressure', lanes: 2, accent: 0xff78bd, ground: 0x281d3b, river: 0x5b386f, motif: 'night' },
    crown: { key: 'crown', name: 'Towerline Crown', signature: 'Champion finale', lanes: 3, accent: 0xffd36a, ground: 0x3b2d26, river: 0x8a603b, motif: 'crown' },
  };

  var RUNG_TABLE = [
    { name: 'Seedline', arena: 'openField', deck: [0, 3, 6, 1, 16, 13, 21, 22], skill: 0.32, gap: 1.55, unlock: [0, 1, 2] },
    { name: 'Copper Reach', arena: 'openField', deck: [3, 4, 6, 16, 18, 0, 21, 22], skill: 0.42, gap: 1.38, unlock: [3, 4, 5] },
    { name: 'Prism Yard', arena: 'openField', deck: [6, 7, 9, 3, 16, 19, 21, 23], skill: 0.51, gap: 1.28, unlock: [6, 7, 8] },
    { name: 'Gale Cut', arena: 'openField', deck: [9, 10, 11, 1, 4, 16, 21, 22], skill: 0.61, gap: 1.16, unlock: [9, 10, 11] },
    { name: 'Green Rush', arena: 'openField', deck: [12, 13, 14, 0, 2, 18, 21, 22], skill: 0.68, gap: 1.04, unlock: [12, 13, 14] },
    { name: 'Relay Ring', arena: 'openField', deck: [17, 19, 20, 5, 7, 14, 21, 23], skill: 0.76, gap: 0.94, unlock: [15, 16, 17] },
    { name: 'Black Current', arena: 'openField', deck: [5, 8, 10, 14, 16, 20, 21, 22], skill: 0.84, gap: 0.82, unlock: [18, 19, 20] },
    { name: 'Crown Circuit', arena: 'crown', deck: [2, 5, 8, 10, 14, 19, 21, 23], skill: 0.93, gap: 0.7, unlock: [21, 22, 23] },
  ];

  var DRAFT_TABLE = [
    { name: 'Brassworks Draft', arena: 'brassworks', enemy: [3, 6, 9, 17, 18, 21, 22, 12], note: 'Siege pieces and a patient wall', skill: 0.7, gap: 1.03 },
    { name: 'Skyglass Draft', arena: 'skyglass', enemy: [1, 7, 10, 13, 16, 19, 20, 23], note: 'Ranged lattice with cold control', skill: 0.78, gap: 0.92 },
    { name: 'Foundry Draft', arena: 'brassworks', enemy: [2, 5, 8, 11, 14, 17, 21, 23], note: 'A full-power constructed test', skill: 0.9, gap: 0.8 },
  ];

  var GAUNTLET_TABLE = [
    { name: 'Mossworks', arena: 'mossworks', enemy: [0, 3, 6, 16, 21, 13, 1, 22], skill: 0.5, gap: 1.34 },
    { name: 'Relay Marsh', arena: 'mossworks', enemy: [1, 4, 7, 17, 20, 12, 21, 22], skill: 0.61, gap: 1.18 },
    { name: 'Night Relay', arena: 'nightrelay', enemy: [2, 5, 9, 18, 19, 14, 21, 23], skill: 0.7, gap: 1.03 },
    { name: 'Redline Switch', arena: 'nightrelay', enemy: [5, 8, 10, 17, 20, 14, 21, 23], skill: 0.79, gap: 0.9 },
    { name: 'Crown Approach', arena: 'nightrelay', enemy: [2, 5, 8, 10, 14, 19, 21, 23], skill: 0.87, gap: 0.78 },
    { name: 'Towerline Crown', arena: 'crown', enemy: [2, 5, 8, 10, 14, 19, 21, 23], skill: 0.95, gap: 0.68 },
  ];

  var priorTD = window.__td;
  var query = new URLSearchParams(window.location.search);
  var priorModeValue = priorTD && typeof priorTD.forceMode === 'string' ? priorTD.forceMode : (priorTD && priorTD.state && priorTD.state.forceMode);
  var priorRungValue = priorTD && priorTD.forceRung != null ? priorTD.forceRung : (priorTD && priorTD.state && priorTD.state.forceRung);
  var rawForceRung = window.__TD_FORCE_RUNG || query.get('forceRung') || priorRungValue;
  var bootForceMode = modeSafe(window.__TD_FORCE_MODE || query.get('forceMode') || priorModeValue);
  var bootForceRung = rawForceRung == null || rawForceRung === '' ? null : intSafe(rawForceRung, 1, 1, 8);
  var bootFallback = { forceMode: bootForceMode, forceRung: bootForceRung };

  function defaultSave() {
    return { version: 1, rung: 1, deck: [0, 1, 2, 0, 1, 2, 0, 1], medals: {}, streak: 0, gauntletBest: 0, draftWins: 0, drops: 0 };
  }
  function validDeck(deck) {
    return Array.isArray(deck) && deck.length === 8 && deck.every(function (id) { return Number.isInteger(id) && id >= 0 && id < CARDS.length; });
  }
  function validMedal(value) {
    var tiers = { bronze: true, silver: true, gold: true };
    return value && typeof value === 'object' && tiers[value.rung] && tiers[value.streak] && tiers[value.tower];
  }
  function validateSave(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (value.version !== 1 || !Number.isInteger(value.rung) || value.rung < 1 || value.rung > 8 || !validDeck(value.deck)) return false;
    if (!value.medals || typeof value.medals !== 'object' || Array.isArray(value.medals)) return false;
    if (!Object.keys(value.medals).every(function (key) { return /^[1-8]$/.test(key) && validMedal(value.medals[key]); })) return false;
    if (!Number.isInteger(value.streak) || value.streak < 0 || value.streak > 999) return false;
    if (!Number.isInteger(value.gauntletBest) || value.gauntletBest < 0 || value.gauntletBest > GAUNTLET_TABLE.length) return false;
    if (!Number.isInteger(value.draftWins) || value.draftWins < 0 || value.draftWins > 999) return false;
    if (!Number.isInteger(value.drops) || value.drops < 0 || value.drops > 999) return false;
    return true;
  }

  var activeDuel = null;
  var progress;
  var tdState = {
    mode: bootForceMode || 'menu', rung: bootForceRung || 1, hand: [], deck: [], elixir: 0,
    coreHP: { player: 1000, enemy: 1000 }, forceMode: bootForceMode, forceRung: bootForceRung,
    arena: 'openField', inMatch: false, status: 'boot', medal: null, wave: 0, selectedLane: 0, cooldowns: [], synergies: 0,
  };
  var tdApi = {
    state: tdState,
    setForceMode: function (value) { bootFallback.forceMode = modeSafe(value); tdState.forceMode = bootFallback.forceMode; return tdState.forceMode; },
    setForceRung: function (value) { bootFallback.forceRung = intSafe(value, tdState.forceRung || 1, 1, 8); tdState.forceRung = bootFallback.forceRung; return tdState.forceRung; },
  };
  Object.defineProperty(tdApi, 'forceMode', { configurable: true, get: function () { return bootFallback.forceMode; }, set: function (value) { tdApi.setForceMode(value); } });
  Object.defineProperty(tdApi, 'forceRung', { configurable: true, get: function () { return bootFallback.forceRung; }, set: function (value) { tdApi.setForceRung(value); } });
  window.__td = tdApi;
  window.__TD_BOOT_FALLBACK = bootFallback;

  function saveProgress() { if (progress) kit.save.set(progress); }
  function unlockedCount() { return clamp(progress.rung * 3, 3, CARDS.length); }
  function normalizeProgress(value) {
    var base = defaultSave();
    if (!validateSave(value)) return base;
    var next = JSON.parse(JSON.stringify(value));
    var available = clamp(next.rung * 3, 3, CARDS.length);
    next.deck = next.deck.map(function (id) { return id < available ? id : 0; });
    return next;
  }
  function updateStateFromProgress() {
    tdState.deck = progress ? progress.deck.slice() : [];
    tdState.rung = progress ? progress.rung : bootFallback.forceRung;
    tdState.hand = progress ? progress.deck.slice(0, 4) : [];
  }

  var kit = GGKit.create({
    slug: 'towerline-duel',
    orientation: 'portrait',
    validateSave: validateSave,
    onPause: function () { if (activeDuel) activeDuel.setLifecyclePaused(true); },
    onResume: function () { if (activeDuel) activeDuel.setLifecyclePaused(false); },
    onRestart: function () { if (activeDuel) activeDuel.restartMatch(); },
  });
  progress = normalizeProgress(kit.save.get(null));
  updateStateFromProgress();
  kit.audio.register({
    deploy: 'assets/deploy_thud.mp3',
    clash: 'assets/clash_clang.mp3',
    spell: 'assets/spell_cast.mp3',
    victory: 'assets/victory_fanfare.mp3',
    select: 'assets/select_click.mp3',
    confirm: 'assets/confirm_ping.mp3',
    cancel: 'assets/cancel_tick.mp3',
    hit: 'assets/hit_snap.mp3',
    kill: 'assets/kill_crack.mp3',
    warning: 'assets/warning_pulse.mp3',
    wave: 'assets/wave_clear.mp3',
    music: 'assets/music_bed.mp3',
    danger: 'assets/danger_layer.mp3',
    victoryMusic: 'assets/victory_layer.mp3',
  });
  var sfxLast = {};
  function playSfx(name, gap) {
    var now = performance.now();
    var minGap = gap || 70;
    if (now - (sfxLast[name] || -1e9) < minGap) return;
    sfxLast[name] = now;
    kit.audio.sfx(name, { volume: name === 'victory' ? 0.72 : 0.5 });
  }
  function setTextIfChanged(object, value) {
    var textValue = String(value);
    if (!object || object.__tdText === textValue) return;
    object.__tdText = textValue;
    object.setText(textValue);
  }
  function setColorIfChanged(object, value) {
    if (!object || object.__tdColor === value) return;
    object.__tdColor = value;
    object.setColor(value);
  }
  function seedKitPointer(pointer) {
    var id = pointer && pointer.id != null ? pointer.id : 0;
    var event = pointer && pointer.event;
    var x = event && Number.isFinite(event.clientX) ? event.clientX : pointer.x;
    var y = event && Number.isFinite(event.clientY) ? event.clientY : pointer.y;
    if (!kit.input.pointers.has(id)) kit.input.pointers.set(id, { x: x, y: y, startX: x, startY: y, downAt: performance.now(), zone: null });
    return id;
  }
  kit.input.gamepadEdge = function (action) {
    if (!navigator.getGamepads) return false;
    var pads = navigator.getGamepads(); var pad = null;
    for (var i = 0; i < pads.length; i += 1) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
    if (!pad) return false;
    var down = false;
    if (action === 'confirm') down = !!(pad.buttons[0] && pad.buttons[0].pressed);
    if (action === 'cancel') down = !!(pad.buttons[1] && pad.buttons[1].pressed);
    if (action === 'left') down = !!((pad.buttons[14] && pad.buttons[14].pressed) || (pad.axes[0] || 0) < -0.55);
    if (action === 'right') down = !!((pad.buttons[15] && pad.buttons[15].pressed) || (pad.axes[0] || 0) > 0.55);
    if (action === 'up') down = !!((pad.buttons[12] && pad.buttons[12].pressed) || (pad.axes[1] || 0) < -0.55);
    if (action === 'down') down = !!((pad.buttons[13] && pad.buttons[13].pressed) || (pad.axes[1] || 0) > 0.55);
    var key = 'pad:' + action; var was = !!kit.__tdPadState && !!kit.__tdPadState[key]; if (!kit.__tdPadState) kit.__tdPadState = {};
    kit.__tdPadState[key] = down; return down && !was;
  };
  function pointerDesign(pointer) {
    var x = Number.isFinite(pointer.worldX) ? pointer.worldX : pointer.x;
    var y = Number.isFinite(pointer.worldY) ? pointer.worldY : pointer.y;
    return { x: clamp(x, 0, W), y: clamp(y, 0, H) };
  }
  function edgeKey(scene, code) {
    if (!scene.__tdKeys) scene.__tdKeys = {};
    var down = kit.input.keyDown(code);
    var was = !!scene.__tdKeys[code];
    scene.__tdKeys[code] = down;
    return down && !was;
  }
  function makeTexture(scene, key, width, height, draw) {
    if (scene.textures.exists(key)) return;
    var g = scene.make.graphics({ x: 0, y: 0, add: false });
    draw(g);
    g.generateTexture(key, width, height);
    g.destroy();
  }
  function addLabel(scene, x, y, value, size, color, originX, weight) {
    return scene.add.text(x, y, value, {
      fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: Math.max(14, size) + 'px',
      color: color || '#e9fbff', fontStyle: weight || 'normal', resolution: 2,
      lineSpacing: 2,
    }).setOrigin(originX == null ? 0.5 : originX, 0.5);
  }
  function addPanel(scene, x, y, w, h, fill, stroke, radius) {
    var r = scene.add.rectangle(x, y, w, h, fill == null ? PALETTE.panel : fill, 1);
    r.setStrokeStyle(1.5, stroke == null ? PALETTE.line : stroke, 0.95);
    r.setOrigin(0.5);
    return r;
  }

  function bakeTextures(scene) {
    makeTexture(scene, 'td-background', W, H, function (g) {
      g.fillStyle(PALETTE.ink, 1); g.fillRect(0, 0, W, H);
      for (var i = 0; i < H; i += 12) {
        var t = i / H;
        g.fillStyle(Phaser.Display.Color.GetColor(7 + Math.round(9 * t), 17 + Math.round(15 * t), 29 + Math.round(21 * t)), 1);
        g.fillRect(0, i, W, 12);
      }
      g.lineStyle(1, PALETTE.teal, 0.08);
      for (var x = -H; x < W + H; x += 34) { g.lineBetween(x, 0, x - H, H); }
      g.fillStyle(PALETTE.teal, 0.05); g.fillCircle(42, 168, 90);
      g.fillStyle(PALETTE.violet, 0.04); g.fillCircle(350, 640, 120);
    });
    Object.keys(ARENAS).forEach(function (key) {
      var arena = getArena(key);
      makeTexture(scene, 'td-board-' + key, 358, 552, function (g) {
        g.fillStyle(0x07131f, 1); g.fillRoundedRect(0, 0, 358, 552, 22);
        g.lineStyle(2, arena.accent, 0.58); g.strokeRoundedRect(1, 1, 356, 550, 22);
        g.fillStyle(arena.ground, 0.9); g.fillRoundedRect(10, 10, 338, 532, 16);
        var laneWidth = 338 / arena.lanes;
        for (var lane = 0; lane < arena.lanes; lane += 1) {
          var laneFill = lane % 2 ? 0x0d1b2b : 0x102438;
          g.fillStyle(laneFill, 0.64); g.fillRect(11 + lane * laneWidth, 12, laneWidth - 2, 528);
          g.lineStyle(1, arena.accent, 0.24); g.strokeRect(11 + lane * laneWidth, 12, laneWidth - 2, 528);
          for (var row = 0; row < 10; row += 1) {
            g.lineStyle(1, PALETTE.white, 0.045);
            g.lineBetween(12 + lane * laneWidth, 30 + row * 49, 10 + (lane + 1) * laneWidth, 30 + row * 49);
          }
        }
        g.fillStyle(arena.river, 0.62); g.fillRect(10, 264, 338, 26);
        g.lineStyle(2, arena.accent, 0.55); g.lineBetween(10, 264, 348, 264); g.lineBetween(10, 290, 348, 290);
        g.fillStyle(0x07111d, 0.58); g.fillRoundedRect(16, 20, 326, 24, 8); g.fillRoundedRect(16, 508, 326, 24, 8);
        g.lineStyle(3, arena.accent, 0.58); g.lineBetween(22, 32, 336, 32); g.lineBetween(22, 520, 336, 520);
        for (var rail = 0; rail < arena.lanes; rail += 1) { var railX = 16 + (rail + 0.5) * laneWidth; g.lineStyle(2, PALETTE.white, 0.16); g.lineBetween(railX, 46, railX, 250); g.lineBetween(railX, 304, railX, 506); g.fillStyle(arena.accent, 0.22); g.fillCircle(railX, 74, 12); g.fillCircle(railX, 474, 12); }
        g.fillStyle(PALETTE.bone, 0.25);
        if (arena.motif === 'meadow') { g.fillCircle(42, 70, 13); g.fillCircle(316, 470, 16); g.fillCircle(308, 78, 9); }
        if (arena.motif === 'brass') { g.fillRect(32, 50, 26, 26); g.fillRect(298, 465, 30, 18); g.lineStyle(3, PALETTE.amber, 0.4); g.lineBetween(70, 72, 122, 120); g.lineBetween(290, 470, 242, 420); }
        if (arena.motif === 'sky') { g.fillStyle(PALETTE.violet, 0.28); g.fillCircle(44, 462, 20); g.fillCircle(314, 72, 18); g.lineStyle(2, PALETTE.white, 0.15); g.lineBetween(26, 108, 92, 168); g.lineBetween(330, 420, 266, 480); }
        if (arena.motif === 'moss') { g.fillStyle(PALETTE.moss, 0.36); g.fillCircle(34, 92, 21); g.fillCircle(324, 458, 24); g.fillCircle(318, 104, 12); }
        if (arena.motif === 'night') { g.fillStyle(PALETTE.violet, 0.32); g.fillCircle(36, 82, 8); g.fillCircle(322, 470, 10); g.lineStyle(2, PALETTE.violet, 0.28); g.lineBetween(24, 114, 110, 190); g.lineBetween(334, 420, 250, 498); }
        if (arena.motif === 'crown') {
          g.fillStyle(PALETTE.gold || PALETTE.amber, 0.34); g.fillTriangle(28, 56, 44, 28, 60, 56); g.fillTriangle(298, 496, 314, 468, 330, 496);
          g.lineStyle(2, arena.accent, 0.45); g.lineBetween(122, 12, 122, 542); g.lineBetween(238, 12, 238, 542);
        }
      });
    });
    makeTexture(scene, 'td-core', 76, 76, function (g) {
      g.fillStyle(0x07111d, 1); g.fillCircle(38, 38, 32); g.lineStyle(4, PALETTE.white, 0.9); g.strokeCircle(38, 38, 28);
      g.fillStyle(PALETTE.white, 0.92); g.fillTriangle(38, 12, 58, 30, 51, 58); g.fillTriangle(38, 12, 18, 30, 25, 58);
      g.fillStyle(0x07111d, 1); g.fillCircle(38, 37, 8); g.fillRect(35, 42, 6, 13);
    });
    makeTexture(scene, 'td-core-ring', 100, 100, function (g) { g.lineStyle(3, PALETTE.coral, 0.95); g.strokeCircle(50, 50, 43); g.lineStyle(1, PALETTE.amber, 0.45); g.strokeCircle(50, 50, 48); });
    makeTexture(scene, 'td-spark', 16, 16, function (g) { g.fillStyle(PALETTE.white, 1); g.fillTriangle(8, 0, 16, 8, 8, 16); g.fillTriangle(0, 8, 8, 0, 8, 16); });
    makeTexture(scene, 'td-bolt', 18, 18, function (g) { g.fillStyle(PALETTE.white, 1); g.fillTriangle(10, 0, 3, 10, 8, 10); g.fillTriangle(8, 8, 15, 8, 6, 18); });
    makeTexture(scene, 'td-reticle', 220, 220, function (g) { g.lineStyle(3, PALETTE.white, 0.84); g.strokeCircle(110, 110, 95); g.lineStyle(1, PALETTE.white, 0.62); g.strokeCircle(110, 110, 60); g.lineBetween(110, 8, 110, 34); g.lineBetween(110, 186, 110, 212); g.lineBetween(8, 110, 34, 110); g.lineBetween(186, 110, 212, 110); });
    makeTexture(scene, 'td-range', 220, 220, function (g) { g.lineStyle(2, PALETTE.teal, 0.65); g.strokeCircle(110, 110, 96); g.lineStyle(1, PALETTE.white, 0.18); g.strokeCircle(110, 110, 80); });
    makeTexture(scene, 'td-socket', 64, 64, function (g) { g.fillStyle(0x07111d, 0.72); g.fillCircle(32, 32, 25); g.lineStyle(2, PALETTE.amber, 0.8); g.strokeCircle(32, 32, 22); g.lineStyle(1, PALETTE.white, 0.35); g.lineBetween(32, 8, 32, 18); g.lineBetween(32, 46, 32, 56); g.lineBetween(8, 32, 18, 32); g.lineBetween(46, 32, 56, 32); });
    makeTexture(scene, 'td-crest', 64, 64, function (g) { g.fillStyle(0x07111d, 1); g.lineStyle(3, PALETTE.teal, 1); g.strokeCircle(32, 32, 27); g.fillTriangle(32, 10, 52, 24, 45, 51); g.fillTriangle(32, 10, 12, 24, 19, 51); g.fillStyle(PALETTE.white, 0.9); g.fillCircle(32, 30, 7); g.fillRect(29, 35, 6, 12); });
    makeTexture(scene, 'td-tower', 64, 64, function (g) { g.fillStyle(0x07111d, 1); g.lineStyle(3, PALETTE.white, 1); g.fillRoundedRect(10, 20, 44, 35, 6); g.strokeRoundedRect(10, 20, 44, 35, 6); g.fillStyle(PALETTE.white, 1); g.fillTriangle(8, 20, 18, 6, 28, 20); g.fillTriangle(24, 20, 34, 6, 44, 20); g.fillTriangle(40, 20, 50, 6, 58, 20); g.fillStyle(0x07111d, 1); g.fillRect(28, 29, 8, 18); g.fillCircle(32, 27, 4); });
    var roles = ['swarm', 'tank', 'ranged', 'splash', 'rush', 'building', 'spell'];
    roles.forEach(function (role) {
      makeTexture(scene, 'td-unit-' + role, 52, 52, function (g) {
        g.fillStyle(0xdffcff, 1); g.lineStyle(3, 0x07111d, 1);
        if (role === 'tank') { g.fillTriangle(26, 4, 47, 42, 5, 42); g.strokeTriangle(26, 4, 47, 42, 5, 42); }
        else if (role === 'rush') { g.fillTriangle(48, 26, 11, 5, 11, 47); g.strokeTriangle(48, 26, 11, 5, 11, 47); }
        else if (role === 'building') { g.fillRect(7, 8, 38, 36); g.strokeRect(7, 8, 38, 36); g.fillStyle(0x07111d, 1); g.fillRect(21, 13, 10, 26); }
        else if (role === 'ranged') { g.fillCircle(26, 26, 18); g.strokeCircle(26, 26, 18); g.fillStyle(0x07111d, 1); g.fillRect(24, 6, 4, 40); }
        else if (role === 'splash') { g.fillCircle(26, 26, 18); g.strokeCircle(26, 26, 18); g.fillStyle(0x07111d, 1); g.fillCircle(26, 26, 6); g.fillTriangle(26, 2, 30, 16, 22, 16); }
        else { g.fillCircle(26, 26, role === 'swarm' ? 15 : 18); g.strokeCircle(26, 26, role === 'swarm' ? 15 : 18); }
      });
    });
  }

  function modeLabel(mode) { return MODE_NAMES[mode] || 'TOWERLINE DUEL'; }
  function rungSpec(rung) { return RUNG_TABLE[clamp(rung, 1, 8) - 1] || RUNG_TABLE[0]; }
  function draftSpec(index) { return DRAFT_TABLE[clamp(index, 0, DRAFT_TABLE.length - 1)] || DRAFT_TABLE[0]; }
  function gauntletSpec(index) { return GAUNTLET_TABLE[clamp(index, 0, GAUNTLET_TABLE.length - 1)] || GAUNTLET_TABLE[0]; }

  class BaseScene extends Phaser.Scene {
    constructor(key) { super({ key: key }); }
    createBase() {
      this.add.image(W / 2, H / 2, 'td-background').setDepth(-100);
      this.__tdKeys = {};
    }
    button(x, y, w, h, label, sub, accent, onTap) {
      var bg = addPanel(this, x, y, w, h, PALETTE.panel, accent || PALETTE.line, 14);
      var icon = this.add.circle(x - w / 2 + 22, y, 7, accent || PALETTE.teal, 0.95);
      var title = addLabel(this, x - w / 2 + 42, y - (sub ? 10 : 0), label, 17, '#e9fbff', 0, 'bold');
      if (sub) addLabel(this, x - w / 2 + 42, y + 14, sub, 14, '#91aeba', 0, 'normal');
      var zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', function (pointer) {
        if (kit.paused) return;
        seedKitPointer(pointer);
        if (onTap) onTap();
        playSfx('select', 90);
      });
      return { bg: bg, icon: icon, title: title, zone: zone };
    }
    topBar(title, right) {
      addLabel(this, 18, 26, title, 22, '#e9fbff', 0, 'bold');
      if (right) addLabel(this, W - 18, 26, right, 14, '#91aeba', 1, 'bold');
      var line = this.add.rectangle(W / 2, 54, W - 32, 1, PALETTE.line, 0.8);
      line.setOrigin(0.5);
    }
    backButton(onTap) { return this.button(56, 78, 88, 46, 'BACK', '', PALETTE.muted, onTap); }
    setStateMenu(mode) {
      tdState.mode = mode || 'menu'; tdState.inMatch = false; tdState.status = 'menu';
      tdState.rung = progress.rung; tdState.deck = progress.deck.slice(); tdState.hand = progress.deck.slice(0, 4);
      tdState.elixir = 0; tdState.coreHP = { player: 1000, enemy: 1000 };
      tdState.forceMode = bootFallback.forceMode; tdState.forceRung = bootFallback.forceRung;
    }
  }

  class BootScene extends BaseScene {
    constructor() { super('boot'); }
    create() {
      kit.loader.show('Towerline Duel');
      kit.loader.progress(0.25);
      bakeTextures(this);
      kit.loader.progress(0.62);
      kit.audio.preload().then(function () {
        kit.loader.progress(1);
        kit.loader.hide();
        var forced = modeSafe(tdState.forceMode || bootFallback.forceMode);
        if (forced) this.scene.start('duel', { mode: forced, rung: intSafe(tdState.forceRung || bootFallback.forceRung, 1, 1, 8), forced: true });
        else this.scene.start('menu');
      }.bind(this));
    }
  }

  class MenuScene extends BaseScene {
    constructor() { super('menu'); }
    create() {
      this.createBase(); this.setStateMenu('menu');
      addLabel(this, W / 2, 49, 'TOWERLINE', 31, '#e9fbff', 0.5, 'bold');
      addLabel(this, W / 2, 84, 'DUEL', 44, '#43c7f4', 0.5, 'bold');
      addLabel(this, W / 2, 116, 'CARD COMMAND / LANE CONTROL', 14, '#91aeba', 0.5, 'bold');
      var trophy = addPanel(this, 195, 166, 358, 58, 0x0e2232, PALETTE.amber, 16);
      addLabel(this, 32, 154, 'TROPHY ROAD', 14, '#e0a34a', 0, 'bold');
      addLabel(this, 32, 178, 'RUNG ' + progress.rung + ' / 8', 19, '#e9fbff', 0, 'bold');
      addLabel(this, 358, 166, String(unlockedCount()).padStart(2, '0') + ' CARDS', 14, '#91aeba', 1, 'bold');
      addLabel(this, 358, 184, progress.streak + ' WIN STREAK', 14, '#43c7f4', 1, 'bold');
      this.button(W / 2, 270, 358, 82, 'LADDER', 'Trophy road / three card unlocks', PALETTE.teal, function () { this.scene.start('ladder'); }.bind(this));
      this.button(W / 2, 372, 358, 82, 'DRAFT DUEL', 'Hand-authored decks / constructed arenas', PALETTE.violet, function () { this.scene.start('mode', { mode: 'draft' }); }.bind(this));
      this.button(W / 2, 474, 358, 82, 'GAUNTLET', 'Escalating decks / chase your streak', PALETTE.coral, function () { this.scene.start('mode', { mode: 'gauntlet' }); }.bind(this));
      this.button(128, 614, 218, 64, 'DECK FORGE', 'Build eight cards', PALETTE.violet, function () { this.scene.start('forge'); }.bind(this));
      this.button(300, 614, 114, 64, 'SETTINGS', 'Audio / motion', PALETTE.line, function () { kit.openSettings(); });
      addLabel(this, W / 2, 730, 'GENEROUS ELIXIR / NO SHOP / PLAY TO UNLOCK', 14, '#718b97', 0.5, 'bold');
      addLabel(this, W / 2, 760, 'Drag a card or tap a card, then tap a lane', 14, '#d8c38c', 0.5, 'normal');
      if (bootFallback.forceMode) this.scene.start('duel', { mode: bootFallback.forceMode, rung: bootFallback.forceRung, forced: true });
    }
    update() {
      if (edgeKey(this, 'Enter') || edgeKey(this, 'Space')) this.scene.start('ladder');
      if (bootFallback.forceMode && !this.__forcedLive) { this.__forcedLive = true; this.scene.start('duel', { mode: bootFallback.forceMode, rung: bootFallback.forceRung, forced: true }); }
    }
  }

  class LadderScene extends BaseScene {
    constructor() { super('ladder'); }
    create() {
      this.createBase(); this.setStateMenu('ladder'); this.topBar('LADDER ROAD', progress.rung + ' / 8'); this.backButton(function () { this.scene.start('menu'); }.bind(this));
      addLabel(this, 18, 118, 'WIN A RUNG TO OPEN ITS CARD TRIO', 14, '#91aeba', 0, 'bold');
      for (var i = 0; i < RUNG_TABLE.length; i += 1) {
        var rung = RUNG_TABLE[i]; var unlocked = i < progress.rung; var current = i + 1 === progress.rung;
        var y = 158 + i * 61; var accent = unlocked ? rungSpec(i + 1).arena === 'crown' ? PALETTE.amber : PALETTE.teal : 0x30434e;
        var row = addPanel(this, 195, y, 358, 50, current ? 0x17384a : 0x0d1d2b, accent, 12);
        addLabel(this, 30, y, String(i + 1).padStart(2, '0'), 16, unlocked ? '#43c7f4' : '#5c707b', 0, 'bold');
        addLabel(this, 74, y - 8, rung.name, 16, unlocked ? '#e9fbff' : '#71818a', 0, 'bold');
        addLabel(this, 74, y + 12, getArena(rung.arena).name, 14, unlocked ? '#91aeba' : '#5c707b', 0, 'normal');
        var medals = progress.medals[String(i + 1)];
        addLabel(this, 358, y - 8, medals ? (medals.rung || 'bronze').toUpperCase() : (unlocked ? 'READY' : 'LOCKED'), 14, accent === 0x30434e ? '#5c707b' : '#e0a34a', 1, 'bold');
        addLabel(this, 358, y + 12, rung.unlock.map(function (id) { return getCard(id).short; }).join(' / '), 14, unlocked ? '#cceff5' : '#5c707b', 1, 'normal');
        var zone = this.add.zone(195, y, 358, 50).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', function (index) {
          return function (pointer) {
            if (kit.paused) return; seedKitPointer(pointer);
            if (index < progress.rung) { playSfx('select', 60); this.scene.start('duel', { mode: 'ladder', rung: index + 1 }); }
          }.bind(this);
        }.call(this, i));
      }
      this.button(195, 716, 358, 58, 'PLAY RUNG ' + progress.rung, 'Arena: ' + getArena(rungSpec(progress.rung).arena).name, PALETTE.teal, function () { this.scene.start('duel', { mode: 'ladder', rung: progress.rung }); }.bind(this));
      this.button(195, 792, 358, 48, 'DECK FORGE', '', PALETTE.violet, function () { this.scene.start('forge'); }.bind(this));
    }
    update() { if (edgeKey(this, 'Escape')) this.scene.start('menu'); }
  }

  class ForgeScene extends BaseScene {
    constructor() { super('forge'); }
    create() {
      this.createBase(); this.setStateMenu('forge'); this.topBar('DECK FORGE', unlockedCount() + ' / 24'); this.backButton(function () { this.scene.start('menu'); }.bind(this));
      addLabel(this, 132, 75, 'EIGHT-SLOT DECK', 14, '#e9fbff', 0, 'bold');
      addLabel(this, 132, 97, 'Tap a slot, then a ready card', 14, '#91aeba', 0, 'normal');
      var forgeScene = this;
      this.selectedSlot = 0; this.slotZones = []; this.slotPanels = [];
      for (var slot = 0; slot < 8; slot += 1) {
        var sx = 53 + (slot % 4) * 95; var sy = 142 + Math.floor(slot / 4) * 64;
        this.slotPanels.push(this.drawForgeCard(sx, sy, 88, 54, progress.deck[slot], true, slot === 0));
        var sz = this.add.zone(sx, sy, 88, 54).setInteractive({ useHandCursor: true });
        sz.on('pointerdown', function (index) { return function (pointer) { if (kit.paused) return; seedKitPointer(pointer); forgeScene.selectedSlot = index; forgeScene.refreshForge(); playSfx('select', 50); }; }(slot));
        this.slotZones.push(sz);
      }
      addLabel(this, 18, 229, 'CARD LIBRARY', 14, '#91aeba', 0, 'bold');
      addLabel(this, 358, 229, 'READY CARDS GLOW', 14, '#718b97', 1, 'normal');
      this.libraryZones = [];
      for (var cardIndex = 0; cardIndex < CARDS.length; cardIndex += 1) {
        var cx = 53 + (cardIndex % 4) * 95; var cy = 278 + Math.floor(cardIndex / 4) * 76;
        this.drawForgeCard(cx, cy, 88, 64, cardIndex, false, false);
        var cz = this.add.zone(cx, cy, 88, 64).setInteractive({ useHandCursor: true });
        cz.on('pointerdown', function (index) { return function (pointer) { if (kit.paused) return; seedKitPointer(pointer); if (index < unlockedCount()) { progress.deck[forgeScene.selectedSlot] = index; forgeScene.selectedSlot = (forgeScene.selectedSlot + 1) % 8; saveProgress(); playSfx('select', 50); forgeScene.scene.restart(); } }; }(cardIndex));
        this.libraryZones.push(cz);
      }
      addLabel(this, W / 2, 820, 'Roles counter one another. Repeats are legal.', 14, '#91aeba', 0.5, 'normal');
      this.slotLabel = addLabel(this, 358, 97, 'SLOT 1', 14, '#43c7f4', 1, 'bold');
      this.refreshForge();
    }
    drawForgeCard(x, y, w, h, id, slot) {
      var c = getCard(id); var ready = slot || id < unlockedCount();
      var fill = ready ? 0x10283a : 0x0a121b; var stroke = ready ? c.color : 0x30404a;
      var r = addPanel(this, x, y, w, h, fill, stroke, 10); r.setData('slot', slot);
      var icon = this.add.image(x - w / 2 + 17, y, 'td-unit-' + (c.role || 'swarm')).setDisplaySize(25, 25).setTint(ready ? c.color : 0x56636a);
      var name = addLabel(this, x - w / 2 + 33, y - 11, c.short, 14, ready ? '#e9fbff' : '#5c707b', 0, 'bold');
      var cost = addLabel(this, x - w / 2 + 33, y + 13, '⚡ ' + c.cost, 14, ready ? '#' + c.color.toString(16).padStart(6, '0') : '#5c707b', 0, 'bold');
      var lock = !ready ? addLabel(this, x + w / 2 - 7, y + 13, 'R' + (Math.floor(id / 3) + 1), 14, '#5c707b', 1, 'bold') : null;
      return { panel: r, icon: icon, name: name, cost: cost, lock: lock, cardId: id };
    }
    refreshForge() {
      if (this.slotLabel) setTextIfChanged(this.slotLabel, 'SLOT ' + (this.selectedSlot + 1));
      if (this.slotPanels) this.slotPanels.forEach(function (view, index) { if (view && view.panel) view.panel.setStrokeStyle(index === this.selectedSlot ? 2.5 : 1.5, index === this.selectedSlot ? PALETTE.white : getCard(progress.deck[index]).color, 1); }, this);
    }
    update() { if (edgeKey(this, 'Escape')) this.scene.start('menu'); }
  }

  class ModeScene extends BaseScene {
    constructor() { super('mode'); }
    init(data) { this.mode = modeSafe(data && data.mode) || 'draft'; }
    create() {
      this.createBase(); this.setStateMenu(this.mode); this.topBar(modeLabel(this.mode), this.mode === 'gauntlet' ? progress.gauntletBest + ' BEST' : progress.draftWins + ' WINS'); this.backButton(function () { this.scene.start('menu'); }.bind(this));
      if (this.mode === 'draft') this.createDraft(); else this.createGauntlet();
    }
    createDraft() {
      addLabel(this, 18, 122, 'CHOOSE A CONSTRUCTED ARENA', 14, '#91aeba', 0, 'bold');
      DRAFT_TABLE.forEach(function (draft, index) {
        var y = 188 + index * 142; var arena = getArena(draft.arena);
        addPanel(this, 195, y, 358, 116, 0x10283a, arena.accent, 15);
        addLabel(this, 30, y - 32, draft.name, 18, '#e9fbff', 0, 'bold');
        addLabel(this, 30, y - 6, arena.name + ' / ' + arena.lanes + ' lanes', 14, '#e0a34a', 0, 'bold');
        addLabel(this, 30, y + 19, draft.note, 14, '#91aeba', 0, 'normal');
        addLabel(this, 358, y + 30, 'PLAY', 16, '#43c7f4', 1, 'bold');
        var zone = this.add.zone(195, y, 358, 116).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', function (pointer) { if (kit.paused) return; seedKitPointer(pointer); this.scene.start('duel', { mode: 'draft', draftIndex: index }); }.bind(this));
      }.bind(this));
    }
    createGauntlet() {
      addLabel(this, 18, 122, 'ONE RUN / SIX ESCALATING FACES', 14, '#91aeba', 0, 'bold');
      GAUNTLET_TABLE.forEach(function (match, index) {
        var y = 164 + index * 78; var arena = getArena(match.arena); var open = index <= progress.gauntletBest;
        addPanel(this, 195, y, 358, 62, open ? 0x10283a : 0x0b1621, open ? arena.accent : 0x30404a, 12);
        addLabel(this, 30, y - 10, String(index + 1).padStart(2, '0'), 16, open ? '#43c7f4' : '#5c707b', 0, 'bold');
        addLabel(this, 72, y - 10, match.name, 17, open ? '#e9fbff' : '#71818a', 0, 'bold');
        addLabel(this, 72, y + 15, arena.signature, 14, open ? '#91aeba' : '#5c707b', 0, 'normal');
        addLabel(this, 358, y + 4, open ? 'ENTER' : 'LOCKED', 14, open ? '#e0a34a' : '#5c707b', 1, 'bold');
        var zone = this.add.zone(195, y, 358, 62).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', function (pointer) { if (kit.paused) return; seedKitPointer(pointer); if (open) this.scene.start('duel', { mode: 'gauntlet', gauntletIndex: index }); }.bind(this));
      }.bind(this));
      addLabel(this, W / 2, 700, 'BEST RUN ' + progress.gauntletBest + ' / 6', 18, '#e0a34a', 0.5, 'bold');
      this.button(195, 770, 358, 54, 'DECK FORGE', 'Tune the answer before the next face', PALETTE.violet, function () { this.scene.start('forge'); }.bind(this));
    }
    update() { if (edgeKey(this, 'Escape')) this.scene.start('menu'); }
  }

  class DuelScene extends BaseScene {
    constructor() { super('duel'); }
    init(data) {
      data = data || {};
      this.mode = modeSafe(data.mode) || modeSafe(bootFallback.forceMode) || 'ladder';
      this.rung = intSafe(data.rung || bootFallback.forceRung || progress.rung, progress.rung, 1, 8);
      this.draftIndex = intSafe(data.draftIndex, 0, 0, DRAFT_TABLE.length - 1);
      this.gauntletIndex = intSafe(data.gauntletIndex, 0, 0, GAUNTLET_TABLE.length - 1);
      this.forced = !!data.forced;
      this.match = null; this.arena = getArena('openField'); this.status = 'playing'; this.lifecyclePaused = false;
      this.accumulator = 0; this.simClock = 0; this.timeLeft = 150; this.overtime = false; this.nextId = 1;
      this.playerElixir = 5.5; this.enemyElixir = 5.5; this.selectedHand = 0; this.selectionLane = 0;
      this.hand = []; this.enemyHand = []; this.commandQueue = []; this.drag = null; this.pointerRecords = {};
      this.units = []; this.projectiles = []; this.result = null; this.banner = null; this.transient = null;
      this.playerCore = 1000; this.enemyCore = 1000; this.aiTimer = 0.8; this.botTelegraph = null; this.drawIndex = 4; this.enemyDrawIndex = 4;
      this.waveIndex = 0; this.nextWaveAt = 3.4; this.waveTelegraph = null; this.wavesCleared = 0;
      this.cardCooldowns = [0, 0, 0, 0]; this.pendingPlacement = null; this.towerSlots = []; this.synergyLinks = [];
      this.tutorialStep = 0; this.resultFocus = 0; this.lastGamepad = {};
    }
    create() {
      activeDuel = this; this.events.once('shutdown', this.shutdown, this); kit.audio.music('music', 700); this.createBase(); this.createViews(); this.resetMatch();
      this.input.on('pointerdown', this.onPointerDown, this); this.input.on('pointermove', this.onPointerMove, this);
      this.input.on('pointerup', this.onPointerUp, this); this.input.on('pointerupoutside', this.onPointerCancel, this); this.input.on('pointercancel', this.onPointerCancel, this);
      this.add.zone(W / 2, H / 2, W, H).setInteractive().setDepth(-90);
    }
    resolveMatch() {
      if (this.mode === 'draft') { this.match = draftSpec(this.draftIndex); }
      else if (this.mode === 'gauntlet') { this.match = gauntletSpec(this.gauntletIndex); }
      else { this.match = rungSpec(this.rung); }
      this.arena = getArena(this.match.arena);
    }
    resetMatch() {
      this.resolveMatch();
      this.status = 'playing'; this.accumulator = 0; this.simClock = 0; this.timeLeft = 150; this.overtime = false;
      this.nextId = 1; this.playerElixir = 5.5; this.enemyElixir = 5.5; this.selectedHand = 0; this.selectionLane = 0;
      var openingEnemyDeck = this.match.deck || this.match.enemy || RUNG_TABLE[0].deck; this.hand = progress.deck.slice(0, 4); this.enemyHand = openingEnemyDeck.slice(0, 4);
      this.drawIndex = 4; this.enemyDrawIndex = 4; this.playerCore = 1000; this.enemyCore = 1000; this.aiTimer = 0.8; this.botTelegraph = null; this.dangerMusic = false;
      this.waveIndex = 0; this.nextWaveAt = 3.4; this.waveTelegraph = null; this.wavesCleared = 0; this.cardCooldowns = [0, 0, 0, 0]; this.pendingPlacement = null; this.tutorialStep = 0; this.resultFocus = 0;
      this.units.length = 0; this.projectiles.length = 0; this.commandQueue.length = 0; this.drag = null; this.pointerRecords = {}; this.result = null; this.transient = { kind: 'tutorial', text: 'Pick a card, then choose a lit socket or lane', time: 4.5, max: 4.5 };
      this.banner = { title: 'READY', sub: this.arena.name, time: 1.05, max: 1.05, result: false };
      this.towerSlots = [];
      this.refreshSockets();
      for (var i = 0; i < this.unitPool.length; i += 1) this.unitPool[i].alive = false;
      for (var p = 0; p < this.projectilePool.length; p += 1) { this.projectilePool[p].active = false; this.projectileViews[p].sprite.setVisible(false); }
      this.particleSystemList.forEach(function (system) { system.pool.forEach(function (particle) { particle.life = 0; }); });
      this.resultPanel.setVisible(false).setScale(0.82); this.resultTitle.setVisible(false); this.resultSub.setVisible(false); this.resultDetail.setVisible(false); this.medalText.setVisible(false); this.resultHint.setVisible(false); this.resultButtonA.setVisible(false); this.resultButtonB.setVisible(false); this.resultButtonAText.setVisible(false); this.resultButtonBText.setVisible(false); this.resultZoneA.setVisible(false); this.resultZoneB.setVisible(false);
      tdState.mode = this.mode; tdState.rung = this.rung; tdState.arena = this.arena.key; tdState.inMatch = true; tdState.status = 'playing'; tdState.medal = null;
      this.updateState(); this.refreshBoardTexture(); this.refreshHand(); this.updateHud();
    }
    restartMatch() { if (this.status !== 'playing') this.resetMatch(); else this.resetMatch(); }
    setLifecyclePaused(value) { this.lifecyclePaused = !!value; this.drag = null; this.pointerRecords = {}; }
    shutdown() { if (activeDuel === this) activeDuel = null; this.drag = null; this.pointerRecords = {}; kit.audio.stopMusic(320); }
    createViews() {
      this.boardImage = this.add.image(16 + 179, 124 + 276, 'td-board-openField').setDepth(-50);
      this.boardImage.setOrigin(0.5);
      this.laneGhosts = [];
      this.rangeGhost = this.add.image(0, 0, 'td-range').setVisible(false).setDepth(2).setAlpha(0.34);
      this.reticle = this.add.image(0, 0, 'td-reticle').setVisible(false).setDepth(8).setAlpha(0.78);
      this.commandCrest = this.add.image(326, 670, 'td-crest').setDisplaySize(42, 42).setTint(TEAM.player).setDepth(18);
      this.commandCrestLabel = addLabel(this, 326, 705, 'COMMAND', 11, '#43c7f4', 0.5, 'bold').setDepth(18);
      this.socketViews = [];
      for (var socketIndex = 0; socketIndex < 18; socketIndex += 1) this.socketViews.push({ ring: this.add.image(0, 0, 'td-socket').setDisplaySize(42, 42).setVisible(false).setDepth(4), label: addLabel(this, 0, 0, '', 10, '#91aeba', 0.5, 'bold').setVisible(false).setDepth(5) });
      this.synergyGraphics = this.add.graphics().setDepth(6);
      this.waveLabel = addLabel(this, W / 2, 148, '', 14, '#e0a34a', 0.5, 'bold').setDepth(52).setVisible(false);
      this.waveRings = [];
      for (var waveRingIndex = 0; waveRingIndex < 3; waveRingIndex += 1) this.waveRings.push(this.add.image(0, 0, 'td-reticle').setDisplaySize(58, 58).setTint(PALETTE.coral).setAlpha(0.65).setVisible(false).setDepth(7));
      this.bannerBg = addPanel(this, W / 2, 205, 270, 62, 0x0b1a29, PALETTE.amber, 14).setDepth(52).setVisible(false);
      this.bannerTitle = addLabel(this, W / 2, 194, '', 18, '#e9fbff', 0.5, 'bold').setDepth(53).setVisible(false);
      this.bannerSub = addLabel(this, W / 2, 218, '', 12, '#e0a34a', 0.5, 'normal').setDepth(53).setVisible(false);
      this.laneMarker = this.add.rectangle(0, 0, 3, 218, PALETTE.teal, 0.82).setDepth(6).setVisible(false);
      this.laneMarkerTop = this.add.triangle(0, 0, 0, 12, 12, 0, 24, 12, PALETTE.teal, 0.9).setDepth(6).setVisible(false);
      this.cooldownText = addLabel(this, W - 18, 756, '', 11, '#91aeba', 1, 'bold').setDepth(42);
      this.queueText = addLabel(this, 18, 756, '', 11, '#d8c38c', 0, 'bold').setDepth(42);
      this.undoButton = addPanel(this, 328, 738, 82, 22, PALETTE.panel2, PALETTE.amber, 8).setDepth(42).setVisible(false);
      this.undoText = addLabel(this, 328, 738, 'UNDO', 11, '#e0a34a', 0.5, 'bold').setDepth(43).setVisible(false);
      this.undoZone = this.add.zone(328, 738, 82, 24).setInteractive({ useHandCursor: true }).setDepth(44).setVisible(false);
      this.undoZone.on('pointerdown', function () { if (!kit.paused) this.undoPlacement(); }.bind(this));
      this.dragGhost = this.add.container(0, 0).setVisible(false).setDepth(70);
      this.dragGhostBg = this.add.rectangle(0, 0, 94, 58, PALETTE.panel2, 1).setStrokeStyle(2, PALETTE.teal, 1);
      this.dragGhostIcon = this.add.image(-28, 0, 'td-unit-swarm').setDisplaySize(31, 31);
      this.dragGhostText = addLabel(this, 10, 0, '', 14, '#e9fbff', 0.5, 'bold');
      this.dragGhost.add([this.dragGhostBg, this.dragGhostIcon, this.dragGhostText]);
      this.toastBg = this.add.rectangle(W / 2, 113, 356, 30, PALETTE.ink2, 0.88).setStrokeStyle(1, PALETTE.line, 0.8).setDepth(50);
      this.toastText = addLabel(this, W / 2, 113, '', 14, '#e9fbff', 0.5, 'bold').setDepth(51);
      this.toastBg.setVisible(false); this.toastText.setVisible(false);
      this.headerMode = addLabel(this, 18, 25, '', 18, '#e9fbff', 0, 'bold');
      this.headerRung = addLabel(this, 18, 50, '', 14, '#91aeba', 0, 'bold');
      this.headerTimer = addLabel(this, W - 18, 28, '', 22, '#e9fbff', 1, 'bold');
      this.headerArena = addLabel(this, W - 18, 52, '', 14, '#e0a34a', 1, 'bold');
      this.enemyBarBg = this.add.rectangle(80, 84, 192, 8, 0x203746, 1).setOrigin(0, 0.5);
      this.enemyBar = this.add.rectangle(80, 84, 192, 8, PALETTE.coral, 1).setOrigin(0, 0.5);
      this.playerBarBg = this.add.rectangle(80, 695, 192, 8, 0x203746, 1).setOrigin(0, 0.5);
      this.playerBar = this.add.rectangle(80, 695, 192, 8, PALETTE.teal, 1).setOrigin(0, 0.5);
      this.enemyCoreText = addLabel(this, 28, 84, 'ENEMY', 14, '#ff665c', 0, 'bold');
      this.playerCoreText = addLabel(this, 28, 695, 'YOU', 14, '#43c7f4', 0, 'bold');
      this.enemyHpText = addLabel(this, 362, 84, '', 14, '#e9fbff', 1, 'bold');
      this.playerHpText = addLabel(this, 362, 695, '', 14, '#e9fbff', 1, 'bold');
      this.enemyCoreImage = this.add.image(W / 2, 102, 'td-core').setDisplaySize(54, 54).setTint(TEAM.enemy).setDepth(18);
      this.playerCoreImage = this.add.image(W / 2, 677, 'td-core').setDisplaySize(54, 54).setTint(TEAM.player).setDepth(18).setFlipY(true);
      this.enemyWarn = this.add.image(W / 2, 102, 'td-core-ring').setDisplaySize(70, 70).setTint(TEAM.enemy).setDepth(17).setVisible(false);
      this.playerWarn = this.add.image(W / 2, 677, 'td-core-ring').setDisplaySize(70, 70).setTint(TEAM.player).setDepth(17).setVisible(false);
      this.elixirBg = this.add.rectangle(18, 719, 354, 9, 0x203746, 1).setOrigin(0, 0.5);
      this.elixirBar = this.add.rectangle(18, 719, 354, 9, PALETTE.violet, 1).setOrigin(0, 0.5);
      this.elixirText = addLabel(this, 18, 738, '⚡ 5.5 / 10', 16, '#e9fbff', 0, 'bold');
      this.zoneText = addLabel(this, W - 18, 738, 'DEPLOY ZONE', 14, '#91aeba', 1, 'bold');
      this.cardViews = [];
      for (var c = 0; c < 4; c += 1) {
        var x = 51 + c * 96;
        var bg = this.add.rectangle(x, 789, 88, 86, PALETTE.panel, 1).setStrokeStyle(1.5, PALETTE.line, 1).setDepth(40);
        var accent = this.add.rectangle(x - 42, 789, 4, 82, PALETTE.teal, 1).setDepth(41);
        var icon = this.add.image(x - 22, 776, 'td-unit-swarm').setDisplaySize(28, 28).setDepth(42);
        var number = addLabel(this, x - 35, 753, String(c + 1), 14, '#91aeba', 0, 'bold').setDepth(42);
        var name = addLabel(this, x - 35, 799, '', 14, '#e9fbff', 0, 'bold').setDepth(42);
        var cost = addLabel(this, x - 35, 822, '', 14, '#e0a34a', 0, 'bold').setDepth(42);
        var role = addLabel(this, x + 38, 822, '', 14, '#91aeba', 1, 'bold').setDepth(42);
        var effect = this.add.text(x - 35, 836, '', { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: '10px', color: '#91aeba', resolution: 2 }).setOrigin(0, 0.5).setDepth(42);
        this.cardViews.push({ bg: bg, accent: accent, icon: icon, number: number, name: name, cost: cost, role: role, effect: effect });
      }
      this.unitPool = [];
      this.unitViews = [];
      for (var u = 0; u < MAX_UNITS; u += 1) {
        this.unitPool.push({ alive: false, slot: u });
        var body = this.add.image(0, 0, 'td-unit-swarm').setDisplaySize(29, 29).setVisible(false).setDepth(20);
        var notch = this.add.rectangle(0, 0, 6, 3, PALETTE.teal, 1).setVisible(false).setDepth(22);
        var hpBg = this.add.rectangle(0, 0, 30, 4, 0x07111d, 1).setVisible(false).setDepth(21);
        var hp = this.add.rectangle(0, 0, 30, 3, PALETTE.teal, 1).setOrigin(0, 0.5).setVisible(false).setDepth(22);
        var select = this.add.image(0, 0, 'td-range').setDisplaySize(48, 48).setVisible(false).setDepth(19).setAlpha(0.7);
        this.unitViews.push({ body: body, notch: notch, hpBg: hpBg, hp: hp, select: select });
      }
      this.projectilePool = []; this.projectileViews = [];
      for (var q = 0; q < MAX_PROJECTILES; q += 1) { this.projectilePool.push({ active: false, viewSlot: q }); this.projectileViews.push({ sprite: this.add.image(0, 0, 'td-bolt').setDisplaySize(12, 12).setVisible(false).setDepth(34) }); }
      this.particleSystems = {}; this.particleSystemList = [];
      ['contact', 'dust', 'trail', 'ability'].forEach(function (name) {
        var system = { name: name, pool: [], views: [] };
        for (var z = 0; z < 24; z += 1) { system.pool.push({ life: 0, max: 0, x: 0, y: 0, vx: 0, vy: 0, size: 1, viewSlot: z }); system.views.push({ sprite: this.add.image(0, 0, 'td-spark').setVisible(false).setDepth(45) }); }
        this.particleSystems[name] = system; this.particleSystemList.push(system);
      }, this);
      this.resultPanel = addPanel(this, W / 2, 423, 308, 386, 0x10283a, PALETTE.teal, 22).setDepth(80).setVisible(false).setScale(0.82);
      this.resultTitle = addLabel(this, W / 2, 285, '', 28, '#43c7f4', 0.5, 'bold').setDepth(82).setVisible(false);
      this.resultSub = addLabel(this, W / 2, 324, '', 16, '#e9fbff', 0.5, 'bold').setDepth(82).setVisible(false);
      this.resultDetail = addLabel(this, W / 2, 370, '', 14, '#91aeba', 0.5, 'normal').setDepth(82).setVisible(false);
      this.medalText = addLabel(this, W / 2, 432, '', 18, '#e0a34a', 0.5, 'bold').setDepth(82).setVisible(false);
      this.resultHint = addLabel(this, W / 2, 494, '', 14, '#e9fbff', 0.5, 'normal').setDepth(82).setVisible(false);
      this.resultButtonA = addPanel(this, 117, 568, 124, 52, PALETTE.teal, PALETTE.white, 12).setDepth(82).setVisible(false);
      this.resultButtonB = addPanel(this, 267, 568, 124, 52, PALETTE.panel2, PALETTE.violet, 12).setDepth(82).setVisible(false);
      this.resultButtonAText = addLabel(this, 117, 568, '', 14, '#07111d', 0.5, 'bold').setDepth(83).setVisible(false);
      this.resultButtonBText = addLabel(this, 267, 568, '', 14, '#e9fbff', 0.5, 'bold').setDepth(83).setVisible(false);
      this.resultZoneA = this.add.zone(117, 568, 124, 52).setInteractive({ useHandCursor: true }).setDepth(84);
      this.resultZoneB = this.add.zone(267, 568, 124, 52).setInteractive({ useHandCursor: true }).setDepth(84);
      this.resultZoneA.on('pointerdown', function () { if (this.isResult()) this.handleResultAction('a'); }.bind(this));
      this.resultZoneB.on('pointerdown', function () { if (this.isResult()) this.handleResultAction('b'); }.bind(this));
      this.resultZoneA.setVisible(false); this.resultZoneB.setVisible(false);
    }
    refreshBoardTexture() { if (this.boardImage) this.boardImage.setTexture('td-board-' + getArena(this.arena.key).key); }
    laneCenters() {
      var count = this.arena.lanes || 2; var out = [];
      for (var i = 0; i < count; i += 1) out.push(16 + 179 + (i + 0.5) * (338 / count) - 169);
      return out;
    }
    laneAt(x) {
      var centers = this.laneCenters(); var best = 0; var distance = Infinity;
      for (var i = 0; i < centers.length; i += 1) { var d = Math.abs(x - centers[i]); if (d < distance) { distance = d; best = i; } }
      return best;
    }
    isResult() { return !!(RESULT_STATUSES[this.status] && this.result); }
    socketY(team, row) { return team === 'player' ? [468, 544, 620][row] : [230, 306, 382][row]; }
    refreshSockets() {
      var centers = this.laneCenters(); var index = 0; this.towerSlots = [];
      for (var teamIndex = 0; teamIndex < 2; teamIndex += 1) {
        var team = teamIndex === 0 ? 'enemy' : 'player';
        for (var lane = 0; lane < this.arena.lanes; lane += 1) for (var row = 0; row < 3; row += 1) {
          var slot = { team: team, lane: lane, row: row, x: centers[lane], y: this.socketY(team, row), unitId: null, view: this.socketViews[index] };
          this.towerSlots.push(slot);
          if (slot.view) { slot.view.ring.setPosition(slot.x, slot.y).setVisible(true); slot.view.label.setPosition(slot.x, slot.y + 25).setText((team === 'player' ? 'P' : 'E') + (lane + 1) + '.' + (row + 1)).setVisible(true); }
          index += 1;
        }
      }
      for (; index < this.socketViews.length; index += 1) { this.socketViews[index].ring.setVisible(false); this.socketViews[index].label.setVisible(false); }
    }
    towerSlotAt(team, lane, y) {
      var best = null; var distance = Infinity;
      for (var i = 0; i < this.towerSlots.length; i += 1) {
        var slot = this.towerSlots[i]; if (slot.team !== team || slot.lane !== lane || slot.unitId != null) continue;
        var d = Math.abs(slot.y - y); if (d < distance) { distance = d; best = slot; }
      }
      return distance <= 48 ? best : null;
    }
    towerSlotForUnit(unit) { return unit && unit.towerSlot != null ? this.towerSlots[unit.towerSlot] : null; }
    renderSockets() {
      for (var i = 0; i < this.towerSlots.length; i += 1) {
        var slot = this.towerSlots[i]; var view = slot.view; if (!view) continue;
        var player = slot.team === 'player'; var occupied = slot.unitId != null; var selected = player && slot.lane === this.selectionLane && !occupied;
        view.ring.setTint(occupied ? (player ? TEAM.player : TEAM.enemy) : (selected ? PALETTE.amber : PALETTE.line)).setAlpha(occupied ? 0.82 : selected ? 0.9 : 0.45).setScale(selected ? 1.08 : 1).setVisible(true);
        view.label.setColor(occupied ? (player ? '#43c7f4' : '#ff665c') : '#718b97').setAlpha(occupied ? 1 : 0.7);
      }
    }
    renderLaneSelection() {
      var centers = this.laneCenters(); var x = centers[this.selectionLane] || centers[0];
      this.laneMarker.setPosition(x, 548).setVisible(this.status === 'playing'); this.laneMarkerTop.setPosition(x - 12, 426).setVisible(this.status === 'playing');
    }
    isBoardPoint(p) { return p.x >= 16 && p.x <= 374 && p.y >= 124 && p.y <= 676; }
    cardAt(p) { if (p.y < 745 || p.y > 838) return -1; for (var i = 0; i < 4; i += 1) if (Math.abs(p.x - (51 + i * 96)) <= 46) return i; return -1; }
    currentCard() { return getCard(this.hand[this.selectedHand]); }
    legalY(y, cardData) { return cardData.role === 'spell' ? clamp(y, 146, 654) : cardData.building ? clamp(y, 444, 632) : clamp(y, 414, 650); }
    cooldownFor(index) { return this.cardCooldowns[index] || 0; }
    setCooldown(index, card) { this.cardCooldowns[index] = Math.max(this.cardCooldowns[index] || 0, 1.1 + card.cost * 0.18); }
    canPlayCard(index, team) { var card = getCard((team === 'player' ? this.hand : this.enemyHand)[index]); return (team === 'player' ? this.playerElixir : this.enemyElixir) + 0.001 >= card.cost && (team !== 'player' || this.cooldownFor(index) <= 0); }
    setPreview(p) {
      var c = this.currentCard(); var centers = this.laneCenters(); var lane = this.laneAt(p.x); this.selectionLane = lane;
      var affordable = this.playerElixir + 0.001 >= c.cost;
      for (var i = 0; i < this.laneGhosts.length; i += 1) this.laneGhosts[i].setVisible(false);
      var ghost = this.laneGhosts[lane];
      if (!ghost) { ghost = this.add.rectangle(0, 0, 1, 1).setDepth(3); this.laneGhosts[lane] = ghost; }
      var laneWidth = 338 / this.arena.lanes;
      ghost.setPosition(16 + 10 + lane * laneWidth + laneWidth / 2, c.role === 'spell' ? 400 : 537).setSize(laneWidth - 8, c.role === 'spell' ? 500 : 224);
      ghost.setFillStyle(affordable ? c.color : PALETTE.coral, affordable ? 0.1 : 0.05).setStrokeStyle(2, affordable ? c.color : PALETTE.coral, 0.78).setVisible(true);
      var previewY = c.building ? (this.towerSlotAt('player', lane, this.legalY(p.y, c)) || {}).y || this.legalY(p.y, c) : this.legalY(p.y, c);
      this.rangeGhost.setPosition(centers[lane], previewY).setTint(c.color).setDisplaySize(clamp((c.range || 80) * 0.9, 62, 188), clamp((c.range || 80) * 0.9, 62, 188)).setVisible(c.role !== 'spell' && affordable);
      if (c.role === 'spell') this.reticle.setPosition(centers[lane], clamp(p.y, 146, 654)).setTint(c.color).setDisplaySize((c.radius || 70) * 2, (c.radius || 70) * 2).setVisible(affordable);
      else this.reticle.setVisible(false);
    }
    clearPreview() { this.laneGhosts.forEach(function (ghost) { if (ghost) ghost.setVisible(false); }); this.rangeGhost.setVisible(false); this.reticle.setVisible(false); }
    onPointerDown(pointer) {
      if (kit.paused || this.lifecyclePaused) return; var id = seedKitPointer(pointer); var p = pointerDesign(pointer);
      if (this.isResult()) { this.handleResultTap(p); return; }
      if (this.drag && this.drag.id !== id) return;
      var cardIndex = this.cardAt(p);
      if (cardIndex >= 0) { this.selectedHand = cardIndex; this.drag = { id: id, cardIndex: cardIndex, x: p.x, y: p.y, moved: false }; this.pointerRecords[id] = { x: p.x, y: p.y, startX: p.x, startY: p.y, laneTap: false }; this.setPreview(p); return; }
      if (this.isBoardPoint(p)) { this.selectionLane = this.laneAt(p.x); this.pointerRecords[id] = { x: p.x, y: p.y, startX: p.x, startY: p.y, laneTap: true, moved: false }; this.setPreview(p); }
    }
    onPointerMove(pointer) {
      if (kit.paused || this.lifecyclePaused) return; var id = pointer.id; var record = this.pointerRecords[id]; if (!record) return; var p = pointerDesign(pointer);
      record.x = p.x; record.y = p.y; record.moved = record.moved || Math.hypot(p.x - record.startX, p.y - record.startY) > 8;
      if (this.drag && this.drag.id === id) { this.drag.x = p.x; this.drag.y = p.y; this.drag.moved = record.moved; this.setPreview(p); }
      else if (record.laneTap) this.setPreview(p);
    }
    onPointerUp(pointer) {
      var id = pointer.id; var record = this.pointerRecords[id]; if (!record) return; var p = pointerDesign(pointer);
      if (!kit.paused && !this.lifecyclePaused && this.status === 'playing') {
        if (this.drag && this.drag.id === id) {
          var c = getCard(this.hand[this.drag.cardIndex]);
          if (record.moved && this.isBoardPoint(p)) this.stagePlacement(this.drag.cardIndex, this.laneAt(p.x), this.legalY(p.y, c));
          else this.selectedHand = this.drag.cardIndex;
        } else if (record.laneTap && !record.moved) {
          var tapCard = this.currentCard(); this.stagePlacement(this.selectedHand, this.laneAt(p.x), this.legalY(p.y, tapCard));
        }
      }
      this.drag = null; delete this.pointerRecords[id]; kit.input.pointers.delete(id); this.clearPreview();
    }
    onPointerCancel(pointer) { var id = pointer.id; delete this.pointerRecords[id]; if (this.drag && this.drag.id === id) this.drag = null; this.clearPreview(); kit.input.pointers.delete(id); }
    stagePlacement(cardIndex, lane, targetY) {
      var c = getCard(this.hand[cardIndex]);
      if (this.pendingPlacement || this.commandQueue.length) { this.showTransient('Tap UNDO before choosing another card', 'chip', 1.0); playSfx('cancel', 90); return; }
      if (this.cooldownFor(cardIndex) > 0) { this.showTransient('Card cooling down ' + this.cooldownFor(cardIndex).toFixed(1) + 's', 'chip', 1.0); playSfx('cancel', 90); return; }
      if (this.playerElixir + 0.001 < c.cost) { this.showTransient('Need ' + c.cost.toFixed(1) + ' elixir', 'chip', 1.0); playSfx('cancel', 90); return; }
      if (c.building && !this.towerSlotAt('player', lane, targetY)) { this.showTransient('Choose an open tower socket', 'chip', 1.0); playSfx('cancel', 90); return; }
      this.pendingPlacement = { cardIndex: cardIndex, lane: lane, targetY: targetY, readyAt: this.simClock + 0.42 };
      this.commandQueue.push(this.pendingPlacement); this.showTransient(c.short + ' staged. Tap UNDO to refund', 'chip', 1.0); playSfx('confirm', 80);
    }
    undoPlacement() {
      if (!this.pendingPlacement) return;
      this.commandQueue.length = 0; this.pendingPlacement = null; this.showTransient('Placement cancelled. Elixir refunded', 'chip', 1.0); playSfx('cancel', 80);
    }
    handleResultTap(p) {
      if (p.y >= 540 && p.y <= 625) {
        this.handleResultAction(p.x < 190 ? 'a' : 'b'); return;
      }
      if (p.y >= 700 && p.y <= 818) this.scene.start('forge');
    }
    handleResultAction(which) {
      if (!this.isResult()) return;
      if (which === 'a') {
        if (this.status === 'defeat') { this.resetMatch(); playSfx('confirm', 0); return; }
        if (this.mode === 'ladder' && this.rung < 8) { this.scene.start('duel', { mode: 'ladder', rung: this.rung + 1 }); return; }
        if (this.mode === 'gauntlet' && this.gauntletIndex < GAUNTLET_TABLE.length - 1) { this.scene.start('duel', { mode: 'gauntlet', gauntletIndex: this.gauntletIndex + 1 }); return; }
        if (this.mode === 'ladder') this.scene.start('ladder'); else this.scene.start('mode', { mode: this.mode }); return;
      }
      if (this.mode === 'ladder') this.scene.start('ladder'); else this.scene.start('mode', { mode: this.mode });
    }
    deployFromHand(cardIndex, lane, targetY, team) {
      var sourceHand = team === 'player' ? this.hand : this.enemyHand; var id = sourceHand[cardIndex]; var c = getCard(id); var energy = team === 'player' ? this.playerElixir : this.enemyElixir;
      if (energy + 0.001 < c.cost) return false;
      var centers = this.laneCenters(); var safeLane = clamp(lane | 0, 0, centers.length - 1); var y = c.role === 'spell' ? this.legalY(targetY, c) : team === 'player' ? this.legalY(targetY, c) : clamp(targetY, c.building ? 206 : 146, c.building ? 390 : 244);
      var towerSlot = c.building ? this.towerSlotAt(team, safeLane, y) : null;
      if (c.building && !towerSlot) { if (team === 'player') this.showTransient('That tower socket is occupied', 'chip', 1.0); return false; }
      if (team === 'player') this.playerElixir -= c.cost; else this.enemyElixir -= c.cost;
      if (c.role === 'spell') this.castSpell(c, team, safeLane, y);
      else {
        var count = clamp(c.count || 1, 1, 4); var baseY = c.building ? towerSlot.y : (team === 'player' ? y : 178);
        for (var i = 0; i < count; i += 1) this.obtainUnit(id, team, safeLane, baseY + (c.building ? 0 : (i - (count - 1) / 2) * 15 * (team === 'player' ? 1 : -1)), towerSlot, false);
        this.spawnFx(centers[safeLane], baseY, c.color, c.building ? 12 : 7, 'dust');
        playSfx('deploy', 55);
        if (team === 'player') this.showTransient(c.short + ' deployed', 'chip', 1.0);
      }
      if (team === 'player') this.setCooldown(cardIndex, c);
      if (team === 'player') { this.hand[cardIndex] = progress.deck[this.drawIndex % progress.deck.length]; this.drawIndex = (this.drawIndex + 1) % progress.deck.length; }
      else { var enemyDeck = this.match.deck || this.match.enemy || RUNG_TABLE[0].deck; this.enemyHand[cardIndex] = enemyDeck[(this.enemyDrawIndex++) % enemyDeck.length]; }
      this.recomputeSynergies();
      return true;
    }
    obtainUnit(cardId, team, lane, y, towerSlot, boss) {
      var slot = -1; for (var i = 0; i < this.unitPool.length; i += 1) if (!this.unitPool[i].alive) { slot = i; break; }
      if (slot < 0) return null;
      var c = getCard(cardId); var centers = this.laneCenters(); var u = this.unitPool[slot]; var bossScale = boss ? 2.55 : 1;
      u.alive = true; u.id = this.nextId++; u.cardId = cardId; u.team = team; u.lane = lane; u.x = centers[lane] + (Math.random() * 12 - 6); u.y = y; u.hp = c.hp * bossScale; u.maxHp = c.hp * bossScale; u.attackTimer = 0.15 + Math.random() * 0.25; u.freeze = 0; u.slow = 0; u.hit = 0; u.phase = Math.random() * TAU; u.slot = slot; u.boss = !!boss; u.bossTimer = boss ? 2.2 : 0; u.bossTelegraph = 0; u.towerSlot = towerSlot ? this.towerSlots.indexOf(towerSlot) : null; u.synergy = null;
      if (towerSlot) towerSlot.unitId = u.id;
      this.units.push(u); return u;
    }
    castSpell(c, team, lane, targetY) {
      var centers = this.laneCenters(); var x = centers[lane]; var enemy = team === 'player' ? 'enemy' : 'player'; var affected = 0; var affectedTeam = c.spell === 'heal' ? team : enemy;
      this.spawnFx(x, targetY, c.color, kit.juice.enabled ? 16 : 8, 'ability'); playSfx('spell', 80);
      for (var i = 0; i < this.units.length; i += 1) {
        var u = this.units[i]; if (!u.alive || u.team !== affectedTeam || u.lane !== lane || Math.abs(u.y - targetY) > c.radius) continue;
        if (c.spell === 'heal') { u.hp = Math.min(u.maxHp, u.hp + c.heal); affected += 1; }
        else { this.applyUnitDamage(u, c.damage, { cardId: Math.max(0, CARDS.indexOf(c)), team: team }, 1); if (c.spell === 'shock') u.freeze = Math.max(u.freeze, 1.0); if (c.spell === 'freeze') u.slow = Math.max(u.slow, 2.2); affected += 1; }
      }
      if (c.spell !== 'heal') { var coreY = enemy === 'enemy' ? 102 : 677; if (Math.abs(targetY - coreY) < c.radius + 28) this.damageCore(enemy, c.damage * (c.spell === 'meteor' ? 0.52 : 0.18), c.color); }
      if (team === 'player') this.showTransient(affected ? affected + ' target' + (affected === 1 ? '' : 's') + ' tagged' : 'Spell impact', 'chip', 1.0);
    }
    recomputeSynergies() {
      this.synergyLinks.length = 0;
      for (var i = 0; i < this.units.length; i += 1) this.units[i].synergy = null;
      for (var a = 0; a < this.units.length; a += 1) {
        var first = this.units[a]; if (!first.alive) continue; var firstCard = getCard(first.cardId);
        for (var b = a + 1; b < this.units.length; b += 1) {
          var second = this.units[b]; if (!second.alive || second.team !== first.team) continue;
          var secondCard = getCard(second.cardId); var tower = firstCard.building ? first : secondCard.building ? second : null; var companion = tower === first ? second : tower === second ? first : null;
          if (!tower || !companion || Math.abs(tower.lane - companion.lane) > 1 || Math.abs(tower.y - companion.y) > 92) continue;
          var role = getCard(companion.cardId).role; var label = role === 'ranged' ? 'OVERWATCH' : role === 'swarm' ? 'MESH' : role === 'rush' ? 'SPRINGLINE' : role === 'tank' ? 'ANCHOR' : 'RELAY';
          var bonus = role === 'rush' ? 1.22 : role === 'tank' ? 1.16 : 1.14;
          tower.synergy = { label: label, damage: bonus, partnerId: companion.id }; companion.synergy = { label: label, damage: bonus, partnerId: tower.id };
          if (this.synergyLinks.length < 12) this.synergyLinks.push({ a: tower, b: companion, label: label });
        }
      }
    }
    matchup(attacker, target) {
      var a = getCard(attacker.cardId); var t = getCard(target.cardId); var mult = 1;
      if (a.counter === t.role) mult *= 1.3;
      if (a.role === 'splash' && t.role === 'swarm') mult *= 1.2;
      if (a.role === 'building' && t.role === 'rush') mult *= 1.2;
      if (a.role === 'tank' && t.role === 'building') mult *= 0.9;
      if (attacker.synergy && attacker.synergy.damage) mult *= attacker.synergy.damage;
      return mult;
    }
    findTarget(unit) {
      var best = null; var bestDistance = Infinity;
      for (var i = 0; i < this.units.length; i += 1) {
        var other = this.units[i]; if (!other.alive || other.team === unit.team || other.lane !== unit.lane) continue;
        var ahead = unit.team === 'player' ? other.y < unit.y + 12 : other.y > unit.y - 12; var distance = Math.abs(other.y - unit.y);
        if (ahead && distance < bestDistance) { best = other; bestDistance = distance; }
      }
      return best;
    }
    applyUnitDamage(target, amount, attacker, splash) {
      if (!target || !target.alive) return;
      var dealt = amount * this.matchup(attacker, target); target.hp -= dealt; target.hit = 0.14; this.spawnFx(target.x, target.y, getCard(attacker.cardId).color, 3); playSfx('hit', 48); if (kit.juice.enabled && dealt >= 40) kit.juice.hitStop(26);
      if (splash > 0) for (var i = 0; i < this.units.length; i += 1) { var near = this.units[i]; if (near.alive && near !== target && near.team !== attacker.team && near.lane === target.lane && Math.abs(near.y - target.y) <= splash) { near.hp -= amount * 0.55 * this.matchup(attacker, near); near.hit = 0.1; if (near.hp <= 0) this.resolveDeath(near); } }
      if (target.hp <= 0) this.resolveDeath(target);
    }
    resolveDeath(target) {
      if (!target || !target.alive) return; target.alive = false; var slot = this.towerSlotForUnit(target); if (slot) slot.unitId = null; this.spawnFx(target.x, target.y, getCard(target.cardId).color, target.boss ? 14 : 8, target.boss ? 'ability' : 'contact'); playSfx(target.boss ? 'wave' : 'kill', target.boss ? 180 : 70); this.recomputeSynergies();
    }
    fireUnit(attacker, target) {
      var c = getCard(attacker.cardId); attacker.attackTimer = c.attack; attacker.hit = 0.12;
      if (c.range > 42 && Math.abs(target.y - attacker.y) > 34) {
        for (var i = 0; i < this.projectilePool.length; i += 1) if (!this.projectilePool[i].active) { var p = this.projectilePool[i]; var projectileView = this.projectileViews[p.viewSlot]; p.active = true; p.x = attacker.x; p.y = attacker.y; p.targetId = target.id; p.attacker = attacker; p.life = 0.2; p.max = 0.2; projectileView.sprite.setTint(c.color).setVisible(true); this.spawnFx(attacker.x, attacker.y, c.color, 2, 'trail'); this.projectiles.push(p); break; }
      } else this.applyUnitDamage(target, c.damage, attacker, c.splash || 0);
    }
    updateUnits(dt) {
      var centers = this.laneCenters();
      for (var i = 0; i < this.units.length; i += 1) {
        var u = this.units[i]; if (!u.alive) continue; var c = getCard(u.cardId); var wasBossCharging = u.bossTelegraph > 0; u.hit = Math.max(0, u.hit - dt); u.freeze = Math.max(0, u.freeze - dt); u.slow = Math.max(0, u.slow - dt); u.attackTimer -= dt; if (u.bossTelegraph > 0) u.bossTelegraph = Math.max(0, u.bossTelegraph - dt);
        if (u.boss && u.bossTimer > 0) u.bossTimer -= dt;
        if (u.boss && u.bossTimer <= 0 && u.bossTelegraph <= 0) {
          if (wasBossCharging) { var bossTarget = this.findTarget(u); if (bossTarget) this.applyUnitDamage(bossTarget, c.damage * 1.55, u, c.splash || 0); else this.damageCore(u.team === 'player' ? 'enemy' : 'player', c.damage * 0.9, c.color); u.bossTimer = 3.4; }
          else { u.bossTelegraph = 0.72; this.showTransient('BOSS CHARGE', 'warning', 0.8); playSfx('warning', 120); }
        }
        if (u.freeze > 0) continue;
        var target = this.findTarget(u); var distance = target ? Math.abs(target.y - u.y) : Infinity; var reach = Math.max(22, c.range || 20);
        if (target && distance <= reach) { if (u.attackTimer <= 0) this.fireUnit(u, target); }
        else if (!c.building) {
          var synergySpeed = u.synergy && u.synergy.label === 'SPRINGLINE' ? 1.22 : 1; var bossSpeed = u.boss ? 1.12 : 1;
          u.y += (u.team === 'player' ? -1 : 1) * (c.speed || 20) * synergySpeed * bossSpeed * (u.slow > 0 ? 0.42 : 1) * dt;
          u.x = centers[u.lane] + Math.sin(this.simClock * 2 + u.phase) * 4;
          if ((u.team === 'player' && u.y < 124) || (u.team === 'enemy' && u.y > 676)) { this.damageCore(u.team === 'player' ? 'enemy' : 'player', c.damage * (c.role === 'rush' ? 1.24 : 0.72) * (u.boss ? 1.4 : 1), c.color); this.resolveDeath(u); }
        }
      }
      var write = 0; for (var j = 0; j < this.units.length; j += 1) if (this.units[j].alive) { this.units[write] = this.units[j]; write += 1; } this.units.length = write;
    }
    updateProjectiles(dt) {
      for (var i = 0; i < this.projectiles.length; i += 1) {
        var p = this.projectiles[i]; if (!p.active) continue; p.life -= dt; var target = null; for (var j = 0; j < this.units.length; j += 1) if (this.units[j].alive && this.units[j].id === p.targetId) { target = this.units[j]; break; }
        if (!target || p.life <= 0) { if (target && p.attacker && p.attacker.alive) this.applyUnitDamage(target, getCard(p.attacker.cardId).damage, p.attacker, getCard(p.attacker.cardId).splash || 0); p.active = false; this.projectileViews[p.viewSlot].sprite.setVisible(false); }
      }
      var write = 0; for (var k = 0; k < this.projectiles.length; k += 1) if (this.projectiles[k].active) { this.projectiles[write] = this.projectiles[k]; write += 1; } this.projectiles.length = write;
    }
    updateFx(dt) {
      for (var s = 0; s < this.particleSystemList.length; s += 1) { var system = this.particleSystemList[s]; for (var i = 0; i < system.pool.length; i += 1) { var f = system.pool[i]; if (f.life <= 0) continue; f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 42 * dt; } }
    }
    spawnFx(x, y, color, count, kind) {
      var system = this.particleSystems[kind || 'contact'] || this.particleSystems.contact;
      var made = 0;
      for (var i = 0; i < system.pool.length && made < count; i += 1) {
        var f = system.pool[i]; if (f.life > 0) continue; var angle = Math.random() * TAU; var speed = 18 + Math.random() * 62; f.life = 0.24 + Math.random() * 0.32; f.max = f.life; f.x = x; f.y = y; f.vx = Math.cos(angle) * speed; f.vy = Math.sin(angle) * speed - 14; f.size = 0.55 + Math.random() * 0.8; system.views[f.viewSlot].sprite.setPosition(x, y).setTint(color).setScale(f.size).setAlpha(1).setVisible(true); made += 1;
      }
    }
    damageCore(team, amount, color) {
      if (this.status !== 'playing') return; if (this.overtime) amount = 1000;
      if (team === 'enemy') this.enemyCore = Math.max(0, this.enemyCore - amount); else this.playerCore = Math.max(0, this.playerCore - amount);
      this.spawnFx(W / 2, team === 'enemy' ? 102 : 677, color || (team === 'enemy' ? PALETTE.teal : PALETTE.coral), kit.juice.enabled ? 15 : 6, 'ability');
      if (kit.juice.enabled) { kit.juice.shake(7, 180); kit.juice.hitStop(34); } if (team === 'enemy') playSfx('clash', 110); else playSfx('warning', 110);
      this.showTransient((team === 'enemy' ? 'CORE HIT' : 'CORE WARNING'), 'chip', 0.85);
      if (this.enemyCore <= 0) this.finish('victory'); else if (this.playerCore <= 0) this.finish('defeat');
    }
    scheduleWave() {
      if (this.waveTelegraph || this.waveIndex >= MAX_WAVES) return;
      var pattern = WAVE_PATTERNS[Math.min(this.waveIndex, WAVE_PATTERNS.length - 1)]; this.waveIndex += 1;
      this.waveTelegraph = { pattern: pattern, index: this.waveIndex, time: 0.92, max: 0.92 };
      this.nextWaveAt = this.simClock + clamp(14.5 + this.match.gap * 4.2 - this.waveIndex * 0.4, 11.5, 19);
      this.showTransient((pattern.boss ? 'BOSS ' : 'WAVE ') + this.waveIndex + ' INBOUND', 'warning', 1.1); playSfx('warning', 160);
    }
    spawnWaveFormation(telegraph) {
      var pattern = telegraph.pattern; var count = pattern.cards.length; var centers = this.laneCenters();
      for (var i = 0; i < count; i += 1) {
        var cardId = pattern.cards[i]; var c = getCard(cardId); var lane = pattern.lanes[i] % this.arena.lanes; var y = 170 + (pattern.formation === 'stack' ? (i % 3) * 30 : (i % 2) * 42); var slot = c.building ? this.towerSlotAt('enemy', lane, 250 + (i % 2) * 70) : null;
        var unit = this.obtainUnit(cardId, 'enemy', lane, c.building && slot ? slot.y : y, slot, !!pattern.boss && (i === count - 1));
        if (unit && pattern.boss && i === count - 1) { unit.x = centers[lane]; unit.bossTimer = 1.25; }
      }
      this.recomputeSynergies(); this.spawnFx(W / 2, 180, pattern.boss ? PALETTE.coral : PALETTE.amber, pattern.boss ? 18 : 10, 'ability'); playSfx(pattern.boss ? 'danger' : 'deploy', 140); this.showTransient(pattern.name + ' deployed', pattern.boss ? 'warning' : 'chip', 1.2);
    }
    updateWaves(dt) {
      if (this.waveTelegraph) {
        this.waveTelegraph.time -= dt;
        if (this.waveTelegraph.time <= 0) { var readyWave = this.waveTelegraph; this.waveTelegraph = null; this.spawnWaveFormation(readyWave); }
      } else if (this.simClock >= this.nextWaveAt && this.waveIndex < MAX_WAVES) this.scheduleWave();
      var enemyAlive = this.units.some(function (u) { return u.alive && u.team === 'enemy'; });
      if (this.waveIndex > this.wavesCleared && !enemyAlive && !this.waveTelegraph) { this.wavesCleared = this.waveIndex; if (this.waveIndex > 0) { playSfx('wave', 120); this.showTransient('WAVE CLEAR', 'chip', 1.0); } }
    }
    chooseBotCard() {
      var threats = this.units.filter(function (u) { return u.alive && u.team === 'player'; }); var available = [];
      for (var i = 0; i < this.enemyHand.length; i += 1) if (getCard(this.enemyHand[i]).cost <= this.enemyElixir + 0.001) available.push(i);
      if (!available.length) return null; var choice = available[0]; var threat = threats.sort(function (a, b) { return b.y - a.y; })[0];
      if (threat) { var counter = available.find(function (index) { var c = getCard(this.enemyHand[index]); return c.counter === getCard(threat.cardId).role || (c.role === 'splash' && getCard(threat.cardId).role === 'swarm'); }.bind(this)); if (counter != null && Math.random() < this.match.skill) choice = counter; }
      if (Math.random() > this.match.skill) choice = available[Math.floor(Math.random() * available.length)]; return choice;
    }
    updateBot(dt) {
      if (this.botTelegraph) { this.botTelegraph.time -= dt; if (this.botTelegraph.time <= 0) { var ready = this.botTelegraph; this.botTelegraph = null; this.deployFromHand(ready.index, ready.lane, ready.targetY, 'enemy'); } return; }
      this.aiTimer -= dt; if (this.aiTimer > 0) return; this.aiTimer = this.match.gap * (0.86 + Math.random() * 0.22); var index = this.chooseBotCard(); if (index == null) return; var c = getCard(this.enemyHand[index]); var threats = this.units.filter(function (u) { return u.alive && u.team === 'player'; }); var threat = threats.sort(function (a, b) { return a.y - b.y; })[0]; var lane = threat && Math.random() < this.match.skill ? threat.lane : Math.floor(Math.random() * this.arena.lanes); var targetY = threat ? threat.y : 360;
      if (c.role !== 'spell') targetY = c.building ? 270 : 220; if (c.role === 'spell' && c.spell === 'heal') targetY = 220; this.botTelegraph = { index: index, lane: lane, targetY: targetY, time: 0.86, max: 0.86 }; this.showTransient('ENEMY READS LANE ' + (lane + 1), 'warning', 0.86); playSfx('warning', 140);
    }
    stepSim(dt) {
      if (this.status !== 'playing' || this.lifecyclePaused || kit.paused) return;
      this.simClock += dt; this.playerElixir = Math.min(10, this.playerElixir + dt * 1.22); this.enemyElixir = Math.min(10, this.enemyElixir + dt * 1.16);
      for (var cooldownIndex = 0; cooldownIndex < this.cardCooldowns.length; cooldownIndex += 1) this.cardCooldowns[cooldownIndex] = Math.max(0, this.cardCooldowns[cooldownIndex] - dt);
      if (this.tutorialStep < TUTORIAL_STEPS.length && this.simClock >= TUTORIAL_STEPS[this.tutorialStep].at) { this.showTransient(TUTORIAL_STEPS[this.tutorialStep].text, 'tutorial', 2.2); this.tutorialStep += 1; }
      if (!this.overtime) { this.timeLeft = Math.max(0, this.timeLeft - dt); if (this.timeLeft <= 0) { if (Math.abs(this.playerCore - this.enemyCore) < 1) { this.overtime = true; this.showTransient('SUDDEN DEATH', 'chip', 2.0); } else this.finish(this.enemyCore < this.playerCore ? 'victory' : 'defeat'); } }
      while (this.commandQueue.length && this.commandQueue[0].readyAt <= this.simClock) { var action = this.commandQueue.shift(); if (action) { this.pendingPlacement = null; this.deployFromHand(action.cardIndex, action.lane, action.targetY, 'player'); } }
      this.updateWaves(dt); this.updateBot(dt); this.updateUnits(dt); this.updateProjectiles(dt); this.updateFx(dt);
      if (this.transient) { this.transient.time -= dt; if (this.transient.time <= 0) this.transient = null; }
      if (this.banner) { this.banner.time -= dt; if (this.banner.time <= 0 && !this.banner.result) this.banner = null; }
    }
    showTransient(textValue, kind, time) { if (this.status !== 'playing') return; this.transient = { text: String(textValue).slice(0, 42), kind: kind || 'chip', time: time || 1, max: time || 1 }; }
    medalData() {
      var remaining = clamp(this.playerCore / 1000, 0, 1); var rungTier = tier(remaining); var nextStreak = progress.streak + 1; var streakTier = nextStreak >= 4 ? 'gold' : nextStreak >= 2 ? 'silver' : 'bronze'; var towerTier = this.playerCore >= 999 ? 'gold' : this.playerCore >= 700 ? 'silver' : 'bronze';
      return { rung: rungTier, streak: streakTier, tower: towerTier, streakCount: nextStreak };
    }
    finish(result) {
      if (this.status !== 'playing') return; this.status = result; tdState.status = result; tdState.inMatch = false;
      if (result === 'victory') {
        var medals = this.medalData(); progress.streak += 1;
        if (this.mode === 'ladder') { progress.medals[String(this.rung)] = { rung: medals.rung, streak: medals.streak, tower: medals.tower }; if (this.rung >= progress.rung) progress.rung = Math.min(8, this.rung + 1); if (this.rung <= 2) { var gift = (RUNG_TABLE[this.rung] || RUNG_TABLE[0]).unlock[0]; if (progress.deck.indexOf(gift) < 0) progress.deck[(this.rung + 3) % 8] = gift; progress.drops += 1; } }
        if (this.mode === 'gauntlet') progress.gauntletBest = Math.max(progress.gauntletBest, this.gauntletIndex + 1);
      if (this.mode === 'draft') progress.draftWins += 1;
        saveProgress(); tdState.medal = medals; playSfx('victory', 0); kit.audio.music('victoryMusic', 260); if (kit.juice.enabled) kit.juice.shake(4, 220);
        this.result = { title: this.mode === 'ladder' && this.rung < 8 ? 'RUNG UP' : 'CORE BREAK', sub: this.mode === 'ladder' && this.rung < 8 ? 'Three new cards online' : 'The line holds', details: 'Core ' + Math.ceil(this.enemyCore) + ' / ' + Math.ceil(this.playerCore), medal: 'RUNG ' + medals.rung.toUpperCase() + '\nSTREAK ' + medals.streak.toUpperCase() + '\nTOWER ' + medals.tower.toUpperCase(), hint: this.mode === 'ladder' && this.rung < 8 ? 'The next rung is unlocked' : 'Deck Forge is ready' };
      } else {
        progress.streak = 0; saveProgress(); playSfx('clash', 0); tdState.medal = null;
        this.result = { title: 'LINE LOST', sub: 'Retry the counter window', details: 'Core ' + Math.ceil(this.enemyCore) + ' / ' + Math.ceil(this.playerCore), medal: 'STREAK RESET', hint: 'Generous elixir returns on retry' };
      }
      this.transient = null; this.banner = { title: this.result.title, sub: this.result.sub, time: 999, max: 999, result: true }; this.showResultPanel();
    }
    showResultPanel() {
      this.resultPanel.setVisible(true).setScale(kit.juice.enabled ? 0.78 : 1).setStrokeStyle(2, this.status === 'victory' ? PALETTE.teal : PALETTE.coral, 1);
      this.resultTitle.setText(this.result.title).setColor(this.status === 'victory' ? '#43c7f4' : '#ff665c').setVisible(true);
      this.resultSub.setText(this.result.sub).setVisible(true); this.resultDetail.setText(this.result.details).setVisible(true); this.medalText.setText(this.result.medal).setVisible(this.status === 'victory'); this.resultHint.setText(this.result.hint).setVisible(true);
      this.resultButtonA.setVisible(true); this.resultButtonB.setVisible(true); this.resultButtonAText.setVisible(true); this.resultButtonBText.setVisible(true);
      this.resultZoneA.setVisible(true); this.resultZoneB.setVisible(true);
      this.resultButtonAText.setText(this.status === 'victory' ? 'CONTINUE' : 'RETRY'); this.resultButtonBText.setText(this.mode === 'ladder' ? 'LADDER' : 'MODES');
      if (kit.juice.enabled) this.tweens.add({ targets: this.resultPanel, scaleX: 1, scaleY: 1, duration: 520, ease: 'Back.Out' });
    }
    refreshHand() {
      for (var i = 0; i < this.cardViews.length; i += 1) {
        var view = this.cardViews[i]; var c = getCard(this.hand[i]); var selected = i === this.selectedHand; var cooldown = this.cooldownFor(i); var affordable = this.playerElixir + 0.001 >= c.cost && cooldown <= 0;
        view.bg.setFillStyle(selected ? 0x173b4b : PALETTE.panel, cooldown > 0 ? 0.68 : 1).setStrokeStyle(selected ? 2.5 : 1.5, selected ? PALETTE.white : (affordable ? c.color : PALETTE.line), 1);
        view.accent.setFillStyle(c.color, affordable ? 1 : 0.4); view.icon.setTexture('td-unit-' + (c.role || 'swarm')).setTint(affordable ? c.color : 0x5c707b); setTextIfChanged(view.name, c.short); setTextIfChanged(view.cost, '⚡ ' + c.cost); setTextIfChanged(view.role, c.role === 'building' ? 'BUILD' : c.role.toUpperCase());
        setTextIfChanged(view.effect, cooldown > 0 ? 'READY ' + cooldown.toFixed(1) + 's' : String(c.text).slice(0, 16));
        setColorIfChanged(view.name, affordable ? '#e9fbff' : '#647983'); setColorIfChanged(view.cost, affordable ? '#' + c.color.toString(16).padStart(6, '0') : '#647983'); setColorIfChanged(view.role, affordable ? '#91aeba' : '#647983');
        setColorIfChanged(view.effect, cooldown > 0 ? '#e0a34a' : '#91aeba');
      }
    }
    updateHud() {
      setTextIfChanged(this.headerMode, modeLabel(this.mode)); setTextIfChanged(this.headerRung, this.mode === 'ladder' ? 'RUNG ' + this.rung + ' / 8' : this.arena.signature); setTextIfChanged(this.headerTimer, this.overtime ? 'OT' : formatTime(this.timeLeft)); setTextIfChanged(this.headerArena, this.arena.name);
      setTextIfChanged(this.enemyHpText, Math.ceil(this.enemyCore) + ' HP'); setTextIfChanged(this.playerHpText, Math.ceil(this.playerCore) + ' HP'); setTextIfChanged(this.elixirText, '⚡ ' + this.playerElixir.toFixed(1) + ' / 10');
      this.enemyBar.width = 192 * clamp(this.enemyCore / 1000, 0, 1); this.playerBar.width = 192 * clamp(this.playerCore / 1000, 0, 1); this.elixirBar.width = 354 * clamp(this.playerElixir / 10, 0, 1); this.enemyBar.setFillStyle(this.enemyCore < 350 ? PALETTE.amber : PALETTE.coral, 1); this.playerBar.setFillStyle(this.playerCore < 350 ? PALETTE.coral : PALETTE.teal, 1);
      if (this.status === 'playing' && this.playerCore < 350 && !this.dangerMusic) { this.dangerMusic = true; kit.audio.music('danger', 420); }
      this.enemyWarn.setVisible(this.enemyCore < 350).setAlpha(this.enemyCore < 350 ? 0.35 + 0.22 * Math.sin(this.simClock * 8) : 0); this.playerWarn.setVisible(this.playerCore < 350).setAlpha(this.playerCore < 350 ? 0.35 + 0.22 * Math.sin(this.simClock * 8) : 0);
      var pScale = 1 + (this.playerCore < 350 ? 0.06 * Math.sin(this.simClock * 8) : 0); var eScale = 1 + (this.enemyCore < 350 ? 0.06 * Math.sin(this.simClock * 8) : 0); this.enemyCoreImage.setScale(eScale); this.playerCoreImage.setScale(pScale);
      this.refreshHand(); this.renderSockets(); this.renderLaneSelection(); setTextIfChanged(this.cooldownText, this.cooldownFor(this.selectedHand) > 0 ? 'COOLDOWN ' + this.cooldownFor(this.selectedHand).toFixed(1) + 's' : 'SELECTED ' + (this.selectionLane + 1)); setTextIfChanged(this.queueText, this.pendingPlacement ? 'PLACEMENT STAGED' : 'WAVE ' + this.waveIndex + ' / ' + MAX_WAVES); this.undoButton.setVisible(!!this.pendingPlacement); this.undoText.setVisible(!!this.pendingPlacement); this.undoZone.setVisible(!!this.pendingPlacement); this.updateState();
    }
    updateState() {
      tdState.mode = this.mode; tdState.rung = this.rung; tdState.hand = this.hand.slice(); tdState.deck = progress.deck.slice(); tdState.elixir = Number(this.playerElixir.toFixed(2)); tdState.coreHP = { player: Math.ceil(this.playerCore), enemy: Math.ceil(this.enemyCore) }; tdState.arena = this.arena.key; tdState.inMatch = this.status === 'playing'; tdState.status = this.status; tdState.wave = this.waveIndex; tdState.selectedLane = this.selectionLane; tdState.cooldowns = this.cardCooldowns.slice(); tdState.synergies = this.synergyLinks.length; tdState.forceMode = bootFallback.forceMode; tdState.forceRung = bootFallback.forceRung;
    }
    renderUnits() {
      for (var i = 0; i < this.unitViews.length; i += 1) { var off = this.unitViews[i]; off.body.setVisible(false); off.notch.setVisible(false); off.hpBg.setVisible(false); off.hp.setVisible(false); off.select.setVisible(false); }
      for (var j = 0; j < this.units.length; j += 1) {
        var u = this.units[j]; if (!u.alive) continue; var c = getCard(u.cardId); var v = this.unitViews[u.slot]; var color = u.team === 'player' ? TEAM.player : TEAM.enemy; var role = c.role || 'swarm'; var size = c.building ? 38 : c.role === 'tank' ? 35 : c.role === 'swarm' ? 26 : c.role === 'rush' ? 31 : 30; var bob = c.building ? 0 : Math.sin(this.simClock * (u.hit > 0 ? 18 : 7) + u.phase) * (u.hit > 0 ? 2.5 : 1.5); var flash = u.hit > 0 ? PALETTE.white : color; var pulse = u.bossTelegraph > 0 ? 1.16 + Math.sin(this.simClock * 18) * 0.08 : 1;
        v.body.setPosition(u.x, u.y + bob).setTexture(c.building ? 'td-tower' : 'td-unit-' + role).setDisplaySize(size * pulse, size * pulse).setTint(flash).setAlpha(u.freeze > 0 ? 0.62 : 1).setVisible(true);
        v.notch.setPosition(u.x, u.y - size * 0.38 + bob).setFillStyle(flash, 1).setVisible(true); v.hpBg.setPosition(u.x - 15, u.y + size * 0.52 + bob).setVisible(true); v.hp.setPosition(u.x - 15, u.y + size * 0.52 + bob).setSize(30 * clamp(u.hp / u.maxHp, 0, 1), 3).setFillStyle(color, 1).setVisible(true); v.select.setPosition(u.x, u.y).setDisplaySize(u.bossTelegraph > 0 ? 52 : 48, u.bossTelegraph > 0 ? 52 : 48).setTint(u.bossTelegraph > 0 ? PALETTE.coral : color).setVisible(u.bossTelegraph > 0);
      }
    }
    renderSynergies() {
      this.synergyGraphics.clear();
      for (var i = 0; i < this.synergyLinks.length; i += 1) { var link = this.synergyLinks[i]; if (!link.a.alive || !link.b.alive) continue; this.synergyGraphics.lineStyle(2, link.a.team === 'player' ? PALETTE.teal : PALETTE.coral, 0.72); this.synergyGraphics.lineBetween(link.a.x, link.a.y, link.b.x, link.b.y); }
    }
    renderProjectiles() { for (var i = 0; i < this.projectilePool.length; i += 1) { var p = this.projectilePool[i]; var view = this.projectileViews[p.viewSlot]; if (!p.active) { view.sprite.setVisible(false); continue; } var target = this.units.find(function (u) { return u.alive && u.id === p.targetId; }); var t = 1 - clamp(p.life / p.max, 0, 1); view.sprite.setPosition(target ? lerp(p.x, target.x, t) : p.x, target ? lerp(p.y, target.y, t) : p.y).setVisible(true); } }
    renderFx() { for (var s = 0; s < this.particleSystemList.length; s += 1) { var system = this.particleSystemList[s]; for (var i = 0; i < system.pool.length; i += 1) { var f = system.pool[i]; var view = system.views[f.viewSlot]; if (f.life <= 0) { view.sprite.setVisible(false); continue; } view.sprite.setPosition(f.x, f.y).setAlpha(clamp(f.life / f.max, 0, 1)).setScale(f.size * clamp(f.life / f.max, 0, 1)); } } }
    renderBanner() {
      var ready = this.banner && !this.banner.result && this.status === 'playing'; this.bannerBg.setVisible(!!ready); this.bannerTitle.setVisible(!!ready); this.bannerSub.setVisible(!!ready);
      if (ready) { var fade = clamp(this.banner.time / 0.34, 0, 1); this.bannerBg.setAlpha(Math.min(1, fade)); this.bannerTitle.setAlpha(Math.min(1, fade)); this.bannerSub.setAlpha(Math.min(1, fade)); setTextIfChanged(this.bannerTitle, this.banner.title); setTextIfChanged(this.bannerSub, this.banner.sub); }
      var telegraph = this.waveTelegraph && this.status === 'playing'; var bot = this.botTelegraph && !telegraph && this.status === 'playing'; this.waveLabel.setVisible(!!(telegraph || bot));
      for (var i = 0; i < this.waveRings.length; i += 1) { var active = !!telegraph && this.waveTelegraph.pattern.lanes.indexOf(i) >= 0 || !!bot && this.botTelegraph.lane === i; this.waveRings[i].setVisible(active); if (active) { var x = this.laneCenters()[i] || this.laneCenters()[0]; var time = telegraph ? this.waveTelegraph.time : this.botTelegraph.time; var max = telegraph ? this.waveTelegraph.max : this.botTelegraph.max; this.waveRings[i].setPosition(x, bot ? 220 : 182 + (i % 2) * 32).setScale(1 + (1 - time / max) * 0.32); } }
      if (telegraph) setTextIfChanged(this.waveLabel, (this.waveTelegraph.pattern.boss ? 'BOSS ' : 'WAVE ') + this.waveTelegraph.index + ' / ' + this.waveTelegraph.pattern.name + '  ' + this.waveTelegraph.time.toFixed(1));
      else if (bot) setTextIfChanged(this.waveLabel, 'ENEMY READS LANE ' + (this.botTelegraph.lane + 1) + '  ' + this.botTelegraph.time.toFixed(1));
    }
    renderTransient() {
      if (this.status !== 'playing' || !this.transient) { this.toastBg.setVisible(false); this.toastText.setVisible(false); return; }
      var fade = clamp(this.transient.time < 0.32 ? this.transient.time / 0.32 : 1, 0, 1); this.toastBg.setVisible(true).setAlpha(0.88 * fade); this.toastText.setVisible(true).setAlpha(fade); setTextIfChanged(this.toastText, this.transient.text); setColorIfChanged(this.toastText, this.transient.kind === 'warning' ? '#ff665c' : this.transient.kind === 'chip' ? '#e0a34a' : '#e9fbff');
    }
    renderDrag() {
      if (!this.drag || this.status !== 'playing') { this.dragGhost.setVisible(false); return; }
      var c = getCard(this.hand[this.drag.cardIndex]); this.dragGhost.setPosition(this.drag.x, this.drag.y).setVisible(true); this.dragGhostIcon.setTexture('td-unit-' + c.role).setTint(c.color); setTextIfChanged(this.dragGhostText, c.short); this.dragGhostBg.setStrokeStyle(2, c.color, 1);
    }
    update(time, delta) {
      if (kit.paused || this.lifecyclePaused) return; var raw = Math.min(Math.max(delta || 0, 0) / 1000, 0.1); this.accumulator += raw; var steps = 0;
      var juice = kit.juice.frame();
      if (!juice.frozen) while (this.accumulator >= STEP && steps < MAX_SIM_STEPS_PER_FRAME) { this.stepSim(STEP); this.accumulator -= STEP; steps += 1; }
      this.updateHud(); this.renderUnits(); this.renderSynergies(); this.renderProjectiles(); this.renderFx(); this.renderBanner(); this.renderTransient(); this.renderDrag();
      this.cameras.main.setScroll(-juice.dx, -juice.dy);
      var requestedMode = modeSafe(bootFallback.forceMode);
      var requestedRung = bootFallback.forceRung == null ? null : intSafe(bootFallback.forceRung, this.rung, 1, 8);
      if (this.status === 'playing' && requestedMode && requestedMode !== this.mode) { this.mode = requestedMode; this.resetMatch(); }
      if (this.status === 'playing' && this.mode === 'ladder' && requestedRung != null && requestedRung !== this.rung) { this.rung = requestedRung; this.resetMatch(); }
      if (this.isResult()) {
        if (edgeKey(this, 'ArrowLeft') || kit.input.gamepadEdge('left')) this.resultFocus = 0;
        if (edgeKey(this, 'ArrowRight') || kit.input.gamepadEdge('right')) this.resultFocus = 1;
        if (edgeKey(this, 'Space') || edgeKey(this, 'Enter') || kit.input.gamepadEdge('confirm')) this.handleResultAction(this.resultFocus === 0 ? 'a' : 'b');
        if (edgeKey(this, 'Escape') || kit.input.gamepadEdge('cancel')) this.scene.start('menu');
        this.resultButtonA.setStrokeStyle(2.5, this.resultFocus === 0 ? PALETTE.white : PALETTE.teal, 1); this.resultButtonB.setStrokeStyle(2.5, this.resultFocus === 1 ? PALETTE.white : PALETTE.violet, 1); return;
      }
      for (var keyIndex = 0; keyIndex < 4; keyIndex += 1) if (edgeKey(this, 'Digit' + (keyIndex + 1))) { this.selectedHand = keyIndex; playSfx('select', 50); }
      if (edgeKey(this, 'ArrowLeft') || kit.input.gamepadEdge('left')) this.selectionLane = Math.max(0, this.selectionLane - 1);
      if (edgeKey(this, 'ArrowRight') || kit.input.gamepadEdge('right')) this.selectionLane = Math.min(this.arena.lanes - 1, this.selectionLane + 1);
      if (edgeKey(this, 'ArrowUp') || kit.input.gamepadEdge('up')) this.selectedHand = (this.selectedHand + 3) % 4;
      if (edgeKey(this, 'ArrowDown') || kit.input.gamepadEdge('down')) this.selectedHand = (this.selectedHand + 1) % 4;
      if (edgeKey(this, 'Space') || edgeKey(this, 'Enter') || kit.input.gamepadEdge('confirm')) { var keyboardCard = this.currentCard(); this.stagePlacement(this.selectedHand, this.selectionLane, this.legalY(540, keyboardCard)); }
      if (edgeKey(this, 'Backspace') || edgeKey(this, 'Escape') || kit.input.gamepadEdge('cancel')) { if (this.pendingPlacement) this.undoPlacement(); else this.scene.start('menu'); }
    }
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-mount',
    backgroundColor: '#07111d',
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
    fps: { target: 60, min: 30 },
    scene: [BootScene, MenuScene, LadderScene, ForgeScene, ModeScene, DuelScene],
  });
  kit.registerPWA();
  window.__TOWERLINE_READY = true;
}());
