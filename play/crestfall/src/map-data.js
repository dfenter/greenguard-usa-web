// Crestfall world map data.
// The map is intentionally compact and greybox-friendly.
// T = TILE type constants

import { TILE } from './constants.js';
// Note: buildFieldEncounter takes its rng as an explicit parameter (see
// below) rather than importing worldRng directly — decision 2 purity repair.

const G = TILE.GRASS;
const F = TILE.FOREST;
const M = TILE.MOUNTAIN;
const W = TILE.WATER;
const S = TILE.SWAMP;
const D = TILE.DESERT;
const R = TILE.ROAD;
const B = TILE.BRIDGE;
const T = TILE.TOWN;
const P = TILE.PALACE;
const C = TILE.CAVE;
const V = TILE.GRAVEYARD;

// Western Emberwild (20x16 tiles, each tile = 8 NES pixels)
export const WESTERN_MAP = [
  // Row 0 (north)
  [M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M],
  // Row 1
  [M,M,G,G,G,G,G,G,R,R,R,R,G,G,G,M,M,M,M,M],
  // Row 2 - North Palace area
  [M,G,G,G,G,G,G,G,R,P,R,G,G,G,G,G,M,M,M,M],
  // Row 3
  [M,G,G,G,G,F,F,G,R,R,R,G,G,G,G,G,G,M,M,M],
  // Row 4 - Rauru
  [M,G,G,G,G,F,F,G,G,G,G,G,T,G,G,G,G,G,M,M],
  // Row 5
  [M,G,G,G,D,D,D,G,G,G,G,G,R,G,G,G,G,G,W,W],
  // Row 6 - Ruto, Parapa Desert
  [M,G,G,D,D,D,D,D,D,G,G,T,R,G,G,G,G,W,W,W],
  // Row 7 - Parapa Palace
  [M,G,G,D,D,D,P,D,D,G,G,G,R,G,G,G,W,W,W,W],
  // Row 8
  [M,G,G,G,D,D,D,G,G,G,G,G,R,G,G,W,W,W,W,W],
  // Row 9 - Saria
  [M,G,G,G,G,G,G,G,G,T,G,G,R,G,W,W,W,W,W,W],
  // Row 10 - Midoro Swamp
  [M,G,G,G,G,S,S,S,S,G,G,G,G,W,W,W,W,W,W,W],
  // Row 11 - Midoro Palace
  [M,G,G,G,G,S,P,S,S,G,G,G,G,G,W,W,W,W,W,W],
  // Row 12
  [M,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,W,W,W],
  // Row 13 - Mido
  [M,G,G,G,G,G,G,G,G,G,T,G,G,G,G,G,G,G,W,W],
  // Row 14 - Island (bridge to eastern)
  [M,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,B,W,W],
  // Row 15 (south)
  [M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M],
];

// Eastern Emberwild (20x16)
export const EASTERN_MAP = [
  [M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M],
  [M,M,G,G,G,G,G,G,G,G,G,G,G,G,M,M,M,M,M,M],
  [W,W,G,G,G,G,G,G,G,G,G,G,G,G,G,M,M,M,M,M],
  [W,W,G,G,M,M,G,G,G,G,G,G,G,G,G,G,M,M,M,M],
  [W,W,G,G,M,M,G,G,F,F,G,G,G,G,G,G,G,M,M,M],
  [W,W,W,G,G,G,G,F,F,F,F,G,G,G,G,G,G,G,M,M],
  [W,W,W,G,G,G,F,F,F,F,F,G,G,G,T,G,G,G,G,M], // New Kasuto
  [W,W,W,W,G,G,G,G,F,F,G,G,G,G,R,G,G,G,G,M],
  [W,W,W,W,G,G,G,G,G,G,G,G,G,G,R,G,G,G,G,M],
  [W,W,W,W,G,P,G,G,G,G,G,G,G,G,R,G,G,G,M,M], // P6 Palace on Sea
  [W,W,W,W,W,G,G,G,G,G,G,G,G,G,R,T,G,G,M,M], // Old Kasuto
  [W,W,W,W,W,G,G,G,G,P,G,G,G,G,R,G,G,G,M,M], // P5 Three Eye
  [W,W,W,W,W,W,G,G,G,G,G,G,G,G,R,G,G,M,M,M],
  [W,W,W,W,W,W,G,G,G,G,G,G,G,G,R,G,G,M,M,M],
  [W,W,B,W,W,W,G,G,G,G,G,G,G,G,R,G,G,M,M,M], // Bridge entry
  [M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M,M],
];

