// FLIPSIDE shared constants. Authoritative — lanes import, never edit.
export const COLS = 10;
export const ROWS = 20;
export const QUEUE_LEN = 5;
export const LOCK_DELAY_MS = 500;
export const LOCK_RESETS_MAX = 15;
export const DAS_MS = 130;
export const ARR_MS = 30;
export const SOFT_DROP_FACTOR = 20;
export const FLIP_MS = 450;
export const FLIP_REDUCED_MS = 200;
export const FLIP3D_MS = 5000;          // max held time in the 3D side view
export const FLIP3D_REFILL_MS = 10000;  // full meter refill while in 2D
export const METER_SEGMENTS = 5;
export const DEPTH_GAP_CELLS = 2.5;     // render-space gap between sheets
export const FLIP_START = 3;
export const FLIP_MAX = 5;
export const CLEARS_PER_CHARGE = 2;
export const FOLDOVER_WINDOW_MS = 2000;
export const FOLDOVER_MULT = 1.5;
export const B2B_MULT = 1.5;
export const PRISM_BAG_EVERY = 3;      // every 3rd bag contains a prism
export const LINES_PER_PHASE = 6;
export const WIN_PHASE = 9;

// phase: gravity ms per row, fester: garbage to the far world every N locks
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

export function other(w) { return w === 'sun' ? 'ink' : 'sun'; }

export const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'soft',
  ArrowUp: 'rotcw', KeyX: 'rotcw', KeyZ: 'rotccw', Space: 'hard',
  KeyC: 'hold', KeyF: 'flip', ShiftLeft: 'flip', ShiftRight: 'flip',
  KeyP: 'pause', Escape: 'pause', KeyM: 'mute',
};

// Art bible palettes (see ART_BIBLE.md)
export const COLORS = {
  sun: {
    paper: '#f6ead2', panel: '#efdfbe', ink: '#4a3f33',
    shadow: 'rgba(74,63,51,0.14)',
    minos: { I:'#57b8c9', O:'#f2c14e', T:'#c98bc9', S:'#8fbf6a',
             Z:'#e2695c', J:'#5f8fd9', L:'#e9964e' },
    garbage: '#b7a98c', garbageEdge: '#8f8163',
  },
  ink: {
    paper: '#1b1e34', panel: '#232748', ink: '#cfd6ff',
    shadow: 'rgba(140,180,255,0.25)',
    minos: { I:'#6fe3ff', O:'#ffd76f', T:'#e39bff', S:'#a4f28c',
             Z:'#ff8f80', J:'#8fb4ff', L:'#ffb36f' },
    garbage: '#3a3f66', garbageEdge: '#565d94',
  },
  seam: '#f7d774',
};

export const FOLD_MS = 700;             // v4 fold animation duration
