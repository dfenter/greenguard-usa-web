/* Blast Radius - AAA round 2
 * Phaser 3 renders. GGKit owns lifecycle, input identity, save, audio,
 * pause, settings, loading and juice. Gameplay advances on a fixed stepped
 * clock so a slow frame becomes slow motion, never a time skip.
 *
 * Round 2 adds: procedural per-arena tile themes baked to textures, a
 * multi-stage blast (core, arms, shockwave, debris, smoke), fuse countdown
 * rings, block chunking, shimmering pickups, six bot personalities with a
 * shared danger map, seven power-ups with counters, a 24 arena campaign
 * with modifiers, sudden-death compression, and a duel mode against three
 * bots.
 */
(function () {
  'use strict';

  var PhaserRef = window.Phaser;
  var KitRef = window.GGKit;
  var STEP = 1 / 60;
  var COLS = 11;
  var ROWS = 13;
  var BAKE_TILE = 40;
  /* Device pixel density. The canvas backing store is sized in device
   * pixels and every baked texture rasterises at the same density, so
   * nothing is a 1x bake stretched over a 3x screen. */
  var DPR = clampEarly(window.devicePixelRatio || 1, 1, 3);
  var BAKE_SCALE = DPR;
  function clampEarly(value, min, max) {
    var n = typeof value === 'number' && isFinite(value) ? value : min;
    return n < min ? min : n > max ? max : n;
  }
  var SAVE_VERSION = 2;
  var CAMPAIGN_LENGTH = 24;
  var MAX_BLASTS = 32;
  var MAX_BLOCK_SPRITES = COLS * ROWS + 60;
  var MAX_CHASER_SPRITES = 10;
  var MAX_BOMB_SPRITES = 26;
  var MAX_DROP_SPRITES = 64;
  var MAX_CRATE_SPRITES = 12;
  var MAX_BLAST_CELL_SPRITES = 110;
  var MAX_SHOCK_SPRITES = 14;
  var MAX_HAZARD_SPRITES = 26;
  var MAX_WARN_SPRITES = 40;
  var PARTICLE_POOL_SIZES = { sparks: 96, debris: 64, smoke: 46, pickup: 44, confetti: 40 };
  var PARTICLE_SYSTEM_NAMES = ['sparks', 'debris', 'smoke', 'pickup', 'confetti'];
  var PARTICLE_TEXTURE = { sparks: 'br-p-spark', debris: 'br-p-chunk', smoke: 'br-p-smoke', pickup: 'br-p-shard', confetti: 'br-p-chunk' };
  var DEPTH = {
    board: 10, hazard: 14, warn: 15, block: 20, crate: 21, drop: 22, shadow: 23,
    bomb: 24, chaser: 26, player: 27, blast: 30, shock: 31, particle: 33,
    vignette: 40, chrome: 44, hud: 50, button: 60
  };

  var DIRS = [
    { dx: 1, dy: 0, code: 'right' },
    { dx: -1, dy: 0, code: 'left' },
    { dx: 0, dy: 1, code: 'down' },
    { dx: 0, dy: -1, code: 'up' }
  ];
  var MOVE_KEYS = [
    { code: 'ArrowRight', alt: 'KeyD', dir: DIRS[0] },
    { code: 'ArrowLeft', alt: 'KeyA', dir: DIRS[1] },
    { code: 'ArrowDown', alt: 'KeyS', dir: DIRS[2] },
    { code: 'ArrowUp', alt: 'KeyW', dir: DIRS[3] }
  ];

  /* ------------------------------------------------------------- drops */
  var DROP_TYPES = ['bomb', 'radius', 'boots', 'shield', 'points', 'life', 'kick', 'remote', 'pierce'];
  var DROP_COLORS = {
    bomb: 0x5de5d1, radius: 0xffbd58, boots: 0xff6d9e, shield: 0x72a7ff,
    points: 0xd69bff, life: 0xff6c63, kick: 0xb696ff, remote: 0x87e6ff, pierce: 0x9dff8f
  };
  var DROP_GLYPH = {
    bomb: '+B', radius: 'R', boots: '>>', shield: 'S', points: '$',
    life: '+1', kick: 'K', remote: 'D', pierce: 'P'
  };
  var DROP_CHIP = {
    bomb: 'BOMB UP', radius: 'BLAST UP', boots: 'SPEED UP', shield: 'SHIELD',
    points: '+75', life: 'EXTRA LIFE', kick: 'KICK', remote: 'REMOTE', pierce: 'PIERCE'
  };

  /* ------------------------------------------------------------ themes */
  var THEMES = {
    plaza: {
      key: 'plaza', name: 'SUNKEN PLAZA', short: 'OPEN PLAZA', accent: 0x4ee5cc,
      floorA: '#0f2b32', floorB: '#0c242b', grout: '#154049', vign: '#03151a',
      hardTop: '#2c626c', hardBot: '#153841', hardRim: '#7ce6da',
      blockTop: '#31756c', blockBot: '#1a4642', blockRim: '#8ff5db',
      glow: '#4ee5cc', decor: 'tile', density: 0.27, gimmick: 'MOVABLE CRATES'
    },
    warren: {
      key: 'warren', name: 'MAZE WARREN', short: 'TIGHT WARREN', accent: 0xc6a1ff,
      floorA: '#1d1a33', floorB: '#171429', grout: '#2b2450', vign: '#0c0a1a',
      hardTop: '#4b3f7d', hardBot: '#281f4b', hardRim: '#c8b0ff',
      blockTop: '#5a4a8f', blockBot: '#2f2557', blockRim: '#d9c6ff',
      glow: '#c6a1ff', decor: 'weave', density: 0.51, gimmick: 'ONE-WAY GAPS'
    },
    vault: {
      key: 'vault', name: 'SYMMETRICAL VAULT', short: 'MIRROR VAULT', accent: 0xffc35e,
      floorA: '#2a2113', floorB: '#221b0f', grout: '#3d301a', vign: '#150f06',
      hardTop: '#7a5c2b', hardBot: '#3f2e14', hardRim: '#ffd68a',
      blockTop: '#8a6a2f', blockBot: '#4a3617', blockRim: '#ffe3a4',
      glow: '#ffc35e', decor: 'rivet', density: 0.43, gimmick: 'PULSE HAZARDS'
    },
    nest: {
      key: 'nest', name: 'CHASER NEST', short: 'NEST COMPLEX', accent: 0xff7187,
      floorA: '#2b1420', floorB: '#22101a', grout: '#411c2b', vign: '#160810',
      hardTop: '#7d3149', hardBot: '#42192b', hardRim: '#ff9fb2',
      blockTop: '#8c3a52', blockBot: '#4a1e2c', blockRim: '#ffb0c0',
      glow: '#ff7187', decor: 'web', density: 0.56, gimmick: 'NEST GATES'
    },
    circuit: {
      key: 'circuit', name: 'LIVE CIRCUIT', short: 'CIRCUIT DECK', accent: 0x5cc9ff,
      floorA: '#0d2233', floorB: '#0a1b29', grout: '#123448', vign: '#04101a',
      hardTop: '#2a5f85', hardBot: '#123449', hardRim: '#8ad6ff',
      blockTop: '#2d6f96', blockBot: '#153e55', blockRim: '#a2e2ff',
      glow: '#5cc9ff', decor: 'trace', density: 0.47, gimmick: 'LIVE RAILS'
    },
    foundry: {
      key: 'foundry', name: 'ASH FOUNDRY', short: 'ASH FOUNDRY', accent: 0xff9d4d,
      floorA: '#2a1d16', floorB: '#211711', grout: '#3d2a1e', vign: '#150d08',
      hardTop: '#7b4a26', hardBot: '#3f2513', hardRim: '#ffc08a',
      blockTop: '#8a5228', blockBot: '#4a2c14', blockRim: '#ffcf9c',
      glow: '#ff9d4d', decor: 'ember', density: 0.5, gimmick: 'SLAG VENTS'
    },
    boss: {
      key: 'boss', name: 'CORE VAULT', short: 'THE CORE', accent: 0xffdd72,
      floorA: '#251f10', floorB: '#1c180c', grout: '#3a3117', vign: '#120e05',
      hardTop: '#846a24', hardBot: '#453711', hardRim: '#ffe89a',
      blockTop: '#94792b', blockBot: '#4d3d14', blockRim: '#fff0ae',
      glow: '#ffdd72', decor: 'rivet', density: 0.6, gimmick: 'CORE HAZARDS'
    }
  };
  var THEME_ORDER = ['plaza', 'warren', 'vault', 'nest', 'circuit', 'foundry'];
  var THEME_FALLBACK = THEMES.plaza;
  function themeFor(key) { return THEMES[key] || THEME_FALLBACK; }

  /* --------------------------------------------------------- modifiers */
  var MODIFIERS = {
    haste: { key: 'haste', name: 'HASTE', blurb: 'Bots move faster', color: 0xff9d4d },
    swarm: { key: 'swarm', name: 'SWARM', blurb: 'Two extra bots', color: 0xff7187 },
    jammer: { key: 'jammer', name: 'JAMMER', blurb: 'Remote detonation is jammed', color: 0x87e6ff },
    brittle: { key: 'brittle', name: 'BRITTLE', blurb: 'Blocks shatter instantly', color: 0x9dff8f },
    armored: { key: 'armored', name: 'ARMORED', blurb: 'Blocks take two hits', color: 0xc6a1ff },
    quake: { key: 'quake', name: 'QUAKE', blurb: 'Tremors open scalding vents', color: 0xffbd58 },
    scarce: { key: 'scarce', name: 'SCARCE', blurb: 'Fewer power-ups drop', color: 0x9baabd },
    crush: { key: 'crush', name: 'CRUSH', blurb: 'The walls close in early', color: 0xff6c63 },
    magnet: { key: 'magnet', name: 'MAGNET', blurb: 'Bombs creep toward bots', color: 0xd69bff },
    scavenger: { key: 'scavenger', name: 'SCAVENGER', blurb: 'Bots grab power-ups too', color: 0x5cc9ff }
  };
  var MODIFIER_FALLBACK = { key: 'none', name: 'CLEAN', blurb: '', color: 0x5de5d1 };
  function modifierFor(key) { return MODIFIERS[key] || MODIFIER_FALLBACK; }

  /* ------------------------------------------------------ personalities */
  var PERSONALITIES = {
    drifter: {
      key: 'drifter', name: 'DRIFTER', color: 0x7ae5d6, shape: 'blob', points: 150,
      delay: 0.48, chase: 0, bombChance: 0, fear: 0.35, greed: 0.1, hp: 1
    },
    hunter: {
      key: 'hunter', name: 'HUNTER', color: 0xffb35e, shape: 'wedge', points: 180,
      delay: 0.34, chase: 1, bombChance: 0, fear: 0.6, greed: 0.2, hp: 1
    },
    flanker: {
      key: 'flanker', name: 'FLANKER', color: 0xff7187, shape: 'kite', points: 250,
      delay: 0.3, chase: 0.7, bombChance: 0.04, fear: 0.7, greed: 0.25, hp: 1
    },
    sapper: {
      key: 'sapper', name: 'SAPPER', color: 0x9dff8f, shape: 'crate', points: 280,
      delay: 0.36, chase: 0.55, bombChance: 0.4, fear: 0.85, greed: 0.5, hp: 1
    },
    warden: {
      key: 'warden', name: 'WARDEN', color: 0x87e6ff, shape: 'shield', points: 320,
      delay: 0.42, chase: 0.4, bombChance: 0.16, fear: 0.5, greed: 0.75, hp: 2
    },
    sprinter: {
      key: 'sprinter', name: 'SPRINTER', color: 0xd69bff, shape: 'spike', points: 260,
      delay: 0.2, chase: 0.95, bombChance: 0, fear: 0.95, greed: 0.15, hp: 1
    },
    duelist: {
      key: 'duelist', name: 'DUELIST', color: 0xffc45d, shape: 'wedge', points: 400,
      delay: 0.26, chase: 0.85, bombChance: 0.55, fear: 0.95, greed: 0.85, hp: 1
    },
    overlord: {
      key: 'overlord', name: 'OVERLORD', color: 0xffdd72, shape: 'crown', points: 1200,
      delay: 0.3, chase: 1, bombChance: 0.22, fear: 0.4, greed: 0.2, hp: 5
    }
  };
  var PERSONALITY_FALLBACK = PERSONALITIES.drifter;
  function personalityFor(key) { return PERSONALITIES[key] || PERSONALITY_FALLBACK; }
  var LEGACY_TIER = { wander: 'drifter', hunt: 'hunter', 'ambush-flank': 'flanker' };
  var PERSONALITY_LADDER = [
    ['drifter'], ['drifter', 'hunter'], ['hunter'], ['hunter', 'flanker'],
    ['flanker', 'sapper'], ['sapper', 'hunter'], ['sapper', 'flanker'],
    ['warden', 'hunter'], ['sprinter', 'hunter'], ['sprinter', 'flanker'],
    ['warden', 'sapper'], ['sprinter', 'sapper', 'flanker']
  ];

  /* ------------------------------------------------------------ arenas */
  var ARENA_TITLES = [
    'FIRST CONTACT', 'CROSSED WIRES', 'MIRROR LOCK', 'HOT NEST', 'LIVE RAILS', 'CORE ONE',
    'SERVICE CUT', 'WARREN TIGHT', 'PRESSURE VAULT', 'BROOD DEEP', 'OPEN BUS', 'CORE TWO',
    'PLAZA ASH', 'BLIND LOOP', 'SPLIT VAULT', 'NEST FEVER', 'ARC FAULT', 'CORE THREE',
    'LAST PLAZA', 'DEAD WARREN', 'SEALED VAULT', 'HIVE COLLAPSE', 'OVERLOAD', 'CORE FINAL'
  ];
  var ARENA_MODS = [
    [], [], ['haste'], ['swarm'], ['jammer'], ['quake'],
    ['brittle'], ['armored'], ['scavenger'], ['haste', 'swarm'], ['magnet'], ['crush'],
    ['scarce'], ['jammer', 'haste'], ['armored', 'swarm'], ['quake', 'scavenger'], ['magnet', 'brittle'], ['crush', 'haste'],
    ['scarce', 'swarm'], ['jammer', 'armored'], ['magnet', 'quake'], ['scavenger', 'haste', 'swarm'], ['brittle', 'crush'], ['crush', 'swarm', 'haste']
  ];

  function buildArenas() {
    var list = [];
    for (var i = 1; i <= CAMPAIGN_LENGTH; i += 1) {
      var boss = i % 6 === 0;
      var theme = boss ? 'boss' : THEME_ORDER[(i - 1) % THEME_ORDER.length];
      var mods = ARENA_MODS[i - 1] || [];
      var ladder = PERSONALITY_LADDER[Math.min(PERSONALITY_LADDER.length - 1, Math.floor((i - 1) / 2))] || PERSONALITY_LADDER[0];
      var count = boss ? 2 + Math.floor(i / 8) : Math.min(7, 2 + Math.floor(i / 3));
      var goldTime = 34 + i * 2;
      var goldBlocks = 12 + i;
      list.push({
        id: i,
        theme: theme,
        title: ARENA_TITLES[i - 1] || ('SECTOR ' + i),
        boss: boss,
        roster: ladder,
        count: count,
        mods: mods,
        density: clamp(themeFor(theme).density + (i - 1) * 0.008, 0.24, 0.62),
        suddenAt: boss ? 110 : 74 + Math.max(0, 24 - i),
        goldTime: goldTime,
        silverTime: Math.round(goldTime * 1.45),
        goldBlocks: goldBlocks,
        silverBlocks: Math.round(goldBlocks * 0.65)
      });
    }
    return list;
  }

  function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function keyOf(x, y) { return x + ',' + y; }
  function validObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function safeNumber(value, fallback) { return typeof value === 'number' && isFinite(value) ? value : fallback; }

  var ARENAS = buildArenas();

  function arenaFor(value) {
    var index = Math.floor(Number(value));
    if (!isFinite(index) || index < 1 || index > ARENAS.length) return ARENAS[0];
    return ARENAS[index - 1] || ARENAS[0];
  }

  function getForcedArena(value) {
    if (typeof value === 'string') {
      for (var i = 0; i < ARENAS.length; i += 1) {
        if (ARENAS[i].theme === value) return ARENAS[i].id;
      }
    }
    var number = Number(value);
    return isFinite(number) && number >= 1 && number <= ARENAS.length ? Math.floor(number) : null;
  }

  function forcedPersonality(value) {
    if (typeof value !== 'string') return null;
    var mapped = LEGACY_TIER[value] || value;
    return PERSONALITIES[mapped] ? mapped : null;
  }

  function setTextIfChanged(textObject, value) {
    if (!textObject) return;
    var next = String(value);
    if (textObject.text !== next) textObject.setText(next);
  }

  function seeded(seed) {
    var value = seed >>> 0;
    return function () {
      value = (value + 0x6D2B79F5) >>> 0;
      var t = Math.imul(value ^ (value >>> 15), 1 | value);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function readGamepadState() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return { dir: null, bomb: false };
    var pads = navigator.getGamepads();
    for (var i = 0; i < pads.length; i += 1) {
      var pad = pads[i];
      if (!pad || !pad.connected) continue;
      var axisX = safeNumber(pad.axes && pad.axes[0], 0);
      var axisY = safeNumber(pad.axes && pad.axes[1], 0);
      var dir = null;
      if (Math.max(Math.abs(axisX), Math.abs(axisY)) >= 0.35) {
        dir = Math.abs(axisX) >= Math.abs(axisY) ? (axisX > 0 ? DIRS[0] : DIRS[1]) : (axisY > 0 ? DIRS[2] : DIRS[3]);
      } else if (pad.buttons && pad.buttons[12] && pad.buttons[12].pressed) dir = DIRS[3];
      else if (pad.buttons && pad.buttons[13] && pad.buttons[13].pressed) dir = DIRS[2];
      else if (pad.buttons && pad.buttons[14] && pad.buttons[14].pressed) dir = DIRS[1];
      else if (pad.buttons && pad.buttons[15] && pad.buttons[15].pressed) dir = DIRS[0];
      var bomb = !!(pad.buttons && ((pad.buttons[0] && pad.buttons[0].pressed) || (pad.buttons[1] && pad.buttons[1].pressed)));
      return { dir: dir, bomb: bomb };
    }
    return { dir: null, bomb: false };
  }

  function makeParticlePool(size) {
    return {
      items: Array.from({ length: size }, function () { return { active: false, life: 0 }; }),
      overflow: 0
    };
  }

  function readInsets() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
      'env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);
    var style = getComputedStyle(probe);
    var result = {
      top: parseFloat(style.paddingTop) || 0,
      right: parseFloat(style.paddingRight) || 0,
      bottom: parseFloat(style.paddingBottom) || 0,
      left: parseFloat(style.paddingLeft) || 0
    };
    probe.remove();
    return result;
  }

  /* ------------------------------------------------------- debug state */
  var BR_DEBUG_STATE = {
    mode: 'title', score: 0, lives: 3, arena: 1, chaserCount: 0,
    phase: 'title', family: 'plaza', theme: 'plaza', chaserTier: 'drifter',
    personalities: [], modifiers: [], timeLeft: 0, suddenDeath: false,
    duelRound: 0, duelScore: [0, 0, 0, 0], forceArena: null, forceChaserTier: null,
    tutorialStep: 0, blocksBroken: 0, medal: null, fxOverflow: 0, saveVersion: SAVE_VERSION
  };
  var existingDebug = validObject(window.__br) && validObject(window.__br.state) ? window.__br.state : null;
  if (existingDebug) {
    BR_DEBUG_STATE.forceArena = existingDebug.forceArena == null ? null : existingDebug.forceArena;
    BR_DEBUG_STATE.forceChaserTier = existingDebug.forceChaserTier == null ? null : existingDebug.forceChaserTier;
  }
  window.__br = window.__br || {};
  window.__br.state = BR_DEBUG_STATE;

  function debugValue(name) {
    var host = window.__br && validObject(window.__br.state) ? window.__br.state : null;
    return host && host[name] != null ? host[name] : BR_DEBUG_STATE[name];
  }

  /* --------------------------------------------------------- save v2 */
  function acceptSaveShell(save) {
    return validObject(save) && (save.version === 1 || save.version === SAVE_VERSION);
  }

  function defaultSave() {
    return {
      version: SAVE_VERSION, unlocked: 1, medals: {}, bestTimes: {},
      tutorialDone: false, bestScore: 0, duelWins: 0, duelRuns: 0, duelBest: 0
    };
  }

  function sanitizeRecord(source, max, check) {
    var out = {};
    if (!validObject(source)) return out;
    var keys = Object.keys(source);
    for (var i = 0; i < keys.length; i += 1) {
      var id = Number(keys[i]);
      if (!Number.isInteger(id) || id < 1 || id > max) continue;
      var value = source[keys[i]];
      if (!check(value)) continue;
      out[String(id)] = value;
    }
    return out;
  }

  function migrateSave(raw) {
    if (!validObject(raw)) return defaultSave();
    var next = defaultSave();
    var medalCheck = function (value) { return ['bronze', 'silver', 'gold'].indexOf(value) >= 0; };
    var timeCheck = function (value) { return Number.isFinite(value) && value >= 0 && value < 100000; };
    next.medals = sanitizeRecord(raw.medals, CAMPAIGN_LENGTH, medalCheck);
    next.bestTimes = sanitizeRecord(raw.bestTimes, CAMPAIGN_LENGTH, timeCheck);
    next.tutorialDone = raw.tutorialDone === true;
    next.bestScore = Number.isFinite(raw.bestScore) && raw.bestScore >= 0 && raw.bestScore <= 1e9 ? raw.bestScore : 0;
    var unlocked = Number(raw.unlocked);
    next.unlocked = Number.isInteger(unlocked) ? clamp(unlocked, 1, CAMPAIGN_LENGTH) : 1;
    if (raw.version === 1) {
      /* v1 shipped a five arena campaign. A finished v1 profile opens the
       * sixth sector; nothing beyond that is assumed. */
      next.unlocked = clamp(next.unlocked, 1, 6);
    } else {
      next.duelWins = Number.isInteger(raw.duelWins) && raw.duelWins >= 0 ? Math.min(raw.duelWins, 1e6) : 0;
      next.duelRuns = Number.isInteger(raw.duelRuns) && raw.duelRuns >= 0 ? Math.min(raw.duelRuns, 1e6) : 0;
      next.duelBest = Number.isInteger(raw.duelBest) && raw.duelBest >= 0 ? Math.min(raw.duelBest, 1e6) : 0;
    }
    return next;
  }

  function validateSave(save) {
    if (!validObject(save) || save.version !== SAVE_VERSION) return false;
    if (!Number.isInteger(save.unlocked) || save.unlocked < 1 || save.unlocked > CAMPAIGN_LENGTH) return false;
    if (!validObject(save.medals) || !validObject(save.bestTimes)) return false;
    if (typeof save.tutorialDone !== 'boolean') return false;
    if (!Number.isFinite(save.bestScore) || save.bestScore < 0 || save.bestScore > 1e9) return false;
    if (!Number.isInteger(save.duelWins) || !Number.isInteger(save.duelRuns) || !Number.isInteger(save.duelBest)) return false;
    return true;
  }

  var Game = { phaser: null, play: null, insets: readInsets(), canvasRect: null, quality: 'high' };
  var kit = null;

  if (!PhaserRef || !KitRef) {
    BR_DEBUG_STATE.phase = 'boot-error';
    return;
  }

  kit = KitRef.create({
    slug: 'blast-radius',
    orientation: 'portrait',
    validateSave: acceptSaveShell,
    onPause: function () {
      var scene = Game.play;
      if (scene && scene.scene.isActive()) scene.scene.pause();
    },
    onResume: function () {
      var scene = Game.play;
      if (scene && scene.scene.isPaused()) scene.scene.resume();
    },
    onRestart: function () {
      var scene = Game.play;
      if (scene) scene.restartRun();
    }
  });

  var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (reducedMotion) { kit.juice.enabled = false; Game.quality = 'low'; }
  if (window.devicePixelRatio && window.devicePixelRatio < 1.5 && Math.min(window.innerWidth, window.innerHeight) < 340) Game.quality = 'low';

  kit.audio.register({
    fuse_tick: 'assets/fuse_tick.mp3',
    blast_boom_a: 'assets/blast_boom_a.mp3',
    blast_boom_b: 'assets/blast_boom_b.mp3',
    blast_chain: 'assets/blast_chain.mp3',
    chaser_growl: 'assets/chaser_growl.mp3',
    pickup_chime: 'assets/pickup_chime.mp3',
    banner_sting: 'assets/banner_sting.mp3',
    score_ping: 'assets/score_ping.mp3',
    music_base: 'assets/music_base.mp3',
    music_heat: 'assets/music_heat.mp3'
  });

  var rawProfile = kit.save.get(null);
  var profile = migrateSave(rawProfile);
  if (!validateSave(profile)) profile = defaultSave();
  var migratedFrom = validObject(rawProfile) && rawProfile.version === 1 ? 1 : null;
  function persist() {
    if (!validateSave(profile)) return;
    kit.save.set(profile);
  }
  if (migratedFrom) persist();

  /* -------------------------------------------------- window gestures
   * GGKit's pointer map is authoritative only during live play: it drops
   * an id before a canvas-level handler ever sees the release, and it
   * feeds nothing at all while paused. The title keeps its own gesture
   * map on WINDOW listeners registered after kit init, and mirrors every
   * claim back into the kit so both agree.
   */
  var Gestures = (function () {
    var map = new Map();
    var api = {
      pointers: map,
      onDown: null,
      onMove: null,
      onUp: null
    };
    function claim(id, x, y, zone) {
      if (!kit.input || !kit.input.pointers) return;
      var point = kit.input.pointers.get(id);
      if (!point) kit.input.pointers.set(id, { x: x, y: y, startX: x, startY: y, downAt: Date.now(), zone: zone || null });
      else { point.x = x; point.y = y; if (zone) point.zone = zone; }
    }
    window.addEventListener('pointerdown', function (event) {
      var record = {
        id: event.pointerId, x: event.clientX, y: event.clientY,
        startX: event.clientX, startY: event.clientY,
        anchorX: event.clientX, anchorY: event.clientY,
        downAt: performance.now(), zone: null
      };
      map.set(event.pointerId, record);
      claim(event.pointerId, event.clientX, event.clientY, 'gesture');
      if (api.onDown) api.onDown(record);
    }, { passive: true });
    window.addEventListener('pointermove', function (event) {
      var record = map.get(event.pointerId);
      if (!record) return;
      record.x = event.clientX; record.y = event.clientY;
      claim(event.pointerId, event.clientX, event.clientY, record.zone);
      if (api.onMove) api.onMove(record);
    }, { passive: true });
    function release(event) {
      var record = map.get(event.pointerId);
      if (!record) return;
      map.delete(event.pointerId);
      if (api.onUp) api.onUp(record);
    }
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointercancel', release, { passive: true });
    window.addEventListener('blur', function () {
      var records = Array.from(map.values());
      map.clear();
      for (var i = 0; i < records.length; i += 1) if (api.onUp) api.onUp(records[i]);
    });
    api.clear = function () { map.clear(); };
    return api;
  }());

  function canvasRect() {
    var canvas = Game.phaser && Game.phaser.canvas;
    if (!canvas) return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    if (!Game.canvasRect) Game.canvasRect = canvas.getBoundingClientRect();
    return Game.canvasRect;
  }
  window.addEventListener('resize', function () { Game.canvasRect = null; });
  window.addEventListener('orientationchange', function () { Game.canvasRect = null; });

  /* --------------------------------------------------- texture baking
   * BAKE BEFORE YOU BUILD. Every canvas below is finished and registered
   * with Phaser before any scene constructs a sprite that references it,
   * so no object can ever be sized against the missing-texture frame.
   */
  function bakeCanvas(scene, key, w, h, draw, scaleOverride) {
    var textures = scene.textures;
    if (textures.exists(key)) textures.remove(key);
    var scale = scaleOverride || BAKE_SCALE;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    /* draw() works in logical units; the backing store is denser. */
    draw(ctx, w, h);
    textures.addCanvas(key, canvas);
    return key;
  }

  /* ---- colour-depth passes: flat fills band and read as cheap, so every
   * large surface gets gradient plus grain. grainPixels is a real per-pixel
   * dither for boot-time surfaces; grainRects is the cheap variant used
   * where a bake happens mid-run. */
  function grainPixels(ctx, w, h, amount, scale) {
    var s = scale || BAKE_SCALE;
    var pw = Math.max(1, Math.round(w * s));
    var ph = Math.max(1, Math.round(h * s));
    var image;
    try { image = ctx.getImageData(0, 0, pw, ph); } catch (e) { return; }
    var data = image.data;
    var seed = 0x2545F491;
    for (var i = 0; i < data.length; i += 4) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed |= 0;
      var n = ((seed >>> 24) / 255 - 0.5) * amount * 2;
      data[i] = data[i] + n;
      data[i + 1] = data[i + 1] + n * 0.86;
      data[i + 2] = data[i + 2] + n * 1.12;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(image, 0, 0);
    ctx.restore();
  }

  function grainRects(ctx, w, h, count, alpha, rng) {
    var random = rng || Math.random;
    for (var i = 0; i < count; i += 1) {
      var x = random() * w;
      var y = random() * h;
      var size = 1 + random() * 2.2;
      var tint = Math.floor(random() * 255);
      ctx.fillStyle = 'rgba(' + tint + ',' + ((tint * 7) % 255) + ',' + ((tint * 13) % 255) + ',' + (alpha * (0.4 + random() * 0.6)).toFixed(3) + ')';
      ctx.fillRect(x, y, size, size);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function polyPath(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
  }

  function hexToRgb(hex) {
    var value = hex.replace('#', '');
    if (value.length === 3) value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    var n = parseInt(value, 16);
    if (!isFinite(n)) return { r: 255, g: 255, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgba(hex, alpha) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
  }
  function intToHex(value) {
    var s = (value >>> 0).toString(16);
    while (s.length < 6) s = '0' + s;
    return '#' + s.slice(-6);
  }

  function bevelPanel(ctx, x, y, w, h, r, topColor, botColor, rimColor, rimAlpha) {
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, botColor);
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = rgba(rimColor, rimAlpha == null ? 0.55 : rimAlpha);
    ctx.lineWidth = Math.max(1.5, w * 0.05);
    ctx.beginPath();
    ctx.moveTo(x + r * 0.5, y + ctx.lineWidth * 0.6);
    ctx.lineTo(x + w - r * 0.5, y + ctx.lineWidth * 0.6);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.moveTo(x + r * 0.5, y + h - ctx.lineWidth * 0.6);
    ctx.lineTo(x + w - r * 0.5, y + h - ctx.lineWidth * 0.6);
    ctx.stroke();
    ctx.restore();
    roundRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = rgba(rimColor, 0.32);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function radialGlow(ctx, cx, cy, radius, color, inner, outer) {
    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, rgba(color, inner));
    grad.addColorStop(0.55, rgba(color, inner * 0.45));
    grad.addColorStop(1, rgba(color, outer || 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---- block textures per theme, three crumble stages plus armored ---- */
  function bakeBlocks(scene, theme) {
    for (var stage = 0; stage < 3; stage += 1) {
      (function (state) {
        bakeCanvas(scene, 'br-block-' + theme.key + '-' + state, 64, 64, function (ctx) {
          var inset = 2 + state * 3;
          radialGlow(ctx, 32, 30, 34, theme.blockRim, 0.3 - state * 0.08, 0);
          bevelPanel(ctx, inset, inset, 64 - inset * 2, 64 - inset * 2, 8 - state, theme.blockTop, theme.blockBot, theme.blockRim, 0.6 - state * 0.15);
          ctx.save();
          roundRect(ctx, inset, inset, 64 - inset * 2, 64 - inset * 2, 8 - state);
          ctx.clip();
          var face = ctx.createLinearGradient(0, inset, 0, inset + 20);
          face.addColorStop(0, rgba(theme.blockRim, 0.34 - state * 0.1));
          face.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = face;
          ctx.fillRect(inset, inset, 64 - inset * 2, 22);
          ctx.restore();
          roundRect(ctx, inset + 1.5, inset + 1.5, 64 - inset * 2 - 3, 64 - inset * 2 - 3, 7 - state);
          ctx.strokeStyle = rgba(theme.blockRim, 0.6 - state * 0.18);
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.save();
          roundRect(ctx, inset, inset, 64 - inset * 2, 64 - inset * 2, 8 - state);
          ctx.clip();
          ctx.strokeStyle = rgba(theme.blockRim, 0.22);
          ctx.lineWidth = 1;
          for (var i = 0; i < 3; i += 1) {
            ctx.beginPath();
            ctx.moveTo(10 + i * 6, 12);
            ctx.lineTo(20 + i * 12, 52);
            ctx.stroke();
          }
          if (state > 0) {
            ctx.strokeStyle = 'rgba(0,0,0,0.62)';
            ctx.lineWidth = 2 + state;
            ctx.beginPath();
            ctx.moveTo(18, 8); ctx.lineTo(28, 26); ctx.lineTo(20, 36); ctx.lineTo(32, 56);
            ctx.moveTo(44, 10); ctx.lineTo(36, 30); ctx.lineTo(48, 44);
            ctx.stroke();
            ctx.strokeStyle = rgba(theme.blockRim, 0.5);
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          if (state > 1) {
            ctx.fillStyle = 'rgba(0,0,0,0.34)';
            ctx.fillRect(26, 18, 10, 10);
            ctx.fillRect(38, 36, 12, 12);
          }
          ctx.restore();
        });
      }(stage));
    }
    bakeCanvas(scene, 'br-block-' + theme.key + '-armor', 64, 64, function (ctx) {
      bevelPanel(ctx, 2, 2, 60, 60, 8, theme.hardTop, theme.hardBot, theme.hardRim, 0.7);
      ctx.strokeStyle = rgba(theme.hardRim, 0.8);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(16, 16); ctx.lineTo(48, 48);
      ctx.moveTo(48, 16); ctx.lineTo(16, 48);
      ctx.stroke();
      ctx.fillStyle = rgba(theme.hardRim, 0.85);
      ctx.beginPath(); ctx.arc(32, 32, 5, 0, Math.PI * 2); ctx.fill();
    });
  }

  /* ---- static board bake: floor, hard walls, one-way gates, vignette ---- */
  function bakeBoard(scene, key, theme, grid, oneWays) {
    var w = COLS * BAKE_TILE;
    var h = ROWS * BAKE_TILE;
    return bakeCanvas(scene, key, w, h, function (ctx) {
      ctx.fillStyle = theme.vign;
      ctx.fillRect(0, 0, w, h);
      for (var y = 0; y < ROWS; y += 1) {
        for (var x = 0; x < COLS; x += 1) {
          var px = x * BAKE_TILE;
          var py = y * BAKE_TILE;
          var cell = grid[y] && grid[y][x] ? grid[y][x] : { kind: 'hard' };
          /* per-tile hue jitter plus a vertical gradient: a flat fill of
           * two colours is the banded look the owner rejected. */
          var base = hexToRgb((x + y) % 2 ? theme.floorA : theme.floorB);
          var hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
          var jr = ((hash & 15) - 7) * 0.9;
          var jg = (((hash >> 4) & 15) - 7) * 0.9;
          var jb = (((hash >> 8) & 15) - 7) * 0.9;
          var tileGrad = ctx.createLinearGradient(px, py, px, py + BAKE_TILE);
          tileGrad.addColorStop(0, 'rgb(' + clamp(Math.round(base.r + jr + 7), 0, 255) + ',' + clamp(Math.round(base.g + jg + 8), 0, 255) + ',' + clamp(Math.round(base.b + jb + 9), 0, 255) + ')');
          tileGrad.addColorStop(1, 'rgb(' + clamp(Math.round(base.r + jr - 6), 0, 255) + ',' + clamp(Math.round(base.g + jg - 6), 0, 255) + ',' + clamp(Math.round(base.b + jb - 5), 0, 255) + ')');
          ctx.fillStyle = tileGrad;
          ctx.fillRect(px, py, BAKE_TILE, BAKE_TILE);
          ctx.strokeStyle = rgba(theme.grout, 0.85);
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, BAKE_TILE - 1, BAKE_TILE - 1);
          if (theme.decor === 'trace' && (x + y) % 3 === 0) {
            ctx.strokeStyle = rgba(theme.glow, 0.14);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px + 8, py + BAKE_TILE - 8);
            ctx.lineTo(px + BAKE_TILE - 8, py + BAKE_TILE - 8);
            ctx.lineTo(px + BAKE_TILE - 8, py + 8);
            ctx.stroke();
          } else if (theme.decor === 'weave' && (x * 3 + y) % 4 === 0) {
            ctx.strokeStyle = rgba(theme.glow, 0.1);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(px + 6, py + 6); ctx.lineTo(px + BAKE_TILE - 6, py + BAKE_TILE - 6);
            ctx.stroke();
          } else if (theme.decor === 'ember' && (x * 5 + y * 3) % 7 === 0) {
            radialGlow(ctx, px + BAKE_TILE / 2, py + BAKE_TILE / 2, BAKE_TILE * 0.4, theme.glow, 0.12, 0);
          } else if (theme.decor === 'rivet' && x % 2 === 1 && y % 2 === 1) {
            ctx.fillStyle = rgba(theme.grout, 0.9);
            ctx.beginPath(); ctx.arc(px + BAKE_TILE / 2, py + BAKE_TILE / 2, 2.4, 0, Math.PI * 2); ctx.fill();
          } else if (theme.decor === 'web' && (x + y * 2) % 5 === 0) {
            ctx.strokeStyle = rgba(theme.glow, 0.09);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(px + BAKE_TILE / 2, py + BAKE_TILE / 2, BAKE_TILE * 0.34, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (cell.kind === 'hard') {
            /* structural wall: dark, flush, hatched and riveted, so it can
             * never be mistaken for a breakable block */
            var hardGrad = ctx.createLinearGradient(px, py, px, py + BAKE_TILE);
            hardGrad.addColorStop(0, theme.hardBot);
            hardGrad.addColorStop(0.55, 'rgba(0,0,0,0.86)');
            hardGrad.addColorStop(1, '#05090c');
            ctx.fillStyle = hardGrad;
            ctx.fillRect(px, py, BAKE_TILE, BAKE_TILE);
            ctx.save();
            ctx.beginPath();
            ctx.rect(px, py, BAKE_TILE, BAKE_TILE);
            ctx.clip();
            ctx.strokeStyle = rgba(theme.hardRim, 0.13);
            ctx.lineWidth = 2;
            for (var hatch = -BAKE_TILE; hatch < BAKE_TILE; hatch += 7) {
              ctx.beginPath();
              ctx.moveTo(px + hatch, py + BAKE_TILE);
              ctx.lineTo(px + hatch + BAKE_TILE, py);
              ctx.stroke();
            }
            ctx.restore();
            ctx.strokeStyle = rgba(theme.hardRim, 0.3);
            ctx.lineWidth = 1.5;
            ctx.strokeRect(px + 1, py + 1, BAKE_TILE - 2, BAKE_TILE - 2);
            ctx.fillStyle = rgba(theme.hardRim, 0.42);
            var rivets = [[6, 6], [BAKE_TILE - 6, 6], [6, BAKE_TILE - 6], [BAKE_TILE - 6, BAKE_TILE - 6]];
            for (var rv = 0; rv < rivets.length; rv += 1) {
              ctx.beginPath();
              ctx.arc(px + rivets[rv][0], py + rivets[rv][1], 1.8, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (cell.kind === 'oneway') {
            var way = oneWays.get(keyOf(x, y)) || { dx: 1, dy: 0 };
            ctx.fillStyle = rgba(theme.glow, 0.16);
            roundRect(ctx, px + 4, py + 4, BAKE_TILE - 8, BAKE_TILE - 8, 6);
            ctx.fill();
            ctx.strokeStyle = rgba(theme.glow, 0.6);
            ctx.lineWidth = 1.4;
            ctx.stroke();
            ctx.save();
            ctx.translate(px + BAKE_TILE / 2, py + BAKE_TILE / 2);
            ctx.rotate(Math.atan2(way.dy, way.dx));
            ctx.fillStyle = rgba(theme.glow, 0.92);
            for (var chev = 0; chev < 2; chev += 1) {
              var ox = -6 + chev * 9;
              polyPath(ctx, [[ox - 4, -8], [ox + 4, 0], [ox - 4, 8], [ox - 1, 0]]);
              ctx.fill();
            }
            ctx.restore();
          }
        }
      }
      /* key light from the upper left, then vignette, then grain */
      var lightGrad = ctx.createLinearGradient(0, 0, w * 0.8, h);
      lightGrad.addColorStop(0, rgba(theme.glow, 0.1));
      lightGrad.addColorStop(0.45, 'rgba(255,255,255,0.02)');
      lightGrad.addColorStop(1, 'rgba(0,0,0,0.16)');
      ctx.fillStyle = lightGrad;
      ctx.fillRect(0, 0, w, h);
      var vign = ctx.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, h * 0.72);
      vign.addColorStop(0, 'rgba(0,0,0,0)');
      vign.addColorStop(0.6, 'rgba(0,0,0,0.16)');
      vign.addColorStop(1, 'rgba(0,0,0,0.44)');
      ctx.fillStyle = vign;
      ctx.fillRect(0, 0, w, h);
      grainRects(ctx, w, h, 4200, 0.07, seeded(0x51ED ^ (theme.key.length * 977)));
      ctx.strokeStyle = rgba(theme.glow, 0.35);
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    });
  }

  /* ---------------------------------------------------------- actors */
  function drawEyes(ctx, cx, cy, spread, size, state, accent) {
    ctx.save();
    if (state === 'hurt') {
      ctx.strokeStyle = '#0a1116';
      ctx.lineWidth = size * 0.5;
      ctx.lineCap = 'round';
      [-spread, spread].forEach(function (dx) {
        ctx.beginPath();
        ctx.moveTo(cx + dx - size, cy - size);
        ctx.lineTo(cx + dx + size, cy + size);
        ctx.moveTo(cx + dx + size, cy - size);
        ctx.lineTo(cx + dx - size, cy + size);
        ctx.stroke();
      });
      ctx.restore();
      return;
    }
    var glowColor = state === 'hunt' ? '#ff5c5c' : state === 'alert' ? '#fff0a8' : accent;
    [-spread, spread].forEach(function (dx) {
      radialGlow(ctx, cx + dx, cy, size * 2.6, glowColor, 0.55, 0);
      ctx.fillStyle = '#0a1116';
      ctx.beginPath();
      ctx.ellipse(cx + dx, cy, size, size * (state === 'hunt' ? 0.6 : 1), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(cx + dx, cy - size * 0.1, size * 0.52, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function bodyPath(ctx, shape, w, h, squash) {
    var cx = w / 2;
    var cy = h / 2 + h * 0.04;
    var rx = w * 0.34 * (1 + squash * 0.16);
    var ry = h * 0.34 * (1 - squash * 0.16);
    if (shape === 'blob') {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry * 1.02, 0, 0, Math.PI * 2);
      ctx.closePath();
    } else if (shape === 'wedge') {
      polyPath(ctx, [[cx, cy - ry * 1.16], [cx + rx, cy + ry * 0.3], [cx + rx * 0.62, cy + ry], [cx - rx * 0.62, cy + ry], [cx - rx, cy + ry * 0.3]]);
    } else if (shape === 'kite') {
      polyPath(ctx, [[cx, cy - ry * 1.2], [cx + rx * 1.02, cy], [cx, cy + ry * 1.14], [cx - rx * 1.02, cy]]);
    } else if (shape === 'crate') {
      roundRect(ctx, cx - rx, cy - ry, rx * 2, ry * 2, Math.min(rx, ry) * 0.3);
    } else if (shape === 'shield') {
      ctx.beginPath();
      ctx.moveTo(cx - rx, cy - ry * 0.86);
      ctx.lineTo(cx + rx, cy - ry * 0.86);
      ctx.lineTo(cx + rx * 0.9, cy + ry * 0.4);
      ctx.quadraticCurveTo(cx, cy + ry * 1.3, cx - rx * 0.9, cy + ry * 0.4);
      ctx.closePath();
    } else if (shape === 'spike') {
      polyPath(ctx, [[cx, cy - ry * 1.3], [cx + rx * 0.62, cy - ry * 0.2], [cx + rx, cy + ry], [cx, cy + ry * 0.66], [cx - rx, cy + ry], [cx - rx * 0.62, cy - ry * 0.2]]);
    } else if (shape === 'crown') {
      polyPath(ctx, [
        [cx - rx, cy - ry * 0.5], [cx - rx * 0.66, cy - ry * 1.24], [cx - rx * 0.24, cy - ry * 0.62],
        [cx, cy - ry * 1.32], [cx + rx * 0.24, cy - ry * 0.62], [cx + rx * 0.66, cy - ry * 1.24],
        [cx + rx, cy - ry * 0.5], [cx + rx * 0.84, cy + ry], [cx - rx * 0.84, cy + ry]
      ]);
    } else {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.closePath();
    }
  }

  function bakeChaser(scene, personality, state) {
    var key = 'br-bot-' + personality.key + '-' + state;
    var accent = intToHex(personality.color);
    var squash = state === 'alert' ? -0.22 : state === 'hunt' ? 0.12 : 0;
    return bakeCanvas(scene, key, 72, 72, function (ctx, w, h) {
      var dull = state === 'hurt';
      var base = dull ? '#8d9bad' : accent;
      radialGlow(ctx, w / 2, h / 2 + 3, w * 0.48, base, dull ? 0.2 : 0.42, 0);
      bodyPath(ctx, personality.shape, w, h, squash);
      var grad = ctx.createLinearGradient(0, h * 0.14, 0, h * 0.9);
      grad.addColorStop(0, dull ? '#c3cdd9' : base);
      grad.addColorStop(0.55, dull ? '#7f8c9d' : rgba(base, 0.82));
      grad.addColorStop(1, dull ? '#455161' : '#101c26');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = dull ? 'rgba(220,230,240,0.5)' : rgba(base, 0.95);
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.save();
      bodyPath(ctx, personality.shape, w, h, squash);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.ellipse(w * 0.4, h * 0.34, w * 0.2, h * 0.11, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, h * 0.72, w, h * 0.3);
      ctx.restore();
      drawEyes(ctx, w / 2, h * 0.46, w * 0.12, w * 0.055, state, dull ? '#dbe4ee' : accent);
      if (state === 'alert') {
        ctx.strokeStyle = rgba(base, 0.9);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w * 0.44, -0.9, -0.2);
        ctx.stroke();
      }
      if (personality.key === 'overlord') {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.arc(w * 0.5, h * 0.2, 3.4, 0, Math.PI * 2); ctx.fill();
      }
      if (personality.key === 'sapper') {
        ctx.strokeStyle = '#ffcf7a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.22);
        ctx.quadraticCurveTo(w * 0.62, h * 0.1, w * 0.7, h * 0.16);
        ctx.stroke();
      }
    });
  }

  function bakePlayer(scene, state) {
    return bakeCanvas(scene, 'br-hero-' + state, 72, 72, function (ctx, w, h) {
      var lean = state === 'move' ? 0.1 : state === 'plant' ? -0.06 : 0;
      var crouch = state === 'plant' ? h * 0.05 : 0;
      var hurt = state === 'hit';
      var suit = hurt ? '#ff8f9c' : '#4ee5cc';
      radialGlow(ctx, w / 2, h * 0.56, w * 0.46, suit, 0.42, 0);
      ctx.save();
      ctx.translate(w / 2, h / 2 + crouch);
      ctx.rotate(lean);
      ctx.scale(1.14, 1.14);
      ctx.translate(-w / 2, -h / 2);
      /* boots */
      ctx.fillStyle = '#123039';
      roundRect(ctx, w * 0.32, h * 0.68, w * 0.15, h * 0.14, 4); ctx.fill();
      roundRect(ctx, w * 0.53, h * 0.68, w * 0.15, h * 0.14, 4); ctx.fill();
      /* torso */
      var grad = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.76);
      grad.addColorStop(0, hurt ? '#ffd0d6' : '#a9fff0');
      grad.addColorStop(0.5, suit);
      grad.addColorStop(1, '#12414a');
      roundRect(ctx, w * 0.29, h * 0.38, w * 0.42, h * 0.34, w * 0.12);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(233,255,246,0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();
      /* chest lamp */
      ctx.fillStyle = hurt ? '#ff5f74' : '#fff3b0';
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.53, w * 0.055, 0, Math.PI * 2); ctx.fill();
      /* arms */
      ctx.strokeStyle = '#17505b';
      ctx.lineWidth = w * 0.075;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (state === 'move') {
        ctx.moveTo(w * 0.3, h * 0.46); ctx.lineTo(w * 0.18, h * 0.6);
        ctx.moveTo(w * 0.7, h * 0.46); ctx.lineTo(w * 0.82, h * 0.4);
      } else if (state === 'plant') {
        ctx.moveTo(w * 0.3, h * 0.46); ctx.lineTo(w * 0.34, h * 0.66);
        ctx.moveTo(w * 0.7, h * 0.46); ctx.lineTo(w * 0.66, h * 0.66);
      } else {
        ctx.moveTo(w * 0.3, h * 0.46); ctx.lineTo(w * 0.22, h * 0.62);
        ctx.moveTo(w * 0.7, h * 0.46); ctx.lineTo(w * 0.78, h * 0.62);
      }
      ctx.stroke();
      /* helmet */
      var hg = ctx.createLinearGradient(0, h * 0.14, 0, h * 0.42);
      hg.addColorStop(0, '#eafff9');
      hg.addColorStop(1, hurt ? '#c86a76' : '#2e8f88');
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.32, w * 0.19, 0, Math.PI * 2);
      ctx.fillStyle = hg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(233,255,246,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      /* visor */
      ctx.beginPath();
      ctx.ellipse(w * 0.53, h * 0.33, w * 0.115, h * 0.07, -0.18, 0, Math.PI * 2);
      ctx.fillStyle = hurt ? '#5a1620' : '#0a2a33';
      ctx.fill();
      ctx.fillStyle = hurt ? '#ff9aa6' : '#8ef2e4';
      ctx.beginPath();
      ctx.ellipse(w * 0.56, h * 0.31, w * 0.045, h * 0.024, -0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  /* --------------------------------------------------- props and FX */
  function bakeProps(scene) {
    bakeCanvas(scene, 'br-bomb-body', 72, 72, function (ctx, w, h) {
      radialGlow(ctx, w / 2, h * 0.58, w * 0.46, '#ffc45d', 0.3, 0);
      var grad = ctx.createRadialGradient(w * 0.4, h * 0.42, w * 0.05, w * 0.5, h * 0.56, w * 0.34);
      grad.addColorStop(0, '#6f7f8d');
      grad.addColorStop(0.45, '#2c3a46');
      grad.addColorStop(1, '#101a22');
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.56, w * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(190,215,230,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(w * 0.4, h * 0.44, w * 0.08, h * 0.045, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3b4a58';
      roundRect(ctx, w * 0.44, h * 0.2, w * 0.12, h * 0.12, 3);
      ctx.fill();
    });
    bakeCanvas(scene, 'br-bomb-fuse', 48, 48, function (ctx, w, h) {
      ctx.strokeStyle = '#c9a06a';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.42, h * 0.86);
      ctx.quadraticCurveTo(w * 0.72, h * 0.66, w * 0.62, h * 0.28);
      ctx.stroke();
    });
    bakeCanvas(scene, 'br-fuse-spark', 40, 40, function (ctx, w, h) {
      radialGlow(ctx, w / 2, h / 2, w / 2, '#fff2bd', 1, 0);
      radialGlow(ctx, w / 2, h / 2, w * 0.28, '#ffffff', 1, 0);
    });
    /* countdown ring frames, hand tessellated: Graphics.arc walks the
     * sweep in 0.01 rad steps every frame, a baked frame walks it once. */
    for (var f = 0; f <= 16; f += 1) {
      (function (frame) {
        bakeCanvas(scene, 'br-ring-' + frame, 72, 72, function (ctx, w, h) {
          if (frame <= 0) return;
          var segs = 48;
          var used = Math.round(segs * (frame / 16));
          var r0 = w * 0.36;
          var r1 = w * 0.45;
          var start = -Math.PI / 2;
          var color = frame > 10 ? '#5de5d1' : frame > 5 ? '#ffc45d' : '#ff5f74';
          ctx.beginPath();
          var i;
          for (i = 0; i <= used; i += 1) {
            var a = start + (i / segs) * Math.PI * 2;
            var x = w / 2 + Math.cos(a) * r1;
            var y = h / 2 + Math.sin(a) * r1;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          for (i = used; i >= 0; i -= 1) {
            var b = start + (i / segs) * Math.PI * 2;
            ctx.lineTo(w / 2 + Math.cos(b) * r0, h / 2 + Math.sin(b) * r0);
          }
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }(f));
    }
    bakeCanvas(scene, 'br-blast-core', 96, 96, function (ctx, w, h) {
      radialGlow(ctx, w / 2, h / 2, w * 0.5, '#ff9d4d', 0.7, 0);
      radialGlow(ctx, w / 2, h / 2, w * 0.34, '#ffd98a', 0.9, 0);
      radialGlow(ctx, w / 2, h / 2, w * 0.18, '#fff8e2', 1, 0);
    });
    bakeCanvas(scene, 'br-blast-arm', 96, 96, function (ctx, w, h) {
      var grad = ctx.createLinearGradient(0, h * 0.5 - h * 0.3, 0, h * 0.5 + h * 0.3);
      grad.addColorStop(0, 'rgba(255,200,90,0)');
      grad.addColorStop(0.32, 'rgba(255,214,130,0.85)');
      grad.addColorStop(0.5, 'rgba(255,250,225,0.98)');
      grad.addColorStop(0.68, 'rgba(255,214,130,0.85)');
      grad.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, h * 0.16, w, h * 0.68);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(0, h * 0.46, w, h * 0.08);
    });
    bakeCanvas(scene, 'br-blast-cap', 96, 96, function (ctx, w, h) {
      /* tapered flame tip: a hard triangle reads as a direction arrow */
      var slices = 22;
      for (var i = 0; i < slices; i += 1) {
        var t = i / slices;
        var x = t * w;
        var spread = (1 - t) * h * 0.34;
        var a = (1 - t) * (1 - t) * 0.9;
        var grad = ctx.createLinearGradient(0, h * 0.5 - spread, 0, h * 0.5 + spread);
        grad.addColorStop(0, 'rgba(255,196,88,0)');
        grad.addColorStop(0.4, 'rgba(255,226,150,' + (a * 0.8).toFixed(3) + ')');
        grad.addColorStop(0.5, 'rgba(255,250,228,' + a.toFixed(3) + ')');
        grad.addColorStop(0.6, 'rgba(255,226,150,' + (a * 0.8).toFixed(3) + ')');
        grad.addColorStop(1, 'rgba(255,196,88,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, h * 0.5 - spread, w / slices + 1, spread * 2);
      }
    });
    bakeCanvas(scene, 'br-shock', 160, 160, function (ctx, w, h) {
      var grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.5);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.72, 'rgba(255,236,190,0.55)');
      grad.addColorStop(0.86, 'rgba(255,255,255,0.85)');
      grad.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
      ctx.fill();
    });
    bakeCanvas(scene, 'br-shadow', 64, 40, function (ctx, w, h) {
      var grad = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(0,0,0,0.46)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    bakeCanvas(scene, 'br-hazard', 64, 64, function (ctx, w, h) {
      ctx.fillStyle = 'rgba(255,113,135,0.2)';
      roundRect(ctx, 4, 4, w - 8, h - 8, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,150,120,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,190,110,0.9)';
      polyPath(ctx, [[w / 2, 14], [w - 14, h - 14], [14, h - 14]]);
      ctx.fill();
      ctx.fillStyle = '#2a1014';
      ctx.fillRect(w / 2 - 2, 24, 4, 14);
      ctx.fillRect(w / 2 - 2, 42, 4, 4);
    });
    bakeCanvas(scene, 'br-warn', 64, 64, function (ctx, w, h) {
      ctx.strokeStyle = 'rgba(255,110,90,0.95)';
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 5]);
      roundRect(ctx, 5, 5, w - 10, h - 10, 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,110,90,0.18)';
      ctx.fill();
    });
    bakeCanvas(scene, 'br-crate', 64, 64, function (ctx, w, h) {
      bevelPanel(ctx, 5, 5, w - 10, h - 10, 7, '#8a6a3f', '#4a3620', '#ffd79c', 0.6);
      ctx.strokeStyle = 'rgba(255,215,156,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(9, 9); ctx.lineTo(w - 9, h - 9);
      ctx.moveTo(w - 9, 9); ctx.lineTo(9, h - 9);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(12, 12, w - 24, h - 24);
    });
    bakeCanvas(scene, 'br-p-spark', 24, 24, function (ctx, w, h) {
      radialGlow(ctx, w / 2, h / 2, w / 2, '#ffffff', 1, 0);
    });
    bakeCanvas(scene, 'br-p-smoke', 48, 48, function (ctx, w, h) {
      var grad = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.24)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); ctx.fill();
    });
    bakeCanvas(scene, 'br-p-chunk', 24, 24, function (ctx, w, h) {
      polyPath(ctx, [[3, 6], [17, 2], [22, 14], [12, 22], [2, 16]]);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    bakeCanvas(scene, 'br-p-shard', 24, 24, function (ctx, w, h) {
      polyPath(ctx, [[12, 0], [20, 12], [12, 24], [4, 12]]);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    });
    bakeCanvas(scene, 'br-glow', 96, 96, function (ctx, w, h) {
      radialGlow(ctx, w / 2, h / 2, w / 2, '#ffffff', 0.55, 0);
    });
  }

  function bakeDrops(scene) {
    DROP_TYPES.forEach(function (type) {
      var color = intToHex(DROP_COLORS[type] || 0x5de5d1);
      bakeCanvas(scene, 'br-drop-' + type, 72, 72, function (ctx, w, h) {
        radialGlow(ctx, w / 2, h / 2, w * 0.48, color, 0.5, 0);
        polyPath(ctx, [[w / 2, h * 0.14], [w * 0.86, h / 2], [w / 2, h * 0.86], [w * 0.14, h / 2]]);
        var grad = ctx.createLinearGradient(0, h * 0.14, 0, h * 0.86);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.35, color);
        grad.addColorStop(1, 'rgba(6,16,24,0.92)');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(6,18,26,0.9)';
        ctx.font = 'bold ' + Math.round(w * 0.3) + 'px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(DROP_GLYPH[type] || '?', w / 2, h * 0.54);
      });
    });
  }

  function bakeBackdrop(scene, key, colors) {
    /* 512x1024 logical, baked at device scale. Deep gradient, three
     * coloured light pools, a star dust field and a full dither pass so
     * the sky never bands. */
    bakeCanvas(scene, key, 512, 1024, function (ctx, w, h) {
      var grad = ctx.createLinearGradient(0, 0, w * 0.35, h);
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(0.42, colors[1]);
      grad.addColorStop(0.78, colors[2]);
      grad.addColorStop(1, colors[3]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      radialGlow(ctx, w * 0.18, h * 0.16, w * 0.72, colors[4], 0.3, 0);
      radialGlow(ctx, w * 0.88, h * 0.46, w * 0.66, colors[5], 0.22, 0);
      radialGlow(ctx, w * 0.34, h * 0.9, w * 0.8, colors[6], 0.24, 0);
      var rng = seeded(0x9E3B ^ key.length);
      for (var i = 0; i < 260; i += 1) {
        var x = rng() * w;
        var y = rng() * h;
        var r = 0.5 + rng() * 1.9;
        ctx.fillStyle = 'rgba(' + (170 + Math.floor(rng() * 85)) + ',' + (200 + Math.floor(rng() * 55)) + ',' + (210 + Math.floor(rng() * 45)) + ',' + (0.08 + rng() * 0.4).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (var s = 0; s < 26; s += 1) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.012 + rng() * 0.022).toFixed(3) + ')';
        ctx.lineWidth = 1 + rng() * 2;
        ctx.beginPath();
        ctx.moveTo(rng() * w, rng() * h);
        ctx.lineTo(rng() * w, rng() * h);
        ctx.stroke();
      }
      grainPixels(ctx, w, h, 9);
    });
  }

  function bakeChrome(scene) {
    bakeBackdrop(scene, 'br-sky-title', ['#0d3a44', '#0a2530', '#08151f', '#04090f', '#5de5d1', '#ffc45d', '#6d58ad']);
    bakeBackdrop(scene, 'br-sky-play', ['#0a2c36', '#081d27', '#061219', '#03080d', '#4ee5cc', '#2b6f8f', '#c6a1ff']);
    bakeCanvas(scene, 'br-hud-plate', 256, 96, function (ctx, w, h) {
      var grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(16,44,54,0.92)');
      grad.addColorStop(1, 'rgba(8,22,30,0.86)');
      roundRect(ctx, 2, 2, w - 4, h - 4, 16);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(93,229,209,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(93,229,209,0.18)';
      ctx.fillRect(16, h - 12, w - 32, 2);
    });
    bakeCanvas(scene, 'br-card', 320, 240, function (ctx, w, h) {
      var grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(19,54,64,0.98)');
      grad.addColorStop(1, 'rgba(8,22,30,0.98)');
      roundRect(ctx, 3, 3, w - 6, h - 6, 22);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(93,229,209,0.5)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      roundRect(ctx, 12, 12, w - 24, h - 24, 16);
      ctx.stroke();
      radialGlow(ctx, w * 0.5, h * 0.1, w * 0.6, '#5de5d1', 0.12, 0);
      grainRects(ctx, w, h, 1800, 0.05, seeded(0x2C7));
    });
    bakeCanvas(scene, 'br-title-mark', 320, 200, function (ctx, w, h) {
      radialGlow(ctx, w / 2, h / 2, w * 0.5, '#5de5d1', 0.3, 0);
      ctx.strokeStyle = 'rgba(93,229,209,0.45)';
      ctx.lineWidth = 2;
      for (var r = 1; r <= 3; r += 1) {
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, r * 26, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,196,93,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 96, h / 2); ctx.lineTo(w / 2 + 96, h / 2);
      ctx.moveTo(w / 2, h / 2 - 72); ctx.lineTo(w / 2, h / 2 + 72);
      ctx.stroke();
    });
    bakeCanvas(scene, 'br-medal-gold', 96, 96, function (ctx, w, h) { medalArt(ctx, w, h, '#ffe89a', '#c78d24'); });
    bakeCanvas(scene, 'br-medal-silver', 96, 96, function (ctx, w, h) { medalArt(ctx, w, h, '#eaf3ff', '#8fa2b8'); });
    bakeCanvas(scene, 'br-medal-bronze', 96, 96, function (ctx, w, h) { medalArt(ctx, w, h, '#ffd0a3', '#a8642f'); });
  }

  function medalArt(ctx, w, h, light, dark) {
    radialGlow(ctx, w / 2, h / 2, w * 0.5, light, 0.45, 0);
    var grad = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.85);
    grad.addColorStop(0, light);
    grad.addColorStop(1, dark);
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.52, w * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(10,20,26,0.55)';
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.52, w * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = light;
    polyPath(ctx, [[w / 2, h * 0.4], [w * 0.56, h * 0.52], [w / 2, h * 0.64], [w * 0.44, h * 0.52]]);
    ctx.fill();
  }

  function bakeAll(scene, onProgress) {
    var themeKeys = Object.keys(THEMES);
    var total = themeKeys.length + Object.keys(PERSONALITIES).length + 4;
    var done = 0;
    function tick() { done += 1; if (onProgress) onProgress(clamp(done / total, 0, 1)); }
    themeKeys.forEach(function (key) { bakeBlocks(scene, THEMES[key]); tick(); });
    Object.keys(PERSONALITIES).forEach(function (key) {
      var personality = PERSONALITIES[key];
      ['idle', 'hunt', 'alert', 'hurt'].forEach(function (state) { bakeChaser(scene, personality, state); });
      tick();
    });
    ['idle', 'move', 'plant', 'hit'].forEach(function (state) { bakePlayer(scene, state); });
    tick();
    bakeProps(scene); tick();
    bakeDrops(scene); tick();
    bakeChrome(scene); tick();
  }

  /* ------------------------------------------------------- view helpers */
  function viewW() { return Game.phaser ? Game.phaser.scale.width / DPR : window.innerWidth; }
  function viewH() { return Game.phaser ? Game.phaser.scale.height / DPR : window.innerHeight; }

  function addText(scene, x, y, content, style) {
    var merged = { fontFamily: 'Arial, sans-serif', resolution: DPR };
    Object.keys(style || {}).forEach(function (k) { merged[k] = style[k]; });
    return scene.add.text(x, y, content, merged);
  }

  function fitCamera(scene) {
    var cam = scene.cameras.main;
    cam.setZoom(DPR);
    cam.centerOn(viewW() / 2, viewH() / 2);
  }

  function makeCurtain(scene) {
    var curtain = scene.add.graphics().setDepth(999).setScrollFactor(0);
    curtain.paint = function (alpha) {
      curtain.clear();
      if (alpha <= 0) { curtain.setVisible(false); return; }
      curtain.setVisible(true);
      var w = viewW();
      var h = viewH();
      curtain.fillStyle(0x03080d, alpha);
      curtain.fillRect(-4, -4, w + 8, h + 8);
      curtain.fillStyle(0x5de5d1, alpha * 0.16);
      curtain.fillRect(-4, h * (1 - alpha) - 2, w + 8, 3);
    };
    curtain.state = { value: 1 };
    curtain.paint(1);
    return curtain;
  }

  function curtainIn(scene) {
    if (!scene.curtain) return;
    var duration = kit.juice.enabled ? 320 : 140;
    scene.tweens.add({
      targets: scene.curtain.state, value: 0, duration: duration, ease: 'Cubic.easeOut',
      onUpdate: function () { scene.curtain.paint(scene.curtain.state.value); },
      onComplete: function () { scene.curtain.paint(0); }
    });
  }

  function curtainOut(scene, done) {
    if (!scene.curtain) { done(); return; }
    var duration = kit.juice.enabled ? 240 : 100;
    scene.tweens.add({
      targets: scene.curtain.state, value: 1, duration: duration, ease: 'Cubic.easeIn',
      onUpdate: function () { scene.curtain.paint(scene.curtain.state.value); },
      onComplete: done
    });
  }

  function makeButton(scene, label, callback, opts) {
    var options = opts || {};
    var container = scene.add.container(0, 0);
    var background = scene.add.graphics();
    var text = addText(scene, 0, 0, label, {
      fontSize: options.fontSize || '14px', fontStyle: 'bold',
      color: options.textColor || '#07131b', align: 'center', letterSpacing: 1
    }).setOrigin(0.5);
    /* plate first, labels after: pooled and equal-depth UI renders in
     * creation order, so a row's plate can never be added after its own
     * labels. */
    container.add(background);
    container.add(text);
    container.buttonText = text;
    container.buttonBackground = background;
    container.buttonWidth = options.width || 150;
    container.buttonHeight = options.height || 48;
    container.buttonHitWidth = Math.max(48, options.hitWidth || container.buttonWidth);
    container.buttonHitHeight = Math.max(48, options.hitHeight || container.buttonHeight);
    container.buttonEnabled = true;
    container.buttonFill = options.fill == null ? 0x5de5d1 : options.fill;
    container.layout = function (x, y, width, height) {
      container.setPosition(x, y);
      container.buttonWidth = width || container.buttonWidth;
      container.buttonHeight = height || container.buttonHeight;
      container.buttonHitWidth = Math.max(48, container.buttonWidth);
      container.buttonHitHeight = Math.max(48, container.buttonHeight);
      var w = container.buttonWidth;
      var h = container.buttonHeight;
      var r = options.radius == null ? 14 : options.radius;
      var fill = container.buttonFill;
      var light = PhaserRef.Display.Color.IntegerToColor(fill).brighten(28).color;
      var dark = PhaserRef.Display.Color.IntegerToColor(fill).darken(34).color;
      background.clear();
      background.fillStyle(0x000000, 0.35);
      background.fillRoundedRect(-w / 2, -h / 2 + 3, w, h, r);
      background.fillGradientStyle(light, light, fill, dark, options.alpha == null ? 1 : options.alpha);
      background.fillRoundedRect(-w / 2, -h / 2, w, h, r);
      background.fillStyle(0xffffff, 0.14);
      background.fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.38, r * 0.7);
      background.lineStyle(1.5, options.stroke == null ? light : options.stroke, 0.85);
      background.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
      container.setSize(container.buttonHitWidth, container.buttonHitHeight);
      container.setInteractive(new PhaserRef.Geom.Rectangle(-container.buttonHitWidth / 2, -container.buttonHitHeight / 2, container.buttonHitWidth, container.buttonHitHeight), PhaserRef.Geom.Rectangle.Contains);
      container.input.enabled = container.buttonEnabled;
      return container;
    };
    container.setEnabled = function (enabled) {
      container.buttonEnabled = !!enabled;
      container.setAlpha(enabled ? 1 : 0.5);
      if (container.input) container.input.enabled = !!enabled;
    };
    container.setFill = function (fill) { container.buttonFill = fill; container.layout(container.x, container.y, container.buttonWidth, container.buttonHeight); };
    container.on('pointerdown', function () {
      if (container.input && container.input.enabled !== false && callback) {
        if (kit.juice.enabled) {
          container.setScale(0.94);
          scene.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 160, ease: 'Back.easeOut' });
        }
        kit.audio.sfx('score_ping', { volume: 0.24, rate: 1.35 });
        callback();
      }
    });
    container.on('pointerover', function () { if (container.input && container.input.enabled !== false) container.setScale(1.03); });
    container.on('pointerout', function () { container.setScale(1); });
    container.setDepth(options.depth || DEPTH.button);
    container.layout(0, 0, container.buttonWidth, container.buttonHeight);
    return container;
  }

  function setButtonVisible(button, visible) {
    if (!button) return;
    button.setVisible(!!visible);
    button.setEnabled(!!visible);
  }

  function makeSpritePool(scene, key, count, depth) {
    var pool = [];
    for (var i = 0; i < count; i += 1) {
      var sprite = scene.add.image(0, 0, key).setVisible(false).setDepth(depth || 2);
      sprite.setOrigin(0.5);
      pool.push(sprite);
    }
    return pool;
  }

  /* ------------------------------------------------------------- boot */
  class BootScene extends PhaserRef.Scene {
    constructor() { super({ key: 'boot' }); }
    preload() {
      kit.loader.show('BLAST RADIUS');
      kit.loader.progress(0.02);
      this.load.on('progress', function (value) { kit.loader.progress(0.02 + value * 0.4); });
    }
    create() {
      this.cameras.main.setBackgroundColor('#061018');
      BR_DEBUG_STATE.phase = 'boot';
      /* BAKE BEFORE YOU BUILD: every texture is finished here, before any
       * scene constructs a sprite that references one. */
      bakeAll(this, function (fraction) { kit.loader.progress(0.42 + fraction * 0.5); });
      this.prewarm();
      kit.loader.progress(1);
      kit.loader.hide();
      this.scene.start('title');
    }
    prewarm() {
      /* Touch every pooled texture once so the first real frame never pays
       * a first-use cost mid-play. */
      var keys = ['br-p-spark', 'br-p-smoke', 'br-p-chunk', 'br-p-shard', 'br-glow',
        'br-blast-core', 'br-blast-arm', 'br-blast-cap', 'br-shock', 'br-shadow',
        'br-bomb-body', 'br-bomb-fuse', 'br-fuse-spark', 'br-hazard', 'br-warn', 'br-crate'];
      var warm = [];
      var i;
      for (i = 0; i < keys.length; i += 1) {
        if (!this.textures.exists(keys[i])) continue;
        warm.push(this.add.image(-400, -400, keys[i]).setAlpha(0.001));
      }
      for (i = 0; i <= 16; i += 1) if (this.textures.exists('br-ring-' + i)) warm.push(this.add.image(-400, -400, 'br-ring-' + i).setAlpha(0.001));
      for (i = 0; i < warm.length; i += 1) warm[i].destroy();
    }
  }

  /* ------------------------------------------------------------ title */
  class TitleScene extends PhaserRef.Scene {
    constructor() { super({ key: 'title' }); }
    create() {
      this.ui = [];
      this.page = Math.min(2, Math.floor((profile.unlocked - 1) / 8));
      BR_DEBUG_STATE.mode = 'title';
      BR_DEBUG_STATE.phase = 'title';
      fitCamera(this);
      this.sky = this.add.image(0, 0, 'br-sky-title').setOrigin(0.5).setDepth(0);
      this.mark = this.add.image(0, 0, 'br-title-mark').setOrigin(0.5).setDepth(1).setAlpha(0.55);
      this.title = addText(this, 0, 0, 'BLAST\nRADIUS', {
        fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '42px',
        fontStyle: 'bold', color: '#e9fbf5', align: 'center', lineSpacing: -8,
        shadow: { offsetX: 0, offsetY: 0, color: '#43e0c9', blur: 20, stroke: true, fill: true }
      }).setOrigin(0.5).setDepth(4);
      this.kicker = addText(this, 0, 0, 'GRID ARENA / BOMB LAYER', {
        fontSize: '14px', fontStyle: 'bold', color: '#8fd8cf', letterSpacing: 2
      }).setOrigin(0.5).setDepth(4);
      this.section = addText(this, 0, 0, '', {
        fontSize: '14px', fontStyle: 'bold', color: '#8ec3c4', letterSpacing: 1.5
      }).setOrigin(0.5).setDepth(4);
      this.progress = addText(this, 0, 0, '', {
        fontSize: '14px', color: '#c4e2d9', align: 'center'
      }).setOrigin(0.5).setDepth(4);
      this.sectorButtons = [];
      this.buildButtons();
      this.curtain = makeCurtain(this);
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', function () { this.scale.off('resize', this.layout, this); }, this);
      this.layout();
      curtainIn(this);
      kit.audio.music('music_base', 900);
    }
    buildButtons() {
      var self = this;
      for (var i = 0; i < 8; i += 1) {
        (function (slot) {
          var button = makeButton(self, '', function () { self.pickSlot(slot); }, {
            width: 158, height: 54, fill: 0x1b3039, textColor: '#07131b', radius: 12, fontSize: '14px'
          });
          self.sectorButtons.push(button);
        }(i));
      }
      this.prevButton = makeButton(this, '<', function () { self.setPage(self.page - 1); }, {
        width: 52, height: 48, fill: 0x17313a, textColor: '#c9ece4', radius: 12, fontSize: '18px'
      });
      this.nextButton = makeButton(this, '>', function () { self.setPage(self.page + 1); }, {
        width: 52, height: 48, fill: 0x17313a, textColor: '#c9ece4', radius: 12, fontSize: '18px'
      });
      this.scoreButton = makeButton(this, 'SCORE ATTACK', function () { self.launch({ mode: 'score-attack', arena: 1 }); }, {
        width: 158, height: 52, fill: 0x5c8dff, textColor: '#07131b', fontSize: '14px'
      });
      this.duelButton = makeButton(this, 'DUEL / 3 BOTS', function () { self.launch({ mode: 'duel', arena: 1 }); }, {
        width: 158, height: 52, fill: 0xff9d4d, textColor: '#1b1006', fontSize: '14px'
      });
      this.settingsButton = makeButton(this, 'SETTINGS', function () { kit.openSettings(); }, {
        width: 132, height: 44, fill: 0x17313a, textColor: '#c9ece4', fontSize: '14px'
      });
      this.ui.push.apply(this.ui, this.sectorButtons);
      this.ui.push(this.prevButton, this.nextButton, this.scoreButton, this.duelButton, this.settingsButton);
    }
    setPage(page) {
      var pages = Math.ceil(CAMPAIGN_LENGTH / 8);
      this.page = clamp(page, 0, pages - 1);
      this.layout();
    }
    pickSlot(slot) {
      var id = this.page * 8 + slot + 1;
      if (id > CAMPAIGN_LENGTH || id > profile.unlocked) return;
      this.launch({ mode: 'campaign', arena: id });
    }
    launch(payload) {
      if (this.leaving) return;
      this.leaving = true;
      kit.input.clearAll();
      Gestures.clear();
      var self = this;
      curtainOut(this, function () { self.scene.start('play', payload); });
    }
    layout() {
      var width = viewW();
      var height = viewH();
      var top = Game.insets.top + 12;
      fitCamera(this);
      this.sky.setPosition(width / 2, height / 2);
      this.sky.setDisplaySize(Math.max(width, height * 0.52), height);
      this.mark.setPosition(width / 2, top + 74);
      this.mark.setDisplaySize(Math.min(width * 0.92, 320), 200);
      this.title.setPosition(width / 2, top + 74);
      this.kicker.setPosition(width / 2, top + 18);
      var pages = Math.ceil(CAMPAIGN_LENGTH / 8);
      setTextIfChanged(this.section, 'CAMPAIGN  ' + (this.page + 1) + ' / ' + pages);
      this.section.setPosition(width / 2, top + 142);
      /* Anchor the mode cluster to the bottom safe area and let the sector
       * grid take the whole band between, so tall phones do not show a
       * dead strip under the menu. */
      var gap = 8;
      var colW = Math.min(180, (width - 32 - gap) / 2);
      var bottomAnchor = height - Game.insets.bottom - 22;
      var settingsY = bottomAnchor - 22;
      var progressY = settingsY - 40;
      var lowerY = progressY - 42;
      var pagerY = lowerY - 60;
      var gridTop = top + 174;
      var gridSpan = Math.max(4 * 56, pagerY - 30 - gridTop);
      var rowStep = clamp(gridSpan / 4, 56, 86);
      var buttonH = Math.min(60, rowStep - 8);
      var blockHeight = rowStep * 3 + buttonH;
      var gridY = gridTop + Math.max(0, (gridSpan - blockHeight) / 2) + buttonH / 2;
      for (var b = 0; b < this.sectorButtons.length; b += 1) {
        var id = this.page * 8 + b + 1;
        var button = this.sectorButtons[b];
        if (id > CAMPAIGN_LENGTH) { setButtonVisible(button, false); continue; }
        var arena = arenaFor(id);
        var theme = themeFor(arena.theme);
        var unlocked = id <= profile.unlocked;
        var medal = profile.medals[String(id)] || (unlocked ? 'open' : 'locked');
        var modName = arena.mods.length ? modifierFor(arena.mods[0]).name : (arena.boss ? 'BOSS' : 'CLEAN');
        button.buttonFill = unlocked ? theme.accent : 0x1b3039;
        button.buttonText.setColor(unlocked ? '#07131b' : '#b9d6da');
        setTextIfChanged(button.buttonText, 'A' + String(id).padStart(2, '0') + '  ' + medal.toUpperCase() + '\n' + modName);
        button.setVisible(true);
        button.setEnabled(unlocked);
        var col = b % 2;
        var row = Math.floor(b / 2);
        button.layout(width / 2 - colW / 2 - gap / 2 + col * (colW + gap), gridY + row * rowStep, colW, buttonH);
      }
      this.prevButton.layout(width / 2 - colW / 2 - gap / 2, pagerY, 56, 48);
      this.nextButton.layout(width / 2 + colW / 2 + gap / 2, pagerY, 56, 48);
      this.prevButton.setEnabled(this.page > 0);
      this.nextButton.setEnabled(this.page < pages - 1);
      this.scoreButton.layout(width / 2 - colW / 2 - gap / 2, lowerY, colW, 52);
      this.duelButton.layout(width / 2 + colW / 2 + gap / 2, lowerY, colW, 52);
      this.progress.setPosition(width / 2, progressY);
      setTextIfChanged(this.progress, profile.unlocked >= CAMPAIGN_LENGTH
        ? 'ALL 24 SECTORS OPEN  /  BEST ' + profile.bestScore
        : 'NEXT UNLOCK: SECTOR ' + String(profile.unlocked).padStart(2, '0') + '  /  BEST ' + profile.bestScore);
      this.settingsButton.layout(width / 2, settingsY, 132, 44);
      if (this.curtain) this.curtain.paint(this.curtain.state.value);
    }
  }

  /* ------------------------------------------------------------- play */
  class PlayScene extends PhaserRef.Scene {
    constructor() { super({ key: 'play' }); }

    create(runData) {
      Game.play = this;
      this.ui = [];
      this.runData = runData || {};
      this.mode = ['campaign', 'score-attack', 'boss-vault', 'duel'].indexOf(this.runData.mode) >= 0 ? this.runData.mode : 'campaign';
      var forcedArena = getForcedArena(debugValue('forceArena'));
      this.arenaIndex = forcedArena || Math.max(1, Math.min(profile.unlocked, Number(this.runData.arena) || 1));
      if (this.mode === 'boss-vault' && !forcedArena) this.arenaIndex = 6;
      this.score = 0;
      this.lives = this.mode === 'duel' ? 1 : 3;
      this.simClock = 0;
      this.accumulator = 0;
      this.phase = 'playing';
      this.phaseClock = 0;
      this.arenaTime = 0;
      this.timeLeft = this.mode === 'score-attack' ? 90 : 0;
      this.blocksBroken = 0;
      this.pendingDir = null;
      this.heldDir = null;
      this.holdClock = 0;
      this.repeatClock = 0;
      this.keyWasDown = {};
      this.touch = null;
      this.gamepadDir = null;
      this.bombSerial = 1;
      this.blockSerial = 1;
      this.chaserSerial = 1;
      this.dropSerial = 1;
      this.blastSerial = 1;
      this.random = seeded(0xB17A5E);
      this.grid = [];
      this.blocks = [];
      this.blockByKey = new Map();
      this.blockVisuals = new Map();
      this.crates = [];
      this.oneWays = new Map();
      this.hazards = new Map();
      this.danger = new Map();
      this.drops = [];
      this.bombs = [];
      this.blasts = [];
      this.shocks = [];
      this.chasers = [];
      this.compression = null;
      this.quakeClock = 0;
      this.magnetClock = 0;
      this.mods = {};
      this.particleSystems = {};
      for (var n = 0; n < PARTICLE_SYSTEM_NAMES.length; n += 1) {
        this.particleSystems[PARTICLE_SYSTEM_NAMES[n]] = makeParticlePool(PARTICLE_POOL_SIZES[PARTICLE_SYSTEM_NAMES[n]]);
      }
      this.fxOverflow = 0;
      this.player = null;
      this.detonationQueue = [];
      this.chainLevel = 0;
      this.coachStep = profile.tutorialDone || this.mode !== 'campaign' ? 4 : 0;
      this.coachLife = 0;
      this.banner = { text: '', color: 0x5de5d1, life: 0, max: 0, queue: [] };
      this.result = null;
      this.lastFuseSecond = -1;
      this.damagePulse = 0;
      this.celebration = 0;
      this.musicLayer = null;
      this.tutorialDodgeArmed = false;
      this.tutorialDodgeCell = null;
      this.duelRound = 1;
      this.duelScore = [0, 0, 0, 0];
      this.duelNames = ['YOU', 'RED', 'BLUE', 'GOLD'];
      fitCamera(this);
      this.buildDisplay();
      this.bindInput();
      this.curtain = makeCurtain(this);
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', this.teardown, this);
      this.layout();
      this.startArena(this.arenaIndex, true);
      curtainIn(this);
    }

    teardown() {
      this.scale.off('resize', this.layout, this);
      Gestures.onDown = null;
      Gestures.onMove = null;
      Gestures.onUp = null;
      if (Game.play === this) Game.play = null;
    }

    buildDisplay() {
      this.sky = this.add.image(0, 0, 'br-sky-play').setOrigin(0.5).setDepth(0);
      this.boardImage = this.add.image(0, 0, 'br-p-spark').setOrigin(0.5).setDepth(DEPTH.board).setVisible(false);
      this.fxGraphics = this.add.graphics().setDepth(DEPTH.blast - 1);
      this.overlayGraphics = this.add.graphics().setDepth(DEPTH.vignette);
      this.fxGraphics.setBlendMode(PhaserRef.BlendModes.ADD);
      this.hazardSprites = makeSpritePool(this, 'br-hazard', MAX_HAZARD_SPRITES, DEPTH.hazard);
      this.warnSprites = makeSpritePool(this, 'br-warn', MAX_WARN_SPRITES, DEPTH.warn);
      this.blockSprites = makeSpritePool(this, 'br-block-plaza-0', MAX_BLOCK_SPRITES, DEPTH.block);
      this.crateSprites = makeSpritePool(this, 'br-crate', MAX_CRATE_SPRITES, DEPTH.crate);
      this.dropSprites = makeSpritePool(this, 'br-drop-bomb', MAX_DROP_SPRITES, DEPTH.drop);
      this.dropGlows = makeSpritePool(this, 'br-glow', MAX_DROP_SPRITES, DEPTH.drop - 1);
      this.shadowSprites = makeSpritePool(this, 'br-shadow', MAX_CHASER_SPRITES + MAX_BOMB_SPRITES + 2, DEPTH.shadow);
      this.bombSprites = makeSpritePool(this, 'br-bomb-body', MAX_BOMB_SPRITES, DEPTH.bomb);
      this.bombRings = makeSpritePool(this, 'br-ring-16', MAX_BOMB_SPRITES, DEPTH.bomb + 1);
      this.bombSparks = makeSpritePool(this, 'br-fuse-spark', MAX_BOMB_SPRITES, DEPTH.bomb + 2);
      this.chaserSprites = makeSpritePool(this, 'br-bot-drifter-idle', MAX_CHASER_SPRITES, DEPTH.chaser);
      this.blastSprites = makeSpritePool(this, 'br-blast-arm', MAX_BLAST_CELL_SPRITES, DEPTH.blast);
      this.shockSprites = makeSpritePool(this, 'br-shock', MAX_SHOCK_SPRITES, DEPTH.shock);
      this.particleSprites = [];
      var total = 0;
      for (var name in PARTICLE_POOL_SIZES) total += PARTICLE_POOL_SIZES[name];
      for (var i = 0; i < total; i += 1) {
        var sprite = this.add.image(0, 0, 'br-p-spark').setVisible(false).setDepth(DEPTH.particle);
        sprite.setOrigin(0.5);
        this.particleSprites.push(sprite);
      }
      this.playerSprite = this.add.image(0, 0, 'br-hero-idle').setVisible(false).setDepth(DEPTH.player);
      this.playerSprite.setOrigin(0.5);
      this.playerShadow = this.add.image(0, 0, 'br-shadow').setVisible(false).setDepth(DEPTH.player - 1);
      this.playerShield = this.add.image(0, 0, 'br-glow').setVisible(false).setDepth(DEPTH.player + 1);
      this.playerShield.setBlendMode(PhaserRef.BlendModes.ADD);
      this.hudPlate = this.add.image(0, 0, 'br-hud-plate').setOrigin(0.5).setDepth(DEPTH.chrome);
      this.cardImage = this.add.image(0, 0, 'br-card').setOrigin(0.5).setDepth(DEPTH.chrome + 1).setVisible(false);
      this.medalImage = this.add.image(0, 0, 'br-medal-bronze').setOrigin(0.5).setDepth(DEPTH.chrome + 2).setVisible(false);
      this.hudScore = addText(this, 0, 0, '', { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f0fcf6' }).setOrigin(0, 0.5);
      this.hudLoadout = addText(this, 0, 0, '', { fontSize: '14px', fontStyle: 'bold', color: '#a8d2cb', letterSpacing: 0.5 }).setOrigin(0, 0.5);
      this.hudArena = addText(this, 0, 0, '', { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#cfe6e1', align: 'center' }).setOrigin(0.5, 0.5);
      this.hudTimer = addText(this, 0, 0, '', { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '19px', fontStyle: 'bold', color: '#ffc45d', align: 'right' }).setOrigin(1, 0.5);
      this.hudLives = addText(this, 0, 0, '', { fontSize: '15px', fontStyle: 'bold', color: '#ff8f9c', align: 'right' }).setOrigin(1, 0.5);
      this.coachStrip = addText(this, 0, 0, '', { fontSize: '14px', fontStyle: 'bold', color: '#07131b', align: 'center', padding: { left: 8, right: 8, top: 4, bottom: 4 } }).setOrigin(0.5);
      this.bannerText = addText(this, 0, 0, '', { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#07131b', align: 'center' }).setOrigin(0.5);
      this.resultTitle = addText(this, 0, 0, '', { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#edfff6', align: 'center' }).setOrigin(0.5);
      this.resultCopy = addText(this, 0, 0, '', { fontSize: '14px', color: '#c2e0da', align: 'center', lineSpacing: 5 }).setOrigin(0.5);
      [this.hudScore, this.hudLoadout, this.hudArena, this.hudTimer, this.hudLives].forEach(function (object) { object.setDepth(DEPTH.hud); });
      this.coachStrip.setDepth(DEPTH.hud);
      this.bannerText.setDepth(DEPTH.hud);
      this.resultTitle.setDepth(DEPTH.chrome + 3);
      this.resultCopy.setDepth(DEPTH.chrome + 3);
      this.resultTitle.setVisible(false);
      this.resultCopy.setVisible(false);
      var self = this;
      this.actionButtons = [];
      this.actionButtons.push(makeButton(this, 'BOMB', function () { self.placeBomb(); }, { width: 100, height: 52, fill: 0xffc45d, textColor: '#19140a', radius: 22, fontSize: '15px' }));
      this.actionButtons.push(makeButton(this, 'KICK', function () { self.toggleKick(); }, { width: 100, height: 52, fill: 0x2b4550, textColor: '#c9ece4', radius: 22, fontSize: '15px' }));
      this.actionButtons.push(makeButton(this, 'REMOTE', function () { self.remoteDetonate(); }, { width: 100, height: 52, fill: 0x2b4550, textColor: '#c9ece4', radius: 22, fontSize: '15px' }));
      this.continueButton = makeButton(this, 'CONTINUE', function () { self.continueFromResult(); }, { width: 156, height: 48, fill: 0x5de5d1, textColor: '#07131b', fontSize: '14px' });
      this.menuButton = makeButton(this, 'QUIT TO MENU', function () { self.goToMenu(); }, { width: 156, height: 48, fill: 0x17313a, textColor: '#c9ece4', fontSize: '14px' });
      this.settingsButton = makeButton(this, 'II', function () { kit.openSettings(); }, { width: 48, height: 34, fill: 0x17313a, textColor: '#c9ece4', radius: 10, fontSize: '14px' });
      this.ui.push.apply(this.ui, this.actionButtons);
      this.ui.push(this.continueButton, this.menuButton, this.settingsButton);
      setButtonVisible(this.continueButton, false);
      setButtonVisible(this.menuButton, false);
      this.continueButton.setDepth(DEPTH.chrome + 4);
      this.menuButton.setDepth(DEPTH.chrome + 4);
      this.settingsButton.setDepth(DEPTH.hud + 1);
    }

    /* GGKit's pointer map is not authoritative outside live play and the
     * kit deletes an id before a canvas listener sees the release, so the
     * gesture map on window listeners is the authority here. */
    bindInput() {
      var self = this;
      Gestures.onDown = function (record) {
        var point = self.toView(record);
        if (self.isActionBand(point.y) || self.phase !== 'playing') { record.zone = 'ui'; return; }
        record.zone = 'move';
        self.touch = { id: record.id, anchorX: point.x, anchorY: point.y, isDown: true };
      };
      Gestures.onMove = function (record) {
        if (!self.touch || record.id !== self.touch.id || record.zone !== 'move') return;
        var point = self.toView(record);
        var dx = point.x - self.touch.anchorX;
        var dy = point.y - self.touch.anchorY;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
        if (Math.abs(dx) > Math.abs(dy)) self.queueMove(dx > 0 ? DIRS[0] : DIRS[1]);
        else self.queueMove(dy > 0 ? DIRS[2] : DIRS[3]);
        self.touch.anchorX = point.x;
        self.touch.anchorY = point.y;
      };
      Gestures.onUp = function (record) {
        if (self.touch && record.id === self.touch.id) { self.touch.isDown = false; self.touch = null; }
      };
    }

    toView(record) {
      var rect = canvasRect();
      return { x: record.x - rect.left, y: record.y - rect.top };
    }

    isActionBand(y) {
      return y > viewH() - Game.insets.bottom - 78;
    }

    layout() {
      var width = viewW();
      var height = viewH();
      fitCamera(this);
      var top = Game.insets.top + 8;
      var bottom = Game.insets.bottom + 14;
      var boardTop = top + 104;
      var controlsTop = height - bottom - 58;
      var usableBoardHeight = Math.max(ROWS * 16, controlsTop - boardTop - 8);
      var tile = Math.max(16, Math.min((width - 16) / COLS, usableBoardHeight / ROWS));
      this.tile = tile;
      this.boardWidth = tile * COLS;
      this.boardHeight = tile * ROWS;
      this.boardX = (width - this.boardWidth) / 2;
      /* centre the board in the free band: pinning it to the top left a
       * dead strip above the thumb controls on tall phones */
      this.boardY = boardTop + Math.max(0, (usableBoardHeight - this.boardHeight) * 0.42);
      this.actionY = height - bottom - 28;
      this.sky.setPosition(width / 2, height / 2);
      this.sky.setDisplaySize(Math.max(width, height * 0.52), height);
      this.boardImage.setPosition(this.boardX + this.boardWidth / 2, this.boardY + this.boardHeight / 2);
      this.boardImage.setDisplaySize(this.boardWidth, this.boardHeight);
      this.hudPlate.setPosition(width / 2, top + 34);
      this.hudPlate.setDisplaySize(width - 16, 76);
      this.hudScore.setPosition(20, top + 20);
      this.hudLoadout.setPosition(20, top + 46);
      this.hudArena.setPosition(width / 2, top + 18);
      this.hudTimer.setPosition(width - 20, top + 18);
      this.hudLives.setPosition(width - 20, top + 46);
      this.coachStrip.setPosition(width / 2, top + 86);
      var buttonGap = 8;
      var buttonW = Math.min(104, (width - 48) / 3);
      var firstX = width / 2 - buttonW - buttonGap;
      for (var b = 0; b < this.actionButtons.length; b += 1) this.actionButtons[b].layout(firstX + b * (buttonW + buttonGap), this.actionY, buttonW, 52);
      this.settingsButton.layout(width / 2, top + 46, 48, 34);
      var cardY = this.boardY + this.boardHeight * 0.5;
      this.cardImage.setPosition(width / 2, cardY);
      this.cardImage.setDisplaySize(Math.min(width - 36, 320), 236);
      this.medalImage.setPosition(width / 2, cardY - 72);
      this.medalImage.setDisplaySize(72, 72);
      this.resultTitle.setPosition(width / 2, cardY - 18);
      this.resultCopy.setPosition(width / 2, cardY + 26);
      this.continueButton.layout(width / 2, Math.min(height - bottom - 96, cardY + 84), Math.min(156, width - 60), 48);
      this.menuButton.layout(width / 2, Math.min(height - bottom - 44, cardY + 140), Math.min(156, width - 60), 48);
      if (this.curtain) this.curtain.paint(this.curtain.state.value);
    }

    /* ---------------------------------------------------- arena setup */
    activeMods() { return this.mods || {}; }

    startArena(index, announce) {
      var forced = getForcedArena(debugValue('forceArena'));
      if (forced) index = forced;
      var arena = arenaFor(index);
      var theme = themeFor(arena.theme);
      var carryLoadout = (this.mode === 'score-attack' || this.mode === 'duel') && this.player ? {
        radius: this.player.radius, bombsMax: this.player.bombsMax, speedLevel: this.player.speedLevel,
        kick: this.player.kick, remote: this.player.remote, pierce: this.player.pierce, shield: this.player.shield
      } : null;
      this.arenaIndex = arena.id;
      this.arenaConfig = arena;
      this.theme = theme;
      this.family = theme;
      this.mods = {};
      var modList = this.mode === 'duel' ? ['crush'] : (arena.mods || []);
      for (var m = 0; m < modList.length; m += 1) this.mods[modifierFor(modList[m]).key] = true;
      this.random = seeded((0xB17A5E + arena.id * 0x9E3779B9 + (this.mode === 'score-attack' ? 0x5000 : 0) + (this.mode === 'duel' ? this.duelRound * 0x77 : 0)) >>> 0);
      this.grid = Array.from({ length: ROWS }, function () { return Array.from({ length: COLS }, function () { return { kind: 'floor', blockId: 0 }; }); });
      this.blocks = [];
      this.blocksBroken = 0;
      this.blockByKey.clear();
      this.blockVisuals.clear();
      this.crates = [];
      this.oneWays.clear();
      this.hazards.clear();
      this.danger.clear();
      this.drops = [];
      this.bombs = [];
      this.blasts = [];
      this.shocks = [];
      this.chasers = [];
      this.detonationQueue = [];
      this.chainLevel = 0;
      this.arenaTime = 0;
      this.quakeClock = 8;
      this.magnetClock = 1.5;
      this.tutorialDodgeArmed = false;
      this.tutorialDodgeCell = null;
      this.walls = [];
      this.buildLayout(theme, arena.id);
      this.player = {
        x: 1, y: 1, fromX: 1, fromY: 1, toX: 1, toY: 1, moveT: 1,
        moveDuration: 0.12, radius: 2, bombsMax: 1, speedLevel: 0,
        kick: false, remote: false, pierce: 0, shield: 0, invuln: 0, hitTimer: 0,
        plantTimer: 0, animState: 'idle', coachMovePending: false, lastDir: DIRS[0], bob: 0
      };
      if (carryLoadout) Object.assign(this.player, carryLoadout);
      if (this.mode === 'duel') {
        this.player.bombsMax = Math.max(2, this.player.bombsMax);
        this.player.radius = Math.max(2, this.player.radius);
        this.player.kick = true;
      }
      this.spawnChasers(arena, theme);
      this.compression = {
        armed: false,
        at: (arena.suddenAt || 80) * (this.mods.crush ? 0.55 : 1) * (this.mode === 'duel' ? 0.5 : 1),
        clock: 0, interval: 1.35, index: 0, path: this.compressionPath(), warned: null
      };
      this.bakeArenaBoard();
      this.phase = 'playing';
      this.phaseClock = 0;
      this.result = null;
      this.celebration = 0;
      this.cardImage.setVisible(false);
      this.medalImage.setVisible(false);
      this.resultTitle.setVisible(false);
      this.resultCopy.setVisible(false);
      setButtonVisible(this.continueButton, false);
      setButtonVisible(this.menuButton, false);
      for (var i = 0; i < this.actionButtons.length; i += 1) setButtonVisible(this.actionButtons[i], true);
      this.updateCoach();
      if (announce) {
        var label = this.mode === 'score-attack' ? 'SCORE ATTACK'
          : this.mode === 'duel' ? ('ROUND ' + this.duelRound)
            : ('A' + String(arena.id).padStart(2, '0') + ' ' + arena.title);
        this.showBanner(label, theme.accent, 1);
        if (modList.length) this.showBanner(modifierFor(modList[0]).name, modifierFor(modList[0]).color, 0.9);
      }
      this.updateMusicLayer();
      this.updateActionLabels();
      this.refreshDebug();
    }

    bakeArenaBoard() {
      bakeBoard(this, 'br-board-live', this.theme, this.grid, this.oneWays);
      this.boardImage.setTexture('br-board-live');
      this.boardImage.setVisible(true);
      this.boardImage.setPosition(this.boardX + this.boardWidth / 2, this.boardY + this.boardHeight / 2);
      this.boardImage.setDisplaySize(this.boardWidth, this.boardHeight);
    }

    compressionPath() {
      var path = [];
      var left = 1;
      var right = COLS - 2;
      var top = 1;
      var bottom = ROWS - 2;
      while (left <= right && top <= bottom) {
        var x;
        var y;
        for (x = left; x <= right; x += 1) path.push({ x: x, y: top });
        for (y = top + 1; y <= bottom; y += 1) path.push({ x: right, y: y });
        if (top < bottom) for (x = right - 1; x >= left; x -= 1) path.push({ x: x, y: bottom });
        if (left < right) for (y = bottom - 1; y > top; y -= 1) path.push({ x: left, y: y });
        left += 1; right -= 1; top += 1; bottom -= 1;
      }
      return path;
    }

    buildLayout(theme, arenaId) {
      var self = this;
      function forget(x, y) {
        if (self.grid[y][x].kind === 'block') {
          var oldBlock = self.blockByKey.get(keyOf(x, y));
          if (oldBlock) oldBlock.alive = false;
          self.blockByKey.delete(keyOf(x, y));
        }
      }
      function hard(x, y) {
        if (!self.inBounds(x, y)) return;
        forget(x, y);
        self.grid[y][x] = { kind: 'hard', blockId: 0 };
      }
      function clearCell(x, y) {
        if (!self.inBounds(x, y)) return;
        forget(x, y);
        self.grid[y][x] = { kind: 'floor', blockId: 0 };
      }
      function block(x, y) {
        if (!self.inBounds(x, y) || (x === 1 && y === 1) || (x <= 1 && y <= 2) || (x === 2 && y === 1)) return;
        var cell = self.grid[y][x];
        if (cell.kind !== 'floor') return;
        var dropRoll = self.random();
        if (self.mods.scarce) dropRoll = dropRoll * 0.5 + 0.5;
        var dropType = null;
        if (dropRoll < 0.08) dropType = 'bomb';
        else if (dropRoll < 0.17) dropType = 'radius';
        else if (dropRoll < 0.25) dropType = 'boots';
        else if (dropRoll < 0.33) dropType = 'shield';
        else if (dropRoll < 0.42) dropType = 'points';
        else if (dropRoll < 0.47) dropType = 'life';
        else if (dropRoll < 0.55) dropType = 'kick';
        else if (dropRoll < 0.62) dropType = 'remote';
        else if (dropRoll < 0.68) dropType = 'pierce';
        var item = {
          id: self.blockSerial++, x: x, y: y, state: 0, timer: 0, dropType: dropType,
          alive: true, armor: self.mods.armored ? 1 : 0
        };
        self.blocks.push(item);
        self.blockByKey.set(keyOf(x, y), item);
        self.grid[y][x] = { kind: 'block', blockId: item.id };
        self.blockVisuals.set(item.id, { flash: 0, wobble: 0 });
      }
      function oneWay(x, y, dx, dy) {
        if (!self.inBounds(x, y) || self.grid[y][x].kind !== 'floor') return;
        self.grid[y][x] = { kind: 'oneway', blockId: 0 };
        self.oneWays.set(keyOf(x, y), { dx: dx, dy: dy });
      }
      function hazard(x, y) {
        if (!self.inBounds(x, y) || self.grid[y][x].kind !== 'floor') return;
        self.grid[y][x] = { kind: 'hazard', blockId: 0 };
        self.hazards.set(keyOf(x, y), { phase: self.random() * 4, life: Infinity });
      }
      var y;
      var x;
      for (y = 0; y < ROWS; y += 1) {
        for (x = 0; x < COLS; x += 1) {
          if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) hard(x, y);
          else if (x % 2 === 0 && y % 2 === 0 && theme.key !== 'plaza') hard(x, y);
        }
      }
      var density = this.mode === 'duel' ? 0.34 : clamp((this.arenaConfig && this.arenaConfig.density) || theme.density, 0.22, 0.66);
      for (y = 1; y < ROWS - 1; y += 1) {
        for (x = 1; x < COLS - 1; x += 1) {
          if (self.grid[y][x].kind !== 'floor') continue;
          var safeLane = (x <= 2 && y <= 3) || y === 1 || x === 1 ||
            (this.mode === 'duel' && ((x >= COLS - 3 && y <= 2) || (x <= 2 && y >= ROWS - 3) || (x >= COLS - 3 && y >= ROWS - 3)));
          var laneBias = theme.key === 'warren' && (x === 3 || y === 5) ? 0.14 : 0;
          if (!safeLane && self.random() < density + laneBias) block(x, y);
        }
      }
      clearCell(1, 1); clearCell(2, 1); clearCell(1, 2); clearCell(3, 1); clearCell(1, 3);
      if (theme.key === 'plaza') {
        for (var px = 3; px <= 7; px += 1) { clearCell(px, 5); clearCell(px, 7); }
        for (var c = 0; c < 5; c += 1) {
          var cx = 4 + (c % 2) * 3;
          var cy = 4 + Math.floor(c / 2) * 3;
          if (self.grid[cy][cx].kind === 'floor') self.crates.push({ id: c + 1, x: cx, y: cy, homeX: cx, homeY: cy });
        }
        for (var sy = 2; sy < ROWS - 2; sy += 1) clearCell(2, sy);
        oneWay(2, 6, 1, 0); oneWay(2, 7, 1, 0);
      } else if (theme.key === 'warren') {
        for (var wx = 2; wx < COLS - 2; wx += 2) { hard(wx, 3); hard(wx, 9); }
        for (var wy = 4; wy < ROWS - 3; wy += 2) { hard(3, wy); hard(7, wy); }
        clearCell(5, 3); clearCell(5, 9); clearCell(5, 5); clearCell(5, 7);
        oneWay(5, 3, 0, 1); oneWay(5, 9, 0, -1); oneWay(5, 6, 1, 0);
      } else if (theme.key === 'vault') {
        for (var vx = 3; vx <= 7; vx += 1) { hard(vx, 4); hard(vx, 8); }
        for (var vy = 5; vy <= 7; vy += 1) { hard(3, vy); hard(7, vy); }
        clearCell(5, 4); clearCell(5, 8); clearCell(3, 6); clearCell(7, 6); clearCell(5, 6);
        hazard(4, 5); hazard(6, 5); hazard(4, 7); hazard(6, 7);
        oneWay(5, 4, 0, 1); oneWay(5, 8, 0, -1);
      } else if (theme.key === 'nest') {
        for (var nx = 2; nx <= 8; nx += 3) { hard(nx, 4); hard(nx, 8); }
        for (var ny = 4; ny <= 8; ny += 4) clearCell(5, ny);
        hazard(3, 3); hazard(7, 3); hazard(3, 9); hazard(7, 9);
        oneWay(9, 6, -1, 0); oneWay(8, 6, -1, 0);
      } else if (theme.key === 'circuit') {
        for (var rx = 3; rx <= 7; rx += 2) { hard(rx, 3); hard(rx, 9); }
        for (var ry = 4; ry <= 8; ry += 2) { hard(2, ry); hard(8, ry); }
        clearCell(5, 6); clearCell(5, 5); clearCell(5, 7);
        oneWay(4, 6, 1, 0); oneWay(6, 6, 1, 0);
        hazard(2, 6); hazard(8, 6);
      } else if (theme.key === 'foundry') {
        for (var fx = 2; fx <= 8; fx += 2) hard(fx, 6);
        for (var fy = 3; fy <= 9; fy += 3) { hard(3, fy); hard(7, fy); }
        clearCell(5, 6); clearCell(4, 6); clearCell(6, 6);
        hazard(5, 4); hazard(5, 8); hazard(1, 6); hazard(9, 6);
        oneWay(5, 5, 0, 1);
      } else {
        for (var bx = 3; bx <= 7; bx += 2) { hard(bx, 5); hard(bx, 7); }
        for (var by = 4; by <= 8; by += 2) { hard(3, by); hard(7, by); }
        clearCell(5, 5); clearCell(5, 7); clearCell(3, 6); clearCell(7, 6); clearCell(5, 6);
        hazard(4, 5); hazard(6, 5); hazard(4, 7); hazard(6, 7);
        oneWay(5, 9, 0, -1); oneWay(6, 9, 0, -1);
      }
      var safety = [[1, 1], [2, 1], [1, 2], [3, 1], [1, 3]];
      for (var si = 0; si < safety.length; si += 1) clearCell(safety[si][0], safety[si][1]);
      if (this.mode === 'duel') {
        var corners = [[COLS - 2, 1], [1, ROWS - 2], [COLS - 2, ROWS - 2]];
        for (var ci = 0; ci < corners.length; ci += 1) {
          clearCell(corners[ci][0], corners[ci][1]);
          clearCell(corners[ci][0] - 1, corners[ci][1]);
          clearCell(corners[ci][0], corners[ci][1] - 1);
        }
      }
    }

    spawnChasers(arena, theme) {
      var roster = this.mode === 'duel' ? ['duelist', 'duelist', 'duelist'] : (arena.roster || ['drifter']);
      var count = this.mode === 'duel' ? 3 : arena.count;
      if (this.mode === 'score-attack') count = Math.min(7, count + Math.floor(this.arenaIndex / 4));
      if (this.mods.swarm) count += 2;
      var forced = forcedPersonality(debugValue('forceChaserTier'));
      this.chaserTier = forced || roster[0] || 'drifter';
      var spots;
      if (this.mode === 'duel') {
        spots = [{ x: COLS - 2, y: 1 }, { x: 1, y: ROWS - 2 }, { x: COLS - 2, y: ROWS - 2 }];
      } else {
        spots = [];
        var candidates = [];
        for (var y = 1; y < ROWS - 1; y += 1) {
          for (var x = 1; x < COLS - 1; x += 1) {
            if (this.isWalkable(x, y, false) && Math.abs(x - 1) + Math.abs(y - 1) > 7 && !this.hazards.has(keyOf(x, y))) candidates.push({ x: x, y: y });
          }
        }
        for (var s = 0; s < count && candidates.length; s += 1) {
          spots.push(candidates.splice(Math.floor(this.random() * candidates.length), 1)[0]);
        }
      }
      for (var i = 0; i < Math.min(count, spots.length, MAX_CHASER_SPRITES); i += 1) {
        var spot = spots[i];
        var isBoss = !!arena.boss && this.mode !== 'duel' && i === 0;
        var key = forced || (isBoss ? 'overlord' : roster[i % roster.length]);
        var personality = personalityFor(key);
        this.chasers.push({
          id: this.chaserSerial++, seat: i + 1, x: spot.x, y: spot.y, fromX: spot.x, fromY: spot.y,
          toX: spot.x, toY: spot.y, moveT: 1, cooldown: 0.35 + this.random() * 0.3,
          type: personality.key, personality: personality, state: 'idle', stun: 0,
          hp: personality.hp, alive: true, dir: DIRS[i % DIRS.length], phase: this.random() * 4, fleeUntil: 0,
          homeX: spot.x, homeY: spot.y, bombCool: 1.2 + this.random(), fleeing: false, deathLife: 0,
          radius: this.mode === 'duel' ? 2 : 1, speedLevel: 0
        });
      }
    }

    /* -------------------------------------------------------- geometry */
    inBounds(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }

    cellAt(x, y) { return this.inBounds(x, y) ? this.grid[y][x] : { kind: 'hard', blockId: 0 }; }

    crateAt(x, y) {
      for (var i = 0; i < this.crates.length; i += 1) if (this.crates[i].x === x && this.crates[i].y === y) return this.crates[i];
      return null;
    }

    bombAt(x, y) {
      for (var i = 0; i < this.bombs.length; i += 1) {
        var bomb = this.bombs[i];
        if (!bomb.exploded && bomb.x === x && bomb.y === y) return bomb;
      }
      return null;
    }

    chaserAt(x, y, except) {
      for (var i = 0; i < this.chasers.length; i += 1) {
        var chaser = this.chasers[i];
        if (chaser !== except && chaser.alive && chaser.x === x && chaser.y === y && chaser.moveT >= 1) return chaser;
      }
      return null;
    }

    isWalkable(x, y, includeBombs) {
      if (!this.inBounds(x, y)) return false;
      var kind = this.grid[y][x].kind;
      if (kind === 'hard' || kind === 'block') return false;
      if (this.crateAt(x, y)) return false;
      if (includeBombs && this.bombAt(x, y)) return false;
      return true;
    }

    canEnter(x, y, dir, includeBombs) {
      if (!this.isWalkable(x, y, includeBombs)) return false;
      var oneWay = this.oneWays.get(keyOf(x, y));
      if (oneWay && (!dir || oneWay.dx !== dir.dx || oneWay.dy !== dir.dy)) return false;
      return true;
    }

    dangerAt(x, y) {
      var value = this.danger.get(keyOf(x, y));
      return value == null ? Infinity : value;
    }

    /* Danger map: every live bomb paints its projected cross with the time
     * left on its fuse. Bots read it to flee, to refuse a step, and to pick
     * a bombing spot they can still escape. */
    rebuildDanger() {
      this.danger.clear();
      for (var i = 0; i < this.bombs.length; i += 1) {
        var bomb = this.bombs[i];
        if (bomb.exploded) continue;
        var fuse = Math.max(0, bomb.fuse);
        this.paintDanger(bomb.x, bomb.y, fuse);
        for (var d = 0; d < DIRS.length; d += 1) {
          var dir = DIRS[d];
          var pierced = 0;
          for (var step = 1; step <= bomb.radius; step += 1) {
            var nx = bomb.x + dir.dx * step;
            var ny = bomb.y + dir.dy * step;
            if (!this.inBounds(nx, ny)) break;
            var kind = this.grid[ny][nx].kind;
            if (kind === 'hard') break;
            this.paintDanger(nx, ny, fuse);
            if (kind === 'block') {
              pierced += 1;
              if (pierced > (bomb.pierce || 0)) break;
            }
            if (this.crateAt(nx, ny)) break;
          }
        }
      }
      for (var h = 0; h < this.blasts.length; h += 1) {
        var cells = this.blasts[h].cells;
        for (var c = 0; c < cells.length; c += 1) this.paintDanger(cells[c].x, cells[c].y, 0);
      }
      var hazardKeys = Array.from(this.hazards.keys());
      for (var k = 0; k < hazardKeys.length; k += 1) {
        var current = this.danger.get(hazardKeys[k]);
        if (current == null || current > 0.25) this.danger.set(hazardKeys[k], 0.25);
      }
    }

    paintDanger(x, y, time) {
      var key = keyOf(x, y);
      var existing = this.danger.get(key);
      if (existing == null || time < existing) this.danger.set(key, time);
    }

    /* ---------------------------------------------------------- player */
    queueMove(dir) {
      if (this.phase !== 'playing' || !dir) return;
      this.pendingDir = dir;
      this.heldDir = dir;
      this.holdClock = 0;
      this.repeatClock = 0.13;
      this.tryPlayerStep();
    }

    readInput() {
      var keyboardDir = null;
      for (var i = 0; i < MOVE_KEYS.length; i += 1) {
        var item = MOVE_KEYS[i];
        var down = kit.input.keyDown(item.code) || kit.input.keyDown(item.alt);
        var was = !!this.keyWasDown[item.code];
        this.keyWasDown[item.code] = down;
        if (down && !was) {
          keyboardDir = item.dir;
          this.queueMove(item.dir);
        }
        if (down && !keyboardDir) keyboardDir = item.dir;
      }
      var previousGamepadDir = this.gamepadDir;
      var gamepad = readGamepadState();
      this.gamepadDir = gamepad.dir;
      if (gamepad.dir && (!previousGamepadDir || previousGamepadDir.code !== gamepad.dir.code)) this.queueMove(gamepad.dir);
      var touchDir = this.touch && this.touch.isDown ? this.heldDir : null;
      var chosen = keyboardDir || gamepad.dir || touchDir;
      if (chosen) {
        if (!this.heldDir || this.heldDir.code !== chosen.code) {
          this.heldDir = chosen; this.holdClock = 0; this.repeatClock = 0.13;
        } else {
          this.holdClock += STEP;
          if (this.holdClock > 0.25) {
            this.repeatClock -= STEP;
            if (this.repeatClock <= 0) { this.repeatClock = 0.12 / (1 + this.player.speedLevel * 0.2); this.queueMove(chosen); }
          }
        }
      } else {
        this.heldDir = null; this.holdClock = 0; this.repeatClock = 0;
      }
      var bombDown = kit.input.keyDown('Space') || kit.input.keyDown('Enter') || gamepad.bomb;
      if (bombDown && !this.keyWasDown.__bomb) this.placeBomb();
      this.keyWasDown.__bomb = bombDown;
    }

    tryPlayerStep() {
      var p = this.player;
      if (!p || this.phase !== 'playing' || p.moveT < 1 || !this.pendingDir) return;
      var dir = this.pendingDir;
      this.pendingDir = null;
      p.lastDir = dir;
      var x = p.x + dir.dx;
      var y = p.y + dir.dy;
      var bomb = this.bombAt(x, y);
      if (bomb) {
        if (p.kick && this.kickBomb(bomb, dir.dx, dir.dy)) this.startPlayerMove(x, y);
        else this.emitBurst(x, y, 0xffc45d, 3);
        return;
      }
      var crate = this.crateAt(x, y);
      if (crate) {
        if (p.kick && this.pushCrate(crate, dir.dx, dir.dy)) this.startPlayerMove(x, y);
        else this.emitBurst(x, y, 0xb696ff, 3);
        return;
      }
      if (!this.canEnter(x, y, dir, false)) {
        this.emitBurst(p.x + dir.dx * 0.28, p.y + dir.dy * 0.28, 0x4f7f85, 2);
        return;
      }
      this.startPlayerMove(x, y);
    }

    startPlayerMove(x, y) {
      var p = this.player;
      p.fromX = p.x; p.fromY = p.y; p.toX = x; p.toY = y; p.moveT = 0;
      p.moveDuration = Math.max(0.055, 0.13 / (1 + p.speedLevel * 0.18));
      p.animState = 'move';
      p.coachMovePending = true;
    }

    updatePlayer() {
      var p = this.player;
      if (!p) return;
      p.invuln = Math.max(0, p.invuln - STEP);
      p.hitTimer = Math.max(0, p.hitTimer - STEP);
      p.plantTimer = Math.max(0, p.plantTimer - STEP);
      p.bob += STEP;
      if (p.hitTimer <= 0 && p.plantTimer <= 0 && p.moveT >= 1) p.animState = 'idle';
      else if (p.plantTimer > 0 && p.moveT >= 1 && p.hitTimer <= 0) p.animState = 'plant';
      if (p.moveT < 1) {
        p.moveT = Math.min(1, p.moveT + STEP / p.moveDuration);
        if (p.moveT >= 1) {
          p.x = p.toX; p.y = p.toY;
          p.animState = p.hitTimer > 0 ? 'hit' : p.plantTimer > 0 ? 'plant' : 'idle';
          if (p.coachMovePending) {
            p.coachMovePending = false;
            this.coachEvent('move');
          }
          this.checkTutorialDodge();
          this.collectDrop();
          this.checkHazard();
          this.checkContact();
          this.tryPlayerStep();
        }
      } else if (this.heldDir && this.holdClock > 0.25) {
        this.tryPlayerStep();
      }
    }

    playerPosition() {
      var p = this.player;
      if (!p || p.moveT >= 1) return { x: p ? p.x : 1, y: p ? p.y : 1 };
      var t = smooth(p.moveT);
      return { x: lerp(p.fromX, p.toX, t), y: lerp(p.fromY, p.toY, t) };
    }

    /* ----------------------------------------------------------- bombs */
    placeBomb() {
      var p = this.player;
      if (!p || this.phase !== 'playing' || p.moveT < 1) return;
      var live = 0;
      for (var i = 0; i < this.bombs.length; i += 1) if (this.bombs[i].owner === 'player' && !this.bombs[i].exploded) live += 1;
      if (live >= p.bombsMax || this.bombAt(p.x, p.y)) {
        this.emitBurst(p.x, p.y, 0xff7187, 3);
        kit.audio.sfx('score_ping', { volume: 0.16, rate: 0.6 });
        return;
      }
      this.bombs.push(this.makeBomb(p.x, p.y, p.radius, p.pierce, 'player', 1.34));
      p.plantTimer = 0.22;
      p.animState = 'plant';
      this.emitBurst(p.x, p.y, 0xffc45d, 6);
      kit.audio.sfx('fuse_tick', { volume: 0.55, rate: 0.9 });
      this.coachEvent('bomb');
    }

    makeBomb(x, y, radius, pierce, owner, fuse) {
      return {
        id: this.bombSerial++, x: x, y: y, fuse: fuse, fuseMax: fuse, radius: radius,
        pierce: pierce || 0, owner: owner, exploded: false, slide: null, phase: this.random() * 6
      };
    }

    placeEnemyBomb(chaser) {
      if (!chaser || this.bombAt(chaser.x, chaser.y)) return false;
      if (this.bombs.length >= 22) return false;
      var bomb = this.makeBomb(chaser.x, chaser.y, chaser.radius || 2, 0, 'enemy', 1.7);
      bomb.owner = 'enemy';
      bomb.ownerId = chaser.id;
      this.bombs.push(bomb);
      if (this.coachStep === 3 && this.mode === 'campaign' && this.arenaIndex === 1) {
        this.tutorialDodgeArmed = true;
        this.tutorialDodgeCell = { x: bomb.x, y: bomb.y };
      }
      this.emitBurst(chaser.x, chaser.y, 0xff7187, 4);
      chaser.fleeing = true;
      return true;
    }

    pushCrate(crate, dx, dy) {
      var nx = crate.x + dx;
      var ny = crate.y + dy;
      if (!this.canEnter(nx, ny, { dx: dx, dy: dy }, true) || this.chaserAt(nx, ny)) return false;
      crate.x = nx; crate.y = ny;
      this.emitBurst(nx, ny, 0x4ee5cc, 6);
      kit.audio.sfx('pickup_chime', { volume: 0.28, rate: 0.7 });
      return true;
    }

    kickBomb(bomb, dx, dy) {
      if (!bomb || bomb.slide) return false;
      var nx = bomb.x + dx;
      var ny = bomb.y + dy;
      if (!this.canEnter(nx, ny, { dx: dx, dy: dy }, true) || this.crateAt(nx, ny)) return false;
      bomb.slide = { dx: dx, dy: dy, clock: 0 };
      this.emitBurst(nx, ny, 0xb696ff, 6);
      kit.audio.sfx('pickup_chime', { volume: 0.3, rate: 1.3 });
      return true;
    }

    toggleKick() {
      if (this.player && this.player.kick) this.player.kick = !this.player.kick;
      this.updateActionLabels();
    }

    remoteDetonate() {
      if (!this.player || !this.player.remote || this.phase !== 'playing') return;
      if (this.mods.jammer) {
        this.showBanner('REMOTE JAMMED', 0x87e6ff, 0.7);
        kit.audio.sfx('score_ping', { volume: 0.2, rate: 0.55 });
        return;
      }
      var triggered = false;
      for (var i = 0; i < this.bombs.length; i += 1) {
        if (this.bombs[i].owner === 'player' && !this.bombs[i].exploded) { this.queueDetonation(this.bombs[i]); triggered = true; }
      }
      if (triggered) { this.coachEvent('chain'); this.resolveDetonations(); }
    }

    queueDetonation(bomb) {
      if (!bomb || bomb.exploded) return;
      bomb.exploded = true;
      this.detonationQueue.push(bomb);
    }

    updateBombs() {
      var i;
      if (this.mods.magnet) {
        this.magnetClock -= STEP;
        if (this.magnetClock <= 0) {
          this.magnetClock = 1.5;
          for (i = 0; i < this.bombs.length; i += 1) this.driftBomb(this.bombs[i]);
        }
      }
      for (i = 0; i < this.bombs.length; i += 1) {
        var bomb = this.bombs[i];
        if (bomb.exploded) continue;
        if (bomb.slide) {
          bomb.slide.clock -= STEP;
          if (bomb.slide.clock <= 0) {
            bomb.slide.clock = 0.1;
            var nx = bomb.x + bomb.slide.dx;
            var ny = bomb.y + bomb.slide.dy;
            if (this.canEnter(nx, ny, bomb.slide, true) && !this.crateAt(nx, ny)) { bomb.x = nx; bomb.y = ny; }
            else bomb.slide = null;
          }
        }
        bomb.fuse -= STEP;
        var fuseSecond = Math.ceil(bomb.fuse * 4);
        if (bomb.owner === 'player' && fuseSecond !== this.lastFuseSecond && bomb.fuse > 0 && bomb.fuse < 1) {
          this.lastFuseSecond = fuseSecond;
          kit.audio.sfx('fuse_tick', { volume: 0.38, rate: 1 + (1 - bomb.fuse) * 0.35 });
        }
        if (bomb.fuse <= 0) this.queueDetonation(bomb);
      }
      this.resolveDetonations();
      this.bombs = this.bombs.filter(function (bomb) { return !bomb.exploded; });
    }

    driftBomb(bomb) {
      if (!bomb || bomb.exploded || bomb.slide) return;
      var best = null;
      var bestDistance = 99;
      for (var i = 0; i < this.chasers.length; i += 1) {
        var chaser = this.chasers[i];
        if (!chaser.alive) continue;
        var distance = Math.abs(chaser.x - bomb.x) + Math.abs(chaser.y - bomb.y);
        if (distance < bestDistance) { bestDistance = distance; best = chaser; }
      }
      if (!best) return;
      var dx = Math.sign(best.x - bomb.x);
      var dy = Math.sign(best.y - bomb.y);
      var dir = Math.abs(best.x - bomb.x) >= Math.abs(best.y - bomb.y) ? { dx: dx, dy: 0 } : { dx: 0, dy: dy };
      if (!dir.dx && !dir.dy) return;
      var tx = bomb.x + dir.dx;
      var ty = bomb.y + dir.dy;
      if (this.canEnter(tx, ty, dir, true) && !this.crateAt(tx, ty)) { bomb.x = tx; bomb.y = ty; }
    }

    resolveDetonations() {
      var chain = 0;
      while (this.detonationQueue.length) {
        var bomb = this.detonationQueue.shift();
        this.explodeBomb(bomb, chain);
        chain += 1;
      }
      this.chainLevel = Math.max(0, chain - 1);
    }

    explodeBomb(bomb, chain) {
      var cells = [{ x: bomb.x, y: bomb.y, role: 'core', angle: 0 }];
      var touchedBombs = [];
      var self = this;
      for (var d = 0; d < DIRS.length; d += 1) {
        var dir = DIRS[d];
        var angle = Math.atan2(dir.dy, dir.dx);
        var pierced = 0;
        for (var distance = 1; distance <= bomb.radius; distance += 1) {
          var x = bomb.x + dir.dx * distance;
          var y = bomb.y + dir.dy * distance;
          if (!self.inBounds(x, y)) break;
          var cell = self.grid[y][x];
          if (cell.kind === 'hard') break;
          var last = distance === bomb.radius;
          cells.push({ x: x, y: y, role: last ? 'cap' : 'arm', angle: angle });
          var other = self.bombAt(x, y);
          if (other && other !== bomb && touchedBombs.indexOf(other) < 0) touchedBombs.push(other);
          if (cell.kind === 'block') {
            self.damageBlock(x, y);
            pierced += 1;
            if (pierced > (bomb.pierce || 0)) break;
          }
          if (self.crateAt(x, y)) break;
        }
      }
      for (var b = 0; b < touchedBombs.length; b += 1) this.queueDetonation(touchedBombs[b]);
      for (var c = 0; c < cells.length; c += 1) this.applyBlastCell(cells[c], bomb);
      var color = bomb.owner === 'enemy' ? 0xff7187 : 0xffc45d;
      var blast = { id: this.blastSerial++, cells: cells, life: 0.42, max: 0.42, chain: chain, color: color };
      this.blasts.push(blast);
      if (this.blasts.length > MAX_BLASTS) this.blasts.splice(0, this.blasts.length - MAX_BLASTS);
      this.shocks.push({ x: bomb.x, y: bomb.y, life: 0.42, max: 0.42, radius: bomb.radius, color: color });
      if (this.shocks.length > MAX_SHOCK_SPRITES) this.shocks.shift();
      this.emitBurst(bomb.x, bomb.y, color, 14 + chain * 3);
      this.emitBurst(bomb.x, bomb.y, 0x9baabd, 8 + chain * 2, 'smoke');
      kit.juice.shake(7 + Math.min(7, chain * 2), 155 + Math.min(90, chain * 20));
      if (chain > 0) kit.juice.hitStop(26);
      kit.audio.sfx(chain > 0 ? 'blast_chain' : (this.random() < 0.5 ? 'blast_boom_a' : 'blast_boom_b'), { volume: chain > 0 ? 0.9 : 0.7, rate: 0.9 + this.random() * 0.18 });
      if (chain > 0) this.coachEvent('chain');
    }

    applyBlastCell(cell, bomb) {
      if (!this.inBounds(cell.x, cell.y)) return;
      var p = this.player;
      if (p && p.x === cell.x && p.y === cell.y) this.hurtPlayer('blast');
      for (var i = 0; i < this.chasers.length; i += 1) {
        var chaser = this.chasers[i];
        if (!chaser.alive || chaser.x !== cell.x || chaser.y !== cell.y) continue;
        if (chaser.hp > 1) {
          chaser.hp -= 1; chaser.stun = 1.2; chaser.state = 'hurt';
          this.emitBurst(chaser.x, chaser.y, chaser.personality.color, 18);
          kit.audio.sfx('chaser_growl', { volume: 0.42, rate: 0.72 });
        } else this.defeatChaser(chaser, bomb && bomb.owner === 'player');
      }
      var crate = this.crateAt(cell.x, cell.y);
      if (crate) {
        this.emitBurst(cell.x, cell.y, 0xd7a86a, 10, 'debris');
      }
    }

    /* ---------------------------------------------------------- blocks */
    damageBlock(x, y) {
      var block = this.blockByKey.get(keyOf(x, y));
      if (!block || !block.alive) return;
      var visual = this.blockVisuals.get(block.id);
      if (block.armor > 0) {
        block.armor -= 1;
        if (visual) { visual.flash = 1; visual.wobble = 0.24; }
        this.emitBurst(x, y, 0xc6a1ff, 8, 'debris');
        kit.audio.sfx('score_ping', { volume: 0.22, rate: 0.7 });
        return;
      }
      if (block.state > 0) return;
      block.state = 1;
      block.timer = this.mods.brittle ? 0.03 : 0.1;
      if (visual) { visual.flash = 1; visual.wobble = 0.2; }
      this.emitBurst(x, y, 0xb68d68, 9, 'debris');
    }

    updateBlocks() {
      for (var i = 0; i < this.blocks.length; i += 1) {
        var block = this.blocks[i];
        var visual = this.blockVisuals.get(block.id);
        if (visual) {
          visual.flash = Math.max(0, visual.flash - STEP * 5);
          visual.wobble = Math.max(0, visual.wobble - STEP);
        }
        if (!block.alive || block.state <= 0) continue;
        block.timer -= STEP;
        if (block.state === 1 && block.timer <= 0) { block.state = 2; block.timer = this.mods.brittle ? 0.03 : 0.09; }
        else if (block.state === 2 && block.timer <= 0) {
          block.alive = false;
          if (this.grid[block.y] && this.grid[block.y][block.x].kind === 'block') this.grid[block.y][block.x] = { kind: 'floor', blockId: 0 };
          this.blockByKey.delete(keyOf(block.x, block.y));
          this.blocksBroken += 1;
          this.score += 5;
          if (block.dropType) this.drops.push({ id: this.dropSerial++, x: block.x, y: block.y, type: block.dropType, life: 0 });
          this.chunkBlock(block);
        }
      }
    }

    /* Destructible chunking: the block breaks into weighted shards that
     * tumble and settle, not a puff of dots. */
    chunkBlock(block) {
      var theme = this.theme || THEME_FALLBACK;
      var tint = PhaserRef.Display.Color.HexStringToColor(theme.blockTop).color;
      var rim = PhaserRef.Display.Color.HexStringToColor(theme.blockRim).color;
      this.emitBurst(block.x, block.y, tint, 10, 'debris', { heavy: true });
      this.emitBurst(block.x, block.y, rim, 5, 'debris', { heavy: true });
      this.emitBurst(block.x, block.y, 0x9baabd, 5, 'smoke');
      kit.audio.sfx('blast_boom_b', { volume: 0.2, rate: 1.5 + this.random() * 0.3 });
    }

    /* ----------------------------------------------------------- drops */
    collectDrop() {
      for (var i = this.drops.length - 1; i >= 0; i -= 1) {
        var drop = this.drops[i];
        if (drop.x !== this.player.x || drop.y !== this.player.y) continue;
        this.drops.splice(i, 1);
        this.applyDrop(drop.type);
      }
    }

    applyDrop(type) {
      var p = this.player;
      if (!p) return;
      if (type === 'bomb') p.bombsMax = Math.min(6, p.bombsMax + 1);
      else if (type === 'radius') p.radius = Math.min(6, p.radius + 1);
      else if (type === 'boots') p.speedLevel = Math.min(4, p.speedLevel + 1);
      else if (type === 'shield') p.shield = Math.min(3, p.shield + 1);
      else if (type === 'points') this.score += 75;
      else if (type === 'life') this.lives = Math.min(5, this.lives + 1);
      else if (type === 'kick') p.kick = true;
      else if (type === 'remote') p.remote = true;
      else if (type === 'pierce') p.pierce = Math.min(3, p.pierce + 1);
      this.score += type === 'points' ? 0 : 25;
      this.showBanner(DROP_CHIP[type] || type.toUpperCase(), DROP_COLORS[type] || 0x5de5d1, 0.8);
      this.emitBurst(p.x, p.y, DROP_COLORS[type] || 0x5de5d1, 18, 'pickup');
      kit.audio.sfx('pickup_chime', { volume: 0.72, rate: 0.86 + this.random() * 0.3 });
      this.updateActionLabels();
    }

    botTakeDrop(chaser) {
      for (var i = this.drops.length - 1; i >= 0; i -= 1) {
        var drop = this.drops[i];
        if (drop.x !== chaser.x || drop.y !== chaser.y) continue;
        this.drops.splice(i, 1);
        if (drop.type === 'radius' || drop.type === 'bomb') chaser.radius = Math.min(5, (chaser.radius || 1) + 1);
        else if (drop.type === 'boots') chaser.speedLevel = Math.min(3, (chaser.speedLevel || 0) + 1);
        else if (drop.type === 'shield' || drop.type === 'life') chaser.hp += 1;
        this.emitBurst(chaser.x, chaser.y, DROP_COLORS[drop.type] || 0x5de5d1, 12, 'pickup');
        kit.audio.sfx('pickup_chime', { volume: 0.3, rate: 0.55 });
      }
    }

    /* ------------------------------------------------------------- AI */
    updateChasers() {
      var player = this.player;
      if (!player) return;
      if (this.coachStep === 3 && this.mode === 'campaign' && this.arenaIndex === 1 &&
          !this.tutorialDodgeArmed && this.arenaTime > 4.5) {
        for (var trainer = 0; trainer < this.chasers.length; trainer += 1) {
          if (this.chasers[trainer].alive) { this.placeEnemyBomb(this.chasers[trainer]); break; }
        }
      }
      for (var i = 0; i < this.chasers.length; i += 1) {
        var chaser = this.chasers[i];
        if (!chaser.alive) { chaser.deathLife = Math.max(0, chaser.deathLife - STEP); continue; }
        chaser.bombCool = Math.max(0, chaser.bombCool - STEP);
        chaser.fleeUntil = Math.max(0, (chaser.fleeUntil || 0) - STEP);
        if (chaser.stun > 0) {
          chaser.stun = Math.max(0, chaser.stun - STEP);
          chaser.state = 'hurt';
          if (chaser.stun === 0) chaser.state = 'idle';
          continue;
        }
        if (chaser.moveT < 1) {
          var speed = 0.16 / (1 + (chaser.speedLevel || 0) * 0.2);
          chaser.moveT = Math.min(1, chaser.moveT + STEP / speed);
          if (chaser.moveT >= 1) {
            chaser.x = chaser.toX; chaser.y = chaser.toY;
            if (this.mods.scavenger || this.mode === 'duel' || chaser.personality.greed > 0.6) this.botTakeDrop(chaser);
            this.checkContact();
          }
          continue;
        }
        chaser.cooldown -= STEP;
        if (chaser.cooldown > 0) continue;
        var personality = chaser.personality || PERSONALITY_FALLBACK;
        var delay = personality.delay;
        if (this.mods.haste) delay *= 0.78;
        delay /= (1 + (chaser.speedLevel || 0) * 0.18);
        chaser.cooldown = Math.max(0.12, delay - Math.min(0.1, this.arenaIndex * 0.004)) + this.random() * 0.07;
        this.thinkChaser(chaser, personality);
        this.checkContact();
      }
    }

    thinkChaser(chaser, personality) {
      var p = this.player;
      var standing = this.dangerAt(chaser.x, chaser.y);
      /* A bot that just armed a bomb commits to clearing the cross until it
       * goes off. Without this it re-enters its own blast on the next think
       * and blows itself up, which is exactly how the sapper class died. */
      if (chaser.fleeUntil > 0) {
        chaser.state = 'alert';
        if (!isFinite(standing)) return;
        var clear = this.stepToSafety(chaser);
        if (clear) this.startChaserMove(chaser, clear.dx, clear.dy);
        return;
      }
      /* 1. survive: if the tile is about to be crossed by a blast, run */
      if (standing < 1.05) {
        var escape = this.stepToSafety(chaser);
        chaser.state = 'alert';
        if (escape) { this.startChaserMove(chaser, escape.dx, escape.dy); return; }
      }
      chaser.fleeing = false;
      /* 2. bomb: sappers, wardens, duelists and the overlord open lanes and
       * cut the player off, but only from a tile they can still leave */
      if (personality.bombChance > 0 && chaser.bombCool <= 0 && this.random() < personality.bombChance) {
        var worthIt = this.bombValue(chaser);
        if (worthIt && this.hasEscape(chaser)) {
          if (this.placeEnemyBomb(chaser)) {
            chaser.bombCool = 2.4 + this.random() * 1.6;
            chaser.fleeUntil = 1.85;
            chaser.state = 'alert';
            var away = this.stepToSafety(chaser);
            if (away) this.startChaserMove(chaser, away.dx, away.dy);
            return;
          }
        }
      }
      /* 3. greed: contest the power-ups */
      if (personality.greed > 0.4 && this.drops.length) {
        var target = this.nearestDrop(chaser, personality.greed > 0.7 ? 8 : 5);
        if (target) {
          var greedStep = this.nextStepToward(chaser.x, chaser.y, target.x, target.y, chaser);
          if (greedStep) { chaser.state = 'hunt'; this.startChaserMove(chaser, greedStep.dx, greedStep.dy); return; }
        }
      }
      /* 4. pursue */
      var step = null;
      if (personality.key === 'flanker') {
        var flank = { x: p.x - (p.lastDir ? p.lastDir.dx * 2 : 2), y: p.y - (p.lastDir ? p.lastDir.dy * 2 : 2) };
        if (!this.isWalkable(flank.x, flank.y, true)) flank = { x: p.x, y: p.y };
        step = this.nextStepToward(chaser.x, chaser.y, flank.x, flank.y, chaser);
        chaser.state = 'hunt';
      } else if (personality.key === 'warden') {
        var near = Math.abs(p.x - chaser.homeX) + Math.abs(p.y - chaser.homeY) <= 4;
        var goal = near ? { x: p.x, y: p.y } : { x: chaser.homeX, y: chaser.homeY };
        step = this.nextStepToward(chaser.x, chaser.y, goal.x, goal.y, chaser);
        chaser.state = near ? 'hunt' : 'idle';
      } else if (this.random() < personality.chase) {
        step = this.nextStepToward(chaser.x, chaser.y, p.x, p.y, chaser);
        chaser.state = 'hunt';
      }
      if (!step) {
        chaser.state = chaser.state === 'hunt' ? 'hunt' : 'idle';
        if (this.random() < 0.6 && this.canChaserEnter(chaser.x + chaser.dir.dx, chaser.y + chaser.dir.dy, chaser, chaser.dir)) step = chaser.dir;
        else step = DIRS[Math.floor(this.random() * DIRS.length)];
      }
      if (!step || !this.canChaserEnter(chaser.x + step.dx, chaser.y + step.dy, chaser, step)) return;
      chaser.dir = step;
      this.startChaserMove(chaser, step.dx, step.dy);
    }

    bombValue(chaser) {
      var p = this.player;
      if (!p) return false;
      if (Math.abs(p.x - chaser.x) + Math.abs(p.y - chaser.y) <= (chaser.radius || 2) + 1) return true;
      for (var d = 0; d < DIRS.length; d += 1) {
        var x = chaser.x + DIRS[d].dx;
        var y = chaser.y + DIRS[d].dy;
        if (this.inBounds(x, y) && this.grid[y][x].kind === 'block') return true;
      }
      return false;
    }

    /* Placing is only sane if the bot can leave its own cross: a walkable
     * neighbour that itself opens onto a perpendicular tile. */
    hasEscape(chaser) {
      for (var d = 0; d < DIRS.length; d += 1) {
        var dir = DIRS[d];
        var x = chaser.x + dir.dx;
        var y = chaser.y + dir.dy;
        if (!this.canChaserEnter(x, y, chaser, dir)) continue;
        for (var p = 0; p < DIRS.length; p += 1) {
          var side = DIRS[p];
          if (side.dx === dir.dx && side.dy === dir.dy) continue;
          if (side.dx === -dir.dx && side.dy === -dir.dy) continue;
          if (this.canChaserEnter(x + side.dx, y + side.dy, chaser, side)) return true;
        }
      }
      return false;
    }

    nearestDrop(chaser, range) {
      var best = null;
      var bestDistance = range + 1;
      for (var i = 0; i < this.drops.length; i += 1) {
        var drop = this.drops[i];
        var distance = Math.abs(drop.x - chaser.x) + Math.abs(drop.y - chaser.y);
        if (distance < bestDistance) { bestDistance = distance; best = drop; }
      }
      return best;
    }

    /* A safe tile is one NO live bomb covers. Settling for "less dangerous"
     * parks the bot inside its own cross, which is how a bomb-laying bot
     * kills itself. */
    stepToSafety(chaser) {
      var queue = [{ x: chaser.x, y: chaser.y, first: null, depth: 0 }];
      var seen = new Set([keyOf(chaser.x, chaser.y)]);
      var guard = 0;
      var fallback = null;
      var fallbackDanger = this.dangerAt(chaser.x, chaser.y);
      while (queue.length && guard < 320) {
        guard += 1;
        var current = queue.shift();
        if (current.first) {
          var here = this.dangerAt(current.x, current.y);
          if (!isFinite(here)) return current.first;
          if (here > fallbackDanger) { fallbackDanger = here; fallback = current.first; }
        }
        if (current.depth > 8) continue;
        for (var i = 0; i < DIRS.length; i += 1) {
          var dir = DIRS[i];
          var nx = current.x + dir.dx;
          var ny = current.y + dir.dy;
          var key = keyOf(nx, ny);
          if (seen.has(key)) continue;
          if (!this.canChaserEnter(nx, ny, chaser, dir)) continue;
          seen.add(key);
          queue.push({ x: nx, y: ny, first: current.first || dir, depth: current.depth + 1 });
        }
      }
      return fallback;
    }

    canChaserEnter(x, y, except, direction) {
      var dir = direction || (except && except.x != null ? { dx: x - except.x, dy: y - except.y } : null);
      if (!this.canEnter(x, y, dir, true)) return false;
      if (this.chaserAt(x, y, except)) return false;
      if (this.dangerAt(x, y) < 0.45) return false;
      return true;
    }

    startChaserMove(chaser, dx, dy) {
      var x = chaser.x + dx;
      var y = chaser.y + dy;
      if (!this.canChaserEnter(x, y, chaser, { dx: dx, dy: dy })) return;
      chaser.fromX = chaser.x; chaser.fromY = chaser.y; chaser.toX = x; chaser.toY = y; chaser.moveT = 0;
    }

    nextStepToward(startX, startY, targetX, targetY, except) {
      if (!this.inBounds(targetX, targetY)) return null;
      var queue = [{ x: startX, y: startY }];
      var seen = new Set([keyOf(startX, startY)]);
      var parent = new Map();
      var guard = 0;
      while (queue.length && guard < 400) {
        guard += 1;
        var current = queue.shift();
        if (current.x === targetX && current.y === targetY) break;
        for (var i = 0; i < DIRS.length; i += 1) {
          var dir = DIRS[i];
          var nx = current.x + dir.dx;
          var ny = current.y + dir.dy;
          var key = keyOf(nx, ny);
          if (seen.has(key) || !this.canChaserEnter(nx, ny, except, dir)) continue;
          seen.add(key); parent.set(key, { x: current.x, y: current.y }); queue.push({ x: nx, y: ny });
        }
      }
      var targetKey = keyOf(targetX, targetY);
      if (!seen.has(targetKey)) return null;
      var cursor = targetKey;
      while (parent.has(cursor)) {
        var previous = parent.get(cursor);
        if (previous.x === startX && previous.y === startY) {
          var parts = cursor.split(',').map(Number);
          return { dx: parts[0] - startX, dy: parts[1] - startY };
        }
        cursor = keyOf(previous.x, previous.y);
      }
      return null;
    }

    defeatChaser(chaser, byPlayer) {
      if (!chaser || !chaser.alive) return;
      var personality = chaser.personality || PERSONALITY_FALLBACK;
      chaser.alive = false;
      chaser.state = 'hurt';
      chaser.deathLife = personality.key === 'overlord' ? 0.42 : 0.28;
      chaser.deathMax = chaser.deathLife;
      if (byPlayer !== false) this.score += personality.points;
      this.emitBurst(chaser.x, chaser.y, personality.color, personality.key === 'overlord' ? 40 : 22, 'sparks');
      this.emitBurst(chaser.x, chaser.y, 0x9baabd, personality.key === 'overlord' ? 18 : 9, 'smoke');
      this.shocks.push({ x: chaser.x, y: chaser.y, life: 0.3, max: 0.3, radius: 1.4, color: personality.color });
      kit.juice.shake(personality.key === 'overlord' ? 13 : 6, personality.key === 'overlord' ? 260 : 120);
      kit.audio.sfx(personality.key === 'overlord' ? 'blast_chain' : 'chaser_growl', { volume: 0.75, rate: personality.key === 'overlord' ? 0.62 : 1.05 });
      kit.audio.sfx('score_ping', { volume: 0.42, rate: personality.key === 'overlord' ? 0.72 : 1.12 });
      if (this.mode !== 'duel') this.spawnBonusDrop(chaser.x, chaser.y, personality.key === 'overlord' ? 'life' : (this.random() < 0.7 ? 'points' : 'radius'));
    }

    spawnBonusDrop(x, y, type) {
      this.drops.push({ id: this.dropSerial++, x: x, y: y, type: type, life: 0 });
      this.emitBurst(x, y, DROP_COLORS[type] || 0x5de5d1, 8, 'pickup');
    }

    /* --------------------------------------------- hazards and damage */
    checkContact() {
      var p = this.player;
      if (!p || this.phase !== 'playing' || p.invuln > 0) return;
      var pos = this.playerPosition();
      for (var i = 0; i < this.chasers.length; i += 1) {
        var chaser = this.chasers[i];
        if (chaser.alive && Math.abs(chaser.x - pos.x) < 0.52 && Math.abs(chaser.y - pos.y) < 0.52) { this.hurtPlayer('chaser'); return; }
      }
      for (var b = 0; b < this.blasts.length; b += 1) {
        var cells = this.blasts[b].cells;
        for (var c = 0; c < cells.length; c += 1) {
          if (cells[c].x === p.x && cells[c].y === p.y) { this.hurtPlayer('blast'); return; }
        }
      }
    }

    checkHazard() {
      var p = this.player;
      if (p && this.hazards.has(keyOf(p.x, p.y))) this.hurtPlayer('hazard');
    }

    checkTutorialDodge() {
      if (!this.tutorialDodgeArmed || !this.tutorialDodgeCell || !this.player) return;
      if (this.player.x === this.tutorialDodgeCell.x && this.player.y === this.tutorialDodgeCell.y) return;
      this.tutorialDodgeArmed = false;
      this.coachEvent('dodge-success');
    }

    hurtPlayer(reason) {
      var p = this.player;
      if (!p || this.phase !== 'playing' || p.invuln > 0) return;
      if (p.shield > 0) {
        p.shield -= 1; p.invuln = 0.8;
        this.emitBurst(p.x, p.y, 0x72a7ff, 20);
        this.shocks.push({ x: p.x, y: p.y, life: 0.3, max: 0.3, radius: 1.2, color: 0x72a7ff });
        kit.audio.sfx('pickup_chime', { volume: 0.52, rate: 0.55 });
        this.showBanner('SHIELD HELD', 0x72a7ff, 0.7);
        this.updateActionLabels();
        return;
      }
      this.lives -= 1;
      p.invuln = 1.2;
      p.hitTimer = 0.34;
      p.animState = 'hit';
      this.damagePulse = 1;
      this.emitBurst(p.x, p.y, 0xff7187, 28);
      this.emitBurst(p.x, p.y, 0x9baabd, 12, 'smoke');
      kit.juice.shake(12, 260);
      kit.audio.sfx('chaser_growl', { volume: 0.75, rate: 0.52 });
      if (this.mode === 'duel') { this.finishDuelRound(this.survivingSeat()); return; }
      if (this.lives <= 0) this.endRun(false, 'RUN OVER');
      else {
        this.phase = 'life-lost';
        this.phaseClock = 0.92;
        this.showBanner('HIT / ' + (reason === 'blast' ? 'BLAST' : reason === 'hazard' ? 'VENT' : 'BOT'), 0xff7187, 0.8);
      }
    }

    updateLifeLost() {
      this.phaseClock -= STEP;
      if (this.phaseClock <= 0) this.startArena(this.arenaIndex, false);
    }

    aliveChasers() {
      var count = 0;
      for (var i = 0; i < this.chasers.length; i += 1) if (this.chasers[i].alive) count += 1;
      return count;
    }

    survivingSeat() {
      for (var i = 0; i < this.chasers.length; i += 1) if (this.chasers[i].alive) return this.chasers[i].seat;
      return 0;
    }

    /* ------------------------------------------- sudden death squeeze */
    updateCompression() {
      var c = this.compression;
      if (!c) return;
      if (!c.armed) {
        if (this.arenaTime < c.at) return;
        c.armed = true;
        this.showBanner('SUDDEN DEATH', 0xff6c63, 1);
        kit.audio.sfx('banner_sting', { volume: 0.6, rate: 0.7 });
        kit.juice.shake(9, 300);
      }
      c.clock -= STEP;
      if (c.clock > 0) return;
      c.clock = c.interval;
      var cell = null;
      while (c.index < c.path.length) {
        var candidate = c.path[c.index];
        c.index += 1;
        if (this.grid[candidate.y][candidate.x].kind === 'hard') continue;
        cell = candidate;
        break;
      }
      if (!cell) return;
      this.sealCell(cell.x, cell.y);
    }

    sealCell(x, y) {
      var block = this.blockByKey.get(keyOf(x, y));
      if (block) { block.alive = false; this.blockByKey.delete(keyOf(x, y)); }
      for (var i = this.crates.length - 1; i >= 0; i -= 1) if (this.crates[i].x === x && this.crates[i].y === y) this.crates.splice(i, 1);
      for (var d = this.drops.length - 1; d >= 0; d -= 1) if (this.drops[d].x === x && this.drops[d].y === y) this.drops.splice(d, 1);
      this.hazards.delete(keyOf(x, y));
      this.oneWays.delete(keyOf(x, y));
      this.grid[y][x] = { kind: 'hard', blockId: 0 };
      this.walls = this.walls || [];
      this.walls.push({ x: x, y: y, drop: 1 });
      this.emitBurst(x, y, 0x9baabd, 10, 'debris', { heavy: true });
      kit.audio.sfx('blast_boom_a', { volume: 0.32, rate: 0.7 });
      kit.juice.shake(5, 110);
      var p = this.player;
      if (p && p.x === x && p.y === y) { p.invuln = 0; this.hurtPlayer('blast'); }
      for (var c = 0; c < this.chasers.length; c += 1) {
        var chaser = this.chasers[c];
        if (chaser.alive && chaser.x === x && chaser.y === y) this.defeatChaser(chaser, false);
      }
      for (var b = this.bombs.length - 1; b >= 0; b -= 1) if (this.bombs[b].x === x && this.bombs[b].y === y) this.bombs.splice(b, 1);
    }

    updateQuake() {
      if (!this.mods.quake) return;
      this.quakeClock -= STEP;
      if (this.quakeClock > 0) return;
      this.quakeClock = 9;
      kit.juice.shake(6, 260);
      kit.audio.sfx('blast_boom_a', { volume: 0.28, rate: 0.55 });
      var placed = 0;
      var guard = 0;
      while (placed < 3 && guard < 60) {
        guard += 1;
        var x = 1 + Math.floor(this.random() * (COLS - 2));
        var y = 1 + Math.floor(this.random() * (ROWS - 2));
        if (this.grid[y][x].kind !== 'floor') continue;
        if (this.player && this.player.x === x && this.player.y === y) continue;
        this.hazards.set(keyOf(x, y), { phase: this.random() * 4, life: 4.5, temporary: true });
        placed += 1;
      }
    }

    updateHazards() {
      if (!this.hazards.size) return;
      var expired = null;
      this.hazards.forEach(function (hazard, key) {
        if (hazard.life === Infinity) return;
        hazard.life -= STEP;
        if (hazard.life <= 0) { expired = expired || []; expired.push(key); }
      });
      if (expired) for (var i = 0; i < expired.length; i += 1) this.hazards.delete(expired[i]);
    }

    /* --------------------------------------------------------- rounds */
    updateMusicLayer() {
      if (this.phase !== 'playing' && this.phase !== 'life-lost') return;
      var danger = this.lives <= 1 || this.aliveChasers() >= 4 || this.arenaIndex >= 10 ||
        (this.compression && this.compression.armed) ||
        (this.mode === 'score-attack' && this.timeLeft <= 20);
      var target = danger ? 'music_heat' : 'music_base';
      if (target === this.musicLayer) return;
      this.musicLayer = target;
      kit.audio.music(target, 450);
    }

    checkClear() {
      if (this.phase !== 'playing') return;
      if (this.mode === 'duel') {
        if (this.aliveChasers() === 0) this.finishDuelRound(0);
        return;
      }
      if (this.mode === 'score-attack') {
        if (this.aliveChasers() === 0) {
          this.score += 400 + this.blocksBroken * 4;
          var timeBonus = 8 + Math.min(10, Math.floor(this.blocksBroken / 4));
          this.timeLeft = Math.min(90, this.timeLeft + timeBonus);
          var next = this.arenaIndex >= ARENAS.length ? 1 : this.arenaIndex + 1;
          this.startArena(next, false);
          this.showBanner('+' + timeBonus + ' SEC', this.theme.accent, 0.8);
        }
        return;
      }
      if (this.aliveChasers() === 0) this.finishArena();
    }

    medalFor(arena) {
      if (this.arenaTime <= arena.goldTime && this.blocksBroken >= arena.goldBlocks) return 'gold';
      if (this.arenaTime <= arena.silverTime && this.blocksBroken >= arena.silverBlocks) return 'silver';
      return 'bronze';
    }

    finishArena() {
      if (this.phase !== 'playing') return;
      var arena = this.arenaConfig;
      var medal = this.medalFor(arena);
      this.phase = 'result';
      this.phaseClock = 0;
      this.result = { won: true, medal: medal, arena: arena.id };
      this.score += 300 + (medal === 'gold' ? 500 : medal === 'silver' ? 250 : 100);
      if (this.mode === 'campaign') {
        var oldMedal = profile.medals[String(arena.id)];
        var rank = { bronze: 1, silver: 2, gold: 3 };
        if (!oldMedal || rank[medal] > rank[oldMedal]) profile.medals[String(arena.id)] = medal;
        if (!profile.bestTimes[String(arena.id)] || this.arenaTime < profile.bestTimes[String(arena.id)]) {
          profile.bestTimes[String(arena.id)] = Math.round(this.arenaTime * 10) / 10;
        }
        profile.unlocked = Math.max(profile.unlocked, Math.min(CAMPAIGN_LENGTH, arena.id + 1));
      }
      profile.bestScore = Math.max(profile.bestScore, Math.floor(this.score));
      persist();
      this.celebrate(medal === 'gold' ? 3 : medal === 'silver' ? 2 : 1);
      this.showResultCard(true, medal);
    }

    finishDuelRound(winnerSeat) {
      if (this.phase !== 'playing') return;
      this.phase = 'result';
      this.duelScore[winnerSeat] = (this.duelScore[winnerSeat] || 0) + 1;
      var matchOver = this.duelScore[winnerSeat] >= 2 || this.duelRound >= 3;
      this.result = { won: winnerSeat === 0, medal: null, arena: this.arenaIndex, duel: true, matchOver: matchOver, winner: winnerSeat };
      if (winnerSeat === 0) this.score += 900;
      profile.duelRuns += 1;
      if (matchOver && winnerSeat === 0) { profile.duelWins += 1; profile.duelBest = Math.max(profile.duelBest, this.duelScore[0]); }
      profile.bestScore = Math.max(profile.bestScore, Math.floor(this.score));
      persist();
      this.celebrate(winnerSeat === 0 ? 3 : 1);
      this.showResultCard(winnerSeat === 0, null);
    }

    endRun(won, title) {
      this.phase = 'result';
      this.result = { won: !!won, medal: null, arena: this.arenaIndex, title: title };
      profile.bestScore = Math.max(profile.bestScore, Math.floor(this.score));
      persist();
      this.showResultCard(!!won, null);
    }

    showResultCard(won, medal) {
      kit.audio.sfx('banner_sting', { volume: 0.74, rate: medal === 'gold' ? 1.15 : 0.95 });
      this.coachEvent('clear');
      this.clearTransient();
      this.updateResultCopy();
      this.cardImage.setVisible(true);
      this.cardImage.setScale(kit.juice.enabled ? 0.86 : 1);
      this.cardImage.setAlpha(kit.juice.enabled ? 0 : 1);
      this.tweens.add({ targets: this.cardImage, scaleX: this.cardScaleX(), scaleY: this.cardScaleY(), alpha: 1, duration: kit.juice.enabled ? 280 : 60, ease: 'Back.easeOut' });
      if (medal) {
        this.medalImage.setTexture('br-medal-' + medal);
        this.medalImage.setVisible(true);
        this.medalImage.setDisplaySize(72, 72);
        this.medalImage.setAngle(-12);
        this.tweens.add({ targets: this.medalImage, angle: 0, duration: 420, ease: 'Elastic.easeOut' });
      } else this.medalImage.setVisible(false);
      this.resultTitle.setVisible(true);
      this.resultCopy.setVisible(true);
      for (var i = 0; i < this.actionButtons.length; i += 1) setButtonVisible(this.actionButtons[i], false);
      setButtonVisible(this.continueButton, true);
      setButtonVisible(this.menuButton, true);
    }

    cardScaleX() {
      var target = Math.min(viewW() - 36, 320);
      return target / (this.cardImage.width || target);
    }
    cardScaleY() {
      return 236 / (this.cardImage.height || 236);
    }

    celebrate(level) {
      this.celebration = 0.1;
      this.celebrationLevel = level;
      var self = this;
      var bursts = level + 1;
      for (var i = 0; i < bursts; i += 1) {
        (function (index) {
          self.time.delayedCall(index * 190, function () {
            if (!self.scene || !self.scene.isActive()) return;
            var cx = 2 + self.random() * (COLS - 4);
            var cy = 3 + self.random() * (ROWS - 6);
            self.emitBurst(cx, cy, [0xffc45d, 0x5de5d1, 0xff7187, 0xc6a1ff][index % 4], 12 + index * 6, 'confetti');
            self.shocks.push({ x: cx, y: cy, life: 0.34, max: 0.34, radius: 1 + index * 0.4, color: 0xffe6a8 });
            kit.audio.sfx('score_ping', { volume: 0.34, rate: 0.9 + index * 0.14 });
            kit.juice.shake(3 + index * 2, 120);
          });
        }(i));
      }
    }

    updateResultCopy() {
      if (!this.result) return;
      if (this.result.duel) {
        setTextIfChanged(this.resultTitle, this.result.matchOver
          ? (this.result.won ? 'DUEL WON' : 'DUEL LOST')
          : (this.result.won ? 'ROUND WON' : 'ROUND LOST'));
        setTextIfChanged(this.resultCopy, 'ROUND ' + this.duelRound + ' OF 3\nYOU ' + this.duelScore[0] +
          '  RED ' + this.duelScore[1] + '  BLUE ' + this.duelScore[2] + '  GOLD ' + this.duelScore[3] +
          '\nSCORE ' + Math.floor(this.score));
        setTextIfChanged(this.continueButton.buttonText, this.result.matchOver ? 'RUN IT BACK' : 'NEXT ROUND');
        return;
      }
      if (this.result.won) {
        setTextIfChanged(this.resultTitle, this.result.medal ? this.result.medal.toUpperCase() + ' MEDAL' : 'RUN COMPLETE');
        setTextIfChanged(this.resultCopy, 'A' + String(this.arenaIndex).padStart(2, '0') + ' ' + (this.arenaConfig ? this.arenaConfig.title : '') +
          '\n' + this.blocksBroken + ' BLOCKS  /  ' + Math.floor(this.arenaTime) + 's\nSCORE ' + Math.floor(this.score));
        setTextIfChanged(this.continueButton.buttonText, this.mode === 'campaign' && this.arenaIndex < CAMPAIGN_LENGTH ? 'NEXT ARENA' : 'RUN IT BACK');
      } else {
        setTextIfChanged(this.resultTitle, this.result.title || 'RUN OVER');
        setTextIfChanged(this.resultCopy, 'SCORE ' + Math.floor(this.score) + '\nBEST ' + profile.bestScore + '\nThe fuse always leaves a way out.');
        setTextIfChanged(this.continueButton.buttonText, 'RUN IT BACK');
      }
    }

    continueFromResult() {
      if (this.leaving) return;
      kit.input.clearAll();
      Gestures.clear();
      var self = this;
      if (this.result && this.result.duel && !this.result.matchOver) {
        this.duelRound += 1;
        this.lives = 1;
        this.startArena(this.arenaIndex, true);
        return;
      }
      this.leaving = true;
      curtainOut(this, function () {
        if (self.result && self.result.won && self.mode === 'campaign' && self.arenaIndex < CAMPAIGN_LENGTH) {
          self.scene.start('play', { mode: 'campaign', arena: self.arenaIndex + 1 });
        } else if (self.mode === 'duel') self.scene.start('play', { mode: 'duel', arena: 1 });
        else if (self.mode === 'score-attack') self.scene.start('play', { mode: 'score-attack', arena: 1 });
        else self.scene.start('play', { mode: self.mode, arena: self.arenaIndex });
      });
    }

    goToMenu() {
      if (this.leaving) return;
      this.leaving = true;
      kit.input.clearAll();
      Gestures.clear();
      var self = this;
      curtainOut(this, function () { self.scene.start('title'); });
    }

    restartRun() {
      kit.input.clearAll();
      Gestures.clear();
      this.touch = null;
      this.gamepadDir = null;
      this.scene.restart({ mode: this.mode, arena: this.arenaIndex });
    }

    /* ------------------------------------------------------ coach / UI */
    coachEvent(event) {
      if (this.coachStep >= 4) return;
      if (this.coachStep === 0 && event === 'move') this.coachStep = 1;
      else if (this.coachStep === 1 && event === 'bomb') this.coachStep = 2;
      else if (this.coachStep === 2 && event === 'chain') this.coachStep = 3;
      else if (this.coachStep === 3 && event === 'dodge-success') {
        this.coachStep = 4; profile.tutorialDone = true; persist();
      }
      this.updateCoach();
    }

    updateCoach() {
      var copy = '';
      if (this.coachStep === 0) copy = 'SWIPE OR WASD TO MOVE';
      else if (this.coachStep === 1) copy = 'BOMB, THEN STEP AWAY';
      else if (this.coachStep === 2) copy = 'SECOND BOMB CHAINS';
      else if (this.coachStep === 3) copy = 'RED TELEGRAPH: DODGE';
      else {
        this.coachLife = 0;
        setTextIfChanged(this.coachStrip, '');
        return;
      }
      this.coachLife = 3.4;
      setTextIfChanged(this.coachStrip, copy);
    }

    clearTransient() {
      this.banner.text = '';
      this.banner.life = 0;
      this.banner.max = 0;
      this.banner.queue.length = 0;
    }

    advanceBanner() {
      if (this.phase !== 'playing' || this.banner.life > 0 || this.coachLife > 0 || !this.banner.queue.length) return;
      var next = this.banner.queue.shift();
      this.banner.text = next.text;
      this.banner.color = next.color;
      this.banner.life = next.life;
      this.banner.max = next.life;
      kit.audio.sfx('banner_sting', { volume: 0.16, rate: 1 });
    }

    showBanner(text, color, duration) {
      var message = String(text || '').trim();
      if (!message) return;
      this.banner.queue.push({
        text: message,
        color: color || 0x5de5d1,
        life: Math.min(1, Math.max(0.2, duration || 1))
      });
      if (this.banner.queue.length > 6) this.banner.queue.shift();
      this.advanceBanner();
    }

    /* ------------------------------------------------------------ loop */
    update(dt) {
      if (this.phase === 'boot-error') return;
      var juiceFrame = kit.juice.frame();
      this.juiceFrame = juiceFrame;
      if (juiceFrame.frozen) { this.render(); return; }
      this.accumulator += Math.min(0.034, Math.max(0, safeNumber(dt, 0) / 1000));
      while (this.accumulator >= STEP) {
        this.stepSimulation();
        this.accumulator -= STEP;
      }
      this.render();
    }

    stepSimulation() {
      this.simClock += STEP;
      var forced = getForcedArena(debugValue('forceArena'));
      if (forced && forced !== this.arenaIndex && this.phase === 'playing') this.startArena(forced, true);
      this.coachLife = Math.max(0, this.coachLife - STEP);
      if (this.coachLife <= 0) this.advanceBanner();
      if (this.phase === 'playing' && this.banner.life > 0 && this.coachLife <= 0) this.banner.life = Math.max(0, this.banner.life - STEP);
      this.damagePulse = Math.max(0, this.damagePulse - STEP * 2.8);
      if (this.celebration > 0) this.celebration = Math.max(0, this.celebration + STEP * (this.celebration < 1 ? 3 : -0.9));
      var i;
      for (i = 0; i < this.blasts.length; i += 1) this.blasts[i].life -= STEP;
      this.blasts = this.blasts.filter(function (blast) { return blast.life > 0; });
      for (i = 0; i < this.shocks.length; i += 1) this.shocks[i].life -= STEP;
      this.shocks = this.shocks.filter(function (shock) { return shock.life > 0; });
      if (this.walls) for (i = 0; i < this.walls.length; i += 1) this.walls[i].drop = Math.max(0, this.walls[i].drop - STEP * 4);
      this.updateParticles();
      this.updateBlocks();
      if (this.phase === 'playing') {
        this.readInput();
        this.rebuildDanger();
        this.updatePlayer();
        this.updateBombs();
        this.updateChasers();
        this.updateHazards();
        this.updateQuake();
        this.updateCompression();
        this.checkContact();
        this.checkClear();
        this.updateMusicLayer();
        if (this.mode === 'score-attack') {
          this.timeLeft = Math.max(0, this.timeLeft - STEP);
          this.arenaTime += STEP;
          if (this.timeLeft <= 0) this.endRun(false, 'TIME');
        } else {
          this.arenaTime += STEP;
          if (this.mode === 'duel' && this.arenaTime > 90) this.finishDuelRound(this.survivingSeat());
        }
      } else if (this.phase === 'life-lost') this.updateLifeLost();
      this.refreshDebug();
    }

    refreshDebug() {
      BR_DEBUG_STATE.mode = this.mode;
      BR_DEBUG_STATE.score = Math.floor(this.score);
      BR_DEBUG_STATE.lives = this.lives;
      BR_DEBUG_STATE.arena = this.arenaIndex;
      BR_DEBUG_STATE.chaserCount = this.aliveChasers();
      BR_DEBUG_STATE.phase = this.phase;
      BR_DEBUG_STATE.theme = this.theme ? this.theme.key : 'plaza';
      BR_DEBUG_STATE.family = BR_DEBUG_STATE.theme;
      BR_DEBUG_STATE.chaserTier = this.chaserTier || 'drifter';
      BR_DEBUG_STATE.personalities = this.chasers.map(function (chaser) { return chaser.type; });
      BR_DEBUG_STATE.modifiers = Object.keys(this.mods || {});
      BR_DEBUG_STATE.suddenDeath = !!(this.compression && this.compression.armed);
      BR_DEBUG_STATE.duelRound = this.mode === 'duel' ? this.duelRound : 0;
      BR_DEBUG_STATE.duelScore = this.duelScore;
      BR_DEBUG_STATE.timeLeft = this.mode === 'score-attack' ? Math.ceil(this.timeLeft) : Math.floor(this.arenaTime * 10) / 10;
      BR_DEBUG_STATE.tutorialStep = this.coachStep;
      BR_DEBUG_STATE.blocksBroken = this.blocksBroken;
      BR_DEBUG_STATE.medal = this.result ? this.result.medal : null;
      BR_DEBUG_STATE.fxOverflow = this.fxOverflow;
      BR_DEBUG_STATE.saveVersion = SAVE_VERSION;
      var target = window.__br && validObject(window.__br.state) ? window.__br.state : null;
      if (target && target !== BR_DEBUG_STATE) {
        var forcedArena = target.forceArena;
        var forcedTier = target.forceChaserTier;
        Object.assign(target, BR_DEBUG_STATE);
        target.forceArena = forcedArena;
        target.forceChaserTier = forcedTier;
      }
    }

    /* ------------------------------------------------------- particles */
    emitBurst(x, y, color, amount, systemName, opts) {
      var name = this.particleSystems[systemName] ? systemName : 'sparks';
      var pool = this.particleSystems[name];
      var options = opts || {};
      var budget = Game.quality === 'low' ? 0.55 : 1;
      var total = Math.min(34, Math.max(1, Math.round((amount || 6) * budget)));
      for (var i = 0; i < total; i += 1) {
        var particle = null;
        for (var p = 0; p < pool.items.length; p += 1) if (!pool.items[p].active) { particle = pool.items[p]; break; }
        if (!particle) {
          for (var replacement = 0; replacement < pool.items.length; replacement += 1) {
            if (!particle || pool.items[replacement].life < particle.life) particle = pool.items[replacement];
          }
          pool.overflow += 1;
          this.fxOverflow += 1;
        }
        var angle = this.random() * Math.PI * 2;
        var speed = name === 'smoke' ? 0.12 + this.random() * 0.45 : options.heavy ? 0.5 + this.random() * 1.9 : 0.35 + this.random() * 1.7;
        particle.active = true;
        particle.x = x; particle.y = y;
        particle.vx = Math.cos(angle) * speed;
        particle.vy = Math.sin(angle) * speed - (options.heavy ? 0.6 : 0);
        particle.life = name === 'smoke' ? 0.42 + this.random() * 0.38 : name === 'confetti' ? 0.7 + this.random() * 0.6 : 0.26 + this.random() * 0.42;
        particle.max = particle.life;
        particle.size = name === 'smoke' ? 2.2 + this.random() * 3.6 : options.heavy ? 2 + this.random() * 3.4 : 1.2 + this.random() * 2.8;
        particle.color = color;
        particle.kind = name;
        particle.spin = (this.random() - 0.5) * 12;
        particle.angle = this.random() * Math.PI * 2;
        particle.gravity = name === 'smoke' ? -0.2 : options.heavy || name === 'confetti' ? 3.2 : 1.1;
      }
    }

    updateParticles() {
      var moving = kit.juice.enabled;
      for (var n = 0; n < PARTICLE_SYSTEM_NAMES.length; n += 1) {
        var items = this.particleSystems[PARTICLE_SYSTEM_NAMES[n]].items;
        for (var i = 0; i < items.length; i += 1) {
          var particle = items[i];
          if (!particle.active) continue;
          particle.life -= STEP;
          if (moving) {
            particle.x += particle.vx * STEP * 6;
            particle.y += particle.vy * STEP * 6;
            particle.vy += particle.gravity * STEP;
            particle.angle += particle.spin * STEP;
          }
          particle.vx *= particle.kind === 'smoke' ? 0.985 : 0.96;
          particle.vy *= particle.kind === 'smoke' ? 0.985 : 0.97;
          if (particle.kind === 'smoke') particle.size += STEP * 2.4;
          if (particle.life <= 0) particle.active = false;
        }
      }
    }

    /* --------------------------------------------------------- render */
    worldPoint(x, y) {
      return { x: this.boardX + (x + 0.5) * this.tile, y: this.boardY + (y + 0.5) * this.tile };
    }

    entityPoint(entity) {
      if (!entity || entity.moveT >= 1) return this.worldPoint(entity ? entity.x : 1, entity ? entity.y : 1);
      var t = smooth(entity.moveT);
      return this.worldPoint(lerp(entity.fromX, entity.toX, t), lerp(entity.fromY, entity.toY, t));
    }

    takeSprite(pool, cursorName) {
      var index = this.spriteCursor[cursorName];
      if (index >= pool.length) return null;
      this.spriteCursor[cursorName] = index + 1;
      return pool[index];
    }

    hideRest(pool, used) {
      var last = pool.__used == null ? pool.length : pool.__used;
      for (var i = used; i < last; i += 1) pool[i].setVisible(false);
      pool.__used = used;
    }

    render() {
      if (!this.grid || !this.grid.length || !this.player) return;
      this.fxGraphics.clear();
      this.overlayGraphics.clear();
      this.spriteCursor = {
        block: 0, crate: 0, drop: 0, dropGlow: 0, bomb: 0, ring: 0, spark: 0,
        chaser: 0, blast: 0, shock: 0, hazard: 0, warn: 0, shadow: 0, particle: 0
      };
      var frame = this.juiceFrame || { dx: 0, dy: 0 };
      var shakeX = frame.dx || 0;
      var shakeY = frame.dy || 0;
      this.boardImage.setPosition(this.boardX + this.boardWidth / 2 + shakeX, this.boardY + this.boardHeight / 2 + shakeY);
      this.shakeX = shakeX;
      this.shakeY = shakeY;
      this.drawHazards();
      this.drawWalls();
      this.drawBlocks();
      this.drawCrates();
      this.drawDrops();
      this.drawBombs();
      this.drawChasers();
      this.drawPlayer();
      this.drawBlasts();
      this.drawParticles();
      this.hideRest(this.hazardSprites, this.spriteCursor.hazard);
      this.hideRest(this.warnSprites, this.spriteCursor.warn);
      this.hideRest(this.blockSprites, this.spriteCursor.block);
      this.hideRest(this.crateSprites, this.spriteCursor.crate);
      this.hideRest(this.dropSprites, this.spriteCursor.drop);
      this.hideRest(this.dropGlows, this.spriteCursor.dropGlow);
      this.hideRest(this.bombSprites, this.spriteCursor.bomb);
      this.hideRest(this.bombRings, this.spriteCursor.ring);
      this.hideRest(this.bombSparks, this.spriteCursor.spark);
      this.hideRest(this.chaserSprites, this.spriteCursor.chaser);
      this.hideRest(this.blastSprites, this.spriteCursor.blast);
      this.hideRest(this.shockSprites, this.spriteCursor.shock);
      this.hideRest(this.shadowSprites, this.spriteCursor.shadow);
      this.hideRest(this.particleSprites, this.spriteCursor.particle);
      this.drawOverlay();
      this.updateHud();
    }

    place(sprite, x, y, size) {
      sprite.setPosition(x + this.shakeX, y + this.shakeY);
      if (size) sprite.setDisplaySize(size, size);
      sprite.setVisible(true);
    }

    drawHazards() {
      var self = this;
      this.hazards.forEach(function (hazard, key) {
        var sprite = self.takeSprite(self.hazardSprites, 'hazard');
        if (!sprite) return;
        var parts = key.split(',');
        var point = self.worldPoint(Number(parts[0]), Number(parts[1]));
        var pulse = kit.juice.enabled ? 0.62 + 0.3 * (0.5 + 0.5 * Math.sin(self.simClock * 5 + hazard.phase)) : 0.75;
        self.place(sprite, point.x, point.y, self.tile * 0.94);
        sprite.setAlpha(pulse);
        sprite.setRotation(0);
      });
    }

    drawWalls() {
      if (!this.walls) return;
      var textureKey = 'br-block-' + (this.theme ? this.theme.key : 'plaza') + '-armor';
      for (var i = 0; i < this.walls.length; i += 1) {
        var wall = this.walls[i];
        var sprite = this.takeSprite(this.blockSprites, 'block');
        if (!sprite) return;
        var point = this.worldPoint(wall.x, wall.y);
        sprite.setTexture(textureKey);
        var drop = kit.juice.enabled ? wall.drop : 0;
        this.place(sprite, point.x, point.y - drop * this.tile * 1.4, this.tile * (0.98 + drop * 0.16));
        sprite.setAlpha(1);
        sprite.setRotation(0);
      }
    }

    drawBlocks() {
      var themeKey = this.theme ? this.theme.key : 'plaza';
      for (var i = 0; i < this.blocks.length; i += 1) {
        var block = this.blocks[i];
        if (!block.alive) continue;
        var sprite = this.takeSprite(this.blockSprites, 'block');
        if (!sprite) return;
        var visual = this.blockVisuals.get(block.id) || { flash: 0, wobble: 0 };
        var point = this.worldPoint(block.x, block.y);
        sprite.setTexture(block.armor > 0 ? 'br-block-' + themeKey + '-armor' : 'br-block-' + themeKey + '-' + block.state);
        this.place(sprite, point.x, point.y, this.tile * (0.96 - block.state * 0.03));
        sprite.setAlpha(block.state === 2 ? 0.82 : 1);
        sprite.setRotation(kit.juice.enabled ? visual.wobble * (block.state === 1 ? 0.09 : -0.07) : 0);
        if (visual.flash > 0) sprite.setTint(PhaserRef.Display.Color.GetColor(255, 255 - Math.floor(visual.flash * 60), 200));
        else sprite.clearTint();
      }
    }

    drawCrates() {
      for (var i = 0; i < this.crates.length; i += 1) {
        var sprite = this.takeSprite(this.crateSprites, 'crate');
        if (!sprite) return;
        var point = this.worldPoint(this.crates[i].x, this.crates[i].y);
        this.place(sprite, point.x, point.y, this.tile * 0.82);
        sprite.setAlpha(1);
      }
    }

    drawDrops() {
      for (var i = 0; i < this.drops.length; i += 1) {
        var drop = this.drops[i];
        var sprite = this.takeSprite(this.dropSprites, 'drop');
        var glow = this.takeSprite(this.dropGlows, 'dropGlow');
        if (!sprite) return;
        var point = this.worldPoint(drop.x, drop.y);
        var shimmer = kit.juice.enabled ? Math.sin(this.simClock * 4.2 + drop.id * 1.7) : 0;
        var bob = kit.juice.enabled ? shimmer * this.tile * 0.06 : 0;
        this.place(sprite, point.x, point.y + bob, this.tile * (0.7 + shimmer * 0.05));
        sprite.setTexture('br-drop-' + (DROP_COLORS[drop.type] ? drop.type : 'points'));
        sprite.setRotation(kit.juice.enabled ? shimmer * 0.16 : 0);
        sprite.setAlpha(1);
        if (glow) {
          glow.setTexture('br-glow');
          glow.setBlendMode(PhaserRef.BlendModes.ADD);
          glow.setTint(DROP_COLORS[drop.type] || 0x5de5d1);
          this.place(glow, point.x, point.y + bob, this.tile * (1.1 + shimmer * 0.16));
          glow.setAlpha(0.34 + shimmer * 0.14);
        }
        if (kit.juice.enabled && this.random() < 0.02) this.emitBurst(drop.x, drop.y, DROP_COLORS[drop.type] || 0x5de5d1, 1, 'pickup');
      }
    }

    drawBombs() {
      for (var i = 0; i < this.bombs.length; i += 1) {
        var bomb = this.bombs[i];
        var sprite = this.takeSprite(this.bombSprites, 'bomb');
        if (!sprite) return;
        var point = this.worldPoint(bomb.x, bomb.y);
        var fraction = clamp(bomb.fuse / (bomb.fuseMax || 1.34), 0, 1);
        var urgency = 1 - fraction;
        var pulse = kit.juice.enabled ? 1 + Math.sin(this.simClock * (8 + urgency * 22) + bomb.phase) * (0.05 + urgency * 0.09) : 1;
        var shadow = this.takeSprite(this.shadowSprites, 'shadow');
        if (shadow) {
          this.place(shadow, point.x, point.y + this.tile * 0.3, this.tile * 0.7);
          shadow.setDisplaySize(this.tile * 0.7, this.tile * 0.34);
          shadow.setAlpha(0.5);
        }
        sprite.setTexture('br-bomb-body');
        this.place(sprite, point.x, point.y, this.tile * 0.8 * pulse);
        sprite.setTint(bomb.owner === 'enemy' ? 0xffb0b8 : 0xffffff);
        sprite.setAlpha(1);
        var ring = this.takeSprite(this.bombRings, 'ring');
        if (ring) {
          var frame = Math.max(0, Math.min(16, Math.ceil(fraction * 16)));
          ring.setTexture('br-ring-' + frame);
          ring.setBlendMode(PhaserRef.BlendModes.ADD);
          this.place(ring, point.x, point.y, this.tile * 1.02);
          ring.setAlpha(0.85);
        }
        var spark = this.takeSprite(this.bombSparks, 'spark');
        if (spark) {
          var wobble = kit.juice.enabled ? Math.sin(this.simClock * 16 + bomb.phase) * this.tile * 0.05 : 0;
          this.place(spark, point.x + this.tile * 0.14 + wobble, point.y - this.tile * 0.3, this.tile * (0.24 + urgency * 0.2));
          spark.setBlendMode(PhaserRef.BlendModes.ADD);
          spark.setAlpha(0.7 + urgency * 0.3);
          if (kit.juice.enabled && this.random() < 0.25) this.emitBurst(bomb.x + 0.16, bomb.y - 0.34, 0xffd98a, 1);
        }
      }
    }

    drawChasers() {
      for (var i = 0; i < this.chasers.length; i += 1) {
        var chaser = this.chasers[i];
        if (!chaser.alive && !(chaser.deathLife > 0)) continue;
        var sprite = this.takeSprite(this.chaserSprites, 'chaser');
        if (!sprite) return;
        var point = this.entityPoint(chaser);
        var dying = !chaser.alive;
        var personality = chaser.personality || PERSONALITY_FALLBACK;
        var state = dying || chaser.stun > 0 ? 'hurt' : chaser.state === 'hunt' ? 'hunt' : chaser.state === 'alert' ? 'alert' : 'idle';
        var shadow = this.takeSprite(this.shadowSprites, 'shadow');
        if (shadow && !dying) {
          this.place(shadow, point.x, point.y + this.tile * 0.32, this.tile * 0.7);
          shadow.setDisplaySize(this.tile * 0.68, this.tile * 0.3);
          shadow.setAlpha(0.45);
        }
        var scale = personality.key === 'overlord' ? 1.32 : 1.06;
        var deathScale = dying ? 1 + (1 - chaser.deathLife / (chaser.deathMax || 0.28)) * 0.36 : 1;
        var breathe = kit.juice.enabled && !dying ? 1 + Math.sin(this.simClock * (state === 'hunt' ? 9 : 3.2) + chaser.phase) * 0.04 : 1;
        sprite.setTexture('br-bot-' + personality.key + '-' + state);
        this.place(sprite, point.x, point.y - this.tile * 0.04, this.tile * scale * deathScale * breathe);
        sprite.setAlpha(dying ? clamp(chaser.deathLife / (chaser.deathMax || 0.28), 0, 1) : 1);
        sprite.setRotation(kit.juice.enabled ? (dying ? (1 - chaser.deathLife / (chaser.deathMax || 0.28)) * 0.5 : state === 'hunt' ? Math.sin(this.simClock * 8 + chaser.phase) * 0.06 : 0) : 0);
        if (chaser.hp > 1 && !dying) {
          var g = this.overlayGraphics;
          g.fillStyle(0x1a2028, 0.9);
          g.fillRect(point.x - this.tile * 0.34 + this.shakeX, point.y - this.tile * 0.5 + this.shakeY, this.tile * 0.68, 4);
          g.fillStyle(0xff7187, 1);
          g.fillRect(point.x - this.tile * 0.34 + this.shakeX, point.y - this.tile * 0.5 + this.shakeY, this.tile * 0.68 * clamp(chaser.hp / personality.hp, 0, 1), 4);
        }
      }
    }

    drawPlayer() {
      var p = this.player;
      if (!p) { this.playerSprite.setVisible(false); this.playerShadow.setVisible(false); this.playerShield.setVisible(false); return; }
      if (p.invuln > 0 && kit.juice.enabled && Math.floor(this.simClock * 15) % 2 === 0) {
        this.playerSprite.setVisible(false);
        this.playerShadow.setVisible(false);
        this.playerShield.setVisible(false);
        return;
      }
      var point = this.playerPosition();
      var pos = this.worldPoint(point.x, point.y);
      var breathe = kit.juice.enabled ? 1 + Math.sin(p.bob * 3.4) * 0.03 : 1;
      this.playerShadow.setPosition(pos.x + this.shakeX, pos.y + this.tile * 0.32 + this.shakeY);
      this.playerShadow.setDisplaySize(this.tile * 0.7, this.tile * 0.3);
      this.playerShadow.setAlpha(0.5);
      this.playerShadow.setVisible(true);
      var texture = p.animState === 'hit' ? 'br-hero-hit' : p.animState === 'plant' ? 'br-hero-plant' : p.animState === 'move' ? 'br-hero-move' : 'br-hero-idle';
      this.playerSprite.setTexture(texture);
      this.playerSprite.setPosition(pos.x + this.shakeX, pos.y - this.tile * 0.04 + this.shakeY);
      this.playerSprite.setDisplaySize(this.tile * 1.12 * breathe, this.tile * 1.12 * breathe);
      this.playerSprite.setRotation(p.animState === 'move' && kit.juice.enabled ? Math.sin(this.simClock * 14) * 0.07 : 0);
      this.playerSprite.setVisible(true);
      if (p.shield > 0) {
        this.playerShield.setTexture('br-glow');
        this.playerShield.setTint(0x72a7ff);
        this.playerShield.setPosition(pos.x + this.shakeX, pos.y + this.shakeY);
        var ring = this.tile * (1.15 + p.shield * 0.06) * (kit.juice.enabled ? 1 + Math.sin(this.simClock * 6) * 0.04 : 1);
        this.playerShield.setDisplaySize(ring, ring);
        this.playerShield.setAlpha(0.42);
        this.playerShield.setVisible(true);
      } else this.playerShield.setVisible(false);
    }

    drawBlasts() {
      var i;
      var c;
      for (i = 0; i < this.blasts.length; i += 1) {
        var blast = this.blasts[i];
        var fraction = clamp(blast.life / blast.max, 0, 1);
        var alpha = fraction > 0.7 ? 1 : fraction / 0.7;
        for (c = 0; c < blast.cells.length; c += 1) {
          var cell = blast.cells[c];
          var sprite = this.takeSprite(this.blastSprites, 'blast');
          if (!sprite) break;
          var point = this.worldPoint(cell.x, cell.y);
          sprite.setTexture(cell.role === 'core' ? 'br-blast-core' : cell.role === 'cap' ? 'br-blast-cap' : 'br-blast-arm');
          sprite.setBlendMode(PhaserRef.BlendModes.ADD);
          var swell = cell.role === 'core' ? 1.18 - fraction * 0.16 : 1.02;
          this.place(sprite, point.x, point.y, this.tile * swell);
          sprite.setRotation(cell.role === 'core' ? 0 : cell.angle);
          sprite.setTint(blast.color);
          sprite.setAlpha(alpha);
        }
      }
      for (i = 0; i < this.shocks.length; i += 1) {
        var shock = this.shocks[i];
        var shockSprite = this.takeSprite(this.shockSprites, 'shock');
        if (!shockSprite) break;
        var t = 1 - clamp(shock.life / shock.max, 0, 1);
        var point2 = this.worldPoint(shock.x, shock.y);
        var size = this.tile * (0.8 + t * (2.2 + shock.radius * 0.9));
        shockSprite.setTexture('br-shock');
        shockSprite.setBlendMode(PhaserRef.BlendModes.ADD);
        this.place(shockSprite, point2.x, point2.y, size);
        shockSprite.setTint(shock.color);
        shockSprite.setAlpha((1 - t) * 0.75);
      }
    }

    drawParticles() {
      for (var n = 0; n < PARTICLE_SYSTEM_NAMES.length; n += 1) {
        var name = PARTICLE_SYSTEM_NAMES[n];
        var items = this.particleSystems[name].items;
        var texture = PARTICLE_TEXTURE[name] || 'br-p-spark';
        var additive = name === 'sparks' || name === 'pickup';
        for (var i = 0; i < items.length; i += 1) {
          var particle = items[i];
          if (!particle.active) continue;
          var sprite = this.takeSprite(this.particleSprites, 'particle');
          if (!sprite) return;
          var point = this.worldPoint(particle.x, particle.y);
          var alpha = clamp(particle.life / particle.max, 0, 1);
          sprite.setTexture(texture);
          sprite.setBlendMode(additive ? PhaserRef.BlendModes.ADD : PhaserRef.BlendModes.NORMAL);
          var size = particle.size * (name === 'smoke' ? 2.6 * (1.4 - alpha * 0.4) : 1.9);
          this.place(sprite, point.x, point.y, size);
          sprite.setTint(particle.color);
          sprite.setAlpha(name === 'smoke' ? alpha * 0.4 : alpha);
          sprite.setRotation(particle.angle || 0);
        }
      }
    }

    drawOverlay() {
      var g = this.overlayGraphics;
      var width = viewW();
      var height = viewH();
      var top = Game.insets.top + 8;
      if (this.damagePulse > 0) {
        var damageAlpha = 0.06 + this.damagePulse * 0.2;
        g.fillStyle(0xff3153, damageAlpha * 0.5);
        g.fillRect(0, top + 92, width, height - top - 92);
        g.fillStyle(0xff3153, damageAlpha * 1.6);
        g.fillRect(0, top + 92, 14, height - top - 92);
        g.fillRect(width - 14, top + 92, 14, height - top - 92);
        g.fillRect(0, top + 92, width, 12);
        g.fillRect(0, height - 14, width, 14);
      }
      if (this.compression && this.compression.armed && this.phase === 'playing') {
        var pulse = kit.juice.enabled ? 0.2 + 0.14 * (0.5 + 0.5 * Math.sin(this.simClock * 4)) : 0.24;
        g.lineStyle(3, 0xff6c63, pulse);
        g.strokeRect(this.boardX - 3, this.boardY - 3, this.boardWidth + 6, this.boardHeight + 6);
        var next = this.compression.path[this.compression.index];
        if (next) {
          var warn = this.takeSprite(this.warnSprites, 'warn');
          if (warn) {
            var wp = this.worldPoint(next.x, next.y);
            this.place(warn, wp.x, wp.y, this.tile * 0.96);
            warn.setAlpha(0.5 + (kit.juice.enabled ? 0.35 * (0.5 + 0.5 * Math.sin(this.simClock * 9)) : 0.2));
          }
        }
      }
      var activePlay = this.phase === 'playing';
      var coachVisible = activePlay && this.coachStep < 4 && this.coachLife > 0;
      var coachAlpha = this.coachLife > 0.8 ? 0.92 : 0.1 + this.coachLife / 0.8 * 0.82;
      this.coachStrip.setVisible(coachVisible).setAlpha(coachVisible ? coachAlpha : 0);
      if (coachVisible) {
        g.fillStyle(0xffc45d, 0.9 * coachAlpha);
        g.fillRoundedRect(16, top + 72, width - 32, 28, 8);
        g.lineStyle(1, 0xfff0c2, 0.5 * coachAlpha);
        g.strokeRoundedRect(16, top + 72, width - 32, 28, 8);
      }
      var chipVisible = activePlay && this.coachLife <= 0 && this.banner.life > 0;
      this.bannerText.setVisible(chipVisible);
      if (chipVisible) {
        setTextIfChanged(this.bannerText, this.banner.text);
        var chipAlpha = this.banner.life < 0.16 ? this.banner.life / 0.16 : 1;
        var chipW = Math.min(width - 32, Math.max(108, this.bannerText.width + 26));
        var chipH = 30;
        var chipY = top + 86;
        g.fillStyle(0x02090d, 0.5 * chipAlpha);
        g.fillRoundedRect((width - chipW) / 2, chipY - chipH / 2 + 2, chipW, chipH, 9);
        g.fillStyle(this.banner.color, 0.92 * chipAlpha);
        g.fillRoundedRect((width - chipW) / 2, chipY - chipH / 2, chipW, chipH, 9);
        g.lineStyle(1, 0xffffff, 0.28 * chipAlpha);
        g.strokeRoundedRect((width - chipW) / 2, chipY - chipH / 2, chipW, chipH, 9);
        this.bannerText.setPosition(width / 2, chipY).setAlpha(chipAlpha);
      }
      if (this.phase === 'result') {
        g.fillStyle(0x030a10, 0.7);
        g.fillRect(0, top + 92, width, height - top - 92);
      }
    }

    updateActionLabels() {
      if (!this.actionButtons || !this.player) return;
      setTextIfChanged(this.actionButtons[0].buttonText, 'BOMB x' + this.player.bombsMax);
      setTextIfChanged(this.actionButtons[1].buttonText, this.player.kick ? 'KICK ON' : 'KICK');
      setTextIfChanged(this.actionButtons[2].buttonText, this.mods.jammer ? 'JAMMED' : 'REMOTE');
      this.actionButtons[1].setAlpha(this.player.kick ? 1 : 0.55);
      this.actionButtons[2].setAlpha(this.player.remote && !this.mods.jammer ? 1 : 0.55);
    }

    updateHud() {
      setTextIfChanged(this.hudScore, String(Math.floor(this.score)).padStart(6, '0'));
      setTextIfChanged(this.hudLoadout, 'B' + this.player.bombsMax + '  R' + this.player.radius + '  >' + this.player.speedLevel +
        '  S' + this.player.shield + '  P' + this.player.pierce);
      setTextIfChanged(this.hudArena, this.mode === 'duel' ? ('DUEL R' + this.duelRound) : 'A' + String(this.arenaIndex).padStart(2, '0'));
      setTextIfChanged(this.hudTimer, this.mode === 'score-attack'
        ? '0:' + String(Math.ceil(this.timeLeft)).padStart(2, '0')
        : Math.floor(this.arenaTime) + 's');
      this.hudTimer.setColor(this.compression && this.compression.armed ? '#ff8a7a' : '#ffc45d');
      setTextIfChanged(this.hudLives, this.mode === 'duel'
        ? (this.duelScore[0] + ' - ' + (this.duelScore[1] + this.duelScore[2] + this.duelScore[3]) + '  o' + this.aliveChasers())
        : 'HP' + this.lives + '  o' + this.aliveChasers());
      this.updateActionLabels();
    }
  }

  /* ------------------------------------------------------------- boot */
  var config = {
    type: PhaserRef.AUTO,
    parent: document.body,
    backgroundColor: '#061018',
    /* Size the backing store in DEVICE pixels and scale the canvas back
     * down in CSS, so an iPhone gets a 2x or 3x dense frame instead of an
     * upscaled 1x one. The old `resolution` key was removed after Phaser
     * 3.16 and silently does nothing, so it is not used here. */
    scale: {
      mode: PhaserRef.Scale.NONE,
      width: Math.round(window.innerWidth * DPR),
      height: Math.round(window.innerHeight * DPR),
      zoom: 1 / DPR
    },
    render: { antialias: true, antialiasGL: false, powerPreference: 'high-performance', roundPixels: false, batchSize: 4096 },
    fps: { target: 60, min: 30 },
    scene: [BootScene, TitleScene, PlayScene]
  };

  Game.phaser = new PhaserRef.Game(config);

  function applyViewport() {
    if (!Game.phaser || !Game.phaser.scale || !Game.phaser.scale.canvas) return;
    Game.canvasRect = null;
    Game.phaser.scale.resize(Math.round(window.innerWidth * DPR), Math.round(window.innerHeight * DPR));
    Game.phaser.scale.setZoom(1 / DPR);
    var canvas = Game.phaser.canvas;
    if (canvas) {
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    }
  }
  window.addEventListener('resize', applyViewport);
  window.addEventListener('orientationchange', function () { setTimeout(applyViewport, 60); });
  Game.phaser.events.once('ready', applyViewport);

  kit.registerPWA();
  window.__BR_READY = true;
  window.__BR_GAME = Game;
  window.__br.kit = kit;
  window.__br.dpr = DPR;
  window.__br.migratedFrom = migratedFrom;
  window.__br.scene = function () { return Game.play; };
}());
