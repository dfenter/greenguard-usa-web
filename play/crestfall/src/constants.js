// Compact arcade resolution: 256x224, rendered at SCALE multiplier.

export const SCALE = 3;
export const NES_W = 256;
export const NES_H = 224;
export const W = NES_W * SCALE;
export const H = NES_H * SCALE;

// Game states
export const STATE = {
  TITLE: 'title',
  OVERWORLD: 'overworld',
  SIDEVIEW: 'sideview',
  TOWN: 'town',
  GAMEOVER: 'gameover',
  WIN: 'win',
};

// Original Emberwild palette anchors. The final view layer adds gradients,
// additive glows, and particle ramps around these readable values.
export const PAL = {
  BLACK:    '#000000',
  WHITE:    '#FCFCFC',
  RED:      '#D81818',
  ORANGE:   '#E87818',
  YELLOW:   '#F8B800',
  GREEN:    '#00A800',
  DKGREEN:  '#006800',
  CYAN:     '#00E8D8',
  BLUE:     '#0058F8',
  LTBLUE:   '#3CBCFC',
  PURPLE:   '#6844FC',
  MAGENTA:  '#D800CC',
  BROWN:    '#884000',
  TAN:      '#FCBCB0',
  GRAY:     '#808080',
  LTGRAY:   '#BCBCBC',
  DKRED:    '#940000',
  DKBLUE:   '#0000BC',
  GOLD:     '#F8D878',
  SKIN:     '#F8B8F8',
  HERO_CLOAK: '#00A800',
  HERO_SKIN:  '#FCA044',
  HERO_HOOD:  '#00A800',
};

// Tile types (overworld)
export const TILE = {
  GRASS:     0,
  FOREST:    1,
  MOUNTAIN:  2,
  WATER:     3,
  SWAMP:     4,
  DESERT:    5,
  ROAD:      6,
  BRIDGE:    7,
  TOWN:      8,
  PALACE:    9,
  CAVE:      10,
  GRAVEYARD: 11,
  LAVA:      12,
};

// Tile properties
export const TILE_PROPS = {
  [TILE.GRASS]:     { passable: true,  encounter: 0.001, color: '#38A838' },
  [TILE.FOREST]:    { passable: true,  encounter: 0.004, color: '#006800' },
  [TILE.MOUNTAIN]:  { passable: false, encounter: 0,     color: '#888888' },
  [TILE.WATER]:     { passable: false, encounter: 0,     color: '#0058F8' },
  [TILE.SWAMP]:     { passable: true,  encounter: 0.005, color: '#004800' },
  [TILE.DESERT]:    { passable: true,  encounter: 0.003, color: '#F8D878' },
  [TILE.ROAD]:      { passable: true,  encounter: 0,     color: '#C8A870' },
  [TILE.BRIDGE]:    { passable: true,  encounter: 0,     color: '#C8A870' },
  [TILE.TOWN]:      { passable: true,  encounter: 0,     color: '#F8F8F8' },
  [TILE.PALACE]:    { passable: true,  encounter: 0,     color: '#A800A8' },
  [TILE.CAVE]:      { passable: true,  encounter: 0,     color: '#585858' },
  [TILE.GRAVEYARD]: { passable: true,  encounter: 0.006, color: '#585858' },
  [TILE.LAVA]:      { passable: false, encounter: 0,     color: '#E80000' },
};

// Player constants
export const PLAYER = {
  // Physics
  WALK_SPEED:   1.5,   // pixels/frame (NES space)
  JUMP_VEL:    -5.5,
  GRAVITY:      0.25,
  MAX_FALL:     6,
  COYOTE_FRAMES: 6,
  JUMP_BUFFER_FRAMES: 5,

  // Combat
  SWORD_REACH:  16,
  SWORD_HEIGHT: 8,
  ATTACK_WINDUP: 4,
  ATTACK_ACTIVE: 5,
  ATTACK_RECOVERY: 7,
  PARRY_WINDOW: 8,
  IFRAME_DURATION: 60,  // frames of invincibility after hit

  // Starting stats
  START_ATK: 2,
  START_MAG: 2,
  START_LIF: 2,
  START_HEARTS: 3,
  START_MAGIC: 3,
  MAX_HEARTS: 8,
  MAX_MAGIC: 8,
  LIVES: 3,
};

// XP thresholds for each attribute (level 1 to 8).
export const XP_TABLE = {
  atk: [0, 200,  500,  900,  2000, 3000, 5000, 8000],
  mag: [0, 350,  800,  1500, 3000, 5000, 8000, 9999],
  lif: [0, 200,  400,  600,  1000, 1400, 2000, 4000],
};

// Attack power by level
export const ATK_POWER = [0, 1, 2, 3, 4, 5, 6, 7, 8];

// HP per heart per Life level
export const HP_PER_HEART = [0, 16, 16, 16, 16, 16, 16, 16, 32]; // simplified

// Spell definitions
export const SPELLS = {
  SHIELD:  { id: 0, name: 'WARD',   cost: 4, town: 'BRACKEN',   color: '#0058F8' },
  JUMP:    { id: 1, name: 'FLUX',   cost: 4, town: 'CINDER',    color: '#00A800' },
  LIFE:    { id: 2, name: 'MEND',   cost: 6, town: 'LUMEN',     color: '#D81818' },
  FAIRY:   { id: 3, name: 'WISP',   cost: 8, town: 'MOSSGATE',  color: '#F8D878' },
  FIRE:    { id: 4, name: 'EMBER',  cost: 6, town: 'SUNSPIRE',  color: '#E87818' },
  REFLECT: { id: 5, name: 'MIRROR', cost: 4, town: 'FLINTMARK', color: '#FCFCFC' },
  SPELL:   { id: 6, name: 'HEX',    cost: 6, town: 'GLOAMREST', color: '#6844FC' },
  THUNDER: { id: 7, name: 'SURGE',  cost: 8, town: 'STARHOLD',  color: '#F8F8A8' },
};

// Enemy XP rewards
export const ENEMY_XP = {
  duskwing:        10,
  bubbles:      0,
  boneward:     30,
  hexweaver:    50,
  ironwraith: 50,
  brineclaw:    40,
  crescent:      40,
  bit:         10,
  bot:         20,
  tektite:     20,
  leever:      30,
  moblin:      20,
  warg:        30,
  ravenhorse:  200,  // boss
  crownback: 300,
  ironwraith_boss: 400,
  stonevex: 500,
  ironroot: 600,
  tidebane: 700,
};

// Side-view scene types
export const SCENE = {
  FIELD:    'field',
  PALACE:   'palace',
  TOWN:     'town',
  CAVE:     'cave',
};

// Colors for HUD
export const HUD = {
  BG:           '#000000',
  BAR_BG:       '#800000',
  LIFE_BAR:     '#D81818',
  MAGIC_BAR:    '#0058F8',
  XP_BAR:       '#00A800',
  TEXT:         '#FCFCFC',
  LEVEL_NUM:    '#F8D878',
  HEALTH_FULL:  '#D81818',
  HEALTH_EMPTY: '#800000',
};

// Gravity/physics shared
export const GRAVITY = 0.25;
export const MAX_FALL = 6;

// Frame timing
export const FPS = 60;
