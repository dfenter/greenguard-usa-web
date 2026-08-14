/* bf_data.js - Bubble Fury Touch authored content tables.
 *
 * Everything designers touch lives here: arenas, the wave chain, the mode
 * chain and its unlocks, the enemy roster, the weapon rack and the medal
 * tiers. game.js reads these through guarded lookups only (see pickDef in
 * game.js) so a bad or stale key can never hard-freeze a run - a shipped
 * title once froze on a FAMILY[variant] miss and that class stays closed by
 * never indexing a table without a fallback.
 *
 * Coordinate space: arena-local pixels, origin top-left. The camera is
 * 960x540 design units and follows the player inside the arena bounds.
 */
(function (root) {
  'use strict';

  // ======================================================== enemy roster
  // Five distinct silhouettes plus the splitter shard and the boss. Every
  // type telegraphs before it commits: tell = seconds of wind-up, and the
  // renderer paints a ring or cone for exactly that long.
  var ENEMIES = {
    rusher: {
      key: 'rusher', label: 'Dart', anim: 'rusher', frames: ['rusher0', 'rusher1'],
      r: 15, hp: 26, speed: 96, touch: 13, score: 30, color: 0xff6d7c,
      tell: 0.55, cooldown: [1.5, 2.4], behaviour: 'dash',
      dashSpeed: 430, dashTime: 0.42, deathSfx: 'enemy_death',
      note: 'Closes fast, winds up, then dashes on a straight line.'
    },
    orbiter: {
      key: 'orbiter', label: 'Gyre', anim: 'orbiter', frames: ['orbiter0', 'orbiter1'],
      r: 16, hp: 34, speed: 104, touch: 9, score: 40, color: 0xc68eff,
      tell: 0.45, cooldown: [1.7, 2.6], behaviour: 'orbit',
      orbit: [150, 215], shotSpeed: 190, shotDmg: 9, shots: 3, spread: 0.30,
      bullet: 'orb_violet', deathSfx: 'enemy_death',
      note: 'Circles at range and fans three bolts on the tell.'
    },
    spitter: {
      key: 'spitter', label: 'Mortar', anim: 'spitter', frames: ['spitter0', 'spitter1'],
      r: 15, hp: 30, speed: 74, touch: 8, score: 45, color: 0xffcd6e,
      tell: 0.75, cooldown: [2.2, 3.1], behaviour: 'lob',
      standoff: [190, 280], lobTime: 1.05, lobDmg: 18, lobRadius: 62,
      bullet: 'mortar', deathSfx: 'enemy_death',
      note: 'Keeps its distance and drops an arced shell on a painted ring.'
    },
    shielder: {
      key: 'shielder', label: 'Bulwark', anim: 'shielder', frames: ['shielder0', 'shielder1'],
      r: 19, hp: 62, speed: 56, touch: 10, score: 60, color: 0x68e2dc,
      tell: 0.70, cooldown: [2.6, 3.6], behaviour: 'brace',
      frontArc: 1.15, frontMul: 0.15, waveRadius: 132, waveDmg: 14, wavePush: 260,
      deathSfx: 'elite_death',
      note: 'Front plate eats damage. Flank it, or bait the shockwave.'
    },
    splitter: {
      key: 'splitter', label: 'Sac', anim: 'splitter', frames: ['splitter0', 'splitter1'],
      r: 18, hp: 46, speed: 66, touch: 12, score: 55, color: 0xff9c68,
      tell: 0.50, cooldown: [2.0, 3.0], behaviour: 'chase',
      splitInto: 'mini', splitCount: 3, deathSfx: 'elite_death',
      note: 'Bursts into three shards when it dies. Kill it at range.'
    },
    lancer: {
      key: 'lancer', label: 'Lancer', anim: 'lancer', frames: ['lancer0', 'lancer1'],
      r: 16, hp: 40, speed: 62, touch: 8, score: 70, color: 0x96ffb0,
      tell: 1.05, cooldown: [2.6, 3.6], behaviour: 'snipe',
      standoff: [260, 380], lanceDmg: 20, lanceRange: 620, lanceWidth: 13,
      deathSfx: 'enemy_death',
      note: 'Paints a cone, then lances down it. Break the line to survive.'
    },
    mini: {
      key: 'mini', label: 'Shard', anim: 'mini', frames: ['mini0', 'mini1'],
      r: 10, hp: 14, speed: 132, touch: 8, score: 15, color: 0xff9c68,
      tell: 0.30, cooldown: [1.1, 1.8], behaviour: 'chase',
      deathSfx: 'enemy_death', small: true,
      note: 'Splitter shard. Fast, fragile, always in threes.'
    }
  };

  // Scuzz is authored separately: three phases, each with its own pattern
  // ring, tell length and move profile. The HUD reads phase from here.
  var BOSS = {
    key: 'scuzz', label: 'Scuzz', r: 46, score: 1200,
    hp: 900, hpPerWave: 130,
    rearArc: 1.05, rearMul: 2.2, frontMul: 0.42,
    phases: [
      {
        name: 'GORGE', at: 1.00, speed: 74, tell: 0.85, gap: [1.9, 2.4],
        patterns: ['charge', 'spray'], sprayCount: 14, spraySpeed: 205, sprayDmg: 11,
        chargeSpeed: 520, chargeTime: 0.72, chargeDmg: 24
      },
      {
        name: 'SPIRAL', at: 0.66, speed: 88, tell: 0.70, gap: [1.5, 2.0],
        patterns: ['spiral', 'summon', 'charge'], spiralArms: 4, spiralShots: 16,
        spiralSpeed: 190, spiralDmg: 10, summon: ['rusher', 'orbiter'], summonCount: 3,
        chargeSpeed: 560, chargeTime: 0.66, chargeDmg: 26
      },
      {
        name: 'FURY', at: 0.33, speed: 104, tell: 0.55, gap: [1.05, 1.5],
        patterns: ['triple', 'ring', 'spiral', 'summon'], tripleCount: 3,
        ringCount: 26, ringSpeed: 168, ringDmg: 12, spiralArms: 6, spiralShots: 18,
        spiralSpeed: 205, spiralDmg: 11, summon: ['rusher', 'splitter'], summonCount: 4,
        chargeSpeed: 620, chargeTime: 0.58, chargeDmg: 28
      }
    ]
  };

  // ========================================================= weapon rack
  // Distinct muzzle frame AND distinct rate of fire per weapon, so a swap is
  // felt before the HUD chip is read.
  var WEAPONS = {
    spread: {
      key: 'spread', label: 'SPREAD', kind: 'bolt', muzzle: 'mz_spread', sfx: 'fire_spread',
      rate: 0.20, dmg: 10, shots: 3, arc: 0.24, speed: 560, life: 0.95,
      bullet: 'bolt_cyan', color: 0x7aeeff, kick: 22, shake: 1.4,
      note: 'Default. Three bolts, forgiving arc, never runs out.'
    },
    beam: {
      key: 'beam', label: 'BEAM', kind: 'hitscan', muzzle: 'mz_beam', sfx: 'fire_beam',
      rate: 0.075, dmg: 6, range: 470, width: 11, color: 0x68e2dc, kick: 8, shake: 0.8,
      note: 'Fastest rate of fire. Pierces everything in the line.'
    },
    bounce: {
      key: 'bounce', label: 'BOUNCE', kind: 'bolt', muzzle: 'mz_bounce', sfx: 'fire_bounce',
      rate: 0.30, dmg: 22, shots: 1, arc: 0, speed: 470, life: 2.4, bounces: 4,
      bullet: 'bolt_amber', color: 0xffcd6e, kick: 34, shake: 2.2,
      note: 'Ricochets off walls and props. Owns the choke corridors.'
    },
    flak: {
      key: 'flak', label: 'FLAK', kind: 'bolt', muzzle: 'mz_flak', sfx: 'fire_flak',
      rate: 0.46, dmg: 9, shots: 8, arc: 0.72, speed: 500, life: 0.34,
      bullet: 'bolt_amber', color: 0xff9c68, kick: 58, shake: 3.4,
      note: 'Point blank shredder. Eight pellets, very short life.'
    },
    rail: {
      key: 'rail', label: 'RAIL', kind: 'hitscan', muzzle: 'mz_rail', sfx: 'fire_rail',
      rate: 0.62, dmg: 62, range: 720, width: 16, color: 0xc68eff, kick: 76, shake: 4.6,
      note: 'Slow, huge, pierces the whole line. Boss answer.'
    }
  };

  var WEAPON_ROTATION = ['beam', 'bounce', 'flak', 'rail'];
  var WEAPON_TIME = 15.0;

  // ============================================================== arenas
  // Every arena carries: a signature hazard or cover layout, deliberate
  // spawn lanes on the approach a designer wants used, and at least one
  // discoverable safe pocket that heals and that enemies refuse to enter.
  var ARENAS = {
    plaza: {
      key: 'plaza', name: 'Sunset Plaza', floor: 'floor_plaza', tint: 0x0f1c2e,
      accent: 0x7aeeff, w: 1500, h: 940, music: 'music_arena', amb: 'amb_arena',
      identity: 'Open plaza. Long sightlines, nowhere to hide, a slow pool in the middle.',
      dark: 0,
      pillars: [
        { x: 420, y: 300, r: 42 }, { x: 1080, y: 300, r: 42 },
        { x: 420, y: 640, r: 42 }, { x: 1080, y: 640, r: 42 },
        { x: 750, y: 180, r: 30 }, { x: 750, y: 760, r: 30 }
      ],
      walls: [],
      hazards: [{ x: 750, y: 470, r: 132, type: 'slow', label: 'DRAG POOL' }],
      barrels: [{ x: 300, y: 470 }, { x: 1200, y: 470 }],
      pockets: [{ x: 176, y: 176, r: 74, name: 'North alcove' }],
      lanes: [
        { x: 120, y: 130 }, { x: 750, y: 96 }, { x: 1380, y: 130 },
        { x: 1400, y: 470 }, { x: 1380, y: 810 }, { x: 750, y: 850 },
        { x: 120, y: 810 }, { x: 100, y: 470 }
      ]
    },
    yard: {
      key: 'yard', name: 'Scrap Yard', floor: 'floor_yard', tint: 0x241c14,
      accent: 0xffcd6e, w: 1500, h: 1000, music: 'music_arena', amb: 'amb_arena',
      identity: 'Cluttered cover. Crates break sightlines, barrels detonate for area damage.',
      dark: 0,
      pillars: [{ x: 260, y: 820, r: 34 }, { x: 1240, y: 190, r: 34 }],
      walls: [
        { x: 380, y: 200, w: 220, h: 46 }, { x: 900, y: 200, w: 220, h: 46 },
        { x: 380, y: 754, w: 220, h: 46 }, { x: 900, y: 754, w: 220, h: 46 },
        { x: 214, y: 380, w: 46, h: 240 }, { x: 1240, y: 380, w: 46, h: 240 },
        { x: 610, y: 430, w: 280, h: 46 }, { x: 610, y: 560, w: 280, h: 46 }
      ],
      crates: [
        { x: 480, y: 340 }, { x: 1020, y: 340 }, { x: 480, y: 660 }, { x: 1020, y: 660 },
        { x: 750, y: 260 }, { x: 750, y: 740 }, { x: 330, y: 500 }, { x: 1170, y: 500 }
      ],
      hazards: [],
      barrels: [
        { x: 620, y: 300 }, { x: 880, y: 300 }, { x: 620, y: 700 }, { x: 880, y: 700 },
        { x: 200, y: 200 }, { x: 1300, y: 800 }
      ],
      pockets: [{ x: 750, y: 500, r: 66, name: 'Crate hollow' }],
      lanes: [
        { x: 110, y: 120 }, { x: 1390, y: 120 }, { x: 110, y: 880 },
        { x: 1390, y: 880 }, { x: 750, y: 90 }, { x: 750, y: 910 }
      ]
    },
    choke: {
      key: 'choke', name: 'Chokeworks', floor: 'floor_choke', tint: 0x121828,
      accent: 0x96a8ec, w: 1700, h: 820, music: 'music_arena', amb: 'amb_arena',
      identity: 'Three narrow corridors joined by two gaps. Ricochets rule here.',
      dark: 0,
      pillars: [],
      walls: [
        { x: 260, y: 262, w: 520, h: 44 }, { x: 940, y: 262, w: 520, h: 44 },
        { x: 260, y: 514, w: 520, h: 44 }, { x: 940, y: 514, w: 520, h: 44 },
        { x: 820, y: 60, w: 44, h: 150 }, { x: 820, y: 610, w: 44, h: 150 },
        { x: 120, y: 360, w: 44, h: 100 }, { x: 1540, y: 360, w: 44, h: 100 }
      ],
      hazards: [
        { x: 430, y: 410, r: 78, type: 'burn', dps: 16, label: 'GRATE' },
        { x: 1270, y: 410, r: 78, type: 'burn', dps: 16, label: 'GRATE' }
      ],
      barrels: [{ x: 850, y: 410 }, { x: 640, y: 140 }, { x: 1060, y: 680 }],
      pockets: [{ x: 1600, y: 130, r: 62, name: 'East dead end' }],
      lanes: [
        { x: 90, y: 140 }, { x: 90, y: 410 }, { x: 90, y: 690 },
        { x: 1610, y: 690 }, { x: 1610, y: 410 }, { x: 850, y: 60 }
      ]
    },
    night: {
      key: 'night', name: 'Nightfall Yard', floor: 'floor_night', tint: 0x070a14,
      accent: 0x6084be, w: 1500, h: 940, music: 'music_arena', amb: 'amb_arena',
      identity: 'Sight cut to a lamp radius. Enemies fade in at the edge of the light.',
      dark: 1,
      lamps: [{ x: 300, y: 250 }, { x: 1200, y: 250 }, { x: 300, y: 690 }, { x: 1200, y: 690 }],
      pillars: [
        { x: 750, y: 470, r: 54 }, { x: 300, y: 470, r: 32 }, { x: 1200, y: 470, r: 32 }
      ],
      walls: [
        { x: 560, y: 170, w: 380, h: 40 }, { x: 560, y: 730, w: 380, h: 40 }
      ],
      hazards: [{ x: 750, y: 180, r: 88, type: 'slow', label: 'MIRE' },
                { x: 750, y: 760, r: 88, type: 'slow', label: 'MIRE' }],
      barrels: [{ x: 480, y: 470 }, { x: 1020, y: 470 }],
      pockets: [{ x: 1200, y: 690, r: 78, name: 'Lamp pool' }],
      lanes: [
        { x: 110, y: 130 }, { x: 1390, y: 130 }, { x: 110, y: 810 },
        { x: 1390, y: 810 }, { x: 750, y: 88 }, { x: 750, y: 852 }
      ]
    },
    furnace: {
      key: 'furnace', name: 'Furnace Deck', floor: 'floor_furnace', tint: 0x22090f,
      accent: 0xff8060, w: 1560, h: 920, music: 'music_boss', amb: 'amb_arena',
      identity: 'Four vents on a shared cycle. The safe ground moves every six seconds.',
      dark: 0,
      pillars: [{ x: 780, y: 460, r: 46 }],
      walls: [
        { x: 200, y: 200, w: 40, h: 180 }, { x: 1320, y: 540, w: 40, h: 180 },
        { x: 640, y: 130, w: 280, h: 38 }, { x: 640, y: 752, w: 280, h: 38 }
      ],
      hazards: [
        { x: 400, y: 250, r: 104, type: 'vent', dps: 30, period: 6.0, phase: 0.0 },
        { x: 1160, y: 250, r: 104, type: 'vent', dps: 30, period: 6.0, phase: 1.5 },
        { x: 400, y: 670, r: 104, type: 'vent', dps: 30, period: 6.0, phase: 3.0 },
        { x: 1160, y: 670, r: 104, type: 'vent', dps: 30, period: 6.0, phase: 4.5 }
      ],
      barrels: [{ x: 780, y: 200 }, { x: 780, y: 720 }],
      pockets: [{ x: 780, y: 460, r: 96, name: 'Core ring', ring: 1 }],
      lanes: [
        { x: 100, y: 120 }, { x: 1460, y: 120 }, { x: 100, y: 800 },
        { x: 1460, y: 800 }, { x: 780, y: 70 }, { x: 780, y: 850 }
      ]
    }
  };

  var ARENA_ORDER = ['plaza', 'yard', 'choke', 'night', 'furnace'];

  // ========================================================== wave chain
  // Fifteen authored waves. comp entries are [type, count]; drip is the
  // seconds between spawns inside a wave, so a wave arrives as a stream
  // rather than a wall.
  var WAVES = [
    { n: 1, arena: 'plaza', drip: 0.55, comp: [['rusher', 5]], intro: 'Darts only. Learn the aim split.' },
    { n: 2, arena: 'plaza', drip: 0.50, comp: [['rusher', 6], ['orbiter', 2]] },
    { n: 3, arena: 'plaza', drip: 0.48, comp: [['rusher', 5], ['orbiter', 3], ['spitter', 2]] },
    { n: 4, arena: 'plaza', drip: 0.44, comp: [['rusher', 6], ['spitter', 3], ['splitter', 2]] },
    { n: 5, arena: 'plaza', drip: 0.60, comp: [['rusher', 4], ['orbiter', 2]], boss: 1, intro: 'Scuzz breaches the plaza.' },
    { n: 6, arena: 'yard', drip: 0.46, comp: [['rusher', 6], ['shielder', 2], ['orbiter', 2]], intro: 'Scrap Yard. Use the crates.' },
    { n: 7, arena: 'yard', drip: 0.44, comp: [['rusher', 5], ['shielder', 3], ['spitter', 3]] },
    { n: 8, arena: 'yard', drip: 0.42, comp: [['splitter', 4], ['shielder', 2], ['orbiter', 3]] },
    { n: 9, arena: 'yard', drip: 0.40, comp: [['rusher', 7], ['lancer', 2], ['spitter', 3]], intro: 'Lancers on the roofline.' },
    { n: 10, arena: 'choke', drip: 0.55, comp: [['shielder', 3], ['orbiter', 3]], boss: 2, intro: 'Scuzz corners you in the works.' },
    { n: 11, arena: 'night', drip: 0.44, comp: [['rusher', 7], ['orbiter', 4], ['lancer', 2]], intro: 'Lights out. Watch the edges.' },
    { n: 12, arena: 'night', drip: 0.42, comp: [['splitter', 4], ['spitter', 4], ['lancer', 2]] },
    { n: 13, arena: 'night', drip: 0.40, comp: [['rusher', 8], ['shielder', 3], ['splitter', 3]] },
    { n: 14, arena: 'furnace', drip: 0.38, comp: [['lancer', 3], ['shielder', 3], ['orbiter', 4], ['splitter', 3]], intro: 'Furnace Deck. Mind the vents.' },
    { n: 15, arena: 'furnace', drip: 0.62, comp: [['shielder', 3], ['lancer', 2], ['splitter', 3]], boss: 3, intro: 'Scuzz, whole and furious.' }
  ];

  // Endless composition past the authored chain: pull from this pool and
  // scale count with the wave number.
  var ENDLESS_POOL = ['rusher', 'orbiter', 'spitter', 'shielder', 'splitter', 'lancer'];
  var ENDLESS_ARENAS = ['plaza', 'yard', 'choke', 'night', 'furnace'];

  // ========================================================== mode chain
  // Each mode carries its own density, timers, drop generosity and medal
  // ladder. requires is resolved against the save in game.js; a mode whose
  // requirement is unmet renders locked but still lists what opens it.
  var MODES = {
    standard: {
      key: 'standard', label: 'STANDARD RUN', order: 0,
      blurb: 'Waves 1 to 15 across five arenas, Scuzz on 5, 10 and 15.',
      waves: 15, density: 1.0, speed: 1.0, hp: 130, dropMul: 1.0,
      waveTimer: 0, endless: 0, requires: null,
      medals: { bronze: 9000, silver: 17000, gold: 27000 }
    },
    blitz: {
      key: 'blitz', label: 'BLITZ MODE', order: 1,
      blurb: 'Same fifteen waves on a clock. Clear fast or the deck bites back.',
      waves: 15, density: 1.35, speed: 1.12, hp: 120, dropMul: 1.25,
      waveTimer: 26, timerPenalty: 12, endless: 0,
      requires: { mode: 'standard', cleared: 1 },
      requiresText: 'Clear Standard Run to unlock.',
      medals: { bronze: 14000, silver: 24000, gold: 36000 }
    },
    endless: {
      key: 'endless', label: 'SURVIVAL ENDLESS', order: 2,
      blurb: 'No finish line. Waves keep scaling, Scuzz every fifth.',
      waves: 0, density: 1.1, speed: 1.05, hp: 130, dropMul: 1.15,
      waveTimer: 0, endless: 1,
      requires: { mode: 'standard', medal: 'silver' },
      requiresText: 'Earn Silver in Standard Run to unlock.',
      medals: { bronze: 16000, silver: 30000, gold: 52000 }
    },
    fury: {
      key: 'fury', label: 'FURY PROTOCOL', order: 3,
      blurb: 'The hardest finale. Scuzz opens in phase three and never calms.',
      waves: 15, density: 1.5, speed: 1.2, hp: 100, dropMul: 0.85,
      waveTimer: 30, timerPenalty: 16, endless: 0, furyBoss: 1,
      requires: { all: [
        { mode: 'standard', medal: 'gold' },
        { mode: 'blitz', medal: 'gold' },
        { mode: 'endless', wave: 20 }
      ] },
      requiresText: 'Gold in Standard and Blitz, plus wave 20 in Endless.',
      medals: { bronze: 20000, silver: 38000, gold: 60000 }
    }
  };

  var MODE_ORDER = ['standard', 'blitz', 'endless', 'fury'];

  // ============================================================== drops
  // The owner always wants generous drops. These are per-kill chances,
  // multiplied by the mode dropMul and raised further when the player is
  // hurt, so a bad wave is recoverable instead of a death spiral.
  var DROPS = {
    health: 0.26, healthHurt: 0.46, healthHurtBelow: 0.7,
    mult: 0.22, weapon: 0.12,
    bossWeapon: 1, bossHealth: 3, bossMult: 2,
    waveClearWeaponEvery: 2, waveClearHealth: 2
  };

  // Score multiplier ladder. Tokens step it up, a quiet spell steps it back
  // down one rung, and it never falls below x1.
  var MULT = { steps: [1, 1.5, 2, 2.5, 3, 4, 5], decay: 7.0, killGrace: 3.0 };

  // =========================================================== tutorial
  // First run only. The coach strip is a thin fading band pinned near the
  // top of the screen: it never blocks the play area centre or bottom half.
  var TUTORIAL = [
    { id: 'move', text: 'Drag anywhere on the LEFT half to move.', done: 'moved', hold: 1.4 },
    { id: 'aim', text: 'Drag on the RIGHT half to aim, and you fire while you hold.', done: 'fired', hold: 1.4 },
    { id: 'kill', text: 'Drop the first dart.', done: 'killed', hold: 1.0 },
    { id: 'pickup', text: 'Run over a pickup to swap weapons or heal.', done: 'picked', hold: 1.6 },
    { id: 'pocket', text: 'Every arena hides a safe pocket that heals you. Find it.', done: 'pocket', hold: 2.4, optional: 1 }
  ];

  var BF = {
    ENEMIES: ENEMIES, BOSS: BOSS, WEAPONS: WEAPONS,
    WEAPON_ROTATION: WEAPON_ROTATION, WEAPON_TIME: WEAPON_TIME,
    ARENAS: ARENAS, ARENA_ORDER: ARENA_ORDER,
    WAVES: WAVES, ENDLESS_POOL: ENDLESS_POOL, ENDLESS_ARENAS: ENDLESS_ARENAS,
    MODES: MODES, MODE_ORDER: MODE_ORDER,
    DROPS: DROPS, MULT: MULT, TUTORIAL: TUTORIAL,
    VIEW_W: 960, VIEW_H: 540
  };

  root.BF_DATA = BF;
  if (typeof module !== 'undefined' && module.exports) module.exports = BF;
})(typeof window !== 'undefined' ? window : globalThis);
