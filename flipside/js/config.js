// FLIPSIDE shared constants (v5 CUBE). Authoritative — lanes import, never edit.
export const COLS = 10;                 // face width (FACE_W alias below)
export const ROWS = 20;
export const FACES = ['sun', 'dusk', 'ink', 'dawn'];
export const FACE_W = 10;
export const RING_COLS = 36;            // 4 faces x 9 + shared edge columns
export const SEAM_W_CELLS = 1.2;        // rendered width of each fold seam
export const QUEUE_LEN = 5;
export const LOCK_DELAY_MS = 500;
export const LOCK_RESETS_MAX = 15;
export const DAS_MS = 130;
export const ARR_MS = 30;
export const SOFT_DROP_FACTOR = 20;
export const FOLD_MS = 500;             // fold animation duration
export const FLIP_REDUCED_MS = 200;
export const PRISM_BAG_EVERY = 3;
export const LINES_PER_PHASE = 6;
export const WIN_PHASE = 9;
export const RING_CLEAR_SCORE = 2000;   // x phase

export function ringCol(face, c) {
  return ((face * 9 + c) % RING_COLS + RING_COLS) % RING_COLS;
}

// phase: gravity ms per row, fester: garbage to an unseen face every N locks
export const PHASES = {
  1: { gravMs: 800, festerEvery: 12 },
  2: { gravMs: 650, festerEvery: 11 },
  3: { gravMs: 520, festerEvery: 10 },
  4: { gravMs: 420, festerEvery: 9 },
  5: { gravMs: 340, festerEvery: 8 },
  6: { gravMs: 270, festerEvery: 7 },
  7: { gravMs: 210, festerEvery: 6 },
  8: { gravMs: 160, festerEvery: 6 },
  9: { gravMs: 130, festerEvery: 5 },
};

export const SCORE_LINES = { 1: 100, 2: 300, 3: 500, 4: 800 };
export const COMBO_SCORE = 50;

export function nextFace(f, dir) { return ((f + dir) % 4 + 4) % 4; }
export function other(w) {          // legacy helper: the face opposite
  const i = FACES.indexOf(w);
  return i >= 0 ? FACES[(i + 2) % 4] : (w === 'sun' ? 'ink' : 'sun');
}

export const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'soft',
  ArrowUp: 'rotcw', KeyX: 'rotcw', KeyZ: 'rotccw', Space: 'hard',
  KeyC: 'hold', KeyF: 'flip_right', KeyE: 'flip_right',
  KeyQ: 'flip_left', ShiftLeft: 'flip_left', ShiftRight: 'flip_left',
  KeyP: 'pause', Escape: 'pause', KeyM: 'mute',
};

// Art bible palettes (see ART_BIBLE.md) — one per cube face
export const COLORS = {
  sun: {
    paper: '#f6ead2', panel: '#efdfbe', ink: '#4a3f33',
    shadow: 'rgba(74,63,51,0.14)',
    minos: { I:'#57b8c9', O:'#f2c14e', T:'#c98bc9', S:'#8fbf6a',
             Z:'#e2695c', J:'#5f8fd9', L:'#e9964e' },
    garbage: '#b7a98c', garbageEdge: '#8f8163',
  },
  dusk: {
    paper: '#f4d7c3', panel: '#eec5aa', ink: '#5a3a33',
    shadow: 'rgba(90,58,51,0.16)',
    minos: { I:'#4fa8c4', O:'#f0b345', T:'#c77fb4', S:'#96b35c',
             Z:'#de5f4e', J:'#6d7fd0', L:'#e88a3c' },
    garbage: '#c39d7f', garbageEdge: '#9a7a5e',
  },
  ink: {
    paper: '#1b1e34', panel: '#232748', ink: '#cfd6ff',
    shadow: 'rgba(140,180,255,0.25)',
    minos: { I:'#6fe3ff', O:'#ffd76f', T:'#e39bff', S:'#a4f28c',
             Z:'#ff8f80', J:'#8fb4ff', L:'#ffb36f' },
    garbage: '#3a3f66', garbageEdge: '#565d94',
  },
  dawn: {
    paper: '#dcebe2', panel: '#c9dfd2', ink: '#2f4a42',
    shadow: 'rgba(47,74,66,0.15)',
    minos: { I:'#3fb0b8', O:'#e6c050', T:'#b489c9', S:'#7cb96a',
             Z:'#d96b5e', J:'#5b8fc9', L:'#dd9350' },
    garbage: '#a9bfae', garbageEdge: '#83988c',
  },
  seam: '#f7d774',
};
