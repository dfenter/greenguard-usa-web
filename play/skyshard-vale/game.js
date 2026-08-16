(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const FIXED_DT = 1 / 60;
  const MAX_STEPS_PER_FRAME = 6;
  const WORLD = { w: 2600, h: 1800 };
  const TILE_SIZE = 80;
  const MAP_COLS = 32;
  const MAP_ROWS = 22;
  const SAVE_VERSION = 5;
  const COLORS = {
    ink: 0x081726, paper: 0xf5f0dc, meadow: 0x4d9a70, meadowDeep: 0x2e6659,
    lake: 0x2d8496, lakeDeep: 0x1d526d, ruin: 0x62637c, ruinDeep: 0x343a58,
    peak: 0x8baabd, peakDeep: 0x4d6f89, ember: 0xff9d69, frost: 0xa6eaff,
    spark: 0xffe281, wet: 0x67cae0, strike: 0xf1dfbd, gold: 0xffd38a,
    coral: 0xff8d84, moss: 0x94e19c, violet: 0xdca9ef, shadow: 0x06111f
  };
  const ELEMENTS = {
    strike: { label: 'STRIKE', mark: '◆', color: COLORS.strike },
    frost: { label: 'FROST', mark: '❄', color: COLORS.frost },
    spark: { label: 'SPARK', mark: '✦', color: COLORS.spark },
    ember: { label: 'EMBER', mark: '✹', color: COLORS.ember },
    wet: { label: 'WET', mark: '●', color: COLORS.wet }
  };
  const PARTY = [
    { name: 'TAVI', role: 'BLADE', element: 'strike', skill: 'ember', color: 0xed866b },
    { name: 'SERA', role: 'BOW', element: 'frost', skill: 'wet', color: 0x9bdcff },
    { name: 'MALK', role: 'STAFF', element: 'spark', skill: 'spark', color: 0xffe27b }
  ];
  const ZONES = {
    meadow: { id: 'meadow', name: 'MEADOW', bounds: { x: 0, y: 900, w: 1000, h: 900 }, center: { x: 450, y: 1350 }, start: { x: 410, y: 1470 }, accent: COLORS.meadow, deep: COLORS.meadowDeep, landmark: 'ROOTWELL', hazard: 'THORN GROVES', signature: 'greenwater grassland' },
    lake: { id: 'lake', name: 'LAKE', bounds: { x: 720, y: 740, w: 1050, h: 920 }, center: { x: 1190, y: 1210 }, start: { x: 1050, y: 1210 }, accent: COLORS.lake, deep: COLORS.lakeDeep, landmark: 'DRIFTGLASS', hazard: 'TIDAL VEIL', signature: 'shallow water and current' },
    ruin: { id: 'ruin', name: 'RUIN', bounds: { x: 1450, y: 330, w: 1150, h: 1100 }, center: { x: 2030, y: 850 }, start: { x: 1870, y: 820 }, accent: COLORS.ruin, deep: COLORS.ruinDeep, landmark: 'SUNKEN ARCHIVE', hazard: 'EMBER VENTS', signature: 'broken stone and fire' },
    peak: { id: 'peak', name: 'PEAK', bounds: { x: 950, y: 0, w: 1300, h: 650 }, center: { x: 1600, y: 300 }, start: { x: 1600, y: 385 }, accent: COLORS.peak, deep: COLORS.peakDeep, landmark: 'CLOUDSTEP', hazard: 'FROST WIND', signature: 'high wind and ice' }
  };
  const ZONE_ORDER = ['meadow', 'lake', 'ruin', 'peak'];
  const SHRINES = [
    { id: 0, name: 'ROOTWELL', zone: 'meadow', x: 410, y: 1470, ability: null, gift: 'last shrine return', color: COLORS.moss },
    { id: 1, name: 'DRIFTGLASS', zone: 'lake', x: 1040, y: 1210, ability: 'dash', gift: 'burst through the blue gate', color: COLORS.lake },
    { id: 2, name: 'SUNKEN ARCHIVE', zone: 'ruin', x: 1900, y: 800, ability: 'lift', gift: 'raise the archive stair', color: COLORS.violet },
    { id: 3, name: 'CLOUDSTEP', zone: 'peak', x: 1600, y: 385, ability: 'glide', gift: 'cross the high wind', color: COLORS.gold }
  ];
  const CHESTS = [
    { id: 0, zone: 'meadow', x: 690, y: 1570, reward: 36 }, { id: 1, zone: 'meadow', x: 260, y: 1120, reward: 30 },
    { id: 2, zone: 'lake', x: 870, y: 1450, reward: 42 }, { id: 3, zone: 'lake', x: 1410, y: 1010, reward: 46 },
    { id: 4, zone: 'ruin', x: 2240, y: 1080, reward: 52 }, { id: 5, zone: 'ruin', x: 1660, y: 580, reward: 48 },
    { id: 6, zone: 'peak', x: 1200, y: 215, reward: 60 }, { id: 7, zone: 'peak', x: 2040, y: 230, reward: 66 }
  ];
  const SHARDS = [
    { id: 0, zone: 'meadow', x: 170, y: 1600 }, { id: 1, zone: 'meadow', x: 230, y: 1330 },
    { id: 2, zone: 'lake', x: 790, y: 1015 }, { id: 3, zone: 'lake', x: 1510, y: 1450 },
    { id: 4, zone: 'ruin', x: 2180, y: 610 }, { id: 5, zone: 'ruin', x: 2140, y: 1240 },
    { id: 6, zone: 'peak', x: 1120, y: 190 }, { id: 7, zone: 'peak', x: 2060, y: 380 }
  ];
  const ALTITUDE_PUZZLES = [
    { id: 0, zone: 'lake', x: 880, y: 1160, ability: 'dash', title: 'TIDE RUNE', solution: 'Dash across the blue current to tune it.', color: COLORS.wet },
    { id: 1, zone: 'ruin', x: 1730, y: 720, ability: 'lift', title: 'ARCHIVE RUNE', solution: 'Lift the fallen stair to tune it.', color: COLORS.violet },
    { id: 2, zone: 'peak', x: 1370, y: 280, ability: 'glide', title: 'CLOUD RUNE', solution: 'Glide through the frost wind to tune it.', color: COLORS.gold }
  ];
  const ALTITUDE_MASK = (1 << ALTITUDE_PUZZLES.length) - 1;
  const SHARD_MASK = (1 << SHARDS.length) - 1;
  const PORTAL = { x: 1600, y: 100, radius: 112 };
  const TERRAIN_BLOCKS = [
    { x: 110, y: 1030, w: 230, h: 62, label: 'meadow ridge' }, { x: 520, y: 1610, w: 270, h: 58, label: 'root hedge' },
    { x: 735, y: 850, w: 180, h: 64, label: 'lake bank' }, { x: 1180, y: 1350, w: 220, h: 60, label: 'drift rocks' },
    { x: 1510, y: 700, w: 170, h: 150, label: 'archive wall' }, { x: 2010, y: 470, w: 250, h: 64, label: 'ruin wall' },
    { x: 2260, y: 1180, w: 210, h: 118, label: 'fallen archive' }, { x: 1040, y: 40, w: 190, h: 62, label: 'peak shelf' }
  ];
  const ENEMIES = [
    { id: 0, family: 'mote', x: 700, y: 1370, hp: 62, damage: 8, element: 'wet', zone: 'meadow' },
    { id: 1, family: 'briar', x: 560, y: 1100, hp: 72, damage: 9, element: 'strike', zone: 'meadow' },
    { id: 2, family: 'mote', x: 820, y: 1030, hp: 70, damage: 9, element: 'wet', zone: 'lake' },
    { id: 3, family: 'sentinel', x: 1390, y: 1400, hp: 92, damage: 11, element: 'wet', zone: 'lake' },
    { id: 4, family: 'sentinel', x: 1680, y: 1160, hp: 108, damage: 12, element: 'ember', zone: 'ruin' },
    { id: 5, family: 'briar', x: 2300, y: 760, hp: 122, damage: 13, element: 'ember', zone: 'ruin' },
    { id: 6, family: 'guardian', x: 1040, y: 1210, hp: 220, damage: 14, element: 'wet', shrine: 1, zone: 'lake' },
    { id: 7, family: 'guardian', x: 1900, y: 800, hp: 280, damage: 16, element: 'ember', shrine: 2, zone: 'ruin' },
    { id: 8, family: 'guardian', x: 1600, y: 385, hp: 330, damage: 18, element: 'frost', shrine: 3, zone: 'peak' },
    { id: 9, family: 'boss', x: 1600, y: 100, hp: 620, damage: 22, element: 'frost', boss: true, zone: 'peak' }
  ];
  const TRIALS = {
    1: { id: 1, shrine: 1, title: 'DRIFTGLASS WARDEN', bronze: 45, silver: 30, gold: 20, combos: 2 },
    2: { id: 2, shrine: 2, title: 'ARCHIVE SENTINEL', bronze: 42, silver: 28, gold: 19, combos: 2 },
    3: { id: 3, shrine: 3, title: 'CLOUDSTEP KEEPER', bronze: 38, silver: 25, gold: 17, combos: 3 }
  };
  const GATES = [
    { id: 'dash', ability: 'dash', x: 1290, y: 0, w: 112, h: WORLD.h, color: COLORS.wet, label: 'DASH' },
    { id: 'lift', ability: 'lift', x: 1390, y: 545, w: WORLD.w - 1390, h: 105, color: COLORS.violet, label: 'LIFT' },
    { id: 'glide', ability: 'glide', x: 1380, y: 70, w: WORLD.w - 1380, h: 100, color: COLORS.gold, label: 'GLIDE' }
  ];
  const AUDIO = {
    attack: 'attack', hurt: 'hurt', chest: 'chest-open', swap: 'party-swap', skill: 'skill-cast', combo: 'elemental-combo',
    shrine: 'shrine-unlock', boss: 'boss-roar', trial: 'trial-start', medal: 'trial-medal', footstep: 'footstep', gate: 'gate',
    portal: 'portal-open', secret: 'secret', ui: 'ui', musicByZone: { meadow: 'meadow-ambient', lake: 'lake-ambient', ruin: 'ruin-ambient', peak: 'peak-ambient' }
  };

  const refs = {
    zone: document.getElementById('zone-chip'), healthFill: document.getElementById('health-fill'), healthRead: document.getElementById('health-read'),
    chargeFill: document.getElementById('charge-fill'), chargeRead: document.getElementById('charge-read'), shards: document.getElementById('shard-metric'),
    elementMark: document.getElementById('element-mark'), elementRead: document.getElementById('element-read'), transient: document.getElementById('transient-chip'),
    transientMark: document.getElementById('transient-mark'), transientRead: document.getElementById('transient-read'), coach: document.getElementById('coach-strip'),
    banner: document.getElementById('moment-banner'), bannerTitle: document.getElementById('banner-title'), bannerCopy: document.getElementById('banner-copy'),
    trialButton: document.getElementById('trial-button'), settingsButton: document.getElementById('settings-button'), trialPanel: document.getElementById('trial-panel'),
    trialClose: document.getElementById('trial-close'), restart: document.getElementById('restart-button'), interact: document.getElementById('interact-button'),
    compass: document.getElementById('compass-read'), altitude: document.getElementById('altitude-read'), routeZones: [...document.querySelectorAll('[data-route-zone]')],
    trialChoices: [...document.querySelectorAll('.trial-choice')], trialMedals: [1, 2, 3].map((id) => document.getElementById(`trial-medal-${id}`)),
    stick: document.getElementById('stick'), thumb: document.getElementById('stick-thumb'), dash: document.getElementById('dash-button'),
    skill: document.getElementById('skill-button'), attack: document.getElementById('attack-button'), chips: [...document.querySelectorAll('.party-chip')],
    ability: { dash: document.getElementById('ability-dash'), lift: document.getElementById('ability-lift'), glide: document.getElementById('ability-glide') }
  };
  let DPR = 1;

  const COMBO_NAMES = ['CHAIN SHOCK', 'SHATTER', 'STEAM HEAL'];
  const SAVE_KEYS = ['altitude', 'best', 'chests', 'cleared', 'discoveries', 'portal', 'shards', 'shrines', 'trials', 'version'];
  const cloneDefault = () => ({ version: SAVE_VERSION, shrines: 1, chests: 0, shards: 0, altitude: 0, portal: false, cleared: false, best: 0, trials: [0, 0, 0], discoveries: [] });
  function validSave(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value).sort(); if (keys.length !== SAVE_KEYS.length || keys.some((key, index) => key !== SAVE_KEYS.slice().sort()[index])) return false;
    return value.version === SAVE_VERSION && Number.isInteger(value.shrines) && value.shrines >= 1 && value.shrines <= 15 &&
      Number.isInteger(value.chests) && value.chests >= 0 && value.chests <= 255 && Number.isInteger(value.shards) && value.shards >= 0 && value.shards <= SHARD_MASK &&
      Number.isInteger(value.altitude) && value.altitude >= 0 && value.altitude <= ALTITUDE_MASK && typeof value.portal === 'boolean' && typeof value.cleared === 'boolean' &&
      Number.isFinite(value.best) && value.best >= 0 && Array.isArray(value.trials) && value.trials.length === 3 && value.trials.every((trial) => Number.isInteger(trial) && trial >= 0 && trial <= 3) &&
      Array.isArray(value.discoveries) && value.discoveries.length <= COMBO_NAMES.length && value.discoveries.every((name) => COMBO_NAMES.includes(name));
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function num(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function safeZone(value) { const key = String(value || '').toLowerCase(); return ZONES[key] || ZONES.meadow; }
  function safeShrine(value) { const id = Number(value); return SHRINES.find((shrine) => shrine.id === id) || SHRINES[0]; }
  function safeTrial(value) { const id = Number(value); return TRIALS[id] || TRIALS[1]; }
  function safeElement(value) { return ELEMENTS[value] ? value : 'strike'; }
  function hex(color) { return `#${color.toString(16).padStart(6, '0')}`; }
  function textIfChanged(object, value) { const text = String(value); if (object.text !== text) object.setText(text); }
  function colorIfChanged(object, value) { const color = hex(value); if (object.style.color !== color) object.setColor(color); }
  function scaleIfChanged(element, value) { const next = clamp(num(value), 0, 1); const style = String(next); if (element.dataset.scale !== style) { element.dataset.scale = style; element.style.transform = `scaleX(${style})`; } }

  let sceneRef = null;
  let pendingZone = null;
  let pendingShrine = null;
  const bootState = {
    mode: 'boot', zone: 'meadow', party: { active: 0, members: PARTY.map((member) => ({ name: member.name, role: member.role, hp: 100, element: member.element })) },
    abilities: { dash: false, lift: false, glide: false }, altitude: { tier: 'LOWLAND', solved: 0 }, portal: false, shards: 0, elements: { applied: null, combo: null, comboCount: 0, variety: 0, charge: 100, discovered: {} }, trial: { active: null, medals: [0, 0, 0] }
  };
  window.__sv = {
    state: bootState,
    forceZone(value) { if (sceneRef) sceneRef.forceZone(value); else pendingZone = value; },
    forceShrine(value) { if (sceneRef) sceneRef.forceShrine(value); else pendingShrine = value; }
  };

  const kit = GGKit.create({
    slug: 'skyshard-vale', orientation: 'any', validateSave: validSave,
    onPause: () => { if (sceneRef) sceneRef.onKitPause(); }, onResume: () => { if (sceneRef) sceneRef.pausedByKit = false; },
    onRestart: () => { if (sceneRef) sceneRef.restartRun(); }
  });
  kit.registerPWA();
  const AUDIO_FILES = ['attack', 'hurt', 'chest-open', 'party-swap', 'skill-cast', 'elemental-combo', 'shrine-unlock', 'boss-roar', 'trial-start', 'trial-medal', 'footstep', 'gate', 'portal-open', 'secret', 'ui', 'meadow-ambient', 'lake-ambient', 'ruin-ambient', 'peak-ambient'];
  kit.audio.register(Object.fromEntries(AUDIO_FILES.map((name) => [name, `/play/skyshard-vale/assets/${name}.mp3`])));
  kit.loader.show('Skyshard Vale');
  kit.loader.progress(.2);

  function sfx(name, volume = 1) { kit.audio.sfx(AUDIO[name] || AUDIO.ui, { volume }); }
  function seedPointer(event, zone) {
    kit.input.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, downAt: performance.now(), zone });
  }
  function enqueue(action) {
    if (!sceneRef) return;
    sceneRef.actionQueue.push(action);
    if (sceneRef.actionQueue.length > 12) sceneRef.actionQueue.shift();
  }
  function bindButton(element, action) {
    element.addEventListener('pointerdown', (event) => { event.preventDefault(); seedPointer(event, action); enqueue(action); element.classList.add('held'); element.setPointerCapture?.(event.pointerId); }, { passive: false });
    const release = (event) => { if (event) event.preventDefault(); element.classList.remove('held'); };
    element.addEventListener('pointerup', release, { passive: false });
    element.addEventListener('pointercancel', release, { passive: false });
  }
  function paintTrialMedals() {
    const medals = sceneRef?.saveData?.trials || [0, 0, 0];
    refs.trialMedals.forEach((element, index) => { const value = clamp(Number(medals[index]) || 0, 0, 3); element.textContent = ['-', 'B', 'S', 'G'][value]; });
    refs.trialChoices.forEach((choice) => { choice.disabled = !sceneRef || !sceneRef.canTrial(Number(choice.dataset.trial)); });
  }
  function bindDom() {
    bindButton(refs.attack, 'attack'); bindButton(refs.skill, 'skill'); bindButton(refs.dash, 'dash'); bindButton(refs.interact, 'interact');
    refs.chips.forEach((chip) => bindButton(chip, `swap-${chip.dataset.slot}`));
    let stickId = null;
    function updateStick(event) {
      const pointer = kit.input.pointers.get(event.pointerId); if (!pointer) return;
      const rect = refs.stick.getBoundingClientRect(); const dx = pointer.x - (rect.left + rect.width / 2); const dy = pointer.y - (rect.top + rect.height / 2);
      const radius = rect.width * .38; const length = Math.hypot(dx, dy); const limit = length > radius ? radius / length : 1;
      pointer.zone = 'stick'; pointer.stickX = clamp(dx / radius, -1, 1); pointer.stickY = clamp(dy / radius, -1, 1); pointer.stickMag = clamp(length / radius, 0, 1);
      refs.thumb.style.transform = `translate(${dx * limit}px, ${dy * limit}px)`;
    }
    refs.stick.addEventListener('pointerdown', (event) => { event.preventDefault(); seedPointer(event, 'stick'); if (stickId !== null) return; stickId = event.pointerId; refs.stick.setPointerCapture?.(stickId); updateStick(event); }, { passive: false });
    refs.stick.addEventListener('pointermove', (event) => { if (event.pointerId === stickId) { event.preventDefault(); updateStick(event); } }, { passive: false });
    const endStick = (event) => { if (event.pointerId !== stickId) return; event.preventDefault(); stickId = null; refs.thumb.style.transform = 'translate(0, 0)'; const pointer = kit.input.pointers.get(event.pointerId); if (pointer) { pointer.stickX = 0; pointer.stickY = 0; pointer.stickMag = 0; } };
    refs.stick.addEventListener('pointerup', endStick, { passive: false }); refs.stick.addEventListener('pointercancel', endStick, { passive: false });
    refs.trialButton.addEventListener('click', () => { if (!sceneRef || sceneRef.state.mode === 'victory' || sceneRef.sim.boundary) return; kit.pause('trial-menu'); refs.trialPanel.classList.add('visible'); paintTrialMedals(); });
    refs.trialClose.addEventListener('click', () => { refs.trialPanel.classList.remove('visible'); kit.resume('trial-menu'); });
    refs.trialChoices.forEach((choice) => choice.addEventListener('click', () => { const id = Number(choice.dataset.trial); if (!sceneRef?.canTrial(id)) return; refs.trialPanel.classList.remove('visible'); kit.resume('trial-menu'); sceneRef.startTrial(id); }));
    refs.restart.addEventListener('click', () => kit.restart());
    refs.settingsButton.addEventListener('click', () => kit.openSettings());
  }
  bindDom();

  class ValeScene extends Phaser.Scene {
    constructor() { super('ValeScene'); }

    create() {
      sceneRef = this;
      this.saveData = this.normalizeSave(kit.save.get(cloneDefault()));
      this.pausedByKit = false; this.actionQueue = []; this.lastKeys = Object.create(null); this.accumulator = 0; this.renderShakeX = 0; this.renderShakeY = 0; this.gamepad = { index: null, connected: false, moveX: 0, moveY: 0, buttons: Object.create(null) };
      window.addEventListener('gamepadconnected', (event) => { if (this.gamepad.index === null) this.gamepad.index = event.gamepad.index; });
      window.addEventListener('gamepaddisconnected', (event) => { if (this.gamepad.index === event.gamepad.index) { this.gamepad.index = null; this.gamepad.connected = false; this.gamepad.buttons = Object.create(null); } });
      this.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.sim = { time: 0, wallTime: 0, score: 0, shards: this.countBits(this.saveData.shards), shardDisplay: this.countBits(this.saveData.shards), altitudeTier: 'LOWLAND', zone: 'meadow', lastShrine: 0, gatePing: 0, coach: 60, footstep: 0, dangerSting: 0, transient: null, transientQueue: [], boundary: null, trial: null, respawn: 0, playerWet: 0 };
      this.run = { deaths: 0, comboSet: new Set() };
      this.state = { mode: 'explore', zone: 'meadow', party: { active: 0, members: PARTY.map((member) => ({ name: member.name, role: member.role, hp: 100, element: member.element })) }, abilities: this.abilityState(), altitude: { tier: 'LOWLAND', solved: this.saveData.altitude }, portal: !!this.saveData.portal, shards: this.sim.shards, elements: { applied: null, combo: null, comboCount: 0, variety: 0, charge: 100, discovered: {} }, trial: { active: null, medals: this.saveData.trials.slice(0, 3) } };
      this.player = this.makePlayer(); this.enemies = this.makeEnemies(); this.renderState = { player: { flash: 0 }, enemies: this.enemies.map(() => ({ visible: false, flash: 0, target: false })), projectiles: Array.from({ length: 24 }, () => ({ visible: false })), fx: [] };
      this.createTextures(); kit.loader.progress(.44); this.createWorld(); kit.loader.progress(.62); this.createViews(); kit.loader.progress(.8); this.createPools(); kit.loader.progress(1);
      this.cameras.main.setBounds(0, 0, WORLD.w, WORLD.h); this.cameras.main.startFollow(this.playerView.sprite, true, .1, .1); this.setCameraZoom(); this.scale.on('resize', () => this.setCameraZoom());
      this.applyState(); this.showBoundary('SKYSHARD VALE', 'Four zones. Three shrine gifts. Find the shards, tune the runes, and wake the portal.', 1.8); kit.loader.hide();
      kit.audio.music(AUDIO.musicByZone.meadow, 700);
      if (pendingZone !== null) { this.forceZone(pendingZone); pendingZone = null; }
      if (pendingShrine !== null) { this.forceShrine(pendingShrine); pendingShrine = null; }
    }

    normalizeSave(value) {
      const source = validSave(value) ? value : cloneDefault();
      return { version: SAVE_VERSION, shrines: clamp(source.shrines | 0, 1, 15), chests: clamp(source.chests | 0, 0, (1 << CHESTS.length) - 1), shards: clamp(source.shards | 0, 0, SHARD_MASK), altitude: clamp(source.altitude | 0, 0, ALTITUDE_MASK), portal: source.portal === true, cleared: source.cleared === true, best: Math.max(0, num(source.best)), trials: [0, 1, 2].map((index) => clamp(source.trials[index] | 0, 0, 3)), discoveries: source.discoveries.filter((value) => COMBO_NAMES.includes(value)).slice(0, COMBO_NAMES.length) };
    }
    countBits(value) { let bits = value | 0; let count = 0; while (bits) { count += bits & 1; bits >>>= 1; } return count; }
    abilityState() { return { dash: !!(this.saveData.shrines & 2), lift: !!(this.saveData.shrines & 4), glide: !!(this.saveData.shrines & 8) }; }
    makePlayer() { return { x: SHRINES[0].x, y: SHRINES[0].y, facing: -Math.PI / 2, direction: 'up', animFrame: 0, animTime: 0, active: 0, charge: 100, attackCd: 0, skillCd: 0, dashCd: 0, dashTime: 0, dashX: 0, dashY: 0, invuln: 0, hurt: 0, attackPose: 0, state: 'idle' }; }
    makeEnemies() {
      return ENEMIES.map((blueprint) => {
        const defeated = blueprint.shrine ? !!(this.saveData.shrines & (1 << blueprint.shrine)) : blueprint.boss && this.saveData.cleared;
        return { ...blueprint, maxHp: blueprint.hp, hp: defeated ? 0 : blueprint.hp, defeated, active: false, status: null, statusTime: 0, attackTimer: 1.2 + blueprint.id * .13, windup: 0, stun: 0 };
      });
    }
    onKitPause() { this.pausedByKit = true; this.actionQueue.length = 0; this.lastKeys = Object.create(null); if (this.gamepad) this.gamepad.buttons = Object.create(null); }

    createTextures() {
      const add = (key, width, height, draw) => { if (this.textures.exists(key)) return; const graphics = this.make.graphics({ add: false }); draw(graphics); graphics.generateTexture(key, width, height); graphics.destroy(); };
      add('shadow', 90, 30, (g) => { g.fillStyle(COLORS.shadow, .45); g.fillEllipse(45, 15, 78, 20); });
      add('bracket', 92, 92, (g) => { g.lineStyle(3, COLORS.gold, .95); g.lineBetween(5, 20, 5, 5); g.lineBetween(5, 5, 20, 5); g.lineBetween(72, 5, 87, 5); g.lineBetween(87, 5, 87, 20); g.lineBetween(5, 72, 5, 87); g.lineBetween(5, 87, 20, 87); g.lineBetween(72, 87, 87, 87); g.lineBetween(87, 87, 87, 72); });
      add('target', 78, 78, (g) => { g.lineStyle(2, COLORS.gold, .95); g.strokeRect(7, 7, 64, 64); g.lineStyle(1, COLORS.paper, .55); g.strokeRect(14, 14, 50, 50); });
      add('chest', 62, 56, (g) => { g.fillStyle(COLORS.gold, .14); g.fillCircle(31, 28, 27); g.fillStyle(0xc98245, 1); g.fillRect(11, 24, 40, 23); g.fillStyle(0xffd88b, 1); g.fillRect(11, 17, 40, 11); g.fillStyle(0x704f38, 1); g.fillRect(29, 25, 5, 14); g.lineStyle(2, COLORS.paper, .7); g.strokeRect(11, 17, 40, 30); });
      add('shard', 54, 68, (g) => { g.fillStyle(COLORS.gold, .16); g.fillCircle(27, 35, 25); g.fillStyle(COLORS.frost, .96); g.fillTriangle(27, 2, 47, 34, 27, 64); g.fillTriangle(27, 2, 7, 34, 27, 64); g.lineStyle(2, COLORS.paper, .85); g.lineBetween(27, 2, 27, 64); });
      add('puzzle', 88, 88, (g) => { g.fillStyle(COLORS.shadow, .38); g.fillCircle(44, 47, 37); g.lineStyle(3, COLORS.gold, .85); g.strokeCircle(44, 44, 30); g.lineStyle(2, COLORS.paper, .72); g.lineBetween(44, 17, 44, 71); g.lineBetween(17, 44, 71, 44); g.fillCircle(44, 44, 7); });
      add('portal', 184, 184, (g) => { g.fillStyle(COLORS.violet, .12); g.fillCircle(92, 92, 82); g.lineStyle(7, COLORS.gold, .76); g.strokeCircle(92, 92, 67); g.lineStyle(3, COLORS.frost, .82); g.strokeCircle(92, 92, 47); g.fillStyle(COLORS.ink, .9); g.fillCircle(92, 92, 35); g.fillStyle(COLORS.paper, .96); g.fillTriangle(92, 40, 111, 83, 92, 132); g.fillTriangle(92, 40, 73, 83, 92, 132); });
      add('shrine', 152, 126, (g) => { g.fillStyle(0x0a1d2b, .52); g.fillEllipse(76, 83, 122, 32); g.lineStyle(8, COLORS.moss, .86); g.strokeCircle(76, 72, 49); g.lineStyle(3, COLORS.paper, .64); g.strokeCircle(76, 72, 28); g.fillStyle(COLORS.frost, .95); g.fillTriangle(76, 8, 100, 63, 76, 106); g.fillTriangle(76, 8, 52, 63, 76, 106); });
      add('gate', 150, 150, (g) => { g.fillStyle(COLORS.shadow, .35); g.fillRect(4, 4, 142, 142); g.lineStyle(4, COLORS.wet, .9); g.strokeRect(12, 12, 126, 126); for (let i = 0; i < 4; i += 1) g.lineBetween(25 + i * 28, 20, 25 + i * 28, 130); });
      add('telegraph', 142, 142, (g) => { g.lineStyle(4, COLORS.coral, .72); g.strokeCircle(71, 71, 55); g.lineStyle(2, COLORS.coral, .35); g.strokeCircle(71, 71, 35); });
      add('fx-spark', 30, 30, (g) => { g.fillStyle(COLORS.spark, .98); g.fillTriangle(15, 1, 22, 12, 29, 15); g.fillTriangle(29, 15, 18, 22, 15, 29); g.fillTriangle(15, 29, 8, 18, 1, 15); g.fillTriangle(1, 15, 12, 8, 15, 1); });
      add('fx-frost', 32, 32, (g) => { g.lineStyle(3, COLORS.frost, .96); g.lineBetween(16, 1, 16, 31); g.lineBetween(1, 16, 31, 16); g.lineBetween(5, 5, 27, 27); g.lineBetween(27, 5, 5, 27); });
      add('fx-ember', 32, 38, (g) => { g.fillStyle(COLORS.ember, .96); g.fillTriangle(16, 1, 30, 23, 19, 37); g.fillTriangle(16, 10, 4, 28, 13, 36); g.fillStyle(0xffedac, .9); g.fillTriangle(17, 13, 23, 25, 16, 32); });
      add('fx-wet', 30, 38, (g) => { g.fillStyle(COLORS.wet, .94); g.fillTriangle(15, 1, 29, 21, 15, 37); g.fillTriangle(15, 1, 1, 21, 15, 37); g.lineStyle(2, 0xc9fbff, .85); g.strokeCircle(15, 20, 8); });
      add('fx-strike', 26, 26, (g) => { g.lineStyle(4, COLORS.strike, .98); g.lineBetween(3, 23, 23, 3); g.lineStyle(2, COLORS.paper, .6); g.lineBetween(5, 5, 21, 21); });
      add('fx-combo', 76, 76, (g) => { g.lineStyle(4, COLORS.gold, .95); g.strokeCircle(38, 38, 29); g.lineStyle(2, COLORS.paper, .76); g.lineBetween(20, 38, 56, 38); g.lineBetween(38, 20, 38, 56); });
      add('fx-dash', 44, 30, (g) => { g.lineStyle(4, COLORS.wet, .94); g.lineBetween(3, 15, 40, 15); g.lineBetween(14, 5, 4, 15); g.lineBetween(14, 25, 4, 15); });
      add('fx-heal', 34, 34, (g) => { g.fillStyle(COLORS.moss, .95); g.fillRect(13, 3, 8, 28); g.fillRect(3, 13, 28, 8); });
      add('fx-wave', 56, 16, (g) => { g.lineStyle(2, 0x9ce9de, .5); g.lineBetween(2, 9, 13, 4); g.lineBetween(13, 4, 25, 10); g.lineBetween(25, 10, 38, 4); g.lineBetween(38, 4, 53, 9); });
      add('fx-dust', 28, 18, (g) => { g.fillStyle(COLORS.paper, .5); g.fillEllipse(7, 9, 8, 5); g.fillEllipse(16, 6, 7, 4); g.fillEllipse(23, 11, 6, 3); });
      add('fx-leaf', 24, 30, (g) => { g.fillStyle(COLORS.moss, .7); g.fillTriangle(12, 1, 22, 22, 3, 17); g.lineStyle(2, COLORS.paper, .36); g.lineBetween(12, 3, 11, 22); });
      ['down', 'up', 'side'].forEach((direction) => {
        ['idle', 'move', 'attack', 'skill', 'hurt'].forEach((state) => {
          [0, 1, 2].forEach((frame) => {
            PARTY.forEach((member, index) => add(`hero-${index}-${direction}-${state}-${frame}`, 104, 116, (g) => this.drawHero(g, member, index, state, frame, direction)));
          });
        });
      });
      ['mote', 'briar', 'sentinel', 'guardian', 'boss'].forEach((family) => add(`enemy-${family}`, family === 'boss' ? 150 : 104, family === 'boss' ? 158 : 110, (g) => this.drawEnemy(g, family)));
    }
    drawHero(g, member, index, state, frame, direction) {
      const bob = state === 'move' ? [0, 5, 1][frame] : state === 'idle' ? [0, 1, 0][frame] : 0; const stride = state === 'move' ? [-4, 5, -2][frame] : 0;
      const hurt = state === 'hurt'; const activeColor = hurt ? 0xffffff : member.color; const lean = state === 'attack' || state === 'skill' ? 8 : 0; const rear = direction === 'up'; const side = direction === 'side';
      g.fillStyle(COLORS.shadow, .38); g.fillEllipse(52, 99, 66, 18); g.fillStyle(activeColor, .98); g.fillTriangle(52, 16 + bob, 82 + stride, 61, 66, 91); g.fillTriangle(52, 16 + bob, 22 - stride, 61, 38, 91);
      g.fillStyle(hurt ? 0xffb5a9 : 0x172b3c, 1); g.fillCircle(52 + lean, 31 + bob, 19); if (!rear) { g.fillStyle(COLORS.paper, .96); g.fillCircle(45 + lean, 29 + bob, 3); g.fillCircle(59 + lean, 29 + bob, 3); } else { g.lineStyle(4, activeColor, .8); g.lineBetween(39, 20 + bob, 65, 20 + bob); }
      g.fillStyle(activeColor, 1); g.fillRect(35 + lean, 48 + bob, 34, 31); g.fillStyle(COLORS.ink, .82); g.fillRect(46 + lean, 57 + bob, 13, 5);
      g.lineStyle(state === 'skill' ? 7 : 4, state === 'skill' ? COLORS.gold : activeColor, .96);
      if (index === 0) g.lineBetween(69 + lean, 57 + bob, state === 'attack' || state === 'skill' ? 99 + lean : (side ? 85 : 69), side ? 29 + bob : 22 + bob);
      if (index === 1) g.strokeCircle(79 + lean, 52 + bob, state === 'attack' || state === 'skill' ? 20 : 13);
      if (index === 2) { g.lineBetween(70 + lean, 58 + bob, 81 + lean, 86); g.fillStyle(COLORS.spark, .96); g.fillTriangle(80 + lean, 10 + bob, 90 + lean, 29 + bob, 72 + lean, 29 + bob); }
      if (state === 'attack') { g.lineStyle(3, COLORS.paper, .9); g.lineBetween(19 + stride, 17 + bob, 34, 31 + bob); g.lineBetween(85 - stride, 17 + bob, 70, 31 + bob); }
      if (state === 'skill') { g.lineStyle(3, COLORS.gold, .86); g.strokeCircle(52, 54 + bob, 43); }
      if (hurt) { g.lineStyle(4, COLORS.coral, .96); g.lineBetween(18, 20, 86, 91); g.lineBetween(86, 20, 18, 91); }
    }
    drawEnemy(g, family) {
      const data = { mote: { color: 0x6cc9cb, radius: 21, cx: 52, cy: 54 }, briar: { color: 0xb5d26a, radius: 24, cx: 52, cy: 54 }, sentinel: { color: 0xd78874, radius: 29, cx: 52, cy: 54 }, guardian: { color: 0x7899df, radius: 37, cx: 52, cy: 54 }, boss: { color: 0xa072bd, radius: 48, cx: 75, cy: 78 } }[family] || { color: 0x6cc9cb, radius: 21, cx: 52, cy: 54 };
      g.fillStyle(COLORS.shadow, .42); g.fillEllipse(data.cx, data.cy + data.radius + 20, data.radius * 2.3, 18); g.fillStyle(data.color, .98); g.fillTriangle(data.cx, data.cy - data.radius - 19, data.cx + data.radius + 8, data.cy + data.radius, data.cx - data.radius - 8, data.cy + data.radius); g.fillStyle(0x1a263d, .98); g.fillCircle(data.cx, data.cy, data.radius); g.fillStyle(data.color, .95); g.fillCircle(data.cx - data.radius * .32, data.cy - 4, 5); g.fillCircle(data.cx + data.radius * .32, data.cy - 4, 5); g.lineStyle(family === 'boss' ? 5 : 3, family === 'boss' ? COLORS.gold : COLORS.coral, .9); g.strokeRect(data.cx - data.radius - 8, data.cy - data.radius - 8, (data.radius + 8) * 2, (data.radius + 8) * 2); if (family === 'guardian') { g.lineStyle(4, COLORS.frost, .8); g.lineBetween(data.cx - 35, data.cy + 34, data.cx, data.cy + 8); g.lineBetween(data.cx, data.cy + 8, data.cx + 35, data.cy + 34); } if (family === 'boss') { g.lineStyle(4, COLORS.gold, .8); g.lineBetween(data.cx - 42, data.cy - 43, data.cx, data.cy - 63); g.lineBetween(data.cx, data.cy - 63, data.cx + 42, data.cy - 43); }
    }

    createWorld() {
      const g = this.make.graphics({ add: false });
      g.fillStyle(COLORS.ink, 1); g.fillRect(0, 0, WORLD.w, WORLD.h);
      const palettes = [[COLORS.meadow, COLORS.meadowDeep, 0x78bd82, 0x37735d], [COLORS.lake, COLORS.lakeDeep, 0x56b5b6, 0x255e7d], [COLORS.ruin, COLORS.ruinDeep, 0x817fa5, 0x474765], [COLORS.peak, COLORS.peakDeep, 0xb4d6e0, 0x698aa1]];
      const zoneForTile = (x, y) => y < 650 && x > 950 ? 3 : x >= 1450 && y < 1430 ? 2 : x >= 720 && y >= 700 ? 1 : 0;
      const ground = []; const collision = [];
      for (let row = 0; row < MAP_ROWS; row += 1) {
        const groundRow = []; const collisionRow = [];
        for (let col = 0; col < MAP_COLS; col += 1) {
          const zoneIndex = zoneForTile(col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2); const variant = (col * 3 + row * 5) % 4; groundRow.push(zoneIndex * 4 + variant + 1);
          const blockedTile = TERRAIN_BLOCKS.some((block) => block.x < col * TILE_SIZE + TILE_SIZE && block.x + block.w > col * TILE_SIZE && block.y < row * TILE_SIZE + TILE_SIZE && block.y + block.h > row * TILE_SIZE); collisionRow.push(blockedTile ? 1 : 0);
        }
        ground.push(groundRow); collision.push(collisionRow);
      }
      const atlas = this.make.graphics({ add: false });
      palettes.forEach((palette, zoneIndex) => [0, 1, 2, 3].forEach((variant) => { const x = (zoneIndex * 4 + variant) * TILE_SIZE; atlas.fillStyle(palette[variant === 0 ? 0 : variant === 1 ? 2 : variant === 2 ? 1 : 3], 1); atlas.fillRect(x, 0, TILE_SIZE, TILE_SIZE); atlas.fillStyle(0xffffff, .07); atlas.fillRect(x + 6, 8 + (variant * 7) % 20, TILE_SIZE - 12, 3); atlas.fillStyle(palette[1], .22); atlas.fillRect(x + 9, TILE_SIZE - 15 - variant * 2, TILE_SIZE - 18, 4); }));
      atlas.generateTexture('terrain-tiles', TILE_SIZE * 16, TILE_SIZE); atlas.destroy();
      this.tileMapData = { tileSize: TILE_SIZE, width: MAP_COLS, height: MAP_ROWS, layers: { ground, collision } };
      this.tilemap = this.make.tilemap({ data: ground, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
      this.tileset = this.tilemap.addTilesetImage('terrain-tiles', 'terrain-tiles', TILE_SIZE, TILE_SIZE, 0, 0);
      this.groundLayer = this.tilemap.createLayer(0, this.tileset, 0, 0).setDepth(0);
      this.collisionMap = this.make.tilemap({ data: collision, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
      this.collisionTileset = this.collisionMap.addTilesetImage('terrain-tiles', 'terrain-tiles', TILE_SIZE, TILE_SIZE, 0, 0);
      this.collisionLayer = this.collisionMap.createLayer(0, this.collisionTileset, 0, 0).setVisible(false); this.collisionLayer.setCollision(1);
      g.fillStyle(0x1c6d83, .92); g.fillEllipse(1165, 1215, 660, 390); g.fillStyle(0x66cbd1, .22); g.fillEllipse(1165, 1215, 510, 250); for (let i = 0; i < 27; i += 1) { const x = 860 + (i * 139) % 600; const y = 1060 + (i * 71) % 300; g.lineStyle(3, 0xb8f3e8, .28); g.lineBetween(x, y, x + 34, y + 8); }
      g.fillStyle(0x214f48, .9); for (let i = 0; i < 42; i += 1) { const x = 105 + (i * 171) % 790; const y = 1015 + (i * 97) % 670; g.fillCircle(x, y, 6 + (i % 3) * 3); g.fillTriangle(x, y - 25, x - 12, y + 7, x + 12, y + 7); }
      g.fillStyle(0x292d49, .94); for (let i = 0; i < 19; i += 1) { const x = 1510 + (i * 187) % 950; const y = 470 + (i * 113) % 740; g.fillRect(x, y, 48, 34); g.fillRect(x + 10, y - 18, 28, 20); }
      g.fillStyle(0xd8eef4, .16); for (let i = 0; i < 33; i += 1) { const x = 1020 + (i * 179) % 1080; const y = 42 + (i * 83) % 500; g.fillTriangle(x, y, x + 30, y + 45, x - 21, y + 43); }
      this.drawLandmarks(g); g.generateTexture('vale-details', WORLD.w, WORLD.h); g.destroy();
      this.worldImage = this.add.image(WORLD.w / 2, WORLD.h / 2, 'vale-details').setDepth(1);
      this.gateViews = GATES.map((gate) => { const field = this.add.rectangle(gate.x + gate.w / 2, gate.y + gate.h / 2, gate.w, gate.h, gate.color, .1).setStrokeStyle(4, gate.color, .82).setDepth(3); const seam = this.add.rectangle(gate.x + gate.w / 2, gate.y + gate.h / 2, Math.max(8, gate.w - 16), Math.max(8, gate.h - 16), gate.color, .03).setStrokeStyle(1, COLORS.paper, .4).setDepth(3); return { field, seam }; });
      this.shrineViews = SHRINES.map((shrine) => this.add.image(shrine.x, shrine.y, 'shrine').setTint(shrine.color).setDepth(4).setAlpha(.76));
      this.shardViews = SHARDS.map((shard) => this.add.image(shard.x, shard.y - 6, 'shard').setTint(COLORS.gold).setDepth(5));
      this.puzzleViews = ALTITUDE_PUZZLES.map((puzzle) => this.add.image(puzzle.x, puzzle.y, 'puzzle').setTint(puzzle.color).setDepth(5));
      this.portalView = this.add.image(PORTAL.x, PORTAL.y, 'portal').setDepth(5).setAlpha(.45);
    }
    drawLandmarks(g) {
      g.fillStyle(0x1e463e, 1); g.fillCircle(410, 1470, 110); g.lineStyle(12, 0x9ee6af, .9); g.strokeCircle(410, 1470, 76); g.lineStyle(3, COLORS.paper, .55); g.strokeCircle(410, 1470, 40); g.fillStyle(0x8be1ca, .95); g.fillTriangle(410, 1364, 437, 1448, 410, 1518); g.fillTriangle(410, 1364, 383, 1448, 410, 1518);
      g.fillStyle(0x73d8d0, .75); g.fillEllipse(1040, 1210, 190, 70); g.lineStyle(8, 0xb8f3e8, .9); g.strokeEllipse(1040, 1210, 122, 44); g.fillStyle(COLORS.gold, .95); g.fillTriangle(1040, 1130, 1073, 1197, 1040, 1262); g.fillTriangle(1040, 1130, 1007, 1197, 1040, 1262);
      g.fillStyle(0x262c45, .95); g.fillRect(1810, 730, 180, 18); g.fillRect(1830, 580, 34, 168); g.fillRect(1970, 580, 34, 168); g.fillTriangle(1830, 580, 1970, 580, 1900, 495); g.lineStyle(5, COLORS.violet, .6); g.strokeRect(1844, 648, 148, 82);
      g.fillStyle(0x324a67, .95); g.fillCircle(1600, 385, 104); g.fillStyle(0x87c9df, .86); g.fillTriangle(1600, 245, 1662, 348, 1600, 488); g.fillTriangle(1600, 245, 1538, 348, 1600, 488); g.lineStyle(9, COLORS.gold, .76); g.strokeCircle(1600, 385, 78);
      g.fillStyle(0x322d5a, .95); g.fillTriangle(1600, 16, 1740, 205, 1460, 205); g.fillStyle(0xe3a6ef, .96); g.fillTriangle(1600, 48, 1644, 174, 1600, 214); g.fillTriangle(1600, 48, 1556, 174, 1600, 214);
      g.fillStyle(0x993f42, .42); g.fillCircle(570, 1240, 92); g.fillCircle(720, 1510, 76); g.fillStyle(0xffb06b, .78); g.fillCircle(570, 1240, 17); g.fillCircle(720, 1510, 14);
      g.fillStyle(0xff875e, .3); g.fillCircle(2220, 900, 105); g.fillCircle(2380, 1040, 72); g.fillStyle(0xffd17a, .72); g.fillCircle(2220, 900, 16); g.fillCircle(2380, 1040, 13);
      g.fillStyle(0xc2edf4, .24); for (let i = 0; i < 16; i += 1) { const x = 1150 + (i * 71) % 900; const y = 100 + (i * 37) % 390; g.fillTriangle(x, y, x + 16, y + 32, x - 16, y + 32); }
      g.fillStyle(COLORS.gold, .2); g.fillCircle(1600, 100, 90); g.fillStyle(0xeac7ff, .96); g.fillTriangle(1600, 18, 1644, 88, 1600, 154); g.fillTriangle(1600, 18, 1556, 88, 1600, 154); g.lineStyle(5, COLORS.gold, .9); g.strokeCircle(1600, 100, 55);
    }

    createViews() {
      this.playerView = { shadow: this.add.image(0, 0, 'shadow').setDepth(8).setScale(.7, .45), sprite: this.add.sprite(0, 0, 'hero-0-up-idle-0').setDepth(12).setScale(.78), bracket: this.add.image(0, 0, 'bracket').setDepth(13).setScale(.76) };
      this.enemyViews = this.enemies.map((enemy) => ({ shadow: this.add.image(0, 0, 'shadow').setDepth(8), sprite: this.add.sprite(0, 0, this.enemyTexture(enemy.family)).setDepth(11), hpBack: this.add.rectangle(0, 0, enemy.boss ? 128 : 72, 8, COLORS.ink, .88).setDepth(14), hpFill: this.add.rectangle(0, 0, enemy.boss ? 124 : 68, 5, COLORS.coral, 1).setOrigin(0, .5).setDepth(15), status: this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: enemy.boss ? '19px' : '16px', fontStyle: '900', color: hex(COLORS.paper), stroke: hex(COLORS.ink), strokeThickness: 4 }).setOrigin(.5).setDepth(16), telegraph: this.add.image(0, 0, 'telegraph').setDepth(7).setVisible(false), target: this.add.image(0, 0, 'target').setDepth(13).setVisible(false) }));
    }
    createPools() {
      this.fxPool = Array.from({ length: 120 }, () => this.add.image(0, 0, 'fx-spark').setDepth(20).setVisible(false));
      this.textPool = Array.from({ length: 20 }, () => this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '16px', fontStyle: '900', color: hex(COLORS.paper), stroke: hex(COLORS.ink), strokeThickness: 5 }).setOrigin(.5).setDepth(30).setVisible(false));
      this.projectilePool = this.renderState.projectiles.map(() => this.add.image(0, 0, 'fx-spark').setDepth(19).setVisible(false));
      this.projectiles = Array.from({ length: this.projectilePool.length }, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0, element: 'frost' }));
      this.fxActive = []; this.textActive = [];
      this.chestViews = CHESTS.map((chest) => this.add.image(chest.x, chest.y, 'chest').setDepth(6).setVisible(!(this.saveData.chests & (1 << chest.id))));
      this.waveViews = Array.from({ length: 18 }, (_, index) => { const wave = this.add.image(820 + (index * 73) % 700, 1060 + (index * 41) % 300, 'fx-wave').setDepth(2).setAlpha(.25); wave.baseX = wave.x; return wave; });
      this.leafViews = Array.from({ length: 24 }, (_, index) => { const leaf = this.add.image(90 + (index * 149) % 800, 980 + (index * 113) % 720, 'fx-leaf').setDepth(2).setAlpha(.3); leaf.baseX = leaf.x; leaf.baseY = leaf.y; return leaf; });
    }
    enemyTexture(family) { return this.textures.exists(`enemy-${family}`) ? `enemy-${family}` : 'enemy-mote'; }
    setCameraZoom() { const width = (this.scale.width || 844) / DPR; const height = (this.scale.height || 390) / DPR; const zoom = clamp(Math.min(width / 1020, height / 570), .62, 1.04) * DPR; this.cameras.main.setZoom(zoom).centerOn(this.player ? this.player.x : WORLD.w / 2, this.player ? this.player.y : WORLD.h / 2); }

    update(_time, delta) {
      if (this.renderShakeX || this.renderShakeY) { this.cameras.main.scrollX -= this.renderShakeX; this.cameras.main.scrollY -= this.renderShakeY; this.renderShakeX = 0; this.renderShakeY = 0; }
      const juice = kit.juice.frame();
      if (!this.pausedByKit && !juice.frozen) { this.accumulator += clamp(num(delta) / 1000, 0, .2); let steps = 0; while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) { this.stepSimulation(FIXED_DT); this.accumulator -= FIXED_DT; steps += 1; } }
      this.updateViews(); this.paintUi();
      if (!this.reducedMotion && kit.juice.enabled) { this.renderShakeX = juice.dx; this.renderShakeY = juice.dy; this.cameras.main.scrollX += this.renderShakeX; this.cameras.main.scrollY += this.renderShakeY; }
    }
    keyEdge(code) { const down = kit.input.keyDown(code); const edge = down && !this.lastKeys[code]; this.lastKeys[code] = down; return edge; }
    readGamepad() {
      if (!navigator.getGamepads) return;
      const pads = navigator.getGamepads(); const pad = (this.gamepad.index !== null && pads[this.gamepad.index]) || Array.from(pads).find((candidate) => candidate && candidate.connected);
      if (!pad) { this.gamepad.connected = false; this.gamepad.index = null; this.gamepad.buttons = Object.create(null); return; }
      this.gamepad.connected = true; this.gamepad.index = pad.index;
      const axis = (value) => Math.abs(value) < .18 ? 0 : clamp((value - Math.sign(value) * .18) / .82, -1, 1);
      this.gamepad.moveX = axis(num(pad.axes[0])); this.gamepad.moveY = axis(num(pad.axes[1]));
      const edge = (index) => { const pressed = !!pad.buttons[index]?.pressed; const rising = pressed && !this.gamepad.buttons[index]; this.gamepad.buttons[index] = pressed; return rising; };
      if (edge(0)) this.actionQueue.push('attack'); if (edge(1)) this.actionQueue.push('skill'); if (edge(2)) this.actionQueue.push('dash'); if (edge(3)) this.actionQueue.push('interact');
      if (edge(4)) this.actionQueue.push('swap-1'); if (edge(5)) this.actionQueue.push('swap-2');
    }
    stepSimulation(dt) {
      this.sim.wallTime += dt; this.renderState.player.flash = Math.max(0, this.renderState.player.flash - dt); this.stepUi(dt); if (this.sim.boundary || this.state.mode === 'victory') { this.stepFx(dt); return; }
      this.sim.time += dt; if (this.sim.respawn > 0) { this.sim.respawn -= dt; if (this.sim.respawn <= 0) this.respawn(); this.stepFx(dt); return; }
      this.stepInput(); this.stepPlayer(dt); this.stepEnemies(dt); this.stepProjectiles(dt); this.stepFx(dt); this.checkPickups(); this.checkShrines(); this.checkZone(); this.checkAltitude(); this.checkPortal(); this.checkHazards(dt); this.player.charge = clamp(this.player.charge + dt * 2.1, 0, 100);
    }
    stepInput() {
      const keyX = (kit.input.keyDown('KeyD') ? 1 : 0) - (kit.input.keyDown('KeyA') ? 1 : 0); const keyY = (kit.input.keyDown('KeyS') ? 1 : 0) - (kit.input.keyDown('KeyW') ? 1 : 0);
      this.readGamepad(); let moveX = keyX; let moveY = keyY; if (this.gamepad.connected && (this.gamepad.moveX || this.gamepad.moveY)) { moveX = this.gamepad.moveX; moveY = this.gamepad.moveY; } for (const pointer of kit.input.pointers.values()) if (pointer.zone === 'stick') { moveX = num(pointer.stickX); moveY = num(pointer.stickY); break; }
      const length = Math.hypot(moveX, moveY); if (length > 1) { moveX /= length; moveY /= length; } this.moveX = clamp(moveX, -1, 1); this.moveY = clamp(moveY, -1, 1); this.moveMag = clamp(Math.hypot(this.moveX, this.moveY), 0, 1);
      if (this.keyEdge('KeyJ')) this.actionQueue.push('attack'); if (this.keyEdge('KeyK')) this.actionQueue.push('skill'); if (this.keyEdge('Space')) this.actionQueue.push('dash'); if (this.keyEdge('KeyE')) this.actionQueue.push('interact'); ['Digit1', 'Digit2', 'Digit3'].forEach((code, index) => { if (this.keyEdge(code)) this.actionQueue.push(`swap-${index}`); });
      while (this.actionQueue.length) { const action = this.actionQueue.shift(); if (action === 'attack') this.attack(); else if (action === 'skill') this.skill(); else if (action === 'dash') this.dash(); else if (action === 'interact') this.interact(); else if (action.startsWith('swap-')) this.swap(Number(action.slice(5))); }
    }
    stepPlayer(dt) {
      this.player.attackCd = Math.max(0, this.player.attackCd - dt); this.player.skillCd = Math.max(0, this.player.skillCd - dt); this.player.dashCd = Math.max(0, this.player.dashCd - dt); this.player.invuln = Math.max(0, this.player.invuln - dt); this.player.hurt = Math.max(0, this.player.hurt - dt); this.player.attackPose = Math.max(0, this.player.attackPose - dt); this.player.dashTime = Math.max(0, this.player.dashTime - dt);
      let dx = this.player.dashTime > 0 ? this.player.dashX : this.moveX; let dy = this.player.dashTime > 0 ? this.player.dashY : this.moveY; const magnitude = Math.hypot(dx, dy); if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
      if (magnitude > .05) { this.player.facing = Math.atan2(dy, dx); this.player.direction = Math.abs(dx) > Math.abs(dy) ? 'side' : dy < 0 ? 'up' : 'down'; this.player.state = 'move'; const speed = this.player.dashTime > 0 ? 680 : (this.sim.playerWet > 0 ? 205 : 260); this.tryMove(dx * speed * dt, dy * speed * dt); if (this.player.dashTime <= 0 && this.sim.time >= this.sim.footstep) { this.sim.footstep = this.sim.time + .22; this.spawnBurst(this.player.x, this.player.y + 28, 'fx-dust', ZONES[this.sim.zone].accent, 3, .34); sfx('footstep', .16); } }
      else this.player.state = this.player.hurt > 0 ? 'hurt' : 'idle';
      this.player.animTime += dt * (magnitude > .05 ? 9 : 3); this.player.animFrame = Math.floor(this.player.animTime) % 3;
      this.sim.playerWet = Math.max(0, this.sim.playerWet - dt);
    }
    tryMove(dx, dy) { const nextX = clamp(this.player.x + dx, 30, WORLD.w - 30); const nextY = clamp(this.player.y + dy, 30, WORLD.h - 30); if (!this.blocked(nextX, this.player.y)) this.player.x = nextX; if (!this.blocked(this.player.x, nextY)) this.player.y = nextY; }
    blocked(x, y) {
      const abilities = this.abilityState(); const radius = 24; for (const block of TERRAIN_BLOCKS) if (x + radius > block.x && x - radius < block.x + block.w && y + radius > block.y && y - radius < block.y + block.h) return true;
      for (const gate of GATES) if (x + radius > gate.x && x - radius < gate.x + gate.w && y + radius > gate.y && y - radius < gate.y + gate.h && !abilities[gate.ability]) { if (this.sim.gatePing <= 0) { this.queueTransient(gate.id === 'dash' ? '✦ DASH REQUIRED' : gate.id === 'lift' ? '⬡ LIFT REQUIRED' : '⌁ GLIDE REQUIRED', gate.color, .85); this.sim.gatePing = 1.1; sfx('gate', .22); } return true; }
      return false;
    }
    stepUi(dt) {
      this.sim.gatePing = Math.max(0, this.sim.gatePing - dt); this.sim.coach = Math.max(0, this.sim.coach - dt); this.sim.dangerSting = Math.max(0, this.sim.dangerSting - dt); this.sim.shardDisplay = Math.min(this.sim.shards, this.sim.shardDisplay + dt * 8);
      if (this.sim.transient) { this.sim.transient.time -= dt; if (this.sim.transient.time <= 0) this.nextTransient(); }
      if (this.sim.boundary) { this.sim.boundary.time -= dt; if (this.sim.boundary.time <= 0) { this.sim.boundary = null; this.lastKeys = Object.create(null); this.gamepad.buttons = Object.create(null); kit.input.clearAll(); this.nextTransient(); } }
      if (this.sim.trial?.finished && this.sim.wallTime >= this.sim.trial.returnAt) this.returnFromTrial();
    }
    checkPickups() {
      CHESTS.forEach((chest) => { if (this.saveData.chests & (1 << chest.id) || dist(this.player.x, this.player.y, chest.x, chest.y) > 70) return; this.saveData.chests |= 1 << chest.id; this.player.charge = clamp(this.player.charge + chest.reward, 0, 100); this.sim.score += 240; this.chestViews[chest.id].setVisible(false); this.save(); this.queueTransient(`◇ CACHE +${chest.reward} CHARGE`, COLORS.gold, 1); sfx('chest', .72); this.spawnPickup(chest.x, chest.y, COLORS.gold, `+${chest.reward}`); });
      SHARDS.forEach((shard) => { if (this.saveData.shards & (1 << shard.id) || dist(this.player.x, this.player.y, shard.x, shard.y) > 64) return; this.saveData.shards |= 1 << shard.id; this.sim.shards = this.countBits(this.saveData.shards); this.sim.score += 520; this.save(); this.queueTransient(`◇ SKYSHARD ${this.sim.shards} / ${SHARDS.length}`, COLORS.gold, 1.15); sfx('secret', .78); this.spawnPickup(shard.x, shard.y, COLORS.gold, `SHARD ${this.sim.shards}`); });
    }
    checkShrines() { SHRINES.forEach((shrine) => { if ((this.saveData.shrines & (1 << shrine.id)) && dist(this.player.x, this.player.y, shrine.x, shrine.y) < 84) { this.player.lastShrine = shrine.id; this.sim.lastShrine = shrine.id; } }); }
    checkZone() {
      const current = ZONES[this.sim.zone] || ZONES.meadow; const insideCurrent = this.contains(current, this.player.x, this.player.y); const candidates = ZONE_ORDER.map((id) => ZONES[id]).filter((zone) => this.contains(zone, this.player.x, this.player.y)); const next = insideCurrent ? current : candidates.sort((a, b) => dist(a.center.x, a.center.y, this.player.x, this.player.y) - dist(b.center.x, b.center.y, this.player.x, this.player.y))[0] || current;
      if (next.id !== this.sim.zone) { this.sim.zone = next.id; this.sim.coach = Math.max(this.sim.coach, 8); this.queueTransient(`${next.name} · ${next.hazard}`, next.accent, 1); kit.audio.music(AUDIO.musicByZone[next.id], 700); sfx('gate', .12); }
    }
    contains(zone, x, y) { return x >= zone.bounds.x && x <= zone.bounds.x + zone.bounds.w && y >= zone.bounds.y && y <= zone.bounds.y + zone.bounds.h; }
    checkAltitude() {
      const tier = this.player.y < 545 ? 'HIGH' : this.player.y < 900 ? 'MID' : 'LOWLAND'; if (tier !== this.sim.altitudeTier) { this.sim.altitudeTier = tier; this.sim.coach = Math.max(this.sim.coach, 6); this.queueTransient(`${tier} TIER · ${tier === 'HIGH' ? 'FROST WIND' : tier === 'MID' ? 'BROKEN STAIRS' : 'ROOTWELL ROUTE'}`, tier === 'HIGH' ? COLORS.frost : tier === 'MID' ? COLORS.violet : COLORS.moss, 1); }
    }
    checkPortal() {
      if (dist(this.player.x, this.player.y, PORTAL.x, PORTAL.y) > 118) return; if (this.saveData.portal) return;
      const ready = this.sim.shards >= SHARDS.length && this.saveData.altitude === ALTITUDE_MASK && this.abilityState().glide;
      if (!ready) return;
      this.saveData.portal = true; this.save(); this.state.portal = true; sfx('portal', 1); this.queueTransient('PORTAL AWAKENED · HIGH SHARD AHEAD', COLORS.gold, 1.2); this.spawnPickup(PORTAL.x, PORTAL.y, COLORS.violet, 'PORTAL OPEN'); this.showBoundary('PORTAL AWAKENED', 'The summit route is open. Face the guardian beyond the high shard.', 2.1);
    }
    checkHazards(dt) {
      if (this.sim.zone === 'meadow' && (dist(this.player.x, this.player.y, 570, 1240) < 92 || dist(this.player.x, this.player.y, 720, 1510) < 76)) this.damagePlayer(5 * dt, 'thorn');
      if (this.sim.zone === 'lake' && dist(this.player.x, this.player.y, 1165, 1215) < 310) { this.sim.playerWet = 1.2; this.queueElementHint('wet', .7); }
      if (this.sim.zone === 'ruin' && (dist(this.player.x, this.player.y, 2220, 900) < 106 || dist(this.player.x, this.player.y, 2380, 1040) < 74)) this.damagePlayer(7 * dt, 'ember');
      if (this.sim.zone === 'peak' && this.player.y < 300 && !this.abilityState().glide) { this.damagePlayer(4 * dt, 'frost'); this.player.x = Math.max(this.player.x, 1420); }
    }

    stepEnemies(dt) {
      let nearest = null; let nearestDistance = 280;
      this.enemies.forEach((enemy, index) => {
        const view = this.renderState.enemies[index]; view.visible = false; view.target = false; if (view.flash > 0) view.flash = Math.max(0, view.flash - dt); if (enemy.defeated || (enemy.boss && !this.saveData.portal) || (this.sim.trial && enemy.id !== this.sim.trial.enemyId) || (this.sim.trial?.finished)) return;
        const distance = dist(this.player.x, this.player.y, enemy.x, enemy.y); const wakeRange = enemy.boss ? 640 : enemy.shrine ? 480 : 360; if (distance < wakeRange) enemy.active = true; if (!enemy.active) return;
        view.visible = true; enemy.statusTime = Math.max(0, enemy.statusTime - dt); enemy.stun = Math.max(0, enemy.stun - dt); if (enemy.statusTime <= 0) enemy.status = null; if (view.flash <= 0) view.flash = 0;
        if (distance < nearestDistance) { nearest = index; nearestDistance = distance; }
        enemy.attackTimer -= dt; enemy.windup = Math.max(0, enemy.windup - dt); if (enemy.stun > 0) return;
        if (distance > 76 && distance < 450) { const dx = (this.player.x - enemy.x) / (distance || 1); const dy = (this.player.y - enemy.y) / (distance || 1); const speed = enemy.boss ? 58 : enemy.shrine ? 78 : 54; enemy.x = clamp(enemy.x + dx * speed * dt, 40, WORLD.w - 40); enemy.y = clamp(enemy.y + dy * speed * dt, 40, WORLD.h - 40); }
        if (enemy.attackTimer <= .55 && distance < 260) enemy.windup = .55;
        if (enemy.attackTimer <= 0) { enemy.attackTimer = enemy.boss ? 1.35 : enemy.shrine ? 1.55 : 1.95; enemy.windup = 0; if (distance < (enemy.boss ? 180 : 94)) this.damagePlayer(enemy.damage, enemy.element); else if (distance < 430) this.spawnProjectile(enemy); }
      });
      if (nearest !== null) this.renderState.enemies[nearest].target = true;
    }
    spawnProjectile(enemy) {
      const slot = this.projectiles.findIndex((projectile) => !projectile.active); if (slot < 0) return; const projectile = this.projectiles[slot]; const distance = dist(this.player.x, this.player.y, enemy.x, enemy.y) || 1; projectile.active = true; projectile.x = enemy.x; projectile.y = enemy.y; projectile.vx = (this.player.x - enemy.x) / distance * 270; projectile.vy = (this.player.y - enemy.y) / distance * 270; projectile.life = 2.2; projectile.damage = enemy.damage * .7; projectile.element = safeElement(enemy.element); this.spawnBurst(enemy.x, enemy.y, `fx-${projectile.element}`, ELEMENTS[projectile.element].color, 3, .45);
    }
    stepProjectiles(dt) { this.projectiles.forEach((projectile, index) => { if (!projectile.active) return; projectile.life -= dt; projectile.x += projectile.vx * dt; projectile.y += projectile.vy * dt; if (projectile.life <= 0 || projectile.x < 0 || projectile.x > WORLD.w || projectile.y < 0 || projectile.y > WORLD.h) projectile.active = false; else if (dist(projectile.x, projectile.y, this.player.x, this.player.y) < 28) { this.damagePlayer(projectile.damage, projectile.element); projectile.active = false; } const view = this.renderState.projectiles[index]; view.visible = projectile.active; }); }
    damagePlayer(amount, _element) {
      if (this.player.invuln > 0 || this.sim.respawn > 0 || this.state.mode === 'victory') return; const member = this.state.party.members[this.player.active]; member.hp = clamp(member.hp - amount, 0, 100); this.player.hurt = .22; this.player.invuln = .48; this.renderState.player.flash = .2; this.spawnBurst(this.player.x, this.player.y, 'fx-strike', COLORS.coral, 6, .52); sfx('hurt', .64); if (member.hp <= 0) { this.run.deaths += 1; const next = this.state.party.members.findIndex((candidate, index) => index !== this.player.active && candidate.hp > 0); if (next >= 0) { this.swap(next, true); return; } this.defeat(); } else this.player.charge = clamp(this.player.charge + 3, 0, 100); }
    defeat() { if (this.sim.respawn > 0) return; this.sim.respawn = 1.1; this.player.invuln = 1.1; this.queueTransient('RETURN TO LAST SHRINE', COLORS.coral, .95); kit.juice.shake(5, 150); }
    respawn() { const shrine = safeShrine(this.sim.lastShrine); this.player.x = shrine.x; this.player.y = shrine.y; this.state.party.members.forEach((member) => { member.hp = 100; }); this.player.charge = clamp(this.player.charge + 28, 0, 100); this.player.invuln = .9; this.enemies.forEach((enemy) => { if (!enemy.shrine && !enemy.boss) enemy.active = false; }); }

    attack() {
      if (this.sim.respawn > 0 || this.player.attackCd > 0 || this.state.mode === 'victory' || this.sim.trial?.finished) return; const member = PARTY[this.player.active] || PARTY[0]; this.player.attackCd = .28; this.player.attackPose = .2; this.player.state = 'attack'; sfx('attack', .52); const target = this.findTarget(185); if (!target) { this.spawnBurst(this.player.x + Math.cos(this.player.facing) * 62, this.player.y + Math.sin(this.player.facing) * 62, 'fx-strike', member.color, 3, .38); return; } this.applyToEnemy(target, member.element, 24 + this.player.active * 3);
    }
    skill() {
      if (this.sim.respawn > 0 || this.player.skillCd > 0 || this.state.mode === 'victory' || this.sim.trial?.finished) return; if (this.player.charge < 16) { this.queueTransient('✧ 16 CHARGE NEEDED', COLORS.spark, .75); return; }
      const member = PARTY[this.player.active] || PARTY[0]; this.player.charge -= 16; this.player.skillCd = 1.05; this.player.attackPose = .34; this.player.state = 'skill'; sfx('skill', .78); const element = safeElement(member.skill); const target = this.findTarget(this.player.active === 1 ? 300 : 245); this.spawnBurst(this.player.x, this.player.y, `fx-${element}`, ELEMENTS[element].color, 14, .85); if (target) this.applyToEnemy(target, element, this.player.active === 0 ? 38 : 32);
    }
    dash() {
      if (!this.abilityState().dash || this.player.dashCd > 0 || this.sim.respawn > 0 || this.state.mode === 'victory') return; let dx = this.moveX; let dy = this.moveY; if (Math.hypot(dx, dy) < .1) { dx = Math.cos(this.player.facing); dy = Math.sin(this.player.facing); } const magnitude = Math.hypot(dx, dy) || 1; this.player.dashX = dx / magnitude; this.player.dashY = dy / magnitude; this.player.dashTime = .24; this.player.dashCd = .95; this.player.invuln = .36; sfx('skill', .62); this.spawnBurst(this.player.x, this.player.y, 'fx-dash', COLORS.wet, 8, .65);
    }
    interact() {
      if (this.sim.respawn > 0 || this.state.mode === 'victory' || this.sim.trial) return;
      const puzzle = ALTITUDE_PUZZLES.find((candidate) => dist(this.player.x, this.player.y, candidate.x, candidate.y) < 112);
      if (puzzle) {
        if (this.saveData.altitude & (1 << puzzle.id)) { this.queueTransient(`${puzzle.title} · RUNE ALREADY TUNED`, puzzle.color, .8); return; }
        if (!this.abilityState()[puzzle.ability]) { this.queueTransient(`${puzzle.title} · ${puzzle.ability.toUpperCase()} REQUIRED`, puzzle.color, 1); return; }
        this.saveData.altitude |= 1 << puzzle.id; this.save(); this.state.altitude.solved = this.saveData.altitude; sfx('secret', .78); this.spawnPickup(puzzle.x, puzzle.y, puzzle.color, 'RUNE TUNED'); this.showBoundary(`${puzzle.title} TUNED`, `${puzzle.solution} ${this.countBits(this.saveData.altitude)} of ${ALTITUDE_PUZZLES.length} altitude runes tuned.`, 1.8); return;
      }
      if (dist(this.player.x, this.player.y, PORTAL.x, PORTAL.y) < 132) {
        if (this.saveData.portal) { this.queueTransient('PORTAL ACTIVE · HIGH SHARD AHEAD', COLORS.gold, .9); return; }
        this.queueTransient(`PORTAL DORMANT · ${this.sim.shards}/${SHARDS.length} SHARDS · ${this.countBits(this.saveData.altitude)}/${ALTITUDE_PUZZLES.length} RUNES`, COLORS.violet, 1.1); sfx('ui', .3);
      }
    }
    swap(index, automatic = false) {
      if (!PARTY[index] || index === this.player.active || this.state.party.members[index].hp <= 0) return; this.player.active = index; this.state.party.active = index; this.state.elements.applied = PARTY[index].element; this.player.hp = this.state.party.members[index].hp; this.player.attackCd = .08; this.player.skillCd = .2; sfx('swap', .5); this.queueTransient(`${PARTY[index].name} · ${ELEMENTS[PARTY[index].element].mark} ${ELEMENTS[PARTY[index].element].label}`, PARTY[index].color, automatic ? .72 : .9); this.renderState.player.flash = .12;
    }
    findTarget(range) { let best = null; let bestDistance = range; this.enemies.forEach((enemy) => { if (enemy.defeated || !enemy.active || (this.sim.trial && enemy.id !== this.sim.trial.enemyId)) return; const distance = dist(this.player.x, this.player.y, enemy.x, enemy.y); const angle = Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x); const facingDistance = Math.abs(Math.atan2(Math.sin(angle - this.player.facing), Math.cos(angle - this.player.facing))); if (distance < bestDistance && (facingDistance < 1.6 || distance < 90)) { best = enemy; bestDistance = distance; } }); return best; }
    applyToEnemy(enemy, element, damage) {
      if (!enemy || enemy.defeated) return; const targetElement = safeElement(element); const previous = enemy.status; const data = ELEMENTS[targetElement] || ELEMENTS.strike; enemy.status = targetElement; enemy.statusTime = 4.5; const viewIndex = this.enemies.indexOf(enemy); if (viewIndex >= 0) this.renderState.enemies[viewIndex].flash = .16; this.state.elements.applied = targetElement; this.spawnBurst(enemy.x, enemy.y, `fx-${targetElement}`, data.color, 5, .62);
      const combo = this.comboFor(previous, targetElement); if (combo) { enemy.status = null; enemy.statusTime = 0; this.triggerCombo(combo, enemy); enemy.hp = clamp(enemy.hp - combo.damage, 0, enemy.maxHp); } else { enemy.hp = clamp(enemy.hp - damage, 0, enemy.maxHp); this.queueElementHint(targetElement, .7); } this.sim.score += combo ? 210 : 48; if (enemy.hp <= 0) this.defeatEnemy(enemy);
    }
    comboFor(previous, current) {
      const pair = [previous, current].sort().join('+'); if (pair === 'spark+wet') return { name: 'CHAIN SHOCK', mark: '✦', color: COLORS.spark, damage: 54 }; if (pair === 'frost+strike') return { name: 'SHATTER', mark: '❄', color: COLORS.frost, damage: 68 }; if (pair === 'ember+wet') return { name: 'STEAM HEAL', mark: '✹', color: COLORS.ember, damage: 42 }; return null;
    }
    queueElementHint(element, duration) { const data = ELEMENTS[safeElement(element)] || ELEMENTS.strike; this.queueTransient(`${data.mark} ${data.label} APPLIED`, data.color, duration); }
    triggerCombo(combo, enemy) {
      this.state.elements.combo = combo.name; this.state.elements.comboCount += 1; this.state.elements.discovered[combo.name] = true; this.run.comboSet.add(combo.name); this.state.elements.variety = this.run.comboSet.size; this.save(); sfx('combo', .9); kit.juice.hitStop(this.reducedMotion ? 20 : 52); kit.juice.shake(3, 100); this.queueTransient(`${combo.mark} ${combo.name}`, combo.color, 1); this.spawnBurst(enemy.x, enemy.y, 'fx-combo', combo.color, 14, 1.05); if (combo.name === 'STEAM HEAL') { const member = this.state.party.members[this.player.active]; member.hp = clamp(member.hp + 25, 0, 100); this.player.charge = clamp(this.player.charge + 20, 0, 100); this.spawnText(this.player.x, this.player.y - 62, '+25', COLORS.moss); this.spawnBurst(this.player.x, this.player.y, 'fx-heal', COLORS.moss, 5, .7); }
    }
    defeatEnemy(enemy) {
      enemy.defeated = true; enemy.hp = 0; enemy.active = false; this.sim.score += enemy.boss ? 2600 : enemy.shrine ? 700 : 140; this.spawnBurst(enemy.x, enemy.y, enemy.boss ? 'fx-combo' : 'fx-strike', enemy.boss ? COLORS.gold : COLORS.paper, enemy.boss ? 32 : 11, enemy.boss ? 1.6 : .8); sfx(enemy.boss ? 'boss' : 'hurt', enemy.boss ? 1 : .65);
      if (this.sim.trial) { this.finishTrial(); return; } if (enemy.shrine) this.unlockShrine(enemy.shrine); if (enemy.boss && this.saveData.portal) this.clearValley();
    }
    unlockShrine(id) {
      const shrine = safeShrine(id); const wasUnlocked = !!(this.saveData.shrines & (1 << id)); this.saveData.shrines |= 1 << id; this.player.lastShrine = id; this.sim.lastShrine = id; this.save(); this.state.abilities = this.abilityState(); if (!wasUnlocked && shrine.ability) { sfx('shrine', 1); this.showBoundary(`${shrine.ability.toUpperCase()} UNLOCKED`, `${shrine.name} grants ${shrine.gift}.`, 2.2); this.spawnBurst(shrine.x, shrine.y, 'fx-combo', shrine.color, 24, 1.35); }
    }
    clearValley() { this.saveData.cleared = true; this.saveData.best = this.saveData.best ? Math.min(this.saveData.best, this.sim.time) : this.sim.time; this.save(); sfx('boss', 1); this.state.mode = 'victory'; this.showBoundary('VALLEY CLEAR', `High shard secured · ${this.formatTime(this.sim.time)} · ${this.medalForRun()}`, 3.6); }
    medalForRun() { const variety = this.run.comboSet.size; if (this.run.deaths === 0 && variety >= 3 && this.sim.time < 240) return 'GOLD RUN'; if (variety >= 2 && this.sim.time < 330) return 'SILVER RUN'; return 'BRONZE RUN'; }

    canTrial(id) { const trial = safeTrial(id); return !!this.abilityState()[safeShrine(trial.shrine).ability || 'dash']; }
    startTrial(id) {
      const trial = safeTrial(id); if (!this.canTrial(trial.id)) return; const shrine = safeShrine(trial.shrine); const enemy = this.enemies.find((candidate) => candidate.shrine === trial.shrine); if (!enemy) return; this.sim.trial = { ...trial, enemyId: enemy.id, started: this.sim.time, finished: false, returnAt: 0 }; this.state.mode = 'trial'; this.state.trial.active = trial.id; this.player.x = shrine.x; this.player.y = shrine.y + 138; this.state.party.members.forEach((member) => { member.hp = 100; }); this.player.active = 0; this.state.party.active = 0; this.player.charge = 100; this.run.deaths = 0; this.run.comboSet.clear(); this.state.elements.comboCount = 0; this.state.elements.variety = 0; enemy.defeated = false; enemy.hp = enemy.maxHp; enemy.active = true; enemy.x = shrine.x; enemy.y = shrine.y; this.showBoundary(`TRIAL ${trial.id}`, `${trial.title} · time, variety, no death`, 1.35); sfx('trial', .7);
    }
    finishTrial() {
      if (!this.sim.trial || this.sim.trial.finished) return; const trial = this.sim.trial; const elapsed = this.sim.time - trial.started; const variety = this.run.comboSet.size; const medal = elapsed <= trial.gold && variety >= trial.combos && this.run.deaths === 0 ? 3 : elapsed <= trial.silver && variety >= 2 ? 2 : elapsed <= trial.bronze ? 1 : 0; this.saveData.trials[trial.id - 1] = Math.max(this.saveData.trials[trial.id - 1] || 0, medal); this.save(); this.state.trial.medals = this.saveData.trials.slice(0, 3); trial.finished = true; trial.returnAt = this.sim.wallTime + 2.3; this.showBoundary(`TRIAL ${medal === 3 ? 'GOLD' : medal === 2 ? 'SILVER' : medal === 1 ? 'BRONZE' : 'UNRANKED'}`, `${trial.title} · ${this.formatTime(elapsed)} · ${variety} combo types`, 2.3); sfx('medal', .9);
    }
    returnFromTrial() { const trial = this.sim.trial; const enemy = trial && this.enemies[trial.enemyId]; if (enemy) { enemy.defeated = !!(this.saveData.shrines & (1 << enemy.shrine)); enemy.hp = enemy.defeated ? 0 : enemy.maxHp; enemy.active = false; const shrine = safeShrine(trial.shrine); enemy.x = shrine.x; enemy.y = shrine.y; } this.sim.trial = null; this.state.trial.active = null; this.state.mode = 'explore'; this.player.x = SHRINES[0].x; this.player.y = SHRINES[0].y; this.sim.zone = 'meadow'; this.player.charge = 100; this.run.comboSet.clear(); }

    applyState() {
      this.sim.shards = this.countBits(this.saveData.shards); this.sim.shardDisplay = this.sim.shards; this.state.shards = this.sim.shards; this.state.portal = !!this.saveData.portal; this.state.abilities = this.abilityState(); this.state.altitude = { tier: this.sim.altitudeTier, solved: this.saveData.altitude }; this.state.elements.discovered = Object.fromEntries(this.saveData.discoveries.map((name) => [name, true])); this.state.elements.variety = Object.keys(this.state.elements.discovered).length; this.createRuntimeViews();
    }

    forceZone(value) { const zone = safeZone(value); this.sim.zone = zone.id; this.state.zone = zone.id; this.sim.trial = null; this.state.trial.active = null; this.state.mode = 'explore'; this.player.x = zone.start.x; this.player.y = zone.start.y; this.player.invuln = .6; this.cameras.main.centerOn(this.player.x, this.player.y); this.queueTransient(`${zone.name} · ${zone.landmark}`, zone.accent, 1); }
    forceShrine(value) { const shrine = safeShrine(value); this.sim.zone = shrine.zone; this.state.zone = shrine.zone; this.sim.trial = null; this.state.trial.active = null; this.state.mode = 'explore'; this.player.x = shrine.x; this.player.y = shrine.y + 112; this.player.lastShrine = shrine.id; this.sim.lastShrine = shrine.id; const guardian = this.enemies.find((enemy) => enemy.shrine === shrine.id); if (guardian && shrine.id > 0) { guardian.defeated = false; guardian.hp = guardian.maxHp; guardian.active = true; } this.queueTransient(`${shrine.name} · GUARDIAN RANGE`, shrine.color, 1); this.cameras.main.centerOn(this.player.x, this.player.y); }
    save() { kit.save.set({ version: SAVE_VERSION, shrines: this.saveData.shrines & 15, chests: this.saveData.chests & ((1 << CHESTS.length) - 1), shards: this.saveData.shards & SHARD_MASK, altitude: this.saveData.altitude & ALTITUDE_MASK, portal: this.saveData.portal === true, cleared: this.saveData.cleared === true, best: num(this.saveData.best), trials: this.saveData.trials.slice(0, 3).map((value) => clamp(Number(value) || 0, 0, 3)), discoveries: Object.keys(this.state.elements.discovered).filter((name) => COMBO_NAMES.includes(name)).slice(0, COMBO_NAMES.length) }); }
    restartRun() { this.saveData = this.normalizeSave(kit.save.get(cloneDefault())); this.player = this.makePlayer(); this.enemies = this.makeEnemies(); this.run = { deaths: 0, comboSet: new Set() }; this.sim = { time: 0, wallTime: 0, score: 0, shards: this.countBits(this.saveData.shards), shardDisplay: this.countBits(this.saveData.shards), altitudeTier: 'LOWLAND', zone: 'meadow', lastShrine: 0, gatePing: 0, coach: 18, footstep: 0, dangerSting: 0, transient: null, transientQueue: [], boundary: null, trial: null, respawn: 0, playerWet: 0 }; this.state.mode = 'explore'; this.state.zone = 'meadow'; this.state.party.active = 0; this.state.party.members.forEach((member) => { member.hp = 100; }); this.state.elements = { applied: null, combo: null, comboCount: 0, variety: 0, charge: 100, discovered: {} }; this.projectiles.forEach((projectile) => { projectile.active = false; }); this.fxActive.forEach((particle) => particle.sprite.setVisible(false)); this.textActive.forEach((particle) => particle.object.setVisible(false)); this.fxActive.length = 0; this.textActive.length = 0; refs.banner.classList.remove('interactive'); this.applyState(); this.queueTransient('RUN RESET', COLORS.gold, .8); }
    createRuntimeViews() { this.enemyViews.forEach((view, index) => { const enemy = this.enemies[index]; view.sprite.setTexture(this.enemyTexture(enemy.family)); }); this.chestViews.forEach((view, index) => view.setVisible(!(this.saveData.chests & (1 << index)))); this.shardViews.forEach((view, index) => view.setVisible(!(this.saveData.shards & (1 << index)))); this.puzzleViews.forEach((view, index) => view.setAlpha(this.saveData.altitude & (1 << index) ? .22 : .9)); this.portalView.setAlpha(this.saveData.portal ? .95 : .42); this.renderState.enemies = this.enemies.map(() => ({ visible: false, flash: 0, target: false })); }

    queueTransient(text, color, duration) { const entry = { text, color: num(color, COLORS.paper), time: duration }; if (this.sim.boundary) { this.sim.transientQueue.push(entry); if (this.sim.transientQueue.length > 5) this.sim.transientQueue.shift(); return; } if (this.sim.transient && this.sim.transient.text === text) { this.sim.transient.time = duration; return; } if (this.sim.transient) { this.sim.transientQueue.push(entry); if (this.sim.transientQueue.length > 5) this.sim.transientQueue.shift(); } else this.sim.transient = entry; }
    nextTransient() { this.sim.transient = this.sim.transientQueue.shift() || null; }
    showBoundary(title, copy, duration) { this.actionQueue.length = 0; this.lastKeys = Object.create(null); if (this.gamepad) this.gamepad.buttons = Object.create(null); kit.input.clearAll(); this.sim.boundary = { title, copy, time: duration }; this.sim.transient = null; }
    spawnBurst(x, y, texture, tint, count, life) { const key = this.textures.exists(texture) ? texture : 'fx-spark'; for (let i = 0; i < count; i += 1) { const sprite = this.fxPool.find((item) => !item.visible); if (!sprite) break; const angle = (i / Math.max(1, count)) * TAU + this.sim.time * 2; const speed = 24 + (i % 5) * 17; sprite.setTexture(key).setTint(tint).setPosition(x, y).setScale(.48 + (i % 3) * .13).setAlpha(.96).setVisible(true); this.fxActive.push({ sprite, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life }); } }
    spawnPickup(x, y, tint, label) { const sprite = this.fxPool.find((item) => !item.visible); if (sprite) { sprite.setTexture('fx-combo').setTint(tint).setPosition(x, y).setScale(.25).setAlpha(.95).setVisible(true); this.fxActive.push({ sprite, x, y, vx: 0, vy: -22, life: .72, maxLife: .72, pickup: true, startScale: .25, endScale: 1.45 }); } this.spawnBurst(x, y, 'fx-spark', tint, 10, .72); this.spawnText(x, y - 44, label, tint); }
    spawnText(x, y, value, tint) { const object = this.textPool.find((item) => !item.visible); if (!object) return; object.setText(value).setColor(hex(tint)).setPosition(x, y).setAlpha(1).setVisible(true); this.textActive.push({ object, x, y, life: .8, maxLife: .8 }); }
    stepFx(dt) { for (let index = this.fxActive.length - 1; index >= 0; index -= 1) { const particle = this.fxActive[index]; particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vx *= .965; particle.vy *= .965; const progress = clamp(1 - particle.life / particle.maxLife, 0, 1); const easeOut = 1 - (1 - progress) * (1 - progress); particle.sprite.setPosition(particle.x, particle.y).setAlpha(clamp(particle.life / particle.maxLife, 0, 1)); if (particle.pickup) particle.sprite.setScale(particle.startScale + (particle.endScale - particle.startScale) * easeOut); if (particle.life <= 0) { particle.sprite.setVisible(false); this.fxActive.splice(index, 1); } } for (let index = this.textActive.length - 1; index >= 0; index -= 1) { const particle = this.textActive[index]; particle.life -= dt; particle.y -= 26 * dt; particle.object.setPosition(particle.x, particle.y).setAlpha(clamp(particle.life / particle.maxLife, 0, 1)); if (particle.life <= 0) { particle.object.setVisible(false); this.textActive.splice(index, 1); } } }

    updateViews() {
      const playerState = this.renderState.player.flash > 0 || this.player.hurt > 0 ? 'hurt' : this.player.attackPose > 0 ? (this.player.state === 'skill' ? 'skill' : 'attack') : this.player.state; const playerKey = `hero-${this.player.active}-${this.player.direction}-${playerState}-${this.player.animFrame}`; this.playerView.shadow.setPosition(this.player.x, this.player.y + 37).setDepth(8 + this.player.y / 1000).setVisible(this.sim.respawn <= 0); this.playerView.sprite.setTexture(playerKey).setPosition(this.player.x, this.player.y - 6).setDepth(12 + this.player.y / 1000).setFlipX(this.player.direction === 'side' && Math.cos(this.player.facing) < 0).setVisible(this.sim.respawn <= 0); this.playerView.bracket.setPosition(this.player.x, this.player.y - 6).setDepth(13 + this.player.y / 1000).setVisible(this.sim.respawn <= 0).setAlpha(.7 + Math.sin(this.sim.time * 5) * .12);
      this.enemyViews.forEach((view, index) => { const enemy = this.enemies[index]; const state = this.renderState.enemies[index]; view.sprite.setVisible(state.visible); view.shadow.setVisible(state.visible); view.hpBack.setVisible(state.visible); view.hpFill.setVisible(state.visible); view.status.setVisible(state.visible && !!enemy.status); view.telegraph.setVisible(state.visible && enemy.windup > 0); view.target.setVisible(state.visible && state.target); if (!state.visible) return; const scale = enemy.boss ? .86 : enemy.shrine ? .72 : .64; const yLift = enemy.boss ? 7 : 4; const actorDepth = 11 + enemy.y / 1000; view.shadow.setPosition(enemy.x, enemy.y + (enemy.boss ? 54 : 35)).setDepth(actorDepth - .03).setScale(enemy.boss ? 1.25 : .72, enemy.boss ? .85 : .52); view.sprite.setPosition(enemy.x, enemy.y - yLift).setDepth(actorDepth).setScale(scale); if (state.flash > 0) view.sprite.setTint(0xffffff); else view.sprite.clearTint(); const barY = enemy.y - (enemy.boss ? 88 : 58); view.hpBack.setPosition(enemy.x, barY).setDepth(actorDepth + .08); view.hpFill.setPosition(enemy.x - (enemy.boss ? 62 : 34), barY).setDepth(actorDepth + .09).setScale(clamp(enemy.hp / enemy.maxHp, 0, 1), 1); view.status.setPosition(enemy.x, enemy.y - (enemy.boss ? 111 : 75)).setDepth(actorDepth + .1); if (enemy.status) { const data = ELEMENTS[safeElement(enemy.status)] || ELEMENTS.strike; textIfChanged(view.status, data.mark); colorIfChanged(view.status, data.color); } view.telegraph.setPosition(enemy.x, enemy.y).setDepth(actorDepth - .1).setScale(enemy.boss ? 1.2 : .74); view.target.setPosition(enemy.x, enemy.y - 4).setDepth(actorDepth + .06).setScale(enemy.boss ? 1.05 : .72); });
      this.projectiles.forEach((projectile, index) => { const view = this.projectilePool[index]; view.setVisible(projectile.active); if (projectile.active) view.setPosition(projectile.x, projectile.y).setTint((ELEMENTS[projectile.element] || ELEMENTS.frost).color).setScale(.72); });
      this.waveViews.forEach((wave, index) => { wave.x = wave.baseX + Math.sin(this.sim.time * .7 + index) * 6; wave.setAlpha(.18 + ((Math.sin(this.sim.time * 2.2 + index) + 1) * .06)); });
      this.leafViews.forEach((leaf, index) => { leaf.x = leaf.baseX + Math.sin(this.sim.time * 1.4 + index) * 4; leaf.y = leaf.baseY + Math.cos(this.sim.time * 1.1 + index) * 2; leaf.setRotation(Math.sin(this.sim.time * 1.3 + index) * .16); });
      this.shardViews.forEach((view, index) => { const visible = !(this.saveData.shards & (1 << index)); view.setVisible(visible).setDepth(5 + SHARDS[index].y / 1000); if (visible) view.setScale(.82 + Math.sin(this.sim.time * 3 + index) * .1).setAlpha(.72 + Math.sin(this.sim.time * 2 + index) * .12); });
      this.puzzleViews.forEach((view, index) => { const puzzle = ALTITUDE_PUZZLES[index]; const solved = !!(this.saveData.altitude & (1 << index)); view.setVisible(true).setDepth(5 + puzzle.y / 1000).setAlpha(solved ? .22 : .72 + Math.sin(this.sim.time * 2 + index) * .14).setScale(solved ? .72 : .92 + Math.sin(this.sim.time * 2.4 + index) * .08); });
      this.portalView.setDepth(5 + PORTAL.y / 1000).setAlpha(this.saveData.portal ? .9 + Math.sin(this.sim.time * 2) * .08 : .32 + Math.sin(this.sim.time * 2) * .06).setScale(this.saveData.portal ? 1.05 + Math.sin(this.sim.time * 1.6) * .05 : .92);
      const abilities = this.abilityState(); GATES.forEach((gate, index) => { const view = this.gateViews[index]; const visible = !abilities[gate.ability]; view.field.setVisible(visible).setAlpha(.1 + Math.sin(this.sim.time * 2 + index) * .025); view.seam.setVisible(visible); });
    }
    objectiveTarget() {
      if (this.sim.shards < SHARDS.length) return SHARDS.find((shard) => !(this.saveData.shards & (1 << shard.id))) || PORTAL;
      if (this.countBits(this.saveData.altitude) < ALTITUDE_PUZZLES.length) return ALTITUDE_PUZZLES.find((puzzle) => !(this.saveData.altitude & (1 << puzzle.id))) || PORTAL;
      if (!this.saveData.portal) return PORTAL;
      return this.enemies.find((enemy) => enemy.boss) || PORTAL;
    }
    objectiveLabel(target) { if (target === PORTAL) return 'PORTAL'; if (target.boss) return 'HIGH SHARD'; if (target.ability) return target.title; return `SHARD ${target.id + 1}`; }
    compassText() { const target = this.objectiveTarget(); const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x) - this.player.facing; const normalized = Math.atan2(Math.sin(angle), Math.cos(angle)); const arrow = normalized > .7 ? '→' : normalized < -.7 ? '←' : '↑'; return `${arrow} ${this.objectiveLabel(target)}`; }
    tutorialText() { if (this.sim.time < 8) return 'WASD / stick move · J attack · K skill · E interact'; if (this.sim.shards < SHARDS.length) return 'Follow ROUTE and collect the glowing skyshards'; if (this.countBits(this.saveData.altitude) < ALTITUDE_PUZZLES.length) return 'Press E / INTERACT near a rune after earning its traversal gift'; if (!this.saveData.portal) return 'The portal needs 8 skyshards and 3 tuned altitude runes'; return 'The high shard guardian is awake · combine elements for faster clears'; }
    paintUi() {
      const active = PARTY[this.player.active] || PARTY[0]; const member = this.state.party.members[this.player.active] || this.state.party.members[0]; const zone = safeZone(this.sim.zone); const abilities = this.abilityState();
      refs.zone.textContent = zone.name; scaleIfChanged(refs.healthFill, member.hp / 100); scaleIfChanged(refs.chargeFill, this.player.charge / 100); refs.healthRead.textContent = `${Math.ceil(member.hp)} / 100`; refs.chargeRead.textContent = `${Math.floor(this.player.charge)}`; refs.shards.textContent = `◇ ${Math.floor(this.sim.shardDisplay)} / ${SHARDS.length}`; refs.compass.textContent = this.compassText(); refs.altitude.textContent = `${this.sim.altitudeTier} · RUNES ${this.countBits(this.saveData.altitude)} / ${ALTITUDE_PUZZLES.length}`;
      refs.routeZones.forEach((routeZone, index) => { const id = ['meadow', 'lake', 'ruin', 'peak'][index]; routeZone.classList.toggle('active', id === this.sim.zone); routeZone.classList.toggle('done', !!(this.saveData.shrines & (1 << index))); });
      const element = ELEMENTS[safeElement(active.element)] || ELEMENTS.strike; refs.elementMark.textContent = element.mark; refs.elementMark.style.color = hex(element.color); refs.elementRead.textContent = element.label; refs.chips.forEach((chip, index) => { chip.classList.toggle('active', index === this.player.active); chip.classList.toggle('down', this.state.party.members[index].hp <= 0); scaleIfChanged(chip.querySelector('.party-hp i'), this.state.party.members[index].hp / 100); }); Object.entries(refs.ability).forEach(([key, elementNode]) => elementNode.classList.toggle('ready', !!abilities[key])); refs.dash.classList.toggle('ready', abilities.dash && this.player.dashCd <= 0); refs.skill.classList.toggle('ready', this.player.skillCd <= 0 && this.player.charge >= 16); refs.attack.classList.toggle('ready', this.player.attackCd <= 0);
      refs.interact.classList.toggle('ready', !!ALTITUDE_PUZZLES.find((puzzle) => dist(this.player.x, this.player.y, puzzle.x, puzzle.y) < 112) || dist(this.player.x, this.player.y, PORTAL.x, PORTAL.y) < 132);
      const transient = this.sim.boundary ? null : this.sim.transient; refs.transient.classList.toggle('visible', !!transient); if (transient) { refs.transientMark.textContent = transient.text.slice(0, 1); refs.transientMark.style.color = hex(transient.color); refs.transientRead.textContent = transient.text.slice(2); }
      const showCoach = !this.sim.trial && !this.sim.boundary && this.sim.coach > 0; refs.coach.classList.toggle('visible', showCoach); if (showCoach) refs.coach.textContent = this.tutorialText();
      this.state.mode = this.state.mode === 'victory' ? 'victory' : this.sim.trial ? 'trial' : 'explore'; this.state.zone = this.sim.zone; this.state.party.active = this.player.active; this.state.party.members.forEach((partyMember, index) => { partyMember.hp = clamp(num(partyMember.hp), 0, 100); partyMember.element = PARTY[index].element; }); this.state.abilities = abilities; this.state.altitude = { tier: this.sim.altitudeTier, solved: this.saveData.altitude }; this.state.portal = !!this.saveData.portal; this.state.shards = this.sim.shards; this.state.elements.charge = Math.round(this.player.charge); this.state.trial.active = this.sim.trial ? this.sim.trial.id : null; this.state.trial.medals = this.saveData.trials.slice(0, 3); refs.banner.classList.toggle('visible', !!this.sim.boundary); refs.banner.classList.toggle('interactive', this.state.mode === 'victory'); refs.restart.hidden = this.state.mode !== 'victory'; if (this.sim.boundary) { refs.bannerTitle.textContent = this.sim.boundary.title; refs.bannerCopy.textContent = this.sim.boundary.copy; } window.__sv.state = this.state;
    }
    formatTime(seconds) { const safe = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`; }
  }

  // The canvas MUST live inside #game-shell. index.html styles it with
  // `#game-shell > canvas { position: fixed; inset: 0 }`, and #game-shell is
  // itself position:fixed with an opaque background. Parenting the canvas to
  // document.body left it as an unpositioned in-flow child that the shell
  // painted straight over: the renderer was drawing a full frame (measured
  // 5,699 distinct colours read back off the canvas) that nothing could see,
  // which is the black frame this title reported.
  const shell = document.getElementById('game-shell') || document.body;
  // Design size is the CSS layout box, never a hard-coded constant: under the
  // Scale.NONE + zoom conversion the game is sized in DEVICE pixels and world
  // coordinates follow, so a fixed 844x390 would be wrong on any other box
  // (portrait included, which this title supports).
  const cssW = Math.max(1, Math.floor(document.documentElement.clientWidth || 844));
  const cssH = Math.max(1, Math.floor(document.documentElement.clientHeight || 390));
  const config = GGKit.hiDpi.phaser({ type: Phaser.AUTO, parent: shell, backgroundColor: '#081726', scale: { mode: Phaser.Scale.NONE, width: cssW, height: cssH, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [ValeScene], render: Object.assign({}, GGKit.renderDefaults) });
  DPR = config.ggDpr;
  let game = null;
  function resizeGame() {
    if (!game || !game.scale || !game.isBooted) return;
    const w = Math.max(1, Math.floor(document.documentElement.clientWidth || 1));
    const h = Math.max(1, Math.floor(document.documentElement.clientHeight || 1));
    try { game.scale.resize(Math.round(w * DPR), Math.round(h * DPR)); } catch (e) { /* never take the title down */ }
  }
  try {
    game = new Phaser.Game(config);
    window.__sv.game = game;
    // Deferred: game.scale exists from construction but its internals do not,
    // so a resize before boot throws from inside Phaser's own resize path.
    game.events.once('ready', resizeGame);
    window.addEventListener('resize', resizeGame);
    window.addEventListener('orientationchange', resizeGame);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) resizeGame(); });
  } catch (error) { const fallback = document.getElementById('coach-strip'); if (fallback) { fallback.textContent = 'Skyshard Vale could not start this renderer.'; fallback.classList.add('visible'); } window.__sv.state.mode = 'error'; window.__sv.error = String(error && error.message || error); }
})();