// Town data
export const TOWNS = {
  rauru: {
    region: 'west',
    name: 'BRACKEN',
    mapX: 12, mapY: 4,
    spell: 'SHIELD',
    npcText: [
      'WELCOME TO BRACKEN.',
      'SEEK THE RUNEKEEPER.',
      'LEARN THE WARD RUNE.',
    ],
    wiseManText: 'WARD TURNS BLADES ASIDE\nWHEN YOUR STANCE IS TRUE.',
    hasHospital: true,
    npcCount: 3,
  },
  ruto: {
    region: 'west',
    name: 'CINDER',
    mapX: 11, mapY: 6,
    spell: 'JUMP',
    npcText: [
      'FLOODWATER COVERS THE LOWLANDS.',
      'SEEK THE FLUX RUNE.',
      'IT WAITS BELOW THE RIDGE.',
    ],
    wiseManText: 'FLUX LIFTS YOU HIGH\nTO CROSS BROKEN GROUND.',
    hasHospital: true,
    npcCount: 4,
  },
  saria: {
    region: 'west',
    name: 'LUMEN',
    mapX: 9, mapY: 9,
    spell: 'LIFE',
    npcText: [
      'THE PINES WHISPER AT NIGHT.',
      'LEARN THE MEND RUNE.',
      'IT RESTORES YOUR VITALITY.',
    ],
    wiseManText: 'MEND RESTORES HALF\nYOUR VITALITY.',
    hasHospital: true,
    npcCount: 3,
  },
  mido: {
    region: 'west',
    name: 'MOSSGATE',
    mapX: 10, mapY: 13,
    spell: 'FAIRY',
    npcText: [
      'WELCOME, WAYFARER.',
      'THE WISP RUNE AWAITS.',
      'IT LETS YOU PASS STONE.',
    ],
    wiseManText: 'WISP UNMAKES YOUR WEIGHT\nSO YOU CAN CROSS CHASMS.',
    hasHospital: true,
    npcCount: 5,
  },
  // Eastern towns
  // R4 repair: nabooru previously shared (14,6) with newkasuto (both
  // eastern — region-qualifying the lookup alone does not separate two
  // entries in the SAME region at the SAME coordinates; see
  // reviews/sol_port_spec_review_2026-07-18.md "region-less content
  // lookup"). Object insertion order made nabooru always win that lookup,
  // leaving newkasuto permanently unreachable. Moved nabooru to (2,2), an
  // unused passable GRASS tile on EASTERN_MAP with no other town/palace
  // claim, so both towns are independently reachable.
  nabooru: {
    region: 'east',
    name: 'SUNSPIRE',
    mapX: 2, mapY: 2, // eastern map
    spell: 'FIRE',
    npcText: [
      'YOU NEED THE EMBER RUNE.',
      'HEXWEAVERS HAUNT THE ROAD.',
    ],
    wiseManText: 'EMBER SENDS A BURNING BOLT\nTHROUGH FOES.',
    hasHospital: true,
    npcCount: 4,
  },
  darunia: {
    region: 'east',
    name: 'FLINTMARK',
    mapX: 5, mapY: 3, // eastern
    spell: 'REFLECT',
    npcText: [
      'THE RIDGES ARE CLOSE.',
      'MIRROR TURNS ARCANE SHOTS.',
    ],
    wiseManText: 'MIRROR TURNS BACK\nARCANE BEAMS.',
    hasHospital: false,
    npcCount: 3,
  },
  oldkasuto: {
    region: 'east',
    name: 'GLOAMREST',
    mapX: 15, mapY: 10, // eastern
    spell: 'SPELL',
    npcText: [
      'THIS PLACE IS HOLLOW.',
      'FIND THE LOST RUNE.',
    ],
    wiseManText: 'HEX BENDS A FOE\nTO YOUR WILL.',
    hasHospital: false,
    npcCount: 2,
  },
  newkasuto: {
    region: 'east',
    name: 'STARHOLD',
    mapX: 14, mapY: 6, // eastern
    spell: 'THUNDER',
    npcText: [
      'THE LAST KEEP LIES AHEAD.',
      'SURGE IS THE FINAL RUNE.',
    ],
    wiseManText: 'SURGE BREAKS\nTHE UMBRAKIN.',
    hasHospital: true,
    npcCount: 6,
  },
};

