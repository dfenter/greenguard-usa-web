/* Gravity Well - original GreenGuard USA code.
 * Phaser 3 is the renderer. GGKit owns lifecycle, input identity, save,
 * audio, orientation, settings and restart clearing.
 *
 * The sim is deliberately fixed-step. A slow device leaves work in the
 * accumulator and therefore slows the descent rather than skipping time.
 */
(function () {
  'use strict';

  var W = 390;
  var H = 700;
  var STEP = 1 / 60;
  var TAU = Math.PI * 2;
  var SAVE_VERSION = 3;
  var MAX_PARTICLES = 220;
  var MAX_HAZARDS = 64;
  var MAX_PICKUPS = 42;

  var C = {
    ink: 0x050b16, deep: 0x081322, rock: 0x112535, rock2: 0x193747,
    rim: 0x6cb7bd, ice: 0xdafcff, cyan: 0x71ecff, mint: 0x86f5c4,
    gold: 0xffd36d, orange: 0xff9861, rose: 0xff6e78, violet: 0xd7a3ff,
    blue: 0x82cfff, white: 0xf1ffff, dim: 0x7ea5b4, machine: 0xc3a6ff,
    lava: 0xff754e, crystal: 0xee80c2, safe: 0x8ff5d2
  };

  var EXPEDITIONS = [
    { key: 'first-descent', name: 'FIRST DESCENT', short: 'Training chain', family: 'crystal', descents: 3, depth: 960, hazard: 0.12, color: C.cyan },
    { key: 'mantle-run', name: 'MANTLE RUN', short: 'Vent field pressure', family: 'vent', descents: 4, depth: 1120, hazard: 0.27, color: C.lava },
    { key: 'polar-needle', name: 'POLAR NEEDLE', short: 'Ice shaft drift', family: 'ice', descents: 4, depth: 1260, hazard: 0.38, color: C.blue },
    { key: 'machine-shaft', name: 'MACHINE SHAFT', short: 'Moving doors', family: 'machine', descents: 4, depth: 1420, hazard: 0.51, color: C.machine },
    { key: 'fuel-attack', name: 'FUEL-ATTACK', short: 'Beat the burn clock', family: 'vent', descents: 3, depth: 1180, hazard: 0.48, color: C.gold, fuelAttack: true },
    { key: 'core-beacon', name: 'CORE BEACON', short: 'Multi-chamber finale', family: 'core', descents: 3, depth: 1540, hazard: 0.64, color: C.mint, finale: true }
  ];

  var FAMILIES = {
    crystal: { key: 'crystal', name: 'CRYSTAL GROTTO', sub: 'Prismatic razor cluster', rock: 0x172b3a, accent: C.crystal, signature: 'RAZOR CLUSTER' },
    vent: { key: 'vent', name: 'EMBER VENT FIELD', sub: 'Lava-adjacent pressure', rock: 0x251f2b, accent: C.lava, signature: 'THERMAL VENTS' },
    ice: { key: 'ice', name: 'ICE NEEDLE SHAFT', sub: 'Cross-shelf drift', rock: 0x112b42, accent: C.blue, signature: 'FALLING NEEDLES' },
    machine: { key: 'machine', name: 'MACHINE SHAFT', sub: 'Doors and piston timing', rock: 0x1c2038, accent: C.machine, signature: 'MOVING DOORS' },
    core: { key: 'core', name: 'CORE BEACON CHAMBER', sub: 'Three chamber gauntlet', rock: 0x102b2a, accent: C.mint, signature: 'CORE SURGE' }
  };

  var FAMILY_ORDER = ['crystal', 'vent', 'ice', 'machine'];
  var GW_DEBUG_STATE = {
    mode: 'menu', score: 0, fuel: 100, depth: 0, expedition: 0, cavern: 0,
    family: 'crystal', landingGrade: '', medal: '', burnRate: 0, shield: 0,
    forceExpedition: null, forceCavern: null, tutorialStep: 0,
    liveHazards: [], livePickups: []
  };
  if (typeof window !== 'undefined') {
    var priorDebug = window.__gw || {};
    var priorState = priorDebug.state || {};
    GW_DEBUG_STATE.forceExpedition = priorDebug.forceExpedition != null ? priorDebug.forceExpedition : priorState.forceExpedition != null ? priorState.forceExpedition : null;
    GW_DEBUG_STATE.forceCavern = priorDebug.forceCavern != null ? priorDebug.forceCavern : priorState.forceCavern != null ? priorState.forceCavern : null;
    window.__gw = { state: GW_DEBUG_STATE, forceExpedition: GW_DEBUG_STATE.forceExpedition, forceCavern: GW_DEBUG_STATE.forceCavern };
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(ax, ay, bx, by) { return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)); }
  function pad(n, width) { return String(Math.max(0, Math.floor(n))).padStart(width, '0'); }
  function format1(n) { return Number(n || 0).toFixed(1); }
  function setTextIfChanged(node, text) { if (node && node.textContent !== text) node.textContent = text; }
  function rng(seed) {
    var value = seed >>> 0;
    return function () {
      value += 0x6D2B79F5;
      var t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedFor(expedition, cavern) { return (0x6A17D + Math.imul(expedition + 3, 0x9E3779B9) + Math.imul(cavern + 7, 0x85EBCA6B)) >>> 0; }
  function safeFamily(key) { return FAMILIES[key] || FAMILIES.crystal; }
  function familyFromAny(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'number' && FAMILY_ORDER[value]) return FAMILY_ORDER[value];
    var text = String(value).toLowerCase();
    if (FAMILIES[text]) return text;
    for (var i = 0; i < FAMILY_ORDER.length; i++) if (text.indexOf(FAMILY_ORDER[i]) >= 0) return FAMILY_ORDER[i];
    if (text.indexOf('grotto') >= 0) return 'crystal';
    if (text.indexOf('lava') >= 0 || text.indexOf('vent') >= 0) return 'vent';
    if (text.indexOf('polar') >= 0 || text.indexOf('ice') >= 0) return 'ice';
    if (text.indexOf('shaft') >= 0 || text.indexOf('door') >= 0) return 'machine';
    if (text.indexOf('core') >= 0) return 'core';
    return fallback;
  }
  function expeditionIndex(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'number' && EXPEDITIONS[value]) return value;
    var text = String(value).toLowerCase();
    for (var i = 0; i < EXPEDITIONS.length; i++) if (text === String(i) || text === EXPEDITIONS[i].key || text.indexOf(EXPEDITIONS[i].key) >= 0) return i;
    if (text.indexOf('fuel') >= 0) return 4;
    if (text.indexOf('core') >= 0) return 5;
    return fallback;
  }
  function readForce(name) {
    if (typeof window === 'undefined' || !window.__gw) return null;
    var root = window.__gw;
    if (root[name] != null && root[name] !== '') return root[name];
    if (root.state && root.state[name] != null && root.state[name] !== '') return root.state[name];
    return null;
  }
  function setDom(node, className, visible) { if (node) node.classList.toggle(className, !!visible); }

  var dom = {
    frame: document.getElementById('frame'),
    score: document.getElementById('score-readout'),
    depth: document.getElementById('depth-readout'),
    fuel: document.getElementById('fuel-fill'),
    shield: document.getElementById('shield-readout'),
    coach: document.getElementById('coach'),
    pause: document.getElementById('pause-pill'),
    damage: document.getElementById('damage-vignette'),
    menu: document.getElementById('menu'),
    list: document.getElementById('expedition-list'),
    result: document.getElementById('result'),
    resultKicker: document.getElementById('result-kicker'),
    resultTitle: document.getElementById('result-title'),
    resultCopy: document.getElementById('result-copy'),
    resultAction: document.getElementById('result-action'),
    resultMenu: document.getElementById('result-menu'),
    settings: document.getElementById('settings')
  };

  function validateSave(obj) {
    if (!obj || obj.version !== SAVE_VERSION) return false;
    if (!Number.isInteger(obj.unlocked) || obj.unlocked < 0 || obj.unlocked > EXPEDITIONS.length - 1) return false;
    if (!Number.isFinite(obj.bestScore) || obj.bestScore < 0 || obj.bestScore > 99999999) return false;
    if (!Array.isArray(obj.medals) || obj.medals.length !== EXPEDITIONS.length) return false;
    for (var i = 0; i < obj.medals.length; i++) if (!Number.isInteger(obj.medals[i]) || obj.medals[i] < 0 || obj.medals[i] > 4) return false;
    return typeof obj.tutorialDone === 'boolean';
  }

  var kit = GGKit.create({
    slug: 'gravity-well',
    orientation: 'portrait',
    validateSave: validateSave,
    onPause: function () { if (scene) scene.pausedByKit = true; dom.pause.style.display = 'block'; },
    onResume: function () { if (scene) scene.pausedByKit = false; dom.pause.style.display = 'none'; },
    onRestart: function () { if (scene) scene.restartRun(); }
  });
  // GGKit owns the input surface. This small adapter exposes the browser's
  // gamepad snapshot through that surface, with a dead zone and no retained
  // button state, so disconnects, pause, blur, and restart all clear cleanly.
  kit.input.readGamepad = function () {
    var empty = { left: false, right: false, main: false, connected: false };
    if (kit.paused || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return empty;
    var pads;
    try { pads = navigator.getGamepads(); } catch (_) { return empty; }
    for (var i = 0; i < pads.length; i++) {
      var pad = pads[i]; if (!pad || !pad.connected) continue;
      var axisX = Number(pad.axes && pad.axes[0]) || 0;
      var axisY = Number(pad.axes && pad.axes[1]) || 0;
      var pressed = function (index) { return !!(pad.buttons && pad.buttons[index] && pad.buttons[index].pressed); };
      return {
        left: axisX < -.25 || pressed(14),
        right: axisX > .25 || pressed(15),
        main: axisY < -.25 || pressed(0) || pressed(1) || pressed(12),
        connected: true
      };
    }
    return empty;
  };
  kit.audio.register({
    ambient: 'assets/ambient.mp3', intensity: 'assets/intensity.mp3', thrust: 'assets/thrust.mp3',
    refuel: 'assets/refuel.mp3', crashSoft: 'assets/crash-soft.mp3', crashHard: 'assets/crash-hard.mp3',
    beacon: 'assets/beacon.mp3', pickup: 'assets/pickup.mp3', shield: 'assets/shield.mp3',
    shortcut: 'assets/shortcut.mp3', warning: 'assets/warning.mp3'
  });
  kit.registerPWA();

  var save = kit.save.get({ version: SAVE_VERSION, unlocked: 0, bestScore: 0, medals: [0, 0, 0, 0, 0, 0], tutorialDone: false });

  function createPool(size, factory) { var pool = []; for (var i = 0; i < size; i++) pool.push(factory(i)); return pool; }
  var particlePool = createPool(MAX_PARTICLES, function () { return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, size: 1, color: C.white, kind: 'spark', rotation: 0, spin: 0 }; });
  var hazardPool = createPool(MAX_HAZARDS, function (i) { return { id: i, active: false, kind: '', x: 0, y: 0, radius: 0, strength: 0, phase: 0, speed: 0, gap: 0, side: 0 }; });
  var pickupPool = createPool(MAX_PICKUPS, function (i) { return { id: i, active: false, kind: '', x: 0, y: 0, amount: 0, phase: 0 }; });
  var renderState = { ship: { x: 0, y: 0, angle: 0, thrust: false, gear: 0 }, hazards: [], hazardCount: 0, pickups: [], pickupCount: 0, particles: [], particleCount: 0 };
  for (var renderHazard = 0; renderHazard < MAX_HAZARDS; renderHazard++) renderState.hazards.push({ id: 0, kind: '', x: 0, y: 0, phase: 0 });
  for (var renderPickup = 0; renderPickup < MAX_PICKUPS; renderPickup++) renderState.pickups.push({ id: 0, kind: '', x: 0, y: 0 });
  for (var renderParticle = 0; renderParticle < MAX_PARTICLES; renderParticle++) renderState.particles.push({ x: 0, y: 0, life: 0, max: 1 });

  function clearPools() {
    for (var i = 0; i < hazardPool.length; i++) hazardPool[i].active = false;
    for (var j = 0; j < pickupPool.length; j++) pickupPool[j].active = false;
    for (var k = 0; k < particlePool.length; k++) particlePool[k].active = false;
  }
  function takeHazard(kind) {
    for (var i = 0; i < hazardPool.length; i++) if (!hazardPool[i].active) {
      var h = hazardPool[i]; h.active = true; h.kind = kind; h.x = 0; h.y = 0; h.radius = 12; h.strength = 0; h.phase = 0; h.speed = 0; h.gap = 0; h.side = 0; return h;
    }
    return null;
  }
  function takePickup(kind) {
    for (var i = 0; i < pickupPool.length; i++) if (!pickupPool[i].active) {
      var p = pickupPool[i]; p.active = true; p.kind = kind; p.x = 0; p.y = 0; p.amount = 0; p.phase = 0; return p;
    }
    return null;
  }
  function emit(x, y, color, kind, count, force, life) {
    var made = 0;
    for (var i = 0; i < particlePool.length && made < count; i++) {
      var p = particlePool[i];
      if (p.active) continue;
      var angle = Math.random() * TAU;
      var speed = (0.3 + Math.random() * 0.7) * force;
      p.active = true; p.x = x; p.y = y; p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed;
      p.life = life * (0.7 + Math.random() * 0.5); p.max = p.life; p.size = 1.5 + Math.random() * 3; p.color = color; p.kind = kind;
      p.rotation = angle; p.spin = (Math.random() - .5) * 8;
      made++;
    }
  }

  function corridorAt(cavern, y) {
    var pts = cavern.points;
    if (y <= pts[0].y) return pts[0];
    for (var i = 1; i < pts.length; i++) if (y <= pts[i].y) {
      var a = pts[i - 1]; var b = pts[i]; var t = (y - a.y) / (b.y - a.y);
      return { left: lerp(a.left, b.left, t), right: lerp(a.right, b.right, t), width: lerp(a.width, b.width, t) };
    }
    return pts[pts.length - 1];
  }
  function pointFor(cavern, y, random, margin) {
    var b = corridorAt(cavern, y); return lerp(b.left + margin, b.right - margin, random());
  }
  function makeCavern(expIndex, cavernIndex) {
    var exp = EXPEDITIONS[expIndex] || EXPEDITIONS[0];
    var forceFamily = familyFromAny(readForce('forceCavern'), exp.family);
    var family = safeFamily(forceFamily);
    var random = rng(seedFor(expIndex, cavernIndex));
    var depth = exp.depth + cavernIndex * 72 + (family.key === 'core' ? 90 : 0);
    var points = [];
    var center = W / 2;
    var width;
    for (var y = 0; y <= depth + 90; y += 60) {
      var progress = y / depth;
      var curve = progress < .18 ? 106 : progress < .37 ? 82 : progress < .58 ? 59 : progress < .73 ? 89 : progress < .9 ? 65 : 103;
      if (family.key === 'machine' && progress > .48 && progress < .68) curve -= 10;
      if (family.key === 'core') curve = progress < .22 ? 105 : progress < .38 ? 62 : progress < .56 ? 95 : progress < .76 ? 57 : 92;
      center += Math.sin(y * .011 + expIndex * 1.7 + cavernIndex) * 4 + (random() - .5) * 22;
      center = clamp(center, 120, W - 120);
      width = clamp(curve + (random() - .5) * 13, 52, 112);
      points.push({ y: y, left: clamp(center - width, 13, 165), right: clamp(center + width, 225, W - 13), width: width * 2 });
    }
    var cavern = { seed: seedFor(expIndex, cavernIndex), depth: depth, floorY: depth, points: points, family: family.key, pads: [], shortcut: null, beacon: null, chamberCount: family.key === 'core' ? 3 : 0, chambers: [] };
    if (family.key === 'core') {
      ['OUTER RING', 'FLUX CHAMBER', 'BEACON HEART'].forEach(function (name, index) {
        cavern.chambers.push({ name: name, y: depth * (.24 + index * .27) });
      });
    }
    var padFractions = family.key === 'core' ? [.22, .47, .7] : [.24, .53, .78];
    for (var p = 0; p < padFractions.length; p++) {
      var py = Math.min(depth - 125, depth * padFractions[p] + (random() - .5) * 45);
      cavern.pads.push({ x: pointFor(cavern, py, random, 35), y: py, width: 72, landed: false, grade: '' });
    }
    var shortcutY = depth * (family.key === 'machine' ? .42 : family.key === 'core' ? .52 : .58) + (random() - .5) * 36;
    var sb = corridorAt(cavern, shortcutY);
    var side = random() > .5 ? -1 : 1;
    cavern.shortcut = { x: side < 0 ? sb.left + 24 : sb.right - 24, y: shortcutY, exitY: Math.min(depth - 100, shortcutY + (family.key === 'core' ? 220 : 275)), side: side, found: false };
    cavern.beacon = { x: (corridorAt(cavern, depth - 44).left + corridorAt(cavern, depth - 44).right) / 2, y: depth - 44 };

    for (var hi = 0; hi < 5 + Math.floor(exp.hazard * 5); hi++) {
      var hy = 210 + hi * ((depth - 360) / (5 + Math.floor(exp.hazard * 5))) + random() * 54;
      var hazard;
      if (family.key === 'crystal') {
        hazard = takeHazard('crystal'); if (!hazard) continue;
        var hSide = hi % 2 ? 1 : -1; var hb = corridorAt(cavern, hy);
        hazard.side = hSide; hazard.x = hSide < 0 ? hb.left + 20 : hb.right - 20; hazard.y = hy; hazard.radius = 18 + random() * 12; hazard.phase = random() * TAU;
      } else if (family.key === 'vent') {
        hazard = takeHazard('vent'); if (!hazard) continue;
        hazard.y = hy; hazard.side = random() > .5 ? 1 : -1; hazard.strength = (hazard.side * (24 + random() * 22)); hazard.radius = 25; hazard.phase = random() * TAU;
      } else if (family.key === 'ice') {
        hazard = takeHazard('icicle'); if (!hazard) continue;
        hazard.y = hy; hazard.x = pointFor(cavern, hy, random, 25); hazard.radius = 15 + random() * 10; hazard.phase = random() * TAU; hazard.speed = .7 + random() * .5;
      } else if (family.key === 'machine') {
        hazard = takeHazard(hi % 2 ? 'piston' : 'door'); if (!hazard) continue;
        hazard.y = hy; hazard.gap = hazard.kind === 'door' ? 88 - exp.hazard * 18 : 62; hazard.phase = random() * TAU; hazard.speed = .75 + random() * .35; hazard.radius = 14;
      } else {
        hazard = takeHazard(hi % 2 ? 'surge' : 'core-orb'); if (!hazard) continue;
        hazard.y = hy; hazard.x = pointFor(cavern, hy, random, 32); hazard.radius = hazard.kind === 'surge' ? 18 : 13; hazard.phase = random() * TAU; hazard.speed = .8 + random() * .6;
      }
    }
    var pickupKinds = ['fuel', 'shield', 'crystal', 'bubble', 'fuel', 'crystal', 'fuel', 'shield', 'bubble', 'fuel'];
    for (var pi = 0; pi < pickupKinds.length; pi++) {
      var pickupY = 150 + pi * ((depth - 250) / pickupKinds.length) + random() * 38;
      var pickup = takePickup(pickupKinds[pi]); if (!pickup) continue;
      pickup.y = pickupY; pickup.x = pointFor(cavern, pickupY, random, 30); pickup.amount = pickup.kind === 'fuel' ? 24 : pickup.kind === 'crystal' ? 60 : 1; pickup.phase = random() * TAU;
    }
    return cavern;
  }

  function resetTutorial() {
    return { active: !save.tutorialDone, step: 0, rotate: false, thrust: false, landed: false, refueled: false };
  }
  function tutorialText(tutorial) {
    if (!tutorial || !tutorial.active) return '';
    if (tutorial.step === 0) return '←/→ ROTATE';
    if (tutorial.step === 1) return 'MAIN / BOTH SIDES = THRUST';
    if (tutorial.step === 2) return 'LAND ON A GREEN PAD';
    if (tutorial.step === 3) return 'PAD REFILLS FUEL + SCORE';
    return 'FOLLOW VIOLET CHUTE → BEACON';
  }

  function LanderScene() {
    Phaser.Scene.call(this, { key: 'GravityWellScene' });
    this.accumulator = 0; this.simClock = 0; this.pausedByKit = false; this.lastForceKey = '';
    this.mode = 'menu'; this.currentExpedition = 0; this.currentCavern = 0; this.cavern = null; this.player = null;
    this.runScore = 0; this.runTime = 0; this.descentStart = 0; this.landingScore = 0; this.landingCount = 0; this.lastLanding = '';
    this.cameraY = 0; this.shake = 0; this.damageFlash = 0; this.banner = null; this.resultClock = 0;
    this.transient = null; this.transientQueue = []; this.transientClock = 0; this.coachClock = 0;
    this.musicLayer = ''; this.warningClock = 0; this.shipImage = null; this.hazardImages = []; this.pickupImages = []; this.padImages = [];
    this.shortcutImage = null; this.beaconImage = null; this.juiceFrame = { dx: 0, dy: 0, frozen: false };
    this.tutorial = resetTutorial(); this.thrustPulse = 0; this.beaconPulse = 0;
  }
  LanderScene.prototype = Object.create(Phaser.Scene.prototype);
  LanderScene.prototype.constructor = LanderScene;

  LanderScene.prototype.preload = function () {
    var svg = function (key, file) { this.load.svg(key, file, { width: 96, height: 96 }); };
    svg.call(this, 'lander-idle', 'assets/lander-idle.svg');
    svg.call(this, 'lander-thrust', 'assets/lander-thrust.svg');
    svg.call(this, 'lander-damaged', 'assets/lander-damaged.svg');
    svg.call(this, 'hazard-crystal', 'assets/hazard-crystal.svg');
    svg.call(this, 'hazard-ice', 'assets/hazard-ice.svg');
    svg.call(this, 'hazard-vent', 'assets/hazard-vent.svg');
    svg.call(this, 'hazard-machine', 'assets/hazard-machine.svg');
    svg.call(this, 'hazard-core', 'assets/hazard-core.svg');
    svg.call(this, 'pickup-fuel', 'assets/pickup-fuel.svg');
    svg.call(this, 'pickup-shield', 'assets/pickup-shield.svg');
    svg.call(this, 'pickup-crystal', 'assets/pickup-crystal.svg');
    svg.call(this, 'pickup-bubble', 'assets/pickup-bubble.svg');
    svg.call(this, 'refuel-pad', 'assets/refuel-pad.svg');
    svg.call(this, 'shortcut-chute', 'assets/shortcut-chute.svg');
    svg.call(this, 'beacon-core', 'assets/beacon-core.svg');
  };

  LanderScene.prototype.create = function () {
    this.bg = this.add.graphics().setDepth(-10);
    this.world = this.add.graphics().setDepth(1);
    this.fx = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    this.overlay = this.add.graphics().setDepth(8);
    this.bannerG = this.add.graphics().setDepth(20);
    this.shipImage = this.add.image(0, 0, 'lander-idle').setDepth(9).setVisible(false);
    for (var hazardIndex = 0; hazardIndex < MAX_HAZARDS; hazardIndex++) this.hazardImages.push(this.add.image(0, 0, 'hazard-crystal').setDepth(3).setVisible(false));
    for (var pickupIndex = 0; pickupIndex < MAX_PICKUPS; pickupIndex++) this.pickupImages.push(this.add.image(0, 0, 'pickup-fuel').setDepth(3).setVisible(false));
    for (var padIndex = 0; padIndex < 3; padIndex++) this.padImages.push(this.add.image(0, 0, 'refuel-pad').setDepth(2).setVisible(false));
    this.shortcutImage = this.add.image(0, 0, 'shortcut-chute').setDepth(3).setVisible(false);
    this.beaconImage = this.add.image(0, 0, 'beacon-core').setDepth(3).setVisible(false);
    this.bannerG.setScrollFactor(0);
    this.bannerKicker = this.add.text(W / 2, 262, '', { fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold', color: '#91f6d0', letterSpacing: 2 }).setOrigin(.5).setDepth(22).setScrollFactor(0);
    this.bannerTitle = this.add.text(W / 2, 290, '', { fontFamily: 'monospace', fontSize: '25px', fontStyle: 'bold', color: '#f3ffff', stroke: '#06101a', strokeThickness: 5 }).setOrigin(.5).setDepth(22).setScrollFactor(0);
    this.bannerSub = this.add.text(W / 2, 321, '', { fontFamily: 'monospace', fontSize: '10px', color: '#b9dce3' }).setOrigin(.5).setDepth(22).setScrollFactor(0);
    this.bannerKicker.setVisible(false); this.bannerTitle.setVisible(false); this.bannerSub.setVisible(false);
    this.startMenu();
    updateMenu(this);
  };

  LanderScene.prototype.clearBanner = function () {
    this.banner = null;
    if (this.bannerG) this.bannerG.clear().setAlpha(0);
    if (this.bannerKicker) this.bannerKicker.setVisible(false);
    if (this.bannerTitle) this.bannerTitle.setVisible(false);
    if (this.bannerSub) this.bannerSub.setVisible(false);
  };
  LanderScene.prototype.clearTransient = function () {
    this.transient = null; this.transientQueue.length = 0; this.transientClock = 0;
    dom.coach.classList.remove('event', 'stale'); dom.coach.style.removeProperty('--chip-accent'); dom.coach.style.removeProperty('border-color');
    setDom(dom.coach, 'active', false);
  };
  LanderScene.prototype.renderTutorial = function (resetClock) {
    if (resetClock) this.coachClock = 3;
    if (this.transient) return;
    var active = !!(this.tutorial && this.tutorial.active && this.mode === 'playing');
    if (!active) { dom.coach.classList.remove('event', 'stale'); dom.coach.style.removeProperty('--chip-accent'); setDom(dom.coach, 'active', false); return; }
    dom.coach.classList.remove('event'); dom.coach.style.removeProperty('--chip-accent'); dom.coach.style.removeProperty('border-color');
    setTextIfChanged(dom.coach, tutorialText(this.tutorial)); setDom(dom.coach, 'stale', this.coachClock <= 0); setDom(dom.coach, 'active', true);
  };
  LanderScene.prototype.pumpTransient = function () {
    if (this.transient || !this.transientQueue.length || this.mode !== 'playing') return;
    if (this.tutorial && this.tutorial.active && this.coachClock > 0) return;
    this.transient = this.transientQueue.shift(); this.transientClock = 1;
    dom.coach.classList.add('event'); dom.coach.classList.remove('stale'); dom.coach.style.setProperty('--chip-accent', this.transient.color || '#71ecff'); dom.coach.style.borderColor = this.transient.color || '#71ecff';
    setTextIfChanged(dom.coach, this.transient.text); setDom(dom.coach, 'active', true);
  };
  LanderScene.prototype.showEventChip = function (text, color) {
    if (!text || this.mode !== 'playing') return;
    if (this.transient && this.transient.text === text) return;
    for (var i = 0; i < this.transientQueue.length; i++) if (this.transientQueue[i].text === text) return;
    if (this.transientQueue.length >= 4) this.transientQueue.shift();
    this.transientQueue.push({ text: text, color: color || '#71ecff' }); this.pumpTransient();
  };
  LanderScene.prototype.finishTransient = function () {
    this.transient = null; this.transientClock = 0;
    dom.coach.classList.remove('event'); dom.coach.style.removeProperty('--chip-accent'); dom.coach.style.removeProperty('border-color');
    this.renderTutorial(false); this.pumpTransient();
  };

  LanderScene.prototype.startMenu = function () {
    this.mode = 'menu'; this.player = null; this.cavern = null; this.clearBanner(); this.clearTransient(); this.accumulator = 0; this.damageFlash = 0; this.musicLayer = ''; clearPools(); kit.audio.stopMusic(350);
    if (this.shipImage) this.shipImage.setVisible(false);
    this.hazardImages.forEach(function (image) { image.setVisible(false); }); this.pickupImages.forEach(function (image) { image.setVisible(false); }); this.padImages.forEach(function (image) { image.setVisible(false); }); if (this.shortcutImage) this.shortcutImage.setVisible(false); if (this.beaconImage) this.beaconImage.setVisible(false);
    setDom(dom.menu, 'visible', true); setDom(dom.result, 'visible', false); setDom(dom.settings, 'visible', false); setDom(dom.coach, 'active', false);
    if (dom.damage) dom.damage.style.opacity = '0';
    syncDebug(this); updateMenu(this);
  };
  LanderScene.prototype.restartRun = function () {
    if (this.mode === 'result' || this.mode === 'crashed') this.startDescent(this.currentExpedition, this.currentCavern, false);
    else this.startMenu();
  };
  LanderScene.prototype.startDescent = function (expIndex, cavernIndex, preserveRunScore) {
    var forcedExp = expeditionIndex(readForce('forceExpedition'), expIndex == null ? this.currentExpedition : expIndex);
    var wasMenu = this.mode === 'menu';
    var previousExpedition = this.currentExpedition;
    var exp = EXPEDITIONS[forcedExp] || EXPEDITIONS[0];
    var hasForcedExp = readForce('forceExpedition') != null && readForce('forceExpedition') !== '';
    if (!hasForcedExp && forcedExp > save.unlocked) forcedExp = save.unlocked;
    var forcedCavern = readForce('forceCavern');
    var numericForcedCavern = forcedCavern != null && forcedCavern !== '' && Number.isFinite(Number(forcedCavern));
    var parsedCavern = numericForcedCavern ? Math.max(0, Math.floor(Number(forcedCavern))) : cavernIndex == null ? this.currentCavern : cavernIndex;
    this.currentExpedition = clamp(forcedExp, 0, EXPEDITIONS.length - 1);
    this.currentCavern = clamp(parsedCavern, 0, (EXPEDITIONS[this.currentExpedition] || exp).descents - 1);
    clearPools();
    this.cavern = makeCavern(this.currentExpedition, this.currentCavern);
    var start = corridorAt(this.cavern, 84);
    var isFuelAttack = !!(EXPEDITIONS[this.currentExpedition] && EXPEDITIONS[this.currentExpedition].fuelAttack);
    this.player = { x: (start.left + start.right) / 2, y: 84, vx: 0, vy: 18, angle: 0, angularVelocity: 0, fuel: isFuelAttack ? 68 : 100, maxFuel: isFuelAttack ? 68 : 100, shield: 0, slowFall: 0, invulnerable: 0, thrusting: false, burnRate: 0, flash: 0, padGrace: 0 };
    this.mode = 'playing'; this.runTime = 0; this.descentStart = this.simClock; this.landingScore = 0; this.landingCount = 0; this.lastLanding = '';
    if (wasMenu || !preserveRunScore || (this.currentCavern === 0 && this.currentExpedition === previousExpedition && !preserveRunScore)) this.runScore = 0;
    this.cameraY = 0; this.clearBanner(); this.clearTransient(); this.damageFlash = 0; this.resultClock = 0; this.thrustPulse = 0; this.warningClock = 0; this.musicLayer = '';
    if (dom.damage) dom.damage.style.opacity = '0';
    this.tutorial = !save.tutorialDone ? resetTutorial() : { active: false, step: 4 };
    setDom(dom.menu, 'visible', false); setDom(dom.result, 'visible', false); setDom(dom.settings, 'visible', true); this.renderTutorial(true);
    kit.audio.music('ambient', 350); this.musicLayer = 'ambient'; this.updateHud(); syncDebug(this);
  };
  LanderScene.prototype.completeDescent = function () {
    if (this.mode !== 'playing') return;
    this.mode = 'result'; this.player.vx *= .35; this.player.vy = -18; this.lastLanding = this.lastLanding || 'BEACON LANDING';
    this.musicLayer = ''; kit.audio.stopMusic(400);
    var exp = EXPEDITIONS[this.currentExpedition] || EXPEDITIONS[0];
    var fuelScore = Math.floor(this.player.fuel * (exp.fuelAttack ? 5 : 3));
    var timeScore = Math.max(0, Math.floor(220 - this.runTime * (exp.fuelAttack ? 4.5 : 2.2)));
    var gradeScore = this.landingScore;
    var descentScore = 260 + fuelScore + timeScore + gradeScore;
    this.runScore += descentScore;
    var medal = this.getMedal(fuelScore, timeScore, gradeScore);
    save.medals[this.currentExpedition] = Math.max(save.medals[this.currentExpedition], medal.rank);
    if (this.currentExpedition === save.unlocked && this.currentExpedition < EXPEDITIONS.length - 1 && this.currentCavern >= exp.descents - 1) save.unlocked = Math.min(EXPEDITIONS.length - 1, save.unlocked + 1);
    this.recordBestScore();
    kit.save.set(save);
    var next = this.currentCavern < exp.descents - 1 ? 'NEXT DESCENT' : this.currentExpedition < EXPEDITIONS.length - 1 ? 'NEXT EXPEDITION' : 'RUN CORE AGAIN';
    showResult(this, 'DESCENT COMPLETE', medal.name, 'FUEL +' + fuelScore + ' · TIME +' + timeScore + ' · LANDING +' + gradeScore + '<br>SCORE ' + pad(this.runScore, 5) + ' · ' + exp.name, next);
    this.showBanner(medal.name, 'BEACON REACHED', 'MEDAL ' + medal.name + ' · ' + exp.name, medal.color);
    kit.audio.sfx('beacon', { volume: .85 });
    emit(this.cavern.beacon.x, this.cavern.beacon.y, C.mint, 'pickup', 34, 130, 1.1);
    syncDebug(this);
  };
  LanderScene.prototype.getMedal = function (fuelScore, timeScore, gradeScore) {
    var total = fuelScore + timeScore + gradeScore;
    if (total >= 590) return { rank: 4, name: 'PLATINUM', color: '#ffe28c' };
    if (total >= 450) return { rank: 3, name: 'GOLD', color: '#ffd36d' };
    if (total >= 300) return { rank: 2, name: 'SILVER', color: '#c7f5ff' };
    return { rank: 1, name: 'BRONZE', color: '#d9a67e' };
  };
  LanderScene.prototype.recordBestScore = function () {
    var score = Math.max(0, Math.floor(Number(this.runScore) || 0));
    if (score > save.bestScore) { save.bestScore = score; kit.save.set(save); }
  };
  LanderScene.prototype.crash = function (reason, speed, threshold) {
    if (this.mode !== 'playing') return;
    if (this.player.invulnerable > 0) return;
    if (this.player.shield > 0) { this.player.shield--; this.player.invulnerable = .85; this.player.vy = -Math.max(38, Math.abs(this.player.vy) * .45); this.player.vx *= .45; this.player.flash = .8; this.damageFlash = .65; this.showEventChip('SHIELD SAVED', '#71ecff'); emit(this.player.x, this.player.y, C.cyan, 'impact', 22, 110, .8); emit(this.player.x, this.player.y, C.cyan, 'ring', 1, 0, .45); kit.juice.shake(5, 130); kit.juice.hitStop(42); kit.audio.sfx('shield', { volume: .8 }); return; }
    this.recordBestScore();
    this.mode = 'crashed'; this.musicLayer = ''; kit.audio.stopMusic(350); this.player.flash = 1; this.damageFlash = 1; emit(this.player.x, this.player.y, C.rose, 'impact', 42, 180, 1.25); emit(this.player.x, this.player.y, C.orange, 'burst', 28, 120, .7); emit(this.player.x, this.player.y, C.rose, 'ring', 2, 0, .85); emit(this.player.x, this.player.y, C.dim, 'smoke', 14, 42, 1.4); kit.juice.shake(12, 280); kit.juice.hitStop(78); kit.audio.sfx('crashHard', { volume: .9 });
    var measured = Number.isFinite(speed) ? format1(speed) : 'WALL';
    var limit = Number.isFinite(threshold) ? format1(threshold) : 'CONTACT';
    showResult(this, 'DESCENT LOST', 'HARD CONTACT', reason + '<br>IMPACT ' + measured + ' · FATAL ' + limit + '<br>SCORE ' + pad(this.runScore, 5), 'RETRY DESCENT');
    this.showBanner('IMPACT ALERT', 'HARD CONTACT', reason + ' · IMPACT ' + measured, '#ff7a83');
    syncDebug(this);
  };
  LanderScene.prototype.softBump = function (label, speed) {
    this.player.vy = -Math.max(24, Math.min(62, speed * .34)); this.player.vx *= .48; this.player.angle *= .48; this.player.flash = .55; this.damageFlash = Math.max(this.damageFlash, .28); this.showEventChip('SOFT BUMP', '#ffd36d'); emit(this.player.x, this.player.y, C.gold, 'impact', 12, 65, .55); emit(this.player.x, this.player.y, C.gold, 'ring', 1, 0, .35); kit.juice.shake(3, 95); kit.juice.hitStop(22); kit.audio.sfx('crashSoft', { volume: .7 });
    this.lastLanding = label;
  };
  LanderScene.prototype.padContact = function (pad) {
    var speed = Math.hypot(this.player.vx, Math.max(0, this.player.vy));
    var angle = Math.abs(this.player.angle);
    var fatal = 148;
    if (speed > fatal || angle > 1.02) { this.crash('PAD CONTACT TOO HARD', speed, fatal); return; }
    var grade;
    if (speed <= 30 && angle <= .15) grade = { name: 'PERFECT', bonus: 180, refill: 42, color: C.mint };
    else if (speed <= 52 && angle <= .3) grade = { name: 'CLEAN', bonus: 125, refill: 35, color: C.cyan };
    else if (speed <= 78 && angle <= .5) grade = { name: 'SOFT', bonus: 80, refill: 28, color: C.gold };
    else grade = { name: 'ROUGH BUMP', bonus: 25, refill: 16, color: C.orange };
    pad.landed = true; pad.grade = grade.name; this.player.y = pad.y - 18; this.player.vy = -Math.max(18, speed * .16); this.player.vx *= .3; this.player.angle *= .3;
    var fuelBefore = this.player.fuel;
    this.player.fuel = clamp(this.player.fuel + grade.refill, 0, this.player.maxFuel); this.landingScore += grade.bonus; this.landingCount++; this.lastLanding = grade.name;
    if (this.tutorial && this.tutorial.active && this.player.fuel > fuelBefore) this.tutorial.refueled = true;
    var gradeColor = '#' + grade.color.toString(16).padStart(6, '0');
    this.showEventChip(grade.name + '  +' + grade.bonus, gradeColor); emit(pad.x, pad.y, grade.color, 'pickup', grade.name === 'PERFECT' ? 24 : 14, 90, .8); emit(pad.x, pad.y, grade.color, 'ring', 1, 0, .5); kit.audio.sfx('refuel', { volume: grade.name === 'PERFECT' ? 1 : .75 });
  };
  LanderScene.prototype.collect = function (pickup) {
    pickup.active = false;
    var eventText;
    if (pickup.kind === 'fuel') { var fuelBefore = this.player.fuel; this.player.fuel = clamp(this.player.fuel + pickup.amount, 0, this.player.maxFuel); if (this.tutorial && this.tutorial.active && this.player.fuel > fuelBefore) this.tutorial.refueled = true; eventText = 'FUEL +' + pickup.amount; }
    else if (pickup.kind === 'shield') { this.player.shield = Math.min(3, this.player.shield + 1); eventText = 'SHIELD +1'; }
    else if (pickup.kind === 'crystal') { this.runScore += pickup.amount; this.recordBestScore(); eventText = 'CRYSTAL +' + pickup.amount; }
    else { this.player.slowFall = Math.min(12, this.player.slowFall + 6); eventText = 'SLOW-FALL'; }
    var pickupColor = pickup.kind === 'fuel' ? C.gold : pickup.kind === 'shield' ? C.cyan : pickup.kind === 'crystal' ? C.violet : C.mint; this.showEventChip(eventText, '#' + pickupColor.toString(16).padStart(6, '0')); emit(pickup.x, pickup.y, pickupColor, 'pickup', 15, 90, .7); emit(pickup.x, pickup.y, pickupColor, 'ring', 1, 0, .4); kit.audio.sfx(pickup.kind === 'shield' ? 'shield' : pickup.kind === 'crystal' ? 'pickup' : 'refuel', { volume: .5 });
  };
  LanderScene.prototype.showBanner = function (kicker, title, sub, color) {
    if (this.mode === 'playing') { this.showEventChip(title || kicker, color); return; }
    this.clearTransient(); this.clearBanner();
    this.banner = { kicker: kicker, title: title, sub: sub, color: color || '#91f6d0', age: 0, life: 2.25 };
    this.bannerKicker.setColor(color || '#91f6d0'); this.bannerTitle.setColor('#f3ffff'); this.bannerSub.setColor('#b9dce3');
    this.bannerKicker.setVisible(true); this.bannerTitle.setVisible(true); this.bannerSub.setVisible(true);
  };
  LanderScene.prototype.step = function (dt) {
    this.simClock += dt;
    this.shake = Math.max(0, this.shake - dt * 20);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.6);
    if (this.transient) { this.transientClock = Math.max(0, this.transientClock - dt); if (this.transientClock === 0) this.finishTransient(); }
    if (this.banner) { this.banner.age += dt; if (this.banner.age > this.banner.life) { this.banner = null; this.bannerKicker.setVisible(false); this.bannerTitle.setVisible(false); this.bannerSub.setVisible(false); } }
    updateParticles(dt); updatePickupsVisual(dt);
    if (this.mode !== 'playing' || !this.player || !this.cavern) { syncDebug(this); return; }
    this.runTime += dt;
    this.warningClock = Math.max(0, this.warningClock - dt);
    this.readInput(dt);
    this.movePlayer(dt);
    this.updateTutorial();
    this.cameraY += (clamp(this.player.y - 238, 0, Math.max(0, this.cavern.depth - H + 120)) - this.cameraY) * Math.min(1, dt * 5.5);
    if (this.player.slowFall > 0) this.player.slowFall = Math.max(0, this.player.slowFall - dt);
    if (this.player.invulnerable > 0) this.player.invulnerable = Math.max(0, this.player.invulnerable - dt);
    if (this.player.flash > 0) this.player.flash = Math.max(0, this.player.flash - dt * 1.8);
    this.updateMusicLayer();
    if (this.player.fuel < this.player.maxFuel * .2 && this.warningClock === 0) { this.warningClock = 2.2; kit.audio.sfx('warning', { volume: .55 }); }
    if (dom.damage) dom.damage.style.opacity = String(clamp(this.damageFlash, 0, 1));
    this.updateHud(); syncDebug(this);
  };
  LanderScene.prototype.readInput = function () {
    var left = false; var right = false; var main = false;
    kit.input.pointers.forEach(function (p) { if (p.zone === 'left') left = true; if (p.zone === 'right') right = true; if (p.zone === 'main') main = true; });
    left = left || kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA');
    right = right || kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD');
    main = main || kit.input.keyDown('Space') || kit.input.keyDown('Enter') || kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW');
    var pad = kit.input.readGamepad(); left = left || pad.left; right = right || pad.right; main = main || pad.main;
    this.inputState = { left: left, right: right, main: main, thrust: left || right || main };
    if (this.tutorial && this.tutorial.active) { if (left || right) this.tutorial.rotate = true; if (main || (left && right)) this.tutorial.thrust = true; }
  };
  LanderScene.prototype.movePlayer = function (dt) {
    var p = this.player; var input = this.inputState || { left: false, right: false, main: false, thrust: false }; var both = input.left && input.right;
    var side = input.left === input.right ? 0 : input.left ? -1 : 1;
    var isFuelAttack = !!(EXPEDITIONS[this.currentExpedition] && EXPEDITIONS[this.currentExpedition].fuelAttack);
    var fuelFactor = isFuelAttack ? 1.12 : 1;
    var burn = 0;
    if (side) { p.angularVelocity += side * 3.9 * dt; burn += 2.2; }
    p.angularVelocity *= Math.pow(.3, dt);
    p.angle += p.angularVelocity * dt; p.angle = clamp(p.angle, -1.12, 1.12);
    var straight = input.main || both;
    if (input.thrust && p.fuel > 0) {
      var power = straight ? 105 : 68;
      p.vx += Math.sin(p.angle) * power * dt * fuelFactor;
      p.vy -= Math.cos(p.angle) * power * dt * fuelFactor;
      burn += straight ? 8.6 * fuelFactor : 5.1 * fuelFactor;
      p.thrusting = true; this.thrustPulse += dt;
      if (this.thrustPulse > .045) { this.thrustPulse = 0; emit(p.x - Math.sin(p.angle) * 10, p.y + Math.cos(p.angle) * 13, straight ? C.gold : C.orange, 'thrust', 2, straight ? 34 : 26, .28); kit.audio.sfx('thrust', { volume: .16, rate: straight ? 1.05 : .9 }); }
    } else p.thrusting = false;
    p.burnRate = burn; p.fuel = clamp(p.fuel - burn * dt, 0, p.maxFuel);
    var family = safeFamily(this.cavern.family);
    for (var i = 0; i < hazardPool.length; i++) {
      var h = hazardPool[i]; if (!h.active) continue;
      if (h.kind === 'icicle') {
        h.y += (36 + h.speed * 22) * dt;
        if (h.y > this.cavern.depth - 105) h.y = 170 + ((h.phase * 97) % Math.max(220, this.cavern.depth - 280));
        h.x = clamp(h.x, corridorAt(this.cavern, h.y).left + 24, corridorAt(this.cavern, h.y).right - 24);
      }
      var near = Math.abs(p.y - h.y);
      if (h.kind === 'vent' && near < 105) { var fall = 1 - near / 105; p.vx += h.strength * fall * dt; if (Math.random() < dt * 8 * fall) emit(h.x, h.y, C.lava, 'ambient', 1, 30, .45); }
      if (h.kind === 'surge' && near < 130) p.vx += Math.sin(this.simClock * h.speed + h.phase) * 12 * (1 - near / 130) * dt;
      if (h.kind === 'door') {
        var bounds = corridorAt(this.cavern, h.y); h.x = (bounds.left + bounds.right) / 2 + Math.sin(this.simClock * h.speed + h.phase) * 38;
        if (p.y - 12 < h.y && p.y + p.vy * dt + 12 >= h.y && (p.x < h.x - h.gap / 2 || p.x > h.x + h.gap / 2)) { this.crash('MOVING DOOR CONTACT', Math.hypot(p.vx, p.vy), 132); return; }
      }
      if (h.kind === 'piston') {
        var b2 = corridorAt(this.cavern, h.y); h.x = (b2.left + b2.right) / 2 + Math.sin(this.simClock * h.speed + h.phase) * 48;
        if (Math.abs(p.y - h.y) < 17 && Math.abs(p.x - h.x) < h.gap) { this.resolveContact('PISTON CONTACT', Math.hypot(p.vx, p.vy), 136); if (this.mode !== 'playing') return; }
      }
      if ((h.kind === 'crystal' || h.kind === 'icicle' || h.kind === 'core-orb') && dist(p.x, p.y, h.x, h.y) < h.radius + 11) { this.resolveContact(h.kind === 'crystal' ? 'CRYSTAL CONTACT' : h.kind === 'icicle' ? 'ICE NEEDLE CONTACT' : 'CORE ORB CONTACT', Math.hypot(p.vx, p.vy), 132); if (this.mode !== 'playing') return; }
      if (h.kind === 'surge' && dist(p.x, p.y, h.x, h.y) < h.radius + 13) { this.resolveContact('CORE SURGE', Math.hypot(p.vx, p.vy), 132); if (this.mode !== 'playing') return; }
    }
    var slow = p.slowFall > 0 ? .48 : 1;
    p.vy += 31 * dt * slow;
    p.vx *= Math.pow(.993, dt * 60); p.vy *= Math.pow(.999, dt * 60);
    var prevY = p.y; p.x += p.vx * dt; p.y += p.vy * dt;
    var boundsNow = corridorAt(this.cavern, p.y);
    if (p.x < boundsNow.left + 10 || p.x > boundsNow.right - 10) { this.resolveContact('CAVERN WALL', Math.hypot(p.vx, p.vy), 126); if (this.mode !== 'playing') return; p.x = clamp(p.x, boundsNow.left + 12, boundsNow.right - 12); }
    for (var pi = 0; pi < this.cavern.pads.length; pi++) { var pad = this.cavern.pads[pi]; if (!pad.landed && prevY < pad.y - 18 && p.y >= pad.y - 18 && Math.abs(p.x - pad.x) < pad.width / 2 + 10) { this.padContact(pad); if (this.mode !== 'playing') return; } }
    var shortcut = this.cavern.shortcut;
    if (!shortcut.found && prevY < shortcut.y && p.y >= shortcut.y && dist(p.x, p.y, shortcut.x, shortcut.y) < 34) { shortcut.found = true; p.y = shortcut.exitY; p.vy = Math.max(18, p.vy * .45); this.runScore += 120; this.recordBestScore(); this.showEventChip('SHORTCUT  +120', '#d7a3ff'); emit(shortcut.x, shortcut.y, C.violet, 'pickup', 28, 115, .95); emit(shortcut.x, shortcut.y, C.violet, 'ring', 2, 0, .8); kit.audio.sfx('shortcut', { volume: .7 }); }
    var beacon = this.cavern.beacon;
    if (prevY < beacon.y - 18 && p.y >= beacon.y - 18) {
      var beaconSpeed = Math.hypot(p.vx, Math.max(0, p.vy));
      if (Math.abs(p.x - beacon.x) < 62 && beaconSpeed <= 155 && Math.abs(p.angle) < 1.04) { p.y = beacon.y - 18; this.completeDescent(); return; }
      if (p.y > beacon.y + 12 || beaconSpeed > 155) { this.crash('BEACON IMPACT', beaconSpeed, 155); return; }
    }
    for (var qi = 0; qi < pickupPool.length; qi++) { var pickup = pickupPool[qi]; if (pickup.active && dist(p.x, p.y, pickup.x, pickup.y) < 24) this.collect(pickup); }
    this.runTime = Math.max(0, this.simClock - this.descentStart);
    this.beaconPulse += dt;
    if (family.key === 'vent' && Math.random() < dt * 2) emit(boundsNow.left + 8, p.y + 80, C.lava, 'ambient', 1, 24, .6);
  };
  LanderScene.prototype.resolveContact = function (label, speed, threshold) {
    if (speed > threshold || Math.abs(this.player.angle) > 1.05) this.crash(label, speed, threshold);
    else this.softBump(label, speed);
  };
  LanderScene.prototype.updateTutorial = function () {
    var t = this.tutorial; if (!t || !t.active) return;
    var previousStep = t.step;
    if (t.step === 0 && t.rotate) t.step = 1;
    else if (t.step === 1 && t.thrust) t.step = 2;
    else if (t.step === 2 && this.landingCount > 0) { t.landed = true; t.step = 3; }
    else if (t.step === 3 && t.refueled && t.landed) { t.step = 4; }
    if (t.step >= 4) { t.active = false; save.tutorialDone = true; kit.save.set(save); }
    if (t.step !== previousStep) this.coachClock = 3;
    if (this.coachClock > 0) this.coachClock = Math.max(0, this.coachClock - STEP);
    GW_DEBUG_STATE.tutorialStep = t.step; this.renderTutorial(false); this.pumpTransient();
  };
  LanderScene.prototype.updateHud = function () {
    if (!this.player || !this.cavern) return;
    var fuelRatio = clamp(this.player.fuel / this.player.maxFuel, 0, 1);
    setTextIfChanged(dom.score, '★ ' + pad(this.runScore, 5)); setTextIfChanged(dom.depth, '↓ ' + pad(this.player.y / 10, 3));
    setTextIfChanged(dom.shield, '◇ ' + this.player.shield);
    dom.fuel.style.transform = 'scaleX(' + fuelRatio.toFixed(3) + ')'; dom.fuel.style.background = this.player.fuel < this.player.maxFuel * .24 ? '#ff787c' : this.player.fuel < this.player.maxFuel * .5 ? '#ffd36d' : '#86f5c4';
    dom.fuel.parentNode.setAttribute('aria-valuenow', String(Math.round(fuelRatio * 100)));
  };

  LanderScene.prototype.updateMusicLayer = function () {
    if (this.mode !== 'playing' || !this.player || !this.cavern) return;
    var exp = EXPEDITIONS[this.currentExpedition] || EXPEDITIONS[0];
    var danger = exp.hazard + (this.player.fuel < this.player.maxFuel * .25 ? .24 : 0);
    for (var i = 0; i < hazardPool.length; i++) if (hazardPool[i].active && Math.abs(hazardPool[i].y - this.player.y) < 170) danger += .12;
    var layer = danger >= .62 ? 'intensity' : 'ambient';
    if (layer !== this.musicLayer) { this.musicLayer = layer; kit.audio.music(layer, 650); }
  };

  function updateParticles(dt) {
    for (var i = 0; i < particlePool.length; i++) { var p = particlePool[i]; if (!p.active) continue; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rotation += p.spin * dt; if (p.kind === 'smoke') p.vy -= 3 * dt; else if (p.kind !== 'ring' && p.kind !== 'trail') p.vy += p.kind === 'ambient' ? 3 * dt : 20 * dt; if (p.life <= 0) p.active = false; }
  }
  function updatePickupsVisual(dt) { for (var i = 0; i < pickupPool.length; i++) if (pickupPool[i].active) pickupPool[i].phase += dt * 2.2; }
  function syncDebug(s) {
    GW_DEBUG_STATE.mode = s.mode; GW_DEBUG_STATE.expedition = s.currentExpedition; GW_DEBUG_STATE.cavern = s.currentCavern; GW_DEBUG_STATE.score = Math.floor(s.runScore || 0); GW_DEBUG_STATE.family = s.cavern ? s.cavern.family : safeFamily(EXPEDITIONS[s.currentExpedition] || EXPEDITIONS[0]).key;
    GW_DEBUG_STATE.fuel = s.player ? Number(s.player.fuel.toFixed(2)) : 0; GW_DEBUG_STATE.depth = s.player ? Math.floor(s.player.y) : 0; GW_DEBUG_STATE.landingGrade = s.lastLanding || ''; GW_DEBUG_STATE.burnRate = s.player ? Number(s.player.burnRate.toFixed(2)) : 0; GW_DEBUG_STATE.shield = s.player ? s.player.shield : 0;
    GW_DEBUG_STATE.liveHazards = []; GW_DEBUG_STATE.livePickups = [];
    for (var i = 0; i < hazardPool.length; i++) if (hazardPool[i].active) GW_DEBUG_STATE.liveHazards.push({ kind: hazardPool[i].kind, x: Math.round(hazardPool[i].x), y: Math.round(hazardPool[i].y) });
    for (var j = 0; j < pickupPool.length; j++) if (pickupPool[j].active) GW_DEBUG_STATE.livePickups.push({ kind: pickupPool[j].kind, x: Math.round(pickupPool[j].x), y: Math.round(pickupPool[j].y) });
    if (typeof window !== 'undefined' && window.__gw) { window.__gw.state = GW_DEBUG_STATE; window.__gw.state.forceExpedition = readForce('forceExpedition'); window.__gw.state.forceCavern = readForce('forceCavern'); }
  }

  LanderScene.prototype.pollForceSwitches = function () {
    var a = readForce('forceExpedition'); var b = readForce('forceCavern'); var key = String(a) + '|' + String(b);
    var hasA = a != null && a !== ''; var hasB = b != null && b !== '';
    if (!hasA && !hasB) { this.lastForceKey = ''; return; }
    if (key !== this.lastForceKey && this.mode !== 'playing') { this.lastForceKey = key; this.startDescent(this.currentExpedition, this.currentCavern); }
    else if (key !== this.lastForceKey && this.mode === 'playing') { this.lastForceKey = key; this.startDescent(this.currentExpedition, this.currentCavern); }
  };
  LanderScene.prototype.update = function (_time, delta) {
    this.pollForceSwitches();
    this.juiceFrame = kit.juice.frame();
    if (this.pausedByKit || kit.paused || this.juiceFrame.frozen) { this.renderScene(this.juiceFrame); return; }
    var elapsed = Number(delta || 0) / 1000;
    if (Number.isFinite(elapsed) && elapsed > 0) this.accumulator += elapsed;
    while (this.accumulator >= STEP) { this.step(STEP); this.accumulator -= STEP; }
    this.renderScene(this.juiceFrame);
  };

  LanderScene.prototype.renderScene = function (juiceFrame) {
    var fx = juiceFrame || { dx: 0, dy: 0 };
    this.cameras.main.setScroll(-fx.dx, this.cameraY - fx.dy);
    this.drawBackground(); this.drawWorld(); this.drawParticles();
    if (this.player) this.drawLander(juiceFrame); else { this.overlay.clear(); this.overlay.x = 0; this.overlay.y = 0; if (this.shipImage) this.shipImage.setVisible(false); }
    if (dom.damage) dom.damage.style.opacity = String(clamp(this.damageFlash, 0, 1));
    this.drawBanner();
  };
  LanderScene.prototype.drawBackground = function () {
    var g = this.bg; g.clear(); var top = this.cameraY - 40;
    g.fillGradientStyle(C.deep, C.ink, 1, 1); g.fillRect(0, top, W, H + 80);
    for (var layer = 0; layer < 3; layer++) {
      var factor = [.16, .31, .48][layer]; var base = this.cameraY + 60 + layer * 88 - this.cameraY * (1 - factor); var color = layer === 0 ? 0x102c42 : layer === 1 ? 0x0d2234 : 0x0a1929;
      g.fillStyle(color, .6 - layer * .11); g.beginPath(); g.moveTo(0, base + 190); g.lineTo(0, base);
      for (var x = 0; x <= W; x += 22) g.lineTo(x, base + 24 + Math.sin(x * .05 + layer * 2.3) * 17 + (x % 44) * .55);
      g.lineTo(W, base + 190); g.closePath(); g.fillPath();
    }
    if (!this.cavern) { g.fillStyle(0x0c2535, .45); for (var s = 0; s < 28; s++) { var sx = (s * 83) % W; var sy = 95 + ((s * 137) % 480); g.fillCircle(sx, sy, 1 + (s % 3) * .5); } return; }
    var family = safeFamily(this.cavern.family); var random = rng(this.cavern.seed + 93); g.fillStyle(family.accent, .16);
    for (var star = 0; star < 22; star++) { var starY = this.cameraY + random() * H; var starX = random() * W; g.fillCircle(starX, starY, 0.7 + random() * 1.8); }
    g.fillStyle(family.accent, .08); g.fillCircle(W * .5, this.cameraY + H * .42, 95 + Math.sin(this.simClock) * 8);
  };
  LanderScene.prototype.drawWorld = function () {
    var g = this.world; g.clear(); if (!this.cavern) return;
    var family = safeFamily(this.cavern.family); var top = this.cameraY - 70; var bottom = this.cameraY + H + 70;
    var leftPts = []; var rightPts = [];
    for (var i = 0; i < this.cavern.points.length; i++) { var pt = this.cavern.points[i]; if (pt.y >= top && pt.y <= bottom) { leftPts.push(pt); rightPts.push(pt); } }
    if (leftPts.length < 2) return;
    g.fillGradientStyle(family.rock, C.rock, family.rock, 0x07101b, 1); g.beginPath(); g.moveTo(0, top); for (var l = 0; l < leftPts.length; l++) g.lineTo(leftPts[l].left, leftPts[l].y); g.lineTo(0, bottom); g.closePath(); g.fillPath();
    g.fillGradientStyle(C.rock, family.rock, 0x07101b, family.rock, 1); g.beginPath(); g.moveTo(W, top); for (var r = 0; r < rightPts.length; r++) g.lineTo(rightPts[r].right, rightPts[r].y); g.lineTo(W, bottom); g.closePath(); g.fillPath();
    this.drawWallRibs(g, leftPts, -1, family); this.drawWallRibs(g, rightPts, 1, family);
    this.drawFamilySilhouette(g, family, top, bottom);
    this.drawPads(g); this.drawChambers(g); this.drawShortcut(g); this.drawHazards(g); this.drawBeacon(g); this.drawPickups(g);
  };
  LanderScene.prototype.drawWallRibs = function (g, points, side, family) {
    g.lineStyle(8, 0x08131f, .92); g.beginPath(); for (var i = 0; i < points.length; i++) { var x = side < 0 ? points[i].left : points[i].right; if (i === 0) g.moveTo(x, points[i].y); else g.lineTo(x, points[i].y); } g.strokePath();
    g.lineStyle(2, family.accent, .8); g.beginPath(); for (var j = 0; j < points.length; j++) { var xx = side < 0 ? points[j].left : points[j].right; if (j === 0) g.moveTo(xx, points[j].y); else g.lineTo(xx, points[j].y); } g.strokePath();
    for (var k = 0; k < points.length - 1; k += 2) { var a = points[k]; var b = points[k + 1]; g.lineStyle(1, family.accent, .17); g.beginPath(); g.moveTo(side < 0 ? a.left + 8 : a.right - 8, a.y); g.lineTo(side < 0 ? b.left + 25 : b.right - 25, b.y); g.strokePath(); }
  };
  LanderScene.prototype.drawFamilySilhouette = function (g, family, top, bottom) {
    var y = Math.max(top, this.cameraY + 130); if (family.key === 'crystal') { for (var i = 0; i < 5; i++) { var cy = y + i * 134; var cb = corridorAt(this.cavern, cy); var side = i % 2 ? 1 : -1; var x = side < 0 ? cb.left + 38 : cb.right - 38; g.fillStyle(C.crystal, .2); g.beginPath(); g.moveTo(x, cy + 33); g.lineTo(x + side * 25, cy - 10); g.lineTo(x + side * 7, cy - 44); g.lineTo(x - side * 14, cy - 18); g.closePath(); g.fillPath(); } }
    else if (family.key === 'vent') { for (var v = 0; v < 4; v++) { var vy = y + 90 + v * 160; var vb = corridorAt(this.cavern, vy); g.fillStyle(C.lava, .11); g.fillCircle(v % 2 ? vb.right - 12 : vb.left + 12, vy, 28 + Math.sin(this.simClock * 2 + v) * 5); } }
    else if (family.key === 'ice') { for (var ic = 0; ic < 6; ic++) { var iy = y + 50 + ic * 112; var ib = corridorAt(this.cavern, iy); var ix = ic % 2 ? ib.right - 25 : ib.left + 25; g.fillStyle(C.blue, .25); g.beginPath(); g.moveTo(ix - 17, iy - 12); g.lineTo(ix + 14, iy - 12); g.lineTo(ix + 4, iy + 33); g.lineTo(ix - 8, iy + 48); g.closePath(); g.fillPath(); } }
    else if (family.key === 'machine') { for (var m = 0; m < 5; m++) { var my = y + 70 + m * 145; var mb = corridorAt(this.cavern, my); g.lineStyle(3, C.machine, .2); g.strokeRect(mb.left + 5, my - 22, mb.right - mb.left - 10, 44); g.lineStyle(1, C.machine, .4); g.lineBetween(mb.left + 8, my - 18, mb.right - 8, my + 18); } }
    else { for (var q = 0; q < 4; q++) { var qy = y + 110 + q * 170; var qb = corridorAt(this.cavern, qy); g.fillStyle(C.mint, .13); g.fillCircle((qb.left + qb.right) / 2, qy, 44 + Math.sin(this.simClock * 1.5 + q) * 5); g.lineStyle(2, C.mint, .35); g.strokeCircle((qb.left + qb.right) / 2, qy, 35); } }
  };
  LanderScene.prototype.drawChambers = function (g) {
    if (!this.cavern.chambers) return;
    for (var i = 0; i < this.cavern.chambers.length; i++) {
      var chamber = this.cavern.chambers[i];
      if (chamber.y < this.cameraY - 30 || chamber.y > this.cameraY + H + 30) continue;
      var b = corridorAt(this.cavern, chamber.y); var cx = (b.left + b.right) / 2;
      g.lineStyle(2, C.mint, .45); g.strokeCircle(cx, chamber.y, 30 + Math.sin(this.simClock * 2 + i) * 3);
      g.lineStyle(1, C.white, .32); g.lineBetween(b.left + 11, chamber.y - 17, cx - 25, chamber.y - 17); g.lineBetween(cx + 25, chamber.y - 17, b.right - 11, chamber.y - 17);
    }
  };
  LanderScene.prototype.drawPads = function () {
    for (var hidden = 0; hidden < this.padImages.length; hidden++) this.padImages[hidden].setVisible(false);
    for (var i = 0; i < this.cavern.pads.length; i++) {
      var p = this.cavern.pads[i]; var visual = this.padImages[i];
      if (!visual || p.y < this.cameraY - 30 || p.y > this.cameraY + H + 30) continue;
      var pulse = 1 + Math.sin(this.simClock * 3 + i) * .08;
      visual.setPosition(p.x, p.y).setDisplaySize(104 * pulse, 36).setAlpha(p.landed ? .62 : .98).setVisible(true);
      if (p.landed) visual.setTint(0x3cae82); else visual.clearTint();
    }
  };
  LanderScene.prototype.drawShortcut = function () {
    var s = this.cavern.shortcut; if (!this.shortcutImage) return;
    this.shortcutImage.setVisible(false);
    if (!s || s.y < this.cameraY - 50 || s.y > this.cameraY + H + 50) return;
    var b = corridorAt(this.cavern, s.y); var x = s.side < 0 ? b.left + 4 : b.right - 4;
    this.shortcutImage.setPosition(x, s.y).setDisplaySize(52, 52).setAlpha(s.found ? .35 : .98).setRotation(s.side < 0 ? -.35 : .35).setVisible(true);
  };
  LanderScene.prototype.drawHazards = function (g) {
    renderState.hazardCount = 0;
    for (var hidden = 0; hidden < this.hazardImages.length; hidden++) this.hazardImages[hidden].setVisible(false);
    for (var i = 0; i < hazardPool.length; i++) { var h = hazardPool[i]; if (!h.active || h.y < this.cameraY - 70 || h.y > this.cameraY + H + 70) continue; var rsH = renderState.hazards[renderState.hazardCount++]; rsH.id = h.id; rsH.kind = h.kind; rsH.x = h.x; rsH.y = h.y; rsH.phase = h.phase; var visual = this.hazardImages[h.id]; if (!visual) continue; var texture = h.kind === 'crystal' ? 'hazard-crystal' : h.kind === 'icicle' ? 'hazard-ice' : h.kind === 'vent' ? 'hazard-vent' : h.kind === 'door' || h.kind === 'piston' ? 'hazard-machine' : 'hazard-core'; visual.setTexture(texture).setPosition(h.x, h.y).setRotation(h.kind === 'icicle' ? Math.sin(this.simClock * h.speed + h.phase) * .12 : h.phase + this.simClock * .5).setAlpha(.96).setVisible(true);
      if (h.kind === 'door') visual.setDisplaySize(150, 32); else if (h.kind === 'piston') visual.setDisplaySize(100, 38); else if (h.kind === 'vent') visual.setDisplaySize(54, 50); else visual.setDisplaySize(Math.max(34, h.radius * 2.8), Math.max(34, h.radius * 2.8));
    }
  };
  LanderScene.prototype.drawBeacon = function () { var b = this.cavern.beacon; if (!this.beaconImage) return; this.beaconImage.setVisible(false); if (!b || b.y < this.cameraY - 90 || b.y > this.cameraY + H + 90) return; var pulse = 1 + Math.sin(this.simClock * 4) * .1; this.beaconImage.setPosition(b.x, b.y).setDisplaySize(86 * pulse, 86 * pulse).setVisible(true); };
  LanderScene.prototype.drawPickups = function () { renderState.pickupCount = 0; for (var hidden = 0; hidden < this.pickupImages.length; hidden++) this.pickupImages[hidden].setVisible(false); for (var i = 0; i < pickupPool.length; i++) { var p = pickupPool[i]; if (!p.active || p.y < this.cameraY - 40 || p.y > this.cameraY + H + 40) continue; var rsP = renderState.pickups[renderState.pickupCount++]; rsP.id = p.id; rsP.kind = p.kind; rsP.x = p.x; rsP.y = p.y; var visual = this.pickupImages[p.id]; if (!visual) continue; var texture = p.kind === 'fuel' ? 'pickup-fuel' : p.kind === 'shield' ? 'pickup-shield' : p.kind === 'crystal' ? 'pickup-crystal' : 'pickup-bubble'; visual.setTexture(texture).setPosition(p.x, p.y + Math.sin(p.phase) * 4).setDisplaySize(40, 40).setRotation(p.phase * .4).setVisible(true); } };
  LanderScene.prototype.drawParticles = function () { var g = this.fx; g.clear(); renderState.particleCount = 0; for (var i = 0; i < particlePool.length; i++) { var p = particlePool[i]; if (!p.active || p.y < this.cameraY - 20 || p.y > this.cameraY + H + 20) continue; var rsP = renderState.particles[renderState.particleCount++]; rsP.x = p.x; rsP.y = p.y; rsP.life = p.life; rsP.max = p.max; var progress = clamp(p.life / p.max, 0, 1); var fade = progress * progress; if (p.kind === 'ring') { g.lineStyle(2, p.color, fade * .9); g.strokeCircle(p.x, p.y, p.size * (2.5 + (1 - progress) * 20)); } else if (p.kind === 'smoke') { g.fillStyle(p.color, fade * .22); g.fillCircle(p.x, p.y, p.size * (1.5 + (1 - progress) * 4)); } else if (p.kind === 'thrust') { g.lineStyle(Math.max(1, p.size * progress), p.color, fade); g.lineBetween(p.x, p.y, p.x - p.vx * .12, p.y - p.vy * .12); } else if (p.kind === 'impact') { var size = p.size * (.7 + progress); g.fillStyle(p.color, fade); g.fillTriangle(p.x, p.y - size, p.x + size, p.y, p.x, p.y + size); } else if (p.kind === 'burst' || p.kind === 'pickup') { g.fillStyle(p.color, fade); g.fillCircle(p.x, p.y, p.size * (1 + progress)); } else { g.fillStyle(p.color, fade * .8); g.fillCircle(p.x, p.y, p.size * (.5 + progress)); } } };
  LanderScene.prototype.drawLander = function () { if (!this.player || !this.shipImage) return; var p = this.player; var damaged = p.flash > 0 && Math.floor(this.simClock * 24) % 2 === 0; var texture = damaged ? 'lander-damaged' : p.thrusting && p.fuel > 0 && this.mode === 'playing' ? 'lander-thrust' : 'lander-idle'; renderState.ship = { x: p.x, y: p.y, angle: p.angle, thrust: p.thrusting, gear: Math.abs(p.vy) < 78 ? 1 : 0 }; this.overlay.clear(); this.shipImage.setTexture(texture).setPosition(p.x, p.y).setRotation(p.angle).setDisplaySize(64, 64).setAlpha(p.invulnerable > 0 && Math.floor(this.simClock * 18) % 2 === 0 ? .35 : 1).setVisible(true); };
  LanderScene.prototype.nearPadDistance = function () { if (!this.cavern || !this.player) return 999; var best = 999; for (var i = 0; i < this.cavern.pads.length; i++) if (!this.cavern.pads[i].landed) best = Math.min(best, dist(this.player.x, this.player.y, this.cavern.pads[i].x, this.cavern.pads[i].y)); return best; };
  LanderScene.prototype.drawBanner = function () { var b = this.banner; if (!b) return; var reduceMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; var age = b.age; var enter = reduceMotion ? 1 : clamp(age / .28, 0, 1); var overshoot = reduceMotion ? 1 : 1 + Math.sin(clamp(age / .6, 0, 1) * Math.PI) * .09; var scale = (enter < 1 ? enter * (1.08 - .08 * enter) : 1) * overshoot; var fade = age > b.life - .38 ? clamp((b.life - age) / .38, 0, 1) : 1; this.bannerG.clear(); this.bannerG.setAlpha(fade); this.bannerG.fillStyle(0x071725, .94); this.bannerG.fillRoundedRect(W * .18, 246, W * .64, 96, 8); this.bannerG.lineStyle(2, Phaser.Display.Color.HexStringToColor(b.color).color, .9); this.bannerG.strokeRoundedRect(W * .18, 246, W * .64, 96, 8); this.bannerKicker.setText(b.kicker); this.bannerTitle.setText(b.title); this.bannerSub.setText(b.sub); this.bannerKicker.setScale(scale).setAlpha(fade); this.bannerTitle.setScale(scale).setAlpha(fade); this.bannerSub.setScale(scale).setAlpha(fade); };

  function updateMenu(sceneRef) {
    dom.list.innerHTML = '';
    for (var i = 0; i < EXPEDITIONS.length; i++) { (function (index) { var exp = EXPEDITIONS[index]; var button = document.createElement('button'); button.className = 'expedition'; button.type = 'button'; button.disabled = index > save.unlocked; button.innerHTML = exp.name + '<small>' + exp.short + ' · ' + exp.descents + ' descents</small>' + (button.disabled ? '<span class="lock">LOCKED</span>' : '<span class="lock">' + (save.medals[index] ? ['','I','II','III','IV'][save.medals[index]] : 'GO') + '</span>'); button.addEventListener('click', function () { kit.audio.sfx('beacon', { volume: .35 }); sceneRef.startDescent(index, 0); }); dom.list.appendChild(button); })(i); }
  }
  function showResult(sceneRef, kicker, title, copy, action) { sceneRef.clearTransient(); setTextIfChanged(dom.resultKicker, kicker); setTextIfChanged(dom.resultTitle, title); dom.resultCopy.innerHTML = copy; setTextIfChanged(dom.resultAction, action); setDom(dom.result, 'visible', true); }
  function advanceResult(sceneRef) { var exp = EXPEDITIONS[sceneRef.currentExpedition] || EXPEDITIONS[0]; if (sceneRef.mode === 'crashed') sceneRef.startDescent(sceneRef.currentExpedition, sceneRef.currentCavern, false); else if (sceneRef.currentCavern < exp.descents - 1) sceneRef.startDescent(sceneRef.currentExpedition, sceneRef.currentCavern + 1, true); else if (sceneRef.currentExpedition < EXPEDITIONS.length - 1) sceneRef.startDescent(sceneRef.currentExpedition + 1, 0, true); else sceneRef.startDescent(5, 0, true); }

  var scene = null;
  function claimControl(event) { var button = event.currentTarget; var action = button.id.replace('-control', ''); event.preventDefault(); event.stopPropagation(); if (event.type === 'pointerdown') { kit.input.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, downAt: performance.now(), zone: action }); try { button.setPointerCapture(event.pointerId); } catch (_) {} button.classList.add('active'); } else { kit.input.pointers.delete(event.pointerId); button.classList.remove('active'); } }
  ['left', 'main', 'right'].forEach(function (action) { var button = document.getElementById(action + '-control'); ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) { button.addEventListener(type, claimControl, { passive: false }); }); });
  dom.resultAction.addEventListener('click', function (event) { event.preventDefault(); if (scene) advanceResult(scene); });
  dom.resultMenu.addEventListener('click', function (event) { event.preventDefault(); if (scene) scene.startMenu(); });
  dom.settings.addEventListener('click', function (event) { event.preventDefault(); if (scene) kit.openSettings(); });
  window.addEventListener('blur', function () { kit.input.clearAll(); document.querySelectorAll('.control').forEach(function (button) { button.classList.remove('active'); }); });
  document.addEventListener('pointerdown', function () { if (scene && scene.mode === 'menu') return; }, { passive: true });

  var config = { type: Phaser.AUTO, parent: 'game', width: W, height: H, backgroundColor: '#050b16', render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [LanderScene] };
  var game = new Phaser.Game(config);
  game.events.once('ready', function () { scene = game.scene.getScene('GravityWellScene'); });
  setTimeout(function () { if (!scene && game.scene && game.scene.getScene) scene = game.scene.getScene('GravityWellScene'); }, 0);
})();
