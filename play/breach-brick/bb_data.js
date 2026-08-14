/* bb_data.js - Breach & Brick authored content tables.
 *
 * Pure data, no engine dependency. Every keyed table below ships a documented
 * fallback key so a lookup miss degrades instead of freezing (see BB.pick in
 * game.js). Layout rows are exactly COLS characters wide; bb_data.validate()
 * proves that at boot and is also runnable under node.
 *
 * Legend for wall rows:
 *   .  empty          1/2/3  brick with that hit-point count
 *   S  steel plate (5 hp, sparks, no powerup)   X  charge brick (chain blast)
 *   U  unstable brick (arms, warns, then falls) P  prize brick (always drops)
 */
(function (root) {
  'use strict';

  var COLS = 9;

  // ------------------------------------------------------------------ themes
  // Colors are the arcade-2D lane look: high contrast neon on dark, every
  // family separated by hue AND by plate treatment so identity never rests on
  // color alone.
  var THEMES = {
    grid: {
      key: 'grid',
      name: 'Vault Grid',
      sky: [0x0a1226, 0x101a38],
      haze: 0x1d3b6b,
      star: 0xbcd8ff,
      accent: 0x4edbca,
      accent2: 0x5ca8ff,
      brick: [0x4edbca, 0x5ca8ff, 0x7fd4ff],
      steel: 0x8fa6c4,
      charge: 0xffc85b,
      unstable: 0xffb24b,
      motif: 'grid'
    },
    bunker: {
      key: 'bunker',
      name: 'Iron Bunker',
      sky: [0x1a1005, 0x2a1408],
      haze: 0x6b3a12,
      star: 0xffd9a8,
      accent: 0xffa24b,
      accent2: 0xffd166,
      brick: [0xffa24b, 0xff8a3d, 0xffc266],
      steel: 0xa8b4c6,
      charge: 0xff5c4d,
      motif: 'rivets'
    },
    gauntlet: {
      key: 'gauntlet',
      name: 'Fracture Gauntlet',
      sky: [0x140a26, 0x230f3a],
      haze: 0x5a2a8c,
      star: 0xe6ccff,
      accent: 0xb883ff,
      accent2: 0xff71c8,
      brick: [0xb883ff, 0xff71c8, 0x8f7bff],
      steel: 0x9c93c4,
      charge: 0xff719d,
      motif: 'cracks'
    },
    citadel: {
      key: 'citadel',
      name: 'Citadel Core',
      sky: [0x1b0710, 0x2c0a14],
      haze: 0x8c1f2e,
      star: 0xffd0c0,
      accent: 0xffc85b,
      accent2: 0xff5d6c,
      brick: [0xffc85b, 0xff5d6c, 0xffe08a],
      steel: 0xc4b08f,
      charge: 0xff4d4d,
      motif: 'sigil'
    }
  };
  THEMES.grid.unstable = 0xffb24b;
  THEMES.bunker.unstable = 0xffe066;
  THEMES.gauntlet.unstable = 0xffd166;
  THEMES.citadel.unstable = 0xffb24b;

  // ------------------------------------------------------------------- walls
  // 12 authored walls, three per identity. Times are seconds of SIMULATED
  // play (never wall clock) for the gold and silver medal tiers.
  var WALLS = [
    {
      id: 1, name: 'Proving Grid', theme: 'grid',
      rows: [
        '111111111',
        '1111P1111',
        '11.....11',
        '1.......1'
      ],
      boss: null, ballSpeed: 288, dropRate: 0.46, multiAt: 0.35,
      fallEvery: 0, warn: 1.25, gold: 30, silver: 55,
      signature: 'Open arch: the center of the wall is already breached so the first ball funnels straight to the back row.'
    },
    {
      id: 2, name: 'Twin Spires', theme: 'grid',
      rows: [
        '22.....22',
        '221...122',
        '2211P1122',
        '111111111',
        '.1111111.'
      ],
      boss: null, ballSpeed: 300, dropRate: 0.44, multiAt: 0.40,
      fallEvery: 0, warn: 1.25, gold: 42, silver: 72,
      signature: 'Twin spires flanking a drop well: the well feeds the ball onto the shared floor row for long rallies.'
    },
    {
      id: 3, name: 'Cradle', theme: 'grid',
      rows: [
        '.1111111.',
        '11UP1PU11',
        '111111111',
        '1.2...2.1',
        '..11111..'
      ],
      boss: null, ballSpeed: 308, dropRate: 0.42, multiAt: 0.45,
      fallEvery: 0, warn: 1.2, gold: 45, silver: 78,
      signature: 'Two unstable keystones sit either side of the prize pair: break a prize and the keystone above it arms.'
    },
    {
      id: 4, name: 'Iron Bunker', theme: 'bunker',
      rows: [
        'SSSSSSSSS',
        'S2222222S',
        'S2P111P2S',
        'S2222222S',
        '.SS...SS.'
      ],
      boss: null, ballSpeed: 315, dropRate: 0.38, multiAt: 0.5,
      fallEvery: 0, warn: 1.15, gold: 62, silver: 105,
      signature: 'Full steel shell over a soft core: the only way in is the two gaps in the plinth row.'
    },
    {
      id: 5, name: 'Portcullis', theme: 'bunker',
      rows: [
        'S1S1S1S1S',
        'S2S1P1S2S',
        'S2S2X2S2S',
        'S1S1S1S1S',
        '222...222'
      ],
      boss: null, ballSpeed: 322, dropRate: 0.36, multiAt: 0.55,
      fallEvery: 14, warn: 1.15, gold: 66, silver: 112,
      signature: 'Four steel portcullis columns with a charge brick wired into the center gate.'
    },
    {
      id: 6, name: 'Redoubt', theme: 'bunker',
      rows: [
        'SSS...SSS',
        'S3S...S3S',
        'S3SX.XS3S',
        'S3333333S',
        '2P22222P2',
        '.2222222.'
      ],
      boss: null, ballSpeed: 330, dropRate: 0.35, multiAt: 0.6,
      fallEvery: 12, warn: 1.1, gold: 78, silver: 130,
      signature: 'Paired charge fuses inside the gate: popping one collapses that whole flank of the redoubt.'
    },
    {
      id: 7, name: 'Fracture Shelf', theme: 'gauntlet',
      rows: [
        'UUUUUUUUU',
        '111111111',
        '1U1U1U1U1',
        '1P11111P1',
        '.1U111U1.',
        '..11111..'
      ],
      boss: null, ballSpeed: 336, dropRate: 0.34, multiAt: 0,
      fallEvery: 9, warn: 1.05, gold: 72, silver: 122,
      signature: 'An entire unstable shelf across the ceiling: breach the row under it and the shelf rains in sequence.'
    },
    {
      id: 8, name: 'Hanging Garden', theme: 'gauntlet',
      rows: [
        '.U.....U.',
        '2U2...2U2',
        '2U2.X.2U2',
        '222222222',
        '1UP111PU1',
        '1.11111.1'
      ],
      boss: null, ballSpeed: 344, dropRate: 0.33, multiAt: 0,
      fallEvery: 8, warn: 1.0, gold: 82, silver: 138,
      signature: 'Two hanging unstable chains: cutting a chain low drops every link above it, one after another.'
    },
    {
      id: 9, name: 'Collapse Run', theme: 'gauntlet',
      rows: [
        'UUU...UUU',
        '333...333',
        '3U3.X.3U3',
        '333333333',
        '3P3U3U3P3',
        'UUUUUUUUU'
      ],
      boss: null, ballSpeed: 352, dropRate: 0.32, multiAt: 0,
      fallEvery: 6.5, warn: 0.95, gold: 96, silver: 160,
      signature: 'The wall keeps an unstable floor row: it drops its own footing at the paddle while you work the core.'
    },
    {
      id: 10, name: 'Citadel Gate', theme: 'citadel',
      rows: [
        'SS.....SS',
        'SS.....SS',
        'S3333333S',
        'S3P111P3S',
        '.3333333.',
        '..UU.UU..'
      ],
      boss: { col: 2, row: 0, w: 5, h: 2, hp: 40, name: 'GATE CORE', slamEvery: 7.5, slamOnHurt: true },
      ballSpeed: 356, dropRate: 0.32, multiAt: 0,
      fallEvery: 10, warn: 1.0, gold: 92, silver: 155,
      signature: 'The gate core sits in a steel frame with an unstable lintel: the core slams the lintel loose when hurt.'
    },
    {
      id: 11, name: 'Throne', theme: 'citadel',
      rows: [
        'S3S3S3S3S',
        'SS.....SS',
        'SS.....SS',
        '3333X3333',
        '3P33333P3',
        'U3U3U3U3U'
      ],
      boss: { col: 2, row: 1, w: 5, h: 2, hp: 60, name: 'THRONE CORE', slamEvery: 6.5, slamOnHurt: true },
      ballSpeed: 362, dropRate: 0.31, multiAt: 0,
      fallEvery: 9, warn: 0.95, gold: 105, silver: 175,
      signature: 'A crown row of alternating steel merlons caps the throne, so every ceiling bounce costs you tempo.'
    },
    {
      id: 12, name: 'Breach Finale', theme: 'citadel',
      rows: [
        'SSSSSSSSS',
        'S3X333X3S',
        'S3.....3S',
        'S3.....3S',
        'S3333333S',
        '3P3UUU3P3',
        '.3333333.'
      ],
      boss: { col: 2, row: 2, w: 5, h: 2, hp: 90, name: 'BREACH CORE', slamEvery: 5.5, slamOnHurt: true },
      ballSpeed: 370, dropRate: 0.30, multiAt: 0,
      fallEvery: 7, warn: 0.9, gold: 130, silver: 215,
      signature: 'The finale core is sealed inside a full steel shell with charge fuses at both shoulders: blow the fuses to open the roof.'
    }
  ];

  // --------------------------------------------------------------- powerups
  // Every entry carries its own catch color, glyph, chip label and audio cue
  // so the catch confirmation is distinct per type (owner priority 1).
  var POWERS = {
    multi:  { key: 'multi',  label: 'MULTIBALL', color: 0x64e6d4, glyph: 'multi',  sfx: 'catch_multi',  dur: 0,  chip: 'THREE BALLS OUT' },
    wreck:  { key: 'wreck',  label: 'WRECKER',   color: 0xffbd5c, glyph: 'wreck',  sfx: 'catch_wreck',  dur: 9,  chip: 'BALL PLOWS THROUGH' },
    wide:   { key: 'wide',   label: 'WIDE DECK', color: 0x76e276, glyph: 'wide',   sfx: 'catch_wide',   dur: 13, chip: 'PADDLE EXTENDED' },
    sticky: { key: 'sticky', label: 'MAG DECK',  color: 0xd593ff, glyph: 'sticky', sfx: 'catch_sticky', dur: 13, chip: 'CATCH AND AIM' },
    laser:  { key: 'laser',  label: 'LANCE',     color: 0xff719d, glyph: 'laser',  sfx: 'catch_laser',  dur: 12, chip: 'TAP TO FIRE' },
    shield: { key: 'shield', label: 'FLOOR NET', color: 0x5ca8ff, glyph: 'shield', sfx: 'catch_shield', dur: 0,  chip: 'ONE SAVE STORED' },
    slow:   { key: 'slow',   label: 'DAMPEN',    color: 0x7fe8ff, glyph: 'slow',   sfx: 'catch_slow',   dur: 9,  chip: 'BALL SLOWED' },
    life:   { key: 'life',   label: 'SPARE DECK',color: 0xffe066, glyph: 'life',   sfx: 'catch_life',   dur: 0,  chip: 'EXTRA LIFE' }
  };
  // Weighted draw table. Generous on purpose, and multiball is the single
  // most common roll on the early walls (owner priority 2).
  var DROP_TABLE = [
    ['multi', 26], ['wide', 15], ['sticky', 12], ['laser', 13],
    ['wreck', 12], ['shield', 10], ['slow', 8], ['life', 4]
  ];

  // ------------------------------------------------------------------ skins
  // Unlock chain. `need` is evaluated against the progress summary in game.js:
  // { cleared, medals, gold, silver, bestWall }.
  var PADDLE_SKINS = [
    { key: 'standard', name: 'Issue Deck',  body: 0x71e3d0, edge: 0x2fb8a8, lamp: 0xd8fff8, need: null,                       hint: 'Available from the start' },
    { key: 'chrome',   name: 'Chrome Deck', body: 0xc9d8e8, edge: 0x7d90a8, lamp: 0xffffff, need: { medals: 3 },              hint: 'Earn 3 medals' },
    { key: 'ember',    name: 'Ember Deck',  body: 0xff9a4b, edge: 0xc1521c, lamp: 0xffe0b0, need: { cleared: 6 },             hint: 'Clear wall 6' },
    { key: 'aurora',   name: 'Aurora Deck', body: 0xb883ff, edge: 0x6a3fbe, lamp: 0xf0e0ff, need: { silver: 5 },              hint: 'Earn 5 silver or better' },
    { key: 'void',     name: 'Void Deck',   body: 0x3c4d7a, edge: 0x8ea6ff, lamp: 0xd6e2ff, need: { gold: 4 },                hint: 'Earn 4 gold medals' }
  ];
  var BALL_SKINS = [
    { key: 'core',   name: 'Core Shot',  body: 0xf8ffff, glow: 0x8bf6e7, trail: 0x9ff4ec, need: null,               hint: 'Available from the start' },
    { key: 'plasma', name: 'Plasma',     body: 0xfff0a8, glow: 0xffc85b, trail: 0xffd98a, need: { cleared: 3 },     hint: 'Clear wall 3' },
    { key: 'comet',  name: 'Comet',      body: 0xffd8e8, glow: 0xff71c8, trail: 0xff9fd8, need: { medals: 8 },      hint: 'Earn 8 medals' },
    { key: 'prism',  name: 'Prism',      body: 0xd8f0ff, glow: 0x5ca8ff, trail: 0x9fd8ff, need: { cleared: 12 },    hint: 'Clear all 12 walls' },
    { key: 'nova',   name: 'Nova',       body: 0xfff6d8, glow: 0xff5d6c, trail: 0xffb07a, need: { gold: 8 },        hint: 'Earn 8 gold medals' }
  ];

  var MEDALS = [
    { key: 0, name: 'NONE',   color: 0x55617d, short: '-' },
    { key: 1, name: 'BRONZE', color: 0xc98a53, short: 'B' },
    { key: 2, name: 'SILVER', color: 0xcdd8e6, short: 'S' },
    { key: 3, name: 'GOLD',   color: 0xffc85b, short: 'G' }
  ];

  // ------------------------------------------------------------ validation
  function validate() {
    var problems = [];
    for (var i = 0; i < WALLS.length; i++) {
      var w = WALLS[i];
      if (w.id !== i + 1) problems.push('wall ' + i + ' id mismatch');
      if (!THEMES[w.theme]) problems.push('wall ' + w.id + ' unknown theme ' + w.theme);
      for (var r = 0; r < w.rows.length; r++) {
        if (w.rows[r].length !== COLS) {
          problems.push('wall ' + w.id + ' row ' + r + ' is ' + w.rows[r].length + ' wide, want ' + COLS);
        }
        if (!/^[.123SXUP]+$/.test(w.rows[r])) problems.push('wall ' + w.id + ' row ' + r + ' has an unknown glyph');
      }
      if (w.boss) {
        if (w.boss.col < 0 || w.boss.col + w.boss.w > COLS) problems.push('wall ' + w.id + ' boss out of grid');
        for (var br = w.boss.row; br < w.boss.row + w.boss.h; br++) {
          var row = w.rows[br] || '';
          for (var bc = w.boss.col; bc < w.boss.col + w.boss.w; bc++) {
            if (row.charAt(bc) !== '.' && row.charAt(bc) !== '') {
              problems.push('wall ' + w.id + ' boss overlaps a brick at ' + br + ',' + bc);
            }
          }
        }
      }
      if (!(w.gold < w.silver)) problems.push('wall ' + w.id + ' medal times not ordered');
    }
    var seen = {};
    DROP_TABLE.forEach(function (row) {
      if (!POWERS[row[0]]) problems.push('drop table references unknown power ' + row[0]);
      if (seen[row[0]]) problems.push('drop table duplicates ' + row[0]);
      seen[row[0]] = true;
    });
    return problems;
  }

  var BBData = {
    COLS: COLS,
    THEMES: THEMES,
    WALLS: WALLS,
    POWERS: POWERS,
    DROP_TABLE: DROP_TABLE,
    PADDLE_SKINS: PADDLE_SKINS,
    BALL_SKINS: BALL_SKINS,
    MEDALS: MEDALS,
    validate: validate
  };

  root.BBData = BBData;
  if (typeof module !== 'undefined' && module.exports) module.exports = BBData;
})(typeof window !== 'undefined' ? window : globalThis);