// Palace data
export const PALACES = [
  {
    id: 1, name: 'EMBER KEEP',
    region: 'west',
    mapX: 6, mapY: 7,
    boss: 'horsehead',
    bossName: 'RAVENHORSE',
    crystal: 0,
    enemies: ['ache', 'stalfos', 'bit'],
    difficulty: 1,
  },
  {
    id: 2, name: 'MIRE KEEP',
    region: 'west',
    mapX: 6, mapY: 11,
    boss: 'helmethead',
    bossName: 'CROWNBACK',
    crystal: 1,
    enemies: ['ache', 'stalfos', 'wizzrobe', 'goriya'],
    difficulty: 2,
  },
  // Connectivity fix (not a ledgered R-repair, but required for the Phase
  // 0.5 full-run-to-WIN gate to be achievable at all): (17,14) is
  // WESTERN_MAP's only passable tile in the bridge-crossing column range
  // (x >= map width - 3; see overworld.js bridge check) AND it is also the
  // literal BRIDGE tile itself. overworld.js._checkTile checks palace
  // lookup before the bridge-crossing check, so the Island Palace here
  // permanently shadowed the only viable crossing point — the bridge
  // could never fire. (17,13), immediately adjacent, is on every route
  // INTO that same corridor and has the identical problem one tile
  // earlier. Moved to (2,12): an unclaimed GRASS tile away from the
  // bridge approach entirely.
  {
    id: 3, name: 'ISLAND VAULT',
    region: 'west',
    mapX: 2, mapY: 12,
    boss: 'ironknuckle',
    bossName: 'IRONWRAITH',
    crystal: 2,
    enemies: ['stalfos', 'goriya', 'wizzrobe'],
    difficulty: 3,
  },
  {
    id: 4, name: 'FRACTURE KEEP',
    region: 'east',
    mapX: 3, mapY: 4,  // eastern
    boss: 'carock',
    bossName: 'STONEVEX',
    crystal: 3,
    enemies: ['wizzrobe', 'ironknuckle', 'lizalfos'],
    difficulty: 4,
  },
  {
    id: 5, name: 'TRIUNE VAULT',
    region: 'east',
    mapX: 9, mapY: 11, // eastern
    boss: 'gooma',
    bossName: 'IRONROOT',
    crystal: 4,
    enemies: ['ironknuckle', 'lizalfos', 'wizzrobe'],
    difficulty: 5,
  },
  {
    id: 6, name: 'DEEPWATER KEEP',
    region: 'east',
    mapX: 5, mapY: 9,  // eastern
    boss: 'barba',
    bossName: 'TIDEBANE',
    crystal: 5,
    enemies: ['ironknuckle', 'lizalfos', 'wizzrobe', 'goriya'],
    difficulty: 6,
  },
  {
    id: 7, name: 'CROWNFALL KEEP',
    region: 'east',
    mapX: 10, mapY: 5, // eastern
    boss: 'darklink',
    bossName: 'UMBRAKIN',
    crystal: -1, // final
    enemies: ['ironknuckle', 'wizzrobe', 'lizalfos'],
    difficulty: 7,
    isFinal: true,
  },
];

