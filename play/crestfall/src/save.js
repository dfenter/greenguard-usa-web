// R6 (ledger): save system design.
//
// No save/load existed anywhere in `src` before this (see
// reviews/sol_port_spec_review_2026-07-18.md "no save or load
// implementation exists"). This module is the normative save format and
// implementation: a versioned JSON document covering player stats, spells,
// palace flags (crystals collected — palace state itself is not
// re-simulated, only crystal count), position, and all four RNG stream
// states (worldRng/combatRng/townRng/fxRng), so a restored game continues
// producing the exact same draw sequence a live game would have.
//
// Design choices (documented, not hidden):
//  - Save is defined for STATE.OVERWORLD, STATE.TITLE, STATE.GAMEOVER and
//    STATE.WIN. Saving mid-SIDEVIEW/TOWN still captures full player state,
//    but load always resumes on the OVERWORLD at the player's last
//    overworld position — palace/field/town room state is transient
//    session state, not part of the save contract (matches the original
//    classic password/save convention of never resuming inside a room).
//  - RNG stream state is the raw 32-bit LCG state integer (SeededRng
//    getState()/setState()), not the seed — this preserves stream
//    POSITION, which is what parity/determinism actually depends on.
//
// Supported I/O: localStorage (browser), and an explicit export/import
// JSON string pair (used by the ?save=<json> URL param in game.js and by
// the scenario harness, which has no UI to click a button).

import { worldRng, combatRng, townRng, fxRng } from './rng.js';
import { STATE, SPELLS } from './constants.js';
import { WESTERN_MAP, EASTERN_MAP } from './map-data.js';

export const SAVE_VERSION = 1;
const STORAGE_KEY = 'crestfall.save.v1';

const PLAYER_FIELDS = [
  'x', 'y', 'w', 'h', 'vx', 'vy', 'facing', 'onGround', 'state',
  'attackTimer', 'attackDuration', 'iframes', 'damageTimer',
  'walkFrame', 'walkTimer',
  'lives', 'atkLvl', 'magLvl', 'lifLvl', 'xp', 'score',
  'maxHp', 'hp', 'maxMp', 'mp',
  'lifeContainers', 'magicContainers',
  'selectedSpell', 'keys', 'crystals', 'sigilFragments', 'owX', 'owY',
  'claimedRewards', 'defeatedEnemies',
];

const PLAYER_STATES = new Set(['stand', 'walk', 'jump', 'fall', 'crouch', 'attack', 'attackup', 'attackdown', 'damage', 'dead']);
const DURATION_SPELLS = new Set(['SHIELD', 'JUMP', 'FAIRY', 'REFLECT']);

function assert(condition, message) {
  if (!condition) throw new Error(`save: ${message}`);
}

function finiteNumber(value, min, max, message) {
  assert(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, message);
}

function integer(value, min, max, message) {
  assert(Number.isInteger(value) && value >= min && value <= max, message);
}

function validateFlagMap(value, message) {
  assert(value && typeof value === 'object' && !Array.isArray(value), message);
  for (const [key, flag] of Object.entries(value)) {
    assert(typeof key === 'string' && /^[a-z0-9:_-]+$/i.test(key) && typeof flag === 'boolean', `${message} entry`);
  }
}

function assertValidSave(data) {
  assert(data && typeof data === 'object' && !Array.isArray(data), 'not an object');
  assert(data.version === SAVE_VERSION, `unsupported version ${data.version} (expected ${SAVE_VERSION})`);
  integer(data.seed, 0, 0xFFFFFFFF, 'invalid seed');
  assert(Object.values(STATE).includes(data.state), 'invalid game state');
  integer(data.tutorialStep, 0, 4, 'invalid tutorialStep');
  integer(data.bestScore, 0, 1000000000, 'invalid bestScore');
  assert(data.player && typeof data.player === 'object' && !Array.isArray(data.player), 'missing player section');
  assert(data.rng && typeof data.rng === 'object' && !Array.isArray(data.rng), 'missing rng section');
  assert(data.overworld && (data.overworld.region === 'west' || data.overworld.region === 'east'), 'invalid overworld section');

  for (const field of PLAYER_FIELDS) assert(Object.prototype.hasOwnProperty.call(data.player, field), `missing player.${field}`);
  const p = data.player;
  finiteNumber(p.x, -64, 256, 'invalid player.x');
  finiteNumber(p.y, -64, 320, 'invalid player.y');
  integer(p.w, 1, 64, 'invalid player.w');
  integer(p.h, 1, 64, 'invalid player.h');
  finiteNumber(p.vx, -32, 32, 'invalid player.vx');
  finiteNumber(p.vy, -32, 32, 'invalid player.vy');
  assert(p.facing === -1 || p.facing === 1, 'invalid player.facing');
  assert(typeof p.onGround === 'boolean', 'invalid player.onGround');
  assert(PLAYER_STATES.has(p.state), 'invalid player.state');
  integer(p.attackTimer, 0, 120, 'invalid player.attackTimer');
  integer(p.attackDuration, 1, 120, 'invalid player.attackDuration');
  integer(p.iframes, 0, 120, 'invalid player.iframes');
  integer(p.damageTimer, 0, 60, 'invalid player.damageTimer');
  integer(p.walkFrame, 0, 8, 'invalid player.walkFrame');
  integer(p.walkTimer, 0, 120, 'invalid player.walkTimer');
  integer(p.lives, 0, 3, 'invalid player.lives');
  for (const attr of ['atkLvl', 'magLvl', 'lifLvl']) integer(p[attr], 1, 8, `invalid player.${attr}`);
  integer(p.xp, 0, 1000000, 'invalid player.xp');
  integer(p.score, 0, 1000000000, 'invalid player.score');
  integer(p.lifeContainers, 1, 8, 'invalid player.lifeContainers');
  integer(p.magicContainers, 1, 8, 'invalid player.magicContainers');
  integer(p.maxHp, 1, 512, 'invalid player.maxHp');
  integer(p.hp, 0, p.maxHp, 'invalid player.hp');
  integer(p.maxMp, 1, 256, 'invalid player.maxMp');
  integer(p.mp, 0, p.maxMp, 'invalid player.mp');
  assert(p.maxHp === p.lifeContainers * (p.lifLvl * 2 + 8), 'inconsistent player.maxHp');
  assert(p.maxMp === p.magicContainers * (p.magLvl + 4), 'inconsistent player.maxMp');
  assert(p.selectedSpell === null || Object.prototype.hasOwnProperty.call(SPELLS, p.selectedSpell), 'invalid player.selectedSpell');
  integer(p.keys, 0, 99, 'invalid player.keys');
  integer(p.crystals, 0, 7, 'invalid player.crystals');
  integer(p.sigilFragments, 0, 21, 'invalid player.sigilFragments');
  integer(p.owX, 0, 19, 'invalid player.owX');
  integer(p.owY, 0, 15, 'invalid player.owY');
  validateFlagMap(p.claimedRewards, 'invalid player.claimedRewards');
  validateFlagMap(p.defeatedEnemies, 'invalid player.defeatedEnemies');
  assert(p.spells && typeof p.spells === 'object' && !Array.isArray(p.spells), 'invalid player.spells');
  for (const [name, known] of Object.entries(p.spells)) {
    assert(Object.prototype.hasOwnProperty.call(SPELLS, name) && known === true, 'invalid player.spells entry');
  }
  assert(p.activeSpells && typeof p.activeSpells === 'object' && !Array.isArray(p.activeSpells), 'invalid player.activeSpells');
  for (const [name, frames] of Object.entries(p.activeSpells)) {
    assert(DURATION_SPELLS.has(name), 'invalid player.activeSpells entry');
    integer(frames, 0, 600, 'invalid player.activeSpells duration');
  }
  for (const name of ['worldRng', 'combatRng', 'townRng', 'fxRng']) integer(data.rng[name], 1, 0xFFFFFFFF, `invalid rng.${name}`);
  return true;
}

