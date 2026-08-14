/* Frosthold / fleet2
 * Portrait frost-tower defense. Phaser owns pixels, GGKit owns lifecycle,
 * input identity, save data, audio, settings, and PWA behavior.
 * All visual vocabulary is original procedural IP.
 */
(function () {
  'use strict';

  var W = 390;
  var H = 844;
  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  var MAX_ENEMIES = 24;
  var MAX_PROJECTILES = 24;
  var MAX_SNOW = 70;
  var MAX_PARTICLES_PER_SYSTEM = 22;
  var CORE_X = 195;
  var CORE_Y = 348;
  var WAVE_DURATION = 18;
  var CALM_DURATION = 10;

  var PAL = {
    ink: 0xe7f7fb,
    muted: 0x9bb7c5,
    dim: 0x5d7888,
    deep: 0x07131f,
    panel: 0x0c2030,
    panel2: 0x123246,
    line: 0x315769,
    ice: 0x9be8ed,
    cyan: 0x5fd8df,
    warm: 0xffc86d,
    ember: 0xff825e,
    green: 0x9bdda5,
    violet: 0xbda8f1,
    coral: 0xff7475,
    white: 0xf1fbff,
    ridge: 0x526e83,
    lake: 0x4c8193,
    wood: 0xc18b61,
    frost: 0x78d8ff,
    shadow: 0x0a1a28
  };

  var SITES = {
    valley: { id: 'valley', name: 'SHELTERED VALLEY', sub: 'snow lanes / low wind', base: 0x102b38, ice: 0x1d4852, accent: PAL.green, angle: -2.45, pattern: 'valley' },
    ridge: { id: 'ridge', name: 'EXPOSED RIDGE', sub: 'crosswind / east lane', base: 0x182b3d, ice: 0x3d516a, accent: PAL.warm, angle: 0.08, pattern: 'ridge' },
    lake: { id: 'lake', name: 'FROZEN LAKEBED', sub: 'thin ice / southeast lane', base: 0x102b42, ice: 0x2a6378, accent: PAL.ice, angle: 0.82, pattern: 'lake' },
    expanse: { id: 'expanse', name: 'ENDLESS EXPANSE', sub: 'open snow / score chase', base: 0x111d38, ice: 0x334e76, accent: PAL.violet, angle: 2.42, pattern: 'expanse' }
  };

  var SCENARIOS = [
    { id: 'first-ember', name: 'FIRST EMBER', site: 'valley', target: 6, unlock: 0, copy: 'Learn the lanes. Place one spire before the first crawl.', wood: 50, cold: 31, core: 100, survivors: 4 },
    { id: 'thin-coal', name: 'THIN COAL', site: 'ridge', target: 7, unlock: 1, copy: 'The east lane brings armored brutes and less cold.', wood: 42, cold: 25, core: 92, survivors: 4 },
    { id: 'wreck-run', name: 'WRECK RUN', site: 'lake', target: 8, unlock: 2, copy: 'Wraiths split the lane. Upgrade a tower before wave four.', wood: 58, cold: 34, core: 94, survivors: 5 },
    { id: 'last-expanse', name: 'LAST EXPANSE', site: 'expanse', target: 10, unlock: 3, copy: 'Elite frostborn cross the open field in two approaches.', wood: 66, cold: 38, core: 100, survivors: 6 }
  ];

  var TOWERS = [
    { id: 'spire', label: 'FROST SPIRE', short: 'SPIRE', cost: 20, coldCost: 7, range: 92, cooldown: 1.05, damage: 8, freeze: 0.85, splash: 0, color: PAL.frost, icon: 'spire', copy: 'steady freeze' },
    { id: 'lens', label: 'SHARD LENS', short: 'LENS', cost: 32, coldCost: 10, range: 118, cooldown: 1.65, damage: 15, freeze: 1.25, splash: 0, color: PAL.violet, icon: 'lens', copy: 'long reach' },
    { id: 'gate', label: 'STORM GATE', short: 'GATE', cost: 45, coldCost: 15, range: 80, cooldown: 2.8, damage: 10, freeze: 0.7, splash: 30, color: PAL.cyan, icon: 'gate', copy: 'cold burst' }
  ];
  var TOWER_BY_ID = {};
  TOWERS.forEach(function (tower) { TOWER_BY_ID[tower.id] = tower; });

  var ROLES = [
    { id: 'hunt', label: 'HUNT', icon: 'H', color: PAL.green, copy: 'cold + food' },
    { id: 'chop', label: 'CHOP', icon: 'C', color: PAL.wood, copy: 'wood income' },
    { id: 'mend', label: 'MEND', icon: 'M', color: PAL.violet, copy: 'core repair' },
    { id: 'guard', label: 'GUARD', icon: 'G', color: PAL.cyan, copy: 'shield line' }
  ];
  var ROLE_BY_ID = {};
  ROLES.forEach(function (role) { ROLE_BY_ID[role.id] = role; });

  var ENEMY_TYPES = {
    crawler: { id: 'crawler', label: 'CRAWLER', hp: 24, speed: 34, damage: 7, reward: 4, resist: 0, color: PAL.coral, radius: 7 },
    brute: { id: 'brute', label: 'BRUTE', hp: 62, speed: 20, damage: 14, reward: 9, resist: 0.25, color: PAL.ember, radius: 11 },
    wraith: { id: 'wraith', label: 'WRAITH', hp: 36, speed: 46, damage: 9, reward: 7, resist: 0.45, color: PAL.violet, radius: 8 },
    elite: { id: 'elite', label: 'ELITE', hp: 116, speed: 24, damage: 24, reward: 22, resist: 0.2, color: PAL.warm, radius: 14 }
  };

  var NAMES = ['ASTER', 'BRAM', 'COVE', 'DUNE', 'EMBER', 'FENN'];
  var PAD_POS = [
    { x: 82, y: 190 }, { x: 195, y: 176 }, { x: 308, y: 190 },
    { x: 105, y: 278 }, { x: 285, y: 278 }
  ];
  var PROBE = { mode: 'menu', cycle: 0, wave: 0, core: 0, cold: 0, enemies: 0, score: 0 };
  var pendingCycle = null;
  var pendingScenario = null;
  var sceneRef = null;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pad(value, size) { return String(value).padStart(size, '0'); }
  function format1(value) { return Number(value).toFixed(1); }
  function safeSite(id) { return SITES[id] || SITES.valley; }
  function safeScenario(id) {
    if (typeof id === 'number') {
      if (!Number.isFinite(id)) return SCENARIOS[0];
      return SCENARIOS[clamp(Math.floor(id), 0, SCENARIOS.length - 1)];
    }
    if (typeof id === 'string') {
      return SCENARIOS.find(function (scenario) { return scenario.id === id; }) || SCENARIOS[0];
    }
    return SCENARIOS[0];
  }
  function setTextIfChanged(obj, value) {
    if (!obj) return false;
    var next = String(value);
    if (obj.text !== next) { obj.setText(next); return true; }
    return false;
  }
  function setColorIfChanged(obj, color) {
    if (!obj) return;
    var next = typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : color;
    if (obj.__fhColor === next) return;
    obj.setColor(next);
    obj.__fhColor = next;
  }
  function dist(ax, ay, bx, by) { var dx = ax - bx; var dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function validProfile(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.version !== 1 || typeof obj.endlessUnlocked !== 'boolean') return false;
    if (!Number.isFinite(obj.bestScore) || obj.bestScore < 0 || obj.bestScore > 99999999) return false;
    if (!obj.scenarios || typeof obj.scenarios !== 'object') return false;
    if (!Array.isArray(obj.scenarios.medals) || obj.scenarios.medals.length !== SCENARIOS.length) return false;
    return obj.scenarios.medals.every(function (medal) { return Number.isFinite(medal) && medal >= 0 && medal <= 3; });
  }

  var kit = window.GGKit.create({
    slug: 'frosthold',
    orientation: 'portrait',
    validateSave: validProfile,
    onPause: function () { if (sceneRef) sceneRef.pausedByKit = true; },
    onResume: function () { if (sceneRef) sceneRef.pausedByKit = false; },
    onRestart: function () { if (sceneRef) sceneRef.restartActive(); }
  });
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) kit.juice.enabled = false;

  /* Keep every action behind the GGKit input contract. Older GGKit builds do
   * not expose gamepad polling, so the contract is filled once here. */
  if (!kit.input.gamepadDown) {
    kit.input.gamepadDown = function (button) {
      var pads = window.navigator && window.navigator.getGamepads ? window.navigator.getGamepads() : [];
      var gamepad = pads && pads[0];
      return !!(gamepad && gamepad.buttons[button] && gamepad.buttons[button].pressed);
    };
  }
  kit.audio.register({
    calmTheme: 'assets/wind.mp3', battleTheme: 'assets/wind.mp3', dangerTheme: 'assets/horn.mp3', victoryTheme: 'assets/medal.mp3',
    select: 'assets/build.mp3', cancel: 'assets/horn.mp3', attack: 'assets/build.mp3', hit: 'assets/furnace.mp3',
    freeze: 'assets/furnace.mp3', kill: 'assets/build.mp3', waveClear: 'assets/medal.mp3', victory: 'assets/medal.mp3',
    loss: 'assets/horn.mp3', upgrade: 'assets/build.mp3', build: 'assets/build.mp3', wind: 'assets/wind.mp3', furnace: 'assets/furnace.mp3'
  });

  var defaultProfile = { version: 1, bestScore: 0, scenarios: { medals: [0, 0, 0, 0] }, endlessUnlocked: false };
  var profile = kit.save.get(defaultProfile);
  if (!validProfile(profile)) profile = defaultProfile;

  function makeSurvivors(count) {
    return NAMES.slice(0, count).map(function (name, index) {
      return { id: index, name: name, hp: 100, alive: true, job: ['guard', 'hunt', 'chop', 'mend', 'guard', 'hunt'][index], state: 'idle', phase: index * 0.34 };
    });
  }

  function wavePlan(cycle) {
    var plan = ['crawler', 'crawler', 'crawler', 'brute'];
    if (cycle >= 2) plan.push('wraith');
    if (cycle >= 3) plan.push('crawler', 'brute');
    if (cycle >= 4) plan.push('wraith', 'wraith');
    if (cycle >= 5) plan.push('elite');
    if (cycle >= 7) plan.push('brute', 'wraith', 'crawler');
    if (cycle >= 9) plan.push('elite', 'brute');
    return plan;
  }

  function makeRoute(site) {
    var sx = 195 + Math.cos(site.angle) * 182;
    var sy = 296 + Math.sin(site.angle) * 144;
    var bend = { x: 195 + Math.cos(site.angle + 0.9) * 104, y: 285 + Math.sin(site.angle + 0.9) * 94 };
    return [{ x: sx, y: sy }, bend, { x: CORE_X, y: CORE_Y }];
  }

  function freshRun(mode, scenario) {
    var site = safeSite(mode === 'run' ? 'valley' : scenario.site);
    var wood = mode === 'run' ? 54 : scenario.wood;
    var cold = mode === 'run' ? 34 : scenario.cold;
    var survivors = mode === 'run' ? 4 : scenario.survivors;
    var target = mode === 'run' ? 10 : mode === 'endless' ? Infinity : scenario.target;
    var towers = [];
    for (var i = 0; i < PAD_POS.length; i += 1) towers.push(null);
    return {
      mode: mode, scenarioId: mode === 'scenario' ? scenario.id : null, scenario: scenario, site: site, route: makeRoute(site),
      target: target, ended: false, result: '', cycle: 1, phase: 'calm', phaseTime: 0, simTime: 0,
      resources: { wood: wood, cold: cold, food: 22 }, initialCold: cold,
      core: mode === 'run' ? 100 : scenario.core, maxCore: mode === 'run' ? 100 : scenario.core,
      survivors: makeSurvivors(survivors), towers: towers, enemies: makeEnemyPool(), projectiles: makeProjectilePool(),
      wave: { queue: [], next: 0, timer: 2.5, cleared: false }, waveNumber: 0, kills: 0, losses: 0, score: 0,
      selectedTowerType: 'spire', selectedPad: 0, selectedTower: null, selectedSurvivor: 0, targetPolicy: 'first',
      scout: { state: 'idle', x: 195, y: 392, timer: 0 }, drags: Object.create(null), keyLatch: Object.create(null),
      transient: null, transientQueue: [], coachStep: 0, coachText: '', coachAge: 99, stormFlash: 0, shake: 0, cache: { found: false, x: site.pattern === 'lake' ? 345 : site.pattern === 'ridge' ? 42 : 78, y: site.pattern === 'ridge' ? 232 : site.pattern === 'lake' ? 218 : 318 }
    };
  }

  function makeEnemyPool() {
    var pool = [];
    for (var i = 0; i < MAX_ENEMIES; i += 1) pool.push({ active: false, id: i, type: null, hp: 0, maxHp: 0, t: 0, lane: 0, frozen: { remaining: 0, stacks: 0 }, state: 'recovery', stateTime: 0, towerId: -1, attackTimer: 0, x: 0, y: 0 });
    return pool;
  }

  function makeProjectilePool() {
    var pool = [];
    for (var i = 0; i < MAX_PROJECTILES; i += 1) pool.push({ active: false, x: 0, y: 0, tx: 0, ty: 0, ttl: 0, max: 0.22, color: PAL.ice, damage: 0, freeze: 0, splash: 0, enemyId: -1, towerId: -1 });
    return pool;
  }

  class FrostholdScene extends Phaser.Scene {
    constructor() { super({ key: 'Frosthold' }); }

    create() {
      sceneRef = this;
      this.accumulator = 0;
      this.pausedByKit = false;
      this.screen = 'menu';
      this.run = null;
      this.staticImage = null;
      this.dynamic = this.add.graphics().setDepth(5);
      this.makePools();
      this.makeUi();
      this.showMenu();
      this.bindInput();
      this.rebuildStatic(SITES.valley);
      this.updateProbe();
      kit.loader.progress(1);
      kit.loader.hide();
      if (pendingScenario !== null) this.forceScenario(pendingScenario);
      else if (pendingCycle !== null) this.forceCycle(pendingCycle);
    }

    makePools() {
      this.snow = [];
      for (var i = 0; i < MAX_SNOW; i += 1) {
        var flake = this.add.rectangle(Math.random() * W, 130 + Math.random() * 310, 1 + Math.random() * 2, 1 + Math.random() * 3, PAL.white, 0.45).setDepth(7);
        flake._fh = { x: flake.x, y: flake.y, speed: 18 + Math.random() * 34, drift: -10 + Math.random() * 20, seed: Math.random() * 10 };
        flake.setVisible(false);
        this.snow.push(flake);
      }
      this.particleSystems = { freeze: [], tower: [], wave: [], defense: [] };
      var systemNames = ['freeze', 'tower', 'wave', 'defense'];
      for (var s = 0; s < systemNames.length; s += 1) {
        var system = this.particleSystems[systemNames[s]];
        for (var p = 0; p < MAX_PARTICLES_PER_SYSTEM; p += 1) {
          var view = this.add.rectangle(0, 0, 3, 3, PAL.white, 0).setDepth(9);
          view._fh = { active: false, x: 0, y: 0, vx: 0, vy: 0, ttl: 0, max: 1, size: 3, color: PAL.white, spin: 0 };
          view.setVisible(false);
          system.push(view);
        }
      }
    }

    makeText(x, y, value, size, color, originX, originY, weight) {
      return this.add.text(x, y, value || '', {
        fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: (size || 12) + 'px', fontStyle: weight === 900 ? 'bold' : 'normal',
        color: '#' + (color || PAL.ink).toString(16).padStart(6, '0'), stroke: '#06111b', strokeThickness: size >= 18 ? 2 : 1,
        shadow: { offsetX: 0, offsetY: 2, color: '#06111b', blur: 3, fill: true }
      }).setOrigin(originX == null ? 0.5 : originX, originY == null ? 0.5 : originY).setDepth(10);
    }

    makeUi() {
      var self = this;
      this.menu = this.add.container(0, 0).setDepth(20);
      this.menu.add(this.makeText(195, 76, 'FROSTHOLD', 35, PAL.ice, 0.5, 0.5, 900));
      this.menu.add(this.makeText(195, 113, 'FROST TOWER DEFENSE // FLEET2', 11, PAL.muted));
      this.menu.add(this.makeText(195, 151, 'FREEZE THE LINE. HOLD THE CORE.', 14, PAL.warm, 0.5, 0.5, 900));
      this.menuButtons = [
        this.makeMenuButton(195, 230, 'MAIN SURVIVAL', '10 WAVES // PLACE, FREEZE, ADAPT', PAL.cyan),
        this.makeMenuButton(195, 326, 'SCENARIO MODE', 'HAND-AUTHORED LANES // MEDAL CHAIN', PAL.green),
        this.makeMenuButton(195, 422, 'ENDLESS EXPANSE', 'UNLOCKED AFTER MAIN SURVIVAL', PAL.violet)
      ];
      this.menu.add(this.makeText(195, 536, 'Tap a tower card, then tap a pad and BUILD.', 11, PAL.muted));
      this.menu.add(this.makeText(195, 562, 'Freeze status buys time. Roles feed the cold economy.', 11, PAL.muted));
      this.menu.add(this.makeText(195, 721, '1 2 3  select tower   SPACE  build   U  upgrade', 11, PAL.ice, 0.5, 0.5, 900));
      this.menu.add(this.makeText(195, 748, 'F  target policy   B  branch   P  pause   R  restart', 10, PAL.muted, 0.5, 0.5));
      this.menu.add(this.makeText(195, 795, 'original procedural art and audio', 10, PAL.dim));

      this.scenarioMenu = this.add.container(0, 0).setDepth(20).setVisible(false);
      this.scenarioMenu.add(this.makeText(195, 63, 'SCENARIO FILES', 27, PAL.ice, 0.5, 0.5, 900));
      this.scenarioMenu.add(this.makeText(195, 96, 'earn medals to unlock the next lane', 11, PAL.muted));
      this.scenarioCards = SCENARIOS.map(function (scenario, index) {
        var y = 160 + index * 126;
        var card = self.add.rectangle(195, y, 348, 103, PAL.panel, PAL.line, 1);
        var title = self.makeText(32, y - 29, scenario.name, 15, safeSite(scenario.site).accent, 0, 0.5, 900);
        var desc = self.makeText(32, y + 1, scenario.copy, 10, PAL.muted, 0, 0.5);
        var site = self.makeText(32, y + 29, safeSite(scenario.site).name + '  /  ' + scenario.target + ' WAVES', 10, PAL.dim, 0, 0.5, 900);
        var medal = self.makeText(338, y - 24, '○ ○ ○', 14, PAL.warm, 1, 0.5, 900);
        var status = self.makeText(338, y + 24, '', 10, PAL.muted, 1, 0.5, 900);
        self.scenarioMenu.add([card, title, desc, site, medal, status]);
        return { rect: card, title: title, desc: desc, site: site, medal: medal, status: status, y: y, scenario: scenario };
      });
      this.scenarioMenu.add(this.makeText(195, 716, 'BACK TO MODES', 13, PAL.cyan, 0.5, 0.5, 900));

      this.world = this.add.container(0, 0).setDepth(10).setVisible(false);
      this.hudG = this.add.graphics().setDepth(9);
      this.ui = {
        wave: this.makeText(18, 18, '', 15, PAL.ink, 0, 0.5, 900),
        phase: this.makeText(372, 18, '', 14, PAL.green, 1, 0.5, 900),
        wood: this.makeText(32, 77, '', 14, PAL.wood, 0, 0.5, 900),
        cold: this.makeText(122, 77, '', 14, PAL.frost, 0, 0.5, 900),
        core: this.makeText(230, 77, '', 14, PAL.warm, 0, 0.5, 900),
        pause: this.makeText(370, 77, 'PAUSE', 14, PAL.cyan, 1, 0.5, 900),
        coach: this.makeText(195, 111, '', 14, PAL.muted, 0.5, 0.5, 900),
        towerTitle: this.makeText(195, 553, '', 14, PAL.ink, 0.5, 0.5, 900),
        toast: this.makeText(24, 108, '', 14, PAL.ice, 0, 0.5, 900),
        actionBuild: this.makeText(71, 587, 'BUILD', 14, PAL.ink, 0.5, 0.5, 900),
        actionUpgrade: this.makeText(195, 587, 'UPGRADE', 14, PAL.ink, 0.5, 0.5, 900),
        actionTarget: this.makeText(319, 587, 'TARGET', 14, PAL.ink, 0.5, 0.5, 900)
      };
      this.toastBack = this.add.rectangle(12, 108, 230, 30, PAL.panel2, PAL.cyan, 1).setOrigin(0, 0.5).setDepth(8).setVisible(false);
      this.world.add([this.hudG, this.toastBack].concat(Object.keys(this.ui).map(function (key) { return self.ui[key]; })));
      this.towerUi = TOWERS.map(function (tower) {
        return { label: self.makeText(0, 0, tower.short, 14, tower.color, 0.5, 0.5, 900), cost: self.makeText(0, 0, '', 14, PAL.muted, 0.5, 0.5) };
      });
      this.towerUi.forEach(function (entry) { self.world.add([entry.label, entry.cost]); });
      this.roleUi = ROLES.map(function (role) {
        return { mark: self.makeText(0, 0, role.icon, 14, PAL.deep, 0.5, 0.5, 900), count: self.makeText(0, 0, '', 16, role.color, 0.5, 0.5, 900) };
      });
      this.roleUi.forEach(function (entry) { self.world.add([entry.mark, entry.count]); });
      this.badgeUi = NAMES.map(function (name) { return self.makeText(0, 0, name.slice(0, 1), 14, PAL.ink, 0.5, 0.5, 900); });
      this.badgeUi.forEach(function (entry) { self.world.add(entry); });

      this.banner = this.add.container(195, 295).setDepth(30).setVisible(false);
      this.bannerBack = this.add.rectangle(0, 0, 220, 58, PAL.panel2, PAL.cyan, 2);
      this.bannerTitle = this.makeText(0, -10, '', 18, PAL.ice, 0.5, 0.5, 900);
      this.bannerSub = this.makeText(0, 16, '', 14, PAL.muted, 0.5, 0.5, 900);
      this.banner.add([this.bannerBack, this.bannerTitle, this.bannerSub]);

      this.pauseLayer = this.add.container(195, 422).setDepth(35).setVisible(false);
      this.pauseLayer.add(this.add.rectangle(0, 0, 300, 188, PAL.deep, 0.96).setStrokeStyle(2, PAL.cyan, 1));
      this.pauseTitle = this.makeText(0, -61, 'FROZEN', 25, PAL.ice, 0.5, 0.5, 900);
      this.pauseCopy = this.makeText(0, -28, 'The line is paused.', 11, PAL.muted, 0.5, 0.5);
      this.pauseResume = this.makeText(0, 15, 'TAP TO RESUME', 14, PAL.green, 0.5, 0.5, 900);
      this.pauseRestart = this.makeText(0, 51, 'RESTART ACTIVE RUN', 11, PAL.warm, 0.5, 0.5, 900);
      this.pauseLayer.add([this.pauseTitle, this.pauseCopy, this.pauseResume, this.pauseRestart]);

      this.result = this.add.container(0, 0).setDepth(40).setVisible(false);
      this.result.add(this.add.rectangle(195, 422, 390, 844, PAL.deep, 0.95));
      this.resultKicker = this.makeText(195, 172, '', 12, PAL.warm, 0.5, 0.5, 900);
      this.resultTitle = this.makeText(195, 218, '', 27, PAL.ice, 0.5, 0.5, 900);
      this.resultBody = this.makeText(195, 268, '', 11, PAL.muted, 0.5, 0.5);
      this.resultStats = this.makeText(195, 356, '', 14, PAL.ink, 0.5, 0.5, 900);
      this.resultMedals = this.makeText(195, 434, '', 17, PAL.warm, 0.5, 0.5, 900);
      this.resultMedalCopy = this.makeText(195, 472, '', 10, PAL.muted, 0.5, 0.5);
      this.resultButton = this.add.rectangle(195, 590, 236, 58, PAL.panel2, PAL.cyan, 2);
      this.resultButtonText = this.makeText(195, 590, 'REKINDLE', 13, PAL.ink, 0.5, 0.5, 900);
      this.resultMenu = this.makeText(195, 674, 'BACK TO MODES', 12, PAL.cyan, 0.5, 0.5, 900);
      this.result.add([this.resultKicker, this.resultTitle, this.resultBody, this.resultStats, this.resultMedals, this.resultMedalCopy, this.resultButton, this.resultButtonText, this.resultMenu]);
    }

    makeMenuButton(x, y, title, sub, color) {
      var card = this.add.container(0, 0);
      card.rect = this.add.rectangle(x, y, 318, 74, PAL.panel, color, 2);
      card.title = this.makeText(x, y - 10, title, 16, color, 0.5, 0.5, 900);
      card.sub = this.makeText(x, y + 17, sub, 10, PAL.muted, 0.5, 0.5);
      card.add([card.rect, card.title, card.sub]);
      this.menu.add(card);
      return { x: x, y: y, w: 318, h: 74, color: color, card: card };
    }

    bindInput() {
      var self = this;
      this.input.on('pointerdown', function (pointer) { self.pointerDown(pointer); });
      this.input.on('pointermove', function (pointer) { self.pointerMove(pointer); });
      this.input.on('pointerup', function (pointer) { self.pointerUp(pointer, false); });
      this.input.on('pointerupoutside', function (pointer) { self.pointerUp(pointer, true); });
      this.input.on('pointercancel', function (pointer) { self.pointerUp(pointer, true); });
    }

    claimPointer(pointer) {
      var existing = kit.input.pointers.get(pointer.id);
      var value = existing || { x: pointer.x, y: pointer.y, startX: pointer.x, startY: pointer.y, downAt: performance.now(), zone: null };
      value.x = pointer.x;
      value.y = pointer.y;
      if (!existing) kit.input.pointers.set(pointer.id, value);
      return value;
    }

    pointerDown(pointer) {
      this.claimPointer(pointer);
      var x = pointer.x;
      var y = pointer.y;
      if (this.screen === 'menu') { this.menuHit(x, y); return; }
      if (this.screen === 'scenario') { this.scenarioHit(x, y); return; }
      if (this.screen === 'result') { this.resultHit(x, y); return; }
      if (this.pausedByKit) {
        if (y > 365 && y < 460) this.togglePause();
        else if (y > 460 && y < 505) this.requestRestart();
        return;
      }
      if (!this.run || this.run.ended) return;
      if (x > 318 && y > 53 && y < 104) { this.togglePause(); return; }
      if (y > 452 && y < 535) {
        var typeIndex = clamp(Math.floor(x / 130), 0, TOWERS.length - 1);
        this.run.selectedTowerType = TOWERS[typeIndex].id;
        this.run.selectedTower = null;
        this.run.scout.state = 'command'; this.run.scout.timer = 0.7;
        this.toast(TOWERS[typeIndex].short + ' SELECTED');
        this.sfx('select', 0.22, 1 + typeIndex * 0.12);
        if (this.run.coachStep === 0) this.run.coachStep = 1;
        return;
      }
      if (y > 540 && y < 610) {
        if (x < 130) this.buildSelected();
        else if (x < 260) this.upgradeSelected();
        else this.cycleTarget();
        return;
      }
      var tower = this.towerAt(x, y);
      if (tower) { this.run.selectedTower = tower; this.run.selectedPad = tower.pad; this.run.scout.state = 'command'; this.run.scout.timer = 0.7; return; }
      var padIndex = this.padAt(x, y);
      if (padIndex >= 0) { this.run.selectedPad = padIndex; this.run.selectedTower = this.run.towers[padIndex]; this.toast('PAD ' + (padIndex + 1) + ' READY'); return; }
      if (this.cacheAt(x, y)) { this.findCache(); return; }
      var badge = this.badgeAt(x, y);
      if (badge) {
        this.run.selectedSurvivor = badge.id;
        this.run.drags[pointer.id] = { id: badge.id, x: x, y: y };
        this.sfx('select', 0.16, 1.2);
        return;
      }
      var roleIndex = this.roleAt(x, y);
      if (roleIndex >= 0) this.assignSelected(ROLES[roleIndex].id);
    }

    pointerMove(pointer) {
      if (!this.run || !this.run.drags[pointer.id]) return;
      var p = this.claimPointer(pointer);
      this.run.drags[pointer.id].x = p.x;
      this.run.drags[pointer.id].y = p.y;
    }

    pointerUp(pointer, cancelled) {
      if (!this.run) return;
      var drag = this.run.drags[pointer.id];
      if (!drag) return;
      if (!cancelled) {
        var roleIndex = this.roleAt(pointer.x, pointer.y);
        if (roleIndex >= 0) this.assign(drag.id, ROLES[roleIndex].id);
      }
      delete this.run.drags[pointer.id];
      kit.input.pointers.delete(pointer.id);
    }

    menuHit(x, y) {
      if (y > 190 && y < 270) { this.startMode('run'); return; }
      if (y > 285 && y < 365) { this.showScenarioMenu(); return; }
      if (y > 380 && y < 465) { if (profile.endlessUnlocked) this.startMode('endless'); else this.toastMenu('CLEAR MAIN SURVIVAL TO UNLOCK ENDLESS'); }
    }

    toastMenu(message) {
      var text = this.menu.list[this.menu.list.length - 1];
      if (text && text.setText) text.setText(message);
      this.sfx('cancel', 0.22, 0.6);
    }

    showScenarioMenu() {
      this.screen = 'scenario';
      this.menu.setVisible(false);
      this.scenarioMenu.setVisible(true);
      this.scenarioCards.forEach(function (entry, index) {
        var medals = profile.scenarios.medals[index] || 0;
        var unlocked = index === 0 || (profile.scenarios.medals[index - 1] || 0) >= entry.scenario.unlock;
        setTextIfChanged(entry.medal, medals ? '★'.repeat(medals) + '  ' + '○'.repeat(3 - medals) : '○ ○ ○');
        setColorIfChanged(entry.medal, unlocked ? PAL.warm : PAL.dim);
        setTextIfChanged(entry.status, unlocked ? (medals ? 'BEST ' + medals + '/3' : 'READY') : 'LOCKED / EARN ' + entry.scenario.unlock + ' MEDAL');
        setColorIfChanged(entry.status, unlocked ? PAL.green : PAL.dim);
        entry.rect.setFillStyle(unlocked ? PAL.panel : 0x0b1722, 1).setStrokeStyle(1, unlocked ? safeSite(entry.scenario.site).accent : PAL.line, 0.9);
      });
      this.updateProbe();
    }

    scenarioHit(x, y) {
      if (y > 682 && y < 752) { this.showMenu(); return; }
      var index = Math.floor((y - 110) / 126);
      if (index < 0 || index >= SCENARIOS.length) return;
      var scenario = SCENARIOS[index];
      var unlocked = index === 0 || (profile.scenarios.medals[index - 1] || 0) >= scenario.unlock;
      if (unlocked && y >= 110 + index * 126 && y <= 213 + index * 126) this.startMode('scenario', scenario.id);
    }

    resultHit(x, y) {
      if (y > 545 && y < 635) { this.requestRestart(); return; }
      if (y > 640 && y < 725) this.showMenu();
    }

    showMenu() {
      kit.audio.stopMusic(180);
      if (kit.paused) { kit.resume('manual'); kit.resume('hidden'); }
      this.screen = 'menu';
      this.run = null;
      this.menu.setVisible(true);
      this.scenarioMenu.setVisible(false);
      this.world.setVisible(false);
      this.dynamic.setVisible(false);
      this.banner.setVisible(false);
      this.toastBack.setVisible(false); this.ui.toast.setVisible(false);
      this.pauseLayer.setVisible(false);
      this.result.setVisible(false);
      if (this.staticImage) this.staticImage.setVisible(false);
      this.updateProbe();
    }

    startMode(mode, scenarioId) {
      if (mode === 'scenario') {
        var scenario = safeScenario(scenarioId == null ? 0 : scenarioId);
        var index = SCENARIOS.indexOf(scenario);
        if (index > 0 && (profile.scenarios.medals[index - 1] || 0) < scenario.unlock) { this.showScenarioMenu(); return; }
        this.run = freshRun('scenario', scenario);
      } else if (mode === 'endless') {
        if (!profile.endlessUnlocked) { this.showMenu(); return; }
        this.run = freshRun('endless', { id: null, site: 'expanse', target: Infinity, wood: 72, cold: 42, core: 104, survivors: 6 });
      } else {
        this.run = freshRun('run', safeScenario('first-ember'));
      }
      this.screen = 'play';
      this.accumulator = 0;
      this.menu.setVisible(false);
      this.scenarioMenu.setVisible(false);
      this.result.setVisible(false);
      this.pauseLayer.setVisible(false);
      this.showWorldUi(true);
      this.rebuildStatic(this.run.site);
      this.showBanner('LINE ESTABLISHED', this.run.site.name, this.run.site.accent);
      this.sfx('calmTheme', 0.22, 1);
      kit.audio.music('calmTheme', 300);
      this.updateProbe();
    }

    restartActive() {
      if (!this.run) { this.startMode('run'); return; }
      var mode = this.run.mode;
      var scenarioId = this.run.scenarioId;
      if (kit.paused) { kit.resume('manual'); kit.resume('hidden'); }
      this.startMode(mode, scenarioId);
    }

    requestRestart() { kit.restart(); }

    togglePause() {
      if (!this.run || this.screen !== 'play') return;
      if (this.pausedByKit) kit.resume('manual');
      else kit.pause('manual');
      this.pauseLayer.setVisible(!this.pausedByKit);
      this.sfx(this.pausedByKit ? 'select' : 'cancel', 0.18, this.pausedByKit ? 1.1 : 0.7);
    }

    showWorldUi(visible) {
      this.world.setVisible(visible);
      this.dynamic.setVisible(visible);
      this.snow.forEach(function (flake) { flake.setVisible(visible); });
      var self = this;
      Object.keys(this.particleSystems).forEach(function (name) { self.particleSystems[name].forEach(function (p) { p.setVisible(false); }); });
    }

    rebuildStatic(site) {
      if (this.staticImage) { this.staticImage.destroy(); this.staticImage = null; }
      if (this.textures.exists('fh-static')) this.textures.remove('fh-static');
      var g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(PAL.deep, 1); g.fillRect(0, 0, W, H);
      g.fillStyle(0x081723, 1); g.fillRect(0, 0, W, 104);
      g.fillStyle(site.base, 1); g.fillRoundedRect(10, 124, 370, 326, 16);
      g.lineStyle(1, site.ice, 0.65); g.strokeRoundedRect(10, 124, 370, 326, 16);
      this.drawTerrain(g, site);
      g.fillStyle(0x0b1b29, 1); g.fillRoundedRect(10, 452, 370, 82, 14);
      g.lineStyle(1, PAL.line, 0.9); g.strokeRoundedRect(10, 452, 370, 82, 14);
      g.fillStyle(0x0b1b29, 1); g.fillRoundedRect(10, 540, 370, 72, 12); g.strokeRoundedRect(10, 540, 370, 72, 12);
      g.fillStyle(0x0b1b29, 1); g.fillRoundedRect(10, 618, 370, 165, 14); g.strokeRoundedRect(10, 618, 370, 165, 14);
      g.fillStyle(0x091722, 1); g.fillRect(0, 786, W, 58);
      g.lineStyle(1, site.accent, 0.45); g.lineBetween(14, 786, 376, 786);
      g.generateTexture('fh-static', W, H);
      g.destroy();
      this.staticImage = this.add.image(0, 0, 'fh-static').setOrigin(0).setDepth(0);
      this.staticImage.setVisible(this.screen === 'play');
    }

    drawTerrain(g, site) {
      var i;
      g.fillStyle(0x153748, 0.7); g.fillEllipse(195, 286, 322, 226);
      g.fillStyle(0x214b5b, 0.45); g.fillEllipse(195, 270, 274, 178);
      g.lineStyle(13, 0x0a2533, 0.64);
      g.lineBetween(16, 420, 92, 344); g.lineBetween(92, 344, 184, 316); g.lineBetween(206, 316, 298, 346); g.lineBetween(298, 346, 374, 414);
      g.lineStyle(7, site.ice, 0.3);
      g.lineBetween(16, 420, 92, 344); g.lineBetween(92, 344, 184, 316); g.lineBetween(206, 316, 298, 346); g.lineBetween(298, 346, 374, 414);
      if (site.pattern === 'lake') {
        g.lineStyle(2, 0x9feef2, 0.36);
        for (i = 0; i < 7; i += 1) { g.lineBetween(25 + i * 52, 151 + i * 12, 92 + i * 52, 215 + i * 10); g.lineBetween(55 + i * 44, 360 - i * 7, 112 + i * 44, 406 - i * 5); }
      } else if (site.pattern === 'ridge') {
        g.lineStyle(2, PAL.warm, 0.2);
        for (i = 0; i < 8; i += 1) g.lineBetween(17, 158 + i * 32, 372, 142 + i * 32);
      } else if (site.pattern === 'expanse') {
        g.fillStyle(0x273d6a, 0.48); g.fillEllipse(195, 248, 332, 172);
        for (i = 0; i < 16; i += 1) g.fillCircle(26 + (i * 47) % 344, 148 + (i * 29) % 214, 1.5, 0.7);
      } else {
        g.lineStyle(2, 0x73b0a3, 0.3);
        for (i = 0; i < 7; i += 1) g.lineBetween(18, 325 + i * 14, 372, 293 + i * 15);
      }
      this.drawPines(g, site);
      this.drawLandmarks(g, site);
      g.fillStyle(PAL.ember, 0.24); g.fillEllipse(CORE_X, CORE_Y + 5, 74, 30);
      g.fillStyle(PAL.shadow, 0.86); g.fillRoundedRect(159, 342, 72, 29, 8);
      g.fillStyle(PAL.warm, 0.88); g.fillCircle(CORE_X, CORE_Y, 12); g.fillStyle(PAL.white, 0.9); g.fillCircle(CORE_X, CORE_Y - 4, 4);
    }

    drawPines(g, site) {
      var positions = site.pattern === 'ridge' ? [[42, 178], [352, 230], [38, 315], [350, 374]] : [[35, 210], [354, 188], [32, 370], [356, 334], [132, 148], [260, 154]];
      positions.forEach(function (p, index) {
        var x = p[0]; var y = p[1]; var h = 28 + (index % 3) * 8;
        g.fillStyle(0x0b2835, 0.9); g.fillRect(x - 2, y, 4, h * 0.45);
        g.fillStyle(index % 2 ? 0x1b4b57 : 0x225965, 0.9);
        g.fillTriangle(x, y - h, x - 17, y + 7, x + 17, y + 7);
        g.fillTriangle(x, y - h * 0.66, x - 13, y + 15, x + 13, y + 15);
        g.lineStyle(2, 0xd2f7f4, 0.48); g.lineBetween(x - 9, y - h * 0.62, x, y - h * 0.78); g.lineBetween(x + 4, y - h * 0.36, x + 12, y - h * 0.18);
      });
    }

    drawLandmarks(g, site) {
      var accent = site.accent;
      var list = site.pattern === 'lake' ? [[62, 164, 'wreck'], [329, 176, 'spire'], [55, 386, 'arch'], [320, 382, 'relay']] : [[58, 164, 'tower'], [331, 174, 'wind'], [49, 381, 'arch'], [337, 382, 'relay']];
      list.forEach(function (landmark, index) {
        var x = landmark[0]; var y = landmark[1];
        g.lineStyle(2, accent, 0.52); g.fillStyle(0x0b2330, 0.68);
        if (landmark[2] === 'wreck') { g.fillRect(x - 21, y - 6, 42, 13); g.lineBetween(x - 23, y - 7, x + 7, y - 25); g.lineBetween(x + 7, y - 25, x + 23, y - 4); }
        else if (landmark[2] === 'wind') { g.strokeCircle(x, y - 8, 12); g.lineBetween(x, y + 5, x, y + 31); g.lineBetween(x - 9, y - 14, x + 8, y - 1); g.lineBetween(x + 8, y - 14, x - 9, y - 1); }
        else if (landmark[2] === 'arch') { g.strokeCircle(x, y + 3, 22); g.lineStyle(7, site.base, 1); g.lineBetween(x - 11, y + 9, x + 11, y + 9); g.lineStyle(2, accent, 0.52); g.lineBetween(x - 22, y + 3, x - 22, y + 29); g.lineBetween(x + 22, y + 3, x + 22, y + 29); }
        else { g.fillTriangle(x - 23, y + 20, x, y - 24, x + 23, y + 20); g.fillStyle(accent, 0.5); g.fillCircle(x, y - 7, 5); g.lineBetween(x - 28, y + 21, x + 28, y + 21); }
        if (index === 0) { g.fillStyle(PAL.white, 0.7); g.fillCircle(x, y - 29, 2); }
      });
    }

    transientKey(item) { return item.kind + '|' + (item.title || item.text || '') + '|' + (item.sub || ''); }

    activateTransient(item) {
      if (!this.run) return;
      item.age = 0;
      this.run.transient = item;
      if (item.kind === 'banner') {
        setTextIfChanged(this.bannerTitle, item.title);
        setTextIfChanged(this.bannerSub, item.sub || '');
        this.bannerBack.setStrokeStyle(2, item.color, 1);
        setColorIfChanged(this.bannerTitle, item.color);
      } else {
        setTextIfChanged(this.ui.toast, item.text);
        this.toastBack.setStrokeStyle(1, item.color, 0.9);
      }
    }

    enqueueTransient(item) {
      var run = this.run;
      if (!run) return;
      var key = this.transientKey(item);
      if (run.transient && this.transientKey(run.transient) === key) return;
      if (run.transientQueue.some(function (queued) { return this.transientKey(queued) === key; }, this)) return;
      if (!run.transient) this.activateTransient(item);
      else {
        run.transientQueue.push(item);
        if (run.transientQueue.length > 4) run.transientQueue.shift();
      }
    }

    showBanner(title, sub, color) {
      if (this.run) { this.run.transient = null; this.run.transientQueue.length = 0; }
      this.enqueueTransient({ kind: 'banner', title: title, sub: sub || '', color: color || PAL.cyan, hold: 1.65 });
    }

    toast(message) {
      this.enqueueTransient({ kind: 'chip', text: message, color: PAL.ice, hold: 1.0 });
    }

    advanceTransient(dt) {
      var run = this.run;
      if (!run) return;
      if (!run.transient && run.transientQueue.length) this.activateTransient(run.transientQueue.shift());
      if (!run.transient) return;
      run.transient.age += dt;
      if (run.transient.age < run.transient.hold) return;
      run.transient = null;
      if (run.transientQueue.length) this.activateTransient(run.transientQueue.shift());
    }

    sfx(name, volume, rate) { kit.audio.sfx(name, { volume: volume == null ? 0.35 : volume, rate: rate || 1 }); }

    handleControls() {
      var run = this.run;
      if (!run || this.screen !== 'play') return;
      var actions = [
        ['Digit1', function () { run.selectedTowerType = 'spire'; }], ['Digit2', function () { run.selectedTowerType = 'lens'; }], ['Digit3', function () { run.selectedTowerType = 'gate'; }],
        ['Space', this.buildSelected.bind(this)], ['KeyU', this.upgradeSelected.bind(this)], ['KeyF', this.cycleTarget.bind(this)], ['KeyB', this.cycleBranch.bind(this)],
        ['KeyH', function () { this.assignSelected('hunt'); }.bind(this)], ['KeyC', function () { this.assignSelected('chop'); }.bind(this)], ['KeyM', function () { this.assignSelected('mend'); }.bind(this)], ['KeyG', function () { this.assignSelected('guard'); }.bind(this)],
        ['KeyP', this.togglePause.bind(this)], ['KeyR', this.requestRestart.bind(this)]
      ];
      actions.forEach(function (action) { this.edgeAction(action[0], action[1]); }, this);
      var pads = [[0, this.buildSelected.bind(this)], [1, this.cycleTarget.bind(this)], [2, this.upgradeSelected.bind(this)], [3, this.togglePause.bind(this)], [14, this.shiftTower.bind(this, -1)], [15, this.shiftTower.bind(this, 1)]];
      pads.forEach(function (action) { this.edgePad(action[0], action[1]); }, this);
    }

    edgeAction(code, fn) {
      var down = kit.input.keyDown(code);
      var prior = !!this.run.keyLatch[code];
      this.run.keyLatch[code] = down;
      if (down && !prior && !this.pausedByKit) fn();
    }

    edgePad(button, fn) {
      var code = 'pad' + button;
      var down = kit.input.gamepadDown(button);
      var prior = !!this.run.keyLatch[code];
      this.run.keyLatch[code] = down;
      if (down && !prior && !this.pausedByKit) fn();
    }

    stepSim(dt) {
      var run = this.run;
      if (!run || this.screen !== 'play' || run.ended || kit.paused || this.pausedByKit) return;
      run.simTime += dt; run.phaseTime += dt; run.stormFlash = Math.max(0, run.stormFlash - dt); run.shake = Math.max(0, run.shake - dt * 2);
      this.advanceTransient(dt);
      run.coachAge += dt;
      if (run.scout.timer > 0) { run.scout.timer -= dt; if (run.scout.timer <= 0) run.scout.state = run.phase === 'wave' ? 'resolve' : 'idle'; }

      var living = this.aliveCount();
      var hunts = this.countRole('hunt'); var chops = this.countRole('chop'); var mends = this.countRole('mend');
      if (run.phase === 'calm') {
        run.resources.wood = clamp(run.resources.wood + chops * 0.38 * dt, 0, 999);
        run.resources.cold = clamp(run.resources.cold + hunts * 0.17 * dt, 0, 999);
        run.resources.food = clamp(run.resources.food + hunts * 0.3 * dt - living * 0.025 * dt, 0, 999);
        run.core = clamp(run.core + mends * 0.32 * dt, 0, run.maxCore);
        if (run.phaseTime >= CALM_DURATION) this.startWave();
      } else {
        run.resources.cold = clamp(run.resources.cold + hunts * 0.14 * dt, 0, 999);
        run.resources.food = Math.max(0, run.resources.food - living * 0.018 * dt);
        run.core = clamp(run.core + mends * 0.08 * dt, 0, run.maxCore);
        this.spawnWave(dt);
        this.updateEnemies(dt);
        this.updateProjectiles(dt);
        this.updateTowers(dt);
        if (this.waveCleared()) this.clearWave();
      }
      if (run.core <= 0) { this.endRun('loss'); return; }
      this.updateProbe();
    }

    startWave() {
      var run = this.run;
      run.phase = 'wave'; run.phaseTime = 0; run.waveNumber = run.cycle;
      run.wave = { queue: wavePlan(run.cycle), next: 0, timer: 0.7, cleared: false };
      run.scout.state = 'command'; run.scout.timer = 0.8;
      this.showBanner('WAVE ' + pad(run.cycle, 2), 'FREEZE BEFORE CORE', PAL.coral);
      this.toast('TARGET ' + run.targetPolicy.toUpperCase());
      this.sfx('dangerTheme', 0.42, 0.8);
      kit.audio.music('battleTheme', 320);
    }

    spawnWave(dt) {
      var run = this.run;
      if (run.wave.next >= run.wave.queue.length) return;
      run.wave.timer -= dt;
      if (run.wave.timer > 0) return;
      var slot = run.enemies.find(function (enemy) { return !enemy.active; });
      if (!slot) return;
      var type = ENEMY_TYPES[run.wave.queue[run.wave.next]];
      slot.active = true; slot.type = type.id; slot.hp = type.hp * (1 + Math.max(0, run.cycle - 4) * 0.055); slot.maxHp = slot.hp; slot.t = 0; slot.lane = run.wave.next % 2;
      slot.frozen.remaining = 0; slot.frozen.stacks = 0; slot.state = 'anticipation'; slot.stateTime = 0.35; slot.towerId = -1; slot.attackTimer = 0; slot.x = run.route[0].x; slot.y = run.route[0].y;
      run.wave.next += 1; run.wave.timer = Math.max(0.42, 0.92 - run.cycle * 0.025);
      this.emitParticles('defense', slot.x, slot.y, 3, type.color);
    }

    updateEnemies(dt) {
      var run = this.run;
      for (var i = 0; i < run.enemies.length; i += 1) {
        var enemy = run.enemies[i];
        if (!enemy.active) continue;
        var type = ENEMY_TYPES[enemy.type];
        enemy.stateTime -= dt;
        if (enemy.stateTime <= 0 && enemy.state === 'anticipation') enemy.state = 'contact';
        if (enemy.frozen.remaining > 0) enemy.frozen.remaining = Math.max(0, enemy.frozen.remaining - dt);
        var speed = type.speed * (enemy.frozen.remaining > 0 ? 0.25 : 1);
        enemy.t += speed * dt / 255;
        var point = pointOnRoute(run.route, enemy.t);
        enemy.x = point.x; enemy.y = point.y;
        var blocking = this.nearestTower(enemy.x, enemy.y, 24);
        if (blocking && enemy.t > 0.42 && enemy.t < 0.92 && enemy.towerId < 0) { enemy.towerId = blocking.pad; enemy.state = 'contact'; enemy.attackTimer = 0; }
        if (enemy.towerId >= 0) {
          var tower = run.towers[enemy.towerId];
          if (tower && tower.state !== 'destroyed') {
            enemy.attackTimer -= dt;
            if (enemy.attackTimer <= 0) { enemy.attackTimer = 1.1; tower.hp = Math.max(0, tower.hp - type.damage * 0.35); tower.state = tower.hp <= 0 ? 'destroyed' : tower.hp < tower.maxHp * 0.45 ? 'damaged' : 'active'; this.emitParticles('defense', tower.x, tower.y, 4, PAL.coral); this.sfx('hit', 0.18, 0.72); if (tower.state === 'destroyed') { this.toast('TOWER DOWN / PAD ' + (tower.pad + 1)); this.sfx('loss', 0.18, 0.82); } }
          }
        }
        if (enemy.t >= 1) { this.reachCore(enemy); }
      }
    }

    reachCore(enemy) {
      var run = this.run;
      if (!enemy.active) return;
      var type = ENEMY_TYPES[enemy.type];
      var guardReduction = clamp(this.countRole('guard') * 0.055, 0, 0.28);
      run.core = Math.max(0, run.core - type.damage * (1 - guardReduction));
      run.score = Math.max(0, run.score - 3);
      enemy.active = false; enemy.state = 'recovery';
      run.shake = 0.7; run.stormFlash = 0.5; this.emitParticles('defense', CORE_X, CORE_Y, 9, PAL.coral); kit.juice.shake(3, 180); kit.juice.hitStop(70); this.sfx('hit', 0.35, 0.62);
      this.toast(type.label + ' HIT CORE / ' + Math.ceil(run.core) + '%');
    }

    updateTowers(dt) {
      var run = this.run;
      for (var i = 0; i < run.towers.length; i += 1) {
        var tower = run.towers[i];
        if (!tower || tower.state === 'destroyed') continue;
        tower.cooldown = Math.max(0, tower.cooldown - dt);
        if (tower.cooldown > 0 || run.resources.cold < tower.coldCost) continue;
        var target = this.chooseTarget(tower);
        if (!target) continue;
        var stats = towerStats(tower);
        run.resources.cold = Math.max(0, run.resources.cold - stats.coldCost);
        tower.cooldown = stats.cooldown; tower.state = tower.hp < tower.maxHp * 0.45 ? 'damaged' : 'active';
        this.fireProjectile(tower, target, stats);
        run.scout.state = 'command'; run.scout.timer = 0.28; this.emitParticles('tower', tower.x, tower.y, 3, stats.color); this.sfx('attack', 0.18, 0.9 + tower.level * 0.06);
      }
    }

    chooseTarget(tower) {
      var run = this.run; var stats = towerStats(tower); var best = null;
      for (var i = 0; i < run.enemies.length; i += 1) {
        var enemy = run.enemies[i];
        if (!enemy.active || dist(tower.x, tower.y, enemy.x, enemy.y) > stats.range) continue;
        if (!best) { best = enemy; continue; }
        if (tower.targetPolicy === 'strong' && enemy.hp < best.hp) best = enemy;
        else if (tower.targetPolicy === 'first' && enemy.t > best.t) best = enemy;
        else if (tower.targetPolicy === 'last' && enemy.t < best.t) best = enemy;
      }
      return best;
    }

    fireProjectile(tower, enemy, stats) {
      var run = this.run;
      var projectile = run.projectiles.find(function (shot) { return !shot.active; });
      if (!projectile) return;
      projectile.active = true; projectile.x = tower.x; projectile.y = tower.y; projectile.tx = enemy.x; projectile.ty = enemy.y; projectile.ttl = projectile.max; projectile.color = stats.color; projectile.damage = stats.damage; projectile.freeze = stats.freeze; projectile.splash = stats.splash; projectile.enemyId = enemy.id; projectile.towerId = tower.pad;
    }

    updateProjectiles(dt) {
      var run = this.run;
      for (var i = 0; i < run.projectiles.length; i += 1) {
        var shot = run.projectiles[i];
        if (!shot.active) continue;
        shot.ttl -= dt;
        var f = clamp(1 - shot.ttl / shot.max, 0, 1);
        shot.x = lerp(shot.x, shot.tx, f); shot.y = lerp(shot.y, shot.ty, f);
        if (shot.ttl <= 0) { this.resolveProjectile(shot); shot.active = false; }
      }
    }

    resolveProjectile(shot) {
      var run = this.run; var enemy = run.enemies[shot.enemyId];
      if (!enemy || !enemy.active) return;
      this.hitEnemy(enemy, shot.damage, shot.freeze, shot.splash);
    }

    hitEnemy(enemy, damage, freeze, splash) {
      var run = this.run; var type = ENEMY_TYPES[enemy.type];
      enemy.hp -= damage * (1 - type.resist * 0.12);
      this.applyFreeze(enemy, freeze);
      this.emitParticles('freeze', enemy.x, enemy.y, 4, PAL.frost); this.sfx('freeze', 0.12, 1.1);
      if (splash > 0) {
        for (var i = 0; i < run.enemies.length; i += 1) {
          var other = run.enemies[i];
          if (other.active && other.id !== enemy.id && dist(enemy.x, enemy.y, other.x, other.y) <= splash) { other.hp -= damage * 0.42; this.applyFreeze(other, freeze * 0.65); }
        }
      }
      if (enemy.hp <= 0) this.killEnemy(enemy);
    }

    applyFreeze(enemy, duration) {
      var type = ENEMY_TYPES[enemy.type];
      var amount = duration * (1 - type.resist);
      enemy.frozen.remaining = clamp(Math.max(enemy.frozen.remaining, amount + enemy.frozen.stacks * 0.12), 0, 2.8);
      enemy.frozen.stacks = clamp(enemy.frozen.stacks + 1, 0, 3);
      enemy.state = 'anticipation'; enemy.stateTime = 0.12;
    }

    killEnemy(enemy) {
      var run = this.run; var type = ENEMY_TYPES[enemy.type];
      enemy.active = false; run.kills += 1; run.score += type.reward; run.resources.cold = clamp(run.resources.cold + 2.5 + this.countRole('hunt') * 0.4, 0, 999); run.resources.food = clamp(run.resources.food + 1.5, 0, 999);
      this.emitParticles('wave', enemy.x, enemy.y, type.id === 'elite' ? 10 : 5, type.color); this.sfx('kill', type.id === 'elite' ? 0.4 : 0.16, type.id === 'elite' ? 0.66 : 1.26);
      if (type.id === 'elite') { run.shake = 0.5; kit.juice.hitStop(90); }
      if (run.coachStep === 3) run.coachStep = 4;
    }

    waveCleared() {
      var run = this.run;
      if (run.wave.next < run.wave.queue.length) return false;
      for (var i = 0; i < run.enemies.length; i += 1) if (run.enemies[i].active) return false;
      for (var j = 0; j < run.projectiles.length; j += 1) if (run.projectiles[j].active) return false;
      return !run.wave.cleared;
    }

    clearWave() {
      var run = this.run;
      run.wave.cleared = true; run.score += 35 + run.cycle * 12; run.resources.wood = clamp(run.resources.wood + 12 + this.countRole('chop') * 2, 0, 999); run.resources.cold = clamp(run.resources.cold + 10, 0, 999);
      run.scout.state = 'resolve'; run.scout.timer = 1.2; this.emitParticles('wave', CORE_X, CORE_Y, 16, PAL.green); this.sfx('waveClear', 0.48, 1.05); kit.juice.shake(2, 120);
      if (run.cycle >= run.target && run.mode !== 'endless') { this.endRun('win'); return; }
      run.cycle += 1; run.phase = 'calm'; run.phaseTime = 0; run.wave = { queue: [], next: 0, timer: 2.5, cleared: false }; run.scout.timer = 1.1;
      this.showBanner('WAVE CLEAR', 'CALM · UPGRADE', PAL.green); kit.audio.music('calmTheme', 300);
      if (run.coachStep < 5) run.coachStep = 5;
    }

    towerAt(x, y) {
      var run = this.run;
      for (var i = 0; i < run.towers.length; i += 1) if (run.towers[i] && dist(x, y, run.towers[i].x, run.towers[i].y) < 30) return run.towers[i];
      return null;
    }

    padAt(x, y) {
      for (var i = 0; i < PAD_POS.length; i += 1) if (dist(x, y, PAD_POS[i].x, PAD_POS[i].y) < 34) return i;
      return -1;
    }

    nearestTower(x, y, radius) {
      var run = this.run; var best = null; var bestDist = radius;
      for (var i = 0; i < run.towers.length; i += 1) {
        var tower = run.towers[i];
        if (!tower || tower.state === 'destroyed') continue;
        var d = dist(x, y, tower.x, tower.y);
        if (d < bestDist) { best = tower; bestDist = d; }
      }
      return best;
    }

    badgeAt(x, y) {
      if (y < 390 || y > 447) return null;
      var index = Math.floor((x - 14) / 61);
      var survivor = this.run && this.run.survivors[index];
      return survivor && survivor.alive ? survivor : null;
    }

    cacheAt(x, y) {
      var cache = this.run && this.run.cache;
      return !!(cache && !cache.found && dist(x, y, cache.x, cache.y) < 22);
    }

    findCache() {
      var run = this.run;
      if (!run || !run.cache || run.cache.found) return;
      run.cache.found = true;
      run.resources.wood = clamp(run.resources.wood + 20, 0, 999);
      run.resources.cold = clamp(run.resources.cold + 10, 0, 999);
      run.resources.food = clamp(run.resources.food + 8, 0, 999);
      run.score += 20;
      this.toast('CACHE +20W +10C +8F');
      this.emitParticles('wave', run.cache.x, run.cache.y, 10, PAL.warm);
      this.sfx('build', 0.4, 1.4);
    }

    roleAt(x, y) {
      if (y < 625 || y > 780 || x < 6 || x > 384) return -1;
      return clamp(Math.floor((x - 6) / 95), 0, ROLES.length - 1);
    }

    assignSelected(role) { if (this.run) this.assign(this.run.selectedSurvivor, role); }

    assign(id, role) {
      var run = this.run; var survivor = run && run.survivors.find(function (unit) { return unit.id === id; }); var definition = ROLE_BY_ID[role];
      if (!survivor || !survivor.alive || !definition) return;
      survivor.job = role; survivor.state = 'command'; run.selectedSurvivor = id; run.scout.state = 'command'; run.scout.timer = 0.55;
      this.toast(survivor.name + ' -> ' + definition.label); this.emitParticles('defense', 195, 395, 5, definition.color); this.sfx('select', 0.2, 1.15);
      if (run.coachStep === 1) run.coachStep = 2;
    }

    buildSelected() {
      var run = this.run; if (!run || run.phase !== 'calm') { if (run) this.toast('BUILD IN CALM'); return; }
      var type = TOWER_BY_ID[run.selectedTowerType] || TOWER_BY_ID.spire; var padIndex = run.selectedPad;
      if (run.towers[padIndex] && run.towers[padIndex].state !== 'destroyed') { this.toast('PAD OCCUPIED / UPGRADE'); this.sfx('cancel', 0.16, 0.58); return; }
      if (run.resources.wood < type.cost || run.resources.cold < type.coldCost) { this.toast('NEED ' + type.cost + 'W + ' + type.coldCost + 'C'); this.sfx('cancel', 0.2, 0.56); return; }
      run.resources.wood -= type.cost; run.resources.cold -= type.coldCost;
      var position = PAD_POS[padIndex];
      run.towers[padIndex] = { id: type.id + '-' + padIndex, type: type.id, pad: padIndex, x: position.x, y: position.y, level: 1, branch: 'glacier', targetPolicy: run.targetPolicy, cooldown: 0.3, hp: 100, maxHp: 100, state: 'active' };
      run.selectedTower = run.towers[padIndex]; run.score += 12; run.scout.state = 'command'; run.scout.timer = 0.7;
      this.toast(type.short + ' PLACED'); this.emitParticles('tower', position.x, position.y, 14, type.color); this.sfx('build', 0.5, 0.82 + padIndex * 0.08); kit.juice.shake(1.2, 90);
      if (run.coachStep === 2) run.coachStep = 3;
    }

    upgradeSelected() {
      var run = this.run; var tower = run && run.selectedTower;
      if (!tower) { this.toast('SELECT A PLACED TOWER'); return; }
      if (tower.state === 'destroyed') { this.toast('PAD DOWN / BUILD IN CALM'); return; }
      var wood = 16 + tower.level * 10; var cold = 8 + tower.level * 5;
      if (run.phase !== 'calm') { this.toast('UPGRADE IN CALM'); return; }
      if (tower.level >= 3) { this.cycleBranch(); return; }
      if (run.resources.wood < wood || run.resources.cold < cold) { this.toast('NEED ' + wood + 'W + ' + cold + 'C'); return; }
      run.resources.wood -= wood; run.resources.cold -= cold; tower.level += 1; tower.maxHp += 16; tower.hp = tower.maxHp; tower.cooldown = 0.15;
      if (tower.level === 2) tower.branch = tower.branch === 'glacier' ? 'glacier' : 'shard';
      run.score += 28; run.scout.state = 'command'; run.scout.timer = 0.55; this.toast('UPGRADED L' + tower.level + ' / ' + tower.branch.toUpperCase()); this.emitParticles('tower', tower.x, tower.y, 12, towerStats(tower).color); this.sfx('upgrade', 0.5, 1.12); kit.juice.hitStop(70);
    }

    cycleBranch() {
      var tower = this.run && this.run.selectedTower;
      if (!tower) { this.toast('SELECT A PLACED TOWER'); return; }
      tower.branch = tower.branch === 'glacier' ? 'shard' : 'glacier'; this.toast('BRANCH  ' + tower.branch.toUpperCase()); this.sfx('select', 0.2, tower.branch === 'glacier' ? 0.9 : 1.2);
    }

    cycleTarget() {
      var run = this.run; var tower = run && run.selectedTower;
      if (!tower) { run.targetPolicy = run.targetPolicy === 'first' ? 'strong' : run.targetPolicy === 'strong' ? 'last' : 'first'; this.toast('DEFAULT TARGET  ' + run.targetPolicy.toUpperCase()); return; }
      tower.targetPolicy = tower.targetPolicy === 'first' ? 'strong' : tower.targetPolicy === 'strong' ? 'last' : 'first'; run.targetPolicy = tower.targetPolicy; this.toast('TARGET  ' + tower.targetPolicy.toUpperCase()); this.sfx('select', 0.18, 0.98);
    }

    shiftTower(amount) {
      var current = TOWERS.findIndex(function (tower) { return tower.id === this.run.selectedTowerType; }, this);
      var next = (current + amount + TOWERS.length) % TOWERS.length;
      this.run.selectedTowerType = TOWERS[next].id;
      this.run.selectedTower = null;
      this.toast(TOWERS[next].short + ' SELECTED');
      this.sfx('select', 0.18, 1 + next * 0.1);
    }

    aliveCount() { var count = 0; for (var i = 0; this.run && i < this.run.survivors.length; i += 1) if (this.run.survivors[i].alive) count += 1; return count; }
    countRole(role) { var count = 0; for (var i = 0; this.run && i < this.run.survivors.length; i += 1) if (this.run.survivors[i].alive && this.run.survivors[i].job === role) count += 1; return count; }

    emitParticles(systemName, x, y, count, color) {
      var system = this.particleSystems[systemName]; if (!system) return; var emitted = 0;
      for (var i = 0; i < system.length && emitted < count; i += 1) {
        var view = system[i]; var p = view._fh; if (p.active) continue;
        var angle = Math.random() * Math.PI * 2; var speed = systemName === 'freeze' ? 28 + Math.random() * 36 : systemName === 'tower' ? 22 + Math.random() * 30 : systemName === 'wave' ? 18 + Math.random() * 48 : 15 + Math.random() * 34;
        p.active = true; p.x = x; p.y = y; p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed - (systemName === 'wave' ? 12 : 0); p.ttl = systemName === 'freeze' ? 0.42 : systemName === 'tower' ? 0.35 : systemName === 'wave' ? 0.8 : 0.5; p.max = p.ttl; p.size = systemName === 'defense' ? 4 : 3; p.color = color || PAL.white; p.spin = Math.random() * 4; view.setVisible(true); emitted += 1;
      }
    }

    updateParticles(dt) {
      var systems = this.particleSystems;
      Object.keys(systems).forEach(function (name) {
        systems[name].forEach(function (view) {
          var p = view._fh; if (!p.active) return;
          p.ttl -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (name === 'freeze' ? 8 : 25) * dt; p.vx *= 0.98;
          if (p.ttl <= 0) { p.active = false; view.setVisible(false); return; }
          view.setPosition(p.x, p.y).setSize(p.size, p.size).setFillStyle(p.color, clamp(p.ttl / p.max, 0, 1));
        });
      });
    }

    updateAmbience(dt) {
      if (!this.run || this.screen !== 'play') return;
      for (var i = 0; i < this.snow.length; i += 1) {
        var flake = this.snow[i]; var data = flake._fh; if (!flake.visible) continue;
        data.y += data.speed * dt * (this.run.phase === 'wave' ? 1.6 : 0.65); data.x += data.drift * dt;
        if (data.y > 448) data.y = 128; if (data.x < 0) data.x = W; if (data.x > W) data.x = 0;
        flake.setPosition(data.x, data.y).setAlpha(this.run.phase === 'wave' ? 0.72 : 0.32);
      }
      this.updateParticles(dt);
    }

    updateUi() {
      var run = this.run; if (!run) return;
      setTextIfChanged(this.ui.wave, 'WAVE ' + pad(run.waveNumber || run.cycle, 2) + (run.mode === 'endless' ? '' : ' / ' + run.target));
      setTextIfChanged(this.ui.phase, (run.phase === 'wave' ? 'WAVE ' : 'CALM ') + Math.ceil(Math.max(0, (run.phase === 'wave' ? WAVE_DURATION : CALM_DURATION) - run.phaseTime)) + 's');
      setColorIfChanged(this.ui.phase, run.phase === 'wave' ? PAL.coral : PAL.green);
      setTextIfChanged(this.ui.wood, String(Math.floor(run.resources.wood))); setTextIfChanged(this.ui.cold, String(Math.floor(run.resources.cold))); setTextIfChanged(this.ui.core, Math.ceil(run.core) + '%');
      setColorIfChanged(this.ui.core, run.core < 30 ? PAL.coral : run.core < 60 ? PAL.warm : PAL.ink);
      setTextIfChanged(this.ui.pause, this.pausedByKit ? 'RESUME' : 'PAUSE');
      var coach = run.phase === 'wave' ? 'WAVE ' + pad(run.waveNumber, 2) + ' · FREEZE BEFORE CORE' : run.coachStep === 0 ? 'SELECT A TOWER' : run.coachStep === 1 ? 'SELECT PAD · BUILD' : run.coachStep === 2 ? 'DRAG SURVIVOR TO ROLE' : run.coachStep === 3 ? 'WATCH RANGE · COLD' : run.coachStep === 4 ? 'FROZEN TARGETS SLOW' : 'CALM · UPGRADE';
      if (coach !== run.coachText) { run.coachText = coach; run.coachAge = 0; }
      setTextIfChanged(this.ui.coach, coach); setColorIfChanged(this.ui.coach, run.phase === 'wave' ? PAL.coral : PAL.muted);
      this.updateHudMeters(run);
      var selectedType = TOWER_BY_ID[run.selectedTowerType] || TOWER_BY_ID.spire; var selected = run.selectedTower;
      if (selected) setTextIfChanged(this.ui.towerTitle, selected.type.toUpperCase() + ' · L' + selected.level + ' · ' + selected.targetPolicy.toUpperCase() + ' · ' + selected.branch.toUpperCase());
      else setTextIfChanged(this.ui.towerTitle, selectedType.short + ' · PAD ' + (run.selectedPad + 1));
      var activeTransient = run.transient;
      var coachAlpha = !activeTransient ? (run.coachAge > 2.2 ? lerp(1, 0.12, clamp((run.coachAge - 2.2) / 0.8, 0, 1)) : 1) : 0;
      this.ui.coach.setAlpha(coachAlpha);
      setTextIfChanged(this.ui.actionBuild, 'BUILD'); setTextIfChanged(this.ui.actionUpgrade, 'UPGRADE'); setTextIfChanged(this.ui.actionTarget, 'TARGET');
      for (var i = 0; i < TOWERS.length; i += 1) this.updateTowerUi(TOWERS[i], this.towerUi[i]);
      for (var j = 0; j < ROLES.length; j += 1) this.updateRoleUi(ROLES[j], this.roleUi[j]);
      for (var k = 0; k < run.survivors.length; k += 1) this.updateBadgeUi(k);
      for (var m = run.survivors.length; m < this.badgeUi.length; m += 1) this.badgeUi[m].setVisible(false);
      this.pauseLayer.setVisible(this.pausedByKit);
      this.updateTransient();
    }

    updateHudMeters(run) {
      var g = this.hudG; g.clear();
      var drawIcon = function (x, color, kind) {
        g.fillStyle(color, 0.9); g.lineStyle(1, PAL.white, 0.55);
        if (kind === 'wood') { g.fillRect(x - 7, 70, 14, 12); g.strokeRect(x - 7, 70, 14, 12); g.lineBetween(x - 4, 73, x + 4, 79); }
        else if (kind === 'cold') { g.fillCircle(x, 76, 7); g.strokeCircle(x, 76, 7); g.lineBetween(x - 5, 76, x + 5, 76); g.lineBetween(x, 71, x, 81); }
        else { g.fillTriangle(x, 68, x - 7, 83, x + 7, 83); g.strokeTriangle(x, 68, x - 7, 83, x + 7, 83); }
      };
      var meter = function (x, value, max, color) { g.fillStyle(PAL.shadow, 0.9); g.fillRect(x, 88, 58, 3); g.fillStyle(color, 0.9); g.fillRect(x, 88, 58 * clamp(value / max, 0, 1), 3); };
      drawIcon(18, PAL.wood, 'wood'); drawIcon(108, PAL.frost, 'cold'); drawIcon(216, run.core < 30 ? PAL.coral : PAL.warm, 'core');
      meter(32, run.resources.wood, 100, PAL.wood); meter(122, run.resources.cold, 100, PAL.frost); meter(230, run.core, run.maxCore, run.core < 30 ? PAL.coral : PAL.warm);
    }

    updateTowerUi(tower, ui) {
      var index = TOWERS.indexOf(tower); var x = 65 + index * 130;
      ui.label.setPosition(x, 469); ui.cost.setPosition(x, 516); ui.label.setVisible(true); ui.cost.setVisible(true);
      setTextIfChanged(ui.label, tower.short); setTextIfChanged(ui.cost, tower.cost + 'W + ' + tower.coldCost + 'C');
      setColorIfChanged(ui.cost, this.run.resources.wood >= tower.cost && this.run.resources.cold >= tower.coldCost ? PAL.ink : PAL.coral);
    }

    updateRoleUi(role, ui) {
      var index = ROLES.indexOf(role); var x = 53 + index * 95;
      ui.mark.setPosition(x, 653); ui.count.setPosition(x, 690); setTextIfChanged(ui.mark, role.icon); setTextIfChanged(ui.count, String(this.countRole(role.id)));
    }

    updateBadgeUi(index) {
      var survivor = this.run.survivors[index]; var x = 31 + index * 61; var y = 409;
      this.badgeUi[index].setVisible(true).setPosition(x, y); setTextIfChanged(this.badgeUi[index], survivor.name.slice(0, 1));
      setColorIfChanged(this.badgeUi[index], !survivor.alive ? PAL.coral : survivor.id === this.run.selectedSurvivor ? PAL.ice : PAL.ink); this.badgeUi[index].setAlpha(survivor.alive ? 1 : 0.45);
    }

    activeEnemyCount() { var count = 0; if (!this.run) return count; for (var i = 0; i < this.run.enemies.length; i += 1) if (this.run.enemies[i].active) count += 1; return count; }
    guardShield() { return 4 + this.countRole('guard') * 7 + this.run.towers.filter(function (tower) { return tower && tower.state !== 'destroyed'; }).length * 2; }

    drawDynamic() {
      var run = this.run; if (!run) return; var g = this.dynamic; g.clear();
      this.drawPadsAndTowers(g, run); this.drawEnemies(g, run); this.drawProjectiles(g, run); this.drawScout(g, run); this.drawRoles(g, run);
      if (run.phase === 'wave') { g.fillStyle(PAL.ice, 0.04 + Math.sin(run.simTime * 4) * 0.015); g.fillEllipse(CORE_X, CORE_Y, 92, 58); }
      var selected = run.selectedTower ? run.selectedTower : null;
      if (selected) { var stats = towerStats(selected); g.lineStyle(1, stats.color, 0.38); g.strokeCircle(selected.x, selected.y, stats.range); g.lineStyle(2, stats.color, 0.7); g.lineBetween(selected.x, selected.y, selected.x + Math.cos(run.site.angle) * 24, selected.y + Math.sin(run.site.angle) * 24); }
      else { var type = TOWER_BY_ID[run.selectedTowerType] || TOWER_BY_ID.spire; var padPosition = PAD_POS[run.selectedPad]; g.lineStyle(2, type.color, 0.8); g.strokeCircle(padPosition.x, padPosition.y, 24); g.lineStyle(1, type.color, 0.35); g.strokeCircle(padPosition.x, padPosition.y, type.range); }
      if (!run.cache.found) { g.fillStyle(PAL.warm, 0.1); g.fillCircle(run.cache.x, run.cache.y, 21); g.lineStyle(1, PAL.warm, 0.7); g.strokeCircle(run.cache.x, run.cache.y, 10); g.fillStyle(PAL.warm, 0.9); g.fillCircle(run.cache.x, run.cache.y, 4 + Math.sin(run.simTime * 4) * 1.5); }
      else { g.fillStyle(PAL.dim, 0.55); g.fillCircle(run.cache.x, run.cache.y, 5); }
      this.drawControls(g, run);
    }

    drawPadsAndTowers(g, run) {
      for (var i = 0; i < PAD_POS.length; i += 1) {
        var p = PAD_POS[i]; var tower = run.towers[i]; var selected = run.selectedPad === i;
        g.fillStyle(tower ? 0x123342 : 0x0c2531, 0.9); g.fillCircle(p.x, p.y, 25); g.lineStyle(selected ? 2 : 1, tower ? towerStats(tower).color : PAL.line, selected ? 1 : 0.8); g.strokeCircle(p.x, p.y, 25);
        if (tower) drawTowerIcon(g, tower, p.x, p.y, run);
        else { g.lineStyle(1, PAL.dim, 0.65); g.lineBetween(p.x - 8, p.y, p.x + 8, p.y); g.lineBetween(p.x, p.y - 8, p.x, p.y + 8); }
      }
    }

    drawEnemies(g, run) {
      for (var i = 0; i < run.enemies.length; i += 1) {
        var enemy = run.enemies[i]; if (!enemy.active) continue; var type = ENEMY_TYPES[enemy.type]; var pulse = enemy.state === 'anticipation' ? 1 + Math.sin(run.simTime * 18 + enemy.id) * 0.18 : 1; var r = type.radius * pulse;
        g.fillStyle(type.color, enemy.frozen.remaining > 0 ? 0.38 : 0.88); g.fillCircle(enemy.x, enemy.y, r); g.lineStyle(enemy.frozen.remaining > 0 ? 2 : 1, enemy.frozen.remaining > 0 ? PAL.ice : PAL.deep, 1); g.strokeCircle(enemy.x, enemy.y, r);
        if (type.id === 'brute' || type.id === 'elite') { g.lineStyle(2, type.color, 0.8); g.lineBetween(enemy.x - r, enemy.y - r, enemy.x + r, enemy.y + r); g.lineBetween(enemy.x + r, enemy.y - r, enemy.x - r, enemy.y + r); }
        else if (type.id === 'wraith') { g.lineStyle(2, PAL.white, 0.65); g.lineBetween(enemy.x, enemy.y - r - 4, enemy.x, enemy.y + r + 4); }
        g.fillStyle(PAL.shadow, 0.8); g.fillRect(enemy.x - 12, enemy.y - r - 8, 24, 3); g.fillStyle(enemy.frozen.remaining > 0 ? PAL.ice : PAL.coral, 1); g.fillRect(enemy.x - 12, enemy.y - r - 8, 24 * clamp(enemy.hp / enemy.maxHp, 0, 1), 3);
      }
    }

    drawProjectiles(g, run) {
      for (var i = 0; i < run.projectiles.length; i += 1) { var shot = run.projectiles[i]; if (!shot.active) continue; g.fillStyle(shot.color, 0.95); g.fillCircle(shot.x, shot.y, 4); g.lineStyle(2, shot.color, 0.28); g.lineBetween(shot.x, shot.y, shot.tx, shot.ty); }
    }

    drawScout(g, run) {
      var bob = Math.sin(run.simTime * 3.2) * (run.scout.state === 'idle' ? 2 : 4); var x = run.scout.x; var y = run.scout.y + bob; var color = run.scout.state === 'command' ? PAL.warm : run.scout.state === 'resolve' ? PAL.green : PAL.ice;
      g.fillStyle(color, 0.18); g.fillCircle(x, y, 18); g.fillStyle(color, 0.95); g.fillCircle(x, y - 7, 5); g.fillRect(x - 5, y, 10, 13); g.lineStyle(2, color, 0.9); g.lineBetween(x + 5, y + 2, x + 14, y - 9); g.lineBetween(x - 7, y + 13, x - 12, y + 20); g.lineBetween(x + 7, y + 13, x + 12, y + 20);
      g.fillStyle(PAL.shadow, 0.82); g.fillRoundedRect(x - 25, y + 24, 50, 13, 5); g.fillStyle(color, 0.95); g.fillRect(x - 20, y + 27, 40, 2);
    }

    drawRoles(g, run) {
      for (var i = 0; i < ROLES.length; i += 1) {
        var role = ROLES[i]; var x = 6 + i * 95; var selected = run.survivors[run.selectedSurvivor] && run.survivors[run.selectedSurvivor].job === role.id; var count = this.countRole(role.id); var ratio = run.survivors.length ? count / run.survivors.length : 0;
        g.fillStyle(selected ? 0x1b4553 : PAL.panel2, 1); g.fillRoundedRect(x, 625, 89, 155, 9); g.lineStyle(selected ? 2 : 1, selected ? role.color : PAL.line, selected ? 1 : 0.9); g.strokeRoundedRect(x, 625, 89, 155, 9); g.fillStyle(role.color, 0.88); g.fillCircle(x + 44, 653, 18); drawRoleIcon(g, role, x + 44, 653); g.fillStyle(PAL.shadow, 0.9); g.fillRect(x + 12, 750, 65, 3); g.fillStyle(role.color, 0.9); g.fillRect(x + 12, 750, 65 * ratio, 3);
      }
    }

    drawControls(g, run) {
      for (var i = 0; i < TOWERS.length; i += 1) { var tower = TOWERS[i]; var x = i * 130; var selected = run.selectedTowerType === tower.id; g.fillStyle(selected ? 0x1a4151 : PAL.panel2, 1); g.fillRoundedRect(x + 5, 452, 120, 82, 9); g.lineStyle(selected ? 2 : 1, selected ? tower.color : PAL.line, 1); g.strokeRoundedRect(x + 5, 452, 120, 82, 9); drawTowerCardIcon(g, tower, x + 65, 485); }
      g.fillStyle(0x163443, 1); g.fillRoundedRect(14, 540, 362, 72, 10); g.lineStyle(1, run.selectedTower ? towerStats(run.selectedTower).color : PAL.line, 1); g.strokeRoundedRect(14, 540, 362, 72, 10);
      g.lineStyle(1, PAL.line, 0.6); g.lineBetween(130, 548, 130, 604); g.lineBetween(260, 548, 260, 604);
      g.fillStyle(PAL.cyan, 0.12); g.fillRoundedRect(18, 544, 106, 63, 8); g.fillStyle(PAL.warm, 0.12); g.fillRoundedRect(136, 544, 118, 63, 8); g.fillStyle(PAL.violet, 0.12); g.fillRoundedRect(266, 544, 106, 63, 8);
      if (run.phase === 'wave') { g.fillStyle(PAL.coral, 0.08); g.fillEllipse(195, 278, 340, 270); }
      for (var j = 0; j < run.survivors.length; j += 1) { var sx = 31 + j * 61; var survivor = run.survivors[j]; g.fillStyle(survivor.alive ? (survivor.id === run.selectedSurvivor ? PAL.ice : ROLE_BY_ID[survivor.job].color) : PAL.coral, survivor.alive ? 0.9 : 0.25); g.fillCircle(sx, 409, 14); g.lineStyle(1, PAL.deep, 1); g.strokeCircle(sx, 409, 14); }
      for (var id in run.drags) { var drag = run.drags[id]; g.fillStyle(PAL.panel2, 0.94); g.fillRoundedRect(drag.x - 34, drag.y - 18, 68, 36, 7); g.lineStyle(2, PAL.cyan, 1); g.strokeRoundedRect(drag.x - 34, drag.y - 18, 68, 36, 7); }
    }

    updateTransient() {
      var run = this.run; var transient = run && run.transient;
      if (!transient) {
        this.banner.setVisible(false); this.toastBack.setVisible(false); this.ui.toast.setVisible(false);
        return;
      }
      var fade = transient.age > transient.hold - 0.22 ? clamp((transient.hold - transient.age) / 0.22, 0, 1) : 1;
      if (transient.kind === 'banner') {
        var scale = !kit.juice.enabled ? 1 : transient.age < 0.2 ? 0.86 + transient.age * 0.7 : 1;
        this.banner.setVisible(true).setScale(scale).setAlpha(fade);
        this.toastBack.setVisible(false); this.ui.toast.setVisible(false);
      } else {
        this.banner.setVisible(false); this.toastBack.setVisible(true).setAlpha(fade); this.ui.toast.setVisible(true).setAlpha(fade);
      }
    }

    updateProbe() {
      var run = this.run; PROBE.mode = run ? run.mode : this.screen; PROBE.cycle = run ? run.cycle : 0; PROBE.wave = run ? run.waveNumber : 0; PROBE.core = run ? Math.ceil(run.core) : 0; PROBE.cold = run ? Math.floor(run.resources.cold) : 0; PROBE.enemies = run ? this.activeEnemyCount() : 0; PROBE.score = run ? Math.floor(run.score) : profile.bestScore;
    }

    medalsFor(run) {
      var target = run.mode === 'endless' ? Math.max(10, run.cycle) : run.target; var win = run.result === 'win'; var core = run.core;
      var waveMedal = win && core >= run.maxCore * 0.75 ? 3 : win ? 2 : 0; var killMedal = win && run.losses === 0 ? 3 : win && run.losses < 2 ? 2 : win ? 1 : 0; var coldMedal = win && run.resources.cold >= 8 ? 3 : win && run.resources.cold >= 0 ? 2 : 0;
      return { wave: waveMedal, loss: killMedal, cold: coldMedal, total: waveMedal + killMedal + coldMedal, target: target };
    }

    endRun(result) {
      var run = this.run; if (!run || run.ended) return;
      run.ended = true; run.result = result; run.score += result === 'win' ? run.cycle * 100 + run.kills * 8 + Math.ceil(run.core) : run.kills * 5;
      run.medals = this.medalsFor(run);
      if (run.mode === 'scenario' && result === 'win') { var index = SCENARIOS.findIndex(function (scenario) { return scenario.id === run.scenarioId; }); if (index >= 0) profile.scenarios.medals[index] = Math.max(profile.scenarios.medals[index] || 0, Math.max(run.medals.wave, run.medals.loss, run.medals.cold)); }
      if (run.mode === 'run' && result === 'win') profile.endlessUnlocked = true;
      if (run.mode === 'endless' || result === 'win') profile.bestScore = Math.max(profile.bestScore, Math.floor(run.score));
      kit.save.set(profile); kit.audio.stopMusic(220); this.sfx(result === 'win' ? 'victory' : 'loss', 0.62, result === 'win' ? 1 : 0.58); kit.audio.music(result === 'win' ? 'victoryTheme' : 'dangerTheme', 180); this.showResult(); this.updateProbe();
    }

    showResult() {
      var run = this.run; this.screen = 'result'; this.world.setVisible(false); this.dynamic.setVisible(false); this.banner.setVisible(false); this.toastBack.setVisible(false); this.ui.toast.setVisible(false); this.pauseLayer.setVisible(false); this.snow.forEach(function (flake) { flake.setVisible(false); }); this.result.setVisible(true);
      var win = run.result === 'win'; var medal = run.medals || { wave: 0, loss: 0, cold: 0 };
      setTextIfChanged(this.resultKicker, run.mode === 'scenario' ? run.scenario.name : run.mode === 'endless' ? 'ENDLESS EXPANSE' : 'MAIN SURVIVAL'); setColorIfChanged(this.resultKicker, win ? PAL.warm : PAL.coral);
      setTextIfChanged(this.resultTitle, win ? 'THE CORE HOLDS' : 'THE LINE BREAKS'); setTextIfChanged(this.resultBody, win ? 'The frostborn turned back at the last ember.' : 'The cold found a route through the defense.'); setTextIfChanged(this.resultStats, 'WAVE ' + run.waveNumber + '   /   KILLS ' + run.kills + '   /   CORE ' + Math.ceil(run.core) + '%   /   SCORE ' + Math.floor(run.score));
      setTextIfChanged(this.resultMedals, 'CORE  ' + '★'.repeat(medal.wave) + '○'.repeat(3 - medal.wave) + '    ROLES  ' + '★'.repeat(medal.loss) + '○'.repeat(3 - medal.loss) + '    COLD  ' + '★'.repeat(medal.cold) + '○'.repeat(3 - medal.cold)); setTextIfChanged(this.resultMedalCopy, 'core integrity  /  role synergy  /  cold reserve'); this.resultButton.setStrokeStyle(2, win ? PAL.green : PAL.coral, 1);
    }

    renderFrame(juice) {
      if (!this.run || this.screen !== 'play') return;
      this.updateUi(); this.drawDynamic(); var shake = juice || kit.juice.frame(); this.world.setPosition(shake && kit.juice.enabled ? shake.dx : 0, shake && kit.juice.enabled ? shake.dy : 0); if (this.staticImage) this.staticImage.setAlpha(this.run.stormFlash > 0 && kit.juice.enabled ? 0.92 : 1);
    }

    forceCycle(value) {
      var next = Number(value); if (!Number.isFinite(next)) next = 1; next = clamp(next, 1, 99);
      if (!this.run) { pendingCycle = next; this.startMode('run'); return; }
      this.run.cycle = Math.floor(next); this.run.phase = 'calm'; this.run.phaseTime = 0; this.run.wave = { queue: [], next: 0, timer: 2.5, cleared: false }; this.toast('TEST SWITCH  /  WAVE ' + this.run.cycle); this.updateProbe();
    }

    forceScenario(value) {
      var scenario = safeScenario(value); pendingScenario = null; this.startMode('scenario', scenario.id);
    }

    update(time, delta) {
      this.handleControls();
      var frameDelta = clamp(Number(delta) || 0, 0, 100) / 1000; var juice = kit.juice.frame();
      if (this.screen === 'play' && this.run && !this.run.ended && !kit.paused && !this.pausedByKit && !juice.frozen) {
        this.accumulator += frameDelta; var steps = 0;
        while (this.accumulator >= STEP && steps < MAX_STEPS) { this.stepSim(STEP); this.accumulator -= STEP; steps += 1; }
        if (steps === MAX_STEPS && this.accumulator >= STEP) this.accumulator = 0;
        this.updateAmbience(steps * STEP); this.renderFrame(juice);
      } else if (this.screen === 'play' && this.run) {
        this.updateUi(); this.drawDynamic();
      }
      if (this.screen === 'play' && this.run && this.run.ended) this.showResult();
    }
  }

  function pointOnRoute(route, t) {
    var normalized = clamp(t, 0, 1) * 2; var segment = normalized < 1 ? 0 : 1; var local = segment === 0 ? normalized : normalized - 1; var a = route[segment]; var b = route[segment + 1];
    return { x: lerp(a.x, b.x, local), y: lerp(a.y, b.y, local) };
  }

  function towerStats(tower) {
    var base = TOWER_BY_ID[tower.type] || TOWER_BY_ID.spire; var level = tower.level || 1; var branch = tower.branch === 'shard';
    return { color: branch ? PAL.ice : base.color, range: base.range + (level - 1) * (branch ? 8 : 4), cooldown: Math.max(0.35, base.cooldown - (level - 1) * (branch ? 0.12 : 0.08)), damage: base.damage + (level - 1) * (branch ? 10 : 5), freeze: base.freeze + (level - 1) * (branch ? 0.35 : 0.18), splash: base.splash + (branch ? 12 : 0), coldCost: Math.max(3, base.coldCost - (level - 1) * 1) };
  }

  function drawRoleIcon(g, role, x, y) {
    g.lineStyle(2, PAL.deep, 0.9);
    if (role.id === 'hunt') { g.lineBetween(x - 8, y + 7, x + 8, y - 7); g.lineBetween(x - 8, y - 7, x + 8, y + 7); g.strokeCircle(x, y, 8); }
    else if (role.id === 'chop') { g.lineBetween(x - 8, y + 8, x + 5, y - 8); g.lineBetween(x + 1, y - 8, x + 10, y - 3); g.lineBetween(x + 1, y - 8, x + 5, y - 14); }
    else if (role.id === 'mend') { g.lineBetween(x - 9, y, x + 9, y); g.lineBetween(x, y - 9, x, y + 9); }
    else { g.lineBetween(x, y - 11, x, y + 11); g.lineBetween(x - 10, y - 2, x, y - 11); g.lineBetween(x, y - 11, x + 10, y - 2); g.lineBetween(x - 8, y + 7, x, y + 11); g.lineBetween(x, y + 11, x + 8, y + 7); }
  }

  function drawTowerCardIcon(g, tower, x, y) { g.fillStyle(tower.color, 0.2); g.fillCircle(x, y, 17); g.lineStyle(2, tower.color, 0.9); if (tower.icon === 'spire') { g.fillTriangle(x, y - 18, x - 11, y + 14, x + 11, y + 14); g.lineBetween(x - 5, y + 4, x + 5, y + 4); } else if (tower.icon === 'lens') { g.strokeCircle(x, y, 12); g.lineBetween(x - 16, y, x + 16, y); g.lineBetween(x, y - 16, x, y + 16); } else { g.strokeCircle(x, y, 12); g.lineBetween(x - 13, y + 13, x + 13, y - 13); g.lineBetween(x - 13, y - 13, x + 13, y + 13); } }

  function drawTowerIcon(g, tower, x, y, run) {
    var stats = towerStats(tower); var pulse = tower.cooldown <= 0 ? 1 + Math.sin(run.simTime * 8) * 0.08 : 1; var color = tower.state === 'destroyed' ? PAL.coral : stats.color;
    g.fillStyle(color, tower.state === 'destroyed' ? 0.18 : 0.35); g.fillCircle(x, y, 18 * pulse); g.lineStyle(tower.state === 'damaged' ? 2 : 1, color, 1); g.strokeCircle(x, y, 18);
    if (tower.type === 'spire') { g.fillStyle(color, 0.9); g.fillTriangle(x, y - 19, x - 10, y + 13, x + 10, y + 13); g.lineStyle(2, PAL.white, 0.7); g.lineBetween(x, y - 12, x, y + 8); }
    else if (tower.type === 'lens') { g.fillStyle(color, 0.85); g.fillRect(x - 14, y - 6, 28, 12); g.fillStyle(PAL.white, 0.8); g.fillCircle(x, y, 5); g.lineStyle(2, color, 1); g.lineBetween(x - 16, y - 16, x + 16, y + 16); }
    else { g.fillStyle(color, 0.85); g.fillCircle(x, y, 8); g.lineStyle(3, color, 0.9); g.strokeCircle(x, y, 14); g.lineBetween(x - 14, y, x + 14, y); g.lineBetween(x, y - 14, x, y + 14); }
    g.fillStyle(PAL.shadow, 0.84); g.fillRect(x - 17, y + 21, 34, 3); g.fillStyle(tower.state === 'damaged' ? PAL.coral : PAL.green, 1); g.fillRect(x - 17, y + 21, 34 * clamp(tower.hp / tower.maxHp, 0, 1), 3);
  }

  function boot() {
    kit.loader.show('FROSTHOLD'); kit.loader.progress(0.3);
    window.__fh = { state: PROBE, forceCycle: function (value) { if (sceneRef) sceneRef.forceCycle(value); else pendingCycle = value; }, forceScenario: function (value) { if (sceneRef) sceneRef.forceScenario(value); else pendingScenario = value; } };
    var game = new Phaser.Game({ type: Phaser.AUTO, width: W, height: H, parent: 'game', backgroundColor: '#07131f', render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [FrostholdScene], banner: false });
    kit.loader.progress(0.82); kit.registerPWA(); window.__fh.game = game;
  }

  boot();
}());
