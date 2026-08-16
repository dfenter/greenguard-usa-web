/* Sporeling Saga - rank 20 idle-RPG lane.
 * Phaser renders the authored view. GGKit owns lifecycle, pointer identity,
 * keyboard input, save validation, audio, settings, restart and PWA registration.
 * Phaser pointer-up and browser gamepad edges are lossless input bridges.
 */
(function () {
  'use strict';

  var W = 390;
  var H = 844;
  var RETINA_FACTOR = GGKit.hiDpi.factor(W, H);
  var STEP = 1 / 60;
  var MAX_PARTICLES = 96;
  var MAX_FLOATERS = 8;
  var MAX_HISTORY = 64;
  var TAU = Math.PI * 2;
  var ACTION_ATTACK = 1;
  var ACTION_FORAGE = 2;
  var ACTION_SUMMON = 4;
  var ACTION_EVOLVE = 8;
  var MAX_FORAGE = 4;
  var FORAGE_COOLDOWN = 4.5;
  var EVOLUTION_COST = 5;
  var VERSION = '2026-08-11-aaa-f14';

  var LANES = [
    {
      id: 'mossy-trail', name: 'MOSSY TRAIL', sub: 'Dewlight foothills', color: '#78d7a7',
      foes: [
        { id: 'dewcap', name: 'Dewcap', color: '#69c6a5', shape: 'cap' },
        { id: 'thornlug', name: 'Thornlug', color: '#d5a96a', shape: 'horn' },
        { id: 'barkbit', name: 'Barkbit', color: '#b87967', shape: 'crawler' }
      ],
      odds: { gear: 0.50, food: 0.35, trinket: 0.15 }, xp: 12
    },
    {
      id: 'spore-marsh', name: 'SPORE MARSH', sub: 'Bell reeds and warm mud', color: '#a8df6f',
      foes: [
        { id: 'mire-mote', name: 'Mire Mote', color: '#e47b88', shape: 'orb' },
        { id: 'bog-bell', name: 'Bog Bell', color: '#e0ba61', shape: 'bell' },
        { id: 'reedclaw', name: 'Reedclaw', color: '#78c594', shape: 'reed' }
      ],
      odds: { gear: 0.46, food: 0.38, trinket: 0.16 }, xp: 17
    },
    {
      id: 'fungal-deep', name: 'FUNGAL DEEP', sub: 'Glowroots below the shelf', color: '#c08cf5',
      foes: [
        { id: 'cinder-crawler', name: 'Cinder Crawler', color: '#ef8b61', shape: 'crawler' },
        { id: 'velvet-maw', name: 'Velvet Maw', color: '#61c5bb', shape: 'maw' },
        { id: 'gloom-grub', name: 'Gloom Grub', color: '#9d86e8', shape: 'hopper' }
      ],
      odds: { gear: 0.44, food: 0.34, trinket: 0.22 }, xp: 23
    },
    {
      id: 'saga-finale', name: 'SPORELING SAGA', sub: 'The crownseed chamber', color: '#ffd477',
      foes: [
        { id: 'crown-mantis', name: 'Crown Mantis', color: '#f09a6c', shape: 'horn' },
        { id: 'mycelial-warden', name: 'Mycelial Warden', color: '#77d9cf', shape: 'maw' },
        { id: 'rotfang', name: 'Rotfang', color: '#c8d66d', shape: 'reed' }
      ],
      odds: { gear: 0.40, food: 0.34, trinket: 0.26 }, xp: 31
    }
  ];

  var FALLBACK_FOE = { id: 'fallback-foe', name: 'Moss Wisp', color: '#69c6a5', shape: 'orb' };
  var CREATURES = [
    { id: 'rootling', name: 'Rootling', color: '#65c8aa', kind: 'root', power: 0, armor: 0, tempo: 0 },
    { id: 'dewcap', name: 'Dewcap', color: '#69c6a5', kind: 'cap', power: 1, armor: 0, tempo: 0.03 },
    { id: 'thornlug', name: 'Thornlug', color: '#d5a96a', kind: 'horn', power: 1, armor: 1, tempo: 0 },
    { id: 'barkbit', name: 'Barkbit', color: '#b87967', kind: 'crawler', power: 2, armor: 1, tempo: -0.02 },
    { id: 'mire-mote', name: 'Mire Mote', color: '#e47b88', kind: 'orb', power: 1, armor: 0, tempo: 0.08 },
    { id: 'bog-bell', name: 'Bog Bell', color: '#e0ba61', kind: 'bell', power: 2, armor: 0, tempo: 0.03 },
    { id: 'reedclaw', name: 'Reedclaw', color: '#78c594', kind: 'reed', power: 1, armor: 2, tempo: 0 },
    { id: 'cinder-crawler', name: 'Cinder Crawler', color: '#ef8b61', kind: 'crawler', power: 3, armor: 0, tempo: 0.05 },
    { id: 'velvet-maw', name: 'Velvet Maw', color: '#61c5bb', kind: 'maw', power: 3, armor: 1, tempo: 0 },
    { id: 'gloom-grub', name: 'Gloom Grub', color: '#9d86e8', kind: 'hopper', power: 2, armor: 0, tempo: 0.10 },
    { id: 'crown-mantis', name: 'Crown Mantis', color: '#f09a6c', kind: 'horn', power: 4, armor: 0, tempo: 0.05 },
    { id: 'mycelial-warden', name: 'Mycelial Warden', color: '#77d9cf', kind: 'maw', power: 3, armor: 3, tempo: 0 },
    { id: 'rotfang', name: 'Rotfang', color: '#c8d66d', kind: 'reed', power: 4, armor: 1, tempo: 0.02 }
  ];
  var BRANCHES = [
    {
      id: 'guardian', label: 'GUARDIAN', glyph: '◈', color: '#73e2d0', final: 'AEGISROOT',
      tiers: [
        { power: 2, armor: 4, guard: 0.08, tempo: 0, crit: 0, food: 0, skill: 'BRACE', detail: '8% less incoming damage' },
        { power: 3, armor: 5, guard: 0.12, tempo: 0, crit: 0, food: 0, skill: 'BULWARK', detail: '12% less incoming damage' },
        { power: 5, armor: 7, guard: 0.18, tempo: 0, crit: 0, food: 0, skill: 'AEGIS', detail: '18% less incoming damage' }
      ]
    },
    {
      id: 'trickster', label: 'TRICKSTER', glyph: '✦', color: '#c09aff', final: 'GLIMMERJACK',
      tiers: [
        { power: 2, armor: 0, tempo: 0.18, crit: 0.07, food: 0, skill: 'AFTERIMAGE', detail: '+7% critical strike chance' },
        { power: 3, armor: 0, tempo: 0.23, crit: 0.14, food: 0, skill: 'FEINT', detail: '+14% critical strike chance' },
        { power: 5, armor: 1, tempo: 0.28, crit: 0.22, food: 0, skill: 'MIRAGE', detail: '+22% critical strike chance' }
      ]
    },
    {
      id: 'bloom', label: 'BLOOM', glyph: '✿', color: '#b6e76d', final: 'VERDANT HALO',
      tiers: [
        { power: 1, armor: 1, tempo: 0.06, crit: 0, food: 12, skill: 'SPOREWELL', detail: 'Food restores +12 vitality' },
        { power: 2, armor: 2, tempo: 0.08, crit: 0, food: 22, skill: 'POLLENHEART', detail: 'Food restores +22 vitality' },
        { power: 4, armor: 3, tempo: 0.10, crit: 0, food: 35, skill: 'CROWNSEED', detail: 'Food restores +35 vitality' }
      ]
    }
  ];

  var TRIALS = [
    { id: 'warden-bark', name: "WARDEN'S BARK", sub: 'Hold the moss line', color: '#73e2d0', path: ['guardian', 'guardian', 'bloom'] },
    { id: 'mirage-run', name: 'MIRAGE RUN', sub: 'Tempo turns into luck', color: '#c09aff', path: ['guardian', 'trickster', 'trickster'] },
    { id: 'crownseed-rise', name: 'CROWNSEED RISE', sub: 'A generous bloom climb', color: '#b6e76d', path: ['bloom', 'bloom', 'guardian'] }
  ];

  var DEBUG_STATE = {
    version: VERSION, mode: 'run', status: 'boot', rank: 1, xp: 0, branch: '',
    foraged: 0, lane: 'mossy-trail', seed: 0, xpPerMinute: 0, forceRank: null, forceBranch: null
  };
  var pendingForceRank = null;
  var pendingForceBranch = '';
  var liveScene = null;
  var Game = { play: null, phaser: null };

  function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }
  function finite(value, fallback) { return typeof value === 'number' && isFinite(value) ? value : fallback; }
  function safeColor(hex, fallback) {
    try { return Phaser.Display.Color.HexStringToColor(hex || fallback || '#ffffff').color; } catch (_) { return Phaser.Display.Color.HexStringToColor(fallback || '#ffffff').color; }
  }
  function textValue(value) { return value == null ? '' : String(value); }
  function setTextIfChanged(text, value) {
    if (!text) return;
    var next = textValue(value);
    if (text._ssText !== next) { text._ssText = next; text.setText(next); }
  }
  function setColorIfChanged(text, color) {
    if (!text || text._ssColor === color) return;
    text._ssColor = color;
    text.setColor(color);
  }
  function setTextureIfChanged(image, key) {
    if (image && image._ssTexture !== key) { image._ssTexture = key; image.setTexture(key); }
  }
  function branchById(id) {
    for (var i = 0; i < BRANCHES.length; i += 1) if (BRANCHES[i].id === id) return BRANCHES[i];
    return BRANCHES[0];
  }
  function laneByRank(rank) {
    var n = clamp(Math.floor(finite(rank, 1)), 1, 20);
    if (n <= 5) return LANES[0];
    if (n <= 10) return LANES[1];
    if (n <= 15) return LANES[2];
    return LANES[3];
  }
  function trialById(id) {
    for (var i = 0; i < TRIALS.length; i += 1) if (TRIALS[i].id === id) return TRIALS[i];
    return TRIALS[0];
  }
  function creatureById(id) {
    for (var i = 0; i < CREATURES.length; i += 1) if (CREATURES[i].id === id) return CREATURES[i];
    return CREATURES[0];
  }
  function safeFoe(lane, index) {
    var list = lane && Array.isArray(lane.foes) ? lane.foes : [];
    return list[index % Math.max(1, list.length)] || FALLBACK_FOE;
  }
  function xpForNext(rank) { return Math.round(22 + rank * 9 + rank * rank * 0.52); }
  function medalTier(value, bronze, silver, gold) { return value >= gold ? 3 : value >= silver ? 2 : value >= bronze ? 1 : 0; }
  function medalLabel(tier) { return tier === 3 ? 'GOLD' : tier === 2 ? 'SILVER' : tier === 1 ? 'BRONZE' : 'NONE'; }
  function makeSeed() {
    var seed = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        var values = new Uint32Array(1);
        window.crypto.getRandomValues(values);
        seed ^= values[0];
      }
    } catch (_) {}
    return seed || 1;
  }
  function makeRng(seed) {
    var value = seed >>> 0;
    return function () { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
  }
  function defaultProfile() {
    return {
      v: 2, bestRank: 1, bestScore: 0, wins: 0, legacy: 0, bestRate: 0, evolutionShards: 5,
      medals: { rank: 0, rate: 0, streak: 0 },
      branchCounts: { guardian: 0, trickster: 0, bloom: 0 },
      branchUnlocks: { guardian: true, trickster: false, bloom: false },
      collection: { rootling: 1 }, playerCollections: [{ rootling: 1 }, { rootling: 1 }], colony: { rank: 1, spores: 0 }
    };
  }
  function validProfile(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || (obj.v !== 1 && obj.v !== 2)) return false;
    if (!Number.isSafeInteger(obj.bestRank) || obj.bestRank < 1 || obj.bestRank > 20) return false;
    if (!Number.isSafeInteger(obj.bestScore) || obj.bestScore < 0 || obj.bestScore > 999999999) return false;
    if (!Number.isSafeInteger(obj.wins) || obj.wins < 0 || obj.wins > 999999) return false;
    if (!Number.isSafeInteger(obj.legacy) || obj.legacy < 0 || obj.legacy > 20) return false;
    if (!Number.isFinite(obj.bestRate) || obj.bestRate < 0 || obj.bestRate > 999999) return false;
    if (!obj.medals || !obj.branchCounts || !obj.branchUnlocks) return false;
    for (var i = 0; i < BRANCHES.length; i += 1) {
      var id = BRANCHES[i].id;
      if (!Number.isSafeInteger(obj.branchCounts[id]) || obj.branchCounts[id] < 0 || obj.branchCounts[id] > 9999) return false;
      if (typeof obj.branchUnlocks[id] !== 'boolean') return false;
    }
    if (obj.branchUnlocks.guardian !== true) return false;
    if (obj.branchUnlocks.trickster && obj.branchCounts.guardian < 1) return false;
    if (obj.branchUnlocks.bloom && (!obj.branchUnlocks.trickster || obj.branchCounts.trickster < 1)) return false;
    if (obj.v === 2) {
      if (!Number.isSafeInteger(obj.evolutionShards) || obj.evolutionShards < 0 || obj.evolutionShards > 9999) return false;
      if (!obj.collection || !obj.playerCollections || !Array.isArray(obj.playerCollections) || obj.playerCollections.length !== 2 || !obj.colony || !Number.isSafeInteger(obj.colony.rank) || obj.colony.rank < 1 || obj.colony.rank > 200 || !Number.isSafeInteger(obj.colony.spores) || obj.colony.spores < 0 || obj.colony.spores > 999999) return false;
      for (var ci = 0; ci < CREATURES.length; ci += 1) if (obj.collection[CREATURES[ci].id] != null && (!Number.isSafeInteger(obj.collection[CREATURES[ci].id]) || obj.collection[CREATURES[ci].id] < 0 || obj.collection[CREATURES[ci].id] > 9999)) return false;
      for (var pi = 0; pi < 2; pi += 1) { if (!obj.playerCollections[pi] || typeof obj.playerCollections[pi] !== 'object' || Array.isArray(obj.playerCollections[pi])) return false; for (var pci = 0; pci < CREATURES.length; pci += 1) if (obj.playerCollections[pi][CREATURES[pci].id] != null && (!Number.isSafeInteger(obj.playerCollections[pi][CREATURES[pci].id]) || obj.playerCollections[pi][CREATURES[pci].id] < 0 || obj.playerCollections[pi][CREATURES[pci].id] > 9999)) return false; }
    }
    return ['rank', 'rate', 'streak'].every(function (key) {
      return Number.isSafeInteger(obj.medals[key]) && obj.medals[key] >= 0 && obj.medals[key] <= 3;
    });
  }

  var kit = GGKit.create({
    slug: 'sporeling-saga', orientation: 'portrait', validateSave: validProfile,
    onPause: function (reason) { if (Game.play) Game.play.onKitPause(reason); },
    onResume: function () { if (Game.play) Game.play.onKitResume(); },
    onRestart: function () { if (Game.play) Game.play.restartRun(); }
  });
  var profile = null;

  function ensureProfile() {
    var fallback = defaultProfile();
    profile = kit.save.get(fallback);
    if (!validProfile(profile)) profile = fallback;
    profile.v = 2;
    if (!profile.branchUnlocks.guardian) profile.branchUnlocks.guardian = true;
    profile.evolutionShards = Number.isSafeInteger(profile.evolutionShards) ? profile.evolutionShards : 5;
    profile.collection = profile.collection || { rootling: 1 };
    profile.collection.rootling = Math.max(1, Number(profile.collection.rootling) || 1);
    profile.playerCollections = profile.playerCollections || [{ rootling: profile.collection.rootling }, { rootling: profile.collection.rootling }];
    for (var pi = 0; pi < 2; pi += 1) profile.playerCollections[pi] = profile.playerCollections[pi] || { rootling: 1 };
    profile.playerCollections[0].rootling = Math.max(1, Number(profile.playerCollections[0].rootling) || 1); profile.playerCollections[1].rootling = Math.max(1, Number(profile.playerCollections[1].rootling) || 1);
    profile.colony = profile.colony || { rank: 1, spores: 0 };
    profile.colony.rank = clamp(Math.floor(Number(profile.colony.rank) || 1), 1, 200);
    profile.colony.spores = Math.max(0, Math.floor(Number(profile.colony.spores) || 0));
    persist();
  }
  function persist() { if (profile) kit.save.set(profile); }
  function updateBranchChain(selected) {
    if (selected === 'guardian') profile.branchUnlocks.trickster = true;
    if (selected === 'trickster') profile.branchUnlocks.bloom = true;
    profile.branchCounts[selected] = Math.min(9999, profile.branchCounts[selected] + 1);
    persist();
  }
  function safeForceRank(value) {
    var n = Number(value);
    return isFinite(n) ? clamp(Math.floor(n), 1, 20) : null;
  }
  function safeForceBranch(value) {
    var id = textValue(value).toLowerCase();
    return branchById(id).id === id ? id : '';
  }
  function forceRank(value) {
    var n = safeForceRank(value);
    if (n == null) return null;
    pendingForceRank = n;
    DEBUG_STATE.forceRank = n;
    if (liveScene) liveScene.applyForceRank(n);
    return n;
  }
  function forceBranch(value) {
    var id = safeForceBranch(value);
    if (!id) return '';
    pendingForceBranch = id;
    DEBUG_STATE.forceBranch = id;
    if (liveScene) liveScene.applyForceBranch(id);
    return id;
  }
  window.__ss = {
    state: DEBUG_STATE,
    version: VERSION,
    forceRank: forceRank,
    forceBranch: forceBranch,
    scene: function () { return liveScene; }
  };

  function bakeTexture(scene, name, width, height, draw) {
    if (scene.textures.exists(name)) return;
    var graphics = scene.make.graphics({ x: 0, y: 0, add: false });
    draw(graphics, width, height);
    graphics.generateTexture(name, width, height);
    graphics.destroy();
  }
  function fillPanel(graphics, color, alpha, x, y, w, h, radius) {
    graphics.fillStyle(safeColor(color), alpha);
    graphics.fillRoundedRect(x, y, w, h, radius);
    graphics.lineStyle(2, safeColor(color), 0.32);
    graphics.strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, Math.max(2, radius - 1));
  }
  function bakeTextures(scene) {
    bakeTexture(scene, 'ss_bg', W, H, function (g, w, h) {
      var bands = ['#061013', '#081a1b', '#0b2320', '#0d2c24', '#102b25', '#071417'];
      for (var i = 0; i < bands.length; i += 1) g.fillStyle(safeColor(bands[i]), 1).fillRect(0, i * h / bands.length, w, h / bands.length + 2);
      g.fillStyle(safeColor('#8ce7b8'), 0.09).fillEllipse(w * 0.48, 270, 360, 290);
      g.fillStyle(safeColor('#f0c873'), 0.05).fillEllipse(w * 0.65, 615, 300, 220);
      for (var s = 0; s < 84; s += 1) {
        var x = (s * 113 + 17) % w;
        var y = (s * 73 + 29) % 740;
        g.fillStyle(safeColor(s % 4 === 0 ? '#e5f1bb' : '#83cab1'), s % 3 === 0 ? 0.42 : 0.18).fillRect(x, y, s % 5 === 0 ? 2 : 1, s % 5 === 0 ? 2 : 1);
      }
      g.fillStyle(safeColor('#041012'), 0.82).fillRect(0, 720, w, 124);
      g.fillStyle(safeColor('#b5e9b7'), 0.11).fillRect(0, 95, w, 1);
    });
    bakeTexture(scene, 'ss_lane_mossy-trail', 358, 302, function (g, w, h) {
      fillPanel(g, '#102f29', 0.98, 0, 0, w, h, 18);
      g.fillStyle(safeColor('#5fbc87'), 0.13).fillEllipse(74, 210, 170, 90);
      g.fillStyle(safeColor('#cce493'), 0.14).fillEllipse(300, 70, 120, 140);
      g.lineStyle(3, safeColor('#75d5a1'), 0.18).strokeRoundedRect(10, 10, w - 20, h - 20, 14);
      for (var i = 0; i < 8; i += 1) g.fillStyle(safeColor(i % 2 ? '#8dd5a1' : '#d5b871'), 0.3).fillCircle(28 + i * 45, 252 - (i % 3) * 22, 3 + (i % 2) * 2);
      g.lineStyle(3, safeColor('#4f9f78'), 0.48).beginPath(); g.moveTo(22, 224); g.lineTo(42, 172); g.lineTo(61, 224); g.moveTo(300, 229); g.lineTo(321, 148); g.lineTo(344, 229); g.strokePath();
      g.fillStyle(safeColor('#e7b66f'), 0.55).fillEllipse(44, 191, 22, 11).fillEllipse(322, 169, 24, 12); g.fillStyle(safeColor('#82d39b'), 0.5).fillCircle(44, 198, 3).fillCircle(322, 177, 3);
    });
    bakeTexture(scene, 'ss_lane_spore-marsh', 358, 302, function (g, w, h) {
      fillPanel(g, '#1a3128', 0.98, 0, 0, w, h, 18);
      g.fillStyle(safeColor('#b4db6a'), 0.16).fillEllipse(86, 78, 190, 105);
      g.fillStyle(safeColor('#72b1a2'), 0.14).fillEllipse(280, 218, 190, 130);
      g.lineStyle(3, safeColor('#add878'), 0.2).strokeRoundedRect(10, 10, w - 20, h - 20, 14);
      for (var i = 0; i < 11; i += 1) g.fillStyle(safeColor(i % 2 ? '#b4dc76' : '#7bd0a0'), 0.3).fillRect(24 + i * 31, 218 - (i % 4) * 23, 4, 30 + (i % 3) * 9);
      g.lineStyle(2, safeColor('#e7d47d'), 0.35).beginPath(); g.moveTo(55, 47); g.lineTo(55, 92); g.moveTo(55, 60); g.lineTo(43, 51); g.moveTo(55, 70); g.lineTo(68, 59); g.strokePath(); g.fillStyle(safeColor('#db7e9b'), 0.44).fillCircle(55, 37, 12);
    });
    bakeTexture(scene, 'ss_lane_fungal-deep', 358, 302, function (g, w, h) {
      fillPanel(g, '#241c3b', 0.98, 0, 0, w, h, 18);
      g.fillStyle(safeColor('#b98df5'), 0.15).fillEllipse(96, 82, 180, 120);
      g.fillStyle(safeColor('#74e5d1'), 0.11).fillEllipse(294, 220, 160, 120);
      g.lineStyle(3, safeColor('#c295f4'), 0.22).strokeRoundedRect(10, 10, w - 20, h - 20, 14);
      for (var i = 0; i < 12; i += 1) g.fillStyle(safeColor(i % 2 ? '#be91f0' : '#67d4c1'), 0.33).fillCircle(24 + i * 28, 52 + (i % 4) * 54, 2 + (i % 3));
      g.lineStyle(4, safeColor('#7a54af'), 0.46).beginPath(); g.moveTo(26, 230); g.lineTo(72, 142); g.lineTo(115, 230); g.moveTo(278, 231); g.lineTo(315, 119); g.lineTo(350, 231); g.strokePath(); g.lineStyle(2, safeColor('#f0d889'), 0.5).strokeCircle(72, 142, 13).strokeCircle(315, 119, 13);
    });
    bakeTexture(scene, 'ss_lane_saga-finale', 358, 302, function (g, w, h) {
      fillPanel(g, '#3a2c26', 0.98, 0, 0, w, h, 18);
      g.fillStyle(safeColor('#ffd477'), 0.17).fillEllipse(200, 78, 230, 140);
      g.fillStyle(safeColor('#78e0cc'), 0.12).fillEllipse(64, 238, 150, 110);
      g.lineStyle(3, safeColor('#f3d27a'), 0.3).strokeRoundedRect(10, 10, w - 20, h - 20, 14);
      for (var i = 0; i < 9; i += 1) g.fillStyle(safeColor(i % 2 ? '#efd178' : '#78d9ca'), 0.35).fillTriangle(20 + i * 39, 245, 31 + i * 39, 208 - (i % 3) * 16, 42 + i * 39, 245);
      g.lineStyle(5, safeColor('#b47752'), 0.5).beginPath(); g.moveTo(33, 217); g.lineTo(74, 94); g.lineTo(111, 217); g.moveTo(274, 217); g.lineTo(313, 75); g.lineTo(349, 217); g.strokePath(); g.lineStyle(2, safeColor('#ffe69c'), 0.6).strokeCircle(74, 94, 17).strokeCircle(313, 75, 21);
    });
    bakeTexture(scene, 'ss_economy', 358, 156, function (g, w, h) { fillPanel(g, '#10241f', 0.98, 0, 0, w, h, 16); g.fillStyle(safeColor('#9cdbb1'), 0.18).fillRect(14, 32, w - 28, 1); g.fillStyle(safeColor('#bfe38a'), 0.12).fillRect(14, 124, w - 28, 1); });
    bakeTexture(scene, 'ss_forage', 358, 56, function (g, w, h) { fillPanel(g, '#244936', 1, 0, 0, w, h, 16); g.lineStyle(2, safeColor('#c4ed83'), 0.44).strokeRoundedRect(4, 4, w - 8, h - 8, 12); });
    bakeTexture(scene, 'ss_small_button', 112, 44, function (g, w, h) { fillPanel(g, '#15342d', 1, 0, 0, w, h, 13); g.lineStyle(2, safeColor('#8dd5bb'), 0.32).strokeRoundedRect(3, 3, w - 6, h - 6, 10); });
    bakeTexture(scene, 'ss_settings_button', 52, 44, function (g, w, h) { fillPanel(g, '#15342d', 1, 0, 0, w, h, 13); g.lineStyle(2, safeColor('#f0d78a'), 0.42).strokeRoundedRect(3, 3, w - 6, h - 6, 10); });
    bakeTexture(scene, 'ss_mode_button', 72, 44, function (g, w, h) { fillPanel(g, '#263449', 1, 0, 0, w, h, 13); g.lineStyle(2, safeColor('#c09aff'), 0.48).strokeRoundedRect(3, 3, w - 6, h - 6, 10); });
    bakeTexture(scene, 'ss_chip', 164, 34, function (g, w, h) { fillPanel(g, '#172f2b', 0.98, 0, 0, w, h, 13); });
    bakeTexture(scene, 'ss_overlay', W, H, function (g, w, h) { g.fillStyle(safeColor('#03100e'), 0.86).fillRect(0, 0, w, h); });
    bakeTexture(scene, 'ss_choice_panel', 358, 584, function (g, w, h) { fillPanel(g, '#10231f', 1, 0, 0, w, h, 20); g.lineStyle(2, safeColor('#d8c87f'), 0.28).strokeRoundedRect(8, 8, w - 16, h - 16, 15); });
    bakeTexture(scene, 'ss_choice_card', 330, 142, function (g, w, h) { fillPanel(g, '#1a302b', 1, 0, 0, w, h, 15); });
    bakeTexture(scene, 'ss_result_panel', 358, 420, function (g, w, h) { fillPanel(g, '#10231f', 1, 0, 0, w, h, 22); g.lineStyle(2, safeColor('#f2d47a'), 0.42).strokeRoundedRect(8, 8, w - 16, h - 16, 17); });
    bakeTexture(scene, 'ss_result_button', 326, 54, function (g, w, h) { fillPanel(g, '#315b43', 1, 0, 0, w, h, 15); g.lineStyle(2, safeColor('#e6e29d'), 0.4).strokeRoundedRect(4, 4, w - 8, h - 8, 12); });
    bakeTexture(scene, 'ss_ring', 110, 110, function (g, w, h) { g.lineStyle(4, safeColor('#f1d37b'), 0.75).strokeCircle(w / 2, h / 2, 42); g.lineStyle(2, safeColor('#ffffff'), 0.32).strokeCircle(w / 2, h / 2, 51); });
    bakeTexture(scene, 'ss_particle', 18, 18, function (g, w, h) { g.fillStyle(safeColor('#ffffff'), 0.96).fillTriangle(w / 2, 1, w - 1, h / 2, w / 2, h - 1); });
    bakeTexture(scene, 'ss_drop_icon', 34, 34, function (g, w, h) { g.fillStyle(safeColor('#d9f39b'), 0.95).fillTriangle(w / 2, 2, w - 4, 18, w / 2, w - 2); g.fillStyle(safeColor('#315b43'), 0.9).fillCircle(w / 2, 21, 5); });
    bakeTexture(scene, 'ss_lock', 30, 30, function (g, w, h) { g.lineStyle(3, safeColor('#91a39a'), 0.8).strokeRoundedRect(5, 12, 20, 14, 4); g.lineStyle(3, safeColor('#91a39a'), 0.8).strokeCircle(15, 12, 7); });
    bakeSporelingTextures(scene);
    for (var li = 0; li < LANES.length; li += 1) {
      var foes = LANES[li].foes || [];
      for (var fi = 0; fi < foes.length; fi += 1) bakeFoeTextures(scene, foes[fi]);
    }
  }
  function bakeSporelingTextures(scene) {
    var forms = [
      { id: 'rootling', body: '#65c8aa', light: '#b9f0ce', accent: '#397c6d', kind: 'root' },
      { id: 'guardian', body: '#4ca99b', light: '#c4f1d7', accent: '#2b655c', kind: 'guardian' },
      { id: 'trickster', body: '#886bc7', light: '#e1caff', accent: '#4a3479', kind: 'trickster' },
      { id: 'bloom', body: '#8fba4e', light: '#e5f7a8', accent: '#426c3f', kind: 'bloom' }
    ];
    for (var ci = 0; ci < CREATURES.length; ci += 1) {
      var creature = CREATURES[ci];
      forms.push({ id: creature.id, body: creature.color, light: '#f4f0c6', accent: '#243b32', kind: creature.kind });
    }
    var states = ['idle', 'walk', 'strike', 'hurt', 'evolve'];
    for (var fi = 0; fi < forms.length; fi += 1) for (var si = 0; si < states.length; si += 1) {
      (function (form, state) {
        bakeTexture(scene, 'ss_spore_' + form.id + '_' + state, 132, 156, function (g, w, h) {
          var glow = state === 'evolve' ? '#f4d778' : state === 'hurt' ? '#f27f80' : form.light;
          g.fillStyle(safeColor('#051311'), 0.42).fillEllipse(66, 139, 84, 17);
          if (state === 'evolve') { g.lineStyle(4, safeColor(glow), 0.72).strokeCircle(66, 70, 58); g.lineStyle(2, safeColor('#fff4bd'), 0.35).strokeCircle(66, 70, 48); }
          g.fillStyle(safeColor(form.body), 1);
          if (form.kind === 'guardian') { g.fillEllipse(66, 84, 64, 70); g.fillTriangle(30, 69, 48, 28, 62, 61).fillTriangle(102, 69, 84, 28, 70, 61); g.lineStyle(5, safeColor(form.light), 0.65).strokeRoundedRect(27, 83, 78, 40, 17); }
          else if (form.kind === 'trickster') { g.fillEllipse(66, 83, 57, 69); g.fillTriangle(24, 56, 51, 26, 56, 69).fillTriangle(108, 56, 81, 26, 76, 69); g.lineStyle(3, safeColor(form.light), 0.7).beginPath(); g.moveTo(35, 106); g.lineTo(18, 124); g.moveTo(97, 106); g.lineTo(114, 124); g.strokePath(); }
          else if (form.kind === 'bloom') { g.fillEllipse(66, 88, 64, 68); for (var petal = 0; petal < 6; petal += 1) g.fillEllipse(66 + Math.cos(petal * TAU / 6) * 28, 49 + Math.sin(petal * TAU / 6) * 22, 24, 38); }
          else if (form.kind === 'horn') { g.fillTriangle(17, 112, 34, 38, 62, 74).fillTriangle(115, 112, 98, 38, 70, 74).fillEllipse(66, 86, 72, 64); }
          else if (form.kind === 'crawler') { g.fillRoundedRect(20, 58, 92, 64, 24).fillRect(12, 112, 22, 11).fillRect(50, 116, 22, 11).fillRect(99, 112, 22, 11); }
          else if (form.kind === 'reed') { g.fillTriangle(21, 126, 47, 24, 68, 112).fillTriangle(64, 116, 103, 35, 121, 126).fillEllipse(66, 99, 68, 44); }
          else if (form.kind === 'bell') { g.fillTriangle(28, 110, 104, 110, 94, 48).fillEllipse(66, 52, 54, 30).fillCircle(66, 120, 8); }
          else if (form.kind === 'maw') { g.fillEllipse(66, 84, 82, 82); g.fillStyle(safeColor(form.accent), 1).fillEllipse(66, 95, 49, 26); }
          else if (form.kind === 'hopper') { g.fillEllipse(66, 84, 78, 82); g.fillRoundedRect(7, 79, 30, 13, 6).fillRoundedRect(95, 79, 30, 13, 6); }
          else { g.fillEllipse(66, 84, 58, 65); g.fillRoundedRect(28, 38, 76, 34, 17); g.fillStyle(safeColor(form.accent), 0.7).fillTriangle(34, 45, 47, 24, 56, 47).fillTriangle(98, 45, 85, 24, 76, 47); }
          g.fillStyle(safeColor(form.light), 1).fillEllipse(66, 77, 45, 48);
          g.fillStyle(safeColor(form.accent), 1).fillCircle(51, 77, 5).fillCircle(81, 77, 5);
          g.lineStyle(3, safeColor(form.accent), 1).beginPath(); g.moveTo(53, 91); g.lineTo(66, 98); g.lineTo(79, 91); g.strokePath();
          g.lineStyle(2, safeColor(form.light), 0.6).beginPath(); g.moveTo(39, 112); g.lineTo(29, 127); g.moveTo(93, 112); g.lineTo(103, 127); g.strokePath();
          if (state === 'walk') { g.lineStyle(3, safeColor(form.light), 0.65).beginPath(); g.moveTo(40, 127); g.lineTo(29, 136); g.moveTo(92, 127); g.lineTo(103, 136); g.strokePath(); }
          if (state === 'strike') { g.lineStyle(5, safeColor('#f5d271'), 0.95).beginPath(); g.moveTo(88, 94); g.lineTo(124, 56); g.strokePath(); g.lineStyle(3, safeColor('#fff9dc'), 0.8).beginPath(); g.moveTo(110, 73); g.lineTo(126, 72); g.strokePath(); }
          if (state === 'hurt') { g.lineStyle(3, safeColor('#fff0d0'), 0.84).beginPath(); g.moveTo(28, 46); g.lineTo(43, 61); g.moveTo(43, 46); g.lineTo(28, 61); g.strokePath(); }
        });
      }(forms[fi], states[si]));
    }
  }
  function bakeFoeTextures(scene, foe) {
    var states = ['idle', 'strike', 'hurt', 'evolve'];
    for (var i = 0; i < states.length; i += 1) {
      (function (state) {
        bakeTexture(scene, 'ss_foe_' + foe.id + '_' + state, 142, 154, function (g, w, h) {
          var color = state === 'hurt' ? '#ffb071' : foe.color;
          g.fillStyle(safeColor('#051311'), 0.4).fillEllipse(71, 137, 86, 18);
          if (state === 'evolve') { g.lineStyle(4, safeColor('#f4d778'), 0.6).strokeCircle(71, 69, 57); }
          g.fillStyle(safeColor(color), 1);
          if (foe.shape === 'horn') g.fillTriangle(14, 114, 34, 35, 67, 73).fillTriangle(128, 114, 108, 35, 75, 73).fillEllipse(71, 89, 78, 70);
          else if (foe.shape === 'crawler') g.fillRoundedRect(20, 54, 102, 64, 23).fillRect(10, 105, 24, 12).fillRect(53, 111, 24, 12).fillRect(108, 105, 24, 12);
          else if (foe.shape === 'reed') g.fillTriangle(19, 123, 48, 27, 70, 113).fillTriangle(65, 116, 105, 38, 124, 123).fillEllipse(71, 101, 72, 48);
          else if (foe.shape === 'hopper') g.fillEllipse(71, 83, 80, 83).fillRoundedRect(8, 78, 31, 13, 6).fillRoundedRect(103, 78, 31, 13, 6);
          else if (foe.shape === 'bell') g.fillTriangle(30, 109, 112, 109, 99, 52).fillEllipse(71, 53, 58, 32).fillCircle(71, 119, 8);
          else if (foe.shape === 'maw') { g.fillEllipse(71, 83, 86, 86); g.fillStyle(safeColor('#1b2724'), 1).fillEllipse(71, 94, 48, 26); }
          else g.fillCircle(71, 83, 42);
          g.fillStyle(safeColor('#142622'), 1).fillCircle(55, 79, 5).fillCircle(87, 79, 5);
          if (state === 'strike') { g.lineStyle(6, safeColor('#f5d271'), 0.9).beginPath(); g.moveTo(35, 80); g.lineTo(7, 49); g.moveTo(106, 80); g.lineTo(135, 49); g.strokePath(); }
          if (state === 'hurt') { g.lineStyle(3, safeColor('#fff0d0'), 0.82).beginPath(); g.moveTo(38, 46); g.lineTo(52, 61); g.moveTo(52, 46); g.lineTo(38, 61); g.strokePath(); }
        });
      }(states[i]));
    }
  }

  function makeText(scene, x, y, value, size, color, originX, originY, weight) {
    var text = scene.add.text(x, y, value, {
      fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: size + 'px',
      fontStyle: weight >= 800 ? 'bold' : 'normal', color: color, resolution: RETINA_FACTOR,
      stroke: '#061013', strokeThickness: size >= 17 ? 2 : 1
    });
    text.setOrigin(originX == null ? 0 : originX, originY == null ? 0.5 : originY);
    text._ssText = textValue(value); text._ssColor = color;
    return text;
  }
  function makeImage(scene, x, y, key, originX, originY) {
    return scene.add.image(x, y, key).setOrigin(originX == null ? 0 : originX, originY == null ? 0 : originY);
  }
  function makePlayer(id, legacy) {
    var maxHp = 58 + legacy * 3;
    return {
      id: id, label: 'P' + id, maxHp: maxHp, hp: maxHp, power: 7 + legacy * 0.45,
      armor: 1.5 + legacy * 0.08, tempo: 0.92, fortune: legacy * 0.002, crit: 0,
      guard: 0, foodBonus: 0, activeId: 'rootling', form: 'rootling', rosterIndex: 0,
      summonPower: 0, summonArmor: 0, summonTempo: 0, pose: 'idle', poseTime: 0,
      tapFeedback: 0, tookDamage: false, ko: false
    };
  }

  class BootScene extends Phaser.Scene {
    constructor() { super({ key: 'boot' }); }
    preload() { kit.loader.show('SPORELING SAGA'); kit.loader.progress(0.55); }
    create() {
      // The scripted centerOn cannot survive this title: update() calls an
      // ABSOLUTE cameras.main.setScroll(juice.dx, juice.dy) every frame for the
      // shake, which resets the centred scroll to ~0 and puts the design box back
      // off screen. setOrigin(0, 0) is the shape that fits: a zoomed camera with a
      // (0,0) origin renders design coordinates 1:1 from scroll 0, so the existing
      // shake offsets, and any scrollFactor-0 UI, are already correct as written.
      this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.setOrigin(0, 0);
      ensureProfile();
      kit.audio.register({
        strikeHit: 'assets/strike-hit.mp3', forageChime: 'assets/forage-chime.mp3',
        evolutionSwell: 'assets/evolution-swell.mp3', rankUp: 'assets/rank-up.mp3',
        rerun: 'assets/rerun.mp3', theme: 'assets/theme.mp3'
      });
      bakeTextures(this);
      kit.loader.progress(1); kit.loader.hide(); kit.registerPWA();
      this.scene.start('play');
    }
  }

  class PlayScene extends Phaser.Scene {
    constructor() {
      super({ key: 'play' });
      this.run = null; this.screen = 'play'; this.accumulator = 0;
      this.pointerClaims = Object.create(null); this.keyLatch = Object.create(null);
      this.pressedZones = Object.create(null); this.popTime = 0; this.pendingActions = [0, 0]; this.pendingChoice = ''; this.fx = []; this.floaters = [];
      this.gamepadLatch = [{}, {}]; this.gamepadConnected = [false, false];
      this.layout = { sx: 1, sy: 1 }; this.lifecyclePaused = false; this.lastProbeRank = null; this.lastProbeBranch = '';
    }
    create() {
      this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.setOrigin(0, 0);
      Game.play = this; liveScene = this;
      this.installGamepadHooks();
      var self = this;
      this.input.on('pointerup', function (pointer) {
        if (self.lifecyclePaused || kit.paused) return;
        var zone = self.zoneAt({ x: pointer.x, y: pointer.y });
        if (zone) { delete self.pointerClaims[pointer.id]; self.endPress(zone); self.handleZone(zone); }
      });
      this.createViews(); this.startRun('run');
      kit.audio.music('theme', 500);
    }
    onKitPause() { this.lifecyclePaused = true; this.clearInput(); }
    onKitResume() { this.lifecyclePaused = false; }
    clearInput() { kit.input.clearAll(); this.pointerClaims = Object.create(null); this.keyLatch = Object.create(null); this.pressedZones = Object.create(null); this.gamepadLatch = [{}, {}]; this.pendingActions = [0, 0]; this.pendingChoice = ''; }
    installGamepadHooks() {
      var self = this;
      if (!navigator.getGamepads) return;
      window.addEventListener('gamepadconnected', function (event) { var index = event.gamepad.index; if (index < 2) { self.gamepadConnected[index] = true; if (self.run) self.showToast('P' + (index + 1) + ' CONTROLLER READY', '#91c89c'); } });
      window.addEventListener('gamepaddisconnected', function (event) { var index = event.gamepad.index; if (index < 2) { self.gamepadConnected[index] = false; if (self.run) self.showToast('P' + (index + 1) + ' CONTROLLER DISCONNECTED', '#d7a37b'); } });
    }
    restartRun() { this.startRun(this.run && this.run.mode === 'trial' ? 'trial' : 'run', this.run && this.run.trialId); }
    startRun(mode, trialId) {
      var chosenMode = mode === 'trial' ? 'trial' : 'run';
      var trial = chosenMode === 'trial' ? trialById(trialId) : null;
      var seed = makeSeed();
      var p1 = makePlayer(1, profile.legacy); var p2 = makePlayer(2, profile.legacy);
      this.run = {
        mode: chosenMode, status: 'playing', seed: seed, rng: makeRng(seed), rank: 1, xp: 0, score: 0,
        elapsed: 0, simTime: 0, xpTotal: 0, lane: LANES[0], laneIndex: 0, foeIndex: 0, foe: {}, players: [p1, p2],
        maxHp: p1.maxHp, hp: p1.hp, power: p1.power, armor: p1.armor, tempo: p1.tempo, fortune: p1.fortune,
        crit: 0, guard: 0, foodBonus: 0, autoTimers: [0.22, 0.38], foeTimer: 0.95, historyTimer: 0.8,
        history: [], historyCount: 0, rate: 0, foraged: 0, forageStock: MAX_FORAGE, forageCooldown: 0,
        evolutionShards: profile.evolutionShards, loot: { gear: 0, food: 0, trinket: 0 }, collectionGains: 0,
        branch: '', path: [null, null, null], choiceTier: 0, trialId: trial ? trial.id : '', trialPath: trial ? trial.path.slice() : [],
        noDeathStreak: 0, tookDamage: false, tutorial: profile.wins === 0, tutorialTime: profile.wins === 0 ? 3.2 : 0,
        toast: '', toastColor: '#d9efbb', toastTime: 0, lastDrop: '',
        foePose: 'idle', foePoseTime: 0, evolveTime: 0, flash: 0, flashColor: '#ffffff'
      };
      this.screen = 'play'; this.accumulator = 0; this.pendingActions = [0, 0]; this.pendingChoice = '';
      this.pointerClaims = Object.create(null); this.keyLatch = Object.create(null);
      this.pendingActions = [0, 0]; this.pressedZones = Object.create(null);
      this.spawnFoe(); this.syncState();
    }
    rng() { return this.run && this.run.rng ? this.run.rng() : 0.5; }
    spawnFoe() {
      var r = this.run;
      var lane = laneByRank(r.rank); r.lane = lane; r.laneIndex = LANES.indexOf(lane);
      var base = safeFoe(lane, r.foeIndex);
      var hp = Math.round(31 + r.rank * 8.4 + r.laneIndex * 4 + (r.foeIndex % 3) * 4);
      r.foe.id = base.id; r.foe.name = base.name; r.foe.color = base.color; r.foe.shape = base.shape;
      r.foe.maxHp = hp; r.foe.hp = hp; r.foe.damage = 4.2 + r.rank * 0.72 + r.laneIndex * 0.65;
      r.foe.aiState = 'stalk'; r.foe.aiTimer = Math.max(0.72, 1.02 - r.rank * 0.006); r.foe.guard = 0; r.foe.target = r.foeIndex % 2; r.foe.attackCount = 0;
      r.foeTimer = r.foe.aiTimer; r.foePose = 'idle'; r.foePoseTime = 0;
    }
    addParticle(x, y, color, vx, vy, life, size) {
      var slot = null;
      for (var i = 0; i < this.fx.length; i += 1) if (!this.fx[i].active) { slot = this.fx[i]; break; }
      if (!slot) return;
      slot.active = true; slot.x = x; slot.y = y; slot.vx = vx; slot.vy = vy; slot.life = life; slot.maxLife = life; slot.size = size; slot.color = color;
      slot.image.setPosition(x, y).setDisplaySize(size, size).setTint(safeColor(color)).setAlpha(1).setVisible(true);
    }
    burst(x, y, color, count, spread) {
      for (var i = 0; i < count; i += 1) this.addParticle(x, y, color, (this.rng() - 0.5) * 150 * spread, (this.rng() - 0.82) * 150 * spread, 0.35 + this.rng() * 0.38, 3 + this.rng() * 5);
    }
    addFloater(value, x, y, color) {
      var slot = null;
      for (var i = 0; i < this.floaters.length; i += 1) if (!this.floaters[i].active) { slot = this.floaters[i]; break; }
      if (!slot) return;
      slot.active = true; slot.x = x; slot.y = y; slot.life = 0.8; slot.maxLife = 0.8; slot.color = color;
      setTextIfChanged(slot.text, value); setColorIfChanged(slot.text, color); slot.text.setPosition(x, y).setAlpha(1).setVisible(true);
    }
    showToast(value, color) {
      var r = this.run; if (!r) return;
      r.toast = textValue(value); r.toastColor = color || '#d9efbb'; r.toastTime = 1;
      r.tutorialTime = 0; r.tutorial = false;
    }
    playSound(name, options) { kit.audio.sfx(name, options); }
    hitActor(kind, playerIndex) {
      var r = this.run; if (!r || r.status !== 'playing') return;
      if (kind === 'player') { var player = r.players[playerIndex || 0]; player.pose = 'strike'; player.poseTime = 0.18; player.tapFeedback = 0.14; }
      else { r.foePose = 'hurt'; r.foePoseTime = 0.18; }
    }
    dealDamage(amount, manual, playerIndex) {
      var r = this.run; if (!r || r.status !== 'playing' || !r.foe) return;
      var p = r.players[playerIndex || 0] || r.players[0];
      var chance = clamp(0.07 + p.crit + p.fortune, 0, 0.55);
      var critical = this.rng() < chance;
      var damage = amount * (critical ? 1.65 : 1) + this.rng() * 1.5;
      if (r.foe.aiState === 'guard') { damage *= 0.46; this.addFloater('BLOCK', 284, 275, '#d7a37b'); }
      r.foe.hp -= damage; r.flash = manual ? 0.16 : 0.10; r.flashColor = critical ? '#ffd477' : '#8ce7d0';
      this.hitActor('player', playerIndex || 0); this.hitActor('foe');
      this.addFloater((critical ? 'CRIT ' : '') + '-' + Math.round(damage), 284, 300, critical ? '#ffd477' : '#eaf5d7');
      this.burst(278, 325, critical ? '#ffd477' : '#8ce7d0', critical ? 10 : 6, 0.7);
      this.playSound('strikeHit', { volume: critical ? 0.9 : 0.55, rate: critical ? 1.2 : 1 });
      if (manual) { r.autoTimers[playerIndex || 0] = Math.max(0.08, r.autoTimers[playerIndex || 0] - 0.22); kit.juice.hitStop(38); kit.juice.shake(2.2, 80); }
      if (r.foe.hp <= 0) this.defeatFoe();
    }
    autoStrike(playerIndex) { var r = this.run; var p = r && r.players[playerIndex || 0]; if (p && r.status === 'playing' && !p.ko) this.dealDamage(p.power * 0.44, false, playerIndex || 0); }
    tapStrike(playerIndex) { var r = this.run; var p = r && r.players[playerIndex || 0]; if (p && r.status === 'playing' && !p.ko) this.dealDamage(p.power * 0.86 + 4.5, true, playerIndex || 0); }
    defeatFoe() {
      var r = this.run; if (!r || r.status !== 'playing') return;
      var lane = r.lane || LANES[0];
      var reward = Math.round((lane.xp || 12) + r.rank * 2.4 + r.fortune * 16);
      r.xp += reward; r.xpTotal = (r.xpTotal || 0) + reward; r.score += reward * 4 + r.rank * 5; r.noDeathStreak += 1;
      this.addFloater('+' + reward + ' XP', 280, 338, '#ffd477'); this.burst(278, 324, r.foe.color || '#8ce7d0', 14, 1.15);
      this.showToast('✦ +' + reward + ' XP', '#ffd477');
      r.foeIndex += 1; r.flash = 0.28; r.flashColor = r.foe.color || '#ffffff'; r.forageStock = Math.min(MAX_FORAGE, r.forageStock + 1);
      var captured = r.foe.id; profile.collection[captured] = Math.min(9999, (profile.collection[captured] || 0) + 1); for (var cpi = 0; cpi < 2; cpi += 1) profile.playerCollections[cpi][captured] = Math.min(9999, (profile.playerCollections[cpi][captured] || 0) + 1); profile.colony.spores += 1; profile.colony.rank = clamp(1 + Math.floor(profile.colony.spores / 5), 1, 200); profile.evolutionShards = Math.min(9999, profile.evolutionShards + 1); r.evolutionShards = profile.evolutionShards; r.collectionGains += 1; persist();
      this.addFloater('CAPTURED ' + (r.foe.name || captured).toUpperCase(), 190, 255, '#b6e76d');
      if (this.rng() < 0.24) this.applyDrop('gear', true);
      this.spawnFoe(); this.checkRankUp();
    }
    checkRankUp() {
      var r = this.run; if (!r || r.status !== 'playing' || r.rank >= 20) { if (r && r.rank >= 20) this.winRun(); return; }
      var need = xpForNext(r.rank);
      if (r.xp < need) return;
      r.xp -= need; r.rank += 1; r.score += r.rank * 34; r.players.forEach(function (p) { p.maxHp += 3; p.hp = Math.min(p.maxHp, p.hp + 9); }); r.maxHp = r.players[0].maxHp; r.hp = r.players[0].hp;
      r.lane = laneByRank(r.rank); r.laneIndex = LANES.indexOf(r.lane); r.flash = 0.48; r.flashColor = '#ffd477';
      this.burst(195, 270, '#ffd477', 18, 1.25); this.addFloater('RANK ' + r.rank, 112, 291, '#ffd477'); this.playSound('rankUp', { volume: 0.8 });
      if (r.rank === 5 || r.rank === 10 || r.rank === 15) {
        r.choiceTier = Math.floor(r.rank / 5);
        if (r.mode === 'trial') this.openTrialReveal(); else this.openChoice();
        return;
      }
      this.spawnFoe();
      if (r.rank >= 20) this.winRun();
    }
    openChoice() { this.run.status = 'choice'; this.screen = 'choice'; this.run.toastTime = 0; this.pendingChoice = ''; this.playSound('evolutionSwell', { volume: 0.7 }); }
    openTrialReveal() {
      var r = this.run; var branch = branchById(r.trialPath[r.choiceTier - 1] || 'guardian').id;
      r.status = 'trialReveal'; r.branch = branch; r.evolveTime = 1.3; this.screen = 'trialReveal'; this.applyBranch(branch, r.choiceTier, true);
      this.playSound('evolutionSwell', { volume: 0.7 }); this.burst(195, 270, branchById(branch).color, 28, 1.5);
    }
    applyBranch(id, tier, forced) {
      var r = this.run; var branch = branchById(id); var data = branch.tiers[clamp(tier - 1, 0, 2)] || branch.tiers[0];
      if (!forced && !profile.branchUnlocks[branch.id]) { this.showToast('CHAIN LOCKED: choose the root branch first', '#f0bb7d'); return false; }
      if (!forced && r.evolutionShards < EVOLUTION_COST) { this.showToast('NEED ' + EVOLUTION_COST + ' SPORES TO EVOLVE', '#f0bb7d'); return false; }
      if (!forced) { r.evolutionShards -= EVOLUTION_COST; profile.evolutionShards = r.evolutionShards; }
      r.path[tier - 1] = branch.id; r.branch = branch.id;
      r.players.forEach(function (p) { p.power += data.power; p.armor += data.armor; p.tempo += data.tempo; p.crit += data.crit; p.foodBonus += data.food; p.guard = Math.max(p.guard, data.guard || 0); p.form = branch.id; });
      r.power = r.players[0].power; r.armor = r.players[0].armor; r.tempo = r.players[0].tempo; r.crit = r.players[0].crit; r.guard = r.players[0].guard; r.foodBonus = r.players[0].foodBonus;
      updateBranchChain(branch.id); r.evolveTime = 1.1; r.players.forEach(function (p) { p.pose = 'evolve'; p.poseTime = 1.1; });
      persist();
      return true;
    }
    chooseEvolution(id, forced) {
      var r = this.run; var branch = branchById(id);
      if (!r || r.status !== 'choice') return false;
      if (!this.applyBranch(branch.id, r.choiceTier, !!forced)) return false;
      r.status = 'playing'; this.screen = 'play'; r.flash = 0.4; r.flashColor = branch.color;
      this.showToast(branch.glyph + ' ' + branch.label + '  ' + branch.tiers[r.choiceTier - 1].skill, branch.color); this.burst(113, 300, branch.color, 26, 1.45);
      this.spawnFoe(); this.pendingChoice = ''; return true;
    }
    applyDrop(kind, fromFoe) {
      var r = this.run; if (!r) return;
      if (kind === 'gear') { var power = 1.05 + r.rank * 0.11; r.players.forEach(function (p) { p.power += power * 0.7; }); r.power = r.players[0].power; r.loot.gear += 1; r.lastDrop = 'GEAR +' + power.toFixed(1) + ' POWER'; }
      else if (kind === 'food') { var food = 10 + r.rank + r.players[0].foodBonus; r.players.forEach(function (p) { if (!p.ko) p.hp = Math.min(p.maxHp, p.hp + food); }); r.hp = r.players[0].hp; r.loot.food += 1; r.lastDrop = 'FOOD +' + food + ' VITALITY'; }
      else { var tempo = 0.065 + r.rank * 0.003; r.players.forEach(function (p) { p.tempo += tempo * 0.7; p.fortune += 0.009; }); r.tempo = r.players[0].tempo; r.fortune = r.players[0].fortune; r.loot.trinket += 1; r.lastDrop = 'TRINKET +' + tempo.toFixed(2) + ' TEMPO'; }
      r.score += 10 + r.rank; r.foraged += fromFoe ? 0 : 1; r.flash = 0.24; r.flashColor = kind === 'gear' ? '#8ce7d0' : kind === 'food' ? '#b6e76d' : '#c09aff';
      this.burst(82, 506, r.flashColor, 16, 1.1); this.addFloater(r.lastDrop, 104, 486, r.flashColor);
      this.showToast('✦ ' + r.lastDrop, r.flashColor); this.playSound('forageChime', { volume: 0.75, rate: kind === 'trinket' ? 1.18 : 1 });
    }
    forage() {
      var r = this.run; if (!r || r.status !== 'playing') return;
      if (r.forageCooldown > 0) { this.showToast('FORAGE READY IN ' + r.forageCooldown.toFixed(1) + 'S', '#d7a37b'); return; }
      if (r.forageStock <= 0) { this.showToast('FORAGE EMPTY: DEFEAT A FOE FOR A SPORE CACHE', '#d7a37b'); return; }
      r.forageStock -= 1; r.forageCooldown = FORAGE_COOLDOWN;
      var odds = r.lane && r.lane.odds ? r.lane.odds : LANES[0].odds; var roll = this.rng();
      var kind = roll < odds.gear ? 'gear' : roll < odds.gear + odds.food ? 'food' : 'trinket';
      this.applyDrop(kind, false);
    }
    summonPlayer(playerIndex) {
      var r = this.run; var p = r && r.players[playerIndex]; if (!r || !p || r.status !== 'playing') return;
      var playerCollection = profile.playerCollections[playerIndex] || profile.collection; var owned = CREATURES.filter(function (creature) { return (playerCollection[creature.id] || 0) > 0; });
      if (!owned.length) { this.showToast('COLONY HAS NO SUMMONS YET', '#d7a37b'); return; }
      var next = owned[(p.rosterIndex + 1) % owned.length];
      var old = creatureById(p.activeId); p.power -= p.summonPower; p.armor -= p.summonArmor; p.tempo -= p.summonTempo;
      p.activeId = next.id; p.rosterIndex = owned.indexOf(next); p.form = next.id; p.summonPower = next.power; p.summonArmor = next.armor; p.summonTempo = next.tempo;
      p.power += p.summonPower; p.armor += p.summonArmor; p.tempo += p.summonTempo; p.ko = false; p.hp = Math.max(1, Math.min(p.maxHp, p.hp + 12));
      r.power = r.players[0].power; r.armor = r.players[0].armor; r.tempo = r.players[0].tempo; r.hp = r.players[0].hp;
      p.pose = 'evolve'; p.poseTime = 0.55; r.evolveTime = 0.55; r.flash = 0.28; r.flashColor = next.color; this.burst(playerIndex === 0 ? 78 : 151, 300, next.color, 18, 1.2); this.showToast('P' + p.id + ' SUMMONED ' + next.name.toUpperCase(), next.color); this.playSound('evolutionSwell', { volume: 0.42, rate: 1.2 + playerIndex * 0.12 });
      if (old.id !== next.id) persist();
    }
    evolvePlayer(playerIndex) {
      var r = this.run; var p = r && r.players[playerIndex]; if (!r || !p || r.status !== 'playing') return;
      if (r.evolutionShards < EVOLUTION_COST) { this.showToast('NEED ' + EVOLUTION_COST + ' SPORES TO EVOLVE', '#d7a37b'); return; }
      var branch = branchById(r.branch || 'guardian'); r.evolutionShards -= EVOLUTION_COST; profile.evolutionShards = r.evolutionShards;
      p.form = branch.id; p.power += 1.5; p.armor += 1; p.guard = Math.max(p.guard, branch.tiers[Math.max(0, r.choiceTier - 1)].guard || 0); p.pose = 'evolve'; p.poseTime = 1.1; r.evolveTime = 1.1; r.flash = 0.42; r.flashColor = branch.color; this.burst(playerIndex === 0 ? 78 : 151, 300, branch.color, 24, 1.5); this.showToast('P' + p.id + ' EVOLVED TO ' + branch.label, branch.color); this.playSound('evolutionSwell', { volume: 0.7, rate: 0.9 + playerIndex * 0.15 }); persist();
    }
    stepFoeAI() {
      var r = this.run; var foe = r && r.foe; if (!r || !foe) return;
      foe.aiTimer -= STEP; r.foeTimer = foe.aiTimer;
      if (foe.aiTimer > 0) return;
      if (foe.aiState === 'stalk') { foe.aiState = 'telegraph'; foe.aiTimer = 0.42; foe.target = (foe.attackCount + r.rank) % 2; r.foePose = 'strike'; r.foePoseTime = 0.42; this.showToast('FOE TELEGRAPH: P' + (foe.target + 1) + ' BRACE', '#f0bb7d'); }
      else if (foe.aiState === 'telegraph') { foe.aiState = 'recover'; foe.aiTimer = 0.72; foe.attackCount += 1; this.foeStrike(); }
      else if (foe.aiState === 'recover') { foe.aiState = this.rng() < 0.34 ? 'guard' : 'stalk'; foe.aiTimer = foe.aiState === 'guard' ? 0.58 : 0.92; foe.guard = foe.aiState === 'guard' ? 0.54 : 0; }
      else { foe.aiState = 'stalk'; foe.aiTimer = 0.86; foe.guard = 0; }
      r.foeTimer = foe.aiTimer;
    }
    foeStrike() {
      var r = this.run; if (!r || r.status !== 'playing' || !r.foe) return;
      var targetIndex = r.foe.target % 2; var target = r.players[targetIndex]; if (target.ko) { targetIndex = targetIndex === 0 ? 1 : 0; target = r.players[targetIndex]; }
      var mitigation = Math.max(0.32, 1 - target.armor * 0.025 - target.guard); var damage = r.foe.damage * mitigation;
      target.hp -= damage; target.tookDamage = true; target.pose = 'hurt'; target.poseTime = 0.18; r.tookDamage = true; r.foePose = 'strike'; r.foePoseTime = 0.16; r.flash = 0.18; r.flashColor = '#f27f80';
      this.addFloater('P' + target.id + '  -' + Math.ceil(damage), targetIndex === 0 ? 78 : 151, 300, '#f27f80'); this.burst(targetIndex === 0 ? 78 : 151, 324, '#f27f80', 7, 0.7); this.playSound('strikeHit', { volume: 0.28, rate: 0.72 });
      if (target.hp <= 0) { target.hp = 0; target.ko = true; this.showToast('P' + target.id + ' DOWN: SUMMON TO ROTATE THE ACTIVE FORM', '#f27f80'); }
      if (r.players[0].ko && r.players[1].ko) this.loseRun();
    }
    pushHistory() {
      var r = this.run; if (!r) return;
      if (r.historyCount < MAX_HISTORY) { r.history[r.historyCount] = r.history[r.historyCount] || { t: 0, xp: 0 }; r.history[r.historyCount].t = r.elapsed; r.history[r.historyCount].xp = r.xpTotal || 0; r.historyCount += 1; }
      else { for (var i = 1; i < MAX_HISTORY; i += 1) { r.history[i - 1].t = r.history[i].t; r.history[i - 1].xp = r.history[i].xp; } r.history[MAX_HISTORY - 1].t = r.elapsed; r.history[MAX_HISTORY - 1].xp = r.xpTotal || 0; }
      if (r.historyCount >= 2) { var newest = r.history[r.historyCount - 1]; var oldest = r.history[0]; r.rate = Math.max(0, (newest.xp - oldest.xp) / Math.max(1, newest.t - oldest.t) * 60); }
    }
    stepFx() {
      var r = this.run; if (!r) return;
      r.toastTime = Math.max(0, r.toastTime - STEP); r.tutorialTime = Math.max(0, r.tutorialTime - STEP); r.flash = Math.max(0, r.flash - STEP * 3.6); r.forageCooldown = Math.max(0, r.forageCooldown - STEP); this.popTime = Math.max(0, this.popTime - STEP);
      r.players.forEach(function (p) { p.poseTime = Math.max(0, p.poseTime - STEP); p.tapFeedback = Math.max(0, p.tapFeedback - STEP); if (p.poseTime <= 0 && p.pose !== 'idle' && r.evolveTime <= 0) p.pose = 'idle'; });
      if (r.foePoseTime <= 0) r.foePose = 'idle';
      for (var i = 0; i < this.fx.length; i += 1) {
        var p = this.fx[i]; if (!p.active) continue;
        p.life -= STEP; p.x += p.vx * STEP; p.y += p.vy * STEP; p.vy += 180 * STEP;
        if (p.life <= 0) { p.active = false; p.image.setVisible(false); }
        else p.image.setPosition(p.x, p.y).setAlpha(clamp(p.life / p.maxLife, 0, 1));
      }
      for (var f = 0; f < this.floaters.length; f += 1) {
        var fl = this.floaters[f]; if (!fl.active) continue;
        fl.life -= STEP; fl.y -= 27 * STEP;
        if (fl.life <= 0) { fl.active = false; fl.text.setVisible(false); }
        else fl.text.setPosition(fl.x, fl.y).setAlpha(clamp(fl.life / fl.maxLife, 0, 1));
      }
    }
    stepSim() {
      var r = this.run; if (!r || r.status !== 'playing') { this.stepFx(); return; }
      r.simTime += STEP; r.elapsed += STEP; r.autoTimers[0] -= STEP; r.autoTimers[1] -= STEP; r.foeTimer -= STEP; r.historyTimer -= STEP;
      var actions = this.pendingActions; this.pendingActions = [0, 0];
      for (var pi = 0; pi < 2; pi += 1) {
        if (actions[pi] & ACTION_ATTACK) this.tapStrike(pi);
        if (actions[pi] & ACTION_FORAGE) this.forage();
        if (actions[pi] & ACTION_SUMMON) this.summonPlayer(pi);
        if (actions[pi] & ACTION_EVOLVE) this.evolvePlayer(pi);
      }
      if (r.status !== 'playing') { this.stepFx(); return; }
      for (var ai = 0; ai < 2; ai += 1) if (r.autoTimers[ai] <= 0) { this.autoStrike(ai); r.autoTimers[ai] += Math.max(0.28, 0.85 / (r.players[ai].tempo + 0.22)); }
      if (r.status === 'playing') this.stepFoeAI();
      if (r.status === 'playing' && r.historyTimer <= 0) { r.historyTimer += 1; r.xpTotal = (r.xpTotal || 0) + 0; this.pushHistory(); }
      this.stepFx(); this.syncState();
    }
    loseRun() {
      var r = this.run; if (!r || r.status !== 'playing') return;
      r.hp = 0; r.status = 'lost'; this.screen = 'result'; this.clearInput();
      profile.bestRank = Math.max(profile.bestRank, r.rank); profile.bestScore = Math.max(profile.bestScore, Math.floor(r.score));
      var rankMedal = medalTier(r.rank, 5, 12, 20); var rateMedal = medalTier(r.rate, 55, 115, 190); var streakMedal = medalTier(r.noDeathStreak, 8, 20, 36);
      profile.medals.rank = Math.max(profile.medals.rank, rankMedal); profile.medals.rate = Math.max(profile.medals.rate, rateMedal); profile.medals.streak = Math.max(profile.medals.streak, streakMedal); persist();
      this.burst(104, 326, '#f27f80', 24, 1.4); this.playSound('rerun', { volume: 0.5, rate: 0.7 }); this.syncState();
    }
    winRun() {
      var r = this.run; if (!r || r.status === 'won') return;
      r.rank = 20; r.status = 'won'; this.screen = 'result'; r.score += 1000 + profile.legacy * 80;
      profile.bestRank = 20; profile.bestScore = Math.max(profile.bestScore, Math.floor(r.score)); profile.wins = Math.min(999999, profile.wins + 1); profile.legacy = Math.min(20, profile.legacy + 1);
      var rankMedal = 3; var rateMedal = medalTier(r.rate, 55, 115, 190); var streakMedal = 3;
      profile.medals.rank = Math.max(profile.medals.rank, rankMedal); profile.medals.rate = Math.max(profile.medals.rate, rateMedal); profile.medals.streak = Math.max(profile.medals.streak, streakMedal); profile.bestRate = Math.max(profile.bestRate, r.rate); persist();
      this.burst(195, 300, '#ffd477', 36, 1.7); this.playSound('rerun', { volume: 0.8, rate: 1.2 }); this.syncState();
    }
    showTrialMenu() { if (!this.run) return; this.menuReturnScreen = this.screen; this.menuReturnStatus = this.run.status; this.screen = 'trialMenu'; this.run.status = 'menu'; this.clearInput(); }
    backToRun() { if (!this.run || this.run.status !== 'menu') return; this.run.status = this.menuReturnScreen === 'result' ? this.menuReturnStatus : 'playing'; this.screen = this.menuReturnScreen || 'play'; this.clearInput(); }
    showCollection() { if (!this.run || this.screen === 'collection') return; this.collectionReturnScreen = this.screen; this.collectionReturnStatus = this.run.status; this.screen = 'collection'; this.run.status = 'collection'; this.clearInput(); }
    backFromCollection() { if (!this.run || this.screen !== 'collection') return; this.screen = this.collectionReturnScreen || 'play'; this.run.status = this.collectionReturnStatus || 'playing'; this.clearInput(); }
    chooseTrial(id) { var trial = trialById(id); this.startRun('trial', trial.id); this.showToast('TRIAL: ' + trial.name, trial.color); }
    applyForceRank(value) {
      var r = this.run; if (!r) return;
      var n = safeForceRank(value); if (n == null) return; this.lastProbeRank = n;
      if (r.status === 'won' || r.status === 'lost' || r.status === 'menu') { this.startRun(r.mode, r.trialId); r = this.run; }
      if (r.status === 'choice' || r.status === 'trialReveal') { r.status = 'playing'; this.screen = 'play'; }
      r.rank = n; r.xp = 0; r.lane = laneByRank(n); r.laneIndex = LANES.indexOf(r.lane); r.players.forEach(function (p) { p.ko = false; p.hp = Math.min(p.maxHp, p.hp + 12); }); r.hp = r.players[0].hp; r.foeIndex = Math.max(0, n - 1); this.spawnFoe();
      if (n === 5 || n === 10 || n === 15) { r.choiceTier = Math.floor(n / 5); if (r.mode === 'trial') this.openTrialReveal(); else this.openChoice(); }
      else if (n >= 20) this.winRun();
      this.syncState();
    }
    applyForceBranch(id) {
      var branch = safeForceBranch(id); if (!branch || !this.run) return;
      this.lastProbeBranch = branch;
      if (this.run.status === 'choice') this.chooseEvolution(branch, true);
      else if (this.run.status === 'trialReveal') { this.run.trialPath[this.run.choiceTier - 1] = branch; this.run.branch = branch; this.syncState(); }
      else { this.pendingForceBranch = branch; if (this.run.rank === 5 || this.run.rank === 10 || this.run.rank === 15) { this.run.choiceTier = Math.floor(this.run.rank / 5); this.openChoice(); } }
      this.syncState();
    }
    applyProbeForces() {
      var rawRank = DEBUG_STATE.forceRank;
      if (window.__ss && typeof window.__ss.forceRank !== 'function' && window.__ss.forceRank != null) rawRank = window.__ss.forceRank;
      if (typeof window.forceRank !== 'undefined') rawRank = window.forceRank;
      if (rawRank != null && safeForceRank(rawRank) !== this.lastProbeRank) this.applyForceRank(rawRank);
      var rawBranch = DEBUG_STATE.forceBranch;
      if (window.__ss && typeof window.__ss.forceBranch !== 'function' && window.__ss.forceBranch) rawBranch = window.__ss.forceBranch;
      if (typeof window.forceBranch !== 'undefined') rawBranch = window.forceBranch;
      if (rawBranch && safeForceBranch(rawBranch) !== this.lastProbeBranch) this.applyForceBranch(rawBranch);
    }
    pointFromPointer(pointer) {
      var canvas = this.game.canvas; var rect = canvas.getBoundingClientRect();
      return { x: (pointer.x - rect.left) * W / Math.max(1, rect.width), y: (pointer.y - rect.top) * H / Math.max(1, rect.height) };
    }
    zoneAt(point) {
      if (this.screen === 'choice') {
        for (var ci = 0; ci < 3; ci += 1) if (point.x >= 30 && point.x <= 360 && point.y >= 218 + ci * 151 && point.y <= 360 + ci * 151) return 'choice-' + ci;
        return '';
      }
      if (this.screen === 'trialMenu') {
        for (var ti = 0; ti < 3; ti += 1) if (point.x >= 30 && point.x <= 360 && point.y >= 218 + ti * 151 && point.y <= 360 + ti * 151) return 'trial-' + ti;
        if (point.x >= 30 && point.x <= 142 && point.y >= 754 && point.y <= 808) return 'back';
        return '';
      }
      if (this.screen === 'collection') return point.x >= 30 && point.x <= 142 && point.y >= 754 && point.y <= 808 ? 'collection-back' : '';
      if (this.screen === 'trialReveal') return point.x >= 32 && point.x <= 358 && point.y >= 686 && point.y <= 740 ? 'continue' : '';
      if (this.screen === 'result') {
        if (point.x >= 32 && point.x <= 358 && point.y >= 548 && point.y <= 602) return 'restart';
        if (point.x >= 32 && point.x <= 358 && point.y >= 614 && point.y <= 668) return 'trial-menu';
        if (point.x >= 32 && point.x <= 144 && point.y >= 680 && point.y <= 734) return 'collection';
        return '';
      }
      if (point.x >= 246 && point.x <= 298 && point.y >= 16 && point.y <= 60) return 'settings';
      if (point.x >= 306 && point.x <= 378 && point.y >= 16 && point.y <= 60) return 'trial-menu';
      if (point.x >= 16 && point.x <= 128 && point.y >= 777 && point.y <= 828) return 'restart';
      if (point.x >= 132 && point.x <= 244 && point.y >= 777 && point.y <= 828) return 'collection';
      if (point.x >= 16 && point.x <= 180 && point.y >= 474 && point.y <= 538) return 'p1-forage';
      if (point.x > 180 && point.x <= 374 && point.y >= 474 && point.y <= 538) return 'p2-forage';
      if (point.x >= 16 && point.x <= 180 && point.y >= 185 && point.y <= 430) return 'p1-attack';
      if (point.x > 180 && point.x <= 374 && point.y >= 185 && point.y <= 430) return 'p2-attack';
      return '';
    }
    beginPress(zone) {
      if (!zone) return;
      this.pressedZones[zone] = true; this.popTime = 0.12;
      var match = /^p([12])-(attack|forage|summon|evolve)$/.exec(zone);
      if (match && this.run && this.run.players[Number(match[1]) - 1]) this.run.players[Number(match[1]) - 1].tapFeedback = 0.14;
    }
    endPress(zone) { if (zone) { delete this.pressedZones[zone]; this.popTime = 0.12; } }
    queuePlayerAction(playerIndex, action) { if (this.run && this.run.status === 'playing') this.pendingActions[playerIndex] |= action; }
    pollGamepads() {
      if (this.lifecyclePaused || kit.paused || !navigator.getGamepads) return;
      var pads = navigator.getGamepads();
      for (var pi = 0; pi < 2; pi += 1) {
        var pad = pads[pi]; if (!pad) continue;
        var buttons = [0, 1, 2, 3];
        for (var bi = 0; bi < buttons.length; bi += 1) {
          var pressed = !!(pad.buttons[buttons[bi]] && pad.buttons[buttons[bi]].pressed); var key = String(buttons[bi]);
          if (pressed && !this.gamepadLatch[pi][key]) this.handleZone('p' + (pi + 1) + '-' + ['attack', 'forage', 'summon', 'evolve'][bi]);
          this.gamepadLatch[pi][key] = pressed;
        }
      }
    }
    collectInput() {
      var live = Object.create(null); var self = this;
      kit.input.pointers.forEach(function (pointer, id) {
        live[id] = true;
        if (pointer.zone == null) { pointer.zone = self.zoneAt(self.pointFromPointer(pointer)); self.beginPress(pointer.zone); }
        self.pointerClaims[id] = pointer.zone;
      });
      Object.keys(this.pointerClaims).forEach(function (id) {
        if (live[id]) return;
        var zone = self.pointerClaims[id]; delete self.pointerClaims[id]; self.endPress(zone); self.handleZone(zone);
      });
      var continueScreen = this.screen === 'trialReveal';
      var keys = continueScreen ? [['Space', 'continue'], ['Enter', 'continue'], ['Escape', 'escape']] : [
        ['Space', 'p1-attack'], ['KeyF', 'p1-forage'], ['KeyQ', 'p1-summon'], ['KeyE', 'p1-evolve'],
        ['Enter', 'p2-attack'], ['Slash', 'p2-forage'], ['Numpad0', 'p2-summon'], ['NumpadDecimal', 'p2-evolve'],
        ['KeyR', 'restart'], ['KeyT', 'trial-menu'], ['KeyC', 'collection'], ['Escape', 'escape'], ['Digit1', 'choice-0'], ['Digit2', 'choice-1'], ['Digit3', 'choice-2']
      ];
      for (var i = 0; i < keys.length; i += 1) {
        var code = keys[i][0]; var down = kit.input.keyDown(code);
        if (down && !this.keyLatch[code]) { this.beginPress(keys[i][1]); this.handleZone(keys[i][1]); }
        if (!down && this.keyLatch[code]) this.endPress(keys[i][1]);
        this.keyLatch[code] = down;
      }
    }
    handleZone(zone) {
      if (!zone) return;
      if (!this.musicStarted) { this.musicStarted = true; kit.audio.music('theme', 500); }
      if (zone === 'continue') { if (this.screen === 'trialReveal') { this.run.status = 'playing'; this.screen = 'play'; this.run.toastTime = 0; this.spawnFoe(); } return; }
      if (zone === 'settings') { kit.openSettings(); return; }
      if (zone === 'collection') { this.showCollection(); return; }
      if (zone === 'collection-back') { this.backFromCollection(); return; }
      var actionMatch = /^p([12])-(attack|forage|summon|evolve)$/.exec(zone);
      if (actionMatch) { var playerIndex = Number(actionMatch[1]) - 1; var actionMap = { attack: ACTION_ATTACK, forage: ACTION_FORAGE, summon: ACTION_SUMMON, evolve: ACTION_EVOLVE }; this.queuePlayerAction(playerIndex, actionMap[actionMatch[2]]); if (actionMatch[2] === 'attack') this.run.players[playerIndex].pose = 'strike'; return; }
      if (zone === 'restart') { kit.restart(); return; }
      if (zone === 'trial-menu') { if (this.screen === 'trialMenu') this.backToRun(); else this.showTrialMenu(); return; }
      if (zone === 'back') { this.backToRun(); return; }
      if (zone === 'escape') { if (this.screen === 'trialMenu') this.backToRun(); else if (this.screen === 'collection') this.backFromCollection(); else if (this.screen === 'trialReveal') this.handleZone('continue'); return; }
      if (zone.indexOf('choice-') === 0) { if (this.screen === 'trialMenu') this.chooseTrial(TRIALS[clamp(Number(zone.slice(7)), 0, 2)].id); else this.chooseEvolution(BRANCHES[clamp(Number(zone.slice(7)), 0, 2)].id, false); return; }
      if (zone.indexOf('trial-') === 0) { this.chooseTrial(TRIALS[clamp(Number(zone.slice(6)), 0, 2)].id); return; }
    }
    createViews() {
      var v = this.views = {};
      v.bg = makeImage(this, 0, 0, 'ss_bg');
      v.lane = makeImage(this, 16, 144, 'ss_lane_mossy-trail'); v.economy = makeImage(this, 16, 544, 'ss_economy'); v.forage = makeImage(this, 16, 474, 'ss_forage');
      v.settingsButton = makeImage(this, 246, 16, 'ss_settings_button'); v.settingsText = makeText(this, 272, 38, '⚙', 19, '#f0d78a', 0.5, 0.5, 900); v.modeButton = makeImage(this, 306, 16, 'ss_mode_button'); v.restartButton = makeImage(this, 16, 777, 'ss_small_button'); v.collectionButton = makeImage(this, 134, 777, 'ss_small_button');
      v.dropIcon = makeImage(this, 28, 485, 'ss_drop_icon', 0, 0); v.player = makeImage(this, 78, 316, 'ss_spore_rootling_idle', 0.5, 0.5); v.player2 = makeImage(this, 151, 316, 'ss_spore_rootling_idle', 0.5, 0.5); v.foe = makeImage(this, 286, 316, 'ss_foe_dewcap_idle', 0.5, 0.5);
      v.aura = makeImage(this, 104, 316, 'ss_ring', 0.5, 0.5).setVisible(false); v.spark = this.add.graphics(); v.spark.setDepth(20);
      v.flash = this.add.rectangle(195, 300, 358, 302, safeColor('#ffffff'), 0).setVisible(false);
      v.xpBack = this.add.rectangle(16, 84, 358, 8, safeColor('#284238')).setOrigin(0, 0.5); v.xpFill = this.add.rectangle(16, 84, 1, 8, safeColor('#f4d378')).setOrigin(0, 0.5);
      v.hpP1Back = this.add.rectangle(24, 402, 82, 8, safeColor('#233c36')).setOrigin(0, 0.5); v.hpP1 = this.add.rectangle(24, 402, 1, 8, safeColor('#8ce7d0')).setOrigin(0, 0.5); v.hpP2Back = this.add.rectangle(118, 402, 82, 8, safeColor('#233c36')).setOrigin(0, 0.5); v.hpP2 = this.add.rectangle(118, 402, 1, 8, safeColor('#a9c7ff')).setOrigin(0, 0.5);
      v.hpFoeBack = this.add.rectangle(240, 402, 118, 8, safeColor('#3d2d2c')).setOrigin(0, 0.5); v.hpFoe = this.add.rectangle(240, 402, 1, 8, safeColor('#f27f80')).setOrigin(0, 0.5);
      v.title = makeText(this, 18, 26, 'SPORELING SAGA', 19, '#f5f0d9', 0, 0.5, 900); v.mode = makeText(this, 342, 38, 'RUN', 14, '#e7e2b2', 0.5, 0.5, 900);
      v.rank = makeText(this, 18, 61, 'RANK 01 / 20', 16, '#f4d378', 0, 0.5, 900); v.best = makeText(this, 374, 61, 'BEST 01', 14, '#a7c2ae', 1, 0.5, 700);
      v.seed = makeText(this, 374, 27, 'SEED 0000', 13, '#90aba0', 1, 0.5, 700); v.tutorial = makeText(this, 195, 113, 'TAP THE FOE TO STRIKE', 14, '#e4d592', 0.5, 0.5, 800);
      v.laneName = makeText(this, 30, 160, 'MOSSY TRAIL', 16, '#b9edbd', 0, 0.5, 900); v.laneSub = makeText(this, 30, 185, 'Dewlight foothills', 14, '#a2bda9', 0, 0.5, 700); v.laneRank = makeText(this, 360, 160, 'R1', 16, '#e8db9a', 1, 0.5, 900);
      v.youLabel = makeText(this, 78, 225, 'P1', 14, '#8ce7d0', 0.5, 0.5, 900); v.youLabel2 = makeText(this, 151, 225, 'P2', 14, '#a9c7ff', 0.5, 0.5, 900); v.foeLabel = makeText(this, 286, 225, 'FOE', 14, '#f27f80', 0.5, 0.5, 900); v.hpP1Text = makeText(this, 65, 423, '58 / 58', 12, '#ccebd7', 0.5, 0.5, 700); v.hpP2Text = makeText(this, 159, 423, '58 / 58', 12, '#d6e0ff', 0.5, 0.5, 700); v.hpFoeText = makeText(this, 299, 423, '35 / 35', 13, '#ffd1cd', 0.5, 0.5, 700); v.foeAi = makeText(this, 286, 245, 'STALK', 11, '#d7a37b', 0.5, 0.5, 800);
      v.auto = makeText(this, 195, 447, 'P1 + P2 AUTO  •  TAP OR CONTROLLER TO PACE', 13, '#d7e1bb', 0.5, 0.5, 800); v.forageLabel = makeText(this, 195, 490, '✦  FORAGE  4 / 4', 17, '#d9f39b', 0.5, 0.5, 900); v.forageSub = makeText(this, 195, 518, 'P1 F  •  P2 /  •  Q / 0 SUMMON  •  E EVOLVE', 11, '#d7e1bb', 0.5, 0.5, 700);
      v.ecoTitle = makeText(this, 30, 562, 'COLONY LEDGER', 16, '#f0edca', 0, 0.5, 900); v.ecoOdds = makeText(this, 30, 588, 'GEAR 50%   FOOD 35%   TRINKET 15%', 13, '#b7d0b5', 0, 0.5, 700); v.ecoRate = makeText(this, 30, 614, '⏱  XP / MIN  0', 13, '#8ce7d0', 0, 0.5, 800); v.ecoNext = makeText(this, 30, 640, '⌁  NEXT RANK 31 XP', 13, '#f4d378', 0, 0.5, 800); v.ecoLoot = makeText(this, 30, 666, '⚙ 0   ✚ 0   ✧ 0', 13, '#b7d0b5', 0, 0.5, 700); v.ecoCollection = makeText(this, 30, 688, 'ROSTER 1   SPORES 5   COLONY R1', 12, '#b6e76d', 0, 0.5, 700);
      v.pathTitle = makeText(this, 172, 706, 'EVOLUTION PATH', 13, '#9db9a6', 0.5, 0.5, 900); v.path0 = makeText(this, 90, 728, '◌', 24, '#567268', 0.5, 0.5, 900); v.path1 = makeText(this, 195, 728, '◌', 24, '#567268', 0.5, 0.5, 900); v.path2 = makeText(this, 300, 728, '◌', 24, '#567268', 0.5, 0.5, 900); v.pathLabels = [makeText(this, 90, 753, 'R5', 12, '#789183', 0.5, 0.5, 700), makeText(this, 195, 753, 'R10', 12, '#789183', 0.5, 0.5, 700), makeText(this, 300, 753, 'R15', 12, '#789183', 0.5, 0.5, 700)];
      v.restartLabel = makeText(this, 72, 799, '↻  NEW SEED', 13, '#d7e9c5', 0.5, 0.5, 900); v.collectionLabel = makeText(this, 190, 799, 'COLONY', 13, '#d7e9c5', 0.5, 0.5, 900); v.toastBg = makeImage(this, 210, 101, 'ss_chip'); v.toast = makeText(this, 292, 118, '', 14, '#d9efbb', 0.5, 0.5, 800); v.toastBg.setVisible(false); v.toast.setVisible(false);
      v.medalLine = makeText(this, 195, 823, 'RANK ●   RATE ●   STREAK ●', 13, '#9db9a6', 0.5, 0.5, 700).setVisible(false);
      v.overlay = makeImage(this, 0, 0, 'ss_overlay').setVisible(false); v.choicePanel = makeImage(this, 16, 132, 'ss_choice_panel').setVisible(false); v.choiceCards = []; v.choiceTitle = makeText(this, 195, 163, 'EVOLUTION CHOICE', 21, '#f4d378', 0.5, 0.5, 900); v.choiceSub = makeText(this, 195, 190, 'Preview the permanent effect', 14, '#b7d0b5', 0.5, 0.5, 700); v.choiceTexts = [];
      for (var ci = 0; ci < 3; ci += 1) { var card = makeImage(this, 30, 218 + ci * 151, 'ss_choice_card').setVisible(false); v.choiceCards.push(card); v.choiceTexts.push({ key: makeText(this, 50, 242 + ci * 151, String(ci + 1), 17, '#e8e1b5', 0, 0.5, 900), title: makeText(this, 82, 242 + ci * 151, '', 17, '#ffffff', 0, 0.5, 900), effect: makeText(this, 82, 274 + ci * 151, '', 14, '#e7edd0', 0, 0.5, 700), skill: makeText(this, 82, 305 + ci * 151, '', 14, '#b7d0b5', 0, 0.5, 700), chain: makeText(this, 82, 333 + ci * 151, '', 14, '#91a89b', 0, 0.5, 700) }); }
      v.choiceHint = makeText(this, 195, 700, 'TAP A CARD  •  KEYS 1 / 2 / 3', 14, '#e4d592', 0.5, 0.5, 900); v.choiceHint.setVisible(false);
      v.continueButton = makeImage(this, 32, 686, 'ss_result_button').setVisible(false); v.continueText = makeText(this, 195, 713, 'CONTINUE  •  ENTER / SPACE', 15, '#f0edca', 0.5, 0.5, 900).setVisible(false);
      v.resultPanel = makeImage(this, 16, 180, 'ss_result_panel').setVisible(false); v.resultTitle = makeText(this, 195, 244, '', 25, '#f4d378', 0.5, 0.5, 900); v.resultSub = makeText(this, 195, 279, '', 15, '#e7edd0', 0.5, 0.5, 700); v.resultStats = makeText(this, 195, 420, '', 15, '#b7d0b5', 0.5, 0.5, 700); v.resultMedals = makeText(this, 195, 463, '', 14, '#f4d378', 0.5, 0.5, 900); v.resultButton = makeImage(this, 32, 548, 'ss_result_button').setVisible(false); v.resultButtonText = makeText(this, 195, 575, '', 16, '#f0edca', 0.5, 0.5, 900); v.trialButton = makeImage(this, 32, 614, 'ss_result_button').setVisible(false); v.trialButtonText = makeText(this, 195, 641, 'BRANCH TRIALS', 16, '#f0edca', 0.5, 0.5, 900);
      v.trialPanel = makeImage(this, 16, 132, 'ss_choice_panel').setVisible(false); v.trialTitle = makeText(this, 195, 163, 'BRANCH TRIALS', 21, '#f4d378', 0.5, 0.5, 900); v.trialSub = makeText(this, 195, 190, 'Hand-authored paths. No branch lock.', 14, '#b7d0b5', 0.5, 0.5, 700); v.trialCards = []; v.trialTexts = [];
      for (var ti = 0; ti < 3; ti += 1) { var trialCard = makeImage(this, 30, 218 + ti * 151, 'ss_choice_card').setVisible(false); v.trialCards.push(trialCard); v.trialTexts.push({ key: makeText(this, 50, 242 + ti * 151, String(ti + 1), 17, '#e8e1b5', 0, 0.5, 900), title: makeText(this, 82, 242 + ti * 151, '', 17, '#ffffff', 0, 0.5, 900), sub: makeText(this, 82, 274 + ti * 151, '', 14, '#e7edd0', 0, 0.5, 700), path: makeText(this, 82, 306 + ti * 151, '', 14, '#b7d0b5', 0, 0.5, 700), hint: makeText(this, 82, 334 + ti * 151, 'PRESS NUMBER OR TAP', 14, '#91a89b', 0, 0.5, 700) }); }
      v.backButton = makeImage(this, 30, 754, 'ss_small_button').setVisible(false); v.backText = makeText(this, 86, 776, 'BACK TO RUN', 14, '#d7e9c5', 0.5, 0.5, 900);
      v.collectionPanel = makeImage(this, 16, 132, 'ss_choice_panel').setVisible(false); v.collectionTitle = makeText(this, 195, 163, 'COLONY ROSTER', 21, '#f4d378', 0.5, 0.5, 900); v.collectionSub = makeText(this, 195, 190, 'Summon a captured rival with Q or 0', 13, '#b7d0b5', 0.5, 0.5, 700); v.collectionRows = [];
      for (var ri = 0; ri < CREATURES.length; ri += 1) v.collectionRows.push(makeText(this, 42, 226 + ri * 37, '', 14, '#e7edd0', 0, 0.5, 700));
      v.collectionBackButton = makeImage(this, 30, 754, 'ss_small_button').setVisible(false); v.collectionBackText = makeText(this, 86, 776, 'BACK TO RUN', 14, '#d7e9c5', 0.5, 0.5, 900);
      this.fx = []; for (var pi = 0; pi < MAX_PARTICLES; pi += 1) this.fx.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: '#ffffff', image: makeImage(this, 0, 0, 'ss_particle').setVisible(false).setDepth(40) });
      this.floaters = []; for (var fi = 0; fi < MAX_FLOATERS; fi += 1) this.floaters.push({ active: false, x: 0, y: 0, life: 0, maxLife: 1, color: '#ffffff', text: makeText(this, 0, 0, '', 15, '#ffffff', 0.5, 0.5, 900) });
      this.setDepths();
    }
    setDepths() {
      var v = this.views; v.bg.setDepth(0); v.lane.setDepth(2); v.economy.setDepth(2); v.forage.setDepth(3); v.settingsButton.setDepth(4); v.settingsText.setDepth(5); v.modeButton.setDepth(4); v.restartButton.setDepth(4); v.collectionButton.setDepth(4); v.dropIcon.setDepth(5); v.player.setDepth(12); v.player2.setDepth(12); v.foe.setDepth(12); v.aura.setDepth(11); v.flash.setDepth(25); v.xpBack.setDepth(4); v.xpFill.setDepth(5); v.hpP1Back.setDepth(5); v.hpP1.setDepth(6); v.hpP2Back.setDepth(5); v.hpP2.setDepth(6); v.hpFoeBack.setDepth(5); v.hpFoe.setDepth(6); v.overlay.setDepth(60); v.choicePanel.setDepth(61); v.choiceTitle.setDepth(62); v.choiceSub.setDepth(62); v.choiceHint.setDepth(62); v.continueButton.setDepth(63); v.continueText.setDepth(64); v.resultPanel.setDepth(61); v.resultTitle.setDepth(62); v.resultSub.setDepth(62); v.resultStats.setDepth(62); v.resultMedals.setDepth(62); v.resultButton.setDepth(63); v.resultButtonText.setDepth(64); v.trialButton.setDepth(63); v.trialButtonText.setDepth(64); v.trialPanel.setDepth(61); v.trialTitle.setDepth(62); v.trialSub.setDepth(62); v.backButton.setDepth(63); v.backText.setDepth(64); v.collectionPanel.setDepth(61); v.collectionTitle.setDepth(62); v.collectionSub.setDepth(62); v.collectionRows.forEach(function (t) { t.setDepth(62); }); v.collectionBackButton.setDepth(63); v.collectionBackText.setDepth(64); v.toastBg.setDepth(50); v.toast.setDepth(51); v.tutorial.setDepth(50); v.medalLine.setDepth(6); v.pathTitle.setDepth(6); v.path0.setDepth(6); v.path1.setDepth(6); v.path2.setDepth(6); v.pathLabels.forEach(function (t) { t.setDepth(6); });
    }
    renderSpark() {
      var r = this.run; var g = this.views.spark; g.clear(); g.lineStyle(2, safeColor('#8ce7d0'), 0.8);
      if (!r || r.historyCount < 2) { g.lineStyle(1, safeColor('#8ce7d0'), 0.25); g.lineBetween(224, 628, 360, 628); return; }
      var start = r.history[0].t; var end = r.history[r.historyCount - 1].t; var span = Math.max(1, end - start); var min = r.history[0].xp; var max = min;
      for (var i = 1; i < r.historyCount; i += 1) { min = Math.min(min, r.history[i].xp); max = Math.max(max, r.history[i].xp); }
      var range = Math.max(1, max - min); g.beginPath();
      for (var j = 0; j < r.historyCount; j += 1) { var p = r.history[j]; var x = 224 + (p.t - start) / span * 136; var y = 630 - (p.xp - min) / range * 17; if (j === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.strokePath();
    }
    renderBase() {
      var r = this.run; var v = this.views; if (!r) return;
      setTextureIfChanged(v.lane, 'ss_lane_' + (r.lane ? r.lane.id : LANES[0].id));
      setTextureIfChanged(v.foe, 'ss_foe_' + (r.foe.id || FALLBACK_FOE.id) + '_' + (r.foePoseTime > 0 ? r.foePose : 'idle'));
      var p1 = r.players[0], p2 = r.players[1];
      setTextureIfChanged(v.player, 'ss_spore_' + (p1.form || 'rootling') + '_' + (p1.poseTime > 0 ? p1.pose : (r.simTime % 2 < 0.18 ? 'walk' : 'idle')));
      setTextureIfChanged(v.player2, 'ss_spore_' + (p2.form || 'rootling') + '_' + (p2.poseTime > 0 ? p2.pose : (r.simTime % 2 < 0.18 ? 'walk' : 'idle')));
      var pBob = kit.juice.enabled ? Math.sin(r.simTime * 4.4) * 2 : 0; var p2Bob = kit.juice.enabled ? Math.sin(r.simTime * 4.4 + 1.7) * 2 : 0; var fBob = kit.juice.enabled ? Math.sin(r.simTime * 3.7 + 1.4) * 3 : 0;
      v.player.setPosition(78, 316 + pBob).setScale(p1.tapFeedback > 0 || this.pressedZones['p1-attack'] ? 0.82 : 0.86).setAlpha(p1.ko ? 0.42 : 1); v.player2.setPosition(151, 316 + p2Bob).setScale(p2.tapFeedback > 0 || this.pressedZones['p2-attack'] ? 0.82 : 0.86).setAlpha(p2.ko ? 0.42 : 1); v.foe.setPosition(286 + (r.foe.aiState === 'telegraph' ? -6 : r.foe.aiState === 'recover' ? 4 : 0), 316 + fBob).setScale(r.foePoseTime > 0 ? 1.02 : 0.98);
      v.aura.setVisible(r.evolveTime > 0).setPosition(113, 316 + pBob).setScale(1 + (1.1 - r.evolveTime) * 0.16).setAlpha(clamp(r.evolveTime / 1.1, 0, 1));
      v.flash.setVisible(r.flash > 0).setFillStyle(safeColor(r.flashColor || '#ffffff'), clamp(r.flash * 2.2, 0, 0.3));
      v.restartButton.setScale(this.pressedZones.restart ? 0.96 : 1); v.collectionButton.setScale(this.pressedZones.collection ? 0.96 : 1); v.modeButton.setScale(this.pressedZones['trial-menu'] ? 0.96 : 1); v.settingsButton.setScale(this.pressedZones.settings ? 0.96 : 1); v.forage.setScale(this.pressedZones['p1-forage'] || this.pressedZones['p2-forage'] ? 0.96 : 1);
      setTextIfChanged(v.mode, r.mode === 'trial' ? 'TRIAL' : 'RUN'); setTextIfChanged(v.rank, 'RANK ' + String(r.rank).padStart(2, '0') + ' / 20'); setTextIfChanged(v.best, 'BEST ' + String(profile.bestRank).padStart(2, '0')); setTextIfChanged(v.seed, 'SEED ' + String(r.seed >>> 0).slice(-4));
      setTextIfChanged(v.laneName, r.lane ? r.lane.name : LANES[0].name); setColorIfChanged(v.laneName, r.lane ? r.lane.color : LANES[0].color); setTextIfChanged(v.laneSub, r.lane ? r.lane.sub : LANES[0].sub); setTextIfChanged(v.laneRank, 'R' + r.rank);
      setTextIfChanged(v.foeLabel, (r.foe.name || FALLBACK_FOE.name).toUpperCase()); setTextIfChanged(v.foeAi, (r.foe.aiState || 'stalk').toUpperCase()); setTextIfChanged(v.hpP1Text, Math.max(0, Math.ceil(p1.hp)) + ' / ' + Math.ceil(p1.maxHp)); setTextIfChanged(v.hpP2Text, Math.max(0, Math.ceil(p2.hp)) + ' / ' + Math.ceil(p2.maxHp)); setTextIfChanged(v.hpFoeText, Math.max(0, Math.ceil(r.foe.hp)) + ' / ' + Math.ceil(r.foe.maxHp));
      v.xpFill.setDisplaySize(358 * clamp(r.xp / Math.max(1, xpForNext(r.rank)), 0, 1), 8); v.hpP1.setDisplaySize(82 * clamp(p1.hp / Math.max(1, p1.maxHp), 0, 1), 8); v.hpP2.setDisplaySize(82 * clamp(p2.hp / Math.max(1, p2.maxHp), 0, 1), 8); v.hpFoe.setDisplaySize(118 * clamp(r.foe.hp / Math.max(1, r.foe.maxHp), 0, 1), 8);
      var odds = r.lane && r.lane.odds ? r.lane.odds : LANES[0].odds; setTextIfChanged(v.ecoOdds, 'GEAR ' + Math.round(odds.gear * 100) + '%   FOOD ' + Math.round(odds.food * 100) + '%   TRINKET ' + Math.round(odds.trinket * 100) + '%');
      setTextIfChanged(v.ecoRate, '⏱  XP / MIN  ' + Math.round(r.rate) + '   GUARD ' + Math.round(p1.guard * 100) + '%'); setTextIfChanged(v.ecoNext, '⌁  NEXT RANK  ' + Math.max(0, Math.ceil(xpForNext(r.rank) - r.xp)) + ' XP'); setTextIfChanged(v.ecoLoot, '⚙ ' + r.loot.gear + '   ✚ ' + r.loot.food + '   ✧ ' + r.loot.trinket); setTextIfChanged(v.ecoCollection, 'ROSTER ' + Object.keys(profile.collection).filter(function (id) { return profile.collection[id] > 0; }).length + '   SPORES ' + r.evolutionShards + '   COLONY R' + profile.colony.rank + '   F' + r.forageStock + '/' + MAX_FORAGE);
      var path = [v.path0, v.path1, v.path2]; for (var i = 0; i < path.length; i += 1) { var branch = r.path[i] ? branchById(r.path[i]) : null; setTextIfChanged(path[i], branch ? branch.glyph : '◌'); setColorIfChanged(path[i], branch ? branch.color : '#567268'); }
      setTextIfChanged(v.medalLine, 'RANK ' + (medalLabel(profile.medals.rank) === 'NONE' ? '●' : medalLabel(profile.medals.rank).charAt(0)) + '   RATE ' + (medalLabel(profile.medals.rate) === 'NONE' ? '●' : medalLabel(profile.medals.rate).charAt(0)) + '   STREAK ' + (medalLabel(profile.medals.streak) === 'NONE' ? '●' : medalLabel(profile.medals.streak).charAt(0))); v.medalLine.setVisible(this.screen === 'result');
      setTextIfChanged(v.forageLabel, '✦  FORAGE  ' + r.forageStock + ' / ' + MAX_FORAGE + (r.forageCooldown > 0 ? '  READY ' + r.forageCooldown.toFixed(1) : '')); v.dropIcon.setAlpha(r.toastTime > 0 && r.lastDrop ? 1 : 0.76); this.renderSpark();
      var toastVisible = r.toastTime > 0; v.toastBg.setVisible(toastVisible); v.toast.setVisible(toastVisible); if (toastVisible) { setTextIfChanged(v.toast, r.toast); setColorIfChanged(v.toast, r.toastColor); v.toastBg.setTint(safeColor(r.toastColor)); }
      var tutorialVisible = r.tutorialTime > 0 && !toastVisible && this.screen === 'play'; v.tutorial.setVisible(tutorialVisible); if (tutorialVisible) setTextIfChanged(v.tutorial, r.mode === 'trial' ? 'TRIAL PATH AUTO-REVEALS AT RANK 5 / 10 / 15' : 'TAP THE FOE TO STRIKE  •  F FORAGES');
      v.overlay.setVisible(this.screen !== 'play'); v.restartLabel.setVisible(this.screen !== 'result' && this.screen !== 'collection'); v.collectionLabel.setVisible(this.screen !== 'result' && this.screen !== 'collection');
      this.renderChoice(); this.renderTrialReveal(); this.renderTrialMenu(); this.renderCollection(); this.renderResult();
    }
    renderChoice() {
      var v = this.views; var open = this.screen === 'choice'; v.choicePanel.setVisible(open); v.choiceTitle.setVisible(open); v.choiceSub.setVisible(open); v.choiceHint.setVisible(open);
      for (var i = 0; i < 3; i += 1) { var show = open; v.choiceCards[i].setVisible(show); var b = BRANCHES[i]; var d = b.tiers[this.run.choiceTier - 1] || b.tiers[0]; var tx = v.choiceTexts[i]; tx.key.setVisible(show); tx.title.setVisible(show); tx.effect.setVisible(show); tx.skill.setVisible(show); tx.chain.setVisible(show); if (show) { var locked = !profile.branchUnlocks[b.id]; setTextIfChanged(tx.title, b.glyph + '  ' + b.label); setColorIfChanged(tx.title, b.color); setTextIfChanged(tx.effect, '+' + d.power + ' PWR   +' + d.armor + ' ARM   +' + d.tempo.toFixed(2) + ' TEMPO'); setTextIfChanged(tx.skill, d.skill + '  |  ' + d.detail); setTextIfChanged(tx.chain, locked ? 'CHAIN LOCKED  •  choose ROOT first' : 'REQ ' + EVOLUTION_COST + ' SPORES  •  HAVE ' + this.run.evolutionShards + '  •  key ' + (i + 1)); setColorIfChanged(tx.chain, locked ? '#d7a37b' : this.run.evolutionShards >= EVOLUTION_COST ? '#91c89c' : '#d7a37b'); } }
    }
    renderTrialMenu() {
      var v = this.views; var open = this.screen === 'trialMenu'; v.trialPanel.setVisible(open); v.trialTitle.setVisible(open); v.trialSub.setVisible(open); v.backButton.setVisible(open); v.backText.setVisible(open);
      for (var i = 0; i < 3; i += 1) { var show = open; v.trialCards[i].setVisible(show); var tr = TRIALS[i]; var tx = v.trialTexts[i]; tx.key.setVisible(show); tx.title.setVisible(show); tx.sub.setVisible(show); tx.path.setVisible(show); tx.hint.setVisible(show); if (show) { setTextIfChanged(tx.title, tr.name); setColorIfChanged(tx.title, tr.color); setTextIfChanged(tx.sub, tr.sub); setTextIfChanged(tx.path, tr.path.map(function (id) { return branchById(id).label; }).join('  >  ')); } }
    }
    renderTrialReveal() {
      var v = this.views; var open = this.screen === 'trialReveal'; var r = this.run; var branch = r ? branchById(r.branch || 'guardian') : BRANCHES[0]; var data = branch.tiers[(r ? r.choiceTier : 1) - 1] || branch.tiers[0];
      v.choicePanel.setVisible(open); v.choiceTitle.setVisible(open); v.choiceSub.setVisible(open); v.choiceHint.setVisible(open);
      v.continueButton.setVisible(open); v.continueText.setVisible(open);
      if (!open) return;
      setTextIfChanged(v.choiceTitle, 'TRIAL PATH APPLIED'); setTextIfChanged(v.choiceSub, (r ? r.rank : 5) + '  •  ' + branch.label + ' is now active'); setTextIfChanged(v.choiceHint, 'TAP CONTINUE TO RESUME');
      for (var i = 0; i < 3; i += 1) { var show = i === 0; v.choiceCards[i].setVisible(show); var tx = v.choiceTexts[i]; tx.key.setVisible(show); tx.title.setVisible(show); tx.effect.setVisible(show); tx.skill.setVisible(show); tx.chain.setVisible(show); if (show) { setTextIfChanged(tx.title, branch.glyph + '  ' + branch.label); setColorIfChanged(tx.title, branch.color); setTextIfChanged(tx.effect, '+' + data.power + ' PWR   +' + data.armor + ' ARM   +' + data.tempo.toFixed(2) + ' TEMPO'); setTextIfChanged(tx.skill, data.skill + '  |  ' + data.detail); setTextIfChanged(tx.chain, 'HAND-AUTHORED PATH  •  NO LOCK'); setColorIfChanged(tx.chain, '#91c89c'); } }
    }
    renderCollection() {
      var v = this.views; var open = this.screen === 'collection'; v.collectionPanel.setVisible(open); v.collectionTitle.setVisible(open); v.collectionSub.setVisible(open); v.collectionBackButton.setVisible(open); v.collectionBackText.setVisible(open);
      for (var i = 0; i < CREATURES.length; i += 1) { var c = CREATURES[i]; var count = profile.collection[c.id] || 0; var p1Count = (profile.playerCollections[0] || {})[c.id] || 0; var p2Count = (profile.playerCollections[1] || {})[c.id] || 0; var row = v.collectionRows[i]; row.setVisible(open); if (open) { setTextIfChanged(row, (count ? '✦ ' : '○ ') + c.name.toUpperCase() + '   P1 x' + p1Count + '  P2 x' + p2Count); setColorIfChanged(row, count ? c.color : '#71887d'); } }
    }
    renderResult() {
      var v = this.views; var open = this.screen === 'result'; v.resultPanel.setVisible(open); v.resultTitle.setVisible(open); v.resultSub.setVisible(open); v.resultStats.setVisible(open); v.resultMedals.setVisible(open); v.resultButton.setVisible(open); v.resultButtonText.setVisible(open); v.trialButton.setVisible(open); v.trialButtonText.setVisible(open);
      if (!open || !this.run) { v.collectionButton.setPosition(134, 777).setDepth(4).setVisible(true); v.collectionLabel.setPosition(190, 799).setDepth(5).setVisible(this.screen !== 'collection'); setTextIfChanged(v.collectionLabel, 'COLONY'); return; }
      var win = this.run.status === 'won'; setTextIfChanged(v.resultTitle, win ? 'SAGA COMPLETE' : 'THE SPORELING FELL'); setColorIfChanged(v.resultTitle, win ? '#f4d378' : '#f27f80'); setTextIfChanged(v.resultSub, win ? branchById(this.run.path[2] || this.run.path[1] || this.run.path[0] || 'guardian').final + '\nLEGACY +' + (profile.legacy) + ' RETAINED  •  COLLECTION RETAINED' : 'The lane resets. Your best run remains.'); setTextIfChanged(v.resultStats, 'RANK ' + this.run.rank + '   SCORE ' + Math.floor(this.run.score) + '\nXP / MIN ' + Math.round(this.run.rate) + '   FORAGED ' + this.run.foraged + '\nRESET: RUN STATS   KEEP: ROSTER, COLONY, UNLOCKS'); setTextIfChanged(v.resultMedals, 'RANK ' + medalLabel(medalTier(this.run.rank, 5, 12, 20)) + '   RATE ' + medalLabel(medalTier(this.run.rate, 55, 115, 190)) + '   STREAK ' + medalLabel(win ? 3 : medalTier(this.run.noDeathStreak, 8, 20, 36))); setTextIfChanged(v.resultButtonText, win ? 'NEW SEED RERUN' : 'RESTART RUN');
      v.trialButton.setScale(this.pressedZones['trial-menu'] ? 0.96 : 1); v.resultButton.setScale(this.pressedZones.restart ? 0.96 : 1); v.collectionButton.setPosition(32, 680).setDepth(63).setVisible(open).setScale(this.pressedZones.collection ? 0.96 : 1); v.collectionLabel.setPosition(88, 707).setDepth(64).setVisible(open); setTextIfChanged(v.collectionLabel, 'COLONY');
    }
    syncState() {
      var r = this.run; if (!r) return;
      DEBUG_STATE.mode = r.mode; DEBUG_STATE.status = r.status; DEBUG_STATE.rank = r.rank; DEBUG_STATE.xp = Math.round(r.xp * 100) / 100; DEBUG_STATE.branch = r.branch || ''; DEBUG_STATE.foraged = r.foraged; DEBUG_STATE.lane = r.lane ? r.lane.id : LANES[0].id; DEBUG_STATE.seed = r.seed; DEBUG_STATE.xpPerMinute = Math.round(r.rate * 100) / 100; DEBUG_STATE.players = r.players.map(function (p) { return { id: p.id, hp: Math.ceil(p.hp), form: p.form, ko: p.ko }; }); DEBUG_STATE.collection = profile.collection; DEBUG_STATE.colony = profile.colony;
      window.__ss.state = DEBUG_STATE;
    }
    update(time, delta) {
      this.applyProbeForces(); this.pollGamepads(); this.collectInput();
      var juice = kit.juice.frame(); if (juice.frozen || this.lifecyclePaused || kit.paused) { this.renderBase(); return; }
      var safeDelta = clamp(finite(delta, 0), 0, STEP * 1000); this.accumulator = Math.min(STEP, this.accumulator + safeDelta / 1000);
      if (this.accumulator >= STEP) { this.accumulator -= STEP; this.stepSim(); }
      this.cameras.main.setScroll(-juice.dx, -juice.dy); this.renderBase();
    }
  }

  var config = {
    type: Phaser.CANVAS, parent: 'game', backgroundColor: '#061013',
    render: { antialias: true, roundPixels: true, clearBeforeRender: true },
    scale: { mode: Phaser.Scale.FIT, width: W, height: H, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 8 }, scene: [BootScene, PlayScene]
  };
  config.scale.width = Math.round(W * RETINA_FACTOR);
  config.scale.height = Math.round(H * RETINA_FACTOR);
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
  Game.phaser = new Phaser.Game(config);
}());