export function isValidSave(data) {
  try {
    return assertValidSave(data);
  } catch (_error) {
    return false;
  }
}

export function serializeGame(game) {
  const p = game.player;
  return {
    version: SAVE_VERSION,
    seed: game.seed,
    state: game.state,
    tutorialStep: Number.isInteger(game.tutorialStep) ? game.tutorialStep : 4,
    bestScore: Number.isInteger(game.bestScore) ? game.bestScore : p.score,
    player: {
      ...Object.fromEntries(PLAYER_FIELDS.map(k => [k, p[k]])),
      spells: { ...p.spells },
      activeSpells: { ...p.activeSpells },
    },
    overworld: {
      region: game.overworld.region,
    },
    rng: {
      worldRng: worldRng.getState(),
      combatRng: combatRng.getState(),
      townRng: townRng.getState(),
      fxRng: fxRng.getState(),
    },
  };
}

export function deserializeGame(game, data) {
  assertValidSave(data);

  const p = game.player;
  for (const k of PLAYER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data.player, k)) {
      p[k] = data.player[k];
    }
  }
  p.spells = { ...(data.player.spells || {}) };
  p.activeSpells = { ...(data.player.activeSpells || {}) };
  // Runtime-only fields that must not leak stale values across a load.
  p.swordActive = false;
  p.swordBox = null;
  p.fireballs = [];
  p.arcBolts = [];
  p.thunderPulse = false;
  p.swordBeam = null;
  p.runeCooldowns = {};
  p.iframes = 0;
  p.damageTimer = 0;
  p._pendingLevelUp = [];

  if (data.overworld) {
    game.overworld.region = data.overworld.region === 'east' ? 'east' : 'west';
    game.overworld.map = game.overworld.region === 'east' ? EASTERN_MAP : WESTERN_MAP;
  }

  worldRng.setState(data.rng.worldRng);
  combatRng.setState(data.rng.combatRng);
  townRng.setState(data.rng.townRng);
  fxRng.setState(data.rng.fxRng);
  game.seed = data.seed;
  game.tutorialStep = data.tutorialStep;
  game.bestScore = Math.max(game.bestScore || 0, data.bestScore);

  // Load always resumes on the overworld (see module header).
  game.state = STATE.OVERWORLD;
  game.paused = false;
  game.levelUpScreen = false;
  game.palaceClearTimer = null;
}

export function saveToLocalStorage(game, key = STORAGE_KEY) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, JSON.stringify(serializeGame(game)));
    return true;
  } catch (_e) {
    return false;
  }
}

export function loadFromLocalStorage(game, key = STORAGE_KEY) {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    deserializeGame(game, JSON.parse(raw));
    return true;
  } catch (_e) {
    return false;
  }
}

export function exportSave(game) {
  return JSON.stringify(serializeGame(game));
}

export function importSave(game, json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  deserializeGame(game, data);
}

// Resolve a ?save=<encoded-json> URL param into a parsed save object, or
// null. Safe to call in non-browser (Node) contexts.
export function resolveSaveFromURL() {
  try {
    if (typeof location !== 'undefined' && location.search) {
      const params = new URLSearchParams(location.search);
      const raw = params.get('save');
      if (raw !== null) return JSON.parse(raw);
    }
  } catch (_e) {
    // no-op: fall through
  }
  return null;
}
