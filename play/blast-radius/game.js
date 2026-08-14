/* Blast Radius - AAA arcade rebuild
 * Phaser 3 is the renderer. GGKit owns lifecycle, input, save, audio, PWA,
 * pause, settings, and accessibility state. Gameplay advances on a fixed
 * stepped clock so a slow frame becomes slow motion instead of a time skip.
 */
(function () {
  'use strict';

  var PhaserRef = window.Phaser;
  var KitRef = window.GGKit;
  var STEP = 1 / 60;
  var COLS = 11;
  var ROWS = 13;
  var MAX_PARTICLES = 220;
  var MAX_BLASTS = 32;
  var MAX_BLOCK_SPRITES = COLS * ROWS;
  var MAX_CHASER_SPRITES = 8;
  var MAX_BOMB_SPRITES = 24;
  var MAX_DROP_SPRITES = 64;
  var MAX_CRATE_SPRITES = 12;
  var MAX_BLAST_CELL_SPRITES = 96;
  var PARTICLE_POOL_SIZES = { sparks: 84, debris: 54, smoke: 42, pickup: 40 };
  var PARTICLE_SYSTEM_NAMES = ['sparks', 'debris', 'smoke', 'pickup'];
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
  var DROP_COLORS = {
    bomb: 0x5de5d1,
    radius: 0xffbd58,
    boots: 0xff6d9e,
    shield: 0x72a7ff,
    points: 0xd69bff,
    life: 0xff6c63,
    kick: 0xb696ff,
    remote: 0x87e6ff
  };
  var DROP_LABELS = {
    bomb: '+B', radius: 'R', boots: '>>', shield: 'S', points: '$',
    life: '+1', kick: 'K', remote: 'R'
  };
  var TIER_KEYS = ['wander', 'hunt', 'ambush-flank'];

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function smooth(t) { return t * t * (3 - 2 * t); }

  function keyOf(x, y) { return x + ',' + y; }

  function validObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function setTextIfChanged(textObject, value) {
    if (!textObject) return;
    var next = String(value);
    if (textObject.text !== next) textObject.setText(next);
  }

  function safeNumber(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
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

  function seeded(seed) {
    var value = seed >>> 0;
    return function () {
      value = (value + 0x6D2B79F5) >>> 0;
      var t = Math.imul(value ^ (value >>> 15), 1 | value);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
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

  var FAMILIES = {
    plaza: {
      key: 'plaza', name: 'SUNKEN PLAZA', short: 'OPEN PLAZA',
      color: 0x4ee5cc, density: 0.27, gimmick: 'MOVABLE CRATES',
      shortcut: 'WEST SERVICE CUT', baseTier: 'wander'
    },
    warren: {
      key: 'warren', name: 'MAZE WARREN', short: 'TIGHT WARREN',
      color: 0xc6a1ff, density: 0.51, gimmick: 'ONE-WAY GAPS',
      shortcut: 'NORTH LOOP', baseTier: 'hunt'
    },
    vault: {
      key: 'vault', name: 'SYMMETRICAL VAULT', short: 'MIRROR VAULT',
      color: 0xffc35e, density: 0.43, gimmick: 'PULSE HAZARDS',
      shortcut: 'CENTER CROSS', baseTier: 'hunt'
    },
    nest: {
      key: 'nest', name: 'CHASER NEST', short: 'NEST COMPLEX',
      color: 0xff7187, density: 0.56, gimmick: 'NEST GATES',
      shortcut: 'EAST FLANK', baseTier: 'ambush-flank'
    },
    boss: {
      key: 'boss', name: 'BOSS VAULT', short: 'THE VAULT',
      color: 0xffdd72, density: 0.60, gimmick: 'CORE HAZARDS',
      shortcut: 'LOWER BYPASS', baseTier: 'ambush-flank'
    }
  };

  var FAMILY_FALLBACK = FAMILIES.plaza;
  var ARENAS = [
    { id: 1, family: 'plaza', title: 'FIRST CONTACT', tier: 'wander', count: 2, goldTime: 38, silverTime: 55, goldBlocks: 16, silverBlocks: 10 },
    { id: 2, family: 'warren', title: 'CROSSED WIRES', tier: 'hunt', count: 3, goldTime: 45, silverTime: 65, goldBlocks: 24, silverBlocks: 16 },
    { id: 3, family: 'vault', title: 'MIRROR LOCK', tier: 'hunt', count: 4, goldTime: 52, silverTime: 75, goldBlocks: 30, silverBlocks: 20 },
    { id: 4, family: 'nest', title: 'HOT NEST', tier: 'ambush-flank', count: 5, goldTime: 58, silverTime: 84, goldBlocks: 36, silverBlocks: 24 },
    { id: 5, family: 'boss', title: 'BOSS VAULT', tier: 'ambush-flank', count: 4, goldTime: 78, silverTime: 105, goldBlocks: 42, silverBlocks: 30, boss: true }
  ];

  function familyFor(value) {
    return FAMILIES[value] || FAMILY_FALLBACK;
  }

  function arenaFor(value) {
    var index = Math.floor(Number(value));
    if (!isFinite(index) || index < 1 || index > ARENAS.length) return ARENAS[0];
    return ARENAS[index - 1] || ARENAS[0];
  }

  function tierFor(value, fallback) {
    return TIER_KEYS.indexOf(value) >= 0 ? value : fallback;
  }

  function getForcedArena(value) {
    if (typeof value === 'string') {
      for (var i = 0; i < ARENAS.length; i += 1) {
        if (ARENAS[i].family === value || familyFor(ARENAS[i].family).key === value) return ARENAS[i].id;
      }
    }
    var number = Number(value);
    return isFinite(number) && number >= 1 && number <= ARENAS.length ? Math.floor(number) : null;
  }

  var BR_DEBUG_STATE = {
    mode: 'title', score: 0, lives: 3, arena: 1, chaserCount: 0,
    phase: 'title', family: 'plaza', chaserTier: 'wander', timeLeft: 0,
    forceArena: null, forceChaserTier: null, tutorialStep: 0,
    blocksBroken: 0, medal: null, fxOverflow: 0
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

  function validateSave(save) {
    if (!validObject(save) || save.version !== 1) return false;
    if (!Number.isInteger(save.unlocked) || save.unlocked < 1 || save.unlocked > ARENAS.length) return false;
    if (!validObject(save.medals) || !validObject(save.bestTimes)) return false;
    if (typeof save.tutorialDone !== 'boolean') return false;
    if (!Number.isFinite(save.bestScore) || save.bestScore < 0 || save.bestScore > 1e9) return false;
    var medalKeys = Object.keys(save.medals);
    for (var i = 0; i < medalKeys.length; i += 1) {
      if (!/^[1-5]$/.test(medalKeys[i]) || ['bronze', 'silver', 'gold'].indexOf(save.medals[medalKeys[i]]) < 0) return false;
    }
    var timeKeys = Object.keys(save.bestTimes);
    for (var j = 0; j < timeKeys.length; j += 1) {
      if (!/^[1-5]$/.test(timeKeys[j]) || !Number.isFinite(save.bestTimes[timeKeys[j]]) || save.bestTimes[timeKeys[j]] < 0) return false;
    }
    return true;
  }

  function defaultSave() {
    return { version: 1, unlocked: 1, medals: {}, bestTimes: {}, tutorialDone: false, bestScore: 0 };
  }

  var Game = { phaser: null, play: null, insets: readInsets() };
  var kit = null;

  if (!PhaserRef || !KitRef) {
    BR_DEBUG_STATE.phase = 'boot-error';
    return;
  }

  kit = KitRef.create({
    slug: 'blast-radius',
    orientation: 'portrait',
    validateSave: validateSave,
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
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) kit.juice.enabled = false;
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

  var profile = kit.save.get(defaultSave());
  if (!validateSave(profile)) profile = defaultSave();
  function persist() { kit.save.set(profile); }

  function claimPointer(pointer, zone) {
    if (!kit || !kit.input || !kit.input.pointers || !pointer) return;
    var id = pointer.id != null ? pointer.id : pointer.pointerId;
    if (id == null) id = 0;
    var event = pointer.event || {};
    var x = safeNumber(event.clientX, safeNumber(pointer.x, 0));
    var y = safeNumber(event.clientY, safeNumber(pointer.y, 0));
    var point = kit.input.pointers.get(id);
    if (!point) {
      point = { x: x, y: y, startX: x, startY: y, downAt: Date.now(), zone: zone || null };
      kit.input.pointers.set(id, point);
    } else {
      point.x = x; point.y = y; point.zone = zone || point.zone;
    }
  }

  function makeButton(scene, label, callback, opts) {
    var options = opts || {};
    var container = scene.add.container(0, 0);
    var background = scene.add.graphics();
    var text = scene.add.text(0, 0, label, {
      fontFamily: 'Arial, sans-serif', fontSize: options.fontSize || '12px',
      fontStyle: 'bold', color: options.textColor || '#07131b',
      align: 'center', letterSpacing: 1
    }).setOrigin(0.5);
    container.add([background, text]);
    container.buttonText = text;
    container.buttonBackground = background;
      container.buttonWidth = options.width || 150;
      container.buttonHeight = options.height || 44;
      container.buttonHitWidth = Math.max(48, options.hitWidth || container.buttonWidth);
      container.buttonHitHeight = Math.max(48, options.hitHeight || container.buttonHeight);
      container.buttonEnabled = true;
    container.layout = function (x, y, width, height) {
      container.setPosition(x, y);
      container.buttonWidth = width || container.buttonWidth;
      container.buttonHeight = height || container.buttonHeight;
      container.buttonHitWidth = Math.max(48, container.buttonWidth);
      container.buttonHitHeight = Math.max(48, container.buttonHeight);
      background.clear();
      background.fillStyle(options.fill || 0x5de5d1, options.alpha == null ? 1 : options.alpha);
      background.fillRoundedRect(-container.buttonWidth / 2, -container.buttonHeight / 2, container.buttonWidth, container.buttonHeight, options.radius || 12);
      if (options.stroke) {
        background.lineStyle(1, options.stroke, 0.9);
        background.strokeRoundedRect(-container.buttonWidth / 2, -container.buttonHeight / 2, container.buttonWidth, container.buttonHeight, options.radius || 12);
      }
      container.setSize(container.buttonHitWidth, container.buttonHitHeight);
      container.setInteractive(new PhaserRef.Geom.Rectangle(-container.buttonHitWidth / 2, -container.buttonHitHeight / 2, container.buttonHitWidth, container.buttonHitHeight), PhaserRef.Geom.Rectangle.Contains);
      container.input.enabled = container.buttonEnabled;
      return container;
    };
    container.setEnabled = function (enabled) {
      container.buttonEnabled = !!enabled;
      container.setAlpha(enabled ? 1 : 0.3);
      if (container.input) container.input.enabled = !!enabled;
    };
    container.on('pointerdown', function (pointer) {
      claimPointer(pointer, 'button');
      if (container.input && container.input.enabled !== false && callback) callback();
    });
    container.on('pointerover', function () { if (container.input && container.input.enabled !== false) container.setScale(1.025); });
    container.on('pointerout', function () { container.setScale(1); });
    container.setDepth(options.depth || 10);
    container.layout(0, 0, container.buttonWidth, container.buttonHeight);
    return container;
  }

  function setButtonVisible(button, visible) {
    if (!button) return;
    button.setVisible(!!visible);
    button.setEnabled(!!visible);
  }

  function destroyList(list) {
    for (var i = 0; i < list.length; i += 1) if (list[i] && list[i].destroy) list[i].destroy(true);
    list.length = 0;
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

  class BootScene extends PhaserRef.Scene {
    constructor() { super({ key: 'boot' }); }
    preload() {
      var images = {
        'br-player-idle': 'assets/player_idle.svg',
        'br-player-move': 'assets/player_move.svg',
        'br-player-hit': 'assets/player_hit.svg',
        'br-chaser-idle': 'assets/chaser_idle.svg',
        'br-chaser-hunt': 'assets/chaser_hunt.svg',
        'br-chaser-hit': 'assets/chaser_hit.svg',
        'br-chaser-boss': 'assets/chaser_boss.svg',
        'br-bomb': 'assets/bomb.svg',
        'br-blast': 'assets/blast.svg',
        'br-block-intact': 'assets/block_intact.svg',
        'br-block-crumble-a': 'assets/block_crumble_a.svg',
        'br-block-crumble-b': 'assets/block_crumble_b.svg',
        'br-crate': 'assets/crate.svg',
        'br-drop': 'assets/drop.svg'
      };
      Object.keys(images).forEach(function (key) { this.load.image(key, images[key]); }, this);
    }
    create() {
      this.cameras.main.setBackgroundColor('#061018');
      BR_DEBUG_STATE.phase = 'boot';
      this.scene.start('title');
    }
  }

  class TitleScene extends PhaserRef.Scene {
    constructor() { super({ key: 'title' }); }
    create() {
      this.ui = [];
      BR_DEBUG_STATE.mode = 'title';
      BR_DEBUG_STATE.phase = 'title';
      this.background = this.add.graphics();
      this.title = this.add.text(0, 0, 'BLAST\nRADIUS', {
        fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '38px',
        fontStyle: 'bold', color: '#e9fbf5', align: 'center', lineSpacing: -8,
        shadow: { offsetX: 0, offsetY: 0, color: '#43e0c9', blur: 16, stroke: true, fill: true }
      }).setOrigin(0.5);
      this.kicker = this.add.text(0, 0, 'GRID ARENA / BOMB LAYER', {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', fontStyle: 'bold',
        color: '#72a8aa', letterSpacing: 2
      }).setOrigin(0.5);
      this.copy = this.add.text(0, 0, 'Break the line. Chain the blast.\nOutrun what wakes up.', {
        fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#a7c7c2',
        align: 'center', lineSpacing: 6
      }).setOrigin(0.5);
      this.section = this.add.text(0, 0, 'CAMPAIGN / SELECT A SECTOR', {
        fontFamily: 'Arial, sans-serif', fontSize: '10px', fontStyle: 'bold',
        color: '#6a989b', letterSpacing: 1.5
      }).setOrigin(0.5);
      this.progress = this.add.text(0, 0, '', {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#c4e2d9', align: 'center'
      }).setOrigin(0.5);
      this.modeButtons = [];
      this.buildButtons();
      this.scale.on('resize', this.layout, this);
      this.layout();
    }
    buildButtons() {
      var self = this;
      for (var i = 0; i < ARENAS.length; i += 1) {
        (function (arena) {
          var family = familyFor(arena.family);
          var unlocked = arena.id <= profile.unlocked;
          var medal = profile.medals[String(arena.id)] || 'LOCKED';
          var button = makeButton(self, 'A' + String(arena.id).padStart(2, '0') + '  ' + family.short + '\n' + medal.toUpperCase(), function () {
            if (arena.id <= profile.unlocked) self.startCampaign(arena.id);
          }, {
            width: 164, height: 48, fill: unlocked ? family.color : 0x1b3039,
            textColor: unlocked ? '#07131b' : '#78979b', stroke: unlocked ? 0xd3fff3 : 0x304953,
            radius: 10, fontSize: '10px'
          });
          button.setEnabled(unlocked);
          self.modeButtons.push(button);
        }(ARENAS[i]));
      }
      this.scoreButton = makeButton(this, 'SCORE ATTACK\n90 SECOND RUN', function () {
        self.scene.start('play', { mode: 'score-attack', arena: 1 });
      }, { width: 164, height: 50, fill: 0x5c8dff, textColor: '#07131b', stroke: 0xbdd4ff, fontSize: '10px' });
      this.bossButton = makeButton(this, 'BOSS VAULT\nFINALE', function () {
        if (profile.unlocked >= 5) self.scene.start('play', { mode: 'boss-vault', arena: 5 });
      }, { width: 164, height: 50, fill: 0xffc45d, textColor: '#1b1210', stroke: 0xfff1b0, fontSize: '10px' });
      this.bossButton.setEnabled(profile.unlocked >= 5);
      this.settingsButton = makeButton(this, 'SETTINGS', function () { kit.openSettings(); }, {
        width: 118, height: 34, fill: 0x17313a, textColor: '#b9d9d2', stroke: 0x3c6870, fontSize: '10px'
      });
      this.ui.push.apply(this.ui, this.modeButtons);
      this.ui.push(this.scoreButton, this.bossButton, this.settingsButton);
    }
    startCampaign(arena) {
      if (arena > profile.unlocked) return;
      kit.input.clearAll();
      this.scene.start('play', { mode: 'campaign', arena: arena });
    }
    layout() {
      var width = this.scale.width;
      var height = this.scale.height;
      var top = Game.insets.top + 12;
      this.background.clear();
      this.background.fillGradientStyle(0x0b2630, 0x061018, 0x07131c, 0x040b12, 1);
      this.background.fillRect(0, 0, width, height);
      for (var i = 0; i < 20; i += 1) {
        this.background.fillStyle(i % 3 === 0 ? 0x5de5d1 : 0x345b68, 0.09);
        this.background.fillCircle((i * 83 + 28) % width, (i * 137 + top) % height, 1 + (i % 3));
      }
      this.title.setPosition(width / 2, top + 68);
      this.kicker.setPosition(width / 2, top + 16);
      this.copy.setPosition(width / 2, top + 142);
      this.section.setPosition(width / 2, top + 190);
      var gridY = top + 222;
      var gap = 8;
      var colW = Math.min(164, (width - 40 - gap) / 2);
      for (var b = 0; b < this.modeButtons.length; b += 1) {
        var col = b % 2;
        var row = Math.floor(b / 2);
        this.modeButtons[b].layout(width / 2 - colW / 2 - gap / 2 + col * (colW + gap), gridY + row * 55, colW, 48);
      }
      var lowerY = gridY + 3 * 55 + 12;
      this.progress.setPosition(width / 2, lowerY + 62);
      setTextIfChanged(this.progress, profile.unlocked >= 5 ? 'ALL SECTORS OPEN / BOSS VAULT READY' : 'SECTOR ' + String(profile.unlocked).padStart(2, '0') + ' IS YOUR NEXT UNLOCK');
      this.scoreButton.layout(width / 2 - colW / 2 - gap / 2, lowerY, colW, 50);
      this.bossButton.layout(width / 2 + colW / 2 + gap / 2, lowerY, colW, 50);
      this.settingsButton.layout(width / 2, Math.min(height - Game.insets.bottom - 25, lowerY + 112), 118, 34);
    }
  }

  class PlayScene extends PhaserRef.Scene {
    constructor() { super({ key: 'play' }); }

    create(data) {
      Game.play = this;
      this.ui = [];
      this.data = data || {};
      this.mode = ['campaign', 'score-attack', 'boss-vault'].indexOf(this.data.mode) >= 0 ? this.data.mode : 'campaign';
      var forcedArena = getForcedArena(debugValue('forceArena'));
      this.arenaIndex = forcedArena || Math.max(1, Math.min(profile.unlocked, Number(this.data.arena) || 1));
      if (this.mode === 'boss-vault' && !forcedArena) this.arenaIndex = 5;
      this.score = 0;
      this.lives = 3;
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
      this.drops = [];
      this.bombs = [];
      this.blasts = [];
      this.chasers = [];
      this.particleSystems = {
        sparks: makeParticlePool(PARTICLE_POOL_SIZES.sparks),
        debris: makeParticlePool(PARTICLE_POOL_SIZES.debris),
        smoke: makeParticlePool(PARTICLE_POOL_SIZES.smoke),
        pickup: makeParticlePool(PARTICLE_POOL_SIZES.pickup)
      };
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
      this.musicLayer = null;
      this.tutorialDodgeArmed = false;
      this.tutorialDodgeCell = null;
      this.tutorialTelegraphClock = 0;
      this.buildDisplay();
      this.bindInput();
      this.scale.on('resize', this.layout, this);
      this.layout();
      this.startArena(this.arenaIndex, true);
    }

    buildDisplay() {
      this.background = this.add.graphics();
      this.boardGraphics = this.add.graphics();
      this.fxGraphics = this.add.graphics();
      this.overlayGraphics = this.add.graphics();
      this.boardGraphics.setDepth(1);
      this.fxGraphics.setDepth(3);
      this.overlayGraphics.setDepth(6);
      this.fxGraphics.setBlendMode(PhaserRef.BlendModes.ADD);
      this.blockSprites = makeSpritePool(this, 'br-block-intact', MAX_BLOCK_SPRITES, 2);
      this.crateSprites = makeSpritePool(this, 'br-crate', MAX_CRATE_SPRITES, 2);
      this.dropSprites = makeSpritePool(this, 'br-drop', MAX_DROP_SPRITES, 2);
      this.bombSprites = makeSpritePool(this, 'br-bomb', MAX_BOMB_SPRITES, 2);
      this.chaserSprites = makeSpritePool(this, 'br-chaser-idle', MAX_CHASER_SPRITES, 2);
      this.blastSprites = makeSpritePool(this, 'br-blast', MAX_BLAST_CELL_SPRITES, 3);
      this.playerSprite = this.add.image(0, 0, 'br-player-idle').setVisible(false).setDepth(4);
      this.playerSprite.setOrigin(0.5);
      this.hudTitle = this.add.text(0, 0, '', {
        fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#e5faf2', letterSpacing: 1
      }).setOrigin(0, 0.5);
      this.hudMode = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '9px', fontStyle: 'bold', color: '#5de5d1', letterSpacing: 1 }).setOrigin(0, 0.5);
      this.hudScore = this.add.text(0, 0, '', { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#f0fcf6' }).setOrigin(0, 0.5);
      this.hudLoadout = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#9fc6bf', letterSpacing: 0.5 }).setOrigin(0, 0.5);
      this.hudArena = this.add.text(0, 0, '', { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#bbd6d1', align: 'center' }).setOrigin(0.5, 0.5);
      this.hudTimer = this.add.text(0, 0, '', { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#ffc45d', align: 'right' }).setOrigin(1, 0.5);
      this.hudLives = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#ff7887', align: 'right' }).setOrigin(1, 0.5);
      this.hudRule = this.add.graphics();
      this.gimmick = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '9px', fontStyle: 'bold', color: '#769b9f', letterSpacing: 1, align: 'center' }).setOrigin(0.5).setVisible(false);
      this.coachStrip = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#07131b', align: 'center', padding: { left: 6, right: 6, top: 4, bottom: 4 } }).setOrigin(0.5);
      this.coachBackground = this.add.graphics();
      this.bannerText = this.add.text(0, 0, '', { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#07131b', align: 'center' }).setOrigin(0.5);
      this.resultTitle = this.add.text(0, 0, '', { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#edfff6', align: 'center' }).setOrigin(0.5);
      this.resultCopy = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#b7d6d0', align: 'center', lineSpacing: 5 }).setOrigin(0.5);
      this.modeLabel = this.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#6d9a9e', align: 'center', letterSpacing: 1.5 }).setOrigin(0.5).setVisible(false);
      [this.hudTitle, this.hudMode, this.hudScore, this.hudLoadout, this.hudArena, this.hudTimer, this.hudLives, this.hudRule, this.gimmick].forEach(function (object) { object.setDepth(7); });
      this.actionButtons = [];
      var self = this;
      this.actionButtons.push(makeButton(this, 'BOMB', function () { self.placeBomb(); }, { width: 96, height: 48, fill: 0xffc45d, textColor: '#19140a', stroke: 0xffedab, radius: 20, fontSize: '14px' }));
      this.actionButtons.push(makeButton(this, 'KICK', function () { self.toggleKick(); }, { width: 96, height: 48, fill: 0x2b4550, textColor: '#b9dcd3', stroke: 0x557c83, radius: 20, fontSize: '14px' }));
      this.actionButtons.push(makeButton(this, 'REMOTE', function () { self.remoteDetonate(); }, { width: 96, height: 48, fill: 0x2b4550, textColor: '#b9dcd3', stroke: 0x557c83, radius: 20, fontSize: '14px' }));
      this.continueButton = makeButton(this, 'CONTINUE', function () { self.continueFromResult(); }, { width: 152, height: 44, fill: 0x5de5d1, textColor: '#07131b', stroke: 0xc6fff1, fontSize: '11px' });
      this.menuButton = makeButton(this, 'QUIT TO MENU', function () { self.goToMenu(); }, { width: 152, height: 48, fill: 0x17313a, textColor: '#b9dcd3', stroke: 0x3f6971, fontSize: '10px' });
      this.settingsButton = makeButton(this, '⋮', function () { kit.openSettings(); }, { width: 34, height: 30, fill: 0x17313a, textColor: '#b9dcd3', stroke: 0x3f6971, radius: 8, fontSize: '16px' });
      this.ui.push.apply(this.ui, this.actionButtons);
      this.ui.push(this.continueButton, this.menuButton, this.settingsButton);
      setButtonVisible(this.continueButton, false);
      setButtonVisible(this.menuButton, false);
      this.settingsButton.setDepth(10);
      this.coachBackground.setDepth(4);
      this.coachStrip.setDepth(5);
      this.bannerText.setDepth(8);
      this.resultTitle.setDepth(7);
      this.resultCopy.setDepth(7);
      this.modeLabel.setDepth(7);
      this.hudTitle.setVisible(false);
      this.hudMode.setVisible(false);
    }

    bindInput() {
      var self = this;
      this.input.on('pointerdown', function (pointer) {
        claimPointer(pointer, 'move');
        if (self.isActionBand(pointer.y)) return;
        var event = pointer.event || {};
        self.touch = { id: pointer.id, x: safeNumber(event.clientX, pointer.x), y: safeNumber(event.clientY, pointer.y), anchorX: pointer.x, anchorY: pointer.y, isDown: true };
      });
      this.input.on('pointermove', function (pointer) {
        if (!self.touch || pointer.id !== self.touch.id || !pointer.isDown) return;
        var dx = pointer.x - self.touch.anchorX;
        var dy = pointer.y - self.touch.anchorY;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
        if (Math.abs(dx) > Math.abs(dy)) self.queueMove(dx > 0 ? DIRS[0] : DIRS[1]);
        else self.queueMove(dy > 0 ? DIRS[2] : DIRS[3]);
        self.touch.anchorX = pointer.x;
        self.touch.anchorY = pointer.y;
      });
      this.input.on('pointerup', function (pointer) { if (self.touch && pointer.id === self.touch.id) { self.touch.isDown = false; self.touch = null; } });
      this.input.on('pointercancel', function (pointer) { if (self.touch && pointer.id === self.touch.id) { self.touch.isDown = false; self.touch = null; } });
    }

    isActionBand(y) {
      return y > this.scale.height - Game.insets.bottom - 74;
    }

    layout() {
      var width = this.scale.width;
      var height = this.scale.height;
      var top = Game.insets.top + 8;
      var bottom = Game.insets.bottom + 14;
      var boardTop = top + 104;
      var controlsTop = height - bottom - 52;
      var usableBoardHeight = Math.max(ROWS * 16, controlsTop - boardTop - 8);
      var tile = Math.max(16, Math.min((width - 24) / COLS, usableBoardHeight / ROWS));
      this.tile = tile;
      this.boardWidth = tile * COLS;
      this.boardHeight = tile * ROWS;
      this.boardX = (width - this.boardWidth) / 2;
      this.boardY = boardTop;
      this.actionY = height - bottom - 26;
      this.background.clear();
      this.background.fillGradientStyle(0x0b2731, 0x061018, 0x07141e, 0x040b12, 1);
      this.background.fillRect(0, 0, width, height);
      this.background.fillStyle(0x50dfcd, 0.05);
      for (var i = 0; i < 14; i += 1) this.background.fillCircle((i * 117 + 20) % width, (i * 89 + top) % height, 1 + (i % 2));
      this.hudScore.setPosition(16, top + 18);
      this.hudLoadout.setPosition(16, top + 42);
      this.hudArena.setPosition(width / 2, top + 18);
      this.hudTimer.setPosition(width - 16, top + 16);
      this.hudLives.setPosition(width - 16, top + 42);
      this.hudRule.clear();
      this.hudRule.lineStyle(1, 0x2e515b, 0.9);
      this.hudRule.lineBetween(16, top + 58, width - 16, top + 58);
      this.coachBackground.clear();
      this.coachBackground.fillStyle(0xffc45d, 0.86);
      this.coachBackground.fillRoundedRect(16, top + 66, width - 32, 28, 6);
      this.coachStrip.setPosition(width / 2, top + 80);
      var buttonGap = 7;
      var buttonW = Math.min(96, (width - 48) / 3);
      var firstX = width / 2 - buttonW - buttonGap;
      for (var b = 0; b < this.actionButtons.length; b += 1) this.actionButtons[b].layout(firstX + b * (buttonW + buttonGap), this.actionY, buttonW, 48);
      this.settingsButton.layout(width / 2, top + 42, 34, 30);
      this.resultTitle.setPosition(width / 2, this.boardY + this.boardHeight * 0.56);
      this.resultCopy.setPosition(width / 2, this.boardY + this.boardHeight * 0.56 + 40);
      this.continueButton.layout(width / 2, Math.min(height - bottom - 94, this.boardY + this.boardHeight * 0.76), Math.min(152, width - 60), 44);
      this.menuButton.layout(width / 2, Math.min(height - bottom - 46, this.boardY + this.boardHeight * 0.76 + 54), Math.min(152, width - 60), 48);
    }

    startArena(index, announce) {
      var forced = getForcedArena(debugValue('forceArena'));
      if (forced) index = forced;
      var arena = arenaFor(index);
      var family = familyFor(arena.family);
      var carryLoadout = this.mode === 'score-attack' && this.player ? {
        radius: this.player.radius,
        bombsMax: this.player.bombsMax,
        speedLevel: this.player.speedLevel,
        kick: this.player.kick,
        remote: this.player.remote,
        shield: this.player.shield
      } : null;
      this.arenaIndex = arena.id;
      this.arenaConfig = arena;
      this.family = family;
      this.random = seeded((0xB17A5E + arena.id * 0x9E3779B9 + (this.mode === 'score-attack' ? 0x5000 : 0)) >>> 0);
      this.grid = Array.from({ length: ROWS }, function () { return Array.from({ length: COLS }, function () { return { kind: 'floor', blockId: 0 }; }); });
      this.blocks = [];
      this.blocksBroken = 0;
      this.blockByKey.clear();
      this.blockVisuals.clear();
      this.crates = [];
      this.oneWays.clear();
      this.hazards.clear();
      this.drops = [];
      this.bombs = [];
      this.blasts = [];
      this.chasers = [];
      this.detonationQueue = [];
      this.chainLevel = 0;
      this.arenaTime = 0;
      this.tutorialDodgeArmed = false;
      this.tutorialDodgeCell = null;
      this.buildLayout(family, arena.id);
      this.player = {
        x: 1, y: 1, fromX: 1, fromY: 1, toX: 1, toY: 1, moveT: 1,
        moveDuration: 0.12, radius: 2, bombsMax: 1, speedLevel: 0,
        kick: false, remote: false, shield: 0, invuln: 0, hitTimer: 0,
        animState: 'idle', coachMovePending: false, lastDir: DIRS[0]
      };
      if (carryLoadout) Object.assign(this.player, carryLoadout);
      this.spawnChasers(arena, family);
      this.phase = 'playing';
      this.phaseClock = 0;
      this.result = null;
      this.resultTitle.setVisible(false);
      this.resultCopy.setVisible(false);
      setButtonVisible(this.continueButton, false);
      setButtonVisible(this.menuButton, false);
      for (var i = 0; i < this.actionButtons.length; i += 1) setButtonVisible(this.actionButtons[i], true);
      var announceText = arena.title;
      if (this.mode === 'score-attack') announceText = 'SCORE ATTACK';
      if (this.mode === 'boss-vault') announceText = 'BOSS VAULT';
      this.updateCoach();
      if (announce) this.showBanner(announceText, '', family.color, 0.9);
      this.updateMusicLayer();
      this.refreshDebug();
    }

    buildLayout(family, arenaId) {
      var self = this;
      function hard(x, y) {
        if (!self.inBounds(x, y)) return;
        if (self.grid[y][x].kind === 'block') {
          var oldBlock = self.blockByKey.get(keyOf(x, y));
          if (oldBlock) oldBlock.alive = false;
          self.blockByKey.delete(keyOf(x, y));
        }
        self.grid[y][x] = { kind: 'hard', blockId: 0 };
      }
      function clear(x, y) {
        if (!self.inBounds(x, y)) return;
        if (self.grid[y][x].kind === 'block') {
          var oldBlock = self.blockByKey.get(keyOf(x, y));
          if (oldBlock) oldBlock.alive = false;
          self.blockByKey.delete(keyOf(x, y));
        }
        self.grid[y][x] = { kind: 'floor', blockId: 0 };
      }
      function block(x, y) {
        if (!self.inBounds(x, y) || (x === 1 && y === 1) || x <= 1 && y <= 2 || x === 2 && y === 1) return;
        var cell = self.grid[y][x];
        if (cell.kind !== 'floor') return;
        var dropRoll = self.random();
        var dropType = null;
        if (dropRoll < 0.08) dropType = 'bomb';
        else if (dropRoll < 0.18) dropType = 'radius';
        else if (dropRoll < 0.28) dropType = 'boots';
        else if (dropRoll < 0.37) dropType = 'shield';
        else if (dropRoll < 0.47) dropType = 'points';
        else if (dropRoll < 0.53) dropType = 'life';
        else if (dropRoll < 0.62) dropType = 'kick';
        else if (dropRoll < 0.70) dropType = 'remote';
        var item = { id: self.blockSerial++, x: x, y: y, state: 0, timer: 0, dropType: dropType, alive: true };
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
        self.hazards.set(keyOf(x, y), { phase: self.random() * 4 });
      }
      for (var y = 0; y < ROWS; y += 1) {
        for (var x = 0; x < COLS; x += 1) {
          if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) hard(x, y);
          else if (x % 2 === 0 && y % 2 === 0 && family.key !== 'plaza') hard(x, y);
        }
      }
      var density = clamp(family.density + (arenaId - 1) * 0.025, 0.22, 0.70);
      for (var yy = 1; yy < ROWS - 1; yy += 1) {
        for (var xx = 1; xx < COLS - 1; xx += 1) {
          if (self.grid[yy][xx].kind !== 'floor') continue;
          var safeLane = xx <= 2 && yy <= 3 || yy === 1 || xx === 1;
          var laneBias = family.key === 'warren' && (xx === 3 || yy === 5) ? 0.14 : 0;
          if (!safeLane && self.random() < density + laneBias) block(xx, yy);
        }
      }
      clear(1, 1); clear(2, 1); clear(1, 2); clear(3, 1); clear(1, 3);
      if (family.key === 'plaza') {
        for (var px = 3; px <= 7; px += 1) { clear(px, 5); clear(px, 7); }
        for (var c = 0; c < 5; c += 1) {
          var cx = 4 + (c % 2) * 3;
          var cy = 4 + Math.floor(c / 2) * 3;
          if (self.grid[cy][cx].kind === 'floor') self.crates.push({ id: c + 1, x: cx, y: cy, homeX: cx, homeY: cy });
        }
        for (var sy = 2; sy < ROWS - 2; sy += 1) clear(2, sy);
        oneWay(2, 6, 1, 0); oneWay(2, 7, 1, 0);
      } else if (family.key === 'warren') {
        for (var wx = 2; wx < COLS - 2; wx += 2) { hard(wx, 3); hard(wx, 9); }
        for (var wy = 4; wy < ROWS - 3; wy += 2) { hard(3, wy); hard(7, wy); }
        clear(5, 3); clear(5, 9); clear(5, 5); clear(5, 7);
        oneWay(5, 3, 0, 1); oneWay(5, 9, 0, -1); oneWay(5, 6, 1, 0);
      } else if (family.key === 'vault') {
        for (var vx = 3; vx <= 7; vx += 1) { hard(vx, 4); hard(vx, 8); }
        for (var vy = 5; vy <= 7; vy += 1) { hard(3, vy); hard(7, vy); }
        clear(5, 4); clear(5, 8); clear(3, 6); clear(7, 6); clear(5, 6);
        hazard(4, 5); hazard(6, 5); hazard(4, 7); hazard(6, 7);
        oneWay(5, 4, 0, 1); oneWay(5, 8, 0, -1);
      } else if (family.key === 'nest') {
        for (var nx = 2; nx <= 8; nx += 3) { hard(nx, 4); hard(nx, 8); }
        for (var ny = 4; ny <= 8; ny += 4) { clear(5, ny); }
        hazard(3, 3); hazard(7, 3); hazard(3, 9); hazard(7, 9);
        oneWay(9, 6, -1, 0); oneWay(8, 6, -1, 0);
      } else {
        for (var bx = 3; bx <= 7; bx += 2) { hard(bx, 5); hard(bx, 7); }
        for (var by = 4; by <= 8; by += 2) { hard(3, by); hard(7, by); }
        clear(5, 5); clear(5, 7); clear(3, 6); clear(7, 6); clear(5, 6);
        hazard(4, 5); hazard(6, 5); hazard(4, 7); hazard(6, 7);
        oneWay(5, 9, 0, -1); oneWay(6, 9, 0, -1);
      }
      var safety = [[1, 1], [2, 1], [1, 2], [3, 1], [1, 3]];
      for (var si = 0; si < safety.length; si += 1) clear(safety[si][0], safety[si][1]);
    }

    spawnChasers(arena, family) {
      var count = arena.count;
      if (this.mode === 'score-attack') count = Math.min(7, count + Math.floor(this.arenaIndex / 2));
      var forcedTier = tierFor(debugValue('forceChaserTier'), arena.tier || family.baseTier);
      this.chaserTier = forcedTier;
      var candidates = [];
      for (var y = 1; y < ROWS - 1; y += 1) {
        for (var x = 1; x < COLS - 1; x += 1) {
          if (this.isWalkable(x, y, false) && Math.abs(x - 1) + Math.abs(y - 1) > 7 && !this.hazards.has(keyOf(x, y))) candidates.push({ x: x, y: y });
        }
      }
      for (var i = 0; i < count && candidates.length; i += 1) {
        var index = Math.floor(this.random() * candidates.length);
        var spot = candidates.splice(index, 1)[0];
        var isBoss = !!arena.boss && i === 0;
        this.chasers.push({
          id: this.chaserSerial++, x: spot.x, y: spot.y, fromX: spot.x, fromY: spot.y,
          toX: spot.x, toY: spot.y, moveT: 1, cooldown: 0.35 + this.random() * 0.25,
          type: isBoss ? 'boss' : forcedTier, state: 'idle', stun: 0, hp: isBoss ? 4 : 1,
          alive: true, dir: DIRS[i % DIRS.length], phase: this.random() * 4,
          homeX: spot.x, homeY: spot.y, intentX: spot.x, intentY: spot.y
        });
      }
      if (arena.boss && this.chasers.length) this.chasers[0].type = 'boss';
    }

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
      if (p.hitTimer <= 0 && p.moveT >= 1) p.animState = 'idle';
      if (p.moveT < 1) {
        p.moveT = Math.min(1, p.moveT + STEP / p.moveDuration);
        if (p.moveT >= 1) {
          p.x = p.toX; p.y = p.toY;
          p.animState = p.hitTimer > 0 ? 'hit' : 'idle';
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

    placeBomb() {
      var p = this.player;
      if (!p || this.phase !== 'playing' || p.moveT < 1) return;
      if (this.bombs.filter(function (bomb) { return bomb.owner === 'player' && !bomb.exploded; }).length >= p.bombsMax || this.bombAt(p.x, p.y)) {
        this.emitBurst(p.x, p.y, 0xff7187, 3);
        return;
      }
      this.bombs.push({ id: this.bombSerial++, x: p.x, y: p.y, fuse: 1.34, radius: p.radius, owner: 'player', exploded: false, slide: null, phase: this.random() * 6 });
      this.emitBurst(p.x, p.y, 0xffc45d, 6);
      kit.audio.sfx('fuse_tick', { volume: 0.55, rate: 0.9 });
      this.coachEvent('bomb');
    }

    placeEnemyBomb(chaser) {
      if (!chaser || this.bombAt(chaser.x, chaser.y)) return;
      if (this.bombs.length >= 20) return;
      var bomb = { id: this.bombSerial++, x: chaser.x, y: chaser.y, fuse: 1.7, radius: 2, owner: 'enemy', exploded: false, slide: null, phase: this.random() * 6 };
      this.bombs.push(bomb);
      if (this.coachStep === 3 && this.mode === 'campaign' && this.arenaIndex === 1) {
        this.tutorialDodgeArmed = true;
        this.tutorialDodgeCell = { x: bomb.x, y: bomb.y };
      }
      this.emitBurst(chaser.x, chaser.y, 0xff7187, 4);
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
      return true;
    }

    toggleKick() {
      if (this.player && this.player.kick) this.player.kick = !this.player.kick;
      this.updateActionLabels();
    }

    remoteDetonate() {
      if (!this.player || !this.player.remote || this.phase !== 'playing') return;
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
      for (var i = 0; i < this.bombs.length; i += 1) {
        var bomb = this.bombs[i];
        if (bomb.exploded) continue;
        if (bomb.slide) {
          bomb.slide.clock -= STEP;
          if (bomb.slide.clock <= 0) {
            bomb.slide.clock = 0.10;
            var nx = bomb.x + bomb.slide.dx;
            var ny = bomb.y + bomb.slide.dy;
            if (this.canEnter(nx, ny, bomb.slide, true) && !this.crateAt(nx, ny)) {
              bomb.x = nx; bomb.y = ny;
            } else bomb.slide = null;
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
      var cells = [{ x: bomb.x, y: bomb.y }];
      var touchedBombs = [];
      var self = this;
      function inspect(x, y) {
        if (!self.inBounds(x, y)) return false;
        var cell = self.grid[y][x];
        if (cell.kind === 'hard') return false;
        cells.push({ x: x, y: y });
        var other = self.bombAt(x, y);
        if (other && other !== bomb && touchedBombs.indexOf(other) < 0) touchedBombs.push(other);
        if (cell.kind === 'block') { self.damageBlock(x, y); return false; }
        if (self.crateAt(x, y)) return false;
        return true;
      }
      for (var d = 0; d < DIRS.length; d += 1) {
        var dir = DIRS[d];
        for (var distance = 1; distance <= bomb.radius; distance += 1) {
          if (!inspect(bomb.x + dir.dx * distance, bomb.y + dir.dy * distance)) break;
        }
      }
      for (var b = 0; b < touchedBombs.length; b += 1) this.queueDetonation(touchedBombs[b]);
      for (var c = 0; c < cells.length; c += 1) this.applyBlastCell(cells[c], bomb);
      var blast = { id: this.blastSerial++, cells: cells, life: 0.38, max: 0.38, chain: chain, color: bomb.owner === 'enemy' ? 0xff7187 : 0xffc45d };
      this.blasts.push(blast);
      if (this.blasts.length > MAX_BLASTS) this.blasts.splice(0, this.blasts.length - MAX_BLASTS);
      this.emitBurst(bomb.x, bomb.y, blast.color, 16 + chain * 4);
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
        if (chaser.type === 'boss' && chaser.hp > 1) {
          chaser.hp -= 1; chaser.stun = 1.2; chaser.state = 'stunned';
          this.emitBurst(chaser.x, chaser.y, 0xffdd72, 18);
          kit.audio.sfx('chaser_growl', { volume: 0.42, rate: 0.72 });
        } else this.defeatChaser(chaser);
      }
    }

    damageBlock(x, y) {
      var block = this.blockByKey.get(keyOf(x, y));
      if (!block || !block.alive || block.state > 0) return;
      block.state = 1;
      block.timer = 0.10;
      var visual = this.blockVisuals.get(block.id);
      if (visual) { visual.flash = 1; visual.wobble = 0.2; }
      this.emitBurst(x, y, 0xb68d68, 9, 'debris');
    }

    updateBlocks() {
      for (var i = 0; i < this.blocks.length; i += 1) {
        var block = this.blocks[i];
        var visual = this.blockVisuals.get(block.id);
        if (visual) { visual.flash = Math.max(0, visual.flash - STEP * 5); visual.wobble = Math.max(0, visual.wobble - STEP); }
        if (!block.alive || block.state <= 0) continue;
        block.timer -= STEP;
        if (block.state === 1 && block.timer <= 0) { block.state = 2; block.timer = 0.09; }
        else if (block.state === 2 && block.timer <= 0) {
          block.alive = false;
          if (this.grid[block.y] && this.grid[block.y][block.x].kind === 'block') this.grid[block.y][block.x] = { kind: 'floor', blockId: 0 };
          this.blockByKey.delete(keyOf(block.x, block.y));
          this.blocksBroken += 1;
          if (block.dropType) this.drops.push({ id: this.dropSerial++, x: block.x, y: block.y, type: block.dropType, life: 0 });
          this.emitBurst(block.x, block.y, 0xffbd75, 12, 'debris');
        }
      }
    }

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
      if (type === 'bomb') p.bombsMax = Math.min(5, p.bombsMax + 1);
      else if (type === 'radius') p.radius = Math.min(6, p.radius + 1);
      else if (type === 'boots') p.speedLevel = Math.min(4, p.speedLevel + 1);
      else if (type === 'shield') p.shield = Math.min(2, p.shield + 1);
      else if (type === 'points') this.score += 75;
      else if (type === 'life') this.lives = Math.min(5, this.lives + 1);
      else if (type === 'kick') p.kick = true;
      else if (type === 'remote') p.remote = true;
      this.score += type === 'points' ? 0 : 25;
      var dropMessage = type === 'points' ? '+75' : '+' + type.toUpperCase();
      this.showBanner(dropMessage, '', DROP_COLORS[type] || 0x5de5d1, 0.8);
      this.emitBurst(p.x, p.y, DROP_COLORS[type] || 0x5de5d1, 18, 'pickup');
      kit.audio.sfx('pickup_chime', { volume: 0.72, rate: 0.86 + this.random() * 0.3 });
      this.updateActionLabels();
    }

    updateChasers() {
      var player = this.player;
      if (!player) return;
      if (this.coachStep === 3 && this.mode === 'campaign' && this.arenaIndex === 1 &&
          !this.tutorialDodgeArmed && this.arenaTime > 4.5) {
        for (var trainerIndex = 0; trainerIndex < this.chasers.length; trainerIndex += 1) {
          if (this.chasers[trainerIndex].alive) { this.placeEnemyBomb(this.chasers[trainerIndex]); break; }
        }
      }
      for (var i = 0; i < this.chasers.length; i += 1) {
        var chaser = this.chasers[i];
        if (!chaser.alive) {
          chaser.deathLife = Math.max(0, chaser.deathLife - STEP);
          continue;
        }
        if (chaser.stun > 0) {
          chaser.stun = Math.max(0, chaser.stun - STEP);
          chaser.state = 'stunned';
          if (chaser.stun === 0) chaser.state = 'idle';
          continue;
        }
        chaser.cooldown -= STEP;
        if (chaser.moveT < 1) {
          chaser.moveT = Math.min(1, chaser.moveT + STEP / 0.16);
          if (chaser.moveT >= 1) { chaser.x = chaser.toX; chaser.y = chaser.toY; this.checkContact(); }
          continue;
        }
        if (chaser.cooldown > 0) continue;
        var delay = chaser.type === 'wander' ? 0.48 : chaser.type === 'hunt' ? 0.34 : chaser.type === 'boss' ? 0.29 : 0.30;
        chaser.cooldown = delay - Math.min(0.12, this.arenaIndex * 0.012) + this.random() * 0.09;
        if (chaser.type === 'boss' && this.random() < 0.14) this.placeEnemyBomb(chaser);
        var step = this.chooseChaserStep(chaser);
        if (step) this.startChaserMove(chaser, step.dx, step.dy);
        this.checkContact();
      }
    }

    chooseChaserStep(chaser) {
      var p = this.player;
      if (!p) return null;
      var step = null;
      if (chaser.type === 'wander') {
        if (this.random() < 0.58 && this.canChaserEnter(chaser.x + chaser.dir.dx, chaser.y + chaser.dir.dy, chaser)) step = chaser.dir;
        else step = DIRS[Math.floor(this.random() * DIRS.length)];
        chaser.state = 'idle';
      } else if (chaser.type === 'hunt' || chaser.type === 'boss') {
        step = this.nextStepToward(chaser.x, chaser.y, p.x, p.y, chaser);
        chaser.state = 'hunt';
        if (!step && chaser.type === 'boss') step = DIRS[Math.floor(this.random() * DIRS.length)];
      } else {
        var flank = { x: p.x - (p.lastDir ? p.lastDir.dx * 2 : 2), y: p.y - (p.lastDir ? p.lastDir.dy * 2 : 2) };
        if (!this.isWalkable(flank.x, flank.y, true)) flank = { x: p.x + 2, y: p.y };
        step = this.nextStepToward(chaser.x, chaser.y, flank.x, flank.y, chaser);
        chaser.state = 'hunt';
        chaser.intentX = flank.x; chaser.intentY = flank.y;
      }
      if (!step || !this.canChaserEnter(chaser.x + step.dx, chaser.y + step.dy, chaser)) {
        chaser.state = chaser.stun > 0 ? 'stunned' : 'idle';
        return null;
      }
      chaser.dir = step;
      return step;
    }

    canChaserEnter(x, y, except, direction) {
      var dir = direction || (except && except.x != null ? { dx: x - except.x, dy: y - except.y } : null);
      return this.canEnter(x, y, dir, true) && !this.chaserAt(x, y, except);
    }

    startChaserMove(chaser, dx, dy) {
      var x = chaser.x + dx;
      var y = chaser.y + dy;
      if (!this.canChaserEnter(x, y, chaser)) return;
      chaser.fromX = chaser.x; chaser.fromY = chaser.y; chaser.toX = x; chaser.toY = y; chaser.moveT = 0;
    }

    nextStepToward(startX, startY, targetX, targetY, except) {
      if (!this.inBounds(targetX, targetY)) return null;
      var queue = [{ x: startX, y: startY }];
      var seen = new Set([keyOf(startX, startY)]);
      var parent = new Map();
      while (queue.length) {
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

    defeatChaser(chaser) {
      if (!chaser || !chaser.alive) return;
      var points = chaser.type === 'boss' ? 1200 : chaser.type === 'ambush-flank' ? 250 : 150;
      chaser.alive = false;
      chaser.state = 'death';
      chaser.deathLife = chaser.type === 'boss' ? 0.38 : 0.26;
      this.score += points;
      this.emitBurst(chaser.x, chaser.y, chaser.type === 'boss' ? 0xffdd72 : 0xff7187, chaser.type === 'boss' ? 40 : 22, 'sparks');
      this.emitBurst(chaser.x, chaser.y, 0x9baabd, chaser.type === 'boss' ? 18 : 9, 'smoke');
      kit.juice.shake(chaser.type === 'boss' ? 13 : 6, chaser.type === 'boss' ? 260 : 120);
      kit.audio.sfx(chaser.type === 'boss' ? 'blast_chain' : 'chaser_growl', { volume: 0.75, rate: chaser.type === 'boss' ? 0.62 : 1.05 });
      kit.audio.sfx('score_ping', { volume: 0.42, rate: chaser.type === 'boss' ? 0.72 : 1.12 });
      this.spawnBonusDrop(chaser.x, chaser.y, chaser.type === 'boss' ? 'life' : (this.random() < 0.7 ? 'points' : 'radius'));
    }

    spawnBonusDrop(x, y, type) {
      this.drops.push({ id: this.dropSerial++, x: x, y: y, type: type, life: 0 });
      this.emitBurst(x, y, DROP_COLORS[type] || 0x5de5d1, 8, 'pickup');
    }

    checkContact() {
      var p = this.player;
      if (!p || this.phase !== 'playing' || p.invuln > 0) return;
      var pos = this.playerPosition();
      for (var i = 0; i < this.chasers.length; i += 1) {
        var chaser = this.chasers[i];
        if (chaser.alive && Math.abs(chaser.x - pos.x) < 0.52 && Math.abs(chaser.y - pos.y) < 0.52) { this.hurtPlayer('chaser'); return; }
      }
      for (var b = 0; b < this.blasts.length; b += 1) {
        if (this.blasts[b].cells.some(function (cell) { return cell.x === p.x && cell.y === p.y; })) { this.hurtPlayer('blast'); return; }
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
        p.shield -= 1; p.invuln = 0.8; this.emitBurst(p.x, p.y, 0x72a7ff, 20); kit.audio.sfx('pickup_chime', { volume: 0.52, rate: 0.55 }); return;
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
      if (this.lives <= 0) this.endRun(false, 'RUN OVER');
      else {
        this.phase = 'life-lost';
        this.phaseClock = 0.92;
        this.showBanner('HIT · ' + (reason === 'blast' ? 'BLAST' : 'CHASER'), '', 0xff7187, 0.8);
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

    updateMusicLayer() {
      if (this.phase !== 'playing' && this.phase !== 'life-lost') return;
      var danger = this.lives <= 1 || this.aliveChasers() >= 4 || this.arenaIndex >= 4 ||
        (this.mode === 'score-attack' && this.timeLeft <= 20);
      var target = danger ? 'music_heat' : 'music_base';
      if (target === this.musicLayer) return;
      this.musicLayer = target;
      kit.audio.music(target, 450);
    }

    checkClear() {
      if (this.phase !== 'playing') return;
      if (this.mode === 'score-attack') {
        if (this.aliveChasers() === 0) {
          this.score += 400 + this.blocksBroken * 4;
          var timeBonus = 8 + Math.min(10, Math.floor(this.blocksBroken / 4));
          this.timeLeft = Math.min(90, this.timeLeft + timeBonus);
          this.startArena(this.arenaIndex >= ARENAS.length ? 1 : this.arenaIndex + 1, false);
          this.showBanner('+' + timeBonus + ' SEC', '', this.family.color, 0.8);
        }
      } else if (this.aliveChasers() === 0) this.finishArena();
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
        if (!profile.bestTimes[String(arena.id)] || this.arenaTime < profile.bestTimes[String(arena.id)]) profile.bestTimes[String(arena.id)] = Math.round(this.arenaTime * 10) / 10;
        profile.unlocked = Math.max(profile.unlocked, Math.min(ARENAS.length, arena.id + 1));
        persist();
      }
      profile.bestScore = Math.max(profile.bestScore, this.score);
      persist();
      kit.audio.sfx('banner_sting', { volume: 0.74, rate: medal === 'gold' ? 1.15 : 0.95 });
      this.coachEvent('clear');
      this.clearTransient();
      this.updateResultCopy();
      this.resultTitle.setVisible(true);
      this.resultCopy.setVisible(true);
      for (var i = 0; i < this.actionButtons.length; i += 1) setButtonVisible(this.actionButtons[i], false);
      setButtonVisible(this.continueButton, true);
      setButtonVisible(this.menuButton, true);
    }

    endRun(won, title) {
      this.phase = 'result';
      this.result = { won: !!won, medal: null, arena: this.arenaIndex };
      profile.bestScore = Math.max(profile.bestScore, this.score);
      persist();
      this.clearTransient();
      this.updateResultCopy();
      this.resultTitle.setVisible(true);
      this.resultCopy.setVisible(true);
      for (var i = 0; i < this.actionButtons.length; i += 1) setButtonVisible(this.actionButtons[i], false);
      setButtonVisible(this.continueButton, true);
      setButtonVisible(this.menuButton, true);
    }

    updateResultCopy() {
      if (!this.result) return;
      if (this.result.won) {
        setTextIfChanged(this.resultTitle, this.result.medal ? this.result.medal.toUpperCase() + ' MEDAL' : 'RUN COMPLETE');
        setTextIfChanged(this.resultCopy, 'ARENA ' + String(this.arenaIndex).padStart(2, '0') + ' / ' + this.blocksBroken + ' BLOCKS BROKEN\nSCORE ' + this.score + '  /  ' + this.family.short);
        setTextIfChanged(this.continueButton.buttonText, this.mode === 'campaign' && this.arenaIndex < ARENAS.length ? 'NEXT ARENA' : 'RUN IT BACK');
      } else {
        setTextIfChanged(this.resultTitle, 'RUN OVER');
        setTextIfChanged(this.resultCopy, 'SCORE ' + this.score + '\nThe fuse always leaves a way out.');
        setTextIfChanged(this.continueButton.buttonText, 'RUN IT BACK');
      }
    }

    continueFromResult() {
      kit.input.clearAll();
      if (this.result && this.result.won && this.mode === 'campaign' && this.arenaIndex < ARENAS.length) this.startArena(this.arenaIndex + 1, true);
      else if (this.mode === 'boss-vault') this.scene.start('title');
      else if (this.mode === 'score-attack') this.scene.start('play', { mode: 'score-attack', arena: 1 });
      else this.scene.start('play', { mode: this.mode, arena: this.arenaIndex });
    }

    goToMenu() { kit.input.clearAll(); this.scene.start('title'); }

    restartRun() {
      kit.input.clearAll();
      this.touch = null;
      this.gamepadDir = null;
      this.scene.restart({ mode: this.mode, arena: this.arenaIndex });
    }

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
      if (this.coachStep === 0) copy = 'SWIPE / WASD: MOVE';
      else if (this.coachStep === 1) copy = 'BOMB, THEN STEP AWAY';
      else if (this.coachStep === 2) copy = 'SECOND BOMB: CHAIN';
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

    showBanner(text, sub, color, duration) {
      var message = String(text || sub || '').trim();
      if (!message) return;
      this.banner.queue.push({
        text: message,
        color: color || 0x5de5d1,
        life: Math.min(1, Math.max(0.2, duration || 1))
      });
      if (this.banner.queue.length > 8) this.banner.queue.shift();
      this.advanceBanner();
    }

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
      for (var i = 0; i < this.blasts.length; i += 1) this.blasts[i].life -= STEP;
      this.blasts = this.blasts.filter(function (blast) { return blast.life > 0; });
      this.updateParticles();
      this.updateBlocks();
      if (this.phase === 'playing') {
        this.readInput();
        var forcedTier = tierFor(debugValue('forceChaserTier'), this.arenaConfig ? this.arenaConfig.tier : 'wander');
        if (forcedTier !== this.chaserTier) {
          this.chaserTier = forcedTier;
          for (var tierIndex = 0; tierIndex < this.chasers.length; tierIndex += 1) {
            if (this.chasers[tierIndex].type !== 'boss') this.chasers[tierIndex].type = forcedTier;
          }
        }
        this.updatePlayer();
        this.updateBombs();
        this.updateChasers();
        this.checkContact();
        this.checkClear();
        this.updateMusicLayer();
        if (this.mode === 'score-attack') {
          this.timeLeft = Math.max(0, this.timeLeft - STEP);
          if (this.timeLeft <= 0) this.endRun(false, 'TIME');
        } else this.arenaTime += STEP;
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
      BR_DEBUG_STATE.family = this.family ? this.family.key : 'plaza';
      BR_DEBUG_STATE.chaserTier = this.chaserTier || 'wander';
      BR_DEBUG_STATE.timeLeft = this.mode === 'score-attack' ? Math.ceil(this.timeLeft) : Math.floor(this.arenaTime * 10) / 10;
      BR_DEBUG_STATE.tutorialStep = this.coachStep;
      BR_DEBUG_STATE.blocksBroken = this.blocksBroken;
      BR_DEBUG_STATE.medal = this.result ? this.result.medal : null;
      BR_DEBUG_STATE.fxOverflow = this.fxOverflow;
      var target = window.__br && validObject(window.__br.state) ? window.__br.state : null;
      if (target && target !== BR_DEBUG_STATE) {
        var forcedArena = target.forceArena;
        var forcedTier = target.forceChaserTier;
        Object.assign(target, BR_DEBUG_STATE);
        target.forceArena = forcedArena;
        target.forceChaserTier = forcedTier;
      }
    }

    emitBurst(x, y, color, amount, systemName) {
      var name = systemName || 'sparks';
      var pool = this.particleSystems[name] || this.particleSystems.sparks;
      var total = Math.min(34, amount || 6);
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
        var speed = name === 'smoke' ? 0.12 + this.random() * 0.45 : 0.35 + this.random() * 1.7;
        particle.active = true;
        particle.x = x; particle.y = y; particle.vx = Math.cos(angle) * speed; particle.vy = Math.sin(angle) * speed;
        particle.life = name === 'smoke' ? 0.42 + this.random() * 0.38 : 0.26 + this.random() * 0.42;
        particle.max = particle.life; particle.size = name === 'smoke' ? 2.2 + this.random() * 3.6 : 1.2 + this.random() * 2.8;
        particle.color = color; particle.kind = name;
      }
    }

    updateParticles() {
      for (var n = 0; n < PARTICLE_SYSTEM_NAMES.length; n += 1) {
        var items = this.particleSystems[PARTICLE_SYSTEM_NAMES[n]].items;
        for (var i = 0; i < items.length; i += 1) {
          var particle = items[i];
          if (!particle.active) continue;
          particle.life -= STEP;
          if (kit.juice.enabled) {
            particle.x += particle.vx * STEP * 6;
            particle.y += particle.vy * STEP * 6;
          }
          particle.vx *= particle.kind === 'smoke' ? 0.985 : 0.96;
          particle.vy *= particle.kind === 'smoke' ? 0.985 : 0.96;
          if (particle.kind === 'smoke') particle.size += STEP * 2.4;
          if (particle.life <= 0) particle.active = false;
        }
      }
    }

    worldPoint(x, y) {
      return { x: this.boardX + (x + 0.5) * this.tile, y: this.boardY + (y + 0.5) * this.tile };
    }

    drawBackgroundGrid() {
      var g = this.boardGraphics;
      var x0 = this.boardX - 8;
      var y0 = this.boardY - 8;
      g.fillStyle(0x02090d, 0.76);
      g.fillRoundedRect(x0, y0, this.boardWidth + 16, this.boardHeight + 16, 16);
      g.lineStyle(1, this.family ? this.family.color : 0x5de5d1, 0.25);
      g.strokeRoundedRect(x0, y0, this.boardWidth + 16, this.boardHeight + 16, 16);
      for (var y = 0; y < ROWS; y += 1) {
        for (var x = 0; x < COLS; x += 1) {
          var px = this.boardX + x * this.tile;
          var py = this.boardY + y * this.tile;
          var cell = this.grid[y][x];
          var checker = (x + y) % 2 ? 0x102a32 : 0x0d232b;
          g.fillStyle(checker, 1);
          g.fillRect(px + 1, py + 1, this.tile - 2, this.tile - 2);
          if (cell.kind === 'hard') {
            g.fillStyle(0x1f414a, 1); g.fillRoundedRect(px + 3, py + 3, this.tile - 6, this.tile - 6, 5);
            g.fillStyle(0x4c777c, 0.6); g.fillRect(px + 7, py + 7, this.tile - 14, 2); g.fillRect(px + 7, py + 7, 2, this.tile - 14);
          } else if (cell.kind === 'hazard') {
            var hazard = this.hazards.get(keyOf(x, y));
            var pulse = kit.juice.enabled ? 0.24 + 0.16 * (0.5 + 0.5 * Math.sin(this.simClock * 5 + (hazard ? hazard.phase : 0))) : 0.32;
            g.fillStyle(0xff7187, pulse); g.fillRoundedRect(px + 4, py + 4, this.tile - 8, this.tile - 8, 5);
            g.lineStyle(1, 0xff7187, 0.56); g.strokeRect(px + 8, py + 8, this.tile - 16, this.tile - 16);
            g.fillStyle(0xffb56e, 0.8); g.fillTriangle(px + this.tile / 2, py + 8, px + this.tile - 8, py + this.tile - 8, px + 8, py + this.tile - 8);
          } else if (cell.kind === 'oneway') {
            var way = this.oneWays.get(keyOf(x, y));
            g.fillStyle(0x6d58ad, 0.38); g.fillRoundedRect(px + 4, py + 4, this.tile - 8, this.tile - 8, 5);
            g.lineStyle(1, 0xc6a1ff, 0.75); g.strokeRoundedRect(px + 5, py + 5, this.tile - 10, this.tile - 10, 4);
            g.fillStyle(0xc6a1ff, 0.95);
            if (way && way.dx > 0) g.fillTriangle(px + this.tile * 0.72, py + this.tile / 2, px + this.tile * 0.38, py + this.tile * 0.28, px + this.tile * 0.38, py + this.tile * 0.72);
            else if (way && way.dx < 0) g.fillTriangle(px + this.tile * 0.28, py + this.tile / 2, px + this.tile * 0.62, py + this.tile * 0.28, px + this.tile * 0.62, py + this.tile * 0.72);
            else if (way && way.dy > 0) g.fillTriangle(px + this.tile / 2, py + this.tile * 0.72, px + this.tile * 0.28, py + this.tile * 0.38, px + this.tile * 0.72, py + this.tile * 0.38);
            else g.fillTriangle(px + this.tile / 2, py + this.tile * 0.28, px + this.tile * 0.28, py + this.tile * 0.62, px + this.tile * 0.72, py + this.tile * 0.62);
          }
        }
      }
      for (var bi = 0; bi < this.blocks.length; bi += 1) this.drawBlock(this.blocks[bi]);
      for (var ci = 0; ci < this.crates.length; ci += 1) this.drawCrate(this.crates[ci]);
      for (var di = 0; di < this.drops.length; di += 1) this.drawDrop(this.drops[di]);
      for (var bombi = 0; bombi < this.bombs.length; bombi += 1) this.drawBomb(this.bombs[bombi]);
      for (var bl = 0; bl < this.blasts.length; bl += 1) this.drawBlast(this.blasts[bl]);
      for (var ch = 0; ch < this.chasers.length; ch += 1) this.drawChaser(this.chasers[ch]);
      this.drawPlayer();
    }

    drawBlock(block) {
      if (!block.alive) return;
      var p = this.worldPoint(block.x, block.y);
      var visual = this.blockVisuals.get(block.id) || { flash: 0, wobble: 0 };
      var state = block.state;
      var sprite = this.blockSprites[this.spriteCursor.block++];
      if (!sprite) return;
      sprite.setTexture(state === 0 ? 'br-block-intact' : state === 1 ? 'br-block-crumble-a' : 'br-block-crumble-b');
      sprite.setPosition(p.x, p.y).setDisplaySize(this.tile * 0.94, this.tile * 0.94);
      sprite.setAlpha(state === 2 ? 0.72 : 0.96 + visual.flash * 0.04);
      sprite.setRotation(kit.juice.enabled ? visual.wobble * (state === 1 ? 0.09 : -0.07) : 0);
      sprite.setVisible(true);
    }

    drawCrate(crate) {
      var p = this.worldPoint(crate.x, crate.y);
      var sprite = this.crateSprites[this.spriteCursor.crate++];
      if (!sprite) return;
      sprite.setPosition(p.x, p.y).setDisplaySize(this.tile * 0.76, this.tile * 0.76);
      sprite.setVisible(true);
    }

    drawDrop(drop) {
      var p = this.worldPoint(drop.x, drop.y);
      var sprite = this.dropSprites[this.spriteCursor.drop++];
      if (!sprite) return;
      var color = DROP_COLORS[drop.type] || 0x5de5d1;
      var pulse = kit.juice.enabled ? 1 + Math.sin(this.simClock * 5 + drop.id) * 0.08 : 1;
      sprite.setPosition(p.x, p.y).setDisplaySize(this.tile * 0.68 * pulse, this.tile * 0.68 * pulse);
      sprite.setTint(color).setAlpha(0.98).setRotation(kit.juice.enabled ? this.simClock * 0.8 + drop.id * 0.3 : 0);
      sprite.setVisible(true);
    }

    drawBomb(bomb) {
      var p = this.worldPoint(bomb.x, bomb.y);
      var sprite = this.bombSprites[this.spriteCursor.bomb++];
      if (!sprite) return;
      var color = bomb.owner === 'enemy' ? 0xff7187 : 0xffc45d;
      var pulse = kit.juice.enabled ? 1 + Math.sin(this.simClock * 10 + bomb.phase) * 0.08 : 1;
      sprite.setPosition(p.x, p.y).setDisplaySize(this.tile * 0.78 * pulse, this.tile * 0.78 * pulse);
      sprite.setTint(color).setAlpha(1).setRotation(kit.juice.enabled ? (1 - clamp(bomb.fuse / 1.7, 0, 1)) * 0.18 : 0);
      sprite.setVisible(true);
    }

    drawBlast(blast) {
      var g = this.fxGraphics;
      var alpha = clamp(blast.life / blast.max, 0, 1);
      for (var i = 0; i < blast.cells.length; i += 1) {
        var cell = blast.cells[i];
        var p = this.worldPoint(cell.x, cell.y);
        var sprite = this.blastSprites[this.spriteCursor.blast++];
        if (sprite) {
          sprite.setPosition(p.x, p.y).setDisplaySize(this.tile * 0.98, this.tile * 0.98);
          sprite.setTint(blast.color).setAlpha(alpha).setRotation((i % 4) * Math.PI / 2);
          sprite.setVisible(true);
        } else {
          g.fillStyle(blast.color, 0.18 * alpha); g.fillRect(p.x - this.tile * 0.48, p.y - this.tile * 0.48, this.tile * 0.96, this.tile * 0.96);
          g.fillStyle(0xfff2bd, 0.78 * alpha); g.fillRect(p.x - this.tile * 0.20, p.y - this.tile * 0.20, this.tile * 0.40, this.tile * 0.40);
        }
      }
    }

    entityPoint(entity) {
      if (!entity || entity.moveT >= 1) return this.worldPoint(entity ? entity.x : 1, entity ? entity.y : 1);
      var t = smooth(entity.moveT);
      return this.worldPoint(lerp(entity.fromX, entity.toX, t), lerp(entity.fromY, entity.toY, t));
    }

    drawChaser(chaser) {
      if (!chaser.alive && !(chaser.deathLife > 0)) return;
      var p = this.entityPoint(chaser);
      var g = this.boardGraphics;
      var color = chaser.type === 'wander' ? 0x7ae5d6 : chaser.type === 'hunt' ? 0xffb35e : chaser.type === 'boss' ? 0xffdd72 : 0xff7187;
      var dying = !chaser.alive;
      if (chaser.state === 'stunned' || dying) color = 0x9baabd;
      var radius = chaser.type === 'boss' ? this.tile * 0.34 : this.tile * 0.27;
      var sprite = this.chaserSprites[this.spriteCursor.chaser++];
      if (!sprite) return;
      var texture = chaser.type === 'boss' && !dying ? 'br-chaser-boss' : dying || chaser.state === 'stunned' ? 'br-chaser-hit' : chaser.state === 'hunt' ? 'br-chaser-hunt' : 'br-chaser-idle';
      sprite.setTexture(texture).setPosition(p.x, p.y - 1);
      var deathScale = dying ? 1 + (1 - chaser.deathLife / 0.38) * 0.32 : 1;
      sprite.setDisplaySize((radius * 2.9) * deathScale, (radius * 2.9) * deathScale);
      sprite.setAlpha(dying ? clamp(chaser.deathLife / 0.26, 0, 1) : 1);
      if (chaser.type === 'ambush-flank' && !dying) sprite.setTint(0xff7187); else sprite.clearTint();
      sprite.setRotation(kit.juice.enabled && dying ? (1 - chaser.deathLife / 0.38) * 0.4 : kit.juice.enabled && chaser.state === 'hunt' ? Math.sin(this.simClock * 8 + chaser.phase) * 0.06 : 0);
      sprite.setVisible(true);
      g.fillStyle(color, dying ? 0.06 : chaser.state === 'stunned' ? 0.22 : 0.12);
      g.fillCircle(p.x, p.y, radius * (dying ? 2.1 : 1.7));
      if (chaser.type === 'boss' && chaser.hp > 0) {
        g.fillStyle(0x1a2028, 0.95); g.fillRect(p.x - this.tile * 0.35, p.y - this.tile * 0.52, this.tile * 0.70, 3);
        g.fillStyle(0xff7187, 1); g.fillRect(p.x - this.tile * 0.35, p.y - this.tile * 0.52, this.tile * 0.70 * (chaser.hp / 4), 3);
      }
    }

    drawPlayer() {
      var p = this.player;
      if (!p) return;
      if (p.invuln > 0 && kit.juice.enabled && Math.floor(this.simClock * 15) % 2 === 0) return;
      var point = this.playerPosition();
      var pos = this.worldPoint(point.x, point.y);
      var g = this.boardGraphics;
      g.fillStyle(0x5de5d1, 0.20); g.fillCircle(pos.x, pos.y, this.tile * 0.46);
      if (p.shield > 0) { g.lineStyle(2, 0x72a7ff, 0.85); g.strokeCircle(pos.x, pos.y, this.tile * (0.40 + p.shield * 0.04)); }
      var texture = p.animState === 'hit' ? 'br-player-hit' : p.animState === 'move' ? 'br-player-move' : 'br-player-idle';
      this.playerSprite.setTexture(texture).setPosition(pos.x, pos.y);
      this.playerSprite.setDisplaySize(this.tile * 0.92, this.tile * 0.92);
      this.playerSprite.setRotation(p.animState === 'move' && kit.juice.enabled ? Math.sin(this.simClock * 14) * 0.08 : 0);
      this.playerSprite.setVisible(true);
    }

    drawParticles() {
      var g = this.fxGraphics;
      for (var n = 0; n < PARTICLE_SYSTEM_NAMES.length; n += 1) {
        var items = this.particleSystems[PARTICLE_SYSTEM_NAMES[n]].items;
        for (var i = 0; i < items.length; i += 1) {
          var particle = items[i];
          if (!particle.active) continue;
          var p = this.worldPoint(particle.x, particle.y);
          var alpha = clamp(particle.life / particle.max, 0, 1);
          if (particle.kind === 'smoke') {
            g.fillStyle(particle.color, alpha * 0.32); g.fillCircle(p.x, p.y, particle.size * alpha * 1.7);
          } else if (particle.kind === 'debris') {
            g.fillStyle(particle.color, alpha); g.fillRect(p.x - particle.size, p.y - particle.size, particle.size * 2, particle.size * 2);
          } else if (particle.kind === 'pickup') {
            g.fillStyle(particle.color, alpha); g.fillTriangle(p.x, p.y - particle.size * 1.6, p.x + particle.size, p.y, p.x, p.y + particle.size * 1.6, p.x - particle.size, p.y);
          } else {
            g.fillStyle(particle.color, alpha); g.fillCircle(p.x, p.y, particle.size * alpha);
          }
        }
      }
    }

    drawOverlay() {
      var g = this.overlayGraphics;
      var width = this.scale.width;
      var height = this.scale.height;
      var top = Game.insets.top + 8;
      var frame = this.juiceFrame || { dx: 0, dy: 0 };
      g.x = frame.dx || 0; g.y = frame.dy || 0;
      if (this.damagePulse > 0) {
        var damageAlpha = 0.08 + this.damagePulse * 0.18;
        g.fillStyle(0xff3153, damageAlpha); g.fillRect(0, top + 90, width, height - top - 90);
        g.fillStyle(0xff3153, damageAlpha * 1.8);
        g.fillRect(0, top + 90, 12, height - top - 90);
        g.fillRect(width - 12, top + 90, 12, height - top - 90);
        g.fillRect(0, top + 90, width, 10);
        g.fillRect(0, height - 12, width, 12);
      }
      var activePlay = this.phase === 'playing';
      var coachVisible = activePlay && this.coachStep < 4 && this.coachLife > 0;
      var coachAlpha = this.coachLife > 0.8 ? 0.86 : 0.10 + this.coachLife / 0.8 * 0.76;
      this.coachBackground.setVisible(coachVisible).setAlpha(coachVisible ? coachAlpha : 0);
      this.coachStrip.setVisible(coachVisible).setAlpha(coachVisible ? coachAlpha : 0);
      var chipVisible = activePlay && this.coachLife <= 0 && this.banner.life > 0;
      this.bannerText.setVisible(chipVisible);
      if (chipVisible) {
        setTextIfChanged(this.bannerText, this.banner.text);
        this.bannerText.setColor('#07131b').setScale(1);
        var chipAlpha = this.banner.life < 0.16 ? this.banner.life / 0.16 : 1;
        var chipW = Math.min(width - 32, Math.max(104, this.bannerText.width + 24));
        var chipH = 30;
        var chipY = top + 78;
        g.fillStyle(this.banner.color, 0.86 * chipAlpha);
        g.fillRoundedRect((width - chipW) / 2, chipY - chipH / 2, chipW, chipH, 8);
        g.lineStyle(1, 0xffffff, 0.20 * chipAlpha);
        g.strokeRoundedRect((width - chipW) / 2, chipY - chipH / 2, chipW, chipH, 8);
        this.bannerText.setPosition(width / 2, chipY).setAlpha(chipAlpha);
      }
      if (this.phase === 'result') {
        g.fillStyle(0x030a10, 0.72); g.fillRect(0, top + 90, width, height - top - 90);
        var cardW = Math.min(width - 40, 310);
        var cardY = this.boardY + this.boardHeight * 0.48;
        g.fillStyle(0x102730, 0.96); g.fillRoundedRect((width - cardW) / 2, cardY - 74, cardW, 174, 18);
        g.lineStyle(1, this.result && this.result.medal === 'gold' ? 0xffc45d : 0x5de5d1, 0.75); g.strokeRoundedRect((width - cardW) / 2, cardY - 74, cardW, 174, 18);
      }
    }

    updateActionLabels() {
      if (!this.actionButtons || !this.player) return;
      setTextIfChanged(this.actionButtons[0].buttonText, 'BOMB ×' + this.player.bombsMax);
      setTextIfChanged(this.actionButtons[1].buttonText, 'KICK');
      setTextIfChanged(this.actionButtons[2].buttonText, 'REMOTE');
      this.actionButtons[1].setAlpha(this.player.kick ? 1 : 0.55);
      this.actionButtons[2].setAlpha(this.player.remote ? 1 : 0.55);
    }

    render() {
      if (!this.grid || !this.grid.length) return;
      this.boardGraphics.clear();
      this.fxGraphics.clear();
      this.overlayGraphics.clear();
      this.blockSprites.forEach(function (sprite) { sprite.setVisible(false); });
      this.crateSprites.forEach(function (sprite) { sprite.setVisible(false); });
      this.dropSprites.forEach(function (sprite) { sprite.setVisible(false); });
      this.bombSprites.forEach(function (sprite) { sprite.setVisible(false); });
      this.chaserSprites.forEach(function (sprite) { sprite.setVisible(false); });
      this.blastSprites.forEach(function (sprite) { sprite.setVisible(false); });
      this.playerSprite.setVisible(false);
      this.spriteCursor = { block: 0, crate: 0, drop: 0, bomb: 0, chaser: 0, blast: 0 };
      var frame = this.juiceFrame || { dx: 0, dy: 0 };
      this.boardGraphics.x = frame.dx || 0;
      this.boardGraphics.y = frame.dy || 0;
      this.fxGraphics.x = frame.dx || 0;
      this.fxGraphics.y = frame.dy || 0;
      this.drawBackgroundGrid();
      this.drawParticles();
      this.drawOverlay();
      setTextIfChanged(this.hudScore, String(Math.floor(this.score)).padStart(6, '0'));
      setTextIfChanged(this.hudLoadout, 'B' + this.player.bombsMax + '  R' + this.player.radius + '  »' + this.player.speedLevel + '  ◇' + this.player.shield);
      setTextIfChanged(this.hudArena, 'A' + String(this.arenaIndex).padStart(2, '0'));
      setTextIfChanged(this.hudTimer, this.mode === 'score-attack' ? '0:' + String(Math.ceil(this.timeLeft)).padStart(2, '0') : Math.floor(this.arenaTime) + 's');
      setTextIfChanged(this.hudLives, '♥' + this.lives + '  ◉' + this.aliveChasers());
      this.updateActionLabels();
      this.refreshDebug();
    }
  }

  Game.phaser = new PhaserRef.Game({
    type: PhaserRef.AUTO,
    parent: document.body,
    backgroundColor: '#061018',
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    scale: { mode: PhaserRef.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    render: { antialias: true, antialiasGL: false, powerPreference: 'high-performance', roundPixels: false, batchSize: 4096 },
    fps: { target: 60, min: 30 },
    scene: [BootScene, TitleScene, PlayScene]
  });
  kit.registerPWA();
  window.__BR_READY = true;
  window.__BR_GAME = Game;
  window.__br.kit = kit;
  window.__br.scene = function () { return Game.play; };
}());
