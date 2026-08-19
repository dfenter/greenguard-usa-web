(function () {
  'use strict';
  var WORLD = 12600;
  var REGION_WIDTH = WORLD / 5;
  var WING_SLOTS = [
    { side: -52, back: 32 },
    { side: 52, back: 32 },
    { side: 0, back: 78 },
    { side: -76, back: 102 },
    { side: 76, back: 102 },
    { side: 0, back: 142 },
    { side: -112, back: 158 },
    { side: 112, back: 158 }
  ];

  var BASE_TYPES = {
    hive: {
      name: 'WARDEN SPAWN HIVE', subtitle: 'STREAMS HOSTILES UNTIL SILENCED',
      frame: 'deco_core', color: 0xc480ff, hp: 560, r: 76, scale: 1.12,
      guard: ['drifter', 'sprinter', 'sapper']
    },
    bastion: {
      name: 'WARDEN TURRET BASTION', subtitle: 'HEAVY FIRE. CLOSE THE DISTANCE.',
      frame: 'deco_pylon', color: 0xff756a, hp: 720, r: 72, scale: 1.18,
      guard: ['bulwark', 'lancer', 'sprinter']
    },
    relay: {
      name: 'MERIDIAN RELAY FORTRESS', subtitle: 'BUFFS HOSTILES IN ITS SIGNAL RADIUS',
      frame: 'deco_grate', color: 0x7ac8ff, hp: 500, r: 78, scale: 1.22,
      guard: ['weaver', 'lancer', 'bulwark']
    }
  };
  var BASE_SCHEDULE = [
    { at: 42,  type: 'hive',    x: 3040,  y: -1080 }, // Ember Drift
    { at: 128, type: 'bastion', x: -3020, y: 1420 },  // Void Rift
    { at: 238, type: 'relay',   x: 5060,  y: -1640 }, // Crystal Shoals
    { at: 348, type: 'bastion', x: -5260, y: 1160 },  // Aurelion Graveyard
    { at: 468, type: 'hive',    x: 720,   y: 1540 }   // Meridian Verge
  ];

  var REGIONS = [
    {
      key: 'aurelion-graveyard', code: 'ARG', name: 'AURELION GRAVEYARD',
      minX: -WORLD / 2, maxX: -WORLD / 2 + REGION_WIDTH,
      flavor: 'CAPITAL HULKS // GRAVITY WAKES IN THE DEBRIS',
      mechanic: 'DERELICT WAKE',
      palette: { ground: 0x171b2b, far: 0x312846, mid: 0x5a3148, near: 0x9a5b55,
        grid: 0x76536e, border: 0xffb47e, stars: [0xffc78d, 0xb86b8d, 0x7e6fa8] },
      landmarks: [
        { frame: 'deco_grate', tint: 0x9a5b55, scale: 2.8, rot: 0.2 },
        { frame: 'deco_plate', tint: 0xc07d62, scale: 3.6, rot: -0.4 },
        { frame: 'deco_hazard', tint: 0xffb47e, scale: 2.2, rot: 0.8 },
        { frame: 'deco_grate', tint: 0x6e577e, scale: 3.3, rot: 1.1 }
      ]
    },
    {
      key: 'void-rift', code: 'VDR', name: 'VOID RIFT',
      minX: -WORLD / 2 + REGION_WIDTH, maxX: -WORLD / 2 + REGION_WIDTH * 2,
      flavor: 'LIGHTNING TEAR // VISION POCKETS AHEAD',
      mechanic: 'VISION POCKETS',
      palette: { ground: 0x0a1020, far: 0x1c1e46, mid: 0x292a66, near: 0x4f3d88,
        grid: 0x3d4c91, border: 0x9b8cff, stars: [0xa89cff, 0x6e8bff, 0xd0c8ff] },
      landmarks: [
        { frame: 'deco_plate', tint: 0x2e2874, scale: 4.1, rot: 0 },
        { frame: 'deco_hazard', tint: 0x9b8cff, scale: 2.5, rot: -0.7 },
        { frame: 'deco_vent', tint: 0x6e8bff, scale: 2.3, rot: 0.4 },
        { frame: 'deco_plate', tint: 0x5f48a8, scale: 3.2, rot: 0 }
      ]
    },
    {
      key: 'meridian-verge', code: 'MVR', name: 'MERIDIAN VERGE',
      minX: -REGION_WIDTH / 2, maxX: REGION_WIDTH / 2,
      flavor: 'STABLE GRID // THE CORE MOUNT HOLDS',
      mechanic: 'ANCHOR GRID',
      palette: { ground: 0x102c3b, far: 0x164b61, mid: 0x1f7180, near: 0x39a89b,
        grid: 0x2b8091, border: 0x54d6ff, stars: [0x8effd8, 0x54d6ff, 0xa7ffe0] },
      landmarks: [
        { frame: 'deco_pylon', tint: 0x54d6ff, scale: 1.4, rot: 0 },
        { frame: 'deco_grate', tint: 0x7ac8ff, scale: 1.8, rot: 0.4 },
        { frame: 'deco_plate', tint: 0x8effd8, scale: 2.1, rot: -0.3 },
        { frame: 'deco_hazard', tint: 0xffd67a, scale: 1.8, rot: 0.7 }
      ]
    },
    {
      key: 'ember-drift', code: 'EMD', name: 'EMBER DRIFT',
      minX: WORLD / 2 - REGION_WIDTH * 2, maxX: WORLD / 2 - REGION_WIDTH,
      flavor: 'RED NEBULA // DRIFT HAZARDS CROSS THE LANE',
      mechanic: 'DRIFT HAZARDS',
      palette: { ground: 0x351b22, far: 0x5d2029, mid: 0x8b302d, near: 0xc1513d,
        grid: 0x9b3c37, border: 0xff756a, stars: [0xffc361, 0xff756a, 0xff9a5a] },
      landmarks: [
        { frame: 'deco_plate', tint: 0xff756a, scale: 2.7, rot: -0.5 },
        { frame: 'deco_hazard', tint: 0xffc361, scale: 2.4, rot: 0.2 },
        { frame: 'deco_vent', tint: 0xff9a5a, scale: 2.1, rot: 1.0 },
        { frame: 'deco_plate', tint: 0x9b3c37, scale: 3.4, rot: 0 }
      ]
    },
    {
      key: 'crystal-shoals', code: 'CRS', name: 'CRYSTAL SHOALS',
      minX: WORLD / 2 - REGION_WIDTH, maxX: WORLD / 2,
      flavor: 'ARCTIC REFRACTION // SHARDS DRIFT BETWEEN THE STARS',
      mechanic: 'REFRACTION FIELDS',
      palette: { ground: 0x173546, far: 0x2c657c, mid: 0x4c9db0, near: 0x86d7d4,
        grid: 0x62a8bf, border: 0xa7f3ff, stars: [0xc9ffff, 0x8fe7ff, 0xb8c7ff] },
      landmarks: [
        { frame: 'deco_hazard', tint: 0xa7f3ff, scale: 2.7, rot: 0.3 },
        { frame: 'deco_grate', tint: 0x8fe7ff, scale: 2.0, rot: -0.8 },
        { frame: 'deco_vent', tint: 0xc9ffff, scale: 2.5, rot: 0.6 },
        { frame: 'deco_plate', tint: 0x62a8bf, scale: 3.7, rot: 0 }
      ]
    }
  ];

  var REGION_ANCHORS = [
    [0.10, -0.58], [0.27, 0.38], [0.43, -0.18], [0.58, 0.65],
    [0.74, -0.42], [0.90, 0.18], [0.36, 0.82], [0.68, -0.78]
  ];
  var REGION_BY_KEY = {};
  for (var rbi = 0; rbi < REGIONS.length; rbi++) REGION_BY_KEY[REGIONS[rbi].key] = REGIONS[rbi];
  function regionIndexAtX(x) {
    for (var rix = 0; rix < REGIONS.length; rix++) {
      if (x >= REGIONS[rix].minX && x < REGIONS[rix].maxX) return rix;
    }
    return x < REGIONS[0].minX ? 0 : REGIONS.length - 1;
  }
  function regionAtX(x) { return REGIONS[regionIndexAtX(x)]; }
  function noise01(n) {
    var v = Math.sin(n * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  }

  var FONT_DISPLAY = '"HM Display", "Trebuchet MS", Verdana, system-ui, sans-serif';
  var FONT_BODY = '"HM Body", "Trebuchet MS", Verdana, system-ui, sans-serif';
  var TYPE = {
    hero: 46, title: 30, head: 22, sub: 17, body: 14, label: 12.5, micro: 11
  };
  var LINE = 1.35;               // line-height multiplier for wrapped copy

  var SAFE = { top: 0, right: 0, bottom: 0, left: 0 };
  function readSafeArea() {
    try {
      var probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
        'env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;';
      document.body.appendChild(probe);
      var cs = getComputedStyle(probe);
      SAFE.top = parseFloat(cs.paddingTop) || 0;
      SAFE.right = parseFloat(cs.paddingRight) || 0;
      SAFE.bottom = parseFloat(cs.paddingBottom) || 0;
      SAFE.left = parseFloat(cs.paddingLeft) || 0;
      probe.remove();
    } catch (e) { /* insets stay zero */ }
    return SAFE;
  }

  var FAMILY = {
    drifter:  { frame: 'drifter',  r: 15, hp: 5,   speed: 38,  dmg: 7,  xp: 1, tint: 0x65d5c3, scale: 1.0 },
    sprinter: { frame: 'sprinter', r: 11, hp: 7,   speed: 92,  dmg: 9,  xp: 1, tint: 0xffc361, scale: 1.0 },
    bulwark:  { frame: 'bulwark',  r: 22, hp: 34,  speed: 26,  dmg: 16, xp: 3, tint: 0xa8a8e8, scale: 1.0 },
    sapper:   { frame: 'sapper',   r: 16, hp: 12,  speed: 58,  dmg: 24, xp: 2, tint: 0xff756a, scale: 1.0 },
    lancer:   { frame: 'lancer',   r: 15, hp: 16,  speed: 34,  dmg: 11, xp: 3, tint: 0x7ac8ff, scale: 1.0, ranged: true },
    weaver:   { frame: 'weaver',   r: 14, hp: 11,  speed: 70,  dmg: 12, xp: 2, tint: 0xc480ff, scale: 1.0, orbiter: true },
    boss:     { frame: 'boss',     r: 60, hp: 2400, speed: 26, dmg: 34, xp: 0, tint: 0xd6a4ff, scale: 1.0, boss: true }
  };

  var WAVES = [
    { at: 0,   rate: 1.15, pack: 1, pool: ['drifter'] },
    { at: 18,  rate: 0.92, pack: 1, pool: ['drifter', 'drifter', 'sprinter'] },
    { at: 48,  rate: 0.82, pack: 1, pool: ['drifter', 'sprinter', 'sprinter'] },
    { at: 82,  rate: 0.76, pack: 2, pool: ['drifter', 'sprinter', 'bulwark'] },
    { at: 125, rate: 0.70, pack: 2, pool: ['drifter', 'sprinter', 'bulwark', 'sapper'] },
    { at: 168, rate: 0.64, pack: 2, pool: ['sprinter', 'bulwark', 'sapper', 'weaver'] },
    { at: 220, rate: 0.58, pack: 2, pool: ['drifter', 'sprinter', 'sapper', 'weaver', 'lancer'] },
    { at: 275, rate: 0.51, pack: 3, pool: ['sprinter', 'bulwark', 'sapper', 'weaver', 'lancer'] },
    { at: 345, rate: 0.45, pack: 3, pool: ['sprinter', 'bulwark', 'weaver', 'lancer', 'sapper'] },
    { at: 415, rate: 0.39, pack: 3, pool: ['sprinter', 'bulwark', 'sapper', 'weaver', 'lancer'] },
    { at: 490, rate: 0.34, pack: 4, pool: ['sprinter', 'bulwark', 'sapper', 'weaver', 'lancer'] },
    { at: 550, rate: 0.30, pack: 4, pool: ['sprinter', 'bulwark', 'sapper', 'weaver', 'lancer'] }
  ];

  var BONUS = [
    { key: 'purge',     frame: 'ic_pulse',  name: 'PURGE WAVE',    color: 0x8effd8, duration: 0,  cap: 0,  weight: 0.035 },
    { key: 'aegis',     frame: 'ic_armor',  name: 'AEGIS',         color: 0x6de8ff, duration: 6,  cap: 9,  weight: 0.12 },
    { key: 'overdrive', frame: 'ic_speed',  name: 'OVERDRIVE',     color: 0xffd67a, duration: 8,  cap: 12, weight: 0.10 },
    { key: 'arsenal',   frame: 'ic_damage', name: 'ARSENAL',       color: 0xffb45a, duration: 10, cap: 14, weight: 0.09 },
    { key: 'chain',     frame: 'ic_beam',   name: 'ARC LINK',      color: 0x8effd8, duration: 8,  cap: 12, weight: 0.08 },
    { key: 'dilation',  frame: 'ic_lock',   name: 'TIME DILATION', color: 0x7ad8ff, duration: 7,  cap: 10, weight: 0.065 },
    { key: 'magnet',    frame: 'ic_magnet', name: 'MAGNET SURGE',  color: 0xa7ffe0, duration: 8,  cap: 12, weight: 0.06 },
    { key: 'decoy',     frame: 'ic_wisp',   name: 'DECOY BEACON',  color: 0xc480ff, duration: 7,  cap: 11, weight: 0.04 },
    { key: 'lance',     frame: 'ic_lance',  name: 'ORBITAL LANCE', color: 0xffd67a, duration: 0,  cap: 0,  weight: 0.028 },
    { key: 'flare',     frame: 'ic_greed',  name: 'SCORE FLARE',   color: 0xffc361, duration: 10, cap: 16, weight: 0.055 },
    { key: 'wing',      frame: 'wingman',   name: 'WING',          color: 0x8effd8, duration: 0,  cap: 0,  weight: 0.08 },
    { key: 'drone',     frame: 'ic_wisp',   name: 'DRONE TURRET',  color: 0x6df0bf, duration: 12, cap: 18, weight: 0.08 },
    { key: 'freeze',    frame: 'ic_lock',   name: 'FREEZE PULSE',  color: 0x9fe9ff, duration: 5,  cap: 8,  weight: 0.055 },
    { key: 'doubler',   frame: 'ic_greed',  name: 'GEM DOUBLER',   color: 0xffe28a, duration: 10, cap: 16, weight: 0.065 },
    { key: 'vampire',   frame: 'heart',     name: 'VAMPIRE ROUNDS',color: 0xff7f9b, duration: 10, cap: 16, weight: 0.055 },
    { key: 'carpet',    frame: 'ic_mine',   name: 'BOMB CARPET',   color: 0xff9a5a, duration: 0,  cap: 0,  weight: 0.055 },
    { key: 'reflector', frame: 'ic_armor',  name: 'REFLECTOR SHELL', color: 0xffc4ff, duration: 8, cap: 12, weight: 0.05 },
    { key: 'gravity',   frame: 'ic_magnet', name: 'GRAVITY WELL',  color: 0xb18cff, duration: 8,  cap: 12, weight: 0.055 },
    { key: 'overcharge',frame: 'ic_crit',   name: 'OVERCHARGE',    color: 0xfff36a, duration: 0,  cap: 10, weight: 0.065 },
    { key: 'cloak',     frame: 'ic_wisp',   name: 'PHASE CLOAK',   color: 0xbca8ff, duration: 6,  cap: 10, weight: 0.045 },
    { key: 'strike-wing', frame: 'ic_beam', name: 'STRIKE WING', color: 0xffc361, duration: 0, cap: 0, weight: 0.07 },
    { key: 'cluster-barrage', frame: 'ic_mine', name: 'CLUSTER BARRAGE', color: 0xff8f6b, duration: 0, cap: 0, weight: 0.062 },
    { key: 'tempest',   frame: 'ic_crit',   name: 'ARC TEMPEST',   color: 0xa8ffff, duration: 8,  cap: 12, weight: 0.06 },
    { key: 'prism-array', frame: 'ic_beam', name: 'PRISM ARRAY',   color: 0x9fffe2, duration: 8,  cap: 12, weight: 0.055 },
    { key: 'meteor',    frame: 'ic_pulse',  name: 'METEOR STORM',  color: 0xffab7a, duration: 0,  cap: 0,  weight: 0.05 },
    { key: 'strike-pack', frame: 'ic_lance', name: 'STRIKE PACK',  color: 0xffdf8a, duration: 0,  cap: 0,  weight: 0.045 }
  ];
  var BONUS_BUFFS = [BONUS[1], BONUS[2], BONUS[3], BONUS[4], BONUS[5], BONUS[6], BONUS[7], BONUS[9]];
  var BONUS_TIMED = [BONUS[1], BONUS[2], BONUS[3], BONUS[4], BONUS[5], BONUS[6], BONUS[7], BONUS[9],
    BONUS[11], BONUS[12], BONUS[13], BONUS[14], BONUS[16], BONUS[17], BONUS[19],
    BONUS[22], BONUS[23]];
  var BONUS_DEBUG_KEYS = ['aegis', 'overdrive', 'arsenal', 'chain', 'dilation', 'magnet', 'decoy',
    'flare', 'drone', 'freeze', 'doubler', 'vampire', 'reflector', 'gravity', 'cloak', 'tempest', 'prism-array'];
  var BONUS_BY_KEY = {};
  for (var bi = 0; bi < BONUS.length; bi++) BONUS_BY_KEY[BONUS[bi].key] = BONUS[bi];

  var TIDE_TURNERS = [
    { key: 'last-stand',      frame: 'ic_armor',  name: 'LAST STAND',       subtitle: 'NOT TODAY // HULL LOCKED',             color: 0xffd67a, duration: 8, weight: 0.18 },
    { key: 'singularity-core',frame: 'ic_magnet', name: 'SINGULARITY CORE', subtitle: 'COLLAPSE VECTOR DEPLOYED',             color: 0xbca8ff, duration: 0, weight: 0.17 },
    { key: 'rally-beacon',    frame: 'ic_regen',  name: 'RALLY BEACON',     subtitle: 'FORMATION LINK // THREE SHIPS IN',      color: 0x8effd8, duration: 0, weight: 0.16 },
    { key: 'chrono-rewind',   frame: 'ic_lock',   name: 'CHRONO REWIND',    subtitle: 'HULL RESTORED // TEN SECOND PEAK',      color: 0x7ad8ff, duration: 0, weight: 0.16 },
    { key: 'mirror-squadron', frame: 'ic_wisp',   name: 'MIRROR SQUADRON',  subtitle: 'TWO GHOSTS // WEAPON COPIED',           color: 0xc480ff, duration: 10, weight: 0.15 },
    { key: 'bounty-frenzy',   frame: 'ic_greed',  name: 'BOUNTY FRENZY',    subtitle: 'EVERY KILL // CHAIN REACTION',          color: 0xff9a5a, duration: 8, weight: 0.18 }
  ];
  var TIDE_BY_KEY = {};
  for (var ti0 = 0; ti0 < TIDE_TURNERS.length; ti0++) TIDE_BY_KEY[TIDE_TURNERS[ti0].key] = TIDE_TURNERS[ti0];
  var TIDE_HUD = TIDE_TURNERS;

  var WEAPONS = [
    { key: 'bolt-lance', name: 'Bolt Lance', glyph: 'ic_lance', frame: 'bolt', color: 0xe5fff7, cue: 'shoot', rate: 1.00,
      desc: 'Balanced auto-fire bolts with a clean line.' },
    { key: 'scatter-volley', name: 'Scatter Volley', glyph: 'ic_pulse', frame: 'shard', color: 0xffc361, cue: 'enemyShoot', rate: 1.18,
      desc: 'A wide fan of fast, light fragments.' },
    { key: 'rail-piercer', name: 'Rail Piercer', glyph: 'ic_beam', frame: 'bolt', color: 0x8fe7ff, cue: 'pulse', rate: 0.72,
      desc: 'A heavy line shot that punches through targets.' },
    { key: 'seeker-swarm', name: 'Seeker Swarm', glyph: 'ic_wisp', frame: 'wisp', color: 0xc480ff, cue: 'telegraph', rate: 1.08,
      desc: 'Weak homing darts that keep finding the horde.' },
    { key: 'plasma-mortar', name: 'Plasma Mortar', glyph: 'ic_pulse', frame: 'ic_pulse', color: 0xff8f6b, cue: 'death', rate: 0.62,
      desc: 'Arcing plasma shells that burst on impact.' },
    { key: 'sweep-beam', name: 'Sweep Beam', glyph: 'ic_beam', frame: 'bolt', color: 0x6df0bf, cue: 'click', rate: 0.84,
      desc: 'A short rotating sweep that cuts a lane.' },
    { key: 'glaive-return', name: 'Glaive Return', glyph: 'ic_orbit', frame: 'shard', color: 0xffd67a, cue: 'hit', rate: 0.92,
      desc: 'A boomerang shard that comes back through the fight.' },
    { key: 'mine-layer', name: 'Mine Layer', glyph: 'ic_mine', frame: 'ic_mine', color: 0xff9a5a, cue: 'select', rate: 0.78,
      desc: 'Drops a carpet of volatile charges behind the ship.' },
    { key: 'ricochet-shard', name: 'Ricochet Shard', glyph: 'ic_crit', frame: 'shard', color: 0x8effd8, cue: 'wave', rate: 0.96,
      desc: 'Edge-bouncing shards keep pressure on distant lanes.' },
    { key: 'twin-phase', name: 'Twin Phase', glyph: 'ic_speed', frame: 'bolt', color: 0x7ad8ff, cue: 'hurt', rate: 1.04,
      desc: 'Two parallel phase bolts with reliable coverage.' },
    { key: 'storm-coil', name: 'Storm Coil', glyph: 'ic_crit', frame: 'shard', color: 0xa7ffe0, cue: 'levelup', rate: 0.88,
      desc: 'A charged shard that chains its impact through nearby foes.' },
    { key: 'lance-array-mk2', name: 'Lance Array Mk II', glyph: 'ic_lance', frame: 'bolt', color: 0xffe7a6, cue: 'shoot', rate: 1.08, tier: 'upgraded',
      impact: 0xfff3bf, muzzle: 0xffd67a, desc: 'Three converging lances lock onto the nearest elite.' },
    { key: 'nova-scatter', name: 'Nova Scatter', glyph: 'ic_pulse', frame: 'shard', color: 0xffa8e8ff, cue: 'enemyShoot', rate: 1.22, tier: 'upgraded',
      impact: 0x9fe9ff, muzzle: 0x6de8ff, desc: 'Nine shards fan wide, then bloom at range end.' },
    { key: 'rail-storm', name: 'Rail Storm', glyph: 'ic_beam', frame: 'bolt', color: 0x84d7ff, cue: 'pulse', rate: 1.00, tier: 'upgraded',
      impact: 0xb8f1ff, muzzle: 0x54d6ff, desc: 'A deep-piercing rail forks the first kill into two rails.' },
    { key: 'swarm-matrix', name: 'Swarm Matrix', glyph: 'ic_wisp', frame: 'wisp', color: 0xe0a8ff, cue: 'telegraph', rate: 1.12, tier: 'upgraded',
      impact: 0xf0c8ff, muzzle: 0xc480ff, desc: 'Homing darts respawn once when they claim a target.' },
    { key: 'mortar-cascade', name: 'Mortar Cascade', glyph: 'ic_pulse', frame: 'ic_pulse', color: 0xffb27a, cue: 'death', rate: 1.05, tier: 'upgraded',
      impact: 0xffd0a0, muzzle: 0xff8f6b, desc: 'Three arcing shells roll blast waves through the lane.' },
    { key: 'prism-beam', name: 'Prism Beam', glyph: 'ic_beam', frame: 'bolt', color: 0x9fffe2, cue: 'click', rate: 1.04, tier: 'upgraded',
      impact: 0xd0fff0, muzzle: 0x6df0bf, desc: 'A sweep beam refracts off its first targets into sub-beams.' },
    { key: 'glaive-cyclone', name: 'Glaive Cyclone', glyph: 'ic_orbit', frame: 'shard', color: 0xffe08a, cue: 'hit', rate: 1.05, tier: 'upgraded',
      impact: 0xfff0b0, muzzle: 0xffc361, desc: 'Counter-orbiting glaives spiral outward through the horde.' },
    { key: 'minefield-web', name: 'Minefield Web', glyph: 'ic_mine', frame: 'ic_mine', color: 0xffc68a, cue: 'select', rate: 1.02, tier: 'upgraded',
      impact: 0xffe0ad, muzzle: 0xff9a5a, desc: 'Linked mines tether together and detonate in sequence.' },
    { key: 'ricochet-prism', name: 'Ricochet Prism', glyph: 'ic_crit', frame: 'shard', color: 0x9fffe7, cue: 'wave', rate: 1.05, tier: 'upgraded',
      impact: 0xd0fff4, muzzle: 0x54d6c0, desc: 'Bouncing shards split at the boundary, up to three times.' },
    { key: 'coil-tempest', name: 'Coil Tempest', glyph: 'ic_crit', frame: 'shard', color: 0xfff36a, cue: 'levelup', rate: 1.02, tier: 'upgraded',
      impact: 0xffffb0, muzzle: 0xffd67a, desc: 'Short-range chain lightning arcs continuously while firing.' },

    // Expansion arsenal (2026-08-19). These weapons are DATA-DRIVEN: each
    // carries a `spec` interpreted by the generic branch in stepPrimaryWeapon,
    // composing existing shot kinds (homing, orbit, bounce, fork, burst...)
    // instead of adding bespoke firing code per key.
    { key: 'pulse-fan', name: 'Pulse Fan', glyph: 'ic_pulse', frame: 'shard', color: 0x7dd8ff, cue: 'enemyShoot', rate: 1.26,
      desc: 'A tight fan of rapid pulse fragments.',
      spec: { kind: 'scatter', count: 4, spread: 0.34, speed: 520, dmg: 0.62, size: 5 } },
    { key: 'arc-whip', name: 'Arc Whip', glyph: 'ic_crit', frame: 'shard', color: 0xa9ff8a, cue: 'levelup', rate: 1.08,
      desc: 'A charged lash that arcs into a second target.',
      spec: { kind: 'coil-tempest', count: 1, spread: 0, speed: 680, dmg: 1.08, size: 6, arc: { radius: 170, dmg: 0.4, hops: 1 } } },
    { key: 'quasar-bolt', name: 'Quasar Bolt', glyph: 'ic_lance', frame: 'bolt', color: 0xfff0c8, cue: 'shoot', rate: 0.62,
      desc: 'A slow, massive bolt that detonates on burnout.',
      spec: { kind: 'bolt', count: 1, spread: 0, speed: 400, dmg: 2.1, size: 10, pierce: 1, burst: { radius: 90, dmg: 0.5 } } },
    { key: 'shard-carousel', name: 'Shard Carousel', glyph: 'ic_orbit', frame: 'shard', color: 0xffc4e8, cue: 'hit', rate: 0.96,
      desc: 'A razor shard circles outward through the horde.',
      spec: { kind: 'cyclone-glaive', count: 1, spread: 0, speed: 0, dmg: 1.05, size: 10, pierce: 2 } },
    { key: 'comet-driver', name: 'Comet Driver', glyph: 'ic_beam', frame: 'bolt', color: 0x9fd0ff, cue: 'pulse', rate: 0.68,
      desc: 'A heavy comet round with a long punch-through.',
      spec: { kind: 'rail', count: 1, spread: 0, speed: 700, dmg: 1.9, size: 8, pierce: 4 } },
    { key: 'hornet-battery', name: 'Hornet Battery', glyph: 'ic_wisp', frame: 'wisp', color: 0xffe08a, cue: 'telegraph', rate: 1.24,
      desc: 'Twin homing hornets on a fast cycle.',
      spec: { kind: 'seeker', count: 2, spread: 0.5, speed: 265, dmg: 0.66, size: 8 } },
    { key: 'flak-burst', name: 'Flak Burst', glyph: 'ic_pulse', frame: 'shard', color: 0xffb28a, cue: 'enemyShoot', rate: 1.05,
      desc: 'Flak shells that pop into shrapnel clouds.',
      spec: { kind: 'scatter', count: 3, spread: 0.5, speed: 430, dmg: 0.62, size: 6, burst: { radius: 78, dmg: 0.3 } } },
    { key: 'gravity-bomb', name: 'Gravity Bomb', glyph: 'ic_magnet', frame: 'ic_pulse', color: 0xc9a8ff, cue: 'death', rate: 0.58,
      desc: 'A lobbed implosion charge with a wide blast.',
      spec: { kind: 'mortar', count: 1, spread: 0, speed: 340, dmg: 1.7, size: 12, drop: -240, burst: { radius: 120, dmg: 0.6 } } },
    { key: 'boomerang-cross', name: 'Boomerang Cross', glyph: 'ic_orbit', frame: 'shard', color: 0x8ef0d0, cue: 'hit', rate: 0.9,
      desc: 'Twin glaives thrown fore and aft, both return.',
      spec: { kind: 'glaive', count: 1, spread: 0, speed: 500, dmg: 1.12, size: 10, pierce: 2, dual: true } },

    { key: 'helix-array', name: 'Helix Array', glyph: 'ic_lance', frame: 'bolt', color: 0x8affd4, cue: 'shoot', rate: 1.16, tier: 'upgraded',
      impact: 0xc8ffe8, muzzle: 0x6df0bf, desc: 'Three interleaved bolt streams braid the lane.',
      spec: { kind: 'bolt', count: 3, spread: 0.22, speed: 580, dmg: 0.66, size: 5, addMulti: true } },
    { key: 'nova-lance', name: 'Nova Lance', glyph: 'ic_lance', frame: 'bolt', color: 0xffd0a8, cue: 'shoot', rate: 0.92, tier: 'upgraded',
      impact: 0xffe8c8, muzzle: 0xffb45a, desc: 'An elite-seeking lance that bursts on burnout.',
      spec: { kind: 'lance-array', count: 2, spread: 0.12, speed: 640, dmg: 0.98, size: 7, pierce: 1, elite: true, burst: { radius: 92, dmg: 0.42 } } },
    { key: 'tempest-fan', name: 'Tempest Fan', glyph: 'ic_crit', frame: 'shard', color: 0xd6ff7a, cue: 'levelup', rate: 1.12, tier: 'upgraded',
      impact: 0xf0ffb0, muzzle: 0xd6ff7a, desc: 'A storm fan whose center round chains lightning.',
      spec: { kind: 'scatter', count: 7, spread: 0.8, speed: 470, dmg: 0.4, size: 5, addMulti: true, arc: { radius: 180, dmg: 0.3, hops: 1 } } },
    { key: 'rail-trident', name: 'Rail Trident', glyph: 'ic_beam', frame: 'bolt', color: 0x84e8ff, cue: 'pulse', rate: 0.94, tier: 'upgraded',
      impact: 0xc8f4ff, muzzle: 0x54d6ff, desc: 'Three deep-piercing rails in a trident spread.',
      spec: { kind: 'rail', count: 3, spread: 0.24, speed: 780, dmg: 0.92, size: 7, pierce: 3 } },
    { key: 'wisp-cathedral', name: 'Wisp Cathedral', glyph: 'ic_wisp', frame: 'wisp', color: 0xd8c8ff, cue: 'telegraph', rate: 1.1, tier: 'upgraded',
      impact: 0xecdcff, muzzle: 0xc480ff, desc: 'A choir of homing wisps that renew on a kill.',
      spec: { kind: 'swarm-dart', count: 5, spread: 0.4, speed: 290, dmg: 0.56, size: 8, addMulti: true } },
    { key: 'meteor-mortar', name: 'Meteor Mortar', glyph: 'ic_pulse', frame: 'ic_pulse', color: 0xff9a7a, cue: 'death', rate: 0.98, tier: 'upgraded',
      impact: 0xffc8a0, muzzle: 0xff8f6b, desc: 'Paired meteors roll heavy blast waves downrange.',
      spec: { kind: 'mortar-cascade', count: 2, spread: 0.3, speed: 380, dmg: 0.78, size: 12, drop: -250, burst: { radius: 108, dmg: 0.44 } } },
    { key: 'mirror-beam', name: 'Mirror Beam', glyph: 'ic_beam', frame: 'bolt', color: 0xa0ffe8, cue: 'click', rate: 1.0, tier: 'upgraded',
      impact: 0xd8fff4, muzzle: 0x6df0bf, desc: 'A target beam mirrored by its opposite twin.',
      spec: { mode: 'beam', dmg: 1.05, beam: { len: 500, wid: 26, dual: true } } },
    { key: 'saw-halo', name: 'Saw Halo', glyph: 'ic_orbit', frame: 'shard', color: 0xffd88a, cue: 'hit', rate: 1.04, tier: 'upgraded',
      impact: 0xffecb8, muzzle: 0xffc361, desc: 'Three counter-spinning saws spiral outward.',
      spec: { kind: 'cyclone-glaive', count: 3, spread: 0, speed: 0, dmg: 0.8, size: 10, pierce: 2 } },
    { key: 'web-caster', name: 'Web Caster', glyph: 'ic_mine', frame: 'ic_mine', color: 0xffcf9a, cue: 'select', rate: 1.02, tier: 'upgraded',
      impact: 0xffe4bc, muzzle: 0xff9a5a, desc: 'Casts a linked four-node detonation web.',
      spec: { mode: 'mine', dmg: 0.42, mine: { radius: 122, count: 4, web: true } } },
    { key: 'prism-lattice', name: 'Prism Lattice', glyph: 'ic_crit', frame: 'shard', color: 0xb0fff0, cue: 'wave', rate: 1.02, tier: 'upgraded',
      impact: 0xdcfff8, muzzle: 0x54d6c0, desc: 'Twin bouncing prisms that split at every boundary.',
      spec: { kind: 'prism-ricochet', count: 2, spread: 0.3, speed: 540, dmg: 0.82, size: 8, pierce: 2 } },

    // LEGENDARY tier: extravagant late-run prizes. Rare drops, boss rewards.
    { key: 'meridian-requiem', name: 'Meridian Requiem', glyph: 'ic_beam', frame: 'bolt', color: 0xffe8ff, cue: 'pulse', rate: 1.06, tier: 'legendary',
      impact: 0xfff4ff, muzzle: 0xff9df5, desc: 'LEGENDARY. A cathedral beam sweeps the field and sings lightning.',
      spec: { mode: 'beam', dmg: 1.5, beam: { len: 680, wid: 40, sweep: true }, arc: { radius: 240, dmg: 0.5, hops: 2 }, flare: true } },
    { key: 'supernova-cannon', name: 'Supernova Cannon', glyph: 'ic_pulse', frame: 'ic_pulse', color: 0xfff0a0, cue: 'death', rate: 0.5, tier: 'legendary',
      impact: 0xfffce0, muzzle: 0xffd67a, desc: 'LEGENDARY. One round. One star. Everything near it is gone.',
      spec: { kind: 'bolt', count: 1, spread: 0, speed: 360, dmg: 4.2, size: 14, pierce: 3, burst: { radius: 190, dmg: 1.1 }, flare: true } },
    { key: 'void-reaper', name: 'Void Reaper', glyph: 'ic_orbit', frame: 'shard', color: 0xd0a8ff, cue: 'hit', rate: 0.84, tier: 'legendary',
      impact: 0xe8d0ff, muzzle: 0xc480ff, desc: 'LEGENDARY. Twin scythes harvest both halves of the sky.',
      spec: { kind: 'glaive', count: 2, spread: 0.4, speed: 540, dmg: 1.55, size: 13, pierce: 6, dual: true, flare: true } },
    { key: 'stormcaller-crown', name: 'Stormcaller Crown', glyph: 'ic_crit', frame: 'shard', color: 0xa8ffff, cue: 'levelup', rate: 1.12, tier: 'legendary',
      impact: 0xe0ffff, muzzle: 0x7ad8ff, desc: 'LEGENDARY. Every round crowns the horde in chained lightning.',
      spec: { kind: 'coil-tempest', count: 3, spread: 0.5, speed: 700, dmg: 0.85, size: 7, pierce: 1, arc: { radius: 210, dmg: 0.45, hops: 3 }, flare: true } },
    { key: 'dragonfire-array', name: 'Dragonfire Array', glyph: 'ic_pulse', frame: 'shard', color: 0xffb070, cue: 'enemyShoot', rate: 1.18, tier: 'legendary',
      impact: 0xffd8a8, muzzle: 0xff9a5a, desc: 'LEGENDARY. A full ring of dragonfire, breathing in every direction.',
      spec: { kind: 'scatter', count: 12, spread: 0, speed: 460, dmg: 0.5, size: 6, ring: true, burst: { radius: 70, dmg: 0.24 }, flare: true } },
    { key: 'singularity-driver', name: 'Singularity Driver', glyph: 'ic_beam', frame: 'bolt', color: 0xc8b8ff, cue: 'pulse', rate: 0.9, tier: 'legendary',
      impact: 0xe4dcff, muzzle: 0x9b8cff, desc: 'LEGENDARY. A collapsing rail that forks on every kill it takes.',
      spec: { kind: 'rail-storm', count: 1, spread: 0, speed: 860, dmg: 2.4, size: 9, pierce: 7, flare: true } },
    { key: 'celestial-chorus', name: 'Celestial Chorus', glyph: 'ic_wisp', frame: 'wisp', color: 0xc0ffe0, cue: 'telegraph', rate: 1.2, tier: 'legendary',
      impact: 0xe0fff0, muzzle: 0x8effd8, desc: 'LEGENDARY. Seven singing seekers that rise again from every kill.',
      spec: { kind: 'swarm-dart', count: 7, spread: 0.55, speed: 300, dmg: 0.6, size: 8, addMulti: true, flare: true } },
    { key: 'oblivion-web', name: 'Oblivion Web', glyph: 'ic_mine', frame: 'ic_mine', color: 0xff9ac0, cue: 'select', rate: 1.0, tier: 'legendary',
      impact: 0xffc8dc, muzzle: 0xff7f9b, desc: 'LEGENDARY. Six tethered charges weave a field-ending web.',
      spec: { mode: 'mine', dmg: 0.6, mine: { radius: 150, count: 6, web: true }, flare: true } },
    { key: 'phoenix-lance', name: 'Phoenix Lance', glyph: 'ic_lance', frame: 'bolt', color: 0xffc890, cue: 'shoot', rate: 1.08, tier: 'legendary',
      impact: 0xffe4c0, muzzle: 0xffb45a, desc: 'LEGENDARY. Five burning lances hunt the strongest thing alive.',
      spec: { kind: 'lance-array', count: 5, spread: 0.2, speed: 660, dmg: 0.72, size: 7, pierce: 2, elite: true, burst: { radius: 84, dmg: 0.3 }, flare: true } },
    { key: 'galaxy-ripper', name: 'Galaxy Ripper', glyph: 'ic_orbit', frame: 'shard', color: 0xa8d8ff, cue: 'hit', rate: 1.02, tier: 'legendary',
      impact: 0xd4ecff, muzzle: 0x6e8bff, desc: 'LEGENDARY. Four spiral arms of a hungry galaxy, spinning outward.',
      spec: { kind: 'cyclone-glaive', count: 4, spread: 0, speed: 0, dmg: 0.92, size: 11, pierce: 3, arc: { radius: 160, dmg: 0.3, hops: 1 }, flare: true } }
  ];
  var WEAPON_BY_KEY = {};
  for (var wi0 = 0; wi0 < WEAPONS.length; wi0++) WEAPON_BY_KEY[WEAPONS[wi0].key] = WEAPONS[wi0];
  for (var wsn = 0; wsn < WEAPONS.length; wsn++) {
    WEAPONS[wsn].displayName = WEAPONS[wsn].name.toUpperCase();
    WEAPONS[wsn].shortName = WEAPONS[wsn].name.split(' ')[0].toUpperCase();
  }

  var UPGRADES = [
    { key: 'lance',    icon: 'ic_lance',    name: 'Bolt Lance',      max: 8,
      desc: function (r) { return r === 0 ? 'Auto-fire a bolt at the nearest target.' : 'Faster bolts. Every third rank adds a bolt.'; } },
    { key: 'orbit',    icon: 'ic_orbit',    name: 'Orbit Blades',    max: 8,
      desc: function (r) { return r === 0 ? 'A razor ring circles you and cuts anything close.' : 'More blades, wider ring, harder cuts.'; } },
    { key: 'pulse',    icon: 'ic_pulse',    name: 'Nova Pulse',      max: 8,
      desc: function (r) { return r === 0 ? 'Release a shockwave that clears breathing room.' : 'Bigger radius, shorter cooldown.'; } },
    { key: 'wisp',     icon: 'ic_wisp',     name: 'Homing Wisp',     max: 8,
      desc: function (r) { return r === 0 ? 'Launch a seeker that bends toward the horde.' : 'More wisps, sharper tracking.'; } },
    { key: 'beam',     icon: 'ic_beam',     name: 'Meridian Beam',   max: 8,
      desc: function (r) { return r === 0 ? 'A sweeping lance of light that pierces every enemy it crosses.' : 'Wider sweep, faster recharge.'; } },
    { key: 'mine',     icon: 'ic_mine',     name: 'Drop Mines',      max: 8,
      desc: function (r) { return r === 0 ? 'Leave volatile charges in your wake.' : 'Drop more often, detonate harder.'; } },
    { key: 'damage',   icon: 'ic_damage',   name: 'Amplifier',       max: 6,
      desc: function () { return 'All weapons hit 16% harder.'; } },
    { key: 'speed',    icon: 'ic_speed',    name: 'Thrusters',       max: 6,
      desc: function () { return 'Move 11% faster. The safest distance is more distance.'; } },
    { key: 'magnet',   icon: 'ic_magnet',   name: 'Collector',       max: 6,
      desc: function () { return 'Pull gems from much farther away.'; } },
    { key: 'armor',    icon: 'ic_armor',    name: 'Plating',         max: 6,
      desc: function () { return 'Take 12% less damage from every hit.'; } },
    { key: 'vitality', icon: 'ic_vitality', name: 'Vitality',        max: 6,
      desc: function () { return 'Raise max integrity by 22 and heal for it now.'; } },
    { key: 'crit',     icon: 'ic_crit',     name: 'Overcharge',      max: 6,
      desc: function () { return 'Plus 8% chance to deal triple damage.'; } },
    { key: 'regen',    icon: 'ic_regen',    name: 'Repair Field',    max: 6,
      desc: function () { return 'Recover integrity slowly and continuously.'; } },

    { key: 'weapon_bolt',      icon: 'ic_lance',  name: 'Bolt Lance',      max: 1, type: 'weapon', rarity: 'common', branch: 'weapon', weapon: 'bolt-lance',
      desc: function () { return 'Equip the balanced line-bolt primary.'; } },
    { key: 'weapon_scatter',   icon: 'ic_pulse',  name: 'Scatter Volley',  max: 1, type: 'weapon', rarity: 'common', branch: 'weapon', weapon: 'scatter-volley',
      desc: function () { return 'Equip a wide fan of fast fragments.'; } },
    { key: 'weapon_rail',      icon: 'ic_beam',   name: 'Rail Piercer',    max: 1, type: 'weapon', rarity: 'rare', branch: 'weapon', weapon: 'rail-piercer',
      desc: function () { return 'Equip a heavy shot with deep pierce.'; } },
    { key: 'weapon_seeker',    icon: 'ic_wisp',   name: 'Seeker Swarm',    max: 1, type: 'weapon', rarity: 'rare', branch: 'weapon', weapon: 'seeker-swarm',
      desc: function () { return 'Equip weak darts with soft homing.'; } },
    { key: 'weapon_mortar',    icon: 'ic_pulse',  name: 'Plasma Mortar',   max: 1, type: 'weapon', rarity: 'epic', branch: 'weapon', weapon: 'plasma-mortar',
      desc: function () { return 'Equip arcing shells with impact bursts.'; } },
    { key: 'weapon_sweep',     icon: 'ic_beam',   name: 'Sweep Beam',      max: 1, type: 'weapon', rarity: 'rare', branch: 'weapon', weapon: 'sweep-beam',
      desc: function () { return 'Equip a short rotating beam sweep.'; } },
    { key: 'weapon_glaive',    icon: 'ic_orbit',  name: 'Glaive Return',   max: 1, type: 'weapon', rarity: 'rare', branch: 'weapon', weapon: 'glaive-return',
      desc: function () { return 'Equip a returning boomerang shard.'; } },
    { key: 'weapon_mine',      icon: 'ic_mine',   name: 'Mine Layer',      max: 1, type: 'weapon', rarity: 'common', branch: 'weapon', weapon: 'mine-layer',
      desc: function () { return 'Equip a primary that plants charge carpets.'; } },
    { key: 'weapon_ricochet',  icon: 'ic_crit',   name: 'Ricochet Shard',  max: 1, type: 'weapon', rarity: 'rare', branch: 'weapon', weapon: 'ricochet-shard',
      desc: function () { return 'Equip shards that bounce off the arena edge.'; } },
    { key: 'weapon_twin',      icon: 'ic_speed',  name: 'Twin Phase',      max: 1, type: 'weapon', rarity: 'common', branch: 'weapon', weapon: 'twin-phase',
      desc: function () { return 'Equip a parallel pair of phase bolts.'; } },
    { key: 'weapon_storm',     icon: 'ic_crit',   name: 'Storm Coil',      max: 1, type: 'weapon', rarity: 'epic', branch: 'weapon', weapon: 'storm-coil',
      desc: function () { return 'Equip a charged shard with chain impact.'; } },
    { key: 'weapon_lance_mk2', icon: 'ic_lance',  name: 'Lance Array Mk II', max: 1, type: 'weapon', rarity: 'epic', branch: 'weapon', weapon: 'lance-array-mk2', upgraded: true,
      desc: function () { return 'UPGRADED · Three lances converge on the nearest elite.'; } },
    { key: 'weapon_nova',      icon: 'ic_pulse',  name: 'Nova Scatter',   max: 1, type: 'weapon', rarity: 'epic', branch: 'weapon', weapon: 'nova-scatter', upgraded: true,
      desc: function () { return 'UPGRADED · Fan shards bloom at range end.'; } },
    { key: 'weapon_rail_storm', icon: 'ic_beam',  name: 'Rail Storm',     max: 1, type: 'weapon', rarity: 'epic', branch: 'weapon', weapon: 'rail-storm', upgraded: true,
      desc: function () { return 'UPGRADED · The first kill forks the piercing rail.'; } },
    { key: 'weapon_swarm_matrix', icon: 'ic_wisp', name: 'Swarm Matrix',  max: 1, type: 'weapon', rarity: 'epic', branch: 'weapon', weapon: 'swarm-matrix', upgraded: true,
      desc: function () { return 'UPGRADED · A kill respawns one homing dart.'; } },
    { key: 'weapon_mortar_cascade', icon: 'ic_pulse', name: 'Mortar Cascade', max: 1, type: 'weapon', rarity: 'epic', branch: 'weapon', weapon: 'mortar-cascade', upgraded: true,
      desc: function () { return 'UPGRADED · Triple arcs roll overlapping blast waves.'; } },
    { key: 'weapon_prism_beam', icon: 'ic_beam',   name: 'Prism Beam',     max: 1, type: 'weapon', rarity: 'epic', branch: 'weapon', weapon: 'prism-beam', upgraded: true,
      desc: function () { return 'UPGRADED · Hits refract into two sub-beams.'; } },
    { key: 'weapon_glaive_cyclone', icon: 'ic_orbit', name: 'Glaive Cyclone', max: 1, type: 'weapon', rarity: 'epic', branch: 'weapon', weapon: 'glaive-cyclone', upgraded: true,
      desc: function () { return 'UPGRADED · Counter-orbiting glaives spiral outward.'; } },
    { key: 'weapon_minefield_web', icon: 'ic_mine', name: 'Minefield Web', max: 1, type: 'weapon', rarity: 'epic', branch: 'weapon', weapon: 'minefield-web', upgraded: true,
      desc: function () { return 'UPGRADED · Tethered mines detonate in sequence.'; } },
    { key: 'weapon_ricochet_prism', icon: 'ic_crit', name: 'Ricochet Prism', max: 1, type: 'weapon', rarity: 'epic', branch: 'weapon', weapon: 'ricochet-prism', upgraded: true,
      desc: function () { return 'UPGRADED · Each bounce splits the prism, capped at three.'; } },
    { key: 'weapon_coil_tempest', icon: 'ic_crit', name: 'Coil Tempest', max: 1, type: 'weapon', rarity: 'epic', branch: 'weapon', weapon: 'coil-tempest', upgraded: true,
      desc: function () { return 'UPGRADED · Continuous short-range chain lightning.'; } },

    { key: 'fireRate',  icon: 'ic_speed',  name: 'Cycle Tuning',    max: 6, rarity: 'common', branch: 'weapon',
      desc: function () { return 'Primary fire cycle is 7% faster.'; } },
    { key: 'multishot', icon: 'ic_pulse',  name: 'Split Chamber',   max: 5, rarity: 'rare', branch: 'weapon',
      desc: function () { return 'Add one projectile to spread patterns.'; } },
    { key: 'projDamage',icon: 'ic_damage', name: 'Payload Matrix',  max: 6, rarity: 'common', branch: 'weapon',
      desc: function () { return 'Primary projectile damage rises 12%.'; } },
    { key: 'projSpeed', icon: 'ic_beam',   name: 'Vector Rails',    max: 5, rarity: 'common', branch: 'weapon',
      desc: function () { return 'Primary projectiles travel 10% faster.'; } },
    { key: 'projSize',  icon: 'ic_lance',  name: 'Mass Driver',     max: 5, rarity: 'rare', branch: 'weapon',
      desc: function () { return 'Primary projectiles gain 8% hit size.'; } },
    { key: 'pierce',    icon: 'ic_crit',   name: 'Breach Core',     max: 4, rarity: 'epic', branch: 'weapon',
      desc: function () { return 'Piercing primaries pass one more target.'; } },
    { key: 'primaryCrit',icon: 'ic_crit',  name: 'Critical Fuse',   max: 5, rarity: 'rare', branch: 'weapon',
      desc: function () { return 'Primary shots gain 5% critical chance.'; } },

    { key: 'hull',       icon: 'ic_vitality', name: 'Hull Reserve',   max: 6, rarity: 'common', branch: 'defense',
      desc: function () { return 'Raise max integrity by 18 and heal it now.'; } },
    { key: 'aegisDuration', icon: 'ic_armor', name: 'Aegis Relay',    max: 4, rarity: 'rare', branch: 'defense',
      desc: function () { return 'Aegis pickup duration rises by 1.5 seconds.'; } },
    { key: 'wingDamage', icon: 'wingman',   name: 'Wing Calibration', max: 5, rarity: 'rare', branch: 'formation',
      desc: function () { return 'Wingmen deal 12% more damage.'; } },
    { key: 'wingCap',    icon: 'wingman',   name: 'Formation Link',  max: 1, rarity: 'epic', branch: 'formation',
      desc: function () { return 'Raise the wing count cap by one.'; } },
    { key: 'wingRevive', icon: 'heart',     name: 'Wing Revival',    max: 1, rarity: 'epic', branch: 'formation',
      desc: function () { return 'Once per run, instantly replace a lost wing.'; } },
    { key: 'gemValue',   icon: 'ic_greed',  name: 'Prism Cut',       max: 5, rarity: 'rare', branch: 'economy',
      desc: function () { return 'Gems are worth 10% more experience.'; } },
    { key: 'dropLuck',   icon: 'ic_greed',  name: 'Fortune Relay',   max: 5, rarity: 'rare', branch: 'economy',
      desc: function () { return 'Friendly drops become more likely.'; } },
    { key: 'drift',      icon: 'ic_speed',  name: 'Drift Control',   max: 4, rarity: 'common', branch: 'mobility',
      desc: function () { return 'Turning keeps more of your travel speed.'; } }
  ];
  var UPGRADE_BY_KEY = {};
  for (var ui = 0; ui < UPGRADES.length; ui++) {
    UPGRADE_BY_KEY[UPGRADES[ui].key] = UPGRADES[ui];
    if (!UPGRADES[ui].rarity) UPGRADES[ui].rarity = ui % 7 === 0 ? 'epic' : (ui % 3 === 0 ? 'rare' : 'common');
  }
  var RARITY_STYLE = {
    common: { color: '#8fb3c4', tint: 0x54a6d6 },
    rare:   { color: '#6de8ff', tint: 0x3c9fd0 },
    epic:   { color: '#ffd67a', tint: 0xc480ff },
    legendary: { color: '#ff9df5', tint: 0xff7ae0 }
  };

  var META = [
    { key: 'power',   name: 'Core Tuning',    icon: 'ic_damage',   max: 5, cost: function (l) { return 60 + l * 90; },  blurb: 'Start each run with +8% weapon damage per rank.' },
    { key: 'vigor',   name: 'Reinforcement',  icon: 'ic_vitality', max: 5, cost: function (l) { return 50 + l * 80; },  blurb: 'Start with +15 max integrity per rank.' },
    { key: 'haste',   name: 'Drive Coils',    icon: 'ic_speed',    max: 4, cost: function (l) { return 70 + l * 100; }, blurb: 'Start with +5% move speed per rank.' },
    { key: 'draw',    name: 'Field Magnet',   icon: 'ic_magnet',   max: 4, cost: function (l) { return 55 + l * 75; },  blurb: 'Start with +25 gem pickup radius per rank.' },
    { key: 'fortune', name: 'Gem Refinery',   icon: 'ic_greed',    max: 4, cost: function (l) { return 80 + l * 120; }, blurb: 'Gems are worth +10% experience per rank.' },
    { key: 'second',  name: 'Failsafe',       icon: 'ic_armor',    max: 1, cost: function () { return 450; },           blurb: 'Survive one lethal hit per run at 35% integrity.' }
  ];
  var META_BY_KEY = {};
  for (var mi = 0; mi < META.length; mi++) META_BY_KEY[META[mi].key] = META[mi];

  var PROFILE_VERSION = 3;
  var BANK_RATE = 0.75;
  var HANGAR_TRACKS = [
    { key: 'hull', name: 'Hull', icon: 'ic_vitality', max: 5, color: 0xff8f7a,
      cost: function (l) { return Math.round(45 * Math.pow(1.62, l)); },
      blurb: '+6% max integrity per tier.' },
    { key: 'reactor', name: 'Reactor', icon: 'ic_damage', max: 5, color: 0xffd67a,
      cost: function (l) { return Math.round(45 * Math.pow(1.62, l)); },
      blurb: '+5% primary cycle speed per tier.' },
    { key: 'thrusters', name: 'Thrusters', icon: 'ic_speed', max: 5, color: 0x6df0bf,
      cost: function (l) { return Math.round(45 * Math.pow(1.62, l)); },
      blurb: '+5% travel speed per tier.' },
    { key: 'magnet', name: 'Magnet', icon: 'ic_magnet', max: 5, color: 0x7ad8ff,
      cost: function (l) { return Math.round(45 * Math.pow(1.62, l)); },
      blurb: '+6% pickup radius per tier.' },
    { key: 'wingBay', name: 'Wing Bay', icon: 'wingman', max: 5, color: 0x8effd8,
      cost: function (l) { return Math.round(45 * Math.pow(1.62, l)); },
      blurb: 'Tier 1 starts a wing, later tiers raise the cap.' },
    { key: 'fortune', name: 'Fortune', icon: 'ic_greed', max: 5, color: 0xffc361,
      cost: function (l) { return Math.round(45 * Math.pow(1.62, l)); },
      blurb: '+6% gem value and +7% drop luck per tier.' },
    { key: 'gunDeck', name: 'Gun Deck', icon: 'ic_lance', max: 2, color: 0xffe7a6,
      cost: function (l) { return l === 0 ? 140 : 320; },
      blurb: 'Tier 1 starts secondary fire. Tier 2 starts tertiary fire.' }
  ];
  var HANGAR_BY_KEY = {};
  for (var hti = 0; hti < HANGAR_TRACKS.length; hti++) HANGAR_BY_KEY[HANGAR_TRACKS[hti].key] = HANGAR_TRACKS[hti];

  var HULL_PAINTS = [
    { key: 'teal', name: 'Teal', tint: 0x8effd8, lowTint: 0xffa47d },
    { key: 'amber', name: 'Amber', tint: 0xffc361, lowTint: 0xff8f74 },
    { key: 'crimson', name: 'Crimson', tint: 0xff6e74, lowTint: 0xffc078 },
    { key: 'violet', name: 'Violet', tint: 0xc480ff, lowTint: 0xff9c9c },
    { key: 'arctic', name: 'Arctic', tint: 0x9fe9ff, lowTint: 0xffc98a },
    { key: 'void', name: 'Void', tint: 0x8580b8, lowTint: 0xd39a8c }
  ];
  var PAINT_BY_KEY = {};
  for (var hpi = 0; hpi < HULL_PAINTS.length; hpi++) PAINT_BY_KEY[HULL_PAINTS[hpi].key] = HULL_PAINTS[hpi];

  var TRIMS = [
    { key: 'mint', name: 'Mint', color: 0x6df0bf },
    { key: 'amber', name: 'Amber', color: 0xffd67a },
    { key: 'arctic', name: 'Arctic', color: 0x7ad8ff },
    { key: 'violet', name: 'Violet', color: 0xc480ff },
    { key: 'crimson', name: 'Red', color: 0xff756a }
  ];
  var TRIM_BY_KEY = {};
  for (var hri = 0; hri < TRIMS.length; hri++) TRIM_BY_KEY[TRIMS[hri].key] = TRIMS[hri];

  var HULL_FRAMES = [
    { key: 'classic', name: 'Classic', idle: 'hero_idle', move: 'hero_move' },
    { key: 'recon', name: 'Recon', idle: 'hero_idle_b', move: 'hero_move_b' },
    { key: 'vector', name: 'Vector', idle: 'hero_idle_b', move: 'hero_move' }
  ];
  var FRAME_BY_KEY = {};
  for (var hfi = 0; hfi < HULL_FRAMES.length; hfi++) FRAME_BY_KEY[HULL_FRAMES[hfi].key] = HULL_FRAMES[hfi];

  // Region combat data. Variants deliberately reuse the six pooled enemy
  // bodies and their existing movement primitives; only this definition table
  // changes the hostile language by sector.
  var REGION_ENEMIES = {
    'ember-drift': [
      { key: 'cinder-kamikaze', frame: 'sprinter', base: 'sprinter', behavior: 'kamikaze', r: 13, hp: 11, speed: 126, dmg: 18, xp: 2, tint: 0xff6b4f, scale: 1.08 },
      { key: 'ash-wraith', frame: 'wisp', base: 'weaver', behavior: 'wraith', r: 15, hp: 15, speed: 78, dmg: 14, xp: 2, tint: 0xff9a5a, scale: 1.08 },
      { key: 'ember-scarab', frame: 'bulwark', base: 'bulwark', behavior: 'scarab', r: 20, hp: 46, speed: 32, dmg: 19, xp: 3, tint: 0xffc361, scale: 1.06 }
    ],
    'crystal-shoals': [
      { key: 'refracting-shard-drone', frame: 'wisp', base: 'lancer', behavior: 'refract-drone', r: 15, hp: 18, speed: 58, dmg: 13, xp: 3, tint: 0xa7f3ff, scale: 1.06, ranged: true },
      { key: 'glasswing-drone', frame: 'shard', base: 'weaver', behavior: 'glasswing', r: 15, hp: 14, speed: 82, dmg: 13, xp: 2, tint: 0xd4c9ff, scale: 1.02 },
      { key: 'shard-larva', frame: 'sprinter', base: 'sprinter', behavior: 'larva', r: 10, hp: 7, speed: 112, dmg: 10, xp: 1, tint: 0x8fe7ff, scale: 0.82 }
    ],
    'void-rift': [
      { key: 'blink-stalker', frame: 'sprinter', base: 'sprinter', behavior: 'blink', r: 12, hp: 14, speed: 98, dmg: 15, xp: 2, tint: 0x9b8cff, scale: 1.06 },
      { key: 'gravity-mite', frame: 'drifter', base: 'drifter', behavior: 'gravity-mite', r: 12, hp: 12, speed: 48, dmg: 12, xp: 2, tint: 0x6e8bff, scale: 0.86 },
      { key: 'null-leech', frame: 'wisp', base: 'weaver', behavior: 'null-leech', r: 16, hp: 21, speed: 64, dmg: 18, xp: 3, tint: 0xd0c8ff, scale: 1.08 }
    ],
    'aurelion-graveyard': [
      { key: 'derelict-guard-hulk', frame: 'bulwark', base: 'bulwark', behavior: 'hulk', r: 27, hp: 58, speed: 22, dmg: 24, xp: 4, tint: 0xc07d62, scale: 1.12 },
      { key: 'salvage-swarm', frame: 'weaver', base: 'weaver', behavior: 'salvage', r: 13, hp: 10, speed: 88, dmg: 13, xp: 2, tint: 0xffb47e, scale: 0.94 },
      { key: 'scrap-ripper', frame: 'sprinter', base: 'sprinter', behavior: 'salvage-dash', r: 13, hp: 16, speed: 104, dmg: 17, xp: 2, tint: 0x9a5b55, scale: 1.04 },
      { key: 'grave-egg', frame: 'deco_core', base: 'drifter', behavior: 'egg', r: 22, hp: 42, speed: 0, dmg: 0, xp: 4, tint: 0xffd09a, scale: 0.76, egg: true }
    ]
  };
  var REGION_ENEMY_BY_KEY = {};
  for (var rek in REGION_ENEMIES) {
    for (var rei = 0; rei < REGION_ENEMIES[rek].length; rei++) {
      REGION_ENEMY_BY_KEY[REGION_ENEMIES[rek][rei].key] = REGION_ENEMIES[rek][rei];
    }
  }

  var REGION_BOSSES = {
    'meridian-verge': { key: 'proboscis-prime', frame: 'boss', name: 'PROBOSCIS PRIME', title: 'CLASSIC HUNTER // HULL DRAIN LATCH', region: 'meridian-verge', hp: 1540, r: 72, speed: 34, dmg: 30, tint: 0x8effd8, behavior: 'latch', weaponKeys: ['lance-array-mk2', 'rail-storm'] },
    'ember-drift': { key: 'cinder-haematarch', frame: 'boss', name: 'CINDER HAEMATARCH', title: 'EMBER TRAIL // STRIP IGNITION', region: 'ember-drift', hp: 1680, r: 76, speed: 38, dmg: 34, tint: 0xff756a, behavior: 'dive', weaponKeys: ['nova-scatter', 'mortar-cascade'] },
    'crystal-shoals': { key: 'glasswing-tyrant', frame: 'boss', name: 'GLASSWING TYRANT', title: 'REFRACTIVE WINGS // SHARD LARVAE', region: 'crystal-shoals', hp: 1620, r: 74, speed: 36, dmg: 31, tint: 0xa7f3ff, behavior: 'refract', weaponKeys: ['prism-beam', 'glaive-cyclone'] },
    'void-rift': { key: 'null-proboscis', frame: 'boss', name: 'NULL PROBOSCIS', title: 'BLINK STALKER // OUTRUN THE MARK', region: 'void-rift', hp: 1760, r: 73, speed: 42, dmg: 35, tint: 0xc480ff, behavior: 'blink-mark', weaponKeys: ['swarm-matrix', 'ricochet-prism'] },
    'aurelion-graveyard': { key: 'carrion-queen', frame: 'boss', name: 'CARRION QUEEN', title: 'HATCHERIES ACTIVE // POP THE CLUSTERS', region: 'aurelion-graveyard', hp: 1860, r: 80, speed: 30, dmg: 36, tint: 0xffb47e, behavior: 'hatchery', weaponKeys: ['minefield-web', 'coil-tempest'] }
  };
  var REGION_BOSS_BY_KEY = {};
  var REGION_BOSS_BY_BOSS_KEY = {};
  for (var rbb = 0; rbb < REGIONS.length; rbb++) {
    REGION_BOSS_BY_KEY[REGIONS[rbb].key] = REGION_BOSSES[REGIONS[rbb].key];
    REGION_BOSS_BY_BOSS_KEY[REGION_BOSS_BY_KEY[REGIONS[rbb].key].key] = REGION_BOSS_BY_KEY[REGIONS[rbb].key];
  }
  var REGION_WEAPON_KEYS = {};
  for (var rbk in REGION_BOSSES) REGION_WEAPON_KEYS[rbk] = REGION_BOSSES[rbk].weaponKeys;
  for (var rwk in REGION_WEAPON_KEYS) {
    for (var rwi = 0; rwi < REGION_WEAPON_KEYS[rwk].length; rwi++) {
      var regionWeapon = WEAPON_BY_KEY[REGION_WEAPON_KEYS[rwk][rwi]];
      if (regionWeapon) regionWeapon.regionKey = rwk;
    }
  }
  var REGION_BOSS_SCHEDULE = [
    { region: 'meridian-verge', at: 26, x: 720, y: -620 },
    { region: 'ember-drift', at: 86, x: 3040, y: -1080 },
    { region: 'crystal-shoals', at: 178, x: 5060, y: -1640 },
    { region: 'void-rift', at: 276, x: -3020, y: 1420 },
    { region: 'aurelion-graveyard', at: 392, x: -5260, y: 1160 }
  ];
  var DROP_TUNING = {
    bonusBase: 0.095, bonusPressure: 0.07, bonusStreak: 0.05,
    spacing: 4, cap: 44, floorTime: 12, floorKills: 1, fieldCap: 16,
    landmarkGemCount: 7, landmarkGemValue: 2
  };
  var OPENING_BEATS = { firstEnemy: 1.8, firstDrop: 10.5, airstrike: 5.0 };
  var ARSENAL_III = {
    damage: [1, 0.55, 0.35], cadence: [1, 0.90, 0.84],
    unlockWave: [0, 3, 6], bossKills: [0, 1, 2], maxSlots: 3
  };
  var ATLAS_FRAME_MAP = {
    enemy: ['drifter', 'sprinter', 'bulwark', 'sapper', 'lancer', 'weaver', 'wisp', 'shard', 'deco_core'],
    boss: ['boss', 'shard', 'ic_lance', 'ring_thick', 'elite_aura'],
    weapons: WEAPONS.map(function (weapon) { return weapon.glyph; })
  };


  window.__HM_DATA = {
    WING_SLOTS: WING_SLOTS,
    BASE_TYPES: BASE_TYPES,
    BASE_SCHEDULE: BASE_SCHEDULE,
    REGIONS: REGIONS,
    REGION_ANCHORS: REGION_ANCHORS,
    REGION_BY_KEY: REGION_BY_KEY,
    regionIndexAtX: regionIndexAtX,
    regionAtX: regionAtX,
    noise01: noise01,
    FONT_DISPLAY: FONT_DISPLAY,
    FONT_BODY: FONT_BODY,
    TYPE: TYPE,
    LINE: LINE,
    SAFE: SAFE,
    readSafeArea: readSafeArea,
    FAMILY: FAMILY,
    WAVES: WAVES,
    BONUS: BONUS,
    BONUS_BUFFS: BONUS_BUFFS,
    BONUS_TIMED: BONUS_TIMED,
    BONUS_DEBUG_KEYS: BONUS_DEBUG_KEYS,
    BONUS_BY_KEY: BONUS_BY_KEY,
    TIDE_TURNERS: TIDE_TURNERS,
    TIDE_BY_KEY: TIDE_BY_KEY,
    TIDE_HUD: TIDE_HUD,
    WEAPONS: WEAPONS,
    WEAPON_BY_KEY: WEAPON_BY_KEY,
    UPGRADES: UPGRADES,
    UPGRADE_BY_KEY: UPGRADE_BY_KEY,
    RARITY_STYLE: RARITY_STYLE,
    META: META,
    META_BY_KEY: META_BY_KEY,
    HANGAR_TRACKS: HANGAR_TRACKS,
    HANGAR_BY_KEY: HANGAR_BY_KEY,
    HULL_PAINTS: HULL_PAINTS,
    PAINT_BY_KEY: PAINT_BY_KEY,
    TRIMS: TRIMS,
    TRIM_BY_KEY: TRIM_BY_KEY,
    HULL_FRAMES: HULL_FRAMES,
    FRAME_BY_KEY: FRAME_BY_KEY,
    PROFILE_VERSION: PROFILE_VERSION,
    BANK_RATE: BANK_RATE,
    REGION_ENEMIES: REGION_ENEMIES,
    REGION_ENEMY_BY_KEY: REGION_ENEMY_BY_KEY,
    REGION_BOSSES: REGION_BOSSES,
    REGION_BOSS_BY_KEY: REGION_BOSS_BY_KEY,
    REGION_BOSS_BY_BOSS_KEY: REGION_BOSS_BY_BOSS_KEY,
    REGION_WEAPON_KEYS: REGION_WEAPON_KEYS,
    REGION_BOSS_SCHEDULE: REGION_BOSS_SCHEDULE,
    DROP_TUNING: DROP_TUNING,
    OPENING_BEATS: OPENING_BEATS,
    ARSENAL_III: ARSENAL_III,
    ATLAS_FRAME_MAP: ATLAS_FRAME_MAP
  };
}());
