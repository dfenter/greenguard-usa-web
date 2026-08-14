/* ts_data.js — Tubeshock content tables.
 * Tube families, depth runs, enemy archetypes, hazards, pickups, medals and
 * tutorial copy. Pure data plus tiny pure helpers: no Phaser, no DOM, no kit.
 * Loaded before game.js as a classic script; publishes window.TSData.
 *
 * Every keyed lookup in here has a guarded accessor at the bottom of the file
 * (familyOf / enemyOf / runOf / pickupOf). A miss returns the first row, never
 * undefined: a FAMILY[variant] miss hard-froze a shipped title once and that
 * failure mode is not allowed back in.
 */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;

  // ------------------------------------------------------------- palettes
  // Colours are numbers for Phaser tints and strings for text/HUD. Every
  // family carries a full ramp so no frame ever falls back to a grey default.
  var PAL = {
    ink: 0x050a18,
    inkCss: '#050a18',
    text: '#e9feff',
    dim: '#8fb4c6',
    gold: 0xffd36e,
    goldCss: '#ffd36e',
    silver: 0xd6e6f2,
    bronze: 0xe0955a,
    danger: 0xff5f78,
    dangerCss: '#ff5f78',
    good: 0x8ff5d2,
    goodCss: '#8ff5d2',
    surge: 0xffb84a,
    surgeCss: '#ffb84a',
    white: 0xffffff
  };

  // -------------------------------------------------------- tube families
  // shape:   radial modulation key, resolved to a function in game.js
  // lanes:   lane count for spawn quantisation and hazard widths
  // spin:    tube rotation, radians per second (signed)
  // density: spawn cadence curve. interval = base - growth * tier, floored.
  // mix:     enemy weights for the family, the "pattern curve" identity
  // hazard:  signature formation key, one per family
  var FAMILIES = [
    {
      key: 'neongrid',
      name: 'NEON GRID',
      sub: 'Clean lattice, honest lanes',
      shape: 'round',
      lanes: 12,
      spin: 0.06,
      squash: 0.94,
      rings: 8,
      density: { base: 1.02, growth: 0.052, floor: 0.30, burst: 0.16, burstMul: 0.34 },
      mix: [['crawler', 0.46], ['spinner', 0.26], ['zapper', 0.18], ['pulsar', 0.10]],
      hazard: 'pulsegate',
      hazardEvery: [13, 18],
      speed: 1.00,
      pal: {
        rim: 0x7cf4ff, spoke: 0x2e94b4, glow: 0x38d6ff, core: 0xbdfaff,
        bgTop: 0x071233, bgBot: 0x04070f, dust: 0x9ee7ff,
        enemy: 0x76f1df, accent: 0xb08cff, hazard: 0xff7bd0
      }
    },
    {
      key: 'biotube',
      name: 'BIO TUBE',
      sub: 'It breathes, and it spawns in clusters',
      shape: 'breathe',
      lanes: 10,
      spin: -0.10,
      squash: 0.90,
      rings: 7,
      density: { base: 1.16, growth: 0.058, floor: 0.34, burst: 0.24, burstMul: 0.26 },
      mix: [['crawler', 0.38], ['spinner', 0.18], ['pulsar', 0.26], ['shielder', 0.18]],
      hazard: 'sporebloom',
      hazardEvery: [11, 16],
      speed: 0.94,
      pal: {
        rim: 0x8dffa8, spoke: 0x2f7f56, glow: 0x4fe08a, core: 0xdcffe4,
        bgTop: 0x05231d, bgBot: 0x03100c, dust: 0xb6ffcd,
        enemy: 0xd6ff7a, accent: 0xff9ad0, hazard: 0xffe07a
      }
    },
    {
      key: 'crystal',
      name: 'CRYSTAL SHARD',
      sub: 'Facets block the line of fire',
      shape: 'star',
      lanes: 14,
      spin: 0.14,
      squash: 0.97,
      rings: 9,
      density: { base: 0.94, growth: 0.046, floor: 0.28, burst: 0.12, burstMul: 0.40 },
      mix: [['crawler', 0.30], ['spinner', 0.34], ['zapper', 0.22], ['shielder', 0.14]],
      hazard: 'shardlattice',
      hazardEvery: [12, 17],
      speed: 1.08,
      pal: {
        rim: 0xc0b0ff, spoke: 0x5847a8, glow: 0x9a7cff, core: 0xefe6ff,
        bgTop: 0x140a3a, bgBot: 0x070414, dust: 0xd9ccff,
        enemy: 0xa9e6ff, accent: 0xffd36e, hazard: 0x7cf4ff
      }
    },
    {
      key: 'geartube',
      name: 'GEAR WORKS',
      sub: 'The whole tube turns under you',
      shape: 'teeth',
      lanes: 16,
      spin: -0.26,
      squash: 0.92,
      rings: 8,
      density: { base: 1.08, growth: 0.050, floor: 0.31, burst: 0.18, burstMul: 0.32 },
      mix: [['crawler', 0.34], ['zapper', 0.26], ['pulsar', 0.18], ['shielder', 0.22]],
      hazard: 'gearsweep',
      hazardEvery: [14, 19],
      speed: 0.98,
      pal: {
        rim: 0xffbe6a, spoke: 0x8a5a24, glow: 0xff8f3c, core: 0xffe8c2,
        bgTop: 0x2a1408, bgBot: 0x0f0703, dust: 0xffd9a8,
        enemy: 0xffcf8a, accent: 0x7cf4ff, hazard: 0xff5f78
      }
    }
  ];

  var FAMILY_BY_KEY = {};
  for (var fi = 0; fi < FAMILIES.length; fi++) FAMILY_BY_KEY[FAMILIES[fi].key] = FAMILIES[fi];

  // --------------------------------------------------- hazard descriptions
  // Copy only. Behaviour lives in PlayScene; every family points at one row.
  var HAZARDS = {
    pulsegate: {
      name: 'PULSE GATE', warn: 'PULSE GATE ARMING',
      tip: 'Slide clear of the lit arc', arc: 0.9, life: 7.0
    },
    sporebloom: {
      name: 'SPORE BLOOM', warn: 'BLOOM INCOMING',
      tip: 'Five lanes light at once', arc: 0.0, life: 5.0
    },
    shardlattice: {
      name: 'SHARD LATTICE', warn: 'LATTICE FORMING',
      tip: 'Break the facets to clear the lane', arc: 0.0, life: 12.0
    },
    gearsweep: {
      name: 'GEAR SWEEP', warn: 'GEAR ARM ENGAGED',
      tip: 'The arm keeps turning, keep moving', arc: 0.62, life: 9.0
    }
  };

  // ---------------------------------------------------- enemy archetypes
  // hitArc: angular half-width for bullet collision (radians)
  // rate:   depth climb rate, multiplied by family speed and run tier
  var ENEMIES = [
    {
      key: 'crawler', name: 'Crawler', hp: 1, score: 60, rate: 0.150,
      hitArc: 0.20, size: 1.00, surgeValue: 1, splits: 0,
      tint: 'enemy', shape: 'dart'
    },
    {
      key: 'spinner', name: 'Spinner', hp: 1, score: 95, rate: 0.168,
      hitArc: 0.20, size: 0.94, surgeValue: 1, splits: 0,
      tint: 'accent', shape: 'rotor', weave: 1.9
    },
    {
      key: 'zapper', name: 'Zapper', hp: 2, score: 140, rate: 0.132,
      hitArc: 0.24, size: 1.06, surgeValue: 2, splits: 0,
      tint: 'hazard', shape: 'arcnode', parks: 0.80, sweep: 0.85
    },
    {
      key: 'pulsar', name: 'Pulsar', hp: 3, score: 210, rate: 0.108,
      hitArc: 0.30, size: 1.24, surgeValue: 2, splits: 2,
      tint: 'accent', shape: 'orb'
    },
    {
      key: 'shielder', name: 'Shielder', hp: 3, score: 240, rate: 0.116,
      hitArc: 0.28, size: 1.18, surgeValue: 2, splits: 0,
      tint: 'rim', shape: 'bulwark', shieldArc: 0.55
    }
  ];
  var ENEMY_BY_KEY = {};
  for (var ei = 0; ei < ENEMIES.length; ei++) ENEMY_BY_KEY[ENEMIES[ei].key] = ENEMIES[ei];

  // ------------------------------------------------------------- pickups
  // The owner's standing note: drops are generous. Base chance is high, a
  // pity counter guarantees one, and the run cannot go dry.
  var PICKUPS = [
    { key: 'surge',  name: 'SURGE CELL',   weight: 0.34, tint: 0xffb84a, glyph: 'pu_surge' },
    { key: 'mult',   name: 'SCORE X2',     weight: 0.26, tint: 0xffd36e, glyph: 'pu_mult' },
    { key: 'shield', name: 'SHIELD RING',  weight: 0.26, tint: 0x7cf4ff, glyph: 'pu_shield' },
    { key: 'life',   name: 'LIFE SHARD',   weight: 0.14, tint: 0xff8fa8, glyph: 'pu_life' }
  ];
  var PICKUP_BY_KEY = {};
  for (var pi = 0; pi < PICKUPS.length; pi++) PICKUP_BY_KEY[PICKUPS[pi].key] = PICKUPS[pi];

  var DROP = {
    baseChance: 0.34,      // per kill
    pity: 6,               // guaranteed drop after this many dropless kills
    generousChance: 0.90,  // forceGenerousDrops test switch
    surgeGain: 50,         // SURGE cell
    multSeconds: 9,
    multFactor: 2,
    shieldMax: 3,
    lifeMax: 6,
    driftSeconds: 7.5      // how long a pickup rides the rim before fading
  };

  // ---------------------------------------------------------- depth runs
  // A depth run is a chain of procedural tube segments. seg.dur is seconds of
  // live play; the transit flourish between segments is not counted.
  // tier drives spawn cadence, enemy speed and hp bonuses.
  var RUNS = [
    {
      key: 'first-light',
      name: 'FIRST LIGHT',
      sub: 'Three shallow segments, honest geometry',
      depthUnit: 120,
      segs: [
        { fam: 'neongrid', dur: 32, tier: 1.0 },
        { fam: 'neongrid', dur: 36, tier: 1.8 },
        { fam: 'biotube',  dur: 38, tier: 2.6 }
      ],
      medal: { bronze: 9000, silver: 16000, gold: 26000 }
    },
    {
      key: 'green-throat',
      name: 'GREEN THROAT',
      sub: 'The bio tube breathes and clusters',
      depthUnit: 135,
      segs: [
        { fam: 'biotube',  dur: 36, tier: 3.0 },
        { fam: 'biotube',  dur: 40, tier: 3.9 },
        { fam: 'neongrid', dur: 38, tier: 4.6 },
        { fam: 'crystal',  dur: 40, tier: 5.4 }
      ],
      medal: { bronze: 30000, silver: 53000, gold: 85000 }
    },
    {
      key: 'facet-run',
      name: 'FACET RUN',
      sub: 'Lattices block the line of fire',
      depthUnit: 150,
      segs: [
        { fam: 'crystal',  dur: 38, tier: 5.6 },
        { fam: 'crystal',  dur: 42, tier: 6.6 },
        { fam: 'geartube', dur: 40, tier: 7.4 },
        { fam: 'biotube',  dur: 42, tier: 8.2 }
      ],
      medal: { bronze: 52000, silver: 92000, gold: 148000 }
    },
    {
      key: 'iron-descent',
      name: 'IRON DESCENT',
      sub: 'The gear works turns under the claw',
      depthUnit: 165,
      segs: [
        { fam: 'geartube', dur: 40, tier: 8.4 },
        { fam: 'geartube', dur: 44, tier: 9.4 },
        { fam: 'crystal',  dur: 42, tier: 10.2 },
        { fam: 'neongrid', dur: 44, tier: 11.0 },
        { fam: 'geartube', dur: 44, tier: 11.8 }
      ],
      medal: { bronze: 101000, silver: 177000, gold: 284000 }
    },
    {
      key: 'shatterline',
      name: 'SHATTERLINE',
      sub: 'Every family, no let up',
      depthUnit: 180,
      segs: [
        { fam: 'neongrid', dur: 40, tier: 12.0 },
        { fam: 'biotube',  dur: 42, tier: 12.9 },
        { fam: 'crystal',  dur: 44, tier: 13.8 },
        { fam: 'geartube', dur: 46, tier: 14.7 },
        { fam: 'crystal',  dur: 46, tier: 15.6 }
      ],
      medal: { bronze: 140000, silver: 245000, gold: 394000 }
    },
    {
      key: 'core-breach',
      name: 'CORE BREACH',
      sub: 'Down to the guardian at the bottom',
      depthUnit: 200,
      boss: true,
      segs: [
        { fam: 'geartube', dur: 38, tier: 15.0 },
        { fam: 'crystal',  dur: 40, tier: 16.2 },
        { fam: 'biotube',  dur: 40, tier: 17.4 },
        { fam: 'neongrid', dur: 0,  tier: 18.6, boss: true }
      ],
      medal: { bronze: 92000, silver: 161000, gold: 259000 }
    }
  ];
  var RUN_BY_KEY = {};
  for (var ri = 0; ri < RUNS.length; ri++) RUN_BY_KEY[RUNS[ri].key] = RUNS[ri];

  // ------------------------------------------------------- score attack
  // One sprint, fixed length, families cycle on a timer. Not medalled: the
  // sprint is scored against the on-device best.
  var SPRINT = {
    key: 'sprint',
    name: 'SCORE ATTACK',
    sub: 'Ninety seconds, every family, one life pool',
    seconds: 90,
    swapEvery: 22,
    lives: 3,
    startTier: 3.0,
    tierPerSecond: 0.14,
    cycle: ['neongrid', 'crystal', 'biotube', 'geartube']
  };

  // --------------------------------------------------------------- boss
  // Tube guardian. Three phases; every phase has its own telegraph rhythm so
  // the fight reads without a legend.
  var BOSS = {
    name: 'TUBE GUARDIAN',
    plateHp: 6,
    plates: 4,
    coreHp: 26,
    phases: [
      {
        key: 'plates', title: 'PHASE ONE', sub: 'Break the four armour plates',
        spawnEvery: 3.1, mix: [['crawler', 0.6], ['spinner', 0.4]],
        beamEvery: 0, spin: 0.34
      },
      {
        key: 'beams', title: 'PHASE TWO', sub: 'Lane beams, keep sliding',
        spawnEvery: 2.4, mix: [['spinner', 0.5], ['zapper', 0.5]],
        beamEvery: 2.6, beamLanes: 3, spin: -0.55
      },
      {
        key: 'core', title: 'FINAL PHASE', sub: 'The core is open',
        spawnEvery: 1.8, mix: [['crawler', 0.4], ['zapper', 0.3], ['pulsar', 0.3]],
        beamEvery: 1.9, beamLanes: 4, spin: 0.80
      }
    ],
    score: 12000
  };

  // -------------------------------------------------------------- medals
  // Rating blends the owner's three axes: score, depth reached, accuracy.
  //
  // CALIBRATION. A scripted perfect player (always on the nearest threat,
  // SURGE released the instant it fills, never hit) finishes FIRST LIGHT with
  // a rating of about 56,800. Each run's ceiling is projected from that one
  // measured point through sum(segment duration x segment tier), which is the
  // quantity both spawn volume and per kill score track. Gold sits at ~0.45
  // of the projected ceiling, silver ~0.28, bronze ~0.16, so a good human run
  // medals and a perfect one is not required. The later runs are projections,
  // not measurements: re-measure them when a full ladder playtest is run.
  var MEDAL = {
    order: ['none', 'bronze', 'silver', 'gold'],
    label: { none: 'NO MEDAL', bronze: 'BRONZE', silver: 'SILVER', gold: 'GOLD' },
    tint: { none: 0x4a5c6a, bronze: 0xe0955a, silver: 0xd6e6f2, gold: 0xffd36e },
    // The three axes are weighted so a full run contributes roughly
    // 60 percent score, 20 percent depth and 20 percent accuracy. Auto fire
    // keeps raw accuracy near 0.15 to 0.35, so its weight has to be large
    // for the axis to matter at all.
    depthWeight: 3.0,
    accuracyWeight: 12000
  };

  function rating(score, depth, accuracy) {
    var acc = accuracy;
    if (!(acc >= 0) || !(acc <= 1)) acc = 0;
    return Math.round((score || 0) +
      (depth || 0) * MEDAL.depthWeight +
      acc * MEDAL.accuracyWeight);
  }

  function medalFor(runKey, score, depth, accuracy) {
    var run = runOf(runKey);
    var r = rating(score, depth, accuracy);
    if (r >= run.medal.gold) return 'gold';
    if (r >= run.medal.silver) return 'silver';
    if (r >= run.medal.bronze) return 'bronze';
    return 'none';
  }

  function medalRank(m) {
    var i = MEDAL.order.indexOf(m);
    return i < 0 ? 0 : i;
  }

  // ------------------------------------------------------------ tutorial
  // Thin fading strip, top of the screen only. Never the play area centre,
  // never the bottom half, never a modal.
  var TUTORIAL = [
    { key: 'move',  text: 'DRAG TO MOVE', hold: 4.5 },
    { key: 'fire',  text: 'AUTO-FIRE • WATCH THE LOCK', hold: 4.5 },
    { key: 'surge', text: 'FILL METER • TAP SURGE', hold: 6.0 }
  ];

  // ------------------------------------------------------- guarded lookups
  function familyOf(key) { return FAMILY_BY_KEY[key] || FAMILIES[0]; }
  function enemyOf(key) { return ENEMY_BY_KEY[key] || ENEMIES[0]; }
  function runOf(key) { return RUN_BY_KEY[key] || RUNS[0]; }
  function pickupOf(key) { return PICKUP_BY_KEY[key] || PICKUPS[0]; }
  function hazardOf(key) { return HAZARDS[key] || HAZARDS.pulsegate; }
  function runIndexOf(key) {
    for (var i = 0; i < RUNS.length; i++) if (RUNS[i].key === key) return i;
    return 0;
  }

  // Weighted pick from a [[key, weight], ...] table using a supplied 0..1
  // random source, so seeded runs stay reproducible.
  function pickWeighted(table, r) {
    if (!table || !table.length) return 'crawler';
    var total = 0, i;
    for (i = 0; i < table.length; i++) total += table[i][1];
    var v = (r || 0) * total;
    for (i = 0; i < table.length; i++) {
      v -= table[i][1];
      if (v <= 0) return table[i][0];
    }
    return table[table.length - 1][0];
  }

  root.TSData = {
    TAU: TAU,
    PAL: PAL,
    FAMILIES: FAMILIES,
    HAZARDS: HAZARDS,
    ENEMIES: ENEMIES,
    PICKUPS: PICKUPS,
    DROP: DROP,
    RUNS: RUNS,
    SPRINT: SPRINT,
    BOSS: BOSS,
    MEDAL: MEDAL,
    TUTORIAL: TUTORIAL,
    familyOf: familyOf,
    enemyOf: enemyOf,
    runOf: runOf,
    runIndexOf: runIndexOf,
    pickupOf: pickupOf,
    hazardOf: hazardOf,
    rating: rating,
    medalFor: medalFor,
    medalRank: medalRank,
    pickWeighted: pickWeighted
  };
}(typeof window !== 'undefined' ? window : globalThis));
