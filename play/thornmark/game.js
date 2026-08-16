/* Thornmark, fleet F15 top-down action MMORPG.
 * Phaser presents five authored hunting regions and a four floor undercroft.
 * GGKit owns lifecycle, pointer identity, saves, audio buses, juice budget
 * and PWA registration. Simulation records never hold view objects.
 */
(function () {
  'use strict';

  var Phaser = window.Phaser;
  var W = 390, H = 844;
  var STEP = 1 / 60, MAX_STEPS = 4, TAU = Math.PI * 2;
  var MAX_ENEMIES = 18, MAX_PROPS = 96, MAX_FX = 120, MAX_NUMBERS = 20;
  var MAX_HAZARDS = 12, MAX_SHOTS = 24, MAX_PATCHES = 12;
  var LEVEL_CAP = 25;

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function colorCss(v) { return '#' + ('000000' + (v >>> 0).toString(16)).slice(-6); }
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var PAL = {
    ink: 0x0a1012, paper: 0xf1ece0, mist: 0x9fb0ab, dim: 0x5f7370,
    moss: 0x7ee0b2, leaf: 0x66c79f, deep: 0x16483c, bark: 0x3d5a46,
    ember: 0xf2a35e, flame: 0xff7b56, gold: 0xf2bd63, bone: 0xd9d2bd,
    stone: 0x8d9aa6, cold: 0x7ec8e0, violet: 0xb092ff, danger: 0xf46f78,
    white: 0xffffff, shade: 0x1a2a2c
  };

  // ---------------------------------------------------------------- content
  var REGIONS = [
    {
      key: 'mosswold', name: 'MOSSWOLD VERGE', sub: 'green hush', minLevel: 1,
      w: 1160, h: 1400, seed: 1301, accent: PAL.moss, tint: 0x16483c, light: 0x8ff0c2,
      ground: { base: 0x24503f, alt: 0x2d6450, detail: 0x3d8259, grit: 0x1a3c31 },
      dark: 0.14, families: ['thornling', 'mireling'], density: 8, respawn: 3.6,
      boss: 'rootcrown', bossTimer: 180, hazard: 'pollen',
      props: ['tree-a', 'tree-b', 'bush', 'fern', 'stump', 'rock-a', 'mushroom'],
      patch: 'moss', bind: { x: 580, y: 880 },
      note: 'Soft ground, slow packs, the first crown sleeps in the clearing.'
    },
    {
      key: 'thornwood', name: 'THORNWOOD DEEP', sub: 'the closed canopy', minLevel: 5,
      w: 1240, h: 1500, seed: 2207, accent: PAL.leaf, tint: 0x123528, light: 0x74d6a4,
      ground: { base: 0x1d3d33, alt: 0x265244, detail: 0x336d4c, grit: 0x142c25 },
      dark: 0.26, families: ['thornling', 'briarhound', 'mireling'], density: 9, respawn: 3.2,
      boss: 'briarjaw', bossTimer: 180, hazard: 'snare',
      props: ['tree-a', 'tree-b', 'bush', 'fern', 'rock-a', 'bones', 'spikepost'],
      patch: 'briar', bind: { x: 620, y: 930 },
      note: 'Briar snares hold you in place. Break line of sight or roll out.'
    },
    {
      key: 'bailey', name: 'RUINED BAILEY', sub: 'the fallen ward', minLevel: 10,
      w: 1280, h: 1520, seed: 3319, accent: PAL.stone, tint: 0x25313d, light: 0xa9c0d2,
      ground: { base: 0x353d47, alt: 0x434c58, detail: 0x55606e, grit: 0x262c34 },
      dark: 0.2, families: ['baileyshade', 'stonepike', 'briarhound'], density: 8, respawn: 3.4,
      boss: 'palesergeant', bossTimer: 210, hazard: 'masonry',
      props: ['pillar', 'arch', 'rubble', 'rock-b', 'banner', 'bones', 'brazier'],
      patch: 'flagstone', bind: { x: 640, y: 950 },
      note: 'Falling masonry marks the ground before it lands. Watch the shadow.'
    },
    {
      key: 'embermire', name: 'EMBER MIRE', sub: 'low red sky', minLevel: 15,
      w: 1260, h: 1480, seed: 4127, accent: PAL.ember, tint: 0x3a1c1c, light: 0xff9f6d,
      ground: { base: 0x3d2325, alt: 0x4e2d2a, detail: 0x6b3d31, grit: 0x2a181b },
      dark: 0.24, families: ['cinderkin', 'ashwing', 'stonepike'], density: 9, respawn: 3.0,
      boss: 'cindermaw', bossTimer: 210, hazard: 'vent',
      props: ['stump', 'rock-b', 'rubble', 'brazier', 'bones', 'crystal', 'spikepost'],
      patch: 'ash', bind: { x: 610, y: 920 },
      note: 'Ember vents breathe on a cycle. The mire never fully cools.'
    },
    {
      key: 'keep', name: 'THORNMARK KEEP', sub: 'the crowned hall', minLevel: 20,
      w: 1200, h: 1460, seed: 5231, accent: PAL.violet, tint: 0x241d3a, light: 0xc3aaff,
      ground: { base: 0x2f2842, alt: 0x3b3253, detail: 0x50436e, grit: 0x1f1a2e },
      dark: 0.3, families: ['keepwarden', 'ashwing', 'baileyshade'], density: 8, respawn: 3.2,
      boss: 'thornking', bossTimer: 240, hazard: 'thornspike',
      props: ['pillar', 'arch', 'banner', 'brazier', 'crystal', 'rubble', 'bones'],
      patch: 'court', bind: { x: 600, y: 900 },
      note: 'Thorn spikes rise through the floor. The crown answers at the top.'
    }
  ];
  var REGION_BY_KEY = {};
  REGIONS.forEach(function (r, i) { r.index = i; REGION_BY_KEY[r.key] = r; });

  var FLOORS = [
    { floor: 1, name: 'THE FLOODED STAIR', accent: PAL.cold, tint: 0x142c34, light: 0x9fd8e8, dark: 0.3, ground: { base: 0x17303a, alt: 0x1e3d47, detail: 0x2a5563, grit: 0x0f2028 }, families: ['baileyshade', 'briarhound'], waves: 3, perWave: 5, boss: 'graveweft', hazard: 'masonry', props: ['pillar', 'rubble', 'bones', 'rock-b'] },
    { floor: 2, name: 'THE BONE GALLERY', accent: PAL.bone, tint: 0x2c2a24, light: 0xe0d8bd, dark: 0.32, ground: { base: 0x2b2820, alt: 0x37342a, detail: 0x4a4536, grit: 0x1c1a15 }, families: ['baileyshade', 'stonepike', 'briarhound'], waves: 3, perWave: 6, boss: 'ossiar', hazard: 'thornspike', props: ['bones', 'pillar', 'rubble', 'spikepost'] },
    { floor: 3, name: 'THE EMBER VAULT', accent: PAL.flame, tint: 0x3a1a16, light: 0xffa073, dark: 0.3, ground: { base: 0x2f1a16, alt: 0x3d221b, detail: 0x572e22, grit: 0x1e110e }, families: ['cinderkin', 'ashwing', 'stonepike'], waves: 4, perWave: 6, boss: 'slaghound', hazard: 'vent', props: ['brazier', 'rubble', 'crystal', 'rock-b'] },
    { floor: 4, name: 'THE THRONELESS HALL', accent: PAL.violet, tint: 0x231b38, light: 0xcbb4ff, dark: 0.34, ground: { base: 0x221c30, alt: 0x2c2540, detail: 0x3e3357, grit: 0x151125 }, families: ['keepwarden', 'ashwing', 'baileyshade'], waves: 4, perWave: 6, boss: 'underprior', hazard: 'thornspike', props: ['pillar', 'arch', 'banner', 'crystal'] }
  ];
  var DUNGEON_W = 680, DUNGEON_H = 1060, DUNGEON_MIN_LEVEL = 8;

  var FAMILIES = {
    thornling: { name: 'THORNLING', shape: 'thornling', color: 0x66c79f, hp: 28, speed: 24, chase: 2.4, radius: 13, damage: 4, gold: [4, 8], xp: 6, wind: 0.52, reach: 26, kind: 'melee', mark: '' },
    mireling: { name: 'MIRELING', shape: 'mireling', color: 0xb3c46b, hp: 36, speed: 18, chase: 2.2, radius: 15, damage: 5, gold: [5, 10], xp: 8, wind: 0.72, reach: 40, kind: 'slam', mark: '' },
    briarhound: { name: 'BRIARHOUND', shape: 'briarhound', color: 0x8fae5f, hp: 44, speed: 30, chase: 2.8, radius: 14, damage: 7, gold: [6, 12], xp: 11, wind: 0.62, reach: 30, kind: 'charge', mark: '' },
    baileyshade: { name: 'BAILEY SHADE', shape: 'baileyshade', color: 0x7f9bb0, hp: 52, speed: 22, chase: 2.2, radius: 14, damage: 8, gold: [8, 15], xp: 15, wind: 0.8, reach: 190, kind: 'shot', mark: '' },
    stonepike: { name: 'STONEPIKE', shape: 'stonepike', color: 0xa79b86, hp: 78, speed: 16, chase: 2.0, radius: 18, damage: 12, gold: [11, 20], xp: 22, wind: 0.92, reach: 62, kind: 'slam', mark: 'ELITE' },
    cinderkin: { name: 'CINDERKIN', shape: 'cinderkin', color: 0xf49b62, hp: 42, speed: 27, chase: 2.5, radius: 14, damage: 6, gold: [6, 12], xp: 13, wind: 0.58, reach: 30, kind: 'charge', mark: '' },
    ashwing: { name: 'ASHWING', shape: 'ashwing', color: 0xe9c36d, hp: 32, speed: 35, chase: 3.0, radius: 12, damage: 5, gold: [5, 11], xp: 12, wind: 0.44, reach: 28, kind: 'dive', mark: '' },
    keepwarden: { name: 'KEEP WARDEN', shape: 'keepwarden', color: 0xc0a2f0, hp: 96, speed: 20, chase: 2.2, radius: 17, damage: 14, gold: [16, 28], xp: 34, wind: 0.86, reach: 70, kind: 'sweep', mark: 'ELITE' }
  };
  var FAMILY_KEYS = Object.keys(FAMILIES);

  var BOSSES = {
    rootcrown: { name: 'ROOTCROWN', shape: 'rootcrown', color: 0xd8f2ad, hp: 520, speed: 12, chase: 2.6, radius: 30, damage: 13, gold: [65, 86], xp: 220, wind: 1.0, reach: 96, region: 0, tell: 'slam', summons: 'thornling' },
    briarjaw: { name: 'BRIARJAW', shape: 'briarjaw', color: 0xa8e07a, hp: 760, speed: 18, chase: 2.8, radius: 30, damage: 15, gold: [90, 120], xp: 340, wind: 0.9, reach: 88, region: 1, tell: 'charge', summons: 'briarhound' },
    palesergeant: { name: 'THE PALE SERGEANT', shape: 'palesergeant', color: 0xcdd8e4, hp: 1080, speed: 16, chase: 2.4, radius: 31, damage: 18, gold: [130, 170], xp: 480, wind: 1.05, reach: 104, region: 2, tell: 'sweep', summons: 'baileyshade' },
    cindermaw: { name: 'CINDERMAW', shape: 'cindermaw', color: 0xffd29a, hp: 620, speed: 14, chase: 2.6, radius: 32, damage: 16, gold: [150, 200], xp: 620, wind: 0.95, reach: 100, region: 3, tell: 'burn', summons: 'cinderkin' },
    thornking: { name: 'THE THORN KING', shape: 'thornking', color: 0xd7bcff, hp: 1600, speed: 17, chase: 2.6, radius: 34, damage: 21, gold: [220, 300], xp: 900, wind: 1.0, reach: 112, region: 4, tell: 'crown', summons: 'keepwarden' },
    graveweft: { name: 'GRAVEWEFT', shape: 'graveweft', color: 0x9fd8e8, hp: 700, speed: 15, chase: 2.5, radius: 29, damage: 16, gold: [95, 130], xp: 360, wind: 0.92, reach: 92, floor: 1, tell: 'sweep', summons: 'baileyshade' },
    ossiar: { name: 'OSSIAR THE COUNTED', shape: 'ossiar', color: 0xe0d8bd, hp: 950, speed: 14, chase: 2.4, radius: 30, damage: 18, gold: [130, 175], xp: 470, wind: 1.0, reach: 98, floor: 2, tell: 'slam', summons: 'stonepike' },
    slaghound: { name: 'SLAGHOUND', shape: 'slaghound', color: 0xffa073, hp: 1250, speed: 20, chase: 3.0, radius: 30, damage: 20, gold: [175, 230], xp: 640, wind: 0.85, reach: 90, floor: 3, tell: 'charge', summons: 'cinderkin' },
    underprior: { name: 'THE UNDERPRIOR', shape: 'underprior', color: 0xcbb4ff, hp: 1900, speed: 16, chase: 2.6, radius: 34, damage: 24, gold: [260, 340], xp: 1050, wind: 1.0, reach: 110, floor: 4, tell: 'crown', summons: 'keepwarden' }
  };
  var BOSS_KEYS = Object.keys(BOSSES);
  var SHAPES = ['thornling', 'mireling', 'briarhound', 'baileyshade', 'stonepike', 'cinderkin', 'ashwing', 'keepwarden'];
  var BOSS_SHAPES = ['rootcrown', 'briarjaw', 'palesergeant', 'cindermaw', 'thornking', 'graveweft', 'ossiar', 'slaghound', 'underprior'];

  // ------------------------------------------------------------ characters
  var CLASSES = {
    warden: {
      key: 'warden', name: 'WARDEN', role: 'bulwark', accent: PAL.moss,
      blurb: 'Holds the line. More life, shorter reach, skills that pull a pack together.',
      hp: 1.18, power: 0.94, speed: 0.97,
      skills: ['thornarc', 'emberburst', 'brambleguard', 'rootstrike', 'ironbark', 'bindingcall']
    },
    emberblade: {
      key: 'emberblade', name: 'EMBERBLADE', role: 'striker', accent: PAL.ember,
      blurb: 'Trades armour for damage. Closes gaps, marks a target and burns it down.',
      hp: 0.9, power: 1.16, speed: 1.05,
      skills: ['thornarc', 'emberburst', 'cinderdash', 'ashfall', 'searingmark', 'bindingcall']
    },
    thornseer: {
      key: 'thornseer', name: 'THORNSEER', role: 'warder', accent: PAL.violet,
      blurb: 'Fights at range. Seeds, ground control and the only self sustain worth the name.',
      hp: 0.96, power: 1.04, speed: 1.0,
      skills: ['thornarc', 'emberburst', 'seedvolley', 'verdantbloom', 'hollowsigil', 'bindingcall']
    }
  };
  var CLASS_KEYS = ['warden', 'emberblade', 'thornseer'];

  var SKILLS = {
    thornarc: { key: 'thornarc', name: 'THORN ARC', icon: 'arc', color: 0x7ee0b2, cd: 4.8, unlock: 1, mode: 'self', radius: 124, need: 142, desc: 'Cleave every enemy within 124.' },
    emberburst: { key: 'emberburst', name: 'EMBER BURST', icon: 'burst', color: 0xf2a35e, cd: 8.5, unlock: 3, mode: 'target', radius: 74, need: 168, desc: 'Detonate at your target, 74 blast.' },
    brambleguard: { key: 'brambleguard', name: 'BRAMBLE GUARD', icon: 'shield', color: 0x8ff0c2, cd: 12, unlock: 6, mode: 'self', radius: 0, need: 0, desc: 'Shield for 40 percent of max life, 6s.' },
    rootstrike: { key: 'rootstrike', name: 'ROOTSTRIKE', icon: 'root', color: 0x66c79f, cd: 9, unlock: 10, mode: 'self', radius: 150, need: 0, desc: 'Drag the pack in and stun it for 1.2s.' },
    ironbark: { key: 'ironbark', name: 'IRONBARK ROAR', icon: 'roar', color: 0xd9d2bd, cd: 18, unlock: 15, mode: 'self', radius: 168, need: 0, desc: 'Pull aggro, cut damage taken by 30 percent, 5s.' },
    cinderdash: { key: 'cinderdash', name: 'CINDER DASH', icon: 'dash', color: 0xff9f6d, cd: 7, unlock: 6, mode: 'target', radius: 44, need: 220, desc: 'Blink to your target and cut through the line.' },
    ashfall: { key: 'ashfall', name: 'ASHFALL', icon: 'rain', color: 0xf2bd63, cd: 14, unlock: 10, mode: 'target', radius: 92, need: 200, desc: 'Six embers fall over 3s in a 92 ring.' },
    searingmark: { key: 'searingmark', name: 'SEARING MARK', icon: 'mark', color: 0xff7b56, cd: 11, unlock: 15, mode: 'target', radius: 0, need: 210, desc: 'Marked enemies take 35 percent more, 6s.' },
    seedvolley: { key: 'seedvolley', name: 'SEED VOLLEY', icon: 'volley', color: 0xb8f2c8, cd: 5.5, unlock: 6, mode: 'target', radius: 0, need: 250, desc: 'Three seeking seeds, one target each.' },
    verdantbloom: { key: 'verdantbloom', name: 'VERDANT BLOOM', icon: 'bloom', color: 0x7ee0b2, cd: 16, unlock: 10, mode: 'self', radius: 0, need: 0, desc: 'Restore 45 percent of max life over 6s.' },
    hollowsigil: { key: 'hollowsigil', name: 'HOLLOW SIGIL', icon: 'sigil', color: 0xb092ff, cd: 13, unlock: 15, mode: 'target', radius: 96, need: 230, desc: 'A 96 field: half speed and steady damage, 5s.' },
    bindingcall: { key: 'bindingcall', name: 'BINDING CALL', icon: 'bind', color: 0xf1ece0, cd: 24, unlock: 20, mode: 'self', radius: 0, need: 0, desc: 'Clear snares and restore 35 percent of max life.' }
  };

  var TALENTS = [
    { key: 'edge', branch: 'MIGHT', name: 'KEEN EDGE', text: 'Damage up 6 percent per rank.' },
    { key: 'cleave', branch: 'MIGHT', name: 'WIDE CLEAVE', text: 'Skill radius up 8 percent per rank.' },
    { key: 'crit', branch: 'MIGHT', name: 'SPLIT VEIN', text: 'Critical chance up 4 points per rank.' },
    { key: 'bane', branch: 'MIGHT', name: 'CROWN BANE', text: 'Boss damage up 10 percent per rank.' },
    { key: 'hide', branch: 'GUARD', name: 'THICK HIDE', text: 'Max life up 8 percent per rank.' },
    { key: 'bark', branch: 'GUARD', name: 'BARKSKIN', text: 'Damage taken down 4 points per rank.' },
    { key: 'roll', branch: 'GUARD', name: 'LOOSE STANCE', text: 'Dodge cooldown down 12 percent per rank.' },
    { key: 'ward', branch: 'GUARD', name: 'LONG BREATH', text: 'Dodge invulnerability up 0.06s per rank.' },
    { key: 'flow', branch: 'FOCUS', name: 'CLEAR FLOW', text: 'Skill cooldowns down 7 percent per rank.' },
    { key: 'stride', branch: 'FOCUS', name: 'LONG STRIDE', text: 'Move speed up 5 percent per rank.' },
    { key: 'lore', branch: 'FOCUS', name: 'FIELD LORE', text: 'Experience up 8 percent per rank.' },
    { key: 'fortune', branch: 'FOCUS', name: 'GOOD FORTUNE', text: 'Drop chance up 8 percent per rank.' }
  ];
  var TALENT_KEYS = TALENTS.map(function (t) { return t.key; });
  var TALENT_MAX = 2;

  // ---------------------------------------------------------------- gear
  var SLOTS = ['weapon', 'armor', 'ring'];
  var GEAR_NAMES = { weapon: 'VINE EDGE', armor: 'BARK COAT', ring: 'EMBER LOOP' };
  var GEAR_LABELS = { weapon: 'WEAPON', armor: 'ARMOR', ring: 'RING' };
  var ENHANCE_RATES = [1, .90, .82, .74, .66, .58, .50, .42, .34];
  var RARITIES = [
    { tier: 0, name: 'WORN', color: 0xb4bbc6, mult: 1.0, affixes: 1 },
    { tier: 1, name: 'KEEN', color: 0x7ee0b2, mult: 1.18, affixes: 1 },
    { tier: 2, name: 'RUNED', color: 0x7ec8e0, mult: 1.42, affixes: 2 },
    { tier: 3, name: 'THORNBOUND', color: 0xf2bd63, mult: 1.75, affixes: 2 },
    { tier: 4, name: 'KINGSMARK', color: 0xb092ff, mult: 2.2, affixes: 3 }
  ];
  var AFFIXES = {
    power: { key: 'power', name: 'POWER', unit: 'percent damage', step: 3 },
    guard: { key: 'guard', name: 'GUARD', unit: 'flat damage cut', step: 2 },
    haste: { key: 'haste', name: 'HASTE', unit: 'percent cooldown cut', step: 2 },
    vigor: { key: 'vigor', name: 'VIGOR', unit: 'max life', step: 9 },
    fortune: { key: 'fortune', name: 'FORTUNE', unit: 'percent drop chance', step: 4 },
    edge: { key: 'edge', name: 'EDGE', unit: 'percent critical', step: 2 }
  };
  var AFFIX_KEYS = Object.keys(AFFIXES);
  var CRAFT_SHARDS = 3;
  var CRAFT_GOLD = 60;
  var CRAFT_ODDS = [
    { tier: 0, weight: 34 }, { tier: 1, weight: 30 }, { tier: 2, weight: 20 },
    { tier: 3, weight: 12 }, { tier: 4, weight: 4 }
  ];

  // --------------------------------------------------------------- quests
  var QUESTS = [
    { id: 1, name: 'FIRST CUT', type: 'kill', target: 'thornling', count: 6, gold: 30, xp: 40, text: 'Thin six thornlings on the verge.' },
    { id: 2, name: 'SOFT GROUND', type: 'kill', target: 'mireling', count: 5, gold: 34, xp: 55, text: 'Clear five mirelings from the wet ground.' },
    { id: 3, name: 'FIELD READY', type: 'level', count: 3, gold: 40, xp: 0, text: 'Reach level 3.' },
    { id: 4, name: 'A BETTER EDGE', type: 'enhance', target: 'weapon', count: 1, gold: 45, xp: 60, text: 'Enchant a weapon to plus one.' },
    { id: 5, name: 'THE FIRST CROWN', type: 'boss', target: 'rootcrown', count: 1, gold: 110, xp: 220, text: 'Put Rootcrown down in the verge.' },
    { id: 6, name: 'DEEPER IN', type: 'travel', target: 'thornwood', count: 1, gold: 40, xp: 90, text: 'Walk into the Thornwood Deep.' },
    { id: 7, name: 'HOUND WORK', type: 'kill', target: 'briarhound', count: 8, gold: 70, xp: 150, text: 'Bring down eight briarhounds.' },
    { id: 8, name: 'SHARDS', type: 'shards', count: 6, gold: 60, xp: 120, text: 'Collect six thorn shards.' },
    { id: 9, name: 'FIRST FORGE', type: 'craft', count: 1, gold: 70, xp: 140, text: 'Craft one piece at the forge.' },
    { id: 10, name: 'THE CLOSED JAW', type: 'boss', target: 'briarjaw', count: 1, gold: 180, xp: 340, text: 'Kill Briarjaw under the canopy.' },
    { id: 11, name: 'ROLL WITH IT', type: 'dodge', count: 12, gold: 55, xp: 130, text: 'Roll clear of twelve wind ups.' },
    { id: 12, name: 'HELD GROUND', type: 'level', count: 10, gold: 120, xp: 0, text: 'Reach level 10.' },
    { id: 13, name: 'THE FALLEN WARD', type: 'travel', target: 'bailey', count: 1, gold: 80, xp: 200, text: 'Enter the Ruined Bailey.' },
    { id: 14, name: 'SHADE COUNT', type: 'kill', target: 'baileyshade', count: 10, gold: 120, xp: 260, text: 'Cut down ten bailey shades.' },
    { id: 15, name: 'HEAVY WORK', type: 'kill', target: 'stonepike', count: 6, gold: 150, xp: 320, text: 'Break six stonepikes.' },
    { id: 16, name: 'DOWN THE STAIR', type: 'dungeon', count: 1, gold: 160, xp: 360, text: 'Clear the first undercroft floor.' },
    { id: 17, name: 'PLUS FOUR', type: 'enhance', target: 'any', count: 4, gold: 180, xp: 380, text: 'Take any piece to plus four.' },
    { id: 18, name: 'THE PALE ORDER', type: 'boss', target: 'palesergeant', count: 1, gold: 260, xp: 480, text: 'End the Pale Sergeant.' },
    { id: 19, name: 'BONE GALLERY', type: 'dungeon', count: 2, gold: 220, xp: 470, text: 'Clear the second undercroft floor.' },
    { id: 20, name: 'RED SKY', type: 'travel', target: 'embermire', count: 1, gold: 120, xp: 300, text: 'Reach the Ember Mire.' },
    { id: 21, name: 'ASH AND WING', type: 'kill', target: 'ashwing', count: 12, gold: 200, xp: 420, text: 'Down twelve ashwings.' },
    { id: 22, name: 'CINDER COUNT', type: 'kill', target: 'cinderkin', count: 14, gold: 220, xp: 460, text: 'Burn out fourteen cinderkin.' },
    { id: 23, name: 'VAULT WORK', type: 'dungeon', count: 3, gold: 300, xp: 640, text: 'Clear the ember vault floor.' },
    { id: 24, name: 'THE OPEN MAW', type: 'boss', target: 'cindermaw', count: 1, gold: 340, xp: 620, text: 'Kill Cindermaw in the mire.' },
    { id: 25, name: 'RUNED AND BETTER', type: 'rarity', count: 2, gold: 260, xp: 520, text: 'Equip a runed or better piece.' },
    { id: 26, name: 'THE CROWNED HALL', type: 'travel', target: 'keep', count: 1, gold: 200, xp: 480, text: 'Enter Thornmark Keep.' },
    { id: 27, name: 'WARDEN COUNT', type: 'kill', target: 'keepwarden', count: 10, gold: 340, xp: 720, text: 'Put down ten keep wardens.' },
    { id: 28, name: 'THE THRONELESS', type: 'dungeon', count: 4, gold: 420, xp: 940, text: 'Clear the throneless hall.' },
    { id: 29, name: 'PLUS SEVEN', type: 'enhance', target: 'any', count: 7, gold: 460, xp: 980, text: 'Take any piece to plus seven.' },
    { id: 30, name: 'THE THORN KING', type: 'boss', target: 'thornking', count: 1, gold: 900, xp: 1400, text: 'Take the crown from the Thorn King.' }
  ];

  var TUTORIAL = [
    { key: 'move', text: 'Drag the left pad to move.' },
    { key: 'attack', text: 'Your blade swings on its own. Get close to a thornling.' },
    { key: 'target', text: 'Tap an enemy to lock your target. Tap open ground to release it.' },
    { key: 'skill', text: 'Tap the green skill to cleave everything around you.' },
    { key: 'dodge', text: 'Red wind up means a hit is coming. Tap ROLL to pass through it.' },
    { key: 'codex', text: 'Open the book, top right, for gear, forge, talents and travel.' },
    { key: 'enhance', text: 'In the forge, enchant a piece. The odds are posted before you spend.' },
    { key: 'boss', text: 'The field boss timer runs in the top strip. Clear it for the best drops.' }
  ];

  var HAZARD_TEXT = {
    pollen: 'Pollen drift slows you.',
    snare: 'Briar snares hold you.',
    masonry: 'Masonry falls where the shadow lands.',
    vent: 'Ember vents breathe fire.',
    thornspike: 'Thorn spikes rise from the floor.'
  };

  // ---------------------------------------------------------------- profile
  function defaultItem(slot) {
    return { slot: slot, tier: 0, plus: 0, affixes: [{ key: slot === 'armor' ? 'guard' : slot === 'ring' ? 'haste' : 'power', rank: 1 }] };
  }
  function validItem(v, slot) {
    if (!v || typeof v !== 'object') return defaultItem(slot);
    var out = { slot: slot, tier: clamp(Math.floor(num(v.tier, 0)), 0, RARITIES.length - 1), plus: clamp(Math.floor(num(v.plus, 0)), 0, 9), affixes: [] };
    var list = Array.isArray(v.affixes) ? v.affixes : [];
    for (var i = 0; i < list.length && out.affixes.length < 3; i++) {
      var a = list[i];
      if (!a || !own(AFFIXES, a.key)) continue;
      out.affixes.push({ key: a.key, rank: clamp(Math.floor(num(a.rank, 1)), 1, 6) });
    }
    if (!out.affixes.length) out.affixes = defaultItem(slot).affixes;
    return out;
  }
  function newProfile() {
    return {
      version: 1, cls: 'warden', level: 1, xp: 0, gold: 120, points: 0,
      talents: {}, gear: { weapon: defaultItem('weapon'), armor: defaultItem('armor'), ring: defaultItem('ring') },
      shards: 0, shardsFound: 0, crafted: 0, quest: 0, questCount: 0, questBase: 0, region: 0, bind: 0,
      bossDown: [false, false, false, false, false], floorsCleared: 0,
      kills: {}, totalKills: 0, deaths: 0, dodges: 0, drops: 0, tutorial: 0,
      unlocked: [true, false, false, false, false], best: { level: 1, kills: 0 }, mastery: false
    };
  }
  function validProfile(v) {
    if (!v || typeof v !== 'object') return false;
    if (v.version !== 1) return false;
    if (CLASS_KEYS.indexOf(v.cls) < 0) return false;
    if (!isFinite(v.level) || v.level < 1 || v.level > LEVEL_CAP) return false;
    if (!v.gear || typeof v.gear !== 'object') return false;
    if (!Array.isArray(v.bossDown) || !Array.isArray(v.unlocked)) return false;
    return true;
  }
  function migrate(v) {
    var p = newProfile();
    if (!validProfile(v)) return p;
    p.cls = v.cls; p.level = clamp(Math.floor(num(v.level, 1)), 1, LEVEL_CAP);
    p.xp = clamp(num(v.xp, 0), 0, 9e6); p.gold = clamp(Math.floor(num(v.gold, 120)), 0, 9e7);
    p.points = clamp(Math.floor(num(v.points, 0)), 0, LEVEL_CAP * 2);
    TALENT_KEYS.forEach(function (k) {
      var r = v.talents && own(v.talents, k) ? Math.floor(num(v.talents[k], 0)) : 0;
      if (r > 0) p.talents[k] = clamp(r, 0, TALENT_MAX);
    });
    SLOTS.forEach(function (s) { p.gear[s] = validItem(v.gear[s], s); });
    p.shards = clamp(Math.floor(num(v.shards, 0)), 0, 9999);
    p.shardsFound = clamp(Math.floor(num(v.shardsFound, p.shards)), 0, 999999);
    p.questBase = clamp(Math.floor(num(v.questBase, 0)), 0, 999999);
    p.crafted = clamp(Math.floor(num(v.crafted, 0)), 0, 9999);
    p.quest = clamp(Math.floor(num(v.quest, 0)), 0, QUESTS.length);
    p.questCount = clamp(Math.floor(num(v.questCount, 0)), 0, 9999);
    p.region = clamp(Math.floor(num(v.region, 0)), 0, REGIONS.length - 1);
    p.bind = clamp(Math.floor(num(v.bind, 0)), 0, REGIONS.length - 1);
    for (var i = 0; i < REGIONS.length; i++) {
      p.bossDown[i] = !!(v.bossDown && v.bossDown[i]);
      p.unlocked[i] = i === 0 ? true : !!(v.unlocked && v.unlocked[i]);
    }
    p.floorsCleared = clamp(Math.floor(num(v.floorsCleared, 0)), 0, FLOORS.length);
    FAMILY_KEYS.forEach(function (k) {
      var n = v.kills && own(v.kills, k) ? Math.floor(num(v.kills[k], 0)) : 0;
      if (n > 0) p.kills[k] = clamp(n, 0, 999999);
    });
    p.totalKills = clamp(Math.floor(num(v.totalKills, 0)), 0, 999999);
    p.deaths = clamp(Math.floor(num(v.deaths, 0)), 0, 999999);
    p.dodges = clamp(Math.floor(num(v.dodges, 0)), 0, 999999);
    p.drops = clamp(Math.floor(num(v.drops, 0)), 0, 999999);
    p.tutorial = clamp(Math.floor(num(v.tutorial, 0)), 0, TUTORIAL.length);
    p.mastery = !!v.mastery;
    p.best.level = clamp(Math.floor(num(v.best && v.best.level, p.level)), 1, LEVEL_CAP);
    p.best.kills = clamp(Math.floor(num(v.best && v.best.kills, p.totalKills)), 0, 999999);
    return p;
  }

  var boot = window.__tm || {};
  var TM_STATE = boot.state && typeof boot.state === 'object' ? boot.state : {};
  TM_STATE.mode = 'boot'; TM_STATE.stage = 'mosswold'; TM_STATE.progress = 0;
  TM_STATE.score = 0; TM_STATE.health = 100;
  var DEBUG = { state: TM_STATE, forceMode: boot.forceMode || '', forceStage: boot.forceStage == null ? '' : boot.forceStage };
  window.__tm = DEBUG;

  var App = { game: null, scene: null };
  var pressQueue = [];
  var kit = GGKit.create({
    slug: 'thornmark', orientation: 'portrait', validateSave: validProfile,
    onPause: function () { if (App.scene) { App.scene.kitPaused = true; App.scene.pointerStates = {}; App.scene.keyPrev = {}; App.scene.gamepadPrev = {}; App.scene.accumulator = 0; App.scene.stick.x = 0; App.scene.stick.y = 0; App.scene.stickId = null; } },
    onResume: function () { if (App.scene) { App.scene.kitPaused = false; App.scene.keyPrev = {}; App.scene.accumulator = 0; } },
    onRestart: function () { pressQueue.length = 0; if (App.scene) { App.scene.pointerStates = {}; App.scene.keyPrev = {}; App.scene.gamepadPrev = {}; } }
  });
  // Press claims ride a WINDOW listener added AFTER GGKit init, so GGKit has
  // already created the pointer record and cannot overwrite ours. A tap that
  // goes down and up inside one frame still reaches the game through the queue.
  window.addEventListener('pointerdown', function (e) {
    if (kit.paused) return;
    if (!kit.input.pointers.get(e.pointerId)) {
      kit.input.pointers.set(e.pointerId, {
        x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
        downAt: performance.now(), zone: null
      });
    }
    GGKit.boundedPush(pressQueue, { id: e.pointerId, x: e.clientX, y: e.clientY }, 8);
  }, { passive: true });
  kit.audio.register({
    wilds: 'assets/music-wilds.mp3', keepmusic: 'assets/music-keep.mp3', undercroft: 'assets/music-undercroft.mp3',
    swing: 'assets/sfx-swing.mp3', hit: 'assets/sfx-hit.mp3', crit: 'assets/sfx-crit.mp3',
    arc: 'assets/sfx-arc.mp3', burst: 'assets/sfx-burst.mp3', cast: 'assets/sfx-cast.mp3',
    dodge: 'assets/sfx-dodge.mp3', hurt: 'assets/sfx-hurt.mp3', telegraph: 'assets/sfx-telegraph.mp3',
    loot: 'assets/sfx-loot.mp3', levelup: 'assets/sfx-levelup.mp3', enhanceok: 'assets/sfx-enhance-ok.mp3',
    enhancefail: 'assets/sfx-enhance-fail.mp3', boss: 'assets/sfx-boss.mp3', quest: 'assets/sfx-quest.mp3',
    bind: 'assets/sfx-bind.mp3', ui: 'assets/sfx-ui.mp3'
  });
  kit.audio.preload(['swing', 'hit', 'crit', 'arc', 'burst', 'cast', 'dodge', 'hurt', 'telegraph',
    'loot', 'levelup', 'enhanceok', 'enhancefail', 'boss', 'quest', 'bind', 'ui']);
  kit.registerPWA();
  kit.loader.show('THORNMARK');
  kit.loader.progress(0.06);

  var profile = migrate(kit.save.get(null));
  function saveProfile() { kit.save.set(profile); }
  saveProfile();

  // ------------------------------------------------------------- derived
  function talent(key) { return own(profile.talents, key) ? profile.talents[key] : 0; }
  function classDef() { return own(CLASSES, profile.cls) ? CLASSES[profile.cls] : CLASSES.warden; }
  function rarity(tier) { return RARITIES[clamp(Math.floor(num(tier, 0)), 0, RARITIES.length - 1)]; }
  function affixValue(item, key) {
    var total = 0;
    for (var i = 0; i < item.affixes.length; i++) {
      var a = item.affixes[i];
      if (a.key === key) total += AFFIXES[a.key].step * a.rank;
    }
    return total;
  }
  function gearAffix(key) {
    var total = 0;
    for (var i = 0; i < SLOTS.length; i++) total += affixValue(profile.gear[SLOTS[i]], key);
    return total;
  }
  function itemScore(item) {
    var r = rarity(item.tier), s = 0;
    for (var i = 0; i < item.affixes.length; i++) s += AFFIXES[item.affixes[i].key].step * item.affixes[i].rank;
    return Math.round((6 + item.plus * 4 + s) * r.mult);
  }
  function itemName(item) { return rarity(item.tier).name + ' ' + GEAR_NAMES[item.slot]; }
  function xpFor(level) { return Math.round(55 + level * level * 13); }
  function playerPower() {
    var g = profile.gear, base = 8 + g.weapon.plus * 3 + g.ring.plus * 2;
    var tierBonus = (rarity(g.weapon.tier).mult - 1) * 10 + (rarity(g.ring.tier).mult - 1) * 5;
    var scale = 1 + (profile.level - 1) * 0.115;
    var mods = (1 + gearAffix('power') / 100) * (1 + talent('edge') * 0.06) * classDef().power;
    return (base + tierBonus) * scale * mods;
  }
  function maxHp() {
    var g = profile.gear;
    var base = 90 + profile.level * 14 + g.armor.plus * 8 + Math.round((rarity(g.armor.tier).mult - 1) * 40);
    return Math.round((base + gearAffix('vigor')) * classDef().hp * (1 + talent('hide') * 0.08));
  }
  function damageCut() { return profile.gear.armor.plus * 0.6 + gearAffix('guard') + talent('bark') * 4; }
  function critChance() { return clamp(4 + gearAffix('edge') + talent('crit') * 4, 0, 60); }
  function cooldownScale() { return clamp(1 - gearAffix('haste') / 100 - talent('flow') * 0.07, 0.45, 1); }
  function moveSpeed() { return 128 * classDef().speed * (1 + talent('stride') * 0.05); }
  function dropChance() {
    return clamp(0.38 + Math.min(0.18, profile.gear.weapon.plus * 0.02) + gearAffix('fortune') / 100 + talent('fortune') * 0.08, 0, 0.92);
  }
  function xpGain(base) { return Math.round(base * (1 + talent('lore') * 0.08)); }
  function skillList() {
    var c = classDef(), out = [], i;
    for (i = 0; i < c.skills.length; i++) out.push(own(SKILLS, c.skills[i]) ? SKILLS[c.skills[i]] : SKILLS.thornarc);
    return out;
  }
  function enhanceCost(level) { return 18 + level * 14; }
  function enhanceRate(level) { return ENHANCE_RATES[clamp(Math.floor(level), 0, ENHANCE_RATES.length - 1)]; }
  function regionAt(index) { return REGIONS[clamp(Math.floor(num(index, 0)), 0, REGIONS.length - 1)]; }
  function floorAt(index) { return FLOORS[clamp(Math.floor(num(index, 1)) - 1, 0, FLOORS.length - 1)]; }
  function familyDef(key) { return own(FAMILIES, key) ? FAMILIES[key] : FAMILIES.thornling; }
  function bossDef(key) { return own(BOSSES, key) ? BOSSES[key] : BOSSES.rootcrown; }
  function activeQuest() { return profile.quest < QUESTS.length ? QUESTS[profile.quest] : null; }

  // ------------------------------------------------------------- textures
  function paintGround(c, size, g, seed) {
    var rnd = mulberry(seed), i, x, y, s;
    c.fillStyle = colorCss(g.base); c.fillRect(0, 0, size, size);
    for (i = 0; i < 90; i++) {
      x = Math.floor(rnd() * size); y = Math.floor(rnd() * size); s = 3 + Math.floor(rnd() * 9);
      c.fillStyle = colorCss(rnd() > 0.5 ? g.alt : g.grit);
      c.fillRect(x, y, s, s - 1);
    }
    for (i = 0; i < 34; i++) {
      x = Math.floor(rnd() * size); y = Math.floor(rnd() * size);
      c.fillStyle = colorCss(g.detail);
      c.fillRect(x, y, 2, 2);
      if (rnd() > 0.55) c.fillRect(x + 2, y + 2, 1, 3);
    }
    for (i = 0; i < 10; i++) {
      x = Math.floor(rnd() * size); y = Math.floor(rnd() * size);
      c.strokeStyle = colorCss(g.grit); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 8 - rnd() * 16, y + 10 + rnd() * 12); c.stroke();
    }
  }
  function paintPatch(c, size, kind, g, accent) {
    var rnd = mulberry(size + kind.length * 71), i;
    c.clearRect(0, 0, size, size);
    var r = size / 2;
    if (kind === 'flagstone' || kind === 'court') {
      c.fillStyle = colorCss(g.alt);
      for (var row = 0; row < 6; row++) for (var col = 0; col < 6; col++) {
        if (Math.hypot(col - 2.5, row - 2.5) > 3.1) continue;
        c.fillStyle = colorCss(rnd() > 0.5 ? g.alt : g.detail);
        c.fillRect(col * (size / 6) + 1, row * (size / 6) + 1, size / 6 - 2, size / 6 - 2);
      }
    } else if (kind === 'ash') {
      c.fillStyle = colorCss(g.detail);
      c.beginPath(); c.ellipse(r, r, r * 0.92, r * 0.7, 0, 0, TAU); c.fill();
      c.fillStyle = colorCss(accent); c.globalAlpha = 0.18;
      c.beginPath(); c.ellipse(r, r, r * 0.5, r * 0.36, 0, 0, TAU); c.fill();
      c.globalAlpha = 1;
    } else {
      c.fillStyle = colorCss(g.detail); c.globalAlpha = 0.85;
      c.beginPath(); c.ellipse(r, r, r * 0.9, r * 0.72, 0, 0, TAU); c.fill();
      c.globalAlpha = 1;
      c.fillStyle = colorCss(g.alt);
      for (i = 0; i < 16; i++) {
        var a = rnd() * TAU, d = rnd() * r * 0.8;
        c.fillRect(r + Math.cos(a) * d, r + Math.sin(a) * d, 3, 3);
      }
    }
  }
  function paintProp(c, kind, cw, ch) {
    c.save(); c.translate(cw / 2, ch);
    function trunk(w, h, col) { c.fillStyle = col; c.fillRect(-w / 2, -h, w, h); }
    if (kind === 'tree-a') {
      trunk(9, 26, '#3a2f24');
      c.fillStyle = '#2d5c40'; c.beginPath(); c.moveTo(0, -74); c.lineTo(21, -26); c.lineTo(-21, -26); c.closePath(); c.fill();
      c.fillStyle = '#3f7a53'; c.beginPath(); c.moveTo(0, -62); c.lineTo(16, -30); c.lineTo(-16, -30); c.closePath(); c.fill();
      c.fillStyle = '#54a06a'; c.fillRect(-5, -58, 4, 4); c.fillRect(6, -44, 4, 4);
    } else if (kind === 'tree-b') {
      trunk(11, 30, '#332a20');
      c.fillStyle = '#27503a'; c.beginPath(); c.ellipse(0, -50, 24, 20, 0, 0, TAU); c.fill();
      c.fillStyle = '#357049'; c.beginPath(); c.ellipse(-6, -56, 15, 13, 0, 0, TAU); c.fill();
      c.fillStyle = '#4b9060'; c.beginPath(); c.ellipse(8, -48, 9, 8, 0, 0, TAU); c.fill();
    } else if (kind === 'bush') {
      c.fillStyle = '#2b5a3e'; c.beginPath(); c.ellipse(0, -12, 17, 12, 0, 0, TAU); c.fill();
      c.fillStyle = '#3d7c51'; c.beginPath(); c.ellipse(-5, -16, 10, 8, 0, 0, TAU); c.fill();
      c.fillStyle = '#8fce7a'; c.fillRect(6, -18, 3, 3);
    } else if (kind === 'fern') {
      c.strokeStyle = '#3f8a5c'; c.lineWidth = 2;
      for (var f = -2; f <= 2; f++) { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(f * 7, -14, f * 12, -24); c.stroke(); }
      c.fillStyle = '#59ad72'; c.fillRect(-2, -4, 4, 4);
    } else if (kind === 'stump') {
      c.fillStyle = '#3c3126'; c.fillRect(-12, -16, 24, 16);
      c.fillStyle = '#5a4a37'; c.beginPath(); c.ellipse(0, -16, 12, 5, 0, 0, TAU); c.fill();
      c.strokeStyle = '#2c241b'; c.lineWidth = 1; c.beginPath(); c.ellipse(0, -16, 6, 2.6, 0, 0, TAU); c.stroke();
    } else if (kind === 'rock-a') {
      c.fillStyle = '#4d5a5c'; c.beginPath(); c.moveTo(-15, 0); c.lineTo(-9, -15); c.lineTo(5, -19); c.lineTo(15, -6); c.lineTo(11, 0); c.closePath(); c.fill();
      c.fillStyle = '#697a7c'; c.beginPath(); c.moveTo(-8, -14); c.lineTo(4, -18); c.lineTo(6, -10); c.closePath(); c.fill();
    } else if (kind === 'rock-b') {
      c.fillStyle = '#59605f'; c.beginPath(); c.moveTo(-19, 0); c.lineTo(-13, -22); c.lineTo(4, -27); c.lineTo(19, -10); c.lineTo(14, 0); c.closePath(); c.fill();
      c.fillStyle = '#767f7d'; c.fillRect(-8, -20, 10, 6);
      c.fillStyle = '#3d4443'; c.fillRect(2, -12, 8, 5);
    } else if (kind === 'mushroom') {
      c.fillStyle = '#d8d0bb'; c.fillRect(-3, -14, 6, 14);
      c.fillStyle = '#c9695a'; c.beginPath(); c.ellipse(0, -14, 11, 7, 0, 0, TAU); c.fill();
      c.fillStyle = '#f0e2cf'; c.fillRect(-5, -17, 3, 3); c.fillRect(3, -15, 3, 3);
    } else if (kind === 'pillar') {
      c.fillStyle = '#5d6773'; c.fillRect(-11, -66, 22, 66);
      c.fillStyle = '#79838f'; c.fillRect(-14, -72, 28, 8);
      c.fillStyle = '#404952'; c.fillRect(-11, -40, 22, 3); c.fillRect(-11, -22, 22, 3);
      c.fillStyle = '#8b96a2'; c.fillRect(-16, -4, 32, 6);
    } else if (kind === 'arch') {
      c.fillStyle = '#59636f'; c.fillRect(-26, -54, 10, 54); c.fillRect(16, -54, 10, 54);
      c.beginPath(); c.moveTo(-26, -54); c.lineTo(-26, -66); c.lineTo(26, -66); c.lineTo(26, -54); c.closePath(); c.fill();
      c.fillStyle = '#7a8592'; c.fillRect(-26, -66, 52, 5);
    } else if (kind === 'rubble') {
      c.fillStyle = '#4f5760';
      c.fillRect(-16, -9, 13, 9); c.fillRect(0, -13, 15, 13); c.fillRect(-6, -5, 10, 5);
      c.fillStyle = '#6e7883'; c.fillRect(2, -11, 7, 4); c.fillRect(-13, -7, 5, 3);
    } else if (kind === 'banner') {
      c.fillStyle = '#3b3a44'; c.fillRect(-2, -70, 4, 70);
      c.fillStyle = '#6c4a86'; c.beginPath(); c.moveTo(-14, -66); c.lineTo(14, -66); c.lineTo(14, -26); c.lineTo(0, -34); c.lineTo(-14, -26); c.closePath(); c.fill();
      c.fillStyle = '#c8a6ff'; c.beginPath(); c.arc(0, -50, 6, 0, TAU); c.fill();
      c.fillStyle = '#6c4a86'; c.beginPath(); c.arc(0, -50, 3, 0, TAU); c.fill();
    } else if (kind === 'brazier') {
      c.fillStyle = '#3f3a36'; c.fillRect(-4, -22, 8, 22);
      c.fillStyle = '#585049'; c.beginPath(); c.moveTo(-13, -34); c.lineTo(13, -34); c.lineTo(8, -22); c.lineTo(-8, -22); c.closePath(); c.fill();
      c.fillStyle = '#ff8a4c'; c.beginPath(); c.moveTo(0, -54); c.lineTo(9, -34); c.lineTo(-9, -34); c.closePath(); c.fill();
      c.fillStyle = '#ffd18a'; c.beginPath(); c.moveTo(0, -46); c.lineTo(5, -34); c.lineTo(-5, -34); c.closePath(); c.fill();
    } else if (kind === 'spikepost') {
      c.fillStyle = '#40382c'; c.fillRect(-4, -44, 8, 44);
      c.fillStyle = '#6d6152';
      for (var s = 0; s < 4; s++) { c.beginPath(); c.moveTo(-4, -12 - s * 10); c.lineTo(-14, -18 - s * 10); c.lineTo(-4, -18 - s * 10); c.closePath(); c.fill(); c.beginPath(); c.moveTo(4, -8 - s * 10); c.lineTo(14, -14 - s * 10); c.lineTo(4, -14 - s * 10); c.closePath(); c.fill(); }
    } else if (kind === 'bones') {
      c.fillStyle = '#cfc7ae';
      c.fillRect(-14, -5, 26, 4); c.fillRect(-16, -8, 5, 10); c.fillRect(11, -8, 5, 10);
      c.beginPath(); c.arc(-2, -14, 7, 0, TAU); c.fill();
      c.fillStyle = '#5d5747'; c.fillRect(-5, -16, 3, 3); c.fillRect(1, -16, 3, 3);
    } else {
      c.fillStyle = '#6f5aa8'; c.beginPath(); c.moveTo(0, -40); c.lineTo(10, -14); c.lineTo(0, 0); c.lineTo(-10, -14); c.closePath(); c.fill();
      c.fillStyle = '#b79cff'; c.beginPath(); c.moveTo(0, -32); c.lineTo(5, -16); c.lineTo(0, -8); c.lineTo(-5, -16); c.closePath(); c.fill();
    }
    c.restore();
  }
  var PROP_KINDS = ['tree-a', 'tree-b', 'bush', 'fern', 'stump', 'rock-a', 'rock-b', 'mushroom', 'pillar', 'arch', 'rubble', 'banner', 'brazier', 'spikepost', 'bones', 'crystal'];

  var HERO_STATES = ['idle', 'walk', 'attack', 'hurt', 'dodge', 'cast'];
  var ENEMY_STATES = ['idle', 'walk', 'wind', 'attack', 'hurt'];
  var BOSS_STATES = ['idle', 'wind', 'attack', 'hurt'];
  var HERO_CELL = 44, ENEMY_CELL = 44, BOSS_CELL = 78;

  function drawHero(c, cls, state, frame) {
    var def = own(CLASSES, cls) ? CLASSES[cls] : CLASSES.warden;
    var accent = colorCss(def.accent);
    var bob = state === 'walk' ? (frame ? -2 : 0) : state === 'idle' ? (frame ? -1 : 0) : state === 'attack' ? -3 : 0;
    var hurt = state === 'hurt';
    c.save(); c.translate(HERO_CELL / 2, 38 + bob); c.imageSmoothingEnabled = false;
    if (state === 'dodge') {
      c.fillStyle = accent; c.globalAlpha = 0.5; c.fillRect(-19, -12, 38, 9); c.globalAlpha = 1;
      c.fillStyle = hurt ? '#ffffff' : '#e6efe6'; c.fillRect(-10, -13, 20, 12);
      c.fillStyle = accent; c.fillRect(-7, -18, 14, 6);
      c.restore(); return;
    }
    // shadowed boots and cloak
    c.fillStyle = '#1b2622'; c.fillRect(-9, -4, 7, 5); c.fillRect(3, -4 + (state === 'walk' && frame ? 2 : 0), 7, 5);
    c.fillStyle = def.key === 'thornseer' ? '#2f2846' : def.key === 'emberblade' ? '#3a2320' : '#25382c';
    c.fillRect(-11, -22, 22, 19);
    c.fillStyle = hurt ? '#ffffff' : '#dfe9e0'; c.fillRect(-9, -25, 18, 17);
    c.fillStyle = accent; c.fillRect(-9, -18, 18, 4);
    c.fillStyle = hurt ? '#ffffff' : '#e8d8bd'; c.fillRect(-7, -34, 14, 10);
    c.fillStyle = '#22302c'; c.fillRect(1, -31, 4, 3);
    c.fillStyle = def.key === 'warden' ? '#4c6b4f' : def.key === 'emberblade' ? '#7a3527' : '#4a3d78';
    c.fillRect(-9, -38, 18, 5);
    if (def.key === 'thornseer') { c.fillStyle = accent; c.fillRect(-2, -44, 4, 7); }
    // weapon by class and state
    c.strokeStyle = state === 'attack' ? '#fbf5e4' : accent;
    c.lineWidth = state === 'attack' ? 4 : 3;
    c.beginPath();
    if (def.key === 'thornseer') { c.moveTo(9, -18); c.lineTo(state === 'attack' ? 20 : 15, state === 'attack' ? -36 : -32); }
    else if (def.key === 'emberblade') { c.moveTo(9, -20); c.lineTo(state === 'attack' ? 24 : 17, state === 'attack' ? -30 : -10); }
    else { c.moveTo(9, -20); c.lineTo(state === 'attack' ? 22 : 16, state === 'attack' ? -26 : -8); }
    c.stroke();
    if (state === 'attack') {
      c.strokeStyle = accent; c.lineWidth = 2; c.globalAlpha = 0.8;
      c.beginPath(); c.moveTo(10, -34); c.quadraticCurveTo(22, -24, 14, -8); c.stroke();
      c.globalAlpha = 1;
    }
    if (state === 'cast') {
      c.fillStyle = accent; c.globalAlpha = 0.85;
      c.beginPath(); c.arc(13, -26, frame ? 6 : 4, 0, TAU); c.fill();
      c.globalAlpha = 1;
    }
    if (hurt) { c.fillStyle = '#ffffff'; c.fillRect(-12, -40, 5, 5); c.fillRect(8, -40, 5, 5); }
    c.restore();
  }

  function drawEnemy(c, shape, state, frame) {
    var def = null, k;
    for (k in FAMILIES) if (own(FAMILIES, k) && FAMILIES[k].shape === shape) { def = FAMILIES[k]; break; }
    if (!def) def = FAMILIES.thornling;
    var col = colorCss(def.color), hurt = state === 'hurt', wind = state === 'wind';
    var bob = state === 'walk' ? (frame ? -2 : 1) : state === 'idle' ? (frame ? -1 : 0) : state === 'attack' ? -3 : 0;
    c.save(); c.translate(ENEMY_CELL / 2, 36 + bob); c.imageSmoothingEnabled = false;
    var body = hurt ? '#ffffff' : col;
    if (shape === 'thornling') {
      c.fillStyle = body; c.beginPath(); c.moveTo(0, -26); c.lineTo(11, -12); c.lineTo(0, 0); c.lineTo(-11, -12); c.closePath(); c.fill();
      c.fillStyle = '#16352a'; c.fillRect(-5, -17, 10, 5);
      c.fillStyle = '#d8f7c8'; c.fillRect(-3, -16, 2, 2); c.fillRect(2, -16, 2, 2);
      c.fillStyle = body; c.fillRect(-13, -20, 4, 4); c.fillRect(9, -20, 4, 4);
    } else if (shape === 'mireling') {
      c.fillStyle = body; c.beginPath(); c.ellipse(0, -12, 15, 13, 0, 0, TAU); c.fill();
      c.fillStyle = '#3a4620'; c.beginPath(); c.ellipse(0, -10, 8, 5, 0, 0, TAU); c.fill();
      c.fillStyle = '#f4ffcf'; c.fillRect(-6, -18, 3, 3); c.fillRect(4, -18, 3, 3);
      c.fillStyle = body; c.fillRect(-16, -6, 6, 5); c.fillRect(10, -6, 6, 5);
    } else if (shape === 'briarhound') {
      c.fillStyle = body; c.fillRect(-16, -18, 30, 12);
      c.fillRect(-19, -22, 11, 9);
      c.fillStyle = '#2b3a17'; c.fillRect(-19, -18, 5, 3);
      c.fillStyle = '#ffe27a'; c.fillRect(-17, -20, 3, 2);
      c.fillStyle = body; c.fillRect(-13, -7, 5, 7); c.fillRect(7, -7, 5, 7);
      c.fillStyle = '#4a5c2a'; for (var b = 0; b < 4; b++) c.fillRect(-10 + b * 6, -22, 3, 5);
    } else if (shape === 'baileyshade') {
      c.fillStyle = '#2c3742'; c.fillRect(-10, -8, 20, 8);
      c.fillStyle = body; c.fillRect(-10, -26, 20, 20);
      c.fillStyle = '#1a232c'; c.fillRect(-7, -22, 14, 8);
      c.fillStyle = '#9fe4ff'; c.fillRect(-5, -20, 3, 3); c.fillRect(3, -20, 3, 3);
      c.strokeStyle = '#c3ced8'; c.lineWidth = 2; c.beginPath();
      c.moveTo(11, -22); c.lineTo(wind || state === 'attack' ? 22 : 17, -12); c.stroke();
    } else if (shape === 'stonepike') {
      c.fillStyle = body; c.fillRect(-16, -30, 32, 30);
      c.fillStyle = '#4c463b'; c.fillRect(-10, -24, 20, 10);
      c.fillStyle = '#ffd08a'; c.fillRect(-7, -21, 4, 4); c.fillRect(4, -21, 4, 4);
      c.fillStyle = body; c.fillRect(-22, -26, 7, 12); c.fillRect(15, -26, 7, 12);
      c.strokeStyle = '#e8e0cd'; c.lineWidth = 2; c.strokeRect(-15, -29, 30, 28);
      if (wind) { c.fillStyle = '#ffb45c'; c.fillRect(-16, -34, 32, 3); }
    } else if (shape === 'cinderkin') {
      c.fillStyle = body; c.beginPath(); c.moveTo(0, -30); c.lineTo(13, -10); c.lineTo(0, 0); c.lineTo(-13, -10); c.closePath(); c.fill();
      c.fillStyle = '#5a2418'; c.fillRect(-6, -19, 12, 6);
      c.fillStyle = '#ffe9a8'; c.fillRect(-4, -18, 3, 3); c.fillRect(2, -18, 3, 3);
      c.fillStyle = '#ffb066'; c.fillRect(-2, -34, 4, 6);
    } else if (shape === 'ashwing') {
      c.fillStyle = body; c.beginPath(); c.ellipse(0, -18, 8, 11, 0, 0, TAU); c.fill();
      c.fillStyle = hurt ? '#ffffff' : '#c9a352';
      var flap = frame ? -8 : -2;
      c.beginPath(); c.moveTo(-6, -22); c.lineTo(-21, -22 + flap); c.lineTo(-6, -14); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(6, -22); c.lineTo(21, -22 + flap); c.lineTo(6, -14); c.closePath(); c.fill();
      c.fillStyle = '#402a12'; c.fillRect(-3, -22, 6, 4);
      c.fillStyle = '#fff0c0'; c.fillRect(-2, -21, 2, 2);
    } else {
      c.fillStyle = '#2b2440'; c.fillRect(-11, -9, 22, 9);
      c.fillStyle = body; c.fillRect(-12, -30, 24, 22);
      c.fillStyle = '#332a4d'; c.fillRect(-8, -26, 16, 9);
      c.fillStyle = '#ffe8b0'; c.fillRect(-6, -24, 4, 4); c.fillRect(3, -24, 4, 4);
      c.fillStyle = '#e6dbff'; c.fillRect(-20, -26, 7, 18);
      c.strokeStyle = '#f2e6ff'; c.lineWidth = 3; c.beginPath();
      c.moveTo(13, -26); c.lineTo(state === 'attack' ? 26 : 19, state === 'attack' ? -6 : -12); c.stroke();
      c.fillStyle = '#f2bd63'; c.fillRect(-6, -35, 12, 4);
    }
    if (wind) {
      c.strokeStyle = '#ff8f7a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-14, -38); c.lineTo(0, -46); c.lineTo(14, -38); c.stroke();
    }
    c.restore();
  }

  function drawBoss(c, shape, state, frame) {
    var def = BOSSES[shape] || BOSSES.rootcrown;
    var col = colorCss(def.color), hurt = state === 'hurt', wind = state === 'wind';
    var bob = state === 'idle' ? (frame ? -2 : 1) : state === 'attack' ? -4 : 0;
    c.save(); c.translate(BOSS_CELL / 2, 66 + bob); c.imageSmoothingEnabled = false;
    var body = hurt ? '#ffffff' : col;
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(0, 2, 26, 7, 0, 0, TAU); c.fill();
    if (shape === 'rootcrown' || shape === 'briarjaw') {
      c.fillStyle = '#2c4429'; c.fillRect(-24, -18, 48, 18);
      c.fillStyle = body; c.beginPath(); c.moveTo(0, -60); c.lineTo(26, -18); c.lineTo(-26, -18); c.closePath(); c.fill();
      c.fillStyle = '#1c3320'; c.fillRect(-13, -38, 26, 11);
      c.fillStyle = shape === 'briarjaw' ? '#ffca6a' : '#f0ffd0';
      c.fillRect(-9, -35, 5, 5); c.fillRect(5, -35, 5, 5);
      c.fillStyle = body;
      for (var r = 0; r < 5; r++) { c.beginPath(); c.moveTo(-22 + r * 11, -58); c.lineTo(-18 + r * 11, -74); c.lineTo(-14 + r * 11, -58); c.closePath(); c.fill(); }
      if (shape === 'briarjaw') { c.fillStyle = '#e8ffbf'; for (var j = 0; j < 6; j++) c.fillRect(-15 + j * 6, -28, 3, 6); }
    } else if (shape === 'palesergeant' || shape === 'ossiar') {
      c.fillStyle = '#3b4552'; c.fillRect(-20, -18, 40, 18);
      c.fillStyle = body; c.fillRect(-20, -54, 40, 38);
      c.fillStyle = '#232c37'; c.fillRect(-13, -48, 26, 13);
      c.fillStyle = '#9fe4ff'; c.fillRect(-9, -45, 5, 5); c.fillRect(5, -45, 5, 5);
      c.fillStyle = body; c.fillRect(-32, -50, 11, 26); c.fillRect(21, -50, 11, 26);
      c.strokeStyle = '#f0eada'; c.lineWidth = 3; c.beginPath();
      c.moveTo(26, -46); c.lineTo(state === 'attack' ? 44 : 34, state === 'attack' ? -10 : -22); c.stroke();
      c.fillStyle = '#d8d2bf'; c.fillRect(-16, -62, 32, 7);
    } else if (shape === 'cindermaw' || shape === 'slaghound') {
      c.fillStyle = body; c.beginPath(); c.ellipse(0, -26, 30, 22, 0, 0, TAU); c.fill();
      c.fillStyle = '#5b2113'; c.beginPath(); c.ellipse(0, -20, 19, 11, 0, 0, TAU); c.fill();
      c.fillStyle = '#ffdca4';
      for (var m = 0; m < 6; m++) { c.beginPath(); c.moveTo(-16 + m * 6, -26); c.lineTo(-13 + m * 6, -14); c.lineTo(-10 + m * 6, -26); c.closePath(); c.fill(); }
      c.fillStyle = '#fff0c6'; c.fillRect(-16, -40, 7, 6); c.fillRect(9, -40, 7, 6);
      c.fillStyle = body; c.fillRect(-34, -34, 10, 16); c.fillRect(24, -34, 10, 16);
      if (wind) { c.fillStyle = '#ff9a55'; c.beginPath(); c.ellipse(0, -14, 22, 7, 0, 0, TAU); c.fill(); }
    } else if (shape === 'graveweft') {
      c.fillStyle = body; c.beginPath(); c.moveTo(0, -62); c.lineTo(24, -22); c.lineTo(14, -4); c.lineTo(-14, -4); c.lineTo(-24, -22); c.closePath(); c.fill();
      c.fillStyle = '#12303a'; c.fillRect(-12, -46, 24, 12);
      c.fillStyle = '#bff2ff'; c.fillRect(-8, -43, 5, 5); c.fillRect(4, -43, 5, 5);
      c.strokeStyle = '#9fd8e8'; c.lineWidth = 2;
      for (var g = 0; g < 5; g++) { c.beginPath(); c.moveTo(-22 + g * 11, -6); c.lineTo(-26 + g * 12, -30); c.stroke(); }
    } else {
      c.fillStyle = '#332a52'; c.fillRect(-22, -18, 44, 18);
      c.fillStyle = body; c.fillRect(-22, -58, 44, 42);
      c.fillStyle = '#241d3a'; c.fillRect(-14, -50, 28, 14);
      c.fillStyle = '#ffe8b0'; c.fillRect(-10, -47, 6, 6); c.fillRect(5, -47, 6, 6);
      c.fillStyle = '#f2bd63';
      c.beginPath(); c.moveTo(-20, -60); c.lineTo(-12, -78); c.lineTo(-4, -62); c.lineTo(4, -78); c.lineTo(12, -62); c.lineTo(20, -78); c.lineTo(22, -58); c.lineTo(-22, -58); c.closePath(); c.fill();
      c.fillStyle = '#b092ff'; c.beginPath(); c.arc(0, -70, 5, 0, TAU); c.fill();
      c.fillStyle = body; c.fillRect(-34, -54, 11, 28); c.fillRect(23, -54, 11, 28);
      if (state === 'attack') { c.fillStyle = '#e2d0ff'; c.fillRect(-36, -14, 72, 5); }
    }
    if (wind) {
      c.strokeStyle = '#ff8f7a'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-20, -84); c.lineTo(0, -94); c.lineTo(20, -84); c.stroke();
    }
    c.restore();
  }

  function drawSkillIcon(c, icon, size, color) {
    var h = size / 2;
    c.clearRect(0, 0, size, size);
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 3; c.lineCap = 'round';
    if (icon === 'arc') {
      c.beginPath(); c.arc(h, h + 4, h - 6, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
      c.beginPath(); c.arc(h, h + 8, h - 12, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    } else if (icon === 'burst') {
      c.beginPath(); c.arc(h, h, 5, 0, TAU); c.fill();
      for (var i = 0; i < 8; i++) {
        var a = i * TAU / 8;
        c.beginPath(); c.moveTo(h + Math.cos(a) * 8, h + Math.sin(a) * 8);
        c.lineTo(h + Math.cos(a) * (h - 4), h + Math.sin(a) * (h - 4)); c.stroke();
      }
    } else if (icon === 'shield') {
      c.beginPath(); c.moveTo(h, 5); c.lineTo(h + 10, 10); c.lineTo(h + 10, h + 3); c.lineTo(h, size - 5);
      c.lineTo(h - 10, h + 3); c.lineTo(h - 10, 10); c.closePath(); c.stroke();
      c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1;
    } else if (icon === 'root') {
      c.beginPath(); c.moveTo(h, 5); c.lineTo(h, size - 6); c.stroke();
      c.beginPath(); c.moveTo(h, size - 6); c.lineTo(h - 9, size - 14); c.moveTo(h, size - 6); c.lineTo(h + 9, size - 14); c.stroke();
      c.beginPath(); c.moveTo(h - 8, 9); c.lineTo(h + 8, 9); c.stroke();
    } else if (icon === 'roar') {
      for (var r = 0; r < 3; r++) { c.beginPath(); c.arc(h - 6, h, 5 + r * 6, -0.9, 0.9); c.stroke(); }
      c.beginPath(); c.arc(h - 10, h, 4, 0, TAU); c.fill();
    } else if (icon === 'dash') {
      c.beginPath(); c.moveTo(6, size - 8); c.lineTo(size - 8, 8); c.stroke();
      c.beginPath(); c.moveTo(size - 8, 8); c.lineTo(size - 16, 9); c.moveTo(size - 8, 8); c.lineTo(size - 9, 16); c.stroke();
      c.lineWidth = 2; c.globalAlpha = 0.6;
      c.beginPath(); c.moveTo(6, size - 15); c.lineTo(size - 16, 6); c.stroke(); c.globalAlpha = 1;
    } else if (icon === 'rain') {
      for (var d = 0; d < 4; d++) { c.beginPath(); c.moveTo(8 + d * 8, 6 + (d % 2) * 4); c.lineTo(4 + d * 8, size - 8); c.stroke(); }
    } else if (icon === 'mark') {
      c.beginPath(); c.arc(h, h, h - 6, 0, TAU); c.stroke();
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(h, 3); c.lineTo(h, 11); c.moveTo(h, size - 3); c.lineTo(h, size - 11);
      c.moveTo(3, h); c.lineTo(11, h); c.moveTo(size - 3, h); c.lineTo(size - 11, h); c.stroke();
      c.beginPath(); c.arc(h, h, 3, 0, TAU); c.fill();
    } else if (icon === 'volley') {
      for (var v = -1; v <= 1; v++) {
        c.beginPath(); c.ellipse(h + v * 10, h + Math.abs(v) * 4, 4, 7, v * 0.4, 0, TAU); c.fill();
      }
    } else if (icon === 'bloom') {
      for (var p = 0; p < 6; p++) {
        var pa = p * TAU / 6;
        c.beginPath(); c.ellipse(h + Math.cos(pa) * 8, h + Math.sin(pa) * 8, 5, 3, pa, 0, TAU); c.fill();
      }
      c.fillStyle = '#0a1012'; c.beginPath(); c.arc(h, h, 3.5, 0, TAU); c.fill();
    } else if (icon === 'sigil') {
      c.beginPath(); c.arc(h, h, h - 6, 0, TAU); c.stroke();
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(h, 7); c.lineTo(size - 8, h + 5); c.lineTo(8, h + 5); c.closePath(); c.stroke();
    } else {
      c.beginPath(); c.arc(h, h, h - 7, 0, TAU); c.stroke();
      c.lineWidth = 2; c.beginPath(); c.arc(h, h, h - 13, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(h, 4); c.lineTo(h, size - 4); c.stroke();
    }
  }

  function drawGlyph(c, glyph, size, color) {
    var h = size / 2;
    c.clearRect(0, 0, size, size);
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 2.6; c.lineCap = 'round';
    if (glyph === 'book') {
      c.beginPath(); c.moveTo(8, 8); c.lineTo(8, size - 8); c.lineTo(h, size - 12); c.lineTo(h, 4); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(size - 8, 8); c.lineTo(size - 8, size - 8); c.lineTo(h, size - 12); c.lineTo(h, 4); c.closePath(); c.stroke();
    } else if (glyph === 'pause') {
      c.fillRect(h - 9, 8, 6, size - 16); c.fillRect(h + 3, 8, 6, size - 16);
    } else if (glyph === 'hunt') {
      c.beginPath(); c.arc(h, h, h - 8, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(h, 3); c.lineTo(h, 10); c.moveTo(h, size - 3); c.lineTo(h, size - 10);
      c.moveTo(3, h); c.lineTo(10, h); c.moveTo(size - 3, h); c.lineTo(size - 10, h); c.stroke();
      c.beginPath(); c.arc(h, h, 3, 0, TAU); c.fill();
    } else if (glyph === 'roll') {
      c.beginPath(); c.arc(h, h, h - 8, 0.5, TAU - 0.4); c.stroke();
      c.beginPath(); c.moveTo(h + 7, h - 8); c.lineTo(h + 11, h - 1); c.lineTo(h + 3, h - 2); c.closePath(); c.fill();
    } else if (glyph === 'target') {
      c.beginPath(); c.arc(h, h, h - 6, 0, TAU); c.stroke();
      c.beginPath(); c.arc(h, h, 3, 0, TAU); c.fill();
    } else {
      c.beginPath(); c.moveTo(8, h); c.lineTo(h, 8); c.lineTo(size - 8, h); c.lineTo(h, size - 8); c.closePath(); c.stroke();
    }
  }

  function makeCanvasTexture(scene, key, w, h, paint) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h));
    paint(cv.getContext('2d'), cv.width, cv.height);
    scene.textures.addCanvas(key, cv);
  }

  // --------------------------------------------------------------- quests
  function bossRegionIndex(key) { var b = BOSSES[key]; return b && b.region != null ? b.region : -1; }
  function maxPlus() { return Math.max(profile.gear.weapon.plus, profile.gear.armor.plus, profile.gear.ring.plus); }
  function maxTier() { return Math.max(profile.gear.weapon.tier, profile.gear.armor.tier, profile.gear.ring.tier); }
  function questProgress(q) {
    if (!q) return { have: 1, need: 1 };
    var base = num(profile.questBase, 0), idx;
    switch (q.type) {
      case 'kill': return { have: clamp((own(profile.kills, q.target) ? profile.kills[q.target] : 0) - base, 0, q.count), need: q.count };
      case 'level': return { have: clamp(profile.level, 0, q.count), need: q.count };
      case 'boss':
        idx = bossRegionIndex(q.target);
        return { have: idx >= 0 && profile.bossDown[idx] ? 1 : 0, need: 1 };
      case 'travel':
        idx = own(REGION_BY_KEY, q.target) ? REGION_BY_KEY[q.target].index : 0;
        return { have: profile.unlocked[idx] ? 1 : 0, need: 1 };
      case 'enhance':
        return { have: clamp(q.target === 'any' ? maxPlus() : profile.gear[q.target] ? profile.gear[q.target].plus : 0, 0, q.count), need: q.count };
      case 'shards': return { have: clamp(profile.shardsFound - base, 0, q.count), need: q.count };
      case 'craft': return { have: clamp(profile.crafted - base, 0, q.count), need: q.count };
      case 'dungeon': return { have: clamp(profile.floorsCleared, 0, q.count), need: q.count };
      case 'dodge': return { have: clamp(profile.dodges - base, 0, q.count), need: q.count };
      case 'rarity': return { have: clamp(maxTier(), 0, q.count), need: q.count };
      default: return { have: 0, need: 1 };
    }
  }
  function questBaseFor(q) {
    if (!q) return 0;
    if (q.type === 'kill') return own(profile.kills, q.target) ? profile.kills[q.target] : 0;
    if (q.type === 'shards') return profile.shardsFound;
    if (q.type === 'craft') return profile.crafted;
    if (q.type === 'dodge') return profile.dodges;
    return 0;
  }

  // ---------------------------------------------------------------- scene
  function Scene() { Phaser.Scene.call(this, { key: 'thornmark' }); }
  Scene.prototype = Object.create(Phaser.Scene.prototype);
  Scene.prototype.constructor = Scene;

  Scene.prototype.create = function () {
    App.scene = this;
    this.kitPaused = kit.paused; this.accumulator = 0; this.simTime = 0;
    this.keyPrev = {}; this.pointerStates = {}; this.gamepadPrev = {}; this.pointerStamp = 0;
    this.stick = { x: 0, y: 0 }; this.stickId = null;
    this.moveX = 0; this.moveY = 0;
    this.mode = 'title'; this.panel = ''; this.panelTab = 'gear'; this.panelSlot = 'weapon';
    this.autoHunt = false;
    this.toastQueue = []; this.toast = { text: '', color: PAL.paper, time: 0 };
    this.coach = { text: '', time: 0 };
    this.banner = { text: '', sub: '', time: 0, scale: 0 };
    this.camX = 0; this.camY = 0;
    this.hero = {
      x: 0, y: 0, hp: 1, maxHp: 1, shield: 0, shieldTime: 0, facing: 1, state: 'idle', anim: 0,
      attackCd: 0, dodgeCd: 0, dodgeTime: 0, invuln: 0, hurtTime: 0, targetId: 0, manualTarget: false,
      snare: 0, slow: 0, regen: 0, regenTime: 0, guardTime: 0, dashTime: 0, dashX: 0, dashY: 0,
      cds: [0, 0, 0, 0, 0, 0], castTime: 0, hitTaken: 0
    };
    this.enemies = []; this.shots = []; this.hazards = []; this.fx = []; this.numbers = [];
    this.enemyViews = []; this.shotViews = []; this.hazardViews = []; this.fxViews = []; this.numberViews = [];
    this.props = []; this.propViews = []; this.patchViews = [];
    this.nextId = 1;
    this.run = null;
    this.ashfall = { active: 0, x: 0, y: 0, left: 0, clock: 0, radius: 92, damage: 0 };
    this.buildTextures();
    this.allocPools();
    this.buildWorld();
    this.buildUi();
    this.applyBoot();
    kit.loader.progress(1); kit.loader.hide();
    this.updateDebug();
  };

  Scene.prototype.buildTextures = function () {
    var self = this, i, j, k;
    REGIONS.forEach(function (r, index) {
      makeCanvasTexture(self, 'tm-ground-' + index, 128, 128, function (c, w) { paintGround(c, w, r.ground, r.seed); });
      makeCanvasTexture(self, 'tm-patch-' + index, 96, 96, function (c, w) { paintPatch(c, w, r.patch, r.ground, r.accent); });
    });
    FLOORS.forEach(function (f, index) {
      makeCanvasTexture(self, 'tm-ground-d' + index, 128, 128, function (c, w) { paintGround(c, w, f.ground, 900 + index * 37); });
      makeCanvasTexture(self, 'tm-patch-d' + index, 96, 96, function (c, w) { paintPatch(c, w, 'flagstone', f.ground, f.accent); });
    });
    kit.loader.progress(0.2);

    // Prop sheet: 16 kinds, cell 64x88.
    var pw = 64, ph = 88;
    makeCanvasTexture(this, 'tm-props', pw * PROP_KINDS.length, ph, function (c) {
      for (var p = 0; p < PROP_KINDS.length; p++) { c.save(); c.translate(p * pw, 0); paintProp(c, PROP_KINDS[p], pw, ph); c.restore(); }
    });
    var propTex = this.textures.get('tm-props');
    for (i = 0; i < PROP_KINDS.length; i++) propTex.add(PROP_KINDS[i], 0, i * pw, 0, pw, ph);
    kit.loader.progress(0.32);

    // Hero sheet.
    var heroCount = CLASS_KEYS.length * HERO_STATES.length * 2;
    makeCanvasTexture(this, 'tm-hero', HERO_CELL * heroCount, 48, function (c) {
      var n = 0;
      for (var ci = 0; ci < CLASS_KEYS.length; ci++)
        for (var si = 0; si < HERO_STATES.length; si++)
          for (var fr = 0; fr < 2; fr++) { c.save(); c.translate(n * HERO_CELL, 0); drawHero(c, CLASS_KEYS[ci], HERO_STATES[si], fr); c.restore(); n++; }
    });
    var heroTex = this.textures.get('tm-hero'); k = 0;
    for (i = 0; i < CLASS_KEYS.length; i++)
      for (j = 0; j < HERO_STATES.length; j++)
        for (var hf = 0; hf < 2; hf++) { heroTex.add(CLASS_KEYS[i] + '-' + HERO_STATES[j] + '-' + hf, 0, k * HERO_CELL, 0, HERO_CELL, 48); k++; }
    kit.loader.progress(0.46);

    // Enemy sheet.
    var eCount = SHAPES.length * ENEMY_STATES.length * 2;
    makeCanvasTexture(this, 'tm-enemy', ENEMY_CELL * eCount, 48, function (c) {
      var n = 0;
      for (var si = 0; si < SHAPES.length; si++)
        for (var st = 0; st < ENEMY_STATES.length; st++)
          for (var fr = 0; fr < 2; fr++) { c.save(); c.translate(n * ENEMY_CELL, 0); drawEnemy(c, SHAPES[si], ENEMY_STATES[st], fr); c.restore(); n++; }
    });
    var eTex = this.textures.get('tm-enemy'); k = 0;
    for (i = 0; i < SHAPES.length; i++)
      for (j = 0; j < ENEMY_STATES.length; j++)
        for (var ef = 0; ef < 2; ef++) { eTex.add(SHAPES[i] + '-' + ENEMY_STATES[j] + '-' + ef, 0, k * ENEMY_CELL, 0, ENEMY_CELL, 48); k++; }
    kit.loader.progress(0.58);

    // Boss sheet.
    var bCount = BOSS_SHAPES.length * BOSS_STATES.length * 2;
    makeCanvasTexture(this, 'tm-boss', BOSS_CELL * bCount, 100, function (c) {
      var n = 0;
      for (var si = 0; si < BOSS_SHAPES.length; si++)
        for (var st = 0; st < BOSS_STATES.length; st++)
          for (var fr = 0; fr < 2; fr++) { c.save(); c.translate(n * BOSS_CELL, 0); drawBoss(c, BOSS_SHAPES[si], BOSS_STATES[st], fr); c.restore(); n++; }
    });
    var bTex = this.textures.get('tm-boss'); k = 0;
    for (i = 0; i < BOSS_SHAPES.length; i++)
      for (j = 0; j < BOSS_STATES.length; j++)
        for (var bf = 0; bf < 2; bf++) { bTex.add(BOSS_SHAPES[i] + '-' + BOSS_STATES[j] + '-' + bf, 0, k * BOSS_CELL, 0, BOSS_CELL, 100); k++; }
    kit.loader.progress(0.7);

    // FX atoms.
    makeCanvasTexture(this, 'tm-spark', 12, 12, function (c, w) {
      var g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    makeCanvasTexture(this, 'tm-shard', 10, 14, function (c, w, h) {
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w, h * 0.55); c.lineTo(w / 2, h); c.lineTo(0, h * 0.55); c.closePath(); c.fill();
    });
    makeCanvasTexture(this, 'tm-dust', 14, 8, function (c, w, h) {
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, TAU); c.fill();
    });
    makeCanvasTexture(this, 'tm-leaf', 12, 8, function (c, w, h) {
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(w / 2, h / 2, w / 2, h / 2.4, 0.4, 0, TAU); c.fill();
    });
    makeCanvasTexture(this, 'tm-ring', 72, 72, function (c, w) {
      c.strokeStyle = '#ffffff'; c.lineWidth = 5; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 4, 0, TAU); c.stroke();
    });
    makeCanvasTexture(this, 'tm-disc', 64, 64, function (c, w) {
      var g = c.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.6, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    makeCanvasTexture(this, 'tm-tele-ring', 128, 128, function (c, w) {
      c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.globalAlpha = 0.9;
      c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 5, 0, TAU); c.stroke();
      c.globalAlpha = 0.22; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 8, 0, TAU); c.fill();
    });
    makeCanvasTexture(this, 'tm-shadow', 40, 18, function (c, w, h) {
      var g = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    makeCanvasTexture(this, 'tm-bracket', 48, 48, function (c, w) {
      c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.lineCap = 'square';
      var m = 4, s = 13;
      [[m, m, 1, 1], [w - m, m, -1, 1], [m, w - m, 1, -1], [w - m, w - m, -1, -1]].forEach(function (q) {
        c.beginPath(); c.moveTo(q[0] + q[2] * s, q[1]); c.lineTo(q[0], q[1]); c.lineTo(q[0], q[1] + q[3] * s); c.stroke();
      });
    });
    makeCanvasTexture(this, 'tm-chevron', 16, 12, function (c, w, h) {
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(w / 2, h); c.lineTo(w, 0); c.lineTo(0, 0); c.closePath(); c.fill();
    });
    makeCanvasTexture(this, 'tm-portal', 56, 68, function (c, w, h) {
      c.strokeStyle = '#ffffff'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(6, h - 4); c.lineTo(6, 24); c.quadraticCurveTo(w / 2, -8, w - 6, 24); c.lineTo(w - 6, h - 4); c.stroke();
      c.globalAlpha = 0.3; c.fillStyle = '#ffffff';
      c.beginPath(); c.moveTo(9, h - 5); c.lineTo(9, 25); c.quadraticCurveTo(w / 2, -3, w - 9, 25); c.lineTo(w - 9, h - 5); c.closePath(); c.fill();
    });
    makeCanvasTexture(this, 'tm-bindstone', 44, 56, function (c, w, h) {
      c.fillStyle = '#7c8a94'; c.beginPath(); c.moveTo(10, h - 4); c.lineTo(13, 14); c.lineTo(w / 2, 4); c.lineTo(w - 13, 14); c.lineTo(w - 10, h - 4); c.closePath(); c.fill();
      c.fillStyle = '#9fb6c2'; c.fillRect(16, 20, w - 32, 6);
      c.fillStyle = '#8ff0c2'; c.beginPath(); c.arc(w / 2, h / 2 + 4, 7, 0, TAU); c.fill();
      c.fillStyle = '#1a2a2c'; c.beginPath(); c.arc(w / 2, h / 2 + 4, 3, 0, TAU); c.fill();
    });
    makeCanvasTexture(this, 'tm-stair', 64, 60, function (c, w, h) {
      c.fillStyle = '#3a4148';
      for (var s = 0; s < 4; s++) c.fillRect(6 + s * 6, h - 12 - s * 11, w - 12 - s * 12, 12);
      c.fillStyle = '#10151a'; c.fillRect(20, 4, w - 40, 16);
      c.fillStyle = '#7ec8e0'; c.fillRect(24, 8, w - 48, 3);
    });
    makeCanvasTexture(this, 'tm-vignette', 96, 208, function (c, w, h) {
      var g = c.createRadialGradient(w / 2, h / 2, w * 0.22, w / 2, h / 2, w * 1.05);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.62, 'rgba(0,0,0,0.24)'); g.addColorStop(1, 'rgba(0,0,0,0.72)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    kit.loader.progress(0.82);

    // Skill icons and HUD glyphs.
    var seen = {};
    Object.keys(SKILLS).forEach(function (key) {
      var s = SKILLS[key];
      if (seen[s.icon]) return;
      seen[s.icon] = 1;
      makeCanvasTexture(self, 'tm-icon-' + s.icon, 40, 40, function (c, w) { drawSkillIcon(c, s.icon, w, '#ffffff'); });
    });
    ['book', 'pause', 'hunt', 'roll', 'target', 'gem'].forEach(function (g) {
      makeCanvasTexture(self, 'tm-glyph-' + g, 36, 36, function (c, w) { drawGlyph(c, g, w, '#ffffff'); });
    });
    // Baked HUD chrome, one texture instead of a live command list.
    makeCanvasTexture(this, 'tm-hud-top', W, 130, function (c, w) {
      var g = c.createLinearGradient(0, 0, 0, 130);
      g.addColorStop(0, 'rgba(8,16,17,0.94)'); g.addColorStop(0.72, 'rgba(8,16,17,0.72)'); g.addColorStop(1, 'rgba(8,16,17,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, 130);
    });
    makeCanvasTexture(this, 'tm-hud-bottom', W, 220, function (c, w) {
      var g = c.createLinearGradient(0, 0, 0, 220);
      g.addColorStop(0, 'rgba(8,16,17,0)'); g.addColorStop(0.4, 'rgba(8,16,17,0.55)'); g.addColorStop(1, 'rgba(8,16,17,0.9)');
      c.fillStyle = g; c.fillRect(0, 0, w, 220);
    });
    makeCanvasTexture(this, 'tm-stick-base', 116, 116, function (c, w) {
      c.strokeStyle = 'rgba(241,236,224,0.34)'; c.lineWidth = 3;
      c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 4, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(126,224,178,0.2)'; c.lineWidth = 1;
      c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 16, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(12,24,24,0.4)'; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 5, 0, TAU); c.fill();
    });
    makeCanvasTexture(this, 'tm-stick-thumb', 52, 52, function (c, w) {
      var g = c.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(241,236,224,0.95)'); g.addColorStop(0.7, 'rgba(160,190,180,0.7)'); g.addColorStop(1, 'rgba(120,150,145,0.25)');
      c.fillStyle = g; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 2, 0, TAU); c.fill();
    });
    makeCanvasTexture(this, 'tm-button', 60, 60, function (c, w) {
      c.fillStyle = 'rgba(16,30,30,0.9)'; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 2, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(241,236,224,0.42)'; c.lineWidth = 2;
      c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 3, 0, TAU); c.stroke();
    });
    kit.loader.progress(0.9);
  };

  Scene.prototype.allocPools = function () {
    var i;
    for (i = 0; i < MAX_ENEMIES; i++) this.enemies.push({
      alive: false, id: 0, key: 'thornling', boss: false, x: 0, y: 0, hp: 0, maxHp: 1, radius: 13,
      speed: 24, chase: 2.4, damage: 4, reach: 26, kind: 'melee', state: 'idle', anim: 0, flash: 0,
      wind: 0, windMax: 1, cd: 1, aggro: 0, stun: 0, slow: 0, mark: 0, hurt: 0, vx: 0, vy: 0,
      xp: 6, gold: 6, phase: 0, summonCd: 8, tele: 0, teleR: 40, home: 0,
      charge: 0, chargeX: 0, chargeY: 0
    });
    for (i = 0; i < MAX_SHOTS; i++) this.shots.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0, foe: true, homing: 0, target: 0, color: PAL.paper });
    for (i = 0; i < MAX_HAZARDS; i++) this.hazards.push({ alive: false, kind: 'pollen', x: 0, y: 0, r: 40, warn: 0, life: 0, maxLife: 1, damage: 0, tick: 0 });
    for (i = 0; i < MAX_FX; i++) this.fx.push({ alive: false, kind: 'spark', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, rot: 0, spin: 0, color: 0xffffff, grow: 0, fade: 1 });
    for (i = 0; i < MAX_NUMBERS; i++) this.numbers.push({ alive: false, x: 0, y: 0, vy: -34, life: 0, maxLife: 0.72, text: '', color: PAL.paper, big: false });
  };

  Scene.prototype.buildWorld = function () {
    var i, self = this;
    this.ground = this.add.tileSprite(0, 0, W, H, 'tm-ground-0').setOrigin(0, 0).setScrollFactor(0).setDepth(-200);
    for (i = 0; i < MAX_PATCHES; i++) this.patchViews.push(this.add.image(0, 0, 'tm-patch-0').setDepth(-150).setVisible(false));
    for (i = 0; i < MAX_PROPS; i++) this.propViews.push(this.add.image(0, 0, 'tm-props', 'tree-a').setOrigin(0.5, 1).setVisible(false));
    this.bindView = this.add.image(0, 0, 'tm-bindstone').setOrigin(0.5, 1).setVisible(false);
    this.stairView = this.add.image(0, 0, 'tm-stair').setOrigin(0.5, 1).setVisible(false);
    this.portalViews = [];
    for (i = 0; i < 2; i++) this.portalViews.push(this.add.image(0, 0, 'tm-portal').setOrigin(0.5, 1).setVisible(false));
    for (i = 0; i < MAX_HAZARDS; i++) this.hazardViews.push({
      warn: this.add.image(0, 0, 'tm-tele-ring').setVisible(false).setDepth(-100),
      body: this.add.image(0, 0, 'tm-disc').setVisible(false).setDepth(-95)
    });
    this.heroShadow = this.add.image(0, 0, 'tm-shadow').setVisible(false).setDepth(-59);
    this.heroView = this.add.image(0, 0, 'tm-hero', 'warden-idle-0').setOrigin(0.5, 1).setVisible(false);
    this.heroAura = this.add.image(0, 0, 'tm-ring').setVisible(false).setDepth(-58);
    for (i = 0; i < MAX_ENEMIES; i++) this.enemyViews.push({
      shadow: this.add.image(0, 0, 'tm-shadow').setVisible(false).setDepth(-60),
      body: this.add.image(0, 0, 'tm-enemy', 'thornling-idle-0').setOrigin(0.5, 1).setVisible(false),
      tele: this.add.image(0, 0, 'tm-tele-ring').setVisible(false).setDepth(-80),
      barBg: this.add.rectangle(0, 0, 30, 4, 0x0d1a18, 0.9).setVisible(false).setDepth(8600),
      bar: this.add.rectangle(0, 0, 30, 4, PAL.danger, 1).setOrigin(0, 0.5).setVisible(false).setDepth(8601),
      chev: this.add.image(0, 0, 'tm-chevron').setVisible(false).setDepth(8602)
    });
    this.targetBracket = this.add.image(0, 0, 'tm-bracket').setVisible(false).setDepth(8300);
    for (i = 0; i < MAX_SHOTS; i++) this.shotViews.push(this.add.image(0, 0, 'tm-shard').setVisible(false).setDepth(8400));
    for (i = 0; i < MAX_FX; i++) this.fxViews.push(this.add.image(0, 0, 'tm-spark').setVisible(false).setDepth(8500));
    for (i = 0; i < MAX_NUMBERS; i++) this.numberViews.push(this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '15px', color: '#f1ece0', fontStyle: 'bold'
    }).setOrigin(0.5, 0.5).setVisible(false).setDepth(9200));
    this.tintLayer = this.add.rectangle(W / 2, H / 2, W, H, 0x16483c, 0.14).setScrollFactor(0).setDepth(9400);
    this.vignette = this.add.image(0, 0, 'tm-vignette').setOrigin(0, 0).setScrollFactor(0).setDepth(9410);
    this.vignette.setDisplaySize(W, H);
    this.flashLayer = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0).setScrollFactor(0).setDepth(9420).setVisible(false);
    kit.loader.progress(0.94);
  };

  Scene.prototype.t = function (x, y, value, size, color, ox, oy) {
    return this.add.text(x, y, value || '', {
      fontFamily: 'monospace', fontSize: (size || 14) + 'px', color: colorCss(color == null ? PAL.paper : color),
      fontStyle: 'bold', lineSpacing: 3
    }).setOrigin(ox == null ? 0 : ox, oy == null ? 0 : oy).setScrollFactor(0);
  };
  Scene.prototype.rect = function (x, y, w, h, color, alpha) {
    return this.add.rectangle(x, y, w, h, color, alpha == null ? 1 : alpha).setScrollFactor(0);
  };
  function setTextIfChanged(t, v) { var s = String(v); if (t && t.text !== s) t.setText(s); }
  function setColorIfChanged(t, css) { if (t && t.style && t.style.color !== css) t.setColor(css); }
  function setVisibleIfChanged(o, v) { if (o && o.visible !== v) o.setVisible(v); }

  var SKILL_POS = [
    { x: 236, y: 700 }, { x: 298, y: 700 }, { x: 360, y: 700 },
    { x: 236, y: 768 }, { x: 298, y: 768 }, { x: 360, y: 768 }
  ];
  var STICK = { x: 78, y: 742, r: 56 };
  var DODGE = { x: 176, y: 764, r: 32 };
  var TABS = [
    { key: 'gear', name: 'GEAR' }, { key: 'forge', name: 'FORGE' }, { key: 'talents', name: 'TALENT' },
    { key: 'quests', name: 'QUEST' }, { key: 'travel', name: 'TRAVEL' }
  ];
  var PANEL_ROWS = 12;
  var HUD_KEYS = ['level', 'xpBg', 'xpBar', 'classChip', 'hpBg', 'hpBar', 'hpText', 'region', 'quest', 'gold',
    'stickBase', 'stickThumb', 'dodgeBg', 'dodgeIcon', 'dodgeCool'];

  Scene.prototype.buildUi = function () {
    var self = this, i, u = {};
    this.ui = u;
    u.hudTop = this.add.image(0, 0, 'tm-hud-top').setOrigin(0, 0).setScrollFactor(0).setDepth(9500);
      u.hudBottom = this.add.image(0, H, 'tm-hud-bottom').setOrigin(0, 1).setScrollFactor(0).setDepth(9500);
    u.level = this.t(14, 12, 'LV 01', 17, PAL.paper).setDepth(9510);
    u.xpBg = this.rect(14, 40, 118, 5, 0x16332c, 1).setOrigin(0, 0.5).setDepth(9510);
    u.xpBar = this.rect(14, 40, 0, 5, PAL.moss, 1).setOrigin(0, 0.5).setDepth(9511);
    u.classChip = this.t(76, 14, 'WARDEN', 12, PAL.moss).setDepth(9510);
    u.hpBg = this.rect(14, 60, 176, 12, 0x2a1418, 1).setOrigin(0, 0.5).setDepth(9510);
    u.hpBar = this.rect(15, 60, 174, 10, PAL.danger, 1).setOrigin(0, 0.5).setDepth(9511);
    u.shieldBar = this.rect(15, 60, 0, 10, PAL.cold, 0.75).setOrigin(0, 0.5).setDepth(9512);
    u.hpText = this.t(196, 60, '100/100', 12, PAL.paper, 0, 0.5).setDepth(9510);
    u.region = this.t(14, 74, 'MOSSWOLD VERGE', 12, PAL.moss).setDepth(9510);
    u.quest = this.t(14, 90, '', 12, PAL.mist).setDepth(9510);
    u.gold = this.t(376, 74, '', 12, PAL.gold, 1, 0).setDepth(9510);

    u.buttons = [];
    [['hunt', 244], ['book', 296], ['pause', 348]].forEach(function (b) {
      var bg = self.add.image(b[1], 32, 'tm-button').setScrollFactor(0).setDepth(9510).setDisplaySize(46, 46);
      var ic = self.add.image(b[1], 32, 'tm-glyph-' + b[0]).setScrollFactor(0).setDepth(9511).setDisplaySize(26, 26);
      u.buttons.push({ key: b[0], bg: bg, icon: ic });
    });

    u.bossChipBg = this.rect(376, 108, 156, 22, 0x1a1416, 0.92).setOrigin(1, 0.5).setDepth(9510).setVisible(false);
    u.bossChip = this.t(368, 108, '', 12, PAL.ember, 1, 0.5).setDepth(9511).setVisible(false);

    u.coachBg = this.rect(195, 130, W, 26, 0x0a1a1a, 0.62).setDepth(9520).setVisible(false);
    u.coach = this.t(195, 130, '', 13, PAL.moss, 0.5, 0.5).setDepth(9521).setVisible(false);

    u.toastBg = this.rect(14, 164, 240, 30, 0x0d1c1c, 0.94).setOrigin(0, 0.5).setDepth(9520).setVisible(false);
    u.toastBar = this.rect(14, 164, 3, 30, PAL.moss, 1).setOrigin(0, 0.5).setDepth(9521).setVisible(false);
    u.toast = this.t(26, 164, '', 13, PAL.paper, 0, 0.5).setDepth(9521).setVisible(false);

    // Controls.
    u.stickBase = this.add.image(STICK.x, STICK.y, 'tm-stick-base').setScrollFactor(0).setDepth(9505).setAlpha(0.9);
    u.stickThumb = this.add.image(STICK.x, STICK.y, 'tm-stick-thumb').setScrollFactor(0).setDepth(9506).setDisplaySize(46, 46);
    u.dodgeBg = this.add.image(DODGE.x, DODGE.y, 'tm-button').setScrollFactor(0).setDepth(9505).setDisplaySize(64, 64);
    u.dodgeIcon = this.add.image(DODGE.x, DODGE.y, 'tm-glyph-roll').setScrollFactor(0).setDepth(9506).setDisplaySize(30, 30);
    u.dodgeCool = this.rect(DODGE.x, DODGE.y + 30, 56, 4, PAL.cold, 1).setOrigin(0.5, 1).setDepth(9507);
    u.skills = [];
    for (i = 0; i < 6; i++) {
      var p = SKILL_POS[i];
      u.skills.push({
        bg: this.add.image(p.x, p.y, 'tm-button').setScrollFactor(0).setDepth(9505).setDisplaySize(56, 56),
        icon: this.add.image(p.x, p.y, 'tm-icon-arc').setScrollFactor(0).setDepth(9506).setDisplaySize(28, 28),
        cool: this.rect(p.x, p.y + 26, 46, 5, PAL.paper, 0.9).setOrigin(0.5, 1).setDepth(9507),
        lock: this.t(p.x, p.y, '', 11, PAL.dim, 0.5, 0.5).setDepth(9508)
      });
    }

    // Banner (run boundaries only).
    u.bannerBg = this.rect(195, 300, 234, 92, 0x0c1c1a, 0.95).setDepth(9600).setVisible(false);
    u.bannerEdge = this.rect(195, 300, 234, 3, PAL.moss, 1).setOrigin(0.5, 0.5).setDepth(9601).setVisible(false);
    u.bannerTitle = this.t(195, 288, '', 22, PAL.paper, 0.5, 0.5).setDepth(9602).setVisible(false);
    u.bannerSub = this.t(195, 318, '', 13, PAL.mist, 0.5, 0.5).setDepth(9602).setVisible(false);

    // Death / boundary card.
    u.deadKeys = [];
    u.deadShade = this.rect(195, 422, W, H, 0x05090a, 0.82).setDepth(9700).setVisible(false);
    u.deadCard = this.rect(195, 420, 320, 300, 0x101f1e, 0.98).setDepth(9701).setVisible(false);
    u.deadTitle = this.t(195, 320, 'YOU FELL', 26, PAL.paper, 0.5, 0.5).setDepth(9702).setVisible(false);
    u.deadBody = this.t(195, 384, '', 14, PAL.mist, 0.5, 0.5).setDepth(9702).setVisible(false);
    u.deadBody.setAlign('center').setWordWrapWidth(280);
    u.primaryBg = this.rect(195, 486, 280, 56, PAL.moss, 1).setDepth(9702).setVisible(false);
    u.primary = this.t(195, 486, 'RETURN TO THE BIND STONE', 13, PAL.ink, 0.5, 0.5).setDepth(9703).setVisible(false);
    u.secondaryBg = this.rect(195, 552, 280, 48, 0x1b2f2c, 1).setDepth(9702).setVisible(false);
    u.secondary = this.t(195, 552, 'OPEN THE FIELD BOOK', 13, PAL.paper, 0.5, 0.5).setDepth(9703).setVisible(false);
    u.deadKeys = ['deadShade', 'deadCard', 'deadTitle', 'deadBody', 'primaryBg', 'primary', 'secondaryBg', 'secondary'];

    // Title screen.
    u.titleKeys = [];
    u.titleShade = this.rect(195, 422, W, H, 0x070f10, 0.94).setDepth(9800).setVisible(false);
    u.titleName = this.t(195, 132, 'THORNMARK', 36, PAL.paper, 0.5, 0.5).setDepth(9802).setVisible(false);
    u.titleSub = this.t(195, 168, 'an honest field grind', 13, PAL.moss, 0.5, 0.5).setDepth(9802).setVisible(false);
    u.titleKicker = this.t(195, 214, 'CHOOSE A PATH', 12, PAL.mist, 0.5, 0.5).setDepth(9802).setVisible(false);
    u.classCards = [];
    for (i = 0; i < 3; i++) {
      var cy = 260 + i * 78;
      u.classCards.push({
        bg: this.rect(195, cy, 300, 68, 0x132523, 1).setDepth(9801).setVisible(false),
        name: this.t(60, cy - 16, '', 16, PAL.paper, 0, 0.5).setDepth(9802).setVisible(false),
        role: this.t(336, cy - 16, '', 12, PAL.mist, 1, 0.5).setDepth(9802).setVisible(false),
        blurb: this.t(60, cy + 10, '', 11, PAL.dim, 0, 0.5).setDepth(9802).setVisible(false)
      });
      u.classCards[i].blurb.setWordWrapWidth(276);
    }
    u.startBg = this.rect(195, 552, 300, 60, PAL.moss, 1).setDepth(9802).setVisible(false);
    u.start = this.t(195, 552, 'ENTER THE VERGE', 15, PAL.ink, 0.5, 0.5).setDepth(9803).setVisible(false);
    u.titleHint = this.t(195, 610, '', 12, PAL.mist, 0.5, 0.5).setDepth(9802).setVisible(false);
    u.titleHint.setAlign('center').setWordWrapWidth(300);
    u.titleSettingsBg = this.rect(195, 662, 300, 48, 0x1b2f2c, 1).setDepth(9802).setVisible(false);
    u.titleSettings = this.t(195, 662, 'SETTINGS', 13, PAL.paper, 0.5, 0.5).setDepth(9803).setVisible(false);
    u.titleWipe = this.t(195, 716, 'HOLD THE BOOK ICON IN PLAY TO PAUSE', 11, PAL.dim, 0.5, 0.5).setDepth(9802).setVisible(false);
    u.titleKeys = ['titleShade', 'titleName', 'titleSub', 'titleKicker', 'startBg', 'start', 'titleHint', 'titleSettingsBg', 'titleSettings', 'titleWipe'];

    // Codex panel.
    u.panelShade = this.rect(195, 422, W, H, 0x060c0d, 0.9).setDepth(9750).setVisible(false);
    u.panelCard = this.rect(195, 420, 350, 700, 0x0f1e1d, 0.99).setDepth(9751).setVisible(false);
    u.panelTitle = this.t(34, 92, 'FIELD BOOK', 18, PAL.paper, 0, 0.5).setDepth(9752).setVisible(false);
    u.panelClose = this.rect(352, 92, 42, 42, 0x1c302c, 1).setDepth(9752).setVisible(false);
    u.panelCloseText = this.t(352, 90, 'X', 17, PAL.paper, 0.5, 0.5).setDepth(9753).setVisible(false);
    u.tabs = [];
    for (i = 0; i < TABS.length; i++) {
      var tx = 53 + i * 70;
      u.tabs.push({
        bg: this.rect(tx, 134, 66, 32, 0x16292a, 1).setDepth(9752).setVisible(false),
        text: this.t(tx, 134, TABS[i].name, 11, PAL.mist, 0.5, 0.5).setDepth(9753).setVisible(false)
      });
    }
    u.panelBody = this.t(34, 160, '', 11, PAL.mist, 0, 0).setDepth(9752).setVisible(false);
    u.panelBody.setWordWrapWidth(322).setLineSpacing(3);
    u.rows = [];
    for (i = 0; i < PANEL_ROWS; i++) {
      var ry = 224 + i * 36;
      u.rows.push({
        bg: this.rect(195, ry, 302, 34, 0x16292a, 1).setDepth(9752).setVisible(false),
        main: this.t(64, ry, '', 12, PAL.paper, 0, 0.5).setDepth(9753).setVisible(false),
        side: this.t(334, ry, '', 12, PAL.mist, 1, 0.5).setDepth(9753).setVisible(false),
        icon: this.add.image(46, ry, 'tm-glyph-gem').setScrollFactor(0).setDepth(9753).setDisplaySize(18, 18).setVisible(false)
      });
    }
    u.actionBg = this.rect(195, 686, 302, 52, PAL.moss, 1).setDepth(9752).setVisible(false);
    u.action = this.t(195, 686, '', 13, PAL.ink, 0.5, 0.5).setDepth(9753).setVisible(false);
    u.action2Bg = this.rect(195, 744, 302, 46, 0x1b2f2c, 1).setDepth(9752).setVisible(false);
    u.action2 = this.t(195, 744, '', 12, PAL.paper, 0.5, 0.5).setDepth(9753).setVisible(false);
    u.panelHint = this.t(195, 790, '', 11, PAL.dim, 0.5, 0.5).setDepth(9752).setVisible(false);
    u.panelHint.setAlign('center').setWordWrapWidth(320);
    kit.loader.progress(0.98);
  };

  // ----------------------------------------------------------------- zones
  Scene.prototype.toBase = function (cx, cy) {
    var canvas = this.game.canvas, rect = canvas.getBoundingClientRect();
    return {
      x: (cx - rect.left) * W / Math.max(1, rect.width),
      y: (cy - rect.top) * H / Math.max(1, rect.height)
    };
  };
  Scene.prototype.zoneAt = function (x, y) {
    var i;
    if (this.mode === 'title') {
      for (i = 0; i < 3; i++) if (Math.abs(y - (260 + i * 78)) < 34 && x > 45 && x < 345) return 'class-' + i;
      if (Math.abs(y - 552) < 30 && x > 45 && x < 345) return 'start';
      if (Math.abs(y - 662) < 24 && x > 45 && x < 345) return 'settings';
      return 'title';
    }
    if (this.panel) {
      if (Math.abs(x - 352) < 24 && Math.abs(y - 92) < 24) return 'panel-close';
      for (i = 0; i < TABS.length; i++) if (Math.abs(x - (53 + i * 70)) < 34 && Math.abs(y - 134) < 18) return 'tab-' + i;
      for (i = 0; i < PANEL_ROWS; i++) if (Math.abs(y - (224 + i * 36)) < 17 && x > 44 && x < 346) return 'row-' + i;
      if (Math.abs(y - 686) < 27 && x > 44 && x < 346) return 'action';
      if (Math.abs(y - 744) < 24 && x > 44 && x < 346) return 'action2';
      return 'panel';
    }
    if (this.mode === 'dead') {
      if (Math.abs(y - 486) < 29 && x > 55 && x < 335) return 'primary';
      if (Math.abs(y - 552) < 25 && x > 55 && x < 335) return 'secondary';
      return 'dead';
    }
    if (y < 60 && x > 220) {
      if (x > 324) return 'pause';
      if (x > 272) return 'book';
      return 'hunt';
    }
    if (Math.hypot(x - DODGE.x, y - DODGE.y) < DODGE.r + 4) return 'dodge';
    for (i = 0; i < 6; i++) if (Math.hypot(x - SKILL_POS[i].x, y - SKILL_POS[i].y) < 32) return 'skill-' + i;
    if (y > 620 && x < 146) return 'stick';
    return 'arena';
  };

  Scene.prototype.pollPointers = function () {
    if (kit.paused) return;
    var self = this, stamp = this.pointerStamp + 1, id;
    this.pointerStamp = stamp;
    while (pressQueue.length) {
      var q = pressQueue.shift();
      if (this.pointerStates[q.id]) continue;
      var qb = this.toBase(q.x, q.y);
      var qs = this.pointerStates[q.id] = { zone: this.zoneAt(qb.x, qb.y), startX: qb.x, startY: qb.y, fired: false, seen: stamp };
      this.onPress(qs.zone, qb.x, qb.y, q.id);
    }
    kit.input.pointers.forEach(function (p, pid) {
      var base = self.toBase(p.x, p.y), state = self.pointerStates[pid];
      if (!state) {
        var start = self.toBase(p.startX, p.startY);
        state = self.pointerStates[pid] = { zone: self.zoneAt(start.x, start.y), startX: start.x, startY: start.y, fired: false };
        self.onPress(state.zone, start.x, start.y, pid);
      }
      state.seen = stamp;
      if (state.zone === 'stick' && self.stickId === pid) {
        var dx = base.x - STICK.x, dy = base.y - STICK.y, len = Math.hypot(dx, dy) || 1;
        var mag = Math.min(1, len / STICK.r);
        self.stick.x = (dx / len) * mag; self.stick.y = (dy / len) * mag;
      }
    });
    for (id in this.pointerStates) {
      if (!own(this.pointerStates, id)) continue;
      if (this.pointerStates[id].seen !== stamp) {
        if (this.stickId != null && String(this.stickId) === String(id)) { this.stickId = null; this.stick.x = 0; this.stick.y = 0; }
        delete this.pointerStates[id];
      }
    }
    if (this.stickId != null && !this.pointerStates[this.stickId]) { this.stickId = null; this.stick.x = 0; this.stick.y = 0; }
  };

  Scene.prototype.onPress = function (zone, x, y, pid) {
    var i;
    if (zone === 'stick') { this.stickId = pid; return; }
    if (zone === 'title') return;
    if (zone.indexOf('class-') === 0) { this.pickClass(Number(zone.slice(6)) || 0); return; }
    if (zone === 'start') { this.startFromTitle(); return; }
    if (zone === 'settings') { kit.audio.sfx('ui'); kit.openSettings(); return; }
    if (zone === 'pause') { this.openPanel('quests'); return; }
    if (zone === 'book') { this.openPanel(this.panelTab); return; }
    if (zone === 'hunt') { this.toggleHunt(); return; }
    if (zone === 'dodge') { this.doDodge(0, 0); return; }
    if (zone.indexOf('skill-') === 0) { this.useSkill(Number(zone.slice(6)) || 0); return; }
    if (zone === 'panel-close') { this.closePanel(); return; }
    if (zone.indexOf('tab-') === 0) { this.setTab(TABS[Number(zone.slice(4)) || 0].key); return; }
    if (zone.indexOf('row-') === 0) { this.panelRow(Number(zone.slice(4)) || 0); return; }
    if (zone === 'action') { this.panelAction(0); return; }
    if (zone === 'action2') { this.panelAction(1); return; }
    if (zone === 'primary') { this.respawn(); return; }
    if (zone === 'secondary') { this.openPanel('gear'); return; }
    if (zone === 'arena') { this.tapWorld(x, y); return; }
  };

  Scene.prototype.pollKeyboard = function () {
    var self = this;
    function pressed(code) {
      var down = kit.input.keyDown(code), was = !!self.keyPrev[code];
      self.keyPrev[code] = down;
      return down && !was;
    }
    if (this.mode === 'title') {
      if (pressed('Enter') || pressed('Space')) this.startFromTitle();
      if (pressed('Digit1')) this.pickClass(0);
      if (pressed('Digit2')) this.pickClass(1);
      if (pressed('Digit3')) this.pickClass(2);
      return;
    }
    if (pressed('Escape')) { if (this.panel) this.closePanel(); else this.openPanel(this.panelTab); }
    if (pressed('KeyC') || pressed('Tab')) { if (this.panel) this.closePanel(); else this.openPanel('gear'); }
    if (pressed('KeyH')) this.toggleHunt();
    if (this.mode === 'dead') { if (pressed('Enter') || pressed('Space')) this.respawn(); return; }
    if (this.panel) {
      if (pressed('Enter')) this.panelAction(0);
      return;
    }
    if (pressed('KeyJ')) this.useSkill(0);
    if (pressed('KeyK')) this.useSkill(1);
    if (pressed('KeyU')) this.useSkill(2);
    if (pressed('KeyI')) this.useSkill(3);
    if (pressed('KeyO')) this.useSkill(4);
    if (pressed('KeyL')) this.useSkill(5);
    if (pressed('Space')) this.doDodge(0, 0);
    if (pressed('KeyT')) { this.hero.manualTarget = false; }
    var left = kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA');
    var right = kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD');
    var up = kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW');
    var down = kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS');
    if (left) this.moveX -= 1; if (right) this.moveX += 1;
    if (up) this.moveY -= 1; if (down) this.moveY += 1;
  };

  Scene.prototype.pollGamepad = function () {
    if (kit.paused || !navigator.getGamepads) return;
    var pads = navigator.getGamepads(), pad = null, i;
    for (i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
    if (!pad) { this.gamepadPrev = {}; return; }
    var ax = num(pad.axes[0], 0), ay = num(pad.axes[1], 0), mag = Math.hypot(ax, ay);
    if (mag < 0.2) { ax = 0; ay = 0; } else { var s = clamp((mag - 0.2) / 0.8, 0, 1) / mag; ax *= s; ay *= s; }
    this.moveX += clamp(ax, -1, 1); this.moveY += clamp(ay, -1, 1);
    var b = {
      a: !!(pad.buttons[0] && pad.buttons[0].pressed), b: !!(pad.buttons[1] && pad.buttons[1].pressed),
      x: !!(pad.buttons[2] && pad.buttons[2].pressed), y: !!(pad.buttons[3] && pad.buttons[3].pressed),
      l: !!(pad.buttons[4] && pad.buttons[4].pressed), r: !!(pad.buttons[5] && pad.buttons[5].pressed),
      start: !!(pad.buttons[9] && pad.buttons[9].pressed)
    };
    if (b.a && !this.gamepadPrev.a) { if (this.mode === 'dead') this.respawn(); else if (this.mode === 'title') this.startFromTitle(); else this.doDodge(0, 0); }
    if (b.x && !this.gamepadPrev.x) this.useSkill(0);
    if (b.y && !this.gamepadPrev.y) this.useSkill(1);
    if (b.l && !this.gamepadPrev.l) this.useSkill(2);
    if (b.r && !this.gamepadPrev.r) this.useSkill(3);
    if (b.b && !this.gamepadPrev.b) this.useSkill(4);
    if (b.start && !this.gamepadPrev.start) { if (this.panel) this.closePanel(); else this.openPanel(this.panelTab); }
    this.gamepadPrev = b;
  };

  // ------------------------------------------------------------- feedback
  Scene.prototype.say = function (text, color) {
    var c = color == null ? PAL.moss : color;
    if (this.toast.time > 0) {
      if (this.toastQueue.length > 2) this.toastQueue.shift();
      this.toastQueue.push({ text: text, color: c });
      return;
    }
    this.toast.text = text; this.toast.color = c; this.toast.time = 1.0;
  };
  Scene.prototype.showCoach = function (text) {
    if (this.coach.text === text && this.coach.time > 0) return;
    this.coach.text = text; this.coach.time = 3.4;
  };
  Scene.prototype.showBanner = function (title, sub, color) {
    this.banner.text = title; this.banner.sub = sub || '';
    this.banner.time = 1.8; this.banner.scale = 0.6;
    this.banner.color = color == null ? PAL.moss : color;
  };
  Scene.prototype.spawnFx = function (kind, x, y, o) {
    var i, f = null;
    for (i = 0; i < MAX_FX; i++) if (!this.fx[i].alive) { f = this.fx[i]; break; }
    if (!f) { f = this.fx[(this.fxCursor = (this.fxCursor || 0) + 1) % MAX_FX]; }
    o = o || {};
    f.alive = true; f.kind = kind; f.x = x; f.y = y;
    f.vx = num(o.vx, 0); f.vy = num(o.vy, 0);
    f.maxLife = num(o.life, 0.5); f.life = f.maxLife;
    f.size = num(o.size, 1); f.rot = num(o.rot, 0); f.spin = num(o.spin, 0);
    f.color = o.color == null ? 0xffffff : o.color;
    f.grow = num(o.grow, 0); f.fade = num(o.fade, 1);
    return f;
  };
  Scene.prototype.burst = function (x, y, color, count, speed, kind) {
    var n = Math.min(count, 14), i;
    for (i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.8);
      this.spawnFx(kind || 'spark', x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.32 + Math.random() * 0.3,
        size: 0.7 + Math.random() * 0.8, color: color, spin: (Math.random() - 0.5) * 8
      });
    }
  };
  Scene.prototype.ringFx = function (x, y, color, size, life) {
    this.spawnFx('ring', x, y, { life: life || 0.4, size: (size || 60) / 72, color: color, grow: 1.7 });
  };
  Scene.prototype.number = function (x, y, text, color, big) {
    var i, n = null;
    for (i = 0; i < MAX_NUMBERS; i++) if (!this.numbers[i].alive) { n = this.numbers[i]; break; }
    if (!n) { n = this.numbers[(this.numCursor = (this.numCursor || 0) + 1) % MAX_NUMBERS]; }
    n.alive = true; n.x = x + (Math.random() - 0.5) * 10; n.y = y;
    n.vy = -36; n.maxLife = big ? 0.9 : 0.7; n.life = n.maxLife;
    n.text = text; n.color = color; n.big = !!big;
  };

  // ------------------------------------------------------------ tutorial
  Scene.prototype.tutorialStep = function () {
    return profile.tutorial < TUTORIAL.length ? TUTORIAL[profile.tutorial] : null;
  };
  Scene.prototype.advanceTutorial = function (key) {
    var step = this.tutorialStep();
    if (!step || step.key !== key) return;
    profile.tutorial++;
    saveProfile();
    var next = this.tutorialStep();
    if (next) this.showCoach(next.text);
    else this.showCoach('The field is yours. Check the book for quests and travel.');
  };

  // ------------------------------------------------------------ progress
  Scene.prototype.gainXp = function (amount) {
    var gain = xpGain(amount);
    profile.xp += gain;
    var levelled = 0;
    while (profile.level < LEVEL_CAP && profile.xp >= xpFor(profile.level)) {
      profile.xp -= xpFor(profile.level);
      profile.level++; profile.points++;
      levelled++;
    }
    if (profile.level >= LEVEL_CAP) profile.xp = Math.min(profile.xp, xpFor(LEVEL_CAP) - 1);
    if (levelled) {
      profile.best.level = Math.max(profile.best.level, profile.level);
      this.hero.maxHp = maxHp();
      this.hero.hp = this.hero.maxHp;
      kit.audio.sfx('levelup');
      this.say('LEVEL ' + profile.level + '  +1 TALENT', PAL.gold);
      this.ringFx(this.hero.x, this.hero.y - 18, PAL.gold, 120, 0.6);
      this.burst(this.hero.x, this.hero.y - 18, PAL.gold, 14, 120, 'shard');
      kit.juice.shake(3, 140);
      this.checkUnlocks();
    }
    this.checkQuest();
  };
  Scene.prototype.checkUnlocks = function () {
    var i, changed = false;
    for (i = 0; i < REGIONS.length; i++) {
      if (!profile.unlocked[i] && profile.level >= REGIONS[i].minLevel) { profile.unlocked[i] = true; changed = true; }
    }
    if (changed) { this.say('NEW HUNTING GROUND OPEN', PAL.cold); saveProfile(); }
  };
  Scene.prototype.checkQuest = function () {
    var q = activeQuest();
    if (!q) return;
    var p = questProgress(q);
    if (p.have < p.need) return;
    profile.gold += q.gold;
    profile.questCount++;
    profile.quest++;
    var next = activeQuest();
    profile.questBase = questBaseFor(next);
    if (q.xp) { kit.audio.sfx('quest'); this.gainXpQuiet(q.xp); } else kit.audio.sfx('quest');
    this.say('QUEST DONE  ' + q.name, PAL.gold);
    this.burst(this.hero.x, this.hero.y - 20, PAL.gold, 12, 90, 'shard');
    saveProfile();
    if (!next) {
      profile.mastery = true;
      this.showBanner('THORNMARK HELD', 'every task in the chain is done', PAL.violet);
      saveProfile();
    }
  };
  Scene.prototype.gainXpQuiet = function (amount) {
    var before = profile.level;
    profile.xp += xpGain(amount);
    while (profile.level < LEVEL_CAP && profile.xp >= xpFor(profile.level)) {
      profile.xp -= xpFor(profile.level); profile.level++; profile.points++;
    }
    if (profile.level > before) {
      this.hero.maxHp = maxHp(); this.hero.hp = this.hero.maxHp;
      kit.audio.sfx('levelup'); this.say('LEVEL ' + profile.level + '  +1 TALENT', PAL.gold);
      this.checkUnlocks();
    }
  };

  // --------------------------------------------------------------- stages
  Scene.prototype.applyBoot = function () {
    var forced = String(DEBUG.forceMode || '');
    if (forced === 'play' || forced === 'field' || forced === 'dungeon') {
      DEBUG.forceMode = '';
      this.startFromTitle(forced === 'dungeon' ? 'dungeon' : 'field');
      return;
    }
    this.mode = 'title';
    this.paintTitle();
  };
  Scene.prototype.pickClass = function (index) {
    if (this.mode !== 'title') return;
    if (profile.totalKills > 0 || profile.level > 1) { this.say('PATH ALREADY WALKED', PAL.mist); return; }
    profile.cls = CLASS_KEYS[clamp(index, 0, 2)];
    saveProfile(); kit.audio.sfx('ui');
    this.paintTitle();
  };
  Scene.prototype.startFromTitle = function (which) {
    kit.audio.sfx('ui');
    this.mode = 'play';
    var stage = DEBUG.forceStage;
    var region = profile.region;
    if (stage !== '' && stage != null) {
      DEBUG.forceStage = '';
      if (own(REGION_BY_KEY, String(stage))) region = REGION_BY_KEY[String(stage)].index;
      else if (isFinite(Number(stage))) region = clamp(Math.floor(Number(stage)), 0, REGIONS.length - 1);
      profile.unlocked[region] = true;
    }
    if (!profile.unlocked[region]) region = 0;
    profile.questBase = num(profile.questBase, questBaseFor(activeQuest()));
    if (which === 'dungeon' && profile.level >= DUNGEON_MIN_LEVEL) this.enterFloor(Math.min(FLOORS.length, profile.floorsCleared + 1));
    else this.enterRegion(region, true);
    var step = this.tutorialStep();
    if (step) this.showCoach(step.text);
    else this.showCoach(regionAt(profile.region).note);
  };

  Scene.prototype.resetPools = function () {
    var i;
    for (i = 0; i < MAX_ENEMIES; i++) this.enemies[i].alive = false;
    for (i = 0; i < MAX_SHOTS; i++) this.shots[i].alive = false;
    for (i = 0; i < MAX_HAZARDS; i++) this.hazards[i].alive = false;
    for (i = 0; i < MAX_FX; i++) this.fx[i].alive = false;
    for (i = 0; i < MAX_NUMBERS; i++) this.numbers[i].alive = false;
    this.ashfall.active = 0;
  };

  Scene.prototype.layoutStage = function (seed, w, h, kinds, patchKey, groundKey) {
    var rnd = mulberry(seed), i, kind;
    var count = clamp(Math.round(w * h / 17000), 26, MAX_PROPS);
    this.props.length = 0;
    for (i = 0; i < count; i++) {
      kind = kinds[Math.floor(rnd() * kinds.length)] || 'rock-a';
      var px = 40 + rnd() * (w - 80), py = 60 + rnd() * (h - 90);
      if (Math.hypot(px - w / 2, py - h * 0.86) < 110) py -= 150;
      this.props.push({ kind: kind, x: px, y: clamp(py, 50, h - 30), solid: kind === 'pillar' || kind === 'rock-b' || kind === 'tree-a' });
    }
    for (i = 0; i < MAX_PROPS; i++) {
      var p = this.props[i], v = this.propViews[i];
      if (!p) { v.setVisible(false); continue; }
      v.setTexture('tm-props', p.kind).setPosition(p.x, p.y).setDepth(p.y).setVisible(true);
      v.setTint(0xffffff);
    }
    this.ground.setTexture(groundKey);
    var patchCount = clamp(Math.round(w * h / 140000), 4, MAX_PATCHES);
    for (i = 0; i < MAX_PATCHES; i++) {
      if (i >= patchCount) { this.patchViews[i].setVisible(false); continue; }
      var a = rnd() * TAU, r = 120 + rnd() * (Math.min(w, h) * 0.36);
      var vx = clamp(w / 2 + Math.cos(a) * r, 70, w - 70), vy = clamp(h / 2 + Math.sin(a) * r, 90, h - 70);
      this.patchViews[i].setTexture(patchKey).setPosition(vx, vy).setVisible(true)
        .setScale(1.0 + rnd() * 1.1).setAlpha(0.95).setDepth(-150);
    }
  };

  Scene.prototype.enterRegion = function (index, silent) {
    var r = regionAt(index);
    profile.region = r.index;
    if (!profile.unlocked[r.index]) profile.unlocked[r.index] = true;
    this.resetPools();
    this.run = {
      kind: 'field', region: r.index, floor: 0, def: r, w: r.w, h: r.h,
      spawnClock: 0.8, hazardClock: 4.5, bossClock: r.bossTimer, bossAlive: false,
      bossKey: r.boss, wave: 0, waves: 0, cleared: false, ambient: 0
    };
    this.layoutStage(r.seed, r.w, r.h, r.props, 'tm-patch-' + r.index, 'tm-ground-' + r.index);
    this.bindView.setPosition(r.bind.x, r.bind.y).setDepth(r.bind.y).setVisible(true);
    this.stairView.setVisible(r.key === 'bailey');
    if (r.key === 'bailey') this.stairView.setPosition(r.w * 0.5, 220).setDepth(220);
    var self = this;
    this.portalViews.forEach(function (v, i) {
      var target = r.index + (i === 0 ? -1 : 1);
      if (target < 0 || target >= REGIONS.length) { v.setVisible(false); v.target = -1; return; }
      var px = i === 0 ? 90 : r.w - 90, py = r.h * 0.5;
      v.setPosition(px, py).setDepth(py).setVisible(true).setTint(REGIONS[target].accent);
      v.target = target;
    });
    this.hero.x = r.bind.x; this.hero.y = r.bind.y + 26;
    this.hero.maxHp = maxHp(); this.hero.hp = this.hero.maxHp;
    this.hero.shield = 0; this.hero.snare = 0; this.hero.slow = 0; this.hero.targetId = 0;
    this.hero.cds = [0, 0, 0, 0, 0, 0];
    this.camX = clamp(this.hero.x - W / 2, 0, r.w - W);
    this.camY = clamp(this.hero.y - H / 2, 0, r.h - H);
    this.tintLayer.setFillStyle(r.tint, r.dark);
    profile.bind = r.index;
    kit.audio.music(r.index <= 1 ? 'wilds' : 'keepmusic', 900);
    this.spawnPack(r.density);
    if (!silent) this.showBanner(r.name, r.sub, r.accent);
    saveProfile();
    this.checkQuest();
    this.updateDebug();
  };

  Scene.prototype.enterFloor = function (n) {
    var f = floorAt(n);
    this.resetPools();
    this.run = {
      kind: 'dungeon', region: profile.region, floor: f.floor, def: f, w: DUNGEON_W, h: DUNGEON_H,
      spawnClock: 1.1, hazardClock: 5, bossClock: 0, bossAlive: false, bossKey: f.boss,
      wave: 0, waves: f.waves, waveLeft: 0, cleared: false, ambient: 0, gap: 1.4
    };
    this.layoutStage(700 + f.floor * 91, DUNGEON_W, DUNGEON_H, f.props, 'tm-patch-d' + (f.floor - 1), 'tm-ground-d' + (f.floor - 1));
    this.bindView.setVisible(false);
    this.stairView.setPosition(DUNGEON_W / 2, 96).setDepth(96).setVisible(true);
    this.portalViews.forEach(function (v) { v.setVisible(false); v.target = -1; });
    this.hero.x = DUNGEON_W / 2; this.hero.y = DUNGEON_H - 260;
    this.hero.maxHp = maxHp(); this.hero.hp = this.hero.maxHp;
    this.hero.shield = 0; this.hero.snare = 0; this.hero.slow = 0; this.hero.targetId = 0;
    this.hero.cds = [0, 0, 0, 0, 0, 0];
    this.camX = clamp(this.hero.x - W / 2, 0, DUNGEON_W - W);
    this.camY = clamp(this.hero.y - H / 2, 0, DUNGEON_H - H);
    this.tintLayer.setFillStyle(f.tint, f.dark);
    kit.audio.music('undercroft', 900);
    this.showBanner('FLOOR ' + f.floor, f.name, f.accent);
    this.nextWave();
    this.updateDebug();
  };

  Scene.prototype.nextWave = function () {
    var f = this.run.def;
    this.run.wave++;
    if (this.run.wave > this.run.waves) {
      this.spawnBoss(this.run.bossKey);
      return;
    }
    var count = f.perWave, i;
    for (i = 0; i < count; i++) {
      var key = f.families[i % f.families.length];
      var a = Math.random() * TAU, r = 150 + Math.random() * 180;
      this.spawnEnemy(key, clamp(DUNGEON_W / 2 + Math.cos(a) * r, 60, DUNGEON_W - 60), clamp(DUNGEON_H / 2 + Math.sin(a) * r, 90, DUNGEON_H - 80));
    }
    this.say('WAVE ' + this.run.wave + ' / ' + this.run.waves, f.accent);
  };

  Scene.prototype.liveEnemies = function (excludeBoss) {
    var n = 0, i;
    for (i = 0; i < MAX_ENEMIES; i++) if (this.enemies[i].alive && !(excludeBoss && this.enemies[i].boss)) n++;
    return n;
  };
  Scene.prototype.freeEnemy = function () {
    for (var i = 0; i < MAX_ENEMIES; i++) if (!this.enemies[i].alive) return this.enemies[i];
    return null;
  };
  Scene.prototype.scaleFor = function () {
    var band = this.run.kind === 'dungeon' ? this.run.floor * 1.15 : this.run.region;
    return { hp: 1 + band * 0.62 + profile.level * 0.09, dmg: 1 + band * 0.4 + profile.level * 0.05 };
  };
  Scene.prototype.spawnEnemy = function (key, x, y) {
    var e = this.freeEnemy();
    if (!e) return null;
    var d = familyDef(key), s = this.scaleFor();
    e.alive = true; e.id = this.nextId++; e.key = key; e.boss = false;
    e.x = x; e.y = y; e.maxHp = Math.round(d.hp * s.hp); e.hp = e.maxHp;
    e.radius = d.radius; e.speed = d.speed; e.chase = d.chase; e.damage = d.damage * s.dmg;
    e.reach = d.reach; e.kind = d.kind; e.state = 'idle'; e.anim = Math.random() * 2;
    e.flash = 0; e.wind = 0; e.windMax = d.wind; e.cd = 0.6 + Math.random() * 1.4;
    e.aggro = 0; e.stun = 0; e.slow = 0; e.mark = 0; e.hurt = 0; e.vx = 0; e.vy = 0;
    e.xp = d.xp; e.gold = d.gold[0] + Math.floor(Math.random() * (d.gold[1] - d.gold[0] + 1));
    e.phase = 0; e.tele = 0; e.teleR = 40; e.home = 0;
    e.charge = 0; e.chargeX = 0; e.chargeY = 0; e.summonCd = 9;
    return e;
  };
  Scene.prototype.spawnBoss = function (key) {
    var b = bossDef(key), e = this.freeEnemy(), s = this.scaleFor();
    if (!e) {
      for (var i = 0; i < MAX_ENEMIES; i++) if (this.enemies[i].alive && !this.enemies[i].boss) { this.enemies[i].alive = false; e = this.enemies[i]; break; }
    }
    if (!e) return null;
    var w = this.run.w, h = this.run.h;
    e.alive = true; e.id = this.nextId++; e.key = key; e.boss = true;
    e.x = this.run.kind === 'dungeon' ? w / 2 : w * 0.5;
    e.y = this.run.kind === 'dungeon' ? 240 : h * 0.32;
    e.maxHp = Math.round(b.hp * (this.run.kind === 'dungeon' ? 1 : s.hp * 0.72 + 0.5));
    e.hp = e.maxHp; e.radius = b.radius; e.speed = b.speed; e.chase = b.chase;
    e.damage = b.damage * (this.run.kind === 'dungeon' ? 1 : s.dmg * 0.8 + 0.3);
    e.reach = b.reach; e.kind = b.tell; e.state = 'idle'; e.anim = 0; e.flash = 0;
    e.wind = 0; e.windMax = b.wind; e.cd = 2.2; e.aggro = 1; e.stun = 0; e.slow = 0;
    e.mark = 0; e.hurt = 0; e.vx = 0; e.vy = 0; e.xp = b.xp;
    e.gold = b.gold[0] + Math.floor(Math.random() * (b.gold[1] - b.gold[0] + 1));
    e.phase = 0; e.summonCd = 9; e.tele = 0; e.teleR = 70;
    e.charge = 0; e.chargeX = 0; e.chargeY = 0;
    this.run.bossAlive = true;
    kit.audio.sfx('boss');
    this.showBanner(b.name, 'field boss', PAL.danger);
    kit.juice.shake(5, 260);
    return e;
  };
  Scene.prototype.spawnPack = function (count) {
    var r = this.run.def, i, live = this.liveEnemies(true);
    var amount = Math.min(count, r.density ? r.density - live : count, MAX_ENEMIES - this.liveEnemies(false) - 1);
    for (i = 0; i < amount; i++) {
      var key = r.families[Math.floor(Math.random() * r.families.length)];
      var a = Math.random() * TAU, dist = 260 + Math.random() * 300;
      var x = clamp(this.hero.x + Math.cos(a) * dist, 50, this.run.w - 50);
      var y = clamp(this.hero.y + Math.sin(a) * dist, 70, this.run.h - 60);
      this.spawnEnemy(key, x, y);
    }
  };
  Scene.prototype.enemyById = function (id) {
    if (!id) return null;
    for (var i = 0; i < MAX_ENEMIES; i++) if (this.enemies[i].alive && this.enemies[i].id === id) return this.enemies[i];
    return null;
  };
  Scene.prototype.nearestEnemy = function (maxDist, fromX, fromY) {
    var best = null, bestD = maxDist == null ? Infinity : maxDist, i, e, d;
    var ox = fromX == null ? this.hero.x : fromX, oy = fromY == null ? this.hero.y : fromY;
    for (i = 0; i < MAX_ENEMIES; i++) {
      e = this.enemies[i];
      if (!e.alive) continue;
      d = Math.hypot(e.x - ox, e.y - oy);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  };
  Scene.prototype.currentTarget = function () {
    var t = this.enemyById(this.hero.targetId);
    if (t && Math.hypot(t.x - this.hero.x, t.y - this.hero.y) < 340) return t;
    this.hero.manualTarget = false;
    var near = this.nearestEnemy(300);
    this.hero.targetId = near ? near.id : 0;
    return near;
  };
  Scene.prototype.tapWorld = function (sx, sy) {
    var wx = sx + this.camX, wy = sy + this.camY, i, e, best = null, bd = 46;
    for (i = 0; i < MAX_ENEMIES; i++) {
      e = this.enemies[i];
      if (!e.alive) continue;
      var d = Math.hypot(e.x - wx, e.y - wy - e.radius * 0.6);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      this.hero.targetId = best.id; this.hero.manualTarget = true;
      kit.audio.sfx('ui', { volume: 0.5 });
      this.advanceTutorial('target');
    } else if (this.hero.manualTarget) {
      this.hero.manualTarget = false; this.hero.targetId = 0;
    }
  };
  Scene.prototype.toggleHunt = function () {
    this.autoHunt = !this.autoHunt;
    kit.audio.sfx('ui');
    this.say(this.autoHunt ? 'AUTO HUNT ON' : 'AUTO HUNT OFF', this.autoHunt ? PAL.cold : PAL.mist);
  };

  // --------------------------------------------------------------- combat
  Scene.prototype.hitEnemy = function (e, damage, color, source) {
    if (!e.alive) return;
    var crit = Math.random() * 100 < critChance();
    var dmg = damage * (crit ? 1.75 : 1) * (1 + (e.mark > 0 ? 0.35 : 0));
    if (e.boss) dmg *= 1 + talent('bane') * 0.1;
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg; e.flash = 0.12; e.aggro = Math.max(e.aggro, 1);
    if (!e.boss && source !== 'dot') {
      var kb = source === 'skill' ? 16 : 9;
      var a = Math.atan2(e.y - this.hero.y, e.x - this.hero.x);
      e.vx += Math.cos(a) * kb; e.vy += Math.sin(a) * kb;
    }
    this.number(e.x, e.y - e.radius - 14, String(dmg), crit ? PAL.gold : color, crit);
    if (source !== 'dot') {
      this.burst(e.x, e.y - e.radius * 0.6, color, crit ? 8 : 5, crit ? 130 : 80);
      kit.audio.sfx(crit ? 'crit' : 'hit', { volume: crit ? 0.9 : 0.62, rate: 0.94 + Math.random() * 0.12 });
      kit.juice.hitStop(crit ? 62 : 42);
      kit.juice.shake(crit ? 3.2 : 1.6, crit ? 130 : 90);
    }
    if (e.hp <= 0) this.defeatEnemy(e);
  };
  Scene.prototype.defeatEnemy = function (e) {
    e.alive = false;
    var boss = e.boss, def = boss ? bossDef(e.key) : familyDef(e.key);
    this.burst(e.x, e.y - e.radius * 0.5, def.color, boss ? 14 : 9, boss ? 190 : 110, 'shard');
    this.ringFx(e.x, e.y - e.radius * 0.4, def.color, boss ? 150 : 66, boss ? 0.6 : 0.36);
    kit.juice.shake(boss ? 7 : 2.2, boss ? 300 : 110);
    kit.juice.hitStop(boss ? 90 : 50);
    profile.gold += e.gold;
    profile.totalKills++;
    profile.best.kills = Math.max(profile.best.kills, profile.totalKills);
    if (!boss) profile.kills[e.key] = (own(profile.kills, e.key) ? profile.kills[e.key] : 0) + 1;
    this.gainXp(e.xp);
    if (Math.random() < 0.34 + (boss ? 0.6 : 0)) { profile.shards++; profile.shardsFound++; }
    if (Math.random() < dropChance() * (boss ? 2.4 : 1)) this.rollDrop(e, boss);
    if (boss) {
      kit.audio.sfx('boss');
      this.run.bossAlive = false;
      if (this.run.kind === 'field') {
        profile.bossDown[this.run.region] = true;
        this.run.bossClock = this.run.def.bossTimer;
        this.showBanner(def.name + ' DOWN', 'the field breathes again', PAL.gold);
      } else {
        profile.floorsCleared = Math.max(profile.floorsCleared, this.run.floor);
        this.run.cleared = true;
        this.showBanner('FLOOR ' + this.run.floor + ' CLEAR', def.name + ' is finished', PAL.gold);
        this.advanceTutorial('boss');
      }
      this.advanceTutorial('boss');
      saveProfile();
    } else if (this.run.kind === 'dungeon' && !this.run.bossAlive && this.liveEnemies(true) === 0) {
      this.run.gap = 1.6;
    }
    this.checkQuest();
    this.updateDebug();
  };
  Scene.prototype.rollDrop = function (e, boss) {
    var slot = SLOTS[Math.floor(Math.random() * SLOTS.length)];
    var band = this.run.kind === 'dungeon' ? this.run.floor : this.run.region;
    var roll = Math.random() * 100, tier = 0;
    var bias = band * 6 + (boss ? 26 : 0) + talent('fortune') * 4;
    if (roll > 96 - bias * 0.35) tier = 4;
    else if (roll > 86 - bias * 0.4) tier = 3;
    else if (roll > 66 - bias * 0.4) tier = 2;
    else if (roll > 36 - bias * 0.3) tier = 1;
    var item = this.makeItem(slot, tier);
    profile.drops++;
    var cur = profile.gear[slot], better = itemScore(item) > itemScore(cur);
    kit.audio.sfx('loot');
    this.spawnFx('shard', e.x, e.y - 20, { vy: -46, life: 0.9, size: 1.3, color: rarity(tier).color, spin: 4 });
    if (better) {
      item.plus = Math.max(0, cur.plus - 1);
      profile.gear[slot] = item;
      this.say('EQUIPPED ' + itemName(item), rarity(tier).color);
      this.hero.maxHp = maxHp();
      this.hero.hp = Math.min(this.hero.hp + 12, this.hero.maxHp);
    } else {
      profile.gold += 8 + tier * 9;
      this.say('SALVAGED ' + itemName(item), PAL.mist);
    }
    saveProfile();
  };
  Scene.prototype.makeItem = function (slot, tier) {
    var r = rarity(tier), item = { slot: slot, tier: r.tier, plus: 0, affixes: [] }, used = {};
    var pool = slot === 'weapon' ? ['power', 'edge', 'haste', 'fortune'] : slot === 'armor' ? ['guard', 'vigor', 'power', 'haste'] : ['haste', 'fortune', 'edge', 'vigor', 'power'];
    for (var i = 0; i < r.affixes; i++) {
      var key = pool[Math.floor(Math.random() * pool.length)];
      if (used[key]) key = pool[(pool.indexOf(key) + 1) % pool.length];
      used[key] = 1;
      item.affixes.push({ key: key, rank: clamp(1 + Math.floor(Math.random() * (1 + r.tier)), 1, 6) });
    }
    if (!item.affixes.length) item.affixes.push({ key: 'power', rank: 1 });
    return item;
  };

  Scene.prototype.doDodge = function (dx, dy) {
    var h = this.hero;
    if (this.mode !== 'play' || this.panel) return;
    if (h.dodgeCd > 0 || h.dodgeTime > 0) return;
    var mx = dx, my = dy;
    if (!mx && !my) { mx = this.moveX + this.stick.x; my = this.moveY + this.stick.y; }
    if (!mx && !my) { mx = h.facing; my = 0; }
    var len = Math.hypot(mx, my) || 1;
    h.dashX = mx / len; h.dashY = my / len;
    h.dodgeTime = 0.34;
    h.invuln = 0.24 + talent('ward') * 0.06;
    h.dodgeCd = 1.1 * (1 - talent('roll') * 0.12);
    h.snare = 0;
    profile.dodges++;
    kit.audio.sfx('dodge');
    this.spawnFx('dust', h.x, h.y, { life: 0.4, size: 1.4, color: 0xdfe9e0, grow: 1.4 });
    this.advanceTutorial('dodge');
  };

  Scene.prototype.basicAttack = function (target) {
    var h = this.hero;
    h.attackCd = 0.72;
    h.state = 'attack'; h.castTime = 0.22;
    h.facing = target.x >= h.x ? 1 : -1;
    this.hitEnemy(target, playerPower(), PAL.paper, 'basic');
    var mx = (h.x + target.x) / 2, my = (h.y + target.y) / 2 - 14;
    this.spawnFx('spark', mx, my, { life: 0.18, size: 1.5, color: PAL.paper, grow: 1.2 });
    kit.audio.sfx('swing', { volume: 0.42, rate: 0.94 + Math.random() * 0.14 });
    this.advanceTutorial('attack');
  };

  Scene.prototype.useSkill = function (index) {
    if (this.mode !== 'play' || this.panel) return;
    var list = skillList(), s = list[clamp(index, 0, 5)];
    if (!s) return;
    var h = this.hero;
    if (profile.level < s.unlock) { this.say('UNLOCKS AT LEVEL ' + s.unlock, PAL.mist); return; }
    if (h.cds[index] > 0) return;
    var target = this.currentTarget();
    if (s.mode === 'target') {
      if (!target || Math.hypot(target.x - h.x, target.y - h.y) > s.need) { this.say('MOVE INTO RANGE', PAL.mist); return; }
    }
    h.cds[index] = s.cd * cooldownScale();
    h.state = 'cast'; h.castTime = 0.26;
    var radius = s.radius * (1 + talent('cleave') * 0.08);
    var pw = playerPower(), i, e;
    if (s.key === 'thornarc') {
      for (i = 0; i < MAX_ENEMIES; i++) {
        e = this.enemies[i];
        if (e.alive && Math.hypot(e.x - h.x, e.y - h.y) < radius) this.hitEnemy(e, (20 + profile.gear.weapon.plus * 4) * 0.5 + pw * 1.1, s.color, 'skill');
      }
      this.ringFx(h.x, h.y - 12, s.color, radius * 2, 0.42);
      this.burst(h.x, h.y - 12, s.color, 12, 150, 'leaf');
      kit.audio.sfx('arc');
      kit.juice.shake(3, 150);
      this.advanceTutorial('skill');
    } else if (s.key === 'emberburst') {
      for (i = 0; i < MAX_ENEMIES; i++) {
        e = this.enemies[i];
        if (e.alive && Math.hypot(e.x - target.x, e.y - target.y) < radius) this.hitEnemy(e, (40 + profile.gear.ring.plus * 5) * 0.5 + pw * 1.6, s.color, 'skill');
      }
      this.ringFx(target.x, target.y - 10, s.color, radius * 2, 0.5);
      this.burst(target.x, target.y - 10, s.color, 14, 190);
      kit.audio.sfx('burst');
      kit.juice.shake(4.5, 200);
    } else if (s.key === 'brambleguard') {
      h.shield = Math.round(h.maxHp * 0.4); h.shieldTime = 6;
      this.ringFx(h.x, h.y - 14, s.color, 90, 0.5);
      kit.audio.sfx('cast');
    } else if (s.key === 'rootstrike') {
      for (i = 0; i < MAX_ENEMIES; i++) {
        e = this.enemies[i];
        if (!e.alive || e.boss) continue;
        var d = Math.hypot(e.x - h.x, e.y - h.y);
        if (d > radius) continue;
        var a = Math.atan2(h.y - e.y, h.x - e.x);
        e.x += Math.cos(a) * Math.min(80, d - 40); e.y += Math.sin(a) * Math.min(80, d - 40);
        e.stun = 1.2; e.wind = 0;
        this.hitEnemy(e, pw * 0.9, s.color, 'skill');
      }
      this.ringFx(h.x, h.y - 12, s.color, radius * 1.6, 0.5);
      kit.audio.sfx('cast');
    } else if (s.key === 'ironbark') {
      h.guardTime = 5;
      for (i = 0; i < MAX_ENEMIES; i++) {
        e = this.enemies[i];
        if (e.alive && Math.hypot(e.x - h.x, e.y - h.y) < radius) { e.aggro = 1; this.hitEnemy(e, pw * 0.6, s.color, 'skill'); }
      }
      this.ringFx(h.x, h.y - 12, s.color, radius * 2, 0.6);
      kit.audio.sfx('cast');
      kit.juice.shake(4, 200);
    } else if (s.key === 'cinderdash') {
      var da = Math.atan2(target.y - h.y, target.x - h.x);
      var dist = Math.max(0, Math.hypot(target.x - h.x, target.y - h.y) - 34);
      var sx = h.x, sy = h.y;
      h.x = clamp(h.x + Math.cos(da) * dist, 24, this.run.w - 24);
      h.y = clamp(h.y + Math.sin(da) * dist, 40, this.run.h - 24);
      h.invuln = Math.max(h.invuln, 0.2);
      for (i = 0; i < MAX_ENEMIES; i++) {
        e = this.enemies[i];
        if (!e.alive) continue;
        var mx2 = (sx + h.x) / 2, my2 = (sy + h.y) / 2;
        if (Math.hypot(e.x - mx2, e.y - my2) < dist / 2 + 44) this.hitEnemy(e, pw * 1.5, s.color, 'skill');
      }
      for (i = 0; i < 8; i++) this.spawnFx('spark', sx + (h.x - sx) * (i / 8), sy + (h.y - sy) * (i / 8), { life: 0.34, size: 1.1, color: s.color, grow: 0.7 });
      kit.audio.sfx('cast');
    } else if (s.key === 'ashfall') {
      this.ashfall.active = 1; this.ashfall.x = target.x; this.ashfall.y = target.y;
      this.ashfall.left = 6; this.ashfall.clock = 0; this.ashfall.radius = radius;
      this.ashfall.damage = pw * 0.85;
      kit.audio.sfx('cast');
    } else if (s.key === 'searingmark') {
      target.mark = 6;
      this.ringFx(target.x, target.y - 10, s.color, 70, 0.5);
      kit.audio.sfx('cast');
    } else if (s.key === 'seedvolley') {
      for (i = 0; i < 3; i++) {
        var tgt = i === 0 ? target : (this.nearestEnemy(s.need, h.x, h.y) || target);
        this.fireShot(h.x, h.y - 12, tgt, pw * 0.85, s.color, false);
      }
      kit.audio.sfx('cast');
    } else if (s.key === 'verdantbloom') {
      h.regen = h.maxHp * 0.45 / 6; h.regenTime = 6;
      this.ringFx(h.x, h.y - 14, s.color, 80, 0.6);
      kit.audio.sfx('cast');
    } else if (s.key === 'hollowsigil') {
      var hz = this.freeHazard();
      if (hz) {
        hz.alive = true; hz.kind = 'sigil'; hz.x = target.x; hz.y = target.y;
        hz.r = radius; hz.warn = 0; hz.life = 5; hz.maxLife = 5; hz.damage = pw * 0.28; hz.tick = 0;
      }
      this.ringFx(target.x, target.y, s.color, radius * 2, 0.5);
      kit.audio.sfx('cast');
    } else {
      h.snare = 0; h.slow = 0;
      h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.35));
      this.ringFx(h.x, h.y - 14, s.color, 110, 0.6);
      this.burst(h.x, h.y - 14, s.color, 12, 110, 'shard');
      kit.audio.sfx('bind');
    }
    this.updateDebug();
  };

  Scene.prototype.freeHazard = function () {
    for (var i = 0; i < MAX_HAZARDS; i++) if (!this.hazards[i].alive) return this.hazards[i];
    return null;
  };
  Scene.prototype.fireShot = function (x, y, target, damage, color, foe) {
    var i, s = null;
    for (i = 0; i < MAX_SHOTS; i++) if (!this.shots[i].alive) { s = this.shots[i]; break; }
    if (!s) return;
    var tx = target ? target.x : x, ty = target ? target.y - 10 : y - 60;
    var a = Math.atan2(ty - y, tx - x), speed = foe ? 190 : 300;
    s.alive = true; s.x = x; s.y = y; s.vx = Math.cos(a) * speed; s.vy = Math.sin(a) * speed;
    s.life = 1.6; s.damage = damage; s.foe = !!foe; s.color = color;
    s.homing = foe ? 0 : 2.4; s.target = target && !foe ? target.id : 0;
  };

  // ------------------------------------------------------------- damage in
  Scene.prototype.hurtHero = function (amount, sourceX, sourceY) {
    var h = this.hero;
    if (h.invuln > 0 || this.mode !== 'play') return;
    var cut = damageCut() * (h.guardTime > 0 ? 1.6 : 1);
    var dmg = Math.max(1, Math.round(amount * (h.guardTime > 0 ? 0.7 : 1) - cut));
    if (h.shield > 0) {
      var absorbed = Math.min(h.shield, dmg);
      h.shield -= absorbed; dmg -= absorbed;
      this.number(h.x, h.y - 40, String(absorbed), PAL.cold);
    }
    if (dmg > 0) {
      h.hp -= dmg;
      h.hurtTime = 0.22;
      h.hitTaken++;
      this.number(h.x, h.y - 44, String(dmg), PAL.danger);
      kit.audio.sfx('hurt', { volume: 0.7 });
      kit.juice.shake(4, 170);
      this.flashLayer.setFillStyle(0xff4d4d, 1);
      this.flashLayer.setAlpha(0.22);
      setVisibleIfChanged(this.flashLayer, true);
      if (sourceX != null) {
        var a = Math.atan2(h.y - sourceY, h.x - sourceX);
        h.x = clamp(h.x + Math.cos(a) * 9, 24, this.run.w - 24);
        h.y = clamp(h.y + Math.sin(a) * 9, 40, this.run.h - 24);
      }
    }
    if (h.hp <= 0) this.die();
  };
  Scene.prototype.die = function () {
    this.hero.hp = 0;
    this.mode = 'dead';
    profile.deaths++;
    var lost = Math.min(profile.gold, 10);
    profile.gold -= lost;
    var pen = Math.round(xpFor(profile.level) * 0.08);
    profile.xp = Math.max(0, profile.xp - pen);
    saveProfile();
    kit.audio.sfx('enhancefail');
    kit.juice.shake(8, 320);
    this.updateDebug();
  };
  Scene.prototype.respawn = function () {
    kit.audio.sfx('bind');
    this.mode = 'play';
    this.hero.hp = maxHp(); this.hero.maxHp = this.hero.hp;
    this.hero.shield = 0; this.hero.snare = 0; this.hero.slow = 0;
    this.hero.invuln = 1.4; this.hero.targetId = 0; this.hero.manualTarget = false;
    if (this.run.kind === 'dungeon') {
      this.hero.x = DUNGEON_W / 2; this.hero.y = DUNGEON_H - 260;
    } else {
      var r = regionAt(profile.bind);
      if (r.index !== this.run.region) { this.enterRegion(r.index); return; }
      this.hero.x = r.bind.x; this.hero.y = r.bind.y + 26;
    }
    this.ringFx(this.hero.x, this.hero.y - 14, PAL.moss, 120, 0.7);
    this.updateDebug();
  };

  // ------------------------------------------------------------------ sim
  Scene.prototype.stepSim = function () {
    var dt = STEP, h = this.hero, i, e, d;
    this.simTime += dt;
    if (this.toast.time > 0) {
      this.toast.time -= dt;
      if (this.toast.time <= 0 && this.toastQueue.length) {
        var q = this.toastQueue.shift();
        this.toast.text = q.text; this.toast.color = q.color; this.toast.time = 1.0;
      }
    }
    if (this.coach.time > 0) this.coach.time -= dt;
    if (this.banner.time > 0) {
      this.banner.time -= dt;
      this.banner.scale += (1 - this.banner.scale) * 0.22;
    }
    if (this.flashLayer.alpha > 0) {
      this.flashLayer.setAlpha(Math.max(0, this.flashLayer.alpha - dt * 1.4));
      if (this.flashLayer.alpha <= 0.001) setVisibleIfChanged(this.flashLayer, false);
    }
    if (this.mode !== 'play') { this.stepFx(dt); return; }

    // ---- hero
    var ix = clamp(this.moveX + this.stick.x, -1, 1), iy = clamp(this.moveY + this.stick.y, -1, 1);
    var manual = Math.hypot(ix, iy) > 0.08;
    var target = this.currentTarget();
    if (this.autoHunt && !manual) {
      // Auto hunt walks to whatever is nearest, at any range, so the field
      // never stalls when the last pack near the player is cleared.
      var hunt = target || this.nearestEnemy();
      if (hunt) {
        var ta = Math.atan2(hunt.y - h.y, hunt.x - h.x);
        var td = Math.hypot(hunt.x - h.x, hunt.y - h.y);
        if (td > 92) { ix = Math.cos(ta); iy = Math.sin(ta); }
      }
    }
    if (h.dodgeTime > 0) {
      h.dodgeTime -= dt;
      h.x = clamp(h.x + h.dashX * 340 * dt, 24, this.run.w - 24);
      h.y = clamp(h.y + h.dashY * 340 * dt, 46, this.run.h - 24);
      if (Math.random() < 0.5) this.spawnFx('dust', h.x, h.y, { life: 0.28, size: 0.8, color: 0xc7d6cc, grow: 0.8 });
    } else if (h.snare <= 0) {
      var len = Math.hypot(ix, iy);
      if (len > 0.08) {
        var sp = moveSpeed() * (h.slow > 0 ? 0.58 : 1);
        var nx = h.x + (ix / len) * sp * dt * Math.min(1, len);
        var ny = h.y + (iy / len) * sp * dt * Math.min(1, len);
        h.x = clamp(nx, 24, this.run.w - 24); h.y = clamp(ny, 46, this.run.h - 24);
        h.facing = ix >= 0 ? 1 : -1;
        h.anim += dt * 7;
        this.stepClock = (this.stepClock || 0) + dt;
        if (this.stepClock > 0.28) {
          this.stepClock = 0;
          this.spawnFx('dust', h.x, h.y, { life: 0.32, size: 0.55, color: 0xa9bdb0, vy: -6, grow: 0.5 });
        }
        this.advanceTutorial('move');
      } else h.anim += dt * 3;
    }
    // solid props push-out
    for (i = 0; i < this.props.length; i++) {
      var pr = this.props[i];
      if (!pr.solid) continue;
      var pdx = h.x - pr.x, pdy = h.y - (pr.y - 8);
      var pd = Math.hypot(pdx, pdy);
      if (pd < 20 && pd > 0.01) { h.x = pr.x + (pdx / pd) * 20; h.y = pr.y - 8 + (pdy / pd) * 20; }
    }
    h.attackCd -= dt; h.dodgeCd -= dt; h.invuln -= dt; h.hurtTime -= dt; h.castTime -= dt;
    h.snare -= dt; h.slow -= dt; h.shieldTime -= dt; h.guardTime -= dt;
    if (h.shieldTime <= 0) h.shield = 0;
    if (h.regenTime > 0) { h.regenTime -= dt; h.hp = Math.min(h.maxHp, h.hp + h.regen * dt); }
    for (i = 0; i < 6; i++) if (h.cds[i] > 0) h.cds[i] -= dt;
    if (h.attackCd <= 0 && target && Math.hypot(target.x - h.x, target.y - h.y) < 128) this.basicAttack(target);
    if (this.autoHunt && target) {
      var list = skillList();
      for (i = 0; i < 6; i++) {
        if (h.cds[i] > 0 || profile.level < list[i].unlock) continue;
        if (list[i].mode === 'target' && Math.hypot(target.x - h.x, target.y - h.y) > list[i].need) continue;
        if (list[i].key === 'bindingcall' && h.hp > h.maxHp * 0.4) continue;
        this.useSkill(i);
        break;
      }
    }
    h.state = h.dodgeTime > 0 ? 'dodge' : h.hurtTime > 0 ? 'hurt' : h.castTime > 0 ? (h.state === 'attack' ? 'attack' : 'cast') : (manual || (this.autoHunt && target)) ? 'walk' : 'idle';

    // ---- enemies
    var aliveCount = 0;
    for (i = 0; i < MAX_ENEMIES; i++) {
      e = this.enemies[i];
      if (!e.alive) continue;
      aliveCount++;
      var def = e.boss ? bossDef(e.key) : familyDef(e.key);
      e.flash -= dt; e.mark -= dt; e.slow -= dt; e.anim += dt * 5;
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.vx *= 0.86; e.vy *= 0.86;
      e.x = clamp(e.x, 22, this.run.w - 22); e.y = clamp(e.y, 44, this.run.h - 22);
      if (e.stun > 0) { e.stun -= dt; e.state = 'hurt'; continue; }
      var dx = h.x - e.x, dy = h.y - e.y;
      d = Math.hypot(dx, dy) || 1;
      if (d < (e.boss ? 620 : 236)) e.aggro = 1;
      else if (d > 700) e.aggro = 0;
      if (!e.aggro) {
        e.state = 'idle';
        e.home += dt;
        if (e.home > 2.4) { e.home = 0; e.vx = (Math.random() - 0.5) * 26; e.vy = (Math.random() - 0.5) * 26; }
        continue;
      }
      if (e.wind > 0) {
        e.wind -= dt; e.state = 'wind';
        if (e.wind <= 0) this.enemyStrike(e, def, d, dx, dy);
        continue;
      }
      if (e.charge > 0) {
        e.charge -= dt; e.state = 'attack';
        e.x = clamp(e.x + e.chargeX * 320 * dt, 22, this.run.w - 22);
        e.y = clamp(e.y + e.chargeY * 320 * dt, 44, this.run.h - 22);
        if (d < e.radius + 20) { this.hurtHero(e.damage, e.x, e.y); e.charge = 0; e.cd = 1.4; }
        continue;
      }
      e.cd -= dt;
      if (e.cd <= 0 && d <= e.reach) {
        e.wind = e.windMax; e.state = 'wind'; e.tele = e.windMax;
        e.teleR = e.kind === 'slam' || e.kind === 'sweep' || e.kind === 'crown' ? e.reach : e.radius + 26;
        if (d < 420) kit.audio.sfx('telegraph', { volume: e.boss ? 0.8 : 0.42 });
        continue;
      }
      var sp2 = e.speed * e.chase * (e.slow > 0 ? 0.5 : 1);
      e.x = clamp(e.x + (dx / d) * sp2 * dt, 22, this.run.w - 22);
      e.y = clamp(e.y + (dy / d) * sp2 * dt, 44, this.run.h - 22);
      e.state = 'walk';
      if (e.boss) {
        e.summonCd -= dt;
        if (e.summonCd <= 0 && this.liveEnemies(true) < (this.run.kind === 'dungeon' ? 6 : 8)) {
          e.summonCd = 11;
          var sk = def.summons || 'thornling';
          this.spawnEnemy(sk, e.x + (Math.random() - 0.5) * 90, e.y + 50 + Math.random() * 40);
          this.ringFx(e.x, e.y, def.color, 90, 0.4);
        }
        if (e.hp < e.maxHp * 0.5 && e.phase === 0) { e.phase = 1; e.chase *= 1.2; e.windMax *= 0.82; this.say(def.name + ' ENRAGED', PAL.danger); }
      }
    }
    // separation
    for (i = 0; i < MAX_ENEMIES; i++) {
      e = this.enemies[i];
      if (!e.alive) continue;
      for (var j = i + 1; j < MAX_ENEMIES; j++) {
        var o = this.enemies[j];
        if (!o.alive) continue;
        var sx = o.x - e.x, sy = o.y - e.y, sd = Math.hypot(sx, sy);
        var minD = e.radius + o.radius;
        if (sd < minD && sd > 0.01) {
          var push = (minD - sd) * 0.5;
          e.x -= (sx / sd) * push; e.y -= (sy / sd) * push;
          o.x += (sx / sd) * push; o.y += (sy / sd) * push;
        }
      }
    }

    this.stepShots(dt);
    this.stepHazards(dt);
    this.stepAshfall(dt);
    this.stepStage(dt, aliveCount);
    this.stepFx(dt);
  };

  Scene.prototype.enemyStrike = function (e, def, d, dx, dy) {
    var h = this.hero;
    e.state = 'attack'; e.cd = e.boss ? 1.5 : 1.7 + Math.random() * 0.8;
    var len = Math.hypot(dx, dy) || 1;
    if (e.kind === 'shot') {
      this.fireShot(e.x, e.y - 12, h, e.damage, def.color, true);
    } else if (e.kind === 'charge' || e.kind === 'dive') {
      e.charge = 0.3; e.chargeX = dx / len; e.chargeY = dy / len;
    } else if (e.kind === 'slam' || e.kind === 'sweep' || e.kind === 'crown') {
      this.ringFx(e.x, e.y, def.color, e.reach * 2, 0.34);
      this.burst(e.x, e.y, def.color, 9, 130);
      if (d <= e.reach + 12) this.hurtHero(e.damage, e.x, e.y);
      if (e.kind === 'crown') for (var k = 0; k < 5; k++) {
        var a = (k / 5) * TAU;
        this.fireShot(e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20, { x: e.x + Math.cos(a) * 300, y: e.y + Math.sin(a) * 300 }, e.damage * 0.6, def.color, true);
      }
      kit.juice.shake(e.boss ? 5 : 2, 160);
    } else if (e.kind === 'burn') {
      for (var v = 0; v < 3; v++) {
        var hz = this.freeHazard();
        if (!hz) break;
        hz.alive = true; hz.kind = 'vent'; hz.x = h.x + (Math.random() - 0.5) * 150;
        hz.y = h.y + (Math.random() - 0.5) * 150; hz.r = 52; hz.warn = 0.8;
        hz.life = 1.1; hz.maxLife = 1.1; hz.damage = e.damage * 0.8; hz.tick = 0;
      }
    } else if (d <= e.reach + 12) {
      this.hurtHero(e.damage, e.x, e.y);
    }
  };

  Scene.prototype.stepShots = function (dt) {
    var i, s, h = this.hero;
    for (i = 0; i < MAX_SHOTS; i++) {
      s = this.shots[i];
      if (!s.alive) continue;
      s.life -= dt;
      if (s.homing > 0 && s.target) {
        var t = this.enemyById(s.target);
        if (t) {
          var a = Math.atan2(t.y - 10 - s.y, t.x - s.x), sp = Math.hypot(s.vx, s.vy);
          s.vx += (Math.cos(a) * sp - s.vx) * s.homing * dt;
          s.vy += (Math.sin(a) * sp - s.vy) * s.homing * dt;
        }
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life <= 0 || s.x < 8 || s.y < 20 || s.x > this.run.w - 8 || s.y > this.run.h - 8) { s.alive = false; continue; }
      if (s.foe) {
        if (Math.hypot(s.x - h.x, s.y - (h.y - 18)) < 20) {
          s.alive = false;
          this.burst(s.x, s.y, s.color, 6, 90);
          this.hurtHero(s.damage, s.x, s.y);
        }
      } else {
        for (var j = 0; j < MAX_ENEMIES; j++) {
          var e = this.enemies[j];
          if (!e.alive) continue;
          if (Math.hypot(s.x - e.x, s.y - (e.y - e.radius * 0.6)) < e.radius + 8) {
            s.alive = false;
            this.hitEnemy(e, s.damage, s.color, 'skill');
            break;
          }
        }
      }
    }
  };

  Scene.prototype.stepHazards = function (dt) {
    var i, z, h = this.hero;
    for (i = 0; i < MAX_HAZARDS; i++) {
      z = this.hazards[i];
      if (!z.alive) continue;
      if (z.warn > 0) { z.warn -= dt; continue; }
      z.life -= dt;
      if (z.life <= 0) { z.alive = false; continue; }
      var inside = Math.hypot(h.x - z.x, h.y - z.y) < z.r;
      if (z.kind === 'pollen') {
        z.x += Math.cos(this.simTime * 0.6 + i) * 8 * dt;
        if (inside) h.slow = 0.5;
      } else if (z.kind === 'snare') {
        if (inside && h.dodgeTime <= 0) { h.snare = 0.24; }
      } else if (z.kind === 'sigil') {
        z.tick -= dt;
        for (var j = 0; j < MAX_ENEMIES; j++) {
          var e = this.enemies[j];
          if (!e.alive) continue;
          if (Math.hypot(e.x - z.x, e.y - z.y) < z.r) {
            e.slow = 0.3;
            if (z.tick <= 0) this.hitEnemy(e, z.damage, PAL.violet, 'dot');
          }
        }
        if (z.tick <= 0) z.tick = 0.5;
      } else {
        z.tick -= dt;
        if (inside && z.tick <= 0) { z.tick = 0.6; this.hurtHero(z.damage, z.x, z.y); }
        if (Math.random() < 0.3) this.spawnFx('spark', z.x + (Math.random() - 0.5) * z.r, z.y + (Math.random() - 0.5) * z.r * 0.6, { life: 0.4, vy: -40, size: 0.9, color: z.kind === 'vent' ? PAL.flame : PAL.stone });
      }
    }
  };

  Scene.prototype.stepAshfall = function (dt) {
    var a = this.ashfall;
    if (!a.active) return;
    a.clock -= dt;
    if (a.clock <= 0) {
      a.clock = 0.5; a.left--;
      var ang = Math.random() * TAU, rr = Math.random() * a.radius;
      var ex = a.x + Math.cos(ang) * rr, ey = a.y + Math.sin(ang) * rr;
      this.burst(ex, ey, PAL.ember, 6, 90);
      this.ringFx(ex, ey, PAL.ember, 40, 0.3);
      for (var i = 0; i < MAX_ENEMIES; i++) {
        var e = this.enemies[i];
        if (e.alive && Math.hypot(e.x - ex, e.y - ey) < 44) this.hitEnemy(e, a.damage, PAL.ember, 'skill');
      }
      if (a.left <= 0) a.active = 0;
    }
  };

  Scene.prototype.stepStage = function (dt, aliveCount) {
    var run = this.run, h = this.hero, i;
    run.ambient -= dt;
    if (run.ambient <= 0) {
      run.ambient = 0.24;
      var mote = run.kind === 'dungeon' ? PAL.cold : run.def.accent;
      this.spawnFx('leaf', this.camX + Math.random() * W, this.camY - 10 + Math.random() * H,
        { vx: -14 - Math.random() * 20, vy: 16 + Math.random() * 24, life: 2.6, size: 0.7, color: mote, spin: 1.4, fade: 0.55 });
    }
    run.hazardClock -= dt;
    if (run.hazardClock <= 0) {
      run.hazardClock = run.kind === 'dungeon' ? 4.2 : 5.4;
      var kind = run.kind === 'dungeon' ? run.def.hazard : run.def.hazard;
      var z = this.freeHazard();
      if (z) {
        var ha = Math.random() * TAU, hd = 90 + Math.random() * 130;
        z.alive = true; z.kind = kind;
        z.x = clamp(h.x + Math.cos(ha) * hd, 40, run.w - 40);
        z.y = clamp(h.y + Math.sin(ha) * hd, 60, run.h - 40);
        z.r = kind === 'pollen' ? 74 : kind === 'snare' ? 54 : 58;
        z.warn = kind === 'pollen' || kind === 'snare' ? 0 : 0.9;
        z.maxLife = kind === 'pollen' ? 6 : kind === 'snare' ? 7 : 1.3;
        z.life = z.maxLife;
        z.damage = (6 + (run.kind === 'dungeon' ? run.floor : run.region) * 4) * (1 + profile.level * 0.05);
        z.tick = 0;
      }
    }
    if (run.kind === 'field') {
      run.spawnClock -= dt;
      if (run.spawnClock <= 0) {
        run.spawnClock = run.def.respawn;
        if (this.liveEnemies(true) < run.def.density) this.spawnPack(2);
      }
      if (!run.bossAlive) {
        run.bossClock -= dt;
        if (run.bossClock <= 0) { this.spawnBoss(run.bossKey); this.advanceTutorial('boss'); }
      }
      for (i = 0; i < this.portalViews.length; i++) {
        var pv = this.portalViews[i];
        if (!pv.visible || pv.target < 0) continue;
        if (Math.hypot(h.x - pv.x, h.y - pv.y) < 36) {
          var target = REGIONS[pv.target];
          if (profile.level < target.minLevel) { this.say('NEEDS LEVEL ' + target.minLevel, PAL.mist); run.spawnClock = Math.max(run.spawnClock, 0.4); }
          else { this.enterRegion(pv.target); return; }
        }
      }
      if (this.stairView.visible && Math.hypot(h.x - this.stairView.x, h.y - this.stairView.y) < 40) {
        if (profile.level < DUNGEON_MIN_LEVEL) this.say('UNDERCROFT NEEDS LEVEL ' + DUNGEON_MIN_LEVEL, PAL.mist);
        else { this.enterFloor(Math.min(FLOORS.length, profile.floorsCleared + 1)); return; }
      }
      if (Math.hypot(h.x - regionAt(run.region).bind.x, h.y - regionAt(run.region).bind.y) < 44 && profile.bind !== run.region) {
        profile.bind = run.region; saveProfile(); this.say('BIND POINT SET', PAL.cold);
      }
    } else {
      if (run.cleared) {
        run.gap -= dt;
        if (run.gap <= 0) {
          if (run.floor < FLOORS.length && profile.floorsCleared >= run.floor) this.enterFloor(run.floor + 1);
          else this.enterRegion(profile.bind);
          return;
        }
      } else if (!run.bossAlive && aliveCount === 0) {
        run.gap -= dt;
        if (run.gap <= 0) { run.gap = 1.4; this.nextWave(); }
      }
      if (this.stairView.visible && Math.hypot(h.x - this.stairView.x, h.y - this.stairView.y) < 34 && run.cleared) {
        this.enterRegion(profile.bind); return;
      }
    }
  };

  Scene.prototype.stepFx = function (dt) {
    var i, f, n;
    for (i = 0; i < MAX_FX; i++) {
      f = this.fx[i];
      if (!f.alive) continue;
      f.life -= dt;
      if (f.life <= 0) { f.alive = false; continue; }
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.vx *= 0.95; f.vy *= 0.95;
      f.rot += f.spin * dt;
      if (f.grow) f.size += f.grow * dt * 2.2;
    }
    for (i = 0; i < MAX_NUMBERS; i++) {
      n = this.numbers[i];
      if (!n.alive) continue;
      n.life -= dt;
      if (n.life <= 0) { n.alive = false; continue; }
      n.y += n.vy * dt; n.vy *= 0.94;
    }
  };

  // ---------------------------------------------------------------- panels
  Scene.prototype.openPanel = function (tab) {
    if (this.mode === 'title') return;
    this.panel = 'open';
    this.panelTab = tab || 'gear';
    this.stick.x = 0; this.stick.y = 0; this.stickId = null;
    kit.audio.sfx('ui');
    this.advanceTutorial('codex');
    this.paintPanel();
  };
  Scene.prototype.closePanel = function () {
    this.panel = '';
    this.pointerStates = {};
    kit.audio.sfx('ui');
    saveProfile();
    this.paintPanel();
  };
  Scene.prototype.setTab = function (key) {
    this.panelTab = key; kit.audio.sfx('ui'); this.paintPanel();
  };
  Scene.prototype.enchant = function () {
    var slot = this.panelSlot, item = profile.gear[slot];
    if (item.plus >= 9) { this.say('ALREADY PLUS NINE', PAL.mist); return; }
    var cost = enhanceCost(item.plus);
    if (profile.gold < cost) { this.say('NOT ENOUGH GOLD', PAL.danger); return; }
    profile.gold -= cost;
    var rate = enhanceRate(item.plus);
    if (Math.random() < rate) {
      item.plus++;
      kit.audio.sfx('enhanceok');
      this.say(GEAR_LABELS[slot] + ' NOW PLUS ' + item.plus, PAL.gold);
      this.hero.maxHp = maxHp();
      this.advanceTutorial('enhance');
    } else {
      if (item.plus >= 4) item.plus--;
      kit.audio.sfx('enhancefail');
      this.say(item.plus >= 3 ? 'THE WEAVE SLIPPED, MINUS ONE' : 'NO CHANGE', PAL.danger);
    }
    saveProfile(); this.checkQuest(); this.paintPanel(); this.updateDebug();
  };
  Scene.prototype.craft = function () {
    if (profile.shards < CRAFT_SHARDS) { this.say('NEEDS ' + CRAFT_SHARDS + ' SHARDS', PAL.mist); return; }
    if (profile.gold < CRAFT_GOLD) { this.say('NOT ENOUGH GOLD', PAL.danger); return; }
    profile.shards -= CRAFT_SHARDS; profile.gold -= CRAFT_GOLD;
    var total = 0, i;
    for (i = 0; i < CRAFT_ODDS.length; i++) total += CRAFT_ODDS[i].weight;
    var roll = Math.random() * total, tier = 0;
    for (i = 0; i < CRAFT_ODDS.length; i++) { roll -= CRAFT_ODDS[i].weight; if (roll <= 0) { tier = CRAFT_ODDS[i].tier; break; } }
    var item = this.makeItem(this.panelSlot, tier);
    profile.crafted++;
    var cur = profile.gear[this.panelSlot];
    if (itemScore(item) > itemScore(cur)) {
      item.plus = Math.max(0, cur.plus - 1);
      profile.gear[this.panelSlot] = item;
      this.say('FORGED ' + itemName(item), rarity(tier).color);
    } else {
      profile.gold += 12 + tier * 10;
      this.say('FORGED AND SOLD ' + itemName(item), PAL.mist);
    }
    kit.audio.sfx('loot');
    this.hero.maxHp = maxHp();
    saveProfile(); this.checkQuest(); this.paintPanel(); this.updateDebug();
  };
  Scene.prototype.spendTalent = function (index) {
    var t = TALENTS[index];
    if (!t) return;
    if (profile.points <= 0) { this.say('NO TALENT POINTS', PAL.mist); return; }
    var rank = talent(t.key);
    if (rank >= TALENT_MAX) { this.say('ALREADY MASTERED', PAL.mist); return; }
    profile.talents[t.key] = rank + 1;
    profile.points--;
    kit.audio.sfx('enhanceok');
    this.say(t.name + ' RANK ' + (rank + 1), PAL.moss);
    this.hero.maxHp = maxHp();
    this.hero.hp = Math.min(this.hero.hp, this.hero.maxHp);
    saveProfile(); this.paintPanel(); this.updateDebug();
  };
  Scene.prototype.resetTalents = function () {
    if (profile.gold < 120) { this.say('RESET COSTS 120 GOLD', PAL.danger); return; }
    var spent = 0, k;
    for (k in profile.talents) if (own(profile.talents, k)) spent += profile.talents[k];
    if (!spent) { this.say('NOTHING TO UNLEARN', PAL.mist); return; }
    profile.gold -= 120;
    profile.talents = {};
    profile.points += spent;
    kit.audio.sfx('ui');
    this.say('TALENTS UNLEARNED', PAL.cold);
    this.hero.maxHp = maxHp();
    saveProfile(); this.paintPanel(); this.updateDebug();
  };
  Scene.prototype.panelRow = function (i) {
    var tab = this.panelTab;
    if (tab === 'gear' || tab === 'forge') {
      if (i < 3) { this.panelSlot = SLOTS[i]; kit.audio.sfx('ui'); this.paintPanel(); }
      return;
    }
    if (tab === 'talents') { this.spendTalent(i); return; }
    if (tab === 'travel') {
      if (i < REGIONS.length) {
        var r = REGIONS[i];
        if (profile.level < r.minLevel) { this.say('NEEDS LEVEL ' + r.minLevel, PAL.mist); return; }
        this.closePanel(); this.enterRegion(i); return;
      }
      if (i === REGIONS.length) {
        if (profile.level < DUNGEON_MIN_LEVEL) { this.say('UNDERCROFT NEEDS LEVEL ' + DUNGEON_MIN_LEVEL, PAL.mist); return; }
        this.closePanel(); this.enterFloor(Math.min(FLOORS.length, profile.floorsCleared + 1)); return;
      }
    }
  };
  Scene.prototype.panelAction = function (which) {
    var tab = this.panelTab;
    if (tab === 'forge') { if (which === 0) this.enchant(); else this.craft(); return; }
    if (tab === 'talents') { if (which === 1) this.resetTalents(); return; }
    if (which === 0) { this.closePanel(); return; }
    kit.openSettings();
  };

  Scene.prototype.paintPanel = function () {
    var u = this.ui, open = !!this.panel, i, r;
    setVisibleIfChanged(u.panelShade, open); setVisibleIfChanged(u.panelCard, open);
    setVisibleIfChanged(u.panelTitle, open); setVisibleIfChanged(u.panelClose, open);
    setVisibleIfChanged(u.panelCloseText, open); setVisibleIfChanged(u.panelBody, open);
    setVisibleIfChanged(u.panelHint, open);
    for (i = 0; i < u.tabs.length; i++) {
      setVisibleIfChanged(u.tabs[i].bg, open); setVisibleIfChanged(u.tabs[i].text, open);
      if (open) {
        var on = TABS[i].key === this.panelTab;
        u.tabs[i].bg.setFillStyle(on ? 0x24473f : 0x16292a, 1);
        setColorIfChanged(u.tabs[i].text, colorCss(on ? PAL.moss : PAL.dim));
      }
    }
    if (!open) {
      for (i = 0; i < PANEL_ROWS; i++) {
        setVisibleIfChanged(u.rows[i].bg, false); setVisibleIfChanged(u.rows[i].main, false);
        setVisibleIfChanged(u.rows[i].side, false); setVisibleIfChanged(u.rows[i].icon, false);
      }
      setVisibleIfChanged(u.actionBg, false); setVisibleIfChanged(u.action, false);
      setVisibleIfChanged(u.action2Bg, false); setVisibleIfChanged(u.action2, false);
      return;
    }
    var rows = [], body = '', action = '', action2 = '', hint = '';
    var tab = this.panelTab, item, q, p;
    if (tab === 'gear') {
      setTextIfChanged(u.panelTitle, 'GEAR AND STATS');
      for (i = 0; i < SLOTS.length; i++) {
        item = profile.gear[SLOTS[i]];
        rows.push({
          main: GEAR_LABELS[SLOTS[i]] + '  ' + itemName(item) + ' +' + item.plus,
          side: String(itemScore(item)), color: rarity(item.tier).color,
          on: SLOTS[i] === this.panelSlot
        });
      }
      item = profile.gear[this.panelSlot];
      for (i = 0; i < item.affixes.length; i++) {
        var af = AFFIXES[item.affixes[i].key];
        rows.push({ main: af.name + '  ' + (af.step * item.affixes[i].rank) + '  ' + af.unit, side: '', color: PAL.mist, flat: true });
      }
      rows.push({ main: 'ATTACK POWER', side: String(Math.round(playerPower())), color: PAL.paper, flat: true });
      rows.push({ main: 'MAX LIFE', side: String(maxHp()), color: PAL.paper, flat: true });
      rows.push({ main: 'DAMAGE CUT', side: Math.round(damageCut()) + ' flat', color: PAL.paper, flat: true });
      rows.push({ main: 'CRITICAL', side: Math.round(critChance()) + ' percent', color: PAL.paper, flat: true });
      rows.push({ main: 'COOLDOWN', side: Math.round((1 - cooldownScale()) * 100) + ' percent cut', color: PAL.paper, flat: true });
      rows.push({ main: 'DROP CHANCE', side: Math.round(dropChance() * 100) + ' percent', color: PAL.paper, flat: true });
      body = classDef().name + ' path. Tap a slot to inspect it.';
      action = 'BACK TO THE FIELD'; action2 = 'SETTINGS';
      hint = 'Gold ' + profile.gold + '   shards ' + profile.shards + '   kills ' + profile.totalKills;
    } else if (tab === 'forge') {
      setTextIfChanged(u.panelTitle, 'THE FORGE');
      for (i = 0; i < SLOTS.length; i++) {
        item = profile.gear[SLOTS[i]];
        rows.push({
          main: GEAR_LABELS[SLOTS[i]] + '  ' + itemName(item) + ' +' + item.plus,
          side: item.plus >= 9 ? 'MAX' : Math.round(enhanceRate(item.plus) * 100) + '%',
          color: rarity(item.tier).color, on: SLOTS[i] === this.panelSlot
        });
      }
      rows.push({ main: 'POSTED ODDS BY LEVEL', side: '', color: PAL.moss, flat: true });
      for (i = 0; i < ENHANCE_RATES.length; i += 3) {
        var line = '';
        for (var k = i; k < Math.min(i + 3, ENHANCE_RATES.length); k++) line += '+' + k + '>' + (k + 1) + '  ' + Math.round(ENHANCE_RATES[k] * 100) + '%   ';
        rows.push({ main: line, side: '', color: PAL.mist, flat: true });
      }
      rows.push({ main: 'CRAFT ODDS', side: '', color: PAL.moss, flat: true });
      var codds = '';
      for (i = 0; i < CRAFT_ODDS.length; i++) {
        codds += RARITIES[CRAFT_ODDS[i].tier].name + ' ' + CRAFT_ODDS[i].weight + '%   ';
        if (i === 2) { rows.push({ main: codds, side: '', color: PAL.mist, flat: true }); codds = ''; }
      }
      rows.push({ main: codds, side: '', color: PAL.mist, flat: true });
      item = profile.gear[this.panelSlot];
      body = 'Gold only. At plus four and up a failure takes one level back.';
      action = item.plus >= 9 ? 'ALREADY PLUS NINE' :
        'ENCHANT ' + GEAR_LABELS[this.panelSlot] + ' TO +' + (item.plus + 1) + '   ' + enhanceCost(item.plus) + ' G   ' + Math.round(enhanceRate(item.plus) * 100) + '%';
      action2 = 'CRAFT A ' + GEAR_LABELS[this.panelSlot] + '   ' + CRAFT_SHARDS + ' SHARDS + ' + CRAFT_GOLD + ' G';
      hint = 'Gold ' + profile.gold + '   shards ' + profile.shards;
    } else if (tab === 'talents') {
      setTextIfChanged(u.panelTitle, 'TALENTS');
      for (i = 0; i < TALENTS.length; i++) {
        var tl = TALENTS[i], rank = talent(tl.key);
        rows.push({
          main: tl.branch + '  ' + tl.name, side: rank + ' / ' + TALENT_MAX,
          color: rank >= TALENT_MAX ? PAL.gold : rank > 0 ? PAL.moss : PAL.mist,
          on: rank > 0
        });
      }
      body = 'Points to spend: ' + profile.points + '. Tap a line to raise it.';
      action = 'BACK TO THE FIELD';
      action2 = 'UNLEARN EVERYTHING   120 G';
      hint = 'Every rank applies at once, in the field and in the undercroft.';
    } else if (tab === 'quests') {
      setTextIfChanged(u.panelTitle, 'THE CHAIN');
      q = activeQuest();
      if (q) {
        p = questProgress(q);
        body = 'TASK ' + q.id + ' OF 30   ' + q.name + '\n' + q.text + '\nProgress ' + p.have + ' / ' + p.need;
      } else body = 'Every task in the chain is done. The keep is yours to farm.';
      var start = q ? profile.quest : QUESTS.length - 1;
      for (i = 0; i < 9; i++) {
        var qi = start + i;
        if (qi >= QUESTS.length) break;
        var qq = QUESTS[qi], pp = questProgress(qq);
        rows.push({
          main: (qq.id < 10 ? '0' : '') + qq.id + '  ' + qq.name,
          side: i === 0 ? pp.have + '/' + pp.need : (qq.gold + ' G'),
          color: i === 0 ? PAL.gold : PAL.mist, flat: true, on: i === 0
        });
      }
      action = 'BACK TO THE FIELD'; action2 = 'SETTINGS';
      hint = 'Tasks done ' + profile.questCount + ' of 30   deaths ' + profile.deaths + '   drops ' + profile.drops;
    } else {
      setTextIfChanged(u.panelTitle, 'TRAVEL');
      for (i = 0; i < REGIONS.length; i++) {
        r = REGIONS[i];
        var rOpen = profile.level >= r.minLevel;
        rows.push({
          main: r.name + '   lv ' + r.minLevel,
          side: !rOpen ? 'LOCKED' : profile.bossDown[i] ? 'BOSS DOWN' : 'BOSS UP',
          color: rOpen ? r.accent : PAL.dim,
          on: i === profile.region && this.run && this.run.kind === 'field'
        });
      }
      var dOpen = profile.level >= DUNGEON_MIN_LEVEL;
      rows.push({
        main: 'THE UNDERCROFT   lv ' + DUNGEON_MIN_LEVEL,
        side: dOpen ? 'FLOOR ' + Math.min(FLOORS.length, profile.floorsCleared + 1) : 'LOCKED',
        color: dOpen ? PAL.cold : PAL.dim, on: this.run && this.run.kind === 'dungeon'
      });
      for (i = 0; i < FLOORS.length; i++) {
        rows.push({ main: '  ' + FLOORS[i].floor + '  ' + FLOORS[i].name, side: profile.floorsCleared >= FLOORS[i].floor ? 'CLEAR' : 'SEALED', color: PAL.mist, flat: true });
      }
      body = 'Regions open by level. The undercroft resumes at your deepest floor.';
      action = 'BACK TO THE FIELD'; action2 = 'SETTINGS';
      hint = regionAt(profile.region).note;
    }
    setTextIfChanged(u.panelBody, body);

    for (i = 0; i < PANEL_ROWS; i++) {
      var row = u.rows[i], data = rows[i];
      if (!data) {
        setVisibleIfChanged(row.bg, false); setVisibleIfChanged(row.main, false);
        setVisibleIfChanged(row.side, false); setVisibleIfChanged(row.icon, false);
        continue;
      }
      setVisibleIfChanged(row.bg, true); setVisibleIfChanged(row.main, true); setVisibleIfChanged(row.side, true);
      setVisibleIfChanged(row.icon, !data.flat);
      row.bg.setFillStyle(data.on ? 0x24473f : data.flat ? 0x122120 : 0x16292a, 1);
      setTextIfChanged(row.main, data.main);
      setTextIfChanged(row.side, data.side);
      setColorIfChanged(row.main, colorCss(data.color || PAL.paper));
      if (!data.flat) row.icon.setTint(data.color || PAL.paper);
      row.main.setX(data.flat ? 46 : 64);
    }
    setVisibleIfChanged(u.actionBg, !!action); setVisibleIfChanged(u.action, !!action);
    setVisibleIfChanged(u.action2Bg, !!action2); setVisibleIfChanged(u.action2, !!action2);
    setTextIfChanged(u.action, action); setTextIfChanged(u.action2, action2);
    setTextIfChanged(u.panelHint, hint);
  };

  Scene.prototype.paintTitle = function () {
    var u = this.ui, show = this.mode === 'title', i;
    if (this.titleShown === show && !show) return;
    this.titleShown = show;
    for (i = 0; i < u.titleKeys.length; i++) setVisibleIfChanged(u[u.titleKeys[i]], show);
    for (i = 0; i < 3; i++) {
      var card = u.classCards[i], def = CLASSES[CLASS_KEYS[i]];
      setVisibleIfChanged(card.bg, show); setVisibleIfChanged(card.name, show);
      setVisibleIfChanged(card.role, show); setVisibleIfChanged(card.blurb, show);
      if (!show) continue;
      var on = CLASS_KEYS[i] === profile.cls;
      card.bg.setFillStyle(on ? 0x1e3b34 : 0x132523, 1);
      setTextIfChanged(card.name, def.name);
      setTextIfChanged(card.role, def.role);
      setTextIfChanged(card.blurb, def.blurb);
      setColorIfChanged(card.name, colorCss(on ? def.accent : PAL.paper));
    }
    if (!show) return;
    var fresh = profile.level <= 1 && profile.totalKills === 0;
    setTextIfChanged(u.start, fresh ? 'ENTER THE VERGE' : 'CONTINUE   LEVEL ' + profile.level);
    setTextIfChanged(u.titleKicker, fresh ? 'CHOOSE A PATH' : 'YOUR PATH');
    setTextIfChanged(u.titleHint, fresh
      ? 'Drag the left pad to move, tap a skill to cast, tap ROLL to pass through a wind up. Keyboard: WASD, J K U I O L, space.'
      : 'Task ' + Math.min(QUESTS.length, profile.quest + 1) + ' of 30   gold ' + profile.gold + '   kills ' + profile.totalKills);
  };

  // ---------------------------------------------------------------- render
  var FX_TEX = { spark: 'tm-spark', dust: 'tm-dust', leaf: 'tm-leaf', shard: 'tm-shard', ring: 'tm-ring' };
  var FX_BASE = { spark: 12, dust: 14, leaf: 12, shard: 12, ring: 72 };

  Scene.prototype.renderViews = function (juice) {
    var i, e, v, f, n, z, s, h = this.hero, run = this.run;
    if (!run) return;
    var tx = clamp(h.x - W / 2, 0, Math.max(0, run.w - W));
    var ty = clamp(h.y - H / 2 + 40, 0, Math.max(0, run.h - H));
    this.camX += (tx - this.camX) * 0.16;
    this.camY += (ty - this.camY) * 0.16;
    var cx = Math.round(this.camX + juice.dx), cy = Math.round(this.camY + juice.dy);
    this.cameras.main.setScroll(cx, cy);
    this.ground.tilePositionX = cx; this.ground.tilePositionY = cy;

    var frame = Math.floor(h.anim) % 2;
    var heroKey = profile.cls + '-' + h.state + '-' + frame;
    if (!this.textures.get('tm-hero').has(heroKey)) heroKey = profile.cls + '-idle-0';
    this.heroView.setVisible(this.mode !== 'title');
    this.heroShadow.setVisible(this.mode !== 'title');
    if (this.mode !== 'title') {
      this.heroView.setTexture('tm-hero', heroKey);
      this.heroView.setPosition(h.x, h.y).setDepth(h.y).setFlipX(h.facing < 0);
      this.heroView.setAlpha(h.invuln > 0 ? 0.62 : 1);
      this.heroShadow.setPosition(h.x, h.y - 2).setDisplaySize(30, 12).setAlpha(0.55);
      var aura = h.shield > 0 || h.guardTime > 0 || h.regenTime > 0;
      this.heroAura.setVisible(aura);
      if (aura) {
        this.heroAura.setPosition(h.x, h.y - 16)
          .setDisplaySize(58, 58).setAlpha(0.34 + Math.sin(this.simTime * 6) * 0.1)
          .setTint(h.shield > 0 ? PAL.cold : h.guardTime > 0 ? PAL.bone : PAL.moss);
      }
    } else this.heroAura.setVisible(false);

    var targetId = h.targetId;
    var bracketOn = false;
    for (i = 0; i < MAX_ENEMIES; i++) {
      e = this.enemies[i]; v = this.enemyViews[i];
      if (!e.alive || this.mode === 'title') {
        setVisibleIfChanged(v.body, false); setVisibleIfChanged(v.shadow, false);
        setVisibleIfChanged(v.tele, false); setVisibleIfChanged(v.bar, false);
        setVisibleIfChanged(v.barBg, false); setVisibleIfChanged(v.chev, false);
        continue;
      }
      var def = e.boss ? bossDef(e.key) : familyDef(e.key);
      var eframe = Math.floor(e.anim) % 2;
      var st = e.state === 'walk' && e.boss ? 'idle' : e.state;
      if (e.boss && BOSS_STATES.indexOf(st) < 0) st = 'idle';
      if (!e.boss && ENEMY_STATES.indexOf(st) < 0) st = 'idle';
      var key = def.shape + '-' + st + '-' + eframe;
      var sheet = e.boss ? 'tm-boss' : 'tm-enemy';
      if (!this.textures.get(sheet).has(key)) key = def.shape + '-idle-0';
      v.body.setTexture(sheet, key).setPosition(e.x, e.y).setDepth(e.y).setVisible(true);
      v.body.setFlipX(h.x < e.x);
      v.body.setTint(e.flash > 0 ? 0xffffff : 0xffffff);
      v.body.setAlpha(e.flash > 0 ? 0.75 : 1);
      v.shadow.setPosition(e.x, e.y - 2).setVisible(true)
        .setDisplaySize(e.radius * 2.1, e.radius * 0.85).setAlpha(0.5);
      var barW = e.boss ? 74 : 30;
      var showBar = e.aggro > 0 || e.hp < e.maxHp;
      setVisibleIfChanged(v.barBg, showBar); setVisibleIfChanged(v.bar, showBar);
      if (showBar) {
        var by = e.y - (e.boss ? 92 : e.radius * 2 + 22);
        v.barBg.setPosition(e.x, by).setSize(barW + 2, e.boss ? 6 : 4);
        v.bar.setPosition(e.x - barW / 2, by)
          .setSize(Math.max(0, barW * clamp(e.hp / e.maxHp, 0, 1)), e.boss ? 5 : 3);
        v.bar.setFillStyle(e.boss ? PAL.danger : e.mark > 0 ? PAL.ember : PAL.danger, 1);
      }
      var chevOn = !e.boss;
      setVisibleIfChanged(v.chev, chevOn);
      if (chevOn) {
        v.chev.setPosition(e.x, e.y - e.radius * 2 - 32)
          .setTint(e.state === 'wind' ? 0xff6b6b : e.aggro ? PAL.ember : PAL.dim)
          .setAlpha(e.aggro ? 1 : 0.45).setDisplaySize(12, 9);
      }
      var teleOn = e.wind > 0;
      setVisibleIfChanged(v.tele, teleOn);
      if (teleOn) {
        var prog = 1 - clamp(e.wind / Math.max(0.01, e.windMax), 0, 1);
        v.tele.setPosition(e.x, e.y - 4)
          .setDisplaySize(e.teleR * 2 * (0.5 + prog * 0.5), e.teleR * 1.2 * (0.5 + prog * 0.5))
          .setTint(0xff6b6b).setAlpha(0.3 + prog * 0.45);
      }
      if (e.id === targetId) {
        bracketOn = true;
        this.targetBracket.setPosition(e.x, e.y - e.radius)
          .setDisplaySize(e.radius * 3.2, e.radius * 3.2)
          .setTint(h.manualTarget ? PAL.gold : PAL.moss)
          .setAngle(this.simTime * 40 % 360);
      }
    }
    setVisibleIfChanged(this.targetBracket, bracketOn && this.mode === 'play');

    for (i = 0; i < MAX_HAZARDS; i++) {
      z = this.hazards[i]; v = this.hazardViews[i];
      if (!z.alive) { setVisibleIfChanged(v.warn, false); setVisibleIfChanged(v.body, false); continue; }
      var warning = z.warn > 0;
      setVisibleIfChanged(v.warn, warning);
      setVisibleIfChanged(v.body, !warning);
      if (warning) {
        v.warn.setPosition(z.x, z.y).setDisplaySize(z.r * 2, z.r * 1.3).setTint(0xff6b6b)
          .setAlpha(0.35 + Math.sin(this.simTime * 18) * 0.18);
      } else {
        var col = z.kind === 'pollen' ? 0xd8f0a0 : z.kind === 'snare' ? 0x7fae5a : z.kind === 'sigil' ? PAL.violet : z.kind === 'vent' ? PAL.flame : PAL.stone;
        v.body.setPosition(z.x, z.y).setDisplaySize(z.r * 2, z.r * 1.35).setTint(col)
          .setAlpha(clamp(z.life / z.maxLife, 0, 1) * 0.6);
      }
    }

    for (i = 0; i < MAX_SHOTS; i++) {
      s = this.shots[i]; v = this.shotViews[i];
      if (!s.alive) { setVisibleIfChanged(v, false); continue; }
      v.setVisible(true).setPosition(s.x, s.y).setTint(s.color)
        .setDisplaySize(10, 14).setRotation(Math.atan2(s.vy, s.vx) + Math.PI / 2);
    }

    for (i = 0; i < MAX_FX; i++) {
      f = this.fx[i]; v = this.fxViews[i];
      if (!f.alive) { setVisibleIfChanged(v, false); continue; }
      var tex = FX_TEX[f.kind] || 'tm-spark';
      if (v.fxKind !== f.kind) { v.setTexture(tex); v.fxKind = f.kind; }
      var base = FX_BASE[f.kind] || 12;
      var life = clamp(f.life / f.maxLife, 0, 1);
      v.setVisible(true).setPosition(f.x, f.y).setTint(f.color)
        .setAlpha(life * f.fade).setRotation(f.rot)
        .setDisplaySize(base * f.size, (f.kind === 'ring' ? base : base * 0.75) * f.size);
    }

    for (i = 0; i < MAX_NUMBERS; i++) {
      n = this.numbers[i]; v = this.numberViews[i];
      if (!n.alive) { setVisibleIfChanged(v, false); continue; }
      var nl = clamp(n.life / n.maxLife, 0, 1);
      v.setVisible(true).setPosition(n.x, n.y).setAlpha(nl);
      setTextIfChanged(v, n.text);
      setColorIfChanged(v, colorCss(n.color));
      v.setScale(n.big ? 1.25 : 0.95);
    }
    this.syncHud();
  };

  Scene.prototype.syncHud = function () {
    var u = this.ui, h = this.hero, i, playing = this.mode !== 'title';
    this.paintTitle();
    var hudOn = playing && !this.panel;
    setVisibleIfChanged(u.hudTop, hudOn); setVisibleIfChanged(u.hudBottom, hudOn);
    for (i = 0; i < HUD_KEYS.length; i++) setVisibleIfChanged(u[HUD_KEYS[i]], hudOn);
    for (i = 0; i < u.buttons.length; i++) {
      setVisibleIfChanged(u.buttons[i].bg, hudOn);
      setVisibleIfChanged(u.buttons[i].icon, hudOn);
    }
    for (i = 0; i < 6; i++) {
      var sk = u.skills[i];
      setVisibleIfChanged(sk.bg, hudOn); setVisibleIfChanged(sk.icon, hudOn);
      setVisibleIfChanged(sk.cool, hudOn); setVisibleIfChanged(sk.lock, hudOn);
    }
    setVisibleIfChanged(u.shieldBar, hudOn && h.shield > 0);
    setVisibleIfChanged(this.tintLayer, playing); setVisibleIfChanged(this.vignette, playing);
    if (hudOn) {
      setTextIfChanged(u.level, 'LV ' + (profile.level < 10 ? '0' : '') + profile.level);
      setTextIfChanged(u.classChip, classDef().name);
      setColorIfChanged(u.classChip, colorCss(classDef().accent));
      var need = xpFor(profile.level);
      u.xpBar.width = 118 * clamp(profile.level >= LEVEL_CAP ? 1 : profile.xp / need, 0, 1);
      var ratio = clamp(h.hp / Math.max(1, h.maxHp), 0, 1);
      u.hpBar.width = 174 * ratio;
      u.hpBar.setFillStyle(ratio < 0.3 ? 0xff4d5c : PAL.danger, 1);
      if (h.shield > 0) u.shieldBar.width = 174 * clamp(h.shield / Math.max(1, h.maxHp), 0, 1);
      setTextIfChanged(u.hpText, Math.max(0, Math.ceil(h.hp)) + '/' + Math.ceil(h.maxHp));
      var stage = this.run ? (this.run.kind === 'dungeon' ? 'UNDERCROFT ' + this.run.floor + '  ' + this.run.def.name : this.run.def.name) : '';
      setTextIfChanged(u.region, stage);
      setColorIfChanged(u.region, colorCss(this.run ? this.run.def.accent : PAL.moss));
      var q = activeQuest();
      if (q) {
        var p = questProgress(q);
        setTextIfChanged(u.quest, 'Q' + (q.id < 10 ? '0' : '') + q.id + ' ' + q.name + '  ' + p.have + '/' + p.need);
      } else setTextIfChanged(u.quest, 'CHAIN COMPLETE');
      setTextIfChanged(u.gold, profile.gold + ' G   ' + profile.shards + ' SH');
      u.buttons[0].icon.setTint(this.autoHunt ? PAL.cold : PAL.mist);
      u.stickThumb.setPosition(STICK.x + this.stick.x * 34, STICK.y + this.stick.y * 34);
      u.dodgeCool.width = 56 * clamp(1 - Math.max(0, h.dodgeCd) / 1.1, 0, 1);
      u.dodgeIcon.setAlpha(h.dodgeCd > 0 ? 0.4 : 1);
      var list = skillList();
      for (i = 0; i < 6; i++) {
        var s = list[i], view = u.skills[i], locked = profile.level < s.unlock;
        if (view.iconKey !== s.icon) { view.icon.setTexture('tm-icon-' + s.icon); view.iconKey = s.icon; }
        view.icon.setTint(locked ? 0x44514f : s.color).setAlpha(locked ? 0.5 : h.cds[i] > 0 ? 0.45 : 1);
        view.cool.width = 46 * clamp(1 - Math.max(0, h.cds[i]) / (s.cd * cooldownScale()), 0, 1);
        view.cool.setFillStyle(locked ? 0x33403e : s.color, 1);
        setTextIfChanged(view.lock, locked ? String(s.unlock) : '');
      }
      var bossUp = this.run && this.run.kind === 'field' && !this.run.bossAlive;
      var bossHere = this.run && this.run.bossAlive;
      setVisibleIfChanged(u.bossChipBg, !!(bossUp || bossHere));
      setVisibleIfChanged(u.bossChip, !!(bossUp || bossHere));
      if (bossHere) {
        setTextIfChanged(u.bossChip, bossDef(this.run.bossKey).name);
        setColorIfChanged(u.bossChip, colorCss(PAL.danger));
      } else if (bossUp) {
        var secs = Math.max(0, Math.ceil(this.run.bossClock));
        setTextIfChanged(u.bossChip, bossDef(this.run.bossKey).name + '  ' + Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2));
        setColorIfChanged(u.bossChip, colorCss(PAL.ember));
      }
    } else {
      setVisibleIfChanged(u.bossChipBg, false); setVisibleIfChanged(u.bossChip, false);
    }
    var coachOn = hudOn && this.coach.time > 0;
    setVisibleIfChanged(u.coachBg, coachOn); setVisibleIfChanged(u.coach, coachOn);
    if (coachOn) {
      setTextIfChanged(u.coach, this.coach.text);
      var ca = clamp(this.coach.time / 1.2, 0, 1);
      u.coach.setAlpha(ca); u.coachBg.setAlpha(ca * 0.62);
    }
    var toastOn = hudOn && this.toast.time > 0;
    setVisibleIfChanged(u.toastBg, toastOn); setVisibleIfChanged(u.toast, toastOn);
    setVisibleIfChanged(u.toastBar, toastOn);
    if (toastOn) {
      setTextIfChanged(u.toast, this.toast.text);
      setColorIfChanged(u.toast, colorCss(PAL.paper));
      u.toastBar.setFillStyle(this.toast.color, 1);
      var ta = clamp(this.toast.time / 0.35, 0, 1);
      u.toastBg.setAlpha(ta * 0.94); u.toast.setAlpha(ta); u.toastBar.setAlpha(ta);
    }
    var bannerOn = this.banner.time > 0 && !this.panel;
    setVisibleIfChanged(u.bannerBg, bannerOn); setVisibleIfChanged(u.bannerEdge, bannerOn);
    setVisibleIfChanged(u.bannerTitle, bannerOn); setVisibleIfChanged(u.bannerSub, bannerOn);
    if (bannerOn) {
      var bs = kit.juice.enabled ? this.banner.scale : 1;
      setTextIfChanged(u.bannerTitle, this.banner.text);
      setTextIfChanged(u.bannerSub, this.banner.sub);
      setColorIfChanged(u.bannerTitle, colorCss(PAL.paper));
      u.bannerBg.setScale(bs, bs); u.bannerEdge.setScale(bs, 1);
      u.bannerEdge.setFillStyle(this.banner.color, 1);
      u.bannerEdge.setY(300 - 46 * bs);
      u.bannerTitle.setScale(bs); u.bannerSub.setScale(bs);
      var ba = clamp(this.banner.time / 0.4, 0, 1);
      u.bannerBg.setAlpha(ba * 0.95); u.bannerTitle.setAlpha(ba); u.bannerSub.setAlpha(ba); u.bannerEdge.setAlpha(ba);
    }
    var dead = this.mode === 'dead' && !this.panel;
    for (i = 0; i < u.deadKeys.length; i++) setVisibleIfChanged(u[u.deadKeys[i]], dead);
    if (dead) {
      setTextIfChanged(u.deadBody, 'You lost ten gold and a little experience. Your gear is untouched. The bind stone in ' + regionAt(profile.bind).name + ' still holds.');
      setTextIfChanged(u.primary, 'RETURN TO THE BIND STONE');
    }
  };

  Scene.prototype.updateDebug = function () {
    var run = this.run;
    TM_STATE.mode = this.mode === 'title' ? 'title' : this.mode === 'dead' ? 'dead' : this.panel ? 'menu' : (run && run.kind === 'dungeon' ? 'dungeon' : 'field');
    TM_STATE.stage = run ? (run.kind === 'dungeon' ? 'undercroft-' + run.floor : run.def.key) : 'mosswold';
    TM_STATE.level = profile.level;
    TM_STATE.progress = Math.round((profile.quest / QUESTS.length) * 100) / 100;
    TM_STATE.score = profile.totalKills;
    TM_STATE.health = Math.max(0, Math.round(this.hero.hp));
    TM_STATE.maxHealth = Math.round(this.hero.maxHp);
    TM_STATE.gold = profile.gold;
    TM_STATE.quest = profile.quest;
    TM_STATE.region = profile.region;
    TM_STATE.floors = profile.floorsCleared;
    TM_STATE.cls = profile.cls;
    TM_STATE.bossAlive = !!(run && run.bossAlive);
    TM_STATE.enemies = this.liveEnemies(false);
    TM_STATE.autoHunt = this.autoHunt;
    TM_STATE.tutorial = profile.tutorial;
  };

  Scene.prototype.readSwitches = function () {
    var mode = String(DEBUG.forceMode || '');
    if (mode && this.mode === 'title' && (mode === 'play' || mode === 'field' || mode === 'dungeon')) {
      DEBUG.forceMode = '';
      this.startFromTitle(mode === 'dungeon' ? 'dungeon' : 'field');
      return;
    }
    var stage = DEBUG.forceStage;
    if (stage !== '' && stage != null && this.mode !== 'title') {
      DEBUG.forceStage = '';
      var key = String(stage);
      if (key.indexOf('undercroft') === 0) {
        var fl = clamp(Math.floor(num(key.split('-')[1], 1)), 1, FLOORS.length);
        profile.level = Math.max(profile.level, DUNGEON_MIN_LEVEL);
        this.enterFloor(fl);
      } else if (own(REGION_BY_KEY, key)) {
        var r = REGION_BY_KEY[key];
        profile.level = Math.max(profile.level, r.minLevel);
        profile.unlocked[r.index] = true;
        this.enterRegion(r.index);
      } else if (isFinite(Number(key))) {
        var idx = clamp(Math.floor(Number(key)), 0, REGIONS.length - 1);
        profile.level = Math.max(profile.level, REGIONS[idx].minLevel);
        profile.unlocked[idx] = true;
        this.enterRegion(idx);
      }
    }
  };

  Scene.prototype.update = function (time, delta) {
    this.readSwitches();
    this.moveX = 0; this.moveY = 0;
    this.pollPointers();
    this.pollKeyboard();
    this.pollGamepad();
    var juice = kit.juice.frame();
    var wall = clamp(num(delta, 16) / 1000, 0, 0.1);
    if (!kit.paused && !this.panel && this.mode !== 'title' && !juice.frozen) {
      this.accumulator = Math.min(this.accumulator + wall, STEP * MAX_STEPS);
      var steps = 0;
      while (this.accumulator >= STEP && steps < MAX_STEPS) { this.stepSim(); this.accumulator -= STEP; steps++; }
    } else if (this.mode === 'title') {
      if (this.banner.time > 0) this.banner.time -= wall;
    }
    if (this.mode === 'title') { this.syncHud(); return; }
    this.renderViews(juice);
    if (this.panel) this.paintPanel();
    this.updateDebug();
  };

  var config = {
    type: Phaser.AUTO,
    parent: 'game',
    width: W, height: H,
    backgroundColor: '#0a1012',
    render: { pixelArt: true, antialias: false, roundPixels: true, clearBeforeRender: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
    fps: { target: 60, min: 30 },
    scene: Scene
  };
  App.game = new Phaser.Game(config);
})();