// Sideview level definitions
// Each room: {w, h, platforms, enemies, doors, items, next}
export function buildPalaceRooms(palaceId) {
  const rooms = [];
  const difficulty = palaceId;

  // View area is 167px tall (NES 224 - 57 HUD).
  // Ground at y=148, player spawns at y=132 (148-16h)
  // Mid platforms: 112, 96, 72
  const GY = 148; // ground Y

  // Entrance room
  rooms.push({
    id: 0,
    type: 'palace',
    w: 256, h: 167,
    bgColor: '#000080',
    platforms: [
      { x: 0,   y: GY,     w: 256, h: 20 }, // ground
      { x: 80,  y: GY-36,  w: 48,  h: 8 },  // mid platform
      { x: 160, y: GY-52,  w: 48,  h: 8 },
    ],
    doors: [
      { x: 240, y: GY-36, w: 16, h: 32, locked: false, leadsTo: 1 },
    ],
    enemies: [
      { type: 'stalfos', x: 120, y: GY-16 },
      { type: 'ache',    x: 180, y: GY-64 },
    ],
    items: [],
    next: 1,
  });

  // Hall room with locked door
  rooms.push({
    id: 1,
    type: 'palace',
    w: 256, h: 167,
    bgColor: '#000080',
    platforms: [
      { x: 0,   y: GY,    w: 256, h: 20 },
      { x: 48,  y: GY-36, w: 32,  h: 8 },
      { x: 128, y: GY-52, w: 32,  h: 8 },
      { x: 192, y: GY-36, w: 48,  h: 8 },
    ],
    doors: [
      { x: 240, y: GY-36, w: 16, h: 32, locked: true, leadsTo: 2 },
    ],
    enemies: [
      { type: 'stalfos',  x: 80,  y: GY-16 },
      { type: 'wizzrobe', x: 160, y: GY-56 },
    ],
    items: [
      { type: 'key', x: 128, y: GY-60 },
    ],
    next: 2,
  });

  // Multi-tier room (climb up)
  rooms.push({
    id: 2,
    type: 'palace',
    w: 256, h: 167,
    bgColor: '#000080',
    platforms: [
      { x: 0,   y: GY,    w: 96,  h: 20 },
      { x: 160, y: GY,    w: 96,  h: 20 },
      { x: 80,  y: GY-36, w: 96,  h: 8 },
      { x: 0,   y: GY-72, w: 64,  h: 8 },
      { x: 160, y: GY-72, w: 96,  h: 8 },
      { x: 64,  y: GY-96, w: 128, h: 8 },
    ],
    doors: [
      { x: 240, y: GY-96, w: 16, h: 32, locked: false, leadsTo: 3 },
    ],
    enemies: [
      { type: 'ironknuckle', x: 160, y: GY-16 },
      { type: 'ache',        x: 100, y: GY-80 },
    ],
    items: [
      { type: 'pbag', x: 64, y: GY-112, large: true },
    ],
    next: 3,
  });

  // Boss room
  rooms.push({
    id: 3,
    type: 'palace_boss',
    w: 256, h: 167,
    bgColor: '#200000',
    platforms: [
      { x: 0, y: GY, w: 256, h: 20 },
    ],
    doors: [],
    enemies: [
      { type: PALACES[palaceId-1]?.boss || 'horsehead', x: 160, y: GY-24, isBoss: true },
    ],
    items: [
      { type: 'crystal', x: 200, y: GY-16 },
    ],
    next: -1, // return to overworld
  });

  return rooms;
}

// Field encounter definitions (random battles on overworld).
//
// Rev 2 decision 2 / "buildFieldEncounter is refactored pure (explicit rng
// param) in the oracle first": `rng` is REQUIRED and read from nowhere else
// in this function — no hidden module-global state — so the same call with
// the same rng-stream position always produces the same result, and callers
// (sideview.js, the harness) control exactly which stream position it
// consumes from. Draw order is unchanged from the pre-repair version.
export function buildFieldEncounter(tileType, difficulty, rng) {
  const w = 256, h = 167;
  const groundY = 148; // within 167px play area
  const platforms = [
    { x: 0, y: groundY, w: w, h: 20 },
  ];

  // Add some terrain variety
  if (rng.next('fieldEncounter.platformA.roll') < 0.4) {
    platforms.push({ x: 60 + rng.next('fieldEncounter.platformA.x') * 60, y: groundY - 28, w: 40, h: 8 });
  }
  if (rng.next('fieldEncounter.platformB.roll') < 0.3) {
    platforms.push({ x: 150 + rng.next('fieldEncounter.platformB.x') * 60, y: groundY - 40, w: 48, h: 8 });
  }

  // Enemy pool by tile
  const pools = {
    [TILE.GRASS]:     ['ache', 'stalfos', 'goriya'],
    [TILE.FOREST]:    ['ache', 'wizzrobe', 'stalfos'],
    [TILE.SWAMP]:     ['ache', 'stalfos', 'lizalfos'],
    [TILE.DESERT]:    ['stalfos', 'goriya', 'lizalfos'],
    [TILE.GRAVEYARD]: ['stalfos', 'wizzrobe', 'ache'],
  };

  const pool = pools[tileType] || pools[TILE.GRASS];
  const count = 1 + Math.min(difficulty, 3);
  const enemies = [];

  for (let i = 0; i < count; i++) {
    const type = pool[Math.floor(rng.next(`fieldEncounter.enemy${i}.type`) * pool.length)];
    enemies.push({
      type,
      x: 120 + i * 40 + rng.next(`fieldEncounter.enemy${i}.x`) * 20,
      y: groundY - 16,
    });
  }

  return {
    type: 'field',
    tileType,
    w, h,
    bgColor: '#004800',
    platforms,
    enemies,
    doors: [],
    items: [],
    next: -1,
  };
}
