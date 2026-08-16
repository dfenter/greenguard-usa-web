/* Wayfarer Courts - original portrait turn-based party journey.
 * Phaser 3 view over a fixed-step sim. GGKit owns lifecycle, pointer identity,
 * saves, audio buses, loading, settings and the juice budget.
 * All art is authored at boot into canvas textures. Audio is original.
 */
(function () {
  'use strict';

  var W = 390;
  var H = 844;
  var STEP = 1 / 60;
  var MAX_STEPS = 4;
  var SAVE_VERSION = 1;
  var TAU = Math.PI * 2;
  var TILE = 32;
  var MAP_W = 22;
  var MAP_H = 30;
  var FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

  var CSS = {
    ink: '#0d1222', ink2: '#141b31', panel: '#1c2542', panel2: '#27325a',
    line: '#59689b', text: '#f5f0df', dim: '#a9b4d2', gold: '#f2c15a',
    mint: '#79e0c0', rose: '#f18b9f', sky: '#8dc9f4', ember: '#f49a5d',
    red: '#e46d7b', green: '#86d78f', violet: '#a58bdf', stone: '#d9c9a4'
  };
  var HEX = {
    ink: 0x0d1222, ink2: 0x141b31, panel: 0x1c2542, panel2: 0x27325a,
    line: 0x59689b, text: 0xf5f0df, dim: 0xa9b4d2, gold: 0xf2c15a,
    mint: 0x79e0c0, rose: 0xf18b9f, sky: 0x8dc9f4, ember: 0xf49a5d,
    red: 0xe46d7b, green: 0x86d78f, violet: 0xa58bdf, stone: 0xd9c9a4
  };

  /* ------------------------------------------------------------ content */

  var ELEMENTS = {
    ember: { name: 'Ember', icon: '✦', color: '#f49a5d' },
    tide: { name: 'Tide', icon: '≈', color: '#8dc9f4' },
    verd: { name: 'Verd', icon: '❦', color: '#86d78f' },
    dusk: { name: 'Dusk', icon: '☾', color: '#a58bdf' },
    stone: { name: 'Stone', icon: '◈', color: '#d9c9a4' }
  };
  var CYCLE = { ember: 'verd', verd: 'tide', tide: 'dusk', dusk: 'stone', stone: 'ember' };

  var STATUSES = {
    burn: { name: 'Burn', icon: '✦', color: '#f49a5d', kind: 'harm' },
    chill: { name: 'Chill', icon: '≈', color: '#8dc9f4', kind: 'harm' },
    weaken: { name: 'Weaken', icon: '▽', color: '#a58bdf', kind: 'harm' },
    stun: { name: 'Stun', icon: '✖', color: '#e46d7b', kind: 'control' },
    guard: { name: 'Guard', icon: '◈', color: '#79e0c0', kind: 'help' },
    shield: { name: 'Shield', icon: '◧', color: '#d9c9a4', kind: 'help' },
    regen: { name: 'Regen', icon: '✚', color: '#86d78f', kind: 'help' },
    rally: { name: 'Rally', icon: '▲', color: '#f2c15a', kind: 'help' }
  };
  var STATUS_ORDER = ['stun', 'burn', 'chill', 'weaken', 'guard', 'shield', 'regen', 'rally'];

  var SKILLS = {
    waycut: { name: 'Waymark Cut', sp: 6, kind: 'hit', power: 1.45, element: 'ember', target: 'foe', note: 'Reaches the back row.', reach: true },
    breath: { name: 'Steady Breath', sp: 8, kind: 'heal', power: 18, target: 'ally', note: 'Mends one wayfarer.' },
    sunbreak: { name: 'Sunbreak Arc', sp: 12, kind: 'hitAll', power: 1.05, element: 'ember', target: 'foes', note: 'Sweeps every rival.', reach: true },
    verdict: { name: 'Verdict', sp: 18, kind: 'hit', power: 2.35, element: 'ember', target: 'foe', status: 'stun', note: 'Heavy strike, may stun.', reach: true },
    chord: { name: 'Soft Chord', sp: 6, kind: 'heal', power: 26, target: 'ally', note: 'Mends one wayfarer well.' },
    thread: { name: 'Bright Thread', sp: 8, kind: 'hit', power: 1.15, element: 'tide', target: 'foe', status: 'chill', note: 'Chills the target.', reach: true },
    choral: { name: 'Choral Mend', sp: 14, kind: 'healAll', power: 17, target: 'allies', note: 'Mends the whole company.' },
    draught: { name: 'Dawn Draught', sp: 20, kind: 'healAll', power: 26, target: 'allies', status: 'regen', note: 'Mends all and leaves regen.' },
    roadblade: { name: 'Roadblade', sp: 6, kind: 'hit', power: 1.6, element: 'verd', target: 'foe', note: 'A committed front-row cut.' },
    nick: { name: 'Cinder Nick', sp: 8, kind: 'hit', power: 1.05, element: 'ember', target: 'foe', status: 'burn', note: 'Sets a slow burn.', reach: true },
    twinroad: { name: 'Twin Road', sp: 12, kind: 'hit2', power: 0.92, element: 'verd', target: 'foe', note: 'Two quick passes.' },
    stormfall: { name: 'Stormfall', sp: 20, kind: 'hitAll', power: 1.25, element: 'dusk', target: 'foes', status: 'weaken', note: 'Breaks every rival guard.', reach: true },
    bulwark: { name: 'Bulwark', sp: 5, kind: 'buffAll', status: 'guard', target: 'allies', note: 'Guards the company one turn.' },
    toll: { name: 'Stone Toll', sp: 8, kind: 'hit', power: 1.2, element: 'stone', target: 'foe', status: 'chill', note: 'Slows the target.' },
    standing: { name: 'Standing Wall', sp: 12, kind: 'buffAll', status: 'shield', target: 'allies', note: 'Shields the company.' },
    mountain: { name: 'Mountain Answer', sp: 18, kind: 'hit', power: 1.85, element: 'stone', target: 'foe', status: 'stun', note: 'Slams a single rival.' }
  };

  var CLASSES = {
    wayfarer: { name: 'Wayfarer', arch: 'way', tier: 1, hp: 1.0, atk: 1.0, def: 1.0, spd: 1.0, skills: ['waycut', 'breath'] },
    lanternknight: { name: 'Lantern Knight', arch: 'way', tier: 2, hp: 1.18, atk: 1.16, def: 1.14, spd: 1.05, skills: ['waycut', 'breath', 'sunbreak'] },
    arbiter: { name: 'Court Arbiter', arch: 'way', tier: 3, hp: 1.36, atk: 1.34, def: 1.26, spd: 1.1, skills: ['waycut', 'sunbreak', 'verdict'] },
    mender: { name: 'Field Mender', arch: 'mend', tier: 1, hp: 0.94, atk: 0.86, def: 1.0, spd: 1.08, skills: ['chord', 'thread'] },
    chorister: { name: 'Chorister', arch: 'mend', tier: 2, hp: 1.08, atk: 0.98, def: 1.1, spd: 1.14, skills: ['chord', 'thread', 'choral'] },
    physician: { name: 'Dawn Physician', arch: 'mend', tier: 3, hp: 1.24, atk: 1.1, def: 1.2, spd: 1.2, skills: ['chord', 'choral', 'draught'] },
    striker: { name: 'Road Striker', arch: 'strike', tier: 1, hp: 1.02, atk: 1.14, def: 0.9, spd: 1.12, skills: ['roadblade', 'nick'] },
    roadblade: { name: 'Roadblade', arch: 'strike', tier: 2, hp: 1.16, atk: 1.32, def: 1.0, spd: 1.2, skills: ['roadblade', 'nick', 'twinroad'] },
    stormbreaker: { name: 'Stormbreaker', arch: 'strike', tier: 3, hp: 1.3, atk: 1.52, def: 1.06, spd: 1.26, skills: ['twinroad', 'nick', 'stormfall'] },
    ward: { name: 'Quiet Ward', arch: 'ward', tier: 1, hp: 1.12, atk: 0.9, def: 1.24, spd: 0.9, skills: ['bulwark', 'toll'] },
    bulwark: { name: 'Bulwark', arch: 'ward', tier: 2, hp: 1.3, atk: 1.0, def: 1.42, spd: 0.95, skills: ['bulwark', 'toll', 'standing'] },
    mountainkeep: { name: 'Mountainkeep', arch: 'ward', tier: 3, hp: 1.5, atk: 1.14, def: 1.6, spd: 1.0, skills: ['standing', 'toll', 'mountain'] }
  };
  var CLASS_LINE = {
    way: ['wayfarer', 'lanternknight', 'arbiter'],
    mend: ['mender', 'chorister', 'physician'],
    strike: ['striker', 'roadblade', 'stormbreaker'],
    ward: ['ward', 'bulwark', 'mountainkeep']
  };

  /* Base rows preserve the prototype party and spirit tables. */
  var ROSTER_BLUEPRINT = [
    { id: 'you', name: 'You', arch: 'way', element: 'ember', glyph: '◆', color: '#f2c15a', accent: '#fff0c2', baseHp: 82, atk: 15, def: 4, spd: 46, row: 'front', start: true, trait: 'Wayfarer', traitText: 'Leads every company.' },
    { id: 'mira', name: 'Mira', arch: 'mend', element: 'tide', glyph: '✚', color: '#79e0c0', accent: '#dcfff2', baseHp: 66, atk: 10, def: 4, spd: 52, row: 'back', start: true, trait: 'Field Mender', traitText: 'Mends the worst wound first.' },
    { id: 'rook', name: 'Rook', arch: 'strike', element: 'ember', glyph: '/', color: '#f49a5d', accent: '#ffdcbc', baseHp: 74, atk: 13, def: 3, spd: 50, row: 'front', start: true, trait: 'Road Striker', traitText: 'Answers first, argues later.' },
    { id: 'pax', name: 'Pax', arch: 'ward', element: 'stone', glyph: '◐', color: '#8dc9f4', accent: '#d8eeff', baseHp: 70, atk: 9, def: 6, spd: 42, row: 'back', start: true, trait: 'Quiet Ward', traitText: 'Stands where it hurts.' },
    { id: 'pebblewink', name: 'Pebblewink', arch: 'ward', element: 'stone', glyph: '◈', color: '#d89c6a', accent: '#f7dcc0', baseHp: 54, atk: 9, def: 2, spd: 40, trait: 'Stonewarm', traitText: 'Company keeps 8 more vitality.', bonus: { maxHp: 8 } },
    { id: 'brinebell', name: 'Brinebell', arch: 'mend', element: 'tide', glyph: '◌', color: '#6db9df', accent: '#d3efff', baseHp: 48, atk: 8, def: 3, spd: 54, trait: 'Tidecall', traitText: 'Bond odds rise by 8 percent.', bonus: { bond: 0.08 } },
    { id: 'flickeroot', name: 'Flickeroot', arch: 'strike', element: 'ember', glyph: '✦', color: '#ed9a58', accent: '#ffdfbb', baseHp: 42, atk: 12, def: 1, spd: 56, trait: 'Kindle', traitText: 'Company attack rises by 2.', bonus: { atk: 2 } },
    { id: 'mothmoss', name: 'Mothmoss', arch: 'way', element: 'verd', glyph: '⌁', color: '#a9c879', accent: '#e6f6c8', baseHp: 50, atk: 7, def: 4, spd: 48, trait: 'Softstep', traitText: 'Back row slips 12 percent of blows.', bonus: { evade: 0.12 } },
    { id: 'gloomlet', name: 'Gloomlet', arch: 'mend', element: 'dusk', glyph: '☾', color: '#a990d7', accent: '#e6dcff', baseHp: 45, atk: 10, def: 2, spd: 51, trait: 'Duskwink', traitText: 'Bond odds rise by 4 percent.', bonus: { bond: 0.04 } },
    { id: 'thimblehorn', name: 'Thimblehorn', arch: 'ward', element: 'stone', glyph: '♢', color: '#e2cc7a', accent: '#fff4cc', baseHp: 60, atk: 8, def: 5, spd: 38, trait: 'Buttonhide', traitText: 'Company defense rises by 2.', bonus: { def: 2 } },
    { id: 'cloudpup', name: 'Cloudpup', arch: 'way', element: 'tide', glyph: '☁', color: '#a7d9e8', accent: '#e2f8ff', baseHp: 46, atk: 9, def: 2, spd: 53, trait: 'Driftstep', traitText: 'Company heals 3 after each fight.', bonus: { rest: 3 } },
    { id: 'emberfin', name: 'Emberfin', arch: 'strike', element: 'ember', glyph: '❖', color: '#ee7665', accent: '#ffd3c8', baseHp: 40, atk: 14, def: 1, spd: 58, trait: 'Brightbite', traitText: 'Company attack rises by 5.', bonus: { atk: 5 } }
  ];

  var REGIONS = {
    lantern: {
      name: 'Lantern Capital', short: 'CAPITAL', festival: '#f2c15a', music: 'field',
      ground: 0x2a3358, ground2: 0x323c66, grass: 0x3c5a4a, grass2: 0x466a56, path: 0x6a5c3e,
      water: 0x2c4a72, wall: 0x1a2036, prop: 'lantern', seed: 1201,
      enemies: ['tollmoth', 'strawcourier', 'benchhound'], mats: ['lanternsilk', 'bamboofiber'],
      npcs: [
        { name: 'Warden Ossa', line: 'The low bridge lanterns went out at dusk. Nobody signed for it.' },
        { name: 'Clerk Hallow', line: 'Every quest here becomes a page. Try to make it a kind one.' },
        { name: 'Sweeper Tem', line: 'Walk the tall grass and something will want a word.' },
        { name: 'Bell Rider Ku', line: 'The Cinder Bench sits above the stairs. It does not hurry.' }
      ]
    },
    bamboo: {
      name: 'Bamboo Passes', short: 'PASSES', festival: '#86d78f', music: 'field',
      ground: 0x24402f, ground2: 0x2b4c38, grass: 0x2f6440, grass2: 0x387650, path: 0x6b6338,
      water: 0x1f5560, wall: 0x162a20, prop: 'cane', seed: 3307,
      enemies: ['caneserpent', 'reedkite', 'tollmoth'], mats: ['bamboofiber', 'lanternsilk'],
      npcs: [
        { name: 'Cutter Ren', line: 'Cane grows back overnight. Grudges take longer.' },
        { name: 'Scribe Ilo', line: 'Green ink holds a verdict better than black. Ask anyone here.' },
        { name: 'Bellwright Sada', line: 'Carry the bell gently. It has opinions.' },
        { name: 'Passkeeper Aunn', line: 'The Moonwell Bench waits past the high notch.' }
      ]
    },
    salt: {
      name: 'Salt Flats', short: 'FLATS', festival: '#f0c9b4', music: 'field',
      ground: 0x585068, ground2: 0x66607a, grass: 0x6b6a58, grass2: 0x7b7a64, path: 0x9a8f76,
      water: 0x4a6c86, wall: 0x33304a, prop: 'salt', seed: 5119,
      enemies: ['saltkite', 'mirrorwalker', 'caneserpent'], mats: ['saltglass', 'moonbrass'],
      npcs: [
        { name: 'Panner Doves', line: 'Saltglass takes a week to grow and a moment to spend.' },
        { name: 'Caravan Mel', line: 'Mirrors on the pan are only mirrors until they answer back.' },
        { name: 'Milepost Jai', line: 'Somebody buried the marker. I would like it back.' },
        { name: 'Reeve Anselm', line: 'The Greenwake Bench keeps a garden out here. Nobody knows how.' }
      ]
    },
    moon: {
      name: 'Moonbridge Marches', short: 'MARCHES', festival: '#a58bdf', music: 'field',
      ground: 0x2c2c4e, ground2: 0x35355c, grass: 0x364a5e, grass2: 0x3f566e, path: 0x6a6488,
      water: 0x24406e, wall: 0x1b1b32, prop: 'moon', seed: 7717,
      enemies: ['greytide', 'moonwarden', 'mirrorwalker'], mats: ['moonbrass', 'saltglass'],
      npcs: [
        { name: 'Pier Hand Oro', line: 'Grey tide comes up the piers when the court is late.' },
        { name: 'Ledgerkeep Vans', line: 'Moonbrass rings true. Everything else here is a rumour.' },
        { name: 'Petitioner Sill', line: 'I have waited four acts. I will wait one more span.' },
        { name: 'Spanwarden Rhee', line: 'The Longspan Bench counts every step you take up.' }
      ]
    },
    court: {
      name: 'Celestial Court', short: 'COURT', festival: '#8dc9f4', music: 'celestial',
      ground: 0x28345e, ground2: 0x2f3d6e, grass: 0x35507a, grass2: 0x3d5c8a, path: 0x8a92c4,
      water: 0x2a4a94, wall: 0x1c2447, prop: 'cloud', seed: 9931,
      enemies: ['cloudmarcher', 'starwarden', 'moonwarden'], mats: ['courtjade', 'moonbrass'],
      npcs: [
        { name: 'Stairkeeper Nev', line: 'Nine lanterns for the stair. Eight is a different ceremony.' },
        { name: 'Herald Ansi', line: 'The Celestial Court hears everyone. It just hears slowly.' },
        { name: 'Recess Marshal', line: 'A long recess is still a court. Mind the cloudmarchers.' },
        { name: 'Ilaria of the Reach', line: 'Bring us a kinder ending than the one you rehearsed.' }
      ]
    }
  };
  var REGION_KEYS = ['lantern', 'bamboo', 'salt', 'moon', 'court'];

  var ENEMIES = {
    tollmoth: { name: 'Tollmoth', family: 'moth', element: 'dusk', hp: 46, atk: 11, def: 2, spd: 52, color: '#a990d7', xp: 12, coin: 9, skill: 'nick' },
    strawcourier: { name: 'Straw Courier', family: 'courier', element: 'verd', hp: 58, atk: 12, def: 3, spd: 46, color: '#c9c07a', xp: 14, coin: 11, skill: 'toll' },
    benchhound: { name: 'Bench Hound', family: 'hound', element: 'ember', hp: 66, atk: 14, def: 3, spd: 49, color: '#ee8f65', xp: 17, coin: 13, skill: 'roadblade' },
    caneserpent: { name: 'Cane Serpent', family: 'serpent', element: 'verd', hp: 78, atk: 16, def: 4, spd: 54, color: '#7fc07a', xp: 22, coin: 16, skill: 'nick' },
    reedkite: { name: 'Reed Kite', family: 'kite', element: 'tide', hp: 70, atk: 15, def: 3, spd: 60, color: '#7fc9d8', xp: 21, coin: 15, skill: 'thread' },
    saltkite: { name: 'Salt Kite', family: 'kite', element: 'stone', hp: 92, atk: 18, def: 5, spd: 57, color: '#e0cfa8', xp: 29, coin: 21, skill: 'toll' },
    mirrorwalker: { name: 'Mirror Walker', family: 'warden', element: 'dusk', hp: 108, atk: 19, def: 7, spd: 45, color: '#b6a8e0', xp: 34, coin: 25, skill: 'thread' },
    greytide: { name: 'Grey Tide', family: 'serpent', element: 'tide', hp: 124, atk: 21, def: 6, spd: 52, color: '#7c9fd0', xp: 41, coin: 30, skill: 'thread' },
    moonwarden: { name: 'Moon Warden', family: 'warden', element: 'dusk', hp: 146, atk: 23, def: 9, spd: 47, color: '#a58bdf', xp: 49, coin: 36, skill: 'toll' },
    cloudmarcher: { name: 'Cloudmarcher', family: 'courier', element: 'tide', hp: 158, atk: 25, def: 8, spd: 55, color: '#96cdf0', xp: 58, coin: 43, skill: 'thread' },
    starwarden: { name: 'Star Warden', family: 'warden', element: 'stone', hp: 182, atk: 27, def: 11, spd: 50, color: '#e6dfae', xp: 68, coin: 52, skill: 'mountain' }
  };

  /* Bondable wild spirits, one per region for the four bondable recruits. */
  var WILD_SPIRITS = {
    lantern: 'pebblewink', bamboo: 'mothmoss', salt: 'brinebell', moon: 'emberfin', court: null
  };

  var JUDGES = [
    { id: 'veyra', name: 'Veyra Ashglass', bench: 'The Cinder Bench', glyph: '△', color: '#e98861', element: 'ember', hp: 142, atk: 17, def: 5, spd: 50, line: 'A verdict can be a doorway.', skill: 'sunbreak' },
    { id: 'orren', name: 'Orren Vell', bench: 'The Moonwell Bench', glyph: '○', color: '#a58bdf', element: 'dusk', hp: 176, atk: 20, def: 7, spd: 52, line: 'The quiet road still remembers.', skill: 'stormfall' },
    { id: 'seln', name: 'Seln of the Reeds', bench: 'The Greenwake Bench', glyph: '✧', color: '#73c991', element: 'verd', hp: 214, atk: 23, def: 9, spd: 54, line: 'Bring us a kinder ending.', skill: 'twinroad' },
    { id: 'halide', name: 'Halide Wren', bench: 'The Longspan Bench', glyph: '▣', color: '#d9c9a4', element: 'stone', hp: 252, atk: 26, def: 11, spd: 51, line: 'Every step up is counted twice.', skill: 'mountain' },
    { id: 'ilaria', name: 'Ilaria Sunreach', bench: 'The Celestial Court', glyph: '✵', color: '#8dc9f4', element: 'tide', hp: 300, atk: 29, def: 13, spd: 56, line: 'The court hears you. Answer plainly.', skill: 'draught' }
  ];

  var MATS = {
    lanternsilk: { name: 'Lantern Silk', icon: '❋', color: '#f2c15a' },
    bamboofiber: { name: 'Cane Fiber', icon: '≡', color: '#86d78f' },
    saltglass: { name: 'Saltglass', icon: '◇', color: '#d9c9a4' },
    moonbrass: { name: 'Moonbrass', icon: '◉', color: '#a58bdf' },
    courtjade: { name: 'Court Jade', icon: '❖', color: '#79e0c0' }
  };
  var MAT_KEYS = ['lanternsilk', 'bamboofiber', 'saltglass', 'moonbrass', 'courtjade'];

  var GEAR = {
    waylight: { name: 'Waylight Blade', slot: 'weapon', atk: 4, cost: { lanternsilk: 3, bamboofiber: 2 }, coin: 40, tier: 1 },
    reedspear: { name: 'Reedcut Spear', slot: 'weapon', atk: 7, spd: 3, cost: { bamboofiber: 5, lanternsilk: 2 }, coin: 90, tier: 2 },
    saltedge: { name: 'Saltglass Edge', slot: 'weapon', atk: 10, element: 'stone', cost: { saltglass: 5, moonbrass: 2 }, coin: 170, tier: 3 },
    jadeanswer: { name: 'Courtjade Answer', slot: 'weapon', atk: 14, spd: 4, cost: { courtjade: 4, moonbrass: 4 }, coin: 300, tier: 4 },
    silkcoat: { name: 'Silk Half-Coat', slot: 'armor', def: 3, hp: 10, cost: { lanternsilk: 4 }, coin: 40, tier: 1 },
    canebrig: { name: 'Cane Brigandine', slot: 'armor', def: 5, hp: 16, cost: { bamboofiber: 6, lanternsilk: 2 }, coin: 95, tier: 2 },
    saltplate: { name: 'Saltplate', slot: 'armor', def: 8, hp: 22, cost: { saltglass: 6, bamboofiber: 3 }, coin: 180, tier: 3 },
    moonmantle: { name: 'Moonbrass Mantle', slot: 'armor', def: 11, hp: 30, cost: { moonbrass: 6, courtjade: 2 }, coin: 320, tier: 4 },
    mothcharm: { name: 'Tollmoth Charm', slot: 'charm', spd: 7, cost: { lanternsilk: 2, bamboofiber: 2 }, coin: 35, tier: 1 },
    tidebell: { name: 'Tidebell Charm', slot: 'charm', sp: 14, cost: { saltglass: 3, bamboofiber: 3 }, coin: 110, tier: 2 },
    emberknot: { name: 'Emberknot', slot: 'charm', atk: 5, element: 'ember', cost: { saltglass: 4, moonbrass: 3 }, coin: 200, tier: 3 },
    courtseal: { name: 'Court Seal', slot: 'charm', atk: 4, def: 4, hp: 14, cost: { courtjade: 5, saltglass: 4 }, coin: 340, tier: 4 }
  };
  var GEAR_KEYS = ['waylight', 'silkcoat', 'mothcharm', 'reedspear', 'canebrig', 'tidebell', 'saltedge', 'saltplate', 'emberknot', 'jadeanswer', 'moonmantle', 'courtseal'];

  var ITEMS = {
    tonic: { name: 'Road Tonic', icon: '✚', color: '#79e0c0', kind: 'heal', power: 40, note: 'Restores 40 vitality.' },
    waybread: { name: 'Waybread', icon: '◍', color: '#f2c15a', kind: 'healAll', power: 22, note: 'Restores 22 to everyone.' },
    courtward: { name: 'Court Ward', icon: '◈', color: '#8dc9f4', kind: 'cleanse', note: 'Clears harm and shields.' },
    emberchip: { name: 'Ember Chip', icon: '✦', color: '#f49a5d', kind: 'burn', note: 'Sets a rival burning.' }
  };
  var ITEM_KEYS = ['tonic', 'waybread', 'courtward', 'emberchip'];

  /* 30 court quests, five acts. type drives the field objective. */
  var QUESTS = [
    { id: 1, act: 1, region: 'lantern', type: 'fetch', title: 'Lanterns for the Low Bridge', giver: 'Warden Ossa', brief: 'Three silks went missing before dusk. Find them on the bridge road.', count: 3, coin: 45, mats: { lanternsilk: 3 } },
    { id: 2, act: 1, region: 'lantern', type: 'purge', title: 'Tollmoths at the Gate', giver: 'Sweeper Tem', brief: 'Clear three moth flights from the capital gate lanes.', count: 3, coin: 55, mats: { lanternsilk: 2, bamboofiber: 1 } },
    { id: 3, act: 1, region: 'lantern', type: 'escort', title: 'Walk the Ledger Clerk', giver: 'Clerk Hallow', brief: 'Bring the clerk from the archive stall back to the capital gate.', coin: 65, mats: { bamboofiber: 3 } },
    { id: 4, act: 1, region: 'lantern', type: 'riddle', title: 'The Bridge Keeper Asks', giver: 'Bell Rider Ku', brief: 'The keeper will not raise the span until the question is answered.', coin: 70, mats: { lanternsilk: 2 }, riddle: 0 },
    { id: 5, act: 1, region: 'lantern', type: 'fetch', title: 'Ash on the Bench Steps', giver: 'Warden Ossa', brief: 'Gather two ash tokens from the stair. Somebody kind is waiting there.', count: 2, coin: 80, mats: { lanternsilk: 3, bamboofiber: 2 }, recruit: 'flickeroot' },
    { id: 6, act: 1, region: 'lantern', type: 'boss', title: 'The Cinder Bench', giver: 'Clerk Hallow', brief: 'Veyra Ashglass will hear your company. Bring an answer.', judge: 0, coin: 140, mats: { lanternsilk: 4, bamboofiber: 3 } },

    { id: 7, act: 2, region: 'bamboo', type: 'purge', title: 'Reed Cutters Cannot Pass', giver: 'Cutter Ren', brief: 'Four wild answers block the cutting road. Settle them.', count: 4, coin: 95, mats: { bamboofiber: 4 } },
    { id: 8, act: 2, region: 'bamboo', type: 'fetch', title: 'Green Ink for the Scribe', giver: 'Scribe Ilo', brief: 'Three ink reeds grow deep in the pass. Bring them back.', count: 3, coin: 100, mats: { bamboofiber: 4, lanternsilk: 2 } },
    { id: 9, act: 2, region: 'bamboo', type: 'escort', title: 'Carry the Bell to Highpass', giver: 'Bellwright Sada', brief: 'The bell walks with you. Reach the pass gate without dropping it.', coin: 115, mats: { bamboofiber: 5 } },
    { id: 10, act: 2, region: 'bamboo', type: 'riddle', title: 'The Reed Court Riddle', giver: 'Passkeeper Aunn', brief: 'A small bench sits in the cane and asks one question.', coin: 120, mats: { saltglass: 2 }, riddle: 1 },
    { id: 11, act: 2, region: 'bamboo', type: 'purge', title: 'Silence the Cane Serpents', giver: 'Cutter Ren', brief: 'Four serpents rattle the high notch. A stubborn friend waits after.', count: 4, coin: 130, mats: { bamboofiber: 5, saltglass: 2 }, recruit: 'thimblehorn' },
    { id: 12, act: 2, region: 'bamboo', type: 'boss', title: 'The Moonwell Bench', giver: 'Scribe Ilo', brief: 'Orren Vell sits past the notch. He remembers the quiet road.', judge: 1, coin: 230, mats: { bamboofiber: 6, saltglass: 3 } },

    { id: 13, act: 3, region: 'salt', type: 'fetch', title: 'Saltglass for the Forge', giver: 'Panner Doves', brief: 'Four glass blooms sit on the pan. Take only the loose ones.', count: 4, coin: 150, mats: { saltglass: 5 } },
    { id: 14, act: 3, region: 'salt', type: 'escort', title: 'The Mirror Caravan', giver: 'Caravan Mel', brief: 'Walk the caravan hand across the flats to the far post.', coin: 170, mats: { saltglass: 4, moonbrass: 1 } },
    { id: 15, act: 3, region: 'salt', type: 'purge', title: 'Kites over the Pan', giver: 'Caravan Mel', brief: 'Five kites circle the drying pan. Send them elsewhere.', count: 5, coin: 185, mats: { saltglass: 5, moonbrass: 2 } },
    { id: 16, act: 3, region: 'salt', type: 'riddle', title: 'What the Flats Remember', giver: 'Reeve Anselm', brief: 'The salt keeps one question and asks it of everyone.', coin: 195, mats: { moonbrass: 3 }, riddle: 2 },
    { id: 17, act: 3, region: 'salt', type: 'fetch', title: 'The Buried Milepost', giver: 'Milepost Jai', brief: 'Three marker stones went under the crust. Somebody dim waits with them.', count: 3, coin: 210, mats: { saltglass: 5, moonbrass: 3 }, recruit: 'gloomlet' },
    { id: 18, act: 3, region: 'salt', type: 'boss', title: 'The Greenwake Bench', giver: 'Reeve Anselm', brief: 'Seln of the Reeds keeps a garden on the pan. She is waiting.', judge: 2, coin: 330, mats: { saltglass: 6, moonbrass: 4 } },

    { id: 19, act: 4, region: 'moon', type: 'purge', title: 'Grey Tide at the Piers', giver: 'Pier Hand Oro', brief: 'Five grey tides climb the piers. Turn them back.', count: 5, coin: 240, mats: { moonbrass: 5 } },
    { id: 20, act: 4, region: 'moon', type: 'fetch', title: 'Moonbrass for the Ledger', giver: 'Ledgerkeep Vans', brief: 'Four brass rings fell from the span. Collect them.', count: 4, coin: 260, mats: { moonbrass: 5, saltglass: 3 } },
    { id: 21, act: 4, region: 'moon', type: 'escort', title: 'The Late Petitioner', giver: 'Petitioner Sill', brief: 'Bring the petitioner across the marches to the span gate.', coin: 280, mats: { moonbrass: 6 } },
    { id: 22, act: 4, region: 'moon', type: 'riddle', title: 'The Bridge That Counts', giver: 'Spanwarden Rhee', brief: 'The long span counts. It would like you to count with it.', coin: 300, mats: { courtjade: 2 }, riddle: 3 },
    { id: 23, act: 4, region: 'moon', type: 'purge', title: 'Clear the Long Span', giver: 'Spanwarden Rhee', brief: 'Six answers stand on the span. A soft one will follow you home.', count: 6, coin: 330, mats: { moonbrass: 6, courtjade: 2 }, recruit: 'cloudpup' },
    { id: 24, act: 4, region: 'moon', type: 'boss', title: 'The Longspan Bench', giver: 'Ledgerkeep Vans', brief: 'Halide Wren counts every step. Climb anyway.', judge: 3, coin: 470, mats: { moonbrass: 7, courtjade: 3 } },

    { id: 25, act: 5, region: 'court', type: 'riddle', title: 'The First Question', giver: 'Herald Ansi', brief: 'The court opens with a question, not a fight.', coin: 360, mats: { courtjade: 3 }, riddle: 4 },
    { id: 26, act: 5, region: 'court', type: 'purge', title: 'Cloudmarch', giver: 'Recess Marshal', brief: 'Six cloudmarchers hold the lower stair.', count: 6, coin: 390, mats: { courtjade: 4 } },
    { id: 27, act: 5, region: 'court', type: 'fetch', title: 'Nine Lanterns for the Stair', giver: 'Stairkeeper Nev', brief: 'Five lanterns still need lighting. Eight is a different ceremony.', count: 5, coin: 420, mats: { courtjade: 4, moonbrass: 3 } },
    { id: 28, act: 5, region: 'court', type: 'escort', title: 'Bring the Petitioner Up', giver: 'Herald Ansi', brief: 'Walk the last petitioner to the court gate.', coin: 450, mats: { courtjade: 5 } },
    { id: 29, act: 5, region: 'court', type: 'purge', title: 'The Long Recess', giver: 'Recess Marshal', brief: 'Seven wardens fill the recess hall. Clear it before the bell.', count: 7, coin: 500, mats: { courtjade: 6, moonbrass: 4 } },
    { id: 30, act: 5, region: 'court', type: 'boss', title: 'The Celestial Court', giver: 'Stairkeeper Nev', brief: 'Ilaria Sunreach will hear your company at last.', judge: 4, coin: 900, mats: { courtjade: 8 } }
  ];

  var RIDDLES = [
    { q: 'I am raised at dusk and lowered at dawn, and I carry no weight at all. What am I?', a: ['A lantern', 'A bridge', 'A verdict'], right: 0, hint: 'The keeper points at the low bridge road.' },
    { q: 'Cut me and I return by morning. Bend me and I hold a roof. What am I?', a: ['A grudge', 'Cane', 'A river'], right: 1, hint: 'The cane rattles once, politely.' },
    { q: 'I keep every footprint and forget every name. What am I?', a: ['A ledger', 'Salt', 'A moon'], right: 1, hint: 'The pan glitters under your boots.' },
    { q: 'I add one for every traveler and never reach an end. What am I?', a: ['A span', 'A debt', 'A court'], right: 0, hint: 'The bridge planks tick as you cross.' },
    { q: 'I am heard by everyone and answered by no one. What am I?', a: ['A bell', 'A question', 'A judge'], right: 1, hint: 'The herald smiles and says nothing.' }
  ];

  var ARENA = [
    { rung: 1, name: 'Straw Round', squad: ['tollmoth', 'strawcourier'], coin: 60, mat: 'lanternsilk', matN: 2 },
    { rung: 2, name: 'Lantern Round', squad: ['strawcourier', 'benchhound'], coin: 80, mat: 'lanternsilk', matN: 3 },
    { rung: 3, name: 'Gate Round', squad: ['benchhound', 'tollmoth', 'tollmoth'], coin: 105, mat: 'bamboofiber', matN: 2 },
    { rung: 4, name: 'Cane Round', squad: ['caneserpent', 'reedkite'], coin: 130, mat: 'bamboofiber', matN: 3 },
    { rung: 5, name: 'Notch Round', squad: ['caneserpent', 'caneserpent', 'reedkite'], coin: 165, mat: 'bamboofiber', matN: 4 },
    { rung: 6, name: 'Pan Round', squad: ['saltkite', 'reedkite'], coin: 200, mat: 'saltglass', matN: 3 },
    { rung: 7, name: 'Mirror Round', squad: ['mirrorwalker', 'saltkite'], coin: 240, mat: 'saltglass', matN: 4 },
    { rung: 8, name: 'Crust Round', squad: ['saltkite', 'saltkite', 'mirrorwalker'], coin: 285, mat: 'saltglass', matN: 5 },
    { rung: 9, name: 'Pier Round', squad: ['greytide', 'mirrorwalker'], coin: 335, mat: 'moonbrass', matN: 3 },
    { rung: 10, name: 'Span Round', squad: ['moonwarden', 'greytide'], coin: 390, mat: 'moonbrass', matN: 4 },
    { rung: 11, name: 'Marches Round', squad: ['greytide', 'greytide', 'moonwarden'], coin: 450, mat: 'moonbrass', matN: 5 },
    { rung: 12, name: 'Stair Round', squad: ['cloudmarcher', 'moonwarden'], coin: 520, mat: 'courtjade', matN: 3 },
    { rung: 13, name: 'Recess Round', squad: ['cloudmarcher', 'cloudmarcher'], coin: 600, mat: 'courtjade', matN: 4 },
    { rung: 14, name: 'Star Round', squad: ['starwarden', 'cloudmarcher'], coin: 700, mat: 'courtjade', matN: 5 },
    { rung: 15, name: 'Sky Round', squad: ['starwarden', 'starwarden', 'cloudmarcher'], coin: 900, mat: 'courtjade', matN: 8 }
  ];

  var HUB_TIERS = [
    { at: 0, name: 'Waystall Quarter', unlock: 'The quest board is open.' },
    { at: 3, name: 'Forge Quarter', unlock: 'The forge opens. Craft from your drops.' },
    { at: 8, name: 'Arena Quarter', unlock: 'The Sky Arena ladder opens.' },
    { at: 14, name: 'Academy Quarter', unlock: 'The academy opens. Change class at rank 5.' },
    { at: 22, name: 'Court Quarter', unlock: 'The court stair is lit. The capital is whole.' }
  ];

  var TUTORIAL = [
    'Drag the left pad to walk. The company follows you.',
    'Tall grass hides rivals. Walk it to find a fight.',
    'Tap ATTACK. The rail above shows who acts next.',
    'Tap SKILL for an art. Arts cost focus and hit elements.',
    'Tap SWAP to move a wayfarer front or back. Front hits harder.',
    'Walk the gold pin, then take the gate home to report.',
    'Open the forge from the capital to craft from your drops.'
  ];

  /* ---------------------------------------------------------- utilities */

  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
  function safeNum(n, fb, a, b) { return typeof n === 'number' && isFinite(n) ? clamp(n, a, b) : fb; }
  function safeInt(n, fb, a, b) { return typeof n === 'number' && isFinite(n) ? clamp(Math.floor(n), a, b) : fb; }
  function classData(id) { return CLASSES[id] || CLASSES.wayfarer; }
  function skillData(id) { return SKILLS[id] || SKILLS.waycut; }
  function regionData(id) { return REGIONS[id] || REGIONS.lantern; }
  function enemyData(id) { return ENEMIES[id] || ENEMIES.tollmoth; }
  function gearData(id) { return GEAR[id] || GEAR.waylight; }
  function itemData(id) { return ITEMS[id] || ITEMS.tonic; }
  function matData(id) { return MATS[id] || MATS.lanternsilk; }
  function elemData(id) { return ELEMENTS[id] || ELEMENTS.ember; }
  function statusData(id) { return STATUSES[id] || STATUSES.burn; }
  function judgeData(i) { return JUDGES[clamp(safeInt(i, 0, 0, 4), 0, 4)]; }
  function questData(id) { return QUESTS[clamp(safeInt(id, 1, 1, 30), 1, 30) - 1]; }
  function riddleData(i) { return RIDDLES[clamp(safeInt(i, 0, 0, 4), 0, 4)]; }
  function arenaData(r) { return ARENA[clamp(safeInt(r, 1, 1, 15), 1, 15) - 1]; }
  function blueprint(id) {
    for (var i = 0; i < ROSTER_BLUEPRINT.length; i++) if (ROSTER_BLUEPRINT[i].id === id) return ROSTER_BLUEPRINT[i];
    return ROSTER_BLUEPRINT[0];
  }
  function ellipsize(text, max) {
    text = String(text == null ? '' : text);
    return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)).trimEnd() + '…';
  }
  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function elemMul(a, d) {
    if (!a || !d) return 1;
    if (CYCLE[a] === d) return 1.5;
    if (CYCLE[d] === a) return 0.7;
    return 1;
  }
  function rankNeed(rank) { return Math.round(38 + rank * rank * 15 + rank * 26); }

  /* Deterministic per-region generator so a map is identical every visit. */
  function lcg(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* -------------------------------------------------------------- state */

  function makeMember(bp) {
    var line = CLASS_LINE[bp.arch] || CLASS_LINE.way;
    return {
      id: bp.id, cls: line[0], rank: 1, xp: 0, row: bp.row || 'front',
      order: bp.arch === 'mend' ? 'support' : bp.arch === 'ward' ? 'guard' : 'assault',
      equip: { weapon: null, armor: null, charm: null },
      hp: 1, sp: 1, recruited: !!bp.start
    };
  }

  function makeState() {
    var roster = {};
    for (var i = 0; i < ROSTER_BLUEPRINT.length; i++) roster[ROSTER_BLUEPRINT[i].id] = makeMember(ROSTER_BLUEPRINT[i]);
    return {
      version: SAVE_VERSION,
      mode: 'title', submenu: null, stage: 'title', progress: 0,
      act: 1, region: 'lantern', hubTier: 0,
      roster: roster, party: ['you', 'mira', 'rook', 'pax'],
      questDone: {}, activeQuest: null, questStep: 0, questCount: 0, questTurnIn: false,
      offered: [1, 2, 3],
      coin: 60, mats: { lanternsilk: 2, bamboofiber: 2, saltglass: 0, moonbrass: 0, courtjade: 0 },
      items: { tonic: 3, waybread: 1, courtward: 1, emberchip: 1 },
      gear: {}, arenaRung: 0, arenaFight: 0,
      score: 0, elapsed: 0, battles: 0, bonded: 0, crafted: 0,
      tutorialStep: 0, coachSeen: {}, auto: false, speed: 1,
      field: null, combat: null, dialogue: null, banner: null,
      toast: '', toastTime: 0, toastColor: CSS.text, toastKind: 'event', toastQueue: [],
      health: 1, pauseHint: false,
      best: { quests: 0, arena: 0, score: 0 }
    };
  }

  var state = makeState();
  var bootMode = null;
  var bootStage = null;
  var app = { scene: null };

  /* The hook is live before Phaser boots and stays the same object after, so a
   * harness can install switches without racing scene creation. */
  window.__wc = {
    state: state,
    forceMode: function (mode) {
      bootMode = typeof mode === 'string' ? mode : 'hub';
      if (app.scene && app.scene.forceMode) app.scene.forceMode(bootMode);
      return bootMode;
    },
    forceStage: function (stage) {
      bootStage = stage;
      if (app.scene && app.scene.forceStage) app.scene.forceStage(bootStage);
      return bootStage;
    }
  };

  var kit = GGKit.create({
    slug: 'wayfarer-courts',
    orientation: 'portrait',
    validateSave: validateSave,
    onPause: function () { state.pauseHint = true; },
    onResume: function () { state.pauseHint = false; },
    onRestart: function () { resetInputEdges(); }
  });
  kit.audio.register({
    town: 'assets/town.mp3', field: 'assets/field.mp3', battle: 'assets/battle.mp3',
    court: 'assets/court.mp3', celestial: 'assets/celestial.mp3',
    strike: 'assets/strike.mp3', art: 'assets/art.mp3', guard: 'assets/guard.mp3',
    hurt: 'assets/hurt.mp3', heal: 'assets/heal.mp3', bond: 'assets/bond.mp3',
    ui: 'assets/ui.mp3', back: 'assets/back.mp3', step: 'assets/step.mp3',
    reward: 'assets/reward.mp3', craft: 'assets/craft.mp3', rank: 'assets/rank.mp3',
    defeat: 'assets/defeat.mp3', victory: 'assets/victory.mp3', quest: 'assets/quest.mp3',
    encounter: 'assets/encounter.mp3'
  });
  function sfx(name, vol) { kit.audio.sfx(name, { volume: vol == null ? 1 : vol }); }

  /* --------------------------------------------------------------- save */

  function validateSave(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if (o.version !== SAVE_VERSION) return false;
    if (!o.roster || typeof o.roster !== 'object') return false;
    if (!Array.isArray(o.party) || o.party.length !== 4) return false;
    for (var i = 0; i < o.party.length; i++) if (!CLASS_LINE[blueprint(o.party[i]).arch] || blueprint(o.party[i]).id !== o.party[i]) return false;
    return true;
  }

  function persist() {
    var r = {};
    for (var id in state.roster) {
      var m = state.roster[id];
      r[id] = { cls: m.cls, rank: m.rank, xp: m.xp, row: m.row, order: m.order, recruited: m.recruited, hp: Math.round(m.hp), sp: Math.round(m.sp), equip: { weapon: m.equip.weapon, armor: m.equip.armor, charm: m.equip.charm } };
    }
    kit.save.set({
      version: SAVE_VERSION, act: state.act, region: state.region, hubTier: state.hubTier,
      roster: r, party: state.party.slice(0, 4), questDone: state.questDone,
      offered: state.offered.slice(0, 6), coin: Math.round(state.coin), mats: state.mats,
      items: state.items, gear: state.gear, arenaRung: state.arenaRung,
      score: Math.round(state.score), elapsed: Math.round(state.elapsed),
      battles: state.battles, bonded: state.bonded, crafted: state.crafted,
      tutorialStep: state.tutorialStep, best: state.best
    });
  }

  function loadPersistent() {
    var o = kit.save.get(null);
    if (!o) return false;
    state.act = safeInt(o.act, 1, 1, 5);
    state.region = REGIONS[o.region] ? o.region : 'lantern';
    state.hubTier = safeInt(o.hubTier, 0, 0, 4);
    state.coin = safeInt(o.coin, 60, 0, 999999);
    state.score = safeInt(o.score, 0, 0, 9999999);
    state.elapsed = safeNum(o.elapsed, 0, 0, 864000);
    state.battles = safeInt(o.battles, 0, 0, 99999);
    state.bonded = safeInt(o.bonded, 0, 0, 12);
    state.crafted = safeInt(o.crafted, 0, 0, 999);
    state.arenaRung = safeInt(o.arenaRung, 0, 0, 15);
    state.tutorialStep = safeInt(o.tutorialStep, 0, 0, TUTORIAL.length);
    var i;
    for (i = 0; i < MAT_KEYS.length; i++) state.mats[MAT_KEYS[i]] = safeInt(o.mats && o.mats[MAT_KEYS[i]], 0, 0, 9999);
    for (i = 0; i < ITEM_KEYS.length; i++) state.items[ITEM_KEYS[i]] = safeInt(o.items && o.items[ITEM_KEYS[i]], 0, 0, 99);
    state.gear = {};
    for (i = 0; i < GEAR_KEYS.length; i++) {
      var gv = o.gear && o.gear[GEAR_KEYS[i]];
      if (gv) state.gear[GEAR_KEYS[i]] = safeInt(gv, 0, 0, 99);
    }
    state.questDone = {};
    if (o.questDone && typeof o.questDone === 'object') {
      for (i = 1; i <= 30; i++) if (o.questDone[i]) state.questDone[i] = true;
    }
    state.offered = [];
    if (Array.isArray(o.offered)) {
      for (i = 0; i < o.offered.length && state.offered.length < 6; i++) {
        var q = safeInt(o.offered[i], 0, 1, 30);
        if (q && !state.questDone[q] && state.offered.indexOf(q) < 0) state.offered.push(q);
      }
    }
    if (!state.offered.length) refreshOffers();
    for (i = 0; i < ROSTER_BLUEPRINT.length; i++) {
      var bp = ROSTER_BLUEPRINT[i];
      var m = state.roster[bp.id];
      var src = o.roster && o.roster[bp.id];
      m.recruited = !!bp.start;
      if (!src || typeof src !== 'object') continue;
      var line = CLASS_LINE[bp.arch];
      m.cls = line.indexOf(src.cls) >= 0 ? src.cls : line[0];
      m.rank = safeInt(src.rank, 1, 1, 20);
      m.xp = safeInt(src.xp, 0, 0, 9999999);
      m.row = src.row === 'back' ? 'back' : 'front';
      m.order = ['assault', 'support', 'guard', 'focus'].indexOf(src.order) >= 0 ? src.order : m.order;
      m.recruited = !!bp.start || src.recruited === true;
      m.equip.weapon = validGear(src.equip && src.equip.weapon, 'weapon');
      m.equip.armor = validGear(src.equip && src.equip.armor, 'armor');
      m.equip.charm = validGear(src.equip && src.equip.charm, 'charm');
      m.hp = safeNum(src.hp, 0, 0, 9999);
      m.sp = safeNum(src.sp, 0, 0, 9999);
    }
    var party = [];
    if (Array.isArray(o.party)) {
      for (i = 0; i < o.party.length && party.length < 4; i++) {
        var pid = o.party[i];
        if (typeof pid === 'string' && state.roster[pid] && state.roster[pid].recruited && party.indexOf(pid) < 0) party.push(pid);
      }
    }
    if (party.indexOf('you') < 0) party.unshift('you');
    for (i = 0; i < ROSTER_BLUEPRINT.length && party.length < 4; i++) {
      var rid = ROSTER_BLUEPRINT[i].id;
      if (state.roster[rid].recruited && party.indexOf(rid) < 0) party.push(rid);
    }
    state.party = party.slice(0, 4);
    if (o.best && typeof o.best === 'object') {
      state.best.quests = safeInt(o.best.quests, 0, 0, 30);
      state.best.arena = safeInt(o.best.arena, 0, 0, 15);
      state.best.score = safeInt(o.best.score, 0, 0, 9999999);
    }
    recomputeStats(true);
    return true;
  }
  function validGear(id, slot) {
    if (typeof id !== 'string' || !GEAR[id] || GEAR[id].slot !== slot) return null;
    if (!state.gear[id]) return null;
    return id;
  }

  /* ------------------------------------------------------- derived math */

  function companyBonus() {
    var b = { maxHp: 0, atk: 0, def: 0, bond: 0, evade: 0, rest: 0 };
    for (var i = 0; i < state.party.length; i++) {
      var bp = blueprint(state.party[i]);
      if (!bp.bonus) continue;
      if (bp.bonus.maxHp) b.maxHp += bp.bonus.maxHp;
      if (bp.bonus.atk) b.atk += bp.bonus.atk;
      if (bp.bonus.def) b.def += bp.bonus.def;
      if (bp.bonus.bond) b.bond += bp.bonus.bond;
      if (bp.bonus.evade) b.evade = Math.max(b.evade, bp.bonus.evade);
      if (bp.bonus.rest) b.rest += bp.bonus.rest;
    }
    return b;
  }

  function gearBonus(m) {
    var g = { atk: 0, def: 0, hp: 0, spd: 0, sp: 0, element: null };
    var slots = ['weapon', 'armor', 'charm'];
    for (var i = 0; i < slots.length; i++) {
      var id = m.equip[slots[i]];
      if (!id || !GEAR[id]) continue;
      var d = GEAR[id];
      g.atk += d.atk || 0; g.def += d.def || 0; g.hp += d.hp || 0;
      g.spd += d.spd || 0; g.sp += d.sp || 0;
      if (d.element) g.element = d.element;
    }
    return g;
  }

  function memberStats(id) {
    var bp = blueprint(id);
    var m = state.roster[id] || makeMember(bp);
    var cd = classData(m.cls);
    var g = gearBonus(m);
    var cb = companyBonus();
    var grow = 1 + (m.rank - 1) * 0.11;
    var maxHp = Math.round(bp.baseHp * cd.hp * grow) + g.hp + cb.maxHp;
    var maxSp = Math.round(26 + m.rank * 3 + (cd.tier - 1) * 8) + g.sp;
    return {
      id: id, name: bp.name, glyph: bp.glyph, color: bp.color, accent: bp.accent,
      element: g.element || bp.element, cls: m.cls, className: cd.name, arch: bp.arch,
      rank: m.rank, xp: m.xp, row: m.row, order: m.order,
      maxHp: maxHp, maxSp: maxSp,
      atk: Math.round(bp.atk * cd.atk * grow) + g.atk + cb.atk,
      def: Math.round(bp.def * cd.def * grow) + g.def + cb.def,
      spd: Math.round(bp.spd * cd.spd) + g.spd,
      skills: cd.skills, trait: bp.trait, traitText: bp.traitText
    };
  }

  function recomputeStats(fill) {
    for (var id in state.roster) {
      var m = state.roster[id];
      var s = memberStats(id);
      if (fill || m.hp <= 0) m.hp = s.maxHp;
      if (fill || m.sp <= 0) m.sp = s.maxSp;
      m.hp = clamp(m.hp, 0, s.maxHp);
      m.sp = clamp(m.sp, 0, s.maxSp);
    }
    var worst = 1;
    for (var i = 0; i < state.party.length; i++) {
      var pm = state.roster[state.party[i]];
      var ps = memberStats(state.party[i]);
      worst = Math.min(worst, ps.maxHp > 0 ? pm.hp / ps.maxHp : 0);
    }
    state.health = clamp(worst, 0, 1);
  }

  function partyHeal(amount) {
    for (var i = 0; i < state.party.length; i++) {
      var id = state.party[i];
      var s = memberStats(id);
      state.roster[id].hp = clamp(state.roster[id].hp + amount, 0, s.maxHp);
      state.roster[id].sp = clamp(state.roster[id].sp + Math.round(amount * 0.4), 0, s.maxSp);
    }
    recomputeStats(false);
  }

  function questsDoneCount() {
    var n = 0;
    for (var i = 1; i <= 30; i++) if (state.questDone[i]) n++;
    return n;
  }

  function refreshOffers() {
    var out = [];
    for (var i = 0; i < QUESTS.length && out.length < 3; i++) {
      var q = QUESTS[i];
      if (state.questDone[q.id]) continue;
      if (q.act > state.act) continue;
      if (q.type === 'boss') {
        var actClear = true;
        for (var j = 0; j < QUESTS.length; j++) if (QUESTS[j].act === q.act && QUESTS[j].type !== 'boss' && !state.questDone[QUESTS[j].id]) actClear = false;
        if (!actClear) continue;
      }
      out.push(q.id);
    }
    if (!out.length) {
      for (var k = 0; k < QUESTS.length && out.length < 3; k++) if (!state.questDone[QUESTS[k].id]) out.push(QUESTS[k].id);
    }
    state.offered = out;
  }

  function updateHubTier() {
    var done = questsDoneCount();
    var tier = 0;
    for (var i = 0; i < HUB_TIERS.length; i++) if (done >= HUB_TIERS[i].at) tier = i;
    if (tier > state.hubTier) {
      state.hubTier = tier;
      showBanner('THE CAPITAL GROWS', HUB_TIERS[tier].name, CSS.gold, 'timed');
      queueToast(HUB_TIERS[tier].unlock, 1.0, CSS.gold);
      if (tier >= 1 && state.tutorialStep === 6) showCoach(TUTORIAL[6]);
      sfx('reward');
    }
    state.hubTier = Math.max(state.hubTier, tier);
  }

  /* ---------------------------------------------------------- transient */

  function clearTransient() { state.toast = ''; state.toastTime = 0; state.toastQueue.length = 0; }
  function queueToast(text, hold, color, kind) {
    var item = { text: text, hold: hold == null ? 1.0 : hold, color: color || CSS.text, kind: kind || 'event' };
    /* UI law: exactly one transient at a time. A centre banner owns the screen
     * at a run boundary, so toasts wait behind it instead of stacking. */
    if (!state.banner && (!state.toast || state.toastTime <= 0)) startTransient(item);
    else GGKit.boundedPush(state.toastQueue, item, 3);
  }
  function showCoach(text) { queueToast(text, 3.0, CSS.text, 'coach'); }
  function startTransient(item) {
    state.toast = item.text; state.toastTime = item.hold; state.toastColor = item.color; state.toastKind = item.kind;
  }
  function updateTransient(dt) {
    if (state.toastTime > 0) {
      state.toastTime -= dt;
      if (state.toastTime <= 0 && state.toastQueue.length && !state.banner) startTransient(state.toastQueue.shift());
    } else if (state.toastQueue.length && !state.banner) startTransient(state.toastQueue.shift());
  }
  function advanceTutorial(step, text) {
    if (state.tutorialStep !== step) return;
    state.tutorialStep = step + 1;
    if (text) showCoach(text);
    persist();
  }
  function coachOnce(key, text) {
    if (state.coachSeen[key]) return;
    state.coachSeen[key] = true;
    showCoach(text);
  }

  /* Centre banners are run-boundary only: battle end, act clear, journey end. */
  function showBanner(title, subtitle, color, behavior) {
    state.banner = { title: title, subtitle: subtitle, color: color || CSS.gold, behavior: behavior || 'timed', time: 0, life: behavior === 'manual' ? 999 : 1.5, scale: 0.86 };
  }
  function updateBanner(dt) {
    var b = state.banner;
    if (!b) return;
    b.time += dt;
    var t = clamp(b.time / 0.34, 0, 1);
    b.scale = kit.juice.enabled ? 0.86 + (1.06 - 0.86) * (1 - Math.pow(1 - t, 3)) + Math.sin(t * Math.PI) * 0.05 : 1;
    if (b.scale > 1) b.scale = 1 + (b.scale - 1) * (1 - t * 0.6);
    if (b.behavior !== 'manual' && b.time >= b.life) state.banner = null;
  }

  /* --------------------------------------------------------- field maps */

  var mapCache = {};

  function buildMap(regionId) {
    if (mapCache[regionId]) return mapCache[regionId];
    var rd = regionData(regionId);
    var rnd = lcg(rd.seed);
    var tiles = new Uint8Array(MAP_W * MAP_H);
    var x, y, i;
    for (y = 0; y < MAP_H; y++) for (x = 0; x < MAP_W; x++) {
      var edge = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
      tiles[y * MAP_W + x] = edge ? 4 : 0;
    }
    /* Two vertical lanes and three horizontal lanes make a readable road net. */
    var laneX = [4, 11, 18];
    var laneY = [4, 12, 20, 27];
    for (i = 0; i < laneX.length; i++) for (y = 2; y < MAP_H - 2; y++) {
      tiles[y * MAP_W + laneX[i]] = 1;
      if (laneX[i] + 1 < MAP_W - 1) tiles[y * MAP_W + laneX[i] + 1] = 1;
    }
    for (i = 0; i < laneY.length; i++) for (x = 2; x < MAP_W - 2; x++) {
      tiles[laneY[i] * MAP_W + x] = 1;
      tiles[(laneY[i] + 1) * MAP_W + x] = 1;
    }
    /* Encounter meadows fill the blocks between lanes. */
    for (y = 2; y < MAP_H - 2; y++) for (x = 2; x < MAP_W - 2; x++) {
      i = y * MAP_W + x;
      if (tiles[i] !== 0) continue;
      var r = rnd();
      if (r < 0.52) tiles[i] = 2;
      else if (r < 0.60) tiles[i] = 3;
      else if (r < 0.70) tiles[i] = 4;
    }
    /* Carve a walkable ring around every lane so nothing seals a corridor. */
    for (i = 0; i < laneX.length; i++) for (y = 2; y < MAP_H - 2; y++) {
      var lx = laneX[i];
      if (lx - 1 > 0 && tiles[y * MAP_W + lx - 1] > 2) tiles[y * MAP_W + lx - 1] = 2;
      if (lx + 2 < MAP_W - 1 && tiles[y * MAP_W + lx + 2] > 2) tiles[y * MAP_W + lx + 2] = 2;
    }
    var props = [];
    for (i = 0; i < 26; i++) {
      var px = 2 + Math.floor(rnd() * (MAP_W - 4));
      var py = 2 + Math.floor(rnd() * (MAP_H - 4));
      if (tiles[py * MAP_W + px] === 1) continue;
      props.push({ x: px * TILE + TILE / 2, y: py * TILE + TILE / 2, phase: rnd() * TAU });
    }
    /* Authored points of interest sit on lane crossings so they are reachable. */
    var spots = [];
    for (i = 0; i < laneY.length; i++) for (var j = 0; j < laneX.length; j++) {
      spots.push({ x: (laneX[j] + 0.5) * TILE + TILE / 2, y: (laneY[i] + 0.5) * TILE + TILE / 2 });
    }
    var map = {
      region: regionId, tiles: tiles, props: props, spots: spots,
      spawn: { x: (laneX[1] + 1) * TILE, y: (laneY[3] + 1) * TILE },
      gate: { x: (laneX[1] + 1) * TILE, y: (laneY[3] + 1) * TILE }
    };
    mapCache[regionId] = map;
    return map;
  }

  function tileAt(map, x, y) {
    var tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return 4;
    return map.tiles[ty * MAP_W + tx];
  }
  function walkable(map, x, y) { var t = tileAt(map, x, y); return t === 0 || t === 1 || t === 2; }

  function enterField(regionId) {
    var map = buildMap(regionId);
    state.region = regionId;
    var q = state.activeQuest ? questData(state.activeQuest) : null;
    var markers = [];
    var need = q ? (q.type === 'fetch' ? Math.min(3, q.count || 1) : 1) : 1;
    if (q && q.type !== 'purge') {
      for (var i = 0; i < need; i++) {
        var s = map.spots[(i * 5 + q.id) % map.spots.length];
        markers.push({ x: s.x, y: s.y, taken: false, kind: q.type });
      }
    }
    var npcs = [];
    var rd = regionData(regionId);
    for (var n = 0; n < rd.npcs.length; n++) {
      var sp = map.spots[(n * 3 + 1) % map.spots.length];
      npcs.push({ x: sp.x + 46, y: sp.y - 30, name: rd.npcs[n].name, line: rd.npcs[n].line, talked: false });
    }
    state.field = {
      map: map, px: map.spawn.x, py: map.spawn.y, vx: 0, vy: 0, dir: 'down',
      anim: 'idle', animClock: 0, animFrame: 0, walkClock: 0,
      camX: 0, camY: 0, meter: 0, pity: 0, markers: markers, npcs: npcs,
      trail: [], follower: null, escorting: false, stepClock: 0,
      gateOpen: !q || q.type === 'purge', banner: 0
    };
    for (var t = 0; t < 40; t++) state.field.trail.push({ x: map.spawn.x, y: map.spawn.y });
    state.mode = 'field';
    state.stage = 'field:' + regionId;
    state.banner = null;
    state.combat = null;
    kit.audio.music(rd.music, 700);
    if (state.tutorialStep === 0) advanceTutorial(0, TUTORIAL[0]);
    else if (state.tutorialStep === 1) showCoach(TUTORIAL[1]);
    persist();
  }

  function fieldObjectiveText() {
    var q = state.activeQuest ? questData(state.activeQuest) : null;
    if (!q) return 'Wander. The gate goes home.';
    if (q.type === 'purge') return 'Settle ' + q.count + ' rivals: ' + state.questCount + '/' + q.count;
    if (q.type === 'fetch') return 'Gather ' + q.count + ': ' + state.questCount + '/' + q.count;
    if (q.type === 'escort') return state.field && state.field.escorting ? 'Walk them to the gate.' : 'Reach the gold pin.';
    if (q.type === 'riddle') return 'Answer the bench at the gold pin.';
    return 'Climb to the bench at the gold pin.';
  }

  function nearestMarker() {
    var f = state.field;
    if (!f) return null;
    var best = null, bd = 1e9;
    for (var i = 0; i < f.markers.length; i++) {
      var m = f.markers[i];
      if (m.taken) continue;
      var d = Math.hypot(m.x - f.px, m.y - f.py);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  function fieldInteract() {
    var f = state.field;
    if (!f) return;
    var q = state.activeQuest ? questData(state.activeQuest) : null;
    var i;
    for (i = 0; i < f.npcs.length; i++) {
      var n = f.npcs[i];
      if (Math.hypot(n.x - f.px, n.y - f.py) < 46) { openDialogue(n.name, n.line, null); n.talked = true; sfx('ui'); return; }
    }
    var m = nearestMarker();
    if (m && Math.hypot(m.x - f.px, m.y - f.py) < 46) {
      if (q && q.type === 'fetch') {
        m.taken = true; state.questCount++; sfx('quest');
        queueToast(matData(regionData(state.region).mats[0]).icon + ' ' + state.questCount + '/' + q.count, 1.0, CSS.gold);
        if (state.questCount >= q.count) { f.gateOpen = true; queueToast('Take the gate home.', 1.0, CSS.mint); advanceTutorial(5, TUTORIAL[5]); }
        return;
      }
      if (q && q.type === 'escort') {
        m.taken = true; f.escorting = true; f.follower = { x: f.px, y: f.py }; f.gateOpen = true;
        sfx('quest'); openDialogue(q.giver, 'Thank you. Walk slowly and I will keep up.', null);
        return;
      }
      if (q && q.type === 'riddle') {
        m.taken = true; openRiddle(q);
        return;
      }
      if (q && q.type === 'boss') {
        m.taken = true;
        var jd = judgeData(q.judge);
        openDialogue(jd.name, jd.line, function () { startBattle('boss', { judge: q.judge }); });
        return;
      }
    }
    if (Math.hypot(f.map.gate.x - f.px, f.map.gate.y - f.py) < 52) {
      if (!f.gateOpen) { queueToast('The road is not finished yet.', 1.0, CSS.rose); sfx('back'); return; }
      returnToHub();
      return;
    }
    queueToast('Nothing here to answer.', 0.8, CSS.dim);
  }

  function returnToHub() {
    var q = state.activeQuest ? questData(state.activeQuest) : null;
    var complete = false;
    if (q) {
      if (q.type === 'purge') complete = state.questCount >= q.count;
      else if (q.type === 'fetch') complete = state.questCount >= q.count;
      else if (q.type === 'escort') complete = !!(state.field && state.field.escorting);
      else complete = state.questTurnIn;
    }
    state.field = null;
    state.mode = 'hub';
    state.stage = 'hub';
    state.banner = null;
    kit.audio.music('town', 700);
    if (complete) completeQuest(q);
    else if (q) queueToast('Quest still open. The board keeps it.', 1.1, CSS.dim);
    persist();
  }

  function completeQuest(q) {
    if (!q) return;
    state.questDone[q.id] = true;
    state.activeQuest = null; state.questCount = 0; state.questTurnIn = false;
    state.coin += q.coin;
    for (var k in q.mats) state.mats[k] = (state.mats[k] || 0) + q.mats[k];
    state.score += 120 + q.act * 60;
    var extra = '';
    if (q.recruit && state.roster[q.recruit] && !state.roster[q.recruit].recruited) {
      state.roster[q.recruit].recruited = true;
      recomputeStats(false);
      var rm = memberStats(q.recruit);
      state.roster[q.recruit].hp = rm.maxHp; state.roster[q.recruit].sp = rm.maxSp;
      extra = blueprint(q.recruit).name + ' joins the company.';
    }
    if (q.type === 'boss') {
      state.best.quests = Math.max(state.best.quests, questsDoneCount());
      if (state.act >= 5) {
        showBanner('THE COURT ANSWERS', 'Every bench has opened', CSS.gold, 'manual');
        state.mode = 'result'; state.stage = 'clear';
        kit.audio.music('celestial', 700);
      } else {
        state.act = clamp(state.act + 1, 1, 5);
        state.region = REGION_KEYS[state.act - 1];
        showBanner('ACT ' + state.act, regionData(state.region).name + ' opens', CSS.gold, 'timed');
      }
      sfx('victory');
    } else {
      showBanner('QUEST FILED', q.title, CSS.mint, 'timed');
      sfx('reward');
    }
    if (extra) queueToast(extra, 1.2, CSS.gold);
    updateHubTier();
    refreshOffers();
    partyHeal(24);
    state.best.score = Math.max(state.best.score, Math.round(state.score));
    persist();
  }

  function acceptQuest(id) {
    var q = questData(id);
    if (state.questDone[q.id]) return;
    state.activeQuest = q.id; state.questCount = 0; state.questTurnIn = false;
    state.submenu = null;
    sfx('quest');
    queueToast('Accepted: ' + q.title, 1.2, CSS.gold);
    enterField(q.region);
  }

  /* ------------------------------------------------------------ dialogue */

  function openDialogue(speaker, body, after) {
    state.dialogue = { speaker: speaker, body: body, reveal: 0, choices: null, pick: 0, after: after || null, kind: 'talk' };
    state.mode = 'dialogue';
    state.stage = 'dialogue';
  }
  function openRiddle(q) {
    var r = riddleData(q.riddle);
    state.dialogue = { speaker: 'The Small Bench', body: r.q, reveal: 0, choices: r.a.slice(0), pick: 0, right: r.right, hint: r.hint, after: null, kind: 'riddle' };
    state.mode = 'dialogue';
    state.stage = 'riddle';
    sfx('ui');
  }
  function answerRiddle(index) {
    var d = state.dialogue;
    if (!d || d.kind !== 'riddle') return;
    if (index === d.right) {
      state.questTurnIn = true;
      if (state.field) state.field.gateOpen = true;
      sfx('reward');
      state.dialogue = { speaker: 'The Small Bench', body: d.hint + ' The span is yours. Take the gate home.', reveal: 0, choices: null, pick: 0, after: null, kind: 'talk' };
    } else {
      sfx('back');
      state.dialogue = { speaker: 'The Small Bench', body: 'Not that one. Walk a while and ask again.', reveal: 0, choices: null, pick: 0, after: function () {
        if (!state.field) return;
        for (var i = 0; i < state.field.markers.length; i++) state.field.markers[i].taken = false;
        queueToast('The pin is open again.', 1.0, CSS.dim);
      }, kind: 'talk' };
    }
  }
  function closeDialogue() {
    var d = state.dialogue;
    state.dialogue = null;
    state.mode = state.field ? 'field' : 'hub';
    state.stage = state.field ? 'field:' + state.region : 'hub';
    if (d && d.after) d.after();
  }

  /* -------------------------------------------------------------- combat */

  var uidSeq = 1;

  function makeUnit(side, cfg) {
    return {
      uid: uidSeq++, side: side, ref: cfg.ref || null, key: cfg.key || null,
      name: cfg.name, glyph: cfg.glyph || '◆', color: cfg.color, accent: cfg.accent || '#ffffff',
      family: cfg.family || 'party', element: cfg.element, row: cfg.row || 'front',
      hp: cfg.hp, maxHp: cfg.maxHp, sp: cfg.sp || 0, maxSp: cfg.maxSp || 0,
      atk: cfg.atk, def: cfg.def, spd: Math.max(6, cfg.spd),
      statuses: [], nextAt: 0, alive: true, boss: !!cfg.boss, bondId: cfg.bondId || null,
      skills: cfg.skills || [], xp: cfg.xp || 0, coin: cfg.coin || 0, sig: cfg.sig || null,
      flash: 0, shakeT: 0, anim: 'idle', animT: 0, popT: 0
    };
  }

  function startBattle(kind, opts) {
    opts = opts || {};
    var units = [];
    var i, s, m;
    for (i = 0; i < state.party.length; i++) {
      var id = state.party[i];
      s = memberStats(id);
      m = state.roster[id];
      units.push(makeUnit('party', {
        ref: id, name: s.name, glyph: s.glyph, color: s.color, accent: s.accent,
        element: s.element, row: s.row, hp: Math.max(1, Math.round(m.hp)), maxHp: s.maxHp,
        sp: Math.round(m.sp), maxSp: s.maxSp, atk: s.atk, def: s.def, spd: s.spd,
        skills: s.skills, family: s.arch
      }));
    }
    var foes = [];
    if (kind === 'boss') {
      var jd = judgeData(opts.judge);
      foes.push(makeUnit('foe', {
        key: 'judge', name: jd.name, glyph: jd.glyph, color: jd.color, element: jd.element,
        family: 'judge', row: 'front', hp: jd.hp, maxHp: jd.hp, atk: jd.atk, def: jd.def,
        spd: jd.spd, boss: true, xp: 180 + opts.judge * 90, coin: 0, sig: jd.skill, sp: 200, maxSp: 200
      }));
      var rd0 = regionData(state.region);
      for (i = 0; i < 2; i++) {
        var gk = rd0.enemies[i % rd0.enemies.length];
        var ge = enemyData(gk);
        foes.push(makeUnit('foe', {
          key: gk, name: ge.name, glyph: '·', color: ge.color, element: ge.element, family: ge.family,
          row: 'back', hp: Math.round(ge.hp * 0.8), maxHp: Math.round(ge.hp * 0.8), atk: ge.atk, def: ge.def,
          spd: ge.spd, xp: ge.xp, coin: ge.coin, sig: ge.skill, sp: 60, maxSp: 60
        }));
      }
    } else if (kind === 'arena') {
      var ar = arenaData(opts.rung);
      for (i = 0; i < ar.squad.length; i++) {
        var ak = ar.squad[i];
        var ae = enemyData(ak);
        var scale = 1 + opts.rung * 0.045;
        foes.push(makeUnit('foe', {
          key: ak, name: ae.name, glyph: '·', color: ae.color, element: ae.element, family: ae.family,
          row: i === 0 ? 'front' : 'back', hp: Math.round(ae.hp * scale), maxHp: Math.round(ae.hp * scale),
          atk: Math.round(ae.atk * scale), def: ae.def + Math.floor(opts.rung / 4), spd: ae.spd,
          xp: ae.xp, coin: ae.coin, sig: ae.skill, sp: 80, maxSp: 80
        }));
      }
    } else {
      var rd = regionData(state.region);
      var n = 1 + (Math.random() < 0.45 ? 1 : 0) + (state.act >= 3 && Math.random() < 0.32 ? 1 : 0);
      var bondId = WILD_SPIRITS[state.region];
      var wantBond = !!(bondId && state.roster[bondId] && !state.roster[bondId].recruited && Math.random() < 0.34);
      for (i = 0; i < n; i++) {
        var key = rd.enemies[Math.floor(Math.random() * rd.enemies.length)];
        var ed = enemyData(key);
        var sc = 1 + (state.act - 1) * 0.16;
        foes.push(makeUnit('foe', {
          key: key, name: ed.name, glyph: '·', color: ed.color, element: ed.element, family: ed.family,
          row: i === 0 ? 'front' : 'back', hp: Math.round(ed.hp * sc), maxHp: Math.round(ed.hp * sc),
          atk: Math.round(ed.atk * sc), def: ed.def + state.act - 1, spd: ed.spd,
          xp: Math.round(ed.xp * sc), coin: Math.round(ed.coin * sc), sig: ed.skill, sp: 60, maxSp: 60
        }));
      }
      if (wantBond) {
        var bp = blueprint(bondId);
        var bh = Math.round(bp.baseHp * (1 + state.act * 0.2) + 22);
        foes.push(makeUnit('foe', {
          key: 'spirit', bondId: bondId, name: bp.name, glyph: bp.glyph, color: bp.color,
          element: bp.element, family: 'spirit', row: 'front', hp: bh, maxHp: bh,
          atk: Math.round(bp.atk * (1 + state.act * 0.16) + 5), def: bp.def + state.act, spd: bp.spd,
          xp: 40 + state.act * 14, coin: 20, sig: 'nick', sp: 60, maxSp: 60
        }));
      }
    }
    for (i = 0; i < units.length; i++) units[i].nextAt = 1000 / effSpeed(units[i]) * (0.6 + i * 0.02);
    for (i = 0; i < foes.length; i++) foes[i].nextAt = 1000 / effSpeed(foes[i]) * (0.7 + i * 0.05);
    state.combat = {
      kind: kind, units: units.concat(foes), turn: 1, activeUid: 0,
      phase: 'idle', ui: 'root', focusFoe: 0, focusAlly: 0, cursor: 0, listIndex: 0,
      timer: 0, resolveQueue: [], pending: null, rewards: null, opts: opts,
      autoDelay: 0, bondTried: 0, skipHint: 0
    };
    state.mode = 'battle';
    state.stage = 'battle:' + kind;
    if (app.scene && app.scene.clearParticles) app.scene.clearParticles();
    state.combat.focusFoe = firstAliveFoeIndex();
    kit.audio.music(kind === 'boss' ? 'court' : 'battle', 500);
    sfx('encounter');
    showBanner(kind === 'boss' ? 'THE BENCH SITS' : kind === 'arena' ? 'SKY ARENA' : 'RIVALS ON THE ROAD',
      kind === 'boss' ? judgeData(opts.judge).bench : kind === 'arena' ? arenaData(opts.rung).name : regionData(state.region).name,
      kind === 'boss' ? CSS.ember : CSS.gold, 'timed');
    state.combat.timer = 0.85;
    state.combat.phase = 'intro';
    if (state.banner) state.banner.life = 1.15;
    if (state.tutorialStep === 1) advanceTutorial(1, TUTORIAL[2]);
    state.battles++;
  }

  function combatUnits() { return state.combat ? state.combat.units : []; }
  function aliveOf(side) {
    var out = [];
    var u = combatUnits();
    for (var i = 0; i < u.length; i++) if (u[i].side === side && u[i].alive) out.push(u[i]);
    return out;
  }
  function foeList() {
    var out = [];
    var u = combatUnits();
    for (var i = 0; i < u.length; i++) if (u[i].side === 'foe') out.push(u[i]);
    return out;
  }
  function partyList() {
    var out = [];
    var u = combatUnits();
    for (var i = 0; i < u.length; i++) if (u[i].side === 'party') out.push(u[i]);
    return out;
  }
  function firstAliveFoeIndex() {
    var f = foeList();
    for (var i = 0; i < f.length; i++) if (f[i].alive) return i;
    return 0;
  }
  function unitByUid(uid) {
    var u = combatUnits();
    for (var i = 0; i < u.length; i++) if (u[i].uid === uid) return u[i];
    return null;
  }
  function hasStatus(u, key) {
    for (var i = 0; i < u.statuses.length; i++) if (u.statuses[i].key === key) return u.statuses[i];
    return null;
  }
  function addStatus(u, key, turns, power) {
    var s = hasStatus(u, key);
    if (s) { s.turns = Math.max(s.turns, turns); s.stack = Math.min(3, s.stack + 1); return s; }
    s = { key: key, turns: turns, stack: 1, power: power || 1 };
    GGKit.boundedPush(u.statuses, s, 5);
    return s;
  }
  function clearHarm(u) {
    var out = [];
    for (var i = 0; i < u.statuses.length; i++) if (statusData(u.statuses[i].key).kind === 'help') out.push(u.statuses[i]);
    u.statuses = out;
  }
  function effSpeed(u) {
    var s = u.spd;
    if (hasStatus(u, 'chill')) s *= 0.65;
    return Math.max(6, s);
  }
  function effAtk(u) {
    var a = u.atk;
    if (hasStatus(u, 'weaken')) a *= 0.75;
    if (hasStatus(u, 'rally')) a *= 1.25;
    return a;
  }

  /* Turn timeline: a small forward simulation of the charge clocks so the rail
   * can show who acts next without ever mutating the live units. */
  /* Both buffers are allocated once. The rail is rebuilt every frame, so this
   * must not churn objects. */
  var timelineScratch = [];
  var timelineOut = [];
  var timelineFill = 0;
  function buildTimeline(count) {
    var u = combatUnits();
    timelineFill = 0;
    var i;
    for (i = 0; i < u.length; i++) {
      if (!u[i].alive) continue;
      var slot = timelineScratch[timelineFill];
      if (!slot) { slot = { uid: 0, at: 0, step: 1 }; timelineScratch.push(slot); }
      slot.uid = u[i].uid; slot.at = u[i].nextAt; slot.step = 1000 / effSpeed(u[i]);
      timelineFill++;
    }
    timelineOut.length = 0;
    for (i = 0; i < count && timelineFill; i++) {
      var best = 0;
      for (var j = 1; j < timelineFill; j++) if (timelineScratch[j].at < timelineScratch[best].at) best = j;
      timelineOut.push(timelineScratch[best].uid);
      timelineScratch[best].at += timelineScratch[best].step;
    }
    return timelineOut;
  }

  function nextActor() {
    var u = combatUnits();
    var best = null;
    for (var i = 0; i < u.length; i++) {
      if (!u[i].alive) continue;
      if (!best || u[i].nextAt < best.nextAt) best = u[i];
    }
    return best;
  }

  function advanceTurn() {
    var c = state.combat;
    if (!c) return;
    if (!aliveOf('foe').length) { winBattle(); return; }
    if (!aliveOf('party').length) { loseBattle(); return; }
    var actor = nextActor();
    if (!actor) { loseBattle(); return; }
    c.activeUid = actor.uid;
    c.turn++;
    tickStatuses(actor);
    if (!actor.alive) { advanceTurn(); return; }
    if (hasStatus(actor, 'stun')) {
      pushResult(actor, 'STUNNED', CSS.violet, '✖');
      actor.nextAt += 1000 / effSpeed(actor);
      c.phase = 'resolve'; c.timer = 0.42 / state.speed;
      return;
    }
    if (actor.side === 'foe') {
      c.phase = 'enemy'; c.timer = 0.42 / state.speed;
    } else {
      c.phase = 'choose'; c.ui = 'root'; c.cursor = 0; c.listIndex = 0;
      c.focusFoe = firstAliveFoeIndex();
      c.autoDelay = state.auto ? 0.35 : 0;
      var sp = memberStats(actor.ref);
      actor.sp = clamp(actor.sp + 6, 0, sp.maxSp);
    }
  }

  function tickStatuses(u) {
    var keep = [];
    for (var i = 0; i < u.statuses.length; i++) {
      var s = u.statuses[i];
      if (s.key === 'burn') damageUnit(u, 5 + s.stack * 3, CSS.ember, 'BURN', '✦');
      if (s.key === 'regen') healUnit(u, 7 + s.stack * 3);
      s.turns--;
      if (s.turns > 0) keep.push(s);
    }
    u.statuses = keep;
  }

  function pushResult(u, text, color, icon) {
    var c = state.combat;
    if (!c) return;
    c.resultSerial = (c.resultSerial || 0) + 1;
    GGKit.boundedPush(c.resolveQueue, { uid: u.uid, text: text, color: color, icon: icon || '', n: c.resultSerial }, 8);
  }

  function damageUnit(u, amount, color, label, icon) {
    amount = Math.max(1, Math.round(amount));
    var g = hasStatus(u, 'guard');
    if (g) amount = Math.max(1, Math.round(amount * 0.55));
    var sh = hasStatus(u, 'shield');
    if (sh) amount = Math.max(1, amount - (5 + sh.stack * 3));
    u.hp = clamp(u.hp - amount, 0, u.maxHp);
    u.flash = 0.16;
    u.shakeT = 0.2;
    u.anim = 'hurt'; u.animT = 0.24;
    pushResult(u, (icon ? icon + ' ' : '') + '-' + amount, color || CSS.red, '');
    if (u.hp <= 0) {
      u.alive = false; u.anim = 'down'; u.animT = 0.4;
      pushResult(u, u.side === 'foe' ? 'DOWN' : 'FALLEN', CSS.dim, '');
    }
    return amount;
  }
  function healUnit(u, amount) {
    amount = Math.max(1, Math.round(amount));
    var before = u.hp;
    u.hp = clamp(u.hp + amount, 0, u.maxHp);
    u.popT = 0.3;
    pushResult(u, '✚ +' + (u.hp - before), CSS.mint, '');
    return u.hp - before;
  }

  function rowMul(attacker, target, reach) {
    var m = attacker.row === 'front' ? 1.1 : 0.92;
    if (target.row === 'back' && !reach) m *= 0.84;
    return m;
  }

  function reachableFoes(reach) {
    var f = aliveOf('foe');
    if (reach) return f;
    var front = [];
    for (var i = 0; i < f.length; i++) if (f[i].row === 'front') front.push(f[i]);
    return front.length ? front : f;
  }

  function attackRoll(attacker, target, power, element, reach) {
    var raw = effAtk(attacker) * power;
    var mul = rowMul(attacker, target, reach) * elemMul(element || attacker.element, target.element);
    var variance = 0.9 + Math.random() * 0.22;
    var dmg = Math.max(1, Math.round(raw * mul * variance - target.def * 0.25));
    if (target.side === 'party' && target.row === 'back' && companyBonus().evade > 0 && Math.random() < companyBonus().evade) {
      pushResult(target, 'SLIP', CSS.mint, '');
      return 0;
    }
    var applied = damageUnit(target, dmg, attacker.side === 'party' ? CSS.gold : CSS.red, null, null);
    if (kit.juice.enabled) { kit.juice.shake(attacker.side === 'party' ? 5 : 6, 130); kit.juice.hitStop(elemMul(element || attacker.element, target.element) > 1 ? 58 : 34); }
    sfx(attacker.side === 'party' ? 'strike' : 'hurt', 0.9);
    return applied;
  }

  function performAction(actor, action) {
    var c = state.combat;
    if (!c || !actor.alive) return;
    var i, targets;
    if (action.type === 'attack') {
      targets = reachableFoes(false);
      var t = targets[clamp(c.focusFoe, 0, targets.length - 1)] || targets[0];
      if (actor.side === 'foe') t = pickPartyTarget();
      if (t) attackRoll(actor, t, 1, actor.element, false);
      actor.anim = 'act'; actor.animT = 0.3;
    } else if (action.type === 'skill') {
      var sk = skillData(action.skill);
      if (actor.sp < sk.sp) { queueToast('Not enough focus.', 0.9, CSS.rose); return; }
      actor.sp = clamp(actor.sp - sk.sp, 0, actor.maxSp);
      actor.anim = 'cast'; actor.animT = 0.36;
      sfx('art', 0.9);
      if (sk.kind === 'hit' || sk.kind === 'hit2') {
        targets = actor.side === 'party' ? reachableFoes(sk.reach) : aliveOf('party');
        var tgt = actor.side === 'party' ? (targets[clamp(c.focusFoe, 0, targets.length - 1)] || targets[0]) : pickPartyTarget();
        if (tgt) {
          attackRoll(actor, tgt, sk.power, sk.element, sk.reach);
          if (sk.kind === 'hit2' && tgt.alive) attackRoll(actor, tgt, sk.power, sk.element, sk.reach);
          if (sk.status && tgt.alive && Math.random() < 0.72) { addStatus(tgt, sk.status, sk.status === 'stun' ? 1 : 3); pushResult(tgt, statusData(sk.status).icon + ' ' + statusData(sk.status).name.toUpperCase(), statusData(sk.status).color, ''); }
        }
      } else if (sk.kind === 'hitAll') {
        targets = actor.side === 'party' ? aliveOf('foe') : aliveOf('party');
        for (i = 0; i < targets.length; i++) {
          attackRoll(actor, targets[i], sk.power, sk.element, true);
          if (sk.status && targets[i].alive && Math.random() < 0.5) addStatus(targets[i], sk.status, 3);
        }
        if (kit.juice.enabled) kit.juice.shake(9, 200);
      } else if (sk.kind === 'heal') {
        var ally = lowestAlly(actor.side);
        if (ally) { healUnit(ally, sk.power + Math.round(effAtk(actor) * 0.5)); sfx('heal', 0.9); }
      } else if (sk.kind === 'healAll') {
        var all = aliveOf(actor.side);
        for (i = 0; i < all.length; i++) {
          healUnit(all[i], sk.power + Math.round(effAtk(actor) * 0.3));
          if (sk.status) addStatus(all[i], sk.status, 3);
        }
        sfx('heal', 0.9);
      } else if (sk.kind === 'buffAll') {
        var team = aliveOf(actor.side);
        for (i = 0; i < team.length; i++) {
          addStatus(team[i], sk.status, sk.status === 'guard' ? 1 : 2);
          pushResult(team[i], statusData(sk.status).icon, statusData(sk.status).color, '');
        }
        sfx('guard', 0.9);
      }
      if (actor.side === 'party') advanceTutorial(3, TUTORIAL[4]);
    } else if (action.type === 'guard') {
      addStatus(actor, 'guard', 2);
      pushResult(actor, '◈ GUARD', CSS.mint, '');
      actor.anim = 'guard'; actor.animT = 0.3;
      sfx('guard', 0.8);
    } else if (action.type === 'item') {
      var it = itemData(action.item);
      if (!state.items[action.item]) { queueToast('None left.', 0.9, CSS.rose); return; }
      state.items[action.item]--;
      actor.anim = 'act'; actor.animT = 0.3;
      if (it.kind === 'heal') { var lo = lowestAlly('party'); if (lo) healUnit(lo, it.power); sfx('heal', 0.9); }
      else if (it.kind === 'healAll') { var ps = aliveOf('party'); for (i = 0; i < ps.length; i++) healUnit(ps[i], it.power); sfx('heal', 0.9); }
      else if (it.kind === 'cleanse') { var pc = aliveOf('party'); for (i = 0; i < pc.length; i++) { clearHarm(pc[i]); addStatus(pc[i], 'shield', 2); } sfx('guard', 0.9); }
      else if (it.kind === 'burn') { var bt = reachableFoes(true)[clamp(c.focusFoe, 0, 9)] || aliveOf('foe')[0]; if (bt) { addStatus(bt, 'burn', 3); damageUnit(bt, 14, CSS.ember, null, '✦'); } sfx('art', 0.9); }
    } else if (action.type === 'bond') {
      tryBond(actor);
      return;
    }
    actor.nextAt += 1000 / effSpeed(actor);
    c.phase = 'resolve';
    c.timer = (0.55 + Math.min(0.4, c.resolveQueue.length * 0.09)) / state.speed;
  }

  function pickPartyTarget() {
    var front = [], back = [];
    var p = aliveOf('party');
    for (var i = 0; i < p.length; i++) (p[i].row === 'front' ? front : back).push(p[i]);
    var pool = front.length ? front : back;
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function lowestAlly(side) {
    var a = aliveOf(side);
    if (!a.length) return null;
    var best = a[0];
    for (var i = 1; i < a.length; i++) if (a[i].hp / a[i].maxHp < best.hp / best.maxHp) best = a[i];
    return best;
  }

  function bondOdds() {
    var c = state.combat;
    if (!c) return 0;
    var t = null;
    var f = aliveOf('foe');
    for (var i = 0; i < f.length; i++) if (f[i].bondId) t = f[i];
    if (!t) return 0;
    var weakened = 1 - t.hp / t.maxHp;
    return clamp(0.06 + weakened * 0.72 + companyBonus().bond, 0.05, 0.94);
  }
  function bondTarget() {
    var f = aliveOf('foe');
    for (var i = 0; i < f.length; i++) if (f[i].bondId) return f[i];
    return null;
  }

  function tryBond(actor) {
    var c = state.combat;
    var t = bondTarget();
    if (!t) {
      queueToast('Nothing here will bond.', 0.9, CSS.dim);
      c.phase = 'choose';
      return;
    }
    if (t.hp / t.maxHp > 0.82) {
      queueToast('Too lively. Weaken it first.', 1.0, CSS.rose);
      sfx('back');
      actor.nextAt += 1000 / effSpeed(actor);
      c.phase = 'resolve'; c.timer = 0.4 / state.speed;
      return;
    }
    var odds = bondOdds();
    c.bondTried++;
    if (Math.random() < odds) {
      t.alive = false; t.hp = 0;
      state.roster[t.bondId].recruited = true;
      state.bonded++;
      recomputeStats(false);
      var bs = memberStats(t.bondId);
      state.roster[t.bondId].hp = bs.maxHp;
      state.roster[t.bondId].sp = bs.maxSp;
      state.score += 140;
      pushResult(t, 'BONDED', CSS.gold, '');
      queueToast(t.name + ' joins the company.', 1.2, CSS.gold);
      sfx('bond');
      if (kit.juice.enabled) kit.juice.shake(6, 200);
    } else {
      pushResult(t, 'SLIPPED', CSS.rose, '');
      queueToast(Math.round(odds * 100) + ' percent was not enough.', 1.0, CSS.rose);
      sfx('back');
    }
    actor.nextAt += 1000 / effSpeed(actor);
    c.phase = 'resolve';
    c.timer = 0.6 / state.speed;
  }

  function enemyAct(actor) {
    var sig = actor.sig;
    var sk = sig ? skillData(sig) : null;
    var useSkill = sk && actor.sp >= sk.sp && Math.random() < (actor.boss ? 0.55 : 0.3);
    if (useSkill) performAction(actor, { type: 'skill', skill: sig });
    else performAction(actor, { type: 'attack' });
  }

  function autoAction(actor) {
    var s = memberStats(actor.ref);
    var order = s.order;
    var skills = s.skills;
    var i;
    var lowAlly = lowestAlly('party');
    var lowRatio = lowAlly ? lowAlly.hp / lowAlly.maxHp : 1;
    if (order === 'support' && lowRatio < 0.7) {
      for (i = 0; i < skills.length; i++) {
        var hs = skillData(skills[i]);
        if ((hs.kind === 'heal' || hs.kind === 'healAll') && actor.sp >= hs.sp) return { type: 'skill', skill: skills[i] };
      }
      if (state.items.tonic > 0) return { type: 'item', item: 'tonic' };
    }
    if (order === 'guard' && lowRatio < 0.4) {
      for (i = 0; i < skills.length; i++) {
        var gs = skillData(skills[i]);
        if (gs.kind === 'buffAll' && actor.sp >= gs.sp) return { type: 'skill', skill: skills[i] };
      }
      return { type: 'guard' };
    }
    if (order === 'focus' || order === 'assault') {
      var bestKey = null, bestPower = 0;
      for (i = 0; i < skills.length; i++) {
        var ds = skillData(skills[i]);
        if (ds.kind !== 'hit' && ds.kind !== 'hit2' && ds.kind !== 'hitAll') continue;
        if (actor.sp < ds.sp) continue;
        var p = ds.power * (ds.kind === 'hitAll' ? 1.6 : ds.kind === 'hit2' ? 1.8 : 1);
        if (p > bestPower) { bestPower = p; bestKey = skills[i]; }
      }
      var threshold = order === 'focus' ? 0 : actor.maxSp * 0.4;
      if (bestKey && actor.sp >= threshold) return { type: 'skill', skill: bestKey };
    }
    return { type: 'attack' };
  }

  function winBattle() {
    var c = state.combat;
    if (!c || c.phase === 'won' || c.phase === 'lost') return;
    c.phase = 'won';
    c.timer = 0;
    var foes = foeList();
    var xp = 0, coin = 0, i;
    for (i = 0; i < foes.length; i++) { xp += foes[i].xp; coin += foes[i].coin; }
    var rd = regionData(state.region);
    var drops = {};
    var dropN = 1 + (c.kind === 'boss' ? 2 : Math.random() < 0.4 ? 1 : 0);
    for (i = 0; i < dropN; i++) {
      var mk = rd.mats[Math.floor(Math.random() * rd.mats.length)];
      drops[mk] = (drops[mk] || 0) + 1;
    }
    if (c.kind === 'arena') {
      var ar = arenaData(c.opts.rung);
      coin += ar.coin;
      drops[ar.mat] = (drops[ar.mat] || 0) + ar.matN;
      if (c.opts.rung > state.arenaRung) {
        state.arenaRung = c.opts.rung;
        state.best.arena = Math.max(state.best.arena, state.arenaRung);
      }
    }
    state.coin += coin;
    for (var k in drops) state.mats[k] = (state.mats[k] || 0) + drops[k];
    state.score += (c.kind === 'boss' ? 450 : c.kind === 'arena' ? 180 : 90);
    var ranked = [];
    for (i = 0; i < state.party.length; i++) {
      var id = state.party[i];
      var m = state.roster[id];
      m.xp += xp;
      var guard = 0;
      while (m.rank < 20 && m.xp >= rankNeed(m.rank) && guard++ < 20) { m.xp -= rankNeed(m.rank); m.rank++; ranked.push(blueprint(id).name); }
    }
    /* write live combat HP back to the roster */
    var pl = partyList();
    for (i = 0; i < pl.length; i++) {
      var rm = state.roster[pl[i].ref];
      if (rm) { rm.hp = Math.max(pl[i].alive ? 1 : 0, Math.round(pl[i].hp)); rm.sp = Math.round(pl[i].sp); }
    }
    var rest = companyBonus().rest;
    if (rest) partyHeal(rest);
    recomputeStats(false);
    c.rewards = { xp: xp, coin: coin, drops: drops, ranked: ranked };
    if (c.kind === 'wild' && state.activeQuest) {
      var q = questData(state.activeQuest);
      if (q.type === 'purge') {
        state.questCount++;
        if (state.questCount >= q.count && state.field) { state.field.gateOpen = true; }
      }
    }
    if (ranked.length) sfx('rank'); else sfx('victory');
    showBanner('ROAD CLEARED', coin + ' coin  ·  ' + xp + ' rank point' + (xp === 1 ? '' : 's'), CSS.mint, 'manual');
    state.best.score = Math.max(state.best.score, Math.round(state.score));
    persist();
  }

  function loseBattle() {
    var c = state.combat;
    if (!c || c.phase === 'lost') return;
    c.phase = 'lost';
    c.timer = 0;
    sfx('defeat');
    kit.audio.music('town', 900);
    showBanner('THE COMPANY FALLS', 'A wipe costs a moment, not the road', CSS.red, 'manual');
    state.best.score = Math.max(state.best.score, Math.round(state.score));
    persist();
  }

  function leaveBattle(retry) {
    var c = state.combat;
    if (!c) return;
    var kind = c.kind, opts = c.opts;
    if (c.phase === 'lost') {
      for (var i = 0; i < state.party.length; i++) {
        var id = state.party[i];
        var s = memberStats(id);
        state.roster[id].hp = Math.max(1, Math.round(s.maxHp * 0.72));
        state.roster[id].sp = Math.round(s.maxSp * 0.5);
      }
      recomputeStats(false);
      state.combat = null;
      if (retry) { startBattle(kind, opts); return; }
      state.field = null;
      state.mode = 'hub'; state.stage = 'hub';
      state.questCount = 0;
      kit.audio.music('town', 700);
      persist();
      return;
    }
    state.combat = null;
    if (kind === 'arena') {
      state.mode = 'hub'; state.submenu = 'arena'; state.stage = 'arena';
      kit.audio.music('town', 700);
    } else if (kind === 'boss') {
      var q = state.activeQuest ? questData(state.activeQuest) : null;
      state.field = null;
      state.mode = 'hub'; state.stage = 'hub';
      kit.audio.music('town', 700);
      if (q && q.type === 'boss') completeQuest(q);
    } else {
      state.mode = state.field ? 'field' : 'hub';
      state.stage = state.field ? 'field:' + state.region : 'hub';
      kit.audio.music(state.field ? regionData(state.region).music : 'town', 700);
      if (state.field) { state.field.meter = 0; state.field.pity = 0; }
      if (state.activeQuest) {
        var qq = questData(state.activeQuest);
        if (qq.type === 'purge' && state.questCount >= qq.count) queueToast('Road is clear. Take the gate home.', 1.1, CSS.mint);
      }
    }
    persist();
  }

  /* --------------------------------------------------------- craft, ranks */

  function canCraft(id) {
    var g = gearData(id);
    if (state.coin < g.coin) return false;
    for (var k in g.cost) if ((state.mats[k] || 0) < g.cost[k]) return false;
    return true;
  }
  function craft(id) {
    if (!canCraft(id)) { queueToast('Not enough on hand.', 0.9, CSS.rose); sfx('back'); return; }
    var g = gearData(id);
    state.coin -= g.coin;
    for (var k in g.cost) state.mats[k] -= g.cost[k];
    state.gear[id] = (state.gear[id] || 0) + 1;
    state.crafted++;
    state.score += 30;
    sfx('craft');
    queueToast(g.name + ' forged.', 1.1, CSS.gold);
    advanceTutorial(6, null);
    persist();
  }
  function equipGear(memberId, gearId) {
    var m = state.roster[memberId];
    if (!m || !state.gear[gearId]) return;
    var g = gearData(gearId);
    for (var id in state.roster) {
      if (id === memberId) continue;
      if (state.roster[id].equip[g.slot] === gearId) state.roster[id].equip[g.slot] = null;
    }
    m.equip[g.slot] = m.equip[g.slot] === gearId ? null : gearId;
    recomputeStats(false);
    sfx('ui');
    persist();
  }
  function canClassChange(id) {
    var m = state.roster[id];
    if (!m || state.hubTier < 3) return false;
    var line = CLASS_LINE[blueprint(id).arch];
    var tier = line.indexOf(m.cls) + 1;
    if (tier >= 3) return false;
    return m.rank >= (tier === 1 ? 5 : 10);
  }
  function classChange(id) {
    if (!canClassChange(id)) { queueToast('Rank is not high enough yet.', 1.0, CSS.rose); sfx('back'); return; }
    var m = state.roster[id];
    var line = CLASS_LINE[blueprint(id).arch];
    var tier = line.indexOf(m.cls) + 1;
    m.cls = line[tier];
    recomputeStats(false);
    var s = memberStats(id);
    m.hp = s.maxHp; m.sp = s.maxSp;
    state.score += 80;
    sfx('rank');
    showBanner('CLASS CHANGE', blueprint(id).name + ' is now ' + classData(m.cls).name, CSS.violet, 'timed');
    persist();
  }
  function setOrder(id, order) {
    var m = state.roster[id];
    if (!m) return;
    m.order = order;
    sfx('ui');
    persist();
  }
  function setPartySlot(slot, memberId) {
    if (slot <= 0) return;
    if (state.party.indexOf(memberId) >= 0) {
      var cur = state.party.indexOf(memberId);
      if (cur === slot) return;
      state.party[cur] = state.party[slot];
    }
    state.party[slot] = memberId;
    recomputeStats(false);
    sfx('ui');
    persist();
  }
  function toggleRow(memberId) {
    var m = state.roster[memberId];
    if (!m) return;
    m.row = m.row === 'front' ? 'back' : 'front';
    if (state.combat) {
      var u = combatUnits();
      for (var i = 0; i < u.length; i++) if (u[i].ref === memberId) u[i].row = m.row;
    }
    sfx('ui');
    advanceTutorial(4, TUTORIAL[5]);
    persist();
  }

  function startArena(rung) {
    if (rung > state.arenaRung + 1) { queueToast('Win the rung below first.', 1.0, CSS.rose); sfx('back'); return; }
    state.submenu = null;
    startBattle('arena', { rung: rung });
  }

  function newJourney() {
    var keepBest = state.best;
    var fresh = makeState();
    for (var k in fresh) if (k !== 'best') state[k] = fresh[k];
    state.best = keepBest;
    recomputeStats(true);
    refreshOffers();
    clearTransient();
    state.mode = 'hub'; state.stage = 'hub';
    kit.audio.music('town', 700);
    persist();
  }

  /* ------------------------------------------------------------- layout */

  var UI = {
    hud: { y: 6, h: 62 },
    rail: { y: 76, h: 40 },
    foe: { y: 122, h: 200 },
    field: { y: 330, h: 118 },
    cards: { x0: 6, y: 454, w: 90, h: 112, gap: 6 },
    strip: { y: 574, h: 28 },
    cmd: { x0: 10, y0: 610, w: 118, h: 88, gx: 8, gy: 10 },
    list: { x: 12, y: 470, w: 366, rowH: 54 },
    stick: { x: 82, y: 738, r: 66 },
    act: { x: 314, y: 738, r: 48 },
    panel: { x: 12, y: 132, w: 366, rowH: 62 }
  };
  var CMD = [
    { id: 'attack', label: 'ATTACK', icon: '⚔', color: CSS.gold },
    { id: 'skill', label: 'SKILL', icon: '✦', color: CSS.rose },
    { id: 'item', label: 'ITEM', icon: '◍', color: CSS.mint },
    { id: 'guard', label: 'GUARD', icon: '◈', color: CSS.sky },
    { id: 'bond', label: 'BOND', icon: '◌', color: CSS.violet },
    { id: 'swap', label: 'SWAP', icon: '⇅', color: CSS.stone }
  ];
  var HUB_ACTIONS = [
    { id: 'quests', label: 'QUESTS', icon: '❋', tier: 0 },
    { id: 'roster', label: 'COMPANY', icon: '◆', tier: 0 },
    { id: 'forge', label: 'FORGE', icon: '✦', tier: 1 },
    { id: 'arena', label: 'ARENA', icon: '✵', tier: 2 },
    { id: 'academy', label: 'ACADEMY', icon: '✧', tier: 3 },
    { id: 'depart', label: 'DEPART', icon: '➤', tier: 0 }
  ];

  function cmdRect(i) {
    var c = UI.cmd;
    return { x: c.x0 + (i % 3) * (c.w + c.gx), y: c.y0 + Math.floor(i / 3) * (c.h + c.gy), w: c.w, h: c.h };
  }
  function cardRect(i) {
    var c = UI.cards;
    return { x: c.x0 + i * (c.w + c.gap), y: c.y, w: c.w, h: c.h };
  }
  /* Stage placement runs several times per frame. The row buckets and the
   * result object are allocated once and reused; callers read them at once. */
  var rowFront = [];
  var rowBack = [];
  var posOut = { x: 0, y: 0 };
  function stagePos(unit, list, spreadMax, spreadSpan, frontY, backY) {
    rowFront.length = 0; rowBack.length = 0;
    for (var i = 0; i < list.length; i++) (list[i].row === 'front' ? rowFront : rowBack).push(list[i]);
    var arr = unit.row === 'front' ? rowFront : rowBack;
    var k = arr.indexOf(unit);
    if (k < 0) k = 0;
    var n = Math.max(1, arr.length);
    var spread = Math.min(spreadMax, spreadSpan / n);
    posOut.x = W / 2 + (k - (n - 1) / 2) * spread;
    posOut.y = unit.row === 'front' ? frontY : backY;
    return posOut;
  }
  var foeScratch = [];
  var partyScratch = [];
  function foePos(unit) {
    var u = combatUnits();
    foeScratch.length = 0;
    for (var i = 0; i < u.length; i++) if (u[i].side === 'foe') foeScratch.push(u[i]);
    return stagePos(unit, foeScratch, 104, 300, UI.foe.y + 146, UI.foe.y + 68);
  }
  function partyPos(unit) {
    var u = combatUnits();
    partyScratch.length = 0;
    for (var i = 0; i < u.length; i++) if (u[i].side === 'party') partyScratch.push(u[i]);
    return stagePos(unit, partyScratch, 96, 330, UI.field.y + 84, UI.field.y + 30);
  }

  function activeSkills() {
    var c = state.combat;
    if (!c) return [];
    var a = unitByUid(c.activeUid);
    if (!a || a.side !== 'party') return [];
    return a.skills || [];
  }

  /* --------------------------------------------------------- hit testing */

  function inRect(x, y, r) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }

  function zoneAt(x, y) {
    if (state.pauseHint) {
      if (inRect(x, y, { x: 65, y: 380, w: 260, h: 56 })) return 'pause:resume';
      if (inRect(x, y, { x: 65, y: 448, w: 260, h: 56 })) return 'pause:settings';
      if (inRect(x, y, { x: 65, y: 516, w: 260, h: 56 })) return 'pause:title';
      return null;
    }
    if (state.mode === 'title') {
      if (inRect(x, y, { x: 55, y: 520, w: 280, h: 62 })) return 'title:continue';
      if (inRect(x, y, { x: 55, y: 592, w: 280, h: 62 })) return 'title:new';
      if (inRect(x, y, { x: 55, y: 664, w: 280, h: 56 })) return 'title:settings';
      return null;
    }
    if (state.mode === 'result') return 'result:ok';
    if (state.banner && state.banner.behavior === 'manual') return 'banner:ok';
    if (inRect(x, y, { x: 330, y: 8, w: 52, h: 46 })) return 'pause:open';

    if (state.mode === 'dialogue') {
      var d = state.dialogue;
      if (d && d.choices) {
        for (var ci = 0; ci < d.choices.length; ci++) {
          if (inRect(x, y, { x: 24, y: 540 + ci * 68, w: 342, h: 58 })) return 'riddle:' + ci;
        }
        return null;
      }
      return 'dialogue:next';
    }

    if (state.mode === 'hub') {
      if (state.submenu) {
        if (inRect(x, y, { x: 12, y: 776, w: 120, h: 56 })) return 'panel:back';
        if (inRect(x, y, { x: 258, y: 776, w: 120, h: 56 })) return 'panel:page';
        var rows = panelRowCount();
        for (var r = 0; r < rows; r++) {
          if (inRect(x, y, { x: UI.panel.x, y: UI.panel.y + r * UI.panel.rowH, w: UI.panel.w, h: UI.panel.rowH - 6 })) return 'panel:row:' + r;
        }
        if (state.submenu === 'member') {
          for (var a = 0; a < 6; a++) {
            if (inRect(x, y, { x: 12 + (a % 2) * 186, y: 560 + Math.floor(a / 2) * 66, w: 178, h: 58 })) return 'member:' + a;
          }
        }
        return null;
      }
      for (var i = 0; i < HUB_ACTIONS.length; i++) {
        var rr = cmdRect(i);
        if (inRect(x, y, rr)) return 'hub:' + HUB_ACTIONS[i].id;
      }
      return null;
    }

    if (state.mode === 'field') {
      if (Math.hypot(x - UI.act.x, y - UI.act.y) <= UI.act.r + 8) return 'field:act';
      if (inRect(x, y, { x: 240, y: 8, w: 84, h: 46 })) return 'field:quest';
      /* The pad floats, but only inside the left thumb zone. A tap in the play
       * area must never yank the company toward a stick anchored off screen. */
      if (Math.hypot(x - UI.stick.x, y - UI.stick.y) <= UI.stick.r + 26) return 'stick';
      if (x <= 244 && y >= 580) return 'stick';
      return null;
    }

    if (state.mode === 'battle') {
      var c = state.combat;
      if (!c) return null;
      if (inRect(x, y, { x: 246, y: 8, w: 78, h: 46 })) return 'battle:auto';
      if (c.phase === 'won' || c.phase === 'lost') return 'battle:end';
      if (c.phase === 'resolve' || c.phase === 'enemy' || c.phase === 'intro') return 'battle:skip';
      if (c.ui === 'skill' || c.ui === 'item') {
        var list = c.ui === 'skill' ? activeSkills() : ITEM_KEYS;
        for (var li = 0; li < list.length; li++) {
          if (inRect(x, y, { x: UI.list.x, y: UI.list.y + li * UI.list.rowH, w: UI.list.w, h: UI.list.rowH - 6 })) return 'list:' + li;
        }
        if (inRect(x, y, { x: UI.list.x, y: UI.list.y + list.length * UI.list.rowH, w: UI.list.w, h: 52 })) return 'list:back';
        return null;
      }
      for (var ki = 0; ki < CMD.length; ki++) {
        if (inRect(x, y, cmdRect(ki))) return 'cmd:' + CMD[ki].id;
      }
      for (var pi = 0; pi < 4; pi++) {
        if (inRect(x, y, cardRect(pi))) return 'card:' + pi;
      }
      var foes = foeList();
      for (var fi = 0; fi < foes.length; fi++) {
        if (!foes[fi].alive) continue;
        var p = foePos(foes[fi]);
        if (Math.abs(x - p.x) < 44 && Math.abs(y - p.y) < 48) return 'foe:' + fi;
      }
      return null;
    }
    return null;
  }

  function panelRowCount() {
    if (state.submenu === 'quests') return Math.min(4, state.offered.length + (state.activeQuest ? 1 : 0));
    if (state.submenu === 'roster' || state.submenu === 'academy') return 6;
    if (state.submenu === 'forge') return 6;
    if (state.submenu === 'arena') return 5;
    if (state.submenu === 'member') return 3;
    return 0;
  }

  var panelPage = 0;
  var selectedMember = 'you';

  function panelRows() {
    var out = [];
    var i;
    if (state.submenu === 'quests') {
      if (state.activeQuest) out.push({ kind: 'active', id: state.activeQuest });
      for (i = 0; i < state.offered.length && out.length < 4; i++) out.push({ kind: 'quest', id: state.offered[i] });
    } else if (state.submenu === 'roster' || state.submenu === 'academy') {
      var ids = [];
      for (i = 0; i < ROSTER_BLUEPRINT.length; i++) {
        var id = ROSTER_BLUEPRINT[i].id;
        if (state.submenu === 'academy' && state.party.indexOf(id) < 0) continue;
        if (state.roster[id].recruited) ids.push(id);
      }
      var start = panelPage * 6;
      for (i = start; i < ids.length && out.length < 6; i++) out.push({ kind: 'member', id: ids[i] });
    } else if (state.submenu === 'forge') {
      var s2 = panelPage * 6;
      for (i = s2; i < GEAR_KEYS.length && out.length < 6; i++) out.push({ kind: 'gear', id: GEAR_KEYS[i] });
    } else if (state.submenu === 'arena') {
      var s3 = panelPage * 5;
      for (i = s3; i < ARENA.length && out.length < 5; i++) out.push({ kind: 'rung', id: i + 1 });
    } else if (state.submenu === 'member') {
      out.push({ kind: 'stat', id: 'a' }); out.push({ kind: 'stat', id: 'b' }); out.push({ kind: 'stat', id: 'c' });
    }
    return out;
  }
  function panelPages() {
    if (state.submenu === 'roster' || state.submenu === 'academy') {
      var n = 0;
      for (var i = 0; i < ROSTER_BLUEPRINT.length; i++) {
        var id = ROSTER_BLUEPRINT[i].id;
        if (state.submenu === 'academy' && state.party.indexOf(id) < 0) continue;
        if (state.roster[id].recruited) n++;
      }
      return Math.max(1, Math.ceil(n / 6));
    }
    if (state.submenu === 'forge') return 2;
    if (state.submenu === 'arena') return 3;
    return 1;
  }

  /* ------------------------------------------------------------- actions */

  function cycleEquip(memberId, slot) {
    var owned = [];
    for (var i = 0; i < GEAR_KEYS.length; i++) {
      var g = GEAR[GEAR_KEYS[i]];
      if (g.slot === slot && state.gear[GEAR_KEYS[i]]) owned.push(GEAR_KEYS[i]);
    }
    if (!owned.length) { queueToast('Nothing forged for that slot.', 0.9, CSS.dim); sfx('back'); return; }
    var m = state.roster[memberId];
    var cur = owned.indexOf(m.equip[slot]);
    var next = cur + 1 >= owned.length ? null : owned[cur + 1];
    if (cur < 0) next = owned[0];
    for (var id in state.roster) {
      if (id === memberId) continue;
      if (next && state.roster[id].equip[slot] === next) state.roster[id].equip[slot] = null;
    }
    m.equip[slot] = next;
    recomputeStats(false);
    sfx('ui');
    persist();
  }

  function doZone(zone) {
    if (!zone) return;
    var parts = zone.split(':');
    var head = parts[0];
    var i;
    if (head === 'pause') {
      if (parts[1] === 'open') { kit.pause('menu'); sfx('ui'); return; }
      if (parts[1] === 'resume') { kit.resume('menu'); sfx('back'); return; }
      if (parts[1] === 'settings') { kit.openSettings([extraSettingsRow]); return; }
      if (parts[1] === 'title') { kit.resume('menu'); persist(); state.mode = 'title'; state.stage = 'title'; state.submenu = null; kit.audio.music('town', 600); sfx('back'); return; }
      return;
    }
    if (head === 'title') {
      if (parts[1] === 'continue') {
        state.mode = 'hub'; state.stage = 'hub'; kit.audio.music('town', 700); sfx('ui');
        if (!state.tutorialStep) showCoach('Take a quest from the board, then depart.');
        return;
      }
      if (parts[1] === 'new') { newJourney(); sfx('ui'); showCoach('Take a quest from the board, then depart.'); return; }
      if (parts[1] === 'settings') { kit.openSettings([extraSettingsRow]); return; }
      return;
    }
    if (head === 'result') { state.mode = 'title'; state.stage = 'title'; state.banner = null; sfx('ui'); return; }
    if (head === 'banner') {
      if (state.combat && (state.combat.phase === 'won' || state.combat.phase === 'lost')) { state.banner = null; leaveBattle(false); return; }
      state.banner = null;
      return;
    }
    if (head === 'dialogue') {
      var d = state.dialogue;
      if (d && d.reveal < d.body.length) { d.reveal = d.body.length; return; }
      closeDialogue();
      sfx('ui', 0.6);
      return;
    }
    if (head === 'riddle') { answerRiddle(parseInt(parts[1], 10)); return; }
    if (head === 'hub') {
      var id = parts[1];
      if (id === 'depart') {
        var q = state.activeQuest ? questData(state.activeQuest) : null;
        enterField(q ? q.region : REGION_KEYS[state.act - 1]);
        sfx('ui');
        return;
      }
      var def = null;
      for (i = 0; i < HUB_ACTIONS.length; i++) if (HUB_ACTIONS[i].id === id) def = HUB_ACTIONS[i];
      if (def && state.hubTier < def.tier) {
        queueToast('Opens at ' + HUB_TIERS[def.tier].name + '.', 1.1, CSS.dim);
        sfx('back');
        return;
      }
      state.submenu = id;
      state.stage = id;
      panelPage = 0;
      sfx('ui');
      return;
    }
    if (head === 'panel') {
      if (parts[1] === 'back') {
        if (state.submenu === 'member') { state.submenu = 'roster'; state.stage = 'roster'; }
        else { state.submenu = null; state.stage = 'hub'; }
        sfx('back');
        return;
      }
      if (parts[1] === 'page') { panelPage = (panelPage + 1) % panelPages(); sfx('ui', 0.7); return; }
      if (parts[1] === 'row') {
        var rows = panelRows();
        var row = rows[parseInt(parts[2], 10)];
        if (!row) return;
        if (row.kind === 'quest') { acceptQuest(row.id); return; }
        if (row.kind === 'active') { state.submenu = null; state.stage = 'hub'; enterField(questData(row.id).region); return; }
        if (row.kind === 'member') { selectedMember = row.id; state.submenu = 'member'; state.stage = 'member'; sfx('ui'); return; }
        if (row.kind === 'gear') { craft(row.id); return; }
        if (row.kind === 'rung') { startArena(row.id); return; }
        return;
      }
      return;
    }
    if (head === 'member') {
      var mi = parseInt(parts[1], 10);
      var mid = selectedMember;
      if (mi === 0) { cycleEquip(mid, 'weapon'); return; }
      if (mi === 1) { cycleEquip(mid, 'armor'); return; }
      if (mi === 2) { cycleEquip(mid, 'charm'); return; }
      if (mi === 3) { toggleRow(mid); return; }
      if (mi === 4) {
        var orders = ['assault', 'support', 'guard', 'focus'];
        var cur = orders.indexOf(state.roster[mid].order);
        setOrder(mid, orders[(cur + 1) % orders.length]);
        return;
      }
      if (mi === 5) {
        if (state.party.indexOf(mid) < 0) {
          setPartySlot(3, mid);
          queueToast(blueprint(mid).name + ' walks with you.', 1.0, CSS.gold);
        } else classChange(mid);
        return;
      }
      return;
    }
    if (head === 'field') {
      if (parts[1] === 'act') { fieldInteract(); return; }
      if (parts[1] === 'quest') { state.mode = 'hub'; state.submenu = 'quests'; state.stage = 'quests'; sfx('ui'); return; }
      return;
    }
    if (head === 'battle') {
      var c = state.combat;
      if (!c) return;
      if (parts[1] === 'auto') { state.auto = !state.auto; c.autoDelay = state.auto ? 0.3 : 0; queueToast(state.auto ? 'Auto battle on.' : 'You have the reins.', 0.9, state.auto ? CSS.mint : CSS.gold); sfx('ui'); return; }
      if (parts[1] === 'skip') { c.timer = Math.min(c.timer, 0.02); return; }
      if (parts[1] === 'end') { state.banner = null; leaveBattle(false); return; }
      return;
    }
    if (head === 'cmd') { commandTap(parts[1]); return; }
    if (head === 'card') {
      var pl = partyList();
      var u = pl[parseInt(parts[1], 10)];
      if (!u) return;
      state.combat.focusAlly = parseInt(parts[1], 10);
      sfx('ui', 0.6);
      return;
    }
    if (head === 'foe') {
      var fs = foeList();
      var fu = fs[parseInt(parts[1], 10)];
      if (!fu || !fu.alive) return;
      var reach = reachableFoes(true);
      state.combat.focusFoe = clamp(reach.indexOf(fu), 0, reach.length - 1);
      sfx('ui', 0.6);
      return;
    }
    if (head === 'list') {
      var cc = state.combat;
      if (!cc) return;
      if (parts[1] === 'back') { cc.ui = 'root'; sfx('back'); return; }
      var idx = parseInt(parts[1], 10);
      var actor = unitByUid(cc.activeUid);
      if (!actor) return;
      if (cc.ui === 'skill') {
        var sk = activeSkills()[idx];
        if (!sk) return;
        cc.ui = 'root';
        seizeControl();
        performAction(actor, { type: 'skill', skill: sk });
      } else {
        var it = ITEM_KEYS[idx];
        if (!it) return;
        cc.ui = 'root';
        seizeControl();
        performAction(actor, { type: 'item', item: it });
      }
      return;
    }
  }

  function seizeControl() {
    var c = state.combat;
    if (c) c.autoDelay = 0;
  }

  function commandTap(id) {
    var c = state.combat;
    if (!c || c.phase !== 'choose') return;
    var actor = unitByUid(c.activeUid);
    if (!actor || actor.side !== 'party') return;
    if (state.auto) { state.auto = false; queueToast('You have the reins.', 0.9, CSS.gold); }
    seizeControl();
    if (id === 'attack') { performAction(actor, { type: 'attack' }); advanceTutorial(2, TUTORIAL[3]); return; }
    if (id === 'guard') { performAction(actor, { type: 'guard' }); return; }
    if (id === 'bond') { performAction(actor, { type: 'bond' }); return; }
    if (id === 'skill') { c.ui = 'skill'; sfx('ui', 0.7); return; }
    if (id === 'item') { c.ui = 'item'; sfx('ui', 0.7); return; }
    if (id === 'swap') {
      var pl = partyList();
      var target = pl[clamp(c.focusAlly, 0, pl.length - 1)] || actor;
      toggleRow(target.ref);
      queueToast(target.name + ' moves ' + state.roster[target.ref].row + '.', 0.9, CSS.stone);
      return;
    }
  }

  /* ------------------------------------------------------------ sim step */

  function stepField(dt) {
    var f = state.field;
    if (!f) return;
    var ax = 0, ay = 0;
    if (stick.active) { ax = stick.dx; ay = stick.dy; }
    if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) ax -= 1;
    if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) ax += 1;
    if (kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW')) ay -= 1;
    if (kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS')) ay += 1;
    var mag = Math.hypot(ax, ay);
    if (mag > 1) { ax /= mag; ay /= mag; mag = 1; }
    var speed = 126;
    var nx = f.px + ax * speed * dt;
    var ny = f.py + ay * speed * dt;
    if (walkable(f.map, nx, f.py) && walkable(f.map, nx + (ax > 0 ? 8 : -8), f.py)) f.px = nx;
    if (walkable(f.map, f.px, ny) && walkable(f.map, f.px, ny + (ay > 0 ? 8 : -8))) f.py = ny;
    f.px = clamp(f.px, TILE, (MAP_W - 1) * TILE);
    f.py = clamp(f.py, TILE, (MAP_H - 1) * TILE);
    if (mag > 0.12) {
      f.dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
      f.anim = 'walk';
      f.walkClock += dt * (4.4 + mag * 2);
      f.stepClock += dt;
      if (f.stepClock > 0.36) { f.stepClock = 0; sfx('step', 0.32); }
      if (state.tutorialStep === 0) advanceTutorial(0, TUTORIAL[1]);
    } else {
      f.anim = 'idle';
      f.walkClock += dt * 1.6;
    }
    GGKit.boundedPush(f.trail, { x: f.px, y: f.py }, 44);
    if (f.follower) {
      var t = f.trail[Math.max(0, f.trail.length - 30)];
      f.follower.x += (t.x - f.follower.x) * Math.min(1, dt * 5);
      f.follower.y += (t.y - f.follower.y) * Math.min(1, dt * 5);
    }
    f.camX = clamp(f.px - W / 2, 0, MAP_W * TILE - W);
    f.camY = clamp(f.py - H * 0.46, 0, MAP_H * TILE - H);
    f.pity = Math.max(0, f.pity - dt);
    if (mag > 0.2 && tileAt(f.map, f.px, f.py) === 2 && f.pity <= 0) {
      var rate = 0.42 + (state.act - 1) * 0.05;
      if (f.escorting) rate *= 1.4;
      var q = state.activeQuest ? questData(state.activeQuest) : null;
      if (q && q.type === 'purge') rate *= 1.35;
      f.meter += dt * rate * (0.7 + mag * 0.6);
      if (f.meter >= 1) {
        f.meter = 0;
        f.pity = 1.6;
        startBattle('wild', {});
        return;
      }
    } else if (mag <= 0.2) {
      f.meter = Math.max(0, f.meter - dt * 0.1);
    }
    if (state.tutorialStep === 1 && tileAt(f.map, f.px, f.py) === 2) showCoach(TUTORIAL[1]);
  }

  function stepCombat(dt) {
    var c = state.combat;
    if (!c) return;
    var u = c.units;
    for (var i = 0; i < u.length; i++) {
      if (u[i].flash > 0) u[i].flash -= dt;
      if (u[i].shakeT > 0) u[i].shakeT -= dt;
      if (u[i].popT > 0) u[i].popT -= dt;
      if (u[i].animT > 0) { u[i].animT -= dt; if (u[i].animT <= 0 && u[i].alive) u[i].anim = 'idle'; }
    }
    if (c.phase === 'won' || c.phase === 'lost') return;
    c.timer -= dt;
    if (c.phase === 'intro') {
      if (c.timer <= 0) advanceTurn();
      return;
    }
    if (c.phase === 'resolve') {
      if (c.timer <= 0) {
        if (!aliveOf('foe').length) { winBattle(); return; }
        if (!aliveOf('party').length) { loseBattle(); return; }
        advanceTurn();
      }
      return;
    }
    if (c.phase === 'enemy') {
      if (c.timer <= 0) {
        var actor = unitByUid(c.activeUid);
        if (!actor || !actor.alive) { advanceTurn(); return; }
        enemyAct(actor);
      }
      return;
    }
    if (c.phase === 'choose') {
      if (state.auto && c.ui === 'root') {
        c.autoDelay -= dt;
        if (c.autoDelay <= 0) {
          var a = unitByUid(c.activeUid);
          if (a && a.alive) performAction(a, autoAction(a));
        }
      }
      return;
    }
  }

  function stepSim(dt) {
    state.elapsed += dt;
    updateTransient(dt);
    updateBanner(dt);
    if (state.mode === 'field') stepField(dt);
    else if (state.mode === 'battle') stepCombat(dt);
    else if (state.mode === 'dialogue' && state.dialogue) {
      var d = state.dialogue;
      if (d.reveal < d.body.length) d.reveal = Math.min(d.body.length, d.reveal + dt * 58);
    }
    state.progress = questsDoneCount() / 30;
    if (state.mode === 'battle' && state.combat) {
      var alive = aliveOf('party');
      var hp = 0, max = 0;
      for (var i = 0; i < alive.length; i++) { hp += alive[i].hp; max += alive[i].maxHp; }
      state.health = max > 0 ? clamp(hp / max, 0, 1) : 0;
    }
  }

  /* --------------------------------------------------------------- input */

  var stick = { active: false, id: -1, dx: 0, dy: 0, ox: UI.stick.x, oy: UI.stick.y, hx: UI.stick.x, hy: UI.stick.y };
  var claims = {};
  var keyEdges = {};
  function resetInputEdges() { claims = {}; keyEdges = {}; stick.active = false; stick.id = -1; stick.dx = 0; stick.dy = 0; }

  function toGame(clientX, clientY) {
    var canvas = app.canvas;
    if (!canvas) return { x: 0, y: 0 };
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return { x: 0, y: 0 };
    return { x: (clientX - r.left) / r.width * W, y: (clientY - r.top) / r.height * H };
  }

  function installInput() {
    /* Registered on WINDOW after GGKit init so the kit's own pointer bookkeeping
     * runs first. Every claim seeds kit.input.pointers when the kit skipped the
     * event (it ignores pointerdown while paused), so touch never dies. */
    window.addEventListener('pointerdown', function (e) {
      var p = kit.input.pointers.get(e.pointerId);
      if (!p) {
        p = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, downAt: performance.now(), zone: null };
        kit.input.pointers.set(e.pointerId, p);
      }
      var g = toGame(e.clientX, e.clientY);
      var zone = zoneAt(g.x, g.y);
      p.zone = zone;
      claims[e.pointerId] = zone;
      if (zone === 'stick' && !stick.active) {
        stick.active = true; stick.id = e.pointerId;
        stick.ox = clamp(g.x, 60, 200); stick.oy = clamp(g.y, 620, 800);
        stick.hx = stick.ox; stick.hy = stick.oy; stick.dx = 0; stick.dy = 0;
      }
    }, { passive: true });

    window.addEventListener('pointermove', function (e) {
      if (stick.active && stick.id === e.pointerId) {
        var g = toGame(e.clientX, e.clientY);
        var dx = g.x - stick.ox, dy = g.y - stick.oy;
        var d = Math.hypot(dx, dy);
        var max = UI.stick.r;
        if (d > max) { dx = dx / d * max; dy = dy / d * max; d = max; }
        stick.hx = stick.ox + dx; stick.hy = stick.oy + dy;
        var dead = 8;
        if (d < dead) { stick.dx = 0; stick.dy = 0; }
        else { var f = (d - dead) / (max - dead); stick.dx = dx / d * f; stick.dy = dy / d * f; }
      }
    }, { passive: true });

    function release(e) {
      if (stick.active && stick.id === e.pointerId) {
        stick.active = false; stick.id = -1; stick.dx = 0; stick.dy = 0;
        stick.hx = stick.ox; stick.hy = stick.oy;
      }
      var zone = claims[e.pointerId];
      delete claims[e.pointerId];
      if (!zone || zone === 'stick') return;
      var g = toGame(e.clientX, e.clientY);
      if (zoneAt(g.x, g.y) === zone) doZone(zone);
    }
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointercancel', function (e) {
      if (stick.active && stick.id === e.pointerId) { stick.active = false; stick.id = -1; stick.dx = 0; stick.dy = 0; }
      delete claims[e.pointerId];
    }, { passive: true });
    window.addEventListener('blur', resetInputEdges);

    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
      if (keyEdges[e.code]) return;
      keyEdges[e.code] = true;
      handleKey(e.code);
    });
    window.addEventListener('keyup', function (e) { keyEdges[e.code] = false; });
  }

  function handleKey(code) {
    if (state.pauseHint) {
      if (code === 'Escape' || code === 'KeyP' || code === 'Enter' || code === 'Space') doZone('pause:resume');
      return;
    }
    if (code === 'Escape' || code === 'KeyP') { if (state.mode !== 'title') doZone('pause:open'); return; }
    if (state.mode === 'title') {
      if (code === 'Enter' || code === 'Space') doZone('title:continue');
      if (code === 'KeyN') doZone('title:new');
      return;
    }
    if (state.mode === 'result') { doZone('result:ok'); return; }
    if (state.banner && state.banner.behavior === 'manual') { doZone('banner:ok'); return; }
    if (state.mode === 'dialogue') {
      var d = state.dialogue;
      if (d && d.choices) {
        if (code === 'Digit1') answerRiddle(0);
        if (code === 'Digit2') answerRiddle(1);
        if (code === 'Digit3') answerRiddle(2);
        return;
      }
      if (code === 'Enter' || code === 'Space') doZone('dialogue:next');
      return;
    }
    if (state.mode === 'hub') {
      if (state.submenu) {
        if (code === 'Backspace' || code === 'KeyB') doZone('panel:back');
        if (code === 'Tab') doZone('panel:page');
        if (code.indexOf('Digit') === 0) {
          var n = parseInt(code.slice(5), 10) - 1;
          if (n >= 0 && n < panelRowCount()) doZone('panel:row:' + n);
        }
        return;
      }
      if (code.indexOf('Digit') === 0) {
        var h = parseInt(code.slice(5), 10) - 1;
        if (h >= 0 && h < HUB_ACTIONS.length) doZone('hub:' + HUB_ACTIONS[h].id);
      }
      if (code === 'Enter' || code === 'Space') doZone('hub:depart');
      return;
    }
    if (state.mode === 'field') {
      if (code === 'Space' || code === 'Enter' || code === 'KeyE') doZone('field:act');
      if (code === 'KeyQ') doZone('field:quest');
      return;
    }
    if (state.mode === 'battle') {
      var c = state.combat;
      if (!c) return;
      if (c.phase === 'won' || c.phase === 'lost') { doZone('battle:end'); return; }
      if (code === 'KeyA') { doZone('battle:auto'); return; }
      if (code === 'Space') { doZone('battle:skip'); return; }
      if (c.ui === 'skill' || c.ui === 'item') {
        if (code === 'Backspace' || code === 'KeyB') doZone('list:back');
        if (code.indexOf('Digit') === 0) {
          var li = parseInt(code.slice(5), 10) - 1;
          var list = c.ui === 'skill' ? activeSkills() : ITEM_KEYS;
          if (li >= 0 && li < list.length) doZone('list:' + li);
        }
        return;
      }
      if (code === 'Digit1') commandTap('attack');
      if (code === 'Digit2') commandTap('skill');
      if (code === 'Digit3') commandTap('guard');
      if (code === 'Digit4') commandTap('bond');
      if (code === 'Digit5') commandTap('item');
      if (code === 'KeyQ') { c.focusAlly = 0; commandTap('swap'); }
      if (code === 'KeyE') { c.focusAlly = 1; commandTap('swap'); }
      if (code === 'KeyF') {
        var reach = reachableFoes(true);
        c.focusFoe = (c.focusFoe + 1) % Math.max(1, reach.length);
        sfx('ui', 0.5);
      }
      return;
    }
  }

  function extraSettingsRow(box, row) {
    row('Fast resolution', function () { return state.speed > 1; }, function (v) { state.speed = v ? 1.6 : 1; });
    row('Auto battle', function () { return state.auto; }, function (v) { state.auto = v; });
  }

  /* ---------------------------------------------------------- text style */

  var TEXT_RES = Math.min(2, window.devicePixelRatio || 1);
  function st(size, color, bold, wrap) {
    var s = { fontFamily: FONT, fontSize: size + 'px', color: color || CSS.text, resolution: TEXT_RES };
    if (bold) s.fontStyle = '700';
    if (wrap) s.wordWrap = { width: wrap };
    return s;
  }
  function setTextIfChanged(o, v) {
    if (!o) return;
    v = String(v);
    if (o.text !== v) o.setText(v);
  }
  function setColorIfChanged(o, c) {
    if (!o || o._wcColor === c) return;
    o._wcColor = c;
    o.setColor(c);
  }
  function setVis(o, v) { if (o && o.visible !== v) o.setVisible(v); }
  function hexOf(cssColor) { return Phaser.Display.Color.HexStringToColor(cssColor).color; }

  /* ------------------------------------------------------ texture bakery */

  function rounded(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function makeCanvas(w, h) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    return cv;
  }

  function bakeHeroSheet(scene, key, color, accent, arch) {
    var F = 48;
    var cv = makeCanvas(F * 6, F * 4);
    var c = cv.getContext('2d');
    for (var dir = 0; dir < 4; dir++) {
      for (var f = 0; f < 6; f++) {
        c.save();
        c.translate(f * F, dir * F);
        var bob = f === 1 ? -1 : f === 2 ? 1 : 0;
        var lean = f === 3 ? 3 : f === 4 ? -3 : 0;
        c.globalAlpha = f === 5 ? 0.35 : 0.28;
        c.fillStyle = '#000000';
        c.beginPath(); c.ellipse(24, 42, 11, 4, 0, 0, TAU); c.fill();
        c.globalAlpha = 1;
        c.translate(lean, bob);
        /* legs */
        c.fillStyle = '#2b3252';
        c.fillRect(18, 32, 5, 9 + (f === 1 ? -2 : 0));
        c.fillRect(26, 32, 5, 9 + (f === 2 ? -2 : 0));
        /* cloak */
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(24, 12); c.lineTo(35, 22); c.lineTo(33, 35); c.lineTo(15, 35); c.lineTo(13, 22);
        c.closePath(); c.fill();
        c.fillStyle = accent;
        c.fillRect(21, 22, 6, 12);
        /* arms */
        c.fillStyle = color;
        if (f === 3) { c.fillRect(33, 16, 8, 5); } else { c.fillRect(33, 22, 5, 8); }
        c.fillRect(10, 22, 5, 8);
        /* head */
        c.fillStyle = '#f2ddc0';
        c.beginPath(); c.arc(24, 13, 7, 0, TAU); c.fill();
        c.fillStyle = '#22284a';
        c.fillRect(20, 10, 3, 2); c.fillRect(26, 10, 3, 2);
        if (f === 4) { c.fillStyle = CSS.red; c.fillRect(19, 15, 10, 2); }
        /* travel hat brim keeps the silhouette readable at any dir */
        c.fillStyle = accent;
        c.beginPath(); c.moveTo(13, 8); c.lineTo(35, 8); c.lineTo(31, 4); c.lineTo(17, 4); c.closePath(); c.fill();
        c.fillStyle = color;
        c.fillRect(20, 1, 8, 4);
        /* role mark */
        c.fillStyle = accent;
        if (arch === 'strike') { c.fillRect(36, f === 3 ? 12 : 20, 3, 12); }
        else if (arch === 'mend') { c.fillRect(36, 22, 7, 3); c.fillRect(38, 20, 3, 7); }
        else if (arch === 'ward') { c.beginPath(); c.moveTo(38, 20); c.lineTo(43, 23); c.lineTo(38, 30); c.lineTo(34, 23); c.closePath(); c.fill(); }
        else { c.beginPath(); c.arc(39, 24, 4, 0, TAU); c.fill(); c.fillStyle = '#fff6d8'; c.beginPath(); c.arc(39, 24, 2, 0, TAU); c.fill(); }
        if (f === 5) {
          c.fillStyle = accent;
          c.globalAlpha = 0.85;
          c.fillRect(8, 2, 4, 4); c.fillRect(38, 0, 3, 3);
          c.globalAlpha = 1;
        }
        c.restore();
      }
    }
    scene.textures.addSpriteSheet(key, cv, { frameWidth: F, frameHeight: F, endFrame: 23 });
  }

  function bakePortrait(scene, key, color, accent, glyph) {
    var S = 72;
    var cv = makeCanvas(S, S);
    var c = cv.getContext('2d');
    var g = c.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#27325a'); g.addColorStop(1, '#161d38');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    c.strokeStyle = accent; c.lineWidth = 3; c.strokeRect(2, 2, S - 4, S - 4);
    c.fillStyle = color;
    c.beginPath(); c.moveTo(36, 20); c.lineTo(56, 36); c.lineTo(52, 66); c.lineTo(20, 66); c.lineTo(16, 36); c.closePath(); c.fill();
    c.fillStyle = '#f2ddc0';
    c.beginPath(); c.arc(36, 26, 12, 0, TAU); c.fill();
    c.fillStyle = '#22284a';
    c.fillRect(29, 24, 5, 3); c.fillRect(39, 24, 5, 3);
    c.fillStyle = accent;
    c.beginPath(); c.moveTo(18, 18); c.lineTo(54, 18); c.lineTo(48, 11); c.lineTo(24, 11); c.closePath(); c.fill();
    c.fillStyle = accent;
    c.font = '700 16px ' + FONT;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(glyph, 60, 60);
    scene.textures.addCanvas(key, cv);
  }

  function bakeFoe(scene, key, family, color, big) {
    var S = big ? 120 : 96;
    var cv = makeCanvas(S, S);
    var c = cv.getContext('2d');
    var k = S / 96;
    c.save(); c.scale(k, k);
    c.globalAlpha = 0.26; c.fillStyle = '#000000';
    c.beginPath(); c.ellipse(48, 86, 26, 6, 0, 0, TAU); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = color;
    c.strokeStyle = '#f5f0df'; c.lineWidth = 2.4;
    c.beginPath();
    if (family === 'moth') {
      c.moveTo(48, 22); c.lineTo(84, 40); c.lineTo(66, 60); c.lineTo(78, 80); c.lineTo(48, 70);
      c.lineTo(18, 80); c.lineTo(30, 60); c.lineTo(12, 40); c.closePath();
    } else if (family === 'courier') {
      c.moveTo(48, 14); c.lineTo(70, 34); c.lineTo(66, 82); c.lineTo(30, 82); c.lineTo(26, 34); c.closePath();
    } else if (family === 'hound') {
      c.moveTo(14, 78); c.lineTo(22, 44); c.lineTo(40, 52); c.lineTo(54, 26); c.lineTo(76, 48); c.lineTo(84, 80); c.closePath();
    } else if (family === 'serpent') {
      c.moveTo(20, 84); c.lineTo(30, 46); c.lineTo(52, 34); c.lineTo(50, 18); c.lineTo(72, 30); c.lineTo(66, 52); c.lineTo(74, 84); c.closePath();
    } else if (family === 'kite') {
      c.moveTo(48, 12); c.lineTo(86, 50); c.lineTo(48, 88); c.lineTo(10, 50); c.closePath();
    } else if (family === 'warden') {
      c.moveTo(26, 20); c.lineTo(70, 20); c.lineTo(78, 56); c.lineTo(48, 88); c.lineTo(18, 56); c.closePath();
    } else if (family === 'judge') {
      c.moveTo(48, 6); c.lineTo(80, 26); c.lineTo(86, 62); c.lineTo(48, 90); c.lineTo(10, 62); c.lineTo(16, 26); c.closePath();
    } else {
      c.arc(48, 50, 30, 0, TAU);
    }
    c.fill(); c.stroke();
    c.fillStyle = '#14182c';
    c.fillRect(34, 44, 11, 6); c.fillRect(51, 44, 11, 6);
    c.fillStyle = '#fff3cf';
    c.fillRect(36, 45, 5, 3); c.fillRect(53, 45, 5, 3);
    if (family === 'judge') {
      c.strokeStyle = '#fff3cf'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(20, 30); c.lineTo(76, 30); c.stroke();
      c.beginPath(); c.moveTo(24, 72); c.lineTo(72, 72); c.stroke();
      c.fillStyle = '#fff3cf';
      c.beginPath(); c.moveTo(48, 0); c.lineTo(54, 12); c.lineTo(42, 12); c.closePath(); c.fill();
    }
    if (family === 'spirit') {
      c.globalAlpha = 0.5; c.fillStyle = '#fff6e0';
      c.beginPath(); c.arc(38, 38, 8, 0, TAU); c.fill();
      c.globalAlpha = 1;
    }
    c.restore();
    scene.textures.addCanvas(key, cv);
  }

  function bakeMap(scene, regionId) {
    var rd = regionData(regionId);
    var map = buildMap(regionId);
    var cv = makeCanvas(MAP_W * TILE, MAP_H * TILE);
    var c = cv.getContext('2d');
    var rnd = lcg(rd.seed + 77);
    function hexStr(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
    var i, x, y;
    for (y = 0; y < MAP_H; y++) for (x = 0; x < MAP_W; x++) {
      var t = map.tiles[y * MAP_W + x];
      var px = x * TILE, py = y * TILE;
      var checker = (x + y) % 2 === 0;
      if (t === 1) {
        c.fillStyle = hexStr(rd.path);
        c.fillRect(px, py, TILE, TILE);
        c.fillStyle = 'rgba(0,0,0,0.14)';
        c.fillRect(px, py + (checker ? 6 : 18), TILE, 3);
      } else if (t === 2) {
        c.fillStyle = hexStr(checker ? rd.grass : rd.grass2);
        c.fillRect(px, py, TILE, TILE);
        c.strokeStyle = 'rgba(255,255,255,0.16)';
        c.lineWidth = 2;
        for (i = 0; i < 4; i++) {
          var gx = px + 5 + i * 7 + (rnd() * 3 | 0);
          var gy = py + 24 + (rnd() * 5 | 0);
          c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + (rnd() < 0.5 ? -3 : 3), gy - 10); c.stroke();
        }
      } else if (t === 3) {
        c.fillStyle = hexStr(rd.water);
        c.fillRect(px, py, TILE, TILE);
        c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(px + 4, py + 12); c.lineTo(px + 14, py + 8); c.lineTo(px + 26, py + 13); c.stroke();
        c.beginPath(); c.moveTo(px + 6, py + 24); c.lineTo(px + 18, py + 20); c.lineTo(px + 28, py + 25); c.stroke();
      } else if (t === 4) {
        c.fillStyle = hexStr(rd.wall);
        c.fillRect(px, py, TILE, TILE);
        c.fillStyle = 'rgba(255,255,255,0.10)';
        c.beginPath(); c.moveTo(px + 4, py + 28); c.lineTo(px + 16, py + 6); c.lineTo(px + 28, py + 28); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 2;
        c.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
      } else {
        c.fillStyle = hexStr(checker ? rd.ground : rd.ground2);
        c.fillRect(px, py, TILE, TILE);
        if (rnd() < 0.14) {
          c.fillStyle = 'rgba(255,255,255,0.07)';
          c.fillRect(px + 8, py + 12, 10, 3);
        }
      }
      /* transition seam so terrain never meets in a hard edge */
      if (t !== 4) {
        c.fillStyle = 'rgba(0,0,0,0.10)';
        c.fillRect(px, py + TILE - 2, TILE, 2);
      }
    }
    /* authored props for the region signature */
    for (i = 0; i < map.props.length; i++) {
      var p = map.props[i];
      c.save(); c.translate(p.x, p.y);
      if (rd.prop === 'lantern') {
        c.strokeStyle = '#6a5c3e'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(0, 14); c.lineTo(0, -18); c.stroke();
        c.fillStyle = rd.festival;
        c.beginPath(); c.moveTo(0, -24); c.lineTo(8, -18); c.lineTo(8, -6); c.lineTo(0, 0); c.lineTo(-8, -6); c.lineTo(-8, -18); c.closePath(); c.fill();
      } else if (rd.prop === 'cane') {
        c.strokeStyle = '#5fa060'; c.lineWidth = 4;
        for (var cj = -1; cj <= 1; cj++) { c.beginPath(); c.moveTo(cj * 6, 14); c.lineTo(cj * 6 + 2, -22); c.stroke(); }
        c.fillStyle = rd.festival;
        c.fillRect(-9, -10, 18, 3);
      } else if (rd.prop === 'salt') {
        c.fillStyle = '#e9e3cf';
        c.beginPath(); c.moveTo(0, -18); c.lineTo(11, 8); c.lineTo(-11, 8); c.closePath(); c.fill();
        c.fillStyle = rd.festival;
        c.fillRect(-4, -2, 8, 8);
      } else if (rd.prop === 'moon') {
        c.strokeStyle = '#8d86b8'; c.lineWidth = 3;
        c.strokeRect(-10, -14, 20, 24);
        c.fillStyle = rd.festival;
        c.beginPath(); c.arc(0, -2, 6, 0, TAU); c.fill();
      } else {
        c.fillStyle = 'rgba(255,255,255,0.20)';
        c.beginPath(); c.arc(-8, 0, 10, 0, TAU); c.arc(6, -4, 12, 0, TAU); c.arc(14, 4, 8, 0, TAU); c.fill();
        c.fillStyle = rd.festival;
        c.fillRect(-3, -20, 6, 6);
      }
      c.restore();
    }
    /* the gate home */
    c.save(); c.translate(map.gate.x, map.gate.y);
    c.strokeStyle = rd.festival; c.lineWidth = 5;
    c.beginPath(); c.moveTo(-22, 18); c.lineTo(-22, -20); c.lineTo(22, -20); c.lineTo(22, 18); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.fillRect(-20, -18, 40, 36);
    c.restore();
    scene.textures.addCanvas('map-' + regionId, cv);
  }

  function bakeBattleBack(scene, regionId) {
    var rd = regionData(regionId);
    var cv = makeCanvas(W, 470);
    var c = cv.getContext('2d');
    function hexStr(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
    var g = c.createLinearGradient(0, 0, 0, 470);
    g.addColorStop(0, CSS.ink);
    g.addColorStop(0.45, hexStr(rd.wall));
    g.addColorStop(1, hexStr(rd.ground));
    c.fillStyle = g; c.fillRect(0, 0, W, 470);
    var rnd = lcg(rd.seed + 500);
    var i;
    for (i = 0; i < 46; i++) {
      c.globalAlpha = 0.2 + rnd() * 0.5;
      c.fillStyle = '#f5f0df';
      var s = rnd() < 0.16 ? 2 : 1;
      c.fillRect(rnd() * W | 0, rnd() * 190 | 0, s, s);
    }
    c.globalAlpha = 1;
    /* horizon silhouette in the region festival colour */
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.moveTo(0, 250);
    for (i = 0; i <= 8; i++) c.lineTo(i * (W / 8), 214 + Math.sin(i * 1.7 + rd.seed) * 26);
    c.lineTo(W, 250); c.lineTo(W, 470); c.lineTo(0, 470); c.closePath(); c.fill();
    for (i = 0; i < 5; i++) {
      var lx = 34 + i * 82;
      c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(lx, 236); c.lineTo(lx, 196); c.stroke();
      c.fillStyle = rd.festival;
      c.globalAlpha = 0.9;
      c.beginPath(); c.moveTo(lx, 190); c.lineTo(lx + 7, 196); c.lineTo(lx + 7, 208); c.lineTo(lx, 214); c.lineTo(lx - 7, 208); c.lineTo(lx - 7, 196); c.closePath(); c.fill();
      c.globalAlpha = 1;
    }
    /* the two stage planes for front and back rows */
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(W / 2, 190, 168, 30, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(W / 2, 268, 196, 34, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(245,240,223,0.14)'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(W / 2, 268, 196, 34, 0, 0, TAU); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath(); c.ellipse(W / 2, 400, 210, 40, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(W / 2, 344, 180, 30, 0, 0, TAU); c.fill();
    scene.textures.addCanvas('bback-' + regionId, cv);
  }

  function bakeHub(scene, tier) {
    var cv = makeCanvas(W, 430);
    var c = cv.getContext('2d');
    var g = c.createLinearGradient(0, 0, 0, 430);
    g.addColorStop(0, '#131a33'); g.addColorStop(0.55, '#1d2547'); g.addColorStop(1, '#2a2138');
    c.fillStyle = g; c.fillRect(0, 0, W, 430);
    var rnd = lcg(4242 + tier * 13);
    var i;
    for (i = 0; i < 50; i++) {
      c.globalAlpha = 0.25 + rnd() * 0.5;
      c.fillStyle = '#f5f0df';
      c.fillRect(rnd() * W | 0, rnd() * 170 | 0, rnd() < 0.2 ? 2 : 1, 1);
    }
    c.globalAlpha = 1;
    /* moon and hills so the quarter never reads as an empty sky */
    c.fillStyle = '#f7efd6';
    c.beginPath(); c.arc(312, 64, 22, 0, TAU); c.fill();
    c.fillStyle = '#131a33';
    c.beginPath(); c.arc(302, 58, 20, 0, TAU); c.fill();
    c.fillStyle = '#1b2444';
    c.beginPath();
    c.moveTo(0, 200);
    for (i = 0; i <= 10; i++) c.lineTo(i * 39, 160 + Math.sin(i * 1.3 + tier) * 26);
    c.lineTo(W, 200); c.lineTo(W, 260); c.lineTo(0, 260); c.closePath(); c.fill();
    c.fillStyle = '#232c52';
    c.beginPath();
    c.moveTo(0, 214);
    for (i = 0; i <= 8; i++) c.lineTo(i * 49, 186 + Math.cos(i * 1.7 + tier) * 18);
    c.lineTo(W, 214); c.lineTo(W, 260); c.lineTo(0, 260); c.closePath(); c.fill();
    /* distant capital wall */
    c.fillStyle = '#1a2140';
    c.fillRect(0, 190, W, 60);
    for (i = 0; i < 13; i++) c.fillRect(i * 30, 178, 20, 14);
    c.fillStyle = '#2a3358';
    for (i = 0; i < 13; i++) c.fillRect(i * 30 + 6, 200 + (i % 3) * 5, 8, 10);
    /* the ground */
    c.fillStyle = '#3a3050';
    c.fillRect(0, 250, W, 180);
    c.fillStyle = '#463a5e';
    for (i = 0; i < 9; i++) c.fillRect(i * 46, 262 + (i % 2) * 6, 40, 8);

    function house(x, y, w, h, body, roof, lit) {
      c.fillStyle = body; c.fillRect(x, y, w, h);
      c.fillStyle = roof;
      c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x + w / 2, y - 22); c.lineTo(x + w + 6, y); c.closePath(); c.fill();
      c.fillStyle = lit ? '#f2c15a' : '#1a2140';
      c.fillRect(x + 8, y + 14, 12, 14);
      if (w > 60) c.fillRect(x + w - 22, y + 14, 12, 14);
      c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 2; c.strokeRect(x, y, w, h);
    }
    function lantern(x, y, col) {
      c.strokeStyle = '#6a5c3e'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 26); c.stroke();
      c.fillStyle = col;
      c.beginPath(); c.moveTo(x, y + 26); c.lineTo(x + 8, y + 32); c.lineTo(x + 8, y + 46); c.lineTo(x, y + 52); c.lineTo(x - 8, y + 46); c.lineTo(x - 8, y + 32); c.closePath(); c.fill();
      c.globalAlpha = 0.16; c.fillStyle = col;
      c.beginPath(); c.arc(x, y + 39, 26, 0, TAU); c.fill();
      c.globalAlpha = 1;
    }
    /* the quest board is always present */
    house(24, 268, 86, 78, '#4a3c5e', '#8a5f4a', true);
    c.fillStyle = '#d9c9a4'; c.fillRect(40, 290, 54, 34);
    c.fillStyle = '#4a3c5e';
    for (i = 0; i < 3; i++) c.fillRect(46, 296 + i * 10, 42, 5);
    function scaffold(x, y, w, h) {
      c.strokeStyle = 'rgba(169,180,210,0.42)'; c.lineWidth = 2;
      c.strokeRect(x, y, w, h);
      c.beginPath(); c.moveTo(x, y + h); c.lineTo(x + w, y); c.moveTo(x, y); c.lineTo(x + w, y + h); c.stroke();
      c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x + w / 2, y - 20); c.lineTo(x + w + 6, y); c.stroke();
      c.fillStyle = 'rgba(90,104,150,0.25)'; c.fillRect(x, y, w, h);
    }
    if (tier >= 1) { house(128, 258, 94, 88, '#3f4a66', '#a35f4a', true); c.fillStyle = '#f49a5d'; c.beginPath(); c.arc(175, 306, 12, 0, TAU); c.fill(); }
    else scaffold(128, 258, 94, 88);
    if (tier >= 2) { house(240, 266, 88, 80, '#3a4f5e', '#4a7d8a', true); c.fillStyle = '#8dc9f4'; c.beginPath(); c.moveTo(284, 288); c.lineTo(298, 314); c.lineTo(270, 314); c.closePath(); c.fill(); }
    else scaffold(240, 266, 88, 80);
    if (tier >= 3) { house(320, 250, 62, 96, '#4a4470', '#7a5f9a', true); c.fillStyle = '#a58bdf'; c.fillRect(342, 282, 18, 22); }
    else scaffold(320, 250, 62, 96);
    if (tier >= 4) {
      c.fillStyle = '#2e3a68';
      c.beginPath(); c.moveTo(120, 250); c.lineTo(195, 118); c.lineTo(270, 250); c.closePath(); c.fill();
      c.fillStyle = '#8dc9f4';
      for (i = 0; i < 5; i++) c.fillRect(160 + i * 3, 168 + i * 16, 70 - i * 6, 6);
      c.fillStyle = '#f2c15a';
      c.beginPath(); c.arc(195, 132, 9, 0, TAU); c.fill();
    }
    lantern(70, 226, '#f2c15a');
    lantern(196, 214, tier >= 2 ? '#79e0c0' : '#f2c15a');
    lantern(330, 222, tier >= 3 ? '#a58bdf' : '#f2c15a');
    /* four resident silhouettes so the quarter never reads empty */
    for (i = 0; i < 4; i++) {
      var hx = 56 + i * 82, hy = 372 + (i % 2) * 10;
      c.fillStyle = ['#79e0c0', '#f49a5d', '#8dc9f4', '#f2c15a'][i];
      c.beginPath(); c.moveTo(hx, hy - 16); c.lineTo(hx + 9, hy - 6); c.lineTo(hx + 7, hy + 10); c.lineTo(hx - 7, hy + 10); c.lineTo(hx - 9, hy - 6); c.closePath(); c.fill();
      c.fillStyle = '#f2ddc0';
      c.beginPath(); c.arc(hx, hy - 20, 5, 0, TAU); c.fill();
      c.globalAlpha = 0.25; c.fillStyle = '#000';
      c.beginPath(); c.ellipse(hx, hy + 13, 9, 3, 0, 0, TAU); c.fill();
      c.globalAlpha = 1;
    }
    var fade = c.createLinearGradient(0, 0, 0, 76);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = fade;
    c.fillRect(0, 0, W, 76);
    c.globalCompositeOperation = 'source-over';
    scene.textures.addCanvas('hub-' + tier, cv);
  }

  function bakeTitleSky(scene) {
    var cv = makeCanvas(W, 480);
    var c = cv.getContext('2d');
    var g = c.createLinearGradient(0, 0, 0, 480);
    g.addColorStop(0, '#080c1c'); g.addColorStop(0.6, '#121a33'); g.addColorStop(1, '#1d2547');
    c.fillStyle = g; c.fillRect(0, 0, W, 480);
    var rnd = lcg(9090);
    var i;
    for (i = 0; i < 120; i++) {
      c.globalAlpha = 0.2 + rnd() * 0.7;
      c.fillStyle = '#f5f0df';
      var sz = rnd() < 0.12 ? 2 : 1;
      c.fillRect(rnd() * W | 0, rnd() * 460 | 0, sz, sz);
    }
    c.globalAlpha = 1;
    /* lantern chain across the upper sky */
    c.strokeStyle = 'rgba(242,193,90,0.35)'; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-10, 150);
    c.quadraticCurveTo(195, 196, 400, 142);
    c.stroke();
    for (i = 0; i < 7; i++) {
      var lx = 18 + i * 60;
      var t = i / 6;
      var ly = 150 + (196 - 150) * (2 * t * (1 - t)) * 1.35;
      c.fillStyle = '#f2c15a';
      c.beginPath();
      c.moveTo(lx, ly); c.lineTo(lx + 6, ly + 5); c.lineTo(lx + 6, ly + 15); c.lineTo(lx, ly + 20);
      c.lineTo(lx - 6, ly + 15); c.lineTo(lx - 6, ly + 5); c.closePath(); c.fill();
      c.globalAlpha = 0.14;
      c.beginPath(); c.arc(lx, ly + 10, 22, 0, TAU); c.fill();
      c.globalAlpha = 1;
    }
    scene.textures.addCanvas('title-sky', cv);
  }

  function bakeFx(scene) {
    var keys = [
      { key: 'fx-dot', draw: function (c) { c.fillStyle = '#fff'; c.beginPath(); c.arc(10, 10, 8, 0, TAU); c.fill(); } },
      { key: 'fx-spark', draw: function (c) { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(10, 0); c.lineTo(14, 10); c.lineTo(10, 20); c.lineTo(6, 10); c.closePath(); c.fill(); } },
      { key: 'fx-leaf', draw: function (c) { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(10, 10, 8, 4, 0.6, 0, TAU); c.fill(); } },
      { key: 'fx-ring', draw: function (c) { c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(10, 10, 7, 0, TAU); c.stroke(); } },
      { key: 'fx-mote', draw: function (c) { c.fillStyle = '#fff'; c.fillRect(7, 7, 6, 6); } }
    ];
    for (var i = 0; i < keys.length; i++) {
      var cv = makeCanvas(20, 20);
      keys[i].draw(cv.getContext('2d'));
      scene.textures.addCanvas(keys[i].key, cv);
    }
  }

  function bakeUi(scene) {
    var cv = makeCanvas(112, 112);
    var c = cv.getContext('2d');
    c.strokeStyle = '#f2c15a'; c.lineWidth = 4;
    var s = 18;
    c.beginPath();
    c.moveTo(6, 6 + s); c.lineTo(6, 6); c.lineTo(6 + s, 6);
    c.moveTo(106 - s, 6); c.lineTo(106, 6); c.lineTo(106, 6 + s);
    c.moveTo(106, 106 - s); c.lineTo(106, 106); c.lineTo(106 - s, 106);
    c.moveTo(6 + s, 106); c.lineTo(6, 106); c.lineTo(6, 106 - s);
    c.stroke();
    scene.textures.addCanvas('ui-bracket', cv);

    var cv2 = makeCanvas(96, 96);
    var c2 = cv2.getContext('2d');
    c2.strokeStyle = '#e46d7b'; c2.lineWidth = 4;
    c2.beginPath(); c2.arc(48, 48, 40, 0, TAU); c2.stroke();
    c2.strokeStyle = '#ffffff'; c2.lineWidth = 2;
    c2.beginPath(); c2.moveTo(48, 2); c2.lineTo(48, 18); c2.moveTo(48, 78); c2.lineTo(48, 94);
    c2.moveTo(2, 48); c2.lineTo(18, 48); c2.moveTo(78, 48); c2.lineTo(94, 48);
    c2.stroke();
    scene.textures.addCanvas('ui-target', cv2);

    var cv3 = makeCanvas(150, 150);
    var c3 = cv3.getContext('2d');
    c3.fillStyle = 'rgba(245,240,223,0.10)';
    c3.beginPath(); c3.arc(75, 75, 66, 0, TAU); c3.fill();
    c3.strokeStyle = 'rgba(245,240,223,0.40)'; c3.lineWidth = 3;
    c3.beginPath(); c3.arc(75, 75, 66, 0, TAU); c3.stroke();
    c3.strokeStyle = 'rgba(245,240,223,0.22)'; c3.lineWidth = 2;
    c3.beginPath(); c3.moveTo(75, 40); c3.lineTo(75, 110); c3.moveTo(40, 75); c3.lineTo(110, 75); c3.stroke();
    scene.textures.addCanvas('ui-stickbase', cv3);

    var cv4 = makeCanvas(72, 72);
    var c4 = cv4.getContext('2d');
    c4.fillStyle = 'rgba(242,193,90,0.85)';
    c4.beginPath(); c4.arc(36, 36, 28, 0, TAU); c4.fill();
    c4.strokeStyle = '#fff6d8'; c4.lineWidth = 3;
    c4.beginPath(); c4.arc(36, 36, 28, 0, TAU); c4.stroke();
    scene.textures.addCanvas('ui-stickknob', cv4);

    var cv5 = makeCanvas(96, 96);
    var c5 = cv5.getContext('2d');
    c5.fillStyle = 'rgba(121,224,192,0.22)';
    c5.beginPath(); c5.arc(48, 48, 44, 0, TAU); c5.fill();
    c5.strokeStyle = '#79e0c0'; c5.lineWidth = 4;
    c5.beginPath(); c5.arc(48, 48, 44, 0, TAU); c5.stroke();
    c5.fillStyle = '#79e0c0';
    c5.font = '700 34px ' + FONT; c5.textAlign = 'center'; c5.textBaseline = 'middle';
    c5.fillText('✦', 48, 50);
    scene.textures.addCanvas('ui-actbtn', cv5);

    var cv6 = makeCanvas(40, 56);
    var c6 = cv6.getContext('2d');
    c6.fillStyle = '#f2c15a';
    c6.beginPath(); c6.moveTo(20, 54); c6.lineTo(4, 26); c6.arc(20, 20, 16, Math.PI, 0); c6.closePath(); c6.fill();
    c6.fillStyle = '#141b31';
    c6.beginPath(); c6.arc(20, 20, 7, 0, TAU); c6.fill();
    scene.textures.addCanvas('ui-pin', cv6);

    var cv7 = makeCanvas(48, 48);
    var c7 = cv7.getContext('2d');
    c7.fillStyle = '#8dc9f4';
    c7.beginPath(); c7.moveTo(24, 4); c7.lineTo(44, 24); c7.lineTo(24, 44); c7.lineTo(4, 24); c7.closePath(); c7.fill();
    c7.fillStyle = '#141b31';
    c7.font = '700 20px ' + FONT; c7.textAlign = 'center'; c7.textBaseline = 'middle';
    c7.fillText('!', 24, 25);
    scene.textures.addCanvas('ui-npc', cv7);

    var cv8 = makeCanvas(W, 300);
    var c8 = cv8.getContext('2d');
    var lg = c8.createLinearGradient(0, 0, 0, 300);
    lg.addColorStop(0, 'rgba(13,18,34,0)');
    lg.addColorStop(1, 'rgba(13,18,34,0.92)');
    c8.fillStyle = lg; c8.fillRect(0, 0, W, 300);
    scene.textures.addCanvas('ui-vignette', cv8);

    var cv9 = makeCanvas(330, 120);
    var c9 = cv9.getContext('2d');
    c9.font = '700 46px ' + FONT;
    c9.textAlign = 'center'; c9.textBaseline = 'middle';
    c9.fillStyle = '#f2c15a';
    c9.fillText('WAYFARER', 165, 38);
    c9.fillStyle = '#f5f0df';
    c9.font = '700 38px ' + FONT;
    c9.fillText('COURTS', 165, 82);
    c9.strokeStyle = 'rgba(242,193,90,0.6)'; c9.lineWidth = 2;
    c9.beginPath(); c9.moveTo(40, 108); c9.lineTo(290, 108); c9.stroke();
    scene.textures.addCanvas('ui-logo', cv9);
  }

  /* ---------------------------------------------------------- boot scene */

  var BootScene = {
    key: 'boot',
    create: function () {
      kit.loader.show('Wayfarer Courts');
      this.tasks = [];
      var scene = this;
      var i;
      for (i = 0; i < ROSTER_BLUEPRINT.length; i++) {
        (function (bp) {
          scene.tasks.push(function () {
            bakeHeroSheet(scene, 'hero-' + bp.id, bp.color, bp.accent, bp.arch);
            bakePortrait(scene, 'port-' + bp.id, bp.color, bp.accent, bp.glyph);
          });
        })(ROSTER_BLUEPRINT[i]);
      }
      var ekeys = Object.keys(ENEMIES);
      for (i = 0; i < ekeys.length; i++) {
        (function (k) {
          scene.tasks.push(function () { bakeFoe(scene, 'foe-' + k, enemyData(k).family, enemyData(k).color, false); });
        })(ekeys[i]);
      }
      for (i = 0; i < JUDGES.length; i++) {
        (function (j) {
          scene.tasks.push(function () { bakeFoe(scene, 'foe-judge-' + j.id, 'judge', j.color, true); });
        })(JUDGES[i]);
      }
      for (i = 0; i < ROSTER_BLUEPRINT.length; i++) {
        (function (bp) {
          scene.tasks.push(function () { bakeFoe(scene, 'foe-spirit-' + bp.id, 'spirit', bp.color, false); });
        })(ROSTER_BLUEPRINT[i]);
      }
      for (i = 0; i < REGION_KEYS.length; i++) {
        (function (r) {
          scene.tasks.push(function () { bakeMap(scene, r); });
          scene.tasks.push(function () { bakeBattleBack(scene, r); });
        })(REGION_KEYS[i]);
      }
      for (i = 0; i < 5; i++) {
        (function (t) { scene.tasks.push(function () { bakeHub(scene, t); }); })(i);
      }
      scene.tasks.push(function () { bakeTitleSky(scene); });
      scene.tasks.push(function () { bakeFx(scene); });
      scene.tasks.push(function () { bakeUi(scene); });
      scene.tasks.push(function () {
        kit.audio.preload(['strike', 'art', 'guard', 'hurt', 'heal', 'bond', 'ui', 'back', 'step', 'reward', 'craft', 'rank', 'defeat', 'victory', 'quest', 'encounter']);
      });
      scene.tasks.push(function () {
        if (!loadPersistent()) { recomputeStats(true); refreshOffers(); }
        if (!state.offered.length) refreshOffers();
      });
      this.total = this.tasks.length;
      this.done = 0;
    },
    update: function () {
      var budget = 2;
      while (budget-- > 0 && this.tasks.length) {
        var t = this.tasks.shift();
        t();
        this.done++;
      }
      kit.loader.progress(this.total ? this.done / this.total : 1);
      if (!this.tasks.length) {
        kit.loader.hide();
        this.scene.start('play');
      }
    }
  };

  /* ---------------------------------------------------------- play scene */

  function heroFrame(dir, anim, clock) {
    var d = dir === 'left' ? 1 : dir === 'right' ? 2 : dir === 'up' ? 3 : 0;
    var f = 0;
    if (anim === 'walk') f = 1 + (Math.floor(clock) % 2);
    else if (anim === 'act' || anim === 'cast') f = 3;
    else if (anim === 'hurt') f = 4;
    else if (anim === 'cheer') f = 5;
    else if (anim === 'guard') f = 3;
    else if (anim === 'down') f = 4;
    else f = Math.floor(clock * 0.5) % 2 === 0 ? 0 : 1;
    return d * 6 + clamp(f, 0, 5);
  }
  var FAMILY_MARK = { moth: '⌁', courier: '◍', hound: '▲', serpent: '≈', kite: '◇', warden: '▣', judge: '△', spirit: '◌' };
  function familyMark(u) { return FAMILY_MARK[u.family] || '◆'; }
  function foeTexture(u) {
    if (u.boss) {
      for (var i = 0; i < JUDGES.length; i++) if (JUDGES[i].name === u.name) return 'foe-judge-' + JUDGES[i].id;
      return 'foe-judge-veyra';
    }
    if (u.bondId) return 'foe-spirit-' + u.bondId;
    return 'foe-' + (ENEMIES[u.key] ? u.key : 'tollmoth');
  }
  function statusLine(u) {
    if (!u.statuses.length) return '';
    var out = '';
    for (var i = 0; i < STATUS_ORDER.length; i++) {
      var s = hasStatus(u, STATUS_ORDER[i]);
      if (!s) continue;
      out += statusData(s.key).icon + (s.turns > 1 ? s.turns : '') + ' ';
    }
    return out.trim();
  }

  var PlayScene = {
    key: 'play',

    button: function (x, y, w, h, label, color, size, depth) {
      var rect = this.add.rectangle(x + w / 2, y + h / 2, w, h, HEX.panel2, 1).setStrokeStyle(2, HEX.line, 1).setDepth(depth || 40);
      var text = this.add.text(x + w / 2, y + h / 2, label, st(size || 16, color || CSS.text, true)).setOrigin(0.5).setDepth((depth || 40) + 1);
      return { rect: rect, text: text };
    },

    create: function () {
      var s = this;
      var i;
      app.scene = this;
      this.acc = 0;
      this.seenResult = 0;
      this.dustClock = 0;
      this.ambClock = 0;
      this.clock = 0;

      /* ---- world ---- */
      this.mapImg = this.add.image(0, 0, 'map-lantern').setOrigin(0, 0).setDepth(0);
      this.glows = [];
      for (i = 0; i < 14; i++) this.glows.push(this.add.image(0, 0, 'fx-dot').setDepth(1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
      this.npcSprites = [];
      this.npcTags = [];
      for (i = 0; i < 4; i++) {
        this.npcSprites.push(this.add.image(0, 0, 'ui-npc').setDepth(4).setVisible(false));
        this.npcTags.push(this.add.text(0, 0, '', st(13, CSS.sky, true)).setOrigin(0.5, 1).setDepth(5).setVisible(false));
      }
      this.markerSprites = [];
      for (i = 0; i < 3; i++) this.markerSprites.push(this.add.image(0, 0, 'ui-pin').setDepth(5).setVisible(false));
      this.gateRing = this.add.image(0, 0, 'ui-target').setDepth(3).setVisible(false).setTint(HEX.mint);
      this.followers = [];
      for (i = 0; i < 3; i++) this.followers.push(this.add.sprite(0, 0, 'hero-mira', 0).setDepth(6).setVisible(false));
      this.escortSprite = this.add.image(0, 0, 'ui-npc').setDepth(6).setVisible(false).setTint(HEX.gold);
      this.player = this.add.sprite(0, 0, 'hero-you', 0).setDepth(7).setVisible(false);
      this.edgePin = this.add.image(0, 0, 'ui-pin').setDepth(28).setVisible(false).setScale(0.7);
      this.meterBack = this.add.rectangle(195, 812, 150, 6, HEX.ink, 0.85).setDepth(28).setVisible(false);
      this.meterFill = this.add.rectangle(120, 812, 2, 6, HEX.rose, 1).setOrigin(0, 0.5).setDepth(29).setVisible(false);

      /* ---- hub ---- */
      this.hubImg = this.add.image(0, 70, 'hub-0').setOrigin(0, 0).setDepth(0).setVisible(false);
      this.vignette = this.add.image(0, 260, 'ui-vignette').setOrigin(0, 0).setDepth(2).setVisible(false);
      this.hubLines = [];
      for (i = 0; i < 3; i++) this.hubLines.push(this.add.text(20, 512 + i * 26, '', st(i === 0 ? 17 : 14, i === 0 ? CSS.gold : CSS.dim, i === 0)).setDepth(10).setVisible(false));

      /* ---- battle ---- */
      this.battleBack = this.add.image(0, 76, 'bback-lantern').setOrigin(0, 0).setDepth(0).setVisible(false);
      this.railChips = [];
      for (i = 0; i < 7; i++) {
        var rx = 22 + i * 51;
        this.railChips.push({
          rect: this.add.rectangle(rx, UI.rail.y + 20, 44, 34, HEX.panel, 0.92).setStrokeStyle(2, HEX.line, 1).setDepth(12).setVisible(false),
          text: this.add.text(rx, UI.rail.y + 20, '', st(17, CSS.text, true)).setOrigin(0.5).setDepth(13).setVisible(false)
        });
      }
      this.foeSprites = [];
      for (i = 0; i < 4; i++) {
        this.foeSprites.push({
          img: this.add.image(0, 0, 'foe-tollmoth').setDepth(8).setVisible(false),
          back: this.add.rectangle(0, 0, 62, 7, HEX.ink, 0.9).setDepth(9).setVisible(false),
          fill: this.add.rectangle(0, 0, 60, 5, HEX.red, 1).setOrigin(0, 0.5).setDepth(10).setVisible(false),
          status: this.add.text(0, 0, '', st(14, CSS.text, true)).setOrigin(0.5).setDepth(11).setVisible(false)
        });
      }
      this.foeTargetRing = this.add.image(0, 0, 'ui-target').setDepth(7).setVisible(false);
      this.foeName = this.add.text(195, 128, '', st(16, CSS.text, true)).setOrigin(0.5, 0).setDepth(12).setVisible(false);
      this.foeSub = this.add.text(195, 148, '', st(13, CSS.dim)).setOrigin(0.5, 0).setDepth(12).setVisible(false);
      this.partySprites = [];
      for (i = 0; i < 4; i++) this.partySprites.push(this.add.sprite(0, 0, 'hero-you', 0).setDepth(8).setVisible(false));
      this.activeBracket = this.add.image(0, 0, 'ui-bracket').setDepth(14).setVisible(false);

      this.cards = [];
      for (i = 0; i < 4; i++) {
        var r = cardRect(i);
        this.cards.push({
          rect: this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, HEX.panel, 0.95).setStrokeStyle(2, HEX.line, 1).setDepth(12).setVisible(false),
          port: this.add.image(r.x + r.w / 2, r.y + 26, 'port-you').setDisplaySize(40, 40).setDepth(13).setVisible(false),
          name: this.add.text(r.x + r.w / 2, r.y + 54, '', st(14, CSS.text, true)).setOrigin(0.5).setDepth(13).setVisible(false),
          hpBack: this.add.rectangle(r.x + r.w / 2, r.y + 72, 74, 9, HEX.ink, 0.9).setDepth(13).setVisible(false),
          hpFill: this.add.rectangle(r.x + 8, r.y + 72, 72, 7, HEX.mint, 1).setOrigin(0, 0.5).setDepth(14).setVisible(false),
          spBack: this.add.rectangle(r.x + r.w / 2, r.y + 84, 74, 6, HEX.ink, 0.9).setDepth(13).setVisible(false),
          spFill: this.add.rectangle(r.x + 8, r.y + 84, 40, 4, HEX.sky, 1).setOrigin(0, 0.5).setDepth(14).setVisible(false),
          status: this.add.text(r.x + r.w / 2, r.y + 99, '', st(14, CSS.gold, true)).setOrigin(0.5).setDepth(13).setVisible(false),
          row: this.add.text(r.x + r.w - 8, r.y + 8, '', st(14, CSS.stone, true)).setOrigin(1, 0).setDepth(13).setVisible(false)
        });
      }
      this.cmd = [];
      for (i = 0; i < 6; i++) {
        var cr = cmdRect(i);
        this.cmd.push({
          rect: this.add.rectangle(cr.x + cr.w / 2, cr.y + cr.h / 2, cr.w, cr.h, HEX.panel2, 1).setStrokeStyle(2, HEX.line, 1).setDepth(12).setVisible(false),
          icon: this.add.text(cr.x + cr.w / 2, cr.y + 28, '', st(24, CSS.text, true)).setOrigin(0.5).setDepth(13).setVisible(false),
          label: this.add.text(cr.x + cr.w / 2, cr.y + 58, '', st(15, CSS.text, true)).setOrigin(0.5).setDepth(13).setVisible(false),
          sub: this.add.text(cr.x + cr.w / 2, cr.y + 76, '', st(12, CSS.dim)).setOrigin(0.5).setDepth(13).setVisible(false)
        });
      }
      this.listRows = [];
      for (i = 0; i < 5; i++) {
        var ly = UI.list.y + i * UI.list.rowH;
        this.listRows.push({
          rect: this.add.rectangle(UI.list.x + UI.list.w / 2, ly + 24, UI.list.w, UI.list.rowH - 6, HEX.panel, 0.97).setStrokeStyle(2, HEX.line, 1).setDepth(20).setVisible(false),
          text: this.add.text(UI.list.x + 14, ly + 14, '', st(16, CSS.text, true)).setOrigin(0, 0.5).setDepth(21).setVisible(false),
          sub: this.add.text(UI.list.x + 14, ly + 34, '', st(13, CSS.dim)).setOrigin(0, 0.5).setDepth(21).setVisible(false),
          tag: this.add.text(UI.list.x + UI.list.w - 14, ly + 24, '', st(15, CSS.gold, true)).setOrigin(1, 0.5).setDepth(21).setVisible(false)
        });
      }
      this.listBack = this.button(UI.list.x, UI.list.y + 4 * UI.list.rowH, UI.list.w, 52, 'BACK', CSS.dim, 16, 20);
      setVis(this.listBack.rect, false); setVis(this.listBack.text, false);
      this.listDim = this.add.rectangle(195, 422, W, 844, HEX.ink, 0.62).setDepth(19).setVisible(false);

      /* ---- hud ---- */
      this.hudBar = this.add.rectangle(195, UI.hud.y + UI.hud.h / 2, 378, UI.hud.h, HEX.panel, 0.86).setStrokeStyle(1, HEX.line, 0.7).setDepth(30).setVisible(false);
      this.hudTitle = this.add.text(18, 18, '', st(16, CSS.gold, true)).setDepth(31).setVisible(false);
      this.hudSub = this.add.text(18, 40, '', st(13, CSS.dim)).setDepth(31).setVisible(false);
      this.hudChip = this.add.text(238, 18, '', st(14, CSS.text, true)).setOrigin(1, 0).setDepth(31).setVisible(false);
      this.hudChip2 = this.add.text(238, 40, '', st(13, CSS.dim)).setOrigin(1, 0).setDepth(31).setVisible(false);
      this.actionChip = this.button(246, 8, 78, 46, 'AUTO', CSS.mint, 14, 30);
      this.pauseChip = this.button(330, 8, 52, 46, '❙❙', CSS.dim, 18, 30);
      this.coachBack = this.add.rectangle(195, 92, 358, 32, HEX.ink, 0.82).setStrokeStyle(1, HEX.line, 0.6).setDepth(32).setVisible(false);
      this.coachText = this.add.text(195, 92, '', st(14, CSS.text)).setOrigin(0.5).setDepth(33).setVisible(false);

      /* ---- floaters ---- */
      this.floaters = [];
      for (i = 0; i < 14; i++) this.floaters.push(this.add.text(0, 0, '', st(19, CSS.text, true)).setOrigin(0.5).setDepth(26).setVisible(false));

      /* ---- particles ---- */
      this.pools = {};
      var families = [
        { name: 'hit', tex: 'fx-spark' }, { name: 'heal', tex: 'fx-mote' },
        { name: 'reward', tex: 'fx-dot' }, { name: 'dust', tex: 'fx-leaf' },
        { name: 'amb', tex: 'fx-dot' }
      ];
      for (i = 0; i < families.length; i++) {
        var arr = [];
        for (var j = 0; j < 16; j++) arr.push(this.add.image(0, 0, families[i].tex).setDepth(25).setVisible(false).setBlendMode(Phaser.BlendModes.ADD));
        this.pools[families[i].name] = arr;
      }

      /* ---- banner ---- */
      this.bannerBack = this.add.rectangle(195, 396, 234, 108, HEX.panel, 0.96).setStrokeStyle(3, HEX.gold, 1).setDepth(50).setVisible(false);
      this.bannerTitle = this.add.text(195, 376, '', st(22, CSS.gold, true)).setOrigin(0.5).setDepth(51).setVisible(false);
      this.bannerSub = this.add.text(195, 410, '', st(14, CSS.text, false, 300)).setOrigin(0.5).setDepth(51).setVisible(false);
      this.bannerHint = this.add.text(195, 440, '', st(13, CSS.dim)).setOrigin(0.5).setDepth(51).setVisible(false);

      /* ---- dialogue ---- */
      this.dlgDim = this.add.rectangle(195, 422, W, 844, HEX.ink, 0.55).setDepth(43).setVisible(false);
      this.dlgBack = this.add.rectangle(195, 450, 366, 140, HEX.panel, 0.98).setStrokeStyle(2, HEX.gold, 1).setDepth(44).setVisible(false);
      this.dlgPort = this.add.image(56, 450, 'port-you').setDisplaySize(64, 64).setDepth(45).setVisible(false);
      this.dlgName = this.add.text(100, 396, '', st(16, CSS.gold, true)).setDepth(45).setVisible(false);
      this.dlgBody = this.add.text(100, 420, '', st(14, CSS.text, false, 262)).setDepth(45).setVisible(false);
      this.dlgHint = this.add.text(366, 700, '', st(13, CSS.dim)).setOrigin(1, 0.5).setDepth(45).setVisible(false);
      this.dlgChoices = [];
      for (i = 0; i < 3; i++) {
        var b = this.button(24, 540 + i * 68, 342, 58, '', CSS.text, 16, 44);
        b.rect.setFillStyle(HEX.panel2, 1);
        setVis(b.rect, false); setVis(b.text, false);
        this.dlgChoices.push(b);
      }

      /* ---- panels ---- */
      this.panelDim = this.add.rectangle(195, 422, W, 844, HEX.ink, 0.72).setDepth(38).setVisible(false);
      this.panelBack = this.add.rectangle(195, 452, 372, 660, HEX.panel, 0.98).setStrokeStyle(2, HEX.line, 1).setDepth(39).setVisible(false);
      this.panelTitle = this.add.text(20, 92, '', st(19, CSS.gold, true)).setDepth(41).setVisible(false);
      this.panelNote = this.add.text(370, 96, '', st(13, CSS.dim)).setOrigin(1, 0).setDepth(41).setVisible(false);
      this.panelRows = [];
      for (i = 0; i < 6; i++) {
        var py = UI.panel.y + i * UI.panel.rowH;
        this.panelRows.push({
          rect: this.add.rectangle(UI.panel.x + UI.panel.w / 2, py + (UI.panel.rowH - 6) / 2, UI.panel.w, UI.panel.rowH - 6, HEX.panel2, 1).setStrokeStyle(2, HEX.line, 1).setDepth(40).setVisible(false),
          text: this.add.text(UI.panel.x + 14, py + 16, '', st(16, CSS.text, true)).setOrigin(0, 0.5).setDepth(41).setVisible(false),
          sub: this.add.text(UI.panel.x + 14, py + 38, '', st(13, CSS.dim)).setOrigin(0, 0.5).setDepth(41).setVisible(false),
          tag: this.add.text(UI.panel.x + UI.panel.w - 14, py + 26, '', st(15, CSS.gold, true)).setOrigin(1, 0.5).setDepth(41).setVisible(false)
        });
      }
      this.memberPort = this.add.image(64, 386, 'port-you').setDisplaySize(84, 84).setDepth(41).setVisible(false);
      this.memberName = this.add.text(120, 350, '', st(19, CSS.gold, true)).setDepth(41).setVisible(false);
      this.memberInfo = this.add.text(120, 376, '', st(13, CSS.dim, false, 250)).setDepth(41).setVisible(false);
      this.memberBtns = [];
      for (i = 0; i < 6; i++) {
        var mb = this.button(12 + (i % 2) * 186, 560 + Math.floor(i / 2) * 66, 178, 58, '', CSS.text, 15, 40);
        setVis(mb.rect, false); setVis(mb.text, false);
        mb.sub = this.add.text(12 + (i % 2) * 186 + 89, 560 + Math.floor(i / 2) * 66 + 40, '', st(12, CSS.dim)).setOrigin(0.5).setDepth(41).setVisible(false);
        this.memberBtns.push(mb);
      }
      this.panelFoot = this.add.text(24, 486, '', st(14, CSS.dim, false, 336)).setDepth(41).setVisible(false);
      this.panelBackBtn = this.button(12, 776, 120, 56, 'BACK', CSS.dim, 16, 40);
      this.panelPageBtn = this.button(258, 776, 120, 56, 'PAGE', CSS.sky, 16, 40);
      setVis(this.panelBackBtn.rect, false); setVis(this.panelBackBtn.text, false);
      setVis(this.panelPageBtn.rect, false); setVis(this.panelPageBtn.text, false);

      /* ---- title ---- */
      this.titleSky = this.add.image(0, 0, 'title-sky').setOrigin(0, 0).setDepth(0).setVisible(false);
      this.titleBack = this.add.image(0, 414, 'hub-4').setOrigin(0, 0).setDepth(1).setVisible(false);
      this.titleVig = this.add.image(0, 470, 'ui-vignette').setOrigin(0, 0).setDepth(2).setVisible(false);
      this.logo = this.add.image(195, 258, 'ui-logo').setDepth(3).setVisible(false);
      this.titleSub = this.add.text(195, 342, 'A turn based road for four wayfarers.', st(15, CSS.dim)).setOrigin(0.5).setDepth(3).setVisible(false);
      this.titleBest = this.add.text(195, 376, '', st(14, CSS.gold, true)).setOrigin(0.5).setDepth(3).setVisible(false);
      this.titleBtns = [
        this.button(55, 520, 280, 62, 'CONTINUE', CSS.text, 18, 6),
        this.button(55, 592, 280, 62, 'NEW JOURNEY', CSS.gold, 18, 6),
        this.button(55, 664, 280, 56, 'SETTINGS', CSS.dim, 16, 6)
      ];
      for (i = 0; i < 3; i++) { setVis(this.titleBtns[i].rect, false); setVis(this.titleBtns[i].text, false); }

      /* ---- pause ---- */
      this.pauseDim = this.add.rectangle(195, 422, W, 844, HEX.ink, 0.86).setDepth(60).setVisible(false);
      this.pauseTitle = this.add.text(195, 300, 'PAUSED', st(26, CSS.gold, true)).setOrigin(0.5).setDepth(61).setVisible(false);
      this.pauseSub = this.add.text(195, 336, '', st(14, CSS.dim)).setOrigin(0.5).setDepth(61).setVisible(false);
      this.pauseBtns = [
        this.button(65, 380, 260, 56, 'RESUME', CSS.text, 17, 61),
        this.button(65, 448, 260, 56, 'SETTINGS', CSS.sky, 17, 61),
        this.button(65, 516, 260, 56, 'LEAVE TO TITLE', CSS.dim, 16, 61)
      ];
      for (i = 0; i < 3; i++) { setVis(this.pauseBtns[i].rect, false); setVis(this.pauseBtns[i].text, false); }

      /* ---- field controls ---- */
      this.stickBase = this.add.image(UI.stick.x, UI.stick.y, 'ui-stickbase').setDepth(29).setVisible(false).setAlpha(0.6);
      this.stickKnob = this.add.image(UI.stick.x, UI.stick.y, 'ui-stickknob').setDepth(30).setVisible(false).setAlpha(0.85);
      this.actBtn = this.add.image(UI.act.x, UI.act.y, 'ui-actbtn').setDepth(29).setVisible(false);
      this.questChip = this.button(240, 8, 84, 46, 'QUEST', CSS.gold, 14, 30);
      setVis(this.questChip.rect, false); setVis(this.questChip.text, false);

      this.resultText = this.add.text(195, 500, '', st(15, CSS.text, false, 320)).setOrigin(0.5, 0).setDepth(52).setVisible(false);

      installInput();
      kit.registerPWA();
      if (bootMode) this.forceMode(bootMode);
      if (bootStage) this.forceStage(bootStage);
    },

    forceMode: function (mode) {
      if (mode === 'hub') { state.field = null; state.combat = null; state.mode = 'hub'; state.stage = 'hub'; }
      else if (mode === 'field') { state.combat = null; enterField(state.region); }
      else if (mode === 'battle') { if (!state.field) enterField(state.region); startBattle('wild', {}); }
      else if (mode === 'title') { state.mode = 'title'; state.stage = 'title'; }
      return state.mode;
    },
    forceStage: function (stage) {
      if (typeof stage === 'string' && REGIONS[stage]) { state.region = stage; state.combat = null; enterField(stage); return state.stage; }
      if (typeof stage === 'number' && stage >= 1 && stage <= 15) { state.field = null; startBattle('arena', { rung: Math.floor(stage) }); return state.stage; }
      if (typeof stage === 'string' && stage.indexOf('boss') === 0) {
        var n = clamp(parseInt(stage.slice(4), 10) || 1, 1, 5);
        state.field = null;
        startBattle('boss', { judge: n - 1 });
      }
      return state.stage;
    },

    /* ------------------------------------------------------- effects */
    emit: function (family, x, y, color, count, spread) {
      if (!kit.juice.enabled) count = Math.max(2, Math.floor(count / 2));
      var pool = this.pools[family] || this.pools.hit;
      var made = 0;
      for (var i = 0; i < pool.length && made < count; i++) {
        var p = pool[i];
        if (p.visible) continue;
        var a = Math.random() * TAU;
        var v = (spread || 90) * (0.35 + Math.random() * 0.75);
        p.setPosition(x, y).setVisible(true).setAlpha(1).setScale(0.4 + Math.random() * 0.7);
        p.setTint(hexOf(color || CSS.gold));
        p._vx = Math.cos(a) * v;
        p._vy = Math.sin(a) * v - (family === 'heal' ? 40 : 0);
        p._g = family === 'heal' ? -30 : family === 'amb' ? -18 : 130;
        p._life = family === 'amb' ? 1.5 : 0.5 + Math.random() * 0.4;
        p._max = p._life;
        made++;
      }
    },
    clearParticles: function () {
      var names = Object.keys(this.pools);
      for (var n = 0; n < names.length; n++) {
        var pool = this.pools[names[n]];
        for (var i = 0; i < pool.length; i++) pool[i].setVisible(false);
      }
      for (var f = 0; f < this.floaters.length; f++) this.floaters[f].setVisible(false);
    },
    updateParticles: function (dt) {
      var names = Object.keys(this.pools);
      for (var n = 0; n < names.length; n++) {
        var pool = this.pools[names[n]];
        for (var i = 0; i < pool.length; i++) {
          var p = pool[i];
          if (!p.visible) continue;
          p._life -= dt;
          if (p._life <= 0) { p.setVisible(false); continue; }
          p.x += p._vx * dt;
          p.y += p._vy * dt;
          p._vy += p._g * dt;
          p.setAlpha(clamp(p._life / p._max, 0, 1));
        }
      }
    },
    spawnFloater: function (x, y, text, color) {
      for (var i = 0; i < this.floaters.length; i++) {
        var f = this.floaters[i];
        if (f.visible) continue;
        f.setPosition(x, y).setVisible(true).setAlpha(1);
        setTextIfChanged(f, text);
        setColorIfChanged(f, color);
        f._life = 0.85;
        return;
      }
    },
    updateFloaters: function (dt) {
      for (var i = 0; i < this.floaters.length; i++) {
        var f = this.floaters[i];
        if (!f.visible) continue;
        f._life -= dt;
        if (f._life <= 0) { f.setVisible(false); continue; }
        f.y -= 26 * dt;
        f.setAlpha(clamp(f._life / 0.4, 0, 1));
      }
    },
    drainResults: function () {
      var c = state.combat;
      if (!c) { this.seenResult = 0; return; }
      for (var i = 0; i < c.resolveQueue.length; i++) {
        var e = c.resolveQueue[i];
        if (!e || e.n <= this.seenResult) continue;
        this.seenResult = e.n;
        var u = unitByUid(e.uid);
        if (!u) continue;
        var pos = u.side === 'foe' ? foePos(u) : partyPos(u);
        this.spawnFloater(pos.x, pos.y - 48, e.text, e.color);
        if (e.text.indexOf('-') === 0 || e.icon === '✦') this.emit('hit', pos.x, pos.y - 16, e.color, 8, 130);
        else if (e.text.indexOf('✚') === 0) this.emit('heal', pos.x, pos.y - 10, CSS.mint, 8, 60);
        else if (e.text === 'BONDED' || e.text === 'DOWN') this.emit('reward', pos.x, pos.y - 20, e.text === 'BONDED' ? CSS.gold : e.color, 12, 150);
      }
    },

    /* --------------------------------------------------------- painting */

    paintAll: function () {
      this.paintTitle();
      this.paintWorld();
      this.paintHub();
      this.paintBattle();
      this.paintHud();
      this.paintPanels();
      this.paintDialogue();
      this.paintBanner();
      this.paintResult();
      this.paintPause();
    },

    paintTitle: function () {
      var on = state.mode === 'title';
      setVis(this.titleSky, on);
      setVis(this.titleBack, on); setVis(this.titleVig, on); setVis(this.logo, on);
      setVis(this.titleSub, on); setVis(this.titleBest, on);
      for (var i = 0; i < 3; i++) { setVis(this.titleBtns[i].rect, on); setVis(this.titleBtns[i].text, on); }
      if (!on) return;
      if (this.titleBack.texture.key !== 'hub-' + state.hubTier) this.titleBack.setTexture('hub-' + state.hubTier);
      setTextIfChanged(this.titleBest, 'Best  ' + state.best.quests + '/30 quests  ·  arena ' + state.best.arena + '/15  ·  ' + state.best.score);
      setTextIfChanged(this.titleBtns[0].text, questsDoneCount() || state.score ? 'CONTINUE' : 'BEGIN THE ROAD');
      this.logo.setY(258 + Math.sin(this.clock * 1.1) * 4);
    },

    paintWorld: function () {
      var f = state.field;
      var on = !!f && (state.mode === 'field' || (state.mode === 'dialogue' && !!f));
      setVis(this.mapImg, on);
      setVis(this.player, on);
      setVis(this.meterBack, on); setVis(this.meterFill, on);
      var i;
      for (i = 0; i < this.glows.length; i++) setVis(this.glows[i], false);
      for (i = 0; i < this.npcSprites.length; i++) { setVis(this.npcSprites[i], false); setVis(this.npcTags[i], false); }
      for (i = 0; i < this.markerSprites.length; i++) setVis(this.markerSprites[i], false);
      for (i = 0; i < this.followers.length; i++) setVis(this.followers[i], false);
      setVis(this.gateRing, false); setVis(this.escortSprite, false); setVis(this.edgePin, false);
      var showControls = on && state.mode === 'field';
      setVis(this.stickBase, showControls); setVis(this.stickKnob, showControls); setVis(this.actBtn, showControls);
      if (!on) return;

      var key = 'map-' + f.map.region;
      if (this.mapImg.texture.key !== key) this.mapImg.setTexture(key);
      this.mapImg.setPosition(-f.camX, -f.camY);

      var rd = regionData(f.map.region);
      var glowColor = hexOf(rd.festival);
      var gi = 0;
      for (i = 0; i < f.map.props.length && gi < this.glows.length; i++) {
        var p = f.map.props[i];
        var gx = p.x - f.camX, gy = p.y - f.camY - 18;
        if (gx < -40 || gx > W + 40 || gy < -40 || gy > H + 40) continue;
        var g = this.glows[gi++];
        g.setPosition(gx, gy).setVisible(true).setTint(glowColor);
        g.setScale(1.6 + Math.sin(this.clock * 1.8 + p.phase) * 0.25);
        g.setAlpha(0.24 + Math.sin(this.clock * 1.8 + p.phase) * 0.08);
      }
      for (i = 0; i < f.npcs.length && i < this.npcSprites.length; i++) {
        var n = f.npcs[i];
        var nx = n.x - f.camX, ny = n.y - f.camY;
        if (nx < -40 || nx > W + 40 || ny < -40 || ny > H + 40) continue;
        this.npcSprites[i].setPosition(nx, ny + Math.sin(this.clock * 2 + i) * 2).setVisible(true);
        this.npcTags[i].setPosition(nx, ny - 30).setVisible(Math.hypot(n.x - f.px, n.y - f.py) < 90);
        setTextIfChanged(this.npcTags[i], n.name);
      }
      var mk = 0;
      for (i = 0; i < f.markers.length && mk < this.markerSprites.length; i++) {
        var m = f.markers[i];
        if (m.taken) continue;
        var mx = m.x - f.camX, my = m.y - f.camY;
        var spr = this.markerSprites[mk++];
        if (mx < -30 || mx > W + 30 || my < -30 || my > H + 30) { spr.setVisible(false); continue; }
        spr.setPosition(mx, my - 26 + Math.sin(this.clock * 3) * 3).setVisible(true);
      }
      var nm = nearestMarker();
      if (nm) {
        var ex = nm.x - f.camX, ey = nm.y - f.camY;
        /* The edge pin never enters a thumb zone or the HUD bar. */
        if (ex < 26 || ex > W - 26 || ey < 128 || ey > 640) {
          this.edgePin.setPosition(clamp(ex, 28, W - 28), clamp(ey, 132, 640)).setVisible(true);
        }
      }
      if (f.gateOpen) {
        var qx = f.map.gate.x - f.camX, qy = f.map.gate.y - f.camY;
        if (qx > -60 && qx < W + 60 && qy > -60 && qy < H + 60) {
          this.gateRing.setPosition(qx, qy).setVisible(true);
          this.gateRing.setScale(0.8 + Math.sin(this.clock * 2.4) * 0.08);
        }
      }
      if (f.escorting && f.follower) {
        this.escortSprite.setPosition(f.follower.x - f.camX, f.follower.y - f.camY).setVisible(true);
      }
      for (i = 1; i < state.party.length && i - 1 < this.followers.length; i++) {
        var t = f.trail[Math.max(0, f.trail.length - 1 - i * 13)];
        var fs = this.followers[i - 1];
        var texKey = 'hero-' + state.party[i];
        if (fs.texture.key !== texKey) fs.setTexture(texKey);
        fs.setPosition(t.x - f.camX, t.y - f.camY - 4).setVisible(true);
        fs.setFrame(heroFrame(f.dir, f.anim, f.walkClock + i));
        fs.setAlpha(0.92);
      }
      var pk = 'hero-' + state.party[0];
      if (this.player.texture.key !== pk) this.player.setTexture(pk);
      this.player.setPosition(f.px - f.camX, f.py - f.camY);
      this.player.setFrame(heroFrame(f.dir, f.anim, f.walkClock));

      var onGrass = tileAt(f.map, f.px, f.py) === 2;
      setVis(this.meterBack, onGrass || f.meter > 0.02);
      setVis(this.meterFill, onGrass || f.meter > 0.02);
      this.meterFill.setDisplaySize(Math.max(2, 148 * clamp(f.meter, 0, 1)), 6);
      this.stickBase.setPosition(stick.active ? stick.ox : UI.stick.x, stick.active ? stick.oy : UI.stick.y);
      this.stickKnob.setPosition(stick.active ? stick.hx : UI.stick.x, stick.active ? stick.hy : UI.stick.y);
      this.actBtn.setAlpha(0.75 + Math.sin(this.clock * 3) * 0.06);
    },

    paintHub: function () {
      var on = state.mode === 'hub';
      setVis(this.hubImg, on);
      setVis(this.vignette, on);
      var i;
      for (i = 0; i < this.hubLines.length; i++) setVis(this.hubLines[i], on && !state.submenu);
      var showBtns = on && !state.submenu;
      for (i = 0; i < this.cmd.length; i++) {
        var b = this.cmd[i];
        setVis(b.rect, showBtns || (state.mode === 'battle' && this.battleCmdVisible));
        setVis(b.icon, b.rect.visible); setVis(b.label, b.rect.visible); setVis(b.sub, b.rect.visible);
      }
      if (!on) return;
      var key = 'hub-' + clamp(state.hubTier, 0, 4);
      if (this.hubImg.texture.key !== key) this.hubImg.setTexture(key);
      if (!showBtns) return;
      var done = questsDoneCount();
      setTextIfChanged(this.hubLines[0], HUB_TIERS[clamp(state.hubTier, 0, 4)].name);
      var q = state.activeQuest ? questData(state.activeQuest) : null;
      setTextIfChanged(this.hubLines[1], q ? 'Open quest: ' + q.title : 'No quest taken. Visit the board.');
      setTextIfChanged(this.hubLines[2], 'Act ' + state.act + '  ·  quests ' + done + '/30  ·  arena ' + state.arenaRung + '/15  ·  ' + state.coin + ' coin');
      for (i = 0; i < HUB_ACTIONS.length; i++) {
        var a = HUB_ACTIONS[i];
        var locked = state.hubTier < a.tier;
        var cb = this.cmd[i];
        setTextIfChanged(cb.icon, a.icon);
        setTextIfChanged(cb.label, a.label);
        setTextIfChanged(cb.sub, locked ? 'locked' : a.id === 'quests' ? state.offered.length + ' open' : a.id === 'depart' ? regionData(q ? q.region : REGION_KEYS[state.act - 1]).short : '');
        setColorIfChanged(cb.icon, locked ? CSS.dim : CSS.gold);
        setColorIfChanged(cb.label, locked ? CSS.dim : CSS.text);
        cb.rect.setStrokeStyle(2, locked ? HEX.line : a.id === 'depart' ? HEX.gold : HEX.line, 1);
        cb.rect.setAlpha(locked ? 0.5 : 1);
      }
    },

    paintBattle: function () {
      var c = state.combat;
      var on = state.mode === 'battle' && !!c;
      this.battleCmdVisible = false;
      setVis(this.battleBack, on);
      var i;
      for (i = 0; i < this.railChips.length; i++) { setVis(this.railChips[i].rect, on); setVis(this.railChips[i].text, on); }
      for (i = 0; i < this.foeSprites.length; i++) {
        var fx = this.foeSprites[i];
        setVis(fx.img, false); setVis(fx.back, false); setVis(fx.fill, false); setVis(fx.status, false);
      }
      setVis(this.foeTargetRing, false); setVis(this.foeName, on); setVis(this.foeSub, on);
      for (i = 0; i < this.partySprites.length; i++) setVis(this.partySprites[i], false);
      setVis(this.activeBracket, false);
      var listOpen = on && (c.ui === 'skill' || c.ui === 'item');
      for (i = 0; i < this.cards.length; i++) {
        var card = this.cards[i];
        var cardOn = on && !listOpen;
        setVis(card.rect, cardOn); setVis(card.port, cardOn); setVis(card.name, cardOn);
        setVis(card.hpBack, cardOn); setVis(card.hpFill, cardOn); setVis(card.spBack, cardOn);
        setVis(card.spFill, cardOn); setVis(card.status, cardOn); setVis(card.row, cardOn);
      }
      setVis(this.listDim, listOpen);
      for (i = 0; i < this.listRows.length; i++) {
        var lr = this.listRows[i];
        setVis(lr.rect, false); setVis(lr.text, false); setVis(lr.sub, false); setVis(lr.tag, false);
      }
      setVis(this.listBack.rect, listOpen); setVis(this.listBack.text, listOpen);
      if (!on) return;

      var bkey = 'bback-' + state.region;
      if (this.battleBack.texture.key !== bkey) this.battleBack.setTexture(bkey);

      /* turn timeline */
      var order = buildTimeline(7);
      for (i = 0; i < this.railChips.length; i++) {
        var chip = this.railChips[i];
        var u = i < order.length ? unitByUid(order[i]) : null;
        setVis(chip.rect, !!u); setVis(chip.text, !!u);
        if (!u) continue;
        setTextIfChanged(chip.text, u.side === 'party' ? blueprint(u.ref).glyph : familyMark(u));
        setColorIfChanged(chip.text, u.color);
        chip.rect.setStrokeStyle(i === 0 ? 3 : 2, i === 0 ? HEX.gold : hexOf(u.color), 1);
        chip.rect.setFillStyle(u.side === 'party' ? HEX.panel2 : HEX.panel, i === 0 ? 1 : 0.8);
        chip.rect.setScale(i === 0 ? 1.06 : 1);
      }

      /* foes */
      var foes = foeList();
      var reach = reachableFoes(true);
      var focus = reach[clamp(c.focusFoe, 0, Math.max(0, reach.length - 1))] || null;
      for (i = 0; i < foes.length && i < this.foeSprites.length; i++) {
        var u2 = foes[i];
        var slot = this.foeSprites[i];
        var pos = foePos(u2);
        var sx = pos.x + (u2.shakeT > 0 && kit.juice.enabled ? (Math.random() - 0.5) * 8 : 0);
        var tex = foeTexture(u2);
        if (slot.img.texture.key !== tex) slot.img.setTexture(tex);
        slot.img.setPosition(sx, pos.y).setVisible(true);
        slot.img.setScale((u2.boss ? 1.0 : 0.82) * (u2.row === 'back' ? 0.86 : 1));
        slot.img.setAlpha(u2.alive ? 1 : 0.22);
        if (u2.flash > 0) slot.img.setTintFill(0xffffff); else slot.img.clearTint();
        var ratio = clamp(u2.hp / u2.maxHp, 0, 1);
        var barY = pos.y + (u2.boss ? 66 : 44);
        slot.back.setPosition(pos.x, barY).setVisible(u2.alive);
        slot.fill.setPosition(pos.x - 30, barY).setVisible(u2.alive);
        slot.fill.setDisplaySize(Math.max(2, 60 * ratio), 5);
        slot.fill.setFillStyle(ratio > 0.5 ? HEX.rose : HEX.red, 1);
        var sl = statusLine(u2);
        setVis(slot.status, u2.alive && !!sl);
        if (sl) { slot.status.setPosition(pos.x, barY + 16); setTextIfChanged(slot.status, sl); }
      }
      if (focus && focus.alive) {
        var fp = foePos(focus);
        this.foeTargetRing.setPosition(fp.x, fp.y).setVisible(true).setScale(focus.boss ? 1.05 : 0.8);
        this.foeTargetRing.setAlpha(0.55 + Math.sin(this.clock * 4) * 0.18);
        setTextIfChanged(this.foeName, focus.name + '   ' + elemData(focus.element).icon);
        setColorIfChanged(this.foeName, focus.color);
        var bo = bondTarget();
        setTextIfChanged(this.foeSub, Math.max(0, Math.ceil(focus.hp)) + ' / ' + focus.maxHp +
          (bo ? '   ·   bond ' + Math.round(bondOdds() * 100) + '%' : ''));
      } else {
        setTextIfChanged(this.foeName, '');
        setTextIfChanged(this.foeSub, '');
      }

      /* party on the field */
      var pl = partyList();
      for (i = 0; i < pl.length && i < this.partySprites.length; i++) {
        var pu = pl[i];
        var pp = partyPos(pu);
        var spr = this.partySprites[i];
        var pkey = 'hero-' + pu.ref;
        if (spr.texture.key !== pkey) spr.setTexture(pkey);
        var jitter = pu.shakeT > 0 && kit.juice.enabled ? (Math.random() - 0.5) * 6 : 0;
        spr.setPosition(pp.x + jitter, pp.y).setVisible(true);
        spr.setScale(pu.row === 'front' ? 1.5 : 1.28);
        spr.setAlpha(pu.alive ? 1 : 0.28);
        spr.setFrame(heroFrame('down', pu.alive ? pu.anim : 'down', this.clock * 2 + i));
        if (pu.flash > 0) spr.setTintFill(0xffffff); else spr.clearTint();
      }

      /* portrait rail */
      var active = unitByUid(c.activeUid);
      for (i = 0; i < 4; i++) {
        var cd = this.cards[i];
        var mu = pl[i];
        if (!mu) { setVis(cd.rect, false); setVis(cd.port, false); setVis(cd.name, false); setVis(cd.hpBack, false); setVis(cd.hpFill, false); setVis(cd.spBack, false); setVis(cd.spFill, false); setVis(cd.status, false); setVis(cd.row, false); continue; }
        if (listOpen) continue;
        var pkey2 = 'port-' + mu.ref;
        if (cd.port.texture.key !== pkey2) cd.port.setTexture(pkey2);
        cd.port.setAlpha(mu.alive ? 1 : 0.3);
        setTextIfChanged(cd.name, mu.name);
        setColorIfChanged(cd.name, mu.alive ? CSS.text : CSS.red);
        var hr = clamp(mu.hp / mu.maxHp, 0, 1);
        cd.hpFill.setDisplaySize(Math.max(2, 72 * hr), 7);
        cd.hpFill.setFillStyle(hr > 0.35 ? HEX.mint : HEX.red, 1);
        var sr = mu.maxSp > 0 ? clamp(mu.sp / mu.maxSp, 0, 1) : 0;
        cd.spFill.setDisplaySize(Math.max(2, 72 * sr), 4);
        setTextIfChanged(cd.status, statusLine(mu));
        setTextIfChanged(cd.row, mu.row === 'front' ? '▲' : '▼');
        setColorIfChanged(cd.row, mu.row === 'front' ? CSS.ember : CSS.sky);
        var isActive = active && active.uid === mu.uid;
        var isFocus = c.focusAlly === i;
        cd.rect.setStrokeStyle(isActive ? 3 : 2, isActive ? HEX.gold : isFocus ? HEX.mint : hexOf(mu.color), 1);
        cd.rect.setAlpha(mu.alive ? 0.95 : 0.6);
        if (isActive) {
          var ar = cardRect(i);
          this.activeBracket.setPosition(ar.x + ar.w / 2, ar.y + ar.h / 2).setDisplaySize(ar.w + 6, ar.h + 6).setVisible(true);
        }
      }

      /* command panel or the open list */
      var choosing = c.phase === 'choose' && active && active.side === 'party';
      this.battleCmdVisible = !listOpen;
      for (i = 0; i < this.cmd.length; i++) {
        var cb2 = this.cmd[i];
        setVis(cb2.rect, !listOpen); setVis(cb2.icon, !listOpen); setVis(cb2.label, !listOpen); setVis(cb2.sub, !listOpen);
        if (listOpen) continue;
        var def = CMD[i];
        var enabled = choosing;
        if (def.id === 'bond') enabled = choosing && !!bondTarget();
        setTextIfChanged(cb2.icon, def.icon);
        setTextIfChanged(cb2.label, def.label);
        var sub = '';
        if (def.id === 'skill' && active) sub = 'focus ' + Math.round(active.sp);
        else if (def.id === 'item') sub = state.items.tonic + ' tonic';
        else if (def.id === 'bond') sub = bondTarget() ? Math.round(bondOdds() * 100) + '%' : 'none';
        else if (def.id === 'swap') sub = 'front / back';
        setTextIfChanged(cb2.sub, sub);
        setColorIfChanged(cb2.icon, enabled ? def.color : CSS.dim);
        setColorIfChanged(cb2.label, enabled ? CSS.text : CSS.dim);
        cb2.rect.setAlpha(enabled ? 1 : 0.42);
        cb2.rect.setStrokeStyle(2, enabled ? hexOf(def.color) : HEX.line, 1);
      }
      if (listOpen) {
        var list = c.ui === 'skill' ? activeSkills() : ITEM_KEYS;
        for (i = 0; i < this.listRows.length; i++) {
          var row = this.listRows[i];
          var has = i < list.length;
          setVis(row.rect, has); setVis(row.text, has); setVis(row.sub, has); setVis(row.tag, has);
          if (!has) continue;
          if (c.ui === 'skill') {
            var sk = skillData(list[i]);
            setTextIfChanged(row.text, sk.name);
            setTextIfChanged(row.sub, ellipsize(sk.note, 44));
            setTextIfChanged(row.tag, (sk.element ? elemData(sk.element).icon + '  ' : '') + sk.sp + ' focus');
            var afford = active && active.sp >= sk.sp;
            setColorIfChanged(row.text, afford ? CSS.text : CSS.dim);
            setColorIfChanged(row.tag, afford ? CSS.gold : CSS.red);
            row.rect.setAlpha(afford ? 1 : 0.55);
          } else {
            var it = itemData(list[i]);
            var n = state.items[list[i]] || 0;
            setTextIfChanged(row.text, it.icon + '  ' + it.name);
            setTextIfChanged(row.sub, ellipsize(it.note, 44));
            setTextIfChanged(row.tag, 'x' + n);
            setColorIfChanged(row.text, n > 0 ? CSS.text : CSS.dim);
            setColorIfChanged(row.tag, n > 0 ? CSS.gold : CSS.red);
            row.rect.setAlpha(n > 0 ? 1 : 0.55);
          }
        }
      }
    },

    paintHud: function () {
      var on = (state.mode === 'hub' && !state.submenu) || state.mode === 'field' || state.mode === 'battle' || state.mode === 'dialogue';
      setVis(this.hudBar, on); setVis(this.hudTitle, on); setVis(this.hudSub, on);
      setVis(this.hudChip, on); setVis(this.hudChip2, on);
      setVis(this.pauseChip.rect, on); setVis(this.pauseChip.text, on);
      var showAuto = on && state.mode === 'battle';
      var showQuest = on && state.mode === 'field';
      setVis(this.actionChip.rect, showAuto); setVis(this.actionChip.text, showAuto);
      setVis(this.questChip.rect, showQuest); setVis(this.questChip.text, showQuest);
      var showToast = on && state.toastTime > 0 && !!state.toast;
      setVis(this.coachBack, showToast); setVis(this.coachText, showToast);
      if (!on) return;

      if (state.mode === 'hub') {
        setTextIfChanged(this.hudTitle, 'LANTERN CAPITAL');
        setTextIfChanged(this.hudSub, HUB_TIERS[clamp(state.hubTier, 0, 4)].name);
      } else if (state.mode === 'battle' && state.combat) {
        var c = state.combat;
        setTextIfChanged(this.hudTitle, c.kind === 'boss' ? 'THE BENCH' : c.kind === 'arena' ? 'SKY ARENA' : 'ROADSIDE');
        var act = unitByUid(c.activeUid);
        setTextIfChanged(this.hudSub, c.phase === 'choose' && act ? act.name + ' acts' : c.phase === 'enemy' ? 'Rival turn' : c.phase === 'resolve' ? 'Resolving' : c.phase === 'won' ? 'Cleared' : c.phase === 'lost' ? 'Fallen' : 'Ready');
      } else {
        setTextIfChanged(this.hudTitle, regionData(state.region).name.toUpperCase());
        setTextIfChanged(this.hudSub, ellipsize(fieldObjectiveText(), 27));
      }
      setTextIfChanged(this.hudChip, '◆ ' + state.coin);
      setTextIfChanged(this.hudChip2, fmtTime(state.elapsed));
      setTextIfChanged(this.actionChip.text, state.auto ? 'AUTO ON' : 'AUTO');
      setColorIfChanged(this.actionChip.text, state.auto ? CSS.mint : CSS.dim);
      this.actionChip.rect.setStrokeStyle(2, state.auto ? HEX.mint : HEX.line, 1);

      if (showToast) {
        var coach = state.toastKind === 'coach';
        /* Coach copy is one thin strip at the top edge. In-play events use a
         * small chip that never overlaps the turn rail or the play area. */
        var ty = state.mode === 'battle' ? UI.strip.y + 14 : 92;
        setTextIfChanged(this.coachText, ellipsize(state.toast, coach ? 52 : 34));
        setColorIfChanged(this.coachText, state.toastColor);
        var tw = Math.min(358, Math.ceil(this.coachText.width) + 24);
        var cx = coach ? 195 : Math.max(tw / 2 + 16, 374 - tw / 2);
        this.coachBack.setPosition(cx, ty);
        this.coachBack.setSize(tw, coach ? 30 : 26);
        this.coachText.setPosition(cx, ty);
        var fade = coach ? 0.8 : 0.3;
        var alpha = kit.juice.enabled ? clamp(state.toastTime / fade, 0, 1) : 1;
        this.coachBack.setAlpha(alpha * 0.85);
        this.coachText.setAlpha(alpha);
      }
    },

    paintPanels: function () {
      var on = state.mode === 'hub' && !!state.submenu;
      setVis(this.panelDim, on); setVis(this.panelBack, on);
      setVis(this.panelTitle, on); setVis(this.panelNote, on);
      setVis(this.panelBackBtn.rect, on); setVis(this.panelBackBtn.text, on);
      var pages = on ? panelPages() : 1;
      setVis(this.panelPageBtn.rect, on && pages > 1); setVis(this.panelPageBtn.text, on && pages > 1);
      var i;
      var isMember = on && state.submenu === 'member';
      setVis(this.panelFoot, on && !isMember);
      setVis(this.memberPort, isMember); setVis(this.memberName, isMember); setVis(this.memberInfo, isMember);
      for (i = 0; i < this.memberBtns.length; i++) {
        setVis(this.memberBtns[i].rect, isMember); setVis(this.memberBtns[i].text, isMember); setVis(this.memberBtns[i].sub, isMember);
      }
      var rows = on ? panelRows() : [];
      for (i = 0; i < this.panelRows.length; i++) {
        var pr = this.panelRows[i];
        var has = i < rows.length;
        setVis(pr.rect, has); setVis(pr.text, has); setVis(pr.sub, has); setVis(pr.tag, has);
      }
      if (!on) return;

      var titles = { quests: 'COURT QUEST BOARD', roster: 'THE COMPANY', forge: 'THE FORGE', arena: 'SKY ARENA LADDER', academy: 'THE ACADEMY', member: 'WAYFARER' };
      setTextIfChanged(this.panelTitle, isMember ? memberStats(selectedMember).name.toUpperCase() : (titles[state.submenu] || 'CAPITAL'));
      setTextIfChanged(this.panelNote, pages > 1 ? 'page ' + (panelPage + 1) + '/' + pages : state.coin + ' coin');
      if (!isMember) {
        var mline = [];
        for (var mk = 0; mk < MAT_KEYS.length; mk++) mline.push(matData(MAT_KEYS[mk]).icon + ' ' + (state.mats[MAT_KEYS[mk]] || 0));
        var comp = 0;
        for (var rid in state.roster) if (state.roster[rid].recruited) comp++;
        var foot = 'Satchel   ' + mline.join('    ') + '\n' + state.coin + ' coin   ·   ' + comp + '/12 companions   ·   act ' + state.act + ' of 5';
        if (state.submenu === 'quests') foot += '\n\nThe board fills as each bench opens. Five acts, thirty quests: fetch, purge, escort, riddle and the benches themselves.';
        else if (state.submenu === 'forge') foot += '\n\nDrops come from every fight and every filed quest. One of each item can be worn at a time across the whole company.';
        else if (state.submenu === 'arena') foot += '\n\nFifteen fixed rungs. Win a rung to open the next. Rungs never expire and can be refought for materials.';
        else if (state.submenu === 'academy') foot += '\n\nA wayfarer changes class at rank 5, then again at rank 10. The new class keeps every rank and every art learned.';
        else foot += '\n\nTap a wayfarer to set row, orders and gear. Orders drive what they do while auto battle has the reins.';
        setTextIfChanged(this.panelFoot, foot);
        this.panelFoot.setY(UI.panel.y + rows.length * UI.panel.rowH + 14);
      }

      for (i = 0; i < rows.length; i++) {
        var row = rows[i];
        var view = this.panelRows[i];
        var stroke = HEX.line, alpha = 1;
        if (row.kind === 'quest') {
          var q = questData(row.id);
          setTextIfChanged(view.text, q.title);
          var goal = q.type === 'fetch' ? q.count + ' to gather' : q.type === 'purge' ? q.count + ' to settle' :
            q.type === 'escort' ? 'walk them home' : q.type === 'riddle' ? 'one question' : 'a bench hears you';
          setTextIfChanged(view.sub, ellipsize(q.type.toUpperCase() + '  ·  ' + regionData(q.region).short + '  ·  ' + goal, 46));
          setTextIfChanged(view.tag, q.coin + ' ◆');
          stroke = q.type === 'boss' ? HEX.ember : HEX.line;
          setColorIfChanged(view.text, q.type === 'boss' ? CSS.ember : CSS.text);
        } else if (row.kind === 'active') {
          var aq = questData(row.id);
          setTextIfChanged(view.text, 'OPEN  ·  ' + aq.title);
          setTextIfChanged(view.sub, ellipsize(fieldObjectiveText(), 46));
          setTextIfChanged(view.tag, 'GO');
          stroke = HEX.gold;
          setColorIfChanged(view.text, CSS.gold);
        } else if (row.kind === 'member') {
          var ms = memberStats(row.id);
          var mm = state.roster[row.id];
          setTextIfChanged(view.text, ms.name + '  ·  ' + ms.className);
          setTextIfChanged(view.sub, ellipsize('Rank ' + ms.rank + '   ' + Math.round(mm.hp) + '/' + ms.maxHp + ' vit   ' + elemData(ms.element).icon + '   ' + ms.order, 46));
          setTextIfChanged(view.tag, state.party.indexOf(row.id) >= 0 ? 'PARTY' : canClassChange(row.id) ? 'RANK UP' : '');
          setColorIfChanged(view.text, ms.color);
          stroke = state.party.indexOf(row.id) >= 0 ? HEX.gold : HEX.line;
        } else if (row.kind === 'gear') {
          var g = gearData(row.id);
          var costs = [];
          for (var k in g.cost) costs.push(matData(k).icon + g.cost[k] + '/' + (state.mats[k] || 0));
          setTextIfChanged(view.text, g.name + (state.gear[row.id] ? '  (owned)' : ''));
          var bonus = [];
          if (g.atk) bonus.push('atk +' + g.atk);
          if (g.def) bonus.push('def +' + g.def);
          if (g.hp) bonus.push('vit +' + g.hp);
          if (g.spd) bonus.push('spd +' + g.spd);
          if (g.sp) bonus.push('focus +' + g.sp);
          setTextIfChanged(view.sub, ellipsize(bonus.join('  ') + '   ' + costs.join('  '), 46));
          setTextIfChanged(view.tag, g.coin + ' ◆');
          var ok = canCraft(row.id);
          setColorIfChanged(view.tag, ok ? CSS.gold : CSS.red);
          alpha = ok ? 1 : 0.62;
        } else if (row.kind === 'rung') {
          var ar = arenaData(row.id);
          var names = [];
          for (var si = 0; si < ar.squad.length; si++) names.push(enemyData(ar.squad[si]).name);
          setTextIfChanged(view.text, 'Rung ' + ar.rung + '  ·  ' + ar.name);
          setTextIfChanged(view.sub, ellipsize(names.join(', '), 46));
          var cleared = state.arenaRung >= ar.rung;
          var open = ar.rung <= state.arenaRung + 1;
          setTextIfChanged(view.tag, cleared ? 'CLEARED' : open ? ar.coin + ' ◆' : 'LOCKED');
          setColorIfChanged(view.tag, cleared ? CSS.mint : open ? CSS.gold : CSS.dim);
          alpha = open ? 1 : 0.5;
          stroke = cleared ? HEX.mint : HEX.line;
        } else if (row.kind === 'stat') {
          var sm = memberStats(selectedMember);
          var rm = state.roster[selectedMember];
          if (row.id === 'a') {
            setTextIfChanged(view.text, 'VITALITY  ' + Math.round(rm.hp) + ' / ' + sm.maxHp);
            setTextIfChanged(view.sub, 'Focus ' + Math.round(rm.sp) + ' / ' + sm.maxSp + '    Speed ' + sm.spd);
            setTextIfChanged(view.tag, elemData(sm.element).icon + ' ' + elemData(sm.element).name);
          } else if (row.id === 'b') {
            setTextIfChanged(view.text, 'ATTACK ' + sm.atk + '     DEFENSE ' + sm.def);
            setTextIfChanged(view.sub, ellipsize(sm.trait + ': ' + sm.traitText, 46));
            setTextIfChanged(view.tag, sm.row === 'front' ? '▲ front' : '▼ back');
          } else {
            var need = rankNeed(sm.rank);
            setTextIfChanged(view.text, 'RANK ' + sm.rank + '  ·  ' + sm.className);
            setTextIfChanged(view.sub, 'Next rank in ' + Math.max(0, need - rm.xp) + ' points');
            setTextIfChanged(view.tag, canClassChange(selectedMember) ? 'CLASS READY' : '');
            setColorIfChanged(view.tag, canClassChange(selectedMember) ? CSS.violet : CSS.dim);
          }
          stroke = HEX.panel2;
        }
        view.rect.setStrokeStyle(2, stroke, 1);
        view.rect.setAlpha(alpha);
      }

      if (isMember) {
        var mid = selectedMember;
        var sm2 = memberStats(mid);
        var pkey = 'port-' + mid;
        if (this.memberPort.texture.key !== pkey) this.memberPort.setTexture(pkey);
        setTextIfChanged(this.memberName, sm2.name + '  ·  ' + sm2.className);
        setTextIfChanged(this.memberInfo, sm2.trait + '. ' + sm2.traitText + ' Orders decide what this wayfarer does on auto battle.');
        var labels = [
          { l: 'WEAPON', s: sm2.cls && state.roster[mid].equip.weapon ? gearData(state.roster[mid].equip.weapon).name : 'none' },
          { l: 'ARMOR', s: state.roster[mid].equip.armor ? gearData(state.roster[mid].equip.armor).name : 'none' },
          { l: 'CHARM', s: state.roster[mid].equip.charm ? gearData(state.roster[mid].equip.charm).name : 'none' },
          { l: 'ROW', s: state.roster[mid].row === 'front' ? '▲ front' : '▼ back' },
          { l: 'ORDER', s: state.roster[mid].order },
          { l: state.party.indexOf(mid) < 0 ? 'JOIN PARTY' : 'CLASS CHANGE', s: state.party.indexOf(mid) < 0 ? 'walk with you' : canClassChange(mid) ? classData(CLASS_LINE[blueprint(mid).arch][CLASS_LINE[blueprint(mid).arch].indexOf(state.roster[mid].cls) + 1] || state.roster[mid].cls).name : 'rank 5 needed' }
        ];
        for (i = 0; i < this.memberBtns.length; i++) {
          setTextIfChanged(this.memberBtns[i].text, labels[i].l);
          setTextIfChanged(this.memberBtns[i].sub, labels[i].s);
          this.memberBtns[i].text.setY(560 + Math.floor(i / 2) * 66 + 20);
        }
      }
    },

    paintDialogue: function () {
      var d = state.dialogue;
      var on = state.mode === 'dialogue' && !!d;
      setVis(this.dlgDim, on); setVis(this.dlgBack, on); setVis(this.dlgPort, on);
      setVis(this.dlgName, on); setVis(this.dlgBody, on); setVis(this.dlgHint, on && !d.choices);
      var i;
      for (i = 0; i < 3; i++) {
        var show = on && !!d.choices && i < d.choices.length;
        setVis(this.dlgChoices[i].rect, show);
        setVis(this.dlgChoices[i].text, show);
      }
      if (!on) return;
      var tex = 'ui-npc';
      for (i = 0; i < JUDGES.length; i++) if (JUDGES[i].name === d.speaker) tex = 'foe-judge-' + JUDGES[i].id;
      for (i = 0; i < ROSTER_BLUEPRINT.length; i++) if (ROSTER_BLUEPRINT[i].name === d.speaker) tex = 'port-' + ROSTER_BLUEPRINT[i].id;
      if (this.dlgPort.texture.key !== tex) this.dlgPort.setTexture(tex);
      this.dlgPort.setDisplaySize(64, 64);
      setTextIfChanged(this.dlgName, d.speaker);
      setTextIfChanged(this.dlgBody, d.body.slice(0, Math.floor(d.reveal)));
      setTextIfChanged(this.dlgHint, d.reveal < d.body.length ? 'tap to reveal' : 'tap to continue');
      if (d.choices) {
        for (i = 0; i < d.choices.length; i++) {
          setTextIfChanged(this.dlgChoices[i].text, (i + 1) + '.  ' + d.choices[i]);
        }
      }
    },

    paintBanner: function () {
      var b = state.banner;
      var on = !!b;
      setVis(this.bannerBack, on); setVis(this.bannerTitle, on); setVis(this.bannerSub, on); setVis(this.bannerHint, on);
      if (!on) return;
      var sc = b.scale || 1;
      this.bannerBack.setScale(sc);
      this.bannerTitle.setScale(sc);
      this.bannerSub.setScale(sc);
      this.bannerBack.setStrokeStyle(3, hexOf(b.color), 1);
      setTextIfChanged(this.bannerTitle, b.title);
      setColorIfChanged(this.bannerTitle, b.color);
      setTextIfChanged(this.bannerSub, b.subtitle);
      setTextIfChanged(this.bannerHint, b.behavior === 'manual' ? 'tap to continue' : '');
    },

    paintResult: function () {
      var on = state.mode === 'result';
      setVis(this.resultText, on);
      if (!on) return;
      setTextIfChanged(this.resultText,
        'Five benches heard your company and let the road stay open.\n\n' +
        'Quests filed  ' + questsDoneCount() + ' / 30\n' +
        'Arena rungs  ' + state.arenaRung + ' / 15\n' +
        'Companions  ' + (function () { var n = 0; for (var id in state.roster) if (state.roster[id].recruited) n++; return n; })() + ' / 12\n' +
        'Score  ' + Math.round(state.score) + '     Road time  ' + fmtTime(state.elapsed));
    },

    paintPause: function () {
      var on = !!state.pauseHint;
      setVis(this.pauseDim, on); setVis(this.pauseTitle, on); setVis(this.pauseSub, on);
      for (var i = 0; i < 3; i++) { setVis(this.pauseBtns[i].rect, on); setVis(this.pauseBtns[i].text, on); }
      if (!on) return;
      setTextIfChanged(this.pauseSub, 'Act ' + state.act + '  ·  ' + questsDoneCount() + '/30 quests  ·  ' + fmtTime(state.elapsed));
    },

    ambient: function (dt) {
      this.ambClock -= dt;
      if (this.ambClock > 0) return;
      this.ambClock = 0.55;
      if (!kit.juice.enabled) return;
      if (state.mode === 'hub') this.emit('amb', 40 + Math.random() * 310, 470, CSS.gold, 1, 22);
      else if (state.mode === 'field') this.emit('amb', 20 + Math.random() * 350, H - 120, regionData(state.region).festival, 1, 20);
    },

    fieldDust: function (dt) {
      var f = state.field;
      if (!f || state.mode !== 'field') return;
      this.dustClock -= dt;
      if (this.dustClock > 0) return;
      if (f.anim !== 'walk') return;
      this.dustClock = 0.22;
      this.emit('dust', f.px - f.camX, f.py - f.camY + 18, regionData(state.region).festival, 2, 42);
    },

    update: function (time, delta) {
      var dt = Math.min(0.08, Math.max(0, delta / 1000));
      this.clock += dt;
      if (kit.paused) { this.paintAll(); return; }
      var j = kit.juice.frame();
      this.cameras.main.setScroll(j.dx, j.dy);
      if (j.frozen) { this.updateParticles(0); this.paintAll(); return; }
      this.acc += dt;
      var steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) { this.acc -= STEP; stepSim(STEP); steps++; }
      /* If a device falls behind, time is left in the accumulator. The sim
       * slows down instead of skipping encounter checks or turn clocks. */
      if (this.acc > STEP * MAX_STEPS) this.acc = STEP * MAX_STEPS;
      this.drainResults();
      this.fieldDust(dt);
      this.ambient(dt);
      this.updateParticles(dt);
      this.updateFloaters(dt);
      this.paintAll();
    }
  };

  function toScene(cfg) {
    var Klass = function () { Phaser.Scene.call(this, { key: cfg.key }); };
    Klass.prototype = Object.create(Phaser.Scene.prototype);
    Klass.prototype.constructor = Klass;
    Object.keys(cfg).forEach(function (k) { if (k !== 'key') Klass.prototype[k] = cfg[k]; });
    return Klass;
  }

  var game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: document.body,
    backgroundColor: CSS.ink,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
    render: { antialias: true, powerPreference: 'high-performance' },
    fps: { target: 60, min: 30 },
    scene: [toScene(BootScene), toScene(PlayScene)]
  });
  game.events.once('ready', function () { app.canvas = game.canvas; });
  app.canvas = game.canvas;
  window.__WC_READY = true;
})();
