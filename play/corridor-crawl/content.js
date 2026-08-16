/* Corridor Crawl - creature, item, class, and meta-progression content tables.
 * Round 2 polish: 12 field creatures with distinct AI plus two boss actors,
 * a consumable economy with risk-bearing unknowns, five classes with real
 * starting kits and passives, and a shard-funded meta unlock track.
 */
(function (root) {
  'use strict';
  var CC = root.CC;

  // ------------------------------------------------------------- creatures
  // `ai` selects the behaviour branch in game.js. `family` drives silhouette
  // language and secondary FX colour so a player reads role before species.
  var MON = {
    rat: { name: 'Gnaw Rat', hp: 5, dmg: [1, 3], def: 0, xp: 2, col: 0xb98a5a, glyph: 'r',
      ai: 'pack', family: 'beast', tell: 'braver in packs' },
    swarm: { name: 'Cinder Swarm', hp: 4, dmg: [1, 2], def: 0, xp: 3, col: 0xff9b57, glyph: 'w',
      ai: 'swarm', family: 'beast', tell: 'takes two steps a turn' },
    ooze: { name: 'Split Ooze', hp: 11, dmg: [2, 4], def: 1, xp: 6, col: 0x62d18a, glyph: 'o',
      ai: 'split', family: 'ooze', tell: 'splits when struck' },
    archer: { name: 'Quill Archer', hp: 8, dmg: [2, 5], def: 0, xp: 7, col: 0xe2c85d, glyph: 'a',
      ai: 'volley', family: 'ranged', tell: 'telegraphs a volley' },
    spitter: { name: 'Bog Spitter', hp: 9, dmg: [2, 4], def: 0, xp: 8, col: 0x9fd45c, glyph: 'p',
      ai: 'kite', family: 'ranged', tell: 'poisons, backs away' },
    thief: { name: 'Ash Cutpurse', hp: 7, dmg: [1, 2], def: 1, xp: 8, col: 0x56d3d4, glyph: 't',
      ai: 'steal', family: 'rogue', tell: 'steals gold and runs' },
    stalker: { name: 'Hollow Stalker', hp: 10, dmg: [3, 6], def: 1, xp: 9, col: 0xc574df, glyph: 's',
      ai: 'sound', family: 'rogue', tell: 'hunts you by sound' },
    mimic: { name: 'Chest Mimic', hp: 12, dmg: [3, 7], def: 1, xp: 10, col: 0xd08a5a, glyph: 'm',
      ai: 'ambush', family: 'trap', tell: 'waits as loot' },
    bulwark: { name: 'Slate Bulwark', hp: 16, dmg: [3, 5], def: 3, xp: 12, col: 0x8fa2b8, glyph: 'u',
      ai: 'guard', family: 'armour', tell: 'shielded from the front' },
    brute: { name: 'Rubble Brute', hp: 22, dmg: [4, 9], def: 2, xp: 14, col: 0xaab0bd, glyph: 'b',
      ai: 'charge', family: 'armour', tell: 'winds up a charge' },
    warden: { name: 'Lantern Warden', hp: 14, dmg: [2, 4], def: 1, xp: 15, col: 0xffd88a, glyph: 'l',
      ai: 'support', family: 'caster', tell: 'mends and calls swarms' },
    wraith: { name: 'Gloom Wraith', hp: 13, dmg: [3, 7], def: 0, xp: 16, col: 0x7f8fe0, glyph: 'v',
      ai: 'phase', family: 'caster', tell: 'walks through stone' },
    slagmaw: { name: 'Slagmaw', hp: 78, dmg: [5, 10], def: 3, xp: 60, col: 0xff6a3d, glyph: 'S',
      ai: 'boss_slag', family: 'boss', boss: true, tell: 'forge-tyrant' },
    sovereign: { name: 'Echo Sovereign', hp: 118, dmg: [6, 12], def: 4, xp: 120, col: 0xc9a6ff, glyph: 'E',
      ai: 'boss_echo', family: 'boss', boss: true, tell: 'keeper of the Crown' }
  };
  var MON_KEYS = Object.keys(MON);

  // ------------------------------------------------------------------ items
  // `shape` is the icon silhouette family. Unknown consumables share a single
  // muted silhouette so identification is a real decision, not a colour read.
  var POTIONS = {
    mend: { name: 'Mending', col: 0x50e08d, shape: 'round', desc: 'restore 12 health', tag: 'HP +12' },
    fury: { name: 'Fury', col: 0xff785e, shape: 'conical', desc: 'add 3 damage for 5 turns', tag: 'DAMAGE +3' },
    quick: { name: 'Quickening', col: 0xffd45e, shape: 'teardrop', desc: 'enemies lose their next step', tag: 'SKIP ENEMY STEP' },
    bile: { name: 'Bile', col: 0x9c68d8, shape: 'squat', desc: 'burn every adjacent enemy', tag: 'ADJACENT BLAST' },
    sight: { name: 'Clarity', col: 0x5ccdf0, shape: 'orb', desc: 'reveal this floor', tag: 'REVEAL FLOOR' },
    blight: { name: 'Blight', col: 0x7c8f5a, shape: 'tall', desc: 'sickens you: 6 damage and poison', tag: 'HARMFUL' }
  };
  var SCROLLS = {
    blink: { name: 'Displacement', col: 0xd8e7ef, shape: 'seal-arc', desc: 'jump to a safe floor tile', tag: 'SAFE TELEPORT' },
    flame: { name: 'Scorching', col: 0xff9a78, shape: 'seal-flame', desc: 'burn every visible enemy', tag: 'VISIBLE BURN' },
    ward: { name: 'Warding', col: 0xa9d8ff, shape: 'seal-shield', desc: 'block 3 damage for 5 turns', tag: 'BLOCK 3 DAMAGE' },
    terror: { name: 'Terror', col: 0xc8a9ff, shape: 'seal-eye', desc: 'nearby enemies flee', tag: 'ENEMIES FLEE' },
    mapping: { name: 'Surveying', col: 0x9fe0c8, shape: 'seal-grid', desc: 'reveal every corridor', tag: 'REVEAL CORRIDORS' },
    reading: { name: 'Revealing', col: 0xffe08a, shape: 'seal-star', desc: 'identify one unknown pack item', tag: 'IDENTIFY ONE' }
  };
  var TOOLS = {
    ration: { name: 'Dry Ration', col: 0xd1a56b, shape: 'ration', desc: 'restore 34 hunger', tag: 'HUNGER +34' },
    torch: { name: 'Torch Oil', col: 0xffb35d, shape: 'torch', desc: 'refill 70 torch fuel', tag: 'TORCH +70' },
    crown: { name: 'Crown of Echoes', col: 0xffd76d, shape: 'crown', desc: 'the way out is up', tag: 'ASCEND' }
  };

  var POTION_SHADES = ['Moss', 'Cinder', 'Brine', 'Honey', 'Violet', 'Silver', 'Ash', 'Teal'];
  var SCROLL_GLYPHS = ['MOR VEL', 'KIRRA', 'OSSE', 'THRAN', 'UMBEL', 'NAAD', 'EKO'];

  // ---------------------------------------------------------------- classes
  var CLASSES = {
    wayfarer: {
      name: 'Wayfarer', mark: 'I', hp: 28, atk: [3, 6], hunger: 100, torch: 110, slots: 6,
      start: [['ration', 2], ['mend', 1]], passive: 'steady',
      desc: 'balanced start', perk: 'mends 2 health on every floor clear',
      unlock: null, unlockText: 'available from the first run'
    },
    scavenger: {
      name: 'Scavenger', mark: 'II', hp: 24, atk: [2, 5], hunger: 130, torch: 100, slots: 8,
      start: [['ration', 1], ['?potion', 2]], passive: 'greed',
      desc: 'more pockets, less muscle', perk: 'gold finds are richer and shrines charge less',
      unlock: 'depth3', unlockText: 'reach depth 3'
    },
    ward: {
      name: 'Ward-Bearer', mark: 'III', hp: 36, atk: [2, 5], hunger: 90, torch: 100, slots: 6,
      start: [['ration', 1], ['ward', 1]], passive: 'bulwark',
      desc: 'survives the forge', perk: 'every hit against you loses 1 damage',
      unlock: 'depth6', unlockText: 'reach depth 6'
    },
    echo: {
      name: 'Echo Runner', mark: 'IV', hp: 25, atk: [4, 7], hunger: 105, torch: 100, slots: 6,
      start: [['ration', 1], ['fury', 1]], passive: 'echo',
      desc: 'returns changed', perk: 'first strike on an unwounded foe adds 4 damage',
      unlock: 'escape', unlockText: 'escape with the Crown once'
    },
    lampwright: {
      name: 'Lampwright', mark: 'V', hp: 26, atk: [3, 6], hunger: 100, torch: 170, slots: 7,
      start: [['ration', 1], ['torch', 2], ['reading', 1]], passive: 'lantern',
      desc: 'reads the dark', perk: 'wider torchlight and slower burn',
      unlock: 'shards40', unlockText: 'bank 40 echo shards'
    }
  };
  var CLASS_KEYS = ['wayfarer', 'scavenger', 'ward', 'echo', 'lampwright'];

  // -------------------------------------------------------- meta unlock track
  // Shards accrue every run (they are never spent) and cross fixed thresholds.
  // Everything the track grants is checked at run start, so an unlock is felt
  // on the very next descent.
  var TRACK = [
    { at: 10, id: 'satchel', name: 'Deeper Satchel', desc: 'one extra pack slot' },
    { at: 25, id: 'kindling', name: 'Kindling', desc: 'start with an extra torch oil' },
    { at: 40, id: 'lampwright', name: 'Lampwright', desc: 'unlock the Lampwright class' },
    { at: 60, id: 'haggler', name: 'Haggler', desc: 'shrines charge a fifth less' },
    { at: 85, id: 'scholar', name: 'Scholar', desc: 'one carried unknown starts identified' },
    { at: 115, id: 'warded', name: 'Warded Step', desc: 'begin every run with a warding scroll' },
    { at: 150, id: 'delver', name: 'Delver', desc: 'floor-clear medals restore 3 health' }
  ];

  var AUDIO = {
    step: 'assets/audio/step.mp3', hit: 'assets/audio/hit.mp3', hurt: 'assets/audio/hurt.mp3',
    pickup: 'assets/audio/pickup.mp3', 'item-use': 'assets/audio/item-use.mp3', stairs: 'assets/audio/stairs.mp3',
    crown: 'assets/audio/crown.mp3', death: 'assets/audio/death.mp3', escape: 'assets/audio/escape.mp3',
    telegraph: 'assets/audio/telegraph.mp3', boss: 'assets/audio/boss.mp3', shrine: 'assets/audio/shrine.mp3',
    identify: 'assets/audio/identify.mp3', 'torch-low': 'assets/audio/torch-low.mp3', shard: 'assets/audio/shard.mp3'
  };
  var MUSIC = {
    theme: 'assets/audio/theme.mp3',
    'ambience-warrens': 'assets/audio/ambience-warrens.mp3',
    'ambience-flooded': 'assets/audio/ambience-flooded.mp3',
    'ambience-forge': 'assets/audio/ambience-forge.mp3',
    'ambience-deeps': 'assets/audio/ambience-deeps.mp3',
    'ambience-vault': 'assets/audio/ambience-vault.mp3',
    'ambience-boss': 'assets/audio/ambience-boss.mp3'
  };

  CC.MON = MON;
  CC.MON_KEYS = MON_KEYS;
  CC.POTIONS = POTIONS;
  CC.SCROLLS = SCROLLS;
  CC.TOOLS = TOOLS;
  CC.POTION_SHADES = POTION_SHADES;
  CC.SCROLL_GLYPHS = SCROLL_GLYPHS;
  CC.CLASSES = CLASSES;
  CC.CLASS_KEYS = CLASS_KEYS;
  CC.TRACK = TRACK;
  CC.AUDIO = AUDIO;
  CC.MUSIC = MUSIC;
  CC.MAX_DEPTH = 10;
})(window);
