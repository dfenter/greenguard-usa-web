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
//    NES password/save convention of never resuming inside a room).
//  - RNG stream state is the raw 32-bit LCG state integer (SeededRng
//    getState()/setState()), not the seed — this preserves stream
//    POSITION, which is what parity/determinism actually depends on.
//
// Supported I/O: localStorage (browser), and an explicit export/import
// JSON string pair (used by the ?save=<json> URL param in game.js and by
// the Phase 0.5 scenario harness, which has no UI to click a button).

import { worldRng, combatRng, townRng, fxRng } from './rng.js';
import { STATE } from './constants.js';
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
  'selectedSpell', 'keys', 'crystals', 'owX', 'owY',
];

export function serializeGame(game) {
  const p = game.player;
  return {
    version: SAVE_VERSION,
    seed: game.seed,
    state: game.state,
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
  if (!data || typeof data !== 'object') {
    throw new Error('save: not an object');
  }
  if (data.version !== SAVE_VERSION) {
    throw new Error(`save: unsupported version ${data.version} (expected ${SAVE_VERSION})`);
  }
  if (!data.player || !data.rng) {
    throw new Error('save: missing required "player" or "rng" section');
  }

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
  p.swordBeam = null;
  p._pendingLevelUp = [];

  if (data.overworld) {
    game.overworld.region = data.overworld.region === 'east' ? 'east' : 'west';
    game.overworld.map = game.overworld.region === 'east' ? EASTERN_MAP : WESTERN_MAP;
  }

  worldRng.setState(data.rng.worldRng);
  combatRng.setState(data.rng.combatRng);
  townRng.setState(data.rng.townRng);
  fxRng.setState(data.rng.fxRng);

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
