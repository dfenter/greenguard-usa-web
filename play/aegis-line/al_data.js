/* Aegis Line - al_data.js
 * Authored content tables: squad roster, weapon classes, burst skills,
 * enemy families, five chapter identities, the thirty stage campaign,
 * the twenty floor tower, daily modifiers, and the level and gear tracks.
 *
 * Pure data plus a few pure helpers. No engine references, no side effects
 * beyond publishing window.ALData, so the harness and the game read the same
 * registry and every persisted id can be validated against it.
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------- weapons
  // rpm        rounds per minute
  // dmg        damage per bullet (per pellet for the shotgun)
  // pellets    bullets per trigger pull
  // spread     cone half-width in design pixels at the cover line
  // mag        magazine size
  // reload     seconds for a full reload
  // kick       recoil impulse per shot, design px
  // recover    recoil recovery, px per second
  // crit       weak-point damage multiplier
  // pierce     bullets pass through the first target
  // splash     area damage radius (0 = none)
  var WEAPONS = {
    AR:  { key: 'AR',  name: 'ASSAULT',   rpm: 480, dmg: 22,  pellets: 1, spread: 8,  mag: 32, reload: 1.50, kick: 3.2, recover: 46, crit: 2.4, pierce: 0, splash: 0,  splashDmg: 0 },
    SMG: { key: 'SMG', name: 'SUBGUN',    rpm: 780, dmg: 13,  pellets: 1, spread: 13, mag: 45, reload: 1.30, kick: 2.0, recover: 58, crit: 2.2, pierce: 0, splash: 0,  splashDmg: 0 },
    SG:  { key: 'SG',  name: 'SHOTGUN',   rpm: 105, dmg: 14,  pellets: 6, spread: 34, mag: 8,  reload: 2.00, kick: 8.0, recover: 40, crit: 2.0, pierce: 0, splash: 0,  splashDmg: 0 },
    SR:  { key: 'SR',  name: 'RAILGUN',   rpm: 55,  dmg: 205, pellets: 1, spread: 0,  mag: 5,  reload: 2.40, kick: 12,  recover: 34, crit: 3.2, pierce: 1, splash: 0,  splashDmg: 0 },
    MG:  { key: 'MG',  name: 'SUPPRESS',  rpm: 600, dmg: 17,  pellets: 1, spread: 16, mag: 90, reload: 3.00, kick: 2.6, recover: 52, crit: 2.0, pierce: 0, splash: 0,  splashDmg: 0 },
    RL:  { key: 'RL',  name: 'ROCKET',    rpm: 60,  dmg: 150, pellets: 1, spread: 3,  mag: 4,  reload: 2.60, kick: 10,  recover: 36, crit: 1.8, pierce: 0, splash: 62, splashDmg: 58 },
    DMR: { key: 'DMR', name: 'MARKSMAN',  rpm: 200, dmg: 60,  pellets: 1, spread: 3,  mag: 12, reload: 1.80, kick: 6.0, recover: 44, crit: 2.8, pierce: 0, splash: 0,  splashDmg: 0 },
    GL:  { key: 'GL',  name: 'GRENADE',   rpm: 90,  dmg: 96,  pellets: 1, spread: 6,  mag: 6,  reload: 2.20, kick: 7.0, recover: 38, crit: 1.9, pierce: 0, splash: 78, splashDmg: 64 }
  };
  var WEAPON_KEYS = ['AR', 'SMG', 'SG', 'SR', 'MG', 'RL', 'DMR', 'GL'];

  // Recoil walk patterns. Each shot advances one step in the unit's pattern,
  // so the climb is learnable instead of random: the player can pull down
  // against a shape. Values are multipliers on the weapon kick.
  var RECOIL_PATTERNS = {
    AR:  [[0, -1], [0.15, -1], [0.32, -0.9], [0.42, -0.8], [0.28, -0.9], [-0.05, -1], [-0.3, -0.9], [-0.45, -0.8], [-0.3, -0.9], [0, -1]],
    SMG: [[0, -1], [0.24, -0.85], [0.4, -0.7], [0.2, -0.85], [-0.18, -0.9], [-0.4, -0.7], [-0.22, -0.85], [0.05, -1]],
    SG:  [[0, -1], [0.2, -1], [-0.2, -1]],
    SR:  [[0, -1]],
    MG:  [[0, -1], [0.18, -0.9], [0.36, -0.8], [0.5, -0.7], [0.34, -0.8], [0.05, -0.95], [-0.24, -0.85], [-0.46, -0.7], [-0.6, -0.6], [-0.4, -0.8], [-0.12, -0.95], [0.1, -1]],
    RL:  [[0, -1]],
    DMR: [[0, -1], [0.25, -0.9], [-0.25, -0.9]],
    GL:  [[0, -1], [0.3, -0.85], [-0.3, -0.85]]
  };

  // -------------------------------------------------------------- roster
  // Eight originals. role drives the burst family and the passive.
  // unlock is the campaign stage number that opens the unit.
  var SQUAD = [
    { id: 'venn', name: 'VENN', call: 'Point', weapon: 'AR', role: 'breaker', unlock: 0,
      color: 0xff6b57, alt: 0xffc08a, hair: 0x2a1a20, letter: 'V',
      burst: { name: 'OVERWATCH VOLLEY', short: 'VOLLEY', cost: 300, dur: 4.0,
        line: 'Fire rate doubled, recoil pinned.' },
      passive: { key: 'dmg', value: 0.06, line: 'Squad damage +6%.' } },

    { id: 'ossa', name: 'OSSA', call: 'Anchor', weapon: 'MG', role: 'bulwark', unlock: 0,
      color: 0x51d6a0, alt: 0xb6ffe0, hair: 0x123a2e, letter: 'O',
      burst: { name: 'BULWARK SCREEN', short: 'SCREEN', cost: 260, dur: 6.5,
        line: 'Cover damage cut by 80 percent.' },
      passive: { key: 'armor', value: 0.08, line: 'Cover damage taken -8%.' } },

    { id: 'kite', name: 'KITE', call: 'Spotter', weapon: 'SR', role: 'breaker', unlock: 0,
      color: 0xffc857, alt: 0xfff0b8, hair: 0x3a2a10, letter: 'K',
      burst: { name: 'PIERCE MARK', short: 'PIERCE', cost: 340, dur: 0.6,
        line: 'Rail lance through the lane, cores auto crit.' },
      passive: { key: 'crit', value: 0.10, line: 'Weak-point damage +10%.' } },

    { id: 'rook', name: 'ROOK', call: 'Breach', weapon: 'SG', role: 'bulwark', unlock: 4,
      color: 0x6da8ff, alt: 0xcfe4ff, hair: 0x1b2b46, letter: 'R',
      burst: { name: 'SHATTER WALL', short: 'SHATTER', cost: 280, dur: 1.2,
        line: 'Shockwave staggers and pushes the front rank.' },
      passive: { key: 'stagger', value: 0.12, line: 'Stagger buildup +12%.' } },

    { id: 'hush', name: 'HUSH', call: 'Medic', weapon: 'SMG', role: 'medic', unlock: 8,
      color: 0xdf7bd8, alt: 0xffd0f6, hair: 0x3a1a38, letter: 'H',
      burst: { name: 'FIELD SUTURE', short: 'SUTURE', cost: 250, dur: 5.0,
        line: 'Repairs cover and holds a regen field.' },
      passive: { key: 'regen', value: 0.6, line: 'Ducked repair +0.6 per second.' } },

    { id: 'nova', name: 'NOVA', call: 'Artillery', weapon: 'RL', role: 'breaker', unlock: 13,
      color: 0xa98bff, alt: 0xded0ff, hair: 0x241a44, letter: 'N',
      burst: { name: 'SKYFALL SALVO', short: 'SALVO', cost: 360, dur: 2.2,
        line: 'Five rockets onto the densest cluster.' },
      passive: { key: 'splash', value: 0.15, line: 'Splash radius +15%.' } },

    { id: 'wren', name: 'WREN', call: 'Analyst', weapon: 'DMR', role: 'medic', unlock: 19,
      color: 0x62e0ef, alt: 0xd2fbff, hair: 0x123f47, letter: 'W',
      burst: { name: 'TARGET SYNC', short: 'SYNC', cost: 300, dur: 7.0,
        line: 'Cores exposed and enlarged across the field.' },
      passive: { key: 'gauge', value: 0.10, line: 'Burst charge rate +10%.' } },

    { id: 'idris', name: 'IDRIS', call: 'Warden', weapon: 'GL', role: 'bulwark', unlock: 25,
      color: 0xffa24c, alt: 0xffe0b0, hair: 0x40230f, letter: 'I',
      burst: { name: 'AEGIS ANCHOR', short: 'ANCHOR', cost: 320, dur: 3.6,
        line: 'Advance frozen, incoming fire reflected.' },
      passive: { key: 'reload', value: 0.10, line: 'Reload speed +10%.' } }
  ];
  var SQUAD_BY_ID = {};
  var SQUAD_IDS = [];
  for (var si = 0; si < SQUAD.length; si++) { SQUAD_BY_ID[SQUAD[si].id] = SQUAD[si]; SQUAD_IDS.push(SQUAD[si].id); }

  // --------------------------------------------------------- enemy family
  // r        body radius in design px at depth scale 1
  // core     weak point offset {x, y} and radius
  // hp       base hit points at tier 1
  // speed    advance speed, design px per second
  // dps      damage a landed volley does to cover integrity
  // windup   telegraph seconds before the volley lands
  // cadence  seconds between volleys
  // armor    flat damage reduction on non-core hits
  var ENEMIES = {
    crawler: { key: 'crawler', name: 'CRAWLER', r: 15, coreX: 0, coreY: -3, coreR: 6,
      hp: 46, speed: 26, dmg: 5, windup: 0.75, cadence: 2.6, armor: 0, score: 60, stagger: 1.0, ranged: false },
    lancer:  { key: 'lancer', name: 'LANCER', r: 19, coreX: 0, coreY: -8, coreR: 7,
      hp: 88, speed: 15, dmg: 9, windup: 1.15, cadence: 3.1, armor: 2, score: 110, stagger: 0.8, ranged: true },
    shielder:{ key: 'shielder', name: 'SHIELDER', r: 22, coreX: 0, coreY: -2, coreR: 8,
      hp: 150, speed: 11, dmg: 11, windup: 1.35, cadence: 3.6, armor: 9, score: 170, stagger: 0.5, ranged: true, shielded: true },
    spitter: { key: 'spitter', name: 'SPITTER', r: 17, coreX: 0, coreY: 5, coreR: 7,
      hp: 74, speed: 19, dmg: 8, windup: 1.0, cadence: 2.4, armor: 1, score: 120, stagger: 0.9, ranged: true, arcing: true },
    warden:  { key: 'warden', name: 'WARDEN', r: 30, coreX: 0, coreY: -6, coreR: 10,
      hp: 430, speed: 9, dmg: 15, windup: 1.5, cadence: 3.4, armor: 14, score: 420, stagger: 0.35, ranged: true, elite: true, cores: 2 },
    sapper:  { key: 'sapper', name: 'SAPPER', r: 13, coreX: 0, coreY: 0, coreR: 5,
      hp: 34, speed: 46, dmg: 14, windup: 0.5, cadence: 9, armor: 0, score: 90, stagger: 1.4, ranged: false, charger: true }
  };
  var ENEMY_KEYS = ['crawler', 'lancer', 'shielder', 'spitter', 'warden', 'sapper'];

  var BOSSES = {
    titan:    { key: 'titan', name: 'OVERPASS TITAN', hp: 3200, r: 58, armor: 18, dmg: 20,
      cores: [{ x: -20, y: -18, r: 12 }, { x: 20, y: -18, r: 12 }, { x: 0, y: 14, r: 14 }],
      patterns: ['sweep', 'slam', 'summon'], score: 3000 },
    dredge:   { key: 'dredge', name: 'HARBOR DREDGE', hp: 4400, r: 62, armor: 22, dmg: 22,
      cores: [{ x: 0, y: -24, r: 13 }, { x: -26, y: 10, r: 11 }, { x: 26, y: 10, r: 11 }],
      patterns: ['rake', 'flood', 'summon'], score: 3800 },
    maw:      { key: 'maw', name: 'GLACIER MAW', hp: 6000, r: 66, armor: 26, dmg: 25,
      cores: [{ x: 0, y: 4, r: 16 }, { x: -30, y: -20, r: 10 }, { x: 30, y: -20, r: 10 }],
      patterns: ['freeze', 'slam', 'sweep'], score: 4800 },
    queen:    { key: 'queen', name: 'HIVE QUEEN', hp: 8200, r: 70, armor: 28, dmg: 27,
      cores: [{ x: 0, y: -28, r: 12 }, { x: -22, y: 12, r: 12 }, { x: 22, y: 12, r: 12 }],
      patterns: ['brood', 'sweep', 'flood'], score: 6200 },
    sentinel: { key: 'sentinel', name: 'AEGIS SENTINEL', hp: 12000, r: 76, armor: 34, dmg: 30,
      cores: [{ x: 0, y: -30, r: 11 }, { x: -30, y: 0, r: 11 }, { x: 30, y: 0, r: 11 }, { x: 0, y: 24, r: 14 }],
      patterns: ['rake', 'slam', 'freeze', 'summon'], score: 9000 }
  };
  var BOSS_KEYS = ['titan', 'dredge', 'maw', 'queen', 'sentinel'];

  // ------------------------------------------------------------ chapters
  // Five authored identities. Each owns a sky ramp, silhouette palette,
  // a signature light treatment and an ambient weather system.
  var CHAPTERS = [
    { key: 'overpass', name: 'RUINED OVERPASS', sub: 'Dusk over the collapsed ring road',
      sky: ['#160a12', '#3a1220', '#803019', '#c86326', '#f0a14a'],
      far: 0x2a1220, mid: 0x1c0d18, near: 0x120810,
      fog: 0xff8a4c, light: 0xffb066, lightName: 'low sun rim',
      accent: 0xffb066, enemyTint: 0xff8f6a, weather: 'ash',
      families: ['crawler', 'lancer', 'shielder', 'sapper'], boss: 'titan' },

    { key: 'tidewall', name: 'TIDEWALL HARBOR', sub: 'Container stacks under cold rain',
      sky: ['#04121c', '#062434', '#0b3c50', '#166078', '#3d94a6'],
      far: 0x0a2634, mid: 0x071c28, near: 0x04141c,
      fog: 0x6ce4db, light: 0x8fe6ff, lightName: 'overcast bounce',
      accent: 0x6ef6ff, enemyTint: 0x7fd8ff, weather: 'rain',
      families: ['crawler', 'spitter', 'shielder', 'sapper'], boss: 'dredge' },

    { key: 'snowline', name: 'SNOWLINE BASE', sub: 'Research domes on a white ridge',
      sky: ['#0a1220', '#16283e', '#2b4a66', '#587e9c', '#9fc4d8'],
      far: 0x2c4460, mid: 0x1d3048, near: 0x14202f,
      fog: 0xd9fdff, light: 0xeaf6ff, lightName: 'flat snow key',
      accent: 0xa8e8ff, enemyTint: 0xc4dcff, weather: 'snow',
      families: ['lancer', 'shielder', 'warden', 'crawler'], boss: 'maw' },

    { key: 'hive', name: 'HIVE INTERIOR', sub: 'Chitin arches and living light',
      sky: ['#11041c', '#26073a', '#450f5c', '#6c1a76', '#a63a8c'],
      far: 0x330d4a, mid: 0x220734, near: 0x160424,
      fog: 0xec9bff, light: 0xff9ee8, lightName: 'bioluminescent pulse',
      accent: 0xec9bff, enemyTint: 0xff9ee8, weather: 'spore',
      families: ['crawler', 'spitter', 'warden', 'sapper'], boss: 'queen' },

    { key: 'aegis', name: 'AEGIS CORE', sub: 'The reactor ring, final line',
      sky: ['#0d0a04', '#241704', '#4c3208', '#8a5c12', '#d8a63a'],
      far: 0x3a2708, mid: 0x261805, near: 0x180f04,
      fog: 0xffd978, light: 0xfff0c0, lightName: 'hard gold key',
      accent: 0xffd978, enemyTint: 0xffcf8a, weather: 'ember',
      families: ['lancer', 'shielder', 'warden', 'crawler'], boss: 'sentinel' }
  ];
  var CHAPTER_BY_KEY = {};
  for (var ci = 0; ci < CHAPTERS.length; ci++) CHAPTER_BY_KEY[CHAPTERS[ci].key] = CHAPTERS[ci];

  // ------------------------------------------------------------- stages
  // Thirty authored stages, six per chapter. kind: normal | elite | boss.
  // waves is the wave count, tier scales enemy hp and damage, mix names the
  // families that can spawn, credits and cores are the clear rewards.
  function st(ch, name, sub, kind, waves, tier, mix, credits, cores) {
    return { ch: ch, name: name, sub: sub, kind: kind, waves: waves, tier: tier, mix: mix, credits: credits, cores: cores };
  }
  var STAGES = [
    // Chapter 1 - Ruined Overpass
    st(0, 'FIRST CONTACT', 'Hold the on-ramp', 'normal', 3, 1.00, ['crawler'], 60, 0),
    st(0, 'GUARDRAIL', 'Lancers on the deck', 'normal', 3, 1.15, ['crawler', 'lancer'], 70, 0),
    st(0, 'PILE UP', 'Shielded push', 'elite', 4, 1.32, ['crawler', 'lancer', 'shielder'], 110, 1),
    st(0, 'SPAN BREAK', 'Sappers in the rubble', 'normal', 4, 1.46, ['crawler', 'sapper', 'lancer'], 90, 0),
    st(0, 'ASH FALL', 'Heavy contact', 'normal', 4, 1.62, ['lancer', 'shielder', 'sapper'], 100, 0),
    st(0, 'OVERPASS TITAN', 'Chapter boss', 'boss', 1, 1.75, ['crawler', 'lancer'], 220, 3),

    // Chapter 2 - Tidewall Harbor
    st(1, 'WET DECK', 'Rain on the container yard', 'normal', 4, 1.85, ['crawler', 'spitter'], 110, 0),
    st(1, 'CRANE LINE', 'Arcing fire from above', 'normal', 4, 2.00, ['spitter', 'lancer'], 120, 0),
    st(1, 'BREAKWATER', 'Shield wall advance', 'elite', 5, 2.20, ['shielder', 'spitter', 'crawler'], 170, 1),
    st(1, 'SLIPWAY', 'Fast runners in the alleys', 'normal', 4, 2.36, ['sapper', 'crawler', 'spitter'], 130, 0),
    st(1, 'DRY DOCK', 'Mixed assault', 'normal', 5, 2.55, ['shielder', 'spitter', 'sapper'], 145, 1),
    st(1, 'HARBOR DREDGE', 'Chapter boss', 'boss', 1, 2.70, ['spitter', 'crawler'], 300, 3),

    // Chapter 3 - Snowline Base
    st(2, 'WHITEOUT', 'Zero visibility approach', 'normal', 4, 2.85, ['crawler', 'lancer'], 150, 0),
    st(2, 'ANTENNA FARM', 'Long range trade', 'normal', 5, 3.05, ['lancer', 'shielder'], 165, 0),
    st(2, 'DOME NINE', 'First warden', 'elite', 5, 3.30, ['warden', 'lancer', 'crawler'], 230, 2),
    st(2, 'ICE SHELF', 'Cracked ground, fast push', 'normal', 5, 3.50, ['crawler', 'shielder', 'lancer'], 175, 1),
    st(2, 'CORE SAMPLE', 'Two wardens', 'normal', 5, 3.72, ['warden', 'shielder', 'lancer'], 195, 1),
    st(2, 'GLACIER MAW', 'Chapter boss', 'boss', 1, 3.90, ['crawler', 'lancer'], 400, 4),

    // Chapter 4 - Hive Interior
    st(3, 'THRESHOLD', 'Into the chitin', 'normal', 5, 4.10, ['crawler', 'spitter'], 190, 0),
    st(3, 'BROOD GALLERY', 'Swarming approach', 'normal', 5, 4.35, ['crawler', 'sapper', 'spitter'], 205, 1),
    st(3, 'VEIN CHAMBER', 'Warden nest', 'elite', 6, 4.62, ['warden', 'spitter', 'crawler'], 280, 2),
    st(3, 'SPORE FALL', 'Air thick with spores', 'normal', 5, 4.85, ['spitter', 'sapper', 'crawler'], 220, 1),
    st(3, 'DEEP TUNNEL', 'Everything at once', 'normal', 6, 5.10, ['warden', 'spitter', 'sapper', 'crawler'], 240, 1),
    st(3, 'HIVE QUEEN', 'Chapter boss', 'boss', 1, 5.30, ['crawler', 'spitter'], 520, 5),

    // Chapter 5 - Aegis Core
    st(4, 'OUTER RING', 'The reactor wakes', 'normal', 5, 5.55, ['lancer', 'crawler'], 250, 1),
    st(4, 'CONDUIT WALK', 'Shielded columns', 'normal', 6, 5.85, ['shielder', 'lancer'], 270, 1),
    st(4, 'HEAT SINK', 'Warden pair under gold light', 'elite', 6, 6.15, ['warden', 'shielder', 'lancer'], 350, 2),
    st(4, 'CONTAINMENT', 'The line bends', 'normal', 6, 6.45, ['warden', 'lancer', 'crawler'], 290, 2),
    st(4, 'LAST BULKHEAD', 'Everything they have left', 'normal', 6, 6.80, ['warden', 'shielder', 'lancer', 'crawler'], 320, 2),
    st(4, 'AEGIS SENTINEL', 'Final boss', 'boss', 1, 7.10, ['lancer', 'crawler'], 800, 8)
  ];

  // --------------------------------------------------------------- tower
  // Twenty escalating floors. Every third floor carries a modifier, every
  // fifth is an elite gate, floor 10 and 20 are boss floors.
  var MODIFIERS = [
    { key: 'none',    name: 'CLEAN RUN',    line: 'No modifier.' },
    { key: 'brittle', name: 'BRITTLE COVER', line: 'Cover takes 40 percent more damage.' },
    { key: 'swift',   name: 'SWIFT ADVANCE', line: 'Enemies advance 35 percent faster.' },
    { key: 'plated',  name: 'PLATED',        line: 'Armor doubled, cores unchanged.' },
    { key: 'dry',     name: 'DRY MAGS',      line: 'Magazines halved, reloads faster.' },
    { key: 'surge',   name: 'SURGE',         line: 'Burst charges twice as fast.' },
    { key: 'blackout',name: 'BLACKOUT',      line: 'Cores hidden until staggered.' },
    { key: 'dense',   name: 'DENSE RANKS',   line: 'Half again as many enemies.' }
  ];
  var MOD_BY_KEY = {};
  for (var mi = 0; mi < MODIFIERS.length; mi++) MOD_BY_KEY[MODIFIERS[mi].key] = MODIFIERS[mi];

  var TOWER = [];
  (function buildTower() {
    var modCycle = ['none', 'swift', 'brittle', 'none', 'plated', 'dense', 'dry', 'surge',
      'blackout', 'none', 'swift', 'plated', 'brittle', 'dense', 'dry', 'surge',
      'blackout', 'plated', 'dense', 'none'];
    for (var f = 1; f <= 20; f++) {
      var chIdx = Math.min(4, Math.floor((f - 1) / 4));
      var kind = (f % 10 === 0) ? 'boss' : (f % 5 === 0 ? 'elite' : 'normal');
      var mix = CHAPTERS[chIdx].families.slice(0, kind === 'normal' ? 3 : 4);
      TOWER.push({
        floor: f, ch: chIdx, kind: kind, mod: modCycle[f - 1],
        waves: kind === 'boss' ? 1 : (f < 6 ? 3 : f < 13 ? 4 : 5),
        tier: 1.2 + f * 0.42,
        credits: 70 + f * 26, cores: kind === 'boss' ? 4 : (kind === 'elite' ? 2 : (f % 2 === 0 ? 1 : 0))
      });
    }
  })();

  // --------------------------------------------------------------- daily
  // Daily runs are a five wave simulation on a date seed. The seed picks the
  // chapter dressing, the family mix and two stacked modifiers.
  function dailySeedFor(dateStr) {
    var h = 2166136261;
    for (var i = 0; i < dateStr.length; i++) {
      h ^= dateStr.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function dailyPlan(dateStr) {
    var seed = dailySeedFor(dateStr);
    function pick(n, salt) { return Math.floor(((seed ^ (salt * 2654435761)) >>> 0) % n); }
    var chIdx = pick(CHAPTERS.length, 3);
    var m1 = MODIFIERS[1 + pick(MODIFIERS.length - 1, 7)].key;
    var m2 = MODIFIERS[1 + pick(MODIFIERS.length - 1, 19)].key;
    if (m2 === m1) m2 = 'none';
    return {
      date: dateStr, seed: seed, ch: chIdx, mods: [m1, m2],
      waves: 5, tier: 3.0 + (pick(9, 31) * 0.35),
      mix: CHAPTERS[chIdx].families.slice(0),
      credits: 200, cores: 2
    };
  }
  function todayStamp(now) {
    var d = now || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  // ---------------------------------------------------- level and gear
  // Both tracks are earned in play. Level costs credits and lifts damage and
  // cover contribution; gear costs cores and credits and lifts the weapon.
  var MAX_LEVEL = 20;
  var GEAR_TIERS = [
    { tier: 0, name: 'FIELD', dmg: 0.00, rate: 0.00, crit: 0.00, cores: 0,  credits: 0 },
    { tier: 1, name: 'MK I',  dmg: 0.10, rate: 0.03, crit: 0.05, cores: 1,  credits: 120 },
    { tier: 2, name: 'MK II', dmg: 0.22, rate: 0.07, crit: 0.10, cores: 3,  credits: 280 },
    { tier: 3, name: 'MK III',dmg: 0.36, rate: 0.12, crit: 0.16, cores: 6,  credits: 520 },
    { tier: 4, name: 'MK IV', dmg: 0.52, rate: 0.17, crit: 0.24, cores: 10, credits: 900 },
    { tier: 5, name: 'MK V',  dmg: 0.72, rate: 0.24, crit: 0.34, cores: 16, credits: 1500 }
  ];
  function levelCost(level) { return Math.round(40 + level * level * 3.2 + level * 18); }
  function levelDamageMul(level) { return 1 + (level - 1) * 0.055; }
  function levelCoverBonus(level) { return (level - 1) * 1.6; }

  // ------------------------------------------------------------- helpers
  function stageCount() { return STAGES.length; }
  function chapterOfStage(n) { return STAGES[Math.max(0, Math.min(STAGES.length - 1, n - 1))].ch; }
  function unlockedIdsFor(clearedStages) {
    var out = [];
    for (var i = 0; i < SQUAD.length; i++) if (SQUAD[i].unlock <= clearedStages) out.push(SQUAD[i].id);
    return out;
  }

  root.ALData = {
    WEAPONS: WEAPONS, WEAPON_KEYS: WEAPON_KEYS, RECOIL_PATTERNS: RECOIL_PATTERNS,
    SQUAD: SQUAD, SQUAD_BY_ID: SQUAD_BY_ID, SQUAD_IDS: SQUAD_IDS,
    ENEMIES: ENEMIES, ENEMY_KEYS: ENEMY_KEYS, BOSSES: BOSSES, BOSS_KEYS: BOSS_KEYS,
    CHAPTERS: CHAPTERS, CHAPTER_BY_KEY: CHAPTER_BY_KEY,
    STAGES: STAGES, TOWER: TOWER, MODIFIERS: MODIFIERS, MOD_BY_KEY: MOD_BY_KEY,
    GEAR_TIERS: GEAR_TIERS, MAX_LEVEL: MAX_LEVEL,
    levelCost: levelCost, levelDamageMul: levelDamageMul, levelCoverBonus: levelCoverBonus,
    dailyPlan: dailyPlan, dailySeedFor: dailySeedFor, todayStamp: todayStamp,
    stageCount: stageCount, chapterOfStage: chapterOfStage, unlockedIdsFor: unlockedIdsFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
